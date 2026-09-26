'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── FortiGate Writer ──────────────────────────────────────────────────────────
// Kaynak: FortiOS 7.4.8 CLI Reference (7.6.6'da aynı): config firewall policy (srcaddr/dstaddr/
// service birer NESNE ADI listesidir — "10.0.0.1/32" ya da "tcp/443" gibi çözülmüş değer değil),
// config firewall service custom|group, config system zone|dns|ntp, config log syslogd[2-4] setting.
// FortiOS'ta "her adres" nesnesi 'all'dır; 'any' yalnız arayüz (srcintf/dstintf) için geçerlidir.

// FortiOS fabrika yapılandırmasında hazır gelen servis adları (büyük/küçük harf duyarlı).
const _CCFG_BUILTIN_SVC = ['ALL', 'ALL_TCP', 'ALL_UDP', 'ALL_ICMP', 'ALL_ICMP6', 'GRE', 'AH', 'ESP', 'BGP', 'DHCP', 'DNS',
    'FTP', 'HTTP', 'HTTPS', 'IKE', 'IMAP', 'IMAPS', 'KERBEROS', 'L2TP', 'LDAP', 'MS-SQL', 'MYSQL', 'NFS', 'NNTP', 'NTP',
    'OSPF', 'PING', 'PING6', 'POP3', 'POP3S', 'PPTP', 'RADIUS', 'RDP', 'RIP', 'SAMBA', 'SIP', 'SMB', 'SMTP', 'SMTPS',
    'SNMP', 'SSH', 'SYSLOG', 'TELNET', 'TFTP', 'TRACEROUTE', 'VNC', 'WINS'];
// Diğer vendor'ların hazır servis adları → FortiOS hazır servisi
const _CCFG_SVC_ALIAS = {
    'service-http': 'HTTP', 'service-https': 'HTTPS', 'junos-http': 'HTTP', 'junos-https': 'HTTPS', 'junos-ssh': 'SSH',
    'junos-telnet': 'TELNET', 'junos-ftp': 'FTP', 'junos-dns-udp': 'DNS', 'junos-ntp': 'NTP', 'junos-smtp': 'SMTP',
    'junos-ping': 'PING', 'junos-icmp-all': 'ALL_ICMP', 'junos-snmp-agentx': 'SNMP', 'www': 'HTTP', 'icmp': 'ALL_ICMP',
    'tcp': 'ALL_TCP', 'udp': 'ALL_UDP'
};
// Cisco ACL port adları → numara
const _CCFG_PORTNAME = { www: '80', http: '80', https: '443', ssh: '22', telnet: '23', ftp: '21', 'ftp-data': '20', smtp: '25',
    domain: '53', ntp: '123', snmp: '161', snmptrap: '162', syslog: '514', tftp: '69', pop3: '110', imap4: '143', ldap: '389',
    ldaps: '636', 'bgp': '179', 'rdp': '3389', 'sqlnet': '1521', 'isakmp': '500' };
const _ccfgIsIp = s => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(s || ''));

