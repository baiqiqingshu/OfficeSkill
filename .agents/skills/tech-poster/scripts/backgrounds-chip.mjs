/* 芯片 / 半导体行业背景主视觉（由 backgrounds.mjs 引用；浏览器内联包中先于 backgrounds.mjs 打入） */

function chipRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function chipStars(seed, count, w, h, color, maxR = 1.4) {
  const r = chipRng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(0.5 + r() * maxR).toFixed(2)}" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`;
  }
  return `<g fill="${color}">${out}</g>`;
}

function chipSparkle(x, y, s, color = '#ffffff', op = 0.9) {
  return `<path d="M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z" fill="${color}" opacity="${op}"/>`;
}

function chipSvg(h, body) {
  return `<svg class="hero-deco hero-art" viewBox="0 0 1080 ${h}" preserveAspectRatio="xMidYMax slice" aria-hidden="true">${body}</svg>`;
}

function isoSlab(cx, cy, hw, hh, t, top, left, right, stroke = '') {
  const st = stroke ? ` stroke="${stroke}" stroke-width="1.2"` : '';
  return `<path d="M${cx - hw} ${cy}L${cx} ${cy + hh}V${cy + hh + t}L${cx - hw} ${cy + t}Z" fill="${left}"/>
    <path d="M${cx} ${cy + hh}L${cx + hw} ${cy}V${cy + t}L${cx} ${cy + hh + t}Z" fill="${right}"/>
    <path d="M${cx} ${cy - hh}L${cx + hw} ${cy}L${cx} ${cy + hh}L${cx - hw} ${cy}Z" fill="${top}"${st}/>`;
}

function isoGrid(cx, cy, hw, hh, n, color, op) {
  let s = '';
  for (let k = 1; k < n; k++) {
    const f = k / n;
    s += `<path d="M${(cx - hw + hw * f).toFixed(1)} ${(cy - hh * f).toFixed(1)}L${(cx + hw * f).toFixed(1)} ${(cy + hh - hh * f).toFixed(1)}"/>`;
    s += `<path d="M${(cx + hw * f).toFixed(1)} ${(cy - hh + hh * f).toFixed(1)}L${(cx - hw + hw * f).toFixed(1)} ${(cy + hh * f).toFixed(1)}"/>`;
  }
  return `<g stroke="${color}" stroke-opacity="${op}" stroke-width="0.8" fill="none">${s}</g>`;
}

