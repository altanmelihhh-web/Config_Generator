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
// Öğrenme yolu eklemeleri (2026-09-25) — sözdizimi kaynakları:
//  - banner motd/login ayraçlı giriş, "Enter TEXT message. End with the character '%'.", running'de ^C:
//    https://www.dell.com/support/kbdoc/en-us/000124456/how-to-configure-login-and-motd-banner-in-dell-emc-networking-os10-series-switch
//  - radius-server host / aaa authentication login default group radius local: OS10 UG 10.5 "aaa authentication login"
//  - ip ssh server cipher|kex|mac, show ip ssh algoritma listeleri: OS10 UG 10.5.x "SSH server" / "show ip ssh"
//  - ip dhcp server → no disable → pool → network/default-router/range, show ip dhcp binding: OS10 UG 10.5 "Automatic address allocation"
//  - switchport port-security → (config-if-port-sec) no disable / mac-learn limit / mac-learn limit violation: OS10 UG 10.5.1 "Port security"
//  - spanning-tree port type edge / bpduguard enable / rstp priority (4096 katı), varsayılan Rapid-PVST: OS10 UG "BPDU extensions"
//  - vrrp-group / virtual-address / priority, (conf-vlan10-vrid-10) istemi, show vrrp brief sütunları:
//    https://www.dell.com/support/kbdoc/en-us/000223071/configuring-vrrp-on-dell-networking-smartfabric-os10
//  - ip route önek next-hop [route-preference]: OS10 UG "Configure static routing"
//  - channel-group N mode active, show port-channel summary, mac address-table, copy … config:// / scp://: komut kütüphanesi (assets/data/cli/dell.js)
// Biçimi doğrulanamayan çıktılar (show spanning-tree brief, show switchport port-security, show ip ospf neighbor, show ip access-lists,
// dir config, show ip ssh düzeni, olay iletileri) "% [Simülatör]" etiketlidir.
const CgLabOs10 = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, lenMask, netOf, sameNet, ip2n, n2ip, fakeHash } = C;
    const clone = o => JSON.parse(JSON.stringify(o));
    const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };

    // ── Arayüz adları: kanonik 'ethernet1/1/1', 'vlan10', 'mgmt1/1/1', 'loopback0'
    const IFT = [['ethernet', 3], ['vlan', 1], ['mgmt', 3], ['loopback', 1], ['port-channel', 1]];
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
    const isPc = n => /^port-channel/.test(n);
    const isL2p = n => isEth(n) || isPc(n);
    const ORD = ['ethernet', 'port-channel', 'mgmt', 'vlan', 'loopback'];
    function ifCmp(a, b) {
        const ta = ORD.indexOf(ifType(a)), tb = ORD.indexOf(ifType(b));
        if (ta !== tb) return ta - tb;
        const na = ifNums(a), nb = ifNums(b);
        for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
        return 0;
    }
    const LONG = { ethernet: 'Ethernet', vlan: 'Vlan', mgmt: 'Management', loopback: 'Loopback', 'port-channel': 'Port-channel' };
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
        MAC: { ok: t => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/i.test(t), val: t => t.toLowerCase(), label: 'nn:nn:nn:nn:nn:nn' },
        URL: { ok: t => /^config:\/\/[A-Za-z0-9_.-]+\.xml$/.test(t) || /^(tftp|scp|ftp|sftp):\/\/[^\s]+$/.test(t), label: 'config://dosya.xml | tftp://sunucu/dosya' },
        AREA: { ok: t => (/^\d+$/.test(t) && +t <= 4294967295) || isIp(t), val: t => /^\d+$/.test(t) ? n2ip(+t) : t, label: 'A.B.C.D | <0-4294967295>' },
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
        // öğrenme yolu eklemeleri
        banner: 'Giriş/oturum afişi', login: 'Girişten önce gösterilen afiş / giriş yöntemi', motd: 'Günün mesajı (girişten sonra)', 'radius-server': 'RADIUS sunucusu', 'tacacs-server': 'TACACS+ sunucusu',
        host: 'Sunucu / tek host adresi', key: 'Paylaşılan gizli anahtar', aaa: 'AAA ayarları', authentication: 'Kimlik doğrulama', default: 'Varsayılan (SSH/Telnet girişleri)', console: 'Konsol girişi',
        cipher: 'SSH şifreleme algoritmaları', kex: 'SSH anahtar değişimi algoritmaları', mac: 'SSH bütünlük (MAC) algoritmaları / MAC adres tablosu', rest: 'REST API', api: 'API', restconf: 'RESTCONF (HTTPS) sunucusu',
        pool: 'DHCP adres havuzu', network: 'Havuz ağı', 'default-router': 'İstemci ağ geçidi', 'dns-server': 'DNS sunucusu', range: 'Arayüz aralığı / dağıtılacak adres aralığı', lease: 'Kira süresi (gün)', disable: 'Kapat', 'helper-address': 'DHCP relay: isteği bu sunucuya ilet',
        'address-table': 'MAC adres tablosu', static: 'Statik girdi', 'aging-time': 'Yaşlanma süresi (saniye)', clear: 'Temizle', dynamic: 'Dinamik girdiler', all: 'Tümü', count: 'Sayılar',
        'spanning-tree': 'Yayılan ağaç (STP)', rstp: 'Hızlı STP', 'rapid-pvst': 'VLAN başına hızlı STP (varsayılan)', mst: 'Çoklu STP', priority: 'Öncelik (küçük = kök olmaya yakın)', bpduguard: 'Porta BPDU gelirse portu kapat',
        port: 'Port ayarları', type: 'Port tipi', edge: 'Kenar port (uç cihaz)', brief: 'Kısa özet', 'port-security': 'Port güvenliği', 'mac-learn': 'MAC öğrenme', limit: 'Sınır', violation: 'İhlal eylemi',
        drop: 'Sessizce düşür', log: 'Düşür + log', 'port-channel': 'Port-channel (LAG)', 'channel-group': 'Portu port-channel\'a ekle', active: 'LACP aktif', passive: 'LACP pasif', on: 'Statik (LACP yok)', summary: 'Özet',
        'vrrp-group': 'VRRP grubu', 'virtual-address': 'Sanal ağ geçidi adresi', preempt: 'Öne geçme', vrrp: 'VRRP bilgisi', 'access-list': 'Erişim listesi', 'access-lists': 'Erişim listeleri', 'access-group': 'ACL\'yi arayüze uygula',
        permit: 'İzin ver', deny: 'Reddet', any: 'Herhangi', eq: 'Port eşittir', seq: 'Sıra numarası', in: 'Gelen yön', out: 'Giden yön', tcp: 'TCP', udp: 'UDP', icmp: 'ICMP',
        router: 'Yönlendirme protokolü', ospf: 'OSPF', 'router-id': 'Router kimliği', area: 'OSPF alanı', neighbor: 'Komşular', mtu: 'Çerçeve boyutu (bayt)', dir: 'Dosyaları listele', binding: 'Dağıtılan adresler',
        'switchport_': '', 'ip_': '',
    };
    const VARH = { 'A.B.C.D': 'IP adresi (next-hop)', PFX: 'IP adresi / önek uzunluğu (ör. 10.64.10.1/24)', WORD: 'Metin', VLIST: 'VLAN listesi (ör. 10,20-30)', IFNAME: 'Arayüz (ör. ethernet 1/1/1, vlan 10, mgmt 1/1/1)', LINE: 'Metin' };

    // ── Varsayılan cihaz modeli
    const newIf = n => ({ desc: '', shutdown: false, l3: !isL2p(n), mode: 'access', access: 1, allowed: [], ip: null, len: null, dhcp: n.startsWith('mgmt'),
        mtu: null, psec: { en: false, limit: null, viol: null }, edge: false, bpduguard: false, cg: null, helper: [], vrrp: {}, aclIn: null, aclOut: null, ospf: null, passive: false });
    function baseModel(lab) {
        const m = { hostname: lab.hostname || 'OS10', ifs: {}, vlans: { 1: '' }, routes: [], mroutes: [], users: { admin: { pw: 'admin', role: 'sysadmin' } }, ssh: true, links: {},
            banner: { login: null, motd: null }, radius: [], tacacs: [], aaa: { default: ['local'], console: ['local'] }, rest: false, sshc: { cipher: null, kex: null, mac: null },
            dhcp: { en: false, pools: {} }, macStatic: [], macAging: 1800, stp: { mode: 'rapid-pvst', rstpPrio: 32768, vlanPrio: {} }, acls: {}, ospf: {} };
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
        const S = { lab, run: baseModel(lab), cand: null, tx: false, mode: 'exec', ctx: [], startup: null, pending: null, ev: [], hist: [], answers: {}, lastChange: 0, clock: 0,
            sub: {}, files: {}, copies: [], errdown: {}, learned: {}, viol: {}, macHold: 0, rogue: {}, edgeLost: {}, bpduSeen: {}, fired: {} };
        const SIM = Object.assign({}, lab.sim || {}, (variant && variant.sim) || {});
        const PEER = Object.assign({}, lab.peer || {}, (variant && variant.peer) || {});
        let API = null;
        const M = () => (S.tx ? S.cand : S.run);   // yapılandırma komutlarının yazdığı model
        const R = () => S.run;                      // işletim durumu (show) daima running'den
        const log = o => { S.ev.push(o); };
        const ctx = {
            ifValid: n => {
                if (M().ifs[n]) return true;
                const t = ifType(n), num = ifNums(n)[0];
                if (t === 'vlan') return num >= 1 && num <= 4093;
                if (t === 'loopback') return num <= 16383;
                if (t === 'port-channel') return num >= 1 && num <= 128;
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
            // ── öğrenme yolu (çıktılar modelden; doğrulanamayan biçimler [Simülatör] etiketli)
            { p: 'show ip ssh', run: showIpSsh },
            { p: 'show mac address-table', run: () => showMac() },
            { p: 'show mac address-table <dynamic|static>$t', run: a => showMac(e => e.type === a.t) },
            { p: 'show mac address-table address MAC$mac', run: a => showMac(e => e.mac === a.mac) },
            { p: 'show mac address-table vlan (1-4093)$v', run: a => showMac(e => e.vlan === a.v) },
            { p: 'show mac address-table interface IFNAME$i', run: a => showMac(e => e.port === a.i) },
            { p: 'show spanning-tree brief', run: showStp },
            { p: 'show switchport port-security', run: () => showPsec() },
            { p: 'show switchport port-security interface IFNAME$i', run: a => showPsec(a.i) },
            { p: 'show port-channel summary', run: showPc },
            { p: 'show vrrp brief', run: showVrrp },
            { p: 'show ip dhcp binding', run: showDhcpB },
            { p: 'show ip ospf neighbor', run: showOspfNb },
            { p: 'show ip access-lists', run: showAcls },
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
            { p: 'clear mac address-table dynamic all', run: () => macClear(() => true) },
            { p: 'clear mac address-table dynamic vlan (1-4093)$v', run: a => macClear(e => e.vlan === a.v) },
            { p: 'clear mac address-table dynamic interface IFNAME$i', run: a => macClear(e => e.port === a.i) },
            { p: 'copy running-configuration URL$u', run: copyRun },
            { p: 'copy URL$a URL$b', run: copyCfg },
            { p: 'dir config', run: showDir },
        ].concat(SHOW));
        const COMMON = [
            { p: 'exit', run: () => { const up = { config: 'exec', pool: 'dhcp', psec: 'if', vrrp: 'if' }[S.mode] || 'config'; S.mode = up; if (up !== 'if') S.ctx = []; S.sub = up === 'dhcp' ? {} : S.sub; }, neg: false },
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
            // ── Modül 1: afiş (çok satırlı; ayraç karakteriyle biter)
            { p: 'banner <login|motd>$k WORD$d', run: bannerStart, neg: false },
            { p: 'banner <login|motd>$k', noOnly: 1, no: a => { M().banner[a.k] = null; touch(); } },
            // ── Modül 2: AAA
            { p: 'radius-server host A.B.C.D$h key WORD$k', run: a => srvAdd('radius', a), neg: false },
            { p: 'radius-server host A.B.C.D$h key <0|9>$e WORD$k', run: a => srvAdd('radius', a), neg: false },
            { p: 'radius-server host A.B.C.D$h', noOnly: 1, no: a => srvDel('radius', a) },
            { p: 'tacacs-server host A.B.C.D$h key WORD$k', run: a => srvAdd('tacacs', a), neg: false },
            { p: 'tacacs-server host A.B.C.D$h key <0|9>$e WORD$k', run: a => srvAdd('tacacs', a), neg: false },
            { p: 'tacacs-server host A.B.C.D$h', noOnly: 1, no: a => srvDel('tacacs', a) },
            { p: 'aaa authentication login <default|console>$w LINE$m', run: aaaLogin, neg: false, vh: 'Yöntemler sırayla: group radius | group tacacs+ | local' },
            // ── Modül 4–5: RESTCONF ve SSH algoritmaları
            { p: 'rest api restconf', run: () => { M().rest = true; touch(); }, no: () => { M().rest = false; touch(); } },
            { p: 'ip ssh server <cipher|kex|mac>$k LINE$l', run: sshAlg, neg: false },
            { p: 'ip ssh server <cipher|kex|mac>$k', noOnly: 1, no: a => { M().sshc[a.k] = null; touch(); } },
            // ── Modül 7: DHCP sunucusu
            { p: 'ip dhcp server', run: () => { S.mode = 'dhcp'; S.ctx = []; S.sub = {}; }, neg: false },
            // ── Modül 11: MAC tablosu
            { p: 'mac address-table static MAC$mac vlan (1-4093)$v interface IFNAME$i', run: macStaticAdd, no: a => { const m = M(), k = m.macStatic.findIndex(x => x.mac === a.mac && x.vlan === a.v); if (k < 0) return simErr('Böyle bir statik MAC girdisi yok.'); m.macStatic.splice(k, 1); touch(); } },
            { p: 'mac address-table aging-time (0-1000000)$t', run: a => { if (a.t !== 0 && a.t < 10) return simErr('Yaşlanma süresi 0 ya da 10-1000000 olmalı.'); M().macAging = a.t; touch(); }, no: () => { M().macAging = 1800; touch(); } },
            { p: 'mac address-table aging-time', noOnly: 1, no: () => { M().macAging = 1800; touch(); } },
            // ── Modül 12: STP
            { p: 'spanning-tree mode <rstp|rapid-pvst|mst>$md', run: a => { M().stp.mode = a.md; touch(); }, no: () => { M().stp.mode = 'rapid-pvst'; touch(); } },
            { p: 'spanning-tree rstp priority (0-61440)$pr', run: a => { if (a.pr % 4096) return simErr('Öncelik 4096\'nın katı olmalı (0, 4096 … 61440).'); M().stp.rstpPrio = a.pr; touch(); }, no: () => { M().stp.rstpPrio = 32768; touch(); } },
            { p: 'spanning-tree vlan VLIST$l priority (0-61440)$pr', run: a => { if (a.pr % 4096) return simErr('Öncelik 4096\'nın katı olmalı (0, 4096 … 61440).'); vlist(a.l).forEach(v => { M().stp.vlanPrio[v] = a.pr; }); touch(); }, no: a => { vlist(a.l).forEach(v => { delete M().stp.vlanPrio[v]; }); touch(); } },
            // ── Modül 13–14: yüzen statik, OSPF, ACL
            { p: 'ip route PFX$p A.B.C.D$nh (1-255)$dist', run: routeAdd, neg: false },
            { p: 'router ospf (1-65535)$pid', run: a => { if (!M().ospf[a.pid]) { M().ospf[a.pid] = { rid: null }; touch(); } S.mode = 'ospf'; S.ctx = []; S.sub = { pid: a.pid }; }, no: a => { if (!M().ospf[a.pid]) return simErr('OSPF süreci ' + a.pid + ' yok.'); delete M().ospf[a.pid]; touch(); } },
            { p: 'ip access-list WORD$n', run: a => { if (!M().acls[a.n]) { M().acls[a.n] = []; touch(); } S.mode = 'acl'; S.ctx = []; S.sub = { acl: a.n }; }, no: a => { if (!M().acls[a.n]) return simErr('Böyle bir ACL yok.'); delete M().acls[a.n]; touch(); } },
            { p: 'management route PFX$p A.B.C.D$nh', run: a => { const [n, l] = pfxSplit(a.p); if (netOf(n, l) !== ip2n(n)) return simErr('Önek ağ adresi olmalı (ör. ' + n2ip(netOf(n, l)) + '/' + l + ').'); M().mroutes = M().mroutes.filter(r => r.p !== a.p).concat([{ p: a.p, nh: a.nh }]); touch(); }, no: a => { M().mroutes = M().mroutes.filter(r => r.p !== a.p); touch(); } },
        ].concat(COMMON));
        const IFC = [
            { p: 'description !LINE$d', run: a => { cur().forEach(i => { i.desc = a.d.slice(0, 240); }); touch(); }, no: () => { cur().forEach(i => { i.desc = ''; }); touch(); } },
            { p: 'shutdown', run: () => { cur().forEach(i => { i.shutdown = true; }); S.ctx.forEach(n => { if (S.errdown[n]) { delete S.errdown[n]; clearSec(n); } }); touch(); }, no: () => { cur().forEach(i => { i.shutdown = false; }); touch(); } },
            { p: 'switchport mode <access|trunk>$m', eth: 1, run: a => l2(i => { i.mode = a.m; if (a.m === 'access') i.allowed = []; }), no: () => l2(i => { i.mode = 'access'; i.allowed = []; }) },
            { p: 'switchport access vlan !(1-4093)$v', eth: 1, run: a => { if (M().vlans[a.v] === undefined) return simErr('VLAN ' + a.v + ' yok. Önce "interface vlan ' + a.v + '" ile oluşturun.'); return l2(i => { i.access = a.v; }); }, no: () => l2(i => { i.access = 1; }) },
            { p: 'switchport trunk allowed vlan VLIST$l', eth: 1, run: a => trunkAllowed(a.l, false), no: a => trunkAllowed(a.l, true) },
            { p: 'switchport', eth: 1, run: () => { cur().forEach(i => { i.l3 = false; i.ip = null; i.len = null; }); touch(); }, no: () => { cur().forEach(i => { i.l3 = true; i.mode = 'access'; i.access = 1; i.allowed = []; }); touch(); } },
            { p: 'ip address !PFX$p', run: ipAddr, no: () => { cur().forEach(i => { i.ip = null; i.len = null; }); touch(); } },
            { p: 'ip address dhcp', mg: 1, run: () => { cur().forEach(i => { i.dhcp = true; i.ip = null; i.len = null; }); touch(); }, no: () => { cur().forEach(i => { i.dhcp = false; }); touch(); } },
            { p: 'show configuration', run: () => S.ctx.map(n => ['!'].concat(ifBlock(M(), n, false)).join('\n')).join('\n'), neg: false },
            // ── öğrenme yolu: arayüz eklemeleri
            { p: 'mtu (1280-9216)$mtu', eth: 1, run: a => { cur().forEach(i => { i.mtu = a.mtu; }); touch(); }, no: () => { cur().forEach(i => { i.mtu = null; }); touch(); } },
            { p: 'switchport port-security', ethOnly: 1, run: () => { if (S.ctx.length !== 1) return simErr('Port güvenliği tek tek arayüzlerde yapılandırılır (range dışında).'); if (cur()[0].l3) return simErr('L3 portta port güvenliği yok.'); S.mode = 'psec'; }, no: () => { cur().forEach(i => { i.psec = { en: false, limit: null, viol: null }; }); S.ctx.forEach(n => clearSec(n)); touch(); } },
            { p: 'spanning-tree port type edge', ethOnly: 1, run: () => { cur().forEach(i => { i.edge = true; }); S.ctx.forEach(n => { delete S.edgeLost[n]; }); touch(); }, no: () => { cur().forEach(i => { i.edge = false; }); touch(); } },
            { p: 'spanning-tree bpduguard enable', ethOnly: 1, run: () => { cur().forEach(i => { i.bpduguard = true; }); touch(); }, no: () => { cur().forEach(i => { i.bpduguard = false; }); touch(); } },
            { p: 'channel-group (1-128)$n mode <active|passive|on>$md', ethOnly: 1, run: cgJoin, neg: false },
            { p: 'channel-group', ethOnly: 1, noOnly: 1, no: () => { cur().forEach(i => { i.cg = null; }); touch(); } },
            { p: 'ip helper-address A.B.C.D$h', vl: 1, run: a => { const i = cur()[0]; if (!i.helper.includes(a.h)) i.helper.push(a.h); touch(); }, no: a => { cur()[0].helper = cur()[0].helper.filter(x => x !== a.h); touch(); } },
            { p: 'vrrp-group (1-255)$g', vl: 1, run: a => { const i = cur()[0]; if (!i.vrrp[a.g]) { i.vrrp[a.g] = { vip: null, pri: 100, preempt: true }; touch(); } S.mode = 'vrrp'; S.sub = { g: a.g }; }, no: a => { if (!cur()[0].vrrp[a.g]) return simErr('Böyle bir VRRP grubu yok.'); delete cur()[0].vrrp[a.g]; touch(); } },
            { p: 'ip access-group WORD$n <in|out>$d', run: a => { if (!M().acls[a.n]) return simErr('ACL ' + a.n + ' yok: önce "ip access-list ' + a.n + '".'); cur().forEach(i => { i[a.d === 'in' ? 'aclIn' : 'aclOut'] = a.n; }); touch(); }, no: a => { cur().forEach(i => { i[a.d === 'in' ? 'aclIn' : 'aclOut'] = null; }); touch(); } },
            { p: 'ip ospf (1-65535)$pid area AREA$ar', run: a => { if (cur().some(i => !i.l3)) return simErr('OSPF yalnız L3 arayüzde (no switchport ya da interface vlan) çalışır.'); cur().forEach(i => { i.ospf = { pid: a.pid, area: a.ar }; }); touch(); }, no: () => { cur().forEach(i => { i.ospf = null; }); touch(); } },
            { p: 'ip ospf passive', run: () => { cur().forEach(i => { i.passive = true; }); touch(); }, no: () => { cur().forEach(i => { i.passive = false; }); touch(); } },
        ];
        const IFMODE = X(IFC.concat(COMMON));
        const DHCPM = X([
            { p: 'disable', run: () => { M().dhcp.en = false; touch(); }, no: () => { M().dhcp.en = true; touch(); } },
            { p: 'pool WORD$n', run: a => { const d = M().dhcp; if (!d.pools[a.n]) { d.pools[a.n] = { net: null, len: null, gw: null, dns: [], range: null, lease: 1 }; touch(); } S.mode = 'pool'; S.sub = { pool: a.n }; }, no: a => { if (!M().dhcp.pools[a.n]) return simErr('Böyle bir havuz yok.'); delete M().dhcp.pools[a.n]; touch(); } },
        ].concat(COMMON));
        const POOLM = X([
            { p: 'network PFX$p', run: a => { const [n, l] = pfxSplit(a.p); if (l < 8 || l > 30) return simErr('Önek uzunluğu 8-30 olmalı.'); if (netOf(n, l) !== ip2n(n)) return simErr('Ağ adresi yazın (ör. ' + n2ip(netOf(n, l)) + '/' + l + ').'); const P = pool(); P.net = n; P.len = l; touch(); }, no: () => { const P = pool(); P.net = null; P.len = null; touch(); } },
            { p: 'default-router A.B.C.D$g', run: a => { pool().gw = a.g; touch(); }, no: () => { pool().gw = null; touch(); } },
            { p: 'dns-server A.B.C.D$d', run: a => { if (!pool().dns.includes(a.d)) pool().dns.push(a.d); touch(); }, no: () => { pool().dns = []; touch(); } },
            { p: 'range A.B.C.D$a A.B.C.D$b', run: a => { const P = pool(); if (!P.net) return simErr('Önce havuzun ağını yazın (network …).'); if (!sameNet(a.a, P.net, P.len) || !sameNet(a.b, P.net, P.len) || ip2n(a.b) < ip2n(a.a)) return simErr('Aralık havuz ağının içinde ve artan sırada olmalı.'); P.range = [a.a, a.b]; touch(); }, no: () => { pool().range = null; touch(); } },
            { p: 'lease (0-365)$d', run: a => { pool().lease = a.d; touch(); }, no: () => { pool().lease = 1; touch(); } },
        ].concat(COMMON));
        const PSECM = X([
            { p: 'disable', run: () => { cur()[0].psec.en = false; clearSec(S.ctx[0]); touch(); }, no: () => { cur()[0].psec.en = true; touch(); } },
            { p: 'mac-learn limit (1-8192)$n', run: a => { cur()[0].psec.limit = a.n; touch(); }, no: () => { cur()[0].psec.limit = null; touch(); } },
            { p: 'mac-learn limit violation <log|drop|shutdown>$v', run: a => { const p = cur()[0].psec; if (p.viol !== a.v) { p.viol = a.v; Object.keys(S.viol).forEach(k => { if (k.startsWith(S.ctx[0] + '|')) delete S.viol[k]; }); touch(); } }, no: () => { cur()[0].psec.viol = null; touch(); } },
        ].concat(COMMON));
        const VRRPM = X([
            { p: 'virtual-address A.B.C.D$v', run: vrrpVip, no: () => { vgrp().vip = null; touch(); } },
            { p: 'priority (1-254)$pr', run: a => { vgrp().pri = a.pr; touch(); }, no: () => { vgrp().pri = 100; touch(); } },
            { p: 'preempt', run: () => { vgrp().preempt = true; touch(); }, no: () => { vgrp().preempt = false; touch(); } },
        ].concat(COMMON));
        const OSPFM = X([
            { p: 'router-id A.B.C.D$r', run: a => { M().ospf[S.sub.pid].rid = a.r; touch(); }, no: () => { M().ospf[S.sub.pid].rid = null; touch(); } },
        ].concat(COMMON));
        // ACL kuralları: [seq N] permit|deny ip|tcp|udp|icmp KAYNAK HEDEF [eq PORT]
        const ASRC = ['any', 'PFX$s', 'host A.B.C.D$sh'], ADST = ['any', 'PFX$d', 'host A.B.C.D$dh'], ARULES = [];
        for (const sq of ['', 'seq (1-65535)$sq ']) for (const a of ASRC) for (const b of ADST) {
            ARULES.push({ p: sq + '<permit|deny>$act <ip|icmp>$pr ' + a + ' ' + b, run: aclRule, neg: false });
            ARULES.push({ p: sq + '<permit|deny>$act <tcp|udp>$pr ' + a + ' ' + b, run: aclRule, neg: false });
            ARULES.push({ p: sq + '<permit|deny>$act <tcp|udp>$pr ' + a + ' ' + b + ' eq (0-65535)$dp', run: aclRule, neg: false });
        }
        const ACLM = X(ARULES.concat([{ p: 'seq (1-65535)$sq', noOnly: 1, no: a => { const L = M().acls[S.sub.acl], k = L.findIndex(r => r.seq === a.sq); if (k < 0) return simErr('Böyle bir sıra numarası yok.'); L.splice(k, 1); touch(); } }], COMMON));
        const MODES = { config: CONFIG, if: IFMODE, range: IFMODE, dhcp: DHCPM, pool: POOLM, psec: PSECM, vrrp: VRRPM, ospf: OSPFM, acl: ACLM };

        function avail(list, noForm) {
            return list.filter(c => {
                if (noForm ? (c.neg === false || !c.no) : c.noOnly) return false;
                if (S.mode === 'if' || S.mode === 'range') {
                    if (c.eth && !S.ctx.every(isL2p)) return false;
                    if (c.ethOnly && !S.ctx.every(isEth)) return false;
                    if (c.vl && !(S.ctx.length === 1 && S.ctx[0].startsWith('vlan'))) return false;
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
            M().routes = M().routes.filter(r => !(r.p === a.p && r.nh === a.nh)).concat([{ p: a.p, nh: a.nh, dist: a.dist || 1 }]);
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
        function save() { S.startup = clone(S.run); S.startupT = ++S.clock; }
        const noLinks = m => JSON.stringify(Object.assign({}, m, { links: null }));
        function isSaved() { return !!S.startup && noLinks(S.startup) === noLinks(S.run); }
        function cmdReload() {
            const go = () => {
                S.pending = { prompt: 'Proceed to reboot the system? [confirm yes/no]:', fn: x => {
                    if (!/^y/i.test(x)) return '';
                    const links = clone(S.run.links);
                    S.run = S.startup ? clone(S.startup) : baseModel(S.lab);
                    S.run.links = links; S.tx = false; S.cand = null; S.mode = 'exec'; S.ctx = []; S.errdown = {}; S.learned = {}; S.viol = {};
                    log({ event: 'reload' });
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

        // ═══ Öğrenme yolu yardımcıları (afiş, AAA, SSH, DHCP, MAC, STP, LAG, VRRP, ACL, yedek) ═══
        function bannerStart(a) {
            const d = a.d;
            if (d.length !== 1) return simErr('Ayraç tek bir karakter olmalı (ör. %).');
            const lines = [];
            const collect = x => {
                const k = x.indexOf(d);
                if (k >= 0) { if (k > 0) lines.push(x.slice(0, k)); M().banner[a.k] = lines.join('\n').slice(0, 2000); touch(); return ''; }
                lines.push(x);
                S.pending = { prompt: '', fn: collect, raw: true };
                return '';
            };
            S.pending = { prompt: '', fn: collect, raw: true };
            return 'Enter TEXT message. End with the character \'' + d + '\'.';
        }
        function srvAdd(kind, a) {
            if (a.k.length < 6) return simErr('Paylaşılan anahtar bu lab\'da en az 6 karakter olmalı.');
            const L = M()[kind];
            const x = L.find(r => r.h === a.h);
            if (x) x.k = a.k; else L.push({ h: a.h, k: a.k });
            touch();
        }
        function srvDel(kind, a) { const L = M()[kind], k = L.findIndex(r => r.h === a.h); if (k < 0) return simErr('Böyle bir sunucu yok: ' + a.h); L.splice(k, 1); touch(); }
        function aaaLogin(a) {
            const t = a.m.trim().split(/\s+/).map(x => x.toLowerCase()), L = [];
            for (let j = 0; j < t.length; j++) {
                if ('local'.startsWith(t[j]) && t[j].length >= 2) { if (L.includes('local')) return simErr('local iki kez yazılmış.'); L.push('local'); continue; }
                if ('group'.startsWith(t[j]) && t[j + 1]) {
                    const g = ['radius', 'tacacs+'].filter(x => x.startsWith(t[j + 1]));
                    if (g.length !== 1) return simErr('Grup adı radius ya da tacacs+ olmalı.');
                    const w = 'group ' + g[0];
                    if (L.includes(w)) return simErr(w + ' iki kez yazılmış.');
                    L.push(w); j++; continue;
                }
                return simErr('Geçersiz yöntem: "' + t[j] + '". Yöntemler: group radius | group tacacs+ | local');
            }
            M().aaa[a.w] = L; touch();
        }
        const SSH_ALG = {
            cipher: ['aes128-cbc', 'aes256-cbc', '3des-cbc', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com', 'chacha20-poly1305@openssh.com'],
            mac: ['hmac-sha1', 'hmac-sha1-etm@openssh.com', 'umac-64@openssh.com', 'umac-64-etm@openssh.com', 'umac-128@openssh.com', 'umac-128-etm@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com'],
            kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group-exchange-sha256', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'curve25519-sha256', 'curve25519-sha256@libssh.org'],
        };
        // Lab'ın öğretim ölçütü (zayıf): CBC/3DES, SHA1 ve 64 bit etiketli UMAC, SHA1 tabanlı KEX
        const SSH_WEAK = { cipher: ['aes128-cbc', 'aes256-cbc', '3des-cbc'], mac: ['hmac-sha1', 'hmac-sha1-etm@openssh.com', 'umac-64@openssh.com', 'umac-64-etm@openssh.com'], kex: ['diffie-hellman-group1-sha1', 'diffie-hellman-group14-sha1'] };
        const SSH_DEF = { cipher: ['chacha20-poly1305@openssh.com', 'aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm@openssh.com', 'aes256-gcm@openssh.com'],
            mac: ['umac-64-etm@openssh.com', 'umac-128-etm@openssh.com', 'hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com', 'hmac-sha1-etm@openssh.com', 'umac-64@openssh.com', 'umac-128@openssh.com', 'hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1'],
            kex: ['curve25519-sha256', 'curve25519-sha256@libssh.org', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521', 'diffie-hellman-group-exchange-sha256', 'diffie-hellman-group14-sha1'] };
        function sshAlg(a) {
            const w = a.l.trim().split(/[\s,]+/).map(x => x.toLowerCase()), L = [];
            for (const x of w) {
                if (!SSH_ALG[a.k].includes(x)) return simErr('Desteklenmeyen ' + a.k + ' algoritması: "' + x + '". ? ile listeyi görün: ' + SSH_ALG[a.k].join(' '));
                if (!L.includes(x)) L.push(x);
            }
            M().sshc[a.k] = L; touch();
        }
        const sshList = k => M().sshc[k] || SSH_DEF[k];
        const pool = () => M().dhcp.pools[S.sub.pool];
        const vgrp = () => cur()[0].vrrp[S.sub.g];
        function vrrpVip(a) {
            const i = cur()[0];
            if (!i.ip) return simErr('Önce arayüze IP adresi verin.');
            if (!sameNet(a.v, i.ip, i.len)) return simErr('Sanal adres arayüzün alt ağında olmalı.');
            if (a.v === i.ip) return simErr('Bu lab\'da sanal adres arayüzün kendi adresi olamaz: ayrı bir adres seçin.');
            vgrp().vip = a.v; touch();
        }
        function cgJoin(a) {
            if (!M().ifs['port-channel' + a.n]) M().ifs['port-channel' + a.n] = newIf('port-channel' + a.n);
            const pcI = M().ifs['port-channel' + a.n];
            cur().forEach(i => { i.cg = { n: a.n, mode: a.md }; i.l3 = pcI.l3; });
            touch();
        }
        function macStaticAdd(a) {
            const m = M(), i = m.ifs[a.i];
            if (!i || !isL2p(a.i) || i.l3) return simErr('Statik MAC yalnız L2 (switchport) arayüze bağlanır.');
            if (m.vlans[a.v] === undefined) return simErr('VLAN ' + a.v + ' yok.');
            if (!vlanOn(i, a.v)) return simErr(a.i + ' VLAN ' + a.v + ' üyesi değil.');
            m.macStatic = m.macStatic.filter(x => !(x.mac === a.mac && x.vlan === a.v)).concat([{ mac: a.mac, vlan: a.v, port: a.i }]);
            delete S.learned[a.mac]; touch();
        }
        function macClear(fn) {
            Object.keys(S.learned).forEach(k => { const e = S.learned[k]; if (fn({ mac: k, port: e.port, vlan: e.vlan })) delete S.learned[k]; });
            S.macHold = 1;
        }
        function clearSec(n) { Object.keys(S.viol).forEach(k => { if (k.startsWith(n + '|')) delete S.viol[k]; }); }
        function purgeMac(n) { Object.keys(S.learned).forEach(k => { if (S.learned[k].port === n) delete S.learned[k]; }); }
        function macEntries() {
            const m = R(), L = [];
            m.macStatic.forEach(x => L.push({ mac: x.mac, vlan: x.vlan, port: x.port, type: 'static' }));
            Object.keys(S.learned).forEach(k => L.push({ mac: k, vlan: S.learned[k].vlan, port: S.learned[k].port, type: 'dynamic' }));
            return L.sort((a, b) => a.vlan - b.vlan || ifCmp(a.port, b.port));
        }
        function learnMacs(out) {
            const m = R();
            // Sınır sonradan düşürüldüyse fazla girdiler silinir (sonraki trafikte ihlal olarak görünür)
            Object.keys(m.ifs).filter(isEth).forEach(n => { const ps = m.ifs[n].psec; if (!ps || !ps.en || !ps.limit) return; const L = Object.keys(S.learned).filter(k => S.learned[k].port === n); L.slice(ps.limit).forEach(k => { delete S.learned[k]; }); });
            for (const h of SIM.hosts || []) {
                const n = h.port, i = m.ifs[n];
                if (!i || !physUp(m, n) || i.l3) continue;
                if ((h.after && !h.after(API)) || (h.until && h.until(API))) continue;
                const port = i.cg ? 'port-channel' + i.cg.n : n, pi = m.ifs[port];
                if (!pi || (i.cg && !ifUp(port, m))) continue;
                const vlan = pi.mode === 'access' ? pi.access : (h.vlan || pi.access);
                if (!vlanOn(pi, vlan) || m.vlans[vlan] === undefined) continue;
                if (m.macStatic.some(x => x.mac === h.mac)) continue;
                const ps = i.psec;
                if (ps && ps.en && ps.limit) {
                    if (S.learned[h.mac] && S.learned[h.mac].port === n) continue;
                    const cnt = Object.values(S.learned).filter(e => e.port === n).length;
                    if (cnt < ps.limit) { S.learned[h.mac] = { port: n, vlan }; continue; }
                    const key = n + '|' + h.mac;
                    if (S.viol[key]) continue;
                    S.viol[key] = true;
                    const act = ps.viol || 'drop';
                    log({ event: 'psec', port: n, mac: h.mac, act });
                    if (act === 'shutdown') { S.errdown[n] = 'port-security'; purgeMac(n); out.push('% [Simülatör olayı] ' + n + ': MAC öğrenme sınırı (' + ps.limit + ') aşıldı, yeni MAC ' + h.mac + ' (VLAN ' + vlan + ') — eylem shutdown: port kapatıldı (error-disabled).'); }
                    else if (act === 'log') out.push('% [Simülatör olayı] ' + n + ': MAC öğrenme sınırı (' + ps.limit + ') aşıldı; ' + h.mac + ' (VLAN ' + vlan + ') paketleri düşürüldü ve loglandı.');
                    continue;
                }
                S.learned[h.mac] = { port, vlan };
            }
        }
        // ── STP: yerel köprü + sabit sanal komşular (SIM.stp) + kaçak switch (SIM.bpdu)
        const MYMAC = '90:b1:1c:00:00:01';
        const ROGUE = Object.assign({ prio: 32768, mac: '00:e0:4c:00:0b:ad' }, SIM.rogue || {});
        const myPrio = () => { const st = R().stp; return st.mode === 'rstp' ? st.rstpPrio : st.mode === 'rapid-pvst' ? (st.vlanPrio[SIM.stpVlan || 1] !== undefined ? st.vlanPrio[SIM.stpVlan || 1] : 32768) : 32768; };
        const bidLess = (a, b) => a[0] !== b[0] ? a[0] < b[0] : a[1] < b[1];
        function stpState() {
            const m = R(), me = [myPrio(), MYMAC], nbs = [];
            (SIM.stp || []).forEach(x => { if (physUp(m, x.port)) nbs.push({ port: x.port, bid: [x.prio, x.mac] }); });
            Object.keys(S.rogue).forEach(p => { if (physUp(m, p)) nbs.push({ port: p, bid: [ROGUE.prio, ROGUE.mac] }); });
            let root = me, rp = null;
            nbs.slice().sort((a, b) => ifCmp(a.port, b.port)).forEach(x => { if (bidLess(x.bid, root)) { root = x.bid; rp = x.port; } });
            const ports = Object.keys(m.ifs).filter(n => isEth(n) && !m.ifs[n].l3 && physUp(m, n)).sort(ifCmp).map(n => {
                const nb = nbs.find(x => x.port === n), role = n === rp ? 'Root' : (nb && bidLess(nb.bid, me)) ? 'Altn' : 'Desg';
                return { port: n, role, state: role === 'Altn' ? 'BLK' : 'FWD', edge: m.ifs[n].edge && !S.edgeLost[n], guard: m.ifs[n].bpduguard };
            });
            return { me, root, rp, ports, isRoot: rp === null };
        }
        function bpduTick(out) {
            const m = R();
            for (const b of SIM.bpdu || []) {
                const n = typeof b === 'string' ? b : b.port;
                if (typeof b === 'object' && b.after && !b.after(API)) continue;
                const i = m.ifs[n];
                if (!i || i.shutdown || !m.links[n] || S.errdown[n] || S.bpduSeen[n]) continue;
                if (i.bpduguard) {
                    S.errdown[n] = 'bpduguard'; S.bpduSeen[n] = true; delete S.rogue[n]; purgeMac(n);
                    log({ event: 'errdown', port: n, cause: 'bpduguard' });
                    out.push('% [Simülatör olayı] ' + n + ' portundan BPDU alındı: BPDU Guard portu kapattı (error-disabled, neden: bpduguard). Porta bir switch takılmış olmalı.');
                } else if (!S.rogue[n]) {
                    S.rogue[n] = true; if (i.edge) S.edgeLost[n] = true;
                    log({ event: 'rogue', port: n });
                    const st = stpState();
                    out.push('% [Simülatör olayı] ' + n + ' portundan BPDU alınıyor: porta başka bir switch bağlandı' + (i.edge ? ' (port kenar port olma durumunu kaybetti)' : '') + '.' + (st.rp === n ? ' Kaçak switch KÖK KÖPRÜ oldu!' : ''));
                }
            }
        }
        function tick() {
            if (!API) return '';
            const out = [];
            bpduTick(out);
            if (S.macHold > 0) S.macHold--; else learnMacs(out);
            for (const e of SIM.events || []) {
                if (S.fired[e.id] || !e.when(API)) continue;
                S.fired[e.id] = true; log({ event: e.id });
                const t = e.fire(API); if (t) out.push(t);
            }
            return out.join('\n');
        }
        // ── DHCP bağlamaları (sanal istemciler)
        function dhcpBindings() {
            const m = R(), out = [], used = new Set();
            for (const c of SIM.clients || []) {
                const i = m.ifs[c.port];
                if (!i || !physUp(m, c.port) || i.l3) continue;
                const svi = 'vlan' + (i.mode === 'access' ? i.access : (c.vlan || i.access)), si = m.ifs[svi];
                if (!si || !si.ip || !ifUp(svi)) continue;
                const net = netOf(si.ip, si.len), bc = net + 2 ** (32 - si.len) - 1;
                if (si.helper.length) {
                    const R0 = SIM.relay;
                    if (!R0 || !si.helper.includes(R0.server) || !rib().some(r => sameNet(r.net, R0.server, r.len))) continue;
                    let x = net + (R0.first || 100); while (used.has(x)) x++; used.add(x);
                    out.push({ mac: c.mac, name: c.name, ip: n2ip(x), pool: '(uzak sunucu ' + R0.server + ')', gw: si.ip, via: 'relay' });
                    continue;
                }
                if (!m.dhcp.en) continue;
                const pn = Object.keys(m.dhcp.pools).find(p => m.dhcp.pools[p].net && sameNet(m.dhcp.pools[p].net, si.ip, m.dhcp.pools[p].len));
                if (!pn) continue;
                const P = m.dhcp.pools[pn];
                const lo = P.range ? ip2n(P.range[0]) : net + 1, hi = P.range ? ip2n(P.range[1]) : bc - 1;
                let ip = null;
                for (let x = lo; x <= hi; x++) { if (x === ip2n(si.ip) || (P.gw && x === ip2n(P.gw)) || used.has(x)) continue; ip = x; break; }
                if (ip === null) continue;
                used.add(ip);
                out.push({ mac: c.mac, name: c.name, ip: n2ip(ip), pool: pn, gw: P.gw, dns: P.dns.slice(), via: 'server' });
            }
            return out;
        }
        // ── VRRP (SIM.vrrp: karşı router)
        function vrrpRows() {
            const m = R(), rows = [];
            Object.keys(m.ifs).filter(n => n.startsWith('vlan')).sort(ifCmp).forEach(n => {
                const i = m.ifs[n];
                Object.keys(i.vrrp || {}).map(Number).sort((a, b) => a - b).forEach(g => {
                    const x = i.vrrp[g];
                    let st = 'init-state';
                    if (ifUp(n) && x.vip && i.ip) {
                        const P = (SIM.vrrp || []).find(p => p.ifn === n && p.vrid === g && !(p.downWhen && p.downWhen(API)));
                        st = !P || x.pri > P.pri || (x.pri === P.pri && ip2n(i.ip) > ip2n(P.ip)) ? 'primary-state' : 'backup-state';
                    }
                    rows.push({ ifn: n, g, pri: x.pri, preempt: x.preempt, st, ip: i.ip, vip: x.vip });
                });
            });
            return rows;
        }
        // ── ACL
        function aclRule(a) {
            const L = M().acls[S.sub.acl];
            const seq = a.sq !== undefined ? a.sq : (L.length ? Math.floor(Math.max(...L.map(r => r.seq)) / 10) * 10 + 10 : 10);
            const src = a.s ? a.s : a.sh ? a.sh + '/32' : null, dst = a.d ? a.d : a.dh ? a.dh + '/32' : null;
            for (const x of [src, dst]) if (x) { const [n, l] = pfxSplit(x); if (netOf(n, l) !== ip2n(n)) return simErr('Önek ağ adresi olmalı (ör. ' + n2ip(netOf(n, l)) + '/' + l + ').'); }
            const r = { seq, act: a.act, pr: a.pr, src, dst, dp: a.dp !== undefined ? a.dp : null, hostS: !!a.sh, hostD: !!a.dh };
            M().acls[S.sub.acl] = L.filter(x => x.seq !== seq).concat([r]).sort((x, y) => x.seq - y.seq);
            touch();
        }
        const addrText = (p, host) => !p ? 'any' : host ? 'host ' + p.split('/')[0] : p;
        const aclText = r => 'seq ' + r.seq + ' ' + r.act + ' ' + r.pr + ' ' + addrText(r.src, r.hostS) + ' ' + addrText(r.dst, r.hostD) + (r.dp !== null ? ' eq ' + r.dp : '');
        function aclMatch(r, f) {
            const pr = f.proto || 'tcp';
            if (r.pr !== 'ip' && r.pr !== pr) return false;
            if (r.src) { const [n, l] = pfxSplit(r.src); if (!sameNet(f.src, n, l)) return false; }
            if (r.dst) { const [n, l] = pfxSplit(r.dst); if (!sameNet(f.dst, n, l)) return false; }
            if (r.dp !== null && r.dp !== f.dport) return false;
            return true;
        }
        // OS10 ACL: sonda örtük deny (eşleşme yoksa reddedilir)
        function aclEval(name, f) { const L = R().acls[name]; if (!L) return null; const h = L.find(r => aclMatch(r, f)); return h ? h.act : 'deny'; }
        function decide(f) { const i = R().ifs[f.in]; return i && i.aclIn ? aclEval(i.aclIn, f) : 'permit'; }
        // ── dosyalar / yedek
        function copyRun(a) {
            const u = a.u;
            if (u.startsWith('config://')) { const f = u.slice(9); if (f === 'startup.xml') { save(); return ''; } S.files[f] = { m: clone(S.run), t: ++S.clock }; return ''; }
            const mm = u.match(/^(\w+):\/\/([^/]+)\/(.+)$/);
            if (!mm) return simErr('Hedef biçimi: tftp://sunucu/dosya ya da config://dosya.xml');
            const srv = mm[2].replace(/^.*@/, ''), hosts = S.lab.hosts || [];
            if (!hosts.includes(srv)) return '% [Simülatör] ' + srv + ' yanıt vermiyor: kopyalama başarısız (adres/yönlendirme/servis?).';
            S.copies.push({ proto: mm[1], server: srv, file: mm[3], m: clone(S.run) });
            return '% [Simülatör] running-configuration ' + mm[1].toUpperCase() + ' ile ' + srv + ' sunucusuna "' + mm[3] + '" adıyla kopyalandı.';
        }
        function copyCfg(a) {
            if (!a.a.startsWith('config://') || !a.b.startsWith('config://')) return simErr('Bu lab sürümünde yalnız config:// → config:// kopyası (ve copy running-configuration …) desteklenir.');
            const f = a.a.slice(9), t = a.b.slice(9);
            const src = f === 'startup.xml' ? (S.startup ? { m: S.startup } : null) : S.files[f];
            if (!src) return simErr('config://' + f + ' bulunamadı (dir config ile bakın).');
            if (t === 'startup.xml') { S.startup = clone(src.m); S.startupT = ++S.clock; log({ event: 'restore', file: f }); return ''; }
            S.files[t] = { m: clone(src.m), t: ++S.clock }; return '';
        }
        function showDir() {
            const L = ['% [Simülatör] Biçim yaklaşıktır.', 'Directory contents for folder: config', 'Date (modified)        Size (bytes)  Name', '---------------------  ------------  -----------'];
            const sz = m => runText(m, false).length + 200;
            if (S.startup) L.push(pad('2026-09-25T09:' + String(10 + ((S.startupT || 0) % 50)).padStart(2, '0') + ':00Z', 23) + padL(sz(S.startup), 12) + '  startup.xml');
            Object.keys(S.files).sort().forEach(f => L.push(pad('2026-09-25T09:' + String(10 + (S.files[f].t % 50)).padStart(2, '0') + ':00Z', 23) + padL(sz(S.files[f].m), 12) + '  ' + f));
            return L.join('\n');
        }
        // ── show çıktıları (yeni)
        function showIpSsh() {
            const m = R();
            return ['% [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden.', 'SSH Server       : ' + (m.ssh ? 'Enabled' : 'Disabled'), '-'.repeat(60),
                'SSH Server Ciphers: ' + sshList('cipher').join(','), 'SSH Server MACs   : ' + sshList('mac').join(','), 'SSH Server KEX algorithms: ' + sshList('kex').join(','),
                'Password Authentication : Enabled', 'Host-Based Authentication : Disabled'].join('\n');
        }
        function showMac(fn) {
            const E = macEntries().filter(e => !fn || fn(e));
            const L = ['VlanId        Mac Address         Type        Interface'];
            E.forEach(e => L.push(pad(e.vlan, 14) + pad(e.mac, 20) + pad(e.type, 12) + e.port));
            return L.join('\n');
        }
        function showStp() {
            const st = stpState(), m = R();
            const L = ['% [Simülatör] Biçim yaklaşıktır (gerçek OS10 çıktısı daha ayrıntılıdır).', 'Spanning tree enabled protocol ' + m.stp.mode + (m.stp.mode === 'rapid-pvst' ? ' (VLAN ' + (SIM.stpVlan || 1) + ')' : ''),
                'Root ID    Priority ' + st.root[0] + ', Address ' + st.root[1] + (st.isRoot ? '  (This bridge is the root)' : ''), 'Bridge ID  Priority ' + st.me[0] + ', Address ' + st.me[1],
                'Interface         Role   PortState  Edge  BpduGuard', '-'.repeat(52)];
            st.ports.forEach(p => L.push(pad(p.port, 18) + pad(p.role, 7) + pad(p.state, 11) + pad(p.edge ? 'Yes' : 'No', 6) + (p.guard ? 'Yes' : 'No')));
            return L.join('\n');
        }
        function showPsec(only) {
            const m = R(), L = ['% [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden.'];
            Object.keys(m.ifs).filter(n => isEth(n) && (!only || n === only)).sort(ifCmp).forEach(n => {
                const p = m.ifs[n].psec;
                if (!only && !(p.en || p.limit)) return;
                const cnt = Object.values(S.learned).filter(e => e.port === n).length;
                L.push('Interface name                   : ' + n, 'Port Security                    : ' + (p.en ? 'Enabled' : 'Disabled'), 'Port Status                      : ' + (S.errdown[n] ? 'Error-disabled' : physUp(m, n) ? 'Up' : 'Down'),
                    'Mac-learn limit                  : ' + (p.limit || '-'), 'Mac-learn-limit-Violation Action : ' + (p.viol ? p.viol[0].toUpperCase() + p.viol.slice(1) : '-'), 'Total MAC addresses              : ' + cnt, '');
            });
            return L.join('\n').replace(/\n$/, '');
        }
        function showPc() {
            const m = R(), H = '-'.repeat(80);
            const L = ['Flags:  D - Down    I - member up but inactive    P - member up and active', '        U - Up (port-channel)    F - Fallback Activated', H, 'Group Port-Channel            Type     Protocol  Member Ports', H];
            Object.keys(m.ifs).filter(isPc).sort(ifCmp).forEach(n => {
                const mem = pcMembers(m, n), sel = pcSel(m, n), dyn = mem.some(k => m.ifs[k].cg.mode !== 'on');
                L.push(pad(ifNums(n)[0], 6) + pad(n + '  (' + (ifUp(n) ? 'U' : 'D') + ')', 24) + pad('Eth', 9) + pad(dyn ? 'DYNAMIC' : 'STATIC', 10) + mem.map(k => k.slice(8) + '(' + (sel.includes(k) ? 'P' : physUp(m, k) ? 'I' : 'D') + ')').join(' '));
            });
            return L.join('\n');
        }
        function showVrrp() {
            const L = ['Interface Group Priority Prempt State         Version Primary addr(s) Virtual addr', '-'.repeat(86)];
            vrrpRows().forEach(r => L.push(pad(r.ifn, 10) + pad('IPv4 ' + r.g, 6) + pad(r.pri, 9) + pad(String(r.preempt), 7) + pad(r.st, 14) + pad('2', 8) + pad(r.ip || '-', 16) + (r.vip || '-')));
            return L.join('\n');
        }
        function showDhcpB() {
            const B = dhcpBindings().filter(b => b.via === 'server');
            const L = ['IP Address       Hardware address       Lease expiration          Hostname', '+' + '-'.repeat(75)];
            B.forEach(b => L.push(pad(b.ip, 17) + pad(b.mac, 23) + pad('Sep 26 2026 09:12:00', 26) + (b.name || '')));
            L.push('Total Number of Entries in the Table = ' + B.length);
            return L.join('\n');
        }
        function showOspfNb() {
            const p = ospfPeer();
            const L = ['% [Simülatör] Biçim yaklaşıktır; komşu lab\'daki sabit sanal router\'dır.', 'Neighbor ID     Pri   State           Dead Time   Address         Interface          Area', '-'.repeat(95)];
            if (p) L.push(pad(p.rid, 16) + pad('1', 6) + pad('FULL/DR', 16) + pad('00:00:35', 12) + pad(p.ip, 16) + pad(p.ifn, 19) + p.area);
            return L.join('\n');
        }
        function showAcls() {
            const m = R(), L = ['% [Simülatör] Biçim yaklaşıktır; değerler cihaz modelinden (sonda örtük deny vardır).'];
            Object.keys(m.acls).sort().forEach(n => {
                const where = Object.keys(m.ifs).filter(k => m.ifs[k].aclIn === n || m.ifs[k].aclOut === n).map(k => k + (m.ifs[k].aclIn === n ? ' in' : ' out'));
                L.push('Ip access-list ' + n + (where.length ? '  (uygulandığı yer: ' + where.join(', ') + ')' : '  (hiçbir arayüzde değil)'));
                m.acls[n].forEach(r => L.push('    ' + aclText(r)));
            });
            return L.join('\n');
        }

        // ── durum
        const physUp = (m, n) => !!m.ifs[n] && !m.ifs[n].shutdown && !!m.links[n] && !S.errdown[n];
        const pcMembers = (m, n) => Object.keys(m.ifs).filter(k => isEth(k) && m.ifs[k].cg && m.ifs[k].cg.n === ifNums(n)[0]).sort(ifCmp);
        // LACP: üye up ve (statik "on" ya da karşı uç LACP konuşuyor ve iki uçtan biri active)
        const pcSel = (m, n) => pcMembers(m, n).filter(k => physUp(m, k) && (m.ifs[k].cg.mode === 'on' ? !PEER.lacp : (!!PEER.lacp && (m.ifs[k].cg.mode === 'active' || PEER.lacp === 'active'))));
        const vlanOn = (i, v) => !i.l3 && (i.mode === 'access' ? i.access === v : (i.access === v || i.allowed.includes(v)));
        function ifUp(n, m) {
            m = m || R();
            const i = m.ifs[n];
            if (!i || i.shutdown) return false;
            if (isEth(n) || n.startsWith('mgmt')) return !!m.links[n] && !S.errdown[n];
            if (n.startsWith('loopback')) return true;
            if (isPc(n)) return pcSel(m, n).length > 0;
            if (n.startsWith('vlan')) { const v = ifNums(n)[0]; return Object.keys(m.ifs).some(k => ((isEth(k) && !m.ifs[k].cg && physUp(m, k)) || (isPc(k) && ifUp(k, m))) && vlanOn(m.ifs[k], v)); }
            return false;
        }
        function connFor(m, ip) {
            for (const [n, i] of Object.entries(m.ifs)) if (i.ip && !n.startsWith('mgmt') && sameNet(i.ip, ip, i.len) && ifUp(n, m)) return n;
            return null;
        }
        function rib() {
            const m = R(), out = [], cand = [];
            for (const [n, i] of Object.entries(m.ifs)) {
                if (!i.ip || n.startsWith('mgmt') || !ifUp(n)) continue;
                out.push({ c: 'C', net: n2ip(netOf(i.ip, i.len)), len: i.len, nh: i.ip, ifn: n, d: '0/0', dist: 0 });
            }
            for (const r of m.routes) {
                const [net, len] = pfxSplit(r.p), ifn = connFor(m, r.nh);
                if (ifn) cand.push({ c: len === 0 ? '*S' : 'S', net, len, nh: r.nh, ifn, d: (r.dist || 1) + '/0', dist: r.dist || 1 });
            }
            const ps = ospfPeer();
            if (ps) (PEER.routes || []).forEach(([net, len, cost]) => cand.push({ c: 'O', net, len, nh: PEER.ip, ifn: PEER.ifn, d: '110/' + ((cost || 1) + 1), dist: 110 }));
            cand.sort((a, b) => a.dist - b.dist).forEach(c => { if (!out.some(x => x.net === c.net && x.len === c.len)) out.push(c); });
            return out.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }
        // OSPF sanal komşu (lab.peer): alan, alt ağ, passive, arayüz durumu, router-id çakışması
        function ospfPeer() {
            const m = R(), P = PEER;
            if (!P.ifn || !P.ip || !P.rid) return null;
            const i = m.ifs[P.ifn];
            if (!i || !i.ip || !i.l3 || !ifUp(P.ifn) || !sameNet(i.ip, P.ip, i.len) || !i.ospf || i.passive) return null;
            const o = m.ospf[i.ospf.pid];
            if (!o || i.ospf.area !== (P.area || '0.0.0.0')) return null;
            const rid = o.rid || Object.entries(m.ifs).filter(([n, x]) => x.ip && ifUp(n)).map(([, x]) => x.ip).sort((a, b) => ip2n(b) - ip2n(a))[0];
            if (rid === P.rid) return null;
            return { pid: i.ospf.pid, rid: P.rid, ip: P.ip, ifn: P.ifn, area: i.ospf.area, state: 'FULL', myRid: rid };
        }
        // ═══ show çıktıları ══════════════════════════════════════════════════
        function ifBlock(m, n, ind) {
            const i = m.ifs[n], p = ind ? ' ' : '', L = ['interface ' + n];
            if (i.desc) L.push(p + 'description ' + i.desc);
            L.push(p + (i.shutdown ? 'shutdown' : 'no shutdown'));
            if (i.mtu) L.push(p + 'mtu ' + i.mtu);
            if (isEth(n) && i.cg) { L.push(p + 'channel-group ' + i.cg.n + ' mode ' + i.cg.mode); if (i.l3) L.push(p + 'no switchport'); }
            if (isEth(n) && i.l3 && !i.cg) L.push(p + 'no switchport');
            if (isL2p(n) && !i.l3 && !i.cg) {
                if (i.mode === 'trunk') L.push(p + 'switchport mode trunk');
                L.push(p + 'switchport access vlan ' + i.access);
                if (i.mode === 'trunk' && i.allowed.length) L.push(p + 'switchport trunk allowed vlan ' + vcomp(i.allowed));
            }
            if (n.startsWith('mgmt') && !i.dhcp) L.push(p + 'no ip address dhcp');
            if (i.ip) L.push(p + 'ip address ' + i.ip + '/' + i.len);
            if (i.ospf) L.push(p + 'ip ospf ' + i.ospf.pid + ' area ' + i.ospf.area);
            if (i.passive) L.push(p + 'ip ospf passive');
            (i.helper || []).forEach(h => L.push(p + 'ip helper-address ' + h));
            if (i.aclIn) L.push(p + 'ip access-group ' + i.aclIn + ' in');
            if (i.aclOut) L.push(p + 'ip access-group ' + i.aclOut + ' out');
            if (i.psec && (i.psec.en || i.psec.limit || i.psec.viol)) { L.push(p + 'switchport port-security'); if (i.psec.en) L.push(p + ' no disable'); if (i.psec.limit) L.push(p + ' mac-learn limit ' + i.psec.limit); if (i.psec.viol) L.push(p + ' mac-learn limit violation ' + i.psec.viol); }
            if (i.edge) L.push(p + 'spanning-tree port type edge');
            if (i.bpduguard) L.push(p + 'spanning-tree bpduguard enable');
            Object.keys(i.vrrp || {}).map(Number).sort((a, b) => a - b).forEach(g => { const x = i.vrrp[g]; L.push(p + 'vrrp-group ' + g); if (x.pri !== 100) L.push(p + ' priority ' + x.pri); if (x.vip) L.push(p + ' virtual-address ' + x.vip); if (!x.preempt) L.push(p + ' no preempt'); });
            if (n.startsWith('mgmt')) L.push(p + 'ipv6 address autoconfig');
            return L;
        }
        function body(m) {
            const L = [];
            if (m.hostname !== 'OS10') L.push('hostname ' + m.hostname);
            for (const [u, x] of Object.entries(m.users)) L.push('username ' + u + ' password $6$' + fakeHash('s' + u, 8) + '$' + fakeHash(u + x.pw, 43) + ' role ' + x.role + ' priv-lvl ' + (x.lvl !== undefined ? x.lvl : (x.role === 'netoperator' ? 1 : 15)));
            m.radius.forEach(x => L.push('radius-server host ' + x.h + ' key 9 ' + fakeHash('r' + x.h + x.k, 32)));
            m.tacacs.forEach(x => L.push('tacacs-server host ' + x.h + ' key 9 ' + fakeHash('t' + x.h + x.k, 32)));
            if (m.aaa.default.join() === 'local' && m.aaa.console.join() === 'local') L.push('aaa authentication local');
            else { L.push('aaa authentication login default ' + m.aaa.default.join(' ')); L.push('aaa authentication login console ' + m.aaa.console.join(' ')); }
            if (!m.ssh) L.push('no ip ssh server enable');
            ['cipher', 'kex', 'mac'].forEach(k => { if (m.sshc[k]) L.push('ip ssh server ' + k + ' ' + m.sshc[k].join(',')); });
            if (m.rest) L.push('rest api restconf');
            if (m.macAging !== 1800) L.push('mac address-table aging-time ' + m.macAging);
            m.macStatic.forEach(x => L.push('mac address-table static ' + x.mac + ' vlan ' + x.vlan + ' interface ' + x.port));
            if (m.stp.mode !== 'rapid-pvst') L.push('spanning-tree mode ' + m.stp.mode);
            if (m.stp.rstpPrio !== 32768) L.push('spanning-tree rstp priority ' + m.stp.rstpPrio);
            Object.keys(m.stp.vlanPrio).forEach(v => L.push('spanning-tree vlan ' + v + ' priority ' + m.stp.vlanPrio[v]));
            m.routes.forEach(r => L.push('ip route ' + r.p + ' ' + r.nh + ((r.dist || 1) !== 1 ? ' ' + r.dist : '')));
            if (m.dhcp.en || Object.keys(m.dhcp.pools).length) {
                L.push('!', 'ip dhcp server');
                if (m.dhcp.en) L.push(' no disable');
                Object.keys(m.dhcp.pools).sort().forEach(n => { const P = m.dhcp.pools[n]; L.push(' !', ' pool ' + n); if (P.net) L.push('  network ' + P.net + '/' + P.len); if (P.gw) L.push('  default-router ' + P.gw); if (P.dns.length) L.push('  dns-server ' + P.dns.join(' ')); if (P.range) L.push('  range ' + P.range[0] + ' ' + P.range[1]); if (P.lease !== 1) L.push('  lease ' + P.lease); });
            }
            if (m.banner.login) L.push('banner login ^C', ...m.banner.login.split('\n'), '^C');
            if (m.banner.motd) L.push('banner motd ^C', ...m.banner.motd.split('\n'), '^C');
            Object.keys(m.acls).sort().forEach(n => { L.push('!', 'ip access-list ' + n); m.acls[n].forEach(r => L.push(' ' + aclText(r))); });
            Object.keys(m.ospf).forEach(pid => { L.push('!', 'router ospf ' + pid); if (m.ospf[pid].rid) L.push(' router-id ' + m.ospf[pid].rid); });
            const RO = ['ethernet', 'port-channel', 'loopback', 'vlan', 'mgmt'];
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
        const UNSUP = ['show interface ethernet', 'show interface port-channel', 'show interface', 'show lacp', 'show mac address-table count', 'show mac address-table extended', 'show spanning-tree active', 'show spanning-tree interface', 'show spanning-tree msti', 'show spanning-tree mst', 'show spanning-tree vlan',
            'show lldp', 'show vlt', 'show vrrp vlan', 'show ip ospf database', 'show ip ospf interface', 'show ip ospf statistics', 'show ip bgp', 'show ip arp', 'show ip management-route', 'show users', 'show clock', 'show system', 'show inventory', 'show environment', 'show alarms',
            'show logging', 'show ntp', 'show snmp', 'show boot', 'show image', 'show license', 'show processes', 'show tech-support', 'show hardware', 'show queuing', 'show qos', 'show aaa', 'show radius-server', 'show tacacs-server', 'show ip dhcp server', 'show ip dhcp pool',
            'show evpn', 'show nve', 'show virtual-network', 'show alias', 'show banner', 'show rest', 'show running-configuration aaa', 'traceroute', 'clear counters', 'clear ip', 'clear logging', 'system', 'image', 'boot', 'lock', 'unlock', 'alias', 'batch', 'delete',
            'router bgp', 'vlt-domain', 'spanning-tree mst', 'spanning-tree bpdufilter', 'spanning-tree guard', 'spanning-tree cost', 'spanning-tree port-priority', 'spanning-tree disable', 'spanning-tree link-type', 'lldp', 'logging', 'ntp', 'snmp-server', 'speed', 'flowcontrol', 'negotiation',
            'clock', 'aaa accounting', 'aaa authorization', 'radius-server timeout', 'radius-server retransmit', 'tacacs-server timeout', 'monitor', 'vrrp version', 'ipv6', 'ip vrf', 'ip domain-name', 'ip name-server', 'password-attributes', 'userrole', 'feature',
            'ip ssh server max-auth-tries', 'ip ssh server port', 'ip ssh server vrf', 'ip dhcp snooping', 'rest api restconf timeout', 'line vty', 'mac address-table learning', 'errdisable', 'lacp', 'vlt-port-channel'];
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
            if (!r.ok && (S.mode === 'psec' || S.mode === 'vrrp')) { const r1 = tryIn(IFMODE); if (r1.ok) { r = r1; fell = 'if'; } }
            if (!r.ok && S.mode === 'pool') { const r1 = tryIn(DHCPM); if (r1.ok) { r = r1; fell = 'dhcp'; } }
            if (!r.ok && S.mode !== 'config') { const r2 = tryIn(CONFIG); if (r2.ok) { r = r2; fell = true; } }
            if (!r.ok) return errText(r, line);
            if (pipe !== null && (isNo || !/^show /.test(r.canon))) return errText({ err: 'invalid' }, line);
            const prev = [S.mode, S.ctx];
            if (fell === 'if' || fell === 'dhcp') S.mode = fell;
            else if (fell) { S.mode = 'config'; S.ctx = []; }
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
            if (S.mode === 'dhcp') return h + '(conf-dhcp)# ';
            if (S.mode === 'pool') return h + '(conf-dhcp-' + S.sub.pool + ')# ';
            if (S.mode === 'psec') return h + '(config-if-port-sec)# ';
            if (S.mode === 'vrrp') return h + '(conf-' + S.ctx[0] + '-vrid-' + S.sub.g + ')# ';
            if (S.mode === 'acl') return h + '(config-ipv4-acl)# ';
            if (S.mode === 'ospf') return h + '(config-router-ospf-' + S.sub.pid + ')# ';
            const n = S.ctx[0];
            if (isEth(n)) return h + '(conf-if-eth' + n.slice(8) + ')# ';
            if (isPc(n)) return h + '(conf-if-po-' + n.slice(12) + ')# ';
            if (n.startsWith('vlan')) return h + '(conf-if-vl-' + n.slice(4) + ')# ';
            if (n.startsWith('mgmt')) return h + '(conf-if-ma-' + n.slice(4) + ')# ';
            return h + '(conf-if-lo-' + n.slice(8) + ')# ';
        }
        function login(raw) {
            // Giriş: kullanıcı adı → parola; yöntem listesi "aaa authentication login default" sırasıyla denenir
            const u = raw.trim();
            if (u === 'console') { S.conLogin = true; return '% [Simülatör] Konsol hattına geçildi: sonraki giriş "aaa authentication login console" listesiyle doğrulanır.'; }
            const list = S.conLogin ? M().aaa.console : M().aaa.default;
            S.pending = { prompt: 'Password: ', secret: true, fn: pw => {
                const ok = () => { S.loggedOut = false; S.conLogin = false; S.mode = 'exec'; S.ctx = []; return ''; };
                for (const meth of list) {
                    if (meth === 'local') { const usr = M().users[u]; if (usr && usr.pw === pw) { log({ event: 'login', user: u, via: 'local', con: !!S.conLogin }); return ok(); } log({ event: 'login-fail', user: u, via: 'local' }); S.fails = (S.fails || 0) + 1; return 'Login incorrect' + (S.fails >= 2 && !S.conLogin ? '\n% [Simülatör] Giremiyor musunuz? Konsoldan denemek için kullanıcı adı yerine "console" yazın (konsol ayrı yöntem listesi kullanır).' : ''); }
                    const kind = meth === 'group radius' ? 'radius' : 'tacacs';
                    let answered = false;
                    for (const sv of M()[kind]) {
                        const srv = (SIM.aaa || {})[sv.h];
                        if (!srv || srv.type !== kind || srv.key !== sv.k) continue;   // yanıt yok → sonraki sunucu/yöntem
                        answered = true;
                        if (srv.users && srv.users[u] === pw) { log({ event: 'login', user: u, via: kind }); return ok(); }
                        log({ event: 'login-fail', user: u, via: kind }); return 'Login incorrect';
                    }
                    if (answered) break;
                }
                log({ event: 'login-fail', user: u, via: 'none' });
                S.fails = (S.fails || 0) + 1;
                return 'Login incorrect' + (S.fails >= 2 ? '\n% [Simülatör] Giremiyor musunuz? Konsoldan denemek için kullanıcı adı yerine "console" yazın (konsol ayrı yöntem listesi kullanır).' : '');
            } };
            return '';
        }
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw: p.secret ? '***' : raw, prompt: true }); const o = p.fn(p.raw ? raw : raw.trim()); if (S.pending || S.loggedOut) return o; const t = tick(); return t ? (o ? o + '\n' : '') + t : o; }
            if (S.loggedOut) { if (!raw.trim()) return ''; return login(raw); }
            if (raw === '\x1a') { if (S.mode !== 'exec') { S.mode = 'exec'; S.ctx = []; } return ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            const o = S.mode === 'exec' ? execLine(line, EXEC, 0) : cfgLine(line);
            if (S.pending || S.loggedOut) return o;
            const t = tick();
            return t ? (o ? o + '\n' : '') + t : o;
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
            event: (id, fn) => S.ev.some(e => e.event === id && (!fn || fn(e))),
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

        API = {
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
            // öğrenme yolu kancaları
            macs: () => macEntries(), stp: () => stpState(), errdown: n => S.errdown[n] || null, dhcp: () => dhcpBindings(), vrrp: () => vrrpRows(), ospf: () => ospfPeer(),
            aclEval, decide, ssh: k => sshList(k), SSH_WEAK, files: () => Object.keys(S.files), fileModel: f => S.files[f] ? S.files[f].m : null, copies: () => S.copies,
            writeMem: () => save(), pcUp: n => ifUp(n), sim: SIM,
        };
        learnMacs([]);   // açılışta bağlı cihazların MAC'leri öğrenilmiş olsun
        return API;
    }

    return { session, ifNorm };
})();
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { dell: CgLabOs10 });
if (typeof module !== 'undefined') module.exports = CgLabOs10;
