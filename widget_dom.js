// widget_dom.js — отрисовка виджета, стили и состояния
window.UAAWidget = window.UAAWidget || {};

UAAWidget.scoreColor = function (score) {
  var hue = Math.round((score / 10) * 120);
  return 'hsl(' + hue + ', 85%, 42%)';
};

UAAWidget.injectStyles = function () {
  if (document.getElementById('uaa_score_styles')) return;
  var st = document.createElement('style');
  st.id = 'uaa_score_styles';
  st.textContent = [
    '#uaa_ai_score_widget{position:fixed;right:18px;top:110px;z-index:2147483647;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;}',
    '#uaa_ai_score_widget .circle{width:64px;height:64px;border-radius:50%;background:#9e9e9e;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s;}',
    '#uaa_ai_score_widget:hover .circle{transform:scale(1.07);}',
    '#uaa_ai_score_widget .circle.err{background:#d64545;}',
    '#uaa_ai_score_widget .circle.err::after{content:"";width:34px;height:8px;background:#fff;border-radius:2px;}',
    '#uaa_ai_score_widget .circle.danger{outline:3px solid #e74c3c;outline-offset:2px;box-shadow:0 4px 14px rgba(0,0,0,.25);}',
    '#uaa_ai_score_widget .label{font-size:10px;color:#333;background:rgba(255,255,255,.9);padding:2px 6px;border-radius:6px;}',
    '#uaa_ai_score_widget .photobtn{font-size:11px;font-weight:700;color:#fff;background:rgba(60,60,60,.9);border:1px solid #555;border-radius:12px;padding:7px 12px;cursor:pointer;transition:background .15s,border-color .15s;}',
    '#uaa_ai_score_widget .photobtn:hover{background:#4a4a4a;border-color:#7c6ff0;}',
    '#uaa_ai_score_widget .photobtn.on{background:#4d7c5f;border-color:#5f9474;color:#eaf6ef;}',
    '#uaa_ai_score_widget .photobtn.busy{background:#b26a2c;border-color:#d18a3f;color:#ffe9d2;cursor:progress;}',
    '#uaa_ai_score_widget .stopsign{display:none;margin-top:2px;padding:4px 10px;border-radius:8px;background:#c0392b;border:1px solid #e74c3c;color:#fff;font-size:11px;font-weight:800;letter-spacing:.5px;cursor:help;}',
    '#uaa_ai_score_widget .stopsign.show{display:block;}',
    // ЗНАЧОК ОШИБКИ ПАРСЕРА:
    '#uaa_ai_score_widget .errorsign{display:none;margin-top:4px;width:24px;height:24px;border-radius:50%;background:#f39c12;color:#fff;font-weight:800;font-size:14px;align-items:center;justify-content:center;cursor:help;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);}',
    '#uaa_ai_score_widget .errorsign.show{display:flex;}',
    '#uaa_ai_score_widget .testbtn{font-size:11px;font-weight:700;color:#fff;background:rgba(60,60,60,.9);border:1px solid #555;border-radius:12px;padding:7px 12px;cursor:pointer;transition:background .15s,border-color .15s;}',
    '#uaa_ai_score_widget .testbtn:hover{background:#4a4a4a;border-color:#7c6ff0;}',
    '#uaa_test_modal{position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.8);z-index:2147483647;display:none;justify-content:center;align-items:center;}',
    '#uaa_test_modal.show{display:flex;}',
    '#uaa_test_modal .modal-content{background:#1e1e1e;border:1px solid #3a3a3a;border-radius:8px;padding:20px;width:400px;max-height:80vh;overflow-y:auto;color:#d6d6d6;font-family:sans-serif;box-sizing:border-box;}',
    '#uaa_test_modal h2{color:#7c6ff0;margin:0 0 10px 0;font-size:16px;text-align:center;}',
    '#uaa_test_modal h3{color:#fff;margin:15px 0 5px 0;font-size:13px;text-transform:uppercase;border-bottom:1px solid #3a3a3a;padding-bottom:5px;}',
    '#uaa_test_modal p{font-size:11px;color:#8f8f8f;margin:2px 0 10px 0;}',
    '#uaa_test_modal label{display:flex;align-items:flex-start;gap:8px;font-size:12px;margin-bottom:8px;cursor:pointer;}',
    '#uaa_test_modal input[type="checkbox"]{margin-top:2px;}',
    '#uaa_test_modal .accept-btn{width:100%;padding:10px;background:#7c6ff0;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;margin-top:15px;font-size:14px;}',
    '#uaa_test_modal .close-x{position:absolute;top:10px;right:15px;color:#8f8f8f;cursor:pointer;font-size:20px;}'
  ].join('\n');
  (document.head || document.documentElement).appendChild(st);
};

