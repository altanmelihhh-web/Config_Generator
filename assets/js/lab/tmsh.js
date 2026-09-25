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
            if (T[i].t === '{' && T[i].sym) return { err: 'unexpected{', at: i };
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
        if (VAR) lab = Object.assign({}, lab, { start: (lab.start || []).concat(VAR.start || []), sim: Object.assign({}, lab.sim || {}, VAR.sim || {}) });
        const SIM = lab.sim || {};
        const IFS = lab.ifaces || ['1.1', '1.2', '1.3', '1.4'];
        const S = { m: base(), saved: null, mode: 'bash', ev: [], hist: [], pending: null, answers: {}, loggedOut: false, audit: [], ltmlog: (SIM.ltmlog || []).slice(), rt: { reboots: 0, arp: {} } };
        function base() {
            const ifs = {}; IFS.forEach(n => { ifs[n] = { enabled: true, desc: '' }; });
            const prov = {}; PROV.forEach(p => { prov[p] = p === 'ltm' ? 'nominal' : 'none'; });
            return { hostname: lab.hostname || 'bigip-a.lab.example', guiSetup: 'enabled', mgmtIp: null, mgmtRoutes: {}, ifs, vlans: {}, selfs: {}, routes: {},
                httpd: { allow: ['ALL'], idle: 1200 }, sshd: { allow: ['ALL'], idle: 0, banner: 'disabled', bannerText: '' }, dns: { servers: [], search: [] }, ntp: { servers: [], tz: 'America/Los_Angeles' },
                prov, users: { admin: { role: 'admin', shell: 'tmsh', pw: true } }, pwpol: { enf: 'disabled', min: 6, up: 0, low: 0, num: 0, spec: 0, fail: 0, maxdur: 99999 } };
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
        const allowSet = (tgt, p) => { const r = listOp(tgt.allow.filter(x => x !== 'ALL' || p.op !== 'add'), p, allowNorm); if (r.bad) return SYNx('"' + r.bad + '" invalid IP address or network'); if (r.missing) return E('# [Simülatör] ' + r.missing + ' listede yok.'); tgt.allow = r.list; return null; };
        single('sys httpd', 'httpd', (o, P) => {
            for (const p of P) {
                if (p.k === 'allow') { const e = allowSet(M().httpd, p); if (e) return e; }
                else if (p.k === 'auth-pam-idle-timeout') { if (!/^\d+$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); M().httpd.idle = +p.v; }
                else return SYN(p.k);
            }
            return null;
        }, () => ['sys httpd {', '    allow { ' + (M().httpd.allow.length ? M().httpd.allow.join(' ') : 'none') + ' }', '    auth-pam-idle-timeout ' + M().httpd.idle, '}'], ['allow', 'auth-pam-idle-timeout']);
        single('sys sshd', 'sshd', (o, P) => {
            for (const p of P) {
                if (p.k === 'allow') { const e = allowSet(M().sshd, p); if (e) return e; }
                else if (p.k === 'inactivity-timeout') { if (!/^\d+$/.test(p.v)) return SYNx('"' + p.v + '" invalid value'); M().sshd.idle = +p.v; }
                else if (p.k === 'banner') { if (!['enabled', 'disabled'].includes(p.v)) return SYNx('"' + p.v + '" invalid value'); M().sshd.banner = p.v; }
                else if (p.k === 'banner-text') M().sshd.bannerText = p.v;
                else return SYN(p.k);
            }
            return null;
        }, () => { const s = M().sshd, L = ['sys sshd {', '    allow { ' + (s.allow.length ? s.allow.join(' ') : 'none') + ' }', '    banner ' + s.banner]; if (s.bannerText) L.push('    banner-text "' + s.bannerText + '"'); L.push('    inactivity-timeout ' + s.idle, '}'); return L; }, ['allow', 'inactivity-timeout', 'banner', 'banner-text']);
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
        const TYPES = Object.keys(T);
        const MODULES = ['net', 'sys', 'auth', 'ltm', 'cm', 'util', 'gtm', 'security', 'apm', 'asm'];
        function resolveType(toks) {
            // tüm türler iki sözcük: "net vlan", "/net vlan", "/net/vlan"
            const a = toks[0].t.replace(/^\//, '');
            if (a.includes('/')) { const [m, c] = a.split('/'); return T[m + ' ' + c] ? { type: m + ' ' + c, rest: toks.slice(1) } : { mod: m, comp: c }; }
            const b = toks[1] && toks[1].t;
            return T[a + ' ' + b] ? { type: a + ' ' + b, rest: toks.slice(2) } : { mod: a, comp: b };
        }
        const stamp = k => { const t = 10 * 3600 + 21 * 60 + k; return 'Sep 24 ' + [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60].map(x => String(x).padStart(2, '0')).join(':'); };
        function auditLog(line) { S.audit.push(stamp(S.audit.length) + ' ' + short() + ' notice tmsh[' + (7310 + S.audit.length) + ']: 01420002:5: AUDIT - pid=' + (7310 + S.audit.length) + ' user=root folder=/Common module=(tmos)# status=[Command OK] cmd_data=' + line); }
        function run(line, viaBash) {
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
            if (verb === 'install') return E('# [Simülatör] Yazılım kurulumu bu lab sürümünde henüz desteklenmiyor.', 'unsupported');
            if (verb === 'reboot') return doReboot();
            if (TK.length < 2) return E('Syntax Error: "' + verb + '" requires a component', 'incomplete');
            const r = resolveType(TK.slice(1));
            if (!r.type) {
                const md = (r.mod || '').replace(/^\//, '');
                if (!MODULES.includes(md)) return E('Syntax Error: "' + (TK[1].t) + '" unknown property', 'invalid');
                if (verb === 'show') { const o = showCmd(md, r.comp, TK.slice(3)); if (o !== null) return o; }
                if (!r.comp) return E('Syntax Error: "' + md + '" requires a component', 'incomplete');
                if (['ltm', 'cm', 'gtm', 'security', 'apm', 'asm', 'util'].includes(md) || ['software', 'ucs', 'license', 'log', 'syslog', 'snmp', 'db', 'failover', 'service'].includes(r.comp)) return E('# [Simülatör] "' + md + ' ' + r.comp + '" bu lab sürümünde henüz desteklenmiyor.', 'unsupported');
                return E('Syntax Error: "' + r.comp + '" unknown property', 'invalid');
            }
            const t = T[r.type];
            if (verb === 'show') { const o = showCmd(r.type.split(' ')[0], r.type.split(' ')[1], r.rest); if (o !== null) return o; return E('# [Simülatör] "show ' + r.type + '" bu lab sürümünde yok; yapılandırma için "list ' + r.type + '".', 'unsupported'); }
            if (verb === 'list') return listCmd(r.type, r.rest);
            return change(verb, r.type, t, r.rest, line);
        }
        function change(verb, key, t, rest, line) {
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
                auditLog(line); return { out: '', ok: true, touched: key };
            }
            const nameT = rest[0]; if (!nameT) return E('Syntax Error: ' + key + ' requires a name', 'incomplete');
            const name = nameT.t, coll = t.coll();
            if (t.fixed && !(name in coll)) return NF(t.kind, name);
            if (verb === 'create') {
                if (t.fixed) return E('Syntax Error: "create" is not supported for ' + key, 'invalid');
                if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(name)) return SYNx('"' + name + '" invalid name');
                if (coll[name]) return EX(t.kind, name);
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
                const L = ['', '-----------------------------------------------------------------', 'Sys::Software Status', 'Volume  Product   Version  Build  Active  Status', '-----------------------------------------------------------------', 'HD1.1   BIG-IP    ' + VER.version + '  ' + VER.build + '    yes     complete'];
                (SIM.volumes || []).forEach(v => L.push(pad(v.name, 8) + pad('BIG-IP', 10) + pad(v.version, 9) + pad(v.build || '0.0.1', 7) + pad('no', 8) + (v.status || 'complete')));
                log({ show: 'sys software status' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'sys' && comp === 'version') {
                log({ show: 'sys version' });
                return { out: ['', 'Sys::Version', 'Main Package', '  Product     ' + VER.product, '  Version     ' + VER.version, '  Build       ' + VER.build, '  Edition     ' + VER.edition, '  Date        ' + VER.date, ''].join('\n'), ok: true };
            }
            if (mod === 'sys' && comp === 'license') { log({ show: 'sys license' }); return { out: licenseText(a.includes('detail')), ok: true }; }
            if (mod === 'sys' && comp === 'provision') {
                const L = ['', 'Sys::Provision', 'Module    Level      CPU (%)  Memory (MB)', '------------------------------------------'];
                PROV.filter(p => M().prov[p] !== 'none').forEach(p => L.push(pad(p, 10) + pad(M().prov[p], 11) + pad(p === 'ltm' ? '38' : '12', 9) + (p === 'ltm' ? '2412' : '1810')));
                L.push('# [Simülatör] Sütunlar sadeleştirildi; yalnız provision edilmiş modüller.');
                log({ show: 'sys provision' }); return { out: L.join('\n'), ok: true };
            }
            if (mod === 'cm' && comp === 'sync-status') { log({ show: 'cm sync-status' }); return { out: ['', '--------------------------------------------', 'CM::Sync Status', '--------------------------------------------', 'Color    green', 'Status   Standalone', 'Summary', 'Details', '# [Simülatör] Cihaz HA çiftinde değil.'].join('\n'), ok: true }; }
            if (mod === 'sys' && comp === 'failover') { log({ show: 'sys failover' }); return { out: 'Failover active for 3d 04:12:37', ok: true }; }
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
        const vlanUp = vn => { const v = M().vlans[vn]; return !!v && Object.keys(v.ifs).some(linkUp); };
        function saveLoad(verb, rest) {
            const a = rest.map(x => x.t);
            if (a[0] !== 'sys' || a[1] !== 'config') { if (a[0] === 'sys' && a[1] === 'ucs') return E('# [Simülatör] UCS arşivi bu lab sürümünde henüz desteklenmiyor.', 'unsupported'); return E('Syntax Error: "' + (a[0] || verb) + '" unknown property', 'invalid'); }
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
        function doReboot() {
            const was = short(), lost = diffList(M(), S.saved); S.m = clone(S.saved); S.mode = 'bash'; S.rt.arp = {}; S.rt.reboots++;
            log({ reboot: true, lost });
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
            if (a[0] === 'sys' && a[1] === 'failover') return E('# [Simülatör] Cihaz HA çiftinde değil (Standalone).', 'value');
            if (a[0] === 'cm' && a[1] === 'config-sync') return E('# [Simülatör] Cihaz HA çiftinde değil; config-sync yapılacak device group yok.', 'value');
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
        const DIRS = { '/shared/images': SIM.images || [], '/var/local/ucs': SIM.ucs || [], '/config': ['bigip.conf', 'bigip_base.conf', 'bigip_user.conf', 'bigip.license', 'BigDB.dat'], '/var/log': ['audit', 'ltm', 'secure', 'messages', 'asm'], '/var/tmp': SIM.tmp || [] };
        function licenseFile() {
            return ['#', 'Auth vers :          5b', '#', '#', '#       BIG-IP System License Key File', '#       DO NOT EDIT THIS FILE!!', '#', 'Usage :                 F5 Internal Product Development', 'Vendor :                F5, Inc.', 'active module :         LTM, VE-1G|ABCDEFG-HIJKLMN|Rate Shaping|Anti-Virus Checks',
                'Licensed date :         20240115', 'License end date :      20270115', 'License start date :    20240114', 'Service check date :    ' + (SIM.serviceCheck || '2026/08/20').replace(/\//g, ''), 'Registration Key :      AAAAA-BBBBB-CCCCC-DDDDD-EEEEEEE', '# [Simülatör] Dosya kısaltıldı; anahtarlar temsilidir.'].join('\n');
        }
        function splitPipe(s) { const parts = []; let cur = '', q = null; for (const ch of s) { if (q) { if (ch === q) q = null; cur += ch; continue; } if (ch === '"' || ch === '\'') { q = ch; cur += ch; continue; } if (ch === '|') { parts.push(cur); cur = ''; continue; } cur += ch; } parts.push(cur); return parts.map(x => x.trim()); }
        function shWords(s) { const out = []; const re = /"([^"]*)"|'([^']*)'|(\S+)/g; let m; while ((m = re.exec(s))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]); return out; }
        function grepF(argv, text) {
            let inv = false, ic = false, i = 1; for (; i < argv.length && /^-[ivE]+$/.test(argv[i]); i++) { if (argv[i].includes('i')) ic = true; if (argv[i].includes('v')) inv = true; }
            const pat = argv[i]; if (pat === undefined) return null;
            let re; try { re = new RegExp(pat, ic ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ic ? 'i' : ''); }
            return { text: text.split('\n').filter(l => re.test(l) !== inv).join('\n'), file: argv[i + 1] };
        }
        function bashLine(line, nested) {
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
            if (c === 'ls') { const d = (a.filter(x => !/^-/.test(x))[1] || '/config').replace(/\/$/, ''); if (!(d in DIRS)) return E('ls: cannot access \'' + d + '\': No such file or directory', 'value'); const L = DIRS[d]; return a.includes('-l') || a.includes('-lh') ? L.map(n => '-rw-r--r--. 1 root root ' + (/\.iso$/.test(n) ? '2.4G' : '12K') + ' Sep 24 09:12 ' + n).join('\n') : L.join('  '); }
            if (c === 'date') return 'Thu Sep 24 10:21:07 PDT 2026';
            if (['qkview', 'tcpdump', 'df', 'bigstart', 'curl', 'netstat', 'ssldump', 'cpcfg', 'switchboot', 'config', 'top', 'ssh', 'scp'].includes(c)) return E('# [Simülatör] "' + c + '" gerçek BIG-IP\'de var ama bu lab sürümünde henüz desteklenmiyor.', 'unsupported');
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
            const line = raw.trim(); if (!line) return '';
            S.hist.push(line);
            const mode = S.mode;
            const r = mode === 'tmsh' ? run(line.replace(/^tmsh\s+/, ''), false) : bashLine(line, false);
            const canon = (mode === 'tmsh' ? 'tmsh ' : '') + line.replace(/\s+/g, ' ');
            if (r && r.err) { log({ raw: line, err: r.err, mode }); return r.msg; }
            const out = typeof r === 'string' ? r : (r ? r.out : '');
            log(Object.assign({ raw: line, canon, mode }, (r && r.log) || {}));
            warnAccess(line);
            return (out || '') + (S.warn ? (out ? '\n' : '') + S.warn : '');
        }
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
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            return S.mode === 'tmsh' ? 'root@(' + short() + ')(cfg-sync Standalone)(Active)(/Common)(tmos)# ' : '[root@' + short() + ':Active:Standalone] config # ';
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
            if (w.length === 2) return [...new Set(types.filter(k => k.startsWith(w[1] + ' ')).map(k => k.split(' ')[1]).concat(verb === 'show' ? (w[1] === 'net' ? ['interface', 'vlan', 'route', 'arp'] : w[1] === 'sys' ? ['software', 'version', 'license', 'provision', 'failover'] : w[1] === 'cm' ? ['sync-status'] : []) : []))];
            const key = w[1] + ' ' + w[2], t = T[key]; if (!t) return [];
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
        S.saved = clone(M());
        apply(lab.startUnsaved || []);
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
            _toPriv: () => { S.mode = lab.startMode === 'tmsh' ? 'tmsh' : 'bash'; S.pending = null; S.loggedOut = false; S.fromTmsh = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => VAR,
            get model() { return S.m; }, get savedModel() { return S.saved; },
            ev: EV, mode: () => S.mode, dirty,
            reach: ip => reach(ip), sshAllowed: ip => allowHas(M().sshd.allow, ip || ADMIN), guiAllowed: ip => allowHas(M().httpd.allow, ip || ADMIN),
            selfAllows: (name, svc) => { const s = M().selfs[name]; if (!s) return false; if (s.allow === 'all') return true; if (s.allow === 'none') return false; const L = s.allow === 'default' ? ALLOW_DEFAULT : s.allow; const [pr, pt] = svc.split(':'); return L.some(x => { const [p2, t2] = x.split(':'); return p2 === pr && (t2 === 'any' || t2 === pt || SVC_PORT[t2] === +pt || +t2 === SVC_PORT[pt]); }); },
            showRun: () => TYPES.map(k => { const t = T[k]; if (t.special) return t.list().join('\n'); if (t.single) return t.list().join('\n'); return Object.keys(t.coll()).map(n => t.list(n, t.coll()[n]).join('\n')).join('\n'); }).filter(Boolean).join('\n'),
        };
    }
    return { session, _tok: tok, _block: block };
})();
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'f5-ltm': CgLabTmsh });
if (typeof module !== 'undefined') module.exports = CgLabTmsh;
