import { BACKGROUNDS, BACKGROUND_ALIASES, resolveBackground, renderHeroDecoSvg } from './backgrounds.mjs';
export { BACKGROUNDS, BACKGROUND_ALIASES, resolveBackground, renderHeroDecoSvg };
/**
 * 同构核心渲染模块（Node SSR 与浏览器离线侧边栏实时重渲染共用）
 * 零外部依赖、零网络请求。
 */

export const THEMES = {
  blueprint: {
    name: '珠峰蓝 / 工程蓝图',
    desc: '经典科技蓝基调 + 冰川蓝画布 + 清晰高对比卡片，默认推荐'
  },
  'slate-dark': {
    name: '暗夜架构',
    desc: '深石板暗底 + 电光天蓝/翡翠绿点缀，适合研发内部分享与深色阅读'
  },
  'paper-tech': {
    name: '工业白皮书',
    desc: '暖米纸底 + 炭墨标题 + 陶橙/墨蓝对比，适合深度复盘与组件说明书'
  },
  'emerald-ops': {
    name: '云原生运维',
    desc: '森林深绿顶栏 + 清爽浅绿底 + 状态色，适合网关/可观测/高可用组件'
  }
};

export const SECTION_TYPES = [
  'overview',
  'cards',
  'layers',
  'flow',
  'diagram',
  'timeline',
  'compare',
  'code',
  'callout',
  'qa'
];

export const SECTION_TYPE_LABELS = {
  overview: '概览与指标 (overview)',
  cards: '能力卡片网格 (cards)',
  layers: '分层架构图 (layers)',
  flow: '内置流程图 (flow)',
  diagram: '现成图片/SVG (diagram)',
  timeline: '步骤时间轴 (timeline)',
  compare: '对比矩阵表 (compare)',
  code: '代码/配置示例 (code)',
  callout: '实践与避坑 (callout)',
  qa: '常见问题 FAQ (qa)'
};

const KICKER_DEFAULTS = {
  overview: 'OVERVIEW',
  cards: 'CAPABILITIES',
  layers: 'ARCHITECTURE',
  flow: 'WORKFLOW',
  diagram: 'DIAGRAM',
  timeline: 'LIFECYCLE',
  compare: 'COMPARISON',
  code: 'QUICK START',
  callout: 'BEST PRACTICES',
  qa: 'FAQ'
};

export function createDefaultSection(type) {
  switch (type) {
    case 'overview':
      return {
        type: 'overview',
        kicker: 'OVERVIEW',
        title: '核心定位与关键指标',
        subtitle: '用一句话讲清解决的核心问题',
        summary: '补充组件或技术框架的背景、定位与收益。',
        metrics: [
          { value: '99.99%', label: '服务可用性', note: '双活容灾保障' },
          { value: '< 5ms', label: 'P99 响应延迟', note: '内网实测' }
        ],
        highlights: ['核心亮点一：开箱即用，内网零依赖']
      };
    case 'cards':
      return {
        type: 'cards',
        kicker: 'CAPABILITIES',
        title: '核心功能模块',
        columns: 2,
        items: [
          { badge: 'MODULE A', title: '能力模块一', desc: '简要描述该模块的核心职责与技术特点。', tags: ['高可用', '低延迟'], accent: 'primary' },
          { badge: 'MODULE B', title: '能力模块二', desc: '简要描述该模块的核心职责与技术特点。', tags: ['可扩展'], accent: 'secondary' }
        ]
      };
    case 'layers':
      return {
        type: 'layers',
        kicker: 'ARCHITECTURE',
        title: '分层架构设计',
        layers: [
          { name: '接入层', desc: '统一流量入口', tone: 'primary', modules: [{ name: '网关接入', detail: '协议与鉴权' }, { name: '负载均衡', detail: '高可用分发' }] },
          { name: '核心服务层', desc: '业务逻辑与编排', tone: 'secondary', modules: [{ name: '编排引擎', detail: '状态流转' }, { name: '规则引擎', detail: '动态配置' }] }
        ],
        sidebars: [{ name: '横切支撑', items: ['监控指标', '链路追踪', '审计日志'] }]
      };
    case 'flow':
      return {
        type: 'flow',
        kicker: 'WORKFLOW',
        title: '核心处理流程图',
        direction: 'LR',
        steps: [
          { id: 's1', title: '请求进入', subtitle: '内网调用', kind: 'start' },
          { id: 's2', title: '参数与权限校验', subtitle: '鉴权拦截', kind: 'process' },
          { id: 's3', title: '命中缓存？', subtitle: '本地/分布式', kind: 'decision' },
          { id: 's4', title: '直接返回', subtitle: '低延迟命中', kind: 'end' },
          { id: 's5', title: '回源计算存储', subtitle: '写入缓存', kind: 'db' }
        ],
        edges: [
          { from: 's1', to: 's2' },
          { from: 's2', to: 's3' },
          { from: 's3', to: 's4', label: '是', style: 'success' },
          { from: 's3', to: 's5', label: '否', style: 'warn' }
        ],
        caption: '点击左侧编辑器可自由增删节点、修改连线标签或切换 LR/TB 布局。'
      };
    case 'diagram':
      return {
        type: 'diagram',
        kicker: 'DIAGRAM',
        title: '架构图 / 流程图展示',
        surface: 'light',
        caption: '在左侧编辑器点击“选择本地图片/SVG”即可直接内嵌现成的 .svg / .png / .jpg / .webp 文件。',
        svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 180" width="720" height="180" font-family="PingFang SC, Microsoft YaHei, sans-serif"><rect width="720" height="180" rx="10" fill="#f8fafc" stroke="#cbd5e1" stroke-dasharray="6 4"/><text x="360" y="84" text-anchor="middle" font-size="16" font-weight="700" fill="#334155">暂无图表：请在侧边栏选择本地 SVG / PNG 图片</text><text x="360" y="112" text-anchor="middle" font-size="13" fill="#64748b">所有图片均在本地转为内联 SVG / Base64，零外网上传</text></svg>'
      };
    case 'timeline':
      return {
        type: 'timeline',
        kicker: 'LIFECYCLE',
        title: '实施与接入步骤',
        items: [
          { step: '01', title: '第一步：环境准备', tag: '5 分钟', desc: '确认内网集群与权限配置。', bullets: ['核对内网镜像仓库地址'] },
          { step: '02', title: '第二步：提交配置上线', tag: '10 分钟', desc: '提交声明式配置并完成灰度验证。', bullets: ['观察核心指标与日志'] }
        ]
      };
    case 'compare':
      return {
        type: 'compare',
        kicker: 'COMPARISON',
        title: '方案能力对比',
        headers: ['对比维度', '旧方案', '新方案（推荐）'],
        highlightCol: 2,
        rows: [
          { cells: ['维护成本', '手工运维，易出错', '声明式自动化，一键回滚'] },
          { cells: ['性能表现', '单机瓶颈明显', '水平扩展，高并发稳定'], emphasis: true }
        ]
      };
    case 'code':
      return {
        type: 'code',
        kicker: 'QUICK START',
        title: '快速接入配置示例',
        language: 'yaml',
        filename: 'config.yaml',
        code: 'service:\n  name: demo-service\n  port: 8080\n  retry: false',
        annotations: [{ title: '关键字段说明', desc: '按业务实际需求调整端口与超时参数。' }]
      };
    case 'callout':
      return {
        type: 'callout',
        kicker: 'BEST PRACTICES',
        title: '最佳实践与注意事项',
        items: [
          { tone: 'tip', title: '推荐做法', points: ['先灰度 5% 流量观察后再全量发布'] },
          { tone: 'warn', title: '避坑提示', points: ['非幂等写接口禁止开启自动重试'] }
        ]
      };
    case 'qa':
    default:
      return {
        type: 'qa',
        kicker: 'FAQ',
        title: '常见问题速查',
        items: [
          { q: '如何确认该组件在纯内网离线环境正常运行？', a: '所有依赖均打入内网制品库，无公网域名请求。' }
        ]
      };
  }
}

