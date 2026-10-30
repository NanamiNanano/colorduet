/* tests/check_color.js —— 用 golden.json 校验 web/color.js
 *   先跑： python tests/gen_golden.py
 *   再跑： node tests/check_color.js
 */
'use strict';

const path = require('path');
const fs = require('fs');
const CP = require(path.join(__dirname, '..', 'colorpick', 'web', 'color.js'));

const golden = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden.json'), 'utf8'));
const TOL = golden.tolerance;

let fails = 0;
let checks = 0;

function near(name, got, want, tol) {
  checks++;
  const err = Math.abs(got - want);
  if (!(err <= tol)) {
    fails++;
    if (fails <= 25) {
      console.log(`  ✗ ${name}: got ${got}, want ${want} (err ${err.toExponential(2)} > ${tol})`);
    }
  }
}

function hueNear(name, got, want, tol) {
  checks++;
  let d = ((got - want) % 360 + 540) % 360 - 180;
  if (!(Math.abs(d) <= tol)) {
    fails++;
    if (fails <= 25) console.log(`  ✗ ${name}: got ${got}, want ${want} (Δ ${d.toFixed(3)}°)`);
  }
}

const toRgb = (c) => ({ r: c[0] / 255, g: c[1] / 255, b: c[2] / 255 });

console.log('校验 color.js …');

golden.colors.forEach((c, i) => {
  const rgb = toRgb(c);

  const ok = CP.rgb2oklch(rgb);
  near(`oklch.L[${i}]`, ok.L, golden.oklch[i][0], TOL.oklch_L);
  near(`oklch.C[${i}]`, ok.C, golden.oklch[i][1], TOL.oklch_C);
  if (golden.oklch[i][1] > 1e-4) hueNear(`oklch.h[${i}]`, ok.h, golden.oklch[i][2], TOL.oklch_h);

  const lab = CP.rgb2lab(rgb);
  for (let k = 0; k < 3; k++) near(`lab[${i}][${k}]`, lab[k], golden.lab[i][k], TOL.lab);

  const hsv = CP.rgb2hsv(rgb);
  if (hsv.s > 1e-4) hueNear(`hsv.h[${i}]`, hsv.h, golden.hsv[i][0], TOL.hsv_h);
  near(`hsv.s[${i}]`, hsv.s, golden.hsv[i][1], TOL.hsv_sv);
  near(`hsv.v[${i}]`, hsv.v, golden.hsv[i][2], TOL.hsv_sv);

  // HSV 往返
  const back = CP.hsv2rgb(hsv.h, hsv.s, hsv.v);
  near(`hsv2rgb.r[${i}]`, back.r, rgb.r, 1e-6);
  near(`hsv2rgb.g[${i}]`, back.g, rgb.g, 1e-6);
  near(`hsv2rgb.b[${i}]`, back.b, rgb.b, 1e-6);
});

golden.colors.forEach((c, i) => {
  const a = toRgb(c);
  const b = toRgb(golden.colors[(i + 1) % golden.colors.length]);
  near(`de00[${i}]`, CP.deltaE00(CP.rgb2lab(a), CP.rgb2lab(b)), golden.de00[i], TOL.de00);
});

golden.rybPoints.forEach((p, i) => {
  const out = CP.ryb2rgb(p.c[0], p.c[1], p.c[2]);
  near(`ryb2rgb.r[${i}]`, out.r, p.rgb[0], TOL.ryb_rgb);
  near(`ryb2rgb.g[${i}]`, out.g, p.rgb[1], TOL.ryb_rgb);
  near(`ryb2rgb.b[${i}]`, out.b, p.rgb[2], TOL.ryb_rgb);
});

// 反向：JS 自己反解后正向回来，误差不应超过 Python 参考实现
let worst = 0;
golden.rybRoundTrip.forEach((rt, i) => {
  const c = toRgb(rt.rgb);
  const co = CP.rgb2ryb(c);
  const back = CP.ryb2rgb(co.r, co.y, co.b);
  const de = CP.deltaE00(CP.rgb2lab(c), CP.rgb2lab(back));
  worst = Math.max(worst, de);
  checks++;
  if (!(de <= rt.de + 1.0)) {
    fails++;
    console.log(`  ✗ 颜料往返[${i}] ${rt.rgb.join(',')}: ΔE ${de.toFixed(2)} > 参考 ${rt.de.toFixed(2)}+1`);
  }
});

// 环坐标 ↔ 颜料坐标 往返
let worstPolar = 0;
for (let a = 0; a < 360; a += 7) {
  for (let r = 0.1; r <= 1.0001; r += 0.1) {
    const co = CP.polarToRyb(a, r);
    const p = CP.rybToPolar(co);
    const da = Math.abs(((p.a - a) % 360 + 540) % 360 - 180);
    const dr = Math.abs(p.r - r);
    worstPolar = Math.max(worstPolar, da, dr * 100);
    checks += 2;
    if (da > 0.5 || dr > 0.02) {
      fails++;
      if (fails <= 25) console.log(`  ✗ 环坐标往返 a=${a} r=${r.toFixed(2)}: Δa=${da.toFixed(2)} Δr=${dr.toFixed(3)}`);
    }
  }
}

// 颜料环色相轴（RYB 重排）
const PIG_ANCHOR = [[0, 0], [60, 30], [120, 60], [180, 120], [240, 240], [300, 285]];
PIG_ANCHOR.forEach(([p, h]) => near(`pigToHue(${p})`, CP.pigToHue(p), h, 1e-6));

let worstWarp = 0;
for (let p = 0; p < 360; p += 3) {
  const back = CP.hueToPig(CP.pigToHue(p));
  const d = Math.abs(((back - p) % 360 + 540) % 360 - 180);
  worstWarp = Math.max(worstWarp, d);
  checks++;
  if (d > 0.05) {
    fails++;
    if (fails <= 25) console.log(`  ✗ 颜料色相往返 p=${p}: 回到 ${back.toFixed(3)} (Δ ${d.toFixed(3)}°)`);
  }
}

// 单调性
let prev = -1;
for (let p = 0; p <= 360; p += 1) {
  const v = CP.pigToHue(p);
  const vv = p === 360 ? 360 : v;
  checks++;
  if (vv < prev - 1e-9) {
    fails++;
    console.log(`  ✗ 颜料色相非单调 p=${p}: ${vv} < ${prev}`);
  }
  prev = vv;
}

// 补色关系：对径相差 180° 的颜料角，其 HSV 色相应为 R↔G / Y↔V / B↔O
const comp = [[0, 120], [120, 285], [240, 30]];
comp.forEach(([p, wantHue]) => near(`补色 p=${p}`, CP.pigToHue((p + 180) % 360), wantHue, 1.0));

console.log(`\n共 ${checks} 项检查，失败 ${fails} 项。`);
console.log(`颜料反解最差 ΔE00 = ${worst.toFixed(2)}（仅备用立方体；含超出其色域的颜色，UI 已不再用它定位）`);
console.log(`颜料色相轴往返最差 = ${worstWarp.toFixed(3)}°`);
console.log(fails === 0 ? '✅ 全部通过' : '❌ 有偏差，见上');
process.exit(fails === 0 ? 0 : 1);
