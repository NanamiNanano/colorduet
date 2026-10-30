"""把前端源码同步到 Android 的 assets 里。

    python tools/sync_assets.py

源：  colorpick/web/           （唯一事实来源）
目标：android/app/src/main/assets/www/

CI 每次打包前会跑一次，所以仓库里那份只是为了让本地构建开箱可用。
"""

from __future__ import annotations

import os
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "colorpick", "web")
DST = os.path.join(ROOT, "android", "app", "src", "main", "assets", "www")

EXTS = {".html", ".css", ".js", ".png", ".svg", ".json", ".woff2"}


def main() -> int:
    if not os.path.isdir(SRC):
        print(f"[错误] 找不到源目录：{SRC}")
        return 1

    if os.path.isdir(DST):
        shutil.rmtree(DST)
    os.makedirs(DST, exist_ok=True)

    count = 0
    for name in sorted(os.listdir(SRC)):
        path = os.path.join(SRC, name)
        if not os.path.isfile(path):
            continue
        if os.path.splitext(name)[1].lower() not in EXTS:
            continue
        shutil.copy2(path, os.path.join(DST, name))
        print(f"  {name}  {os.path.getsize(path) / 1024:.1f} KB")
        count += 1

    print(f"已同步 {count} 个文件 -> {os.path.relpath(DST, ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
