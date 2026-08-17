// widget_helpers.js — вычисление стоп-признаков и проверка данных
window.UAAWidget = window.UAAWidget || {};

UAAWidget.countSentences = function (s) {
  var parts = String(s || '').split(/(?:[.!?…]+(?:\s|$))|\n+/);
  var n = 0;
  for (var i = 0; i < parts.length; i++) if (parts[i].trim().length > 2) n++;
  return n;
};

UAAWidget.computeStopFlags = function (fields, mileageAdjust, historyAdd) {
  var flags = [];
  if (!fields) return flags;

  var pts = String(fields.pts_type || fields.pts || '').toLowerCase();
  if (pts.indexOf('дубликат') !== -1) flags.push('Дубликат ПТС');
  if (pts.indexOf('электрон') !== -1) flags.push('Электронный ПТС');

  var text = (String(fields.full_text_description || '') + ' ' + String(fields.title || '')).toLowerCase();
  if (/срочн/.test(text)) flags.push('Срочная продажа');
  if (/наслед/.test(text)) flags.push('Наследство');
  if (/дарени|дарения|подарен/.test(text)) flags.push('Дарение');
  if (/доверенност/.test(text)) flags.push('Продажа по доверенности');
  if (/не собственник/.test(text)) flags.push('Продавец не собственник');
  if (/родственник/.test(text)) flags.push('Упоминание родственников');
  if (/переезд/.test(text)) flags.push('Переезд');
  if (/залог|ипотек|арест|ограничени/.test(text)) flags.push('Залог / ограничения');

  var sent = UAAWidget.countSentences(fields.full_text_description);
  if (sent > 30) flags.push('Слишком длинное описание (' + sent + ' предл.) — явно автосалон/перекуп');

  // ПРОВЕРКА: Критический пробег по объёму двигателя (с учётом ползунка)
  var adjustKm = (parseInt(mileageAdjust, 10) || 0) * 1000;
  var volStr = String(fields.engine_volume_liters || '0').replace(',', '.').replace(/[^\d.]/g, '');
  var vol = parseFloat(volStr) || 0;
  var kmStr = String(fields.total_mileage_km || '0').replace(/\D/g, '');
  var km = parseInt(kmStr, 10) || 0;

  if (vol > 0 && km > 0) {
    var limit = 0;
    if (vol >= 0.2 && vol <= 0.8) limit = 90000 + adjustKm;
    else if (vol >= 0.9 && vol <= 1.3) limit = 180000 + adjustKm;
    else if (vol >= 1.4 && vol <= 2.0) limit = 250000 + adjustKm;
    else if (vol >= 2.1 && vol <= 3.0) limit = 300000 + adjustKm;
    else if (vol >= 3.1) limit = 350000 + adjustKm;

    if (limit > 0 && km > limit) {
      flags.push('Критический пробег (' + (km/1000).toFixed(0) + ' тыс. км) для объёма двигателя ' + vol + ' л. Порог отсечения: ' + (limit/1000).toFixed(0) + ' тыс. км.');
    }
  }

  // ПРОВЕРКА: Маленький пробег для года выпуска (детектор скрутки)
  var currentYear = new Date().getFullYear();
  var prodYear = parseInt(String(fields.production_year || '0').replace(/\D/g, ''), 10);
  var ownersNum = parseInt(String(fields.owners_count || fields.owners || '0').replace(/\D/g, ''), 10);

  if (prodYear > 1900 && prodYear < currentYear && km > 0) {
    var yearsOld = currentYear - prodYear;
    if (yearsOld >= 3) {
      var expectedMileage = yearsOld * 15000;
      if (km < expectedMileage * 0.3) {
        if (ownersNum > 2) {
          flags.push('Подозрительно малый пробег (' + (km/1000).toFixed(0) + ' тыс. км) для возраста ' + yearsOld + ' лет (норма ~' + (expectedMileage/1000).toFixed(0) + ' тыс. км). При ' + ownersNum + ' владельцах вероятна скрутка.');
        }
      }
    }
  }

  var price = parseInt(String(fields.price_rub || '').replace(/\D/g, ''), 10);
  var ai = parseInt(String(fields.ai_estimated_rub || '').replace(/\D/g, ''), 10);
  if (price > 0 && ai > 0 && price < ai * 0.8) flags.push('Цена сильно ниже рыночной оценки ИИ');

  return flags;
};

UAAWidget.checkCriticalFields = function (fields) {
  if (!fields) return [];
  var missing = [];

  // Жёсткие параметры (блокируют виджет)
  var criticalKeys = [
    { key: 'car_display_name', label: 'Наименование' },
    { key: 'production_year', label: 'Год выпуска' },
    { key: 'price_rub', label: 'Цена' }
  ];
  for (var i = 0; i < criticalKeys.length; i++) {
    var val = String(fields[criticalKeys[i].key] || '').trim();
    if (!val || val === 'Не указано' || val === '—' || val === '0') {
      missing.push(criticalKeys[i].label);
    }
  }

  // Мягкие параметры (не блокируют виджет, но покажут оранжевый "!")
  var softKeys = [
    { key: 'total_mileage_km', label: 'Пробег' },
    { key: 'engine_volume_liters', label: 'Объём двигателя' }
  ];
  for (var j = 0; j < softKeys.length; j++) {
    var sVal = String(fields[softKeys[j].key] || '').trim();
    if (!sVal || sVal === 'Не указано' || sVal === '—' || sVal === '0') {
      missing.push(softKeys[j].label);
    }
  }

  // ЛОКАЛЬНАЯ ПРОВЕРКА: Лимит записей истории
  var ownersNum = parseInt(String(fields.owners_count || fields.owners || '0').replace(/\D/g, ''), 10);
  var historyNum = parseInt(String(fields.mileage_history_count || fields.mileage_history || '0').replace(/\D/g, ''), 10);
  var addHist = parseInt(fields.historyAdd, 10) || 0;

  if (historyNum > 0 && ownersNum > 0) {
    var historyLimit = (ownersNum * 2) + addHist;
    if (historyNum > historyLimit) {
      missing.push('Внимание: записей в истории (' + historyNum + ') больше лимита (' + historyLimit + ' = ' + ownersNum + ' владельцев * 2 + ' + addHist + '). Ознакомьтесь с историей пробега.');
    }
  }

  return missing;
};
