// google_ai_reader.js — ОПТИМИЗИРОВАННЫЙ content script для вкладки Google.
// Интервал 2с (было 0.4с), максимум 60с (было 180с), textContent вместо innerText.
(function () {
  if (window.__aiReaderStarted) return;
  window.__aiReaderStarted = true;

  const START = '===НАЧАЛО ОТЧЁТА===';
  const END = '-----------------КОНЕЦ ОТЧЁТА-----------------';
  const MIN_LEN = 200;
  const PROMPT_RE = /Распиши строго по пунктам|Роль: Действуй как|Роль: Автоэксперт|Важно! В конце ответа|Важно! В/;

  const clean = (t) => (t || '').replace(/\n{3,}/g, '\n\n').trim();

  const allIdx = (hay, needle) => {
    const r = []; let i = 0;
    while ((i = hay.indexOf(needle, i)) !== -1) { r.push(i); i += needle.length; }
    return r;
  };

  function extract() {
    // textContent НЕ форсирует layout — в десятки раз быстрее innerText
    const body = document.body ? (document.body.textContent || '') : '';
    if (body.length < 300) return null;

    const starts = allIdx(body, START);
    const ends = allIdx(body, END);

    if (ends.length < 2) return null;

    for (let i = 1; i < ends.length; i++) {
      const ei = ends[i];
      let si;
      if (starts.length > i) si = starts[i] + START.length;
      else si = ends[i - 1] + END.length;
      if (si < 0 || si >= ei) continue;

      let t = clean(body.slice(si, ei));
      t = t.split(START).join('').split(END).join('');

      if (t.length >= MIN_LEN && !PROMPT_RE.test(t)) return t.slice(0, 8000);
    }
    return null;
  }

  function tryClickRetry(startTs, state) {
    if (state.clicked) return;
    const body = document.body ? document.body.textContent : '';
    if (!/Не удалось сгенерировать обзор/i.test(body)) return;
    if (Date.now() - startTs < 8000) return;
    state.clicked = true;
    const nodes = document.querySelectorAll('button, div[role="button"], a, span, div');
    for (const el of nodes) {
      const t = (el.textContent || '').trim();
      if (t.length > 0 && t.length < 60 && /Повтор(ить|ите) попытку/i.test(t)) {
        try { el.click(); return; } catch (e) {}
      }
    }
  }

  const startTs = Date.now();
  const retryState = { clicked: false };
  let sent = false;
  let attempts = 0;
  const MAX_ATTEMPTS = 30; // 30 × 2с = 60 секунд максимум

  const timer = setInterval(() => {
    if (sent || attempts >= MAX_ATTEMPTS) {
      clearInterval(timer);
      return;
    }
    attempts++;

    try {
      const text = extract();
      if (text) {
        sent = true;
        clearInterval(timer);
        chrome.runtime.sendMessage({
          action: 'ai_page_ready',
          text: text,
          url: location.href
        }, () => { void chrome.runtime.lastError; });
      } else {
        tryClickRetry(startTs, retryState);
      }
    } catch (e) {}
  }, 2000);

  setTimeout(() => clearInterval(timer), 60000);
})();
