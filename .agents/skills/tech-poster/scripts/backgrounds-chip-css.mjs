/* 芯片 / 半导体背景画布 CSS（仅 Node 端构建时内联；零外链） */

function uri(svgStr) {
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgStr.replace(/\s+/g, ' ').trim())}")`;
}

const X = 'xmlns="http://www.w3.org/2000/svg"';

function rep(n, fn) {
  let s = '';
  for (let i = 0; i < n; i++) s += fn(i);
  return s;
}

function sideTraces(color, padFill, op) {
  const left = rep(6, (i) => {
    const y = 80 + i * 170;
    const x1 = 18 + (i % 3) * 14;
    return `<path d="M-10 ${y}H${x1}L${x1 + 40} ${y + 40}V${y + 120}L${x1 + 20} ${y + 140}" /><circle cx="${x1 + 20}" cy="${y + 140}" r="3.5" fill="${padFill}"/>`;
  });
  const right = rep(6, (i) => {
    const y = 160 + i * 170;
    const x1 = 1062 - (i % 3) * 14;
    return `<path d="M1090 ${y}H${x1}L${x1 - 40} ${y + 40}V${y + 110}L${x1 - 20} ${y + 130}" /><circle cx="${x1 - 20}" cy="${y + 130}" r="3.5" fill="${padFill}"/>`;
  });
  return uri(`<svg ${X} width="1080" height="1200" viewBox="0 0 1080 1200"><g fill="none" stroke="${color}" stroke-opacity="${op}" stroke-width="1.6">${left}${right}</g></svg>`);
}

function busBottom(color, glow) {
  const lines = rep(9, (i) => {
    const x = 140 + i * 100;
    return `<path d="M${x} 300V${200 - Math.abs(i - 4) * 12}L${540 + (i - 4) * 18} ${120}V60" />`;
  });
  return uri(`<svg ${X} width="1080" height="300" viewBox="0 0 1080 300"><defs><radialGradient id="g" cx="0.5" cy="1" r="0.7"><stop offset="0" stop-color="${glow}" stop-opacity="0.45"/><stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="300" fill="url(#g)"/><g fill="none" stroke="${color}" stroke-opacity="0.45" stroke-width="1.6">${lines}</g></svg>`);
}

function glowTile(c1, c2, c3) {
  return uri(`<svg ${X} width="1080" height="1600" viewBox="0 0 1080 1600"><defs><radialGradient id="a"><stop offset="0" stop-color="${c1}" stop-opacity="0.38"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient><radialGradient id="b"><stop offset="0" stop-color="${c2}" stop-opacity="0.32"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient><radialGradient id="c"><stop offset="0" stop-color="${c3}" stop-opacity="0.26"/><stop offset="1" stop-color="${c3}" stop-opacity="0"/></radialGradient></defs><circle cx="30" cy="320" r="360" fill="url(#a)"/><circle cx="1050" cy="880" r="400" fill="url(#b)"/><circle cx="110" cy="1400" r="300" fill="url(#c)"/></svg>`);
}

const cyanDots = uri(`<svg ${X} width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1" fill="#22d3ee" fill-opacity="0.16"/></svg>`);
const violetStars = uri(`<svg ${X} width="260" height="260" viewBox="0 0 260 260"><g fill="#ddd6fe">${rep(18, (i) => `<circle cx="${(i * 97) % 260}" cy="${(i * 53 + 17) % 260}" r="${(0.6 + (i % 4) * 0.3).toFixed(1)}" opacity="${(0.35 + (i % 3) * 0.15).toFixed(2)}"/>`)}</g></svg>`);

const dieGridSides = uri(`<svg ${X} width="1080" height="900" viewBox="0 0 1080 900"><g fill="none" stroke="#7c3aed" stroke-opacity="0.12">${rep(6, (r) => rep(3, (c) => `<rect x="${6 + c * 16}" y="${120 + r * 12}" width="14" height="10" rx="1"/>`))}${rep(6, (r) => rep(3, (c) => `<rect x="${1026 + c * 16}" y="${560 + r * 12}" width="14" height="10" rx="1"/>`))}</g><g fill="#7c3aed" fill-opacity="0.12"><rect x="22" y="144" width="14" height="10" rx="1"/><rect x="1042" y="596" width="14" height="10" rx="1"/></g></svg>`);

const waferBottom = uri(`<svg ${X} width="1080" height="280" viewBox="0 0 1080 280"><defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c4b5fd" stop-opacity="0.15"/><stop offset="0.5" stop-color="#a5b4fc" stop-opacity="0.45"/><stop offset="1" stop-color="#67e8f9" stop-opacity="0.15"/></linearGradient></defs><ellipse cx="540" cy="330" rx="620" ry="190" fill="url(#w)"/><ellipse cx="540" cy="330" rx="620" ry="190" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.8"/><ellipse cx="540" cy="350" rx="520" ry="150" fill="none" stroke="#a78bfa" stroke-opacity="0.3" stroke-dasharray="6 8"/></svg>`);

const litoBottom = uri(`<svg ${X} width="1080" height="320" viewBox="0 0 1080 320"><defs><radialGradient id="h" cx="0.5" cy="1" r="0.75"><stop offset="0" stop-color="#f0abfc" stop-opacity="0.55"/><stop offset="0.4" stop-color="#7c3aed" stop-opacity="0.35"/><stop offset="1" stop-color="#4c1d95" stop-opacity="0"/></radialGradient></defs><rect width="1080" height="320" fill="url(#h)"/><path d="M0 300Q540 230 1080 300" fill="none" stroke="#e9d5ff" stroke-opacity="0.7" stroke-width="1.6"/><path d="M0 312Q540 256 1080 312" fill="none" stroke="#67e8f9" stroke-opacity="0.4"/></svg>`);

