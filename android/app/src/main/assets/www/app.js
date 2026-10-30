/* app.js — 双环取色原型（M1 核心）
 * 依赖 color.js（全局 CP）
 * 目标：验证色环手感、双模式切换、参照比对口径、色卡拖拽。
 * 存储：原型阶段用 localStorage；M4 换成 Python /api。
 */
(function () {
  'use strict';

  var CP = window.CP;
  var TEX = 512;          // 环纹理分辨率
  var STORE_KEY = 'shuanghuan.v1';

  /* -------------------------------------------------------------- 状态 */
  var S = {
    mode: 'light',                 // light | pigment
    hue: 210,                      // 环上的色相角（0..360，当前环的坐标）
    sat: 0.66,                     // 饱和度 0..1
    bright: 1,                     // 明度 0..1
    items: [],                     // [{id,name,rgb:[0-255],...}]
    refId: null,
    seq: 1
  };

  /* ------------------------------------------------------- 颜色 ↔ 状态 */
  var RING_IN = 0.80;              // 空心环内半径（外半径 = 1）
  var RING_MID = (1 + RING_IN) / 2;

  function ringHue() { return S.mode === 'light' ? S.hue : CP.pigToHue(S.hue); }

  function current() { return CP.hsv2rgb(ringHue(), S.sat, S.bright); }

  function ringAngleOf(c) {
    var h = CP.rgb2hsv(c).h;
    return S.mode === 'light' ? h : CP.hueToPig(h);
  }

  function setFromColor(c) {
    var h = CP.rgb2hsv(c);
    S.hue = S.mode === 'light' ? h.h : CP.hueToPig(h.h);
    S.sat = h.s;
    S.bright = h.v;
  }

  /* 两条滑杆的轨道颜色（跟着选色实时变） */
  function updateTracks() {
    var h = ringHue();
    var satEl = document.getElementById('sat');
    var briEl = document.getElementById('bright');
    if (!satEl || !briEl) return;
    var a = CP.hex(CP.hsv2rgb(h, 0, Math.max(S.bright, 0.02)));
    var b = CP.hex(CP.hsv2rgb(h, 1, Math.max(S.bright, 0.02)));
    satEl.style.setProperty('--track', 'linear-gradient(90deg,' + a + ',' + b + ')');

    var d = CP.hex(CP.hsv2rgb(h, S.sat, 0));
    var e = CP.hex(CP.hsv2rgb(h, S.sat, 1));
    briEl.style.setProperty('--track', 'linear-gradient(90deg,' + d + ',' + e + ')');
  }

  /* ------------------------------------------------------------ 环纹理 */
  var texCache = {};

  function wheelTexture(kind) {
    if (texCache[kind]) return texCache[kind];
    var cv = document.createElement('canvas');
    cv.width = cv.height = TEX;
    var ctx = cv.getContext('2d');
    var img = ctx.createImageData(TEX, TEX);
    var d = img.data;
    var half = (TEX - 1) / 2;

    for (var y = 0; y < TEX; y++) {
      var ny = (y - half) / half;
      for (var x = 0; x < TEX; x++) {
        var nx = (x - half) / half;
        var i = (y * TEX + x) * 4;
        var rad = Math.sqrt(nx * nx + ny * ny);
        if (rad < RING_IN - 0.008 || rad > 1.008) { d[i + 3] = 0; continue; }

        var ang = CP.mod360(Math.atan2(-ny, nx) * CP.DEG);
        var col = kind === 'light'
          ? CP.hsv2rgb(ang, 1, 1)
          : CP.hsv2rgb(CP.pigToHue(ang), 1, 1);

        var alpha = 1;
        if (rad < RING_IN) alpha = (rad - (RING_IN - 0.008)) / 0.008;
        else if (rad > 1) alpha = ((1 + 0.008) - rad) / 0.008;

        d[i] = col.r * 255;
        d[i + 1] = col.g * 255;
        d[i + 2] = col.b * 255;
        d[i + 3] = Math.round(CP.clamp01(alpha) * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    texCache[kind] = cv;
    return cv;
  }

  /* ------------------------------------------------------------ 画布 */
  var canvas = document.getElementById('wheel');
  var ctx = canvas.getContext('2d');
  var dirty = false;

  var LABELS = {
    light: [[0, '红'], [60, '黄'], [120, '绿'], [180, '青'], [240, '蓝'], [300, '品红']],
    pigment: [[0, '红'], [60, '橙'], [120, '黄'], [180, '绿'], [240, '蓝'], [300, '紫']]
  };

  function requestDraw() {
    if (dirty) return;
    dirty = true;
    requestAnimationFrame(function () { dirty = false; draw(); });
  }

  function draw() {
    var rect = canvas.getBoundingClientRect();
    var cssSize = Math.max(80, Math.round(rect.width));
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var px = Math.round(cssSize * dpr);
    if (canvas.width !== px || canvas.height !== px) {
      canvas.width = px;
      canvas.height = px;
    }
    var k = px / 420;                 // 以 420 为设计基准的缩放
    var half = px / 2;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, px, px);

    /* 内缩 1~2px，避免圆与画布四边相切留下 1px 亮缝 */
    var inset = Math.max(1, 1.2 * k);
    ctx.drawImage(wheelTexture(S.mode), inset, inset, px - inset * 2, px - inset * 2);

    /* 刻度（环外侧） */
    ctx.strokeStyle = 'rgba(255,255,255,.22)';
    ctx.lineWidth = Math.max(1, 1.2 * k);
    for (var deg = 0; deg < 360; deg += 30) {
      var th = deg * Math.PI / 180;
      var r0 = half * 0.995, r1 = half * (deg % 90 === 0 ? 0.955 : 0.975);
      ctx.beginPath();
      ctx.moveTo(half + Math.cos(th) * r0, half - Math.sin(th) * r0);
      ctx.lineTo(half + Math.cos(th) * r1, half - Math.sin(th) * r1);
      ctx.stroke();
    }

    /* 主色标签（环内侧） */
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '600 ' + (13 * k).toFixed(1) + 'px "Microsoft YaHei", sans-serif';
    ctx.lineWidth = 3.4 * k;
    ctx.strokeStyle = 'rgba(10,11,13,.85)';
    ctx.fillStyle = 'rgba(233,235,238,.92)';
    var marks = LABELS[S.mode];
    for (var m = 0; m < marks.length; m++) {
      var a = marks[m][0] * Math.PI / 180;
      var lr = half * 0.63;
      var lx = half + Math.cos(a) * lr;
      var ly = half - Math.sin(a) * lr;
      ctx.strokeText(marks[m][1], lx, ly);
      ctx.fillText(marks[m][1], lx, ly);
    }

    /* 参照标记 + 色相夹角弧线 */
    var ref = refItem();
    if (ref) {
      var rc = { r: ref.rgb[0] / 255, g: ref.rgb[1] / 255, b: ref.rgb[2] / 255 };
      var rAng = ringAngleOf(rc);
      var d2 = CP.hueDelta(rAng, S.hue);       /* 参照 → 当前，取最短方向 */

      ctx.beginPath();
      ctx.arc(half, half, half * (RING_IN - 0.045),
        -rAng * Math.PI / 180, -(rAng + d2) * Math.PI / 180, d2 > 0);
      ctx.strokeStyle = 'rgba(255,255,255,.55)';
      ctx.lineWidth = 3 * k;
      ctx.stroke();

      var R = toXY(rAng, RING_MID, half);
      ctx.beginPath();
      ctx.arc(R[0], R[1], 9 * k, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,.6)';
      ctx.lineWidth = 5 * k;
      ctx.stroke();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2 * k;
      ctx.stroke();
    }

    /* 当前标记：暗边 + 白圈 + 本色实心 */
    var P = toXY(S.hue, RING_MID, half);
    var cur = current();
    ctx.beginPath();
    ctx.arc(P[0], P[1], 12 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(P[0], P[1], 10 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(P[0], P[1], 7 * k, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(' + Math.round(cur.r * 255) + ',' +
      Math.round(cur.g * 255) + ',' + Math.round(cur.b * 255) + ')';
    ctx.fill();
  }

  function toXY(aDeg, radius, half) {
    var th = aDeg * Math.PI / 180;
    var r = half * CP.clamp01(radius);
    return [half + Math.cos(th) * r, half - Math.sin(th) * r];
  }

  /* ------------------------------------------------------------ 指针 */
  var activePointer = null;

  function pick(ev) {
    var rect = canvas.getBoundingClientRect();
    var size = Math.min(rect.width, rect.height);
    var half = size / 2;
    var nx = (ev.clientX - rect.left - half) / half;
    var ny = (ev.clientY - rect.top - half) / half;
    /* 环只负责色相，饱和度交给滑杆 */
    S.hue = CP.mod360(Math.atan2(-ny, nx) * CP.DEG);
    refresh();
  }

  canvas.addEventListener('pointerdown', function (e) {
    if (activePointer !== null) return;
    activePointer = e.pointerId;
    canvas.setPointerCapture(e.pointerId);
    pick(e);
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', function (e) {
    if (activePointer !== e.pointerId) return;
    pick(e);
    e.preventDefault();
  });

  function endPointer(e) {
    if (activePointer !== e.pointerId) return;
    activePointer = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  window.addEventListener('resize', requestDraw);

  /* ------------------------------------------------------------ 比对 */
  function hueOf(c) {
    var h = CP.rgb2hsv(c);
    if (S.mode === 'light') {
      return { h: h.h, defined: h.s > 0.03 };
    }
    return { h: CP.hueToPig(h.h), defined: h.s > 0.03 };
  }

  function compare(a, b) {
    var la = CP.rgb2lab(a), lb = CP.rgb2lab(b);
    var oa = CP.rgb2oklch(a), ob = CP.rgb2oklch(b);
    var ha = hueOf(a), hb = hueOf(b);
    var dE = CP.deltaE00(la, lb);
    return {
      dE: dE,
      dL: (ob.L - oa.L) * 100,
      dC: ob.C - oa.C,
      dH: (ha.defined && hb.defined) ? CP.hueDelta(hb.h, ha.h) : null
    };
  }

  function vHue(d) { var x = Math.abs(d); return x <= 3 ? 'ok' : x <= 10 ? 'near' : 'bad'; }
  function vLight(d) { var x = Math.abs(d); return x <= 2 ? 'ok' : x <= 5 ? 'near' : 'bad'; }
  function vChroma(d) { var x = Math.abs(d); return x <= 0.015 ? 'ok' : x <= 0.04 ? 'near' : 'bad'; }
  function vTotal(d) { return d < 2 ? 'ok' : d <= 5 ? 'near' : 'bad'; }

  var SYM = { ok: '✓', near: '≈', bad: '✗' };

  function chip(cls, text, title) {
    var el = document.createElement('span');
    el.className = 'badge ' + cls;
    el.textContent = text;
    if (title) el.title = title;
    return el;
  }

  function renderCompare() {
    var box = document.getElementById('badges');
    var hint = document.getElementById('hint');
    box.innerHTML = '';
    hint.textContent = '';

    var ref = refItem();
    if (!ref) {
      hint.textContent = '点色卡里的色块把它设为参照，就能看到「差多少」。';
      return;
    }
    var rc = { r: ref.rgb[0] / 255, g: ref.rgb[1] / 255, b: ref.rgb[2] / 255 };
    var m = compare(current(), rc);

    /* 色相 */
    if (m.dH === null) {
      box.appendChild(chip('', '色相 — 无彩色'));
    } else {
      var vh = vHue(m.dH);
      var vTot = vTotal(m.dE);
      /* 冲突规则：色相角说差得多，但肉眼接近 → 降级为 ≈ */
      if (vh === 'bad' && vTot === 'ok') vh = 'near';
      box.appendChild(chip(vh, '色相 ' + SYM[vh] + ' ' + fmtDeg(m.dH)));
    }

    /* 明度 */
    var vl = vLight(m.dL);
    box.appendChild(chip(vl, '明度 ' + SYM[vl] + ' ' + fmtSigned(m.dL, 0)));

    /* 彩度 */
    var vc = vChroma(m.dC);
    box.appendChild(chip(vc, '彩度 ' + SYM[vc] + ' ' + fmtSigned(m.dC * 100, 1)));

    /* 总差 */
    var vt = vTotal(m.dE);
    box.appendChild(chip(vt, 'ΔE ' + m.dE.toFixed(1) + ' ' + SYM[vt]));

    /* 说明 */
    var hueBad = (m.dH !== null && Math.abs(m.dH) > 10);
    if (!hueBad && vt === 'bad') {
      hint.textContent = '色相接近，但整体差异明显 —— 多半是明度或彩度差太多。';
    } else if (hueBad && vt === 'ok') {
      hint.textContent = '色相角差看起来大，但肉眼接近 —— HSV 在这个色区比较敏感。';
    } else if (vt === 'ok' && vl === 'ok' && vc === 'ok') {
      hint.textContent = '与参照几乎一致。';
    }
  }

  function fmtDeg(d) {
    if (Math.abs(d) < 0.5) d = 0;
    return (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(0) + '°';
  }
  function fmtSigned(v, n) {
    if (Math.abs(v) < Math.pow(10, -n) / 2) v = 0;   /* 避免出现 "-0.0" */
    return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(n);
  }

  /* ------------------------------------------------------------ 读数 */
  function renderReadout() {
    var c = current();
    var curSw = document.getElementById('curSw');
    var curHex = document.getElementById('curHex');
    curSw.style.background = CP.hex(c);
    curHex.textContent = CP.hex(c).toUpperCase();

    var ref = refItem();
    var refSw = document.getElementById('refSw');
    var refHex = document.getElementById('refHex');
    if (ref) {
      var rc = { r: ref.rgb[0] / 255, g: ref.rgb[1] / 255, b: ref.rgb[2] / 255 };
      refSw.className = 'sw ref';
      refSw.style.background = CP.hex(rc);
      refHex.textContent = ref.name + ' ' + CP.hex(rc).toUpperCase();
    } else {
      refSw.className = 'sw empty';
      refSw.style.background = '';
      refHex.textContent = '未设参照';
    }

    /* 详情 */
    var kv = document.getElementById('kv');
    var rows = [];
    var okl = CP.rgb2oklch(c);
    var lab = CP.rgb2lab(c);
    var hsv = CP.rgb2hsv(c);
    var pigA = CP.hueToPig(hsv.h);
    var tri = CP.pigmentTriple(pigA);

    rows.push(['HEX', CP.hex(c).toUpperCase()]);
    rows.push(['RGB', CP.rgb255(c).join(', ')]);
    if (S.mode === 'light') {
      rows.push(['色相 H', hsv.h.toFixed(0) + '°']);
    } else {
      rows.push(['颜料色相', pigA.toFixed(0) + '°']);
    }
    rows.push(['饱和度', (hsv.s * 100).toFixed(0) + '%']);
    rows.push(['明度 V', (hsv.v * 100).toFixed(0) + '%']);
    rows.push(['感知明度 L*', lab[0].toFixed(0)]);
    rows.push(['彩度 C', okl.C.toFixed(3)]);
    if (hsv.s < 0.08) {
      rows.push(['颜料配比 红黄蓝', '接近无彩（S ' + (hsv.s * 100).toFixed(0) + '%）']);
    } else {
      rows.push(['颜料配比 红黄蓝', (tri[0] * hsv.s * 100).toFixed(0) + ' / ' +
        (tri[1] * hsv.s * 100).toFixed(0) + ' / ' + (tri[2] * hsv.s * 100).toFixed(0)]);
    }

    kv.innerHTML = '';
    rows.forEach(function (r) {
      var a = document.createElement('span');
      a.textContent = r[0];
      var b = document.createElement('span');
      b.textContent = r[1];
      kv.appendChild(a);
      kv.appendChild(b);
    });
  }

  /* ------------------------------------------------------------ 色卡 */
  function refItem() {
    if (!S.refId) return null;
    for (var i = 0; i < S.items.length; i++) {
      if (S.items[i].id === S.refId) return S.items[i];
    }
    return null;
  }

  var lastDeleted = null;

  function renderList() {
    var list = document.getElementById('list');
    var tip = document.getElementById('emptyTip');
    list.innerHTML = '';
    tip.style.display = S.items.length ? 'none' : 'block';

    S.items.forEach(function (it, idx) {
      var li = document.createElement('li');
      li.className = 'item' + (it.id === S.refId ? ' ref' : '');
      li.dataset.id = it.id;

      var handle = document.createElement('span');
      handle.className = 'drag';
      handle.textContent = '⠿';

      var chipEl = document.createElement('span');
      chipEl.className = 'chip';
      chipEl.style.background = CP.hex({ r: it.rgb[0] / 255, g: it.rgb[1] / 255, b: it.rgb[2] / 255 });
      chipEl.dataset.act = 'ref';

      var body = document.createElement('div');
      body.className = 'body';

      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      name.contentEditable = 'true';
      name.spellcheck = false;
      name.dataset.id = it.id;

      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = metaText(it);

      body.appendChild(name);
      body.appendChild(meta);

      var del = document.createElement('button');
      del.className = 'del';
      del.textContent = '×';
      del.dataset.act = 'del';

      li.appendChild(handle);
      li.appendChild(chipEl);
      li.appendChild(body);
      li.appendChild(del);
      list.appendChild(li);
    });
    renderUndo();
  }

  function metaText(it) {
    var c = { r: it.rgb[0] / 255, g: it.rgb[1] / 255, b: it.rgb[2] / 255 };
    var parts = [CP.hex(c).toUpperCase()];
    var h = CP.rgb2hsv(c);
    if (S.mode === 'light') {
      parts.push('H' + h.h.toFixed(0) + '° S' + (h.s * 100).toFixed(0) + '%');
    } else {
      var tri2 = CP.pigmentTriple(CP.hueToPig(h.h));
      if (h.s < 0.08) {
        parts.push('近乎无彩');
      } else {
        parts.push('颜料 ' + (tri2[0] * h.s * 100).toFixed(0) + '/' +
          (tri2[1] * h.s * 100).toFixed(0) + '/' + (tri2[2] * h.s * 100).toFixed(0));
      }
    }
    if (S.refId && it.id === S.refId) parts.push('参照');
    return parts.join(' · ');
  }

  function renderUndo() {
    var host = document.getElementById('undoBar');
    if (!lastDeleted) { if (host) host.remove(); return; }
    if (!host) {
      host = document.createElement('div');
      host.id = 'undoBar';
      host.style.cssText = 'font-size:12.5px;color:#9aa1ab;padding:6px 2px;';
      document.getElementById('list').after(host);
    }
    host.innerHTML = '';
    host.appendChild(document.createTextNode('已删除「' + lastDeleted.item.name + '」　'));
    var b = document.createElement('button');
    b.textContent = '撤销';
    b.style.cssText = 'border:0;background:transparent;color:#ffb040;font:inherit;font-weight:700;cursor:pointer;padding:0 2px;';
    b.onclick = function () {
      S.items.splice(lastDeleted.index, 0, lastDeleted.item);
      lastDeleted = null;
      persist();
      renderList();
      refresh();
    };
    host.appendChild(b);
  }

  /* -------------------------------------------------------- 列表事件 */
  var list = document.getElementById('list');
  var drag = null;
  var justDragged = false;

  list.addEventListener('pointerdown', function (e) {
    var handle = e.target.closest('.drag');
    if (!handle) return;
    var li = handle.closest('.item');
    drag = { li: li, id: li.dataset.id, pointerId: e.pointerId };
    li.classList.add('dragging');
    justDragged = true;
    try { handle.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  });

  list.addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    var y = e.clientY;
    var sibs = Array.prototype.filter.call(list.children, function (el) {
      return el !== drag.li;
    });
    var placed = false;
    for (var i = 0; i < sibs.length; i++) {
      var r = sibs[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        list.insertBefore(drag.li, sibs[i]);
        placed = true;
        break;
      }
    }
    if (!placed) list.appendChild(drag.li);
    e.preventDefault();
  });

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    drag.li.classList.remove('dragging');
    drag = null;
    syncOrderFromDom();
    persist();
    setTimeout(function () { justDragged = false; }, 50);
  }
  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);

  function syncOrderFromDom() {
    var ids = Array.prototype.map.call(list.children, function (el) { return el.dataset.id; });
    var map = {};
    S.items.forEach(function (it) { map[it.id] = it; });
    S.items = ids.map(function (id) { return map[id]; }).filter(Boolean);
  }

  list.addEventListener('click', function (e) {
    if (justDragged) return;
    var li = e.target.closest('.item');
    if (!li) return;
    var id = li.dataset.id;

    if (e.target.dataset.act === 'del') {
      var idx = S.items.findIndex(function (x) { return x.id === id; });
      if (idx < 0) return;
      lastDeleted = { item: S.items[idx], index: idx };
      if (S.refId === id) S.refId = null;
      S.items.splice(idx, 1);
      persist();
      renderList();
      refresh();
      setTimeout(function () { lastDeleted = null; renderUndo(); }, 6000);
      return;
    }

    if (e.target.dataset.act === 'ref' || e.target === li ||
      e.target.classList.contains('meta') || e.target.classList.contains('body')) {
      S.refId = (S.refId === id) ? null : id;
      persist();
      renderList();
      refresh();
    }
  });

  /* 改名 */
  list.addEventListener('dblclick', function (e) {
    if (e.target.classList.contains('name')) {
      e.target.focus();
      var r = document.createRange();
      r.selectNodeContents(e.target);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
  });

  list.addEventListener('blur', function (e) {
    if (!e.target.classList.contains('name')) return;
    commitName(e.target);
  }, true);

  list.addEventListener('keydown', function (e) {
    if (!e.target.classList.contains('name')) return;
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); }
    if (e.key === 'Escape') { e.target.blur(); }
  });

  function commitName(el) {
    var id = el.dataset.id;
    var it = S.items.find(function (x) { return x.id === id; });
    if (!it) return;
    var v = el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!v) v = it.name;
    it.name = v;
    el.textContent = v;
    persist();
    renderList();
    refresh();
  }

  /* ------------------------------------------------------------ 按钮 */
  document.getElementById('addBtn').addEventListener('click', function () {
    var c = current();
    var rgb = CP.rgb255(c);
    var item = {
      id: 'c_' + (S.seq++),
      name: '颜色 ' + S.items.length,
      rgb: rgb
    };
    S.items.push(item);
    if (!S.refId && S.items.length > 1) S.refId = S.items[0].id;
    persist();
    renderList();
    refresh();
    var li = list.querySelector('[data-id="' + item.id + '"]');
    if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  });

  document.getElementById('helpBtn').addEventListener('click', showHelp);

  function showHelp() {
    var old = document.getElementById('help');
    if (old) { old.remove(); return; }
    var el = document.createElement('div');
    el.id = 'help';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(10,11,13,.9);z-index:9;' +
      'display:flex;align-items:center;justify-content:center;padding:20px;';
    el.innerHTML =
      '<div style="max-width:380px;background:#1f2228;border-radius:16px;padding:18px;' +
      'font-size:13.5px;line-height:1.7;color:#e9ebee">' +
      '<b style="font-size:15px">为什么有两个环</b><br>' +
      '同样一对颜色，在两种混合方式下「是否互为补色」的答案正好相反：<br><br>' +
      '<table style="width:100%;border-collapse:collapse;font-size:12.5px">' +
      '<tr style="color:#9aa1ab"><td>混合</td><td>光（相加）</td><td>颜料（相加）</td></tr>' +
      '<tr><td>黄 + 蓝</td><td style="color:#ffb040">白 · 是补色</td><td>绿 · 不是</td></tr>' +
      '<tr><td>红 + 绿</td><td>黄 · 不是</td><td style="color:#ffb040">暗浊灰 · 是补色</td></tr>' +
      '</table><br>' +
      '所以：<b>光色环</b>（红↔青）用于屏幕配色，<b>颜料环</b>（红↔绿）用于调色。<br>' +
      '切换时颜色不变，标记会跳到另一套坐标里 —— 这本身就是在演示两者的差别。<br><br>' +
      '<span style="color:#9aa1ab">比对口径：色相 ±3°、明度 ΔL* ±2、彩度 ΔC ±0.015、' +
      '总差用 ΔE00 兜底。</span>' +
      '<div style="text-align:right;margin-top:14px">' +
      '<button id="helpClose" style="border:0;background:#ffb040;color:#241a06;' +
      'font:inherit;font-weight:700;padding:8px 16px;border-radius:10px;cursor:pointer">知道了</button>' +
      '</div></div>';
    document.body.appendChild(el);
    document.getElementById('helpClose').onclick = function () { el.remove(); };
    el.addEventListener('click', function (e) { if (e.target === el) el.remove(); });
  }

  /* ------------------------------------------------------------ 持久化 */
  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        mode: S.mode, hue: S.hue, sat: S.sat, bright: S.bright,
        items: S.items, refId: S.refId, seq: S.seq
      }));
    } catch (e) { /* 隐私模式等，忽略 */ }
  }

  function restore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d.mode === 'light' || d.mode === 'pigment') S.mode = d.mode;
      if (typeof d.hue === 'number') S.hue = d.hue;
      if (typeof d.sat === 'number') S.sat = d.sat;
      if (typeof d.bright === 'number') S.bright = d.bright;
      if (Array.isArray(d.items)) S.items = d.items;
      S.refId = d.refId || null;
      S.seq = d.seq || (S.items.length + 1);
    } catch (e) { /* ignore */ }
  }

  /* ------------------------------------------------------------ 刷新 */
  function refresh() {
    updateTracks();
    requestDraw();
    renderReadout();
    renderCompare();
    if (!S.items.length && S.refId) S.refId = null;
    var list = document.getElementById('list');
    /* 只更新 meta 文案，避免整表重建导致输入框失焦 */
    Array.prototype.forEach.call(list.children, function (li) {
      var it = S.items.find(function (x) { return x.id === li.dataset.id; });
      if (!it) return;
      li.classList.toggle('ref', it.id === S.refId);
      var meta = li.querySelector('.meta');
      if (meta) meta.textContent = metaText(it);
    });
  }

  /* ------------------------------------------------------------ 绑定 */
  function bindModes() {
    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (b) {
      b.addEventListener('click', function () {
        if (S.mode === b.dataset.mode) return;
        /* 先记住当前颜色，切完坐标系再反算角度 —— 颜色保持不变 */
        var keep = current();
        S.mode = b.dataset.mode;
        Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (x) {
          x.classList.toggle('on', x.dataset.mode === S.mode);
        });
        S.hue = ringAngleOf(keep);
        persist();
        renderList();
        refresh();
      });
    });
  }

  function bindSliders() {
    var satEl = document.getElementById('sat');
    var briEl = document.getElementById('bright');

    satEl.addEventListener('input', function () {
      S.sat = Number(satEl.value) / 100;
      document.getElementById('satVal').textContent = satEl.value + '%';
      refresh();
    });

    briEl.addEventListener('input', function () {
      S.bright = Number(briEl.value) / 100;
      document.getElementById('brightVal').textContent = briEl.value + '%';
      refresh();
    });
  }

  /* ------------------------------------------------------- 视图切换 */
  function setView(v) {
    S.view = v === 'image' ? 'image' : 'wheel';
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) {
      x.classList.toggle('on', x.dataset.view === S.view);
    });
    document.getElementById('panelWheel').hidden = S.view !== 'wheel';
    document.getElementById('panelImage').hidden = S.view !== 'image';
    if (S.view === 'image') {
      /* 面板显示后才能量到真实宽高 */
      requestAnimationFrame(function () { ImageView.resize(); });
    } else {
      requestDraw();
    }
  }

  function bindViews() {
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.addEventListener('click', function () { setView(b.dataset.view); });
    });
  }

  /* ------------------------------------------------------- 图片视图 */
  function readFile(f) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = rej;
      r.readAsDataURL(f);
    });
  }

  function renderThumbs() {
    var host = document.getElementById('thumbs');
    host.innerHTML = '';
    var items = ImageView.items;
    for (var i = 0; i < items.length; i++) {
      (function (idx) {
        var b = document.createElement('button');
        b.className = 'thumb' + (idx === ImageView.active ? ' on' : '');
        var im = document.createElement('img');
        im.src = items[idx].thumb;
        im.alt = items[idx].name;
        b.appendChild(im);
        b.addEventListener('click', function () {
          ImageView.setActive(idx);
          renderThumbs();
        });
        host.appendChild(b);
      })(i);
    }
  }

  function bindImageView() {
    ImageView.mount({
      canvas: document.getElementById('imgcanvas'),
      onPick: function (rgb) { setFromColor(rgb); refresh(); },
      onChange: function () { renderThumbs(); },
      onHint: function (t) { document.getElementById('imgHint').textContent = t; }
    });

    document.getElementById('importBtn').addEventListener('click', function () {
      document.getElementById('fileInput').click();
    });

    var input = document.getElementById('fileInput');
    input.addEventListener('change', function () {
      var files = Array.prototype.slice.call(input.files || []);
      input.value = '';
      files.reduce(function (p, f) {
        return p.then(function () {
          return readFile(f).then(function (url) {
            return ImageView.addDataUrl(url, f.name.replace(/\.[^.]+$/, ''));
          }).catch(function () {
            return null;
          });
        });
      }, Promise.resolve()).then(renderThumbs);
    });

    document.getElementById('resetImg').addEventListener('click', function () {
      ImageView.reset();
    });

    var samples = document.querySelectorAll('.sm');
    Array.prototype.forEach.call(samples, function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(samples, function (x) {
          x.classList.toggle('on', x === b);
        });
        ImageView.setSample(Number(b.dataset.n));
      });
    });
  }

  /* 演示图片：?demoimg=1 时用，省得每次手动选文件 */
  function demoImage() {
    var c = document.createElement('canvas');
    c.width = 900;
    c.height = 600;
    var g = c.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 900, 600);
    grd.addColorStop(0, '#2b3a67');
    grd.addColorStop(0.45, '#a8503f');
    grd.addColorStop(1, '#6a8c54');
    g.fillStyle = grd;
    g.fillRect(0, 0, 900, 600);
    var cols = ['#d94f3d', '#f2b134', '#4aa96c', '#3d7ed9', '#8e4ec6', '#e8e4d4', '#1b2430'];
    for (var i = 0; i < cols.length; i++) {
      g.fillStyle = cols[i];
      g.fillRect(48 + i * 118, 430, 96, 96);
    }
    g.fillStyle = 'rgba(255,255,255,.92)';
    g.font = '600 36px "Microsoft YaHei", sans-serif';
    g.fillText('示例图片', 48, 92);
    g.font = '22px "Microsoft YaHei", sans-serif';
    g.fillStyle = 'rgba(255,255,255,.65)';
    g.fillText('点按取色 · 长按放大镜', 48, 132);
    return c.toDataURL('image/png');
  }

  /* ------------------------------------------------------------ 启动 */
  function init() {
    restore();
    applyUrlParams();
    bindViews();
    bindModes();
    bindSliders();
    bindImageView();

    Array.prototype.forEach.call(document.querySelectorAll('.mode'), function (x) {
      x.classList.toggle('on', x.dataset.mode === S.mode);
    });

    if (S.hexParam) {
      setFromColor({
        r: parseInt(S.hexParam.slice(0, 2), 16) / 255,
        g: parseInt(S.hexParam.slice(2, 4), 16) / 255,
        b: parseInt(S.hexParam.slice(4, 6), 16) / 255
      });
    }
    if (S.brightParam !== undefined) S.bright = S.brightParam;
    if (S.satParam !== undefined) S.sat = S.satParam;

    /* 滑杆初值跟随状态 */
    var satEl = document.getElementById('sat');
    var briEl = document.getElementById('bright');
    satEl.value = String(Math.round(S.sat * 100));
    briEl.value = String(Math.round(S.bright * 100));
    document.getElementById('satVal').textContent = satEl.value + '%';
    document.getElementById('brightVal').textContent = briEl.value + '%';

    renderList();
    refresh();

    /* 演示图片：放进图片视图后取一次色，便于自测与截图 */
    if (S.demoImg) {
      setView('image');
      ImageView.addDataUrl(demoImage(), '示例图片').then(function () {
        renderThumbs();
        requestAnimationFrame(function () {
          ImageView.resize();
          ImageView.pickNorm(0.62, 0.78);
        });
      }).catch(function () { /* ignore */ });
    } else {
      setView(S.viewParam || 'wheel');
    }

    /* 首次布局完成后再画，避免尺寸为 0 */
    requestAnimationFrame(function () { requestDraw(); });
  }

  /* 深链：?mode=pigment&hex=FF8800&sat=80&bright=80 —— 方便自测与截图 */
  function applyUrlParams() {
    try {
      var q = new URLSearchParams(window.location.search);
      var m = q.get('mode');
      if (m === 'light' || m === 'pigment') S.mode = m;
      var hx = (q.get('hex') || '').replace('#', '');
      if (/^[0-9a-fA-F]{6}$/.test(hx)) S.hexParam = hx;
      var br = Number(q.get('bright'));
      if (br >= 0 && br <= 100 && q.get('bright') !== null) S.brightParam = br / 100;
      var sa = Number(q.get('sat'));
      if (sa >= 0 && sa <= 100 && q.get('sat') !== null) S.satParam = sa / 100;
      var vw = q.get('view');
      if (vw === 'image' || vw === 'wheel') S.viewParam = vw;
      if (q.get('demoimg') === '1') S.demoImg = true;
      if (q.get('demo') === '1') {
        S.items = [
          { id: 'c_1', name: '雾蓝', rgb: [87, 171, 255] },
          { id: 'c_2', name: '赭石', rgb: [196, 110, 64] },
          { id: 'c_3', name: '苔绿', rgb: [106, 140, 84] },
          { id: 'c_4', name: '米白', rgb: [235, 228, 212] }
        ];
        S.seq = 5;
        S.refId = q.get('ref') || 'c_1';
      }
    } catch (e) { /* 老浏览器忽略 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

