// СБОР ФОТО ИЗ DOM + КЛИК-ЦИКЛ (меняется при изменениях Авито)
window.AvitoPhotoCollector = {
  collectPhotos: async function (options) {
    const opts = options || {};
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    const CDN_RE = /(avito-st\.com|avito\.st|avitonst\.ru)/i;
    const JUNK_RE = /(avatar|icon|logo|favicon|sprite|lock|badge)/i;
    const ID_RE = /^(.*?\/1\.[A-Za-z0-9_-]{6})/;
    const CODE_RE = /\/1\.[A-Za-z0-9_-]{6}a(\d)/;
    const seen = new Map();

    const normalize = (raw) => {
      if (!raw) return null;
      let url = String(raw).trim();
      if (url.startsWith('//')) url = 'https:' + url;
      if (!/^https?:\/\//i.test(url)) return null;
      if (JUNK_RE.test(url) || !CDN_RE.test(url)) return null;
      return url;
    };

    const add = (raw) => {
      const url = normalize(raw);
      if (!url) return;
      const idm = url.match(ID_RE);
      const key = idm ? idm[1] : url.replace(/\/\d+x\d+\//, '/');
      const cm = url.match(CODE_RE);
      const code = cm ? parseInt(cm[1], 10) : 0;
      const prev = seen.get(key);
      if (!prev) { seen.set(key, { url, code }); return; }
      if (code > prev.code) seen.set(key, { url, code });
    };

    const addImg = (img) => {
      add(img.getAttribute('data-src'));
      if (img.getAttribute('srcset')) {
        img.getAttribute('srcset').split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
      }
      add(img.currentSrc || img.src);
    };

    const collectDomUrls = () => {
      const out = [];
      document.querySelectorAll('img').forEach(img => {
        out.push(img.currentSrc || img.src);
        out.push(img.getAttribute('data-src'));
        if (img.getAttribute('srcset')) {
          img.getAttribute('srcset').split(',').forEach(p => out.push(p.trim().split(/\s+/)[0]));
        }
      });
      return out.filter(Boolean);
    };

    const gallery =
      document.querySelector('[data-marker="item-view/gallery"]') ||
      document.querySelector('[data-marker="item-view/gallery-slider"]') ||
      document.querySelector('[data-marker="item-view/photo"]') ||
      document.querySelector('[data-marker*="gallery" i]') ||
      document.querySelector('[class*="gallery" i]');

    let galleryImgs = [];
    if (gallery) {
      gallery.querySelectorAll('img').forEach(addImg);
      galleryImgs = [...gallery.querySelectorAll('img')];
    }

    if (opts.savePhotos === false) {
      console.log('✓ ГАЛОЧКА ВЫКЛЮЧЕНА: пропускаю клик-цикл');
      return [...seen.values()].map(v => v.url);
    }

    console.log('✓ ГАЛОЧКА ВКЛЮЧЕНА: запускаю клик-цикл');

    const baseline = new Set(collectDomUrls());

    const scanNew = () => {
      collectDomUrls().forEach(u => {
        if (baseline.has(u)) return;
        baseline.add(u);
        add(u);
      });
    };

    const topOverlay = () => {
      try {
        const stack = document.elementsFromPoint(
          Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2));
        for (const el of stack) {
          if (!(el instanceof Element)) continue;
          const cs = getComputedStyle(el);
          if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
          const r = el.getBoundingClientRect();
          if (r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8) return el;
        }
      } catch (e) {}
      return null;
    };

    const closeViewer = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!topOverlay()) return;
        try {
          const ev = new KeyboardEvent('keydown', {
            key: 'Escape', code: 'Escape', keyCode: 27, which: 27,
            bubbles: true, cancelable: true
          });
          document.dispatchEvent(ev);
        } catch (e) {}
        await sleep(300);
        if (!topOverlay()) return;

        try {
          const overlay = topOverlay();
          const btn = overlay && overlay.querySelector(
            '[data-marker*="close" i], [class*="close" i]');
          if (btn) {
            btn.click();
            await sleep(300);
            if (!topOverlay()) return;
          }
        } catch (e) {}

        try {
          const corner = document.elementsFromPoint(10, 10)[0];
          if (corner) {
            corner.dispatchEvent(new MouseEvent('click', { bubbles: true }));
          }
        } catch (e) {}
        await sleep(300);
      }
    };

    const clicked = new Set();
    for (const img of galleryImgs.slice(0, 10)) {  // 10 вместо 20
      const u = img.currentSrc || img.src || '';
      const idm = u.match(ID_RE);
      const photoId = idm ? idm[1] : u;
      if (!photoId || clicked.has(photoId)) continue;
      clicked.add(photoId);

      try {
        img.scrollIntoView({ block: 'center' });
        img.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        await sleep(500);  // 500мс вместо 700мс
        scanNew();
      } catch (e) {}

      await closeViewer();
    }
    scanNew();

    return [...seen.values()].map(v => v.url);
  }
};
