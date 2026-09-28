#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
栖旅 · 免版权实拍短片接入工具

从 Pexels / Pixabay 找免版权素材，下载后用 tools/video.swift 处理成
网页用的循环短片（可选加速、去黑边、生成封面），最后打印可直接粘进 data.js 的配置。

三种用法：

  # 1) 直接给一个视频文件地址（最省事，不需要 key）
  python3 tools/stock.py --url "https://.../xxx.mp4" --city dali \
      --label "实拍 · 洱海日出" --credit "Pexels · 摄影：某某" --speed 4 --duration 20

  # 2) 用 Pexels 官方 API 搜索（先在这里免费申请 key：https://www.pexels.com/api/）
  export PEXELS_API_KEY=你的key
  python3 tools/stock.py --query "lake sunrise mountains" --city dali --speed 4

  # 3) 用 Pixabay 官方 API 搜索（免费申请：https://pixabay.com/api/docs/）
  export PIXABAY_API_KEY=你的key
  python3 tools/stock.py --source pixabay --query "desert dunes" --city dunhuang

常用参数：
  --start 6        从源片第 6 秒开始取（配合 --preview 先看再定）
  --duration 20    取 20 秒
  --speed 4        加速 4 倍 → 输出 5 秒
  --width 1280     输出宽度
  --preview        额外生成一张分帧预览图，方便确认内容再正式处理
  --keep-src       保留下载的原始素材（默认处理完删掉）
