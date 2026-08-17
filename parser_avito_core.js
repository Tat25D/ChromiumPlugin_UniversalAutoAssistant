// ПАРСИНГ ТЕКСТА И ХАРАКТЕРИСТИК АВТО (Семантический поиск + Fallback по URL)
window.AvitoParserCore = {
  parseTextData: function () {
    const pageText = document.body.innerText || "";
    const pageLines = pageText.split('\n').map(l => l.trim().replace(/[\u200B-\u200D\uFEFF]/g, "")).filter(l => l.length > 0);
    const carParams = {};

    // 1. СЕМАНТИЧЕСКИЙ ПОИСК: Ищем неизменяемые строки
    const KNOWN_KEYS = [
      "Марка", "Модель", "Год выпуска", "Поколение", "Пробег", "ПТС",
      "Владельцев по ПТС", "Состояние", "Объём двигателя", "Тип двигателя",
      "Коробка передач", "Привод", "Комплектация", "Тип кузова", "Цвет", "Руль",
      "VIN или номер кузова", "Страна марки", "Модификация"
    ];

    for (let i = 0; i < pageLines.length; i++) {
      const line = pageLines[i];
      if (line.includes(':')) {
        const parts = line.split(':');
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim();
        if (key && value && KNOWN_KEYS.includes(key)) {
          carParams[key] = value;
          continue;
        }
      }
      for (const k of KNOWN_KEYS) {
        if (line === k) {
          if (i < pageLines.length - 1) {
            let nextLine = pageLines[i + 1];
            if (!KNOWN_KEYS.includes(nextLine) && !nextLine.includes(':')) {
               carParams[line] = nextLine;
               i++;
            }
          }
          continue;
        }
        if (!carParams[k] && line.startsWith(k) && line.length > k.length + 1) {
          const v = line.slice(k.length).trim();
          if (v) { carParams[k] = v; break; }
        }
      }
    }

    // 2. ВЫТАСКИВАЕМ ОСНОВНЫЕ ДАННЫЕ (заголовок, цена, описание)
    const title = document.querySelector('[data-marker="item-view/title-info"]')?.textContent?.trim() ||
                  document.querySelector('h1')?.textContent?.trim() ||
                  document.title || "Не указано";

    // Цена с фолбэком в мета-тег og:title
    let rawPrice = "0";
    const priceElem = document.querySelector('[data-marker="item-view/price"]');
    if (priceElem) {
      rawPrice = priceElem.getAttribute('content') || "0";
    }
    if (rawPrice === "0" || !rawPrice) {
      // Фолбэк: пробуем вытащить цену из мета-тега og:title (всегда отдаётся сервером)
      const og = document.querySelector('meta[property="og:title"]');
      if (og) {
        const m = (og.getAttribute('content') || '').match(/([\d\s\u00A0]{4,})\s*(?:руб|₽)/i);
        if (m) { rawPrice = m[1].replace(/\s/g, ''); }
      }
    }
    if (rawPrice === "0") {
      const priceMatch = pageText.match(/(\d[\d\s]*)\s*₽/);
      rawPrice = priceMatch ? priceMatch[1].replace(/\s/g, '') : "0";
    }

    const description = document.querySelector('[data-marker="item-view/item-description"], [class*="style-item-description"]')?.textContent?.trim() || "";
    const cleanDescUpper = description.toUpperCase().replace(/[^А-ЯA-Z0-9\s]/g, "");

    let location = "Не указано";
    const addressElem = document.querySelector('[data-marker="delivery/location"], [data-marker="item-view/address"]');
    if (addressElem) {
      location = addressElem.textContent.trim();
    } else {
      const locLine = pageLines.find(l => l.includes("край") || l.includes("обл.") || l.includes("район"));
      if (locLine) location = locLine;
    }

    let id_advert = "Не указано";
    const idMatch = pageText.match(/№\s*(\d+)/);
    if (idMatch) id_advert = "№" + idMatch[1];

    let mileageHistoryCount = "0";
    const historyMatch = pageText.match(/(\d+)\s+запис/i);
    if (historyMatch) mileageHistoryCount = historyMatch[1];

    let aiPrice = "Нет оценки";
    const targetPhrase = "Оценка нейросети";
    const phraseIndex = pageText.indexOf(targetPhrase);
    if (phraseIndex !== -1) {
      const textAfterPhrase = pageText.substring(phraseIndex + targetPhrase.length, phraseIndex + targetPhrase.length + 200);
      const foundNumbers = textAfterPhrase.match(/\d[\d\s]*/g);
      if (foundNumbers && foundNumbers.length > 0) {
        const firstPrice = foundNumbers[0].replace(/\s/g, '').trim();
        if (firstPrice.length >= 4) aiPrice = firstPrice;
      }
    }

    let hasGbo = (cleanDescUpper.includes("ГБО") || cleanDescUpper.includes("ГАЗОБАЛЛОН") ||
      cleanDescUpper.includes("МЕТАН") || cleanDescUpper.includes("ПРОПАН")) ? "есть" : "нет";

    let hasConditioner = (cleanDescUpper.includes("КОНДИЦИОНЕР") || cleanDescUpper.includes("КОНДЕР") ||
      cleanDescUpper.includes("КЛИМАТ")) ? "есть" : "нет";
    const globalTextUpper = pageText.toUpperCase();
    if (hasConditioner === "нет" && (globalTextUpper.includes("КОНДИЦИОНЕР") || globalTextUpper.includes("КЛИМАТ"))) {
      hasConditioner = "есть";
    }

    let autoName = "Не указано";
    const brand = carParams["Марка"] || "";
    const model = carParams["Модель"] || "";
    if (brand || model) {
      autoName = `${brand} ${model}`.trim();
    } else if (title && title !== "Не указано") {
      autoName = title.split(',')[0].trim();
    }

    let mileage = carParams["Пробег"] ? carParams["Пробег"].replace(/[^0-9]/g, '') : "Не указано";
    if (mileage === "Не указано" || mileage === "") {
      const mileageMatch = title.match(/,\s*([\d\s]+)\s*км/);
      if (mileageMatch) mileage = mileageMatch[1].replace(/\s/g, '');
    }

    let hp = "Не указано";
    const modif = carParams["Модификация"] || "";
    const hpMatch = modif.match(/(\d+)\s*л\.с/);
    if (hpMatch) hp = hpMatch[1];

    let yearStr = carParams["Год выпуска"] || "Не указано";
    let engine_capacity = carParams["Объём двигателя"] ? carParams["Объём двигателя"].replace(/[^0-9.]/g, '') : "Не указано";

    // ======================================================
    // ЗАПАСНОЙ ПАРСЕР ИЗ URL (ОБХОД СМЕНЫ ВЁРСТКИ АВТО)
    // Авито всегда вставляет год, пробег и объём в адресную строку
    // Пример URL: .../kia_picanto_1.1_at_2010_191_715_km_8165019545
    // ======================================================
    if (yearStr === 'Не указано' || mileage === 'Не указано' || engine_capacity === 'Не указано') {
      const urlStr = location.pathname + ' ' + document.title;

      if (yearStr === 'Не указано') {
        const ym = urlStr.match(/_(19|20)\d{2}_/i);
        if (ym) yearStr = ym[0].replace(/_/g, '');
      }

      if (mileage === 'Не указано') {
        // Ищем паттерн: _191_715_km или _191 715 км
        const mm = urlStr.match(/_(\d{1,3}[_\s]\d{3})_км/i);
        if (mm) mileage = mm[1].replace(/[^\d]/g, '');
      }

      if (engine_capacity === 'Не указано') {
        // Ищем объём: _1.1_ или _1.0_
        const em = urlStr.match(/_(\d\.\d)_/i);
        if (em) engine_capacity = em[1];
      }
    }

    // 6. ВОЗВРАЩАЕМ ИТОГОВЫЙ ОБЪЕКТ
    return {
      id_advert: id_advert,
      title: title,
      price: rawPrice,
      ai_price: aiPrice,
      location: location,
      description: description,
      auto_name: autoName,
      country: carParams["Страна марки"] || "Россия",
      year: yearStr,
      generation: carParams["Поколение"] || "Не указано",
      mileage: mileage,
      mileage_history: mileageHistoryCount,
      pts: carParams["ПТС"] || "Не указано",
      owners: carParams["Владельцев по ПТС"] ? carParams["Владельцев по ПТС"].replace(/[^0-9]/g, '') : "Не указано",
      condition: carParams["Состояние"] || "Не указано",
      modification: modif || "Не указано",
      engine_capacity: engine_capacity,
      horsepower: hp,
      gbo: hasGbo,
      engine_type: carParams["Тип двигателя"] || "Не указано",
      transmission: carParams["Коробка передач"] || "Не указано",
      drive_type: carParams["Привод"] || "Не указано",
      equipment: carParams["Комплектация"] || "Не указано",
      body_type: carParams["Тип кузова"] || "Не указано",
      color: carParams["Цвет"] || "Не указано",
      wheel: carParams["Руль"] || "Не указано",
      vin: carParams["VIN или номер кузова"] || "Не указано",
      conditioner: hasConditioner
    };
  }
};
