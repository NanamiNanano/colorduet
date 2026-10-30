"""生成 Android 启动图标（色相环）。

    python tools/make_icon.py

产物：
    android/app/src/main/res/mipmap-*/ic_launcher.png
    preview/icon-512.png
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
BG = (22, 24, 28, 255)          # #16181C，和 App 背景一致
DENSITIES = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}


def hsv_to_rgb(h, s, v):
    h = (h % 360) / 60.0
    i = int(h) % 6
    f = h - int(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    return [
        (v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)
    ][i]


def render(size: int) -> Image.Image:
    ss = 4
    n = size * ss
    half = (n - 1) / 2
    r_out = n * 0.455
    r_in = n * 0.265

    img = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    px = np.zeros((n, n, 4), dtype=np.uint8)

    ys, xs = np.mgrid[0:n, 0:n]
    dx = xs - half
    dy = ys - half
    rad = np.hypot(dx, dy)
    ang = np.degrees(np.arctan2(-dy, dx)) % 360

    inside = (rad <= r_out) & (rad >= r_in)
    edge = 1.2 * ss
    alpha = np.clip((r_out - rad) / edge, 0, 1) * np.clip((rad - r_in) / edge, 0, 1)
    alpha = np.where(inside | ((rad < r_out) & (rad > r_in)), alpha, 0)

    rgb = np.zeros((n, n, 3), dtype=float)
    hues = np.round(ang * 2) / 2
    for deg in np.unique(hues):
        m = hues == deg
        r, g, b = hsv_to_rgb(deg, 1.0, 1.0)
        rgb[m] = (r, g, b)

    px[..., 0] = (rgb[..., 0] * 255).astype(np.uint8)
    px[..., 1] = (rgb[..., 1] * 255).astype(np.uint8)
    px[..., 2] = (rgb[..., 2] * 255).astype(np.uint8)
    px[..., 3] = (np.clip(alpha, 0, 1) * 255).astype(np.uint8)
    img = Image.fromarray(px, "RGBA")

    # 底色：圆角方块
    base = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.22, fill=BG)
    base.alpha_composite(img)

    # 标记点：环上 30° 处一个小白点，暗示"取色"
    d2 = ImageDraw.Draw(base)
    th = math.radians(30)
    r_mid = (r_out + r_in) / 2
    cx, cy = half + math.cos(th) * r_mid, half - math.sin(th) * r_mid
    dot = n * 0.052
    d2.ellipse([cx - dot, cy - dot, cx + dot, cy + dot],
               fill=(255, 255, 255, 255), outline=(22, 24, 28, 255), width=int(2 * ss))

    return base.resize((size, size), Image.LANCZOS)


def main() -> int:
    for name, size in DENSITIES.items():
        out_dir = os.path.join(RES, f"mipmap-{name}")
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, "ic_launcher.png")
        render(size).save(path)
        print(f"{path}  {size}x{size}")

    preview = os.path.join(ROOT, "preview", "icon-512.png")
    render(512).save(preview)
    print(f"{preview}  512x512")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
