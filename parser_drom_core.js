// parser_drom_core.js — извлечение данных с drom.ru (актуальная вёрстка 2026).
// Источники по приоритету: JSON-модуль bull-page → таблица характеристик → candy.config / ld+json.
window.DromParserCore = {
  parseTextData: function () {
    var pageText = document.body ? (document.body.innerText || '') : '';

    //---------- 0) JSON-модуль bull-page ----------
    var bull = null;
    try {
      var node = document.querySelector('script[data-drom-module="bull-page"]');
      if (node) bull = JSON.parse(node.textContent);
    } catch (e) {}

    var bd = null, priceConst = null, additional = '', vinJson = '', marketPrice = 0, geoCity = '';
    if (bull) {
      bd = (bull.bullDescription && bull.bullDescription.fields) || null;
      priceConst = bull.priceWidgetData && bull.priceWidgetData.constants;
      if (bull.priceWidgetData && bull.priceWidgetData.goodDealConfig) {
        marketPrice = bull.priceWidgetData.goodDealConfig.marketPrice || 0;
      }
      if (bull.additionalInfo) additional = bull.additionalInfo.visible || '';
      if (bull.report && bull.report.fields) {
        for (var rf = 0; rf < bull.report.fields.length; rf++) {
          if (bull.report.fields[rf].name === 'VIN' && bull.report.fields[rf].value) vinJson = bull.report.fields[rf].value;
        }
      }
      if (bull.geoInfo && bull.geoInfo.length) geoCity = bull.geoInfo[0].text || '';
    }

    function field(type) {
      if (!bd) return null;
      for (var i = 0; i < bd.length; i++) if (bd[i].type === type) return bd[i].payload;
      return null;
    }

    //---------- 1) таблица характеристик ----------
    var spec = {};
    var rows = document.querySelectorAll('table[data-ftid="bulletin-specifications"] tr');
    for (var i = 0; i < rows.length; i++) {
      var th = rows[i].querySelector('th[data-ftid="property"]');
      var td = rows[i].querySelector('td[data-ftid="value"]');
      if (th && td) spec[(th.textContent || '').trim()] = (td.textContent || '').trim();
    }

    //---------- фолбэк: построчный скан (старая вёрстка) ----------
    if (!Object.keys(spec).length) {
      var lines = pageText.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l; });
      var KEYS = ['Год выпуска', 'Пробег', 'Двигатель', 'Мощность', 'Коробка передач', 'Коробка', 'Привод', 'Тип кузова', 'Кузов', 'Цвет', 'Руль', 'Владельцы', 'Поколение', 'ПТС', 'Состояние'];
      for (var a = 0; a < lines.length; a++) {
        for (var b = 0; b < KEYS.length; b++) {
          var k = KEYS[b];
          if (lines[a] === k && lines[a + 1]) { spec[k] = lines[a + 1]; a++; break; }
          if (!spec[k] && lines[a].indexOf(k) === 0 && lines[a].length > k.length + 1) { spec[k] = lines[a].slice(k.length).trim(); break; }
        }
      }
    }

    //---------- 2) candy.config ----------
    var candy = {};
    try {
      var cm = document.querySelector('meta[name="candy.config"]');
      if (cm) {
        var cc = JSON.parse((cm.getAttribute('content') || '').replace(/&quot;/g, '"'));
        candy = (cc && cc.cf) || {};
      }
    } catch (e) {}

    //---------- 3) ld+json ----------
    var ld = {};
    var lds = document.querySelectorAll('script[type="application/ld+json"]');
    for (var j = 0; j < lds.length; j++) {
      try {
        var o = JSON.parse(lds[j].textContent);
        if (o && o['@type'] === 'Car') ld = o;
      } catch (e) {}
    }

    //---------- имя авто ----------
    var h1 = document.querySelector('h1');
    var title = (h1 && h1.textContent.trim()) || document.title || '';
    var autoName = ((ld.brand && ld.brand.name) ? ld.brand.name + ' ' : '') + (ld.model || ld.name || '');
    if (!autoName && title) autoName = title.replace(/^Продажа\s+/, '').split(',')[0].trim();
    if (!autoName) autoName = 'Не указано';

    //---------- год ----------
    var year = spec['Год выпуска'] || (field('year') ? String(field('year')) : '') ||
      (ld.vehicleModelDate ? String(ld.vehicleModelDate) : '') || (candy.y ? String(candy.y) : '');
    if (!year) { var ym = title.match(/(19|20)\d{2}/); year = ym ? ym[0] : 'Не указано'; }

    //---------- пробег ----------
    var mJson = field('mileage');
    var mSpec = (spec['Пробег'] || '').replace(/[^\d]/g, '');
    var mileage = (mJson && mJson.mileage) ? String(mJson.mileage)
      : mSpec ? mSpec
      : (ld.mileageFromOdometer && ld.mileageFromOdometer.value) ? String(ld.mileageFromOdometer.value).replace(/[^\d]/g, '')
      : 'Не указано';

    //---------- двигатель: объём, топливо, мощность ----------
    var engStr = spec['Двигатель'] || '';
    var volJson = field('engine');
    var volume = (volJson && volJson.volume) ? String(volJson.volume).replace(',', '.') : '';
    if (!volume) { var vm = engStr.match(/(\d+(?:[.,]\d+)?)\s*л\b/i); volume = vm ? vm[1].replace(',', '.') : ''; }
    // топливо — ТОЛЬКО из строки двигателя/JSON, не из всей страницы (иначе "Электромобили" → "электро")
    var fuel = '';
    if (engStr) { var fm = engStr.match(/(бензин|дизель|гибрид|газ|электро)/i); fuel = fm ? fm[1].toLowerCase() : ''; }
    if (!fuel && volJson && volJson.fuelType) fuel = String(volJson.fuelType).toLowerCase();
    if (!fuel) fuel = 'Не указано';

    var pJson = field('power');
    var pSpec = (spec['Мощность'] || '').match(/(\d+)\s*л\.с/i);
    var horsepower = (pJson && pJson.power) ? String(pJson.power) : (pSpec ? pSpec[1] : 'Не указано');

    //---------- КПП / привод / кузов / цвет / руль / владельцы / поколение ----------
    var transRaw = (spec['Коробка передач'] || '').toLowerCase();
    var transMap = { 'механика': 'Механика', 'автомат': 'Автомат', 'робот': 'Робот', 'вариатор': 'Вариатор' };
    var transmission = transMap[transRaw] || (spec['Коробка передач'] || 'Не указано');

    var drive = spec['Привод'] || 'Не указано';
    drive = drive.charAt(0).toUpperCase() + drive.slice(1);
    var body = spec['Тип кузова'] || 'Не указано';
    var color = spec['Цвет'] || 'Не указано';
    var wheel = spec['Руль'] || 'Не указано';
    wheel = wheel.charAt(0).toUpperCase() + wheel.slice(1);
    var generation = spec['Поколение'] ||
      (field('generation') && field('generation').generationName ? field('generation').generationName : '') ||
      'Не указано';

    var ownersMap = { one: '1', two: '2', three: '3', four_or_more: '4 и более' };
    var ownersJson = field('numberOfOwners');
    var owners = spec['Владельцы'] || (ownersJson ? (ownersMap[ownersJson] || String(ownersJson)) : '') || 'Не указано';

    //---------- цена + рыночная оценка ----------
    var price = (priceConst && priceConst.price) ? String(priceConst.price)
      : (candy.p ? String(candy.p)
      : (ld.offers && ld.offers.price != null) ? String(ld.offers.price).replace(/[^\d]/g, '')
      : '');
    if (!price) { var pm = pageText.match(/([\d\s\u00A0]{5,})\s*₽/); price = pm ? pm[1].replace(/[^\d]/g, '') : '0'; }
    // на Дроме нет ИИ-оценки рыночной стоимости — в ИИ-чат её не отправляем
    var aiPrice = 'Нет оценки';

    //---------- VIN ----------
    var vin = vinJson || (ld.vehicleIdentificationNumber || '') ||
      (field('frame') && field('frame').frameNumber ? field('frame').frameNumber : '') || 'Не указано';

    //---------- описание ----------
    var desc = additional;
    if (!desc) {
      var dnode = document.querySelector('[data-ftid="bulletin-description"]');
      if (dnode) desc = (dnode.textContent || '').trim();
    }
    if (!desc) desc = 'Не указано';

    //---------- ПТС / состояние (если есть в тексте) ----------
    var pts = spec['ПТС'] || 'Не указано';
    if (pts === 'Не указано') {
      var ptsM = pageText.match(/ПТС\s*\n?\s*(Оригинал|Дубликат|Электронный)/i);
      if (ptsM) pts = ptsM[1];
    }
    var condition = spec['Состояние'] || 'Не указано';
    if (condition === 'Не указано') {
      var condM = pageText.match(/Состояние\s*\n?\s*([^\n]{2,40})/i);
      if (condM) condition = condM[1].trim();
    }

    //---------- модификация ----------
    var transCode = { 'Механика': 'MT', 'Автомат': 'AT', 'Робот': 'AMT', 'Вариатор': 'CVT' }[transmission] || '';
    var modification = volume
      ? volume + ' ' + transCode + (horsepower !== 'Не указано' ? ' (' + horsepower + ' л.с.)' : '')
      : 'Не указано';

    //---------- gbo / кондиционер ----------
    var up = desc.toUpperCase();
    var gbo = ((volJson && volJson.isGbo) || /ГБО|ГАЗОБАЛЛОН|МЕТАН|ПРОПАН/.test(up)) ? 'есть' : 'нет';
    var conditioner = /КОНДИЦИОНЕР|КЛИМАТ/.test(up) ? 'есть' : 'нет';

    //---------- записи истории пробега ----------
    var mileageHistory = '0';
    var hm = pageText.match(/(\d+)\s*запис\w+\s*в\s*истории\s*пробега/i);
    if (hm) mileageHistory = hm[1];

    //---------- id / локация ----------
    var idM = location.pathname.match(/\/(\d{4,})\.html/);
    var id_advert = idM ? ('№' + idM[1]) : 'Не указано';

    return {
      id_advert: id_advert,
      title: title || 'Не указано',
      price: price,
      ai_price: aiPrice,
      location: geoCity || 'Не указано',
      description: desc,
      auto_name: autoName,
      country: 'Не указано',
      year: year,
      generation: generation,
      mileage: mileage,
      mileage_history: mileageHistory,
      pts: pts,
      owners: owners,
      condition: condition,
      modification: modification,
      engine_capacity: volume || 'Не указано',
      horsepower: horsepower,
      gbo: gbo,
      engine_type: fuel,
      transmission: transmission,
      drive_type: drive,
      equipment: spec['Комплектация'] || 'Не указано',
      body_type: body,
      color: color,
      wheel: wheel,
      vin: vin,
      conditioner: conditioner
    };
  }
};
