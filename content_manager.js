// content_manager.js — единый менеджер парсинга (Avito/Drom)
(() => {
  if (window.__universalAutoManagerStarted) return;
  window.__universalAutoManagerStarted = true;

  const isAvito = /(^|\.)avito\.ru$/i.test(location.hostname);
  const isDrom = /(^|\.)drom\.ru$/i.test(location.hostname);
  const isAutoRu = /(^|\.)auto\.ru$/i.test(location.hostname);   // <<< НОВОЕ

  function cleanValue(v) {
    if (v === null || v === undefined) return 'Не указано';
    const s = String(v)
      .trim()
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
    if (!s || s === 'Не указано' || s === '—') return 'Не указано';
    return s;
  }

  function digitsOnly(v) {
    const s = cleanValue(v).replace(/[^0-9]/g, '');
    return s || 'Не указано';
  }

  function hashString(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function extractUid(raw) {
    const fromId = String((raw && raw.id_advert) || '').match(/\d{5,}/);
    if (fromId) return fromId[0];

    let m = location.pathname.match(/_(\d{6,})(?:[/?#]|$)/);
    if (m) return m[1];

    m = location.pathname.match(/\/(\d{4,})\.html/);
    if (m) return m[1];

    m = location.href.match(/(\d{7,})(?:[/?#]|$)/);
    if (m) return m[1];

    m = location.pathname.match(/\/(\d{6,})(?:[/?#]|$)/);
    if (m) return m[1];

    return 'url_' + hashString(location.pathname + '|' + location.search);
  }

  function normalizeRaw(raw) {
    raw = raw || {};

    const photos = Array.isArray(raw.photos_urls)
      ? [...new Set(raw.photos_urls.filter(Boolean))]
      : [];

    const uid = extractUid(raw);

    const aiRaw = cleanValue(raw.ai_price);
    let ai_estimated_rub = '—';
    if (aiRaw !== 'Не указано' && !/нет оценки/i.test(aiRaw)) {
      const digits = aiRaw.replace(/[^0-9]/g, '');
      if (digits) ai_estimated_rub = digits;
    }

    const priceRaw = digitsOnly(raw.price);
    const price_rub = (priceRaw === 'Не указано' || priceRaw === '0')
      ? 'Не указано'
      : priceRaw;

    const db_fields = {
      uid,
      source_site: cleanValue(location.hostname),
      source_url: cleanValue(location.href),
      id_advert: cleanValue(raw.id_advert),
      car_display_name: cleanValue(raw.auto_name || raw.title),
      title: cleanValue(raw.title),
      production_year: cleanValue(raw.year),
      total_mileage_km: digitsOnly(raw.mileage),
      price_rub,
      ai_estimated_rub,
      location: cleanValue(raw.location),
      country: cleanValue(raw.country),
      generation: cleanValue(raw.generation),
      engine_volume_liters: cleanValue(raw.engine_capacity),
      engine_horsepower: digitsOnly(raw.horsepower),
      engine_fuel_type: cleanValue(raw.engine_type),
      engine_modification: cleanValue(raw.modification),
      transmission_type: cleanValue(raw.transmission),
      drive_unit_type: cleanValue(raw.drive_type),
      equipment_name: cleanValue(raw.equipment),
      body_style: cleanValue(raw.body_type),
      body_color: cleanValue(raw.color),
      wheel: cleanValue(raw.wheel),
      owners_count: digitsOnly(raw.owners),
      pts_type: cleanValue(raw.pts),
      car_condition: cleanValue(raw.condition),
      vin_code: cleanValue(raw.vin),
      gbo: cleanValue(raw.gbo),
      conditioner: cleanValue(raw.conditioner),
      mileage_history_count: digitsOnly(raw.mileage_history),
      full_text_description: cleanValue(raw.description)
    };

    return {
      db_fields,
      links_manifest: photos
    };
  }

  async function runUniversalManager(options) {
    const opts = options || {};
    let raw = null;

    if (isAvito) {
      if (!window.AvitoParser) throw new Error('AvitoParser не загружен');
      raw = await window.AvitoParser.parse(opts);
    } else if (isDrom) {
      if (!window.DromParser) throw new Error('DromParser не загружен');
      raw = await window.DromParser.parse(opts);
    } else if (isAutoRu) {                                              // <<< НОВОЕ
      if (!window.AutoRuParser) throw new Error('AutoRuParser не загружен');
      raw = await window.AutoRuParser.parse(opts);
    } else {
      throw new Error('Сайт не поддерживается: ' + location.hostname);
    }

    if (!raw) throw new Error('Парсер вернул null');
    return normalizeRaw(raw);
  }

  window.runUniversalManager = runUniversalManager;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === 'ping') {
      sendResponse({ ok: true, site: location.hostname });
      return false;
    }
    if (!msg || msg.action !== 'parse_data') return false;

    runUniversalManager(msg.options || {})
      .then((data) => sendResponse(data))
      .catch((e) => {
        console.error('[content_manager] parse_data error:', e);
        sendResponse(null);
      });

    return true; // async sendResponse
  });
})();
