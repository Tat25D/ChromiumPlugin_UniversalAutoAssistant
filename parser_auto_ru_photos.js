// parser_auto_ru_photos.js — сбор фото с Авто.ру (рабочий с дедупликацией)
window.AutoRuPhotoCollector={
  collectPhotos: async function (options) {
    const seen = {}; // Хранилище: baseId -> { url, area }
    const JUNK_RE = /(icon|logo|favicon|sprite|lock|badge|captcha|banner|reklama|placeholder|svg|gif|blank|pixel|userpic|youtube|user|tv|channel|social)/i;

    const normalize=(raw)=> {
      if (!raw) return null;
      let url=String(raw).trim();
      if (url.startsWith('//')) url='https:' + url;
      if (!/^https?:\/\//i.test(url)) return null;
      if (JUNK_RE.test(url)) return null;
      if (!/avatars\.mds\.yandex|get-autoru|get-verdauto|get-verba|pictures\.auto\.ru/i.test(url)) return null;
      return url;
    };

    const add=(rawUrl)=> {
      const url=normalize(rawUrl);
      if (!url) return;

      // Ищем размер в URL (например, 1200x900)
      let dimMatch = url.match(/(\d{3,4})x(\d{3,4})/i);
      let area = 0;
      let baseId = url;

      if (dimMatch) {
        area = parseInt(dimMatch[1], 10) * parseInt(dimMatch[2], 10);
        baseId = url.slice(0, dimMatch.index); // Базовый ID без размера
      } else {
        area = 99999999; // Если размера нет — это оригинал (макс. приоритет)
      }

      // Сохраняем только фото с макс. разрешением
      if (!seen[baseId] || area > seen[baseId].area) {
        seen[baseId] = { url: url, area: area };
      }
    };

    // Сканируем только теги с картинками!
    document.querySelectorAll('img, picture source').forEach(el => {
      add(el.getAttribute('src'));
      add(el.getAttribute('data-src'));
      if (el.getAttribute('srcset')) {
        el.getAttribute('srcset').split(',').forEach(p => add(p.trim().split(/\s+/)[0]));
      }
    });

    // Сканируем фоны
    document.querySelectorAll('div[style*="background-image"]').forEach(div => {
      const style = div.getAttribute('style') || '';
      const match = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && match[1]) add(match[1]);
    });

    return Object.values(seen).map(item => item.url);
  }
};
