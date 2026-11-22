(function () {
  var root = document.documentElement;
  var canvasEl = document.getElementById('poster-canvas');
  var dataEl = document.getElementById('poster-data');
  var themeSelect = document.getElementById('tp-theme-select');
  var bgSelect = document.getElementById('tp-bg-select');
  var toggleEditorBtn = document.getElementById('tp-toggle-editor');
  var sidebarEl = document.getElementById('tp-sidebar');
  var sidebarBodyEl = document.getElementById('tp-sidebar-body');
  var jsonPaneEl = document.getElementById('tp-json-pane');
  var jsonTextarea = document.getElementById('tp-json-text');
  var toastEl = document.getElementById('tp-toast');

  var state = {
    spec: {},
    activeTab: 'form',
    openSections: { hero: false, 0: true },
    selectedIndex: -99
  };

  try {
    state.spec = JSON.parse((dataEl && dataEl.textContent) || '{}');
  } catch (e) {
    state.spec = { title: '未命名技术海报', theme: 'blueprint', background: 'everest-blue', width: 1080, sections: [] };
  }
  state.spec.background = resolveBackground(state.spec.background);
  if (!state.spec.theme || !THEMES[state.spec.theme]) state.spec.theme = themeForBackground(state.spec.background);
  if (!Array.isArray(state.spec.sections)) state.spec.sections = [];

  var toastTimer = null;
  function showToast(msg, isError) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.className = 'tp-toast is-show' + (isError ? ' is-err' : '');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('is-show');
    }, isError ? 4200 : 2400);
  }

  function syncDataBlock() {
    if (dataEl) {
      dataEl.textContent = JSON.stringify(state.spec, null, 2);
    }
    if (jsonTextarea && state.activeTab === 'json') {
      jsonTextarea.value = JSON.stringify(state.spec, null, 2);
    }
    document.title = state.spec.title || '技术分享长图海报';
    var countEl = document.getElementById('tp-meta-count');
    if (countEl) {
      countEl.textContent = '宽度 ' + (state.spec.width || 1080) + 'px · ' + state.spec.sections.length + ' 个栏目';
    }
  }

  function renderCanvas() {
    root.setAttribute('data-theme', state.spec.theme || 'blueprint');
    root.setAttribute('data-bg', state.spec.background || 'everest-blue');
    if (themeSelect) themeSelect.value = state.spec.theme || 'blueprint';
    if (bgSelect) bgSelect.value = state.spec.background || 'everest-blue';
    if (canvasEl) {
      canvasEl.style.setProperty('--poster-w', (Number(state.spec.width) || 1080) + 'px');
      canvasEl.innerHTML = renderCanvasInnerHtml(state.spec);
      bindCanvasClickToEditor();
    }
    syncDataBlock();
  }

  function bindCanvasClickToEditor() {
    if (!canvasEl) return;
    var nodes = canvasEl.querySelectorAll('[data-section-index]');
    for (var i = 0; i < nodes.length; i++) {
      (function (el) {
        el.addEventListener('click', function () {
          if (!document.body.classList.contains('sidebar-open')) return;
          var idx = Number(el.getAttribute('data-section-index'));
          state.selectedIndex = idx;
          if (idx === -1 || idx === -2) {
            state.openSections.hero = true;
          } else if (idx >= 0) {
            state.openSections[idx] = true;
          }
          if (state.activeTab !== 'form') {
            switchTab('form');
          } else {
            renderSidebarForm();
          }
          var targetId = (idx === -1 || idx === -2) ? 'ed-group-hero' : ('ed-group-sec-' + idx);
          var card = document.getElementById(targetId);
          if (card && card.scrollIntoView) {
            card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }
        });
      })(nodes[i]);
    }
  }

  /* ======================== 侧边栏表单构建辅助 ======================== */

  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'className') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'value') el.value = v;
        else if (k === 'checked') el.checked = Boolean(v);
        else el.setAttribute(k, String(v));
      });
    }
    if (Array.isArray(children)) {
      children.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return el;
  }

  function fieldInput(label, val, onChange, opts) {
    opts = opts || {};
    var inp;
    if (opts.multiline) {
      inp = h('textarea', {
        className: 'ed-textarea',
        rows: opts.rows || 3,
        placeholder: opts.placeholder || '',
        value: val == null ? '' : String(val),
        onInput: function (e) { onChange(e.target.value); }
      });
    } else if (opts.options) {
      inp = h('select', {
        className: 'ed-select',
        onChange: function (e) { onChange(e.target.value); }
      }, opts.options.map(function (o) {
        var ov = typeof o === 'string' ? o : o.value;
        var ol = typeof o === 'string' ? o : o.label;
        var op = h('option', { value: ov, text: ol });
        if (String(val) === String(ov)) op.selected = true;
        return op;
      }));
    } else {
      inp = h('input', {
        className: 'ed-input',
        type: opts.type || 'text',
        placeholder: opts.placeholder || '',
        value: val == null ? '' : String(val),
        onInput: function (e) { onChange(e.target.value); }
      });
    }
    return h('label', { className: 'ed-field' + (opts.compact ? ' ed-field--compact' : '') }, [
      label ? h('span', { className: 'ed-label', text: label }) : null,
      inp
    ]);
  }

  function miniBtn(text, onClick, cls) {
    return h('button', {
      type: 'button',
      className: 'ed-btn ' + (cls || ''),
      text: text,
      onClick: function (e) {
        e.stopPropagation();
        onClick();
      }
    });
  }

  function makeLocalFilePicker(label, onLoaded) {
    var fileInput = h('input', {
      type: 'file',
      accept: '.svg,.png,.jpg,.jpeg,.webp,.gif,image/svg+xml,image/png,image/jpeg,image/webp',
      style: 'display:none',
      onChange: function (e) {
        var f = e.target.files && e.target.files[0];
        if (!f) return;
        var reader = new FileReader();
        var isSvg = /\.svg$/i.test(f.name) || f.type === 'image/svg+xml';
        reader.onload = function () {
          try {
            if (isSvg) {
              var txt = String(reader.result || '');
              sanitizeInlineSvg(txt, f.name);
              onLoaded({ svg: txt, dataUri: undefined });
              showToast('已离线内联 SVG：' + f.name);
            } else {
              var uri = String(reader.result || '');
              onLoaded({ svg: undefined, dataUri: uri });
              showToast('已离线转为 Base64 内联图片：' + f.name);
            }
          } catch (err) {
            showToast(err.message || '图片读取失败', true);
          }
          fileInput.value = '';
        };
        if (isSvg) reader.readAsText(f, 'utf-8');
        else reader.readAsDataURL(f);
      }
    });
    return h('div', { className: 'ed-file-row' }, [
      fileInput,
      miniBtn(label || '选择本地 SVG / PNG 图片', function () { fileInput.click(); }, 'ed-btn--primary')
    ]);
  }

  function renderSectionSpecificEditor(sec, secIdx) {
    var box = h('div', { className: 'ed-sublist' });
    function updateCanvasOnly() { renderCanvas(); }
    function updateBoth() { renderCanvas(); renderSidebarForm(); }

    if (sec.type === 'overview') {
      box.appendChild(fieldInput('概览摘要', sec.summary || '', function (v) { sec.summary = v; updateCanvasOnly(); }, { multiline: true, rows: 3 }));

      sec.metrics = Array.isArray(sec.metrics) ? sec.metrics : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '核心指标 KPI (' + sec.metrics.length + ')' }),
        miniBtn('+ 添加指标', function () { sec.metrics.push({ value: '100%', label: '新指标', note: '说明文字' }); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.metrics.forEach(function (m, mi) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '指标 #' + (mi + 1) }),
            miniBtn('删除', function () { sec.metrics.splice(mi, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('数值', m.value, function (v) { m.value = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('名称', m.label, function (v) { m.label = v; updateCanvasOnly(); }, { compact: true })
          ]),
          fieldInput('补充说明', m.note || '', function (v) { m.note = v; updateCanvasOnly(); }, { compact: true })
        ]));
      });

      sec.highlights = Array.isArray(sec.highlights) ? sec.highlights : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '关键亮点 (' + sec.highlights.length + ')' }),
        miniBtn('+ 添加亮点', function () { sec.highlights.push('新增核心亮点描述'); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.highlights.forEach(function (hl, hi) {
        box.appendChild(h('div', { className: 'ed-inline-row' }, [
          h('input', {
            className: 'ed-input',
            value: hl,
            onInput: function (e) { sec.highlights[hi] = e.target.value; updateCanvasOnly(); }
          }),
          miniBtn('×', function () { sec.highlights.splice(hi, 1); updateBoth(); }, 'ed-btn--danger')
        ]));
      });
    } else if (sec.type === 'cards') {
      box.appendChild(fieldInput('每行列数', String(sec.columns === 3 ? 3 : 2), function (v) {
        sec.columns = Number(v);
        updateCanvasOnly();
      }, { options: [{ value: '2', label: '2 列网格' }, { value: '3', label: '3 列网格' }] }));

      sec.items = Array.isArray(sec.items) ? sec.items : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '卡片列表 (' + sec.items.length + ')' }),
        miniBtn('+ 添加卡片', function () {
          sec.items.push({ badge: 'FEATURE', title: '新能力模块', desc: '填写模块核心特性说明。', tags: ['标签'], accent: 'primary' });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.items.forEach(function (it, idx) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '卡片 #' + (idx + 1) }),
            miniBtn('删除', function () { sec.items.splice(idx, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('徽标', it.badge || '', function (v) { it.badge = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('色系', it.accent || 'primary', function (v) { it.accent = v; updateCanvasOnly(); }, {
              compact: true,
              options: ['primary', 'secondary', 'success', 'warn']
            })
          ]),
          fieldInput('标题', it.title || '', function (v) { it.title = v; updateCanvasOnly(); }, { compact: true }),
          fieldInput('描述', it.desc || '', function (v) { it.desc = v; updateCanvasOnly(); }, { multiline: true, rows: 2, compact: true }),
          fieldInput('标签（逗号分隔）', (it.tags || []).join(', '), function (v) {
            it.tags = v.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
            updateCanvasOnly();
          }, { compact: true })
        ]));
      });
    } else if (sec.type === 'layers') {
      sec.layers = Array.isArray(sec.layers) ? sec.layers : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '架构层级 (' + sec.layers.length + ')' }),
        miniBtn('+ 添加层级', function () {
          sec.layers.push({ name: '新架构层', desc: '层级职责说明', tone: 'primary', modules: [{ name: '新模块', detail: '模块说明' }] });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.layers.forEach(function (ly, li) {
        ly.modules = Array.isArray(ly.modules) ? ly.modules : [];
        var modWrap = h('div', { className: 'ed-nested' });
        modWrap.appendChild(h('div', { className: 'ed-subhead' }, [
          h('span', { text: '层内模块 (' + ly.modules.length + ')' }),
          miniBtn('+ 模块', function () { ly.modules.push({ name: '新模块', detail: '说明' }); updateBoth(); }, 'ed-btn--add')
        ]));
        ly.modules.forEach(function (m, mi) {
          if (typeof m === 'string') { m = { name: m, detail: '' }; ly.modules[mi] = m; }
          modWrap.appendChild(h('div', { className: 'ed-inline-row' }, [
            h('input', { className: 'ed-input', placeholder: '模块名', value: m.name || '', onInput: function (e) { m.name = e.target.value; updateCanvasOnly(); } }),
            h('input', { className: 'ed-input', placeholder: '说明', value: m.detail || '', onInput: function (e) { m.detail = e.target.value; updateCanvasOnly(); } }),
            miniBtn('×', function () { ly.modules.splice(mi, 1); updateBoth(); }, 'ed-btn--danger')
          ]));
        });
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '层级 #' + (li + 1) }),
            miniBtn('删除层', function () { sec.layers.splice(li, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('层名', ly.name || '', function (v) { ly.name = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('色调', ly.tone || 'primary', function (v) { ly.tone = v; updateCanvasOnly(); }, { compact: true, options: ['primary', 'secondary', 'success', 'warn'] })
          ]),
          fieldInput('层级说明', ly.desc || '', function (v) { ly.desc = v; updateCanvasOnly(); }, { compact: true }),
          modWrap
        ]));
      });

      sec.sidebars = Array.isArray(sec.sidebars) ? sec.sidebars : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '右侧横切支撑栏 (' + sec.sidebars.length + ')' }),
        miniBtn('+ 添加横切栏', function () { sec.sidebars.push({ name: '横切支撑', items: ['能力条目一'] }); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.sidebars.forEach(function (sb, si) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '横切栏 #' + (si + 1) }),
            miniBtn('删除', function () { sec.sidebars.splice(si, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          fieldInput('栏标题', sb.name || '', function (v) { sb.name = v; updateCanvasOnly(); }, { compact: true }),
          fieldInput('条目（每行一条）', (sb.items || []).join('\n'), function (v) {
            sb.items = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            updateCanvasOnly();
          }, { multiline: true, rows: 3, compact: true })
        ]));
      });
    } else if (sec.type === 'flow') {
      box.appendChild(fieldInput('流向', (sec.direction || 'LR').toUpperCase(), function (v) {
        sec.direction = v;
        updateCanvasOnly();
      }, { options: [{ value: 'LR', label: '从左到右 (LR)' }, { value: 'TB', label: '从上到下 (TB)' }] }));

      sec.steps = Array.isArray(sec.steps) ? sec.steps : [];
      sec.edges = Array.isArray(sec.edges) ? sec.edges : [];

      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '流程节点 (' + sec.steps.length + ')' }),
        miniBtn('+ 添加节点', function () {
          var nid = 'n' + (sec.steps.length + 1);
          sec.steps.push({ id: nid, title: '新步骤', subtitle: '简要说明', kind: 'process', group: '' });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.steps.forEach(function (st, si) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '节点 ' + (st.id || ('#' + (si + 1))) }),
            miniBtn('删除', function () {
              var removedId = st.id;
              sec.steps.splice(si, 1);
              sec.edges = sec.edges.filter(function (e) { return e.from !== removedId && e.to !== removedId; });
              updateBoth();
            }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('ID', st.id || '', function (v) { st.id = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('类型', st.kind || 'process', function (v) { st.kind = v; updateCanvasOnly(); }, {
              compact: true,
              options: ['start', 'process', 'decision', 'service', 'db', 'end']
            })
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('标题', st.title || '', function (v) { st.title = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('副标题', st.subtitle || '', function (v) { st.subtitle = v; updateCanvasOnly(); }, { compact: true })
          ]),
          fieldInput('所属分组（可选）', st.group || '', function (v) { st.group = v; updateCanvasOnly(); }, { compact: true })
        ]));
      });

      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '节点连线 (' + sec.edges.length + ')' }),
        miniBtn('+ 添加连线', function () {
          var fId = sec.steps[0] ? sec.steps[0].id : '';
          var tId = sec.steps[sec.steps.length - 1] ? sec.steps[sec.steps.length - 1].id : '';
          sec.edges.push({ from: fId, to: tId, label: '', style: 'default' });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.edges.forEach(function (ed, ei) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '连线 #' + (ei + 1) }),
            miniBtn('删除', function () { sec.edges.splice(ei, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('起点 ID', ed.from || '', function (v) { ed.from = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('终点 ID', ed.to || '', function (v) { ed.to = v; updateCanvasOnly(); }, { compact: true })
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('线旁标签', ed.label || '', function (v) { ed.label = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('样式', ed.style || 'default', function (v) { ed.style = v; updateCanvasOnly(); }, {
              compact: true,
              options: ['default', 'success', 'warn', 'dashed']
            })
          ])
        ]));
      });
      box.appendChild(fieldInput('底部图注', sec.caption || '', function (v) { sec.caption = v; updateCanvasOnly(); }, { multiline: true, rows: 2 }));
    } else if (sec.type === 'diagram') {
      box.appendChild(fieldInput('画框背景', sec.surface || 'auto', function (v) {
        sec.surface = v;
        updateCanvasOnly();
      }, { options: [{ value: 'auto', label: '跟随主题 (auto)' }, { value: 'light', label: '纯白画框 (light)' }, { value: 'transparent', label: '透明虚框 (transparent)' }] }));

      if (Array.isArray(sec.items) && sec.items.length > 0) {
        box.appendChild(h('div', { className: 'ed-subhead' }, [
          h('span', { text: '多图列表 (' + sec.items.length + ')' }),
          miniBtn('+ 添加图片位', function () { sec.items.push({ title: '新图表', caption: '' }); updateBoth(); }, 'ed-btn--add')
        ]));
        sec.items.forEach(function (it, idx) {
          box.appendChild(h('div', { className: 'ed-item-box' }, [
            h('div', { className: 'ed-item-bar' }, [
              h('span', { text: '图表 #' + (idx + 1) }),
              miniBtn('删除', function () { sec.items.splice(idx, 1); updateBoth(); }, 'ed-btn--danger')
            ]),
            fieldInput('子图标题', it.title || '', function (v) { it.title = v; updateCanvasOnly(); }, { compact: true }),
            makeLocalFilePicker('替换本地 SVG / PNG', function (res) {
              it.svg = res.svg;
              it.dataUri = res.dataUri;
              delete it.file;
              updateCanvasOnly();
            }),
            fieldInput('子图图注', it.caption || '', function (v) { it.caption = v; updateCanvasOnly(); }, { compact: true })
          ]));
        });
      } else {
        box.appendChild(makeLocalFilePicker('选择本地 SVG / PNG / JPG 图片内嵌', function (res) {
          sec.svg = res.svg;
          sec.dataUri = res.dataUri;
          delete sec.file;
          updateCanvasOnly();
        }));
      }
      box.appendChild(fieldInput('图表说明图注', sec.caption || '', function (v) { sec.caption = v; updateCanvasOnly(); }, { multiline: true, rows: 2 }));
    } else if (sec.type === 'timeline') {
      sec.items = Array.isArray(sec.items) ? sec.items : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '步骤列表 (' + sec.items.length + ')' }),
        miniBtn('+ 添加步骤', function () {
          sec.items.push({ step: String(sec.items.length + 1).padStart(2, '0'), title: '新阶段步骤', tag: '', desc: '补充步骤说明', bullets: [] });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.items.forEach(function (it, idx) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '步骤 #' + (idx + 1) }),
            miniBtn('删除', function () { sec.items.splice(idx, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('序号', it.step || '', function (v) { it.step = v; updateCanvasOnly(); }, { compact: true }),
            fieldInput('时长/标签', it.tag || '', function (v) { it.tag = v; updateCanvasOnly(); }, { compact: true })
          ]),
          fieldInput('步骤标题', it.title || '', function (v) { it.title = v; updateCanvasOnly(); }, { compact: true }),
          fieldInput('说明', it.desc || '', function (v) { it.desc = v; updateCanvasOnly(); }, { multiline: true, rows: 2, compact: true }),
          fieldInput('子要点（每行一条）', (it.bullets || []).join('\n'), function (v) {
            it.bullets = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            updateCanvasOnly();
          }, { multiline: true, rows: 2, compact: true })
        ]));
      });
    } else if (sec.type === 'compare') {
      sec.headers = Array.isArray(sec.headers) ? sec.headers : ['维度', '旧方案', '新方案'];
      sec.rows = Array.isArray(sec.rows) ? sec.rows : [];
      box.appendChild(fieldInput('表头列（用 | 分隔）', sec.headers.join(' | '), function (v) {
        sec.headers = v.split('|').map(function (s) { return s.trim(); }).filter(Boolean);
        updateCanvasOnly();
      }));
      box.appendChild(fieldInput('高亮推荐列序号（从 0 起，-1 关闭）', String(sec.highlightCol != null ? sec.highlightCol : 2), function (v) {
        sec.highlightCol = Number(v);
        updateCanvasOnly();
      }, { type: 'number' }));
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '对比行 (' + sec.rows.length + ')' }),
        miniBtn('+ 添加行', function () {
          sec.rows.push({ cells: sec.headers.map(function (_, i) { return i === 0 ? '新对比维度' : '填写对比内容'; }) });
          updateBoth();
        }, 'ed-btn--add')
      ]));
      sec.rows.forEach(function (r, ri) {
        if (Array.isArray(r)) { r = { cells: r }; sec.rows[ri] = r; }
        box.appendChild(h('div', { className: 'ed-inline-row' }, [
          h('input', {
            className: 'ed-input',
            value: (r.cells || []).join(' | '),
            placeholder: '列1 | 列2 | 列3',
            onInput: function (e) {
              r.cells = e.target.value.split('|').map(function (s) { return s.trim(); });
              updateCanvasOnly();
            }
          }),
          miniBtn('×', function () { sec.rows.splice(ri, 1); updateBoth(); }, 'ed-btn--danger')
        ]));
      });
    } else if (sec.type === 'code') {
      box.appendChild(h('div', { className: 'ed-row-2' }, [
        fieldInput('文件名', sec.filename || '', function (v) { sec.filename = v; updateCanvasOnly(); }, { compact: true }),
        fieldInput('语言', sec.language || 'yaml', function (v) { sec.language = v; updateCanvasOnly(); }, { compact: true })
      ]));
      box.appendChild(fieldInput('代码内容', sec.code || '', function (v) { sec.code = v; updateCanvasOnly(); }, { multiline: true, rows: 7 }));
      sec.annotations = Array.isArray(sec.annotations) ? sec.annotations : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '代码注解 (' + sec.annotations.length + ')' }),
        miniBtn('+ 添加注解', function () { sec.annotations.push({ title: '要点标题', desc: '要点说明' }); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.annotations.forEach(function (a, ai) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '注解 #' + (ai + 1) }),
            miniBtn('删除', function () { sec.annotations.splice(ai, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          fieldInput('标题', a.title || '', function (v) { a.title = v; updateCanvasOnly(); }, { compact: true }),
          fieldInput('说明', a.desc || '', function (v) { a.desc = v; updateCanvasOnly(); }, { compact: true })
        ]));
      });
    } else if (sec.type === 'callout') {
      sec.items = Array.isArray(sec.items) ? sec.items : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '提示卡片 (' + sec.items.length + ')' }),
        miniBtn('+ 添加提示框', function () { sec.items.push({ tone: 'info', title: '新提示项', points: ['补充具体要点'] }); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.items.forEach(function (it, idx) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: '提示框 #' + (idx + 1) }),
            miniBtn('删除', function () { sec.items.splice(idx, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('类型', it.tone || 'info', function (v) { it.tone = v; updateCanvasOnly(); }, {
              compact: true,
              options: [
                { value: 'tip', label: '推荐实践 (tip)' },
                { value: 'warn', label: '注意风险 (warn)' },
                { value: 'info', label: '说明 (info)' },
                { value: 'danger', label: '红线禁区 (danger)' }
              ]
            }),
            fieldInput('标题', it.title || '', function (v) { it.title = v; updateCanvasOnly(); }, { compact: true })
          ]),
          fieldInput('要点列表（每行一条）', (it.points || []).join('\n'), function (v) {
            it.points = v.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            updateCanvasOnly();
          }, { multiline: true, rows: 3, compact: true })
        ]));
      });
    } else if (sec.type === 'qa') {
      sec.items = Array.isArray(sec.items) ? sec.items : [];
      box.appendChild(h('div', { className: 'ed-subhead' }, [
        h('span', { text: '问答条目 (' + sec.items.length + ')' }),
        miniBtn('+ 添加问答', function () { sec.items.push({ q: '新问题？', a: '填写清晰解答。' }); updateBoth(); }, 'ed-btn--add')
      ]));
      sec.items.forEach(function (it, idx) {
        box.appendChild(h('div', { className: 'ed-item-box' }, [
          h('div', { className: 'ed-item-bar' }, [
            h('span', { text: 'Q&A #' + (idx + 1) }),
            miniBtn('删除', function () { sec.items.splice(idx, 1); updateBoth(); }, 'ed-btn--danger')
          ]),
          fieldInput('问题 Q', it.q || '', function (v) { it.q = v; updateCanvasOnly(); }, { compact: true }),
          fieldInput('回答 A', it.a || '', function (v) { it.a = v; updateCanvasOnly(); }, { multiline: true, rows: 2, compact: true })
        ]));
      });
    }

    return box;
  }

  function renderSidebarForm() {
    if (!sidebarBodyEl) return;
    sidebarBodyEl.innerHTML = '';

    var spec = state.spec;
    spec.brand = spec.brand || {};
    spec.footer = spec.footer || {};
    spec.meta = Array.isArray(spec.meta) ? spec.meta : [];
    spec.tags = Array.isArray(spec.tags) ? spec.tags : [];

    // 1. 顶栏 & 底栏配置组
    var heroOpen = Boolean(state.openSections.hero);
    var heroBody = h('div', { className: 'ed-group-body' }, [
      fieldInput('海报主标题', spec.title || '', function (v) { spec.title = v; renderCanvas(); }),
      fieldInput('一句话副标题', spec.subtitle || '', function (v) { spec.subtitle = v; renderCanvas(); }, { multiline: true, rows: 2 }),
      h('div', { className: 'ed-row-2' }, [
        fieldInput('顶栏眉标', spec.brand.kicker || '', function (v) { spec.brand.kicker = v; renderCanvas(); }, { compact: true }),
        fieldInput('部门 / 组织', spec.brand.org || '', function (v) { spec.brand.org = v; renderCanvas(); }, { compact: true })
      ]),
      h('div', { className: 'ed-row-2' }, [
        fieldInput('右上角徽章', spec.brand.badge || '', function (v) { spec.brand.badge = v; renderCanvas(); }, { compact: true }),
        fieldInput('画布宽度 (px)', String(spec.width || 1080), function (v) {
          var n = Number(v);
          if (n >= 720 && n <= 1600) { spec.width = n; renderCanvas(); }
        }, { type: 'number', compact: true })
      ]),
      fieldInput('关键词标签（逗号分隔）', spec.tags.join(', '), function (v) {
        spec.tags = v.split(/[,，]/).map(function (s) { return s.trim(); }).filter(Boolean);
        renderCanvas();
      }),
      h('div', { className: 'ed-subhead' }, [
        h('span', { text: '顶栏元数据 (' + spec.meta.length + ')' }),
        miniBtn('+ 添加项', function () { spec.meta.push({ label: '属性', value: '值' }); renderCanvas(); renderSidebarForm(); }, 'ed-btn--add')
      ]),
      h('div', { className: 'ed-sublist' }, spec.meta.map(function (m, mi) {
        return h('div', { className: 'ed-inline-row' }, [
          h('input', { className: 'ed-input', placeholder: '名称', value: m.label || '', onInput: function (e) { m.label = e.target.value; renderCanvas(); } }),
          h('input', { className: 'ed-input', placeholder: '内容', value: m.value || '', onInput: function (e) { m.value = e.target.value; renderCanvas(); } }),
          miniBtn('×', function () { spec.meta.splice(mi, 1); renderCanvas(); renderSidebarForm(); }, 'ed-btn--danger')
        ]);
      })),
      fieldInput('底部左栏文字', spec.footer.left || '', function (v) { spec.footer.left = v; renderCanvas(); }),
      fieldInput('底部右栏文字', spec.footer.right || '', function (v) { spec.footer.right = v; renderCanvas(); })
    ]);

    var heroCard = h('div', {
      id: 'ed-group-hero',
      className: 'ed-group' + (heroOpen ? ' is-open' : '') + (state.selectedIndex === -1 || state.selectedIndex === -2 ? ' is-selected' : '')
    }, [
      h('div', {
        className: 'ed-group-head',
        onClick: function () { state.openSections.hero = !state.openSections.hero; renderSidebarForm(); }
      }, [
        h('span', { className: 'ed-group-title', text: (heroOpen ? '▾ ' : '▸ ') + '顶栏 Hero & 底部页脚' }),
        h('span', { className: 'ed-type-pill', text: '基础信息' })
      ]),
      heroOpen ? heroBody : null
    ]);
    sidebarBodyEl.appendChild(heroCard);

    // 2. 栏目列表（每个栏目支持展开修改文字、增删内部元素、上移/下移/复制/删除）
    spec.sections.forEach(function (sec, idx) {
      var isOpen = Boolean(state.openSections[idx]);
      var num = String(idx + 1).padStart(2, '0');
      var body = null;
      if (isOpen) {
        body = h('div', { className: 'ed-group-body' }, [
          h('div', { className: 'ed-sec-actions' }, [
            miniBtn('↑ 上移', function () {
              if (idx <= 0) return;
              var tmp = spec.sections[idx - 1];
              spec.sections[idx - 1] = spec.sections[idx];
              spec.sections[idx] = tmp;
              state.openSections = {};
              state.openSections[idx - 1] = true;
              renderCanvas();
              renderSidebarForm();
            }),
            miniBtn('↓ 下移', function () {
              if (idx >= spec.sections.length - 1) return;
              var tmp = spec.sections[idx + 1];
              spec.sections[idx + 1] = spec.sections[idx];
              spec.sections[idx] = tmp;
              state.openSections = {};
              state.openSections[idx + 1] = true;
              renderCanvas();
              renderSidebarForm();
            }),
            miniBtn('复制栏目', function () {
              var copy = JSON.parse(JSON.stringify(sec));
              copy.title = (copy.title || '栏目') + '（副本）';
              spec.sections.splice(idx + 1, 0, copy);
              state.openSections[idx + 1] = true;
              renderCanvas();
              renderSidebarForm();
              showToast('已复制栏目到 #' + String(idx + 2).padStart(2, '0'));
            }),
            miniBtn('删除栏目', function () {
              spec.sections.splice(idx, 1);
              state.openSections = {};
              renderCanvas();
              renderSidebarForm();
              showToast('已删除栏目 #' + num);
            }, 'ed-btn--danger')
          ]),
          fieldInput('栏目标题', sec.title || '', function (v) { sec.title = v; renderCanvas(); }),
          h('div', { className: 'ed-row-2' }, [
            fieldInput('英文副眉 Kicker', sec.kicker || '', function (v) { sec.kicker = v; renderCanvas(); }, { compact: true }),
            fieldInput('栏目说明', sec.subtitle || '', function (v) { sec.subtitle = v; renderCanvas(); }, { compact: true })
          ]),
          renderSectionSpecificEditor(sec, idx)
        ]);
      }

      var card = h('div', {
        id: 'ed-group-sec-' + idx,
        className: 'ed-group' + (isOpen ? ' is-open' : '') + (state.selectedIndex === idx ? ' is-selected' : '')
      }, [
        h('div', {
          className: 'ed-group-head',
          onClick: function () { state.openSections[idx] = !state.openSections[idx]; renderSidebarForm(); }
        }, [
          h('span', { className: 'ed-group-title', text: (isOpen ? '▾ ' : '▸ ') + num + ' · ' + (sec.title || '未命名栏目') }),
          h('span', { className: 'ed-type-pill', text: sec.type })
        ]),
        body
      ]);
      sidebarBodyEl.appendChild(card);
    });

    // 3. 底部新增栏目面板
    var addSelect = h('select', { className: 'ed-select', id: 'tp-add-section-type' }, SECTION_TYPES.map(function (t) {
      return h('option', { value: t, text: SECTION_TYPE_LABELS[t] || t });
    }));
    var addBox = h('div', { className: 'ed-add-section' }, [
      h('div', { className: 'ed-add-title', text: '+ 新增技术栏目' }),
      h('div', { className: 'ed-inline-row' }, [
        addSelect,
        miniBtn('添加', function () {
          var t = addSelect.value;
          var created = createDefaultSection(t);
          spec.sections.push(created);
          var newIdx = spec.sections.length - 1;
          state.openSections[newIdx] = true;
          state.selectedIndex = newIdx;
          renderCanvas();
          renderSidebarForm();
          var el = document.getElementById('ed-group-sec-' + newIdx);
          if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          showToast('已新增栏目：' + created.title);
        }, 'ed-btn--primary')
      ])
    ]);
    sidebarBodyEl.appendChild(addBox);
  }

  function switchTab(tab) {
    state.activeTab = tab;
    var formBtn = document.getElementById('tp-tab-form');
    var jsonBtn = document.getElementById('tp-tab-json');
    if (formBtn) formBtn.classList.toggle('is-active', tab === 'form');
    if (jsonBtn) jsonBtn.classList.toggle('is-active', tab === 'json');
    if (sidebarBodyEl) sidebarBodyEl.style.display = tab === 'form' ? 'block' : 'none';
    if (jsonPaneEl) jsonPaneEl.style.display = tab === 'json' ? 'flex' : 'none';
    if (tab === 'form') renderSidebarForm();
    if (tab === 'json' && jsonTextarea) jsonTextarea.value = JSON.stringify(state.spec, null, 2);
  }

  /* ======================== 离线 DOM → PNG 光栅化（零外部库） ======================== */

  function renderPosterToPngBlob(preferredScale) {
    return new Promise(function (resolve, reject) {
      try {
        if (!canvasEl) return reject(new Error('未找到海报画布 #poster-canvas'));
        var rect = canvasEl.getBoundingClientRect();
        var w = Math.ceil(rect.width || state.spec.width || 1080);
        var hPx = Math.ceil(canvasEl.scrollHeight || rect.height || 1000);

        // 根据浏览器 Canvas 安全像素限制自动计算最佳清晰度倍率（防超长图空白）
        var scale = Number(preferredScale) || 2;
        var maxSide = 15800;
        var maxArea = 34000000;
        while (scale > 1 && (w * scale > maxSide || hPx * scale > maxSide || (w * scale * hPx * scale) > maxArea)) {
          scale = Number((scale - 0.25).toFixed(2));
        }
        if (scale < 1) scale = 1;

        var styleEl = document.getElementById('tp-main-style');
        var cssText = styleEl ? styleEl.textContent : '';

        var svgNS = 'http://www.w3.org/2000/svg';
        var xhtmlNS = 'http://www.w3.org/1999/xhtml';
        var svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('xmlns', svgNS);
        svg.setAttribute('width', String(w));
        svg.setAttribute('height', String(hPx));
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + hPx);

        var fo = document.createElementNS(svgNS, 'foreignObject');
        fo.setAttribute('x', '0');
        fo.setAttribute('y', '0');
        fo.setAttribute('width', String(w));
        fo.setAttribute('height', String(hPx));

        var wrap = document.createElementNS(xhtmlNS, 'div');
        wrap.setAttribute('xmlns', xhtmlNS);
        wrap.setAttribute('class', 'tp-export-root');
        wrap.setAttribute('data-theme', state.spec.theme || 'blueprint');
        wrap.setAttribute('data-bg', state.spec.background || 'everest-blue');
        wrap.style.width = w + 'px';
        wrap.style.height = hPx + 'px';
        wrap.style.margin = '0';
        wrap.style.padding = '0';

        var inlineStyle = document.createElementNS(xhtmlNS, 'style');
        inlineStyle.textContent = cssText + '\n.tp-export-root .poster-canvas{box-shadow:none !important;margin:0 !important;}';
        wrap.appendChild(inlineStyle);

        var clonedCanvas = canvasEl.cloneNode(true);
        wrap.appendChild(clonedCanvas);
        fo.appendChild(wrap);
        svg.appendChild(fo);

        var serialized = new XMLSerializer().serializeToString(svg);
        var svgDataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);

        var img = new Image();
        img.onload = function () {
          try {
            var c = document.createElement('canvas');
            c.width = Math.round(w * scale);
            c.height = Math.round(hPx * scale);
            var ctx = c.getContext('2d');
            if (!ctx) return reject(new Error('无法创建 Canvas 2D 上下文'));
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, w, hPx);
            c.toBlob(function (blob) {
              if (!blob) return reject(new Error('PNG 编码失败（可能超出浏览器单图尺寸上限）'));
              resolve({ blob: blob, width: c.width, height: c.height, scale: scale });
            }, 'image/png');
          } catch (drawErr) {
            reject(new Error('离线光栅化失败：' + drawErr.message));
          }
        };
        img.onerror = function () {
          reject(new Error('SVG 离线渲染失败，请检查内嵌图片格式是否完整'));
        };
        img.src = svgDataUrl;
      } catch (err) {
        reject(err);
      }
    });
  }

  function copyPngToClipboard() {
    var btn = document.getElementById('tp-copy-png');
    if (btn) { btn.disabled = true; btn.textContent = '生成 PNG 中...'; }
    return renderPosterToPngBlob(2).then(function (res) {
      if (!navigator.clipboard || !navigator.clipboard.write || typeof window.ClipboardItem === 'undefined') {
        throw new Error('当前页面环境不支持 ClipboardItem 图片剪贴板（file:// 部分浏览器受限，请点右侧“下载 PNG”或用 CLI 导出）');
      }
      var item = new window.ClipboardItem({ 'image/png': res.blob });
      return navigator.clipboard.write([item]).then(function () {
        showToast('已复制 PNG 到剪贴板（' + res.width + '×' + res.height + 'px，' + res.scale + 'x）');
        return res;
      });
    }).catch(function (err) {
      showToast('复制剪贴板失败：' + (err && err.message ? err.message : String(err)), true);
      throw err;
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = '复制为 PNG'; }
    });
  }

  function downloadPng() {
    var btn = document.getElementById('tp-download-png');
    if (btn) { btn.disabled = true; btn.textContent = '导出中...'; }
    return renderPosterToPngBlob(2).then(function (res) {
      var url = URL.createObjectURL(res.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = (state.spec.title || 'tech-poster').replace(/[<>:"/\\|?*]+/g, '-') + '.png';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
      showToast('已下载离线 PNG（' + res.width + '×' + res.height + 'px）');
      return res;
    }).catch(function (err) {
      showToast('导出 PNG 失败：' + (err && err.message ? err.message : String(err)), true);
      throw err;
    }).finally(function () {
      if (btn) { btn.disabled = false; btn.textContent = '下载 PNG'; }
    });
  }

  function saveHtml() {
    syncDataBlock();
    var docClone = document.documentElement.cloneNode(true);
    var bodyClone = docClone.querySelector('body');
    if (bodyClone) {
      bodyClone.classList.remove('sidebar-open', 'export-mode');
    }
    var sbBody = docClone.querySelector('#tp-sidebar-body');
    if (sbBody) sbBody.innerHTML = '';
    var toastClone = docClone.querySelector('#tp-toast');
    if (toastClone) toastClone.className = 'tp-toast';

    var html = '<!DOCTYPE html>\n' + docClone.outerHTML;
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (state.spec.title || 'tech-poster').replace(/[<>:"/\\|?*]+/g, '-') + '.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    showToast('已保存包含当前修改的单文件 HTML');
  }

  /* ======================== 绑定顶部工具栏与侧边栏事件 ======================== */

  if (themeSelect) {
    themeSelect.value = state.spec.theme;
    themeSelect.addEventListener('change', function () {
      state.spec.theme = themeSelect.value;
      renderCanvas();
      showToast('已切换主题：' + (THEMES[state.spec.theme] ? THEMES[state.spec.theme].name : state.spec.theme));
    });
  }

  if (bgSelect) {
    bgSelect.value = state.spec.background;
    bgSelect.addEventListener('change', function () {
      state.spec.background = resolveBackground(bgSelect.value);
      state.spec.theme = themeForBackground(state.spec.background);
      renderCanvas();
      var themeName = THEMES[state.spec.theme] ? THEMES[state.spec.theme].name : state.spec.theme;
      showToast('已切换背景：' + BACKGROUNDS[state.spec.background].name + '，并匹配主题：' + themeName);
    });
  }

  function setSidebarOpen(open) {
    document.body.classList.toggle('sidebar-open', open);
    if (toggleEditorBtn) {
      toggleEditorBtn.classList.toggle('is-active', open);
      toggleEditorBtn.textContent = open ? '收起侧边栏' : '编辑元素';
    }
    if (open) {
      if (state.activeTab === 'form') renderSidebarForm();
      else if (jsonTextarea) jsonTextarea.value = JSON.stringify(state.spec, null, 2);
    }
  }

  if (toggleEditorBtn) {
    toggleEditorBtn.addEventListener('click', function () {
      setSidebarOpen(!document.body.classList.contains('sidebar-open'));
    });
  }

  var closeSidebarBtn = document.getElementById('tp-close-sidebar');
  if (closeSidebarBtn) {
    closeSidebarBtn.addEventListener('click', function () { setSidebarOpen(false); });
  }

  var tabFormBtn = document.getElementById('tp-tab-form');
  var tabJsonBtn = document.getElementById('tp-tab-json');
  if (tabFormBtn) tabFormBtn.addEventListener('click', function () { switchTab('form'); });
  if (tabJsonBtn) tabJsonBtn.addEventListener('click', function () { switchTab('json'); });

  var applyJsonBtn = document.getElementById('tp-apply-json');
  if (applyJsonBtn && jsonTextarea) {
    applyJsonBtn.addEventListener('click', function () {
      try {
        var parsed = JSON.parse(jsonTextarea.value);
        if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.sections)) {
          throw new Error('JSON 须包含 title 与 sections 数组');
        }
        state.spec = parsed;
        state.spec.background = resolveBackground(state.spec.background);
        if (!state.spec.theme || !THEMES[state.spec.theme]) state.spec.theme = themeForBackground(state.spec.background);
        renderCanvas();
        showToast('已应用 JSON 修改');
      } catch (e) {
        showToast('JSON 格式错误：' + e.message, true);
      }
    });
  }

  var copyJsonBtn = document.getElementById('tp-copy-json');
  if (copyJsonBtn) {
    copyJsonBtn.addEventListener('click', function () {
      var txt = JSON.stringify(state.spec, null, 2);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () {
          showToast('已复制海报 JSON 到剪贴板');
        }).catch(function () {
          showToast('复制 JSON 失败，请从文本框手动复制', true);
        });
      }
    });
  }

  var copyPngBtn = document.getElementById('tp-copy-png');
  if (copyPngBtn) copyPngBtn.addEventListener('click', function () { copyPngToClipboard().catch(function () {}); });

  var downloadPngBtn = document.getElementById('tp-download-png');
  if (downloadPngBtn) downloadPngBtn.addEventListener('click', function () { downloadPng().catch(function () {}); });

  var saveHtmlBtn = document.getElementById('tp-save-html');
  if (saveHtmlBtn) saveHtmlBtn.addEventListener('click', saveHtml);

  var printBtn = document.getElementById('tp-print');
  if (printBtn) printBtn.addEventListener('click', function () { window.print(); });

  // 初始化画布点击定位
  bindCanvasClickToEditor();

  // 暴露全局离线 API
  window.TechPoster = {
    getSpec: function () { return JSON.parse(JSON.stringify(state.spec)); },
    setSpec: function (next) { state.spec = JSON.parse(JSON.stringify(next)); renderCanvas(); if (document.body.classList.contains('sidebar-open')) renderSidebarForm(); },
    setTheme: function (t) { if (THEMES[t]) { state.spec.theme = t; renderCanvas(); } },
    setBackground: function (bg, opts) {
      state.spec.background = resolveBackground(bg);
      if (!(opts && opts.keepTheme)) state.spec.theme = themeForBackground(state.spec.background);
      renderCanvas();
    },
    setSidebarOpen: setSidebarOpen,
    renderPngBlob: renderPosterToPngBlob,
    copyPngToClipboard: copyPngToClipboard,
    downloadPng: downloadPng,
    saveHtml: saveHtml
  };
})();
