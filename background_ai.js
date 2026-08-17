// background_ai.js — каркас модуля ИИ и приём ответа из вкладки Google
self.BackgroundAI = self.BackgroundAI || {};
self.BackgroundAI._pushed = null;

chrome.runtime.onMessage.addListener((msg, sender) => {
  const action = (msg && msg.action) ? String(msg.action).trim() : '';

  if (action === 'ai_page_ready') {
    self.BackgroundAI._pushed = {
      text: msg.text || '',
      url: msg.url || '',
      tabId: (sender && sender.tab) ? sender.tab.id : null,
      ts: Date.now()
    };

    if (AI_DEBUG) {
      console.log('[AI] ai_page_ready получен', {
        tabId: (sender && sender.tab) ? sender.tab.id : null,
        len: (msg.text || '').length
      });
    }
  }

  return false;
});
