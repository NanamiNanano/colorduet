"""把 web/ 下的 index.html + style.css + *.js 打成单个 HTML。

产物可以直接双击用浏览器打开，不需要 Python、不需要起服务。

    python tools/build_single.py
    -> 双环取色.html（仓库根目录）
"""

from __future__ import annotations

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "colorpick", "web")
OUT = os.path.join(ROOT, "双环取色.html")

LINK_RE = re.compile(r'<link[^>]+href="([^"]+\.css)"[^>]*>')
SCRIPT_RE = re.compile(r'<script\s+src="([^"]+\.js)"\s*>\s*</script>')


def read(name: str) -> str:
    with open(os.path.join(WEB, name), encoding="utf-8") as f:
        return f.read()


def main() -> int:
    html = read("index.html")
    inlined = []

    def css_sub(m):
        name = m.group(1)
        inlined.append(name)
        return "<style>\n" + read(name) + "\n</style>"

    def js_sub(m):
        name = m.group(1)
        inlined.append(name)
        return "<script>\n" + read(name) + "\n</script>"

    html = LINK_RE.sub(css_sub, html)
    html = SCRIPT_RE.sub(js_sub, html)

    banner = (
        "<!-- 单文件版：由 tools/build_single.py 生成，请勿手改。\n"
        "     源文件在 colorpick/web/ 下："
        + "、".join(inlined) +
        "\n-->\n"
    )
    html = html.replace("<!doctype html>", "<!doctype html>\n" + banner, 1)

    with open(OUT, "w", encoding="utf-8") as f:
        f.write(html)

    size = os.path.getsize(OUT)
    print(f"已生成 {OUT}（{size / 1024:.0f} KB）")
    print("内联：" + "、".join(inlined))
    if "<script src=" in html or 'href="style.css"' in html:
        print("[警告] 还有未内联的外链，检查 index.html 的引用写法")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
