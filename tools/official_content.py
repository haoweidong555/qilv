# -*- coding: utf-8 -*-
"""
栖旅 · 编辑部内容的公共读取逻辑

被两个脚本共用：
  · tools/seed-official.py     —— 把内容发到线上数据库
  · tools/build-city-pages.py  —— 给每座城市生成可被搜索引擎收录的静态页

内容文件的格式：
  @@ city=城市中文名 topic=话题
  正文（可以多行、可以空行）
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "assets", "js", "data.js")
CONTENT_MD = os.path.join(ROOT, "content", "官方手册.md")

# 话题 id → 显示名。顺序也是页面上的展示顺序。
TOPIC_NAMES = [
    ("guide", "城市手册"),
    ("pit", "避坑"),
    ("work", "远程办公实测"),
]
TOPIC_IDS = [t for t, _ in TOPIC_NAMES]


def city_index():
    """assets/js/data.js 里的 城市中文名 → 内部 id 对照表"""
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


def parse_content(path, name2id, id2name):
    """解析 content/官方手册.md → [{city, topic, body}]"""
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
        if topic not in TOPIC_IDS:
            raise SystemExit("话题写错了：%r（可用：%s）" % (topic, " ".join(TOPIC_IDS)))
        if len(body) > 2000:
            raise SystemExit("正文超过 2000 字：%s" % body[:30])
        # 「话题」表示不挂任何城市（跨城市的通用内容）
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


def official_by_city():
    """返回 {城市 id: {话题: 正文}}，只包含挂了城市的内容"""
    name2id, id2name = city_index()
    out = {}
    for it in parse_content(CONTENT_MD, name2id, id2name):
        if not it["city"]:
            continue
        out.setdefault(it["city"], {})[it["topic"]] = it["body"]
    return out
