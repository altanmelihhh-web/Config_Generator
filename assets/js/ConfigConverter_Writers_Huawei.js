'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Huawei VRP Writer ─────────────────────────────────────────────────────────
function ccWriteHuawei(ir) {
    let c = '# ======================================\n# Huawei VRP — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'sysname ' + ir.hostname + '\n#\n';
    if (ir.spanningTree && ir.spanningTree.mode) {
        c += 'stp mode ' + (ir.spanningTree.mode === 'pvst' ? 'rstp' : ir.spanningTree.mode) + '\n#\n';
    }
    if (ir.system && ir.system.jumbo_mtu) {
        c += 'jumboframe enable ' + ir.system.jumbo_mtu + '\n#\n';
    }
    if (ir.system && ir.system.lldp) {
        c += 'lldp enable\n#\n';
    }

    // VRP profile: named_acl_supported=false ise tüm ACL refleri numeric ID'ye
    // (3000+) çevrilir. Profile IR.js'teki CC_VENDOR_PROFILES'ta tanımlı.
    // ir._meta.vrpVariant='legacy' eski override mekanizması da desteklenir.
    const _vrpProfile = (typeof ccGetVendorProfile === 'function')
        ? ccGetVendorProfile('huawei-vrp')
        : {};
    const _vrpLegacy = (ir._meta && ir._meta.vrpVariant === 'legacy') ||
                       (_vrpProfile.named_acl_supported === false);
    const _deployModeVrp = ir._meta && ir._meta.outputMode === 'deploy';
    const _aclNumMap = {};  // { aclName: 3000+i }
    if (_vrpLegacy) {
        (ir.acls || []).forEach((a, i) => { _aclNumMap[a.name] = 3000 + i; });
    }
    // Helper: ACL referansını verilen mode'a göre formatla
    // - default: "name <X>"
    // - legacy : "<num>"   (eğer eşleşme yoksa adı geri döner, dış kontrol gerekli değil)
    const _aclRef = function (name) {
        if (!name) return '';
        if (_vrpLegacy && _aclNumMap[name]) return String(_aclNumMap[name]);
        return 'name ' + name;
    };
    ir.vlans.forEach(v => {
        c += 'vlan ' + v.id + '\n';
        c += ' name ' + (v.name || 'VLAN' + v.id) + '\n';
        c += '#\n';
        if (v.svi_ip) {
            c += 'interface Vlanif' + v.id + '\n';
            c += ' ip address ' + v.svi_ip + ' ' + (v.svi_mask || '255.255.255.0') + '\n';
            (ir.vrrp || []).filter(x => x.vlan_id === v.id).forEach(vr => {
                c += ' vrrp vrid ' + vr.group_id + ' virtual-ip ' + vr.virtual_ip + '\n';
                if (vr.priority && vr.priority !== 100) c += ' vrrp vrid ' + vr.group_id + ' priority ' + vr.priority + '\n';
                if (vr.preempt) c += ' vrrp vrid ' + vr.group_id + ' preempt-mode timer delay 0\n';
            });
            if (v._aclIn)  c += ' traffic-filter inbound acl '  + _aclRef(v._aclIn)  + '\n';
            if (v._aclOut) c += ' traffic-filter outbound acl ' + _aclRef(v._aclOut) + '\n';
            if (v.pbr_route_map) c += ' ip policy-based-route ' + v.pbr_route_map + '\n';
            c += '#\n';
        }
    });
    const _hwBundleMembers = new Set();
    (ir.bundles || []).forEach(b => (b.members || []).forEach(m => _hwBundleMembers.add(m)));
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_hwBundleMembers.has(f.name)) return;
        const ifName = ccNormalizeIfaceFromJuniper(f.name, 'huawei');
        // _subif helper ile structured subif info (S21 refactor — QinQ destekli)
        const _hwSub = ccGetWriterSubif(f);
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        if (f.no_switchport) c += ' undo portswitch\n';
        // L3 subif: dot1q termination — QinQ destekli
        if (_hwSub) {
            const _enc = _hwSub.encapsulation;
            if (_enc.type === 'qinq' && _enc.qinq_inner) {
                // Huawei QinQ: dot1q termination vid OUTER ce-vid INNER
                c += ' dot1q termination vid ' + _enc.vlan + ' ce-vid ' + _enc.qinq_inner + '\n';
            } else {
                c += ' dot1q termination vid ' + _enc.vlan + '\n';
            }
            if (_enc.native) {
                c += ' arp broadcast enable\n';  // native subif Huawei pratiği
            }
        }
        if (f.ip) c += ' ip address ' + f.ip + ' ' + f.mask + '\n';
        if (f.mtu) c += ' jumboframe enable ' + f.mtu + '\n';
        if (f.vlan_mode === 'access') { c += ' port link-type access\n'; if (f.access_vlan) c += ' port default vlan ' + f.access_vlan + '\n'; }
        if (f.voice_vlan) c += ' voice-vlan ' + f.voice_vlan + ' enable\n';
        if (f.vlan_mode === 'trunk') {
            c += ' port link-type trunk\n';
            if (f.native_vlan) c += ' port trunk pvid vlan ' + f.native_vlan + '\n';
            const _tv = Array.isArray(f.trunk_vlans) ? f.trunk_vlans.join(' ') : (f.trunk_vlans ? String(f.trunk_vlans).replace(/,/g, ' ') : '');
            if (_tv) c += ' port trunk allow-pass vlan ' + _tv + '\n';
        }
        if (f._aclIn)  c += ' traffic-filter inbound acl '  + _aclRef(f._aclIn)  + '\n';
        if (f._aclOut) c += ' traffic-filter outbound acl ' + _aclRef(f._aclOut) + '\n';
        if (f.pbr_route_map) c += ' ip policy-based-route ' + f.pbr_route_map + '\n';
        if (f.edge_port) c += ' stp edged-port enable\n';
        if (f.bpdu_guard) c += ' stp bpdu-protection\n';
        if (f.port_security && f.port_security.enabled) {
            c += ' port-security enable\n';
            if (f.port_security.max) c += ' port-security max-mac-num ' + f.port_security.max + '\n';
            if (f.port_security.violation) c += ' port-security protect-action ' + f.port_security.violation + '\n';
            if (f.port_security.sticky) c += ' port-security mac-address sticky\n';
        }
        if (f.dhcp_snoop_trust) c += ' dhcp snooping trusted\n';
        if (f.bfd) {
            c += ' bfd enable\n';
            // Huawei VRP'de interface-level BFD timer'ları doğrudan
            // konfigüre edilmez; ayrı `bfd <session>` bloğunda yapılır.
            // Timer'ları yorum olarak koruyup operatöre bırakıyoruz.
            const iv = f.bfd.interval, rx = f.bfd.min_rx, mlt = f.bfd.multiplier;
            if (iv || rx || mlt) {
                c += ' # PARTIAL: BFD timers (interval=' + (iv || '?') +
                     '/min_rx=' + (rx || '?') + '/multiplier=' + (mlt || '?') +
                     ') — Huawei interface-level BFD\'de timer yok; ' +
                     '`bfd <session> bind peer-ip ... min-tx-interval/min-rx-interval/detect-multiplier`\n';
                ccDropField(ir, 'interface', f.name, 'bfd_timers',
                    { interval: iv, min_rx: rx, multiplier: mlt },
                    'huawei-iface-bfd-no-timers-needs-session-config', 'huawei-vrp');
            }
        }
        if (f.service_policy) {
            if (f.service_policy.input) c += ' traffic-policy ' + f.service_policy.input + ' inbound\n';
            if (f.service_policy.output) c += ' traffic-policy ' + f.service_policy.output + ' outbound\n';
        }
        if (f.shutdown) c += ' shutdown\n';
        c += '#\n';
    });
    // Bundles → Eth-Trunk + eth-trunk member binding
    (ir.bundles || []).forEach(b => {
        c += 'interface Eth-Trunk' + b.id + '\n';
        if (b.desc) c += ' description ' + b.desc + '\n';
        if (b.mode === 'lacp-active' || b.mode === 'lacp-passive') c += ' mode lacp-static\n';
        if (b.ip) c += ' ip address ' + b.ip + ' ' + (b.mask || '255.255.255.0') + '\n';
        if (b.vlan_mode === 'access') { c += ' port link-type access\n'; if (b.access_vlan) c += ' port default vlan ' + b.access_vlan + '\n'; }
        if (b.vlan_mode === 'trunk') {
            c += ' port link-type trunk\n';
            if (b.native_vlan) c += ' port trunk pvid vlan ' + b.native_vlan + '\n';
            const tv = Array.isArray(b.trunk_vlans) ? b.trunk_vlans.join(' ') : (b.trunk_vlans ? String(b.trunk_vlans).replace(/,/g, ' ') : '');
            if (tv) c += ' port trunk allow-pass vlan ' + tv + '\n';
        }
        if (b._aclIn)  c += ' traffic-filter inbound acl '  + _aclRef(b._aclIn)  + '\n';
        if (b._aclOut) c += ' traffic-filter outbound acl ' + _aclRef(b._aclOut) + '\n';
        if (b.mtu) c += ' jumboframe enable ' + b.mtu + '\n';
        c += '#\n';
        (b.members || []).forEach(m => {
            const hn = ccNormalizeIfaceFromJuniper(m, 'huawei');
            c += 'interface ' + hn + '\n eth-trunk ' + b.id + '\n#\n';
        });
    });

    ir.routes.forEach(r => { c += 'ip route-static ' + r.network + ' ' + r.mask + ' ' + r.nexthop + '\n'; });
    if (ir.routes.length) c += '#\n';
    ir.acls.forEach(acl => {
        if (_vrpLegacy && _aclNumMap[acl.name]) {
            // Legacy mode: numeric ID; trailing `# was: ...` yorum review modunda
            // okunabilirlik için, deploy modunda strip edilir (üstteki post-process)
            c += 'acl number ' + _aclNumMap[acl.name];
            if (!_deployModeVrp) c += '  # was: ' + acl.name;
            c += '\n';
        } else {
            c += 'acl name ' + acl.name + ' advance\n';
        }
        const _expandedEntries = (typeof ccExpandAclPrefixListRefs === 'function') ? ccExpandAclPrefixListRefs(ir, acl) : acl.entries;
        _expandedEntries.forEach((e, j) => {
            const src = ccAclAddrToHuawei(e.src);
            const dst = ccAclAddrToHuawei(e.dst);
            let rule = ' rule ' + ((j + 1) * 5) + ' ' + e.action + ' ' + e.proto;
            if (src !== 'any') rule += ' source ' + src;
            if (e.src_port) rule += ' source-port eq ' + e.src_port.replace(/^eq\s+/, '');
            if (dst !== 'any') rule += ' destination ' + dst;
            if (e.dst_port) rule += ' destination-port eq ' + e.dst_port.replace(/^eq\s+/, '');
            c += rule + '\n';
        });
        c += '#\n';
    });
    c += ccWriteSystemHuawei(ir);
    // PBR → policy-based-route
    (ir.routeMaps || []).forEach(rm => {
        c += 'policy-based-route ' + rm.name + ' ' + rm.action + ' node ' + rm.seq + '\n';
        if (rm.match_acl) {
            const aclRefStr = _vrpLegacy && _aclNumMap[rm.match_acl]
                ? String(_aclNumMap[rm.match_acl])
                : rm.match_acl;
            c += ' if-match acl ' + aclRefStr + '\n';
        }
        if (rm.set_next_hop) c += ' apply ip-address next-hop ' + rm.set_next_hop + '\n';
        c += '#\n';
    });
    // QoS → traffic classifier/behavior/policy
    (ir.qos && ir.qos.classMaps || []).forEach(cm => {
        c += 'traffic classifier ' + cm.name + '\n';
        if (cm.match_dscp) c += ' if-match dscp ' + cm.match_dscp + '\n';
        if (cm.match_acl) {
            const aclRefStr = _vrpLegacy && _aclNumMap[cm.match_acl]
                ? String(_aclNumMap[cm.match_acl])
                : cm.match_acl;
            c += ' if-match acl ' + aclRefStr + '\n';
        }
        c += '#\n';
    });
    // Behaviors için her policy class'ı için ayrı behavior üret
    const _behaviors = {};
    (ir.qos && ir.qos.policyMaps || []).forEach(pm => {
        pm.classes.forEach(cl => {
            const behName = cl.name + '-BEHAVIOR';
            _behaviors[behName] = cl;
        });
    });
    Object.keys(_behaviors).forEach(name => {
        const cl = _behaviors[name];
        c += 'traffic behavior ' + name + '\n';
        if (cl.action === 'priority' && cl.priority_pct) {
            // Cisco "priority percent" = LLQ (low-latency priority queue);
            // Huawei "car cir" = committed access rate / policing — semantik AYNI DEĞİL.
            // Yanlış-semantikli `car cir` HİÇBİR ZAMAN emit edilmez (cihaza basıldığında
            // yanlış davranışa yol açar). Sadece `permit` yazılır.
            //
            // Bu DANGEROUS: priority scheduling tamamen kayıp, ses trafiği jitter'a maruz
            // kalabilir. Operatör manuel olarak `queue ef pq` veya WFQ profile eklemek
            // ZORUNDA.
            c += ' permit\n';
            ccDropField(ir, 'qos', cl.name, 'priority_scheduling', cl.priority_pct,
                'huawei-llq-semantic-downgrade-needs-manual-queue-ef-pq', 'huawei-vrp',
                CC_SEVERITY.DANGEROUS);
        }
        else if (cl.action === 'priority') c += ' permit\n';
        else if (cl.action === 'bandwidth' && cl.priority_pct) c += ' car cir ' + (cl.priority_pct * 1000) + '\n';
        else if (cl.action === 'fair-queue') c += ' permit\n';
        c += '#\n';
    });
    (ir.qos && ir.qos.policyMaps || []).forEach(pm => {
        c += 'traffic policy ' + pm.name + '\n';
        pm.classes.forEach(cl => {
            c += ' classifier ' + cl.name + ' behavior ' + cl.name + '-BEHAVIOR\n';
        });
        c += '#\n';
    });
    // SPAN → observe-port + port-mirroring
    (ir.monitorSessions || []).forEach(sess => {
        if (sess.destination) {
            const dName = ccNormalizeIfaceFromJuniper(sess.destination, 'huawei');
            c += 'observe-port ' + sess.id + ' interface ' + dName + '\n';
        }
        sess.sources.forEach(src => {
            const sName = ccNormalizeIfaceFromJuniper(src.name, 'huawei');
            c += 'interface ' + sName + '\n';
            c += ' port-mirroring to observe-port ' + sess.id + (src.direction && src.direction !== 'both' ? ' ' + src.direction : ' both') + '\n';
            c += '#\n';
        });
    });
    // NQA (IP SLA equivalent)
    (ir.ipSla || []).forEach(sla => {
        const sName = sla.name || ('SLA_' + sla.id);
        c += 'nqa test-instance admin ' + sName + '\n';
        if (sla.type) c += ' test-type ' + (sla.type === 'icmp-echo' ? 'icmp' : sla.type) + '\n';
        if (sla.target) c += ' destination-address ipv4 ' + sla.target + '\n';
        if (sla.source_iface) c += ' source-interface ' + ccNormalizeIfaceFromJuniper(sla.source_iface, 'huawei') + '\n';
        else if (sla.source_address) {
            const srcIface = (ir.interfaces || []).find(f => f.ip === sla.source_address);
            if (srcIface) c += ' source-interface ' + ccNormalizeIfaceFromJuniper(srcIface.name, 'huawei') + '\n';
            else c += ' source-address ipv4 ' + sla.source_address + '\n';
        }
        if (sla.frequency) c += ' frequency ' + sla.frequency + '\n';
        c += ' start now\n#\n';
    });
    // Track: Huawei track binding sadece comment seviyesinde — gerçek
    // protocol-bağımlı track Huawei'de farklı modelle (track-list, peer
    // monitör) yapılır. Bu yüzden PARTIAL/MANUAL REVIEW olarak işaretlenir.
    if ((ir.tracks || []).length) {
        c += '# PARTIAL CONVERSION: Cisco "track ip sla reachability" Huawei\'de\n';
        c += '# track-list veya BFD ile farklı model kullanır. NQA test-instance\n';
        c += '# tek başına track olarak davranmaz; aşağıdaki binding yorumlar\n';
        c += '# operatörün protocol-bağımlı track kurulumunu manuel yapması içindir.\n';
    }
    (ir.tracks || []).forEach(t => {
        const sla = (ir.ipSla || []).find(s => s.id === t.sla_id);
        if (sla) {
            c += '# MANUAL REVIEW REQUIRED: track ' + t.id + ' → NQA ' +
                 (sla.name || 'SLA_' + sla.id) + ' (Huawei track binding manuel kurulur)\n';
            ccDropField(ir, 'track', String(t.id), 'sla_binding', t.sla_id,
                'huawei-track-binding-manual-only', 'huawei-vrp');
        }
    });
    // Event applet — Huawei VRP native EEM eşdeğeri sınırlı; comment olarak yaz
    (ir.eventApplets || []).forEach(app => {
        c += '# MANUAL IMPLEMENTATION REQUIRED: Event Manager Applet ' + app.name + ' (Huawei VRP native EEM eşdeğeri yok)\n';
        c += '# Trigger: ' + (app.trigger || 'n/a') + '\n';
        c += '# Action: ' + (app.action || 'n/a') + '\n';
        c += '# Önerilen: NETCONF/Python script veya CLI alias ile elle uygulayın\n#\n';
        ccDropField(ir, 'eventApplet', app.name, 'implementation', app.action || 'n/a',
            'huawei-eem-no-native-equivalent', 'huawei-vrp');
    });
    c += ccWriteOspfHuawei(ir);
    c += ccWriteBgpHuawei(ir);
    if (ir.unknowns && ir.unknowns.length) {
        c += '# ---- Çevrilemeyen satırlar (' + ir.unknowns.length + ') ----\n';
        ir.unknowns.forEach(u => c += '# ' + u + '\n');
    }
    return c;
}
CC_WRITERS['huawei'] = ccWriteHuawei;
CC_WRITERS['huawei-vrp'] = ccWriteHuawei;

