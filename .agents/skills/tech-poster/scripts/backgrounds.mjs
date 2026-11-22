/* 内置画布背景：清单 + 旧 id 兼容 + Hero 主视觉 SVG（Node 与浏览器端共用，零外链） */

export const BACKGROUNDS = {
  'everest-blue': {
    name: '珠峰蓝（默认 · 分体）',
    mode: 'split',
    desc: '深蓝晨光 Hero + 低多边形珠峰雪顶 + 多层远山云雾，底部无缝渐隐到浅蓝正文'
  },
  'skyline-tech': {
    name: '科技城市（分体）',
    mode: 'split',
    desc: '亮蓝天空 Hero + 3D 立体柱群城市 + 透视地面网格与光环，底部雾化过渡'
  },
  'starfield': {
    name: '星际光柱（一体）',
    mode: 'unified',
    desc: '全画布深空蓝：光环星球 + 竖直光柱 + 地平光晕，正文延续星野星云'
  },
  'glass-aurora': {
    name: '玻璃浪潮（一体）',
    mode: 'unified',
    desc: '全画布浅蓝紫：玻璃浪带 + 悬浮代码晶片 + 柔光球与细线圆环，深色标题'
  },
  'clean-slate': {
    name: '纯净极简（一体）',
    mode: 'unified',
    desc: '浅色纸面 + 极轻点阵角标，打印友好'
  }
};

export const BACKGROUND_ALIASES = {
  'everest-night': 'starfield',
  'nebula-tech': 'starfield',
  'pixel-summit': 'skyline-tech',
  'glass-wave': 'glass-aurora',
  'aurora-mesh': 'glass-aurora',
  'blueprint-grid': 'everest-blue',
  'circuit-board': 'everest-blue',
  'dot-matrix': 'clean-slate',
  'topo-contour': 'everest-blue'
};

export function resolveBackground(id) {
  if (id && BACKGROUNDS[id]) return id;
  if (id && BACKGROUND_ALIASES[id]) return BACKGROUND_ALIASES[id];
  return 'everest-blue';
}

function bgRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bgStars(seed, count, w, h, color = '#e0f2fe', maxR = 1.6) {
  const r = bgRng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const x = (r() * w).toFixed(1);
    const y = (r() * h).toFixed(1);
    const rad = (0.5 + r() * maxR).toFixed(2);
    const op = (0.3 + r() * 0.6).toFixed(2);
    out += `<circle cx="${x}" cy="${y}" r="${rad}" opacity="${op}"/>`;
  }
  return `<g fill="${color}">${out}</g>`;
}

function bgSparkle(x, y, s, color = '#ffffff', op = 0.9) {
  return `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${color}" opacity="${op}"/>`;
}

function heroSvg(h, body, extraClass = '') {
  return `<svg class="hero-deco hero-art${extraClass}" viewBox="0 0 1080 ${h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${body}</svg>`;
}

