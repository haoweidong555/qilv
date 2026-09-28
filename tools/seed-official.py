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
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "supabase", "官方账号.local.json")
CONTENT = os.path.join(ROOT, "content", "官方手册.md")

# 公开值：和 assets/js/config.js 里一致，走 Netlify 代理（国内可直连）
BASE = "https://qilv-api.netlify.app"
KEY = "sb_publishable_BWHft8nFb7VP5HPNyHXLNA_xkMUKEly"

TOPICS = {"buddy", "meet", "rent", "guide", "pit", "work", "daily"}


def call(method, path, body=None, token=None, extra=None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(BASE + path, data=data, method=method)
    req.add_header("apikey", KEY)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raise SystemExit("请求失败 %s %s -> %s %s" % (method, path, e.code, e.read().decode("utf-8")[:300]))


def parse_content(path):
    """把 @@ city=xx topic=yy 分块的文件解析成 [{city, topic, body}]"""
    with open(path, encoding="utf-8") as f:
        text = f.read()
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)      # 去掉开头的说明注释

    items, city, topic, buf = [], None, None, []

    def flush():
        if city is None:
            return
        body = "\n".join(buf).strip()
        if not body:
            return
        if topic not in TOPICS:
            raise SystemExit("话题写错了：%r（可用：%s）" % (topic, " ".join(sorted(TOPICS))))
        if len(body) > 2000:
            raise SystemExit("正文超过 2000 字，数据库会拒绝：%s" % body[:30])
        items.append({"city": city or None, "topic": topic, "body": body})

    for line in text.splitlines():
        if line.startswith("@@"):
            flush()
            city, topic, buf = None, None, []
            for part in line[2:].split():
                k, _, v = part.partition("=")
                if k == "city":
                    city = v.strip()
                elif k == "topic":
                    topic = v.strip()
            continue
        buf.append(line)
    flush()
    return items


def main():
    dry = "--dry-run" in sys.argv
    if not os.path.exists(CONFIG):
        raise SystemExit("找不到 %s" % CONFIG)
    with open(CONFIG, encoding="utf-8") as f:
        cfg = json.load(f)

    items = parse_content(CONTENT)
    print("文件里共有 %d 条编辑部内容" % len(items))

    st, data = call("POST", "/auth/v1/token?grant_type=password",
                    {"email": cfg["email"], "password": cfg["password"]})
    token = data["access_token"]
    uid = data["user"]["id"]
    print("已登录：栖旅编辑部（%s）" % uid)

    st, rows = call("GET", "/rest/v1/posts?select=body&author=eq." + uid, token=token)
    existing = {r["body"] for r in (rows or [])}

    todo = [it for it in items if it["body"] not in existing]
    print("已发布 %d 条，本次要补 %d 条" % (len(existing), len(todo)))
    if dry:
        for it in todo:
            print("  · [%s] %s" % (it["city"] or "话题", it["body"].split("\n")[0][:40]))
        return

    for it in todo:
        call("POST", "/rest/v1/posts", {
            "author": uid,
            "city": it["city"],
            "topic": it["topic"],
            "body": it["body"],
        }, token=token, extra={"Prefer": "return=minimal"})
        print("  ✓ [%s] %s" % (it["city"] or "话题", it["body"].split("\n")[0][:40]))

    print("完成。")


if __name__ == "__main__":
    main()
