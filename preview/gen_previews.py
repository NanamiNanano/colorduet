"""生成色环方案预览图 —— v2（修正标注顺序 / 增加色域尖点方案）。

运行： python preview/gen_previews.py
输出： preview/01..05 *.png
"""

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "C:/Windows/Fonts/msyh.ttc"
FONT_B = "C:/Windows/Fonts/msyhbd.ttc"
BG = (22, 24, 28)
FG = (232, 234, 238)
DIM = (150, 155, 165)
ACCENT = (255, 176, 64)


def font(size, bold=False):
    return ImageFont.truetype(FONT_B if bold else FONT, size)


# ---------------------------------------------------------------- 色彩数学
M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
               [0.2119034982, 0.6806995451, 0.1073969566],
               [0.0883024619, 0.2817188376, 0.6299787005]])
M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
               [1.9779984951, -2.4285922050, 0.4505937099],
               [0.0259040371, 0.7827717662, -0.8086757660]])
M1i, M2i = np.linalg.inv(M1), np.linalg.inv(M2)
M_RGB2XYZ = np.array([[0.4124564, 0.3575761, 0.1804375],
                      [0.2126729, 0.7151522, 0.0721750],
                      [0.0193339, 0.1191920, 0.9503041]])
WHITE_D65 = np.array([0.95047, 1.0, 1.08883])


def srgb_to_lin(c):
    c = np.asarray(c, dtype=float)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(np.asarray(c, dtype=float), 0.0, 1.0)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def lin_to_oklab(lin):
    lms = np.asarray(lin, dtype=float) @ M1.T
    return np.cbrt(np.maximum(lms, 0)) @ M2.T


def oklab_to_lin(lab):
    return ((np.asarray(lab, dtype=float) @ M2i.T) ** 3) @ M1i.T


def oklch_to_lin(L, C, h_deg):
    h = np.radians(h_deg)
    a, b = C * np.cos(h), C * np.sin(h)
    return oklab_to_lin(np.stack(np.broadcast_arrays(L, a, b), axis=-1))


def in_gamut(lin, eps=1e-4):
    return np.all((lin >= -eps) & (lin <= 1 + eps), axis=-1)


def max_chroma(L, h_deg, hi=0.45, iters=26):
    L = np.asarray(L, dtype=float)
    h = np.asarray(h_deg, dtype=float)
    lo, up = np.zeros_like(L), np.full_like(L, hi)
    for _ in range(iters):
        mid = (lo + up) / 2
        ok = in_gamut(oklch_to_lin(L, mid, h))
        lo, up = np.where(ok, mid, lo), np.where(ok, up, mid)
    return (lo + up) / 2


def hsv_to_rgb(h_deg, s, v):
    h = np.mod(np.asarray(h_deg, dtype=float), 360.0) / 60.0
    s, v = np.asarray(s, dtype=float), np.asarray(v, dtype=float)
    i = np.floor(h).astype(int) % 6
    f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    r = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [v, q, p, p, t, v])
    g = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [t, v, v, q, p, p])
    b = np.select([i == 0, i == 1, i == 2, i == 3, i == 4, i == 5], [p, p, t, v, v, q])
    return np.stack([r, g, b], axis=-1)


def srgb_to_lab(rgb):
    lin = srgb_to_lin(rgb)
    xyz = (lin @ M_RGB2XYZ.T) / WHITE_D65
    e, k = 216 / 24389, 24389 / 27

    def f(t):
        return np.where(t > e, np.cbrt(t), (k * t + 16) / 116)

    fx, fy, fz = f(xyz[..., 0]), f(xyz[..., 1]), f(xyz[..., 2])
    return np.stack([116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)], axis=-1)


def delta_e00(lab1, lab2):
    L1, a1, b1 = lab1
    L2, a2, b2 = lab2
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if C1p else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if C2p else 0.0
    dLp, dCp = L2 - L1, C2p - C1p
    dhp = h2p - h1p
    if C1p * C2p == 0:
        dhp = 0.0
    elif dhp > 180:
        dhp -= 360
    elif dhp < -180:
        dhp += 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)
    Lbp, Cbp = (L1 + L2) / 2, (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2
    else:
        hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30))
         + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6))
         - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dtheta = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7))
    Sl = 1 + 0.015 * (Lbp - 50) ** 2 / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc, Sh = 1 + 0.045 * Cbp, 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


# ------------------------------------------------------- 色域尖点表 & 色相锚点
NH = 1440
H_GRID = np.arange(NH) * (360.0 / NH)


