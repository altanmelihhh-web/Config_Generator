'use strict';
// ─── CLI Lab motoru: F5 BIG-IP (TMOS 17.1 görünümü: bash + tmsh) ──────────────
// İki kabuk: bash ([root@host:Active:Standalone] config #) ve tmsh (root@(host)(cfg-sync …)(Active)(/Common)(tmos)#).
// tmsh değişiklikleri çalışan yapılandırmaya anında uygulanır; kalıcı olması için "save sys config" gerekir.
// Kapsam (1. sürüm): net interface/vlan/self/route, sys management-ip/management-route/global-settings/httpd/sshd/dns/ntp/provision,
// auth user / password-policy, save/load sys config, show sys software|license|provision|version, bash: ifconfig/ip/ping/cat/tail/grep/ls.
// Switch tarafı lab.sim.sw ile modellenir: { '1.1': { mode: 'access', vlan: 10 } | { mode: 'trunk', vlans: [20, 30], native: 1 } }
// Hata metinleri: kodu bilinenler gerçek biçimde, diğerleri "[Simülatör]" etiketiyle.
const CgLabTmsh = (function () {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const IR = (typeof CgIRule !== 'undefined') ? CgIRule : require('./irule.js');
    const { pad, isIp, ip2n, n2ip, netOf } = C;
    const VER = { product: 'BIG-IP', version: '17.1.1.3', build: '0.0.5', edition: 'Point Release 3', date: 'Thu Mar  7 12:31:10 PST 2024' };
    const clone = o => JSON.parse(JSON.stringify(o));
    const cidr = s => { const m = String(s).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/); return m && isIp(m[1]) && +m[2] <= 32 ? { ip: m[1], len: +m[2] } : null; };
    const inNet = (ip, c) => { if (c === 'any' || c === 'default') return true; const p = cidr(c) || (isIp(c) ? { ip: c, len: 32 } : null); return !!p && netOf(ip, p.len) === netOf(p.ip, p.len); };
    const maskOf = len => n2ip(len ? 2 ** 32 - 2 ** (32 - len) : 0);
    // httpd/sshd allow girdisi: IP, IP/maske (255.255.0.0), IP/uzunluk, ALL/All
    const allowNorm = s => { if (/^all$/i.test(s)) return 'ALL'; if (isIp(s)) return s; const m = String(s).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\S+)$/); if (!m || !isIp(m[1])) return null; const len = /^\d{1,2}$/.test(m[2]) ? +m[2] : C.maskLen(m[2]); if (len < 0 || len > 32) return null; return m[1] + '/' + (/^\d{1,2}$/.test(m[2]) ? maskOf(len) : m[2]); };
    const allowHas = (list, ip) => (list || []).some(a => { if (a === 'ALL') return true; if (isIp(a)) return a === ip; const [n, mk] = a.split('/'); const len = C.maskLen(mk); return netOf(ip, len) === netOf(n, len); });
    const PROV = ['ltm', 'asm', 'apm', 'afm', 'avr', 'gtm', 'dos', 'fps', 'ilx', 'sslo', 'swg', 'urldb', 'cgnat', 'pem'];
    const LEVELS = ['none', 'minimum', 'nominal', 'dedicated'];
    const ROLES = ['admin', 'resource-admin', 'user-manager', 'manager', 'application-editor', 'operator', 'guest', 'auditor', 'certificate-manager', 'irule-manager', 'no-access'];
    const ALLOW_DEFAULT = ['ospf:any', 'tcp:domain', 'tcp:f5-iquery', 'tcp:https', 'tcp:snmp', 'tcp:ssh', 'udp:520', 'udp:cap', 'udp:domain', 'udp:f5-iquery', 'udp:snmp', 'igmp:any', 'pim:any'];
    const SVC_PORT = { https: 443, ssh: 22, snmp: 161, domain: 53, 'f5-iquery': 4353, cap: 1026, http: 80 };

    // ── tmsh tokenizer: süslü parantezler ayrı sözcük, tırnaklı metin tek sözcük
    function tok(s) {
        const out = []; let i = 0;
        while (i < s.length) {
            const ch = s[i];
            if (/\s/.test(ch)) { i++; continue; }
            if (ch === '{' || ch === '}') { out.push({ t: ch, o: i, sym: true }); i++; continue; }
            if (ch === '"') { const j = s.indexOf('"', i + 1); if (j < 0) return { err: 'quote', at: i }; out.push({ t: s.slice(i + 1, j), o: i, q: true }); i = j + 1; continue; }
            let j = i; while (j < s.length && !/[\s{}]/.test(s[j])) j++;
            out.push({ t: s.slice(i, j), o: i }); i = j;
        }
        return out;
    }
    // Blok ayrıştırma: { a { b } c } → [{k:'a', b:[{k:'b'}]}, {k:'c'}]
    function block(T, i) {
        if (!T[i] || T[i].t !== '{' || !T[i].sym) return { err: 'expect{', at: i };
        const items = []; i++;
        while (i < T.length && !(T[i].t === '}' && T[i].sym)) {
            if (T[i].t === '{' && T[i].sym) { const r = block(T, i); if (r.err) return r; items.push({ k: '', b: r.items }); i = r.i; continue; }   // isimsiz iç blok: { { ip … } { ip … } }
            const it = { k: T[i].t }; i++;
            if (T[i] && T[i].t === '{' && T[i].sym) { const r = block(T, i); if (r.err) return r; it.b = r.items; i = r.i; }
            items.push(it);
        }
        if (i >= T.length) return { err: 'unclosed', at: T.length };
        return { items, i: i + 1 };
    }
    // Özellik listesi: anahtar değer | anahtar { … } | anahtar add|delete|replace-all-with { … } | anahtar none | çıplak bayrak
    function props(T, i, flags) {
        const P = [];
        while (i < T.length) {
            const k = T[i]; if (k.sym) return { err: 'unexpected', at: i };
            if ((flags || []).includes(k.t)) { P.push({ k: k.t, flag: true, at: i }); i++; continue; }
            const v = T[i + 1];
            if (!v) return { err: 'novalue', at: i, key: k.t };
            if (v.t === '{' && v.sym) { const r = block(T, i + 1); if (r.err) return r; P.push({ k: k.t, op: 'replace-all-with', items: r.items, at: i }); i = r.i; continue; }
            if (['add', 'delete', 'replace-all-with', 'modify'].includes(v.t) && T[i + 2] && T[i + 2].t === '{') { const r = block(T, i + 2); if (r.err) return r; P.push({ k: k.t, op: v.t, items: r.items, at: i }); i = r.i; continue; }
            P.push({ k: k.t, v: v.t, at: i, vat: i + 1 }); i += 2;
        }
        return { P };
    }
    const listOp = (cur, p, norm) => {
        // p: {v:'none'} | {op, items}
        if (p.v !== undefined) { if (p.v === 'none') return { list: [] }; const x = norm(p.v); return x === null ? { bad: p.v } : { list: [x] }; }
        const vals = []; for (const it of p.items) { const x = norm(it.k); if (x === null) return { bad: it.k }; vals.push(x); }
        if (p.op === 'replace-all-with') return { list: vals };
        if (p.op === 'add') return { list: cur.concat(vals.filter(x => !cur.includes(x))) };
        if (p.op === 'delete') { const miss = vals.find(x => !cur.includes(x)); if (miss) return { missing: miss }; return { list: cur.filter(x => !vals.includes(x)) }; }
        return { bad: p.op };
    };

    function session(lab, opts) {
        const VAR = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        if (VAR) lab = Object.assign({}, lab, { start: (lab.start || []).concat(VAR.start || []), startLate: (lab.startLate || []).concat(VAR.startLate || []), sim: Object.assign({}, lab.sim || {}, VAR.sim || {}) });
        const SIM = lab.sim || {};
        const IFS = lab.ifaces || ['1.1', '1.2', '1.3', '1.4'];
        const S = { m: base(), saved: null, mode: 'bash', ev: [], hist: [], pending: null, answers: {}, loggedOut: false, audit: [], ltmlog: (SIM.ltmlog || []).slice(), rt: { reboots: 0, arp: {} } };
        // Yazılım hacimleri ve dosyalar (operasyon lab'ları): lab.sim.images (/shared/images), lab.sim.ucs, lab.sim.volumes
        S.vols = { 'HD1.1': { version: SIM.version || VER.version, build: VER.build, status: 'complete' } };
        (SIM.volumes || []).forEach(v => { S.vols[v.name] = { version: v.version, build: v.build || '0.0.1', status: v.status || 'complete' }; });
        S.boot = 'HD1.1'; S.images = (SIM.images || []).slice(); S.ucs = (SIM.ucs || []).map(n => ({ name: n, cfg: null })); S.tmp = (SIM.tmp || []).slice(); S.inop = false;
        const curVer = () => S.vols[S.boot].version;
        // lisans kontrol tarihi: sürüm için gereken en eski "Service check date" (lab.sim.licenseCheck: { '17.1.1': '2023/06/20' })
        const svcOk = ver => { const need = (SIM.licenseCheck || {})[ver]; if (!need) return true; return String(SIM.serviceCheck || '2026/08/20').replace(/\//g, '') >= need.replace(/\//g, ''); };
        function base() {
            const ifs = {}; IFS.forEach(n => { ifs[n] = { enabled: true, desc: '' }; });
            const prov = {}; PROV.forEach(p => { prov[p] = p === 'ltm' ? 'nominal' : 'none'; });
            return { hostname: lab.hostname || 'bigip-a.lab.example', guiSetup: 'enabled', mgmtIp: null, mgmtRoutes: {}, ifs, vlans: {}, selfs: {}, routes: {},
                httpd: { allow: ['ALL'], idle: 1200 }, sshd: { allow: ['ALL'], idle: 0, banner: 'disabled', bannerText: '' }, dns: { servers: [], search: [] }, ntp: { servers: [], tz: 'America/Los_Angeles' },
                prov, users: { admin: { role: 'admin', shell: 'tmsh', pw: true } }, pwpol: { enf: 'disabled', min: 6, up: 0, low: 0, num: 0, spec: 0, fail: 0, maxdur: 99999 },
                nodes: {}, pools: {}, monitors: {}, virtuals: {}, snatpools: {}, persists: {}, httpProfiles: {}, cssl: {}, sssl: {}, rules: {}, dgroups: {},
                certs: { 'default.crt': { cn: 'localhost.localdomain', issuer: 'localhost.localdomain', self: true, san: [], pair: 'default', bits: 2048, nb: 'Jan 15 09:12:44 2024 GMT', na: 'Jan 12 09:12:44 2034 GMT' }, 'ca-bundle.crt': { bundle: true, cn: 'ca-bundle' } }, keys: { 'default.key': { bits: 2048, pair: 'default' } },
                cm: { cs: null, uni: [], mirror: null, trusted: [], dgs: {}, tgMac: null },
                db: { 'tm.rstcause.log': { value: 'disable' }, 'tm.rstcause.pkt': { value: 'disable' } } };
        }
        const M = () => S.m;
        const short = () => M().hostname.split('.')[0];
        const log = o => { S.ev.push(Object.assign({ mode: S.mode }, o)); };
        const linkUp = n => (lab.up || []).includes(n) && M().ifs[n] && M().ifs[n].enabled;
        const cfgKey = m => JSON.stringify(m);
        const dirty = () => cfgKey(M()) !== cfgKey(S.saved);
        const ADMIN = SIM.adminSrc || '10.240.20.5';

        // ── hata biçimleri
        const SYN = (w) => ({ err: 'invalid', msg: 'Syntax Error: "' + w + '" unknown property' });
        const SYNx = (m) => ({ err: 'invalid', msg: 'Syntax Error: ' + m });
        const E = (m, k) => ({ err: k || 'value', msg: m });
        const NF = (kind, n) => E('01020036:3: The requested ' + kind + ' (/Common/' + n + ') was not found.');
        const EX = (kind, n) => E('01020066:3: The requested ' + kind + ' (/Common/' + n + ') already exists in partition Common.');

        // ═══ Tür tanımları ═════════════════════════════════════════════════
        // her tür: kind (hata metni), named, obj(), create/modify/del, list(name, opts)
        const T = {};
        // net vlan
        T['net vlan'] = {
            kind: 'VLAN', named: true, coll: () => M().vlans,
            fresh: () => ({ ifs: {}, tag: null, desc: '', mtu: 1500 }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'interfaces') {
                        const cur = Object.keys(o.ifs), items = p.v !== undefined ? (p.v === 'none' ? [] : null) : p.items;
                        if (items === null) return SYNx('"' + p.v + '" unexpected argument');
                        const next = p.op === 'replace-all-with' || p.v === 'none' ? {} : Object.assign({}, o.ifs);
                        for (const it of items) {
                            if (!M().ifs[it.k]) return NF('interface', it.k);
                            if (p.op === 'delete') { if (!o.ifs[it.k]) return E('# [Simülatör] ' + it.k + ' bu VLAN\'ın üyesi değil.'); delete next[it.k]; continue; }
                            const md = (it.b || []).map(x => x.k).find(x => x === 'tagged' || x === 'untagged') || 'untagged';
                            if ((it.b || []).some(x => x.k !== 'tagged' && x.k !== 'untagged')) return SYN((it.b || []).find(x => x.k !== 'tagged' && x.k !== 'untagged').k);
                            next[it.k] = md;
                        }
                        // untagged arayüz yalnız bir VLAN'da olabilir
                        for (const [ifn, md] of Object.entries(next)) if (md === 'untagged') for (const [vn, vo] of Object.entries(M().vlans)) if (vn !== name && vo.ifs[ifn] === 'untagged') return E('Interface ' + ifn + ' in vlan /Common/' + name + ' must be tagged as it is also untagged in vlan /Common/' + vn + '.\n# [Simülatör] Hata metni temsilidir: untagged bir arayüz yalnız bir VLAN\'a üye olabilir.');
                        o.ifs = next; void cur;
                    } else if (p.k === 'tag') {
                        if (!/^\d{1,4}$/.test(p.v || '') || +p.v < 1 || +p.v > 4094) return SYNx('"' + p.v + '" invalid value for tag (1-4094)');
                        const dup = Object.entries(M().vlans).find(([vn, vo]) => vn !== name && vo.tag === +p.v);
                        if (dup) return E('VLAN tag (' + p.v + ') is already in use by vlan /Common/' + dup[0] + '.\n# [Simülatör] Hata metni temsilidir.');
                        o.tag = +p.v;
                    } else if (p.k === 'description') o.desc = p.v;
                    else if (p.k === 'mtu') { if (!/^\d+$/.test(p.v) || +p.v < 576 || +p.v > 9198) return SYNx('"' + p.v + '" invalid value for mtu'); o.mtu = +p.v; }
                    else return SYN(p.k);
                }
                if (isCreate && !o.tag) { let t = 4094; const used = new Set(Object.values(M().vlans).map(v => v.tag)); while (used.has(t)) t--; o.tag = t; o.autoTag = true; }
                else if (P.some(p => p.k === 'tag')) delete o.autoTag;
                return null;
            },
            del(name) { const used = Object.entries(M().selfs).find(([, s]) => s.vlan === name); if (used) return E('The VLAN (/Common/' + name + ') cannot be deleted because it is in use by a self IP (/Common/' + used[0] + ').\n# [Simülatör] Hata metni temsilidir.'); return null; },
            list(n, o) { const L = ['net vlan ' + n + ' {']; if (o.desc) L.push('    description "' + o.desc + '"'); const ks = Object.keys(o.ifs); if (ks.length) { L.push('    interfaces {'); ks.forEach(k => L.push('        ' + k + ' {', '            ' + o.ifs[k], '        }')); L.push('    }'); } if (o.mtu !== 1500) L.push('    mtu ' + o.mtu); L.push('    tag ' + o.tag, '}'); return L; },
            props: ['interfaces', 'tag', 'description', 'mtu'],
        };
        // net self
        T['net self'] = {
            kind: 'self IP', named: true, coll: () => M().selfs,
            fresh: () => ({ address: null, vlan: null, allow: 'none', tg: 'traffic-group-local-only', desc: '' }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'address') { const c = cidr(p.v || ''); if (!c) return SYNx('"' + p.v + '" invalid IP address (A.B.C.D/len)'); if (c.len < 31 && (ip2n(c.ip) === netOf(c.ip, c.len) || ip2n(c.ip) === netOf(c.ip, c.len) + 2 ** (32 - c.len) - 1)) return E('# [Simülatör] ' + p.v + ' bir ağ ya da yayın adresi; self IP olamaz.'); o.address = c.ip + '/' + c.len; }
                    else if (p.k === 'vlan') { if (!M().vlans[p.v]) return NF('VLAN', p.v); o.vlan = p.v; }
                    else if (p.k === 'allow-service') {
                        if (p.v !== undefined && ['all', 'default', 'none'].includes(p.v)) { o.allow = p.v; continue; }
                        const cur = Array.isArray(o.allow) ? o.allow : [];
                        const r = listOp(cur, p, x => (/^(tcp|udp|ospf|igmp|pim):(\d{1,5}|any|[a-z-]+)$/.test(x) ? x : null));
                        if (r.bad) return SYNx('"' + r.bad + '" invalid allow-service value (ör. tcp:443)');
                        if (r.missing) return E('# [Simülatör] ' + r.missing + ' listede yok.');
                        o.allow = r.list.length ? r.list : 'none';
                    }
                    else if (p.k === 'traffic-group') { if (!['traffic-group-local-only', 'traffic-group-1'].includes(p.v)) return NF('traffic group', p.v); o.tg = p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (isCreate && (!o.address || !o.vlan)) return E('Configuration error: A self IP requires an address and a VLAN.\n# [Simülatör] Hata metni temsilidir.');
                // çakışma: aynı IP başka bir self'te
                for (const [sn, so] of Object.entries(M().selfs)) if (sn !== name && so.address && o.address && so.address.split('/')[0] === o.address.split('/')[0]) return E('The requested self IP (' + o.address.split('/')[0] + ') is already in use by /Common/' + sn + '.\n# [Simülatör] Hata metni temsilidir.');
                return null;
            },
            list(n, o) { const L = ['net self ' + n + ' {', '    address ' + o.address]; L.push('    allow-service ' + (Array.isArray(o.allow) ? '{\n' + o.allow.map(a => '        ' + a).join('\n') + '\n    }' : o.allow)); if (o.desc) L.push('    description "' + o.desc + '"'); if (o.tg !== 'traffic-group-local-only') L.push('    floating enabled'); L.push('    traffic-group ' + o.tg, '    unit ' + (o.tg === 'traffic-group-local-only' ? 0 : 1), '    vlan ' + o.vlan, '}'); return L; },
            props: ['address', 'vlan', 'allow-service', 'traffic-group', 'description'],
        };
        // net route
        T['net route'] = {
            kind: 'route', named: true, coll: () => M().routes,
            fresh: () => ({ network: null, gw: null }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'network') { if (p.v === 'default') { o.network = 'default'; continue; } const c = cidr(p.v || ''); if (!c || ip2n(c.ip) !== netOf(c.ip, c.len)) return SYNx('"' + p.v + '" invalid network (A.B.C.D/len, ağ adresi)'); o.network = c.ip + '/' + c.len; }
                    else if (p.k === 'gw') { if (!isIp(p.v || '')) return SYNx('"' + p.v + '" invalid IP address'); o.gw = p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (isCreate && !o.network) { if (name === 'default') o.network = 'default'; else return E('# [Simülatör] Rota için network gerekli (ör. network 10.128.0.0/16 ya da network default).'); }
                if (isCreate && !o.gw) return E('# [Simülatör] Rota için gw gerekli.');
                if (o.gw && !Object.values(M().selfs).some(s => s.address && inNet(o.gw, s.address))) return E('Cannot create route: gateway (' + o.gw + ') is not reachable on any self IP subnet.\n# [Simülatör] Hata metni temsilidir: ağ geçidi bir self IP\'nin ağında olmalı.');
                return null;
            },
            list(n, o) { return ['net route ' + n + ' {', '    gw ' + o.gw, '    network ' + o.network, '}']; },
            props: ['network', 'gw', 'description'],
        };
        // net interface (yalnız modify)
        T['net interface'] = {
            kind: 'interface', named: true, fixed: true, coll: () => M().ifs,
            set(o, P) { for (const p of P) { if (p.flag) o.enabled = p.k === 'enabled'; else if (p.k === 'description') o.desc = p.v; else if (p.k === 'media-fixed') { if (!['auto', '1000T-FD', '10000T-FD', '100TX-FD'].includes(p.v)) return SYNx('"' + p.v + '" invalid media'); o.media = p.v; } else return SYN(p.k); } return null; },
            flags: ['enabled', 'disabled'],
            list(n, o) { const L = ['net interface ' + n + ' {']; if (o.desc) L.push('    description "' + o.desc + '"'); if (!o.enabled) L.push('    disabled'); L.push('    if-index ' + (48 + IFS.indexOf(n) * 16), '    mac-address 00:50:56:8a:' + (16 + IFS.indexOf(n)).toString(16) + ':0e', '    media-active ' + (linkUp(n) ? '10000T-FD' : 'none'), '    media-max auto', '}'); return L; },
            props: ['description', 'media-fixed', 'enabled', 'disabled'],
        };
        // sys management-ip (ad = adres)
        T['sys management-ip'] = {
            kind: 'management IP', special: 'mgmtip',
            list() { return M().mgmtIp ? ['sys management-ip ' + M().mgmtIp + ' {', '    description configured-statically', '}'] : []; },
        };
        T['sys management-route'] = {
            kind: 'management route', named: true, coll: () => M().mgmtRoutes,
            fresh: () => ({ network: null, gateway: null }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'gateway') { if (!isIp(p.v || '')) return SYNx('"' + p.v + '" invalid IP address'); o.gateway = p.v; }
                    else if (p.k === 'network') { if (p.v !== 'default' && !cidr(p.v || '')) return SYNx('"' + p.v + '" invalid network'); o.network = p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (isCreate && !o.network) o.network = name === 'default' ? 'default' : null;
                if (isCreate && (!o.network || !o.gateway)) return E('# [Simülatör] Yönetim rotası için network ve gateway gerekli.');
                if (o.gateway && M().mgmtIp && !inNet(o.gateway, M().mgmtIp)) return E('# [Simülatör] Ağ geçidi (' + o.gateway + ') yönetim IP\'sinin ağında değil (' + M().mgmtIp + ').');
                return null;
            },
            list(n, o) { return ['sys management-route ' + n + ' {', '    gateway ' + o.gateway, '    network ' + o.network, '}']; },
            props: ['gateway', 'network', 'description'],
        };
        const single = (key, kind, setFn, listFn, propsList) => { T[key] = { kind, single: true, set: setFn, list: listFn, props: propsList }; };
        single('sys global-settings', 'global settings', (o, P) => {
            for (const p of P) {
                if (p.k === 'hostname') { if (!/^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/.test(p.v || '')) return E('Constraint \'hostname must contain a domain\' failed for \'/Common/global-settings\'\n# [Simülatör] Ad tam alan adı (FQDN) olmalı, ör. bigip-a.lab.example'); M().hostname = p.v; }
                else if (p.k === 'gui-setup') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); M().guiSetup = p.v; }
                else return SYN(p.k);
            }
            return null;
        }, () => ['sys global-settings {', '    gui-setup ' + M().guiSetup, '    hostname ' + M().hostname, '}'], ['hostname', 'gui-setup']);
        const allowSet = (tgt, p) => { const r = listOp(tgt.allow, p, allowNorm); if (r.bad) return SYNx('"' + r.bad + '" invalid IP address or network'); if (r.missing) return E('# [Simülatör] ' + r.missing + ' listede yok.'); tgt.allow = r.list; if (p.op === 'add' && r.list.includes('ALL') && r.list.length > 1) S.allowNote = '# [Simülatör] Listede hâlâ All var: herkes erişebilir. Kısıtlamak için replace-all-with { … } kullanın.'; return null; };
        const allowShow = L => L.length ? L.map(x => (x === 'ALL' ? 'All' : x)).join(' ') : 'none';
        single('sys httpd', 'httpd', (o, P) => {
            for (const p of P) {
                if (p.k === 'allow') { const e = allowSet(M().httpd, p); if (e) return e; }
                else if (p.k === 'auth-pam-idle-timeout') { if (!/^\d+$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); M().httpd.idle = +p.v; }
                else return SYN(p.k);
            }
            return null;
        }, () => ['sys httpd {', '    allow { ' + allowShow(M().httpd.allow) + ' }', '    auth-pam-idle-timeout ' + M().httpd.idle, '}'], ['allow', 'auth-pam-idle-timeout']);
        single('sys sshd', 'sshd', (o, P) => {
            for (const p of P) {
                if (p.k === 'allow') { const e = allowSet(M().sshd, p); if (e) return e; }
                else if (p.k === 'inactivity-timeout') { if (!/^\d+$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); M().sshd.idle = +p.v; }
                else if (p.k === 'banner') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); M().sshd.banner = p.v; }
                else if (p.k === 'banner-text') M().sshd.bannerText = p.v;
                else return SYN(p.k);
            }
            return null;
        }, () => { const s = M().sshd, L = ['sys sshd {', '    allow { ' + allowShow(s.allow) + ' }', '    banner ' + s.banner]; if (s.bannerText) L.push('    banner-text "' + s.bannerText + '"'); L.push('    inactivity-timeout ' + s.idle, '}'); return L; }, ['allow', 'inactivity-timeout', 'banner', 'banner-text']);
        single('sys dns', 'dns', (o, P) => {
            for (const p of P) {
                if (p.k === 'name-servers') { const r = listOp(M().dns.servers, p, x => (isIp(x) ? x : null)); if (r.bad) return SYNx('"' + r.bad + '" invalid IP address'); if (r.missing) return E('# [Simülatör] ' + r.missing + ' listede yok.'); M().dns.servers = r.list; }
                else if (p.k === 'search') { const r = listOp(M().dns.search, p, x => (/^[a-z0-9.-]+$/i.test(x) ? x : null)); if (r.bad || r.missing) return SYNx('"' + (r.bad || r.missing) + '" invalid value'); M().dns.search = r.list; }
                else return SYN(p.k);
            }
            return null;
        }, () => { const d = M().dns, L = ['sys dns {']; if (d.servers.length) L.push('    name-servers { ' + d.servers.join(' ') + ' }'); if (d.search.length) L.push('    search { ' + d.search.join(' ') + ' }'); L.push('}'); return L; }, ['name-servers', 'search']);
        single('sys ntp', 'ntp', (o, P) => {
            for (const p of P) {
                if (p.k === 'servers') { const r = listOp(M().ntp.servers, p, x => (isIp(x) || /^[a-z0-9.-]+\.[a-z]+$/i.test(x) ? x : null)); if (r.bad || r.missing) return SYNx('"' + (r.bad || r.missing) + '" invalid value'); M().ntp.servers = r.list; }
                else if (p.k === 'timezone') { if (!/^[A-Za-z]+\/[A-Za-z_]+$|^UTC$/.test(p.v)) return SYNx('"' + p.v + '" invalid timezone (ör. Europe/Istanbul)'); M().ntp.tz = p.v; }
                else return SYN(p.k);
            }
            return null;
        }, () => { const n = M().ntp, L = ['sys ntp {']; if (n.servers.length) L.push('    servers { ' + n.servers.join(' ') + ' }'); L.push('    timezone ' + n.tz, '}'); return L; }, ['servers', 'timezone']);
        single('auth password-policy', 'password policy', (o, P) => {
            const K = { 'policy-enforcement': 'enf', 'minimum-length': 'min', 'required-uppercase': 'up', 'required-lowercase': 'low', 'required-numeric': 'num', 'required-special': 'spec', 'max-login-failures': 'fail', 'max-duration': 'maxdur' };
            for (const p of P) {
                const f = K[p.k]; if (!f) return SYN(p.k);
                if (f === 'enf') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); M().pwpol.enf = p.v; continue; }
                if (!/^\d{1,5}$/.test(p.v || '')) return SYNx('"' + p.v + '" invalid value'); M().pwpol[f] = +p.v;
            }
            return null;
        }, () => { const w = M().pwpol; return ['auth password-policy {', '    max-duration ' + w.maxdur, '    max-login-failures ' + w.fail, '    minimum-length ' + w.min, '    policy-enforcement ' + w.enf, '    required-lowercase ' + w.low, '    required-numeric ' + w.num, '    required-special ' + w.spec, '    required-uppercase ' + w.up, '}']; },
        ['policy-enforcement', 'minimum-length', 'required-uppercase', 'required-lowercase', 'required-numeric', 'required-special', 'max-login-failures', 'max-duration']);
        // sys provision <modül> level <seviye>
        T['sys provision'] = { kind: 'provision', named: true, fixed: true, coll: () => M().prov, byVal: true,
            set(o, P, name) { for (const p of P) { if (p.k !== 'level') return SYN(p.k); if (!LEVELS.includes(p.v)) return SYNx('"' + p.v + '" invalid level (none|minimum|nominal|dedicated)'); M().prov[name] = p.v; if (p.v === 'dedicated') PROV.forEach(x => { if (x !== name) M().prov[x] = 'none'; }); } return null; },
            list(n) { return M().prov[n] === 'none' ? ['sys provision ' + n + ' { }'] : ['sys provision ' + n + ' {', '    level ' + M().prov[n], '}']; }, props: ['level'] };
        // auth user
        T['auth user'] = {
            kind: 'user', named: true, coll: () => M().users,
            fresh: () => ({ role: 'no-access', shell: 'none', pw: false }),
            set(o, P, name) {
                for (const p of P) {
                    if (p.k === 'password') { const e = pwCheck(p.v); if (e) return e; o.pw = true; o.pwLen = p.v.length; }
                    else if (p.k === 'shell') { if (!['tmsh', 'bash', 'none'].includes(p.v)) return SYNx('"' + p.v + '" invalid shell (tmsh|bash|none)'); o.shell = p.v; }
                    else if (p.k === 'partition-access') {
                        const it = (p.items || [])[0]; const role = it && it.b && it.b[0] && it.b[0].k === 'role' ? (it.b[1] ? null : null) : null; void role;
                        // biçim: partition-access add { all-partitions { role operator } }  → blok: [{k:'all-partitions', b:[{k:'role'},{k:'operator'}]}]
                        if (!it || it.k !== 'all-partitions' || !it.b || it.b[0].k !== 'role' || !it.b[1]) return SYNx('partition-access biçimi: partition-access add { all-partitions { role <rol> } }');
                        if (!ROLES.includes(it.b[1].k)) return SYNx('"' + it.b[1].k + '" invalid role');
                        o.role = it.b[1].k;
                    }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (name === 'admin' && o.role !== 'admin') return E('# [Simülatör] Bu lab\'da admin kullanıcısının rolü değiştirilemez.');
                return null;
            },
            del(name) { if (name === 'admin' || name === 'root') return E('Cannot delete the ' + name + ' user.\n# [Simülatör] Hata metni temsilidir.'); return null; },
            list(n, o) { return ['auth user ' + n + ' {', '    description ' + (o.desc ? '"' + o.desc + '"' : n), '    encrypted-password ' + (o.pw ? '$6$' + 'x'.repeat(8) + '$' + 'Q'.repeat(20) : '!!'), '    partition Common', '    partition-access {', '        all-partitions {', '            role ' + o.role, '        }', '    }', '    shell ' + o.shell, '}']; },
            props: ['password', 'partition-access', 'shell', 'description'],
        };
        function pwCheck(pw) {
            const w = M().pwpol; if (w.enf !== 'enabled') { if (pw.length < 1) return E('# [Simülatör] Parola boş olamaz.'); return null; }
            const miss = []; if (pw.length < w.min) miss.push('en az ' + w.min + ' karakter');
            [['up', /[A-Z]/g, 'büyük harf'], ['low', /[a-z]/g, 'küçük harf'], ['num', /[0-9]/g, 'rakam'], ['spec', /[^A-Za-z0-9]/g, 'özel karakter']].forEach(([k, re, t]) => { if ((pw.match(re) || []).length < w[k]) miss.push('en az ' + w[k] + ' ' + t); });
            return miss.length ? E('Constraint \'password policy\' failed: ' + miss.join(', ') + '\n# [Simülatör] Hata metni temsilidir; parola politikası: ' + miss.join(', ') + '.') : null;
        }

        // ═══ tmsh komut yürütme ═══════════════════════════════════════════
        // ═══ LTM nesneleri ═══════════════════════════════════════════════
        const PORTN = { 80: 'http', 443: 'https', 8080: 'webcache', 22: 'ssh', 53: 'domain', 21: 'ftp', 25: 'smtp', 8443: 'pcsync-https' };
        const PORTV = Object.fromEntries(Object.entries(PORTN).map(([k, v]) => [v, +k]));
        const portOf = s => (/^\d{1,5}$/.test(s) && +s <= 65535 ? +s : (s in PORTV ? PORTV[s] : (s === 'any' || s === '0' ? 0 : null)));
        const pname = n => (n === 0 ? 'any' : PORTN[n] || String(n));
        const ipport = s => { const m = String(s).match(/^(\d{1,3}(?:\.\d{1,3}){3})[:.]([A-Za-z0-9-]+)$/); if (!m || !isIp(m[1])) return null; const p = portOf(m[2]); return p === null ? null : { ip: m[1], port: p, key: m[1] + ':' + p }; };
        const LB_MODES = ['round-robin', 'ratio-member', 'ratio-node', 'least-connections-member', 'least-connections-node', 'fastest-node', 'fastest-app-response', 'observed-member', 'observed-node', 'predictive-member', 'predictive-node', 'dynamic-ratio-member', 'dynamic-ratio-node', 'ratio-least-connections-member', 'ratio-least-connections-node', 'weighted-least-connections-member', 'weighted-least-connections-node', 'ratio-session', 'least-sessions'];
        const BUILTIN_MON = { http: { type: 'http', send: 'GET /\\r\\n', recv: '' }, https: { type: 'https', send: 'GET /\\r\\n', recv: '' }, tcp: { type: 'tcp', send: '', recv: '' }, tcp_half_open: { type: 'tcp_half_open' }, gateway_icmp: { type: 'gateway-icmp' }, icmp: { type: 'icmp' }, http_head_f5: { type: 'http', send: 'HEAD / HTTP/1.0\\r\\n\\r\\n', recv: 'Server' } };
        const monOf = n => M().monitors[n] || BUILTIN_MON[n] || null;
        const BUILTIN_PROF = { tcp: 'tcp', http: 'http', clientssl: 'client-ssl', serverssl: 'server-ssl', fastL4: 'fastl4', oneconnect: 'one-connect', 'f5-tcp-progressive': 'tcp', 'f5-tcp-wan': 'tcp', 'f5-tcp-lan': 'tcp' };
        const profType = n => BUILTIN_PROF[n] || (M().httpProfiles[n] ? 'http' : (M().cssl || {})[n] ? 'client-ssl' : (M().sssl || {})[n] ? 'server-ssl' : null);
        const BUILTIN_PERSIST = { cookie: 'cookie', source_addr: 'source-addr', ssl: 'ssl', dest_addr: 'dest-addr', universal: 'universal', hash: 'hash' };
        const persistType = n => BUILTIN_PERSIST[n] || (M().persists[n] ? M().persists[n].type : null);
        const memberList = s => { const r = listOp([], { op: 'replace-all-with', items: [{ k: s }] }, x => x); return r.list; };
        void memberList;
        const monSpec = v => { const names = String(v).split(/\s+and\s+/).map(x => x.trim()).filter(Boolean); return names; };
        const vsUsing = pool => Object.entries(M().virtuals).find(([, v]) => v.pool === pool);
        T['ltm node'] = {
            kind: 'node', named: true, coll: () => M().nodes,
            fresh: () => ({ address: null, session: 'user-enabled', state: 'user-up', monitor: null, desc: '' }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'address') { if (!isIp(p.v || '')) return SYNx('"' + p.v + '" invalid IP address'); o.address = p.v; }
                    else if (p.k === 'session') { if (!['user-enabled', 'user-disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid session (user-enabled|user-disabled)'); o.session = p.v; }
                    else if (p.k === 'state') { if (!['user-up', 'user-down'].includes(p.v)) return SYNx('"' + p.v + '" invalid state (user-up|user-down)'); o.state = p.v; }
                    else if (p.k === 'monitor') { if (p.v === 'none') { o.monitor = null; continue; } for (const m of monSpec(p.v)) if (!monOf(m)) return NF('monitor', m); o.monitor = monSpec(p.v); }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (isCreate && !o.address) { if (isIp(name)) o.address = name; else return E('# [Simülatör] Node için address gerekli.'); }
                return null;
            },
            del(name) { const n = M().nodes[name]; const u = Object.entries(M().pools).find(([, pl]) => Object.values(pl.members).some(m => m.ip === n.address)); if (u) return E('01070110:3: Node address \'/Common/' + name + '\' is referenced by a member of pool \'/Common/' + u[0] + '\'.'); return null; },
            list(n, o) { const L = ['ltm node ' + n + ' {', '    address ' + o.address]; if (o.desc) L.push('    description "' + o.desc + '"'); if (o.monitor) L.push('    monitor ' + o.monitor.join(' and ')); if (o.session !== 'user-enabled') L.push('    session ' + o.session); if (o.state !== 'user-up') L.push('    state ' + o.state); L.push('}'); return L; },
            props: ['address', 'session', 'state', 'monitor', 'description'],
        };
        function ensureNode(ip) { const n = Object.entries(M().nodes).find(([, x]) => x.address === ip); if (n) return n[0]; M().nodes[ip] = { address: ip, session: 'user-enabled', state: 'user-up', monitor: null, desc: '' }; return ip; }
        T['ltm pool'] = {
            kind: 'pool', named: true, coll: () => M().pools,
            fresh: () => ({ members: {}, order: [], monitor: null, lb: 'round-robin', minActive: 0, desc: '' }),
            set(o, P, name) {
                for (const p of P) {
                    if (p.k === 'members') {
                        if (p.v === 'none') { o.members = {}; o.order = []; continue; }
                        if (p.v !== undefined) return SYNx('"' + p.v + '" unexpected argument (members add { ip:port })');
                        if (p.op === 'replace-all-with') { o.members = {}; o.order = []; }
                        for (const it of p.items) {
                            const ap = ipport(it.k); if (!ap) return SYNx('"' + it.k + '" invalid pool member (A.B.C.D:port)');
                            const mNF = () => E('01020036:3: The requested pool member (/Common/' + name + ' /Common/' + ap.ip + ' ' + pname(ap.port) + ') was not found.');
                            if (p.op === 'delete') { if (!o.members[ap.key]) return mNF(); delete o.members[ap.key]; o.order = o.order.filter(x => x !== ap.key); continue; }
                            if (p.op === 'modify' && !o.members[ap.key]) return mNF();
                            const m = o.members[ap.key] || { ip: ap.ip, port: ap.port, pg: 0, ratio: 1, session: 'user-enabled', state: 'user-up', desc: '' };
                            const b = it.b || [];
                            for (let i = 0; i < b.length; i += 2) {
                                const k = b[i].k, v = b[i + 1] && b[i + 1].k;
                                if (k === 'address') continue;
                                if (v === undefined) return SYNx('"' + k + '" requires a value');
                                if (k === 'priority-group') { if (!/^\d{1,5}$/.test(v)) return SYNx('"' + v + '" invalid priority-group'); m.pg = +v; }
                                else if (k === 'ratio') { if (!/^\d{1,5}$/.test(v) || +v < 1) return SYNx('"' + v + '" invalid ratio'); m.ratio = +v; }
                                else if (k === 'session') { if (!['user-enabled', 'user-disabled'].includes(v)) return SYNx('"' + v + '" invalid session'); m.session = v; }
                                else if (k === 'state') { if (!['user-up', 'user-down'].includes(v)) return SYNx('"' + v + '" invalid state'); m.state = v; }
                                else if (k === 'description') m.desc = v;
                                else if (k === 'connection-limit') { if (!/^\d{1,9}$/.test(v)) return SYNx('"' + v + '" invalid connection-limit'); m.limit = +v; }
                                else return SYN(k);
                            }
                            if (!o.members[ap.key]) { o.order.push(ap.key); ensureNode(ap.ip); }
                            o.members[ap.key] = m;
                        }
                    }
                    else if (p.k === 'monitor') { if (p.v === 'none') { o.monitor = null; continue; } for (const m of monSpec(p.v)) if (!monOf(m)) return NF('monitor', m); o.monitor = monSpec(p.v); }
                    else if (p.k === 'load-balancing-mode') { if (!LB_MODES.includes(p.v)) return SYNx('"' + p.v + '" invalid load-balancing-mode'); o.lb = p.v; }
                    else if (p.k === 'min-active-members') { if (!/^\d{1,3}$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); o.minActive = +p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                return null;
            },
            del(name) { const u = vsUsing(name); if (u) return E('01070265:3: The Pool (/Common/' + name + ') cannot be deleted because it is in use by a Virtual Server (/Common/' + u[0] + ').'); return null; },
            list(n, o) {
                const L = ['ltm pool ' + n + ' {']; if (o.desc) L.push('    description "' + o.desc + '"'); if (o.lb !== 'round-robin') L.push('    load-balancing-mode ' + o.lb);
                if (o.order.length) { L.push('    members {'); o.order.forEach(k => { const m = o.members[k]; L.push('        ' + m.ip + ':' + pname(m.port) + ' {', '            address ' + m.ip); if (m.pg) L.push('            priority-group ' + m.pg); if (m.ratio !== 1) L.push('            ratio ' + m.ratio); if (m.session !== 'user-enabled') L.push('            session ' + m.session); if (m.state !== 'user-up') L.push('            state ' + m.state); if (m.limit) L.push('            connection-limit ' + m.limit); L.push('        }'); }); L.push('    }'); }
                if (o.minActive) L.push('    min-active-members ' + o.minActive);
                if (o.monitor) L.push('    monitor ' + o.monitor.join(' and '));
                L.push('}'); return L;
            },
            props: ['members', 'monitor', 'load-balancing-mode', 'min-active-members', 'description'],
        };
        const monType = (typ) => ({
            kind: 'monitor', named: true, coll: () => new Proxy(M().monitors, { get: (t, k) => (t[k] && t[k].type === typ ? t[k] : undefined), has: (t, k) => !!(t[k] && t[k].type === typ), ownKeys: t => Object.keys(t).filter(k => t[k].type === typ), getOwnPropertyDescriptor: (t, k) => (t[k] && t[k].type === typ ? { enumerable: true, configurable: true, value: t[k] } : undefined), set: (t, k, v) => { t[k] = v; return true; }, deleteProperty: (t, k) => { delete t[k]; return true; } }),
            fresh: () => ({ type: typ, parent: typ === 'gateway-icmp' ? 'gateway_icmp' : typ, send: typ === 'http' || typ === 'https' ? 'GET /\\r\\n' : '', recv: '', recvDisable: '', interval: 5, timeout: 16, dest: '*:*' }),
            set(o, P, name) {
                if (BUILTIN_MON[name]) return E('# [Simülatör] "' + name + '" hazır (varsayılan) bir monitör; değiştirmek yerine defaults-from ile yenisini oluşturun.');
                for (const p of P) {
                    if (p.k === 'defaults-from') { const b = monOf(p.v); if (!b || (b.type !== typ && !(typ === 'gateway-icmp' && p.v === 'gateway_icmp'))) return NF('monitor', p.v); o.parent = p.v; if (b.send !== undefined) o.send = b.send; if (b.recv !== undefined) o.recv = b.recv; }
                    else if (p.k === 'send' && (typ === 'http' || typ === 'https' || typ === 'tcp')) o.send = p.v;
                    else if (p.k === 'recv' && (typ === 'http' || typ === 'https' || typ === 'tcp')) o.recv = p.v === 'none' ? '' : p.v;
                    else if (p.k === 'recv-disable' && (typ === 'http' || typ === 'https')) o.recvDisable = p.v === 'none' ? '' : p.v;
                    else if (p.k === 'interval' || p.k === 'timeout') { if (!/^\d{1,5}$/.test(p.v) || +p.v < 1) return SYNx('"' + p.v + '" invalid value'); o[p.k] = +p.v; }
                    else if (p.k === 'destination') { if (!/^(\*|\d{1,3}(\.\d{1,3}){3}):(\*|\d{1,5}|[a-z-]+)$/.test(p.v)) return SYNx('"' + p.v + '" invalid destination (*:* ya da *:8080)'); o.dest = p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else return SYN(p.k);
                }
                if (o.timeout <= o.interval) return E('# [Simülatör] timeout, interval\'dan büyük olmalı (öneri: 3 × interval + 1, ör. 5/16).');
                return null;
            },
            del(name) { const u = Object.entries(M().pools).find(([, pl]) => (pl.monitor || []).includes(name)) || Object.entries(M().nodes).find(([, nd]) => (nd.monitor || []).includes(name)); if (u) return E('01070083:3: Monitor ' + name + ' is in use\n# [Simülatör] /Common/' + u[0] + ' tarafından kullanılıyor.'); return null; },
            list(n, o) { const L = ['ltm monitor ' + typ + ' ' + n + ' {', '    adaptive disabled', '    defaults-from /Common/' + o.parent, '    destination ' + o.dest, '    interval ' + o.interval]; if (typ === 'http' || typ === 'https' || typ === 'tcp') { if (o.recv) L.push('    recv "' + o.recv + '"'); if (o.recvDisable) L.push('    recv-disable "' + o.recvDisable + '"'); if (o.send) L.push('    send "' + o.send + '"'); } L.push('    time-until-up 0', '    timeout ' + o.timeout, '}'); return L; },
            props: ['defaults-from', 'send', 'recv', 'recv-disable', 'interval', 'timeout', 'destination', 'description'],
        });
        T['ltm monitor http'] = monType('http'); T['ltm monitor https'] = monType('https'); T['ltm monitor tcp'] = monType('tcp'); T['ltm monitor gateway-icmp'] = monType('gateway-icmp');
        T['ltm snatpool'] = {
            kind: 'snatpool', named: true, coll: () => M().snatpools,
            fresh: () => ({ members: [] }),
            set(o, P) { for (const p of P) { if (p.k !== 'members') return SYN(p.k); const r = listOp(o.members, p, x => (isIp(x) ? x : null)); if (r.bad) return SYNx('"' + r.bad + '" invalid IP address'); if (r.missing) return E('# [Simülatör] ' + r.missing + ' listede yok.'); o.members = r.list; } if (!o.members.length) return E('# [Simülatör] SNAT pool\'da en az bir adres olmalı.'); return null; },
            del(name) { const u = Object.entries(M().virtuals).find(([, v]) => v.sat.type === 'snat' && v.sat.pool === name); if (u) return E('# [Simülatör] SNAT pool /Common/' + u[0] + ' tarafından kullanılıyor.'); return null; },
            list(n, o) { return ['ltm snatpool ' + n + ' {', '    members {'].concat(o.members.map(x => '        /Common/' + x), ['    }', '}']); },
            props: ['members'],
        };
        const persistT = (typ, parent) => ({
            kind: 'persistence profile', named: true, coll: () => new Proxy(M().persists, { get: (t, k) => (t[k] && t[k].type === typ ? t[k] : undefined), has: (t, k) => !!(t[k] && t[k].type === typ), ownKeys: t => Object.keys(t).filter(k => t[k].type === typ), getOwnPropertyDescriptor: (t, k) => (t[k] && t[k].type === typ ? { enumerable: true, configurable: true, value: t[k] } : undefined), set: (t, k, v) => { t[k] = v; return true; }, deleteProperty: (t, k) => { delete t[k]; return true; } }),
            fresh: () => (typ === 'cookie' ? { type: typ, parent, method: 'insert', cookieName: '', expiration: '0' } : { type: typ, parent, timeout: 180, mask: 'none' }),
            set(o, P) {
                for (const p of P) {
                    if (p.k === 'defaults-from') { if (persistType(p.v) !== typ) return NF('persistence profile', p.v); o.parent = p.v; }
                    else if (typ === 'cookie' && p.k === 'method') { if (!['insert', 'rewrite', 'passive', 'hash'].includes(p.v)) return SYNx('"' + p.v + '" invalid method'); o.method = p.v; }
                    else if (typ === 'cookie' && p.k === 'cookie-name') o.cookieName = p.v;
                    else if (typ === 'cookie' && p.k === 'expiration') o.expiration = p.v;
                    else if (typ === 'source-addr' && p.k === 'timeout') { if (!/^\d+$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); o.timeout = +p.v; }
                    else if (typ === 'source-addr' && p.k === 'mask') o.mask = p.v;
                    else return SYN(p.k);
                }
                return null;
            },
            list(n, o) { return typ === 'cookie' ? ['ltm persistence cookie ' + n + ' {', '    app-service none', o.cookieName ? '    cookie-name ' + o.cookieName : null, '    defaults-from /Common/' + o.parent, '    expiration ' + o.expiration, '    method ' + o.method, '}'].filter(Boolean) : ['ltm persistence source-addr ' + n + ' {', '    app-service none', '    defaults-from /Common/' + o.parent, '    mask ' + o.mask, '    timeout ' + o.timeout, '}']; },
            props: typ === 'cookie' ? ['defaults-from', 'method', 'cookie-name', 'expiration'] : ['defaults-from', 'timeout', 'mask'],
        });
        T['ltm persistence cookie'] = persistT('cookie', 'cookie'); T['ltm persistence source-addr'] = persistT('source-addr', 'source_addr');
        T['ltm profile http'] = {
            kind: 'profile', named: true, coll: () => M().httpProfiles,
            fresh: () => ({ parent: 'http', xff: 'disabled', redirectRewrite: 'none' }),
            set(o, P) { for (const p of P) { if (p.k === 'defaults-from') { if (profType(p.v) !== 'http') return NF('profile', p.v); o.parent = p.v; } else if (p.k === 'insert-xforwarded-for') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.xff = p.v; } else if (p.k === 'redirect-rewrite') { if (!['none', 'all', 'matching', 'nodes'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.redirectRewrite = p.v; } else return SYN(p.k); } return null; },
            del(name) { const u = Object.entries(M().virtuals).find(([, v]) => v.profiles.includes(name)); if (u) return E('# [Simülatör] Profil /Common/' + u[0] + ' tarafından kullanılıyor.'); return null; },
            list(n, o) { return ['ltm profile http ' + n + ' {', '    app-service none', '    defaults-from /Common/' + o.parent, '    insert-xforwarded-for ' + o.xff, '    redirect-rewrite ' + o.redirectRewrite, '}']; },
            props: ['defaults-from', 'insert-xforwarded-for', 'redirect-rewrite'],
        };
        T['ltm virtual'] = {
            kind: 'virtual server', named: true, coll: () => M().virtuals,
            fresh: () => ({ dest: null, proto: 'tcp', pool: null, profiles: ['tcp'], persist: [], fallback: null, sat: { type: 'none' }, tport: 'enabled', taddr: 'enabled', mask: '255.255.255.255', source: '0.0.0.0/0', enabled: true, desc: '', idx: 2 + Object.keys(M().virtuals).length }),
            flags: ['enabled', 'disabled'],
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.flag) { o.enabled = p.k === 'enabled'; continue; }
                    if (p.k === 'destination') { const d = ipport(p.v || ''); if (!d) return SYNx('"' + p.v + '" invalid destination (A.B.C.D:port)'); o.dest = d.key; }
                    else if (p.k === 'ip-protocol') { if (!['tcp', 'udp', 'any'].includes(p.v)) return SYNx('"' + p.v + '" invalid ip-protocol'); o.proto = p.v; }
                    else if (p.k === 'pool') { if (p.v === 'none') { o.pool = null; continue; } if (!M().pools[p.v]) return NF('pool', p.v); o.pool = p.v; }
                    else if (p.k === 'profiles') {
                        const cur = o.profiles.slice(), r = listOp(cur, { op: p.op, v: p.v, items: (p.items || []).map(x => ({ k: x.k })) }, x => (profType(x) ? x : null));
                        if (r.bad) return NF('profile', r.bad); if (r.missing) return E('# [Simülatör] ' + r.missing + ' profili bu virtual server\'da yok.');
                        o.profiles = r.list;
                    }
                    else if (p.k === 'persist') {
                        if (p.v === 'none') { o.persist = []; continue; }
                        const items = p.v !== undefined ? [{ k: p.v }] : p.items;
                        const r = listOp(o.persist, { op: p.v !== undefined ? 'replace-all-with' : p.op, items: items.map(x => ({ k: x.k })) }, x => (persistType(x) ? x : null));
                        if (r.bad) return NF('persistence profile', r.bad); if (r.missing) return E('# [Simülatör] ' + r.missing + ' bu virtual server\'da yok.');
                        o.persist = r.list.slice(0, 1);
                    }
                    else if (p.k === 'fallback-persistence') { if (p.v === 'none') { o.fallback = null; continue; } if (!persistType(p.v)) return NF('persistence profile', p.v); o.fallback = p.v; }
                    else if (p.k === 'source-address-translation') {
                        const b = p.items || []; const kv = {}; for (let i = 0; i < b.length; i += 2) kv[b[i].k] = b[i + 1] && b[i + 1].k;
                        if (!['none', 'automap', 'snat'].includes(kv.type)) return SYNx('source-address-translation { type none|automap|snat [pool <snatpool>] }');
                        if (kv.type === 'snat') { if (!kv.pool || !M().snatpools[kv.pool]) return NF('snatpool', kv.pool || '(pool)'); o.sat = { type: 'snat', pool: kv.pool }; } else o.sat = { type: kv.type };
                    }
                    else if (p.k === 'snat') { if (p.v === 'automap') o.sat = { type: 'automap' }; else if (p.v === 'none') o.sat = { type: 'none' }; else return SYNx('"' + p.v + '" (snat automap|none; yeni sürümlerde source-address-translation { type … })'); }
                    else if (p.k === 'translate-port' || p.k === 'translate-address') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o[p.k === 'translate-port' ? 'tport' : 'taddr'] = p.v; }
                    else if (p.k === 'mask') { const mv = p.v === 'any' ? '0.0.0.0' : p.v; if (!isIp(mv) || C.maskLen(mv) < 0) return SYNx('"' + p.v + '" invalid mask'); o.mask = mv; }
                    else if (p.k === 'source') { const c = p.v === 'any' ? { ip: '0.0.0.0', len: 0 } : cidr(p.v || ''); if (!c || ip2n(c.ip) !== netOf(c.ip, c.len)) return SYNx('"' + p.v + '" invalid source (A.B.C.D/len)'); o.source = c.ip + '/' + c.len; }
                    else if (p.k === 'connection-limit') { if (!/^\d{1,9}$/.test(p.v || '')) return SYNx('"' + p.v + '" invalid connection-limit'); o.limit = +p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else if (p.k === 'rules') { const cur = (o.rules || []).slice(); const r = listOp(cur, { op: p.op, v: p.v, items: (p.items || []).map(x => ({ k: x.k })) }, x => (M().rules[x] ? x : null)); if (r.bad) return NF('rule', r.bad); if (r.missing) return E('# [Simülatör] ' + r.missing + ' kuralı bu virtual server\'da yok.'); o.rules = r.list; }
                    else return SYN(p.k);
                }
                if (isCreate && !o.dest) return E('# [Simülatör] Virtual server için destination gerekli (ör. destination 203.0.113.100:80).');
                { const di = o.dest.split(':')[0], ml = C.maskLen(o.mask); if (netOf(di, ml) !== ip2n(di)) return E('# [Simülatör] Hedef adres (' + di + ') maskeyle (' + o.mask + ') uyumsuz: ağ virtual server\'ında adres ağ adresi olmalı (ör. 203.0.113.0 mask 255.255.255.0).'); }
                const dup = Object.entries(M().virtuals).find(([vn, v]) => vn !== name && v.dest === o.dest && v.proto === o.proto && (v.mask || '255.255.255.255') === o.mask && (v.source || '0.0.0.0/0') === o.source);
                if (dup) return E('01070333:3: Virtual Server /Common/' + name + ' illegally shares destination address, source address, service port, ip-protocol, and vlan with Virtual Server /Common/' + dup[0]);
                { const cs = o.profiles.filter(x => profType(x) === 'client-ssl'); if (cs.length > 1 && !cs.some(x => (M().cssl[x] || {}).sniDefault === 'true')) return E('0107149c:3: Virtual server /Common/' + name + ' has more than one clientssl/serverssl profile but none of them is default for SNI'); }
                const hasHttp = o.profiles.some(x => profType(x) === 'http');
                { const hr = (o.rules || []).find(x => M().rules[x] && ruleHttpEv(M().rules[x])); if (hr && !hasHttp) return E('01070394:3: ' + ruleHttpEv(M().rules[hr]).name + ' event in rule (/Common/' + hr + ') requires an associated HTTP or FASTHTTP profile on the virtual server (/Common/' + name + ').'); }
                if (o.persist.some(x => persistType(x) === 'cookie') && !hasHttp) return E('Cookie persistence requires an HTTP or FastHTTP profile to be associated with the virtual server.\n# [Simülatör] Önce profiles add { http }.');
                if (o.profiles.some(x => profType(x) === 'http') && !o.profiles.some(x => ['tcp', 'fastl4'].includes(profType(x)))) return E('# [Simülatör] HTTP profili bir TCP profili gerektirir.');
                return null;
            },
            list(n, o) {
                const L = ['ltm virtual ' + n + ' {', '    creation-time 2026-09-24:10:21:07']; if (o.desc) L.push('    description "' + o.desc + '"');
                const d = o.dest.split(':'); L.push('    destination ' + d[0] + ':' + pname(+d[1])); if (!o.enabled) L.push('    disabled');
                if (o.fallback) L.push('    fallback-persistence ' + o.fallback);
                if (o.limit) L.push('    connection-limit ' + o.limit);
                L.push('    ip-protocol ' + o.proto, '    last-modified-time 2026-09-24:10:21:07', '    mask ' + (o.mask === '0.0.0.0' ? 'any' : o.mask));
                if (o.persist.length) { L.push('    persist {'); o.persist.forEach(x => L.push('        ' + x + ' {', '            default yes', '        }')); L.push('    }'); }
                if (o.pool) L.push('    pool ' + o.pool);
                L.push('    profiles {'); o.profiles.forEach(x => L.push('        ' + x + ' { }')); L.push('    }'); if ((o.rules || []).length) { L.push('    rules {'); o.rules.forEach(x => L.push('        ' + x)); L.push('    }'); }
                L.push('    serverssl-use-sni disabled', '    source ' + (o.source || '0.0.0.0/0'));
                L.push('    source-address-translation {', '        ' + (o.sat.type === 'snat' ? 'pool ' + o.sat.pool : '') + (o.sat.type === 'snat' ? '\n        ' : '') + 'type ' + o.sat.type, '    }');
                if (o.taddr !== 'enabled') L.push('    translate-address ' + o.taddr); else L.push('    translate-address enabled');
                L.push('    translate-port ' + o.tport, '    vs-index ' + o.idx, '}');
                return L;
            },
            props: ['destination', 'ip-protocol', 'pool', 'profiles', 'persist', 'connection-limit', 'fallback-persistence', 'source-address-translation', 'translate-port', 'translate-address', 'mask', 'source', 'rules', 'description', 'enabled', 'disabled'],
        };
        // ═══ HA: cihazlar, güven, device group, traffic group ════════════════
        // Eş cihaz lab.sim.peer: { name, mgmt, ha (HA/configsync self IP'si), timeSkew?, garpBlocked? } — eşin kendi taban ağı hazır kabul edilir.
        const PEER = SIM.peer || null;
        const isSelfIp = ip => Object.values(M().selfs).some(x => x.address && x.address.split('/')[0] === ip && x.tg === 'traffic-group-local-only');
        T['cm device'] = {
            kind: 'device', named: true, fixed: true,
            coll: () => { const o = { [M().hostname]: M().cm }; if (PEER) o[PEER.name] = { peer: true }; return o; },
            set(o, P, name) {
                if (o.peer) return E('# [Simülatör] ' + name + ' eş cihazdır; onun adresleri kendi üzerinde (bigip-b) ayarlanır.');
                for (const p of P) {
                    if (p.k === 'configsync-ip') { if (p.v === 'none') { o.cs = null; continue; } if (M().mgmtIp && p.v === M().mgmtIp.split('/')[0]) return E('# [Simülatör] ConfigSync adresi yönetim IP\'si olamaz (K14348): HA VLAN\'ındaki non-floating self IP\'yi verin.'); if (!isSelfIp(p.v)) return E('# [Simülatör] ' + p.v + ' bu cihazın non-floating self IP\'si değil.'); o.cs = p.v; }
                    else if (p.k === 'mirror-ip') { if (p.v === 'any6') { o.mirror = null; continue; } if (!isSelfIp(p.v)) return E('# [Simülatör] ' + p.v + ' bu cihazın non-floating self IP\'si değil.'); o.mirror = p.v; }
                    else if (p.k === 'unicast-address') {
                        const ips = []; for (const it of (p.items || [])) { const b = it.b || []; const i2 = b.findIndex(x => x.k === 'ip'); const ip = i2 >= 0 && b[i2 + 1] ? b[i2 + 1].k : null; if (!ip || !isIp(ip)) return SYNx('unicast-address { { ip <adres> } … }'); if (!isSelfIp(ip) && !(M().mgmtIp && M().mgmtIp.split('/')[0] === ip)) return E('# [Simülatör] ' + ip + ' bu cihazın self IP\'si ya da yönetim IP\'si değil.'); ips.push(ip); }
                        if (p.v === 'none') { o.uni = []; continue; } o.uni = ips;
                    }
                    else return SYN(p.k);
                }
                return null;
            },
            list(n, o) { if (o.peer) return ['cm device ' + n + ' {', '    configsync-ip ' + PEER.ha, '    failover-state ' + (HA.st === 'active' ? 'standby' : 'active'), '    hostname ' + n, '    management-ip ' + PEER.mgmt, '    mirror-ip ' + PEER.ha, '    unicast-address {', '        {', '            ip ' + PEER.ha, '        }', '    }', '    version 17.1.1.3', '}'];
                const L = ['cm device ' + n + ' {', '    configsync-ip ' + (o.cs || 'none'), '    failover-state ' + (HA.st === 'active' ? 'active' : HA.st), '    hostname ' + n, '    management-ip ' + (M().mgmtIp ? M().mgmtIp.split('/')[0] : 'none'), '    mirror-ip ' + (o.mirror || 'any6')];
                if (o.uni.length) { L.push('    unicast-address {'); o.uni.forEach(ip => L.push('        {', '            ip ' + ip, '        }')); L.push('    }'); } else L.push('    unicast-address none');
                L.push('    version ' + curVer(), '}'); return L; },
            props: ['configsync-ip', 'unicast-address', 'mirror-ip'],
        };
        T['cm trust-domain'] = {
            kind: 'trust domain', named: true, fixed: true, coll: () => ({ Root: M().cm }),
            set(o, P) {
                const kv = {}; let add = null;
                for (const p of P) { if (p.k === 'ca-devices') { if (p.op !== 'add' || !p.items || !p.items.length) return SYNx('ca-devices add { <eş yönetim IP> }'); add = p.items[0].k; } else if (['name', 'username', 'password'].includes(p.k)) kv[p.k] = p.v; else return SYN(p.k); }
                if (!add) return E('Syntax Error: ca-devices add { <ip> } name <cihaz> username <kullanıcı> password <parola>', 'incomplete');
                if (!kv.name || !kv.username || !kv.password) return E('# [Simülatör] name, username ve password gerekli.', 'incomplete');
                if (!PEER || add !== PEER.mgmt || kv.name !== PEER.name) return E('# [Simülatör] ' + add + ' adresinde "' + kv.name + '" adlı bir BIG-IP bulunamadı (eşin yönetim IP\'si ve tam adı).');
                if (!(SIM.mgmtHosts || []).includes(PEER.mgmt) || !M().mgmtIp) return E('# [Simülatör] Eşin yönetim adresine (' + PEER.mgmt + ') ulaşılamıyor.');
                if (PEER.timeSkew) return E('# [Simülatör] Güven kurulamadı: eşin saati bu cihazdan çok farklı; aygıt sertifikası geçerli sayılmıyor. İki cihazda NTP\'yi düzeltin.');
                if (!o.trusted.includes(PEER.name)) o.trusted.push(PEER.name);
                return null;
            },
            list() { return ['cm trust-domain Root {', '    ca-devices { ' + [M().hostname].concat(M().cm.trusted).join(' ') + ' }', '    status ' + (M().cm.trusted.length ? 'standalone-trust' : 'standalone'), '    trust-group Root', '}', '# [Simülatör] Alanlar kısaltıldı. Not: ca-devices biçimi v13\'ten beri eski (deprecated) sayılır; yeni biçim add-device alt komutudur.']; },
            props: ['ca-devices', 'name', 'username', 'password'],
        };
        T['cm device-group'] = {
            kind: 'device group', named: true, coll: () => M().cm.dgs,
            fresh: () => ({ devices: [], type: 'sync-only', autoSync: 'disabled', netFo: 'disabled' }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'devices') { const r = listOp(o.devices, p, x => x); if (r.bad || r.missing) return SYNx('"' + (r.bad || r.missing) + '" invalid device'); for (const d of r.list) if (d !== M().hostname && !M().cm.trusted.includes(d)) return E('# [Simülatör] ' + d + ' güven alanında (trust domain) değil; önce device trust kurun.'); o.devices = r.list; }
                    else if (p.k === 'type') { if (!['sync-failover', 'sync-only'].includes(p.v)) return SYNx('"' + p.v + '" invalid type'); if (!isCreate && p.v !== o.type) return E('# [Simülatör] Device group tipi oluşturulduktan sonra değiştirilemez.'); o.type = p.v; }
                    else if (p.k === 'auto-sync') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.autoSync = p.v; }
                    else if (p.k === 'network-failover') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.netFo = p.v; }
                    else if (p.k === 'full-load-on-sync') continue;
                    else return SYN(p.k);
                }
                return null;
            },
            list(n, o) { return ['cm device-group ' + n + ' {', '    auto-sync ' + o.autoSync, '    devices {'].concat(o.devices.map(d => '        ' + d + ' { }'), ['    }', '    network-failover ' + o.netFo, '    type ' + o.type, '}']); },
            props: ['devices', 'type', 'auto-sync', 'network-failover', 'full-load-on-sync'],
        };
        T['cm traffic-group'] = {
            kind: 'traffic group', named: true, fixed: true, coll: () => ({ 'traffic-group-1': M().cm, 'traffic-group-local-only': { local: true } }),
            set(o, P, name) { if (o.local) return E('# [Simülatör] traffic-group-local-only değiştirilemez.'); for (const p of P) { if (p.k !== 'mac') return SYN(p.k); if (p.v === 'none') { o.tgMac = null; continue; } if (!/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i.test(p.v)) return SYNx('"' + p.v + '" invalid MAC address'); if (!(parseInt(p.v.slice(0, 2), 16) & 2)) return E('# [Simülatör] Uyarı niteliğinde red: yerel yönetilen (locally administered, ör. 02:…) bir MAC seçin; üretici OUI\'li adres L2\'de çakışabilir (K3523).'); o.tgMac = p.v.toLowerCase(); } return null; },
            list(n, o) { return o.local ? ['cm traffic-group traffic-group-local-only { }'] : ['cm traffic-group traffic-group-1 {', '    mac ' + (o.tgMac || 'none'), '    unit-id 1', '}']; },
            props: ['mac'],
        };
        // ═══ SSL: sertifika/anahtar (sys crypto), client-ssl / server-ssl profilleri ═══
        // Biçimler: notes/f5-ssl-arastirma.md (sözdizimi ve hata kodları clouddocs/bug tracker; list çıktıları yaklaşık)
        const certOf = n => M().certs[n] || null;
        const certSubj = c => (c.ca ? 'C=TR; O=Lab; CN=' : 'CN=') + c.cn;
        const certSubjF5 = c => 'CN=' + c.cn + (c.ca ? ',O=Lab,C=TR' : '');
        const certSubjSsl = c => (c.ca ? 'C = TR, O = Lab, CN = ' : 'CN = ') + c.cn;
        const issuerCert = c => Object.values(M().certs).find(x => x.cn === c.issuer && x.ca) || null;
        function certFields(k, P) {
            const kv = {}; for (const p of P) { if (p.flag) continue; kv[p.k] = p.v; }
            return kv;
        }
        T['sys crypto key'] = {
            kind: 'key', named: true, coll: () => M().keys,
            fresh: () => ({ bits: 2048, pair: null }),
            flags: ['gen-certificate', 'gen-csr'],
            set(o, P, name, isCreate) {
                if (!isCreate) return E('# [Simülatör] Anahtar değiştirilemez; yenisini install/create edin.', 'value');
                const kv = certFields(name, P), gen = P.some(p => p.k === 'gen-certificate');
                for (const p of P) if (!p.flag && !['key-size', 'key-type', 'common-name', 'subject-alternative-name', 'lifetime', 'country', 'state', 'city', 'organization', 'ou', 'email-address'].includes(p.k)) return SYN(p.k);
                if (kv['key-size'] && !['512', '1024', '2048', '4096'].includes(kv['key-size'])) return SYNx('"' + kv['key-size'] + '" invalid key-size');
                o.bits = +(kv['key-size'] || 2048); o.pair = 'gen:' + name;
                if (gen) {
                    if (!kv['common-name']) return E('# [Simülatör] gen-certificate için common-name gerekli.', 'incomplete');
                    const san = kv['subject-alternative-name'] ? kv['subject-alternative-name'].split(/\s*,\s*/) : [];
                    M().certs[name] = { cn: kv['common-name'], issuer: kv['common-name'], self: true, san, pair: o.pair, bits: o.bits, nb: 'Sep 24 10:21:07 2026 GMT', na: 'Sep 24 10:21:07 ' + (2026 + Math.max(1, Math.round((+(kv.lifetime || 365)) / 365))) + ' GMT' };
                }
                return null;
            },
            del(name) { const u = Object.entries(M().cssl).find(([, p]) => p.ckc.some(e => e.key === name)); if (u) return E('# [Simülatör] Anahtar /Common/' + u[0] + ' profilinde kullanılıyor.'); return null; },
            list(n, o) { return ['sys crypto key ' + n + ' {', '    key-size ' + o.bits, '    key-type rsa-private', '    security-type normal', '}']; },
            props: ['key-size', 'key-type', 'common-name', 'subject-alternative-name', 'lifetime', 'gen-certificate'],
        };
        T['sys crypto cert'] = {
            kind: 'certificate', named: true, coll: () => M().certs,
            fresh: () => ({}),
            set(o, P, name, isCreate) {
                if (!isCreate) { for (const p of P) { if (p.k !== 'issuer-cert') return SYN(p.k); if (!certOf(p.v)) return NF('certificate', p.v); } return null; }
                const kv = certFields(name, P);
                for (const p of P) if (!['key', 'common-name', 'subject-alternative-name', 'lifetime', 'country', 'organization', 'ou'].includes(p.k)) return SYN(p.k);
                const k = M().keys[kv.key]; if (!kv.key) return E('# [Simülatör] Sertifika oluşturmak için key gerekli (create sys crypto cert <ad> key <anahtar> common-name <ad>).', 'incomplete');
                if (!k) return E('01070277:3: The requested key (/Common/' + kv.key + ') was not found.');
                if (!kv['common-name']) return E('# [Simülatör] common-name gerekli.', 'incomplete');
                Object.assign(o, { cn: kv['common-name'], issuer: kv['common-name'], self: true, san: kv['subject-alternative-name'] ? kv['subject-alternative-name'].split(/\s*,\s*/) : [], pair: k.pair, bits: k.bits, nb: 'Sep 24 10:21:07 2026 GMT', na: 'Sep 24 10:21:07 2027 GMT' });
                return null;
            },
            del(name) { if (['default.crt', 'ca-bundle.crt'].includes(name)) return E('# [Simülatör] Sistem sertifikası silinemez.'); const u = Object.entries(M().cssl).find(([, p]) => p.ckc.some(e => e.cert === name || e.chain === name)); if (u) return E('# [Simülatör] Sertifika /Common/' + u[0] + ' profilinde kullanılıyor.'); return null; },
            list(n, o) { if (o.bundle) return ['sys crypto cert ' + n + ' {', '    # [Simülatör] Güvenilen kök CA paketi (çok sertifika)', '}']; const L = ['sys crypto cert ' + n + ' {', '    common-name ' + o.cn]; if (o.ca) L.push('    country TR'); L.push('    expiration ' + o.na, '    key-size ' + (o.bits || 2048), '    key-type rsa-public'); if (o.ca) L.push('    organization Lab'); if (o.san && o.san.length) L.push('    subject-alternative-name ' + o.san.join(', ')); L.push('}'); return L; },
            props: ['key', 'common-name', 'subject-alternative-name', 'lifetime', 'issuer-cert'],
        };
        T['sys file ssl-cert'] = {
            kind: 'certificate', named: true, fixed: true, coll: () => M().certs,
            set() { return E('# [Simülatör] Sertifika dosyası install sys crypto cert ile yönetilir.', 'value'); },
            list(n, o) {
                if (o.bundle) return ['sys file ssl-cert ' + n + ' {', '    bundle-certificates { # [Simülatör] güvenilen kök CA\'lar }', '    is-bundle true', '}'];
                const L = ['sys file ssl-cert ' + n + ' {', '    certificate-key-size ' + (o.bits || 2048), '    expiration-string "' + o.na + '"', '    issuer "' + (o.self ? certSubjF5(o) : 'CN=' + o.issuer + ',O=Lab,C=TR') + '"', '    key-type rsa-public'];
                if (o.path) L.push('    source-path file://' + o.path);
                L.push('    subject "' + certSubjF5(o) + '"'); if (o.san && o.san.length) L.push('    subject-alternative-name ' + o.san.join(', ')); L.push('}'); return L;
            },
            props: ['certificate-key-size', 'expiration-string', 'issuer', 'key-type', 'source-path', 'subject', 'subject-alternative-name'],
        };
        const sslProfT = (kind, parentBase) => ({
            kind: 'profile', named: true, coll: () => (kind === 'client' ? M().cssl : M().sssl),
            fresh: () => (kind === 'client' ? { parent: 'clientssl', ckc: [], serverName: 'none', sniDefault: 'false' } : { parent: 'serverssl', serverName: 'none', peer: 'ignore' }),
            set(o, P, name) {
                for (const p of P) {
                    if (p.k === 'defaults-from') { if (profType(p.v) !== (kind === 'client' ? 'client-ssl' : 'server-ssl')) return NF('profile', p.v); o.parent = p.v; }
                    else if (p.k === 'server-name') o.serverName = p.v;
                    else if (kind === 'client' && p.k === 'sni-default') { if (!['true', 'false'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.sniDefault = p.v; }
                    else if (kind === 'server' && p.k === 'peer-cert-mode') { if (!['ignore', 'require', 'request'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); o.peer = p.v; }
                    else if (kind === 'client' && p.k === 'cert-key-chain') {
                        if (p.v === 'none') { o.ckc = []; continue; }
                        const ents = (p.items || []).map(it => { const e = { name: it.k }; const b = it.b || []; for (let i = 0; i < b.length; i += 2) e[b[i].k] = b[i + 1] ? b[i + 1].k : undefined; return e; });
                        for (const e of ents) for (const k of Object.keys(e)) if (!['name', 'cert', 'key', 'chain', 'passphrase', 'usage'].includes(k)) return SYN(k);
                        if (p.op === 'replace-all-with') o.ckc = ents;
                        else if (p.op === 'add') { for (const e of ents) { if (o.ckc.some(x => x.name === e.name)) return E('# [Simülatör] ' + e.name + ' girdisi zaten var.'); o.ckc.push(e); } }
                        else if (p.op === 'delete') o.ckc = o.ckc.filter(x => !ents.some(e => e.name === x.name));
                        else if (p.op === 'modify') { for (const e of ents) { const x = o.ckc.find(y => y.name === e.name); if (!x) return E('# [Simülatör] ' + e.name + ' girdisi yok.'); Object.assign(x, e); } }
                    }
                    else if (['cert', 'key', 'chain'].includes(p.k) && kind === 'client') return E('# [Simülatör] Üst seviye cert/key/chain eski biçimdir; F5 cert-key-chain kullanılmasını önerir: cert-key-chain replace-all-with { <ad> { cert … key … chain … } }', 'value');
                    else return SYN(p.k);
                }
                if (kind === 'client') {
                    if (o.ckc.length > 1) return E('010717e1:3: Client SSL profile (/Common/' + name + '): cannot contain more than one set of same certificate/key type.');
                    for (const e of o.ckc) {
                        if (!e.cert || !certOf(e.cert)) return NF('certificate', e.cert || '(cert)');
                        if (!e.key) return E('01070315:3: profile /Common/' + name + ' requires a key');
                        if (!M().keys[e.key]) return E('01070277:3: The requested key (/Common/' + e.key + ') was not found.');
                        if (e.chain && e.chain !== 'none' && !certOf(e.chain)) return NF('certificate', e.chain);
                        if (certOf(e.cert).pair !== M().keys[e.key].pair) return E('01070317:3: profile /Common/' + name + '\'s key and certificate do not match');
                    }
                }
                return null;
            },
            del(name) { const u = Object.entries(M().virtuals).find(([, v]) => v.profiles.includes(name)); if (u) return E('# [Simülatör] Profil /Common/' + u[0] + ' tarafından kullanılıyor.'); return null; },
            list(n, o) {
                const L = ['ltm profile ' + kind + '-ssl ' + n + ' {', '    app-service none'];
                if (kind === 'client') { L.push('    cert-key-chain {'); (o.ckc.length ? o.ckc : [{ name: 'default', cert: 'default.crt', key: 'default.key' }]).forEach(e => { L.push('        ' + e.name + ' {', '            cert ' + e.cert); if (e.chain && e.chain !== 'none') L.push('            chain ' + e.chain); L.push('            key ' + e.key, '        }'); }); L.push('    }'); }
                L.push('    defaults-from ' + o.parent);
                if (kind === 'client') L.push('    inherit-certkeychain ' + (o.ckc.length ? 'false' : 'true'));
                if (kind === 'server') L.push('    peer-cert-mode ' + o.peer);
                L.push('    server-name ' + o.serverName); if (kind === 'client') L.push('    sni-default ' + o.sniDefault);
                L.push('}'); return L;
            },
            props: kind === 'client' ? ['defaults-from', 'cert-key-chain', 'server-name', 'sni-default'] : ['defaults-from', 'server-name', 'peer-cert-mode'],
        });
        T['ltm profile client-ssl'] = sslProfT('client'); T['ltm profile server-ssl'] = sslProfT('server');
        // istemcinin sunulan sertifikayı doğrulaması (OpenSSL sırası: zincir, sonra ad). trust: lab.sim.trust (kök CA adları)
        function tlsFor(vn, sni) {
            const v = M().virtuals[vn]; const ps = v.profiles.filter(x => profType(x) === 'client-ssl');
            const pr = n => (M().cssl[n] || { ckc: [], serverName: 'none', sniDefault: 'false' });
            const nameOk = (pat, h) => pat && pat !== 'none' && (pat === h || (/^\*\./.test(pat) && h.split('.').slice(1).join('.') === pat.slice(2)));
            let pn = ps.length === 1 ? ps[0] : (sni && ps.find(x => nameOk(pr(x).serverName, sni))) || ps.find(x => pr(x).sniDefault === 'true') || ps[0];
            const p = pr(pn), e = p.ckc[0] || { cert: 'default.crt', key: 'default.key' };
            const leaf = certOf(e.cert) || certOf('default.crt');
            const chain = e.chain && e.chain !== 'none' && certOf(e.chain) ? [certOf(e.chain)] : [];
            return { prof: pn, leaf, chain, presented: [leaf].concat(chain) };
        }
        function tlsVerify(t, host) {
            const trust = SIM.trust || ['Lab Root CA'];
            if (t.leaf.expired) return { code: 10, msg: 'certificate has expired' };
            let cur = t.leaf;
            for (let i = 0; i < 6; i++) {
                if (trust.includes(cur.issuer)) break;
                if (cur.self || cur.issuer === cur.cn) return cur === t.leaf ? { code: 18, msg: 'self-signed certificate' } : { code: 19, msg: 'self-signed certificate in certificate chain' };
                const nx = t.chain.find(c => c.cn === cur.issuer && c !== cur);
                if (!nx) return { code: 20, msg: 'unable to get local issuer certificate', depth0: cur === t.leaf };
                cur = nx;
            }
            const names = (t.leaf.san || []).map(x => x.replace(/^(DNS|IP Address):/, ''));
            const hit = names.find(nm => nm === host || (/^\*\./.test(nm) && host.split('.').slice(1).join('.') === nm.slice(2)));
            if (!hit) return { code: 62, host: true, msg: 'no alternative certificate subject name matches target host name \'' + host + '\'' };
            return { ok: true, matched: hit };
        }
        // ═══ iRule ve data group ═══════════════════════════════════════════
        const ruleHttpEv = r => (r.events || []).find(e => /^HTTP_/.test(e.name));
        function ruleErr(name, c) {
            // 01070151: kural doğrulama hatası (biçim notes/f5-irule-arastirma.md)
            if (c.kind === 'pool') return E('01070151:3: Rule [/Common/' + name + '] error: Unable to find pool (' + c.pool + ') referenced at line ' + c.line + ': [' + c.text + ']');
            if (c.kind === 'dg') return E('01070151:3: Rule [/Common/' + name + '] error: Unable to find value_list (' + c.dg + ') referenced at line ' + c.line + ': [' + c.text + ']');
            const at = '/Common/' + name + ':' + (c.line || 1) + ': error: ';
            const msg = c.kind === 'proc' ? '[undefined procedure: ' + c.cmd + '][' + (c.text || c.cmd) + ']' : c.kind === 'ctx' ? '[command is not valid in current event context (' + c.event + ')][' + c.cmd + ']' : c.kind === 'event' ? '[unknown event (' + c.event + ')][when ' + c.event + ' {]' : c.kind === 'toplevel' ? '[command is not valid in the current scope][' + c.cmd + ']' : '[parse error: ' + c.err + ']';
            return E('01070151:3: Rule [/Common/' + name + '] error: ' + at + msg);
        }
        function ruleInit(name, r) {
            S.rstatic[name] = {};
            (r.events || []).filter(e => e.name === 'RULE_INIT').forEach(e => { const X = { vars: {}, statics: S.rstatic[name], act: { off: new Set() }, table: S.rtable, log: (f, m) => S.ltmlog.push(lstamp() + ' ' + lh() + ' info tmm[11925]: Rule /Common/' + name + ' <RULE_INIT>: ' + m), note: () => {}, dg: n => { const d = M().dgroups[n]; return d ? { type: d.type, records: d.records } : null; }, hasPool: n => !!M().pools[n], activeMembers: n => eligible(n).length }; IR.runEvent(X, e); });
        }
        function ruleChange(verb, rest, line) {
            const nameT = rest[0]; if (!nameT) return E('Syntax Error: ltm rule requires a name', 'incomplete');
            const name = nameT.t; const coll = M().rules;
            if (verb === 'delete') { if (!coll[name]) return NF('rule', name); const u = Object.entries(M().virtuals).find(([, v]) => (v.rules || []).includes(name)); if (u) return E('01070621:3: Rule /Common/' + name + ' is in use by virtual server /Common/' + u[0] + '.\n# [Simülatör] Önce virtual server\'dan kaldırın: modify ltm virtual ' + u[0] + ' rules delete { ' + name + ' }'); delete coll[name]; delete S.rstatic[name]; auditLog(line); return { out: '', ok: true }; }
            if (verb === 'create' && coll[name]) return EX('rule', name);
            if (verb === 'modify' && !coll[name]) return NF('rule', name);
            if (verb === 'create' && !/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(name)) return SYNx('"' + name + '" invalid name');
            let def = line.slice(nameT.o + name.length).trim();
            if (/^definition\b/.test(def)) def = def.replace(/^definition\s*/, '');
            let braceNote = '';
            if (def.startsWith('{') && def.endsWith('}')) { const inner = def.slice(1, -1).trim(); if (!inner || /^(when|priority|#)/.test(inner)) { def = inner; braceNote = '# [Simülatör] Kabul edildi; gerçek tmsh\'te dış süslü parantezli biçim hata verir. Tek satırda gövdeyi doğrudan yazın (create ltm rule ' + name + ' when HTTP_REQUEST { … }) ya da edit ltm rule ' + name + ' (vi) kullanın.'; } }
            if (verb === 'modify' && !def) return E('Syntax Error: modify requires a rule definition', 'incomplete');
            const c = IR.compile(def);
            if (c.err) return ruleErr(name, c);
            for (const r of c.refs || []) { if (r.type === 'pool' && !M().pools[r.name.replace(/^\/Common\//, '')]) return ruleErr(name, { kind: 'pool', pool: r.name, line: r.line, text: r.text }); if (r.type === 'dg' && !M().dgroups[r.name.replace(/^\/Common\//, '')]) return ruleErr(name, { kind: 'dg', dg: r.name, line: r.line, text: r.text }); }
            const prev = coll[name];
            coll[name] = { src: def, events: c.events };
            // kural bir VS'de ve HTTP olayı kullanıyorsa o VS'de HTTP profili olmalı
            const bad = Object.entries(M().virtuals).find(([, v]) => (v.rules || []).includes(name) && ruleHttpEv(coll[name]) && !v.profiles.some(x => profType(x) === 'http'));
            if (bad) { if (prev) coll[name] = prev; else delete coll[name]; return E('01070394:3: ' + ruleHttpEv(c).name + ' event in rule (/Common/' + name + ') requires an associated HTTP or FASTHTTP profile on the virtual server (/Common/' + bad[0] + ').'); }
            ruleInit(name, coll[name]); auditLog(line); log({ rule: name, verb });
            return { out: braceNote, ok: true };
        }
        T['ltm rule'] = {
            kind: 'rule', named: true, coll: () => M().rules, rawDef: true,
            list(n, o) { const L2 = o.src ? String(o.src).split('\n') : []; if (L2.length) L2[0] = '    ' + L2[0]; return ['ltm rule ' + n + ' {'].concat(L2, ['}']); },
            props: [],
        };
        T['ltm data-group internal'] = {
            kind: 'data group', named: true, coll: () => M().dgroups,
            fresh: () => ({ type: null, records: [], desc: '' }),
            set(o, P, name, isCreate) {
                for (const p of P) {
                    if (p.k === 'type') { if (!['string', 'ip', 'integer'].includes(p.v)) return SYNx('"' + p.v + '" invalid type (string | ip | integer)'); if (!isCreate && o.type && p.v !== o.type) return E('# [Simülatör] Data group tipi sonradan değiştirilemez.'); o.type = p.v; }
                    else if (p.k === 'description') o.desc = p.v;
                    else if (p.k === 'records') {
                        if (p.v === 'none') { o.records = []; continue; }
                        const ents = (p.items || []).map(it => { const b = it.b || []; let data = ''; for (let i = 0; i < b.length; i += 2) { if (b[i].k === 'data') data = b[i + 1] ? b[i + 1].k : ''; else return { bad: b[i].k }; } return { key: it.k, data }; });
                        const bad = ents.find(e => e.bad); if (bad) return SYN(bad.bad);
                        if (p.op === 'replace-all-with') o.records = [];
                        if (p.op === 'delete') { for (const e of ents) { const k = o.records.findIndex(r => r[0] === e.key); if (k < 0) return E('# [Simülatör] ' + e.key + ' kaydı yok.'); o.records.splice(k, 1); } continue; }
                        for (const e of ents) { const k = o.records.findIndex(r => r[0] === e.key); if (k >= 0) { if (p.op === 'add') return E('# [Simülatör] ' + e.key + ' kaydı zaten var.'); o.records[k] = [e.key, e.data]; } else o.records.push([e.key, e.data]); }
                    }
                    else return SYN(p.k);
                }
                if (!o.type) return E('# [Simülatör] Data group için type gerekli (string | ip | integer).', 'incomplete');
                for (const r of o.records) {
                    if (o.type === 'ip') { const c2 = cidr(r[0]) || (isIp(r[0]) ? { ip: r[0], len: 32 } : null); if (!c2) return SYNx('"' + r[0] + '" invalid IP address or network'); if (!r[0].includes('/')) r[0] = r[0] + '/32'; }
                    if (o.type === 'integer' && !/^-?\d+$/.test(r[0])) return SYNx('"' + r[0] + '" invalid integer');
                }
                return null;
            },
            del(name) { const u = Object.entries(M().rules).find(([, r]) => new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(r.src)); if (u) return E('# [Simülatör] Data group /Common/' + u[0] + ' kuralında kullanılıyor olabilir; önce kuralı düzenleyin.'); return null; },
            list(n, o) { const L = ['ltm data-group internal ' + n + ' {']; if (o.desc) L.push('    description "' + o.desc + '"'); if (o.records.length) { L.push('    records {'); o.records.forEach(r => { L.push('        ' + (/\s/.test(r[0]) ? '"' + r[0] + '"' : r[0]) + ' {'); if (r[1] !== '') L.push('            data ' + (/\s/.test(r[1]) ? '"' + r[1] + '"' : r[1])); L.push('        }'); }); L.push('    }'); } L.push('    type ' + o.type, '}'); return L; },
            props: ['type', 'records', 'description'],
        };
        function showRule(a) {
            const names = a[0] ? [a[0]] : Object.keys(M().rules); if (a[0] && !M().rules[a[0]]) return NF('rule', a[0]);
            const L = [];
            names.forEach(n => (M().rules[n].events || []).forEach(e => { const st = S.rstat[n + '|' + e.name] || { exec: 0, fail: 0, abort: 0 }; L.push('-'.repeat(60), 'Ltm::Rule Event: ' + n + ':' + e.name, '-'.repeat(60), 'Priority' + String(e.priority).padStart(28), 'Executions', '  Total' + String(st.exec).padStart(29), '  Failures' + String(st.fail).padStart(26), '  Aborts' + String(st.abort).padStart(28), 'CPU Cycles on Executing', '  Average' + '0'.padStart(27), '  Maximum' + '0'.padStart(27), '  Minimum' + '0'.padStart(27), ''); }));
            log({ show: 'ltm rule', name: a[0] || null });
            return { out: L.join('\n') + (L.length ? '# [Simülatör] CPU sayaçları gösterilmez.' : ''), ok: true };
        }
        // sys db (BigDB değişkenleri; yalnız modify/list). RST nedeni: tm.rstcause.log → /var/log/ltm, tm.rstcause.pkt → RST paketinin yükü
        T['sys db'] = {
            kind: 'BigDB variable', named: true, fixed: true, coll: () => M().db || (M().db = base().db),
            set(o, P) { for (const p of P) { if (p.k !== 'value') return SYN(p.k); if (!['enable', 'disable'].includes(String(p.v).toLowerCase())) return SYNx('"' + p.v + '" invalid value (enable | disable)'); o.value = String(p.v).toLowerCase(); } return null; },
            list(n, o) { return ['sys db ' + n + ' {', '    value "' + o.value + '"', '}']; },
            props: ['value'],
        };
        const TYPES = Object.keys(T);
        const MODULES = ['net', 'sys', 'auth', 'ltm', 'cm', 'util', 'gtm', 'security', 'apm', 'asm'];
        function resolveType(toks) {
            // tüm türler iki sözcük: "net vlan", "/net vlan", "/net/vlan"
            const a = toks[0].t.replace(/^\//, '');
            if (a.includes('/')) { const [m, c] = a.split('/'); return T[m + ' ' + c] ? { type: m + ' ' + c, rest: toks.slice(1) } : { mod: m, comp: c }; }
            const b = toks[1] && toks[1].t, c = toks[2] && toks[2].t;
            if (c && T[a + ' ' + b + ' ' + c]) return { type: a + ' ' + b + ' ' + c, rest: toks.slice(3) };
            return T[a + ' ' + b] ? { type: a + ' ' + b, rest: toks.slice(2) } : { mod: a, comp: b, sub: c };
        }
        const stamp = k => { const t = 10 * 3600 + 21 * 60 + k; return 'Sep 24 ' + [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(x => String(x).padStart(2, '0')).join(':'); };
        function auditLog(line) { S.audit.push(stamp(S.audit.length) + ' ' + short() + ' notice tmsh[' + (7310 + S.audit.length) + ']: 01420002:5: AUDIT - pid=' + (7310 + S.audit.length) + ' user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=' + line); }
        function run(line, viaBash) {
            // iRule tanımı serbest Tcl metnidir: tmsh sözcük ayırıcısına girmeden işlenir
            const rm = line.match(/^\s*(create|modify|delete|edit)\s+\/?ltm\s+rule\s+(\S+)/);
            if (rm) { if (rm[1] === 'edit') return E('# [Simülatör] "edit ltm rule" gerçekte vi editörünü açar. Bu lab\'da kuralı tek satırda ya da çok satırlı yazın: create ltm rule ' + rm[2] + ' { when HTTP_REQUEST { … } }', 'unsupported'); if (S.inop) return E('The configuration has not yet loaded.', 'value'); return ruleChange(rm[1], [{ t: rm[2], o: line.indexOf(rm[2], line.indexOf('rule') + 4) }], line); }
            const TK = tok(line);
            if (TK.err) return E('Syntax Error: missing closing quote', 'invalid');
            if (!TK.length) return '';
            const verb = TK[0].t;
            const V = ['list', 'show', 'create', 'modify', 'delete', 'save', 'load', 'run', 'install', 'reboot', 'quit', 'q', 'exit', 'help', 'cd', 'bash'];
            if (!V.includes(verb)) {
                if (['net', 'sys', 'ltm', 'auth', 'cm'].includes(verb.replace(/^\//, ''))) return E('Syntax Error: "' + verb + '" unexpected argument\n# [Simülatör] tmsh komutu fiille başlar: list | show | create | modify | delete, ör. "list net vlan".', 'invalid');
                if (['ifconfig', 'ping', 'cat', 'tail', 'ls', 'grep', 'qkview', 'tcpdump', 'df', 'bigstart', 'reboot', 'curl'].includes(verb)) return E('Syntax Error: "' + verb + '" unexpected argument\n# [Simülatör] "' + verb + '" bir bash komutudur. tmsh\'ten çıkmak için "quit", tek komut için "run util bash -c \'' + line + '\'".', 'wrongmode');
                return E('Syntax Error: "' + verb + '" unexpected argument', 'invalid');
            }
            if (verb === 'quit' || verb === 'q' || verb === 'exit') { if (viaBash) return E('# [Simülatör] Bu komut tek seferlik tmsh çağrısında anlamsız.', 'invalid'); S.mode = 'bash'; return ''; }
            if (verb === 'bash') return E('Syntax Error: "bash" unexpected argument\n# [Simülatör] tmsh içinden bash: "run util bash"', 'invalid');
            if (verb === 'cd') { const d = TK[1] && TK[1].t; if (!d || d === '/Common' || d === '/') return ''; return E('Syntax Error: "' + d + '" folder not found\n# [Simülatör] Bu lab\'da yalnız /Common klasörü var.', 'value'); }
            if (verb === 'help') return helpText('');
            if (verb === 'save' || verb === 'load') return saveLoad(verb, TK.slice(1));
            if (verb === 'run') return runCmd(TK.slice(1), line, viaBash);
            if (verb === 'install') return installCmd(TK.slice(1));
            if (verb === 'reboot') { if (TK[1] && TK[1].t === 'volume') { const v = TK[2] && TK[2].t; if (!v || !S.vols[v]) return E('Syntax Error: "' + (v || '') + '" volume not found\n# [Simülatör] Hacimler: ' + Object.keys(S.vols).join(', '), 'value'); if (!/complete/.test(S.vols[v].status)) return E('# [Simülatör] ' + v + ' kurulumu tamamlanmamış (' + S.vols[v].status + '); bu hacimden açılamaz.', 'value'); return doReboot(v); } if (TK.length > 1) return SYN(TK[1].t); return doReboot(); }
            const sysInfo = TK[1] && /^\/?sys$/.test(TK[1].t) && TK[2] && ['version', 'software', 'license', 'ucs', 'provision'].includes(TK[2].t);
            if (S.inop && !sysInfo && !(verb === 'load' && TK[2] && TK[2].t === 'ucs')) return E('The configuration has not yet loaded. If this message persists, it may indicate a configuration problem.\n# [Simülatör] Yapılandırma yüklenemedi; ayrıntı /var/log/ltm\'de.', 'value');
            if (TK.length < 2) return E('Syntax Error: "' + verb + '" requires a component', 'incomplete');
            if (TK[1] && /^\/?sys$/.test(TK[1].t) && TK[2] && TK[2].t === 'db' && TK[3]) TK[3].t = TK[3].t.toLowerCase();
            const r = resolveType(TK.slice(1));
            if (!r.type) {
                const md = (r.mod || '').replace(/^\//, '');
                if (!MODULES.includes(md)) return E('Syntax Error: "' + (TK[1].t) + '" unknown property', 'invalid');
                if (verb === 'show') { const o = showCmd(md, r.comp, TK.slice(3)); if (o !== null) return o; }
                if (verb === 'delete' && md === 'sys' && r.comp === 'connection') { const o = deleteConn(TK.slice(3).map(x => x.t)); if (!o.err) auditLog(line); return o; }
                if (verb === 'delete' && md === 'ltm' && r.comp === 'persistence' && TK[3] && TK[3].t === 'persist-records') { const o = persistRecs(TK.slice(4).map(x => x.t), true); if (!o.err) auditLog(line); return o; }
                if ((verb === 'list' || verb === 'show') && md === 'sys' && r.comp === 'ucs') { log({ listUcs: true }); return { out: S.ucs.map(u => 'sys ucs /var/local/ucs/' + u.name + ' {\n    base-build 0.0.5\n    base-version ' + (u.ver || curVer()) + '\n    file-created-date 2026-09-24T10:2' + (S.ucs.indexOf(u) % 10) + ':07Z\n    hostname ' + M().hostname + '\n}').join('\n') + (S.ucs.length ? '\n# [Simülatör] Alanlar kısaltıldı.' : '# [Simülatör] /var/local/ucs altında UCS yok.'), ok: true }; }
                if (!r.comp) return E('Syntax Error: "' + md + '" requires a component', 'incomplete');
                if (['ltm', 'cm', 'gtm', 'security', 'apm', 'asm', 'util'].includes(md) || ['software', 'ucs', 'license', 'log', 'syslog', 'snmp', 'db', 'failover', 'service'].includes(r.comp)) return E('# [Simülatör] "' + md + ' ' + r.comp + '" bu lab sürümünde henüz desteklenmiyor.', 'unsupported');
                return E('Syntax Error: "' + r.comp + '" unknown property', 'invalid');
            }
            const t = T[r.type];
            if (verb === 'show') { const tw = r.type.split(' '); const o = showCmd(tw[0], tw[1], tw.length > 2 ? [{ t: tw[2] }].concat(r.rest) : r.rest); if (o !== null) return o; return E('# [Simülatör] "show ' + r.type + '" bu lab sürümünde yok; yapılandırma için "list ' + r.type + '".', 'unsupported'); }
            if (verb === 'list') return listCmd(r.type, r.rest);
            return change(verb, r.type, t, r.rest, line);
        }
        function change(verb, key, t, rest, line) {
            if (t.rawDef) return ruleChange(verb, rest, line);
            if (t.special === 'mgmtip') {
                const a = rest[0] && rest[0].t;
                if (verb === 'modify') return E('# [Simülatör] Yönetim IP\'si modify ile değiştirilmez: eskisini delete, yenisini create edin (K15040).', 'value');
                if (!a) return E('Syntax Error: management-ip requires an address', 'incomplete');
                const c = cidr(a); if (!c) return SYNx('"' + a + '" invalid IP address (A.B.C.D/len)');
                if (verb === 'create') { if (M().mgmtIp) return E('Only one management IP address is allowed; delete ' + M().mgmtIp + ' first.\n# [Simülatör] Hata metni temsilidir.'); M().mgmtIp = c.ip + '/' + c.len; }
                else { if (M().mgmtIp !== c.ip + '/' + c.len) return NF('management IP', a); M().mgmtIp = null; }
                auditLog(line); return { out: '', ok: true };
            }
            if (t.single) {
                if (verb !== 'modify') return E('Syntax Error: "' + verb + '" is not supported for ' + key, 'invalid');
                const pr = props(rest, 0, t.flags); if (pr.err) return perr(pr, rest);
                const snap = clone(M()); const e = t.set(null, pr.P); if (e) { S.m = snap; return e; }
                auditLog(line); const nt = S.allowNote || ''; S.allowNote = null; return { out: nt, ok: true, touched: key };
            }
            const nameT = rest[0]; if (!nameT) return E('Syntax Error: ' + key + ' requires a name', 'incomplete');
            const name = nameT.t, coll = t.coll();
            if (t.fixed && !(name in coll)) return NF(t.kind, name);
            if (verb === 'create') {
                if (t.fixed) return E('Syntax Error: "create" is not supported for ' + key, 'invalid');
                if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(name)) return SYNx('"' + name + '" invalid name');
                if (coll[name]) return EX(t.kind, name);
                if (t.kind === 'monitor' && (M().monitors[name] || BUILTIN_MON[name])) return EX('monitor', name);
                if (t.kind === 'persistence profile' && (M().persists[name] || BUILTIN_PERSIST[name])) return EX('persistence profile', name);
                if (t.kind === 'profile' && BUILTIN_PROF[name]) return EX('profile', name);
                const pr = props(rest, 1, t.flags); if (pr.err) return perr(pr, rest);
                const o = t.fresh(); const snap = clone(M()); coll[name] = o;
                const e = t.set(o, pr.P, name, true); if (e) { S.m = snap; return e; }
                auditLog(line); return { out: '', ok: true };
            }
            if (!(name in coll)) return NF(t.kind, name);
            if (verb === 'delete') { if (t.fixed) return E('Syntax Error: "delete" is not supported for ' + key, 'invalid'); if (t.del) { const e = t.del(name); if (e) return e; } delete coll[name]; auditLog(line); return { out: '', ok: true }; }
            const pr = props(rest, 1, t.flags); if (pr.err) return perr(pr, rest);
            if (!pr.P.length) return E('Syntax Error: modify requires at least one property', 'incomplete');
            const snap = clone(M()); const e = t.set(t.byVal ? null : coll[name], pr.P, name, false); if (e) { S.m = snap; return e; }
            auditLog(line); return { out: '', ok: true };
        }
        function perr(pr, rest) {
            if (pr.err === 'novalue') return E('Syntax Error: "' + pr.key + '" requires a value', 'incomplete');
            if (pr.err === 'unclosed') return E('Syntax Error: missing "}"', 'incomplete');
            return E('Syntax Error: "' + ((rest[pr.at] || {}).t || '') + '" unexpected argument', 'invalid');
        }
        function listCmd(key, rest) {
            const t = T[key]; let opts = rest.map(x => x.t);
            if (key === 'sys crypto cert' && opts[0] && !t.props.includes(opts[0]) && !['one-line', 'all-properties'].includes(opts[0]) && !M().certs[opts[0]]) { log({ list: key }); return { out: '', ok: true }; }
            const oneLine = opts.includes('one-line'); opts = opts.filter(x => x !== 'one-line' && x !== 'all-properties');
            const fmt = L => (oneLine ? L.map(l => l.trim()).join(' ').replace(/\{ \}/g, '{ }') : L.join('\n'));
            let blocks = [];
            if (t.special === 'mgmtip') blocks = [t.list()];
            else if (t.single) blocks = [t.list()];
            else {
                const coll = t.coll(), names = opts.length && !t.props.includes(opts[0]) ? [opts[0]] : Object.keys(coll);
                if (opts.length && !t.props.includes(opts[0]) && !(opts[0] in coll)) return NF(t.kind, opts[0]);
                blocks = names.map(n => t.list(n, coll[n]));
                const propF = opts.slice(names.length === 1 && opts[0] === names[0] ? 1 : 0).filter(x => t.props.includes(x));
                if (propF.length) blocks = blocks.map(L => [L[0]].concat(L.slice(1, -1).filter(l => propF.some(p => l.trim().startsWith(p + ' ') || l.trim() === p)), [L[L.length - 1]]));
            }
            if (t.single && opts.length) { const pf = opts.filter(x => t.props.includes(x)); if (opts.some(x => !t.props.includes(x))) return SYN(opts.find(x => !t.props.includes(x))); blocks = blocks.map(L => [L[0]].concat(L.slice(1, -1).filter(l => pf.some(p => l.trim().startsWith(p + ' '))), [L[L.length - 1]])); }
            log({ list: key });
            return { out: blocks.filter(b => b.length).map(fmt).join('\n'), ok: true };
        }
        // ── show çıktıları
        function showCmd(mod, comp, rest) {
            const a = (rest || []).map(x => x.t);
            if (mod === 'ltm') {
                // Biçimler gerçek v16 çıktılarından (notes/f5-tmsh-cikti-ornekleri.md §1-3, §6); sayaçlar temsilî
                const bar = '-'.repeat(66), kb = n => (n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n));
                const col = (label, w, vals) => '  ' + pad(label, w) + vals.map(v => String(v).padStart(11)).join('');
                if (comp === 'virtual') {
                    const names = a[0] ? [a[0]] : Object.keys(M().virtuals); if (a[0] && !M().virtuals[a[0]]) return NF('virtual server', a[0]);
                    const L = [];
                    names.forEach(n => { const v = M().virtuals[n], st = vsStatus(n), d = v.dest.split(':'), hits = Object.entries(S.rt.hits || {}).filter(([k]) => v.pool && k.startsWith(v.pool + '|')).reduce((x, [, c]) => x + c, 0), cur = vsConn(n);
                        L.push(bar, 'Ltm::Virtual Server: ' + n, bar, 'Status', '  Availability     : ' + st.avail, '  State            : ' + st.state, '  Reason           : ' + st.reason, '  CMP              : enabled', '  CMP Mode         : all-cpus', '  Destination      : ' + d[0] + ':' + d[1], '',
                            'Traffic                             ClientSide  Ephemeral  General', col('Bits In', 34, [kb(hits * 4096), 0, '-']), col('Bits Out', 34, [kb(hits * 81920), 0, '-']), col('Packets In', 34, [kb(hits * 6), 0, '-']), col('Packets Out', 34, [kb(hits * 9), 0, '-']),
                            col('Current Connections', 34, [cur, 0, '-']), col('Maximum Connections', 34, [Math.max(cur, hits ? 1 : 0), 0, '-']), col('Total Connections', 34, [kb(hits + cur), 0, '-']), col('Total Requests', 34, ['-', '-', kb(hits)]), ''); });
                    log({ show: 'ltm virtual', name: a[0] || null }); return { out: L.join('\n'), ok: true };
                }
                if (comp === 'pool') {
                    const names = a[0] && a[0] !== 'members' ? [a[0]] : Object.keys(M().pools); if (a[0] && a[0] !== 'members' && !M().pools[a[0]]) return NF('pool', a[0]);
                    const withM = a.includes('members') || a.includes('detail'); const L = [];
                    names.forEach(pn => { const pl = M().pools[pn], ps = poolStatus(pn), pgs = [...new Set(pl.order.map(k => pl.members[k].pg))].sort((x, y) => y - x);
                        L.push(bar, 'Ltm::Pool: ' + pn, bar, 'Status', '  Availability           : ' + ps.avail, '  State                  : ' + ps.state, '  Reason                 : ' + ps.reason, '  Monitor                : ' + (pl.monitor ? pl.monitor.join(' and ') : 'none'), '  Minimum Active Members : ' + pl.minActive,
                            '  Priority Groups        : ' + (pgs.length ? pgs[0] + '/' + (eligible(pn).length ? pl.members[eligible(pn)[0]].pg : 0) + '/' + pgs[pgs.length - 1] : '0/0/0') + ' (highest/current/lowest)', '  Current Active Members : ' + pl.order.filter(k => memberStatus(pn, k).avail === 'available').length, '  Available Members      : ' + eligible(pn).length, '  Total Members          : ' + pl.order.length, '');
                        if (withM) pl.order.forEach(k => { const m = pl.members[k], st = memberStatus(pn, k), h = (S.rt.hits || {})[pn + '|' + k] || 0, c = connOf(pn, k);
                            L.push('  ' + '-'.repeat(62), '  | Ltm::Pool Member: ' + m.ip + ':' + m.port, '  ' + '-'.repeat(62), '  | Status', '  |   Availability   : ' + st.avail, '  |   State          : ' + st.state, '  |   Reason         : ' + st.reason, '  |   Monitor        : ' + (st.mon || 'none'), '  |   Monitor Status : ' + st.monStatus, '  |   Session Status : ' + st.session, '  |   Pool Name      : ' + pn, '  |   IP Address     : ' + m.ip, '  |   Priority Group : ' + m.pg + (m.limit ? '    Connection Limit : ' + m.limit : ''), '  |',
                                '  | Traffic                                  ServerSide  General', '  |   Current Connections  ' + String(c).padStart(20) + '        -', '  |   Maximum Connections  ' + String(Math.max(c, h ? 1 : 0)).padStart(20) + '        -', '  |   Total Connections    ' + String(kb(h + c * 7)).padStart(20) + '        -', '  |   Total Requests       ' + '-'.padStart(20) + String(kb(h)).padStart(9), ''); }); });
                    log({ show: 'ltm pool', name: names.length === 1 ? names[0] : null, members: withM }); return { out: L.join('\n'), ok: true };
                }
                if (comp === 'node') {
                    const names = a[0] ? [a[0]] : Object.keys(M().nodes); if (a[0] && !M().nodes[a[0]]) return NF('Node', a[0]);
                    const L = [];
                    names.forEach(n => { const o = M().nodes[n], st = nodeStatus(n), c = Object.entries(M().pools).reduce((x, [pn, pl]) => x + pl.order.filter(k => pl.members[k].ip === o.address).reduce((y, k) => y + connOf(pn, k), 0), 0);
                        L.push('------------------------------------------', 'Ltm::Node: ' + n + ' (' + o.address + ')', '------------------------------------------', 'Status', '  Availability   : ' + st.avail, '  State          : ' + st.state, '  Reason         : ' + st.reason, '  Monitor        : ' + st.mon, '  Monitor Status : ' + st.monStatus, '  Session Status : ' + st.session, '',
                            'Traffic                ServerSide  General', '  Current Connections ' + String(c).padStart(13) + '        -', ''); });
                    log({ show: 'ltm node' }); return { out: L.join('\n'), ok: true };
                }
                if (comp === 'persistence' && a[0] === 'persist-records') return persistRecs(a.slice(1), false);
                if (comp === 'rule') return showRule(a);
                if (comp === 'persistence-old' && a[0] === 'persist-records') {
                    const L = ['Sys::Persistent Connections'];
                    Object.entries(S.rt.persist || {}).forEach(([k, mk]) => { const [pn, src] = k.split('|'); const vn = (Object.entries(M().virtuals).find(([, v]) => v.pool === pn) || ['?'])[0], vd = vn !== '?' ? M().virtuals[vn].dest : '?'; L.push('source-address  ' + src + '  ' + vd + '  ' + mk + '  (tmm: 1)'); });
                    L.push('Total records returned: ' + (L.length - 1));
                    log({ show: 'ltm persistence' }); return { out: L.join('\n'), ok: true };
                }
            }
            if (mod === 'net' && comp === 'rst-cause') { if (a.length) return SYN(a[0]); return showRstCause(); }
            if (mod === 'net' && comp === 'interface') {
                const L = ['', '-------------------------------------------------------------------------', 'Net::Interface', 'Name  Status    Bits    Bits    Pkts    Pkts  Drops  Errs      Media', '                    In     Out      In     Out', '-------------------------------------------------------------------------'];
                const list = a[0] ? [a[0]] : IFS.concat(['mgmt']);
                if (a[0] && !M().ifs[a[0]] && a[0] !== 'mgmt') return NF('interface', a[0]);
                list.forEach((n, k) => { const up = n === 'mgmt' ? true : linkUp(n), st = n === 'mgmt' ? 'up' : !M().ifs[n].enabled ? 'DS' : up ? 'up' : 'down'; L.push(pad(n, 6) + pad(st, 8) + pad(up ? (12 + k) + '.4M' : '0', 8) + pad(up ? (8 + k) + '.1M' : '0', 8) + pad(up ? (18 + k) + '.2K' : '0', 8) + pad(up ? (11 + k) + '.3K' : '0', 7) + pad('0', 7) + pad('0', 6) + (up ? (n === 'mgmt' ? '1000T-FD' : '10000T-FD') : 'none')); });
                L.push('# [Simülatör] Sayaçlar temsilidir. Status: up, down (bağlantı yok), DS (yönetimsel kapalı).');
                log({ show: 'net interface' });
                return { out: L.join('\n'), ok: true };
            }
            if (mod === 'net' && comp === 'vlan') {
                const names = a[0] ? [a[0]] : Object.keys(M().vlans); if (a[0] && !M().vlans[a[0]]) return NF('VLAN', a[0]);
                const L = ['', '---------------------------------------------------------', 'Net::Vlan'];
                names.forEach(n => { const v = M().vlans[n]; L.push('Name                      ' + n, 'Interface Name            ' + (Object.keys(v.ifs).join(', ') || '(none)'), 'Mac Address (True)        00:50:56:8a:10:0e', 'MTU                       ' + v.mtu, 'Tag                       ' + v.tag, 'Customer-Tag              ', ''); Object.entries(v.ifs).forEach(([i, md]) => L.push('  ' + pad(i, 8) + pad(md, 10) + 'Status: ' + (linkUp(i) ? 'up' : 'down'))); L.push(''); });
                L.push('# [Simülatör] Çıktı sadeleştirildi.');
                log({ show: 'net vlan' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'net' && comp === 'route') {
                const L = ['', '--------------------------------------------------------------------', 'Net::Routes', 'Name                     Destination         Type       NextHop            Origin', '--------------------------------------------------------------------'];
                ribRows().forEach(r => L.push(pad(r.name, 25) + pad(r.dst, 20) + pad(r.type, 11) + pad(r.nh, 19) + r.origin));
                log({ show: 'net route' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'net' && comp === 'arp') {
                const L = ['', '------------------------------------------------------------------------------', 'Net::Arp', 'Name          Address       HWaddress          Vlan              Expire-in-sec  Status', '------------------------------------------------------------------------------'];
                Object.entries(S.rt.arp).forEach(([ip, v]) => L.push(pad(ip, 14) + pad(ip, 14) + pad(v.ok ? v.mac : 'incomplete', 19) + pad('/Common/' + v.vlan, 18) + pad(v.ok ? '297' : '0', 15) + (v.ok ? 'resolved' : 'unknown')));
                if (!Object.keys(S.rt.arp).length) L.push('# [Simülatör] ARP tablosu boş: henüz bu ağlardaki bir adrese trafik gönderilmedi (ping ile deneyin).');
                log({ show: 'net arp' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'sys' && comp === 'software' && a[0] === 'status') {
                const L = ['', '-----------------------------------------------------------------', 'Sys::Software Status', 'Volume  Product   Version   Build  Active  Status', '-----------------------------------------------------------------'];
                Object.keys(S.vols).sort().forEach(n => { const v = S.vols[n]; L.push(pad(n, 8) + pad('BIG-IP', 10) + pad(v.version, 10) + pad(v.build, 7) + pad(n === S.boot ? 'yes' : 'no', 8) + v.status); if (/^installing/.test(v.status)) { v.tick = (v.tick || 0) + 1; if (v.tick >= 2) v.status = 'complete'; else v.status = 'installing 78.000 pct'; } });
                L.push('# [Simülatör] Kurulum ilerlemesi hızlandırıldı; gerçekte dakikalar sürer.');
                log({ show: 'sys software status' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'sys' && comp === 'version') {
                log({ show: 'sys version' });
                return { out: ['', 'Sys::Version', 'Main Package', '  Product     ' + VER.product, '  Version     ' + curVer(), '  Build       ' + VER.build, '  Edition     ' + VER.edition, '  Date        ' + VER.date, ''].join('\n'), ok: true };
            }
            if (mod === 'sys' && comp === 'connection') return showConn(a);
            if (mod === 'sys' && comp === 'log' && a[0] === 'ltm') {
                // show sys log ltm [lines N]: "ltm MM-DD HH:MM:SS <seviye> <host> <süreç>: <mesaj>" (mesaj kodu gösterilmez)
                const li = a.indexOf('lines'); const n = li >= 0 ? +(a[li + 1] || 10) : 0;
                if (a.slice(1).some((x, k) => !(x === 'lines' || (a[k] === 'lines' && /^\d+$/.test(x))))) return E('# [Simülatör] Bu lab\'da "show sys log ltm [lines N]" desteklenir.', 'unsupported');
                const conv = l => { const m = l.match(/^(\w{3})\s+(\d+) (\S+) (\S+) (\w+) (\S+) (?:[0-9a-f]{8}:\d: )?(.*)$/); if (!m) return l; const mon = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }[m[1]] || '09'; return 'ltm ' + mon + '-' + String(m[2]).padStart(2, '0') + ' ' + m[3] + ' ' + m[5] + ' ' + m[4] + ' ' + m[6] + ' ' + m[7]; };
                const L = S.ltmlog.map(conv); log({ show: 'sys log ltm' });
                return { out: (n ? L.slice(-n) : L).join('\n') || '# [Simülatör] Log boş.', ok: true };
            }
            if (mod === 'sys' && comp === 'license') { log({ show: 'sys license' }); return { out: licenseText(a.includes('detail')), ok: true }; }
            if (mod === 'sys' && comp === 'provision') {
                const L = ['', 'Sys::Provision', 'Module    Level      CPU (%)  Memory (MB)', '------------------------------------------'];
                PROV.filter(p => M().prov[p] !== 'none').forEach(p => L.push(pad(p, 10) + pad(M().prov[p], 11) + pad(p === 'ltm' ? '38' : '12', 9) + (p === 'ltm' ? '2412' : '1810')));
                L.push('# [Simülatör] Sütunlar sadeleştirildi; yalnız provision edilmiş modüller.');
                log({ show: 'sys provision' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'cm' && comp === 'sync-status') { const st = syncStatus(); log({ show: 'cm sync-status', status: st.status }); return { out: ['', '-'.repeat(68), 'CM::Sync Status', '-'.repeat(68), 'Color    ' + st.color, 'Status   ' + st.status, 'Mode     ' + (st.status === 'Standalone' ? 'standalone' : 'high-availability'), 'Summary  ' + st.summary].concat(st.details.map((d, k) => (k ? '         ' : 'Details  ') + d)).join('\n'), ok: true }; }
            if (mod === 'cm' && comp === 'failover-status') { const up = HA.st === 'active'; log({ show: 'cm failover-status' }); return { out: ['', '-'.repeat(40), 'CM::Failover Status', '-'.repeat(40), 'Color    ' + (up ? 'green' : 'gray'), 'Status   ' + HA.st.toUpperCase().replace('OFFLINE', 'FORCED OFFLINE'), 'Summary  ' + (up ? '1/1 active' : '0/1 active'), '# [Simülatör] Çıktı biçimi yaklaşıktır.'].join('\n'), ok: true }; }
            if (mod === 'sys' && comp === 'failover') { log({ show: 'sys failover' }); return { out: 'Failover ' + (HA.st === 'offline' ? 'forced offline' : HA.st) + ' for 0d 00:' + (HA.st === 'active' ? '12' : '01') + ':37', ok: true }; }
            if (mod === 'sys' && comp === 'management-ip') return null;
            return null;
        }
        function licenseText(detail) {
            const L = ['', 'Sys::License', 'Licensed Version    17.1.1', 'Registration key    AAAAA-BBBBB-CCCCC-DDDDD-EEEEEEE', 'Licensed On         2024/01/15', 'Service Check Date  ' + (SIM.serviceCheck || '2026/08/20'), 'Platform ID         Z100', 'Appliance SN        f5-sim-0001', '', 'Active Modules', '  LTM, VE-1G (ABCDEFG-HIJKLMN)'];
            if (detail) L.push('    Local Traffic Manager, VE', '    Rate Shaping', '    Anti-Virus Checks', '    Base Endpoint Security Checks');
            L.push('# [Simülatör] Kayıt anahtarı ve seri numarası temsilidir.');
            return L.join('\n');
        }
        function ribRows() {
            const R = [];
            Object.entries(M().selfs).forEach(([, s]) => { if (!s.address) return; const c = cidr(s.address), dst = n2ip(netOf(c.ip, c.len)) + '/' + c.len; if (vlanUp(s.vlan) && !R.some(r => r.dst === dst)) R.push({ name: dst, dst, type: 'interface', nh: s.vlan, origin: 'connected' }); });
            Object.entries(M().routes).forEach(([n, r]) => { const ok = Object.values(M().selfs).some(s => s.address && vlanUp(s.vlan) && inNet(r.gw, s.address)); R.push({ name: n, dst: r.network === 'default' ? '0.0.0.0/0' : r.network, type: 'gw', nh: r.gw, origin: ok ? 'static' : 'static (unreachable)' }); });
            return R;
        }
        // ═══ LTM simülasyonu: sunucular, monitörler, durum, trafik ═══════════
        // lab.sim.servers: [{ ip, name, gw, ports: { 80: { paths: { '/': 200, '/health': 200, '/old': { code: 301, loc: '/new' } }, body }, 8080: … } }]
        const srvOf = ip => (SIM.servers || []).find(x => x.ip === ip) || null;
        const REASON = { 200: 'OK', 201: 'Created', 202: 'Accepted', 204: 'No Content', 206: 'Partial Content', 301: 'Moved Permanently', 302: 'Found', 303: 'See Other', 304: 'Not Modified', 307: 'Temporary Redirect', 308: 'Permanent Redirect', 400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found', 405: 'Method Not Allowed', 406: 'Not Acceptable', 408: 'Request Timeout', 409: 'Conflict', 410: 'Gone', 411: 'Length Required', 413: 'Payload Too Large', 414: 'URI Too Long', 415: 'Unsupported Media Type', 422: 'Unprocessable Entity', 429: 'Too Many Requests', 451: 'Unavailable For Legal Reasons', 500: 'Internal Server Error', 501: 'Not Implemented', 502: 'Bad Gateway', 503: 'Service Unavailable', 504: 'Gateway Timeout' };
        // sunucunun bir isteğe yanıtı (yol + metot)
        function serverResp(srv, port, path, method, hdrs) {
            const P = srv.ports && srv.ports[port]; if (!P) return null;
            path = String(path || '/').split('?')[0];
            // /headers: sunucu aldığı istek başlıklarını gövdede geri yazar (iRule ile eklenen başlıkları görmek için)
            if (path === '/headers' && P.echo !== false) return { code: 200, headers: ['Content-Type: text/plain'], body: (hdrs || [['Host', srv.ip]]).map(h => h[0] + ': ' + h[1]).join('\n') };
            const allow = P.methods || ['GET', 'HEAD', 'POST'];
            if (method === 'OPTIONS') return { code: 200, headers: ['Allow: ' + allow.concat(['OPTIONS']).join(', ')], body: '' };
            if (!allow.includes(method)) return { code: method === 'TRACE' ? 405 : 501, headers: [], body: '' };
            const ent = P.paths ? (P.paths[path] !== undefined ? P.paths[path] : (P.paths['*'] !== undefined ? P.paths['*'] : 404)) : 200;
            const e = typeof ent === 'number' ? { code: ent } : ent;
            const H = []; if (e.loc) H.push('Location: ' + e.loc);
            const body = e.body !== undefined ? e.body : (e.code === 200 ? (P.body || srv.name || srv.ip) + ' OK' : e.code + ' ' + (REASON[e.code] || ''));
            return { code: e.code, headers: H, body: method === 'HEAD' ? '' : body };
        }
        // monitör sonucu: { up, err, disabled }
        function monCheck(mname, ip, port) {
            const mo = monOf(mname); if (!mo) return { up: false, err: 'monitor yok' };
            const r = reach(ip);
            const t = mo.type;
            if (t === 'icmp' || t === 'gateway-icmp') return r.ok ? { up: true } : { up: false, err: 'No successful responses received before deadline.' };
            const dport = mo.dest && mo.dest !== '*:*' ? portOf(mo.dest.split(':')[1]) || port : port;
            const srv = srvOf(ip);
            if (!r.ok || !srv) return { up: false, err: 'Unable to connect; No successful responses received before deadline.' };
            if (!srv.ports || !srv.ports[dport]) return { up: false, err: 'Unable to connect; Connection refused.' };
            if (t === 'tcp_half_open' || (t === 'tcp' && !mo.recv)) return { up: true };
            if (t === 'https' && !srv.ports[dport].tls) return { up: false, err: 'SSL handshake failed.' };
            const m = String(mo.send || '').match(/^([A-Z]+)\s+(\S+)/); const method = m ? m[1] : 'GET', path = m ? m[2] : '/';
            const resp = serverResp(srv, dport, path, method);
            if (!resp) return { up: false, err: 'Unable to connect.' };
            const raw = 'HTTP/1.1 ' + resp.code + ' ' + (REASON[resp.code] || '') + '\r\n' + resp.headers.join('\r\n') + '\r\n\r\n' + resp.body;
            if (mo.recvDisable && raw.includes(mo.recvDisable)) return { up: true, disabled: true };
            if (!mo.recv) return { up: true };
            if (raw.includes(mo.recv) || (() => { try { return new RegExp(mo.recv).test(raw); } catch (e) { return false; } })()) return { up: true };
            return { up: false, err: 'Response Code: ' + resp.code + ' (' + (REASON[resp.code] || '') + ')' };
        }
        // üye durumu: availability (available | offline | unknown), state (enabled | disabled | forced-offline), reason
        // Durum dizgeleri gerçek tmsh çıktılarından (notes/f5-tmsh-cikti-ornekleri.md §4)
        const MSTAMP = '@2026/09/24 10:25:07.';
        const connOf = (pn, k) => ((SIM.conns || {})[k] || 0) + ((S.rt.conns || {})[pn + '|' + k] || 0) + (S.ct || []).filter(c => c.pool === pn && c.member === k).length;
        function memberStatus(pn, key) {
            const pl = M().pools[pn], m = pl.members[key];
            const node = Object.values(M().nodes).find(n => n.address === m.ip) || {};
            const mons = pl.monitor || null;
            const r = { avail: 'unknown', state: 'enabled', reason: 'Pool member does not have service checking enabled', err: null, mon: mons ? mons.map(x => '/Common/' + x).join(' and ') + ' (pool monitor)' : null, monName: mons ? mons.join(' and ') : null, monStatus: 'unchecked', session: 'enabled', limit: false };
            if (mons) {
                const rs = mons.map(x => ({ n: x, r: monCheck(x, m.ip, m.port) }));
                const bad = rs.find(x => !x.r.up);
                if (bad) { r.avail = 'offline'; r.monStatus = 'down'; r.err = '/Common/' + bad.n + ': ' + bad.r.err; r.reason = r.err + ' ' + MSTAMP; }
                else { r.avail = 'available'; r.monStatus = 'up'; r.reason = 'Pool member is available'; if (rs.some(x => x.r.disabled)) r.state = 'disabled'; }
            }
            if (node.state === 'user-down') return Object.assign(r, { avail: 'offline', state: 'disabled-by-parent', reason: 'Parent down', monStatus: 'address-down', session: 'addr-disabled' });
            if (m.state === 'user-down') return Object.assign(r, { avail: 'offline', state: 'disabled', reason: 'Forced down', monStatus: 'user-down', session: 'user-disabled' });
            if (node.session === 'user-disabled') Object.assign(r, { state: 'disabled-by-parent', session: 'addr-disabled' });
            if (m.session === 'user-disabled') Object.assign(r, { state: 'disabled', session: 'user-disabled' }, r.avail === 'available' ? { reason: 'Pool member is available, user disabled' } : {});
            if (m.limit && r.avail !== 'offline' && connOf(pn, key) >= m.limit) Object.assign(r, { avail: 'unavailable', reason: 'The pool member\'s connection limit has been reached', limit: true });
            return r;
        }
        function poolStatus(pn) {
            const pl = M().pools[pn]; if (!pl) return { avail: 'unknown', reason: 'no pool', state: 'enabled' };
            const ms = pl.order.map(k => memberStatus(pn, k));
            if (!ms.length) return { avail: 'unknown', reason: 'The pool has no members', state: 'enabled' };
            const live = ms.filter(x => x.avail === 'available' || x.avail === 'unknown');
            if (live.length && live.every(x => x.state !== 'enabled')) return { avail: live.some(x => x.avail === 'available') ? 'available' : 'unknown', reason: 'The children pool member(s) are disabled', state: 'disabled' };
            if (ms.some(x => x.avail === 'available' && x.state === 'enabled')) return { avail: 'available', reason: 'The pool is available', state: 'enabled' };
            if (ms.every(x => x.avail === 'offline')) return { avail: 'offline', reason: 'The children pool member(s) are down', state: 'enabled' };
            if (ms.every(x => x.avail === 'offline' || x.avail === 'unavailable')) return { avail: 'unavailable', reason: 'The pool member\'s connection limit has been reached', state: 'enabled' };
            return { avail: 'unknown', reason: 'The children pool member(s) either don\'t have service checking enabled, or service check results are not available yet', state: 'enabled' };
        }
        const vsConn = vn => ((SIM.vsConns || {})[vn] || 0) + ((S.rt.vsConns || {})[vn] || 0);
        function vsStatus(vn) {
            const v = M().virtuals[vn], st = v.enabled ? 'enabled' : 'disabled';
            if (v.limit && vsConn(vn) >= v.limit) return { avail: 'unavailable', reason: 'The virtual server\'s connection limit has been reached', state: st };
            if (!v.pool) return { avail: 'unknown', reason: 'The virtual server does not have a default pool', state: st };
            const ps = poolStatus(v.pool);
            const reason = ps.avail === 'available' && ps.state !== 'disabled' ? 'The virtual server is available' : ps.reason;
            return { avail: ps.avail, reason, state: v.enabled ? (ps.state === 'disabled' ? 'disabled' : 'enabled') : 'disabled' };
        }
        function nodeStatus(n) {
            const o = M().nodes[n];
            const r = { avail: 'unknown', state: 'enabled', reason: 'Node address does not have service checking enabled', mon: o.monitor ? o.monitor.map(x => '/Common/' + x).join(' and ') : 'none', monStatus: 'unchecked', session: 'enabled' };
            if (o.monitor) { const bad = o.monitor.map(x => ({ n: x, r: monCheck(x, o.address, 0) })).find(x => !x.r.up); if (bad) Object.assign(r, { avail: 'offline', reason: '/Common/' + bad.n + ': ' + bad.r.err + ' ' + MSTAMP, monStatus: 'down' }); else Object.assign(r, { avail: 'available', reason: 'Node address is available', monStatus: 'up' }); }
            if (o.state === 'user-down') return Object.assign(r, { avail: 'offline', state: 'disabled', reason: 'Forced down', monStatus: 'user-down', session: 'user-disabled' });
            if (o.session === 'user-disabled') Object.assign(r, { state: 'disabled', session: 'user-disabled' }, r.avail === 'available' ? { reason: 'Node address is available, user disabled' } : {});
            return r;
        }
        // durum değişimlerini /var/log/ltm'e yaz (01070638 down, 01070727 up, 01010028 pool boş)
        let ltmN = 0;
        const lstamp = () => { const t = 10 * 3600 + 25 * 60 + (ltmN++) * 3; return 'Sep 24 ' + [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(x => String(x).padStart(2, '0')).join(':'); };
        const lh = () => M().hostname;
        const was = st => ({ available: 'up for 0hr:12mins:3sec', offline: 'down for 0hr:0min:15sec', unknown: 'unchecked for 0hr:0min:1sec', forced: 'forced down for 0hr:0min:4sec' }[st] || 'up for 0hr:12mins:3sec');
        function ltmTick(quiet) {
            const prev = S.rt.ms || {}, now = {}, prevP = S.rt.ps || {}, nowP = {}, prevV = S.rt.vs || {}, nowV = {}, prevN = S.rt.ns || {}, nowN = {};
            const push = x => { if (!quiet) S.ltmlog.push(lstamp() + ' ' + lh() + ' ' + x); };
            for (const [nn, o] of Object.entries(M().nodes)) {
                const st = nodeStatus(nn), key = st.monStatus === 'user-down' ? 'forced' : st.avail; nowN[nn] = key;
                if (prevN[nn] === undefined || prevN[nn] === key) continue;
                if (key === 'offline' || key === 'forced') push('notice mcpd[7276]: 01070640:5: Node /Common/' + nn + ' address ' + o.address + ' monitor status ' + (key === 'forced' ? 'forced down.' : 'down. [ ' + (o.monitor || []).map(x => '/Common/' + x + ': down').join('; ') + ' ]') + '  [ was ' + was(prevN[nn]) + ' ]');
                else if (key === 'available') push('notice mcpd[7276]: 01070728:5: Node /Common/' + nn + ' address ' + o.address + ' monitor status up. [ ' + (o.monitor || []).map(x => '/Common/' + x + ': up').join('; ') + ' ]  [ was ' + was(prevN[nn]) + ' ]');
            }
            for (const [pn, pl] of Object.entries(M().pools)) {
                for (const k of pl.order) {
                    const st = memberStatus(pn, k), id = pn + '|' + k, key = st.monStatus === 'user-down' ? 'forced' : st.avail === 'unavailable' ? 'available' : st.avail; now[id] = key;
                    const mm = pl.members[k], mid = '/Common/' + mm.ip + ':' + mm.port;
                    if (!quiet && st.limit && !(S.rt.limLogged || {})[id]) { (S.rt.limLogged || (S.rt.limLogged = {}))[id] = true; S.ltmlog.push(lstamp() + ' ' + lh() + ' warning tmm2[11562]: 01200017:4: Warning, pool member IP ' + mm.ip + ' port ' + mm.port + ' for pool /Common/' + pn + ' has reached its connection limit.'); }
                    if (!st.limit && S.rt.limLogged) delete S.rt.limLogged[id];
                    if (prev[id] === key || (prev[id] === undefined && key !== 'offline')) continue;
                    if (key === 'forced') push('notice mcpd[7276]: 01070638:5: Pool /Common/' + pn + ' member ' + mid + ' monitor status forced down.  [ was ' + was(prev[id]) + ' ]');
                    else if (key === 'offline') push('notice mcpd[7276]: 01070638:5: Pool /Common/' + pn + ' member ' + mid + ' monitor status down. [ /Common/' + (st.monName || '').split(' and ')[0] + ': down; last error: ' + (st.err || '') + ' ' + MSTAMP + '  ]  [ was ' + was(prev[id] || 'unknown') + ' ]');
                    else if (key === 'available') push('notice mcpd[7276]: 01070727:5: Pool /Common/' + pn + ' member ' + mid + ' monitor status up. [ /Common/' + (st.monName || '').split(' and ')[0] + ': up ]  [ was ' + was(prev[id]) + ' ]');
                    else if (key === 'unknown' && prev[id]) push('notice mcpd[7276]: 01070638:5: Pool /Common/' + pn + ' member ' + mid + ' monitor status unchecked.  [ was ' + was(prev[id]) + ' ]');
                }
                const ps = poolStatus(pn).avail; nowP[pn] = ps;
                if (prevP[pn] && prevP[pn] !== 'offline' && ps === 'offline') push('err tmm[11562]: 01010028:3: No members available for pool /Common/' + pn);
                if (prevP[pn] === 'offline' && ps !== 'offline') push('err tmm[11562]: 01010221:3: Pool /Common/' + pn + ' now has available members');
            }
            for (const [vn, v] of Object.entries(M().virtuals)) {
                const av = vsStatus(vn).avail, green = av === 'available' || av === 'unknown'; nowV[vn] = green ? (av === 'unknown' ? 'BLUE' : 'GREEN') : 'RED';
                if (prevV[vn] === undefined || prevV[vn] === nowV[vn]) continue;
                const va = v.dest.split(':')[0];
                if (nowV[vn] === 'RED') { push('notice mcpd[7276]: 01071682:5: SNMP_TRAP: Virtual /Common/' + vn + ' has become unavailable'); push('notice mcpd[7276]: 010719e7:5: Virtual Address /Common/' + va + ' general status changed from ' + prevV[vn] + ' to RED.'); push('notice mcpd[7276]: 010719e8:5: Virtual Address /Common/' + va + ' monitor status changed from UP to DOWN.'); }
                else if (prevV[vn] === 'RED') { push('notice mcpd[7276]: 01071681:5: SNMP_TRAP: Virtual /Common/' + vn + ' has become available'); push('notice mcpd[7276]: 010719e7:5: Virtual Address /Common/' + va + ' general status changed from RED to ' + nowV[vn] + '.'); push('notice mcpd[7276]: 010719e8:5: Virtual Address /Common/' + va + ' monitor status changed from DOWN to UP.'); }
            }
            S.rt.ms = now; S.rt.ps = nowP; S.rt.vs = nowV; S.rt.ns = nowN;
        }
        // ── istemciden VIP'e istek: { kind: 'ok'|'refused'|'reset'|'timeout', resp, member, setCookie }
        function f5cookie(ip, port) { const o = ip.split('.').map(Number); const n = o[0] + o[1] * 256 + o[2] * 65536 + o[3] * 16777216; const pp = ((port & 0xff) << 8) | (port >> 8); return n + '.' + pp + '.0000'; }
        function eligible(pn) {
            const pl = M().pools[pn];
            let L = pl.order.filter(k => { const st = memberStatus(pn, k); return (st.avail === 'available' || st.avail === 'unknown') && st.state === 'enabled'; });
            if (pl.minActive > 0 && L.length) {
                // priority group activation: en yüksek gruptan başla, min-active karşılanana kadar alt gruplar eklenir
                const groups = [...new Set(L.map(k => pl.members[k].pg))].sort((a, b) => b - a); let sel = [];
                for (const g of groups) { sel = sel.concat(L.filter(k => pl.members[k].pg === g)); if (sel.length >= pl.minActive) break; }
                L = sel;
            }
            return L;
        }
        function lbPick(pn, L) {
            const pl = M().pools[pn], rr = S.rt.rr || (S.rt.rr = {});
            const conns = k => ((SIM.conns || {})[k] || 0) + ((S.rt.conns || {})[pn + '|' + k] || 0);
            const lb = pl.lb;
            if (/^ratio-(member|node|session)$/.test(lb)) { const seq = [].concat(...L.map(k => Array(pl.members[k].ratio).fill(k))); const i = (rr[pn] || 0) % seq.length; rr[pn] = (rr[pn] || 0) + 1; return seq[i]; }
            if (/least-connections|least-sessions|observed/.test(lb)) return L.slice().sort((a, b) => conns(a) - conns(b))[0];
            if (/fastest|predictive/.test(lb)) return L.slice().sort((a, b) => ((SIM.latency || {})[a] || 5) - ((SIM.latency || {})[b] || 5))[0];
            const i = (rr[pn] || 0) % L.length; rr[pn] = (rr[pn] || 0) + 1; return L[i];
        }
        // ═══ iRule çalıştırma ═══════════════════════════════════════════════
        // Biçimler: notes/f5-irule-arastirma.md. Kurallar M().rules[ad] = { src, events }, data group M().dgroups[ad] = { type, records }
        S.rstat = {};   // show ltm rule sayaçları: 'kural|olay' → { exec, fail, abort }
        S.rtable = {};  // table komutunun oturum tablosu
        S.rstatic = {}; // RULE_INIT ile kurulan static:: değişkenleri (kural başına)
        const irIds = { HTTP_REQUEST: 0 };
        function irCtx(v, vn, o) {
            const rules = (v.rules || []).filter(n => M().rules[n]);
            const vars = {}; rules.forEach(n => Object.assign(vars, {}));
            return { rules, vars, statics: {}, client: { ip: o.src || SIM.client || '198.51.100.20', port: 51514 + (S.ev.length % 97) }, vs: { name: vn, ip: o.ip, port: o.port }, act: { off: new Set() }, table: S.rtable, sni: o.sni || '', test: !!o.test,
                dg: n => { const d = M().dgroups[String(n).replace(/^\/Common\//, '')]; return d ? { type: d.type, records: d.records } : null; },
                hasPool: n => !!M().pools[String(n).replace(/^\/Common\//, '')], activeMembers: (n, list) => { const L = eligible(String(n).replace(/^\/Common\//, '')); return list ? L : L.length; },
                now: () => 1790000000000 + S.ev.length * 7 };
        }
        const irLog = (x, line) => { if (!x.test) S.ltmlog.push(line); };
        // bir olayı, VS'deki kural sırasıyla ve priority'ye göre çalıştırır; bağlantıyı bitiren sonuç döner (yoksa null)
        function irFire(X, ev) {
            if (!X.rules.length) return null;
            const list = [];
            X.rules.forEach((rn, ri) => (M().rules[rn].events || []).filter(e => e.name === ev).forEach(e => list.push({ rn, ri, e })));
            list.sort((a, b) => a.e.priority - b.e.priority || a.ri - b.ri);
            for (const { rn, e } of list) {
                if (X.act.off.has(rn + '|*') || X.act.off.has(rn + '|' + ev)) continue;
                const st = S.rstat[rn + '|' + ev] || (S.rstat[rn + '|' + ev] = { exec: 0, fail: 0, abort: 0 });
                if (!X.test) st.exec++;
                X.statics = S.rstatic[rn] || (S.rstatic[rn] = {}); X.rule = rn;
                X.log = (fac, msg) => { const lv = (String(fac).split('.')[1] || 'info') || 'info'; const lvl = { emerg: 'emerg', alert: 'alert', crit: 'crit', err: 'err', error: 'err', warn: 'warning', warning: 'warning', notice: 'notice', info: 'info', debug: 'debug' }[lv] || 'info'; irLog(X, lstamp() + ' ' + lh() + ' ' + lvl + ' tmm[11925]: Rule /Common/' + rn + ' <' + ev + '>: ' + msg); };
                X.note = m => { (X.notes || (X.notes = [])).push(m); };
                const offBefore = new Set(X.act.off); X.act.off = new Set();
                const r = IR.runEvent(X, e);
                X.act.off.forEach(k => offBefore.add(rn + '|' + k)); X.act.off = offBefore;
                if (!r.ok) {
                    if (!X.test) { st.fail++; if (r.abort) st.abort++; }
                    const cmdText = r.cmd || String(e.body).split('\n')[Math.max(0, (r.line || e.line) - e.line)].trim();
                    irLog(X, lstamp() + ' ' + lh() + ' err tmm[11925]: 01220001:3: TCL error: /Common/' + rn + ' <' + ev + '> - ' + r.err + (/\(line \d+\)$/.test(r.err) ? '     invoked from within "' : '     while executing "') + cmdText + '"');
                    if (!X.test && dbOn('tm.rstcause.log')) S.ltmlog.push(lstamp() + ' ' + lh() + ' err tmm[11925]: 01230140:3: RST sent from ' + X.vs.ip + ':' + X.vs.port + ' to ' + X.client.ip + ':' + X.client.port + ', [0x2a155c4:1878] iRule execution error');
                    return { kind: 'reset', why: 'irule-err', rule: rn, event: ev, notes: X.notes };
                }
            }
            if (X.act.reject) return { kind: 'reset', why: 'irule-reject', notes: X.notes };
            if (X.act.drop) return { kind: 'timeout', why: 'irule-drop' };
            if (X.act.respond && (ev === 'HTTP_REQUEST' || ev === 'LB_FAILED' || ev === 'LB_SELECTED')) return Object.assign(irRespond(X), { notes: X.notes });
            return null;
        }
        // BIG-IP'nin kendisinin ürettiği yanıt (HTTP::respond / HTTP::redirect)
        function irRespond(X) {
            const R = X.act.respond; const headers = R.headers.map(h => h[0] + ': ' + h[1]);
            if (!R.noserver && !R.headers.some(h => /^server$/i.test(h[0]))) headers.push('Server: BigIP');
            return { kind: 'ok', byF5: true, resp: { code: R.code, headers, body: R.body, noServerHdr: true, version: R.redirect ? '1.0' : '1.0' } };
        }
        // sunucu yanıtından sonra HTTP_RESPONSE
        function irResponse(X, fire, res) {
            if (!X.rules.length || !X.req) return res;
            X.resp = { status: res.resp.code, headers: [['Server', 'Apache']].concat(res.resp.headers.map(h => { const m = h.match(/^([^:]+):\s*(.*)$/); return [m[1], m[2]]; })), body: res.resp.body };
            X.act.respond = null;
            const f = fire('HTTP_RESPONSE');
            if (f && f.kind !== 'ok') return Object.assign(f, { vs: res.vs, tls: res.tls });
            if (X.act.respond) return Object.assign(irRespond(X), { vs: res.vs, tls: res.tls, member: res.member });
            res.resp = { code: X.resp.status, headers: X.resp.headers.filter(h => !/^server$/i.test(h[0]) || false).map(h => h[0] + ': ' + h[1]), body: res.resp.body, noServerHdr: true, server: (X.resp.headers.find(h => /^server$/i.test(h[0])) || [])[1] || null };
            if (res.resp.server) res.resp.headers.unshift('Server: ' + res.resp.server);
            res.notes = X.notes;
            return res;
        }
        // K14800: birden çok virtual server eşleşirse öncelik hedef adres (en uzun maske) > kaynak adres (en uzun önek) > port (belirli > any)
        const vsNet = v => v.dest.split(':')[0] + '/' + C.maskLen(v.mask || '255.255.255.255');
        function vsMatch(ip, port, src) {
            const L = Object.entries(M().virtuals).filter(([, v]) => inNet(ip, vsNet(v)) && inNet(src || '0.0.0.0', v.source || '0.0.0.0/0') && (+v.dest.split(':')[1] === port || +v.dest.split(':')[1] === 0) && v.proto !== 'udp');
            L.sort(([, a], [, b]) => C.maskLen(b.mask || '255.255.255.255') - C.maskLen(a.mask || '255.255.255.255') || cidr(b.source || '0.0.0.0/0').len - cidr(a.source || '0.0.0.0/0').len || (+b.dest.split(':')[1] ? 1 : 0) - (+a.dest.split(':')[1] ? 1 : 0));
            return L.length ? L[0][0] : null;
        }
        const vipOwned = ip => Object.values(M().virtuals).some(v => inNet(ip, vsNet(v)));
        function vipRequest(o) {
            // o: { ip, port, path, method, src, cookie, https }
            const vn = vsMatch(o.ip, o.port, o.src);
            if (!vn) return vipOwned(o.ip) ? { kind: 'refused', why: 'novs' } : { kind: 'timeout', why: 'noaddr' };
            const v = M().virtuals[vn];
            if (!v.enabled) return { kind: 'refused', why: 'disabled', vs: vn };
            // iRule bağlamı (bağlantı başına değişkenler); olaylar sırasıyla tetiklenir
            const X = irCtx(v, vn, o), fire = ev => irFire(X, ev);
            if (X.rules.length && !o.tlsOnly) { const f = fire('CLIENT_ACCEPTED'); if (f) return Object.assign(f, { vs: vn }); }
            if (v.limit && vsConn(vn) >= v.limit) { if (!o.test) S.ltmlog.push(lstamp() + ' ' + lh() + ' warning tmm[11925]: 01200009:4: Packet rejected remote IP ' + o.src + ' port 51514 local IP ' + o.ip + ' port ' + o.port + ' proto TCP: Connection limit exceeded.'); return { kind: 'reset', why: 'vslimit', vs: vn }; }
            const hasCssl = v.profiles.some(x => profType(x) === 'client-ssl');
            if (o.https && !hasCssl) return { kind: 'sslerr', vs: vn };
            if (!o.https && hasCssl) return { kind: 'reset', why: 'plain-to-ssl', vs: vn };
            const tls = o.https ? tlsFor(vn, o.sni) : null;
            if (tls && o.tlsOnly) return { kind: 'tls', vs: vn, tls };
            const hasHttp = v.profiles.some(x => profType(x) === 'http');
            if (X.rules.length && hasHttp) {
                X.req = { method: o.method || 'GET', uri: o.path || '/', version: '1.1', headers: [['Host', o.host || o.ip + (o.port === 80 || o.port === 443 ? '' : ':' + o.port)], ['User-Agent', 'curl/7.81.0'], ['Accept', '*/*']].concat(o.cookie && Object.keys(o.cookie).length ? [['Cookie', Object.entries(o.cookie).map(([k, x]) => k + '=' + x).join('; ')]] : [], (o.hdrs || []).map(h => { const m = h.match(/^([^:]+):\s*(.*)$/); return m ? [m[1], m[2]] : null; }).filter(Boolean)) };
                // curl -H ile verilen başlık varsayılanın (Host, User-Agent, Accept) yerine geçer
                ['Host', 'User-Agent', 'Accept'].forEach(n => { const hh = X.req.headers.filter(h => h[0].toLowerCase() === n.toLowerCase()); if (hh.length > 1) X.req.headers.splice(X.req.headers.indexOf(hh[0]), 1); });
                const f = fire('HTTP_REQUEST'); if (f) return Object.assign(f, { vs: vn, tls });
            }
            const PN = X.act.pool || v.pool;
            if (X.act.node) { const [nip, npt] = X.act.node.split(':'); const srvN = srvOf(nip); const npo = +(npt || o.port); if (!srvN || !reach(nip).ok) return { kind: 'timeout', why: 'l2', vs: vn }; const rN = serverResp(srvN, npo, X.req ? X.req.uri : o.path, o.method, X.req ? X.req.headers : null); if (!rN) return { kind: 'reset', why: 'srvrefused', vs: vn }; return irResponse(X, fire, { kind: 'ok', resp: rN, tls, vs: vn, member: nip + ':' + npo, src: 'client' }); }
            if (!PN) return { kind: 'reset', why: 'nopool', vs: vn };
            const L = eligible(PN);
            const hasPersisted = (S.rt.persist || {})[PN + '|' + o.src];
            if (!L.length && !hasPersisted) { if (X.rules.length) { X.lb = { pool: PN }; const f = fire('LB_FAILED'); if (f) return Object.assign(f, { vs: vn, tls }); if (X.act.reselect) { X.act.pool = X.act.reselect; X.act.reselect = null; return vipRequestPool(o, X, vn, tls); } } return { kind: 'reset', why: 'nomember', vs: vn }; }
            const pl = M().pools[PN], pers = v.persist[0] && persistType(v.persist[0]);
            let key = null, setCookie = null, persisted = false;
            const cname = pers === 'cookie' ? ((M().persists[v.persist[0]] || {}).cookieName || 'BIGipServer' + PN) : null;
            // devre dışı (session user-disabled) üye yeni bağlantı almaz ama kalıcılık kaydı olan istemcileri kabul eder; forced offline kabul etmez
            const persistOk = k => { if (!pl.members[k]) return false; if (L.includes(k)) return true; const st = memberStatus(PN, k); return (st.avail === 'available' || st.avail === 'unknown') && st.session === 'user-disabled'; };
            if (pers === 'cookie' && o.cookie && o.cookie[cname]) { key = pl.order.find(k => f5cookie(pl.members[k].ip, pl.members[k].port) === o.cookie[cname] && persistOk(k)) || null; persisted = !!key; }
            if (pers === 'source-addr' || (!key && pers === 'cookie' && v.fallback && persistType(v.fallback) === 'source-addr')) { const pr = (S.rt.persist || (S.rt.persist = {}))[PN + '|' + o.src]; if (pr && persistOk(pr)) { key = pr; persisted = true; } }
            // iRule pool … member <ip> [port]: belirtilen üye (kullanılabilirse) seçilir
            if (!key && X.act.member) { const mk = pl.order.find(k => k === X.act.member || k.split(':')[0] === X.act.member); if (mk && (L.includes(mk) || persistOk(mk))) key = mk; }
            if (!key) key = lbPick(PN, L);
            const m = pl.members[key];
            if (pers === 'source-addr' || (pers === 'cookie' && v.fallback)) { S.rt.persist[PN + '|' + o.src] = key; (S.rt.pmeta || (S.rt.pmeta = {}))[PN + '|' + o.src] = { vs: vn, age: 12 + (ip2n(o.src) % 150) }; }
            if (pers === 'cookie' && hasHttp && !persisted) { const mt = (M().persists[v.persist[0]] || {}).method || 'insert'; if (mt === 'insert') setCookie = cname + '=' + f5cookie(m.ip, m.port) + '; path=/; Httponly'; }
            (S.rt.conns || (S.rt.conns = {}))[PN + '|' + key] = ((S.rt.conns || {})[PN + '|' + key] || 0);
            (S.rt.hits || (S.rt.hits = {}))[PN + '|' + key] = (S.rt.hits[PN + '|' + key] || 0) + 1;
            const sport = v.tport === 'enabled' ? m.port : o.port, sip = v.taddr === 'enabled' ? m.ip : o.ip;
            if (X.rules.length) { X.lb = { pool: PN, ip: m.ip, port: sport }; const f = fire('LB_SELECTED'); if (f) return Object.assign(f, { vs: vn, tls }); }
            const srv = srvOf(sip), r = reach(m.ip);
            if (!srv || !r.ok) return { kind: 'timeout', why: 'l2', vs: vn, member: key };
            if (!srv.ports || !srv.ports[sport]) return { kind: 'reset', why: 'srvrefused', vs: vn, member: key, sport, tls };
            const hasSssl = v.profiles.some(x => profType(x) === 'server-ssl');
            if (hasSssl && !srv.ports[sport].tls) return { kind: 'reset', why: 'srvssl', vs: vn, member: key, tls };
            // dönüş yolu: SNAT yoksa sunucu istemciye kendi ağ geçidi üzerinden döner
            if (v.sat.type === 'none') { const back = Object.values(M().selfs).some(s => s.address && s.address.split('/')[0] === srv.gw); if (!back) return { kind: 'timeout', why: 'asym', vs: vn, member: key }; }
            if (v.sat.type === 'snat') { const ok = M().snatpools[v.sat.pool].members.some(ip => Object.values(M().selfs).some(s => s.address && inNet(ip, s.address) && inNet(m.ip, s.address))); if (!ok) return { kind: 'timeout', why: 'snatroute', vs: vn, member: key }; }
            const resp = srv.ports[sport].tls && !hasSssl ? { code: 400, headers: ['Connection: close'], body: '<p>Your browser sent a request that this server could not understand.<br />\nReason: You\'re speaking plain HTTP to an SSL-enabled server port.<br />\n Instead use the HTTPS scheme to access this URL, please.<br />\n</p>' } : serverResp(srv, sport, X.req ? X.req.uri : o.path, o.method, X.req ? X.req.headers : null);
            if (!resp) return { kind: 'reset', why: 'srvrefused', vs: vn, member: key };
            if (setCookie) resp.headers = resp.headers.concat(['Set-Cookie: ' + setCookie]);
            if (X.rules.length) { const selfIn = Object.values(M().selfs).find(x => x.address && inNet(m.ip, x.address)); X.lb.snat = v.sat.type === 'automap' && selfIn ? selfIn.address.split('/')[0] : null; }
            return irResponse(X, fire, { kind: 'ok', resp, tls, vs: vn, member: key, persisted, src: v.sat.type === 'automap' ? 'self' : v.sat.type === 'snat' ? 'snat' : 'client' });
        }
        // LB::reselect sonrası yeni pool ile tekrar dene (tek sefer)
        function vipRequestPool(o, X, vn, tls) { const L = eligible(X.act.pool); if (!L.length) return { kind: 'reset', why: 'nomember', vs: vn }; const k = lbPick(X.act.pool, L), m = M().pools[X.act.pool].members[k], srv = srvOf(m.ip); if (!srv || !reach(m.ip).ok) return { kind: 'timeout', why: 'l2', vs: vn }; const resp = serverResp(srv, m.port, X.req ? X.req.uri : o.path, o.method, X.req ? X.req.headers : null); if (!resp) return { kind: 'reset', why: 'srvrefused', vs: vn }; return irResponse(X, e => irFire(X, e), { kind: 'ok', resp, tls, vs: vn, member: k, src: 'self' }); }
        // ═══ Bağlantı tablosu (show/delete sys connection) ═══════════════════
        // lab.sim.clients: [{ ip, vs, n }] sürekli bağlı istemciler. Kurulu bağlantı yapılandırma değişikliğinden etkilenmez (K13253);
        // silinen bağlantının istemcisi yeniden bağlanır ve o anki dağıtım/kalıcılık kararıyla yeni üyeye gider.
        S.ct = [];
        let ctPort = 49930;
        function ctOpen(ip, vn) {
            const v = M().virtuals[vn]; if (!v || !v.enabled) return null;
            const [vip, vport] = v.dest.split(':'); const port = ctPort++;
            const c = { cc: ip + ':' + port, cs: vip + ':' + vport, sc: 'any6.any', ss: 'any6.any', proto: v.proto === 'udp' ? 'udp' : 'tcp', idle: 3 + (port % 40), tmm: port % 2, vs: vn, pool: v.pool, member: null };
            const r = vipRequest({ ip: vip, port: +vport, path: '/', method: 'GET', src: ip, cookie: {}, test: true });
            if (r.member && r.kind !== 'refused') {
                const m = M().pools[v.pool].members[r.member]; c.member = r.member;
                c.ss = m.ip + ':' + (v.tport === 'enabled' ? m.port : vport);
                const self = Object.values(M().selfs).find(x => x.address && inNet(m.ip, x.address));
                c.sc = v.sat.type === 'automap' && self ? self.address.split('/')[0] + ':' + port : v.sat.type === 'snat' ? M().snatpools[v.sat.pool].members[0] + ':' + port : ip + ':' + port;
                if (r.kind !== 'ok') { c.sc = 'any6.any'; c.ss = 'any6.any'; c.member = null; }
            }
            return c;
        }
        function ctBoot() { (SIM.clients || []).forEach(cl => { for (let i = 0; i < (cl.n || 1); i++) { const c = ctOpen(cl.ip, cl.vs); if (c) S.ct.push(c); } }); }
        const ipIn = (ipport, flt) => { const ip = ipport.split(':')[0]; return flt.includes('/') ? inNet(ip, flt) : ip === flt; };
        function ctFilter(a) {
            const F = {}; const keys = ['cs-client-addr', 'cs-client-port', 'cs-server-addr', 'cs-server-port', 'ss-client-addr', 'ss-client-port', 'ss-server-addr', 'ss-server-port', 'protocol', 'age', 'virtual-server'];
            for (let i = 0; i < a.length; i++) { if (a[i] === 'all-properties') { F.all = true; continue; } if (!keys.includes(a[i])) return { err: a[i] }; if (a[i + 1] === undefined) return { err: a[i], novalue: true }; F[a[i]] = a[++i]; }
            const pnum = x => portOf(x);
            const fld = { 'cs-client': 'cc', 'cs-server': 'cs', 'ss-client': 'sc', 'ss-server': 'ss' };
            const list = S.ct.filter(c => Object.entries(fld).every(([k, f]) => (!F[k + '-addr'] || (c[f] !== 'any6.any' && ipIn(c[f], F[k + '-addr']))) && (!F[k + '-port'] || (c[f] !== 'any6.any' && +c[f].split(':')[1] === pnum(F[k + '-port'])))) && (!F.protocol || c.proto === F.protocol) && (!F.age || c.idle >= +F.age) && (!F['virtual-server'] || c.vs === F['virtual-server'].replace(/^\/Common\//, '')));
            return { F, list };
        }
        function showConn(a) {
            const r = ctFilter(a); if (r.err) return r.novalue ? E('Syntax Error: "' + r.err + '" requires a value', 'incomplete') : SYN(r.err);
            const L = ['Sys::Connections'];
            r.list.forEach(c => {
                if (!r.F.all) { L.push(c.cc + '  ' + c.cs + '  ' + c.sc + '  ' + c.ss + '  ' + c.proto + '  ' + c.idle + '  (tmm: ' + c.tmm + ')  none  none'); return; }
                L.push(c.cc + ' - ' + c.cs + ' - ' + c.sc + ' - ' + c.ss, '-'.repeat(69), '  TMM           ' + c.tmm, '  Type          any', '  Acceleration  none', '  Neuron Rules  none', '  Protocol      ' + c.proto, '  Idle Time     ' + c.idle, '  Idle Timeout  300', '  Unit ID       1',
                    '  Lasthop       /Common/external 00:50:56:8a:77:01', '  Server Nexthop ' + (c.member ? '/Common/server 00:50:56:8a:30:' + (ip2n(c.ss.split(':')[0]) % 90 + 10) : 'none'), '  Ingress Dest  none', '  Virtual Path  ' + c.cs, '  Conn Id 0', '',
                    '                         ClientSide        ServerSide', '  Client Addr  ' + c.cc.padStart(19) + '  ' + c.sc.padStart(18), '  Server Addr  ' + c.cs.padStart(19) + '  ' + c.ss.padStart(18), '  Bits In      ' + '5.0K'.padStart(19) + '  ' + (c.member ? '34.8K' : '0').padStart(18), '  Bits Out     ' + '35.2K'.padStart(19) + '  ' + (c.member ? '5.0K' : '0').padStart(18), '');
            });
            L.push('Total records returned: ' + r.list.length);
            log({ showConn: r.F, n: r.list.length });
            return { out: L.join('\n'), ok: true };
        }
        function deleteConn(a) {
            const r = ctFilter(a); if (r.err || r.F.all) return r.novalue ? E('Syntax Error: "' + r.err + '" requires a value', 'incomplete') : SYN(r.err || 'all-properties');
            const gone = r.list; S.ct = S.ct.filter(c => !gone.includes(c));
            // istemciler yeniden bağlanır
            gone.forEach(c => { const n = ctOpen(c.cc.split(':')[0], c.vs); if (n) S.ct.push(n); });
            log({ delConn: r.F, n: gone.length });
            return { out: '', ok: true };
        }
        function persistRecs(a, del) {
            const F = {}; const keys = ['client-addr', 'key', 'mode', 'node-addr', 'node-port', 'pool', 'virtual'];
            for (let i = 0; i < a.length; i++) { if (a[i] === 'all-properties' && !del) { F.all = true; continue; } if (!keys.includes(a[i])) return SYN(a[i]); if (a[i + 1] === undefined) return E('Syntax Error: "' + a[i] + '" requires a value', 'incomplete'); F[a[i]] = a[++i]; }
            if (F.mode && !['cookie', 'destination-address', 'hash', 'msrdp', 'sip', 'source-address', 'ssl-session-id', 'universal'].includes(F.mode)) return SYNx('"' + F.mode + '" invalid mode');
            const recs = Object.entries(S.rt.persist || {}).map(([k, mk]) => { const [pn, src] = k.split('|'); const meta = (S.rt.pmeta || {})[k] || {}; const vn = meta.vs || (Object.entries(M().virtuals).find(([, v]) => v.pool === pn) || ['?'])[0]; return { k, pn, src, mk, vn, vd: M().virtuals[vn] ? M().virtuals[vn].dest : 'any:any', age: meta.age || 30 }; })
                .filter(x => (!F['client-addr'] || x.src === F['client-addr']) && (!F.mode || F.mode === 'source-address') && (!F['node-addr'] || x.mk.split(':')[0] === F['node-addr']) && (!F['node-port'] || x.mk.split(':')[1] === String(portOf(F['node-port']))) && (!F.pool || x.pn === F.pool.replace(/^\/Common\//, '')) && (!F.virtual || x.vn === F.virtual.replace(/^\/Common\//, '')));
            if (del) { recs.forEach(x => { delete S.rt.persist[x.k]; if (S.rt.pmeta) delete S.rt.pmeta[x.k]; }); log({ delPersist: F, n: recs.length }); return { out: '', ok: true }; }
            const L = ['Sys::Persistent Connections'];
            recs.forEach(x => { if (!F.all) { L.push('source-address  ' + x.src + '  ' + x.vd + '  ' + x.mk + '  (tmm: ' + (ip2n(x.src) % 2) + ')'); return; }
                L.push('source-address - ' + x.vd + ' - ' + x.mk, '-'.repeat(57), '  TMM           ' + (ip2n(x.src) % 2), '  Mode          source-address', '  Value         ' + x.src, '  Age (sec.)    ' + x.age, '  Virtual Name  /Common/' + x.vn, '  Virtual Addr  ' + x.vd, '  Node Addr     ' + x.mk, '  Pool Name     /Common/' + x.pn, '  Client Addr   ' + x.src, '  Owner entry', '  not mirrored'); });
            L.push('Total records returned: ' + recs.length);
            log({ show: 'ltm persistence', F, n: recs.length });
            return { out: L.join('\n'), ok: true };
        }
        // ═══ HA durumu, config sync, failover ═══════════════════════════════
        const HA = { st: 'active', syncKey: null, peerCfg: null };
        const syncKey = m => JSON.stringify([m.nodes, m.pools, m.monitors, m.virtuals, m.snatpools, m.persists, m.httpProfiles, m.cssl, m.sssl, m.certs, m.keys, m.rules, m.dgroups]);
        const haDg = () => Object.entries(M().cm.dgs).find(([, g]) => g.type === 'sync-failover' && PEER && g.devices.includes(PEER.name) && g.devices.includes(M().hostname));
        const selfOfIp = ip => Object.entries(M().selfs).find(([, x]) => x.address && x.address.split('/')[0] === ip);
        const selfAllowsSvc = (sn, pr, port) => { const x = M().selfs[sn]; if (!x) return false; if (x.allow === 'all') return true; if (x.allow === 'none') return false; const L = x.allow === 'default' ? ALLOW_DEFAULT : x.allow; return L.some(y => { const [p2, t2] = y.split(':'); return p2 === pr && (t2 === 'any' || +t2 === port || SVC_PORT[t2] === port); }); };
        // bağlantı: configsync adresi + TCP 4353 açık + eşe erişim + güven + saat
        function haLink() {
            if (!PEER || !M().cm.trusted.includes(PEER.name)) return { ok: false, why: 'trust' };
            if (PEER.timeSkew) return { ok: false, why: 'time' };
            if (!M().cm.cs) return { ok: false, why: 'csip' };
            const sf = selfOfIp(M().cm.cs); if (!sf) return { ok: false, why: 'csip' };
            if (!selfAllowsSvc(sf[0], 'tcp', 4353)) return { ok: false, why: 'lockdown' };
            if (!reach(PEER.ha).ok) return { ok: false, why: 'reach' };
            return { ok: true, fo: selfAllowsSvc(sf[0], 'udp', 1026) };
        }
        function syncStatus() {
            const g = haDg(); if (!g) return { color: 'green', status: 'Standalone', summary: '', details: [] };
            const l = haLink();
            if (!l.ok) return { color: 'red', status: 'Disconnected', summary: 'The local device is disconnected from all other devices in the trust domain', details: [PEER.name + ': disconnected'] };
            if (HA.syncKey === null) return { color: 'blue', status: 'Awaiting Initial Sync', summary: 'The device group is awaiting the initial config sync', details: [PEER.name + ': connected', g[0] + ' (Awaiting Initial Sync): Sync one of the devices to the group'] };
            if (syncKey(M()) !== HA.syncKey) return { color: 'yellow', status: 'Changes Pending', summary: 'There is a possible change conflict between ' + M().hostname + ' and ' + PEER.name + '.', details: [PEER.name + ': connected', g[0] + ' (Changes Pending): ' + M().hostname + ' has the most recent configuration'] };
            return { color: 'green', status: 'In Sync', summary: 'All devices in the device group are in sync', details: [PEER.name + ': connected', g[0] + ' (In Sync): All devices in the device group are in sync'] };
        }
        function doSync(dir, dg) {
            const g = M().cm.dgs[dg]; if (!g) return NF('device group', dg);
            const l = haLink(); if (!l.ok) return E('# [Simülatör] Eşitleme yapılamadı: eşe bağlantı yok (' + { trust: 'güven kurulmamış', time: 'saatler uyuşmuyor', csip: 'configsync-ip tanımlı değil', lockdown: 'ConfigSync self IP\'sinde TCP 4353 kapalı (port lockdown)', reach: 'eşin HA adresine ulaşılamıyor' }[l.why] + ').', 'value');
            if (dir === 'from' && HA.peerCfg) { ['nodes', 'pools', 'monitors', 'virtuals', 'snatpools', 'persists', 'httpProfiles', 'cssl', 'sssl', 'certs', 'keys', 'rules', 'dgroups'].forEach(k => { M()[k] = clone(HA.peerCfg[k]); }); }
            HA.syncKey = syncKey(M()); HA.peerCfg = clone(M()); log({ haSync: dir });
            return { out: '', ok: true };
        }
        function failoverCmd(a) {
            const act = a[2]; if (!['standby', 'offline', 'online'].includes(act)) return E('Syntax Error: run sys failover standby | offline | online', 'incomplete');
            const rest = a.slice(3); for (let i = 0; i < rest.length; i += 2) if (!['traffic-group', 'device', 'persist', 'no-persist'].includes(rest[i])) return SYN(rest[i]);
            if (!haDg()) return E('# [Simülatör] Cihaz HA çiftinde değil (Standalone): devredecek eş yok.', 'value');
            const push = x => S.ltmlog.push(lstamp() + ' ' + lh() + ' ' + x);
            if (act === 'standby') {
                if (HA.st !== 'active') return E('# [Simülatör] Bu cihaz zaten aktif değil (' + HA.st + ').', 'value');
                const l = haLink(); if (!l.ok || !l.fo) return E('# [Simülatör] Eş cihaz bu cihazın durumunu göremiyor (network failover bağlantısı yok); devretme yapılamaz.', 'value');
                push('notice sod[6926]: 010c0026:5: Failover condition, active attempting to go standby'); push('notice sod[6926]: 010c0052:5: Standby for traffic group /Common/traffic-group-1.'); push('notice sod[6926]: 010c0018:5: Standby');
                HA.st = 'standby'; log({ failover: 'standby' }); return { out: '', ok: true };
            }
            if (act === 'offline') { HA.st = 'offline'; push('notice sod[6926]: 010c003f:5: Forced offline'); log({ failover: 'offline' }); return { out: '', ok: true }; }
            if (HA.st !== 'offline') return E('# [Simülatör] Cihaz forced offline değil.', 'value');
            HA.st = 'standby'; push('notice sod[6926]: 010c0018:5: Standby'); log({ failover: 'online' }); return { out: '', ok: true };
        }
        // Yerel cihaz aktif değilken VIP trafiğini eş karşılar: eşte son eşitlenmiş yapılandırma vardır
        function viaPeer(fn) {
            if (!haDg() || HA.st === 'active') return fn();
            if (PEER && PEER.garpBlocked && !M().cm.tgMac) return { kind: 'timeout', why: 'arp' };
            if (!HA.peerCfg) return { kind: 'timeout', why: 'peer-empty' };
            const keep = S.m; S.m = clone(HA.peerCfg); S.m.cm = keep.cm; S.m.selfs = keep.selfs; S.m.vlans = keep.vlans; S.m.routes = keep.routes;
            try { return fn(); } finally { S.m = keep; }
        }
        const haPromptSt = () => (S.inop ? 'INOPERATIVE' : HA.st === 'active' ? 'Active' : HA.st === 'standby' ? 'Standby' : 'Forced Offline');
        const vlanUp = vn => { const v = M().vlans[vn]; return !!v && Object.keys(v.ifs).some(linkUp); };
        function saveLoad(verb, rest) {
            const a = rest.map(x => x.t);
            if (a[0] === 'sys' && a[1] === 'ucs') return ucsCmd(verb, a.slice(2));
            if (a[0] !== 'sys' || a[1] !== 'config') { return E('Syntax Error: "' + (a[0] || verb) + '" unknown property', 'invalid'); }
            const extra = a.slice(2).filter(x => !['partitions', 'all', 'verify'].includes(x));
            if (extra.length) return SYN(extra[0]);
            if (verb === 'save') { S.saved = clone(M()); log({ save: true }); return { out: 'Saving running configuration...\n  /config/bigip.conf\n  /config/bigip_base.conf\n  /config/bigip_user.conf\nSaving Ethernet mapping...done', ok: true }; }
            if (a.includes('verify')) { log({ loadVerify: true }); return { out: 'Validating configuration...\n  /config/bigip_base.conf\n  /config/bigip_user.conf\n  /config/bigip.conf\n# [Simülatör] Doğrulama hatasız; yükleme yapılmadı (verify).', ok: true }; }
            const lost = diffList(M(), S.saved); S.m = clone(S.saved); log({ load: true, lost });
            return { out: 'Loading configuration...\n  /defaults/asm_base.conf\n  /config/bigip_base.conf\n  /config/bigip_user.conf\n  /config/bigip.conf' + (lost.length ? '\n# [Simülatör] Kaydedilmemiş değişiklikler geri alındı: ' + lost.join(', ') : ''), ok: true };
        }
        function diffList(a, b) {
            const L = []; if (a.hostname !== b.hostname) L.push('hostname'); if (a.mgmtIp !== b.mgmtIp) L.push('management-ip');
            [['vlans', 'net vlan'], ['selfs', 'net self'], ['routes', 'net route'], ['mgmtRoutes', 'sys management-route'], ['users', 'auth user'], ['ifs', 'net interface']].forEach(([k, t]) => { for (const n of new Set(Object.keys(a[k]).concat(Object.keys(b[k])))) if (JSON.stringify(a[k][n]) !== JSON.stringify(b[k][n])) L.push(t + ' ' + n); });
            [['httpd', 'sys httpd'], ['sshd', 'sys sshd'], ['dns', 'sys dns'], ['ntp', 'sys ntp'], ['prov', 'sys provision'], ['pwpol', 'auth password-policy']].forEach(([k, t]) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) L.push(t); });
            return L;
        }
        function ucsCmd(verb, a) {
            const raw = a[0]; if (!raw) return E('Syntax Error: ucs requires a file name', 'incomplete');
            const nm = raw.replace(/^\/var\/local\/ucs\//, '').replace(/\.ucs$/, '') + '.ucs';
            const opts = a.slice(1); const bad = opts.find(x => !['no-license', 'no-platform-check', 'reset-trust', 'passphrase', 'include-chassis-level-config', 'no-private-key'].includes(x)); if (bad && verb === 'load') return SYN(bad);
            if (verb === 'save') { S.ucs = S.ucs.filter(u => u.name !== nm).concat([{ name: nm, cfg: clone(S.saved), ver: curVer() }]); log({ ucsSave: nm }); return { out: 'Saving active configuration...\n/var/local/ucs/' + nm + ' is saved.\n# [Simülatör] UCS, kayıtlı (save sys config edilmiş) yapılandırmayı, lisansı ve sertifikaları içerir.', ok: true }; }
            const u = S.ucs.find(x => x.name === nm); if (!u) return E('# [Simülatör] /var/local/ucs/' + nm + ' bulunamadı (ls /var/local/ucs).', 'value');
            if (!u.cfg) return E('# [Simülatör] Bu UCS lab\'da yalnız dosya olarak var; içeriği yüklenemez.', 'value');
            S.m = clone(u.cfg); S.saved = clone(u.cfg); log({ ucsLoad: nm });
            return { out: 'Loading UCS file /var/local/ucs/' + nm + '...\n# [Simülatör] Yapılandırma UCS\'teki hâline döndü' + (opts.includes('no-license') ? ' (lisans dosyası korunarak).' : '.'), ok: true };
        }
        function installCmd(rest) {
            const a = rest.map(x => x.t);
            if (a[0] === 'sys' && a[1] === 'crypto' && ['cert', 'key'].includes(a[2])) {
                const nm = a[3], fi = a.indexOf('from-local-file'), path = fi > 0 ? a[fi + 1] : null;
                if (!nm || nm === 'from-local-file') return E('Syntax Error: ' + a[2] + ' requires a name', 'incomplete');
                if (!path) return E('Syntax Error: install sys crypto ' + a[2] + ' <ad> from-local-file <dosya>', 'incomplete');
                const f = (SIM.sslFiles || {})[path];
                if (!f) return E('# [Simülatör] ' + path + ' bulunamadı (ls /var/tmp). Dosya önce scp ile cihaza kopyalanır.', 'value');
                if ((a[2] === 'cert') !== (f.type === 'cert')) return E('# [Simülatör] ' + path + ' bir ' + (f.type === 'cert' ? 'sertifika' : 'özel anahtar') + '; install sys crypto ' + (f.type === 'cert' ? 'cert' : 'key') + ' kullanın.', 'value');
                const coll = a[2] === 'cert' ? M().certs : M().keys;
                if (coll[nm] && a.includes('no-overwrite')) return E('The requested ' + a[2] + '(' + nm + ') already exists in this scope.');
                coll[nm] = a[2] === 'cert' ? Object.assign({ san: [], bits: 2048, nb: 'Mar  1 10:12:44 2026 GMT', na: 'Mar  1 10:12:44 2027 GMT' }, f, { path }) : { bits: f.bits || 2048, pair: f.pair, path };
                log({ install: 'crypto ' + a[2], name: nm }); return { out: '', ok: true };
            }
            if (a[0] !== 'sys' || a[1] !== 'software' || !['image', 'hotfix'].includes(a[2])) return E('Syntax Error: install sys software image <iso> volume <HDx.y> [create-volume]', 'invalid');
            const iso = a[3]; if (!iso) return E('Syntax Error: image requires a file name', 'incomplete');
            if (!S.images.includes(iso)) return E('# [Simülatör] ' + iso + ' /shared/images altında yok (ls /shared/images). ISO önce bu dizine kopyalanmalı.', 'value');
            const vi = a.indexOf('volume'), vol = vi > 0 ? a[vi + 1] : null; if (!vol || !/^HD1\.\d$/.test(vol)) return E('Syntax Error: volume <HD1.x> required', 'incomplete');
            if (vol === S.boot) return E('# [Simülatör] Aktif hacme (' + vol + ') kurulum yapılamaz; başka bir hacim seçin.', 'value');
            if (!S.vols[vol] && !a.includes('create-volume')) return E('# [Simülatör] ' + vol + ' hacmi yok; create-volume ekleyin.', 'value');
            if (a[2] === 'hotfix' && !(SIM.hotfixBase && S.vols[vol] && S.vols[vol].version === SIM.hotfixBase)) return E('# [Simülatör] Hotfix yalnız temel imajı kurulu bir hacme uygulanır. Güncel sürümler tam ISO olarak gelir: install sys software image …', 'value');
            const m = iso.match(/(\d+\.\d+\.\d+(?:\.\d+)?)/); const ver = m ? m[1] : 'unknown';
            if (SIM.diskFull) { S.vols[vol] = { version: ver, build: '0.0.5', status: 'failed (Disk full (volume group))' }; log({ install: vol, failed: true }); return { out: '', ok: true }; }
            S.vols[vol] = { version: ver, build: '0.0.5', status: 'installing 37.000 pct', tick: 0 }; log({ install: vol, iso });
            return { out: '', ok: true };
        }
        function doReboot(vol) {
            const was = short(), lost = diffList(M(), S.saved); S.m = clone(S.saved); S.mode = 'bash'; S.fromTmsh = false; S.rt.arp = {}; S.rt.reboots++;
            if (vol && vol !== S.boot) { S.boot = vol; S.vols[vol].status = 'complete'; }
            S.inop = !svcOk(curVer());
            if (S.inop) S.ltmlog.push(stamp(900 + S.rt.reboots) + ' ' + short() + ' emerg load_config_files[4122]: "/usr/bin/tmsh -n -g -a load sys config partitions all " - failed. -- 01070608:0: License is not operational (expired or digital signature does not match contents).');
            log({ reboot: true, lost, vol: S.boot, inop: S.inop });
            if (vol) return { out: ['Broadcast message from root@' + was + ' (pts/0):', 'The system is going down for reboot NOW!', '# [Simülatör] Sistem ' + S.boot + ' hacminden (' + curVer() + ') açıldı; önceki hacmin kayıtlı yapılandırması taşındı.', S.inop ? '# [Simülatör] Yapılandırma YÜKLENMEDİ: istem durumu INOPERATIVE. /var/log/ltm\'e bakın.' : '', lost.length ? '# [Simülatör] Kaydedilmediği için taşınmayanlar: ' + lost.join(', ') : ''].filter(Boolean).join('\n'), ok: true };
            return { out: ['Broadcast message from root@' + was + ' (pts/0):', 'The system is going down for reboot NOW!', '# [Simülatör] Sistem yeniden başladı; açılışta kaydedilmiş yapılandırma (/config/*.conf) yüklendi.', lost.length ? '# [Simülatör] Kaydedilmediği için kaybolanlar: ' + lost.join(', ') : '# [Simülatör] Kaybolan değişiklik yok: her şey kaydedilmişti.'].join('\n'), ok: true };
        }
        function runCmd(rest, line, viaBash) {
            const a = rest.map(x => x.t);
            if (a[0] === 'util' && a[1] === 'bash') {
                if (a[2] === '-c') { const q = line.match(/-c\s+(['"])([\s\S]*)\1\s*$/); if (!q) return E('Syntax Error: run util bash -c "<komut>"', 'incomplete'); const o = bashLine(q[2], true); return typeof o === 'string' ? { out: o, ok: true } : o; }
                if (a.length > 2) return SYN(a[2]);
                if (viaBash) return E('# [Simülatör] Zaten bash\'tesiniz.', 'invalid');
                S.mode = 'bash'; S.fromTmsh = true; return { out: '', ok: true };
            }
            if (a[0] === 'util' && a[1] === 'ping') { const o = ping(['ping'].concat(a.slice(2))); return typeof o === 'string' ? { out: o, ok: true } : o; }
            if (a[0] === 'sys' && a[1] === 'failover') return failoverCmd(a);
            if (a[0] === 'cm' && a[1] === 'config-sync') { const k = ['to-group', 'from-group'].indexOf(a[2]); if (k < 0 || !a[3]) return E('Syntax Error: run cm config-sync to-group <device-group> | from-group <device-group>', 'incomplete'); return doSync(k ? 'from' : 'to', a[3]); }
            return E('# [Simülatör] "run ' + a.slice(0, 2).join(' ') + '" bu lab sürümünde desteklenmiyor.', 'unsupported');
        }
        function helpText(prefix) {
            void prefix;
            return ['Commands:', '  create     Yeni nesne oluştur', '  delete     Nesne sil', '  list       Yapılandırmayı göster', '  modify     Nesneyi değiştir', '  show       Durum/istatistik göster', '  save       Yapılandırmayı kaydet (save sys config)', '  load       Yapılandırmayı yükle (load sys config [verify])', '  run        run util bash | run sys failover …', '  quit       tmsh\'ten çık',
                'Modules: net sys auth (bu lab sürümü)', '# [Simülatör] ? ile bulunduğunuz noktadaki seçenekleri görün.'].join('\n');
        }

        // ═══ bash ═══════════════════════════════════════════════════════
        const FILES = () => ({
            '/config/bigip.license': licenseFile(),
            '/var/log/audit': S.audit.join('\n'),
            '/var/log/ltm': S.ltmlog.join('\n'),
            '/var/log/secure': (SIM.securelog || []).join('\n'),
            '/config/bigip_base.conf': '# [Simülatör] Dosya içeriği gösterilmiyor; tmsh list net ile bakın.',
            '/config/bigip.conf': '# [Simülatör] Dosya içeriği gösterilmiyor; tmsh list ltm ile bakın.',
        });
        const DIRS = () => ({ '/shared/images': S.images, '/var/local/ucs': S.ucs.map(u => u.name), '/config': ['bigip.conf', 'bigip_base.conf', 'bigip_user.conf', 'bigip.license', 'BigDB.dat'], '/var/log': ['audit', 'ltm', 'secure', 'messages', 'asm'], '/var/tmp': S.tmp });
        function licenseFile() {
            return ['#', 'Auth vers :          5b', '#', '#', '#       BIG-IP System License Key File', '#       DO NOT EDIT THIS FILE!!', '#', 'Usage :                 F5 Internal Product Development', 'Vendor :                F5, Inc.', 'active module :         LTM, VE-1G|ABCDEFG-HIJKLMN|Rate Shaping|Anti-Virus Checks',
                'Licensed date :         20240115', 'License end date :      20270115', 'License start date :    20240114', 'Service check date :    ' + (SIM.serviceCheck || '2026/08/20').replace(/\//g, ''), 'Registration Key :      AAAAA-BBBBB-CCCCC-DDDDD-EEEEEEE', '# [Simülatör] Dosya kısaltıldı; anahtarlar temsilidir.'].join('\n');
        }
        function splitPipe(s) { const parts = []; let cur = '', q = null; for (const ch of s) { if (q) { if (ch === q) q = null; cur += ch; continue; } if (ch === '"' || ch === '\'') { q = ch; cur += ch; continue; } if (ch === '|') { parts.push(cur); cur = ''; continue; } cur += ch; } parts.push(cur); return parts.map(x => x.trim()); }
        function shWords(s) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]); return out; }
        function grepF(argv, text) {
            let inv = false, ic = false, cnt = false, i = 1; for (; i < argv.length && /^-[ivEc]+$/.test(argv[i]); i++) { if (argv[i].includes('i')) ic = true; if (argv[i].includes('v')) inv = true; if (argv[i].includes('c')) cnt = true; }
            const pat = argv[i]; if (pat === undefined) return null;
            let re; try { re = new RegExp(pat, ic ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ic ? 'i' : ''); }
            const hit = text.split('\n').filter(l => l !== '' && re.test(l) !== inv);
            return { text: cnt ? String(hit.length) : hit.join('\n'), file: argv[i + 1] };
        }
        function bashLine(line, nested) {
            // for i in {1..N}; do <komut>; done  (yalnız bu kalıp)
            const fl = line.match(/^for\s+\w+\s+in\s+\{(\d+)\.\.(\d+)\};\s*do\s+(.+?);\s*done$/);
            if (fl) { const n = Math.min(Math.max(+fl[2] - +fl[1] + 1, 0), 20); const outs = []; for (let i = 0; i < n; i++) { const r = bashLine(fl[3], nested); if (r && r.err) return r; outs.push(typeof r === 'string' ? r : r.out); } return { out: outs.filter(x => x !== '').join('\n'), ok: true, log: { loop: n } }; }
            if (/^for\s/.test(line)) return E('# [Simülatör] Bu lab\'da yalnız "for i in {1..N}; do <komut>; done" kalıbı desteklenir.', 'unsupported');
            const parts = splitPipe(line); const argv = shWords(parts[0]);
            if (!argv.length) return '';
            const pipes = parts.slice(1).map(shWords);
            for (const p of pipes) if (!p.length || !['grep', 'egrep'].includes(p[0])) return E('# [Simülatör] Bu lab\'da boru (|) ile yalnız grep desteklenir.', 'unsupported');
            const r = bashCmd(argv, line, nested);
            if (r && r.err) return r;
            let out = typeof r === 'string' ? r : r.out;
            for (const p of pipes) { const g = grepF(p, out); if (!g) return E('Usage: grep [OPTION]... PATTERNS [FILE]...', 'incomplete'); out = g.text; }
            return { out, ok: true, log: r.log };
        }
        // curl: VIP'e istek dış istemciden (lab.sim.client) gönderilmiş kabul edilir; sunucu IP'sine istek BIG-IP'nin kendisinden gider
        const JARS = {};
        // curl -L: 3xx yanıtında Location izlenir (en çok --max-redirs, varsayılan 50; curl 7.81: "curl: (47) Maximum (50) redirects followed")
        function curl(a, depth) {
            depth = depth || 0;
            const Li = a.findIndex(x => x === '-L' || x === '--location' || (/^-[vkIsSL]+$/.test(x) && x.includes('L')));
            if (Li > 0 && depth === 0) {
                const mi = a.indexOf('--max-redirs'), max = mi > 0 ? +a[mi + 1] : 50;
                const base = a.filter((x, k) => k !== Li && k !== mi && k !== mi + 1 || (k === Li && /^-[vkIsS]+L/.test(x))).map(x => (/^-[vkIsSL]+$/.test(x) ? x.replace('L', '') : x)).filter(x => x !== '-');
                const url0 = base.find(x => /^https?:\/\//.test(x)); let url = url0, out = [], n = 0;
                for (;;) {
                    const r = curl(base.map(x => (x === url0 ? url : x)), 1);
                    if (r.err) { if (n === 0) return r; out.push(String(r.msg).split('\n')[0]); break; }   // izlenen adres çözülemedi: curl (6) yazar ve durur
                    const txt = r.out; out.push(txt);
                    const ev = S.ev.slice().reverse().find(e => e.curl); const c = ev && ev.curl;
                    if (!c || !c.loc || !/^30[1237]$/.test(String(c.code))) break;
                    if (n >= max) { out.push('curl: (47) Maximum (' + max + ') redirects followed'); log({ curlLoop: true, n }); break; }
                    n++; url = /^https?:\/\//.test(c.loc) ? c.loc : url.replace(/^(https?:\/\/[^/]+).*$/, '$1') + c.loc;
                }
                const shown = out.length > 6 ? out.slice(0, 3).concat(['# [Simülatör] … ' + (out.length - 5) + ' yönlendirme daha …'], out.slice(-2)) : out;
                return { out: shown.join('\n') };
            }
            let url = null, verbose = false, head = false, silent = false, out = null, wfmt = null, method = null, jarR = null, jarW = null, iface = null, insecure = false; const hdr = [], resolve = {};
            for (let i = 1; i < a.length; i++) {
                const t = a[i];
                if (/^-[vkIsSL]+$/.test(t)) { if (t.includes('v')) verbose = true; if (t.includes('I')) head = true; if (t.includes('s')) silent = true; if (t.includes('k')) insecure = true; continue; }
                if (t === '--insecure') { insecure = true; continue; }
                if (t === '--resolve') { const r = String(a[++i] || '').match(/^([^:]+):(\d+):(\d{1,3}(?:\.\d{1,3}){3})$/); if (!r) return E('curl: option --resolve: error encountered when reading a file\n# [Simülatör] Biçim: --resolve <ad>:<port>:<ip>', 'invalid'); resolve[r[1] + ':' + r[2]] = r[3]; continue; }
                if (t === '-o') { out = a[++i]; continue; } if (t === '-w') { wfmt = a[++i]; continue; } if (t === '-X') { method = (a[++i] || '').toUpperCase(); continue; }
                if (t === '-H') { hdr.push(a[++i]); continue; } if (t === '-b') { jarR = a[++i]; continue; } if (t === '-c') { jarW = a[++i]; continue; }
                if (t === '--interface') { iface = a[++i]; continue; } if (t === '-m' || t === '--max-time' || t === '--connect-timeout') { i++; continue; }
                if (/^https?:\/\//.test(t)) { url = t; continue; }
                return E('curl: option ' + t + ': is unknown\n# [Simülatör] Desteklenen: -v -I -k -s -o -w -X -H -b -c --interface -m --resolve', 'invalid');
            }
            if (!url) return E('curl: no URL specified!', 'incomplete');
            const u = url.match(/^(https?):\/\/([^/:]+)(?::(\d+))?(\/[^\s]*)?$/);
            const https = !!u && u[1] === 'https', port = u ? +(u[3] || (https ? 443 : 80)) : 0, hostN = u ? u[2] : url;
            const ip = u && (isIp(u[2]) ? u[2] : resolve[u[2] + ':' + port]);
            if (!u || !ip) return E('curl: (6) Could not resolve host: ' + hostN + '\n# [Simülatör] Bu lab\'da DNS yok: URL\'de IP adresi ya da --resolve ' + hostN + ':' + port + ':<ip> kullanın.', 'value');
            const path = u[4] || '/'; method = method || (head ? 'HEAD' : 'GET');
            const sni = isIp(hostN) ? null : hostN;
            const isVip = vipOwned(ip);
            const cookie = {}; if (jarR && JARS[jarR]) Object.assign(cookie, JARS[jarR]); hdr.forEach(h => { const m = h.match(/^Cookie:\s*([^=]+)=(\S+)/i); if (m) cookie[m[1]] = m[2]; });
            const L = [];
            let res;
            let tlsI = null, ver = null;
            if (isVip && https) { const t = viaPeer(() => vipRequest({ ip, port, path, method, src: SIM.client || '198.51.100.20', cookie, https, sni, tlsOnly: true, test: true })); if (t.kind === 'tls') { tlsI = t.tls; ver = tlsVerify(tlsI, sni || ip); } }
            if (isVip && tlsI && !ver.ok && !insecure) { res = { kind: 'tlsfail', vs: null }; if (!silent) L.push('# [Simülatör] İstek dış istemciden (' + (SIM.client || '198.51.100.20') + ') gönderildi.'); }
            else if (isVip) { res = viaPeer(() => vipRequest({ ip, port, path, method, src: SIM.client || '198.51.100.20', cookie, https, sni, host: hostN + (port === 80 || port === 443 ? '' : ':' + port), hdrs: hdr.filter(h => !/^Cookie:/i.test(h)) })); if (!silent) L.push('# [Simülatör] İstek dış istemciden (' + (SIM.client || '198.51.100.20') + ') gönderildi' + (res.vs ? '; karşılayan virtual server: /Common/' + res.vs : '') + '.'); }
            else {
                const r = reach(ip), srv = srvOf(ip);
                if (iface && !Object.values(M().selfs).some(s => s.address && s.address.split('/')[0] === iface) && !(M().mgmtIp && M().mgmtIp.split('/')[0] === iface)) return E('curl: (45) bind failed with errno 99: Cannot assign requested address', 'value');
                if (r.noroute) res = { kind: 'unreach' };
                else if (!r.ok || !srv) res = { kind: 'timeout' };
                else if (!srv.ports || !srv.ports[port]) res = { kind: 'refused' };
                else if (https && !srv.ports[port].tls) res = { kind: 'sslerr' };
                else res = { kind: 'ok', resp: serverResp(srv, port, path, method) };
            }
            if (res.notes && !silent) res.notes.forEach(n => L.push('# ' + n));
            if (isVip) { const rc = rstCauseOf(res); if (rc) rstSent(ip + ':' + port, (SIM.client || '198.51.100.20') + ':' + (52100 + S.ev.length), rc.cause, rc.peer); }
            log({ curl: { vs: res.vs || null, ip, host: hostN, https, port, path, method, vip: isVip, byF5: !!res.byF5, why: res.why || null, loc: ((res.resp && (res.resp.headers || []).find(h => /^Location:/i.test(h))) || '').replace(/^Location:\s*/i, '') || null, rhdrs: res.resp ? (res.resp.headers || []).slice() : null, body: res.resp ? String(res.resp.body || '').slice(0, 400) : null, kind: res.kind, code: res.resp ? res.resp.code : null, member: res.member || null, persisted: !!res.persisted, tlsErr: ver && !ver.ok ? ver.code : null, insecure, prof: tlsI ? tlsI.prof : null } });
            // curl 7.81 biçimi (notes/f5-tmsh-cikti-ornekleri.md §9)
            const T12 = ['* ALPN, offering h2', '* ALPN, offering http/1.1', '*  CAfile: /etc/ssl/certs/ca-certificates.crt', '*  CApath: /etc/ssl/certs', '* TLSv1.0 (OUT), TLS header, Certificate Status (22):', '* TLSv1.3 (OUT), TLS handshake, Client hello (1):', '* TLSv1.2 (IN), TLS header, Certificate Status (22):', '* TLSv1.2 (IN), TLS handshake, Server hello (2):', '* TLSv1.2 (IN), TLS handshake, Certificate (11):'];
            const T12b = ['* TLSv1.2 (IN), TLS handshake, Server key exchange (12):', '* TLSv1.2 (IN), TLS handshake, Server finished (14):', '* TLSv1.2 (OUT), TLS handshake, Client key exchange (16):', '* TLSv1.2 (OUT), TLS change cipher, Change cipher spec (1):', '* TLSv1.2 (OUT), TLS handshake, Finished (20):', '* TLSv1.2 (IN), TLS handshake, Finished (20):', '* SSL connection using TLSv1.2 / ECDHE-RSA-AES128-GCM-SHA256', '* ALPN, server accepted to use http/1.1'];
            const certBlock = () => { const c = tlsI.leaf, ic = issuerCert(c); const L2 = ['* Server certificate:', '*  subject: ' + certSubj(c), '*  start date: ' + c.nb, '*  expire date: ' + c.na]; if (ver.host) L2.push('*  subjectAltName does not match ' + (sni || ip)); else if (ver.matched) L2.push('*  subjectAltName: host "' + (sni || ip) + '" matched cert\'s "' + ver.matched + '"'); L2.push('*  issuer: ' + (c.self ? certSubj(c) : ic ? certSubj(ic) : 'C=TR; O=Lab; CN=' + c.issuer)); L2.push(ver.ok ? '*  SSL certificate verify ok.' : '*  SSL certificate verify result: ' + ver.msg.replace(/ '.*$/, '') + ' (' + ver.code + '), continuing anyway.'); return L2; };
            const TAIL = ['More details here: https://curl.se/docs/sslcerts.html', '', 'curl failed to verify the legitimacy of the server and therefore could not', 'establish a secure connection to it. To learn more about this situation and', 'how to fix it, please visit the web page mentioned above.'];
            const reqLines = () => ['* Connected to ' + hostN + ' (' + ip + ') port ' + port + ' (#0)'].concat(tlsI ? T12.concat(T12b, certBlock()) : [], ['> ' + method + ' ' + path + ' HTTP/1.1', '> Host: ' + hostN, '> User-Agent: curl/7.81.0', '> Accept: */*'], hdr.filter(h => !/^Cookie:/i.test(h)).map(h => '> ' + h), ['> ']);
            if (verbose) { Object.entries(resolve).forEach(([k, v]) => L.push('* Added ' + k + ':' + v + ' to DNS cache')); if (sni && resolve[sni + ':' + port]) L.push('* Hostname ' + sni + ' was found in DNS cache'); L.push('*   Trying ' + ip + ':' + port + '...'); }
            if (res.kind === 'tlsfail') {
                if (verbose) { L.push('* Connected to ' + hostN + ' (' + ip + ') port ' + port + ' (#0)', ...T12); if (ver.host) L.push(...T12b, ...certBlock().slice(0, -2), '* SSL: ' + ver.msg); else L.push('* TLSv1.2 (OUT), TLS alert, ' + (ver.code === 10 ? 'certificate expired (557)' : 'unknown CA (560)') + ':', '* SSL certificate problem: ' + ver.msg); L.push('* Closing connection 0'); }
                L.push('curl: (60) ' + (ver.host ? 'SSL: ' + ver.msg : 'SSL certificate problem: ' + ver.msg), ...TAIL);
                return { out: L.join('\n') };
            }
            if (res.kind !== 'ok') {
                const K = res.kind, est = isVip && (K === 'reset' || (K === 'timeout' && !['l2', 'arp', 'noaddr', 'peer-empty'].includes(res.why)));
                if (K === 'refused') { if (verbose) L.push('* connect to ' + ip + ' port ' + port + ' failed: Connection refused', '* Failed to connect to ' + ip + ' port ' + port + ' after 2 ms: Connection refused', '* Closing connection 0'); L.push('curl: (7) Failed to connect to ' + ip + ' port ' + port + ' after 2 ms: Connection refused'); }
                else if (K === 'unreach') L.push('curl: (7) Failed to connect to ' + ip + ' port ' + port + ': Network is unreachable');
                else if (K === 'sslerr') L.push('curl: (35) error:0A00010B:SSL routines::wrong version number');
                else if (K === 'reset') { if (verbose) L.push(...(est ? reqLines() : []), '* Recv failure: Connection reset by peer', '* Closing connection 0'); L.push('curl: (56) Recv failure: Connection reset by peer'); }
                else if (est) { if (verbose) L.push(...reqLines(), '* Operation timed out after 10001 milliseconds with 0 bytes received', '* Closing connection 0'); L.push('curl: (28) Operation timed out after 10001 milliseconds with 0 bytes received'); }
                else { if (verbose) L.push('* Connection timed out after 5001 milliseconds', '* Closing connection 0'); L.push('curl: (28) Connection timed out after 5001 milliseconds'); }
                return { out: L.join('\n') };
            }
            const r = res.resp, st = 'HTTP/' + (r.version || '1.1') + ' ' + r.code + ' ' + (REASON[r.code] || '');
            if (jarW) { const sc = r.headers.find(h => /^Set-Cookie:/i.test(h)); if (sc) { const m = sc.match(/^Set-Cookie:\s*([^=]+)=([^;]+)/i); JARS[jarW] = Object.assign(JARS[jarW] || {}, { [m[1]]: m[2] }); } }
            if (verbose) { L.push(...reqLines().slice(0, -1)); Object.keys(cookie).length && L.push('> Cookie: ' + Object.entries(cookie).map(([k, v]) => k + '=' + v).join('; ')); L.push('> ', '< ' + st); if (!r.noServerHdr) L.push('< Server: Apache'); r.headers.forEach(h => L.push('< ' + h)); L.push('< Content-Length: ' + r.body.length, '<'); }
            else if (head) { L.push(st); if (!r.noServerHdr) L.push('Server: Apache'); r.headers.forEach(h => L.push(h)); L.push('Content-Length: ' + r.body.length); }
            if (!head && out !== '/dev/null' && r.body) L.push(r.body);
            if (verbose) L.push('* Connection #0 to host ' + hostN + ' left intact');
            if (wfmt) L.push(wfmt.replace(/%\{http_code\}/g, String(r.code)).replace(/\\n/g, '\n').replace(/\n$/, ''));
            return { out: L.join('\n') };
        }
        // ═══ RST nedeni ve paket yakalama (tcpdump) ═══════════════════════
        // Biçimler: notes/f5-tcpdump-rst.md (K13637 trailer alanları, 01230140 log satırı, show net rst-cause). [0x…:…] kimlikleri
        // kaynak koddaki yeri gösterir ve sürümden sürüme değişir; buradakiler temsilidir.
        const RSTID = { 'No pool member available': '[0x2a0d9a4:6264]', 'No local listener': '[0x2a0b6f1:1418]', 'TCP RST from remote system': '[0x23d7a0a:2358]', 'Port denied': '[0x2a0b6f1:1476]' };
        S.rstc = Object.assign({ 'RST from BIG-IP internal Linux host': 115 }, SIM.rstCounts || {});
        const dbOn = k => ((M().db || {})[k] || {}).value === 'enable';
        const rstText = (cause, peer) => (RSTID[cause] ? RSTID[cause] + ' ' : '') + (peer ? '{peer} ' : '') + cause;
        // BIG-IP'nin kendi gönderdiği RST: sayaç + (tm.rstcause.log açıksa) /var/log/ltm satırı
        function rstSent(from, to, cause, peer) {
            S.rstc[cause] = (S.rstc[cause] || 0) + 1;
            if (dbOn('tm.rstcause.log')) S.ltmlog.push(lstamp() + ' ' + lh() + ' err tmm[14322]: 01230140:3: RST sent from ' + from + ' to ' + to + ', ' + rstText(cause, peer));
        }
        // istek sonucundan BIG-IP kaynaklı RST'nin nedeni (yalnız kaynağı doğrulanmış metinler; diğerlerinde neden yazılmaz)
        const rstCauseOf = r => r.kind === 'refused' && r.why === 'novs' ? { cause: 'No local listener' } : r.kind === 'reset' && r.why === 'nomember' ? { cause: 'No pool member available' } : r.kind === 'reset' && r.why === 'srvrefused' ? { cause: 'TCP RST from remote system', peer: true } : null;
        function showRstCause() {
            const bar = '-'.repeat(42), rows = Object.keys(S.rstc).sort();
            log({ show: 'net rst-cause' });
            return { out: [bar, 'TCP/IP Reset Cause', 'RST Cause:' + 'Count'.padStart(32), bar].concat(rows.map(k => k + String(S.rstc[k]).padStart(42 - k.length))).join('\n'), ok: true };
        }
        const PNAME = { 80: 'http', 443: 'https', 22: 'ssh', 8080: 'http-alt', 53: 'domain', 4353: 'f5-iquery' };
        const hex8 = ip => ip2n(ip).toString(16).toUpperCase().padStart(8, '0');
        const mapped = ip => ip ? '00000000:00000000:0000FFFF:' + hex8(ip) : '00000000:00000000:00000000:00000000';
        const vlanOf = ip => { const r = reach(ip); return r && r.via && r.via !== 'mgmt' && M().vlans[r.via] ? r.via : null; };
        const portOfVlan = vn => (vn && M().vlans[vn] ? Object.keys(M().vlans[vn].ifs)[0] : '') || '';
        const tagOf = vn => (vn && M().vlans[vn] ? M().vlans[vn].tag || 4094 : 0);
        let capN = 0;
        // Yakalama süresince tek bir istemci isteği üretilir (hedef: filtredeki VIP/port, yoksa ilk virtual server) ve paket listesine çevrilir
        function capPackets(target) {
            const P = [], vs = target.vs, v = M().virtuals[vs];
            const C = SIM.client || '198.51.100.20', cp = 51514 + (capN++) * 7, V = target.ip, vp = target.port;
            if (haDg() && HA.st !== 'active') return { P, why: 'standby' };
            const keep = JSON.stringify(S.rt);
            const r = vipRequest({ ip: V, port: vp, path: '/', method: 'GET', src: C, cookie: {}, https: vp === 443 });
            S.rt = JSON.parse(keep);
            if (r.kind === 'timeout' && ['noaddr', 'arp', 'peer-empty'].includes(r.why)) return { P, r, why: r.why };
            const cv = vlanOf(C); const hasHttp = !!v && v.profiles.some(x => profType(x) === 'http');
            const cf = '56000A5B' + (0x9C00 + capN * 0x40).toString(16).toUpperCase(), sf = '56000A5B' + (0x9F00 + capN * 0x40).toString(16).toUpperCase();
            const lisN = v ? '/Common/' + vs : '';
            let t = 7 * 3600 + 14 * 60 + 2, us = 118331;
            const ts = d => { us += d; while (us >= 1e6) { us -= 1e6; t++; } return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(x => String(x).padStart(2, '0')).join(':') + '.' + String(us).padStart(6, '0'); };
            let srvBorn = false, M0 = null, SS = null, sv = null;
            const cl = (d, dir, src, sp, dst, dp, fl, extra) => P.push(Object.assign({ ts: ts(d), dir, src, sp, dst, dp, fl, side: 'c', vlan: cv, port: portOfVlan(cv), lis: extra && extra.lisEmpty ? '' : lisN, flowid: extra && extra.lisEmpty ? '0' : cf, peerid: srvBorn ? sf : '0', ftype: extra && extra.lisEmpty ? 0 : 64, peer: srvBorn ? { remote: M0, local: SS, rp: vp, lp: cp, tag: tagOf(sv) } : null, proto: 'tcp' }, extra || {}));
            const sr = (d, dir, src, sp, dst, dp, fl, extra) => P.push(Object.assign({ ts: ts(d), dir, src, sp, dst, dp, fl, side: 's', vlan: sv, port: portOfVlan(sv), lis: lisN, flowid: sf, peerid: cf, ftype: 64, peer: { remote: C, local: V, rp: cp, lp: vp, tag: tagOf(cv) }, proto: 'tcp' }, extra || {}));
            const REQ = 78;
            // istemci tarafı el sıkışması
            cl(0, 'in', C, cp, V, vp, 'S', { lisEmpty: true, seq: '1482213377', win: 64240, syn: true });
            if (r.kind === 'refused' || (r.kind === 'reset' && r.why === 'vslimit')) {
                const c = rstCauseOf(r);
                cl(59, 'out', V, vp, C, cp, 'R.', Object.assign({ seq: '0', ack: '1482213378', win: 0, rst: c }, r.why === 'novs' ? { lis: '', flowid: '0', ftype: 0 } : {}));
                if (c) rstSent(V + ':' + vp, C + ':' + cp, c.cause, c.peer);
                return { P, r };
            }
            cl(59, 'out', V, vp, C, cp, 'S.', { seq: '907712554', ack: '1482213378', win: 23360, syn: true });
            cl(221, 'in', C, cp, V, vp, '.', { ack: '1', win: 502 });
            const GET = () => cl(91, 'in', C, cp, V, vp, 'P.', { seq: '1:' + (REQ + 1), ack: '1', win: 502, len: REQ, http: 'GET / HTTP/1.1' });
            if (hasHttp || r.kind !== 'ok') GET();
            if (r.kind === 'sslerr' || (r.kind === 'reset' && ['nomember', 'nopool'].includes(r.why))) {
                const c = rstCauseOf(r);
                cl(58, 'out', V, vp, C, cp, 'R.', { seq: '1', ack: String(REQ + 1), win: 0, rst: c });
                if (c) rstSent(V + ':' + vp, C + ':' + cp, c.cause, c.peer);
                return { P, r };
            }
            // sunucu tarafı: üye, çevrilmiş kaynak adres (SNAT automap: üyenin ağındaki self IP; SNAT pool; yoksa istemci)
            const pl = M().pools[v.pool], m = pl.members[r.member]; M0 = m.ip; const mp = v.tport === 'enabled' ? m.port : vp;
            const selfIn = Object.values(M().selfs).find(x => x.address && inNet(m.ip, x.address));
            SS = v.sat.type === 'automap' && selfIn ? selfIn.address.split('/')[0] : v.sat.type === 'snat' ? M().snatpools[v.sat.pool].members[0] : C;
            sv = vlanOf(m.ip) || (selfIn ? selfIn.vlan : null);
            srvBorn = true;
            if (r.kind === 'timeout' && r.why === 'l2') {
                [0, 1000000, 1000000].forEach((d, i) => P.push({ ts: ts(i ? d : 60), dir: 'out', arp: true, src: SS, dst: m.ip, side: 's', vlan: sv, port: portOfVlan(sv), lis: '', flowid: '0', peerid: '0', ftype: 0, proto: 'arp' }));
                return { P, r };
            }
            sr(58, 'out', SS, cp, m.ip, mp, 'S', { seq: '2911450012', win: 23360, syn: true });
            if (r.kind === 'timeout') {
                // yanıt BIG-IP'ye dönmüyor: SYN yeniden iletimleri (1 s, 2 s, 4 s)
                [1000000, 2000000, 4000000].forEach(d => sr(d, 'out', SS, cp, m.ip, mp, 'S', { seq: '2911450012', win: 23360, syn: true }));
                return { P, r };
            }
            if (r.kind === 'reset' && r.why === 'srvrefused') {
                sr(255, 'in', m.ip, mp, SS, cp, 'R.', { seq: '0', ack: '2911450013', win: 0 });
                const c = rstCauseOf(r);
                cl(78, 'out', V, vp, C, cp, 'R.', { seq: '1', ack: String(REQ + 1), win: 0, rst: c });
                rstSent(V + ':' + vp, C + ':' + cp, c.cause, c.peer);
                return { P, r };
            }
            sr(255, 'in', m.ip, mp, SS, cp, 'S.', { seq: '3302991777', ack: '2911450013', win: 65160, syn: true });
            sr(35, 'out', SS, cp, m.ip, mp, '.', { ack: '1', win: 46 });
            if (!hasHttp) GET();
            sr(11, 'out', SS, cp, m.ip, mp, 'P.', { seq: '1:' + (REQ + 1), ack: '1', win: 46, len: REQ, http: 'GET / HTTP/1.1' });
            const rs = r.resp, rl = 150 + rs.headers.join('').length + (rs.body || '').length, st = 'HTTP/1.1 ' + rs.code + ' ' + (REASON[rs.code] || '');
            sr(1349, 'in', m.ip, mp, SS, cp, 'P.', { seq: '1:' + (rl + 1), ack: String(REQ + 1), win: 509, len: rl, http: st });
            cl(78, 'out', V, vp, C, cp, 'P.', { seq: '1:' + (rl + 1), ack: String(REQ + 1), win: 46, len: rl, http: st });
            return { P, r };
        }
        // yönetim arayüzü (mgmt / eth0): TMM dışıdır, trailer yok. Yalnız bu SSH oturumunun paketleri görünür
        function mgmtPackets() {
            if (!M().mgmtIp) return [];
            const mi = M().mgmtIp.split('/')[0]; let us = 204511;
            const L = [[mi, 22, ADMIN, 53122, 'P.', '1:37', 36], [ADMIN, 53122, mi, 22, '.', null, 0], [mi, 22, ADMIN, 53122, 'P.', '37:137', 100], [ADMIN, 53122, mi, 22, '.', null, 0]];
            return L.map(([src, sp, dst, dp, fl, seq, len]) => { us += 173; return { ts: '07:14:02.' + String(us).padStart(6, '0'), mgmt: true, src, sp, dst, dp, fl, seq, ack: seq ? '1' : '137', win: 501, len, proto: 'tcp' }; });
        }
        // filtre ifadesi (libpcap alt kümesi): host/src/dst/net, port, tcp/udp/icmp/arp, and/or/not, parantez, tcp[tcpflags] & … != 0
        function parseFilter(expr) {
            const FL = { 'tcp-syn': 'S', 'tcp-rst': 'R', 'tcp-fin': 'F', 'tcp-push': 'P', 'tcp-ack': '.' };
            let e = expr.replace(/tcp\[\s*(?:tcpflags|13)\s*\]\s*&\s*\(?\s*([a-z|\- ]+?)\s*\)?\s*!=\s*0/g, (x, f) => ' __FLAGS:' + f.split('|').map(y => y.trim()).join(',') + ' ');
            const T0 = e.replace(/\(/g, ' ( ').replace(/\)/g, ' ) ').replace(/&&/g, ' and ').replace(/\|\|/g, ' or ').replace(/!(?!=)/g, ' not ').split(/\s+/).filter(Boolean);
            let i = 0; const peek = () => T0[i], next = () => T0[i++];
            const fail = () => { throw new Error('syntax'); };
            const isIpW = w => w && isIp(w);
            function prim() {
                const w = next(); if (w === undefined) fail();
                if (w === '(') { const x = orE(); if (next() !== ')') fail(); return x; }
                if (w === 'not') { const x = prim(); return p => !x(p); }
                if (/^__FLAGS:/.test(w)) { const fs = w.slice(8).split(','); if (fs.some(f => !FL[f])) fail(); return p => p.proto === 'tcp' && fs.some(f => FL[f] === '.' ? /\./.test(p.fl) : p.fl.includes(FL[f])); }
                if (['tcp', 'udp', 'icmp', 'arp', 'ip'].includes(w)) { if (['host', 'port', 'src', 'dst', 'net'].includes(peek()) && w !== 'ip') { const x = prim(); return p => (w === p.proto) && x(p); } return p => w === 'ip' ? p.proto !== 'arp' : p.proto === w; }
                let dir = null, word = w; if (w === 'src' || w === 'dst') { dir = w; word = peek() === 'host' || peek() === 'port' || peek() === 'net' ? next() : 'host'; }
                if (word === 'host') { const h = next(); if (!isIpW(h)) fail(); return p => (dir !== 'dst' && p.src === h) || (dir !== 'src' && p.dst === h); }
                if (word === 'net') { const n = next(); if (!n || !cidr(n)) fail(); return p => (dir !== 'dst' && inNet(p.src, n)) || (dir !== 'src' && inNet(p.dst, n)); }
                if (word === 'port') { const pt = next(); const n = /^\d+$/.test(pt || '') ? +pt : +(Object.keys(PNAME).find(k => PNAME[k] === pt) || NaN); if (!n) fail(); return p => p.proto === 'tcp' && ((dir !== 'dst' && p.sp === n) || (dir !== 'src' && p.dp === n)); }
                if (isIpW(word) && !dir) fail();
                fail();
            }
            function andE() { let x = prim(); while (peek() === 'and') { next(); const a = x, b = prim(); x = p => a(p) && b(p); } return x; }
            function orE() { let x = andE(); while (peek() === 'or') { next(); const a = x, b = andE(); x = p => a(p) || b(p); } return x; }
            if (!T0.length) return { fn: () => true, hosts: [], ports: [] };
            try { const fn = orE(); if (i < T0.length) fail(); return { fn, hosts: T0.filter(isIpW), ports: T0.filter((w, k) => T0[k - 1] === 'port').map(Number).filter(Boolean) }; } catch (x) { return null; }
        }
        function fmtPkt(p, o) {
            const pn = n => (o.nn || !PNAME[n] ? String(n) : PNAME[n]);
            let body;
            if (p.arp) body = 'ARP, Request who-has ' + p.dst + ' tell ' + p.src + ', length 28';
            else {
                const pay = p.rst && o.pkt ? rstText(p.rst.cause, p.rst.peer).length : (p.len || 0);
                const opt = p.syn ? ', options [mss 1460,sackOK,TS val 3051118 ecr ' + (p.fl === 'S' ? '0' : '3051118') + ',nop,wscale 7]' : p.fl === 'R.' ? '' : ', options [nop,nop,TS val 3051118 ecr 1210381]';
                body = 'IP ' + p.src + '.' + pn(p.sp) + ' > ' + p.dst + '.' + pn(p.dp) + ': Flags [' + p.fl + ']' + (p.seq ? ', seq ' + p.seq : '') + (p.ack ? ', ack ' + p.ack : '') + ', win ' + p.win + opt + ', length ' + pay + (p.http ? ': HTTP: ' + p.http : '');
                if (o.v) body = 'IP (tos 0x0, ttl 64, id ' + (41000 + (ip2n(p.src) % 997)) + ', offset 0, flags [DF], proto TCP (6), length ' + (52 + pay + (p.syn ? 8 : 0)) + ')\n    ' + body.slice(3);
            }
            let tr = '';
            if (o.trailer && !p.mgmt) {
                tr = ' ' + p.dir + ' slot1/tmm0 lis=' + p.lis + ' port=' + p.port + ' trunk=';
                if (o.lvl >= 2) {
                    const z = p.flowid === '0';
                    tr += ' flowtype=' + p.ftype + ' flowid=' + p.flowid + ' peerid=' + p.peerid + ' conflags=' + (z ? '0' : p.peerid !== '0' ? '100200004000024' : '4000024') + ' inslot=19 inport=23 haunit=' + (z ? 0 : 1) + ' priority=3';
                    if (p.rst) tr += ' rst_cause="' + rstText(p.rst.cause, p.rst.peer) + '"';
                }
                if (o.lvl >= 3) { const q = p.peer; tr += ' peerremote=' + mapped(q && q.remote) + ' peerlocal=' + mapped(q && q.local) + ' remoteport=' + (q ? q.rp : 0) + ' localport=' + (q ? q.lp : 0) + ' proto=' + (q ? 6 : 0) + ' vlan=' + (q ? q.tag : 0); }
            }
            let out = p.ts + ' ' + body + tr;
            if (o.A) { if (p.rst && o.pkt) out += '\n' + rstText(p.rst.cause, p.rst.peer); else if (p.http && /^GET/.test(p.http)) out += '\nGET / HTTP/1.1\nHost: ' + (p.side === 's' ? p.dst : p.dst) + '\nUser-Agent: curl/7.81.0\nAccept: */*'; else if (p.http) out += '\n' + p.http + '\nServer: Apache'; }
            return out;
        }
        S.pcaps = {};
        function tcpdump(a) {
            const o = { n: 0, c: null, s: null, w: null, r: null, i: null, v: false, A: false };
            const rest = [];
            for (let k = 1; k < a.length; k++) {
                const t = a[k];
                if (!/^-/.test(t) || rest.length) { rest.push(t); continue; }
                const cl = t.slice(1);
                for (let j = 0; j < cl.length; j++) {
                    const ch = cl[j];
                    if (ch === 'n') { o.n++; continue; } if (ch === 'v') { o.v = true; continue; } if (ch === 'A') { o.A = true; continue; } if (ch === 'p') continue;
                    if ('icswr'.includes(ch)) { let val = cl.slice(j + 1); if (!val) val = a[++k]; if (val === undefined) return E('tcpdump: option requires an argument -- \'' + ch + '\'', 'incomplete'); o[ch] = val; break; }
                    if (ch === 'X' || ch === 'e') return E('# [Simülatör] -' + ch + ' bu lab\'da desteklenmiyor; paket içeriği için -A kullanın.', 'unsupported');
                    return E('tcpdump: invalid option -- \'' + ch + '\'', 'invalid');
                }
            }
            if (o.c !== null && !/^\d+$/.test(o.c)) return E('tcpdump: invalid packet count ' + o.c, 'value');
            if (o.s !== null && !/^\d+$/.test(o.s)) return E('tcpdump: invalid snaplen ' + o.s, 'value');
            const flt = parseFilter(rest.join(' '));
            if (!flt) return E('tcpdump: can\'t parse filter expression: syntax error', 'invalid');
            const nn = o.n >= 2, snap = o.s === null || +o.s === 0 ? 65535 : +o.s;
            const opt = { nn, v: o.v, A: o.A, pkt: dbOn('tm.rstcause.pkt') };
            // dosyadan okuma
            if (o.r !== null) {
                if (o.i !== null) return E('# [Simülatör] -r ile -i birlikte kullanılmaz.', 'invalid');
                const f = S.pcaps[o.r]; if (!f) return E('tcpdump: ' + o.r + ': No such file or directory', 'value');
                const sel = f.P.filter(p => flt.fn(p)).slice(0, o.c !== null ? +o.c : undefined);
                log({ tcpdump: { read: o.r, filter: rest.join(' '), n: sel.length, peerSeen: sel.some(p => p.side === 's'), rst: sel.some(p => p.rst) } });
                return { out: ['reading from file ' + o.r + ', link-type EN10MB (Ethernet)'].concat(sel.map(p => fmtPkt(p, Object.assign({}, opt, f.o)))).join('\n') };
            }
            const I = o.i === null ? '0.0' : o.i;
            const mm = I.match(/^([^:]+)(?::(n{1,3})(p?))?$/) || I.match(/^([^:]+):(p)$/);
            if (!mm) return E('tcpdump: ' + I + ': No such device exists\n(SIOCGIFHWADDR: No such device)', 'value');
            const dev = mm[1], lvl = mm[2] ? mm[2].length : 0, peerMod = mm[3] === 'p' || mm[2] === 'p';
            const isMgmt = dev === 'mgmt' || dev === 'eth0', isAll = dev === '0.0' || dev === 'any', isVlan = !!M().vlans[dev], isPhys = IFS.includes(dev);
            if (!isMgmt && !isAll && !isVlan && !isPhys) return E('tcpdump: ' + dev + ': No such device exists\n(SIOCGIFHWADDR: No such device)\n# [Simülatör] Arayüzler: 0.0 (tüm TMM arayüzleri), VLAN adları (' + (Object.keys(M().vlans).join(', ') || 'yok') + '), fiziksel arayüzler, mgmt.', 'value');
            if (isMgmt && (lvl || peerMod)) return E('tcpdump: ' + I + ': No such device exists\n(SIOCGIFHWADDR: No such device)\n# [Simülatör] Gürültü (:n…) ve :p yalnız TMM arayüzlerinde (0.0, VLAN) anlamlıdır; mgmt Linux arayüzüdür.', 'value');
            opt.trailer = !isMgmt && !isPhys && snap >= 65535 && (isAll || lvl > 0); opt.lvl = Math.max(lvl, 1);
            // hedef: filtrede bir VIP varsa o (porta göre), yoksa ilk etkin virtual server
            let P = [], note = '', res = null;
            if (isMgmt) P = mgmtPackets();
            else {
                const VS = Object.entries(M().virtuals);
                const hostVip = flt.hosts.find(h => VS.some(([, v]) => v.dest.split(':')[0] === h));
                let tgt = null;
                if (SIM.capture) tgt = SIM.capture;
                else if (hostVip) { const port = flt.ports[0] || +(VS.find(([, v]) => v.dest.split(':')[0] === hostVip)[1].dest.split(':')[1]); const e2 = VS.find(([, v]) => v.dest === hostVip + ':' + port); tgt = { ip: hostVip, port, vs: e2 ? e2[0] : null }; }
                else { const e2 = VS.find(([, v]) => v.enabled && (!flt.ports.length || flt.ports.includes(+v.dest.split(':')[1]))) || VS.find(([, v]) => v.enabled) || VS[0]; if (e2) tgt = { ip: e2[1].dest.split(':')[0], port: +e2[1].dest.split(':')[1], vs: e2[0] }; }
                if (tgt && !tgt.vs) { const e2 = VS.find(([, v]) => v.dest === tgt.ip + ':' + tgt.port); tgt.vs = e2 ? e2[0] : null; }
                if (tgt) {
                    const cap = capPackets(tgt); P = cap.P; res = cap.r;
                    note = '# [Simülatör] Yakalama sırasında istemci ' + (SIM.client || '198.51.100.20') + ', ' + (tgt.port === 443 ? 'https' : 'http') + '://' + tgt.ip + (tgt.port === 80 || tgt.port === 443 ? '' : ':' + tgt.port) + '/ adresine bir istek gönderdi.';
                    if (cap.why === 'standby') note += '\n# [Simülatör] Bu cihaz aktif değil: istemci trafiği aktif eşten geçiyor, burada görünmez.';
                    else if (!P.length) note += '\n# [Simülatör] BIG-IP\'ye hiç paket ulaşmadı: VIP adresi bu cihazda yok ya da ARP yanıtlanmıyor.';
                }
                if (isVlan) P = P.filter(p => p.vlan === dev); else if (isPhys) P = P.filter(p => p.port === dev);
            }
            let sel;
            if (peerMod) { const hit = P.some(p => flt.fn(p)); sel = hit ? P : []; } else sel = P.filter(p => flt.fn(p));
            if (o.c !== null) sel = sel.slice(0, +o.c);
            const devS = I, hdr = (o.v || o.w !== null ? 'tcpdump: listening on ' : 'tcpdump: verbose output suppressed, use -v or -vv for full protocol decode\nlistening on ') + devS + ', link-type EN10MB (Ethernet), capture size ' + snap + ' bytes';
            const stopped = !(o.c !== null && sel.length >= +o.c), pl = n => n + ' packet' + (n === 1 ? '' : 's');
            const foot = [stopped ? '^C' : null, pl(sel.length) + ' captured', pl(sel.length) + ' received by filter', '0 packets dropped by kernel'].filter(x => x !== null);
            log({ tcpdump: { iface: dev, lvl, peer: peerMod, trailer: opt.trailer, filter: rest.join(' '), n: sel.length, write: o.w, kind: res ? res.kind : null, why: res ? res.why || null : null, peerSeen: sel.some(p => p.side === 's'), rst: sel.some(p => p.rst), rstPkt: opt.pkt && sel.some(p => p.rst) } });
            if (o.w !== null) {
                S.pcaps[o.w] = { P: sel, o: { trailer: opt.trailer, lvl: opt.lvl } };
                const m2 = o.w.match(/^\/var\/tmp\/([^/]+)$/); if (m2 && !S.tmp.includes(m2[1])) S.tmp.push(m2[1]);
                return { out: [hdr, note].filter(Boolean).concat(foot).join('\n') };
            }
            return { out: [hdr, note].filter(Boolean).concat(sel.map(p => fmtPkt(p, opt)), foot).join('\n') + (stopped ? '\n# [Simülatör] Yakalama Ctrl+C ile durduruldu.' : '') };
        }
        // openssl s_client: VIP'in sunduğu sertifika zinciri (OpenSSL 3.0 biçimi; notes/f5-ssl-arastirma.md §5)
        function opensslCmd(a) {
            if (a[1] !== 's_client') return E('# [Simülatör] Bu lab\'da yalnız "openssl s_client -connect <ip>:443 -servername <ad> [-showcerts]" desteklenir.', 'unsupported');
            const ci = a.indexOf('-connect'), si = a.indexOf('-servername'), tgt = ci > 0 ? a[ci + 1] : null, sn = si > 0 ? a[si + 1] : null;
            const m = String(tgt || '').match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/); if (!m) return E('s_client: -connect requires host:port\n# [Simülatör] ör. openssl s_client -connect 203.0.113.100:443 -servername app.lab.example', 'incomplete');
            const ip = m[1], port = +m[2];
            const t = vipOwned(ip) ? viaPeer(() => vipRequest({ ip, port, path: '/', method: 'GET', src: SIM.client || '198.51.100.20', cookie: {}, https: true, sni: sn, tlsOnly: true, test: true })) : { kind: 'noaddr' };
            log({ openssl: { ip, port, sni: sn, kind: t.kind, prof: t.tls ? t.tls.prof : null, chain: t.tls ? t.tls.chain.length : null } });
            if (t.kind === 'refused' || t.kind === 'reset') return { out: 'connect:errno=111\n# [Simülatör] Bağlantı reddedildi.' };
            if (t.kind === 'sslerr') return { out: 'CONNECTED(00000003)\n' + '4077F6A1B87F0000:error:0A00010B:SSL routines:ssl3_get_record:wrong version number:../ssl/record/ssl3_record.c:354:\n---\nno peer certificate available\n---\n# [Simülatör] Bu virtual server\'da client-ssl profili yok; karşı taraf TLS konuşmuyor.' };
            if (t.kind !== 'tls') return { out: '# [Simülatör] ' + ip + ':' + port + ' yanıt vermedi (bağlantı zaman aşımı).' };
            const T = t.tls, v = tlsVerify(T, sn || '__nohost__'), vcode = v.ok || v.host ? 0 : v.code;
            const L = ['CONNECTED(00000003)'];
            if (vcode === 20 || vcode === 21) L.push('depth=0 ' + certSubjSsl(T.leaf), 'verify error:num=20:unable to get local issuer certificate', 'verify return:1', 'depth=0 ' + certSubjSsl(T.leaf), 'verify error:num=21:unable to verify the first certificate', 'verify return:1');
            else if (vcode === 18) L.push('depth=0 ' + certSubjSsl(T.leaf), 'verify error:num=18:self-signed certificate', 'verify return:1', 'depth=0 ' + certSubjSsl(T.leaf), 'verify return:1');
            else if (vcode === 10) L.push('depth=0 ' + certSubjSsl(T.leaf), 'verify error:num=10:certificate has expired', 'notAfter=' + T.leaf.na, 'verify return:1');
            else { const path = [T.leaf].concat(T.chain); const root = { cn: (SIM.trust || ['Lab Root CA'])[0], ca: true }; [root].concat(path.slice().reverse()).forEach((c, i, arr) => L.push('depth=' + (arr.length - 1 - i) + ' ' + certSubjSsl(c), 'verify return:1')); }
            L.push('---', 'Certificate chain');
            T.presented.forEach((c, i) => { const ic = c.self ? c : (issuerCert(c) || { cn: c.issuer, ca: true }); L.push(' ' + i + ' s:' + certSubjSsl(c), '   i:' + certSubjSsl(ic), '   a:PKEY: rsaEncryption, ' + (c.bits || 2048) + ' (bit); sigalg: RSA-SHA256', '   v:NotBefore: ' + c.nb + '; NotAfter: ' + c.na); if (a.includes('-showcerts')) L.push('-----BEGIN CERTIFICATE-----', 'MIID…(kısaltıldı)', '-----END CERTIFICATE-----'); });
            L.push('---', 'Server certificate', '-----BEGIN CERTIFICATE-----', 'MIID…(kısaltıldı)', '-----END CERTIFICATE-----', 'subject=' + certSubjSsl(T.leaf), 'issuer=' + certSubjSsl(T.leaf.self ? T.leaf : (issuerCert(T.leaf) || { cn: T.leaf.issuer, ca: true })), '---', 'No client certificate CA names sent', '---',
                'SSL handshake has read ' + (1400 + 1100 * T.presented.length) + ' bytes and written 405 bytes', vcode ? 'Verification error: ' + (vcode === 20 || vcode === 21 ? 'unable to verify the first certificate' : v.msg) : 'Verification: OK', '---', 'New, TLSv1.2, Cipher is ECDHE-RSA-AES128-GCM-SHA256', 'Server public key is 2048 bit', 'Secure Renegotiation IS supported', 'Compression: NONE', 'Expansion: NONE', 'No ALPN negotiated', 'SSL-Session:', '    Protocol  : TLSv1.2', '    Cipher    : ECDHE-RSA-AES128-GCM-SHA256',
                '    Verify return code: ' + (vcode === 20 || vcode === 21 ? '21 (unable to verify the first certificate)' : vcode ? vcode + ' (' + v.msg + ')' : '0 (ok)'), '---', '# [Simülatör] Bağlantı kapatıldı (gerçekte s_client girdi bekler; "echo | openssl s_client …" ya da Ctrl+C).');
            return { out: L.join('\n') };
        }
        function bashCmd(a, line, nested) {
            const c = a[0];
            if (c === 'tmsh') {
                if (a.length === 1) { if (nested) return E('# [Simülatör] İç içe tmsh açılamaz.', 'invalid'); S.mode = 'tmsh'; return { out: '', log: { enter: 'tmsh' } }; }
                const sub = line.replace(/^\s*tmsh\s+/, '');
                const o = run(sub, true);
                if (o && o.err) return o;
                return { out: typeof o === 'string' ? o : o.out, log: { tmshOne: sub } };
            }
            if (c === 'exit' || c === 'logout') { if (S.fromTmsh) { S.fromTmsh = false; S.mode = 'tmsh'; return ''; } S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.'; }
            if (c === 'hostname') return M().hostname;
            if (c === 'reboot') return doReboot();
            if (c === 'ifconfig' || (c === 'ip' && a[1] === 'addr')) {
                const dev = c === 'ifconfig' ? a[1] : a[3];
                if (dev && dev !== 'mgmt') return E(dev + ': error fetching interface information: Device not found\n# [Simülatör] Bu lab\'da Linux tarafında yalnız "mgmt" arayüzü gösterilir; veri arayüzleri için tmsh show net interface.', 'value');
                const ip = M().mgmtIp ? cidr(M().mgmtIp) : null;
                if (c === 'ifconfig') return ['mgmt: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500', ip ? '        inet ' + ip.ip + '  netmask ' + maskOf(ip.len) + '  broadcast ' + n2ip(netOf(ip.ip, ip.len) + 2 ** (32 - ip.len) - 1) : '        # [Simülatör] IPv4 adresi yok (sys management-ip tanımlı değil)', '        ether 00:50:56:8a:1c:01  txqueuelen 1000  (Ethernet)', '        RX packets 51213  bytes 7120334 (6.7 MiB)', '        TX packets 40211  bytes 9912010 (9.4 MiB)'].join('\n');
                return ['2: mgmt: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc mq state UP group default qlen 1000', '    link/ether 00:50:56:8a:1c:01 brd ff:ff:ff:ff:ff:ff', ip ? '    inet ' + ip.ip + '/' + ip.len + ' brd ' + n2ip(netOf(ip.ip, ip.len) + 2 ** (32 - ip.len) - 1) + ' scope global mgmt' : '    # [Simülatör] IPv4 adresi yok'].join('\n');
            }
            if (c === 'ping') return ping(a);
            if (c === 'curl') return curl(a);
            if (c === 'cat' || c === 'tail' || c === 'less' || c === 'head') {
                const f = a.filter(x => !/^-/.test(x) && !/^\d+$/.test(x)).slice(1)[0];
                if (!f) return E(c + ': missing operand', 'incomplete');
                const F = FILES();
                if (!(f in F)) return E(c + ': ' + f + ': No such file or directory', 'value');
                let txt = F[f];
                if (c === 'tail') { const n = +((a.find((x, i) => a[i - 1] === '-n')) || 10); txt = txt.split('\n').slice(-n).join('\n'); if (a.includes('-f')) txt += (txt ? '\n' : '') + '^C\n# [Simülatör] tail -f canlı akışı Ctrl+C ile durduruldu.'; }
                return { out: txt || '', log: { file: f, follow: a.includes('-f') } };
            }
            if (c === 'grep') { const g = grepF(a, ''); if (!g || !g.file) return E('Usage: grep [OPTION]... PATTERNS [FILE]...', 'incomplete'); const F = FILES(); if (!(g.file in F)) return E('grep: ' + g.file + ': No such file or directory', 'value'); return { out: grepF(a.slice(0, -1), F[g.file]).text, log: { file: g.file, grep: true } }; }
            if (c === 'ls') { const d = (a.filter(x => !/^-/.test(x))[1] || '/config').replace(/\/$/, ''); if (!(d in DIRS())) return E('ls: cannot access \'' + d + '\': No such file or directory', 'value'); const L = DIRS()[d]; return a.includes('-l') || a.includes('-lh') ? L.map(n => '-rw-r--r--. 1 root root ' + (/\.iso$/.test(n) ? '2.4G' : '12K') + ' Sep 24 09:12 ' + n).join('\n') : L.join('  '); }
            if (c === 'date') return 'Thu Sep 24 10:21:07 PDT 2026';
            if (c === 'qkview') {
                if (a.slice(1).some(x => !['-s0', '-c', '-f'].includes(x) && !/^\S+\.qkview$/.test(x))) return E('# [Simülatör] Bu lab\'da qkview için -s0 ve -c seçenekleri desteklenir.', 'unsupported');
                const f = '/var/tmp/' + short() + '.qkview'; if (!S.tmp.includes(short() + '.qkview')) S.tmp.push(short() + '.qkview');
                return { out: 'Gathering System Diagnostics: Please wait ...\nDiagnostic information has been saved in:\n' + f + '\nPlease send this file to F5 support.\n# [Simülatör] Çıktı yaklaşık; gerçekte birkaç dakika sürer. Dosya iHealth\'e (ihealth.f5.com) yüklenerek incelenir.', log: { qkview: f } };
            }
            if (c === 'df') {
                const u = SIM.sharedUse || 38;
                return { out: ['Filesystem                                Size  Used Avail Use% Mounted on', '/dev/mapper/vg--db--vda-set.1.root      440M  297M  121M  72% /', '/dev/mapper/vg--db--vda-set.1._var      3.0G  1.1G  1.8G  38% /var', '/dev/mapper/vg--db--vda-dat.share        30G  ' + Math.round(30 * u / 100) + 'G   ' + Math.round(30 * (100 - u) / 100) + 'G  ' + u + '% /shared', '/dev/mapper/vg--db--vda-dat.log.1        3.0G  612M  2.2G  22% /var/log', '# [Simülatör] Aygıt adları temsilidir.'].join('\n'), log: { df: true } };
            }
            if (c === 'md5sum') {
                const f = a.includes('-c') ? a[a.indexOf('-c') + 1] : a[1]; if (!f) return E('md5sum: missing operand', 'incomplete');
                const iso = f.replace(/^\/shared\/images\//, '').replace(/\.md5$/, '');
                if (!S.images.includes(iso) || (a.includes('-c') && !S.images.includes(iso + '.md5'))) return E('md5sum: ' + f + ': No such file or directory', 'value');
                const okm = !(SIM.badIso || []).includes(iso);
                return { out: a.includes('-c') ? iso + ': ' + (okm ? 'OK' : 'FAILED') + (okm ? '' : '\nmd5sum: WARNING: 1 computed checksum did NOT match') : '3f9c2d6a8e0b4a1c9d7e5f2b6a8c0e14  /shared/images/' + iso, log: { md5: iso, ok: okm } };
            }
            if (c === 'tcpdump') return tcpdump(a);
            if (c === 'openssl') return opensslCmd(a);
            if (['bigstart', 'netstat', 'ssldump', 'cpcfg', 'switchboot', 'config', 'top', 'ssh', 'scp'].includes(c)) return E('# [Simülatör] "' + c + '" gerçek BIG-IP\'de var ama bu lab sürümünde henüz desteklenmiyor.', 'unsupported');
            if (['list', 'show', 'create', 'modify', 'delete', 'save', 'load'].includes(c)) return E('-bash: ' + c + ': command not found\n# [Simülatör] Bu bir tmsh komutu. Önce "tmsh" yazın ya da tek komut için: tmsh ' + line, 'wrongmode');
            return E('-bash: ' + c + ': command not found', 'invalid');
        }
        // ping: self IP ağı → VLAN → üye arayüz → switch portu (access/trunk) → hedef aynı VLAN'da mı
        function wireVlan(ifn, md, tag) {
            const sw = (SIM.sw || {})[ifn]; if (!sw) return tag;   // switch modeli yoksa uyumlu varsay
            if (sw.mode === 'access') return md === 'untagged' ? sw.vlan : null;         // access port etiketli çerçeveyi atar
            if (md === 'tagged') return (sw.vlans || []).includes(tag) ? tag : null;
            return sw.native || 1;
        }
        function reach(ip) {
            // yönetim ağı
            if (M().mgmtIp && inNet(ip, M().mgmtIp)) return { via: 'mgmt', ok: (SIM.mgmtHosts || []).includes(ip) };
            const conn = Object.entries(M().selfs).find(([, s]) => s.address && inNet(ip, s.address));
            const hostVlan = h => (SIM.hosts || []).find(x => x.ip === h);
            const onVlan = (vn, h) => { const v = M().vlans[vn]; if (!v) return false; const hv = hostVlan(h); if (!hv) return false; return Object.entries(v.ifs).some(([i, md]) => linkUp(i) && wireVlan(i, md, v.tag) === hv.vlan); };
            if (conn) { if (Object.values(M().selfs).some(s => s.address && s.address.split('/')[0] === ip)) return { self: true, ok: true }; const vn = conn[1].vlan; const ok = onVlan(vn, ip); S.rt.arp[ip] = { vlan: vn, ok, mac: '00:50:56:8a:' + (ip2n(ip) % 200 + 16).toString(16) + ':42' }; return { via: vn, ok }; }
            // statik rota (en uzun önek)
            let best = null; Object.values(M().routes).forEach(r => { const len = r.network === 'default' ? 0 : cidr(r.network).len; if (inNet(ip, r.network === 'default' ? '0.0.0.0/0' : r.network) && (!best || len > best.len)) best = { r, len }; });
            if (M().mgmtIp && !best) { const mr = Object.values(M().mgmtRoutes).find(r => r.network === 'default' || inNet(ip, r.network)); if (mr) return { via: 'mgmt', ok: (SIM.mgmtRemote || []).some(c => inNet(ip, c)) && (SIM.mgmtHosts || []).includes(mr.gateway) }; }
            if (!best) return { noroute: true };
            const gs = Object.entries(M().selfs).find(([, s]) => s.address && inNet(best.r.gw, s.address)); if (!gs) return { noroute: true };
            const gok = onVlan(gs[1].vlan, best.r.gw); S.rt.arp[best.r.gw] = { vlan: gs[1].vlan, ok: gok, mac: '00:50:56:8a:77:01' };
            return { via: gs[1].vlan, ok: gok && (SIM.remote || []).some(c => inNet(ip, c)) };
        }
        function ping(a) {
            const ip = a.slice(1).find(x => isIp(x)); if (!ip) return E('ping: usage error: Destination address required', 'incomplete');
            const cnt = +(a[a.indexOf('-c') + 1] || 4) || 4;
            const r = reach(ip); const L = ['PING ' + ip + ' (' + ip + ') 56(84) bytes of data.'];
            if (r.noroute) { log({ ping: ip, ok: false }); return 'connect: Network is unreachable'; }
            if (r.ok) for (let i = 1; i <= Math.min(cnt, 5); i++) L.push('64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=64 time=0.' + (300 + i * 41) + ' ms');
            L.push('', '--- ' + ip + ' ping statistics ---', cnt + ' packets transmitted, ' + (r.ok ? cnt : 0) + ' received, ' + (r.ok ? '0' : '100') + '% packet loss, time ' + (cnt * 1000 - 1) + 'ms');
            log({ ping: ip, ok: r.ok, via: r.via });
            return L.join('\n');
        }

        // ═══ giriş / istem / yardım ════════════════════════════════════
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; return p.fn(raw.trim()); }
            if (S.loggedOut) { S.loggedOut = false; S.mode = 'bash'; return lab.loginBanner || 'Last login: Thu Sep 24 10:02:11 2026 from ' + ADMIN; }
            let line = raw.trim(); if (!line && !S.cont) return '';
            // çok satırlı iRule: süslü parantezler kapanana kadar satırlar birleştirilir
            if (S.cont) { S.cont.buf += '\n' + raw.replace(/\s+$/, ''); if (braceDepth(S.cont.buf) > 0) return ''; line = S.cont.buf.trim(); S.cont = null; }
            else if (/^(tmsh\s+)?(create|modify)\s+\/?ltm\s+rule\b/.test(line) && braceDepth(line) > 0) { S.cont = { buf: raw.replace(/\s+$/, '') }; return ''; }
            S.hist.push(line);
            const mode = S.mode;
            const r = mode === 'tmsh' ? run(line.replace(/^tmsh\s+/, ''), false) : bashLine(line, false);
            const canon = (mode === 'tmsh' ? 'tmsh ' : '') + line.replace(/\s+/g, ' ');
            if (r && r.err) { log({ raw: line, err: r.err, mode }); return r.msg; }
            const out = typeof r === 'string' ? r : (r ? r.out : '');
            log(Object.assign({ raw: line, canon, mode }, (r && r.log) || {}));
            warnAccess(line); ltmTick(false);
            { const g = haDg(); if (g && g[1].autoSync === 'enabled' && HA.syncKey !== null && haLink().ok && HA.syncKey !== syncKey(M()) && HA.st === 'active') { HA.syncKey = syncKey(M()); HA.peerCfg = clone(M()); } }
            return (out || '') + (S.warn ? (out ? '\n' : '') + S.warn : '');
        }
        // süslü parantez derinliği (tırnak ve \ kaçışları dikkate alınır)
        function braceDepth(t) { let d = 0, q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '\\') { i++; continue; } if (c === '"' && d === 0) q = !q; else if (!q && c === '{') d++; else if (!q && c === '}') d--; } return d; }
        // yönetim erişimini kendine kapatma uyarısı (gerçek cihaz uyarmaz; bağlantı kopar)
        function warnAccess() {
            S.warn = '';
            const sshOk = allowHas(M().sshd.allow, ADMIN), guiOk = allowHas(M().httpd.allow, ADMIN);
            const was = S.rt.acc || { ssh: true, gui: true };
            if (!sshOk && was.ssh) { S.warn += '# [Simülatör] UYARI: Bağlandığınız adres (' + ADMIN + ') artık sshd allow listesinde yok. Bu oturum kapanınca SSH ile giremezsiniz; yalnız konsol kalır.\n'; log({ warn: 'ssh-lockout' }); }
            if (!guiOk && was.gui) { S.warn += '# [Simülatör] UYARI: Yönetim istasyonunuz (' + ADMIN + ') httpd allow listesinde değil: Configuration utility (GUI) artık açılmaz.\n'; log({ warn: 'gui-lockout' }); }
            S.rt.acc = { ssh: sshOk, gui: guiOk };
            S.warn = S.warn.trim();
        }
        function prompt() {
            if (S.cont) return '> ';
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            const st = haPromptSt(), ss = syncStatus().status;
            return S.mode === 'tmsh' ? 'root@(' + short() + ')(cfg-sync ' + ss + ')(' + st + ')(/Common)(tmos)# ' : '[root@' + short() + ':' + st + ':' + ss + '] config # ';
        }
        // ? yardımı: tmsh'te bulunulan noktadaki seçenekler
        function help(raw) {
            log({ help: raw });
            if (S.mode !== 'tmsh') return '# [Simülatör] bash\'te ? yardımı yoktur. tmsh\'e geçin ("tmsh") ya da komutun --help seçeneğine bakın.';
            const w = raw.trim().split(/\s+/).filter(Boolean), end = /\s$/.test(raw) || !raw.trim();
            const opts = end ? nextWords(w) : nextWords(w.slice(0, -1)).filter(x => x.startsWith(w[w.length - 1] || ''));
            return opts.length ? opts.map(x => '  ' + x).join('\n') : '# [Simülatör] Bu noktada önerilecek sözcük yok.';
        }
        function nextWords(w) {
            const V = ['create', 'delete', 'list', 'modify', 'show', 'save', 'load', 'run', 'quit'];
            if (!w.length) return V;
            const verb = w[0];
            if (!V.includes(verb)) return [];
            if (verb === 'save' || verb === 'load') return w.length === 1 ? ['sys'] : w.length === 2 ? ['config'] : verb === 'load' ? ['verify', 'partitions'] : ['partitions'];
            if (verb === 'run') return w.length === 1 ? ['util'] : w.length === 2 ? ['bash', 'ping'] : [];
            const types = TYPES.filter(k => !(verb === 'create' && (T[k].single || T[k].fixed)) && !(verb === 'delete' && (T[k].single || T[k].fixed)));
            if (w.length === 1) return [...new Set(types.map(k => k.split(' ')[0]).concat(verb === 'show' ? ['net', 'sys', 'cm'] : []))];
            if (w.length === 2) return [...new Set(types.filter(k => k.startsWith(w[1] + ' ')).map(k => k.split(' ')[1]).concat(verb === 'show' ? (w[1] === 'net' ? ['interface', 'vlan', 'route', 'arp', 'rst-cause'] : w[1] === 'sys' ? ['software', 'version', 'license', 'provision', 'failover'] : w[1] === 'cm' ? ['sync-status'] : w[1] === 'ltm' ? ['virtual', 'pool', 'node', 'persistence'] : []) : []))];
            if (w.length === 3 && !T[w[1] + ' ' + w[2]]) return [...new Set(types.filter(k => k.startsWith(w[1] + ' ' + w[2] + ' ')).map(k => k.split(' ')[2]))];
            const k3 = T[w[1] + ' ' + w[2] + ' ' + w[3]] ? w[1] + ' ' + w[2] + ' ' + w[3] : null, key = k3 || w[1] + ' ' + w[2], t = T[key]; if (!t) return [];
            if (k3) w = w.slice(0, 3).concat(w.slice(4));
            if (w.length === 3 && t.named) return Object.keys(t.coll()).concat(verb === 'create' ? ['<ad>'] : []);
            if (verb === 'list' || verb === 'show') return ['one-line', 'all-properties'];
            return t.props || [];
        }
        function complete(raw) {
            if (S.mode !== 'tmsh') { const m = raw.match(/^(\S*)$/); if (!m) return null; const hits = ['tmsh', 'ifconfig', 'ping', 'tail', 'cat', 'grep', 'ls', 'exit'].filter(x => x.startsWith(m[1])); return hits.length === 1 ? hits[0] + ' ' : null; }
            const w = raw.split(/\s+/), last = w.pop();
            const hits = nextWords(w.filter(Boolean)).filter(x => x.startsWith(last) && x !== '<ad>');
            return hits.length === 1 ? w.concat([hits[0]]).join(' ').replace(/^\s+/, '') + ' ' : null;
        }

        // ── başlangıç: lab.start (tmsh komutları) uygulanır ve kaydedilir; lab.startUnsaved sonra
        function apply(cmds) { for (const c of cmds) { const o = run(c, true); if (o && o.err) throw new Error('lab başlangıç komutu hatalı: ' + c + ' → ' + o.msg); } }
        S.saved = clone(M());
        apply(lab.start || []);
        // HA arıza lab'ları: başlangıç yapılandırması eşle eşitlenmiş kabul edilir; startLate eşitlemeden SONRA yapılan değişikliklerdir
        if (SIM.haBoot && SIM.haBoot.synced) { HA.syncKey = syncKey(M()); HA.peerCfg = clone(M()); }
        apply(lab.startLate || []);
        if (SIM.haBoot && SIM.haBoot.st) HA.st = SIM.haBoot.st;
        S.saved = clone(M());
        apply(lab.startUnsaved || []);
        ctBoot(); ltmTick(true);
        // başlangıç açılış hacmi (ör. yükseltme sonrası arıza lab'ı)
        if (SIM.bootVol && S.vols[SIM.bootVol]) { S.boot = SIM.bootVol; S.inop = !svcOk(curVer()); if (S.inop) S.ltmlog.push(stamp(900) + ' ' + short() + ' emerg load_config_files[4122]: "/usr/bin/tmsh -n -g -a load sys config partitions all " - failed. -- 01070608:0: License is not operational (expired or digital signature does not match contents).'); }
        S.ev = []; S.hist = []; S.audit = (SIM.auditlog || []).slice(); S.rt.acc = { ssh: allowHas(M().sshd.allow, ADMIN), gui: allowHas(M().httpd.allow, ADMIN) };
        if (lab.startMode === 'tmsh') S.mode = 'tmsh';

        const EV = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            ranIn: (re, mode) => S.ev.some(e => e.canon && re.test(e.raw) && e.mode === mode),
            after: (a, b) => { const i = S.ev.findIndex(e => e.canon && a.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && b.test(e.canon)); },
            err: k => S.ev.some(e => e.err === k),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            warned: w => S.ev.some(e => e.warn === w),
            list: () => S.ev,
        };
        return {
            vendor: 'f5-ltm',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            literalQ: () => S.mode !== 'tmsh' || !!S.cont,
            _toPriv: () => { S.mode = lab.startMode === 'tmsh' ? 'tmsh' : 'bash'; S.pending = null; S.cont = null; S.loggedOut = false; S.fromTmsh = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => VAR,
            get model() { return S.m; }, get savedModel() { return S.saved; },
            ev: EV, mode: () => S.mode, dirty,
            // yan etkisiz VIP testi (kontrollerde kullanılır): sayaçları ve kalıcılık tablosunu değiştirmez
            vsFor: (ip, port, src) => vsMatch(ip, port, src || SIM.client || '198.51.100.20'),
            // iRule oyunları için yan etkisiz istek: { ip, port, path, method, host, src, hdrs } → sonuç ayrıntıları (log satırları dahil)
            irTest: q => { const keepRt = JSON.stringify(S.rt), keepLog = S.ltmlog.length, keepSt = JSON.stringify(S.rstat), keepTb = JSON.stringify(S.rtable);
                const r = viaPeer(() => vipRequest({ ip: q.ip || '203.0.113.100', port: q.port || 80, path: q.path || '/', method: q.method || 'GET', src: q.src || SIM.client || '198.51.100.20', cookie: q.cookie || {}, host: q.host, hdrs: q.hdrs || [], test: false }));
                const logs = S.ltmlog.slice(keepLog); S.ltmlog.length = keepLog; S.rt = JSON.parse(keepRt); S.rstat = JSON.parse(keepSt); S.rtable = JSON.parse(keepTb);
                const H = r.resp ? (r.resp.headers || []) : []; const hv = n => { const x = H.find(h => h.toLowerCase().startsWith(n.toLowerCase() + ':')); return x ? x.slice(x.indexOf(':') + 1).trim() : null; };
                return { kind: r.kind, why: r.why || null, code: r.resp ? r.resp.code : null, byF5: !!r.byF5, member: r.member || null, loc: hv('Location'), hdr: hv, headers: H.slice(), body: r.resp ? r.resp.body : null, logs, err: logs.find(l => /01220001/.test(l)) || null }; },
            vipTest: (ip, port, path) => { const keep = JSON.stringify(S.rt); const r = viaPeer(() => vipRequest({ ip, port, path: path || '/', method: 'GET', src: SIM.client || '198.51.100.20', cookie: {}, test: true })); S.rt = JSON.parse(keep); return { kind: r.kind, code: r.resp ? r.resp.code : null, member: r.member || null }; },
            ha: () => ({ st: HA.st, sync: syncStatus().status, link: haLink(), synced: HA.syncKey !== null }),
            conns: () => S.ct.map(c => Object.assign({}, c)), persistRecords: () => Object.assign({}, S.rt.persist || {}),
            vols: () => clone(S.vols), bootVol: () => S.boot, inop: () => S.inop, ucsFiles: () => S.ucs.map(u => u.name),
            memberStatus: (p, k) => memberStatus(p, k), poolStatus: p => poolStatus(p), vsStatus: v => vsStatus(v),
            reach: ip => reach(ip), sshAllowed: ip => allowHas(M().sshd.allow, ip || ADMIN), guiAllowed: ip => allowHas(M().httpd.allow, ip || ADMIN),
            selfAllows: (name, svc) => { const s = M().selfs[name]; if (!s) return false; if (s.allow === 'all') return true; if (s.allow === 'none') return false; const L = s.allow === 'default' ? ALLOW_DEFAULT : s.allow; const [pr, pt] = svc.split(':'); return L.some(x => { const [p2, t2] = x.split(':'); return p2 === pr && (t2 === 'any' || t2 === pt || SVC_PORT[t2] === +pt || +t2 === SVC_PORT[pt]); }); },
            showRun: () => TYPES.map(k => { const t = T[k]; if (t.special) return t.list().join('\n'); if (t.single) return t.list().join('\n'); return Object.keys(t.coll()).map(n => t.list(n, t.coll()[n]).join('\n')).join('\n'); }).filter(Boolean).join('\n'),
        };
    }
    return { session, _tok: tok, _block: block };
})();
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'f5-ltm': CgLabTmsh });
if (typeof module !== 'undefined') module.exports = CgLabTmsh;
