// ai_interactive_inject.js — функции, которые инъектируются в страницу Google AI
self.BackgroundAI=self.BackgroundAI || {};

//=====================================================
// ВНУТРИ вкладки Google: прикрепляет фото к чату
//=====================================================
self.BackgroundAI.attachImageInPage=function (payload) {
  const sleep=(ms)=> new Promise(r=> setTimeout(r, ms));

  const findInput=()=> {
    const inputs=document.querySelectorAll('input[type="file"]');
    for (const inp of inputs) {
      const acc=inp.getAttribute('accept') || '';
      if (!acc || /image/i.test(acc)) return inp;
    }
    return inputs.length ? inputs[0] : null;
  };

  const clickUploadButton=()=> {
    const nodes=document.querySelectorAll('button[aria-label], div[role="button"][aria-label]');
    for (const b of nodes) {
      const l=(b.getAttribute('aria-label') || '').toLowerCase();
      if (/изображ|фото|image|photo|attach|прикреп|добав/.test(l)) {
        try { b.click(); return true; } catch (e) {}
      }
    }
    return false;
  };

  return (async ()=> {
    try {
      const bin=atob(payload.base64);
      const arr=new Uint8Array(bin.length);
      for (let i=0; i < bin.length; i++) arr[i]=bin.charCodeAt(i);
      const mime=payload.mime || 'image/jpeg';
      const file=new File([arr], 'car_photo.jpg', { type: mime });

      const deadline=Date.now() + 10000;
      while (Date.now() < deadline) {
        let inp=findInput();
        if (!inp) {
          clickUploadButton();
          await sleep(500);
          inp=findInput();
        }
        if (inp) {
          const dt=new DataTransfer();
          dt.items.add(file);
          inp.files=dt.files;
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