export function chipDieArt() {
  const H = 520, cx = 540, cy = 300, hw = 230, hh = 115, t = 18;
  let traces = '', pads = '', pins = '';
  for (let i = 0; i < 10; i++) {
    const y0 = 236 + i * 16;
    const dir = i % 2 ? 1 : -1;
    const bx = 250 - i * 10;
    const op = (0.3 + (i % 3) * 0.15).toFixed(2);
    const col = i % 4 === 1 ? '#a3e635' : '#22d3ee';
    traces += `<path d="M${330 - i * 3} ${y0}H${bx}L${bx - 40} ${y0 + dir * 40}H-10" stroke="${col}" stroke-opacity="${op}"/>`;
    traces += `<path d="M${750 + i * 3} ${y0}H${1080 - bx}L${1120 - bx} ${y0 + dir * 40}H1090" stroke="${col}" stroke-opacity="${op}"/>`;
    pads += `<circle cx="${bx}" cy="${y0}" r="3"/><circle cx="${1080 - bx}" cy="${y0}" r="3"/>`;
  }
  for (let i = 0; i < 7; i++) {
    const x = 440 + i * 33;
    traces += `<path d="M${x} 430V${470 + (i % 3) * 10}L${x + (i < 3 ? -30 : 30)} ${500 + (i % 3) * 10}V${H + 10}" stroke="#22d3ee" stroke-opacity="0.4"/>`;
  }
  for (let k = 1; k < 16; k++) {
    const f = k / 16;
    const lx = cx - hw + hw * f, ly = cy + hh * f + t;
    const rx = cx + hw * f, ry = cy + hh - hh * f + t;
    pins += `<path d="M${lx.toFixed(1)} ${ly.toFixed(1)}v9M${rx.toFixed(1)} ${ry.toFixed(1)}v9"/>`;
  }
  return chipSvg(H, `
    <defs>
      <radialGradient id="tpbg-cd-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#22d3ee" stop-opacity="0.45"/>
        <stop offset="0.5" stop-color="#0891b2" stop-opacity="0.16"/>
        <stop offset="1" stop-color="#0891b2" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-cd-sub" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#0f4a58"/>
        <stop offset="1" stop-color="#05232c"/>
      </linearGradient>
      <linearGradient id="tpbg-cd-die" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#a5f3fc"/>
        <stop offset="0.35" stop-color="#22d3ee"/>
        <stop offset="0.7" stop-color="#0e7490"/>
        <stop offset="1" stop-color="#312e81"/>
      </linearGradient>
      <linearGradient id="tpbg-cd-beam" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0" stop-color="#67e8f9" stop-opacity="0.7"/>
        <stop offset="1" stop-color="#67e8f9" stop-opacity="0"/>
      </linearGradient>
    </defs>
    ${chipStars(53, 40, 1080, 200, '#67e8f9', 1)}
    <circle cx="${cx}" cy="${cy + 10}" r="340" fill="url(#tpbg-cd-glow)"/>
    <g fill="none" stroke-width="1.6">${traces}</g>
    <g fill="#67e8f9" opacity="0.7">${pads}</g>
    ${isoSlab(cx, cy, hw, hh, t, 'url(#tpbg-cd-sub)', '#031820', '#06283a', 'rgba(103,232,249,0.55)')}
    ${isoGrid(cx, cy, hw, hh, 12, '#22d3ee', 0.12)}
    <g stroke="#cbd5e1" stroke-opacity="0.75" stroke-width="3.2">${pins}</g>
    ${isoSlab(cx, cy - 14, 132, 66, 10, 'url(#tpbg-cd-die)', '#0b4f63', '#0a3a56', 'rgba(255,255,255,0.7)')}
    ${isoGrid(cx, cy - 14, 132, 66, 9, '#ffffff', 0.3)}
    <path d="M${cx - 132} ${cy - 14}L${cx - 40} ${cy - 60}L${cx + 10} ${cy - 35}L${cx - 82} ${cy + 11}Z" fill="#ffffff" opacity="0.16"/>
    <path d="M${cx} ${cy - 37}L${cx + 46} ${cy - 14}L${cx} ${cy + 9}L${cx - 46} ${cy - 14}Z" fill="#ecfeff" fill-opacity="0.35" stroke="#ffffff" stroke-opacity="0.85"/>
    <rect x="${cx - 4}" y="${cy - 200}" width="8" height="170" fill="url(#tpbg-cd-beam)"/>
    <rect x="${cx - 70}" y="${cy - 150}" width="3" height="130" fill="url(#tpbg-cd-beam)" opacity="0.7"/>
    <rect x="${cx + 66}" y="${cy - 160}" width="3" height="140" fill="url(#tpbg-cd-beam)" opacity="0.7"/>
    ${chipSparkle(cx, cy - 210, 10, '#ecfeff', 0.95)}
    <g fill="#67e8f9">
      <rect x="180" y="120" width="6" height="6" opacity="0.6"/><rect x="900" y="150" width="8" height="8" opacity="0.5"/>
      <rect x="820" y="90" width="5" height="5" opacity="0.6"/><rect x="250" y="190" width="5" height="5" opacity="0.5"/>
    </g>
  `);
}

