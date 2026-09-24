'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ─── Arista EOS Reader ───────────────────────────────────────────────────────
function ccReadAristaEOS(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'arista-eos';
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    let m;
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.startsWith('!')) { i++; continue; }

        if (line.startsWith('hostname ')) {
            ir.hostname = line.slice(9).trim();
        } else if (line === 'ip routing') {
            // feature flag — ignore
        } else if (line.startsWith('ip name-server ')) {
            ir.system.dns.push(line.slice(15).trim());
        } else if (line.startsWith('ntp server ')) {
            ir.system.ntp.push(line.split(/\s+/)[2] || '');
        } else if (line.startsWith('logging host ')) {
            ir.system.syslog.push(line.split(/\s+/)[2] || '');
        } else if (line.startsWith('interface ')) {
            const iface = { name: line.slice(10).trim(), ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', type: 'physical' };
            // Arista subif name (Ethernet1.10) auto-populate
            const _arSubM = ccParseSubifName(iface.name);
            if (_arSubM) {
                iface.access_vlan = _arSubM.unit;
                iface._subif = ccBuildSubif(_arSubM.parent, _arSubM.unit, _arSubM.unit);
            }
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('ip address ')) { const p = sub.slice(11).split(/[\s\/]/); iface.ip = p[0]; iface.mask = p[1] ? (p[1].includes('.') ? p[1] : ccPrefixToMask(parseInt(p[1]))) : ''; }
                else if (sub.startsWith('description ')) { iface.desc = sub.slice(12); }
                else if (sub === 'shutdown') { iface.shutdown = true; }
                else if (sub === 'switchport mode access') { iface.vlan_mode = 'access'; }
                else if (sub === 'switchport mode trunk') { iface.vlan_mode = 'trunk'; }
                else if (sub.startsWith('switchport access vlan ')) { iface.access_vlan = parseInt(sub.slice(23)); }
                else if (sub.startsWith('switchport trunk allowed vlan ')) { iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30)); }
                else if ((m = sub.match(/^encapsulation\s+dot1[Qq]\s+(\d+)(\s+native)?/))) {
                    // Arista L3 subif (Cisco IOS-paralel)
                    const _vid = parseInt(m[1], 10);
                    const _native = !!m[2];
                    iface.access_vlan = _vid;
                    if (_native) iface.native_vlan = _vid;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(
                        _p ? _p.parent : iface.name,
                        _p ? _p.unit : _vid,
                        _vid,
                        { native: _native });
                }
                i++;
            }
            ir.interfaces.push(iface);
            continue;
        } else if (line.startsWith('vlan ') && !isNaN(line.slice(5).trim())) {
            const vlan = { id: parseInt(line.slice(5)), name: '', svi_ip: '', svi_mask: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('name ')) vlan.name = sub.slice(5);
                i++;
            }
            ir.vlans.push(vlan);
            continue;
        } else if (line.startsWith('ip route ')) {
            const p = line.slice(9).split(' ');
            if (p[0].includes('/')) {
                const [net, pre] = p[0].split('/');
                ir.routes.push({ network: net, mask: ccPrefixToMask(parseInt(pre)), nexthop: p[1] || '', metric: '1', iface: '' });
            } else {
                ir.routes.push({ network: p[0], mask: p[1] || '', nexthop: p[2] || '', metric: '1', iface: '' });
            }
        } else if (line.startsWith('router ospf ')) {
            const proc = { process_id: line.slice(12).trim(), router_id: '', areas: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('router-id ')) proc.router_id = sub.slice(10);
                else if (sub.startsWith('network ')) {
                    const m = sub.match(/^network ([\d.]+) ([\d.]+) area ([\S]+)/);
                    if (m) {
                        let area = proc.areas.find(a => a.id === m[3]);
                        if (!area) { area = { id: m[3], networks: [], auth: '' }; proc.areas.push(area); }
                        const wc = m[2].split('.').map((o, j) => 255 - parseInt(o));
                        area.networks.push(m[1] + '/' + ccMaskToPrefix(wc.join('.')));
                    }
                }
                i++;
            }
            ir.ospf.push(proc);
            continue;
        } else if (line.startsWith('router bgp ')) {
            ir.bgp = ir.bgp || { as_number: line.slice(11).trim(), router_id: '', neighbors: [], networks: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('router-id ')) { ir.bgp.router_id = sub.slice(10); }
                else if (sub.startsWith('neighbor ') && sub.includes(' remote-as ')) {
                    const m = sub.match(/^neighbor ([\S]+) remote-as (\S+)/);
                    if (m) ir.bgp.neighbors.push({ ip: m[1], remote_as: m[2], desc: '' });
                }
                else if (sub.startsWith('network ')) {
                    const m = sub.match(/^network ([\d.]+)(?:\/([\d]+)| mask ([\d.]+))/);
                    if (m) ir.bgp.networks.push(m[1] + '/' + (m[2] || ccMaskToPrefix(m[3])));
                }
                i++;
            }
            continue;
        }
        i++;
    }
    ir.interfaces.forEach(ifc => {
        if (ifc.name.toLowerCase().startsWith('vlan')) {
            const vid = parseInt(ifc.name.slice(4));
            const vlan = ir.vlans.find(v => v.id === vid);
            if (vlan && ifc.ip) { vlan.svi_ip = ifc.ip; vlan.svi_mask = ifc.mask; }
        }
    });
    return ir;
}
CC_READERS['arista-eos'] = ccReadAristaEOS;