// ── Huawei USG Writer ─────────────────────────────────────────────────────────
function ccWriteHuaweiUSG(ir) {
    let c = '# ======================================\n# Huawei USG — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'sysname ' + ir.hostname + '\n#\n';
    // Huawei USG: tüm interface'ler emit edilir (L2-only + L3).
    // Subif: name="...10" → `vlan-type dot1q 10`
    (ir.interfaces || []).forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        const ifName = ccNormalizeIfaceFromJuniper(f.name, 'huawei');
        const subifM = String(ifName).match(/^(.+)\.(\d+)$/);
        const isSubif = !!subifM;
        const subifVlan = isSubif ? parseInt(subifM[2], 10) : null;
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        if (isSubif) c += ' vlan-type dot1q ' + subifVlan + '\n';
        if (f.ip) c += ' ip address ' + f.ip + ' ' + (f.mask || '255.255.255.0') + '\n';
        if (f.mtu) c += ' mtu ' + f.mtu + '\n';
        c += (f.shutdown ? ' shutdown\n' : ' undo shutdown\n');
        c += '#\n';
        if (f.voice_vlan)     ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'usg-no-voice-vlan',    'huawei-usg');
        if (f.port_security && f.port_security.enabled)
                              ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'usg-no-port-security', 'huawei-usg');
        if (f.edge_port)      ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'usg-no-stp-on-iface',  'huawei-usg');
        if (f.bpdu_guard)     ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'usg-no-stp-on-iface',  'huawei-usg');
        if (f.service_policy) ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'usg-traffic-policy-different', 'huawei-usg');
    });
    (ir.routes || []).forEach(r => {
        c += 'ip route-static ' + r.network + ' ' + (r.mask || '0.0.0.0') + ' ' + r.nexthop + '\n';
    });
    if (ir.routes && ir.routes.length) c += '#\n';
    (ir.zones || []).forEach(z => {
        const normName = ccNormalizeZone(z.name);
        c += 'firewall zone ' + normName.toLowerCase() + '\n';
        (z.interfaces || []).forEach(ifc => { c += ' add interface ' + ifc + '\n'; });
        c += '#\n';
    });
    (ir.addressObjects || []).filter(a => a.type !== 'group').forEach(a => {
        c += 'ip address-set ' + a.name + ' type object\n';
        if (a.type === 'host') c += ' address 0 ' + a.value + ' 32\n';
        else if (a.type === 'network') c += ' address 0 ' + a.value + ' ' + ccMaskToPrefix(a.mask || '255.255.255.0') + '\n';
        c += '#\n';
    });
    if (ir.securityPolicies && ir.securityPolicies.length) {
        c += 'security-policy\n';
        ir.securityPolicies.forEach(pol => {
            c += ' rule name ' + pol.name + '\n';
            if (pol.srcZone) c += '  source-zone ' + ccNormalizeZone(pol.srcZone).toLowerCase() + '\n';
            if (pol.dstZone) c += '  destination-zone ' + ccNormalizeZone(pol.dstZone).toLowerCase() + '\n';
            (pol.srcAddr || []).forEach(s => { c += '  source-address address-set ' + s + '\n'; });
            (pol.dstAddr || []).forEach(d => { c += '  destination-address address-set ' + d + '\n'; });
            (pol.service || []).forEach(s => { c += '  service ' + s + '\n'; });
            c += '  action ' + (pol.action === 'allow' ? 'permit' : 'deny') + '\n';
        });
        c += '#\n';
    }
    c += ccWriteUnknownsFor('huawei-usg', ir.unknowns);
    return c;
}
CC_WRITERS['huawei-usg'] = ccWriteHuaweiUSG;

CC_WRITERS['huawei-ce'] = ccWriteHuawei;
