// widget_utils.js — базовые утилиты виджета
window.UAAWidget = window.UAAWidget || {};

UAAWidget.extAlive = function () {
  try {
    return !!(chrome && chrome.storage && chrome.storage.local && chrome.runtime && chrome.runtime.id);
  } catch (e) { return false; }
};

UAAWidget.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

UAAWidget.isCarPage = function () {
  var host = location.hostname;
  var path = location.pathname;
  if (/(^|\.)drom\.ru$/.test(host)) {
    if (path.includes('sell_spare_parts')) return false;
    return /\/\d{4,}\.html/.test(path);
  }
  if (/(^|\.)auto\.ru$/.test(host)) return path.includes('cars');
  if (/(^|\.)avito\.ru$/.test(host)) {
    if (!path.includes('avtomobili')) return false;
    if (document.querySelector('[data-marker="item-view/price"]') || document.querySelector('[data-marker="item-view/gallery"]')) return true;
    var markers = ['Характеристики', 'Есть отчёт Автотеки', 'Расположение', 'Описание', 'Дополнительные опции', 'Стоимость владения'];
    var text = (document.body && document.body.textContent) || '';
    var hits = 0;
    for (var i = 0; i < markers.length; i++) if (text.indexOf(markers[i]) !== -1) hits++;
    return hits >= 3;
  }
  return false;
};

UAAWidget.getUid = function () {
  var m = location.pathname.match(/_(\d{6,})(?:[/?#]|$)/) || location.pathname.match(/\/(\d{4,})\.html/) || location.href.match(/(\d{7,})(?:[/?#]|$)/);
  if (m) return m[1];
  var h = 0, s = location.pathname + '|' + location.search;
  for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return 'url_' + Math.abs(h).toString(36);
};

UAAWidget.getSettings = function (cb) {
  if (!UAAWidget.extAlive()) { cb({}); return; }
  chrome.storage.local.get({ settings: {} }, function (r) { cb(Object.assign({}, DEFAULT_CONFIG, r.settings || {})); });
};

UAAWidget.getCache = function () {
  return new Promise(function (res) {
    if (!UAAWidget.extAlive()) { res({}); return; }
    chrome.storage.local.get({ scoreCache: {} }, function (r) { res(r.scoreCache || {}); });
  });
};

UAAWidget.saveCache = function (key, score) {
  if (!UAAWidget.extAlive()) return;
  chrome.storage.local.get({ scoreCache: {} }, function (r) {
    var cache = r.scoreCache || {};
    cache[key] = score;
    var keys = Object.keys(cache);
    if (keys.length > 300) delete cache[keys[0]];
    chrome.storage.local.set({ scoreCache: cache });
  });
};

UAAWidget.getFields = function () {
  return Promise.resolve().then(function () {
    if (typeof window.runUniversalManager === 'function') {
      return window.runUniversalManager({ savePhotos: false }).then(function (data) {
        return data && data.db_fields;
      }).catch(function (e) {
        console.error('[AI-SCORE-WIDGET] ошибка парсинга: ', e);
        return null;
      });
    }
    return null;
  });
};

UAAWidget.requestScore = function (fields, timeoutSec) {
  return new Promise(function (resolve) {
    try {
      chrome.runtime.sendMessage(
        { action: 'get_ai_score', fields: fields, timeoutSec: timeoutSec },
        function (resp) {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(resp);
        }
      );
    } catch (e) {
      console.warn('[AI-SCORE-WIDGET] Ошибка соединения с фоном. Обновите страницу (F5).');
      resolve(null);
    }
  });
};

// Общий объект состояния для виджета
UAAWidget.state = {
  lastFields: null,
  pageCheckDone: false,
  waitingVisible: false,
  currentUid: null,
  photoAlways: false,
  photoPages: {},
  lastCacheKey: null,
  mileageAdjust: 0,
  historyAdd: 0
};
