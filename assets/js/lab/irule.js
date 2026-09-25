// F5 iRule (Tcl alt kümesi) yorumlayıcısı — CLI Lab simülatörü için
// Ayrıştırma: Tcl kuralları (süslü parantez, tırnak, [komut], $değişken, \ kaçış, # yorum).
// Çalıştırma: bir olay gövdesi, bağlantıya ait bağlam (ctx) üzerinde; F5 komutları ctx'i okur/yazar.
// Kaynaklar: clouddocs.f5.com/api/irules (olaylar, komutlar, devre dışı Tcl komutları), notes/f5-irule-arastirma.md
const CgIRule = (() => {
    'use strict';

    const EVENTS = ['RULE_INIT', 'CLIENT_ACCEPTED', 'CLIENT_DATA', 'CLIENT_CLOSED', 'SERVER_CONNECTED', 'SERVER_DATA', 'SERVER_CLOSED', 'FLOW_INIT',
        'HTTP_REQUEST', 'HTTP_REQUEST_DATA', 'HTTP_REQUEST_SEND', 'HTTP_REQUEST_RELEASE', 'HTTP_RESPONSE', 'HTTP_RESPONSE_DATA', 'HTTP_RESPONSE_RELEASE', 'HTTP_DISABLED', 'HTTP_PROXY_REQUEST',
        'CLIENTSSL_CLIENTHELLO', 'CLIENTSSL_HANDSHAKE', 'CLIENTSSL_CLIENTCERT', 'CLIENTSSL_SERVERHELLO_SEND', 'CLIENTSSL_DATA', 'SERVERSSL_CLIENTHELLO_SEND', 'SERVERSSL_SERVERHELLO', 'SERVERSSL_HANDSHAKE', 'SERVERSSL_DATA',
        'LB_SELECTED', 'LB_FAILED', 'LB_QUEUED', 'PERSIST_DOWN', 'DNS_REQUEST', 'DNS_RESPONSE', 'ACCESS_SESSION_STARTED', 'ACCESS_SESSION_CLOSED', 'ACCESS_POLICY_AGENT_EVENT', 'ACCESS_ACL_ALLOWED',
        'ASM_REQUEST_DONE', 'ASM_REQUEST_BLOCKING', 'ASM_REQUEST_VIOLATION', 'WEBSOCKET_REQUEST', 'WEBSOCKET_RESPONSE', 'NAME_RESOLVED'];
    const HTTP_EVENTS = EVENTS.filter(e => /^HTTP_/.test(e));
    // F5'te devre dışı Tcl komutları (clouddocs DisabledTclCommands)
    const DISABLED = ['exec', 'open', 'socket', 'file', 'cd', 'pwd', 'glob', 'source', 'load', 'exit', 'vwait', 'fileevent', 'fconfigure', 'fcopy', 'flush', 'gets', 'puts', 'read', 'seek', 'tell', 'eof', 'interp', 'package', 'pid', 'update'];
    // simülatörün tanımadığı ama gerçekte var olan ad alanları: çalışırken etkisiz (no-op) kabul edilir
    const F5_NS = ['HTTP', 'IP', 'SSL', 'TCP', 'UDP', 'LB', 'URI', 'HSL', 'CACHE', 'STREAM', 'COMPRESS', 'STATS', 'ACCESS', 'ASM', 'WEBSOCKET', 'X509', 'CRYPTO', 'ISTATS', 'DNS', 'ROUTE', 'CLASSIFY', 'PERSIST', 'PROFILE', 'AES', 'RESOLV', 'SERVERSSL', 'CLIENTSSL', 'POLICY', 'ACL', 'REWRITE', 'HTML', 'CATEGORY', 'SIP', 'RTSP', 'FTP', 'ADAPT', 'ICAP', 'NAME', 'DATAGRAM', 'AVR'];

    class TclError extends Error { constructor(msg, code) { super(msg); this.tcl = true; this.code = code || 'error'; } }
    class Flow { constructor(kind, value) { this.flow = kind; this.value = value || ''; } }   // return / break / continue

    // ═══ Ayrıştırıcı ═══════════════════════════════════════════════
    // Komut: [{ parts: [...], line }] ; kelime parçası: { t: 'lit', v } | { t: 'var', name, idx? } | { t: 'cmd', script }
    function parse(src, baseLine) {
        let i = 0, line = baseLine || 1; const n = src.length; const cmds = [];
        const err = (m, at) => { throw new TclError(m, 'syntax'); };
        const isWs = c => c === ' ' || c === '\t' || c === '\r';
        function parseVarAt(k) {   // src[k] === '$'
            if (src[k + 1] === '{') { const e = src.indexOf('}', k + 2); if (e < 0) err('missing close-brace for variable name'); return { part: { t: 'var', name: src.slice(k + 2, e) }, end: e + 1 }; }
            let j = k + 1; while (j < n && (/[A-Za-z0-9_]/.test(src[j]) || (src[j] === ':' && src[j + 1] === ':'))) j += src[j] === ':' ? 2 : 1;
            if (j === k + 1) return { part: { t: 'lit', v: '$' }, end: k + 1 };
            const name = src.slice(k + 1, j);
            if (src[j] === '(') { let d = 1, e = j + 1; while (e < n && d) { if (src[e] === '(') d++; else if (src[e] === ')') d--; e++; } return { part: { t: 'var', name, idx: parseInline(src.slice(j + 1, e - 1)) }, end: e }; }
            return { part: { t: 'var', name }, end: j };
        }
        function matchBracket(k) {   // src[k] === '[' → kapanan ']' sonrası indeks
            let d = 0, j = k;
            while (j < n) {
                const c = src[j];
                if (c === '\\') { j += 2; continue; }
                if (c === '[') d++;
                else if (c === ']') { d--; if (!d) return j + 1; }
                else if (c === '{') { j = matchBrace(j); continue; }
                else if (c === '"' && d) { j++; while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; j++; } }
                j++;
            }
            err('missing close-bracket');
        }
        function matchBrace(k) {   // src[k] === '{' → kapanan '}' sonrası indeks
            let d = 0, j = k;
            while (j < n) { const c = src[j]; if (c === '\\') { j += 2; continue; } if (c === '{') d++; else if (c === '}') { d--; if (!d) return j + 1; } j++; }
            err('missing close-brace');
        }
        function esc(c) { return { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', '[': '[', ']': ']', '$': '$', '{': '{', '}': '}', ';': ';', ' ': ' ', a: '\x07' }[c] !== undefined ? { n: '\n', t: '\t', r: '\r', a: '\x07' }[c] || c : c; }
        // süslü parantezsiz metnin içinde yerine koyma parçaları (tırnak ya da çıplak kelime)
        function substParts(text) {
            const parts = []; let buf = '', k = 0;
            const flush = () => { if (buf) { parts.push({ t: 'lit', v: buf }); buf = ''; } };
            while (k < text.length) {
                const c = text[k];
                if (c === '\\') { const d = text[k + 1]; if (d === '\n') { buf += ' '; k += 2; while (k < text.length && isWs(text[k])) k++; continue; } buf += esc(d === undefined ? '\\' : d); k += 2; continue; }
                if (c === '$') { const save = { src, n }; const r = (() => { const sub = parseInline.varFrom(text, k); return sub; })(); flush(); parts.push(r.part); k = r.end; continue; }
                if (c === '[') { let d = 0, j = k; while (j < text.length) { const e = text[j]; if (e === '\\') { j += 2; continue; } if (e === '[') d++; else if (e === ']') { d--; if (!d) break; } else if (e === '{') { let bd = 0; while (j < text.length) { if (text[j] === '{') bd++; else if (text[j] === '}') { bd--; if (!bd) break; } j++; } } j++; } if (j >= text.length) err('missing close-bracket'); flush(); parts.push({ t: 'cmd', script: parse(text.slice(k + 1, j), line) }); k = j + 1; continue; }
                buf += c; k++;
            }
            flush(); return parts;
        }
        while (i < n) {
            // komutlar arası boşluk ve satır sonları
            while (i < n && (isWs(src[i]) || src[i] === '\n' || src[i] === ';')) { if (src[i] === '\n') line++; i++; }
            if (i >= n) break;
            if (src[i] === '#') { while (i < n && src[i] !== '\n') { if (src[i] === '\\' && src[i + 1] === '\n') { i++; line++; } i++; } continue; }
            const words = [], cmdLine = line, cmdStart = i;
            while (i < n && src[i] !== '\n' && src[i] !== ';') {
                if (isWs(src[i])) { i++; continue; }
                if (src[i] === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; }
                const c = src[i];
                if (c === '{') {
                    const e = matchBrace(i); const body = src.slice(i + 1, e - 1);
                    if (body.startsWith('*}')) err('{*} desteklenmiyor');
                    words.push({ parts: [{ t: 'lit', v: body }], braced: true, line }); line += (body.match(/\n/g) || []).length; i = e;
                    if (i < n && !isWs(src[i]) && src[i] !== '\n' && src[i] !== ';' && src[i] !== ']') err('extra characters after close-brace');
                    continue;
                }
                if (c === '"') {
                    let j = i + 1; while (j < n && src[j] !== '"') { if (src[j] === '\\') j++; else if (src[j] === '[') { j = matchBracket(j); continue; } j++; }
                    if (j >= n) err('missing "');
                    const body = src.slice(i + 1, j); words.push({ parts: substParts(body), line }); line += (body.match(/\n/g) || []).length; i = j + 1;
                    if (i < n && !isWs(src[i]) && src[i] !== '\n' && src[i] !== ';' && src[i] !== ']') err('extra characters after close-quote');
                    continue;
                }
                // çıplak kelime
                let j = i; const start = i;
                while (j < n && !isWs(src[j]) && src[j] !== '\n' && src[j] !== ';') {
                    if (src[j] === '\\') { j += 2; continue; }
                    if (src[j] === '[') { j = matchBracket(j); continue; }
                    if (src[j] === '$' && src[j + 1] === '{') { const e = src.indexOf('}', j); j = e + 1; continue; }
                    j++;
                }
                words.push({ parts: substParts(src.slice(start, j)), line }); i = j;
            }
            if (words.length) cmds.push({ words, line: cmdLine, text: src.slice(cmdStart, i).trim() });
        }
        return cmds;
    }
    // satır içi metin için kısa yol (dizi indeksi, expr içi)
    function parseInline(text) { return { text }; }
    parseInline.varFrom = (text, k) => {
        if (text[k + 1] === '{') { const e = text.indexOf('}', k + 2); if (e < 0) throw new TclError('missing close-brace for variable name', 'syntax'); return { part: { t: 'var', name: text.slice(k + 2, e) }, end: e + 1 }; }
        let j = k + 1; while (j < text.length && (/[A-Za-z0-9_]/.test(text[j]) || (text[j] === ':' && text[j + 1] === ':'))) j += text[j] === ':' ? 2 : 1;
        if (j === k + 1) return { part: { t: 'lit', v: '$' }, end: k + 1 };
        const name = text.slice(k + 1, j);
        if (text[j] === '(') { let d = 1, e = j + 1; while (e < text.length && d) { if (text[e] === '(') d++; else if (text[e] === ')') d--; e++; } return { part: { t: 'var', name, idx: { text: text.slice(j + 1, e - 1) } }, end: e }; }
        return { part: { t: 'var', name }, end: j };
    };

    // ═══ Tcl listeleri ═══════════════════════════════════════════════
    function listSplit(s) {
        s = String(s); const out = []; let i = 0; const n = s.length;
        while (i < n) {
            while (i < n && /\s/.test(s[i])) i++; if (i >= n) break;
            if (s[i] === '{') { let d = 0, j = i; for (; j < n; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) break; } } if (j >= n) throw new TclError('unmatched open brace in list'); out.push(s.slice(i + 1, j)); i = j + 1; continue; }
            if (s[i] === '"') { let j = i + 1, b = ''; while (j < n && s[j] !== '"') { if (s[j] === '\\') { b += s[j + 1]; j += 2; continue; } b += s[j++]; } if (j >= n) throw new TclError('unmatched open quote in list'); out.push(b); i = j + 1; continue; }
            let j = i, b = ''; while (j < n && !/\s/.test(s[j])) { if (s[j] === '\\') { b += s[j + 1] || ''; j += 2; continue; } b += s[j++]; } out.push(b); i = j;
        }
        return out;
    }
    const listElem = e => (e === '' ? '{}' : /[\s{}"\\$\[\];]/.test(e) ? (/^[^{}]*$/.test(e) || balanced(e) ? '{' + e + '}' : e.replace(/([\s{}"\\$\[\];])/g, '\\$1')) : e);
    const balanced = e => { let d = 0; for (const c of e) { if (c === '{') d++; else if (c === '}') { d--; if (d < 0) return false; } } return d === 0 && !/\\$/.test(e); };
    const listJoin = a => a.map(listElem).join(' ');

    // glob (string match) → RegExp
    function globRe(p, nocase) {
        let r = '^';
        for (let i = 0; i < p.length; i++) {
            const c = p[i];
            if (c === '*') r += '.*'; else if (c === '?') r += '.';
            else if (c === '[') { const e = p.indexOf(']', i + 1); if (e > i) { r += '[' + p.slice(i + 1, e).replace(/\\/g, '\\\\') + ']'; i = e; } else r += '\\['; }
            else if (c === '\\' && i + 1 < p.length) { r += p[i + 1].replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); i++; }
            else r += c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
        }
        return new RegExp(r + '$', nocase ? 'is' : 's');
    }
    const glob = (p, s, nc) => globRe(String(p), nc).test(String(s));
    // Tcl ARE → JS RegExp (yaygın alt küme)
    function tclRe(p, nocase) { try { return new RegExp(String(p).replace(/\\m/g, '\\b').replace(/\\M/g, '\\b').replace(/\[\[:(\w+):\]\]/g, (m, c) => ({ alpha: '[A-Za-z]', digit: '\\d', alnum: '[A-Za-z0-9]', space: '\\s', upper: '[A-Z]', lower: '[a-z]', xdigit: '[0-9A-Fa-f]' })[c] || m), nocase ? 'i' : ''); } catch (e) { throw new TclError('couldn\'t compile regular expression pattern: ' + e.message); } }

    // ═══ expr ═══════════════════════════════════════════════════════
    const WORD_OPS = ['eq', 'ne', 'contains', 'starts_with', 'ends_with', 'equals', 'matches_glob', 'matches_regex', 'in', 'ni', 'and', 'or', 'not'];
    function exprEval(I, text) {
        let i = 0; const s = String(text), n = s.length;
        const ws = () => { while (i < n && /\s/.test(s[i])) i++; };
        const num = v => { if (typeof v === 'number') return v; const t = String(v).trim(); if (/^[+-]?(0x[0-9a-f]+|\d+(\.\d*)?([eE][+-]?\d+)?|\.\d+)$/i.test(t)) return Number(t); return null; };
        const bool = v => { const x = num(v); if (x !== null) return x !== 0; const t = String(v).toLowerCase(); if (['true', 'yes', 'on'].includes(t)) return true; if (['false', 'no', 'off'].includes(t)) return false; throw new TclError('expected boolean value but got "' + v + '"'); };
        function operand() {
            ws(); const c = s[i];
            if (c === '(') { i++; const v = orE(); ws(); if (s[i] !== ')') throw new TclError('syntax error in expression "' + s + '": missing close parenthesis'); i++; return v; }
            if (c === '!') { i++; return bool(unary()) ? 0 : 1; }
            if (c === '-' && !/\d/.test(s[i + 1] || '')) { i++; const v = num(unary()); return v === null ? 0 : -v; }
            if (c === '$') { const r = parseInline.varFrom(s, i); i = r.end; return I.getVar(r.part.name, r.part.idx ? I.subst(r.part.idx.text) : null); }
            if (c === '[') { let d = 0, j = i; for (; j < n; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '[') d++; else if (s[j] === ']') { d--; if (!d) break; } else if (s[j] === '{') { let bd = 0; for (; j < n; j++) { if (s[j] === '{') bd++; else if (s[j] === '}') { bd--; if (!bd) break; } } } } const r = I.evalScript(parse(s.slice(i + 1, j))); i = j + 1; return r; }
            if (c === '"') { let j = i + 1; while (j < n && s[j] !== '"') { if (s[j] === '\\') j++; j++; } const v = I.subst(s.slice(i + 1, j)); i = j + 1; return v; }
            if (c === '{') { let d = 0, j = i; for (; j < n; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (!d) break; } } const v = s.slice(i + 1, j); i = j + 1; return v; }
            const m = s.slice(i).match(/^(0x[0-9a-fA-F]+|\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+)/); if (m) { i += m[0].length; return Number(m[0]); }
            const f = s.slice(i).match(/^([a-z]+)\s*\(/); if (f) { i += f[0].length; const args = []; ws(); if (s[i] !== ')') { for (;;) { args.push(orE()); ws(); if (s[i] === ',') { i++; continue; } break; } } if (s[i] !== ')') throw new TclError('missing close parenthesis'); i++; return mathFn(f[1], args.map(a => num(a) === null ? 0 : num(a))); }
            const w = s.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/); if (w && ['true', 'false', 'yes', 'no', 'on', 'off'].includes(w[0])) { i += w[0].length; return ['true', 'yes', 'on'].includes(w[0]) ? 1 : 0; }
            throw new TclError('syntax error in expression "' + s + '"' + (w ? ': variable references require preceding $' : ''));
        }
        function mathFn(f, a) {
            const M = { int: x => Math.trunc(x), double: x => x, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil, rand: () => Math.random(), min: Math.min, max: Math.max, sqrt: Math.sqrt, pow: Math.pow, wide: x => Math.trunc(x) };
            if (!M[f]) throw new TclError('invalid command name "tcl::mathfunc::' + f + '"'); return M[f](...a);
        }
        function unary() { return operand(); }
        function peekOp(list) { ws(); for (const o of list) { if (/^[a-z_]+$/.test(o)) { if (s.slice(i, i + o.length) === o && !/[A-Za-z0-9_]/.test(s[i + o.length] || '')) return o; } else if (s.slice(i, i + o.length) === o) return o; } return null; }
        function mul() { let v = unary(); for (;;) { const o = peekOp(['*', '/', '%']); if (!o || s.slice(i, i + 2) === '**') break; i += o.length; const r = num(unary()), l = num(v); if (l === null || r === null) throw new TclError('can\'t use non-numeric string as operand of "' + o + '"'); if ((o === '/' || o === '%') && r === 0) throw new TclError('divide by zero'); v = o === '*' ? l * r : o === '/' ? (Number.isInteger(l) && Number.isInteger(r) ? Math.floor(l / r) : l / r) : ((l % r) + r) % r; } return v; }
        function add() { let v = mul(); for (;;) { const o = peekOp(['+', '-']); if (!o) break; i++; const r = num(mul()), l = num(v); if (l === null || r === null) throw new TclError('can\'t use non-numeric string as operand of "' + o + '"'); v = o === '+' ? l + r : l - r; } return v; }
        function cmp() {
            let v = add();
            for (;;) {
                const o = peekOp(['<=', '>=', '==', '!=', '<', '>', 'eq', 'ne', 'contains', 'starts_with', 'ends_with', 'equals', 'matches_glob', 'matches_regex', 'in', 'ni']); if (!o) break; i += o.length;
                const r = add(), L = String(v), R = String(r), ln = num(v), rn = num(r), both = ln !== null && rn !== null;
                switch (o) {
                    case '==': v = both ? +(ln === rn) : +(L === R); break; case '!=': v = both ? +(ln !== rn) : +(L !== R); break;
                    case '<': v = both ? +(ln < rn) : +(L < R); break; case '>': v = both ? +(ln > rn) : +(L > R); break;
                    case '<=': v = both ? +(ln <= rn) : +(L <= R); break; case '>=': v = both ? +(ln >= rn) : +(L >= R); break;
                    case 'eq': case 'equals': v = +(L === R); break; case 'ne': v = +(L !== R); break;
                    case 'contains': v = +L.includes(R); break; case 'starts_with': v = +L.startsWith(R); break; case 'ends_with': v = +L.endsWith(R); break;
                    case 'matches_glob': v = +glob(R, L); break; case 'matches_regex': v = +tclRe(R).test(L); break;
                    case 'in': v = +listSplit(R).includes(L); break; case 'ni': v = +!listSplit(R).includes(L); break;
                }
            }
            return v;
        }
        function notE() { const o = peekOp(['not']); if (o) { i += 3; return bool(notE()) ? 0 : 1; } return cmp(); }
        function andE() { let v = notE(); for (;;) { const o = peekOp(['&&', 'and']); if (!o) break; i += o.length; const r = notE(); v = bool(v) && bool(r) ? 1 : 0; } return v; }
        function orE() { let v = andE(); for (;;) { const o = peekOp(['||', 'or']); if (!o) break; i += o.length; const r = andE(); v = bool(v) || bool(r) ? 1 : 0; } ws(); if (s[i] === '?') { i++; const a = orE(); ws(); if (s[i] !== ':') throw new TclError('syntax error in expression "' + s + '"'); i++; const b = orE(); v = bool(v) ? a : b; } return v; }
        const v = orE(); ws(); if (i < n) throw new TclError('syntax error in expression "' + s + '": extra tokens at end of expression');
        return typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(v)) : String(v);
    }

    // ═══ Yorumlayıcı ═════════════════════════════════════════════════
    // ctx: { vars, statics, http, lb, actions, log(level,msg), rule, event, dg(name), pools, ... } — motor sağlar
    function Interp(ctx) {
        const I = {
            ctx,
            getVar(name, idx) {
                const store = /^static::/.test(name) ? ctx.statics : ctx.vars;
                const key = name.replace(/^::/, '');
                if (!(key in store)) throw new TclError('can\'t read "' + name + (idx !== null && idx !== undefined ? '(' + idx + ')' : '') + '": no such variable', 'novar');
                const v = store[key];
                if (idx !== null && idx !== undefined) { if (typeof v !== 'object') throw new TclError('can\'t read "' + name + '(' + idx + ')": variable isn\'t array'); if (!(idx in v)) throw new TclError('can\'t read "' + name + '(' + idx + ')": no such element in array'); return v[idx]; }
                if (typeof v === 'object') throw new TclError('can\'t read "' + name + '": variable is array');
                return v;
            },
            setVar(name, val, idx) {
                const store = /^static::/.test(name) ? ctx.statics : ctx.vars; const key = name.replace(/^::/, '');
                if (idx !== null && idx !== undefined) { if (typeof store[key] !== 'object') store[key] = {}; store[key][idx] = String(val); return String(val); }
                store[key] = String(val); return String(val);
            },
            hasVar(name) { const store = /^static::/.test(name) ? ctx.statics : ctx.vars; const m = name.match(/^([^(]+)\((.*)\)$/); if (m) { const v = store[m[1]]; return typeof v === 'object' && m[2] in v; } return name.replace(/^::/, '') in store; },
            word(w) {
                if (w.braced) return w.parts[0].v;
                let out = '';
                for (const p of w.parts) {
                    if (p.t === 'lit') out += p.v;
                    else if (p.t === 'var') out += I.getVar(p.name, p.idx ? I.subst(p.idx.text) : null);
                    else out += I.evalScript(p.script);
                }
                return out;
            },
            subst(text) { const cmds = parse('"' + String(text).replace(/"/g, '\\"') + '"'); return cmds.length ? I.word(cmds[0].words[0]) : ''; },
            evalScript(cmds) {
                let r = '';
                for (const c of cmds) {
                    ctx.line = c.line; if (++ctx.steps > 20000) throw new TclError('iRule çok uzun çalıştı (sonsuz döngü?)', 'limit');
                    try { const args = c.words.map(w => I.word(w)); r = I.call(args, c); }
                    catch (e) { if (e && e.tcl && e.cmdText === undefined) { e.cmdText = c.text; e.cmdLine = c.line; } throw e; }
                }
                return r;
            },
            evalText(text) { return I.evalScript(parse(text, ctx.line)); },
            call(args, c) {
                const name = args[0];
                const f = CORE[name] || F5[name] || (ctx.cmds && ctx.cmds[name]);
                if (f) return String(f(I, args.slice(1), c) ?? '');
                if (DISABLED.includes(name)) throw new TclError('invalid command name "' + name + '"', 'disabled');
                const ns = String(name).match(/^([A-Z][A-Za-z0-9]*)::/);
                if (ns && F5_NS.includes(ns[1])) { ctx.note('[Simülatör] ' + name + ' bu lab sürümünde etkisiz (desteklenmiyor).'); return ''; }
                throw new TclError('invalid command name "' + name + '"', 'nocmd');
            },
        };
        return I;
    }
    const need = (a, min, max, usage) => { if (a.length < min || (max !== undefined && a.length > max)) throw new TclError('wrong # args: should be "' + usage + '"'); };
    const cond = (I, e) => { const v = exprEval(I, e); const x = Number(v); if (!isNaN(x) && String(v).trim() !== '') return x !== 0; const t = String(v).toLowerCase(); if (['true', 'yes', 'on'].includes(t)) return true; if (['false', 'no', 'off'].includes(t)) return false; throw new TclError('expected boolean value but got "' + v + '"'); };

    // ── çekirdek Tcl komutları (F5'te izinli olanlar)
    const CORE = {
        set(I, a) { need(a, 1, 2, 'set varName ?newValue?'); const m = a[0].match(/^([^(]+)\((.*)\)$/); if (a.length === 1) return m ? I.getVar(m[1], m[2]) : I.getVar(a[0]); return m ? I.setVar(m[1], a[1], m[2]) : I.setVar(a[0], a[1]); },
        unset(I, a) { for (const v of a.filter(x => x !== '-nocomplain')) { const store = /^static::/.test(v) ? I.ctx.statics : I.ctx.vars; delete store[v]; } return ''; },
        incr(I, a) { need(a, 1, 2, 'incr varName ?increment?'); const cur = I.hasVar(a[0]) ? Number(I.getVar(a[0])) : 0; if (isNaN(cur)) throw new TclError('expected integer but got "' + I.getVar(a[0]) + '"'); return I.setVar(a[0], cur + Number(a[1] === undefined ? 1 : a[1])); },
        append(I, a) { need(a, 1, undefined, 'append varName ?value ...?'); const cur = I.hasVar(a[0]) ? I.getVar(a[0]) : ''; return I.setVar(a[0], cur + a.slice(1).join('')); },
        lappend(I, a) { const cur = I.hasVar(a[0]) ? listSplit(I.getVar(a[0])) : []; return I.setVar(a[0], listJoin(cur.concat(a.slice(1)))); },
        expr(I, a) { return exprEval(I, a.join(' ')); },
        if(I, a) {
            let k = 0;
            for (;;) {
                const c = a[k++]; if (c === undefined) throw new TclError('wrong # args: no expression after "if" argument');
                let body = a[k++]; if (body === 'then') body = a[k++];
                if (cond(I, c)) return I.evalText(body);
                const nx = a[k++]; if (nx === undefined) return '';
                if (nx === 'elseif') continue;
                if (nx === 'else') return I.evalText(a[k]);
                return I.evalText(nx);
            }
        },
        switch(I, a) {
            let mode = 'exact', k = 0, nocase = false;
            while (a[k] && a[k][0] === '-') { const o = a[k++]; if (o === '--') break; if (o === '-glob') mode = 'glob'; else if (o === '-exact') mode = 'exact'; else if (o === '-regexp') mode = 'regexp'; else if (o === '-nocase') nocase = true; else throw new TclError('bad option "' + o + '": must be -exact, -glob, -nocase, -regexp, or --'); }
            const str = a[k++]; let pairs = a.slice(k); if (pairs.length === 1) pairs = listSplit(pairs[0]);
            if (pairs.length % 2) throw new TclError('extra switch pattern with no body');
            for (let j = 0; j < pairs.length; j += 2) {
                const p = pairs[j]; const hit = p === 'default' && j === pairs.length - 2 ? true : mode === 'glob' ? glob(p, str, nocase) : mode === 'regexp' ? tclRe(p, nocase).test(str) : nocase ? p.toLowerCase() === String(str).toLowerCase() : p === str;
                if (hit) { let b = j; while (pairs[b + 1] === '-') b += 2; if (b + 1 >= pairs.length) throw new TclError('no body specified for pattern "' + p + '"'); return I.evalText(pairs[b + 1]); }
            }
            return '';
        },
        foreach(I, a) {
            need(a, 3, 3, 'foreach varList list command'); const vars = listSplit(a[0]), L = listSplit(a[1]);
            for (let j = 0; j < L.length; j += vars.length) { vars.forEach((v, q) => I.setVar(v, L[j + q] === undefined ? '' : L[j + q])); try { I.evalText(a[2]); } catch (e) { if (e instanceof Flow && e.flow === 'break') break; if (e instanceof Flow && e.flow === 'continue') continue; throw e; } }
            return '';
        },
        while(I, a) { need(a, 2, 2, 'while test command'); let g = 0; while (cond(I, a[0])) { if (++g > 1000) throw new TclError('iRule çok uzun çalıştı (sonsuz döngü?)', 'limit'); try { I.evalText(a[1]); } catch (e) { if (e instanceof Flow && e.flow === 'break') break; if (e instanceof Flow && e.flow === 'continue') continue; throw e; } } return ''; },
        for(I, a) { need(a, 4, 4, 'for start test next command'); I.evalText(a[0]); let g = 0; while (cond(I, a[1])) { if (++g > 1000) throw new TclError('iRule çok uzun çalıştı (sonsuz döngü?)', 'limit'); try { I.evalText(a[3]); } catch (e) { if (e instanceof Flow && e.flow === 'break') break; if (!(e instanceof Flow && e.flow === 'continue')) throw e; } I.evalText(a[2]); } return ''; },
        break() { throw new Flow('break'); }, continue() { throw new Flow('continue'); },
        return(I, a) { throw new Flow('return', a.filter(x => !/^-(code|level)$/.test(x))[0] || ''); },
        error(I, a) { throw new TclError(a[0] || ''); },
        catch(I, a) { need(a, 1, 2, 'catch script ?resultVarName?'); try { const r = I.evalText(a[0]); if (a[1]) I.setVar(a[1], r); return '0'; } catch (e) { if (e instanceof Flow) { if (a[1]) I.setVar(a[1], e.value); return e.flow === 'return' ? '2' : e.flow === 'break' ? '3' : '4'; } if (!e.tcl) throw e; if (a[1]) I.setVar(a[1], e.message); return '1'; } },
        info(I, a) { if (a[0] === 'exists') return I.hasVar(a[1]) ? '1' : '0'; throw new TclError('bad option "' + a[0] + '": bu lab\'da yalnız "info exists"'); },
        list(I, a) { return listJoin(a); },
        llength(I, a) { need(a, 1, 1, 'llength list'); return String(listSplit(a[0]).length); },
        lindex(I, a) { const L = listSplit(a[0]); if (a.length < 2) return a[0]; const k = a[1] === 'end' ? L.length - 1 : /^end-\d+$/.test(a[1]) ? L.length - 1 - +a[1].slice(4) : Number(a[1]); return L[k] === undefined ? '' : L[k]; },
        lrange(I, a) { const L = listSplit(a[0]); const ix = x => (x === 'end' ? L.length - 1 : /^end-\d+$/.test(x) ? L.length - 1 - +x.slice(4) : Number(x)); return listJoin(L.slice(Math.max(0, ix(a[1])), ix(a[2]) + 1)); },
        lsearch(I, a) { let mode = 'glob'; const o = a.filter(x => /^-/.test(x)); if (o.includes('-exact')) mode = 'exact'; if (o.includes('-regexp')) mode = 'regexp'; const [L, p] = a.filter(x => !/^-/.test(x)); const arr = listSplit(L); const k = arr.findIndex(x => (mode === 'exact' ? x === p : mode === 'regexp' ? tclRe(p).test(x) : glob(p, x))); return String(k); },
        concat(I, a) { return a.map(x => x.trim()).filter(Boolean).join(' '); },
        split(I, a) { need(a, 1, 2, 'split string ?splitChars?'); const ch = a[1] === undefined ? ' \t\n' : a[1]; if (ch === '') return listJoin([...a[0]]); const out = []; let cur = ''; for (const c of a[0]) { if (ch.includes(c)) { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return listJoin(out); },
        join(I, a) { need(a, 1, 2, 'join list ?joinString?'); return listSplit(a[0]).join(a[1] === undefined ? ' ' : a[1]); },
        string(I, a) {
            const sub = a[0], r = a.slice(1);
            const nc = r[0] === '-nocase' ? (r.shift(), true) : false;
            switch (sub) {
                case 'tolower': return r[0].toLowerCase(); case 'toupper': return r[0].toUpperCase();
                case 'length': return String([...r[0]].length);
                case 'match': need(r, 2, 2, 'string match ?-nocase? pattern string'); return glob(r[0], r[1], nc) ? '1' : '0';
                case 'equal': return (nc ? r[0].toLowerCase() === r[1].toLowerCase() : r[0] === r[1]) ? '1' : '0';
                case 'compare': { const x = nc ? r[0].toLowerCase() : r[0], y = nc ? r[1].toLowerCase() : r[1]; return x < y ? '-1' : x > y ? '1' : '0'; }
                case 'first': return String(r[1].indexOf(r[0], Number(r[2] || 0)));
                case 'last': return String(r[1].lastIndexOf(r[0]));
                case 'index': { const k = r[1] === 'end' ? r[0].length - 1 : Number(r[1]); return r[0][k] || ''; }
                case 'range': { const ix = x => (x === 'end' ? r[0].length - 1 : /^end-\d+$/.test(x) ? r[0].length - 1 - +x.slice(4) : Number(x)); return r[0].slice(Math.max(0, ix(r[1])), ix(r[2]) + 1); }
                case 'trim': return r[1] === undefined ? r[0].trim() : r[0].replace(new RegExp('^[' + r[1].replace(/[\]\\^-]/g, '\\$&') + ']+|[' + r[1].replace(/[\]\\^-]/g, '\\$&') + ']+$', 'g'), '');
                case 'trimleft': return r[1] === undefined ? r[0].replace(/^\s+/, '') : r[0].replace(new RegExp('^[' + r[1].replace(/[\]\\^-]/g, '\\$&') + ']+'), '');
                case 'trimright': return r[1] === undefined ? r[0].replace(/\s+$/, '') : r[0].replace(new RegExp('[' + r[1].replace(/[\]\\^-]/g, '\\$&') + ']+$'), '');
                case 'map': { const m = listSplit(r[0]); let s = r[1], out = ''; for (let i = 0; i < s.length;) { let hit = false; for (let k = 0; k < m.length; k += 2) { const f = m[k]; if (f && (nc ? s.substr(i, f.length).toLowerCase() === f.toLowerCase() : s.startsWith(f, i))) { out += m[k + 1]; i += f.length; hit = true; break; } } if (!hit) out += s[i++]; } return out; }
                case 'repeat': return r[0].repeat(Number(r[1]));
                case 'reverse': return [...r[0]].reverse().join('');
                case 'is': { const [cls, v] = r.filter(x => x !== '-strict'); const T = { integer: /^[+-]?\d+$/, digit: /^\d*$/, alpha: /^[A-Za-z]*$/, alnum: /^[A-Za-z0-9]*$/, double: /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/, space: /^\s*$/, upper: /^[A-Z]*$/, lower: /^[a-z]*$/ }; if (!T[cls]) throw new TclError('bad class "' + cls + '"'); return T[cls].test(v) && (!r.includes('-strict') || v !== '') ? '1' : '0'; }
                default: throw new TclError('unknown or ambiguous subcommand "' + sub + '": must be compare, equal, first, index, is, last, length, map, match, range, repeat, reverse, tolower, toupper, trim, trimleft, or trimright');
            }
        },
        regexp(I, a) {
            let nc = false, k = 0; while (a[k] && a[k][0] === '-') { const o = a[k++]; if (o === '--') break; if (o === '-nocase') nc = true; }
            const re = tclRe(a[k], nc), m = String(a[k + 1] === undefined ? '' : a[k + 1]).match(re); const vars = a.slice(k + 2);
            vars.forEach((v, q) => I.setVar(v, m ? (m[q] || '') : '')); return m ? '1' : '0';
        },
        regsub(I, a) {
            let nc = false, all = false, k = 0; while (a[k] && a[k][0] === '-') { const o = a[k++]; if (o === '--') break; if (o === '-nocase') nc = true; if (o === '-all') all = true; }
            const re = new RegExp(tclRe(a[k], nc).source, (nc ? 'i' : '') + (all ? 'g' : '')); const sub = String(a[k + 2]).replace(/\\(\d)/g, '$$$1').replace(/&/g, '$$&');
            const out = String(a[k + 1]).replace(re, sub); if (a[k + 3] !== undefined) { I.setVar(a[k + 3], out); return String(re.test(String(a[k + 1])) ? 1 : 0); } return out;
        },
        format(I, a) { let q = 1; return String(a[0]).replace(/%(-?\d*)(\.\d+)?([sdxX%])/g, (m, w, p, t) => { if (t === '%') return '%'; const v = a[q++]; let s = t === 'd' ? String(Math.trunc(Number(v))) : t === 'x' ? Number(v).toString(16) : t === 'X' ? Number(v).toString(16).toUpperCase() : String(v); if (w) s = w[0] === '-' ? s.padEnd(+w.slice(1)) : s.padStart(+w); return s; }); },
        getfield(I, a) { need(a, 3, 3, 'getfield <string> <split> <field_number>'); const parts = String(a[0]).split(a[1]); return parts[Number(a[2]) - 1] || ''; },
        findstr(I, a) { const s = String(a[0]), k = s.indexOf(a[1]); if (k < 0) return ''; let st = k + Number(a[2] || 0); let r = s.slice(st); if (a[3] !== undefined) { if (/^\d+$/.test(a[3])) r = r.slice(0, +a[3]); else { const e = r.indexOf(a[3]); if (e >= 0) r = r.slice(0, e); } } return r; },
        substr(I, a) { const s = String(a[0]).slice(Number(a[1])); if (a[2] === undefined) return s; if (/^\d+$/.test(a[2])) return s.slice(0, +a[2]); const e = s.indexOf(a[2]); return e >= 0 ? s.slice(0, e) : s; },
        clock(I, a) { const now = I.ctx.now ? I.ctx.now() : 1790000000000; if (a[0] === 'seconds') return String(Math.floor(now / 1000)); if (a[0] === 'milliseconds' || a[0] === 'clicks') return String(now); throw new TclError('bad option "' + a[0] + '": bu lab\'da clock seconds | milliseconds'); },
        log(I, a) {
            let fac = 'local0.', args = a.slice(); if (/^-noname$/.test(args[0])) args.shift();
            if (args.length === 2) fac = args.shift(); if (args.length !== 1) throw new TclError('wrong # args: should be "log ?facility.level? message"');
            I.ctx.log(fac, args[0]); return '';
        },
        after(I, a) { if (/^\d+$/.test(a[0]) && a.length === 1) return ''; throw new TclError('after: bu lab\'da yalnız "after <ms>" (bekleme etkisiz)'); },
    };


    // ═══ F5 komutları ═════════════════════════════════════════════════
    // ctx.req { method, uri, version, headers: [[ad, değer]], host }, ctx.resp { status, headers, body } (HTTP_RESPONSE'ta),
    // ctx.client { ip, port }, ctx.vs { name, ip, port }, ctx.lb { pool, member }, ctx.act { respond, pool, member, node, reject, drop, off: Set },
    // ctx.dg(name) → { type, records: [[anahtar, değer]] } | null, ctx.hasPool(n), ctx.activeMembers(n), ctx.table
    const hdrList = o => (o === 'resp' ? 'resp' : 'req');
    const HTTP_REQ_ONLY = ['uri', 'path', 'query', 'method', 'host', 'redirect'];
    function f5cmds() {
        const ev = I => I.ctx.event;
        const isResp = I => /^HTTP_RESPONSE/.test(ev(I));
        const httpOk = I => { if (!/^HTTP_|^LB_|^SERVER_CONNECTED$|^CLIENTSSL_HANDSHAKE$/.test(ev(I)) || !I.ctx.req) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); };
        const H = I => (isResp(I) ? I.ctx.resp.headers : I.ctx.req.headers);
        const hget = (L, n) => { const x = L.find(h => h[0].toLowerCase() === String(n).toLowerCase()); return x ? x[1] : ''; };
        const onceRespond = I => { if (I.ctx.act.respond) throw new TclError('Operation not supported. Multiple redirect/respond invocations not allowed (line ' + I.ctx.line + ')', 'abort'); };
        const splitUri = u => { const q = u.indexOf('?'); return q < 0 ? [u, ''] : [u.slice(0, q), u.slice(q + 1)]; };
        const C = {};
        C['HTTP::host'] = (I, a) => { httpOk(I); return hget(I.ctx.req.headers, 'Host'); };
        C['HTTP::uri'] = (I, a) => { httpOk(I); if (isResp(I)) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); if (a.length) { I.ctx.req.uri = a[0]; I.ctx.act.uriChanged = true; return ''; } return I.ctx.req.uri; };
        C['HTTP::path'] = (I, a) => { httpOk(I); if (isResp(I)) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); const [p, q] = splitUri(I.ctx.req.uri); if (a.length) { I.ctx.req.uri = a[0] + (q ? '?' + q : ''); I.ctx.act.uriChanged = true; return ''; } return p; };
        C['HTTP::query'] = (I, a) => { httpOk(I); if (isResp(I)) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); return splitUri(I.ctx.req.uri)[1]; };
        C['HTTP::method'] = (I, a) => { httpOk(I); if (isResp(I)) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); return I.ctx.req.method; };
        C['HTTP::version'] = (I, a) => { httpOk(I); return isResp(I) ? '1.1' : (I.ctx.req.version || '1.1'); };
        C['HTTP::status'] = (I, a) => { httpOk(I); if (!isResp(I)) throw new TclError('Operation not supported (line ' + I.ctx.line + ')', 'abort'); return String(I.ctx.resp.status); };
        C['HTTP::header'] = (I, a) => {
            httpOk(I); const L = H(I); let sub = a[0];
            const known = ['value', 'names', 'exists', 'count', 'insert', 'replace', 'remove', 'values', 'at', 'is_redirect', 'is_keepalive', 'insert_modssl_fields', 'sanitize', 'lws'];
            if (!known.includes(sub)) { if (a.length !== 1) throw new TclError('wrong # args'); return hget(L, sub); }   // HTTP::header <ad>
            const r = a.slice(1).filter(x => x !== 'lws');
            switch (sub) {
                case 'value': return hget(L, r[0]);
                case 'values': return listJoin(L.filter(h => h[0].toLowerCase() === r[0].toLowerCase()).map(h => h[1]));
                case 'names': return listJoin(L.map(h => h[0]));
                case 'exists': return L.some(h => h[0].toLowerCase() === r[0].toLowerCase()) ? '1' : '0';
                case 'count': return String(r.length ? L.filter(h => h[0].toLowerCase() === r[0].toLowerCase()).length : L.length);
                case 'insert': { const pairs = r.length === 1 ? listSplit(r[0]) : r; for (let k = 0; k < pairs.length; k += 2) L.push([pairs[k], pairs[k + 1] === undefined ? '' : pairs[k + 1]]); I.ctx.act.hdrChanged = true; return ''; }
                case 'replace': { const k = L.findIndex(h => h[0].toLowerCase() === r[0].toLowerCase()); if (k >= 0) { for (let j = L.length - 1; j >= 0; j--) if (j !== k && L[j][0].toLowerCase() === r[0].toLowerCase()) L.splice(j, 1); L[k] = [L[k][0], r[1] === undefined ? '' : r[1]]; } else L.push([r[0], r[1] === undefined ? '' : r[1]]); I.ctx.act.hdrChanged = true; return ''; }
                case 'remove': { for (let j = L.length - 1; j >= 0; j--) if (L[j][0].toLowerCase() === String(r[0]).toLowerCase()) L.splice(j, 1); I.ctx.act.hdrChanged = true; return ''; }
                case 'is_redirect': return isResp(I) && /^30[1237]$/.test(String(I.ctx.resp.status)) ? '1' : '0';
                case 'is_keepalive': return '1';
                default: return '';
            }
        };
        C['HTTP::cookie'] = (I, a) => {
            httpOk(I); const ck = () => { const out = []; if (isResp(I)) { I.ctx.resp.headers.filter(h => /^set-cookie$/i.test(h[0])).forEach(h => { const m = h[1].match(/^([^=]+)=([^;]*)/); if (m) out.push([m[1].trim(), m[2]]); }); } else { const c = hget(I.ctx.req.headers, 'Cookie'); c.split(';').forEach(x => { const m = x.match(/^\s*([^=]+)=(.*)$/); if (m) out.push([m[1].trim(), m[2].trim()]); }); } return out; };
            const sub = a[0];
            if (sub === 'names') return listJoin(ck().map(x => x[0]));
            if (sub === 'count') return String(ck().length);
            if (sub === 'exists') return ck().some(x => x[0] === a[1]) ? '1' : '0';
            if (sub === 'value') { const x = ck().find(y => y[0] === a[1]); return x ? x[1] : ''; }
            if (sub === 'insert') { const nm = a[a.indexOf('name') + 1], vl = a[a.indexOf('value') + 1]; if (isResp(I)) I.ctx.resp.headers.push(['Set-Cookie', nm + '=' + vl]); else { const cur = hget(I.ctx.req.headers, 'Cookie'); const L = I.ctx.req.headers.filter(h => !/^cookie$/i.test(h[0])); L.push(['Cookie', (cur ? cur + '; ' : '') + nm + '=' + vl]); I.ctx.req.headers.length = 0; L.forEach(h => I.ctx.req.headers.push(h)); } return ''; }
            if (sub === 'remove') { if (!isResp(I)) { const rest = ck().filter(x => x[0] !== a[1]); const L = I.ctx.req.headers.filter(h => !/^cookie$/i.test(h[0])); if (rest.length) L.push(['Cookie', rest.map(x => x[0] + '=' + x[1]).join('; ')]); I.ctx.req.headers.length = 0; L.forEach(h => I.ctx.req.headers.push(h)); } else { const L = I.ctx.resp.headers; for (let j = L.length - 1; j >= 0; j--) if (/^set-cookie$/i.test(L[j][0]) && L[j][1].startsWith(a[1] + '=')) L.splice(j, 1); } return ''; }
            if (a.length === 1) { const x = ck().find(y => y[0] === sub); return x ? x[1] : ''; }
            I.ctx.note('[Simülatör] HTTP::cookie ' + sub + ' bu lab sürümünde etkisiz.'); return '';
        };
        C['HTTP::redirect'] = (I, a) => { httpOk(I); need(a, 1, 1, 'HTTP::redirect <url>'); onceRespond(I); I.ctx.act.respond = { code: 302, headers: [['Location', a[0]], ['Connection', 'Keep-Alive']], body: '', redirect: true }; return ''; };
        C['HTTP::respond'] = (I, a) => {
            httpOk(I); if (!a.length || !/^\d{3}$/.test(a[0])) throw new TclError('wrong # args: should be "HTTP::respond <status code> ?content <content>? ?noserver? ?<header name> <header value>?*"');
            onceRespond(I); const code = +a[0]; let body = '', k = 1; const headers = []; let noserver = false;
            while (k < a.length) {
                if (a[k] === 'content') { body = a[k + 1] === undefined ? '' : a[k + 1]; k += 2; continue; }
                if (a[k] === '-version') { k += 2; continue; }
                if (a[k] === 'noserver') { noserver = true; k++; continue; }
                if (a[k] === '-reset') { k++; continue; }
                if (a[k + 1] === undefined) throw new TclError('wrong # args: header name "' + a[k] + '" has no value');
                headers.push([a[k], a[k + 1]]); k += 2;
            }
            I.ctx.act.respond = { code, headers, body, noserver }; return '';
        };
        C['HTTP::close'] = (I) => { I.ctx.act.close = true; return ''; };
        C['HTTP::release'] = C['HTTP::collect'] = (I) => { I.ctx.note('[Simülatör] HTTP::collect/release bu lab sürümünde etkisiz (gövde toplanmaz).'); return ''; };
        C['HTTP::payload'] = (I) => (isResp(I) ? I.ctx.resp.body || '' : '');
        C['HTTP::is_redirect'] = (I) => (isResp(I) && /^30[1237]$/.test(String(I.ctx.resp.status)) ? '1' : '0');
        C['HTTP::disable'] = (I) => { I.ctx.act.httpOff = true; return ''; };
        C['URI::path'] = (I, a) => { const p = splitUri(a[0])[0]; const k = p.lastIndexOf('/'); return k < 0 ? '/' : p.slice(0, k + 1); };
        C['URI::basename'] = (I, a) => { const p = splitUri(a[0])[0]; return p.slice(p.lastIndexOf('/') + 1); };
        C['URI::query'] = (I, a) => { const q = splitUri(a[0])[1]; if (a.length === 1) return q; const m = q.split('&').map(x => x.split('=')).find(x => x[0] === a[1]); return m ? (m[1] || '') : ''; };
        C['URI::decode'] = (I, a) => { try { return decodeURIComponent(a[0].replace(/\+/g, ' ')); } catch (e) { return a[0]; } };
        C['URI::encode'] = (I, a) => encodeURIComponent(a[0]);
        C['URI::protocol'] = (I, a) => { const m = a[0].match(/^([a-z]+):/i); return m ? m[1] : ''; };
        C['IP::client_addr'] = (I) => I.ctx.client.ip;
        C['IP::remote_addr'] = (I) => (/^(SERVER_|HTTP_RESPONSE|LB_SELECTED)/.test(ev(I)) && I.ctx.lb && I.ctx.lb.ip ? I.ctx.lb.ip : I.ctx.client.ip);
        C['IP::local_addr'] = (I) => (/^(SERVER_|HTTP_RESPONSE)/.test(ev(I)) && I.ctx.lb && I.ctx.lb.snat ? I.ctx.lb.snat : I.ctx.vs.ip);
        C['IP::server_addr'] = (I) => (I.ctx.lb && I.ctx.lb.ip) || '';
        C['IP::addr'] = (I, a) => {
            // IP::addr <adres1>[/maske] equals <adres2>[/maske] | IP::addr <adres> mask <maske>
            const n = ip => ip.split('.').reduce((x, y) => x * 256 + (+y), 0) >>> 0;
            const pre = (s) => { const [ip, l] = String(s).split('/'); const len = l === undefined ? 32 : /^\d+$/.test(l) ? +l : maskLenOf(l); return { ip, len }; };
            const maskLenOf = m => { const x = n(m); let l = 0; while (l < 32 && (x & (0x80000000 >>> l))) l++; return l; };
            if (a[1] === 'mask') { const len = String(a[2]).includes('.') ? maskLenOf(String(a[2]).replace(/^.*\//, '')) : +String(a[2]).replace(/^\//, ''); const x = n(pre(a[0]).ip); const mk = len ? (0xFFFFFFFF << (32 - len)) >>> 0 : 0; return [24, 16, 8, 0].map(sh => (((x & mk) >>> 0) >>> sh) & 255).join('.'); }
            if (a[1] === 'equals' || a[1] === 'eq') { const A = pre(a[0]), B = pre(a[2]); const len = Math.min(A.len, B.len); const mk = len ? (0xFFFFFFFF << (32 - len)) >>> 0 : 0; return ((n(A.ip) & mk) >>> 0) === ((n(B.ip) & mk) >>> 0) ? '1' : '0'; }
            throw new TclError('wrong # args: should be "IP::addr <addr1>[/<mask>] equals <addr2>[/<mask>]"');
        };
        C['TCP::client_port'] = C['TCP::remote_port'] = (I) => String(I.ctx.client.port);
        C['TCP::local_port'] = (I) => String(I.ctx.vs.port);
        C['TCP::close'] = (I) => { I.ctx.act.reject = true; return ''; };
        C['virtual'] = (I, a) => { if (!a.length || a[0] === 'name') return '/Common/' + I.ctx.vs.name; throw new TclError('virtual: bu lab\'da yalnız "virtual name"'); };
        C['pool'] = (I, a) => {
            need(a, 1, 3, 'pool <pool_name> ?member <addr> ?<port>??');
            if (!I.ctx.hasPool(a[0])) throw new TclError('no such pool: ' + a[0] + ' (line ' + I.ctx.line + ')', 'nopool');
            I.ctx.act.pool = a[0]; I.ctx.act.member = a[1] === 'member' ? (a[2] || '') + (a[3] ? ':' + a[3] : '') : (a[1] ? a[1] + (a[2] ? ':' + a[2] : '') : null); I.ctx.act.node = null; return '';
        };
        C['node'] = (I, a) => { need(a, 1, 2, 'node <addr> ?<port>?'); I.ctx.act.node = a[1] ? a[0] + ':' + a[1] : a[0]; return ''; };
        C['snat'] = (I, a) => { I.ctx.act.snat = a[0]; return ''; };
        C['snatpool'] = (I, a) => { I.ctx.act.snatpool = a[0]; return ''; };
        C['active_members'] = (I, a) => { if (a[0] === '-list') return listJoin(I.ctx.activeMembers(a[1], true)); if (!I.ctx.hasPool(a[0])) throw new TclError('no such pool: ' + a[0] + ' (line ' + I.ctx.line + ')', 'nopool'); return String(I.ctx.activeMembers(a[0])); };
        C['LB::server'] = (I, a) => { const lb = I.ctx.lb || {}; const k = a[0] || ''; if (k === 'addr') return lb.ip || ''; if (k === 'port') return lb.port ? String(lb.port) : ''; if (k === 'pool') return lb.pool ? '/Common/' + lb.pool : ''; if (k === 'name') return lb.pool ? '/Common/' + lb.pool + ' ' + lb.ip + ' ' + lb.port : ''; return lb.pool ? '/Common/' + lb.pool + ' ' + lb.ip + ' ' + lb.port : ''; };
        C['LB::reselect'] = (I, a) => { if (a[0] === 'pool' && a[1]) { if (!I.ctx.hasPool(a[1])) throw new TclError('no such pool: ' + a[1] + ' (line ' + I.ctx.line + ')', 'nopool'); I.ctx.act.reselect = a[1]; } return ''; };
        C['LB::status'] = (I) => 'up';
        C['event'] = (I, a) => { if (a[0] === 'disable') { if (a[1] === 'all') I.ctx.act.off.add('*'); else I.ctx.act.off.add(ev(I)); return ''; } if (a[0] === 'enable') return ''; return ev(I); };
        C['reject'] = (I) => { I.ctx.act.reject = true; return ''; };
        C['drop'] = C['discard'] = (I) => { I.ctx.act.drop = true; return ''; };
        C['persist'] = (I, a) => { I.ctx.act.persist = a.slice(); return ''; };
        C['class'] = (I, a) => {
            const sub = a[0]; let r = a.slice(1); const opts = []; while (r[0] && r[0][0] === '-' && r[0] !== '--') opts.push(r.shift()); if (r[0] === '--') r.shift();
            const dgOf = nm => { const d = I.ctx.dg(nm); if (!d) throw new TclError('class ' + sub + ': data group "' + nm + '" not found', 'nodg'); return d; };
            if (sub === 'exists') return I.ctx.dg(r[0]) ? '1' : '0';
            if (sub === 'size') return String(dgOf(r[0]).records.length);
            if (sub === 'names') return listJoin(dgOf(r[0]).records.map(x => x[0]));
            if (sub === 'get') return listJoin(dgOf(r[0]).records.map(x => listJoin([x[0], x[1]])));
            if (sub === 'lookup') { const d = dgOf(r[1]); const x = d.records.find(y => keyEq(d, y[0], r[0])); return x ? x[1] : ''; }
            if (sub === 'match' || sub === 'search') {
                const [item, op, nm] = r; const d = dgOf(nm);
                const hit = d.records.find(y => (d.type === 'ip' && ['equals', 'eq'].includes(op) ? ipIn(item, y[0]) : op === 'equals' ? keyEq(d, y[0], item) : op === 'starts_with' ? String(item).startsWith(y[0]) : op === 'ends_with' ? String(item).endsWith(y[0]) : op === 'contains' ? String(item).includes(y[0]) : false));
                if (!['equals', 'starts_with', 'ends_with', 'contains'].includes(op)) throw new TclError('bad operator "' + op + '": must be equals, starts_with, ends_with, or contains');
                if (opts.includes('-value')) return hit ? hit[1] : ''; if (opts.includes('-name')) return hit ? hit[0] : '';
                return hit ? '1' : '0';
            }
            throw new TclError('class: bu lab\'da match | search | lookup | exists | size | names | get');
        };
        const keyEq = (d, k, v) => (d.type === 'integer' ? Number(k) === Number(v) : String(k) === String(v));
        const ipIn = (ip, net) => { const [n0, l] = net.split('/'); const len = l === undefined ? 32 : +l; const x = s => s.split('.').reduce((p, q) => p * 256 + (+q), 0) >>> 0; const mk = len ? (0xFFFFFFFF << (32 - len)) >>> 0 : 0; return ((x(ip) & mk) >>> 0) === ((x(n0) & mk) >>> 0); };
        C['table'] = (I, a) => {
            const T = I.ctx.table; const sub = a[0]; let r = a.slice(1).filter(x => !['-notouch', '-excl', '-mustexist'].includes(x)); const must = a.includes('-mustexist'), excl = a.includes('-excl');
            const sk = r[0] === '-subtable' ? (r.shift(), r.shift()) : '';
            const key = sk + '\u0000' + r[0];
            if (sub === 'set') { if (excl && key in T) return T[key]; T[key] = r[1] === undefined ? '' : r[1]; return T[key]; }
            if (sub === 'add') { if (key in T) return T[key]; T[key] = r[1]; return T[key]; }
            if (sub === 'lookup') return key in T ? T[key] : '';
            if (sub === 'incr') { if (!(key in T)) { if (must) return ''; T[key] = '0'; } T[key] = String(+T[key] + Number(r[1] === undefined ? 1 : r[1])); return T[key]; }
            if (sub === 'delete') { if (r[0] === '-all') { Object.keys(T).filter(k => k.startsWith(sk + '\u0000')).forEach(k => delete T[k]); } else delete T[key]; return ''; }
            if (sub === 'keys') { return String(Object.keys(T).filter(k => k.startsWith(sk + '\u0000')).length); }
            if (sub === 'timeout' || sub === 'lifetime') return '180';
            throw new TclError('table: bu lab\'da set | add | lookup | incr | delete | keys');
        };
        C['HSL::open'] = (I) => 'hsl_handle'; C['HSL::send'] = (I, a) => { I.ctx.note('[Simülatör] HSL::send → uzak log sunucusuna: ' + (a[1] || '')); return ''; };
        C['SSL::sni'] = (I, a) => (I.ctx.sni || '');
        C['SSL::cipher'] = (I, a) => (a[0] === 'version' ? 'TLSv1.2' : a[0] === 'bits' ? '128' : 'ECDHE-RSA-AES128-GCM-SHA256');
        return C;
    }
    const F5 = f5cmds();
    // ═══ Kural ayrıştırma: when OLAY [priority N] { gövde } ═══════════
    // Dönüş: { events: [{ name, priority, body, line }], err } — hata metni motorun tmsh hata biçimine konur
    function compile(src) {
        let cmds;
        try { cmds = parse(src); } catch (e) { return { err: e.message, kind: 'syntax' }; }
        const events = [], refs = []; let rulePrio = null;
        // aynı satırda birden çok "when" bloğu: tek komut gibi ayrışır, olaylara bölünür
        const split = [];
        for (const c of cmds) {
            const ws = c.words; let k = 0;
            while (k < ws.length) { let e = k + 1; while (e < ws.length && !(ws[e].parts.length === 1 && ws[e].parts[0].t === 'lit' && !ws[e].braced && ws[e].parts[0].v === 'when')) e++; split.push(Object.assign({}, c, { words: ws.slice(k, e) })); k = e; }
        }
        cmds = split;
        for (const c of cmds) {
            const w = c.words.map(x => (x.braced ? x.parts[0].v : x.parts.map(p => (p.t === 'lit' ? p.v : '')).join('')));
            if (w[0] === 'priority' && w.length === 2 && /^\d+$/.test(w[1])) { rulePrio = +w[1]; continue; }
            if (w[0] !== 'when') return { err: 'command is not valid in current event context (' + w[0] + ')', kind: 'toplevel', line: c.line, cmd: w[0] };
            const ev = w[1]; if (!ev) return { err: 'missing event name', kind: 'syntax', line: c.line };
            if (!EVENTS.includes(ev)) return { err: 'undefined event', kind: 'event', event: ev, line: c.line };
            let prio = rulePrio === null ? 500 : rulePrio, bi = 2;
            if (w[2] === 'priority') { if (!/^\d+$/.test(w[3] || '') || +w[3] > 1000) return { err: 'invalid priority', kind: 'syntax', line: c.line }; prio = +w[3]; bi = 4; }
            if (w[bi] === 'timing' && ['on', 'off'].includes(w[bi + 1])) bi += 2;
            if (!c.words[bi] || !c.words[bi].braced) return { err: 'missing body for event ' + ev, kind: 'syntax', line: c.line };
            if (c.words.length > bi + 1) return { err: 'extra arguments after event body', kind: 'syntax', line: c.line };
            const body = w[bi]; let parsed;
            try { parsed = parse(body, c.words[bi].line); } catch (e) { return { err: e.message, kind: 'syntax', line: c.line }; }
            // statik denetim: bilinmeyen / devre dışı komutlar (yalnız düz komut adları)
            SCAN.ev = ev; SCAN.refs = refs;
            const bad = scanCmds(parsed);
            if (bad) return Object.assign({ kind: 'proc' }, bad);
            events.push({ name: ev, priority: prio, body, line: c.words[bi].line });
        }
        return { events, refs };
    }
    // HTTP isteğine ait komutlar yalnız istek tarafı olaylarında (clouddocs: HTTP::host geçerli olaylar CACHE_REQUEST, HTTP_REQUEST, HTTP_REQUEST_DATA, HTTP_REQUEST_SEND)
    const REQ_ONLY = ['HTTP::host', 'HTTP::uri', 'HTTP::path', 'HTTP::query', 'HTTP::method'];
    const NO_HTTP_EV = ['RULE_INIT', 'CLIENT_ACCEPTED', 'CLIENT_CLOSED', 'CLIENT_DATA', 'FLOW_INIT'];
    const SCAN = { ev: null, refs: [] };
    let KNOWN = null;   // motorun tanımladığı F5 komutları eklenir
    // ifade içindeki [komut] parçalarını tara
    function scanExpr(text, line) {
        for (let i = 0; i < text.length; i++) {
            if (text[i] !== '[') continue;
            let d = 0, j = i; for (; j < text.length; j++) { if (text[j] === '\\') { j++; continue; } if (text[j] === '[') d++; else if (text[j] === ']') { d--; if (!d) break; } }
            if (j >= text.length) return null;
            try { const b = scanCmds(parse(text.slice(i + 1, j), line)); if (b) return b; } catch (e) { return null; }
            i = j;
        }
        return null;
    }
    function scanCmds(cmds) {
        for (const c of cmds) {
            const w0 = c.words[0]; if (!w0) continue;
            const lit = w0.braced ? w0.parts[0].v : (w0.parts.length === 1 && w0.parts[0].t === 'lit' ? w0.parts[0].v : null);
            if (lit !== null) {
                if (DISABLED.includes(lit)) return { err: 'undefined procedure: ' + lit, cmd: lit, line: c.line, text: c.text.split('\n')[0] };
                if ((REQ_ONLY.includes(lit) && /^HTTP_RESPONSE/.test(SCAN.ev)) || (/^HTTP::/.test(lit) && NO_HTTP_EV.includes(SCAN.ev)) || (lit === 'HTTP::status' && /^HTTP_REQUEST/.test(SCAN.ev))) return { kind: 'ctx', err: 'command is not valid in current event context', event: SCAN.ev, cmd: lit, line: c.line };
                const plain = k => c.words[k] && (c.words[k].braced || (c.words[k].parts.length === 1 && c.words[k].parts[0].t === 'lit')) ? (c.words[k].braced ? c.words[k].parts[0].v : c.words[k].parts[0].v) : null;
                if ((lit === 'pool' || lit === 'active_members') && plain(1) && plain(1) !== '-list') SCAN.refs.push({ type: 'pool', name: plain(1), line: c.line, text: c.text.split('\n')[0] });
                if (lit === 'class' && ['match', 'search', 'lookup'].includes(plain(1)) && plain(c.words.length - 1)) SCAN.refs.push({ type: 'dg', name: plain(c.words.length - 1), line: c.line, text: c.text.split('\n')[0] });
                const ns = lit.match(/^([A-Z][A-Za-z0-9]*)::/);
                if (!CORE[lit] && !F5[lit] && !(KNOWN && KNOWN.has(lit)) && !(ns && F5_NS.includes(ns[1])) && !['when', 'priority'].includes(lit)) return { err: 'undefined procedure: ' + lit, cmd: lit, line: c.line, text: c.text.split('\n')[0] };
            }
            // iç içe gövdeler: if/switch/foreach/while/catch kelimeleri süslü parantezli ise onları da tara
            for (const w of c.words) {
                for (const p of w.parts) if (p.t === 'cmd') { const b = scanCmds(p.script); if (b) return b; }
                if (w.braced && ['if', 'elseif', 'while'].includes(lit)) { const idx = c.words.indexOf(w); const prev = c.words[idx - 1]; const pv = prev && (prev.braced ? prev.parts[0].v : prev.parts.map(p => p.v || '').join('')); if (idx === 1 || pv === 'elseif') { const b = scanExpr(w.parts[0].v, w.line); if (b) return b; continue; } }
                if (w.braced && lit === 'expr') { const b = scanExpr(w.parts[0].v, w.line); if (b) return b; continue; }
                if (w.braced && /[\n;]|^\s*[A-Za-z_:]+(\s|$)/.test(w.parts[0].v) && ['if', 'elseif', 'else', 'switch', 'foreach', 'while', 'for', 'catch', 'then'].includes(lit) ) {
                    let inner; try { inner = parse(w.parts[0].v, w.line); } catch (e) { continue; }
                    // switch gövdesi: desen/gövde çiftleri → yalnız gövdeleri tara
                    if (lit === 'switch') { const items = listSplit(w.parts[0].v); if (items.length % 2 === 0 && c.words.indexOf(w) === c.words.length - 1) { for (let k = 1; k < items.length; k += 2) { if (items[k] === '-') continue; try { const b = scanCmds(parse(items[k], w.line)); if (b) return b; } catch (e) { /* desen */ } } continue; } }
                    if (lit === 'if' || lit === 'elseif' || lit === 'while' || lit === 'for') { const idx = c.words.indexOf(w); const prev = c.words[idx - 1]; const pv = prev && (prev.braced ? prev.parts[0].v : prev.parts.map(p => p.v || '').join('')); if (idx === 1 || pv === 'elseif') { const b = scanExpr(w.parts[0].v, w.line); if (b) return b; continue; } }
                    const b = scanCmds(inner); if (b) return b;
                }
            }
        }
        return null;
    }

    // Bir olayı çalıştır: dönen { ok, err, flow }
    function runEvent(ctx, ev) {
        const I = Interp(ctx); ctx.event = ev.name; ctx.steps = 0;
        try { I.evalText(ev.body); return { ok: true }; }
        catch (e) {
            if (e instanceof Flow) { if (e.flow === 'return') return { ok: true, ret: true }; return { ok: false, err: 'invoked "' + e.flow + '" outside of a loop', line: ctx.line }; }
            if (e.tcl) return { ok: false, err: e.message, code: e.code, line: e.cmdLine || ctx.line, cmd: e.cmdText, abort: e.code === 'abort' };
            throw e;
        }
    }
    function setKnown(list) { KNOWN = new Set(list); }

    return { parse, compile, runEvent, listSplit, listJoin, glob, exprEval, Interp, TclError, EVENTS, HTTP_EVENTS, DISABLED, setKnown, CORE, F5 };
})();
(typeof window !== 'undefined' ? window : globalThis).CgIRule = CgIRule;
if (typeof module !== 'undefined') module.exports = CgIRule;
