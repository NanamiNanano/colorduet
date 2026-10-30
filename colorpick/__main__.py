"""双环取色 —— 本地服务（PC 原型 / 后续 Android WebView 共用）。

用法：
    python -m colorpick                 # 默认 8766 端口，自动开浏览器
    python -m colorpick --port 9000
    python -m colorpick --no-open

设计原则（与 e2046 项目一致）：
    · 只用 Python 标准库，零 pip 依赖；
    · 只监听 127.0.0.1，不对外；
    · 前端是纯静态文件，Python 负责静态服务与（后续的）数据落盘。
"""

from __future__ import annotations

import argparse
import functools
import http.server
import os
import socket
import socketserver
import sys
import threading
import webbrowser

PKG_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(PKG_DIR, "web")

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    """静态文件 + 关缓存（开发期改完刷新即生效）。"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def guess_type(self, path):
        ext = os.path.splitext(str(path))[1].lower()
        return MIME.get(ext) or super().guess_type(path)

    def log_message(self, fmt, *args):  # 安静一点
        if "--verbose" in sys.argv:
            super().log_message(fmt, *args)


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def already_running(port: int) -> bool:
    """端口上是不是已经在跑本程序（避免双击两次开两个服务）。"""
    import urllib.request

    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=0.8) as r:
            body = r.read(4096).decode("utf-8", "ignore")
        return "双环取色" in body
    except Exception:
        return False


def pick_port(preferred: int) -> int:
    """端口被占用时顺延，避免和 e2046（8765）之类的冲突。"""
    for port in range(preferred, preferred + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit(f"端口 {preferred}~{preferred + 19} 都被占用了")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="colorpick", description="双环取色本地服务")
    ap.add_argument("--port", type=int, default=8766)
    ap.add_argument("--no-open", action="store_true", help="不自动打开浏览器")
    ap.add_argument("--verbose", action="store_true", help="打印访问日志")
    args = ap.parse_args(argv)

    if not os.path.isdir(WEB_DIR):
        print(f"[错误] 找不到前端目录：{WEB_DIR}", file=sys.stderr)
        return 1

    # 已经在跑：只把浏览器叫起来，不再开第二个服务
    if already_running(args.port):
        url = f"http://127.0.0.1:{args.port}/"
        print(f"服务已在运行：{url}")
        if not args.no_open:
            webbrowser.open(url)
        return 0

    port = pick_port(args.port)
    url = f"http://127.0.0.1:{port}/"

    httpd = Server(("127.0.0.1", port), functools.partial(Handler))
    print(f"双环取色 已启动：{url}")
    print("关掉这个窗口（或按 Ctrl+C）就停止。")
    if not args.no_open:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        httpd.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
