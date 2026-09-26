'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Palo Alto Writer ──────────────────────────────────────────────────────────
function ccWritePaloAlto(ir) {
    let c = '# ======================================\n# Palo Alto PAN-OS — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'set deviceconfig system hostname ' + ir.hostname + '\n\n';
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        const subifM = String(f.name).match(/^(.+)\.(\d+)$/);
        const isSubif = !!subifM;
        const parentIf = isSubif ? subifM[1] : f.name;
        const subifVlan = isSubif ? parseInt(subifM[2], 10) : null;
        const base = isSubif
            ? 'set network interface ethernet ' + parentIf + ' layer3 units ' + f.name
            : 'set network interface ethernet ' + f.name + ' layer3';
        if (isSubif) c += base + ' tag ' + subifVlan + '\n';
        if (f.ip) {
            const prefix = ccMaskToPrefix(f.mask);
            c += base + ' ip ' + f.ip + '/' + prefix + '\n';
        }
        if (f.desc) {
            if (isSubif) {
                // PAN-OS subinterface'lerde ayrı comment yok — parent comment'le çakışmasın
                ccDropField(ir, 'interface', f.name, 'desc', f.desc, 'paloalto-subif-no-comment', 'paloalto');
            } else {
                c += 'set network interface ethernet ' + parentIf + ' comment "' + f.desc + '"\n';
            }
        }
        if (f.mtu)  c += base + ' mtu ' + f.mtu + '\n';
        // PAN-OS interface enable/disable CLI bootstrap'tan değil GUI'den —
        // sessizce drop edip lostFields'a düşür
        if (f.shutdown) ccDropField(ir, 'interface', f.name, 'shutdown', f.shutdown, 'paloalto-disable-via-gui-only', 'paloalto');
        if (f._aclIn || f._aclOut) ccDropField(ir, 'interface', f.name, f._aclIn ? '_aclIn' : '_aclOut', f._aclIn || f._aclOut, 'paloalto-acl-in-security-rule', 'paloalto');
        if (f.voice_vlan)     ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'paloalto-no-voice-vlan',     'paloalto');
        if (f.port_security && f.port_security.enabled)
                              ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'paloalto-no-port-security',  'paloalto');
        if (f.edge_port)      ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'paloalto-no-stp-on-iface',   'paloalto');
        if (f.bpdu_guard)     ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'paloalto-no-stp-on-iface',   'paloalto');
        if (f.service_policy) ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'paloalto-qos-profile-different','paloalto');
    });
    if (ir.interfaces.length) c += '\n';
    // Aggregate-ethernet (LAG) bundles
    (ir.bundles || []).forEach(b => {
        const aeName = 'ae' + b.id;
        if (b.ip) c += 'set network interface aggregate-ethernet ' + aeName + ' layer3 ip ' + b.ip + '/' + ccMaskToPrefix(b.mask || '255.255.255.0') + '\n';
        if (b.desc) c += 'set network interface aggregate-ethernet ' + aeName + ' comment "' + b.desc + '"\n';
        (b.members || []).forEach(m => {
            c += 'set network interface ethernet ' + m + ' aggregate-group ' + aeName + '\n';
        });
    });
    if (ir.bundles && ir.bundles.length) c += '\n';
    ir.routes.forEach(r => {
        const prefix = ccMaskToPrefix(r.mask);
        c += 'set network virtual-router default routing-table ip static-route route_' + r.network.replace(/\./g, '_') + ' destination ' + r.network + '/' + prefix + '\n';
        c += 'set network virtual-router default routing-table ip static-route route_' + r.network.replace(/\./g, '_') + ' nexthop ip-address ' + r.nexthop + '\n';
    });
    if (ir.routes.length) c += '\n';
    (ir.addressObjects || []).forEach(a => {
        if (a.type === 'host') c += 'set address "' + a.name + '" ip-netmask ' + a.value + '/32\n';
        else if (a.type === 'network') c += 'set address "' + a.name + '" ip-netmask ' + a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.0') + '\n';
        else if (a.type === 'fqdn') c += 'set address "' + a.name + '" fqdn ' + a.value + '\n';
        else if (a.type === 'group') c += 'set address-group "' + a.name + '" static [ ' + (a.members || []).join(' ') + ' ]\n';
    });
    if (ir.addressObjects && ir.addressObjects.length) c += '\n';
    function paObjRef(val) {
        if (!val || val === 'any') return 'any';
        const objs = ir.addressObjects || [];
        if (objs.find(a => a.name === val)) return '"' + val + '"';
        const byVal = objs.find(a =>
            a.value === val ||
            (a.type === 'host'    && (a.value + '/32') === val) ||
            (a.type === 'network' && (a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.0')) === val)
        );
        return byVal ? '"' + byVal.name + '"' : val;
    }
    (ir.securityPolicies || []).forEach(pol => {
        const base = 'set rulebase security rules "' + pol.name + '"';
        c += base + ' from ' + (pol.srcZone ? '[ ' + ccNormalizeZone(pol.srcZone) + ' ]' : '[ any ]') + '\n';
        c += base + ' to ' + (pol.dstZone ? '[ ' + ccNormalizeZone(pol.dstZone) + ' ]' : '[ any ]') + '\n';
        c += base + ' source [ ' + (pol.srcAddr || ['any']).map(paObjRef).join(' ') + ' ]\n';
        c += base + ' destination [ ' + (pol.dstAddr || ['any']).map(paObjRef).join(' ') + ' ]\n';
        c += base + ' service ' + ((pol.service || []).length ? '[ ' + pol.service.join(' ') + ' ]' : 'application-default') + '\n';
        c += base + ' action ' + (pol.action === 'allow' ? 'allow' : 'deny') + '\n';
        if (pol.log) c += base + ' log-end yes\n';
        c += '\n';
    });
    if (!(ir.securityPolicies && ir.securityPolicies.length)) {
        ir.acls.forEach(acl => {
            const base = 'set rulebase security rules "' + acl.name + '"';
            const e = acl.entries[0] || { action: 'permit', src: 'any', dst: 'any', proto: 'any' };
            c += base + ' action ' + (e.action === 'permit' ? 'allow' : 'deny') + '\n';
            c += base + ' source [ ' + e.src + ' ]\n';
            c += base + ' destination [ ' + e.dst + ' ]\n';
            c += base + ' service application-default\n';
            c += base + ' log-end yes\n\n';
        });
    }
    // Zone (interface bağlı) — ir.zones jenerik alanı, FortiGate ile paylaşılıyor
    (ir.zones || []).forEach(z => {
        if (!z.name) return;
        c += 'set zone "' + z.name + '" network layer3 [ ' + (z.interfaces || []).join(' ') + ' ]\n';
    });
    if (ir.zones && ir.zones.length) c += '\n';
    // NAT — ir.natRules jenerik alanı (Faz 0'da FortiGate için eklendi, burada da aynı şema kullanılıyor)
    (ir.natRules || []).forEach((n, idx) => {
        const name = n.name || n._ruleName || ('NAT_' + (idx + 1));
        const base = 'set rulebase nat rules "' + name + '"';
        // Port yönlendirme: servis nesnesi (özgün port) + translated-port (tek port). PAN-OS servis
        // nesnesi tcp/udp; eşleme karşılanamazsa kural yazılmaz (tüm portları açan DNAT olurdu).
        let pfSvc = '', pfPort = '';
        if (n.portForward) {
            const one = v => /^\d{1,5}$/.test(v || '') && +v >= 1 && +v <= 65535;
            const rng = v => /^\d{1,5}(-\d{1,5})?$/.test(v || '');
            const tp = n.transPort || n.origPort;
            const okShape = ['tcp', 'udp'].includes(n.proto) && rng(n.origPort) && (tp === n.origPort || (one(n.origPort) && one(tp)));
            if (!okShape || !(n.origDst && n.transDst)) {
                ccDropField(ir, 'natRules', name, 'portForward', (n.proto || '') + ' ' + (n.origPort || '') + '->' + (n.transPort || ''),
                    'paloalto-port-forward-shape-unsupported-manual', 'paloalto', CC_SEVERITY.MANUAL);
                return;
            }
            pfSvc = name + '-svc';
            c += 'set service "' + pfSvc + '" protocol ' + n.proto + ' port ' + n.origPort + '\n';
            if (tp !== n.origPort) pfPort = tp;
        }
        c += base + ' from any\n';
        c += base + ' to any\n';
        c += base + ' source [ ' + (n.origSrc || 'any') + ' ]\n';
        c += base + ' destination [ ' + (n.origDst || 'any') + ' ]\n';
        c += base + ' service ' + (pfSvc ? '"' + pfSvc + '"' : 'any') + '\n';
        if (n.origDst && n.transDst) {
            c += base + ' destination-translation translated-address ' + n.transDst + '\n';
            if (pfPort) c += base + ' destination-translation translated-port ' + pfPort + '\n';
        } else if (n.transSrc === 'interface') {
            c += base + ' source-translation dynamic-ip-and-port interface-address\n';
            if (n.iface) c += base + ' to-interface ' + n.iface + '\n';
        } else if (n.transSrc) {
            const isRange = String(n.transSrc).includes('-');
            c += base + ' source-translation ' + (isRange ? 'dynamic-ip-and-port translated-address ' : 'static-ip static-translated-address ') + n.transSrc + '\n';
        }
        c += '\n';
    });
    // IPsec VPN — ir.vpnTunnels jenerik alanı (Faz 1'de FortiGate için eklendi)
    (ir.vpnTunnels || []).forEach(t => {
        const ikeProf = t.p1Name + '_IKE', ipsecProf = t.p1Name + '_IPSEC', gwName = t.p1Name + '_GW';
        const dh = /^group/.test(t.dhgrp || '') ? t.dhgrp : 'group' + (t.dhgrp || '14');
        const propM = /^(aes\d+)-(sha\d+)$/.exec(t.proposal || 'aes256-sha256') || ['', 'aes256', 'sha256'];
        const enc = propM[1].replace(/^aes/, 'aes-') + '-cbc', hash = propM[2];
        c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" dh-group ' + dh + '\n';
        c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" hash ' + hash + '\n';
        c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" encryption ' + enc + '\n';
        c += 'set network ike gateway "' + gwName + '" interface ' + (t.iface || '') + '\n';
        c += 'set network ike gateway "' + gwName + '" peer-address ip ' + (t.remoteGw || '') + '\n';
        c += 'set network ike gateway "' + gwName + '" authentication pre-shared-key key ' + (t.psk || '') + '\n';
        c += 'set network ike gateway "' + gwName + '" protocol-common ike-crypto-profile "' + ikeProf + '"\n';
        c += 'set network tunnel ipsec "' + (t.p2Name || t.p1Name + '_TUN') + '" ike gateway "' + gwName + '"\n';
        c += 'set network tunnel ipsec "' + (t.p2Name || t.p1Name + '_TUN') + '" ike ipsec-crypto-profile "' + ipsecProf + '"\n';
        if (t.localSubnet)  c += 'set network tunnel ipsec "' + (t.p2Name || t.p1Name + '_TUN') + '" auto-key proxy-id "proxy1" local ' + t.localSubnet + '\n';
        if (t.remoteSubnet) c += 'set network tunnel ipsec "' + (t.p2Name || t.p1Name + '_TUN') + '" auto-key proxy-id "proxy1" remote ' + t.remoteSubnet + '\n';
        c += '\n';
    });
    // HA — ir.ha jenerik alanı; PAN-OS ha1/ha2 detayları varsa (opsiyonel alanlar) kullanılır
    if (ir.ha) {
        const h = ir.ha;
        c += 'set deviceconfig high-availability enabled yes\n';
        c += 'set deviceconfig high-availability group ' + (h.groupId || '1') + ' mode active-passive\n';
        c += 'set deviceconfig high-availability group ' + (h.groupId || '1') + ' election-option device-priority ' + (h.priority || '100') + '\n';
        if (h.ha1) {
            c += 'set deviceconfig high-availability interface ha1 port ' + h.ha1.iface + '\n';
            c += 'set deviceconfig high-availability interface ha1 ip-address ' + h.ha1.ip + '\n';
            if (h.ha1.peerIp) c += 'set deviceconfig high-availability interface ha1 gateway ' + h.ha1.peerIp + '\n';
        }
        if (h.ha2) {
            c += 'set deviceconfig high-availability interface ha2 port ' + h.ha2.iface + '\n';
            c += 'set deviceconfig high-availability interface ha2 ip-address ' + h.ha2.ip + '\n';
        }
        c += '\n';
    }
    // Security Profile Group — ir.utmProfiles jenerik alanı (Faz 1'de FortiGate için eklendi,
    // PAN-OS alan adları farklı: virus/vulnerability/url-filtering/spyware)
    (ir.utmProfiles || []).forEach(u => {
        if (!u.groupName) return;
        if (u.avName)       c += 'set profile-group ' + u.groupName + ' virus ' + u.avName + '\n';
        if (u.vulnName)     c += 'set profile-group ' + u.groupName + ' vulnerability ' + u.vulnName + '\n';
        if (u.webfilterName) c += 'set profile-group ' + u.groupName + ' url-filtering ' + u.webfilterName + '\n';
        if (u.spywareName) c += 'set profile-group ' + u.groupName + ' spyware ' + u.spywareName + '\n';
        if (u.ruleName) c += 'set rulebase security rules "' + u.ruleName + '" profile-setting group [ ' + u.groupName + ' ]\n';
        c += '\n';
    });
    // SD-WAN — ir.sdwan jenerik alanı (Faz 1); PAN-OS: link-tag primary/secondary + weight
    if (ir.sdwan && ir.sdwan.members && ir.sdwan.members.length) {
        const tags = ['primary', 'secondary'];
        ir.sdwan.members.forEach((mb, idx) => {
            c += 'set network sdwan interface ' + mb.iface + ' link-tag ' + (tags[idx] || 'backup' + idx) + '\n';
            c += 'set network sdwan virtual-interface ' + mb.iface + ' weight ' + (mb.weight || mb.cost || '100') + '\n';
        });
        if (ir.sdwan.healthCheck) {
            const hc = ir.sdwan.healthCheck, primaryIface = ir.sdwan.members[0].iface;
            c += 'set network sdwan interface ' + primaryIface + ' health-check enable yes\n';
            c += 'set network sdwan interface ' + primaryIface + ' health-check server ' + hc.server + '\n';
            c += 'set network sdwan interface ' + primaryIface + ' health-check failure-condition threshold ' + (hc.failThreshold || '3') + '\n';
        }
        c += '\n';
    }
    c += 'commit\n\n';
    if (ir.unknowns && ir.unknowns.length) {
        c += '# ---- Çevrilemeyen satırlar (' + ir.unknowns.length + ') ----\n';
        ir.unknowns.forEach(u => c += '# ' + u + '\n');
    }
    return c;
}
CC_WRITERS['paloalto'] = ccWritePaloAlto;