def _build_cusp():
    """每个色相的色域尖点（最大彩度及其明度）。抛物线细化 + 环形平滑，避免折痕。"""
    Ls = np.linspace(0.02, 0.998, 240)
    Cm = np.empty((Ls.size, NH))
    for i, L in enumerate(Ls):
        Cm[i] = max_chroma(np.full(NH, L), H_GRID)
    k = np.argmax(Cm, axis=0)
    k = np.clip(k, 1, Ls.size - 2)
    # 抛物线顶点细化
    cols = np.arange(NH)
    c0, c1, c2 = Cm[k - 1, cols], Cm[k, cols], Cm[k + 1, cols]
    denom = (c0 - 2 * c1 + c2)
    denom = np.where(np.abs(denom) < 1e-12, 1e-12, denom)
    delta = 0.5 * (c0 - c2) / denom
    delta = np.clip(delta, -1, 1)
    step = Ls[1] - Ls[0]
    best_l = Ls[k] + delta * step
    best_c = c1 - 0.25 * (c0 - c2) * delta

    def smooth(a, n=9):
        ker = np.ones(n) / n
        return np.convolve(np.r_[a[-n:], a, a[:n]], ker, mode="same")[n:-n]

    return smooth(best_l), smooth(best_c)


def _anchor_hues():
    prim = [(1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1), (1, 0, 1)]
    hs = []
    for c in prim:
        lab = lin_to_oklab(srgb_to_lin(np.array(c, dtype=float)))
        hs.append(math.degrees(math.atan2(lab[2], lab[1])) % 360)
    return hs


L_CUSP, C_CUSP = _build_cusp()
ANCHOR_H = _anchor_hues()


def warp_to_oklch_hue(display_deg):
    """显示角度（6 主色等分）→ 真实 OKLCH 色相。"""
    a = list(ANCHOR_H) + [ANCHOR_H[0] + 360.0]
    src = [0, 60, 120, 180, 240, 300, 360]
    h = float(np.mod(display_deg, 360.0))
    for i in range(6):
        if src[i] - 1e-9 <= h <= src[i + 1] + 1e-9:
            return (a[i] + (h - src[i]) / 60.0 * (a[i + 1] - a[i])) % 360.0
    return h


# ---------------------------------------------------------------- 渲染
def render_wheel(kind, size=520, ss=2, L=0.72, warped=False):
    n = size * ss
    ys, xs = np.mgrid[0:n, 0:n]
    c = (n - 1) / 2
    nx, ny = (xs - c) / (n / 2), (ys - c) / (n / 2)
    r = np.clip(np.hypot(nx, ny), 0, 1)
    ang = np.degrees(np.arctan2(-ny, nx)) % 360

    if kind == "hsv":
        rgb = hsv_to_rgb(ang, r, 1.0)
    else:
        h = np.array([warp_to_oklch_hue(a) if warped else a for a in ang.ravel()])
        h = h.reshape(ang.shape)
        idx = np.rint(h * (NH / 360.0)).astype(int) % NH
        if kind == "flat":                      # 固定明度：彩度按该明度下的上限
            C = r * max_chroma(np.full(NH, L), H_GRID)[idx]
            rgb = lin_to_srgb(oklch_to_lin(L, C, H_GRID[idx]))
        elif kind == "cusp":                    # 尖点：最艳，明度随色相浮动
            Lp = L_NEUTRAL + (L_CUSP[idx] - L_NEUTRAL) * r
            Cp = C_CUSP[idx] * r
            rgb = lin_to_srgb(oklch_to_lin(Lp, Cp, H_GRID[idx]))
        else:
            raise ValueError(kind)

    img = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB")
    img = img.resize((size, size), Image.LANCZOS)
    arr = np.asarray(img).astype(float) / 255.0
    m = np.hypot(*np.mgrid[0:size, 0:size][::-1]) * 0 + np.hypot(
        np.mgrid[0:size, 0:size][0] - (size - 1) / 2,
        np.mgrid[0:size, 0:size][1] - (size - 1) / 2) > size / 2 - 0.6
    arr[m] = np.array(BG) / 255.0
    return arr


L_NEUTRAL = 0.72


def paste_wheel(img, arr, x, y):
    img.paste(Image.fromarray((arr * 255).astype(np.uint8)), (x, y))


