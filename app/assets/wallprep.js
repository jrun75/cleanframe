/* CleanFrame wallpaper preparation. Turns one photo into every image a wallpaper needs.
   Ports the recipe in scripts/build-materials.mjs to plain canvas work, so an iPhone
   (or the browser preview) can prepare a photo without any build tools. ES5 on purpose. */
(function () {
  'use strict';

  var W = 1920, H = 1080, P = 96;
  var KINDS = ['photo', 'thumb', 'panel', 'study-soft', 'field-clear', 'field-blur', 'field-frost'];

  function canvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function wait() { return new Promise(function (done) { setTimeout(done, 16); }); }

  /* Gaussian blur approximated by three box blurs, on interleaved RGBA floats. */
  function boxes(sigma) {
    var ideal = Math.sqrt(12 * sigma * sigma / 3 + 1), wl = Math.floor(ideal), wu, m, out = [], i;
    if (wl % 2 === 0) wl--;
    wu = wl + 2;
    m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
    for (i = 0; i < 3; i++) out.push(i < m ? wl : wu);
    return out;
  }
  function pass(src, dst, n, lines, step, lineStep, r) {
    var inv = 1 / (r + r + 1), line, c, base, ti, li, ri, first, last, val, j;
    for (line = 0; line < lines; line++) {
      base = line * lineStep;
      for (c = 0; c < 3; c++) {
        ti = base + c; li = ti; ri = ti + r * step;
        first = src[ti]; last = src[base + (n - 1) * step + c];
        val = (r + 1) * first;
        for (j = 0; j < r; j++) val += src[base + Math.min(j, n - 1) * step + c];
        for (j = 0; j <= r; j++) { val += src[ri] - first; dst[ti] = val * inv; ri += step; ti += step; }
        for (j = r + 1; j < n - r; j++) { val += src[ri] - src[li]; dst[ti] = val * inv; ri += step; li += step; ti += step; }
        for (j = n - r; j < n; j++) { val += last - src[li]; dst[ti] = val * inv; li += step; ti += step; }
      }
    }
  }
  function blur(data, w, h, sigma) {
    var a = new Float32Array(data), b = new Float32Array(data.length), sizes = boxes(sigma), i, r;
    for (i = 0; i < 3; i++) {
      r = Math.min((sizes[i] - 1) / 2, Math.floor((Math.min(w, h) - 1) / 2));
      if (r < 1) continue;
      pass(a, b, w, h, 4, w * 4, r);      // horizontal
      pass(b, a, h, w, w * 4, 4, r);      // vertical
    }
    for (i = 0; i < data.length; i += 4) { data[i] = a[i]; data[i + 1] = a[i + 1]; data[i + 2] = a[i + 2]; data[i + 3] = 255; }
  }
  function saturate(data, s) {
    var i, r, g, b;
    for (i = 0; i < data.length; i += 4) {
      r = data[i]; g = data[i + 1]; b = data[i + 2];
      data[i] = (.213 + .787 * s) * r + (.715 - .715 * s) * g + (.072 - .072 * s) * b;
      data[i + 1] = (.213 - .213 * s) * r + (.715 + .285 * s) * g + (.072 - .072 * s) * b;
      data[i + 2] = (.213 - .213 * s) * r + (.715 - .715 * s) * g + (.072 + .928 * s) * b;
    }
  }

  /* Blur and saturate a padded source, working smaller for heavy blurs, then crop to 1920x1080. */
  function filtered(padded, sigma, sat) {
    var scale = sigma >= 20 ? .25 : sigma >= 8 ? .5 : 1, pw = Math.round(padded.width * scale), ph = Math.round(padded.height * scale);
    var small = canvas(pw, ph), sc = small.getContext('2d'), img, out, oc;
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(padded, 0, 0, pw, ph);
    img = sc.getImageData(0, 0, pw, ph);
    blur(img.data, pw, ph, sigma * scale);
    saturate(img.data, sat);
    sc.putImageData(img, 0, 0);
    out = canvas(W, H); oc = out.getContext('2d');
    oc.imageSmoothingQuality = 'high';
    oc.drawImage(small, P * scale, P * scale, W * scale, H * scale, 0, 0, W, H);
    return out;
  }

  var LINEAR = [], k;
  for (k = 0; k < 256; k++) { var v = k / 255; LINEAR.push(v <= .04045 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4)); }
  function encode(v) { return 255 * (v <= .0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - .055); }
  function compressHighlights(c) {
    var ctx = c.getContext('2d'), px = ctx.getImageData(0, 0, W, H), d = px.data, i, r, g, b, l, ratio;
    for (i = 0; i < d.length; i += 4) {
      r = LINEAR[d[i]]; g = LINEAR[d[i + 1]]; b = LINEAR[d[i + 2]]; l = .2126 * r + .7152 * g + .0722 * b;
      if (l > .82) { ratio = (.82 + .4 * (l - .82)) / l; d[i] = encode(r * ratio); d[i + 1] = encode(g * ratio); d[i + 2] = encode(b * ratio); }
      d[i + 3] = 255;
    }
    ctx.putImageData(px, 0, 0);
  }

  function jpeg(c, quality) {
    return new Promise(function (done, fail) {
      if (c.toBlob) c.toBlob(function (blob) { if (blob) done(blob); else fail(new Error('Could not encode image')); }, 'image/jpeg', quality);
      else {
        var url = c.toDataURL('image/jpeg', quality), bin = atob(url.split(',')[1]), arr = new Uint8Array(bin.length), i;
        for (i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        done(new Blob([arr], { type: 'image/jpeg' }));
      }
    });
  }

  /* Average brightness (0 to 255) of a rectangle in the 1920x1080 photo. */
  function region(sample, x, y, w, h) {
    var s = 1920 / sample.width, ctx = sample.getContext('2d'), d = ctx.getImageData(Math.round(x / s), Math.round(y / s), Math.max(1, Math.round(w / s)), Math.max(1, Math.round(h / s))).data, sum = 0, n = 0, i;
    for (i = 0; i < d.length; i += 4) { sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]; n++; }
    return sum / n;
  }
  function describe(photo) {
    var sample = canvas(192, 108); sample.getContext('2d').drawImage(photo, 0, 0, 192, 108);
    var top = region(sample, 0, 0, 1920, 320), tr = region(sample, 1180, 0, 740, 220), br = region(sample, 1180, 760, 740, 320),
      tl = region(sample, 0, 0, 760, 220), all = region(sample, 0, 0, 1920, 1080);
    return {
      tone: top > 128 ? 'light' : 'dark',
      ut: { tr: tr > 140 ? 'mist' : 'light', br: br > 140 ? 'mist' : 'light' },
      frostVeil: all > 150 ? .2 : .12,
      clockMist: tl > 140
    };
  }

  /* source: an <img> or <canvas>; crop: {x, y, w, h} in source pixels (16:9). */
  function prepare(source, crop, progress) {
    var files = {}, meta, photo = canvas(W, H), padded = canvas(W + 2 * P, H + 2 * P), frost;
    progress = progress || function () {};
    var pc = photo.getContext('2d');
    pc.imageSmoothingQuality = 'high';
    pc.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);
    meta = describe(photo);
    (function mirror() {
      var pad = padded.getContext('2d'), x, y;
      for (y = -1; y <= 1; y++) for (x = -1; x <= 1; x++) {
        pad.save(); pad.translate(P + (x === 1 ? 2 * W : 0), P + (y === 1 ? 2 * H : 0));
        pad.scale(x === 0 ? 1 : -1, y === 0 ? 1 : -1); pad.drawImage(photo, 0, 0); pad.restore();
      }
    })();
    progress('Framing your photo', .1);
    return jpeg(photo, .9).then(function (b) {
      files.photo = b;
      var thumb = canvas(512, 288); thumb.getContext('2d').drawImage(photo, 0, 0, 512, 288);
      return jpeg(thumb, .85);
    }).then(function (b) {
      files.thumb = b; progress('Making the glass', .25); return wait();
    }).then(function () {
      var c = filtered(padded, 28, .92); compressHighlights(c); return jpeg(c, .82);
    }).then(function (b) {
      files['field-blur'] = b; progress('Making the glass', .45); return wait();
    }).then(function () {
      frost = filtered(padded, 42, .92); compressHighlights(frost); return jpeg(frost, .82);
    }).then(function (b) {
      files['field-frost'] = b;
      var panel = canvas(320, 180); panel.getContext('2d').drawImage(frost, 0, 0, 320, 180);
      return jpeg(panel, .85);
    }).then(function (b) {
      files.panel = b; progress('Making the glass', .6); return wait();
    }).then(function () {
      return jpeg(filtered(padded, 2, 1.06), .86);
    }).then(function (b) {
      files['field-clear'] = b; progress('Softening the dock', .75); return wait();
    }).then(function () {
      // Soft dock material: darkened lower band, blurred, pulled toward its own average, then tinted.
      var base = canvas(W + 2 * P, H + 2 * P), bc = base.getContext('2d'), scrim, soft, sc, px, d, mean = [0, 0, 0], count = 0, lumas = [], x, y, i, c, high, tint;
      bc.drawImage(padded, 0, 0);
      scrim = bc.createLinearGradient(0, P + 560, 0, P + H);
      scrim.addColorStop(0, 'rgba(4,10,12,0)'); scrim.addColorStop(.7, 'rgba(4,10,12,.42)'); scrim.addColorStop(1, 'rgba(4,10,12,.52)');
      bc.fillStyle = scrim; bc.fillRect(0, P + 560, W + 2 * P, H + P - 560);
      soft = filtered(base, 14, 1.12); sc = soft.getContext('2d');
      px = sc.getImageData(0, 0, W, H); d = px.data;
      for (y = 676; y < 908; y += 2) for (x = 96; x < 1824; x += 2) { i = (y * W + x) * 4; for (c = 0; c < 3; c++) mean[c] += d[i + c]; count++; }
      for (c = 0; c < 3; c++) mean[c] /= count;
      for (i = 0; i < d.length; i += 4) { for (c = 0; c < 3; c++) d[i + c] = d[i + c] * .65 + mean[c] * .35; d[i + 3] = 255; }
      for (y = 720; y < 908; y += 4) for (x = 112; x < 1808; x += 4) { i = (y * W + x) * 4; lumas.push(.2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2]); }
      lumas.sort(function (a, b) { return a - b; });
      high = lumas[Math.floor(lumas.length * .95)];
      tint = Math.max(.28, Math.min(.6, (high - 94) / (high - 8.87)));
      sc.putImageData(px, 0, 0); sc.fillStyle = 'rgba(4,10,12,' + tint + ')'; sc.fillRect(0, 0, W, H);
      meta.softTint = Math.round(tint * 1000) / 1000;
      return jpeg(soft, .94);
    }).then(function (b) {
      files['study-soft'] = b; progress('Ready', 1);
      return { meta: meta, files: files };
    });
  }

  /* Centre a 16:9 crop on an image of any shape. */
  function centreCrop(w, h) {
    var cw = w, ch = w * 9 / 16;
    if (ch > h) { ch = h; cw = h * 16 / 9; }
    return { x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch };
  }

  window.CleanFramePrep = { prepare: prepare, centreCrop: centreCrop, KINDS: KINDS };
})();