export function waferFabArt() {
  const H = 460, cx = 540, cy = 300, rx = 360, ry = 112;
  let grid = '', dies = '';
  for (let x = cx - rx + 20; x < cx + rx; x += 30) grid += `<path d="M${x} ${cy - ry}V${cy + ry}"/>`;
  for (let y = cy - ry + 6; y < cy + ry; y += 10) grid += `<path d="M${cx - rx} ${y}H${cx + rx}"/>`;
  const r = chipRng(97);
  for (let i = 0; i < 14; i++) {
    const gx = cx - 240 + Math.floor(r() * 16) * 30;
    const gy = cy - 64 + Math.floor(r() * 12) * 10;
    dies += `<rect x="${gx}" y="${gy}" width="30" height="10" fill="${i % 3 ? '#ffffff' : '#7c3aed'}" opacity="${i % 3 ? 0.45 : 0.35}"/>`;
  }
  return chipSvg(H, `
    <defs>
      <linearGradient id="tpbg-wf-iris" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#e9d5ff"/>
        <stop offset="0.25" stop-color="#a5b4fc"/>
        <stop offset="0.45" stop-color="#67e8f9"/>
        <stop offset="0.65" stop-color="#f0abfc"/>
        <stop offset="0.85" stop-color="#c4b5fd"/>
        <stop offset="1" stop-color="#e0e7ff"/>
      </linearGradient>
      <linearGradient id="tpbg-wf-beam" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.32"/>
      </linearGradient>
      <radialGradient id="tpbg-wf-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.7"/>
        <stop offset="0.5" stop-color="#c4b5fd" stop-opacity="0.3"/>
        <stop offset="1" stop-color="#c4b5fd" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-wf-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f3f1fd" stop-opacity="0"/>
        <stop offset="0.6" stop-color="#f3f1fd" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#f3f1fd" stop-opacity="1"/>
      </linearGradient>
      <clipPath id="tpbg-wf-clip"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
    </defs>
    ${chipStars(71, 36, 1080, 160, '#e9d5ff', 1.2)}
    <path d="M360 40H420L470 230H310Z" fill="url(#tpbg-wf-beam)"/>
    <path d="M515 20H565L600 220H480Z" fill="url(#tpbg-wf-beam)"/>
    <path d="M660 40H720L770 230H610Z" fill="url(#tpbg-wf-beam)"/>
    <ellipse cx="${cx}" cy="${cy + 20}" rx="520" ry="200" fill="url(#tpbg-wf-glow)"/>
    <ellipse cx="${cx}" cy="${cy + 14}" rx="${rx}" ry="${ry}" fill="#5b45c4"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#tpbg-wf-iris)"/>
    <g clip-path="url(#tpbg-wf-clip)">
      <g stroke="#ffffff" stroke-opacity="0.55" stroke-width="0.8" fill="none">${grid}</g>
      ${dies}
      <path d="M${cx - 260} ${cy + ry}L${cx - 60} ${cy - ry}H${cx + 40}L${cx - 160} ${cy + ry}Z" fill="#ffffff" opacity="0.28"/>
      <path d="M${cx + 10} ${cy + ry}L${cx + 170} ${cy - ry}H${cx + 200}L${cx + 40} ${cy + ry}Z" fill="#ffffff" opacity="0.2"/>
    </g>
    <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="#ffffff" stroke-width="2" stroke-opacity="0.85"/>
    <path d="M${cx - 9} ${cy + ry}A9 6 0 0 1 ${cx + 9} ${cy + ry}Z" fill="#5b45c4"/>
    <g fill="none" stroke="#e9d5ff" stroke-opacity="0.6">
      <path d="M150 140l14-8 14 8v16l-14 8-14-8z"/><path d="M900 110l18-10 18 10v20l-18 10-18-10z"/>
      <path d="M960 200l10-6 10 6v12l-10 6-10-6z"/>
    </g>
    ${chipSparkle(820, 150, 8)}${chipSparkle(260, 110, 6, '#e9d5ff', 0.85)}
    <rect y="360" width="1080" height="100" fill="url(#tpbg-wf-fade)"/>
  `);
}

