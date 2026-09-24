'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Cisco IOS Writer ──────────────────────────────────────────────────────────
function ccWriteCiscoIOS(ir) {
    let c = '! ======================================\n! Cisco IOS — Converted Configuration\n! ======================================\n\n';
    if (ir.hostname) c += 'hostname ' + ir.hostname + '\n!\n';
    if (ir.spanningTree && ir.spanningTree.mode) {
        const m = ir.spanningTree.mode;
        const ciscoMode = m === 'rstp' ? 'rapid-pvst' : m === 'mstp' ? 'mst' : m === 'pvst' ? 'pvst' : m;
        c += 'spanning-tree mode ' + ciscoMode + '\n!\n';
    }
    if (ir.system && ir.system.jumbo_mtu) {
        c += 'system mtu jumbo ' + ir.system.jumbo_mtu + '\n!\n';
    }
    ir.vlans.forEach(v => { c += ccBuildCiscoVlanBlock(v, ir.vrrp || []); });
    const _bundleMembers = new Set();
    (ir.bundles || []).forEach(b => (b.members || []).forEach(m => _bundleMembers.add(m)));
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_bundleMembers.has(f.name)) return;
        const ifName = ccNormalizeIfaceFromJuniper(f.name, 'cisco');
        const _ciscoSub = ccGetWriterSubif(f);
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        // Router L3 subif: encapsulation dot1Q (Cisco IOS-paralel; Arista wrapper miras alır)
        if (_ciscoSub) {
            const _enc = _ciscoSub.encapsulation;
            if (_enc.type === 'qinq' && _enc.qinq_inner) {
                c += ' encapsulation dot1Q ' + _enc.vlan + ' second-dot1q ' + _enc.qinq_inner + '\n';
            } else {
                c += ' encapsulation dot1Q ' + _enc.vlan + (_enc.native ? ' native' : '') + '\n';
            }
        }
        if (f.no_switchport) c += ' no switchport\n';
        if (f.ip) c += ' ip address ' + f.ip + ' ' + f.mask + '\n';
        if (f.mtu) c += ' mtu ' + f.mtu + '\n';
        // L2 switchport komutları subif olmayan iface'lere uygulanır
        if (!_ciscoSub && f.vlan_mode === 'access') { c += ' switchport mode access\n'; if (f.access_vlan) c += ' switchport access vlan ' + f.access_vlan + '\n'; }
        if (!_ciscoSub && f.voice_vlan) c += ' switchport voice vlan ' + f.voice_vlan + '\n';
        if (!_ciscoSub && f.vlan_mode === 'trunk') {
            c += ' switchport mode trunk\n';
            if (f.native_vlan) c += ' switchport trunk native vlan ' + f.native_vlan + '\n';
            const _tv = Array.isArray(f.trunk_vlans) ? f.trunk_vlans.join(',') : (f.trunk_vlans ? String(f.trunk_vlans).replace(/\s+/g, ',') : '');
            if (_tv) c += ' switchport trunk allowed vlan ' + _tv + '\n';
        }
        if (f._aclIn)  c += ' ip access-group ' + f._aclIn  + ' in\n';
        if (f._aclOut) c += ' ip access-group ' + f._aclOut + ' out\n';
        if (f.pbr_route_map) c += ' ip policy route-map ' + f.pbr_route_map + '\n';
        if (f.edge_port) c += ' spanning-tree portfast\n';
        if (f.bpdu_guard) c += ' spanning-tree bpduguard enable\n';
        if (f.port_security && f.port_security.enabled) {
            c += ' switchport port-security\n';
            if (f.port_security.max) c += ' switchport port-security maximum ' + f.port_security.max + '\n';
            if (f.port_security.violation) c += ' switchport port-security violation ' + f.port_security.violation + '\n';
            if (f.port_security.sticky) c += ' switchport port-security mac-address sticky\n';
        }
        if (f.dhcp_snoop_trust) c += ' ip dhcp snooping trust\n';
        if (f.bfd) {
            const iv = f.bfd.interval || (f.bfd.enabled ? 300 : 0);
            if (iv) c += ' bfd interval ' + iv + ' min_rx ' + (f.bfd.min_rx || iv) + ' multiplier ' + (f.bfd.multiplier || 3) + '\n';
        }
        if (f.service_policy) {
            if (f.service_policy.input) c += ' service-policy input ' + f.service_policy.input + '\n';
            if (f.service_policy.output) c += ' service-policy output ' + f.service_policy.output + '\n';
        }
        if (f.shutdown) c += ' shutdown\n';
        c += '!\n';
    });
    // Bundles → Port-channel + channel-group
    (ir.bundles || []).forEach(b => {
        c += 'interface Port-channel' + b.id + '\n';
        if (b.desc) c += ' description ' + b.desc + '\n';
        if (b.ip) c += ' ip address ' + b.ip + ' ' + (b.mask || '255.255.255.0') + '\n';
        if (b.vlan_mode === 'access') { c += ' switchport mode access\n'; if (b.access_vlan) c += ' switchport access vlan ' + b.access_vlan + '\n'; }
        if (b.vlan_mode === 'trunk') {
            c += ' switchport mode trunk\n';
            if (b.native_vlan) c += ' switchport trunk native vlan ' + b.native_vlan + '\n';
            const tv = Array.isArray(b.trunk_vlans) ? b.trunk_vlans.join(',') : (b.trunk_vlans ? String(b.trunk_vlans).replace(/\s+/g, ',') : '');
            if (tv) c += ' switchport trunk allowed vlan ' + tv + '\n';
        }
        if (b.mtu) c += ' mtu ' + b.mtu + '\n';
        c += '!\n';
        if (b.members && b.members.length) {
            const ciscoMode = b.mode === 'lacp-active' ? 'active' : b.mode === 'lacp-passive' ? 'passive' : 'on';
            b.members.forEach(m => {
                const cn = ccNormalizeIfaceFromJuniper(m, 'cisco');
                c += 'interface ' + cn + '\n channel-group ' + b.id + ' mode ' + ciscoMode + '\n!\n';
            });
        }
    });

    ir.routes.forEach(r => { c += ccBuildCiscoStaticRouteLine(r.network, r.mask, r.nexthop, r.metric); });
    if (ir.routes.length) c += '!\n';
    ir.acls.forEach(acl => {
        c += 'ip access-list ' + (acl.type || 'extended') + ' ' + acl.name + '\n';
        acl.entries.forEach(e => { c += ' ' + ccFormatAclEntryWildcard(e) + '\n'; });
        c += '!\n';
    });
    // route-map
    (ir.routeMaps || []).forEach(rm => {
        c += 'route-map ' + rm.name + ' ' + rm.action + ' ' + rm.seq + '\n';
        if (rm.match_acl) c += ' match ip address ' + rm.match_acl + '\n';
        if (rm.set_next_hop) c += ' set ip next-hop ' + rm.set_next_hop + '\n';
        c += '!\n';
    });
    // class-map / policy-map (QoS)
    (ir.qos && ir.qos.classMaps || []).forEach(cm => {
        c += 'class-map match-' + (cm.match_type || 'any') + ' ' + cm.name + '\n';
        if (cm.match_dscp) c += ' match dscp ' + cm.match_dscp + '\n';
        if (cm.match_acl) c += ' match access-group name ' + cm.match_acl + '\n';
        c += '!\n';
    });
    (ir.qos && ir.qos.policyMaps || []).forEach(pm => {
        c += 'policy-map ' + pm.name + '\n';
        pm.classes.forEach(cl => {
            c += ' class ' + cl.name + '\n';
            if (cl.action === 'priority' && cl.priority_pct) c += '  priority percent ' + cl.priority_pct + '\n';
            else if (cl.action === 'bandwidth' && cl.priority_pct) c += '  bandwidth percent ' + cl.priority_pct + '\n';
            else if (cl.action === 'fair-queue' || cl.fair_queue) c += '  fair-queue\n';
            else if (cl.action === 'priority') c += '  priority\n';
        });
        c += '!\n';
    });
    // monitor session (SPAN)
    (ir.monitorSessions || []).forEach(sess => {
        sess.sources.forEach(src => {
            const sName = ccNormalizeIfaceFromJuniper(src.name, 'cisco');
            c += 'monitor session ' + sess.id + ' source interface ' + sName + (src.direction && src.direction !== 'both' ? ' ' + src.direction : ' both') + '\n';
        });
        if (sess.destination) {
            const dName = ccNormalizeIfaceFromJuniper(sess.destination, 'cisco');
            c += 'monitor session ' + sess.id + ' destination interface ' + dName + '\n';
        }
    });
    // ip sla
    (ir.ipSla || []).forEach(sla => {
        c += 'ip sla ' + sla.id + '\n';
        if (sla.type === 'icmp-echo' && sla.target) {
            let src = '';
            if (sla.source_iface) src = ' source-interface ' + ccNormalizeIfaceFromJuniper(sla.source_iface, 'cisco');
            else if (sla.source_address) {
                const srcIface = (ir.interfaces || []).find(f => f.ip === sla.source_address);
                src = srcIface ? ' source-interface ' + ccNormalizeIfaceFromJuniper(srcIface.name, 'cisco') : ' source-ip ' + sla.source_address;
            }
            c += ' icmp-echo ' + sla.target + src + '\n';
        }
        if (sla.frequency) c += ' frequency ' + sla.frequency + '\n';
        c += '!\n';
        c += 'ip sla schedule ' + sla.id + ' life ' + (sla.schedule && sla.schedule.life || 'forever') + ' start-time ' + (sla.schedule && sla.schedule.start || 'now') + '\n';
    });
    // track
    (ir.tracks || []).forEach(t => {
        c += 'track ' + t.id + ' ip sla ' + t.sla_id + ' reachability\n';
    });
    // event manager applet
    (ir.eventApplets || []).forEach(app => {
        c += 'event manager applet ' + app.name + '\n';
        if (app.trigger && app.trigger.startsWith('track-')) {
            const tm = app.trigger.match(/^track-(\d+)-(\S+)/);
            if (tm) c += ' event track ' + tm[1] + ' state ' + tm[2] + '\n';
        }
        if (app.action && app.action.startsWith('syslog: ')) {
            c += ' action 1.0 syslog msg "' + app.action.slice(8) + '"\n';
        }
        c += '!\n';
    });
    c += ccWriteSystemCiscoIOS(ir);
    c += ccWriteOspfCiscoIOS(ir);
    c += ccWriteBgpCiscoIOS(ir);
    c += ccWriteUnknowns(ir.unknowns);
    return c;
}
CC_WRITERS['cisco-ios'] = ccWriteCiscoIOS;