function everestArt() {
  const H = 440;
  return heroSvg(H, `
    <defs>
      <radialGradient id="tpbg-ev-sun" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#d6ecff" stop-opacity="0.85"/>
        <stop offset="0.45" stop-color="#7cb8ff" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#7cb8ff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-ev-far" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b63c6" stop-opacity="0.75"/>
        <stop offset="1" stop-color="#5d97e6" stop-opacity="0.6"/>
      </linearGradient>
      <linearGradient id="tpbg-ev-lit" x1="0" y1="0" x2="0.3" y2="1">
        <stop offset="0" stop-color="#3a72d4"/>
        <stop offset="1" stop-color="#5f9be8"/>
      </linearGradient>
      <linearGradient id="tpbg-ev-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#173f92"/>
        <stop offset="1" stop-color="#3e78d2"/>
      </linearGradient>
      <linearGradient id="tpbg-ev-mist" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e9f1fb" stop-opacity="0"/>
        <stop offset="0.55" stop-color="#e9f1fb" stop-opacity="0.82"/>
        <stop offset="1" stop-color="#e9f1fb" stop-opacity="1"/>
      </linearGradient>
    </defs>
    ${bgStars(7, 46, 1080, 170, '#e0f2fe', 1.3)}
    ${bgSparkle(930, 44, 7)}${bgSparkle(410, 86, 5, '#cfe7ff', 0.8)}
    <circle cx="730" cy="150" r="250" fill="url(#tpbg-ev-sun)"/>
    <g fill="none" stroke="#bfe0ff" stroke-opacity="0.22">
      <ellipse cx="730" cy="150" rx="330" ry="86"/>
      <ellipse cx="730" cy="150" rx="420" ry="112" stroke-dasharray="3 8"/>
    </g>
    <path d="M0 300L70 262L140 282L230 214L300 252L360 236L430 276L520 244L600 272L700 238L820 270L900 226L980 258L1080 222V440H0Z" fill="url(#tpbg-ev-far)"/>
    <path d="M250 168L162 300H350Z" fill="#2c62c2"/>
    <path d="M250 168L292 300H350Z" fill="#1b4699"/>
    <path d="M250 168L230 196L244 192L252 206L262 190L276 197Z" fill="#f4f9ff"/>
    <path d="M730 92L640 196L560 280L470 340H716L700 214Z" fill="url(#tpbg-ev-lit)"/>
    <path d="M730 92L700 214L716 340H1010L890 236L810 160Z" fill="url(#tpbg-ev-shade)"/>
    <path d="M730 92L676 154L656 186L688 176L702 200L716 164Z" fill="#ffffff"/>
    <path d="M730 92L716 164L734 186L758 154L784 174L770 128Z" fill="#c9ddf8"/>
    <path d="M640 196L612 230L646 222L660 240L672 214Z" fill="#ffffff" opacity="0.85"/>
    <path d="M810 160L842 196L826 204L858 222L866 210Z" fill="#c9ddf8" opacity="0.8"/>
    <g stroke="#ffffff" stroke-opacity="0.55" fill="none">
      <path d="M730 92V58H790" stroke-dasharray="3 4"/>
      <circle cx="730" cy="92" r="3.5" fill="#ffffff" stroke="none"/>
    </g>
    <text x="796" y="62" fill="#e0f2fe" fill-opacity="0.85" font-size="12" font-weight="700" letter-spacing="2" font-family="Consolas, monospace">8848.86 M · PEAK</text>
    <path d="M0 352L110 316L220 344L330 300L450 350L580 318L700 356L840 310L960 344L1080 314V440H0Z" fill="#5c96e4" opacity="0.85"/>
    <path d="M0 372C150 344 300 382 470 362S800 340 1080 368V440H0Z" fill="#a8c9f3" opacity="0.9"/>
    <path d="M0 396C220 374 420 404 620 388S900 376 1080 392V440H0Z" fill="#d7e6f9"/>
    <rect y="300" width="1080" height="140" fill="url(#tpbg-ev-mist)"/>
  `);
}

