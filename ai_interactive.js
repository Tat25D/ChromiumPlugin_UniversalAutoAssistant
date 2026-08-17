// ai_interactive.js — интерактивные кнопки и клики виджета.
// Открывают АКТИВНУЮ вкладку Google AI, вставляют промпт и отправляют.
// "+ 1фото": фон скачивает фото и прикрепляет его к чату Google (file input).
self.BackgroundAI = self.BackgroundAI || {};

//=====================================================
// Скачивание фото в фоне (обход CORS) -> base64
//=====================================================

self.BackgroundAI.fetchPhotoBase64 = async function (url) {
  // защита: скачиваем только корректные https-ссылки
  if (!url || !/^https:\/\//i.test(url)) throw new Error('bad photo url');
  const ref = /drom\.ru/i.test(url) ? 'https://auto.drom.ru/'
    : /auto\.ru/i.test(url) ? 'https://auto.ru/'
    : 'https://avito.ru/';

  const res = await fetch(url, { credentials: 'omit', cache: 'no-store', referrer: ref });
  if (!res.ok) throw new Error('HTTP ' + res.status);

  const mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
  const blob = await res.blob();
  if (!blob || blob.size < 1024) throw new Error('пустое фото');
  if (blob.size > 6 * 1024 * 1024) throw new Error('фото больше 6 МБ');

  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return { base64: btoa(binary), mime: mime };
};

//=====================================================
// ВНУТРИ вкладки Google: прикрепляет фото к чату
//=====================================================
self.BackgroundAI.attachImageInPage = function (payload) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const findInput = () => {
    const inputs = document.querySelectorAll('input[type="file"]');
    for (const inp of inputs) {
      const acc = inp.getAttribute('accept') || '';
      if (!acc || /image/i.test(acc)) return inp;
    }
    return inputs.length ? inputs[0] : null;
  };

  const clickUploadButton = () => {
    const nodes = document.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
    for (const b of nodes) {
      const l = (b.getAttribute('aria-label') || '').toLowerCase();
      if (/изображ|фото|image|photo|attach|прикреп|добав/.test(l)) {
        try { b.click(); return true; } catch (e) {}
      }
    }
    return false;
  };

  return (async () => {
    try {
      const bin = atob(payload.base64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      const mime = payload.mime || 'image/jpeg';
      const file = new File([arr], 'car_photo.jpg', { type: mime });

      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        let inp = findInput();
        if (!inp) {
          clickUploadButton();
          await sleep(500);
          inp = findInput();
        }
        if (inp) {
          const dt = new DataTransfer();
          dt.items.add(file);
          inp.files = dt.files;
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          return { ok: true, method: 'file-input' };
        }
        await sleep(400);
      }
      return { ok: false, error: 'file input не найден за 10 сек' };
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) };
    }
  })();
};

