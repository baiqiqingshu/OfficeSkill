/**
 * 离线安全审计器：静态扫描 HTML 是否包含可触发外网请求或数据外泄的结构。
 * 适用于企业内网 Air-Gap 交付门禁。
 */

const RESOURCE_TAGS = new Set([
  'script', 'link', 'img', 'iframe', 'frame', 'source', 'video', 'audio',
  'object', 'embed', 'form', 'track', 'area', 'input', 'image', 'use', 'feimage'
]);

const EXTERNAL_URL_RE = /^(?:https?:|wss?:|ftp:|\/\/)/i;

function maskTagContent(html, regex) {
  return html.replace(regex, (match, open, body, close) => {
    const masked = body.replace(/[^\n]/g, ' ');
    return `${open}${masked}${close}`;
  });
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

export function auditHtmlOffline(html) {
  const errors = [];
  const warnings = [];

  // 1. 保留开标签与换行行号，遮蔽纯展示用的 JSON 数据块与代码块内容，避免把示例配置里的说明文字误判为外链加载
  let scannable = html;
  scannable = maskTagContent(
    scannable,
    /(<script\b[^>]*type\s*=\s*["']application\/json["'][^>]*>)([\s\S]*?)(<\/script>)/gi
  );
  scannable = maskTagContent(
    scannable,
    /(<pre\b[^>]*>)([\s\S]*?)(<\/pre>)/gi
  );
  scannable = maskTagContent(
    scannable,
    /(<code\b[^>]*>)([\s\S]*?)(<\/code>)/gi
  );

  // 2. 扫描标签属性中的外部 URL
  const tagRe = /<([a-zA-Z][\w:-]*)\b([^>]*)>/g;
  let tagMatch;
  while ((tagMatch = tagRe.exec(scannable)) !== null) {
    const tag = tagMatch[1].toLowerCase();
    const attrs = tagMatch[2];
    const line = lineOf(scannable, tagMatch.index);

    // 检查 meta refresh 外跳
    if (tag === 'meta' && /http-equiv\s*=\s*["']?refresh/i.test(attrs) && /https?:|\/\//i.test(attrs)) {
      errors.push({
        rule: 'no-meta-refresh-external',
        line,
        detail: `发现外部跳转 meta refresh: ${tagMatch[0].slice(0, 120)}`
      });
    }

    // 检查 link rel=preconnect/dns-prefetch/preload/stylesheet
    if (tag === 'link' && /rel\s*=\s*["']?(?:preconnect|dns-prefetch)/i.test(attrs)) {
      errors.push({
        rule: 'no-external-preconnect',
        line,
        detail: `禁止网络预连接标签: ${tagMatch[0].slice(0, 120)}`
      });
    }

    const attrRe = /\b(src|href|xlink:href|action|poster|data|ping|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let attrMatch;
    while ((attrMatch = attrRe.exec(attrs)) !== null) {
      const attrName = attrMatch[1].toLowerCase();
      const rawVal = (attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '').trim();
      if (!rawVal) continue;

      const candidates = attrName === 'srcset'
        ? rawVal.split(',').map((s) => s.trim().split(/\s+/)[0]).filter(Boolean)
        : [rawVal];

      for (const val of candidates) {
        if (EXTERNAL_URL_RE.test(val)) {
          if (RESOURCE_TAGS.has(tag) || attrName !== 'href') {
            errors.push({
              rule: 'no-external-resource',
              line,
              detail: `<${tag} ${attrName}="${val}"> 存在外部网络资源引用`
            });
          } else {
            warnings.push({
              rule: 'external-anchor',
              line,
              detail: `<${tag} ${attrName}="${val}"> 包含外部超链接（建议内网海报去除外链）`
            });
          }
        }
      }
    }

    // 检查内联 style 属性里的 url(...)
    const inlineStyleRe = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    let styleAttrMatch;
    while ((styleAttrMatch = inlineStyleRe.exec(attrs)) !== null) {
      const css = styleAttrMatch[1] ?? styleAttrMatch[2] ?? '';
      const urlRe = /url\(\s*['"]?\s*([^)'"]+)/gi;
      let um;
      while ((um = urlRe.exec(css)) !== null) {
        if (EXTERNAL_URL_RE.test(um[1].trim())) {
          errors.push({
            rule: 'no-external-css-url',
            line,
            detail: `内联样式包含外部 url(${um[1].trim()})`
          });
        }
      }
    }
  }

  // 3. 扫描 <style> 块里的 @import 和外部 url(...)
  const styleBlockRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  while ((styleMatch = styleBlockRe.exec(html)) !== null) {
    const css = styleMatch[1];
    const baseOffset = styleMatch.index;

    const importRe = /@import\s+(?:url\(\s*)?['"]?([^'";\)\s]+)/gi;
    let im;
    while ((im = importRe.exec(css)) !== null) {
      const target = im[1].trim();
      if (EXTERNAL_URL_RE.test(target) || !target.startsWith('data:')) {
        errors.push({
          rule: 'no-css-import',
          line: lineOf(html, baseOffset + im.index),
          detail: `禁止 CSS @import 外部样式: ${target}`
        });
      }
    }

    const urlRe = /url\(\s*['"]?\s*([^)'"]+)/gi;
    let um;
    while ((um = urlRe.exec(css)) !== null) {
      const target = um[1].trim();
      if (EXTERNAL_URL_RE.test(target)) {
        errors.push({
          rule: 'no-external-css-url',
          line: lineOf(html, baseOffset + um.index),
          detail: `CSS 中包含外部资源引用: url(${target})`
        });
      }
    }
  }

  // 4. 扫描可执行 <script> 中的网络通信 API
  const scriptBlockRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptBlockRe.exec(html)) !== null) {
    const attrs = scriptMatch[1];
    if (/type\s*=\s*["']application\/json["']/i.test(attrs)) continue;
    const code = scriptMatch[2];
    const baseOffset = scriptMatch.index;

    const netPatterns = [
      { re: /\bfetch\s*\(/g, label: 'fetch()' },
      { re: /\bXMLHttpRequest\b/g, label: 'XMLHttpRequest' },
      { re: /\bsendBeacon\s*\(/g, label: 'navigator.sendBeacon()' },
      { re: /\bnew\s+WebSocket\s*\(/g, label: 'WebSocket' },
      { re: /\bnew\s+EventSource\s*\(/g, label: 'EventSource' },
      { re: /\bimportScripts\s*\(/g, label: 'importScripts()' },
      { re: /['"`](?:https?:|wss?:)\/\/[^'"`\s]+['"`]/gi, label: '脚本内硬编码外部 URL' }
    ];

    const W3C_XML_NS = new Set([
      'http://www.w3.org/2000/svg',
      'http://www.w3.org/1999/xhtml',
      'http://www.w3.org/1999/xlink',
      'http://www.w3.org/2000/xmlns/'
    ]);

    for (const { re, label } of netPatterns) {
      let m;
      while ((m = re.exec(code)) !== null) {
        const stripped = m[0].slice(1, -1).trim();
        if (label === '脚本内硬编码外部 URL' && W3C_XML_NS.has(stripped)) continue;
        errors.push({
          rule: 'no-script-network',
          line: lineOf(html, baseOffset + m.index),
          detail: `脚本中禁止网络外联能力 (${label}): ${m[0].slice(0, 80)}`
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    externalUrls: errors.length,
    errors,
    warnings
  };
}
