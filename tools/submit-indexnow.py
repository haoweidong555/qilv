#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
栖旅 · 主动把网址提交给搜索引擎（IndexNow 协议）

IndexNow 是必应（Bing）等搜索引擎的官方收录协议：只要网站上放着一个验证文件，
就可以直接告诉它「这些页面更新了，来看看」，不需要注册任何账号。

用法：
    python3 tools/submit-indexnow.py            # 提交全部城市页
    python3 tools/submit-indexnow.py --dry-run  # 只看会提交哪些，不发请求

注意：验证文件（<key>.txt）必须已经在线上，所以顺序是「先发布网站，再跑本脚本」。
"""

import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "build_city_pages", os.path.join(HERE, "build-city-pages.py"))
bcp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bcp)

ENDPOINT = "https://api.indexnow.org/indexnow"


def urls():
    out = [bcp.SITE + "/", bcp.SITE + "/cities/"]
    out += ["%s/cities/%s/" % (bcp.SITE, c["id"]) for c in bcp.city_records()]
    return out


def main():
    list_of_urls = urls()
    key = bcp.INDEXNOW_KEY
    key_location = "%s/%s.txt" % (bcp.SITE, key)
    host = bcp.SITE.split("//", 1)[1].split("/", 1)[0]

    print("准备提交 %d 个网址（host=%s）" % (len(list_of_urls), host))
    print("验证文件：%s" % key_location)
    if "--dry-run" in sys.argv:
        for u in list_of_urls[:5]:
            print("  " + u)
        print("  …")
        return

    payload = json.dumps({
        "host": host,
        "key": key,
        "keyLocation": key_location,
        "urlList": list_of_urls,
    }).encode("utf-8")
    req = urllib.request.Request(ENDPOINT, data=payload, method="POST")
    req.add_header("Content-Type", "application/json; charset=utf-8")
    try:
        with urllib.request.urlopen(req, timeout=40) as resp:
            print("提交成功，HTTP %s（2xx 表示已受理，收录时间由搜索引擎决定）" % resp.status)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "ignore")[:200]
        tips = {
            400: "请求格式不对",
            403: "验证文件没找到或内容不匹配——先确认网站已经发布",
            422: "网址和 host 对不上，或者 key 不匹配",
            429: "提交太频繁，过一会儿再试",
        }
        print("提交失败，HTTP %s：%s\n%s" % (e.code, tips.get(e.code, ""), body))
        raise SystemExit(1)
    except Exception as e:
        raise SystemExit("网络问题，稍后再试：%r" % e)


if __name__ == "__main__":
    main()
