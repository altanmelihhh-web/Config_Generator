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
// Öğrenme yolu eklemeleri (2026-09-25) — sözdizimi kaynakları:
//  - port-security enable / max-mac-num / protect-action {protect|restrict|shutdown} / mac-address sticky, L2IFPPI/4/PORTSEC_ACTION_ALARM adı:
//    https://support.huawei.com/enterprise/en/doc/EDOC1100127035/de00387b/port-security-protect-action · https://ipcisco.com/lesson/huawei-port-security-configuration-on-huawei-ensp/
//  - undo mac-address dynamic: https://support.huawei.com/enterprise/en/doc/EDOC1000178168/93911e/deleting-mac-address-entries
//  - ssh server cipher/hmac/key-exchange algoritma adları (aes256_ctr, sha2_256, dh_group_exchange_sha256):
//    https://support.huawei.com/enterprise/en/doc/EDOC1100325914/8fa8383a/ssh-server-cipher
//  - test-aaa … hwtacacs-template|radius-template: https://support.huawei.com/enterprise/en/doc/EDOC1100064351/31df7d16/test-aaa
//  - nat outbound / nat server / display nat session all: AR Troubleshooting Guide https://support.huawei.com/enterprise/en/doc/EDOC1000079719/409c71ae/troubleshooting-cases-for-ip-service
//  - error-down auto-recovery cause bpdu-protection, stp edged-port, display stp brief, mac-address static, vrrp vrid … : komut kütüphanesi (assets/data/cli/huawei.js) + forum raporu H-08
// Biçimi doğrulanamayan çıktılar (display http server, display nat *, display ip pool, dir, tftp iletisi, compare configuration,
// port güvenliği/BPDU olay iletileri) "# [Simülatör]" / "# [Simülatör olayı]" etiketlidir.
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
        MAC: { ok: t => /^[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}$/i.test(t), val: t => t.toLowerCase(), label: 'H-H-H' },
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
        // öğrenme yolu eklemeleri
        header: 'Giriş/oturum afişi (banner)', login: 'Girişten önce gösterilen metin', shell: 'Girişten sonra gösterilen metin', information: 'Afiş metni',
        console: 'Konsol hattı', set: 'Ayarla', authentication: 'Kimlik doğrulama', cipher: 'Şifreli (geri döndürülebilir değil) saklama / şifre algoritmaları',
        'hwtacacs-server': 'HWTACACS (TACACS+ uyumlu) sunucu ayarları', 'radius-server': 'RADIUS sunucu ayarları', template: 'Sunucu şablonu', authorization: 'Yetkilendirme sunucusu',
        accounting: 'Hesap tutma (accounting) sunucusu', 'shared-key': 'Sunucuyla paylaşılan gizli anahtar', 'authentication-scheme': 'Kimlik doğrulama şeması (yöntem sırası)',
        domain: 'AAA etki alanı (kullanıcının şeması ve sunucuları)', 'test-aaa': 'AAA sunucusunu bir kullanıcıyla sına', 'hwtacacs-template': 'HWTACACS şablonuyla sına', 'radius-template': 'RADIUS şablonuyla sına',
        http: 'Web (HTTP/HTTPS) yönetim sunucusu', 'secure-server': 'HTTPS sunucusu', hmac: 'Bütünlük (MAC) algoritmaları', 'key-exchange': 'Anahtar değişimi (KEX) algoritmaları',
        timeout: 'Zaman aşımı (saniye)', 'authentication-retries': 'En fazla deneme sayısı', status: 'Durum',
        outbound: 'Giden yön / NAT outbound (Easy IP)', global: 'Genel (dış) adres / global havuz', inside: 'İç (özel) adres', session: 'NAT oturumları',
        dhcp: 'DHCP ayarları', select: 'Arayüzün DHCP rolü', relay: 'DHCP relay (aktarıcı)', 'server-ip': 'Relay\'in ileteceği DHCP sunucusu', pool: 'Adres havuzu',
        'gateway-list': 'İstemcilere verilecek ağ geçidi', mask: 'Alt ağ maskesi', 'excluded-ip-address': 'Dağıtılmayacak adresler', 'dns-list': 'DNS sunucuları', lease: 'Kira süresi', day: 'Gün', name: 'Ad', used: 'Kullanılan adresler',
        negotiation: 'Otomatik anlaşma (hız/dupleks)', auto: 'Otomatik', speed: 'Hız (Mbit/s)', duplex: 'Dupleks', full: 'Tam dupleks', half: 'Yarı dupleks',
        'port-group': 'Port grubu (toplu yapılandırma)', 'group-member': 'Gruba üye port ekle', to: 'Aralık sonu',
        'port-security': 'Port güvenliği (MAC sınırı)', 'max-mac-num': 'Porttaki en fazla güvenli MAC sayısı', 'protect-action': 'İhlalde yapılacak eylem', protect: 'Sessizce düşür',
        restrict: 'Düşür + alarm üret', sticky: 'Öğrenilen MAC\'leri yapılandırmaya yaz (sticky)', 'mac-address': 'MAC adres tablosu / girdisi', static: 'Statik girdi', dynamic: 'Dinamik öğrenilen girdiler',
        security: 'Port güvenliğiyle öğrenilen girdiler', 'aging-time': 'Yaşlanma süresi (saniye)',
        stp: 'Yayılan ağaç (STP)', priority: 'Öncelik (küçük = kök olmaya daha yakın)', root: 'Kök köprü rolü', primary: 'Birincil kök (öncelik 0)', secondary: 'İkincil kök (öncelik 4096)',
        'edged-port': 'Kenar port (uç cihaz)', 'bpdu-protection': 'Kenar porta BPDU gelirse portu error-down yap', rstp: 'Hızlı STP', mstp: 'Çoklu STP', 'error-down': 'error-down ayarları',
        'auto-recovery': 'Otomatik kurtarma', cause: 'Neden', interval: 'Aralık (saniye)',
        vrrp: 'VRRP (sanal ağ geçidi) / VRRP bilgisi', vrid: 'Sanal router kimliği', 'virtual-ip': 'Sanal ağ geçidi adresi', 'preempt-mode': 'Öne geçme (preempt)', timer: 'Zamanlayıcı', delay: 'Gecikme (saniye)',
        startup: 'Açılış dosyaları', 'saved-configuration_': '', dir: 'Flash dosyalarını listele', tftp: 'TFTP ile dosya aktar', put: 'Cihazdan sunucuya gönder', get: 'Sunucudan cihaza al',
        compare: 'Karşılaştır', configuration: 'Yapılandırma',
    };
    const VARH = { 'A.B.C.D': 'IP adresi', MASK: 'Alt ağ maskesi', MASKLEN: 'Maske (255.255.255.0) ya da uzunluk (24)', WILD: 'Wildcard (ör. 0.0.0.255; tek host için 0)',
        WORD: 'Metin', AREA: 'Alan kimliği (0 ya da 0.0.0.0)', IFNAME: 'Arayüz (ör. GigabitEthernet0/0/1, g0/0/1, Vlanif10)', LINE: 'Metin', VLANS: 'VLAN listesi (ör. 10 20 ya da 10 to 20)', MAC: 'MAC adresi (ör. 5489-98aa-0001)' };

    // ── Varsayılan cihaz modeli
    function newIf(sw, n) {
        const phys = isPhys(n);
        return { desc: '', shutdown: false, lt: sw && phys ? 'hybrid' : null, pvid: 1, allow: [1], ip: null, mask: null, et: null, tfIn: null, tfOut: null, etMode: n.startsWith('Eth-Trunk') ? 'manual' : null,
            neg: true, speed: null, duplex: null, psec: { en: false, max: 1, act: 'restrict', sticky: false, macs: [] }, edge: false, natOut: null, natSrv: [], dsel: null, relay: null, vrrp: {} };
    }
    function baseModel(lab) {
        const sw = lab.kind !== 'router';
        const def = sw ? 'HUAWEI' : 'Huawei';
        const m = { sw, sysname: lab.hostname || def, defName: def, ifs: {}, vlans: { 1: null }, routes: [], ospf: {}, acls: {}, users: {}, stelnet: false, sshUsers: {}, rsa: false,
            vty: { auth: null, proto: null, level: null, idle: null }, links: {},
            header: { login: null, shell: null }, con: { auth: null, pw: null }, tac: {}, rad: {}, schemes: { default: ['local'] },
            domains: { default: { as: 'default', tac: null, rad: null }, default_admin: { as: 'default', tac: null, rad: null } },
            http: { server: true, secure: true }, sshc: { cipher: null, hmac: null, kex: null, timeout: 60, retries: 3 },
            dhcp: false, pools: {}, macStatic: [], macAging: 300, stp: { mode: 'mstp', prio: 32768, root: null, bpduProt: false }, edr: null, pgs: {} };
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
        const S = { lab, m: baseModel(lab), view: 'user', vx: {}, pending: null, ev: [], hist: [], loggedOut: false, answers: {},
            files: {}, next: 'vrpcfg.zip', cur: 'vrpcfg.zip', clock: 0, errdown: {}, learned: {}, secDyn: {}, viol: {}, macHold: 0, rogue: {}, edgeLost: {}, bpduSeen: {}, fired: {}, tftp: [] };
        const SIM = Object.assign({}, lab.sim || {}, (variant && variant.sim) || {});
        let API = null;
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
            { p: 'display saved-configuration', run: () => savedM() ? runBody(savedM()) : '# [Simülatör] Kaydedilmiş yapılandırma yok: henüz save yapılmadı.' },
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
            // ── öğrenme yolu: L2 güvenlik / STP / arayüz / servisler (çıktılar modelden)
            { p: 'display mac-address', sw: 1, run: () => showMac() },
            { p: 'display mac-address <dynamic|static|sticky|security>$t', sw: 1, run: a => showMac(e => e.type === a.t) },
            { p: 'display mac-address vlan (1-4094)$v', sw: 1, run: a => showMac(e => e.vlan === a.v) },
            { p: 'display mac-address MAC$mac', sw: 1, run: a => showMac(e => e.mac === a.mac) },
            { p: 'display stp brief', sw: 1, run: showStpBrief },
            { p: 'display stp', sw: 1, run: showStp },
            { p: 'display interface IFNAME$if', run: a => showIfDetail(a.if) },
            { p: 'display http server', run: showHttp },
            { p: 'display ssh server status', run: showSshSrv },
            { p: 'display nat outbound', rt: 1, run: showNatOut },
            { p: 'display nat server', rt: 1, run: showNatSrv },
            { p: 'display nat session all', rt: 1, run: showNatSess },
            { p: 'display ip pool', run: () => showPools() },
            { p: 'display ip pool name WORD$p', run: a => showPool(a.p) },
            { p: 'display ip pool name WORD$p used', run: a => showPool(a.p, true) },
            { p: 'display vrrp brief', run: showVrrp },
            { p: 'display startup', run: showStartup },
        ];
        const ALLV = [
            { p: 'save', run: () => cmdSave(), neg: false },
            { p: 'save WORD$f', run: a => cmdSave(a.f), neg: false },
            { p: 'quit', run: cmdQuit, neg: false },
            { p: 'ping A.B.C.D$ip', run: a => ping(a.ip), neg: false },
        ].concat(DISPLAY.map(d => Object.assign(d, { neg: false })));
        const USER = X([
            { p: 'system-view', run: () => { S.view = 'sys'; S.vx = {}; return 'Enter system view, return user view with Ctrl+Z.'; } },
            { p: 'reboot', run: cmdReboot },
            { p: 'startup saved-configuration WORD$f', run: startupSet },
            { p: 'dir', run: showDir },
            { p: 'tftp A.B.C.D$ip put WORD$src', run: tftpPut },
            { p: 'tftp A.B.C.D$ip put WORD$src WORD$dst', run: tftpPut },
            { p: 'compare configuration', run: compareCfg },
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
            // ── Modül 1: afiş ve konsol
            { p: 'header <login|shell>$k information LINE$t', run: a => { const t = a.t.replace(/^"(.*)"$/, '$1'); if (!t.trim()) return pErr(S.restAt, 'incomplete'); M().header[a.k] = t.slice(0, 480); }, neg: false },
            { p: 'header <login|shell>$k', noOnly: 1, undo: a => { M().header[a.k] = null; } },
            { p: 'user-interface console 0', run: () => { S.view = 'con'; S.vx = {}; }, neg: false },
            // ── Modül 2: AAA sunucu şablonları
            { p: 'hwtacacs-server template WORD$t', run: a => { const m = M(); if (!m.tac[a.t]) m.tac[a.t] = { auth: null, author: null, acct: null, key: null }; S.view = 'tac'; S.vx = { t: a.t }; }, undo: a => { if (!M().tac[a.t]) return simErr('Böyle bir HWTACACS şablonu yok.'); if (Object.values(M().domains).some(d => d.tac === a.t)) return simErr('Şablon bir domain\'de kullanılıyor; önce domain\'den kaldırın.'); delete M().tac[a.t]; } },
            { p: 'radius-server template WORD$t', run: a => { const m = M(); if (!m.rad[a.t]) m.rad[a.t] = { auth: null, port: null, acct: null, key: null }; S.view = 'rad'; S.vx = { t: a.t }; }, undo: a => { if (!M().rad[a.t]) return simErr('Böyle bir RADIUS şablonu yok.'); if (Object.values(M().domains).some(d => d.rad === a.t)) return simErr('Şablon bir domain\'de kullanılıyor; önce domain\'den kaldırın.'); delete M().rad[a.t]; } },
            { p: 'test-aaa WORD$u WORD$pw <hwtacacs-template|radius-template>$k WORD$t', run: testAaa, neg: false },
            // ── Modül 4–5: web yönetimi ve SSH sıkılaştırma
            { p: 'http server enable', run: () => { M().http.server = true; }, undo: () => { M().http.server = false; } },
            { p: 'http secure-server enable', run: () => { M().http.secure = true; }, undo: () => { M().http.secure = false; } },
            { p: 'ssh server cipher LINE$l', run: a => sshAlg('cipher', a.l), neg: false },
            { p: 'ssh server hmac LINE$l', run: a => sshAlg('hmac', a.l), neg: false },
            { p: 'ssh server key-exchange LINE$l', run: a => sshAlg('kex', a.l), neg: false },
            { p: 'ssh server <cipher|hmac|key-exchange>$k', noOnly: 1, undo: a => { M().sshc[a.k === 'key-exchange' ? 'kex' : a.k] = null; } },
            { p: 'ssh server timeout (1-120)$t', run: a => { M().sshc.timeout = a.t; }, undo: () => { M().sshc.timeout = 60; } },
            { p: 'ssh server timeout', noOnly: 1, undo: () => { M().sshc.timeout = 60; } },
            { p: 'ssh server authentication-retries (1-5)$r', run: a => { M().sshc.retries = a.r; }, undo: () => { M().sshc.retries = 3; } },
            { p: 'ssh server authentication-retries', noOnly: 1, undo: () => { M().sshc.retries = 3; } },
            // ── Modül 7: DHCP
            { p: 'dhcp enable', run: () => { M().dhcp = true; }, undo: () => { M().dhcp = false; } },
            { p: 'ip pool WORD$p', run: a => { const m = M(); if (!m.pools[a.p]) { if (a.p.length > 64) return pErr(colTok(2)); m.pools[a.p] = { gw: null, net: null, len: null, excl: [], dns: [], lease: 1 }; } S.view = 'pool'; S.vx = { p: a.p }; }, undo: a => { if (!M().pools[a.p]) return simErr('Böyle bir adres havuzu yok.'); delete M().pools[a.p]; } },
            // ── Modül 11: MAC tablosu
            { p: 'mac-address static MAC$mac IFNAME$i vlan (1-4094)$v', sw: 1, run: macStaticAdd, undo: a => { const m = M(), k = m.macStatic.findIndex(x => x.mac === a.mac && x.port === a.i && x.vlan === a.v); if (k < 0) return simErr('Böyle bir statik MAC girdisi yok.'); m.macStatic.splice(k, 1); } },
            { p: 'mac-address aging-time (0-1000000)$t', sw: 1, run: a => { if (a.t !== 0 && a.t < 10) return pErr(colTok(2)); M().macAging = a.t; }, undo: () => { M().macAging = 300; } },
            { p: 'mac-address aging-time', sw: 1, noOnly: 1, undo: () => { M().macAging = 300; } },
            { p: 'mac-address dynamic', sw: 1, noOnly: 1, undo: () => macClear(() => true) },
            { p: 'mac-address dynamic vlan (1-4094)$v', sw: 1, noOnly: 1, undo: a => macClear(e => e.vlan === a.v) },
            { p: 'mac-address dynamic IFNAME$i', sw: 1, noOnly: 1, undo: a => macClear(e => e.port === a.i) },
            // ── Modül 12: STP
            { p: 'stp mode <stp|rstp|mstp>$md', sw: 1, run: a => { M().stp.mode = a.md; }, undo: () => { M().stp.mode = 'mstp'; } },
            { p: 'stp mode', sw: 1, noOnly: 1, undo: () => { M().stp.mode = 'mstp'; } },
            { p: 'stp priority (0-61440)$pr', sw: 1, run: a => { if (a.pr % 4096) return simErr('Köprü önceliği 4096\'nın katı olmalı (0, 4096, 8192 … 61440).'); if (M().stp.root) return simErr('Bu köprü "stp root ' + M().stp.root + '" ile yapılandırılmış; önce undo stp root.'); M().stp.prio = a.pr; }, undo: () => { M().stp.prio = 32768; } },
            { p: 'stp priority', sw: 1, noOnly: 1, undo: () => { M().stp.prio = 32768; } },
            { p: 'stp root <primary|secondary>$r', sw: 1, run: a => { M().stp.root = a.r; }, undo: () => { M().stp.root = null; } },
            { p: 'stp root', sw: 1, noOnly: 1, undo: () => { M().stp.root = null; } },
            { p: 'stp bpdu-protection', sw: 1, run: () => { M().stp.bpduProt = true; }, undo: () => { M().stp.bpduProt = false; } },
            { p: 'error-down auto-recovery cause bpdu-protection interval (30-86400)$i', sw: 1, run: a => { M().edr = a.i; }, neg: false },
            { p: 'error-down auto-recovery cause bpdu-protection', sw: 1, noOnly: 1, undo: () => { M().edr = null; } },
            // ── Modül 9: port grubu (toplu yapılandırma)
            { p: 'port-group WORD$g', sw: 1, run: a => { const m = M(); if (!m.pgs[a.g]) m.pgs[a.g] = []; S.view = 'pg'; S.vx = { g: a.g }; }, undo: a => { if (!M().pgs[a.g]) return simErr('Böyle bir port grubu yok.'); delete M().pgs[a.g]; } },
            { p: 'rsa local-key-pair create', run: () => { M().rsa = true; return '# [Simülatör] RSA anahtar çifti oluşturuldu (2048 bit). Gerçek cihaz anahtar adını gösterir ve uzunluğu sorar.'; }, neg: false },
        ].concat(ALLV, [RET]));
        const IFC = [
            { p: 'description !LINE$d', run: a => { curIf().desc = a.d.slice(0, 242); }, undo: () => { curIf().desc = ''; } },
            { p: 'shutdown', run: () => { curIf().shutdown = true; if (S.errdown[S.vx.if]) { delete S.errdown[S.vx.if]; Object.keys(S.viol).forEach(k => { if (k.startsWith(S.vx.if + '|')) delete S.viol[k]; }); } }, undo: () => { curIf().shutdown = false; } },
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
            // ── Modül 9: hız / dupleks
            { p: 'negotiation auto', phys: 1, run: () => { curIf().neg = true; curIf().speed = null; curIf().duplex = null; }, undo: () => { curIf().neg = false; } },
            { p: 'speed <10|100|1000>$sp', phys: 1, run: a => { if (curIf().neg) return simErr('Otomatik anlaşma açıkken hız elle verilemez: önce "undo negotiation auto".'); curIf().speed = +a.sp; }, undo: () => { curIf().speed = null; } },
            { p: 'speed', phys: 1, noOnly: 1, undo: () => { curIf().speed = null; } },
            { p: 'duplex <full|half>$du', phys: 1, run: a => { if (curIf().neg) return simErr('Otomatik anlaşma açıkken dupleks elle verilemez: önce "undo negotiation auto".'); curIf().duplex = a.du; }, undo: () => { curIf().duplex = null; } },
            { p: 'duplex', phys: 1, noOnly: 1, undo: () => { curIf().duplex = null; } },
            // ── Modül 10: port güvenliği
            { p: 'port-security enable', l2p: 1, run: () => { curIf().psec.en = true; }, undo: () => { const i = curIf(); i.psec.en = false; delete S.secDyn[S.vx.if]; Object.keys(S.viol).forEach(k => { if (k.startsWith(S.vx.if + '|')) delete S.viol[k]; }); } },
            { p: 'port-security max-mac-num (1-4096)$n', l2p: 1, run: a => { if (!curIf().psec.en) return simErr('Önce bu portta "port-security enable".'); curIf().psec.max = a.n; }, undo: () => { curIf().psec.max = 1; } },
            { p: 'port-security max-mac-num', l2p: 1, noOnly: 1, undo: () => { curIf().psec.max = 1; } },
            { p: 'port-security protect-action <protect|restrict|shutdown>$ac', l2p: 1, run: a => { if (!curIf().psec.en) return simErr('Önce bu portta "port-security enable".'); if (curIf().psec.act === a.ac) return; curIf().psec.act = a.ac; Object.keys(S.viol).forEach(k => { if (k.startsWith(S.vx.if + '|')) delete S.viol[k]; }); }, undo: () => { curIf().psec.act = 'restrict'; } },
            { p: 'port-security protect-action', l2p: 1, noOnly: 1, undo: () => { curIf().psec.act = 'restrict'; } },
            { p: 'port-security mac-address sticky', l2p: 1, run: () => { const i = curIf(); if (!i.psec.en) return simErr('Önce bu portta "port-security enable".'); i.psec.sticky = true; const d = S.secDyn[S.vx.if] || {}; Object.keys(d).forEach(mac => i.psec.macs.push({ mac, vlan: d[mac] })); delete S.secDyn[S.vx.if]; },
              undo: () => { const i = curIf(); i.psec.sticky = false; const d = S.secDyn[S.vx.if] = S.secDyn[S.vx.if] || {}; i.psec.macs.forEach(x => { d[x.mac] = x.vlan; }); i.psec.macs = []; } },
            // ── Modül 12: kenar port
            { p: 'stp edged-port enable', l2p: 1, run: () => { curIf().edge = true; delete S.edgeLost[S.vx.if]; }, undo: () => { curIf().edge = false; } },
            { p: 'stp edged-port', l2p: 1, noOnly: 1, undo: () => { curIf().edge = false; } },
            // ── Modül 6: NAT (AR router, WAN arayüzü)
            { p: 'nat outbound (2000-3999)$acl', rphys: 1, run: a => { curIf().natOut = a.acl; }, undo: () => { curIf().natOut = null; } },
            { p: 'nat server protocol <tcp|udp>$pr global A.B.C.D$g (1-65535)$gp inside A.B.C.D$in (1-65535)$ip', rphys: 1, run: natSrvAdd,
              undo: a => { const i = curIf(), k = i.natSrv.findIndex(x => x.pr === a.pr && x.g === a.g && x.gp === a.gp); if (k < 0) return simErr('Böyle bir nat server girdisi yok.'); i.natSrv.splice(k, 1); } },
            // ── Modül 7: DHCP (Vlanif / router arayüzü)
            { p: 'dhcp select <global|interface|relay>$ds', l3: 1, run: a => { if (!M().dhcp) return simErr('DHCP global olarak kapalı: önce sistem görünümünde "dhcp enable".'); curIf().dsel = a.ds; }, undo: () => { curIf().dsel = null; curIf().relay = null; } },
            { p: 'dhcp select', l3: 1, noOnly: 1, undo: () => { curIf().dsel = null; curIf().relay = null; } },
            { p: 'dhcp relay server-ip A.B.C.D$sip', l3: 1, run: a => { if (curIf().dsel !== 'relay') return simErr('Önce bu arayüzde "dhcp select relay".'); curIf().relay = a.sip; }, undo: () => { curIf().relay = null; } },
            // ── Modül 16: VRRP
            { p: 'vrrp vrid (1-255)$vr virtual-ip A.B.C.D$vip', l3: 1, run: vrrpVip, undo: a => { const g = curIf().vrrp[a.vr]; if (!g) return simErr('Böyle bir VRRP grubu yok.'); delete curIf().vrrp[a.vr]; } },
            { p: 'vrrp vrid (1-255)$vr priority (1-254)$pri', l3: 1, run: a => { const g = curIf().vrrp[a.vr]; if (!g) return simErr('Önce "vrrp vrid ' + a.vr + ' virtual-ip …" ile grubu oluşturun.'); g.pri = a.pri; }, undo: a => { const g = curIf().vrrp[a.vr]; if (g) g.pri = 100; } },
            { p: 'vrrp vrid (1-255)$vr priority', l3: 1, noOnly: 1, undo: a => { const g = curIf().vrrp[a.vr]; if (g) g.pri = 100; } },
            { p: 'vrrp vrid (1-255)$vr preempt-mode timer delay (0-3600)$dl', l3: 1, run: a => { const g = curIf().vrrp[a.vr]; if (!g) return simErr('Önce "vrrp vrid ' + a.vr + ' virtual-ip …" ile grubu oluşturun.'); g.delay = a.dl; }, undo: a => { const g = curIf().vrrp[a.vr]; if (g) g.delay = 0; } },
            { p: 'vrrp vrid (1-255)$vr', l3: 1, noOnly: 1, undo: a => { if (!curIf().vrrp[a.vr]) return simErr('Böyle bir VRRP grubu yok.'); delete curIf().vrrp[a.vr]; } },
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
            { p: 'authentication-scheme WORD$n', run: a => { const m = M(); if (!m.schemes[a.n]) m.schemes[a.n] = ['local']; S.view = 'ascheme'; S.vx = { n: a.n }; },
              undo: a => { if (a.n === 'default') return simErr('default şeması silinemez.'); if (!M().schemes[a.n]) return simErr('Böyle bir şema yok.'); if (Object.values(M().domains).some(d => d.as === a.n)) return simErr('Şema bir domain\'de kullanılıyor.'); delete M().schemes[a.n]; } },
            { p: 'domain WORD$d', run: a => { const m = M(); if (!m.domains[a.d]) m.domains[a.d] = { as: 'default', tac: null, rad: null }; S.view = 'domain'; S.vx = { d: a.d }; },
              undo: a => { if (/^default(_admin)?$/.test(a.d)) return simErr('Varsayılan domain\'ler silinemez.'); if (!M().domains[a.d]) return simErr('Böyle bir domain yok.'); delete M().domains[a.d]; } },
            { p: 'test-aaa WORD$u WORD$pw <hwtacacs-template|radius-template>$k WORD$t', run: testAaa, neg: false },
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
        const CONV = X([
            { p: 'authentication-mode <aaa|password|none>$md', run: a => { M().con.auth = a.md; }, neg: false },
            { p: 'set authentication password cipher WORD$pw', run: a => { if (a.pw.length < 8 || a.pw.length > 16) return simErr('Parola 8-16 karakter olmalı (bu lab\'ın kuralı).'); M().con.pw = a.pw; }, neg: false },
            { p: 'set authentication password', noOnly: 1, undo: () => { M().con.pw = null; } },
            { p: 'idle-timeout (0-35791)$mi [(0-59)$se]', run: a => { M().con.idle = a.mi + ' ' + (a.se || 0); }, undo: () => { M().con.idle = null; } },
        ].concat(ALLV, [RET]));
        const TACV = X([
            { p: 'hwtacacs-server <authentication|authorization|accounting>$k A.B.C.D$ip', run: a => { M().tac[S.vx.t][{ authentication: 'auth', authorization: 'author', accounting: 'acct' }[a.k]] = a.ip; },
              undo: a => { M().tac[S.vx.t][{ authentication: 'auth', authorization: 'author', accounting: 'acct' }[a.k]] = null; } },
            { p: 'hwtacacs-server shared-key cipher WORD$k', run: a => { M().tac[S.vx.t].key = a.k; }, neg: false },
            { p: 'hwtacacs-server shared-key', noOnly: 1, undo: () => { M().tac[S.vx.t].key = null; } },
        ].concat(ALLV, [RET]));
        const RADV = X([
            { p: 'radius-server authentication A.B.C.D$ip (1-65535)$port', run: a => { const t = M().rad[S.vx.t]; t.auth = a.ip; t.port = a.port; }, undo: () => { const t = M().rad[S.vx.t]; t.auth = null; t.port = null; } },
            { p: 'radius-server accounting A.B.C.D$ip (1-65535)$port', run: a => { M().rad[S.vx.t].acct = a.ip + ' ' + a.port; }, undo: () => { M().rad[S.vx.t].acct = null; } },
            { p: 'radius-server shared-key cipher WORD$k', run: a => { M().rad[S.vx.t].key = a.k; }, neg: false },
            { p: 'radius-server shared-key', noOnly: 1, undo: () => { M().rad[S.vx.t].key = null; } },
        ].concat(ALLV, [RET]));
        const ASCHV = X([
            { p: 'authentication-mode LINE$md', run: authMode, neg: false, vh: 'Yöntemler sırayla: hwtacacs | radius | local | none (ör. hwtacacs local)' },
        ].concat(ALLV, [RET]));
        const DOMV = X([
            { p: 'authentication-scheme WORD$n', run: a => { if (!M().schemes[a.n]) return simErr('Böyle bir authentication-scheme yok: önce aaa görünümünde oluşturun.'); M().domains[S.vx.d].as = a.n; }, undo: () => { M().domains[S.vx.d].as = 'default'; } },
            { p: 'hwtacacs-server WORD$t', run: a => { if (!M().tac[a.t]) return simErr('Böyle bir HWTACACS şablonu yok.'); M().domains[S.vx.d].tac = a.t; }, undo: () => { M().domains[S.vx.d].tac = null; } },
            { p: 'radius-server WORD$t', run: a => { if (!M().rad[a.t]) return simErr('Böyle bir RADIUS şablonu yok.'); M().domains[S.vx.d].rad = a.t; }, undo: () => { M().domains[S.vx.d].rad = null; } },
        ].concat(ALLV, [RET]));
        const POOLV = X([
            { p: 'gateway-list A.B.C.D$g', run: a => { M().pools[S.vx.p].gw = a.g; }, undo: () => { M().pools[S.vx.p].gw = null; } },
            { p: 'network A.B.C.D$n mask MASKLEN$mk', run: poolNet, undo: () => { const P = M().pools[S.vx.p]; P.net = null; P.len = null; } },
            { p: 'excluded-ip-address A.B.C.D$a [A.B.C.D$b]', run: poolExcl, undo: a => { const P = M().pools[S.vx.p]; P.excl = P.excl.filter(x => !(x[0] === a.a && x[1] === (a.b || a.a))); } },
            { p: 'dns-list A.B.C.D$d', run: a => { const P = M().pools[S.vx.p]; if (!P.dns.includes(a.d)) P.dns.push(a.d); }, undo: () => { M().pools[S.vx.p].dns = []; } },
            { p: 'lease day (0-999)$d', run: a => { M().pools[S.vx.p].lease = a.d; }, undo: () => { M().pools[S.vx.p].lease = 1; } },
        ].concat(ALLV, [RET]));
        const PGMEM = [
            { p: 'group-member IFNAME$a to IFNAME$b', run: a => pgMember(a, false), undo: a => pgMember(a, true) },
            { p: 'group-member IFNAME$a', run: a => pgMember(a, false), undo: a => pgMember(a, true) },
        ];
        const PGV = X(PGMEM.concat(IFC, ALLV, [RET]));
        const VIEWS = { user: USER, sys: SYS, if: IFV, vlan: VLANV, ospf: OSPFV, area: AREAV, aaa: AAAV, vty: VTYV, con: CONV, tac: TACV, rad: RADV, ascheme: ASCHV, domain: DOMV, pool: POOLV, pg: PGV };
        const viewList = () => S.view === 'acl' ? (S.vx.acl >= 3000 ? ACLADV : ACLBAS) : VIEWS[S.view];
        const osp = () => M().ospf[S.vx.pid];

        function avail(list, undoForm) {
            return list.filter(c => {
                if (c.sw && !M().sw) return false;
                if (c.rt && M().sw) return false;
                if (undoForm ? (c.neg === false || !c.undo) : c.noOnly) return false;
                if (S.view === 'if' || (S.view === 'pg' && IFC.includes(c))) {
                    const n = S.view === 'pg' ? (M().pgs[S.vx.g][0] || 'GigabitEthernet0/0/1') : S.vx.if, sw = M().sw;
                    if (c.phys && !isPhys(n)) return false;
                    if (c.l2p && !(sw && isPhys(n))) return false;
                    if (c.rphys && !(!sw && isPhys(n))) return false;
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
            const up = { if: 'sys', vlan: 'sys', ospf: 'sys', aaa: 'sys', vty: 'sys', acl: 'sys', area: 'ospf', sys: 'user', con: 'sys', tac: 'sys', rad: 'sys', pool: 'sys', pg: 'sys', ascheme: 'aaa', domain: 'aaa' }[S.view];
            if (S.view === 'user') { S.loggedOut = true; return '  Configuration console exit, please press any key to log on'; }
            S.vx = up === 'ospf' ? { pid: S.vx.pid } : {};
            S.view = up;
        }
        function cmdSave(f) {
            const m = M();
            if (f !== undefined && !fileOk(f)) return simErr('Dosya adı .cfg ya da .zip ile bitmeli (ör. yedek-0925.cfg).');
            const target = f || S.next, doSave = () => saveTo(target);
            if (m.sw) {
                S.pending = { prompt: 'Are you sure to continue?[Y/N]', fn: x => { if (/^y/i.test(x)) { doSave(); return 'Now saving the current configuration to the slot 0.\nSave the configuration successfully.'; } return ''; } };
                return 'The current configuration will be written to the device.' + (f ? '\n# [Simülatör] Hedef dosya: flash:/' + f : '');
            }
            S.pending = { prompt: '  Are you sure to continue? (y/n)[n]:', fn: x => { if (/^y/i.test(x)) { doSave(); return '  It will take several minutes to save configuration file, please wait......\n  Configuration file had been saved successfully\n  Note: The configuration file will take effect after being activated'; } return ''; } };
            return '  The current configuration will be written to the device. ' + (f ? '\n# [Simülatör] Hedef dosya: flash:/' + f : '');
        }
        function cmdReboot() {
            const go = () => {
                S.pending = { prompt: '[Simülatör] Cihaz yeniden başlatılsın mı? [Y/N]:', fn: x => {
                    if (!/^y/i.test(x)) return '';
                    const links = clone(M().links);
                    S.m = savedM() ? clone(savedM()) : baseModel(S.lab); S.m.links = links; S.cur = S.next;
                    S.errdown = {}; S.learned = {}; S.secDyn = {}; S.viol = {};
                    S.view = 'user'; S.vx = {}; S.loggedOut = true;
                    log({ event: 'reboot', file: S.next });
                    return '[Simülatör] Cihaz yeniden başlatıldı; flash:/' + S.next + ' yüklendi.\n\nPress any key to get started';
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

        // ═══ Öğrenme yolu yardımcıları (AAA, SSH, NAT, DHCP, MAC, STP, VRRP, yedek) ═══
        const SSH_ALG = {
            cipher: ['des_cbc', '3des_cbc', 'aes128_cbc', 'aes256_cbc', 'aes128_ctr', 'aes192_ctr', 'aes256_ctr'],
            hmac: ['md5', 'md5_96', 'sha1', 'sha1_96', 'sha2_256', 'sha2_256_96', 'sha2_512'],
            kex: ['dh_group1_sha1', 'dh_group14_sha1', 'dh_group_exchange_sha1', 'dh_group_exchange_sha256'],
        };
        // Zayıf kabul edilenler (lab'ın öğretim ölçütü): CBC/DES/3DES, MD5/SHA1, grup 1 ve SHA1 tabanlı KEX
        const SSH_WEAK = { cipher: ['des_cbc', '3des_cbc', 'aes128_cbc', 'aes256_cbc'], hmac: ['md5', 'md5_96', 'sha1', 'sha1_96'], kex: ['dh_group1_sha1', 'dh_group14_sha1', 'dh_group_exchange_sha1'] };
        const SSH_DEF = { cipher: ['aes128_ctr', 'aes256_ctr', 'aes128_cbc', 'aes256_cbc', '3des_cbc'], hmac: ['sha2_256', 'sha2_512', 'sha1'], kex: ['dh_group_exchange_sha256', 'dh_group14_sha1', 'dh_group_exchange_sha1'] };
        function sshAlg(k, line) {
            const w = line.trim().split(/\s+/).map(x => x.toLowerCase()), L = [];
            for (let j = 0; j < w.length; j++) {
                const h = SSH_ALG[k].filter(o => o === w[j] || o.startsWith(w[j]));
                const ex = SSH_ALG[k].includes(w[j]) ? [w[j]] : h;
                if (ex.length !== 1) return pErr(S.restAt + tokOff(line, j), ex.length ? 'amb' : 'value');
                if (!L.includes(ex[0])) L.push(ex[0]);
            }
            M().sshc[k] = L;
        }
        const sshList = k => M().sshc[k] || SSH_DEF[k];
        function authMode(a) {
            const w = a.md.trim().split(/\s+/).map(x => x.toLowerCase()), ok = ['hwtacacs', 'radius', 'local', 'none'], L = [];
            for (let j = 0; j < w.length; j++) {
                const h = ok.filter(o => o.startsWith(w[j]));
                if (h.length !== 1 || L.includes(h[0])) return pErr(S.restAt + tokOff(a.md, j), h.length > 1 ? 'amb' : 'value');
                L.push(h[0]);
            }
            if (L.includes('hwtacacs') && L.includes('radius')) return simErr('Aynı şemada hwtacacs ve radius birlikte kullanılamaz (bu lab\'ın kuralı): birini seçin.');
            if (L.includes('none') && L[L.length - 1] !== 'none') return pErr(S.restAt + tokOff(a.md, L.indexOf('none') + 1), 'toomany');
            M().schemes[S.vx.n] = L;
        }
        function testAaa(a) {
            const tac = a.k === 'hwtacacs-template', T = tac ? M().tac[a.t] : M().rad[a.t];
            if (!T) return simErr('Böyle bir ' + (tac ? 'HWTACACS' : 'RADIUS') + ' şablonu yok: ' + a.t);
            if (!T.auth) return '# [Simülatör] Şablonda kimlik doğrulama sunucusu tanımlı değil.';
            const srv = (SIM.aaa || {})[T.auth];
            if (!srv || srv.type !== (tac ? 'hwtacacs' : 'radius') || (!tac && srv.port && T.port !== srv.port)) return '# [Simülatör] Sunucudan yanıt gelmedi (zaman aşımı): adres, port ya da protokol yanlış olabilir.';
            if (srv.key !== T.key) return '# [Simülatör] Sunucu isteği yanıtsız bıraktı: paylaşılan anahtar (shared-key) uyuşmuyor.';
            if (!srv.users || srv.users[a.u] !== a.pw) return '# [Simülatör] Sunucu yanıt verdi ama kullanıcı adı/parolayı reddetti.';
            log({ event: 'aaa-ok', t: a.t });
            return 'Info: Account test succeed.';
        }
        // Yönetici girişinde denenecek yöntemler (default_admin domain'i → şema)
        function adminAuth(dom) {
            const m = M(), d = m.domains[dom || 'default_admin'];
            return d ? { methods: m.schemes[d.as] || ['local'], tac: d.tac, rad: d.rad, scheme: d.as } : null;
        }
        function macStaticAdd(a) {
            const m = M(), i = m.ifs[a.i];
            if (!i || !isPhys(a.i)) return simErr('Statik MAC yalnız fiziksel porta bağlanır.');
            if (m.vlans[a.v] === undefined) return simErr('VLAN ' + a.v + ' yok.');
            if (!vlanOnPort(i, a.v)) return simErr(a.i + ' portu VLAN ' + a.v + '\'e üye değil.');
            if (/^[0-9a-f]{1}[13579bdf]/.test(a.mac)) return simErr('Çoklu yayın (multicast) MAC statik tekil girdi olamaz.');
            m.macStatic = m.macStatic.filter(x => x.mac !== a.mac || x.vlan !== a.v).concat([{ mac: a.mac, port: a.i, vlan: a.v }]);
            delete S.learned[a.mac];
        }
        function macClear(fn) {
            Object.keys(S.learned).forEach(k => { const e = S.learned[k]; if (fn({ mac: k, port: e.port, vlan: e.vlan })) delete S.learned[k]; });
            Object.keys(S.secDyn).forEach(p => { Object.keys(S.secDyn[p]).forEach(k => { if (fn({ mac: k, port: p, vlan: S.secDyn[p][k] })) delete S.secDyn[p][k]; }); });
            S.macHold = 1;
        }
        function purgeMac(n) { Object.keys(S.learned).forEach(k => { if (S.learned[k].port === n) delete S.learned[k]; }); delete S.secDyn[n]; }
        function macEntries() {
            const m = M(), L = [];
            m.macStatic.forEach(x => L.push({ mac: x.mac, vlan: x.vlan, port: x.port, type: 'static' }));
            Object.keys(m.ifs).sort(ifCmp).forEach(n => { const i = m.ifs[n]; if (i.psec && i.psec.en && physUp(n)) i.psec.macs.forEach(x => L.push({ mac: x.mac, vlan: x.vlan, port: n, type: 'sticky' })); });
            Object.keys(S.secDyn).forEach(p => Object.keys(S.secDyn[p]).forEach(k => L.push({ mac: k, vlan: S.secDyn[p][k], port: p, type: 'security' })));
            Object.keys(S.learned).forEach(k => L.push({ mac: k, vlan: S.learned[k].vlan, port: S.learned[k].port, type: 'dynamic' }));
            return L;
        }
        function hostVlan(h, i) { return i.lt === 'access' ? i.pvid : i.lt === 'hybrid' ? 1 : (h.vlan || i.pvid); }
        function learnMacs(out) {
            const m = M();
            for (const h of SIM.hosts || []) {
                const n = h.port, i = m.ifs[n];
                if (!i || !physUp(n) || i.et !== null) continue;
                if ((h.after && !h.after(API)) || (h.until && h.until(API))) continue;
                const vlan = hostVlan(h, i);
                if (i.lt === 'trunk' && !i.allow.includes(vlan)) continue;
                if (m.vlans[vlan] === undefined) continue;
                if (m.macStatic.some(x => x.mac === h.mac)) continue;
                if (i.psec.en) {
                    const sec = i.psec.macs.map(x => x.mac).concat(Object.keys(S.secDyn[n] || {}));
                    if (sec.includes(h.mac)) continue;
                    if (sec.length < i.psec.max) {
                        delete S.learned[h.mac];
                        if (i.psec.sticky) i.psec.macs.push({ mac: h.mac, vlan }); else (S.secDyn[n] = S.secDyn[n] || {})[h.mac] = vlan;
                        continue;
                    }
                    delete S.learned[h.mac];
                    const key = n + '|' + h.mac;
                    if (S.viol[key]) continue;
                    S.viol[key] = true;
                    log({ event: 'psec', port: n, mac: h.mac, act: i.psec.act });
                    if (i.psec.act === 'shutdown') { S.errdown[n] = 'port-security'; purgeMac(n); out.push('# [Simülatör olayı] ' + n + ': güvenli olmayan MAC ' + h.mac + ' (VLAN ' + vlan + ') — eylem shutdown: port error-down durumuna geçti (L2IFPPI/4/PORTSEC_ACTION_ALARM türü alarm).'); }
                    else if (i.psec.act === 'restrict') out.push('# [Simülatör olayı] ' + n + ': güvenli olmayan MAC ' + h.mac + ' (VLAN ' + vlan + ') — eylem restrict: paketler düşürüldü, alarm üretildi (L2IFPPI/4/PORTSEC_ACTION_ALARM türü).');
                    continue;
                }
                S.learned[h.mac] = { port: n, vlan };
            }
        }
        // ── STP: yerel köprü + sabit sanal komşu köprüler (SIM.stp) + kaçak switch (SIM.bpdu portlarından)
        const MYMAC = '4c1f-cc00-0001';
        const ROGUE = Object.assign({ prio: 32768, mac: '00e0-fc00-0bad' }, SIM.rogue || {});
        const myBid = () => { const st = M().stp; return [st.root === 'primary' ? 0 : st.root === 'secondary' ? 4096 : st.prio, MYMAC]; };
        const bidLess = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
        const bidText = b => b[0] + '.' + b[1];
        function stpState() {
            const m = M(), me = myBid(), nbs = [];
            (SIM.stp || []).forEach(x => { if (physUp(x.port)) nbs.push({ port: x.port, bid: [x.prio, x.mac] }); });
            Object.keys(S.rogue).forEach(p => { if (physUp(p)) nbs.push({ port: p, bid: [ROGUE.prio, ROGUE.mac], rogue: true }); });
            let root = me, rp = null;
            nbs.slice().sort((a, b) => ifCmp(a.port, b.port)).forEach(x => { if (bidLess(x.bid, root)) { root = x.bid; rp = x.port; } });
            const ports = [];
            Object.keys(m.ifs).filter(n => isPhys(n) && m.ifs[n].et === null && physUp(n)).sort(ifCmp).forEach(n => {
                const nb = nbs.find(x => x.port === n);
                const role = n === rp ? 'ROOT' : (nb && bidLess(nb.bid, me)) ? 'ALTE' : 'DESI';
                ports.push({ port: n, role, state: role === 'ALTE' ? 'DISCARDING' : 'FORWARDING', edge: m.ifs[n].edge && !S.edgeLost[n] });
            });
            return { me, root, rp, ports, isRoot: rp === null };
        }
        function bpduTick(out) {
            const m = M();
            for (const b of SIM.bpdu || []) {
                const n = typeof b === 'string' ? b : b.port;
                if (typeof b === 'object' && b.after && !b.after(API)) continue;
                const i = m.ifs[n];
                if (!i || i.shutdown || !m.links[n] || S.errdown[n] || S.bpduSeen[n]) continue;
                if (i.edge && m.stp.bpduProt) {
                    S.errdown[n] = 'bpdu-protection'; S.bpduSeen[n] = true; delete S.rogue[n]; purgeMac(n);
                    log({ event: 'errdown', port: n, cause: 'bpdu-protection' });
                    out.push('# [Simülatör olayı] ' + n + ' kenar portundan BPDU alındı: BPDU koruması portu error-down yaptı (neden: bpdu-protection). Porta bir switch takılmış olmalı.');
                } else if (!S.rogue[n]) {
                    S.rogue[n] = true; if (i.edge) S.edgeLost[n] = true;
                    log({ event: 'rogue', port: n });
                    const st = stpState();
                    out.push('# [Simülatör olayı] ' + n + ' portundan BPDU alınıyor: porta başka bir switch bağlandı' + (i.edge ? ' (kenar port olma durumunu kaybetti)' : '') + '.' + (st.rp === n ? ' Kaçak switch KÖK KÖPRÜ oldu!' : ''));
                }
            }
        }
        // Periyodik benzetim: her komuttan sonra
        function tick() {
            if (!API) return '';
            const out = [];
            if (M().sw) { bpduTick(out); if (S.macHold > 0) S.macHold--; else learnMacs(out); }
            for (const e of SIM.events || []) {
                if (S.fired[e.id] || !e.when(API)) continue;
                S.fired[e.id] = true; log({ event: e.id });
                const t = e.fire(API); if (t) out.push(t);
            }
            return out.join('\n');
        }
        // ── NAT değerlendirme (sanal akış): { src, dst, proto, dport, in }
        function aclEvalN(n, f) { const A = M().acls[n]; if (!A) return null; const h = A.rules.find(r => aclMatch(r, f)); return h ? h.act : null; }
        function natFlow(f) {
            const m = M(), hosts = S.lab.hosts || [], pr = f.proto || 'tcp';
            const ii = m.ifs[f.in];
            if (!ii || !l3Up(f.in)) return { ok: false, reason: 'in-down' };
            const srv = ii.natSrv.find(x => x.g === f.dst && x.gp === f.dport && x.pr === pr);
            if (srv) { const r = lookup(srv.in); return { ok: !!r && hosts.includes(srv.in), dnat: { to: srv.in, port: srv.ip }, eg: r && r.ifn }; }
            const r = lookup(f.dst);
            if (!r) return { ok: false, reason: 'route' };
            const eg = m.ifs[r.ifn];
            if (!eg.natOut) return { ok: false, reason: 'nonat', eg: r.ifn };
            const act = aclEvalN(eg.natOut, f);
            if (act !== 'permit') return { ok: false, reason: act === 'deny' ? 'acl-deny' : 'acl-nomatch', eg: r.ifn };
            return { ok: hosts.includes(f.dst) && (r.proto !== 'Static' || hosts.includes(r.nh)), snat: { from: f.src, to: eg.ip }, eg: r.ifn };
        }
        function natSrvAdd(a) {
            const i = curIf();
            if (i.natSrv.some(x => x.pr === a.pr && x.g === a.g && x.gp === a.gp && (x.in !== a.in || x.ip !== a.ip))) return simErr('Bu genel adres/port başka bir iç sunucuya zaten eşlenmiş.');
            i.natSrv = i.natSrv.filter(x => !(x.pr === a.pr && x.g === a.g && x.gp === a.gp)).concat([{ pr: a.pr, g: a.g, gp: a.gp, in: a.in, ip: a.ip }]);
        }
        // ── DHCP
        function poolNet(a) {
            const len = maskLen(a.mk) >= 0 ? maskLen(a.mk) : +a.mk;
            if (len < 8 || len > 30) return pErr(colTok(3));
            if (netOf(a.n, len) !== ip2n(a.n)) return simErr('Ağ adresi maskeyle uyumlu değil (ör. ' + n2ip(netOf(a.n, len)) + ').');
            const P = M().pools[S.vx.p]; P.net = a.n; P.len = len;
        }
        function poolExcl(a) {
            const P = M().pools[S.vx.p];
            if (!P.net) return simErr('Önce havuzun ağını tanımlayın (network … mask …).');
            const b = a.b || a.a;
            if (!sameNet(a.a, P.net, P.len) || !sameNet(b, P.net, P.len) || ip2n(b) < ip2n(a.a)) return simErr('Hariç aralık havuz ağının içinde olmalı ve başlangıç ≤ bitiş.');
            if (!P.excl.some(x => x[0] === a.a && x[1] === b)) P.excl.push([a.a, b]);
        }
        function dhcpBindings() {
            const m = M(), out = [], used = new Set();
            if (!m.dhcp) return out;
            for (const c of SIM.clients || []) {
                const i = m.ifs[c.port];
                if (!i || !physUp(c.port)) continue;
                const l3n = m.sw ? 'Vlanif' + hostVlan(c, i) : c.port, l3 = m.ifs[l3n];
                if (!l3 || !l3.ip || !l3Up(l3n)) continue;
                const len = maskLen(l3.mask), net = netOf(l3.ip, len), bc = net + 2 ** (32 - len) - 1;
                if (l3.dsel === 'global') {
                    const pn = Object.keys(m.pools).find(p => m.pools[p].net && sameNet(m.pools[p].net, l3.ip, m.pools[p].len));
                    if (!pn) continue;
                    const P = m.pools[pn], ex = x => P.excl.some(e => x >= ip2n(e[0]) && x <= ip2n(e[1]));
                    let ip = null;
                    for (let x = bc - 1; x > net; x--) { if (x === ip2n(l3.ip) || (P.gw && x === ip2n(P.gw)) || ex(x) || used.has(x)) continue; ip = x; break; }
                    if (ip === null) continue;
                    used.add(ip);
                    out.push({ mac: c.mac, name: c.name, ip: n2ip(ip), pool: pn, gw: P.gw, dns: P.dns.slice(), lease: P.lease, via: 'global', l3: l3n });
                } else if (l3.dsel === 'relay') {
                    const R = SIM.relay;
                    if (!R || l3.relay !== R.server || !lookup(R.server)) continue;
                    let x = net + (R.first || 100);
                    while (used.has(x)) x++;
                    used.add(x);
                    out.push({ mac: c.mac, name: c.name, ip: n2ip(x), pool: '(uzak sunucu ' + R.server + ')', gw: l3.ip, dns: R.dns || [], lease: 8, via: 'relay', l3: l3n });
                }
            }
            return out;
        }
        // ── VRRP
        function vrrpVip(a) {
            const i = curIf();
            if (!i.ip) return simErr('Önce arayüze IP adresi verin.');
            if (!sameNet(a.vip, i.ip, maskLen(i.mask))) return simErr('Sanal IP arayüz adresiyle aynı alt ağda olmalı.');
            if (a.vip === i.ip) return simErr('Bu lab\'da sanal IP arayüzün kendi adresi olamaz (IP sahibi senaryosu yok): ayrı bir adres seçin.');
            const g = i.vrrp[a.vr] || (i.vrrp[a.vr] = { vip: null, pri: 100, delay: 0 });
            g.vip = a.vip;
        }
        function vrrpRows() {
            const m = M(), rows = [];
            Object.keys(m.ifs).sort(ifCmp).forEach(n => {
                const i = m.ifs[n];
                Object.keys(i.vrrp || {}).map(Number).sort((a, b) => a - b).forEach(vr => {
                    const g = i.vrrp[vr];
                    let st = 'Initialize';
                    if (l3Up(n) && g.vip) {
                        const P = (SIM.vrrp || []).find(p => p.ifn === n && p.vrid === vr && !(p.downWhen && p.downWhen(API)));
                        st = !P || g.pri > P.pri || (g.pri === P.pri && ip2n(i.ip) > ip2n(P.ip)) ? 'Master' : 'Backup';
                    }
                    rows.push({ vr, ifn: n, st, vip: g.vip, pri: g.pri });
                });
            });
            return rows;
        }
        // ── port grubu
        function pgMember(a, rm) {
            const G = M().pgs[S.vx.g];
            const from = a.a, to = a.b || a.a;
            if (!isPhys(from) || !isPhys(to)) return simErr('Port grubuna yalnız fiziksel portlar eklenir.');
            const x = ifNums(from), y = ifNums(to);
            if (x[0] !== y[0] || x[1] !== y[1] || x[2] > y[2]) return simErr('Aralık aynı kartta ve artan sırada olmalı (ör. GigabitEthernet0/0/1 to GigabitEthernet0/0/8).');
            for (let k = x[2]; k <= y[2]; k++) {
                const n = 'GigabitEthernet' + x[0] + '/' + x[1] + '/' + k;
                if (!M().ifs[n]) return simErr(n + ' bu cihazda yok.');
                if (rm) { const j = G.indexOf(n); if (j >= 0) G.splice(j, 1); } else if (!G.includes(n)) G.push(n);
            }
            G.sort(ifCmp);
        }
        // ── yedekleme / dosyalar
        const fileOk = f => /^[A-Za-z0-9_.-]{1,48}\.(cfg|zip)$/.test(f);
        function startupSet(a) {
            if (!S.files[a.f]) return simErr('flash:/' + a.f + ' bulunamadı. Önce "save ' + a.f + '" ile oluşturun ya da dir ile dosyalara bakın.');
            S.next = a.f;
        }
        const fsize = f => runBody(S.files[f].m).length + 120;
        function showDir() {
            const L = ['Directory of flash:/', '', '  Idx  Attr     Size(Byte)  Date        Time(LMT)  FileName ', '    0  -rw-     31,461,688  Sep 25 2026 08:00:00   s5700-sim.cc'];
            Object.keys(S.files).sort().forEach((f, k) => L.push(padL(k + 1, 5) + '  -rw-  ' + padL(fsize(f).toLocaleString('en-US'), 13) + '  Sep 25 2026 09:' + String(10 + (S.files[f].t % 50)).padStart(2, '0') + ':00   ' + f));
            L.push('', '# [Simülatör] Flash boyutu/boş alan bilgisi gösterilmiyor.');
            return L.join('\n');
        }
        function showStartup() {
            return ['MainBoard: ', '  Configured startup system software:        flash:/s5700-sim.cc', '  Startup system software:                   flash:/s5700-sim.cc', '  Next startup system software:              flash:/s5700-sim.cc',
                '  Startup saved-configuration file:          ' + (S.files[S.cur] ? 'flash:/' + S.cur : 'NULL'), '  Next startup saved-configuration file:     ' + (S.files[S.next] ? 'flash:/' + S.next : 'NULL'),
                '  Startup paf file:                          default', '  Next startup paf file:                     default', '  Startup patch package:                     NULL', '  Next startup patch package:                NULL'].join('\n');
        }
        function tftpPut(a) {
            if (!S.files[a.src]) return simErr('flash:/' + a.src + ' bulunamadı (dir ile dosyalara bakın).');
            const hosts = S.lab.hosts || [];
            if (!hosts.includes(a.ip) || !lookup(a.ip)) return '# [Simülatör] TFTP sunucusu ' + a.ip + ' yanıt vermiyor (zaman aşımı). Adres ve yönlendirmeyi kontrol edin.';
            S.tftp.push({ server: a.ip, src: a.src, dst: a.dst || a.src, m: clone(S.files[a.src].m) });
            return 'Info: Transfer file in binary mode.\n# [Simülatör] ' + fsize(a.src) + ' bayt ' + a.ip + ' sunucusuna "' + (a.dst || a.src) + '" adıyla gönderildi.';
        }
        function compareCfg() {
            const nx = savedM();
            if (!nx) return '# [Simülatör] Karşılaştırılacak kayıtlı yapılandırma yok (sonraki açılış dosyası boş).';
            const a = curText().split('\n'), b = runBody(nx).split('\n');
            const add = a.filter(l => !b.includes(l) && l !== '#'), del = b.filter(l => !a.includes(l) && l !== '#');
            if (!add.length && !del.length) return '# [Simülatör] Çalışan yapılandırma ile flash:/' + S.next + ' aynı.';
            return ['# [Simülatör] Çalışan yapılandırma ile flash:/' + S.next + ' farkı (biçim gerçek cihazdan farklıdır):'].concat(add.map(l => '+ ' + l), del.map(l => '- ' + l)).join('\n');
        }
        // ── display çıktıları (yeni)
        function showMac(fn) {
            const E = macEntries().filter(e => !fn || fn(e)), H = '-'.repeat(79);
            const L = [H, 'MAC Address    VLAN/       PEVLAN CEVLAN Port            Type      LSP/LSR-ID  ', '               VSI/SI                                              MAC-Tunnel  ', H];
            E.forEach(e => L.push(pad(e.mac, 15) + pad(e.vlan, 12) + pad('-', 7) + pad('-', 7) + pad(ifShort(e.port), 16) + pad(e.type, 10) + '-'));
            L.push(H, 'Total matching items on slot 0 displayed = ' + E.length, '');
            return L.join('\n');
        }
        function showStpBrief() {
            const st = stpState();
            const L = [' MSTID  Port                        Role  STP State     Protection'];
            st.ports.forEach(p => L.push(pad('    0', 8) + pad(p.port, 28) + pad(p.role, 6) + pad(p.state, 16) + 'NONE'));
            return L.join('\n');
        }
        function showStp() {
            const st = stpState(), m = M();
            return ['-------[CIST Global Info][Mode ' + m.stp.mode.toUpperCase() + ']-------', 'CIST Bridge         :' + bidText(st.me), 'Config Times        :Hello 2s MaxAge 20s FwDly 15s MaxHop 20',
                'Active Times        :Hello 2s MaxAge 20s FwDly 15s MaxHop 20', 'CIST Root/ERPC      :' + bidText(st.root) + ' / ' + (st.rp ? 20000 : 0), 'CIST RegRoot/IRPC   :' + bidText(st.me) + ' / 0',
                'CIST RootPortId     :' + (st.rp ? '128.' + ifNums(st.rp)[2] : '0.0'), 'BPDU-Protection     :' + (m.stp.bpduProt ? 'Enabled' : 'Disabled'),
                '# [Simülatör] Port bazlı ayrıntılar bu sürümde gösterilmiyor; rol/durum için: display stp brief'].join('\n');
        }
        function showIfDetail(n) {
            const m = M(), i = m.ifs[n];
            if (!i) return '# [Simülatör] Böyle bir arayüz yok.';
            const up = ifUp(n);
            const st = S.errdown[n] ? 'ERROR DOWN(' + S.errdown[n] + ')' : i.shutdown ? 'Administratively DOWN' : up ? 'UP' : 'DOWN';
            const L = [n + ' current state : ' + st, 'Line protocol current state : ' + (up && (isPhys(n) && m.sw || i.ip) ? 'UP' : 'DOWN'), 'Description:' + (i.desc || '')];
            if (isPhys(n)) {
                if (m.sw) L.push('Switch Port, PVID : ' + padL(i.pvid, 4) + ', TPID : 8100(Hex), The Maximum Frame Length is 9216');
                else L.push('Route Port,The Maximum Transmit Unit is 1500', 'Internet Address is ' + (i.ip ? i.ip + '/' + maskLen(i.mask) : 'not configured'));
                L.push('IP Sending Frames\' Format is PKTFMT_ETHNT_2, Hardware address is ' + MYMAC, 'Port Mode: COMMON COPPER');
                const sp = up ? (i.speed || 1000) : (i.speed || 'AUTO'), du = up ? (i.duplex ? i.duplex.toUpperCase() : 'FULL') : (i.duplex ? i.duplex.toUpperCase() : 'AUTO');
                L.push('Speed : ' + sp + ',  Loopback: NONE', 'Duplex: ' + du + ',  Negotiation: ' + (i.neg ? 'ENABLE' : 'DISABLE'), 'Mdi   : AUTO');
            } else if (i.ip) L.push('Internet Address is ' + i.ip + '/' + maskLen(i.mask));
            L.push('# [Simülatör] Trafik sayaçları (Input/Output) bu lab sürümünde gösterilmiyor.');
            return L.join('\n');
        }
        function showHttp() {
            const h = M().http;
            return ['# [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden.', '  HTTP Server Status              : ' + (h.server ? 'enabled' : 'disabled'), '  HTTP Server Port                : 80',
                '  HTTP Secure-server Status       : ' + (h.secure ? 'enabled' : 'disabled'), '  HTTP Secure-server Port         : 443'].join('\n');
        }
        function showSshSrv() {
            const m = M();
            return [' SSH version                                :1.99', ' SSH connection timeout                     :' + m.sshc.timeout + ' seconds', ' SSH server key generating interval         :0 hours',
                ' SSH authentication retries                 :' + m.sshc.retries + ' times', ' SFTP Server                                :Disable', ' Stelnet server                             :' + (m.stelnet ? 'Enable' : 'Disable'),
                '# [Simülatör] Algoritma listeleri (lab modelinden):', '#   cipher        : ' + sshList('cipher').join(' ') + (m.sshc.cipher ? '' : '  (varsayılan)'),
                '#   hmac          : ' + sshList('hmac').join(' ') + (m.sshc.hmac ? '' : '  (varsayılan)'), '#   key-exchange  : ' + sshList('kex').join(' ') + (m.sshc.kex ? '' : '  (varsayılan)')].join('\n');
        }
        function showNatOut() {
            const m = M(), L = ['# [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden.', ' NAT Outbound Information:', ' ' + '-'.repeat(60), ' Interface                     Acl     Address-group/IP      Type', ' ' + '-'.repeat(60)];
            let n = 0;
            Object.keys(m.ifs).sort(ifCmp).forEach(k => { const i = m.ifs[k]; if (i.natOut) { n++; L.push(' ' + pad(k, 30) + pad(i.natOut, 8) + pad(i.ip || '0.0.0.0', 22) + 'easyip'); } });
            L.push(' ' + '-'.repeat(60), '  Total : ' + n);
            return L.join('\n');
        }
        function showNatSrv() {
            const m = M(), L = ['# [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden.', '  Nat Server Information:'];
            let n = 0;
            Object.keys(m.ifs).sort(ifCmp).forEach(k => m.ifs[k].natSrv.forEach(x => { n++; L.push('  Interface  : ' + k, '    Global IP/Port     : ' + x.g + '/' + x.gp, '    Inside IP/Port     : ' + x.in + '/' + x.ip, '    Protocol : ' + (x.pr === 'tcp' ? '6(tcp)' : '17(udp)'), ''); }));
            L.push('  Total :    ' + n);
            return L.join('\n');
        }
        function showNatSess() {
            const L = ['# [Simülatör] Oturumlar lab\'daki sanal trafikten üretilir; biçim yaklaşıktır.', '  NAT Session Table Information:', ''];
            let n = 0, port = 10240;
            (SIM.flows || []).forEach(f => {
                const r = natFlow(f);
                if (!r.ok || (!r.snat && !r.dnat)) return;
                n++;
                L.push('     Protocol          : ' + ((f.proto || 'tcp') === 'udp' ? 'UDP(17)' : 'TCP(6)'), '     SrcAddr   Port Vpn: ' + pad(f.src, 16) + (r.snat ? 1025 + n : 50000 + n), '     DestAddr  Port Vpn: ' + pad(f.dst, 16) + f.dport,
                    '     NAT-Info', '       New SrcAddr     : ' + (r.snat ? r.snat.to : '----'), '       New SrcPort     : ' + (r.snat ? port++ : '----'), '       New DestAddr    : ' + (r.dnat ? r.dnat.to : '----'), '       New DestPort    : ' + (r.dnat ? r.dnat.port : '----'), '');
            });
            L.push('  Total : ' + n);
            return L.join('\n');
        }
        function showPools() {
            const m = M(), L = ['# [Simülatör] Biçim yaklaşıktır.', '  Pool-name      : Gateway-0       Network/Mask          Excl  Used'];
            const B = dhcpBindings();
            Object.keys(m.pools).sort().forEach(p => { const P = m.pools[p]; L.push('  ' + pad(p, 15) + ': ' + pad(P.gw || '-', 16) + pad(P.net ? P.net + '/' + P.len : '-', 22) + pad(P.excl.length, 6) + B.filter(b => b.pool === p).length); });
            return L.join('\n');
        }
        function showPool(p, used) {
            const m = M(), P = m.pools[p];
            if (!P) return '# [Simülatör] Böyle bir havuz yok: ' + p;
            const B = dhcpBindings().filter(b => b.pool === p);
            const L = ['# [Simülatör] Biçim yaklaşıktır; bağlamalar lab\'daki sanal istemcilerden üretilir.', '  Pool-name      : ' + p, '  Gateway-0      : ' + (P.gw || '-'), '  Network        : ' + (P.net || '-'),
                '  Mask           : ' + (P.len ? lenMask(P.len) : '-'), '  Lease          : ' + P.lease + ' Days 0 Hours 0 Minutes', '  DNS-server0    : ' + (P.dns[0] || '-')];
            P.excl.forEach(e => L.push('  Excluded       : ' + e[0] + (e[1] !== e[0] ? ' - ' + e[1] : '')));
            if (used !== false) { L.push('', '  IP               MAC              Status   Client'); B.forEach(b => L.push('  ' + pad(b.ip, 17) + pad(b.mac, 17) + pad('Used', 9) + (b.name || ''))); L.push('  Used: ' + B.length); }
            return L.join('\n');
        }
        function showVrrp() {
            const R = vrrpRows(), H = '-'.repeat(64);
            const L = ['Total:' + pad(R.length, 6) + 'Master:' + pad(R.filter(r => r.st === 'Master').length, 6) + 'Backup:' + pad(R.filter(r => r.st === 'Backup').length, 6) + 'Non-active:' + R.filter(r => r.st === 'Initialize').length + '      ',
                'VRID  State        Interface                Type     Virtual IP     ', H];
            R.forEach(r => L.push(pad(r.vr, 6) + pad(r.st, 13) + pad(r.ifn, 25) + pad('Normal', 9) + r.vip));
            return L.join('\n');
        }

        // ── durum sorguları
        const vlanOnPort = (i, v) => i.lt === 'access' ? i.pvid === v : i.lt === 'trunk' ? (i.allow.includes(v) || i.pvid === v) : i.lt === 'hybrid' ? v === 1 : false;
        const etMembers = n => Object.keys(M().ifs).filter(k => isPhys(k) && M().ifs[k].et === n).sort(ifCmp);
        const physUp = n => !!M().ifs[n] && !M().ifs[n].shutdown && !!M().links[n] && !S.errdown[n];
        function ifUp(n) {
            const m = M(), i = m.ifs[n];
            if (!i || i.shutdown) return false;
            if (isPhys(n)) return !!m.links[n] && !S.errdown[n];
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
        const noLinks = m => JSON.stringify(Object.assign({}, m, { links: null }));
        function savedM() { return S.files[S.next] ? S.files[S.next].m : null; }
        function isSaved() { return !!savedM() && noLinks(savedM()) === noLinks(M()); }
        function saveTo(f) { S.files[f] = { m: clone(M()), t: ++S.clock }; }
        function save() { saveTo(S.next); }

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
            if (i.neg === false) L.push(' undo negotiation auto');
            if (i.speed) L.push(' speed ' + i.speed);
            if (i.duplex) L.push(' duplex ' + i.duplex);
            if (i.psec && i.psec.en) {
                L.push(' port-security enable');
                if (i.psec.act !== 'restrict') L.push(' port-security protect-action ' + i.psec.act);
                if (i.psec.max !== 1) L.push(' port-security max-mac-num ' + i.psec.max);
                if (i.psec.sticky) L.push(' port-security mac-address sticky');
                i.psec.macs.forEach(x => L.push(' port-security mac-address sticky ' + x.mac + ' vlan ' + x.vlan));
            }
            if (i.edge) L.push(' stp edged-port enable');
            if (i.et !== null) L.push(' eth-trunk ' + i.et);
            if (i.ip) L.push(' ip address ' + i.ip + ' ' + i.mask);
            Object.keys(i.vrrp || {}).map(Number).sort((a, b) => a - b).forEach(v => { const g = i.vrrp[v]; if (g.vip) L.push(' vrrp vrid ' + v + ' virtual-ip ' + g.vip); if (g.pri !== 100) L.push(' vrrp vrid ' + v + ' priority ' + g.pri); if (g.delay) L.push(' vrrp vrid ' + v + ' preempt-mode timer delay ' + g.delay); });
            if (i.dsel) L.push(' dhcp select ' + i.dsel);
            if (i.relay) L.push(' dhcp relay server-ip ' + i.relay);
            (i.natSrv || []).forEach(x => L.push(' nat server protocol ' + x.pr + ' global ' + x.g + ' ' + x.gp + ' inside ' + x.in + ' ' + x.ip));
            if (i.natOut) L.push(' nat outbound ' + i.natOut);
            if (i.tfIn) L.push(' traffic-filter inbound acl ' + i.tfIn);
            if (i.tfOut) L.push(' traffic-filter outbound acl ' + i.tfOut);
            return L;
        }
        function runBody(m) {
            const L = ['#', 'sysname ' + m.sysname, '#'];
            const vl = Object.keys(m.vlans).map(Number).filter(v => v !== 1).sort((a, b) => a - b);
            if (m.sw && vl.length) L.push('vlan batch ' + vlansText(vl), '#');
            const g1 = [];
            if (m.sw && m.stp.mode !== 'mstp') g1.push('stp mode ' + m.stp.mode);
            if (m.sw && m.stp.root) g1.push('stp root ' + m.stp.root); else if (m.sw && m.stp.prio !== 32768) g1.push('stp priority ' + m.stp.prio);
            if (m.sw && m.stp.bpduProt) g1.push('stp bpdu-protection');
            if (m.edr) g1.push('error-down auto-recovery cause bpdu-protection interval ' + m.edr);
            if (m.dhcp) g1.push('dhcp enable');
            if (!m.http.server) g1.push('undo http server enable');
            if (!m.http.secure) g1.push('undo http secure-server enable');
            if (m.macAging !== 300) g1.push('mac-address aging-time ' + m.macAging);
            if (g1.length) L.push(...g1, '#');
            for (const t of Object.keys(m.rad).sort()) { const x = m.rad[t]; L.push('radius-server template ' + t); if (x.key) L.push(' radius-server shared-key cipher %^%#' + fakeHash('r' + t + x.key, 24) + '%^%#'); if (x.auth) L.push(' radius-server authentication ' + x.auth + ' ' + x.port + ' weight 80'); if (x.acct) L.push(' radius-server accounting ' + x.acct + ' weight 80'); L.push('#'); }
            for (const t of Object.keys(m.tac).sort()) { const x = m.tac[t]; L.push('hwtacacs-server template ' + t); if (x.auth) L.push(' hwtacacs-server authentication ' + x.auth); if (x.author) L.push(' hwtacacs-server authorization ' + x.author); if (x.acct) L.push(' hwtacacs-server accounting ' + x.acct); if (x.key) L.push(' hwtacacs-server shared-key cipher %^%#' + fakeHash('t' + t + x.key, 24) + '%^%#'); L.push('#'); }
            vl.filter(v => m.vlans[v]).forEach(v => L.push('vlan ' + v, ' description ' + m.vlans[v], '#'));
            for (const n of Object.keys(m.acls).map(Number).sort((a, b) => a - b)) {
                L.push('acl number ' + n);
                m.acls[n].rules.forEach(r => L.push(' ' + ruleText(r)));
                L.push('#');
            }
            L.push('aaa', ' authentication-scheme default');
            Object.keys(m.schemes).filter(k => k !== 'default').sort().forEach(k => { L.push(' authentication-scheme ' + k); if (m.schemes[k].join(' ') !== 'local') L.push('  authentication-mode ' + m.schemes[k].join(' ')); });
            L.push(' authorization-scheme default', ' accounting-scheme default');
            Object.keys(m.domains).forEach(d => { const x = m.domains[d]; L.push(' domain ' + d); if (x.as !== 'default') L.push('  authentication-scheme ' + x.as); if (x.tac) L.push('  hwtacacs-server ' + x.tac); if (x.rad) L.push('  radius-server ' + x.rad); });
            for (const [u, x] of Object.entries(m.users)) {
                if (x.pw) L.push(' local-user ' + u + ' password irreversible-cipher $1a$' + fakeHash(u + x.pw, 40) + '$');
                if (x.level !== null) L.push(' local-user ' + u + ' privilege level ' + x.level);
                if (x.svc.length) L.push(' local-user ' + u + ' service-type ' + x.svc.join(' '));
            }
            L.push('#');
            for (const p of Object.keys(m.pools).sort()) { const P = m.pools[p]; L.push('ip pool ' + p); if (P.gw) L.push(' gateway-list ' + P.gw); if (P.net) L.push(' network ' + P.net + ' mask ' + lenMask(P.len)); P.excl.forEach(e => L.push(' excluded-ip-address ' + e[0] + (e[1] !== e[0] ? ' ' + e[1] : ''))); if (P.lease !== 1) L.push(' lease day ' + P.lease); if (P.dns.length) L.push(' dns-list ' + P.dns.join(' ')); L.push('#'); }
            for (const n of Object.keys(m.ifs).sort(ifCmp)) { L.push(...ifBlock(m, n)); L.push('#'); }
            for (const g of Object.keys(m.pgs).sort()) { L.push('port-group ' + g); m.pgs[g].forEach(n => L.push(' group-member ' + n)); L.push('#'); }
            m.macStatic.forEach(x => L.push('mac-address static ' + x.mac + ' ' + x.port + ' vlan ' + x.vlan));
            if (m.macStatic.length) L.push('#');
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
            if (m.sshc.cipher) sshL.push('ssh server cipher ' + m.sshc.cipher.join(' '));
            if (m.sshc.hmac) sshL.push('ssh server hmac ' + m.sshc.hmac.join(' '));
            if (m.sshc.kex) sshL.push('ssh server key-exchange ' + m.sshc.kex.join(' '));
            if (m.sshc.timeout !== 60) sshL.push('ssh server timeout ' + m.sshc.timeout);
            if (m.sshc.retries !== 3) sshL.push('ssh server authentication-retries ' + m.sshc.retries);
            for (const [u, x] of Object.entries(m.sshUsers)) { if (x.auth) sshL.push('ssh user ' + u + ' authentication-type ' + x.auth); if (x.svc) sshL.push('ssh user ' + u + ' service-type ' + x.svc); }
            if (sshL.length) L.push(...sshL, '#');
            if (m.header.login) L.push('header login information "' + m.header.login + '"');
            if (m.header.shell) L.push('header shell information "' + m.header.shell + '"');
            if (m.header.login || m.header.shell) L.push('#');
            L.push('user-interface con 0');
            if (m.con.auth) L.push(' authentication-mode ' + m.con.auth);
            if (m.con.pw) L.push(' set authentication password cipher $1a$' + fakeHash('c' + m.con.pw, 40) + '$');
            if (m.con.idle) L.push(' idle-timeout ' + m.con.idle);
            L.push('user-interface vty 0 4');
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
            else if (v === 'con') { L = ['user-interface con 0']; if (m.con.auth) L.push(' authentication-mode ' + m.con.auth); if (m.con.pw) L.push(' set authentication password cipher $1a$' + fakeHash('c' + m.con.pw, 40) + '$'); }
            else if (v === 'tac' || v === 'rad' || v === 'pool' || v === 'pg') { const blk = runBody(m).split('\n'), head = { tac: 'hwtacacs-server template ' + S.vx.t, rad: 'radius-server template ' + S.vx.t, pool: 'ip pool ' + S.vx.p, pg: 'port-group ' + S.vx.g }[v]; const k = blk.indexOf(head); L = [head]; for (let j = k + 1; k >= 0 && j < blk.length && blk[j].startsWith(' '); j++) L.push(blk[j]); }
            else if (v === 'ascheme') { L = ['authentication-scheme ' + S.vx.n, ' authentication-mode ' + m.schemes[S.vx.n].join(' ')]; }
            else if (v === 'domain') { const d = m.domains[S.vx.d]; L = ['domain ' + S.vx.d]; if (d.as !== 'default') L.push(' authentication-scheme ' + d.as); if (d.tac) L.push(' hwtacacs-server ' + d.tac); if (d.rad) L.push(' radius-server ' + d.rad); }
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
            if ((r.err === 'invalid' || r.err === 'incomplete' || r.err === 'toomany') && unsupported(raw, r.err === 'incomplete')) { S.ev[S.ev.length - 1].err = 'unsupported'; return '# [Simülatör] Bu komut gerçek VRP\'de var ama bu lab sürümünde desteklenmiyor. ? ile desteklenenleri görün.'; }
            return ' '.repeat(promptText().length + (r.col || 0)) + '^\nError: ' + (ERRT[r.err] || ERRT.invalid) + ' found at \'^\' position.';
        }
        const UNSUP = ['display device', 'display health', 'display cpu-usage', 'display cpu', 'display memory', 'display alarm', 'display stp interface', 'display stp region-configuration', 'display lldp', 'display arp',
            'display ospf interface', 'display ospf routing', 'display ospf lsdb', 'display ospf error', 'display ospf brief', 'display ospf peer', 'display bgp', 'display nat address-group', 'display dhcp', 'display ssh user-information',
            'display ntp', 'display logbuffer', 'display trapbuffer', 'display interface description', 'display clock', 'display users', 'display user-interface', 'display local-user', 'display error-down',
            'display lacp', 'display vrrp verbose', 'display ip routing-table protocol', 'display ip routing-table verbose', 'display vlan summary', 'display counters', 'display diagnostic-information', 'display patch-information',
            'display mac-address aging-time', 'display mac-address summary', 'display hwtacacs-server', 'display radius-server', 'display domain', 'display aaa', 'display ssh server session', 'display configuration',
            'stp region-configuration', 'stp instance', 'stp cost', 'stp port', 'stp loop-protection', 'stp root-protection', 'stp bpdu-filter', 'stp tc-protection', 'stp pathcost-standard', 'stp enable', 'stp edged-port default',
            'lldp', 'dhcp snooping', 'dhcp server', 'nat address-group', 'nat static', 'nat alg', 'ntp-service', 'snmp-agent', 'info-center', 'bgp', 'isis', 'rip', 'loopback-detect', 'port-isolate',
            'port-security aging-time', 'port-security mac-address', 'mac-address learning', 'mac-address limit', 'mac-address blackhole', 'mac-address flapping',
            'traffic classifier', 'traffic behavior', 'traffic policy', 'traffic-policy', 'tracert', 'reset', 'clock', 'telnet', 'ftp', 'sftp', 'scp', 'delete', 'copy', 'move', 'terminal',
            'undo terminal', 'debugging', 'port hybrid', 'interface range', 'ip dhcp', 'ospf cost', 'ospf timer', 'ospf network-type', 'mtu', 'jumboframe',
            'lacp', 'max active-linknumber', 'least active-linknumber', 'trunkport', 'default-route-advertise', 'import-route', 'authorization-scheme', 'accounting-scheme', 'user-interface maximum-vty',
            'hwtacacs-server source-ip', 'radius-server source-ip', 'hwtacacs enable', 'ssh server port', 'ssh server rekey-interval', 'ssh client', 'http timeout', 'http acl',
            'vrrp vrid track', 'vrrp vrid authentication-mode', 'ip pool extend', 'set save-configuration', 'startup system-software', 'schedule reboot'];
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
            if (!r.ok && (S.view === 'ascheme' || S.view === 'domain')) { const r1 = tryIn(AAAV); if (r1.ok) { r = r1; fell = true; } }
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
            let out;
            if (S.view === 'pg' && !fell && IFC.includes(r.cmd)) {
                // Port grubu: komut her üye portta ayrı ayrı çalışır ve VRP her üye için satırı yankılar
                const G = M().pgs[S.vx.g];
                if (!G.length) { S.ev.pop(); log({ raw: line, err: 'sim', view: S.view }); return '# [Simülatör] Port grubunda üye yok: önce group-member ile port ekleyin.'; }
                const echo = [], g = S.vx.g;
                for (const n of G) {
                    S.view = 'if'; S.vx = { if: n };
                    const o = isUndo ? r.cmd.undo(r.args) : r.cmd.run(r.args);
                    echo.push('[' + M().sysname + '-' + n + ']' + line.trim());
                    if (o && typeof o === 'object') { S.view = 'pg'; S.vx = { g }; S.ev.pop(); if (o.sim) { log({ raw: line, err: 'sim', view: 'pg' }); return echo.join('\n') + '\n# [Simülatör] ' + n + ': ' + o.sim; } return echo.join('\n') + '\n' + errText(o, line); }
                    if (o) echo.push(o);
                }
                S.view = 'pg'; S.vx = { g };
                out = echo.join('\n');
            } else out = isUndo ? r.cmd.undo(r.args) : r.cmd.run(r.args);
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
            if (v === 'con') return '[' + n + '-ui-console0]';
            if (v === 'tac') return '[' + n + '-hwtacacs-' + x.t + ']';
            if (v === 'rad') return '[' + n + '-radius-' + x.t + ']';
            if (v === 'ascheme') return '[' + n + '-aaa-authen-' + x.n + ']';
            if (v === 'domain') return '[' + n + '-aaa-domain-' + x.d + ']';
            if (v === 'pool') return '[' + n + '-ip-pool-' + x.p + ']';
            if (v === 'pg') return '[' + n + '-port-group-' + x.g + ']';
            return '[' + n + ']';
        }
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw, prompt: true }); const o = p.fn(raw.trim()); if (S.pending || S.loggedOut) return o; const t = tick(); return t ? (o ? o + '\n' : '') + t : o; }
            if (S.loggedOut) { S.loggedOut = false; return ''; }
            if (raw === '\x1a') { if (S.view !== 'user') { S.view = 'user'; S.vx = {}; } return ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            const o = execLine(line);
            if (S.pending || S.loggedOut) return o;
            const t = tick();
            return t ? (o ? o + '\n' : '') + t : o;
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
            if (h.err && (S.view === 'ascheme' || S.view === 'domain')) { const h1 = help(avail(AAAV, undo), body, ctx, kh); if (!h1.err) h = h1; }
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
            event: (id, fn) => S.ev.some(e => e.event === id && (!fn || fn(e))),
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon.toLowerCase()),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            err: k => S.ev.some(e => e.err === k),
            after: (reA, reB) => { const i = S.ev.findIndex(e => e.canon && reA.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && reB.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err === 'invalid'); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            ranIn: (re, view) => S.ev.some(e => e.canon && re.test(e.canon) && e.view === view),
            list: () => S.ev
        };

        API = {
            vendor: 'huawei',
            prompt: promptText,
            secret: () => false,
            input, help: helpFn, complete: completeFn,
            _toPriv: () => { S.view = 'user'; S.vx = {}; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => variant,
            get model() { return S.m; },
            get savedModel() { return savedM(); },
            ev: E,
            saved: isSaved,
            view: () => S.view,
            mode: () => S.view,
            ifUp, rib, peer: peerState, decide,
            aclEval: (n, f) => { const A = S.m.acls[n]; if (!A) return null; const h = A.rules.find(r => aclMatch(r, f)); return h ? h.act : null; },
            showRun: () => runBody(M()),
            // öğrenme yolu kancaları
            macs: () => macEntries(), stp: () => stpState(), errdown: n => S.errdown[n] || null, nat: f => natFlow(f), dhcp: () => dhcpBindings(), vrrp: () => vrrpRows(),
            adminAuth, files: () => Object.keys(S.files), fileModel: f => S.files[f] ? S.files[f].m : null, nextStartup: () => S.next, curStartup: () => S.cur, tftpLog: () => S.tftp,
            saveTo: f => saveTo(f), ssh: k => sshList(k), SSH_WEAK, sim: SIM,
        };
        if (S.m.sw) learnMacs([]);   // açılışta bağlı cihazların MAC'leri zaten öğrenilmiş olsun
        return API;
    }

    return { session, ifNorm };
})();
// Motor kayıt defteri: vendor anahtarı → motor
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { huawei: CgLabVrp });
if (typeof module !== 'undefined') module.exports = CgLabVrp;
