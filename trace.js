// trace.js: run a C++ program with cpp.js and watch the recorded trace like a visual debugger.
// Panels (code, variables, arrays, memory map, changes, explanation, output) can each be shown or hidden.
(() => {
  const VIEW = 'be-the-cpu:view';
  const DEFAULT_SHOW = { inline: true, vars: true, arrays: true, memory: true, addr: true, changes: true, explain: true, output: true };
  const PANELS = [
    ['inline', 'Values in code', 'Show each variable next to the line that created it'],
    ['vars', 'Variables', 'Every variable in every function call (the call stack) and on the heap'],
    ['arrays', 'Array boxes', 'Arrays drawn as numbered boxes, with index variables and pointers tagged'],
    ['memory', 'Memory map', 'Every byte range in use: address, name, value'],
    ['addr', 'Addresses', 'Show memory addresses next to values everywhere'],
    ['changes', 'What changed', 'Added, changed, increased, decreased and removed values after each line'],
    ['explain', 'Explanation', 'Plain-English description of what the line did'],
    ['output', 'Output', 'What the program printed'],
  ];
  const SPEEDS = { slow: 2200, normal: 1300, fast: 600 };
  const TAG_COLORS = ['amber', 'cyan', 'emerald', 'rose', 'violet', 'sky'];
  const loadView = () => { try { return JSON.parse(localStorage.getItem(VIEW)) || {}; } catch { return {}; } };
  const saveView = () => { try { localStorage.setItem(VIEW, JSON.stringify({ show, speed })); } catch {} };

  const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  const hex = n => (n == null ? '' : '0x' + n.toString(16));
  const showNL = s => s.replace(/\n/g, '↵');

  let R, code, input, meta, lines, k, flat, prevFlat, changes, autoTimer;
  const saved = loadView();
  let show = { ...DEFAULT_SHOW, ...(saved.show || {}) };
  let speed = saved.speed || 'normal';

  // ---------- opening ----------
  function open(c, i, m = {}) {
    const res = window.CPP.run(c, i);
    if (res.compileError) return { error: res.compileError };
    if (!res.steps.length) return { error: res.error || { msg: 'Nothing ran.', line: 1 } };
    R = res; code = c; input = i; meta = m;
    lines = c.split('\n');
    stopAuto();
    if (m.share) { try { history.replaceState(null, '', '#code=' + enc({ c, i })); } catch {} }
    view();
    go(Math.min(m.at || 0, R.steps.length - 1));
    return null;
  }
  function openShared(hash, at) {
    try {
      const { c, i } = dec(hash);
      window.BTC.save({ c, i: i || '' });
      const res = open(c, i || '', { title: 'Shared program', share: false, at });
      return !(res && res.error);
    } catch { return false; }
  }

  // ---------- snapshot helpers ----------
  // Flatten a snapshot into id -> entry for every storage cell (vars, fields, slots, heap blocks).
  function flatten(s) {
    const m = new Map();
    const walk = (label, d, x, parent, depth) => {
      if (x.id == null) return;
      m.set(x.id, { id: x.id, label, d, addr: x.addr, size: x.size, ty: x.ty, where: x.where, frame: x.frame, parent, depth, text: textOf(d) });
      if (d.t === 'obj') d.fields.forEach(f => walk(`${label}.${f.name}`, f.val, { ...f, where: x.where, frame: x.frame }, x.id, depth + 1));
      if (d.t === 'vec') d.items.forEach((it, i) => walk(`${label}[${i}]`, it.val, { ...it, where: x.where, frame: x.frame }, x.id, depth + 1));
    };
    s.globals.forEach(v => { if (!v.ref && !v.isThis) walk(v.name, v.val, { ...v, where: 'globals' }, null, 0); });
    s.frames.forEach(f => f.vars.forEach(v => { if (!v.ref && !v.isThis) walk(v.name, v.val, { ...v, where: `${f.label}()`, frame: f.uid }, null, 0); }));
    s.heap.forEach(h => { if (!h.freed) walk(`heap #${h.hid}`, h.val, { ...h, where: 'heap' }, null, 0); });
    return m;
  }
  function textOf(d) {
    switch (d.t) {
      case 'p': return d.text;
      case 'u': return '?';
      case 'ptr':
        if (d.dangling) return `dangling${d.to != null ? ' ' + hex(d.to) : ''}`;
        if (!d.target) return 'nullptr';
        return d.to != null ? hex(d.to) : `→ ${d.target}`;
      case 'obj': return `{${d.fields.map(f => textOf(f.val)).join(', ')}}`;
      case 'vec': return `[${d.items.map(it => textOf(it.val)).join(', ')}${d.more ? ', …' : ''}]`;
    }
    return '';
  }
  const isLeaf = d => d.t !== 'obj' && d.t !== 'vec';

  function diff(a, b, s) {
    const out = [];
    if (!a) return out;
    for (const [id, e] of b) {
      const o = a.get(id);
      if (!o) { if (e.parent == null || a.has(e.parent)) out.push({ kind: 'add', e }); continue; }
      if (!isLeaf(e.d) || o.text === e.text) continue;
      const x = Number(o.text), y = Number(e.text);
      if (o.d.t === 'u') out.push({ kind: 'init', e, from: o });
      else if (e.d.t === 'ptr') out.push({ kind: 'ptr', e, from: o });
      else if (o.d.t === 'p' && e.d.t === 'p' && o.text !== '' && !isNaN(x) && !isNaN(y)) out.push({ kind: y > x ? 'up' : 'down', e, from: o, delta: y - x });
      else out.push({ kind: 'set', e, from: o });
    }
    const freed = new Set(s.heap.filter(h => h.freed).map(h => h.id));
    for (const [id, o] of a) {
      if (b.has(id) || (o.parent != null && !b.has(o.parent))) continue;
      out.push({ kind: freed.has(id) || o.where === 'heap' ? 'free' : 'gone', e: o });
    }
    return out;
  }

  // ---------- rendering pieces ----------
  const esc = s => window.BTC.esc(s);
  const ty = e => (e.ty ? `<span class="ty">${esc(e.ty)}</span>` : '');
  const addrTag = a => (show.addr && a != null ? `<span class="addr">${hex(a)}</span>` : '');
  function cls(id) {
    const c = changes.find(x => x.e.id === id);
    return c ? (c.kind === 'add' ? ' new' : ' chg') : '';
  }
  function valHTML(d, deep = true) {
    switch (d.t) {
      case 'p': return `<span class="val">${esc(d.text)}</span>`;
      case 'u': return '<span class="val garbage" title="Declared but never given a value: real C++ would hold random garbage here">?</span>';
      case 'ptr':
        if (d.dangling) return `<span class="ptr bad" title="This memory was deleted: the pointer still holds its old address">⚠ dangling${d.to != null && show.addr ? ' ' + hex(d.to) : ''}</span>`;
        if (!d.target) return '<span class="ptr null">nullptr</span>';
        return `<span class="ptr" data-tid="${d.tid}" title="Holds the address of ${esc(d.target)}">${show.addr && d.to != null ? `<span class="addr">${hex(d.to)}</span>` : ''}→ ${esc(d.target)}</span>`;
      case 'obj':
        if (!deep) return `<span class="val">${esc(d.cls)}</span>`;
        return `<span class="obj"><span class="objtag">${esc(d.cls)}</span>${d.fields.map(f =>
          `<span class="field${cls(f.id)}" data-cid="${f.id}">${f.priv ? '<span title="private">🔒</span>' : ''}<i>${esc(f.name)}</i>${valHTML(f.val)}${addrTag(f.addr)}</span>`).join('')}</span>`;
      case 'vec':
        if (!deep) return `<span class="val">[${d.items.length}${d.more ? '+' : ''}]</span>`;
        return `<span class="vec">${d.items.length ? d.items.map((it, i) => `<span class="slot${cls(it.id)}" data-cid="${it.id}"><sub>${i}</sub>${valHTML(it.val)}</span>`).join('') : '<span class="empty">empty</span>'}${d.more ? `<span class="empty">+${d.more} more</span>` : ''}</span>`;
    }
    return '';
  }

  function codePanel(s) {
    const prevLine = k > 0 ? R.steps[k - 1].line : null;
    const flags = {};
    s.frames.forEach(f => { if (f.callLine != null) flags[f.callLine] = (flags[f.callLine] || 0) + 1; });
    const top = s.frames[s.frames.length - 1];
    const ann = {};
    if (show.inline) {
      const add = (n, h) => { (ann[n] = ann[n] || []).push(h); };
      s.globals.forEach(v => add(v.anchor, chip(v, false)));
      s.frames.forEach((f, fi) => {
        const isTop = fi === s.frames.length - 1;
        if (!isTop && top && f.uid === top.uid) return;
        f.vars.forEach(v => add(v.anchor, chip(v, !isTop)));
      });
      if (s.temp) add(s.temp.line, `<span class="chip temp">↩ returned ${valHTML(s.temp.val)}</span>`);
    }
    return lines.map((src, i) => {
      const n = i + 1;
      const cur = s.line === n && s.kind !== 'exit';
      const c = 'row' + (cur ? ' current' : '') + (n === prevLine && !cur ? ' ran' : '') + (s.kind === 'error' && cur ? ' crashed' : '');
      return `<div class="${c}" data-line="${n}"><span class="ln">${n}</span><span class="mark">${cur ? '▶' : n === prevLine ? '·' : ''}${flags[n] ? '<span class="flag" title="A function call is waiting here to return">🚩</span>' : ''}</span><span class="src">${window.BTC.codeHTML(src) || ' '}</span>${ann[n] ? `<span class="ann">${ann[n].join('')}</span>` : ''}</div>`;
    }).join('');
  }
  function chip(v, dim) {
    if (v.anchor == null) return '';
    const body = v.ref ? `<span class="ref" title="A reference: another name for ${esc(v.ref)}">📎 ${esc(v.ref)}</span>` : v.isThis ? valHTML(v.val) : valHTML(v.val, false);
    return `<span class="chip${dim ? ' dim' : ''}${v.ref || v.isThis ? '' : cls(v.id)}" data-cid="${v.ref || v.isThis ? '' : v.id}"><b>${esc(v.name)}</b>${body}</span>`;
  }

  function varsPanel(s) {
    const row = v => {
      const isRef = !!v.ref;
      const val = isRef ? `<span class="ref">📎 another name for <b>${esc(v.ref)}</b></span>` : valHTML(v.val);
      return `<tr class="${isRef || v.isThis ? '' : cls(v.id).trim()}" data-cid="${isRef || v.isThis ? '' : v.id}"><td class="nm">${esc(v.name)}</td><td>${val}</td><td>${ty(v)}</td>${show.addr ? `<td class="addr">${isRef ? '' : hex(v.addr)}</td>` : ''}</tr>`;
    };
    const table = (vars, empty) => (vars.length ? `<table class="vt"><tbody>${vars.map(row).join('')}</tbody></table>` : `<p class="muted small">${empty}</p>`);
    let h = '';
    s.frames.slice().reverse().forEach((f, i) => {
      h += `<div class="frame${i === 0 ? ' on' : ''}"><div class="fh">📋 ${esc(f.label)}()<span class="muted small">${i === 0 ? 'running now' : `waiting at line ${s.frames[s.frames.length - i].callLine}`}</span></div>${table(f.vars, 'no variables yet')}</div>`;
    });
    if (s.globals.length) h += `<div class="frame"><div class="fh">🌐 globals</div>${table(s.globals, '')}</div>`;
    if (s.heap.length) {
      h += `<div class="frame heapf"><div class="fh">🏘 heap <span class="muted small">memory made with new</span></div><table class="vt"><tbody>${s.heap.map(hp => (hp.freed
        ? `<tr class="freed"><td class="nm">#${hp.hid}</td><td><span class="muted">deleted</span></td><td>${ty(hp)}</td>${show.addr ? `<td class="addr">${hex(hp.addr)}</td>` : ''}</tr>`
        : `<tr class="${cls(hp.id).trim()}" data-cid="${hp.id}"><td class="nm">#${hp.hid}</td><td>${valHTML(hp.val)}</td><td>${ty(hp)}</td>${show.addr ? `<td class="addr">${hex(hp.addr)}</td>` : ''}</tr>`)).join('')}</tbody></table></div>`;
    }
    return h || '<p class="muted small">No variables yet.</p>';
  }

  // Index variables: identifiers used inside [ ] after a name, e.g. v[maxIndex] -> maxIndex.
  const indexNames = {};
  function indexVarsFor(name) {
    if (indexNames[name]) return indexNames[name];
    const re = new RegExp(`\\b${name.replace(/[^\w]/g, '')}\\s*\\[\\s*([A-Za-z_]\\w*)\\s*\\]`, 'g');
    const set = new Set();
    let m;
    while ((m = re.exec(code))) set.add(m[1]);
    return (indexNames[name] = [...set]);
  }
  function arraysPanel(s) {
    const top = s.frames[s.frames.length - 1];
    const scope = [...(top ? top.vars : []), ...s.globals];
    const intOf = n => { const v = scope.find(x => x.name === n && !x.isThis); const r = v && v.val.t === 'p' && /^-?\d+$/.test(v.val.text) ? +v.val.text : null; return r; };
    const pointers = [...flat.values()].filter(e => e.d.t === 'ptr' && e.d.tid != null && e.depth === 0);
    const arrays = [...flat.values()].filter(e => e.d.t === 'vec' && (e.depth === 0 || flat.get(e.parent)?.d.t === 'obj'));
    if (!arrays.length) return '<p class="muted small">No arrays or vectors right now.</p>';
    const colors = {};
    let ci = 0;
    const color = n => (colors[n] = colors[n] || TAG_COLORS[ci++ % TAG_COLORS.length]);
    return arrays.map(a => {
      const ptrs = pointers.filter(p => p.d.tid === a.id || a.d.items.some(it => it.id === p.d.tid));
      const names = [a.label.split('.').pop(), ...ptrs.map(p => p.label)];
      const idx = [];
      names.forEach(n => indexVarsFor(n).forEach(iv => { const v = intOf(iv); if (v != null && !idx.some(x => x.n === iv)) idx.push({ n: iv, v }); }));
      const grid2d = a.d.items.length && a.d.items[0].val.t === 'vec';
      const box = (it, i, extraTags = '') => {
        const tags = idx.filter(x => x.v === i).map(x => `<span class="tag ${color(x.n)}">${esc(x.n)}</span>`).join('')
          + ptrs.filter(p => p.d.tid === it.id || (i === 0 && p.d.tid === a.id)).map(p => `<span class="tag ptrtag" title="${esc(p.label)} points here">${esc(p.label)} →</span>`).join('') + extraTags;
        return `<div class="box${cls(it.id)}" data-cid="${it.id}"><div class="tags">${tags}</div><span class="bi">[${i}]</span><span class="bv">${it.val.t === 'p' ? esc(it.val.text) : it.val.t === 'u' ? '?' : valHTML(it.val)}</span>${show.addr && it.addr != null ? `<span class="ba">${hex(it.addr)}</span>` : ''}</div>`;
      };
      const body = grid2d
        ? a.d.items.map((row, r) => `<div class="boxrow"><span class="rowlbl">[${r}]</span>${row.val.items.map((it, i) => box(it, i)).join('')}</div>`).join('')
        : `<div class="boxrow">${a.d.items.map((it, i) => box(it, i)).join('')}${a.d.more ? `<span class="muted small">+${a.d.more} more</span>` : ''}</div>`;
      return `<div class="arr"><div class="arrh"><code>${esc(a.label)}</code>${ty(a)}<span class="muted small">${esc(a.where)}${a.addr != null && show.addr ? ` · starts at ${hex(a.addr)}` : ''}</span></div>${body}</div>`;
    }).join('');
  }

  function memoryPanel(s) {
    const entries = [...flat.values()];
    const has = entries.some(e => e.addr != null);
    if (!entries.length) return '<p class="muted small">Nothing in memory yet.</p>';
    const groups = {};
    entries.forEach(e => { const g = e.where === 'heap' ? 'Heap (new)' : e.where === 'globals' ? 'Globals' : `Stack · ${e.where}`; (groups[g] = groups[g] || []).push(e); });
    const freed = s.heap.filter(h => h.freed);
    if (freed.length) groups['Heap (new)'] = (groups['Heap (new)'] || []).concat(freed.map(h => ({ id: 'f' + h.hid, label: `heap #${h.hid}`, d: { t: 'u' }, addr: h.addr, ty: h.ty, depth: 0, freed: true })));
    const order = Object.keys(groups).sort((a, b) => (a.startsWith('Stack') ? 0 : a.startsWith('Heap') ? 1 : 2) - (b.startsWith('Stack') ? 0 : b.startsWith('Heap') ? 1 : 2));
    return `${has ? '' : '<p class="muted small">Addresses are not available for this program.</p>'}<table class="mem"><thead><tr><th>Address</th><th>Name</th><th>Value</th><th>Type</th></tr></thead>${order.map(g => `<tbody><tr class="grp"><td colspan="4">${esc(g)}</td></tr>${groups[g].map(e => `
      <tr class="${e.freed ? 'freed' : cls(e.id).trim()}" data-cid="${e.freed ? '' : e.id}"><td class="addr">${hex(e.addr)}</td><td class="nm" style="padding-left:${0.5 + e.depth * 0.9}rem">${esc(e.label.slice(e.depth ? Math.max(e.label.lastIndexOf('.'), e.label.lastIndexOf('[')) : 0))}</td><td>${e.freed ? '<span class="muted">deleted</span>' : isLeaf(e.d) ? valHTML(e.d) : `<span class="muted small">${e.size ? e.size + ' bytes' : ''}</span>`}</td><td>${ty(e)}</td></tr>`).join('')}</tbody>`).join('')}</table>`;
  }

  function changesPanel(s) {
    const prev = k > 0 ? R.steps[k - 1] : null;
    const items = changes.map(c => {
      const e = c.e;
      const nm = `<code>${esc(e.label)}</code>`;
      switch (c.kind) {
        case 'add': return `<li class="c-add"><span class="ic">＋</span>${nm} created${isLeaf(e.d) && e.d.t !== 'u' ? ` = ${valHTML(e.d)}` : e.d.t === 'u' ? ' (no value yet)' : ''}${show.addr && e.addr != null ? ` at <span class="addr">${hex(e.addr)}</span>` : ''}</li>`;
        case 'init': return `<li class="c-set"><span class="ic">✎</span>${nm} got its first value: ${valHTML(e.d)}</li>`;
        case 'up': return `<li class="c-up"><span class="ic">▲</span>${nm} increased <span class="old">${esc(c.from.text)}</span> → ${valHTML(e.d)} <span class="delta">+${+c.delta.toFixed(6)}</span></li>`;
        case 'down': return `<li class="c-down"><span class="ic">▼</span>${nm} decreased <span class="old">${esc(c.from.text)}</span> → ${valHTML(e.d)} <span class="delta">${+c.delta.toFixed(6)}</span></li>`;
        case 'ptr': return `<li class="c-ptr"><span class="ic">➜</span>${nm} now ${e.d.dangling ? 'holds a dangling address' : e.d.target ? `points to <b>${esc(e.d.target)}</b>${show.addr && e.d.to != null ? ` (<span class="addr">${hex(e.d.to)}</span>)` : ''}` : 'is nullptr'}<span class="old"> was ${esc(c.from.text)}</span></li>`;
        case 'set': return `<li class="c-set"><span class="ic">✎</span>${nm} changed <span class="old">${esc(c.from.text)}</span> → ${valHTML(e.d)}</li>`;
        case 'free': return `<li class="c-gone"><span class="ic">🗑</span>${nm} deleted: its memory was given back</li>`;
        case 'gone': return `<li class="c-gone"><span class="ic">✕</span>${nm} removed (its function or block ended)</li>`;
      }
      return '';
    });
    if (prev && s.out.length > prev.out.length) items.push(`<li class="c-out"><span class="ic">🖥</span>printed <code class="printed">${esc(showNL(s.out.slice(prev.out.length)))}</code></li>`);
    if (!prev) return '<p class="muted small">Nothing has run yet. Press Step.</p>';
    return items.length ? `<ul class="changes">${items.join('')}</ul>` : '<p class="muted small">No values changed on this step.</p>';
  }

  function explainPanel(s) {
    const prev = k > 0 ? R.steps[k - 1] : null;
    let h = '';
    if (k === 0) h += `<p>The program starts. The CPU is at line <b>${s.line}</b>, the first line of <code>main()</code>.</p>`;
    if (prev) {
      const did = s.did.map(d => (typeof d === 'string' ? `<li>${esc(d)}</li>` : `<li>🖥 Printed <code class="printed">${esc(showNL(d.print))}</code></li>`)).join('');
      h += `<div class="didh">Line ${prev.line} just ran</div><div class="srcline">${window.BTC.codeHTML((lines[prev.line - 1] || '').trim())}</div>${did ? `<ul class="did">${did}</ul>` : ''}`;
    }
    if (s.temp) h += `<p class="small">↩ The function handed back ${valHTML(s.temp.val)} to line ${s.temp.line}.</p>`;
    if (s.kind === 'error') h += `<div class="crash">💥 <b>The program crashes on line ${s.line}.</b> ${esc(s.note || '')}</div>`;
    else if (s.kind === 'exit') h += `<div class="done">✅ The program finished.</div>`;
    else h += `<p class="next">Next: line <b>${s.line}</b> <span class="srcline inline">${window.BTC.codeHTML((lines[s.line - 1] || '').trim())}</span></p>`;
    if (k === R.steps.length - 1 && R.error && s.kind !== 'error') h += `<div class="crash">💥 ${esc(R.error.msg)}</div>`;
    return h;
  }

  function outputPanel(s) {
    return s.out ? s.out.split('\n').map((l, i, a) => (i === a.length - 1 && l === '' ? '' : `<div class="outline">${esc(l) || '&nbsp;'}</div>`)).join('') : '<div class="outline muted">(nothing printed yet)</div>';
  }

  // ---------- layout ----------
  function view() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="viewer">
        <header class="topbar">
          <button class="ghostbtn" data-act="home">← Programs</button>
          <div class="ttl">${meta.section ? `<span class="muted small">${esc(meta.section)}</span>` : ''}<b>${esc(meta.title || 'Your program')}</b></div>
          <div class="topbtns">
            <button class="ghostbtn" data-act="edit" title="Open this code in the editor">✎ Edit code</button>
            <button class="ghostbtn" data-act="share" title="Copy a link to this program">🔗 Share</button>
          </div>
        </header>
        ${meta.watch ? `<div class="watchhint">👀 <b>Watch for:</b> ${esc(meta.watch)}</div>` : ''}
        <div class="controls card">
          <div class="btns">
            <button class="ctl" data-act="restart" title="Back to the start (Home)">⏮<span>Reset</span></button>
            <button class="ctl" data-act="back" id="bback" title="Step back (←)">◀<span>Back</span></button>
            <button class="ctl primary" data-act="next" id="bnext" title="Step forward (→)">▶<span>Step</span></button>
            <button class="ctl go" data-act="auto" id="bauto" title="Play automatically (Space)">⏵<span>Auto</span></button>
            <select id="speed" aria-label="Auto speed">${Object.keys(SPEEDS).map(sp => `<option value="${sp}"${sp === speed ? ' selected' : ''}>${sp}</option>`).join('')}</select>
          </div>
          <input type="range" id="scrub" min="0" max="${R.steps.length - 1}" value="0" aria-label="Step">
          <span class="stepno" id="stepno"></span>
        </div>
        <div class="toggles" role="group" aria-label="Show or hide panels"><span class="muted small">Show:</span>
          ${PANELS.map(([key, label, tip]) => `<button class="tog" data-tog="${key}" aria-pressed="${!!show[key]}" title="${esc(tip)}">${esc(label)}</button>`).join('')}
        </div>
        <main class="grid">
          <section class="card codecard"><div class="card-h"><h3>Code</h3><span class="muted small">▶ runs next · · just ran · 🚩 waiting for a call to return</span></div><div class="code" id="code"></div></section>
          <div class="side">
            <section class="card" data-panel="explain"><div class="card-h"><h3>Explanation</h3></div><div id="p-explain" class="explain"></div></section>
            <section class="card" data-panel="changes"><div class="card-h"><h3>What changed</h3></div><div id="p-changes"></div></section>
            <section class="card" data-panel="vars"><div class="card-h"><h3>Variables</h3><span class="muted small">call stack, top = running</span></div><div id="p-vars"></div></section>
            <section class="card" data-panel="arrays"><div class="card-h"><h3>Array boxes</h3><span class="muted small">index = box number · value = what's inside</span></div><div id="p-arrays"></div></section>
            <section class="card" data-panel="memory"><div class="card-h"><h3>Memory map</h3></div><div id="p-memory"></div></section>
            <section class="card" data-panel="output"><div class="card-h"><h3>Output</h3></div><div id="p-output" class="screen"></div></section>
          </div>
        </main>
      </div>`;
    app.querySelector('.viewer').addEventListener('click', onClick);
    app.querySelector('.viewer').addEventListener('mouseover', onHover);
    app.querySelector('.viewer').addEventListener('mouseout', onHover);
    document.getElementById('scrub').addEventListener('input', e => { stopAuto(); go(+e.target.value); });
    document.getElementById('speed').addEventListener('change', e => { speed = e.target.value; saveView(); if (autoTimer) { stopAuto(); toggleAuto(); } });
    for (const key in indexNames) delete indexNames[key];
    window.scrollTo(0, 0);
  }

  function render() {
    const s = R.steps[k];
    document.querySelectorAll('[data-panel]').forEach(p => (p.hidden = !show[p.dataset.panel]));
    document.querySelectorAll('[data-tog]').forEach(b => b.setAttribute('aria-pressed', !!show[b.dataset.tog]));
    const codeEl = document.getElementById('code');
    codeEl.innerHTML = codePanel(s);
    const set = (id, on, fn) => { if (on) document.getElementById(id).innerHTML = fn(s); };
    set('p-explain', show.explain, explainPanel);
    set('p-changes', show.changes, changesPanel);
    set('p-vars', show.vars, varsPanel);
    set('p-arrays', show.arrays, arraysPanel);
    set('p-memory', show.memory, memoryPanel);
    set('p-output', show.output, outputPanel);
    document.getElementById('stepno').textContent = `Step ${k + 1} / ${R.steps.length}`;
    document.getElementById('scrub').value = k;
    document.getElementById('bback').disabled = k === 0;
    document.getElementById('bnext').disabled = k === R.steps.length - 1;
    document.getElementById('bauto').innerHTML = autoTimer ? '⏸<span>Pause</span>' : '⏵<span>Auto</span>';
    const cur = codeEl.querySelector('.row.current') || codeEl.querySelector('.row.ran');
    if (cur) {
      const top = cur.offsetTop - codeEl.offsetTop, h = codeEl.clientHeight;
      if (top < codeEl.scrollTop + 20 || top > codeEl.scrollTop + h - 40) codeEl.scrollTo({ top: top - h / 3, behavior: autoTimer ? 'auto' : 'smooth' });
    }
  }

  // ---------- navigation ----------
  function go(i) {
    if (i < 0 || i >= R.steps.length) return;
    k = i;
    flat = flatten(R.steps[k]);
    prevFlat = k > 0 ? flatten(R.steps[k - 1]) : null;
    changes = diff(prevFlat, flat, R.steps[k]);
    render();
    if (k === R.steps.length - 1) stopAuto();
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    const b = document.getElementById('bauto');
    if (b) b.innerHTML = '⏵<span>Auto</span>';
  }
  function toggleAuto() {
    if (autoTimer) return stopAuto();
    if (k === R.steps.length - 1) go(0);
    autoTimer = setInterval(() => (k >= R.steps.length - 1 ? stopAuto() : go(k + 1)), SPEEDS[speed]);
    render();
  }

  function onClick(e) {
    const t = e.target.closest('[data-tog]');
    if (t) { show[t.dataset.tog] = !show[t.dataset.tog]; saveView(); return render(); }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'next') { stopAuto(); return go(k + 1); }
    if (a === 'back') { stopAuto(); return go(k - 1); }
    if (a === 'restart') { stopAuto(); return go(0); }
    if (a === 'auto') return toggleAuto();
    if (a === 'home' || a === 'edit') {
      stopAuto();
      if (a === 'edit') window.BTC.save({ c: code, i: input });
      try { history.replaceState(null, '', location.pathname); } catch {}
      window.BTC.home();
      if (a === 'edit') document.getElementById('src')?.focus();
      return;
    }
    if (a === 'share') {
      const url = location.origin + location.pathname + (meta.id ? '#ex=' + meta.id : '#code=' + enc({ c: code, i: input })) + (k ? '@' + k : '');
      const ok = () => { act.textContent = '✓ Link copied'; setTimeout(() => (act.textContent = '🔗 Share'), 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, () => prompt('Copy this link:', url));
      else prompt('Copy this link:', url);
    }
  }

  // Hovering a pointer lights up what it points at, in every panel.
  function onHover(e) {
    const p = e.target.closest('[data-tid]');
    if (!p) return;
    const on = e.type === 'mouseover';
    document.querySelectorAll(`[data-cid="${p.dataset.tid}"]`).forEach(el => el.classList.toggle('pointed', on));
  }

  document.addEventListener('keydown', e => {
    if (!document.querySelector('.viewer') || /TEXTAREA|INPUT|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); stopAuto(); go(k + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stopAuto(); go(k - 1); }
    else if (e.key === ' ') { e.preventDefault(); toggleAuto(); }
    else if (e.key === 'Home') { e.preventDefault(); stopAuto(); go(0); }
    else if (e.key === 'End') { e.preventDefault(); stopAuto(); go(R.steps.length - 1); }
  });

  window.Tracer = { open, openShared };
})();