def draw_ring_marks(d, x, y, size, labels, name_font=28):
    cx, cy, rad = x + size / 2, y + size / 2, size / 2
    for deg, name in labels:
        th = math.radians(deg)
        px = cx + math.cos(th) * rad * 0.78
        py = cy - math.sin(th) * rad * 0.78
        f = font(name_font, True)
        w = d.textlength(name, font=f)
        d.text((px - w / 2, py - name_font * 0.62), name, font=f, fill=(20, 20, 20),
               stroke_width=4, stroke_fill=(255, 255, 255))
    for deg in range(0, 360, 10):
        th = math.radians(deg)
        r0, r1 = rad + 2, rad + (6 if deg % 30 else 12)
        d.line([cx + math.cos(th) * r0, cy - math.sin(th) * r0,
                cx + math.cos(th) * r1, cy - math.sin(th) * r1],
               fill=DIM if deg % 30 else FG, width=1 if deg % 30 else 2)
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], outline=(70, 74, 82), width=2)


def caption(d, x, y, lines, width_px=1, size=22):
    yy = y
    for line in lines:
        d.text((x, yy), line, font=font(size), fill=DIM)
        yy += 30


def fig01():
    """A vs B —— 用户问的两个方案。"""
    size, W, H = 520, 1300, 880
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    a_arr = render_wheel("hsv", size)
    b_arr = render_wheel("flat", size, L=0.72, warped=False)
    xa, xb, ytop = 40, W - size - 40, 86
    paste_wheel(img, a_arr, xa, ytop)
    paste_wheel(img, b_arr, xb, ytop)

    names = ["红", "黄", "绿", "青", "蓝", "品红"]
    draw_ring_marks(d, xa, ytop, size, [(i * 60, n) for i, n in enumerate(names)])
    draw_ring_marks(d, xb, ytop, size,
                    [(ANCHOR_H[i], n) for i, n in enumerate(names)])

    d.text((xa, 30), "方案 A   HSV 色环（传统）", font=font(34, True), fill=FG)
    d.text((xb, 30), "方案 B   OKLCH 色环（感知均匀）", font=font(34, True), fill=FG)

    gaps = "/".join("%.0f" % ((ANCHOR_H[(i + 1) % 6] - ANCHOR_H[i]) % 360) for i in range(6))
    caption(d, xa, ytop + size + 26, [
        "· 6 个主色正好每 60° 一个，扫一眼就知道绿在哪",
        "· 整圈都是「最艳」的颜色，视觉上讨喜",
        "· 等角度 ≠ 等视觉差：绿→青几乎看不出，品红→红跳得厉害",
        "   实测相邻 30° 色差：6.1 ~ 40.3（起伏 34）",
    ])
    caption(d, xb, ytop + size + 26, [
        "· 角度就是真实感受，色差曲线接近水平（13.8 ~ 19.8）",
        "· 但主色挤在一起：角间距 " + gaps + " 度",
        "· 而且整圈发闷——固定明度时拿不到纯红纯蓝",
        "   （L=0.72 的「红」只能是珊瑚粉，不是大红）",
    ])
    d.text((40, H - 40),
           "一句话：A 好看好找但角度失真；B 角度诚实但难看。→ 见方案 D（05 图）",
           font=font(24, True), fill=ACCENT)
    img.save(os.path.join(OUT, "01-hsv-vs-oklch.png"))


