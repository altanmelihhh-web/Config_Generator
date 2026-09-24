'use strict';

// Faz 6: ConfigConverter_Readers.js'den mekanik olarak bölündü — davranış değişmedi.

// ── Cisco IOS Reader ──────────────────────────────────────────────────────────
function ccReadCiscoIOS(text) {
    const ir = ccEmptyIR();
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    let m;

    // State for multi-line blocks
    let inNamedAcl = null;   // { name, type } while inside "ip access-list" block
    let inOspf = null;       // ospf object while inside "router ospf" block
    let inBgp = false;       // true while inside "router bgp" block
    let inBanner = false;    // true while collecting banner motd text
    let bannerDelim = '';    // banner motd delimiter char
    let bannerLines = [];

    while (i < lines.length) {
        const line = lines[i].trim();
        const rawLine = lines[i]; // preserve indentation for block detection

        // ── Banner MOTD (multi-line) ────────────────────────────────────────
        if (inBanner) {
            if (line.includes(bannerDelim)) {
                // delimiter found — end of banner
                const beforeDelim = line.slice(0, line.indexOf(bannerDelim));
                if (beforeDelim) bannerLines.push(beforeDelim);
                ir.system.banner = bannerLines.join('\n');
                inBanner = false; bannerLines = []; bannerDelim = '';
            } else {
                bannerLines.push(line);
            }
            i++; continue;
        }

        // ── Named ACL block ─────────────────────────────────────────────────
        if (inNamedAcl) {
            if (rawLine.match(/^\s+/) || line === '') {
                // indented line inside named ACL
                const em = line.match(/^(?:\d+\s+)?(permit|deny)\s+(\S+)\s*(.*)/);
                if (em) {
                    if (inNamedAcl.type === 'standard') {
                        // Standard ACL: protokol/hedef/port alanı yok, sadece kaynak
                        // adres (+ opsiyonel wildcard) var — em[2] adresin ilk token'ı,
                        // extended ACL'deki gibi "proto" olarak yorumlanmamalı.
                        const stdTokens = [em[2]].concat(em[3].trim().split(/\s+/).filter(Boolean));
                        const srcA = ccParseAclAddr(stdTokens, 0);
                        inNamedAcl.entries.push({
                            action: em[1], proto: 'ip',
                            src: srcA.addr, src_port: '',
                            dst: 'any', dst_port: ''
                        });
                    } else {
                        const tokens = em[3].trim().split(/\s+/).filter(Boolean);
                        let pos = 0;
                        const srcA = ccParseAclAddr(tokens, pos); pos += srcA.consumed;
                        const srcP = ccParseAclPort(tokens, pos); pos += srcP.consumed;
                        const dstA = ccParseAclAddr(tokens, pos); pos += dstA.consumed;
                        const dstP = ccParseAclPort(tokens, pos);
                        inNamedAcl.entries.push({
                            action: em[1], proto: em[2],
                            src: srcA.addr, src_port: srcP.port,
                            dst: dstA.addr, dst_port: dstP.port
                        });
                    }
                }
                i++; continue;
            } else {
                // back to top level
                inNamedAcl = null;
                // fall through to parse current line
            }
        }

        // ── OSPF block ───────────────────────────────────────────────────────
        if (inOspf) {
            if (rawLine.match(/^\s+/) || line === '') {
                if (line.startsWith('router-id ')) {
                    inOspf.router_id = line.slice(10).trim();
                } else if (line === 'bfd all-interfaces') {
                    inOspf.bfd_all_interfaces = true;
                } else if (line.startsWith('network ')) {
                    // network NET WILDCARD area AREA_ID
                    const nm = line.match(/^network\s+([\d.]+)\s+([\d.]+)\s+area\s+(\S+)/);
                    if (nm) {
                        const [, net, wildcard, areaId] = nm;
                        // convert wildcard to prefix mask: 255-each-octet
                        const maskStr = wildcard.split('.').map(o => 255 - parseInt(o)).join('.');
                        const prefix = ccMaskToPrefix(maskStr);
                        let area = inOspf.areas.find(a => a.id === areaId);
                        if (!area) { area = { id: areaId, networks: [], auth: '' }; inOspf.areas.push(area); }
                        area.networks.push(net + '/' + prefix);
                    }
                }
                i++; continue;
            } else {
                // top-level line → OSPF block ended
                ir.ospf.push(inOspf);
                inOspf = null;
                // fall through
            }
        }

        // ── BGP block ────────────────────────────────────────────────────────
        if (inBgp) {
            if (rawLine.match(/^\s+/) || line === '') {
                if (line.startsWith('bgp router-id ')) {
                    ir.bgp.router_id = line.slice(14).trim();
                } else if (line.startsWith('neighbor ')) {
                    const nm = line.match(/^neighbor\s+(\S+)\s+remote-as\s+(\S+)/);
                    if (nm) {
                        let nb = ir.bgp.neighbors.find(n => n.ip === nm[1]);
                        if (!nb) { nb = { ip: nm[1], remote_as: nm[2], desc: '' }; ir.bgp.neighbors.push(nb); }
                        else { nb.remote_as = nm[2]; }
                    }
                    const dm = line.match(/^neighbor\s+(\S+)\s+description\s+(.*)/);
                    if (dm) {
                        let nb = ir.bgp.neighbors.find(n => n.ip === dm[1]);
                        if (!nb) { nb = { ip: dm[1], remote_as: '', desc: dm[2] }; ir.bgp.neighbors.push(nb); }
                        else { nb.desc = dm[2]; }
                    }
                    const bm = line.match(/^neighbor\s+(\S+)\s+fall-over\s+bfd/);
                    if (bm) {
                        let nb = ir.bgp.neighbors.find(n => n.ip === bm[1]);
                        if (!nb) { nb = { ip: bm[1], remote_as: '', desc: '', bfd: true }; ir.bgp.neighbors.push(nb); }
                        else { nb.bfd = true; }
                    }
                } else if (line.startsWith('network ')) {
                    const nm = line.match(/^network\s+([\d.]+)\s+mask\s+([\d.]+)/);
                    if (nm) {
                        const prefix = ccMaskToPrefix(nm[2]);
                        ir.bgp.networks.push(nm[1] + '/' + prefix);
                    }
                }
                i++; continue;
            } else {
                // top-level line → BGP block ended
                inBgp = false;
                // fall through
            }
        }

        // ── Top-level parsing ────────────────────────────────────────────────
        if (line.startsWith('hostname ')) {
            ir.hostname = line.slice(9).trim();

        } else if (line.startsWith('ip name-server ')) {
            ir.system.dns.push(line.slice(15).trim());

        } else if (line.startsWith('ntp server ')) {
            ir.system.ntp.push(line.slice(11).trim().split(' ')[0]);

        } else if (line.startsWith('logging host ')) {
            ir.system.syslog.push(line.slice(13).trim().split(' ')[0]);

        } else if (line.startsWith('snmp-server community ')) {
            const sm = line.match(/^snmp-server community\s+(\S+)\s*(ro|rw)?/i);
            if (sm) { ir.system.snmp = { community: sm[1], access: (sm[2] || 'ro').toLowerCase() }; }

        } else if ((m = line.match(/^snmp-server group (\S+) v3 (noauth|auth|priv)/i))) {
            ir.system.snmp_v3_groups = ir.system.snmp_v3_groups || [];
            if (!ir.system.snmp_v3_groups.find(g => g.name === m[1])) {
                ir.system.snmp_v3_groups.push({ name: m[1], sec_level: m[2].toLowerCase() });
            }

        } else if ((m = line.match(/^snmp-server user (\S+) (\S+) v3(.*)$/i))) {
            const user = m[1], group = m[2], rest = m[3];
            const u = { user, group, auth_proto: '', auth_pwd: '', priv_proto: '', priv_pwd: '' };
            const am = rest.match(/auth\s+(sha|md5)\s+(\S+)/i);
            if (am) { u.auth_proto = am[1].toLowerCase(); u.auth_pwd = am[2]; }
            const pm = rest.match(/priv\s+(aes|des)(?:\s+(128|192|256))?\s+(\S+)/i);
            if (pm) { u.priv_proto = pm[1].toLowerCase() + (pm[2] || ''); u.priv_pwd = pm[3]; }
            ir.system.snmp_v3_users = ir.system.snmp_v3_users || [];
            if (!ir.system.snmp_v3_users.find(x => x.user === user)) {
                ir.system.snmp_v3_users.push(u);
            }

        } else if ((m = line.match(/^system mtu jumbo (\d+)/i)) || (m = line.match(/^system mtu (\d+)/i))) {
            ir.system.jumbo_mtu = parseInt(m[1]);

        // ── Domain / AAA / kullanıcı / SSH / logging-archive / servis bayrakları ──
        } else if (line === 'no ip domain lookup') {
            ir.system.domainLookup = false;

        } else if (line.startsWith('ip domain name ')) {
            ir.system.domainName = line.slice('ip domain name '.length).trim();

        } else if (line === 'aaa new-model') {
            ir.system.aaa = ir.system.aaa || { newModel: false, authLogin: [], authorizationExec: [] };
            ir.system.aaa.newModel = true;

        } else if ((m = line.match(/^aaa authentication login (\S+)\s+(.+)/))) {
            ir.system.aaa = ir.system.aaa || { newModel: false, authLogin: [], authorizationExec: [] };
            ir.system.aaa.authLogin.push({ name: m[1], methods: m[2].trim().split(/\s+/) });

        } else if ((m = line.match(/^aaa authorization exec (\S+)\s+(.+)/))) {
            ir.system.aaa = ir.system.aaa || { newModel: false, authLogin: [], authorizationExec: [] };
            ir.system.aaa.authorizationExec.push({ name: m[1], methods: m[2].trim().split(/\s+/) });

        } else if (line.startsWith('aaa session-id ')) {
            // Cisco'ya özgü oturum-ID davranışı — hedef platformda karşılığı yok, sessizce atlanır

        } else if ((m = line.match(/^username (\S+) privilege (\d+) (?:secret|password) \d+ (\S+)/))) {
            ir.system.users.push({ name: m[1], privilege: parseInt(m[2]), secretHash: m[3] });

        } else if ((m = line.match(/^username (\S+) privilege (\d+)/))) {
            ir.system.users.push({ name: m[1], privilege: parseInt(m[2]), secretHash: '' });

        } else if ((m = line.match(/^ip ssh time-out (\d+)/))) {
            ir.system.ssh = ir.system.ssh || {};
            ir.system.ssh.timeout = parseInt(m[1]);

        } else if ((m = line.match(/^ip ssh authentication-retries (\d+)/))) {
            ir.system.ssh = ir.system.ssh || {};
            ir.system.ssh.authRetries = parseInt(m[1]);

        } else if (line.startsWith('ip ssh bulk-mode ')) {
            // platforma özgü SSH aktarım ayarı — hedefte karşılığı yok, sessizce atlanır

        } else if (line.startsWith('ip ssh server algorithm')) {
            ir.system.ssh = ir.system.ssh || {};
            ir.system.ssh.algorithms = ir.system.ssh.algorithms || [];
            ir.system.ssh.algorithms.push(line.replace(/^ip ssh server algorithm\s+/, ''));

        } else if ((m = line.match(/^logging buffered (\d+)(?:\s+(\S+))?/))) {
            ir.system.logging = ir.system.logging || {};
            ir.system.logging.buffered = { size: parseInt(m[1]), level: m[2] || '' };

        } else if ((m = line.match(/^logging console (\S+)/))) {
            ir.system.logging = ir.system.logging || {};
            ir.system.logging.console = m[1];

        } else if (line === 'lldp run') {
            ir.system.lldp = true;

        } else if (line === 'archive') {
            ir.system.archive = { logConfig: false, loggingEnable: false, notifySyslog: false };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub === 'log config') ir.system.archive.logConfig = true;
                else if (sub === 'logging enable') ir.system.archive.loggingEnable = true;
                else if (sub.startsWith('notify syslog')) ir.system.archive.notifySyslog = true;
                // path / write-memory: cihaza özel arşivleme hedefi — taşınmaz
                i++;
            }
            continue;

        } else if (/^service (password-encryption|tcp-keepalives-in|tcp-keepalives-out|call-home)$/.test(line) ||
                   line.startsWith('service timestamps ')) {
            ir.system.serviceFlags.push(line.slice(8).trim());

        } else if ((m = line.match(/^login block-for (\d+) attempts (\d+) within (\d+)/))) {
            ir.system.loginSecurity = { blockFor: parseInt(m[1]), attempts: parseInt(m[2]), within: parseInt(m[3]), onFailureLog: false, onSuccessLog: false };

        } else if (line === 'login on-failure log') {
            ir.system.loginSecurity = ir.system.loginSecurity || {};
            ir.system.loginSecurity.onFailureLog = true;

        } else if (line === 'login on-success log') {
            ir.system.loginSecurity = ir.system.loginSecurity || {};
            ir.system.loginSecurity.onSuccessLog = true;

        } else if ((m = line.match(/^line (con|vty) (\S+)(?:\s+(\S+))?/))) {
            const vty = { type: m[1], range: m[2] + (m[3] ? '-' + m[3] : ''), accessClass: '', privilege: '', loginAuth: '', transportInput: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^access-class (\S+) in/))) vty.accessClass = mm[1];
                else if ((mm = sub.match(/^privilege level (\d+)/))) vty.privilege = mm[1];
                else if ((mm = sub.match(/^login authentication (\S+)/))) vty.loginAuth = mm[1];
                else if ((mm = sub.match(/^transport input (\S+)/))) vty.transportInput = mm[1];
                i++;
            }
            ir.system.vty.push(vty);
            continue;

        // ── Cihaza / platforma özgü ayarlar — taşınabilir karşılığı yok, sessizce atlanır ──
        } else if (
            line.startsWith('license ') ||
            line.startsWith('vtp ') ||
            line.startsWith('crypto engine compliance shield') ||
            line.startsWith('memory free low-watermark') ||
            line.startsWith('file privilege') ||
            line.startsWith('diagnostic bootup level') ||
            line.startsWith('boot system switch') ||
            /^switch \d+ provision/.test(line) ||
            line.startsWith('privilege exec level ') ||
            line === 'no ip http server' ||
            line.startsWith('ip http ') ||
            line.startsWith('no ip http ') ||
            line === 'ip forward-protocol nd' ||
            line.startsWith('version ') ||
            line === 'Building configuration...' ||
            line.startsWith('Current configuration') ||
            line.startsWith('clock summer-time') ||
            line.startsWith('platform punt-keepalive')
        ) {
            // sessizce atlanır — cihaza/platforma özgü ya da show-run başlığı, taşınabilir karşılığı yok

        } else if ((m = line.match(/^snmp-server view (\S+) (\S+) (included|excluded)/))) {
            ir.system.snmpViews = ir.system.snmpViews || [];
            ir.system.snmpViews.push({ name: m[1], subtree: m[2], type: m[3] });

        } else if (line.startsWith('snmp-server location ')) {
            ir.system.snmpLocation = line.slice('snmp-server location '.length).trim();

        } else if ((m = line.match(/^clock timezone (\S+) (-?\d+)(?:\s+(\d+))?/))) {
            ir.system.clockTimezone = { name: m[1], hourOffset: parseInt(m[2]), minOffset: parseInt(m[3] || '0') };

        } else if (line.startsWith('crypto pki ')) {
            // crypto pki trustpoint / certificate chain (hex sertifika bloğu dahil) — cihaza özel
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) i++;
            continue;

        } else if (/^(redundancy|control-plane|call-home)$/.test(line) || line.startsWith('transceiver type')) {
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) i++;
            continue;

        } else if ((m = line.match(/^route-map (\S+) (permit|deny) (\d+)/))) {
            ir.routeMaps = ir.routeMaps || [];
            const rm = { name: m[1], action: m[2], seq: parseInt(m[3]), match_acl: '', set_next_hop: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if ((m = sub.match(/^match ip address (\S+)/))) rm.match_acl = m[1];
                else if ((m = sub.match(/^set ip next-hop ([\d.]+)/))) rm.set_next_hop = m[1];
                i++;
            }
            ir.routeMaps.push(rm);
            continue;

        } else if ((m = line.match(/^monitor session (\d+) source interface (.+?)(?:\s+(both|rx|tx))?$/))) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.id === parseInt(m[1]));
            if (!sess) { sess = { id: parseInt(m[1]), sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            // expand range içeriyorsa
            const srcSpec = m[2].trim();
            const names = ccExpandCiscoRange(srcSpec);
            names.forEach(n => sess.sources.push({ name: n, direction: m[3] || 'both' }));

        } else if ((m = line.match(/^monitor session (\d+) destination interface (\S+)/))) {
            ir.monitorSessions = ir.monitorSessions || [];
            let sess = ir.monitorSessions.find(s => s.id === parseInt(m[1]));
            if (!sess) { sess = { id: parseInt(m[1]), sources: [], destination: '' }; ir.monitorSessions.push(sess); }
            sess.destination = m[2];

        } else if ((m = line.match(/^ip sla (\d+)/))) {
            ir.ipSla = ir.ipSla || [];
            const sla = { id: parseInt(m[1]), type: '', target: '', source_iface: '', frequency: 60 };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let sm;
                if ((sm = sub.match(/^icmp-echo ([\d.]+)(?: source-interface (\S+))?/))) {
                    sla.type = 'icmp-echo'; sla.target = sm[1]; if (sm[2]) sla.source_iface = sm[2];
                } else if ((sm = sub.match(/^frequency (\d+)/))) {
                    sla.frequency = parseInt(sm[1]);
                }
                i++;
            }
            ir.ipSla.push(sla);
            continue;

        } else if ((m = line.match(/^ip sla schedule (\d+) life (forever|\d+)(?:\s+start-time\s+(\S+))?/))) {
            ir.ipSla = ir.ipSla || [];
            const sla = ir.ipSla.find(s => s.id === parseInt(m[1]));
            if (sla) { sla.schedule = { life: m[2], start: m[3] || 'now' }; }

        } else if ((m = line.match(/^class-map (?:match-(any|all) )?(\S+)/))) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const cm = { name: m[2], match_type: m[1] || 'any', match_dscp: '', match_acl: '' };
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

        } else if ((m = line.match(/^policy-map (\S+)/))) {
            ir.qos = ir.qos || { classMaps: [], policyMaps: [] };
            const pm = { name: m[1], classes: [] };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let cm;
                if ((cm = sub.match(/^class (\S+)/))) {
                    pm.classes.push({ name: cm[1], action: '', priority_pct: 0, fair_queue: false });
                } else if (pm.classes.length) {
                    const last = pm.classes[pm.classes.length - 1];
                    if ((cm = sub.match(/^priority percent (\d+)/))) { last.action = 'priority'; last.priority_pct = parseInt(cm[1]); }
                    else if (sub === 'fair-queue') { last.action = 'fair-queue'; last.fair_queue = true; }
                    else if ((cm = sub.match(/^bandwidth percent (\d+)/))) { last.action = 'bandwidth'; last.priority_pct = parseInt(cm[1]); }
                }
                i++;
            }
            ir.qos.policyMaps.push(pm);
            continue;

        } else if ((m = line.match(/^event manager applet (\S+)/))) {
            ir.eventApplets = ir.eventApplets || [];
            const app = { name: m[1], trigger: '', action: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if ((mm = sub.match(/^event track (\d+) state (\S+)/))) {
                    app.trigger = 'track-' + mm[1] + '-' + mm[2];
                } else if ((mm = sub.match(/^action \S+ syslog msg "([^"]+)"/))) {
                    app.action = 'syslog: ' + mm[1];
                }
                i++;
            }
            ir.eventApplets.push(app);
            continue;

        } else if ((m = line.match(/^track (\d+) ip sla (\d+) reachability/))) {
            ir.tracks = ir.tracks || [];
            ir.tracks.push({ id: parseInt(m[1]), type: 'ip-sla', sla_id: parseInt(m[2]) });

        } else if (line === 'ip dhcp snooping') {
            ir.dhcpSnooping = ir.dhcpSnooping || {};
            ir.dhcpSnooping.enabled = true;

        } else if (line.startsWith('ip dhcp snooping vlan ')) {
            ir.dhcpSnooping = ir.dhcpSnooping || { enabled: true };
            ir.dhcpSnooping.vlans = ccParseTrunkVlanStr(line.slice(22));

        } else if (line.startsWith('banner motd ')) {
            // banner motd <delim>[text<delim>]
            const rest = line.slice(12);
            bannerDelim = rest[0] || '^';
            const afterDelim = rest.slice(1);
            if (afterDelim.includes(bannerDelim)) {
                // single-line banner
                ir.system.banner = afterDelim.slice(0, afterDelim.indexOf(bannerDelim));
            } else {
                inBanner = true;
                bannerLines = afterDelim ? [afterDelim] : [];
            }

        } else if (line.startsWith('router ospf ')) {
            const procId = line.slice(12).trim().split(' ')[0];
            inOspf = { process_id: procId, router_id: '', areas: [] };

        } else if (line.startsWith('router bgp ')) {
            const asNum = line.slice(11).trim().split(' ')[0];
            if (!ir.bgp) ir.bgp = { as_number: asNum, router_id: '', neighbors: [], networks: [] };
            else ir.bgp.as_number = asNum;
            inBgp = true;

        } else if (line.startsWith('ip access-list ')) {
            // ip access-list extended|standard NAME
            const am = line.match(/^ip access-list\s+(extended|standard)\s+(\S+)/);
            if (am) {
                const type = am[1], name = am[2];
                let acl = ir.acls.find(a => a.name === name);
                if (!acl) { acl = { name, type, entries: [] }; ir.acls.push(acl); }
                else { acl.type = type; }
                inNamedAcl = acl;
            }

        } else if (line.startsWith('interface range ')) {
            // interface range GigabitEthernet0/1 - 10  veya  Gi0/1, Gi0/3
            const rangeSpec = line.slice(16).trim();
            const expandedNames = ccExpandCiscoRange(rangeSpec);
            const ifaces = expandedNames.map(n => ({ name: n, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' }));
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                ifaces.forEach(iface => {
                    if (sub.startsWith('description ')) { iface.desc = sub.slice(12); }
                    else if (sub === 'shutdown') { iface.shutdown = true; }
                    else if (sub === 'switchport mode access') { iface.vlan_mode = 'access'; }
                    else if (sub === 'switchport mode trunk') { iface.vlan_mode = 'trunk'; }
                    else if (sub.startsWith('switchport access vlan ')) { iface.access_vlan = parseInt(sub.slice(23)); }
                    else if (sub.startsWith('switchport voice vlan ')) { iface.voice_vlan = parseInt(sub.slice(22)); }
                    else if (sub.startsWith('switchport trunk native vlan ')) { iface.native_vlan = parseInt(sub.slice(29)); }
                    else if (sub.startsWith('switchport trunk allowed vlan ')) { iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30)); }
                    else if (sub === 'spanning-tree portfast' || sub === 'spanning-tree portfast edge') { iface.edge_port = true; }
                    else if (sub === 'spanning-tree bpduguard enable') { iface.bpdu_guard = true; }
                    else if (sub === 'switchport port-security') { iface.port_security = Object.assign(iface.port_security || {}, { enabled: true }); }
                    else if (sub.startsWith('switchport port-security maximum ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { max: parseInt(sub.slice(33)) }); }
                    else if (sub.startsWith('switchport port-security violation ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { violation: sub.slice(35).trim() }); }
                    else if (sub === 'switchport port-security mac-address sticky') { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { sticky: true }); }
                    else if (sub === 'ip dhcp snooping trust') { iface.dhcp_snoop_trust = true; }
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

        } else if (line.startsWith('interface ')) {
            // Close any open blocks
            if (inOspf) { ir.ospf.push(inOspf); inOspf = null; }
            if (inBgp)  { inBgp = false; }
            inNamedAcl = null;

            const ifName = line.slice(10).trim();
            const isBundle = /^Port-channel\d+/i.test(ifName);
            const iface = { name: ifName, ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '' };
            // Router subif tespit (Gi0/0.10 vb.): name'in `.<digits>` suffix'i
            // varsa access_vlan + structured _subif populate. `encapsulation dot1Q N`
            // satırı varsa onun değerleri override eder.
            const _parsed = ccParseSubifName(ifName);
            if (_parsed) {
                iface.access_vlan = _parsed.unit;
                iface._subif = ccBuildSubif(_parsed.parent, _parsed.unit, _parsed.unit);
            }
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('ip address ')) { const p = sub.slice(11).split(' '); iface.ip = p[0]; iface.mask = p[1] || ''; }
                else if (sub.startsWith('description ')) { iface.desc = sub.slice(12); }
                else if (sub === 'shutdown') { iface.shutdown = true; }
                else if ((m = sub.match(/^encapsulation\s+dot1[Qq]\s+(\d+)\s+second-dot1q\s+(\d+)/))) {
                    // Q-in-Q double-tagged subif (önce yakalanır — daha spesifik pattern)
                    const _vid = parseInt(m[1], 10);
                    const _inner = parseInt(m[2], 10);
                    iface.access_vlan = _vid;
                    iface._qinqInner = _inner;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(_p ? _p.parent : iface.name, _p ? _p.unit : _vid, _vid,
                        { type: 'qinq', qinq_inner: _inner });
                }
                else if ((m = sub.match(/^encapsulation\s+dot1[Qq]\s+(\d+)(\s+native)?/))) {
                    // Router L3 subinterface VLAN tag (single tag, opsiyonel native)
                    const _vid = parseInt(m[1], 10);
                    const _isNative = !!m[2];
                    iface.access_vlan = _vid;
                    if (_isNative) iface.native_vlan = _vid;
                    const _p = ccParseSubifName(iface.name);
                    iface._subif = ccBuildSubif(_p ? _p.parent : iface.name, _p ? _p.unit : _vid, _vid,
                        { type: 'dot1q', native: _isNative });
                }
                else if (sub === 'switchport mode access') { iface.vlan_mode = 'access'; }
                else if (sub === 'switchport mode trunk') { iface.vlan_mode = 'trunk'; }
                else if (sub.startsWith('switchport access vlan ')) { iface.access_vlan = parseInt(sub.slice(23)); }
                else if (sub.startsWith('switchport voice vlan ')) { iface.voice_vlan = parseInt(sub.slice(22)); }
                else if (sub.startsWith('switchport trunk native vlan ')) { iface.native_vlan = parseInt(sub.slice(29)); }
                else if (sub.startsWith('switchport trunk allowed vlan ')) { iface.trunk_vlans = ccParseTrunkVlanStr(sub.slice(30)); }
                else if (sub.startsWith('ip access-group ')) { const m2 = sub.match(/^ip access-group\s+(\S+)\s+(in|out)/); if (m2) { if (m2[2] === 'in') iface._aclIn = m2[1]; else iface._aclOut = m2[1]; } }
                else if (sub === 'spanning-tree portfast' || sub === 'spanning-tree portfast edge') { iface.edge_port = true; }
                else if (sub === 'spanning-tree bpduguard enable') { iface.bpdu_guard = true; }
                else if (sub === 'switchport port-security') { iface.port_security = Object.assign(iface.port_security || {}, { enabled: true }); }
                else if (sub.startsWith('switchport port-security maximum ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { max: parseInt(sub.slice(33)) }); }
                else if (sub.startsWith('switchport port-security violation ')) { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { violation: sub.slice(35).trim() }); }
                else if (sub === 'switchport port-security mac-address sticky') { iface.port_security = Object.assign(iface.port_security || { enabled: true }, { sticky: true }); }
                else if (sub === 'ip dhcp snooping trust') { iface.dhcp_snoop_trust = true; }
                else if ((m = sub.match(/^mtu\s+(\d+)/))) { iface.mtu = parseInt(m[1]); }
                else if (sub === 'no switchport') { iface.no_switchport = true; }
                else if ((m = sub.match(/^bfd interval (\d+) min_rx (\d+) multiplier (\d+)/i))) {
                    iface.bfd = { interval: parseInt(m[1]), min_rx: parseInt(m[2]), multiplier: parseInt(m[3]) };
                }
                else if (sub === 'bfd enable') { iface.bfd = iface.bfd || { enabled: true }; }
                else if ((m = sub.match(/^standby (\d+) ip ([\d.]+)/))) {
                    iface._hsrp = iface._hsrp || {};
                    iface._hsrp[m[1]] = iface._hsrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._hsrp[m[1]].virtual_ip = m[2];
                }
                else if ((m = sub.match(/^standby (\d+) priority (\d+)/))) {
                    iface._hsrp = iface._hsrp || {};
                    iface._hsrp[m[1]] = iface._hsrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._hsrp[m[1]].priority = parseInt(m[2]);
                }
                else if ((m = sub.match(/^standby (\d+) preempt/))) {
                    iface._hsrp = iface._hsrp || {};
                    iface._hsrp[m[1]] = iface._hsrp[m[1]] || { group_id: parseInt(m[1]) };
                    iface._hsrp[m[1]].preempt = true;
                }
                else if ((m = sub.match(/^ip policy route-map (\S+)/))) { iface.pbr_route_map = m[1]; }
                else if ((m = sub.match(/^service-policy (input|output) (\S+)/))) {
                    iface.service_policy = iface.service_policy || {};
                    iface.service_policy[m[1]] = m[2];
                }
                else if ((m = sub.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/))) {
                    iface._bundleId = parseInt(m[1]);
                    iface._bundleMode = m[2] === 'active' ? 'lacp-active' : m[2] === 'passive' ? 'lacp-passive' : 'static';
                }
                i++;
            }
            if (isBundle) {
                const bid = parseInt(ifName.replace(/^Port-channel/i, ''));
                const b = ccEnsureBundle(ir, bid);
                if (iface.desc) b.desc = iface.desc;
                if (iface.ip) { b.ip = iface.ip; b.mask = iface.mask; }
                if (iface.vlan_mode) b.vlan_mode = iface.vlan_mode;
                if (iface.access_vlan) b.access_vlan = iface.access_vlan;
                if (iface.native_vlan) b.native_vlan = iface.native_vlan;
                if (iface.trunk_vlans) b.trunk_vlans = iface.trunk_vlans;
                if (iface.edge_port) b.edge_port = true;
                if (iface.mtu) b.mtu = iface.mtu;
            } else {
                ir.interfaces.push(iface);
                if (iface._bundleId !== undefined) {
                    const b = ccEnsureBundle(ir, iface._bundleId);
                    if (!b.members.includes(iface.name)) b.members.push(iface.name);
                    if (b.mode === 'static' && iface._bundleMode) b.mode = iface._bundleMode;
                }
            }
            continue;

        } else if (line.startsWith('vlan ') && !line.includes(',') && !line.includes('-') && !isNaN(line.slice(5).trim())) {
            const vlan = { id: parseInt(line.slice(5)), name: '', svi_ip: '', svi_mask: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                if (sub.startsWith('name ')) vlan.name = sub.slice(5);
                i++;
            }
            ir.vlans.push(vlan);
            continue;

        } else if (line.startsWith('vlan ') && (line.includes(',') || line.includes('-'))) {
            // e.g. "vlan 10,20,30" or "vlan 10-20"
            const spec = line.slice(5).trim();
            const ids = [];
            spec.split(',').forEach(part => {
                const rng = part.trim().split('-');
                if (rng.length === 2) { for (let v = parseInt(rng[0]); v <= parseInt(rng[1]); v++) ids.push(v); }
                else { const n = parseInt(rng[0]); if (!isNaN(n)) ids.push(n); }
            });
            ids.forEach(id => { if (!ir.vlans.find(v => v.id === id)) ir.vlans.push({ id, name: '', svi_ip: '', svi_mask: '' }); });

        } else if (line.startsWith('spanning-tree mode ')) {
            const stpMode = line.slice(19).trim();
            // rapid-pvst|pvst|mst → canonical
            ir.spanningTree.mode = /rapid|rstp/.test(stpMode) ? 'rstp'
                                 : /mst/.test(stpMode) ? 'mstp'
                                 : /pvst/.test(stpMode) ? 'pvst'
                                 : stpMode;

        } else if (line.startsWith('ip default-gateway ')) {
            const gw = line.slice(19).trim().split(/\s+/)[0];
            if (gw && !ir.routes.find(r => r.network === '0.0.0.0' && r.mask === '0.0.0.0')) {
                ir.routes.push({ network: '0.0.0.0', mask: '0.0.0.0', nexthop: gw, metric: '1', iface: '' });
            }

        } else if (line.startsWith('ip route ')) {
            const p = line.slice(9).split(' ');
            ir.routes.push({ network: p[0] || '', mask: p[1] || '', nexthop: p[2] || '', metric: p[3] || '1', iface: '' });

        } else if (line.startsWith('access-list ')) {
            const m = line.match(/^access-list (\S+) (extended|standard)?\s*(permit|deny)\s+(\S+)\s*(.*)/);
            if (m) {
                const name = m[1];
                let acl = ir.acls.find(a => a.name === name);
                if (!acl) { acl = { name, entries: [] }; ir.acls.push(acl); }
                const rest = (m[5] || '').trim().split(/\s+/).filter(Boolean);
                acl.entries.push(ccParseAclEntry(m[3], m[4], rest));
            } else { ir.unknowns.push(line); }

        } else if (line && !line.startsWith('!') && !line.startsWith('end') && line !== 'configure terminal' && !/^(write\s+(memory|erase)|copy\s+running-config|copy\s+run\s+start|reload|enable|disable|exit|logout)$/i.test(line)) {
            ir.unknowns.push(line);
        }
        i++;
    }

    // Flush any open block at EOF
    if (inOspf) ir.ospf.push(inOspf);
    if (inBanner) ir.system.banner = bannerLines.join('\n');

    // SVI IP'lerini interface listesinden al; vlan tanımlı değilse oluştur
    // HSRP → ir.vrrp (Vlan99 interface'inde standby X ... varsa)
    ir.vrrp = ir.vrrp || [];
    ir.interfaces.forEach(ifc => {
        if (ifc.name.toLowerCase().startsWith('vlan')) {
            const vid = parseInt(ifc.name.slice(4));
            if (isNaN(vid)) return;
            let vlan = ir.vlans.find(v => v.id === vid);
            if (!vlan) { vlan = { id: vid, name: '', svi_ip: '', svi_mask: '' }; ir.vlans.push(vlan); }
            if (ifc.ip) { vlan.svi_ip = ifc.ip; vlan.svi_mask = ifc.mask; }
            if (ifc._hsrp) {
                Object.values(ifc._hsrp).forEach(h => {
                    ir.vrrp.push({ vlan_id: vid, group_id: h.group_id, virtual_ip: h.virtual_ip || '', priority: h.priority || 100, preempt: !!h.preempt });
                });
                delete ifc._hsrp;
            }
            if (ifc.pbr_route_map) {
                vlan.pbr_route_map = ifc.pbr_route_map;
            }
            // ACL bindings (ip access-group in/out): SVI iface'inden vlan objesine taşı
            if (ifc._aclIn)  vlan._aclIn  = ifc._aclIn;
            if (ifc._aclOut) vlan._aclOut = ifc._aclOut;
            if (ifc.desc && !vlan.desc) vlan.desc = ifc.desc;
        }
    });

    // Meta
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'cisco-ios';

    return ir;
}

CC_READERS['cisco-ios'] = ccReadCiscoIOS;

// ── Cisco ASA Reader ──────────────────────────────────────────────────────────
function ccReadCiscoASA(text) {
    const ir = ccEmptyIR();
    const lines = text.split('\n').map(l => l.trimEnd());
    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();
        let m;

        if (line.startsWith('hostname ')) {
            ir.hostname = line.slice(9).trim();

        } else if (line.startsWith('interface ')) {
            const iface = { name: line.slice(10).trim(), ip: '', mask: '', desc: '', shutdown: false, vlan_mode: null, access_vlan: null, trunk_vlans: null, nameif: '', security_level: '', type: 'physical' };
            // Subif detect: "GigabitEthernet0/0.10" — adından da vlan algılanabilir
            const _subifM = iface.name.match(/^[A-Za-z][^.]*\.(\d+)$/);
            if (_subifM) iface.access_vlan = parseInt(_subifM[1], 10);
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let mm;
                if (sub.startsWith('ip address ')) { const p = sub.slice(11).split(' '); iface.ip = p[0]; iface.mask = p[1] || ''; }
                else if (sub.startsWith('nameif ')) { iface.nameif = sub.slice(7); }
                else if (sub.startsWith('security-level ')) { iface.security_level = sub.slice(15); }
                else if (sub.startsWith('description ')) { iface.desc = sub.slice(12); }
                else if ((mm = sub.match(/^vlan\s+(\d+)$/))) { iface.access_vlan = parseInt(mm[1], 10); }
                else if ((mm = sub.match(/^mtu\s+(?:\S+\s+)?(\d+)$/))) { iface.mtu = parseInt(mm[1], 10); }
                else if ((mm = sub.match(/^channel-group\s+(\d+)\s+mode\s+(\S+)/))) {
                    iface._bundleId = parseInt(mm[1], 10);
                    iface._bundleMode = mm[2] === 'active' ? 'lacp-active' : mm[2] === 'passive' ? 'lacp-passive' : 'static';
                }
                else if (sub === 'shutdown') { iface.shutdown = true; }
                i++;
            }
            ir.interfaces.push(iface);
            continue;

        } else if ((m = line.match(/^object network (\S+)/))) {
            // object network NAME
            const obj = { name: m[1], type: 'network', value: '', mask: '', members: [], description: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let sm;
                if ((sm = sub.match(/^host ([\d.]+)/))) {
                    obj.type = 'host'; obj.value = sm[1]; obj.mask = '255.255.255.255';
                } else if ((sm = sub.match(/^subnet ([\d.]+) ([\d.]+)/))) {
                    obj.type = 'network'; obj.value = sm[1]; obj.mask = sm[2];
                } else if ((sm = sub.match(/^range ([\d.]+) ([\d.]+)/))) {
                    obj.type = 'range'; obj.value = sm[1] + '-' + sm[2]; obj.mask = '';
                } else if (sub.startsWith('description ')) {
                    obj.description = sub.slice(12);
                }
                i++;
            }
            ir.addressObjects.push(obj);
            continue;

        } else if ((m = line.match(/^object-group network (\S+)/))) {
            // object-group network GROUP_NAME
            const grp = { name: m[1], type: 'group', value: '', mask: '', members: [], description: '' };
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let sm;
                if ((sm = sub.match(/^network-object host ([\d.]+)/))) {
                    grp.members.push(sm[1]);
                } else if ((sm = sub.match(/^network-object ([\d.]+) ([\d.]+)/))) {
                    grp.members.push(sm[1] + '/' + sm[2]);
                } else if ((sm = sub.match(/^group-object (\S+)/))) {
                    grp.members.push(sm[1]);
                } else if (sub.startsWith('description ')) {
                    grp.description = sub.slice(12);
                }
                i++;
            }
            ir.addressObjects.push(grp);
            continue;

        } else if ((m = line.match(/^object-group service (\S+)(?:\s+(tcp|udp|tcp-udp))?/))) {
            // object-group service NAME [tcp|udp]
            const svcName = m[1];
            const proto = m[2] === 'tcp-udp' ? 'tcp' : (m[2] || 'ip');
            i++;
            while (i < lines.length && lines[i].match(/^\s+/)) {
                const sub = lines[i].trim();
                let sm;
                if ((sm = sub.match(/^port-object eq (\S+)/))) {
                    ir.serviceObjects.push({ name: svcName, proto, ports: sm[1], members: [], predefined: false });
                } else if ((sm = sub.match(/^port-object range (\S+) (\S+)/))) {
                    ir.serviceObjects.push({ name: svcName, proto, ports: sm[1] + '-' + sm[2], members: [], predefined: false });
                }
                i++;
            }
            continue;

        } else if ((m = line.match(/^nat\s+\((\S+),(\S+)\)\s+(static|dynamic)\s+(\S+)\s+(\S+)/))) {
            // nat (inside,outside) static|dynamic ORIG TRANS
            const [, srcIf, dstIf, type, orig, trans] = m;
            const natRule = {
                type: type === 'static' ? 'static' : 'dynamic',
                origSrc: orig,
                transSrc: trans === 'interface' ? 'interface' : trans,
                origDst: 'any',
                transDst: '',
                iface: dstIf,
                bidirectional: false
            };
            ir.natRules.push(natRule);

        } else if (line.startsWith('route ')) {
            const p = line.split(' ');
            ir.routes.push({ network: p[2] || '', mask: p[3] || '', nexthop: p[4] || '', metric: p[5] || '1', iface: p[1] || '' });

        } else if (line.startsWith('access-list ')) {
            const m2 = line.match(/^access-list (\S+) extended (permit|deny)\s+(\S+)\s+(.*)/);
            if (m2) {
                let acl = ir.acls.find(a => a.name === m2[1]);
                if (!acl) { acl = { name: m2[1], entries: [] }; ir.acls.push(acl); }
                const rest = m2[4].trim().split(' ');
                const entry = { action: m2[2], proto: m2[3], src: rest[0] || 'any', src_port: '', dst: rest[1] || 'any', dst_port: rest.slice(2).join(' ') };
                acl.entries.push(entry);
                // Also populate securityPolicies
                ir.securityPolicies.push({
                    name: m2[1],
                    seq: ir.securityPolicies.length + 1,
                    srcZone: '',
                    dstZone: '',
                    srcAddr: [entry.src],
                    dstAddr: [entry.dst],
                    service: [entry.proto + (entry.dst_port ? ' ' + entry.dst_port : '')],
                    action: entry.action === 'permit' ? 'allow' : 'deny',
                    log: true
                });
            } else { ir.unknowns.push(line); }

        } else if (line && !line.startsWith('!') && !line.startsWith('end') && !line.startsWith('ASA') && !line.startsWith(':')) {
            ir.unknowns.push(line);
        }
        i++;
    }

    // Zone inference from interfaces (nameif → zone)
    ir.interfaces.forEach(f => {
        if (f.nameif) ir.zones.push({ name: f.nameif, interfaces: [f.name], description: '', trust_level: parseInt(f.security_level) || 0 });
    });

    // Meta
    ir._meta.category = 'firewall';
    ir._meta.srcVendor = 'cisco-asa';

    return ir;
}

