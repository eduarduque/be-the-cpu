(() => {
  const LEVELS = window.LEVELS;
  const app = document.getElementById('app');
  const STORE = 'be-the-cpu:v1';
  const loadProgress = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const saveProgress = p => { try { localStorage.setItem(STORE, JSON.stringify(p)); } catch {} };
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));

  // ---------- syntax ----------
  const TYPES = new Set(['int', 'void', 'string', 'bool', 'double', 'char', 'auto']);
  const KW = new Set(['return', 'if', 'else', 'class', 'struct', 'public', 'private', 'const', 'using', 'namespace', 'for', 'while', 'new', 'delete', 'true', 'false', 'this']);
  const LIB = new Set(['cout', 'endl', 'std', 'cin']);

  function tokenize(src) {
    if (/^\s*#/.test(src)) return [{ t: src, k: 'pre' }];
    const re = /("(?:[^"\\]|\\.)*")|(\/\/.*)|([A-Za-z_]\w*)|(\d+)|(\s+)|(<<|>>|==|&&|\|\||::|.)/g;
    const out = [];
    let m;
    while ((m = re.exec(src))) {
      const t = m[0];
      const k = m[1] ? 'str' : m[2] ? 'com' : m[3] ? (TYPES.has(t) ? 'type' : KW.has(t) ? 'kw' : LIB.has(t) ? 'lib' : 'id') : m[4] ? 'num' : m[5] ? 'ws' : 'op';
      out.push({ t, k });
    }
    const seen = {};
    for (const tk of out) if (tk.k !== 'ws') tk.occ = seen[tk.t] = (seen[tk.t] || 0) + 1;
    return out;
  }

  // ---------- machine state ----------
  const fresh = () => ({ line: null, frames: [], out: [], temp: null });

  function findVar(st, name) {
    for (let k = st.frames.length - 1; k >= 0; k--) {
      const v = st.frames[k].vars.find(v => v.name === name);
      if (v) return { k, v };
    }
    return null;
  }

  function apply(st, [op, ...a]) {
    const top = st.frames[st.frames.length - 1];
    const setVar = (f, name, value, anchor) => {
      const v = f.vars.find(v => v.name === name);
      if (v) v.value = clone(value);
      else f.vars.push({ name, value: clone(value), anchor });
    };
    switch (op) {
      case 'goto': st.line = a[0]; break;
      case 'push': st.frames.push({ fn: a[0], callLine: a[1], vars: [] }); break;
      case 'set': setVar(top, a[0], a[1], a[2]); break;
      case 'setin': setVar(st.frames[a[0]], a[1], a[2], a[3]); break;
      case 'field': findVar(st, a[0]).v.value.fields[a[1]] = clone(a[2]); break;
      case 'ret': { const f = st.frames.pop(); st.temp = { value: a[0], line: f.callLine }; break; }
      case 'pop': st.frames.pop(); break;
      case 'cleartemp': st.temp = null; break;
      case 'print': st.out.push(a[0]); break;
      default: throw new Error('Unknown op ' + op);
    }
  }

  function stateAt(i) {
    const st = fresh();
    for (let j = 0; j < i; j++) (L.steps[j].do || []).forEach(o => apply(st, o));
    return st;
  }

  const plain = v => (v && typeof v === 'object' ? (v.ref ? '→ ' + v.ref : v.obj || '') : v == null ? 'empty' : String(v));

  // ---------- game state ----------
  let L, lines, toks, idx, mistakes, feedback, revealed, busy, state, board, screenEl;

  function startLevel(i) {
    L = LEVELS[i];
    L.index = i;
    lines = L.code.split('\n');
    toks = lines.map(tokenize);
    idx = 0; mistakes = 0; feedback = ''; revealed = false; busy = false;
    state = fresh();
    const width = Math.max(...lines.map(l => l.length)) + 2;
    app.innerHTML = `
      <div class="level">
        <header class="topbar">
          <button class="ghostbtn" data-act="home">← Levels</button>
          <div class="ttl"><span class="lvnum">Level ${i + 1}</span> ${esc(L.title)} <small>${esc(L.concept)}</small></div>
          <div class="meters">
            <div class="prog" title="Progress"><div id="progfill"></div></div>
            <span class="miss" id="miss" title="Mistakes and hints">✗ 0</span>
          </div>
        </header>
        <div class="legend">
          <span><span class="cpu">CPU</span> you are here</span>
          <span>📋 clipboard (stack frame)</span>
          <span>📦 value</span>
          <span>🚩 return here</span>
          <span>🔒 private</span>
        </div>
        <main class="board" id="board" style="--codew:${width}ch"></main>
        <section class="screen">
          <div class="screen-h">🖥 Screen</div>
          <div id="screen"></div>
        </section>
      </div>`;
    board = document.getElementById('board');
    screenEl = document.getElementById('screen');
    board.addEventListener('click', onBoardClick);
    app.querySelector('[data-act="home"]').onclick = home;
    render();
    window.scrollTo(0, 0);
  }

  // ---------- rendering ----------
  function regionOf(n) {
    let best = null;
    for (const r of L.regions) if (n >= r.start && n <= r.end && (!best || r.end - r.start < best.end - best.start)) best = r;
    return best;
  }

  function valHTML(v, path) {
    if (v && typeof v === 'object') {
      if (v.ref) return `<span class="ref">📎 ${esc(v.ref)}</span>`;
      if (v.obj) {
        const fields = Object.entries(v.fields).map(([f, fv]) =>
          `<span class="field" data-field="${esc(path + '.' + f)}">${(v.priv || []).includes(f) ? '🔒' : ''}<i>${esc(f)}</i>${fv == null ? '<span class="empty">empty</span>' : `<span class="val">${esc(fv)}</span>`}</span>`).join('');
        return `<span class="obj"><span class="objtag">🏠 ${esc(v.obj)}</span>${fields}</span>`;
      }
    }
    return `<span class="val">${esc(v)}</span>`;
  }

  function bubbleHTML() {
    const step = L.steps[idx];
    const said = idx === 0 ? `<div class="said intro">${L.intro}</div>` : L.steps[idx - 1].say ? `<div class="said">✓ ${L.steps[idx - 1].say}</div>` : '';
    if (!step) return `<div class="bubble">${said}</div>`;
    const ask = step.ask;
    const prompt = step.prompt || (ask.type === 'line' ? 'Which line runs next?' : '');
    const carry = step.carry ? `<span class="carry">📦 ${esc(step.carry)}</span>` : '';
    const how = ask.type === 'line' ? '<span class="how">👆 tap a line</span>' : ask.type === 'tok' ? '<span class="how">👆 tap a word in the code</span>' : '';
    const choices = ask.type === 'choice'
      ? `<div class="choices">${ask.options.map((o, i) => `<button class="choice${revealed && i === ask.answer ? ' reveal' : ''}" data-choice="${i}">${o}</button>`).join('')}</div>`
      : '';
    return `<div class="bubble" id="bubble">
      ${said}
      ${feedback ? `<div class="fb">${feedback}</div>` : ''}
      <div class="prompt">${carry}<span>${prompt}</span> ${how}</div>
      ${choices}
      <div class="tools">
        <button class="ghostbtn" data-act="hint">💡 Show me</button>
        <button class="ghostbtn" data-act="undo" ${idx === 0 ? 'disabled' : ''}>↶ Undo</button>
      </div>
    </div>`;
  }

  function render() {
    const st = state;
    const top = st.frames[st.frames.length - 1];
    const topFn = top && top.fn;
    const live = new Set(st.frames.map(f => f.fn));
    const step = L.steps[idx];
    const ask = step && step.ask;
    const flags = {};
    st.frames.forEach(f => { if (f.callLine != null) flags[f.callLine] = (flags[f.callLine] || 0) + 1; });
    const hidden = st.frames.filter((f, k) => k < st.frames.length - 1 && f.fn === topFn);

    let html = st.line == null ? `<div class="bubblerow top">${bubbleHTML()}</div>` : '';
    lines.forEach((src, i) => {
      const n = i + 1;
      const r = regionOf(n);
      let cls = 'row';
      if (!r) cls += ' outside';
      else if (r.kind === 'class') cls += ' blueprint';
      else if (r.fn === topFn) cls += ' active';
      else if (live.has(r.fn)) cls += ' waiting';
      else cls += ' idle';
      if (r && r.start === n) cls += ' rstart';
      if (r && r.end === n) cls += ' rend';
      if (st.line === n) cls += ' current';
      if (ask && ask.type === 'line') cls += ' pickable';
      if (ask && ask.type === 'tok') cls += ' tokpick';

      const gut = `<span class="ln">${n}</span>${st.line === n ? '<span class="cpu">CPU</span>' : ''}${flags[n] ? `<span class="flag" title="A call is waiting here for its function to return">🚩${flags[n] > 1 ? '×' + flags[n] : ''}</span>` : ''}`;
      const code = toks[i].map(tk => tk.k === 'ws' ? tk.t : `<span class="tk t-${tk.k}" data-t="${esc(tk.t)}" data-occ="${tk.occ}">${esc(tk.t)}</span>`).join('');

      let ann = '';
      if (r && r.start === n) {
        if (r.fn && live.has(r.fn)) ann += `<span class="clip ${r.fn === topFn ? 'on' : ''}">📋 ${esc(r.fn)}()${r.fn === topFn ? '' : ' · waiting'}</span>`;
        else if (r.label) ann += `<span class="rlabel">${r.label}</span>`;
      }
      st.frames.forEach((f, k) => {
        const isTop = k === st.frames.length - 1;
        if (!isTop && f.fn === topFn) return;
        f.vars.filter(v => v.anchor === n).forEach(v => {
          ann += `<span class="var${isTop ? '' : ' dim'}" data-frame="${k}" data-name="${esc(v.name)}" title="${isTop ? '' : 'Still alive, but not visible from the current function'}"><b>${esc(v.name)}</b>${valHTML(v.value, v.name)}</span>`;
        });
      });
      if (hidden.length && r && r.fn === topFn && r.start === n) {
        ann += `<span class="stackbadge" title="Earlier calls of this same function, waiting underneath">📋×${hidden.length} below: ${hidden.map(f => f.vars.map(v => `${esc(v.name)}=${esc(plain(v.value))}`).join(', ')).join(' · ')}</span>`;
      }
      if (st.temp && st.temp.line === n) ann += `<span class="temp">📦 returned <span class="val">${esc(st.temp.value)}</span></span>`;

      html += `<div class="${cls}" data-line="${n}"><div class="gut">${gut}</div><div class="code">${code || ' '}</div><div class="ann">${ann}</div></div>`;
      if (st.line === n) html += `<div class="bubblerow">${bubbleHTML()}</div>`;
    });

    board.innerHTML = html;
    screenEl.innerHTML = st.out.length ? st.out.map(o => `<div class="outline">${esc(o)}</div>`).join('') : '<div class="outline muted">(nothing printed yet)</div>';
    document.getElementById('progfill').style.width = `${(idx / L.steps.length) * 100}%`;
    document.getElementById('miss').textContent = `✗ ${mistakes}`;
    if (revealed && ask) revealTargets(ask);
  }

  function tokEl(line, t, occ = 1) {
    return board.querySelector(`.row[data-line="${line}"] .tk[data-t="${CSS.escape(t)}"][data-occ="${occ}"]`);
  }

  function revealTargets(ask) {
    if (ask.type === 'line') board.querySelector(`.row[data-line="${ask.line}"]`)?.classList.add('reveal');
    if (ask.type === 'tok') ask.ans.forEach(a => tokEl(a.line, a.t, a.occ)?.classList.add('reveal'));
  }

  function scrollToCurrent() {
    const b = document.getElementById('bubble');
    if (!b) return;
    const r = b.getBoundingClientRect();
    if (r.bottom > innerHeight - 140 || r.top < 0) b.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // ---------- parcels ----------
  function elOf(spec, st) {
    if (spec.tok) return tokEl(spec.tok[0], spec.tok[1], spec.tok[2] || 1);
    if (spec.var) { const f = findVar(st, spec.var); return f && board.querySelector(`.var[data-frame="${f.k}"][data-name="${CSS.escape(spec.var)}"]`); }
    if (spec.field) return board.querySelector(`[data-field="${CSS.escape(spec.field)}"]`);
    if (spec.temp) return board.querySelector('.temp');
    if (spec.out) return screenEl.lastElementChild || screenEl;
    return null;
  }

  function flyValue(step) {
    if (step.carry) return step.carry;
    for (const [op, ...a] of step.do || []) {
      if (op === 'set') return plain(a[1]);
      if (op === 'setin' || op === 'field') return plain(a[2]);
      if (op === 'print' || op === 'ret') return plain(a[0]);
    }
    return '';
  }

  function flyGhost(src, dstEl, text) {
    const d = dstEl.getBoundingClientRect();
    dstEl.classList.add('arriving');
    const g = document.createElement('div');
    g.className = 'ghost';
    g.textContent = '📦 ' + text;
    document.body.appendChild(g);
    const w = g.offsetWidth, h = g.offsetHeight;
    const sx = src.left + src.width / 2 - w / 2, sy = src.top + src.height / 2 - h / 2;
    const dx = d.left + d.width / 2 - w / 2, dy = d.top + d.height / 2 - h / 2;
    const mx = (sx + dx) / 2, my = Math.min(sy, dy) - 50;
    const anim = g.animate([
      { transform: `translate(${sx}px,${sy}px) scale(.8)`, opacity: 0.4 },
      { transform: `translate(${mx}px,${my}px) scale(1.1)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px,${dy}px) scale(1)`, opacity: 1 },
    ], { duration: 750, easing: 'ease-in-out' });
    // Don't trust anim.finished alone: it can stall (background tabs), which would freeze the game.
    return Promise.race([anim.finished, wait(900)]).then(() => {
      g.remove();
      dstEl.classList.remove('arriving');
      dstEl.classList.add('landed');
    });
  }

  // ---------- interaction ----------
  function onBoardClick(e) {
    if (busy) return;
    const act = e.target.closest('[data-act]');
    if (act) return act.dataset.act === 'hint' ? showMe() : undo();
    const step = L.steps[idx];
    if (!step) return;
    const ask = step.ask;
    const choice = e.target.closest('[data-choice]');
    if (choice) {
      const i = +choice.dataset.choice;
      return i === ask.answer ? correct() : wrong((ask.whys && ask.whys[i]) || 'Not quite. Think it through one more time.', () => board.querySelector(`[data-choice="${i}"]`));
    }
    if (e.target.closest('.bubble')) return;
    const row = e.target.closest('.row');
    if (!row) return;
    const n = +row.dataset.line;
    if (ask.type === 'line') {
      return n === ask.line ? correct() : wrong(step.hint || 'Not that one. Ask yourself: what would the computer do next?', () => board.querySelector(`.row[data-line="${n}"]`));
    }
    if (ask.type === 'tok') {
      const tk = e.target.closest('.tk');
      if (!tk) return;
      const t = tk.dataset.t, occ = +tk.dataset.occ;
      const ok = ask.ans.some(a => a.line === n && a.t === t && (a.occ || 1) === occ);
      return ok ? correct() : wrong(step.hint || 'Not there. Read the line: where is this value being stored?', () => tokEl(n, t, occ));
    }
  }

  function wrong(why, find) {
    mistakes++;
    feedback = '✗ ' + why;
    render();
    const el = find();
    if (el) { el.classList.add('nope'); setTimeout(() => el.classList.remove('nope'), 600); }
  }

  function showMe() {
    if (!revealed) mistakes++;
    revealed = true;
    feedback = '';
    render();
  }

  function undo() {
    if (idx === 0) return;
    idx--;
    state = stateAt(idx);
    feedback = '';
    revealed = false;
    render();
    scrollToCurrent();
  }

  async function correct() {
    busy = true;
    const step = L.steps[idx];
    let src = null;
    if (step.fly) { const el = elOf(step.fly.from, state); src = el && el.getBoundingClientRect(); }
    if ((step.do || []).some(o => o[0] === 'pop' || o[0] === 'ret')) {
      const k = state.frames.length - 1;
      board.querySelectorAll(`.var[data-frame="${k}"]`).forEach(e => e.classList.add('shred'));
      await wait(450);
    }
    (step.do || []).forEach(o => apply(state, o));
    idx++;
    feedback = '';
    revealed = false;
    render();
    if (step.fly && src) {
      const dst = elOf(step.fly.to, state);
      if (dst) await flyGhost(src, dst, flyValue(step));
    }
    scrollToCurrent();
    busy = false;
    if (idx >= L.steps.length) setTimeout(finish, 500);
  }

  function finish() {
    const stars = mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1;
    const prog = loadProgress();
    prog[L.id] = Math.max(prog[L.id] || 0, stars);
    saveProgress(prog);
    const next = LEVELS[L.index + 1];
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="card done">
      <div class="stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>
      <h2>Level ${L.index + 1} complete</h2>
      <p class="muted">${mistakes === 0 ? 'Flawless. You ran it exactly like the CPU would.' : `${mistakes} mistake${mistakes === 1 ? '' : 's'} or hint${mistakes === 1 ? '' : 's'}. Replay to go for three stars.`}</p>
      <h3>What you just learned</h3>
      <ul>${L.takeaways.map(t => `<li>${t}</li>`).join('')}</ul>
      <div class="actions">
        <button class="ghostbtn" data-a="replay">↻ Replay</button>
        <button class="ghostbtn" data-a="home">All levels</button>
        ${next ? `<button class="primary" data-a="next">Next: ${esc(next.title)} →</button>` : ''}
      </div>
    </div>`;
    ov.addEventListener('click', e => {
      const a = e.target.closest('[data-a]');
      if (!a) return;
      ov.remove();
      if (a.dataset.a === 'replay') startLevel(L.index);
      if (a.dataset.a === 'next') startLevel(L.index + 1);
      if (a.dataset.a === 'home') home();
    });
    document.body.appendChild(ov);
  }

  // ---------- home ----------
  function home() {
    const prog = loadProgress();
    app.innerHTML = `
      <div class="home">
        <header class="hero">
          <div class="badge">a game for learning to read code</div>
          <h1>Be the <span class="cpu big">CPU</span></h1>
          <p>Code is hard to follow because you can't see the computer working. Here, <b>you</b> are the computer: tap the line that runs next, carry values to where they belong, and watch the call stack grow and shrink, right on top of real C++.</p>
        </header>
        <section class="how3">
          <div><span>👆</span><b>Tap the next line</b><p>Programs jump around. Predict where.</p></div>
          <div><span>📦</span><b>Carry the values</b><p>Put each value in the box it lands in.</p></div>
          <div><span>🤔</span><b>Predict the result</b><p>Say what prints before it does.</p></div>
        </section>
        <section class="levels">
          ${LEVELS.map((l, i) => `
            <button class="lvcard" data-level="${i}">
              <span class="lvnum">Level ${i + 1}</span>
              <b>${esc(l.title)}</b>
              <span class="muted">${esc(l.concept)}</span>
              <span class="lvstars">${prog[l.id] ? '★'.repeat(prog[l.id]) + `<span>${'★'.repeat(3 - prog[l.id])}</span>` : '<span>☆☆☆</span>'}</span>
            </button>`).join('')}
        </section>
        <p class="foot muted">Tip: when you're stuck, <b>💡 Show me</b> highlights the answer, and <b>↶ Undo</b> steps backwards.</p>
      </div>`;
    app.querySelectorAll('[data-level]').forEach(b => (b.onclick = () => startLevel(+b.dataset.level)));
  }

  // #3 opens level 3; #3@7 jumps straight to step 7 (handy for testing and sharing)
  const [lv, at] = location.hash.slice(1).split('@').map(Number);
  if (lv >= 1 && lv <= LEVELS.length) {
    startLevel(lv - 1);
    if (at > 0 && at < L.steps.length) { idx = at; state = stateAt(at); render(); }
  } else home();
})();