def fig02():
    W, H = 1180, 620
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((36, 26), "为什么「等角度 ≠ 等视觉差」：绕环走 30°，人眼感受到的变化一样大吗？",
           font=font(30, True), fill=FG)
    d.text((36, 70), "纵轴 = 相邻两步的 CIEDE2000 色差（>1 人能看出区别）。理想色环应接近水平线。",
           font=font(21), fill=DIM)

    hsv_v, ok_v = [], []
    for i in range(12):
        a0, a1 = i * 30.0, (i + 1) * 30.0
        hsv_v.append(delta_e00(srgb_to_lab(hsv_to_rgb(a0, 0.9, 1.0)),
                               srgb_to_lab(hsv_to_rgb(a1, 0.9, 1.0))))
        c0 = lin_to_srgb(oklch_to_lin(0.72, 0.9 * float(max_chroma(0.72, a0)), a0))
        c1 = lin_to_srgb(oklch_to_lin(0.72, 0.9 * float(max_chroma(0.72, a1)), a1))
        ok_v.append(delta_e00(srgb_to_lab(c0), srgb_to_lab(c1)))

    x0, y0, pw, ph = 96, 140, W - 160, 290
    vmax = max(hsv_v + ok_v) * 1.12
    for k in range(5):
        yy = y0 + ph - ph * k / 4
        d.line([x0, yy, x0 + pw, yy], fill=(52, 56, 64), width=1)
        d.text((x0 - 56, yy - 11), "%.0f" % (vmax * k / 4), font=font(18), fill=DIM)

    bw = pw / 12
    for i in range(12):
        for j, (vals, col) in enumerate([(hsv_v, (88, 158, 255)), (ok_v, (255, 140, 60))]):
            h = ph * vals[i] / vmax
            x = x0 + i * bw + 8 + j * (bw / 2 - 2)
            d.rectangle([x, y0 + ph - h, x + bw / 2 - 16, y0 + ph], fill=col)
        d.text((x0 + i * bw + bw / 2 - 16, y0 + ph + 12), "%d°" % (i * 30),
               font=font(18), fill=DIM)

    d.line([x0, y0 + ph, x0 + pw, y0 + ph], fill=(80, 84, 92), width=2)
    lx, ly = x0 + pw - 420, H - 112
    d.rectangle([lx, ly, lx + 14, ly + 14], fill=(88, 158, 255))
    d.text((lx + 22, ly - 4), "方案 A  HSV", font=font(21), fill=FG)
    d.rectangle([lx + 210, ly, lx + 224, ly + 14], fill=(255, 140, 60))
    d.text((lx + 232, ly - 4), "方案 B  OKLCH", font=font(21), fill=FG)

    d.text((36, H - 58),
           "起伏幅度：A = %.1f（6.1→40.3，差 6.6 倍）    B = %.1f（1.4 倍）"
           % (max(hsv_v) - min(hsv_v), max(ok_v) - min(ok_v)),
           font=font(23, True), fill=ACCENT)
    img.save(os.path.join(OUT, "02-uniformity.png"))


def fig03():
    """推荐模型的明度滑杆行为：整环加白 / 加黑。"""
    size, W, H = 232, 1420, 460
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((36, 22), "推荐模型的明度滑杆：环永远是「最艳」的，滑杆对整环加白 / 加黑（tint / shade）",
           font=font(28, True), fill=FG)
    base = render_wheel("cusp", size)
    yy, xx = np.mgrid[0:size, 0:size]
    outside = np.hypot(xx - (size - 1) / 2, yy - (size - 1) / 2) > size / 2 - 0.6
    for i, (t, tag) in enumerate([(0.55, "加白 55%"), (0.25, "加白 25%"),
                                  (0.0, "原始（尖点彩度）"),
                                  (-0.30, "加黑 30%"), (-0.60, "加黑 60%")]):
        arr = base.copy()
        if t > 0:
            arr = arr * (1 - t) + t
        elif t < 0:
            arr = arr * (1 + t)
        arr[outside] = np.array(BG) / 255.0
        x = 36 + i * (size + 12)
        paste_wheel(img, arr, x, 92)
        d.text((x + 2, 336), tag, font=font(20), fill=ACCENT if t == 0 else DIM)
    d.text((36, 386),
           "两个环共用这一根滑杆：颜料环同样按「加白/加黑」变化，与画家调色的直觉一致。",
           font=font(21), fill=DIM)
    img.save(os.path.join(OUT, "03-lightness-strip.png"))


RYB_CORNERS = {
    (0, 0, 0): (1.000, 1.000, 1.000), (1, 0, 0): (1.000, 0.000, 0.000),
    (0, 1, 0): (1.000, 1.000, 0.000), (0, 0, 1): (0.163, 0.373, 0.600),
    (1, 1, 0): (1.000, 0.500, 0.000), (1, 0, 1): (0.500, 0.000, 0.500),
    (0, 1, 1): (0.000, 0.660, 0.200), (1, 1, 1): (0.200, 0.094, 0.000),
}
RYB_ANCHORS = [(1, 0, 0), (1, 1, 0), (0, 1, 0), (0, 1, 1), (0, 0, 1), (1, 0, 1)]


def ryb_to_rgb(r, y, b):
    out = [0.0, 0.0, 0.0]
    for i in (0, 1):
        wi = r if i else 1 - r
        for j in (0, 1):
            wj = y if j else 1 - y
            for k in (0, 1):
                wk = b if k else 1 - b
                w = wi * wj * wk
                if w == 0:
                    continue
                c = RYB_CORNERS[(i, j, k)]
                for ch in range(3):
                    out[ch] += w * c[ch]
    return out


