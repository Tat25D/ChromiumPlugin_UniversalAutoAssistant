// parser_drom_photos.js — сбор фото с Дрома (только главная галерея)
window.DromPhotoCollector = {
  collectPhotos: async function (options) {
    const seen = new Set();

    const normalize = (raw) => {
      if (!raw) return null;
      let url = String(raw).trim();
      if (url.startsWith('//')) url = 'https:' + url;
      if (!/^https?:\/\//i.test(url)) return null;
      if (/(avatar|icon|logo|favicon|sprite|lock|badge|captcha|banner|reklama|placeholder|svg|gif|blank|pixel|emblem|rating|no-photo|forum)/i.test(url)) return null;

      // СТРОГО: Только фото из главной галереи (путь содержит /photo/v2/)
      if (!/\/photo\/v2\//i.test(url)) return null;
      if (!/\.(jpe?g|png|webp)$/i.test(url)) return null;
      return url;
    };

    const add = (rawUrl) => {
      const url = normalize(rawUrl);
      if (!url) return;

      // ПРОБУЕМ ПОВЫСИТЬ РАЗРЕШЕНИЕ ДО 1200px
      let upgradedUrl = url.replace(/gen\d{2,4}/i, 'gen1200');

      // Базовый ID фото (часть до /genXXX)
      let baseId = upgradedUrl.split('/gen')[0];
      if (!baseId) return;

      // Сохраняем только уникальные фото в макс. размере
      if (!seen[baseId]) {
        seen[baseId] = upgradedUrl;
      }
    };

    document.querySelectorAll('img, picture source').forEach(el => {
      add(el.getAttribute('src'));
      add(el.getAttribute('data-src'));
      if (el.getAttribute('srcset')) {
        el.getAttribute('srcset').split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
      }
    });

    return Object.values(seen);
  }
};