function ccWriteFortiGate(ir) {
    let c = '# ======================================\n# FortiGate — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'config system global\n    set hostname "' + ir.hostname + '"\nend\n\n';
    const _dq = s => String(s == null ? '' : s).replace(/^"+|"+$/g, '');

    // ── Adres başvurusu: nesne adı; değer eşleşirse o nesnenin adı; çıplak IP/ağ → otomatik nesne
    const addrObjs = (ir.addressObjects || []);
    const vipNames = new Set((ir.natRules || []).map(n => n.name).filter(Boolean));
    const autoAddr = [];                       // { name, body }
    const autoAddrByName = {};
    function addAuto(name, body) {
        if (!autoAddrByName[name]) { autoAddrByName[name] = true; autoAddr.push({ name, body }); }
        return name;
    }
    function fgAddrRef(raw, ctxName) {
        const v = _dq(raw).trim();
        if (!v || /^(any|any4|all)$/i.test(v)) return 'all';
        if (addrObjs.find(a => a.name === v) || vipNames.has(v)) return v;
        const byVal = addrObjs.find(a => a.type !== 'group' && a.value && (
            a.value === v ||
            (a.type === 'host' && a.value + '/32' === v) ||
            (a.type === 'network' && a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.255') === v)));
        if (byVal) return byVal.name;
        // çıplak değer: 'host X' | X/len | 'X maske|wildcard' | X | X-Y
        let m;
        const cidr = (/^host\s+/.test(v) || / /.test(v)) && typeof ccAclAddrToCidr === 'function' ? ccAclAddrToCidr(v) : null;
        const lit = cidr || v;
        if ((m = lit.match(/^((?:\d{1,3}\.){3}\d{1,3})(?:\/(\d{1,2}))?$/))) {
            const len = m[2] === undefined ? 32 : parseInt(m[2], 10);
            if (len === 32) return addAuto('h-' + m[1], '        set subnet ' + m[1] + ' 255.255.255.255\n');
            if (len === 0) return 'all';
            return addAuto('n-' + m[1] + '_' + len, '        set subnet ' + m[1] + ' ' + ccPrefixToMaskFg(len) + '\n');
        }
        if ((m = lit.match(/^((?:\d{1,3}\.){3}\d{1,3})\s*-\s*((?:\d{1,3}\.){3}\d{1,3})$/)))
            return addAuto('r-' + m[1] + '-' + m[2], '        set type iprange\n        set start-ip ' + m[1] + '\n        set end-ip ' + m[2] + '\n');
        ccDropField(ir, 'securityPolicies', ctxName || '', 'address', v, 'fortigate-address-undefined-manual', 'fortigate', CC_SEVERITY.MANUAL);
        return v;
    }
    function ccPrefixToMaskFg(len) {
        const n = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0;
        return [24, 16, 8, 0].map(sh => (n >>> sh) & 255).join('.');
    }

    // ── Servis başvurusu: FortiOS hazır servisi | tanımlı servis nesnesi | çıplak tcp/udp port → otomatik custom
    const svcObjs = (ir.serviceObjects || []);
    const usedSvc = new Set();
    const autoSvc = [];                        // { name, body }
    const autoSvcByName = {};
    const builtinUp = {}; _CCFG_BUILTIN_SVC.forEach(n => { builtinUp[n.toUpperCase()] = n; });
    function portSpec(spec) {
        // 'eq 443' | 'range 80 90' | 'gt 1023' | 'lt 1024' | '443' | '80-90' | 'www'
        const t = String(spec || '').trim().split(/\s+/).filter(Boolean);
        const num = x => (/^\d+$/.test(x) ? x : (_CCFG_PORTNAME[String(x).toLowerCase()] || null));
        if (!t.length) return null;
        if (t[0] === 'eq' && t.length === 2) return num(t[1]);
        if (t[0] === 'range' && t.length === 3) { const a = num(t[1]), b = num(t[2]); return a && b ? a + '-' + b : null; }
        if (t[0] === 'gt' && t.length === 2) { const a = num(t[1]); return a && +a < 65535 ? (+a + 1) + '-65535' : null; }
        if (t[0] === 'lt' && t.length === 2) { const a = num(t[1]); return a && +a > 1 ? '1-' + (+a - 1) : null; }
        if (t.length === 1 && /^\d+(-\d+)?$/.test(t[0])) return t[0];
        if (t.length === 1) return num(t[0]);
        return null;
    }
    function fgSvcRef(raw, ctxName) {
        const v = _dq(raw).trim();
        const low = v.toLowerCase();
        if (!v || low === 'any' || low === 'all' || low === 'ip') return 'ALL';
        if (low === 'application-default') {
            ccDropField(ir, 'securityPolicies', ctxName || '', 'service', v, 'fortigate-app-default-mapped-to-all-manual', 'fortigate', CC_SEVERITY.MANUAL);
            return 'ALL';
        }
        const obj = svcObjs.find(o => o.name === v);
        if (obj && !builtinUp[v.toUpperCase()]) { usedSvc.add(v); return v; }
        if (builtinUp[v.toUpperCase()]) return builtinUp[v.toUpperCase()];
        if (_CCFG_SVC_ALIAS[low]) return _CCFG_SVC_ALIAS[low];
        const m = v.match(/^(tcp|udp|sctp)(?:\s*\/\s*|\s+)(.+)$/i);
        if (m) {
            const pr = portSpec(m[2]);
            if (pr) {
                const P = m[1].toUpperCase(), name = P + '-' + pr;
                if (!autoSvcByName[name]) { autoSvcByName[name] = true; autoSvc.push({ name, body: '        set ' + m[1].toLowerCase() + '-portrange ' + pr + '\n' }); }
                return name;
            }
        }
        ccDropField(ir, 'securityPolicies', ctxName || '', 'service', v, 'fortigate-service-undefined-manual', 'fortigate', CC_SEVERITY.MANUAL);
        return v;
    }
    function svcBody(o) {
        let b = '';
        if (o.tcpPorts || o.udpPorts || o.sctpPorts) {
            if (o.tcpPorts)  b += '        set tcp-portrange ' + o.tcpPorts + '\n';
            if (o.udpPorts)  b += '        set udp-portrange ' + o.udpPorts + '\n';
            if (o.sctpPorts) b += '        set sctp-portrange ' + o.sctpPorts + '\n';
            return b;
        }
        const pr = String(o.proto || '').toLowerCase();
        if ((pr === 'tcp' || pr === 'udp' || pr === 'sctp') && o.ports) return '        set ' + pr + '-portrange ' + String(o.ports).replace(/,/g, ' ') + '\n';
        if (pr === 'ip' && o.protoNum) return '        set protocol IP\n        set protocol-number ' + o.protoNum + '\n';
        if (pr === 'icmp') return '        set protocol ICMP\n' + (o.icmptype !== undefined && o.icmptype !== '' ? '        set icmptype ' + o.icmptype + '\n' : '');
        return null;
    }

    // Kural metni önce üretilir (otomatik nesneler toplanır), sonra nesnelerden SONRA yazılır.
    let polTxt = '';
    if (ir.securityPolicies && ir.securityPolicies.length) {
        polTxt += 'config firewall policy\n';
        ir.securityPolicies.forEach((pol, idx) => {
            polTxt += '    edit ' + (pol.seq || idx + 1) + '\n';
            polTxt += '        set name "' + pol.name + '"\n';
            polTxt += '        set srcintf "' + (pol.srcZone || 'any') + '"\n';
            polTxt += '        set dstintf "' + (pol.dstZone || 'any') + '"\n';
            const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
            const src = (pol.srcAddr && pol.srcAddr.length ? pol.srcAddr : ['all']).map(a => fgAddrRef(a, pol.name));
            const dst = (pol.dstAddr && pol.dstAddr.length ? pol.dstAddr : ['all']).map(a => fgAddrRef(a, pol.name));
            polTxt += '        set srcaddr ' + uniq(src).map(a => '"' + a + '"').join(' ') + '\n';
            polTxt += '        set dstaddr ' + uniq(dst).map(a => '"' + a + '"').join(' ') + '\n';
            const svc = (pol.service && pol.service.length ? pol.service : ['ALL']).map(sv => fgSvcRef(sv, pol.name));
            polTxt += '        set service ' + uniq(svc).map(sv => '"' + sv + '"').join(' ') + '\n';
            polTxt += '        set action ' + (pol.action === 'ipsec' ? 'ipsec' : (pol.action === 'allow' ? 'accept' : 'deny')) + '\n';
            // Kaynakta devre disi birakilmis kural hedefte de devre disi kalmali —
            // aksi halde kapali kural acilir (fail-open).
            if (pol.enabled === false) polTxt += '        set status disable\n';
            polTxt += '        set schedule "always"\n';
            if (pol.log) polTxt += '        set logtraffic all\n';
            if (pol.profile && (pol.profile.av || pol.profile.ips || pol.profile.webfilter || pol.profile.appctrl)) {
                polTxt += '        set utm-status enable\n';
                if (pol.profile.av)         polTxt += '        set av-profile "' + pol.profile.av + '"\n';
                if (pol.profile.ips)        polTxt += '        set ips-sensor "' + pol.profile.ips + '"\n';
                if (pol.profile.webfilter)  polTxt += '        set webfilter-profile "' + pol.profile.webfilter + '"\n';
                if (pol.profile.appctrl)    polTxt += '        set application-list "' + pol.profile.appctrl + '"\n';
            }
            polTxt += '    next\n';
        });
        polTxt += 'end\n\n';
    } else if (ir.acls.length) {
        polTxt += 'config firewall policy\n';
        ir.acls.forEach((acl, idx) => {
            acl.entries.forEach((e, j) => {
                const nm = acl.name + (j > 0 ? '_' + j : '');
                const proto = String(e.proto || 'ip').toLowerCase();
                let svc;
                if (proto === 'ip') svc = 'ALL';
                else if (proto === 'icmp') svc = 'ALL_ICMP';
                else if ((proto === 'tcp' || proto === 'udp') && e.dst_port) svc = fgSvcRef(proto + ' ' + e.dst_port, nm);
                else if (proto === 'tcp' || proto === 'udp') svc = proto === 'tcp' ? 'ALL_TCP' : 'ALL_UDP';
                else svc = fgSvcRef(proto, nm);
                if (e.src_port) ccDropField(ir, 'acls', nm, 'src_port', e.src_port, 'fortigate-acl-src-port-partial', 'fortigate', CC_SEVERITY.PARTIAL);
                polTxt += '    edit ' + (idx * 10 + j + 1) + '\n        set name "' + nm + '"\n';
                polTxt += '        set srcintf "any"\n        set dstintf "any"\n';
                polTxt += '        set action ' + (e.action === 'permit' ? 'accept' : 'deny') + '\n';
                polTxt += '        set srcaddr "' + fgAddrRef(e.src, nm) + '"\n        set dstaddr "' + fgAddrRef(e.dst, nm) + '"\n';
                polTxt += '        set schedule "always"\n        set service "' + svc + '"\n    next\n';
            });
        });
        polTxt += 'end\n\n';
    }
    if (ir.interfaces.length) {
        c += 'config system interface\n';
        ir.interfaces.forEach(f => {
            if (f.name.toLowerCase().startsWith('vlan')) return;
            const subifM = String(f.name).match(/^(.+)\.(\d+)$/);
            const isSubif = !!subifM;
            const parentIf = isSubif ? subifM[1] : f.name;
            const subifVlan = isSubif ? parseInt(subifM[2], 10) : null;
            c += '    edit "' + f.name + '"\n';
            c += '        set vdom "root"\n';
            if (isSubif) {
                c += '        set type vlan\n';
                c += '        set vlanid ' + subifVlan + '\n';
                c += '        set interface "' + parentIf + '"\n';
            }
            if (f.desc) c += '        set alias "' + f.desc + '"\n';
            if (f.ip) {
                c += '        set ip ' + f.ip + ' ' + f.mask + '\n';
                c += '        set mode static\n';
            }
            if (f.mtu) {
                c += '        set mtu-override enable\n';
                c += '        set mtu ' + f.mtu + '\n';
            }
            c += '        set status ' + (f.shutdown ? 'down' : 'up') + '\n';
            if (f.nameif) c += '        set role ' + (String(f.nameif).toLowerCase().includes('out') || String(f.nameif).toLowerCase().includes('wan') ? 'wan' : 'lan') + '\n';
            c += '        set allowaccess ping https ssh\n';
            c += '    next\n';
            // Unsupported / translated alanları lostFields'a düşür
            if (f._aclIn || f._aclOut) ccDropField(ir, 'interface', f.name, f._aclIn ? '_aclIn' : '_aclOut', f._aclIn || f._aclOut, 'fortigate-acl-in-policy-block', 'fortigate');
            if (f.voice_vlan)          ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,      'fortigate-no-voice-vlan',    'fortigate');
            if (f.port_security && f.port_security.enabled)
                                       ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,   'fortigate-no-port-security', 'fortigate');
            if (f.edge_port)           ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,       'fortigate-no-stp-on-iface',  'fortigate');
            if (f.bpdu_guard)          ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,      'fortigate-no-stp-on-iface',  'fortigate');
            if (f.service_policy)      ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy,  'fortigate-traffic-shaper-different','fortigate');
        });
        c += 'end\n\n';
    }
    // Zone: yalnız üye arayüzü bilinen ve yazılan zone'lar (FortiGate okuyucusunun kurallardan
    // çıkardığı arayüz adları zone değildir; interfaces boş olanlar atlanır).
    {
        const written = new Set((ir.interfaces || []).filter(f => !String(f.name).toLowerCase().startsWith('vlan')).map(f => f.name));
        const zs = (ir.zones || []).filter(z => z && z.name && (z.interfaces || []).length);
        let zt = '';
        zs.forEach(z => {
            if (written.has(z.name)) { ccDropField(ir, 'zones', z.name, 'name', z.name, 'fortigate-zone-name-conflicts-interface-manual', 'fortigate', CC_SEVERITY.MANUAL); return; }
            const mem = z.interfaces.filter(x => written.has(x));
            z.interfaces.filter(x => !written.has(x)).forEach(x => ccDropField(ir, 'zones', z.name, 'interface', x, 'fortigate-zone-member-missing-manual', 'fortigate', CC_SEVERITY.MANUAL));
            if (!mem.length) return;
            zt += '    edit "' + z.name + '"\n';
            if (z.description) zt += '        set description "' + z.description + '"\n';
            zt += '        set interface ' + mem.map(x => '"' + x + '"').join(' ') + '\n';
            if (z.intrazone) zt += '        set intrazone ' + z.intrazone + '\n';
            zt += '    next\n';
        });
        if (zt) c += 'config system zone\n' + zt + 'end\n\n';
    }
    // DNS / NTP / syslog (IR system alanları)
    {
        const sys = ir.system || {};
        const flat = a => (a || []).flatMap(x => String(x || '').replace(/"/g, '').trim().split(/\s+/)).filter(Boolean);
        const dns = flat(sys.dns), v4 = dns.filter(_ccfgIsIp), v6 = dns.filter(x => /:/.test(x));
        dns.filter(x => !_ccfgIsIp(x) && !/:/.test(x)).forEach(x => ccDropField(ir, 'system', 'dns', 'server', x, 'fortigate-dns-not-an-ip', 'fortigate'));
        if (v4.length || v6.length) {
            c += 'config system dns\n';
            if (v4[0]) c += '    set primary ' + v4[0] + '\n';
            if (v4[1]) c += '    set secondary ' + v4[1] + '\n';
            if (v6[0]) c += '    set ip6-primary ' + v6[0] + '\n';
            if (v6[1]) c += '    set ip6-secondary ' + v6[1] + '\n';
            if (sys.domainName) c += '    set domain "' + sys.domainName + '"\n';
            c += 'end\n\n';
            v4.slice(2).concat(v6.slice(2)).forEach(x => ccDropField(ir, 'system', 'dns', 'server', x, 'fortigate-dns-max-two-servers', 'fortigate'));
        }
        const ntp = flat(sys.ntp).filter((x, i, a) => a.indexOf(x) === i);
        if (ntp.length) {
            c += 'config system ntp\n    set ntpsync enable\n    set type custom\n    config ntpserver\n';
            ntp.forEach((x, i) => { c += '        edit ' + (i + 1) + '\n            set server "' + x + '"\n        next\n'; });
            c += '    end\nend\n\n';
        }
        const sl = flat(sys.syslog).filter((x, i, a) => a.indexOf(x) === i);
        sl.slice(0, 4).forEach((x, i) => {
            c += 'config log syslogd' + (i ? String(i + 1) : '') + ' setting\n    set status enable\n    set server "' + x + '"\nend\n\n';
        });
        sl.slice(4).forEach(x => ccDropField(ir, 'system', 'syslog', 'server', x, 'fortigate-syslog-max-four-servers', 'fortigate'));
    }
    if (ir.routes.length) {
        c += 'config router static\n';
        ir.routes.forEach((r, idx) => {
            c += '    edit ' + (idx + 1) + '\n        set dst ' + r.network + ' ' + r.mask + '\n        set gateway ' + r.nexthop + '\n';
            if (r.iface) c += '        set device "' + r.iface + '"\n';
            c += '    next\n';
        });
        c += 'end\n\n';
    }
    {
        let at = '';
        addrObjs.filter(a => a.type !== 'group').forEach(a => {
            // FortiOS hazır nesneleri (hedefte zaten var; değersiz olanlar yazılırsa 0.0.0.0/0 olur)
            if (['all', 'none', 'FIREWALL_AUTH_PORTAL_ADDRESS', 'FABRIC_DEVICE'].includes(a.name)) return;
            let body = null;
            const val = String(a.value || '').trim();
            if (a.type === 'host' && val) body = '        set subnet ' + val + ' 255.255.255.255\n';
            else if (a.type === 'network' && val) body = '        set subnet ' + val + ' ' + (a.mask || '255.255.255.0') + '\n';
            else if (a.type === 'fqdn' && val) body = '        set type fqdn\n        set fqdn "' + val + '"\n';
            else if (a.type === 'range' && /-/.test(val)) {
                const r = val.split('-').map(x => x.trim());
                body = '        set type iprange\n        set start-ip ' + r[0] + '\n        set end-ip ' + r[1] + '\n';
            }
            // Değersiz nesne yazılmaz: FortiOS'ta subnet'siz ipmask nesnesi 0.0.0.0/0 olur (her adres).
            if (!body) { ccDropField(ir, 'addressObjects', a.name, a.type, a.value, 'fortigate-address-type-unsupported-manual', 'fortigate', CC_SEVERITY.MANUAL); return; }
            if (a.comment || a.description) body += '        set comment "' + String(a.comment || a.description).replace(/"/g, '') + '"\n';
            at += '    edit "' + a.name + '"\n' + body + '    next\n';
        });
        autoAddr.forEach(o => { at += '    edit "' + o.name + '"\n' + o.body + '    next\n'; });
        if (at) c += 'config firewall address\n' + at + 'end\n\n';
    }
    if (ir.addressObjects && ir.addressObjects.length) {
        const groups = ir.addressObjects.filter(a => a.type === 'group');
        if (groups.length) {
            c += 'config firewall addrgrp\n';
            groups.forEach(g => {
                if (!(g.members || []).length) { ccDropField(ir, 'addressObjects', g.name, 'members', '', 'fortigate-addrgrp-empty-manual', 'fortigate', CC_SEVERITY.MANUAL); return; }
                c += '    edit "' + g.name + '"\n';
                c += '        set member ' + (g.members || []).map(m => '"' + m + '"').join(' ') + '\n';
                c += '    next\n';
            });
            c += 'end\n\n';
        }
    }
    // Servis nesneleri: kaynaktaki tanımlar (hazır adlar hariç) + kurallardan türetilen otomatik custom'lar.
    {
        let st = '', gt = '';
        svcObjs.forEach(o => {
            if (!o || !o.name || builtinUp[String(o.name).toUpperCase()]) return;
            if (o.members && o.members.length) return;
            const b = svcBody(o);
            if (!b) { ccDropField(ir, 'serviceObjects', o.name, 'proto', o.proto || '', 'fortigate-service-shape-unsupported-manual', 'fortigate', CC_SEVERITY.MANUAL); return; }
            st += '    edit "' + o.name + '"\n' + b + '    next\n';
        });
        autoSvc.forEach(o => { if (!svcObjs.find(x => x.name === o.name)) st += '    edit "' + o.name + '"\n' + o.body + '    next\n'; });
        svcObjs.filter(o => o && o.name && o.members && o.members.length && !builtinUp[String(o.name).toUpperCase()]).forEach(g => {
            const mem = g.members.map(m => fgSvcRef(m, g.name));
            gt += '    edit "' + g.name + '"\n        set member ' + mem.map(m => '"' + m + '"').join(' ') + '\n    next\n';
        });
        // grup üyelerinden doğan otomatik custom'lar (yukarıda yazılmamış olanlar)
        autoSvc.forEach(o => { if (st.indexOf('    edit "' + o.name + '"\n') === -1 && !svcObjs.find(x => x.name === o.name)) st += '    edit "' + o.name + '"\n' + o.body + '    next\n'; });
        if (st) c += 'config firewall service custom\n' + st + 'end\n\n';
        if (gt) c += 'config firewall service group\n' + gt + 'end\n\n';
    }
    // NAT rules — kaynak vendor'a göre iki farklı yönde gelebilir:
    // destination-NAT (VIP: origDst/transDst dolu) vs source-NAT/PAT (origSrc/transSrc dolu).
    // fwmig gibi olgun açık kaynak dönüştürücüler de tam bu noktada (NAT) sınırlı kalıyor —
    // burada sessizce atlamak yerine ayrıştırıp mümkün olanı yazıyor, kalanı lostFields'a düşürüyoruz.
    if (ir.natRules && ir.natRules.length) {
        const vipRules = ir.natRules.filter(n => n.origDst && n.transDst);
        const poolRules = ir.natRules.filter(n => !(n.origDst && n.transDst) && n.transSrc && n.transSrc !== 'interface');
        const ifaceRules = ir.natRules.filter(n => !(n.origDst && n.transDst) && n.transSrc === 'interface');
        if (vipRules.length) {
            c += 'config firewall vip\n';
            vipRules.forEach(n => {
                c += '    edit "' + (n.name || n._ruleName || 'VIP_' + (n.origDst || '').replace(/[^\w]/g, '_')) + '"\n';
                c += '        set extip ' + n.origDst + '\n';
                c += '        set mappedip "' + n.transDst + '"\n';
                if (n.iface) c += '        set extintf "' + n.iface + '"\n';
                c += '    next\n';
            });
            c += 'end\n\n';
        }
        if (poolRules.length) {
            c += 'config firewall ippool\n';
            poolRules.forEach(n => {
                const range = String(n.transSrc).split('-');
                c += '    edit "' + (n.name || n._ruleName || 'POOL_' + (n.origSrc || 'any').replace(/[^\w]/g, '_')) + '"\n';
                c += '        set startip ' + (range[0] || n.transSrc) + '\n';
                c += '        set endip ' + (range[1] || range[0] || n.transSrc) + '\n';
                c += '    next\n';
            });
            c += 'end\n\n';
            c += '# NOT: Yukarıdaki ippool\'u kullanacak firewall policy üzerinde\n# "set nat enable" ve "set ippool enable" + "set poolname \\"<pool>\\"" ayarlanmalı.\n\n';
        }
        ifaceRules.forEach(n => {
            ccDropField(ir, 'natRules', n.name || n._ruleName || n.origSrc || '', 'transSrc=interface', n.origSrc,
                'fortigate-nat-needs-manual-policy-binding', 'fortigate', CC_SEVERITY.MANUAL);
        });
        ir.natRules.filter(n => !vipRules.includes(n) && !poolRules.includes(n) && !ifaceRules.includes(n)).forEach(n => {
            ccDropField(ir, 'natRules', n.name || n._ruleName || '', 'natRule', JSON.stringify(n),
                'fortigate-nat-rule-shape-unrecognized', 'fortigate', CC_SEVERITY.PARTIAL);
        });
    }
    c += polTxt;
    // IPsec VPN (Phase1/Phase2)
    (ir.vpnTunnels || []).forEach(t => {
        c += 'config vpn ipsec phase1-interface\n    edit "' + t.p1Name + '"\n';
        c += '        set interface "' + (t.iface || '') + '"\n        set peertype any\n';
        c += '        set remote-gw ' + (t.remoteGw || '') + '\n        set authmethod psk\n';
        // ike-version/dhgrp kaynakta yoksa sessizce seçilmez: satır yazılmaz (hedefte FortiOS
        // varsayılanı geçerli olur: ike-version 1; dhgrp 7.4'te 14, 7.6.5+'da 20 21) ve el ile
        // kontrol notu düşülür — karşı uçla uyuşmazsa tünel kurulmaz.
        c += '        set psksecret ' + (t.psk || '') + '\n';
        if (t.ikeVersion) c += '        set ike-version ' + t.ikeVersion + '\n';
        else ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'ike-version', '', 'fortigate-ipsec-ike-version-unknown-manual', 'fortigate', CC_SEVERITY.MANUAL);
        c += '        set proposal ' + (t.proposal || 'aes256-sha256') + '\n';
        if (t.dhgrp) c += '        set dhgrp ' + t.dhgrp + '\n';
        else ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'dhgrp', '', 'fortigate-ipsec-dhgrp-unknown-manual', 'fortigate', CC_SEVERITY.MANUAL);
        c += '    next\nend\n\n';
        c += 'config vpn ipsec phase2-interface\n    edit "' + (t.p2Name || t.p1Name + '_P2') + '"\n';
        c += '        set phase1name "' + t.p1Name + '"\n        set proposal ' + (t.proposal || 'aes256-sha256') + '\n';
        if (t.dhgrp) c += '        set dhgrp ' + t.dhgrp + '\n';
        c += '        set src-subnet ' + (t.localSubnet || '') + '\n        set dst-subnet ' + (t.remoteSubnet || '') + '\n';
        c += '    next\nend\n\n';
    });
    // SSL-VPN
    if (ir.sslVpn) {
        const s = ir.sslVpn;
        c += 'config firewall address\n    edit "' + s.tunnelPoolName + '"\n        set type iprange\n';
        const parts = String(s.poolRange || '').split('-');
        if (parts.length === 2) c += '        set start-ip ' + parts[0].trim() + '\n        set end-ip ' + parts[1].trim() + '\n';
        c += '    next\nend\n\n';
        c += 'config vpn ssl web portal\n    edit "' + s.portalName + '"\n        set tunnel-mode enable\n        set web-mode enable\n        set ip-pools "' + s.tunnelPoolName + '"\n    next\nend\n\n';
        c += 'config vpn ssl settings\n    set servercert "Fortinet_Factory"\n    set tunnel-ip-pools "' + s.tunnelPoolName + '"\n    set source-interface "' + s.sourceIface + '"\n    set source-address "all"\n    set default-portal "' + s.portalName + '"\n    set port ' + (s.port || '10443') + '\nend\n\n';
        if (s.userGroup) {
            c += 'config vpn ssl web portal\n    edit "' + s.portalName + '"\n        config authentication-rule\n            edit 1\n                set groups "' + s.userGroup + '"\n                set portal "' + s.portalName + '"\n            next\n        end\n    next\nend\n\n';
        }
    }
    // UTM / Security Profiles
    (ir.utmProfiles || []).forEach(u => {
        if (u.avName) c += 'config antivirus profile\n    edit "' + u.avName + '"\n        config http\n            set av-scan block\n        end\n    next\nend\n\n';
        if (u.ipsName) c += 'config ips sensor\n    edit "' + u.ipsName + '"\n        config entries\n            edit 1\n                set severity high critical\n                set status enable\n            next\n        end\n    next\nend\n\n';
        if (u.webfilterName) c += 'config webfilter profile\n    edit "' + u.webfilterName + '"\n    next\nend\n\n';
        if (u.appctrlName) c += 'config application list\n    edit "' + u.appctrlName + '"\n    next\nend\n\n';
        if (u.policyId) {
            c += 'config firewall policy\n    edit ' + u.policyId + '\n        set utm-status enable\n';
            if (u.avName) c += '        set av-profile "' + u.avName + '"\n';
            if (u.ipsName) c += '        set ips-sensor "' + u.ipsName + '"\n';
            if (u.webfilterName) c += '        set webfilter-profile "' + u.webfilterName + '"\n';
            if (u.appctrlName) c += '        set application-list "' + u.appctrlName + '"\n';
            c += '        set logtraffic ' + (u.logtraffic || 'all') + '\n    next\nend\n\n';
        }
    });
    // SD-WAN
    if (ir.sdwan) {
        const sw = ir.sdwan;
        c += 'config system sdwan\n    set status enable\n    config members\n';
        (sw.members || []).forEach((m, idx) => {
            c += '        edit ' + (idx + 1) + '\n            set interface "' + m.iface + '"\n            set gateway ' + m.gateway + '\n            set cost ' + (m.cost || '0') + '\n        next\n';
        });
        c += '    end\n';
        if (sw.healthCheck) {
            const hc = sw.healthCheck;
            c += '    config health-check\n        edit "' + (hc.name || 'hc-primary') + '"\n            set server "' + hc.server + '"\n            set protocol ping\n';
            c += '            config sla\n                edit 1\n                    set latency-threshold ' + (hc.latency || '150') + '\n                    set jitter-threshold ' + (hc.jitter || '30') + '\n                next\n            end\n        next\n    end\n';
        }
        c += 'end\n\n';
    }
    // HA
    if (ir.ha) {
        const h = ir.ha;
        c += 'config system ha\n    set mode ' + (h.mode || 'a-p') + '\n    set group-name "' + h.groupName + '"\n    set password "' + h.password + '"\n    set priority ' + (h.priority || '128') + '\n    set session-pickup ' + (h.sessionPickup || 'enable') + '\n';
        (h.hbInterfaces || []).forEach((p, i) => { c += '    set hbdev "' + p + '" ' + (i * 50) + '\n'; });
        c += 'end\n\n';
    }
    // PBR
    (ir.pbrRules || []).forEach(p => {
        c += 'config router policy\n    edit ' + p.seq + '\n        set src ' + p.srcAddr + '\n';
        if (p.dstAddr) c += '        set dst ' + p.dstAddr + '\n';
        c += '        set output-device "' + p.outInterface + '"\n        set gateway ' + p.gateway + '\n    next\nend\n\n';
    });
    // VDOM
    (ir.vdoms || []).forEach(v => {
        c += 'config vdom\n    edit ' + v.name + '\n    next\nend\n\n';
        if (v.adminUser) {
            c += 'config global\n    config system admin\n        edit "' + v.adminUser + '"\n            set password ' + (v.adminPass || '') + '\n            set vdom "' + v.name + '"\n            set accprofile "prof_admin"\n        next\n    end\nend\n\n';
        }
        if (v.opmode) {
            c += 'config vdom\n    edit ' + v.name + '\n    config system settings\n        set opmode ' + v.opmode + '\n    end\n    next\nend\n\n';
        }
    });
    if (ir.unknowns && ir.unknowns.length) {
        c += '# ---- Çevrilemeyen satırlar (' + ir.unknowns.length + ') ----\n';
        ir.unknowns.forEach(u => c += '# ' + u + '\n');
    }
    return c;
}
CC_WRITERS['fortigate'] = ccWriteFortiGate;
