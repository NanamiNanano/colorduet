"""把 web/ 下的 index.html + style.css + color.js + app.js 打成单个 HTML。

产物可以直接双击用浏览器打开，不需要 Python、不需要起服务。

    python tools/build_single.py
    -> 双环取色.html（仓库根目录，双击即用）
"""

from __future__ import annotations

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "colorpick", "web")
OUT_DIR = ROOT
OUT = os.path.join(OUT_DIR, "双环取色.html")


def read(name: str) -> str:
    with open(os.path.join(WEB, name), encoding="utf-8") as f:
        return f.read()


def main() -> int:
    html = read("index.html")
    css = read("style.css")
    color_js = read("color.js")
    app_js = read("app.js")

    html = html.replace(
        '<link rel="stylesheet" href="style.css">',
        "<style>\n" + css + "\n</style>",
    )
    html = html.replace(
        '<script src="color.js"></script>\n<script src="app.js"></script>',
        "<script>\n" + color_js + "\n</script>\n<script>\n" + app_js + "\n</script>",
    )

    banner = (
        "<!-- 单文件版：由 tools/build_single.py 生成，请勿手改。\n"
        "     源文件在 colorpick/web/ 下。 -->\n"
    )
    html = html.replace("<!doctype html>", "<!doctype html>\n" + banner, 1)

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print(f"已生成 {OUT}（{size / 1024:.0f} KB）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
