// parser_auto_ru_core.js — парсинг данных авто с auto.ru
console.log('[AutoRuParser] Скрипт core загружен');
window.AutoRuParserCore = {

  readLdJson: function () {
    const out = {};
    try {
      const nodes = document.querySelectorAll('script[type="application/ld+json"]');
      for (const node of nodes) {
        let root = null;
        try { root = JSON.parse(node.textContent || 'null'); } catch (e) {}
        if (!root) continue;

        const stack = [root];
        while (stack.length) {
          const cur = stack.pop();
          if (!cur || typeof cur !== 'object') continue;
          if (Array.isArray(cur)) { for (const v of cur) stack.push(v); continue; }

          if (cur['@type'] === 'Car' || cur['@type'] === 'Product' || (cur.brand && cur.name)) {
            if (cur.name && !out.name) out.name = String(cur.name);

            if (cur.brand) {
              if (typeof cur.brand === 'object' && cur.brand.name) out.make = String(cur.brand.name);
              else if (typeof cur.brand === 'string') out.make = String(cur.brand);
            }
            if (cur.model && !out.model) out.model = String(cur.model);

            const yearSrc = cur.productionDate || cur.modelDate || cur.vehicleModelDate;
            if (yearSrc && !out.year) out.year = String(yearSrc).slice(0, 4);

            if (cur.vehicleIdentificationNumber && !out.vin) out.vin = String(cur.vehicleIdentificationNumber);
            if (cur.color && !out.color) out.color = String(cur.color);

            if (cur.vehicleTransmission && !out.trans) {
              const t = String(cur.vehicleTransmission);
              const tm = t.match(/(Manual|Automatic|CVT|Robot|Механическая|Автоматическая|Вариатор|Робот)/i);
              out.trans = tm ? tm[1] : t;
            }

            if (cur.mileageFromOdometer && !out.mileage) {
              const m = cur.mileageFromOdometer;
              const val = (typeof m === 'object' && m.value !== undefined) ? m.value : m;
              out.mileage = String(val).replace(/\D/g, '');
            }

            if (cur.offers && cur.offers.price != null && !out.price) {
              out.price = String(cur.offers.price).replace(/\D/g, '');
            }

            if (cur.vehicleEngine) {
              const e = cur.vehicleEngine;
              if (e.engineDisplacement && !out.vol) {
                const d = e.engineDisplacement;
                const val = (typeof d === 'object' && d.value !== undefined) ? d.value : d;
                out.vol = String(val).replace(/[^\d.,]/g, '');
              }
              if (e.enginePower && !out.hp) {
                const p = e.enginePower;
                const val = (typeof p === 'object' && p.value !== undefined) ? p.value : p;
                out.hp = String(val).replace(/\D/g, '');
              }
              if (e.fuelType && !out.fuel) {
                const f = String(e.fuelType);
                out.fuel = f.split('/').pop();
              }
            }
          }
          for (const k in cur) stack.push(cur[k]);
        }
        if (out.price) break;
      }
    } catch (e) {}
    return out;
  },

  parseTextData: function () {
    const pageText = document.body.innerText || "";
    const pageLines = pageText.split('\n')
      .map(function (l) { return l.trim().replace(/[\u200B-\u200D\uFEFF]/g, ''); })
      .filter(function (l) { return l.length; });

    const ld = this.readLdJson();
    const carParams = {};

    const KNOWN_KEYS = [
      'Год выпуска', 'Пробег', 'Владельцы', 'Владельцев по ПТС', 'Владельцев',
      'Во владении', 'Налог', 'Состояние', 'ПТС', 'Таможня', 'Госномер',
      'Комплектация', 'Двигатель', 'Объём двигателя', 'Мощность', 'Топливо',
      'Коробка передач', 'Коробка', 'Привод', 'Руль', 'Тип кузова', 'Кузов',
      'Цвет', 'Модификация', 'VIN', 'Номер кузова'
    ];

    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];
      if (line.includes(':')) {
        const parts = line.split(':');
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim();
        if (key && value && key.length < 40 && !carParams[key]) carParams[key] = value;
        continue;
      }
      for (const k of KNOWN_KEYS) {
        if (line === k) {
          if (i < pageLines.length - 1 && !carParams[k]) carParams[k] = pageLines[i + 1];
          i++;
          break;
        }
        if (!carParams[k] && line.startsWith(k) && line.length > k.length + 1) {
          const v = line.slice(k.length).trim();
          if (v) { carParams[k] = v; break; }
        }
      }
    }

    const idMatch = location.pathname.match(/\/(\d{6,})(?:[-/]|$)/);
    const id_advert = idMatch ? ('№' + idMatch[1]) : 'Не указано';

    const pathParts = location.pathname.split('/').filter(Boolean);
    let city = 'Не указано';
    const saleIdx = pathParts.indexOf('sale');
    if (saleIdx !== -1 && saleIdx + 1 < pathParts.length) {
      const cityCandidate = pathParts[saleIdx + 1];
      if (cityCandidate && /^[a-zа-я-]+$/i.test(cityCandidate) && !/^(cars|catalog|all)$/.test(cityCandidate)) {
        city = cityCandidate.charAt(0).toUpperCase() + cityCandidate.slice(1);
      }
    }

    const h1 = document.querySelector('h1');
    const title = (h1 && h1.textContent.trim()) || document.title || 'Не указано';
    let autoName = '';
    if (ld.make && ld.model) autoName = ld.make + ' ' + ld.model;
    else if (ld.name) autoName = ld.name;

    if (!autoName && title !== 'Не указано') {
      autoName = title.replace(/^Купить\s+b\/у\s*/i, '').replace(/^Продажа\s+/i, '').split(',')[0].trim();
    }
    if (!autoName) autoName = 'Не указано';

    function digitsOk(p) {
      p = (p || '').replace(/\D/g, '');
      return (p.length >= 5 && p.length <= 9) ? p : null;
    }
    let rawPrice = ld.price || '0';
    if (rawPrice === '0') {
      const og = document.querySelector('meta[property="og:title"]');
      if (og) {
        const m = (og.getAttribute('content') || '').match(/([\d\s\u00A0]{4,})\s*(?:руб|₽)/i);
        if (m) { const p = digitsOk(m[1]); if (p) rawPrice = p; }
      }
    }
    if (rawPrice === '0') {
      const re = /([\d\s\u00A0]{4,})\s*(?:₽|руб)/g;
      for (let i = 0; i < pageLines.length; i++) {
        let m;
        while ((m = re.exec(pageLines[i])) !== null) {
          const p = digitsOk(m[1]);
          if (p) { rawPrice = p; break; }
        }
        if (rawPrice !== '0') break;
      }
    }

    let yearStr = carParams['Год выпуска'] || ld.year || '';
    if (!yearStr) { const ym = title.match(/(19|20)\d{2}/); yearStr = ym ? ym[0] : ''; }
    yearStr = (yearStr || '').replace(/\D/g, '') || 'Не указано';

    let mileage = ld.mileage || '';
    if (!mileage) {
      const mm = (carParams['Пробег'] || title).match(/([\d\s\u00A0]+)\s*км/);
      mileage = mm ? mm[1].replace(/\s/g, '') : 'Не указано';
    }

    const ownersSrc = carParams['Владельцы'] || carParams['Владельцев по ПТС'] || carParams['Владельцев'] || 'Не указано';

    const engStr = carParams['Двигатель'] || carParams['Объём двигателя'] || '';
    const volSource = String(engStr).replace(/\d+(?:[.,]\d+)?\s*л\.с\.?/gi, '');
    const capMatch = volSource.match(/(\d+(?:[.,]\d+)?)\s*л/i);
    const engine_capacity = capMatch ? capMatch[1].replace(',', '.') : (ld.vol || 'Не указано');

    const hpSource = carParams['Мощность'] || engStr;
    const hpMatch = hpSource.match(/(\d+)\s*л\.с\.?/i);
    const horsepower = hpMatch ? hpMatch[1] : (ld.hp || 'Не указано');

    const fuelSource = carParams['Топливо'] || engStr || ld.fuel || pageText;
    const fuelMatch = fuelSource.match(/(бензин|дизель|гибрид|электро|газ|метан|пропан)/i);

    let transmission = carParams['Коробка передач'] || carParams['Коробка'] || ld.trans || 'Не указано';
    if (transmission === 'Не указано') {
      const t = pageText.match(/\b(автомат|механика|вариатор|роботизированная|робот)\b/i);
      if (t) transmission = t[1];
    }
    const drive = carParams['Привод'] || 'Не указано';
    const body = carParams['Тип кузова'] || carParams['Кузов'] || 'Не указано';
    const color = carParams['Цвет'] || ld.color || 'Не указано';
    const wheel = carParams['Руль'] || 'Не указано';
    const equipment = carParams['Комплектация'] || 'Не указано';
    const condition = carParams['Состояние'] || 'Не указано';
    const pts = carParams['ПТС'] || 'Не указано';

    let vin = carParams['VIN'] || carParams['Номер кузова'] || ld.vin || 'Не указано';
    if (vin === 'Не указано') {
      const vm = pageText.match(/\b([A-HJ-NPR-Z0-9]{2,4}\*{4,}[A-HJ-NPR-Z0-9]*)\b/);
      if (vm) vin = vm[1];
    }

    let mileageHistory = '0';
    const hm = pageText.match(/(\d+)\s*(?:отметок|меток|запис)\w*\s*о\s*пробеге/i) || pageText.match(/(\d+)\s*запис/i);
    if (hm) mileageHistory = hm[1];

    let description = 'Не указано';
    const di = pageLines.findIndex(function (l) { return l.indexOf('Комментарий продавца') !== -1 || l.indexOf('Описание') !== -1; });
    if (di !== -1) {
      const STOP = ['Спросите у продавца', 'Комплектация', 'Подбор кредита', 'Характеристики', 'История автомобиля'];
      const chunk = [];
      for (let j = di + 1; j < pageLines.length && chunk.length < 40; j++) {
        const l = pageLines[j];
        if (STOP.some(function (s) { return l.indexOf(s) !== -1; })) break;
        chunk.push(l);
      }
      if (chunk.length) description = chunk.join(' ');
    }

    const extraFacts = [];
    if (carParams['Год выпуска']) extraFacts.push('Год выпуска: ' + carParams['Год выпуска']);
    if (carParams['Пробег']) extraFacts.push('Пробег: ' + carParams['Пробег']);
    if (carParams['Владельцы']) extraFacts.push('Владельцы: ' + carParams['Владельцы']);
    if (carParams['Во владении']) extraFacts.push('Во владении: ' + carParams['Во владении']);
    if (carParams['ПТС']) extraFacts.push('ПТС: ' + carParams['ПТС']);
    if (carParams['Двигатель']) extraFacts.push('Двигатель: ' + carParams['Двигатель']);
    if (carParams['Комплектация']) extraFacts.push('Комплектация: ' + carParams['Комплектация']);

    if (extraFacts.length) {
      description = (description === 'Не указано' ? '' : description + ' ') +
        'ДАННЫЕ СТРАНИЦЫ: ' + extraFacts.join('; ') + '.';
    }

    const cleanDescUpper = description.toUpperCase().replace(/[^А-ЯA-Z0-9\s]/g, '');
    const hasGbo = (cleanDescUpper.includes('ГБО') || cleanDescUpper.includes('ГАЗОБАЛЛОН') ||
      cleanDescUpper.includes('МЕТАН') || cleanDescUpper.includes('ПРОПАН')) ? 'есть' : 'нет';
    const hasConditioner = (cleanDescUpper.includes('КОНДИЦИОНЕР') ||
      cleanDescUpper.includes('КОНДЕР') || cleanDescUpper.includes('КЛИМАТ')) ? 'есть' : 'нет';

    return {
      id_advert: id_advert,
      title: title,
      price: rawPrice,
      ai_price: 'Нет оценки',
      location: city,
      description: description,
      auto_name: autoName,
      country: 'Не указано',
      year: yearStr,
      generation: 'Не указано',
      mileage: mileage,
      mileage_history: mileageHistory,
      pts: pts,
      owners: ownersSrc,
      condition: condition,
      modification: carParams['Модификация'] || engStr || 'Не указано',
      engine_capacity: engine_capacity,
      horsepower: horsepower,
      gbo: hasGbo,
      engine_type: fuelMatch ? fuelMatch[1] : 'Не указано',
      transmission: transmission,
      drive_type: drive,
      equipment: equipment,
      body_type: body,
      color: color,
      wheel: wheel,
      vin: vin,
      conditioner: hasConditioner
    };
  }
};
