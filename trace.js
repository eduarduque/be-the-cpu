// trace.js: paste any C++ program, run it with cpp.js, and step through the recorded trace on top of the code.
(() => {
  const STORE = 'be-the-cpu:code';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } };
  const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const EXAMPLES = {
    'Bank account': `#include <iostream>
#include <string>
using namespace std;

class BankAccount {
private:
    string ownerName;

public:
    // Constructor
    BankAccount(string name) : ownerName(name) {}

    // Method declaration inside the class
    string getOwnerName() const;
};

// Method definition after the class
string BankAccount::getOwnerName() const
{
    return ownerName;
}

int main() {
    BankAccount user1("Alice Smith");
    cout << "Owner: " << user1.getOwnerName() << endl;
    return 0;
}`,
    'Functions': `#include <iostream>
using namespace std;

int doubleIt(int x) {
    x = x * 2;
    return x;
}

void addTen(int& score) {
    score = score + 10;
}

int main() {
    int n = 4;
    int result = doubleIt(n);
    addTen(n);
    cout << n << " " << result << endl;
    return 0;
}`,
    'Loop + vector': `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> scores = {72, 95, 88};
    scores.push_back(60);

    int best = scores[0];
    for (int i = 1; i < scores.size(); i++) {
        if (scores[i] > best) {
            best = scores[i];
        }
    }
    cout << "Best: " << best << endl;
    return 0;
}`,
    'Pointers': `#include <iostream>
using namespace std;

struct Node {
    int value;
    Node* next;
};

int main() {
    Node* head = nullptr;
    for (int i = 3; i >= 1; i--) {
        Node* n = new Node;
        n->value = i * 10;
        n->next = head;
        head = n;
    }

    int total = 0;
    for (Node* cur = head; cur != nullptr; cur = cur->next) {
        total += cur->value;
    }
    cout << "Total: " << total << endl;

    while (head != nullptr) {
        Node* old = head;
        head = head->next;
        delete old;
    }
    return 0;
}`,
    'Recursion': `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    return n * factorial(n - 1);
}

int main() {
    int answer = factorial(4);
    cout << answer << endl;
    return 0;
}`,
    'Input': `#include <iostream>
#include <string>
using namespace std;

int main() {
    string name;
    int age;
    cout << "Name and age? ";
    cin >> name >> age;
    if (age >= 18) {
        cout << name << " can vote." << endl;
    } else {
        cout << name << " can vote in " << 18 - age << " years." << endl;
    }
    return 0;
}`,
  };
  const EXAMPLE_INPUT = { Input: 'Ana 16' };

  // ---------- sharing ----------
  const enc = obj => btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

  // ---------- editor ----------
  function mountEditor(el) {
    const { esc } = window.BTC;
    const saved = load() || { c: EXAMPLES['Bank account'], i: '' };
    el.innerHTML = `
      <section class="paste">
        <div class="paste-h">
          <h2>Paste your code</h2>
          <div class="examples"><span class="muted">or try:</span>${Object.keys(EXAMPLES).map(n => `<button class="chip" data-ex="${esc(n)}">${esc(n)}</button>`).join('')}</div>
        </div>
        <textarea id="src" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="C++ code"></textarea>
        <div class="inbox" id="inbox">
          <label for="stdin">⌨ Input for <code>cin</code> (what the user would type)</label>
          <textarea id="stdin" rows="2" spellcheck="false"></textarea>
        </div>
        <div id="cerr" class="cerr" hidden></div>
        <div class="paste-f">
          <span class="muted small">Works with beginner C++: classes and structs, functions, references, pointers, <code>new</code>/<code>delete</code>, <code>vector</code>, <code>string</code>, loops, recursion, <code>cin</code>/<code>cout</code>.</span>
          <button class="primary big" id="go">▶ Step through it</button>
        </div>
      </section>`;
    const src = el.querySelector('#src'), stdin = el.querySelector('#stdin'), inbox = el.querySelector('#inbox');
    src.value = saved.c; stdin.value = saved.i || '';
    const syncInput = () => { inbox.hidden = !/\bcin\b|getline/.test(src.value); };
    syncInput();
    src.addEventListener('input', () => { syncInput(); el.querySelector('#cerr').hidden = true; });
    src.addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const a = src.selectionStart;
        src.setRangeText('    ', a, src.selectionEnd, 'end');
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) el.querySelector('#go').click();
    });
    el.querySelectorAll('[data-ex]').forEach(b => (b.onclick = () => {
      src.value = EXAMPLES[b.dataset.ex];
      stdin.value = EXAMPLE_INPUT[b.dataset.ex] || '';
      syncInput();
      el.querySelector('#cerr').hidden = true;
    }));
    el.querySelector('#go').onclick = () => {
      const res = start(src.value, stdin.value, true);
      if (res && res.error) {
        const box = el.querySelector('#cerr');
        const lineText = src.value.split('\n')[res.error.line - 1];
        box.innerHTML = `<b>Line ${res.error.line}:</b> ${esc(res.error.msg)}${lineText != null ? `<pre>${res.error.line} | ${esc(lineText)}</pre>` : ''}`;
        box.hidden = false;
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
  }

  // ---------- trace view state ----------
  let R, code, input, lines, toks, k, mode, board, done, carried, seen, score, feedback, revealed, autoTimer, busy;

  function start(c, i, fromEditor) {
    const res = window.CPP.run(c, i);
    save({ c, i });
    if (res.compileError) return { error: res.compileError };
    if (!res.steps.length) return { error: res.error || { msg: 'Nothing ran.', line: 1 } };
    R = res; code = c; input = i;
    lines = c.split('\n');
    toks = lines.map(window.BTC.tokenize);
    k = 0; mode = mode || 'predict';
    done = {}; carried = {}; seen = {}; score = { ok: 0, bad: 0 }; feedback = ''; revealed = false; busy = false;
    stopAuto();
    if (fromEditor) { try { history.replaceState(null, '', '#code=' + enc({ c, i })); } catch {} }
    view();
    return null;
  }

  function openShared(hash) {
    try {
      const { c, i } = dec(hash);
      const res = start(c, i || '', false);
      if (res && res.error) { save({ c, i }); return false; }
      return true;
    } catch { return false; }
  }

  function view() {
    const { esc } = window.BTC;
    const width = Math.max(...lines.map(l => l.length), 20) + 2;
    const hasHeap = R.steps.some(s => s.heap.length);
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="level trace">
        <header class="topbar">
          <button class="ghostbtn" data-act="edit">← Edit code</button>
          <div class="ttl">Your program <small>${R.steps.length} steps${R.error ? ' · ends in a crash' : ''}</small></div>
          <div class="modes" role="group" aria-label="Mode">
            <button data-mode="predict" class="${mode === 'predict' ? 'on' : ''}" title="Answer questions as you go">🎮 Predict</button>
            <button data-mode="watch" class="${mode === 'watch' ? 'on' : ''}" title="Just step through">👀 Watch</button>
          </div>
          <span class="score" id="score"></span>
        </header>
        <div class="scrub">
          <button class="ghostbtn" data-act="restart" title="Back to the start">⏮</button>
          <button class="ghostbtn" data-act="auto" id="autobtn" title="Play automatically (space)">▶ Auto</button>
          <input type="range" id="scrub" min="0" max="${R.steps.length - 1}" value="0" aria-label="Step">
          <span class="muted small" id="stepno"></span>
          <button class="ghostbtn" data-act="share" title="Copy a link to this exact program">🔗 Share</button>
        </div>
        <div class="legend">
          <span><span class="cpu">CPU</span> line about to run</span>
          <span>📋 clipboard (stack frame)</span>
          <span>🚩 return here</span>
          <span>📎 reference</span>
          <span>→ pointer (hover it)</span>
          <span>🔒 private</span>
        </div>
        <main class="board" id="board" style="--codew:${width}ch"></main>
        ${hasHeap ? '<section class="heap"><div class="heap-h">🏘 Heap: memory made with <code>new</code></div><div id="heap"></div></section>' : ''}
        <section class="screen">
          <div class="screen-h">🖥 Screen</div>
          <div id="screen"></div>
        </section>
      </div>`;
    board = document.getElementById('board');
    app.querySelector('.level').addEventListener('click', onClick);
    board.addEventListener('mouseover', onHover);
    board.addEventListener('mouseout', onHover);
    document.getElementById('heap')?.addEventListener('mouseover', onHover);
    document.getElementById('heap')?.addEventListener('mouseout', onHover);
    document.getElementById('scrub').addEventListener('input', e => { stopAuto(); go(+e.target.value, false); });
    render();
    window.scrollTo(0, 0);
  }

  // ---------- questions ----------
  function stmtNext(line) {
    for (const l of R.stmtLines) if (l > line) return l;
    return null;
  }
  function questionFor(i) {
    if (mode !== 'predict' || done[i]) return null;
    const a = R.steps[i], b = R.steps[i + 1];
    if (!b || b.kind === 'error' || b.kind === 'exit') return null;
    const sequential = b.frames.length === a.frames.length && b.line === stmtNext(a.line) && b.kind !== 'return';
    if (!sequential && b.line !== a.line) {
      const key = `j${a.line}>${b.line}`;
      if ((seen[key] || 0) < 2) return { type: 'line', line: b.line, key, kind: b.kind, back: b.line < a.line && b.frames.length === a.frames.length };
    }
    if (sequential && b.out.length > a.out.length && /\bcout\b/.test(lines[a.line - 1] || '')) {
      const key = `p${a.line}`;
      if ((seen[key] || 0) < 2) {
        const options = printOptions(a.line, b.out.slice(a.out.length));
        if (options.length >= 2) return { type: 'print', options, answer: options.correct, key };
      }
    }
    return null;
  }
  function printOptions(line, printed) {
    const set = [printed];
    const m = (lines[line - 1] || '').match(/cout\s*<<(.*?);?\s*$/);
    if (m) {
      const literal = m[1].split('<<').map(s => s.trim()).filter(Boolean).map(p => {
        if (p === 'endl' || p === 'std::endl') return '\n';
        if (/^".*"$/.test(p)) return p.slice(1, -1).replace(/\\n/g, '\n').replace(/\\t/g, '\t');
        if (/^'.'$/.test(p)) return p[1];
        return p;
      }).join('');
      set.push(literal);
    }
    const nm = printed.match(/-?\d+(\.\d+)?/);
    if (nm) set.push(printed.replace(nm[0], String(Number(nm[0]) + 1)));
    else if (printed.trim().length > 1) set.push(printed.replace(/\S+\s*$/, '').trim() ? printed.replace(/\S+(\s*)$/, '$1') : printed + printed);
    const uniq = [...new Set(set)].filter(s => s !== '').slice(0, 3);
    // stable shuffle so the right answer isn't always first
    const rot = line % uniq.length;
    const opts = uniq.slice(rot).concat(uniq.slice(0, rot));
    opts.correct = opts.indexOf(printed);
    return opts;
  }
  function carryFor(i) {
    if (mode !== 'predict' || carried[i]) return null;
    const s = R.steps[i];
    if (s.kind !== 'call' || s.frames.length < 2) return null;
    const f = s.frames[s.frames.length - 1];
    const v = f.vars.find(x => !x.isThis && !x.ref && x.anchor === s.line && x.val.t === 'p');
    if (!v) return null;
    const key = `c${f.uid}`;
    if ((seen[key] || 0) >= 2) return null;
    let afterParen = false, occ = null;
    for (const x of toks[s.line - 1] || []) {
      if (x.t === '(') afterParen = true;
      if (afterParen && x.k === 'id' && x.t === v.name) { occ = x.occ; break; }
    }
    if (occ == null) return null;
    return { type: 'carry', name: v.name, value: v.val.text, fn: f.label, line: s.line, occ, key, varId: v.id };
  }

  // ---------- rendering ----------
  function regionOf(n) {
    let best = null;
    for (const r of R.regions) if (n >= r.start && n <= r.end && (!best || r.end - r.start < best.end - best.start)) best = r;
    return best;
  }
  function valHTML(d) {
    const { esc } = window.BTC;
    switch (d.t) {
      case 'p': return `<span class="val">${esc(d.text)}</span>`;
      case 'u': return '<span class="val garbage" title="Declared, but never given a value. Real C++ would hold random garbage here.">?</span>';
      case 'ptr':
        if (d.dangling) return `<span class="ptr bad" title="This address was deleted">⚠ dangling (#${d.heap} deleted)</span>`;
        if (!d.target) return '<span class="ptr null">nullptr</span>';
        return `<span class="ptr" data-tid="${d.tid}" title="Holds the address of ${esc(d.target)}">→ ${esc(d.target)}</span>`;
      case 'obj':
        return `<span class="obj"><span class="objtag">🏠 ${esc(d.cls)}</span>${d.fields.map(f =>
          `<span class="field" data-cid="${f.id}">${f.priv ? '🔒' : ''}<i>${esc(f.name)}</i>${valHTML(f.val)}</span>`).join('')}</span>`;
      case 'vec':
        return `<span class="vec">${d.items.length ? d.items.map((it, i) => `<span class="slot" data-cid="${it.id}"><sub>${i}</sub>${valHTML(it.val)}</span>`).join('') : '<span class="empty">empty</span>'}${d.more ? `<span class="empty">+${d.more} more</span>` : ''}</span>`;
    }
    return '';
  }
  function chip(v, key, dim) {
    const { esc } = window.BTC;
    const body = v.ref ? `<span class="ref" title="A reference: another name for ${esc(v.ref)}">📎 ${esc(v.ref)}</span>${valHTML(v.val)}` : valHTML(v.val);
    return `<span class="var${dim ? ' dim' : ''}${v.isThis ? ' this' : ''}" data-key="${esc(key)}" data-cid="${v.ref || v.isThis ? '' : v.id}"${dim ? ' title="Still alive, but not visible from the function that is running now"' : ''}><b>${esc(v.name)}</b>${body}</span>`;
  }
  const showNL = s => s.replace(/\n/g, '↵');

  function bubbleHTML(s, q, cq) {
    const { esc } = window.BTC;
    const last = k === R.steps.length - 1;
    const prevLine = k > 0 ? R.steps[k - 1].line : null;
    const did = s.did.map(d => (typeof d === 'string'
      ? `<li>${esc(d)}</li>`
      : `<li>🖥 Printed <code class="printed">${esc(showNL(d.print))}</code></li>`)).join('');
    let html = '';
    if (did) html += `<div class="said">${prevLine ? `<span class="didh">Line ${prevLine}</span>` : ''}<ul>${did}</ul></div>`;
    if (s.kind === 'error') html += `<div class="crash">💥 <b>The program crashes here.</b> ${esc(s.note)}</div>`;
    else if (last && R.error) html += `<div class="crash">💥 ${esc(R.error.msg)}</div>`;
    if (feedback) html += `<div class="fb">${feedback}</div>`;
    if (cq) {
      html += `<div class="prompt"><span class="carry">📦 ${esc(cq.value)}</span><span>You carry this into <code>${esc(cq.fn)}()</code>. Tap where it lands.</span><span class="how">👆 tap a word in the code</span></div>`;
    } else if (q && q.type === 'line') {
      const prompt = q.kind === 'return' ? 'The function is done. Which line do you go back to?'
        : q.kind === 'call' ? 'A function is being called. Which line runs next?'
        : 'Which line runs next?';
      html += `<div class="prompt"><span>${prompt}</span><span class="how">👆 tap a line</span></div>`;
    } else if (q && q.type === 'print') {
      html += `<div class="prompt"><span>This line prints something. What appears on the screen?</span></div>
        <div class="choices">${q.options.map((o, i) => `<button class="choice mono${revealed && i === q.answer ? ' reveal' : ''}" data-choice="${i}">${esc(showNL(o))}</button>`).join('')}</div>`;
    } else if (!last) {
      html += `<div class="prompt quiet"><span>The <span class="cpu">CPU</span> is about to run line ${s.line}.</span></div>`;
    }
    if (last) {
      html += `<div class="prompt">${s.kind === 'exit' ? '✅ The program finished.' : ''}</div>
        <div class="tools"><button class="ghostbtn" data-act="back">◀ Back</button><button class="ghostbtn" data-act="restart">⏮ Start over</button><button class="primary" data-act="edit">✎ Edit code</button></div>`;
    } else {
      const asking = q || cq;
      html += `<div class="tools">
        <button class="ghostbtn" data-act="back" ${k === 0 ? 'disabled' : ''}>◀ Back</button>
        ${asking ? '<button class="ghostbtn" data-act="hint">💡 Show me</button>' : ''}
        <button class="${asking ? 'ghostbtn' : 'primary'}" data-act="next">${asking ? 'Skip ▶' : 'Next ▶'}</button>
        <span class="muted small keys">← → keys</span>
      </div>`;
    }
    return `<div class="bubble" id="bubble">${html}</div>`;
  }

  function render() {
    const { esc } = window.BTC;
    const s = R.steps[k];
    const top = s.frames[s.frames.length - 1];
    const topUid = top ? top.uid : null;
    const live = new Set(s.frames.map(f => f.uid));
    const flags = {};
    s.frames.forEach(f => { if (f.callLine != null) flags[f.callLine] = (flags[f.callLine] || 0) + 1; });
    const hidden = s.frames.filter((f, i) => i < s.frames.length - 1 && f.uid === topUid);
    const cq = carryFor(k);
    const q = cq ? null : questionFor(k);

    let html = '';
    lines.forEach((src, i) => {
      const n = i + 1;
      const r = regionOf(n);
      let cls = 'row';
      if (!r) cls += ' outside';
      else if (r.kind === 'class') cls += ' blueprint';
      else if (r.uid === topUid) cls += ' active';
      else if (live.has(r.uid)) cls += ' waiting';
      else cls += ' idle';
      if (s.line === n && s.kind !== 'exit') cls += ' current';
      if (s.kind === 'error' && s.line === n) cls += ' crashed';
      if (q && q.type === 'line') cls += ' pickable';
      if (cq) cls += ' tokpick';

      const gut = `<span class="ln">${n}</span>${s.line === n && s.kind !== 'exit' ? '<span class="cpu">CPU</span>' : ''}${flags[n] ? `<span class="flag" title="A call is waiting here for its function to return">🚩${flags[n] > 1 ? '×' + flags[n] : ''}</span>` : ''}`;
      const codeHTML = toks[i].map(tk => (tk.k === 'ws' ? tk.t : `<span class="tk t-${tk.k}" data-t="${esc(tk.t)}" data-occ="${tk.occ}">${esc(tk.t)}</span>`)).join('');

      let ann = '';
      if (r && r.start === n) {
        const f = r.uid && s.frames.slice().reverse().find(x => x.uid === r.uid);
        if (f) ann += `<span class="clip ${r.uid === topUid ? 'on' : ''}">📋 ${esc(f.label)}()${r.uid === topUid ? '' : ' · waiting'}</span>`;
        else if (r.label) ann += `<span class="rlabel">${esc(r.label)}</span>`;
      }
      s.globals.filter(v => v.anchor === n).forEach(v => { ann += chip(v, `g:${v.name}`, false); });
      s.frames.forEach((f, fi) => {
        const isTop = fi === s.frames.length - 1;
        if (!isTop && f.uid === topUid) return;
        f.vars.filter(v => v.anchor === n).forEach(v => {
          if (cq && isTop && v.id === cq.varId) return;
          ann += chip(v, `${fi}:${v.name}:${v.anchor}`, !isTop);
        });
      });
      if (hidden.length && r && r.uid === topUid && r.start === n) {
        ann += `<span class="stackbadge" title="Earlier calls of this same function, waiting underneath">📋×${hidden.length} waiting below: ${hidden.map(f => f.vars.filter(v => !v.isThis && v.val.t === 'p').map(v => `${esc(v.name)}=${esc(v.val.text)}`).join(', ') || esc(f.label)).join(' · ')}</span>`;
      }
      if (s.temp && s.temp.line === n) ann += `<span class="temp" data-key="t">📦 returned ${valHTML(s.temp.val)}</span>`;

      html += `<div class="${cls}" data-line="${n}"><div class="gut">${gut}</div><div class="code">${codeHTML || ' '}</div><div class="ann">${ann}</div></div>`;
      if (s.line === n) html += `<div class="bubblerow">${bubbleHTML(s, q, cq)}</div>`;
    });
    board.innerHTML = html;

    const heapEl = document.getElementById('heap');
    if (heapEl) {
      heapEl.innerHTML = s.heap.length
        ? s.heap.map(h => (h.freed
          ? `<span class="heapitem freed" title="Deleted">🏚 #${h.hid} deleted</span>`
          : `<span class="heapitem" data-cid="${h.id}" data-key="h:${h.hid}"><b>#${h.hid}</b>${valHTML(h.val)}</span>`)).join('')
        : '<span class="muted small">(empty: nothing has been created with new yet)</span>';
    }
    const scr = document.getElementById('screen');
    scr.innerHTML = s.out ? s.out.split('\n').map((l, i, a) => (i === a.length - 1 && l === '' ? '' : `<div class="outline">${esc(l) || '&nbsp;'}</div>`)).join('') : '<div class="outline muted">(nothing printed yet)</div>';
    document.getElementById('stepno').textContent = `step ${k + 1} / ${R.steps.length}`;
    document.getElementById('scrub').value = k;
    document.getElementById('score').innerHTML = mode === 'predict' ? `<span class="ok">✓ ${score.ok}</span> <span class="bad">✗ ${score.bad}</span>` : '';
    const ab = document.getElementById('autobtn');
    ab.textContent = autoTimer ? '⏸ Pause' : '▶ Auto';

    if (revealed) {
      if (cq) board.querySelector(`.row[data-line="${cq.line}"] .tk[data-t="${CSS.escape(cq.name)}"][data-occ="${cq.occ}"]`)?.classList.add('reveal');
      else if (q && q.type === 'line') board.querySelector(`.row[data-line="${q.line}"]`)?.classList.add('reveal');
    }
  }

  function scrollToCurrent() {
    const b = document.getElementById('bubble');
    if (!b) return;
    const r = b.getBoundingClientRect();
    if (r.bottom > innerHeight - 40 || r.top < 60) b.scrollIntoView({ block: 'center', behavior: autoTimer ? 'auto' : 'smooth' });
  }

  // ---------- animation ----------
  function chipState() {
    const m = new Map();
    document.querySelectorAll('[data-key]').forEach(el => {
      const r = el.getBoundingClientRect();
      m.set(el.dataset.key, { html: el.outerHTML, text: el.textContent, rect: r });
    });
    return m;
  }
  function animateDiff(prevStep, before) {
    const flyFrom = board.querySelector(`.row[data-line="${prevStep.line}"] .code`);
    if (!flyFrom) return;
    const src = flyFrom.getBoundingClientRect();
    const srcRect = { left: src.left, top: src.top, width: Math.min(src.width, 200), height: src.height };
    let flies = 0;
    document.querySelectorAll('[data-key]').forEach(el => {
      const old = before.get(el.dataset.key);
      if (old && old.text === el.textContent) return;
      if (flies++ >= 4) return;
      const label = el.querySelector('.val, .ptr')?.textContent || '📦';
      window.BTC.flyGhost(srcRect, el, label);
    });
    const s = R.steps[k];
    if (s.out.length > prevStep.out.length) {
      const scr = document.getElementById('screen');
      window.BTC.flyGhost(srcRect, scr.lastElementChild || scr, showNL(s.out.slice(prevStep.out.length)).slice(0, 24));
    }
    // shred anything that disappeared
    const now = new Set([...document.querySelectorAll('[data-key]')].map(e => e.dataset.key));
    for (const [key, old] of before) {
      if (now.has(key)) continue;
      const g = document.createElement('div');
      g.innerHTML = old.html;
      const el = g.firstElementChild;
      el.classList.add('shredghost');
      Object.assign(el.style, { position: 'fixed', left: old.rect.left + 'px', top: old.rect.top + 'px', margin: 0, zIndex: 40, pointerEvents: 'none' });
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 600);
    }
  }

  // ---------- navigation ----------
  function go(i, animate) {
    if (i < 0 || i >= R.steps.length) return;
    const prev = R.steps[k];
    const before = animate && i === k + 1 ? chipState() : null;
    k = i;
    feedback = '';
    revealed = false;
    render();
    if (before) animateDiff(prev, before);
    scrollToCurrent();
    if (k === R.steps.length - 1) stopAuto();
  }
  function next() {
    if (busy) return;
    if (carryFor(k)) { carried[k] = 'skipped'; render(); return; }
    if (questionFor(k)) done[k] = 'skipped';
    go(k + 1, true);
  }
  function stopAuto() {
    if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
    const ab = document.getElementById('autobtn');
    if (ab) ab.textContent = '▶ Auto';
  }
  function toggleAuto() {
    if (autoTimer) return stopAuto();
    if (mode === 'predict') { mode = 'watch'; document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === 'watch')); }
    if (k === R.steps.length - 1) go(0, false);
    autoTimer = setInterval(() => (k >= R.steps.length - 1 ? stopAuto() : go(k + 1, true)), 1300);
    render();
  }

  async function right(q) {
    score.ok++;
    seen[q.key] = (seen[q.key] || 0) + 1;
    if (q.type === 'carry') {
      carried[k] = true;
      busy = true;
      render();
      const prev = R.steps[k - 1];
      const from = prev && board.querySelector(`.row[data-line="${prev.line}"] .code`);
      const to = board.querySelector(`.var[data-key^="${R.steps[k].frames.length - 1}:${CSS.escape(q.name)}:"]`);
      if (from && to) { const r = from.getBoundingClientRect(); await window.BTC.flyGhost({ left: r.left, top: r.top, width: Math.min(r.width, 200), height: r.height }, to, q.value); }
      busy = false;
      return;
    }
    done[k] = true;
    go(k + 1, true);
  }
  function wrongAnswer(msg, el) {
    score.bad++;
    feedback = '✗ ' + msg;
    render();
    const target = typeof el === 'function' ? el() : el;
    if (target) { target.classList.add('nope'); setTimeout(() => target.classList.remove('nope'), 600); }
  }
  function lineHint(q) {
    if (q.kind === 'return') return 'Not that one. Follow the 🚩: it marks the line that made the call.';
    if (q.kind === 'call') return 'Not that one. This line calls a function, so the CPU jumps to where that function is written.';
    if (q.back) return 'Not that one. At the end of a loop body, the CPU goes back to check the loop condition again.';
    return 'Not that one. Check the condition: is it true or false? That decides which line runs next.';
  }

  function onClick(e) {
    const act = e.target.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'next') return next();
      if (a === 'back') { stopAuto(); return go(k - 1, false); }
      if (a === 'restart') { stopAuto(); done = {}; carried = {}; return go(0, false); }
      if (a === 'auto') return toggleAuto();
      if (a === 'hint') { revealed = true; render(); return; }
      if (a === 'edit') { stopAuto(); try { history.replaceState(null, '', location.pathname); } catch {} return window.BTC.home(); }
      if (a === 'share') {
        const url = location.origin + location.pathname + '#code=' + enc({ c: code, i: input });
        const ok = () => { act.textContent = '✓ Link copied'; setTimeout(() => (act.textContent = '🔗 Share'), 1800); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(ok, () => prompt('Copy this link:', url));
        else prompt('Copy this link:', url);
        return;
      }
    }
    const m = e.target.closest('[data-mode]');
    if (m) {
      mode = m.dataset.mode;
      document.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
      feedback = ''; revealed = false;
      return render();
    }
    if (busy || !board.contains(e.target) || e.target.closest('.bubble')) {
      const ch = e.target.closest('[data-choice]');
      if (ch) {
        const q = questionFor(k);
        const i = +ch.dataset.choice;
        if (q && q.type === 'print') {
          if (i === q.answer) return right(q);
          const why = q.options[i].includes('<<') || /[A-Za-z_]\w*\(|\b[a-z]\w*\.\w/.test(q.options[i])
            ? 'cout prints the <b>values</b>, not the names or code that produce them.'
            : 'Not quite. Look at the values of the variables right now.';
          return wrongAnswer(why, () => board.querySelector(`[data-choice="${i}"]`));
        }
      }
      return;
    }
    const row = e.target.closest('.row');
    if (!row) return;
    const n = +row.dataset.line;
    const cq = carryFor(k);
    if (cq) {
      const tk = e.target.closest('.tk');
      if (!tk) return;
      if (n === cq.line && tk.dataset.t === cq.name && +tk.dataset.occ === cq.occ) return right(cq);
      return wrongAnswer(`Not there. Values passed into a function land in its <b>parameters</b>, inside the ( ) on line ${cq.line}.`, () => board.querySelector(`.row[data-line="${n}"] .tk[data-t="${CSS.escape(tk.dataset.t)}"][data-occ="${tk.dataset.occ}"]`));
    }
    const q = questionFor(k);
    if (q && q.type === 'line') {
      if (n === q.line) return right(q);
      return wrongAnswer(lineHint(q), () => board.querySelector(`.row[data-line="${n}"]`));
    }
  }

  function onHover(e) {
    const p = e.target.closest('[data-tid]');
    if (!p) return;
    const on = e.type === 'mouseover';
    document.querySelectorAll(`[data-cid="${p.dataset.tid}"]`).forEach(el => el.classList.toggle('pointed', on));
  }

  document.addEventListener('keydown', e => {
    if (!document.querySelector('.trace') || /TEXTAREA|INPUT/.test(document.activeElement.tagName)) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); stopAuto(); go(k - 1, false); }
    else if (e.key === ' ') { e.preventDefault(); toggleAuto(); }
  });

  window.Tracer = { mountEditor, openShared };
})();
