// background_core.js — очередь заданий, хоткей, контекстное меню,
// уведомления, автопереинъекция после обновления, диагностика.

//=====================================================
// (1) АВТОПЕРЕИНЪЕКЦИЯ content-скриптов после обновления/установки.
// Открытые вкладки получают свежие скрипты БЕЗ F5.
// Все файлы защищены флагами — дублей не будет.
//=====================================================
chrome.runtime.onInstalled.addListener(async (d) => {
  if (d.reason !== 'update' && d.reason !== 'install') return;

  const LISTS = {
    avito: ['config.js', 'parser_avito_core.js', 'parser_avito_photos.js', 'parser_avito.js', 'content_manager.js', 'widget_ai_score.js'],
    drom: ['config.js', 'parser_drom_core.js', 'parser_drom_photos.js', 'parser_drom.js', 'content_manager.js', 'widget_ai_score.js'],
    autoru: ['config.js', 'parser_auto_ru_core.js', 'parser_auto_ru_photos.js', 'parser_auto_ru.js', 'content_manager.js', 'widget_ai_score.js']
  };

  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.url) continue;
      let files = null;
      if (/avito\.ru/.test(tab.url)) files = LISTS.avito;
      else if (/drom\.ru/.test(tab.url)) files = LISTS.drom;
      else if (/auto\.ru/.test(tab.url)) files = LISTS.autoru;
      if (files) {
        try {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: files });
          await new Promise(r => setTimeout(r, 100));  // задержка 100мс между инъекциями
        } catch (e) {}
      }
    }
    console.log('[Update] content-скрипты переинъектированы в открытые вкладки');
  } catch (e) {}
});

//=====================================================
// ОЧЕРЕДЬ ЗАДАНИЙ: таймеры, отмена, уведомления
//=====================================================
self.BackgroundQueue = {
  jobs: [],
  running: false,

  enqueue: function (standardData, settings) {
    const job = {
      id: Date.now() + '_' + Math.floor(Math.random() * 1e4),
      label: (standardData && standardData.db_fields && standardData.db_fields.car_display_name) || 'Авто',
      status: 'queued',
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      standardData: standardData,
      settings: settings || {}
    };
    this.jobs.push(job);
    if (this.jobs.length > 20) this.jobs.shift();
    console.log('[Queue] добавлено:', job.label);
    this.broadcast();
    this.process();
    return job.id;
  },

  cancel: function (id) {
    const job=this.jobs.find(j=> j.id === id);
    if (!job) return false;
    // Если задача уже завершена, отменять нельзя
    if (job.status === 'done' || job.status === 'error' || job.status === 'canceled') return false;

    job.status='canceled';
    job.finishedAt=Date.now();
    this.broadcast();
    this.scheduleRemove(job);
    return true;
  },

  broadcast: function () {
    const active = this.jobs.filter(j => j.status !== 'done' && j.status !== 'error' && j.status !== 'canceled').length;
    try { chrome.action.setBadgeText({ text: active ? String(active) : '' }); } catch (e) {}

    const payload = {
      action: 'queue_update',
      jobs: this.jobs.map(j => ({
        id: j.id, label: j.label, status: j.status,
        createdAt: j.createdAt, startedAt: j.startedAt
      }))
    };
    try { chrome.runtime.sendMessage(payload, () => { void chrome.runtime.lastError; }); } catch (e) {}
  },

  // (14) уведомление о завершении/ошибке
  notify: function (title, message) {
    try {
      chrome.notifications.create('', {
        type: 'basic',
        iconUrl: 'icon.png',
        title: title,
        message: message
      });
    } catch (e) {}
  },

  scheduleRemove: function (job) {
    setTimeout(() => {
      const i = this.jobs.indexOf(job);
      if (i !== -1) { this.jobs.splice(i, 1); this.broadcast(); }
    }, 15000);
  },

  process: async function () {
    if (this.running) return;
    this.running=true;

    for (;;) {
      const job=this.jobs.find(j=> j.status === 'queued');
      if (!job) break;

      job.startedAt=Date.now();
      try {
        const onStatus=(st)=> {
          if (job.status === 'canceled') throw new Error('Отменено пользователем');
          job.status=st;
          self.BackgroundQueue.broadcast();
        };
        // Передаём функцию проверки отмены в опции
        const opts = Object.assign({}, job.settings, { checkCanceled: () => job.status === 'canceled' });
        await self.BackgroundCore.buildZipArchive(job.standardData, opts, onStatus);

        if (job.status !== 'canceled') {
          job.status='done';
          self.BackgroundQueue.notify('Авто Assistant: готово', job.label + ' — ZIP сохранён');
          console.log('[Queue] готово:', job.label);
        }
      } catch (e) {
        if (job.status !== 'canceled') {
          console.error('[Queue] ошибка задания:', e);
          job.status='error';
          self.BackgroundQueue.notify('Авто Assistant: ошибка', job.label + ' — ' + ((e && e.message) || String(e)));
        }
      }
      job.finishedAt=Date.now();
      this.broadcast();
      this.scheduleRemove(job);
    }

    this.running=false;
    this.broadcast();
  }
};

