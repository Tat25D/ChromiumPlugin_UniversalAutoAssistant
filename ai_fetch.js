// ai_fetch.js — скрытое окно Google, опрос и возврат ответа.
// ВСЕ ИИ-запросы (отчёт/сравнение) идут через ОЧЕРЕДЬ concurrency=1:
// одновременно существует не больше одного скрытого окна Google.
self.BackgroundAI = self.BackgroundAI || {};

//=====================================================
// Склеивание "вертикальных" цифр из innerText Google
//=====================================================
function glueVerticalDigits(t) {
  if (!t) return t;
  var prev;
  do {
    prev = t;
    t = t.replace(/(\d)\n([\d.,])/g, '$1$2').replace(/([.,])\n(\d)/g, '$1$2');
  } while (t !== prev);
  return t;
}

//=====================================================
// Локальная чистка текста — использует маркеры из opts
//=====================================================
function cleanAiTextLocal(t, opts) {
  if (!t) return '';

  const startMarker = (opts && opts.aiMarkerStart) || AI_MARKER_START;
  const endMarker = (opts && opts.aiMarkerEnd) || AI_MARKER_END;

  let maxLen = parseFloat(opts && opts.aiMaxTextLen);
  if (!isFinite(maxLen) || maxLen <= 0) maxLen = AI_MAX_TEXT_LEN;
  maxLen = Math.max(maxLen, 20000);

  t = t.split(startMarker).join('');

  const idx = t.indexOf(endMarker);
  if (idx !== -1) t = t.slice(0, idx);

  t = glueVerticalDigits(t);

  return t.replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLen);
}

//=====================================================
// Реестр скрытых окон (общая уборка при старте SW)
//=====================================================
function registerHiddenWindow(id) {
  return chrome.storage.session.get({ aiHiddenWindows: [] }).then(function (r) {
    const ids = r.aiHiddenWindows || [];
    if (ids.indexOf(id) === -1) ids.push(id);
    return chrome.storage.session.set({ aiHiddenWindows: ids });
  }).catch(function () {});
}

function unregisterHiddenWindow(id) {
  return chrome.storage.session.get({ aiHiddenWindows: [] }).then(function (r) {
    const ids = (r.aiHiddenWindows || []).filter(function (x) { return x !== id; });
    return chrome.storage.session.set({ aiHiddenWindows: ids });
  }).catch(function () {});
}

//=====================================================
// ОЧЕРЕДЬ ИИ-ЗАПРОСОВ: concurrency=1
//=====================================================
self.BackgroundAI._fetchQueue = [];
self.BackgroundAI._fetchRunning = false;

self.BackgroundAI.fetchAiPart = function (prompt, label, opts) {
  return new Promise((resolve, reject) => {
    self.BackgroundAI._fetchQueue.push({ prompt: prompt, label: label, opts: opts, resolve: resolve, reject: reject });
    self.BackgroundAI._processFetchQueue();
  });
};

self.BackgroundAI._processFetchQueue = async function () {
  if (this._fetchRunning) return;
  this._fetchRunning = true;
  while (this._fetchQueue.length) {
    const job = this._fetchQueue.shift();
    try {
      job.resolve(await self.BackgroundAI._fetchAiPartImpl(job.prompt, job.label, job.opts));
    } catch (e) {
      job.reject(e);
    }
  }
  this._fetchRunning = false;
};

