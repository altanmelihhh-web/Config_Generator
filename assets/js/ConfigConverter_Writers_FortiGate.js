'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── FortiGate Writer ──────────────────────────────────────────────────────────
function ccWriteFortiGate(ir) {
    let c = '# ======================================\n# FortiGate — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'config system global\n    set hostname "' + ir.hostname + '"\nend\n\n';
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
    if (ir.routes.length) {
        c += 'config router static\n';
        ir.routes.forEach((r, idx) => {
            c += '    edit ' + (idx + 1) + '\n        set dst ' + r.network + ' ' + r.mask + '\n        set gateway ' + r.nexthop + '\n';
            if (r.iface) c += '        set device "' + r.iface + '"\n';
            c += '    next\n';
        });
        c += 'end\n\n';
    }
    if (ir.addressObjects && ir.addressObjects.length) {
        c += 'config firewall address\n';
        ir.addressObjects.filter(a => a.type !== 'group').forEach(a => {
            c += '    edit "' + a.name + '"\n';
            if (a.type === 'host') c += '        set subnet ' + a.value + ' 255.255.255.255\n';
            else if (a.type === 'network') c += '        set subnet ' + a.value + ' ' + (a.mask || '255.255.255.0') + '\n';
            else if (a.type === 'fqdn') { c += '        set type fqdn\n        set fqdn "' + a.value + '"\n'; }
            c += '    next\n';
        });
        c += 'end\n\n';
        const groups = ir.addressObjects.filter(a => a.type === 'group');
        if (groups.length) {
            c += 'config firewall addrgrp\n';
            groups.forEach(g => {
                c += '    edit "' + g.name + '"\n';
                c += '        set member ' + (g.members || []).map(m => '"' + m + '"').join(' ') + '\n';
                c += '    next\n';
            });
            c += 'end\n\n';
        }
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
    if (ir.securityPolicies && ir.securityPolicies.length) {
        c += 'config firewall policy\n';
        ir.securityPolicies.forEach((pol, idx) => {
            c += '    edit ' + (pol.seq || idx + 1) + '\n';
            c += '        set name "' + pol.name + '"\n';
            c += '        set srcintf "' + (pol.srcZone || 'any') + '"\n';
            c += '        set dstintf "' + (pol.dstZone || 'any') + '"\n';
            // Çift tırnak sorununu önle — PaloAlto reader'ı object adlarını
            // zaten "X" formatında saklıyor olabilir.
            const _dq = s => String(s == null ? '' : s).replace(/^"+|"+$/g, '');
            const srcAddrs = (pol.srcAddr || ['any']).map(a => '"' + _dq(ccResolveAddr(a, ir)) + '"').join(' ');
            const dstAddrs = (pol.dstAddr || ['any']).map(a => '"' + _dq(ccResolveAddr(a, ir)) + '"').join(' ');
            c += '        set srcaddr ' + srcAddrs + '\n';
            c += '        set dstaddr ' + dstAddrs + '\n';
            const svcs = (pol.service || ['ALL']).map(s => '"' + _dq(ccResolveService(s, ir)) + '"').join(' ');
            c += '        set service ' + svcs + '\n';
            c += '        set action ' + (pol.action === 'ipsec' ? 'ipsec' : (pol.action === 'allow' ? 'accept' : 'deny')) + '\n';
            // Kaynakta devre disi birakilmis kural hedefte de devre disi kalmali —
            // aksi halde kapali kural acilir (fail-open).
            if (pol.enabled === false) c += '        set status disable\n';
            c += '        set schedule "always"\n';
            if (pol.log) c += '        set logtraffic all\n';
            if (pol.profile && (pol.profile.av || pol.profile.ips || pol.profile.webfilter || pol.profile.appctrl)) {
                c += '        set utm-status enable\n';
                if (pol.profile.av)         c += '        set av-profile "' + pol.profile.av + '"\n';
                if (pol.profile.ips)        c += '        set ips-sensor "' + pol.profile.ips + '"\n';
                if (pol.profile.webfilter)  c += '        set webfilter-profile "' + pol.profile.webfilter + '"\n';
                if (pol.profile.appctrl)    c += '        set application-list "' + pol.profile.appctrl + '"\n';
            }
            c += '    next\n';
        });
        c += 'end\n\n';
    } else if (ir.acls.length) {
        c += 'config firewall policy\n';
        ir.acls.forEach((acl, idx) => {
            acl.entries.forEach((e, j) => {
                c += '    edit ' + (idx * 10 + j + 1) + '\n        set name "' + acl.name + (j > 0 ? '_' + j : '') + '"\n';
                c += '        set action ' + (e.action === 'permit' ? 'accept' : 'deny') + '\n';
                c += '        set srcaddr "' + e.src + '"\n        set dstaddr "' + e.dst + '"\n';
                c += '        set schedule "always"\n        set service "ALL"\n    next\n';
            });
        });
        c += 'end\n\n';
    }
    // IPsec VPN (Phase1/Phase2)
    (ir.vpnTunnels || []).forEach(t => {
        c += 'config vpn ipsec phase1-interface\n    edit "' + t.p1Name + '"\n';
        c += '        set interface "' + (t.iface || '') + '"\n        set peertype any\n';
        c += '        set remote-gw ' + (t.remoteGw || '') + '\n        set authmethod psk\n';
        c += '        set psksecret ' + (t.psk || '') + '\n        set ike-version ' + (t.ikeVersion || '2') + '\n';
        c += '        set proposal ' + (t.proposal || 'aes256-sha256') + '\n        set dhgrp ' + (t.dhgrp || '14') + '\n';
        c += '    next\nend\n\n';
        c += 'config vpn ipsec phase2-interface\n    edit "' + (t.p2Name || t.p1Name + '_P2') + '"\n';
        c += '        set phase1name "' + t.p1Name + '"\n        set proposal ' + (t.proposal || 'aes256-sha256') + '\n        set dhgrp ' + (t.dhgrp || '14') + '\n';
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
        if (u.avName) c += 'config antivirus profile\n    edit "' + u.avName + '"\n        config http\n            set options scan\n        end\n    next\nend\n\n';
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
