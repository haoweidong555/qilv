#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
栖旅 · 本地预览服务

比 `python3 -m http.server` 多做了两件必需的事：
1. 支持 HTTP Range 请求 —— Safari / WebKit 播放 <video> 时必须要有，
   否则视频会直接报「无法播放媒体」（MEDIA_ERR_SRC_NOT_SUPPORTED）。
2. 补齐 mp4 / webm / webp 等 MIME 类型。

用法：
    python3 serve.py          # 默认 http://127.0.0.1:8777
    python3 serve.py 8080     # 指定端口
"""

import functools
import os
import re
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
CHUNK = 256 * 1024


class RangeHandler(SimpleHTTPRequestHandler):
    # 画廊一屏可能有十几段视频同时开始加载，每段还会连发几个 Range 请求。
    # 默认 backlog 只有 5，多出来的连接会被直接重置（浏览器里就是 ERR_CONNECTION_RESET），
    # 视频于是走一次失败重试。把队列放大即可。
    request_queue_size = 128
    protocol_version = 'HTTP/1.1'

    extensions_map = dict(SimpleHTTPRequestHandler.extensions_map)
    extensions_map.update({
        '.mp4': 'video/mp4',
        '.m4v': 'video/x-m4v',
        '.mov': 'video/quicktime',
        '.webm': 'video/webm',
        '.webp': 'image/webp',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.woff2': 'font/woff2',
    })

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Cache-Control', 'no-cache')
        SimpleHTTPRequestHandler.end_headers(self)

    def send_head(self):
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            return SimpleHTTPRequestHandler.send_head(self)

        rng = self.headers.get('Range')
        if not rng:
            return SimpleHTTPRequestHandler.send_head(self)

        try:
            f = open(path, 'rb')
        except OSError:
            return SimpleHTTPRequestHandler.send_head(self)

        try:
            size = os.fstat(f.fileno()).st_size
            ctype = self.guess_type(path)
            match = re.match(r'bytes=(\d*)-(\d*)\s*$', rng.strip())
            if not match or (not match.group(1) and not match.group(2)):
                f.close()
                return SimpleHTTPRequestHandler.send_head(self)

            start_s, end_s = match.group(1), match.group(2)
            if start_s == '':
                start, end = max(0, size - int(end_s)), size - 1
            else:
                start = int(start_s)
                end = int(end_s) if end_s else size - 1
            end = min(end, size - 1)

            if start >= size or start > end:
                self.send_response(416)
                self.send_header('Content-Range', 'bytes */%d' % size)
                self.send_header('Content-Length', '0')
                self.end_headers()
                f.close()
                return None

            self.send_response(206)
            self.send_header('Content-Type', ctype)
            self.send_header('Content-Range', 'bytes %d-%d/%d' % (start, end, size))
            self.send_header('Content-Length', str(end - start + 1))
            self.send_header('Last-Modified', self.date_time_string(os.fstat(f.fileno()).st_mtime))
            self.end_headers()
            f.seek(start)
            self._range_left = end - start + 1
            return f
        except Exception:
            self._range_left = None
            f.close()
            raise

    def copyfile(self, source, outputfile):
        left = getattr(self, '_range_left', None)
        if not left:
            try:
                SimpleHTTPRequestHandler.copyfile(self, source, outputfile)
            except (BrokenPipeError, ConnectionResetError):
                # 客户端主动断开（换页、seek）时会走到这里，别让它污染 keep-alive 连接
                self.close_connection = True
            return
        try:
            while left > 0:
                chunk = source.read(min(CHUNK, left))
                if not chunk:
                    break
                outputfile.write(chunk)
                left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True
        finally:
            self._range_left = None

    def log_message(self, fmt, *args):
        # 视频请求会刷屏，静默处理；只在出错时提示
        if args and str(args[1]).startswith(('4', '5')):
            sys.stderr.write("  %s %s\n" % (self.address_string(), fmt % args))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    handler = functools.partial(RangeHandler, directory=ROOT)
    server = ThreadingHTTPServer(('127.0.0.1', port), handler)
    print('栖旅预览服务已启动：http://127.0.0.1:%d/index.html' % port)
    print('（支持视频 Range 请求；Ctrl+C 停止）')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止。')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
