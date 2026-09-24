'use strict';

// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Arista EOS Writer ─────────────────────────────────────────────────────────
function ccWriteAristaEOS(ir) {
    let c = ccWriteCiscoIOS(ir)
        .replace('! Cisco IOS — Converted Configuration', '! Arista EOS — Converted Configuration')
        .replace('! ======================================\n\n', '! ======================================\n\nip routing\n!\n');
    let notes = '';
    if ((ir.vrrp || []).length) notes += '! PARTIAL CONVERSION: First-hop redundancy is emitted as Cisco-style standby; verify Arista EOS VRRP/VARP syntax manually.\n';
    if ((ir.routeMaps || []).length) notes += '! MANUAL REVIEW REQUIRED: PBR route-map syntax is Cisco-like; verify EOS platform support and TCAM/profile requirements.\n';
    if (ir.eventApplets && ir.eventApplets.length) notes += '! MANUAL REVIEW REQUIRED: EEM/event automation is Cisco-like; verify EOS event-handler conversion.\n';
    if (ir.bfdGlobal || (ir.interfaces || []).some(f => f.bfd) || (ir.bgp && (ir.bgp.neighbors || []).some(n => n.bfd))) notes += '! PARTIAL CONVERSION: BFD intent is preserved where possible; verify EOS protocol/interface binding.\n';
    if (notes) c += '\n! ---- Arista EOS Review Notes ----\n' + notes;
    return c;
}
CC_WRITERS['arista-eos'] = ccWriteAristaEOS;

