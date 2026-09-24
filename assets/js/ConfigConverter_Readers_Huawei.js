'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Huawei VRP Reader ─────────────────────────────────────────────────────────
function ccReadHuaweiVRP(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'huawei-vrp';

    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    let m;

    // Helper: is this line a top-level block boundary?
    // Huawei: indented line = sub-cmd, non-indented = top-level
    function isTopLevel(raw) {
        if (!raw || !raw.length) return false;
        // Indented lines (with leading whitespace) are always sub-commands
        if (/^\s/.test(raw)) return false;
        // Otherwise treat as top-level boundary (anything starting at col 0)
        return true;
    }

    // Parse a "vlan batch" spec and return array of VLAN IDs
    function parseVlanBatch(spec) {
        const ids = [];
        const parts = spec.trim().split(/\s+/);
        let k = 0;
        while (k < parts.length) {
            if (parts[k + 1] === 'to' && parts[k + 2]) {
                const from = parseInt(parts[k]), to = parseInt(parts[k + 2]);
                for (let v = from; v <= to; v++) ids.push(v);
                k += 3;
            } else {
                const n = parseInt(parts[k]);
                if (!isNaN(n)) ids.push(n);
                k++;
            }
        }
        return ids;
    }

    while (i < lines.length) {
        const line = lines[i].trim();

        // ── Hostname ──────────────────────────────────────────────────────────
        if (line.startsWith('sysname ')) {
            ir.hostname = line.slice(8).trim();

        // ── System: DNS / NTP / Syslog / SNMP ────────────────────────────────
        } else if (line.startsWith('dns resolve-server ')) {
            const ip = line.slice(19).trim().split(/\s+/)[0];
            if (ip) ir.system.dns.push(ip);

        } else if (line.startsWith('ntp-service unicast-server ')) {
            const ip = line.slice(27).trim().split(/\s+/)[0];
            if (ip) ir.system.ntp.push(ip);

        } else if (line.startsWith('info-center loghost ')) {
            const ip = line.slice(20).trim().split(/\s+/)[0];
            if (ip) ir.system.syslog.push(ip);

        } else if (line.startsWith('snmp-agent community ')) {
            // snmp-agent community read|write STRING [acl ...]
            const m2 = line.match(/^snmp-agent community (read|write)\s+(\S+)/);
            if (m2) {
                ir.system.snmp = { community: m2[2], access: m2[1] === 'write' ? 'rw' : 'ro' };
            }

        } else if ((m = line.match(/^snmp-agent group v3 (\S+)(?:\s+(noauthentication|authentication|privacy))?/i))) {
            ir.system.snmp_v3_groups = ir.system.snmp_v3_groups || [];
            if (!ir.system.snmp_v3_groups.find(g => g.name === m[1])) {
                const sl = (m[2] || 'auth').toLowerCase();
                const norm = sl === 'privacy' ? 'priv' : sl === 'authentication' ? 'auth' : 'noauth';
                ir.system.snmp_v3_groups.push({ name: m[1], sec_level: norm });
            }

        } else if ((m = line.match(/^snmp-agent usm-user v3 (\S+)(?:\s+(?!auth\b|privacy\b)(\S+))?\s+auth (sha|md5) (\S+)/i))) {
            // syntax-1: snmp-agent usm-user v3 USER [GROUP] auth sha PWD
            // syntax-2: snmp-agent usm-user v3 USER auth sha PWD (group separate)
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: m[2] || '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            if (m[2]) u.group = m[2];
            u.auth_proto = m[3].toLowerCase(); u.auth_pwd = m[4];

        } else if ((m = line.match(/^snmp-agent usm-user v3 (\S+)(?:\s+(?!authentication-mode\b|privacy-mode\b)(\S+))?\s+authentication-mode (sha|md5) (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: m[2] || '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            if (m[2]) u.group = m[2];
            u.auth_proto = m[3].toLowerCase(); u.auth_pwd = m[4];

        } else if ((m = line.match(/^snmp-agent usm-user v3 (\S+)(?:\s+(?!privacy\b|auth\b)(\S+))?\s+privacy (aes128|aes192|aes256|des56|3des) (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: m[2] || '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            if (m[2]) u.group = m[2];
            u.priv_proto = m[3].toLowerCase(); u.priv_pwd = m[4];

        } else if ((m = line.match(/^snmp-agent usm-user v3 (\S+)(?:\s+(?!privacy-mode\b|authentication-mode\b)(\S+))?\s+privacy-mode (aes128|aes192|aes256|des56|3des) (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: m[2] || '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            if (m[2]) u.group = m[2];
            u.priv_proto = m[3].toLowerCase(); u.priv_pwd = m[4];

        } else if ((m = line.match(/^snmp-agent usm-user v3 (\S+) (\S+)$/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) ir.system.snmp_v3_users.push({ user: m[1], group: m[2], auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' });
            else if (!u.group) u.group = m[2];

        } else if (line === 'dhcp enable' || line === 'dhcp snooping enable') {
            ir.dhcpSnooping = ir.dhcpSnooping || {};
            ir.dhcpSnooping.enabled = true;

        } else if (line.startsWith('dhcp snooping vlan ')) {
            ir.dhcpSnooping = ir.dhcpSnooping || { enabled: true };
            ir.dhcpSnooping.vlans = ccParseTrunkVlanStr(line.slice(19));

        } else if ((m = line.match(/^jumboframe enable (\d+)/i))) {
            ir.system.jumbo_mtu = parseInt(m[1]);

        } else if ((m = line.match(/^observe-port (\d+) interface (\S+)/i))) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.id === parseInt(m[1]));
            if (!sess) { sess = { id: parseInt(m[1]), sources: [], destination: m[2] }; ir.monitorSessions.push(sess); }
            else sess.destination = m[2];

        } else if ((m = line.match(/^traffic classifier (\S+)/i))) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const cm = { name: m[1], match_type: 'any', match_dscp: '', match_acl: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^if-match dscp (\S+)/))) cm.match_dscp = mm[1];
                else if ((mm = sub.match(/^if-match acl (\S+)/))) cm.match_acl = mm[1];
                i++;
            }
            ir.qos.classMaps.push(cm);
            continue;

        } else if ((m = line.match(/^traffic behavior (\S+)/i))) {
            ir._qosBehaviors = ir._qosBehaviors || {};
            const b = { name: m[1], action: '', priority_pct: 0 };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^car cir (\d+)/i))) { b.action = 'bandwidth'; b.cir_kbps = parseInt(mm[1]); }
                else if (sub === 'permit' || sub === 'priority') b.action = 'priority';
                i++;
            }
            ir._qosBehaviors[b.name] = b;
            continue;

        } else if ((m = line.match(/^traffic policy (\S+)/i))) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const pm = { name: m[1], classes: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^classifier (\S+) behavior (\S+)/i))) {
                    const beh = (ir._qosBehaviors || {})[mm[2]] || { action: '' };
                    pm.classes.push({ name: mm[1], action: beh.action || 'priority', priority_pct: beh.cir_kbps ? Math.round(beh.cir_kbps / 1000) : 0, fair_queue: false });
                }
                i++;
            }
            ir.qos.policyMaps.push(pm);
            continue;

        } else if ((m = line.match(/^policy-based-route (\S+) (permit|deny) node (\d+)/i))) {
            ir.routeMaps = ir.routeMaps || [];
            const rm = { name: m[1], action: m[2], seq: parseInt(m[3]), match_acl: '', set_next_hop: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^if-match acl (\S+)/i))) rm.match_acl = mm[1];
                else if ((mm = sub.match(/^apply ip-address next-hop ([\d.]+)/i))) rm.set_next_hop = mm[1];
                i++;
            }
            ir.routeMaps.push(rm);
            continue;

        } else if ((m = line.match(/^nqa test-instance \S+ (\S+)/i))) {
            ir.ipSla = ir.ipSla || [];
            const sla = { id: ir.ipSla.length + 1, name: m[1], type: '', target: '', source_iface: '', frequency: 60 };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^test-type (\S+)/i))) sla.type = mm[1].toLowerCase() === 'icmp' ? 'icmp-echo' : mm[1];
                else if ((mm = sub.match(/^destination-address ipv4 ([\d.]+)/i))) sla.target = mm[1];
                else if ((mm = sub.match(/^source-interface (\S+)/i))) sla.source_iface = mm[1];
                else if ((mm = sub.match(/^frequency (\d+)/i))) sla.frequency = parseInt(mm[1]);
                i++;
            }
            ir.ipSla.push(sla);
            continue;

        } else if ((m = line.match(/^ospf (\d+)(?: router-id ([\d.]+))?/i))) {
            const proc = { process_id: m[1], router_id: m[2] || '', areas: [], bfd_all_interfaces: false };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if (sub === 'bfd all-interfaces enable') proc.bfd_all_interfaces = true;
                else if ((mm = sub.match(/^router-id ([\d.]+)/i))) proc.router_id = mm[1];
                else if ((mm = sub.match(/^area ([\d.]+)/i))) {
                    const areaId = mm[1];
                    let area = proc.areas.find(a => a.id === areaId);
                    if (!area) { area = { id: areaId, networks: [], auth: '' }; proc.areas.push(area); }
                    i++;
                    while (i < lines.length && lines[i].match(/^\s+/)) {
                        const sub2 = lines[i].trim();
                        let nm;
                        if (/^area\s+/i.test(sub2)) break;
                        if ((nm = sub2.match(/^network ([\d.]+) ([\d.]+)/i))) {
                            const wm = nm[2].split('.').map(o => 255 - parseInt(o)).join('.');
                            const prefix = ccMaskToPrefix(wm);
                            area.networks.push(nm[1] + '/' + prefix);
                        }
                        i++;
                    }
                    continue;
                }
                i++;
            }
            ir.ospf.push(proc);
            continue;

        } else if ((m = line.match(/^bgp (\d+)/i))) {
            const bgp = { as_number: m[1], router_id: '', neighbors: [], networks: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^router-id ([\d.]+)/i))) bgp.router_id = mm[1];
                else if ((mm = sub.match(/^peer ([\d.]+) as-number (\d+)/i))) {
                    let nb = bgp.neighbors.find(n => n.ip === mm[1]);
                    if (!nb) { nb = { ip: mm[1], remote_as: mm[2], desc: '' }; bgp.neighbors.push(nb); }
                    else nb.remote_as = mm[2];
                }
                else if ((mm = sub.match(/^peer ([\d.]+) bfd enable/i))) {
                    let nb = bgp.neighbors.find(n => n.ip === mm[1]);
                    if (!nb) { nb = { ip: mm[1], remote_as: '', desc: '', bfd: true }; bgp.neighbors.push(nb); }
                    else nb.bfd = true;
                }
                else if ((mm = sub.match(/^network ([\d.]+) ([\d.]+)/i))) {
                    const prefix = mm[2].includes('.') ? ccMaskToPrefix(mm[2]) : parseInt(mm[2]);
                    bgp.networks.push(mm[1] + '/' + prefix);
                }
                i++;
            }
            ir.bgp = bgp;
            continue;

        } else if (line.startsWith('stp mode ')) {
            const stpMode = line.slice(9).trim();
            ir.spanningTree.mode = /rstp/.test(stpMode) ? 'rstp'
                                 : /mstp/.test(stpMode) ? 'mstp'
                                 : /stp/.test(stpMode) ? 'stp'
                                 : stpMode;

        // ── Interface ─────────────────────────────────────────────────────────
        } else if (line.startsWith('interface ')) {
            const ifName = line.slice(10).trim();
            const isBundle = /^Eth-Trunk\d+/i.test(ifName);
            const iface = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            // Router subif name'inden auto-populate (Gi0/0/1.100 vb.)
            const _hwSubifParsed = ccParseSubifName(ifName);
            if (_hwSubifParsed) {
                iface.access_vlan = _hwSubifParsed.unit;
                iface._subif = ccBuildSubif(_hwSubifParsed.parent, _hwSubifParsed.unit, _hwSubifParsed.unit);
            }
            i++;
            while (i < lines.length) {
                const raw = lines[i];
                if (isTopLevel(raw)) break;
                const sub = raw.trim();
                if (!sub) { i++; continue; }
                if (sub.startsWith('ip address ')) { const p = sub.slice(11).split(' '); iface.ip = p[0]; iface.mask = p[1] || ''; }
                else if (sub.startsWith('description ')) { iface.desc = sub.slice(12); }
                else if (sub === 'shutdown') { iface.shutdown = true; }
                else if ((m = sub.match(/^dot1q\s+termination\s+vid\s+(\d+)(\s+ce-vid\s+(\d+))?/i))) {
                    // Huawei VRP L3 subif tag — single tag veya QinQ (ce-vid inner)
                    const _vid = parseInt(m[1], 10);
                    const _inner = m[3] ? parseInt(m[3], 10) : null;
                    iface.access_vlan = _vid;
                    if (_inner) iface._qinqInner = _inner;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(
                        _p ? _p.parent : iface.name,
                        _p ? _p.unit : _vid,
                        _vid,
                        { type: _inner ? 'qinq' : 'dot1q', qinq_inner: _inner });
                }
                else if ((m = sub.match(/^qinq\s+termination\s+l2\s+(\d+)\s+(\d+)/i))) {
                    // Huawei QinQ termination
                    const _outer = parseInt(m[1], 10);
                    const _inner = parseInt(m[2], 10);
                    iface.access_vlan = _outer;
                    iface._qinqInner = _inner;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(
                        _p ? _p.parent : iface.name,
                        _p ? _p.unit : _outer,
                        _outer,
                        { type: 'qinq', qinq_inner: _inner });
                }
                else if (sub === 'arp broadcast enable' && iface._subif) {
                    iface._subif.encapsulation.native = true;
                    iface.native_vlan = iface._subif.encapsulation.vlan;
                }
                else if (sub === 'port link-type access') { iface.vlan_mode = 'access'; }
                else if (sub === 'port link-type trunk') { iface.vlan_mode = 'trunk'; }
                else if (sub.startsWith('port default vlan ')) { iface.access_vlan = parseInt(sub.slice(18)); }
                else if (sub.startsWith('port trunk pvid vlan ')) { iface.native_vlan = parseInt(sub.slice(21)); }
                else if (sub.startsWith('port trunk allow-pass vlan ')) { iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(27).trim()); }
                else if ((m = sub.match(/^voice-vlan\s+(\d+)\s+enable/))) { iface.voice_vlan = parseInt(m[1]); }
                else if (sub.startsWith('traffic-filter ')) { const m2 = sub.match(/^traffic-filter\s+(inbound|outbound)\s+acl\s+(?:name\s+)?(\S+)/); if (m2) { if (m2[1] === 'inbound') iface._aclIn = m2[2]; else iface._aclOut = m2[2]; } }
                else if (sub === 'stp edged-port enable') { iface.edge_port = true; }
                else if (sub === 'stp bpdu-protection') { iface.bpdu_guard = true; }
                else if (sub === 'port-security enable') { iface.port_security = Object.assign(iface.port_security || {}, { enabled: true }); }
                else if (sub.startsWith('port-security max-mac-num ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { max: parseInt(sub.slice(26)) }); }
                else if (sub.startsWith('port-security protect-action ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { violation: sub.slice(29).trim() }); }
                else if (sub === 'port-security mac-address sticky') { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { sticky: true }); }
                else if (sub === 'dhcp snooping trusted') { iface.dhcp_snoop_trust = true; }
                else if ((m = sub.match(/^mtu\s+(\d+)/))) { iface.mtu = parseInt(m[1]); }
                else if ((m = sub.match(/^jumboframe enable (\d+)/i))) { iface.mtu = parseInt(m[1]); }
                else if (sub === 'jumboframe enable') { iface.mtu = 9216; }
                else if (sub === 'undo portswitch') { iface.no_switchport = true; }
                else if (sub === 'bfd enable') { iface.bfd = { enabled: true }; }
                else if ((m = sub.match(/^vrrp vrid (\d+) virtual-ip ([\d.]+)/i))) {
                    iface._vrrp = iface._vrrp || {};
                    iface._vrrp[m[1]] = iface._vrrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._vrrp[m[1]].virtual_ip = m[2];
                }
                else if ((m = sub.match(/^vrrp vrid (\d+) priority (\d+)/i))) {
                    iface._vrrp = iface._vrrp || {};
                    iface._vrrp[m[1]] = iface._vrrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._vrrp[m[1]].priority = parseInt(m[2]);
                }
                else if ((m = sub.match(/^vrrp vrid (\d+) preempt-mode/i))) {
                    iface._vrrp = iface._vrrp || {};
                    iface._vrrp[m[1]] = iface._vrrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._vrrp[m[1]].preempt = true;
                }
                else if ((m = sub.match(/^ip policy-based-route (\S+)/i))) { iface.pbr_route_map = m[1]; }
                else if ((m = sub.match(/^traffic-policy (\S+) (inbound|outbound)/i))) {
                    iface.service_policy = iface.service_policy || {};
                    iface.service_policy[m[2] === 'outbound' ? 'output' : 'input'] = m[1];
                }
                else if ((m = sub.match(/^port-mirroring to observe-port (\d+)(?: (both|inbound|outbound))?/i))) {
                    iface._mirror_observe = parseInt(m[1]);
                    iface._mirror_dir = m[2] || 'both';
                }
                else if (sub.startsWith('mode lacp-static')) { iface._bundleMode = 'lacp-active'; }
                else if (sub.startsWith('mode lacp')) { iface._bundleMode = 'lacp-active'; }
                else if (sub === 'mode manual' || sub === 'mode manual load-balance') { iface._bundleMode = 'static'; }
                else if ((m = sub.match(/^eth-trunk\s+(\d+)/))) {
                    iface._bundleId = parseInt(m[1]);
                }
                i++;
            }
            // Huawei range syntax: "interface GigabitEthernet0/0/1 to GigabitEthernet0/0/10"
            // ya da "GigabitEthernet0/0/1 to 10" → tek tek expand et
            const rangeMatch = ifName.match(/^(\S+?)(\d+(?:\/\d+)*)\s+to\s+(?:\S*?)(\d+(?:\/\d+)*)$/i);
            if (rangeMatch && !isBundle) {
                const expanded = ccExpandCiscoRange(rangeMatch[1] + rangeMatch[2] + ' - ' + rangeMatch[3]);
                expanded.forEach(name => {
                    const ifc = Object.assign({}, iface, { name });
                    ir.interfaces.push(ifc);
                    if (iface._bundleId !== undefined) {
                        const b = ccEnsureBundle(ir, iface._bundleId);
                        if (!b.members.includes(name)) b.members.push(name);
                    }
                });
                continue;
            }

            if (isBundle) {
                const bid = parseInt(ifName.replace(/^Eth-Trunk/i, ''));
                const b = ccEnsureBundle(ir, bid);
                if (iface.desc) b.desc = iface.desc;
                if (iface.ip) { b.ip = iface.ip; b.mask = iface.mask; }
                if (iface.vlan_mode) b.vlan_mode = iface.vlan_mode;
                if (iface.access_vlan) b.access_vlan = iface.access_vlan;
                if (iface.native_vlan) b.native_vlan = iface.native_vlan;
                if (iface.trunk_vlans) b.trunk_vlans = iface.trunk_vlans;
                if (iface.edge_port) b.edge_port = true;
                if (iface.mtu) b.mtu = iface.mtu;
                if (iface._bundleMode) b.mode = iface._bundleMode;
                if (iface._aclIn) b._aclIn = iface._aclIn;
                if (iface._aclOut) b._aclOut = iface._aclOut;
            } else {
                ir.interfaces.push(iface);
                if (iface._bundleId !== undefined) {
                    const b = ccEnsureBundle(ir, iface._bundleId);
                    if (!b.members.includes(iface.name)) b.members.push(iface.name);
                }
            }
            continue;

        // ── VLAN batch ────────────────────────────────────────────────────────
        } else if (line.startsWith('vlan batch ')) {
            const ids = parseVlanBatch(line.slice(11));
            ids.forEach(id => {
                if (!ir.vlans.find(v => v.id === id)) ir.vlans.push({ id, name: '', svi_ip: '', svi_mask: '' });
            });

        // ── VLAN single ───────────────────────────────────────────────────────
        } else if (line.startsWith('vlan ') && !isNaN(line.slice(5).trim())) {
            const vlan = { id: parseInt(line.slice(5)), name: '', svi_ip: '', svi_mask: '' };
            i++;
            while (i < lines.length) {
                const raw = lines[i];
                if (isTopLevel(raw)) break;
                const sub = raw.trim();
                if (!sub) { i++; continue; }
                if (sub.startsWith('name ')) vlan.name = sub.slice(5);
                else if (sub.startsWith('description ')) vlan.name = vlan.name || sub.slice(12);
                i++;
            }
            if (!ir.vlans.find(v => v.id === vlan.id)) ir.vlans.push(vlan);
            else { const existing = ir.vlans.find(v => v.id === vlan.id); if (vlan.name) existing.name = vlan.name; }
            continue;

        // ── Static routes ─────────────────────────────────────────────────────
        } else if (line.startsWith('ip route-static ')) {
            const p = line.slice(16).split(' ');
            ir.routes.push({ network: p[0] || '', mask: p[1] || '', nexthop: p[2] || '', metric: p[3] || '1', iface: '' });

        // ── ACL ───────────────────────────────────────────────────────────────
        } else if (line.startsWith('acl ')) {
            // acl number 3000  |  acl number 3000 name MY_ACL  |  acl name MY_ACL
            const nameM = line.match(/^acl (?:number )?\S+ name (\S+)/) || line.match(/^acl name (\S+)/);
            const numM  = line.match(/^acl (?:number )?(\S+)/);
            const aclId = nameM ? nameM[1] : (numM ? numM[1] : null);
            if (aclId) ir.acls.push({ name: aclId, entries: [] });

        } else if (line.startsWith('rule ') && ir.acls.length) {
            // rule 5 permit tcp source 192.168.1.0 0.0.0.255 destination 10.1.1.10 0 destination-port eq 443
            // Huawei'de iki ACL bicimi var:
            //   basic    (2000-2999): rule 5 permit source 10.0.0.1 0
            //   advanced (3000-3999): rule 5 permit tcp source ... destination ...
            // Basic'te protokol alani YOKTUR. Eski regex 'source' kelimesini protokol
            // sanip src/dst'yi 'any' birakiyordu (fail-open); protokolsuz 'rule 35 deny'
            // ise hic eslesmeyip tamamen dusuyordu.
            const m = line.match(/^rule \d+ (permit|deny)(?:\s+(.*))?$/);
            if (m) {
                const last = ir.acls[ir.acls.length - 1];
                let _tail = (m[2] || '').trim();
                const _kw = /^(source|destination|destination-port|source-port|icmp-type|logging|time-range|vpn-instance|fragment|ttl|dscp|tos|precedence)\b/i;
                let _proto = 'ip';
                if (_tail && !_kw.test(_tail)) {
                    const _sp = _tail.indexOf(' ');
                    _proto = _sp === -1 ? _tail : _tail.slice(0, _sp);
                    _tail  = _sp === -1 ? ''    : _tail.slice(_sp + 1).trim();
                }
                const rest = _tail;
                const srcM  = rest.match(/source\s+(any|[\d.]+)(?:\s+([\d.]+))?/);
                const dstM  = rest.match(/destination\s+(any|[\d.]+)(?:\s+([\d.]+))?/);
                const dportM = rest.match(/destination-port\s+(?:eq\s+)?(\S+)/);
                const sportM = rest.match(/source-port\s+(?:eq\s+)?(\S+)/);
                let src = 'any', dst = 'any';
                if (srcM && srcM[1] !== 'any') {
                    const wc = srcM[2];
                    src = (!wc || wc === '0' || wc === '0.0.0.0') ? 'host ' + srcM[1] : srcM[1] + ' ' + wc;
                }
                if (dstM && dstM[1] !== 'any') {
                    const wc = dstM[2];
                    dst = (!wc || wc === '0' || wc === '0.0.0.0') ? 'host ' + dstM[1] : dstM[1] + ' ' + wc;
                }
                last.entries.push({
                    action: m[1], proto: _proto, src,
                    src_port: sportM ? 'eq ' + sportM[1] : '',
                    dst, dst_port: dportM ? 'eq ' + dportM[1] : ''
                });
            }

        // ── OSPF ──────────────────────────────────────────────────────────────
        // ospf PROC_ID [router-id X.X.X.X]
        //  area AREA_ID
        //   network NET MASK
        } else if (line.startsWith('ospf ')) {
            const ospfM = line.match(/^ospf\s+(\d+)(?:\s+router-id\s+(\S+))?/);
            if (ospfM) {
                const proc = { process_id: parseInt(ospfM[1]), router_id: ospfM[2] || '', areas: [] };
                i++;
                let currentArea = null;
                while (i < lines.length) {
                    const raw = lines[i];
                    // OSPF block ends at unindented top-level keyword or '#' / 'return'
                    if (isTopLevel(raw)) break;
                    const sub = raw.trim();
                    if (!sub) { i++; continue; }
                    const areaM = sub.match(/^area\s+(\S+)/);
                    if (areaM) {
                        currentArea = { id: areaM[1], networks: [] };
                        proc.areas.push(currentArea);
                    } else if (sub.startsWith('network ') && currentArea) {
                        const nm = sub.match(/^network\s+(\S+)\s+(\S+)/);
                        if (nm) {
                            const prefix = ccMaskToPrefix(nm[2]);
                            currentArea.networks.push(nm[1] + '/' + prefix);
                        }
                    }
                    i++;
                }
                ir.ospf.push(proc);
            }
            continue;

        // ── BGP ───────────────────────────────────────────────────────────────
        // bgp AS_NUM
        //  router-id X.X.X.X
        //  peer IP as-number REMOTE_AS
        //  peer IP description DESC
        //  network NET MASK
        } else if (line.startsWith('bgp ')) {
            const bgpM = line.match(/^bgp\s+(\d+)/);
            if (bgpM) {
                const bgpObj = { as_number: parseInt(bgpM[1]), router_id: '', neighbors: [], networks: [] };
                i++;
                while (i < lines.length) {
                    const raw = lines[i];
                    if (isTopLevel(raw)) break;
                    const sub = raw.trim();
                    if (!sub) { i++; continue; }
                    const ridM = sub.match(/^router-id\s+(\S+)/);
                    if (ridM) { bgpObj.router_id = ridM[1]; i++; continue; }
                    const peerAsM = sub.match(/^peer\s+(\S+)\s+as-number\s+(\d+)/);
                    if (peerAsM) {
                        let nbr = bgpObj.neighbors.find(n => n.ip === peerAsM[1]);
                        if (!nbr) { nbr = { ip: peerAsM[1], remote_as: parseInt(peerAsM[2]), desc: '' }; bgpObj.neighbors.push(nbr); }
                        else { nbr.remote_as = parseInt(peerAsM[2]); }
                        i++; continue;
                    }
                    const peerDescM = sub.match(/^peer\s+(\S+)\s+description\s+(.*)/);
                    if (peerDescM) {
                        let nbr = bgpObj.neighbors.find(n => n.ip === peerDescM[1]);
                        if (!nbr) { nbr = { ip: peerDescM[1], remote_as: 0, desc: peerDescM[2].trim() }; bgpObj.neighbors.push(nbr); }
                        else { nbr.desc = peerDescM[2].trim(); }
                        i++; continue;
                    }
                    const netM = sub.match(/^network\s+(\S+)\s+(\S+)/);
                    if (netM) {
                        const prefix = ccMaskToPrefix(netM[2]);
                        bgpObj.networks.push(netM[1] + '/' + prefix);
                        i++; continue;
                    }
                    i++;
                }
                ir.bgp = bgpObj;
            }
            continue;

        // ── Unknowns ──────────────────────────────────────────────────────────
        } else if (line && !line.startsWith('#') && line !== 'return' && !/^(system-view|quit|save(\s+.*)?|display\s+.*|undo\s+terminal|user-interface|header\s+(login|shell)|snmp-agent(\s+.*)?|ntp-service\s+enable)$/i.test(line)) {
            ir.unknowns.push(line);
        }
        i++;
    }

    // Merge SVI IPs into VLAN list; vlan tanımlı değilse oluştur
    // VRRP / PBR'ı SVI'dan çıkar
    ir.vrrp = ir.vrrp || [];
    ir.interfaces.forEach(ifc => {
        if (ifc.name.toLowerCase().startsWith('vlanif')) {
            const vid = parseInt(ifc.name.slice(6));
            if (isNaN(vid)) return;
            let vlan = ir.vlans.find(v => v.id === vid);
            if (!vlan) { vlan = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }
            if (ifc.ip) { vlan.svi_ip = ifc.ip; vlan.svi_mask = ifc.mask; }
            if (ifc._vrrp) {
                Object.values(ifc._vrrp).forEach(v => {
                    ir.vrrp.push({ vlan_id: vid, group_id: v.group_id, virtual_ip: v.virtual_ip || '', priority: v.priority || 100, preempt: !!v.preempt });
                });
                delete ifc._vrrp;
            }
            if (ifc.pbr_route_map) vlan.pbr_route_map = ifc.pbr_route_map;
        }
    });
    // port-mirroring kaynak portları: source interface → observe-port destination
    ir.interfaces.forEach(ifc => {
        if (ifc._mirror_observe !== undefined) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.id === ifc._mirror_observe);
            if (!sess) { sess = { id: ifc._mirror_observe, sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            sess.sources.push({ name: ifc.name, direction: ifc._mirror_dir || 'both' });
            delete ifc._mirror_observe;
            delete ifc._mirror_dir;
        }
    });
    delete ir._qosBehaviors;

    return ir;
}
// Backward-compatibility alias
const ccReadHuawei = ccReadHuaweiVRP;

