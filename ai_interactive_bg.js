// ai_interactive_bg.js — фоновый модуль ИИ: приём сообщений, скачивание фото, ожидание вкладки
self.BackgroundAI=self.BackgroundAI || {};

//=====================================================
// Скачивание фото в фоне (обход CORS) -> base64
//=====================================================
self.BackgroundAI.fetchPhotoBase64=async function (url) {
  if (!url || !/^https:\/\//i.test(url)) throw new Error('bad photo url');
  const ref=/drom\.ru/i.test(url) ? 'https://auto.drom.ru/'
    : /auto\.ru/i.test(url) ? 'https://auto.ru/'
    : 'https://avito.ru/';

  const res=await fetch(url, { credentials: 'omit', cache: 'no-store', referrer: ref });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const mime=(res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const blob=await res.blob();
  if (!blob || blob.size < 1024) throw new Error('пустое фото');
  if (blob.size > 6 * 1024 * 1024) throw new Error('фото больше 6 МБ');

  const buf=await blob.arrayBuffer();
  const bytes=new Uint8Array(buf);
  let binary='';
  const CH=0x8000;
  for (let i=0; i < bytes.length; i += CH) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return { base64: btoa(binary), mime: mime };
};

//=====================================================
// Ждём status=complete (максимум 20 сек)
//=====================================================
self.BackgroundAI.waitForTabComplete=function (tabId) {
  return new Promise((resolve)=> {
    let done=false;
    const finish=(v)=> {
      if (!done) {
        done=true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(v);
      }
    };
    const listener=(id, info)=> {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    const timer=setTimeout(()=> finish(false), 20000);
    chrome.tabs.onUpdated.addListener(listener);
  });
};

//=====================================================
// Приёмник сообщений
//=====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=> {
  if (!msg) return false;

  const isReport=msg.action === 'open_ai_report';
  const isCompare=msg.action === 'open_ai_compare';
  const isCheck=msg.action === 'open_ai_check';
  const isProblems=msg.action === 'open_ai_problems';
  const isReg=msg.action === 'open_ai_registration';

  if (!isReport && !isCompare && !isCheck && !isProblems && !isReg) return false;

  if (!msg.userInitiated) {
    console.warn('[AI-INTERACTIVE] отклонено сообщение без userInitiated:', msg.action);
    sendResponse({ ok: false, error: 'не userInitiated' });
    return false;
  }

  (async ()=> {
    try {
      let prompt=msg.prompt || '';

      if (!prompt && isReport && msg.fields) {
        const settings=await new Promise((res)=> {
          chrome.storage.local.get({ settings: {} }, (r)=> {
            res(Object.assign({}, DEFAULT_CONFIG, r.settings || {}));
          });
        });
        prompt=self.BackgroundAI.buildInteractiveReportPrompt(msg.fields, self.BackgroundAI.getRefCar(settings), { stopFlags: msg.stopFlags });
      }
      if (!prompt && isProblems && msg.fields) prompt=self.BackgroundAI.buildInteractiveProblemsPrompt(msg.fields);
      if (!prompt && isReg && msg.fields) prompt=self.BackgroundAI.buildInteractiveRegistrationPrompt(msg.fields);

      if (!prompt) { sendResponse({ ok: false, error: 'пустой промпт' }); return; }

      //--- фото: скачиваем в фоне ---
      let photo=null;
      if (msg.photoUrl) {
        try {
          photo=await self.BackgroundAI.fetchPhotoBase64(msg.photoUrl);
        } catch (e) {
          console.warn('[AI-INTERACTIVE] фото не скачалось:', e);
        }
      }

      // сообщаем виджету, что извлечение фото завершено
      try {
        chrome.runtime.sendMessage({ action: 'ai_photo_done' }, ()=> { void chrome.runtime.lastError; });
      } catch (e) {}

      const tab=await chrome.tabs.create({ url: 'https://www.google.com/search?hl=ru&udm=50', active: true });
      await self.BackgroundAI.waitForTabComplete(tab.id);

      //--- прикрепляем фото к чату ---
      let photoAttached=false;
      if (photo) {
        try {
          const ar=await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: self.BackgroundAI.attachImageInPage,
            args: [photo]
          });
          const r0=ar && ar[0] && ar[0].result;
          photoAttached=!!(r0 && r0.ok);
          if (photoAttached) await new Promise(r=> setTimeout(r, 1500));
          else console.warn('[AI-INTERACTIVE] фото не прикрепилось:', r0 && r0.error);
        } catch (e) {
          console.warn('[AI-INTERACTIVE] ошибка прикрепления фото:', e);
        }
      }

      if (msg.photoUrl) {
        prompt += photoAttached
          ? '\n\nК запросу приложено фото автомобиля — обязательно учитывай его при анализе (внешний вид, состояние кузова и салона).'
          : '\n\nФото автомобиля (ссылка; открой и учти при анализе): ' + msg.photoUrl;
      }

      const res=await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: self.BackgroundAI.fillAndSubmitInPage,
        args: [prompt]
      });
      const r=res && res[0] && res[0].result;

      if (r && r.ok) {
        console.log('[AI-INTERACTIVE] промпт отправлен (' + msg.action + '), фото: ' + (photoAttached ? 'прикреплено' : (msg.photoUrl ? 'ссылкой' : 'нет')), { tabId: tab.id });
        sendResponse({ ok: true, photoAttached: photoAttached });
      } else {
        sendResponse({ ok: false, error: (r && r.error) || 'поле запроса не найдено' });
      }
    } catch (e) {
      console.warn('[AI-INTERACTIVE] ошибка:', e);
      sendResponse({ ok: false, error: (e && e.message) || String(e) });
    }
  })();

  return true;
});