export function buildChipBackgroundCss() {
  return `
/* ---------- 芯片 / 半导体背景 ---------- */

/* 芯片晶核（unified · 深青黑） */
[data-bg="chip-die"] {
  --canvas-bg: #041218;
  --hero-bg: transparent;
  --hero-art-h: 520px;
  --hero-pad-b: 440px;
  --body-lift: 40px;
  --hero-meta-bg: rgba(34, 211, 238, 0.06);
  --hero-meta-border: rgba(34, 211, 238, 0.28);
  --footer-text: #8fc3cf;
  --footer-border: rgba(34, 211, 238, 0.2);
}
[data-bg="chip-die"] .poster-canvas {
  background-color: #041218;
  background-image:
    ${busBottom('#22d3ee', '#22d3ee')},
    ${sideTraces('#22d3ee', '#22d3ee', 0.32)},
    ${cyanDots},
    ${glowTile('#0891b2', '#14b8a6', '#84cc16')},
    linear-gradient(180deg, #020a0e 0px, #05202a 280px, #08394a 560px, #052530 900px, #041218 1300px);
  background-position: center bottom, 0 0, 0 0, 0 0, 0 0;
  background-size: 100% 300px, 100% 1200px, 24px 24px, 100% 1600px, 100% 1300px;
  background-repeat: no-repeat, repeat-y, repeat, repeat-y, no-repeat;
}
[data-bg="chip-die"] .hero-title { text-shadow: 0 0 26px rgba(34, 211, 238, 0.45), 0 2px 10px rgba(0, 0, 0, 0.6); }

/* 晶圆制造（split · 靛紫） */
[data-bg="wafer-fab"] {
  --canvas-bg: #f3f1fd;
  --hero-bg: radial-gradient(ellipse 70% 40% at 50% 100%, rgba(233, 213, 255, 0.6), transparent 70%), linear-gradient(180deg, #0d0b3a 0%, #2a1a7a 40%, #5b3fd0 72%, #a99af5 100%);
  --hero-art-h: 460px;
  --hero-pad-b: 380px;
  --body-lift: 72px;
}
[data-bg="wafer-fab"] .poster-canvas {
  background-color: #f3f1fd;
  background-image:
    ${waferBottom},
    ${dieGridSides},
    radial-gradient(circle at 92% 40%, rgba(167, 139, 250, 0.22), transparent 22%),
    radial-gradient(circle at 6% 70%, rgba(103, 232, 249, 0.2), transparent 22%),
    linear-gradient(180deg, #f3f1fd 0%, #eeeafc 60%, #ebe6fb 100%);
  background-position: center bottom, 0 0, 0 0, 0 0, 0 0;
  background-size: 100% 280px, 100% 900px, 100% 100%, 100% 100%, 100% 100%;
  background-repeat: no-repeat, repeat-y, no-repeat, no-repeat, no-repeat;
}

/* 电路板金线（split · PCB 绿 + 金） */
[data-bg="pcb-trace"] {
  --canvas-bg: #f2f6f0;
  --hero-bg: radial-gradient(ellipse 60% 45% at 50% 60%, rgba(252, 211, 77, 0.16), transparent 70%), linear-gradient(180deg, #021a12 0%, #053d2b 45%, #0a5c40 75%, #4f9a78 100%);
  --hero-art-h: 440px;
  --hero-pad-b: 390px;
  --body-lift: 72px;
}
[data-bg="pcb-trace"] .poster-canvas {
  background-color: #f2f6f0;
  background-image:
    ${busBottom('#c08a1e', '#e3b341')},
    ${sideTraces('#b7791f', '#b7791f', 0.3)},
    radial-gradient(circle at 50% 0%, rgba(16, 122, 87, 0.08), transparent 40%),
    linear-gradient(180deg, #f2f6f0 0%, #edf3ea 60%, #e8efe4 100%);
  background-position: center bottom, 0 0, center top, 0 0;
  background-size: 100% 300px, 100% 1200px, 100% 1600px, 100% 100%;
  background-repeat: no-repeat, repeat-y, no-repeat, no-repeat;
}

/* 光刻紫光（unified · 深紫） */
[data-bg="euv-litho"] {
  --canvas-bg: #0b0820;
  --hero-bg: transparent;
  --hero-art-h: 520px;
  --hero-pad-b: 440px;
  --body-lift: 40px;
  --hero-meta-bg: rgba(192, 132, 252, 0.07);
  --hero-meta-border: rgba(192, 132, 252, 0.3);
  --footer-text: #b5a8e0;
  --footer-border: rgba(192, 132, 252, 0.22);
}
[data-bg="euv-litho"] .poster-canvas {
  background-color: #0b0820;
  background-image:
    ${litoBottom},
    ${violetStars},
    ${glowTile('#7c3aed', '#c026d3', '#0891b2')},
    linear-gradient(180deg, #05030f 0px, #160d3d 300px, #2a1470 560px, #170c45 900px, #0b0820 1300px);
  background-position: center bottom, 0 0, 0 0, 0 0;
  background-size: 100% 320px, 260px 260px, 100% 1600px, 100% 1300px;
  background-repeat: no-repeat, repeat, repeat-y, no-repeat;
}
[data-bg="euv-litho"] .hero-title { text-shadow: 0 0 28px rgba(192, 132, 252, 0.5), 0 2px 10px rgba(0, 0, 0, 0.6); }
`;
}