// ── Dell OS10 Writer ──────────────────────────────────────────────────────────
function ccWriteDellOS10(ir) {
    let c = '! ======================================\n! Dell OS10 — Converted Configuration\n! ======================================\n\n';
    if (ir.hostname) c += 'hostname ' + ir.hostname + '\n!\n';
    if (ir.spanningTree && ir.spanningTree.mode) {
        const m = ir.spanningTree.mode;
        const dellMode = m === 'rstp' ? 'rstp' : m === 'mstp' ? 'mst' : m;
        c += 'spanning-tree mode ' + dellMode + '\n!\n';
    }
    ir.vlans.forEach(v => {
        c += 'interface vlan ' + v.id + '\n';
        c += ' description ' + (v.name || 'VLAN' + v.id) + '\n';
        if (v.svi_ip) c += ' ip address ' + v.svi_ip + '/' + ccMaskToPrefix(v.svi_mask) + '\n';
        (ir.vrrp || []).filter(x => x.vlan_id === v.id).forEach(vr => {
            c += ' vrrp-group ' + vr.group_id + ' virtual-address ' + vr.virtual_ip + '\n';
            if (vr.priority && vr.priority !== 100) c += ' vrrp-group ' + vr.group_id + ' priority ' + vr.priority + '\n';
        });
        if (v._aclIn)  c += ' ip access-group ' + v._aclIn  + ' in\n';
        if (v._aclOut) c += ' ip access-group ' + v._aclOut + ' out\n';
        if (v.pbr_route_map) c += ' ip policy route-map ' + v.pbr_route_map + '\n';
        c += ' no shutdown\n!\n';
    });
    const _dellMembers = new Set();
    (ir.bundles || []).forEach(b => (b.members || []).forEach(m => _dellMembers.add(m)));
    ir.interfaces.forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_dellMembers.has(f.name)) return;
        const ifName = ccNormalizeIfaceForDell(f.name);
        // _subif helper ile structured subif info (S21 refactor)
        const _dSub = ccGetWriterSubif(f);
        const _isSubif = !!_dSub;
        c += 'interface ' + ifName + '\n';
        if (f.desc) c += ' description ' + f.desc + '\n';
        if (f.no_switchport) c += ' no switchport\n';
        // L3 subif: Dell OS10 syntax — `encapsulation dot1q N` parent altında.
        if (_dSub) {
            const _enc = _dSub.encapsulation;
            c += ' encapsulation dot1q ' + _enc.vlan + '\n';
            if (_enc.type === 'qinq' && _enc.qinq_inner) {
                // Dell OS10 QinQ desteği sınırlı (`vlan-stack` farklı bağlam) — PARTIAL
                ccDropField(ir, 'interface', f.name, '_subif.qinq_inner', _enc.qinq_inner,
                    'dell-os10-qinq-inner-not-emitted', 'dell-os10', CC_SEVERITY.PARTIAL);
            }
            if (_enc.native) {
                ccDropField(ir, 'interface', f.name, '_subif.native', _enc.vlan,
                    'dell-os10-native-subif-explicit-flag-not-supported', 'dell-os10', CC_SEVERITY.PARTIAL);
            }
        }
        if (f.ip) c += ' ip address ' + f.ip + '/' + ccMaskToPrefix(f.mask) + '\n';
        if (f.mtu) c += ' mtu ' + f.mtu + '\n';
        if (!_isSubif && f.vlan_mode === 'access') { c += ' switchport mode access\n'; if (f.access_vlan) c += ' switchport access vlan ' + f.access_vlan + '\n'; }
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
            if (f.service_policy.input) c += ' service-policy input ' + f.service_policy.input + '\n';
            if (f.service_policy.output) c += ' service-policy output ' + f.service_policy.output + '\n';
        }
        if (f.shutdown) c += ' shutdown\n';
        c += '!\n';
    });
    // Bundles → port-channel + channel-group members
    (ir.bundles || []).forEach(b => {
        c += 'interface port-channel' + b.id + '\n';
        if (b.desc) c += ' description ' + b.desc + '\n';
        if (b.ip) c += ' ip address ' + b.ip + '/' + ccMaskToPrefix(b.mask || '255.255.255.0') + '\n';
        if (b.vlan_mode === 'access') { c += ' switchport mode access\n'; if (b.access_vlan) c += ' switchport access vlan ' + b.access_vlan + '\n'; }
        if (b.vlan_mode === 'trunk') {
            c += ' switchport mode trunk\n';
            if (b.native_vlan) c += ' switchport trunk native vlan ' + b.native_vlan + '\n';
            const tv = Array.isArray(b.trunk_vlans) ? b.trunk_vlans.join(',') : (b.trunk_vlans ? String(b.trunk_vlans).replace(/\s+/g, ',') : '');
            if (tv) c += ' switchport trunk allowed vlan ' + tv + '\n';
        }
        if (b.mtu) c += ' mtu ' + b.mtu + '\n';
        c += '!\n';
        const dellMode = b.mode === 'lacp-active' ? 'active' : b.mode === 'lacp-passive' ? 'passive' : 'on';
        (b.members || []).forEach(m => {
            c += 'interface ' + ccNormalizeIfaceForDell(m) + '\n channel-group ' + b.id + ' mode ' + dellMode + '\n!\n';
        });
    });
    ir.routes.forEach(r => { c += 'ip route ' + r.network + '/' + ccMaskToPrefix(r.mask) + ' ' + r.nexthop + '\n'; });
    if (ir.routes.length) c += '!\n';
    // ACLs
    ir.acls.forEach(acl => {
        c += 'ip access-list ' + acl.name + '\n';
        acl.entries.forEach((e, i) => {
            const seq = (i + 1) * 10;
            c += ' seq ' + seq + ' ' + ccFormatAclEntryWildcard(e) + '\n';
        });
        c += '!\n';
    });
    // SNMP
    if (ir.system && ir.system.snmp && ir.system.snmp.community) {
        c += 'snmp-server community ' + ir.system.snmp.community + ' ' + (ir.system.snmp.access === 'rw' ? 'rw' : 'ro') + '\n!\n';
    }
    // SNMPv3
    (ir.system && ir.system.snmp_v3_groups || []).forEach(g => {
        c += 'snmp-server group ' + g.name + ' v3 ' + g.sec_level + '\n';
    });
    (ir.system && ir.system.snmp_v3_users || []).forEach(u => {
        let line = 'snmp-server user ' + u.user + (u.group ? ' ' + u.group : '') + ' v3';
        if (u.auth_proto) line += ' auth ' + u.auth_proto + ' ' + u.auth_pwd;
        if (u.priv_proto) {
            const pp = u.priv_proto.replace(/(\d+)$/, ' $1').trim();
            line += ' priv ' + pp + ' ' + u.priv_pwd;
        }
        c += line + '\n';
    });
    // DHCP snooping
    if (ir.dhcpSnooping && ir.dhcpSnooping.enabled) {
        c += 'ip dhcp snooping\n';
        if (ir.dhcpSnooping.vlans && ir.dhcpSnooping.vlans.length)
            c += 'ip dhcp snooping vlan ' + ir.dhcpSnooping.vlans.join(',') + '\n';
        c += '!\n';
    }
    // route-map (Dell Cisco-style)
    (ir.routeMaps || []).forEach(rm => {
        c += 'route-map ' + rm.name + ' ' + rm.action + ' ' + rm.seq + '\n';
        if (rm.match_acl) c += ' match ip address ' + rm.match_acl + '\n';
        if (rm.set_next_hop) c += ' set ip next-hop ' + rm.set_next_hop + '\n';
        c += '!\n';
    });
    // class-map / policy-map
    (ir.qos && ir.qos.classMaps || []).forEach(cm => {
        c += 'class-map type qos match-' + (cm.match_type || 'any') + ' ' + cm.name + '\n';
        if (cm.match_dscp) c += ' match dscp ' + cm.match_dscp + '\n';
        c += '!\n';
    });
    (ir.qos && ir.qos.policyMaps || []).forEach(pm => {
        c += 'policy-map type qos ' + pm.name + '\n';
        pm.classes.forEach(cl => {
            c += ' class ' + cl.name + '\n';
            if (cl.action === 'priority') c += '  priority\n';
        });
        c += '!\n';
    });
    // monitor session
    (ir.monitorSessions || []).forEach(sess => {
        c += 'monitor session ' + sess.id + '\n';
        sess.sources.forEach(src => {
            const sName = ccNormalizeIfaceForDell(src.name);
            c += ' source interface ' + sName + (src.direction && src.direction !== 'both' ? ' direction ' + src.direction : ' direction both') + '\n';
        });
        if (sess.destination) {
            const dName = ccNormalizeIfaceForDell(sess.destination);
            c += ' destination interface ' + dName + '\n';
        }
        c += '!\n';
    });
    // OSPF / BGP (Cisco-like)
    (ir.ospf || []).forEach(proc => {
        c += 'router ospf ' + proc.process_id + '\n';
        if (proc.router_id) c += ' router-id ' + proc.router_id + '\n';
        (proc.areas || []).forEach(area => {
            (area.networks || []).forEach(net => {
                c += ' network ' + net + ' area ' + area.id + '\n';
            });
        });
        c += '!\n';
    });
    if (ir.bgp) {
        c += 'router bgp ' + ir.bgp.as_number + '\n';
        if (ir.bgp.router_id) c += ' router-id ' + ir.bgp.router_id + '\n';
        (ir.bgp.neighbors || []).forEach(n => {
            c += ' neighbor ' + n.ip + ' remote-as ' + n.remote_as + '\n';
        });
        (ir.bgp.networks || []).forEach(net => {
            c += ' network ' + net + '\n';
        });
        c += '!\n';
    }
    // BFD global
    if (ir.bfdGlobal) c += 'bfd\n!\n';
    // IP SLA (Dell OS10 10.5+ destekliyor)
    (ir.ipSla || []).forEach(sla => {
        c += 'ip sla ' + sla.id + '\n';
        if (sla.type === 'icmp-echo' && sla.target) {
            let src = '';
            if (sla.source_iface) src = ' source-interface ' + ccNormalizeIfaceForDell(sla.source_iface);
            else if (sla.source_address) {
                const srcIface = (ir.interfaces || []).find(f => f.ip === sla.source_address);
                src = srcIface ? ' source-interface ' + ccNormalizeIfaceForDell(srcIface.name) : ' source-ip ' + sla.source_address;
            }
            c += ' icmp-echo ' + sla.target + src + '\n';
        }
        if (sla.frequency) c += ' frequency ' + sla.frequency + '\n';
        c += '!\n';
    });
    // Track
    (ir.tracks || []).forEach(t => {
        c += 'track ' + t.id + ' ip sla ' + t.sla_id + ' reachability\n';
    });
    // Event manager applet (Dell Cisco-uyumlu)
    (ir.eventApplets || []).forEach(app => {
        c += 'event manager applet ' + app.name + '\n';
        if (app.trigger && app.trigger.startsWith('track-')) {
            const tm = app.trigger.match(/^track-(\d+)-(\S+)/);
            if (tm) c += ' event track ' + tm[1] + ' state ' + tm[2] + '\n';
        }
        if (app.action && app.action.startsWith('syslog: ')) {
            c += ' action 1.0 syslog msg "' + app.action.slice(8) + '"\n';
        } else if (app.action && app.action.startsWith('cmd: ')) {
            c += ' action 1.0 cli command "' + app.action.slice(5) + '"\n';
        }
        c += '!\n';
    });
    // NTP / Syslog
    (ir.system && ir.system.ntp || []).forEach(ip => { c += 'ntp server ' + ip + '\n'; });
    (ir.system && ir.system.syslog || []).forEach(ip => { c += 'logging server ' + ip + '\n'; });
    c += ccWriteUnknowns(ir.unknowns);
    return c;
}
CC_WRITERS['dell-os10'] = ccWriteDellOS10;