//=====================================================
// Реализация запроса: скрытое СВЁРНУТОЕ окно + опрос
//=====================================================
self.BackgroundAI._fetchAiPartImpl = async function (prompt, label, opts) {
  const o = opts || {};

  const debugEnabled = !!o.aiDebug;
  const debugVerbose = !!o.aiDebugVerbose;
  const keepTabsForDebug = !!o.aiDebugKeepTabs;

  const markerStart = (o.aiMarkerStart && String(o.aiMarkerStart)) || AI_MARKER_START;
  const markerEnd = (o.aiMarkerEnd && String(o.aiMarkerEnd)) || AI_MARKER_END;

  let timeoutSec = parseFloat(o.aiTimeoutSec);
  if (!isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = AI_TIMEOUT_DEFAULT;
  const minTimeout = parseFloat(o.aiMinTimeoutSec);
  if (isFinite(minTimeout) && minTimeout > 0 && timeoutSec < minTimeout) timeoutSec = minTimeout;

  const capSec = (parseFloat(o.aiCapSec) > 0) ? parseFloat(o.aiCapSec) : AI_CAP_SEC;
  const pollMs = (parseFloat(o.aiPollMs) > 50) ? parseFloat(o.aiPollMs) : AI_POLL_MS;
  const minLen = (parseFloat(o.aiMinTextLen) > 0) ? parseFloat(o.aiMinTextLen) : AI_MIN_TEXT_LEN;

  self.BackgroundAI._pushed = null;

  const startTs = Date.now();
  const url = 'https://www.google.com/search?hl=ru&udm=50&q=' + encodeURIComponent(prompt);

  let win = null;
  let tabId = null;
  let reloaded = false;
  let policyBlocked = false;
  let capApplied = false;
  let lastInline = null;
  let lastBodyLen = -1;
  let loopCount = 0;
  let watchdog = null;

  if (debugEnabled) {
    console.log('[AI] fetchAiPart start (скрытый режим, очередь)', {
      label: label, timeoutSec: timeoutSec, capSec: capSec, pollMs: pollMs, minLen: minLen,
      markerStart: markerStart, markerEnd: markerEnd, promptLen: prompt.length
    });
  }

  try {
    console.log('AI: запрос в Google — ' + label + ' (таймаут ' + timeoutSec + ' сек, скрытое окно)');

    win = await chrome.windows.create({ url: url, state: 'minimized', focused: false });
    if (win && win.state !== 'minimized') {
      try { await chrome.windows.update(win.id, { state: 'minimized' }); } catch (e) {}
    }
    tabId = (win && win.tabs && win.tabs[0]) ? win.tabs[0].id : null;
    if (!tabId) throw new Error('нет вкладки в скрытом окне');

    await registerHiddenWindow(win.id);

    watchdog = setTimeout(function () {
      try { chrome.windows.remove(win.id); } catch (e) {}
    }, (timeoutSec + capSec + 30) * 1000);

    //--- ждём status=complete (до 20 сек) ---
    await new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (!done) {
          done = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve(v);
        }
      };
      const listener = (id, info) => {
        if (id === tabId && info.status === 'complete') finish(true);
      };
      const timer = setTimeout(() => finish(false), 20000);
      chrome.tabs.onUpdated.addListener(listener);
    });

    //--- inject google_ai_reader.js ---
    try {
      await chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['google_ai_reader.js'] });
    } catch (e) {
      const le = (e && e.message) || String(e);
      if (/ExtensionsSettings|cannot be scripted|policy/i.test(le)) policyBlocked = true;
    }

    await new Promise(r => setTimeout(r, 500));
    const t0 = Date.now();
    let deadline = Date.now() + timeoutSec * 1000;
    let sawError = false;

    //--- главный цикл ожидания ---
    while (Date.now() < deadline) {
      loopCount++;

      // 1) ответ из content script (google_ai_reader.js)
      const pushed = self.BackgroundAI._pushed;
      if (pushed && pushed.text && pushed.ts > startTs) {
        const tabOk = !pushed.tabId || (tabId && pushed.tabId === tabId);
        if (tabOk) {
          const cleaned = cleanAiTextLocal(pushed.text, o);
          if (cleaned.length >= minLen) {
            console.log('AI: ответ получен (content script) — ' + label + ' | длина: ' + cleaned.length);
            return { text: cleaned, status: 'ok', source: 'AI-обзор(content script)', debug: '' };
          }
        }
        self.BackgroundAI._pushed = null;
      }

      // 2) inline-извлечение (allowPartial=false — только завершённый ответ)
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tabId },
          func: self.BackgroundAI.inlineExtract,
          args: [markerStart, markerEnd, minLen, false]
        });
        const rep = res && res[0] && res[0].result;
        if (rep) {
          lastInline = rep;
          if (rep.hasError) sawError = true;

          const bl = rep.debug ? rep.debug.bodyLen : 0;
          const growing = lastBodyLen >= 0 && bl > lastBodyLen + 50;
          lastBodyLen = bl;

          if (growing && !capApplied) {
            capApplied = true;
            deadline = Math.max(deadline, Date.now() + capSec * 1000);
            console.log('AI: генерация идёт — жду до ' + capSec + ' сек — ' + label);
          }

          if (debugEnabled && (debugVerbose || rep.text || (rep.debug && rep.debug.endCount > 0))) {
            console.log('[AI] inlineExtract', {
              loop: loopCount,
              startCount: rep.debug ? rep.debug.startCount : 0,
              endCount: rep.debug ? rep.debug.endCount : 0,
              complete: !!rep.complete,
              bodyLen: bl,
              textLen: rep.text ? rep.text.length : 0
            });
          }

          if (rep.text) {
            const cleaned = cleanAiTextLocal(rep.text, o);
            if (cleaned.length >= minLen) {
              console.log('AI: ответ получен (inline) — ' + label + ' | длина: ' + cleaned.length);
              return { text: cleaned, status: 'ok', source: 'AI-обзор(inline)', debug: JSON.stringify(rep.debug || {}) };
            }
          }
        }
      } catch (e) {
        const le = (e && e.message) || String(e);
        if (/ExtensionsSettings|cannot be scripted|policy/i.test(le)) {
          policyBlocked = true;
          break;
        }
      }

      // 3) reload при ошибке генерации
      if (sawError && !reloaded && Date.now() - t0 > 8000) {
        reloaded = true;
        try { await chrome.tabs.reload(tabId); } catch (e) {}
      }

      await new Promise(r => setTimeout(r, pollMs));
    }

    if (policyBlocked) {
      return {
        text: null, status: 'error', source: 'нет',
        debug: 'Opera блокирует скрипты на Google: opera://extensions → "Доступ к сайтам" → "На всех сайтах"'
      };
    }

    //--- последний шанс: частичный текст после полного таймаута ---
    try {
      const res2 = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: self.BackgroundAI.inlineExtract,
        args: [markerStart, markerEnd, minLen, true]
      });
      const rep2 = res2 && res2[0] && res2[0].result;
      if (rep2 && rep2.text) {
        const cleaned = cleanAiTextLocal(rep2.text, o);
        if (cleaned.length >= minLen) {
          console.warn('AI: ИИ не завершил ответ маркером — отдаю частичный текст — ' + label);
          return { text: cleaned, status: 'partial', source: 'AI-обзор(inline,partial)', debug: JSON.stringify(rep2.debug || {}) };
        }
      }
    } catch (e) {}

    console.warn('AI: ответа нет за отведённое время — ' + label);
    return {
      text: null, status: 'error', source: 'нет',
      debug: 'timeout=' + timeoutSec + 's; cap=' + capApplied + ';' + JSON.stringify(lastInline ? lastInline.debug : null)
    };

  } finally {
    if (watchdog) clearTimeout(watchdog);
    if (win && win.id) {
      const shouldClose = o.closeAiTabs !== false && !keepTabsForDebug;
      if (shouldClose) {
        try { await chrome.windows.remove(win.id); } catch (e) {}
      } else {
        // оставлено для проверки — делаем видимым
        try { await chrome.windows.update(win.id, { state: 'normal' }); } catch (e) {}
        if (debugEnabled) console.log('[AI] окно оставлено для проверки', { winId: win.id });
      }
      await unregisterHiddenWindow(win.id);
    }
  }
};