CC_READERS['huawei-vrp'] = ccReadHuaweiVRP;
CC_READERS['huawei']     = ccReadHuaweiVRP;

// ── Huawei USG Reader ─────────────────────────────────────────────────────────
function ccReadHuaweiUSG(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'huawei-usg';
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#') || line === 'return') { i++; continue; }

        if (line.startsWith('sysname ')) {
            ir.hostname = line.slice(8).trim();

        } else if (line.startsWith('firewall zone ') || line.startsWith('zone ')) {
            const zm = line.match(/(?:firewall zone|zone) (\S+)/);
            const zoneName = zm ? zm[1] : '';
            if (zoneName) {
                const zone = { name: zoneName, interfaces: [], description: '', trust_level: 0 };
                i++;
                while (i < lines.length) {
                    const raw = lines[i];
                    // top-level boundary: unindented non-empty line
                    if (raw.trim() && raw === raw.trimStart() && !/^(add interface|set priority|description)/.test(raw.trim())) break;
                    const sub = raw.trim();
                    if (!sub) { i++; continue; }
                    if (sub.startsWith('add interface ')) zone.interfaces.push(sub.slice(14).trim());
                    else if (sub.startsWith('set priority ')) zone.trust_level = parseInt(sub.slice(13)) || 0;
                    i++;
                }
                ir.zones.push(zone);
                continue;
            }

        } else if (line.startsWith('ip address-set ')) {
            const m = line.match(/^ip address-set (\S+) type (object|group)/);
            if (m) {
                const obj = { name: m[1], type: m[2] === 'object' ? 'network' : 'group', value: '', mask: '', members: [], description: '' };
                i++;
                while (i < lines.length) {
                    const raw = lines[i];
                    if (raw.trim() && raw === raw.trimStart() && !/^(address\s|description)/.test(raw.trim())) break;
                    const sub = raw.trim();
                    if (!sub) { i++; continue; }
                    const am = sub.match(/^address [\d.]+ ([\d.]+) ([\d.]+)/);
                    if (am) { obj.value = am[1]; obj.mask = am[2]; }
                    const gm = sub.match(/^address-set (\S+)/);
                    if (gm) obj.members.push(gm[1]);
                    i++;
                }
                ir.addressObjects.push(obj);
                continue;
            }

        } else if (line === 'security-policy') {
            i++;
            while (i < lines.length) {
                const raw = lines[i];
                const sub = raw.trim();
                // security-policy block ends at unindented top-level keyword
                if (sub && raw === raw.trimStart() && sub !== 'security-policy' && !sub.startsWith('rule ')) break;
                if (sub.startsWith('rule name ')) {
                    const pol = { name: sub.slice(10).trim(), seq: ir.securityPolicies.length + 1, srcZone: '', dstZone: '', srcAddr: [], dstAddr: [], service: [], action: 'allow', log: true, schedule: 'always', profile: {} };
                    i++;
                    while (i < lines.length && lines[i].match(/^\s+/)) {
                        const s = lines[i].trim();
                        if (s.startsWith('source-zone ')) pol.srcZone = s.slice(12).trim();
                        else if (s.startsWith('destination-zone ')) pol.dstZone = s.slice(17).trim();
                        else if (s.startsWith('source-address address-set ')) pol.srcAddr.push(s.slice(27).trim());
                        else if (s.startsWith('destination-address address-set ')) pol.dstAddr.push(s.slice(32).trim());
                        else if (s.startsWith('service ')) pol.service.push(s.slice(8).trim());
                        else if (s.startsWith('action ')) pol.action = s.slice(7).trim() === 'permit' ? 'allow' : 'deny';
                        i++;
                    }
                    ir.securityPolicies.push(pol);
                    continue;
                }
                i++;
            }
            continue;
        }
        i++;
    }
    return ir;
}
CC_READERS['huawei-usg'] = ccReadHuaweiUSG;

CC_READERS['huawei-ce'] = ccReadHuaweiVRP;