function ccWriteF5BigIP(ir) {
    let c = '# ======================================\n# F5 BIG-IP tmsh — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'sys global-settings {\n    hostname ' + ir.hostname + '\n}\n\n';

    // ── L2: net interface ─────────────────────────────────────────────────
    // F5'te fiziksel port adları sabittir (1.1, 1.2, ...). Sadece mtu/disabled
    // override edilebilir. IR'da ham port adı (Gi0/1, port1, vb.) F5'e
    // anlamlı değil — physical port name'i F5 formatına map'lemeye çalışmak
    // yerine source port adını koruyoruz ve f5 admin'in manuel binding
    // yapması için yorum bırakıyoruz.
    // Subif pattern'i: parent harfle başlamalı (F5 port adları "1.1" gibi
    // sadece rakam içerebilir — bunlar subinterface DEĞIL, fiziksel port).
    const _isSubif = name => /^[A-Za-z][^.]*\.\d+$/.test(String(name));
    const _f5Phys = (ir.interfaces || []).filter(f =>
        !f.name.toLowerCase().startsWith('vlan') &&
        !_isSubif(f.name));
    _f5Phys.forEach(f => {
        if (f.mtu || f.shutdown) {
            c += 'net interface ' + f.name + ' {\n';
            if (f.mtu) c += '    mtu ' + f.mtu + '\n';
            c += '    enabled ' + (f.shutdown ? 'false' : 'true') + '\n';
            c += '}\n';
        }
        if (f.desc)            ccDropField(ir, 'interface', f.name, 'desc',           f.desc,           'f5-net-interface-no-comment', 'f5-bigip');
        if (f.voice_vlan)      ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'f5-no-voice-vlan',           'f5-bigip');
        if (f.port_security && f.port_security.enabled)
                               ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'f5-no-port-security',        'f5-bigip');
        if (f.edge_port)       ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'f5-no-stp-on-iface',         'f5-bigip');
        if (f.bpdu_guard)      ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'f5-no-stp-on-iface',         'f5-bigip');
        if (f.service_policy)  ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'f5-class-of-service-different','f5-bigip');
    });
    if (_f5Phys.some(f => f.mtu || f.shutdown)) c += '\n';

    // ── L2: net vlan ─────────────────────────────────────────────────────
    // Hangi VLAN'lar mevcut? ir.vlans + interface trunk_vlans/access_vlan'ından
    // türetilir. Üyelikler: tagged (trunk üzerinden), untagged (access üzerinden).
    const _vlanMembersF5 = {};   // { vid: { tagged:[], untagged:[], name:'', mtu:0, svi_ip:'', svi_mask:'' } }
    const _ensureVlan = (vid, name) => {
        if (!_vlanMembersF5[vid]) _vlanMembersF5[vid] = { tagged: [], untagged: [], name: name || ('vlan' + vid), mtu: 0, svi_ip: '', svi_mask: '' };
        else if (name && !_vlanMembersF5[vid].name.startsWith('vlan')) _vlanMembersF5[vid].name = name;
        return _vlanMembersF5[vid];
    };
    (ir.vlans || []).forEach(v => {
        const vl = _ensureVlan(v.id, v.name);
        if (v.svi_ip) { vl.svi_ip = v.svi_ip; vl.svi_mask = v.svi_mask; }
    });
    (ir.interfaces || []).forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) {
            const vidM = (f.name.match(/(\d+)$/) || [])[1];
            const vid = parseInt(vidM, 10);
            if (vid && f.ip) {
                const vl = _ensureVlan(vid);
                vl.svi_ip = f.ip;
                vl.svi_mask = f.mask;
            }
            return;
        }
        const subifM = _isSubif(f.name) ? String(f.name).match(/^(.+)\.(\d+)$/) : null;
        if (subifM) {
            // Subif: parent untagged değil, subif kendisi tagged sayılır
            const vid = parseInt(subifM[2], 10);
            const vl = _ensureVlan(vid);
            if (vl.tagged.indexOf(subifM[1]) === -1) vl.tagged.push(subifM[1]);
            if (f.ip && !vl.svi_ip) { vl.svi_ip = f.ip; vl.svi_mask = f.mask; }
            return;
        }
        if (f.vlan_mode === 'access' && f.access_vlan) {
            const vl = _ensureVlan(f.access_vlan);
            if (vl.untagged.indexOf(f.name) === -1) vl.untagged.push(f.name);
        }
        if (f.vlan_mode === 'trunk') {
            const tvs = Array.isArray(f.trunk_vlans) ? f.trunk_vlans :
                        (f.trunk_vlans ? String(f.trunk_vlans).split(/[\s,]+/).map(Number).filter(Boolean) : []);
            tvs.forEach(vid => {
                const vl = _ensureVlan(vid);
                if (vl.tagged.indexOf(f.name) === -1) vl.tagged.push(f.name);
            });
            if (f.native_vlan) {
                const vl = _ensureVlan(f.native_vlan);
                if (vl.untagged.indexOf(f.name) === -1) vl.untagged.push(f.name);
            }
        }
    });
    const _f5Vids = Object.keys(_vlanMembersF5).map(Number).sort((a, b) => a - b);
    _f5Vids.forEach(vid => {
        const vl = _vlanMembersF5[vid];
        c += 'net vlan ' + vl.name + ' {\n';
        c += '    tag ' + vid + '\n';
        if (vl.tagged.length || vl.untagged.length) {
            c += '    interfaces {\n';
            vl.tagged.forEach(i =>   c += '        ' + i + ' { tagged }\n');
            vl.untagged.forEach(i => c += '        ' + i + ' { }\n');
            c += '    }\n';
        }
        if (vl.mtu) c += '    mtu ' + vl.mtu + '\n';
        c += '}\n';
    });
    if (_f5Vids.length) c += '\n';

    // ── L3: net self (SVI ip'leri) ───────────────────────────────────────
    _f5Vids.forEach(vid => {
        const vl = _vlanMembersF5[vid];
        if (!vl.svi_ip) return;
        const pre = ccMaskToPrefix(vl.svi_mask || '255.255.255.0');
        c += 'net self ' + vl.name + '_self {\n';
        c += '    address ' + vl.svi_ip + '/' + pre + '\n';
        c += '    vlan ' + vl.name + '\n';
        c += '    traffic-group traffic-group-local-only\n';
        c += '    allow-service default\n';
        c += '}\n';
    });
    if (_f5Vids.some(vid => _vlanMembersF5[vid].svi_ip)) c += '\n';

    (ir.addressObjects||[]).forEach(a => {
        if (a.type==='host') c += 'ltm node /Common/' + a.name + ' {\n    address ' + a.value + '\n}\n';
    });
    if (ir.addressObjects.length) c += '\n';
    (ir.monitors||[]).forEach(mon => {
        c += 'ltm monitor ' + (mon.type||'http') + ' /Common/' + mon.name + ' {\n';
        c += '    interval ' + (mon.interval||5) + '\n    timeout ' + (mon.timeout||16) + '\n';
        if (mon.send) c += '    send "' + mon.send + '"\n';
        if (mon.receive) c += '    recv "' + mon.receive + '"\n';
        c += '}\n';
    });
    if (ir.monitors.length) c += '\n';
    (ir.pools||[]).forEach(pool => {
        c += 'ltm pool /Common/' + pool.name + ' {\n';
        c += '    load-balancing-mode ' + (pool.lb_method||'round-robin') + '\n';
        if (pool.monitor) c += '    monitor /Common/' + pool.monitor + '\n';
        if (pool.members&&pool.members.length) {
            c += '    members {\n';
            pool.members.forEach(m => { c += '        ' + m.ip + ':' + m.port + ' { }\n'; });
            c += '    }\n';
        }
        c += '}\n';
    });
    if (ir.pools.length) c += '\n';
    (ir.virtualServers||[]).forEach(vs => {
        c += 'ltm virtual /Common/' + vs.name + ' {\n';
        if (vs.vip&&vs.port) c += '    destination ' + vs.vip + ':' + vs.port + '\n';
        if (vs.pool) c += '    pool /Common/' + vs.pool + '\n';
        if (vs.snat) c += '    source-address-translation { type automap }\n';
        c += '    ip-protocol ' + (vs.proto||'tcp') + '\n';
        c += '}\n';
    });
    return c;
}
CC_WRITERS['f5-bigip'] = ccWriteF5BigIP;