UAAWidget.ensureWidget = function (handleClick, togglePhoto) {
  UAAWidget.injectStyles();
  var w = document.getElementById('uaa_ai_score_widget');
  if (!w) {
    w = document.createElement('div');
    w.id = 'uaa_ai_score_widget';
    w.innerHTML = '<div class="circle">...</div><div class="label">Предварителная оценка AI</div><div class="photobtn">+ 1фото</div><div class="testbtn" title="Тест на выявление проблем с авто по фото">Тест</div><div class="stopsign">Внимание!</div><div class="errorsign" title="Ошибка">!</div>';
    if (handleClick) w.addEventListener('click', handleClick);
    var pb = w.querySelector('.photobtn');
    if (pb && togglePhoto) pb.addEventListener('click', function (e) { e.stopPropagation(); togglePhoto(w); });
    document.documentElement.appendChild(w);
  } else {
    // Если виджет уже есть, проверяем, есть ли кнопка "Тест"
    if (!w.querySelector('.testbtn')) {
      var testBtn = document.createElement('div');
      testBtn.className = 'testbtn';
      testBtn.textContent = 'Тест';
      testBtn.title = 'Тест на выявление проблем с авто по фото';
      var pb = w.querySelector('.photobtn');
      if (pb && pb.nextSibling) {
        w.insertBefore(testBtn, pb.nextSibling);
      } else {
        w.appendChild(testBtn);
      }
    }
  }
  return w;
};

UAAWidget.removeWidget = function () {
  var w = document.getElementById('uaa_ai_score_widget');
  if (w && w.parentNode) w.parentNode.removeChild(w);
};

UAAWidget.setState = function (w, state, score, withPhoto) {
  var c = w ? w.querySelector('.circle') : null;
  if (!c) return;
  var ph = withPhoto ? ' (с фото)' : '';

  // Используем classList, чтобы не затирать класс 'danger' от кнопки "Внимание!"
  c.classList.remove('err');

  if (state === 'loading') {
    c.style.background = '#9e9e9e';
    c.textContent = '...';
    w.title = 'Предварителная оценка AI: запрос...\nКлик — отчёт AI\nДвойной клик — пересчёт оценки' + ph;
  } else if (state === 'error') {
    c.classList.add('err');
    c.style.background = '';
    c.textContent = '';
    w.title = 'Предварителная оценка AI: не удалось получить\nКлик — отчёт AI\nДвойной клик — пересчёт оценки';
  } else {
    var val = Number(score) || 0;
    c.style.background = UAAWidget.scoreColor(val);
    c.textContent = val.toFixed(1).replace('.', ',');
    w.title = 'Предварителная оценка AI: ' + val.toFixed(1) + ' из 10\nКлик — отчёт AI\nДвойной клик — пересчёт оценки' + ph;
  }
};

UAAWidget.setPhotoBtnState = function (w, on, busy) {
  var pb = w ? w.querySelector('.photobtn') : null;
  if (!pb) return;
  if (busy) {
    pb.classList.add('busy');
    pb.classList.remove('on');
    pb.textContent = 'Извлекаю!';
    pb.title = 'Извлекаю фото...';
    return;
  }
  pb.classList.remove('busy');
  pb.textContent = '+ 1фото';
  if (on) pb.classList.add('on'); else pb.classList.remove('on');
  pb.title = on
    ? 'Режим ВКЛ: отчёт пойдёт С ФОТО (нажмите, чтобы выключить для этой страницы)'
    : 'Режим ВЫКЛ: отчёт без фото (нажмите, чтобы включить для этой страницы)';
};

UAAWidget.setStopSign = function (w, flags) {
  if (!w) return;
  var el = w.querySelector('.stopsign');
  var circle = w.querySelector('.circle');
  var on = !!(flags && flags.length);
  if (el) {
    if (on) { el.classList.add('show'); el.title = 'Подозрительные признаки:\n• ' + flags.join('\n• '); }
    else { el.classList.remove('show'); el.title = ''; }
  }
  if (circle) {
    if (on) circle.classList.add('danger'); else circle.classList.remove('danger');
  }
};

UAAWidget.setErrorSign = function (w, message) {
  if (!w) return;
  var el = w.querySelector('.errorsign');
  if (!el) return;
  if (message) {
    el.classList.add('show');
    el.title = 'ВНИМАНИЕ: Ошибка работы плагина!\n' + message;
  } else {
    el.classList.remove('show');
    el.title = '';
  }
};

