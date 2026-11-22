/* 内置画布背景 CSS（仅 Node 端构建时内联进 HTML；全部为 CSS 渐变 + 内联 SVG data-uri，零外链） */

function uri(svgStr) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr.replace(/\s+/g, ' ').trim())}")`;
}

const X = 'xmlns="http://www.w3.org/2000/svg"';

function lines(n, fn) {
  let s = '';
  for (let i = 0; i < n; i++) s += fn(i);
  return s;
}

const starsTile = uri(`<svg ${X} width="260" height="260" viewBox="0 0 260 260"><g fill="#e0f2fe"><circle cx="22" cy="32" r="1.2" opacity="0.55"/><circle cx="68" cy="20" r="0.9" opacity="0.4"/><circle cx="118" cy="42" r="1.4" opacity="0.6"/><circle cx="164" cy="24" r="1" opacity="0.45"/><circle cx="212" cy="36" r="1.3" opacity="0.55"/><circle cx="40" cy="76" r="1" opacity="0.45"/><circle cx="94" cy="92" r="1.3" opacity="0.6"/><circle cx="192" cy="88" r="1.1" opacity="0.5"/><circle cx="240" cy="74" r="1.5" opacity="0.6"/><circle cx="12" cy="126" r="1" opacity="0.5"/><circle cx="60" cy="146" r="1.4" opacity="0.58"/><circle cx="156" cy="142" r="1.2" opacity="0.55"/><circle cx="248" cy="150" r="1.1" opacity="0.5"/><circle cx="32" cy="186" r="1.2" opacity="0.55"/><circle cx="132" cy="178" r="1.4" opacity="0.6"/><circle cx="226" cy="184" r="1.2" opacity="0.5"/><circle cx="50" cy="238" r="1" opacity="0.45"/><circle cx="100" cy="252" r="1.3" opacity="0.55"/><circle cx="198" cy="248" r="1.4" opacity="0.58"/></g></svg>`);

const sparkPts = [[90, 140, 9], [980, 260, 7], [520, 520, 5], [60, 760, 6], [1010, 980, 9], [300, 1180, 6], [760, 70, 5], [880, 640, 4]];
const sparkTile = uri(`<svg ${X} width="1080" height="1300" viewBox="0 0 1080 1300">${sparkPts.map(([x, y, s]) => `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="#ffffff" opacity="0.75"/>`).join('')}</svg>`);

const nebulaTile = uri(`<svg ${X} width="1080" height="1600" viewBox="0 0 1080 1600"><defs><radialGradient id="a"><stop offset="0" stop-color="#2f6ff0" stop-opacity="0.5"/><stop offset="1" stop-color="#2f6ff0" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop offset="0" stop-color="#6d5cf0" stop-opacity="0.42"/><stop offset="1" stop-color="#6d5cf0" stop-opacity="0"/></radialGradient><radialGradient id="c"><stop offset="0" stop-color="#22b8f0" stop-opacity="0.32"/><stop offset="1" stop-color="#22b8f0" stop-opacity="0"/></radialGradient></defs><circle cx="40" cy="320" r="380" fill="url(#a)"/><circle cx="1060" cy="860" r="420" fill="url(#b)"/><circle cx="120" cy="1380" r="320" fill="url(#c)"/></svg>`);

const starHorizon = uri(`<svg ${X} width="1080" height="320" viewBox="0 0 1080 320"><defs><radialGradient id="h" cx="0.5" cy="1" r="0.75"><stop offset="0" stop-color="#cfe7ff" stop-opacity="0.85"/><stop offset="0.35" stop-color="#4f8ff0" stop-opacity="0.45"/><stop offset="1" stop-color="#1d4ed8" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="320" fill="url(#h)"/><path d="M0 300Q540 236 1080 300" fill="none" stroke="#dbeafe" stroke-opacity="0.75" stroke-width="1.6"/><path d="M0 312Q540 262 1080 312" fill="none" stroke="#93c5fd" stroke-opacity="0.5"/></svg>`);