// ── Cisco ASA Writer ──────────────────────────────────────────────────────────
function ccWriteCiscoASA(ir) {
    let c = '! ======================================\n! Cisco ASA — Converted Configuration\n! ======================================\n\n';
    if (ir.hostname) c += 'hostname ' + ir.hostname + '\n!\n';
    ir.interfaces.forEach((f, idx) => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        const ifName = ccNormalizeIfaceFromJuniper(f.name, 'cisco');
        const subifM = String(ifName).match(/^(.+)\.(\d+)$/);
        const isSubif = !!subifM;
        const subifVlan = isSubif ? parseInt(subifM[2], 10) : null;
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        if (isSubif) c += ' vlan ' + subifVlan + '\n';
        c += ' nameif ' + (f.nameif || (idx === 0 ? 'outside' : 'inside')) + '\n';
        c += ' security-level ' + (f.security_level || (idx === 0 ? '0' : '100')) + '\n';
        if (f.ip) c += ' ip address ' + f.ip + ' ' + f.mask + '\n';
        if (f.mtu) c += ' mtu ' + (f.nameif || (idx === 0 ? 'outside' : 'inside')) + ' ' + f.mtu + '\n';
        c += (f.shutdown ? ' shutdown\n' : ' no shutdown\n');
        c += '!\n';
        // Unsupported on ASA: L2 switching kavramı yok
        if (f.vlan_mode === 'access' && !isSubif) ccDropField(ir, 'interface', f.name, 'vlan_mode', f.vlan_mode, 'asa-no-l2-switching', 'cisco-asa');
        if (f.vlan_mode === 'trunk' && !isSubif)  ccDropField(ir, 'interface', f.name, 'vlan_mode', f.vlan_mode, 'asa-no-l2-switching', 'cisco-asa');
        if (f.voice_vlan)     ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'asa-no-voice-vlan',    'cisco-asa');
        if (f.port_security && f.port_security.enabled)
                              ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'asa-no-port-security', 'cisco-asa');
        if (f.edge_port)      ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'asa-no-stp-on-iface',  'cisco-asa');
        if (f.bpdu_guard)     ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'asa-no-stp-on-iface',  'cisco-asa');
    });
    ir.routes.forEach(r => { c += 'route ' + (r.iface || 'outside') + ' ' + r.network + ' ' + r.mask + ' ' + r.nexthop + (r.metric && r.metric !== '1' ? ' ' + r.metric : '') + '\n'; });
    if (ir.routes.length) c += '!\n';
    // Address objects
    (ir.addressObjects || []).filter(a => a.type !== 'group').forEach(a => {
        c += 'object network ' + a.name + '\n';
        if (a.type === 'host') c += ' host ' + a.value + '\n';
        else if (a.type === 'network') c += ' subnet ' + a.value + ' ' + (a.mask || '255.255.255.0') + '\n';
        else if (a.type === 'range') { const [s, e] = (a.value || '').split('-'); c += ' range ' + (s || '') + ' ' + (e || '') + '\n'; }
        c += '!\n';
    });
    // Group objects
    (ir.addressObjects || []).filter(a => a.type === 'group').forEach(g => {
        c += 'object-group network ' + g.name + '\n';
        (g.members || []).forEach(m => { c += ' group-object ' + m + '\n'; });
        c += '!\n';
    });
    // NAT rules
    (ir.natRules || []).forEach((n, idx) => {
        if (n.type === 'static') c += 'nat (inside,outside) ' + (idx + 1) + ' source static ' + (n.origSrc || 'any') + ' ' + (n.transSrc || 'any') + ' destination static ' + (n.origDst || 'any') + ' ' + (n.transDst || 'any') + '\n';
        else c += 'nat (inside,outside) dynamic ' + (n.origSrc || 'any') + ' interface\n';
    });
    if (ir.natRules && ir.natRules.length) c += '!\n';
    // Security policies as access-lists
    if (ir.securityPolicies && ir.securityPolicies.length) {
        ir.securityPolicies.forEach(pol => {
            (pol.srcAddr || ['any']).forEach(src => {
                (pol.dstAddr || ['any']).forEach(dst => {
                    c += 'access-list ' + (pol.srcZone || 'OUTSIDE') + '_in extended ' + (pol.action === 'allow' ? 'permit' : 'deny') + ' ip ' + ccResolveAddr(src, ir) + ' ' + ccResolveAddr(dst, ir) + '\n';
                });
            });
        });
        c += '!\n';
    } else {
        ir.acls.forEach(acl => {
            acl.entries.forEach(e => { c += 'access-list ' + acl.name + ' extended ' + e.action + ' ' + e.proto + ' ' + e.src + (e.dst !== 'any' ? ' ' + e.dst : ' any') + (e.dst_port ? ' ' + e.dst_port : '') + '\n'; });
            c += 'access-list ' + acl.name + ' extended deny ip any any\n!\n';
        });
    }
    c += ccWriteUnknowns(ir.unknowns);
    return c;
}
CC_WRITERS['cisco-asa'] = ccWriteCiscoASA;
CC_WRITERS['cisco-ftd'] = ccWriteCiscoASA; // FTD ASA-compatible fallback

