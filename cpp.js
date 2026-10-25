// cpp.js: a small C++ interpreter for teaching.
// It runs a beginner-friendly subset of C++ and records a snapshot of the whole machine
// (call stack, variables, heap, output) before every line, so the UI can replay it.
(function () {
  class CppError extends Error {
    constructor(msg, line) { super(msg); this.line = line; }
  }
  class Ret { constructor(val) { this.val = val; } }
  const BRK = { signal: 'break' }, CONT = { signal: 'continue' };

  // ---------------------------------------------------------------- lexer
  const OPS = ['<<=', '>>=', '->', '::', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];
  const ESC = { n: '\n', t: '\t', '\\': '\\', "'": "'", '"': '"', 0: '\0', r: '\r' };

  function lex(src) {
    const toks = [];
    let i = 0, line = 1;
    const n = src.length;
    const push = (k, v, start, extra) => toks.push({ k, v, line, pos: start, end: i, ...extra });
    while (i < n) {
      const c = src[i];
      if (c === '\n') { line++; i++; continue; }
      if (/\s/.test(c)) { i++; continue; }
      if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
        i += 2; continue;
      }
      if (c === '#') { while (i < n && src[i] !== '\n') i++; continue; }
      const start = i;
      if (c === '"') {
        let s = ''; i++;
        while (src[i] !== '"') {
          if (i >= n || src[i] === '\n') throw new CppError('This string is missing its closing quote (").', line);
          if (src[i] === '\\') { i++; s += ESC[src[i]] ?? src[i]; } else s += src[i];
          i++;
        }
        i++; push('str', s, start); continue;
      }
      if (c === "'") {
        i++;
        let ch;
        if (src[i] === '\\') { i++; ch = ESC[src[i]] ?? src[i]; } else ch = src[i];
        i++;
        if (src[i] !== "'") throw new CppError("A char holds exactly one character, like 'a'. Use \"double quotes\" for text.", line);
        i++; push('char', ch, start); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
        const re = /0[xX][0-9a-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
        re.lastIndex = i; const m = re.exec(src); i += m[0].length;
        const suf = /[fFlLuU]*/y; suf.lastIndex = i; const sm = suf.exec(src); i += sm[0].length;
        const isF = !/^0[xX]/.test(m[0]) && (/[.eE]/.test(m[0]) || /[fF]/.test(sm[0]));
        push('num', Number(m[0]), start, { f: isF }); continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const re = /[A-Za-z_]\w*/y; re.lastIndex = i; const m = re.exec(src); i += m[0].length;
        push('id', m[0], start); continue;
      }
      const op = OPS.find(o => src.startsWith(o, i)) || c;
      i += op.length; push('op', op, start);
    }
    toks.push({ k: 'eof', v: '', line, pos: n, end: n });
    return toks;
  }

  // ---------------------------------------------------------------- parser
  const TYPE_WORDS = new Set(['int', 'long', 'short', 'unsigned', 'signed', 'double', 'float', 'bool', 'char', 'string', 'void', 'auto', 'size_t']);
  const UNSUPPORTED_TYPES = { map: 'std::map', unordered_map: 'std::unordered_map', set: 'std::set', pair: 'std::pair', list: 'std::list', queue: 'std::queue', stack: 'std::stack', array: 'std::array', ifstream: 'File streams', ofstream: 'File streams', fstream: 'File streams', stringstream: 'stringstream', istringstream: 'stringstream', ostringstream: 'stringstream', unique_ptr: 'Smart pointers', shared_ptr: 'Smart pointers' };

  function parse(src) {
    const t = lex(src);
    let p = 0;
    const classes = new Set();
    for (let i = 0; i < t.length - 1; i++) {
      if ((t[i].v === 'class' || t[i].v === 'struct') && t[i].k === 'id' && t[i + 1].k === 'id') classes.add(t[i + 1].v);
    }
    const stmtLines = new Set();
    const peek = (o = 0) => t[Math.min(p + o, t.length - 1)];
    const is = (v, o = 0) => { const x = peek(o); return x.v === v && (x.k === 'op' || x.k === 'id'); };
    const next = () => t[p++];
    const eat = v => (is(v) ? next() : null);
    const where = () => peek().line;
    const fail = (msg, line = where()) => { throw new CppError(msg, line); };
    const unsupported = (what, line = where()) => fail(`${what} isn't supported by this visualizer yet.`, line);
    const show = x => (x.k === 'eof' ? 'the end of the file' : x.k === 'str' ? `"${x.v}"` : `'${x.v}'`);
    const expect = v => {
      if (!is(v)) {
        if (v === ';') fail(`Missing ';' at the end of this line.`, t[p - 1] ? t[p - 1].line : where());
        fail(`Expected '${v}' here but found ${show(peek())}.`);
      }
      return next();
    };
    const ident = () => {
      const x = peek();
      if (x.k !== 'id') fail(`Expected a name here but found ${show(x)}.`);
      p++; return x.v;
    };
    const srcOf = (a, b) => src.slice(t[a].pos, t[b - 1].end);
    const node = (k, line, props) => ({ k, line, ...props });

    function closeAngle() {
      if (is('>')) return next();
      if (is('>>')) { t[p] = { ...t[p], v: '>', pos: t[p].pos + 1 }; return; }
      fail(`Expected '>' to close the < >.`);
    }

    function parseType() {
      let isConst = false;
      for (;;) {
        if (is('const')) { next(); isConst = true; }
        else if (is('static') || is('inline') || is('constexpr') || is('mutable') || is('volatile')) next();
        else break;
      }
      if (is('std') && is('::', 1)) p += 2;
      const x = peek();
      let name;
      if (['unsigned', 'signed', 'long', 'short'].includes(x.v)) {
        const parts = [];
        while (['unsigned', 'signed', 'long', 'short', 'int', 'char', 'double'].includes(peek().v)) parts.push(next().v);
        name = parts.includes('double') ? 'double' : parts.includes('char') ? 'char' : 'int';
      } else name = ident();
      if (name === 'size_t') name = 'int';
      if (name === 'float') name = 'double';
      let ty = { name };
      if (name === 'vector') { expect('<'); ty.elem = parseType().ty; closeAngle(); }
      else if (UNSUPPORTED_TYPES[name]) unsupported(UNSUPPORTED_TYPES[name], x.line);
      else if (!TYPE_WORDS.has(name) && !classes.has(name)) fail(`Unknown type '${name}'. This visualizer understands int, double, bool, char, string, vector and your own classes/structs.`, x.line);
      while (is('const')) { next(); isConst = true; }
      const base = ty;
      while (is('*')) { next(); ty = { name: 'ptr', to: ty }; while (is('const')) next(); }
      let ref = false;
      if (is('&')) { next(); ref = true; }
      if (is('&&')) unsupported('Rvalue references (&&)');
      return { ty, isConst, ref, base };
    }

    function isDeclStart() {
      const x = peek();
      if (x.k !== 'id') return false;
      if (['const', 'static', 'unsigned', 'signed', 'long', 'short', 'auto', 'constexpr'].includes(x.v)) return true;
      if (TYPE_WORDS.has(x.v)) return !is('(', 1);
      if (x.v === 'vector') return true;
      if (UNSUPPORTED_TYPES[x.v] && (is('<', 1) || peek(1).k === 'id')) return true;
      if (x.v === 'std' && is('::', 1)) return ['string', 'vector'].includes(peek(2).v) || !!UNSUPPORTED_TYPES[peek(2).v];
      if (classes.has(x.v)) {
        const n = peek(1);
        return n.k === 'id' || ((n.v === '*' || n.v === '&') && (peek(2).k === 'id' || peek(2).v === '*'));
      }
      return false;
    }

    // ----- expressions
    function parseExpr() {
      const line = where();
      let e = parseAssign();
      if (is(',')) {
        const list = [e];
        while (eat(',')) list.push(parseAssign());
        e = node('comma', line, { list });
      }
      return e;
    }
    const ASSIGN = ['=', '+=', '-=', '*=', '/=', '%='];
    function parseAssign() {
      const l = parseTernary();
      if (peek().k === 'op' && ASSIGN.includes(peek().v)) {
        const op = next().v;
        const r = parseAssign();
        return node('assign', l.line, { op, l, r });
      }
      return l;
    }
    function parseTernary() {
      const c = parseBin(0);
      if (eat('?')) { const a = parseAssign(); expect(':'); const b = parseAssign(); return node('cond', c.line, { c, a, b }); }
      return c;
    }
    const PREC = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%']];
    function parseBin(lv) {
      if (lv === PREC.length) return parseUnary();
      let l = parseBin(lv + 1);
      while (peek().k === 'op' && PREC[lv].includes(peek().v)) {
        const op = next().v;
        const r = parseBin(lv + 1);
        l = node('bin', l.line, { op, l, r });
      }
      return l;
    }
    function parseUnary() {
      const x = peek();
      if (x.k === 'op' && ['!', '-', '+', '~', '++', '--', '*', '&'].includes(x.v)) {
        next(); return node('un', x.line, { op: x.v, e: parseUnary() });
      }
      if (is('new')) {
        next();
        const { ty } = parseType();
        let args = [], count = null;
        let init = null;
        if (eat('[')) {
          count = parseExpr(); expect(']');
          if (eat('(')) { expect(')'); init = node('list', x.line, { items: [] }); }
          else if (eat('{')) init = parseList();
        }
        else if (eat('(')) args = parseArgs(')');
        else if (eat('{')) args = parseArgs('}');
        return node('new', x.line, { ty, args, count, init });
      }
      if (is('delete')) {
        next();
        let arr = false;
        if (eat('[')) { expect(']'); arr = true; }
        return node('delete', x.line, { e: parseUnary(), arr });
      }
      if (is('sizeof')) {
        next();
        if (is('(') && (TYPE_WORDS.has(peek(1).v) || classes.has(peek(1).v) || (is('std', 1) && is('::', 2))) && !is('(', 2) && !is('.', 2) && !is('[', 2) && !is('->', 2)) {
          next(); const { ty } = parseType(); expect(')');
          return node('sizeof', x.line, { ty });
        }
        return node('sizeof', x.line, { e: parseUnary() });
      }
      if (is('(') && TYPE_WORDS.has(peek(1).v) && (is(')', 2) || is('*', 2))) {
        next(); const { ty } = parseType(); expect(')');
        return node('cast', x.line, { ty, e: parseUnary() });
      }
      return parsePostfix();
    }
    function parseArgs(close) {
      const args = [];
      if (!eat(close)) { do args.push(parseAssign()); while (eat(',')); expect(close); }
      return args;
    }
    function parseList() { // after '{': items may be nested { } lists
      const line = t[p - 1].line, items = [];
      if (!eat('}')) {
        do { if (is('}')) break; items.push(eat('{') ? parseList() : parseAssign()); } while (eat(','));
        expect('}');
      }
      return node('list', line, { items });
    }
    function parsePostfix() {
      let e = parsePrimary();
      for (;;) {
        const x = peek();
        if (is('(')) { next(); e = node('call', x.line, { f: e, args: parseArgs(')') }); }
        else if (is('.') || is('->')) { next(); e = node(x.v === '.' ? 'member' : 'arrow', x.line, { o: e, name: ident() }); }
        else if (is('[')) { next(); const i = parseExpr(); expect(']'); e = node('index', x.line, { o: e, i }); }
        else if (is('++') || is('--')) { next(); e = node('post', x.line, { op: x.v, e }); }
        else return e;
      }
    }
    function parsePrimary() {
      const x = peek();
      if (x.k === 'num') { next(); return node('num', x.line, { v: x.v, f: x.f }); }
      if (x.k === 'str') { next(); let s = x.v; while (peek().k === 'str') s += next().v; return node('str', x.line, { v: s }); }
      if (x.k === 'char') { next(); return node('char', x.line, { v: x.v }); }
      if (eat('(')) { const e = parseExpr(); expect(')'); return e; }
      if (x.k !== 'id') fail(`Unexpected ${show(x)} here.`);
      if (x.v === 'true' || x.v === 'false') { next(); return node('bool', x.line, { v: x.v === 'true' }); }
      if (x.v === 'nullptr' || x.v === 'NULL') { next(); return node('null', x.line, {}); }
      if (x.v === 'this') { next(); return node('this', x.line, {}); }
      if (/^(static|dynamic|reinterpret|const)_cast$/.test(x.v)) {
        next(); expect('<'); const { ty } = parseType(); closeAngle(); expect('(');
        const e = parseExpr(); expect(')');
        return node('cast', x.line, { ty, e });
      }
      if (x.v === 'std' && is('::', 1)) { p += 2; return parsePrimary(); }
      if (TYPE_WORDS.has(x.v) && is('(', 1)) {
        const { ty } = parseType(); expect('(');
        const args = parseArgs(')');
        return node('cast', x.line, { ty, e: args[0] || node('num', x.line, { v: 0 }) });
      }
      if (classes.has(x.v) && (is('(', 1) || is('{', 1))) {
        next(); const open = next().v;
        return node('construct', x.line, { cls: x.v, args: parseArgs(open === '(' ? ')' : '}') });
      }
      if (classes.has(x.v) && is('::', 1)) unsupported('Static class members');
      if (x.v === 'lambda' || is('[', 0)) unsupported('Lambdas');
      next();
      return node('id', x.line, { name: x.v });
    }

    // ----- statements
    function parseBlock() {
      const open = expect('{');
      const body = [];
      while (!is('}')) {
        if (peek().k === 'eof') fail(`This '{' is never closed. Is a '}' missing?`, open.line);
        body.push(parseStmt());
      }
      const close = next();
      return node('block', open.line, { body, endLine: close.line });
    }
    function parseCond() {
      expect('(');
      const a = p;
      if (isDeclStart()) unsupported('Declaring a variable inside a condition');
      const c = parseExpr();
      c.src = srcOf(a, p);
      expect(')');
      return c;
    }
    function parseStmt() {
      const x = peek(), line = x.line;
      if (is('{')) return parseBlock();
      if (eat(';')) return node('empty', line, {});
      stmtLines.add(line);
      if (x.k === 'id') {
        switch (x.v) {
          case 'if': {
            next(); const cond = parseCond(); const then = parseStmt();
            let els = null;
            if (eat('else')) els = parseStmt();
            return node('if', line, { cond, then, els });
          }
          case 'while': { next(); const cond = parseCond(); return node('while', line, { cond, body: parseStmt() }); }
          case 'do': {
            next(); const body = parseStmt(); const condLine = where();
            stmtLines.add(condLine);
            expect('while'); const cond = parseCond(); expect(';');
            return node('do', line, { body, cond, condLine });
          }
          case 'for': {
            next(); expect('(');
            const save = p;
            if (isDeclStart()) {
              const { ty, ref } = parseType();
              if (peek().k === 'id' && is(':', 1)) {
                const name = ident(); next();
                const a = p; const range = parseExpr(); range.src = srcOf(a, p);
                expect(')');
                return node('forin', line, { ty, ref, name, range, body: parseStmt() });
              }
              p = save;
            }
            let init = null;
            if (!eat(';')) {
              if (isDeclStart()) init = parseDecl();
              else { const e = parseExpr(); expect(';'); init = node('expr', line, { e }); }
            }
            let cond = null;
            if (!is(';')) { const a = p; cond = parseExpr(); cond.src = srcOf(a, p); }
            expect(';');
            let step = null;
            if (!is(')')) step = parseExpr();
            expect(')');
            return node('for', line, { init, cond, step, body: parseStmt() });
          }
          case 'return': { next(); const e = is(';') ? null : parseExpr(); expect(';'); return node('return', line, { e }); }
          case 'break': next(); expect(';'); return node('break', line, {});
          case 'continue': next(); expect(';'); return node('continue', line, {});
          case 'switch': {
            next(); const cond = parseCond(); expect('{');
            const cases = [];
            while (!eat('}')) {
              const cl = where();
              let v = null;
              if (eat('case')) v = parseTernary(); else expect('default');
              expect(':');
              const body = [];
              while (!is('case') && !is('default') && !is('}')) body.push(parseStmt());
              cases.push({ v, body, line: cl });
            }
            return node('switch', line, { cond, cases });
          }
          case 'class': case 'struct': unsupported('Classes declared inside functions');
          case 'goto': unsupported('goto');
          case 'try': case 'throw': unsupported('Exceptions (try / throw)');
        }
      }
      if (isDeclStart()) return parseDecl();
      const e = parseExpr();
      expect(';');
      return node('expr', line, { e });
    }
    function parseDecl() {
      const line = where();
      const { ty, isConst, ref, base } = parseType();
      const decls = [];
      do {
        let dty = decls.length ? base : ty, dref = decls.length ? false : ref;
        while (eat('*')) dty = { name: 'ptr', to: dty };
        if (eat('&')) dref = true;
        const dl = where();
        const name = ident();
        const dims = [];
        while (eat('[')) { dims.push(is(']') ? null : parseExpr()); expect(']'); }
        let init = null, args = null;
        if (eat('=')) {
          if (eat('{')) init = parseList();
          else init = parseAssign();
        } else if (is('(')) {
          next(); args = parseArgs(')');
        } else if (is('{')) {
          next(); const L = parseList(), items = L.items;
          if (dims.length || dty.name === 'vector') init = L;
          else if (classes.has(dty.name)) args = items;
          else init = items[0] || node('num', dl, { v: 0 });
        }
        decls.push({ name, ty: dty, ref: dref, isConst, init, args, dims, line: dl });
      } while (eat(','));
      expect(';');
      return node('decl', line, { decls });
    }

    // ----- top level
    const prog = { classes: {}, funcs: [], globals: [] };
    function parseFunc(ret, name, cls, line, extra = {}) {
      expect('(');
      const params = [];
      if (!is(')')) {
        if (is('void') && is(')', 1)) next();
        else do {
          const { ty, isConst, ref } = parseType();
          let pty = ty, pname = null;
          if (peek().k === 'id') pname = ident();
          while (eat('[')) { if (!is(']')) parseExpr(); expect(']'); pty = { name: 'ptr', to: ty, arr: true }; }
          let def = null;
          if (eat('=')) def = parseAssign();
          params.push({ ty: pty, ref, isConst, name: pname, def });
        } while (eat(','));
      }
      expect(')');
      const isConst = !!eat('const');
      eat('override'); eat('noexcept');
      let inits = null;
      if (eat(':')) {
        inits = [];
        do {
          const il = where();
          const fname = ident();
          let args;
          if (eat('(')) args = parseArgs(')');
          else { expect('{'); args = parseArgs('}'); }
          inits.push({ name: fname, args, line: il });
        } while (eat(','));
      }
      const f = { name, cls, ret, params, isConst, inits, line, ...extra };
      if (eat(';')) { f.proto = true; return f; }
      if (eat('=')) { const what = next().v; expect(';'); f.proto = true; f.defaulted = what === 'default'; return f; }
      f.body = parseBlock();
      f.endLine = f.body.endLine;
      stmtLines.add(f.endLine);
      return f;
    }
    function parseClass() {
      const kw = next().v, line = t[p - 1].line, name = ident();
      if (eat(';')) return;
      if (is(':')) unsupported('Inheritance');
      expect('{');
      const cls = { name, fields: [], methods: {}, ctors: [], dtor: null, line };
      let access = kw === 'struct' ? 'public' : 'private';
      while (!is('}')) {
        if (peek().k === 'eof') fail(`Class ${name} is missing its closing '};'.`, line);
        if ((is('public') || is('private') || is('protected')) && is(':', 1)) { access = next().v; next(); continue; }
        if (eat(';')) continue;
        if (is('friend')) unsupported('friend');
        if (is('template')) unsupported('Templates');
        eat('virtual'); eat('explicit');
        const ml = where();
        if (is('~')) { next(); ident(); cls.dtor = parseFunc(null, '~' + name, name, ml, { isDtor: true, access }); continue; }
        if (peek().v === name && is('(', 1)) { next(); cls.ctors.push(parseFunc(null, name, name, ml, { isCtor: true, access })); continue; }
        if (is('operator') || peek(1).v === 'operator' || peek(2).v === 'operator') unsupported('Operator overloading');
        const { ty, ref } = parseType();
        const mname = ident();
        if (is('(')) {
          const f = parseFunc({ ty, ref }, mname, name, ml, { access });
          (cls.methods[mname] = cls.methods[mname] || []).push(f);
          continue;
        }
        let fname = mname;
        for (;;) {
          const dims = [];
          while (eat('[')) { dims.push(parseExpr()); expect(']'); }
          let init = null;
          if (eat('=')) init = eat('{') ? parseList() : parseAssign();
          else if (eat('{')) { const L = parseList(); init = dims.length || classes.has(ty.name) ? L : L.items[0] || null; }
          cls.fields.push({ name: fname, ty, dims, init, access, line: ml });
          if (!eat(',')) break;
          fname = ident();
        }
        expect(';');
      }
      cls.endLine = next().line;
      expect(';');
      prog.classes[name] = cls;
    }

    while (peek().k !== 'eof') {
      if (eat(';')) continue;
      if (is('using')) { while (!eat(';')) { if (peek().k === 'eof') break; next(); } continue; }
      if (is('class') || is('struct')) { parseClass(); continue; }
      if (is('template')) unsupported('Templates');
      if (is('namespace')) unsupported('Custom namespaces');
      if (is('typedef')) unsupported('typedef');
      if (is('enum')) unsupported('enum');
      const line = where();
      if (classes.has(peek().v) && is('::', 1) && (peek(2).v === peek().v || is('~', 2))) {
        const cname = next().v; next();
        if (eat('~')) { ident(); prog.funcs.push(parseFunc(null, '~' + cname, cname, line, { isDtor: true })); continue; }
        next(); prog.funcs.push(parseFunc(null, cname, cname, line, { isCtor: true }));
        continue;
      }
      const save = p;
      const { ty, ref } = parseType();
      let name = ident(), cls = null;
      if (eat('::')) { cls = name; name = ident(); }
      if (name === 'operator') unsupported('Operator overloading');
      if (is('(')) { prog.funcs.push(parseFunc({ ty, ref }, name, cls, line)); continue; }
      p = save;
      const d = parseDecl();
      d.decls.forEach(x => stmtLines.add(x.line));
      prog.globals.push(d);
    }

    function mergeDefs(pr, f) { pr.params.forEach((x, i) => { if (x.def && !f.params[i].def) f.params[i].def = x.def; }); }
    // attach out-of-class definitions (Class::method) to their declarations
    for (const f of prog.funcs) {
      if (!f.cls) continue;
      const c = prog.classes[f.cls];
      if (!c) fail(`Unknown class '${f.cls}'.`, f.line);
      if (f.isCtor) {
        const i = c.ctors.findIndex(x => x.proto && x.params.length === f.params.length);
        if (i >= 0) { f.access = c.ctors[i].access; mergeDefs(c.ctors[i], f); c.ctors[i] = f; } else fail(`This constructor isn't declared inside class ${f.cls}.`, f.line);
      } else if (f.isDtor) {
        c.dtor = f;
      } else {
        const list = c.methods[f.name];
        const i = list ? list.findIndex(x => x.proto && x.params.length === f.params.length) : -1;
        if (i < 0) fail(`'${f.name}' isn't declared inside class ${f.cls}. Add its declaration to the class first.`, f.line);
        f.access = list[i].access;
        if (list[i].isConst !== f.isConst) fail(`'${f.name}' is declared ${list[i].isConst ? 'const' : 'non-const'} in the class but defined ${f.isConst ? 'const' : 'non-const'} here. They must match.`, f.line);
        mergeDefs(list[i], f);
        list[i] = f;
      }
    }
    for (const f of prog.funcs) {
      if (f.cls || f.proto) continue;
      for (const pr of prog.funcs) if (pr.proto && !pr.cls && pr.name === f.name && pr.params.length === f.params.length) mergeDefs(pr, f);
    }
    prog.free = prog.funcs.filter(f => !f.cls);

    const regions = [];
    const allDefs = [...prog.free];
    for (const c of Object.values(prog.classes)) {
      regions.push({ kind: 'class', start: c.line, end: c.endLine, label: `📐 ${c.name} blueprint` });
      allDefs.push(...c.ctors, ...Object.values(c.methods).flat());
      if (c.dtor) allDefs.push(c.dtor);
    }
    for (const f of allDefs) {
      f.uid = `${f.cls ? f.cls + '::' : ''}${f.name}@${f.line}`;
      if (f.body) regions.push({ uid: f.uid, start: f.line, end: f.endLine, label: f.isCtor ? 'constructor' : f.isDtor ? 'destructor' : null });
    }
    prog.regions = regions;
    prog.stmtLines = [...stmtLines].sort((a, b) => a - b);
    return prog;
  }

  // ---------------------------------------------------------------- interpreter
  function execute(prog, input, opts) {
    const MAX = opts.maxSteps || 5000;
    let cellId = 0, heapId = 0, inPos = 0, halted = false, out = '', temp = null, did = [];
    const fmt = { fixed: false, prec: 6 };
    let seed = 1;
    const steps = [];
    const frames = [];
    const globals = { label: 'globals', vars: [], scopes: [[]] };
    const heap = [];
    const cell = (val, extra) => ({ id: ++cellId, val, ...extra });
    const top = () => frames[frames.length - 1];
    const say = s => did.push(s);

    const I = v => ({ t: 'int', v: Math.trunc(v) });
    const D = v => ({ t: 'double', v });
    const B = v => ({ t: 'bool', v: !!v });
    const C = v => ({ t: 'char', v });
    const S = v => ({ t: 'string', v });
    const VOID = { t: 'void' };
    const NULLPTR = { t: 'ptr', cell: null };
    const OSTREAM = { t: 'ostream' }, ISTREAM = { t: 'istream' }, ENDL = { t: 'endl' };

    // ----- memory: fake but realistic, deterministic addresses
    // Stack grows down from STACK0 (each call lower), globals sit at GLOB0, heap blocks grow up from HEAP0.
    // Roots (variables, heap blocks) get an address when created; fields and slots are laid out inside them.
    const STACK0 = 0x7ffd5000, GLOB0 = 0x00404000, HEAP0 = 0x55a3c000;
    let sp = STACK0, gp = GLOB0, hp = HEAP0;
    const live = new Set();
    const up = (a, n) => Math.ceil(a / n) * n;
    const ARR = (of, n) => ({ name: 'array', of, n });
    const PRIM = { int: 4, double: 8, bool: 1, char: 1, string: 32, ptr: 8, vector: 24, void: 1, auto: 8 };
    const isPrimTy = t => t.name in PRIM && t.name !== 'vector';
    function fieldTy(fd) { return fd._ty || (fd._ty = fd.dims.reduceRight((t, d) => ARR(t, num(evalE(d), fd.line)), fd.ty)); }
    function layoutOf(cls) {
      if (cls.lay) return cls.lay;
      let off = 0, al = 1;
      const offs = {};
      for (const fd of cls.fields) {
        const t = fieldTy(fd), a = alignTy(t);
        off = up(off, a); offs[fd.name] = off; off += sizeTy(t); al = Math.max(al, a);
      }
      return (cls.lay = { size: Math.max(1, up(off, al)), align: al, offs });
    }
    function sizeTy(t) {
      if (t.name === 'array') return t.n * sizeTy(t.of);
      if (prog.classes[t.name]) return layoutOf(prog.classes[t.name]).size;
      return PRIM[t.name] || 4;
    }
    function alignTy(t) {
      if (t.name === 'array') return alignTy(t.of);
      if (prog.classes[t.name]) return layoutOf(prog.classes[t.name]).align;
      return Math.min(8, PRIM[t.name] || 4);
    }
    function tyName(t) {
      if (!t || t.name === 'auto') return null;
      if (t.name === 'ptr') return (tyName(t.to) || 'void') + '*';
      if (t.name === 'vector') return `vector<${tyName(t.elem) || '?'}>`;
      if (t.name === 'array') { let d = '', x = t; while (x.name === 'array') { d += `[${x.n}]`; x = x.of; } return (tyName(x) || '?') + d; }
      return t.name;
    }
    function vty(v) { // a type worked out from a value (for auto, temporaries)
      switch (v.t) {
        case 'int': case 'double': case 'bool': case 'char': case 'string': return { name: v.t };
        case 'uninit': return { name: v.of === 'pointer' ? 'ptr' : v.of, to: { name: 'void' } };
        case 'ptr': return { name: 'ptr', to: !v.cell ? { name: 'void' } : v.cell.past ? v.cell.ety : cty(v.cell) };
        case 'vec': return v.arr ? ARR(v.elem, v.items.length) : { name: 'vector', elem: v.elem };
        case 'obj': return { name: v.cls };
      }
      return { name: 'void' };
    }
    const cty = c => (c.ty && c.ty.name !== 'auto' ? c.ty : vty(c.val));
    const sizeV = c => sizeTy(cty(c));
    function place(c, a) { // put c at address a, and lay out everything inside it
      c.addr = a;
      const v = c.val;
      if (v.t === 'obj') {
        const cls = prog.classes[v.cls], L = layoutOf(cls);
        if (cls.flat === undefined) cls.flat = cls.fields.every(fd => !fd.dims.length && isPrimTy(fd.ty));
        if (cls.flat && v._at === a) return; // only plain fields: nothing inside can have moved
        v._at = a;
        for (const k in v.fields) { const f = v.fields[k]; f.up = c; place(f, a + L.offs[k]); }
      } else if (v.t === 'vec') {
        const es = sizeTy(v.elem), n = v.items.length;
        v.owner = c;
        let b = a;
        if (!v.arr) { // a vector's elements live in a separate heap buffer
          if (!n && v.buf == null) return;
          if (v.buf == null || n > v.cap) { v.cap = Math.max(n, (v.cap || 0) * 2, 1); v.buf = heapBump(v.cap * es); }
          b = v.buf;
        }
        if (v._at === b && v._n === n && isPrimTy(v.elem) && (!n || (v.items[0].addr === b && v.items[n - 1].addr === b + (n - 1) * es))) return;
        v._at = b; v._n = n;
        v.items.forEach((it, i) => { it.home = v; it.ix = i; it.up = c; place(it, b + i * es); });
      }
    }
    function heapBump(n) { const a = up(hp, 16); hp = a + up(Math.max(n, 1), 16) + 16; return a; } // +16: malloc's bookkeeping
    function rawStack(n, al) { sp = Math.floor((sp - n) / al) * al; return sp; }
    function stackAlloc(c, keep) { place(c, rawStack(sizeV(c), alignTy(cty(c)))); if (keep) live.add(c); }
    function globalAlloc(c) { gp = up(gp, alignTy(cty(c))); place(c, gp); gp += sizeV(c); live.add(c); }
    function heapAlloc(c) { place(c, heapBump(sizeV(c))); }
    function relayout() {
      for (const c of live) place(c, c.addr);
      for (const h of heap) if (!h.freed) place(h, h.addr);
    }
    function addrOf(c) {
      if (c.past) return endAddr(c);
      if (c.addr === undefined) relayout();
      return c.addr ?? null;
    }
    function markFreed(c) {
      c.freed = true;
      if (c.val.t === 'obj') Object.values(c.val.fields).forEach(markFreed);
      if (c.val.t === 'vec' && c.val.arr) c.val.items.forEach(markFreed);
    }
    const hidOf = c => c.hid || (c.home && c.home.owner && c.home.owner.hid) || (c.single && c.single.hid) || null;

    // ----- pointers into arrays: a pointer holds an element cell, or a one-past-the-end marker
    function homeOf(c) {
      if (c.home === undefined) { relayout(); if (c.home === undefined) c.home = null; }
      return c.home && c.home.items[c.ix] === c ? c.home : null;
    }
    function region(c) { // the array c lives in: { items, idx, ety, home | single }
      if (c.past) return c.home ? { home: c.home, items: c.home.items, idx: c.idx, ety: c.ety } : { single: c.single, items: [c.single], idx: 1, ety: c.ety };
      const h = homeOf(c);
      if (h) return { home: h, items: h.items, idx: c.ix, ety: h.elem };
      return { single: c, items: [c], idx: 0, ety: cty(c) };
    }
    function endCell(R) { // cached so p == q works for two one-past-the-end pointers
      const o = R.home || R.single, n = R.items.length;
      if (!o.end || o.end.idx !== n) o.end = { id: ++cellId, past: true, home: R.home || null, single: R.single || null, idx: n, ety: R.ety, get val() { return { t: 'uninit', of: R.ety.name }; }, set val(x) {} };
      return o.end;
    }
    function endAddr(c) {
      if (c.single) { const a = addrOf(c.single); return a == null ? null : a + sizeV(c.single); }
      const h = c.home, es = sizeTy(h.elem);
      if (h.arr) { if (!h.owner) relayout(); const a = h.owner ? addrOf(h.owner) : null; return a == null ? null : a + c.idx * es; }
      return h.buf != null ? h.buf + c.idx * es : null;
    }
    const isArrV = v => v.t === 'vec' && v.arr;
    function decay(v) { // an array used as a value turns into a pointer to its first element
      if (!isArrV(v)) return v;
      return { t: 'ptr', cell: v.items.length ? v.items[0] : endCell({ home: v, items: v.items, idx: 0, ety: v.elem }) };
    }
    function arrName(R) {
      if (R.single) return nameOf(R.single) || 'that variable';
      if (!R.home.owner) relayout();
      return (R.home.owner && nameOf(R.home.owner)) || 'the array';
    }
    function ptrTarget(pv) {
      const c = pv.cell;
      if (!c) return 'nothing (nullptr)';
      if (c.past) return `one past the end of ${arrName(region(c))}`;
      return nameOf(c) || 'a temporary';
    }
    function unitText(ety, n) {
      const t = tyName(ety) || 'element', a = Math.abs(n);
      return `${a} ${a === 1 ? t : /^\w+$/.test(t) ? t + 's' : t + ' elements'} (${a * sizeTy(ety)} bytes)`;
    }
    function checkPtr(pv, e) {
      const what = exprText(e.o || e.e || e);
      if (pv.t === 'uninit') err(`${what} was never given an address, so it points to random memory.`, e.line);
      if (pv.t !== 'ptr') err(`Only pointers can be followed with * or ->. ${what} is ${typeName(pv)}.${pv.t === 'obj' ? ' Use . instead of ->.' : ''}`, e.line);
      if (!pv.cell) err('Null pointer! This pointer is nullptr (it points to nothing), so following it crashes the program.', e.line);
      if (pv.cell.freed || (pv.cell.past && (pv.cell.single || pv.cell.home.owner || {}).freed)) err('Use after delete! This memory was already deleted, so the pointer is dangling. In real C++ this is undefined behavior.', e.line);
    }
    function ptrMove(pv, n, e, what) { // pointer + n elements
      pv = decay(pv);
      if (pv.t === 'ptr' && !pv.cell) err(`${what}: this pointer is nullptr, so it doesn't point into any array. Pointer arithmetic only works on a pointer into an array.`, e.line);
      checkPtr(pv, e);
      const R = region(pv.cell), j = R.idx + n, len = R.items.length;
      const arr = R.single ? `${arrName(R)}, which is a single ${tyName(R.ety)} (not an array)` : `${arrName(R)}, which has ${len} element${len === 1 ? '' : 's'}`;
      if (j < 0) err(`${what} would point ${-j} element${j === -1 ? '' : 's'} before the start of ${arr}. A pointer may only move around inside its array (or to one past the end).`, e.line);
      if (j > len) err(`${what} would point ${j - len + 1} elements past the last element of ${arr}. C++ lets a pointer go at most one past the end, and never further.`, e.line);
      return { t: 'ptr', cell: j === len ? endCell(R) : R.items[j] };
    }
    function ptrIndex(pv, e) { // the pointer must point at a real element, not one past the end
      const c = pv.cell;
      if (c && c.past) {
        const R = region(c), len = R.items.length;
        err(R.single
          ? `${exprText(e.o || e.e || e)} points just past ${arrName(R)}, which is a single ${tyName(R.ety)}. Nothing there belongs to your program, so it can't be read or written.`
          : `${exprText(e.o || e.e || e)} points one past the end of ${arrName(R)} (it has ${len} element${len === 1 ? '' : 's'}, indexes 0 to ${len - 1}). That spot isn't part of the array, so reading or writing it is a bug: real C++ would quietly use whatever memory comes next.`, e.line);
      }
      return c;
    }
    function samePlace(a, b) { const x = region(a), y = region(b); return x.home ? x.home === y.home : x.single === y.single; }

    function err(msg, line) {
      const e = new CppError(msg, line ?? (top() ? top().line : 1));
      e.runtime = true;
      if (!halted) { halted = true; snapshot(e.line, 'error', msg); }
      throw e;
    }

    // ----- naming & display
    function findIn(val, c, path) {
      if (val.t === 'obj') for (const k in val.fields) {
        const f = val.fields[k];
        if (f === c) return `${path}.${k}`;
        const r = findIn(f.val, c, `${path}.${k}`); if (r) return r;
      }
      if (val.t === 'vec') for (let i = 0; i < val.items.length; i++) {
        const it = val.items[i];
        if (it === c) return `${path}[${i}]`;
        const r = findIn(it.val, c, `${path}[${i}]`); if (r) return r;
      }
      return null;
    }
    function nameOf(c) {
      for (let k = frames.length - 1; k >= -1; k--) {
        const f = k < 0 ? globals : frames[k];
        for (const v of f.vars) {
          if (v.ref || v.isThis) continue;
          if (v.cell === c) return v.name;
          const r = findIn(v.cell.val, c, v.name); if (r) return r;
        }
      }
      for (const h of heap) {
        if (h === c) return `heap #${h.hid}`;
        const r = findIn(h.val, c, `heap #${h.hid}`); if (r) return r;
      }
      return null;
    }
    const visible = s => s.replace(/\n/g, '\\n').replace(/\t/g, '\\t').replace(/\0/g, '\\0');
    function fmtDouble(v, display) {
      if (!isFinite(v)) return isNaN(v) ? 'nan' : v > 0 ? 'inf' : '-inf';
      if (display) return Number.isInteger(v) ? v.toFixed(1) : String(parseFloat(v.toPrecision(12)));
      if (fmt.fixed) return v.toFixed(fmt.prec);
      let s = v.toPrecision(Math.max(1, fmt.prec));
      if (s.includes('e')) {
        let [m, ex] = s.split('e');
        if (m.includes('.')) m = m.replace(/\.?0+$/, '');
        const n = parseInt(ex, 10);
        return `${m}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
      }
      if (s.includes('.')) s = s.replace(/\.?0+$/, '');
      return s;
    }
    function disp(v, depth = 0) {
      switch (v.t) {
        case 'int': return { t: 'p', text: String(v.v) };
        case 'double': return { t: 'p', text: fmtDouble(v.v, true) };
        case 'bool': return { t: 'p', text: v.v ? 'true' : 'false' };
        case 'char': return { t: 'p', text: `'${visible(v.v)}'` };
        case 'string': return { t: 'p', text: `"${visible(v.v)}"` };
        case 'uninit': return { t: 'u' };
        case 'ptr':
          if (!v.cell) return { t: 'ptr', target: null, to: null };
          if (v.cell.freed) return { t: 'ptr', dangling: true, heap: hidOf(v.cell), to: addrOf(v.cell) };
          if (v.cell.past) return { t: 'ptr', target: ptrTarget(v), tid: null, heap: hidOf(v.cell), to: addrOf(v.cell), past: true };
          return { t: 'ptr', target: nameOf(v.cell) || 'a temporary', tid: v.cell.id, heap: hidOf(v.cell), to: addrOf(v.cell) };
        case 'obj': {
          const cls = prog.classes[v.cls];
          return {
            t: 'obj', cls: v.cls,
            fields: Object.entries(v.fields).map(([k, c]) => ({
              name: k, id: c.id, addr: c.addr ?? null, size: sizeV(c), ty: tyName(cty(c)),
              priv: (cls.fields.find(f => f.name === k) || {}).access !== 'public',
              val: depth > 4 ? { t: 'p', text: '…' } : disp(c.val, depth + 1),
            })),
          };
        }
        case 'vec':
          return { t: 'vec', items: v.items.slice(0, 40).map(c => ({ id: c.id, addr: c.addr ?? null, size: sizeV(c), ty: tyName(cty(c)), val: disp(c.val, depth + 1) })), more: Math.max(0, v.items.length - 40) };
        default: return { t: 'p', text: '?' };
      }
    }
    function short(v) {
      const d = disp(v);
      if (d.t === 'p') return d.text;
      if (d.t === 'u') return '(no value yet)';
      if (d.t === 'obj') return `a ${d.cls}`;
      if (d.t === 'vec') return `[${d.items.map(i => (i.val.t === 'p' ? i.val.text : '…')).join(', ')}${d.more ? ', …' : ''}]`;
      if (d.t === 'ptr') return d.target ? `the address of ${d.target}` : d.dangling ? 'a dangling address' : 'nullptr';
      return '?';
    }
    function typeName(v) {
      return { int: 'an int', double: 'a double', bool: 'a bool', char: 'a char', string: 'a string', ptr: 'a pointer', obj: `a ${v.cls}`, vec: 'a vector', void: 'nothing (void)', uninit: 'an uninitialized value', ostream: 'cout', istream: 'cin', endl: 'endl' }[v.t] || v.t;
    }
    function exprText(e) {
      switch (e.k) {
        case 'id': return e.name;
        case 'member': return `${exprText(e.o)}.${e.name}`;
        case 'arrow': return `${exprText(e.o)}->${e.name}`;
        case 'index': return `${exprText(e.o)}[${exprText(e.i)}]`;
        case 'un': return e.op + exprText(e.e);
        case 'num': return String(e.v);
        case 'this': return 'this';
        case 'call': return `${exprText(e.f)}(…)`;
        case 'bin': return `${exprText(e.l)} ${e.op} ${exprText(e.r)}`;
        case 'post': return exprText(e.e) + e.op;
        default: return 'it';
      }
    }

    function snapshot(line, kind, note) {
      if (steps.length >= MAX) {
        const e = new CppError(`Stopped after ${MAX} steps. Is there an infinite loop?`, line);
        e.runtime = true; e.limit = true; halted = true;
        throw e;
      }
      if (top()) top().line = line;
      relayout();
      const fv = f => f.vars.map(v => ({
        name: v.name, anchor: v.anchor, id: v.cell.id, isThis: !!v.isThis,
        ref: v.ref ? nameOf(v.cell) || 'a temporary value' : null,
        val: v.isThis ? disp({ t: 'ptr', cell: v.cell }) : disp(v.cell.val),
        ...(v.isThis ? { addr: v.slot ?? null, size: 8, ty: `${v.cell.val.cls}*` }
          : { addr: v.cell.addr ?? null, size: sizeV(v.cell), ty: tyName(cty(v.cell)) + (v.ref ? '&' : '') }),
      }));
      steps.push({
        line, kind, note: note || null, did,
        frames: frames.map(f => ({ uid: f.def ? f.def.uid : null, label: f.label, callLine: f.callLine, vars: fv(f) })),
        globals: fv(globals),
        heap: heap.map(h => ({ hid: h.hid, id: h.id, freed: !!h.freed, val: h.freed ? null : disp(h.val), addr: h.addr ?? null, size: sizeV(h), ty: tyName(cty(h)) })),
        out,
        temp: temp ? { line: temp.line, val: disp(temp.val) } : null,
      });
      did = [];
    }

    // ----- values
    function num(x, line) {
      switch (x.t) {
        case 'int': case 'double': return x.v;
        case 'bool': return x.v ? 1 : 0;
        case 'char': return x.v.charCodeAt(0);
        case 'uninit': return err('A variable is used before it was given a value. In real C++ it would hold random garbage.', line);
        default: return err(`Expected a number here, but got ${typeName(x)}.`, line);
      }
    }
    function truthy(v, line) {
      if (v.t === 'bool') return v.v;
      if (v.t === 'ptr') return !!v.cell;
      return num(v, line) !== 0;
    }
    function copy(v) {
      if (v.t === 'obj') { const f = {}; for (const k in v.fields) f[k] = cell(copy(v.fields[k].val), { ty: v.fields[k].ty }); return { ...v, fields: f, _at: undefined }; }
      if (v.t === 'vec') return { t: 'vec', arr: v.arr, elem: v.elem, items: v.items.map(c => cell(copy(c.val), { ty: c.ty })) };
      return v;
    }
    function assignInto(c, v) { // c = v, member by member, so fields/slots keep their cells (and addresses)
      const o = c.val;
      if (o.t === 'obj' && v.t === 'obj' && o.cls === v.cls && o !== v) { for (const k in o.fields) assignInto(o.fields[k], v.fields[k].val); return; }
      if (isArrV(o) && isArrV(v) && o.items.length === v.items.length && o !== v) { o.items.forEach((it, i) => assignInto(it, v.items[i].val)); return; }
      const nv = copy(v);
      if (o.t === 'vec' && !o.arr && nv.t === 'vec' && o.buf != null && o.cap >= nv.items.length) { nv.buf = o.buf; nv.cap = o.cap; }
      c.val = nv;
    }
    function convert(v, ty, line) {
      if (!ty || ty.name === 'auto') return v;
      if (v.t === 'uninit') return err('A variable is used before it was given a value. In real C++ it would hold random garbage.', line);
      if (v.t === 'void') return err('This function returns nothing (void), so its result can\'t be stored or used.', line);
      switch (ty.name) {
        case 'int': return I(num(v, line));
        case 'double': return D(num(v, line));
        case 'bool': return B(v.t === 'ptr' ? v.cell : num(v, line));
        case 'char': return v.t === 'char' ? v : C(String.fromCharCode(num(v, line)));
        case 'string':
          if (v.t === 'string') return v;
          if (v.t === 'char') return S(v.v);
          return err(`Can't store ${typeName(v)} in a string.${v.t === 'int' || v.t === 'double' ? ' Use to_string(...) to convert a number to text.' : ''}`, line);
        case 'ptr':
          if (v.t === 'ptr') return v;
          if (isArrV(v)) return decay(v);
          return err(`Can't store ${typeName(v)} in a pointer. Pointers hold addresses, like &x or new ...`, line);
        case 'vector':
          if (v.t === 'vec') return v;
          return err(`Can't store ${typeName(v)} in a vector.`, line);
        case 'void': return VOID;
        case 'array': if (isArrV(v)) return v; return err(`Can't store ${typeName(v)} in an array.`, line);
        default:
          if (v.t === 'obj' && v.cls === ty.name) return v;
          return err(`Can't store ${typeName(v)} in a ${ty.name}.`, line);
      }
    }
    function convertLike(v, old, line) {
      if (old.t === 'uninit') return convert(v, { name: old.of === 'pointer' ? 'ptr' : old.of }, line);
      const map = { int: 'int', double: 'double', bool: 'bool', char: 'char', string: 'string', ptr: 'ptr', vec: 'vector' };
      if (map[old.t]) return convert(v, { name: map[old.t] }, line);
      if (old.t === 'obj') return convert(v, { name: old.cls }, line);
      return v;
    }
    function zeroOf(ty, line) {
      switch (ty.name) {
        case 'int': return I(0);
        case 'double': return D(0);
        case 'bool': return B(false);
        case 'char': return C('\0');
        case 'string': return S('');
        case 'ptr': return NULLPTR;
        case 'vector': return { t: 'vec', elem: ty.elem, items: [] };
        default: {
          const cls = prog.classes[ty.name];
          if (cls) { const c = cell(shell(cls), { ty }); construct(cls, c, [], line, `a new ${cls.name}`); return c.val; }
          return I(0);
        }
      }
    }
    function defaultVal(ty, line, isGlobal) {
      switch (ty.name) {
        case 'int': case 'double': case 'bool': case 'char':
          return isGlobal ? zeroOf(ty) : { t: 'uninit', of: ty.name };
        case 'ptr': return isGlobal ? NULLPTR : { t: 'uninit', of: 'pointer' };
        case 'auto': return err('A variable declared with auto needs a starting value, so C++ can work out its type.', line);
        default: return zeroOf(ty, line);
      }
    }
    function shell(cls) {
      const fields = {};
      for (const fd of cls.fields) fields[fd.name] = cell({ t: 'uninit', of: fd.ty.name === 'ptr' ? 'pointer' : fd.ty.name }, { ty: fieldTy(fd) });
      return { t: 'obj', cls: cls.name, fields };
    }

    // ----- scopes
    function addVar(f, name, c, anchor, extra = {}) {
      const v = { name, cell: c, anchor, ...extra };
      if (!v.ref && !v.isThis && c.addr === undefined) (f === globals ? globalAlloc(c) : stackAlloc(c, true));
      f.vars.push(v);
      f.scopes[f.scopes.length - 1].push(v);
      return v;
    }
    function pushScope() { const sc = []; sc.sp = sp; top().scopes.push(sc); }
    function popScope(line) {
      if (halted) return;
      const f = top();
      const sc = f.scopes.pop();
      for (let i = sc.length - 1; i >= 0; i--) {
        const v = sc[i];
        if (!v.ref && !v.isThis && !v.cell.moved) destroyVal(v.cell, line, v.name);
      }
      f.vars = f.vars.filter(v => !sc.includes(v));
      for (const v of sc) if (!v.ref && !v.isThis) live.delete(v.cell);
      if (sc.sp != null) sp = sc.sp;
    }
    function destroyVal(c, line, label) {
      if (c.val.t === 'obj') {
        const cls = prog.classes[c.val.cls];
        if (cls.dtor && cls.dtor.body) { say(`${label} is going away, so its destructor runs`); callFunc(cls.dtor, [], line, c, { quietReturn: true }); }
      } else if (c.val.t === 'vec') {
        const its = c.val.items.map((it, i) => [it, i]);
        if (c.val.arr) its.reverse(); // array elements are destroyed last-to-first
        its.forEach(([it, i]) => destroyVal(it, line, `${label}[${i}]`));
      }
    }
    function lookupVar(name) {
      const f = top();
      if (f) {
        for (let i = f.vars.length - 1; i >= 0; i--) if (f.vars[i].name === name && !f.vars[i].isThis) return f.vars[i].cell;
        if (f.thisCell) { const o = f.thisCell.val; if (o.fields && name in o.fields) return o.fields[name]; }
      }
      for (const v of globals.vars) if (v.name === name) return v.cell;
      return null;
    }

    // ----- declarations
    function declare(d, f, isGlobal) {
      const anchor = d.line;
      if (d.ref) {
        if (!d.init) err(`The reference '${d.name}' must be connected to a variable when it's created, like int& ${d.name} = x;`, d.line);
        const c = lval(d.init);
        addVar(f, d.name, c, anchor, { ref: true });
        say(`${d.name} is a reference: another name for ${nameOf(c) || 'that value'}`);
        return;
      }
      const ty = d.ty;
      if (d.dims.length) {
        let list = d.init && d.init.k === 'list' ? d.init : null;
        if (d.init && d.init.k === 'str' && ty.name === 'char' && d.dims.length === 1) list = node0('list', d.line, { items: [...d.init.v, '\0'].map(v => node0('char', d.line, { v })) });
        if (d.init && !list) err(`An array is filled with a { } list, like int ${d.name}[3] = {1, 2, 3};`, d.line);
        const dims = d.dims.map((x, k) => (x ? num(evalE(x), d.line) : k === 0 && list ? list.items.length : err(`The array ${d.name} needs a size inside [ ].`, d.line)));
        for (const n of dims) if (n < 0 || n > 10000 || !Number.isInteger(n)) err(`An array size of ${n} isn't allowed here.`, d.line);
        if (dims.reduce((x, y) => x * y, 1) > 100000) err('This array is too big for the visualizer.', d.line);
        const aty = dims.reduceRight((t, n) => ARR(t, n), ty);
        const c = cell(mkArr(aty), { ty: aty });
        addVar(f, d.name, c, anchor);
        initArr(c, list, d.line, !!d.init || isGlobal, d.name);
        const n = dims[0];
        say(dims.length === 1 ? `${d.name} is an array with ${n} slot${n === 1 ? '' : 's'}` : `${d.name} is a ${dims.join('×')} array: ${n} row${n === 1 ? '' : 's'} of ${dims.slice(1).join('×')}, stored one after another in memory`);
        return;
      }
      const cls = prog.classes[ty.name];
      if (cls && (!d.init || d.init.k === 'list' || (d.init.k === 'construct' && d.init.cls === cls.name))) {
        const c = cell(shell(cls), { ty });
        addVar(f, d.name, c, anchor);
        if (d.isConst) c.isConst = true;
        say(`Space for ${d.name} is reserved. Now its constructor builds it`);
        construct(cls, c, d.init ? (d.init.k === 'list' ? d.init.items : d.init.args) : d.args || [], d.line, d.name);
        return;
      }
      if (cls) { // Box b = a;  Box b = makeBox();  Box b = 5;
        const c = cell(shell(cls), { ty });
        addVar(f, d.name, c, anchor);
        const src = isLvalExpr(d.init) ? lval(d.init) : null;
        const v = src ? src.val : evalE(d.init);
        if (v.t === 'obj' && v.cls === cls.name) {
          if (src) copyObj(cls, c, src, d.line, d.name, exprText(d.init));
          else { c.val = v; say(`New variable ${d.name} = ${short(v)}`); }
        } else {
          say(`Space for ${d.name} is reserved. Now its constructor builds it`);
          construct(cls, c, [{ k: 'val', v, cell: src, line: d.line }], d.line, d.name);
        }
        if (d.isConst) c.isConst = true;
        return;
      }
      let val;
      if (d.init) {
        if (d.init.k === 'list') {
          if (ty.name === 'vector') val = initVal(ty, d.init, d.line, d.name);
          else val = d.init.items.length ? copy(convert(evalE(d.init.items[0]), ty, d.line)) : zeroOf(ty, d.line);
        } else val = copy(convert(evalE(d.init), ty, d.line));
      } else if (d.args) {
        if (ty.name === 'vector') {
          const n = d.args[0] ? num(evalE(d.args[0]), d.line) : 0;
          if (n < 0 || n > 10000) err(`A vector size of ${n} isn't allowed here.`, d.line);
          const fill = d.args[1] ? convert(evalE(d.args[1]), ty.elem, d.line) : null;
          val = { t: 'vec', elem: ty.elem, items: Array.from({ length: n }, () => cell(fill ? copy(fill) : zeroOf(ty.elem, d.line), { ty: ty.elem })) };
        } else if (ty.name === 'string' && d.args.length === 2) {
          const n = num(evalE(d.args[0]), d.line), ch = convert(evalE(d.args[1]), { name: 'char' }, d.line);
          val = S(ch.v.repeat(Math.max(0, n)));
        } else val = d.args.length ? copy(convert(evalE(d.args[0]), ty, d.line)) : zeroOf(ty, d.line);
      } else val = defaultVal(ty, d.line, isGlobal);
      const c = cell(val, { ty });
      if (d.isConst) c.isConst = true;
      addVar(f, d.name, c, anchor);
      say(val.t === 'uninit'
        ? `${d.name} is created, but has no value yet (in real C++ it holds random garbage)`
        : `New variable ${d.name} = ${short(val)}`);
    }
    const node0 = (k, line, props) => ({ k, line, ...props });
    function mkArr(aty) { // array storage with placeholder slots (filled by initArr once it has an address)
      const e = aty.of, cls = prog.classes[e.name];
      return { t: 'vec', arr: true, elem: e, items: Array.from({ length: aty.n }, () => cell(e.name === 'array' ? mkArr(e) : cls ? shell(cls) : { t: 'uninit', of: e.name === 'ptr' ? 'pointer' : e.name }, { ty: e })) };
    }
    function initArr(c, list, line, zero, label) {
      const v = c.val, cls = prog.classes[v.elem.name];
      if (list && list.items.length > v.items.length) err(`${label} has ${v.items.length} slot${v.items.length === 1 ? '' : 's'}, but ${list.items.length} values were given.`, line);
      v.items.forEach((it, i) => {
        const x = list ? list.items[i] : undefined, lab = `${label}[${i}]`;
        if (v.elem.name === 'array') {
          if (x && x.k !== 'list') err(`${label} is a 2D array, so give each row its own { }, like {{1, 2}, {3, 4}}.`, line);
          return initArr(it, x || null, line, zero || !!list, lab);
        }
        if (cls) {
          if (!x) construct(cls, it, [], line, lab);
          else if (x.k === 'list') construct(cls, it, x.items, line, lab);
          else if (x.k === 'construct' && x.cls === cls.name) construct(cls, it, x.args, line, lab);
          else construct(cls, it, [x], line, lab);
          return;
        }
        it.val = x ? initVal(v.elem, x, line, lab) : zero ? zeroOf(v.elem, line) : defaultVal(v.elem, line, false);
      });
    }
    function initVal(ty, x, line, label) { // value for one slot from an expression or a { } list
      const cls = prog.classes[ty.name];
      if (cls && (x.k === 'list' || (x.k === 'construct' && x.cls === cls.name))) {
        const c = cell(shell(cls), { ty });
        construct(cls, c, x.k === 'list' ? x.items : x.args, line, label);
        return c.val;
      }
      if (x.k === 'list') {
        if (ty.name === 'vector') return { t: 'vec', elem: ty.elem, items: x.items.map((y, i) => cell(initVal(ty.elem, y, line, `${label}[${i}]`), { ty: ty.elem })) };
        return x.items.length ? copy(convert(evalE(x.items[0]), ty, line)) : zeroOf(ty, line);
      }
      return copy(convert(evalE(x), ty, line));
    }
    const copyCtorOf = cls => cls.ctors.find(f => f.params.length && f.params[0].ty.name === cls.name && f.params[0].ref && f.params.slice(1).every(x => x.def) && !f.proto);
    function copyObj(cls, dst, src, line, label, srcText) { // copy-construct dst from src
      const cc = copyCtorOf(cls);
      if (cc) { callFunc(cc, [{ cell: src, val: src.val }], line, dst, { label: `${cls.name} copy constructor` }); return; }
      dst.val = copy(src.val);
      const ptrs = Object.keys(src.val.fields).filter(k => src.val.fields[k].val.t === 'ptr');
      say(`${label} is a copy of ${srcText}: every field is copied one by one${ptrs.length ? `. ${ptrs.join(', ')} ${ptrs.length > 1 ? 'are pointers' : 'is a pointer'}, so only the address is copied: both objects now point to the SAME memory (a shallow copy)` : ''}`);
    }

    // ----- functions
    function argScore(prm, v) { // how well a value fits a parameter (for picking an overload)
      const t = prm.ty, vt = v.t === 'uninit' ? (v.of === 'pointer' ? 'ptr' : v.of) : v.t;
      const NUM = ['int', 'double', 'bool', 'char'];
      if (t.arr) return isArrV(v) ? 3 : vt === 'ptr' ? 2 : -100;
      if (t.name === 'auto') return 1;
      if (vt === 'obj') return v.cls === t.name ? 3 : -100;
      if (t.name === 'vector') return vt === 'vec' && !v.arr ? 3 : -100;
      if (t.name === 'ptr') {
        if (isArrV(v)) return tyName(v.elem) === tyName(t.to) ? 3 : 1;
        if (vt !== 'ptr') return -100;
        return !v.cell || tyName(v.cell.past ? v.cell.ety : cty(v.cell)) === tyName(t.to) ? 3 : 1;
      }
      if (vt === t.name) return 3;
      if (NUM.includes(t.name) && NUM.includes(vt)) return 2;
      if (t.name === 'string' && vt === 'char') return 1;
      return -100;
    }
    function pickFunc(list, args, what, line) {
      const nargs = args.length;
      const ok = list.filter(f => (!f.proto || f.defaulted) && nargs <= f.params.length && nargs >= f.params.filter(x => !x.def).length);
      if (!ok.length) {
        if (list.some(f => f.params.length === nargs)) err(`${what} is declared but never defined (it has no body).`, line);
        const counts = [...new Set(list.map(f => f.params.length))].join(' or ');
        err(`${what} takes ${counts} argument${counts === '1' ? '' : 's'}, but ${nargs} ${nargs === 1 ? 'was' : 'were'} given.`, line);
      }
      if (ok.length === 1) return ok[0];
      let best = null, bs = -Infinity;
      for (const f of ok) { // overloads: the best match of argument types wins
        let sc = f.params.length === nargs ? 0.5 : 0;
        args.forEach((a, i) => { sc += argScore(f.params[i], a.val); });
        if (sc > bs) { bs = sc; best = f; }
      }
      return best;
    }
    const isLvalExpr = e => ['id', 'member', 'arrow', 'index'].includes(e.k) || (e.k === 'un' && e.op === '*');
    function evalArgs(exprs) { // evaluate arguments once: { val, cell (if it names storage), e }
      return exprs.map(x => {
        if (x.k === 'val') return { cell: x.cell, val: x.v, e: x };
        if (isLvalExpr(x) || x.k === 'call') { const c = lval(x); return { cell: c, val: c.val, e: x }; }
        return { val: evalE(x), e: x };
      });
    }
    function bindArgs(def, args) {
      return args.map((a, i) => {
        const prm = def.params[i];
        if (prm && (prm.ref || prm.ty.arr)) {
          if (!a.cell) {
            if (!prm.isConst) err(`'${prm.name}' is a non-const reference, so it must be given a variable, not a temporary value.`, a.e.line);
            return { val: a.val };
          }
          return a;
        }
        if (a.val.t === 'uninit' && a.e.k === 'id') err(`'${a.e.name}' is used before it was given a value. In real C++ it would hold random garbage.`, a.e.line);
        return a;
      });
    }
    function construct(cls, c, argExprs, line, label) {
      if (!cls.ctors.length) {
        if (argExprs.length) {
          // aggregate init: Point p{1, 2};
          if (argExprs.length > cls.fields.length) err(`${cls.name} has only ${cls.fields.length} fields.`, line);
          if (argExprs.length === 1 && argExprs[0].k !== 'list') { // Point b(a): a copy
            const x = argExprs[0], src = x.k === 'val' ? x.cell || cell(x.v) : isLvalExpr(x) ? lval(x) : cell(evalE(x));
            if (src.val.t === 'obj' && src.val.cls === cls.name) { copyObj(cls, c, src, line, label, exprText(x)); return; }
            argExprs = [{ k: 'val', v: src.val, cell: src, line }];
          }
          cls.fields.forEach((fd, i) => {
            const fc = c.val.fields[fd.name], x = i < argExprs.length ? argExprs[i] : fd.init, lab = `${label}.${fd.name}`;
            if (fd.dims.length) {
              if (x && x.k !== 'list') err(`${fd.name} is an array, so it needs a { } list.`, line);
              fc.val = mkArr(fieldTy(fd)); initArr(fc, x || null, line, true, lab);
            } else fc.val = x ? initVal(fd.ty, x, line, lab) : zeroOf(fd.ty, line);
          });
          say(`${label}'s fields are filled in order`);
          return;
        }
        initFields(cls, c, null, line);
        return;
      }
      const args = evalArgs(argExprs);
      if (args.length === 1 && args[0].val.t === 'obj' && args[0].val.cls === cls.name && !copyCtorOf(cls)) {
        copyObj(cls, c, args[0].cell || cell(args[0].val), line, label, exprText(args[0].e)); return;
      }
      const def = pickFunc(cls.ctors, args, `The ${cls.name} constructor`, line);
      if (def.defaulted) { initFields(cls, c, null, line); return; }
      callFunc(def, bindArgs(def, args), line, c, { label: `${cls.name} ${def === copyCtorOf(cls) ? 'copy ' : ''}constructor` });
    }
    function initFields(cls, objCell, inits, line) {
      if (inits) for (const i of inits) if (!cls.fields.some(f => f.name === i.name)) err(`'${i.name}' is not a field of ${cls.name}.`, i.line);
      for (const fd of cls.fields) {
        const init = inits && inits.find(i => i.name === fd.name);
        const fc = objCell.val.fields[fd.name];
        const fcls = prog.classes[fd.ty.name];
        if (init) {
          if (fcls) { fc.val = shell(fcls); construct(fcls, fc, init.args, init.line, fd.name); }
          else {
            fc.val = init.args.length ? copy(convert(evalE(init.args[0]), fd.ty, init.line)) : zeroOf(fd.ty, line);
            say(`${fd.name} = ${short(fc.val)} (from the initializer list)`);
          }
        } else if (fd.dims.length) {
          fc.val = mkArr(fieldTy(fd));
          initArr(fc, fd.init && fd.init.k === 'list' ? fd.init : null, fd.line, !!fd.init, fd.name);
        } else if (fd.init) {
          fc.val = initVal(fd.ty, fd.init, fd.line, fd.name);
        } else if (fcls || fd.ty.name === 'string' || fd.ty.name === 'vector') {
          if (fcls) { fc.val = shell(fcls); construct(fcls, fc, [], line, fd.name); } else fc.val = zeroOf(fd.ty, line);
        }
      }
    }
    function callFunc(def, args, callLine, thisCell, opts = {}) {
      if (frames.length > 120) err('Stack overflow: too many function calls inside each other. Is a recursive function missing its base case?', callLine);
      const label = opts.label || (def.cls ? `${def.cls}::${def.name}` : def.name);
      const isMain = def.name === 'main' && !def.cls;
      const bound = isMain ? [] : def.params.map((prm, i) => {
        let a = args[i];
        if (!a) a = { val: evalE(prm.def) };
        return { prm, a };
      });
      const sp0 = sp;
      if (!isMain) sp -= 16; // return address + saved frame pointer
      const slot = thisCell ? rawStack(8, 8) : null;
      const made = bound.map(({ prm, a }) => { // value parameters are fresh copies in the new frame
        if (!prm.name || prm.ref || prm.ty.arr) return null;
        const pc = prog.classes[prm.ty.name];
        let c;
        if (pc && copyCtorOf(pc) && a.val.t === 'obj' && a.val.cls === pc.name) {
          c = cell(shell(pc), { ty: prm.ty }); stackAlloc(c, true);
          copyObj(pc, c, a.cell || cell(a.val), callLine, prm.name, a.e ? exprText(a.e) : 'the argument');
        } else { c = cell(copy(convert(a.val, prm.ty, callLine)), { ty: prm.ty }); stackAlloc(c, true); }
        return c;
      });
      const f = { label, def, callLine, vars: [], scopes: [[]], thisCell, line: def.line };
      f.scopes[0].sp = sp;
      frames.push(f);
      if (thisCell) addVar(f, 'this', thisCell, def.line, { isThis: true, slot });
      const parts = [];
      bound.forEach(({ prm, a }, i) => {
        if (!prm.name) return;
        if (prm.ref || prm.ty.arr) {
          const c = a.cell || cell(a.val);
          addVar(f, prm.name, c, def.line, { ref: true, arrParam: !!prm.ty.arr });
          parts.push(`${prm.name} → ${nameOf(c) || 'a temporary'}`);
        } else {
          const c = made[i];
          if (prm.isConst) c.isConst = true;
          addVar(f, prm.name, c, def.line);
          parts.push(`${prm.name} = ${short(c.val)}`);
        }
      });
      if (isMain) say('The program starts at main()');
      else if (def.isDtor) say(`Running the destructor of ${nameOf(thisCell) || 'the object'}`);
      else say(`Jump to ${def.isCtor ? `the ${def.cls} ${opts.label && opts.label.includes('copy') ? 'copy ' : ''}constructor` : label + '()'}${callLine ? `, leaving a 🚩 on line ${callLine}` : ''}${parts.length ? `. Copied in: ${parts.join(', ')}` : ''}`);
      snapshot(def.line, 'call');
      if (def.isCtor) initFields(prog.classes[def.cls], thisCell, def.inits, def.line);
      let ret = { val: VOID };
      try {
        for (const s of def.body.body) exec(s);
        snapshot(def.endLine, 'end');
      } catch (e) {
        if (e instanceof Ret) ret = e.val;
        else throw e;
      }
      const wantsValue = def.ret && def.ret.ty.name !== 'void' && !def.isCtor && !def.isDtor;
      if (wantsValue && ret.val.t === 'void') {
        if (isMain) ret = { val: I(0) };
        else err(`${label}() should return ${def.ret.ty.name === 'ptr' ? 'a pointer' : 'a ' + def.ret.ty.name}, but it reached its end without a return statement.`, def.endLine);
      }
      if (wantsValue && !def.ret.ref) {
        // returning a local object hands it over as is (no copy, no destructor), like real compilers do
        if (ret.elide) { ret.elide.moved = true; ret = { val: convert(ret.val, def.ret.ty, def.endLine) }; }
        else ret = { val: copy(convert(ret.val, def.ret.ty, def.endLine)) };
      }
      popScope(def.endLine);
      frames.pop();
      sp = sp0;
      if (frames.length && callLine != null && !opts.quietReturn) {
        if (wantsValue) {
          temp = { line: callLine, val: ret.val };
          say(`${label}() is done, so its 📋 is destroyed. It hands back ${short(ret.val)} to line ${callLine}`);
        } else if (def.isCtor) {
          say(`The constructor is done, so its 📋 is destroyed. ${nameOf(thisCell) || 'The object'} is fully built`);
        } else say(`${label}() is done, so its 📋 is destroyed. Back to the 🚩 on line ${callLine}`);
        snapshot(callLine, 'return');
        temp = null;
      }
      return ret;
    }

    // ----- statements
    function block(s) {
      pushScope();
      try { for (const x of s.body) exec(x); }
      finally { popScope(s.endLine); }
    }
    function branch(s) {
      if (s.k === 'block') return block(s);
      pushScope();
      try { exec(s); } finally { popScope(s.line); }
    }
    const verdict = (src, b, yes, no) => say(`(${src}) is ${b ? 'true' : 'false'}, so ${b ? yes : no}`);
    function exec(s) {
      switch (s.k) {
        case 'block': return block(s);
        case 'empty': return;
        case 'decl': snapshot(s.line, 'stmt'); for (const d of s.decls) declare(d, top()); return;
        case 'expr': snapshot(s.line, 'stmt'); evalE(s.e); return;
        case 'if': {
          snapshot(s.line, 'stmt');
          const b = truthy(evalE(s.cond), s.line);
          verdict(s.cond.src, b, 'run the if block', s.els ? 'run the else part' : 'skip the if block');
          if (b) branch(s.then); else if (s.els) branch(s.els);
          return;
        }
        case 'while':
          for (;;) {
            snapshot(s.line, 'loop');
            const b = truthy(evalE(s.cond), s.line);
            verdict(s.cond.src, b, 'run the loop body', 'the loop ends');
            if (!b) return;
            try { branch(s.body); } catch (e) { if (e === BRK) return; if (e !== CONT) throw e; }
          }
        case 'do':
          for (;;) {
            try { branch(s.body); } catch (e) { if (e === BRK) return; if (e !== CONT) throw e; }
            snapshot(s.condLine, 'loop');
            const b = truthy(evalE(s.cond), s.condLine);
            verdict(s.cond.src, b, 'go around again', 'the loop ends');
            if (!b) return;
          }
        case 'for': {
          pushScope();
          try {
            for (let first = true; ; first = false) {
              snapshot(s.line, 'loop');
              if (first) {
                if (s.init) { if (s.init.k === 'decl') for (const d of s.init.decls) declare(d, top()); else evalE(s.init.e); }
              } else if (s.step) evalE(s.step);
              const b = s.cond ? truthy(evalE(s.cond), s.line) : true;
              if (s.cond) verdict(s.cond.src, b, 'run the loop body', 'the loop ends');
              if (!b) break;
              try { branch(s.body); } catch (e) { if (e === BRK) break; if (e !== CONT) throw e; }
            }
          } finally { popScope(s.line); }
          return;
        }
        case 'forin': {
          const coll = lval(s.range);
          if (coll.val.t !== 'vec' && coll.val.t !== 'string') err('A range-for loop needs a vector, array or string to walk through.', s.line);
          for (let i = 0; ; i++) {
            snapshot(s.line, 'loop');
            const v = coll.val;
            const len = v.t === 'vec' ? v.items.length : v.v.length;
            if (i >= len) { say(`No more elements in ${s.range.src}, so the loop ends`); return; }
            let stop = false;
            pushScope();
            try {
              let c;
              if (v.t === 'vec') c = s.ref ? v.items[i] : cell(copy(convert(v.items[i].val, s.ty, s.line)), { ty: s.ty });
              else c = cell(C(v.v[i]), { ty: { name: 'char' } });
              addVar(top(), s.name, c, s.line, s.ref ? { ref: true } : {});
              say(`${s.name} = ${short(c.val)} (element ${i} of ${s.range.src})`);
              try { branch(s.body); } catch (e) { if (e === BRK) stop = true; else if (e !== CONT) throw e; }
            } finally { popScope(s.line); }
            if (stop) return;
          }
        }
        case 'return': {
          snapshot(s.line, 'stmt');
          const fdef = top().def;
          let r = { val: VOID };
          if (s.e) {
            if (fdef && fdef.ret && fdef.ret.ref) { const c = lval(s.e); r = { val: c.val, cell: c }; }
            else if (s.e.k === 'id') {
              const c = lookupVar(s.e.name);
              const local = c && c.val.t === 'obj' && top().vars.some(v => v.cell === c && !v.ref && !v.isThis);
              r = { val: evalE(s.e), elide: local ? c : null };
            } else r = { val: evalE(s.e) };
          }
          throw new Ret(r);
        }
        case 'break': snapshot(s.line, 'stmt'); throw BRK;
        case 'continue': snapshot(s.line, 'stmt'); throw CONT;
        case 'switch': {
          snapshot(s.line, 'stmt');
          const v = num(evalE(s.cond), s.line);
          let idx = s.cases.findIndex(c => c.v && num(evalE(c.v), c.line) === v);
          if (idx < 0) idx = s.cases.findIndex(c => !c.v);
          say(idx < 0 ? `No case matches ${v}, so skip the switch` : `${s.cond.src} is ${v}, so jump to ${s.cases[idx].v ? 'that case' : 'default'}`);
          if (idx < 0) return;
          pushScope();
          try { for (let i = idx; i < s.cases.length; i++) for (const x of s.cases[i].body) exec(x); }
          catch (e) { if (e !== BRK) throw e; }
          finally { popScope(s.line); }
          return;
        }
      }
    }

    // ----- expressions
    function deref(pv, e) {
      pv = decay(pv);
      checkPtr(pv, e);
      return ptrIndex(pv, e);
    }
    function checkAccess(clsName, member, access, line, kind) {
      if (access === 'public') return;
      const f = top();
      if (f && f.def && f.def.cls === clsName) return;
      err(`🔒 '${member}' is a private ${kind} of ${clsName}. Only ${clsName}'s own methods can use it, so a real compiler would refuse to build this program.`, line);
    }
    function field(c, name, e) {
      const o = c.val;
      if (o.t !== 'obj') err(`${exprText(e.o)} is ${typeName(o)}, so it has no '${name}'.${o.t === 'ptr' ? ' It\'s a pointer: use -> instead of .' : ''}`, e.line);
      const fc = o.fields[name];
      const cls = prog.classes[o.cls];
      if (!fc) {
        if (cls.methods[name]) err(`${name} is a method. Call it with ${name}().`, e.line);
        err(`${o.cls} has no field named '${name}'.`, e.line);
      }
      checkAccess(o.cls, name, cls.fields.find(f => f.name === name).access, e.line, 'field');
      return fc;
    }
    function strCell(c, i) {
      return {
        id: `${c.id}:${i}`,
        get val() { return C(c.val.v[i]); },
        set val(x) { const s = c.val.v; c.val = S(s.slice(0, i) + x.v + s.slice(i + 1)); },
      };
    }
    function lval(e) {
      switch (e.k) {
        case 'id': {
          const c = lookupVar(e.name);
          if (!c) err(`'${e.name}' is not declared. Is it misspelled, or declared somewhere this code can't see?`, e.line);
          return c;
        }
        case 'member': return field(lval(e.o), e.name, e);
        case 'arrow': return field(deref(evalE(e.o), e), e.name, e);
        case 'index': {
          const c = lval(e.o);
          const i = num(evalE(e.i), e.line);
          let v = c.val;
          if (v.t === 'ptr' || (v.t === 'uninit' && v.of === 'pointer')) {
            const t = v.cell;
            if (t && !t.past && !t.freed && (t.val.t === 'vec' || t.val.t === 'string') && !homeOf(t)) v = deref(v, e).val; // pointer to a whole vector/string
            else { // p[i] is *(p + i)
              checkPtr(v, e);
              const R = region(v.cell), j = R.idx + i, len = R.items.length;
              if (j < 0 || j >= len || !Number.isInteger(i)) err(`Index ${i} is out of range! ${exprText(e.o)} points to ${R.single ? `${arrName(R)}, a single ${tyName(R.ety)} (not an array)` : `${R.idx ? `element ${R.idx} of ` : ''}${arrName(R)}, which has ${len} element${len === 1 ? '' : 's'}`}, so ${exprText(e)} would be element ${j}${j === len ? ' (one past the end)' : ''}.`, e.line);
              return R.items[j];
            }
          }
          if (v.t === 'vec') {
            if (i < 0 || i >= v.items.length || !Number.isInteger(i)) err(`Index ${i} is out of range! ${exprText(e.o)} has ${v.items.length} element${v.items.length === 1 ? '' : 's'}, so valid indexes are 0 to ${v.items.length - 1}.`, e.line);
            return v.items[i];
          }
          if (v.t === 'string') {
            if (i < 0 || i >= v.v.length) err(`Index ${i} is out of range! The string has ${v.v.length} characters (indexes 0 to ${v.v.length - 1}).`, e.line);
            return strCell(c, i);
          }
          return err(`Can't use [ ] on ${typeName(v)}.`, e.line);
        }
        case 'un':
          if (e.op === '*') return deref(evalE(e.e), e);
          if (e.op === '++' || e.op === '--') { const c = lval(e.e); incr(c, e.op, e); return c; }
          break;
        case 'assign': evalE(e); return lval(e.l);
        case 'call': { const r = call(e); return r.cell || cell(r.val); }
      }
      return cell(evalE(e));
    }
    function checkWritable(c, e) {
      if (c.isConst) err(`${exprText(e)} is const, so it can't be changed.`, e.line);
      const f = top();
      if (f && f.def && f.def.isConst && f.thisCell && Object.values(f.thisCell.val.fields).includes(c)) {
        err(`${f.def.name}() is a const method: it promised not to change the object's fields. A real compiler would reject this line.`, e.line);
      }
    }
    function incr(c, op, e) {
      checkWritable(c, e.e || e);
      const v = c.val;
      if (v.t === 'uninit') err(`${exprText(e.e)} is used before it was given a value.`, e.line);
      const d = op === '++' ? 1 : -1;
      if (v.t === 'double') c.val = D(v.v + d);
      else if (v.t === 'char') c.val = C(String.fromCharCode(v.v.charCodeAt(0) + d));
      else if (v.t === 'int') c.val = I(v.v + d);
      else if (v.t === 'ptr') {
        c.val = ptrMove(v, d, e, `${exprText(e.e)}${op}`);
        say(`${exprText(e.e)} moved ${d > 0 ? 'forward' : 'back'} ${unitText(region(c.val.cell).ety, 1)}: now points to ${ptrTarget(c.val)}`);
        return;
      } else err(`Can't use ${op} on ${typeName(v)}.`, e.line);
      say(`${exprText(e.e)}${op} → ${exprText(e.e)} = ${short(c.val)}`);
    }
    function str(v) { return v.t === 'string' || v.t === 'char' ? v.v : null; }
    function ptrArith(op, a, b, line, ex) { // p + n, n + p, p - n, p - q
      const pl = a.t === 'ptr' || isArrV(a);
      const ce = !ex ? { line } : ex.k === 'assign' ? { line, e: ex.l } : { line, e: pl ? ex.l : ex.r };
      const what = !ex ? 'This' : ex.k === 'assign' ? `${exprText(ex.l)} ${ex.op} ${exprText(ex.r)}` : exprText(ex);
      a = decay(a); b = decay(b);
      if (a.t === 'ptr' && b.t === 'ptr') {
        if (op === '+') err('Two pointers can\'t be added together. You can subtract them (p - q) to count the elements between them.', line);
        checkPtr(a, { line, e: ex && ex.l }); checkPtr(b, { line, e: ex && ex.r });
        if (!samePlace(a.cell, b.cell)) err(`${what}: subtracting pointers only makes sense when both point into the same array.`, line);
        const d = region(a.cell).idx - region(b.cell).idx;
        if (ex && ex.k === 'bin') say(`${what} = ${d}: the two addresses are ${unitText(region(a.cell).ety, d)} apart`);
        return I(d);
      }
      if (!pl && op === '-') err('A pointer can\'t be subtracted from a number. Did you mean p - n?', line);
      const p = pl ? a : b, n = num(pl ? b : a, line);
      if (!Number.isInteger(n)) err('A pointer can only move by a whole number of elements.', line);
      const k = op === '-' ? -n : n;
      const r = ptrMove(p, k, ce, what);
      if (ex && ex.k === 'bin') say(`${what} is the address ${unitText(region(r.cell).ety, k)} ${k >= 0 ? 'after' : 'before'} ${exprText(ce.e)}: ${ptrTarget(r)}`);
      return r;
    }
    function binop(op, a, b, line, ex) {
      if (a.t === 'uninit' || b.t === 'uninit') err('A variable is used before it was given a value. In real C++ it would hold random garbage.', line);
      if (a.t === 'string' || b.t === 'string') {
        const x = str(a), y = str(b);
        if (x == null || y == null) err(`Can't combine ${typeName(a)} and ${typeName(b)} with ${op}.${op === '+' ? ' Use to_string(...) to turn a number into text first.' : ''}`, line);
        switch (op) {
          case '+': return S(x + y);
          case '==': return B(x === y); case '!=': return B(x !== y);
          case '<': return B(x < y); case '>': return B(x > y);
          case '<=': return B(x <= y); case '>=': return B(x >= y);
        }
        err(`Can't use ${op} on strings.`, line);
      }
      if (a.t === 'ptr' || b.t === 'ptr' || isArrV(a) || isArrV(b)) {
        if (op === '+' || op === '-') return ptrArith(op, a, b, line, ex);
        a = decay(a); b = decay(b);
        const pc = v => (v.t === 'ptr' ? v.cell : num(v, line) === 0 ? null : err('Pointers can only be compared with other pointers or nullptr.', line));
        if (op === '==') return B(pc(a) === pc(b));
        if (op === '!=') return B(pc(a) !== pc(b));
        if (['<', '>', '<=', '>='].includes(op)) {
          if (a.t !== 'ptr' || b.t !== 'ptr' || !a.cell || !b.cell) err(`${op} on pointers only works for two pointers into the same array.`, line);
          if (!samePlace(a.cell, b.cell)) err(`These two pointers point into different arrays (or variables), so comparing them with ${op} has no meaning.`, line);
          const x = region(a.cell).idx, y = region(b.cell).idx;
          return B(op === '<' ? x < y : op === '>' ? x > y : op === '<=' ? x <= y : x >= y);
        }
        err(`Can't use ${op} on pointers.`, line);
      }
      if (!['int', 'double', 'bool', 'char'].includes(a.t) || !['int', 'double', 'bool', 'char'].includes(b.t)) err(`Can't use ${op} on ${typeName(a)} and ${typeName(b)}.`, line);
      const x = num(a, line), y = num(b, line);
      const isD = a.t === 'double' || b.t === 'double';
      const n = v => (isD ? D(v) : I(v));
      switch (op) {
        case '+': return n(x + y);
        case '-': return n(x - y);
        case '*': return n(x * y);
        case '/':
          if (!isD && y === 0) err('Division by zero! Dividing an integer by 0 crashes the program.', line);
          return isD ? D(x / y) : I(Math.trunc(x / y));
        case '%':
          if (isD) err('% only works on whole numbers (ints).', line);
          if (y === 0) err('Modulo by zero! x % 0 crashes the program.', line);
          return I(x % y);
        case '<': return B(x < y); case '>': return B(x > y);
        case '<=': return B(x <= y); case '>=': return B(x >= y);
        case '==': return B(x === y); case '!=': return B(x !== y);
        case '&': return I(x & y); case '|': return I(x | y); case '^': return I(x ^ y);
        case '<<': return I(x << y); case '>>': return I(x >> y);
      }
      return err(`Unknown operator ${op}.`, line);
    }
    function print(v, line) {
      let s;
      switch (v.t) {
        case 'endl': s = '\n'; break;
        case 'manip': if (v.fixed) fmt.fixed = true; if (v.prec != null) fmt.prec = v.prec; return;
        case 'int': s = String(v.v); break;
        case 'double': s = fmtDouble(v.v); break;
        case 'bool': s = v.v ? '1' : '0'; break;
        case 'char': case 'string': s = v.v; break;
        case 'ptr': s = ptrText(v); break;
        case 'void': return err('This function returns nothing (void), so there\'s nothing to print.', line);
        case 'uninit': return err('Printing a variable that was never given a value. In real C++ this prints random garbage.', line);
        default: if (isArrV(v)) { s = ptrText(decay(v)); break; } return err(`cout doesn't know how to print ${typeName(v)}.${v.t === 'vec' ? ' Loop over it and print each element.' : v.t === 'obj' ? ' Print its fields one by one.' : ''}`, line);
      }
      out += s;
      if (out.length > 20000) err('Too much output. Stopping here.', line);
      const last = did[did.length - 1];
      if (last && typeof last === 'object' && last.print != null) last.print += s;
      else did.push({ print: s });
    }
    function ptrText(v) { // cout << pointer: its address in hex (a char pointer into an array prints the text)
      const c = v.cell;
      if (!c) return '0';
      if (!c.past && !c.freed && c.val.t === 'char' && homeOf(c)) {
        let t = '';
        for (const it of c.home.items.slice(c.ix)) { if (it.val.t !== 'char' || it.val.v === '\0') break; t += it.val.v; }
        return t;
      }
      return '0x' + (addrOf(c) ?? 0).toString(16);
    }
    function readToken(line) {
      while (inPos < input.length && /\s/.test(input[inPos])) inPos++;
      if (inPos >= input.length) err('The program is waiting for input (cin), but the input box has nothing left. Add input below the code and run it again.', line);
      let s = '';
      while (inPos < input.length && !/\s/.test(input[inPos])) s += input[inPos++];
      return s;
    }
    function readInto(c, e, line) {
      const old = c.val;
      const ty = old.t === 'uninit' ? old.of : old.t;
      let v;
      if (ty === 'char') {
        while (inPos < input.length && /\s/.test(input[inPos])) inPos++;
        if (inPos >= input.length) readToken(line);
        v = C(input[inPos++]);
      } else {
        const tok = readToken(line);
        if (ty === 'int') { if (!/^[+-]?\d+/.test(tok)) err(`The input "${tok}" isn't a whole number, so cin fails to read it into ${exprText(e)}.`, line); v = I(parseInt(tok, 10)); }
        else if (ty === 'double') { if (isNaN(parseFloat(tok))) err(`The input "${tok}" isn't a number.`, line); v = D(parseFloat(tok)); }
        else if (ty === 'bool') v = B(tok !== '0');
        else if (ty === 'string') v = S(tok);
        else err(`cin can't read into ${typeName(old)}.`, line);
      }
      c.val = v;
      say(`⌨ Read ${short(v)} from the input into ${exprText(e)}`);
    }
    function newExpr(e) {
      if (e.count) {
        const n = num(evalE(e.count), e.line);
        if (n < 0 || n > 10000) err(`Can't create an array of ${n} elements.`, e.line);
        const aty = ARR(e.ty, n);
        const c = cell(mkArr(aty), { ty: aty, heapCell: true, hid: ++heapId, isArr: true });
        heap.push(c);
        heapAlloc(c);
        initArr(c, e.init, e.line, !!e.init, `heap #${c.hid}`);
        say(`new: created an array of ${n} on the heap (#${c.hid}). The pointer holds the address of its first element`);
        return decay(c.val);
      }
      const cls = prog.classes[e.ty.name];
      if (cls) {
        const c = cell(shell(cls), { ty: e.ty, heapCell: true, hid: ++heapId });
        heap.push(c);
        heapAlloc(c);
        say(`new: space for a ${cls.name} is reserved on the heap (#${c.hid})`);
        construct(cls, c, e.args, e.line, `heap #${c.hid}`);
        return { t: 'ptr', cell: c };
      }
      const val = e.args.length ? convert(evalE(e.args[0]), e.ty, e.line) : { t: 'uninit', of: e.ty.name };
      const c = cell(val, { ty: e.ty, heapCell: true, hid: ++heapId });
      heap.push(c);
      heapAlloc(c);
      say(`new: created ${val.t === 'uninit' ? 'a ' + e.ty.name : short(val)} on the heap (#${c.hid})`);
      return { t: 'ptr', cell: c };
    }

    const BUILTINS = {
      max: a => { const [x, y] = a.map(evalE); return num(x) >= num(y) ? x : y; },
      min: a => { const [x, y] = a.map(evalE); return num(x) <= num(y) ? x : y; },
      abs: a => { const x = evalE(a[0]); return x.t === 'double' ? D(Math.abs(x.v)) : I(Math.abs(num(x))); },
      fabs: a => D(Math.abs(num(evalE(a[0])))),
      sqrt: (a, e) => { const x = num(evalE(a[0])); if (x < 0) err('sqrt of a negative number is not a real number (nan).', e.line); return D(Math.sqrt(x)); },
      pow: a => D(Math.pow(num(evalE(a[0])), num(evalE(a[1])))),
      floor: a => D(Math.floor(num(evalE(a[0])))),
      ceil: a => D(Math.ceil(num(evalE(a[0])))),
      round: a => D(Math.round(num(evalE(a[0])))),
      to_string: a => { const x = evalE(a[0]); return S(x.t === 'double' ? x.v.toFixed(6) : String(num(x))); },
      stoi: (a, e) => { const s = str(evalE(a[0])); const n = parseInt(s, 10); if (isNaN(n)) err(`stoi can't turn "${s}" into a number.`, e.line); return I(n); },
      stod: (a, e) => { const s = str(evalE(a[0])); const n = parseFloat(s); if (isNaN(n)) err(`stod can't turn "${s}" into a number.`, e.line); return D(n); },
      swap: a => { const c1 = lval(a[0]), c2 = lval(a[1]); [c1.val, c2.val] = [c2.val, c1.val]; say(`Swapped ${exprText(a[0])} and ${exprText(a[1])}`); return VOID; },
      setprecision: a => ({ t: 'manip', prec: num(evalE(a[0])) }),
      getline: (a, e) => {
        const c = lval(a[1]);
        if (inPos < input.length && input[inPos] === '\n') inPos++;
        if (inPos >= input.length) err('The program is waiting for input (getline), but the input box has nothing left.', e.line);
        let s = '';
        while (inPos < input.length && input[inPos] !== '\n') s += input[inPos++];
        if (input[inPos] === '\n') inPos++;
        c.val = S(s.replace(/\r$/, ''));
        say(`⌨ Read the line ${short(c.val)} into ${exprText(a[1])}`);
        return ISTREAM;
      },
      toupper: a => I(String.fromCharCode(num(evalE(a[0]))).toUpperCase().charCodeAt(0)),
      tolower: a => I(String.fromCharCode(num(evalE(a[0]))).toLowerCase().charCodeAt(0)),
      isdigit: a => B(/[0-9]/.test(String.fromCharCode(num(evalE(a[0]))))),
      isalpha: a => B(/[A-Za-z]/.test(String.fromCharCode(num(evalE(a[0]))))),
      isspace: a => B(/\s/.test(String.fromCharCode(num(evalE(a[0]))))),
      isupper: a => B(/[A-Z]/.test(String.fromCharCode(num(evalE(a[0]))))),
      islower: a => B(/[a-z]/.test(String.fromCharCode(num(evalE(a[0]))))),
      srand: a => { seed = num(evalE(a[0])) || 1; return VOID; },
      rand: () => { seed = (seed * 1103515245 + 12345) % 2147483648; return I(seed % 32768); },
      time: () => I(0),
    };
    function stringMethod(c, name, args, e) {
      const s = c.val.v;
      const arg = i => evalE(args[i]);
      switch (name) {
        case 'length': case 'size': return I(s.length);
        case 'empty': return B(s.length === 0);
        case 'at': { const i = num(arg(0), e.line); if (i < 0 || i >= s.length) err(`at(${i}) is out of range: the string has ${s.length} characters.`, e.line); return C(s[i]); }
        case 'substr': { const pos = num(arg(0), e.line); if (pos > s.length) err(`substr(${pos}) starts past the end of the string.`, e.line); const len = args[1] ? num(arg(1), e.line) : s.length; return S(s.substr(pos, len)); }
        case 'find': { const x = str(arg(0)); const i = s.indexOf(x, args[1] ? num(arg(1)) : 0); return I(i); }
        case 'push_back': { checkWritable(c, e.f.o); c.val = S(s + str(arg(0))); say(`${exprText(e.f.o)} is now ${short(c.val)}`); return VOID; }
        case 'append': { checkWritable(c, e.f.o); c.val = S(s + str(arg(0))); say(`${exprText(e.f.o)} is now ${short(c.val)}`); return VOID; }
        case 'pop_back': { if (!s.length) err('pop_back on an empty string.', e.line); c.val = S(s.slice(0, -1)); return VOID; }
        case 'clear': { c.val = S(''); return VOID; }
        case 'front': return C(s[0]);
        case 'back': return C(s[s.length - 1]);
        case 'c_str': return S(s);
      }
      return err(`This visualizer doesn't know the string method '${name}' yet.`, e.line);
    }
    function vecMethod(c, name, args, e) {
      const v = c.val;
      const label = exprText(e.f.o);
      switch (name) {
        case 'push_back': case 'emplace_back': {
          const x = copy(convert(evalE(args[0]), v.elem, e.line));
          v.items.push(cell(x, { ty: v.elem }));
          say(`${label}.push_back(${short(x)}): ${label} now has ${v.items.length} element${v.items.length === 1 ? '' : 's'}`);
          return { val: VOID };
        }
        case 'pop_back':
          if (!v.items.length) err(`pop_back() on an empty vector crashes the program.`, e.line);
          v.items.pop(); say(`Removed the last element of ${label}`); return { val: VOID };
        case 'size': return { val: I(v.items.length) };
        case 'empty': return { val: B(!v.items.length) };
        case 'clear': v.items = []; say(`${label} is now empty`); return { val: VOID };
        case 'at': {
          const i = num(evalE(args[0]), e.line);
          if (i < 0 || i >= v.items.length) err(`at(${i}) is out of range: ${label} has ${v.items.length} element${v.items.length === 1 ? '' : 's'}.`, e.line);
          return { val: v.items[i].val, cell: v.items[i] };
        }
        case 'front': case 'back': {
          if (!v.items.length) err(`${name}() on an empty vector.`, e.line);
          const it = v.items[name === 'front' ? 0 : v.items.length - 1];
          return { val: it.val, cell: it };
        }
      }
      if (['begin', 'end', 'erase', 'insert'].includes(name)) err(`Iterators (${name}) aren't supported by this visualizer yet.`, e.line);
      return err(`This visualizer doesn't know the vector method '${name}' yet.`, e.line);
    }
    function method(objCell, name, args, line) {
      const cls = prog.classes[objCell.val.cls];
      const list = cls.methods[name];
      if (!list) {
        if (cls.fields.some(f => f.name === name)) err(`${name} is a field, not a method, so it can't be called with ().`, line);
        err(`${cls.name} has no method named '${name}'.`, line);
      }
      const vals = evalArgs(args);
      const def = pickFunc(list, vals, `${cls.name}::${name}()`, line);
      checkAccess(cls.name, name, def.access, line, 'method');
      return callFunc(def, bindArgs(def, vals), line, objCell);
    }
    function call(e) {
      const f = e.f;
      if (f.k === 'id') {
        const name = f.name;
        const tc = top() && top().thisCell;
        if (tc && prog.classes[tc.val.cls].methods[name]) return method(tc, name, e.args, e.line);
        const fns = prog.free.filter(x => x.name === name);
        if (fns.length) {
          const vals = evalArgs(e.args);
          const def = pickFunc(fns, vals, `${name}()`, e.line);
          return callFunc(def, bindArgs(def, vals), e.line, null);
        }
        if (BUILTINS[name]) return { val: BUILTINS[name](e.args, e) };
        if (lookupVar(name)) err(`${name} is a variable, not a function.`, e.line);
        err(`There's no function called '${name}'.${['printf', 'scanf'].includes(name) ? ' Use cout / cin instead.' : ''}`, e.line);
      }
      if (f.k === 'member' || f.k === 'arrow') {
        if (f.o.k === 'id' && (f.o.name === 'cin' || f.o.name === 'cout')) {
          if (f.name === 'ignore') return { val: VOID };
          err(`${f.o.name}.${f.name}() isn't supported by this visualizer yet.`, e.line);
        }
        const objCell = f.k === 'member' ? lval(f.o) : deref(evalE(f.o), f);
        const v = objCell.val;
        if (v.t === 'obj') return method(objCell, f.name, e.args, e.line);
        if (v.t === 'string') return { val: stringMethod(objCell, f.name, e.args, e) };
        if (v.t === 'vec') return vecMethod(objCell, f.name, e.args, e);
        if (v.t === 'ptr') err(`${exprText(f.o)} is a pointer. Use -> instead of . to call a method through it.`, e.line);
        err(`${exprText(f.o)} is ${typeName(v)}, which has no method '${f.name}'.`, e.line);
      }
      return err('This kind of function call isn\'t supported by this visualizer.', e.line);
    }
    function evalE(e) {
      switch (e.k) {
        case 'num': return e.f ? D(e.v) : I(e.v);
        case 'str': return S(e.v);
        case 'char': return C(e.v);
        case 'bool': return B(e.v);
        case 'null': return NULLPTR;
        case 'this': {
          const tc = top() && top().thisCell;
          if (!tc) err('\'this\' only exists inside a class\'s methods.', e.line);
          return { t: 'ptr', cell: tc };
        }
        case 'id': {
          if (e.name === 'cout' || e.name === 'cerr') return OSTREAM;
          if (e.name === 'cin') return ISTREAM;
          if (e.name === 'endl') return ENDL;
          if (e.name === 'fixed') return { t: 'manip', fixed: true };
          const c = lookupVar(e.name);
          if (!c) {
            if (prog.free.some(f => f.name === e.name)) err(`${e.name} is a function. Did you forget the () to call it?`, e.line);
            err(`'${e.name}' is not declared. Is it misspelled, or declared somewhere this code can't see?`, e.line);
          }
          if (c.val.t === 'uninit') err(`'${e.name}' is used before it was given a value. In real C++ it would hold random garbage.`, e.line);
          return c.val;
        }
        case 'assign': {
          const c = lval(e.l);
          checkWritable(c, e.l);
          let r = evalE(e.r);
          const old = c.val;
          if (e.op !== '=') r = binop(e.op.slice(0, -1), c.val, r, e.line, e);
          assignInto(c, convertLike(r, c.val, e.line));
          if (c.val.t === 'ptr' && old.t === 'ptr' && (e.op === '+=' || e.op === '-=')) {
            const k = region(c.val.cell).idx - region(old.cell).idx;
            say(`${exprText(e.l)} moved ${k >= 0 ? 'forward' : 'back'} ${unitText(region(c.val.cell).ety, k)}: now points to ${ptrTarget(c.val)}`);
          } else say(`${exprText(e.l)} = ${short(c.val)}`);
          return c.val;
        }
        case 'bin': {
          if (e.op === '<<') {
            const l = evalE(e.l);
            if (l.t === 'ostream') { print(evalE(e.r), e.line); return OSTREAM; }
            return binop('<<', l, evalE(e.r), e.line);
          }
          if (e.op === '>>') {
            const l = evalE(e.l);
            if (l.t === 'istream') { readInto(lval(e.r), e.r, e.line); return ISTREAM; }
            return binop('>>', l, evalE(e.r), e.line);
          }
          if (e.op === '&&') return B(truthy(evalE(e.l), e.line) && truthy(evalE(e.r), e.line));
          if (e.op === '||') return B(truthy(evalE(e.l), e.line) || truthy(evalE(e.r), e.line));
          return binop(e.op, evalE(e.l), evalE(e.r), e.line, e);
        }
        case 'un':
          switch (e.op) {
            case '-': { const v = evalE(e.e); return v.t === 'double' ? D(-v.v) : I(-num(v, e.line)); }
            case '+': { const v = evalE(e.e); return v.t === 'double' ? v : I(num(v, e.line)); }
            case '!': return B(!truthy(evalE(e.e), e.line));
            case '~': return I(~num(evalE(e.e), e.line));
            case '++': case '--': { const c = lval(e.e); incr(c, e.op, e); return c.val; }
            case '*': return deref(evalE(e.e), e).val;
            case '&': return { t: 'ptr', cell: lval(e.e) };
          }
          break;
        case 'post': { const c = lval(e.e); const old = c.val; incr(c, e.op, e); return old; }
        case 'cond': return truthy(evalE(e.c), e.line) ? evalE(e.a) : evalE(e.b);
        case 'comma': { let v = VOID; for (const x of e.list) v = evalE(x); return v; }
        case 'member': case 'arrow': case 'index': return lval(e).val;
        case 'call': return call(e).val;
        case 'new': return newExpr(e);
        case 'delete': {
          const pv = evalE(e.e);
          if (pv.t !== 'ptr') err('delete only works on pointers.', e.line);
          if (!pv.cell) return VOID;
          let c = pv.cell;
          if (c.past) err('delete was given the address one past the end of an array. Only the exact address that new returned can be deleted.', e.line);
          if (!c.heapCell) { // a pointer to element 0 of a new[] array
            const h = homeOf(c), o = h && h.owner;
            if (o && o.heapCell) {
              if (h.items[0] !== c) err(`This pointer points into the middle of heap #${o.hid} (element ${c.ix}). delete[] must be given the address of element 0: the exact address new[] returned.`, e.line);
              c = o;
            }
          }
          if (!c.heapCell) err('delete only works on memory that was created with new.', e.line);
          if (c.freed) err('Double delete! This memory was already deleted once. That crashes real programs.' + (top() && top().def && top().def.isDtor ? ' Here a destructor deletes memory that was already deleted: a sign that two objects shared one pointer after a shallow copy. A copy constructor that makes a deep copy fixes this.' : ''), e.line);
          if (c.isArr && !e.arr) say(`⚠ heap #${c.hid} was made with new[], so it should be freed with delete[] (with the brackets)`);
          else if (!c.isArr && e.arr) say(`⚠ heap #${c.hid} was made with plain new, so it should be freed with delete (no brackets)`);
          destroyVal(c, e.line, `heap #${c.hid}`);
          markFreed(c);
          say(`delete: heap #${c.hid} is freed. Any pointer still holding its address is now dangling`);
          return VOID;
        }
        case 'construct': {
          const cls = prog.classes[e.cls];
          const c = cell(shell(cls), { ty: { name: cls.name } });
          stackAlloc(c, false);
          construct(cls, c, e.args, e.line, `a temporary ${e.cls}`);
          return c.val;
        }
        case 'cast': return convert(evalE(e.e), e.ty, e.line);
        case 'val': return e.v;
        case 'sizeof': {
          if (e.ty) return I(sizeTy(e.ty));
          if (e.e.k === 'id') {
            const v = top() && [...top().vars].reverse().find(x => x.name === e.e.name);
            if (v && v.arrParam) { say(`Inside the function, ${e.e.name} is really a pointer, so sizeof gives 8 (the size of an address), not the size of the whole array`); return I(8); }
          }
          return I(sizeV(lval(e.e)));
        }
        case 'list': return err('A { } list can only be used when creating a variable.', e.line);
      }
      return err('This expression isn\'t supported by this visualizer yet.', e.line);
    }

    // ----- run
    const result = { steps, error: null };
    try {
      frames.push(globals);
      for (const g of prog.globals) for (const d of g.decls) declare(d, globals, true);
      frames.pop();
      const main = prog.free.find(f => f.name === 'main' && f.body);
      if (!main) throw new CppError('There\'s no main() function. Every C++ program starts running at main().', 1);
      callFunc(main, [], null, null, { label: 'main' });
      const leaks = heap.filter(h => !h.freed).length;
      say('main() is finished, so the program ends');
      if (leaks) say(`⚠ ${leaks} thing${leaks > 1 ? 's' : ''} created with new ${leaks > 1 ? 'were' : 'was'} never deleted (a memory leak)`);
      snapshot(main.endLine, 'exit');
    } catch (e0) {
      let e = e0;
      if (!(e instanceof CppError)) {
        if (e === BRK || e === CONT) e = new CppError(`'${e.signal}' can only be used inside a loop${e === BRK ? ' or switch' : ''}.`, top() ? top().line : 1);
        else { console.error(e); e = new CppError('Something went wrong inside the visualizer: ' + e.message, top() ? top().line : 1); }
      }
      result.error = { msg: e.message, line: e.line, limit: !!e.limit };
      if (!halted && steps.length) { halted = true; try { snapshot(e.line, 'error', e.message); } catch {} }
    }
    return result;
  }

  function run(src, input = '', opts = {}) {
    let prog;
    try { prog = parse(src); }
    catch (e) {
      if (e instanceof CppError) return { compileError: { msg: e.message, line: e.line } };
      throw e;
    }
    const res = execute(prog, input, opts);
    return { ...res, regions: prog.regions, stmtLines: prog.stmtLines, prog };
  }

  window.CPP = { run };
})();
