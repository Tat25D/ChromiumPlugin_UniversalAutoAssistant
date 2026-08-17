// widget_score.js — логика повторных запросов оценки к ИИ
window.UAAWidget = window.UAAWidget || {};

UAAWidget.loadScoreWithRetries = function (w, cacheKey, fields, photoEffective) {
  var RETRY_DELAY_MS = (typeof AI_SCORE_DELAY_MS !== 'undefined') ? AI_SCORE_DELAY_MS : 600;
  var RETRIES = (typeof AI_SCORE_RETRIES !== 'undefined') ? AI_SCORE_RETRIES : 3;
  var FIRST_DELAY = 250;
  var BASE_TIMEOUT = (typeof AI_SCORE_TIMEOUT_SEC !== 'undefined') ? AI_SCORE_TIMEOUT_SEC : 30;
  var GROW = (typeof AI_SCORE_TIMEOUT_GROW !== 'undefined') ? AI_SCORE_TIMEOUT_GROW : 2;

  UAAWidget.setState(w, 'loading', null, photoEffective);
  return UAAWidget.sleep(FIRST_DELAY).then(function () {
    var attempt = 0;
    function next() {
      attempt++;
      if (attempt > RETRIES) { UAAWidget.setState(w, 'error'); return Promise.resolve(); }
      UAAWidget.setState(w, 'loading', null, photoEffective);
      var timeoutSec = Math.round(BASE_TIMEOUT * Math.pow(GROW, attempt - 1));
      return UAAWidget.requestScore(fields, timeoutSec).then(function (resp) {
        if (resp && resp.ok && typeof resp.score === 'number') {
          UAAWidget.setState(w, 'score', Number(resp.score), photoEffective);
          UAAWidget.saveCache(cacheKey, Number(resp.score));
          return;
        }
        if (attempt < RETRIES) return UAAWidget.sleep(RETRY_DELAY_MS).then(next);
        UAAWidget.setState(w, 'error');
      });
    }
    return next();
  });
};
