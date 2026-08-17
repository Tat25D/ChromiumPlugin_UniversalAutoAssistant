// widget_core.js — стабильная UI-часть виджета "Предварителная оценка AI".
// Всё, что связано с DOM, стилями, анализом данных на странице и извлечением фото.
// Экспортируется как window.UAAWidgetCore (namespace).
window.UAAWidgetCore = (function () {
  'use strict';

  function injectStyles() {
    if (document.getElementById('uaa_score_styles')) return;
    var st = document.createElement('style');
    st.id = 'uaa_score_styles';
    st.textContent = [
      '#uaa_ai_score_widget{position:fixed;right:18px;top:110px;z-index:2147483647;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;}',
      '#uaa_ai_score_widget .circle{width:64px;height:64px;border-radius:50%;background:#9e9e9e;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s;}',
      '#uaa_ai_score_widget:hover .circle{transform:scale(1.07);}',
      '#uaa_ai_score_widget .circle.err{background:#d64545;}',
      '#uaa_ai_score_widget .circle.err::after{content:"";width:34px;height:8px;background:#fff;border-radius:2px;}',
      '#uaa_ai_score_widget .circle.danger{box-shadow:0 0 0 3px #e74c3c, 0 4px 14px rgba(0,0,0,.25);}',
      '#uaa_ai_score_widget .label{font-size:10px;color:#333;background:rgba(255,255,255,.9);padding:2px 6px;border-radius:6px;}',
      '#uaa_ai_score_widget .photobtn{font-size:11px;font-weight:700;color:#fff;background:rgba(60,60,60,.9);border:1px solid #555;border-radius:12px;padding:7px 12px;cursor:pointer;transition:background .15s,border-color .15s;}',
      '#uaa_ai_score_widget .photobtn:hover{background:#4a4a4a;border-color:#7c6ff0;}',
      '#uaa_ai_score_widget .photobtn.on{background:#4d7c5f;border-color:#5f9474;color:#eaf6ef;}',
      '#uaa_ai_score_widget .photobtn.busy{background:#b26a2c;border-color:#d18a3f;color:#ffe9d2;cursor:progress;}',
      '#uaa_ai_score_widget .stopsign{display:none;margin-top:2px;padding:4px 10px;border-radius:8px;background:#c0392b;border:1px solid #e74c3c;color:#fff;font-size:11px;font-weight:800;letter-spacing:.5px;cursor:help;}',
      '#uaa_ai_score_widget .stopsign.show{display:block;}'
    ].join('\n');
    (document.head || document.documentElement).appendChild(st);
  }

  function ensureWidget() {
    injectStyles();
    var w = document.getElementById('uaa_ai_score_widget');
    if (!w) {
      w = document.createElement('div');
      w.id = 'uaa_ai_score_widget';
      w.innerHTML = '<div class="circle">...</div><div class="label">Предварителная оценка AI</div><div class="photobtn">+ 1фото</div><div class="stopsign">Внимание!</div>';
      document.documentElement.appendChild(w);
    }
    return w;
  }

  function removeWidget() {
    var w = document.getElementById('uaa_ai_score_widget');
    if (w && w.parentNode) w.parentNode.removeChild(w);
  }

  function scoreColor(score) {
    var hue = Math.round((score / 10) * 120);
    return 'hsl(' + hue + ', 85%, 42%)';
  }

  function setState(w, state, score, withPhoto) {
    var c = w ? w.querySelector('.circle') : null;
    if (!c) return;
    var ph = withPhoto ? ' (с фото)' : '';
    if (state === 'loading') {
      c.className = 'circle';
      c.style.background = '#9e9e9e';
      c.textContent = '...';
      w.title = 'Предварителная оценка AI: запрос...\nКлик — полный отчёт AI' + ph;
    } else if (state === 'error') {
      c.className = 'circle err';
      c.style.background = '';
      c.textContent = '';
      w.title = 'Предварителная оценка AI: не удалось получить\nКлик — полный отчёт AI';
    } else {
      var val = Number(score) || 0;
      c.className = 'circle';
      c.style.background = scoreColor(val);
      c.textContent = val.toFixed(1).replace('.', ',');
      w.title = 'Предварителная оценка AI: ' + val.toFixed(1) + ' из 10\nКлик — полный отчёт AI' + ph;
    }
  }

  function setPhotoBtnState(w, on, busy) {
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
  }

  function setStopSign(w, flags) {
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
  }

  function countSentences(s) {
    var parts = String(s || '').split(/(?:[.!?…]+(?:\s|$))|\n+/);
    var n = 0;
    for (var i = 0; i < parts.length; i++) if (parts[i].trim().length > 2) n++;
    return n;
  }

  //====== ФЛАГИ "Внимание!" ======
  function computeStopFlags(fields) {
    var flags = [];
    if (!fields) return flags;
    var pts = String(fields.pts_type || '').toLowerCase();
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
    var sent = countSentences(fields.full_text_description);
    if (sent > 15) flags.push('Слишком длинное описание (' + sent + ' предл.) — явно автосалон/перекуп');
    var price = parseInt(String(fields.price_rub || '').replace(/\D/g, ''), 10);
    var ai = parseInt(String(fields.ai_estimated_rub || '').replace(/\D/g, ''), 10);
    if (price > 0 && ai > 0 && price < ai * 0.8) flags.push('Цена сильно ниже рыночной оценки ИИ');
    return flags;
  }

  //====== ТЕКУЩЕЕ ФОТО В МАКС. КАЧЕСТВЕ ======
  function maxQualityUrl(u) {
    if (!u) return null;
    u = String(u).trim();
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (!/^https?:\/\//i.test(u)) return null;
    if (/data:/i.test(u)) return null;
    if (/avito\.st|avito-st\.com|avitonst\.ru/i.test(u)) {
      u = u.replace(/\/\d{2,4}x\d{2,4}(?=\/|$)/g, '');
    }
    return u;
  }

  function getCurrentPhotoUrl() {
    var vw = document.documentElement.clientWidth || 1200;
    var vh = document.documentElement.clientHeight || 800;
    var cx = vw / 2, cy = vh / 2;
    var JUNK = /(avatar|icon|logo|favicon|sprite|badge|captcha)/i;

    function candidatesFrom(scope) {
      var out = [];
      var imgs = scope.querySelectorAll('img');
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        var src = img.currentSrc || img.src || img.getAttribute('data-src');
        if (!src || JUNK.test(src)) continue;
        var r = img.getBoundingClientRect();
        var w = r.width || img.width || 0;
        var h = r.height || img.height || 0;
        if (w < 300 || h < 200) continue;
        var vis = r.bottom > 0 && r.top < vh;
        var dx = (r.left + w / 2) - cx;
        var dy = (r.top + h / 2) - cy;
        out.push({ src: src, area: w * h, dist: Math.sqrt(dx * dx + dy * dy), vis: vis });
      }
      return out;
    }

    function pickVisibleCentered(list) {
      var best = null;
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        if (!c.vis) continue;
        if (!best || c.dist < best.dist - 40 || (Math.abs(c.dist - best.dist) <= 40 && c.area > best.area)) best = c;
      }
      return best;
    }

    function pickLargest(list) {
      var best = null;
      for (var i = 0; i < list.length; i++) {
        if (!best || list[i].area > best.area) best = list[i];
      }
      return best;
    }

    var list = [];
    var galleries = document.querySelectorAll(
      '[data-marker="item-view/gallery"], [data-marker*="gallery" i], [class*="gallery" i], [data-testid="gallery"]'
    );
    for (var g = 0; g < galleries.length; g++) list = list.concat(candidatesFrom(galleries[g]));
    var all = candidatesFrom(document);

    var pick = pickVisibleCentered(list) || pickVisibleCentered(all) || pickLargest(list) || pickLargest(all) || null;

    if (!pick) {
      var divs = document.querySelectorAll('div[style*="background-image"], div[style*="background: url"], div[style*="background:url"]');
      var bestArea = 0, bestSrc = null;
      for (var d = 0; d < divs.length; d++) {
        var st = divs[d].getAttribute('style') || '';
        var m = st.match(/url\(["']?([^"')]+)["']?\)/);
        if (!m || !m[1] || JUNK.test(m[1])) continue;
        var rr = divs[d].getBoundingClientRect();
        if (rr.width < 300 || rr.height < 200) continue;
        if (rr.width * rr.height > bestArea) { bestArea = rr.width * rr.height; bestSrc = m[1]; }
      }
      if (bestSrc) pick = { src: bestSrc };
    }

    if (!pick) {
      var og = document.querySelector('meta[property="og:image"]');
      if (og && og.getAttribute('content')) pick = { src: og.getAttribute('content') };
    }

    return pick ? maxQualityUrl(pick.src) : null;
  }

  return {
    ensureWidget: ensureWidget,
    removeWidget: removeWidget,
    setState: setState,
    setPhotoBtnState: setPhotoBtnState,
    setStopSign: setStopSign,
    countSentences: countSentences,
    computeStopFlags: computeStopFlags,
    getCurrentPhotoUrl: getCurrentPhotoUrl
  };
})();
