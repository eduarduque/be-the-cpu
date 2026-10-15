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
      while (is('*')) { next(); ty = { name: 'ptr', to: ty }; while (is('const')) next(); }
      let ref = false;
      if (is('&')) { next(); ref = true; }
      if (is('&&')) unsupported('Rvalue references (&&)');
      return { ty, isConst, ref };
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
        if (eat('[')) { count = parseExpr(); expect(']'); }
        else if (eat('(')) args = parseArgs(')');
        else if (eat('{')) args = parseArgs('}');
        return node('new', x.line, { ty, args, count });
      }
      if (is('delete')) {
        next();
        let arr = false;
        if (eat('[')) { expect(']'); arr = true; }
        return node('delete', x.line, { e: parseUnary(), arr });
      }
      if (is('sizeof')) unsupported('sizeof');
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
      const { ty, isConst, ref } = parseType();
      const decls = [];
      do {
        let dty = ty, dref = ref;
        while (eat('*')) dty = { name: 'ptr', to: dty };
        if (eat('&')) dref = true;
        const dl = where();
        const name = ident();
        const dims = [];
        while (eat('[')) { dims.push(is(']') ? null : parseExpr()); expect(']'); }
        let init = null, args = null;
        if (eat('=')) {
          if (is('{')) { next(); init = node('list', dl, { items: parseArgs('}') }); }
          else init = parseAssign();
        } else if (is('(')) {
          next(); args = parseArgs(')');
        } else if (is('{')) {
          next(); const items = parseArgs('}');
          if (dims.length || dty.name === 'vector') init = node('list', dl, { items });
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
          if (eat('[')) { if (!is(']')) parseExpr(); expect(']'); pty = { name: 'ptr', to: ty, arr: true }; }
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
          if (eat('=')) init = parseAssign();
          else if (eat('{')) { const items = parseArgs('}'); init = items[0] || null; }
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

    // attach out-of-class definitions (Class::method) to their declarations
    for (const f of prog.funcs) {
      if (!f.cls) continue;
      const c = prog.classes[f.cls];
      if (!c) fail(`Unknown class '${f.cls}'.`, f.line);
      if (f.isCtor) {
        const i = c.ctors.findIndex(x => x.proto && x.params.length === f.params.length);
        if (i >= 0) { f.access = c.ctors[i].access; c.ctors[i] = f; } else fail(`This constructor isn't declared inside class ${f.cls}.`, f.line);
      } else if (f.isDtor) {
        c.dtor = f;
      } else {
        const list = c.methods[f.name];
        const i = list ? list.findIndex(x => x.proto && x.params.length === f.params.length) : -1;
        if (i < 0) fail(`'${f.name}' isn't declared inside class ${f.cls}. Add its declaration to the class first.`, f.line);
        f.access = list[i].access;
        if (list[i].isConst !== f.isConst) fail(`'${f.name}' is declared ${list[i].isConst ? 'const' : 'non-const'} in the class but defined ${f.isConst ? 'const' : 'non-const'} here. They must match.`, f.line);
        list[i] = f;
      }
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
        const r = findIn(h.val, c, `#${h.hid}`); if (r) return r;
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
          if (!v.cell) return { t: 'ptr', target: null };
          if (v.cell.freed) return { t: 'ptr', dangling: true, heap: v.cell.hid };
          return { t: 'ptr', target: nameOf(v.cell) || 'a temporary', tid: v.cell.id, heap: v.cell.hid || null };
        case 'obj': {
          const cls = prog.classes[v.cls];
          return {
            t: 'obj', cls: v.cls,
            fields: Object.entries(v.fields).map(([k, c]) => ({
              name: k, id: c.id,
              priv: (cls.fields.find(f => f.name === k) || {}).access !== 'public',
              val: depth > 4 ? { t: 'p', text: '…' } : disp(c.val, depth + 1),
            })),
          };
        }
        case 'vec':
          return { t: 'vec', items: v.items.slice(0, 40).map(c => ({ id: c.id, val: disp(c.val, depth + 1) })), more: Math.max(0, v.items.length - 40) };
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
      const fv = f => f.vars.map(v => ({
        name: v.name, anchor: v.anchor, id: v.cell.id, isThis: !!v.isThis,
        ref: v.ref ? nameOf(v.cell) || 'a temporary value' : null,
        val: v.isThis ? disp({ t: 'ptr', cell: v.cell }) : disp(v.cell.val),
      }));
      steps.push({
        line, kind, note: note || null, did,
        frames: frames.map(f => ({ uid: f.def ? f.def.uid : null, label: f.label, callLine: f.callLine, vars: fv(f) })),
        globals: fv(globals),
        heap: heap.map(h => ({ hid: h.hid, id: h.id, freed: !!h.freed, val: h.freed ? null : disp(h.val) })),
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
      if (v.t === 'obj') { const f = {}; for (const k in v.fields) f[k] = cell(copy(v.fields[k].val)); return { ...v, fields: f }; }
      if (v.t === 'vec') return { ...v, items: v.items.map(c => cell(copy(c.val))) };
      return v;
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
          return err(`Can't store ${typeName(v)} in a pointer. Pointers hold addresses, like &x or new ...`, line);
        case 'vector':
          if (v.t === 'vec') return v;
          return err(`Can't store ${typeName(v)} in a vector.`, line);
        case 'void': return VOID;
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
          if (cls) { const c = cell(shell(cls)); construct(cls, c, [], line, `a new ${cls.name}`); return c.val; }
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
      for (const fd of cls.fields) fields[fd.name] = cell({ t: 'uninit', of: fd.ty.name === 'ptr' ? 'pointer' : fd.ty.name });
      return { t: 'obj', cls: cls.name, fields };
    }

    // ----- scopes
    function addVar(f, name, c, anchor, extra = {}) {
      const v = { name, cell: c, anchor, ...extra };
      f.vars.push(v);
      f.scopes[f.scopes.length - 1].push(v);
      return v;
    }
    function pushScope() { top().scopes.push([]); }
    function popScope(line) {
      if (halted) return;
      const f = top();
      const sc = f.scopes.pop();
      for (let i = sc.length - 1; i >= 0; i--) {
        const v = sc[i];
        if (!v.ref && !v.isThis) destroyVal(v.cell, line, v.name);
      }
      f.vars = f.vars.filter(v => !sc.includes(v));
    }
    function destroyVal(c, line, label) {
      if (c.val.t === 'obj') {
        const cls = prog.classes[c.val.cls];
        if (cls.dtor && cls.dtor.body) { say(`${label} is going away, so its destructor runs`); callFunc(cls.dtor, [], line, c, { quietReturn: true }); }
      } else if (c.val.t === 'vec') {
        c.val.items.forEach((it, i) => destroyVal(it, line, `${label}[${i}]`));
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
        const inits = d.init && d.init.k === 'list' ? d.init.items : [];
        const n = d.dims[0] ? num(evalE(d.dims[0]), d.line) : inits.length;
        if (n < 0 || n > 10000) err(`An array size of ${n} isn't allowed here.`, d.line);
        const items = [];
        for (let i = 0; i < n; i++) {
          if (i < inits.length) items.push(cell(convert(evalE(inits[i]), ty, d.line)));
          else items.push(cell(d.init || isGlobal ? zeroOf(ty, d.line) : defaultVal(ty, d.line, false)));
        }
        addVar(f, d.name, cell({ t: 'vec', arr: true, elem: ty, items }), anchor);
        say(`${d.name} is an array with ${n} slot${n === 1 ? '' : 's'}`);
        return;
      }
      const cls = prog.classes[ty.name];
      if (cls && !d.init) {
        const c = cell(shell(cls));
        addVar(f, d.name, c, anchor);
        if (d.isConst) c.isConst = true;
        say(`Space for ${d.name} is reserved. Now its constructor builds it`);
        construct(cls, c, d.args || [], d.line, d.name);
        return;
      }
      let val;
      if (d.init) {
        if (d.init.k === 'list') {
          if (ty.name === 'vector') val = { t: 'vec', elem: ty.elem, items: d.init.items.map(e => cell(convert(copy(evalE(e)), ty.elem, d.line))) };
          else val = d.init.items.length ? convert(evalE(d.init.items[0]), ty, d.line) : zeroOf(ty, d.line);
        } else val = convert(copy(evalE(d.init)), ty, d.line);
      } else if (d.args) {
        if (ty.name === 'vector') {
          const n = d.args[0] ? num(evalE(d.args[0]), d.line) : 0;
          if (n < 0 || n > 10000) err(`A vector size of ${n} isn't allowed here.`, d.line);
          const fill = d.args[1] ? convert(evalE(d.args[1]), ty.elem, d.line) : null;
          val = { t: 'vec', elem: ty.elem, items: Array.from({ length: n }, () => cell(fill ? copy(fill) : zeroOf(ty.elem, d.line))) };
        } else if (ty.name === 'string' && d.args.length === 2) {
          const n = num(evalE(d.args[0]), d.line), ch = convert(evalE(d.args[1]), { name: 'char' }, d.line);
          val = S(ch.v.repeat(Math.max(0, n)));
        } else val = d.args.length ? convert(copy(evalE(d.args[0])), ty, d.line) : zeroOf(ty, d.line);
      } else val = defaultVal(ty, d.line, isGlobal);
      const c = cell(val);
      if (d.isConst) c.isConst = true;
      addVar(f, d.name, c, anchor);
      say(val.t === 'uninit'
        ? `${d.name} is created, but has no value yet (in real C++ it holds random garbage)`
        : `New variable ${d.name} = ${short(val)}`);
    }

    // ----- functions
    function pickFunc(list, nargs, what, line) {
      const ok = list.filter(f => (!f.proto || f.defaulted) && nargs <= f.params.length && nargs >= f.params.filter(x => !x.def).length);
      if (!ok.length) {
        if (list.some(f => f.params.length === nargs)) err(`${what} is declared but never defined (it has no body).`, line);
        const counts = [...new Set(list.map(f => f.params.length))].join(' or ');
        err(`${what} takes ${counts} argument${counts === '1' ? '' : 's'}, but ${nargs} ${nargs === 1 ? 'was' : 'were'} given.`, line);
      }
      return ok.find(f => f.params.length === nargs) || ok[0];
    }
    const isLvalExpr = e => ['id', 'member', 'arrow', 'index'].includes(e.k) || (e.k === 'un' && e.op === '*');
    function prepArgs(def, exprs) {
      return exprs.map((x, i) => {
        const prm = def.params[i];
        if (prm && (prm.ref || prm.ty.arr)) {
          if (!isLvalExpr(x) && x.k !== 'call') {
            if (!prm.isConst) err(`'${prm.name}' is a non-const reference, so it must be given a variable, not a temporary value.`, x.line);
            return { val: evalE(x) };
          }
          const c = lval(x);
          return { cell: c, val: c.val };
        }
        return { val: evalE(x) };
      });
    }
    function construct(cls, c, argExprs, line, label) {
      if (!cls.ctors.length) {
        if (argExprs.length) {
          // aggregate init: Point p{1, 2};
          if (argExprs.length > cls.fields.length) err(`${cls.name} has only ${cls.fields.length} fields.`, line);
          const vals = argExprs.map(e => evalE(e));
          cls.fields.forEach((fd, i) => {
            if (i < vals.length) c.val.fields[fd.name].val = convert(copy(vals[i]), fd.ty, line);
            else c.val.fields[fd.name].val = fd.init ? convert(evalE(fd.init), fd.ty, line) : zeroOf(fd.ty, line);
          });
          say(`${label}'s fields are filled in order`);
          return;
        }
        initFields(cls, c, null, line);
        return;
      }
      const def = pickFunc(cls.ctors, argExprs.length, `The ${cls.name} constructor`, line);
      if (def.defaulted) { initFields(cls, c, null, line); return; }
      callFunc(def, prepArgs(def, argExprs), line, c, { label: `${cls.name} constructor` });
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
            fc.val = init.args.length ? convert(copy(evalE(init.args[0])), fd.ty, init.line) : zeroOf(fd.ty, line);
            say(`${fd.name} = ${short(fc.val)} (from the initializer list)`);
          }
        } else if (fd.dims.length) {
          const n = num(evalE(fd.dims[0]), fd.line);
          fc.val = { t: 'vec', arr: true, elem: fd.ty, items: Array.from({ length: n }, () => cell(fd.init ? zeroOf(fd.ty) : { t: 'uninit', of: fd.ty.name })) };
        } else if (fd.init) {
          fc.val = convert(copy(evalE(fd.init)), fd.ty, fd.line);
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
      const f = { label, def, callLine, vars: [], scopes: [[]], thisCell, line: def.line };
      frames.push(f);
      if (thisCell) addVar(f, 'this', thisCell, def.line, { isThis: true });
      const parts = [];
      for (const { prm, a } of bound) {
        if (!prm.name) continue;
        if (prm.ref || prm.ty.arr) {
          const c = a.cell || cell(a.val);
          addVar(f, prm.name, c, def.line, { ref: true });
          parts.push(`${prm.name} → ${nameOf(c) || 'a temporary'}`);
        } else {
          const c = cell(convert(copy(a.val), prm.ty, callLine));
          if (prm.isConst) c.isConst = true;
          addVar(f, prm.name, c, def.line);
          parts.push(`${prm.name} = ${short(c.val)}`);
        }
      }
      if (isMain) say('The program starts at main()');
      else if (def.isDtor) say(`Running the destructor of ${nameOf(thisCell) || 'the object'}`);
      else say(`Jump to ${def.isCtor ? `the ${def.cls} constructor` : label + '()'}${callLine ? `, leaving a 🚩 on line ${callLine}` : ''}${parts.length ? `. Copied in: ${parts.join(', ')}` : ''}`);
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
      if (wantsValue && !def.ret.ref) ret = { val: convert(copy(ret.val), def.ret.ty, def.endLine) };
      popScope(def.endLine);
      frames.pop();
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
              if (v.t === 'vec') c = s.ref ? v.items[i] : cell(convert(copy(v.items[i].val), s.ty, s.line));
              else c = cell(C(v.v[i]));
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
            else r = { val: evalE(s.e) };
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
      if (pv.t === 'uninit') err(`${exprText(e.o || e.e || e)} was never given an address, so it points to random memory.`, e.line);
      if (pv.t !== 'ptr') err(`Only pointers can be followed with * or ->. ${exprText(e.o || e.e || e)} is ${typeName(pv)}.${pv.t === 'obj' ? ' Use . instead of ->.' : ''}`, e.line);
      if (!pv.cell) err('Null pointer! This pointer is nullptr (it points to nothing), so following it crashes the program.', e.line);
      if (pv.cell.freed) err('Use after delete! This memory was already deleted, so the pointer is dangling. In real C++ this is undefined behavior.', e.line);
      return pv.cell;
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
          if (v.t === 'ptr') v = deref(v, e).val;
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
      else err(`Can't use ${op} on ${typeName(v)}.`, e.line);
      say(`${exprText(e.e)}${op} → ${exprText(e.e)} = ${short(c.val)}`);
    }
    function str(v) { return v.t === 'string' || v.t === 'char' ? v.v : null; }
    function binop(op, a, b, line) {
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
      if (a.t === 'ptr' || b.t === 'ptr') {
        const pc = v => (v.t === 'ptr' ? v.cell : num(v, line) === 0 ? null : err('Pointers can only be compared with other pointers or nullptr.', line));
        if (op === '==') return B(pc(a) === pc(b));
        if (op === '!=') return B(pc(a) !== pc(b));
        err('Pointer arithmetic isn\'t supported by this visualizer yet. Use [ ] to index arrays.', line);
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
        case 'ptr': s = v.cell ? '0x' + (0x7ffe1000 + Number(String(v.cell.id).split(':')[0]) * 16).toString(16) : '0'; break;
        case 'void': return err('This function returns nothing (void), so there\'s nothing to print.', line);
        case 'uninit': return err('Printing a variable that was never given a value. In real C++ this prints random garbage.', line);
        default: return err(`cout doesn't know how to print ${typeName(v)}.${v.t === 'vec' ? ' Loop over it and print each element.' : v.t === 'obj' ? ' Print its fields one by one.' : ''}`, line);
      }
      out += s;
      if (out.length > 20000) err('Too much output. Stopping here.', line);
      const last = did[did.length - 1];
      if (last && typeof last === 'object' && last.print != null) last.print += s;
      else did.push({ print: s });
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
        const c = cell({ t: 'vec', arr: true, elem: e.ty, items: Array.from({ length: n }, () => cell(prog.classes[e.ty.name] ? zeroOf(e.ty, e.line) : { t: 'uninit', of: e.ty.name })) }, { heapCell: true, hid: ++heapId });
        heap.push(c);
        say(`new: created an array of ${n} on the heap (#${c.hid})`);
        return { t: 'ptr', cell: c };
      }
      const cls = prog.classes[e.ty.name];
      if (cls) {
        const c = cell(shell(cls), { heapCell: true, hid: ++heapId });
        heap.push(c);
        say(`new: space for a ${cls.name} is reserved on the heap (#${c.hid})`);
        construct(cls, c, e.args, e.line, `heap #${c.hid}`);
        return { t: 'ptr', cell: c };
      }
      const val = e.args.length ? convert(evalE(e.args[0]), e.ty, e.line) : { t: 'uninit', of: e.ty.name };
      const c = cell(val, { heapCell: true, hid: ++heapId });
      heap.push(c);
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
          const x = convert(copy(evalE(args[0])), v.elem, e.line);
          v.items.push(cell(x));
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
      const def = pickFunc(list, args.length, `${cls.name}::${name}()`, line);
      checkAccess(cls.name, name, def.access, line, 'method');
      return callFunc(def, prepArgs(def, args), line, objCell);
    }
    function call(e) {
      const f = e.f;
      if (f.k === 'id') {
        const name = f.name;
        const tc = top() && top().thisCell;
        if (tc && prog.classes[tc.val.cls].methods[name]) return method(tc, name, e.args, e.line);
        const fns = prog.free.filter(x => x.name === name);
        if (fns.length) {
          const def = pickFunc(fns, e.args.length, `${name}()`, e.line);
          return callFunc(def, prepArgs(def, e.args), e.line, null);
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
          if (e.op !== '=') r = binop(e.op.slice(0, -1), c.val, r, e.line);
          c.val = convertLike(copy(r), c.val, e.line);
          say(`${exprText(e.l)} = ${short(c.val)}`);
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
          return binop(e.op, evalE(e.l), evalE(e.r), e.line);
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
          if (!pv.cell.heapCell) err('delete only works on memory that was created with new.', e.line);
          if (pv.cell.freed) err('Double delete! This memory was already deleted once. That crashes real programs.', e.line);
          destroyVal(pv.cell, e.line, `heap #${pv.cell.hid}`);
          pv.cell.freed = true;
          say(`delete: heap #${pv.cell.hid} is freed. Any pointer still holding its address is now dangling`);
          return VOID;
        }
        case 'construct': {
          const cls = prog.classes[e.cls];
          const c = cell(shell(cls));
          construct(cls, c, e.args, e.line, `a temporary ${e.cls}`);
          return c.val;
        }
        case 'cast': return convert(evalE(e.e), e.ty, e.line);
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