function skylineArt() {
  const H = 460;
  const VX = 540, VY = 330, HY = 362;
  let floor = '';
  for (let bx = -540; bx <= 1620; bx += 108) {
    const t = (HY - VY) / (H - VY);
    floor += `<path d="M${(VX + (bx - VX) * t).toFixed(1)} ${HY}L${bx} ${H}"/>`;
  }
  [372, 388, 410, 440].forEach((y) => { floor += `<path d="M0 ${y}H1080"/>`; });

  const bar = (x, base, w, d, h, op = 1) => {
    const dy = d * 0.55;
    const top = base - h;
    return `<g opacity="${op}">
      <path d="M${x + w} ${base}L${x + w + d} ${base - dy}V${top - dy}L${x + w} ${top}Z" fill="url(#tpbg-sk-side)"/>
      <path d="M${x} ${top}L${x + d} ${top - dy}H${x + w + d}L${x + w} ${top}Z" fill="#eef7ff"/>
      <rect x="${x}" y="${top}" width="${w}" height="${h}" fill="url(#tpbg-sk-front)"/>
      ${h > 120 ? `<path d="M${x + w * 0.35} ${top + 14}V${base - 10}M${x + w * 0.68} ${top + 26}V${base - 10}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1"/>` : ''}
    </g>`;
  };
  const back = [70, 110, 150, 96, 190, 132, 236, 170, 124, 210, 104, 156, 84, 118, 66];
  const front = [52, 84, 66, 128, 100, 168, 240, 196, 268, 150, 204, 116, 94, 72, 56];
  let bars = '';
  back.forEach((h, i) => { bars += bar(258 + i * 38, 350, 24, 12, h, 0.55); });
  front.forEach((h, i) => { bars += bar(170 + i * 50, 372, 34, 16, h); });

  return heroSvg(H, `
    <defs>
      <radialGradient id="tpbg-sk-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
        <stop offset="0.5" stop-color="#d4ebff" stop-opacity="0.4"/>
        <stop offset="1" stop-color="#d4ebff" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-sk-front" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.96"/>
        <stop offset="0.45" stop-color="#a6d4ff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#4f9bff" stop-opacity="0.6"/>
      </linearGradient>
      <linearGradient id="tpbg-sk-side" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4b91f7" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#1d5fd8" stop-opacity="0.6"/>
      </linearGradient>
      <linearGradient id="tpbg-sk-streak" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="tpbg-sk-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#eef5ff" stop-opacity="0"/>
        <stop offset="0.6" stop-color="#eef5ff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#eef5ff" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <path d="M-60 40L40 0L380 ${H}H250Z" fill="url(#tpbg-sk-streak)"/>
    <path d="M60 0H110L420 ${H}H380Z" fill="url(#tpbg-sk-streak)" opacity="0.6"/>
    <path d="M1140 40L1040 0L700 ${H}H830Z" fill="url(#tpbg-sk-streak)"/>
    <path d="M1020 0H970L660 ${H}H700Z" fill="url(#tpbg-sk-streak)" opacity="0.6"/>
    <ellipse cx="540" cy="330" rx="520" ry="190" fill="url(#tpbg-sk-glow)"/>
    <g stroke="#ffffff" stroke-opacity="0.38" stroke-width="1" fill="none">${floor}</g>
    <g fill="none" stroke="#ffffff">
      <ellipse cx="540" cy="404" rx="440" ry="56" stroke-opacity="0.35"/>
      <ellipse cx="540" cy="404" rx="320" ry="40" stroke-opacity="0.6" stroke-width="1.6"/>
      <ellipse cx="540" cy="404" rx="210" ry="26" stroke-opacity="0.5" stroke-dasharray="4 6"/>
    </g>
    ${bars}
    <g fill="#ffffff">
      <rect x="150" y="150" width="8" height="8" opacity="0.6"/><rect x="900" y="130" width="10" height="10" opacity="0.55"/>
      <rect x="960" y="210" width="6" height="6" opacity="0.6"/><rect x="96" y="236" width="6" height="6" opacity="0.5"/>
    </g>
    ${bgSparkle(870, 96, 8)}${bgSparkle(206, 112, 6, '#ffffff', 0.8)}
    <rect y="330" width="1080" height="130" fill="url(#tpbg-sk-fade)"/>
  `);
}

