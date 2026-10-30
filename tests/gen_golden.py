"""生成 golden 向量：用 Python 参考实现算一遍，供 JS 内核比对。

    python tests/gen_golden.py  ->  tests/golden.json
"""

from __future__ import annotations

import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "preview"))

import gen_previews as G  # noqa: E402  （参考实现，含 OKLab / ΔE00 / RYB 立方）

TOL = {
    "oklch_L": 2e-4,
    "oklch_C": 2e-4,
    "oklch_h": 0.08,
    "lab": 0.05,
    "hsv_h": 0.03,
    "hsv_sv": 2e-4,
    "de00": 0.02,
    "ryb_rgb": 3e-3,
}


def main() -> int:
    rng = np.random.default_rng(20261029)

    # 固定种子，挑 24 个覆盖各色区的颜色
    fixed = [
        (255, 0, 0), (255, 255, 0), (0, 255, 0), (0, 255, 255),
        (0, 0, 255), (255, 0, 255), (255, 255, 255), (0, 0, 0),
        (128, 128, 128), (122, 158, 189), (200, 30, 90), (30, 90, 200),
    ]
    colors = [list(c) for c in fixed]
    for _ in range(12):
        colors.append([int(v) for v in rng.integers(0, 256, 3)])

    oklch, lab, hsv = [], [], []
    for c in colors:
        rgb = np.array(c, dtype=float) / 255.0
        lin = G.srgb_to_lin(rgb)
        oklab = G.lin_to_oklab(lin)
        C = float(np.hypot(oklab[1], oklab[2]))
        h = float(np.degrees(np.arctan2(oklab[2], oklab[1])) % 360) if C > 1e-9 else 0.0
        oklch.append([float(oklab[0]), C, h])
        lab.append([float(v) for v in G.srgb_to_lab(rgb)])
        hh = G.hsv_to_rgb  # 只为占位，下面手算 HSV
        r, g, b = [v / 255.0 for v in c]
        mx, mn = max(r, g, b), min(r, g, b)
        d = mx - mn
        if d < 1e-12:
            hue = 0.0
        elif mx == r:
            hue = (60 * ((g - b) / d)) % 360
        elif mx == g:
            hue = 60 * ((b - r) / d + 2)
        else:
            hue = 60 * ((r - g) / d + 4)
        hsv.append([hue % 360, 0.0 if mx < 1e-12 else d / mx, mx])

    de = []
    for i in range(len(colors)):
        a = np.array(colors[i], dtype=float) / 255.0
        b = np.array(colors[(i + 1) % len(colors)], dtype=float) / 255.0
        de.append(float(G.delta_e00(G.srgb_to_lab(a), G.srgb_to_lab(b))))

    # 颜料立方体正向
    pts = [(0, 0, 0), (1, 0, 0), (0, 1, 0), (0, 0, 1), (1, 1, 0),
           (1, 0, 1), (0, 1, 1), (1, 1, 1)]
    pts += [(float(x), float(y), float(z))
            for x, y, z in rng.random((10, 3))]
    ryb_points = []
    for (r, y, b) in pts:
        out = G.ryb_to_rgb(r, y, b)
        ryb_points.append({"c": [r, y, b], "rgb": [float(v) for v in out]})

    # 反向：17³ 网格最近邻（与 JS 同法），再正向回来，给出允许误差
    n = 17
    grid = []
    for i in range(n):
        for j in range(n):
            for k in range(n):
                co = (i / (n - 1), j / (n - 1), k / (n - 1))
                rgb = np.array(G.ryb_to_rgb(*co))
                lin = G.srgb_to_lin(rgb)
                labv = G.lin_to_oklab(lin)
                grid.append((co, labv))
    grid_lab = np.array([g[1] for g in grid])
    grid_co = [g[0] for g in grid]

    round_trip = []
    for c in colors:
        rgb = np.array(c, dtype=float) / 255.0
        lin = G.srgb_to_lin(rgb)
        labv = G.lin_to_oklab(lin)
        d2 = ((grid_lab - labv) ** 2).sum(axis=1)
        co = grid_co[int(np.argmin(d2))]
        back = np.array(G.ryb_to_rgb(*co))
        err = float(G.delta_e00(G.srgb_to_lab(rgb), G.srgb_to_lab(back)))
        round_trip.append({"rgb": c, "ryb": [float(v) for v in co], "de": err})

    doc = {
        "tolerance": TOL,
        "colors": colors,
        "oklch": oklch,
        "lab": lab,
        "hsv": hsv,
        "de00": de,
        "rybPoints": ryb_points,
        "rybRoundTrip": round_trip,
    }

    out = os.path.join(ROOT, "tests", "golden.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)

    errs = [r["de"] for r in round_trip]
    print(f"写出 {out}")
    print(f"颜料往返误差 ΔE00：最大 {max(errs):.2f} / 平均 {sum(errs)/len(errs):.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
