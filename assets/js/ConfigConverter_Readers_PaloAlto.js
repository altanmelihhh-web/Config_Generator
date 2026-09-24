'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Palo Alto Reader ──────────────────────────────────────────────────────────
function ccReadPaloAlto(text) {
    const ir = ccEmptyIR();
    const lines = text.split('\n').map(l => l.trimEnd());

    // Helper: parse a bracket list like "[ A B C ]" → ['A','B','C']
    function parseBracketList(str) {
        const m = str.match(/\[\s*([^\]]*?)\s*\]/);
        if (!m) return str.trim() ? [str.trim()] : [];
        return m[1].trim().split(/\s+/).filter(Boolean);
    }

    // Helper: find-or-create a securityPolicy by name
    function getPolicy(name) {
        let p = ir.securityPolicies.find(x => x.name === name);
        if (!p) {
            p = { name, seq: ir.securityPolicies.length, srcZone: '', dstZone: '', srcAddr: [], dstAddr: [], service: [], action: 'allow', log: true };
            ir.securityPolicies.push(p);
        }
        return p;
    }
    // Helper: find-or-create a natRule by name
    function getNat(name) {
        let n = ir.natRules.find(x => x.name === name);
        if (!n) { n = { name, type: 'dynamic', origSrc: '', transSrc: '', origDst: '', transDst: '', iface: '', bidirectional: false }; ir.natRules.push(n); }
        return n;
    }
    // Helper: find-or-create a vpnTunnel by IKE gateway name (p1Name olarak kullanılıyor)
    function getTunnel(gwName) {
        let t2 = ir.vpnTunnels.find(x => x.p1Name === gwName);
        if (!t2) { t2 = { p1Name: gwName, iface: '', remoteGw: '', psk: '', ikeVersion: '2', proposal: '', dhgrp: '', p2Name: '', localSubnet: '', remoteSubnet: '' }; ir.vpnTunnels.push(t2); }
        return t2;
    }
    // Helper: find-or-create a utmProfiles (security profile group) entry by group name
    function getUtm(groupName) {
        let u = ir.utmProfiles.find(x => x.groupName === groupName);
        if (!u) { u = { groupName }; ir.utmProfiles.push(u); }
        return u;
    }

    for (let idx = 0; idx < lines.length; idx++) {
        const t = lines[idx].trim();
        if (!t || t.startsWith('#')) continue;
        let m;

        // ── Hostname ──────────────────────────────────────────────────────────
        if ((m = t.match(/^set deviceconfig system hostname (\S+)/))) {
            ir.hostname = m[1];

        // ── Interface: subinterface tag (units X.Y tag N) ────────────────────
        // "set network interface ethernet ethernet1/2 layer3 units ethernet1/2.10 tag 10"
        } else if ((m = t.match(/^set network interface \S+ \S+ layer3 units (\S+) tag (\d+)/))) {
            const subName = m[1];
            const vid = parseInt(m[2], 10);
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) { ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: 'access', access_vlan: vid, trunk_vlans: null, nameif: '', security_level: '', mtu: 0 }; ir.interfaces.push(ifc); }
            else { ifc.access_vlan = vid; if (!ifc.vlan_mode) ifc.vlan_mode = 'access'; }

        // ── Interface: subinterface IP (units X.Y ip A/N) ─────────────────────
        } else if ((m = t.match(/^set network interface \S+ \S+ layer3 units (\S+) ip ([\d.]+)\/(\d+)/))) {
            const subName = m[1];
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) { ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', mtu: 0 }; ir.interfaces.push(ifc); }
            ifc.ip = m[2]; ifc.mask = ccPrefixToMask(parseInt(m[3]));
            // Subif adından vlan-id tahmin et (varsa, tag yoksa)
            if (!ifc.access_vlan) {
                const subifM = subName.match(/\.(\d+)$/);
                if (subifM) ifc.access_vlan = parseInt(subifM[1], 10);
            }

        // ── Interface: subinterface MTU ───────────────────────────────────────
        } else if ((m = t.match(/^set network interface \S+ \S+ layer3 units (\S+) mtu (\d+)/))) {
            const subName = m[1];
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) { ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', mtu: 0 }; ir.interfaces.push(ifc); }
            ifc.mtu = parseInt(m[2], 10);

        // ── Interface: L3 IP ──────────────────────────────────────────────────
        // Handles both "set network interface ae1 layer3 ip X/Y"
        // and "set network interface ethernet ethernet1/1 layer3 ip X/Y"
        } else if ((m = t.match(/^set network interface (?:\S+ )?(\S+) layer3 ip ([\d.]+)\/(\d+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.ip = m[2]; ifc.mask = ccPrefixToMask(parseInt(m[3]));

        // ── Interface: L3 MTU ─────────────────────────────────────────────────
        } else if ((m = t.match(/^set network interface (?:\S+ )?(\S+) layer3 mtu (\d+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', mtu: 0 }; ir.interfaces.push(ifc); }
            ifc.mtu = parseInt(m[2], 10);

        // ── Interface: aggregate-ethernet member binding ─────────────────────
        } else if ((m = t.match(/^set network interface ethernet (\S+) aggregate-group (ae\d+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            const bId = parseInt(m[2].slice(2), 10);
            ifc._bundleId = bId;
            ifc._bundleMode = 'lacp-active';
            const b = ccEnsureBundle(ir, bId);
            if (b.members.indexOf(m[1]) === -1) b.members.push(m[1]);

        // ── Interface: description/comment ────────────────────────────────────
        } else if ((m = t.match(/^set network interface (?:\S+ )?(\S+) comment "?([^"]+)"?/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.desc = m[2];

        // ── Static routes ─────────────────────────────────────────────────────
        } else if ((m = t.match(/^set network virtual-router \S+ routing-table ip static-route \S+ destination ([\d.]+)\/(\d+)/))) {
            ir.routes.push({ network: m[1], mask: ccPrefixToMask(parseInt(m[2])), nexthop: '', metric: '1', iface: '' });
        } else if ((m = t.match(/^set network virtual-router \S+ routing-table ip static-route \S+ nexthop ip-address ([\d.]+)/))) {
            const last = ir.routes[ir.routes.length - 1];
            if (last) last.nexthop = m[1];

        // ── Address objects: ip-netmask (quoted or unquoted name) ────────────
        } else if ((m = t.match(/^set address "?([^"\s]+)"? ip-netmask ([\d.]+)\/(\d+)/))) {
            const prefix = parseInt(m[3]);
            ir.addressObjects.push({ name: m[1], type: prefix === 32 ? 'host' : 'network', value: m[2], mask: ccPrefixToMask(prefix), members: [], description: '' });

        // ── Address objects: ip-range ─────────────────────────────────────────
        } else if ((m = t.match(/^set address "?([^"\s]+)"? ip-range ([\d.]+-[\d.]+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'range', value: m[2], mask: '', members: [], description: '' });

        // ── Address objects: fqdn ─────────────────────────────────────────────
        } else if ((m = t.match(/^set address "?([^"\s]+)"? fqdn (\S+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'fqdn', value: m[2], mask: '', members: [], description: '' });

        // ── Address groups ────────────────────────────────────────────────────
        } else if ((m = t.match(/^set address-group "?([^"\s]+)"? static (\[.+\]|\S+)/))) {
            const members = parseBracketList(m[2]);
            ir.addressObjects.push({ name: m[1], type: 'group', value: '', mask: '', members, description: '' });

        // ── Service objects: TCP — destination-port or port (quoted or unquoted)
        } else if ((m = t.match(/^set service "?([^"\s]+)"? protocol tcp (?:destination-port|port) (\S+)/))) {
            ir.serviceObjects.push({ name: m[1], proto: 'tcp', ports: m[2], members: [], predefined: false });

        // ── Service objects: UDP ──────────────────────────────────────────────
        } else if ((m = t.match(/^set service "?([^"\s]+)"? protocol udp (?:destination-port|port) (\S+)/))) {
            ir.serviceObjects.push({ name: m[1], proto: 'udp', ports: m[2], members: [], predefined: false });

        // ── Zones ─────────────────────────────────────────────────────────────
        } else if ((m = t.match(/^set zone "?([^"\s]+)"? network layer3 (\[.+\]|\S+)/))) {
            const interfaces = parseBracketList(m[2]);
            let zone = ir.zones.find(z => z.name === m[1]);
            if (!zone) { zone = { name: m[1], interfaces: [], description: '', trust_level: 0 }; ir.zones.push(zone); }
            interfaces.forEach(ifc => { if (!zone.interfaces.includes(ifc)) zone.interfaces.push(ifc); });

        // ── Security rules: single-line format ───────────────────────────────
        // e.g.: set rulebase security rules allow-web from trust to untrust source any destination srv action allow
        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? from (\S+) to (\S+) source (\S+) destination (\S+) (?:application \S+ )?service (\S+) action (allow|deny)/))) {
            const p = getPolicy(m[1]);
            p.srcZone = m[2]; p.dstZone = m[3];
            p.srcAddr = [m[4]]; p.dstAddr = [m[5]];
            p.service = [m[6]]; p.action = m[7];

        // ── Security rules: multi-line attribute format ───────────────────────
        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? from (\[.+\]|\S+)/))) {
            getPolicy(m[1]).srcZone = parseBracketList(m[2])[0] || '';

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? to (\[.+\]|\S+)/))) {
            getPolicy(m[1]).dstZone = parseBracketList(m[2])[0] || '';

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? source (\[.+\]|\S+)/))) {
            getPolicy(m[1]).srcAddr = parseBracketList(m[2]);

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? destination (\[.+\]|\S+)/))) {
            getPolicy(m[1]).dstAddr = parseBracketList(m[2]);

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? service (\[.+\]|\S+)/))) {
            getPolicy(m[1]).service = parseBracketList(m[2]);

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? action (allow|deny)/))) {
            getPolicy(m[1]).action = m[2];

        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? log-end (yes|no)/))) {
            getPolicy(m[1]).log = m[2] === 'yes';

        // ── NAT rules ───────────────────────────────────────────────────────────
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? source \[\s*([^\]]*?)\s*\]/))) {
            getNat(m[1]).origSrc = m[2];
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? destination \[\s*([^\]]*?)\s*\]/))) {
            getNat(m[1]).origDst = m[2];
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? destination-translation translated-address (\S+)/))) {
            const n = getNat(m[1]); n.transDst = m[2]; n.type = 'static';
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? source-translation dynamic-ip-and-port interface-address/))) {
            const n = getNat(m[1]); n.transSrc = 'interface'; n.type = 'dynamic';
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? to-interface (\S+)/))) {
            getNat(m[1]).iface = m[2];
        } else if ((m = t.match(/^set rulebase nat rules "?([^"\s]+)"? source-translation (?:static-ip static-translated-address|dynamic-ip-and-port translated-address) (\S+)/))) {
            const n = getNat(m[1]); n.transSrc = m[2]; n.type = n.type || 'dynamic';

        // ── IPsec (IKE gateway / tunnel) ────────────────────────────────────────
        } else if ((m = t.match(/^set network ike gateway "?([^"\s]+)"? interface (\S+)/))) {
            getTunnel(m[1]).iface = m[2];
        } else if ((m = t.match(/^set network ike gateway "?([^"\s]+)"? peer-address ip (\S+)/))) {
            getTunnel(m[1]).remoteGw = m[2];
        } else if ((m = t.match(/^set network ike gateway "?([^"\s]+)"? authentication pre-shared-key key (\S+)/))) {
            getTunnel(m[1]).psk = m[2];
        } else if ((m = t.match(/^set network tunnel ipsec "?([^"\s]+)"? ike gateway "?([^"\s]+)"?/))) {
            const t2 = getTunnel(m[2]); t2.p2Name = m[1];
        } else if ((m = t.match(/^set network tunnel ipsec "?([^"\s]+)"? auto-key proxy-id "?[^"\s]+"? local (\S+)/))) {
            const owner = ir.vpnTunnels.find(x => x.p2Name === m[1]);
            if (owner) owner.localSubnet = m[2];
        } else if ((m = t.match(/^set network tunnel ipsec "?([^"\s]+)"? auto-key proxy-id "?[^"\s]+"? remote (\S+)/))) {
            const owner = ir.vpnTunnels.find(x => x.p2Name === m[1]);
            if (owner) owner.remoteSubnet = m[2];

        // ── HA ──────────────────────────────────────────────────────────────────
        } else if ((m = t.match(/^set deviceconfig high-availability group (\S+) mode/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.groupId = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability group \S+ election-option device-priority (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.priority = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability interface ha1 port (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.ha1 = ir.ha.ha1 || {}; ir.ha.ha1.iface = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability interface ha1 ip-address (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.ha1 = ir.ha.ha1 || {}; ir.ha.ha1.ip = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability interface ha1 gateway (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.ha1 = ir.ha.ha1 || {}; ir.ha.ha1.peerIp = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability interface ha2 port (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.ha2 = ir.ha.ha2 || {}; ir.ha.ha2.iface = m[1];
        } else if ((m = t.match(/^set deviceconfig high-availability interface ha2 ip-address (\S+)/))) {
            if (!ir.ha) ir.ha = {};
            ir.ha.ha2 = ir.ha.ha2 || {}; ir.ha.ha2.ip = m[1];

        // ── Security Profile Group ──────────────────────────────────────────────
        } else if ((m = t.match(/^set profile-group (\S+) virus (\S+)/))) {
            getUtm(m[1]).avName = m[2];
        } else if ((m = t.match(/^set profile-group (\S+) vulnerability (\S+)/))) {
            getUtm(m[1]).vulnName = m[2];
        } else if ((m = t.match(/^set profile-group (\S+) url-filtering (\S+)/))) {
            getUtm(m[1]).webfilterName = m[2];
        } else if ((m = t.match(/^set profile-group (\S+) spyware (\S+)/))) {
            getUtm(m[1]).spywareName = m[2];
        } else if ((m = t.match(/^set rulebase security rules "?([^"\s]+)"? profile-setting group \[\s*([^\]]*?)\s*\]/))) {
            getUtm(m[2]).ruleName = m[1];

        // ── SD-WAN ──────────────────────────────────────────────────────────────
        } else if ((m = t.match(/^set network sdwan interface (\S+) link-tag (\S+)/))) {
            if (!ir.sdwan) ir.sdwan = { members: [], healthCheck: null };
            let mem = ir.sdwan.members.find(x => x.iface === m[1]);
            if (!mem) { mem = { iface: m[1], gateway: '', cost: '0' }; ir.sdwan.members.push(mem); }
        } else if ((m = t.match(/^set network sdwan virtual-interface (\S+) weight (\S+)/))) {
            if (!ir.sdwan) ir.sdwan = { members: [], healthCheck: null };
            let mem = ir.sdwan.members.find(x => x.iface === m[1]);
            if (!mem) { mem = { iface: m[1], gateway: '', cost: '0' }; ir.sdwan.members.push(mem); }
            mem.weight = m[2];
        } else if ((m = t.match(/^set network sdwan interface (\S+) health-check server (\S+)/))) {
            if (!ir.sdwan) ir.sdwan = { members: [], healthCheck: null };
            ir.sdwan.healthCheck = ir.sdwan.healthCheck || { name: 'hc', server: '', latency: '150', jitter: '30' };
            ir.sdwan.healthCheck.server = m[2];
        } else if ((m = t.match(/^set network sdwan interface \S+ health-check failure-condition threshold (\S+)/))) {
            if (!ir.sdwan) ir.sdwan = { members: [], healthCheck: null };
            ir.sdwan.healthCheck = ir.sdwan.healthCheck || { name: 'hc', server: '', latency: '150', jitter: '30' };
            ir.sdwan.healthCheck.failThreshold = m[1];

        } else if (t && !t.startsWith('#') && !t.startsWith('set application') && !t.startsWith('set profiles') && !t.startsWith('set log-settings')
                   && !t.startsWith('set network ike crypto-profiles') && !t.startsWith('set network profiles interface-management-profile')
                   && !t.startsWith('set deviceconfig high-availability enabled') && !t.startsWith('set deviceconfig high-availability group') && !t.startsWith('set network virtual-router')
                   && !t.startsWith('commit')) {
            ir.unknowns.push(t);
        }
    }

    // Meta
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'paloalto';

    return ir;
}

CC_READERS['paloalto'] = ccReadPaloAlto;