export function pcbTraceArt() {
  const H = 440, x0 = 440, y0 = 140, S = 200;
  let traces = '', vias = '', pins = '';
  for (let i = 0; i < 12; i++) {
    const y = y0 + 12 + i * 16;
    const k = i - 5.5;
    const lx = 380 - Math.abs(k) * 10;
    traces += `<path d="M${x0 - 8} ${y}H${lx}L${lx - 60} ${y + k * 10}H-10"/>`;
    traces += `<path d="M${x0 + S + 8} ${y}H${1080 - lx}L${1140 - lx} ${y + k * 10}H1090"/>`;
    if (i % 3 === 0) vias += `<circle cx="${lx - 60}" cy="${y + k * 10}" r="4.5"/><circle cx="${1140 - lx}" cy="${y + k * 10}" r="4.5"/>`;
    pins += `<rect x="${x0 - 12}" y="${y - 3}" width="12" height="6"/><rect x="${x0 + S}" y="${y - 3}" width="12" height="6"/>`;
  }
  for (let j = 0; j < 12; j++) {
    const x = x0 + 12 + j * 16;
    pins += `<rect x="${x - 3}" y="${y0 - 12}" width="6" height="12"/><rect x="${x - 3}" y="${y0 + S}" width="6" height="12"/>`;
    const ty = 118 - (j < 6 ? j : 11 - j) * 8;
    traces += `<path d="M${x} ${y0 - 12}V${ty}H${j < 6 ? -10 : 1090}"/>`;
    traces += `<path d="M${x} ${y0 + S + 12}V${H + 10}"/>`;
  }
  const smd = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#1f2937"/><rect x="${x}" y="${y}" width="${w * 0.22}" height="${h}" fill="#e3b341"/><rect x="${x + w * 0.78}" y="${y}" width="${w * 0.22}" height="${h}" fill="#e3b341"/>`;
  return chipSvg(H, `
    <defs>
      <pattern id="tpbg-pc-dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1" fill="#6ee7b7" fill-opacity="0.18"/></pattern>
      <radialGradient id="tpbg-pc-glow" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#fcd34d" stop-opacity="0.35"/>
        <stop offset="1" stop-color="#fcd34d" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-pc-chip" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2b3445"/>
        <stop offset="1" stop-color="#0b0f17"/>
      </linearGradient>
      <linearGradient id="tpbg-pc-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#f2f6f0" stop-opacity="0"/>
        <stop offset="0.6" stop-color="#f2f6f0" stop-opacity="0.85"/>
        <stop offset="1" stop-color="#f2f6f0" stop-opacity="1"/>
      </linearGradient>
    </defs>
    <rect width="1080" height="${H}" fill="url(#tpbg-pc-dots)"/>
    <circle cx="${x0 + S / 2}" cy="${y0 + S / 2}" r="300" fill="url(#tpbg-pc-glow)"/>
    <g fill="none" stroke="#e3b341" stroke-opacity="0.72" stroke-width="2.2">${traces}</g>
    <g fill="#053d2b" stroke="#e3b341" stroke-width="2">${vias}</g>
    <g fill="#f5d77a">${pins}</g>
    <rect x="${x0}" y="${y0}" width="${S}" height="${S}" rx="12" fill="url(#tpbg-pc-chip)" stroke="#e3b341" stroke-opacity="0.6"/>
    <rect x="${x0 + 18}" y="${y0 + 18}" width="${S - 36}" height="${S - 36}" rx="6" fill="none" stroke="#94a3b8" stroke-opacity="0.35"/>
    <path d="M${x0 + 6} ${y0 + 6}L${x0 + 90} ${y0 + 6}L${x0 + 6} ${y0 + 90}Z" fill="#ffffff" opacity="0.06"/>
    <circle cx="${x0 + 34}" cy="${y0 + 34}" r="5" fill="#94a3b8" opacity="0.5"/>
    <text x="${x0 + S / 2}" y="${y0 + S / 2 + 4}" text-anchor="middle" fill="#f5d77a" font-size="30" font-weight="800" letter-spacing="3" font-family="Consolas, 'Segoe UI', monospace">SoC</text>
    <text x="${x0 + S / 2}" y="${y0 + S / 2 + 30}" text-anchor="middle" fill="#cbd5e1" fill-opacity="0.6" font-size="11" letter-spacing="2" font-family="Consolas, monospace">TP-2026 · 5NM</text>
    ${smd(250, 300, 26, 11)}${smd(800, 300, 26, 11)}${smd(300, 360, 18, 9)}${smd(760, 352, 18, 9)}${smd(160, 210, 18, 9)}${smd(900, 236, 18, 9)}
    <g fill="#ecfdf5" fill-opacity="0.55" font-size="10" font-family="Consolas, monospace">
      <text x="250" y="292">R12</text><text x="800" y="292">C7</text><text x="160" y="202">L3</text><text x="${x0 + S - 18}" y="${y0 - 18}">U1</text>
    </g>
    ${chipSparkle(x0 + S - 10, y0 + 12, 7, '#fff7d6', 0.9)}
    <rect y="330" width="1080" height="110" fill="url(#tpbg-pc-fade)"/>
  `);
}

