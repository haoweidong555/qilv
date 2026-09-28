/* ============================================================
   栖旅 · 动态画面引擎
   一张卡片 = 一幅实时绘制的画。
   所有元素（天空、云雾、山脊、水面波光、飘雪、灯火、竹筏…）
   都由 Canvas 逐帧绘制，不依赖任何图片或视频素材。
   ============================================================ */
(function (global) {
  'use strict';

  /* ---------------- 随机与颜色 ---------------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  function hex2rgb(c) {
    let v = c.trim();
    if (v[0] === '#') v = v.slice(1);
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return [parseInt(v.slice(0, 2), 16) || 0, parseInt(v.slice(2, 4), 16) || 0, parseInt(v.slice(4, 6), 16) || 0];
  }

  function mix(c1, c2, t) {
    const a = hex2rgb(c1), b = hex2rgb(c2);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  function alpha(c, a) {
    const b = hex2rgb(c);
    return 'rgba(' + b[0] + ',' + b[1] + ',' + b[2] + ',' + Math.max(0, Math.min(1, a)) + ')';
  }

  function lighten(c, t) { return mix(c, '#ffffff', t); }
  function darken(c, t) { return mix(c, '#000000', t); }

  /* ---------------- 调色板 ---------------- */

  const PALETTES = {
    goldenHour: {
      sky: [[0, '#26324e'], [0.3, '#5f5a83'], [0.52, '#b6707a'], [0.73, '#e78f63'], [0.88, '#f6bd7c'], [1, '#fbe2b6']],
      haze: '#fbe2b6', sun: '#fff5dc', sunGlow: '#ffab5e',
      ridge: ['#8a7a94', '#6b5a72', '#41364c'], water: ['#f0b183', '#4a3950'],
      light: '#ffd9a0', cloud: '#ffd3a8', cloudDark: '#a2767f', ground: '#3a2f42'
    },
    dawnMist: {
      sky: [[0, '#2b3d58'], [0.34, '#5c7691'], [0.6, '#93a8b4'], [0.82, '#cdd6d2'], [1, '#efeee6']],
      haze: '#eef0e8', sun: '#fff8e6', sunGlow: '#cfd9d8',
      ridge: ['#9fb0ba', '#7c919c', '#5c727e'], water: ['#c9d3d1', '#5b6f74'],
      light: '#ffe6b0', cloud: '#f2f4f0', cloudDark: '#b3c0c4', ground: '#4a5b52'
    },
    brightDay: {
      sky: [[0, '#1f6fc4'], [0.4, '#4f9ede'], [0.7, '#8fc6ea'], [0.9, '#c8e4f2'], [1, '#e8f3f6']],
      haze: '#e8f3f6', sun: '#ffffff', sunGlow: '#ffe9a8',
      ridge: ['#a8c3d4', '#7ba0b6', '#4f7a92'], water: ['#8fd0e6', '#1a5c86'],
      light: '#fff6c8', cloud: '#ffffff', cloudDark: '#b9d3e2', ground: '#3f6b46'
    },
    snowNight: {
      sky: [[0, '#0a1029'], [0.35, '#16224a'], [0.6, '#2b3a68'], [0.83, '#5b6489'], [1, '#9aa3bd']],
      haze: '#9aa3bd', sun: '#f2f6ff', sunGlow: '#cdd8f5',
      ridge: ['#495277', '#37406a', '#232c52'], water: ['#3d4a6e', '#141a33'],
      light: '#ffd27a', cloud: '#6b7699', cloudDark: '#3c4667', ground: '#e8edf7'
    },
    desertSunset: {
      sky: [[0, '#2a2a48'], [0.28, '#5c4260'], [0.5, '#a8574f'], [0.72, '#e0834a'], [0.89, '#f6bd6b'], [1, '#fbe2ab']],
      haze: '#fbe2ab', sun: '#fff0c4', sunGlow: '#ff9a3c',
      ridge: ['#e0ac74', '#c08a52', '#8d5730'], water: ['#c9a173', '#6a4a30'],
      light: '#ffcf8a', cloud: '#f3c08a', cloudDark: '#9c6a58', ground: '#7a5232'
    },
    springRain: {
      sky: [[0, '#5b6b74'], [0.35, '#8b9aa0'], [0.62, '#bcc7c6'], [0.85, '#dde3dd'], [1, '#eef2ea']],
      haze: '#e8ece5', sun: '#fdfbf0', sunGlow: '#dfe6dd',
      ridge: ['#a9b8b5', '#86999a', '#61787c'], water: ['#c8d2cd', '#5c6f70'],
      light: '#ffe3b4', cloud: '#eef1ec', cloudDark: '#aab6b6', ground: '#4e6350'
    },
    clearNight: {
      sky: [[0, '#050a1c'], [0.3, '#0d1738'], [0.58, '#1c2b57'], [0.81, '#33456f'], [1, '#5d6c92']],
      haze: '#5d6c92', sun: '#eef4ff', sunGlow: '#a9bdf0',
      ridge: ['#3d4a72', '#2a3357', '#171d38'], water: ['#3a4a74', '#0b1024'],
      light: '#cfe0ff', cloud: '#46536f', cloudDark: '#232c46', ground: '#1a2138'
    },
    dusk: {
      sky: [[0, '#1d2a4a'], [0.3, '#4a4a76'], [0.55, '#8e5f80'], [0.76, '#d4796b'], [0.91, '#f2a878'], [1, '#fbd6a6']],
      haze: '#fbd6a6', sun: '#ffeccb', sunGlow: '#ff8f5c',
      ridge: ['#7b6b88', '#5c4f6c', '#352e45'], water: ['#e0a184', '#3e3350'],
      light: '#ffcf94', cloud: '#e9b39a', cloudDark: '#8a6480', ground: '#312b42'
    },
    grassDay: {
      sky: [[0, '#2b7fc9'], [0.38, '#5aa6de'], [0.68, '#98cbea'], [0.89, '#cfe6f1'], [1, '#eaf4f2']],
      haze: '#eaf4f2', sun: '#ffffff', sunGlow: '#fff2b8',
      ridge: ['#a9c6c0', '#7fa79f', '#5b8578'], water: ['#8ec6de', '#2a6a8c'],
      light: '#fff6c8', cloud: '#ffffff', cloudDark: '#b6d2e0', ground: '#6f9a4e'
    },
    cityNight: {
      sky: [[0, '#070d20'], [0.32, '#0f1a38'], [0.58, '#22284c'], [0.83, '#4a4260'], [1, '#8a6a6a']],
      haze: '#8a6a6a', sun: '#f6f9ff', sunGlow: '#b9c8f0',
      ridge: ['#2b3255', '#1e2440', '#11162b'], water: ['#3a2f4a', '#0a0d1c'],
      light: '#ffb35c', cloud: '#3a3f5e', cloudDark: '#1a1e33', ground: '#12162a'
    },
    bambooMist: {
      sky: [[0, '#6d8590'], [0.4, '#9db0b2'], [0.7, '#c6d2cb'], [1, '#e9efe4']],
      haze: '#e9efe4', sun: '#fdfbe8', sunGlow: '#d6e0d2',
      ridge: ['#a7bcb4', '#7f9c92', '#5b7a6c'], water: ['#c6d5cd', '#54695e'],
      light: '#ffe7b4', cloud: '#f0f2ec', cloudDark: '#b0bfb8', ground: '#41603f'
    }
  };

  /* ---------------- 绘制基元 ---------------- */

  function drawSky(ctx, w, h, pal) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i < pal.sky.length; i++) g.addColorStop(pal.sky[i][0], pal.sky[i][1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function drawStars(ctx, w, h, t, o, pal) {
    const yMax = o.horizon * h * 1.02;
    const n = Math.round(130 * o.density);
    const rnd = mulberry32(o.seed + 7);
    for (let i = 0; i < n; i++) {
      const x = rnd() * w, y = rnd() * yMax;
      const ph = rnd() * 6.283, sp = 0.5 + rnd() * 2.1, rad = 0.45 + rnd() * 1.35;
      const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * sp + ph));
      ctx.fillStyle = alpha('#ffffff', tw * 0.9);
      ctx.beginPath(); ctx.arc(x, y, rad, 0, 6.283); ctx.fill();
    }
    if (o.milkyway) {
      const cx = w * 0.5, cy = yMax * 0.45;
      const g = ctx.createLinearGradient(cx - w * 0.45, cy + h * 0.28, cx + w * 0.45, cy - h * 0.28);
      g.addColorStop(0, alpha('#9fb6ff', 0));
      g.addColorStop(0.5, alpha('#c9d6ff', 0.16));
      g.addColorStop(1, alpha('#9fb6ff', 0));
      ctx.save();
      ctx.translate(cx, cy); ctx.rotate(-0.42); ctx.translate(-cx, -cy);
      ctx.fillStyle = g;
      ctx.fillRect(cx - w, cy - h * 0.18, w * 2, h * 0.36);
      ctx.restore();
      for (let i = 0; i < 60; i++) {
        const p = rnd();
        const x = cx + (p - 0.5) * w * 1.5;
        const y = cy - (p - 0.5) * h * 0.5 + (rnd() - 0.5) * h * 0.16;
        ctx.fillStyle = alpha('#dfe7ff', 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.4 + i)));
        ctx.beginPath(); ctx.arc(x, y, 0.6 + rnd() * 1.1, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawCelestial(ctx, w, h, t, o, pal) {
    const x = o.x * w, y = o.y * h, r = o.r;
    const gl = ctx.createRadialGradient(x, y, 0, x, y, r * o.glow);
    gl.addColorStop(0, alpha(pal.sunGlow, 0.55));
    gl.addColorStop(0.35, alpha(pal.sunGlow, 0.2));
    gl.addColorStop(1, alpha(pal.sunGlow, 0));
    ctx.fillStyle = gl;
    ctx.beginPath(); ctx.arc(x, y, r * o.glow, 0, 6.283); ctx.fill();
    const core = ctx.createRadialGradient(x, y - r * 0.2, r * 0.1, x, y, r);
    core.addColorStop(0, alpha('#ffffff', 0.98));
    core.addColorStop(1, alpha(pal.sun, 0.9));
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    if (o.crescent) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath(); ctx.arc(x + r * 0.45, y - r * 0.24, r * 0.94, 0, 6.283); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function cloudBlob(ctx, x, y, rx, ry, c, a) {
    if (!isFinite(x) || !isFinite(y) || !isFinite(rx) || !isFinite(ry) || rx <= 0 || ry <= 0) return;
    if (!(a > 0)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    g.addColorStop(0, alpha(c, a));
    g.addColorStop(0.55, alpha(c, a * 0.72));
    g.addColorStop(1, alpha(c, a * 0));
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx); ctx.translate(-x, -y);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, rx, 0, 6.283); ctx.fill();
    ctx.restore();
  }

  function drawClouds(ctx, w, h, t, o, pal) {
    const n = Math.max(1, Math.round(o.count));
    const rnd = mulberry32(o.seed + 11);
    for (let i = 0; i < n; i++) {
      const lane = rnd();
      const band = o.band && o.band.length === 2 ? o.band : [0.06, 0.34];
      const cy = band[0] * h + rnd() * (band[1] - band[0]) * h;
      const rx = (0.14 + rnd() * 0.24) * w * (o.scale || 1);
      const ry = rx * (0.16 + rnd() * 0.12);
      const sp = (0.004 + rnd() * 0.011) * (o.speedScale || 0);
      const px = ((rnd() * 1.5 + t * sp) % 1.5) - 0.25;
      const x = px * w;
      const a = (o.opacity == null ? 0.6 : o.opacity) * (0.55 + lane * 0.5);
      cloudBlob(ctx, x, cy, rx, ry, pal.cloud, a);
      cloudBlob(ctx, x + rx * 0.42, cy - ry * 0.35, rx * 0.62, ry * 0.8, pal.cloud, a * 0.9);
      cloudBlob(ctx, x - rx * 0.5, cy + ry * 0.2, rx * 0.55, ry * 0.62, pal.cloudDark, a * 0.45);
      cloudBlob(ctx, x + rx * 0.05, cy + ry * 0.55, rx * 0.85, ry * 0.4, pal.cloudDark, a * 0.35);
    }
  }

  function drawFog(ctx, w, h, t, o, pal) {
    const n = Math.max(2, Math.round(o.bands));
    const rnd = mulberry32(o.seed + 23);
    for (let i = 0; i < n; i++) {
      const y = o.from * h + (i / n) * (o.to - o.from) * h;
      const thick = (0.05 + rnd() * 0.09) * h * o.thickness;
      const sp = 0.006 + rnd() * 0.016;
      const off = ((rnd() * 2 + t * sp) % 2) - 1;
      const g = ctx.createLinearGradient(0, y - thick, 0, y + thick);
      g.addColorStop(0, alpha(pal.haze, 0));
      g.addColorStop(0.5, alpha(pal.haze, o.opacity * (0.6 + rnd() * 0.5)));
      g.addColorStop(1, alpha(pal.haze, 0));
      ctx.save();
      ctx.fillStyle = g;
      ctx.translate(off * w * 0.12, 0);
      ctx.fillRect(-w * 0.3, y - thick, w * 1.6, thick * 2);
      ctx.restore();
    }
  }

  function makeProfile(seed, o) {
    const rnd = mulberry32(seed + 101);
    const ph = [rnd() * 6.283, rnd() * 6.283, rnd() * 6.283, rnd() * 6.283];
    const f = [o.f1, o.f2, o.f3, o.f4];
    return function (u) {
      let s = Math.sin(u * f[0] + ph[0]) * 0.5 + Math.sin(u * f[1] + ph[1]) * 0.28 +
        Math.sin(u * f[2] + ph[2]) * 0.15 + Math.sin(u * f[3] + ph[3]) * 0.07;
      s = 0.5 + 0.5 * s;
      return Math.pow(Math.max(0, Math.min(1, s)), o.sharp);
    };
  }

  function fillRange(ctx, w, h, baseY, profile, amp, color, segments) {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let s = 0; s <= segments; s++) {
      const u = s / segments;
      ctx.lineTo(u * w, baseY - amp * profile(u));
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }

  function drawRidges(ctx, w, h, t, o, pal) {
    const layers = o.layers;
    const rnd = mulberry32(o.seed + 31);
    for (let i = 0; i < layers; i++) {
      const d = layers === 1 ? 1 : i / (layers - 1);
      const baseY = (o.base + d * o.spread) * h;
      const amp = (o.amp * (0.45 + d * 0.85)) * h;
      const col = i === 0 ? pal.ridge[0] : (i === layers - 1 ? pal.ridge[2] : pal.ridge[1]);
      const color = mix(col, pal.haze, (1 - d) * o.haze);
      const profile = makeProfile(o.seed + i * 17, {
        f1: 1.1 + rnd() * 1.2, f2: 2.6 + rnd() * 1.8, f3: 5.2 + rnd() * 2.4, f4: 9 + rnd() * 4,
        sharp: o.sharp
      });
      const drift = Math.sin(t * (0.012 + i * 0.004)) * w * 0.004 * (layers - i);
      ctx.save();
      ctx.translate(drift, 0);
      fillRange(ctx, w, h, baseY, profile, amp, color, 64);
      if (o.snowcap && d > 0.3) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let s = 0; s <= 64; s++) { const u = s / 64; ctx.lineTo(u * w, baseY - amp * profile(u)); }
        ctx.lineTo(w, h); ctx.closePath();
        ctx.clip();
        const capProfile = makeProfile(o.seed + i * 17, {
          f1: 1.1 + rnd() * 1.2, f2: 2.6 + rnd() * 1.8, f3: 5.2 + rnd() * 2.4, f4: 9 + rnd() * 4,
          sharp: o.sharp
        });
        const snowCol = mix('#ffffff', pal.haze, 0.25);
        fillRange(ctx, w, h, baseY + amp * 0.3, capProfile, amp * 0.78, alpha(snowCol, 0.55 + 0.3 * d), 64);
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawKarst(ctx, w, h, t, o, pal) {
    // 一座座独立的圆顶陡壁石峰，而不是连绵山脊
    function tower(cx, baseY, tw, th) {
      const halfW = (tw * w) / 2;
      const topY = baseY - th;
      ctx.beginPath();
      ctx.moveTo(cx - halfW, baseY);
      ctx.bezierCurveTo(cx - halfW * 1.02, topY + th * 0.38, cx - halfW * 0.94, topY + th * 0.12,
        cx - halfW * 0.36, topY + th * 0.05);
      ctx.quadraticCurveTo(cx, topY - th * 0.06, cx + halfW * 0.36, topY + th * 0.05);
      ctx.bezierCurveTo(cx + halfW * 0.94, topY + th * 0.12, cx + halfW * 1.02, topY + th * 0.38,
        cx + halfW, baseY);
      ctx.closePath();
    }
    const layers = o.layers;
    for (let L = 0; L < layers; L++) {
      const d = L / Math.max(1, layers - 1);
      const baseY = (o.base + d * o.spread) * h;
      const amp = o.amp * h * (0.62 + d * 0.5);
      const color = mix(pal.ridge[L === layers - 1 ? 2 : 1], pal.haze, (1 - d) * o.haze);
      const rnd = mulberry32(o.seed + 41 + L * 29);
      const drift = Math.sin(t * (0.01 + L * 0.005)) * w * 0.004 * (layers - L);
      ctx.save();
      ctx.translate(drift, 0);
      // 河谷地面
      ctx.fillStyle = color;
      ctx.fillRect(-w * 0.1, baseY, w * 1.2, h - baseY + 10);
      // 峰群
      let u = -0.06 - rnd() * 0.04;
      while (u < 1.06) {
        const tw = 0.075 + rnd() * 0.1;
        const th = amp * (0.5 + rnd() * 0.75);
        const cx = (u + tw / 2) * w;
        ctx.fillStyle = color;
        tower(cx, baseY, tw, th);
        ctx.fill();
        ctx.save();
        tower(cx, baseY, tw, th);
        ctx.clip();
        ctx.strokeStyle = alpha(pal.ridge[2], 0.14);
        ctx.lineWidth = 1;
        for (let k = 0; k < 5; k++) {
          const sx = cx + (rnd() - 0.5) * tw * w * 0.7;
          ctx.beginPath();
          ctx.moveTo(sx, baseY - th * (0.35 + rnd() * 0.5));
          ctx.lineTo(sx + (rnd() - 0.5) * 6, baseY);
          ctx.stroke();
        }
        ctx.restore();
        u += tw + 0.012 + rnd() * 0.055;
      }
      // 层间薄雾，制造纵深
      const mist = ctx.createLinearGradient(0, baseY - h * 0.07, 0, baseY + h * 0.04);
      mist.addColorStop(0, alpha(pal.haze, 0));
      mist.addColorStop(0.5, alpha(pal.haze, Math.max(0, 0.34 - d * 0.14)));
      mist.addColorStop(1, alpha(pal.haze, 0));
      ctx.fillStyle = mist;
      ctx.fillRect(-w * 0.1, baseY - h * 0.07, w * 1.2, h * 0.11);
      ctx.restore();
    }
  }

  function drawDunes(ctx, w, h, t, o, pal) {
    const rnd = mulberry32(o.seed + 53);
    const layers = o.layers;
    for (let i = 0; i < layers; i++) {
      const d = i / Math.max(1, layers - 1);
      const baseY = (o.base + d * o.spread) * h;
      const amp = o.amp * h * (0.5 + d * 0.8);
      const col = i === 0 ? pal.ridge[0] : (i === layers - 1 ? pal.ridge[2] : pal.ridge[1]);
      const color = mix(col, pal.haze, (1 - d) * o.haze);
      const f1 = 1.0 + rnd() * 0.9, p1 = rnd() * 6.283;
      const f2 = 2.2 + rnd() * 1.4, p2 = rnd() * 6.283;
      const prof = function (u) {
        const s = 0.5 + 0.5 * (Math.sin(u * f1 + p1) * 0.7 + Math.sin(u * f2 + p2) * 0.3);
        return Math.pow(s, 1.15);
      };
      fillRange(ctx, w, h, baseY, prof, amp, color, 72);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let s = 0; s <= 72; s++) {
        const u = s / 72;
        ctx.lineTo(u * w, baseY - amp * prof(u) + 5 + 9 * d);
      }
      ctx.lineTo(w, h); ctx.closePath();
      ctx.fillStyle = alpha(darken(color, 0.3), 0.28);
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      for (let s = 0; s <= 72; s++) {
        const u = s / 72, x = u * w, y = baseY - amp * prof(u);
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = alpha(lighten(pal.haze, 0.25), 0.62 - d * 0.18);
      ctx.lineWidth = 1.2 + d * 1.8;
      ctx.stroke();
    }
  }

  function drawWater(ctx, w, h, t, o, pal) {
    const topY = o.horizon * h;
    const g = ctx.createLinearGradient(0, topY, 0, h);
    g.addColorStop(0, mix(pal.water[0], pal.haze, 0.42));
    g.addColorStop(0.35, mix(pal.water[0], pal.water[1], 0.5));
    g.addColorStop(1, pal.water[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, topY, w, h - topY);

    const span = h - topY;
    const rings = Math.round(o.rings);
    for (let j = 0; j < rings; j++) {
      const v = j / rings;
      const y = topY + Math.pow(v, 1.7) * span;
      const amp = 0.8 + v * 5 * o.rough;
      const sp = 0.5 + v * 1.5;
      ctx.beginPath();
      const steps = 10;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * w;
        const yy = y + Math.sin(x * 0.02 + t * sp + j * 0.6) * amp * 0.4;
        if (s === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      const flick = 0.5 + 0.5 * Math.sin(t * 0.8 + j);
      ctx.strokeStyle = alpha('#ffffff', (0.015 + 0.1 * (1 - v)) * (0.4 + flick));
      ctx.lineWidth = 0.8 + v * 1.8;
      ctx.stroke();
    }

    if (o.sunColumn) {
      const sx = o.sunColumnX * w;
      for (let i = 0; i < 44; i++) {
        const v = i / 44;
        const y = topY + Math.pow(v, 1.35) * span;
        const spread = (0.015 + v * 0.16) * w;
        const jitter = Math.sin(t * 0.9 + i * 1.3) * spread * 0.5;
        const wdt = spread * (0.22 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.25 + i * 1.7)));
        ctx.fillStyle = alpha(pal.sun, 0.3 * (1 - v));
        ctx.fillRect(sx + jitter - wdt / 2, y, wdt, 1.4 + v * 2.6);
      }
    }

    if (o.sparkle) {
      const rnd = mulberry32(o.seed + 67);
      for (let i = 0; i < 70; i++) {
        const v = rnd();
        const x = rnd() * w;
        const y = topY + Math.pow(v, 1.5) * span;
        const a = 0.25 * (0.5 + 0.5 * Math.sin(t * (1.5 + rnd() * 2) + i));
        ctx.fillStyle = alpha('#ffffff', a);
        ctx.beginPath(); ctx.ellipse(x, y, 1 + rnd() * 2.4, 0.6, 0, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawWaves(ctx, w, h, t, o, pal) {
    const topY = o.horizon * h;
    const span = h - topY;
    const n = o.count;
    for (let i = 0; i < n; i++) {
      const v = i / n;
      const phase = t * (0.35 + v * 0.7) + i * 1.6;
      const y = topY + (0.1 + v * 0.88) * span + Math.sin(phase * 0.8) * (2 + v * 5);
      ctx.beginPath();
      const steps = 14;
      for (let s = 0; s <= steps; s++) {
        const x = (s / steps) * w;
        const yy = y + Math.sin(x * 0.014 + phase) * (2.5 + v * 4);
        if (s === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      const a = (0.3 - v * 0.17) * (0.55 + 0.45 * Math.sin(phase));
      ctx.strokeStyle = alpha('#ffffff', Math.max(0.03, a));
      ctx.lineWidth = 1.2 + v * 3.2;
      ctx.stroke();
      if (i % 2 === 0) {
        const rnd = mulberry32(o.seed + i * 5);
        for (let k = 0; k < 16; k++) {
          const x = rnd() * w;
          const yy = y + Math.sin(x * 0.014 + phase) * (2.5 + v * 4) + (rnd() - 0.5) * 3;
          ctx.fillStyle = alpha('#ffffff', Math.max(0.02, a * 0.9));
          ctx.fillRect(x, yy, 8 + rnd() * 26, 1 + v * 2);
        }
      }
    }
  }

  function drawBirds(ctx, w, h, t, o, pal) {
    const rnd = mulberry32(o.seed + 79);
    for (let i = 0; i < o.count; i++) {
      const dir = o.dir;
      const sp = (0.02 + rnd() * 0.045) * w;
      const base = rnd();
      let x = (base + (t * sp * dir) / w) % 1.3;
      if (x < 0) x += 1.3;
      const px = x * w - w * 0.15;
      const py = o.y * h + (rnd() - 0.5) * o.spread * h + Math.sin(t * 0.6 + i * 1.7) * 4;
      const size = (0.9 + rnd() * 1.5) * o.size;
      const flap = Math.sin(t * (3.4 + rnd() * 2.2) + i * 2.1);
      const c = o.color || '#2b2b33';
      ctx.strokeStyle = alpha(c, 0.72);
      ctx.lineWidth = Math.max(1, size * 0.42);
      ctx.beginPath();
      ctx.moveTo(px - size, py + flap * size * 0.55);
      ctx.quadraticCurveTo(px - size * 0.4, py - size * 0.35, px, py);
      ctx.quadraticCurveTo(px + size * 0.4, py - size * 0.35, px + size, py + flap * size * 0.55);
      ctx.stroke();
    }
  }

  /* ---------------- 中式地景剪影 ---------------- */

  function roofShape(ctx, x, y, w, hh) {
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.45, y - hh * 0.95, x, y - hh);
    ctx.quadraticCurveTo(x + w * 0.45, y - hh * 0.95, x + w, y);
    ctx.quadraticCurveTo(x + w * 0.55, y - hh * 0.32, x, y - hh * 0.4);
    ctx.quadraticCurveTo(x - w * 0.55, y - hh * 0.32, x - w, y);
    ctx.closePath();
  }

  function windowLights(ctx, x, y, w, hh, cols, rows, pal, t, seed, strength) {
    const rnd = mulberry32(seed);
    const cw = w / cols, ch = hh / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const on = rnd() > 0.42;
        if (!on) continue;
        const a = strength * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * (0.6 + rnd() * 1.4) + i * 2 + j)));
        const g = ctx.createRadialGradient(x + i * cw + cw / 2, y + j * ch + ch / 2, 0,
          x + i * cw + cw / 2, y + j * ch + ch / 2, cw * 1.9);
        g.addColorStop(0, alpha(pal.light, a));
        g.addColorStop(1, alpha(pal.light, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x + i * cw - cw, y + j * ch - ch, cw * 3, ch * 3);
        ctx.fillStyle = alpha(pal.light, Math.min(1, a * 1.5));
        ctx.fillRect(x + i * cw + cw * 0.22, y + j * ch + ch * 0.2, cw * 0.56, ch * 0.5);
      }
    }
  }

  function drawLandmark(ctx, w, h, t, o, pal) {
    const baseY = o.base * h;
    const s = o.scale * Math.min(w, h * 1.3) / 300;
    ctx.save();
    const bodyCol = mix(o.color || pal.ridge[2], pal.haze, o.haze || 0.12);
    const dark = mix(bodyCol, '#000000', 0.3);
    const v = o.variant;

    if (v === 'pavilion') {
      const bw = 46 * s, bh = 26 * s, rh = 30 * s;
      ctx.fillStyle = bodyCol;
      ctx.fillRect(o.x * w - bw * 0.36, baseY - bh, bw * 0.72, bh);
      ctx.fillStyle = dark;
      ctx.fillRect(o.x * w - bw * 0.5, baseY - 4 * s, bw, 4 * s);
      ctx.fillStyle = dark;
      for (let k = -1; k <= 1; k++) ctx.fillRect(o.x * w + k * bw * 0.3 - 1.4 * s, baseY - bh, 2.8 * s, bh);
      ctx.fillStyle = bodyCol;
      roofShape(ctx, o.x * w, baseY - bh - rh * 0.1, bw * 0.78, rh);
      ctx.fill();
      ctx.fillRect(o.x * w - 1.2 * s, baseY - bh - rh * 1.28, 2.4 * s, 12 * s);
      if (o.lights) {
        const g = ctx.createRadialGradient(o.x * w, baseY - bh * 0.55, 0, o.x * w, baseY - bh * 0.55, bw * 1.5);
        g.addColorStop(0, alpha(pal.light, 0.5 * (0.65 + 0.35 * Math.sin(t * 1.1))));
        g.addColorStop(1, alpha(pal.light, 0));
        ctx.fillStyle = g;
        ctx.fillRect(o.x * w - bw * 1.6, baseY - bh * 2.2, bw * 3.2, bh * 3);
      }
    } else if (v === 'pagoda') {
      const tiers = 5;
      let cw = 40 * s;
      const tierH = 15 * s;
      for (let i = 0; i < tiers; i++) {
        const y = baseY - i * tierH * 0.92;
        ctx.fillStyle = i % 2 ? darken(bodyCol, 0.1) : bodyCol;
        ctx.fillRect(o.x * w - cw * 0.6, y - tierH * 0.55, cw * 1.2, tierH * 0.55);
        ctx.fillStyle = dark;
        roofShape(ctx, o.x * w, y - tierH * 0.5, cw * 0.95, tierH * 0.7);
        ctx.fill();
        cw *= 0.86;
      }
      ctx.fillStyle = dark;
      ctx.fillRect(o.x * w - 1.3 * s, baseY - tiers * tierH * 0.92 - 14 * s, 2.6 * s, 16 * s);
      if (o.lights) windowLights(ctx, o.x * w - 14 * s, baseY - 46 * s, 28 * s, 44 * s, 2, 4, pal, t, o.seed + 3, 0.55);
    } else if (v === 'huizhou') {
      const houses = o.count || 3;
      for (let i = 0; i < houses; i++) {
        const bw = (26 + i * 6) * s;
        const bh = (22 + i * 5) * s;
        const cx = o.x * w + (i - (houses - 1) / 2) * bw * 1.05;
        const wall = mix('#f2efe6', pal.haze, 0.3);
        ctx.fillStyle = alpha(wall, 0.92);
        ctx.fillRect(cx - bw / 2, baseY - bh, bw, bh);
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(cx - bw * 0.62, baseY - bh);
        ctx.lineTo(cx, baseY - bh - 10 * s);
        ctx.lineTo(cx + bw * 0.62, baseY - bh);
        ctx.closePath(); ctx.fill();
        ctx.fillRect(cx - bw * 0.58, baseY - bh - 1.5 * s, bw * 0.16, 8 * s);
        ctx.fillRect(cx + bw * 0.4, baseY - bh - 1.5 * s, bw * 0.16, 8 * s);
        if (o.lights && i === 1) {
          const g = ctx.createRadialGradient(cx, baseY - bh * 0.45, 0, cx, baseY - bh * 0.45, bw);
          g.addColorStop(0, alpha(pal.light, 0.5));
          g.addColorStop(1, alpha(pal.light, 0));
          ctx.fillStyle = g; ctx.fillRect(cx - bw, baseY - bh * 1.3, bw * 2, bh * 2);
        }
        if (o.lights) {
          ctx.fillStyle = alpha(pal.light, 0.75);
          ctx.fillRect(cx - bw * 0.1, baseY - bh * 0.62, bw * 0.2, bh * 0.18);
        }
      }
    } else if (v === 'diaojao') {
      const houses = o.count || 3;
      for (let i = 0; i < houses; i++) {
        const bw = (24 + i * 5) * s, bh = 18 * s;
        const cx = o.x * w + (i - (houses - 1) / 2) * bw * 1.1;
        const by = baseY - i * 9 * s;
        ctx.strokeStyle = dark; ctx.lineWidth = Math.max(1, 1.4 * s);
        for (let k = -1; k <= 1; k++) {
          ctx.beginPath(); ctx.moveTo(cx + k * bw * 0.34, by); ctx.lineTo(cx + k * bw * 0.34, by + bh * 0.9); ctx.stroke();
        }
        ctx.fillStyle = bodyCol;
        ctx.fillRect(cx - bw / 2, by - bh, bw, bh);
        ctx.fillStyle = dark;
        ctx.beginPath(); ctx.moveTo(cx - bw * 0.66, by - bh);
        ctx.lineTo(cx, by - bh - 9 * s); ctx.lineTo(cx + bw * 0.66, by - bh); ctx.closePath(); ctx.fill();
        if (o.lights) {
          const a = 0.6 + 0.4 * Math.sin(t * 0.9 + i);
          const g = ctx.createRadialGradient(cx, by - bh * 0.5, 0, cx, by - bh * 0.5, bw * 0.9);
          g.addColorStop(0, alpha(pal.light, 0.62 * a)); g.addColorStop(1, alpha(pal.light, 0));
          ctx.fillStyle = g; ctx.fillRect(cx - bw, by - bh * 1.4, bw * 2, bh * 1.8);
        }
      }
    } else if (v === 'dome') {
      const bw = 34 * s, bh = 30 * s, r = 15 * s;
      const body2 = mix(bodyCol, '#ffffff', 0.16);
      ctx.fillStyle = body2;
      ctx.fillRect(o.x * w - bw / 2, baseY - bh, bw, bh);
      ctx.beginPath();
      ctx.moveTo(o.x * w - r, baseY - bh);
      ctx.bezierCurveTo(o.x * w - r * 1.25, baseY - bh - r * 1.5, o.x * w - r * 0.35, baseY - bh - r * 1.75, o.x * w, baseY - bh - r * 1.75);
      ctx.bezierCurveTo(o.x * w + r * 0.35, baseY - bh - r * 1.75, o.x * w + r * 1.25, baseY - bh - r * 1.5, o.x * w + r, baseY - bh);
      ctx.closePath();
      ctx.fillStyle = dark; ctx.fill();
      ctx.fillRect(o.x * w - 1.2 * s, baseY - bh - r * 2.4, 2.4 * s, 9 * s);
      ctx.fillRect(o.x * w - 5 * s, baseY - bh - r * 2.1, 10 * s, 2.2 * s);
      if (o.lights) {
        windowLights(ctx, o.x * w - bw * 0.36, baseY - bh * 0.78, bw * 0.72, bh * 0.6, 2, 2, pal, t, o.seed + 9, 0.55);
        const g = ctx.createRadialGradient(o.x * w, baseY - bh * 0.5, 0, o.x * w, baseY - bh * 0.5, bw * 2);
        g.addColorStop(0, alpha(pal.light, 0.14)); g.addColorStop(1, alpha(pal.light, 0));
        ctx.fillStyle = g; ctx.fillRect(o.x * w - bw * 2, baseY - bh * 2, bw * 4, bh * 3);
      }
    } else if (v === 'lighthouse') {
      const bw = 9 * s, th = 52 * s;
      ctx.fillStyle = bodyCol;
      ctx.beginPath();
      ctx.moveTo(o.x * w - bw, baseY); ctx.lineTo(o.x * w + bw, baseY);
      ctx.lineTo(o.x * w + bw * 0.6, baseY - th); ctx.lineTo(o.x * w - bw * 0.6, baseY - th);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(o.x * w - bw * 0.9, baseY - th * 0.62, bw * 1.8, 3 * s);
      ctx.fillRect(o.x * w - bw * 0.9, baseY - th * 0.3, bw * 1.8, 3 * s);
      ctx.fillStyle = mix(bodyCol, '#000000', 0.45);
      ctx.fillRect(o.x * w - bw * 0.95, baseY - th - 7 * s, bw * 1.9, 7 * s);
      const pulse = 0.35 + 0.65 * Math.pow(Math.max(0, Math.sin(t * 0.55)), 3);
      const beam = ctx.createLinearGradient(o.x * w, baseY - th - 3 * s, o.x * w + w * 0.55, baseY - th - 26 * s);
      beam.addColorStop(0, alpha(pal.light, 0.42 * pulse));
      beam.addColorStop(1, alpha(pal.light, 0));
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(o.x * w, baseY - th - 3 * s);
      ctx.lineTo(o.x * w + w * 0.55, baseY - th - 40 * s);
      ctx.lineTo(o.x * w + w * 0.55, baseY - th + 16 * s);
      ctx.closePath(); ctx.fill();
      const g = ctx.createRadialGradient(o.x * w, baseY - th - 3.5 * s, 0, o.x * w, baseY - th - 3.5 * s, 14 * s);
      g.addColorStop(0, alpha(pal.light, 0.95 * (0.5 + 0.5 * pulse)));
      g.addColorStop(1, alpha(pal.light, 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(o.x * w, baseY - th - 3.5 * s, 14 * s, 0, 6.283); ctx.fill();
    } else if (v === 'yurt') {
      const r = 16 * s;
      ctx.fillStyle = mix('#f4f1e6', pal.haze, 0.25);
      ctx.beginPath();
      ctx.moveTo(o.x * w - r, baseY);
      ctx.quadraticCurveTo(o.x * w - r * 1.05, baseY - r * 0.95, o.x * w, baseY - r * 0.98);
      ctx.quadraticCurveTo(o.x * w + r * 1.05, baseY - r * 0.95, o.x * w + r, baseY);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = dark;
      ctx.fillRect(o.x * w - r * 1.05, baseY - 2 * s, r * 2.1, 2.4 * s);
      ctx.fillRect(o.x * w - r * 0.16, baseY - r * 0.5, r * 0.32, r * 0.5);
      ctx.fillRect(o.x * w - 1 * s, baseY - r * 1.5, 2 * s, r * 0.55);
      if (o.lights) {
        const g = ctx.createRadialGradient(o.x * w, baseY - r * 0.4, 0, o.x * w, baseY - r * 0.4, r * 1.6);
        g.addColorStop(0, alpha(pal.light, 0.42)); g.addColorStop(1, alpha(pal.light, 0));
        ctx.fillStyle = g; ctx.fillRect(o.x * w - r * 2, baseY - r * 1.8, r * 4, r * 2.4);
      }
    } else if (v === 'bridge') {
      const bw = 52 * s, bh = 20 * s;
      ctx.fillStyle = dark;
      ctx.beginPath();
      ctx.moveTo(o.x * w - bw, baseY);
      ctx.quadraticCurveTo(o.x * w, baseY - bh * 1.5, o.x * w + bw, baseY);
      ctx.lineTo(o.x * w + bw, baseY - 3 * s);
      ctx.quadraticCurveTo(o.x * w, baseY - bh * 1.5 - 3.4 * s, o.x * w - bw, baseY - 3 * s);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = alpha(dark, 0.55);
      ctx.beginPath();
      ctx.moveTo(o.x * w - bw * 0.72, baseY);
      ctx.quadraticCurveTo(o.x * w, baseY - bh * 1.05, o.x * w + bw * 0.72, baseY);
      ctx.quadraticCurveTo(o.x * w, baseY - bh * 0.8, o.x * w - bw * 0.72, baseY);
      ctx.fill();
      ctx.strokeStyle = alpha(bodyCol, 0.6);
      ctx.lineWidth = Math.max(0.8, 1.2 * s);
      for (let k = -2; k <= 2; k++) {
        ctx.beginPath();
        const px = o.x * w + k * bw * 0.32;
        ctx.moveTo(px, baseY - 2 * s);
        ctx.lineTo(px, baseY - bh * 1.45 + Math.abs(k) * bh * 0.22);
        ctx.stroke();
      }
    } else if (v === 'redroof') {
      const rnd = mulberry32(o.seed + 13);
      const rows = o.rows || 3;
      for (let r = 0; r < rows; r++) {
        const count = 5 - r;
        const ry = baseY - r * 14 * s;
        for (let i = 0; i < count; i++) {
          const bw = (12 + rnd() * 6) * s, bh = (10 + rnd() * 5) * s;
          const cx = o.x * w + ((i - (count - 1) / 2) * 20 * s) + (rnd() - 0.5) * 4 * s;
          ctx.fillStyle = alpha(mix('#fbf7ec', pal.haze, 0.14), 0.96);
          ctx.fillRect(cx - bw / 2, ry - bh, bw, bh);
          ctx.fillStyle = mix('#c4623f', pal.haze, 0.24 + r * 0.12);
          ctx.beginPath();
          ctx.moveTo(cx - bw * 0.66, ry - bh);
          ctx.lineTo(cx, ry - bh - bh * 0.72);
          ctx.lineTo(cx + bw * 0.66, ry - bh);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = alpha(mix('#5c8a5f', pal.haze, 0.4 + r * 0.1), 0.88);
        for (let i = 0; i < count + 1; i++) {
          const cx = o.x * w + (i - count / 2) * 20 * s;
          ctx.beginPath(); ctx.arc(cx, ry - 3 * s, (5 + rnd() * 3) * s, 0, 6.283); ctx.fill();
        }
      }
    } else if (v === 'oldtown') {
      const rnd = mulberry32(o.seed + 29);
      const count = o.count || 4;
      for (let i = 0; i < count; i++) {
        const bw = (20 + rnd() * 14) * s, bh = (20 + rnd() * 14) * s;
        const cx = o.x * w + ((i - (count - 1) / 2) * 24 * s);
        const col = mix(o.color || '#c69a6a', pal.haze, 0.16 + rnd() * 0.2);
        ctx.fillStyle = col;
        ctx.fillRect(cx - bw / 2, baseY - bh, bw, bh);
        if (rnd() > 0.5) {
          ctx.beginPath();
          ctx.arc(cx, baseY - bh, bw * 0.28, Math.PI, 0);
          ctx.fill();
        } else {
          ctx.fillStyle = darken(col, 0.18);
          ctx.fillRect(cx - bw * 0.62, baseY - bh, bw * 1.24, 3 * s);
        }
        ctx.fillStyle = alpha(mix('#3a2a20', pal.haze, 0.2), 0.85);
        ctx.beginPath();
        ctx.moveTo(cx - bw * 0.16, baseY);
        ctx.lineTo(cx - bw * 0.16, baseY - bh * 0.42);
        ctx.quadraticCurveTo(cx, baseY - bh * 0.68, cx + bw * 0.16, baseY - bh * 0.42);
        ctx.lineTo(cx + bw * 0.16, baseY);
        ctx.closePath(); ctx.fill();
        if (o.lights) {
          const a = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 1.4);
          const g = ctx.createRadialGradient(cx, baseY - bh * 0.25, 0, cx, baseY - bh * 0.25, bw * 1.1);
          g.addColorStop(0, alpha(pal.light, 0.4 * a)); g.addColorStop(1, alpha(pal.light, 0));
          ctx.fillStyle = g; ctx.fillRect(cx - bw, baseY - bh * 1.2, bw * 2, bh * 1.6);
        }
      }
      const tw = 8 * s, th = 58 * s;
      ctx.fillStyle = mix('#c69a6a', pal.haze, 0.1);
      ctx.fillRect(o.x * w + 52 * s - tw / 2, baseY - th, tw, th);
      ctx.fillStyle = dark;
      ctx.beginPath(); ctx.arc(o.x * w + 52 * s, baseY - th, tw * 0.85, Math.PI, 0); ctx.fill();
      ctx.fillRect(o.x * w + 52 * s - 0.9 * s, baseY - th - 10 * s, 1.8 * s, 10 * s);
    } else if (v === 'city') {
      const rnd = mulberry32(o.seed + 37);
      const hills = o.hills || [[0.0, 1], [0.04, 0.86], [0.1, 0.7]];
      for (let L = 0; L < hills.length; L++) {
        const [drop, shrink] = hills[L];
        const y = baseY - L * 0;
        let x = -10 * s;
        while (x < w + 10 * s) {
          const bw = (16 + rnd() * 22) * s * shrink;
          const bh = (24 + rnd() * 70) * s * shrink * (1 - drop);
          const top = y - bh - (h - baseY) * drop;
          ctx.fillStyle = alpha(mix(pal.ridge[2], '#000000', 0.15 - L * 0.05), 0.96);
          ctx.fillRect(x, top, bw, bh + (h - baseY) * drop + 2);
          windowLights(ctx, x + bw * 0.12, top + bh * 0.14, bw * 0.76, bh * 0.72,
            Math.max(1, Math.round(bw / (9 * s))), Math.max(2, Math.round(bh / (12 * s))),
            pal, t, o.seed + L * 31 + Math.round(x), 0.55);
          x += bw + (3 + rnd() * 6) * s;
        }
      }
    }
    ctx.restore();
  }

  function drawPrayerFlags(ctx, w, h, t, o, pal) {
    const colors = ['#d94f3d', '#f2c14e', '#3f8f6b', '#3f6fb5', '#f4f1e6'];
    const y0 = o.y * h;
    for (let i = 0; i < o.count; i++) {
      const y = y0 - i * 11;
      const sag = Math.sin(t * 0.9 + i * 0.7) * 2.4;
      const left = w * (0.06 + i * 0.012);
      const right = w * (0.94 - i * 0.012);
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.quadraticCurveTo(w * 0.5, y + 16 + sag, right, y - 2);
      ctx.strokeStyle = alpha('#ffffff', 0.25);
      ctx.lineWidth = 1;
      ctx.stroke();
      const n = 11;
      for (let k = 1; k < n; k++) {
        const u = k / n;
        const x = left + (right - left) * u;
        const yy = y + 16 * (1 - Math.abs(2 * u - 1)) * 0.9 + sag * (1 - Math.abs(2 * u - 1));
        ctx.fillStyle = alpha(colors[k % colors.length], 0.85);
        ctx.fillRect(x - 2.4, yy, 4.8, 6.4);
      }
    }
  }

  function drawBoat(ctx, w, h, t, o, pal) {
    const y = o.y * h + Math.sin(t * 0.7 + o.phase) * 2.2;
    const x = ((o.x + t * o.speed * 0.01) % 1.4 - 0.2) * w;
    const s = o.scale * Math.min(w, h * 1.4) / 300;
    const col = mix(o.color || '#2c2a33', pal.haze, 0.12);
    ctx.save();
    if (o.kind === 'raft') {
      ctx.fillStyle = alpha(col, 0.92);
      ctx.beginPath();
      ctx.moveTo(x - 22 * s, y); ctx.lineTo(x + 22 * s, y);
      ctx.lineTo(x + 17 * s, y + 5 * s); ctx.lineTo(x - 17 * s, y + 5 * s);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = alpha(col, 0.92);
      ctx.lineWidth = Math.max(1, 1.6 * s);
      for (let i = 0; i < 7; i++) {
        const bx = x - 20 * s + i * 6.4 * s;
        ctx.beginPath(); ctx.moveTo(bx, y - 1.2 * s); ctx.lineTo(bx + 1.2 * s, y + 4 * s); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(x + 8 * s, y);
      ctx.lineTo(x + 16 * s, y - 20 * s);
      ctx.stroke();
      ctx.fillStyle = alpha(col, 0.8);
      ctx.beginPath();
      ctx.arc(x + 17 * s, y - 22 * s, 3.4 * s, 0, 6.283); ctx.fill();
      ctx.fillRect(x + 16.4 * s, y - 20 * s, 1.4 * s, 18 * s);
    } else {
      ctx.fillStyle = alpha(col, 0.9);
      ctx.beginPath();
      ctx.moveTo(x - 20 * s, y);
      ctx.quadraticCurveTo(x, y + 8 * s, x + 20 * s, y);
      ctx.lineTo(x + 15 * s, y - 2 * s);
      ctx.lineTo(x - 15 * s, y - 2 * s);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, y - 2 * s);
      ctx.lineTo(x, y - 34 * s);
      ctx.lineTo(x + 16 * s, y - 3 * s);
      ctx.closePath();
      ctx.fillStyle = alpha(mix('#fbf6ea', pal.haze, 0.22), 0.94);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCamels(ctx, w, h, t, o, pal) {
    const baseY = o.y * h;
    const s = o.scale * Math.min(w, h * 1.4) / 300;
    const col = mix('#33241c', pal.haze, 0.2);
    for (let i = 0; i < o.count; i++) {
      const x = ((o.x + i * 0.07 + t * 0.005) % 1.25 - 0.12) * w;
      const y = baseY + Math.sin(t * 0.8 + i) * 1.4;
      const bob = Math.sin(t * 1.5 + i * 1.1);
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = alpha(col, 0.9);
      ctx.strokeStyle = alpha(col, 0.9);
      // 四条腿
      ctx.lineWidth = Math.max(1, 1.5 * s);
      const legs = [[-6.6, -1], [-2.6, 1], [3.2, -1], [6.8, 1]];
      for (let k = 0; k < legs.length; k++) {
        const lx = legs[k][0] * s;
        ctx.beginPath();
        ctx.moveTo(lx, -6 * s);
        ctx.lineTo(lx + bob * 1.5 * s * legs[k][1], 0);
        ctx.stroke();
      }
      // 身体与双峰
      ctx.beginPath(); ctx.ellipse(0, -12 * s, 10.5 * s, 5.4 * s, 0, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.arc(-3.4 * s, -15 * s, 3.4 * s, Math.PI, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(3.2 * s, -14.6 * s, 3 * s, Math.PI, 0); ctx.fill();
      // 脖子与头
      ctx.beginPath();
      ctx.moveTo(8.5 * s, -13 * s);
      ctx.quadraticCurveTo(15.5 * s, -18 * s, 15.2 * s, -25 * s);
      ctx.lineWidth = Math.max(1, 2.6 * s);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(16.2 * s, -26.5 * s, 3.4 * s, 2.3 * s, -0.4, 0, 6.283); ctx.fill();
      ctx.beginPath(); ctx.moveTo(18.4 * s, -27.6 * s); ctx.lineTo(20.8 * s, -29.2 * s);
      ctx.lineWidth = Math.max(1, 1.1 * s); ctx.stroke();
      // 尾巴
      ctx.beginPath();
      ctx.moveTo(-10 * s, -13 * s);
      ctx.quadraticCurveTo(-13.5 * s, -11 * s, -13 * s, -8 * s);
      ctx.lineWidth = Math.max(1, 1.1 * s); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------------- 前景 ---------------- */

  function drawForeground(ctx, w, h, t, o, pal) {
    const baseY = o.base * h;
    const kind = o.kind;
    const rnd = mulberry32(o.seed + 89);

    if (kind === 'none') return;

    if (kind === 'grass' || kind === 'rapeseed' || kind === 'field') {
      const groundCol = kind === 'rapeseed' ? mix('#8fae4a', pal.ground, 0.3) : pal.ground;
      const g = ctx.createLinearGradient(0, baseY, 0, h);
      g.addColorStop(0, alpha(groundCol, 0.5));
      g.addColorStop(1, alpha(darken(groundCol, 0.28), 0.92));
      ctx.fillStyle = g;
      ctx.fillRect(0, baseY, w, h - baseY);
      const blades = o.blades || 260;
      for (let i = 0; i < blades; i++) {
        const u = i / blades;
        const x = u * w * 1.02 - w * 0.01;
        const hh = (h - baseY) * (0.18 + rnd() * 0.62) * o.height;
        const sway = Math.sin(t * (0.9 + rnd() * 0.7) + x * 0.035) * hh * 0.34;
        const c = kind === 'rapeseed'
          ? mix('#7ba63f', '#d7dc63', rnd())
          : mix(pal.ground, lighten(pal.ground, 0.45), rnd() * 0.9);
        ctx.strokeStyle = alpha(c, 0.55 + rnd() * 0.45);
        ctx.lineWidth = 0.9 + rnd() * 1.7;
        ctx.beginPath();
        ctx.moveTo(x, baseY + (h - baseY) * 0.06);
        ctx.quadraticCurveTo(x + sway * 0.45, baseY - hh * 0.5, x + sway, baseY - hh);
        ctx.stroke();
        if (kind === 'rapeseed' && rnd() > 0.3) {
          ctx.fillStyle = alpha('#f8e75f', 0.6 + rnd() * 0.4);
          ctx.beginPath(); ctx.arc(x + sway, baseY - hh, 1.4 + rnd() * 1.7, 0, 6.283); ctx.fill();
        }
      }
      if (o.sheep) {
        for (let i = 0; i < o.sheep; i++) {
          const x = rnd() * w;
          const y = h - (h - baseY) * (0.1 + rnd() * 0.35);
          const s2 = 1.6 + rnd() * 1.6;
          const bob = Math.sin(t * 0.9 + i) * 0.6;
          ctx.fillStyle = alpha('#f4f2ec', 0.9);
          ctx.beginPath(); ctx.ellipse(x, y + bob, 4 * s2, 2.6 * s2, 0, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(x + 3.4 * s2, y + bob - 0.4, 1.7 * s2, 0, 6.283); ctx.fill();
          ctx.strokeStyle = alpha('#3a3a34', 0.5); ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(x - 1.5 * s2, y + bob + 2.2 * s2); ctx.lineTo(x - 1.5 * s2, y + bob + 3.6 * s2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 1.5 * s2, y + bob + 2.2 * s2); ctx.lineTo(x + 1.5 * s2, y + bob + 3.6 * s2); ctx.stroke();
        }
      }
    } else if (kind === 'snow') {
      const g = ctx.createLinearGradient(0, baseY, 0, h);
      g.addColorStop(0, alpha('#e3eaf8', 0.7));
      g.addColorStop(1, alpha('#b6c2dc', 0.95));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, baseY + 6);
      for (let s = 0; s <= 40; s++) {
        const u = s / 40, x = u * w;
        ctx.lineTo(x, baseY + Math.sin(u * 5 + o.seed) * 4 + 4);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 90; i++) {
        const x = rnd() * w, y = baseY + rnd() * (h - baseY);
        ctx.fillStyle = alpha('#ffffff', 0.15 + 0.5 * (0.5 + 0.5 * Math.sin(t * 2 + i)));
        ctx.beginPath(); ctx.arc(x, y, 0.6 + rnd() * 1.4, 0, 6.283); ctx.fill();
      }
    } else if (kind === 'bamboo') {
      for (let i = 0; i < 26; i++) {
        const x = (i / 26) * w + (rnd() - 0.5) * w * 0.04;
        const hh = (h - baseY) * (0.7 + rnd() * 0.8);
        const sway = Math.sin(t * (0.5 + rnd() * 0.5) + i) * hh * 0.05;
        const wdt = (2 + rnd() * 3.4) * (0.7 + (h - baseY) / h);
        const c = mix('#2f4a30', '#7b9c63', rnd() * 0.7);
        ctx.strokeStyle = alpha(c, 0.55 + rnd() * 0.4);
        ctx.lineWidth = wdt;
        ctx.beginPath();
        ctx.moveTo(x, h + 10);
        ctx.quadraticCurveTo(x + sway * 0.5, h - hh * 0.6, x + sway, h - hh);
        ctx.stroke();
        for (let k = 1; k < 5; k++) {
          const u = k / 5;
          const lx = x + sway * u * u, ly = h - hh * u;
          ctx.strokeStyle = alpha(mix(c, '#d8e4b8', 0.4), 0.4);
          ctx.lineWidth = 0.9;
          const dir = k % 2 ? 1 : -1;
          ctx.beginPath();
          ctx.moveTo(lx, ly);
          ctx.quadraticCurveTo(lx + dir * 20, ly - 8 + Math.sin(t + k) * 3, lx + dir * 34, ly - 16 + Math.sin(t + k) * 5);
          ctx.stroke();
        }
      }
    } else if (kind === 'willow') {
      const strands = 14;
      for (let i = 0; i < strands; i++) {
        const x = (i / (strands - 1)) * w * 1.06 - w * 0.03;
        const len = (h * (0.16 + rnd() * 0.3));
        const sway = Math.sin(t * (0.6 + rnd() * 0.5) + i * 0.8) * (10 + rnd() * 18);
        const c = mix('#4a6b3c', '#89a860', rnd());
        ctx.strokeStyle = alpha(c, 0.28 + rnd() * 0.28);
        ctx.lineWidth = 0.7 + rnd() * 0.9;
        ctx.beginPath();
        ctx.moveTo(x, -4);
        ctx.bezierCurveTo(x + sway * 0.3, len * 0.35, x + sway * 0.8, len * 0.7, x + sway, len);
        ctx.stroke();
        for (let k = 1; k < 7; k++) {
          const u = k / 7;
          const px = x + sway * u * u, py = len * u;
          ctx.fillStyle = alpha(mix('#7fa050', '#c8dc9a', rnd()), 0.5);
          ctx.beginPath();
          ctx.ellipse(px + 3, py, 3.4, 1.2, 0.5, 0, 6.283); ctx.fill();
        }
      }
    } else if (kind === 'palms') {
      const list = o.count || 3;
      for (let i = 0; i < list; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const x = side < 0 ? w * (0.06 + i * 0.03) : w * (0.94 - i * 0.03);
        const hh = h * (0.6 + rnd() * 0.3);
        const lean = side * (0.06 + rnd() * 0.05) * w;
        const baseYY = h + 4;
        ctx.strokeStyle = alpha('#4a3a2c', 0.9);
        ctx.lineWidth = 2.4 + rnd() * 2;
        ctx.beginPath();
        ctx.moveTo(x, baseYY);
        ctx.quadraticCurveTo(x + lean * 0.5, baseYY - hh * 0.6, x + lean, baseYY - hh);
        ctx.stroke();
        const tx = x + lean, ty = baseYY - hh;
        for (let k = 0; k < 7; k++) {
          const ang = -Math.PI + (k / 6) * Math.PI + Math.sin(t * 0.8 + k + i) * 0.06;
          ctx.strokeStyle = alpha(mix('#2f5e35', '#7fb35a', rnd()), 0.85);
          ctx.lineWidth = 1.6 + rnd() * 1.4;
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          const ex = tx + Math.cos(ang) * 34, ey = ty + Math.sin(ang) * 22 + 8;
          ctx.quadraticCurveTo(tx + Math.cos(ang) * 20, ty + Math.sin(ang) * 8 - 8, ex, ey);
          ctx.stroke();
        }
      }
    }
  }

  /* ---------------- 粒子 ---------------- */

  function drawParticles(ctx, w, h, t, o, pal) {
    const n = o.count;
    const rnd = mulberry32(o.seed + 97);
    const kind = o.kind;
    for (let i = 0; i < n; i++) {
      const x0 = rnd(), y0 = rnd(), sp = 0.4 + rnd() * 1.5, sz = rnd();
      if (kind === 'snow') {
        const x = ((x0 + 0.02 * sp * Math.sin(t * 0.6 + i)) % 1) * (w + 30) - 15;
        const y = ((y0 + t * 0.026 * sp * o.speed) % 1) * (h + 30) - 15;
        const r = (0.7 + sz * 2.1) * o.size;
        ctx.fillStyle = alpha('#ffffff', 0.35 + sz * 0.55);
        ctx.beginPath(); ctx.arc(x + Math.sin(t * 1.1 + i) * 6, y, r, 0, 6.283); ctx.fill();
      } else if (kind === 'petals') {
        const x = ((x0 + t * 0.03 * sp) % 1) * (w + 40) - 20;
        const y = ((y0 + t * 0.02 * sp) % 1) * (h + 40) - 20;
        const r = (1.6 + sz * 2.6) * o.size;
        const rot = t * (0.6 + sz) + i;
        ctx.save();
        ctx.translate(x + Math.sin(t * 0.8 + i) * 14, y);
        ctx.rotate(rot);
        ctx.fillStyle = alpha(o.color || '#f7c9d8', 0.5 + sz * 0.45);
        ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.55, 0, 0, 6.283); ctx.fill();
        ctx.restore();
      } else if (kind === 'rain') {
        const x = ((x0 + t * 0.06 * sp) % 1) * (w + 60) - 30;
        const y = ((y0 + t * 0.55 * sp * o.speed) % 1) * (h + 40) - 20;
        const len = (5 + sz * 11) * o.size;
        ctx.strokeStyle = alpha(o.color || '#eaf1f2', 0.05 + sz * 0.14);
        ctx.lineWidth = 0.6 + sz * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y); ctx.lineTo(x - len * 0.28, y + len);
        ctx.stroke();
      } else if (kind === 'sand') {
        const x = ((x0 + t * 0.09 * sp * o.speed) % 1) * (w + 80) - 40;
        const y = (y0 * 0.75 + 0.1) * h + Math.sin(t * 0.7 + i) * 8;
        const len = (16 + sz * 54) * o.size;
        ctx.fillStyle = alpha(o.color || pal.haze, 0.05 + sz * 0.16);
        ctx.fillRect(x, y, len, 0.8 + sz * 1.4);
      } else if (kind === 'fireflies') {
        const x = (x0 * 0.9 + 0.05 + Math.sin(t * (0.25 + sz * 0.4) + i) * 0.05) * w;
        const y = (0.45 + y0 * 0.5 + Math.sin(t * (0.2 + sz * 0.3) + i * 2) * 0.05) * h;
        const a = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(t * (0.9 + sz * 1.6) + i), 2);
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9 * o.size);
        g.addColorStop(0, alpha('#ffe9a0', 0.85 * a));
        g.addColorStop(1, alpha('#ffe9a0', 0));
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x, y, 9 * o.size, 0, 6.283); ctx.fill();
      }
    }
  }

  function drawVignette(ctx, w, h, o) {
    if (!o.amount) return;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.28, w * 0.5, h * 0.5, Math.max(w, h) * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(12,10,16,' + o.amount + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* ---------------- 场景渲染 ---------------- */

  const DEFAULTS = {
    horizon: 0.62,
    vignette: 0.22,
    clouds: false,
    stars: false,
    fog: false,
    terrain: 'none',
    water: 'none',
    waves: false,
    foreground: 'none',
    particles: null,
    landmark: null,
    boats: null,
    camels: null,
    birds: null,
    prayerFlags: null
  };

  function render(ctx, w, h, t, cfg) {
    const pal = PALETTES[cfg.palette] || PALETTES.brightDay;
    const o = Object.assign({}, DEFAULTS, cfg);
    const seed = cfg.seed || 1;
    o.seed = seed;

    drawSky(ctx, w, h, pal);

    if (o.stars && o.stars.density > 0) drawStars(ctx, w, h, t, Object.assign({ seed: seed, horizon: o.horizon }, o.stars), pal);
    if (o.sun) drawCelestial(ctx, w, h, t, o.sun, pal);
    if (o.clouds && o.clouds.count > 0) {
      drawClouds(ctx, w, h, t, Object.assign({ seed: seed, scale: 1, opacity: 0.6, speedScale: 1 }, o.clouds), pal);
    }
    if (o.fog && o.fog.opacity > 0) drawFog(ctx, w, h, t, Object.assign({ seed: seed }, o.fog), pal);

    if (o.terrain === 'ridges') drawRidges(ctx, w, h, t, Object.assign({ seed: seed }, o.terrainOpts), pal);
    else if (o.terrain === 'karst') drawKarst(ctx, w, h, t, Object.assign({ seed: seed }, o.terrainOpts), pal);
    else if (o.terrain === 'dunes') drawDunes(ctx, w, h, t, Object.assign({ seed: seed }, o.terrainOpts), pal);

    if (o.landmark && o.landmark.variant) {
      const lm = Object.assign({ seed: seed }, o.landmark);
      if (o.landmark.behindWater) {
        drawLandmark(ctx, w, h, t, lm, pal);
      } else {
        drawLandmark(ctx, w, h, t, lm, pal);
      }
    }

    if (o.prayerFlags) drawPrayerFlags(ctx, w, h, t, Object.assign({ seed: seed }, o.prayerFlags), pal);

    if (o.water !== 'none') {
      drawWater(ctx, w, h, t, Object.assign({ seed: seed, horizon: o.horizon, rough: 1, rings: 26, sparkle: true }, o.waterOpts || {}), pal);
      if (o.waves) drawWaves(ctx, w, h, t, Object.assign({ seed: seed, horizon: o.horizon }, o.waves), pal);
      if (o.boats) {
        const nb = o.boats.count || 1;
        for (let i = 0; i < nb; i++) {
          drawBoat(ctx, w, h, t, Object.assign({ seed: seed + i, phase: i * 2.1 }, o.boats, {
            x: (o.boats.x || 0.5) + i * 0.16,
            speed: (o.boats.speed || 0.3) * (i % 2 ? -1 : 1)
          }), pal);
        }
      }
    }

    if (o.camels) drawCamels(ctx, w, h, t, Object.assign({ seed: seed }, o.camels), pal);
    if (o.birds && o.birds.count > 0) drawBirds(ctx, w, h, t, Object.assign({ seed: seed, y: o.birds.y || 0.3, spread: 0.12, size: 1, dir: 1 }, o.birds), pal);

    drawForeground(ctx, w, h, t, Object.assign({ seed: seed, base: o.horizon + (1 - o.horizon) * 0.55, height: 1 }, o.foreground === 'none' ? { kind: 'none' } : o.foreground), pal);

    if (o.particles && o.particles.kind) drawParticles(ctx, w, h, t, Object.assign({ seed: seed, count: 60, speed: 1, size: 1 }, o.particles), pal);

    drawVignette(ctx, w, h, { amount: o.vignette });
  }

  /* ---------------- 运行调度 ---------------- */

  const shared = {
    items: [],
    motions: true,
    raf: null,
    last: 0,
    acc: 0,
    io: null,
    ensureObserver: function () {
      if (this.io || typeof IntersectionObserver === 'undefined') return;
      this.io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.target.__scene) e.target.__scene.visible = e.isIntersecting;
        });
      }, { rootMargin: '160px 0px' });
    },
    start: function () {
      if (this.raf !== null) return;
      const self = this;
      this.last = (global.performance || Date).now();
      const loop = function (now) {
        const dt = Math.min(0.06, (now - self.last) / 1000 || 0);
        self.last = now;
        self.acc += dt;
        const step = 1 / 32;
        let due = false;
        if (self.acc >= step) { self.acc = self.acc % step; due = true; }
        for (let i = 0; i < self.items.length; i++) {
          const it = self.items[i];
          if (!it.visible && !it.needsDraw) continue;
          if (it.motion && due) it.t += step * it.speed;
          if (due || it.needsDraw) {
            it.needsDraw = false;
            try {
              it.render();
            } catch (err) {
              // 单个画面出错不能拖垮其它画面：冻结它，并留下可排查的线索
              it.motion = false;
              if (global.console && console.error) console.error('[栖旅] 画面渲染出错：', err);
            }
          }
        }
        self.raf = global.requestAnimationFrame(loop);
      };
      this.raf = global.requestAnimationFrame(loop);
    }
  };

  function create(canvas, cfg, opts) {
    opts = opts || {};
    const ctx = canvas.getContext('2d');
    const conf = Object.assign({}, cfg);
    conf.seed = hashStr(opts.key || 'qiyu') % 100000;

    const item = {
      canvas: canvas,
      ctx: ctx,
      cfg: conf,
      t: (hashStr((opts.key || 'qiyu') + '#t') % 1000) / 22,
      speed: opts.speed || 1,
      motion: shared.motions,
      visible: false,
      needsDraw: true,
      dpr: 1,
      cssW: 0,
      cssH: 0,
      render: function () {
        const c = item.ctx;
        if (!item.cssW || !item.cssH) return;
        c.setTransform(item.dpr, 0, 0, item.dpr, 0, 0);
        c.clearRect(0, 0, item.cssW, item.cssH);
        render(c, item.cssW, item.cssH, item.t, item.cfg);
      },
      fit: function () {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return false;
        let dpr = Math.min(2, global.devicePixelRatio || 1);
        const maxPixels = 560000;
        const need = rect.width * rect.height * dpr * dpr;
        if (need > maxPixels) dpr = Math.max(1, dpr * Math.sqrt(maxPixels / need));
        const pw = Math.round(rect.width * dpr), ph = Math.round(rect.height * dpr);
        if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
        item.dpr = dpr;
        item.cssW = rect.width;
        item.cssH = rect.height;
        item.needsDraw = true;
        return true;
      },
      setMotion: function (on) { item.motion = on; item.needsDraw = true; },
      destroy: function () {
        const i = shared.items.indexOf(item);
        if (i >= 0) shared.items.splice(i, 1);
        if (shared.io) shared.io.unobserve(canvas);
      }
    };

    canvas.__scene = item;
    shared.items.push(item);
    shared.ensureObserver();
    if (shared.io) shared.io.observe(canvas); else item.visible = true;

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(function () { if (item.fit()) item.needsDraw = true; });
      ro.observe(canvas);
      item.ro = ro;
      const origDestroy = item.destroy;
      item.destroy = function () { ro.disconnect(); origDestroy(); };
    }

    item.fit();
    shared.start();
    return item;
  }

  function setMotion(on) {
    shared.motions = !!on;
    for (let i = 0; i < shared.items.length; i++) shared.items[i].setMotion(!!on);
  }

  global.Scenes = {
    PALETTES: PALETTES,
    create: create,
    setMotion: setMotion,
    render: render,
    count: function () { return shared.items.length; }
  };

  const mq = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  if (mq && mq.matches) setMotion(false);

})(window);
