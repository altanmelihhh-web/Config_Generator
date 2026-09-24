'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Juniper JunOS Writer ──────────────────────────────────────────────────────
function ccWriteJuniper(ir) {
    let c = '# ======================================\n# Juniper JunOS — Converted Configuration\n# ======================================\n\nconfigure\n\n';
    if (ir.hostname) c += 'set system host-name ' + ir.hostname + '\n\n';
    if (ir.spanningTree && ir.spanningTree.mode) {
        const proto = ir.spanningTree.mode === 'mstp' ? 'mstp' : 'rstp';
        c += 'set protocols ' + proto + ' interface all\n\n';
    }

    // VLAN definitions
    ir.vlans.forEach(v => {
        const vName = v.name || 'VLAN' + v.id;
        c += 'set vlans ' + vName + ' vlan-id ' + v.id + '\n';
        if (v.svi_ip) {
            const prefix = ccMaskToPrefix(v.svi_mask);
            c += 'set interfaces irb unit ' + v.id + ' family inet address ' + v.svi_ip + '/' + prefix + '\n';
            c += 'set vlans ' + vName + ' l3-interface irb.' + v.id + '\n';
            (ir.vrrp || []).filter(x => x.vlan_id === v.id).forEach(vr => {
                const base = 'set protocols vrrp interface irb.' + v.id + ' group ' + vr.group_id;
                c += base + ' virtual-address ' + vr.virtual_ip + '\n';
                if (vr.priority && vr.priority !== 100) c += base + ' priority ' + vr.priority + '\n';
                if (vr.preempt) c += base + ' preempt\n';
            });
            if (v.pbr_route_map) c += 'set interfaces irb unit ' + v.id + ' family inet filter input ' + v.pbr_route_map + '\n';
        }
    });
    if (ir.vlans.length) c += '\n';

    // Helper: convert canonical trunk_vlans (number[]) or string formats to Juniper VLAN name list
    // Accepts: number[] (canonical), "10,20", "10 20", "[ USERS SERVERS ]", "USERS SERVERS", "all"
    function expandTrunkVlans(raw, vlans) {
        if (raw === undefined || raw === null) return [];
        if (Array.isArray(raw)) {
            return raw.map(id => {
                const v = vlans.find(vv => vv.id === id);
                return v && v.name ? v.name : 'VLAN' + id;
            });
        }
        const str = String(raw).trim();
        if (!str || str === 'all') return vlans.map(v => v.name || 'VLAN' + v.id);
        const cleaned = str.replace(/[\[\]]/g, '').trim();
        const ids = ccParseTrunkVlanStr(cleaned);
        if (ids.length) {
            return ids.map(id => {
                const v = vlans.find(vv => vv.id === id);
                return v && v.name ? v.name : 'VLAN' + id;
            });
        }
        // Token'lar isim olabilir (JunOS'tan geliyor: "USERS SERVERS")
        return cleaned.split(/[\s,]+/).filter(Boolean);
    }

    // Interfaces
    const _jBundleMembers = new Set();
    (ir.bundles || []).forEach(b => (b.members || []).forEach(m => _jBundleMembers.add(m)));
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_jBundleMembers.has(f.name)) return;
        const jName = ccNormalizeIfaceForJuniper(f.name);
        // _subif helper ile structured subif info (S21 — QinQ destekli)
        const _jSub = ccGetWriterSubif(f);
        const _isSubif = !!_jSub;
        const _phys = _isSubif ? _jSub.parent : jName;
        const _unit = _isSubif ? String(_jSub.unit) : '0';
        // Subif: parent'a vlan-tagging + unit'a vlan-id veya QinQ vlan-tags
        if (_jSub) {
            const _enc = _jSub.encapsulation;
            if (_enc.type === 'qinq' && _enc.qinq_inner) {
                c += 'set interfaces ' + _phys + ' flexible-vlan-tagging\n';
                c += 'set interfaces ' + _phys + ' encapsulation flexible-ethernet-services\n';
                c += 'set interfaces ' + _phys + ' unit ' + _unit +
                     ' vlan-tags outer ' + _enc.vlan + ' inner ' + _enc.qinq_inner + '\n';
            } else {
                c += 'set interfaces ' + _phys + ' vlan-tagging\n';
                c += 'set interfaces ' + _phys + ' unit ' + _unit + ' vlan-id ' + _enc.vlan + '\n';
            }
            if (_enc.native) {
                c += 'set interfaces ' + _phys + ' native-vlan-id ' + _enc.vlan + '\n';
            }
        }
        // L3 interface (parent + unit ile)
        if (f.ip && !f.vlan_mode) {
            const prefix = f.mask ? ccMaskToPrefix(f.mask) : 24;
            c += 'set interfaces ' + _phys + ' unit ' + _unit + ' family inet address ' + f.ip + '/' + prefix + '\n';
        }
        // L2 access — subif değilse
        if (!_isSubif && f.vlan_mode === 'access' && f.access_vlan) {
            const vn = (ir.vlans.find(v => v.id === f.access_vlan) || {}).name || 'VLAN' + f.access_vlan;
            c += 'set interfaces ' + _phys + ' unit 0 family ethernet-switching interface-mode access\n';
            c += 'set interfaces ' + _phys + ' unit 0 family ethernet-switching vlan members ' + vn + '\n';
        }
        // L2 trunk — subif değilse
        if (!_isSubif && f.vlan_mode === 'trunk') {
            c += 'set interfaces ' + _phys + ' unit 0 family ethernet-switching interface-mode trunk\n';
            const members = expandTrunkVlans(f.trunk_vlans, ir.vlans);
            if (members.length) {
                c += 'set interfaces ' + _phys + ' unit 0 family ethernet-switching vlan members [ ' + members.join(' ') + ' ]\n';
            }
        }
        // Description: subif → unit'a; non-subif → phys'e
        if (f.desc) {
            if (_isSubif) c += 'set interfaces ' + _phys + ' unit ' + _unit + ' description "' + f.desc + '"\n';
            else          c += 'set interfaces ' + _phys + ' description "' + f.desc + '"\n';
        }
        if (f.mtu) c += 'set interfaces ' + _phys + ' mtu ' + f.mtu + '\n';
        if (f.bfd && (f.bfd.interval || f.bfd.min_rx || f.bfd.enabled)) {
            const ival = f.bfd.min_rx || f.bfd.interval || 1000;
            const bfdIf = _isSubif ? _phys + '.' + _unit : _phys;
            c += 'set protocols bfd interface ' + bfdIf + ' minimum-interval ' + ival + '\n';
            if (f.bfd.multiplier) c += 'set protocols bfd interface ' + bfdIf + ' multiplier ' + f.bfd.multiplier + '\n';
        }
        // Native VLAN L2 trunk (subif olmayan) için
        if (!_isSubif && f.native_vlan && f.vlan_mode === 'trunk') {
            c += 'set interfaces ' + _phys + ' unit 0 family ethernet-switching native-vlan-id ' + f.native_vlan + '\n';
        }
        if (!_isSubif && f.voice_vlan) {
            const vn = (ir.vlans.find(v => v.id === f.voice_vlan) || {}).name || 'VLAN' + f.voice_vlan;
            c += 'set ethernet-switching-options voip interface ' + _phys + ' vlan ' + vn + '\n';
        }
        if (!_isSubif && f.port_security && f.port_security.max) {
            c += 'set ethernet-switching-options secure-access-port interface ' + _phys + ' mac-limit ' + f.port_security.max + '\n';
        }
        if (!_isSubif && f.dhcp_snoop_trust) {
            c += 'set forwarding-options dhcp-security group TRUSTED interface ' + _phys + '\n';
        }
        if (f.pbr_route_map) {
            c += '# PARTIAL CONVERSION - MANUAL REVIEW REQUIRED: Junos PBR may require filter-based forwarding/routing-instance semantics\n';
            c += 'set interfaces ' + _phys + ' unit ' + _unit + ' family inet filter input ' + f.pbr_route_map + '\n';
        }
        if (f.service_policy && f.service_policy.output) {
            c += '# PARTIAL CONVERSION - MANUAL REVIEW REQUIRED: QoS policy ' + f.service_policy.output + ' mapped as Junos scheduler-map; verify classifiers/rewrite rules\n';
            c += 'set class-of-service interfaces ' + _phys + ' scheduler-map ' + f.service_policy.output + '\n';
        }
        if (f.service_policy && f.service_policy.input) {
            c += '# PARTIAL CONVERSION - MANUAL REVIEW REQUIRED: Junos inbound QoS policy ' + f.service_policy.input + ' needs platform-specific classifier/firewall filter mapping\n';
        }
    });
    if (ir.interfaces.length) c += '\n';

    // Bundles → aeN with LACP + member 802.3ad binding
    (ir.bundles || []).forEach(b => {
        const aeName = 'ae' + b.id;
        if (b.mode === 'lacp-active') c += 'set interfaces ' + aeName + ' aggregated-ether-options lacp active\n';
        else if (b.mode === 'lacp-passive') c += 'set interfaces ' + aeName + ' aggregated-ether-options lacp passive\n';
        if (b.ip) {
            const prefix = b.mask ? ccMaskToPrefix(b.mask) : 24;
            c += 'set interfaces ' + aeName + ' unit 0 family inet address ' + b.ip + '/' + prefix + '\n';
        }
        if (b.vlan_mode === 'access' && b.access_vlan) {
            const vn = (ir.vlans.find(v => v.id === b.access_vlan) || {}).name || 'VLAN' + b.access_vlan;
            c += 'set interfaces ' + aeName + ' unit 0 family ethernet-switching interface-mode access\n';
            c += 'set interfaces ' + aeName + ' unit 0 family ethernet-switching vlan members ' + vn + '\n';
        }
        if (b.vlan_mode === 'trunk') {
            c += 'set interfaces ' + aeName + ' unit 0 family ethernet-switching interface-mode trunk\n';
            const members = expandTrunkVlans(b.trunk_vlans, ir.vlans);
            if (members.length) c += 'set interfaces ' + aeName + ' unit 0 family ethernet-switching vlan members [ ' + members.join(' ') + ' ]\n';
        }
        if (b.desc) c += 'set interfaces ' + aeName + ' description "' + b.desc + '"\n';
        if (b.mtu) c += 'set interfaces ' + aeName + ' mtu ' + b.mtu + '\n';
        if (b.native_vlan && b.vlan_mode === 'trunk') {
            c += 'set interfaces ' + aeName + ' unit 0 family ethernet-switching native-vlan-id ' + b.native_vlan + '\n';
        }
        (b.members || []).forEach(m => {
            const jm = ccNormalizeIfaceForJuniper(m);
            c += 'set interfaces ' + jm + ' ether-options 802.3ad ' + aeName + '\n';
        });
    });
    if (ir.bundles && ir.bundles.length) c += '\n';

    // STP edge ports
    const _edgeIfs = ir.interfaces.filter(f => f.edge_port);
    _edgeIfs.forEach(f => {
        c += 'set protocols rstp interface ' + ccNormalizeIfaceForJuniper(f.name) + ' edge\n';
    });
    if (_edgeIfs.length) c += '\n';

    // STP BPDU guard: JunOS modelinde global bpdu-block-on-edge ile
    // çalışır (edge port'lara gelen BPDU'ları engeller). Herhangi bir
    // interface'te bpdu_guard varsa global ayarı emit et.
    if (ir.interfaces.some(f => f.bpdu_guard)) {
        c += 'set protocols rstp bpdu-block-on-edge\n\n';
    }

    // Routes
    ir.routes.forEach(r => {
        const prefix = ccMaskToPrefix(r.mask);
        c += 'set routing-options static route ' + r.network + '/' + prefix + ' next-hop ' + r.nexthop + '\n';
    });
    if (ir.routes.length) c += '\n';

    // PBR → firewall filter (basit: source-address match + accept routing-instance)
    (ir.routeMaps || []).forEach(rm => {
        const base = 'set firewall family inet filter ' + rm.name;
        if (rm.match_acl) {
            // Cisco ACL match-name → kullanılan ACL'i bul; source-address bilgisi varsa onu kullan
            const acl = (ir.acls || []).find(a => a.name === rm.match_acl);
            if (acl && acl.entries.length) {
                if (acl.entries.length > 1 || acl.entries.some(e => e.proto !== 'ip' || e.dst !== 'any' || e.src_port || e.dst_port)) {
                    c += '# Unsupported/verify: PBR match ACL ' + rm.match_acl + ' is lossy on Junos; only source-address from the first entry is emitted below\n';
                }
                const e = acl.entries[0];
                const srcCidr = ccAclAddrToCidr(e.src);
                if (srcCidr) c += base + ' term 10 from source-address ' + srcCidr + '\n';
            }
        }
        if (rm.set_next_hop) {
            c += '# Unsupported/verify: Junos PBR next-hop may require filter-based forwarding with routing-instance on some platforms\n';
            c += base + ' term 10 then next-hop ' + rm.set_next_hop + '\n';
        }
        c += base + ' term 20 then accept\n';
    });
    if (ir.routeMaps && ir.routeMaps.length) c += '\n';

    // QoS → class-of-service
    if (ir.qos && ir.qos.policyMaps && ir.qos.policyMaps.length) {
        c += '# PARTIAL CONVERSION - MANUAL REVIEW REQUIRED: QoS semantics are approximate; verify DSCP classifiers, priority/bandwidth queues, and interface attachment\n';
        ir.qos.policyMaps.forEach(pm => {
            pm.classes.forEach((cl, idx) => {
                if (cl.priority_pct) {
                    c += 'set class-of-service schedulers ' + cl.name + '-SCHED transmit-rate percent ' + cl.priority_pct + '\n';
                    c += 'set class-of-service scheduler-maps ' + pm.name + ' forwarding-class ' + cl.name.toLowerCase() + ' scheduler ' + cl.name + '-SCHED\n';
                } else {
                    c += '# PARTIAL CONVERSION - MANUAL REVIEW REQUIRED: QoS class ' + cl.name + ' in policy ' + pm.name + ' has no direct Junos scheduler emitted\n';
                }
            });
        });
        c += '\n';
    }

    // SPAN → analyzer
    (ir.monitorSessions || []).forEach(sess => {
        const aname = sess.name || ('SPAN' + sess.id);
        sess.sources.forEach(src => {
            const sName = ccNormalizeIfaceForJuniper(src.name);
            c += 'set ethernet-switching-options analyzer ' + aname + ' input ingress interface ' + sName + '.0\n';
        });
        if (sess.destination) {
            const dName = ccNormalizeIfaceForJuniper(sess.destination);
            c += 'set ethernet-switching-options analyzer ' + aname + ' output interface ' + dName + '.0\n';
        }
    });
    if (ir.monitorSessions && ir.monitorSessions.length) c += '\n';

    // RPM (IP SLA)
    (ir.ipSla || []).forEach(sla => {
        const sName = sla.name || ('SLA_' + sla.id);
        const probeType = sla.type === 'icmp-echo' ? 'ICMP' : (sla.type || 'ICMP').toUpperCase();
        if (sla.target) c += 'set services rpm probe ' + sName + ' test ' + probeType + ' target address ' + sla.target + '\n';
        if (sla.source_address) {
            c += 'set services rpm probe ' + sName + ' test ' + probeType + ' source-address ' + sla.source_address + '\n';
        } else if (sla.source_iface) {
            const normSrc = ccNormalizeIfaceForJuniper(sla.source_iface);
            const srcIface = (ir.interfaces || []).find(f => f.name === sla.source_iface || ccNormalizeIfaceForJuniper(f.name) === normSrc);
            if (srcIface && srcIface.ip) c += 'set services rpm probe ' + sName + ' test ' + probeType + ' source-address ' + srcIface.ip + '\n';
            else c += '# Unsupported/verify: RPM source-interface ' + normSrc + ' usually needs a source-address on Junos\n';
        }
        c += 'set services rpm probe ' + sName + ' test ' + probeType + ' probe-count 3\n';
        if (sla.frequency) c += 'set services rpm probe ' + sName + ' test ' + probeType + ' probe-interval ' + sla.frequency + '\n';
    });
    if (ir.ipSla && ir.ipSla.length) c += '\n';

    // event-options policy (event applet equivalent)
    (ir.eventApplets || []).forEach(app => {
        c += '# MANUAL IMPLEMENTATION REQUIRED: Cisco EEM/event automation was mapped to Junos event-options only as a starting point\n';
        const base = 'set event-options policy ' + app.name;
        if (app.trigger) {
            // Cisco track-X-down → SNMP_TRAP_LINK_DOWN benzeri (en yakın eşdeğer)
            const evt = app.trigger.startsWith('track-') ? 'SNMP_TRAP_LINK_DOWN' : app.trigger;
            c += base + ' events ' + evt + '\n';
        }
        if (app.action && app.action.startsWith('syslog: ')) {
            c += base + ' then execute-commands commands "request system syslog message ' + app.action.slice(8) + '"\n';
        } else if (app.action && app.action.startsWith('cmd: ')) {
            c += base + ' then execute-commands commands "' + app.action.slice(5) + '"\n';
        } else if (app.action && app.action.startsWith('script: ')) {
            c += base + ' then event-script ' + app.action.slice(8) + '\n';
        }
    });
    if (ir.eventApplets && ir.eventApplets.length) c += '\n';

    c += ccWriteSystemJuniper(ir);
    c += ccWriteOspfJuniper(ir);
    c += ccWriteBgpJuniper(ir);

    // ACLs / firewall filters
    ir.acls.forEach(acl => {
        const _expandedEntries = (typeof ccExpandAclPrefixListRefs === 'function') ? ccExpandAclPrefixListRefs(ir, acl) : acl.entries;
        _expandedEntries.forEach((e, j) => {
            const termName = 'term-' + (j + 1);
            const base = 'set firewall family inet filter ' + acl.name + ' term ' + termName;
            if (e.proto && e.proto !== 'ip') c += base + ' from protocol ' + e.proto + '\n';
            const srcCidr = ccAclAddrToCidr(e.src);
            if (srcCidr) c += base + ' from source-address ' + srcCidr + '\n';
            const dstCidr = ccAclAddrToCidr(e.dst);
            if (dstCidr) c += base + ' from destination-address ' + dstCidr + '\n';
            if (e.dst_port) {
                const port = e.dst_port.replace(/^eq\s+/, '');
                c += base + ' from destination-port ' + port + '\n';
            }
            if (e.src_port) {
                const port = e.src_port.replace(/^eq\s+/, '');
                c += base + ' from source-port ' + port + '\n';
            }
            c += base + ' then ' + (e.action === 'permit' ? 'accept' : 'discard') + '\n';
        });
        // Interface bindings
        ir.interfaces.forEach(f => {
            if (f._aclIn === acl.name)
                c += 'set interfaces ' + ccNormalizeIfaceForJuniper(f.name) + ' unit 0 family inet filter input ' + acl.name + '\n';
            if (f._aclOut === acl.name)
                c += 'set interfaces ' + ccNormalizeIfaceForJuniper(f.name) + ' unit 0 family inet filter output ' + acl.name + '\n';
        });
    });

    c += '\ncommit\n\n';
    if (ir.unknowns && ir.unknowns.length) {
        c += '# ---- Çevrilemeyen satırlar (' + ir.unknowns.length + ') ----\n';
        ir.unknowns.forEach(u => c += '# ' + u + '\n');
    }
    return c;
}
CC_WRITERS['juniper'] = ccWriteJuniper;
CC_WRITERS['juniper-junos'] = ccWriteJuniper;

