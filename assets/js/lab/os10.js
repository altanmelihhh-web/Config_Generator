'use strict';

// ─── CLI Lab: Dell OS10 benzeri motor (eğitim simülatörü; SmartFabric OS10 10.5 görünümü) ───
// Komutlar cihaz MODELİNİ değiştirir; show çıktıları modelden üretilir. Vendor anahtarı: 'dell'.
// Varsayılan (transaction'sız) modda değişiklik anında running'e yazılır; "start transaction"
// sonrası değişiklikler candidate'te bekler, "commit" ile running'e geçer (OS10 CLI Basics).
//
// Doğrulama kaynakları (biçimler buradan; metin kopyalanmadı):
//  - Modlar, istemler (conf-if-eth…/conf-if-vl-…/conf-if-ma-…/conf-range-…), transaction/commit/discard,
//    show diff, write memory, copy running-configuration startup-configuration, reload soruları,
//    show running-configuration / show version biçimi, username parola kuralı (en az 9 karakter),
//    show filtreleri (grep/except/find/no-more): Dell SmartFabric OS10 User Guide "CLI Basics"
//    (derlenmiş kopya: https://github.com/AzureLocal/azurelocal-toolkit config/network-devices/switches/dell/guides/os10-ch05-cli-basics.md)
//    https://www.dell.com/support/manuals/en-us/dell-emc-smartfabric-os10/smartfabric-os-user-guide-10-5-0/cli-basics
//  - "% Error: Unrecognized command.": https://www.dell.com/community/en/conversations/networking-general/os-10-documentation-cli-gaps/66144b2d0430a86d2842a209
//    ve https://github.com/ansible/ansible/issues/55184
//  - "% Error: Network unreachable" (ip route), show ip interface brief, show configuration, Linux biçimli ping:
//    https://github.com/grantcurell/projects (Switch Directly to Client Test, Run VPN on OS10)
//  - show interface status: os10-ch06-advanced-cli.md (yukarıdaki derleme)
//  - show vlan: https://github.com/grantcurell/projects (Configure FN410 as a Switch) + DISA Dell OS10 L2S STIG
//  - show ip route: https://github.com/i8088386/Otus-DC (Labs/Lab_06, Leaf-4-Dell)
// Doğrulanamayan hata biçimleri (eksik komut, belirsiz kısaltma, geçersiz değer, L2 portta IP …)
// "% [Simülatör] …" olarak verilir.
const CgLabOs10 = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, lenMask, netOf, sameNet, ip2n, n2ip, fakeHash } = C;
    const clone = o => JSON.parse(JSON.stringify(o));
    const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

    // ── Arayüz adları: kanonik 'ethernet1/1/1', 'vlan10', 'mgmt1/1/1', 'loopback0'
    const IFT = [['ethernet', 3], ['vlan', 1], ['mgmt', 3], ['loopback', 1]];
    function ifNorm(s) {
        const m = String(s).match(/^([a-z-]+)\s*(\d+(?:\/\d+){0,2})$/i);
        if (!m) return null;
        const p = m[1].toLowerCase();
        const hits = IFT.filter(([f]) => f.startsWith(p));
        if (hits.length !== 1 || m[2].split('/').length !== hits[0][1]) return null;
        return hits[0][0] + m[2];
    }
    const ifType = n => (n.match(/^[a-z-]+/) || [''])[0];
    const ifNums = n => (n.match(/[\d/]+$/) || [''])[0].split('/').map(Number);
    const isEth = n => /^ethernet/.test(n);
    const ORD = ['ethernet', 'mgmt', 'vlan', 'loopback'];
    function ifCmp(a, b) {
        const ta = ORD.indexOf(ifType(a)), tb = ORD.indexOf(ifType(b));
        if (ta !== tb) return ta - tb;
        const na = ifNums(a), nb = ifNums(b);
        for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
        return 0;
    }
    const LONG = { ethernet: 'Ethernet', vlan: 'Vlan', mgmt: 'Management', loopback: 'Loopback' };
    const longName = n => LONG[ifType(n)] + ' ' + (n.match(/[\d/]+$/) || [''])[0];
    const shortEth = n => 'Eth ' + (n.match(/[\d/]+$/) || [''])[0];
    const pfxOk = t => { const m = String(t).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/); return !!m && isIp(m[1]) && +m[2] <= 32; };
    const pfxSplit = t => { const [a, l] = t.split('/'); return [a, +l]; };
    // VLAN listesi: 10,20-30
    function vlist(s) {
        const out = new Set();
        for (const part of String(s).split(',')) {
            const m = part.match(/^(\d+)(?:-(\d+))?$/);
            if (!m) return null;
            const a = +m[1], b = m[2] ? +m[2] : a;
            if (a < 1 || b > 4093 || a > b) return null;
            for (let i = a; i <= b; i++) out.add(i);
        }
        return [...out].sort((x, y) => x - y);
    }
    const vcomp = arr => { const r = []; let i = 0; while (i < arr.length) { let j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; r.push(j > i ? arr[i] + '-' + arr[j] : String(arr[i])); i = j + 1; } return r.join(','); };

    // ═══ Komut DSL eşleştirici (core.js fikrinden uyarlandı: özel değişken tipleri) ═══
    const VT = {
        'A.B.C.D': { ok: t => isIp(t), label: 'A.B.C.D' },
        PFX: { ok: pfxOk, label: 'A.B.C.D/prefix' },
        WORD: { ok: () => true, label: 'WORD' },
        VLIST: { ok: t => !!vlist(t), label: 'VLAN-LIST' },
        IFNAME: { ok: (t, ctx) => !!(ifNorm(t) && ctx.ifValid(ifNorm(t))), val: t => ifNorm(t), label: 'ethernet 1/1/N | vlan N | mgmt 1/1/1', iface: true },
        LINE: { rest: true, label: 'LINE' },
    };
    function elem(src) {
        let s = src, neg = false, opt = false, name = null;
        if (s[0] === '!') { neg = true; s = s.slice(1); }
        if (s[0] === '[' && s.endsWith(']')) { opt = true; s = s.slice(1, -1); }
        const d = s.lastIndexOf('$');
        if (d > 0) { name = s.slice(d + 1); s = s.slice(0, d); }
        let e;
        const r = s.match(/^\((\d+)-(\d+)\)$/);
        if (r) e = { k: 'int', a: +r[1], b: +r[2] };
        else if (VT[s]) e = { k: s };
        else if (/^<.+>$/.test(s)) e = { k: 'kw', w: s.slice(1, -1).split('|') };
        else e = { k: 'kw', w: [s] };
        return Object.assign(e, { neg, opt, name });
    }
    function compile(pattern) {
        let seqs = [[]];
        for (const e of pattern.trim().split(/\s+/).map(elem)) {
            const next = [];
            for (const s of seqs) { next.push(s.concat([e])); if (e.opt) next.push(s); }
            seqs = next;
        }
        return seqs;
    }
    const build = cmds => cmds.map(c => Object.assign(c, { seqs: compile(c.p) }));
    const varOk = (e, t, ctx) => e.k === 'int' ? /^\d+$/.test(t) && +t >= e.a && +t <= e.b : (VT[e.k] && VT[e.k].ok ? VT[e.k].ok(t, ctx) : false);
    const varVal = (e, t) => e.k === 'int' ? +t : (VT[e.k] && VT[e.k].val ? VT[e.k].val(t) : t);
    const isIfVar = e => e && VT[e.k] && VT[e.k].iface;
    const isRest = e => e && VT[e.k] && VT[e.k].rest;
    function walk(cmds, toks, raw, ctx) {
        let alive = [];
        for (const c of cmds) for (const s of c.seqs) alive.push({ c, s, args: {}, canon: [], line: false });
        toks = toks.slice();
        for (let i = 0; i < toks.length; i++) {
            if (alive.some(a => isIfVar(a.s[i])) && !ifNorm(toks[i].t) && i + 1 < toks.length && /^\d/.test(toks[i + 1].t) && ifNorm(toks[i].t + toks[i + 1].t))
                toks.splice(i, 2, { t: toks[i].t + toks[i + 1].t, o: toks[i].o });
            const t = toks[i].t, tl = t.toLowerCase();
            const hits = new Set(); let exact = null;
            for (const a of alive) { const e = a.s[i]; if (!e || e.k !== 'kw') continue; for (const w of e.w) { if (w === tl) exact = w; if (w.startsWith(tl)) hits.add(w); } }
            const kwAdv = w => alive.filter(a => a.s[i] && a.s[i].k === 'kw' && a.s[i].w.includes(w)).map(a => {
                const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([w]), line: false };
                if (a.s[i].name) n.args[a.s[i].name] = w;
                return n;
            });
            let next = [];
            if (exact) next = kwAdv(exact);
            else if (hits.size === 1) next = kwAdv([...hits][0]);
            else if (hits.size > 1) return { alive: [], toks, err: 'amb', at: i, cands: [...hits].sort() };
            if (!next.length) {
                for (const a of alive) {
                    const e = a.s[i];
                    if (!e || e.k === 'kw') continue;
                    if (isRest(e)) {
                        const v = raw.slice(toks[i].o).trim();
                        const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([v]), line: true };
                        if (e.name) n.args[e.name] = v;
                        next.push(n);
                    } else if (varOk(e, t, ctx)) {
                        const v = varVal(e, t);
                        const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([String(v)]), line: false };
                        if (e.name) n.args[e.name] = v;
                        next.push(n);
                    }
                }
            }
            if (!next.length) {
                let err = 'invalid';
                if (i > 0 && alive.some(a => a.s[i] && a.s[i].k !== 'kw')) err = 'value';
                return { alive: [], toks, err, at: i, exp: alive.filter(a => a.s[i] && a.s[i].k !== 'kw').map(a => a.s[i]) };
            }
            alive = next;
            if (alive.some(a => a.line)) { alive = alive.filter(a => a.line); return { alive, toks, lineAt: i }; }
        }
        return { alive, toks };
    }
    function match(cmds, raw, ctx, noForm) {
        const toks0 = C.tokenize(raw);
        if (!toks0.length) return { ok: false, err: 'empty' };
        const w = walk(cmds, toks0, raw, ctx);
        if (w.err) return { ok: false, err: w.err, tok: w.toks[w.at] ? w.toks[w.at].t : '', cands: w.cands, exp: w.exp };
        const n = w.toks.length;
        const done = w.alive.filter(a => a.line || a.s.length === n || (noForm && a.s.slice(n).every(e => e.neg || e.opt)));
        if (!done.length) return { ok: false, err: 'incomplete' };
        const a = done[0];
        return { ok: true, cmd: a.c, args: a.args, canon: a.canon.join(' ') };
    }
    const label = e => e.k === 'int' ? '<' + e.a + '-' + e.b + '>' : (VT[e.k] ? VT[e.k].label : e.k);
    function help(cmds, raw, ctx, kwHelp) {
        const trailing = raw === '' || /\s$/.test(raw);
        const toks = C.tokenize(raw);
        const part = trailing ? null : toks.pop();
        const w = walk(cmds, toks, raw, ctx);
        if (w.err) return { err: w.err };
        const n = w.toks.length;
        if (w.lineAt !== undefined) return { rows: [['LINE', kwHelp(null, w.alive[0], w.alive[0].s[w.lineAt])], ['<cr>', '']] };
        if (part) {
            const pl = part.t.toLowerCase(), words = new Set();
            for (const a of w.alive) { const e = a.s[n]; if (e && e.k === 'kw') e.w.forEach(x => { if (x.startsWith(pl)) words.add(x); }); }
            if (!words.size) {
                const vs = w.alive.filter(a => a.s[n] && a.s[n].k !== 'kw');
                return vs.length ? { rows: vs.map(a => [label(a.s[n]), kwHelp(null, a, a.s[n])]) } : { err: 'invalid' };
            }
            return { rows: [...words].sort().map(x => [x, kwHelp(x, w.alive.find(a => a.s[n] && a.s[n].k === 'kw' && a.s[n].w.includes(x)))]) };
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
    function complete(cmds, raw, ctx) {
        if (raw === '' || /\s$/.test(raw)) return null;
        const toks = C.tokenize(raw), part = toks.pop();
        const w = walk(cmds, toks, raw, ctx);
        if (w.err) return null;
        const n = w.toks.length, pl = part.t.toLowerCase(), words = new Set();
        let ifSlot = false;
        for (const a of w.alive) { const e = a.s[n]; if (!e) continue; if (e.k === 'kw') e.w.forEach(x => { if (x.startsWith(pl)) words.add(x); }); if (isIfVar(e)) ifSlot = true; }
        if (words.size === 1) return raw.slice(0, part.o) + [...words][0] + ' ';
        if (!words.size && ifSlot && /^[a-z-]+$/i.test(part.t)) {
            const hits = ORD.filter(x => x.startsWith(pl));
            if (hits.length === 1) return raw.slice(0, part.o) + hits[0] + ' ';
        }
        return null;
    }

    // ── Türkçe yardım açıklamaları
    const KW = {
        configure: 'Yapılandırma moduna gir', terminal: 'Terminalden yapılandır', show: 'Sistem bilgisi göster', write: 'Yapılandırmayı kaydet', memory: 'startup-configuration\'a yaz',
        copy: 'Dosya kopyala', 'running-configuration': 'Çalışan yapılandırma', 'startup-configuration': 'Açılış yapılandırması', 'candidate-configuration': 'Aday (commit bekleyen) yapılandırma',
        reload: 'Cihazı yeniden başlat', ping: 'Erişilebilirlik testi', start: 'Transaction tabanlı yapılandırmayı başlat', transaction: 'Değişiklikler commit\'e kadar aday yapılandırmada bekler',
        commit: 'Aday yapılandırmayı running\'e uygula', discard: 'Aday yapılandırmadaki değişiklikleri at', diff: 'İki yapılandırmanın farkı', exit: 'Bir üst moda çık', end: 'Doğrudan EXEC moduna dön',
        do: 'Yapılandırma modundan EXEC komutu çalıştır', no: 'Komutu geri al / varsayılana döndür', hostname: 'Cihaz adı', username: 'Yerel kullanıcı', password: 'Parola (en az 9 karakter)',
        role: 'Kullanıcı rolü', sysadmin: 'Tam yetki', netadmin: 'Ağ yapılandırma yetkisi', secadmin: 'Güvenlik yapılandırma yetkisi', netoperator: 'Yalnız izleme',
        ip: 'IP ayarları', ssh: 'SSH ayarları', server: 'Sunucu', enable: 'Etkinleştir', interface: 'Arayüz seç / arayüz bilgisi', range: 'Arayüz aralığı',
        ethernet: 'Ethernet portu', vlan: 'VLAN arayüzü (SVI) / VLAN bilgisi', mgmt: 'Yönetim portu', loopback: 'Loopback arayüzü', route: 'Statik rota / yönlendirme tablosu', management: 'Yönetim ayarları',
        switchport: 'L2 port ayarları', mode: 'Port modu', access: 'Tek VLAN\'lı (etiketsiz) port', trunk: 'Çok VLAN\'lı (etiketli) port', allowed: 'Trunk\'ta izinli VLAN\'lar',
        address: 'IP adresi', dhcp: 'Adresi DHCP ile al', description: 'Açıklama', shutdown: 'Arayüzü kapat', status: 'Port durum özeti', brief: 'Kısa özet', version: 'Yazılım sürümü',
        configuration: 'Bu arayüzün yapılandırması', grep: 'Eşleşen satırlar', except: 'Eşleşmeyen satırlar', find: 'Eşleşmeden itibaren', 'no-more': 'Sayfalamadan göster',
        'command-history': 'Komut geçmişi', length: 'Sayfa uzunluğu', 'priv-lvl': 'Yetki seviyesi',
    };
    const VARH = { 'A.B.C.D': 'IP adresi (next-hop)', PFX: 'IP adresi / önek uzunluğu (ör. 10.64.10.1/24)', WORD: 'Metin', VLIST: 'VLAN listesi (ör. 10,20-30)', IFNAME: 'Arayüz (ör. ethernet 1/1/1, vlan 10, mgmt 1/1/1)', LINE: 'Metin' };

    // ── Varsayılan cihaz modeli
    const newIf = n => ({ desc: '', shutdown: false, l3: !isEth(n), mode: 'access', access: 1, allowed: [], ip: null, len: null, dhcp: n.startsWith('mgmt') });
    function baseModel(lab) {
        const m = { hostname: lab.hostname || 'OS10', ifs: {}, vlans: { 1: '' }, routes: [], mroutes: [], users: { admin: { pw: 'admin', role: 'sysadmin' } }, ssh: true, links: {} };
        for (const n of lab.ifaces || range(1, 12).map(i => 'ethernet1/1/' + i)) m.ifs[n] = newIf(n);
        m.ifs['mgmt1/1/1'] = newIf('mgmt1/1/1');
        m.ifs.vlan1 = newIf('vlan1');
        for (const n of lab.up || []) m.links[n] = true;
        m.links['mgmt1/1/1'] = lab.mgmtUp !== false;
        return m;
    }
    const OSVER = '10.5.6.0';

    // ═══ Oturum ═══════════════════════════════════════════════════════════════
    function session(lab, opts) {
        const variant = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        const S = { lab, run: baseModel(lab), cand: null, tx: false, mode: 'exec', ctx: [], startup: null, pending: null, ev: [], hist: [], answers: {}, lastChange: 0, clock: 0 };
        const M = () => (S.tx ? S.cand : S.run);   // yapılandırma komutlarının yazdığı model
        const R = () => S.run;                      // işletim durumu (show) daima running'den
        const log = o => { S.ev.push(o); };
        const ctx = {
            ifValid: n => {
                if (M().ifs[n]) return true;
                const t = ifType(n), num = ifNums(n)[0];
                if (t === 'vlan') return num >= 1 && num <= 4093;
                if (t === 'loopback') return num <= 16383;
                return false;
            }
        };
        const cur = () => S.ctx.map(n => M().ifs[n]);
        const simErr = t => ({ sim: t });
        const touch = () => { S.lastChange = ++S.clock; };

        // ═══ Komut tanımları ═════════════════════════════════════════════════
        const X = build;
        const SHOW = [
            { p: 'show version', run: showVersion },
            { p: 'show running-configuration', run: () => runText(R(), true) },
            { p: 'show running-configuration interface IFNAME$if', run: a => R().ifs[a.if] ? ifBlock(R(), a.if, true).join('\n') : '% [Simülatör] Böyle bir arayüz yok: ' + a.if },
            { p: 'show startup-configuration', run: () => S.startup ? runText(S.startup, false) : '% [Simülatör] startup-configuration boş: henüz write memory yapılmadı.' },
            { p: 'show candidate-configuration', run: () => runText(S.tx ? S.cand : R(), false) },
            { p: 'show diff candidate-configuration running-configuration', run: showDiff },
            { p: 'show vlan', run: showVlan },
            { p: 'show interface status', run: showIfStatus },
            { p: 'show ip interface brief', run: showIpBrief },
            { p: 'show ip route', run: showRoute },
            { p: 'show command-history', run: () => S.hist.slice(-10).map((x, i) => padL(i + 1, 5) + '    ' + x).join('\n') },
        ];
        const EXEC = X([
            { p: 'configure terminal', run: () => { S.mode = 'config'; S.ctx = []; } },
            { p: 'write memory', run: () => { save(); } },
            { p: 'copy running-configuration startup-configuration', run: () => { save(); } },
            { p: 'reload', run: cmdReload },
            { p: 'start transaction', run: () => { if (!S.tx) { S.cand = clone(S.run); S.tx = true; } } },
            { p: 'commit', run: cmdCommit },
            { p: 'discard', run: () => { if (S.tx) S.cand = clone(S.run); } },
            { p: 'ping A.B.C.D$ip', run: a => ping(a.ip) },
            { p: 'terminal length (0-512)', run: () => '' },
            { p: 'exit', run: () => { S.loggedOut = true; return ''; } },
        ].concat(SHOW));
        const COMMON = [
            { p: 'exit', run: () => { S.mode = S.mode === 'config' ? 'exec' : 'config'; S.ctx = []; }, neg: false },
            { p: 'end', run: () => { S.mode = 'exec'; S.ctx = []; }, neg: false },
            { p: 'do LINE$c', run: a => execDo(a.c), neg: false },
        ].concat(SHOW.map(c => Object.assign({}, c, { neg: false })));
        const CONFIG = X([
            { p: 'hostname !WORD$n', run: a => { if (!/^[a-z0-9][a-z0-9.-]{0,63}$/i.test(a.n)) return simErr('Geçersiz ad: harf/rakam/nokta/tire, en fazla 64 karakter.'); M().hostname = a.n; touch(); }, no: () => { M().hostname = 'OS10'; touch(); } },
            { p: 'username WORD$u password WORD$pw role <sysadmin|netadmin|secadmin|netoperator>$r', run: userAdd, neg: false },
            { p: 'username WORD$u password WORD$pw role <sysadmin|netadmin|secadmin|netoperator>$r priv-lvl (0-15)$l', run: userAdd, neg: false },
            { p: 'username WORD$u', noOnly: 1, no: a => { if (!M().users[a.u]) return simErr('Böyle bir kullanıcı yok: ' + a.u); if (a.u === 'admin' && !Object.entries(M().users).some(([k, x]) => k !== 'admin' && x.role === 'sysadmin')) return simErr('admin, en az bir başka sysadmin kullanıcı yoksa silinemez.'); delete M().users[a.u]; touch(); } },
            { p: 'ip ssh server enable', run: () => { M().ssh = true; touch(); }, no: () => { M().ssh = false; touch(); } },
            { p: 'interface IFNAME$if', run: a => { if (!M().ifs[a.if]) { M().ifs[a.if] = newIf(a.if); if (a.if.startsWith('vlan')) M().vlans[ifNums(a.if)[0]] = ''; touch(); } S.mode = 'if'; S.ctx = [a.if]; }, no: ifDel },
            { p: 'interface range LINE$r', run: ifRange, neg: false },
            { p: 'ip route PFX$p A.B.C.D$nh', run: routeAdd, no: routeDel },
            { p: 'ip route PFX$p', noOnly: 1, no: routeDel },
            { p: 'management route PFX$p A.B.C.D$nh', run: a => { const [n, l] = pfxSplit(a.p); if (netOf(n, l) !== ip2n(n)) return simErr('Önek ağ adresi olmalı (ör. ' + n2ip(netOf(n, l)) + '/' + l + ').'); M().mroutes = M().mroutes.filter(r => r.p !== a.p).concat([{ p: a.p, nh: a.nh }]); touch(); }, no: a => { M().mroutes = M().mroutes.filter(r => r.p !== a.p); touch(); } },
        ].concat(COMMON));
        const IFC = [
            { p: 'description !LINE$d', run: a => { cur().forEach(i => { i.desc = a.d.slice(0, 240); }); touch(); }, no: () => { cur().forEach(i => { i.desc = ''; }); touch(); } },
            { p: 'shutdown', run: () => { cur().forEach(i => { i.shutdown = true; }); touch(); }, no: () => { cur().forEach(i => { i.shutdown = false; }); touch(); } },
            { p: 'switchport mode <access|trunk>$m', eth: 1, run: a => l2(i => { i.mode = a.m; if (a.m === 'access') i.allowed = []; }), no: () => l2(i => { i.mode = 'access'; i.allowed = []; }) },
            { p: 'switchport access vlan !(1-4093)$v', eth: 1, run: a => { if (M().vlans[a.v] === undefined) return simErr('VLAN ' + a.v + ' yok. Önce "interface vlan ' + a.v + '" ile oluşturun.'); return l2(i => { i.access = a.v; }); }, no: () => l2(i => { i.access = 1; }) },
            { p: 'switchport trunk allowed vlan VLIST$l', eth: 1, run: a => trunkAllowed(a.l, false), no: a => trunkAllowed(a.l, true) },
            { p: 'switchport', eth: 1, run: () => { cur().forEach(i => { i.l3 = false; i.ip = null; i.len = null; }); touch(); }, no: () => { cur().forEach(i => { i.l3 = true; i.mode = 'access'; i.access = 1; i.allowed = []; }); touch(); } },
            { p: 'ip address !PFX$p', run: ipAddr, no: () => { cur().forEach(i => { i.ip = null; i.len = null; }); touch(); } },
            { p: 'ip address dhcp', mg: 1, run: () => { cur().forEach(i => { i.dhcp = true; i.ip = null; i.len = null; }); touch(); }, no: () => { cur().forEach(i => { i.dhcp = false; }); touch(); } },
            { p: 'show configuration', run: () => S.ctx.map(n => ['!'].concat(ifBlock(M(), n, false)).join('\n')).join('\n'), neg: false },
        ];
        const IFMODE = X(IFC.concat(COMMON));
        const MODES = { config: CONFIG, if: IFMODE, range: IFMODE };

        function avail(list, noForm) {
            return list.filter(c => {
                if (noForm ? (c.neg === false || !c.no) : c.noOnly) return false;
                if (S.mode === 'if' || S.mode === 'range') {
                    if (c.eth && !S.ctx.every(isEth)) return false;
                    if (c.mg && !S.ctx.every(n => n.startsWith('mgmt'))) return false;
                }
                return true;
            });
        }

        // ── yardımcılar
        function l2(fn) {
            if (cur().some(i => i.l3)) return simErr('Bu port L3 modda (no switchport). Önce "switchport" ile L2 moda alın.');
            cur().forEach(fn); touch();
        }
        function trunkAllowed(s, rm) {
            const list = vlist(s);
            if (cur().some(i => i.l3)) return simErr('Bu port L3 modda (no switchport). Önce "switchport" ile L2 moda alın.');
            if (cur().some(i => i.mode !== 'trunk')) return simErr('Port trunk modda değil. Önce "switchport mode trunk".');
            const miss = list.filter(v => M().vlans[v] === undefined);
            if (!rm && miss.length) return simErr('VLAN ' + miss.join(',') + ' yok. Önce "interface vlan ' + miss[0] + '" ile oluşturun.');
            cur().forEach(i => { i.allowed = rm ? i.allowed.filter(v => !list.includes(v)) : [...new Set(i.allowed.concat(list))].sort((x, y) => x - y); });
            touch();
        }
        function ipAddr(a) {
            const [ip, len] = pfxSplit(a.p), m = M();
            if (cur().some(i => !i.l3)) return simErr('L2 (switchport) portuna IP verilemez. Ya "no switchport" ile L3 yapın ya da IP\'yi VLAN arayüzüne (interface vlan) verin.');
            if (len < 8 || len > 32) return simErr('Önek uzunluğu 8-32 olmalı.');
            if (len < 31 && (netOf(ip, len) === ip2n(ip) || netOf(ip, len) + 2 ** (32 - len) - 1 === ip2n(ip))) return simErr(ip + '/' + len + ' bir ağ ya da yayın adresi; bir host adresi girin.');
            for (const [n, i] of Object.entries(m.ifs)) {
                if (S.ctx.includes(n) || !i.ip) continue;
                if (sameNet(i.ip, ip, Math.min(len, i.len))) return simErr(ip + '/' + len + ' ' + longName(n) + ' ile çakışıyor.');
            }
            cur().forEach(i => { i.ip = ip; i.len = len; i.dhcp = false; });
            touch();
        }
        function ifDel(a) {
            const n = a.if;
            if (isEth(n) || n.startsWith('mgmt') || n === 'vlan1') return simErr('Fiziksel arayüz, mgmt ve vlan1 silinemez.');
            if (!M().ifs[n]) return simErr('Böyle bir arayüz yok.');
            delete M().ifs[n];
            if (n.startsWith('vlan')) {
                const v = ifNums(n)[0];
                delete M().vlans[v];
                Object.values(M().ifs).forEach(i => { if (i.access === v) i.access = 1; i.allowed = i.allowed.filter(x => x !== v); });
            }
            touch();
        }
        function ifRange(a) {
            // "ethernet 1/1/1-1/1/4" ya da "ethernet 1/1/1-1/1/4,1/1/7"
            const m = a.r.match(/^(e[a-z]*)\s+(.+)$/i);
            if (!m || !'ethernet'.startsWith(m[1].toLowerCase())) return { err: 'invalid' };
            const out = [];
            for (const part of m[2].replace(/\s+/g, '').split(',')) {
                const r = part.match(/^1\/1\/(\d+)(?:-1\/1\/(\d+))?$/);
                if (!r) return { err: 'invalid' };
                const x = +r[1], y = r[2] ? +r[2] : x;
                if (x > y) return { err: 'invalid' };
                for (let k = x; k <= y; k++) { const n = 'ethernet1/1/' + k; if (!M().ifs[n]) return { err: 'invalid' }; out.push(n); }
            }
            S.mode = 'range'; S.ctx = [...new Set(out)];
            S.rangeName = 'eth' + m[2].replace(/\s+/g, '');
        }
        function routeAdd(a) {
            const [n, l] = pfxSplit(a.p);
            if (netOf(n, l) !== ip2n(n)) return simErr('Önek ağ adresi olmalı (ör. ' + n2ip(netOf(n, l)) + '/' + l + ').');
            if (!connFor(M(), a.nh)) return '% Error: Network unreachable';
            M().routes = M().routes.filter(r => !(r.p === a.p && r.nh === a.nh)).concat([{ p: a.p, nh: a.nh }]);
            touch();
        }
        function routeDel(a) {
            const before = M().routes.length;
            M().routes = M().routes.filter(r => !(r.p === a.p && (a.nh === undefined || r.nh === a.nh)));
            if (before === M().routes.length) return simErr('Böyle bir rota yok.');
            touch();
        }
        function userAdd(a) {
            if (!/^[a-z_][a-z0-9_-]*$/.test(a.u) || a.u.length > 32) return simErr('Kullanıcı adı küçük harf/rakam/_/- içermeli (en fazla 32).');
            if (a.pw.length < 9) return simErr('Parola en az 9 karakter olmalı (varsayılan parola kuralı).');
            if (a.u === 'admin' && a.pw === 'admin') return simErr('Varsayılan parolayı tekrar kullanmayın.');
            M().users[a.u] = { pw: a.pw, role: a.r, lvl: a.l };
            touch();
        }
        function cmdCommit() {
            if (!S.tx) return;
            S.run = S.cand; S.cand = null; S.tx = false;
        }
        function save() { S.startup = clone(S.run); }
        function isSaved() { return !!S.startup && JSON.stringify(S.startup) === JSON.stringify(S.run); }
        function cmdReload() {
            const go = () => {
                S.pending = { prompt: 'Proceed to reboot the system? [confirm yes/no]:', fn: x => {
                    if (!/^y/i.test(x)) return '';
                    S.run = S.startup ? clone(S.startup) : baseModel(S.lab);
                    S.tx = false; S.cand = null; S.mode = 'exec'; S.ctx = [];
                    return '% [Simülatör] Cihaz yeniden başlatıldı; startup-configuration yüklendi.';
                } };
                return '';
            };
            if (!isSaved()) {
                const ask = { prompt: 'System configuration has been modified. Save? [yes/no]:', fn: x => {
                    if (/^y/i.test(x)) { save(); const o = 'Saving system configuration'; go(); return o; }
                    if (/^n/i.test(x)) return go();
                    S.pending = ask; return '';
                } };
                S.pending = ask; return '';
            }
            return go();
        }
        function execDo(line) {
            const keep = [S.mode, S.ctx];
            S.mode = 'exec';
            const r = execLine(line, EXEC, 3);
            if (S.mode === 'exec' || S.mode === 'config') { S.mode = keep[0]; S.ctx = keep[1]; }
            return r;
        }

        // ── durum
        const physUp = (m, n) => !!m.ifs[n] && !m.ifs[n].shutdown && !!m.links[n];
        const vlanOn = (i, v) => !i.l3 && (i.mode === 'access' ? i.access === v : (i.access === v || i.allowed.includes(v)));
        function ifUp(n, m) {
            m = m || R();
            const i = m.ifs[n];
            if (!i || i.shutdown) return false;
            if (isEth(n) || n.startsWith('mgmt')) return !!m.links[n];
            if (n.startsWith('loopback')) return true;
            if (n.startsWith('vlan')) { const v = ifNums(n)[0]; return Object.keys(m.ifs).some(k => isEth(k) && physUp(m, k) && vlanOn(m.ifs[k], v)); }
            return false;
        }
        function connFor(m, ip) {
            for (const [n, i] of Object.entries(m.ifs)) if (i.ip && !n.startsWith('mgmt') && sameNet(i.ip, ip, i.len) && ifUp(n, m)) return n;
            return null;
        }
        function rib() {
            const m = R(), out = [];
            for (const [n, i] of Object.entries(m.ifs)) {
                if (!i.ip || n.startsWith('mgmt') || !ifUp(n)) continue;
                out.push({ c: 'C', net: n2ip(netOf(i.ip, i.len)), len: i.len, nh: i.ip, ifn: n, d: '0/0' });
            }
            for (const r of m.routes) {
                const [net, len] = pfxSplit(r.p), ifn = connFor(m, r.nh);
                if (!ifn || out.some(x => x.net === net && x.len === len)) continue;
                out.push({ c: len === 0 ? '*S' : 'S', net, len, nh: r.nh, ifn, d: '1/0' });
            }
            return out.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }

        // ═══ show çıktıları ══════════════════════════════════════════════════
        function ifBlock(m, n, ind) {
            const i = m.ifs[n], p = ind ? ' ' : '', L = ['interface ' + n];
            if (i.desc) L.push(p + 'description ' + i.desc);
            L.push(p + (i.shutdown ? 'shutdown' : 'no shutdown'));
            if (isEth(n) && i.l3) L.push(p + 'no switchport');
            if (isEth(n) && !i.l3) {
                if (i.mode === 'trunk') L.push(p + 'switchport mode trunk');
                L.push(p + 'switchport access vlan ' + i.access);
                if (i.mode === 'trunk' && i.allowed.length) L.push(p + 'switchport trunk allowed vlan ' + vcomp(i.allowed));
            }
            if (n.startsWith('mgmt') && !i.dhcp) L.push(p + 'no ip address dhcp');
            if (i.ip) L.push(p + 'ip address ' + i.ip + '/' + i.len);
            if (n.startsWith('mgmt')) L.push(p + 'ipv6 address autoconfig');
            return L;
        }
        function body(m) {
            const L = [];
            if (m.hostname !== 'OS10') L.push('hostname ' + m.hostname);
            for (const [u, x] of Object.entries(m.users)) L.push('username ' + u + ' password $6$' + fakeHash('s' + u, 8) + '$' + fakeHash(u + x.pw, 43) + ' role ' + x.role + ' priv-lvl ' + (x.lvl !== undefined ? x.lvl : (x.role === 'netoperator' ? 1 : 15)));
            L.push('aaa authentication local');
            if (!m.ssh) L.push('no ip ssh server enable');
            m.routes.forEach(r => L.push('ip route ' + r.p + ' ' + r.nh));
            const RO = ['ethernet', 'loopback', 'vlan', 'mgmt'];
            for (const n of Object.keys(m.ifs).sort((a, b) => RO.indexOf(ifType(a)) - RO.indexOf(ifType(b)) || ifCmp(a, b))) L.push('!', ...ifBlock(m, n, true));
            if (m.mroutes.length) { L.push('!'); m.mroutes.forEach(r => L.push('management route ' + r.p + ' ' + r.nh)); }
            return L;
        }
        function runText(m, head) {
            const L = head ? ['! Version ' + OSVER, '! Last configuration change at Sep 25 09:' + String(10 + (S.lastChange % 50)).padStart(2, '0') + ':00 2026', '!'] : [];
            return L.concat(body(m)).join('\n');
        }
        function showDiff() {
            if (!S.tx) return '';
            const a = body(S.cand), b = body(S.run);
            // blok (ünlemle ayrılmış) bazında fark: aday yapılandırmada olup running'de farklı olan bloklar
            const blocks = arr => { const out = []; let curB = []; arr.forEach(l => { if (l === '!') { if (curB.length) out.push(curB); curB = []; } else curB.push(l); }); if (curB.length) out.push(curB); return out; };
            const rb = blocks(b).map(x => x.join('\n'));
            const L = [];
            for (const blk of blocks(a)) {
                if (rb.includes(blk.join('\n'))) continue;
                const same = blocks(b).find(x => x[0] === blk[0]);
                const lines = same && blk[0].startsWith('interface') ? [blk[0]].concat(blk.slice(1).filter(l => !same.includes(l))) : blk;
                L.push('!', ...lines.map(l => l.replace(/^ /, '')));
            }
            return L.join('\n');
        }
        function showVersion() {
            return ['Dell SmartFabric OS10 Enterprise', 'OS Version: ' + OSVER + ' (Config Generator CLI Lab eğitim simülatörü — gerçek cihaz değildir)', 'Build Version: ' + OSVER + '.0',
                'System Type: S5248F-ON', 'Architecture: x86_64', 'Up Time: 00:12:31'].join('\n');
        }
        function showVlan() {
            const m = R();
            const L = ['Codes: * - Default VLAN, M - Management VLAN, R - Remote Port Mirroring VLANs,', '       @ - Attached to Virtual Network, P - Primary, C - Community, I - Isolated',
                'Q: A - Access (Untagged), T - Tagged', '  NUM    Status    Description                     Q Ports'];
            for (const v of Object.keys(m.vlans).map(Number).sort((a, b) => a - b)) {
                const acc = [], tag = [];
                for (const n of Object.keys(m.ifs).filter(isEth).sort(ifCmp)) {
                    const i = m.ifs[n];
                    if (i.l3) continue;
                    if (i.access === v) acc.push(n); else if (i.mode === 'trunk' && i.allowed.includes(v)) tag.push(n);
                }
                const up = ifUp('vlan' + v) || acc.concat(tag).some(n => physUp(m, n));
                const head = (v === 1 ? '* ' : '  ') + pad(v, 7) + pad(up ? 'Active' : 'Inactive', 10) + pad(m.vlans[v] || '', 32);
                const lines = [];
                if (acc.length) lines.push('A ' + portList(acc));
                if (tag.length) lines.push('T ' + portList(tag));
                if (!lines.length) L.push(head.replace(/\s+$/, ''));
                lines.forEach((x, k) => L.push((k ? ' '.repeat(head.length) : head) + x));
            }
            return L.join('\n');
        }
        function portList(names) {
            const nums = names.map(n => ifNums(n)[2]).sort((a, b) => a - b), r = []; let i = 0;
            while (i < nums.length) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++; r.push(j > i ? '1/1/' + nums[i] + '-1/1/' + nums[j] : '1/1/' + nums[i]); i = j + 1; }
            return 'Eth' + r.join(',');
        }
        function showIfStatus() {
            const m = R(), line = '-'.repeat(81);
            const L = [line, 'Port            Description     Status   Speed    Duplex   Mode Vlan Tagged-Vlans', line];
            for (const n of Object.keys(m.ifs).filter(isEth).sort(ifCmp)) {
                const i = m.ifs[n], up = ifUp(n);
                const mode = i.l3 ? '' : i.mode === 'trunk' ? 'T' : 'A';
                L.push(pad(shortEth(n), 16) + pad(i.desc.slice(0, 15), 16) + pad(up ? 'up' : 'down', 9) + pad(up ? '10G' : '0', 9) + pad(up ? 'full' : '', 9) + pad(mode, 5) + pad(i.l3 ? '-' : i.access, 5) + (i.mode === 'trunk' && !i.l3 && i.allowed.length ? vcomp(i.allowed) : '-'));
            }
            return L.join('\n');
        }
        function showIpBrief() {
            const m = R();
            const L = ['Interface Name            IP-Address          OK       Method       Status     Protocol', '='.repeat(89)];
            for (const n of Object.keys(m.ifs).sort(ifCmp)) {
                const i = m.ifs[n], up = ifUp(n);
                L.push(pad(longName(n), 27) + pad(i.ip ? i.ip + '/' + i.len : 'unassigned', 20) + pad(up ? 'YES' : 'NO', 9) + pad(i.ip ? 'manual' : (i.dhcp ? 'DHCP' : 'unset'), 13) + pad(i.shutdown ? 'down' : 'up', 12) + (up ? 'up' : 'down'));
            }
            return L.join('\n');
        }
        function showRoute() {
            const Rr = rib(), d = Rr.find(r => r.len === 0);
            const L = ['Codes: C - connected', '       S - static', '       B - BGP, IN - internal BGP, EX - external BGP, EV - EVPN BGP',
                '       O - OSPF, IA - OSPF inter area, N1 - OSPF NSSA external type 1,', '       N2 - OSPF NSSA external type 2, E1 - OSPF external type 1,',
                '       E2 - OSPF external type 2, * - candidate default,', '       + - summary route, > - non-active route',
                d ? 'Gateway of last resort is via ' + d.nh + ' to network 0.0.0.0' : 'Gateway of last resort is not set',
                '  Destination                 Gateway                                        Dist/Metric       Last Change', '-'.repeat(106)];
            Rr.forEach(r => L.push('  ' + pad(r.c, 6) + pad(r.net + '/' + r.len, 20) + 'via ' + pad(r.nh, 21) + pad(r.ifn, 24) + pad(r.d, 18) + '00:12:31'));
            return L.join('\n');
        }
        const padL = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
        function ping(ip) {
            const m = R(), hosts = S.lab.hosts || [];
            const okOut = () => ['PING ' + ip + ' (' + ip + ') 56(84) bytes of data.'].concat([1, 2, 3, 4].map(k => '64 bytes from ' + ip + ': icmp_seq=' + k + ' ttl=64 time=0.' + (5 + k) + '12 ms'),
                ['', '--- ' + ip + ' ping statistics ---', '4 packets transmitted, 4 received, 0% packet loss, time 3004ms', 'rtt min/avg/max/mdev = 0.612/0.762/0.912/0.112 ms',
                    '% [Simülatör] 4 paket sonra durduruldu (gerçek cihazda Ctrl+C ile durdurulur).']).join('\n');
            const fail = () => ['PING ' + ip + ' (' + ip + ') 56(84) bytes of data.', '', '--- ' + ip + ' ping statistics ---', '4 packets transmitted, 0 received, 100% packet loss, time 3066ms'].join('\n');
            if (Object.entries(m.ifs).some(([n, i]) => i.ip === ip && ifUp(n))) return okOut();
            const mg = m.ifs['mgmt1/1/1'];
            if (mg.ip && ifUp('mgmt1/1/1') && (sameNet(mg.ip, ip, mg.len) || m.mroutes.some(r => { const [n, l] = pfxSplit(r.p); return sameNet(n, ip, l) && sameNet(mg.ip, r.nh, mg.len); }))) return hosts.includes(ip) ? okOut() : fail();
            const r = rib().filter(x => sameNet(x.net, ip, x.len)).sort((a, b) => b.len - a.len)[0];
            if (!r) return 'connect: Network is unreachable';
            if (!hosts.includes(ip) || (r.c !== 'C' && !hosts.includes(r.nh))) return fail();
            return okOut();
        }

        // ═══ Yürütme ═════════════════════════════════════════════════════════
        function errText(r, raw) {
            log({ raw, err: r.err, mode: S.mode });
            if (r.err === 'empty') return '';
            if (r.err === 'incomplete') return '% [Simülatör] Komut eksik: ? ile sonraki parametreleri görün.';
            if (r.err === 'amb') return '% [Simülatör] Belirsiz kısaltma "' + r.tok + '": ' + (r.cands || []).join(', ');
            if (unsupported(raw)) { S.ev[S.ev.length - 1].err = 'unsupported'; return '% [Simülatör] Bu komut gerçek OS10\'da var ama bu lab sürümünde desteklenmiyor. ? ile desteklenenleri görün.'; }
            if (r.err === 'value') return '% [Simülatör] Geçersiz değer: "' + r.tok + '"' + (r.exp && r.exp[0] ? ' (beklenen: ' + label(r.exp[0]) + ')' : '') + '.';
            return '% Error: Unrecognized command.';
        }
        const UNSUP = ['show interface ethernet', 'show interface port-channel', 'show interface', 'show port-channel', 'show lacp', 'show mac', 'show spanning-tree', 'show lldp', 'show vlt', 'show vrrp',
            'show ip ospf', 'show ip bgp', 'show ip arp', 'show ip management-route', 'show ip ssh', 'show users', 'show clock', 'show system', 'show inventory', 'show environment', 'show alarms',
            'show logging', 'show ntp', 'show snmp', 'show boot', 'show image', 'show license', 'show processes', 'show tech-support', 'show hardware', 'show ip access-lists', 'show queuing', 'show qos',
            'show evpn', 'show nve', 'show virtual-network', 'show alias', 'traceroute', 'clear', 'system', 'image', 'boot', 'lock', 'unlock', 'alias', 'batch', 'dir', 'delete',
            'router', 'vlt-domain', 'spanning-tree', 'lldp', 'logging', 'ntp', 'snmp-server', 'ip access-list', 'ip access-group', 'channel-group', 'interface port-channel', 'mtu', 'speed', 'flowcontrol',
            'banner', 'clock', 'aaa', 'radius-server', 'tacacs-server', 'monitor', 'vrrp', 'ip helper-address', 'ipv6', 'ip vrf', 'ip domain-name', 'ip name-server', 'password-attributes', 'userrole', 'feature'];
        const STOP = ['show', 'ip', 'interface', 'switchport', 'spanning-tree'];
        function unsupported(raw) {
            const t = C.tokenize(raw.replace(/^\s*(no|do)\s+/i, '')).map(x => x.t.toLowerCase());
            return UNSUP.some(u => { const w = u.split(' '); return w.length <= t.length && w.every((x, k) => x === t[k] || (t[k].length >= 2 && x.startsWith(t[k]) && !STOP.includes(t[k]))); });
        }
        function applyPipe(out, spec) {
            const m = spec.match(/^\s*(\S+)\s*(.*)$/);
            if (!m) return { err: 'incomplete' };
            const f = ['grep', 'except', 'find', 'no-more'].filter(w => w.startsWith(m[1].toLowerCase()));
            if (f.length !== 1) return { err: f.length ? 'amb' : 'invalid', tok: m[1], cands: f };
            if (f[0] === 'no-more') return { out };
            if (!m[2]) return { err: 'incomplete' };
            let re; try { re = new RegExp(m[2]); } catch (e) { re = { test: s => s.includes(m[2]) }; }
            const lines = out.split('\n');
            if (f[0] === 'grep') return { out: lines.filter(l => re.test(l)).join('\n') };
            if (f[0] === 'except') return { out: lines.filter(l => !re.test(l)).join('\n') };
            const k = lines.findIndex(l => re.test(l));
            return { out: k < 0 ? '' : lines.slice(k).join('\n') };
        }
        function execLine(raw, list, doOff) {
            let body = raw, pipe = null;
            const pi = raw.indexOf('|');
            if (pi > 0) { body = raw.slice(0, pi).replace(/\s+$/, ''); pipe = raw.slice(pi + 1); }
            const r = match(avail(list), body, ctx);
            if (!r.ok) return errText(r, raw);
            if (pipe !== null && !/^show /.test(r.canon)) return errText({ err: 'invalid' }, raw);
            log({ raw, canon: (doOff ? 'do ' : '') + r.canon + (pipe !== null ? ' | ' + pipe.trim() : ''), mode: S.mode, tx: S.tx });
            let out = r.cmd.run(r.args);
            if (out && typeof out === 'object') return objOut(out, raw);
            out = out || '';
            if (/^% Error/.test(out)) S.ev[S.ev.length - 1] = { raw, err: 'value', mode: S.mode };
            if (pipe !== null) { const p = applyPipe(out, pipe); if (p.err) { S.ev.pop(); return errText(p, raw); } out = p.out; }
            return out;
        }
        function objOut(out, raw) {
            S.ev.pop();
            if (out.sim) { log({ raw, err: 'sim', mode: S.mode }); return '% [Simülatör] ' + out.sim; }
            return errText(out, raw);
        }
        function cfgLine(line) {
            // show … | filtre yapılandırma modunda da çalışır; "do …" satırı filtreyi kendisi işler
            const pi = line.indexOf('|');
            const main = pi > 0 && !/^\s*do\s/i.test(line) ? line.slice(0, pi).replace(/\s+$/, '') : line;
            const pipe = main !== line ? line.slice(pi + 1) : null;
            const toks = C.tokenize(main);
            const isNo = toks[0].t.toLowerCase() === 'no' && toks.length > 1;
            const body = isNo ? main.slice(toks[1].o) : main;
            const tryIn = l => match(avail(l, isNo), body, ctx, isNo);
            let r = tryIn(MODES[S.mode]), fell = false;
            if (!r.ok && S.mode !== 'config') { const r2 = tryIn(CONFIG); if (r2.ok) { r = r2; fell = true; } }
            if (!r.ok) return errText(r, line);
            if (pipe !== null && (isNo || !/^show /.test(r.canon))) return errText({ err: 'invalid' }, line);
            const prev = [S.mode, S.ctx];
            if (fell) { S.mode = 'config'; S.ctx = []; }
            log({ raw: line, canon: (isNo ? 'no ' : '') + r.canon + (pipe !== null ? ' | ' + pipe.trim() : ''), mode: S.mode, ctx: S.ctx.slice(), no: isNo, tx: S.tx });
            let out = isNo ? r.cmd.no(r.args) : r.cmd.run(r.args);
            if (out && typeof out === 'object') { S.mode = prev[0]; S.ctx = prev[1]; return objOut(out, line); }
            out = out || '';
            if (/^% Error/.test(out)) S.ev[S.ev.length - 1] = { raw: line, err: 'value', mode: S.mode };
            if (pipe !== null) { const p = applyPipe(out, pipe); if (p.err) { S.ev.pop(); return errText(p, line); } out = p.out; }
            return out;
        }

        function promptText() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return M().hostname + ' login: ';
            const h = M().hostname;
            if (S.mode === 'exec') return h + '# ';
            if (S.mode === 'config') return h + '(config)# ';
            if (S.mode === 'range') return h + '(conf-range-' + S.rangeName + ')# ';
            const n = S.ctx[0];
            if (isEth(n)) return h + '(conf-if-eth' + n.slice(8) + ')# ';
            if (n.startsWith('vlan')) return h + '(conf-if-vl-' + n.slice(4) + ')# ';
            if (n.startsWith('mgmt')) return h + '(conf-if-ma-' + n.slice(4) + ')# ';
            return h + '(conf-if-lo-' + n.slice(8) + ')# ';
        }
        function login(raw) {
            // Basit giriş: kullanıcı adı → parola
            const u = raw.trim();
            S.pending = { prompt: 'Password: ', secret: true, fn: pw => {
                const usr = M().users[u];
                if (usr && usr.pw === pw) { S.loggedOut = false; S.mode = 'exec'; S.ctx = []; return ''; }
                return 'Login incorrect';
            } };
            return '';
        }
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw: p.secret ? '***' : raw, prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) { if (!raw.trim()) return ''; return login(raw); }
            if (raw === '\x1a') { if (S.mode !== 'exec') { S.mode = 'exec'; S.ctx = []; } return ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            if (S.mode === 'exec') return execLine(line, EXEC, 0);
            return cfgLine(line);
        }
        function helpFn(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            let list, body = raw;
            const toks = C.tokenize(raw);
            if (S.mode === 'exec') list = avail(EXEC);
            else if (toks.length && toks[0].t.toLowerCase() === 'no' && (toks.length > 1 || /\s$/.test(raw))) { body = raw.slice(toks[1] ? toks[1].o : raw.length); list = avail(MODES[S.mode], true); }
            else if (toks.length && toks[0].t.toLowerCase() === 'do' && (toks.length > 1 || /\s$/.test(raw))) { body = raw.slice(toks[1] ? toks[1].o : raw.length); list = avail(EXEC); }
            else list = avail(MODES[S.mode]);
            const kh = (w, a, e) => w ? (KW[w] || (a && a.c.h) || '') : (e ? (VARH[e.k] || (e.k === 'int' ? 'Sayı' : '')) : '');
            const h = help(list, body, ctx, kh);
            if (h.err === 'amb') return '% [Simülatör] Belirsiz kısaltma.';
            if (h.err) return '% Error: Unrecognized command.';
            return h.rows.map(([w, d]) => '  ' + pad(w, 25) + d).join('\n');
        }
        function completeFn(raw) {
            if (S.pending || S.loggedOut) return null;
            const toks = C.tokenize(raw);
            if (S.mode !== 'exec' && toks.length > 1 && ['no', 'do'].includes(toks[0].t.toLowerCase())) {
                const r = complete(toks[0].t.toLowerCase() === 'no' ? avail(MODES[S.mode], true) : avail(EXEC), raw.slice(toks[1].o), ctx);
                return r === null ? null : raw.slice(0, toks[1].o) + r;
            }
            const r = complete(avail(S.mode === 'exec' ? EXEC : MODES[S.mode]), raw, ctx);
            return r === null && (S.mode === 'if' || S.mode === 'range') ? complete(avail(CONFIG), raw, ctx) : r;
        }

        // Başlangıç yapılandırması (lab.start + varyant.start: yapılandırma modu komutları) — olay kaydına girmez
        const startCmds = (lab.start || []).concat((variant && variant.start) || []);
        if (startCmds.length) {
            S.mode = 'config';
            for (const c of startCmds) { const o = input(c); if (/% (Error|\[Simülatör\])/.test(o || '') && typeof console !== 'undefined') console.warn('[os10 start] ' + lab.id + ': ' + c + ' → ' + o); }
            S.mode = 'exec'; S.ctx = []; S.ev = []; S.hist = [];
            if (lab.startSaved) save();
        }

        const E = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon.toLowerCase()),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            err: k => S.ev.some(e => e.err === k),
            after: (reA, reB) => { const i = S.ev.findIndex(e => e.canon && reA.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && reB.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err === 'invalid'); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            ranIn: (re, mode) => S.ev.some(e => e.canon && re.test(e.canon) && e.mode === mode),
            ranTx: re => S.ev.some(e => e.canon && re.test(e.canon) && e.tx),
            list: () => S.ev
        };

        return {
            vendor: 'dell',
            prompt: promptText,
            secret: () => !!(S.pending && S.pending.secret),
            input, help: helpFn, complete: completeFn,
            _toPriv: () => { S.mode = 'exec'; S.ctx = []; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => variant,
            get model() { return S.run; },
            get candidate() { return S.tx ? S.cand : null; },
            get startupModel() { return S.startup; },
            inTx: () => S.tx,
            ev: E,
            saved: isSaved,
            mode: () => S.mode,
            ifUp: n => ifUp(n), rib,
            showRun: () => runText(S.run, true),
        };
    }

    return { session, ifNorm };
})();
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { dell: CgLabOs10 });
if (typeof module !== 'undefined') module.exports = CgLabOs10;