const everestBottom = uri(`<svg ${X} width="1080" height="280" viewBox="0 0 1080 280"><defs><linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa9ea" stop-opacity="0.55"/><stop offset="1" stop-color="#a9c8f2" stop-opacity="0.35"/></linearGradient></defs><path d="M0 280V190L120 150L210 176L330 104L420 150L520 120L640 168L760 96L860 150L960 120L1080 160V280Z" fill="url(#m)"/><path d="M330 104L312 130L326 126L336 138L346 124L356 130Z M760 96L740 124L756 120L764 134L774 118L786 124Z" fill="#ffffff" opacity="0.8"/><path d="M0 280V222L150 190L260 214L400 168L520 210L660 180L800 218L940 184L1080 206V280Z" fill="#c4d9f6" opacity="0.75"/><path d="M0 280V248C220 228 420 256 620 240S900 230 1080 246V280Z" fill="#dce8f9"/></svg>`);

const topoSides = uri(`<svg ${X} width="1080" height="900" viewBox="0 0 1080 900"><g fill="none" stroke="#1d4ed8" stroke-opacity="0.09">${lines(6, (i) => `<path d="M-20 ${120 + i * 26}C40 ${80 + i * 30} 90 ${190 + i * 22} 150 ${150 + i * 24}"/><path d="M1100 ${560 + i * 26}C1040 ${520 + i * 30} 990 ${630 + i * 22} 930 ${590 + i * 24}"/>`)}</g></svg>`);

const dotsTile = uri(`<svg ${X} width="26" height="26" viewBox="0 0 26 26"><circle cx="13" cy="13" r="1.3" fill="#1d4ed8" fill-opacity="0.12"/></svg>`);

const skyStreaks = uri(`<svg ${X} width="1080" height="1200" viewBox="0 0 1080 1200"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60a5fa" stop-opacity="0"/><stop offset="0.5" stop-color="#60a5fa" stop-opacity="0.22"/><stop offset="1" stop-color="#60a5fa" stop-opacity="0"/></linearGradient></defs><rect x="6" y="80" width="14" height="460" rx="7" fill="url(#s)"/><rect x="26" y="240" width="6" height="380" rx="3" fill="url(#s)"/><rect x="1060" y="600" width="14" height="460" rx="7" fill="url(#s)"/><rect x="1048" y="760" width="6" height="380" rx="3" fill="url(#s)"/><g fill="#3b82f6" opacity="0.18"><rect x="10" y="680" width="14" height="6" rx="1"/><rect x="10" y="692" width="10" height="6" rx="1"/><rect x="10" y="704" width="6" height="6" rx="1"/><rect x="1054" y="160" width="14" height="6" rx="1"/><rect x="1058" y="172" width="10" height="6" rx="1"/><rect x="1062" y="184" width="6" height="6" rx="1"/></g></svg>`);

const skyBottom = uri(`<svg ${X} width="1080" height="260" viewBox="0 0 1080 260"><path d="M0 150C200 90 380 190 560 140S880 80 1080 160V260H0Z" fill="#cfe3ff" fill-opacity="0.6"/><path d="M0 190C220 135 430 220 640 170S940 130 1080 190V260H0Z" fill="#b6d4ff" fill-opacity="0.45"/><path d="M0 90C260 35 480 140 740 90S1000 50 1080 100" fill="none" stroke="#7fb4ff" stroke-width="2" stroke-opacity="0.45"/><path d="M0 120C240 65 460 165 720 115S1000 80 1080 130" fill="none" stroke="#3b82f6" stroke-opacity="0.25"/></svg>`);

const silkTile = uri(`<svg ${X} width="1080" height="1500" viewBox="0 0 1080 1500"><g fill="none" stroke="#5b7cfa" stroke-width="0.9">${lines(14, (i) => `<path d="M1120 ${120 + i * 7}C900 ${260 + i * 8} 860 ${520 + i * 6} 1120 ${700 + i * 8}" stroke-opacity="${(0.1 + (i % 4) * 0.05).toFixed(2)}"/><path d="M-40 ${820 + i * 7}C180 ${960 + i * 8} 220 ${1200 + i * 6} -40 ${1380 + i * 8}" stroke-opacity="${(0.1 + (i % 4) * 0.05).toFixed(2)}"/>`)}</g><g fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.9"><path d="M1120 114C900 254 860 514 1120 694"/><path d="M-40 814C180 954 220 1194 -40 1374"/></g></svg>`);

