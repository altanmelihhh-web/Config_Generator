'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Check Point Gaia (clish) Writer ──────────────────────────────────────────
function ccWriteCheckPoint(ir) {
    let c = '# ======================================\n# Check Point Gaia — Converted Configuration\n# ======================================\n\n';

    // ── Bölüm 1: Gaia clish (interface / route / hostname) — prefix YOK ──
    c += '# ── Gaia clish ──────────────────────────────────────────────────────\n';
    if (ir.hostname) c += 'set hostname ' + ir.hostname + '\n';

    // CheckPoint Gaia: tüm interface'ler (L2-only + L3) emit edilir.
    // Subif: name="ethN.M" → önce `add interface ethN.M vlan M`
    const allIfaces = (ir.interfaces || []).filter(f => !f.name.toLowerCase().startsWith('vlan'));
    if (allIfaces.length) {
        c += '\n';
        allIfaces.forEach(f => {
            const subifM = String(f.name).match(/^(.+)\.(\d+)$/);
            const isSubif = !!subifM;
            const parentIf = isSubif ? subifM[1] : f.name;
            const subifVlan = isSubif ? parseInt(subifM[2], 10) : null;
            if (isSubif) {
                c += 'add interface ' + parentIf + ' vlan ' + subifVlan + '\n';
            }
            if (f.ip) {
                const prefix = f.mask ? ccMaskToPrefix(f.mask) : '24';
                c += 'set interface ' + f.name + ' ipv4-address ' + f.ip + ' mask-length ' + prefix + '\n';
            }
            c += 'set interface ' + f.name + ' state ' + (f.shutdown ? 'off' : 'on') + '\n';
            if (f.mtu)  c += 'set interface ' + f.name + ' mtu ' + f.mtu + '\n';
            if (f.desc) c += 'set interface ' + f.name + ' comments "' + f.desc + '"\n';
            // Unsupported
            if (f.vlan_mode === 'trunk' && !isSubif) ccDropField(ir, 'interface', f.name, 'vlan_mode', f.vlan_mode, 'checkpoint-l2-switching-not-supported', 'checkpoint');
            if (f._aclIn || f._aclOut) ccDropField(ir, 'interface', f.name, f._aclIn ? '_aclIn' : '_aclOut', f._aclIn || f._aclOut, 'checkpoint-acl-in-policy-package', 'checkpoint');
            if (f.voice_vlan)     ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'checkpoint-no-voice-vlan',    'checkpoint');
            if (f.port_security && f.port_security.enabled)
                                  ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'checkpoint-no-port-security', 'checkpoint');
            if (f.edge_port)      ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'checkpoint-no-stp-on-iface',  'checkpoint');
            if (f.bpdu_guard)     ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'checkpoint-no-stp-on-iface',  'checkpoint');
            if (f.service_policy) ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'checkpoint-qos-different',    'checkpoint');
        });
    }

    if (ir.routes && ir.routes.length) {
        c += '\n';
        ir.routes.forEach(r => {
            const prefix = r.mask ? ccMaskToPrefix(r.mask) : '0';
            c += 'set static-route ' + r.network + '/' + prefix + ' nexthop gateway address ' + r.nexthop + ' on\n';
        });
    }
    c += 'save config\n';

    // ── Bölüm 2: mgmt_cli (objects + policy — Management API) ────────────
    const hasObjs = (ir.addressObjects && ir.addressObjects.length) ||
                    (ir.serviceObjects && ir.serviceObjects.length);
    const hasPols = (ir.securityPolicies && ir.securityPolicies.length) ||
                    (ir.acls && ir.acls.length);

    if (hasObjs || hasPols) {
        c += '\n# ── mgmt_cli (Management API — objects ve policy) ────────────────────\n';

        // Address objects
        (ir.addressObjects || []).forEach(a => {
            if (a.type === 'host') {
                c += 'mgmt_cli add host name "' + a.name + '" ipv4-address "' + a.value + '"\n';
            } else if (a.type === 'network') {
                c += 'mgmt_cli add network name "' + a.name + '" subnet "' + a.value + '" mask-length "' + ccMaskToPrefix(a.mask || '255.255.255.0') + '"\n';
            } else if (a.type === 'range') {
                const parts = (a.value || '').split('-');
                c += 'mgmt_cli add address-range name "' + a.name + '" ipv4-address-first "' + (parts[0] || '') + '" ipv4-address-last "' + (parts[1] || '') + '"\n';
            } else if (a.type === 'group') {
                c += 'mgmt_cli add group name "' + a.name + '"' +
                    (a.members || []).map((m, i) => ' members.' + (i + 1) + ' "' + m + '"').join('') + '\n';
            }
        });
        if (ir.addressObjects && ir.addressObjects.length) c += '\n';

        // Service objects
        (ir.serviceObjects || []).forEach(s => {
            if (s.type === 'group') {
                c += 'mgmt_cli add service-group name "' + s.name + '"' +
                    (s.members || []).map((m, i) => ' members.' + (i + 1) + ' "' + m + '"').join('') + '\n';
            } else if (s.proto === 'tcp') {
                c += 'mgmt_cli add service-tcp name "' + s.name + '" port "' + (s.ports || '0') + '"\n';
            } else if (s.proto === 'udp') {
                c += 'mgmt_cli add service-udp name "' + s.name + '" port "' + (s.ports || '0') + '"\n';
            } else if (s.proto === 'icmp') {
                c += 'mgmt_cli add service-icmp name "' + s.name + '"\n';
            }
        });
        if (ir.serviceObjects && ir.serviceObjects.length) c += '\n';

        // Reverse-lookup: IP/CIDR veya raw değer → addressObject ismi
        function cpObjRef(val) {
            if (!val || val === 'any' || val === 'all') return 'Any';
            const objs = ir.addressObjects || [];
            // Önce isim eşleşmesi dene
            if (objs.find(a => a.name === val)) return val;
            // IP/CIDR'dan ters arama
            const byVal = objs.find(a =>
                a.value === val ||
                (a.type === 'host'    && (a.value + '/32') === val) ||
                (a.type === 'network' && (a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.0')) === val)
            );
            return byVal ? byVal.name : val;
        }

        // Servis ismi tutarlılığı: aynı adlı serviceObject varsa onu kullan
        function cpSvcRef(val) {
            if (!val || val === 'any' || val === 'ALL') return 'Any';
            const svcs = ir.serviceObjects || [];
            if (svcs.find(s => s.name === val)) return val;
            return val;
        }

        // Security policies → mgmt_cli add access-rule
        const policies = (ir.securityPolicies && ir.securityPolicies.length) ? ir.securityPolicies : [];
        const aclPols  = (!policies.length && ir.acls && ir.acls.length) ? ir.acls : [];

        if (policies.length) {
            policies.forEach((pol, idx) => {
                const action   = pol.action === 'allow' ? 'Accept' : 'Drop';
                const src      = cpObjRef((pol.srcAddr && pol.srcAddr[0]) || 'Any');
                const dst      = cpObjRef((pol.dstAddr && pol.dstAddr[0]) || 'Any');
                const svc      = cpSvcRef((pol.service && pol.service[0]) || 'Any');
                const position = (pol.seq !== null && pol.seq !== undefined) ? pol.seq : (idx + 1);
                if (pol.srcZone || pol.dstZone) {
                    c += '# YÖN: ' + (pol.srcZone || '?') + ' → ' + (pol.dstZone || '?') +
                         ' (gateway\'e install-on ile bağla)\n';
                }
                c += 'mgmt_cli add access-rule layer "Network" position ' + position +
                     ' name "' + pol.name + '"' +
                     ' source "' + src + '"' +
                     ' destination "' + dst + '"' +
                     ' service "' + svc + '"' +
                     ' action "' + action + '"' +
                     ' track "Log"\n';
            });
            c += 'mgmt_cli publish\n';
        } else if (aclPols.length) {
            aclPols.forEach((acl, idx) => {
                acl.entries.forEach(e => {
                    const action = e.action === 'permit' ? 'Accept' : 'Drop';
                    if (acl.srcintf || acl.dstintf) {
                        c += '# YÖN: ' + (acl.srcintf || '?') + ' → ' + (acl.dstintf || '?') +
                             ' (gateway\'e install-on ile bağla)\n';
                    }
                    c += 'mgmt_cli add access-rule layer "Network" position ' + (idx + 1) +
                         ' name "' + acl.name + '"' +
                         ' source "' + cpObjRef(e.src !== 'any' ? e.src : 'Any') + '"' +
                         ' destination "' + cpObjRef(e.dst !== 'any' ? e.dst : 'Any') + '"' +
                         ' action "' + action + '"' +
                         ' track "Log"\n';
                });
            });
            c += 'mgmt_cli publish\n';
        }
    }

    // ── Notlar ───────────────────────────────────────────────────────────
    c += '\n# ── Notlar ──────────────────────────────────────────────────────────\n';
    c += '# Interface adları (port1/port2 vb.) Check Point\'te eth0/eth1 olabilir — fiziksel mapping\'i kontrol et.\n';
    c += '# Policy kuralları için "install-on" ile gateway\'i belirtmen gerekir: mgmt_cli set access-rule name "..." install-on "GW-Name"\n';
    c += '# NAT kuralı yoksa varsayılan olarak NAT devre dışı — gerekirse mgmt_cli add nat-rule ile ekle.\n';

    if (ir.unknowns && ir.unknowns.length) {
        c += '\n# ---- Çevrilemeyen satırlar (' + ir.unknowns.length + ') ----\n';
        ir.unknowns.forEach(u => c += '# ' + u + '\n');
    }
    return c;
}
CC_WRITERS['checkpoint'] = ccWriteCheckPoint;