function ccWriteCitrixADC(ir) {
    let c = '# ======================================\n# Citrix ADC (NetScaler) — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += 'set ns hostName ' + ir.hostname + '\n\n';

    // ── set interface (mtu / state) ───────────────────────────────────────
    // Citrix port adlandırması "1/N" formatındadır. Source port adı (Gi0/1,
    // port1, vb.) Citrix'e map'lenmez — orijinal isim korunur ve operatöre
    // bırakılır; sadece mtu/disabled set edilir.
    // Subif: parent harfle başlamalı (F5'in "1.1" formatı subif değil).
    const _isSubifCx = name => /^[A-Za-z][^.]*\.\d+$/.test(String(name));
    (ir.interfaces || []).forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) return;
        if (_isSubifCx(f.name)) return;  // subif Citrix tarafında ayrı bir vlan binding olarak çıkar
        const parts = [];
        if (f.mtu) parts.push('-mtu ' + f.mtu);
        if (f.shutdown) parts.push('-state DISABLED');
        if (parts.length) c += 'set interface ' + f.name + ' ' + parts.join(' ') + '\n';
        if (f.desc)            ccDropField(ir, 'interface', f.name, 'desc',           f.desc,           'citrix-no-iface-description', 'citrix-adc');
        if (f.voice_vlan)      ccDropField(ir, 'interface', f.name, 'voice_vlan',     f.voice_vlan,     'citrix-no-voice-vlan',        'citrix-adc');
        if (f.port_security && f.port_security.enabled)
                               ccDropField(ir, 'interface', f.name, 'port_security',  f.port_security,  'citrix-no-port-security',     'citrix-adc');
        if (f.edge_port)       ccDropField(ir, 'interface', f.name, 'edge_port',      f.edge_port,      'citrix-no-stp-on-iface',      'citrix-adc');
        if (f.bpdu_guard)      ccDropField(ir, 'interface', f.name, 'bpdu_guard',     f.bpdu_guard,     'citrix-no-stp-on-iface',      'citrix-adc');
        if (f.service_policy)  ccDropField(ir, 'interface', f.name, 'service_policy', f.service_policy, 'citrix-qos-different',        'citrix-adc');
    });

    // ── add vlan / bind vlan ─────────────────────────────────────────────
    const _vlanMembersCx = {}; // { vid: { tagged:[], untagged:[], name:'', svi_ip:'', svi_mask:'' } }
    const _ensureV = (vid, name) => {
        if (!_vlanMembersCx[vid]) _vlanMembersCx[vid] = { tagged: [], untagged: [], name: name || ('vlan' + vid), svi_ip: '', svi_mask: '' };
        else if (name && _vlanMembersCx[vid].name.startsWith('vlan')) _vlanMembersCx[vid].name = name;
        return _vlanMembersCx[vid];
    };
    (ir.vlans || []).forEach(v => {
        const vl = _ensureV(v.id, v.name);
        if (v.svi_ip) { vl.svi_ip = v.svi_ip; vl.svi_mask = v.svi_mask; }
    });
    (ir.interfaces || []).forEach(f => {
        if (f.name.toLowerCase().startsWith('vlan')) {
            const vidM = (f.name.match(/(\d+)$/) || [])[1];
            const vid = parseInt(vidM, 10);
            if (vid && f.ip) {
                const vl = _ensureV(vid);
                vl.svi_ip = f.ip;
                vl.svi_mask = f.mask;
            }
            return;
        }
        const subifM = _isSubifCx(f.name) ? String(f.name).match(/^(.+)\.(\d+)$/) : null;
        if (subifM) {
            const vid = parseInt(subifM[2], 10);
            const vl = _ensureV(vid);
            if (vl.tagged.indexOf(subifM[1]) === -1) vl.tagged.push(subifM[1]);
            if (f.ip && !vl.svi_ip) { vl.svi_ip = f.ip; vl.svi_mask = f.mask; }
            return;
        }
        if (f.vlan_mode === 'access' && f.access_vlan) {
            const vl = _ensureV(f.access_vlan);
            if (vl.untagged.indexOf(f.name) === -1) vl.untagged.push(f.name);
        }
        if (f.vlan_mode === 'trunk') {
            const tvs = Array.isArray(f.trunk_vlans) ? f.trunk_vlans :
                        (f.trunk_vlans ? String(f.trunk_vlans).split(/[\s,]+/).map(Number).filter(Boolean) : []);
            tvs.forEach(vid => {
                const vl = _ensureV(vid);
                if (vl.tagged.indexOf(f.name) === -1) vl.tagged.push(f.name);
            });
            if (f.native_vlan) {
                const vl = _ensureV(f.native_vlan);
                if (vl.untagged.indexOf(f.name) === -1) vl.untagged.push(f.name);
            }
        }
    });
    const _cxVids = Object.keys(_vlanMembersCx).map(Number).sort((a, b) => a - b);
    _cxVids.forEach(vid => {
        const vl = _vlanMembersCx[vid];
        c += 'add vlan ' + vid + ' -aliasName ' + vl.name + '\n';
        vl.tagged.forEach(i =>   c += 'bind vlan ' + vid + ' -ifnum ' + i + ' -tagged\n');
        vl.untagged.forEach(i => c += 'bind vlan ' + vid + ' -ifnum ' + i + '\n');
    });
    if (_cxVids.length) c += '\n';

    // ── add ns ip (Subnet IP) + bind vlan -IPAddress ──────────────────────
    _cxVids.forEach(vid => {
        const vl = _vlanMembersCx[vid];
        if (!vl.svi_ip) return;
        const mask = vl.svi_mask || '255.255.255.0';
        c += 'add ns ip ' + vl.svi_ip + ' ' + mask + ' -type SNIP -vServer DISABLED -mgmtAccess DISABLED\n';
        c += 'bind vlan ' + vid + ' -IPAddress ' + vl.svi_ip + ' ' + mask + '\n';
    });
    if (_cxVids.some(vid => _vlanMembersCx[vid].svi_ip)) c += '\n';

    (ir.addressObjects||[]).forEach(a => {
        if (a.type==='host') c += 'add server ' + a.name + ' ' + a.value + '\n';
    });
    if (ir.addressObjects.length) c += '\n';
    (ir.monitors||[]).forEach(mon => {
        c += 'add lb monitor ' + mon.name + ' ' + (mon.type||'HTTP').toUpperCase() + '\n';
    });
    if (ir.monitors.length) c += '\n';
    (ir.pools||[]).forEach(pool => {
        c += 'add serviceGroup ' + pool.name + ' HTTP\n';
        (pool.members||[]).forEach(m => { c += 'bind serviceGroup ' + pool.name + ' ' + m.ip + ' ' + m.port + '\n'; });
    });
    if (ir.pools.length) c += '\n';
    (ir.virtualServers||[]).forEach(vs => {
        c += 'add lb vserver ' + vs.name + ' ' + (vs.proto||'HTTP').toUpperCase() + ' ' + (vs.vip||'0.0.0.0') + ' ' + (vs.port||'80') + '\n';
        if (vs.pool) c += 'bind lb vserver ' + vs.name + ' ' + vs.pool + '\n';
    });
    return c;
}
CC_WRITERS['citrix-adc'] = ccWriteCitrixADC;