const glassBottom = uri(`<svg ${X} width="1080" height="300" viewBox="0 0 1080 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c7d7fe" stop-opacity="0.7"/><stop offset="0.5" stop-color="#a5c8ff" stop-opacity="0.55"/><stop offset="1" stop-color="#d8cffd" stop-opacity="0.65"/></linearGradient></defs><path d="M-40 160C200 80 420 140 640 170S960 150 1120 90V300H-40Z" fill="url(#g)"/><path d="M-40 220C220 150 460 200 700 220S980 200 1120 160V300H-40Z" fill="#ffffff" fill-opacity="0.7"/><path d="M-40 160C200 80 420 140 640 170S960 150 1120 90" fill="none" stroke="#ffffff" stroke-width="2"/></svg>`);

export function buildBackgroundCss() {
  return `
/* ======================== 5 套内置画布背景（默认：珠峰蓝） ======================== */
/* split：Hero 自带深色渐变 + 主视觉，主视觉底部渐隐为画布色，正文上移叠压，无接缝 */
/* unified：Hero 透明，渐变/纹理统一画在 .poster-canvas 上，全局一体 */

/* 珠峰蓝（split · 默认） */
[data-bg="everest-blue"] {
  --canvas-bg: #e9f1fb;
  --hero-bg: radial-gradient(ellipse 55% 45% at 68% 82%, rgba(140, 200, 255, 0.5), transparent 70%), linear-gradient(180deg, #04112e 0%, #0a2862 34%, #1a52bb 70%, #4d8ee6 100%);
  --hero-art-h: 440px;
  --hero-pad-b: 360px;
  --body-lift: 76px;
}
[data-bg="everest-blue"] .poster-canvas {
  background-color: #e9f1fb;
  background-image:
    ${everestBottom},
    ${topoSides},
    ${dotsTile},
    radial-gradient(ellipse 80% 40% at 50% 0%, rgba(77, 142, 230, 0.16), transparent 70%),
    linear-gradient(180deg, #e9f1fb 0%, #e4eefb 60%, #dfeafa 100%);
  background-position: center bottom, 0 0, 0 0, center top, 0 0;
  background-size: 100% 280px, 100% 900px, 26px 26px, 100% 1400px, 100% 100%;
  background-repeat: no-repeat, repeat-y, repeat, no-repeat, no-repeat;
}

/* 科技城市（split） */
[data-bg="skyline-tech"] {
  --canvas-bg: #eef5ff;
  --hero-bg: radial-gradient(ellipse 70% 40% at 50% 100%, rgba(255, 255, 255, 0.55), transparent 70%), linear-gradient(180deg, #0a36b4 0%, #1a5fe2 36%, #3f8ef5 68%, #94c8ff 100%);
  --hero-art-h: 460px;
  --hero-pad-b: 380px;
  --body-lift: 72px;
}
[data-bg="skyline-tech"] .poster-canvas {
  background-color: #eef5ff;
  background-image:
    ${skyBottom},
    ${skyStreaks},
    radial-gradient(circle at 50% 0%, rgba(147, 197, 253, 0.35), transparent 40%),
    linear-gradient(180deg, #eef5ff 0%, #e8f1fe 55%, #e2edfd 100%);
  background-position: center bottom, 0 0, center top, 0 0;
  background-size: 100% 260px, 100% 1200px, 100% 1600px, 100% 100%;
  background-repeat: no-repeat, repeat-y, no-repeat, no-repeat;
}

/* 星际光柱（unified） */
[data-bg="starfield"] {
  --canvas-bg: #05143d;
  --hero-bg: transparent;
  --hero-art-h: 520px;
  --hero-pad-b: 430px;
  --body-lift: 40px;
  --hero-meta-bg: rgba(255, 255, 255, 0.07);
  --hero-meta-border: rgba(147, 197, 253, 0.28);
  --footer-text: #a9c3ec;
  --footer-border: rgba(147, 197, 253, 0.2);
}
[data-bg="starfield"] .poster-canvas {
  background-color: #05143d;
  background-image:
    ${starHorizon},
    ${sparkTile},
    ${starsTile},
    ${nebulaTile},
    linear-gradient(180deg, #020a22 0px, #061a4d 260px, #0c3290 560px, #0a2572 820px, #05143d 1200px);
  background-position: center bottom, 0 0, 0 0, 0 0, 0 0;
  background-size: 100% 320px, 100% 1300px, 260px 260px, 100% 1600px, 100% 1200px;
  background-repeat: no-repeat, repeat, repeat, repeat-y, no-repeat;
}

/* 玻璃浪潮（unified · 浅色） */
[data-bg="glass-aurora"] {
  --canvas-bg: #eaf0fd;
  --surface: rgba(255, 255, 255, 0.9);
  --hero-bg: transparent;
  --hero-text: #0b2a6f;
  --hero-sub: #3d5482;
  --hero-pill-bg: rgba(255, 255, 255, 0.72);
  --hero-pill-border: rgba(37, 99, 235, 0.24);
  --hero-meta-bg: rgba(255, 255, 255, 0.62);
  --hero-meta-border: rgba(255, 255, 255, 0.95);
  --hero-art-h: 440px;
  --hero-pad-b: 360px;
  --body-lift: 56px;
}
[data-bg="glass-aurora"] .poster-canvas {
  background-color: #eaf0fd;
  background-image:
    ${glassBottom},
    ${silkTile},
    radial-gradient(circle at 92% 38%, rgba(165, 180, 252, 0.35), transparent 22%),
    radial-gradient(circle at 6% 62%, rgba(125, 211, 252, 0.3), transparent 22%),
    radial-gradient(circle at 94% 86%, rgba(196, 181, 253, 0.3), transparent 20%),
    linear-gradient(180deg, #dde6ff 0px, #eef3ff 900px, #e8eefc 100%);
  background-position: center bottom, 0 0, 0 0, 0 0, 0 0, 0 0;
  background-size: 100% 300px, 100% 1500px, 100% 100%, 100% 100%, 100% 100%, 100% 100%;
  background-repeat: no-repeat, repeat-y, no-repeat, no-repeat, no-repeat, no-repeat;
}

/* 纯净极简（unified · 打印友好） */
[data-bg="clean-slate"] {
  --canvas-bg: #f4f7fb;
  --hero-bg: transparent;
  --hero-text: #0f1f3d;
  --hero-sub: #475569;
  --hero-pill-bg: #eaf1fd;
  --hero-pill-border: #c9d9f3;
  --hero-meta-bg: #ffffff;
  --hero-meta-border: #dbe5f2;
  --hero-art-h: 100%;
  --hero-pad-b: 44px;
  --body-lift: 0px;
}
[data-bg="clean-slate"] .poster-canvas {
  background-color: #f4f7fb;
  background-image: linear-gradient(90deg, #1d4ed8, #0ea5e9);
  background-position: 0 0;
  background-size: 100% 6px;
  background-repeat: no-repeat;
}

[data-bg="glass-aurora"] .hero-title,
[data-bg="clean-slate"] .hero-title {
  text-shadow: none;
  background: linear-gradient(90deg, #0b2a6f 0%, #1d4ed8 62%, #4f46e5 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
[data-bg="glass-aurora"] .hero-kicker,
[data-bg="clean-slate"] .hero-kicker { color: #2563eb; }
[data-bg="glass-aurora"] .hero-meta { box-shadow: 0 8px 24px rgba(37, 99, 235, 0.08); }
[data-bg="starfield"] .hero-title { text-shadow: 0 0 28px rgba(96, 165, 250, 0.55), 0 2px 10px rgba(2, 8, 30, 0.6); }
`;
}