CC_READERS['cisco-asa'] = ccReadCiscoASA;

// ── Cisco NX-OS Reader ────────────────────────────────────────────────────────
function ccReadCiscoNXOS(text) {
    // NX-OS syntax Cisco IOS ile çok benzer; IOS reader'ı temel alır.
    // Önce NX-OS'a özgü satırları filtrele, sonra IOS reader'a ver.

    const nxosSkipPatterns = [
        // feature bildirimleri
        /^feature\s+\S+/,
        // vrf context blokları (başlık + içerik): basit satır skip
        /^vrf\s+context\s+\S+/,
        // vPC domain ve peer-link
        /^vpc\s+domain\b/,
        /^\s+vpc\s+peer-link\b/,
        /^\s+vpc\s+\d+/,
    ];

    // vrf context bloğunu satır bazlı skip et
    const filteredLines = [];
    const rawLines = text.split('\n');
    let inVrfContext = false;

    for (const line of rawLines) {
        const t = line.trim();

        // vrf context bloğu başladı mı?
        if (/^vrf\s+context\s+\S+/.test(t)) {
            inVrfContext = true;
            continue;
        }
        // Blok içindeyken: boş olmayan, girinti içermeyen satır bloğu bitişini işaret eder
        if (inVrfContext) {
            if (t === '' || /^\s/.test(line)) {
                continue; // blok içindeyiz, atla
            }
            inVrfContext = false; // yeni üst-düzey komut — blok bitti
        }

        // Diğer NX-OS'a özgü satırları atla
        let skip = false;
        for (const pat of nxosSkipPatterns) {
            if (pat.test(line)) { skip = true; break; }
        }
        if (skip) continue;

        filteredLines.push(line);
    }

    const filteredText = filteredLines.join('\n');

    // IOS reader'ı çalıştır
    const ir = ccReadCiscoIOS(filteredText);

    // NX-OS'a özgü: 'ip route X/prefix NH' (CIDR) — maske dönüşümü
    ir.routes = ir.routes.map(r => {
        if (r.network && r.network.includes('/')) {
            const [net, prefix] = r.network.split('/');
            return { ...r, network: net, mask: ccPrefixToMask(parseInt(prefix)) };
        }
        return r;
    });

    // Meta override
    ir._meta.category = 'switch-router';
    ir._meta.srcVendor = 'cisco-nxos';

    return ir;
}

CC_READERS['cisco-nxos'] = ccReadCiscoNXOS;

CC_READERS['cisco-ftd'] = ccReadCiscoASA; // FTD ASA-compatible fallback