function ccWriteMikroTik(ir) {
    let c = '# ======================================\n# MikroTik RouterOS — Converted Configuration\n# ======================================\n\n';
    if (ir.hostname) c += '/system identity set name=' + ir.hostname + '\n';

    // L2/bridge ihtiyacı tespit: vlan_mode access veya trunk olan herhangi
    // bir interface varsa → /interface bridge ekle ve member portları bağla.
    // Router L3 subinterface'ler (Gi0/0.10) bridge member değil — exclude.
    const _l2Ports = (ir.interfaces || []).filter(f =>
        !f.name.toLowerCase().startsWith('vlan') &&
        !ccGetWriterSubif(f) &&
        (f.vlan_mode === 'access' || f.vlan_mode === 'trunk' || f.trunk_vlans));
    const _hasL2 = _l2Ports.length > 0;

    if (_hasL2) {
        c += '/interface bridge\n';
        c += 'add name=bridge1 vlan-filtering=yes\n';
        c += '/interface bridge port\n';
        _l2Ports.forEach(f => {
            const pvid = (f.vlan_mode === 'access' ? f.access_vlan : f.native_vlan) || 1;
            const frame = f.vlan_mode === 'trunk' ? 'admit-only-vlan-tagged' :
                          f.vlan_mode === 'access' ? 'admit-only-untagged-and-priority-tagged' :
                          'admit-all';
            c += 'add bridge=bridge1 interface=' + f.name + ' pvid=' + pvid + ' frame-types=' + frame + '\n';
        });
        // VLAN üyelikleri (tagged/untagged) — bridge vlan tablosu
        const _vlanMembers = {}; // { vid: {tagged:[], untagged:[]} }
        _l2Ports.forEach(f => {
            if (f.vlan_mode === 'access' && f.access_vlan) {
                const v = f.access_vlan;
                _vlanMembers[v] = _vlanMembers[v] || { tagged: [], untagged: [] };
                _vlanMembers[v].untagged.push(f.name);
            }
            if (f.vlan_mode === 'trunk') {
                const tvs = Array.isArray(f.trunk_vlans) ? f.trunk_vlans :
                            (f.trunk_vlans ? String(f.trunk_vlans).split(/[\s,]+/).map(Number).filter(Boolean) : []);
                tvs.forEach(v => {
                    _vlanMembers[v] = _vlanMembers[v] || { tagged: [], untagged: [] };
                    _vlanMembers[v].tagged.push(f.name);
                });
                if (f.native_vlan) {
                    _vlanMembers[f.native_vlan] = _vlanMembers[f.native_vlan] || { tagged: [], untagged: [] };
                    _vlanMembers[f.native_vlan].untagged.push(f.name);
                }
            }
        });
        const _vids = Object.keys(_vlanMembers).map(Number).sort((a, b) => a - b);
        if (_vids.length) {
            c += '/interface bridge vlan\n';
            _vids.forEach(v => {
                const m = _vlanMembers[v];
                const parts = ['bridge=bridge1', 'vlan-ids=' + v];
                if (m.tagged.length)   parts.push('tagged='   + m.tagged.join(','));
                if (m.untagged.length) parts.push('untagged=' + m.untagged.join(','));
                c += 'add ' + parts.join(' ') + '\n';
            });
        }
    }

    // Ethernet seviyesi ayarlar: comment, mtu, disabled
    const _ethernetCfg = (ir.interfaces || []).filter(f =>
        !f.name.toLowerCase().startsWith('vlan') &&
        (f.desc || f.mtu || f.shutdown));
    if (_ethernetCfg.length) {
        c += '/interface ethernet\n';
        _ethernetCfg.forEach(f => {
            const parts = [];
            if (f.desc) parts.push('comment="' + f.desc.replace(/"/g, '\\"') + '"');
            if (f.mtu) parts.push('mtu=' + f.mtu);
            if (f.shutdown) parts.push('disabled=yes');
            else parts.push('disabled=no');
            c += 'set [find name="' + f.name + '"] ' + parts.join(' ') + '\n';
        });
    }

    // SVI / Vlan interface'ler → /interface vlan add
    // ir.vlans[].svi_ip ve ir.interfaces[].name="Vlan10" + ip aynı SVI'yı temsil
    // edebilir (Cisco reader her ikisini de doldurur). Tek seferde emit ederiz.
    const _emittedVlanIf = new Set();
    const _vlanIfaceFor = vid => 'vlan' + vid;
    const _bridgeOrEth1 = () => _hasL2 ? 'bridge1' :
        (((ir.interfaces || []).find(x => !x.name.toLowerCase().startsWith('vlan')) || {}).name || 'ether1');

    (ir.vlans || []).forEach(v => {
        if (v.svi_ip && !_emittedVlanIf.has(v.id)) {
            c += '/interface vlan add name=' + _vlanIfaceFor(v.id) +
                 ' vlan-id=' + v.id +
                 ' interface=' + _bridgeOrEth1() + '\n';
            _emittedVlanIf.add(v.id);
        }
    });
    (ir.interfaces || []).forEach(f => {
        if (!f.name.toLowerCase().startsWith('vlan')) return;
        const vid = parseInt((f.name.match(/(\d+)$/) || [])[1] || '', 10);
        if (!vid || _emittedVlanIf.has(vid)) return;
        c += '/interface vlan add name=' + _vlanIfaceFor(vid) +
             ' vlan-id=' + vid +
             ' interface=' + _bridgeOrEth1() + '\n';
        _emittedVlanIf.add(vid);
    });

    // IP adresleri (L3): ir.interfaces[] ile ir.vlans[].svi_ip dedupe edilir
    // Router L3 subinterface'ler için `/interface vlan add` emit (Sprint 22)
    const _emittedSubifVlan = new Set();
    (ir.interfaces || []).forEach(f => {
        const sub = ccGetWriterSubif(f);
        if (!sub) return;
        const key = sub.parent + '.' + sub.unit;
        if (_emittedSubifVlan.has(key)) return;
        _emittedSubifVlan.add(key);
        c += '/interface vlan add name=' + f.name +
             ' vlan-id=' + sub.encapsulation.vlan +
             ' interface=' + sub.parent + '\n';
        // QinQ inner — MikroTik tek vlan-id desteklediği için PARTIAL
        if (sub.encapsulation.type === 'qinq' && sub.encapsulation.qinq_inner) {
            ccDropField(ir, 'interface', f.name, '_subif.qinq_inner',
                sub.encapsulation.qinq_inner,
                'mikrotik-qinq-inner-not-emitted', 'mikrotik', CC_SEVERITY.PARTIAL);
        }
    });

    const _emittedIp = new Set();
    (ir.interfaces || []).forEach(f => {
        if (!f.ip) return;
        const isVlan = f.name.toLowerCase().startsWith('vlan');
        const vid = isVlan ? parseInt((f.name.match(/(\d+)$/) || [])[1] || '', 10) : null;
        const iface = isVlan && vid ? _vlanIfaceFor(vid) : f.name;
        const key = f.ip + '|' + iface;
        if (_emittedIp.has(key)) return;
        _emittedIp.add(key);
        c += '/ip address add address=' + f.ip + '/' + ccMaskToPrefix(f.mask) + ' interface=' + iface + '\n';
    });
    (ir.vlans || []).forEach(v => {
        if (!v.svi_ip) return;
        const iface = _vlanIfaceFor(v.id);
        const key = v.svi_ip + '|' + iface;
        if (_emittedIp.has(key)) return;
        _emittedIp.add(key);
        c += '/ip address add address=' + v.svi_ip + '/' + ccMaskToPrefix(v.svi_mask) +
             ' interface=' + iface + '\n';
    });

    // Statik rotalar
    ir.routes.forEach(r => {
        c += '/ip route add dst-address=' + r.network + '/' + ccMaskToPrefix(r.mask) + ' gateway=' + r.nexthop + '\n';
    });

    // Unsupported alanları lostFields'a düşür
    (ir.interfaces || []).forEach(f => {
        if (f.voice_vlan)      ccDropField(ir, 'interface', f.name, 'voice_vlan',      f.voice_vlan,      'mikrotik-no-voice-vlan',     'mikrotik');
        if (f.port_security && f.port_security.enabled)
                               ccDropField(ir, 'interface', f.name, 'port_security',   f.port_security,   'mikrotik-no-port-security',  'mikrotik');
        if (f.edge_port)       ccDropField(ir, 'interface', f.name, 'edge_port',       f.edge_port,       'mikrotik-stp-different',     'mikrotik');
        if (f.bpdu_guard)      ccDropField(ir, 'interface', f.name, 'bpdu_guard',      f.bpdu_guard,      'mikrotik-stp-different',     'mikrotik');
        if (f.dhcp_snoop_trust)ccDropField(ir, 'interface', f.name, 'dhcp_snoop_trust',f.dhcp_snoop_trust,'mikrotik-no-dhcp-snooping',  'mikrotik');
        if (f.service_policy)  ccDropField(ir, 'interface', f.name, 'service_policy',  f.service_policy,  'mikrotik-qos-model-different','mikrotik');
        if (f.bfd)             ccDropField(ir, 'interface', f.name, 'bfd',             f.bfd,             'mikrotik-bfd-routing-only',  'mikrotik');
    });

    return c;
}
CC_WRITERS['mikrotik'] = ccWriteMikroTik;