function starfieldArt() {
  const H = 520;
  return heroSvg(H, `
    <defs>
      <radialGradient id="tpbg-sf-planet" cx="0.36" cy="0.28" r="0.9">
        <stop offset="0" stop-color="#f4fbff"/>
        <stop offset="0.28" stop-color="#a9d8ff"/>
        <stop offset="0.62" stop-color="#3f8cf0"/>
        <stop offset="1" stop-color="#0d3594"/>
      </radialGradient>
      <radialGradient id="tpbg-sf-halo" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7cc4ff" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#3b82f6" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-sf-ring" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e0f2fe" stop-opacity="0.95"/>
        <stop offset="0.5" stop-color="#60a5fa" stop-opacity="0.7"/>
        <stop offset="1" stop-color="#93c5fd" stop-opacity="0.15"/>
      </linearGradient>
      <linearGradient id="tpbg-sf-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#e0f2fe" stop-opacity="0.08"/>
        <stop offset="0.55" stop-color="#bfe3ff" stop-opacity="0.38"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.75"/>
      </linearGradient>
      <radialGradient id="tpbg-sf-horizon" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="0.3" stop-color="#93c5fd" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#2563eb" stop-opacity="0"/>
      </radialGradient>
    </defs>
    ${bgStars(31, 90, 1080, H, '#dbeafe', 1.5)}
    ${bgSparkle(180, 120, 9)}${bgSparkle(950, 300, 7)}${bgSparkle(820, 70, 5, '#bfe3ff')}${bgSparkle(110, 380, 6, '#bfe3ff', 0.7)}
    <path d="M488 300H592L760 ${H}H320Z" fill="url(#tpbg-sf-beam)"/>
    <path d="M520 300H560L620 ${H}H460Z" fill="#ffffff" opacity="0.18"/>
    <circle cx="540" cy="232" r="230" fill="url(#tpbg-sf-halo)"/>
    <g transform="rotate(-14 540 240)" fill="none">
      <ellipse cx="540" cy="240" rx="320" ry="68" stroke="url(#tpbg-sf-ring)" stroke-width="9" opacity="0.55"/>
      <ellipse cx="540" cy="240" rx="372" ry="82" stroke="#93c5fd" stroke-width="2" opacity="0.35" stroke-dasharray="120 30 40 30"/>
      <ellipse cx="540" cy="240" rx="268" ry="56" stroke="#bfe3ff" stroke-width="1.5" opacity="0.45" stroke-dasharray="6 8"/>
    </g>
    <circle cx="540" cy="232" r="112" fill="url(#tpbg-sf-planet)"/>
    <path d="M444 196A112 112 0 0 1 600 136" stroke="#ffffff" stroke-width="3" stroke-opacity="0.55" fill="none"/>
    <g transform="rotate(-14 540 240)" fill="none">
      <path d="M220 240A320 68 0 0 0 860 240" stroke="url(#tpbg-sf-ring)" stroke-width="9"/>
      <path d="M168 240A372 82 0 0 0 912 240" stroke="#bfe3ff" stroke-width="2" opacity="0.6"/>
      <path d="M190 252A350 74 0 0 0 420 300" stroke="#e0f2fe" stroke-width="4" opacity="0.7" stroke-linecap="round"/>
    </g>
    <ellipse cx="540" cy="${H}" rx="560" ry="96" fill="url(#tpbg-sf-horizon)"/>
    <path d="M0 ${H - 14}Q540 ${H - 60} 1080 ${H - 14}" stroke="#bfe3ff" stroke-opacity="0.7" stroke-width="1.6" fill="none"/>
  `);
}