//=====================================================
// Приёмник сообщений
//=====================================================
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return false;

  const isReport = msg.action === 'open_ai_report';
  const isCompare = msg.action === 'open_ai_compare';
  const isCheck = msg.action === 'open_ai_check';
  const isProblems = msg.action === 'open_ai_problems';
  const isReg = msg.action === 'open_ai_registration';

  if (!isReport && !isCompare && !isCheck && !isProblems && !isReg) return false;

  if (!msg.userInitiated) {
    console.warn('[AI-INTERACTIVE] отклонено сообщение без userInitiated:', msg.action);
    sendResponse({ ok: false, error: 'не userInitiated' });
    return false;
  }

  (async () => {
    try {
      let prompt = msg.prompt || '';

      if (!prompt && isReport && msg.fields) {
        const settings = await new Promise((res) => {
          chrome.storage.local.get({ settings: {} }, (r) => {
            res(Object.assign({}, DEFAULT_CONFIG, r.settings || {}));
          });
        });
        //=====================================================
        // ИНТЕРАКТИВ: отчёт (кнопка "Отчёт AI" и клик по виджету)
        //=====================================================
        self.BackgroundAI.buildInteractiveReportPrompt = function (f, ref, opts) {
          ref = ref || self.BackgroundAI.getRefCar();
          const desc = String(f.full_text_description || '').slice(0, 2000);

          let stopFlagsText = '';
          if (opts && opts.stopFlags && opts.stopFlags.length > 0) {
            stopFlagsText = '\n\nВНИМАНИЕ: Автоматический сканер плагина выявил следующие подозрительные признаки (ОБЯЗАТЕЛЬНО проанализируй каждый из них в пункте 1 "Проблемность автомобиля"):\n- ' + opts.stopFlags.join('\n- ') + '\n';
          }

          return 'Роль: Действуй как профессиональный автоэксперт, диагност и специалист по подбору б/у автомобилей.\n\n' +
            'ДАННЫЕ АВТОМОБИЛЯ ДЛЯ АНАЛИЗА:\n' +
            '- Модель: ' + f.car_display_name + '\n' +
            '- Год выпуска: ' + f.production_year + ' г.\n' +
            '- Заявленный пробег: ' + f.total_mileage_km + ' км.\n' +
            '- Цена продажи: ' + f.price_rub + ' руб.\n' +
            '- Рыночная оценка ИИ: ' + ((f.ai_estimated_rub && f.ai_estimated_rub !== '—') ? f.ai_estimated_rub + ' руб.' : 'нет') + '\n' +
            '- Двигатель: ' + f.engine_volume_liters + ' л.\n' +
            '- Л.с.: ' + f.engine_horsepower + ' л.с.\n' +
            '- Топливо: ' + f.engine_fuel_type + '\n' +
            '- КПП: ' + f.transmission_type + '\n' +
            '- Привод: ' + f.drive_unit_type + '\n' +
            '- Модификация/Комплектация: ' + f.engine_modification + '/' + f.equipment_name + '.\n' +
            '- Количество владельцев по ПТС: ' + f.owners_count + '\n' +
            '- Тип ПТС: ' + f.pts_type + '\n' +
            '- Состояние: ' + f.car_condition + '\n' +
            '- Описание от продавца: "' + desc + '"\n\n' +
            'ТРЕБОВАНИЯ К ОТЧЁТУ (проанализируй и распиши строго по пунктам):\n\n' +
            '1. ПРОБЛЕМНОСТЬ АВТОМОБИЛЯ: Насколько беспроблемным или, наоборот, рискованным является данный автомобиль при таком пробеге?\n' +
            '2. РЕМОНТОПРИГОДНОСТЬ: Насколько этот автомобиль сложен и дорог в обслуживании? Легко ли найти на него запчасти?\n' +
            '3. ТЕХНИЧЕСКИЕ ОСОБЕННОСТИ И УЯЗВИМОСТИ: Опиши главные «болячки» и конструктивные особенности именно этого сочетания двигателя и КПП.\n' +
            '4. ГЛАВНЫЕ ПРЕИМУЩЕСТВА: В чем сильные стороны этой модели (ликвидность, оцинковка, расход, подвеска)?\n' +
            '5. ИТОГОВАЯ ОЦЕНКА: Оцени целесообразность покупки данного экземпляра по шкале от 1.0 до 10.0 строго с десятыми (например: 6,5).\n' +
            'ВАЖНОЕ УСЛОВИЕ ДЛЯ ОЦЕНКИ: ' + self.BackgroundAI.refLine(ref) + '\n' +
            stopFlagsText + '\n' +
            'Важно! В конце ответа по авто поставь символьную строку: "' + AI_MARKER_END + '"';
        };
      }
      if (!prompt && isProblems && msg.fields) prompt = self.BackgroundAI.buildInteractiveProblemsPrompt(msg.fields);
      if (!prompt && isReg && msg.fields) prompt = self.BackgroundAI.buildInteractiveRegistrationPrompt(msg.fields);

      if (!prompt) { sendResponse({ ok: false, error: 'пустой промпт' }); return; }

      //--- фото: скачиваем в фоне ---
      let photo = null;
      if (msg.photoUrl) {
        try {
          photo = await self.BackgroundAI.fetchPhotoBase64(msg.photoUrl);
        } catch (e) {
          console.warn('[AI-INTERACTIVE] фото не скачалось:', e);
        }
      }

      // сообщаем виджету, что извлечение фото завершено
      try {
        chrome.runtime.sendMessage({ action: 'ai_photo_done' }, () => { void chrome.runtime.lastError; });
      } catch (e) {}

      const tab = await chrome.tabs.create({ url: 'https://www.google.com/search?hl=ru&udm=50', active: true });
      await self.BackgroundAI.waitForTabComplete(tab.id);

      //--- прикрепляем фото к чату ---
      let photoAttached = false;
      if (photo) {
        try {
          const ar = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: self.BackgroundAI.attachImageInPage,
            args: [photo]
          });
          const r0 = ar && ar[0] && ar[0].result;
          photoAttached = !!(r0 && r0.ok);
          if (photoAttached) await new Promise(r => setTimeout(r, 1500));
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

      const res = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: self.BackgroundAI.fillAndSubmitInPage,
        args: [prompt]
      });
      const r = res && res[0] && res[0].result;

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

//=====================================================
// Ждём status=complete (максимум 20 сек)
//=====================================================
self.BackgroundAI.waitForTabComplete = function (tabId) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(v);
      }
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish(true);
    };
    const timer = setTimeout(() => finish(false), 20000);
    chrome.tabs.onUpdated.addListener(listener);
  });
};

//=====================================================
// ВНУТРИ вкладки Google: вставить промпт и отправить
//=====================================================
self.BackgroundAI.fillAndSubmitInPage = function (prompt) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  const findField = () => {
    const selectors = [
      'textarea[aria-label*="запрос" i]',
      'textarea[placeholder*="запрос" i]',
      'textarea[name="q"]',
      'textarea',
      'div[contenteditable="true"]',
      'div[role="textbox"]'
    ];
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  const setValue = (el, text) => {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = (el.tagName === 'TEXTAREA') ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      try {
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, text);
      } catch (e) {
        el.textContent = text;
        el.dispatchEvent(new InputEvent('input', { bubbles: true }));
      }
    }
  };

  const submit = (el) => {
    const buttons = document.querySelectorAll('button[aria-label], button[type="submit"]');
    for (const b of buttons) {
      const label = (b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '');
      if (/отправ|send/i.test(label)) { b.click(); return 'button'; }
    }
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keypress', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
    return 'enter';
  };

  return (async () => {
    const deadline = Date.now() + 15000;
    let field = null;
    while (Date.now() < deadline) {
      field = findField();
      if (field) break;
      await sleep(400);
    }
    if (!field) return { ok: false, error: 'поле запроса не найдено за 15 сек' };
    setValue(field, prompt);
    await sleep(300);
    const how = submit(field);
    return { ok: true, submit: how };
  })();
};
