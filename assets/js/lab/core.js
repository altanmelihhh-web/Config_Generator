'use strict';

// ─── CLI Lab çekirdeği: tokenize · komut DSL'i · ortak eşleştirici ───────────
// DSL (FRR tarzı fikir; kod alınmadı):
//   kelime            anahtar kelime (kısaltılabilir)
//   <a|b|c>           anahtar kelime seçenekleri
//   (1-4094)          tam sayı aralığı
//   A.B.C.D MASK WILD IPv4 adres / alt ağ maskesi / wildcard
//   WORD LINE         tek kelime / satırın geri kalanı
//   IFNAME VLIST HOP  arayüz adı / VLAN listesi (10,20-30) / next-hop (IP veya arayüz)
//   [x]               opsiyonel öğe
//   !x                yalnız "no" biçiminde opsiyonel (no hostname, no ip address …)
//   x$ad              değere ad verir → args.ad
// Aynı derlenmiş dizilerden: yürütme, ?, Tab, kısaltma, belirsizlik, caret sütunu.
const CgLabCore = (() => {
    const tokenize = s => { const out = [], re = /\S+/g; let m; while ((m = re.exec(s))) out.push({ t: m[0], o: m.index }); return out; };

    // ── IPv4 yardımcıları
    const isIp = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every(o => +o <= 255);
    const ip2n = s => s.split('.').reduce((a, o) => a * 256 + +o, 0);
    const n2ip = n => [24, 16, 8, 0].map(b => Math.floor(n / 2 ** b) % 256).join('.');
    const maskLen = m => { if (!isIp(m)) return -1; const n = ip2n(m); for (let l = 0; l <= 32; l++) if (n === 2 ** 32 - 2 ** (32 - l)) return l; return -1; };
    const lenMask = l => n2ip(2 ** 32 - 2 ** (32 - l));
    const wildLen = w => isIp(w) ? maskLen(n2ip(2 ** 32 - 1 - ip2n(w))) : -1;
    const netOf = (ip, len) => len ? Math.floor(ip2n(ip) / 2 ** (32 - len)) * 2 ** (32 - len) : 0;
    const sameNet = (a, b, len) => netOf(a, len) === netOf(b, len);

    // ── VLAN listesi
    function vlanList(s) {
        const out = new Set();
        for (const part of String(s).split(',')) {
            const m = part.match(/^(\d+)(?:-(\d+))?$/);
            if (!m) return null;
            const a = +m[1], b = m[2] ? +m[2] : a;
            if (a < 1 || b > 4094 || a > b) return null;
            for (let i = a; i <= b; i++) out.add(i);
        }
        return [...out].sort((x, y) => x - y);
    }
    function vlanCompress(arr) {
        const r = []; let i = 0;
        while (i < arr.length) {
            let j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++;
            r.push(j > i + 1 ? arr[i] + '-' + arr[j] : j === i + 1 ? arr[i] + ',' + arr[j] : String(arr[i]));
            i = j + 1;
        }
        return r.join(',');
    }

    // ── DSL derleyici
    const VARS = { 'A.B.C.D': 1, MASK: 1, WILD: 1, WORD: 1, LINE: 1, IFNAME: 1, VLIST: 1, HOP: 1 };
    function elem(src) {
        let s = src, neg = false, opt = false, name = null;
        if (s[0] === '!') { neg = true; s = s.slice(1); }
        if (s[0] === '[' && s.endsWith(']')) { opt = true; s = s.slice(1, -1); }
        const d = s.lastIndexOf('$');
        if (d > 0) { name = s.slice(d + 1); s = s.slice(0, d); }
        let e;
        const r = s.match(/^\((\d+)-(\d+)\)$/);
        if (r) e = { k: 'int', a: +r[1], b: +r[2] };
        else if (VARS[s]) e = { k: s };
        else if (/^<.+>$/.test(s)) e = { k: 'kw', w: s.slice(1, -1).split('|') };
        else e = { k: 'kw', w: [s] };
        return Object.assign(e, { neg, opt, name });
    }
    // Opsiyonel öğeleri açarak doğrusal diziler üretir
    function compile(pattern) {
        const els = pattern.trim().split(/\s+/).map(elem);
        let seqs = [[]];
        for (const e of els) {
            const next = [];
            for (const s of seqs) { next.push(s.concat([e])); if (e.opt) next.push(s); }
            seqs = next;
        }
        return seqs;
    }
    // cmds: [{p, run, h, ...}] → her birine .seqs ekler
    const build = cmds => cmds.map(c => Object.assign(c, { seqs: compile(c.p) }));

    // ── Değişken doğrulama (ctx: vendor bağlamı, ör. ifNorm/ifValid)
    function varOk(e, t, ctx) {
        switch (e.k) {
            case 'int': return /^\d+$/.test(t) && +t >= e.a && +t <= e.b;
            case 'A.B.C.D': return isIp(t);
            case 'MASK': return maskLen(t) >= 0;
            case 'WILD': return wildLen(t) >= 0;
            case 'WORD': return true;
            case 'VLIST': return !!vlanList(t);
            case 'IFNAME': return !!(ctx.ifNorm && ctx.ifNorm(t) && ctx.ifValid(ctx.ifNorm(t)));
            case 'HOP': return isIp(t) || !!(ctx.ifNorm && ctx.ifNorm(t) && ctx.ifValid(ctx.ifNorm(t)));
            default: return false;
        }
    }
    function varVal(e, t, ctx) {
        if (e.k === 'int') return +t;
        if (e.k === 'IFNAME' || (e.k === 'HOP' && !isIp(t))) return ctx.ifNorm(t);
        return t;
    }
    const isIfVar = e => e && (e.k === 'IFNAME' || e.k === 'HOP');

    // Ortak filtre: token token ilerler. Anahtar kelime > değişken önceliği.
    // Dönüş: {alive, toks, err?, at?}
    function walk(cmds, toks, raw, ctx) {
        let alive = [];
        for (const c of cmds) for (const s of c.seqs) alive.push({ c, s, args: {}, canon: [], line: false });
        toks = toks.slice();
        for (let i = 0; i < toks.length; i++) {
            // "g 0/1" ya da "vlan 10" gibi iki parçalı arayüz adını birleştir
            if (ctx.ifNorm && alive.some(a => isIfVar(a.s[i])) && !ctx.ifNorm(toks[i].t) && i + 1 < toks.length
                && /^\d/.test(toks[i + 1].t) && ctx.ifNorm(toks[i].t + toks[i + 1].t)) {
                toks.splice(i, 2, { t: toks[i].t + toks[i + 1].t, o: toks[i].o });
            }
            const t = toks[i].t, tl = t.toLowerCase();
            const hits = new Set(); let exact = null;
            for (const a of alive) {
                const e = a.s[i];
                if (!e || e.k !== 'kw') continue;
                for (const w of e.w) { if (w === tl) exact = w; if (w.startsWith(tl)) hits.add(w); }
            }
            const kwAdv = w => alive.filter(a => a.s[i] && a.s[i].k === 'kw' && a.s[i].w.includes(w)).map(a => {
                const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([w]), line: false };
                if (a.s[i].name) n.args[a.s[i].name] = w;
                return n;
            });
            let next = [];
            if (exact) next = kwAdv(exact);
            else if (hits.size === 1) next = kwAdv([...hits][0]);
            else if (hits.size > 1) return { alive: [], toks, err: 'amb', at: i };
            if (!next.length) {
                for (const a of alive) {
                    const e = a.s[i];
                    if (!e || e.k === 'kw') continue;
                    if (e.k === 'LINE') {
                        const v = raw.slice(toks[i].o);
                        const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([v]), line: true };
                        if (e.name) n.args[e.name] = v;
                        next.push(n);
                    } else if (varOk(e, t, ctx)) {
                        const v = varVal(e, t, ctx);
                        const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([String(v)]), line: false };
                        if (e.name) n.args[e.name] = v;
                        next.push(n);
                    }
                }
            }
            if (!next.length) return { alive: [], toks, err: 'invalid', at: i };
            alive = next;
            if (alive.some(a => a.line)) { alive = alive.filter(a => a.line); return { alive, toks, lineAt: i }; }
        }
        return { alive, toks };
    }

    // Tam eşleşme. noForm: sondaki "!" öğeleri atlanabilir.
    // Dönüş: {ok, cmd, args, canon} | {ok:false, err:'amb'|'invalid'|'incomplete', col}
    function match(cmds, raw, ctx, noForm) {
        const toks0 = tokenize(raw);
        if (!toks0.length) return { ok: false, err: 'empty' };
        const w = walk(cmds, toks0, raw, ctx);
        if (w.err) return { ok: false, err: w.err, col: w.toks[w.at] ? w.toks[w.at].o : raw.length, at: w.at };
        const n = w.toks.length;
        const done = w.alive.filter(a => a.line || a.s.length === n || (noForm && a.s.slice(n).every(e => e.neg || e.opt)));
        if (!done.length) return { ok: false, err: 'incomplete', col: raw.length };
        const a = done[0];
        return { ok: true, cmd: a.c, args: a.args, canon: a.canon.join(' ') };
    }

    // ? yardımı: satır boşlukla bitiyorsa sonraki öğeler, yoksa kelime tamamlamaları
    function help(cmds, raw, ctx, kwHelp) {
        const trailing = raw === '' || /\s$/.test(raw);
        const toks = tokenize(raw);
        const part = trailing ? null : toks.pop();
        const w = walk(cmds, toks, raw, ctx);
        if (w.err === 'amb') return { amb: true };
        if (w.err) return { none: true };
        const n = w.toks.length;
        if (w.lineAt !== undefined) return { rows: [['LINE', 'Metin'], ['<cr>', '']] };
        if (part) {
            const pl = part.t.toLowerCase(), words = new Set();
            for (const a of w.alive) { const e = a.s[n]; if (e && e.k === 'kw') e.w.forEach(x => { if (x.startsWith(pl)) words.add(x); }); }
            if (!words.size) {
                // değişken öğe bu kelimeyi kabul ediyorsa (ör. "vlan 1?") yalnız <cr> değil etiket göster
                const vs = w.alive.filter(a => a.s[n] && a.s[n].k !== 'kw');
                return vs.length ? { rows: vs.map(a => [label(a.s[n]), kwHelp(null, a)]), one: true } : { none: true };
            }
            return { words: [...words].sort() };
        }
        const rows = new Map(); let cr = false;
        for (const a of w.alive) {
            const e = a.s[n];
            if (!e) { cr = true; continue; }
            if (e.k === 'kw') e.w.forEach(x => { if (!rows.has(x)) rows.set(x, kwHelp(x, a)); });
            else { const l = label(e); if (!rows.has(l)) rows.set(l, kwHelp(null, a, e)); }
        }
        const list = [...rows.entries()].sort((x, y) => x[0].localeCompare(y[0]));
        if (cr) list.push(['<cr>', '']);
        return { rows: list };
    }
    function label(e) {
        if (e.k === 'int') return '<' + e.a + '-' + e.b + '>';
        return { 'A.B.C.D': 'A.B.C.D', MASK: 'A.B.C.D', WILD: 'A.B.C.D', WORD: 'WORD', LINE: 'LINE', IFNAME: 'IFNAME', VLIST: 'WORD', HOP: 'A.B.C.D' }[e.k] || e.k;
    }

    // Tab: son kelimeyi tek aday varsa tamamla
    function complete(cmds, raw, ctx, ifTypes) {
        if (raw === '' || /\s$/.test(raw)) return null;
        const toks = tokenize(raw), part = toks.pop();
        const w = walk(cmds, toks, raw, ctx);
        if (w.err) return null;
        const n = w.toks.length, pl = part.t.toLowerCase(), words = new Set();
        let ifSlot = false;
        for (const a of w.alive) { const e = a.s[n]; if (!e) continue; if (e.k === 'kw') e.w.forEach(x => { if (x.startsWith(pl)) words.add(x); }); if (isIfVar(e)) ifSlot = true; }
        if (words.size === 1) return raw.slice(0, part.o) + [...words][0] + ' ';
        if (!words.size && ifSlot && ifTypes && /^[a-z-]+$/i.test(part.t)) {
            const hits = ifTypes.filter(x => x.toLowerCase().startsWith(pl));
            if (hits.length === 1) return raw.slice(0, part.o) + hits[0];
        }
        return null;
    }

    const pad = (s, n) => { s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); };
    const padL = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
    // Deterministik "hash" (gösterim için; gerçek şifreleme değildir)
    function fakeHash(s, len) {
        const ab = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
        let h1 = 0x811c9dc5, h2 = 0x1234567, out = '';
        for (let i = 0; i < s.length; i++) { h1 = Math.imul(h1 ^ s.charCodeAt(i), 16777619) >>> 0; h2 = Math.imul(h2 + s.charCodeAt(i), 2654435761) >>> 0; }
        for (let i = 0; i < len; i++) { h1 = Math.imul(h1 ^ (h2 >>> (i % 24)), 16777619) >>> 0; h2 = (h2 + h1 + i) >>> 0; out += ab[((h1 ^ h2) >>> 0) % 64]; }
        return out;
    }

    return { tokenize, compile, build, match, help, complete, label,
        isIp, ip2n, n2ip, maskLen, lenMask, wildLen, netOf, sameNet, vlanList, vlanCompress, pad, padL, fakeHash };
})();
if (typeof module !== 'undefined') module.exports = CgLabCore;
