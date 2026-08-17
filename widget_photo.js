// widget_photo.js — извлечение текущего фото в макс. качестве
window.UAAWidget = window.UAAWidget || {};

UAAWidget.maxQualityUrl = function (u) {
  if (!u) return null;
  u = String(u).trim();
  if (u.indexOf('//') === 0) u = 'https:' + u;
  if (!/^https?:\/\//i.test(u)) return null;
  if (/data:/i.test(u)) return null;
  if (/avito\.st|avito-st\.com|avitonst\.ru/i.test(u)) {
    u = u.replace(/\/\d{2,4}x\d{2,4}(?=\/|$)/g, '');
  }
  return u;
};

UAAWidget.getCurrentPhotoUrl = function () {
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

  return pick ? UAAWidget.maxQualityUrl(pick.src) : null;
};