"""

import argparse
import re
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VIDEO_TOOL = os.path.join(ROOT, 'tools', 'video.swift')
UA = 'QiyuStockFetcher/1.0 (local prototyping)'
USED_FILE = os.path.join(ROOT, 'assets', 'stock', 'used.json')
CREDITS_FILE = os.path.join(ROOT, 'assets', 'stock', 'credits.json')

# 每座城市的「探路搜索词」：先看这个库里到底有没有这座城市的真素材。
# 有就用，没有就老实回到绘制画面（地名类素材在 Pixabay 上非常稀少）。
CITY_PROBE = {
    'beijing': ['forbidden city beijing', 'great wall china', 'beijing china city'],
    'shanghai': ['shanghai china skyline', 'shanghai bund', 'shanghai city night'],
    'guangzhou': ['guangzhou china city', 'canton tower', 'china city skyline river'],
    'hongkong': ['hong kong skyline', 'hong kong harbour night', 'hong kong street'],
    'taipei': ['taipei taiwan city', 'taipei 101', 'taiwan city street night'],
    'chongqing': ['chongqing china city', 'chinese city river night bridge', 'neon city night asia'],
    'zhuhai': ['zhuhai china city', 'chinese coastal city night aerial', 'china city night aerial'],
    'guilin': ['guilin china', 'li river guilin', 'karst china river boat'],
    'sanya': ['sanya china beach', 'hainan china island sea', 'tropical beach palm island'],
    'qingdao': ['qingdao china', 'chinese coastal city sea', 'seaside city red roof china'],
    'xiamen': ['xiamen china', 'chinese coastal city palm', 'china island city sunset'],
    'wuhan': ['wuhan china city', 'china city bridge river aerial', 'chinese city skyline night'],
    'yichang': ['yangtze river gorge china', 'three gorges china', 'river gorge mountains china'],
    'dalian': ['dalian china', 'chinese coastal city cliff', 'china sea coast city'],
    'zhoushan': ['zhoushan china island', 'chinese fishing boats harbour', 'china island fishing village'],
    'kunming': ['kunming china', 'china flower market city', 'spring city flowers china'],
    'guiyang': ['guiyang china', 'china karst city aerial', 'mountain city mist china'],
    'yangshuo': ['guilin karst china', 'li river china boat', 'karst mountains river'],
    'suzhou': ['suzhou garden china', 'chinese garden pavilion pond', 'water town canal china'],
    'huangshan': ['huangshan china', 'yellow mountain china clouds', 'granite peaks sea of clouds'],
    'datong': ['yungang grottoes', 'chinese temple statue china', 'buddha statue temple asia'],
    'lhasa': ['potala palace', 'lhasa tibet', 'tibet monastery prayer'],
    'macau': ['macau', 'macao street night', 'chinese city street night rain'],
    'xian': ['xian china wall', 'chinese ancient gate tower', 'chinese city wall lantern'],
    'leshan': ['leshan buddha', 'giant buddha statue asia', 'buddha cliff river'],
    'lijiang': ['lijiang china', 'chinese ancient town night lantern', 'old town canal china'],
    'chengde': ['chengde china', 'chinese palace garden autumn', 'chinese temple pagoda mountain'],
    'kashgar': ['kashgar', 'silk road uyghur bazaar', 'central asia market street'],
    'jinan': ['jinan china', 'chinese park lake willow', 'spring water pond china'],
    'jilin': ['jilin rime ice', 'winter river fog trees', 'frost trees winter river'],
    'haixi': ['chaka salt lake', 'salt lake mirror sky', 'desert gobi aerial'],
    'hohhot': ['inner mongolia grassland', 'mongolia yurt steppe', 'horses grassland sunset'],
    'nanning': ['nanning china', 'tropical city palm street', 'green city river palms'],
    'shenyang': ['shenyang china', 'chinese palace snow winter', 'northern city snow street'],
    'wuyuan': ['wuyuan china', 'rapeseed field village china', 'yellow flower field terrace'],
    'taiyuan': ['taiyuan china', 'chinese temple pagoda sunset', 'chinese ancient architecture'],
    'chengdu': ['chengdu china', 'tea house china garden', 'panda bamboo china'],
    'harbin': ['harbin ice festival', 'ice sculpture winter city', 'snow city night winter'],
    'xining': ['qinghai lake', 'tibetan plateau grassland lake', 'tibet prayer flags monastery'],
    'yanan': ['yanan china', 'loess plateau china', 'terraced fields village china'],
}

# 每座城市的默认搜索词。Pexels / Pixabay 上中国城市的素材很少，
# 所以这里搜的是「气氛对得上」的镜头，不是地名。
# 「探路」里人工确认过、真的对得上这座城市的素材 id（按优先级排）。
# 只有真素材才写进来；探不出真素材的城市，宁可留着绘制画面。
CITY_PICK = {
    'yangshuo': ['206371', '207393', '206369'],   # 桂林/阳朔 喀斯特峰林与漓江
    'haixi': ['81627'],                            # 茶卡盐湖（青海）
    'macau': ['187670', '220313'],                 # 澳门 天际线夜景
    'hohhot': ['351028', '66810'],                 # 蒙古高原草原
    'harbin': ['7605', '167115'],                  # 雪夜城市
    'chengdu': ['136771', '137015'],               # 大熊猫
    'wuyuan': ['205403', '46313'],                 # 油菜花田
    'jilin': ['258684', '4380'],                   # 霜挂树林
    'shenyang': ['63970'],                         # 雪夜街道
    'lhasa': ['214949'],                           # 高原雪山航拍（标注 tibet）
    'shanghai': ['126802'],                        # 上海陆家嘴清晨（标签含 shanghai lujiazui）
    'chongqing': ['173201', '175401', '174305'],   # 重庆 轻轨／江与楼群航拍
    'hongkong': ['246842', '2860', '22207'],       # 香港 天际线航拍
    'taipei': ['216369', '86762'],                 # 台北 车流与高楼
    'zhuhai': ['129716'],                          # 珠海 湾岸夜景航拍
    'dalian': ['272854'],                          # 大连 海边（标签含 dalian）
    'kunming': ['152100'],                         # 昆明 滇池西山（标签含 kunming）
}

CITY_KEYWORDS = {
    'dali': 'lake sunrise mountains mist',
    'yangshuo': 'karst peaks li river bamboo raft',
    'sanya': 'tropical beach palm trees',
    'harbin': 'ice sculpture winter festival snow city',
    'dunhuang': 'desert dunes sunset caravan',
    'hangzhou': 'lake willow rain garden',
    'daocheng': 'snow mountain starry night',
    'weizhou': 'lighthouse ocean cliff sunset',
    'hulunbuir': 'grassland horses clouds',
    'wuyuan': 'rapeseed flower field terraced village',
    'chongqing': 'neon city night river bridge',
    'suzhou': 'chinese classical garden pond pavilion',
    'wanning': 'surfing waves beach',
    'qingdao': 'red roof coastal city sea',
    'anji': 'bamboo forest mist',
    'kashgar': 'central asia bazaar old town street',
    # —— 2026 扩展的城市（69 座全覆盖）——
    'beijing': 'beijing city skyline night',
    'tianjin': 'harbour city river bridge night',
    'shijiazhuang': 'china city street traffic',
    'chengde': 'chinese imperial palace garden mountain',
    'taiyuan': 'ancient chinese temple pagoda roof',
    'datong': 'ancient chinese temple buddha statue',
    'shenyang': 'snowy northern city street winter',
    'dalian': 'coastal city sea cliff road',
    'changchun': 'city green park lake summer',
    'jilin': 'rime ice fog winter river trees',
    'mudanjiang': 'snow forest winter village',
    'hohhot': 'mongolia grassland yurt horses',
    'shanghai': 'shanghai skyline river night',
    'nanjing': 'autumn tree lined avenue city',
    'zhoushan': 'fishing boats harbour island sea',
    'hefei': 'modern city lake park',
    'huangshan': 'sea of clouds granite peaks pine',
    'fuzhou': 'banyan tree city river',
    'xiamen': 'coastal city palm beach sunset',
    'nanchang': 'river bridge city night',
    'jingdezhen': 'pottery ceramics workshop hands',
    'jinan': 'chinese park lake willow spring',
    'taipei': 'asian city street night rain',
    'hualien': 'cliff pacific ocean coast waves',
    'zhengzhou': 'city highway interchange aerial',
    'luoyang': 'peony flowers ancient temple',
    'wuhan': 'river city bridge night skyline',
    'yichang': 'river gorge mountain china boat',
    'changsha': 'street food night market asia',
    'zhangjiajie': 'karst pillars mist mountains',
    'guangzhou': 'city skyline river night',
    'zhuhai': 'coastal promenade sunset palm',
    'haikou': 'tropical city palms street',
    'nanning': 'tropical city avenue palm trees river',
    'guilin': 'karst mountains river mist',
    'hongkong': 'hong kong harbour skyline night',
    'macau': 'macau colonial architecture street night',
    'chengdu': 'tea house bamboo garden china',
    'leshan': 'giant buddha statue cliff river',
    'guiyang': 'karst hills city mist',
    'anshun': 'waterfall jungle green china',
    'kunming': 'flower market spring city',
    'lijiang': 'ancient chinese town canal lantern night',
    'lhasa': 'potala palace tibet prayer flags',
    'nyingchi': 'peach blossom valley snow mountain',
    'xian': 'ancient chinese city wall gate tower',
    'yanan': 'loess plateau terraced fields village',
    'lanzhou': 'yellow river canyon city bridge',
    'xining': 'tibetan plateau lake grassland monastery',
    'haixi': 'salt lake reflection desert aerial',
    'yinchuan': 'wetland lake desert sunset',
    'zhongwei': 'desert dunes river caravan',
    'urumqi': 'snow mountain desert city china',
}


def die(msg):
    sys.stderr.write('错误：%s\n' % msg)
    sys.exit(1)


def http_get(url, headers=None, binary=False, timeout=60):
    req = urllib.request.Request(url, headers=dict({'User-Agent': UA}, **(headers or {})))
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read() if binary else resp.read().decode('utf-8', 'replace')


def http_download(url, dst, headers=None):
    data = http_get(url, headers=headers, binary=True, timeout=600)
    with open(dst, 'wb') as f:
        f.write(data)
    return len(data)


# ---------------- 搜索 ----------------

def search_pexels(query, key, per_page=15):
    url = 'https://api.pexels.com/videos/search?' + urllib.parse.urlencode({
        'query': query, 'per_page': per_page, 'orientation': 'landscape'
    })
    raw = http_get(url, headers={'Authorization': key})
    payload = json.loads(raw)
    out = []
    for v in payload.get('videos', []):
        user = v.get('user') or {}
        for f in v.get('video_files', []):
            if f.get('file_type') != 'video/mp4' or not f.get('link'):
                continue
            out.append({
                'id': v.get('id'),
                'duration': float(v.get('duration') or 0),
                'page': v.get('url'),
                'author': user.get('name'),
                'author_url': user.get('url'),
                'width': f.get('width') or 0,
                'height': f.get('height') or 0,
                'quality': f.get('quality'),
                'link': f.get('link'),
                'provider': 'Pexels',
            })
    return out


def search_pixabay(query, key, per_page=20):
    url = 'https://pixabay.com/api/videos/?' + urllib.parse.urlencode({
        'key': key, 'q': query, 'per_page': per_page,
        'video_type': 'film', 'safesearch': 'true'
    })
    payload = json.loads(http_get(url))
    out = []
    for v in payload.get('hits', []):
        for quality, f in (v.get('videos') or {}).items():
            if not f.get('url'):
                continue
            out.append({
                'id': v.get('id'),
                'duration': float(v.get('duration') or 0),
                'page': v.get('pageURL'),
                'tags': v.get('tags') or '',
                'author': v.get('user'),
                'author_url': 'https://pixabay.com/users/%s/' % v.get('user') if v.get('user') else None,
                'width': f.get('width') or 0,
                'height': f.get('height') or 0,
                'quality': quality,
                'link': f.get('url'),
                'provider': 'Pixabay',
            })
    return out


def pick_candidate(cands, prefer_width=960, min_seconds=6):
    """挑一条横屏、宽度接近 960（正好是输出尺寸，够用又省流量）、时长够用的素材"""
    usable = [c for c in cands if c['width'] >= 1280 and c['width'] >= c['height'] and c['duration'] >= min_seconds]
    if not usable:
        usable = [c for c in cands if c['width'] >= c['height']]
    if not usable:
        die('没有找到横屏素材，换个关键词试试')
    usable.sort(key=lambda c: (abs(c['width'] - prefer_width), -c['duration']))
    return usable[0]


def ordered_candidates(cands, prefer_width=960):
    """按「横屏 + 宽度接近输出尺寸 + 时长够」排序，供逐条试用"""
    usable = [c for c in cands if c['width'] >= 640 and c['width'] >= c['height']]
    if not usable:
        usable = [c for c in cands if c['width'] >= c['height']] or list(cands)
    return sorted(usable, key=lambda c: (abs(c['width'] - prefer_width),
                                         -min(c['duration'] or 0, 30)))


# 明显不像中国的标签：命中、且没有中国/亚洲标签时丢掉
BAD_TAGS = [
    'castle', 'fortress', 'medieval', 'cathedral', 'church', 'alps', 'switzerland',
    'italy', 'italian', 'spain', 'spanish', 'portugal', 'greece', 'greek', 'santorini',
    'germany', 'german', 'france', 'french', 'austria', 'norway', 'iceland', 'scotland',
    'europe', 'european', 'tuscany', 'venice', 'prague', 'amsterdam', 'eiffel',
    'hindu', 'mosque',
    'japan', 'japanese', 'korea', 'korean', 'thailand', 'thai', 'vietnam', 'viet nam',
    'myanmar', 'india', 'indian', 'nepal', 'bhutan', 'mexico', 'caribbean', 'hawaii',
    'bali', 'maldives', 'philippines', 'indonesia', 'malaysia', 'singapore', 'dubai',
    'turkey', 'morocco', 'egypt', 'peru', 'brazil', 'canada', 'florida', 'california',
    'casino', 'slot machine'
]

# 动物、特写之类，无论标签里有没有 china 都直接丢掉
# （踩过的坑：搜"苏州 水乡"命中「Chinese water dragon」——那是中国水龙，一种蜥蜴）
ANIMAL_TAGS = [
    'lizard', 'reptile', 'snake', 'insect', 'spider', 'dragon', 'aquarium', 'zoo',
    'panda', 'animal', 'wildlife', 'portrait', 'model', 'cooking', 'closeup', 'close-up'
]

# 明确指向中国（或亚洲）的标签
CHINA_TAGS = ['china', 'chinese', 'asia', 'asian']

# 只能算「好看的特写」，和城市没关系的内容（茶席、切菜、气泡、散景…）。
# 这些标签命中、且没有中国/亚洲标签时直接丢掉——踩过的坑：
# 「chinese temple mountain mist」返回过一整个茶席，「chinese garden canal boat」返回过切菜的手。
CLOSEUP_TAGS = [
    'tea', 'coffee', 'cup', 'teapot', 'food', 'cooking', 'kitchen', 'dish', 'meal',
    'bubble', 'soap', 'bokeh', 'abstract', 'texture', 'macro', 'water drop', 'rain drop',
    'book', 'reading', 'ink', 'calligraphy', 'candle', 'jewelry', 'sewing', 'knife',
    'hand', 'hands', 'blurred', 'defocused', 'light bulb', 'frosted glass',
]

# 每座城市的「标签硬门槛」：候选素材的标签里必须命中其中之一才会被采用。
# 搜到的画面≠城市，这个门槛是最后一道闸；命中不了就宁可用绘制画面，不硬凑。
CITY_REQUIRE = {
    'chengde': ['temple', 'palace', 'pagoda', 'garden', 'mountain', 'ancient'],
    'datong': ['buddha', 'temple', 'statue', 'cave', 'grotto', 'monk', 'stone'],
    'haixi': ['salt', 'lake', 'desert', 'gobi', 'drone', 'aerial', 'mirror'],
    'hohhot': ['grassland', 'yurt', 'horse', 'steppe', 'mongolia', 'cattle', 'sheep'],
    'huangshan': ['cloud', 'mist', 'mountain', 'peak', 'pine', 'fog'],
    'jilin': ['frost', 'rime', 'winter', 'snow', 'ice', 'fog', 'river'],
    'jinan': ['spring', 'lake', 'park', 'willow', 'pond', 'water'],
    'kashgar': ['bazaar', 'market', 'desert', 'camel', 'silk', 'old town', 'central asia'],
    'lanzhou': ['river', 'canyon', 'bridge', 'gorge', 'city'],
    'macau': ['macau', 'city', 'street', 'night', 'architecture', 'building', 'casino'],
    'nanning': ['tropical', 'palm', 'city', 'street', 'river', 'tree', 'green'],
    'shenyang': ['snow', 'winter', 'city', 'street', 'northern', 'palace', 'ice'],
    'suzhou': ['garden', 'pond', 'pavilion', 'canal', 'water', 'boat', 'willow'],
    'wuyuan': ['rapeseed', 'flower', 'field', 'village', 'terrace', 'yellow'],
    'yangshuo': ['karst', 'river', 'bamboo', 'raft', 'mountain', 'boat', 'guilin'],
    'taiyuan': ['temple', 'pagoda', 'roof', 'ancient', 'architecture', 'buddha'],
    'xian': ['wall', 'gate', 'tower', 'ancient', 'city', 'lantern', 'temple'],
    'leshan': ['buddha', 'statue', 'cliff', 'river', 'temple', 'mountain'],
    'lhasa': ['potala', 'palace', 'tibet', 'prayer', 'monastery', 'plateau'],
    'lijiang': ['canal', 'lantern', 'night', 'old town', 'ancient', 'town', 'chinese'],
    'chengdu': ['tea', 'bamboo', 'garden', 'panda', 'temple', 'park'],
    'harbin': ['ice', 'snow', 'sculpture', 'winter', 'cathedral', 'city', 'festival'],
    'xining': ['plateau', 'lake', 'grassland', 'tibet', 'monastery', 'mountain'],
    'yanan': ['loess', 'plateau', 'cave', 'terrace', 'village', 'field'],
}

# 更像中国的标签：优先排在前面
GOOD_TAGS = [
    'china', 'chinese', 'asia', 'asian', 'temple', 'pagoda', 'bamboo', 'terrace',
    'rice field', 'tea', 'karst', 'great wall', 'lantern', 'buddha', 'tibet'
]


def relevance_filter(cands):
    """先按标签剔除明显不对的内容，再把更像中国的排到前面"""
    kept = []
    for c in cands:
        tags = (c.get('tags') or '').lower()
        if any(b in tags for b in ANIMAL_TAGS):
            continue
        has_china = any(g in tags for g in CHINA_TAGS)
        if not has_china and (any(b in tags for b in BAD_TAGS)
                              or any(b in tags for b in CLOSEUP_TAGS)):
            continue
        c['_good'] = sum(1 for g in GOOD_TAGS if g in tags)
        kept.append(c)
    if not kept:
        return cands
    kept.sort(key=lambda c: -c.get('_good', 0))
    return kept


def require_filter(cands, require):
    """标签硬门槛：只留标签里命中白名单关键词的候选。命中不了返回空列表。"""
    kept = []
    for c in cands:
        tags = (c.get('tags') or '').lower()
        hit = [k for k in require if k in tags]
        if hit:
            c['_hit'] = hit
            kept.append(c)
    kept.sort(key=lambda c: -len(c.get('_hit', [])))
    return kept


# ---------------- 记账：已用素材 + 署名 ----------------

def load_json(path, default):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)


def load_city_names():
    """从 data.js 里读出 城市 id → 中文名，避免两处维护"""
    try:
        with open(os.path.join(ROOT, 'assets', 'js', 'data.js'), encoding='utf-8') as f:
            src = f.read()
    except OSError:
        return {}
    return dict(re.findall(r"id: '([a-z0-9]+)', name: '([^']+)'", src))


def unique_candidates(cands, used):
    """去掉这次批次里已经用过的素材，避免多座城市共用同一段画面"""
    fresh = [c for c in cands if str(c['id']) not in used]
    return fresh if fresh else cands


# ---------------- 处理 ----------------

def run_swift(args):
    cmd = ['swift', VIDEO_TOOL] + args
    print('  $ ' + ' '.join(cmd))
    sys.stdout.flush()
    proc = subprocess.run(cmd, cwd=ROOT)
    sys.stdout.flush()
    if proc.returncode != 0:
        die('处理失败，命令退出码 %d' % proc.returncode)


def motion_score(path):
    """调用 Swift 工具测素材的运动量（固定机位空镜分数很低）"""
    try:
        out = subprocess.run(['swift', VIDEO_TOOL, 'motion', path, '8'],
                             cwd=ROOT, capture_output=True, text=True)
    except OSError:
        return -1.0
    for line in (out.stdout or '').splitlines():
        m = re.search(r'运动量\s+([0-9.]+)', line)
        if m:
            return float(m.group(1))
    return -1.0


def main():
    ap = argparse.ArgumentParser(add_help=True, description='免版权实拍短片接入工具')
    ap.add_argument('--url', help='直接给视频文件地址（不需要 API key）')
    ap.add_argument('--query', help='搜索关键词，例如 "lake sunrise mountains"')
    ap.add_argument('--source', choices=['pexels', 'pixabay', 'auto'], default='auto',
                    help='用哪家的 API；auto 会按 key 的格式自动判断')
    ap.add_argument('--key', help='API key（也可用环境变量 PEXELS_API_KEY / PIXABAY_API_KEY）')
    ap.add_argument('--city', help='城市 id，例如 dali')
    ap.add_argument('--batch', help='批量处理，逗号分隔：dali,beijing,guilin')
    ap.add_argument('--list-all', action='store_true',
                    help='把所有城市（按内置搜索词）搜一遍并列出候选，不下载')
    ap.add_argument('--queries', help='探路模式：用 | 分隔的多个搜索词，逐条搜、只打印候选标签，不下载')
    ap.add_argument('--probe', action='store_true',
                    help='探路模式：用内置的 CITY_PROBE 这组「真地名」搜索词巡检，只打印候选标签，不下载')
    ap.add_argument('--pick', nargs='?', const='auto',
                    help='指定素材 id（逗号分隔，按顺序优先）；加 --pick 不带值＝用内置的 CITY_PICK 清单')
    ap.add_argument('--label', help='卡片上显示的名字，例如 "实拍 · 洱海日出"')
    ap.add_argument('--credit', help='来源标注，例如 "Pexels · 摄影：某某"')
    ap.add_argument('--focus', default='50% 50%', help='卡片里的裁切构图，默认 50%% 50%%')
    ap.add_argument('--start', type=float, default=0.0, help='从源片第几秒开始，默认 0')
    ap.add_argument('--duration', type=float, default=12.0, help='取多少秒，默认 12')
    ap.add_argument('--speed', type=float, default=1.0, help='加速倍数，默认 1（不加速）')
    ap.add_argument('--width', type=int, default=1280, help='输出宽度，默认 1280')
    ap.add_argument('--preset', default='',
                    help='编码档位（例如 AVAssetExportPresetMediumQuality / LowQuality），默认按宽度自动选')
    ap.add_argument('--min-motion', type=float, default=2.0,
                    help='运动量下限，低于它就换下一条候选（默认 2.0；固定机位空镜约 0.7–1.1）')
    ap.add_argument('--tries', type=int, default=4, help='最多试几条候选，默认 4')
    ap.add_argument('--require',
                    help='标签白名单（逗号分隔）：候选标签必须命中其中之一才采用；默认用内置的 CITY_REQUIRE')
    ap.add_argument('--no-require', action='store_true',
                    help='关掉标签硬门槛，沿用旧的排序方式（关键词特别准的时候可以用）')
    ap.add_argument('--max-mb', type=float, default=0,
                    help='单片体积上限（MB）；默认按输出时长 ×0.45MB 估算')
    ap.add_argument('--preview', action='store_true', help='额外生成分帧预览图')
    ap.add_argument('--list-only', action='store_true', help='只搜索、列出候选，不下载')
    ap.add_argument('--keep-src', action='store_true', help='保留下载的原始素材')
    args = ap.parse_args()

    # key 格式：Pixabay 是「8 位数字-十六进制」，Pexels 是长串十六进制
    def resolve_key():
        if args.key:
            return args.key
        for name in ('PIXABAY_API_KEY', 'PEXELS_API_KEY'):
            if os.environ.get(name):
                return os.environ[name]
        # 也可以把 key 放在本地文件里（不进版本库、不用每次写环境变量）
        for name in ('pixabay-key.txt', 'pexels-key.txt'):
            path = os.path.join(ROOT, 'assets', 'stock', name)
            try:
                with open(path, encoding='utf-8') as f:
                    value = f.read().strip()
                if value:
                    return value
            except OSError:
                continue
        return None

    def resolve_source(key):
        if args.source != 'auto':
            return args.source
        if not key:
            return 'pixabay'
        return 'pixabay' if re.match(r'^\d{8}-', key) else 'pexels'

    def do_search(source, query, key, per_page):
        return (search_pixabay(query, key, per_page) if source == 'pixabay'
                else search_pexels(query, key, per_page))

    if args.list_all:
        key = resolve_key()
        if not key:
            die('缺少 API key。Pixabay 免费申请：https://pixabay.com/api/docs/')
        source = resolve_source(key)
        print('# 使用 %s 搜索（key 格式自动识别）' % source)
        for city, kw in CITY_KEYWORDS.items():
            try:
                cands = do_search(source, kw, key, 5)
            except Exception as exc:
                print('%-14s 搜索出错：%s' % (city, exc))
                continue
            if not cands:
                print('%-14s %-40s 没有结果' % (city, kw))
                continue
            c = pick_candidate(cands)
            slug = (c.get('page') or '').rstrip('/').split('/')[-1]
            print('%-14s %-40s %d×%d %4.1fs  %s' %
                  (city, kw, c['width'], c['height'], c['duration'], slug[:64]))
        return

    if not args.city and not args.batch:
        die('需要 --city 或 --batch（逗号分隔多个城市），或用 --list-all 批量巡检')

    cities = [c.strip() for c in args.batch.split(',') if c.strip()] if args.batch else [args.city]

    if args.queries or args.probe:
        key = resolve_key()
        if not key:
            die('缺少 API key。Pixabay 免费申请：https://pixabay.com/api/docs/')
        source = resolve_source(key)
        for city in cities:
            queries = ([x.strip() for x in args.queries.split('|') if x.strip()]
                       if args.queries else
                       CITY_PROBE.get(city, [CITY_KEYWORDS.get(city) or city]))
            print('— %s' % city)
            for q in queries:
                try:
                    cands = do_search(source, q, key, 12)
                except Exception as exc:
                    print('   「%s」搜索失败：%s' % (q, exc))
                    continue
                if not cands:
                    print('   「%s」无结果' % q)
                    continue
                ranked = ordered_candidates(cands)[:3]
                print('   「%s」%d 条结果 →' % (q, len(cands)))
                for c in ranked:
                    print('      id=%-9s %4dx%-4d %4.0fs  [%s]'
                          % (c['id'], c['width'], c['height'], c['duration'],
                             (c.get('tags') or '').replace(', ', ' ')[:88]))
        return

    if args.url and len(cities) > 1:
        die('--url 只能配单个 --city 使用')

    names = load_city_names()
    used = set(load_json(USED_FILE, []))
    credits = load_json(CREDITS_FILE, {})
    key = resolve_key()
    source = resolve_source(key)
    ok = 0

    for city in cities:
        try:
            if process_city(city, names, used, credits, args, key, source):
                ok += 1
        except SystemExit:
            print('%-14s 跳过（处理失败）' % city)
        except Exception as exc:
            print('%-14s 失败：%s' % (city, exc))
        save_json(USED_FILE, sorted(used))
        save_json(CREDITS_FILE, credits)

    print('\n完成 %d / %d 座' % (ok, len(cities)))
    print('署名台账：%s' % os.path.relpath(CREDITS_FILE, ROOT))


def process_city(city, names, used, credits, args, key, source):
    """处理一座城市：搜索 → 下载 → 加速/去黑边 → 封面 → 记进署名台账"""
    label_city = names.get(city, city)
    out = os.path.join(ROOT, 'assets', 'video', '%s.mp4' % city)
    poster = os.path.join(ROOT, 'assets', 'video', '%s-poster.jpg' % city)
    query = args.query

    if args.url:
        candidate = {'link': args.url, 'provider': '自定义', 'author': None, 'page': None,
                     'duration': 0, 'id': 'url', 'width': 0, 'height': 0, 'quality': ''}
    else:
        if not query or query == 'auto':
            query = CITY_KEYWORDS.get(city)
        if not query:
            print('%-14s 没有预设搜索词，跳过' % city)
            return False
        if not key:
            die('缺少 API key。Pixabay 免费申请：https://pixabay.com/api/docs/')
        # 先搜「关键词 + china」，再搜关键词本身：这个库里的中国素材很少，
        # 加上 china 往往能直接命中真到过中国的那批素材
        queries = [query] if 'china' in query else [query + ' china', query]
        if args.pick == 'auto':
            # 点名的素材是探路时用「真地名」搜到的，这里把那几个词一起搜一遍
            queries += [q for q in CITY_PROBE.get(city, []) if q not in queries]
        cands = []
        for q in queries:
            try:
                cands += (search_pixabay(q, key, 30) if source == 'pixabay'
                          else search_pexels(q, key, 30))
            except Exception as exc:
                print('%-14s 搜索「%s」失败：%s' % (city, q, exc))
        # 两次搜索会有重复，按 id 去重
        seen_ids = set()
        deduped = []
        for c in cands:
            marker = '%s:%s' % (c.get('provider'), c.get('id'))
            if marker in seen_ids:
                continue
            seen_ids.add(marker)
            deduped.append(c)
        # Pixabay 会把同一条素材的多个清晰度都返回，这里合并成一个 id 一条，
        # 选「够用又最小」的那档（否则候选列表会被同一条片子占满，--tries 也试不出新东西）
        by_id = {}
        for c in deduped:
            marker = '%s:%s' % (c.get('provider'), c.get('id'))
            prev = by_id.get(marker)
            if prev is None:
                by_id[marker] = c
                continue
            better = (c['width'] >= args.width, -c['width'])
            current = (prev['width'] >= args.width, -prev['width'])
            if better > current:
                by_id[marker] = c
        cands = list(by_id.values())
        # 指定 id 优先：探路时人工看过的素材，直接点名用
        if args.pick:
            ids = ([x.strip() for x in CITY_PICK.get(city, [])] if args.pick == 'auto'
                   else [x.strip() for x in args.pick.split(',') if x.strip()])
            by_marker = dict(('%s' % c['id'], c) for c in cands)
            picked = [by_marker[i] for i in ids if i in by_marker]
            if picked:
                print('%-14s 按清单指定 id：%s'
                      % (city, ','.join(str(c['id']) for c in picked)))
                cands = picked
            else:
                print('%-14s 清单里的 id 这次没搜到，回退到自动挑' % city)
        if not cands:
            print('%-14s 搜不到素材（关键词：%s）' % (city, query))
            return False
        pool = unique_candidates(cands, used)
        require = ([k.strip() for k in args.require.split(',') if k.strip()]
                   if args.require else CITY_REQUIRE.get(city, []))
        if require and not args.no_require:
            matched = require_filter(pool, require)
            if not matched:
                print('%-14s 「%s」没有候选命中标签门槛（要求 %s）→ 这一座保留绘制画面'
                      % (city, query, '/'.join(require)))
                return False
            ordered = ordered_candidates(matched)
            print('%-14s %-28s → %d 条候选，标签命中 %s'
                  % (city, query, len(ordered), '+'.join(ordered[0].get('_hit', []))))
        else:
            ordered = ordered_candidates(relevance_filter(pool))
            print('%-14s %-36s → %d 条候选' % (city, query, len(ordered)))
        candidate = ordered[0]
        if args.list_only:
            return True

    tmp_dir = tempfile.mkdtemp(prefix='qiyu-stock-')
    src = os.path.join(tmp_dir, '%s-src.mp4' % city)
    motion = -1.0

    if args.url:
        size = http_download(candidate['link'], src)
        print('%-14s 下载 %.1f MB' % (city, size / 1048576.0))
    else:
        # 依次试候选：下载（小尺寸 ≈ 输出尺寸，只下一次）→ 测运动量 → 够动就用
        # 加速倍数越高，慢速空镜在成片里越"动"，所以阈值按倍数放宽
        eff_min = args.min_motion / max(1.0, args.speed / 2.0)
        best_score = -1.0
        best_file = os.path.join(tmp_dir, '%s-best.mp4' % city)
        for cand in ordered[:max(1, args.tries)]:
            trial = os.path.join(tmp_dir, '%s-try.mp4' % city)
            try:
                http_download(cand['link'], trial)
            except Exception as exc:
                print('%-14s 候选 id-%s 下载失败：%s' % (city, cand['id'], exc))
                continue
            score = motion_score(trial)
            print('%-14s 候选 id-%s %4.1fMB 运动量 %.1f  [%s]' %
                  (city, cand['id'], os.path.getsize(trial) / 1048576.0, score,
                   (cand.get('tags') or '').replace(', ', ' ')[:72]))
            if score > best_score:
                best_score, best_score_cand = score, cand
                os.replace(trial, best_file)
            else:
                os.remove(trial)
            if score >= eff_min:
                break
        if best_score < 0:
            print('%-14s 所有候选都下载失败' % city)
            return False
        candidate, motion, src = best_score_cand, best_score, best_file
        if motion < eff_min:
            print('%-14s 提示：候选里最高的运动量只有 %.1f，画面会偏静' % (city, motion))

    duration = args.duration
    if candidate.get('duration'):
        duration = min(duration, max(1.0, candidate['duration'] - args.start - 0.4))

    if args.keep_src:
        keep_dir = os.path.join(ROOT, 'assets', 'stock')
        os.makedirs(keep_dir, exist_ok=True)
        keep_path = os.path.join(keep_dir, '%s-src.mp4' % city)
        os.replace(src, keep_path)
        src = keep_path

    if args.preview:
        sheet = os.path.join(ROOT, 'assets', 'stock', 'sheets', '%s.png' % city)
        os.makedirs(os.path.dirname(sheet), exist_ok=True)
        run_swift(['clip', src, os.path.join(tmp_dir, 'preview.mp4'),
                   '%.2f' % args.start, '%.2f' % duration, '--width', str(args.width)])
        run_swift(['contact', os.path.join(tmp_dir, 'preview.mp4'), sheet, '6'])
        print('%-14s 分帧图：%s' % (city, os.path.relpath(sheet, ROOT)))

    run_swift(['clip', src, out, '%.2f' % args.start, '%.2f' % duration, poster,
               '--speed', '%g' % args.speed, '--width', str(args.width)]
              + (['--preset', args.preset] if args.preset else [])
              + (['--max-mb', '%g' % args.max_mb] if args.max_mb > 0 else []))

    if not args.keep_src:
        try:
            os.remove(src)
        except OSError:
            pass

    if candidate.get('id') not in (None, 'url'):
        used.add(str(candidate['id']))
    provider = candidate.get('provider') or '素材站'
    author = candidate.get('author')
    credit = args.credit or (('%s · 摄影：%s' % (provider, author)) if author else provider)
    credits[city] = {
        'label': args.label or '实拍氛围短片',
        'credit': credit,
        'focus': args.focus,
        'page': candidate.get('page'),
        'source_id': candidate.get('id'),
        'keyword': query or '',
        'city_name': label_city,
        'motion': round(motion, 1) if motion >= 0 else None
    }
    return True


if __name__ == '__main__':
    main()
