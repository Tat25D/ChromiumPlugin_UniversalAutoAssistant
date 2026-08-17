// widget_ai_score.js — инициализация виджета (точка входа)
(function () {
  'use strict';

  // СТРАХОВКА: Если widget_utils.js не загрузился, создаём заглушки, чтобы не падать
  window.UAAWidget = window.UAAWidget || {};
  if (!UAAWidget.extAlive) UAAWidget.extAlive = function() { return false; };
  if (!UAAWidget.state) UAAWidget.state = { photoPages: {} };
  if (!UAAWidget.isCarPage) UAAWidget.isCarPage = function() { return false; };
  if (!UAAWidget.removeWidget) UAAWidget.removeWidget = function() {};
  if (!UAAWidget.getSettings) UAAWidget.getSettings = function(cb) { cb({}); };
  if (!UAAWidget.ensureWidget) UAAWidget.ensureWidget = function() { return null; };
  if (!UAAWidget.setPhotoBtnState) UAAWidget.setPhotoBtnState = function() {};
  if (!UAAWidget.getFields) UAAWidget.getFields = function() { return Promise.resolve(null); };
  if (!UAAWidget.checkCriticalFields) UAAWidget.checkCriticalFields = function() { return []; };
  if (!UAAWidget.setState) UAAWidget.setState = function() {};
  if (!UAAWidget.setErrorSign) UAAWidget.setErrorSign = function() {};
  if (!UAAWidget.setStopSign) UAAWidget.setStopSign = function() {};
  if (!UAAWidget.computeStopFlags) UAAWidget.computeStopFlags = function() { return []; };
  if (!UAAWidget.getCache) UAAWidget.getCache = function() { return Promise.resolve({}); };
  if (!UAAWidget.loadScoreWithRetries) UAAWidget.loadScoreWithRetries = function() { return Promise.resolve(); };
  if (!UAAWidget.handleWidgetClick) UAAWidget.handleWidgetClick = function() {};
  if (!UAAWidget.togglePhoto) UAAWidget.togglePhoto = function() {};

  if (window.__aiScoreWidgetStarted) return;
  window.__aiScoreWidgetStarted = true;

  var state = UAAWidget.state; // Ярлык для состояния
  var CACHE_VER = 'v3_';

  function init() {
    try {
      if (!UAAWidget.extAlive()) return;

      if (document.visibilityState !== 'visible') {
        if (!state.waitingVisible) {
          state.waitingVisible = true;
          var onVis = function () {
            if (document.visibilityState === 'visible') {
              state.waitingVisible = false;
              document.removeEventListener('visibilitychange', onVis);
              init();
            }
          };
          document.addEventListener('visibilitychange', onVis);
        }
        return;
      }

      if (!state.pageCheckDone) {
        if (!UAAWidget.isCarPage()) {
          UAAWidget.removeWidget();
          setTimeout(function () {
            if (!state.pageCheckDone && UAAWidget.isCarPage()) { state.pageCheckDone = true; init(); }
          }, 2500);
          return;
        }
        state.pageCheckDone = true;
      }

      var uid = UAAWidget.getUid ? UAAWidget.getUid() : null;
      if (!uid) { UAAWidget.removeWidget(); return; }
      state.currentUid = uid;

      UAAWidget.getSettings(function (s) {
        if (!s.aiScore) { UAAWidget.removeWidget(); return; }
        state.photoAlways = !!s.photoAlways;
        state.mileageAdjust = Number(s.mileageAdjust) || 0;
        state.historyAdd = Number(s.historyAdd) || 0;

        var w = UAAWidget.ensureWidget(UAAWidget.handleWidgetClick, UAAWidget.togglePhoto);

        // Обработчик кнопки "Тест"
        var testBtn = w ? w.querySelector('.testbtn') : null;
        if (testBtn) {
          testBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            if (UAAWidget.openTestModal) {
              UAAWidget.openTestModal(function() {
                if (UAAWidget.closeTestModal) UAAWidget.closeTestModal();
                if (UAAWidget.forceRefreshScore) UAAWidget.forceRefreshScore();
              });
            }
          });
        }

        if (UAAWidget.extAlive()) {
          chrome.storage.local.get({ widgetPhotoPages: {} }, function (r) {
            state.photoPages = r.widgetPhotoPages || {};
            UAAWidget.setPhotoBtnState(w, UAAWidget.photoEffective ? UAAWidget.photoEffective() : false, false);
          });
        }

        var cacheKey = CACHE_VER + uid + '_' + (s.compare || 'yaris');
        state.lastCacheKey = cacheKey;

        UAAWidget.getFields().then(function (fields) {
          if (fields) {
            state.lastFields = fields;
            fields.mileageAdjust = state.mileageAdjust;
            fields.historyAdd = state.historyAdd;

            var missing = UAAWidget.checkCriticalFields(fields);
            var hasCritical = missing.some(m => m === 'Наименование' || m === 'Год выпуска' || m === 'Цена');
            if (hasCritical) {
              UAAWidget.setState(w, 'error');
              UAAWidget.setErrorSign(w, 'Вёрстка сайта изменилась. Не считываются: ' + missing.filter(m => m === 'Наименование' || m === 'Год выпуска' || m === 'Цена').join(', ') + '.');
              return;
            }
            if (missing.length > 0) {
              UAAWidget.setErrorSign(w, 'Не удалось считать: ' + missing.filter(m => m !== 'Наименование' && m !== 'Год выпуска' && m !== 'Цена').join(', ') + '.');
            } else {
              UAAWidget.setErrorSign(w, null);
            }
            UAAWidget.setStopSign(w, UAAWidget.computeStopFlags(fields, state.mileageAdjust, state.historyAdd));
          } else {
            UAAWidget.setState(w, 'error');
            UAAWidget.setErrorSign(w, 'Парсер вернул пустые данные.');
          }

          UAAWidget.getCache().then(function (cache) {
            if (cache[cacheKey] !== undefined) {
              UAAWidget.setState(w, 'score', Number(cache[cacheKey]), UAAWidget.photoEffective ? UAAWidget.photoEffective() : false);
              return;
            }
            if (!fields) { UAAWidget.setState(w, 'error'); return; }
            return UAAWidget.loadScoreWithRetries(w, cacheKey, fields, UAAWidget.photoEffective ? UAAWidget.photoEffective() : false);
          });
        });
      });
    } catch (e) {
      console.error('[AI-SCORE-WIDGET] init error:', e);
    }
  }

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.action === 'ai_photo_done') {
      UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective ? UAAWidget.photoEffective() : false, false);
    }
    return false;
  });

  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes.widgetPhotoPages) {
      state.photoPages = changes.widgetPhotoPages.newValue || {};
      UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective ? UAAWidget.photoEffective() : false, false);
    }
    if (!changes.settings) return;
    var nv = changes.settings.newValue || {};
    var ov = changes.settings.oldValue || {};

    state.photoAlways = !!nv.photoAlways;
    state.mileageAdjust = Number(nv.mileageAdjust) || 0;
    state.historyAdd = Number(nv.historyAdd) || 0;
    UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective ? UAAWidget.photoEffective() : false, false);

    if (!nv.aiScore) { UAAWidget.removeWidget(); return; }
    if (nv.aiScore !== ov.aiScore || (nv.compare && nv.compare !== ov.compare)) init();

    var w = document.getElementById('uaa_ai_score_widget');
    if (w && state.lastFields) {
      state.lastFields.historyAdd = state.historyAdd;
      var missing = UAAWidget.checkCriticalFields(state.lastFields);
      var hasCritical = missing.some(m => m === 'Наименование' || m === 'Год выпуска' || m === 'Цена');
      if (!hasCritical) {
        if (missing.length > 0) UAAWidget.setErrorSign(w, 'Не удалось считать: ' + missing.filter(m => m !== 'Наименование' && m !== 'Год выпуска' && m !== 'Цена').join(', ') + '.');
        else UAAWidget.setErrorSign(w, null);
      }
      UAAWidget.setStopSign(w, UAAWidget.computeStopFlags(state.lastFields, state.mileageAdjust, state.historyAdd));
    }
  });

  init();
})();