function glassAuroraArt() {
  const H = 440;
  let silk = '';
  for (let i = 0; i < 16; i++) {
    silk += `<path d="M-40 ${262 + i * 6}C220 ${180 + i * 7} 480 ${312 + i * 4} 720 ${262 + i * 5}S1000 ${206 + i * 6} 1120 ${236 + i * 5}" stroke-opacity="${(0.1 + (i % 4) * 0.05).toFixed(2)}"/>`;
  }
  const plate = (cx, cy, rx, ry, t, op) => `
    <path d="M${cx - rx} ${cy}L${cx} ${cy + ry}L${cx + rx} ${cy}V${cy + t}L${cx} ${cy + ry + t}L${cx - rx} ${cy + t}Z" fill="#c7d6fb" opacity="${op}"/>
    <path d="M${cx} ${cy - ry}L${cx + rx} ${cy}L${cx} ${cy + ry}L${cx - rx} ${cy}Z" fill="url(#tpbg-ga-plate)" stroke="#ffffff" stroke-opacity="0.95" opacity="${op}"/>`;
  return heroSvg(H, `
    <defs>
      <radialGradient id="tpbg-ga-orb1" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#a5b4fc" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#a5b4fc" stop-opacity="0"/>
      </radialGradient>
      <radialGradient id="tpbg-ga-orb2" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#7dd3fc" stop-opacity="0.5"/>
        <stop offset="1" stop-color="#7dd3fc" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-ga-w1" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#c7d7fe" stop-opacity="0.75"/>
        <stop offset="0.5" stop-color="#9ec5ff" stop-opacity="0.6"/>
        <stop offset="1" stop-color="#d8cffd" stop-opacity="0.7"/>
      </linearGradient>
      <linearGradient id="tpbg-ga-w2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="1" stop-color="#c3d6ff" stop-opacity="0.55"/>
      </linearGradient>
      <linearGradient id="tpbg-ga-plate" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#dbe6ff" stop-opacity="0.55"/>
      </linearGradient>
      <linearGradient id="tpbg-ga-chip" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#60a5fa"/>
        <stop offset="0.55" stop-color="#2563eb"/>
        <stop offset="1" stop-color="#4f46e5"/>
      </linearGradient>
      <linearGradient id="tpbg-ga-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#eaf0fd" stop-opacity="0"/>
        <stop offset="1" stop-color="#eaf0fd" stop-opacity="0.9"/>
      </linearGradient>
    </defs>
    <circle cx="900" cy="110" r="260" fill="url(#tpbg-ga-orb1)"/>
    <circle cx="140" cy="340" r="220" fill="url(#tpbg-ga-orb2)"/>
    <g fill="none" stroke="#ffffff">
      <circle cx="950" cy="190" r="78" stroke-opacity="0.9" stroke-width="1.4"/>
      <circle cx="950" cy="190" r="122" stroke-opacity="0.7"/>
      <circle cx="950" cy="190" r="176" stroke="#93c5fd" stroke-opacity="0.5" stroke-dasharray="4 8"/>
    </g>
    <path d="M-40 300C180 214 360 252 560 300S900 360 1120 252V340C900 440 620 362 420 362S100 380-40 420Z" fill="url(#tpbg-ga-w1)"/>
    <g fill="none" stroke="#5b7cfa" stroke-width="0.9">${silk}</g>
    ${plate(800, 330, 150, 52, 12, 0.9)}
    ${plate(800, 300, 118, 41, 10, 0.95)}
    <rect x="752" y="232" width="96" height="10" rx="5" fill="#1e3a8a" opacity="0.12"/>
    <rect x="740" y="146" width="120" height="104" rx="22" fill="url(#tpbg-ga-chip)"/>
    <rect x="746" y="150" width="108" height="42" rx="18" fill="#ffffff" opacity="0.18"/>
    <text x="800" y="214" text-anchor="middle" fill="#ffffff" font-size="44" font-weight="800" font-family="Consolas, 'Segoe UI', monospace">&lt;/&gt;</text>
    <path d="M-40 362C200 286 420 334 640 362S960 364 1120 302V400C920 460 660 422 440 422S120 442-40 470Z" fill="url(#tpbg-ga-w2)"/>
    <path d="M-40 362C200 286 420 334 640 362S960 364 1120 302" fill="none" stroke="#ffffff" stroke-width="2.4"/>
    <path d="M-40 300C180 214 360 252 560 300S900 360 1120 252" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.85"/>
    ${bgSparkle(660, 150, 8, '#ffffff', 0.95)}${bgSparkle(1010, 250, 6, '#ffffff', 0.9)}
    <rect y="360" width="1080" height="80" fill="url(#tpbg-ga-fade)"/>
  `);
}

function cleanSlateArt() {
  return `<svg class="hero-deco hero-art" viewBox="0 0 1080 360" preserveAspectRatio="xMaxYMin slice" aria-hidden="true">
    <g fill="none" stroke="#2563eb">
      <circle cx="1060" cy="-20" r="150" stroke-opacity="0.1"/>
      <circle cx="1060" cy="-20" r="210" stroke-opacity="0.08" stroke-dasharray="4 8"/>
      <circle cx="1060" cy="-20" r="280" stroke-opacity="0.06"/>
    </g>
  </svg>`;
}

export function renderHeroDecoSvg(bgId) {
  switch (resolveBackground(bgId)) {
    case 'skyline-tech': return skylineArt();
    case 'starfield': return starfieldArt();
    case 'glass-aurora': return glassAuroraArt();
    case 'clean-slate': return cleanSlateArt();
    default: return everestArt();
  }
}