UAAWidget.createTestModal = function(onAccept) {
  if (document.getElementById('uaa_test_modal')) return;
  var modal = document.createElement('div');
  modal.id = 'uaa_test_modal';
  modal.innerHTML = `
    <div class="modal-content" style="position:relative;">
      <span class="close-x" id="uaa_test_close">&times;</span>
      <h2>Чек-лист износа и скрутки</h2>
      <p>Отметьте то, что видно на фото. Это зажжет "Стоп!" и повлияет на оценку.</p>

      <h3>Раздел 1. Салон</h3>
      <label><input type="checkbox" data-issue="Линолеум затерт/отрезан (сквозное протирание за сотни тыс. км)">1. Линолеум в ногах затерт/отрезан</label>
      <label><input type="checkbox" data-issue="Руль лысый/в оплетке (износ к 120-150 тыс. км)">2. Руль лысый/в оплетке</label>
      <label><input type="checkbox" data-issue="Продавлен валик сиденья, трещины (износ от 150 тыс. км, такси)">3. Продавлен валик сиденья, трещины</label>
      <label><input type="checkbox" data-issue="Стерты накладки на педалях (пробег за 150-200 тыс. км)">4. Стерты накладки на педалях</label>
      <label><input type="checkbox" data-issue="Пластик кнопок затерт до глянца (стертость от пальцев)">5. Пластик кнопок затерт до глянца</label>
      <label><input type="checkbox" data-issue="Ремень безопасности разлохмачен (сотни тысяч циклов)">6. Ремень безопасности разлохмачен</label>
      <label><input type="checkbox" data-issue="Сколы/царапины у замка зажигания (частые короткие поездки, такси)">7. Сколы/царапины у замка зажигания</label>
      <label><input type="checkbox" data-issue="Разный износ сидений: водительское убито (коммерция)">8. Разный износ сидений (водительское убито)</label>
      <label><input type="checkbox" data-issue="Износ подлокотника/дверной карты (постоянное трение)">9. Износ подлокотника/дверной карты</label>
      <label><input type="checkbox" data-issue="Следы демонтажа салона (перешивка, химчистка, ремонт)">10. Следы демонтажа салона</label>

      <h3>Раздел 2. Кузов и Оптика</h3>
      <label><input type="checkbox" data-issue="Установлено ГБО (огромные пробеги, экономия)">11. Установлено ГБО</label>
      <label><input type="checkbox" data-issue="Фары мутные/отпескоструены (бомбардировка песком на трассе)">12. Фары мутные/отпескоструены</label>
      <label><input type="checkbox" data-issue="Разное состояние фар (замена одной после ДТП)">13. Разное состояние фар (одна новая)</label>
      <label><input type="checkbox" data-issue="Сквозная ржавчина/коррозия (гниль кузова)">14. Сквозная ржавчина/коррозия</label>
      <label><input type="checkbox" data-issue="Разнотон панелей (кузовной ремонт)">15. Разнотон кузовных панелей</label>
      <label><input type="checkbox" data-issue="Несовпадение зазоров/линий кузова (нарушена геометрия после ДТП)">16. Несовпадение зазоров/линий кузова</label>
      <label><input type="checkbox" data-issue="Разные года выпуска на стеклах (замена после ДТП)">17. Разные года выпуска на стеклах</label>
      <label><input type="checkbox" data-issue="Отсутствие эмблем/шильдиков (деталь менялась/красилась)">18. Отсутствие эмблем/шильдиков</label>
      <label><input type="checkbox" data-issue="Следы наклеек такси/каршеринга (коммерческая эксплуатация)">19. Следы наклеек такси/каршеринга</label>
      <label><input type="checkbox" data-issue="Свежий небрежный антикор (маскировка сквозной гнили)">20. Свежий небрежный антикор</label>

      <h3>Раздел 3. Колеса и Подкапотное пространство</h3>
      <label><input type="checkbox" data-issue="Неравномерный износ шин (проблемы с геометрией после ДТП)">21. Неравномерный износ шин</label>
      <label><input type="checkbox" data-issue="Разные шины на оси: разнобой (жесткая экономия)">22. Разные шины на оси (разнобой)</label>
      <label><input type="checkbox" data-issue="Идеально вымытый мотор (скрытие свежих течей масла/антифриза)">23. Идеально вымытый мотор</label>
      <label><input type="checkbox" data-issue="Неродной крепеж/стяжки под капотом (кустарный ремонт на продажу)">24. Неродной крепеж/стяжки под капотом</label>

      <button class="accept-btn" id="uaa_test_accept">ПРИНЯТЬ И ПЕРЕСЧИТАТЬ</button>
    </div>
  `;
  document.body.appendChild(modal);

  // Закрытие по крестику
  document.getElementById('uaa_test_close').onclick = function() { modal.classList.remove('show'); };

  // НОВОЕ: Закрытие по клику на тёмный фон
  modal.addEventListener('click', function(e) {
    if (e.target === modal) {
      modal.classList.remove('show');
    }
  });

  document.getElementById('uaa_test_accept').onclick = onAccept;
};

UAAWidget.openTestModal = function(onAccept) {
  UAAWidget.createTestModal(onAccept);
  document.getElementById('uaa_test_modal').classList.add('show');
};

UAAWidget.closeTestModal = function() {
  var modal = document.getElementById('uaa_test_modal');
  if (modal) modal.classList.remove('show');
};

UAAWidget.getSelectedIssues = function() {
  var issues = [];
  document.querySelectorAll('#uaa_test_modal input[type="checkbox"]:checked').forEach(cb => {
    issues.push(cb.getAttribute('data-issue'));
  });
  return issues;
};
