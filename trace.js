// trace.js: run a C++ program with cpp.js and watch it like a visual debugger.
// Layout follows the Selection Sort debugger: code + array state on the left,
// live variable watcher + controls + plain-English log on the right.
(() => {
  const VIEW = 'be-the-cpu:view2';
  const DEFAULT_SHOW = { addr: false, inline: false, arrays: true, watcher: true, log: true, changes: true, output: true, memory: false };
  const OPTIONS = [
    ['addr', 'Memory addresses'],
    ['inline', 'Values next to code'],
    ['arrays', 'Array state'],
    ['watcher', 'Variable watcher'],
    ['log', 'Narrative log'],
    ['changes', 'What changed'],
    ['output', 'Output'],
    ['memory', 'Memory map'],
  ];
  const SPEEDS = { slow: 2600, normal: 1800, fast: 900 };
  const PALETTE = ['amber', 'cyan', 'emerald', 'rose', 'sky', 'orange', 'lime', 'pink'];
  const loadView = () => { try { return JSON.parse(localStorage.getItem(VIEW)) || {}; } catch { return {}; } };
  const saveView = () => { try { localStorage.setItem(VIEW, JSON.stringify({ show, speed })); } catch {} };

  const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
  const hex = n => (n == null ? '' : '0x' + n.toString(16));
  const esc = s => window.BTC.esc(s);
  const showNL = s => s.replace(/\n/g, '↵');

  let R, code, input, meta, lines, k, flat, changes, autoTimer, indexColor;
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
    // Index variables (the i in v[i]) get one fixed color each, in order of first use.
    indexColor = {};
    const re = /\b([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*)\s*\]/g;
    let mm, n = 0;
    const TYPE = /^(int|double|float|char|bool|string|long|short|unsigned)$/;
    while ((mm = re.exec(c))) if (!TYPE.test(mm[1]) && !(mm[2] in indexColor)) indexColor[mm[2]] = PALETTE[n++ % PALETTE.length];
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
      const res = open(c, i || '', { title: 'Shared program', at });
      return !(res && res.error);
    } catch { return false; }
  }

  // ---------- snapshot helpers ----------
  function flatten(s) {
    const m = new Map();
    const walk = (label, d, x, parent, depth) => {
      if (x.id == null) return;
      m.set(x.id, { id: x.id, label, d, addr: x.addr, size: x.size, ty: x.ty, where: x.where, parent, depth, text: textOf(d) });
      if (d.t === 'obj') d.fields.forEach(f => walk(`${label}.${f.name}`, f.val, { ...f, where: x.where }, x.id, depth + 1));
      if (d.t === 'vec') d.items.forEach((it, i) => walk(`${label}[${i}]`, it.val, { ...it, where: x.where }, x.id, depth + 1));
    };
    s.globals.forEach(v => { if (!v.ref && !v.isThis) walk(v.name, v.val, { ...v, where: 'globals' }, null, 0); });
    s.frames.forEach(f => f.vars.forEach(v => { if (!v.ref && !v.isThis) walk(v.name, v.val, { ...v, where: `${f.label}()` }, null, 0); }));
    s.heap.forEach(h => { if (!h.freed) walk(`heap #${h.hid}`, h.val, { ...h, where: 'heap' }, null, 0); });
    return m;
  }
  function textOf(d) {
    switch (d.t) {
      case 'p': return d.text;
      case 'u': return '?';
      case 'ptr':
        if (d.dangling) return 'dangling';
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
  const changeOf = id => changes.find(c => c.e.id === id);

  // Look up a variable visible from the running function (or globals) in a given step.
  function lookup(s, name) {
    const top = s.frames[s.frames.length - 1];
    return (top && top.vars.find(v => v.name === name && !v.isThis)) || s.globals.find(v => v.name === name);
  }
  function plainVal(d) {
    if (!d) return '?';
    if (d.t === 'p') return d.text;
    if (d.t === 'u') return '?';
    if (d.t === 'ptr') return d.target ? `→ ${d.target}` : d.dangling ? 'dangling' : 'nullptr';
    return textOf(d);
  }
  // Value of v[i]-style and plain names in an expression, using the state of step s.
  function evalText(expr, s) {
    const valOf = name => { const v = lookup(s, name); return v ? v.val : null; };
    return expr
      .replace(/\b([A-Za-z_]\w*)\s*\[\s*([A-Za-z_]\w*|\d+)\s*\]/g, (all, a, i) => {
        const av = valOf(a), iv = /^\d+$/.test(i) ? { t: 'p', text: i } : valOf(i);
        const idx = iv && iv.t === 'p' ? +iv.text : NaN;
        const item = av && av.t === 'vec' && av.items[idx];
        return item ? `\u0001${item.val.t === 'p' ? item.val.text : '?'}\u0002` : all;
      })
      .replace(/\b([A-Za-z_]\w*)\b(?!\s*\()/g, (all, n) => { const v = valOf(n); return v && v.t === 'p' ? `\u0001${v.text}\u0002` : all; })
      .replace(/\u0001/g, '').replace(/\u0002/g, '');
  }
  function comparison(s) {
    const prev = k > 0 ? R.steps[k - 1] : null;
    if (!prev) return null;
    for (const d of s.did) {
      const m = typeof d === 'string' && d.match(/^\((.*)\) is (true|false), so (.*)$/);
      if (m) return { expr: m[1], values: evalText(m[1], prev), result: m[2] === 'true', then: m[3] };
    }
    return null;
  }

  // ---------- small renderers ----------
  const addr = a => (show.addr && a != null ? `<span class="text-[10px] font-mono text-sky-300/80">${hex(a)}</span>` : '');
  function valHTML(d) {
    switch (d.t) {
      case 'p': return `<span class="font-mono font-semibold text-slate-100">${esc(d.text)}</span>`;
      case 'u': return '<span class="font-mono text-rose-400" title="Declared but never given a value">?</span>';
      case 'ptr':
        if (d.dangling) return '<span class="font-mono text-rose-400" title="This memory was deleted">⚠ dangling</span>';
        if (!d.target) return '<span class="font-mono text-slate-500">nullptr</span>';
        return `<span class="font-mono text-violet-300" data-tid="${d.tid}">→ ${esc(d.target)}${show.addr && d.to != null ? ` <span class="text-[10px] text-sky-300/80">(${hex(d.to)})</span>` : ''}</span>`;
      case 'obj': return `<span class="inline-flex flex-wrap gap-1">${d.fields.map(f => `<span class="bg-slate-800 rounded px-1.5 text-xs" data-cid="${f.id}"><span class="text-slate-400">${esc(f.name)}</span> ${valHTML(f.val)}</span>`).join('')}</span>`;
      case 'vec': return `<span class="font-mono text-slate-200">[${d.items.map(it => esc(plainVal(it.val))).join(', ')}${d.more ? ', …' : ''}]</span>`;
    }
    return '';
  }

  // ---------- panels ----------
  function codeLines(s) {
    const prevLine = k > 0 ? R.steps[k - 1].line : null;
    const flags = {};
    s.frames.forEach(f => { if (f.callLine != null) flags[f.callLine] = true; });
    const ann = {};
    if (show.inline) {
      const top = s.frames[s.frames.length - 1];
      s.frames.forEach((f, fi) => {
        if (fi !== s.frames.length - 1 && top && f.uid === top.uid) return;
        f.vars.forEach(v => { if (v.anchor != null && !v.isThis) (ann[v.anchor] = ann[v.anchor] || []).push(`<span class="ml-2 text-[11px] bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 font-sans ${fi === s.frames.length - 1 ? '' : 'opacity-50'}"><span class="text-indigo-300">${esc(v.name)}</span> ${v.ref ? '📎' : esc(plainVal(v.val))}</span>`); });
      });
    }
    return lines.map((src, i) => {
      const n = i + 1;
      const cur = s.line === n && s.kind !== 'exit';
      const crashed = cur && s.kind === 'error';
      const base = 'flex items-start px-2 py-0.5 rounded transition-colors whitespace-pre border-l-4';
      const c = crashed ? `${base} bg-rose-900/50 border-rose-400 text-rose-100 font-semibold`
        : cur ? `${base} bg-indigo-900/60 border-indigo-400 text-indigo-200 font-semibold`
        : n === prevLine ? `${base} bg-slate-700/30 border-slate-600 text-slate-300`
        : `${base} border-transparent text-slate-300`;
      return `<div class="${c}" data-line="${n}"><span class="w-8 shrink-0 text-right pr-3 select-none ${cur ? 'text-indigo-300' : 'text-slate-600'}">${n}</span><span class="w-4 shrink-0 text-xs">${flags[n] ? '🚩' : ''}</span><span>${window.BTC.codeHTML(src) || ' '}</span>${ann[n] ? ann[n].join('') : ''}</div>`;
    }).join('');
  }

  function arrayCards(s) {
    const top = s.frames[s.frames.length - 1];
    const pointers = [...flat.values()].filter(e => e.d.t === 'ptr' && e.d.tid != null && e.depth === 0);
    const arrays = [...flat.values()].filter(e => e.d.t === 'vec' && (e.depth === 0 || flat.get(e.parent)?.d.t === 'obj') && e.d.items.length);
    if (!arrays.length) return '';
    const intVal = name => { const v = lookup(s, name); return v && v.val.t === 'p' && /^-?\d+$/.test(v.val.text) ? +v.val.text : null; };
    return arrays.map(a => {
      const ptrs = pointers.filter(p => p.d.tid === a.id || a.d.items.some(it => it.id === p.d.tid));
      const names = new Set([a.label.split('.').pop(), ...ptrs.map(p => p.label)]);
      // index variables used with this array's name in the code, e.g. v[maxIndex]
      const idxVars = [];
      for (const nm of names) {
        const re = new RegExp(`\\b${nm.replace(/\W/g, '')}\\s*\\[\\s*([A-Za-z_]\\w*)\\s*\\]`, 'g');
        let m;
        while ((m = re.exec(code))) if (!idxVars.includes(m[1])) idxVars.push(m[1]);
      }
      const live = idxVars.map(n => ({ n, v: intVal(n), c: indexColor[n] || 'indigo' })).filter(x => x.v != null);
      const grid2d = a.d.items[0].val.t === 'vec';
      const box = (it, i, rowTags = true) => {
        const here = rowTags ? live.filter(x => x.v === i) : [];
        const ptrHere = ptrs.filter(p => p.d.tid === it.id || (i === 0 && p.d.tid === a.id));
        const ch = changeOf(it.id);
        let border = 'border-slate-700/80 bg-slate-900/90';
        if (here.length) border = `border-${here[0].c}-500/80 bg-${here[0].c}-950/20 shadow-lg shadow-${here[0].c}-500/10`;
        else if (ptrHere.length) border = 'border-violet-500/80 bg-violet-950/20 shadow-lg shadow-violet-500/10';
        const topTags = here.filter((x, j) => j % 2 === 0), botTags = here.filter((x, j) => j % 2 === 1);
        const tag = x => `<span class="bg-${x.c}-500 text-slate-950 font-bold text-[10px] px-1.5 py-0.5 rounded shadow">${esc(x.n)}</span>`;
        return `<div class="array-card relative rounded-xl border-2 ${border} p-2 sm:p-3 flex flex-col items-center justify-center min-h-[5rem] sm:min-h-[6rem] min-w-[3.5rem] shadow-md ${ch ? 'ring-2 ring-amber-400/70' : ''}" data-cid="${it.id}">
          ${topTags.length || ptrHere.length ? `<div class="absolute -top-3 flex gap-1">${topTags.map(tag).join('')}${ptrHere.map(p => `<span class="bg-violet-400 text-slate-950 font-bold text-[10px] px-1.5 py-0.5 rounded shadow">${esc(p.label)} →</span>`).join('')}</div>` : ''}
          ${botTags.length ? `<div class="absolute -bottom-3 flex gap-1">${botTags.map(tag).join('')}</div>` : ''}
          <span class="text-[10px] text-slate-400 font-mono mb-1">Index [${i}]</span>
          <span class="text-2xl sm:text-3xl font-bold code-font ${it.val.t === 'u' ? 'text-rose-400' : 'text-slate-100'}">${it.val.t === 'p' ? esc(it.val.text) : it.val.t === 'u' ? '?' : `<span class="text-sm">${valHTML(it.val)}</span>`}</span>
          ${show.addr && it.addr != null ? `<span class="text-[9px] font-mono text-sky-300/80 mt-1">${hex(it.addr)}</span>` : ''}
        </div>`;
      };
      const body = grid2d
        ? a.d.items.map((row, r) => `<div class="flex items-center gap-2 sm:gap-3 my-3"><span class="text-xs font-mono text-slate-500 w-8">[${r}]</span><div class="grid gap-2 sm:gap-3 flex-1" style="grid-template-columns:repeat(${row.val.items.length},minmax(0,1fr))">${row.val.items.map((it, i) => box(it, i, false)).join('')}</div></div>`).join('')
        : `<div class="grid gap-2 sm:gap-3 my-4" style="grid-template-columns:repeat(${Math.min(a.d.items.length, 8)},minmax(0,1fr))">${a.d.items.map((it, i) => box(it, i)).join('')}</div>${a.d.more ? `<p class="text-xs text-slate-500">+${a.d.more} more</p>` : ''}`;
      const legend = live.map(x => `<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-${x.c}-500 inline-block"></span>${esc(x.n)}</span>`).join('')
        + (ptrs.length ? '<span class="flex items-center gap-1.5"><span class="w-3 h-3 rounded-full bg-violet-400 inline-block"></span>pointer</span>' : '');
      return `<div class="mb-2">
        <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
          <h2 class="text-sm font-semibold text-slate-200 flex items-center gap-2"><i class="fa-solid fa-layer-group text-indigo-400"></i> Array State: <code class="text-indigo-300 code-font bg-slate-900 px-2 py-0.5 rounded">${esc(a.label)}${a.ty ? ` <span class="text-slate-500">${esc(a.ty)}</span>` : ''}</code>${show.addr && a.addr != null ? `<span class="text-[11px] font-mono text-sky-300/80">starts at ${hex(a.addr)}</span>` : ''}</h2>
          <div class="flex items-center gap-3 text-xs flex-wrap">${legend}</div>
        </div>${body}</div>`;
    }).join('<div class="border-t border-slate-700/60 my-4"></div>');
  }

  function watcherCards(s) {
    const top = s.frames[s.frames.length - 1];
    const vars = (top ? top.vars : []).filter(v => !v.isThis && (v.ref || v.val.t !== 'vec'));
    const cards = vars.map(v => varCard(v, s));
    const thisVar = top && top.vars.find(v => v.isThis);
    if (thisVar) cards.unshift(varCard({ ...thisVar, name: 'this' }, s));
    return cards.join('');
  }
  function varCard(v, s) {
    const color = indexColor[v.name] || (v.val.t === 'ptr' ? 'violet' : 'indigo');
    const ch = v.ref ? null : changeOf(v.id);
    let big, sub = '';
    if (v.ref) {
      const target = lookupDeep(s, v.ref);
      big = target ? esc(plainVal(target)) : '📎';
      sub = `reference to ${esc(v.ref)}`;
    } else if (v.val.t === 'ptr') {
      big = v.val.target ? `→ ${esc(v.val.target)}` : v.val.dangling ? '⚠ dangling' : 'nullptr';
      sub = v.val.to != null ? `holds ${hex(v.val.to)}` : '';
      if (v.val.target) { const t = [...flat.values()].find(e => e.id === v.val.tid); if (t && isLeaf(t.d)) sub = `*${esc(v.name)} = ${esc(plainVal(t.d))}${sub ? ' · ' + sub : ''}`; }
    } else if (v.val.t === 'obj') {
      big = `<span class="text-base">${esc(v.val.cls)}</span>`;
    } else {
      big = esc(plainVal(v.val));
      // index variable: show the box it points at, like v[2] = 4
      if (indexColor[v.name] && v.val.t === 'p') {
        const re = new RegExp(`\\b([A-Za-z_]\\w*)\\s*\\[\\s*${v.name}\\s*\\]`, 'g');
        let m;
        while (!sub && (m = re.exec(code))) {
          const arr = lookup(s, m[1]);
          let items = arr && arr.val.t === 'vec' ? arr.val.items : null;
          if (arr && arr.val.t === 'ptr' && arr.val.tid != null) {
            const t = flat.get(arr.val.tid), p = t && flat.get(t.parent);
            if (p && p.d.t === 'vec') items = p.d.items.slice(p.d.items.findIndex(it => it.id === t.id));
          }
          const item = items && items[+v.val.text];
          if (item) sub = `${esc(m[1])}[${esc(v.val.text)}] = ${esc(plainVal(item.val))}`;
        }
      }
    }
    const badge = !ch ? ''
      : ch.kind === 'add' ? '<span class="text-emerald-400">new</span>'
      : ch.kind === 'up' ? `<span class="text-sky-300">▲ +${+ch.delta.toFixed(6)}</span>`
      : ch.kind === 'down' ? `<span class="text-amber-300">▼ ${+ch.delta.toFixed(6)}</span>`
      : '<span class="text-amber-300">changed</span>';
    const wide = v.val.t === 'obj' && !v.ref;
    return `<div class="bg-slate-900/90 rounded-xl p-3 border ${ch ? 'border-amber-400/70 ring-1 ring-amber-400/40' : 'border-slate-700/70'} flex flex-col transition ${wide ? 'col-span-2' : ''}" data-cid="${v.ref ? '' : v.id}">
      <span class="text-[11px] uppercase tracking-wider text-${color}-400 font-semibold mb-1 flex justify-between gap-2"><span>${esc(v.name)} <span class="normal-case tracking-normal text-slate-500 font-mono font-normal">${esc(v.ty || '')}</span></span>${badge ? `<span class="normal-case tracking-normal font-mono">${badge}</span>` : ''}</span>
      <div class="flex ${v.val.t === 'ptr' ? 'flex-col' : 'items-baseline justify-between'} gap-x-2 min-w-0">
        <span class="${v.val.t === 'ptr' ? 'text-base break-all' : 'text-2xl truncate'} font-bold code-font text-${color}-300" ${v.val.t === 'ptr' && v.val.tid ? `data-tid="${v.val.tid}"` : ''}>${big}</span>
        <span class="text-xs text-slate-400 code-font ${v.val.t === 'ptr' ? '' : 'text-right'}">${sub}</span>
      </div>
      ${wide ? `<div class="mt-2">${valHTML(v.val)}</div>` : ''}
      ${show.addr && v.addr != null ? `<span class="text-[10px] font-mono text-sky-300/80 mt-1">&${esc(v.name)} = ${hex(v.addr)}</span>` : ''}
    </div>`;
  }
  function lookupDeep(s, label) {
    for (const e of flat.values()) if (e.label === label) return e.d;
    const v = lookup(s, label);
    return v && v.val;
  }

  function comparisonCard(s) {
    const c = comparison(s);
    return `<div class="bg-slate-900/90 rounded-xl p-3 border border-slate-700/70 flex flex-col justify-between">
      <span class="text-[11px] uppercase tracking-wider text-purple-400 font-semibold mb-1">Active Comparison</span>
      <div class="text-xs font-mono text-purple-200 font-medium py-1">${c
        ? `<span class="${c.result ? 'text-emerald-400' : 'text-rose-400'} font-bold">${esc(c.expr)}</span><br><span class="text-slate-300">${esc(c.values)}</span><br><span class="text-[11px] text-slate-400">Result: ${c.result ? 'TRUE' : 'FALSE'} (${esc(c.then)})</span>`
        : '<span class="text-slate-500 italic">No active comparison</span>'}</div>
    </div>`;
  }

  function stackAndHeap(s) {
    let h = '';
    const waiting = s.frames.slice(0, -1).reverse();
    if (waiting.length) {
      h += `<div class="mt-4"><div class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2"><i class="fa-solid fa-layer-group mr-1"></i> Waiting function calls (call stack)</div>${waiting.map((f, i) => `
        <div class="bg-slate-900/60 rounded-lg px-3 py-2 border border-slate-700/50 mb-2 text-xs"><span class="font-semibold text-slate-200">${esc(f.label)}()</span> <span class="text-slate-500">waiting for line ${s.frames[s.frames.length - 1 - i].callLine} to return</span>
        <div class="flex flex-wrap gap-1.5 mt-1">${f.vars.filter(v => !v.isThis).map(v => `<span class="bg-slate-800 rounded px-1.5 py-0.5" data-cid="${v.ref ? '' : v.id}"><span class="text-indigo-300">${esc(v.name)}</span> ${v.ref ? '📎 ' + esc(v.ref) : valHTML(v.val)}${addr(v.ref ? null : v.addr)}</span>`).join('') || '<span class="text-slate-500">no variables</span>'}</div></div>`).join('')}</div>`;
    }
    if (s.heap.length) {
      h += `<div class="mt-4"><div class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2"><i class="fa-solid fa-cubes mr-1"></i> Heap (memory made with <code>new</code>)</div><div class="flex flex-wrap gap-2">${s.heap.map(hp => (hp.freed
        ? `<span class="bg-slate-900/60 border border-dashed border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-500 line-through">#${hp.hid} deleted${addr(hp.addr)}</span>`
        : `<span class="bg-slate-900/90 border ${changeOf(hp.id) ? 'border-amber-400/70' : 'border-slate-700'} rounded-lg px-2 py-1 text-xs" data-cid="${hp.id}"><span class="text-indigo-300 font-semibold">#${hp.hid}</span> <span class="text-slate-500">${esc(hp.ty || '')}</span> ${valHTML(hp.val)} ${addr(hp.addr)}</span>`)).join('')}</div></div>`;
    }
    return h;
  }

  function narrative(s) {
    const prev = k > 0 ? R.steps[k - 1] : null;
    let h = '';
    if (!prev) h += `<p>The program starts at <code class="text-indigo-300">main()</code>. Press <b>Step</b> to run line <b>${s.line}</b>, or <b>Auto</b> to play it.</p>`;
    else {
      h += `<p class="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Line ${prev.line} just ran</p><pre class="code-font text-xs bg-slate-950/60 rounded-lg px-3 py-2 mb-3 whitespace-pre-wrap">${window.BTC.codeHTML((lines[prev.line - 1] || '').trim())}</pre>`;
      const c = comparison(s);
      const items = s.did.map(d => {
        if (typeof d !== 'string') return `🖥 Printed <code class="bg-black text-emerald-300 px-1 rounded">${esc(showNL(d.print))}</code>`;
        if (c && d.startsWith(`(${c.expr})`)) return `<strong>Comparison:</strong> <code>${esc(c.expr)}</code> becomes <code>${esc(c.values)}</code>, which is <code class="${c.result ? 'text-emerald-400' : 'text-rose-400'}">${c.result ? 'TRUE' : 'FALSE'}</code>, so ${esc(c.then)}.`;
        return esc(d).replace(/\b([A-Za-z_]\w*(?:\[\d+\])?) = (\S+)/g, '<code>$1</code> = <strong>$2</strong>');
      });
      h += items.length ? `<ul class="space-y-1.5 list-disc pl-5">${items.map(x => `<li>${x}</li>`).join('')}</ul>` : '<p class="text-slate-400">Nothing changed on this line.</p>';
    }
    if (s.temp) h += `<p class="mt-2 text-emerald-300">↩ The function handed back <strong>${esc(plainVal(s.temp.val))}</strong> to line ${s.temp.line}.</p>`;
    if (s.kind === 'error') h += `<div class="mt-3 bg-rose-950/60 border border-rose-700/60 text-rose-200 rounded-lg p-3"><strong>💥 The program crashes on line ${s.line}.</strong> ${esc(s.note || '')}</div>`;
    else if (s.kind === 'exit') h += '<div class="mt-3 bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 rounded-lg p-3"><strong>✅ Program finished!</strong></div>';
    else if (prev) h += `<p class="mt-3 text-slate-400 text-xs">Next up: line <b class="text-indigo-300">${s.line}</b></p>`;
    return h;
  }

  function changeList(s) {
    const prev = k > 0 ? R.steps[k - 1] : null;
    if (!prev) return '<p class="text-slate-500 italic text-sm">Nothing has run yet.</p>';
    const row = (icon, color, html) => `<li class="flex items-baseline gap-2 bg-slate-900/80 rounded-lg px-3 py-1.5 border-l-4 border-${color}-500"><span class="text-${color}-400 font-bold w-4 text-center">${icon}</span><span>${html}</span></li>`;
    const nm = e => `<code class="text-indigo-300">${esc(e.label)}</code>`;
    const old = t => `<span class="line-through text-slate-500 font-mono">${esc(t)}</span>`;
    const items = changes.map(c => {
      const e = c.e;
      switch (c.kind) {
        case 'add': return row('+', 'emerald', `${nm(e)} created${isLeaf(e.d) && e.d.t !== 'u' ? ` = ${valHTML(e.d)}` : e.d.t === 'u' ? ' (no value yet)' : ''} ${addr(e.addr)}`);
        case 'init': return row('✎', 'indigo', `${nm(e)} got its first value ${valHTML(e.d)}`);
        case 'up': return row('▲', 'sky', `${nm(e)} increased ${old(c.from.text)} → ${valHTML(e.d)}`);
        case 'down': return row('▼', 'amber', `${nm(e)} decreased ${old(c.from.text)} → ${valHTML(e.d)}`);
        case 'ptr': return row('➜', 'violet', `${nm(e)} now ${e.d.dangling ? 'holds a dangling address' : e.d.target ? `points to <strong>${esc(e.d.target)}</strong>` : 'is nullptr'}`);
        case 'set': return row('✎', 'indigo', `${nm(e)} changed ${old(c.from.text)} → ${valHTML(e.d)}`);
        case 'free': return row('🗑', 'rose', `${nm(e)} deleted (memory given back)`);
        case 'gone': return row('✕', 'rose', `${nm(e)} removed (its function or block ended)`);
      }
      return '';
    });
    if (s.out.length > prev.out.length) items.push(row('🖥', 'emerald', `printed <code class="bg-black text-emerald-300 px-1 rounded">${esc(showNL(s.out.slice(prev.out.length)))}</code>`));
    return items.length ? `<ul class="space-y-1.5 text-sm">${items.join('')}</ul>` : '<p class="text-slate-500 italic text-sm">No values changed on this step.</p>';
  }

  function memoryTable(s) {
    const groups = {};
    flat.forEach(e => { const g = e.where === 'heap' ? 'Heap' : e.where === 'globals' ? 'Globals' : `Stack: ${e.where}`; (groups[g] = groups[g] || []).push(e); });
    const keys = Object.keys(groups);
    if (!keys.length) return '<p class="text-slate-500 italic text-sm">Nothing in memory yet.</p>';
    return `<div class="overflow-x-auto"><table class="w-full text-xs code-font"><thead><tr class="text-slate-400 text-left"><th class="py-1 pr-3">Address</th><th class="pr-3">Name</th><th class="pr-3">Value</th><th>Type</th></tr></thead>${keys.map(g => `<tbody><tr><td colspan="4" class="pt-3 pb-1 text-[11px] uppercase tracking-wider text-slate-400 font-sans font-semibold">${esc(g)}</td></tr>${groups[g].map(e => `
      <tr class="border-t border-slate-800 ${changeOf(e.id) ? 'bg-amber-500/10' : ''}" data-cid="${e.id}"><td class="py-1 pr-3 text-sky-300">${hex(e.addr)}</td><td class="pr-3 text-indigo-300" style="padding-left:${e.depth * 0.8}rem">${esc(e.depth ? e.label.slice(Math.max(e.label.lastIndexOf('.'), e.label.lastIndexOf('['))) : e.label)}</td><td class="pr-3">${isLeaf(e.d) ? valHTML(e.d) : `<span class="text-slate-500">${e.size ? e.size + ' bytes' : ''}</span>`}</td><td class="text-purple-300">${esc(e.ty || '')}</td></tr>`).join('')}</tbody>`).join('')}</table></div>`;
  }

  function outputHTML(s) {
    return s.out ? s.out.split('\n').map((l, i, a) => (i === a.length - 1 && l === '' ? '' : `<div class="whitespace-pre-wrap">${esc(l) || '&nbsp;'}</div>`)).join('') : '<div class="text-slate-600">(nothing printed yet)</div>';
  }

  // ---------- layout ----------
  const card = 'bg-slate-800/90 rounded-2xl border border-slate-700/80 shadow-xl';
  function fileName() {
    if (!meta.title || meta.title === 'Your program' || meta.title === 'Shared program') return 'main.cpp';
    return meta.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 32) + '.cpp';
  }
  function view() {
    const app = document.getElementById('app');
    app.innerHTML = `
    <div class="viewer bg-slate-900 text-slate-100 min-h-screen flex flex-col overflow-x-hidden font-sans">
      <header class="bg-slate-800/80 backdrop-blur-md border-b border-slate-700/60 px-4 md:px-6 py-4 flex items-center justify-between gap-3 flex-wrap shrink-0 shadow-sm">
        <div class="flex items-center space-x-3 min-w-0">
          <button data-act="home" title="Back to all programs" class="bg-indigo-600 hover:bg-indigo-500 p-2.5 rounded-xl text-white shadow-lg shadow-indigo-500/30 flex items-center justify-center"><i class="fa-solid fa-bug text-lg"></i></button>
          <div class="min-w-0">
            <h1 class="text-lg font-bold tracking-tight text-white flex items-center gap-2 flex-wrap">${esc(meta.title || 'Your program')}
              <span class="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30 font-normal">C++ Visual Debugger</span></h1>
            <p class="text-xs text-slate-400">${esc(meta.section || 'Step through your code line by line')}</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <button data-act="home" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 border border-slate-600"><i class="fa-solid fa-list text-indigo-400"></i> Programs</button>
          <button data-act="edit" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 border border-slate-600"><i class="fa-solid fa-pen text-indigo-400"></i> Edit code</button>
          <div class="relative">
            <button data-act="viewmenu" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 border border-slate-600"><i class="fa-solid fa-sliders text-indigo-400"></i> Show / hide</button>
            <div id="viewmenu" class="hidden absolute right-0 mt-2 w-60 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-2 z-40">
              ${OPTIONS.map(([key, label]) => `<label class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 text-sm cursor-pointer"><input type="checkbox" data-tog="${key}" class="accent-indigo-500 w-4 h-4" ${show[key] ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
            </div>
          </div>
          <button data-act="share" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 border border-slate-600"><i class="fa-solid fa-link text-indigo-400"></i> <span>Share</span></button>
          <button data-act="help" class="text-xs bg-slate-700 hover:bg-slate-600 text-slate-200 px-3 py-2 rounded-lg font-medium transition flex items-center gap-1.5 border border-slate-600"><i class="fa-solid fa-circle-question text-indigo-400"></i> Help & Guide</button>
        </div>
      </header>
      ${meta.watch ? `<div class="max-w-7xl w-full mx-auto px-4 md:px-6 pt-4"><div class="bg-indigo-950/50 border border-indigo-700/40 text-indigo-100 rounded-xl px-4 py-2.5 text-sm"><i class="fa-solid fa-eye text-indigo-400 mr-1.5"></i><strong>Watch for:</strong> ${esc(meta.watch)}</div></div>` : ''}

      <main class="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-7 flex flex-col space-y-6 min-w-0">
          <div class="${card} overflow-hidden flex flex-col">
            <div class="bg-slate-800/90 px-4 py-3 border-b border-slate-700/60 flex items-center justify-between gap-2">
              <div class="flex items-center space-x-2 min-w-0">
                <div class="flex space-x-1.5 shrink-0"><div class="w-3 h-3 rounded-full bg-rose-500/80"></div><div class="w-3 h-3 rounded-full bg-amber-500/80"></div><div class="w-3 h-3 rounded-full bg-emerald-500/80"></div></div>
                <span class="text-xs font-mono text-slate-400 ml-2 truncate">${esc(fileName())}</span>
              </div>
              <div id="fnchip" class="text-xs font-mono text-indigo-400 font-semibold bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-800/50 shrink-0"></div>
            </div>
            <div id="code" class="p-3 md:p-4 bg-slate-950/60 code-font text-xs md:text-sm overflow-auto leading-relaxed text-slate-300 max-h-[60vh]"></div>
          </div>
          <div id="arraycard" class="${card} p-5 flex flex-col">
            <div id="arrays"></div>
            <div class="bg-slate-900/80 rounded-xl p-3 border border-slate-700/50 text-xs text-slate-300 flex flex-col sm:flex-row items-center justify-between gap-2 mt-4">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="bg-indigo-900/60 text-indigo-300 font-mono px-2 py-1 rounded border border-indigo-700/40">Index vs Value</span>
                <span>Index is the <span class="text-amber-300 font-semibold">box number</span>. Value is the <span class="text-emerald-300 font-semibold">number inside</span>.</span>
              </div>
            </div>
          </div>
          <div id="outputcard" class="${card} overflow-hidden">
            <div class="px-4 py-3 border-b border-slate-700/60 flex items-center gap-2"><i class="fa-solid fa-terminal text-indigo-400 text-sm"></i><span class="text-sm font-semibold text-slate-200">Output</span></div>
            <div id="output" class="p-4 bg-black/70 code-font text-sm text-emerald-300 max-h-60 overflow-auto"></div>
          </div>
        </div>

        <div class="lg:col-span-5 flex flex-col space-y-6 min-w-0">
          <div class="${card} p-5 flex flex-col">
            <h3 class="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
              <span class="flex items-center gap-2"><i class="fa-solid fa-glasses text-indigo-400"></i> Live Variable Watcher</span>
              <span id="step-counter" class="text-xs font-mono bg-slate-900 text-indigo-300 px-2.5 py-1 rounded-full border border-slate-700"></span>
            </h3>
            <div id="watcher-wrap">
              <div id="watcher" class="grid grid-cols-2 gap-3 mb-1"></div>
              <div id="stackheap"></div>
            </div>
            <div class="grid grid-cols-4 gap-2 pt-3 mt-3 border-t border-slate-700/60">
              <button data-act="back" id="btn-prev" title="Step back (←)" class="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 disabled:hover:bg-slate-700 text-slate-200 font-medium py-2.5 px-3 rounded-xl transition flex flex-col items-center justify-center text-xs gap-1 shadow-sm"><i class="fa-solid fa-backward-step"></i><span>Back</span></button>
              <button data-act="next" id="btn-next" title="Step forward (→)" class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white font-semibold py-2.5 px-3 rounded-xl transition flex flex-col items-center justify-center text-xs gap-1 shadow-md shadow-indigo-600/30"><i class="fa-solid fa-forward-step"></i><span>Step</span></button>
              <button data-act="auto" id="btn-autoplay" title="Auto play (Space)" class="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-3 rounded-xl transition flex flex-col items-center justify-center text-xs gap-1 shadow-md shadow-emerald-600/30"><i id="autoplay-icon" class="fa-solid fa-play"></i><span id="autoplay-text">Auto</span></button>
              <button data-act="restart" title="Reset" class="bg-rose-950/80 hover:bg-rose-900 text-rose-200 font-medium py-2.5 px-3 rounded-xl transition flex flex-col items-center justify-center text-xs gap-1 border border-rose-800/50 shadow-sm"><i class="fa-solid fa-rotate-right"></i><span>Reset</span></button>
            </div>
            <div class="flex items-center gap-3 mt-3">
              <input type="range" id="scrub" min="0" max="${R.steps.length - 1}" value="0" class="flex-1 accent-indigo-500" aria-label="Jump to step">
              <select id="speed" class="bg-slate-900 border border-slate-700 rounded-lg text-xs px-2 py-1" aria-label="Auto speed">${Object.keys(SPEEDS).map(sp => `<option value="${sp}"${sp === speed ? ' selected' : ''}>${sp}</option>`).join('')}</select>
            </div>
          </div>

          <div id="logcard" class="${card} p-5 flex flex-col min-h-[180px]">
            <h3 class="text-sm font-semibold text-slate-200 mb-3 flex items-center justify-between">
              <span class="flex items-center gap-2"><i class="fa-solid fa-book-open-reader text-indigo-400"></i> Plain-English Narrative Log</span>
              <span class="text-[11px] text-slate-400 font-normal">Why did this happen?</span>
            </h3>
            <div id="narrative-log" class="bg-slate-900/90 rounded-xl p-4 border border-slate-700/70 text-sm text-slate-300 leading-relaxed flex-1"></div>
          </div>

          <div id="changescard" class="${card} p-5">
            <h3 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><i class="fa-solid fa-code-compare text-indigo-400"></i> What Changed</h3>
            <div id="changes"></div>
          </div>
        </div>

        <div id="memorycard" class="lg:col-span-12 ${card} p-5">
          <h3 class="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2"><i class="fa-solid fa-memory text-indigo-400"></i> Memory Map <span class="text-[11px] text-slate-400 font-normal">every box in memory with its address</span></h3>
          <div id="memory"></div>
        </div>
      </main>

      <div id="info-modal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 hidden">
        <div class="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative text-slate-200">
          <button data-act="closehelp" class="absolute top-4 right-4 text-slate-400 hover:text-white transition text-lg w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center"><i class="fa-solid fa-xmark"></i></button>
          <h3 class="text-lg font-bold text-white mb-3 flex items-center gap-2"><i class="fa-solid fa-graduation-cap text-indigo-400"></i> How to read this debugger</h3>
          <div class="space-y-3 text-xs md:text-sm text-slate-300 leading-relaxed">
            <p>Press <strong>Step</strong> (or →) to run one line, <strong>Back</strong> (or ←) to undo it, <strong>Auto</strong> (or Space) to play. The <span class="text-indigo-300 font-semibold">highlighted line</span> is the one about to run.</p>
            <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700 space-y-2">
              <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0"></span><span><strong>Index</strong> (<code>i</code>, <code>start</code>, <code>maxIndex</code>): <em>where</em> you are looking in the array, the box number.</span></div>
              <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0"></span><span><strong>Value</strong> (<code>v[index]</code>): <em>what number</em> is inside that box.</span></div>
              <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-violet-400 shrink-0"></span><span><strong>Pointer</strong> (<code>int* p</code>): holds an <em>address</em>. Hover it to light up what it points at.</span></div>
              <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0"></span><span><strong>Address</strong> (<code>&amp;x</code>): where a variable lives in memory. Turn on <em>Memory addresses</em> in Show / hide.</span></div>
            </div>
            <p>🚩 marks a line that called a function and is waiting for it to return. Use <strong>Show / hide</strong> to pick which panels you want to see.</p>
          </div>
          <div class="mt-6 flex justify-end"><button data-act="closehelp" class="bg-indigo-600 hover:bg-indigo-500 text-white font-medium px-5 py-2 rounded-xl text-sm transition">Got it, let's debug!</button></div>
        </div>
      </div>
    </div>`;
    const root = app.querySelector('.viewer');
    root.addEventListener('click', onClick);
    root.addEventListener('change', e => { const t = e.target.closest('[data-tog]'); if (t) { show[t.dataset.tog] = t.checked; saveView(); render(); } });
    root.addEventListener('mouseover', onHover);
    root.addEventListener('mouseout', onHover);
    document.getElementById('scrub').addEventListener('input', e => { stopAuto(); go(+e.target.value); });
    document.getElementById('speed').addEventListener('change', e => { speed = e.target.value; saveView(); if (autoTimer) { stopAuto(); toggleAuto(); } });
    window.scrollTo(0, 0);
  }

  function render() {
    const s = R.steps[k];
    const top = s.frames[s.frames.length - 1];
    const $ = id => document.getElementById(id);
    $('code').innerHTML = codeLines(s);
    $('fnchip').textContent = s.kind === 'exit' ? 'Finished' : top ? `Running: ${top.label}()` : '';
    const arrays = show.arrays ? arrayCards(s) : '';
    $('arraycard').hidden = !arrays;
    if (arrays) $('arrays').innerHTML = arrays;
    $('watcher-wrap').hidden = !show.watcher;
    if (show.watcher) {
      $('watcher').innerHTML = watcherCards(s) + comparisonCard(s);
      $('stackheap').innerHTML = stackAndHeap(s);
    }
    $('logcard').hidden = !show.log;
    if (show.log) $('narrative-log').innerHTML = narrative(s);
    $('changescard').hidden = !show.changes;
    if (show.changes) $('changes').innerHTML = changeList(s);
    $('outputcard').hidden = !show.output;
    if (show.output) $('output').innerHTML = outputHTML(s);
    $('memorycard').hidden = !show.memory;
    if (show.memory) $('memory').innerHTML = memoryTable(s);
    $('step-counter').textContent = `Step ${k + 1} / ${R.steps.length}`;
    $('scrub').value = k;
    $('btn-prev').disabled = k === 0;
    $('btn-next').disabled = k === R.steps.length - 1;
    $('autoplay-icon').className = autoTimer ? 'fa-solid fa-pause' : 'fa-solid fa-play';
    $('autoplay-text').textContent = autoTimer ? 'Pause' : 'Auto';
    const codeEl = $('code');
    const cur = codeEl.querySelector('.bg-indigo-900\\/60, .bg-rose-900\\/50');
    if (cur) {
      const y = cur.offsetTop - codeEl.offsetTop, h = codeEl.clientHeight;
      if (y < codeEl.scrollTop + 20 || y > codeEl.scrollTop + h - 40) codeEl.scrollTo({ top: y - h / 3, behavior: autoTimer ? 'auto' : 'smooth' });
    }
  }

  // ---------- navigation ----------
  function go(i) {
    if (i < 0 || i >= R.steps.length) return;
    k = i;
    flat = flatten(R.steps[k]);
    changes = diff(k > 0 ? flatten(R.steps[k - 1]) : null, flat, R.steps[k]);
    render();
    if (k === R.steps.length - 1) stopAuto();
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    const ic = document.getElementById('autoplay-icon');
    if (ic) { ic.className = 'fa-solid fa-play'; document.getElementById('autoplay-text').textContent = 'Auto'; }
  }
  function toggleAuto() {
    if (autoTimer) return stopAuto();
    if (k === R.steps.length - 1) go(0);
    autoTimer = setInterval(() => (k >= R.steps.length - 1 ? stopAuto() : go(k + 1)), SPEEDS[speed]);
    render();
  }

  function onClick(e) {
    const menu = document.getElementById('viewmenu');
    if (menu && !e.target.closest('#viewmenu') && !e.target.closest('[data-act="viewmenu"]')) menu.classList.add('hidden');
    const act = e.target.closest('[data-act]');
    if (!act) return;
    const a = act.dataset.act;
    if (a === 'next') { stopAuto(); return go(k + 1); }
    if (a === 'back') { stopAuto(); return go(k - 1); }
    if (a === 'restart') { stopAuto(); return go(0); }
    if (a === 'auto') return toggleAuto();
    if (a === 'viewmenu') return menu.classList.toggle('hidden');
    if (a === 'help') return document.getElementById('info-modal').classList.remove('hidden');
    if (a === 'closehelp') return document.getElementById('info-modal').classList.add('hidden');
    if (a === 'home' || a === 'edit') {
      stopAuto();
      if (a === 'edit') window.BTC.save({ c: code, i: input });
      try { history.replaceState(null, '', location.pathname); } catch {}
      window.BTC.home();
      if (a === 'edit') { const src = document.getElementById('src'); if (src) { src.scrollIntoView({ block: 'center' }); src.focus(); } }
      return;
    }
    if (a === 'share') {
      const url = location.origin + location.pathname + (meta.id ? '#ex=' + meta.id : '#code=' + enc({ c: code, i: input })) + (k ? '@' + k : '');
      const label = act.querySelector('span');
      const ok = () => { label.textContent = 'Link copied'; setTimeout(() => (label.textContent = 'Share'), 1800); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, () => prompt('Copy this link:', url));
      else prompt('Copy this link:', url);
    }
  }

  // Hovering a pointer lights up what it points at.
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
    else if (e.key === 'Escape') document.getElementById('info-modal')?.classList.add('hidden');
  });

  window.Tracer = { open, openShared };
})();