// ── Juniper SRX Writer ────────────────────────────────────────────────────────
function ccWriteJuniperSRX(ir) {
    let c = '# ======================================\n# Juniper SRX — Converted Configuration\n# ======================================\n\nconfigure\n\n';
    if (ir.hostname) c += 'set system host-name ' + ir.hostname + '\n\n';
    (ir.interfaces || []).forEach(f => {
        const jNameRaw = ccNormalizeIfaceForJuniper(f.name);
        const subifM = String(jNameRaw).match(/^(.+)\.(\d+)$/);
        const isSubif = !!subifM;
        const phys = isSubif ? subifM[1] : jNameRaw;
        const unit = isSubif ? subifM[2] : '0';
        if (f.desc) c += 'set interfaces ' + phys + ' description "' + f.desc + '"\n';
        if (f.mtu) c += 'set interfaces ' + phys + ' mtu ' + f.mtu + '\n';
        if (isSubif) {
            c += 'set interfaces ' + phys + ' vlan-tagging\n';
            c += 'set interfaces ' + phys + ' unit ' + unit + ' vlan-id ' + unit + '\n';
        }
        if (f.ip) {
            c += 'set interfaces ' + phys + ' unit ' + unit + ' family inet address ' +
                 f.ip + '/' + ccMaskToPrefix(f.mask || '255.255.255.0') + '\n';
        }
        if (f.shutdown) c += 'set interfaces ' + phys + ' disable\n';
        if (f.nameif) {
            // Cisco/USG zone hint → SRX security zone binding
            const zoneName = ccNormalizeZone(f.nameif);
            c += 'set security zones security-zone ' + zoneName + ' interfaces ' + phys + '.' + unit + '\n';
        }
        // Unsupported / N/A
        if (f.voice_vlan)     ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'srx-no-voice-vlan',     'juniper-srx');
        if (f.port_security && f.port_security.enabled)
                              ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'srx-no-port-security',  'juniper-srx');
        if (f.edge_port)      ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'srx-no-stp-on-iface',   'juniper-srx');
        if (f.bpdu_guard)     ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'srx-no-stp-on-iface',   'juniper-srx');
        if (f.service_policy) ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'srx-class-of-service-different','juniper-srx');
    });
    if (ir.interfaces && ir.interfaces.length) c += '\n';
    (ir.routes || []).forEach(r => {
        c += 'set routing-options static route ' + r.network + '/' + ccMaskToPrefix(r.mask || '0.0.0.0') + ' next-hop ' + r.nexthop + '\n';
    });
    if (ir.routes && ir.routes.length) c += '\n';
    (ir.zones || []).forEach(z => {
        const normName = ccNormalizeZone(z.name);
        (z.interfaces || []).forEach(ifc => { c += 'set security zones security-zone ' + normName + ' interfaces ' + ifc + '\n'; });
    });
    if (ir.zones && ir.zones.length) c += '\n';
    (ir.addressObjects || []).forEach(a => {
        if (a.type === 'host') c += 'set security address-book global address ' + a.name + ' ' + a.value + '/32\n';
        else if (a.type === 'network') c += 'set security address-book global address ' + a.name + ' ' + a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.0') + '\n';
    });
    if (ir.addressObjects && ir.addressObjects.length) c += '\n';
    function srxObjRef(val) {
        if (!val || val === 'any') return 'any';
        const objs = ir.addressObjects || [];
        if (objs.find(a => a.name === val)) return val;
        const byVal = objs.find(a =>
            a.value === val ||
            (a.type === 'host'    && (a.value + '/32') === val) ||
            (a.type === 'network' && (a.value + '/' + ccMaskToPrefix(a.mask || '255.255.255.0')) === val)
        );
        return byVal ? byVal.name : val;
    }
    (ir.securityPolicies || []).forEach(pol => {
        const fromZ = ccNormalizeZone(pol.srcZone || 'TRUST');
        const toZ = ccNormalizeZone(pol.dstZone || 'UNTRUST');
        const base = 'set security policies from-zone ' + fromZ + ' to-zone ' + toZ + ' policy ' + pol.name;
        (pol.srcAddr || ['any']).forEach(s => { c += base + ' match source-address ' + srxObjRef(s) + '\n'; });
        (pol.dstAddr || ['any']).forEach(d => { c += base + ' match destination-address ' + srxObjRef(d) + '\n'; });
        (pol.service || ['any']).forEach(s => { c += base + ' match application ' + s + '\n'; });
        c += base + ' then ' + (pol.action === 'allow' ? 'permit' : 'deny') + '\n';
    });
    c += '\ncommit\n';
    c += ccWriteUnknownsFor('juniper-srx', ir.unknowns);
    return c;
}
CC_WRITERS['juniper-srx'] = ccWriteJuniperSRX;
