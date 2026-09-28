#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
栖旅 · 给每座城市生成一个「能被搜索引擎收录」的静态页

用法：
    python3 tools/build-city-pages.py <输出目录>

输出（以输出目录为站点根）：
    cities/<id>/index.html   每座城市一页，正文是真 HTML，不依赖 JS
    cities/index.html        全部城市的总目录
    sitemap.xml  robots.txt  给搜索引擎的索引

为什么要有这个：主站是单页应用，内容靠 JS 渲染，搜索引擎拿到的基本是空壳。
这里把编辑部的手册内容在构建时渲染成真正的 HTML，每页有自己的标题、描述、
结构化数据，并且都能链回互动版。
"""

import datetime
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from official_content import DATA_JS, ROOT, TOPIC_NAMES, official_by_city   # noqa: E402

# 站点地址（发布到 GitHub Pages 的地址）
SITE = "https://haoweidong555.github.io/qilv"
SITE_NAME = "栖旅"
TODAY = datetime.date.today().isoformat()


# ---------------------------------------------------------------- 读取城市数据

def _s(block, key):
    m = re.search(key + r":\s*'([^']*)'", block)
    return m.group(1) if m else None


def _n(block, key):
    m = re.search(r"(?<![A-Za-z])" + key + r":\s*(\d+)", block)
    return int(m.group(1)) if m else None


def _best(block):
    m = re.search(r"best:\s*\[([^\]]*)\]", block)
    if not m:
        return []
    return sorted({int(x) for x in re.findall(r"\d+", m.group(1))})


def _facts(block):
    m = re.search(r"facts:\s*\[(.*?)\n\s*\],", block, re.S)
    if not m:
        return []
    return re.findall(r"\['([^']*)',\s*'([^']*)'\]", m.group(1))


def city_records():
    """把 assets/js/data.js 里的城市读成一批字典"""
    with open(DATA_JS, encoding="utf-8") as f:
        src = f.read()
    marks = list(re.finditer(
        r"\{\s*id:\s*'([a-z]+)',\s*name:\s*'([^']+)',\s*region:\s*'([^']+)'", src))
    out = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(src)
        block = src[m.start():end]
        cid, name, region = m.group(1), m.group(2), m.group(3)
        out.append({
            "id": cid,
            "name": name,
            "region": region,
            "province": region.split(" · ")[0],
            "city_part": region.split(" · ")[-1],
            "tagline": _s(block, "tagline") or "",
            "intro": _s(block, "intro") or "",
            "cost": _n(block, "cost"),
            "net": _n(block, "net"),
            "best": _best(block),
            "rent": _s(block, "rent"),
            "netNote": _s(block, "netNote"),
            "transport": _s(block, "transport"),
            "bestFor": _s(block, "bestFor"),
            "climateNote": _s(block, "climateNote"),
            "watch": _s(block, "watch"),
            "facts": _facts(block),
            "videoLabel": _s(block, "label"),
            "videoCredit": _s(block, "credit"),
        })
    return out


# ---------------------------------------------------------------- 小工具

def esc(t):
    return html.escape(str(t or ""), quote=True)


def month_label(months):
    """[3,4,10,11] → 4 月、10–11 月（相邻的合成区间）"""
    if not months:
        return ""
    ms = sorted(months)
    parts, start, prev = [], ms[0], ms[0]
    for m in ms[1:]:
        if m == prev + 1:
            prev = m
            continue
        parts.append((start, prev))
        start = prev = m
    parts.append((start, prev))
    return "、".join("%d 月" % a if a == b else "%d–%d 月" % (a, b) for a, b in parts)


def render_body(text):
    """把手册正文（按行写的中文）转成可读的 HTML"""
    out, buf = [], []

    def flush():
        if buf:
            out.append("<p>" + esc(" ".join(buf)) + "</p>")
            buf.clear()

    for raw in text.split("\n"):
        line = raw.strip()
        if not line:
            flush()
            continue
        if line.startswith("【") and line.endswith("】"):
            flush()
            out.append("<h3>" + esc(line[1:-1]) + "</h3>")
            continue
        if line.startswith("·") or re.match(r"^[一二三四五六七八九十]+、", line) or re.match(r"^\d+[.、]", line):
            flush()
            out.append('<p class="bullet">' + esc(line.lstrip("·").strip()) + "</p>")
            continue
        buf.append(line)
    flush()
    return "\n".join(out)


def excerpt(text, n=70):
    t = re.sub(r"\s+", " ", text).strip()
    return t if len(t) <= n else t[:n] + "…"


# ---------------------------------------------------------------- 页面模板

STYLE = """
:root { --ink:#1f1c18; --ink2:#4a443c; --ink3:#8b8377; --paper:#fdf8f1;
        --line:#e7ded1; --accent:#c8452e; --teal:#2f6f5e; }
* { box-sizing: border-box; }
body { margin:0; background:var(--paper); color:var(--ink);
       font:16px/1.85 -apple-system,"PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif; }
a { color:var(--accent); }
.wrap { max-width:820px; margin:0 auto; padding:0 22px 80px; }
header.site { border-bottom:1px solid var(--line); background:#fff; }
header.site .wrap { padding-top:14px; padding-bottom:14px; display:flex; align-items:center; gap:12px; }
header.site a { text-decoration:none; color:var(--ink); font-weight:700; }
header.site .sub { color:var(--ink3); font-size:13px; font-weight:400; }
.crumb { font-size:13px; color:var(--ink3); padding-top:22px; margin:0; }
.crumb a { color:var(--ink3); text-decoration:none; }
h1 { font-size:30px; line-height:1.35; margin:10px 0 6px; }
.region { color:var(--ink3); font-size:14px; margin:0 0 4px; }
.tagline { color:var(--ink2); font-size:17px; margin:6px 0 20px; }
figure { margin:0 0 26px; }
figure img { width:100%; height:auto; border-radius:12px; display:block; }
figcaption { font-size:12px; color:var(--ink3); margin-top:6px; }
.stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:1px;
         background:var(--line); border:1px solid var(--line); border-radius:12px;
         overflow:hidden; margin:0 0 28px; padding:0; }
.stat { background:#fff; padding:14px 16px; }
.stat dt { font-size:12px; color:var(--ink3); margin:0; }
.stat dd { margin:2px 0 0; font-size:20px; font-weight:700; }
.stat dd small { font-size:12px; font-weight:400; color:var(--ink3); margin-left:4px; }
h2 { font-size:22px; margin:38px 0 6px; padding-top:8px; border-top:2px solid var(--ink); }
h2 .kicker { display:block; font-size:12px; color:var(--teal); font-weight:600;
             letter-spacing:.04em; margin-bottom:2px; }
h3 { font-size:16px; margin:22px 0 6px; }
p { margin:10px 0; color:var(--ink2); }
p.bullet { padding-left:1.1em; text-indent:-1.1em; margin:6px 0; }
dl.facts { margin:12px 0 0; }
dl.facts > div { display:flex; gap:14px; padding:9px 0; border-top:1px solid var(--line); }
dl.facts dt { flex:none; width:6.5em; color:var(--ink3); font-size:13.5px; margin:0; }
dl.facts dd { margin:0; color:var(--ink2); font-size:14.5px; }
.cta { margin:40px 0 0; padding:22px; border:1px solid var(--line); border-radius:14px;
       background:#fff; text-align:center; }
.cta p { margin:0 0 14px; }
.btn { display:inline-block; background:var(--accent); color:#fff; text-decoration:none;
       padding:11px 22px; border-radius:999px; font-weight:600; }
.more { margin-top:44px; }
.more h2 { border:0; padding:0; font-size:17px; }
.links { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
.links a { border:1px solid var(--line); background:#fff; border-radius:999px;
           padding:6px 13px; font-size:13.5px; text-decoration:none; color:var(--ink2); }
.links a:hover { border-color:var(--accent); color:var(--accent); }
footer.site { border-top:1px solid var(--line); color:var(--ink3); font-size:12.5px; }
footer.site .wrap { padding-top:18px; padding-bottom:18px; }
"""


def page_shell(title, description, canonical, image, body, ld, rel):
    return """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="{site_name}">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{image}">
<script type="application/ld+json">{ld}</script>
<style>{style}</style>
</head>
<body>
<header class="site"><div class="wrap">
  <a href="{rel}">栖旅</a><span class="sub">中国旅居社区 · 城市指南</span>
</div></header>
<div class="wrap">
{body}
</div>
<footer class="site"><div class="wrap">
  「旅居指数 / 月均成本 / 网速」等数值是编辑部整理时的参考口径，会随行情更新。
  官方手册由栖旅编辑部署名整理，与用户投稿区分。
  <a href="{rel}cities/">全部城市指南 →</a>
</div></footer>
</body>
</html>
""".format(title=esc(title), desc=esc(description), canonical=esc(canonical),
           image=esc(image), site_name=esc(SITE_NAME), rel=rel, ld=ld,
           style=STYLE, body=body)


def city_page(city, content, related):
    cid, name = city["id"], city["name"]
    canonical = "%s/cities/%s/" % (SITE, cid)
    poster = "%s/assets/video/%s-poster.jpg" % (SITE, cid)
    # data.js 里的月份是 0–11 的下标，展示时 +1
    months = month_label([m + 1 for m in city["best"]])

    title = "%s旅居指南：房租、网速、几月最舒服｜%s" % (name, SITE_NAME)
    bits = [city["region"]]
    if city["tagline"]:
        bits.append(city["tagline"])
    if city["cost"]:
        bits.append("月均成本约 ¥%s" % format(city["cost"], ","))
    if city["net"]:
        bits.append("实测网速 %s Mbps" % city["net"])
    if months:
        bits.append("最舒服的月份是 %s" % months)
    desc = "。".join(bits) + "。栖旅编辑部整理的城市手册，含租房避坑与远程办公实测。"

    stats = []
    if city["cost"]:
        stats.append(("月均成本", "¥%s" % format(city["cost"], ","), "含房租与日常"))
    if city["net"]:
        stats.append(("实测网速", "%s" % city["net"], "Mbps 下行中位值"))
    if months:
        stats.append(("最舒服的月份", months, ""))
    stats.append(("行政区划", city["city_part"], city["province"]))

    body = []
    body.append('<p class="crumb"><a href="%s/">栖旅</a> / <a href="%s/cities/">城市指南</a> / %s</p>'
                % (SITE, SITE, esc(name)))
    body.append("<h1>%s旅居指南</h1>" % esc(name))
    body.append('<p class="region">%s</p>' % esc(city["region"]))
    if city["tagline"]:
        body.append('<p class="tagline">%s</p>' % esc(city["tagline"]))
    body.append('<figure><img src="%s" alt="%s实拍画面" width="1200" height="675">'
                % (esc("../../assets/video/%s-poster.jpg" % cid), esc(name)))
    cap = city["videoLabel"] or "实拍画面"
    if city["videoCredit"]:
        cap += " · " + city["videoCredit"]
    body.append("<figcaption>%s</figcaption></figure>" % esc(cap))
    body.append('<dl class="stats">' + "".join(
        '<div class="stat"><dt>%s</dt><dd>%s%s</dd></div>'
        % (esc(k), esc(v), (" <small>%s</small>" % esc(sub)) if sub else "")
        for k, v, sub in stats) + "</dl>")
    if city["intro"]:
        body.append("<p>%s</p>" % esc(city["intro"]))

    for tid, tname in TOPIC_NAMES:
        text = content.get(tid)
        if not text:
            continue
        lines = text.split("\n")
        heading = lines[0].strip()
        rest = "\n".join(lines[1:])
        body.append('<h2 id="%s"><span class="kicker">栖旅编辑部 · %s</span>%s</h2>'
                    % (tid, esc(tname), esc(heading)))
        body.append(render_body(rest))

    rows = []
    if city["facts"]:
        rows = city["facts"]
    else:
        for k, v in (("房租参考", city["rent"]), ("网速", city["netNote"]),
                     ("交通", city["transport"]), ("气候", city["climateNote"]),
                     ("适合谁", city["bestFor"]), ("要注意", city["watch"])):
            if v:
                rows.append((k, v))
    if rows:
        body.append('<h2 id="facts"><span class="kicker">落地的细节</span>住下来会遇到的</h2>')
        body.append('<dl class="facts">' + "".join(
            "<div><dt>%s</dt><dd>%s</dd></div>" % (esc(k), esc(v)) for k, v in rows) + "</dl>")

    body.append('<div class="cta"><p>这只是静态版。互动版里能看到%s的实拍短片、'
                '按月的气候图，以及住过这里的人写的笔记。</p>'
                '<a class="btn" href="../../?city=%s">在栖旅里打开%s →</a></div>'
                % (esc(name), esc(cid), esc(name)))

    if related:
        body.append('<section class="more"><h2>再看看这些城市</h2><div class="links">' +
                    "".join('<a href="../%s/">%s</a>' % (esc(c["id"]), esc(c["name"]))
                            for c in related) + "</div></section>")

    ld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Article",
                "headline": "%s旅居指南" % name,
                "description": desc,
                "inLanguage": "zh-CN",
                "mainEntityOfPage": {"@type": "WebPage", "@id": canonical},
                "image": [poster],
                "datePublished": TODAY,
                "dateModified": TODAY,
                "author": {"@type": "Organization", "name": "栖旅编辑部"},
                "publisher": {"@type": "Organization", "name": SITE_NAME, "url": SITE + "/"},
                "about": {
                    "@type": "City",
                    "name": name,
                    "containedInPlace": {"@type": "AdministrativeArea", "name": city["province"]},
                },
            },
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "栖旅", "item": SITE + "/"},
                    {"@type": "ListItem", "position": 2, "name": "城市指南", "item": SITE + "/cities/"},
                    {"@type": "ListItem", "position": 3, "name": "%s旅居指南" % name, "item": canonical},
                ],
            },
        ],
    }, ensure_ascii=False, indent=1)

    return page_shell(title, desc, canonical, poster, "\n".join(body), ld, "../../")


def index_page(cities):
    canonical = "%s/cities/" % SITE
    title = "全部 %d 座城市旅居指南：房租、网速、几月最舒服｜%s" % (len(cities), SITE_NAME)
    desc = ("栖旅编辑部整理的 %d 座中国城市旅居指南：每座城市都有住哪个片区、房租区间、"
            "网速、最舒服的月份、避坑清单和远程办公实测。" % len(cities))
    by_province = {}
    for c in cities:
        by_province.setdefault(c["province"], []).append(c)
    body = ['<p class="crumb"><a href="%s/">栖旅</a> / 城市指南</p>' % SITE]
    body.append("<h1>%d 座城市的旅居指南</h1>" % len(cities))
    body.append("<p>%s</p>" % esc(desc))
    for prov, group in by_province.items():
        body.append("<h2>%s</h2>" % esc(prov))
        body.append('<div class="links">' + "".join(
            '<a href="%s/">%s</a>' % (esc(c["id"]), esc(c["name"])) for c in group) + "</div>")
    ld = json.dumps({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": title,
        "description": desc,
        "inLanguage": "zh-CN",
        "url": canonical,
        "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": SITE + "/"},
    }, ensure_ascii=False, indent=1)
    return page_shell(title, desc, canonical, SITE + "/assets/img/hero-dali-sunrise.jpg",
                      "\n".join(body), ld, "../")


def sitemap(cities):
    urls = [(SITE + "/", "daily", "1.0"), (SITE + "/cities/", "weekly", "0.9")]
    urls += [("%s/cities/%s/" % (SITE, c["id"]), "monthly", "0.8") for c in cities]
    items = "".join(
        "  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq>"
        "<priority>%s</priority></url>\n" % (html.escape(u), TODAY, f, p)
        for u, f, p in urls)
    return ('<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + items + "</urlset>\n")


def robots():
    return "User-agent: *\nAllow: /\n\nSitemap: %s/sitemap.xml\n" % SITE


# ---------------------------------------------------------------- 入口

def main():
    out_root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "preview", "site")
    content = official_by_city()
    cities = city_records()
    with_content = [c for c in cities if content.get(c["id"])]
    print("城市 %d 座，其中有官方内容 %d 座" % (len(cities), len(with_content)))

    def related_for(city, n=10):
        same = [c for c in cities if c["province"] == city["province"] and c["id"] != city["id"]]
        rest = [c for c in cities if c["id"] != city["id"] and c not in same]
        return (same + rest)[:n]

    city_dir = os.path.join(out_root, "cities")
    for c in with_content:
        d = os.path.join(city_dir, c["id"])
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
            f.write(city_page(c, content[c["id"]], related_for(c)))

    os.makedirs(city_dir, exist_ok=True)
    with open(os.path.join(city_dir, "index.html"), "w", encoding="utf-8") as f:
        f.write(index_page(with_content))
    with open(os.path.join(out_root, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap(with_content))
    with open(os.path.join(out_root, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots())

    print("已生成：%d 个城市页 + 城市总目录 + sitemap.xml + robots.txt" % len(with_content))
    print("输出目录：%s" % out_root)


if __name__ == "__main__":
    main()