export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function estimateTextWidth(text, fontSize = 14) {
  let width = 0;
  for (const ch of String(text ?? '')) {
    width += ch.charCodeAt(0) > 127 ? fontSize * 1.02 : fontSize * 0.6;
  }
  return width;
}

export function wrapText(text, maxWidth, fontSize = 14, maxLines = 2) {
  const raw = String(text ?? '').trim();
  if (!raw) return [];
  const lines = [];
  let cur = '';
  for (const ch of raw) {
    if (ch === '\n') {
      lines.push(cur);
      cur = '';
      continue;
    }
    const next = cur + ch;
    if (estimateTextWidth(next, fontSize) > maxWidth && cur.length > 0) {
      lines.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    const last = kept[maxLines - 1];
    kept[maxLines - 1] = last.length > 2 ? `${last.slice(0, -1)}…` : last;
    return kept;
  }
  return lines;
}

export function sanitizeInlineSvg(svgRaw, sourceLabel = 'svg') {
  let svg = String(svgRaw ?? '').trim();
  if (!svg) throw new Error(`${sourceLabel} 内容为空`);
  svg = svg.replace(/^\uFEFF/, '');
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '');
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '');
  svg = svg.trim();

  if (!/^<svg\b/i.test(svg)) {
    throw new Error(`${sourceLabel} 不是有效的 SVG 内容（缺少 <svg> 根标签）`);
  }
  if (/<script\b/i.test(svg)) {
    throw new Error(`安全拦截：${sourceLabel} 内包含 <script> 标签，已拒绝内嵌`);
  }
  if (/\b(?:href|xlink:href|src)\s*=\s*["']\s*(?:https?:|\/\/)/i.test(svg) || /url\(\s*['"]?\s*(?:https?:|\/\/)/i.test(svg)) {
    throw new Error(`安全拦截：${sourceLabel} 内包含外部网络 URL 引用，已拒绝内嵌`);
  }

  svg = svg.replace(/^<svg\b([^>]*)>/i, (full, attrs) => {
    const hasViewBox = /\bviewBox\s*=/i.test(attrs);
    let nextAttrs = attrs;
    if (!hasViewBox) {
      const wm = attrs.match(/\bwidth\s*=\s*["']?([\d.]+)/i);
      const hm = attrs.match(/\bheight\s*=\s*["']?([\d.]+)/i);
      if (wm && hm) {
        nextAttrs += ` viewBox="0 0 ${wm[1]} ${hm[1]}"`;
      }
    }
    if (/\bclass\s*=/i.test(nextAttrs)) {
      nextAttrs = nextAttrs.replace(/\bclass\s*=\s*(["'])([^"']*)\1/i, 'class="$2 embedded-svg"');
    } else {
      nextAttrs += ' class="embedded-svg"';
    }
    return `<svg${nextAttrs}>`;
  });
  return svg;
}

export function highlightCode(code, lang = '') {
  const l = String(lang).toLowerCase();
  const lines = String(code ?? '').replace(/\r\n/g, '\n').split('\n');

  return lines.map((rawLine) => {
    const line = esc(rawLine);
    if (/^\s*(#|\/\/|--)/.test(rawLine)) {
      return `<span class="tok-com">${line}</span>`;
    }
    if (l === 'yaml' || l === 'yml') {
      return line
        .replace(/(#.*)$/, '<span class="tok-com">$1</span>')
        .replace(/^(\s*-?\s*)([\w.-]+)(\s*:)/, '$1<span class="tok-key">$2</span>$3')
        .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="tok-str">$1</span>')
        .replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>')
        .replace(/(:\s*)(\d+(?:\.\d+)?)\b/g, '$1<span class="tok-num">$2</span>');
    }
    if (l === 'json') {
      return line
        .replace(/(&quot;[^&]*?&quot;)(\s*:)/g, '<span class="tok-key">$1</span>$2')
        .replace(/(:\s*)(&quot;[^&]*?&quot;)/g, '$1<span class="tok-str">$2</span>')
        .replace(/\b(true|false|null)\b/g, '<span class="tok-kw">$1</span>')
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
    }
    return line
      .replace(/(\/\/.*$|#.*$)/, '<span class="tok-com">$1</span>')
      .replace(/(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g, '<span class="tok-str">$1</span>')
      .replace(
        /\b(import|export|from|const|let|var|function|async|await|return|if|else|for|while|class|interface|type|public|private|package|func|struct|def|SELECT|FROM|WHERE|INSERT|INTO|UPDATE|SET|JOIN|GROUP BY|ORDER BY|true|false|null|nil|None)\b/g,
        '<span class="tok-kw">$1</span>'
      )
      .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tok-num">$1</span>');
  }).join('\n');
}

export function renderFlowSvg(section, canvasWidth = 1080) {
  const steps = Array.isArray(section.steps) ? section.steps : [];
  const edges = Array.isArray(section.edges) ? section.edges : [];
  if (steps.length === 0) return '<div class="empty-note">暂无流程步骤，请在侧边栏添加节点</div>';

  const dir = String(section.direction || 'LR').toUpperCase() === 'TB' ? 'TB' : 'LR';
  const nodeMap = new Map();
  steps.forEach((s, idx) => {
    const id = String(s.id ?? `step-${idx + 1}`);
    nodeMap.set(id, {
      id,
      title: String(s.title ?? s.label ?? id),
      subtitle: String(s.subtitle ?? s.desc ?? ''),
      kind: s.kind || 'process',
      group: s.group ? String(s.group) : '',
      index: idx
    });
  });

  const resolvedEdges = edges.length > 0
    ? edges
      .map((e) => ({
        from: String(e.from ?? ''),
        to: String(e.to ?? ''),
        label: e.label ? String(e.label) : '',
        style: e.style || 'default'
      }))
      .filter((e) => nodeMap.has(e.from) && nodeMap.has(e.to))
    : steps.slice(0, -1).map((s, i) => ({
      from: String(s.id ?? `step-${i + 1}`),
      to: String(steps[i + 1].id ?? `step-${i + 2}`),
      label: '',
      style: 'default'
    }));

  const outAdj = new Map([...nodeMap.keys()].map((id) => [id, []]));
  const inDeg = new Map([...nodeMap.keys()].map((id) => [id, 0]));
  for (const e of resolvedEdges) {
    const fi = nodeMap.get(e.from).index;
    const ti = nodeMap.get(e.to).index;
    if (ti > fi) {
      outAdj.get(e.from).push(e.to);
      inDeg.set(e.to, inDeg.get(e.to) + 1);
    }
  }

  const layerOf = new Map();
  const queue = [];
  for (const [id, deg] of inDeg.entries()) {
    if (deg === 0) {
      layerOf.set(id, 0);
      queue.push(id);
    }
  }
  if (queue.length === 0) {
    const firstId = [...nodeMap.keys()][0];
    layerOf.set(firstId, 0);
    queue.push(firstId);
  }
  while (queue.length > 0) {
    const u = queue.shift();
    const lu = layerOf.get(u) ?? 0;
    for (const v of outAdj.get(u) || []) {
      const nextL = Math.max(layerOf.get(v) ?? 0, lu + 1);
      layerOf.set(v, nextL);
      inDeg.set(v, inDeg.get(v) - 1);
      if (inDeg.get(v) <= 0) queue.push(v);
    }
  }
  for (const [id, n] of nodeMap.entries()) {
    if (!layerOf.has(id)) layerOf.set(id, n.index);
  }

  const maxLayer = Math.max(...layerOf.values());
  const layers = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodeMap.values()) {
    layers[layerOf.get(n.id)].push(n);
  }
  for (const l of layers) l.sort((a, b) => a.index - b.index);

  const availWidth = Math.max(760, canvasWidth - 130);
  const baseW = dir === 'LR' ? Math.min(182, Math.max(138, Math.floor((availWidth - 40) / Math.max(1, layers.length) - 44))) : 210;
  const baseH = dir === 'LR' ? 76 : 72;

  for (const n of nodeMap.values()) {
    const tw = Math.max(estimateTextWidth(n.title, 14), estimateTextWidth(n.subtitle, 12));
    const minW = n.kind === 'decision' ? Math.max(baseW, 152) : baseW;
    n.w = Math.min(dir === 'LR' ? 210 : 250, Math.max(minW, Math.ceil(tw + 38)));
    n.h = n.subtitle ? baseH : 54;
    if (n.kind === 'db') n.h = Math.max(n.h, 74);
  }

  const padX = 36;
  const padY = 40;
  const hasEdgeLabels = resolvedEdges.some((e) => e.label);
  const gapMain = dir === 'LR' ? (hasEdgeLabels ? 76 : 58) : (hasEdgeLabels ? 62 : 52);
  const gapCross = dir === 'LR' ? 38 : 44;

  let svgW = 0;
  let svgH = 0;

  if (dir === 'LR') {
    const colWidths = layers.map((l) => Math.max(...l.map((n) => n.w)));
    const colHeights = layers.map((l) => l.reduce((sum, n) => sum + n.h, 0) + Math.max(0, l.length - 1) * gapCross);
    const maxColH = Math.max(...colHeights);
    let curX = padX;
    layers.forEach((l, li) => {
      const colW = colWidths[li];
      const colH = colHeights[li];
      let curY = padY + (maxColH - colH) / 2;
      for (const n of l) {
        n.x = curX + (colW - n.w) / 2;
        n.y = curY;
        n.cx = n.x + n.w / 2;
        n.cy = n.y + n.h / 2;
        curY += n.h + gapCross;
      }
      curX += colW + gapMain;
    });
    for (let li = 1; li < layers.length; li++) {
      if (layers[li].length !== 1) continue;
      const n = layers[li][0];
      const preds = resolvedEdges
        .filter((e) => e.to === n.id && layerOf.get(e.from) === li - 1)
        .map((e) => nodeMap.get(e.from));
      if (preds.length === 1) {
        const p = preds[0];
        n.cy = p.cy;
        n.y = n.cy - n.h / 2;
      }
    }
    svgW = curX - gapMain + padX;
    svgH = Math.max(maxColH + padY * 2, ...[...nodeMap.values()].map((n) => n.y + n.h + padY));
  } else {
    const rowHeights = layers.map((l) => Math.max(...l.map((n) => n.h)));
    const rowWidths = layers.map((l) => l.reduce((sum, n) => sum + n.w, 0) + Math.max(0, l.length - 1) * gapCross);
    const maxRowW = Math.max(...rowWidths, 680);
    let curY = padY;
    layers.forEach((l, li) => {
      const rowH = rowHeights[li];
      const rowW = rowWidths[li];
      let curX = padX + (maxRowW - rowW) / 2;
      for (const n of l) {
        n.x = curX;
        n.y = curY + (rowH - n.h) / 2;
        n.cx = n.x + n.w / 2;
        n.cy = n.y + n.h / 2;
        curX += n.w + gapCross;
      }
      curY += rowH + gapMain;
    });
    svgW = maxRowW + padX * 2;
    svgH = curY - gapMain + padY;
  }

  const hasBackEdge = resolvedEdges.some((e) => layerOf.get(e.to) <= layerOf.get(e.from));
  if (hasBackEdge) {
    if (dir === 'LR') svgH += 34;
    else svgW += 48;
  }

  const groupBoxes = new Map();
  for (const n of nodeMap.values()) {
    if (!n.group) continue;
    const box = groupBoxes.get(n.group) || { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
    box.minX = Math.min(box.minX, n.x);
    box.minY = Math.min(box.minY, n.y);
    box.maxX = Math.max(box.maxX, n.x + n.w);
    box.maxY = Math.max(box.maxY, n.y + n.h);
    groupBoxes.set(n.group, box);
  }

  const groupMarkup = [...groupBoxes.entries()].map(([name, b]) => {
    const gx = b.minX - 14;
    const gy = b.minY - 26;
    const gw = b.maxX - b.minX + 28;
    const gh = b.maxY - b.minY + 40;
    return `
      <g class="flow-group">
        <rect x="${gx}" y="${gy}" width="${gw}" height="${gh}" rx="12" fill="var(--flow-group-bg)" stroke="var(--flow-group-border)" stroke-dasharray="5 4" stroke-width="1.3" />
        <text x="${gx + 12}" y="${gy + 16}" font-size="11.5" font-weight="700" fill="var(--text-muted)">${esc(name)}</text>
      </g>`;
  }).join('');

  const viewMinY = groupBoxes.size > 0 ? -12 : 0;
  const viewH = svgH - viewMinY;

  const markerIdBase = `arrow-${Math.abs(
    steps.map((s) => s.title || s.id).join('').split('').reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 7)
  )}`;

  const edgeMarkup = resolvedEdges.map((e) => {
    const a = nodeMap.get(e.from);
    const b = nodeMap.get(e.to);
    const la = layerOf.get(e.from);
    const lb = layerOf.get(e.to);

    const strokeColor = e.style === 'success'
      ? 'var(--success)'
      : e.style === 'warn'
        ? 'var(--warn)'
        : 'var(--flow-edge)';
    const markerId = e.style === 'success'
      ? `${markerIdBase}-ok`
      : e.style === 'warn'
        ? `${markerIdBase}-warn`
        : `${markerIdBase}-def`;
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6 4"' : '';

    let d = '';
    let lx = 0;
    let ly = 0;

    if (lb <= la) {
      if (dir === 'LR') {
        const yLoop = svgH - 18;
        const sx = a.cx;
        const sy = a.y + a.h;
        const tx = b.cx;
        const ty = b.y + b.h;
        d = `M ${sx} ${sy} L ${sx} ${yLoop} L ${tx} ${yLoop} L ${tx} ${ty + 2}`;
        lx = (sx + tx) / 2;
        ly = yLoop - 8;
      } else {
        const xLoop = svgW - 22;
        const sx = a.x + a.w;
        const sy = a.cy;
        const tx = b.x + b.w;
        const ty = b.cy;
        d = `M ${sx} ${sy} L ${xLoop} ${sy} L ${xLoop} ${ty} L ${tx + 2} ${ty}`;
        lx = xLoop - 6;
        ly = (sy + ty) / 2;
      }
    } else if (dir === 'LR') {
      const sx = a.x + a.w;
      const sy = a.cy;
      const tx = b.x;
      const ty = b.cy;
      if (Math.abs(sy - ty) < 2) {
        d = `M ${sx} ${sy} L ${tx - 2} ${ty}`;
        lx = (sx + tx) / 2;
        ly = sy - 11;
      } else {
        const midX = sx + (tx - sx) * 0.48;
        d = `M ${sx} ${sy} C ${midX} ${sy}, ${midX} ${ty}, ${tx - 2} ${ty}`;
        lx = midX;
        ly = (sy + ty) / 2;
      }
    } else {
      const sx = a.cx;
      const sy = a.y + a.h;
      const tx = b.cx;
      const ty = b.y;
      if (Math.abs(sx - tx) < 2) {
        d = `M ${sx} ${sy} L ${tx} ${ty - 2}`;
        lx = sx + 10;
        ly = (sy + ty) / 2;
      } else {
        const midY = sy + (ty - sy) * 0.48;
        d = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty - 2}`;
        lx = (sx + tx) / 2;
        ly = midY;
      }
    }

    let labelSvg = '';
    if (e.label) {
      const lw = Math.max(36, Math.ceil(estimateTextWidth(e.label, 11.5) + 14));
      labelSvg = `
        <g>
          <rect x="${lx - lw / 2}" y="${ly - 10}" width="${lw}" height="20" rx="10" fill="var(--surface)" stroke="${strokeColor}" stroke-width="1" />
          <text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="11.5" font-weight="600" fill="${strokeColor}">${esc(e.label)}</text>
        </g>`;
    }

    return `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="2"${dash} marker-end="url(#${markerId})" />${labelSvg}`;
  }).join('\n');

  const nodeMarkup = [...nodeMap.values()].map((n) => {
    const titleLines = wrapText(n.title, n.w - 28, 13.5, 2);
    const subLines = n.subtitle ? wrapText(n.subtitle, n.w - 24, 11.5, 1) : [];
    const totalTextH = titleLines.length * 17 + (subLines.length ? subLines.length * 15 + 4 : 0);
    let textY = n.cy - totalTextH / 2 + 13;
    if (n.kind === 'db') textY += 5;

    let shape = '';
    if (n.kind === 'start' || n.kind === 'end') {
      const fill = n.kind === 'start' ? 'var(--accent-soft)' : 'var(--surface-2)';
      const stroke = n.kind === 'start' ? 'var(--accent)' : 'var(--border-strong)';
      shape = `
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.8" />
        <circle cx="${n.x + 15}" cy="${n.cy}" r="4" fill="${n.kind === 'start' ? 'var(--accent)' : 'var(--text-muted)'}" />`;
    } else if (n.kind === 'decision') {
      const cut = 15;
      const pts = [
        `${n.x + cut},${n.y}`,
        `${n.x + n.w - cut},${n.y}`,
        `${n.x + n.w},${n.cy}`,
        `${n.x + n.w - cut},${n.y + n.h}`,
        `${n.x + cut},${n.y + n.h}`,
        `${n.x},${n.cy}`
      ].join(' ');
      shape = `<polygon points="${pts}" fill="var(--warn-soft)" stroke="var(--warn)" stroke-width="1.8" />`;
    } else if (n.kind === 'db') {
      const ry = 8;
      shape = `
        <path d="M ${n.x} ${n.y + ry} L ${n.x} ${n.y + n.h - ry} A ${n.w / 2} ${ry} 0 0 0 ${n.x + n.w} ${n.y + n.h - ry} L ${n.x + n.w} ${n.y + ry}" fill="var(--surface)" stroke="var(--accent-2)" stroke-width="1.8" />
        <ellipse cx="${n.cx}" cy="${n.y + ry}" rx="${n.w / 2}" ry="${ry}" fill="var(--accent-2-soft)" stroke="var(--accent-2)" stroke-width="1.8" />`;
    } else if (n.kind === 'service') {
      shape = `
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="var(--surface)" stroke="var(--accent-2)" stroke-width="1.8" />
        <line x1="${n.x + 10}" y1="${n.y + 8}" x2="${n.x + 10}" y2="${n.y + n.h - 8}" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" opacity="0.65" />
        <line x1="${n.x + n.w - 10}" y1="${n.y + 8}" x2="${n.x + n.w - 10}" y2="${n.y + n.h - 8}" stroke="var(--accent-2)" stroke-width="2" stroke-linecap="round" opacity="0.65" />`;
    } else {
      shape = `
        <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="var(--surface)" stroke="var(--border-strong)" stroke-width="1.6" />
        <rect x="${n.x}" y="${n.y + 10}" width="4" height="${n.h - 20}" rx="2" fill="var(--accent)" />`;
    }

    const titleSvg = titleLines.map((ln) => {
      const el = `<text x="${n.cx}" y="${textY}" text-anchor="middle" font-size="13.5" font-weight="700" fill="var(--text)">${esc(ln)}</text>`;
      textY += 17;
      return el;
    }).join('');

    const subSvg = subLines.map((ln) => {
      textY += 2;
      const el = `<text x="${n.cx}" y="${textY}" text-anchor="middle" font-size="11.5" fill="var(--text-muted)">${esc(ln)}</text>`;
      textY += 15;
      return el;
    }).join('');

    return `<g class="flow-node">${shape}${titleSvg}${subSvg}</g>`;
  }).join('\n');

  return `
    <div class="flow-canvas">
      <svg class="flow-svg" viewBox="0 ${viewMinY} ${Math.ceil(svgW)} ${Math.ceil(viewH)}" width="${Math.ceil(svgW)}" height="${Math.ceil(viewH)}" role="img" aria-label="${esc(section.title)}">
        <defs>
          <marker id="${markerIdBase}-def" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--flow-edge)" />
          </marker>
          <marker id="${markerIdBase}-ok" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--success)" />
          </marker>
          <marker id="${markerIdBase}-warn" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto">
            <path d="M 0 1 L 10 5 L 0 9 z" fill="var(--warn)" />
          </marker>
        </defs>
        ${groupMarkup}
        ${edgeMarkup}
        ${nodeMarkup}
      </svg>
    </div>`;
}

function renderMediaSync(asset, maxHeight, altFallback = '技术图表') {
  const styleAttr = maxHeight ? ` style="max-height:${Number(maxHeight)}px"` : '';
  if (asset && asset.svg && typeof asset.svg === 'string') {
    const cleaned = sanitizeInlineSvg(asset.svg, '内联 svg');
    return `<div class="diagram-media diagram-media--svg"${styleAttr}>${cleaned}</div>`;
  }
  if (asset && asset.dataUri && /^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,/i.test(asset.dataUri)) {
    const alt = esc(asset.alt || asset.title || altFallback);
    return `<div class="diagram-media diagram-media--img"><img src="${asset.dataUri}" alt="${alt}"${styleAttr} /></div>`;
  }
  return '<div class="empty-note">尚未加载图片或 SVG，可在侧边栏选择本地图片文件内联嵌入</div>';
}

export function renderSectionBodySync(sec, width) {
  switch (sec.type) {
    case 'overview': {
      const metrics = Array.isArray(sec.metrics) ? sec.metrics : [];
      const highlights = Array.isArray(sec.highlights) ? sec.highlights : [];
      const colCount = Math.min(4, Math.max(2, metrics.length || 2));
      return `
        ${sec.summary ? `<p class="overview-summary">${esc(sec.summary)}</p>` : ''}
        ${metrics.length ? `
          <div class="metric-grid" style="grid-template-columns: repeat(${colCount}, minmax(0, 1fr))">
            ${metrics.map((m) => `
              <div class="metric-card">
                <div class="metric-val">${esc(m.value)}</div>
                <div class="metric-label">${esc(m.label)}</div>
                ${m.note ? `<div class="metric-note">${esc(m.note)}</div>` : ''}
              </div>
            `).join('')}
          </div>` : ''}
        ${highlights.length ? `
          <ul class="highlight-list">
            ${highlights.map((h) => `<li><span class="hl-dot"></span><span>${esc(h)}</span></li>`).join('')}
          </ul>` : ''}`;
    }

    case 'cards': {
      const items = Array.isArray(sec.items) ? sec.items : [];
      const cols = sec.columns === 3 ? 3 : 2;
      return `
        <div class="card-grid card-grid--${cols}">
          ${items.map((it) => {
            const accent = ['primary', 'secondary', 'success', 'warn'].includes(it.accent) ? it.accent : 'primary';
            const tags = Array.isArray(it.tags) ? it.tags : [];
            return `
              <article class="cap-card cap-card--${accent}">
                <div class="cap-card-top">
                  ${it.badge ? `<span class="cap-badge">${esc(it.badge)}</span>` : ''}
                  <h3 class="cap-title">${esc(it.title)}</h3>
                </div>
                ${it.desc ? `<p class="cap-desc">${esc(it.desc)}</p>` : ''}
                ${tags.length ? `<div class="tag-row">${tags.map((t) => `<span class="mini-tag">${esc(t)}</span>`).join('')}</div>` : ''}
              </article>`;
          }).join('')}
        </div>`;
    }

    case 'layers': {
      const layers = Array.isArray(sec.layers) ? sec.layers : [];
      const sidebars = Array.isArray(sec.sidebars) ? sec.sidebars : [];
      const hasSide = sidebars.length > 0;
      return `
        <div class="arch-wrap ${hasSide ? 'arch-wrap--with-side' : ''}">
          <div class="arch-stack">
            ${layers.map((layer, idx) => {
              const tone = ['primary', 'secondary', 'success', 'warn'].includes(layer.tone) ? layer.tone : (idx % 2 === 0 ? 'primary' : 'secondary');
              const mods = Array.isArray(layer.modules) ? layer.modules : [];
              return `
                <div class="arch-layer arch-layer--${tone}">
                  <div class="arch-layer-head">
                    <div class="arch-layer-name">${esc(layer.name)}</div>
                    ${layer.desc ? `<div class="arch-layer-desc">${esc(layer.desc)}</div>` : ''}
                  </div>
                  <div class="arch-modules">
                    ${mods.map((m) => `
                      <div class="arch-mod">
                        <div class="arch-mod-name">${esc(typeof m === 'string' ? m : m.name)}</div>
                        ${typeof m === 'object' && m.detail ? `<div class="arch-mod-detail">${esc(m.detail)}</div>` : ''}
                      </div>
                    `).join('')}
                  </div>
                </div>
                ${idx < layers.length - 1 ? '<div class="arch-connector" aria-hidden="true"><span></span></div>' : ''}`;
            }).join('')}
          </div>
          ${hasSide ? `
            <aside class="arch-sidebars">
              ${sidebars.map((sb) => `
                <div class="arch-side-card">
                  <div class="arch-side-title">${esc(sb.name)}</div>
                  <ul class="arch-side-list">
                    ${(sb.items || []).map((item) => `<li>${esc(item)}</li>`).join('')}
                  </ul>
                </div>
              `).join('')}
            </aside>` : ''}
        </div>`;
    }

    case 'flow':
      return `
        ${renderFlowSvg(sec, width)}
        ${sec.caption ? `<p class="figure-caption">${esc(sec.caption)}</p>` : ''}`;

    case 'diagram': {
      const surface = ['auto', 'light', 'transparent'].includes(sec.surface) ? sec.surface : 'auto';
      if (Array.isArray(sec.items) && sec.items.length > 0) {
        const cols = sec.columns === 1 ? 1 : Math.min(2, sec.items.length);
        const rendered = sec.items.map((item) => `
          <figure class="diagram-box diagram-box--${surface}">
            ${item.title ? `<div class="diagram-box-title">${esc(item.title)}</div>` : ''}
            ${renderMediaSync(item, item.maxHeight || sec.maxHeight, item.title || sec.title)}
            ${item.caption ? `<figcaption class="figure-caption">${esc(item.caption)}</figcaption>` : ''}
          </figure>`).join('');
        return `
          <div class="diagram-grid diagram-grid--${cols}">${rendered}</div>
          ${sec.caption ? `<p class="figure-caption">${esc(sec.caption)}</p>` : ''}`;
      }
      return `
        <figure class="diagram-box diagram-box--${surface}">
          ${renderMediaSync(sec, sec.maxHeight, sec.title)}
          ${sec.caption ? `<figcaption class="figure-caption">${esc(sec.caption)}</figcaption>` : ''}
        </figure>`;
    }

    case 'timeline': {
      const items = Array.isArray(sec.items) ? sec.items : [];
      return `
        <div class="timeline-list">
          ${items.map((it, i) => `
            <div class="tl-item">
              <div class="tl-rail">
                <div class="tl-step">${esc(it.step || String(i + 1).padStart(2, '0'))}</div>
                ${i < items.length - 1 ? '<div class="tl-line"></div>' : ''}
              </div>
              <div class="tl-body">
                <div class="tl-head">
                  <h3 class="tl-title">${esc(it.title)}</h3>
                  ${it.tag ? `<span class="tl-tag">${esc(it.tag)}</span>` : ''}
                </div>
                ${it.desc ? `<p class="tl-desc">${esc(it.desc)}</p>` : ''}
                ${Array.isArray(it.bullets) && it.bullets.length ? `
                  <ul class="tl-bullets">
                    ${it.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}
                  </ul>` : ''}
              </div>
            </div>
          `).join('')}
        </div>`;
    }

    case 'compare': {
      const headers = Array.isArray(sec.headers) ? sec.headers : [];
      const rows = Array.isArray(sec.rows) ? sec.rows : [];
      const hi = Number.isInteger(sec.highlightCol) ? sec.highlightCol : -1;
      return `
        <div class="table-wrap">
          <table class="cmp-table">
            ${headers.length ? `
              <thead>
                <tr>
                  ${headers.map((h, ci) => `<th class="${ci === hi ? 'is-hi' : ''}">${esc(h)}</th>`).join('')}
                </tr>
              </thead>` : ''}
            <tbody>
              ${rows.map((r) => {
                const cells = Array.isArray(r) ? r : (r.cells || []);
                const emph = !Array.isArray(r) && r.emphasis ? ' is-emphasis' : '';
                return `<tr class="${emph}">${cells.map((c, ci) => `<td class="${ci === hi ? 'is-hi' : ''}${ci === 0 ? ' is-key' : ''}">${esc(c)}</td>`).join('')}</tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    case 'code': {
      const anns = Array.isArray(sec.annotations) ? sec.annotations : [];
      const highlighted = highlightCode(sec.code || '', sec.language || '');
      return `
        <div class="code-window">
          <div class="code-topbar">
            <div class="code-dots" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="code-filename">${esc(sec.filename || 'example')}</div>
            ${sec.language ? `<div class="code-lang">${esc(sec.language)}</div>` : ''}
          </div>
          <pre class="code-pre"><code>${highlighted}</code></pre>
        </div>
        ${anns.length ? `
          <div class="code-anns">
            ${anns.map((a, idx) => `
              <div class="code-ann-item">
                <span class="code-ann-num">${idx + 1}</span>
                <div>
                  <div class="code-ann-title">${esc(a.title)}</div>
                  <div class="code-ann-desc">${esc(a.desc)}</div>
                </div>
              </div>
            `).join('')}
          </div>` : ''}`;
    }

    case 'callout': {
      const items = Array.isArray(sec.items) ? sec.items : [];
      const cols = items.length >= 2 ? 2 : 1;
      const toneLabels = { info: '说明', tip: '推荐实践', warn: '注意风险', danger: '红线禁区' };
      return `
        <div class="callout-grid callout-grid--${cols}">
          ${items.map((it) => {
            const tone = toneLabels[it.tone] ? it.tone : 'info';
            const pts = Array.isArray(it.points) ? it.points : (it.desc ? [it.desc] : []);
            return `
              <div class="callout-box callout-box--${tone}">
                <div class="callout-head">
                  <span class="callout-pill">${toneLabels[tone]}</span>
                  <h3 class="callout-title">${esc(it.title)}</h3>
                </div>
                <ul class="callout-list">
                  ${pts.map((p) => `<li>${esc(p)}</li>`).join('')}
                </ul>
              </div>`;
          }).join('')}
        </div>`;
    }

    case 'qa': {
      const items = Array.isArray(sec.items) ? sec.items : [];
      return `
        <div class="qa-list">
          ${items.map((it) => `
            <div class="qa-item">
              <div class="qa-q"><span class="qa-badge qa-badge--q">Q</span><span>${esc(it.q)}</span></div>
              <div class="qa-a"><span class="qa-badge qa-badge--a">A</span><span>${esc(it.a)}</span></div>
            </div>
          `).join('')}
        </div>`;
    }

    default:
      return '';
  }
}

export function renderCanvasInnerHtml(spec) {
  const width = Number(spec.width) || 1080;
  const bgId = resolveBackground(spec.background);
  const brand = spec.brand || {};
  const meta = Array.isArray(spec.meta) ? spec.meta : [];
  const tags = Array.isArray(spec.tags) ? spec.tags : [];
  const footer = spec.footer || {};
  const sections = Array.isArray(spec.sections) ? spec.sections : [];

  const sectionsHtml = sections.map((sec, i) => {
    const num = String(i + 1).padStart(2, '0');
    const kicker = sec.kicker || KICKER_DEFAULTS[sec.type] || 'SECTION';
    const bodyHtml = renderSectionBodySync(sec, width);
    let extraImgHtml = '';
    if (sec.type !== 'diagram' && (sec.imageDataUri || sec.imageSvg)) {
      const mediaHtml = renderMediaSync(
        { dataUri: sec.imageDataUri, svg: sec.imageSvg, title: sec.title },
        sec.imageMaxHeight || 540,
        sec.title
      );
      extraImgHtml = `
        <figure class="diagram-box diagram-box--auto section-extra-img">
          ${mediaHtml}
          ${sec.imageCaption ? `<figcaption class="figure-caption">${esc(sec.imageCaption)}</figcaption>` : ''}
        </figure>`;
    }

    return `
      <section class="poster-section" data-poster-panel="${num}" data-section-index="${i}" id="${esc(sec.id || `sec-${num}`)}">
        <header class="section-head">
          <div class="section-num">${num}</div>
          <div class="section-head-text">
            <div class="section-kicker">${esc(kicker)}</div>
            <h2 class="section-title">${esc(sec.title)}</h2>
            ${sec.subtitle ? `<p class="section-subtitle">${esc(sec.subtitle)}</p>` : ''}
          </div>
        </header>
        <div class="section-body">
          ${bodyHtml}
          ${extraImgHtml}
        </div>
      </section>`;
  }).join('\n');

  return `
      <header class="poster-hero" data-poster-panel="00-hero" data-section-index="-1">
        ${renderHeroDecoSvg(bgId)}
        <div class="hero-inner">
          <div class="hero-top">
            <div class="hero-kicker">${esc(brand.kicker || '内网技术架构 · 分享长图')}${brand.org ? ` · ${esc(brand.org)}` : ''}</div>
            ${brand.badge ? `<div class="hero-badge">${esc(brand.badge)}</div>` : ''}
          </div>
          <h1 class="hero-title">${esc(spec.title)}</h1>
          ${spec.subtitle ? `<p class="hero-subtitle">${esc(spec.subtitle)}</p>` : ''}
          ${meta.length ? `
            <div class="hero-meta">
              ${meta.map((m) => `
                <div class="hero-meta-item">
                  <span class="hero-meta-label">${esc(m.label)}</span>
                  <span class="hero-meta-value">${esc(m.value)}</span>
                </div>
              `).join('')}
            </div>` : ''}
          ${tags.length ? `
            <div class="hero-tags">
              ${tags.map((t) => `<span class="hero-tag"># ${esc(t)}</span>`).join('')}
            </div>` : ''}
        </div>
      </header>

      <div class="poster-body">
        ${sectionsHtml}
      </div>

      <footer class="poster-footer" data-section-index="-2">
        <div>${esc(footer.left || '内部技术分享资料 · 离线自包含文档')}</div>
        <div>${esc(footer.right || '')}</div>
      </footer>`;
}
