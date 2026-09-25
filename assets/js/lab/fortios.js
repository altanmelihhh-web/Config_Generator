'use strict';

// ─── CLI Lab: FortiOS benzeri motor (eğitim simülatörü; FortiOS 7.4 görünümü) ───
// Şema güdümlü: tablo/tekil nesne · tip/enum · datasource referansı · zorunlu alan.
// Hata dizgeleri yalnız doğrulanmış olanlar (bkz. notes/arastirma-lab-github.md §4);
// doğrulanmamış "Return code -N" değerleri basılmaz.
const CgLabFgt = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, maskLen, lenMask, sameNet, netOf, ip2n, n2ip, fakeHash } = C;

    // ── Tokenizer: tırnaklı değerleri tek parça sayar, ofset tutar
    function tok(s) {
        const out = []; let i = 0;
        while (i < s.length) {
            if (/\s/.test(s[i])) { i++; continue; }
            const o = i;
            if (s[i] === '"' || s[i] === "'") {
                const q = s[i++]; let v = '';
                while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) i++; v += s[i++]; }
                i++; out.push({ t: v, o, q: true });
            } else {
                let v = '';
                while (i < s.length && !/\s/.test(s[i])) v += s[i++];
                out.push({ t: v, o });
            }
        }
        return out;
    }
    const qt = v => '"' + String(v).replace(/"/g, '\\"') + '"';

    // ── Şema (FortiOS 7.4 alt kümesi)
    const ED = ['enable', 'disable'];
    const ACCESS = ['ping', 'https', 'ssh', 'http', 'snmp', 'fgfm', 'telnet', 'radius-acct', 'probe-response', 'fabric', 'ftm', 'speed-test'];
    const SCHEMA = {
        'system global': { single: true, attrs: {
            hostname: { t: 'str', max: 35, d: 'Cihaz adı' }, timezone: { t: 'str', d: 'Saat dilimi' },
            admintimeout: { t: 'int', min: 1, max: 480, def: 5, d: 'Yönetici oturum zaman aşımı (dk)' },
            'admin-sport': { t: 'int', min: 1, max: 65535, def: 443, d: 'HTTPS yönetim portu' },
            'admin-ssh-port': { t: 'int', min: 1, max: 65535, def: 22, d: 'SSH yönetim portu' } } },
        'system dns': { single: true, attrs: { primary: { t: 'ip', def: '0.0.0.0', d: 'Birincil DNS' }, secondary: { t: 'ip', def: '0.0.0.0', d: 'İkincil DNS' } } },
        'system interface': { key: 'name', fixed: true, attrs: {
            vdom: { t: 'str', def: 'root', d: 'VDOM' }, mode: { t: 'enum', v: ['static', 'dhcp', 'pppoe'], def: 'static', d: 'Adresleme modu' },
            ip: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'IP adresi ve maske' },
            allowaccess: { t: 'menum', v: ACCESS, d: 'Bu arayüzde izinli yönetim erişimi' },
            status: { t: 'enum', v: ['up', 'down'], def: 'up', d: 'Yönetsel durum' },
            type: { t: 'ro', def: 'physical', d: 'Arayüz tipi' },
            alias: { t: 'str', max: 25, d: 'Takma ad' }, description: { t: 'str', max: 255, d: 'Açıklama' },
            role: { t: 'enum', v: ['lan', 'wan', 'dmz', 'undefined'], def: 'undefined', d: 'Arayüz rolü' },
            'snmp-index': { t: 'ro', d: 'SNMP indeksi' } } },
        'system admin': { key: 'name', req: ['accprofile'], attrs: {
            accprofile: { t: 'ref', ds: 'accprofile', d: 'Yetki profili' }, password: { t: 'secret', d: 'Parola' },
            trusthost1: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 1' },
            trusthost2: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 2' },
            trusthost3: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 3' } } },
        'firewall address': { key: 'name', attrs: {
            type: { t: 'enum', v: ['ipmask', 'iprange', 'fqdn'], def: 'ipmask', d: 'Adres tipi' },
            subnet: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', when: o => (o.type || 'ipmask') === 'ipmask', d: 'Alt ağ' },
            'start-ip': { t: 'ip', def: '0.0.0.0', when: o => o.type === 'iprange', d: 'Aralık başı' },
            'end-ip': { t: 'ip', def: '0.0.0.0', when: o => o.type === 'iprange', d: 'Aralık sonu' },
            fqdn: { t: 'str', max: 255, when: o => o.type === 'fqdn', d: 'Tam alan adı' },
            'associated-interface': { t: 'ref', ds: 'intf', d: 'İlişkili arayüz' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall addrgrp': { key: 'name', req: ['member'], attrs: {
            member: { t: 'refs', ds: 'addrgrpMember', d: 'Üye adres nesneleri' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall service custom': { key: 'name', attrs: {
            protocol: { t: 'enum', v: ['TCP/UDP/SCTP', 'ICMP', 'ICMP6', 'IP'], def: 'TCP/UDP/SCTP', d: 'Protokol ailesi' },
            'tcp-portrange': { t: 'ports', d: 'TCP hedef port(lar)ı, ör. 443 ya da 8000-8080' },
            'udp-portrange': { t: 'ports', d: 'UDP hedef port(lar)ı' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall service group': { key: 'name', req: ['member'], attrs: {
            member: { t: 'refs', ds: 'svcgrpMember', d: 'Üye servisler' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall ippool': { key: 'name', req: ['startip', 'endip'], attrs: {
            type: { t: 'enum', v: ['overload', 'one-to-one', 'fixed-port-range', 'port-block-allocation'], def: 'overload', d: 'Havuz tipi' },
            startip: { t: 'ip', def: '0.0.0.0', d: 'Başlangıç IP' }, endip: { t: 'ip', def: '0.0.0.0', d: 'Bitiş IP' },
            comments: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall vip': { key: 'name', req: ['extip', 'mappedip'], attrs: {
            comment: { t: 'str', max: 255, d: 'Açıklama' },
            extip: { t: 'iprange', d: 'Dış (genel) IP' }, mappedip: { t: 'iprangeq', d: 'İç (gerçek) IP' },
            extintf: { t: 'ref', ds: 'intfAny', def: 'any', d: 'Dış arayüz' },
            portforward: { t: 'enum', v: ED, def: 'disable', d: 'Port yönlendirme' },
            protocol: { t: 'enum', v: ['tcp', 'udp', 'sctp', 'icmp'], def: 'tcp', when: o => o.portforward === 'enable', d: 'Protokol' },
            extport: { t: 'port1', when: o => o.portforward === 'enable', d: 'Dış port' },
            mappedport: { t: 'port1', when: o => o.portforward === 'enable', d: 'İç port' } } },
        'firewall policy': { key: 'policyid', num: true, move: true, req: ['srcintf', 'dstintf', 'srcaddr', 'dstaddr', 'schedule', 'service'], attrs: {
            name: { t: 'str', max: 35, d: 'Kural adı' },
            srcintf: { t: 'refs', ds: 'intfAny', d: 'Gelen arayüz' }, dstintf: { t: 'refs', ds: 'intfAny', d: 'Giden arayüz' },
            action: { t: 'enum', v: ['accept', 'deny'], def: 'deny', d: 'Eylem' },
            srcaddr: { t: 'refs', ds: 'addr', d: 'Kaynak adres' }, dstaddr: { t: 'refs', ds: 'addrVip', d: 'Hedef adres (VIP dahil)' },
            schedule: { t: 'ref', ds: 'sched', d: 'Zamanlama' }, service: { t: 'refs', ds: 'svc', d: 'Servis' },
            'utm-status': { t: 'enum', v: ED, def: 'disable', d: 'Güvenlik profilleri' },
            logtraffic: { t: 'enum', v: ['all', 'utm', 'disable'], def: 'utm', d: 'Trafik logu' },
            nat: { t: 'enum', v: ED, def: 'disable', d: 'Kaynak NAT' },
            ippool: { t: 'enum', v: ED, def: 'disable', when: o => o.nat === 'enable', d: 'IP havuzu kullan' },
            poolname: { t: 'refs', ds: 'ippool', when: o => o.nat === 'enable' && o.ippool === 'enable', d: 'IP havuzu' },
            status: { t: 'enum', v: ED, def: 'enable', d: 'Kural durumu' },
            comments: { t: 'str', max: 1023, d: 'Açıklama' } } },
        'router static': { key: 'seq-num', num: true, attrs: {
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' },
            dst: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Hedef ağ' },
            gateway: { t: 'ip', def: '0.0.0.0', d: 'Ağ geçidi' },
            distance: { t: 'int', min: 1, max: 255, def: 10, d: 'Yönetsel mesafe' },
            priority: { t: 'int', min: 1, max: 65535, def: 1, d: 'Öncelik (aynı mesafede)' },
            device: { t: 'ref', ds: 'intf', d: 'Çıkış arayüzü' },
            blackhole: { t: 'enum', v: ED, def: 'disable', d: 'Kara delik rota' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
    };
    const PATHS = Object.keys(SCHEMA);
    const SERVICES = ['ALL', 'ALL_TCP', 'ALL_UDP', 'ALL_ICMP', 'PING', 'HTTP', 'HTTPS', 'SSH', 'DNS', 'NTP', 'SMTP', 'RDP', 'TELNET', 'SNMP', 'FTP'];
    const GETS = ['system status', 'router info routing-table all'];

    function session(lab) {
        const S = { lab, ctx: null, ev: [], hist: [], pending: null, loggedOut: false };
        // ── model
        function baseModel() {
            const m = { host: lab.hostname || 'FortiGate-VM64', t: {}, links: {} };
            for (const p of PATHS) m.t[p] = SCHEMA[p].single ? {} : { o: [], v: {} };
            (lab.ports || ['port1', 'port2', 'port3', 'port4']).forEach((n, i) => { tAdd(m, 'system interface', n, { vdom: 'root', type: 'physical', 'snmp-index': String(i + 1) }); });
            tAdd(m, 'system admin', 'admin', { accprofile: 'super_admin' });
            tAdd(m, 'firewall address', 'all', { _builtin: true });
            tAdd(m, 'firewall address', 'none', { subnet: '0.0.0.0 255.255.255.255', _builtin: true });
            (lab.up || []).forEach(n => { m.links[n] = true; });
            m.t['system global'].hostname = lab.hostname || 'FortiGate-VM64';
            return m;
        }
        function tAdd(m, p, k, o) { const t = m.t[p]; if (!t.v[k]) t.o.push(String(k)); t.v[k] = o; }
        S.m = baseModel();
        const M = () => S.m;
        const host = () => M().t['system global'].hostname || 'FortiGate-VM64';
        const log = o => S.ev.push(o);

        // ── datasource
        const DS = {
            intf: () => M().t['system interface'].o,
            intfAny: () => ['any'].concat(M().t['system interface'].o),
            addr: () => M().t['firewall address'].o.concat(M().t['firewall addrgrp'].o),
            addrVip: () => M().t['firewall address'].o.concat(M().t['firewall addrgrp'].o, M().t['firewall vip'].o),
            addrgrpMember: () => M().t['firewall address'].o.filter(n => n !== 'none').concat(M().t['firewall addrgrp'].o),
            svc: () => SERVICES.concat(M().t['firewall service custom'].o, M().t['firewall service group'].o),
            svcgrpMember: () => SERVICES.concat(M().t['firewall service custom'].o, M().t['firewall service group'].o),
            sched: () => ['always', 'none'],
            accprofile: () => ['super_admin', 'prof_admin'],
            ippool: () => M().t['firewall ippool'].o,
        };

        // ── değer ayrıştırma: {ok, v} | {err:'value'|'ds', at}
        function parseVal(a, toks, ctxObj) {
            const T = a.t, vals = toks.map(x => x.t);
            const bad = i => ({ err: 'value', at: i });
            if (!vals.length) return { err: 'novalue' };
            switch (T) {
                case 'str': if (vals.length > 1) return bad(1); if (a.max && vals[0].length > a.max) return bad(0); return { v: vals[0] };
                case 'int': if (vals.length > 1 || !/^\d+$/.test(vals[0]) || +vals[0] < a.min || +vals[0] > a.max) return bad(0); return { v: String(+vals[0]) };
                case 'ip': if (vals.length > 1 || !isIp(vals[0])) return bad(0); return { v: vals[0] };
                case 'ipmask': {
                    if (vals.length === 1) { const m = vals[0].match(/^([\d.]+)\/(\d{1,2})$/); if (!m || !isIp(m[1]) || +m[2] > 32) return bad(0); return { v: m[1] + ' ' + lenMask(+m[2]) }; }
                    if (vals.length === 2) { if (!isIp(vals[0])) return bad(0); if (maskLen(vals[1]) < 0) return bad(1); return { v: vals[0] + ' ' + vals[1] }; }
                    return bad(2);
                }
                case 'iprange': case 'iprangeq': {
                    if (vals.length > 1) return bad(1);
                    const p = vals[0].split('-');
                    if (p.length > 2 || !p.every(isIp) || (p.length === 2 && ip2n(p[0]) > ip2n(p[1]))) return bad(0);
                    return { v: vals[0] };
                }
                case 'enum': if (vals.length > 1) return bad(1); if (!a.v.includes(vals[0])) return bad(0); return { v: vals[0] };
                case 'menum': { for (let i = 0; i < vals.length; i++) if (!a.v.includes(vals[i])) return bad(i); return { v: [...new Set(vals)] }; }
                case 'ports': {
                    for (let i = 0; i < vals.length; i++) if (!portOk(vals[i], true)) return bad(i);
                    return { v: vals };
                }
                case 'port1': if (vals.length > 1 || !portOk(vals[0], false)) return bad(0); return { v: vals[0] };
                case 'secret': if (vals.length > 1) return bad(1); return { v: vals[0] };
                case 'ref': { if (vals.length > 1) return bad(1); if (!DS[a.ds]().includes(vals[0])) return { err: 'ds', at: 0 }; return { v: vals[0] }; }
                case 'refs': { for (let i = 0; i < vals.length; i++) if (!DS[a.ds]().includes(vals[i])) return { err: 'ds', at: i }; return { v: [...new Set(vals)] }; }
                default: return bad(0);
            }
        }
        function portOk(s, withSrc) {
            const parts = withSrc ? s.split(':') : [s];
            if (parts.length > 2) return false;
            return parts.every(p => { const r = p.split('-'); return r.length <= 2 && r.every(x => /^\d+$/.test(x) && +x >= 0 && +x <= 65535) && (r.length === 1 || +r[0] <= +r[1]); });
        }

        // ── gösterim
        function fmtVal(a, v) {
            if (a.t === 'str' || a.t === 'ref' || a.t === 'iprangeq') return qt(v);
            if (a.t === 'refs') return v.map(qt).join(' ');
            if (a.t === 'menum' || a.t === 'ports') return v.join(' ');
            if (a.t === 'secret') return 'ENC ' + fakeHash('enc' + v, 88);
            return v;
        }
        function objLines(p, o, full, ind) {
            const sc = SCHEMA[p], L = [];
            for (const [k, a] of Object.entries(sc.attrs)) {
                if (a.when && !a.when(o)) continue;
                let v = o[k];
                if (v === undefined || v === null) { if (!full || a.def === undefined) { if (full && (a.t === 'str') && !a.when) L.push(ind + 'set ' + k + ' ' + qt('')); continue; } v = a.def; }
                if (!full && a.def !== undefined && String(v) === String(a.def) && k !== 'vdom' && k !== 'type') continue;
                if (Array.isArray(v) && !v.length) continue;
                L.push(ind + 'set ' + k + ' ' + fmtVal(a, v));
            }
            return L;
        }
        function showPath(p, key, full) {
            const sc = SCHEMA[p], t = M().t[p], L = ['config ' + p];
            if (sc.single) { L.push(...objLines(p, t, full, '    ')); L.push('end'); return L.join('\n'); }
            const keys = key !== undefined ? [String(key)] : t.o;
            for (const k of keys) {
                const o = t.v[k];
                if (!o || (o._builtin && key === undefined && !full)) continue;
                L.push('    edit ' + (sc.num ? k : qt(k)));
                L.push(...objLines(p, o, full, '        '));
                L.push('    next');
            }
            L.push('end');
            return L.join('\n');
        }
        function getObj(p, o) {
            const sc = SCHEMA[p], L = [];
            if (!sc.single) L.push(pad(sc.key, 20) + ': ' + o[sc.key]);
            for (const [k, a] of Object.entries(sc.attrs)) {
                if (a.when && !a.when(o)) continue;
                let v = o[k] !== undefined ? o[k] : a.def;
                if (v === undefined) v = '';
                if (a.t === 'secret') v = v ? 'ENC ****' : '';
                L.push(pad(k, 20) + ': ' + (Array.isArray(v) ? v.map(x => a.t === 'refs' ? qt(x) : x).join(' ') : v));
            }
            return L.join('\n');
        }

        // ── yönlendirme tablosu
        const ifUp = n => { const i = M().t['system interface'].v[n]; return !!i && (i.status || 'up') === 'up' && !!M().links[n]; };
        function rib() {
            const R = [];
            for (const n of M().t['system interface'].o) {
                const i = M().t['system interface'].v[n];
                if (!i.ip || !ifUp(n)) continue;
                const [ip, mask] = i.ip.split(' '), len = maskLen(mask);
                if (ip === '0.0.0.0') continue;
                R.push({ c: 'C', net: n2ip(netOf(ip, len)), len, dev: n, ad: 0 });
            }
            const cands = [];
            for (const k of M().t['router static'].o) {
                const r = M().t['router static'].v[k];
                if ((r.status || 'enable') !== 'enable' || !r.device) continue;
                const [dip, dm] = (r.dst || '0.0.0.0 0.0.0.0').split(' '), len = maskLen(dm);
                const gw = r.gateway || '0.0.0.0';
                if (!ifUp(r.device)) continue;
                if (gw !== '0.0.0.0' && !R.some(c => c.c === 'C' && c.dev === r.device && sameNet(c.net, gw, c.len))) continue;
                cands.push({ c: len === 0 ? 'S*' : 'S', net: n2ip(netOf(dip, len)), len, gw, dev: r.device, ad: +(r.distance || 10), pri: +(r.priority || 1) });
            }
            for (const r of cands) {
                const best = Math.min(...cands.filter(x => x.net === r.net && x.len === r.len).map(x => x.ad));
                if (r.ad === best && !R.some(c => c.c === 'C' && c.net === r.net && c.len === r.len)) R.push(r);
            }
            return R.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }
        function showRib() {
            const L = ['Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP', '       O - OSPF, IA - OSPF inter area',
                '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2', '       E1 - OSPF external type 1, E2 - OSPF external type 2',
                '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area', '       V - BGP VPNv4', '       * - candidate default', '', 'Routing table for VRF=0'];
            for (const r of rib()) {
                if (r.c === 'C') L.push(pad('C', 8) + r.net + '/' + r.len + ' is directly connected, ' + r.dev);
                else L.push(pad(r.c, 8) + r.net + '/' + r.len + ' [' + r.ad + '/0] via ' + r.gw + ', ' + r.dev + ', [' + r.pri + '/0]');
            }
            return L.join('\n');
        }
        function sysStatus() {
            const g = M().t['system global'];
            return ['Version: FortiGate-VM64 v7.4 (eğitim simülatörü — gerçek cihaz değildir)', 'Serial-Number: FGVMSIM000000001', 'Hostname: ' + host(),
                'Operation Mode: NAT', 'Current virtual domain: root', 'Max number of virtual domains: 1', 'Virtual domains status: 1 in NAT mode, 0 in TP mode',
                'Virtual domain configuration: disable', 'Current HA mode: standalone', 'System time: ' + new Date().toString().slice(0, 24) + (g.timezone ? ' (' + g.timezone + ')' : '')].join('\n');
        }
        function ping(ip) {
            const hosts = lab.hosts || [];
            let ok = M().t['system interface'].o.some(n => ifUp(n) && (M().t['system interface'].v[n].ip || '').split(' ')[0] === ip);
            if (!ok) {
                const r = rib().filter(x => x.len === 0 || sameNet(x.net, ip, x.len)).sort((a, b) => b.len - a.len)[0];
                ok = !!r && hosts.includes(ip) && (!r.gw || r.gw === '0.0.0.0' || hosts.includes(r.gw));
            }
            const head = 'PING ' + ip + ' (' + ip + '): 56 data bytes\n';
            if (!ok) return head + '\n--- ' + ip + ' ping statistics ---\n5 packets transmitted, 0 packets received, 100% packet loss';
            let L = '';
            for (let i = 0; i < 5; i++) L += '64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=64 time=0.' + (4 + i % 3) + ' ms\n';
            return head + L + '\n--- ' + ip + ' ping statistics ---\n5 packets transmitted, 5 packets received, 0% packet loss\nround-trip min/avg/max = 0.4/0.5/0.6 ms';
        }

        // ── bağlam
        const ctxName = () => {
            const c = S.ctx;
            if (!c) return '';
            if (c.key !== undefined) return c.key;
            return c.path.split(' ').slice(-1)[0];
        };
        function prompt() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            return host() + (S.ctx ? ' (' + ctxName() + ')' : '') + ' # ';
        }
        // Kısaltma: benzersiz önek
        function pick(word, list) {
            const w = word.toLowerCase();
            if (list.includes(w)) return { ok: w };
            const h = list.filter(x => x.startsWith(w));
            if (h.length === 1) return { ok: h[0] };
            return { err: h.length ? 'amb' : 'none' };
        }
        // "firewall policy" gibi yolu kelime kelime çöz
        function resolvePath(toks, i) {
            let cands = PATHS.map(p => p.split(' ')), depth = 0, words = [];
            while (i + depth < toks.length) {
                const pos = depth;
                const opts = [...new Set(cands.filter(c => c.length > pos).map(c => c[pos]))];
                if (!opts.length) break;
                const r = pick(toks[i + depth].t, opts);
                if (!r.ok) return { err: toks[i + depth] };
                words.push(r.ok); cands = cands.filter(c => c[pos] === r.ok); depth++;
                const full = cands.find(c => c.length === depth);
                if (full && cands.every(c => c.length === depth)) return { path: words.join(' '), n: depth };
            }
            const full = cands.find(c => c.length === depth);
            if (full && depth) return { path: words.join(' '), n: depth };
            return { err: toks[i + depth] || null, incomplete: true };
        }
        const perr = t => 'command parse error before \'' + (t ? t.t : '') + '\'';

        // ── komutlar
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw: p.secret ? '***' : raw, prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) { S.loggedOut = false; return lab.loginBanner || ''; }
            const line = raw.trim();
            if (!line) return '';
            if (line === '\x1a') return '';
            S.hist.push(line);
            const t = tok(line);
            const c = S.ctx;
            if (!c) return rootCmd(t, line);
            if (c.key !== undefined || c.single) return editCmd(t, line);
            return tableCmd(t, line);
        }
        function rootCmd(t, line) {
            const v = pick(t[0].t, ['config', 'show', 'get', 'execute', 'diagnose', 'exit']);
            if (!v.ok) { log({ raw: line, err: 'unknown' }); return 'Unknown action 0'; }
            if (v.ok === 'config') {
                if (t.length < 2) { log({ raw: line, err: 'incomplete' }); return perr(null); }
                const r = resolvePath(t, 1);
                if (r.err !== undefined || r.incomplete) { log({ raw: line, err: 'invalid' }); return r.err ? perr(r.err) : perr(null); }
                if (1 + r.n < t.length) { log({ raw: line, err: 'invalid' }); return perr(t[1 + r.n]); }
                S.ctx = { path: r.path, single: !!SCHEMA[r.path].single };
                if (S.ctx.single) S.ctx.draft = JSON.parse(JSON.stringify(M().t[r.path]));
                log({ raw: line, canon: 'config ' + r.path });
                return '';
            }
            if (v.ok === 'show') {
                let i = 1, full = false;
                if (t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase()) && t[1].t.length > 1) { full = true; i = 2; }
                if (i >= t.length) { log({ raw: line, canon: 'show' + (full ? ' full-configuration' : '') }); return PATHS.map(p => showPath(p, undefined, full)).join('\n'); }
                const r = resolvePath(t, i);
                if (r.err !== undefined || r.incomplete) { log({ raw: line, err: 'invalid' }); return perr(r.err); }
                let key;
                if (i + r.n < t.length) {
                    key = t[i + r.n].t;
                    if (SCHEMA[r.path].single || !M().t[r.path].v[key]) { log({ raw: line, err: 'invalid' }); return perr(t[i + r.n]); }
                }
                log({ raw: line, canon: 'show ' + (full ? 'full-configuration ' : '') + r.path + (key !== undefined ? ' ' + key : '') });
                return showPath(r.path, key, full);
            }
            if (v.ok === 'get') {
                const rest = t.slice(1).map(x => x.t.toLowerCase());
                for (const g of GETS) {
                    const gw = g.split(' ');
                    if (rest.length === gw.length && gw.every((w, k) => w.startsWith(rest[k]))) {
                        log({ raw: line, canon: 'get ' + g });
                        return g === 'system status' ? sysStatus() : showRib();
                    }
                }
                const partial = GETS.filter(g => { const gw = g.split(' '); return rest.length < gw.length && rest.every((w, k) => gw[k].startsWith(w)); });
                if (partial.length && rest.length) { log({ raw: line, err: 'incomplete' }); return '# [Simülatör] Komut eksik. Devamı: ' + partial.map(g => 'get ' + g).join(', ') + '  (? ile görün)'; }
                const r = resolvePath(t, 1);
                if (r.path && 1 + r.n === t.length) {
                    log({ raw: line, canon: 'get ' + r.path });
                    const sc = SCHEMA[r.path], tb = M().t[r.path];
                    return sc.single ? getObj(r.path, tb) : tb.o.map(k => '== [ ' + k + ' ]\n' + sc.key + ': ' + k).join('\n');
                }
                log({ raw: line, err: 'invalid' });
                return perr(t[1] || null);
            }
            if (v.ok === 'execute') {
                if (t[1] && 'ping'.startsWith(t[1].t.toLowerCase()) && t[2] && isIp(t[2].t) && t.length === 3) { log({ raw: line, canon: 'execute ping ' + t[2].t }); return ping(t[2].t); }
                log({ raw: line, err: 'unsupported' });
                return '# [Simülatör] Bu lab sürümünde yalnız "execute ping <ip>" destekleniyor.';
            }
            if (v.ok === 'diagnose') { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] diagnose komutları sonraki lab sürümünde (debug flow, sniffer) gelecek.'; }
            if (v.ok === 'exit') { log({ raw: line, canon: 'exit' }); S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.\n'; }
        }
        function tableCmd(t, line) {
            const c = S.ctx, sc = SCHEMA[c.path], tb = M().t[c.path];
            const verbs = ['edit', 'delete', 'show', 'get', 'end', 'abort'].concat(sc.move ? ['move'] : []);
            const v = pick(t[0].t, verbs);
            if (!v.ok) { log({ raw: line, err: 'invalid' }); return perr(t[0]); }
            if (v.ok === 'end' || v.ok === 'abort') { S.ctx = null; log({ raw: line, canon: v.ok, path: c.path }); return ''; }
            if (v.ok === 'show' || v.ok === 'get') {
                const full = t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase());
                log({ raw: line, canon: (v.ok === 'show' ? 'show ' + (full ? 'full-configuration ' : '') : 'get ') + c.path });
                return v.ok === 'show' ? showPath(c.path, undefined, full) : tb.o.map(k => '== [ ' + k + ' ]\n' + sc.key + ': ' + k).join('\n');
            }
            if (v.ok === 'edit') {
                if (t.length !== 2) { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); }
                let k = t[1].t, msg = '';
                if (sc.num) {
                    if (!/^\d+$/.test(k) || +k > 4294967295) { log({ raw: line, err: 'invalid' }); return 'value parse error before \'' + k + '\''; }
                    if (k === '0') k = String(tb.o.reduce((a, x) => Math.max(a, +x), 0) + 1);
                } else if (!k.length || k.length > 79) { log({ raw: line, err: 'invalid' }); return 'value parse error before \'' + k + '\''; }
                if (!tb.v[k]) {
                    if (sc.fixed) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu lab\'da yalnız mevcut arayüzler düzenlenebilir: ' + tb.o.join(', '); }
                    msg = 'new entry \'' + k + '\' added';
                }
                if (tb.v[k] && tb.v[k]._builtin) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] "' + k + '" hazır (predefined) bir nesnedir; değiştirmeyin.'; }
                S.ctx = { path: c.path, key: k, isNew: !tb.v[k], draft: JSON.parse(JSON.stringify(tb.v[k] || {})) };
                log({ raw: line, canon: 'edit ' + k, path: c.path });
                return msg;
            }
            if (v.ok === 'delete') {
                const k = t[1] && t[1].t;
                if (!k || !tb.v[k]) { log({ raw: line, err: 'invalid' }); return 'entry not found in datasource'; }
                if (sc.fixed || tb.v[k]._builtin) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu nesne silinemez.'; }
                const users = usedBy(c.path, k);
                if (users.length) { log({ raw: line, err: 'inuse' }); return '# [Simülatör] "' + k + '" silinemez: kullanılıyor → ' + users.join(', ') + '\n# Önce o nesnelerden kaldırın (FortiOS kullanımdaki nesneyi silmez).'; }
                tb.o = tb.o.filter(x => x !== k); delete tb.v[k];
                log({ raw: line, canon: 'delete ' + k, path: c.path });
                return '';
            }
            if (v.ok === 'move') {
                const [a, pos, b] = [t[1], t[2], t[3]].map(x => x && x.t);
                if (!a || !b || !tb.v[a] || !tb.v[b] || !['before', 'after'].some(w => w.startsWith((pos || '-').toLowerCase()))) { log({ raw: line, err: 'invalid' }); return perr(t[1] || null); }
                const where = 'before'.startsWith(pos.toLowerCase()) ? 'before' : 'after';
                tb.o = tb.o.filter(x => x !== a);
                tb.o.splice(tb.o.indexOf(b) + (where === 'after' ? 1 : 0), 0, a);
                log({ raw: line, canon: 'move ' + a + ' ' + where + ' ' + b, path: c.path });
                return '';
            }
        }
        function usedBy(p, k) {
            const out = [], map = { 'firewall address': ['addr', 'addrVip', 'addrgrpMember'], 'firewall addrgrp': ['addr', 'addrVip', 'addrgrpMember'], 'firewall vip': ['addrVip'],
                'firewall service custom': ['svc', 'svcgrpMember'], 'firewall service group': ['svc', 'svcgrpMember'], 'firewall ippool': ['ippool'] }[p] || [];
            for (const q of PATHS) {
                const sc = SCHEMA[q]; if (sc.single) continue;
                for (const key of M().t[q].o) {
                    const o = M().t[q].v[key];
                    for (const [an, a] of Object.entries(sc.attrs)) {
                        if (!map.includes(a.ds)) continue;
                        const v = o[an];
                        if (v === k || (Array.isArray(v) && v.includes(k))) out.push(q + ' ' + key + ' (' + an + ')');
                    }
                }
            }
            return out;
        }
        function commit() {
            const c = S.ctx, sc = SCHEMA[c.path];
            if (c.single) { M().t[c.path] = c.draft; return null; }
            const miss = (sc.req || []).filter(k => { const v = c.draft[k]; return v === undefined || (Array.isArray(v) && !v.length); });
            if (c.path === 'router static' && c.draft.blackhole !== 'enable' && !c.draft.device) miss.push('device');
            if (miss.length) return miss.map(k => 'node_check_object fail! for ' + k + '\nAttribute \'' + k + '\' MUST be set.').join('\n');
            if (c.path === 'firewall vip' && c.draft.portforward === 'enable' && !c.draft.extport) return 'node_check_object fail! for extport\nAttribute \'extport\' MUST be set.';
            const tb = M().t[c.path];
            if (!tb.v[c.key]) tb.o.push(c.key);
            tb.v[c.key] = c.draft;
            return null;
        }
        function editCmd(t, line) {
            const c = S.ctx, sc = SCHEMA[c.path];
            const verbs = ['set', 'unset', 'append', 'unselect', 'show', 'get', 'end', 'abort'].concat(c.single ? [] : ['next']);
            const v = pick(t[0].t, verbs);
            if (!v.ok) { log({ raw: line, err: 'invalid' }); return perr(t[0]); }
            if (v.ok === 'abort') { S.ctx = null; log({ raw: line, canon: 'abort', path: c.path }); return ''; }
            if (v.ok === 'next' || v.ok === 'end') {
                const e = commit();
                if (e) { log({ raw: line, err: 'required', path: c.path }); return e; }
                log({ raw: line, canon: v.ok, path: c.path, key: c.key });
                S.ctx = v.ok === 'next' && !c.single ? { path: c.path } : null;
                return '';
            }
            if (v.ok === 'show') {
                const full = t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase());
                log({ raw: line, canon: 'show ' + (full ? 'full-configuration ' : '') + c.path + (c.key !== undefined ? ' ' + c.key : '') });
                if (c.single) return ['config ' + c.path].concat(objLines(c.path, c.draft, full, '    '), ['end']).join('\n');
                return ['config ' + c.path, '    edit ' + (sc.num ? c.key : qt(c.key))].concat(objLines(c.path, c.draft, full, '        '), ['    next', 'end']).join('\n');
            }
            if (v.ok === 'get') { log({ raw: line, canon: 'get', path: c.path }); return getObj(c.path, Object.assign({ [sc.key]: c.key }, c.draft)); }
            // set / unset / append / unselect
            if (t.length < 2) { log({ raw: line, err: 'incomplete' }); return perr(null); }
            const an = t[1].t.toLowerCase(), a = sc.attrs[an];
            if (!a || a.t === 'ro' || (a.when && !a.when(c.draft) && v.ok !== 'unset')) { log({ raw: line, err: 'invalid' }); return perr(t[1]); }
            if (v.ok === 'unset') { delete c.draft[an]; log({ raw: line, canon: 'unset ' + an, path: c.path, key: c.key }); return ''; }
            if ((v.ok === 'append' || v.ok === 'unselect') && !['refs', 'menum', 'ports'].includes(a.t)) { log({ raw: line, err: 'invalid' }); return perr(t[1]); }
            const r = parseVal(a, t.slice(2), c.draft);
            if (r.err === 'novalue') { log({ raw: line, err: 'incomplete' }); return 'value parse error before \'\''; }
            if (r.err === 'ds') { const bt = t[2 + r.at]; log({ raw: line, err: 'ds' }); return 'entry not found in datasource\n\nvalue parse error before \'' + bt.t + '\''; }
            if (r.err) { const bt = t[2 + r.at]; log({ raw: line, err: 'value' }); return 'value parse error before \'' + (bt ? bt.t : '') + '\''; }
            let val = r.v;
            if (v.ok === 'append') val = [...new Set((c.draft[an] || []).concat(r.v))];
            if (v.ok === 'unselect') { val = (c.draft[an] || []).filter(x => !r.v.includes(x)); }
            if (Array.isArray(val) && !val.length) delete c.draft[an]; else c.draft[an] = val;
            log({ raw: line, canon: v.ok + ' ' + an + ' ' + (Array.isArray(r.v) ? r.v.join(' ') : r.v), path: c.path, key: c.key });
            return '';
        }

        // ── ? ve Tab
        const VERB_H = { config: 'Nesne yapılandır', show: 'Yapılandırmayı göster', get: 'Durum / sistem bilgisi', execute: 'Anlık komut çalıştır (ping…)', diagnose: 'Tanılama', exit: 'CLI\'dan çık',
            edit: 'Nesne düzenle / oluştur', delete: 'Nesneyi sil', end: 'Kaydet ve çık', abort: 'Kaydetmeden çık', move: 'Kural sırasını değiştir', set: 'Özellik ata', unset: 'Özelliği varsayılana döndür',
            append: 'Listeye ekle', unselect: 'Listeden çıkar', next: 'Kaydet, tabloya dön' };
        function candidates(raw) {
            // satırın son kelimesinden önceki kısma göre olası sonraki kelimeler: [[kelime, açıklama]]
            const t = tok(raw), trailing = raw === '' || /\s$/.test(raw);
            const done = trailing ? t : t.slice(0, -1);
            const c = S.ctx;
            const verbList = !c ? ['config', 'show', 'get', 'execute', 'diagnose', 'exit'] : (c.key !== undefined || c.single) ? ['set', 'unset', 'append', 'unselect', 'show', 'get', 'end', 'abort'].concat(c.single ? [] : ['next']) : ['edit', 'delete', 'show', 'get', 'end', 'abort'].concat(SCHEMA[c.path].move ? ['move'] : []);
            if (!done.length) return verbList.map(w => [w, VERB_H[w] || '']);
            const v = pick(done[0].t, verbList);
            if (!v.ok) return null;
            if (!c && (v.ok === 'config' || v.ok === 'show' || v.ok === 'get')) {
                let i = 1;
                if (v.ok === 'show' && done[1] && 'full-configuration'.startsWith(done[1].t.toLowerCase()) && done[1].t.length > 1) i = 2;
                const words = done.slice(i).map(x => x.t);
                let cands = PATHS.map(p => p.split(' ')).concat(v.ok === 'get' ? GETS.map(g => g.split(' ')) : []);
                for (let k = 0; k < words.length; k++) {
                    const opts = [...new Set(cands.filter(x => x.length > k).map(x => x[k]))];
                    const r = pick(words[k], opts);
                    if (!r.ok) return null;
                    cands = cands.filter(x => x[k] === r.ok);
                }
                const k = words.length;
                const PH = { system: 'Sistem ayarları', firewall: 'Güvenlik duvarı nesneleri ve kuralları', router: 'Yönlendirme', global: 'Genel sistem ayarları', dns: 'DNS sunucuları',
                    interface: 'Arayüzler', admin: 'Yönetici hesapları', address: 'Adres nesneleri', addrgrp: 'Adres grupları', service: 'Servis nesneleri', custom: 'Özel servisler', group: 'Servis grupları',
                    ippool: 'Kaynak NAT havuzları', vip: 'Sanal IP (hedef NAT)', policy: 'Güvenlik kuralları', static: 'Statik rotalar', status: 'Sürüm, seri no, mod', info: 'Yönlendirme bilgisi', 'routing-table': 'Yönlendirme tablosu', all: 'Tüm rotalar' };
                const res = [...new Set(cands.filter(x => x.length > k).map(x => x[k]))].map(w => [w, PH[w] || '']);
                if (v.ok === 'show' && i === 1 && !words.length) res.unshift(['full-configuration', 'Varsayılanlar dahil tüm yapılandırma']);
                if (cands.some(x => x.length === k) && k) res.push(['<Enter>', '']);
                return res;
            }
            if (!c && v.ok === 'execute') return done.length === 1 ? [['ping', 'ICMP erişilebilirlik testi']] : done.length === 2 ? [['<ip>', 'Hedef IP']] : [];
            if (c && (c.key !== undefined || c.single) && ['set', 'unset', 'append', 'unselect'].includes(v.ok)) {
                const sc = SCHEMA[c.path];
                if (done.length === 1) return Object.entries(sc.attrs).filter(([k, a]) => a.t !== 'ro' && (!a.when || a.when(c.draft)) && (v.ok === 'set' || v.ok === 'unset' || ['refs', 'menum', 'ports'].includes(a.t))).map(([k, a]) => [k, a.d || '']);
                const a = sc.attrs[done[1].t.toLowerCase()];
                if (!a || v.ok === 'unset') return [];
                if (a.t === 'enum' || a.t === 'menum') return a.v.map(x => [x, '']);
                if (a.t === 'ref' || a.t === 'refs') return DS[a.ds]().filter(x => x !== 'none' || a.ds !== 'addrgrpMember').map(x => [x, '']);
                return [[{ str: '<string>', int: '<' + a.min + '-' + a.max + '>', ip: '<A.B.C.D>', ipmask: '<A.B.C.D A.B.C.D> ya da <A.B.C.D/uz>', iprange: '<A.B.C.D[-A.B.C.D]>', iprangeq: '<A.B.C.D[-A.B.C.D]>', ports: '<port[-port]>', port1: '<port[-port]>', secret: '<parola>' }[a.t] || '<değer>', a.d || '']];
            }
            if (c && c.key === undefined && !c.single && (v.ok === 'edit' || v.ok === 'delete')) {
                const sc = SCHEMA[c.path];
                return M().t[c.path].o.filter(k => !M().t[c.path].v[k]._builtin).map(k => [k, '']).concat(v.ok === 'edit' && !sc.fixed ? [[sc.num ? '<0>' : '<yeni ad>', sc.num ? 'Sıradaki boş ID ile yeni kayıt' : 'Yeni kayıt']] : []);
            }
            if (c && (v.ok === 'show' || v.ok === 'get')) return [['<Enter>', '']].concat(v.ok === 'show' && done.length === 1 ? [['full-configuration', 'Varsayılanlar dahil']] : []);
            return [];
        }
        function help(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            const trailing = raw === '' || /\s$/.test(raw);
            const list = candidates(raw);
            if (list === null) return 'command parse error before \'' + (tok(raw).slice(-1)[0] || { t: '' }).t + '\'';
            const t = tok(raw), part = trailing ? '' : t[t.length - 1].t.toLowerCase();
            const rows = list.filter(([w]) => !part || String(w).toLowerCase().startsWith(part));
            return rows.map(([w, d]) => pad(w, 22) + d).join('\n');
        }
        function complete(raw) {
            if (S.pending || S.loggedOut || raw === '' || /\s$/.test(raw)) return null;
            const list = candidates(raw);
            if (!list) return null;
            const t = tok(raw), part = t[t.length - 1];
            const hits = list.map(x => String(x[0])).filter(w => !w.startsWith('<') && w.toLowerCase().startsWith(part.t.toLowerCase()));
            if (hits.length !== 1) return null;
            const w = /\s/.test(hits[0]) ? qt(hits[0]) : hits[0];
            return raw.slice(0, part.o) + w + ' ';
        }

        // başlangıç yapılandırması
        if (lab.start) { lab.start.forEach(l => input(l)); S.ctx = null; S.ev = []; S.hist = []; }

        const E = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            after: (a, b) => { const i = S.ev.findIndex(e => e.canon && a.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && b.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            err: k => S.ev.some(e => e.err === k),
            // re verilirse yalnız o satır için istenen yardım sayılır (ör. /^config\s/)
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon),
            list: () => S.ev
        };
        // görev kontrolleri için okuma yardımcıları (kaydedilmiş = next/end sonrası durum)
        const obj = (p, k) => { const sc = SCHEMA[p], o = sc.single ? M().t[p] : M().t[p].v[k]; if (!o) return null; const r = {}; for (const [an, a] of Object.entries(sc.attrs)) r[an] = o[an] !== undefined ? o[an] : a.def; return r; };
        return {
            vendor: 'fortigate',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            _toRoot: () => { S.ctx = null; S.pending = null; S.loggedOut = false; },
            get model() { return S.m; }, ev: E, mode: () => (S.ctx ? (S.ctx.key !== undefined ? 'edit' : 'config') : 'root'),
            obj, keys: p => M().t[p].o.filter(k => !M().t[p].v[k]._builtin), order: p => M().t[p].o.slice(),
            rib, ifUp, saved: () => !S.ctx,
            showRun: () => PATHS.map(p => showPath(p, undefined, false)).join('\n'),
        };
    }
    return { session, SCHEMA };
})();
if (typeof module !== 'undefined') module.exports = CgLabFgt;
