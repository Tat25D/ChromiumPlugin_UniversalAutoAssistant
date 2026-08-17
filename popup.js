// popup.js — интерфейс попапа: основной вид + продвинутые настройки + диагностика
const STATUS_RU={
  queued: 'в очереди', ai: 'жду ответ ИИ...', photos: 'скачиваю фото...',
  zip: 'собираю ZIP...', done: 'готово', error: 'ошибка', canceled: 'отменено'
};
const SITE_URLS={ avito: 'https://www.avito.ru/all/avtomobili', drom: 'https://auto.drom.ru/', autoru: 'https://auto.ru/cars/used/' };

let lastJobs=[];

function escapeHtml(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }

function fmtSec(ms) { return Math.max(0, Math.round(ms / 1000)) + 'с'; }

function renderQueue(jobs) {
  lastJobs=jobs || [];
  const box=document.getElementById('queueBox'), list=document.getElementById('queueList');
  if (!box || !list) return;
  if (!lastJobs.length) { box.style.display='none'; return; }
  box.style.display='block';
  list.innerHTML=lastJobs.map(j=> {
    const el=j.startedAt ? ' · ' + fmtSec(Date.now() - j.startedAt) : '';
    const can=(j.status === 'queued' || j.status === 'ai' || j.status === 'photos' || j.status === 'zip' || j.status === 'loading') ? ' <button class="qbtn" data-cancel="' + j.id + '">отменить</button>' : '';
    return '<div class="qitem">• ' + escapeHtml(j.label) + ' — <b>' + (STATUS_RU[j.status] || j.status) + '</b>' + el + can + '</div>';
  }).join('');
}

function loadSettings(cb) { chrome.storage.local.get({ settings: {} }, r=> cb(Object.assign({}, DEFAULT_CONFIG, r.settings || {}))); }
function saveSettings(s) { chrome.storage.local.set({ settings: s }); }
function safeNum(v, def) { const n=parseFloat(v); return (isFinite(n) && n >= 0) ? n : def; }

chrome.runtime.onMessage.addListener(m=> { if (m && m.action === 'queue_update') renderQueue(m.jobs); });

