'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Check Point Gaia (clish) Reader ──────────────────────────────────────────
function ccReadCheckPoint(text) {
    const ir = ccEmptyIR();
    // Join continuation lines (ending with \) before parsing
    const rawLines = text.split('\n').map(l => l.trimEnd());
    const joinedLines = [];
    let pending = '';
    for (const raw of rawLines) {
        if (raw.trimEnd().endsWith('\\')) {
            pending += (pending ? ' ' : '') + raw.trimEnd().slice(0, -1).trim();
        } else if (pending) {
            pending += ' ' + raw.trim();
            joinedLines.push(pending.trim());
            pending = '';
        } else {
            joinedLines.push(raw);
        }
    }
    if (pending) joinedLines.push(pending.trim());
    const lines = joinedLines;
    const ifaceMap = {};

    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;
        let m;

        // ── Hostname ──────────────────────────────────────────────────────────
        if ((m = t.match(/^set hostname\s+(\S+)/))) {
            ir.hostname = m[1]; continue;
        }

        // ── Interface: IP address ─────────────────────────────────────────────
        if ((m = t.match(/^set interface\s+(\S+)\s+ipv4-address\s+(\S+)\s+mask-length\s+(\d+)/))) {
            const [, name, ip, prefix] = m;
            if (!ifaceMap[name]) ifaceMap[name] = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            ifaceMap[name].ip = ip;
            ifaceMap[name].mask = ccPrefixToMask(parseInt(prefix));
            continue;
        }

        // ── Interface: state ─────────────────────────────────────────────────
        if ((m = t.match(/^set interface\s+(\S+)\s+state\s+(on|off)/))) {
            const [, name, state] = m;
            if (!ifaceMap[name]) ifaceMap[name] = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            ifaceMap[name].shutdown = state === 'off';
            continue;
        }

        // ── Interface: description ────────────────────────────────────────────
        if ((m = t.match(/^set interface\s+(\S+)\s+comments\s+"?(.+)"?$/))) {
            const [, name, desc] = m;
            if (!ifaceMap[name]) ifaceMap[name] = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            ifaceMap[name].desc = desc.replace(/^"|"$/g, '');
            continue;
        }

        // ── Interface: mtu ────────────────────────────────────────────────────
        if ((m = t.match(/^set interface\s+(\S+)\s+mtu\s+(\d+)/))) {
            const [, name, mtu] = m;
            if (!ifaceMap[name]) ifaceMap[name] = { name, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            ifaceMap[name].mtu = parseInt(mtu, 10);
            continue;
        }

        // ── Interface: VLAN subif (add interface eth.X vlan N) ────────────────
        if ((m = t.match(/^add interface\s+(\S+)\s+vlan\s+(\d+)/))) {
            const [, parent, vid] = m;
            const subifName = parent + '.' + vid;
            if (!ifaceMap[subifName]) ifaceMap[subifName] = { name: subifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: 'access', access_vlan: parseInt(vid, 10), trunk_vlans: null, nameif: '', security_level: '' };
            else ifaceMap[subifName].access_vlan = parseInt(vid, 10);
            continue;
        }

        // ── Static routes ─────────────────────────────────────────────────────
        if ((m = t.match(/^set static-route\s+(\S+)\s+nexthop gateway address\s+(\S+)/))) {
            const [, cidr, gw] = m;
            const [net, prefix] = cidr.split('/');
            ir.routes.push({ network: net, mask: ccPrefixToMask(parseInt(prefix || '32')), nexthop: gw, metric: '1', iface: '' });
            continue;
        }

        // ── Address objects: host ──────────────────────────────────────────────
        // mgmt_cli: add host name NAME ipv4-address IP
        // legacy:   add host name NAME ip-address IP
        if ((m = t.match(/^add host name (\S+) (?:ipv4-address|ip-address) ([\d.]+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'host', value: m[2], mask: '255.255.255.255', members: [], description: '' });
            continue;
        }

        // ── Address objects: network ───────────────────────────────────────────
        // mgmt_cli: add network name NAME ipv4-address NET mask-length PREFIX
        // legacy:   add network name NAME subnet NET subnet-mask MASK
        if ((m = t.match(/^add network name (\S+) ipv4-address ([\d.]+) mask-length (\d+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'network', value: m[2], mask: ccPrefixToMask(parseInt(m[3])), members: [], description: '' });
            continue;
        }
        if ((m = t.match(/^add network name (\S+) subnet ([\d.]+) subnet-mask ([\d.]+)/))) {
            ir.addressObjects.push({ name: m[1], type: 'network', value: m[2], mask: m[3], members: [], description: '' });
            continue;
        }

        // ── Address groups ────────────────────────────────────────────────────
        // add network-group name NAME members NAME1 NAME2 ...
        if ((m = t.match(/^add network-group name (\S+) members (.+)/))) {
            const members = m[2].trim().split(/\s+/).filter(Boolean);
            ir.addressObjects.push({ name: m[1], type: 'group', value: '', mask: '', members, description: '' });
            continue;
        }

        // ── Service objects: TCP ──────────────────────────────────────────────
        // add service-tcp name NAME port PORT
        if ((m = t.match(/^add service-tcp name (\S+) port (\S+)/))) {
            ir.serviceObjects.push({ name: m[1], proto: 'tcp', ports: m[2], members: [], predefined: false });
            continue;
        }

        // ── Service objects: UDP ──────────────────────────────────────────────
        // add service-udp name NAME port PORT
        if ((m = t.match(/^add service-udp name (\S+) port (\S+)/))) {
            ir.serviceObjects.push({ name: m[1], proto: 'udp', ports: m[2], members: [], predefined: false });
            continue;
        }

        // ── Security policy (access-rule) ─────────────────────────────────────
        // add access-rule layer "Network" name "RULE" source "SRC" destination "DST" service "SVC" action "allow|drop|accept"
        if ((m = t.match(/^add access-rule\s+layer\s+"[^"]+"\s+name\s+"([^"]+)"\s+(.*)/))) {
            const ruleName = m[1];
            const rest = m[2];
            const getField = (key) => { const fm = rest.match(new RegExp(key + '\\s+"([^"]+)"')); return fm ? fm[1] : ''; };
            const src = getField('source');
            const dst = getField('destination');
            const svc = getField('service');
            const rawAction = getField('action');
            const action = (rawAction === 'allow' || rawAction === 'accept') ? 'allow' : 'deny';
            ir.securityPolicies.push({
                name: ruleName,
                seq: ir.securityPolicies.length,
                srcZone: '',
                dstZone: '',
                srcAddr: src ? [src] : [],
                dstAddr: dst ? [dst] : [],
                service: svc ? [svc] : [],
                action,
                log: true
            });
            continue;
        }

        // ── Silently skip: rule modifiers, NAT settings, publish/install ─────────
        if (t.startsWith('set access-rule') ||
            t.startsWith('mgmt_cli publish') ||
            t.startsWith('mgmt_cli install-policy') ||
            t.startsWith('set dns') || t.startsWith('set ntp') || t.startsWith('set timezone')) {
            continue;
        }

        ir.unknowns.push(t);
    }

    ir.interfaces = Object.values(ifaceMap);

    // Meta
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'checkpoint';

    return ir;
}

CC_READERS['checkpoint'] = ccReadCheckPoint;