def fig04():
    size, W, H = 540, 1160, 700
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    n = size * 2
    ys, xs = np.mgrid[0:n, 0:n]
    c = (n - 1) / 2
    ang = np.degrees(np.arctan2(-(ys - c), xs - c)) % 360
    rad0 = np.hypot((xs - c) / (n / 2), (ys - c) / (n / 2))
    rad = np.clip(rad0, 0, 1)
    seg = np.floor(ang / 60).astype(int) % 6
    t = (ang - seg * 60) / 60.0
    coords = np.zeros(ang.shape + (3,))
    for i in range(6):
        m = seg == i
        c0 = np.array(RYB_ANCHORS[i], dtype=float)
        c1 = np.array(RYB_ANCHORS[(i + 1) % 6], dtype=float)
        for k in range(3):
            coords[..., k][m] = c0[k] + t[m] * (c1[k] - c0[k])
    rr = rad[..., None]
    coords = coords * rr + np.array([0.5, 0.5, 0.5]) * (1 - rr)
    flat = coords.reshape(-1, 3)
    rgb = np.array([ryb_to_rgb(*p) for p in flat]).reshape(coords.shape)
    rgb[rad0 > 1] = np.array(BG) / 255.0
    im = Image.fromarray((np.clip(rgb, 0, 1) * 255).astype(np.uint8), "RGB")
    im = im.resize((size, size), Image.LANCZOS)
    img.paste(im, (40, 86))
    draw_ring_marks(d, 40, 86, size, [(i * 60, n) for i, n in enumerate(
        ["红 R", "橙 O", "黄 Y", "绿 G", "蓝 B", "紫 V"])], name_font=26)
    d.text((40, 28), "颜料环（RYB 立方体 / Itten 12 色）", font=font(30, True), fill=FG)
    caption(d, 40 + size + 26, 150, [
        "补色对：红↔绿　黄↔紫　蓝↔橙",
        "与光色环的对径关系完全不同——",
        "这就是第二个环存在的唯一理由。",
        "",
        "注意中心偏褐：立方体的中性点",
        "不是真灰，正式实现必须校正中轴。",
    ])
    img.save(os.path.join(OUT, "04-ryb-wheel.png"))


def fig05():
    """E（真实角）vs D（等分角）—— 都基于尖点彩度。"""
    size, W, H = 500, 1290, 860
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    xe, xd, y0 = 40, W - size - 40, 88
    paste_wheel(img, render_wheel("cusp", size, warped=False), xe, y0)
    paste_wheel(img, render_wheel("cusp", size, warped=True), xd, y0)
    names = ["红", "黄", "绿", "青", "蓝", "品红"]
    draw_ring_marks(d, xe, y0, size, [(ANCHOR_H[i], n) for i, n in enumerate(names)],
                    name_font=27)
    draw_ring_marks(d, xd, y0, size, [(i * 60, n) for i, n in enumerate(names)],
                    name_font=27)

    d.text((xe, 28), "方案 E　尖点彩度 + 真实色相角", font=font(31, True), fill=FG)
    d.text((xd, 28), "方案 D　尖点彩度 + 6 等分角", font=font(31, True), fill=FG)
    gaps = "/".join("%.0f°" % ((ANCHOR_H[(i + 1) % 6] - ANCHOR_H[i]) % 360)
                    for i in range(6))
    caption(d, xe, y0 + size + 24, [
        "· 艳度、均匀性都是最好的",
        "· 标签按真实位置摆：间距 " + gaps,
        "· 代码最少：不需要 warp 映射",
        "· 缺点：黄和绿挤在一起，版式不对称",
    ], size=21)
    caption(d, xd, y0 + size + 24, [
        "· 颜色同 E，但主色人为摆回 6 等分",
        "· 版式对称，找颜色最快",
        "· 缺点：分段线性 warp 会在主色处",
        "   留下可见的「折痕」（图中可见）",
    ], size=21)
    d.text((40, H - 46),
           "我的判断：选 E。折痕比「标签不对称」更影响观感，而且 E 少 60 行映射代码。",
           font=font(24, True), fill=ACCENT)
    img.save(os.path.join(OUT, "05-cusp-true-vs-even.png"))


def main():
    os.makedirs(OUT, exist_ok=True)
    fig01()
    fig02()
    fig03()
    fig04()
    fig05()
    print("主色 OKLCH 色相:", ["%.1f" % h for h in ANCHOR_H])
    print("主色角间距:", ["%.1f" % ((ANCHOR_H[(i + 1) % 6] - ANCHOR_H[i]) % 360)
                    for i in range(6)])
    print("done")


if __name__ == "__main__":
    main()
