// game.js: app shell. Home page (paste box + example library from the study notes) and routing.
(() => {
  const app = document.getElementById('app');
  const STORE = 'be-the-cpu:code';
  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } };
  const save = v => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- syntax ----------
  const TYPES = new Set(['int', 'void', 'string', 'bool', 'double', 'float', 'char', 'auto', 'long', 'short', 'unsigned', 'size_t', 'vector']);
  const KW = new Set(['return', 'if', 'else', 'class', 'struct', 'public', 'private', 'protected', 'const', 'using', 'namespace', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'default', 'new', 'delete', 'true', 'false', 'this', 'nullptr', 'NULL', 'inline']);
  const LIB = new Set(['cout', 'endl', 'std', 'cin', 'getline', 'swap']);

  function tokenize(src) {
    if (/^\s*#/.test(src)) return [{ t: src, k: 'pre' }];
    const re = /("(?:[^"\\]|\\.)*")|('(?:[^'\\]|\\.)')|(\/\/.*)|([A-Za-z_]\w*)|(\d+\.?\d*)|(\s+)|(<<|>>|==|!=|<=|>=|&&|\|\||::|->|\+\+|--|.)/g;
    const out = [];
    let m;
    while ((m = re.exec(src))) {
      const t = m[0];
      const k = m[1] || m[2] ? 'str' : m[3] ? 'com' : m[4] ? (TYPES.has(t) ? 'type' : KW.has(t) ? 'kw' : LIB.has(t) ? 'lib' : 'id') : m[5] ? 'num' : m[6] ? 'ws' : 'op';
      out.push({ t, k });
    }
    return out;
  }
  const codeHTML = src => tokenize(src).map(tk => (tk.k === 'ws' ? tk.t : `<span class="t-${tk.k}">${esc(tk.t)}</span>`)).join('');

  // ---------- library ----------
  const SECTIONS = () => window.EXAMPLES || [];
  function findExample(id) {
    for (const s of SECTIONS()) for (const it of s.items || []) if (it.id === id) return { ...it, section: s };
    return null;
  }
  function openExample(id, at) {
    const ex = findExample(id);
    if (!ex) return false;
    const label = typeof ex.section.section === 'number' ? `${ex.section.section}. ${ex.section.title}` : ex.section.title;
    const res = window.Tracer.open(ex.code, ex.input || '', { title: ex.title, section: label, watch: ex.watch, id: ex.id, at });
    return !(res && res.error);
  }

  function sectionHTML(s) {
    const num = typeof s.section === 'number' ? `<span class="snum">${s.section}</span>` : s.section === 'exam' ? '<span class="snum exam">E1</span>' : '<span class="snum">★</span>';
    if (s.reference) {
      return `<details class="sect"><summary>${num}<b>${esc(s.title)}</b><span class="muted small">reference card</span></summary>
        <table class="ref"><thead><tr><th>Command</th><th>What it does</th><th>Example</th></tr></thead><tbody>
        ${s.reference.map(r => `<tr><td><code>${esc(r.cmd)}</code></td><td>${esc(r.what)}</td><td><code>${esc(r.example || '')}</code></td></tr>`).join('')}
        </tbody></table></details>`;
    }
    return `<details class="sect"${s.section === 'exam' || s.section === 'sort' ? ' open' : ''}><summary>${num}<b>${esc(s.title)}</b><span class="muted small">${s.items.length} program${s.items.length === 1 ? '' : 's'}</span></summary>
      <div class="excards">${s.items.map(it => `
        <button class="excard" data-ex="${esc(it.id)}">
          <b>${esc(it.title)}</b>
          ${it.watch ? `<span class="muted">${esc(it.watch)}</span>` : ''}
          <span class="go">▶ Watch it run${it.crash ? ' · ends in a crash' : ''}</span>
        </button>`).join('')}</div></details>`;
  }

  // ---------- home ----------
  function home() {
    const saved = load() || { c: '', i: '' };
    const sections = SECTIONS();
    const order = s => (s.section === 'sort' ? -2 : s.section === 'exam' ? -1 : s.section);
    app.innerHTML = `
      <div class="home">
        <header class="hero">
          <div class="logo">🐞</div>
          <div>
            <h1>Be the CPU <span class="pill">Visual C++ debugger</span></h1>
            <p>Paste C++ (or pick a program from your study notes) and watch it run one line at a time: every variable, address, pointer, array box and heap block, and exactly what changed after each line.</p>
          </div>
        </header>

        <section class="card paste">
          <div class="card-h"><h2>Paste your code</h2><span class="muted small">Ctrl+Enter to run</span></div>
          <textarea id="src" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="C++ code" placeholder="#include &lt;iostream&gt;&#10;using namespace std;&#10;&#10;int main() {&#10;    int x = 5;&#10;    int* p = &amp;x;&#10;    *p = 10;&#10;    cout &lt;&lt; x &lt;&lt; endl;&#10;}"></textarea>
          <div class="inbox" id="inbox" hidden>
            <label for="stdin">⌨ Input for <code>cin</code> (what the user would type)</label>
            <textarea id="stdin" rows="2" spellcheck="false"></textarea>
          </div>
          <div id="cerr" class="cerr" hidden></div>
          <div class="paste-f">
            <span class="muted small">Beginner C++: functions, arrays, structs, pointers and pointer arithmetic, <code>new</code>/<code>delete</code>, classes, constructors/destructors, copy constructors, <code>vector</code>, <code>string</code>, recursion, <code>cin</code>/<code>cout</code>.</span>
            <button class="primary big" id="go">▶ Run it</button>
          </div>
        </section>

        <h2 class="lib-h">Programs from your study notes</h2>
        <section class="library">${sections.length ? sections.slice().sort((a, b) => order(a) - order(b)).map(sectionHTML).join('') : '<p class="muted">No examples loaded.</p>'}</section>
      </div>`;

    const src = app.querySelector('#src'), stdin = app.querySelector('#stdin'), inbox = app.querySelector('#inbox'), cerr = app.querySelector('#cerr');
    src.value = saved.c || ''; stdin.value = saved.i || '';
    const syncInput = () => { inbox.hidden = !/\bcin\b|getline/.test(src.value); };
    syncInput();
    src.addEventListener('input', () => { syncInput(); cerr.hidden = true; });
    src.addEventListener('keydown', e => {
      if (e.key === 'Tab') { e.preventDefault(); src.setRangeText('    ', src.selectionStart, src.selectionEnd, 'end'); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) app.querySelector('#go').click();
    });
    app.querySelector('#go').onclick = () => {
      if (!src.value.trim()) { src.focus(); return; }
      save({ c: src.value, i: stdin.value });
      const res = window.Tracer.open(src.value, stdin.value, { title: 'Your program', share: true });
      if (res && res.error) {
        const lineText = src.value.split('\n')[res.error.line - 1];
        cerr.innerHTML = `<b>Line ${res.error.line}:</b> ${esc(res.error.msg)}${lineText != null ? `<pre>${res.error.line} | ${esc(lineText)}</pre>` : ''}`;
        cerr.hidden = false;
        cerr.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    app.querySelectorAll('[data-ex]').forEach(b => (b.onclick = () => {
      if (!openExample(b.dataset.ex)) alert('This example could not run. Try another one.');
      else try { history.replaceState(null, '', '#ex=' + b.dataset.ex); } catch {}
    }));
    window.scrollTo(0, 0);
  }

  window.BTC = { tokenize, codeHTML, esc, home, load, save };

  // #code=... opens a shared program; #ex=<id> opens an example; append @7 to jump to step 7
  const hash = location.hash.slice(1);
  const [route, at] = hash.split('@');
  if (route.startsWith('code=')) { if (!window.Tracer.openShared(route.slice(5), +at || 0)) home(); }
  else if (route.startsWith('ex=')) { if (!openExample(route.slice(3), +at || 0)) home(); }
  else home();
})();
