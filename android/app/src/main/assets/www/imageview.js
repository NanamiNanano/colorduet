/* imageview.js — 图片取色视图
 * 独立模块：只管"一张画布的缩放/平移/取色/放大镜"，通过回调把颜色交给 app.js。
 *
 *   ImageView.mount({ canvas, onPick, onChange, onHint })
 *   ImageView.addDataUrl(dataUrl, name)   -> Promise<index>
 *   ImageView.setActive(i)
 *   ImageView.setSample(n)                 // 1 / 3 / 5
 *   ImageView.reset()
 *   ImageView.items                        // [{name, thumb}]
 */
(function (root) {
  'use strict';

  var MAX_PX = 2048;          // 参与取色的最大边长（内存与精度的折中）
  var LOUPE_R = 58;           // 放大镜半径（CSS px）
  var LOUPE_SRC = 24;         // 放大镜取样边长（图片像素）
  var LONG_PRESS = 380;       // 长按阈值 ms
  var TAP_MOVE = 8;           // 超过这个位移就不算点击

  var st = {
    items: [],                // {img, name, thumb, iw, ih, view:{s,ox,oy}, picks:[]}
    active: -1,
    sample: 1
  };

  var canvas = null, ctx = null, opts = {};
  var scratch = null, sctx = null;   // 取色用的离屏画布（当前图）
  var data = null;                   // 当前图的 ImageData
  var W = 0, H = 0, dpr = 1;

  var pointers = new Map();
  var longTimer = null;
  var loupe = null;                  // {x, y} 图片像素坐标
  var drag = null;
  var pinch = null;
  var lastTap = 0;
  var moved = 0;

  /* ------------------------------------------------------------ 基础 */
  function cur() { return st.active >= 0 ? st.items[st.active] : null; }

  function emitHint(text) { if (opts.onHint) opts.onHint(text); }

  function resize() {
    var rect = canvas.getBoundingClientRect();
    var rw = Math.round(rect.width), rh = Math.round(rect.height);
    if (rw < 2 || rh < 2) {
      /* 面板还藏着，等显示出来再量 —— 否则会按 0 宽高算错缩放 */
      W = 0;
      H = 0;
      return;
    }
    W = rw;
    H = rh;
    dpr = Math.min(2, root.devicePixelRatio || 1);
    var px = Math.round(W * dpr), py = Math.round(H * dpr);
    if (canvas.width !== px || canvas.height !== py) {
      canvas.width = px;
      canvas.height = py;
    }
    var it = cur();
    if (it && !it._fit) {
      fit(it);
      clampView(it);
    }
    draw();
  }

  function fit(it) {
    if (!it || W <= 0 || H <= 0) return;
    var s = Math.min(W / it.iw, H / it.ih);
    it.view = { s: s, ox: (W - it.iw * s) / 2, oy: (H - it.ih * s) / 2 };
    it._fit = true;
  }

  function clampView(it) {
    var v = it.view;
    var w = it.iw * v.s, h = it.ih * v.s;
    // 图片比画布小时居中；大时不允许拖出空白
    if (w <= W) v.ox = (W - w) / 2;
    else v.ox = Math.min(0, Math.max(W - w, v.ox));
    if (h <= H) v.oy = (H - h) / 2;
    else v.oy = Math.min(0, Math.max(H - h, v.oy));
  }

  function toImage(clientX, clientY) {
    var it = cur();
    if (!it) return null;
    var rect = canvas.getBoundingClientRect();
    var x = (clientX - rect.left - it.view.ox) / it.view.s;
    var y = (clientY - rect.top - it.view.oy) / it.view.s;
    return { x: x, y: y };
  }

  /* ------------------------------------------------------------ 取色 */
  function sampleColor(ix, iy, n) {
    if (!data) return null;
    var w = data.width, h = data.height;
    var half = Math.floor(n / 2);
    var x0 = Math.round(ix) - half, y0 = Math.round(iy) - half;
    var r = 0, g = 0, b = 0, cnt = 0;
    for (var dy = 0; dy < n; dy++) {
      for (var dx = 0; dx < n; dx++) {
        var x = x0 + dx, y = y0 + dy;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        var i = (y * w + x) * 4;
        r += data.data[i];
        g += data.data[i + 1];
        b += data.data[i + 2];
        cnt++;
      }
    }
    if (!cnt) return null;
    return { r: r / cnt / 255, g: g / cnt / 255, b: b / cnt / 255 };
  }

  function pickAt(ix, iy, silent) {
    var c = sampleColor(ix, iy, st.sample);
    if (!c) return;
    if (opts.onPick) opts.onPick(c);
    if (!silent) {
      var it = cur();
      it.picks.push({ x: ix, y: iy });
      if (it.picks.length > 24) it.picks.shift();
      draw();
    }
  }

  /* ------------------------------------------------------------ 绘制 */
  function draw() {
    if (!ctx || W <= 0) return;
    var it = cur();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    if (!it) {
      ctx.fillStyle = 'rgba(154,161,171,.55)';
      ctx.font = '15px "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('还没有图片', W / 2, H / 2 - 12);
      ctx.font = '13px "Microsoft YaHei", sans-serif';
      ctx.fillText('点上面的「导入图片」', W / 2, H / 2 + 14);
      return;
    }

    var v = it.view;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(it.img, v.ox, v.oy, it.iw * v.s, it.ih * v.s);

    /* 已取色的标记 */
    for (var i = 0; i < it.picks.length; i++) {
      var p = it.picks[i];
      var px = v.ox + p.x * v.s, py = v.oy + p.y * v.s;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.95)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    if (loupe) drawLoupe(it);
  }

  function drawLoupe(it) {
    var v = it.view;
    var px = v.ox + loupe.x * v.s;
    var py = v.oy + loupe.y * v.s;

    /* 放大镜放在手指上方，贴近顶部时翻到下方 */
    var cx = Math.min(W - LOUPE_R - 6, Math.max(LOUPE_R + 6, px));
    var cy = py - LOUPE_R - 46;
    if (cy < LOUPE_R + 6) cy = py + LOUPE_R + 46;

    var half = LOUPE_SRC / 2;
    var sx = Math.max(0, Math.min(data.width - LOUPE_SRC, Math.round(loupe.x) - half));
    var sy = Math.max(0, Math.min(data.height - LOUPE_SRC, Math.round(loupe.y) - half));

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = '#0d0e10';
    ctx.fill();
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scratch, sx, sy, LOUPE_SRC, LOUPE_SRC,
      cx - LOUPE_R, cy - LOUPE_R, LOUPE_R * 2, LOUPE_R * 2);
    ctx.restore();

    /* 十字线 */
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - LOUPE_R, cy); ctx.lineTo(cx + LOUPE_R, cy);
    ctx.moveTo(cx, cy - LOUPE_R); ctx.lineTo(cx, cy + LOUPE_R);
    ctx.stroke();

    /* 中心方框 = 实际取样范围 */
    var box = (LOUPE_R * 2 / LOUPE_SRC) * st.sample;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - box / 2, cy - box / 2, box, box);

    ctx.beginPath();
    ctx.arc(cx, cy, LOUPE_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    /* 取色点在原图上的位置环 */
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /* ------------------------------------------------------------ 手势 */
  function cancelLong() {
    if (longTimer) { clearTimeout(longTimer); longTimer = null; }
  }

  function onDown(e) {
    if (!cur()) return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = 0;

    if (pointers.size === 2) {
      cancelLong();
      loupe = null;
      var pts = Array.from(pointers.values());
      var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      var it = cur();
      pinch = {
        dist: Math.hypot(dx, dy) || 1,
        s: it.view.s,
        midX: (pts[0].x + pts[1].x) / 2,
        midY: (pts[0].y + pts[1].y) / 2,
        ox: it.view.ox,
        oy: it.view.oy
      };
      drag = null;
      return;
    }

    if (pointers.size > 2) return;

    var it = cur();
    drag = { x: e.clientX, y: e.clientY, ox: it.view.ox, oy: it.view.oy, moved: 0 };

    cancelLong();
    longTimer = setTimeout(function () {
      longTimer = null;
      if (!drag || drag.moved > TAP_MOVE) return;
      var p = toImage(drag.x, drag.y);
      if (!p) return;
      loupe = { x: p.x, y: p.y };
      emitHint('松手确认取色');
      var c = sampleColor(loupe.x, loupe.y, st.sample);
      if (c && opts.onPick) opts.onPick(c);
      draw();
    }, LONG_PRESS);

    e.preventDefault();
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    var it = cur();
    if (!it) return;

    if (pinch && pointers.size >= 2) {
      var pts = Array.from(pointers.values());
      var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
      var dist = Math.hypot(dx, dy) || 1;
      var k = Math.max(0.2, Math.min(20, pinch.s * dist / pinch.dist));
      var rect = canvas.getBoundingClientRect();
      var mx = pinch.midX - rect.left, my = pinch.midY - rect.top;
      /* 以双指中点为锚点缩放 */
      var ix = (mx - pinch.ox) / pinch.s;
      var iy = (my - pinch.oy) / pinch.s;
      it.view.s = k;
      it.view.ox = mx - ix * k;
      it.view.oy = my - iy * k;
      clampView(it);
      draw();
      e.preventDefault();
      return;
    }

    if (loupe) {
      var p0 = toImage(e.clientX, e.clientY);
      if (p0) {
        loupe.x = Math.max(0, Math.min(it.iw - 1, p0.x));
        loupe.y = Math.max(0, Math.min(it.ih - 1, p0.y));
        var c0 = sampleColor(loupe.x, loupe.y, st.sample);
        if (c0 && opts.onPick) opts.onPick(c0);
        draw();
      }
      e.preventDefault();
      return;
    }

    if (drag) {
      var ddx = e.clientX - drag.x, ddy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.hypot(ddx, ddy));
      if (drag.moved > TAP_MOVE) {
        cancelLong();
        it.view.ox = drag.ox + ddx;
        it.view.oy = drag.oy + ddy;
        clampView(it);
        draw();
      }
      e.preventDefault();
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pinch) {
      if (pointers.size < 2) pinch = null;
      drag = null;
      cancelLong();
      return;
    }

    cancelLong();

    if (loupe) {
      pickAt(loupe.x, loupe.y, false);
      loupe = null;
      emitHint(OPTS_HINT);
      draw();
      drag = null;
      return;
    }

    if (drag && drag.moved <= TAP_MOVE) {
      var p = toImage(e.clientX, e.clientY);
      var it = cur();
      if (p && it && p.x >= 0 && p.y >= 0 && p.x < it.iw && p.y < it.ih) {
        var now = Date.now();
        if (now - lastTap < 320) {
          fit(it);
          clampView(it);
          lastTap = 0;
          emitHint(OPTS_HINT);
          draw();
        } else {
          lastTap = now;
          pickAt(p.x, p.y, false);
        }
      }
    }
    drag = null;
  }

  var OPTS_HINT = '点击取色 · 长按放大镜 · 双指缩放 · 双击复位';

  /* ------------------------------------------------------------ 载入 */
  function prepareScratch(img) {
    var iw = img.naturalWidth || img.width;
    var ih = img.naturalHeight || img.height;
    var k = Math.min(1, MAX_PX / Math.max(iw, ih));
    var w = Math.max(1, Math.round(iw * k));
    var h = Math.max(1, Math.round(ih * k));

    if (!scratch) {
      scratch = document.createElement('canvas');
      sctx = scratch.getContext('2d', { willReadFrequently: true });
    }
    scratch.width = w;
    scratch.height = h;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, w, h);
    sctx.drawImage(img, 0, 0, w, h);
    data = sctx.getImageData(0, 0, w, h);
    return { iw: w, ih: h };
  }

  function makeThumb(img) {
    var c = document.createElement('canvas');
    c.width = c.height = 96;
    var cx = c.getContext('2d');
    var s = Math.min(96 / img.width, 96 / img.height);
    var w = img.width * s, h = img.height * s;
    cx.fillStyle = '#24272d';
    cx.fillRect(0, 0, 96, 96);
    cx.drawImage(img, (96 - w) / 2, (96 - h) / 2, w, h);
    return c.toDataURL('image/png');
  }

  function addDataUrl(url, name) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var dim = prepareScratch(img);
        st.items.push({
          img: img, name: name || ('图片 ' + (st.items.length + 1)),
          thumb: makeThumb(img), iw: dim.iw, ih: dim.ih,
          view: { s: 1, ox: 0, oy: 0 }, picks: []
        });
        st.active = st.items.length - 1;
        var it = cur();
        it._fit = false;
        fit(it);
        clampView(it);
        draw();
        if (opts.onChange) opts.onChange(st.items.length);
        emitHint(OPTS_HINT);
        resolve(st.active);
      };
      img.onerror = function () { reject(new Error('图片无法解码')); };
      img.src = url;
    });
  }

  function setActive(i) {
    if (i < 0 || i >= st.items.length) return;
    st.active = i;
    var it = cur();
    var dim = prepareScratch(it.img);
    it.iw = dim.iw;
    it.ih = dim.ih;
    fit(it);
    clampView(it);
    draw();
    if (opts.onChange) opts.onChange(i);
  }

  function setSample(n) {
    st.sample = n;
    draw();
  }

  function reset() {
    var it = cur();
    if (!it) return;
    it._fit = false;
    fit(it);
    clampView(it);
    draw();
  }

  /* 供自测/演示用：按图片相对坐标取一次色（0..1） */
  function pickNorm(nx, ny) {
    var it = cur();
    if (!it) return;
    pickAt(nx * it.iw, ny * it.ih, false);
  }

  function mount(o) {
    opts = o || {};
    canvas = o.canvas;
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    root.addEventListener('resize', resize);
    resize();
  }

  root.ImageView = {
    mount: mount,
    addDataUrl: addDataUrl,
    setActive: setActive,
    setSample: setSample,
    reset: reset,
    resize: resize,
    pickNorm: pickNorm,
    get items() { return st.items; },
    get active() { return st.active; },
    get count() { return st.items.length; }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
