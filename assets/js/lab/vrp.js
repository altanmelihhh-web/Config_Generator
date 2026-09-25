'use strict';

// ─── CLI Lab: Huawei VRP benzeri motor (eğitim simülatörü; S5700 / AR V200R görünümü) ───
// Komutlar cihaz MODELİNİ değiştirir; display çıktıları modelden üretilir. Görev kontrolleri
// modele ve olay kaydına (ev) bakar. Vendor anahtarı: 'huawei'.
//
// Doğrulama kaynakları (biçimler buradan; metin kopyalanmadı):
//  - Hata dizgeleri: Huawei "Interpreting Command Line Error Messages"
//    https://support.huawei.com/enterprise/en/doc/EDOC1100082539/941a7a88/interpreting-command-line-error-messages
//    + eNSP S5700 oturum kaydı (caret sütunu = istem uzunluğu + kelime başı; eksik komutta satır sonu + 1)
//    https://github.com/dahaia1/codebackup (P66.LOG) · https://github.com/windseeker302/computing (网络/HCIA.md)
//    "Wrong parameter" / "Ambiguous": https://github.com/cflw/network_device_script (华为引擎命令行/设备.py)
//    "Too many parameters" ve "Please renew the default configurations.":
//    http://huaweiaccess.blogspot.com/2013/09/to-solve-huawei-s2700-cannot-modify.html
//    https://support.huawei.com/enterprise/en/knowledge/EKB1000017070
//  - system-view iletisi, Tab ile "sys" → "system-view": P66.LOG (yukarıda)
//  - save (S serisi): https://github.com/HuoHua2019/eNSP-campus-network (2.0/README.md);
//    save (AR): aynı dosyadaki R1 örneği; netmiko huawei.py beklenen çıktı notu
//  - vlan batch "Info: This operation may take a few seconds…": HuoHua2019 (yukarıda)
//  - display vlan / port vlan / interface brief / eth-trunk / acl / traffic-filter applied-record:
//    ntc-templates tests/huawei_vrp/* (Apache-2.0; yalnız biçim referansı)
//  - display ip interface brief / ip routing-table: windseeker302 HCIA.md (eNSP AR çıktısı)
//  - display ospf peer brief: fengzhao/fengzhao-notes network/OSPF实战/OSPF实验1.txt
//  - undo ospf onayı: "Warning: The OSPF process will be deleted. Continue? [Y/N]:" (JWM0203/ensp-skills)
// Doğrulanamayan çıktılar "[Simülatör]" etiketiyle verilir (reboot soruları, rsa anahtarı, kayıtlı config yoksa …).
const CgLabVrp = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, padL, isIp, maskLen, lenMask, netOf, sameNet, ip2n, n2ip, fakeHash } = C;
    const clone = o => JSON.parse(JSON.stringify(o));

    // ── Arayüz adları
    const IFT = [['GigabitEthernet', 'GE'], ['Vlanif', 'Vlanif'], ['Eth-Trunk', 'Eth-Trunk'], ['LoopBack', 'LoopBack'], ['NULL', 'NULL']];
    const IF_ORDER = ['Vlanif', 'Eth-Trunk', 'GigabitEthernet', 'NULL', 'LoopBack'];
    function ifNorm(s) {
        const m = String(s).match(/^([a-z-]+)\s*(\d+(?:\/\d+){0,2})$/i);
        if (!m) return null;
        const p = m[1].toLowerCase();
        const hits = IFT.filter(([f]) => f.toLowerCase().startsWith(p));
        if (hits.length !== 1) return null;
        const t = hits[0][0], nums = m[2].split('/');
        if (t === 'GigabitEthernet' ? nums.length !== 3 : nums.length !== 1) return null;
        return t + m[2];
    }
    const ifType = n => (IFT.find(([f]) => n.startsWith(f)) || [''])[0];
    const ifNums = n => (n.match(/[\d/]+$/) || [''])[0].split('/').map(Number);
    const ifShort = n => n.replace(/^GigabitEthernet/, 'GE');
    const isPhys = n => /^GigabitEthernet/.test(n);
    function ifCmp(a, b) {
        const ta = IF_ORDER.indexOf(ifType(a)), tb = IF_ORDER.indexOf(ifType(b));
        if (ta !== tb) return ta - tb;
        const na = ifNums(a), nb = ifNums(b);
        for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
        return 0;
    }
    const range = (p, a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(p + i); return r; };

    // ── wildcard: noktalı biçim ya da "0" (host) — VRP ikisini de kabul eder
    const wildOk = t => t === '0' || (isIp(t) && t.split('.').every(o => [0, 1, 3, 7, 15, 31, 63, 127, 255].includes(+o)));
    const wildNorm = t => t === '0' ? '0.0.0.0' : t;
    const wildMatch = (ip, net, w) => { const a = ip.split('.').map(Number), n = net.split('.').map(Number), ww = wildNorm(w).split('.').map(Number); return a.every((o, k) => (o & ~ww[k] & 255) === (n[k] & ~ww[k] & 255)); };
    const areaNorm = t => /^\d+$/.test(t) ? n2ip(+t) : t;
    const areaOk = t => (/^\d+$/.test(t) && +t <= 4294967295) || isIp(t);

    // ═══ Komut DSL eşleştirici (core.js fikrinden uyarlandı: özel değişken tipleri + VRP hata türleri) ═══
    // Değişkenler: (a-b) sayı · A.B.C.D · MASK · WILD (noktalı ya da 0) · MASKLEN (maske ya da 0-32) · WORD · LINE
    //              IFNAME · AREA · VLANS (satırın geri kalanı: "10 20 to 30" / all — çalıştırmada doğrulanır)
    const VT = {
        'A.B.C.D': { ok: t => isIp(t), label: 'IP-ADDRESS' },
        MASK: { ok: t => maskLen(t) >= 0, label: 'MASK' },
        MASKLEN: { ok: t => maskLen(t) >= 0 || (/^\d+$/.test(t) && +t <= 32), label: 'MASK|LEN' },
        WILD: { ok: wildOk, label: 'WILDCARD' },
        WORD: { ok: () => true, label: 'STRING' },
        AREA: { ok: areaOk, label: 'AREA' },
        IFNAME: { ok: (t, ctx) => !!(ifNorm(t) && ctx.ifValid(ifNorm(t))), val: t => ifNorm(t), label: 'INTERFACE', iface: true },
        LINE: { rest: true, label: 'TEXT' },
        VLANS: { rest: true, label: 'VLAN' },
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
            // "GigabitEthernet 0/0/1", "vlanif 10" gibi iki parçalı arayüz adını birleştir
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
            else if (hits.size > 1) return { alive: [], toks, err: 'amb', at: i };
            if (!next.length) {
                for (const a of alive) {
                    const e = a.s[i];
                    if (!e || e.k === 'kw') continue;
                    if (isRest(e)) {
                        const v = raw.slice(toks[i].o);
                        const n = { c: a.c, s: a.s, args: Object.assign({}, a.args), canon: a.canon.concat([v.trim()]), line: true, restAt: toks[i].o };
                        if (e.name) n.args[e.name] = v.trim();
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
                // VRP hata türü: ilk kelime → tanınmayan; diziler bittiyse → fazla parametre; değişken bekleniyorsa → yanlış parametre
                let err = 'invalid';
                if (i > 0) {
                    if (!alive.some(a => a.s[i])) err = 'toomany';
                    else if (alive.some(a => a.s[i] && a.s[i].k !== 'kw')) err = 'value';
                }
                return { alive: [], toks, err, at: i };
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
        if (w.err) return { ok: false, err: w.err, col: w.toks[w.at] ? w.toks[w.at].o : raw.length };
        const n = w.toks.length;
        const done = w.alive.filter(a => a.line || a.s.length === n || (noForm && a.s.slice(n).every(e => e.neg || e.opt)));
        if (!done.length) return { ok: false, err: 'incomplete', col: raw.replace(/\s+$/, '').length + 1 };
        const a = done[0];
        return { ok: true, cmd: a.c, args: a.args, canon: a.canon.join(' '), restAt: a.restAt };
    }
    const label = e => e.k === 'int' ? 'INTEGER<' + e.a + '-' + e.b + '>' : (VT[e.k] ? VT[e.k].label : e.k);
    function help(cmds, raw, ctx, kwHelp) {
        const trailing = raw === '' || /\s$/.test(raw);
        const toks = C.tokenize(raw);
        const part = trailing ? null : toks.pop();
        const w = walk(cmds, toks, raw, ctx);
        if (w.err) return { err: w.err, col: w.toks[w.at] ? w.toks[w.at].o : 0 };
        const n = w.toks.length;
        if (w.lineAt !== undefined) return { rows: [[label(w.alive[0].s[w.lineAt]), kwHelp(null, w.alive[0], w.alive[0].s[w.lineAt])], ['<cr>', 'Komutu çalıştırmak için ENTER']] };
        if (part) {
            const pl = part.t.toLowerCase(), words = new Set();
            for (const a of w.alive) { const e = a.s[n]; if (e && e.k === 'kw') e.w.forEach(x => { if (x.startsWith(pl)) words.add(x); }); }
            if (!words.size) {
                const vs = w.alive.filter(a => a.s[n] && a.s[n].k !== 'kw');
                return vs.length ? { rows: vs.map(a => [label(a.s[n]), kwHelp(null, a, a.s[n])]) } : { err: 'invalid', col: part.o };
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
        if (cr) list.push(['<cr>', 'Komutu çalıştırmak için ENTER']);
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
            const hits = IF_ORDER.filter(x => x.toLowerCase().startsWith(pl));
            if (hits.length === 1) return raw.slice(0, part.o) + hits[0];
        }
        return null;
    }

    // ── VLAN listesi: "10 20 to 30" | "all"
    function vlansParse(s, allOk) {
        const t = String(s).trim().split(/\s+/);
        if (allOk && t.length === 1 && t[0].toLowerCase() === 'all') return { list: range('', 1, 4094).map(Number) };
        const out = new Set();
        for (let i = 0; i < t.length; i++) {
            if (!/^\d+$/.test(t[i]) || +t[i] < 1 || +t[i] > 4094) return { bad: i };
            let a = +t[i], b = a;
            if (t[i + 1] && t[i + 1].toLowerCase() === 'to') {
                if (!t[i + 2] || !/^\d+$/.test(t[i + 2]) || +t[i + 2] < a || +t[i + 2] > 4094) return { bad: t[i + 2] ? i + 2 : -1 };
                b = +t[i + 2]; i += 2;
            }
            for (let v = a; v <= b; v++) out.add(v);
        }
        return out.size ? { list: [...out].sort((x, y) => x - y) } : { bad: -1 };
    }
    function vlansText(arr) { // 1 10 20 to 30 biçimi
        const r = []; let i = 0;
        while (i < arr.length) { let j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; r.push(j > i ? arr[i] + ' to ' + arr[j] : String(arr[i])); i = j + 1; }
        return r.join(' ');
    }
    function vlansDash(arr) { // display port vlan biçimi: 1 10 20-30
        const r = []; let i = 0;
        while (i < arr.length) { let j = i; while (j + 1 < arr.length && arr[j + 1] === arr[j] + 1) j++; r.push(j > i ? arr[i] + '-' + arr[j] : String(arr[i])); i = j + 1; }
        return r.join(' ');
    }
    const PORTN = { 80: 'www', 21: 'ftp', 23: 'telnet' };

    // ── Türkçe yardım açıklamaları
    const KW = {
        'system-view': 'Sistem görünümüne (yapılandırma) geç', display: 'Bilgi göster', save: 'Yapılandırmayı kaydet', quit: 'Bir üst görünüme çık / oturumu kapat',
        return: 'Doğrudan kullanıcı görünümüne dön (Ctrl+Z)', reboot: 'Cihazı yeniden başlat', ping: 'Erişilebilirlik testi', undo: 'Komutu geri al / varsayılana döndür',
        sysname: 'Cihaz adı', vlan: 'VLAN görünümü / VLAN bilgisi', batch: 'Birden çok VLAN oluştur', interface: 'Arayüz görünümü / arayüz bilgisi',
        'current-configuration': 'Çalışan yapılandırma', 'saved-configuration': 'Kaydedilmiş (sonraki açılış) yapılandırma', this: 'Bulunduğunuz görünümün yapılandırması',
        version: 'Yazılım/donanım sürümü', 'history-command': 'Komut geçmişi', brief: 'Kısa özet', ip: 'IP ayarları / IP bilgisi', 'routing-table': 'Yönlendirme tablosu',
        port: 'L2 port ayarları / port bilgisi', 'link-type': 'Port bağlantı tipi', access: 'Tek VLAN\'lı (etiketsiz) port', trunk: 'Çok VLAN\'lı (etiketli) port', hybrid: 'Etiketli + etiketsiz karma port',
        default: 'Varsayılan (PVID) VLAN', 'allow-pass': 'Trunk\'tan geçebilecek VLAN\'lar', pvid: 'Etiketsiz trafiğin VLAN\'ı', 'eth-trunk': 'Eth-Trunk (link toplama) / bilgisi',
        'route-static': 'Statik rota', preference: 'Rota önceliği (küçük = tercih)', ospf: 'OSPF süreci / OSPF bilgisi', 'router-id': 'Router kimliği', area: 'OSPF alanı', network: 'Alana ağ (wildcard ile) ekle',
        'silent-interface': 'Arayüzde OSPF hello gönderme', peer: 'Komşu bilgisi', aaa: 'AAA (yerel kullanıcılar ve doğrulama)', 'local-user': 'Yerel kullanıcı', password: 'Parola',
        'irreversible-cipher': 'Geri döndürülemez (hash) saklama', privilege: 'Yetki', level: 'Yetki seviyesi (0-15)', 'service-type': 'İzin verilen erişim türleri',
        'user-interface': 'Konsol / VTY hatları', vty: 'Sanal terminal (Telnet/SSH) hatları', 'authentication-mode': 'Giriş doğrulama yöntemi', protocol: 'Hat protokolü', inbound: 'Gelen yön',
        stelnet: 'STelnet (SSH) sunucusu', server: 'Sunucu', enable: 'Etkinleştir', ssh: 'SSH ayarları', user: 'Kullanıcı', 'authentication-type': 'SSH doğrulama türü', rsa: 'RSA anahtarları',
        'local-key-pair': 'Yerel anahtar çifti', create: 'Oluştur', acl: 'Erişim listesi (ACL)', number: 'ACL numarası', rule: 'ACL kuralı', permit: 'İzin ver', deny: 'Reddet',
        source: 'Kaynak adres', destination: 'Hedef adres', 'destination-port': 'Hedef port', eq: 'Eşittir', any: 'Herhangi bir adres', 'traffic-filter': 'Arayüze ACL filtresi uygula',
        outbound: 'Giden yön', 'applied-record': 'Uygulanan filtreler', description: 'Açıklama', shutdown: 'Arayüzü kapat', address: 'IP adresi', include: 'Eşleşen satırlar',
        exclude: 'Eşleşmeyen satırlar', begin: 'Eşleşmeden itibaren', all: 'Tümü', mode: 'Çalışma modu', lacp: 'LACP ile dinamik', 'lacp-static': 'LACP (eski sürüm adı)', manual: 'Elle (LACP yok)',
        'load-balance': 'Yük paylaşımı', 'idle-timeout': 'Boşta kalma zaman aşımı', none: 'Doğrulama yok', telnet: 'Telnet (şifresiz)', password_: '', 'user-interface_': '',
    };
    const VARH = { 'A.B.C.D': 'IP adresi', MASK: 'Alt ağ maskesi', MASKLEN: 'Maske (255.255.255.0) ya da uzunluk (24)', WILD: 'Wildcard (ör. 0.0.0.255; tek host için 0)',
        WORD: 'Metin', AREA: 'Alan kimliği (0 ya da 0.0.0.0)', IFNAME: 'Arayüz (ör. GigabitEthernet0/0/1, g0/0/1, Vlanif10)', LINE: 'Metin', VLANS: 'VLAN listesi (ör. 10 20 ya da 10 to 20)' };

    // ── Varsayılan cihaz modeli
    function newIf(sw, n) {
        const phys = isPhys(n);
        return { desc: '', shutdown: false, lt: sw && phys ? 'hybrid' : null, pvid: 1, allow: [1], ip: null, mask: null, et: null, tfIn: null, tfOut: null, etMode: n.startsWith('Eth-Trunk') ? 'manual' : null };
    }
    function baseModel(lab) {
        const sw = lab.kind !== 'router';
        const def = sw ? 'HUAWEI' : 'Huawei';
        const m = { sw, sysname: lab.hostname || def, defName: def, ifs: {}, vlans: { 1: null }, routes: [], ospf: {}, acls: {}, users: {}, stelnet: false, sshUsers: {}, rsa: false,
            vty: { auth: null, proto: null, level: null, idle: null }, links: {} };
        for (const n of lab.ifaces || (sw ? range('GigabitEthernet0/0/', 1, 24) : range('GigabitEthernet0/0/', 0, 2))) m.ifs[n] = newIf(sw, n);
        if (sw) m.ifs.Vlanif1 = newIf(sw, 'Vlanif1');
        m.ifs.NULL0 = newIf(sw, 'NULL0');
        for (const n of lab.up || []) m.links[n] = true;
        return m;
    }

    // ═══ Oturum ═══════════════════════════════════════════════════════════════
    function session(lab, opts) {
        const variant = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        const PEER = Object.assign({}, lab.peer || {}, (variant && variant.peer) || {});
        const S = { lab, m: baseModel(lab), view: 'user', vx: {}, saved: null, pending: null, ev: [], hist: [], loggedOut: false, answers: {} };
        const M = () => S.m;
        const log = o => { S.ev.push(o); };
        const ctx = {
            ifValid: n => {
                if (S.m.ifs[n]) return true;
                const t = ifType(n), num = ifNums(n)[0];
                if (t === 'Vlanif') return S.m.sw && num >= 1 && num <= 4094;
                if (t === 'LoopBack') return num <= 1023;
                if (t === 'Eth-Trunk') return S.m.sw && num <= 63;
                return false;
            }
        };
        const curIf = () => S.m.ifs[S.vx.if];
        function ensureIf(n) { if (!S.m.ifs[n]) S.m.ifs[n] = newIf(S.m.sw, n); return S.m.ifs[n]; }
        const pErr = (col, kind) => ({ err: kind || 'value', col });
        const simErr = text => ({ sim: text });
        // Çalışan satırın k. kelimesinin mutlak sütunu (caret için)
        const colTok = k => { const t = C.tokenize(S.lastBody || ''); return (S.lastBodyOff || 0) + (t[k] ? t[k].o : (S.lastBody || '').length + 1); };

        // ═══ Komut tanımları ═════════════════════════════════════════════════
        const X = build;
        const DISPLAY = [
            { p: 'display current-configuration', run: () => curText() },
            { p: 'display current-configuration interface IFNAME$if', run: a => ifBlockText(a.if) },
            { p: 'display saved-configuration', run: () => S.saved ? runBody(S.saved) : '# [Simülatör] Kaydedilmiş yapılandırma yok: henüz save yapılmadı.' },
            { p: 'display this', run: () => thisText() },
            { p: 'display version', run: showVersion },
            { p: 'display history-command', run: () => S.hist.slice(-10).map(x => '  ' + x).join('\n') },
            { p: 'display vlan', sw: 1, run: () => showVlan() },
            { p: 'display vlan (1-4094)$v', sw: 1, run: a => M().vlans[a.v] !== undefined ? showVlan(a.v) : '# [Simülatör] VLAN ' + a.v + ' yok.' },
            { p: 'display port vlan', sw: 1, run: showPortVlan },
            { p: 'display interface brief', run: showIfBrief },
            { p: 'display ip interface brief', run: showIpIfBrief },
            { p: 'display ip routing-table', run: showRt },
            { p: 'display eth-trunk', sw: 1, run: () => showEth() },
            { p: 'display eth-trunk (0-63)$n', sw: 1, run: a => showEth(a.n) },
            { p: 'display ospf peer brief', run: showOspfPeer },
            { p: 'display acl all', run: () => showAcl() },
            { p: 'display acl (2000-3999)$n', run: a => showAcl(a.n) },
            { p: 'display traffic-filter applied-record', run: showTfRec },
        ];
        const ALLV = [
            { p: 'save', run: cmdSave, neg: false },
            { p: 'quit', run: cmdQuit, neg: false },
            { p: 'ping A.B.C.D$ip', run: a => ping(a.ip), neg: false },
        ].concat(DISPLAY.map(d => Object.assign(d, { neg: false })));
        const USER = X([
            { p: 'system-view', run: () => { S.view = 'sys'; S.vx = {}; return 'Enter system view, return user view with Ctrl+Z.'; } },
            { p: 'reboot', run: cmdReboot },
        ].concat(ALLV));
        const RET = { p: 'return', run: () => { S.view = 'user'; S.vx = {}; }, neg: false };
        const SYS = X([
            { p: 'sysname !WORD$n', run: a => { if (a.n.length > 246) return pErr(8); M().sysname = a.n; }, undo: () => { M().sysname = M().defName; } },
            { p: 'vlan batch VLANS$l', sw: 1, run: vlanBatch, undo: vlanBatchUndo },
            { p: 'vlan (1-4094)$v', sw: 1, run: a => { if (M().vlans[a.v] === undefined) M().vlans[a.v] = null; S.view = 'vlan'; S.vx = { vlan: a.v }; }, undo: a => vlanDel([a.v]) },
            { p: 'interface IFNAME$if', run: a => { ensureIf(a.if); S.view = 'if'; S.vx = { if: a.if }; }, undo: a => ifDel(a.if) },
            { p: 'ip route-static A.B.C.D$net MASKLEN$m A.B.C.D$nh', run: routeAdd, undo: routeDel },
            { p: 'ip route-static A.B.C.D$net MASKLEN$m A.B.C.D$nh preference (1-255)$pref', run: routeAdd, neg: false },
            { p: 'ip route-static A.B.C.D$net MASKLEN$m', noOnly: 1, undo: routeDel },
            { p: 'ospf [(1-65535)$pid]', run: ospfEnter, undo: ospfUndo },
            { p: 'ospf [(1-65535)$pid] router-id A.B.C.D$rid', run: ospfEnter, neg: false },
            { p: 'aaa', run: () => { S.view = 'aaa'; S.vx = {}; }, neg: false },
            { p: 'user-interface vty (0-4)$a [(0-4)$b]', run: a => { S.view = 'vty'; S.vx = { vty: a.a + (a.b !== undefined && a.b !== a.a ? ' ' + a.b : '') }; }, neg: false },
            { p: 'acl [number] (2000-3999)$n', run: a => { const m = M(); if (!m.acls[a.n]) m.acls[a.n] = { rules: [] }; S.view = 'acl'; S.vx = { acl: a.n }; }, undo: a => { delete M().acls[a.n]; } },
            { p: 'stelnet server enable', run: () => { M().stelnet = true; }, undo: () => { M().stelnet = false; } },
            { p: 'ssh user WORD$u authentication-type password', run: a => { sshU(a.u).auth = 'password'; }, neg: false },
            { p: 'ssh user WORD$u service-type <stelnet|all>$t', run: a => { sshU(a.u).svc = a.t; }, neg: false },
            { p: 'ssh user WORD$u', noOnly: 1, undo: a => { delete M().sshUsers[a.u]; } },
            { p: 'rsa local-key-pair create', run: () => { M().rsa = true; return '# [Simülatör] RSA anahtar çifti oluşturuldu (2048 bit). Gerçek cihaz anahtar adını gösterir ve uzunluğu sorar.'; }, neg: false },
        ].concat(ALLV, [RET]));
        const IFC = [
            { p: 'description !LINE$d', run: a => { curIf().desc = a.d.slice(0, 242); }, undo: () => { curIf().desc = ''; } },
            { p: 'shutdown', run: () => { curIf().shutdown = true; }, undo: () => { curIf().shutdown = false; } },
            { p: 'port link-type <access|trunk|hybrid>$t', l2: 1, run: linkType, undo: () => linkType({ t: 'hybrid' }, true) },
            { p: 'port link-type', l2: 1, noOnly: 1, undo: () => linkType({ t: 'hybrid' }, true) },
            { p: 'port default vlan !(1-4094)$v', l2: 1, run: portDefault, undo: () => { curIf().pvid = 1; } },
            { p: 'port trunk allow-pass vlan VLANS$l', l2: 1, run: a => allowPass(a, false), undo: a => allowPass(a, true) },
            { p: 'port trunk pvid vlan !(1-4094)$v', l2: 1, run: trunkPvid, undo: () => { curIf().pvid = 1; } },
            { p: 'eth-trunk !(0-63)$n', ethm: 1, run: etJoin, undo: () => { curIf().et = null; } },
            { p: 'mode <lacp|lacp-static>$m', eth: 1, run: a => { curIf().etMode = a.m; }, undo: () => { curIf().etMode = 'manual'; } },
            { p: 'mode manual load-balance', eth: 1, run: () => { curIf().etMode = 'manual'; }, neg: false },
            { p: 'ip address A.B.C.D$ip MASKLEN$m', l3: 1, run: ipAddr, undo: () => { curIf().ip = null; curIf().mask = null; } },
            { p: 'ip address', l3: 1, noOnly: 1, undo: () => { curIf().ip = null; curIf().mask = null; } },
            { p: 'traffic-filter <inbound|outbound>$d acl (2000-3999)$n', tf: 1, run: a => { curIf()[a.d === 'inbound' ? 'tfIn' : 'tfOut'] = a.n; }, undo: a => { const i = curIf(); if (a.d === 'inbound') i.tfIn = null; else i.tfOut = null; } },
            { p: 'traffic-filter <inbound|outbound>$d', tf: 1, noOnly: 1, undo: a => { const i = curIf(); if (a.d === 'inbound') i.tfIn = null; else i.tfOut = null; } },
        ];
        const IFV = X(IFC.concat(ALLV, [RET]));
        const VLANV = X([
            { p: 'description !LINE$d', run: a => { M().vlans[S.vx.vlan] = a.d.slice(0, 80); }, undo: () => { M().vlans[S.vx.vlan] = null; } },
        ].concat(ALLV, [RET]));
        const OSPFV = X([
            { p: 'area AREA$a', run: a => { const o = osp(), k = areaNorm(a.a); if (!o.areas[k]) o.areas[k] = []; S.view = 'area'; S.vx = { pid: S.vx.pid, area: k }; }, undo: a => { delete osp().areas[areaNorm(a.a)]; } },
            { p: 'silent-interface IFNAME$i', run: a => { const o = osp(); if (!o.silent.includes(a.i)) o.silent.push(a.i); }, undo: a => { const o = osp(); o.silent = o.silent.filter(x => x !== a.i); } },
            { p: 'silent-interface all', run: () => { osp().silentAll = true; }, undo: () => { osp().silentAll = false; } },
        ].concat(ALLV, [RET]));
        const AREAV = X([
            { p: 'network A.B.C.D$n WILD$w', run: a => { const l = osp().areas[S.vx.area]; const w = wildNorm(a.w); if (!l.some(x => x.n === a.n && x.w === w)) l.push({ n: a.n, w }); },
              undo: a => { const o = osp(); const w = wildNorm(a.w); const before = o.areas[S.vx.area].length; o.areas[S.vx.area] = o.areas[S.vx.area].filter(x => !(x.n === a.n && x.w === w)); if (before === o.areas[S.vx.area].length) return simErr('Bu alanda böyle bir network satırı yok.'); } },
        ].concat(ALLV, [RET]));
        const AAAV = X([
            { p: 'local-user WORD$u password irreversible-cipher WORD$pw', run: a => { luser(a.u).pw = a.pw; }, neg: false },
            { p: 'local-user WORD$u privilege level (0-15)$l', run: a => { luser(a.u).level = a.l; }, neg: false },
            { p: 'local-user WORD$u service-type LINE$t', run: svcType, neg: false, vh: 'Servis tipleri (boşlukla): ssh telnet terminal http ftp' },
            { p: 'local-user WORD$u', noOnly: 1, undo: a => { if (!M().users[a.u]) return simErr('Böyle bir yerel kullanıcı yok.'); delete M().users[a.u]; } },
        ].concat(ALLV, [RET]));
        const VTYV = X([
            { p: 'authentication-mode <aaa|password|none>$m', run: a => { M().vty.auth = a.m; }, neg: false },
            { p: 'protocol inbound <ssh|telnet|all>$p', run: a => { if (a.p !== 'telnet' && M().vty.auth !== 'aaa') return simErr('SSH girişine izin vermeden önce bu hatta authentication-mode aaa yapılandırılmalı.'); M().vty.proto = a.p; }, undo: () => { M().vty.proto = null; } },
            { p: 'user privilege level (0-15)$l', run: a => { M().vty.level = a.l; }, undo: () => { M().vty.level = null; } },
            { p: 'idle-timeout (0-35791)$m [(0-59)$s]', run: a => { M().vty.idle = a.m + ' ' + (a.s || 0); }, undo: () => { M().vty.idle = null; } },
        ].concat(ALLV, [RET]));
        // ACL kuralları: kaynak/hedef/port birleşimleri (VRP sırası: source → destination → destination-port)
        const SRC = ['', 'source any', 'source A.B.C.D$s WILD$sw'], DST = ['', 'destination any', 'destination A.B.C.D$d WILD$dw'];
        const ADV = [], BAS = [];
        for (const s of SRC) for (const d of DST) {
            ADV.push({ p: ('rule [(0-4294967294)$id] <permit|deny>$act <ip|icmp>$pr ' + s + ' ' + d).trim(), run: ruleAdd, neg: false });
            for (const dp of ['', 'destination-port eq (0-65535)$dp']) ADV.push({ p: ('rule [(0-4294967294)$id] <permit|deny>$act <tcp|udp>$pr ' + s + ' ' + d + ' ' + dp).trim(), run: ruleAdd, neg: false });
        }
        for (const s of SRC) BAS.push({ p: ('rule [(0-4294967294)$id] <permit|deny>$act ' + s).trim(), run: ruleAdd, neg: false });
        const RULEUNDO = { p: 'rule (0-4294967294)$id', noOnly: 1, undo: a => { const L = M().acls[S.vx.acl].rules, k = L.findIndex(r => r.id === a.id); if (k < 0) return simErr('Böyle bir kural yok.'); L.splice(k, 1); } };
        const ACLADV = X(ADV.concat([RULEUNDO], ALLV, [RET]));
        const ACLBAS = X(BAS.concat([RULEUNDO], ALLV, [RET]));
        const VIEWS = { user: USER, sys: SYS, if: IFV, vlan: VLANV, ospf: OSPFV, area: AREAV, aaa: AAAV, vty: VTYV };
        const viewList = () => S.view === 'acl' ? (S.vx.acl >= 3000 ? ACLADV : ACLBAS) : VIEWS[S.view];
        const osp = () => M().ospf[S.vx.pid];

        function avail(list, undoForm) {
            return list.filter(c => {
                if (c.sw && !M().sw) return false;
                if (undoForm ? (c.neg === false || !c.undo) : c.noOnly) return false;
                if (S.view === 'if') {
                    const n = S.vx.if, sw = M().sw;
                    if (c.l2 && !(sw && (isPhys(n) || n.startsWith('Eth-Trunk')))) return false;
                    if (c.l3 && !((!sw && isPhys(n)) || /^(Vlanif|LoopBack)/.test(n))) return false;
                    if (c.ethm && !(sw && isPhys(n))) return false;
                    if (c.eth && !n.startsWith('Eth-Trunk')) return false;
                    if (c.tf && !(isPhys(n) || n.startsWith('Vlanif'))) return false;
                    if (n === 'NULL0' && IFC.includes(c) && !/^description/.test(c.p)) return false;
                }
                return true;
            });
        }

        // ── yardımcı komut işlevleri
        function cmdQuit() {
            const up = { if: 'sys', vlan: 'sys', ospf: 'sys', aaa: 'sys', vty: 'sys', acl: 'sys', area: 'ospf', sys: 'user' }[S.view];
            if (S.view === 'user') { S.loggedOut = true; return '  Configuration console exit, please press any key to log on'; }
            S.vx = up === 'ospf' ? { pid: S.vx.pid } : {};
            S.view = up;
        }
        function cmdSave() {
            const m = M();
            if (m.sw) {
                S.pending = { prompt: 'Are you sure to continue?[Y/N]', fn: x => { if (/^y/i.test(x)) { save(); return 'Now saving the current configuration to the slot 0.\nSave the configuration successfully.'; } return ''; } };
                return 'The current configuration will be written to the device.';
            }
            S.pending = { prompt: '  Are you sure to continue? (y/n)[n]:', fn: x => { if (/^y/i.test(x)) { save(); return '  It will take several minutes to save configuration file, please wait......\n  Configuration file had been saved successfully\n  Note: The configuration file will take effect after being activated'; } return ''; } };
            return '  The current configuration will be written to the device. ';
        }
        function cmdReboot() {
            const go = () => {
                S.pending = { prompt: '[Simülatör] Cihaz yeniden başlatılsın mı? [Y/N]:', fn: x => {
                    if (!/^y/i.test(x)) return '';
                    S.m = S.saved ? clone(S.saved) : baseModel(S.lab);
                    S.view = 'user'; S.vx = {}; S.loggedOut = true;
                    return '[Simülatör] Cihaz yeniden başlatıldı; kaydedilmiş yapılandırma yüklendi.\n\nPress any key to get started';
                } };
                return '';
            };
            if (!isSaved()) {
                S.pending = { prompt: '[Simülatör] Yapılandırma değişti ve kaydedilmedi. Şimdi kaydedilsin mi? [Y/N]:', fn: x => { if (/^y/i.test(x)) save(); return go(); } };
                return '';
            }
            return go();
        }
        function vlanBatch(a) {
            const r = vlansParse(a.l);
            if (r.list === undefined) return pErr(S.restAt + (r.bad >= 0 ? tokOff(a.l, r.bad) : a.l.length + 1), r.bad >= 0 ? 'value' : 'incomplete');
            r.list.forEach(v => { if (M().vlans[v] === undefined) M().vlans[v] = null; });
            return 'Info: This operation may take a few seconds. Please wait for a moment...done.';
        }
        function vlanBatchUndo(a) {
            const r = vlansParse(a.l);
            if (r.list === undefined) return pErr(S.restAt + (r.bad >= 0 ? tokOff(a.l, r.bad) : a.l.length + 1), r.bad >= 0 ? 'value' : 'incomplete');
            return vlanDel(r.list, true);
        }
        function vlanDel(list, batch) {
            const m = M();
            if (list.includes(1)) return simErr('VLAN 1 varsayılan VLAN\'dır, silinemez.');
            list.forEach(v => { delete m.vlans[v]; });
            if (batch) return 'Info: This operation may take a few seconds. Please wait for a moment...done.';
        }
        const tokOff = (s, k) => { const t = C.tokenize(s); return t[k] ? t[k].o : s.length; };
        function ifDel(n) {
            if (isPhys(n) || n === 'NULL0' || n === 'Vlanif1') return simErr('Fiziksel arayüz, NULL0 ve Vlanif1 silinemez.');
            if (!M().ifs[n]) return simErr('Böyle bir arayüz yok.');
            if (n.startsWith('Eth-Trunk')) Object.values(M().ifs).forEach(i => { if (i.et === ifNums(n)[0]) i.et = null; });
            delete M().ifs[n];
        }
        function sshU(u) { return M().sshUsers[u] || (M().sshUsers[u] = { auth: null, svc: null }); }
        function luser(u) { return M().users[u] || (M().users[u] = { pw: null, level: null, svc: [] }); }
        function svcType(a) {
            const w = a.t.split(/\s+/).map(x => x.toLowerCase()), ok = ['ssh', 'telnet', 'terminal', 'http', 'ftp'];
            const full = [];
            for (const x of w) { const h = ok.filter(o => o.startsWith(x)); if (h.length !== 1) return pErr(S.restAt + tokOff(a.t, w.indexOf(x)), h.length ? 'amb' : 'value'); full.push(h[0]); }
            luser(a.u).svc = [...new Set(full)];
        }
        function routeAdd(a) {
            const len = maskLen(a.m) >= 0 ? maskLen(a.m) : +a.m;
            if (netOf(a.net, len) !== ip2n(a.net)) return simErr('Hedef adres maskeyle uyumlu değil: ağ adresini yazın (ör. ' + n2ip(netOf(a.net, len)) + ').');
            const pref = a.pref || 60;
            M().routes = M().routes.filter(r => !(r.net === a.net && r.len === len && r.nh === a.nh));
            M().routes.push({ net: a.net, len, nh: a.nh, pref });
        }
        function routeDel(a) {
            const len = maskLen(a.m) >= 0 ? maskLen(a.m) : +a.m;
            const before = M().routes.length;
            M().routes = M().routes.filter(r => !(r.net === a.net && r.len === len && (a.nh === undefined || r.nh === a.nh)));
            if (before === M().routes.length) return simErr('Böyle bir statik rota yok.');
        }
        function ospfEnter(a) {
            const pid = a.pid || 1, m = M();
            if (!m.ospf[pid]) m.ospf[pid] = { rid: a.rid || null, areas: {}, silent: [], silentAll: false };
            else if (a.rid && m.ospf[pid].rid !== a.rid) { m.ospf[pid].rid = a.rid; S.view = 'ospf'; S.vx = { pid }; return '# [Simülatör] Router-id değişti. Gerçek cihazda yeni kimlik OSPF süreci yeniden başlatılınca (reset ospf process) geçerli olur; bu simülatörde hemen uygulanır.'; }
            S.view = 'ospf'; S.vx = { pid };
        }
        function ospfUndo(a) {
            const pid = a.pid || 1;
            if (!M().ospf[pid]) return simErr('OSPF süreci ' + pid + ' yok.');
            S.pending = { prompt: 'Warning: The OSPF process will be deleted. Continue? [Y/N]:', fn: x => { if (/^y/i.test(x)) delete M().ospf[pid]; return ''; } };
            return '';
        }
        function linkType(a, undo) {
            const i = curIf();
            const dflt = i.pvid === 1 && (i.lt !== 'trunk' || (i.allow.length === 1 && i.allow[0] === 1));
            if (i.lt === a.t) return;
            if (!dflt) return 'Error: Please renew the default configurations.';
            i.lt = a.t; i.pvid = 1; i.allow = [1];
            if (undo) i.lt = 'hybrid';
        }
        function needVlan(v) { return M().vlans[v] === undefined; }
        function portDefault(a) {
            const i = curIf();
            if (i.lt !== 'access') return { err: 'invalid', col: colTok(1) };
            if (needVlan(a.v)) return simErr('VLAN ' + a.v + ' yok. Önce "vlan batch ' + a.v + '" ile oluşturun.');
            i.pvid = a.v;
        }
        function allowPass(a, undo) {
            const i = curIf();
            if (i.lt !== 'trunk') return { err: 'invalid', col: colTok(1) };
            const r = vlansParse(a.l, true);
            if (r.list === undefined) return pErr(S.restAt + (r.bad >= 0 ? tokOff(a.l, r.bad) : a.l.length + 1), r.bad >= 0 ? 'value' : 'incomplete');
            if (undo) { i.allow = i.allow.filter(v => !r.list.includes(v)); return; }
            i.allow = [...new Set(i.allow.concat(r.list))].sort((x, y) => x - y);
        }
        function trunkPvid(a) {
            const i = curIf();
            if (i.lt !== 'trunk') return { err: 'invalid', col: colTok(1) };
            if (needVlan(a.v)) return simErr('VLAN ' + a.v + ' yok. Önce "vlan batch ' + a.v + '" ile oluşturun.');
            i.pvid = a.v;
        }
        function etJoin(a) {
            const i = curIf();
            if (i.lt !== 'hybrid' || i.pvid !== 1 || i.desc) return simErr('Porta başka yapılandırma uygulanmış; Eth-Trunk üyesi yapmadan önce port varsayılana döndürülmeli.');
            ensureIf('Eth-Trunk' + a.n);
            i.et = a.n;
        }
        function ipAddr(a) {
            const len = maskLen(a.m) >= 0 ? maskLen(a.m) : +a.m, m = M();
            if (len < 8 || len > 32) return pErr(colTok(3), 'value');
            if (len < 31 && (netOf(a.ip, len) === ip2n(a.ip) || netOf(a.ip, len) + 2 ** (32 - len) - 1 === ip2n(a.ip))) return simErr(a.ip + '/' + len + ' bir ağ ya da yayın adresi; bir host adresi girin.');
            for (const [n, i] of Object.entries(m.ifs)) {
                if (n === S.vx.if || !i.ip) continue;
                if (sameNet(i.ip, a.ip, Math.min(len, maskLen(i.mask)))) return simErr(a.ip + '/' + len + ', ' + n + ' arayüzünün alt ağıyla çakışıyor.');
            }
            const i = curIf(); i.ip = a.ip; i.mask = lenMask(len);
        }
        function ruleAdd(a) {
            const A = M().acls[S.vx.acl];
            let id = a.id;
            if (id === undefined) { const mx = A.rules.reduce((x, r) => Math.max(x, r.id), 0); id = A.rules.length ? Math.ceil((mx + 1) / 5) * 5 : 5; }
            const r = { id, act: a.act, pr: a.pr || null, src: a.s ? [a.s, wildNorm(a.sw)] : null, dst: a.d ? [a.d, wildNorm(a.dw)] : null, dp: a.dp !== undefined ? a.dp : null };
            A.rules = A.rules.filter(x => x.id !== id).concat([r]).sort((x, y) => x.id - y.id);
        }

        // ── durum sorguları
        const vlanOnPort = (i, v) => i.lt === 'access' ? i.pvid === v : i.lt === 'trunk' ? (i.allow.includes(v) || i.pvid === v) : i.lt === 'hybrid' ? v === 1 : false;
        const etMembers = n => Object.keys(M().ifs).filter(k => isPhys(k) && M().ifs[k].et === n).sort(ifCmp);
        const physUp = n => !!M().ifs[n] && !M().ifs[n].shutdown && !!M().links[n];
        function ifUp(n) {
            const m = M(), i = m.ifs[n];
            if (!i || i.shutdown) return false;
            if (isPhys(n)) return !!m.links[n];
            if (n === 'NULL0' || n.startsWith('LoopBack')) return true;
            if (n.startsWith('Eth-Trunk')) return etMembers(ifNums(n)[0]).some(physUp);
            if (n.startsWith('Vlanif')) {
                const v = ifNums(n)[0];
                if (m.vlans[v] === undefined) return false;
                return Object.keys(m.ifs).some(k => {
                    const j = m.ifs[k];
                    if (isPhys(k) && j.et === null) return physUp(k) && vlanOnPort(j, v);
                    if (k.startsWith('Eth-Trunk')) return ifUp(k) && vlanOnPort(j, v);
                    return false;
                });
            }
            return false;
        }
        const l3Up = n => ifUp(n) && !!M().ifs[n].ip;
        function isSaved() { return !!S.saved && JSON.stringify(S.saved) === JSON.stringify(M()); }
        function save() { S.saved = clone(M()); }

        // OSPF: sanal komşu (lab.peer) ile komşuluk hesabı
        function ospfIfArea(m, n) {
            const i = m.ifs[n];
            if (!i || !i.ip) return null;
            for (const [pid, o] of Object.entries(m.ospf)) for (const [ar, nets] of Object.entries(o.areas)) if (nets.some(x => wildMatch(i.ip, x.n, x.w))) return { pid: +pid, area: ar, o };
            return null;
        }
        function ridOf(o) {
            if (o.rid) return o.rid;
            const ips = Object.entries(M().ifs).filter(([n, i]) => i.ip && ifUp(n)).map(([n, i]) => i.ip).sort((a, b) => ip2n(b) - ip2n(a));
            return ips[0] || '0.0.0.0';
        }
        function peerState() {
            const m = M(), P = PEER;
            if (!P.ifn || !P.ip) return null;
            const i = m.ifs[P.ifn];
            if (!i || !i.ip || !l3Up(P.ifn) || !sameNet(i.ip, P.ip, maskLen(i.mask))) return null;
            const r = ospfIfArea(m, P.ifn);
            if (!r || r.area !== (P.area || '0.0.0.0')) return null;
            if (r.o.silentAll || r.o.silent.includes(P.ifn)) return null;
            if (ridOf(r.o) === P.rid) return null;
            return { pid: r.pid, area: r.area, rid: P.rid, ifn: P.ifn, ip: P.ip, state: 'Full', o: r.o };
        }
        function rib() {
            const m = M(), R = [];
            for (const [n, i] of Object.entries(m.ifs)) {
                if (!i.ip || !l3Up(n)) continue;
                const len = maskLen(i.mask), net = n2ip(netOf(i.ip, len));
                R.push({ net, len, proto: 'Direct', pre: 0, cost: 0, fl: 'D', nh: i.ip, ifn: n });
                R.push({ net: i.ip, len: 32, proto: 'Direct', pre: 0, cost: 0, fl: 'D', nh: '127.0.0.1', ifn: n });
                if (len < 31) R.push({ net: n2ip(netOf(i.ip, len) + 2 ** (32 - len) - 1), len: 32, proto: 'Direct', pre: 0, cost: 0, fl: 'D', nh: '127.0.0.1', ifn: n });
            }
            [['127.0.0.0', 8], ['127.0.0.1', 32], ['127.255.255.255', 32], ['255.255.255.255', 32]].forEach(([net, len]) => R.push({ net, len, proto: 'Direct', pre: 0, cost: 0, fl: 'D', nh: '127.0.0.1', ifn: 'InLoopBack0' }));
            const conn = R.filter(r => r.proto === 'Direct' && r.len < 32);
            const cand = [];
            for (const r of m.routes) {
                const c = conn.find(x => sameNet(x.net, r.nh, x.len));
                if (c) cand.push({ net: r.net, len: r.len, proto: 'Static', pre: r.pref, cost: 0, fl: 'RD', nh: r.nh, ifn: c.ifn });
            }
            const ps = peerState();
            if (ps) (PEER.routes || []).forEach(([net, len, cost]) => cand.push({ net, len, proto: 'OSPF', pre: 10, cost: (cost || 1) + 1, fl: 'D', nh: PEER.ip, ifn: PEER.ifn }));
            for (const c of cand) {
                if (R.some(x => x.net === c.net && x.len === c.len && x.proto === 'Direct')) continue;
                const same = R.findIndex(x => x.net === c.net && x.len === c.len);
                if (same >= 0) { if (R[same].pre <= c.pre) continue; R.splice(same, 1); }
                R.push(c);
            }
            return R.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }
        function lookup(ip) { return rib().filter(r => sameNet(r.net, ip, r.len) && r.ifn !== 'InLoopBack0').sort((a, b) => b.len - a.len)[0] || null; }
        // ACL karar: traffic-filter (eşleşme yoksa izin)
        function aclMatch(r, f) {
            if (r.pr && r.pr !== 'ip' && r.pr !== f.proto) return false;
            if (r.src && !wildMatch(f.src, r.src[0], r.src[1])) return false;
            if (r.dst && f.dst && !wildMatch(f.dst, r.dst[0], r.dst[1])) return false;
            if (r.dst && !f.dst) return false;
            if (r.dp !== null && r.dp !== f.dport) return false;
            return true;
        }
        function decide(f) {
            const m = M(), i = m.ifs[f.in];
            const acl = i && i.tfIn && m.acls[i.tfIn];
            if (!acl) return 'permit';
            const hit = acl.rules.find(r => aclMatch(r, f));
            return hit ? hit.act : 'permit';
        }

        // ═══ display çıktıları ════════════════════════════════════════════════
        function ifBlock(m, n) {
            const i = m.ifs[n], L = ['interface ' + n];
            if (i.desc) L.push(' description ' + i.desc);
            if (i.shutdown) L.push(' shutdown');
            if (n.startsWith('Eth-Trunk') && i.etMode !== 'manual') L.push(' mode ' + i.etMode);
            if (i.lt && i.lt !== 'hybrid') L.push(' port link-type ' + i.lt);
            if (i.lt === 'access' && i.pvid !== 1) L.push(' port default vlan ' + i.pvid);
            if (i.lt === 'trunk') {
                if (i.pvid !== 1) L.push(' port trunk pvid vlan ' + i.pvid);
                const al = i.allow.filter(v => v !== 1);
                if (i.allow.length === 4094) L.push(' port trunk allow-pass vlan 2 to 4094');
                else if (al.length) L.push(' port trunk allow-pass vlan ' + vlansText(al));
                if (!i.allow.includes(1)) L.push(' undo port trunk allow-pass vlan 1');
            }
            if (i.et !== null) L.push(' eth-trunk ' + i.et);
            if (i.ip) L.push(' ip address ' + i.ip + ' ' + i.mask);
            if (i.tfIn) L.push(' traffic-filter inbound acl ' + i.tfIn);
            if (i.tfOut) L.push(' traffic-filter outbound acl ' + i.tfOut);
            return L;
        }
        function runBody(m) {
            const L = ['#', 'sysname ' + m.sysname, '#'];
            const vl = Object.keys(m.vlans).map(Number).filter(v => v !== 1).sort((a, b) => a - b);
            if (m.sw && vl.length) L.push('vlan batch ' + vlansText(vl), '#');
            vl.filter(v => m.vlans[v]).forEach(v => L.push('vlan ' + v, ' description ' + m.vlans[v], '#'));
            for (const n of Object.keys(m.acls).map(Number).sort((a, b) => a - b)) {
                L.push('acl number ' + n);
                m.acls[n].rules.forEach(r => L.push(' ' + ruleText(r)));
                L.push('#');
            }
            L.push('aaa', ' authentication-scheme default', ' authorization-scheme default', ' accounting-scheme default', ' domain default', ' domain default_admin');
            for (const [u, x] of Object.entries(m.users)) {
                if (x.pw) L.push(' local-user ' + u + ' password irreversible-cipher $1a$' + fakeHash(u + x.pw, 40) + '$');
                if (x.level !== null) L.push(' local-user ' + u + ' privilege level ' + x.level);
                if (x.svc.length) L.push(' local-user ' + u + ' service-type ' + x.svc.join(' '));
            }
            L.push('#');
            for (const n of Object.keys(m.ifs).sort(ifCmp)) { L.push(...ifBlock(m, n)); L.push('#'); }
            for (const [pid, o] of Object.entries(m.ospf)) {
                L.push('ospf ' + pid + (o.rid ? ' router-id ' + o.rid : ''));
                if (o.silentAll) L.push(' silent-interface all');
                o.silent.forEach(s => L.push(' silent-interface ' + s));
                for (const [ar, nets] of Object.entries(o.areas).sort((a, b) => ip2n(a[0]) - ip2n(b[0]))) { L.push(' area ' + ar); nets.forEach(x => L.push('  network ' + x.n + ' ' + x.w)); }
                L.push('#');
            }
            if (m.routes.length) { m.routes.forEach(r => L.push('ip route-static ' + r.net + ' ' + lenMask(r.len) + ' ' + r.nh + (r.pref !== 60 ? ' preference ' + r.pref : ''))); L.push('#'); }
            const sshL = [];
            if (m.stelnet) sshL.push('stelnet server enable');
            for (const [u, x] of Object.entries(m.sshUsers)) { if (x.auth) sshL.push('ssh user ' + u + ' authentication-type ' + x.auth); if (x.svc) sshL.push('ssh user ' + u + ' service-type ' + x.svc); }
            if (sshL.length) L.push(...sshL, '#');
            L.push('user-interface con 0', 'user-interface vty 0 4');
            if (m.vty.auth) L.push(' authentication-mode ' + m.vty.auth);
            if (m.vty.level !== null) L.push(' user privilege level ' + m.vty.level);
            if (m.vty.idle) L.push(' idle-timeout ' + m.vty.idle);
            if (m.vty.proto) L.push(' protocol inbound ' + m.vty.proto);
            L.push('#', 'return');
            return L.join('\n');
        }
        function ruleText(r) {
            let s = 'rule ' + r.id + ' ' + r.act + (r.pr ? ' ' + r.pr : '');
            if (r.src) s += ' source ' + r.src[0] + ' ' + (r.src[1] === '0.0.0.0' ? '0' : r.src[1]);
            if (r.dst) s += ' destination ' + r.dst[0] + ' ' + (r.dst[1] === '0.0.0.0' ? '0' : r.dst[1]);
            if (r.dp !== null) s += ' destination-port eq ' + (PORTN[r.dp] || r.dp);
            return s;
        }
        const curText = () => runBody(M());
        function ifBlockText(n) { if (!M().ifs[n]) return '# [Simülatör] Böyle bir arayüz yok.'; return ['#'].concat(ifBlock(M(), n), ['#', 'return']).join('\n'); }
        function thisText() {
            const m = M(), v = S.view;
            let L = [];
            if (v === 'if') L = ifBlock(m, S.vx.if);
            else if (v === 'vlan') { L = ['vlan ' + S.vx.vlan]; if (m.vlans[S.vx.vlan]) L.push(' description ' + m.vlans[S.vx.vlan]); }
            else if (v === 'ospf' || v === 'area') { const o = osp(); L = ['ospf ' + S.vx.pid + (o.rid ? ' router-id ' + o.rid : '')]; o.silent.forEach(s => L.push(' silent-interface ' + s)); for (const [ar, nets] of Object.entries(o.areas)) { L.push(' area ' + ar); nets.forEach(x => L.push('  network ' + x.n + ' ' + x.w)); } }
            else if (v === 'acl') { L = ['acl number ' + S.vx.acl]; m.acls[S.vx.acl].rules.forEach(r => L.push(' ' + ruleText(r))); }
            else if (v === 'vty') { L = ['user-interface vty 0 4']; if (m.vty.auth) L.push(' authentication-mode ' + m.vty.auth); if (m.vty.level !== null) L.push(' user privilege level ' + m.vty.level); if (m.vty.idle) L.push(' idle-timeout ' + m.vty.idle); if (m.vty.proto) L.push(' protocol inbound ' + m.vty.proto); }
            else if (v === 'aaa') { L = ['aaa']; for (const [u, x] of Object.entries(m.users)) { if (x.pw) L.push(' local-user ' + u + ' password irreversible-cipher $1a$' + fakeHash(u + x.pw, 40) + '$'); if (x.level !== null) L.push(' local-user ' + u + ' privilege level ' + x.level); if (x.svc.length) L.push(' local-user ' + u + ' service-type ' + x.svc.join(' ')); } }
            else if (v === 'sys') return curText();
            else return '# [Simülatör] display this yalnız bir yapılandırma görünümünde anlamlıdır (önce system-view).';
            return ['#'].concat(L, ['#', 'return']).join('\n');
        }
        function showVersion() {
            const m = M();
            return ['Huawei Versatile Routing Platform Software',
                'VRP (R) software, Version 5.170 (' + (m.sw ? 'S5700' : 'AR2220') + ' V200R019C10) — Config Generator CLI Lab eğitim simülatörü (gerçek cihaz değildir)',
                (m.sw ? 'HUAWEI S5700-28C-SIM Routing Switch' : 'Huawei AR2220-SIM Router') + ' uptime is 0 week, 0 day, 0 hour, 12 minutes'].join('\n');
        }
        function showVlan(only) {
            const m = M();
            const vids = (only ? [only] : Object.keys(m.vlans).map(Number)).sort((a, b) => a - b);
            const L = [];
            if (!only) L.push('The total number of VLANs is: ' + Object.keys(m.vlans).length);
            L.push('-'.repeat(80), 'U: Up;         D: Down;         TG: Tagged;         UT: Untagged;', 'MP: Vlan-mapping;               ST: Vlan-stacking;',
                '#: ProtocolTransparent-vlan;    *: Management-vlan;', '-'.repeat(80), '', 'VID  Type    Ports', '-'.repeat(80));
            const ports = Object.keys(m.ifs).filter(k => (isPhys(k) && m.ifs[k].et === null) || k.startsWith('Eth-Trunk')).sort(ifCmp);
            for (const v of vids) {
                const ut = [], tg = [];
                for (const k of ports) {
                    const i = m.ifs[k];
                    if (!vlanOnPort(i, v)) continue;
                    const tag = i.lt === 'trunk' && i.pvid !== v;
                    (tag ? tg : ut).push(ifShort(k) + '(' + (ifUp(k) ? 'U' : 'D') + ')');
                }
                const head = pad(v, 5) + pad('common', 8);
                let first = true;
                const emit = (pre, list) => {
                    for (let k = 0; k < list.length; k += 4) {
                        const chunk = list.slice(k, k + 4).map(x => pad(x, 16)).join('').replace(/\s+$/, '');
                        L.push((first ? head : ' '.repeat(13)) + (k === 0 ? pre : '   ') + chunk);
                        first = false;
                    }
                };
                emit('UT:', ut); emit('TG:', tg);
                if (first) L.push(head.replace(/\s+$/, ''));
            }
            L.push('', 'VID  Status  Property      MAC-LRN Statistics Description', '-'.repeat(80));
            for (const v of vids) L.push(pad(v, 5) + pad('enable', 8) + pad('default', 14) + pad('enable', 8) + pad('disable', 11) + (m.vlans[v] || 'VLAN ' + String(v).padStart(4, '0')));
            return L.join('\n');
        }
        function showPortVlan() {
            const m = M();
            const L = ['Port                        Link Type    PVID  Trunk VLAN List', '-'.repeat(79)];
            for (const k of Object.keys(m.ifs).filter(n => (isPhys(n) && m.ifs[n].et === null) || n.startsWith('Eth-Trunk')).sort(ifCmp)) {
                const i = m.ifs[k];
                L.push(pad(k, 28) + pad(i.lt, 13) + pad(i.pvid, 6) + (i.lt === 'trunk' ? (i.allow.length ? vlansDash(i.allow) : '-') : '-'));
            }
            return L.join('\n');
        }
        function showIfBrief() {
            const m = M();
            const L = ['PHY: Physical', '*down: administratively down', '^down: standby', '(l): loopback', '(s): spoofing', '(b): BFD down', '(e): ETHOAM down', '(d): Dampening Suppressed',
                'InUti/OutUti: input utility/output utility', 'Interface                   PHY   Protocol  InUti OutUti   inErrors  outErrors'];
            const row = (n, ind) => {
                const i = m.ifs[n], up = ifUp(n);
                const phy = i.shutdown ? '*down' : up ? 'up' : 'down';
                let pr;
                if (n === 'NULL0') pr = 'up(s)';
                else if (isPhys(n) && m.sw && i.et === null) pr = up ? 'up' : 'down';
                else if (n.startsWith('Eth-Trunk') || (isPhys(n) && m.sw)) pr = up ? 'up' : 'down';
                else pr = up && i.ip ? 'up' : 'down';
                const uti = isPhys(n) || n.startsWith('Eth-Trunk') ? padL('0%', 5) + padL('0%', 7) : padL('--', 5) + padL('--', 7);
                return pad((ind ? '  ' : '') + n, 28) + pad(phy, 6) + pad(pr, 10) + uti + padL('0', 11) + padL('0', 11);
            };
            for (const n of Object.keys(m.ifs).sort(ifCmp)) {
                if (isPhys(n) && m.ifs[n].et !== null) continue;
                L.push(row(n));
                if (n.startsWith('Eth-Trunk')) etMembers(ifNums(n)[0]).forEach(k => L.push(row(k, true)));
            }
            return L.join('\n');
        }
        function showIpIfBrief() {
            const m = M();
            const names = Object.keys(m.ifs).filter(n => m.sw ? /^(Vlanif|LoopBack|NULL)/.test(n) : !n.startsWith('Eth-Trunk')).sort(ifCmp);
            const st = names.map(n => {
                const i = m.ifs[n], up = ifUp(n);
                const phy = i.shutdown ? '*down' : up ? 'up' : 'down';
                const pr = n === 'NULL0' ? 'up(s)' : (up && i.ip ? 'up' : 'down');
                return [n, i.ip ? i.ip + '/' + maskLen(i.mask) : 'unassigned', phy, pr];
            });
            const cnt = (k, re) => st.filter(x => re.test(x[k])).length;
            const L = ['*down: administratively down', '^down: standby', '(l): loopback', '(s): spoofing',
                'The number of interface that is UP in Physical is ' + cnt(2, /^up/), 'The number of interface that is DOWN in Physical is ' + cnt(2, /down/),
                'The number of interface that is UP in Protocol is ' + cnt(3, /^up/), 'The number of interface that is DOWN in Protocol is ' + cnt(3, /down/), '',
                'Interface                         IP Address/Mask      Physical   Protocol  '];
            st.forEach(x => L.push(pad(x[0], 34) + pad(x[1], 21) + pad(x[2], 11) + x[3]));
            return L.join('\n');
        }
        function showRt() {
            const R = rib();
            const L = ['Route Flags: R - relay, D - download to fib', '-'.repeat(78), 'Routing Tables: Public', '         Destinations : ' + R.length + '        Routes : ' + R.length + '        ', '',
                'Destination/Mask    Proto   Pre  Cost      Flags NextHop         Interface', ''];
            R.forEach(r => L.push(padL(r.net + '/' + r.len, 18) + '  ' + pad(r.proto, 8) + pad(r.pre, 5) + pad(r.cost, 12) + pad(r.fl, 4) + pad(r.nh, 16) + r.ifn));
            return L.join('\n');
        }
        function showEth(n) {
            const m = M();
            const list = Object.keys(m.ifs).filter(k => k.startsWith('Eth-Trunk')).map(k => ifNums(k)[0]).filter(k => n === undefined || k === n).sort((a, b) => a - b);
            if (!list.length) return n === undefined ? 'Info: No valid trunk in the system.' : '# [Simülatör] Eth-Trunk' + n + ' yok.';
            const out = [];
            for (const k of list) {
                const i = m.ifs['Eth-Trunk' + k], mem = etMembers(k);
                const lacp = i.etMode !== 'manual';
                const sel = p => physUp(p) && (!lacp || !!PEER.lacp);
                const upN = mem.filter(p => lacp ? sel(p) : physUp(p)).length;
                if (!lacp) {
                    out.push('Eth-Trunk' + k + '\'s state information is:', 'WorkingMode: NORMAL         Hash arithmetic: According to SIP-XOR-DIP         ',
                        'Least Active-linknumber: 1  Max Bandwidth-affected-linknumber: 8              ',
                        'Operate status: ' + pad(upN ? 'up' : 'down', 12) + 'Number Of Up Port In Trunk: ' + upN, '-'.repeat(80), 'PortName                      Status      Weight ');
                    mem.forEach(p => out.push(pad(p, 30) + pad(physUp(p) ? 'Up' : 'Down', 12) + '1'));
                } else {
                    out.push('Eth-Trunk' + k + '\'s state information is:', 'Local:', 'LAG ID: ' + pad(k, 20) + 'WorkingMode: LACP', 'Preempt Delay: Disabled     Hash arithmetic: According to SIP-XOR-DIP',
                        'System Priority: 32768      System ID: 4c1f-cc00-0001', 'Least Active-linknumber: 1  Max Active-linknumber: 8',
                        'Operate status: ' + pad(upN ? 'up' : 'down', 12) + 'Number Of Up Port In Trunk: ' + upN, '-'.repeat(80),
                        'ActorPortName          Status   PortType PortPri PortNo PortKey PortState Weight');
                    mem.forEach((p, x) => out.push(pad(p, 23) + pad(sel(p) ? 'Selected' : 'Unselect', 9) + pad('1GE', 9) + pad('32768', 8) + pad(x + 1, 7) + pad('305', 8) + pad(sel(p) ? '10111100' : '10100000', 10) + '1'));
                    out.push('', 'Partner:', '-'.repeat(80), 'ActorPortName          SysPri   SystemID        PortPri PortNo PortKey PortState');
                    mem.forEach((p, x) => out.push(pad(p, 23) + (sel(p) ? pad('32768', 9) + pad('4c1f-cc00-0002', 16) + pad('32768', 8) + pad(x + 1, 7) + pad('305', 8) + '10111100' : pad('0', 9) + pad('0000-0000-0000', 16) + pad('0', 8) + pad('0', 7) + pad('0', 8) + '10100011')));
                }
                out.push('  ');
            }
            return out.join('\n').replace(/\s+$/, '');
        }
        function showOspfPeer() {
            const ps = peerState(), m = M();
            const pids = Object.keys(m.ospf);
            if (!pids.length) return '# [Simülatör] OSPF süreci yapılandırılmamış.';
            const L = [];
            for (const pid of pids) {
                L.push('', '         OSPF Process ' + pid + ' with Router ID ' + ridOf(m.ospf[pid]), '                  Peer Statistic Information', ' ' + '-'.repeat(76),
                    ' Area Id          Interface                        Neighbor id      State    ');
                if (ps && String(ps.pid) === pid) L.push(' ' + pad(ps.area, 17) + pad(ps.ifn, 33) + pad(ps.rid, 17) + 'Full        ');
                L.push(' ' + '-'.repeat(76));
            }
            return L.join('\n');
        }
        function showAcl(n) {
            const m = M(), ids = Object.keys(m.acls).map(Number).filter(k => n === undefined || k === n).sort((a, b) => a - b);
            if (n !== undefined && !ids.length) return '# [Simülatör] ACL ' + n + ' yok.';
            const L = [];
            if (n === undefined) L.push(' Total quantity of nonempty ACL number is ' + ids.filter(k => m.acls[k].rules.length).length + ' ', '');
            ids.forEach(k => {
                const R = m.acls[k].rules;
                L.push((k >= 3000 ? 'Advanced' : 'Basic') + ' ACL ' + k + ', ' + R.length + ' rule' + (R.length === 1 ? '' : 's'), 'Acl\'s step is 5');
                R.forEach(r => L.push(' ' + ruleText(r) + ' '));
                L.push('');
            });
            return L.join('\n').replace(/\s+$/, '');
        }
        function showTfRec() {
            const m = M(), rows = [];
            for (const n of Object.keys(m.ifs).sort(ifCmp)) { const i = m.ifs[n]; if (i.tfIn) rows.push([n, 'inbound', 'acl ' + i.tfIn]); if (i.tfOut) rows.push([n, 'outbound', 'acl ' + i.tfOut]); }
            const L = ['-'.repeat(59), 'Interface                   Direction  AppliedRecord       ', '-'.repeat(59)];
            rows.forEach(r => L.push(pad(r[0], 28) + pad(r[1], 11) + r[2]));
            L.push('-'.repeat(59), 'Total:' + rows.length);
            return L.join('\n');
        }
        function ping(ip) {
            const m = M(), hosts = (S.lab.hosts || []).concat(PEER.ip ? [PEER.ip] : []);
            const head = '  PING ' + ip + ': 56  data bytes, press CTRL_C to break';
            const okLines = () => { const L = [head]; for (let k = 1; k <= 5; k++) L.push('    Reply from ' + ip + ': bytes=56 Sequence=' + k + ' ttl=255 time=' + (10 + k * 10) + ' ms'); L.push('', '  --- ' + ip + ' ping statistics ---', '    5 packet(s) transmitted', '    5 packet(s) received', '    0.00% packet loss', '    round-trip min/avg/max = 20/40/60 ms'); return L.join('\n'); };
            const fail = () => { const L = [head]; for (let k = 1; k <= 5; k++) L.push('    Request time out'); L.push('', '  --- ' + ip + ' ping statistics ---', '    5 packet(s) transmitted', '    0 packet(s) received', '    100.00% packet loss'); return L.join('\n'); };
            if (Object.entries(m.ifs).some(([n, i]) => i.ip === ip && l3Up(n))) return okLines();
            const r = lookup(ip);
            if (!r || !hosts.includes(ip)) return fail();
            if (r.proto === 'Static' && !hosts.includes(r.nh)) return fail();
            return okLines();
        }

        // ═══ Yürütme ═════════════════════════════════════════════════════════
        const ERRT = { invalid: 'Unrecognized command', incomplete: 'Incomplete command', amb: 'Ambiguous command', value: 'Wrong parameter', toomany: 'Too many parameters' };
        function errText(r, raw) {
            log({ raw, err: r.err, view: S.view });
            if (r.err === 'empty') return '';
            if (r.err !== 'amb' && unsupported(raw, r.err === 'incomplete')) { S.ev[S.ev.length - 1].err = 'unsupported'; return '# [Simülatör] Bu komut gerçek VRP\'de var ama bu lab sürümünde desteklenmiyor. ? ile desteklenenleri görün.'; }
            return ' '.repeat(promptText().length + (r.col || 0)) + '^\nError: ' + (ERRT[r.err] || ERRT.invalid) + ' found at \'^\' position.';
        }
        const UNSUP = ['display device', 'display health', 'display cpu-usage', 'display cpu', 'display memory', 'display alarm', 'display stp', 'display mac-address', 'display lldp', 'display arp',
            'display ospf interface', 'display ospf routing', 'display ospf lsdb', 'display ospf error', 'display ospf brief', 'display ospf peer', 'display bgp', 'display nat', 'display dhcp', 'display ip pool', 'display ssh',
            'display ntp', 'display logbuffer', 'display trapbuffer', 'display interface', 'display startup', 'display clock', 'display users', 'display user-interface', 'display local-user',
            'display lacp', 'display vrrp', 'display ip routing-table protocol', 'display ip routing-table verbose', 'display vlan summary', 'display counters', 'display diagnostic-information', 'display patch-information',
            'stp', 'lldp', 'dhcp', 'ip pool', 'nat', 'ntp-service', 'snmp-agent', 'info-center', 'bgp', 'isis', 'rip', 'vrrp', 'port-security', 'mac-address', 'loopback-detect', 'port-isolate',
            'traffic classifier', 'traffic behavior', 'traffic policy', 'traffic-policy', 'tracert', 'reset', 'clock', 'telnet', 'ftp', 'header', 'user-interface con', 'dir', 'compare', 'terminal',
            'undo terminal', 'debugging', 'port hybrid', 'port-group', 'interface range', 'ip dhcp', 'dhcp select', 'nat outbound', 'nat server', 'ospf cost', 'ospf timer', 'ospf network-type', 'mtu',
            'speed', 'duplex', 'negotiation', 'stp edged-port', 'lacp', 'max active-linknumber', 'trunkport', 'default-route-advertise', 'import-route', 'authentication-scheme', 'domain', 'user-interface maximum-vty'];
        // Tam kelime olarak yazılmış kökler (ör. 'port') daha uzun köke ('port-security') önekle eşlenmez
        const STOP = ['ip', 'port', 'traffic', 'ospf', 'user-interface', 'interface', 'ssh', 'vlan', 'nat', 'dhcp', 'stp', 'lacp', 'mode', 'display', 'acl', 'rule'];
        function unsupported(raw, exact) {
            const t = C.tokenize(raw.replace(/^\s*undo\s+/i, '')).map(x => x.t.toLowerCase());
            return UNSUP.some(u => { const w = u.split(' '); return w.length <= t.length && (!exact || w.length === t.length) && w.every((x, k) => x === t[k] || (t[k].length >= 3 && x.startsWith(t[k]) && !STOP.includes(t[k]))); });
        }
        function applyPipe(out, spec, colBase) {
            const m = spec.match(/^\s*(\S+)\s*(.*)$/);
            if (!m) return { err: 'incomplete', col: colBase + spec.length + 1 };
            const f = ['include', 'exclude', 'begin'].filter(w => w.startsWith(m[1].toLowerCase()));
            if (f.length !== 1) return { err: f.length ? 'amb' : 'invalid', col: colBase + spec.indexOf(m[1]) };
            if (!m[2]) return { err: 'incomplete', col: colBase + spec.replace(/\s+$/, '').length + 1 };
            let re; try { re = new RegExp(m[2]); } catch (e) { re = { test: s => s.includes(m[2]) }; }
            const lines = out.split('\n');
            if (f[0] === 'include') return { out: lines.filter(l => re.test(l)).join('\n') };
            if (f[0] === 'exclude') return { out: lines.filter(l => !re.test(l)).join('\n') };
            const k = lines.findIndex(l => re.test(l));
            return { out: k < 0 ? '' : lines.slice(k).join('\n') };
        }
        function execLine(line) {
            const toks = C.tokenize(line);
            let body = line, pipe = null, pcol = 0;
            const pi = line.indexOf('|');
            if (pi > 0) { body = line.slice(0, pi).replace(/\s+$/, ''); pipe = line.slice(pi + 1); pcol = pi + 1; }
            const isUndo = toks[0].t.toLowerCase() === 'undo' && S.view !== 'user';
            if (toks[0].t.toLowerCase() === 'undo' && S.view === 'user') return errText({ err: toks.length > 1 ? 'invalid' : 'incomplete', col: toks.length > 1 ? toks[1].o : line.length + 1 }, line);
            if (isUndo && toks.length === 1) return errText({ err: 'incomplete', col: line.length + 1 }, line);
            const off = isUndo ? toks[1].o : 0;
            const b2 = isUndo ? body.slice(off) : body;
            const tryIn = list => match(avail(list, isUndo), b2, ctx, isUndo);
            let r = tryIn(viewList());
            let fell = false;
            if (!r.ok && S.view !== 'user' && S.view !== 'sys') {
                const r2 = tryIn(SYS);
                if (r2.ok) { r = r2; fell = true; }
                else if ((r2.col || 0) > (r.col || 0) && r.err !== 'incomplete') r = r2;
            }
            if (!r.ok) return errText(Object.assign({}, r, { col: (r.col || 0) + off }), line);
            if (pipe !== null && !/^display /.test(r.canon)) return errText({ err: 'invalid', col: pi }, line);
            const prevView = S.view, prevVx = S.vx;
            S.restAt = (r.restAt || 0) + off; S.lastBody = b2; S.lastBodyOff = off;
            log({ raw: line, canon: (isUndo ? 'undo ' : '') + r.canon + (pipe !== null ? ' | ' + pipe.trim() : ''), view: S.view, undo: isUndo, vx: Object.assign({}, S.vx), fell });
            let out = isUndo ? r.cmd.undo(r.args) : r.cmd.run(r.args);
            if (out && typeof out === 'object') {
                S.view = prevView; S.vx = prevVx; S.ev.pop();
                if (out.sim) { log({ raw: line, err: 'sim', view: S.view }); return '# [Simülatör] ' + out.sim; }
                return errText(out, line);
            }
            out = out || '';
            if (/^Error: /.test(out)) S.ev[S.ev.length - 1] = { raw: line, err: 'value', view: S.view };
            if (pipe !== null) {
                const p = applyPipe(out, pipe, pcol);
                if (p.err) { S.ev.pop(); return errText(p, line); }
                out = p.out;
            }
            return out;
        }

        function promptText() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            const n = M().sysname, v = S.view, x = S.vx;
            if (v === 'user') return '<' + n + '>';
            if (v === 'sys') return '[' + n + ']';
            if (v === 'if') return '[' + n + '-' + x.if + ']';
            if (v === 'vlan') return '[' + n + '-vlan' + x.vlan + ']';
            if (v === 'ospf') return '[' + n + '-ospf-' + x.pid + ']';
            if (v === 'area') return '[' + n + '-ospf-' + x.pid + '-area-' + x.area + ']';
            if (v === 'aaa') return '[' + n + '-aaa]';
            if (v === 'vty') return '[' + n + '-ui-vty' + x.vty.replace(' ', '-') + ']';
            if (v === 'acl') return '[' + n + '-acl-' + (x.acl >= 3000 ? 'adv' : 'basic') + '-' + x.acl + ']';
            return '[' + n + ']';
        }
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw, prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) { S.loggedOut = false; return ''; }
            if (raw === '\x1a') { if (S.view !== 'user') { S.view = 'user'; S.vx = {}; } return ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            return execLine(line);
        }
        function helpFn(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            let list = viewList(), body = raw, off = 0;
            const toks = C.tokenize(raw);
            const undo = S.view !== 'user' && toks.length && toks[0].t.toLowerCase() === 'undo' && (toks.length > 1 || /\s$/.test(raw));
            if (undo) { off = toks[1] ? toks[1].o : raw.length; body = raw.slice(off); }
            const kh = (w, a, e) => w ? (KW[w] || a.c.h || '') : (e ? ((a && a.c.vh) || VARH[e.k] || (e.k === 'int' ? 'Sayı' : '')) : '');
            let h = help(avail(list, undo), body, ctx, kh);
            if (h.err && S.view !== 'user' && S.view !== 'sys') { const h2 = help(avail(SYS, undo), body, ctx, kh); if (!h2.err) h = h2; }
            if (h.err) return ' '.repeat(promptText().length + off + (h.col || 0)) + '^\nError: ' + (ERRT[h.err] || ERRT.invalid) + ' found at \'^\' position.';
            if (h.words) return h.words.map(w => '  ' + w).join('\n');
            return h.rows.map(([w, d]) => '  ' + pad(w, 24) + d).join('\n');
        }
        function completeFn(raw) {
            if (S.pending || S.loggedOut) return null;
            const toks = C.tokenize(raw);
            if (S.view !== 'user' && toks.length > 1 && toks[0].t.toLowerCase() === 'undo') {
                const r = complete(avail(viewList(), true), raw.slice(toks[1].o), ctx);
                return r === null ? null : raw.slice(0, toks[1].o) + r;
            }
            const r = complete(avail(viewList()), raw, ctx);
            return r === null && S.view !== 'user' && S.view !== 'sys' ? complete(avail(SYS), raw, ctx) : r;
        }

        // Başlangıç yapılandırması (lab.start + varyant.start: system-view içindeki komutlar) — olay kaydına girmez
        const startCmds = (lab.start || []).concat((variant && variant.start) || []);
        if (startCmds.length) {
            S.view = 'sys';
            for (const c of startCmds) { const o = input(c); if (/Error:|\[Simülatör\]/.test(o || '') && typeof console !== 'undefined') console.warn('[vrp start] ' + lab.id + ': ' + c + ' → ' + o); if (S.pending) input('y'); }
            S.view = 'user'; S.vx = {}; S.ev = []; S.hist = [];
            if (lab.startSaved) save();
        }

        const E = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon.toLowerCase()),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            err: k => S.ev.some(e => e.err === k),
            after: (reA, reB) => { const i = S.ev.findIndex(e => e.canon && reA.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && reB.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err === 'invalid'); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            ranIn: (re, view) => S.ev.some(e => e.canon && re.test(e.canon) && e.view === view),
            list: () => S.ev
        };

        return {
            vendor: 'huawei',
            prompt: promptText,
            secret: () => false,
            input, help: helpFn, complete: completeFn,
            _toPriv: () => { S.view = 'user'; S.vx = {}; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => variant,
            get model() { return S.m; },
            get savedModel() { return S.saved; },
            ev: E,
            saved: isSaved,
            view: () => S.view,
            mode: () => S.view,
            ifUp, rib, peer: peerState, decide,
            aclEval: (n, f) => { const A = S.m.acls[n]; if (!A) return null; const h = A.rules.find(r => aclMatch(r, f)); return h ? h.act : null; },
            showRun: () => runBody(M()),
        };
    }

    return { session, ifNorm };
})();
// Motor kayıt defteri: vendor anahtarı → motor
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { huawei: CgLabVrp });
if (typeof module !== 'undefined') module.exports = CgLabVrp;
