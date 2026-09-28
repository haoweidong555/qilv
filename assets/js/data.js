/* ============================================================
   栖旅 · 数据层
   ------------------------------------------------------------
   说明：城市名称、省份、标签、气候与季节判断依据公开常识整理；
   “旅居指数 / 月均成本 / 网速”等数值为**示例口径**，用于验证交互与视觉，
   正式上线前需要逐城校准，并在页面上标注来源与更新时间。
   ============================================================ */
(function (global) {
  'use strict';

  const CATEGORIES = [
    { id: 'all', name: '全部' },
    { id: 'coast', name: '海岸' },
    { id: 'lake', name: '湖泊' },
    { id: 'snow', name: '雪山' },
    { id: 'grass', name: '草原' },
    { id: 'old', name: '古城' },
    { id: 'wild', name: '山野' },
    { id: 'city', name: '城市' }
  ];

  const TOPICS = [
    { id: 'all', name: '全部' },
    { id: 'buddy', name: '找搭子' },
    { id: 'meet', name: '同城活动' },
    { id: 'rent', name: '租房' },
    { id: 'guide', name: '攻略' },
    { id: 'pit', name: '避坑' },
    { id: 'work', name: '远程办公' },
    { id: 'daily', name: '日常' }
  ];

  const USERS = {
    youyou: { id: 'youyou', name: '阿柚', color: '#c8452e', home: '大理' },
    linxiaoman: { id: 'linxiaoman', name: '林小满', color: '#2f6f5e', home: '杭州' },
    daxiong: { id: 'daxiong', name: '大熊', color: '#3a5d92', home: '重庆' },
    kiwi: { id: 'kiwi', name: 'Kiwi', color: '#8a5aa8', home: '万宁' },
    laozhou: { id: 'laozhou', name: '老周', color: '#a4652c', home: '青岛' },
    mia: { id: 'mia', name: 'Mia', color: '#b5445f', home: '三亚' },
    shanque: { id: 'shanque', name: '山雀', color: '#4a7a3a', home: '稻城' },
    xiaoye: { id: 'xiaoye', name: '小野', color: '#2f7f8f', home: '阳朔' },
    ahe: { id: 'ahe', name: '阿禾', color: '#9c6b2f', home: '婺源' },
    hal: { id: 'hal', name: 'Hal', color: '#4b4b8f', home: '哈尔滨' },
    buding: { id: 'buding', name: '布丁', color: '#c1652f', home: '敦煌' },
    qingjian: { id: 'qingjian', name: '青见', color: '#3f7a6a', home: '苏州' },
    namu: { id: 'namu', name: '纳木', color: '#5a6fa8', home: '呼伦贝尔' },
    guzi: { id: 'guzi', name: '谷子', color: '#8f7a2f', home: '喀什' },
    tangyuan: { id: 'tangyuan', name: '汤圆', color: '#a8496b', home: '安吉' },
    laoyu: { id: 'laoyu', name: '老鱼', color: '#37718f', home: '涠洲岛' }
  };

  /* ============================================================
     新增城市：气候带模板 + 画面预设 + 生成器
     ------------------------------------------------------------
     新增城市只写一段「种子」（省市、气候带、几个数字和几句话），
     12 个月气温、舒适度、画面配置由下面这些模板自动展开。
     气温是按气候带给的初稿，不是实测值，上线前需要逐城校准。
     ============================================================ */

  const CLIMATES = {
    northeast: [-18, -13, -3, 7, 16, 22, 25, 23, 16, 7, -5, -15],
    northCold: [-12, -7, 1, 10, 17, 22, 25, 23, 16, 7, -1, -10],
    north: [0, 3, 10, 17, 23, 27, 29, 28, 23, 16, 8, 1],
    northwest: [-7, -2, 6, 14, 20, 25, 27, 25, 19, 10, 1, -6],
    coastNorth: [0, 2, 7, 12, 18, 22, 25, 25, 21, 15, 8, 2],
    central: [4, 6, 11, 17, 22, 26, 30, 29, 25, 19, 12, 6],
    eastCoast: [6, 8, 12, 17, 22, 26, 30, 30, 26, 21, 15, 9],
    south: [14, 16, 20, 24, 27, 29, 31, 31, 29, 25, 20, 15],
    tropical: [21, 22, 25, 28, 30, 31, 31, 30, 29, 27, 24, 21],
    southwest: [9, 11, 15, 19, 21, 22, 22, 22, 20, 17, 12, 9],
    plateau: [-1, 2, 6, 10, 14, 17, 18, 17, 14, 9, 4, -1],
    highland: [-4, 0, 4, 8, 12, 15, 16, 15, 12, 8, 2, -3]
  };

  /** 由气温推体感舒适度（0–100）：偏离 21℃ 越远越不舒服，极端冷热再额外扣分 */
  function comfortOf(t) {
    let c = 94 - Math.abs(t - 21) * 2.4;
    if (t > 32) c -= 10;
    if (t > 36) c -= 8;
    if (t < -5) c -= 6;
    return Math.max(32, Math.min(94, Math.round(c)));
  }

  /* 每类目的默认画面（没有实拍素材时的兜底） */
  const SCENE_PRESETS = {
    coast: {
      palette: 'brightDay', horizon: 0.62, vignette: 0.2,
      sun: { x: 0.74, y: 0.2, r: 16, glow: 8 },
      clouds: { count: 6, band: [0.05, 0.36], scale: 1.25, opacity: 0.85, speedScale: 1.2 },
      water: 'sea',
      waterOpts: { rings: 30, rough: 1.1, sparkle: true, sunColumn: true, sunColumnX: 0.74 },
      waves: { count: 8 },
      boats: { count: 2, kind: 'sail', y: 0.71, scale: 1, x: 0.46, speed: 0.4 },
      birds: { count: 6, y: 0.3, dir: -1, color: '#ffffff' },
      foreground: { kind: 'palms', count: 3 }
    },
    lake: {
      palette: 'dawnMist', horizon: 0.6, vignette: 0.22,
      clouds: { count: 5, band: [0.05, 0.3], scale: 1.2, opacity: 0.5 },
      terrain: 'ridges',
      terrainOpts: { layers: 4, base: 0.5, spread: 0.07, amp: 0.16, sharp: 1.3, haze: 0.8 },
      water: 'lake',
      waterOpts: { rings: 26, rough: 0.8, sparkle: true, sunColumn: false },
      boats: { count: 1, kind: 'raft', y: 0.76, scale: 0.95, x: 0.32, speed: 0.3 },
      fog: { bands: 4, from: 0.45, to: 0.76, opacity: 0.4, thickness: 1.1 },
      birds: { count: 4, y: 0.32, color: '#5f6b6a' }
    },
    mountain: {
      palette: 'goldenHour', horizon: 0.62, vignette: 0.24,
      sun: { x: 0.26, y: 0.32, r: 19, glow: 7 },
      clouds: { count: 4, band: [0.06, 0.32], scale: 1.15, opacity: 0.5 },
      terrain: 'ridges',
      terrainOpts: { layers: 4, base: 0.48, spread: 0.09, amp: 0.22, sharp: 1.2, haze: 0.7, snowcap: true },
      fog: { bands: 3, from: 0.5, to: 0.8, opacity: 0.3, thickness: 1.2 }
    },
    grass: {
      palette: 'grassDay', horizon: 0.6, vignette: 0.18,
      sun: { x: 0.22, y: 0.18, r: 15, glow: 9 },
      clouds: { count: 7, band: [0.03, 0.36], scale: 1.5, opacity: 0.9, speedScale: 1.3 },
      terrain: 'ridges',
      terrainOpts: { layers: 3, base: 0.55, spread: 0.05, amp: 0.09, sharp: 1.2, haze: 0.85 },
      landmark: { variant: 'yurt', x: 0.74, base: 0.72, scale: 1 },
      foreground: { kind: 'grass', blades: 230, sheep: 8, base: 0.63, height: 0.85 },
      birds: { count: 6, y: 0.28, color: '#4a4a4a' }
    },
    desert: {
      palette: 'desertSunset', horizon: 0.66, vignette: 0.24,
      sun: { x: 0.68, y: 0.4, r: 24, glow: 9 },
      clouds: { count: 4, band: [0.12, 0.34], scale: 1.5, opacity: 0.4, speedScale: 0.6 },
      terrain: 'dunes',
      terrainOpts: { layers: 4, base: 0.58, spread: 0.115, amp: 0.21, haze: 0.6 },
      camels: { count: 3, x: 0.2, y: 0.75, scale: 2 },
      fog: { bands: 3, from: 0.5, to: 0.82, opacity: 0.18, thickness: 1.4 },
      particles: { kind: 'sand', count: 45, speed: 0.8, size: 1 }
    },
    old: {
      palette: 'dusk', horizon: 0.62, vignette: 0.26,
      sun: { x: 0.26, y: 0.42, r: 20, glow: 8 },
      clouds: { count: 4, band: [0.1, 0.3], scale: 1.35, opacity: 0.45 },
      terrain: 'dunes',
      terrainOpts: { layers: 2, base: 0.56, spread: 0.05, amp: 0.07, haze: 0.7 },
      landmark: { variant: 'huizhou', x: 0.44, base: 0.72, scale: 1.1, count: 3, lights: true },
      fog: { bands: 3, from: 0.55, to: 0.82, opacity: 0.24, thickness: 1.3 }
    },
    wild: {
      palette: 'bambooMist', horizon: 0.6, vignette: 0.22,
      clouds: { count: 5, band: [0.05, 0.3], scale: 1.2, opacity: 0.5 },
      terrain: 'ridges',
      terrainOpts: { layers: 4, base: 0.5, spread: 0.08, amp: 0.18, sharp: 1.2, haze: 0.8 },
      fog: { bands: 4, from: 0.42, to: 0.8, opacity: 0.42, thickness: 1.15 },
      foreground: { kind: 'bamboo', base: 0.55 },
      particles: { kind: 'fireflies', count: 18, size: 1 }
    },
    snow: {
      palette: 'clearNight', horizon: 0.62, vignette: 0.32,
      stars: { density: 1, milkyway: true },
      sun: { x: 0.78, y: 0.18, r: 12, glow: 6, crescent: true },
      terrain: 'ridges',
      terrainOpts: { layers: 4, base: 0.42, spread: 0.1, amp: 0.26, sharp: 1.05, haze: 0.6, snowcap: true },
      particles: { kind: 'snow', count: 40, speed: 0.5, size: 0.8 }
    },
    city: {
      palette: 'cityNight', horizon: 0.68, vignette: 0.3,
      stars: { density: 0.35 },
      sun: { x: 0.78, y: 0.15, r: 11, glow: 6, crescent: true },
      terrain: 'ridges',
      terrainOpts: { layers: 2, base: 0.46, spread: 0.06, amp: 0.14, sharp: 1.3, haze: 0.5 },
      landmark: { variant: 'city', base: 0.68, scale: 1.1, lights: true, hills: [[0, 1], [0.05, 0.92], [0.11, 0.8]] },
      fog: { bands: 3, from: 0.5, to: 0.72, opacity: 0.22, thickness: 1.2 },
      water: 'river',
      waterOpts: { rings: 24, rough: 1, sparkle: true, sunColumn: false },
      boats: { count: 1, kind: 'sail', y: 0.87, scale: 1.3, x: 0.3, speed: 0.2 }
    }
  };

  /** 把城市种子展开成完整城市对象 */
  function buildCity(seed, i) {
    const base = CLIMATES[seed.climate] || CLIMATES.central;
    const dt = seed.dt || 0;
    const temp = base.map(function (t) { return Math.round(t + dt); });
    const comfort = temp.map(comfortOf);
    const best = seed.best || [];
    const scene = JSON.parse(JSON.stringify(SCENE_PRESETS[seed.cat] || SCENE_PRESETS.city));
    if (seed.palette) scene.palette = seed.palette;
    if (seed.terrain) scene.terrain = seed.terrain;
    if (seed.scene) {
      Object.keys(seed.scene).forEach(function (k) { scene[k] = seed.scene[k]; });
    }
    const picks = best.map(function (m) { return comfort[m]; });
    const avg = picks.length ? picks.reduce(function (a, b) { return a + b; }, 0) / picks.length : 70;
    const costScore = Math.max(38, Math.min(100, Math.round(100 - (seed.cost - 2500) / 70)));
    const netScore = Math.min(100, Math.round(seed.net / 3.2));
    const index = Math.max(62, Math.min(96, Math.round(avg * 0.6 + netScore * 0.2 + costScore * 0.2)));
    const authorIds = Object.keys(USERS);
    return {
      id: seed.id, name: seed.name, region: seed.region, cat: seed.cat,
      tagline: seed.tagline, intro: seed.intro, size: 'medium', tags: seed.tags,
      stats: { index: index, cost: seed.cost, net: seed.net, best: best,
               altitude: seed.altitude, crowd: seed.crowd },
      months: {
        temp: temp,
        comfort: comfort,
        costIndex: temp.map(function (t, m) { return best.indexOf(m) >= 0 ? 1.15 : 1; })
      },
      facts: [
        ['气候', seed.climateNote],
        ['月租（一居）', seed.rent],
        ['网速实测', seed.netNote],
        ['交通', seed.transport],
        ['适合的人', seed.bestFor],
        ['要注意', seed.watch]
      ],
      author: authorIds[i % authorIds.length],
      likes: 130 + ((i * 37) % 250),
      comments: 9 + ((i * 13) % 38),
      scene: scene,
      generated: true
    };
  }

  /* ============================================================
     城市
     scene 字段是“画面配方”，交给 scenes.js 逐帧绘制
     ============================================================ */
  const CITIES = [
    {
      id: 'dali', name: '大理', region: '云南省 · 大理市', cat: 'lake',
      tagline: '苍山的雪影落在洱海上，风一吹就是一整个春天',
      intro: '大理是很多人第一次认真考虑“换个地方生活”的地方。才村、龙龛、双廊各有性格：想安静住才村，想有烟火气住古城南门附近。真正的日常是早上写代码、下午骑到海边看日落，晚上在院子里和人聊天。',
      size: 'wide',
      tags: ['高原湖泊', '咖啡馆密集', '骑行为日常', '院子文化'],
      stats: { index: 92, cost: 4200, net: 120, best: [2, 3, 9, 10], altitude: 1975, crowd: '中' },
      months: {
        temp: [16, 18, 21, 24, 26, 25, 24, 24, 24, 22, 19, 16],
        comfort: [78, 82, 88, 92, 88, 72, 66, 68, 82, 90, 90, 80],
        costIndex: [0.9, 0.9, 1.0, 1.0, 1.0, 1.1, 1.25, 1.25, 1.0, 1.0, 0.95, 0.95]
      },
      facts: [
        ['气候', '干湿分明，11–5 月是旱季，晴朗干燥；6–9 月雨季，午后阵雨'],
        ['月租（一居）', '古城周边 ¥1,800–3,200，海边院子整租 ¥4,000 起'],
        ['网速实测', '城区 100–200 Mbps，才村/双廊部分民宿偏弱，订房前先问'],
        ['远程办公', '咖啡馆密度高，古城与才村都有稳定的共享办公点'],
        ['交通', '大理站高铁通昆明约 2 小时；机场到古城约 40 分钟'],
        ['医疗', '州医院可应对常见问题，复杂情况通常转昆明'],
        ['最适合', '3–4 月（风大但晴天多）、10–11 月（雨季结束，能见度高）'],
        ['适合的人', '想长期慢下来、有远程工作、喜欢户外与社交的人'],
        ['要注意', '风季紫外线极强；旺季房租翻倍；部分区域网购配送慢']
      ],
      // 实拍短片：在卡片和详情页里替代程序化绘制。用 tools/video.swift 生成。
      video: {
        src: 'assets/video/dali.mp4',
        poster: 'assets/video/dali-poster.jpg',
        label: '实拍短片 · 洱海日出',
        credit: '视频素材：用户提供',
        // 卡片里是宽画幅裁切，这里让构图偏左，避开原片右下角自带的“洱海 · 日出”字幕
        focus: '18% 50%'
      },
      author: 'youyou', likes: 412, comments: 63,
      scene: {
        palette: 'goldenHour', horizon: 0.58, vignette: 0.24,
        sun: { x: 0.24, y: 0.31, r: 20, glow: 7 },
        clouds: { count: 5, band: [0.06, 0.34], scale: 1.1, opacity: 0.5 },
        terrain: 'ridges',
        terrainOpts: { layers: 4, base: 0.5, spread: 0.09, amp: 0.2, sharp: 1.25, haze: 0.72, snowcap: true },
        water: 'lake',
        waterOpts: { rings: 30, rough: 1, sparkle: true, sunColumn: true, sunColumnX: 0.24 },
        boats: { count: 2, kind: 'raft', y: 0.73, scale: 0.95, x: 0.28, speed: 0.35 },
        birds: { count: 7, y: 0.4, color: '#f6e3cd' }
      }
    },
    {
      id: 'yangshuo', name: '阳朔', region: '广西壮族自治区 · 阳朔县', cat: 'wild',
      tagline: '推开窗，漓江的雾正从峰林之间漫上来',
      intro: '阳朔是典型的“来了就多住一个月”。西街热闹但吵，真正舒服的是兴坪、遇龙河一带：早上江面起雾，竹筏慢慢划过，骑车十几分钟就能进山。',
      size: 'tall',
      tags: ['喀斯特峰林', '骑行', '攀岩', '竹筏'],
      stats: { index: 88, cost: 3800, net: 150, best: [3, 4, 9], altitude: 110, crowd: '高' },
      months: {
        temp: [12, 14, 18, 23, 27, 29, 31, 31, 29, 25, 19, 14],
        comfort: [70, 74, 82, 88, 80, 68, 60, 62, 78, 90, 86, 74],
        costIndex: [0.85, 0.85, 0.95, 1.05, 1.05, 1.0, 1.15, 1.15, 1.0, 1.0, 0.9, 0.85]
      },
      facts: [
        ['气候', '亚热带，4–6 月多雨多雾（也是最好看的时候），7–8 月湿热'],
        ['月租（一居）', '兴坪 ¥1,200–2,200，遇龙河边整院 ¥3,000 起'],
        ['网速实测', '县城 150 Mbps 以上，村里靠民宿宽带，波动较大'],
        ['远程办公', '县城咖啡馆可办公，村里建议备一张大流量卡'],
        ['交通', '阳朔站高铁通桂林 30 分钟、广州 3 小时'],
        ['医疗', '县医院为主，较重情况转桂林'],
        ['最适合', '4–5 月（烟雨峰林）、10 月（秋高气爽，江水最清）'],
        ['适合的人', '喜欢户外、骑行攀岩、不介意潮湿的人'],
        ['要注意', '7–8 月西街人流量极大；雨季江水浑浊，看雾要碰运气']
      ],
      author: 'xiaoye', likes: 356, comments: 48,
      scene: {
        palette: 'dawnMist', horizon: 0.6, vignette: 0.2,
        clouds: { count: 4, band: [0.05, 0.3], scale: 1.2, opacity: 0.45 },
        fog: { bands: 5, from: 0.42, to: 0.74, opacity: 0.5, thickness: 1.1 },
        terrain: 'karst',
        terrainOpts: { layers: 3, peaks: 6, base: 0.52, spread: 0.08, amp: 0.24, haze: 0.7 },
        water: 'lake',
        waterOpts: { rings: 26, rough: 0.8, sparkle: true, sunColumn: false },
        boats: { count: 2, kind: 'raft', y: 0.75, scale: 1, x: 0.22, speed: 0.3 },
        birds: { count: 5, y: 0.34, color: '#5f6b6a' }
      }
    },
    {
      id: 'sanya', name: '三亚', region: '海南省 · 三亚市', cat: 'coast',
      tagline: '北方在下雪的时候，这里的人还在海里',
      intro: '三亚是“过冬”最直接的选择。11 月到次年 3 月是最舒服的季节，白天 25–28 度，晚上不用空调。代价是旺季房租会翻倍，海景房的“海景”需要亲自确认。',
      size: 'medium',
      tags: ['过冬首选', '浮潜', '椰子', '旺季涨价'],
      stats: { index: 84, cost: 6500, net: 160, best: [10, 11, 2], altitude: 8, crowd: '高' },
      months: {
        temp: [24, 25, 27, 29, 31, 32, 32, 31, 30, 29, 27, 25],
        comfort: [88, 86, 82, 72, 62, 55, 58, 60, 68, 78, 86, 90],
        costIndex: [1.35, 1.3, 1.15, 1.0, 0.85, 0.8, 0.85, 0.85, 0.8, 0.85, 1.1, 1.35]
      },
      facts: [
        ['气候', '热带海洋性，11–3 月最佳；5–8 月高温高湿，注意防晒与台风'],
        ['月租（一居）', '市区 ¥2,500–4,500，亚龙湾/海棠湾旺季 ¥8,000 以上'],
        ['网速实测', '市区 150–300 Mbps，多数酒店公寓稳定'],
        ['远程办公', '咖啡馆多但偏休闲，长住建议租带书桌的公寓'],
        ['交通', '凤凰机场直飞全国；环岛高铁到海口约 1.5 小时'],
        ['医疗', '有 301 医院海南分院等，医疗条件在海南最好'],
        ['最适合', '11–12 月（刚入冬，价格还没到顶）、3 月（人少水暖）'],
        ['适合的人', '怕冷、想避寒过冬、能接受旅游城市节奏的人'],
        ['要注意', '春节前后价格翻倍；海鲜市场先问价再买']
      ],
      author: 'mia', likes: 298, comments: 71,
      scene: {
        palette: 'brightDay', horizon: 0.64, vignette: 0.18,
        sun: { x: 0.76, y: 0.19, r: 16, glow: 8 },
        clouds: { count: 6, band: [0.05, 0.36], scale: 1.25, opacity: 0.85, speedScale: 1.2 },
        water: 'sea',
        waterOpts: { rings: 30, rough: 1.15, sparkle: true, sunColumn: true, sunColumnX: 0.76 },
        waves: { count: 8 },
        boats: { count: 2, kind: 'sail', y: 0.71, scale: 1, x: 0.46, speed: 0.4 },
        birds: { count: 6, y: 0.3, dir: -1, color: '#ffffff' },
        foreground: { kind: 'palms', count: 3 }
      }
    },
    {
      id: 'harbin', name: '哈尔滨', region: '黑龙江省 · 哈尔滨市', cat: 'city',
      tagline: '零下二十度的夜里，窗户里是橘色的光',
      intro: '哈尔滨的冬天不是忍过去，是过出来。室外零下二十度、室内二十度，出门裹严实、进门脱外套。中央大街周边的老楼有味道，但一定要确认供暖方式和窗户密封。',
      size: 'tall',
      tags: ['冰雪季', '俄式建筑', '暖气生活', '咖啡与面包'],
      stats: { index: 82, cost: 3500, net: 180, best: [5, 6, 7, 0], altitude: 150, crowd: '中' },
      months: {
        temp: [-18, -13, -3, 7, 16, 22, 25, 23, 17, 7, -5, -15],
        comfort: [58, 62, 72, 84, 90, 88, 80, 82, 90, 82, 66, 56],
        costIndex: [1.3, 1.15, 1.0, 0.9, 0.9, 0.95, 0.95, 0.95, 0.9, 0.9, 0.95, 1.2]
      },
      facts: [
        ['气候', '冬季 12–2 月极寒（-20℃ 上下）；6–9 月凉爽，是国内夏天的避暑选项'],
        ['月租（一居）', '中央大街周边 ¥1,800–3,000，带地暖的新公寓约 ¥2,500'],
        ['网速实测', '城区 200–500 Mbps，是全国网速最好的城市之一'],
        ['远程办公', '咖啡馆多，冬天室内办公很舒服，适合 11–3 月闭关做事'],
        ['交通', '太平机场直飞全国；高铁到北京约 5 小时'],
        ['医疗', '哈医大一院等三甲资源强'],
        ['最适合', '6–8 月（凉爽避暑）、1 月（冰雪季，但最冷）'],
        ['适合的人', '想专心做事、喜欢冬天、能接受日照短的人'],
        ['要注意', '老楼一层很冷；冬季干燥，加湿器必备；日照短影响情绪']
      ],
      author: 'hal', likes: 264, comments: 52,
      scene: {
        palette: 'snowNight', horizon: 0.66, vignette: 0.3,
        stars: { density: 0.5 },
        sun: { x: 0.72, y: 0.2, r: 13, glow: 6, crescent: true },
        clouds: { count: 3, band: [0.1, 0.3], scale: 1.3, opacity: 0.32 },
        terrain: 'ridges',
        terrainOpts: { layers: 3, base: 0.6, spread: 0.05, amp: 0.1, sharp: 1.4, haze: 0.45, snowcap: true },
        landmark: { variant: 'dome', x: 0.34, base: 0.83, scale: 1.15, lights: true },
        foreground: { kind: 'snow', base: 0.82 },
        particles: { kind: 'snow', count: 110, speed: 1.1, size: 1.1 }
      }
    },
    {
      id: 'dunhuang', name: '敦煌', region: '甘肃省 · 敦煌市', cat: 'old',
      tagline: '九点半的日落，把沙丘染成蜜色',
      intro: '敦煌的作息会被自然调慢：夏天晚上九点半还亮着，白天热得只能待在室内，傍晚才是出门的时间。鸣沙山、月牙泉、莫高窟之外，这座城市本身的安静也很值钱。',
      size: 'wide',
      tags: ['沙漠', '日落晚', '丝路', '干燥'],
      stats: { index: 85, cost: 3200, net: 100, best: [4, 8, 9], altitude: 1139, crowd: '中' },
      months: {
        temp: [-8, -3, 6, 14, 20, 25, 27, 25, 19, 10, 0, -7],
        comfort: [50, 56, 70, 86, 90, 80, 72, 78, 90, 84, 62, 52],
        costIndex: [0.8, 0.8, 0.85, 0.95, 1.05, 1.1, 1.2, 1.2, 1.05, 0.95, 0.85, 0.8]
      },
      facts: [
        ['气候', '典型大陆性干旱气候，昼夜温差常超 15℃；5–9 月白天很晒'],
        ['月租（一居）', '市区 ¥1,200–2,200，旺季（7–8 月）上涨明显'],
        ['网速实测', '城区 100–200 Mbps，景区周边偏弱'],
        ['远程办公', '咖啡馆不多但安静，适合需要专注的人'],
        ['交通', '敦煌机场直飞西安/兰州等；敦煌站高铁通兰州约 6 小时'],
        ['医疗', '市医院为基础，复杂情况转兰州'],
        ['最适合', '5 月、9 月下旬–10 月（早晚舒适，日落时间友好）'],
        ['适合的人', '喜欢安静、历史与荒野感、能接受干燥的人'],
        ['要注意', '4 月沙尘；干到流鼻血是常事；景区门票旺季需预约']
      ],
      author: 'buding', likes: 231, comments: 37,
      scene: {
        palette: 'desertSunset', horizon: 0.66, vignette: 0.24,
        sun: { x: 0.68, y: 0.4, r: 24, glow: 9 },
        clouds: { count: 4, band: [0.12, 0.34], scale: 1.5, opacity: 0.4, speedScale: 0.6 },
        terrain: 'dunes',
        terrainOpts: { layers: 4, base: 0.58, spread: 0.115, amp: 0.21, haze: 0.6 },
        camels: { count: 4, x: 0.18, y: 0.75, scale: 2 },
        fog: { bands: 3, from: 0.5, to: 0.82, opacity: 0.18, thickness: 1.4 },
        particles: { kind: 'sand', count: 50, speed: 0.8, size: 1 }
      }
    },
    {
      id: 'hangzhou', name: '杭州', region: '浙江省 · 杭州市', cat: 'lake',
      tagline: '桂花落进雨里的那几天，全城都是甜的',
      intro: '杭州是旅居基础设施最完整的城市之一：高铁、机场、医院、咖啡馆、共享办公、外卖都在线。代价是房租和梅雨。真正让人留下来的往往是九溪、满觉陇、龙井这些不在榜单上的角落。',
      size: 'medium',
      tags: ['基础设施完善', '桂花季', '梅雨', '茶山'],
      stats: { index: 90, cost: 6200, net: 200, best: [3, 9, 10], altitude: 12, crowd: '高' },
      months: {
        temp: [5, 7, 11, 17, 22, 26, 30, 30, 26, 20, 13, 7],
        comfort: [62, 68, 82, 92, 86, 66, 52, 56, 84, 92, 84, 68],
        costIndex: [0.95, 0.95, 1.0, 1.05, 1.05, 1.0, 1.05, 1.05, 1.05, 1.1, 1.05, 0.95]
      },
      facts: [
        ['气候', '四季分明；6 月中–7 月中梅雨闷湿，7–8 月酷热，10–11 月最舒服'],
        ['月租（一居）', '老城/西湖区 ¥4,000–6,500，临安、余杭通勤区 ¥2,500 起'],
        ['网速实测', '城区 300 Mbps 以上普遍'],
        ['远程办公', '共享办公与咖啡馆密度极高，创业者与远程工作者聚集'],
        ['交通', '双机场 + 高铁枢纽，市内地铁覆盖好'],
        ['医疗', '浙一、浙二等全国前列三甲医院'],
        ['最适合', '4 月（春茶与花）、10 月中–11 月（桂花与秋色）'],
        ['适合的人', '需要强基础设施、想兼顾自然与城市便利的人'],
        ['要注意', '梅雨季要备除湿机；旺季景区周边人流极大；房租偏高']
      ],
      author: 'linxiaoman', likes: 386, comments: 84,
      scene: {
        palette: 'springRain', horizon: 0.6, vignette: 0.22,
        clouds: { count: 6, band: [0.04, 0.3], scale: 1.2, opacity: 0.6 },
        terrain: 'ridges',
        terrainOpts: { layers: 4, base: 0.52, spread: 0.07, amp: 0.16, sharp: 1.3, haze: 0.8 },
        water: 'lake',
        waterOpts: { rings: 26, rough: 0.7, sparkle: true, sunColumn: false },
        landmark: { variant: 'bridge', x: 0.42, base: 0.605, scale: 0.92 },
        boats: { count: 1, kind: 'sail', y: 0.8, scale: 0.8, x: 0.68, speed: 0.25 },
        foreground: { kind: 'willow' },
        particles: { kind: 'rain', count: 90, speed: 1, size: 1, color: '#eef4f3' }
      }
    },
    {
      id: 'daocheng', name: '稻城亚丁', region: '四川省 · 甘孜州', cat: 'snow',
      tagline: '银河从三座神山背后升起来',
      intro: '稻城不适合“说走就走”。海拔 3,700 米以上，第一天就上山很容易被高反击倒。正确做法是在香格里拉镇先住两晚适应，再慢慢往上。适应了之后，这里的星空值得专程一趟。',
      size: 'tall',
      tags: ['神山', '银河', '高反注意', '徒步'],
      stats: { index: 78, cost: 4000, net: 80, best: [8, 9], altitude: 3750, crowd: '低' },
      months: {
        temp: [-4, 0, 4, 8, 12, 15, 16, 15, 12, 8, 2, -3],
        comfort: [40, 46, 58, 72, 80, 74, 66, 68, 82, 74, 56, 42],
        costIndex: [0.8, 0.8, 0.85, 0.95, 1.0, 1.05, 1.2, 1.2, 1.15, 1.05, 0.9, 0.8]
      },
      facts: [
        ['气候', '高原气候，紫外线极强，昼夜温差大；7–8 月为雨季，10 月最通透'],
        ['月租（一居）', '香格里拉镇 ¥1,500–2,800，旺季（7–8 月、10 月）上涨'],
        ['网速实测', '镇上约 80–150 Mbps，景区内信号不稳定'],
        ['远程办公', '可选但偏折腾，网络与停电风险要考虑，适合短住'],
        ['交通', '稻城亚丁机场（世界最高民用机场之一）或从成都自驾/包车'],
        ['医疗', '镇上有基础医疗点，严重高反需下撤到低海拔'],
        ['最适合', '9 月下旬–10 月中旬（秋色 + 晴天多，星空条件最好）'],
        ['适合的人', '身体条件好、有高原经验、追求风景极致的人'],
        ['要注意', '高反、紫外线、昼夜温差；不要第一天就上长线徒步']
      ],
      author: 'shanque', likes: 402, comments: 58,
      scene: {
        palette: 'clearNight', horizon: 0.62, vignette: 0.32,
        stars: { density: 1, milkyway: true },
        sun: { x: 0.78, y: 0.18, r: 12, glow: 6, crescent: true },
        terrain: 'ridges',
        terrainOpts: { layers: 4, base: 0.42, spread: 0.1, amp: 0.26, sharp: 1.05, haze: 0.6, snowcap: true },
        prayerFlags: { y: 0.3, count: 4 },
        particles: { kind: 'snow', count: 40, speed: 0.5, size: 0.8 }
      }
    },
    {
      id: 'weizhou', name: '涠洲岛', region: '广西壮族自治区 · 北海市', cat: 'coast',
      tagline: '灯塔亮起来的时候，整座岛只剩海浪声',
      intro: '从北海坐船 70 分钟，就到了这座火山岛。岛上没有大商场，也没有深夜的外卖，但有一圈形状不同的海岸线。适合想彻底安静一个月的人。',
      size: 'short',
      tags: ['火山岛', '赶海', '日落', '物资靠船运'],
      stats: { index: 80, cost: 3400, net: 90, best: [2, 3, 9, 10], altitude: 79, crowd: '低' },
      months: {
        temp: [17, 18, 21, 25, 28, 30, 31, 31, 30, 27, 22, 18],
        comfort: [80, 82, 86, 88, 78, 66, 60, 62, 76, 88, 88, 82],
        costIndex: [0.9, 0.9, 0.95, 1.0, 1.0, 1.05, 1.2, 1.2, 1.0, 0.95, 0.9, 0.9]
      },
      facts: [
        ['气候', '亚热带海洋性，11–4 月温和；7–9 月台风季，船班可能停航'],
        ['月租（一居）', '岛上民宿月租 ¥1,800–3,000，旺季短租更贵'],
        ['网速实测', '约 60–150 Mbps，台风天气可能中断'],
        ['远程办公', '可行但需自备流量卡做备份，重要会议前看天气预报'],
        ['交通', '北海国际码头乘船 70 分钟；岛上靠电动车'],
        ['医疗', '岛上医疗有限，较重情况需回北海市区'],
        ['最适合', '3–4 月、10–11 月（温度舒适、少台风、海水清）'],
        ['适合的人', '想断联安静写作、喜欢海与慢生活的人'],
        ['要注意', '台风季船班停运；物资靠船运，物价偏高；医疗有限']
      ],
      author: 'laoyu', likes: 187, comments: 29,
      scene: {
        palette: 'dusk', horizon: 0.63, vignette: 0.24,
        sun: { x: 0.3, y: 0.44, r: 22, glow: 9 },
        stars: { density: 0.25 },
        clouds: { count: 4, band: [0.14, 0.34], scale: 1.3, opacity: 0.55 },
        water: 'sea',
        waterOpts: { rings: 28, rough: 1.1, sparkle: true, sunColumn: true, sunColumnX: 0.3 },
        waves: { count: 6 },
        landmark: { variant: 'lighthouse', x: 0.8, base: 0.635, scale: 1.1 },
        birds: { count: 5, y: 0.36, dir: -1, color: '#3a3346' }
      }
    },
    {
      id: 'hulunbuir', name: '呼伦贝尔', region: '内蒙古自治区 · 呼伦贝尔市', cat: 'grass',
      tagline: '晚上十点还有晚霞，手机相册自动变成壁纸库',
      intro: '草原的夏天很短，6 月到 8 月是最饱满的三个月。这里公共交通基本指望不上，一定要租车：租一辆车，往北随便开，云和草会一直跟着你。',
      size: 'wide',
      tags: ['草原', '自驾必需', '夏季限定', '长日照'],
      stats: { index: 83, cost: 3300, net: 110, best: [5, 6, 7], altitude: 610, crowd: '低' },
      months: {
        temp: [-25, -20, -10, 3, 13, 20, 23, 21, 13, 2, -13, -23],
        comfort: [48, 52, 62, 76, 86, 90, 92, 90, 84, 70, 54, 46],
        costIndex: [0.75, 0.75, 0.8, 0.9, 0.95, 1.15, 1.3, 1.25, 0.95, 0.85, 0.8, 0.75]
      },
      facts: [
        ['气候', '冬季极寒（-25℃ 以下），夏季 6–8 月凉爽，昼夜温差大'],
        ['月租（一居）', '海拉尔市区 ¥1,200–2,200；牧区民宿按周计费'],
        ['网速实测', '城区 100–200 Mbps，牧区靠 4G/5G，信号随地形波动'],
        ['远程办公', '市区可行，牧区更适合当作休假而非长期办公'],
        ['交通', '海拉尔机场通多地；强烈建议自驾或包车'],
        ['医疗', '市区医院可应对常见病，牧区距离远'],
        ['最适合', '6 月下旬–8 月中旬（草最绿、日照最长）'],
        ['适合的人', '喜欢辽阔风景、自驾、能接受偏远的人'],
        ['要注意', '7 月旺季房价涨；蚊虫多；加油站间距大，先加满油']
      ],
      author: 'namu', likes: 312, comments: 44,
      scene: {
        palette: 'grassDay', horizon: 0.6, vignette: 0.18,
        sun: { x: 0.2, y: 0.18, r: 15, glow: 9 },
        clouds: { count: 7, band: [0.03, 0.36], scale: 1.5, opacity: 0.9, speedScale: 1.3 },
        terrain: 'ridges',
        terrainOpts: { layers: 3, base: 0.55, spread: 0.05, amp: 0.09, sharp: 1.2, haze: 0.85 },
        landmark: { variant: 'yurt', x: 0.74, base: 0.72, scale: 1 },
        foreground: { kind: 'grass', blades: 230, sheep: 9, base: 0.63, height: 0.85 },
        birds: { count: 6, y: 0.28, color: '#4a4a4a' }
      }
    },
    {
      id: 'wuyuan', name: '婺源', region: '江西省 · 婺源县', cat: 'old',
      tagline: '油菜花开的时候，白墙黑瓦从花海里浮出来',
      intro: '婺源的美是季节性的：3 月下旬油菜花，11 月晒秋和红枫。淡季的村子安静得能听见水声，也便宜得多。适合把工作带着，住进一个村子慢慢过。',
      size: 'medium',
      tags: ['油菜花', '徽派村落', '晒秋', '季节性强'],
      stats: { index: 81, cost: 3000, net: 130, best: [2, 3, 10], altitude: 90, crowd: '中' },
      months: {
        temp: [6, 8, 13, 19, 24, 27, 31, 31, 27, 21, 14, 8],
        comfort: [62, 68, 86, 92, 86, 70, 56, 58, 80, 92, 86, 68],
        costIndex: [0.85, 0.9, 1.25, 1.15, 1.0, 0.95, 0.95, 0.95, 0.95, 1.05, 1.15, 0.85]
      },
      facts: [
        ['气候', '亚热带季风，3–4 月多雨雾（花与雾同框最好看），7–8 月炎热'],
        ['月租（一居）', '县城 ¥1,000–1,800；景区村落整院月租 ¥2,500 起'],
        ['网速实测', '县城 200 Mbps 以上，村里民宿多为 50–100 Mbps'],
        ['远程办公', '村落民宿普遍安静，适合写作与深度工作'],
        ['交通', '婺源站高铁通景德镇 30 分钟、杭州 2 小时'],
        ['医疗', '县医院为主，较重情况转景德镇或上饶'],
        ['最适合', '3 月下旬–4 月上旬（油菜花）、11 月（晒秋与红枫）'],
        ['适合的人', '喜欢安静村落、能接受交通不便、想专注做事的人'],
        ['要注意', '花期是绝对高峰，房价翻倍且一房难求；村里夜生活基本为零']
      ],
      author: 'ahe', likes: 205, comments: 33,
      scene: {
        palette: 'dawnMist', horizon: 0.58, vignette: 0.2,
        clouds: { count: 5, band: [0.05, 0.3], scale: 1.2, opacity: 0.5 },
        terrain: 'ridges',
        terrainOpts: { layers: 4, base: 0.5, spread: 0.07, amp: 0.15, sharp: 1.3, haze: 0.82 },
        landmark: { variant: 'huizhou', x: 0.36, base: 0.72, scale: 1.1, count: 3, lights: true },
        fog: { bands: 4, from: 0.5, to: 0.8, opacity: 0.42, thickness: 1.1 },
        foreground: { kind: 'rapeseed', blades: 210, base: 0.7, height: 0.9 },
        birds: { count: 4, y: 0.32 }
      }
    },
    {
      id: 'chongqing', name: '重庆', region: '重庆市', cat: 'city',
      tagline: '楼从江边一层层长上去，夜里全亮起来',
      intro: '重庆是一座需要重新学习方向感的城市：地图上的 500 米可能是三层楼的高度。住观音桥比解放碑舒服，晚上安静、吃的也地道。远程工作的设施齐全，生活成本比同级别城市低。',
      size: 'wide',
      tags: ['山城', '夜景', '火锅', '立体交通'],
      stats: { index: 86, cost: 4500, net: 190, best: [3, 9, 10], altitude: 244, crowd: '高' },
      months: {
        temp: [8, 10, 15, 21, 25, 28, 33, 33, 28, 22, 16, 10],
        comfort: [70, 74, 84, 90, 82, 62, 44, 46, 80, 90, 84, 72],
        costIndex: [0.9, 0.9, 0.95, 1.0, 1.0, 0.95, 1.0, 1.0, 1.0, 1.05, 1.0, 0.9]
      },
      facts: [
        ['气候', '夏热冬冷，7–8 月是全国最热的城市之一（40℃ 常见）；10–11 月舒适'],
        ['月租（一居）', '观音桥/大坪 ¥1,800–3,000，解放碑/江北嘴 ¥3,000 起'],
        ['网速实测', '城区 300 Mbps 普及，网吧与共享办公密度高'],
        ['远程办公', '共享办公选择多、价格低，很适合低成本长住'],
        ['交通', '机场 + 高铁枢纽；地铁覆盖广但换乘常要爬楼'],
        ['医疗', '重医附一院等三甲资源强'],
        ['最适合', '4 月、10–11 月（避开酷暑与湿冷）'],
        ['适合的人', '预算敏感、喜欢城市烟火气与美食的人'],
        ['要注意', '夏天太热；坡道多对膝盖不友好；导航经常“失准”']
      ],
      author: 'daxiong', likes: 347, comments: 96,
      scene: {
        palette: 'cityNight', horizon: 0.68, vignette: 0.3,
        stars: { density: 0.35 },
        sun: { x: 0.78, y: 0.15, r: 11, glow: 6, crescent: true },
        terrain: 'ridges',
        terrainOpts: { layers: 2, base: 0.46, spread: 0.06, amp: 0.14, sharp: 1.3, haze: 0.5 },
        landmark: {
          variant: 'city', base: 0.68, scale: 1.1, lights: true,
          hills: [[0, 1], [0.05, 0.92], [0.11, 0.8]]
        },
        fog: { bands: 3, from: 0.5, to: 0.72, opacity: 0.22, thickness: 1.2 },
        water: 'river',
        waterOpts: { rings: 24, rough: 1, sparkle: true, sunColumn: false },
        boats: { count: 1, kind: 'sail', y: 0.87, scale: 1.3, x: 0.3, speed: 0.2 }
      }
    },
    {
      id: 'suzhou', name: '苏州', region: '江苏省 · 苏州市', cat: 'old',
      tagline: '早上七点的平江路，只有河水和扫地声',
      intro: '苏州的日常是在游客潮之外的地方完成的：早上去园林喝茶，下午在小巷子里买菜，晚上沿河走一段。住在老城能享受最好的生活质感，代价是厨房小、停车难、白天人多。',
      size: 'tall',
      tags: ['园林', '评弹', '面馆', '步行友好'],
      stats: { index: 85, cost: 5800, net: 200, best: [3, 9, 10], altitude: 5, crowd: '高' },
      months: {
        temp: [5, 7, 11, 17, 22, 26, 30, 30, 26, 20, 13, 7],
        comfort: [60, 66, 82, 92, 86, 64, 50, 54, 84, 92, 84, 66],
        costIndex: [0.95, 0.95, 1.05, 1.1, 1.05, 1.0, 1.0, 1.0, 1.0, 1.1, 1.05, 0.95]
      },
      facts: [
        ['气候', '四季分明，6 月中–7 月中梅雨；7–8 月湿热；10–11 月最佳'],
        ['月租（一居）', '老城（姑苏区）¥3,000–4,800，园区/新区 ¥2,500 起'],
        ['网速实测', '城区 300 Mbps 以上'],
        ['远程办公', '咖啡馆与共享办公充足，高铁 30 分钟到上海'],
        ['交通', '苏州站/苏州北站高铁，到上海 25–35 分钟'],
        ['医疗', '苏大附一院等三甲资源充足'],
        ['最适合', '4 月、10 月中–11 月（秋天的园林与桂花）'],
        ['适合的人', '喜欢城市生活质感、需要往返上海、偏爱步行的人'],
        ['要注意', '节假日景区人山人海；老城停车与潮湿问题；梅雨要除湿']
      ],
      author: 'qingjian', likes: 289, comments: 51,
      scene: {
        palette: 'springRain', horizon: 0.62, vignette: 0.22,
        clouds: { count: 5, band: [0.05, 0.28], scale: 1.15, opacity: 0.55 },
        terrain: 'ridges',
        terrainOpts: { layers: 3, base: 0.54, spread: 0.06, amp: 0.1, sharp: 1.4, haze: 0.85 },
        landmark: { variant: 'bridge', x: 0.4, base: 0.63, scale: 1.05 },
        water: 'lake',
        waterOpts: { rings: 24, rough: 0.6, sparkle: true, sunColumn: false },
        boats: { count: 1, kind: 'raft', y: 0.85, scale: 0.9, x: 0.62, speed: 0.2 },
        foreground: { kind: 'willow' },
        particles: { kind: 'rain', count: 80, speed: 0.9, size: 1, color: '#eef4f3' }
      }
    },
    {
      id: 'wanning', name: '万宁', region: '海南省 · 万宁市', cat: 'coast',
      tagline: '早上六点下海，浪刚好，人也刚好',
      intro: '日月湾是国内少见的“冲浪生活”聚集地：早上冲浪、下午工作、傍晚看日落，晚上大家坐在院子里吃饭。数字游民和冲浪爱好者混在一起，社交密度比三亚高得多。',
      size: 'short',
      tags: ['冲浪', '数字游民聚集', '日落', '小镇生活'],
      stats: { index: 83, cost: 4800, net: 140, best: [10, 11, 0, 1, 2, 3], altitude: 5, crowd: '低' },
      months: {
        temp: [20, 21, 24, 27, 29, 30, 31, 30, 29, 27, 24, 21],
        comfort: [85, 86, 88, 86, 76, 66, 62, 64, 74, 86, 88, 88],
        costIndex: [1.1, 1.05, 0.95, 0.9, 0.85, 0.8, 0.85, 0.85, 0.8, 0.9, 1.05, 1.1]
      },
      facts: [
        ['气候', '热带海洋性，11–4 月是冲浪与旅居的最佳窗口；7–9 月台风季'],
        ['月租（一居）', '湾里民宿月租 ¥2,000–3,500，旺季（12–2 月）明显上涨'],
        ['网速实测', '镇上 100–200 Mbps，部分冲浪客栈网络较弱'],
        ['远程办公', '咖啡馆与客栈普遍支持办公，是全国数字游民密度最高的地方之一'],
        ['交通', '海口/三亚机场转高铁到万宁站，再打车约 30 分钟'],
        ['医疗', '镇卫生院为基础，较重情况转万宁市区或三亚'],
        ['最适合', '11 月–次年 4 月（浪稳定、气温舒适）'],
        ['适合的人', '想一边工作一边冲浪、喜欢小圈子社交的人'],
        ['要注意', '旺季房租涨；台风季浪大不适合新手；镇上网购配送偏慢']
      ],
      author: 'kiwi', likes: 358, comments: 77,
      scene: {
        palette: 'brightDay', horizon: 0.6, vignette: 0.18,
        sun: { x: 0.3, y: 0.16, r: 16, glow: 9 },
        clouds: { count: 7, band: [0.04, 0.34], scale: 1.3, opacity: 0.85, speedScale: 1.25 },
        water: 'sea',
        waterOpts: { rings: 34, rough: 1.25, sparkle: true, sunColumn: true, sunColumnX: 0.3 },
        waves: { count: 10 },
        boats: { count: 1, kind: 'sail', y: 0.71, scale: 0.9, x: 0.62, speed: 0.5 },
        birds: { count: 5, y: 0.26, dir: -1, color: '#ffffff' },
        foreground: { kind: 'palms', count: 4 }
      }
    },
    {
      id: 'qingdao', name: '青岛', region: '山东省 · 青岛市', cat: 'coast',
      tagline: '红瓦、绿树、海雾，和一杯冰啤酒',
      intro: '青岛把城市和海绑在一起：老城的红瓦房子顺着坡地铺下去，转个弯就是海。5–6 月和 9–10 月最舒服，夏天有游客，冬天有风但城市很安静，生活成本在大城市里偏低。',
      size: 'medium',
      tags: ['红瓦绿树', '海边骑行', '啤酒', '四季分明'],
      stats: { index: 84, cost: 4700, net: 170, best: [4, 5, 8, 9], altitude: 25, crowd: '中' },
      months: {
        temp: [1, 3, 8, 13, 19, 23, 27, 27, 23, 17, 10, 4],
        comfort: [58, 62, 74, 82, 86, 80, 70, 74, 88, 90, 80, 64],
        costIndex: [0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.25, 1.25, 1.0, 0.95, 0.9, 0.85]
      },
      facts: [
        ['气候', '海洋性气候，夏天比内陆凉；5–6 月海雾多，9–10 月最通透'],
        ['月租（一居）', '市南老城 ¥2,500–4,000，市北/李沧 ¥1,800 起'],
        ['网速实测', '城区 200 Mbps 以上'],
        ['远程办公', '咖啡馆密度高，海景办公点不少'],
        ['交通', '胶东机场 + 高铁；地铁覆盖主要城区'],
        ['医疗', '青大附院等三甲资源充足'],
        ['最适合', '5 月中–6 月（人少、气温舒适）、9–10 月（秋天最好的海）'],
        ['适合的人', '想要海边城市生活但不想住在旅游区的人'],
        ['要注意', '7–8 月旺季人多价高；冬季海风大；老城坡多']
      ],
      author: 'laozhou', likes: 276, comments: 45,
      scene: {
        palette: 'goldenHour', horizon: 0.6, vignette: 0.22,
        sun: { x: 0.72, y: 0.36, r: 20, glow: 8 },
        clouds: { count: 5, band: [0.06, 0.3], scale: 1.2, opacity: 0.55 },
        water: 'sea',
        waterOpts: { rings: 30, rough: 1.05, sparkle: true, sunColumn: true, sunColumnX: 0.72 },
        waves: { count: 7 },
        landmark: { variant: 'redroof', x: 0.3, base: 0.61, scale: 1.1, rows: 3 },
        boats: { count: 2, kind: 'sail', y: 0.72, scale: 0.95, x: 0.55, speed: 0.35 },
        birds: { count: 6, y: 0.3, dir: -1, color: '#4a3b3b' }
      }
    },
    {
      id: 'anji', name: '安吉', region: '浙江省 · 安吉县', cat: 'wild',
      tagline: '竹林里下起雨的时候，整座山都在响',
      intro: '安吉是长三角的“近场”选择：从上海/杭州出发一两小时，就能住进竹海里。这里有成规模的数字游民社区，工位和网络都不错，缺点是没车不方便，夜里非常安静。',
      size: 'tall',
      tags: ['竹海', '数字游民社区', '离沪杭近', '需要车'],
      stats: { index: 87, cost: 4300, net: 320, best: [3, 4, 9], altitude: 120, crowd: '低' },
      months: {
        temp: [4, 6, 11, 17, 22, 25, 29, 29, 25, 19, 12, 6],
        comfort: [60, 66, 82, 90, 86, 70, 58, 60, 84, 90, 82, 66],
        costIndex: [0.9, 0.9, 0.95, 1.05, 1.05, 1.05, 1.15, 1.15, 1.0, 1.05, 1.0, 0.9]
      },
      facts: [
        ['气候', '亚热带山地气候，夏季比市区低 3–5℃；梅雨明显，冬天湿冷'],
        ['月租（一居）', '县城 ¥1,500–2,500；山里民宿长约 ¥3,500 起'],
        ['网速实测', '数字游民社区实测 300 Mbps 以上，山区民宿差异大'],
        ['远程办公', '有成熟的共居/共创空间，适合需要会议与稳定网络的人'],
        ['交通', '无高铁，最近为安吉站（部分车次）；建议自驾'],
        ['医疗', '县医院为主，较重情况转杭州（约 1 小时）'],
        ['最适合', '4–5 月（新竹与茶季）、10 月（秋色与桂花）'],
        ['适合的人', '想靠近山林但不想远离长三角、需要稳定网络的人'],
        ['要注意', '没车生活会很不方便；夜里餐饮选择少；梅雨潮湿']
      ],
      author: 'tangyuan', likes: 241, comments: 39,
      scene: {
        palette: 'bambooMist', horizon: 0.62, vignette: 0.24,
        clouds: { count: 5, band: [0.05, 0.3], scale: 1.2, opacity: 0.5 },
        terrain: 'ridges',
        terrainOpts: { layers: 4, base: 0.5, spread: 0.08, amp: 0.18, sharp: 1.2, haze: 0.8 },
        landmark: { variant: 'pavilion', x: 0.7, base: 0.72, scale: 0.9, lights: true },
        fog: { bands: 5, from: 0.4, to: 0.82, opacity: 0.45, thickness: 1.2 },
        foreground: { kind: 'bamboo', base: 0.55 },
        particles: { kind: 'fireflies', count: 22, size: 1 }
      }
    },
    {
      id: 'kashgar', name: '喀什', region: '新疆维吾尔自治区 · 喀什市', cat: 'old',
      tagline: '晚上十点的太阳，像内地下午四点',
      intro: '喀什会让你重新安排一天的时间表：早上九点天亮，下午两点吃午饭，晚上十点才日落。老城喝茶五块钱一壶能坐一下午，巷子里到处是孩子的笑声。',
      size: 'medium',
      tags: ['时差感', '老城', '茶馆', '干燥'],
      stats: { index: 80, cost: 2900, net: 120, best: [4, 8, 9], altitude: 1289, crowd: '低' },
      months: {
        temp: [-4, 1, 9, 17, 22, 27, 30, 29, 24, 15, 5, -2],
        comfort: [50, 56, 70, 86, 88, 78, 68, 72, 88, 84, 64, 52],
        costIndex: [0.85, 0.85, 0.9, 0.95, 1.0, 1.05, 1.15, 1.15, 1.0, 0.95, 0.9, 0.85]
      },
      facts: [
        ['气候', '暖温带大陆性干旱气候，极端干燥，昼夜温差大；3–5 月有沙尘'],
        ['月租（一居）', '老城周边 ¥1,000–1,800，新区略高'],
        ['网速实测', '市区 100–200 Mbps'],
        ['远程办公', '可行，但要注意时差（本地作息比北京时间晚约 2 小时）'],
        ['交通', '喀什机场通乌鲁木齐等地；火车站有直达乌鲁木齐的列车'],
        ['医疗', '地区医院为基础，复杂情况需转乌鲁木齐'],
        ['最适合', '5 月、9–10 月（温度舒适，白昼长，光照好）'],
        ['适合的人', '喜欢异域文化、慢节奏、对干燥与偏远有准备的人'],
        ['要注意', '安保检查较多、需带身份证；干燥；部分区域网络访问受限']
      ],
      author: 'guzi', likes: 198, comments: 41,
      scene: {
        palette: 'dusk', horizon: 0.62, vignette: 0.26,
        sun: { x: 0.24, y: 0.44, r: 20, glow: 8 },
        clouds: { count: 4, band: [0.1, 0.3], scale: 1.4, opacity: 0.45 },
        terrain: 'dunes',
        terrainOpts: { layers: 2, base: 0.56, spread: 0.05, amp: 0.07, haze: 0.7 },
        landmark: { variant: 'oldtown', x: 0.5, base: 0.72, scale: 1.15, count: 5, lights: true },
        fog: { bands: 3, from: 0.55, to: 0.82, opacity: 0.22, thickness: 1.3 },
        particles: { kind: 'sand', count: 40, speed: 0.7, size: 0.9 }
      }
    }
  ];

  /* ============================================================
     新增城市（省 + 市 两级）
     每省两座：省会 + 一座旅游城市；直辖市单列。
     只写种子，12 个月气候与画面配置由上面的模板自动展开。
     ============================================================ */
  const CITY_SEEDS = [
    // ---------------- 华北 ----------------
    { id: 'beijing', name: '北京', region: '北京市', cat: 'city', climate: 'north',
      palette: 'cityNight', cost: 7000, net: 220, altitude: 44, crowd: '高', best: [3, 4, 8, 9],
      tagline: '胡同、剧场、山，和一条永远在堵的三环',
      tags: ['文化资源密集', '地铁覆盖广', '四季分明', '房租高'],
      intro: '北京的旅居体验取决于住哪：二环里是胡同与咖啡馆，五环外是能爬的山。文化资源别的城市比不了，代价是房租和通勤。',
      climateNote: '四季分明，3–4 月风沙大，7–8 月闷热，9–10 月是全年最好的两个月',
      rent: '五环内一居 ¥4,500–8,000，昌平/通州等近郊 ¥2,800 起',
      netNote: '城区 200–500 Mbps，远程办公无障碍',
      transport: '双机场 + 全国高铁枢纽，地铁里程全球前列',
      bestFor: '需要密集文化、教育、医疗资源，能接受高房租的人',
      watch: '冬天有霾、夏天闷热；通勤时间按地图的 1.5 倍估算' },
    { id: 'tianjin', name: '天津', region: '天津市', cat: 'city', climate: 'north', dt: -1,
      palette: 'cityNight', cost: 4500, net: 200, altitude: 5, crowd: '中', best: [3, 4, 9, 10],
      tagline: '北京的隔壁，房租砍一半的港口城市',
      tags: ['老洋房', '相声', '港口城市', '离北京近'],
      intro: '天津常被当成北京的通勤后花园，其实它自己很完整：五大道的老洋房、海河边的夜跑、茶馆里的相声，生活成本低一档。',
      climateNote: '和北京接近但更湿润，冬天海风冷，7–8 月闷热',
      rent: '和平区一居 ¥2,500–4,000，滨海新区 ¥1,800 起',
      netNote: '城区 200–400 Mbps',
      transport: '高铁到北京 30 分钟，滨海机场通全国',
      bestFor: '想贴着北京但省房租、喜欢城市烟火气的人',
      watch: '冬天风大；本地工作机会不如北京，收入要提前想清楚' },
    { id: 'shijiazhuang', name: '石家庄', region: '河北省 · 石家庄市', cat: 'city', climate: 'north',
      palette: 'goldenHour', cost: 3000, net: 180, altitude: 80, crowd: '低', best: [3, 4, 9, 10],
      tagline: '太行山脚下的交通枢纽，成本低得意外',
      tags: ['交通枢纽', '成本低', '靠太行山', '采暖季空气差'],
      intro: '石家庄不算好看，但极其好用：高铁一小时进京、一小时到山西，房租便宜，往西开一小时就是太行山的村子。',
      climateNote: '温带季风，冬天干冷、夏天闷热，春秋短而舒服',
      rent: '市区一居 ¥1,200–2,200',
      netNote: '城区 150–300 Mbps',
      transport: '高铁枢纽，进京约 1 小时 20 分',
      bestFor: '预算优先、需要频繁进出北京或山西的人',
      watch: '采暖季空气质量差，敏感人群要备净化器' },
    { id: 'chengde', name: '承德', region: '河北省 · 承德市', cat: 'mountain', climate: 'northCold',
      palette: 'dawnMist', cost: 2800, net: 150, altitude: 350, crowd: '低', best: [5, 6, 7, 8],
      tagline: '避暑山庄的夏天，皇帝替你选过',
      tags: ['避暑', '皇家园林', '坝上草原', '冬季冷'],
      intro: '承德是北京人真正的避暑后花园：夏天比北京低 4–6 度，山庄、外八庙、坝上草原都在一两小时车程内。',
      climateNote: '夏季凉爽（7 月均温 24℃），冬季严寒且长',
      rent: '市区一居 ¥1,000–2,000，山庄周边略高',
      netNote: '城区 100–300 Mbps，景区民宿偏弱',
      transport: '高铁进京约 1 小时，自驾到坝上 2 小时',
      bestFor: '想在夏天躲热、喜欢山与寺庙的人',
      watch: '11–3 月很冷且旅游停摆；7–8 月房价翻倍' },
    { id: 'taiyuan', name: '太原', region: '山西省 · 太原市', cat: 'city', climate: 'north', dt: -1,
      palette: 'goldenHour', cost: 3200, net: 170, altitude: 800, crowd: '低', best: [4, 5, 9, 10],
      tagline: '面食、古建与两千五百年的城',
      tags: ['古建', '面食', '成本低', '空气一般'],
      intro: '太原是被低估的省会：博物馆和古建密度高，一小时内有平遥、晋祠、天龙山，生活成本低。',
      climateNote: '温带大陆性，昼夜温差大，冬季干冷，夏季短暂',
      rent: '市区一居 ¥1,300–2,300',
      netNote: '城区 150–300 Mbps',
      transport: '高铁到北京 2.5 小时，武宿机场通全国',
      bestFor: '爱看古建、预算敏感、能接受空气一般的人',
      watch: '采暖季空气差；景点多在周边，没车不方便' },
    { id: 'datong', name: '大同', region: '山西省 · 大同市', cat: 'old', climate: 'northCold',
      palette: 'dusk', cost: 2600, net: 150, altitude: 1050, crowd: '低', best: [5, 6, 7, 8],
      tagline: '云冈石窟、悬空寺与一座干净的老城',
      tags: ['石窟', '古建', '夏季凉爽', '干燥'],
      intro: '大同是山西最好逛的城市：云冈石窟、华严寺、修复得漂亮的古城墙，夏天凉爽，冬天冷得干脆。',
      climateNote: '中温带大陆性，夏季凉爽，冬季严寒干燥',
      rent: '古城内一居 ¥1,200–2,200',
      netNote: '城区 100–300 Mbps',
      transport: '高铁进京约 2 小时，云冈机场通多地',
      bestFor: '喜欢石窟与古建、夏天想躲热的人',
      watch: '冬天风大且冷；古城内夜里很安静' },

    // ---------------- 东北 ----------------
    { id: 'shenyang', name: '沈阳', region: '辽宁省 · 沈阳市', cat: 'city', climate: 'northeast', dt: 3,
      palette: 'cityNight', cost: 3300, net: 190, altitude: 45, crowd: '中', best: [5, 6, 7, 8],
      tagline: '东北最像大城市的城市，澡堂与烧烤俱全',
      tags: ['物价低', '医疗强', '冬天冷', '澡堂文化'],
      intro: '沈阳是东北的生活中心：房租低、地铁全、医院强，冬天室内暖气足，夏天比南方舒服得多。',
      climateNote: '冬季严寒（-15℃ 常见），夏季凉爽，春秋短',
      rent: '市区一居 ¥1,500–2,500',
      netNote: '城区 200–400 Mbps',
      transport: '高铁枢纽，桃仙机场通全国',
      bestFor: '想低成本长住、不怕冷、看重医疗的人',
      watch: '11–3 月户外基本停摆；老楼供暖差异大，租房先问清' },
    { id: 'dalian', name: '大连', region: '辽宁省 · 大连市', cat: 'coast', climate: 'coastNorth', dt: 2,
      palette: 'brightDay', cost: 4200, net: 180, altitude: 30, crowd: '中', best: [5, 6, 7, 9],
      tagline: '海风、有轨电车和夏天的啤酒节',
      tags: ['海滨', '夏天舒服', '海鲜便宜', '风大'],
      intro: '大连是北方少有的海滨宜居城市：夏天不闷，海岸线长，城市干净，海鲜便宜，冬天有风但不算难熬。',
      climateNote: '海洋性气候，夏天比内陆凉，冬天海风冷但少极端低温',
      rent: '中山区一居 ¥2,000–3,500',
      netNote: '城区 200–400 Mbps',
      transport: '周水子机场 + 高铁，坐船可达烟台',
      bestFor: '想在北方过夏天、喜欢海边散步的人',
      watch: '冬天海风体感很冷；7–8 月人多价高' },
    { id: 'changchun', name: '长春', region: '吉林省 · 长春市', cat: 'city', climate: 'northeast', dt: 4,
      palette: 'grassDay', cost: 3000, net: 180, altitude: 220, crowd: '低', best: [6, 7, 8],
      tagline: '电影城、净月潭与大块的绿地',
      tags: ['绿地多', '物价低', '电影城', '冬天冷'],
      intro: '长春的城市面貌比想象中舒展：绿地多、路宽、物价低，净月潭夏天能骑车，冬天能滑雪。',
      climateNote: '冬季严寒漫长，夏季短暂凉爽',
      rent: '市区一居 ¥1,300–2,200',
      netNote: '城区 150–350 Mbps',
      transport: '高铁到沈阳 1.5 小时，龙嘉机场通全国',
      bestFor: '喜欢安静、低成本、夏天避暑的人',
      watch: '供暖期长、室内干燥；冬天日照短' },
    { id: 'jilin', name: '吉林市', region: '吉林省 · 吉林市', cat: 'lake', climate: 'northeast', dt: 3,
      palette: 'snowNight', cost: 2700, net: 160, altitude: 200, crowd: '低', best: [6, 7, 8, 0],
      tagline: '雾凇、松花江和不结冰的冬天',
      tags: ['雾凇', '松花江', '冬季限定', '成本低'],
      intro: '吉林市常和长春混淆，但它的冬天更值得：松花江不冻，1 月的雾凇是国内独一份的景观。',
      climateNote: '冬季极冷但江面不冻，1 月雾凇最盛；夏季凉爽',
      rent: '市区一居 ¥1,100–2,000',
      netNote: '城区 150–300 Mbps',
      transport: '高铁到长春 40 分钟',
      bestFor: '摄影爱好者、想安静过夏天的人',
      watch: '雾凇要看天气，别只为一件事订长期行程' },
    { id: 'mudanjiang', name: '牡丹江', region: '黑龙江省 · 牡丹江市', cat: 'snow', climate: 'northeast', dt: 2,
      palette: 'clearNight', cost: 2800, net: 150, altitude: 240, crowd: '低', best: [6, 7, 8, 0],
      tagline: '雪乡、镜泊湖与真正的东北雪季',
      tags: ['雪乡', '冬季', '物价低', '交通一般'],
      intro: '牡丹江有黑龙江最有雪的冬天：雪乡、镜泊湖、横道河子都能当天往返，城市本身物价很低。',
      climateNote: '冬季极寒（-20℃ 以下），雪期长达半年',
      rent: '市区一居 ¥1,100–2,000',
      netNote: '城区 100–300 Mbps，山里信号弱',
      transport: '高铁到哈尔滨 1.5 小时，航线较少',
      bestFor: '想看雪、不怕冷的人',
      watch: '雪乡旺季乱收费投诉多，提前订好并留凭证' },

    // ---------------- 内蒙古 / 直辖市 ----------------
    { id: 'hohhot', name: '呼和浩特', region: '内蒙古自治区 · 呼和浩特市', cat: 'grass', climate: 'northCold',
      palette: 'grassDay', cost: 3200, net: 170, altitude: 1050, crowd: '低', best: [6, 7, 8],
      tagline: '烧麦、奶茶与一小时外的草原',
      tags: ['草原门户', '奶食', '干燥', '物价低'],
      intro: '呼和浩特是离草原最近的省会：往北开一小时就是希拉穆仁，城里有寺庙、博物馆和便宜的手把肉。',
      climateNote: '温带大陆性，昼夜温差大，冬季干冷，夏季凉爽',
      rent: '市区一居 ¥1,300–2,200',
      netNote: '城区 150–300 Mbps',
      transport: '白塔机场通全国，高铁进京 2.5 小时',
      bestFor: '喜欢草原与奶食、能接受干燥的人',
      watch: '春季沙尘；草原旅游季短（6–8 月）' },
    { id: 'shanghai', name: '上海', region: '上海市', cat: 'city', climate: 'eastCoast',
      palette: 'cityNight', cost: 8500, net: 300, altitude: 4, crowd: '高', best: [3, 4, 9, 10],
      tagline: '高效、体面，也贵得明明白白',
      tags: ['资源顶配', '房租高', '咖啡密度全国第一', '梅雨'],
      intro: '上海的旅居体验是「什么都有、什么都贵」：医疗教育文化都是顶配，代价是房租和密度。适合收入稳定、需要资源的人。',
      climateNote: '四季分明，6 月中–7 月中梅雨潮湿，7–8 月闷热',
      rent: '内环一居 ¥6,000–12,000，外环外 ¥3,000 起',
      netNote: '城区 300–1000 Mbps',
      transport: '双机场 + 地铁网络全球第一，高铁到苏州 25 分钟',
      bestFor: '远程工作者、创业者、需要顶级资源的人',
      watch: '梅雨季要除湿机；6–7 月与 9 月是房租旺季' },

    // ---------------- 华东 ----------------
    { id: 'nanjing', name: '南京', region: '江苏省 · 南京市', cat: 'city', climate: 'central', dt: 1,
      palette: 'springRain', cost: 5200, net: 220, altitude: 20, crowd: '中', best: [3, 4, 10],
      tagline: '梧桐、城墙与一条穿城的江',
      tags: ['梧桐', '历史文化', '高校密集', '夏天热'],
      intro: '南京是江苏最适合长住的省会：梧桐树、城墙、免费博物馆，节奏比上海慢半拍，资源却不差。',
      climateNote: '夏季闷热（7–8 月 35℃ 常见），冬天湿冷，春秋最好',
      rent: '鼓楼/玄武一居 ¥3,000–5,000',
      netNote: '城区 300–500 Mbps',
      transport: '高铁到上海 1 小时、到北京 3.5 小时',
      bestFor: '喜欢历史与高校氛围、又不想住上海的人',
      watch: '夏天湿热、冬天湿冷，两头都不舒服' },
    { id: 'zhoushan', name: '舟山', region: '浙江省 · 舟山市', cat: 'coast', climate: 'eastCoast',
      palette: 'dusk', cost: 4500, net: 160, altitude: 10, crowd: '低', best: [4, 5, 9, 10],
      tagline: '群岛、渔港和一整年的海风',
      tags: ['海岛', '海鲜', '空气好', '台风季'],
      intro: '舟山是浙江唯一能「住在海岛上」的地级市：普陀山、东极岛、嵊泗都在境内，海鲜便宜，节奏极慢。',
      climateNote: '海洋性气候，夏无酷暑冬无严寒，7–9 月台风影响船班',
      rent: '定海一居 ¥1,800–3,000',
      netNote: '城区 200–500 Mbps，岛上偏弱',
      transport: '跨海大桥通宁波，岛间靠船',
      bestFor: '想安静住海边、不赶时间的人',
      watch: '台风季船班停运；冬季海风大且阴雨多' },
    { id: 'hefei', name: '合肥', region: '安徽省 · 合肥市', cat: 'city', climate: 'central', dt: 1,
      palette: 'brightDay', cost: 3500, net: 220, altitude: 30, crowd: '中', best: [4, 5, 10, 11],
      tagline: '中部最有性价比的省会',
      tags: ['成本低', '交通便利', '科创', '夏天热'],
      intro: '合肥这几年补课很快：科创产业、地铁、商圈都上来了，但房租还停在二线水平，适合预算有限的长期落脚。',
      climateNote: '四季分明，夏天闷热，冬天湿冷',
      rent: '蜀山区一居 ¥1,500–2,800',
      netNote: '城区 200–500 Mbps',
      transport: '高铁到南京 1 小时、到上海 2 小时',
      bestFor: '远程工作、预算敏感、想贴长三角的人',
      watch: '夏天湿热；更适合「生活」而不是「打卡」' },
    { id: 'huangshan', name: '黄山', region: '安徽省 · 黄山市', cat: 'mountain', climate: 'central', dt: -3,
      palette: 'dawnMist', cost: 3300, net: 180, altitude: 130, crowd: '中', best: [4, 5, 10, 11],
      tagline: '黄山脚下，徽州村落与雾',
      tags: ['徽州村落', '黄山', '多雾', '潮湿'],
      intro: '黄山市（屯溪）本身就是很好的旅居点：老街、新安江，一小时到宏村西递，夏天上山避暑，秋天看晒秋。',
      climateNote: '亚热带湿润，雨水多雾多，山上山下温差大',
      rent: '屯溪一居 ¥1,500–2,600',
      netNote: '城区 200–400 Mbps，古村民宿偏弱',
      transport: '高铁到杭州 1.5 小时',
      bestFor: '喜欢古村与山、能接受多雨的人',
      watch: '梅雨与夏季暴雨多；清明与国庆景区极挤' },
    { id: 'fuzhou', name: '福州', region: '福建省 · 福州市', cat: 'city', climate: 'eastCoast', dt: 2,
      palette: 'springRain', cost: 4200, net: 200, altitude: 20, crowd: '中', best: [3, 4, 10, 11],
      tagline: '榕树、温泉与慢半拍的省会',
      tags: ['温泉', '榕树', '成本适中', '夏天湿热'],
      intro: '福州是被厦门盖住风头的省会：三坊七巷、温泉、榕树道，成本比厦门低，夏天热但冬天舒服。',
      climateNote: '亚热带海洋性，夏天湿热，冬天温和少寒',
      rent: '鼓楼一居 ¥2,000–3,500',
      netNote: '城区 200–500 Mbps',
      transport: '高铁到厦门 1.5 小时，长乐机场通全国',
      bestFor: '想住南方但避开高房价、喜欢慢生活的人',
      watch: '7–9 月台风；夏天湿度大，除湿机必备' },
    { id: 'xiamen', name: '厦门', region: '福建省 · 厦门市', cat: 'coast', climate: 'eastCoast', dt: 2,
      palette: 'brightDay', cost: 6000, net: 220, altitude: 15, crowd: '高', best: [3, 4, 10, 11],
      tagline: '海、咖啡与骑楼，代价是房价',
      tags: ['海滨', '咖啡', '房租高', '游客多'],
      intro: '厦门是国内「海边城市生活」的标准答案：环岛路、鼓浪屿、咖啡馆密度高，但房租不便宜，旺季游客多。',
      climateNote: '亚热带海洋性，冬天温暖，夏秋有台风',
      rent: '思明一居 ¥3,000–5,500',
      netNote: '城区 300–500 Mbps',
      transport: '高崎机场通全国，高铁到福州 1.5 小时',
      bestFor: '喜欢海边城市、不介意高房租的人',
      watch: '7–9 月台风；暑期游客极多，避开景区周边租房' },
    { id: 'nanchang', name: '南昌', region: '江西省 · 南昌市', cat: 'city', climate: 'central', dt: 2,
      palette: 'cityNight', cost: 3300, net: 200, altitude: 25, crowd: '中', best: [4, 5, 10],
      tagline: '滕王阁、赣江与便宜的省会生活',
      tags: ['成本低', '夜市热闹', '夏天极热', '交通便利'],
      intro: '南昌是中部最被低估的省会之一：房租低、地铁全、夜宵热闹，滕王阁与赣江步道是日常。',
      climateNote: '夏季酷热（7–8 月常超 37℃），冬季湿冷',
      rent: '红谷滩一居 ¥1,500–2,600',
      netNote: '城区 200–500 Mbps',
      transport: '高铁到上海 3 小时、到广州 3.5 小时',
      bestFor: '想低成本长住、能扛夏天的人',
      watch: '夏天是全国最热梯队；冬天湿冷没暖气' },
    { id: 'jingdezhen', name: '景德镇', region: '江西省 · 景德镇市', cat: 'old', climate: 'central', dt: 1,
      palette: 'dusk', cost: 3000, net: 190, altitude: 50, crowd: '低', best: [4, 5, 10, 11],
      tagline: '瓷、手艺人与一整座会做陶的城',
      tags: ['陶瓷', '手艺人社区', '成本低', '夏天热'],
      intro: '景德镇是国内最成熟的手艺人旅居地：陶溪川、三宝村、雕塑瓷厂，住下来就能进窑、上课、摆摊。',
      climateNote: '亚热带湿润，夏天闷热，冬天湿冷',
      rent: '市区一居 ¥1,200–2,200，三宝村整院 ¥2,500 起',
      netNote: '城区 200–400 Mbps',
      transport: '高铁到南昌 1 小时、到杭州 2.5 小时',
      bestFor: '手艺人、设计师、想低成本长期创作的人',
      watch: '夏天湿热；周末与市集期间住宿涨价' },
    { id: 'jinan', name: '济南', region: '山东省 · 济南市', cat: 'city', climate: 'north', dt: 2,
      palette: 'springRain', cost: 4000, net: 200, altitude: 60, crowd: '中', best: [4, 5, 9, 10],
      tagline: '泉水、把子肉与山东的中心',
      tags: ['泉水', '交通枢纽', '夏天热', '成本适中'],
      intro: '济南是「被泉水泡着的城市」：趵突泉、大明湖、千佛山都在市区，房租比青岛低，高铁四通八达。',
      climateNote: '温带季风，夏季闷热多雨，冬季干冷',
      rent: '历下一居 ¥2,000–3,200',
      netNote: '城区 200–400 Mbps',
      transport: '高铁到北京 1.5 小时、到上海 3 小时',
      bestFor: '想住山东、需要交通与医疗资源的人',
      watch: '7–8 月闷热；冬天雾霾天较多' },
    { id: 'taipei', name: '台北', region: '台湾省 · 台北市', cat: 'city', climate: 'eastCoast', dt: 3,
      palette: 'springRain', cost: 7000, net: 250, altitude: 10, crowd: '高', best: [3, 4, 10, 11],
      tagline: '巷弄、咖啡与一场下不停的雨',
      tags: ['捷运便利', '咖啡书店', '多雨', '物价偏高'],
      intro: '台北适合步行生活：捷运密、便利店全世界最密、咖啡馆与书店随处可见，冬天湿冷但很少低于 10 度。',
      climateNote: '亚热带，冬季湿冷多雨，夏季炎热，7–9 月有台风',
      rent: '市区一居 ¥3,500–6,000',
      netNote: '市区 300–1000 Mbps',
      transport: '捷运与公车覆盖极好',
      bestFor: '喜欢步行城市生活、不介意下雨的人',
      watch: '冬季连续阴雨影响情绪；住宿成本偏高' },
    { id: 'hualien', name: '花莲', region: '台湾省 · 花莲县', cat: 'coast', climate: 'eastCoast', dt: 2,
      palette: 'brightDay', cost: 4500, net: 180, altitude: 20, crowd: '低', best: [3, 4, 10, 11],
      tagline: '断崖、太平洋与慢到极致的东海岸',
      tags: ['太平洋', '断崖', '节奏慢', '地震台风'],
      intro: '花莲是台湾最像「旅居」的地方：清水断崖、太鲁阁、七星潭都在半小时圈内，房租低、节奏慢。',
      climateNote: '亚热带海洋性，多雨多台风，夏季炎热',
      rent: '市区一居 ¥2,000–3,200',
      netNote: '市区 200–500 Mbps',
      transport: '台铁到台北约 2 小时，县内建议自驾',
      bestFor: '想住海边、写东西、远离人群的人',
      watch: '地震与台风频繁；公共交通弱，没车不便' }

    // ---------------- 华中 ----------------
    ,{ id: 'zhengzhou', name: '郑州', region: '河南省 · 郑州市', cat: 'city', climate: 'central',
      palette: 'cityNight', cost: 3800, net: 210, altitude: 110, crowd: '中', best: [4, 5, 10],
      tagline: '米字高铁的心脏，一座总被路过的城市',
      tags: ['交通心脏', '成本适中', '配套提升中', '夏天热'],
      intro: '郑州是交通意义上的中国中心：米字高铁、双机场圈，去哪都方便。城市本身不出彩，但成本低、配套在补课。',
      climateNote: '温带季风，夏季闷热，冬季干冷有霾',
      rent: '市区一居 ¥1,600–2,800',
      netNote: '城区 200–500 Mbps',
      transport: '米字高铁枢纽，到北京 2.5 小时、到西安 3 小时',
      bestFor: '需要全国跑动、想把家安在中点的人',
      watch: '冬天空气质量一般；旅游内容不多' },
    { id: 'luoyang', name: '洛阳', region: '河南省 · 洛阳市', cat: 'old', climate: 'central', dt: -1,
      palette: 'dusk', cost: 2800, net: 180, altitude: 150, crowd: '低', best: [3, 4, 9, 10],
      tagline: '十三朝古都，牡丹与龙门石窟',
      tags: ['古都', '石窟', '牡丹季', '成本低'],
      intro: '洛阳是河南最像旅居的城市：龙门石窟、白马寺、老城的汤馆，4 月牡丹季全城开花，平时安静便宜。',
      climateNote: '温带季风，四季分明，春秋舒适',
      rent: '老城一居 ¥1,200–2,200',
      netNote: '城区 150–400 Mbps',
      transport: '高铁到郑州 40 分钟、到西安 1.5 小时',
      bestFor: '喜欢古都、想低成本长住的人',
      watch: '4 月牡丹季人多价高；夏天闷热' },
    { id: 'wuhan', name: '武汉', region: '湖北省 · 武汉市', cat: 'city', climate: 'central', dt: 1,
      palette: 'cityNight', cost: 4500, net: 220, altitude: 25, crowd: '高', best: [4, 5, 10],
      tagline: '两江三镇，一座被水切开的巨型城市',
      tags: ['高校密集', '交通枢纽', '夏天极热', '成本适中'],
      intro: '武汉是华中资源中心：高校、医院、地铁都强，房租比南京低。城市由三镇组成，选对住址能省很多通勤。',
      climateNote: '夏季酷热（常被叫火炉），冬季湿冷',
      rent: '武昌/汉口一居 ¥2,000–3,500',
      netNote: '城区 300–600 Mbps',
      transport: '高铁到北京 4 小时、到广州 4 小时，长江航运枢纽',
      bestFor: '需要高校与医疗资源、预算中等的人',
      watch: '7–8 月极热且湿热；三镇之间通勤时间要算清' },
    { id: 'yichang', name: '宜昌', region: '湖北省 · 宜昌市', cat: 'lake', climate: 'central', dt: -2,
      palette: 'dawnMist', cost: 3000, net: 180, altitude: 60, crowd: '低', best: [4, 5, 9, 10],
      tagline: '三峡门户，一条江的城市',
      tags: ['三峡', '江城', '成本低', '夏天热'],
      intro: '宜昌是三峡的入口：大坝、清江、三峡人家都在一小时圈内，城市干净、物价低，江边步道很长。',
      climateNote: '亚热带季风，夏季湿热，冬季温和',
      rent: '市区一居 ¥1,300–2,200',
      netNote: '城区 150–400 Mbps',
      transport: '高铁到武汉 2 小时、到重庆 3 小时',
      bestFor: '喜欢江与山、想低成本长住的人',
      watch: '夏天湿热；丰水期部分景区关闭' },
    { id: 'changsha', name: '长沙', region: '湖南省 · 长沙市', cat: 'city', climate: 'central', dt: 2,
      palette: 'cityNight', cost: 3800, net: 220, altitude: 45, crowd: '高', best: [4, 5, 10, 11],
      tagline: '夜宵、茶馆与全国最会玩的城市之一',
      tags: ['夜生活', '成本低', '美食', '夏天热'],
      intro: '长沙日常成本低、娱乐密度高：夜宵、酒吧、脱口秀，房租在同级别省会里算便宜，年轻人多。',
      climateNote: '夏季酷热，冬季湿冷，春秋短',
      rent: '岳麓/芙蓉一居 ¥1,800–3,000',
      netNote: '城区 300–600 Mbps',
      transport: '高铁到广州 2.5 小时、到武汉 1.5 小时',
      bestFor: '年轻的远程工作者、喜欢热闹的人',
      watch: '夏天热、冬天湿冷；周末市中心极挤' },
    { id: 'zhangjiajie', name: '张家界', region: '湖南省 · 张家界市', cat: 'mountain', climate: 'central', dt: -2,
      palette: 'dawnMist', cost: 2900, net: 160, altitude: 200, crowd: '中', best: [4, 5, 9, 10],
      tagline: '峰林、云雾与一座靠山吃饭的城市',
      tags: ['峰林', '云雾', '淡季便宜', '潮湿'],
      intro: '张家界是纯靠山的地方：武陵源、天门山都在市区周边，淡季住宿便宜得不敢相信，雨季云雾最好看。',
      climateNote: '亚热带湿润，雨雾多，夏天凉爽',
      rent: '市区一居 ¥1,200–2,200',
      netNote: '城区 100–300 Mbps',
      transport: '高铁到长沙 2.5 小时，荷花机场通多地',
      bestFor: '喜欢山、能接受多雨与潮气的人',
      watch: '旺季（暑假、国庆）人多且贵；山路多，需要体力' },

    // ---------------- 华南 ----------------
    { id: 'guangzhou', name: '广州', region: '广东省 · 广州市', cat: 'city', climate: 'south',
      palette: 'cityNight', cost: 5500, net: 250, altitude: 20, crowd: '高', best: [2, 3, 10, 11],
      tagline: '早茶、骑楼与一年十个月的夏天',
      tags: ['早茶', '医疗强', '冬天短', '湿热长'],
      intro: '广州生活便利度全国前列：早茶、便利店、地铁、医疗都在线，冬天很短，适合怕冷又不想离开城市的人。',
      climateNote: '亚热带，夏季长且湿热，冬季温和，4–6 月回南天潮湿',
      rent: '天河一居 ¥3,000–5,500',
      netNote: '城区 300–1000 Mbps',
      transport: '白云机场 + 高铁枢纽，地铁覆盖广',
      bestFor: '怕冷、重视医疗与美食、能适应湿热的人',
      watch: '回南天墙壁出水，除湿机必须；7–9 月闷热' },
    { id: 'zhuhai', name: '珠海', region: '广东省 · 珠海市', cat: 'coast', climate: 'south',
      palette: 'brightDay', cost: 5200, net: 220, altitude: 10, crowd: '低', best: [3, 4, 10, 11],
      tagline: '海边城市里最适合生活的那一个',
      tags: ['海滨', '空气好', '人口密度低', '台风季'],
      intro: '珠海是广东最宜居的海滨城市：情侣路、海岛、空气好，人口密度低，去澳门半小时，房租比深圳低一档。',
      climateNote: '亚热带海洋性，冬季温和，7–9 月台风',
      rent: '香洲一居 ¥2,500–4,000',
      netNote: '城区 300–600 Mbps',
      transport: '拱北口岸步行过关到澳门，高铁到广州 1 小时',
      bestFor: '想住海边又要城市配套的人',
      watch: '台风季；夏天湿热' },
    { id: 'haikou', name: '海口', region: '海南省 · 海口市', cat: 'coast', climate: 'tropical', dt: -1,
      palette: 'brightDay', cost: 4200, net: 170, altitude: 15, crowd: '中', best: [10, 11, 0, 1],
      tagline: '骑楼、老爸茶与不着急的省会',
      tags: ['冬天温暖', '比三亚便宜', '老爸茶', '湿热'],
      intro: '海口比三亚更生活：房租低一档，早茶、夜市、骑楼老街都在市区，冬天温暖，适合整个冬天住下来。',
      climateNote: '热带海洋性，冬季温暖，5–9 月湿热多雨',
      rent: '市区一居 ¥1,800–3,200',
      netNote: '城区 200–500 Mbps',
      transport: '美兰机场通全国，环岛高铁到三亚 1.5 小时',
      bestFor: '想过冬、预算比三亚紧的人',
      watch: '台风季（7–10 月）；夏天湿热' },
    { id: 'nanning', name: '南宁', region: '广西壮族自治区 · 南宁市', cat: 'city', climate: 'south', dt: -1,
      palette: 'grassDay', cost: 3200, net: 200, altitude: 80, crowd: '中', best: [2, 3, 10, 11],
      tagline: '绿城、老友粉与东南亚的门口',
      tags: ['绿化好', '成本低', '东盟门户', '夏天长'],
      intro: '南宁是最绿的省会之一：城市被树包着，物价低，动车三小时到广州，去东南亚也方便。',
      climateNote: '亚热带，夏季长且湿热，冬季温和',
      rent: '青秀一居 ¥1,500–2,600',
      netNote: '城区 200–500 Mbps',
      transport: '高铁到广州 3 小时、到昆明 5 小时',
      bestFor: '预算敏感、想住南方的人',
      watch: '夏天湿热漫长；回南天潮湿' },
    { id: 'guilin', name: '桂林', region: '广西壮族自治区 · 桂林市', cat: 'lake', climate: 'south', dt: -2,
      palette: 'dawnMist', cost: 3200, net: 170, altitude: 150, crowd: '中', best: [3, 4, 9, 10],
      tagline: '山水是城市的一部分，不只是景点',
      tags: ['山水', '漓江', '淡季便宜', '多雨'],
      intro: '桂林把山水装进了日常：两江四湖、象鼻山就在城里，往阳朔骑车一小时，淡季住宿便宜，节奏慢。',
      climateNote: '亚热带，雨量多，夏热冬温',
      rent: '市区一居 ¥1,300–2,400',
      netNote: '城区 150–400 Mbps',
      transport: '高铁到广州 2.5 小时、到贵阳 2 小时',
      bestFor: '喜欢山水、能接受多雨的人',
      watch: '雨季（4–6 月）漓江水浑；旺季人多' },
    { id: 'hongkong', name: '香港', region: '香港特别行政区', cat: 'city', climate: 'south', dt: 1,
      palette: 'cityNight', cost: 12000, net: 300, altitude: 20, crowd: '高', best: [10, 11, 2, 3],
      tagline: '山海之间的高密度，效率与自然共存',
      tags: ['效率高', '郊野公园', '房租极高', '空间小'],
      intro: '香港的旅居体验很极端：房租全球最贵之一，但地铁、医疗、郊野公园（占土地四成）都在线，一小时能上山下海。',
      climateNote: '亚热带，夏季炎热潮湿，冬季温和，5–9 月台风',
      rent: '港岛一居 HKD 15,000–25,000',
      netNote: '城区 500–1000 Mbps',
      transport: '地铁与巴士覆盖极好，机场通全球',
      bestFor: '收入较高、需要国际连接的人',
      watch: '房租与生活成本；居住空间普遍很小' },
    { id: 'macau', name: '澳门', region: '澳门特别行政区', cat: 'city', climate: 'south', dt: 1,
      palette: 'goldenHour', cost: 9000, net: 260, altitude: 10, crowd: '中', best: [10, 11, 2, 3],
      tagline: '半小时能走完的老城与葡式生活',
      tags: ['老城', '步行友好', '成本高', '地方很小'],
      intro: '澳门很小但密度极高：老城、教堂、茶餐厅混在一起，步行走完主要街区只要一小时，生活成本高但节奏慢。',
      climateNote: '亚热带，夏季湿热，冬季温和',
      rent: '一居 MOP 8,000–14,000',
      netNote: '城区 300–1000 Mbps',
      transport: '步行过关到珠海，公交网络密',
      bestFor: '喜欢小城步行生活、需要跨境便利的人',
      watch: '地方太小容易腻；房租高' },

    // ---------------- 西南 ----------------
    { id: 'chengdu', name: '成都', region: '四川省 · 成都市', cat: 'city', climate: 'central', dt: -1,
      palette: 'springRain', cost: 4500, net: 230, altitude: 500, crowd: '高', best: [3, 4, 9, 10],
      tagline: '茶馆、火锅，和一只不着急的熊猫',
      tags: ['茶馆文化', '成本适中', '阴天多', '一小时能进山'],
      intro: '成都生活成本在省会里算低，节奏慢，茶馆和火锅构成日常；阴天多但胜在稳定，周边一小时能进山。',
      climateNote: '亚热带湿润，阴天多日照少，夏天闷热，冬天阴冷',
      rent: '市区一居 ¥2,000–3,500',
      netNote: '城区 300–600 Mbps',
      transport: '双机场 + 高铁，到重庆 1.5 小时',
      bestFor: '喜欢慢生活、预算中等、爱吃的人',
      watch: '冬天阴冷且无暖气；日照少，注意情绪' },
    { id: 'leshan', name: '乐山', region: '四川省 · 乐山市', cat: 'mountain', climate: 'central',
      palette: 'dawnMist', cost: 2600, net: 170, altitude: 400, crowd: '低', best: [3, 4, 9, 10],
      tagline: '大佛、峨眉与最会吃的川南小城',
      tags: ['大佛', '峨眉山', '美食', '成本低'],
      intro: '乐山是大佛与峨眉山的门口，城市本身极好吃：钵钵鸡、甜皮鸭、跷脚牛肉，物价低，去成都高铁一小时。',
      climateNote: '亚热带湿润，多雨多雾',
      rent: '市区一居 ¥1,100–2,000',
      netNote: '城区 150–400 Mbps',
      transport: '高铁到成都 1 小时',
      bestFor: '喜欢山与美食、想低成本长住的人',
      watch: '雨雾天多；峨眉山上温差大' },
    { id: 'guiyang', name: '贵阳', region: '贵州省 · 贵阳市', cat: 'city', climate: 'southwest', dt: -2,
      palette: 'springRain', cost: 3300, net: 200, altitude: 1100, crowd: '中', best: [5, 6, 7, 8],
      tagline: '夏天不用空调的省会',
      tags: ['夏天凉爽', '成本低', '阴雨多', '多山'],
      intro: '贵阳是南方少有的夏天不用空调的省会：海拔 1100 米，7 月均温 24℃，物价低，周边全是喀斯特。',
      climateNote: '亚热带高原，夏季凉爽，冬季阴冷多雾',
      rent: '市区一居 ¥1,500–2,600',
      netNote: '城区 200–500 Mbps',
      transport: '高铁到昆明 2 小时、到广州 4.5 小时',
      bestFor: '夏天怕热、预算不高的人',
      watch: '冬季阴冷潮湿、日照少；地形起伏大' },
    { id: 'anshun', name: '安顺', region: '贵州省 · 安顺市', cat: 'mountain', climate: 'southwest', dt: -1,
      palette: 'dawnMist', cost: 2600, net: 160, altitude: 1300, crowd: '低', best: [5, 6, 7, 8],
      tagline: '黄果树、屯堡与石头砌的村子',
      tags: ['瀑布', '喀斯特', '夏天凉爽', '成本低'],
      intro: '安顺是黄果树瀑布的门户，还有屯堡、龙宫这些喀斯特奇观，夏天凉爽，住宿便宜，适合住一段时间慢慢逛。',
      climateNote: '亚热带高原，夏季凉爽，冬无严寒',
      rent: '市区一居 ¥1,100–2,000',
      netNote: '城区 100–300 Mbps',
      transport: '高铁到贵阳 30 分钟',
      bestFor: '喜欢瀑布与喀斯特、夏天避暑的人',
      watch: '景点分散，没车不便；雨季水量大反而更壮观' },
    { id: 'kunming', name: '昆明', region: '云南省 · 昆明市', cat: 'city', climate: 'southwest', dt: 1,
      palette: 'brightDay', cost: 4000, net: 200, altitude: 1900, crowd: '中', best: [2, 3, 9, 10],
      tagline: '四季如春，日照好得不像话',
      tags: ['四季如春', '日照足', '鲜花便宜', '干燥'],
      intro: '昆明是国内气候最稳的省会之一：全年温差小、日照足、花便宜，周边一小时内有大湖与石林，适合长期住。',
      climateNote: '低纬高原，四季如春，紫外线强，雨季集中在 6–8 月',
      rent: '市区一居 ¥1,800–3,000',
      netNote: '城区 200–500 Mbps',
      transport: '长水机场通全国，高铁到大理 2 小时',
      bestFor: '想要稳定气候、怕冷又怕热的人',
      watch: '紫外线强要防晒；海拔 1900 米，初到可能轻微不适' },
    { id: 'lijiang', name: '丽江', region: '云南省 · 丽江市', cat: 'mountain', climate: 'southwest', dt: -3,
      palette: 'goldenHour', cost: 3800, net: 180, altitude: 2400, crowd: '中', best: [3, 4, 10, 11],
      tagline: '雪山、古城与一间能看星星的院子',
      tags: ['雪山', '星空', '民宿多', '海拔高'],
      intro: '丽江海拔 2400 米，晴天多、星空好，古城周边民宿极多；淡季房租便宜，是很多人第一次长期旅居的地方。',
      climateNote: '高原气候，昼夜温差大，紫外线强，11–4 月干燥晴朗',
      rent: '古城周边一居 ¥1,800–3,200',
      netNote: '城区 200–400 Mbps',
      transport: '三义机场通多地，高铁到昆明 3.5 小时',
      bestFor: '喜欢雪山与星空、能适应高海拔的人',
      watch: '海拔 2400 米；旺季古城极挤、房租翻倍' },
    { id: 'lhasa', name: '拉萨', region: '西藏自治区 · 拉萨市', cat: 'mountain', climate: 'plateau', dt: 1,
      palette: 'clearNight', cost: 4200, net: 150, altitude: 3650, crowd: '低', best: [5, 6, 7, 8, 9],
      tagline: '日光之城，一年三千小时的太阳',
      tags: ['日照强烈', '高原', '信仰氛围', '冬季冷'],
      intro: '拉萨的日常是：白天太阳晒得暖，夜里冷，转经的人绕着八廓街。适合身体适应良好、想安静待一段的人。',
      climateNote: '高原温带，昼夜温差大，紫外线极强，冬春干燥风大',
      rent: '城关区一居 ¥2,000–3,500',
      netNote: '城区 100–300 Mbps',
      transport: '贡嘎机场通多地，青藏铁路可达',
      bestFor: '身体适应好、喜欢高原与安静的人',
      watch: '海拔 3650 米，前三天别剧烈活动；感冒要及时下撤' },
    { id: 'nyingchi', name: '林芝', region: '西藏自治区 · 林芝市', cat: 'mountain', climate: 'plateau',
      palette: 'dawnMist', cost: 4000, net: 140, altitude: 3000, crowd: '低', best: [3, 4, 9, 10],
      tagline: '西藏的江南，桃花与雅鲁藏布',
      tags: ['桃花', '峡谷', '海拔相对低', '交通有限'],
      intro: '林芝是西藏海拔最低、最湿润的地方：3–4 月桃花开满山谷，雅鲁藏布大峡谷在门口，也常被当作进藏适应地。',
      climateNote: '高原温带湿润，雨量较多，冬春干冷',
      rent: '市区一居 ¥1,800–3,000',
      netNote: '城区 100–300 Mbps',
      transport: '米林机场通部分城市，以公路为主',
      bestFor: '想看桃花与峡谷、能接受交通不便的人',
      watch: '海拔 3000 米；景点分散且远，建议租车' },

    // ---------------- 西北 ----------------
    { id: 'xian', name: '西安', region: '陕西省 · 西安市', cat: 'city', climate: 'north', dt: 1,
      palette: 'cityNight', cost: 4200, net: 230, altitude: 400, crowd: '高', best: [3, 4, 9, 10],
      tagline: '城墙、面食与一千年的都城',
      tags: ['古都', '面食', '高校多', '冬天有霾'],
      intro: '西安是国内旅居热度最高的古城之一：城墙、博物馆、回民街，高校多、地铁全，房租比南京低。',
      climateNote: '温带季风，四季分明，夏季炎热，冬季干冷有霾',
      rent: '雁塔一居 ¥2,000–3,200',
      netNote: '城区 300–600 Mbps',
      transport: '咸阳机场 + 米字高铁，到成都 3 小时',
      bestFor: '喜欢历史、需要高校资源、预算中等的人',
      watch: '冬季雾霾；7–8 月炎热' },
    { id: 'yanan', name: '延安', region: '陕西省 · 延安市', cat: 'old', climate: 'north', dt: -2,
      palette: 'desertSunset', cost: 2500, net: 150, altitude: 1000, crowd: '低', best: [5, 6, 7, 8],
      tagline: '黄土高原上的窑洞与枣园',
      tags: ['黄土高原', '窑洞', '夏天凉爽', '交通一般'],
      intro: '延安的黄土高原景观很独特：窑洞、宝塔山、壶口瀑布都在一两小时圈内，夏天凉爽，冬天干燥寒冷。',
      climateNote: '温带大陆性，夏季凉爽，冬季干冷',
      rent: '市区一居 ¥1,000–1,800',
      netNote: '城区 100–300 Mbps',
      transport: '高铁到西安 2 小时',
      bestFor: '想体验黄土高原、夏天避暑的人',
      watch: '冬季干冷风大；城市旅游属性强于生活属性' },
    { id: 'lanzhou', name: '兰州', region: '甘肃省 · 兰州市', cat: 'old', climate: 'northwest',
      palette: 'cityNight', cost: 2800, net: 170, altitude: 1500, crowd: '中', best: [4, 5, 8, 9],
      tagline: '一条河穿城，一碗面顶一天',
      tags: ['黄河', '牛肉面', '成本低', '干燥'],
      intro: '兰州是黄河唯一穿城而过的省会：牛肉面、水车、黄河边散步；往西是河西走廊，往南是甘南草原。',
      climateNote: '温带大陆性，干燥少雨，昼夜温差大',
      rent: '城关一居 ¥1,200–2,200',
      netNote: '城区 150–400 Mbps',
      transport: '高铁到西安 3 小时、到西宁 1 小时',
      bestFor: '喜欢西北、预算敏感的人',
      watch: '空气干燥；3–4 月沙尘要备口罩' },
    { id: 'xining', name: '西宁', region: '青海省 · 西宁市', cat: 'city', climate: 'plateau', dt: -1,
      palette: 'grassDay', cost: 3200, net: 180, altitude: 2200, crowd: '中', best: [5, 6, 7, 8],
      tagline: '夏天最凉快的省会',
      tags: ['夏天凉爽', '高原', '清真美食', '干燥'],
      intro: '西宁海拔 2200 米，是国内夏天最凉爽的省会之一：7 月均温 18℃，青海湖、塔尔寺都在一日圈内。',
      climateNote: '高原大陆性，夏季凉爽，冬季寒冷干燥，日照强',
      rent: '市区一居 ¥1,400–2,400',
      netNote: '城区 150–400 Mbps',
      transport: '曹家堡机场通多地，高铁到兰州 1 小时',
      bestFor: '夏天想躲热、能适应海拔的人',
      watch: '海拔 2200 米；紫外线与干燥都要防' },
    { id: 'haixi', name: '海西州', region: '青海省 · 海西州', cat: 'desert', climate: 'plateau', dt: -1,
      palette: 'desertSunset', cost: 3400, net: 120, altitude: 2800, crowd: '低', best: [6, 7, 8],
      tagline: '盐湖、雅丹与最像外星的地貌',
      tags: ['盐湖', '雅丹', '自驾', '补给少'],
      intro: '海西州包括茶卡盐湖、格尔木、水上雅丹，是自驾者的天堂；城镇间距离远、补给点少，适合短期停留与穿越。',
      climateNote: '高原荒漠，极端干燥，昼夜温差极大',
      rent: '德令哈/格尔木一居 ¥1,500–2,500',
      netNote: '城区 100–200 Mbps，公路沿线信号弱',
      transport: '格尔木机场 + 青藏铁路，强烈建议自驾',
      bestFor: '自驾旅行者、摄影师',
      watch: '补给点间距大，先加满油；海拔高且极干燥' },
    { id: 'yinchuan', name: '银川', region: '宁夏回族自治区 · 银川市', cat: 'city', climate: 'northwest',
      palette: 'grassDay', cost: 2900, net: 180, altitude: 1100, crowd: '低', best: [5, 6, 8, 9],
      tagline: '塞上湖城，一半是湿地一半是大漠',
      tags: ['湖泊湿地', '西夏文化', '成本低', '干燥'],
      intro: '银川很特别：城里有大量湖泊湿地，出城一小时就是沙湖与西夏王陵，物价低，夏天不闷。',
      climateNote: '温带大陆性，干燥少雨，昼夜温差大，夏季不闷',
      rent: '市区一居 ¥1,200–2,200',
      netNote: '城区 150–400 Mbps',
      transport: '河东机场通多地，高铁到西安 3 小时',
      bestFor: '喜欢西部与湿地、预算敏感的人',
      watch: '春季沙尘；冬天冷且干燥' },
    { id: 'zhongwei', name: '中卫', region: '宁夏回族自治区 · 中卫市', cat: 'desert', climate: 'northwest', dt: 1,
      palette: 'desertSunset', cost: 2600, net: 160, altitude: 1200, crowd: '低', best: [5, 6, 8, 9],
      tagline: '沙坡头：黄河与沙漠挨在一起',
      tags: ['沙漠', '黄河', '星空', '夏季旺季'],
      intro: '中卫有沙坡头这种少见的组合：黄河、沙漠、绿洲相隔几百米，还有枸杞田和很适合拍星空的夜空。',
      climateNote: '温带大陆性干旱，昼夜温差大',
      rent: '市区一居 ¥1,100–1,900',
      netNote: '城区 100–300 Mbps',
      transport: '高铁到银川 2 小时、到兰州 2.5 小时',
      bestFor: '想看沙漠与黄河、拍星空的人',
      watch: '夏季旺季住宿贵；日夜温差可达 15℃' },
    { id: 'urumqi', name: '乌鲁木齐', region: '新疆维吾尔自治区 · 乌鲁木齐市', cat: 'city', climate: 'northCold', dt: -3,
      palette: 'cityNight', cost: 3800, net: 200, altitude: 800, crowd: '中', best: [6, 7, 8],
      tagline: '离海最远的省会，也是新疆的入口',
      tags: ['新疆门户', '时差感', '干燥', '安检较多'],
      intro: '乌鲁木齐是进出新疆的枢纽：大巴扎、博物馆、天山天池一小时可达，晚上十点天还亮着，作息比内地晚两小时。',
      climateNote: '中温带大陆性，冬季严寒，夏季炎热干燥，昼夜温差大',
      rent: '市区一居 ¥1,600–2,800',
      netNote: '城区 200–500 Mbps',
      transport: '地窝堡机场通全国，高铁到兰州约 9 小时',
      bestFor: '想以城市为基地玩新疆、喜欢干燥气候的人',
      watch: '与内地有 2 小时时差感；安检较多，随身带身份证' }
  ];

  /* ============================================================
     实拍短片台账
     ------------------------------------------------------------
     由 tools/stock.py 生成：Pixabay 免版权素材，4 倍速、去黑边、限制到 2.2MB 以内。
     署名（credit）请保留 —— 素材站条款要求标注作者；大理那一条是用户自己拍的。
     想换某座城市的片子：重跑 tools/stock.py --city <id> 即可，台账会自动更新。
     ============================================================ */
  const CITY_VIDEOS = {
    dali: { label: '实拍短片 · 洱海日出', credit: '视频素材：用户提供', focus: '18% 50%' },
    anji: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Matthias_Groeneveld' },
    anshun: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：OleksandrPidvalnyi' },
    beijing: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Life-Of-Vids' },
    changchun: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：bellergy' },
    changsha: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：D-GM' },
    chengde: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：supercreat' },
    chengdu: { label: '实拍短片 · 大熊猫', credit: 'Pixabay · 摄影：素君' },
    chongqing: { label: '实拍短片 · 江与楼群', credit: 'Pixabay · 摄影：D-GM' },
    dalian: { label: '实拍短片 · 海边礁石', credit: 'Pixabay · 摄影：Samu_el' },
    daocheng: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：5239640' },
    datong: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：supercreat' },
    dunhuang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Espace-Aventures' },
    fuzhou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：JamesBarley1985' },
    guangzhou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：EdgarAllanPoets' },
    guilin: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：adege' },
    guiyang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：ChristianBodhi' },
    haikou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Preditorcuts' },
    haixi: { label: '实拍短片 · 茶卡盐湖', credit: 'Pixabay · 摄影：newtjitsu' },
    hangzhou: { label: '实拍短片 · 湖上公路', credit: '实拍素材：用户提供（免版权）', focus: '50% 40%' },
    harbin: { label: '实拍短片 · 雪夜城市', credit: 'Pixabay · 摄影：Ibrahim1980' },
    hefei: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：NickyPe' },
    hohhot: { label: '实拍短片 · 草原与云', credit: 'Pixabay · 摄影：Kanenori' },
    hongkong: { label: '实拍短片 · 维港夜色', credit: 'Pixabay · 摄影：bellergy' },
    hualien: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：javlemus' },
    huangshan: { label: '实拍短片 · 云海松林', credit: 'Pixabay · 摄影：messden' },
    hulunbuir: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Pauline_17' },
    jilin: { label: '实拍短片 · 雾凇与冰湖', credit: 'Pixabay · 摄影：u_ihuef93ase' },
    jinan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：MilanWulf' },
    jingdezhen: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Alanchevereau' },
    kashgar: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：NTbk' },
    kunming: { label: '实拍短片 · 滇池西山', credit: 'Pixabay · 摄影：pengpengtai' },
    lanzhou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：3593622' },
    leshan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：素君' },
    lhasa: { label: '实拍短片 · 高原航拍', credit: 'Pixabay · 摄影：jiangzihao' },
    lijiang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：vecax' },
    luoyang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：rocky789' },
    macau: { label: '实拍短片 · 澳门天际线', credit: 'Pixabay · 摄影：Red_Code_8' },
    mudanjiang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：RuslanSikunov' },
    nanchang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：u_l8lxvpd94w' },
    nanjing: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：caromaria' },
    nanning: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：ghasoub' },
    nyingchi: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：KIMDAEJEUNG' },
    qingdao: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Mario_Krimer' },
    sanya: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Relaxing_Guru' },
    shanghai: { label: '实拍短片 · 陆家嘴清晨', credit: 'Pixabay · 摄影：jeremy888' },
    shenyang: { label: '实拍短片 · 雪夜街道', credit: 'Pixabay · 摄影：Matthias_Groeneveld' },
    shijiazhuang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Expatsiam' },
    suzhou: { label: '实拍短片 · 园林锦鲤', credit: 'Pixabay · 摄影：Dieter_G' },
    taipei: { label: '实拍短片 · 101 日落', credit: 'Pixabay · 摄影：MagicTV' },
    taiyuan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：bellergy' },
    tianjin: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Whitechappel79' },
    urumqi: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：ertugrulgazikul' },
    wanning: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：babass75' },
    weizhou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Artvan93' },
    wuhan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Coverr-Free-Footage' },
    wuyuan: { label: '实拍短片 · 油菜花田', credit: 'Pixabay · 摄影：书生李尔基' },
    xiamen: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Mario_Krimer' },
    xian: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：prescott10' },
    xining: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Matthias_Groeneveld' },
    yanan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：b_aytar' },
    yangshuo: { label: '实拍短片 · 漓江峰林', credit: 'Pixabay · 摄影：书生李尔基' },
    yichang: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：videohive' },
    yinchuan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：ZAIDoopro' },
    zhangjiajie: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：GreenCamera-Official' },
    zhengzhou: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Pexels' },
    zhongwei: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：Espace-Aventures' },
    zhoushan: { label: '实拍氛围短片', credit: 'Pixabay · 摄影：kastaniubrunn' },
    zhuhai: { label: '实拍短片 · 湾岸夜景', credit: 'Pixabay · 摄影：牛大群' }
  };

  /* 实拍存疑、先改回程序化画面的城市。

     69 张封面逐张看过之后挑出来的，判据只有一条：
     **这条素材能不能当这座城市的「画面」**。
     被撤下来的都是特写/物件/人物，或者明显不是该地
     （苏州是切菜的手、济南是冰晶、杭州只是水面、阳朔是瀑布而不是峰林…）。

     素材站里的中国内容太少，自动筛选（关键词 + 标签 + 运动量）只能做到
     「不是明显错的 + 画面在动」，判断「像不像这座城市」还是得人眼过一遍。
     等有真正合适的素材，把 id 从这里删掉就能换回实拍；
     反过来发现哪条不合适，加进来即可。 */
  const CITY_VIDEOS_HOLD = [
    'chengde',    // 承德：Pixabay 搜不到避暑山庄/外八庙，命中的都是茶席、书法特写
    'datong',     // 大同：云冈石窟在库里零结果（「yungang grottoes」无匹配）
    'jinan',      // 济南：搜「jinan china」返回茶道、白菜特写，没有泉水素材
    'kashgar',    // 喀什：搜「kashgar」零结果，搜老城/巴扎全是欧洲与南亚素材
    'lanzhou',    // 兰州：没有黄河穿城素材，命中的是散景光斑
    'leshan',     // 乐山：搜大佛返回颂钵、泰国佛寺
    'lijiang',    // 丽江：搜「lijiang china」返回茶诗、白菜、首尔车流
    'nanning',    // 南宁：没有绿城素材，命中的是海滩与首尔车流
    'taiyuan',    // 太原：古建素材命中的是威尼斯、罗马尼亚教堂
    'xian',       // 西安：城墙/钟楼零匹配，返回耶路撒冷城门与中餐馆
    'xining',     // 西宁：青海湖零匹配，返回班夫湖、雪地汽车
    'yanan'       // 延安：黄土高原窑洞零匹配，返回越南梯田
  ];

  /** 把台账里的短片挂到城市上（没有台账或存疑的城市走绘制兜底） */
  function withVideo(city) {
    if (CITY_VIDEOS_HOLD.indexOf(city.id) >= 0) return city;
    const v = CITY_VIDEOS[city.id];
    if (!v) return city;
    return Object.assign({}, city, {
      video: Object.assign({
        src: 'assets/video/' + city.id + '.mp4',
        poster: 'assets/video/' + city.id + '-poster.jpg',
        focus: '50% 50%'
      }, v)
    });
  }

  /* ============================================================
     代表景点（用于卡片悬停浮现与"景点"筛选）
     口径：每城 3 个，选"可以反复去、不是一次性打卡"的地方 —— 旅居视角，不是观光榜首。
     ============================================================ */
  const ATTRACTIONS = {
    dali: '苍山 · 洱海 · 沙溪古镇',
    yangshuo: '漓江 · 遇龙河 · 兴坪古镇',
    sanya: '亚龙湾 · 蜈支洲岛 · 天涯海角',
    harbin: '中央大街 · 圣索菲亚教堂 · 冰雪大世界',
    dunhuang: '莫高窟 · 鸣沙山月牙泉 · 雅丹魔鬼城',
    hangzhou: '西湖 · 灵隐寺 · 龙井村',
    daocheng: '仙乃日 · 牛奶海 · 洛绒牛场',
    weizhou: '鳄鱼山 · 五彩滩 · 滴水丹屏',
    hulunbuir: '莫尔道嘎 · 额尔古纳湿地 · 呼伦湖',
    wuyuan: '篁岭 · 江湾 · 月亮湾',
    chongqing: '洪崖洞 · 长江索道 · 武隆天生三桥',
    suzhou: '拙政园 · 平江路 · 虎丘',
    wanning: '日月湾 · 石梅湾 · 兴隆植物园',
    qingdao: '栈桥 · 八大关 · 崂山',
    anji: '中国大竹海 · 云上草原 · 江南天池',
    kashgar: '喀什老城 · 香妃园 · 帕米尔高原',
    beijing: '故宫 · 长城 · 颐和园',
    tianjin: '五大道 · 瓷房子 · 天津之眼',
    shijiazhuang: '正定古城 · 赵州桥 · 苍岩山',
    chengde: '避暑山庄 · 外八庙 · 塞罕坝',
    taiyuan: '晋祠 · 天龙山 · 山西博物院',
    datong: '云冈石窟 · 悬空寺 · 古城墙',
    shenyang: '沈阳故宫 · 张氏帅府 · 北陵公园',
    dalian: '星海广场 · 滨海路 · 老虎滩',
    changchun: '净月潭 · 伪满皇宫 · 长影世纪城',
    jilin: '雾凇岛 · 松花湖 · 北山公园',
    mudanjiang: '中国雪乡 · 镜泊湖 · 横道河子',
    hohhot: '大召寺 · 内蒙古博物院 · 希拉穆仁草原',
    shanghai: '外滩 · 武康路 · 豫园',
    nanjing: '中山陵 · 夫子庙 · 明孝陵',
    zhoushan: '普陀山 · 东极岛 · 嵊泗列岛',
    hefei: '三河古镇 · 巢湖 · 安徽博物院',
    huangshan: '黄山 · 宏村 · 西递',
    fuzhou: '三坊七巷 · 鼓山 · 平潭岛',
    xiamen: '鼓浪屿 · 环岛路 · 南普陀寺',
    nanchang: '滕王阁 · 八一起义纪念馆 · 梅岭',
    jingdezhen: '陶溪川 · 古窑博览区 · 三宝村',
    jinan: '趵突泉 · 大明湖 · 千佛山',
    taipei: '故宫博物院 · 象山 · 北投温泉',
    hualien: '太鲁阁 · 七星潭 · 清水断崖',
    zhengzhou: '少林寺 · 河南博物院 · 黄河风景区',
    luoyang: '龙门石窟 · 白马寺 · 老君山',
    wuhan: '黄鹤楼 · 东湖 · 湖北省博物馆',
    yichang: '三峡大坝 · 清江画廊 · 三峡人家',
    changsha: '岳麓山 · 橘子洲 · 湖南省博物馆',
    zhangjiajie: '武陵源 · 天门山 · 袁家界',
    chengdu: '宽窄巷子 · 武侯祠 · 青城山',
    leshan: '乐山大佛 · 峨眉山 · 罗城古镇',
    guiyang: '甲秀楼 · 青岩古镇 · 黔灵山',
    anshun: '黄果树瀑布 · 龙宫 · 天龙屯堡',
    kunming: '滇池 · 石林 · 翠湖',
    lijiang: '玉龙雪山 · 丽江古城 · 束河古镇',
    lhasa: '布达拉宫 · 大昭寺 · 八廓街',
    nyingchi: '雅鲁藏布大峡谷 · 南迦巴瓦峰 · 桃花沟',
    xian: '兵马俑 · 城墙 · 大雁塔',
    yanan: '宝塔山 · 壶口瀑布 · 枣园',
    lanzhou: '中山桥 · 白塔山 · 甘肃省博物馆',
    xining: '塔尔寺 · 青海湖 · 东关清真大寺',
    haixi: '茶卡盐湖 · 水上雅丹 · 察尔汗盐湖',
    yinchuan: '西夏王陵 · 镇北堡影视城 · 沙湖',
    zhongwei: '沙坡头 · 黄河宿集 · 寺口子',
    urumqi: '天山天池 · 国际大巴扎 · 南山牧场',
    nanning: '青秀山 · 中山路夜市 · 广西民族博物馆',
    guilin: '象鼻山 · 两江四湖 · 龙脊梯田',
    hongkong: '太平山顶 · 西贡 · 大屿山',
    macau: '大三巴 · 路环 · 澳门塔',
    haikou: '骑楼老街 · 假日海滩 · 火山口公园',
    zhuhai: '情侣路 · 外伶仃岛 · 圆明新园',
    guangzhou: '沙面 · 陈家祠 · 白云山'
  };

  function withAttractions(city) {
    return Object.assign({}, city, { attractions: ATTRACTIONS[city.id] || '' });
  }

  /* ============================================================
     特色奶茶店（卡片悬停浮现 + 首屏"奶茶"筛选用）
     ⚠️ 初稿口径：门店密度（milkTeaCount，家/km²）还没跑高德 POI，
        这里先按城市类型给一个"密度档位"，代表品牌只填能确定的本地品牌。
        上线前用 POI 门店密度替换档位，品牌换成 milkTeaBrands 字段。
     ============================================================ */
  const MILK_TEA_TIER = { city: 3, coast: 2, old: 2, lake: 1, grass: 0, snow: 0, wild: 0 };
  const MILK_TEA_LABEL = ['少见', '一般', '多', '很多'];
  const MILK_TEA_BRANDS = {
    changsha: '茶颜悦色、果呀呀',
    zhengzhou: '蜜雪冰城',
    chengdu: '茶百道、书亦烧仙草',
    kunming: '霸王茶姬',
    shenzhen: '奈雪の茶',
    shanghai: '沪上阿姨',
    nanning: '阿嬤手作',
    guiyang: '宜北町',
    lanzhou: '放哈'
  };

  function withMilkTea(city) {
    const tier = MILK_TEA_TIER[city.cat] != null ? MILK_TEA_TIER[city.cat] : 1;
    return Object.assign({}, city, {
      milkTea: {
        tier: tier,
        label: MILK_TEA_LABEL[tier],
        brands: MILK_TEA_BRANDS[city.id] || ''
      }
    });
  }

  /* ============================================================
     景点类型（首屏"旅游景点"筛选）
     按关键词在「代表景点 + 标签 + 一句话气质」里匹配，覆盖到就行，不追求互斥。
     ============================================================ */
  const SPOT_TYPES = [
    { id: 'all', name: '不限景点' },
    { id: 'old', name: '古镇古城', re: /古镇|古城|老城|老街|巷子|西街/ },
    { id: 'water', name: '江海湖泊', re: /海|湖|江|河|岛|湾/ },
    { id: 'mountain', name: '山野雪山', re: /山|峰|雪|草原|峡谷|森林/ },
    { id: 'temple', name: '寺庙古迹', re: /寺|塔|宫|石窟|古建|遗址|园林|关/ },
    { id: 'museum', name: '博物馆', re: /博物馆|博物院|美术馆/ },
    { id: 'night', name: '夜市市集', re: /夜市|市集|小吃|美食|老街/ },
    { id: 'hotspring', name: '温泉', re: /温泉/ }
  ];

  const ALL_CITIES = CITIES.concat(CITY_SEEDS.map(buildCity))
    .map(withVideo).map(withAttractions).map(withMilkTea);

  /* ============================================================
     种子社区内容
     ============================================================ */
  const POSTS = [
    {
      id: 'p1', city: 'dali', topic: 'buddy', author: 'youyou', hoursAgo: 2, likes: 42,
      text: '11 月中旬到大理，打算在才村住两个月。白天写代码，傍晚骑车去龙龛码头看日落，有人一起吗？我这边可以带一辆备用自行车。',
      replies: [
        { author: 'linxiaoman', hoursAgo: 1, text: '同时间在！我从杭州远程，正好想找人一起骑车。' },
        { author: 'buding', hoursAgo: 1, text: '才村的日落骑到龙龛大概 25 分钟，逆风的时候会累一点。' }
      ]
    },
    {
      id: 'p2', city: 'wanning', topic: 'daily', author: 'kiwi', hoursAgo: 5, likes: 88,
      text: '日月湾新手周记：前三天基本被浪按住，第四天站起来两秒。教练阿海 ¥300 / 3 次课，很实在，不推销装备。附一条心得——别在落潮的时候硬下水。',
      replies: [
        { author: 'mia', hoursAgo: 4, text: '两秒也是站起来！我下个月过去，先约上。' }
      ]
    },
    {
      id: 'p3', city: 'anji', topic: 'work', author: 'tangyuan', hoursAgo: 8, likes: 64,
      text: '安吉的数字游民社区工位实测：下行 320M，上行 40M，视频会议全天稳。缺点是从县城过去要打车 25 分钟，没车真的不方便。适合闭关赶项目。',
      replies: [
        { author: 'laozhou', hoursAgo: 6, text: '这个网速比我青岛家里还快。停车方便吗？' },
        { author: 'tangyuan', hoursAgo: 5, text: '社区有免费车位，自驾最省事。' }
      ]
    },
    {
      id: 'p4', city: 'hangzhou', topic: 'daily', author: 'linxiaoman', hoursAgo: 11, likes: 53,
      text: '在杭州旅居第 5 个月，最想说的一句：杭州的好不在西湖。在九溪的桂花、满觉陇的雨天、龙井村的早晨。另外梅雨季务必买除湿机，不然鞋子会发霉。',
      replies: []
    },
    {
      id: 'p5', city: 'harbin', topic: 'pit', author: 'hal', hoursAgo: 14, likes: 71,
      text: '哈尔滨 1 月租房避坑：不要租老楼一层，暖气再足地面也是凉的。找带地暖的新公寓，中央大街周边 ¥2,500 能租到很不错的。电费另算，取暖季一个月可能三四百。',
      replies: [
        { author: 'guzi', hoursAgo: 12, text: '这个提醒太实用了，我本来就想图便宜租一层。' }
      ]
    },
    {
      id: 'p6', city: 'yangshuo', topic: 'guide', author: 'xiaoye', hoursAgo: 18, likes: 47,
      text: '阳朔住哪最舒服？西街太吵，我最后选了兴坪：早上推开窗就是漓江的雾，走路五分钟到江边。短住建议共享单车而不是电动车，县城和村子之间骑一个小时就够。',
      replies: [
        { author: 'laoyu', hoursAgo: 16, text: '兴坪的清晨确实好，就是吃饭选择少一点。' }
      ]
    },
    {
      id: 'p7', city: 'chongqing', topic: 'daily', author: 'daxiong', hoursAgo: 22, likes: 96,
      text: '重庆的坡比想象中狠，千万别按地图上的距离估时间。住观音桥比解放碑舒服：晚上安静、吃的也地道、房租还便宜三分之一。',
      replies: [
        { author: 'youyou', hoursAgo: 20, text: '观音桥到江北嘴通勤大概多久？' },
        { author: 'daxiong', hoursAgo: 19, text: '地铁 20 分钟，但换乘要爬不少台阶。' }
      ]
    },
    {
      id: 'p8', city: 'qingdao', topic: 'buddy', author: 'laozhou', hoursAgo: 26, likes: 31,
      text: '9 月在青岛，想找人一起骑车走沿海公路，从栈桥到石老人。周中人少风也稳，周末人山人海。有愿意一起的回复我。',
      replies: []
    },
    {
      id: 'p9', city: 'dunhuang', topic: 'guide', author: 'buding', hoursAgo: 30, likes: 58,
      text: '敦煌最好的时间是 9 月下旬：白天不晒，晚上还能穿短袖看星星。鸣沙山一定傍晚去，日落比白天好看十倍，门票当日进一次但可以待到很晚。',
      replies: [
        { author: 'shanque', hoursAgo: 28, text: '补一句：沙漠昼夜温差大，晚上记得带外套。' }
      ]
    },
    {
      id: 'p10', city: 'daocheng', topic: 'pit', author: 'shanque', hoursAgo: 34, likes: 112,
      text: '稻城亚丁高反提醒：不要第一天就上牛奶海。我们在香格里拉镇待了两天适应，第三天上去很轻松。氧气瓶镇上买比景区便宜一半，红景天提前喝。',
      replies: [
        { author: 'namu', hoursAgo: 32, text: '完全同意，适应两天是性价比最高的投资。' },
        { author: 'tangyuan', hoursAgo: 30, text: '请问镇上住宿推荐哪个区域？' },
        { author: 'shanque', hoursAgo: 29, text: '镇上主街一带就行，离吃饭近，早上拼车也方便。' }
      ]
    },
    {
      id: 'p11', city: 'sanya', topic: 'rent', author: 'mia', hoursAgo: 40, likes: 84,
      text: '三亚过冬租房避坑：别信中介嘴里的“海景房”，很多是隔着两排楼的侧海景。建议先住一周民宿，把区块跑一遍再定长租；12 月中旬之后价格会明显上跳。',
      replies: [
        { author: 'kiwi', hoursAgo: 38, text: '先短住再长租这条建议，适用于所有旅游城市。' }
      ]
    },
    {
      id: 'p12', city: 'hulunbuir', topic: 'daily', author: 'namu', hoursAgo: 46, likes: 67,
      text: '呼伦贝尔 7 月，手机相册自动变成壁纸库。但一定租车，公共交通基本没有。夜里十点还有晚霞，第一次见会觉得不太真实。',
      replies: []
    },
    {
      id: 'p13', city: 'suzhou', topic: 'daily', author: 'qingjian', hoursAgo: 52, likes: 59,
      text: '住平江路附近是种罪与罚：早上七点游人还没来的时候，河水、扫地声、面馆开火的声音都特别清楚；白天就只能躲进园林里喝茶，或者骑车去别的小巷。',
      replies: [
        { author: 'ahe', hoursAgo: 50, text: '苏州的清晨确实是全城最好的部分。' }
      ]
    },
    {
      id: 'p14', city: 'kashgar', topic: 'daily', author: 'guzi', hoursAgo: 58, likes: 73,
      text: '喀什的作息会把你调慢：晚上十点的太阳像内地下午四点，老城喝茶五块钱一壶能坐一下午。巷子里全是踢球的孩子，很热闹也很安全。',
      replies: [
        { author: 'daxiong', hoursAgo: 55, text: '时差这点很有意思，等于每天多出两小时。' }
      ]
    },
    {
      id: 'p15', city: 'wuyuan', topic: 'work', author: 'ahe', hoursAgo: 64, likes: 38,
      text: '婺源的花期是绝对高峰：3 月下旬房价翻倍还难订。但淡季的村子安静便宜，我 11 月在村里住了一个月，白天写东西，傍晚散步，几乎是全网最便宜的专注环境。',
      replies: []
    },
    {
      id: 'p16', city: 'weizhou', topic: 'pit', author: 'laoyu', hoursAgo: 70, likes: 44,
      text: '涠洲岛避坑三条：一、台风季船班可能连续停运，返程票要留缓冲；二、物资靠船运，物价偏高；三、岛上医疗有限，慢性病要带够药。安静是真安静。',
      replies: [
        { author: 'xiaoye', hoursAgo: 68, text: '第三条最重要，海岛上任何小事都会被放大。' }
      ]
    },
    {
      id: 'p17', city: 'dali', topic: 'meet', author: 'linxiaoman', hoursAgo: 20, likes: 18,
      text: '周六早上去才村码头看日出，骑到龙龛再折回来，全程十五公里左右。七点出发，速度慢，谁都能跟上，带瓶水就行。',
      replies: [
        { author: 'youyou', hoursAgo: 17, text: '算我一个，我这边正好多一辆车。' }
      ]
    },
    {
      id: 'p18', city: 'anji', topic: 'meet', author: 'tangyuan', hoursAgo: 32, likes: 12,
      text: '周日上午竹林徒步，下午各自在共享工位写东西。从县城出发 AA 拼车，还缺两个人。',
      replies: [
        { author: 'qingjian', hoursAgo: 30, text: '我在杭州，周五过去住两天，拼车算我一个。' }
      ]
    },
    {
      id: 'p19', city: 'wanning', topic: 'meet', author: 'kiwi', hoursAgo: 44, likes: 9,
      text: '日月湾新手下水局：这周日上午，教练带两个新手，岸边还有人在拍照。想学的举个手，装备可以租。',
      replies: []
    }
  ];

  global.QiyuData = {
    CATEGORIES: CATEGORIES,
    TOPICS: TOPICS,
    USERS: USERS,
    SPOT_TYPES: SPOT_TYPES,
    CITIES: ALL_CITIES,
    POSTS: POSTS,
    // 全局开关
    SETTINGS: {
      // true：还没接入实拍短片的城市，用程序化画面兜底
      // false：不再画了，改成一块占位卡（斜纹底 + 「实拍待接入」），提醒去补素材
      drawnFallback: true,

      // —— 账号与内容分级（原型阶段先做前端规则，接后端时把判断搬到服务端）——
      // 注册免费、发帖免费；不注册只能看到一部分内容，用来把访客转成用户。
      account: {
        signupFree: true,     // 注册不要钱
        postFree: true,       // 发帖不要钱（冷启动阶段这是燃料）
        guestRows: 2,         // 游客在卡片数据层里能看的条数
        guestStats: 2,        // 游客在城市详情「旅居速览」里能看的项数
        guestPosts: 3        // 游客在社区里能看的帖子数
      }
    },
    // 合作位（广告）。换成真实投放内容只需要改这一段：
    SPONSOR: {
      advertiser: '示例合作方',
      eyebrow: '合作 · 广告',
      title: '旅居者保险，从 ¥2/天',
      text: '医疗保障、行李延误、行程取消，按月投保，随时可停。',
      cta: '了解保障',
      image: 'assets/img/band-dali-night.jpg'
    },
    cityById: function (id) {
      // 注意：要查处理过的 ALL_CITIES（带实拍短片、景点、奶茶密度），
      // 查原始 CITIES 会漏掉 withVideo 加上去的那部分。
      for (let i = 0; i < ALL_CITIES.length; i++) {
        if (ALL_CITIES[i].id === id) return ALL_CITIES[i];
      }
      return null;
    },
    topicName: function (id) {
      for (let i = 0; i < TOPICS.length; i++) if (TOPICS[i].id === id) return TOPICS[i].name;
      return '日常';
    }
  };

})(window);
