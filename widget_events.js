// widget_events.js — обработка кликов по виджету
window.UAAWidget = window.UAAWidget || {};
var state = UAAWidget.state;
var clickTimer = null;

//--- одинарный клик: отчёт AI ---
UAAWidget.openReport = function () {
  UAAWidget.getFields().then(function (fields) {
    var w = document.getElementById('uaa_ai_score_widget');
    if (!w) return;

    if (!fields) { UAAWidget.setErrorSign(w, 'Парсер не загрузился. Обновите страницу (F5).'); return; }
    state.lastFields = fields;

    UAAWidget.setErrorSign(w, null);

    try {
      fields.mileageAdjust = state.mileageAdjust;
      fields.historyAdd = state.historyAdd;

      var stopFlags = UAAWidget.computeStopFlags(fields, state.mileageAdjust, state.historyAdd);
      var issues = UAAWidget.getSelectedIssues();
      if (issues.length > 0) {
        fields.user_selected_issues = 'Выявленные проблемы по фото:\n- ' + issues.join('\n- ');
        issues.forEach(function(issue) { stopFlags.push('Тест по фото: ' + issue); });
      }

      var msg = { action: 'open_ai_report', fields: fields, userInitiated: true, stopFlags: stopFlags };

      if (UAAWidget.photoEffective()) {
        var photoUrl = UAAWidget.getCurrentPhotoUrl();
        if (!photoUrl) { UAAWidget.setErrorSign(w, 'Не удалось найти текущее фото.'); return; }
        msg.photoUrl = photoUrl;
        UAAWidget.setPhotoBtnState(w, true, true);
        setTimeout(function () { UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective(), false); }, 60000);
      }

      chrome.runtime.sendMessage(msg, function (resp) {
        UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective(), false);
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          UAAWidget.setErrorSign(w, 'Фоновая служба не ответила. Перезагрузите расширение.');
        } else {
          if (!state.photoAlways && state.currentUid) {
            state.photoPages[state.currentUid] = false;
            if (UAAWidget.extAlive()) {
              chrome.storage.local.set({ widgetPhotoPages: state.photoPages }, function() {
                UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective(), false);
              });
            } else {
              UAAWidget.setPhotoBtnState(document.getElementById('uaa_ai_score_widget'), UAAWidget.photoEffective(), false);
            }
          }
        }
      });
    } catch (e) { UAAWidget.setErrorSign(w, e.message); }
  }).catch(function(e) { UAAWidget.setErrorSign(document.getElementById('uaa_ai_score_widget'), 'Ошибка данных: ' + e.message); });
};

//--- двойной клик: принудительный пересчёт оценки ---
UAAWidget.forceRefreshScore = function () {
  var w = document.getElementById('uaa_ai_score_widget');
  if (!w || !state.lastCacheKey) return;

  UAAWidget.getFields().then(function (fields) {
    if (!fields) { UAAWidget.setErrorSign(w, 'Парсер не загрузился. Обновите страницу (F5).'); return; }
    state.lastFields = fields;

    try {
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

      var issues = UAAWidget.getSelectedIssues();
      if (issues.length > 0) {
        fields.user_selected_issues = 'Выявленные проблемы по фото:\n- ' + issues.join('\n- ');
        var stopFlags = UAAWidget.computeStopFlags(fields, state.mileageAdjust, state.historyAdd);
        issues.forEach(function(issue) { stopFlags.push('Тест по фото: ' + issue); });
        UAAWidget.setStopSign(w, stopFlags);
      } else {
        UAAWidget.setStopSign(w, UAAWidget.computeStopFlags(fields, state.mileageAdjust, state.historyAdd));
      }

      UAAWidget.loadScoreWithRetries(w, state.lastCacheKey, fields, UAAWidget.photoEffective());
    } catch (e) { UAAWidget.setErrorSign(w, e.message); }
  }).catch(function(e) { UAAWidget.setErrorSign(w, 'Ошибка данных: ' + e.message); });
};

//--- обработка клика (роутер одинарного/двойного) ---
UAAWidget.handleWidgetClick = function () {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
    UAAWidget.forceRefreshScore();
    return;
  }
  clickTimer = setTimeout(function () {
    clickTimer = null;
    UAAWidget.openReport();
  }, 250);
};