// ─── Dell OS10 Reader ────────────────────────────────────────────────────────
function ccReadDellOS10(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'dell-os10';
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    let m;

    // Dell ethernet 1/1/N → canonical Cisco-style GigabitEthernet1/0/N
    function dellToCanonical(n) {
        const mm = n.match(/^ethernet\s*(\d+)\/(\d+)\/(\d+(?:\/\d+)*)/i);
        if (mm) return 'GigabitEthernet' + mm[1] + '/0/' + mm[3];
        return n;
    }
    // Dell range "ethernet 1/1/1-1/1/10" veya "ethernet 1/1/1-10" → expand
    function dellRangeExpand(spec) {
        const s = spec.trim();
        // "1/1/1-1/1/10" formatı
        let mm = s.match(/^ethernet\s*(\d+)\/(\d+)\/(\d+)\s*-\s*(\d+)\/(\d+)\/(\d+)/i);
        if (mm && mm[1] === mm[4] && mm[2] === mm[5]) {
            const out = [];
            for (let v = +mm[3]; v <= +mm[6]; v++)
                out.push('GigabitEthernet' + mm[1] + '/0/' + v);
            return out;
        }
        // "1/1/1-10" formatı
        mm = s.match(/^ethernet\s*(\d+)\/(\d+)\/(\d+)\s*-\s*(\d+)$/i);
        if (mm) {
            const out = [];
            for (let v = +mm[3]; v <= +mm[4]; v++)
                out.push('GigabitEthernet' + mm[1] + '/0/' + v);
            return out;
        }
        // Tek port
        const single = s.match(/^ethernet\s*(\d+)\/(\d+)\/(\d+)/i);
        if (single) return ['GigabitEthernet' + single[1] + '/0/' + single[3]];
        return [s];
    }

    function makeIface(name) {
        return { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', type: 'physical' };
    }

    let inAcl = null; // { name, entries }
    while (i < lines.length) {
        const line = lines[i].trim();
        if (!line || line.startsWith('!')) { inAcl = null; i++; continue; }

        // ACL block: "ip access-list NAME" → entries in following indented "seq N ..."
        if (line.startsWith('ip access-list ')) {
            const aclName = line.slice(15).trim();
            let acl = ir.acls.find(a => a.name === aclName);
            if (!acl) { acl = { name: aclName, type: 'extended', entries: [] }; ir.acls.push(acl); }
            inAcl = acl;
            i++; continue;
        }
        if (inAcl && lines[i].match(/^\s+seq\s+/i)) {
            const seqM = line.match(/^seq\s+\d+\s+(permit|deny)\s+(\S+)\s+(.*)$/i);
            if (seqM) {
                const rest = seqM[3].trim().split(/\s+/);
                // CIDR (192.168.1.0/24) → "IP wildcard" formatına çevir
                const cidrToWild = (s) => {
                    const cm = s.match(/^([\d.]+)\/(\d+)$/);
                    if (!cm) return s;
                    const pre = parseInt(cm[2]);
                    if (pre === 32) return 'host ' + cm[1];
                    const wmask = ccPrefixToMask(pre).split('.').map(o => 255 - parseInt(o)).join('.');
                    return cm[1] + ' ' + wmask;
                };
                inAcl.entries.push(ccParseAclEntry(seqM[1], seqM[2], rest.map(cidrToWild)));
            }
            i++; continue;
        } else if (inAcl && !lines[i].match(/^\s+/)) {
            inAcl = null;
        }

        if (line.startsWith('hostname ')) {
            ir.hostname = line.slice(9).trim();
            i++; continue;
        }

        // SNMP
        if ((m = line.match(/^snmp-server community\s+(\S+)\s*(ro|rw)?/i))) {
            ir.system.snmp = { community: m[1], access: (m[2] || 'ro').toLowerCase() };
            i++; continue;
        }

        if ((m = line.match(/^snmp-server group (\S+) v3 (noauth|auth|priv)/i))) {
            ir.system.snmp_v3_groups = ir.system.snmp_v3_groups || [];
            if (!ir.system.snmp_v3_groups.find(g => g.name === m[1])) {
                ir.system.snmp_v3_groups.push({ name: m[1], sec_level: m[2].toLowerCase() });
            }
            i++; continue;
        }

        // SNMPv3 user (Dell/Cisco-like syntax)
        if ((m = line.match(/^snmp-server user (\S+)(?:\s+(?!v3\b|auth\b|priv\b)(\S+))?(?:\s+v3)?(?:\s+auth\s+(sha|md5)\s+(\S+))?(?:\s+priv\s+(aes|des)(?:\s*(128|192|256))?\s+(\S+))?$/i))) {
            const u = { user: m[1], group: m[2] || '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' };
            if (m[3]) { u.auth_proto = m[3].toLowerCase(); u.auth_pwd = m[4]; }
            if (m[5]) { u.priv_proto = m[5].toLowerCase() + (m[6] || ''); u.priv_pwd = m[7]; }
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            if (!ir.system.snmp_v3_users.find(x => x.user === u.user)) ir.system.snmp_v3_users.push(u);
            i++; continue;
        }

        // NTP / Syslog
        if (line.startsWith('ntp server ')) { ir.system.ntp.push(line.slice(11).trim().split(/\s+/)[0]); i++; continue; }
        if (line.startsWith('logging server ') || line.startsWith('logging host ')) {
            const p = line.split(/\s+/);
            if (p[2]) ir.system.syslog.push(p[2]);
            i++; continue;
        }

        // DHCP snooping
        if (line === 'ip dhcp snooping') { ir.dhcpSnooping = ir.dhcpSnooping || {}; ir.dhcpSnooping.enabled = true; i++; continue; }
        if (line.startsWith('ip dhcp snooping vlan ')) {
            ir.dhcpSnooping = ir.dhcpSnooping || { enabled: true };
            ir.dhcpSnooping.vlans = ccParseTrunkVlanStr(line.slice(22));
            i++; continue;
        }

        // STP mode
        if ((m = line.match(/^(?:protocol\s+)?spanning-tree\s+(?:mode\s+)?(rstp|mst|mstp|pvst)/i))) {
            const sm = m[1].toLowerCase();
            ir.spanningTree.mode = sm === 'mst' ? 'mstp' : sm;
            i++; continue;
        }

        // VLAN definition: "vlan 10" / "vlan 10\n name USERS"
        if (line.startsWith('vlan ') && !isNaN(line.slice(5).trim())) {
            const vlan = { id: parseInt(line.slice(5)), name: '', svi_ip: '', svi_mask: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('name ')) vlan.name = sub.slice(5);
                i++;
            }
            ir.vlans.push(vlan);
            continue;
        }

        // SVI: "interface vlan 99" veya "interface vlan99"
        let sviM = line.match(/^interface\s+vlan\s*(\d+)/i);
        if (sviM) {
            const vid = parseInt(sviM[1]);
            let vlan = ir.vlans.find(v => v.id === vid);
            if (!vlan) { vlan = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }
            ir.vrrp = ir.vrrp || [];
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                const ipM = sub.match(/^ip address\s+([\d.]+)(?:\/(\d+)|\s+([\d.]+))/);
                if (ipM) {
                    vlan.svi_ip = ipM[1];
                    vlan.svi_mask = ipM[2] ? ccPrefixToMask(parseInt(ipM[2])) : (ipM[3] || '');
                }
                if (sub.startsWith('description ')) vlan.name = vlan.name || sub.slice(12);
                if ((mm = sub.match(/^vrrp-group (\d+) virtual-address ([\d.]+)/i))) {
                    let v = ir.vrrp.find(x => x.vlan_id === vid && x.group_id === parseInt(mm[1]));
                    if (!v) { v = { vlan_id: vid, group_id: parseInt(mm[1]), virtual_ip: mm[2], priority: 100, preempt: false }; ir.vrrp.push(v); }
                    else v.virtual_ip = mm[2];
                }
                if ((mm = sub.match(/^vrrp-group (\d+) priority (\d+)/i))) {
                    let v = ir.vrrp.find(x => x.vlan_id === vid && x.group_id === parseInt(mm[1]));
                    if (!v) { v = { vlan_id: vid, group_id: parseInt(mm[1]), virtual_ip: '', priority: parseInt(mm[2]), preempt: false }; ir.vrrp.push(v); }
                    else v.priority = parseInt(mm[2]);
                }
                if ((mm = sub.match(/^ip policy route-map (\S+)/i))) vlan.pbr_route_map = mm[1];
                i++;
            }
            continue;
        }

        // route-map (Cisco syntax)
        let rmM = line.match(/^route-map (\S+) (permit|deny) (\d+)/);
        if (rmM) {
            ir.routeMaps = ir.routeMaps || [];
            const rm = { name: rmM[1], action: rmM[2], seq: parseInt(rmM[3]), match_acl: '', set_next_hop: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^match ip address (\S+)/))) rm.match_acl = mm[1];
                else if ((mm = sub.match(/^set ip next-hop ([\d.]+)/))) rm.set_next_hop = mm[1];
                i++;
            }
            ir.routeMaps.push(rm);
            continue;
        }

        // monitor session (Dell)
        let monM = line.match(/^monitor session (\d+)/);
        if (monM) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.id === parseInt(monM[1]));
            if (!sess) { sess = { id: parseInt(monM[1]), sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^source interface (.+?)(?:\s+direction (both|rx|tx))?$/i))) {
                    const names = dellRangeExpand(mm[1].trim());
                    names.forEach(n => sess.sources.push({ name: n, direction: mm[2] || 'both' }));
                } else if ((mm = sub.match(/^destination interface (.+)$/i))) {
                    const names = dellRangeExpand(mm[1].trim());
                    sess.destination = names[0];
                }
                i++;
            }
            continue;
        }

        // class-map (Dell QoS)
        let cmM = line.match(/^class-map (?:type qos )?(?:match-(any|all) )?(\S+)/);
        if (cmM) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const cm = { name: cmM[2], match_type: cmM[1] || 'any', match_dscp: '', match_acl: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^match dscp (\S+)/))) cm.match_dscp = mm[1];
                else if ((mm = sub.match(/^match access-group name (\S+)/))) cm.match_acl = mm[1];
                i++;
            }
            ir.qos.classMaps.push(cm);
            continue;
        }

        // policy-map (Dell QoS)
        let pmM = line.match(/^policy-map (?:type qos )?(\S+)/);
        if (pmM) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const pm = { name: pmM[1], classes: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^class (\S+)/))) {
                    pm.classes.push({ name: mm[1], action: '', priority_pct: 0, fair_queue: false });
                } else if (pm.classes.length) {
                    const last = pm.classes[pm.classes.length - 1];
                    if (sub === 'priority') last.action = 'priority';
                    else if ((mm = sub.match(/^priority percent (\d+)/))) { last.action = 'priority'; last.priority_pct = parseInt(mm[1]); }
                }
                i++;
            }
            ir.qos.policyMaps.push(pm);
            continue;
        }

        // OSPF/BGP routers (Dell Cisco-style)
        let ospfM = line.match(/^router ospf (\d+)/i);
        if (ospfM) {
            const proc = { process_id: ospfM[1], router_id: '', areas: [], bfd_all_interfaces: false };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^router-id ([\d.]+)/))) proc.router_id = mm[1];
                else if ((mm = sub.match(/^network ([\d.]+)\/(\d+) area (\S+)/i))) {
                    let area = proc.areas.find(a => a.id === mm[3]);
                    if (!area) { area = { id: mm[3], networks: [], auth: '' }; proc.areas.push(area); }
                    area.networks.push(mm[1] + '/' + mm[2]);
                }
                i++;
            }
            ir.ospf.push(proc);
            continue;
        }
        let bgpM = line.match(/^router bgp (\d+)/i);
        if (bgpM) {
            const bgp = { as_number: bgpM[1], router_id: '', neighbors: [], networks: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^router-id ([\d.]+)/))) bgp.router_id = mm[1];
                else if ((mm = sub.match(/^neighbor ([\d.]+) remote-as (\d+)/))) {
                    let nb = bgp.neighbors.find(n => n.ip === mm[1]);
                    if (!nb) { nb = { ip: mm[1], remote_as: mm[2], desc: '' }; bgp.neighbors.push(nb); }
                }
                else if ((mm = sub.match(/^network ([\d.]+)\/(\d+)/i))) bgp.networks.push(mm[1] + '/' + mm[2]);
                i++;
            }
            ir.bgp = bgp;
            continue;
        }
        if (line === 'bfd') { ir.bfdGlobal = true; i++; continue; }

        // Dell event manager applet (Cisco-uyumlu)
        let emM = line.match(/^event manager applet (\S+)/);
        if (emM) {
            ir.eventApplets = ir.eventApplets || [];
            const app = { name: emM[1], trigger: '', action: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^event track (\d+) state (\S+)/))) app.trigger = 'track-' + mm[1] + '-' + mm[2];
                else if ((mm = sub.match(/^action \S+ syslog msg "([^"]+)"/))) app.action = 'syslog: ' + mm[1];
                i++;
            }
            ir.eventApplets.push(app);
            continue;
        }

        // Dell track (track X ip sla Y reachability)
        if ((m = line.match(/^track (\d+) ip sla (\d+) reachability/))) {
            ir.tracks = ir.tracks || [];
            ir.tracks.push({ id: parseInt(m[1]), type: 'ip-sla', sla_id: parseInt(m[2]) });
            i++; continue;
        }

        // Dell ip sla (Cisco-uyumlu, OS10 10.5+ destekliyor)
        if ((m = line.match(/^ip sla (\d+)/))) {
            ir.ipSla = ir.ipSla || [];
            const sla = { id: parseInt(m[1]), type: '', target: '', source_iface: '', frequency: 60 };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^icmp-echo ([\d.]+)(?: source-interface (.+))?/))) {
                    sla.type = 'icmp-echo';
                    sla.target = mm[1];
                    if (mm[2]) {
                        const srcIf = mm[2].trim();
                        if (/^ethernet\s*/i.test(srcIf)) sla.source_iface = dellRangeExpand(srcIf)[0];
                        else if ((m = srcIf.match(/^vlan\s*(\d+)/i))) sla.source_iface = 'Vlan' + m[1];
                        else if ((m = srcIf.match(/^port-channel\s*(\d+)/i))) sla.source_iface = 'Port-channel' + m[1];
                        else sla.source_iface = srcIf;
                    }
                }
                else if ((mm = sub.match(/^frequency (\d+)/))) sla.frequency = parseInt(mm[1]);
                i++;
            }
            ir.ipSla.push(sla);
            continue;
        }

        // Port-channel: "interface port-channel 1" veya "port-channel1"
        let pcM = line.match(/^interface\s+port-channel\s*(\d+)/i);
        if (pcM) {
            const bid = parseInt(pcM[1]);
            const b = ccEnsureBundle(ir, bid);
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('description ')) b.desc = sub.slice(12);
                else if (sub.startsWith('ip address ')) {
                    const p = sub.slice(11).split(/[\s\/]/);
                    b.ip = p[0];
                    b.mask = p[1] ? (p[1].includes('.') ? p[1] : ccPrefixToMask(parseInt(p[1]))) : '';
                }
                else if (sub === 'switchport mode access') b.vlan_mode = 'access';
                else if (sub === 'switchport mode trunk') b.vlan_mode = 'trunk';
                else if (sub.startsWith('switchport access vlan ')) b.access_vlan = parseInt(sub.slice(23));
                else if (sub.startsWith('switchport trunk allowed vlan ')) b.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30));
                else if (sub.startsWith('switchport trunk native vlan ')) b.native_vlan = parseInt(sub.slice(29));
                else if ((m = sub.match(/^mtu\s+(\d+)/))) b.mtu = parseInt(m[1]);
                i++;
            }
            continue;
        }

        // Interface range "ethernet 1/1/1-1/1/10" veya "ethernet 1/1/1-10"
        if (line.match(/^interface\s+range\s+ethernet/i)) {
            const spec = line.replace(/^interface\s+range\s+/i, '');
            const names = dellRangeExpand(spec);
            const ifaces = names.map(makeIface);
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                ifaces.forEach(iface => {
                    if (sub.startsWith('description ')) iface.desc = sub.slice(12);
                    else if (sub === 'switchport mode access') iface.vlan_mode = 'access';
                    else if (sub === 'switchport mode trunk') iface.vlan_mode = 'trunk';
                    else if (sub.startsWith('switchport access vlan ')) {
                        iface.access_vlan = parseInt(sub.slice(23));
                        if (!iface.vlan_mode) iface.vlan_mode = 'access';
                    }
                    else if (sub.startsWith('switchport voice vlan ')) iface.voice_vlan = parseInt(sub.slice(22));
                    else if (sub.startsWith('ip access-group ')) { const m2 = sub.match(/^ip access-group\s+(\S+)\s+(in|out)/); if (m2) { if (m2[2] === 'in') iface._aclIn = m2[1]; else iface._aclOut = m2[1]; } }
                    else if ((m = sub.match(/^ip policy route-map (\S+)/i))) iface.pbr_route_map = m[1];
                    else if (sub.startsWith('switchport trunk native vlan ')) iface.native_vlan = parseInt(sub.slice(29));
                    else if (sub.startsWith('switchport trunk allowed vlan ')) iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30));
                    else if (sub === 'spanning-tree portfast' || sub === 'spanning-tree port type edge') iface.edge_port = true;
                    else if (sub === 'spanning-tree bpduguard enable') iface.bpdu_guard = true;
                    else if (sub === 'switchport port-security') iface.port_security = Object.assign(iface.port_security || {}, { enabled: true });
                    else if (sub.startsWith('switchport port-security maximum ')) iface.port_security = Object.assign(iface.port_security || { enabled: true }, { max: parseInt(sub.slice(33)) });
                    else if (sub.startsWith('switchport port-security violation ')) iface.port_security = Object.assign(iface.port_security || { enabled: true }, { violation: sub.slice(35).trim() });
                    else if (sub === 'switchport port-security mac-address sticky') iface.port_security = Object.assign(iface.port_security || { enabled: true }, { sticky: true });
                    else if (sub === 'ip dhcp snooping trust') iface.dhcp_snoop_trust = true;
                    else if (sub === 'shutdown') iface.shutdown = true;
                    else if ((m = sub.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/))) {
                        iface._bundleId = parseInt(m[1]);
                        iface._bundleMode = m[2] === 'active' ? 'lacp-active' : m[2] === 'passive' ? 'lacp-passive' : 'static';
                    }
                });
                i++;
            }
            ifaces.forEach(iface => {
                ir.interfaces.push(iface);
                if (iface._bundleId !== undefined) {
                    const b = ccEnsureBundle(ir, iface._bundleId);
                    if (!b.members.includes(iface.name)) b.members.push(iface.name);
                    if (b.mode === 'static' && iface._bundleMode) b.mode = iface._bundleMode;
                }
            });
            continue;
        }

        // Tek interface: "interface ethernet 1/1/47"
        let phyM = line.match(/^interface\s+ethernet\s*(.+)$/i);
        if (phyM) {
            const names = dellRangeExpand('ethernet ' + phyM[1]);
            const iface = makeIface(names[0]);
            // Router subif name'inden auto-populate
            const _dpSub = ccParseSubifName(iface.name);
            if (_dpSub) {
                iface.access_vlan = _dpSub.unit;
                iface._subif = ccBuildSubif(_dpSub.parent, _dpSub.unit, _dpSub.unit);
            }
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('description ')) iface.desc = sub.slice(12);
                else if ((m = sub.match(/^encapsulation\s+dot1[Qq]\s+(\d+)/i))) {
                    // Dell OS10 L3 subif VLAN tag
                    const _vid = parseInt(m[1], 10);
                    iface.access_vlan = _vid;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(
                        _p ? _p.parent : iface.name,
                        _p ? _p.unit : _vid,
                        _vid);
                }
                else if (sub.startsWith('ip address ')) {
                    const p = sub.slice(11).split(/[\s\/]/);
                    iface.ip = p[0];
                    iface.mask = p[1] ? (p[1].includes('.') ? p[1] : ccPrefixToMask(parseInt(p[1]))) : '';
                }
                else if (sub === 'switchport mode access') iface.vlan_mode = 'access';
                else if (sub === 'switchport mode trunk') iface.vlan_mode = 'trunk';
                else if (sub.startsWith('switchport access vlan ')) { iface.access_vlan = parseInt(sub.slice(23)); if (!iface.vlan_mode) iface.vlan_mode = 'access'; }
                else if (sub.startsWith('switchport voice vlan ')) iface.voice_vlan = parseInt(sub.slice(22));
                else if (sub.startsWith('ip access-group ')) { const m2 = sub.match(/^ip access-group\s+(\S+)\s+(in|out)/); if (m2) { if (m2[2] === 'in') iface._aclIn = m2[1]; else iface._aclOut = m2[1]; } }
                else if ((m = sub.match(/^ip policy route-map (\S+)/i))) iface.pbr_route_map = m[1];
                else if (sub.startsWith('switchport trunk native vlan ')) iface.native_vlan = parseInt(sub.slice(29));
                else if (sub.startsWith('switchport trunk allowed vlan ')) iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30));
                else if (sub === 'spanning-tree portfast' || sub === 'spanning-tree port type edge') iface.edge_port = true;
                else if (sub === 'spanning-tree bpduguard enable') iface.bpdu_guard = true;
                else if (sub === 'switchport port-security') iface.port_security = Object.assign(iface.port_security || {}, { enabled: true });
                else if (sub.startsWith('switchport port-security maximum ')) iface.port_security = Object.assign(iface.port_security || { enabled: true }, { max: parseInt(sub.slice(33)) });
                else if (sub.startsWith('switchport port-security violation ')) iface.port_security = Object.assign(iface.port_security || { enabled: true }, { violation: sub.slice(35).trim() });
                else if (sub === 'switchport port-security mac-address sticky') iface.port_security = Object.assign(iface.port_security || { enabled: true }, { sticky: true });
                else if (sub === 'ip dhcp snooping trust') iface.dhcp_snoop_trust = true;
                else if ((m = sub.match(/^mtu\s+(\d+)/))) iface.mtu = parseInt(m[1]);
                else if (sub === 'no switchport') iface.no_switchport = true;
                else if ((m = sub.match(/^bfd interval (\d+) min_rx (\d+) multiplier (\d+)/i))) {
                    iface.bfd = { interval: parseInt(m[1]), min_rx: parseInt(m[2]), multiplier: parseInt(m[3]) };
                }
                else if ((m = sub.match(/^service-policy (input|output) (\S+)/))) {
                    iface.service_policy = iface.service_policy || {};
                    iface.service_policy[m[1]] = m[2];
                }
                else if (sub === 'shutdown') iface.shutdown = true;
                else if ((m = sub.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/))) {
                    iface._bundleId = parseInt(m[1]);
                    iface._bundleMode = m[2] === 'active' ? 'lacp-active' : m[2] === 'passive' ? 'lacp-passive' : 'static';
                }
                i++;
            }
            ir.interfaces.push(iface);
            if (iface._bundleId !== undefined) {
                const b = ccEnsureBundle(ir, iface._bundleId);
                if (!b.members.includes(iface.name)) b.members.push(iface.name);
                if (b.mode === 'static' && iface._bundleMode) b.mode = iface._bundleMode;
            }
            continue;
        }

        // Route
        if (line.startsWith('ip route ')) {
            const p = line.slice(9).split(' ');
            if (p[0].includes('/')) {
                const [net, pre] = p[0].split('/');
                ir.routes.push({ network: net, mask: ccPrefixToMask(parseInt(pre)), nexthop: p[1] || '', metric: '1', iface: '' });
            } else {
                ir.routes.push({ network: p[0], mask: p[1] || '', nexthop: p[2] || '', metric: '1', iface: '' });
            }
            i++; continue;
        }

        // banner motd <delim> ... <delim>   (OS10'da delim genellikle literal '^C')
        if ((m = line.match(/^banner\s+(motd|login|exec)\s+(\S+)/i))) {
            const _kind = m[1].toLowerCase(), _delim = m[2];
            // 'banner motd disable' / 'none' bir delimiter DEGIL, banner'i kapatan
            // komuttur. Delimiter sanilirsa kapanis hic bulunamaz ve dosyanin geri
            // kalani yutulur (SW01/SW02'de 56 arayuzun kaybolmasinin nedeni buydu).
            if (/^(disable|none)$/i.test(_delim)) { i++; continue; }
            // Kapanis delimiter'ini once ARA; yoksa blogu hic tuketme.
            let _end = -1;
            for (let k = i + 1; k < lines.length; k++) {
                if (lines[k].trim() === _delim) { _end = k; break; }
            }
            if (_end === -1) { ir.unknowns.push(line); i++; continue; }
            if (_kind === 'motd') ir.system.banner = lines.slice(i + 1, _end).join('\n');
            i = _end + 1;
            continue;
        }

        // ── Eslesmeyen satir ───────────────────────────────────────────────────
        // Catch-all ZORUNLUDUR: eslesmeyen satiri sessizce yutmak, parser'i bos
        // cikti uretirken "hatasiz" gosterir (bkz. arayuz regex'indeki \s+ hatasi —
        // 196 arayuz kayboldugu halde unknowns=0 cikiyordu). Cevrilemeyen satir
        // en azindan GORUNUR olmali.
        if (line &&
            !line.startsWith('!') &&
            line !== 'show running-configuration' &&
            !/^(end|exit)$/i.test(line)) {
            ir.unknowns.push(line);
        }
        i++;
    }
    return ir;
}
CC_READERS['dell-os10'] = ccReadDellOS10;

