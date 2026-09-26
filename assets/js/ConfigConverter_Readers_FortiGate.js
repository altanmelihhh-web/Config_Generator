'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── FortiGate Reader ──────────────────────────────────────────────────────────
function ccReadFortiGate(text) {
    const ir = ccEmptyIR();
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    // block values: 'iface'|'route'|'policy'|'addr'|'addrgrp'|'svc'|'vip'|'ippool'|'dns'|'ntp'|'syslogd'
    let block = null;
    let curIface = null, curPolicy = null, curAddr = null, curSvc = null;
    let curVip = null, curPool = null, curAddrGrp = null, curZone = null;
    let curTunnel = null, curVdom = null, curSdwanMember = null, curSdwanHC = null;
    let sdwStack = [], sdwMemberById = {};
    let subDepth = 0; // sdwan/vdom içindeki nested 'config ... end' bloklarını saymak için

    // Helper: parse quoted tokens from a "set member" line — handles "A" "B" "C"
    function parseQuotedTokens(str) {
        const tokens = [];
        const re = /"([^"]+)"/g;
        let m;
        while ((m = re.exec(str)) !== null) tokens.push(m[1]);
        // fallback: if no quotes, split by whitespace
        if (tokens.length === 0) str.trim().split(/\s+/).forEach(t => { if (t) tokens.push(t); });
        return tokens;
    }

    // VIP kaydı kapanırken: port yönlendirme kapalıysa port alanları IR'ye taşınmaz (FortiOS yok sayar).
    function _vipDone(v) {
        if (!v.portForward) { delete v.portForward; delete v.proto; delete v.origPort; delete v.transPort; delete v.portMapType; }
        return v;
    }
    const _mask2len = m => ccMaskToPrefix(m || '255.255.255.255');
    // Tablo gövdesini (edit … next) kayıtlara böl: [{ key, sets: {ad: değer}, subs: { tablo: [...] } }] (tek düzey alt tablo yeterli)
    function _fgTable(body, name) {
        const out = []; let k = body.indexOf('config ' + name); if (k < 0) return out;
        let cur = null, depth = 0;
        for (let j = k + 1; j < body.length; j++) {
            const l = body[j];
            if (depth === 0 && l === 'end') break;
            if (/^config\s/.test(l)) { depth++; continue; }
            if (l === 'end') { depth--; continue; }
            if (depth > 0) continue;
            if (l.startsWith('edit ')) { cur = { key: l.slice(5).replace(/"/g, '').trim(), sets: {} }; out.push(cur); }
            else if (l === 'next') cur = null;
            else if (cur && l.startsWith('set ')) { const m = l.match(/^set\s+(\S+)\s*(.*)$/); if (m) cur.sets[m[1]] = m[2]; }
        }
        return out;
    }
    // Üst düzey "set" satırları (iç içe tabloların dışındakiler)
    function _fgTop(body) { const o = {}; let depth = 0; body.forEach(l => { if (/^config\s/.test(l)) depth++; else if (l === 'end') depth--; else if (depth === 0) { const m = l.match(/^set\s+(\S+)\s*(.*)$/); if (m) o[m[1]] = m[2]; } }); return o; }
    // İki biçim: "config redistribute / edit \"connected\"" ve cihazın show çıktısındaki
    // "config redistribute \"connected\" … end" (Fortinet Community OSPF/BGP örnekleri; 7.6.6 CLI Ref).
    const _redist = body => {
        const out = _fgTable(body, 'redistribute').filter(r => /enable/.test(r.sets.status || '')).map(r => r.key);
        let depth = 0, cur = null;
        body.forEach(l => {
            const m = depth === 0 && l.match(/^config redistribute "([^"]+)"$/);
            if (m) { cur = { k: m[1], on: false }; depth++; return; }
            if (/^config\s/.test(l)) { depth++; return; }
            if (l === 'end') { depth--; if (depth === 0 && cur) { if (cur.on && !out.includes(cur.k)) out.push(cur.k); cur = null; } return; }
            if (cur && depth === 1 && /^set status enable\b/.test(l)) cur.on = true;
        });
        return out;
    };
    function _fgParseOspf(body) {
        const top = _fgTop(body), rid = (top['router-id'] || '').trim();
        const proc = { process_id: '1', router_id: rid === '0.0.0.0' ? '' : rid, areas: [] };
        _fgTable(body, 'area').forEach(a => proc.areas.push({ id: a.key, networks: [], auth: (a.sets.authentication || '').trim() === 'none' ? '' : (a.sets.authentication || '').trim() }));
        _fgTable(body, 'network').forEach(n => {
            const p = (n.sets.prefix || '').trim().split(/\s+/), aid = (n.sets.area || '0.0.0.0').trim();
            if (!p[0]) return;
            let area = proc.areas.find(a => a.id === aid); if (!area) { area = { id: aid, networks: [], auth: '' }; proc.areas.push(area); }
            area.networks.push(p[0] + '/' + _mask2len(p[1]));
        });
        if (top['passive-interface']) proc.passive_interfaces = parseQuotedTokens(top['passive-interface']);
        const rd = _redist(body); if (rd.length) proc.redistribute = rd;
        // Tam yapılandırmadaki boş (yapılandırılmamış) OSPF bloğu IR'ye alınmaz
        if (proc.router_id || proc.areas.some(a => a.networks.length)) ir.ospf.push(proc);
    }
    function _fgParseBgp(body) {
        const top = _fgTop(body), as = (top.as || '').replace(/"/g, '').trim(), rid = (top['router-id'] || '').trim();
        if (!as || as === '0') return;   // as 0 = BGP kapalı
        const bgp = { as_number: as, router_id: rid === '0.0.0.0' ? '' : rid, neighbors: [], networks: [] };
        _fgTable(body, 'neighbor').forEach(n => bgp.neighbors.push({ ip: n.key, remote_as: (n.sets['remote-as'] || '').replace(/"/g, '').trim(), desc: (n.sets.description || '').replace(/"/g, ''), bfd: /enable/.test(n.sets.bfd || '') || undefined }));
        _fgTable(body, 'network').forEach(n => { const p = (n.sets.prefix || '').trim().split(/\s+/); if (p[0] && p[0] !== '0.0.0.0') bgp.networks.push(p[0] + '/' + _mask2len(p[1])); });
        const rd = _redist(body); if (rd.length) bgp.redistribute = rd;
        ir.bgp = bgp;
    }

    // Kaynak sürüm (#config-version=MODEL-7.6.5-FW-...) — faz 1 varsayılanları sürüme bağlı.
    const _srcVer = ((text.split('\n').slice(0, 5).find(l => l.indexOf('#config-version=') === 0) || '').match(/-(\d+)\.(\d+)\.(\d+)-FW-/) || []).slice(1).map(Number);
    // FortiOS CLI Ref (phase1-interface): ike-version varsayılanı 1 (7.4.8 ve 7.6.6);
    // dhgrp varsayılanı 7.4.8'de 14, 7.6.5 RN "Changes in default behavior" sonrası 20 21 (modele göre değişebilir).
    function _p1Defaults(t) {
        if (!t) return;
        if (!t.ikeVersion) {
            t.ikeVersion = '1';
            ccAddAssumption(ir, 'vpn ipsec phase1-interface ike-version', '1', 'FortiOS varsayilani',
                "kaynakta 'set ike-version' yok (" + t.p1Name + ')', CC_SEVERITY.MANUAL);
        }
        if (!t.dhgrp) {
            const v765 = _srcVer.length === 3 && (_srcVer[0] > 7 || (_srcVer[0] === 7 && (_srcVer[1] > 6 || (_srcVer[1] === 6 && _srcVer[2] >= 5))));
            t.dhgrp = v765 ? '20 21' : '14';
            ccAddAssumption(ir, 'vpn ipsec phase1-interface dhgrp', t.dhgrp, 'FortiOS varsayilani (' + (_srcVer.length ? _srcVer.join('.') : 'surum bilinmiyor → 7.4') + ')',
                "kaynakta 'set dhgrp' yok (" + t.p1Name + '); model/surume gore degisebilir', CC_SEVERITY.MANUAL);
        }
    }

    while (i < lines.length) {
        const line = lines[i].trim();

        // ── block header detection ─────────────────────────────────────────────
        if (line === 'config system interface')        { block = 'iface';   i++; continue; }
        if (line === 'config router static')           { block = 'route';   i++; continue; }
        if (line === 'config firewall policy')         { block = 'policy';  i++; continue; }
        if (line === 'config firewall address')        { block = 'addr';    i++; continue; }
        if (line === 'config firewall addrgrp')        { block = 'addrgrp'; i++; continue; }
        if (line === 'config firewall service custom') { block = 'svc';     i++; continue; }
        if (line === 'config firewall service group')  { block = 'svcgrp';  i++; continue; }
        if (line === 'config system zone')             { block = 'zone';    i++; continue; }
        if (line === 'config firewall vip')            { block = 'vip';     i++; continue; }
        if (line === 'config firewall ippool')         { block = 'ippool';  i++; continue; }
        if (line === 'config system dns')              { block = 'dns';     i++; continue; }
        if (line === 'config system ntp')              { block = 'ntp';     i++; continue; }
        if (line === 'config vpn ipsec phase1-interface') { block = 'ipsecp1'; i++; continue; }
        if (line === 'config vpn ipsec phase2-interface') { block = 'ipsecp2'; i++; continue; }
        if (line === 'config vpn ssl web portal')      { block = 'sslportal'; i++; continue; }
        if (line === 'config vpn ssl settings')        { block = 'sslsettings'; i++; continue; }
        // Standalone UTM profil tanımları (av/ips/webfilter/applist): profil-policy bağlantısı
        // zaten 'policy' bloğundaki set av-profile/ips-sensor/webfilter-profile/application-list
        // satırlarından (pol.profile) okunuyor; bu blokların içeriği burada ayrıntılı parse edilmiyor,
        // sadece "unknowns" gürültüsüne düşmemesi için sessizce atlanıyor.
        if (line === 'config antivirus profile' ||
            line === 'config ips sensor' ||
            line === 'config webfilter profile' ||
            line === 'config application list')        { block = 'skip'; i++; continue; }
        if (line === 'config system sdwan')            { block = 'sdwan'; subDepth = 0; sdwStack = []; sdwMemberById = {}; curSdwanMember = null; curSdwanHC = null; i++; continue; }
        if (line === 'config system ha')               { block = 'ha';      i++; continue; }
        if (line === 'config router policy')           { block = 'pbr';     i++; continue; }
        if (line === 'config vdom')                    { block = 'vdom'; subDepth = 0; i++; continue; }
        if (line === 'config global')                  { block = 'fgglobal'; subDepth = 0; i++; continue; }
        // FortiOS syslog block variants
        if (line === 'config system syslogd' ||
            line === 'config log syslogd setting' ||
            line.startsWith('config log syslogd')) { block = 'syslogd'; i++; continue; }
        // OSPF / BGP: blok iç içe config … end içerir; sonuna kadar toplanıp ayrıştırılır
        // (önceden "config router" atlanıyor, iç içe ilk "end" bloğu erken kapatıp kalan satırları unknowns'a düşürüyordu)
        if (line === 'config router ospf' || line === 'config router bgp') {
            const body = []; let depth = 0; i++;
            while (i < lines.length) {
                const l = lines[i].trim();
                if (/^config\s/.test(l)) depth++;
                else if (l === 'end') { if (depth === 0) break; depth--; }
                body.push(l); i++;
            }
            if (line === 'config router ospf') _fgParseOspf(body); else _fgParseBgp(body);
            i++; continue;
        }
        // Silently skip known unhandled config blocks
        if (line === 'config system global' ||
            line.startsWith('config firewall schedule') ||
            line.startsWith('config firewall profile') ||
            line.startsWith('config vpn') ||
            (block !== 'fgglobal' && line.startsWith('config system admin')) ||
            line.startsWith('config router')) { block = 'skip'; i++; continue; }

        if (line === 'end') {
            // sdwan/vdom içindeki nested 'config ... / end' çiftini kapat, ana bloğu kapatma
            if ((block === 'sdwan' || block === 'vdom' || block === 'fgglobal') && subDepth > 0) {
                subDepth--;
                if (block === 'sdwan') { const t = sdwStack.pop(); if (t === 'members') curSdwanMember = null; if (t === 'health-check') curSdwanHC = null; }
                i++; continue;
            }
            // flush any pending objects
            if (block === 'addr'    && curAddr)    { ir.addressObjects.push(curAddr);    curAddr    = null; }
            if (block === 'addrgrp' && curAddrGrp) { ir.addressObjects.push(curAddrGrp); curAddrGrp = null; }
            if (block === 'svc'     && curSvc)     { ir.serviceObjects.push(curSvc);     curSvc     = null; }
            if (block === 'svcgrp'  && curSvc)     { ir.serviceObjects.push(curSvc);     curSvc     = null; }
            if (block === 'zone'    && curZone)    { ir.zones.push(curZone);             curZone    = null; }
            if (block === 'vip'     && curVip)     { ir.natRules.push(_vipDone(curVip));  curVip     = null; }
            if (block === 'ippool'  && curPool)    { ir.natRules.push(curPool);           curPool    = null; }
            if (block === 'sslsettings' && ir.sslVpn) { /* zaten ir.sslVpn üzerinde birikti */ }
            block = null; curIface = null; curPolicy = null; curTunnel = null; curVdom = null;
            i++; continue;
        }

        // ── system dns block ───────────────────────────────────────────────────
        if (block === 'dns') {
            if (line.startsWith('set primary '))   { const ip = line.slice(12).trim(); if (ip) ir.system.dns.push(ip); }
            else if (line.startsWith('set secondary ')) { const ip = line.slice(13).trim(); if (ip) ir.system.dns.push(ip); }
        }

        // ── system ntp block ───────────────────────────────────────────────────
        else if (block === 'ntp') {
            // top-level: set ntpserver X.X.X.X
            if (line.startsWith('set ntpserver ')) {
                const ip = line.slice(14).trim(); if (ip) ir.system.ntp.push(ip);
            // inside edit sub-blocks: set server X.X.X.X
            } else if (line.startsWith('set server ')) {
                const ip = line.slice(11).trim().replace(/"/g, ''); if (ip) ir.system.ntp.push(ip);
            }
        }

        // ── syslog block ───────────────────────────────────────────────────────
        else if (block === 'syslogd') {
            if (line.startsWith('set server ')) {
                const ip = line.slice(11).trim().replace(/"/g, '');
                if (ip) ir.system.syslog.push(ip);
            }
        }

        // ── interface block ────────────────────────────────────────────────────
        else if (block === 'iface') {
            if (line.startsWith('edit "')) {
                const name = line.slice(6, -1);
                curIface = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: name, security_level: '', mtu: 0 };
                ir.interfaces.push(curIface);
            } else if (curIface && line.startsWith('set ip ')) {
                const p = line.slice(7).split(' '); curIface.ip = p[0]; curIface.mask = p[1] || '';
            } else if (curIface && line.startsWith('set alias ')) {
                curIface.desc = line.slice(10).replace(/"/g, '');
            } else if (curIface && line.startsWith('set description ')) {
                curIface.desc = curIface.desc || line.slice(16).replace(/"/g, '');
            } else if (curIface && line.startsWith('set vlanid ')) {
                const vid = parseInt(line.slice(11).trim(), 10);
                if (!isNaN(vid)) curIface.access_vlan = vid;
            } else if (curIface && line.startsWith('set interface ')) {
                // Subif parent: bilgi notu — name zaten "<parent>.<vid>" formatında geliyor.
                // Reader gerçek parent'ı ayrıca tutmayı gerektirmiyor.
            } else if (curIface && line.startsWith('set type ')) {
                // 'set type vlan' subif olduğunu söyler — name zaten ima ediyor.
            } else if (curIface && line.startsWith('set mtu ')) {
                const v = parseInt(line.slice(8).trim(), 10);
                if (!isNaN(v)) curIface.mtu = v;
            } else if (curIface && line === 'set status down') {
                curIface.shutdown = true;
            } else if (curIface && line === 'set status up') {
                curIface.shutdown = false;
            } else if (curIface && line.startsWith('set role ')) {
                // role bilgisi nameif yerine kullanılabilir (zone hint)
                if (!curIface.nameif || curIface.nameif === curIface.name) {
                    curIface.nameif = line.slice(9).trim();
                }
            } else if (line === 'next') { curIface = null; }
        }

        // ── static route block ─────────────────────────────────────────────────
        else if (block === 'route' && line.startsWith('set dst ')) {
            const dst = line.slice(8).split(' ');
            const route = { network: dst[0] || '', mask: dst[1] || '', nexthop: '', metric: '1', iface: '' };
            i++;
            while (i < lines.length && lines[i].trim() !== 'next') {
                const sub = lines[i].trim();
                if (sub.startsWith('set gateway ')) route.nexthop = sub.slice(12);
                else if (sub.startsWith('set device ')) route.iface = sub.slice(11).replace(/"/g, '');
                i++;
            }
            ir.routes.push(route);
            i++; continue;
        }

        // ── firewall address block (host/network/fqdn) ─────────────────────────
        else if (block === 'addr') {
            if (line.startsWith('edit "')) {
                if (curAddr) ir.addressObjects.push(curAddr);
                curAddr = { name: line.slice(6, -1), type: 'network', value: '', mask: '', members: [], description: '' };
            } else if (curAddr && line.startsWith('set subnet ')) {
                const p = line.slice(11).split(' ');
                const subnet = p[0]; const mask = p[1] || '255.255.255.255';
                curAddr.value = subnet; curAddr.mask = mask;
                curAddr.type = (mask === '255.255.255.255') ? 'host' : 'network';
            } else if (curAddr && line.startsWith('set fqdn ')) {
                curAddr.type = 'fqdn'; curAddr.value = line.slice(9).replace(/"/g, '');
            } else if (curAddr && line.startsWith('set type ')) {
                // ipmask (varsayılan) | iprange | fqdn | geography | wildcard | dynamic | interface-subnet | mac
                const t = line.slice(9).trim();
                if (t === 'iprange') curAddr.type = 'range';
                else if (t === 'fqdn') curAddr.type = 'fqdn';
                else if (t !== 'ipmask') { curAddr.type = t; curAddr.value = ''; }
            } else if (curAddr && curAddr.type === 'geography' && line.startsWith('set country ')) {
                curAddr.value = line.slice(12).replace(/"/g, '').trim();
            } else if (curAddr && curAddr.type === 'mac' && line.startsWith('set macaddr ')) {
                curAddr.value = parseQuotedTokens(line.slice(12)).join(' ');
            } else if (curAddr && curAddr.type === 'wildcard' && line.startsWith('set wildcard ')) {
                curAddr.value = line.slice(13).trim();
            } else if (curAddr && curAddr.type === 'range' && line.startsWith('set start-ip ')) {
                const st = line.slice(13).trim(); const r = String(curAddr.value || '').split('-');
                curAddr.value = st + '-' + (r[1] || st);
            } else if (curAddr && curAddr.type === 'range' && line.startsWith('set end-ip ')) {
                const r = String(curAddr.value || '').split('-');
                curAddr.value = (r[0] || '') + '-' + line.slice(11).trim();
            } else if (curAddr && line.startsWith('set comment ')) {
                curAddr.description = line.slice(12).replace(/"/g, '');
            } else if (line === 'next') { if (curAddr) { ir.addressObjects.push(curAddr); curAddr = null; } }
        }

        // ── firewall addrgrp block ─────────────────────────────────────────────
        else if (block === 'addrgrp') {
            if (line.startsWith('edit "')) {
                if (curAddrGrp) ir.addressObjects.push(curAddrGrp);
                curAddrGrp = { name: line.slice(6, -1), type: 'group', value: '', mask: '', members: [], description: '' };
            } else if (curAddrGrp && line.startsWith('set member ')) {
                curAddrGrp.members = parseQuotedTokens(line.slice(11));
            } else if (curAddrGrp && line.startsWith('set comment ')) {
                curAddrGrp.description = line.slice(12).replace(/"/g, '');
            } else if (line === 'next') { if (curAddrGrp) { ir.addressObjects.push(curAddrGrp); curAddrGrp = null; } }
        }

        // ── firewall service block ─────────────────────────────────────────────
        else if (block === 'svc') {
            if (line.startsWith('edit "')) {
                if (curSvc) ir.serviceObjects.push(curSvc);
                curSvc = { name: line.slice(6, -1), proto: 'tcp', ports: '' };
            } else if (curSvc && line.startsWith('set tcp-portrange ')) {
                // TCP ve UDP aralığı aynı nesnede birlikte olabilir: ikisi ayrı saklanır
                // (proto/ports ilk görülen için; diğer vendor yazıcıları bunları kullanır).
                curSvc.tcpPorts = line.slice(18).trim();
                if (!curSvc.ports) { curSvc.proto = 'tcp'; curSvc.ports = curSvc.tcpPorts; }
            } else if (curSvc && line.startsWith('set udp-portrange ')) {
                curSvc.udpPorts = line.slice(18).trim();
                if (!curSvc.ports) { curSvc.proto = 'udp'; curSvc.ports = curSvc.udpPorts; }
            } else if (curSvc && line.startsWith('set sctp-portrange ')) {
                curSvc.sctpPorts = line.slice(19).trim();
                if (!curSvc.ports) { curSvc.proto = 'sctp'; curSvc.ports = curSvc.sctpPorts; }
            } else if (curSvc && line.startsWith('set protocol ')) {
                const pr = line.slice(13).trim().toUpperCase();
                if (pr === 'ICMP' || pr === 'ICMP6') curSvc.proto = pr.toLowerCase();
                else if (pr === 'IP') curSvc.proto = 'ip';
            } else if (curSvc && line.startsWith('set icmptype ')) {
                curSvc.icmptype = line.slice(13).trim();
            } else if (curSvc && line.startsWith('set protocol-number ')) {
                curSvc.proto = 'ip'; curSvc.protoNum = line.slice(20).trim();
            } else if (line === 'next') { if (curSvc) { ir.serviceObjects.push(curSvc); curSvc = null; } }
        }

        // ── firewall service group ─────────────────────────────────────────────
        else if (block === 'svcgrp') {
            if (line.startsWith('edit "')) {
                if (curSvc) ir.serviceObjects.push(curSvc);
                curSvc = { name: line.slice(6, -1), proto: '', ports: '', members: [] };
            } else if (curSvc && line.startsWith('set member ')) {
                curSvc.members = parseQuotedTokens(line.slice(11));
            } else if (line === 'next') { if (curSvc) { ir.serviceObjects.push(curSvc); curSvc = null; } }
        }

        // ── system zone ────────────────────────────────────────────────────────
        else if (block === 'zone') {
            if (line.startsWith('edit "')) {
                if (curZone) ir.zones.push(curZone);
                curZone = { name: line.slice(6, -1), interfaces: [], description: '', trust_level: 0 };
            } else if (curZone && line.startsWith('set interface ')) {
                curZone.interfaces = parseQuotedTokens(line.slice(14));
            } else if (curZone && line.startsWith('set intrazone ')) {
                curZone.intrazone = line.slice(14).trim();
            } else if (curZone && line.startsWith('set description ')) {
                curZone.description = line.slice(16).replace(/"/g, '');
            } else if (line === 'next') { if (curZone) { ir.zones.push(curZone); curZone = null; } }
        }

        // ── firewall vip block (static NAT / DNAT) ────────────────────────────
        else if (block === 'vip') {
            if (line.startsWith('edit "')) {
                if (curVip) ir.natRules.push(_vipDone(curVip));
                curVip = { type: 'static', name: line.slice(6, -1), origSrc: 'any', transSrc: '', origDst: '', transDst: '', iface: '', bidirectional: false };
            } else if (curVip && line.startsWith('set extip ')) {
                curVip.origDst = line.slice(10).trim();
            } else if (curVip && line.startsWith('set mappedip ')) {
                // "set mappedip X.X.X.X" or "set mappedip X.X.X.X-Y.Y.Y.Y" (range)
                curVip.transDst = line.slice(13).trim().replace(/"/g, '');
            } else if (curVip && line.startsWith('set extintf ')) {
                curVip.iface = line.slice(12).replace(/"/g, '').trim();
            // Port yönlendirme (FortiOS 7.4.8/7.6.6 CLI Ref, config firewall vip): portforward
            // varsayılanı disable, protocol varsayılanı tcp; extport/mappedport tek port ya da aralık.
            // Okunmazsa kural tüm portları açan 1:1 statik NAT'a dönüşür.
            } else if (curVip && line.startsWith('set portforward ')) {
                curVip.portForward = line.slice(16).trim() === 'enable';
                if (curVip.portForward && !curVip.proto) curVip.proto = 'tcp';
            } else if (curVip && line.startsWith('set protocol ')) {
                curVip.proto = line.slice(13).trim().toLowerCase();
            } else if (curVip && line.startsWith('set extport ')) {
                curVip.origPort = line.slice(12).replace(/"/g, '').trim();
            } else if (curVip && line.startsWith('set mappedport ')) {
                curVip.transPort = line.slice(15).replace(/"/g, '').trim();
            } else if (curVip && line.startsWith('set portmapping-type ')) {
                curVip.portMapType = line.slice(21).trim();
            } else if (line === 'next') { if (curVip) { ir.natRules.push(_vipDone(curVip)); curVip = null; } }
        }

        // ── firewall ippool block (dynamic NAT/PAT) ───────────────────────────
        else if (block === 'ippool') {
            if (line.startsWith('edit "')) {
                if (curPool) ir.natRules.push(curPool);
                curPool = { type: 'dynamic', name: line.slice(6, -1), origSrc: 'any', transSrc: '', origDst: 'any', transDst: '', iface: '', bidirectional: false, _startip: '', _endip: '', _pooltype: 'overload' };
            } else if (curPool && line.startsWith('set startip ')) {
                curPool._startip = line.slice(12).trim();
            } else if (curPool && line.startsWith('set endip ')) {
                curPool._endip = line.slice(10).trim();
            } else if (curPool && line.startsWith('set type ')) {
                curPool._pooltype = line.slice(9).trim(); // 'overload' (PAT) or 'one-to-one'
            } else if (curPool && line.startsWith('set ') && !/^set (comments|arp-reply) /.test(line)) {
                // source-startip/endip, block-size, port-per-user … taşınmıyor: açık uyarı
                const m = line.match(/^set\s+(\S+)\s*(.*)$/);
                ccDropField(ir, 'natRules', curPool.name, m[1], m[2], 'fortigate-ippool-field-not-converted-manual', 'fortigate', CC_SEVERITY.MANUAL);
            } else if (line === 'next') {
                if (curPool) {
                    curPool.transSrc = curPool._startip + (curPool._endip && curPool._endip !== curPool._startip ? '-' + curPool._endip : '');
                    // FortiOS CLI Ref config firewall ippool: type varsayılanı overload; diğerleri IR'ye taşınır
                    if (curPool._pooltype && curPool._pooltype !== 'overload') curPool.poolType = curPool._pooltype;
                    delete curPool._startip; delete curPool._endip; delete curPool._pooltype;
                    ir.natRules.push(curPool); curPool = null;
                }
            }
        }

        // ── firewall policy block → securityPolicies ──────────────────────────
        else if (block === 'policy') {
            if (line.startsWith('edit ')) {
                const policyId = line.slice(5).trim();
                curPolicy = {
                    name: 'policy_' + policyId,
                    seq: parseInt(policyId) || 0,
                    srcZone: '', dstZone: '',
                    srcAddr: [], dstAddr: [],
                    service: [],
                    // FortiOS varsayılanı deny'dir: 'set action' satırı yoksa policy trafiği
                    // engeller, izin için 'set action accept' yazılması gerekir. Yöneticiler
                    // deny kuralında bu satırı yazmaz — 'allow' varsaymak fail-open üretir.
                    action: 'deny',
                    _actionExplicit: false,
                    enabled: true,
                    log: true,
                    logMode: 'utm',      // FortiOS varsayılanı (CLI Ref 7.4.8 firewall policy: logtraffic utm)
                    schedule: 'always',
                    profile: {},
                    // internal scratch fields for service resolution
                    _service: ''
                };
                ir.securityPolicies.push(curPolicy);
            } else if (curPolicy) {
                if (line.startsWith('set name ')) {
                    curPolicy.name = line.slice(9).replace(/"/g, '');
                } else if (line.startsWith('set srcintf ')) {
                    curPolicy.srcZone = line.slice(12).replace(/"/g, '').trim();
                } else if (line.startsWith('set dstintf ')) {
                    curPolicy.dstZone = line.slice(12).replace(/"/g, '').trim();
                } else if (line.startsWith('set srcaddr ')) {
                    // may be "addr1" "addr2" ...
                    curPolicy.srcAddr = parseQuotedTokens(line.slice(12));
                    if (curPolicy.srcAddr.length === 0) {
                        const raw = line.slice(12).replace(/"/g, '').trim();
                        if (raw) curPolicy.srcAddr = [raw];
                    }
                } else if (line.startsWith('set dstaddr ')) {
                    curPolicy.dstAddr = parseQuotedTokens(line.slice(12));
                    if (curPolicy.dstAddr.length === 0) {
                        const raw = line.slice(12).replace(/"/g, '').trim();
                        if (raw) curPolicy.dstAddr = [raw];
                    }
                } else if (line.startsWith('set service ')) {
                    curPolicy.service = parseQuotedTokens(line.slice(12));
                    if (curPolicy.service.length === 0) {
                        const raw = line.slice(12).replace(/"/g, '').trim();
                        if (raw) curPolicy.service = [raw];
                    }
                    curPolicy._service = curPolicy.service[0] || '';
                } else if (line.startsWith('set action ')) {
                    // FortiOS Ansible modülü (fortios_firewall_policy) kaynağına göre gerçek enum:
                    // accept/deny/ipsec — 'ipsec' policy-based VPN route'tur, deny değildir.
                    // Önceden burada her accept-olmayan değer sessizce 'deny' oluyordu.
                    { const _a = line.slice(11).trim();
                      curPolicy.action = _a === 'accept' ? 'allow' : (_a === 'ipsec' ? 'ipsec' : 'deny');
                      curPolicy._actionExplicit = true; }
                } else if (line.startsWith('set status ')) {
                    // FortiOS'ta policy varsayilan olarak etkindir; 'set status disable'
                    // yazilmissa kural devre disidir. Okunmadiginda devre disi kural
                    // hedef cihaza AKTIF olarak yazilir (fail-open).
                    curPolicy.enabled = !line.includes('disable');
                } else if (line.startsWith('set logtraffic ')) {
                    curPolicy.log = !line.includes('disable');   // diğer yazıcılar için eski anlam korunur
                    const lm = line.slice(15).trim(); if (['all', 'utm', 'disable'].includes(lm)) curPolicy.logMode = lm;
                } else if (line.startsWith('set schedule ')) {
                    curPolicy.schedule = line.slice(13).replace(/"/g, '').trim();
                } else if (line.startsWith('set utm-status ') || line.startsWith('set profile-protocol-options ')) {
                    curPolicy.profile.utm = true;
                } else if (line.startsWith('set av-profile ')) {
                    curPolicy.profile.av = line.slice(15).replace(/"/g, '').trim();
                } else if (line.startsWith('set ips-sensor ')) {
                    curPolicy.profile.ips = line.slice(15).replace(/"/g, '').trim();
                } else if (line.startsWith('set webfilter-profile ')) {
                    curPolicy.profile.webfilter = line.slice(22).replace(/"/g, '').trim();
                } else if (line.startsWith('set application-list ')) {
                    curPolicy.profile.appctrl = line.slice(21).replace(/"/g, '').trim();
                }
            }
            if (line === 'next') {
                // Kaynakta 'set action' yoksa deger FortiOS varsayilanindan (deny)
                // turetilmistir — bu, kullaniciya bildirilmesi gereken bir varsayimdir.
                if (curPolicy && curPolicy._actionExplicit === false) {
                    ccAddAssumption(ir, 'firewall policy action', 'deny',
                        'FortiOS varsayilani', "kaynakta 'set action' satiri yok",
                        CC_SEVERITY.DANGEROUS);
                }
                curPolicy = null;
            }
        }

        // ── IPsec Phase1 ────────────────────────────────────────────────────────
        else if (block === 'ipsecp1') {
            if (line.startsWith('edit "')) {
                // ike-version/dhgrp yazılmamışsa FortiOS varsayılanı geçerlidir; 'next'te doldurulup
                // varsayım olarak bildirilir (önceden sessizce ike-version 2 / dhgrp 14 varsayılıyordu).
                curTunnel = { p1Name: line.slice(6, -1), iface: '', remoteGw: '', psk: '', ikeVersion: '', proposal: 'aes256-sha256', dhgrp: '', p2Name: '', localSubnet: '', remoteSubnet: '' };
                ir.vpnTunnels.push(curTunnel);
            } else if (curTunnel) {
                if (line.startsWith('set interface '))     curTunnel.iface = line.slice(14).replace(/"/g, '').trim();
                else if (line.startsWith('set remote-gw ')) curTunnel.remoteGw = line.slice(14).trim();
                else if (line.startsWith('set psksecret ')) curTunnel.psk = line.slice(14).trim();
                else if (line.startsWith('set ike-version ')) curTunnel.ikeVersion = line.slice(16).trim();
                else if (line.startsWith('set proposal '))  curTunnel.proposal = line.slice(13).trim();
                else if (line.startsWith('set dhgrp '))     curTunnel.dhgrp = line.slice(10).trim();
                else if (line === 'next') { _p1Defaults(curTunnel); curTunnel = null; }
            }
        }

        // ── IPsec Phase2 ────────────────────────────────────────────────────────
        else if (block === 'ipsecp2') {
            if (line.startsWith('edit "')) {
                const p2Name = line.slice(6, -1);
                curTunnel = { _p2Name: p2Name }; // phase1name gelene kadar geçici
            } else if (curTunnel) {
                if (line.startsWith('set phase1name ')) {
                    const p1Name = line.slice(16).replace(/"/g, '').trim();
                    const t = ir.vpnTunnels.find(x => x.p1Name === p1Name);
                    if (t) { t.p2Name = curTunnel._p2Name; curTunnel = t; }
                } else if (line.startsWith('set src-subnet ')) { if (curTunnel.localSubnet !== undefined) curTunnel.localSubnet = line.slice(15).trim(); }
                else if (line.startsWith('set dst-subnet ')) { if (curTunnel.remoteSubnet !== undefined) curTunnel.remoteSubnet = line.slice(15).trim(); }
                else if (line === 'next') curTunnel = null;
            }
        }

        // ── SSL-VPN portal ──────────────────────────────────────────────────────
        else if (block === 'sslportal') {
            if (!ir.sslVpn) ir.sslVpn = { tunnelPoolName: '', poolRange: '', portalName: '', sourceIface: '', port: '10443', userGroup: '' };
            if (line.startsWith('edit "')) ir.sslVpn.portalName = line.slice(6, -1);
            else if (line.startsWith('set ip-pools ')) ir.sslVpn.tunnelPoolName = line.slice(13).replace(/"/g, '').trim();
            else if (line.startsWith('set groups ')) ir.sslVpn.userGroup = line.slice(11).replace(/"/g, '').trim();
        }

        // ── SSL-VPN settings ────────────────────────────────────────────────────
        else if (block === 'sslsettings') {
            if (!ir.sslVpn) ir.sslVpn = { tunnelPoolName: '', poolRange: '', portalName: '', sourceIface: '', port: '10443', userGroup: '' };
            if (line.startsWith('set source-interface ')) ir.sslVpn.sourceIface = line.slice(21).replace(/"/g, '').trim();
            else if (line.startsWith('set port ')) ir.sslVpn.port = line.slice(9).trim();
            else if (line.startsWith('set default-portal ')) ir.sslVpn.portalName = ir.sslVpn.portalName || line.slice(19).replace(/"/g, '').trim();
        }

        // ── HA ──────────────────────────────────────────────────────────────────
        else if (block === 'ha') {
            if (!ir.ha) ir.ha = { mode: 'a-p', groupName: '', password: '', priority: '128', sessionPickup: 'enable', hbInterfaces: [] };
            if (line.startsWith('set mode '))          ir.ha.mode = line.slice(9).trim();
            else if (line.startsWith('set group-name ')) ir.ha.groupName = line.slice(15).replace(/"/g, '').trim();
            else if (line.startsWith('set password '))   ir.ha.password = line.slice(13).replace(/"/g, '').trim();
            else if (line.startsWith('set priority '))    ir.ha.priority = line.slice(13).trim();
            else if (line.startsWith('set session-pickup ')) ir.ha.sessionPickup = line.slice(19).trim();
            else if (line.startsWith('set hbdev ')) {
                const m = line.slice(10).match(/"([^"]+)"/);
                if (m) ir.ha.hbInterfaces.push(m[1]);
            }
        }

        // ── Policy Route (PBR) ──────────────────────────────────────────────────
        else if (block === 'pbr') {
            if (line.startsWith('edit ')) {
                curTunnel = { seq: line.slice(5).trim(), srcAddr: '', dstAddr: '', outInterface: '', gateway: '' };
                ir.pbrRules.push(curTunnel);
            } else if (curTunnel) {
                if (line.startsWith('set src '))            curTunnel.srcAddr = line.slice(8).trim();
                else if (line.startsWith('set dst '))        curTunnel.dstAddr = line.slice(8).trim();
                else if (line.startsWith('set output-device ')) curTunnel.outInterface = line.slice(18).replace(/"/g, '').trim();
                else if (line.startsWith('set gateway '))    curTunnel.gateway = line.slice(12).trim();
                // FortiOS 7.4.8 CLI Ref config router policy: input-device (liste), protocol (0-255, 0 = tümü),
                // start-port/end-port. input-device okunmazsa kural tüm giriş arayüzlerine genişler.
                else if (line.startsWith('set input-device ')) curTunnel.inInterfaces = parseQuotedTokens(line.slice(17));
                else if (line.startsWith('set protocol '))     curTunnel.protocol = line.slice(13).trim();
                else if (line.startsWith('set start-port '))   curTunnel.startPort = line.slice(15).trim();
                else if (line.startsWith('set end-port '))     curTunnel.endPort = line.slice(13).trim();
                else if (line === 'next') curTunnel = null;
                else if (line.startsWith('set ') && line !== 'set status enable') {
                    // Diğer alanlar (action deny, srcaddr/dstaddr, negate, tos, internet-service …) taşınmıyor: açık uyarı
                    const m = line.match(/^set\s+(\S+)\s*(.*)$/);
                    ccDropField(ir, 'pbrRules', curTunnel.seq, m[1], m[2], 'fortigate-pbr-field-not-converted-manual', 'fortigate', CC_SEVERITY.MANUAL);
                }
            }
        }

        // ── SD-WAN (nested config members / config health-check) ──────────────
        else if (block === 'sdwan') {
            // İç içe tablo yığını (zone / members / health-check[/sla] / service …). Önceki sürüm
            // yalnız dört tablo adını sayıyordu: "config zone" sonundaki end SD-WAN bloğunu kapatıyor,
            // service kurallarının "edit <n>" satırları üye sanılıyordu.
            const top = sdwStack[sdwStack.length - 1] || '';
            if (line.startsWith('config ')) {
                sdwStack.push(line.slice(7).trim()); subDepth++;
            } else if (line.startsWith('edit ')) {
                const idOrName = line.slice(5).replace(/"/g, '').trim();
                // Yalnız üye / sağlık denetimi SD-WAN'ı IR'ye taşır (zone tanımı tek başına etkinleştirmez)
                if (sdwStack.length === 1 && (top === 'members' || top === 'health-check') && !ir.sdwan) ir.sdwan = { members: [], healthCheck: null };
                if (sdwStack.length === 1 && top === 'members') {
                    curSdwanMember = { iface: '', gateway: '', cost: '0' };
                    sdwMemberById[idOrName] = curSdwanMember;
                    ir.sdwan.members.push(curSdwanMember);
                } else if (sdwStack.length === 1 && top === 'health-check') {
                    if (ir.sdwan.healthCheck) ccDropField(ir, 'sdwan', ir.sdwan.healthCheck.name, 'health-check', ir.sdwan.healthCheck.server,
                        'fortigate-sdwan-single-health-check-manual', 'fortigate', CC_SEVERITY.MANUAL);
                    curSdwanHC = { name: idOrName, server: '', latency: '150', jitter: '30' };
                    ir.sdwan.healthCheck = curSdwanHC;
                } else if (sdwStack.length === 1 && top === 'service') {
                    ccDropField(ir, 'sdwan', idOrName, 'service', '', 'fortigate-sdwan-service-rule-not-converted-manual', 'fortigate', CC_SEVERITY.MANUAL);
                }
            } else if (line === 'set status enable' || line === 'set status disable') {
                // ignore (varsayılan enable üretiliyor)
            } else if (top === 'members' && curSdwanMember) {
                if (line.startsWith('set interface ')) curSdwanMember.iface = line.slice(14).replace(/"/g, '').trim();
                else if (line.startsWith('set gateway ')) curSdwanMember.gateway = line.slice(12).trim();
                else if (line.startsWith('set cost ')) curSdwanMember.cost = line.slice(9).trim();
            } else if ((top === 'health-check' || top === 'sla') && curSdwanHC) {
                if (line.startsWith('set server ')) curSdwanHC.server = line.slice(11).replace(/"/g, '').trim();
                else if (line.startsWith('set latency-threshold ')) curSdwanHC.latency = line.slice(22).trim();
                else if (line.startsWith('set jitter-threshold ')) curSdwanHC.jitter = line.slice(21).trim();
                else if (top === 'health-check' && line.startsWith('set protocol ')) curSdwanHC.protocol = line.slice(13).trim();
                else if (top === 'health-check' && line.startsWith('set members ')) {
                    // seq-num → arayüz adı (IR yazıcıdan bağımsız); 0 FortiOS'ta özel değer, olduğu gibi taşınır
                    curSdwanHC.members = parseQuotedTokens(line.slice(12)).map(id => id === '0' ? '0' : (sdwMemberById[id] ? sdwMemberById[id].iface : ''));
                    if (curSdwanHC.members.some(m => !m)) {
                        ccDropField(ir, 'sdwan', curSdwanHC.name, 'health-check members', line.slice(12), 'fortigate-sdwan-hc-member-unknown-manual', 'fortigate', CC_SEVERITY.MANUAL);
                        curSdwanHC.members = curSdwanHC.members.filter(Boolean);
                    }
                }
            }
        }

        // ── VDOM (nested config system settings / config global) ──────────────
        else if (block === 'vdom') {
            if (line.startsWith('config ')) {
                subDepth++;
            } else if (subDepth === 0 && line.startsWith('edit ')) {
                const name = line.slice(5).replace(/"/g, '').trim();
                curVdom = ir.vdoms.find(v => v.name === name);
                if (!curVdom) { curVdom = { name, opmode: 'nat', adminUser: '', adminPass: '' }; ir.vdoms.push(curVdom); }
            } else if (curVdom && line.startsWith('set opmode ')) {
                curVdom.opmode = line.slice(11).trim();
            } else if (line === 'next') { /* vdom edit kapanışı */ }
        }

        // ── config global / config system admin (VDOM yöneticisi) ─────────────
        else if (block === 'fgglobal') {
            if (line.startsWith('config ')) {
                subDepth++;
            } else if (subDepth > 0 && line.startsWith('edit "')) {
                curVdom = { _adminUser: line.slice(6, -1) };
            } else if (curVdom && curVdom._adminUser && line.startsWith('set password ')) {
                curVdom._adminPass = line.slice(13).trim();
            } else if (curVdom && curVdom._adminUser && line.startsWith('set vdom ')) {
                const vdomName = line.slice(9).replace(/"/g, '').trim();
                let target = ir.vdoms.find(v => v.name === vdomName);
                if (!target) { target = { name: vdomName, opmode: 'nat', adminUser: '', adminPass: '' }; ir.vdoms.push(target); }
                target.adminUser = curVdom._adminUser;
                target.adminPass = curVdom._adminPass || '';
            } else if (line === 'next') { curVdom = null; }
        }

        // ── global settings ────────────────────────────────────────────────────
        // 'set hostname' yalnizca 'config system global' icinde cihaz adidir.
        // FQDN adres nesneleri de ayni anahtari kullanir:
        //     config firewall address
        //         edit "google"
        //             set hostname ".*\\.google\\..*"
        // Bag1am kontrolu olmadigi icin sistem hostname'i bu kayitlarla eziliyordu
        // (sistem adi, son gorulen FQDN nesnesiyle degisiyordu). Iki koruma:
        //   1) yalnizca global baglamda kabul et (nesne bloklari haric)
        //   2) ilk deger kazanir
        else if (line.startsWith('set hostname ')
                 && (block === null || block === 'skip' || block === 'fgglobal')
                 && !ir.hostname) {
            ir.hostname = line.slice(13).replace(/"/g, '');
        } else if (line && !line.startsWith('#') && !['end','next'].includes(line)
                   && block !== 'skip'
                   && !(block === 'route' && /^edit\s+\d+$/.test(line))) {
            ir.unknowns.push(line);
        }
        i++;
    }

    // ── Zone inference from securityPolicies ───────────────────────────────────
    const zoneNames = new Set();
    ir.securityPolicies.forEach(p => {
        if (p.srcZone) zoneNames.add(p.srcZone);
        if (p.dstZone) zoneNames.add(p.dstZone);
    });
    zoneNames.forEach(name => {
        if (name && !ir.zones.find(z => z.name === name)) ir.zones.push({ name, interfaces: [], description: '', trust_level: 0 });
    });

    // ── Resolve address objects → canonical value in securityPolicies ──────────
    const addrMap = {};
    ir.addressObjects.forEach(a => { addrMap[a.name] = a; });
    const svcMap = {};
    ir.serviceObjects.forEach(s => { svcMap[s.name] = s; });

    function resolveAddrName(name) {
        if (name === 'all' || name === 'any') return 'any';
        const a = addrMap[name];
        if (!a) return name;
        if (a.type === 'fqdn') return a.value;
        if (a.type === 'host') return a.value + '/32';
        if (a.type === 'network' && a.value) return a.value + (a.mask && a.mask !== '255.255.255.255' ? '/' + ccMaskToPrefix(a.mask) : '/32');
        return name;
    }

    ir.securityPolicies.forEach(p => {
        p.srcAddr = p.srcAddr.map(resolveAddrName);
        p.dstAddr = p.dstAddr.map(resolveAddrName);
        // clean up internal scratch field
        delete p._service;
    });

    // Meta
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'fortigate';

    // FortiOS, config'in ilk satirinda hem MODELI hem surumu yazar — desteklenen
    // vendor'lar icinde model bilgisini config'ten alabildigimiz tek platform:
    //   #config-version=FG201F-7.4.11-FW-build2878-260126:opmode=0:vdom=0:...
    {
        const _cv = (text.split('\n').slice(0, 5).find(l => l.indexOf('#config-version=') === 0) || '');
        const _m = _cv.match(/^#config-version=([A-Za-z0-9_]+)-(\d+\.\d+\.\d+)-FW-(build\d+)/);
        if (_m) {
            ir.device.model = _m[1];
            ir.device.modelSource = 'config';
            ir.device.osVersionRaw = _m[2] + ' ' + _m[3];
        }
    }
    ccResolveDevice(ir);
    // Kaynak sürüm kovası (ör. fortios-7.4, fortios-7.6): osVersions listesinden
    if (ir.device && ir.device.osVersionBucket) ir._meta.srcOsVersion = ir.device.osVersionBucket;

    return ir;
}

CC_READERS['fortigate'] = ccReadFortiGate;