document.addEventListener('DOMContentLoaded', ()=> {
  document.getElementById('hotkeyLabel').textContent=HOTKEY_DEFAULT;

  const sel=document.getElementById('selCompare');
  Object.keys(COMPARE_CARS).forEach(k=> {
    const o=document.createElement('option');
    o.value=k;
    o.textContent=COMPARE_CARS[k].name + ' (' + COMPARE_CARS[k].years + ')';
    sel.appendChild(o);
  });

  chrome.runtime.sendMessage({ action: 'queue_status' }, r=> { if (r && r.jobs) renderQueue(r.jobs); });

  setInterval(()=> {
    const box=document.getElementById('queueBox');
    if (box && box.style.display !== 'none' && lastJobs.length) renderQueue(lastJobs);
  }, 1000);

  document.getElementById('queueList').addEventListener('click', (e)=> {
    const id=e.target && e.target.getAttribute ? e.target.getAttribute('data-cancel') : null;
    if (id) chrome.runtime.sendMessage({ action: 'queue_cancel', id: id });
  });

  const viewMain=document.getElementById('viewMain'), viewSettings=document.getElementById('viewSettings');
  const chkPh=document.getElementById('chkSavePhotos'), chkRep=document.getElementById('chkAiReport'),
  chkCmp=document.getElementById('chkAiCompare'), chkScore=document.getElementById('chkAiScore'),
  chkCls=document.getElementById('chkCloseAiTabs');
  const chkPhotoAlways=document.getElementById('chkPhotoAlways');
  const advTimeout=document.getElementById('advTimeout'), advCap=document.getElementById('advCap'),
  advMinTimeout=document.getElementById('advMinTimeout'), advPoll=document.getElementById('advPoll'),
  advMinLen=document.getElementById('advMinLen'), advMaxLen=document.getElementById('advMaxLen'),
  advMarkerStart=document.getElementById('advMarkerStart'), advMarkerEnd=document.getElementById('advMarkerEnd'),
  advDebug=document.getElementById('advDebug'), advDebugVerbose=document.getElementById('advDebugVerbose'),
  advDebugKeepTabs=document.getElementById('advDebugKeepTabs');

  function fill(s) {
    chkPh.checked=s.savePhotos !== false;
    chkRep.checked=!!s.aiReport;
    chkCmp.checked=!!s.aiCompare;
    chkScore.checked=!!s.aiScore;
    chkPhotoAlways.checked=!!s.photoAlways;
    chkCls.checked=s.closeAiTabs !== false;
    sel.value=s.compare || DEFAULT_COMPARE_CAR;
    advTimeout.value=safeNum(s.aiTimeoutSec, AI_TIMEOUT_DEFAULT);
    advCap.value=safeNum(s.aiCapSec, AI_CAP_SEC);
    advMinTimeout.value=safeNum(s.aiMinTimeoutSec, AI_MIN_TIMEOUT_SEC);
    advPoll.value=safeNum(s.aiPollMs, AI_POLL_MS);
    advMinLen.value=safeNum(s.aiMinTextLen, AI_MIN_TEXT_LEN);
    advMaxLen.value=safeNum(s.aiMaxTextLen, AI_MAX_TEXT_LEN);
    advMarkerStart.value=s.aiMarkerStart || AI_MARKER_START;
    advMarkerEnd.value=s.aiMarkerEnd || AI_MARKER_END;
    advDebug.checked=!!s.aiDebug;
    advDebugVerbose.checked=!!s.aiDebugVerbose;
    advDebugKeepTabs.checked=!!s.aiDebugKeepTabs;

    // ПОЛЗУНКИ
    var rangeMA = document.getElementById('rangeMileageAdjust');
    var valMA = document.getElementById('mileageAdjustVal');
    if (rangeMA) {
      rangeMA.value = Number(s.mileageAdjust) || 0;
      valMA.textContent = (Number(s.mileageAdjust) > 0 ? '+' : '') + rangeMA.value + ' тыс. км';
    }

    var rangeH = document.getElementById('rangeHistoryAdd');
    var valH = document.getElementById('historyAddVal');
    if (rangeH) {
      rangeH.value = Number(s.historyAdd) || 0;
      valH.textContent = rangeH.value;
    }
  }

  loadSettings(fill);

  function persist() {
    saveSettings({
      savePhotos: chkPh.checked, aiReport: chkRep.checked, aiCompare: chkCmp.checked,
      aiScore: chkScore.checked, photoAlways: chkPhotoAlways.checked, closeAiTabs: chkCls.checked, compare: sel.value,
      aiTimeoutSec: safeNum(advTimeout.value, AI_TIMEOUT_DEFAULT),
      aiCapSec: safeNum(advCap.value, AI_CAP_SEC),
      aiMinTimeoutSec: safeNum(advMinTimeout.value, AI_MIN_TIMEOUT_SEC),
      aiPollMs: safeNum(advPoll.value, AI_POLL_MS),
      aiMinTextLen: safeNum(advMinLen.value, AI_MIN_TEXT_LEN),
      aiMaxTextLen: safeNum(advMaxLen.value, AI_MAX_TEXT_LEN),
      aiMarkerStart: advMarkerStart.value.trim() || AI_MARKER_START,
      aiMarkerEnd: advMarkerEnd.value.trim() || AI_MARKER_END,
      aiDebug: advDebug.checked, aiDebugVerbose: advDebugVerbose.checked, aiDebugKeepTabs: advDebugKeepTabs.checked,
      mileageAdjust: Number(document.getElementById('rangeMileageAdjust').value) || 0,
      historyAdd: Number(document.getElementById('rangeHistoryAdd').value) || 0
    });
  }

  [chkPh, chkRep, chkCmp, chkScore, chkPhotoAlways, chkCls, sel].forEach(el=> el.addEventListener('change', persist));
  [advTimeout, advCap, advMinTimeout, advPoll, advMinLen, advMaxLen, advDebug, advDebugVerbose, advDebugKeepTabs].forEach(el=> el.addEventListener('change', persist));
  [advMarkerStart, advMarkerEnd].forEach(el=> el.addEventListener('blur', persist));

  document.getElementById('btnOpenSettings').addEventListener('click', ()=> {
    viewMain.classList.add('hidden'); viewSettings.classList.remove('hidden');
  });
  document.getElementById('btnBack').addEventListener('click', ()=> {
    persist(); viewSettings.classList.add('hidden'); viewMain.classList.remove('hidden');
  });
  document.getElementById('btnReset').addEventListener('click', ()=> {
    if (!confirm('Сбросить все настройки к заводским?')) return;
    chrome.storage.local.remove('settings', ()=> loadSettings(fill));
  });

  document.querySelectorAll('.btn-site').forEach(b=> b.addEventListener('click', ()=> {
    const u=SITE_URLS[b.getAttribute('data-site')];
    if (u) chrome.tabs.create({ url: u, active: true }, ()=> setTimeout(()=> window.close(), 100));
  }));

  document.getElementById('btnDiag').addEventListener('click', async ()=> {
    const box=document.getElementById('diagBox');
    box.style.display='block';
    box.innerHTML='<div class="qtitle">Диагностика...</div>';
    const lines=[];

    try {
      const d=await chrome.runtime.sendMessage({ action: 'diag' });
      lines.push(' Фон v' + d.version + ' · очередь: ' + d.queue + ' · скрытых окон: ' + d.hiddenWindows);
    } catch (e) {
      lines.push(' Фон: нет ответа (перезагрузите расширение)');
    }

    const [tab]=await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && /avito\.ru|drom\.ru|auto\.ru/.test(tab.url)) {
      try {
        const resp=await new Promise(res=> {
          chrome.tabs.sendMessage(tab.id, { action: 'ping' }, r=> {
            if (chrome.runtime.lastError) res(null); else res(r);
          });
        });
        if (resp && resp.ok) lines.push(' Content-скрипт: ' + resp.site);
        else lines.push(' Content-скрипт: не отвечает (нажмите F5 на странице)');
      } catch (e) {
        lines.push(' Content-скрипт: не отвечает (нажмите F5 на странице)');
      }
    } else {
      lines.push(' Текущая вкладка — не поддерживаемый сайт');
    }

    box.innerHTML='<div class="qtitle">Диагностика</div>' + lines.map(l=> '<div class="qitem">' + l + '</div>').join('');
  });

  async function getCarData(settings) {
    const [tab]=await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) { alert('Откройте страницу объявления.'); return null; }
    if (!/avito\.ru|drom\.ru|auto\.ru/.test(tab.url)) { alert('Плагин работает только на Avito, Дром или Авто.ру.'); return null; }
    return new Promise(res=> {
      chrome.tabs.sendMessage(tab.id, { action: 'parse_data', options: settings }, r=> {
        if (chrome.runtime.lastError || !r) { alert('Не удалось считать данные. Обновите страницу (F5).'); res(null); }
        else res(r);
      });
    });
  }

  document.getElementById('btnSave').addEventListener('click', async ()=> {
    const s=await new Promise(r=> loadSettings(r));
    const d=await getCarData(s);
    if (d) chrome.runtime.sendMessage({ action: 'download_xml', data: d, options: s });
  });

  document.getElementById('btnAiReport').addEventListener('click', async ()=> {
    const b=document.getElementById('btnAiReport'); b.disabled=true;
    const s=await new Promise(r=> loadSettings(r));
    const d=await getCarData({ savePhotos: false });
    if (!d) { b.disabled=false; return; }
    chrome.runtime.sendMessage({
      action: 'open_ai_report',
      prompt: window.BackgroundAI.buildInteractiveReportPrompt(d.db_fields, window.BackgroundAI.getRefCar(s)),
      userInitiated: true
    }, r=> {
      if (chrome.runtime.lastError || !r || !r.ok) alert('Не удалось открыть отчёт AI: ' + ((r && r.error) || 'ошибка'));
      b.disabled=false;
    });
  });

  document.getElementById('btnAiCompare').addEventListener('click', async ()=> {
    const b=document.getElementById('btnAiCompare'); b.disabled=true;
    const d=await getCarData({ savePhotos: false });
    if (!d) { b.disabled=false; return; }
    const cmp=COMPARE_CARS[sel.value] || COMPARE_CARS[DEFAULT_COMPARE_CAR];
    chrome.runtime.sendMessage({
      action: 'open_ai_compare',
      prompt: window.BackgroundAI.buildInteractiveComparePrompt(d.db_fields, cmp),
      userInitiated: true
    }, r=> {
      if (chrome.runtime.lastError || !r || !r.ok) alert('Не удалось открыть сравнение AI: ' + ((r && r.error) || 'ошибка'));
      b.disabled=false;
    });
  });

  document.getElementById('btnAiCheck').addEventListener('click', async ()=> {
    const b=document.getElementById('btnAiCheck'); b.disabled=true;
    const d=await getCarData({ savePhotos: false });
    if (!d) { b.disabled=false; return; }
    chrome.runtime.sendMessage({
      action: 'open_ai_check',
      prompt: window.BackgroundAI.buildInteractiveCheckPrompt(d.db_fields),
      userInitiated: true
    }, r=> {
      if (chrome.runtime.lastError || !r || !r.ok) alert('Не удалось открыть проверку: ' + ((r && r.error) || 'ошибка'));
      b.disabled=false;
    });
  });

  document.getElementById('btnAiProblems').addEventListener('click', async ()=> {
    const b=document.getElementById('btnAiProblems'); b.disabled=true;
    const d=await getCarData({ savePhotos: false });
    if (!d) { b.disabled=false; return; }
    chrome.runtime.sendMessage({
      action: 'open_ai_problems',
      prompt: window.BackgroundAI.buildInteractiveProblemsPrompt(d.db_fields),
      userInitiated: true
    }, r=> {
      if (chrome.runtime.lastError || !r || !r.ok) alert('Не удалось открыть отчёт о проблемности: ' + ((r && r.error) || 'ошибка'));
      b.disabled=false;
    });
  });

  document.getElementById('btnAiRegistration').addEventListener('click', async ()=> {
    const b=document.getElementById('btnAiRegistration'); b.disabled=true;
    const d=await getCarData({ savePhotos: false });
    if (!d) { b.disabled=false; return; }
    chrome.runtime.sendMessage({
      action: 'open_ai_registration',
      prompt: window.BackgroundAI.buildInteractiveRegistrationPrompt(d.db_fields),
      userInitiated: true
    }, r=> {
      if (chrome.runtime.lastError || !r || !r.ok) alert('Не удалось открыть инструкцию по оформлению: ' + ((r && r.error) || 'ошибка'));
      b.disabled=false;
    });
  });

  //====== ПОЛЗУНКИ ======
  function updateMileageAdjustLabel() {
    var r = document.getElementById('rangeMileageAdjust');
    var val = Number(r.value);
    document.getElementById('mileageAdjustVal').textContent = (val > 0 ? '+' : '') + val + ' тыс. км';
  }
  document.getElementById('rangeMileageAdjust').addEventListener('input', updateMileageAdjustLabel);
  document.getElementById('rangeMileageAdjust').addEventListener('change', persist);

  function updateHistoryLabel() {
    var r = document.getElementById('rangeHistoryAdd');
    document.getElementById('historyAddVal').textContent = r.value;
  }
  document.getElementById('rangeHistoryAdd').addEventListener('input', updateHistoryLabel);
  document.getElementById('rangeHistoryAdd').addEventListener('change', persist);

}); // конец DOMContentLoaded