function ccReadF5BigIP(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'adc';
    ir._meta.srcVendor = 'f5-bigip';
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        let m;
        // hostname
        if (line.startsWith('sys global-settings {')) {
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('hostname ')) ir.hostname = sub.slice(9).trim();
                i++;
            }
        // ltm virtual
        } else if ((m = line.match(/^ltm virtual (\/\S+|\S+) \{/))) {
            const name = m[1].replace(/^\/Common\//, '');
            const vs = { name, vip: '', port: '', proto: 'tcp', pool: '', snat: '', persistence: '', profile: '' };
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                const dm = sub.match(/^destination ([\d.]+):([\d]+)/);
                if (dm) { vs.vip = dm[1]; vs.port = dm[2]; }
                else if (sub.startsWith('pool ')) vs.pool = sub.slice(5).trim().replace(/^\/Common\//, '');
                else if (sub.startsWith('source-address-translation {') || sub.startsWith('snat ')) vs.snat = 'automap';
                else if (sub.startsWith('ip-protocol ')) vs.proto = sub.slice(12).trim();
                i++;
            }
            ir.virtualServers.push(vs);
        // ltm pool
        } else if ((m = line.match(/^ltm pool (\/\S+|\S+) \{/))) {
            const name = m[1].replace(/^\/Common\//, '');
            const pool = { name, lb_method: 'round-robin', members: [], monitor: '' };
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('load-balancing-mode ')) pool.lb_method = sub.slice(20).trim();
                else if (sub.startsWith('monitor ')) pool.monitor = sub.slice(8).trim().replace(/^\/Common\//, '');
                else if (sub.startsWith('members {')) {
                    i++;
                    while (i < lines.length && !lines[i].trim().startsWith('}')) {
                        const mem = lines[i].trim();
                        const mm = mem.match(/^([\d.]+):([\d]+)/);
                        if (mm) pool.members.push({ ip: mm[1], port: mm[2], weight: 1 });
                        i++;
                    }
                }
                i++;
            }
            ir.pools.push(pool);
        // ltm monitor
        } else if ((m = line.match(/^ltm monitor (\S+) (\/\S+|\S+) \{/))) {
            const type = m[1];
            const name = m[2].replace(/^\/Common\//, '');
            const mon = { name, type: type === 'http' ? 'http' : type === 'tcp' ? 'tcp' : 'icmp', interval: '5', timeout: '16', send: '', receive: '' };
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('interval ')) mon.interval = sub.slice(9).trim();
                else if (sub.startsWith('timeout ')) mon.timeout = sub.slice(8).trim();
                else if (sub.startsWith('send ')) mon.send = sub.slice(5).trim().replace(/^"|"$/g, '');
                else if (sub.startsWith('recv ')) mon.receive = sub.slice(5).trim().replace(/^"|"$/g, '');
                i++;
            }
            ir.monitors.push(mon);
        // ltm node
        } else if ((m = line.match(/^ltm node (\/\S+|\S+) \{/))) {
            const name = m[1].replace(/^\/Common\//, '');
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('address ')) ir.addressObjects.push({ name, type: 'host', value: sub.slice(8).trim(), mask: '255.255.255.255', members: [], description: '' });
                i++;
            }
        // net interface (mtu / enabled)
        } else if ((m = line.match(/^net interface (\S+) \{/))) {
            const ifName = m[1];
            const ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, mtu: 0 };
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('mtu ')) ifc.mtu = parseInt(sub.slice(4).trim(), 10);
                else if (sub === 'enabled false' || sub === 'enabled no') ifc.shutdown = true;
                i++;
            }
            ir.interfaces.push(ifc);
        // net vlan
        } else if ((m = line.match(/^net vlan (\S+) \{/))) {
            const vlName = m[1].replace(/^\/Common\//, '');
            const vl = { id: 0, name: vlName, svi_ip: '', svi_mask: '' };
            const taggedIfaces = [];
            const untaggedIfaces = [];
            let vlMtu = 0;
            i++;
            let depth = 1;
            while (i < lines.length && depth > 0) {
                const sub = lines[i].trim();
                if (sub === '}') { depth--; i++; continue; }
                if (sub.startsWith('tag ')) vl.id = parseInt(sub.slice(4).trim(), 10);
                else if (sub.startsWith('mtu ')) vlMtu = parseInt(sub.slice(4).trim(), 10);
                else if (sub.startsWith('interfaces {')) {
                    i++; depth++;
                    while (i < lines.length && !lines[i].trim().startsWith('}')) {
                        const ifm = lines[i].trim().match(/^(\S+)\s*\{(.*)\}/);
                        if (ifm) {
                            const ifn = ifm[1];
                            const flag = ifm[2].trim();
                            if (flag.includes('tagged')) taggedIfaces.push(ifn);
                            else untaggedIfaces.push(ifn);
                        }
                        i++;
                    }
                    depth--; // closing } eaten next iteration
                }
                i++;
            }
            if (vl.id) {
                ir.vlans.push(vl);
                // Member iface'lere vlan_mode/access_vlan/trunk_vlans yansıt
                taggedIfaces.forEach(name => {
                    let ifc = ir.interfaces.find(x => x.name === name);
                    if (!ifc) { ifc = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: 'trunk', access_vlan: null, trunk_vlans: [], mtu: vlMtu || 0 }; ir.interfaces.push(ifc); }
                    if (ifc.vlan_mode !== 'trunk') ifc.vlan_mode = 'trunk';
                    if (!Array.isArray(ifc.trunk_vlans)) ifc.trunk_vlans = [];
                    if (ifc.trunk_vlans.indexOf(vl.id) === -1) ifc.trunk_vlans.push(vl.id);
                });
                untaggedIfaces.forEach(name => {
                    let ifc = ir.interfaces.find(x => x.name === name);
                    if (!ifc) { ifc = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: 'access', access_vlan: vl.id, trunk_vlans: null, mtu: vlMtu || 0 }; ir.interfaces.push(ifc); }
                    else if (ifc.vlan_mode === 'trunk') { ifc.native_vlan = vl.id; }
                    else { ifc.vlan_mode = 'access'; ifc.access_vlan = vl.id; }
                });
            }
        // net self (SVI ip + vlan binding)
        } else if ((m = line.match(/^net self (\S+) \{/))) {
            const selfName = m[1].replace(/^\/Common\//, '');
            let addr = '', vlanRef = '';
            i++;
            while (i < lines.length && !lines[i].trim().startsWith('}')) {
                const sub = lines[i].trim();
                if (sub.startsWith('address ')) addr = sub.slice(8).trim();
                else if (sub.startsWith('vlan ')) vlanRef = sub.slice(5).trim().replace(/^\/Common\//, '');
                i++;
            }
            if (addr && vlanRef) {
                const am = addr.match(/^([\d.]+)\/(\d+)/);
                const vl = ir.vlans.find(v => v.name === vlanRef);
                if (am && vl) {
                    vl.svi_ip = am[1];
                    vl.svi_mask = ccPrefixToMask(parseInt(am[2], 10));
                }
            }
        }
        i++;
    }
    return ir;
}
CC_READERS['f5-bigip'] = ccReadF5BigIP;

function ccReadCitrixADC(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'adc';
    ir._meta.srcVendor = 'citrix-adc';
    const lines = text.split('\n').map(l => l.trimEnd());
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        let m;
        // lb vserver
        if ((m = t.match(/^add lb vserver (\S+) (\S+) ([\d.]+) (\d+)/))) {
            ir.virtualServers.push({ name: m[1], vip: m[3], port: m[4], proto: m[2].toLowerCase(), pool: '', snat: '', persistence: '', profile: '' });
        // bind lb vserver to servicegroup
        } else if ((m = t.match(/^bind lb vserver (\S+) (\S+)/))) {
            const vs = ir.virtualServers.find(v => v.name === m[1]);
            if (vs) vs.pool = m[2];
        // serviceGroup
        } else if ((m = t.match(/^add serviceGroup (\S+) (\S+)/))) {
            if (!ir.pools.find(p => p.name === m[1])) ir.pools.push({ name: m[1], lb_method: 'round-robin', members: [], monitor: '' });
        // bind serviceGroup member
        } else if ((m = t.match(/^bind serviceGroup (\S+) ([\d.]+) (\d+)/))) {
            const pool = ir.pools.find(p => p.name === m[1]);
            if (pool) pool.members.push({ ip: m[2], port: m[3], weight: 1 });
        // server (node)
        } else if ((m = t.match(/^add server (\S+) ([\d.]+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'host', value: m[2], mask: '255.255.255.255', members: [], description: '' });
        // monitor
        } else if ((m = t.match(/^add lb monitor (\S+) (\S+)/))) {
            ir.monitors.push({ name: m[1], type: m[2].toLowerCase(), interval: '5', timeout: '16', send: '', receive: '' });
        // hostname
        } else if ((m = t.match(/^set ns hostName\s+(\S+)/))) {
            ir.hostname = m[1];
        // VLAN tanımı
        } else if ((m = t.match(/^add vlan\s+(\d+)(?:\s+-aliasName\s+(\S+))?/))) {
            const vid = parseInt(m[1], 10);
            const name = m[2] || ('vlan' + vid);
            if (!ir.vlans.find(v => v.id === vid)) ir.vlans.push({ id: vid, name, svi_ip: '', svi_mask: '' });
        // VLAN port binding
        } else if ((m = t.match(/^bind vlan\s+(\d+)\s+-ifnum\s+(\S+)(\s+-tagged)?/))) {
            const vid = parseInt(m[1], 10);
            const ifName = m[2];
            const tagged = !!m[3];
            let ifc = ir.interfaces.find(x => x.name === ifName);
            if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, mtu: 0 }; ir.interfaces.push(ifc); }
            if (tagged) {
                if (!Array.isArray(ifc.trunk_vlans)) ifc.trunk_vlans = [];
                if (ifc.trunk_vlans.indexOf(vid) === -1) ifc.trunk_vlans.push(vid);
                if (ifc.vlan_mode !== 'access') ifc.vlan_mode = 'trunk';
            } else {
                if (ifc.vlan_mode === 'trunk') ifc.native_vlan = vid;
                else { ifc.vlan_mode = 'access'; ifc.access_vlan = vid; }
            }
        // VLAN IP binding (SVI)
        } else if ((m = t.match(/^bind vlan\s+(\d+)\s+-IPAddress\s+([\d.]+)\s+([\d.]+)/))) {
            const vid = parseInt(m[1], 10);
            const vl = ir.vlans.find(v => v.id === vid);
            if (vl) { vl.svi_ip = m[2]; vl.svi_mask = m[3]; }
        // ns ip (SNIP) — sadece kayıt için, binding ayrı satırda
        } else if ((m = t.match(/^add ns ip\s+([\d.]+)\s+([\d.]+)\s+-type\s+(\w+)/))) {
            // SNIP'i interface'e değil unknown'a alma — yukarıdaki bind vlan -IPAddress satırı zaten vl.svi_ip'i set ediyor.
            // Eğer bind hiç yoksa (orphan SNIP), unknowns'a düş.
            // Bu kontrol parse sonunda yapılır; şimdilik hiçbir şey yapma.
        // set interface (mtu / state)
        } else if ((m = t.match(/^set interface\s+(\S+)\s+(.*)$/))) {
            const ifName = m[1];
            const opts = m[2];
            let ifc = ir.interfaces.find(x => x.name === ifName);
            if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, mtu: 0 }; ir.interfaces.push(ifc); }
            const mtu = opts.match(/-mtu\s+(\d+)/);
            if (mtu) ifc.mtu = parseInt(mtu[1], 10);
            if (/-state\s+DISABLED/.test(opts)) ifc.shutdown = true;
        }
    }
    return ir;
}
CC_READERS['citrix-adc'] = ccReadCitrixADC;

function ccReadMikroTik(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'mikrotik';
    const lines = text.split('\n').map(l => l.trimEnd());
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        const m = t.match(/^\/system identity set name=(\S+)/);
        if (m) ir.hostname = m[1];
        const ipm = t.match(/^\/ip address add address=([\d.]+\/\d+) interface=(\S+)/);
        if (ipm) {
            const [ip, pre] = ipm[1].split('/');
            ir.interfaces.push({ name: ipm[2], ip, mask: ccPrefixToMask(parseInt(pre)), desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', type: 'physical' });
        }
        const rm = t.match(/^\/ip route add dst-address=([\d.]+\/\d+) gateway=([\d.]+)/);
        if (rm) {
            const [net, pre] = rm[1].split('/');
            ir.routes.push({ network: net, mask: ccPrefixToMask(parseInt(pre)), nexthop: rm[2], metric: '1', iface: '' });
        }
    }
    return ir;
}
CC_READERS['mikrotik'] = ccReadMikroTik;
