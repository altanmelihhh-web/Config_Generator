'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Juniper SRX Reader ────────────────────────────────────────────────────────
function ccReadJuniperSRX(text) {
    const ir = ccEmptyIR();
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'juniper-srx';
    const lines = text.split('\n').map(l => l.trimEnd());
    let m;
    for (const line of lines) {
        const t = line.trim();
        if (!t || t.startsWith('#')) continue;

        // Hostname
        if ((m = t.match(/^set system host-name (\S+)/))) { ir.hostname = m[1]; continue; }

        // Interface IP
        if ((m = t.match(/^set interfaces (\S+) unit 0 family inet address ([\d.]+)\/(\d+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', type: 'physical' }; ir.interfaces.push(ifc); }
            ifc.ip = m[2]; ifc.mask = ccPrefixToMask(parseInt(m[3]));
            continue;
        }

        // Static route
        if ((m = t.match(/^set routing-options static route ([\d.]+)\/(\d+) next-hop ([\d.]+)/))) {
            ir.routes.push({ network: m[1], mask: ccPrefixToMask(parseInt(m[2])), nexthop: m[3], metric: '1', iface: '' });
            continue;
        }

        // Security zones
        if ((m = t.match(/^set security zones security-zone (\S+) interfaces (\S+)/))) {
            let zone = ir.zones.find(z => z.name === m[1]);
            if (!zone) { zone = { name: m[1], interfaces: [], description: '', trust_level: 0 }; ir.zones.push(zone); }
            zone.interfaces.push(m[2]);
            continue;
        }

        // Address book (zone-based)
        if ((m = t.match(/^set security zones security-zone (\S+) address-book address (\S+) ([\d.]+\/[\d]+)/))) {
            const [, zone, name, cidr] = m;
            const [ip, pre] = cidr.split('/');
            ir.addressObjects.push({ name: zone + '_' + name, type: parseInt(pre) === 32 ? 'host' : 'network', value: ip, mask: ccPrefixToMask(parseInt(pre)), members: [], description: 'zone:' + zone });
            continue;
        }

        // Global address book
        if ((m = t.match(/^set security address-book global address (\S+) ([\d.]+\/[\d]+)/))) {
            const [, name, cidr] = m;
            const [ip, pre] = cidr.split('/');
            ir.addressObjects.push({ name, type: parseInt(pre) === 32 ? 'host' : 'network', value: ip, mask: ccPrefixToMask(parseInt(pre)), members: [], description: '' });
            continue;
        }

        // Security policies — source-address
        if ((m = t.match(/^set security policies from-zone (\S+) to-zone (\S+) policy (\S+) match source-address (\S+)/))) {
            let pol = ir.securityPolicies.find(p => p.name === m[3] && p.srcZone === m[1] && p.dstZone === m[2]);
            if (!pol) { pol = { name: m[3], seq: ir.securityPolicies.length + 1, srcZone: m[1], dstZone: m[2], srcAddr: [], dstAddr: [], service: [], action: 'allow', log: true, schedule: 'always', profile: {} }; ir.securityPolicies.push(pol); }
            pol.srcAddr.push(m[4]);
            continue;
        }
        // Security policies — destination-address
        if ((m = t.match(/^set security policies from-zone (\S+) to-zone (\S+) policy (\S+) match destination-address (\S+)/))) {
            let pol = ir.securityPolicies.find(p => p.name === m[3] && p.srcZone === m[1] && p.dstZone === m[2]);
            if (!pol) { pol = { name: m[3], seq: ir.securityPolicies.length + 1, srcZone: m[1], dstZone: m[2], srcAddr: [], dstAddr: [], service: [], action: 'allow', log: true, schedule: 'always', profile: {} }; ir.securityPolicies.push(pol); }
            pol.dstAddr.push(m[4]);
            continue;
        }
        // Security policies — application
        if ((m = t.match(/^set security policies from-zone (\S+) to-zone (\S+) policy (\S+) match application (\S+)/))) {
            const pol = ir.securityPolicies.find(p => p.name === m[3] && p.srcZone === m[1] && p.dstZone === m[2]);
            if (pol) pol.service.push(m[4]);
            continue;
        }
        // Security policies — action
        if ((m = t.match(/^set security policies from-zone (\S+) to-zone (\S+) policy (\S+) then (permit|deny|reject)/))) {
            const pol = ir.securityPolicies.find(p => p.name === m[3] && p.srcZone === m[1] && p.dstZone === m[2]);
            if (pol) pol.action = m[4] === 'permit' ? 'allow' : 'deny';
            continue;
        }

        // NAT rules (source NAT) — match source-address
        if ((m = t.match(/^set security nat source rule-set (\S+) rule (\S+) match source-address ([\d./]+)/))) {
            let nat = ir.natRules.find(n => n._ruleName === m[2]);
            if (!nat) { nat = { type: 'dynamic', origSrc: m[3], transSrc: '', origDst: 'any', transDst: '', iface: '', bidirectional: false, _ruleName: m[2] }; ir.natRules.push(nat); }
            else { nat.origSrc = m[3]; }
            continue;
        }
        // NAT rules (source NAT) — then source-nat interface
        if ((m = t.match(/^set security nat source rule-set (\S+) rule (\S+) then source-nat interface/))) {
            let nat = ir.natRules.find(n => n._ruleName === m[2]);
            if (!nat) { nat = { type: 'dynamic', origSrc: 'any', transSrc: 'interface', origDst: 'any', transDst: '', iface: '', bidirectional: false, _ruleName: m[2] }; ir.natRules.push(nat); }
            else { nat.transSrc = 'interface'; }
            continue;
        }
    }
    ir.natRules.forEach(n => delete n._ruleName);
    return ir;
}
CC_READERS['juniper-srx'] = ccReadJuniperSRX;

// ── Juniper JunOS Reader ──────────────────────────────────────────────────────
function ccReadJuniper(text) {
    const ir = ccEmptyIR();
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    const rpmType = t => /^(icmp|icmp-ping|ping)$/i.test(t || '') ? 'icmp-echo' : t;

    // Helper: ensure an OSPF process exists (use process_id '1' as default)
    function ensureOspf() {
        if (ir.ospf.length === 0) ir.ospf.push({ process_id: '1', router_id: '', areas: [] });
        return ir.ospf[0];
    }

    // Helper: ensure a BGP object exists
    function ensureBgp() {
        if (!ir.bgp) ir.bgp = { as_number: '', router_id: '', neighbors: [], networks: [] };
        return ir.bgp;
    }

    while (i < lines.length) {
        const line = lines[i].trim();
        let m;

        // ── Hostname ──────────────────────────────────────────────────────────
        if ((m = line.match(/^set system host-name (\S+)/))) {
            ir.hostname = m[1];

        // ── System: DNS ───────────────────────────────────────────────────────
        } else if ((m = line.match(/^set system name-server (\S+)/))) {
            ir.system.dns.push(m[1]);

        // ── System: NTP ───────────────────────────────────────────────────────
        } else if ((m = line.match(/^set system ntp server (\S+)/))) {
            ir.system.ntp.push(m[1]);

        // ── System: Syslog ────────────────────────────────────────────────────
        } else if ((m = line.match(/^set system syslog host (\S+)/))) {
            ir.system.syslog.push(m[1]);

        // ── System: SNMP ──────────────────────────────────────────────────────
        } else if ((m = line.match(/^set snmp community (\S+) authorization (read-only|read-write)/))) {
            ir.system.snmp = { community: m[1], access: m[2] === 'read-write' ? 'rw' : 'ro' };
        } else if ((m = line.match(/^set snmp community (\S+)$/))) {
            ir.system.snmp = { community: m[1], access: 'ro' };

        // ── SNMPv3: user auth/priv ────────────────────────────────────────────
        } else if ((m = line.match(/^set snmp v3 usm local-engine user (\S+) authentication-(sha|md5) authentication-password (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            u.auth_proto = m[2].toLowerCase(); u.auth_pwd = m[3];

        } else if ((m = line.match(/^set snmp v3 usm local-engine user (\S+) privacy-(aes128|aes192|aes256|des) privacy-password (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            u.priv_proto = m[2].toLowerCase(); u.priv_pwd = m[3];

        // "authentication-key" — "authentication-password" ile eşdeğer (Junos'ta
        // aynı alanı düz metin olarak girmenin iki farklı komut biçimi)
        } else if ((m = line.match(/^set snmp v3 usm local-engine user (\S+) authentication-(sha|md5) authentication-key (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            u.auth_proto = m[2].toLowerCase(); u.auth_pwd = m[3];

        } else if ((m = line.match(/^set snmp v3 usm local-engine user (\S+) privacy-none/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: '', auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            u.priv_proto = 'none';

        // ── SNMPv3 VACM erişim/görünüm eşlemeleri — NX-OS'ta özel grup+view
        // modeli desteklenmiyor (sadece network-admin/network-operator gibi
        // yerleşik roller var), bu yüzden yapısal olarak yakalanıp writer'da
        // açıkça 'unsupported' olarak raporlanır — sessizce atlanmaz.
        } else if ((m = line.match(/^set snmp v3 vacm access group (\S+) \S+ security-model (\S+) security-level (\S+) read-view (\S+)/i))) {
            ir.system.snmpVacmAccess = ir.system.snmpVacmAccess || [];
            ir.system.snmpVacmAccess.push({ group: m[1], model: m[2], level: m[3], readView: m[4] });

        } else if (line.startsWith('set snmp v3 vacm access group ')) {
            const gm = line.match(/^set snmp v3 vacm access group (\S+)/);
            if (gm) {
                ir.system.snmpVacmAccess = ir.system.snmpVacmAccess || [];
                if (!ir.system.snmpVacmAccess.some(a => a._raw === line)) {
                    ir.system.snmpVacmAccess.push({ group: gm[1], _raw: line });
                }
            }

        } else if ((m = line.match(/^set snmp view (\S+) oid (\S+) (include|exclude)/i))) {
            ir.system.snmpViews = ir.system.snmpViews || [];
            ir.system.snmpViews.push({ name: m[1], subtree: m[2], type: m[3].toLowerCase() === 'include' ? 'included' : 'excluded' });

        } else if (line.startsWith('set protocols igmp-snooping')) {
            // NX-OS'ta IGMP snooping varsayılan olarak açık — writer bunu bilgi
            // amaçlı raporlar, komut üretmeye gerek yok.
            ir.system.igmpSnooping = true;

        } else if ((m = line.match(/^set snmp v3 vacm security-to-group security-model usm security-name (\S+) group (\S+)/i))) {
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            let u = ir.system.snmp_v3_users.find(x => x.user === m[1]);
            if (!u) { u = { user: m[1], group: m[2], auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' }; ir.system.snmp_v3_users.push(u); }
            else u.group = m[2];

        } else if (line.startsWith('set snmp description ')) {
            ir.system.snmpDescription = line.slice('set snmp description '.length).trim();

        } else if (line.startsWith('set snmp location ')) {
            ir.system.snmpLocation = line.slice('set snmp location '.length).trim();

        } else if (line.startsWith('set snmp contact ')) {
            ir.system.snmpContact = line.slice('set snmp contact '.length).trim().replace(/^"|"$/g, '');

        // ── Kullanıcı hesapları (set system login user) ────────────────────────
        } else if ((m = line.match(/^set system login user (\S+) uid (\d+)/))) {
            ir.system.users = ir.system.users || [];
            let u = ir.system.users.find(x => x.name === m[1]);
            if (!u) { u = { name: m[1], privilege: '', secretHash: '' }; ir.system.users.push(u); }

        } else if ((m = line.match(/^set system login user (\S+) class (\S+)/))) {
            ir.system.users = ir.system.users || [];
            let u = ir.system.users.find(x => x.name === m[1]);
            if (!u) { u = { name: m[1], privilege: '', secretHash: '' }; ir.system.users.push(u); }
            // Junos login class'ları Cisco/Huawei privilege seviyesine birebir eşlenmiyor;
            // en yaygın "super-user" == tam yetki (15), diğerleri kısıtlı (5) olarak yaklaşık eşlenir.
            u.privilege = m[2] === 'super-user' ? 15 : 5;
            u._juniperClass = m[2];

        } else if ((m = line.match(/^set system login user (\S+) authentication encrypted-password/))) {
            ir.system.users = ir.system.users || [];
            let u = ir.system.users.find(x => x.name === m[1]);
            if (!u) { u = { name: m[1], privilege: '', secretHash: '' }; ir.system.users.push(u); }
            u.secretHash = '(junos-encrypted-password)';

        } else if (line.startsWith('set system login retry-options ') || line.startsWith('set system login idle-timeout ')) {
            ir.system.loginSecurity = ir.system.loginSecurity || {};
            const ro = line.match(/^set system login retry-options (\S+) (\d+)/);
            if (ro) ir.system.loginSecurity[ro[1].replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = parseInt(ro[2]);
            const it = line.match(/^set system login idle-timeout (\d+)/);
            if (it) ir.system.loginSecurity.idleTimeout = parseInt(it[1]);

        } else if (line.startsWith('set system login class ') || line.startsWith('set system login message ')) {
            // login class izin/regex tanımları ve banner metni — cihaza/CLI'ya özgü,
            // hedef platformda karşılığı riskli olacağından manuel bırakılır
            if (line.startsWith('set system login class ')) {
                ir.system.loginClassCount = (ir.system.loginClassCount || 0) + 1;
            }

        // ── SSH servisi ──────────────────────────────────────────────────────
        } else if (line.startsWith('set system services ssh ')) {
            ir.system.ssh = ir.system.ssh || {};
            const cl = line.match(/^set system services ssh connection-limit (\d+)/);
            if (cl) ir.system.ssh.connectionLimit = parseInt(cl[1]);
            const cipher = line.match(/^set system services ssh ciphers (\S+)/);
            if (cipher) { ir.system.ssh.algorithms = ir.system.ssh.algorithms || []; ir.system.ssh.algorithms.push('cipher ' + cipher[1]); }
            const mac = line.match(/^set system services ssh macs (\S+)/);
            if (mac) { ir.system.ssh.algorithms = ir.system.ssh.algorithms || []; ir.system.ssh.algorithms.push('mac ' + mac[1]); }
        } else if (line === 'set system services ssh') {
            ir.system.ssh = ir.system.ssh || {};

        // ── Log dosyaları / syslog ───────────────────────────────────────────
        } else if ((m = line.match(/^set system syslog file (\S+) /))) {
            ir.system.logging = ir.system.logging || {};
            ir.system.logging.files = ir.system.logging.files || [];
            if (!ir.system.logging.files.includes(m[1])) ir.system.logging.files.push(m[1]);

        } else if (line.startsWith('set system syslog user ')) {
            ir.system.logging = ir.system.logging || {};
            ir.system.logging.userAlerts = true;

        // ── LLDP ─────────────────────────────────────────────────────────────
        } else if (line.startsWith('set protocols lldp interface ') || line === 'set protocols lldp') {
            ir.system.lldp = true;
        } else if (line.startsWith('set protocols lldp-med')) {
            // lldp-med — lldp'nin bir uzantısı, ayrı bir bayrak gerekmiyor

        // ── Saat dilimi ──────────────────────────────────────────────────────
        } else if ((m = line.match(/^set system time-zone (\S+)/))) {
            ir.system.timeZoneName = m[1];

        // ── Cihaza / platforma özgü ayarlar — taşınabilir karşılığı yok, sessizce atlanır ──
        } else if (
            line.startsWith('set system root-authentication') ||
            line === 'set system commit synchronize' ||
            line === 'set system auto-snapshot' ||
            line.startsWith('set system archival') ||
            line.startsWith('set system ntp boot-server') ||
            line.startsWith('set chassis ') ||
            line.startsWith('set security ssh-known-hosts') ||
            line.startsWith('set forwarding-options storm-control-profiles') ||
            line === 'set system services ftp'
        ) {
            // sessizce atlanır — cihaza/platforma özgü, taşınabilir karşılığı yok

        // ── Voice VLAN: VOIP interface vlan ───────────────────────────────────
        } else if ((m = line.match(/^set ethernet-switching-options voip interface (\S+) vlan (\S+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc._pendingVoiceVlanName = m[2]; // VLAN id'sini post-pass'te çöz

        // ── Trunk native vlan ─────────────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 family ethernet-switching native-vlan-id (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.native_vlan = parseInt(m[2]);

        // ── Port-security: secure-access-port mac-limit ───────────────────────
        } else if ((m = line.match(/^set ethernet-switching-options secure-access-port interface (\S+) mac-limit (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.port_security = Object.assign(ifc.port_security || { enabled: true }, { max: parseInt(m[2]) });

        // ── DHCP-security: trusted interface ──────────────────────────────────
        } else if ((m = line.match(/^set forwarding-options dhcp-security group (\S+) interface (\S+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[2]);
            if (!ifc) { ifc = { name: m[2], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.dhcp_snoop_trust = true;
            ir.dhcpSnooping = ir.dhcpSnooping || {};
            ir.dhcpSnooping.enabled = true;

        // ── LACP: bundle ae N mode ────────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces ae(\d+) aggregated-ether-options lacp (active|passive)/))) {
            const b = ccEnsureBundle(ir, parseInt(m[1]));
            b.mode = m[2] === 'active' ? 'lacp-active' : 'lacp-passive';

        // ── LACP: physical 802.3ad → ae binding ──────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) ether-options 802\.3ad ae(\d+)/))) {
            const b = ccEnsureBundle(ir, parseInt(m[2]));
            if (!b.members.includes(m[1])) b.members.push(m[1]);

        // ── Interface: IRB unit (L3 VLAN interface) ──────────────────────────
        } else if ((m = line.match(/^set interfaces irb unit (\d+) family inet address ([\d.]+)\/(\d+)/))) {
            const vid = parseInt(m[1]);
            let v = ir.vlans.find(vv => vv.id === vid);
            if (!v) { v = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(v); }
            v.svi_ip = m[2];
            v.svi_mask = ccPrefixToMask(parseInt(m[3]));

        // ── VLAN: l3-interface binding ────────────────────────────────────────
        } else if ((m = line.match(/^set vlans (\S+) l3-interface irb\.(\d+)/))) {
            const vid = parseInt(m[2]);
            let v = ir.vlans.find(vv => vv.id === vid);
            if (!v) { v = { id: vid, name: m[1], svi_ip: '', svi_mask: '' }; ir.vlans.push(v); }
            else if (!v.name) v.name = m[1];

        // ── Interface: L3 IP ─────────────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 family inet address ([\d.]+)\/(\d+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.ip = m[2];
            ifc.mask = ccPrefixToMask(parseInt(m[3]));
            ifc.no_switchport = true;

        // ── Interface: Router L3 subinterface IP (unit N, N>0) ──────────────
        // "set interfaces ge-0/0/0 unit 100 family inet address 10.10.10.1/24"
        // → subif olarak `<parent>.<unit>` iface'i oluştur
        } else if ((m = line.match(/^set interfaces (\S+) unit ([1-9]\d*) family inet address ([\d.]+)\/(\d+)/))) {
            const parent = m[1];
            const unit = parseInt(m[2], 10);
            const subName = parent + '.' + unit;
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) {
                ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: unit, trunk_vlans: null, nameif: '', security_level: '' };
                ifc._subif = ccBuildSubif(parent, unit, unit);
                ir.interfaces.push(ifc);
            }
            ifc.ip = m[3];
            ifc.mask = ccPrefixToMask(parseInt(m[4]));
            ifc.no_switchport = true;

        // ── Interface: Subif vlan-id (unit N vlan-id M) ──────────────────────
        // "set interfaces ge-0/0/0 unit 100 vlan-id 100"
        } else if ((m = line.match(/^set interfaces (\S+) unit ([1-9]\d*) vlan-id (\d+)/))) {
            const parent = m[1];
            const unit = parseInt(m[2], 10);
            const vid = parseInt(m[3], 10);
            const subName = parent + '.' + unit;
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) {
                ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: vid, trunk_vlans: null, nameif: '', security_level: '' };
                ifc._subif = ccBuildSubif(parent, unit, vid);
                ir.interfaces.push(ifc);
            } else {
                ifc.access_vlan = vid;
                if (!ifc._subif) ifc._subif = ccBuildSubif(parent, unit, vid);
                else ifc._subif.encapsulation.vlan = vid;
            }

        // ── Interface: Parent vlan-tagging flag (subif marker) ───────────────
        } else if ((m = line.match(/^set interfaces (\S+) vlan-tagging/))) {
            // Parent flag — IR'da explicit field gerekmiyor; subif'lerin varlığı ima ediyor
            // Sadece parent iface'i kayıt et (mevcut değilse)
            const parent = m[1];
            if (!ir.interfaces.find(f => f.name === parent)) {
                ir.interfaces.push({ name: parent, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', no_switchport: true });
            }

        // ── Interface: Native subif (parent native-vlan-id) ──────────────────
        } else if ((m = line.match(/^set interfaces (\S+) native-vlan-id (\d+)/))) {
            const parent = m[1];
            const vid = parseInt(m[2], 10);
            // Native subif'i bul ve native flag set et
            const subName = parent + '.' + vid;
            const ifc = ir.interfaces.find(f => f.name === subName);
            if (ifc) {
                ifc.native_vlan = vid;
                if (ifc._subif) ifc._subif.encapsulation.native = true;
            }

        // ── Interface: Subif description (unit N description ...) ────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit ([1-9]\d*) description "?([^"]+)"?/))) {
            const subName = m[1] + '.' + m[2];
            let ifc = ir.interfaces.find(f => f.name === subName);
            if (!ifc) {
                const unit = parseInt(m[2], 10);
                ifc = { name: subName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: unit, trunk_vlans: null, nameif: '', security_level: '' };
                ifc._subif = ccBuildSubif(m[1], unit, unit);
                ir.interfaces.push(ifc);
            }
            ifc.desc = m[3];

        // ── Interface: description ────────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) description "?([^"]+)"?/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.desc = m[2];

        // ── Interface: unit 0 description ("set interfaces X unit 0 description Y")
        // — L2 switchport arayüzlerinde description'ın unit 0 altında verildiği
        // yaygın Junos idiom'u; yukarıdaki iki regex'e uymuyor (ne subif [1-9]
        // ne de doğrudan "description" — arada "unit 0" var).
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 description "?([^"]+)"?/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.desc = m[2];

        // ── Interface: fiziksel port hızı ("set interfaces X speed 1g") ───────
        } else if ((m = line.match(/^set interfaces (\S+) speed (\S+)/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            const mbps = ccJunosSpeedToMbps(m[2]);
            if (mbps) ifc.speed = mbps;
            else ccDropField(ir, 'interface', m[1], 'speed', m[2], 'speed-unit-not-recognized-verify-manually', 'cisco-nxos', 'partial');

        // ── Interface: unit 0 disable (mantıksal/L2 port devre dışı) ──────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 disable/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.shutdown = true;

        // ── Interface: fiziksel port disable ───────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) disable$/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.shutdown = true;

        // ── Bundle: flow-control + link-speed (LACP bundle üyelerine post-pass'te uygulanır) ──
        } else if ((m = line.match(/^set interfaces ae(\d+) aggregated-ether-options flow-control/))) {
            const b = ccEnsureBundle(ir, parseInt(m[1]));
            b.flowControl = true;

        } else if ((m = line.match(/^set interfaces ae(\d+) aggregated-ether-options link-speed (\S+)/))) {
            const b = ccEnsureBundle(ir, parseInt(m[1]));
            const mbps = ccJunosSpeedToMbps(m[2]);
            if (mbps) b.linkSpeed = mbps;
            else ccDropField(ir, 'interface', 'ae' + m[1], 'link-speed', m[2], 'speed-unit-not-recognized-verify-manually', 'cisco-nxos', 'partial');

        // ── Interface: L2 access mode ─────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 family ethernet-switching (?:interface-mode|port-mode) access/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.vlan_mode = 'access';

        // ── Interface: L2 trunk mode ──────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 family ethernet-switching (?:interface-mode|port-mode) trunk/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.vlan_mode = 'trunk';

        // ── Interface: L2 vlan member (single or [ A B ] array) ───────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit 0 family ethernet-switching vlan members (.+)$/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            const raw = m[2].trim();
            const memberNames = raw.startsWith('[')
                ? raw.replace(/[\[\]]/g, '').trim().split(/\s+/).filter(Boolean)
                : raw.split(/\s+/).filter(Boolean);
            // Tek isim ve VLAN bilinmiyor → access; çoklu/array → trunk
            // Resolve şu an yapılır (vlan zaten varsa), sonradan post-pass'te kalanlar çözülür
            if (memberNames.length === 1 && ifc.vlan_mode !== 'trunk') {
                ifc._pendingAccessName = memberNames[0];
            } else {
                ifc._pendingTrunkNames = (ifc._pendingTrunkNames || []).concat(memberNames);
            }

        // ── VLANs ─────────────────────────────────────────────────────────────
        } else if ((m = line.match(/^set vlans (\S+) vlan-id (\d+)/))) {
            let vlan = ir.vlans.find(v => v.id === parseInt(m[2]));
            if (!vlan) { vlan = { id: parseInt(m[2]), name: m[1], svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }

        // ── Static Routes ─────────────────────────────────────────────────────
        } else if ((m = line.match(/^set routing-options static route ([\d.]+)\/(\d+) next-hop ([\d.]+)/))) {
            ir.routes.push({ network: m[1], mask: ccPrefixToMask(parseInt(m[2])), nexthop: m[3], metric: '1', iface: '' });

        // ── Router-ID (shared by OSPF and BGP) ───────────────────────────────
        } else if ((m = line.match(/^set routing-options router-id ([\d.]+)/))) {
            ensureOspf().router_id = m[1];
            ensureBgp().router_id = m[1];

        // ── BGP: AS number ────────────────────────────────────────────────────
        } else if ((m = line.match(/^set routing-options autonomous-system (\S+)/))) {
            ensureBgp().as_number = m[1];

        // ── BGP: neighbor peer-as ─────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols bgp group \S+ neighbor (\S+) peer-as (\S+)/))) {
            const bgp = ensureBgp();
            let nb = bgp.neighbors.find(n => n.ip === m[1]);
            if (!nb) { nb = { ip: m[1], remote_as: m[2], desc: '' }; bgp.neighbors.push(nb); }
            else { nb.remote_as = m[2]; }

        // ── BGP: neighbor description ─────────────────────────────────────────
        } else if ((m = line.match(/^set protocols bgp group \S+ neighbor (\S+) description "?([^"]*)"?/))) {
            const bgp = ensureBgp();
            let nb = bgp.neighbors.find(n => n.ip === m[1]);
            if (!nb) { nb = { ip: m[1], remote_as: '', desc: m[2] }; bgp.neighbors.push(nb); }
            else { nb.desc = m[2]; }

        } else if ((m = line.match(/^set protocols bgp group \S+ neighbor (\S+) bfd-liveness-detection /))) {
            const bgp = ensureBgp();
            let nb = bgp.neighbors.find(n => n.ip === m[1]);
            if (!nb) { nb = { ip: m[1], remote_as: '', desc: '', bfd: true }; bgp.neighbors.push(nb); }
            else nb.bfd = true;

        // ── BGP: neighbor (bare — just the IP, no sub-keyword) ───────────────
        } else if ((m = line.match(/^set protocols bgp group (\S+) neighbor (\S+)$/))) {
            const bgp = ensureBgp();
            bgp._groups = bgp._groups || {};
            bgp._groups[m[1]] = bgp._groups[m[1]] || {};
            let nb = bgp.neighbors.find(n => n.ip === m[2]);
            if (!nb) { nb = { ip: m[2], remote_as: '', desc: '', _group: m[1] }; bgp.neighbors.push(nb); }
            else if (!nb._group) nb._group = m[1];

        // ── BGP: group-level peer-as (Juniper style) ─────────────────────────
        } else if ((m = line.match(/^set protocols bgp group (\S+) peer-as (\S+)$/))) {
            const bgp = ensureBgp();
            bgp._groups = bgp._groups || {};
            bgp._groups[m[1]] = bgp._groups[m[1]] || {};
            bgp._groups[m[1]].peer_as = m[2];
            // mevcut neighbor'ları güncelle
            bgp.neighbors.forEach(n => { if (n._group === m[1] && !n.remote_as) n.remote_as = m[2]; });

        // ── BGP: group type external (silent consume) ────────────────────────
        } else if ((m = line.match(/^set protocols bgp group (\S+) type (external|internal)$/))) {
            // silent consume

        // ── BGP: group export policy (silent consume) ────────────────────────
        } else if ((m = line.match(/^set protocols bgp group (\S+) export (\S+)$/))) {
            const bgp = ensureBgp();
            bgp._exportPolicies = bgp._exportPolicies || [];
            if (!bgp._exportPolicies.includes(m[2])) bgp._exportPolicies.push(m[2]);

        // ── BGP export prefix-list plumbing ──────────────────────────────────
        } else if ((m = line.match(/^set policy-options prefix-list (\S+) ([\d.]+\/\d+)$/))) {
            ir._prefixLists = ir._prefixLists || {};
            ir._prefixLists[m[1]] = ir._prefixLists[m[1]] || [];
            if (!ir._prefixLists[m[1]].includes(m[2])) ir._prefixLists[m[1]].push(m[2]);
        } else if ((m = line.match(/^set policy-options policy-statement (\S+) term \S+ from prefix-list (\S+)$/))) {
            ir._policyPrefixLists = ir._policyPrefixLists || {};
            ir._policyPrefixLists[m[1]] = ir._policyPrefixLists[m[1]] || [];
            if (!ir._policyPrefixLists[m[1]].includes(m[2])) ir._policyPrefixLists[m[1]].push(m[2]);
        } else if ((m = line.match(/^set policy-options policy-statement (\S+) term \S+ from route-filter ([\d.]+\/\d+)/))) {
            ir._policyRouteFilters = ir._policyRouteFilters || {};
            ir._policyRouteFilters[m[1]] = ir._policyRouteFilters[m[1]] || [];
            if (!ir._policyRouteFilters[m[1]].includes(m[2])) ir._policyRouteFilters[m[1]].push(m[2]);

        // ── Policy-options policy-statement (silent consume — BGP plumbing) ──
        } else if ((m = line.match(/^set policy-options policy-statement /))) {
            // silent consume

        // ── Routing-instances instance-type / rib-groups (silent consume) ────
        } else if ((m = line.match(/^set routing-instances \S+ instance-type/))) {
            // silent consume
        } else if ((m = line.match(/^set routing-options rib-groups /))) {
            // silent consume
        } else if ((m = line.match(/^set routing-options interface-routes rib-group/))) {
            // silent consume

        // ── Filter input/output attach to interface ──────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) unit (\d+) family inet filter (input|output) (\S+)/i))) {
            const ifName = m[1];
            const direction = m[3];
            const filterName = m[4];
            if (ifName === 'irb') {
                const vid = parseInt(m[2]);
                let vlan = ir.vlans.find(v => v.id === vid);
                if (!vlan) { vlan = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }
                if (direction === 'input') vlan._filterIn = filterName;
                else vlan._filterOut = filterName;
            } else {
                let ifc = ir.interfaces.find(f => f.name === ifName);
                if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
                if (direction === 'input') ifc._filterIn = filterName;
                else ifc._filterOut = filterName;
            }

        } else if ((m = line.match(/^set interfaces (irb unit (\d+)|\S+\.\d+) family inet filter (input|output) (\S+)/i))) {
            const filterName = m[4];
            const direction = m[3];
            if (m[2]) {
                // irb unit N → vlan SVI'ya bağla (PBR için pbr_route_map kullan)
                const vid = parseInt(m[2]);
                let vlan = ir.vlans.find(v => v.id === vid);
                if (!vlan) { vlan = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }
                if (direction === 'input') vlan._filterIn = filterName;
                else vlan._filterOut = filterName;
            } else {
                // Regular interface
                const ifName = m[1].split('.')[0];
                let ifc = ir.interfaces.find(f => f.name === ifName);
                if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
                if (direction === 'input') ifc._filterIn = filterName;
                else ifc._filterOut = filterName;
            }

        // ── Class-of-service (QoS) ───────────────────────────────────────────
        } else if ((m = line.match(/^set class-of-service schedulers (\S+) transmit-rate percent (\d+)/i))) {
            ir._cosSchedulers = ir._cosSchedulers || {};
            ir._cosSchedulers[m[1]] = { priority_pct: parseInt(m[2]) };
        } else if ((m = line.match(/^set class-of-service scheduler-maps (\S+) forwarding-class (\S+) scheduler (\S+)/i))) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            let pm = ir.qos.policyMaps.find(p => p.name === m[1]);
            if (!pm) { pm = { name: m[1], classes: [] }; ir.qos.policyMaps.push(pm); }
            const sched = (ir._cosSchedulers || {})[m[3]] || {};
            const fc = m[2].toUpperCase() + '-EF';
            pm.classes.push({ name: fc, action: 'priority', priority_pct: sched.priority_pct || 0, fair_queue: false });
            // class-map equivalent (dscp ef typical for voice)
            if (!ir.qos.classMaps.find(c => c.name === fc)) {
                ir.qos.classMaps.push({ name: fc, match_type: 'any', match_dscp: 'ef', match_acl: '' });
            }
        } else if ((m = line.match(/^set class-of-service interfaces (\S+) scheduler-map (\S+)/i))) {
            const ifName = m[1].split('.')[0];
            let ifc = ir.interfaces.find(f => f.name === ifName);
            if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.service_policy = ifc.service_policy || {};
            ifc.service_policy.output = m[2];
        } else if (line.startsWith('set class-of-service classifiers') || line.startsWith('set class-of-service forwarding-classes')) {
            // silent consume (helper definitions, used by scheduler-maps)

        // ── RPM probe-count / probe-interval extras ──────────────────────────
        } else if ((m = line.match(/^set services rpm probe (\S+) test (\S+) probe-count (\d+)/i))) {
            // probe-count zaten reader'da default 3 ile yazılıyor, silent consume
            ir.ipSla = ir.ipSla || [];
            let sla = ir.ipSla.find(s => s.name === m[1]);
            if (!sla) { sla = { id: ir.ipSla.length + 1, name: m[1], type: rpmType(m[2]), target: '', source_iface: '', frequency: 60 }; ir.ipSla.push(sla); }

        // ── MTU per-interface ─────────────────────────────────────────────────
        } else if ((m = line.match(/^set interfaces (\S+) mtu (\d+)/i))) {
            const ifName = m[1];
            // ae bundle ise bundle'a yaz
            if (/^ae\d+$/i.test(ifName)) {
                const b = ccEnsureBundle(ir, parseInt(ifName.slice(2)));
                b.mtu = parseInt(m[2]);
            } else {
                let ifc = ir.interfaces.find(f => f.name === ifName);
                if (!ifc) { ifc = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
                ifc.mtu = parseInt(m[2]);
            }

        // ── VRRP ──────────────────────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols vrrp interface irb\.(\d+) group (\d+) virtual-address ([\d.]+)/i))) {
            ir.vrrp = ir.vrrp || [];
            const vid = parseInt(m[1]), gid = parseInt(m[2]);
            let v = ir.vrrp.find(x => x.vlan_id === vid && x.group_id === gid);
            if (!v) { v = { vlan_id: vid, group_id: gid, virtual_ip: m[3], priority: 100, preempt: false }; ir.vrrp.push(v); }
            else v.virtual_ip = m[3];
        } else if ((m = line.match(/^set protocols vrrp interface irb\.(\d+) group (\d+) priority (\d+)/i))) {
            ir.vrrp = ir.vrrp || [];
            const vid = parseInt(m[1]), gid = parseInt(m[2]);
            let v = ir.vrrp.find(x => x.vlan_id === vid && x.group_id === gid);
            if (!v) { v = { vlan_id: vid, group_id: gid, virtual_ip: '', priority: parseInt(m[3]), preempt: false }; ir.vrrp.push(v); }
            else v.priority = parseInt(m[3]);
        } else if ((m = line.match(/^set protocols vrrp interface irb\.(\d+) group (\d+) preempt/i))) {
            ir.vrrp = ir.vrrp || [];
            const vid = parseInt(m[1]), gid = parseInt(m[2]);
            let v = ir.vrrp.find(x => x.vlan_id === vid && x.group_id === gid);
            if (!v) { v = { vlan_id: vid, group_id: gid, virtual_ip: '', priority: 100, preempt: true }; ir.vrrp.push(v); }
            else v.preempt = true;

        // ── BFD on interface ──────────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols bfd interface (\S+) minimum-interval (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1].replace(/\.0$/, ''));
            if (!ifc) { ifc = { name: m[1].replace(/\.0$/, ''), ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.bfd = ifc.bfd || {};
            ifc.bfd.min_rx = parseInt(m[2]);
            ifc.bfd.interval = parseInt(m[2]);
        } else if ((m = line.match(/^set protocols bfd interface (\S+) multiplier (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1].replace(/\.0$/, ''));
            if (!ifc) { ifc = { name: m[1].replace(/\.0$/, ''), ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.bfd = ifc.bfd || {};
            ifc.bfd.multiplier = parseInt(m[2]);
        } else if ((m = line.match(/^set interfaces (\S+) unit \d+ family inet bfd-liveness-detection minimum-interval (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.bfd = ifc.bfd || {};
            ifc.bfd.min_rx = parseInt(m[2]);
            ifc.bfd.interval = parseInt(m[2]);
        } else if ((m = line.match(/^set interfaces (\S+) unit \d+ family inet bfd-liveness-detection multiplier (\d+)/i))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.bfd = ifc.bfd || {};
            ifc.bfd.multiplier = parseInt(m[2]);

        // ── SPAN: analyzer ────────────────────────────────────────────────────
        } else if ((m = line.match(/^set ethernet-switching-options analyzer (\S+) input (?:ingress|egress) interface (.+)/i))) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.name === m[1]);
            if (!sess) { sess = { id: 1, name: m[1], sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            const names = m[2].replace(/[\[\]]/g, '').trim().split(/\s+/).filter(Boolean);
            names.forEach(n => sess.sources.push({ name: n.replace(/\.0$/, ''), direction: 'both' }));
        } else if ((m = line.match(/^set ethernet-switching-options analyzer (\S+) output interface (.+)/i))) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.name === m[1]);
            if (!sess) { sess = { id: 1, name: m[1], sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            sess.destination = m[2].replace(/[\[\]]/g, '').trim().split(/\s+/)[0].replace(/\.0$/, '');

        // ── Event-options (event applet equivalent) ───────────────────────────
        } else if ((m = line.match(/^set event-options policy (\S+) events (\S+)/i))) {
            ir.eventApplets = ir.eventApplets || [];
            let app = ir.eventApplets.find(a => a.name === m[1]);
            if (!app) { app = { name: m[1], trigger: m[2], action: '' }; ir.eventApplets.push(app); }
            else app.trigger = m[2];
        } else if ((m = line.match(/^set event-options policy (\S+) then execute-commands commands "([^"]+)"/i))) {
            ir.eventApplets = ir.eventApplets || [];
            let app = ir.eventApplets.find(a => a.name === m[1]);
            if (!app) { app = { name: m[1], trigger: '', action: 'cmd: ' + m[2] }; ir.eventApplets.push(app); }
            else app.action = 'cmd: ' + m[2];
        } else if ((m = line.match(/^set event-options policy (\S+) then event-script (\S+)/i))) {
            ir.eventApplets = ir.eventApplets || [];
            let app = ir.eventApplets.find(a => a.name === m[1]);
            if (!app) { app = { name: m[1], trigger: '', action: 'script: ' + m[2] }; ir.eventApplets.push(app); }
            else app.action = 'script: ' + m[2];

        // ── RPM (IP SLA equivalent) ───────────────────────────────────────────
        } else if ((m = line.match(/^set services rpm probe (\S+) test (\S+) target address ([\d.]+)/i))) {
            ir.ipSla = ir.ipSla || [];
            let sla = ir.ipSla.find(s => s.name === m[1]);
            if (!sla) { sla = { id: ir.ipSla.length + 1, name: m[1], type: rpmType(m[2]), target: m[3], source_iface: '', frequency: 60 }; ir.ipSla.push(sla); }
            else { sla.target = m[3]; sla.type = rpmType(m[2]); }
        } else if ((m = line.match(/^set services rpm probe (\S+) test (\S+) source-address ([\d.]+)/i))) {
            ir.ipSla = ir.ipSla || [];
            let sla = ir.ipSla.find(s => s.name === m[1]);
            if (!sla) { sla = { id: ir.ipSla.length + 1, name: m[1], type: rpmType(m[2]), target: '', source_iface: '', source_address: m[3], frequency: 60 }; ir.ipSla.push(sla); }
            else sla.source_address = m[3];
        } else if ((m = line.match(/^set services rpm probe (\S+) test (\S+) probe-interval (\d+)/i))) {
            ir.ipSla = ir.ipSla || [];
            let sla = ir.ipSla.find(s => s.name === m[1]);
            if (!sla) { sla = { id: ir.ipSla.length + 1, name: m[1], type: '', target: '', source_iface: '', frequency: parseInt(m[3]) }; ir.ipSla.push(sla); }
            else sla.frequency = parseInt(m[3]);
        } else if ((m = line.match(/^set services rpm probe (\S+) test (\S+) probe-type (\S+)/i))) {
            ir.ipSla = ir.ipSla || [];
            let sla = ir.ipSla.find(s => s.name === m[1]);
            if (!sla) { sla = { id: ir.ipSla.length + 1, name: m[1], type: rpmType(m[3]), target: '', source_iface: '', frequency: 60 }; ir.ipSla.push(sla); }
            else sla.type = rpmType(m[3]);

        // ── STP: rstp edge ────────────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols rstp interface (\S+) edge$/))) {
            let ifc = ir.interfaces.find(f => f.name === m[1]);
            if (!ifc) { ifc = { name: m[1], ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }; ir.interfaces.push(ifc); }
            ifc.edge_port = true;
            ir.spanningTree.mode = 'rstp';

        // ── STP: rstp global / mstp / interface all ───────────────────────────
        } else if (/^set protocols rstp/.test(line)) {
            ir.spanningTree.mode = 'rstp';
        } else if (/^set protocols mstp/.test(line)) {
            ir.spanningTree.mode = 'mstp';

        // ── OSPF: area interface ──────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols ospf area (\S+) interface (\S+)/))) {
            const ospf = ensureOspf();
            let area = ospf.areas.find(a => a.id === m[1]);
            if (!area) { area = { id: m[1], networks: [], auth: '' }; ospf.areas.push(area); }
            area.interfaces = area.interfaces || [];
            const ifName = m[2].replace(/\.0$/, '');
            if (!area.interfaces.includes(ifName)) area.interfaces.push(ifName);

        // ── OSPF: area network ────────────────────────────────────────────────
        } else if ((m = line.match(/^set protocols ospf area (\S+) network ([\d.]+\/\d+)/))) {
            const ospf = ensureOspf();
            let area = ospf.areas.find(a => a.id === m[1]);
            if (!area) { area = { id: m[1], networks: [], auth: '' }; ospf.areas.push(area); }
            if (!area.networks.includes(m[2])) area.networks.push(m[2]);

        // ── ACL: firewall filter action (accept/discard/reject) ───────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) then (accept|discard|reject)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            const action = m[3] === 'accept' ? 'permit' : 'deny';
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action, proto: 'ip', src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            else { entry.action = action; }

        // ── ACL: firewall filter source-address ───────────────────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from source-address ([\d./]+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: m[3], src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            else { entry.src = m[3]; }

        // ── ACL: firewall filter source/destination-prefix-list referansı ─────
        // "set policy-options prefix-list NAME CIDR" satırlarıyla önceden
        // ir._prefixLists'te toplanan CIDR listesine referans veriyor — birden
        // fazla source-prefix-list OR semantiğiyle (herhangi biri eşleşirse kabul)
        // birleştirilir; writer bu referansı ccResolveAclPrefixTerms ile açar.
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from source-prefix-list (\S+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            entry._srcPrefixLists = entry._srcPrefixLists || [];
            if (!entry._srcPrefixLists.includes(m[3])) entry._srcPrefixLists.push(m[3]);

        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from destination-prefix-list (\S+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            entry._dstPrefixLists = entry._dstPrefixLists || [];
            if (!entry._dstPrefixLists.includes(m[3])) entry._dstPrefixLists.push(m[3]);

        // ── PBR: firewall filter term then next-hop X ────────────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) then next-hop ([\d.]+)/i))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [], _isPBR: true, _pbrNextHop: m[3] }; ir.acls.push(acl); }
            else { acl._isPBR = true; acl._pbrNextHop = m[3]; }

        // ── PBR: firewall filter term then routing-instance X ─────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) then routing-instance (\S+)/i))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [], _isPBR: true, _pbrRoutingInstance: m[3] }; ir.acls.push(acl); }
            else { acl._isPBR = true; acl._pbrRoutingInstance = m[3]; }

        // ── Routing-instances static route (for PBR resolve) ──────────────────
        } else if ((m = line.match(/^set routing-instances (\S+) routing-options static route ([\d.]+)\/(\d+) next-hop ([\d.]+)/i))) {
            ir._routingInstances = ir._routingInstances || {};
            ir._routingInstances[m[1]] = ir._routingInstances[m[1]] || {};
            ir._routingInstances[m[1]].defaultNextHop = m[4];

        // ── ACL: firewall filter destination-address ──────────────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from destination-address ([\d./]+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: 'any', src_port: '', dst: m[3], dst_port: '' }; acl.entries.push(entry); }
            else { entry.dst = m[3]; }

        // ── ACL: firewall filter protocol ─────────────────────────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from protocol (\S+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: m[3], src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            else { entry.proto = m[3]; }

        // ── ACL: firewall filter destination-port (name veya sayı) ────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from destination-port (\S+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            entry.dst_port = 'eq ' + ccTranslatePortName(m[3]);

        // ── ACL: firewall filter source-port ──────────────────────────────────
        } else if ((m = line.match(/^set firewall family inet filter (\S+) term (\S+) from source-port (\S+)/))) {
            let acl = ir.acls.find(a => a.name === m[1]);
            if (!acl) { acl = { name: m[1], entries: [] }; ir.acls.push(acl); }
            let entry = acl.entries.find(e => e._term === m[2]);
            if (!entry) { entry = { _term: m[2], action: 'permit', proto: 'ip', src: 'any', src_port: '', dst: 'any', dst_port: '' }; acl.entries.push(entry); }
            entry.src_port = 'eq ' + ccTranslatePortName(m[3]);

        } else if (line && !line.startsWith('#') && !line.startsWith('set version') && !line.startsWith('configure') && line !== 'commit') {
            ir.unknowns.push(line);
        }
        i++;
    }

    // ── Post-pass: BGP neighbor → group peer-as resolve ──────────────────
    if (ir.bgp && ir.bgp._groups) {
        ir.bgp.neighbors.forEach(n => {
            if (!n.remote_as && n._group && ir.bgp._groups[n._group] && ir.bgp._groups[n._group].peer_as) {
                n.remote_as = ir.bgp._groups[n._group].peer_as;
            }
            delete n._group;
        });
        delete ir.bgp._groups;
    }
    if (ir.bgp && ir.bgp._exportPolicies) {
        ir.bgp.networks = ir.bgp.networks || [];
        ir.bgp._exportPolicies.forEach(policy => {
            ((ir._policyPrefixLists || {})[policy] || []).forEach(listName => {
                ((ir._prefixLists || {})[listName] || []).forEach(prefix => {
                    if (!ir.bgp.networks.includes(prefix)) ir.bgp.networks.push(prefix);
                });
            });
            (ir._policyRouteFilters && ir._policyRouteFilters[policy] || []).forEach(prefix => {
                if (!ir.bgp.networks.includes(prefix)) ir.bgp.networks.push(prefix);
            });
        });
        delete ir.bgp._exportPolicies;
    }
    // ── Post-pass: ACL/filter term'lerindeki source/destination-prefix-list
    // referanslarını gerçek CIDR'lara aç. ir._prefixLists birkaç satır sonra
    // silindiği için bu çözümleme burada, reader içinde yapılmalı — writer'a
    // bırakılırsa referans verisi elden kaçmış olur.
    (ir.acls || []).forEach(acl => {
        if (acl.entries.some(e => e._srcPrefixLists || e._dstPrefixLists)) {
            acl.entries = ccExpandAclPrefixListRefs(ir, acl);
        }
    });

    // ── Post-pass: bundle link-speed / flow-control → üye fiziksel arayüzlere yay ──
    // Junos "aggregated-ether-options link-speed|flow-control" LACP bundle
    // seviyesinde tanımlanır; Cisco'da speed/flowcontrol komutları üye
    // fiziksel arayüz altında olur. Üyenin kendi "speed" satırı varsa
    // (nadiren) ona dokunulmaz.
    (ir.bundles || []).forEach(b => {
        if (!b.linkSpeed && !b.flowControl) return;
        (b.members || []).forEach(name => {
            const ifc = ir.interfaces.find(f => f.name === name);
            if (!ifc) return;
            if (b.linkSpeed && !ifc.speed) ifc.speed = b.linkSpeed;
            if (b.flowControl) ifc.flowControl = true;
        });
    });

    delete ir._policyPrefixLists;
    delete ir._policyRouteFilters;
    delete ir._prefixLists;
    delete ir._cosSchedulers;

    // ── Post-pass: JunOS OSPF area interface → advertised network ─────────
    (ir.ospf || []).forEach(proc => {
        (proc.areas || []).forEach(area => {
            (area.interfaces || []).forEach(ifName => {
                const ifc = ir.interfaces.find(f => f.name === ifName);
                let net = ifc && ifc.ip && ifc.mask ? ccNetworkFromIpMask(ifc.ip, ifc.mask) : '';
                const irb = ifName.match(/^irb\.(\d+)$/i);
                if (!net && irb) {
                    const vlan = ir.vlans.find(v => v.id === parseInt(irb[1]));
                    net = vlan && vlan.svi_ip && vlan.svi_mask ? ccNetworkFromIpMask(vlan.svi_ip, vlan.svi_mask) : '';
                }
                if (net && !area.networks.includes(net)) area.networks.push(net);
            });
            delete area.interfaces;
        });
    });

    // ── Post-pass: PBR acls → routeMaps ──────────────────────────────────
    ir.routeMaps = ir.routeMaps || [];
    const pbrAcls = ir.acls.filter(a => a._isPBR);
    pbrAcls.forEach(acl => {
        let nextHop = acl._pbrNextHop || '';
        if (!nextHop && acl._pbrRoutingInstance) {
            const ri = (ir._routingInstances || {})[acl._pbrRoutingInstance];
            if (ri && ri.defaultNextHop) nextHop = ri.defaultNextHop;
        }
        const srcEntry = acl.entries.find(e => e.src && e.src !== 'any');
        ir.routeMaps.push({
            name: acl.name,
            action: 'permit',
            seq: 10,
            match_acl: acl.name + '_MATCH',
            set_next_hop: nextHop
        });
        // Match ACL'i ayrı oluştur (source-address bilgisi taşı)
        if (srcEntry) {
            ir.acls.push({
                name: acl.name + '_MATCH',
                type: 'extended',
                entries: [{ action: 'permit', proto: 'ip', src: srcEntry.src, src_port: '', dst: 'any', dst_port: '' }]
            });
        }
    });
    // PBR olarak işaretli olanları acls'ten çıkar
    ir.acls = ir.acls.filter(a => !a._isPBR);
    delete ir._routingInstances;

    const pbrNames = new Set(ir.routeMaps.map(r => r.name));
    const resolveFilterAttach = obj => {
        if (obj._filterIn) {
            if (pbrNames.has(obj._filterIn)) obj.pbr_route_map = obj._filterIn;
            else obj._aclIn = obj._filterIn;
            delete obj._filterIn;
        }
        if (obj._filterOut) {
            if (pbrNames.has(obj._filterOut)) obj.pbr_route_map = obj._filterOut;
            else obj._aclOut = obj._filterOut;
            delete obj._filterOut;
        }
    };
    ir.interfaces.forEach(resolveFilterAttach);
    ir.vlans.forEach(resolveFilterAttach);

    if (ir.system.snmp_v3_users && ir.system.snmp_v3_users.length) {
        ir.system.snmp_v3_groups = ir.system.snmp_v3_groups || [];
        ir.system.snmp_v3_users.forEach(u => {
            if (!u.group) u.group = u.user.toUpperCase();
            const sec = u.priv_proto ? 'priv' : u.auth_proto ? 'auth' : 'noauth';
            if (!ir.system.snmp_v3_groups.find(g => g.name === u.group)) {
                ir.system.snmp_v3_groups.push({ name: u.group, sec_level: sec });
            }
        });
    }

    if ((ir.ospf || []).length && ir.interfaces.some(f => f.bfd)) {
        ir.ospf.forEach(proc => { proc.bfd_all_interfaces = true; });
    }

    // ── Post-pass: aeN interface attributes → bundle ──────────────────────
    const aeIfaces = ir.interfaces.filter(f => /^ae\d+$/i.test(f.name));
    aeIfaces.forEach(ifc => {
        const bid = parseInt(ifc.name.slice(2));
        const b = ccEnsureBundle(ir, bid);
        if (ifc.desc) b.desc = ifc.desc;
        if (ifc.ip) { b.ip = ifc.ip; b.mask = ifc.mask; }
        if (ifc.vlan_mode) b.vlan_mode = ifc.vlan_mode;
        if (ifc.access_vlan) b.access_vlan = ifc.access_vlan;
        if (ifc.trunk_vlans) b.trunk_vlans = ifc.trunk_vlans;
        if (ifc.native_vlan) b.native_vlan = ifc.native_vlan;
        if (ifc.mtu) b.mtu = ifc.mtu;
        if (ifc.edge_port) b.edge_port = true;
        if (ifc._pendingTrunkNames) b._pendingTrunkNames = ifc._pendingTrunkNames;
        if (ifc._pendingAccessName) b._pendingAccessName = ifc._pendingAccessName;
    });
    ir.interfaces = ir.interfaces.filter(f => !/^ae\d+$/i.test(f.name));

    // ── Post-pass: VLAN name → ID resolve (interface satırları VLAN satırlarından önce gelebilir) ──
    ir.bundles.forEach(b => {
        if (b._pendingAccessName) {
            const v = ir.vlans.find(vv => vv.name === b._pendingAccessName || 'VLAN' + vv.id === b._pendingAccessName);
            if (v) b.access_vlan = v.id;
            delete b._pendingAccessName;
        }
        if (b._pendingTrunkNames && b._pendingTrunkNames.length) {
            const ids = b._pendingTrunkNames.map(n => {
                const v = ir.vlans.find(vv => vv.name === n || 'VLAN' + vv.id === n);
                return v ? v.id : null;
            }).filter(x => x !== null);
            if (ids.length) b.trunk_vlans = Array.from(new Set(ids)).sort((a, b) => a - b);
            delete b._pendingTrunkNames;
        }
    });
    ir.interfaces.forEach(ifc => {
        if (ifc._pendingVoiceVlanName) {
            const v = ir.vlans.find(vv => vv.name === ifc._pendingVoiceVlanName || 'VLAN' + vv.id === ifc._pendingVoiceVlanName);
            if (v) ifc.voice_vlan = v.id;
            delete ifc._pendingVoiceVlanName;
        }
        if (ifc._pendingAccessName) {
            const v = ir.vlans.find(vv => vv.name === ifc._pendingAccessName || 'VLAN' + vv.id === ifc._pendingAccessName);
            if (v) ifc.access_vlan = v.id;
            delete ifc._pendingAccessName;
        }
        if (ifc._pendingTrunkNames && ifc._pendingTrunkNames.length) {
            const ids = ifc._pendingTrunkNames.map(n => {
                const v = ir.vlans.find(vv => vv.name === n || 'VLAN' + vv.id === n);
                return v ? v.id : null;
            }).filter(x => x !== null);
            if (ids.length) ifc.trunk_vlans = Array.from(new Set(ids)).sort((a, b) => a - b);
            delete ifc._pendingTrunkNames;
        }
    });

    // Meta
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'juniper-junos';

    // Junos surumu ilk satirda: 'set version 21.4R3-S2.3'
    {
        const _v = (text.match(/^set version\s+(\S+)/m) || [])[1];
        if (_v) ir.device.osVersionRaw = _v;
    }
    ccResolveDevice(ir);

    return ir;
}

CC_READERS['juniper-junos'] = ccReadJuniper;
CC_READERS['juniper']       = ccReadJuniper;
