/* ============================================================
   栖旅 · 一天十二幅画

   网站的背景不再是一张照片，而是随着钟点换的一幅画：
   每两小时换一幅，一天十二幅，全部由 Canvas 逐帧手绘（复用画面引擎 Scenes）。

   为什么是"画"而不是照片：
   1. 照片里的光只有一种——清晨拍的图，配不上晚上的访客；
   2. 画能一直动：云在飘、水在亮、星在闪、鸟在飞；
   3. 十二幅画是同一个地方（远山 + 湖面）在不同时辰的样子，
      所以整站看起来像同一个世界，而不是十二张不相干的图。

   想立刻看别的时辰，用 ?t=18:30 打开，或在页面上点时间轴。
   ============================================================ */
(function (global) {
  'use strict';

  const S = global.Scenes;
  const SLOT_HOURS = 2;

  /* ---------------- 十二幅画 ---------------- */

  /* 每幅画 = 一个调色板 + 一套画法。刻意共用同一片湖和同一列远山，
     只让光、云、水、星星、飞鸟随时辰变，这样切换时像同一个地方在变天。 */
  const PHASES = [
    {
      id: 'night1', name: '深夜', range: '00:00–02:00', note: '星星落在水面上',
      palette: {
        sky: [[0, '#04070f'], [0.34, '#0a1226'], [0.62, '#132043'], [0.84, '#22315c'], [1, '#3d4c78']],
        haze: '#3d4c78', sun: '#eef4ff', sunGlow: '#9fb6e8',
        ridge: ['#2b3557', '#1c2440', '#0e1428'], water: ['#22304f', '#070b17'],
        light: '#cfe0ff', cloud: '#2f3c5c', cloudDark: '#161d33', ground: '#101528'
      },
      scene: {
        horizon: 0.55, vignette: 0.34,
        water: 'lake',
        stars: { density: 1.15, milkyway: true },
        sun: { x: 0.7, y: 0.2, r: 15, glow: 3.4, crescent: true },
        clouds: { count: 3, band: [0.08, 0.24], opacity: 0.3, scale: 1.2, speedScale: 0.5 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 34, rough: 0.7, sparkle: true, sunColumn: true, sunColumnX: 0.7 },
        particles: { kind: 'fireflies', count: 22, speed: 0.8, size: 0.9 }
      }
    },
    {
      id: 'night2', name: '凌晨', range: '02:00–04:00', note: '月亮偏西，水很静',
      palette: {
        sky: [[0, '#050a16'], [0.36, '#0c1730'], [0.64, '#1a2a4c'], [0.86, '#2f4468'], [1, '#54678c']],
        haze: '#54678c', sun: '#f2f7ff', sunGlow: '#a8c0ea',
        ridge: ['#33405f', '#222c48', '#12182c'], water: ['#2a3a5a', '#0a1020'],
        light: '#d9e6ff', cloud: '#39476a', cloudDark: '#1b2338', ground: '#131a2c'
      },
      scene: {
        horizon: 0.55, vignette: 0.32,
        water: 'lake',
        stars: { density: 0.85, milkyway: true },
        sun: { x: 0.24, y: 0.19, r: 16, glow: 3.6, crescent: true },
        clouds: { count: 3, band: [0.1, 0.3], opacity: 0.3, scale: 1.1, speedScale: 0.6 },
        fog: { opacity: 0.12, from: 0.44, to: 0.62, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 30, rough: 0.55, sparkle: true, sunColumn: true, sunColumnX: 0.24 },
        particles: { kind: 'fireflies', count: 12, speed: 0.7, size: 0.8 }
      }
    },
    {
      id: 'dawn1', name: '拂晓', range: '04:00–06:00', note: '天边先亮一线',
      palette: {
        sky: [[0, '#1b2340'], [0.32, '#33405f'], [0.56, '#5a5f7e'], [0.78, '#8a7d90'], [0.92, '#c1a091'], [1, '#e8cdb2']],
        haze: '#e8cdb2', sun: '#fff3e0', sunGlow: '#f0a882',
        ridge: ['#5c6480', '#463f5c', '#2b2a42'], water: ['#8f8ea0', '#2d3048'],
        light: '#ffd9b0', cloud: '#9aa0b8', cloudDark: '#565c78', ground: '#2e2c40'
      },
      scene: {
        horizon: 0.55, vignette: 0.28,
        water: 'lake',
        stars: { density: 0.35 },
        // 太阳还在地平线下，只留一线光——画在远山后面，山脊会把圆盘咬掉一半
        sun: { x: 0.16, y: 0.6, r: 12, glow: 6 },
        clouds: { count: 4, band: [0.3, 0.52], opacity: 0.38, scale: 1.15, speedScale: 0.8 },
        fog: { opacity: 0.3, from: 0.5, to: 0.68, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 26, rough: 0.5, sparkle: false, sunColumn: true, sunColumnX: 0.16 },
        birds: { count: 3, y: 0.34, spread: 0.1, size: 0.8, dir: 1, color: '#3a3446' }
      }
    },
    {
      id: 'dawn2', name: '日出', range: '06:00–08:00', note: '光柱铺到湖心',
      palette: {
        sky: [[0, '#22314f'], [0.24, '#4c4a74'], [0.46, '#96637c'], [0.66, '#d4805f'], [0.84, '#f3b678'], [1, '#fbe3bb']],
        haze: '#fbe3bb', sun: '#fff6e2', sunGlow: '#ff9350',
        ridge: ['#8b7390', '#6a5570', '#403349'], water: ['#f0b184', '#4a3547'],
        light: '#ffd6a2', cloud: '#ffc79b', cloudDark: '#9c6a72', ground: '#3a2c3c'
      },
      scene: {
        horizon: 0.55, vignette: 0.26,
        water: 'lake',
        sun: { x: 0.34, y: 0.5, r: 20, glow: 6 },
        clouds: { count: 5, band: [0.16, 0.48], opacity: 0.42, scale: 1.2, speedScale: 1 },
        fog: { opacity: 0.16, from: 0.5, to: 0.64, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 28, rough: 0.75, sparkle: true, sunColumn: true, sunColumnX: 0.34 },
        boats: { kind: 'raft', x: 0.24, y: 0.6, speed: 0.16, scale: 0.42, color: '#3a2f3c' },
        birds: { count: 5, y: 0.3, spread: 0.12, size: 0.9, dir: 1, color: '#3d2f3c' }
      }
    },
    {
      id: 'morn1', name: '清晨', range: '08:00–10:00', note: '雾在散，鸟在飞',
      palette: {
        sky: [[0, '#3b7cb5'], [0.38, '#6ba6cf'], [0.66, '#a3c8e0'], [0.88, '#d3e4ea'], [1, '#eef3ee']],
        haze: '#e2eef0', sun: '#ffffff', sunGlow: '#ffeec0',
        ridge: ['#7d9dab', '#4a7188', '#26485c'], water: ['#8dc0d8', '#1d4f68'],
        light: '#fff4c4', cloud: '#ffffff', cloudDark: '#c8dbe4', ground: '#4c6f5c'
      },
      scene: {
        horizon: 0.55, vignette: 0.28,
        water: 'lake',
        sun: { x: 0.62, y: 0.24, r: 22, glow: 4.6 },
        clouds: { count: 4, band: [0.1, 0.32], opacity: 0.4, scale: 1.15, speedScale: 1.2 },
        fog: { opacity: 0.16, from: 0.52, to: 0.64, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 30, rough: 0.8, sparkle: true, sunColumn: true, sunColumnX: 0.62 },
        boats: { kind: 'raft', x: 0.68, y: 0.63, speed: 0.13, scale: 0.4, color: '#2f4650' },
        birds: { count: 7, y: 0.27, spread: 0.14, size: 1, dir: 1, color: '#3a4a54' }
      }
    },
    {
      id: 'morn2', name: '上午', range: '10:00–12:00', note: '山脊清清楚楚',
      palette: {
        sky: [[0, '#1c68bd'], [0.4, '#4b95da'], [0.7, '#8dc0e8'], [0.9, '#c8e2f0'], [1, '#e9f4f6']],
        haze: '#dceaf4', sun: '#ffffff', sunGlow: '#ffe9a0',
        ridge: ['#7899b2', '#456f8e', '#1f4d6d'], water: ['#6cb8da', '#0d4468'],
        light: '#fff8d0', cloud: '#ffffff', cloudDark: '#bdd6e6', ground: '#3f6b46'
      },
      scene: {
        horizon: 0.55, vignette: 0.3,
        water: 'lake',
        sun: { x: 0.74, y: 0.16, r: 22, glow: 4.2 },
        clouds: { count: 5, band: [0.08, 0.3], opacity: 0.46, scale: 1.18, speedScale: 1.3 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 32, rough: 0.9, sparkle: true, sunColumn: true, sunColumnX: 0.74 },
        birds: { count: 6, y: 0.24, spread: 0.13, size: 1, dir: 1, color: '#33505f' }
      }
    },
    {
      id: 'noon', name: '正午', range: '12:00–14:00', note: '一天里最亮的一幅',
      palette: {
        sky: [[0, '#1462c0'], [0.38, '#3f92dd'], [0.68, '#84c1ec'], [0.9, '#c6e6f4'], [1, '#eaf6f8']],
        haze: '#d5e9f4', sun: '#ffffff', sunGlow: '#fff2b0',
        ridge: ['#6f95b2', '#3b6a8e', '#17466c'], water: ['#66b8de', '#073f68'],
        light: '#fffce0', cloud: '#ffffff', cloudDark: '#b4d0e4', ground: '#3c6a44'
      },
      scene: {
        horizon: 0.55, vignette: 0.32,
        water: 'lake',
        sun: { x: 0.5, y: 0.09, r: 24, glow: 4 },
        clouds: { count: 5, band: [0.06, 0.26], opacity: 0.48, scale: 1.2, speedScale: 1.4 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 34, rough: 1, sparkle: true, sunColumn: true, sunColumnX: 0.5 },
        birds: { count: 4, y: 0.22, spread: 0.12, size: 1, dir: 1, color: '#2f4f60' }
      }
    },
    {
      id: 'afternoon', name: '午后', range: '14:00–16:00', note: '云变厚，光是暖的',
      palette: {
        sky: [[0, '#2a6fae'], [0.34, '#59a0cf'], [0.62, '#9cc6dd'], [0.84, '#dfd6c0'], [1, '#f7e8cd']],
        haze: '#f2e6cd', sun: '#fffbe8', sunGlow: '#ffd483',
        ridge: ['#8d9d86', '#5d7a6c', '#2f4f4c'], water: ['#9dbdac', '#204c58'],
        light: '#ffe6ae', cloud: '#fdf2dd', cloudDark: '#cdc0a6', ground: '#5c7a52'
      },
      scene: {
        horizon: 0.55, vignette: 0.3,
        water: 'lake',
        sun: { x: 0.26, y: 0.2, r: 22, glow: 5 },
        clouds: { count: 6, band: [0.1, 0.4], opacity: 0.44, scale: 1.25, speedScale: 1.1 },
        fog: { opacity: 0.1, from: 0.5, to: 0.6, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 32, rough: 0.85, sparkle: true, sunColumn: true, sunColumnX: 0.26 },
        particles: { kind: 'petals', count: 16, speed: 1, size: 1, color: '#ffe0c2' }
      }
    },
    {
      id: 'goldhour', name: '傍晚', range: '16:00–18:00', note: '金色的一小时',
      palette: {
        sky: [[0, '#26314e'], [0.28, '#5b5480'], [0.5, '#a86a7c'], [0.7, '#dd8b5f'], [0.87, '#f3b878'], [1, '#fbe0b4']],
        haze: '#fbe0b4', sun: '#fff7e4', sunGlow: '#ffae5c',
        ridge: ['#8f7c94', '#6d5a72', '#42364c'], water: ['#f2b381', '#4b3548'],
        light: '#ffd79c', cloud: '#ffd0a4', cloudDark: '#a0737a', ground: '#3b2e40'
      },
      scene: {
        horizon: 0.55, vignette: 0.28,
        water: 'lake',
        sun: { x: 0.2, y: 0.46, r: 24, glow: 6.4 },
        clouds: { count: 6, band: [0.12, 0.44], opacity: 0.44, scale: 1.3, speedScale: 0.9 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 30, rough: 0.8, sparkle: true, sunColumn: true, sunColumnX: 0.2 },
        boats: { kind: 'raft', x: 0.62, y: 0.6, speed: 0.14, scale: 0.44, color: '#3a2a34' },
        birds: { count: 6, y: 0.3, spread: 0.12, size: 1, dir: -1, color: '#4a3540' }
      }
    },
    {
      id: 'sunset', name: '日落', range: '18:00–20:00', note: '太阳压着地平线',
      palette: {
        sky: [[0, '#1e2544'], [0.24, '#42406c'], [0.44, '#7c5578'], [0.62, '#b8626a'], [0.8, '#e8834f'], [1, '#f8c07c']],
        haze: '#f8c07c', sun: '#fff0cc', sunGlow: '#ff7a42',
        ridge: ['#7a5f80', '#5a4460', '#33263c'], water: ['#e79a6d', '#3a2941'],
        light: '#ffc487', cloud: '#f0a478', cloudDark: '#85536b', ground: '#312538'
      },
      scene: {
        horizon: 0.55, vignette: 0.3,
        water: 'lake',
        sun: { x: 0.42, y: 0.56, r: 22, glow: 7 },
        clouds: { count: 5, band: [0.14, 0.5], opacity: 0.42, scale: 1.25, speedScale: 0.8 },
        fog: { opacity: 0.12, from: 0.5, to: 0.6, bands: 3, thickness: 1 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 30, rough: 0.8, sparkle: true, sunColumn: true, sunColumnX: 0.42 },
        birds: { count: 5, y: 0.28, spread: 0.11, size: 0.95, dir: -1, color: '#3f2b38' }
      }
    },
    {
      id: 'twilight', name: '暮色', range: '20:00–22:00', note: '余晖一线，星已上',
      palette: {
        sky: [[0, '#0c1228'], [0.3, '#1b2444'], [0.54, '#33405f'], [0.74, '#5a5474'], [0.88, '#8f6a72'], [1, '#c79076']],
        haze: '#c79076', sun: '#fdf3ff', sunGlow: '#c9a2e0',
        ridge: ['#3c4262', '#2b3050', '#1a1c33'], water: ['#4a4460', '#121528'],
        light: '#ffcf9a', cloud: '#5b5a7c', cloudDark: '#2e2f4a', ground: '#1c1e30'
      },
      scene: {
        horizon: 0.55, vignette: 0.3,
        water: 'lake',
        stars: { density: 0.45 },
        sun: { x: 0.66, y: 0.3, r: 13, glow: 4.4, crescent: true },
        clouds: { count: 5, band: [0.18, 0.46], opacity: 0.4, scale: 1.2, speedScale: 0.7 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 28, rough: 0.7, sparkle: true, sunColumn: true, sunColumnX: 0.66 },
        particles: { kind: 'fireflies', count: 18, speed: 1, size: 0.9 }
      }
    },
    {
      id: 'night3', name: '夜色', range: '22:00–00:00', note: '岸上还有灯火',
      palette: {
        sky: [[0, '#050912'], [0.34, '#0c1428'], [0.6, '#172144'], [0.82, '#28325a'], [1, '#4a5578']],
        haze: '#4a5578', sun: '#eef4ff', sunGlow: '#a9bdf0',
        ridge: ['#2a3352', '#1c2340', '#0f1426'], water: ['#26314f', '#080c19'],
        light: '#ffb35c', cloud: '#333d5c', cloudDark: '#181e33', ground: '#111528'
      },
      scene: {
        horizon: 0.55, vignette: 0.32,
        water: 'lake',
        stars: { density: 0.9, milkyway: true },
        sun: { x: 0.78, y: 0.18, r: 15, glow: 3.6, crescent: true },
        clouds: { count: 3, band: [0.1, 0.28], opacity: 0.32, scale: 1.15, speedScale: 0.6 },
        terrain: 'ridges', terrainOpts: { layers: 3, base: 0.30, spread: 0.09, amp: 0.095, haze: 0.36, sharp: 1.15 },
        waterOpts: { rings: 32, rough: 0.75, sparkle: true, sunColumn: true, sunColumnX: 0.78 },
        particles: { kind: 'fireflies', count: 26, speed: 1.1, size: 1 }
      }
    }
  ];

  /* 文字要压得住画。
     夜里那几幅本身就暗，遮罩调轻一点，免得把星星和灯火压死；
     白天那几幅亮，再叠一层暗角，保证白字看得清。 */
  const SCRIM = {
    night1: { scrim: 0.8, darken: 0 },
    night2: { scrim: 0.82, darken: 0 },
    dawn1: { scrim: 0.95, darken: 0 },
    dawn2: { scrim: 1, darken: 0 },
    morn1: { scrim: 1, darken: 0.14 },
    morn2: { scrim: 1, darken: 0.2 },
    noon: { scrim: 1, darken: 0.28 },
    afternoon: { scrim: 1, darken: 0.18 },
    goldhour: { scrim: 1, darken: 0.06 },
    sunset: { scrim: 1, darken: 0.06 },
    twilight: { scrim: 0.95, darken: 0 },
    night3: { scrim: 0.85, darken: 0 }
  };

  /* 注册调色板：画面引擎按名字取色，这里把十二幅画的颜色喂给它 */
  if (S && S.PALETTES) {
    PHASES.forEach(function (p) { S.PALETTES['day_' + p.id] = p.palette; });
  }

  /* ---------------- 时间 → 第几幅 ---------------- */

  function slotIndex(date) {
    return Math.floor(date.getHours() / SLOT_HOURS) % 12;
  }

  function phaseOf(date) {
    return PHASES[slotIndex(date)];
  }

  /* 支持 ?t=18:30 强制时间，方便预览和截图 */
  let forced = null;
  function parseForced() {
    const m = /[?&]t=(\d{1,2})(?::(\d{2}))?/.exec(global.location ? global.location.search : '');
    if (!m) return null;
    const h = Math.min(23, parseInt(m[1], 10));
    const mm = Math.min(59, parseInt(m[2] || '0', 10));
    return { h: h, m: mm };
  }

  let previewIdx = null;

  function now() {
    const d = new Date();
    if (forced) d.setHours(forced.h, forced.m, 0, 0);
    return d;
  }

  function activeIndex() {
    if (previewIdx !== null) return previewIdx;
    return slotIndex(now());
  }

  function isPreviewing() { return previewIdx !== null; }

  /* ---------------- 挂载 ---------------- */

  const hosts = [];
  const FADE_MS = 900;

  /* 画面引擎原本是照 5:4 的卡片调的。同一列山铺到两米宽的首屏上，
     山高按画面高度算、波长按画面宽度算，就会被拉成一条带子。
     所以按"宽高比 ÷ 1.25"把山乘高：画面越宽，山越高、越像山。 */
  function aspectGain(host) {
    const r = host.getBoundingClientRect();
    const aspect = (r.width || 1.6) / (r.height || 1);
    return Math.min(2.8, Math.max(1, aspect / 1.25));
  }

  function sceneFor(phase, host) {
    const conf = Object.assign({}, phase.scene);
    conf.palette = 'day_' + phase.id;
    if (conf.terrainOpts && host) {
      conf.terrainOpts = Object.assign({}, conf.terrainOpts, {
        amp: conf.terrainOpts.amp * aspectGain(host)
      });
    }
    return conf;
  }

  function paint(host, index, animate) {
    const phase = PHASES[index];
    const canvas = document.createElement('canvas');
    canvas.className = 'day-layer';
    canvas.setAttribute('aria-hidden', 'true');
    host.appendChild(canvas);
    const item = S.create(canvas, sceneFor(phase, host), { key: 'day-' + phase.id, speed: 1 });
    host.__item = item;
    host.__canvas = canvas;
    global.requestAnimationFrame(function () { canvas.classList.add('is-on'); });

    const oldItem = host.__oldItem;
    const oldCanvas = host.__oldCanvas;
    host.__oldItem = null;
    host.__oldCanvas = null;
    host.setAttribute('data-day-index', String(index));
    if (oldCanvas) {
      const drop = function () {
        if (oldItem) oldItem.destroy();
        if (oldCanvas.parentNode) oldCanvas.parentNode.removeChild(oldCanvas);
      };
      if (animate) global.setTimeout(drop, FADE_MS + 60); else drop();
    }

    // 第一次落笔时，让原来那张实拍垫图跟着淡出——不然正午会看见照片里的日出
    const scope0 = host.closest('.hero, .band, .page-head');
    if (scope0 && scope0.classList.contains('has-day') === false) {
      scope0.classList.add('has-day');
    }
    host.setAttribute('data-day-phase', phase.id);
    // 遮罩强度写在区块上（首屏/照片带/页头），子元素里的 .xxx-scrim 才读得到
    const scope = host.closest('.hero, .band, .page-head') || host.parentElement || host;
    const s = SCRIM[phase.id] || { scrim: 1, darken: 0 };
    scope.style.setProperty('--day-scrim', s.scrim);
    scope.style.setProperty('--day-darken', s.darken);
    scope.setAttribute('data-day-phase', phase.id);
  }

  function switchTo(index, animate) {
    hosts.forEach(function (host) {
      if (host.__item) {
        host.__oldItem = host.__item;
        host.__oldCanvas = host.__canvas;
      }
      paint(host, index, animate);
    });
    syncLabels();
    if (listeners.length) listeners.forEach(function (fn) { fn(PHASES[index], index); });
  }

  const listeners = [];
  function onChange(fn) { listeners.push(fn); }

  /* 页面上的时段文字（首屏、页头、时间轴） */
  function syncLabels() {
    const idx = activeIndex();
    const phase = PHASES[idx];
    const d = now();
    const hh = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);

    document.querySelectorAll('[data-day-label]').forEach(function (el) {
      el.textContent = phase.name;
    });
    document.querySelectorAll('[data-day-range]').forEach(function (el) {
      el.textContent = phase.range;
    });
    document.querySelectorAll('[data-day-note]').forEach(function (el) {
      el.textContent = phase.note;
    });
    document.querySelectorAll('[data-day-clock]').forEach(function (el) {
      el.textContent = hh;
    });
    document.querySelectorAll('[data-day-rail]').forEach(function (rail) {
      rail.querySelectorAll('[data-day-slot]').forEach(function (btn) {
        const on = Number(btn.getAttribute('data-day-slot')) === idx;
        btn.classList.toggle('is-on', on);
        btn.setAttribute('aria-current', on ? 'true' : 'false');
      });
    });
    document.querySelectorAll('[data-day-reset]').forEach(function (el) {
      el.hidden = !isPreviewing();
    });
    document.querySelectorAll('[data-day-forced]').forEach(function (el) {
      el.hidden = !forced;
    });
    document.querySelectorAll('[data-previewing]').forEach(function (el) {
      el.hidden = !isPreviewing();
    });
  }

  function buildRails() {
    document.querySelectorAll('[data-day-rail]').forEach(function (rail) {
      rail.innerHTML = PHASES.map(function (p, i) {
        return '<button type="button" class="day-slot" data-day-slot="' + i + '"' +
          ' title="' + p.name + ' · ' + p.range + ' · ' + p.note + '">' +
          '<b>' + p.name + '</b><span>' + p.range.slice(0, 5) + '</span></button>';
      }).join('');
    });
  }

  function refresh() {
    hosts.forEach(function (host) { if (host.__item) host.__item.needsDraw = true; });
    syncLabels();
  }

  /* 改窗口大小以后山高要重算一次，不然会重新变成一条带子 */
  function retune() {
    hosts.forEach(function (host) {
      const item = host.__item;
      if (!item) return;
      const idx = Number(host.getAttribute('data-day-index') || 0);
      const base = PHASES[idx] && PHASES[idx].scene.terrainOpts;
      if (!base || !item.cfg.terrainOpts) return;
      item.cfg.terrainOpts.amp = base.amp * aspectGain(host);
      item.needsDraw = true;
    });
  }

  function init() {
    if (!S) return;
    forced = parseForced();
    hosts.length = 0;
    document.querySelectorAll('[data-day-canvas]').forEach(function (host) {
      if (host.__item) { host.__item.destroy(); }
      const old = host.querySelector('.day-layer');
      if (old) old.remove();
      hosts.push(host);
    });
    buildRails();
    const idx = activeIndex();
    hosts.forEach(function (host) { paint(host, idx, false); });
    syncLabels();

    // 每 20 秒看一眼是不是跨进下一个两小时了
    if (!init.timer) {
      init.timer = global.setInterval(function () {
        if (previewIdx !== null) return;
        if (hosts.length && hosts[0].getAttribute('data-day-phase') !== PHASES[slotIndex(now())].id) {
          switchTo(slotIndex(now()), true);
        } else {
          syncLabels();
        }
      }, 20000);
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) refresh();
    });

    if (!init.rt) {
      let t = null;
      init.rt = global.addEventListener('resize', function () {
        global.clearTimeout(t);
        t = global.setTimeout(retune, 200);
      });
    }
  }

  document.addEventListener('click', function (ev) {
    const t = ev.target;
    const slot = t.closest('[data-day-slot]');
    if (slot) {
      if (forced) return; // ?t= 指定了时间就不让点，免得以为坏了
      previewIdx = Number(slot.getAttribute('data-day-slot'));
      switchTo(previewIdx, true);
      return;
    }
    if (t.closest('[data-day-reset]')) {
      previewIdx = null;
      switchTo(slotIndex(now()), true);
    }
  });

  global.QiyuDay = {
    PHASES: PHASES,
    init: init,
    refresh: refresh,
    phaseOf: phaseOf,
    slotIndex: slotIndex,
    current: function () { return PHASES[activeIndex()]; },
    isPreviewing: isPreviewing,
    preview: function (i) { previewIdx = Math.max(0, Math.min(11, i)); switchTo(previewIdx, true); },
    reset: function () { previewIdx = null; switchTo(slotIndex(now()), true); },
    onChange: onChange
  };

})(window);
