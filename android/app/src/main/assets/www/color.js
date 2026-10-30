/* color.js — 纯函数色彩内核
 * 浏览器与 Node 共用；无依赖。
 * 与 preview/gen_previews.py 的实现逐条对应，可用 tests/golden.json 交叉验证。
 */
(function (root, factory) {
  var CP = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = CP;
  root.CP = CP;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function mod360(x) { return ((x % 360) + 360) % 360; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* ---------------------------------------------------------------- HSV */

  function hsv2rgb(h, s, v) {
    h = mod360(h);
    var c = v * s;
    var hp = h / 60;
    var x = c * (1 - Math.abs((hp % 2) - 1));
    var r = 0, g = 0, b = 0;
    if (hp < 1) { r = c; g = x; }
    else if (hp < 2) { r = x; g = c; }
    else if (hp < 3) { g = c; b = x; }
    else if (hp < 4) { g = x; b = c; }
    else if (hp < 5) { r = x; b = c; }
    else { r = c; b = x; }
    var m = v - c;
    return { r: r + m, g: g + m, b: b + m };
  }

  function rgb2hsv(c) {
    var r = c.r, g = c.g, b = c.b;
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    var h = 0;
    if (d > 1e-12) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return { h: mod360(h), s: mx <= 1e-12 ? 0 : d / mx, v: mx };
  }

  /* --------------------------------------------------------- sRGB / OKLab */

  function s2l(c) { return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function l2s(c) { c = clamp01(c); return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; }

  function rgb2lin(c) { return [s2l(c.r), s2l(c.g), s2l(c.b)]; }
  function lin2rgb(v) { return { r: l2s(v[0]), g: l2s(v[1]), b: l2s(v[2]) }; }

  function lin2oklab(r, g, b) {
    var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
    var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
    var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
    var l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
    return [
      0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
      1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
      0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    ];
  }

  function oklab2lin(L, a, b) {
    var l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    var m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    var s_ = L - 0.0894841775 * a - 1.2914855480 * b;
    var l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    ];
  }

  function rgb2oklch(c) {
    var lin = rgb2lin(c);
    var lab = lin2oklab(lin[0], lin[1], lin[2]);
    var C = Math.hypot(lab[1], lab[2]);
    var h = C < 1e-9 ? 0 : mod360(Math.atan2(lab[2], lab[1]) * DEG);
    return { L: lab[0], C: C, h: h };
  }

  function oklch2rgb(L, C, h) {
    var a = C * Math.cos(h * RAD), b = C * Math.sin(h * RAD);
    return lin2rgb(oklab2lin(L, a, b));
  }

  function linInGamut(v, eps) {
    eps = eps || 1e-4;
    return v[0] >= -eps && v[0] <= 1 + eps && v[1] >= -eps && v[1] <= 1 + eps &&
      v[2] >= -eps && v[2] <= 1 + eps;
  }

  function maxChroma(L, h, iters) {
    iters = iters || 22;
    var lo = 0, hi = 0.45;
    for (var i = 0; i < iters; i++) {
      var mid = (lo + hi) / 2;
      var a = mid * Math.cos(h * RAD), b = mid * Math.sin(h * RAD);
      if (linInGamut(oklab2lin(L, a, b))) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /* ------------------------------------------------------------- CIELAB */

  function rgb2lab(c) {
    var lin = rgb2lin(c);
    var r = lin[0], g = lin[1], b = lin[2];
    var X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
    var Y = (0.2126729 * r + 0.7151522 * g + 0.0721750 * b) / 1.00000;
    var Z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883;
    var e = 216 / 24389, k = 24389 / 27;
    function f(t) { return t > e ? Math.cbrt(t) : (k * t + 16) / 116; }
    var fx = f(X), fy = f(Y), fz = f(Z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function deltaE00(l1, l2) {
    var L1 = l1[0], a1 = l1[1], b1 = l1[2];
    var L2 = l2[0], a2 = l2[1], b2 = l2[2];
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
    var Cb = (C1 + C2) / 2;
    var G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))));
    var a1p = (1 + G) * a1, a2p = (1 + G) * a2;
    var C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
    var h1p = C1p === 0 ? 0 : mod360(Math.atan2(b1, a1p) * DEG);
    var h2p = C2p === 0 ? 0 : mod360(Math.atan2(b2, a2p) * DEG);
    var dLp = L2 - L1, dCp = C2p - C1p, dhp;
    if (C1p * C2p === 0) dhp = 0;
    else {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    var dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * RAD / 2);
    var Lbp = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2, hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;
    var T = 1 - 0.17 * Math.cos((hbp - 30) * RAD) + 0.24 * Math.cos(2 * hbp * RAD)
      + 0.32 * Math.cos((3 * hbp + 6) * RAD) - 0.20 * Math.cos((4 * hbp - 63) * RAD);
    var dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    var Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
    var Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    var Sc = 1 + 0.045 * Cbp;
    var Sh = 1 + 0.015 * Cbp * T;
    var Rt = -Math.sin(2 * dTheta * RAD) * Rc;
    var t1 = dLp / Sl, t2 = dCp / Sc, t3 = dHp / Sh;
    return Math.sqrt(t1 * t1 + t2 * t2 + t3 * t3 + Rt * t2 * t3);
  }

  /* --------------------------------------------- 颜料环：色相轴重排（RYB） */
  /* 早期把 RYB 立方体当坐标系，实测只覆盖 40% 的 sRGB（中位 ΔE 4.3，
   * 最差 22.7），"从图片取色→定位"会失效。现改为：把 HSV 色相轴按画家
   * 习惯重排 —— 红0 / 橙60 / 黄120 / 绿180 / 蓝240 / 紫300，饱和度与明度
   * 沿用 HSV。好处：双向精确、零色域损失、补色关系严格成立。
   * 代价：不再预测"颜料混合后的颜色"（立方体函数保留，留给后续混色功能）。
   */
  var PIG_P = [0, 60, 120, 180, 240, 300, 360];
  var PIG_H = [0, 30, 60, 120, 240, 285, 360];   /* 对应的 HSV 色相 */

  function buildSlopes(xs, ys) {
    var n = xs.length, h = [], d = [], m = [], i;
    for (i = 0; i < n - 1; i++) {
      h[i] = xs[i + 1] - xs[i];
      d[i] = (ys[i + 1] - ys[i]) / h[i];
    }
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) {
      if (d[i - 1] * d[i] <= 0) {
        m[i] = 0;
      } else {
        var w1 = 2 * h[i] + h[i - 1];
        var w2 = h[i] + 2 * h[i - 1];
        m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
      }
    }
    return { h: h, d: d, m: m };
  }

  var PIG_SL = buildSlopes(PIG_P, PIG_H);

  /* 颜料角度 → HSV 色相（p ∈ [0,360]，单调升） */
  function pigToHueRaw(p) {
    if (p <= 0) return 0;
    if (p >= 360) return 360;
    var i = 0;
    while (i < PIG_P.length - 2 && p > PIG_P[i + 1]) i++;
    var hh = PIG_SL.h[i], t = (p - PIG_P[i]) / hh;
    var t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * PIG_H[i] +
      (t3 - 2 * t2 + t) * hh * PIG_SL.m[i] +
      (-2 * t3 + 3 * t2) * PIG_H[i + 1] +
      (t3 - t2) * hh * PIG_SL.m[i + 1];
  }

  function pigToHue(p) { return mod360(pigToHueRaw(mod360(p))); }

  var PIG_TAB = (function () {
    var N = 1024, tab = new Float64Array(N + 1);
    for (var i = 0; i <= N; i++) tab[i] = pigToHueRaw(i * 360 / N);
    return tab;
  })();

  /* HSV 色相 → 颜料角度 */
  function hueToPig(hh) {
    hh = mod360(hh);
    var N = PIG_TAB.length - 1;
    var lo = 0, hi = N;
    while (lo + 1 < hi) {
      var mid = (lo + hi) >> 1;
      if (PIG_TAB[mid] <= hh) lo = mid; else hi = mid;
    }
    var a = PIG_TAB[lo], b = PIG_TAB[hi];
    var t = (b - a) > 1e-12 ? (hh - a) / (b - a) : 0;
    return mod360((lo + t) * 360 / N);
  }

  /* 颜料角度 → 红黄蓝"配比"（近似，仅用于展示） */
  var PIG_TRIPLE = [
    [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1], [1, 0, 1], [1, 0, 0]
  ];

  function pigmentTriple(p) {
    p = mod360(p);
    var seg = Math.floor(p / 60), t = (p - seg * 60) / 60;
    var c0 = PIG_TRIPLE[seg], c1 = PIG_TRIPLE[seg + 1];
    return [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
  }

  /* ------------------------------------------------------- 颜料 RYB 立方 */
  /* 仅保留作"混色预测"备用；不再作为环的坐标系。
   * 索引 = r*4 + y*2 + b；数值为论文参考值，正式版需校准 */
  var RYB_CORNERS = [
    [1.000, 1.000, 1.000], /* 000 白 */
    [0.163, 0.373, 0.600], /* 001 蓝 */
    [1.000, 1.000, 0.000], /* 010 黄 */
    [0.000, 0.660, 0.200], /* 011 绿 */
    [1.000, 0.000, 0.000], /* 100 红 */
    [0.500, 0.000, 0.500], /* 101 紫 */
    [1.000, 0.500, 0.000], /* 110 橙 */
    [0.200, 0.094, 0.000]  /* 111 黑 */
  ];

  /* 环上的 6 个锚点（角度 0/60/.../300） */
  var RYB_ANCHORS = [
    [1, 0, 0], /* 红   0° */
    [1, 1, 0], /* 橙  60° */
    [0, 1, 0], /* 黄 120° */
    [0, 1, 1], /* 绿 180° */
    [0, 0, 1], /* 蓝 240° */
    [1, 0, 1]  /* 紫 300° */
  ];

  function ryb2rgb(r, y, b) {
    var out = [0, 0, 0];
    for (var i = 0; i < 2; i++) {
      var wi = i ? r : 1 - r;
      for (var j = 0; j < 2; j++) {
        var wj = j ? y : 1 - y;
        for (var k = 0; k < 2; k++) {
          var wk = k ? b : 1 - b;
          var w = wi * wj * wk;
          if (w === 0) continue;
          var c = RYB_CORNERS[i * 4 + j * 2 + k];
          out[0] += w * c[0];
          out[1] += w * c[1];
          out[2] += w * c[2];
        }
      }
    }
    return { r: clamp01(out[0]), g: clamp01(out[1]), b: clamp01(out[2]) };
  }

  /* 环坐标 → 颜料坐标：半径即纯度，0 = 中性灰 (0.5,0.5,0.5) */
  function polarToRyb(angle, radius) {
    var a = mod360(angle);
    var seg = Math.floor(a / 60) % 6;
    var t = (a - seg * 60) / 60;
    var c0 = RYB_ANCHORS[seg], c1 = RYB_ANCHORS[(seg + 1) % 6];
    var n = [lerp(c0[0], c1[0], t), lerp(c0[1], c1[1], t), lerp(c0[2], c1[2], t)];
    var r = clamp01(radius);
    return {
      r: n[0] * r + 0.5 * (1 - r),
      y: n[1] * r + 0.5 * (1 - r),
      b: n[2] * r + 0.5 * (1 - r)
    };
  }

  /* 颜料坐标 → 环坐标（色相角 + 纯度） */
  function rybToPolar(c) {
    var r = clamp01(c.r), y = clamp01(c.y), b = clamp01(c.b);
    var mx = Math.max(r, y, b), mn = Math.min(r, y, b);
    var chroma = mx - mn;
    if (chroma < 1e-9) return { a: 0, r: 0 };
    var nr = (r - mn) / chroma, ny = (y - mn) / chroma, nb = (b - mn) / chroma;
    var seg = 0, t = 0;
    var E = 1e-9;
    if (nb < E) {            /* 只剩红黄 */
      if (nr >= 1 - E) { seg = 0; t = ny; } else { seg = 1; t = 1 - nr; }
    } else if (nr < E) {     /* 只剩黄蓝 */
      if (ny >= 1 - E) { seg = 2; t = nb; } else { seg = 3; t = 1 - ny; }
    } else {                 /* 只剩红蓝 */
      if (nb >= 1 - E) { seg = 4; t = nr; } else { seg = 5; t = 1 - nb; }
    }
    return { a: mod360(seg * 60 + t * 60), r: chroma };
  }

  /* RGB → 颜料坐标：在采样网格里找最近点（OKLab 距离） */
  var _lut = null;
  function buildRybLut(n) {
    n = n || 17;
    var pts = [];
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < n; j++) {
        for (var k = 0; k < n; k++) {
          var co = { r: i / (n - 1), y: j / (n - 1), b: k / (n - 1) };
          var c = ryb2rgb(co.r, co.y, co.b);
          var lin = rgb2lin(c);
          var lab = lin2oklab(lin[0], lin[1], lin[2]);
          pts.push({ co: co, lab: lab });
        }
      }
    }
    return pts;
  }

  function rgb2ryb(c) {
    if (!_lut) _lut = buildRybLut(17);
    var lin = rgb2lin(c);
    var lab = lin2oklab(lin[0], lin[1], lin[2]);
    var best = _lut[0], bestD = Infinity;
    for (var i = 0; i < _lut.length; i++) {
      var p = _lut[i].lab;
      var d = (p[0] - lab[0]) * (p[0] - lab[0]) * 1.0 +
        (p[1] - lab[1]) * (p[1] - lab[1]) +
        (p[2] - lab[2]) * (p[2] - lab[2]);
      if (d < bestD) { bestD = d; best = _lut[i]; }
    }
    return best.co;
  }

  /* ---------------------------------------------------------------- 输出 */

  function hex(c) {
    function h(v) {
      var s = Math.round(clamp01(v) * 255).toString(16);
      return s.length < 2 ? '0' + s : s;
    }
    return '#' + h(c.r) + h(c.g) + h(c.b);
  }

  function rgb255(c) {
    return [Math.round(clamp01(c.r) * 255), Math.round(clamp01(c.g) * 255),
      Math.round(clamp01(c.b) * 255)];
  }

  function hueDelta(a, b) {
    var d = mod360(a - b);
    return d > 180 ? d - 360 : d;
  }

  return {
    RAD: RAD, DEG: DEG,
    clamp: clamp, clamp01: clamp01, mod360: mod360, lerp: lerp,
    hsv2rgb: hsv2rgb, rgb2hsv: rgb2hsv,
    rgb2lin: rgb2lin, lin2rgb: lin2rgb,
    rgb2oklch: rgb2oklch, oklch2rgb: oklch2rgb, maxChroma: maxChroma,
    rgb2lab: rgb2lab, deltaE00: deltaE00,
    ryb2rgb: ryb2rgb, rgb2ryb: rgb2ryb,
    polarToRyb: polarToRyb, rybToPolar: rybToPolar,
    pigToHue: pigToHue, hueToPig: hueToPig, pigmentTriple: pigmentTriple,
    hex: hex, rgb255: rgb255, hueDelta: hueDelta
  };
});
