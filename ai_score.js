// ai_score.js — фоновый запрос оценки для виджета.
// ОЧЕРЕДЬ concurrency=1 + ФОНОВАЯ вкладка (active:false) — проверенный вариант.
// Лавина при старте браузера предотвращается visibility-гейтом в виджете.
self.BackgroundAI = self.BackgroundAI || {};

//=====================================================
// Очередь оценок: не больше одной фоновой вкладки одновременно
//=====================================================
self.BackgroundAI.scoreQueue = [];
self.BackgroundAI.scoreRunning = false;

self.BackgroundAI.enqueueScore = function (job) {
  this.scoreQueue.push(job);
  this.processScore();
};

self.BackgroundAI.processScore = async function () {
  if (this.scoreRunning) return;
  this.scoreRunning = true;
  while (this.scoreQueue.length) {
    const job = this.scoreQueue.shift();
    try {
      // страховка: задание не может висеть вечно (4 минуты максимум)
      await Promise.race([
        job.run(),
        new Promise(r => setTimeout(r, 240000))
      ]);
    } catch (e) {
      console.warn('[AI-SCORE-QUEUE] error:', e);
    }
  }
  this.scoreRunning = false;
};

//=====================================================
// Приёмник запроса от виджета
//=====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.action !== 'get_ai_score' || !msg.fields) return false;

  self.BackgroundAI.enqueueScore({
    run: async () => {
      try {
        if (typeof self.BackgroundAI.buildScorePrompt !== 'function') {
          sendResponse({ ok: false, score: null, error: 'buildScorePrompt не найден — обновите ai_prompts.js' });
          return;
        }

        const settings = await new Promise((res) => {
          chrome.storage.local.get({ settings: {} }, (r) => {
            res(Object.assign({}, DEFAULT_CONFIG, r.settings || {}));
          });
        });

        const prompt = self.BackgroundAI.buildScorePrompt(
          msg.fields,
          self.BackgroundAI.getRefCar(settings)
        );

        const result = await self.BackgroundAI.fetchAiScore(prompt, settings, msg.timeoutSec);
        sendResponse(result);
      } catch (e) {
        console.warn('[AI-SCORE] ошибка:', e);
        sendResponse({ ok: false, score: null, error: (e && e.message) || String(e) });
      }
    }
  });

  return true; // асинхронный sendResponse
});

//=====================================================
// Запрос оценки: ФОНОВАЯ вкладка + опрос до таймаута
//=====================================================
self.BackgroundAI.fetchAiScore = async function (prompt, settings, timeoutOverrideSec) {
  let timeoutSec = parseFloat(timeoutOverrideSec);
  if (!isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = parseFloat(settings.aiScoreTimeoutSec);
  if (!isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = parseFloat(settings.aiTimeoutSec);
  if (!isFinite(timeoutSec) || timeoutSec <= 0) timeoutSec = AI_TIMEOUT_DEFAULT;

  const pollMs = (parseFloat(settings.aiPollMs) > 50) ? parseFloat(settings.aiPollMs) : 250;
  const url = 'https://www.google.com/search?hl=ru&udm=50&q=' + encodeURIComponent(prompt);

  let tab = null;
  console.log('[AI-SCORE] попытка запроса, таймаут ' + timeoutSec + ' сек');

  try {
    tab = await chrome.tabs.create({ url: url, active: false });

    const deadline = Date.now() + timeoutSec * 1000;

    while (Date.now() < deadline) {
      let r = null;
      try {
        const res = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: self.BackgroundAI.inlineExtractScore
        });
        r = res && res[0] && res[0].result;
      } catch (e) {
        // страница ещё не готова — просто ждём дальше
      }

      if (r && typeof r.score === 'number') {
        console.log('[AI-SCORE] оценка получена: ', r.score);
        return { ok: true, score: r.score };
      }

      await new Promise(rr => setTimeout(rr, pollMs));
    }

    console.warn('[AI-SCORE] таймаут попытки (' + timeoutSec + ' сек), оценка не найдена');
    return { ok: false, score: null, error: 'timeout' };

  } finally {
    // техническая вкладка — закрываем всегда
    if (tab && tab.id) {
      try { await chrome.tabs.remove(tab.id); } catch (e) {}
    }
  }
};

//=====================================================
// Выполняется ВНУТРИ вкладки Google. Ищет ЧИСЛОВУЮ оценку.
//=====================================================
self.BackgroundAI.inlineExtractScore = function () {
  const body = document.body ? (document.body.textContent || '') : '';
  if (!body) return { score: null };

  // Склеиваем разорванные цифры
  let flat = body;
  let prev;
  do {
    prev = flat;
    flat = flat.replace(/(\d)\n([\d.,])/g, '$1$2').replace(/([.,])\n(\d)/g, '$1$2');
  } while (flat !== prev);

  let m;

  // 1. Ищем "Оценка... X.X" (даже если слово склеилось: "ОЦЕНКАОценка: 7.2")
  // [^\d]{0,30} пропускает любые не-цифровые символы (эмодзи, двоеточия, текст) между словом и числом
  m = flat.match(/оценка[^\d]{0,30}(\d{1,2})[.,](\d)/i);
  if (m) {
    let val = parseInt(m[1], 10) + parseInt(m[2], 10) / 10;
    if (val > 1.0 && val <= 10) return { score: Math.round(val * 10) / 10 };
  }

  // 2. Ищем "X.X из 10" (например: "7.2 из 10.0")
  m = flat.match(/(\d{1,2})[.,](\d)\s*из\s*10/i);
  if (m) {
    let val = parseInt(m[1], 10) + parseInt(m[2], 10) / 10;
    if (val > 1.0 && val <= 10) return { score: Math.round(val * 10) / 10 };
  }

  // 3. Фолбэк: последнее число с запятой в конце текста (игнорируя 0.0 и 1.0)
  const tail = flat.slice(-500); // Оценка почти всегда в конце
  const re = /(\d{1,2})[.,](\d)/g;
  let lastValid = null;
  while ((m = re.exec(tail)) !== null) {
    let val = parseInt(m[1], 10) + parseInt(m[2], 10) / 10;
    if (val > 1.0 && val <= 10) {
      lastValid = val;
    }
  }
  if (lastValid !== null) {
    return { score: Math.round(lastValid * 10) / 10 };
  }

  // Возвращаем null, чтобы виджет сделал автоповтор (не цепляем 1.0)
  return { score: null };
};