export function euvLithoArt() {
  const H = 520, wcx = 545, wcy = 456, wrx = 330, wry = 62;
  let grid = '', mask = '';
  for (let x = wcx - wrx + 15; x < wcx + wrx; x += 26) grid += `<path d="M${x} ${wcy - wry}V${wcy + wry}"/>`;
  for (let y = wcy - wry + 6; y < wcy + wry; y += 9) grid += `<path d="M${wcx - wrx} ${y}H${wcx + wrx}"/>`;
  const r = chipRng(13);
  for (let i = 0; i < 16; i++) {
    const u = -0.75 + r() * 1.2, v = -0.7 + r() * 1.3, len = 0.12 + r() * 0.2;
    const x = 640 + (u - v) * 85, y = 214 + (u + v) * 19;
    mask += `<path d="M${x.toFixed(1)} ${y.toFixed(1)}l${(len * 85).toFixed(1)} ${(len * 19).toFixed(1)}" stroke="${i % 3 ? '#fbbf24' : '#67e8f9'}"/>`;
  }
  return chipSvg(H, `
    <defs>
      <radialGradient id="tpbg-eu-src" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="0.2" stop-color="#f0abfc" stop-opacity="0.9"/>
        <stop offset="1" stop-color="#c026d3" stop-opacity="0"/>
      </radialGradient>
      <linearGradient id="tpbg-eu-b1" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f0abfc" stop-opacity="0.7"/>
        <stop offset="1" stop-color="#a78bfa" stop-opacity="0.35"/>
      </linearGradient>
      <linearGradient id="tpbg-eu-b3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#a78bfa" stop-opacity="0.4"/>
        <stop offset="1" stop-color="#ffffff" stop-opacity="0.85"/>
      </linearGradient>
      <linearGradient id="tpbg-eu-wafer" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#312e81"/>
        <stop offset="0.4" stop-color="#6d28d9"/>
        <stop offset="0.7" stop-color="#0e7490"/>
        <stop offset="1" stop-color="#4c1d95"/>
      </linearGradient>
      <radialGradient id="tpbg-eu-spot" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>
        <stop offset="0.35" stop-color="#67e8f9" stop-opacity="0.55"/>
        <stop offset="1" stop-color="#67e8f9" stop-opacity="0"/>
      </radialGradient>
      <clipPath id="tpbg-eu-clip"><ellipse cx="${wcx}" cy="${wcy}" rx="${wrx}" ry="${wry}"/></clipPath>
    </defs>
    ${chipStars(19, 70, 1080, H, '#ddd6fe', 1.3)}
    <circle cx="150" cy="200" r="110" fill="url(#tpbg-eu-src)"/>
    <path d="M118 150Q72 200 118 250" fill="none" stroke="#e9d5ff" stroke-width="6" stroke-linecap="round" opacity="0.8"/>
    <path d="M150 200L404 154L456 206Z" fill="url(#tpbg-eu-b1)"/>
    <g stroke-linecap="round"><path d="M398 148L462 212" stroke="#e9d5ff" stroke-width="7"/><path d="M406 142L470 206" stroke="#a78bfa" stroke-width="2" opacity="0.8"/></g>
    <path d="M404 154L456 206L600 232L700 198Z" fill="#a78bfa" opacity="0.34"/>
    ${isoSlab(640, 214, 170, 38, 8, '#1e1b4b', '#110e33', '#18144a', 'rgba(196,181,253,0.85)')}
    <g stroke-width="2.2" stroke-linecap="round" opacity="0.85">${mask}</g>
    <path d="M560 258H720L562 446H528Z" fill="url(#tpbg-eu-b3)"/>
    <ellipse cx="600" cy="330" rx="60" ry="12" fill="#ffffff" fill-opacity="0.08" stroke="#e9d5ff" stroke-opacity="0.75"/>
    <ellipse cx="570" cy="390" rx="36" ry="8" fill="#ffffff" fill-opacity="0.1" stroke="#e9d5ff" stroke-opacity="0.75"/>
    <ellipse cx="${wcx}" cy="${wcy + 9}" rx="${wrx}" ry="${wry}" fill="#1e1250"/>
    <ellipse cx="${wcx}" cy="${wcy}" rx="${wrx}" ry="${wry}" fill="url(#tpbg-eu-wafer)"/>
    <g clip-path="url(#tpbg-eu-clip)"><g stroke="#c4b5fd" stroke-opacity="0.4" stroke-width="0.8" fill="none">${grid}</g></g>
    <ellipse cx="${wcx}" cy="${wcy}" rx="${wrx}" ry="${wry}" fill="none" stroke="#e9d5ff" stroke-opacity="0.7" stroke-width="1.6"/>
    <ellipse cx="${wcx}" cy="${wcy - 8}" rx="120" ry="30" fill="url(#tpbg-eu-spot)"/>
    ${chipSparkle(wcx, wcy - 10, 12, '#ffffff', 0.95)}${chipSparkle(880, 120, 8, '#f0abfc', 0.85)}${chipSparkle(960, 330, 6, '#ddd6fe', 0.8)}
  `);
}