// ── Cisco NX-OS Writer ────────────────────────────────────────────────────────
function ccWriteCiscoNXOS(ir) {
    let c = '! ======================================\n! Cisco NX-OS — Converted Configuration\n! ======================================\n\n';
    if (ir.hostname) c += 'hostname ' + ir.hostname + '\n!\n';

    // NX-OS feature prerequisites (feature-set'leri otomatik üret)
    const _hasSVI = (ir.vlans || []).some(v => v.svi_ip) ||
                    (ir.interfaces || []).some(f => f.name && f.name.toLowerCase().startsWith('vlan'));
    const _hasPortSec = (ir.interfaces || []).some(f => f.port_security && f.port_security.enabled);
    const _hasBfd = (ir.interfaces || []).some(f => f.bfd) ||
                    (ir.bgp && (ir.bgp.neighbors || []).some(n => n.bfd));
    const _hasLacp = (ir.bundles || []).length > 0;
    const _hasOspf = (ir.ospf || []).length > 0;
    const _hasBgp  = !!ir.bgp;
    const _features = [];
    if (ir.vlans && ir.vlans.length) _features.push('feature vlan');
    if (_hasSVI) _features.push('feature interface-vlan');
    if (_hasPortSec) _features.push('feature port-security');
    if (_hasBfd) _features.push('feature bfd');
    if (_hasLacp) _features.push('feature lacp');
    if (_hasOspf) _features.push('feature ospf');
    if (_hasBgp) _features.push('feature bgp');
    if (ir.system && ir.system.lldp) _features.push('feature lldp');
    if (_features.length) c += _features.join('\n') + '\n!\n';

    if (ir.spanningTree && ir.spanningTree.mode) {
        const m = ir.spanningTree.mode;
        const nxosMode = m === 'rstp' ? 'rapid-pvst' : m === 'mstp' ? 'mst' : m === 'pvst' ? 'pvst' : m;
        c += 'spanning-tree mode ' + nxosMode + '\n!\n';
    }

    // Kullanıcı hesapları — kaynak platformun parola hash'i hedefte geçerli
    // olmadığından (farklı KDF/format) sadece rol ataması emit edilir, parola
    // manuel ayarlanmalı (ccDropField ile 'manual' olarak işaretlenir).
    (ir.system && ir.system.users || []).forEach(u => {
        const role = (u.privilege === 15 || u.privilege === '15') ? 'network-admin' : 'network-operator';
        ccDropField(ir, 'system', u.name, 'password', '',
            'password-hash-not-portable-manual-reset-required', 'cisco-nxos', 'manual');
        c += 'username ' + u.name + ' role ' + role + '\n';
    });
    if (ir.system && ir.system.ssh) {
        if (ir.system.ssh.algorithms && ir.system.ssh.algorithms.length) {
            ccDropField(ir, 'system', 'ssh', 'algorithms', ir.system.ssh.algorithms.join('; '),
                'ssh-algorithm-names-not-portable-verify-manually', 'cisco-nxos', 'partial');
        }
        if (ir.system.ssh.connectionLimit) {
            ccDropField(ir, 'system', 'ssh', 'connection-limit', String(ir.system.ssh.connectionLimit),
                'nxos-ssh-connection-limit-syntax-differs-configure-manually', 'cisco-nxos', 'manual');
        }
    }
    if (ir.system && ir.system.logging && ir.system.logging.files && ir.system.logging.files.length) {
        ccDropField(ir, 'system', 'logging', 'files', ir.system.logging.files.join(', '),
            'junos-syslog-file-targets-no-direct-nxos-equivalent-configure-manually', 'cisco-nxos', 'partial');
    }
    if (ir.system && ir.system.timeZoneName) {
        ccDropField(ir, 'system', 'clock', 'timezone', ir.system.timeZoneName,
            'iana-timezone-name-needs-numeric-utc-offset-configure-manually', 'cisco-nxos', 'manual');
    }
    if (ir.system && ir.system.loginSecurity) {
        ccDropField(ir, 'system', 'login-security', 'retry-options', JSON.stringify(ir.system.loginSecurity),
            'brute-force-protection-syntax-differs-configure-manually', 'cisco-nxos', 'manual');
    }
    if (ir.system && ir.system.loginClassCount) {
        ccDropField(ir, 'system', 'login-class', 'custom-permissions', String(ir.system.loginClassCount) + ' sınıf',
            'junos-login-class-model-differs-from-nxos-roles-review-manually', 'cisco-nxos', 'manual');
    }
    if (ir.system && ir.system.snmpLocation) c += 'snmp-server location "' + ir.system.snmpLocation + '"\n';
    if (ir.system && ir.system.snmpContact) c += 'snmp-server contact "' + ir.system.snmpContact + '"\n';

    if (ir.system && ir.system.jumbo_mtu) {
        c += 'system jumbomtu ' + ir.system.jumbo_mtu + '\n!\n';
    }
    ir.vlans.forEach(v => {
        c += 'vlan ' + v.id + '\n';
        c += ' name ' + (v.name || 'VLAN' + v.id) + '\n';
        c += '!\n';
        if (v.svi_ip) {
            c += 'interface Vlan' + v.id + '\n';
            c += ' ip address ' + v.svi_ip + '/' + ccMaskToPrefix(v.svi_mask) + '\n';
            (ir.vrrp || []).filter(x => x.vlan_id === v.id).forEach(vr => {
                c += ' hsrp ' + vr.group_id + '\n';
                c += '  ip ' + vr.virtual_ip + '\n';
                if (vr.priority && vr.priority !== 100) c += '  priority ' + vr.priority + '\n';
                if (vr.preempt) c += '  preempt\n';
            });
            if (v._aclIn)  c += ' ip access-group ' + v._aclIn  + ' in\n';
            if (v._aclOut) c += ' ip access-group ' + v._aclOut + ' out\n';
            if (v.pbr_route_map) c += ' ip policy route-map ' + v.pbr_route_map + '\n';
            c += ' no shutdown\n!\n';
        }
    });
    const _bundleMembersNX = new Set();
    (ir.bundles || []).forEach(b => (b.members || []).forEach(m => _bundleMembersNX.add(m)));
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_bundleMembersNX.has(f.name)) return;
        const ifName = ccNormalizeIfaceFromJuniper(f.name, 'cisco');
        // _subif helper ile structured subif info (S21 refactor — QinQ destekli)
        const _nxSub = ccGetWriterSubif(f);
        const _isSubif = !!_nxSub;
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        if (f.no_switchport) c += ' no switchport\n';
        // NX-OS L3 subif: encapsulation dot1Q (Cisco IOS-paralel) — QinQ destekli
        if (_nxSub) {
            const _enc = _nxSub.encapsulation;
            if (_enc.type === 'qinq' && _enc.qinq_inner) {
                c += ' encapsulation dot1Q ' + _enc.vlan + ' second-dot1q ' + _enc.qinq_inner + '\n';
            } else {
                c += ' encapsulation dot1Q ' + _enc.vlan + (_enc.native ? ' native' : '') + '\n';
            }
        }
        if (f.ip) c += ' ip address ' + f.ip + '/' + ccMaskToPrefix(f.mask) + '\n';
        if (f.mtu) c += ' mtu ' + f.mtu + '\n';
        if (f.speed) c += ' speed ' + f.speed + '\n';
        if (f.flowControl) { c += ' flowcontrol receive on\n'; c += ' flowcontrol send on\n'; }
        if (!_isSubif && f.vlan_mode === 'access') {
            c += ' switchport mode access\n';
            if (f.access_vlan) c += ' switchport access vlan ' + f.access_vlan + '\n';
        }
        if (!_isSubif && f.voice_vlan) c += ' switchport voice vlan ' + f.voice_vlan + '\n';
        if (!_isSubif && f.vlan_mode === 'trunk') {
            c += ' switchport mode trunk\n';
            if (f.native_vlan) c += ' switchport trunk native vlan ' + f.native_vlan + '\n';
            const _tv = Array.isArray(f.trunk_vlans) ? f.trunk_vlans.join(',') : (f.trunk_vlans ? String(f.trunk_vlans).replace(/\s+/g, ',') : '');
            if (_tv) c += ' switchport trunk allowed vlan ' + _tv + '\n';
        }
        if (f._aclIn)  c += ' ip access-group ' + f._aclIn  + ' in\n';
        if (f._aclOut) c += ' ip access-group ' + f._aclOut + ' out\n';
        if (f.pbr_route_map) c += ' ip policy route-map ' + f.pbr_route_map + '\n';
        if (f.edge_port) c += ' spanning-tree port type edge\n';
        if (f.bpdu_guard) c += ' spanning-tree bpduguard enable\n';
        if (f.port_security && f.port_security.enabled) {
            c += ' switchport port-security\n';
            if (f.port_security.max) c += ' switchport port-security maximum ' + f.port_security.max + '\n';
            if (f.port_security.violation) c += ' switchport port-security violation ' + f.port_security.violation + '\n';
            if (f.port_security.sticky) c += ' switchport port-security mac-address sticky\n';
        }
        if (f.dhcp_snoop_trust) c += ' ip dhcp snooping trust\n';
        if (f.bfd) {
            const iv = f.bfd.interval || (f.bfd.enabled ? 300 : 0);
            if (iv) c += ' bfd interval ' + iv + ' min_rx ' + (f.bfd.min_rx || iv) + ' multiplier ' + (f.bfd.multiplier || 3) + '\n';
        }
        if (f.service_policy) {
            // NX-OS: service-policy type qos
            if (f.service_policy.input)  c += ' service-policy type qos input '  + f.service_policy.input  + '\n';
            if (f.service_policy.output) c += ' service-policy type qos output ' + f.service_policy.output + '\n';
        }
        if (f._bundleId) c += ' channel-group ' + f._bundleId +
            (f._bundleMode === 'lacp-active'  ? ' mode active'  :
             f._bundleMode === 'lacp-passive' ? ' mode passive' :
                                                ' mode on') + '\n';
        if (f.shutdown) c += ' shutdown\n';
        else c += ' no shutdown\n';
        c += '!\n';
    });
    // Bundles → port-channel
    (ir.bundles || []).forEach(b => {
        c += 'interface port-channel' + b.id + '\n';
        if (b.desc) c += ' description ' + b.desc + '\n';
        if (b.ip) c += ' ip address ' + b.ip + '/' + ccMaskToPrefix(b.mask || '255.255.255.0') + '\n';
        if (b.vlan_mode === 'access') {
            c += ' switchport mode access\n';
            if (b.access_vlan) c += ' switchport access vlan ' + b.access_vlan + '\n';
        }
        if (b.vlan_mode === 'trunk') {
            c += ' switchport mode trunk\n';
            const _tv = Array.isArray(b.trunk_vlans) ? b.trunk_vlans.join(',') : (b.trunk_vlans ? String(b.trunk_vlans).replace(/\s+/g, ',') : '');
            if (_tv) c += ' switchport trunk allowed vlan ' + _tv + '\n';
        }
        if (b.edge_port) c += ' spanning-tree port type edge\n';
        c += '!\n';
        // Üye fiziksel arayüzlere channel-group ataması — bu olmadan port-channel
        // boş kalır ve LACP hiç oluşmaz (önceden bu blok hiç yoktu).
        if (b.members && b.members.length) {
            const nxMode = b.mode === 'lacp-active' ? 'active' : b.mode === 'lacp-passive' ? 'passive' : 'on';
            b.members.forEach(m => {
                const cn = ccNormalizeIfaceFromJuniper(m, 'cisco');
                const mIfc = ir.interfaces.find(f => f.name === m);
                c += 'interface ' + cn + '\n';
                if (mIfc && mIfc.desc) c += ' description ' + mIfc.desc + '\n';
                if (mIfc && mIfc.speed) c += ' speed ' + mIfc.speed + '\n';
                if (mIfc && mIfc.flowControl) { c += ' flowcontrol receive on\n'; c += ' flowcontrol send on\n'; }
                c += ' channel-group ' + b.id + ' mode ' + nxMode + '\n';
                if (mIfc && mIfc.shutdown) c += ' shutdown\n'; else c += ' no shutdown\n';
                c += '!\n';
            });
        }
    });
    ir.routes.forEach(r => { if (r.network && r.mask && r.nexthop) c += 'ip route ' + r.network + '/' + ccMaskToPrefix(r.mask) + ' ' + r.nexthop + '\n'; });
    if (ir.routes.length) c += '!\n';
    ir.acls.forEach(acl => {
        c += 'ip access-list ' + acl.name + '\n';
        const expanded = (typeof ccExpandAclPrefixListRefs === 'function') ? ccExpandAclPrefixListRefs(ir, acl) : acl.entries;
        // Port eşleşmesi olan girişler Cisco'da sadece tcp/udp altında geçerli
        // ("permit ip ... eq N" syntax hatası verir). Kaynak (Junos) proto
        // belirtmeden sadece port eşleştiriyorsa (protokolden bağımsız match),
        // güvenli/eksiksiz karşılık için hem tcp hem udp varyantı üretilir —
        // portu sessizce yok sayıp aşırı izin verici "permit ip ... any"
        // üretmek yerine.
        const _portExpanded = [];
        const _warnedTerms = new Set();
        expanded.forEach(e => {
            const hasPort = e.src_port || e.dst_port;
            if (hasPort && (!e.proto || e.proto === 'ip')) {
                // Prefix-list genişletmesi aynı terimden N adet CIDR satırı üretmiş
                // olabilir — bulgu, satır başına değil TERİM başına bir kez raporlanır
                // (aksi halde "31 kısmi" gibi yapay/gürültülü bir sayıya şişer).
                const termKey = acl.name + '|' + (e._term || '');
                if (!_warnedTerms.has(termKey)) {
                    _warnedTerms.add(termKey);
                    ccDropField(ir, 'acl', acl.name, e._term || '', (e.src_port || '') + ' ' + (e.dst_port || ''),
                        'protocol-agnostic-port-match-expanded-to-tcp-and-udp-verify-manually', 'cisco-nxos', 'partial');
                }
                _portExpanded.push(Object.assign({}, e, { proto: 'tcp' }));
                _portExpanded.push(Object.assign({}, e, { proto: 'udp' }));
            } else {
                _portExpanded.push(e);
            }
        });
        _portExpanded.forEach((e, j) => {
            let line = ' ' + ((j + 1) * 10) + ' ' + e.action + ' ' + e.proto + ' ' + e.src +
                (e.src_port ? ' ' + e.src_port : '') +
                (e.dst !== 'any' ? ' ' + e.dst : ' any') +
                (e.dst_port ? ' ' + e.dst_port : '');
            c += line + '\n';
        });
        c += '!\n';
    });

    // SNMP view tanımları — bağımsız olarak geçerli bir NX-OS komutu
    (ir.system && ir.system.snmpViews || []).forEach(v => {
        c += 'snmp-server view ' + v.name + ' ' + v.subtree + ' ' + v.type + '\n';
    });
    // SNMPv3 VACM grup/erişim eşlemeleri — NX-OS yalnızca yerleşik rolleri
    // (network-admin/network-operator) destekler, Junos'taki gibi keyfi grup +
    // view ataması yapılamaz; bu yüzden komut üretmek yerine açıkça raporlanır.
    // Aynı grup için birden fazla security-level/model satırı olabilir — asıl
    // aksiyon "bu grup manuel yeniden tasarlanmalı" olduğundan grup başına tek
    // bulgu yeterli (her satırı ayrı raporlamak yapay şekilde skoru şişirir).
    const _vacmGroupsSeen = new Set();
    (ir.system && ir.system.snmpVacmAccess || []).forEach(a => {
        if (_vacmGroupsSeen.has(a.group)) return;
        _vacmGroupsSeen.add(a.group);
        ccDropField(ir, 'system', 'snmp', 'vacm-group-' + a.group, a.readView || a._raw || '',
            'nxos-snmpv3-only-supports-builtin-roles-no-custom-group-view-model-manual-redesign-required', 'cisco-nxos', 'unsupported');
    });
    if (ir.system && ir.system.igmpSnooping) {
        ccDropField(ir, 'system', 'igmp-snooping', 'per-vlan-enable', '',
            'nxos-igmp-snooping-enabled-by-default-no-action-needed', 'cisco-nxos', 'unsupported');
    }

    c += ccWriteUnknowns(ir.unknowns);
    return c;
}
CC_WRITERS['cisco-nxos'] = ccWriteCiscoNXOS;