//=====================================================
// HOTKEY (Alt+G) — Avito, Дром, Авто.ру
//=====================================================
if (chrome.commands && chrome.commands.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'save-car-shortcut') return;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url && (tab.url.includes('avito.ru') || tab.url.includes('drom.ru') || tab.url.includes('auto.ru'))) {
        const settings = await self.BackgroundHelpers.getSettings();
        chrome.tabs.sendMessage(tab.id, { action: 'parse_data', options: settings }, (standardData) => {
          if (chrome.runtime.lastError || !standardData) return;
          self.BackgroundQueue.enqueue(standardData, settings);
        });
      }
    } catch (e) { console.error('[Hotkey] ошибка:', e); }
  });
}

//=====================================================
// (17) КОНТЕКСТНОЕ МЕНЮ "Сохранить авто в ZIP"
//=====================================================
function isCarUrl(url) {
  if (/avito\.ru/.test(url)) return /_\d{6,}/.test(url);
  if (/drom\.ru/.test(url)) return /\/\d{4,}\.html/.test(url);
  if (/auto\.ru/.test(url)) return /\/cars\/used\/sale\//.test(url);
  return false;
}

if (chrome.contextMenus) {
  function setupMenu() {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'save-car-zip',
        title: 'Сохранить авто в ZIP',
        contexts: ['page'],
        documentUrlPatterns: ['*://*.avito.ru/*', '*://*.drom.ru/*', '*://*.auto.ru/*']
      });
    });
  }
  setupMenu();
  chrome.runtime.onStartup.addListener(setupMenu);

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== 'save-car-zip' || !tab || !tab.url) return;
    if (!isCarUrl(tab.url)) return;
    self.BackgroundHelpers.getSettings().then((settings) => {
      chrome.tabs.sendMessage(tab.id, { action: 'parse_data', options: settings }, (standardData) => {
        if (chrome.runtime.lastError || !standardData) return;
        self.BackgroundQueue.enqueue(standardData, settings);
      });
    });
  });
}

//=====================================================
// СООБЩЕНИЯ ИЗ POPUP: download / status / cancel / diag
//=====================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'download_xml') {
    self.BackgroundQueue.enqueue(message.data, message.options || {});
    sendResponse({ ok: true, queued: true });
    return false;
  }

  if (message && message.action === 'queue_status') {
    sendResponse({
      jobs: self.BackgroundQueue.jobs.map(j => ({
        id: j.id, label: j.label, status: j.status,
        createdAt: j.createdAt, startedAt: j.startedAt
      }))
    });
    return false;
  }

  if (message && message.action === 'queue_cancel') {
    sendResponse({ ok: self.BackgroundQueue.cancel(message.id) });
    return false;
  }

  // (2) диагностика со стороны фона
  if (message && message.action === 'diag') {
    (async () => {
      let hidden = 0;
      try {
        const r = await chrome.storage.session.get({ aiHiddenWindows: [] });
        hidden = (r.aiHiddenWindows || []).length;
      } catch (e) {}
      sendResponse({
        ok: true,
        version: chrome.runtime.getManifest().version,
        queue: self.BackgroundQueue.jobs.length,
        hiddenWindows: hidden
      });
    })();
    return true;
  }

  return false;
});

//=====================================================
// Инициализация badge + HELPERS
//=====================================================
try { chrome.action.setBadgeBackgroundColor({ color: '#00aa46' }); } catch (e) {}

self.BackgroundHelpers = {
  getSettings: function () {
    return new Promise((res) => {
      chrome.storage.local.get({ settings: {} }, (r) => {
        res(Object.assign({}, DEFAULT_CONFIG, r.settings || {}));
      });
    });
  },

  escapeXml: function (unsafe) {
    if (unsafe === null || unsafe === undefined) return 'Не указано';
    return String(unsafe)
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case "'": return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
  }
};
