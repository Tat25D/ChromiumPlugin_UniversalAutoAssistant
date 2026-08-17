// ai_extract.js — извлечение ответа из страницы Google.
// ВАЖНО: передаётся в chrome.scripting.executeScript.
// Никаких внешних переменных — только аргументы.
// allowPartial=true разрешает отдать НЕЗАВЕРШЁННЫЙ текст (только после таймаута).

self.BackgroundAI = self.BackgroundAI || {};

self.BackgroundAI.inlineExtract = function (startMarker, endMarker, minLen, allowPartial) {
  const MAX_EXTRACT = 50000;

  const body = document.body ? (document.body.innerText || '') : '';

  const clean = function (t) {
    return (t || '').replace(/\n{3,}/g, '\n\n').trim();
  };

  const allIdx = function (hay, needle) {
    const r = [];
    let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) {
      r.push(i);
      i += needle.length;
    }
    return r;
  };

  const PROMPT_RE = /Распиши строго по пунктам|Роль: Действуй как|Роль: Автоэксперт|Важно! В конце ответа|Важно! В начале ответа/i;
  const hasError = /Не удалось сгенерировать обзор|обзор от ИИ недоступен/i.test(body);

  const starts = allIdx(body, startMarker);
  const ends = allIdx(body, endMarker);

  const debug = {
    bodyLen: body.length,
    startCount: starts.length,
    endCount: ends.length,
    usedPair: -1,
    extractedLen: 0,
    complete: false
  };

  // СТРОГОЕ ПРАВИЛО: ответ готов, когда КОНЕЧНЫЙ маркер появился ВТОРОЙ раз
  // (1-й — в тексте промпта, 2-й — в конце ответа ИИ).
  if (ends.length >= 2) {
    for (let i = 1; i < ends.length; i++) {
      const ei = ends[i];
      let si;

      if (starts.length > i) {
        si = starts[i] + startMarker.length;
      } else {
        si = ends[i - 1] + endMarker.length;
      }

      if (si < 0 || si >= ei) continue;

      let t = clean(body.slice(si, ei));
      t = t.split(startMarker).join('').split(endMarker).join('');

      if (t.length >= minLen && !PROMPT_RE.test(t)) {
        debug.usedPair = i;
        debug.extractedLen = t.length;
        debug.complete = true;

        return {
          text: t.slice(0, MAX_EXTRACT),
          started: true,
          complete: true,
          hasError: hasError,
          debug: debug
        };
      }
    }
  }

  // Частичный текст — ТОЛЬКО если явно разрешено (после полного таймаута).
  if (allowPartial && starts.length >= 2) {
    const si = starts[starts.length - 1] + startMarker.length;
    const endPos = body.indexOf(endMarker, si);

    let t = clean(endPos !== -1 ? body.slice(si, endPos) : body.slice(si));
    t = t.split(startMarker).join('').split(endMarker).join('');

    if (t.length >= minLen && !PROMPT_RE.test(t)) {
      debug.usedPair = -2;
      debug.extractedLen = t.length;

      return {
        text: t.slice(0, MAX_EXTRACT),
        started: true,
        complete: false,
        hasError: hasError,
        debug: debug
      };
    }
  }

  return {
    text: null,
    started: (starts.length + ends.length) > 0,
    complete: false,
    hasError: hasError,
    debug: debug
  };
};
