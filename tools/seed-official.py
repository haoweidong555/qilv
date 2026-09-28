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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.path.join(ROOT, "supabase", "官方账号.local.json")
CONTENT = os.path.join(ROOT, "content", "官方手册.md")
DATA_JS = os.path.join(ROOT, "assets", "js", "data.js")

# 公开值：和 assets/js/config.js 里一致，走 Netlify 代理（国内可直连）
BASE = "https://qilv-api.netlify.app"
KEY = "sb_publishable_BWHft8nFb7VP5HPNyHXLNA_xkMUKEly"

TOPICS = {"buddy", "meet", "rent", "guide", "pit", "work", "daily"}


def city_index():
    """从 assets/js/data.js 读出「城市中文名 → 内部 id」的对照表。

    内容文件里写中文城市名（人看得懂），发帖时换成 id（网站内部用它做筛选和标签）。
    """
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()
    pairs = re.findall(
        r"id:\s*'([^']+)',\s*name:\s*'([^']+)',\s*region:\s*'([^']+)'", src)
    name2id, id2name = {}, {}
    for cid, name, _region in pairs:
        if cid in id2name:
            continue
        id2name[cid] = name
        name2id[name] = cid
    return name2id, id2name


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


def parse_content(path, name2id, id2name):
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
        # 「话题」表示不挂任何城市（写跨城市的通用内容时用）
        if not city or city in ("话题", "-", "无"):
            cid = None
        elif city in name2id:
            cid = name2id[city]
        elif city in id2name:
            cid = city
        else:
            raise SystemExit("城市写错了：%r（请写中文城市名，例如 大理、稻城亚丁）" % city)
        items.append({"city": cid, "topic": topic, "body": body})

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
