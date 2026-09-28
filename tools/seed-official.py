#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
栖旅 · 把 content/官方手册.md 里的编辑部内容同步到线上

用法：
    python3 tools/seed-official.py            # 只补没发过的
    python3 tools/seed-official.py --dry-run  # 只看看会发几条，不写库

特点：
    · 幂等：正文完全一样的帖子会跳过，重复跑不会刷屏；
    · 只动自己的号：只会以「栖旅编辑部」的名义发帖，不碰任何用户内容；
    · 不改旧帖：已经发出去的正文不会被覆盖（有人点赞/回复之后更不该偷偷改），
      要改内容请在文件里改完，手动删掉那条再跑一次。
"""

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from official_content import CONTENT_MD, city_index, parse_content   # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "supabase", "官方账号.local.json")
CONTENT = CONTENT_MD

# 公开值：和 assets/js/config.js 里一致，走 Netlify 代理（国内可直连）
BASE = "https://qilv-api.netlify.app"
KEY = "sb_publishable_BWHft8nFb7VP5HPNyHXLNA_xkMUKEly"


def call(method, path, body=None, token=None, extra=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("apikey", KEY)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    last = None
    # 网络偶尔会抽一下（SSL EOF / 超时），重试三次再放弃
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as resp:
                raw = resp.read().decode("utf-8")
                return resp.status, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raise SystemExit("请求失败 %s %s -> %s %s" % (method, path, e.code, e.read().decode("utf-8")[:300]))
        except Exception as e:            # 网络类错误：歇一下重试
            last = e
            time.sleep(2 + attempt * 3)
    raise SystemExit("网络不稳，重试三次仍失败：%s %s -> %r" % (method, path, last))


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.exists(CONFIG):
        raise SystemExit("找不到 %s" % CONFIG)
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)

    name2id, id2name = city_index()
    items = parse_content(CONTENT, name2id, id2name)
    print("文件里共有 %d 条编辑部内容" % len(items))

    st, data = call("POST", "/auth/v1/token?grant_type=password",
                    {"email": cfg["email"], "password": cfg["password"]})
    token = data["access_token"]
    uid = data["user"]["id"]
    print("已登录：栖旅编辑部（%s）" % uid)

    st, rows = call("GET", "/rest/v1/posts?select=body&author=eq." + uid, token=token)
    existing = {r["body"] for r in (rows or [])}

    if "--reset" in sys.argv:
        call("DELETE", "/rest/v1/posts?author=eq." + uid, token=token)
        existing = set()
        print("已清空编辑部旧帖（--reset），全部重发")

    todo = [it for it in items if it["body"] not in existing]
    print("已发布 %d 条，本次要补 %d 条" % (len(existing), len(todo)))
    if dry:
        for it in todo:
            print("  · [%s] %s" % (id2name.get(it["city"], "话题"), it["body"].split("\n")[0][:40]))
        return

    for it in todo:
        call("POST", "/rest/v1/posts", {
            "author": uid,
            "city": it["city"],
            "topic": it["topic"],
            "body": it["body"],
        }, token=token, extra={"Prefer": "return=minimal"})
        print("  ✓ [%s] %s" % (id2name.get(it["city"], "话题"), it["body"].split("\n")[0][:40]))

    print("完成。")


if __name__ == "__main__":
    main()
