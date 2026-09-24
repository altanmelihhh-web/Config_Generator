'use strict';

const Juniper = {};

// ── Juniper: General ──────────────────────────────────────────────────────────
Juniper.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Juniper JunOS — Genel Konfigürasyon',
                desc: 'Hostname, VLAN, IRB (Layer 3 gateway), LAN/WAN arayüzleri ve default route yapılandırması.<br><small>Örn: <code>set system host-name JNP-SW1</code> &nbsp;|&nbsp; <code>set vlans MGMT vlan-id 10 l3-interface irb.10</code></small>'
            },
            sections: [
                {
                    title: 'Sistem',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'JNP-SW1', hint: 'Cihaz hostname\'i' }
                    ]
                },
                {
                    title: 'VLAN & IRB',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'VLAN numarası (1–4094)' },
                        { name: 'vlan_name', label: 'VLAN Adı', type: 'text', required: true, placeholder: 'MGMT', hint: 'VLAN mantıksal adı' },
                        { name: 'ip_prefix', label: 'IRB IP / Prefix', type: 'text', required: true, placeholder: '192.168.1.1/24', hint: 'Layer 3 gateway IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Routing',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Statik default route next-hop' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'LAN Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'VLAN\'a üye erişim portu' },
                        { name: 'wan_iface', label: 'WAN Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/0', hint: 'Uplink/WAN portu' },
                        { name: 'wan_ip_prefix', label: 'WAN IP / Prefix', type: 'text', required: true, placeholder: '203.0.113.1/30', hint: 'WAN arayüzü IP adresi (CIDR)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || ''), vname = cgEsc(data.vlan_name || '');
            const ipPrefix = cgEsc(data.ip_prefix || ''), gw = cgEsc(data.gw || '');
            const iface = cgEsc(data.iface || ''), waniface = cgEsc(data.wan_iface || ''), wanip = cgEsc(data.wan_ip_prefix || '');
            let c = '# ========================================\n# Juniper JunOS — General Configuration\n# ========================================\n\nconfigure\n\n';
            c += '# Hostname\nset system host-name ' + hn + '\n\n';
            c += '# VLAN Definition\nset vlans ' + vname + ' vlan-id ' + vlan + '\nset vlans ' + vname + ' l3-interface irb.' + vlan + '\n\n';
            c += '# IRB Interface (Layer 3 VLAN Gateway)\nset interfaces irb unit ' + vlan + ' family inet address ' + ipPrefix + '\n\n';
            c += '# LAN Port → VLAN\nset interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n\n';
            c += '# WAN Interface\nset interfaces ' + waniface + ' unit 0 family inet address ' + wanip + '\n\n';
            c += '# Default Route\nset routing-options static route 0.0.0.0/0 next-hop ' + gw + '\n\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: VLAN ─────────────────────────────────────────────────────────────
Juniper.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Juniper JunOS — VLAN Konfigürasyonu',
                desc: 'Access/trunk port modu ve L2/L3 (IRB) VLAN yapılandırması.<br><small>Örn: <code>set vlans Muhasebe vlan-id 10</code> &nbsp;|&nbsp; <code>set interfaces ge-0/0/15 unit 0 family ethernet-switching vlan members Muhasebe</code></small>'
            },
            configTypes: [
                { id: 'L2', label: 'L2 (Layer 2)', icon: 'fas fa-ethernet', desc: 'Sadece VLAN switching', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'L3', label: 'L3 (IRB)', icon: 'fas fa-network-wired', desc: 'Layer 3 gateway (IRB arayüzü)', badge: { text: 'Routing', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN Temel',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'ge-0/0/15', hint: 'Porta bağlı fiziksel arayüz' },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'VLAN numarası (1–4094)' },
                        { name: 'vlan_name', label: 'VLAN Adı', type: 'text', required: true, placeholder: 'Muhasebe', hint: 'Tanımlayıcı VLAN adı' },
                        { name: 'port_mode', label: 'Port Modu', type: 'select', options: [
                            { value: 'access', label: 'Access', selected: true },
                            { value: 'trunk', label: 'Trunk' }
                        ]}
                    ]
                },
                {
                    title: 'IRB (Layer 3 Gateway)',
                    icon: 'fas fa-route',
                    showFor: ['L3'],
                    fields: [
                        { name: 'l3_ip', label: 'IRB IP / Prefix', type: 'text', optional: true, placeholder: '192.168.10.1/24', hint: 'VLAN gateway IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Trunk Ayarları',
                    icon: 'fas fa-sitemap',
                    info: 'Yalnızca Port Modu "Trunk" seçildiğinde geçerlidir.',
                    fields: [
                        { name: 'native_vlan', label: 'Native VLAN', type: 'text', validate: 'vlan', optional: true, placeholder: '1', hint: 'Trunk native VLAN ID (opsiyonel)' },
                        { name: 'allowed_vlans', label: 'İzin Verilen VLAN\'lar', type: 'text', optional: true, placeholder: '10,20,30', hint: 'Virgülle ayrılmış VLAN listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), vid = cgEsc(data.vlan_id || ''), vname = cgEsc(data.vlan_name || '');
            const mode = cgEsc(data.port_mode || 'access'), ctype = data._cgtype || 'L2';
            let c = '# ========================================\n# Juniper JunOS — VLAN Configuration\n# ========================================\n\nconfigure\n\n';
            if (ctype === 'L2') {
                c += 'set vlans ' + vname + ' vlan-id ' + vid + '\n\n';
                if (mode === 'access') {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n';
                } else {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching port-mode trunk\n';
                    const native = cgEsc(data.native_vlan || ''), allowed = cgEsc(data.allowed_vlans || '');
                    if (native) c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching native-vlan-id ' + native + '\n';
                    if (allowed) {
                        const vlans = allowed.split(',').map(s => s.trim()).join(' ');
                        c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members [ ' + vlans + ' ]\n';
                    }
                }
            } else {
                c += 'set vlans ' + vname + ' vlan-id ' + vid + '\nset vlans ' + vname + ' l3-interface irb.' + vid + '\n\n';
                const l3ip = cgEsc(data.l3_ip || '');
                if (l3ip) c += 'set interfaces irb unit ' + vid + ' family inet address ' + l3ip + '\n\n';
                if (mode === 'access') {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n';
                } else {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching port-mode trunk\n';
                    const native = cgEsc(data.native_vlan || ''), allowed = cgEsc(data.allowed_vlans || '');
                    if (native) c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching native-vlan-id ' + native + '\n';
                    if (allowed) {
                        const vlans = allowed.split(',').map(s => s.trim()).join(' ');
                        c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members [ ' + vlans + ' ]\n';
                    }
                }
            }
            c += '\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: DHCP ─────────────────────────────────────────────────────────────
Juniper.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-dhcp',
                title: 'Juniper JunOS — DHCP Konfigürasyonu',
                desc: 'DHCP Server (IRB üzerinde), Global static bind veya Relay Agent yapılandırması.<br><small>Örn: <code>set access address-assignment pool my-pool family inet network 192.168.20.0/24</code></small>'
            },
            configTypes: [
                { id: 'server', label: 'Server (IRB)', icon: 'fas fa-server', desc: 'IRB arayüzünde DHCP sunucu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'global', label: 'Global', icon: 'fas fa-globe', desc: 'Global static IP bind', badge: { text: 'Static Bind', cls: 'common' } },
                { id: 'relay', label: 'Relay', icon: 'fas fa-arrows-alt-h', desc: 'Harici DHCP sunucuya yönlendirme', badge: { text: 'Relay', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Server — Havuz & IRB',
                    icon: 'fas fa-server',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_pool', label: 'Havuz Adı', type: 'text', required: true, placeholder: 'my-pool', hint: 'DHCP adres havuzu adı' },
                        { name: 'srv_network', label: 'Network (CIDR)', type: 'text', required: true, placeholder: '192.168.20.0/24', hint: 'Havuzun kapsadığı ağ adresi' },
                        { name: 'srv_irb_ip', label: 'IRB IP / Prefix', type: 'text', required: true, placeholder: '192.168.20.1/24', hint: 'IRB arayüzü IP adresi (CIDR)' },
                        { name: 'srv_vlan_id', label: 'VLAN ID (IRB unit)', type: 'text', required: true, placeholder: '20', hint: 'IRB unit numarası = VLAN ID' },
                        { name: 'srv_gw', label: 'Gateway', type: 'text', required: true, placeholder: '192.168.20.1', hint: 'İstemcilere atanacak gateway IP' },
                        { name: 'srv_dns', label: 'DNS Sunucusu', type: 'text', required: true, placeholder: '8.8.8.8', hint: 'İstemcilere atanacak DNS IP' }
                    ]
                },
                {
                    title: 'Server — Static Host (opsiyonel)',
                    icon: 'fas fa-laptop',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_static_host', label: 'Static Host Adı', type: 'text', optional: true, placeholder: 'Linux-2', hint: 'Sabit IP atanacak host adı' },
                        { name: 'srv_static_mac', label: 'Static MAC', type: 'text', optional: true, placeholder: 'aa:aa:aa:00:00:02', hint: 'Host MAC adresi' },
                        { name: 'srv_static_ip', label: 'Static IP', type: 'text', optional: true, placeholder: '192.168.20.100', hint: 'Atanacak sabit IP adresi' }
                    ]
                },
                {
                    title: 'Server — Exclude Range (opsiyonel)',
                    icon: 'fas fa-ban',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_excl_low', label: 'Exclude Low', type: 'text', optional: true, placeholder: '192.168.20.1', hint: 'Hariç tutulacak aralık başlangıcı' },
                        { name: 'srv_excl_high', label: 'Exclude High', type: 'text', optional: true, placeholder: '192.168.20.19', hint: 'Hariç tutulacak aralık sonu' }
                    ]
                },
                {
                    title: 'Global — Static Bind',
                    icon: 'fas fa-globe',
                    showFor: ['global'],
                    fields: [
                        { name: 'gbl_pool', label: 'Havuz Adı', type: 'text', required: true, placeholder: 'LAN1', hint: 'Global havuz adı' },
                        { name: 'gbl_bind_ip', label: 'Static Bind IP', type: 'text', required: true, placeholder: '192.168.2.15', hint: 'MAC\'e bağlanacak sabit IP' },
                        { name: 'gbl_bind_mac', label: 'Static Bind MAC', type: 'text', required: true, placeholder: 'aa:bb:cc:dd:ee:ff', hint: 'Sabit IP atanacak MAC adresi' },
                        { name: 'gbl_iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'DHCP local server arayüzü' },
                        { name: 'gbl_ip', label: 'Arayüz IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1/24', hint: 'Arayüz IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Relay — Yapılandırma',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['relay'],
                    fields: [
                        { name: 'relay_iface', label: 'Relay Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'İstemci tarafındaki arayüz' },
                        { name: 'relay_server', label: 'Relay Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.10.10.1', hint: 'Harici DHCP sunucu IP adresi' },
                        { name: 'relay_vrf', label: 'VRF', type: 'text', optional: true, placeholder: 'blue', hint: 'VRF adı (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = data._cgtype || 'server';
            let c = '# ========================================\n# Juniper JunOS — DHCP Configuration\n# ========================================\n\ncli\nconfigure\n\n';
            if (mode === 'server') {
                const pool = cgEsc(data.srv_pool || ''), network = cgEsc(data.srv_network || ''), irbip = cgEsc(data.srv_irb_ip || '');
                const vid = cgEsc(data.srv_vlan_id || ''), gw = cgEsc(data.srv_gw || ''), dns = cgEsc(data.srv_dns || '');
                const shost = cgEsc(data.srv_static_host || ''), smac = cgEsc(data.srv_static_mac || ''), sip = cgEsc(data.srv_static_ip || '');
                const exLow = cgEsc(data.srv_excl_low || ''), exHigh = cgEsc(data.srv_excl_high || '');
                c += '# VLAN + IRB\nset vlans ' + pool + ' vlan-id ' + vid + ' l3-interface irb.' + vid + '\n';
                c += 'set interfaces irb unit ' + vid + ' family inet address ' + irbip + '\n\n';
                c += '# DHCP Address Pool\nset access address-assignment pool ' + pool + ' family inet network ' + network + '\n';
                c += 'set access address-assignment pool ' + pool + ' family inet dhcp-attributes name-server { ' + dns + '; }\n';
                c += 'set access address-assignment pool ' + pool + ' family inet dhcp-attributes router { ' + gw + '; }\n';
                if (shost && smac && sip) {
                    c += 'set access address-assignment pool ' + pool + ' family inet host ' + shost + ' hardware-address ' + smac + ' ip-address ' + sip + '\n';
                }
                if (exLow && exHigh) {
                    c += 'set access address-assignment pool ' + pool + ' family inet excluded-range my-range low ' + exLow + ' high ' + exHigh + '\n';
                }
                c += '\n# DHCP Local Server\nset system services dhcp-local-server group my-group interface irb.' + vid + '\n';
            } else if (mode === 'global') {
                const pool = cgEsc(data.gbl_pool || ''), bip = cgEsc(data.gbl_bind_ip || ''), bmac = cgEsc(data.gbl_bind_mac || '');
                const iface = cgEsc(data.gbl_iface || ''), gip = cgEsc(data.gbl_ip || '');
                c += 'set access address-assignment pool ' + pool + ' static-bind ip-address ' + bip + ' mac-address ' + bmac + '\n';
                c += 'set interfaces ' + iface + ' unit 0 family inet address ' + gip + '\n';
                c += 'set system services dhcp-local-server group my-group interface ' + iface + '.0\n';
            } else {
                const riface = cgEsc(data.relay_iface || ''), rsrv = cgEsc(data.relay_server || ''), vrf = cgEsc(data.relay_vrf || '');
                c += 'set forwarding-options dhcp-relay server-group RelayGroup server ' + rsrv + '\n';
                c += 'set forwarding-options dhcp-relay interface ' + riface + '.0\n';
                if (vrf) c += 'set forwarding-options dhcp-relay server-group RelayGroup vrf ' + vrf + '\n';
            }
            c += '\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: ACL (Firewall Filter) ───────────────────────────────────────────
Juniper.acl = {
    label: 'ACL/Filter',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Juniper JunOS — Firewall Filter (ACL)',
                desc: 'Standart (kaynak IP) veya Extended (protokol + port) firewall filter tanımı.<br><small>Örn: <code>set firewall family inet filter block-telnet term term-10 from source-address 192.168.1.0/24</code></small>'
            },
            configTypes: [
                { id: 'standard', label: 'Standart', icon: 'fas fa-filter', desc: 'Kaynak IP eşleştirme', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended', icon: 'fas fa-shield-alt', desc: 'Protokol + port eşleştirme', badge: { text: 'Gelişmiş', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Filter Tanımı',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'filter_name', label: 'Filter Adı', type: 'text', required: true, placeholder: 'block-telnet', hint: 'Firewall filter adı' },
                        { name: 'term_name', label: 'Term Adı', type: 'text', required: true, placeholder: 'term-10', hint: 'Filter term adı' }
                    ]
                },
                {
                    title: 'Kaynak',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'src', label: 'Kaynak', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'specific', label: 'Belirli IP/Prefix' }
                        ]},
                        { name: 'src_ip', label: 'Kaynak IP / Prefix', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.0/24', hint: '"Belirli IP/Prefix" seçilirse doldur' }
                    ]
                },
                {
                    title: 'Extended — Protokol & Hedef',
                    icon: 'fas fa-exchange-alt',
                    showFor: ['extended'],
                    fields: [
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'icmp', label: 'ICMP' },
                            { value: 'ip', label: 'IP' }
                        ]},
                        { name: 'dst', label: 'Hedef', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'specific', label: 'Belirli IP/Prefix' }
                        ]},
                        { name: 'dst_ip', label: 'Hedef IP / Prefix', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1/32', hint: '"Belirli IP/Prefix" seçilirse doldur' },
                        { name: 'src_port', label: 'Kaynak Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 80', hint: 'TCP/UDP kaynak port (any veya numara)' },
                        { name: 'dst_port', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 443', hint: 'TCP/UDP hedef port (any veya numara)' },
                        { name: 'icmp_type', label: 'ICMP Tipi', type: 'text', optional: true, placeholder: 'echo-request', hint: 'Protokol ICMP ise ICMP tip adı' }
                    ]
                },
                {
                    title: 'Eylem & Uygulama',
                    icon: 'fas fa-check-circle',
                    fields: [
                        { name: 'action', label: 'Eylem', type: 'select', options: [
                            { value: 'accept', label: 'Accept (Permit)', selected: true },
                            { value: 'discard', label: 'Discard (Deny)' },
                            { value: 'reject', label: 'Reject (ICMP unreachable)' }
                        ]},
                        { name: 'apply_iface', label: 'Uygulama Arayüzü', type: 'text', optional: true, placeholder: 'ge-0/0/0', hint: 'Filtreyi uygulayacak arayüz (opsiyonel)' },
                        { name: 'apply_dir', label: 'Uygulama Yönü', type: 'select', options: [
                            { value: 'input', label: 'Input', selected: true },
                            { value: 'output', label: 'Output' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const fname = cgEsc(data.filter_name || ''), term = cgEsc(data.term_name || '');
            const type = data._cgtype || 'standard', action = cgEsc(data.action || 'accept');
            const src = cgEsc(data.src || 'any'), srcip = cgEsc(data.src_ip || '');
            const base = 'set firewall family inet filter ' + fname + ' term ' + term;
            let c = '# ========================================\n# Juniper JunOS — Firewall Filter (ACL)\n# ========================================\n\nconfigure\n\n';
            if (type === 'standard') {
                if (src === 'specific' && srcip) {
                    const prefix = srcip.includes('/') ? srcip : srcip + '/32';
                    c += base + ' from source-address ' + prefix + '\n';
                }
                c += base + ' then ' + action + '\n';
            } else {
                const proto = cgEsc(data.proto || 'tcp'), dst = cgEsc(data.dst || 'any'), dstip = cgEsc(data.dst_ip || '');
                const sp = cgEsc(data.src_port || ''), dp = cgEsc(data.dst_port || ''), icmpType = cgEsc(data.icmp_type || '');
                c += base + ' from protocol ' + proto + '\n';
                if (src === 'specific' && srcip) {
                    const prefix = srcip.includes('/') ? srcip : srcip + '/32';
                    c += base + ' from source-address ' + prefix + '\n';
                }
                if (dst === 'specific' && dstip) {
                    const prefix = dstip.includes('/') ? dstip : dstip + '/32';
                    c += base + ' from destination-address ' + prefix + '\n';
                }
                if ((proto === 'tcp' || proto === 'udp') && sp && sp !== 'any') {
                    c += base + ' from source-port ' + sp + '\n';
                }
                if ((proto === 'tcp' || proto === 'udp') && dp && dp !== 'any') {
                    c += base + ' from destination-port ' + dp + '\n';
                }
                if (proto === 'icmp' && icmpType) {
                    c += base + ' from icmp-type ' + icmpType + '\n';
                }
                c += base + ' then ' + action + '\n';
            }
            c += base.replace(' term ' + term, ' term default') + ' then accept\n\n';
            const applyIface = cgEsc(data.apply_iface || ''), applyDir = cgEsc(data.apply_dir || 'input');
            if (applyIface) {
                c += 'set interfaces ' + applyIface + ' unit 0 family inet filter ' + applyDir + ' ' + fname + '\n';
            }
            c += '\ncommit\n';
            c += '\n# Doğrulama:\n# show firewall filter ' + fname + '\n# run show firewall filter ' + fname + '\n';
            return c;
        });
    }
};

// ── Juniper MX: Interface ─────────────────────────────────────────────────────
const JuniperMX = {};

JuniperMX.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Juniper MX — Interface Konfigürasyonu',
                desc: 'MX serisi fiziksel arayüz, IP adresi, MPLS family ve MTU yapılandırması.<br><small>Örn: <code>set interfaces xe-0/0/0 unit 0 family inet address 10.0.0.1/30</code></small>'
            },
            sections: [
                {
                    title: 'Arayüz',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface', type: 'text', required: true, placeholder: 'xe-0/0/0', hint: 'Fiziksel arayüz adı (ör: xe-0/0/0, ge-0/0/0)' },
                        { name: 'unit', label: 'Unit', type: 'text', required: true, placeholder: '0', hint: 'Logical unit numarası (genellikle 0)' },
                        { name: 'desc', label: 'Açıklama', type: 'text', optional: true, placeholder: 'To-Provider-PE1', hint: 'Arayüz açıklaması' },
                        { name: 'ip', label: 'IP Adresi / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' }
                    ]
                },
                {
                    title: 'Gelişmiş Ayarlar',
                    icon: 'fas fa-cogs',
                    fields: [
                        { name: 'mpls_en', label: 'MPLS Etkinleştir', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ]},
                        { name: 'mtu', label: 'MTU', type: 'text', optional: true, placeholder: '9192', hint: 'Interface MTU (opsiyonel, ör: 9192 jumbo)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), unit = cgEsc(data.unit || '0');
            const desc = cgEsc(data.desc || ''), ip = cgEsc(data.ip || '');
            const mplsEn = cgEsc(data.mpls_en || 'yes'), mtu = cgEsc(data.mtu || '');
            let c = '# ========================================\n# Juniper MX — Interface\n# ========================================\n\n';
            if (desc) c += 'set interfaces ' + iface + ' description "' + desc + '"\n';
            if (mtu) c += 'set interfaces ' + iface + ' mtu ' + mtu + '\n';
            c += 'set interfaces ' + iface + ' unit ' + unit + ' family inet address ' + ip + '\n';
            if (mplsEn === 'yes') {
                c += 'set interfaces ' + iface + ' unit ' + unit + ' family mpls\n';
            }
            c += '\n# Doğrulama:\n# show interfaces ' + iface + '\n';
            return c;
        });
    }
};

// ── Juniper MX: OSPF ──────────────────────────────────────────────────────────
JuniperMX.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — OSPF',
                desc: 'OSPF area, interface ve MD5 authentication yapılandırması.<br><small>Örn: <code>set protocols ospf area 0.0.0.0 interface xe-0/0/0.0</code></small>'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'OSPF Router-ID (genellikle loopback IP)' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'interfaces', label: 'Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, lo0.0', hint: 'Virgülle ayrılmış OSPF arayüzleri' },
                        { name: 'lo_iface', label: 'Loopback (passive)', type: 'text', optional: true, placeholder: 'lo0.0', hint: 'Passive olarak işaretlenecek loopback arayüzü' },
                        { name: 'auth_key', label: 'Authentication Key', type: 'text', optional: true, placeholder: 'ospf-secret', hint: 'MD5 authentication şifresi (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
            const ifaces = cgEsc(data.interfaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const loIface = cgEsc(data.lo_iface || ''), authKey = cgEsc(data.auth_key || '');
            let c = '# ========================================\n# Juniper MX — OSPF\n# ========================================\n\n';
            c += 'set routing-options router-id ' + routerId + '\n\n';
            ifaces.forEach(iface => {
                c += 'set protocols ospf area ' + area + ' interface ' + iface;
                if (iface === loIface) c += ' passive';
                c += '\n';
                if (authKey) c += 'set protocols ospf area ' + area + ' interface ' + iface + ' authentication md5 1 key "' + authKey + '"\n';
            });
            c += '\n# Doğrulama:\n# show ospf neighbor\n# show ospf route\n';
            return c;
        });
    }
};

// ── Juniper MX: BGP ───────────────────────────────────────────────────────────
JuniperMX.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Juniper MX — BGP',
                desc: 'iBGP/eBGP peer group yapılandırması, VPNv4 address-family desteği.<br><small>Örn: <code>set protocols bgp group IBGP_PEERS type internal neighbor 10.0.0.2 peer-as 65002</code></small>'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP Router-ID (genellikle loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', label: 'Peer Group Adı', type: 'text', required: true, placeholder: 'IBGP_PEERS', hint: 'BGP peer group adı' },
                        { name: 'bgp_type', label: 'BGP Tipi', type: 'select', options: [
                            { value: 'internal', label: 'iBGP', selected: true },
                            { value: 'external', label: 'eBGP' }
                        ]},
                        { name: 'vpnv4', label: 'VPNv4 (L3VPN için)', type: 'select', options: [
                            { value: 'no', label: 'Hayır', selected: true },
                            { value: 'yes', label: 'Evet' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || '');
            const peerGroup = cgEsc(data.peer_group || ''), bgpType = cgEsc(data.bgp_type || 'internal');
            const vpnv4 = cgEsc(data.vpnv4 || 'no');
            let c = '# ========================================\n# Juniper MX — BGP\n# ========================================\n\n';
            c += 'set routing-options autonomous-system ' + localAs + '\n';
            c += 'set routing-options router-id ' + routerId + '\n\n';
            c += 'set protocols bgp group ' + peerGroup + ' type ' + bgpType + '\n';
            if (bgpType === 'internal') {
                c += 'set protocols bgp group ' + peerGroup + ' local-as ' + localAs + '\n';
            }
            if (vpnv4 === 'yes') {
                c += 'set protocols bgp group ' + peerGroup + ' family inet-vpn unicast\n';
            } else {
                c += 'set protocols bgp group ' + peerGroup + ' family inet unicast\n';
            }
            c += 'set protocols bgp group ' + peerGroup + ' neighbor ' + peerIp + ' peer-as ' + peerAs + '\n';
            c += '\n# Doğrulama:\n# show bgp summary\n# show bgp neighbor ' + peerIp + '\n';
            return c;
        });
    }
};

// ── Juniper MX: MPLS LDP ──────────────────────────────────────────────────────
JuniperMX.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Juniper MX — MPLS / LDP',
                desc: 'MPLS ve LDP interface etkinleştirme, transport-address yapılandırması.<br><small>Örn: <code>set protocols mpls interface xe-0/0/0.0</code> &nbsp;|&nbsp; <code>set protocols ldp transport-address 1.1.1.1</code></small>'
            },
            sections: [
                {
                    title: 'MPLS & LDP Arayüzleri',
                    icon: 'fas fa-random',
                    fields: [
                        { name: 'mpls_ifaces', label: 'MPLS Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, xe-0/0/1.0', hint: 'Virgülle ayrılmış MPLS arayüzleri' },
                        { name: 'ldp_ifaces', label: 'LDP Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, xe-0/0/1.0', hint: 'Virgülle ayrılmış LDP arayüzleri' },
                        { name: 'router_id', label: 'Router ID (LDP Transport)', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'LDP transport-address (genellikle loopback IP)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mplsIfaces = cgEsc(data.mpls_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const ldpIfaces = cgEsc(data.ldp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const routerId = cgEsc(data.router_id || '');
            let c = '# ========================================\n# Juniper MX — MPLS / LDP\n# ========================================\n\n';
            mplsIfaces.forEach(i => c += 'set protocols mpls interface ' + i + '\n');
            c += '\n';
            ldpIfaces.forEach(i => c += 'set protocols ldp interface ' + i + '\n');
            c += 'set protocols ldp transport-address ' + routerId + '\n\n';
            c += '# Doğrulama:\n# show mpls interface\n# show ldp neighbor\n# show ldp database\n';
            return c;
        });
    }
};

// ── Juniper MX: L3VPN ─────────────────────────────────────────────────────────
JuniperMX.l3vpn = {
    label: 'L3VPN (VRF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — L3VPN (VRF)',
                desc: 'MPLS L3VPN: VRF tanımı, Route Distinguisher, Route Target ve CE-PE BGP yapılandırması.<br><small>Örn: <code>set routing-instances CUST_A instance-type vrf</code> &nbsp;|&nbsp; <code>set routing-instances CUST_A route-distinguisher 65001:100</code></small>'
            },
            sections: [
                {
                    title: 'VRF Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vrf_name', label: 'VRF Adı', type: 'text', required: true, placeholder: 'CUST_A', hint: 'Routing instance (VRF) adı' },
                        { name: 'rd', label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'ASN:NN formatında RD' },
                        { name: 'rt_import', label: 'Route Target Import', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import community' },
                        { name: 'rt_export', label: 'Route Target Export', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Export community' }
                    ]
                },
                {
                    title: 'CE Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ce_iface', label: 'CE Interface', type: 'text', required: true, placeholder: 'xe-0/1/0.100', hint: 'Müşteri tarafı arayüzü' },
                        { name: 'ce_ip', label: 'CE IP / Prefix', type: 'text', required: true, placeholder: '10.1.1.1/30', hint: 'CE-PE link IP adresi (CIDR)' },
                        { name: 'ce_as', label: 'CE BGP AS', type: 'text', validate: 'asn', optional: true, placeholder: '65100', hint: 'CE-PE BGP için CE AS numarası (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vrfName = cgEsc(data.vrf_name || ''), rd = cgEsc(data.rd || '');
            const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
            const ceIface = cgEsc(data.ce_iface || ''), ceIp = cgEsc(data.ce_ip || ''), ceAs = cgEsc(data.ce_as || '');
            let c = '# ========================================\n# Juniper MX — L3VPN (VRF)\n# ========================================\n\n';
            c += '# VRF Tanımı\n';
            c += 'set routing-instances ' + vrfName + ' instance-type vrf\n';
            c += 'set routing-instances ' + vrfName + ' route-distinguisher ' + rd + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-target target:' + rtImport + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-import VRF_IMPORT_' + vrfName + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-export VRF_EXPORT_' + vrfName + '\n\n';
            c += '# CE Interface\n';
            c += 'set interfaces ' + ceIface + ' family inet address ' + ceIp + '\n';
            c += 'set routing-instances ' + vrfName + ' interface ' + ceIface + '\n\n';
            if (ceAs) {
                c += '# CE-PE BGP\n';
                c += 'set routing-instances ' + vrfName + ' protocols bgp group CE_' + vrfName;
                c += ' type external peer-as ' + ceAs + '\n';
                const ceIpAddr = ceIp.split('/')[0].replace(/\.\d+$/, '') + '.' + (parseInt(ceIp.split('/')[0].split('.').pop()) + 1);
                c += 'set routing-instances ' + vrfName + ' protocols bgp group CE_' + vrfName + ' neighbor ' + ceIpAddr + '\n\n';
            }
            c += '# Route Policy (import/export)\n';
            c += 'set policy-options policy-statement VRF_IMPORT_' + vrfName + ' term 1 from community VRF_COM_' + vrfName + '\n';
            c += 'set policy-options policy-statement VRF_IMPORT_' + vrfName + ' term 1 then accept\n';
            c += 'set policy-options policy-statement VRF_EXPORT_' + vrfName + ' term 1 then community add VRF_COM_' + vrfName + '\n';
            c += 'set policy-options policy-statement VRF_EXPORT_' + vrfName + ' term 1 then accept\n';
            c += 'set policy-options community VRF_COM_' + vrfName + ' members target:' + rtExport + '\n\n';
            c += '# Doğrulama:\n# show route table ' + vrfName + '.inet.0\n# show bgp summary instance ' + vrfName + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: LAG (ae interface) ─────────────────────────────────────────
Juniper.lag = {
    label: 'LAG (ae Interface)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Juniper JunOS — LAG (ae Interface)',
                desc: 'LACP ile Link Aggregation Group yapılandırması — routed veya L2 trunk modda.<br><small>Örn: <code>set interfaces xe-0/0/0 ether-options 802.3ad ae0</code> &nbsp;|&nbsp; <code>set interfaces ae0 aggregated-ether-options lacp active</code></small>'
            },
            sections: [
                {
                    title: 'AE Interface',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'ae_id', label: 'AE Interface ID', type: 'text', required: true, placeholder: '0', hint: 'ae arayüzü numarası (ör: 0 → ae0)' },
                        { name: 'lacp_mode', label: 'LACP Mod', type: 'select', options: [
                            { value: 'active', label: 'Active', selected: true },
                            { value: 'passive', label: 'Passive' }
                        ]},
                        { name: 'members', label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0, xe-0/0/1', hint: 'Virgülle ayrılmış fiziksel arayüzler' }
                    ]
                },
                {
                    title: 'AE Kullanım Modu',
                    icon: 'fas fa-cogs',
                    info: 'Routed IP veya L2 Trunk moddan birini doldurun; ikisi birden kullanılmaz.',
                    fields: [
                        { name: 'ae_ip', label: 'AE IP (routed ise)', type: 'text', optional: true, placeholder: '10.0.0.1/30', hint: 'Layer 3 routed mod için IP adresi (CIDR)' },
                        { name: 'vlans', label: 'Trunk VLAN\'lar (L2 ise)', type: 'text', optional: true, placeholder: '10 20 100', hint: 'Boşluk/virgülle ayrılmış VLAN listesi (L2 trunk mod)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const aeId = cgEsc(data.ae_id || ''), lacpMode = cgEsc(data.lacp_mode || 'active');
            const members = cgEsc(data.members || '').split(',').map(s => s.trim()).filter(Boolean);
            const aeIp = cgEsc(data.ae_ip || ''), vlans = cgEsc(data.vlans || '');
            let c = '# ========================================\n# Juniper JunOS — LAG (ae Interface)\n# ========================================\n\n';
            c += 'set chassis aggregated-devices ethernet device-count 10\n\n';
            members.forEach(m => {
                c += 'set interfaces ' + m + ' ether-options 802.3ad ae' + aeId + '\n';
                c += 'set interfaces ' + m + ' gigether-options 802.3ad ae' + aeId + '\n';
            });
            c += '\nset interfaces ae' + aeId + ' aggregated-ether-options lacp ' + lacpMode + '\n';
            if (aeIp) {
                c += 'set interfaces ae' + aeId + ' unit 0 family inet address ' + aeIp + '\n';
            } else if (vlans) {
                c += 'set interfaces ae' + aeId + ' unit 0 family ethernet-switching interface-mode trunk\n';
                vlans.split(/[\s,]+/).filter(Boolean).forEach(v => c += 'set interfaces ae' + aeId + ' unit 0 family ethernet-switching vlan members ' + v + '\n');
            }
            c += '\n# Doğrulama:\n# show interfaces ae' + aeId + ' detail\n# show lacp interfaces ae' + aeId + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: MC-LAG ─────────────────────────────────────────────────────
Juniper.mclag = {
    label: 'MC-LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Juniper JunOS — MC-LAG',
                desc: 'İki Juniper cihazı arasında Multi-Chassis LAG — ICCP ile kontrol düzlemi senkronizasyonu.<br><small>Örn: <code>set protocols iccp local-ip-addr 192.168.255.1</code> &nbsp;|&nbsp; <code>set interfaces ae10 aggregated-ether-options lacp system-id 00:11:22:33:44:55</code></small>'
            },
            sections: [
                {
                    title: 'ICCP Ayarları',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'local_ip', label: 'ICCP Local IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.255.1', hint: 'Bu cihazın ICCP IP adresi' },
                        { name: 'peer_ip', label: 'ICCP Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.255.2', hint: 'Karşı cihazın ICCP IP adresi' }
                    ]
                },
                {
                    title: 'MC-LAG Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'sys_id', label: 'LACP System ID', type: 'text', required: true, placeholder: '00:11:22:33:44:55', hint: 'Her iki cihazda aynı LACP system-id (sanal MAC)' },
                        { name: 'ae_id', label: 'AE Interface ID (MC-LAG)', type: 'text', required: true, placeholder: '10', hint: 'MC-LAG ae arayüzü numarası' },
                        { name: 'icl_ae', label: 'ICL AE Interface ID', type: 'text', required: true, placeholder: '0', hint: 'Inter-Chassis Link (ICL) ae arayüzü numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localIp = cgEsc(data.local_ip || ''), peerIp = cgEsc(data.peer_ip || '');
            const sysId = cgEsc(data.sys_id || ''), aeId = cgEsc(data.ae_id || ''), iclAe = cgEsc(data.icl_ae || '');
            let c = '# ========================================\n# Juniper JunOS — MC-LAG\n# ========================================\n\n';
            c += '# ICCP (Inter-Chassis Control Protocol)\n';
            c += 'set protocols iccp local-ip-addr ' + localIp + '\n';
            c += 'set protocols iccp peer ' + peerIp + ' redundancy-group-id-list 1\n';
            c += 'set protocols iccp peer ' + peerIp + ' liveness-detection minimum-interval 1000\n\n';
            c += '# MC-LAG Interface\n';
            c += 'set interfaces ae' + aeId + ' aggregated-ether-options lacp active\n';
            c += 'set interfaces ae' + aeId + ' aggregated-ether-options lacp system-id ' + sysId + '\n';
            c += 'set interfaces ae' + aeId + ' multi-chassis-protection ' + peerIp + ' interface ae' + iclAe + '\n\n';
            c += '# Redundancy Group\n';
            c += 'set multi-chassis multi-chassis-protection interface ae' + iclAe + ' redundancy-group 1\n\n';
            c += '# Doğrulama:\n# show iccp\n# show multi-chassis mc-lag interfaces\n';
            return c;
        });
    }
};

// ── Juniper JunOS: EVPN-VXLAN ────────────────────────────────────────────────
Juniper.evpnvxlan = {
    label: 'EVPN-VXLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'Juniper JunOS — EVPN-VXLAN',
                desc: 'BGP tabanlı EVPN control-plane ile VXLAN data-plane yapılandırması.<br><small>Örn: <code>set vlans VNI_10100 vxlan vni 10100</code> &nbsp;|&nbsp; <code>set protocols evpn extended-vni-list 10100</code></small>'
            },
            sections: [
                {
                    title: 'VNI & VLAN',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vni', label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek VLAN ID' }
                    ]
                },
                {
                    title: 'VTEP (Loopback)',
                    icon: 'fas fa-circle',
                    fields: [
                        { name: 'lo_iface', label: 'VTEP Loopback', type: 'text', required: true, placeholder: 'lo0.0', hint: 'VTEP kaynak arayüzü (loopback)' },
                        { name: 'vtep_ip', label: 'VTEP IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1/32', hint: 'Loopback IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'BGP EVPN',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'bgp_as', label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel AS numarası' },
                        { name: 'rd', label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '10.0.0.1:100', hint: 'EVPN routing instance RD' },
                        { name: 'rt', label: 'Route Target', type: 'text', validate: 'rt', required: true, placeholder: 'target:65001:100', hint: 'EVPN VNI route target' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || ''), vlanId = cgEsc(data.vlan_id || '');
            const loIface = cgEsc(data.lo_iface || ''), vtepIp = cgEsc(data.vtep_ip || '');
            const bgpAs = cgEsc(data.bgp_as || ''), rd = cgEsc(data.rd || ''), rt = cgEsc(data.rt || '');
            let c = '# ========================================\n# Juniper JunOS — EVPN-VXLAN\n# ========================================\n\n';
            c += '# VTEP Loopback\nset interfaces ' + loIface.split('.')[0] + ' unit ' + (loIface.split('.')[1] || '0') + ' family inet address ' + vtepIp + '\n\n';
            c += '# VXLAN Tunnel\nset vlans VNI_' + vni + ' vxlan vni ' + vni + '\nset vlans VNI_' + vni + ' vlan-id ' + vlanId + '\n\n';
            c += '# EVPN\nset routing-instances EVPN_' + vni + ' instance-type evpn\n';
            c += 'set routing-instances EVPN_' + vni + ' vxlan source-interface ' + loIface + '\n';
            c += 'set routing-instances EVPN_' + vni + ' vxlan vni ' + vni + '\n\n';
            c += '# BGP EVPN\nset routing-options autonomous-system ' + bgpAs + '\n';
            c += 'set protocols bgp group EVPN type internal\n';
            c += 'set protocols bgp group EVPN family evpn signaling\n';
            c += 'set protocols evpn encapsulation vxlan\n';
            c += 'set protocols evpn extended-vni-list ' + vni + '\n';
            c += 'set protocols evpn vni-options vni ' + vni + ' vrf-target ' + rt + '\n\n';
            c += '# Doğrulama:\n# show evpn database\n# show bgp summary\n# show vxlan interface\n';
            return c;
        });
    }
};

// ── Juniper MX: BFD ───────────────────────────────────────────────────────────
JuniperMX.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Juniper MX — BFD',
                desc: 'Bidirectional Forwarding Detection — OSPF ve BGP için hızlı link failure detection.<br><small>Örn: <code>set protocols ospf area 0 interface ge-0/0/1.0 bfd-liveness-detection minimum-interval 300 multiplier 3</code></small>'
            },
            sections: [
                {
                    title: 'BFD Parametreleri',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'neighbor', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD komşu IP adresi' },
                        { name: 'local_addr', label: 'Local Address', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Yerel BFD kaynak IP adresi' },
                        { name: 'min_interval', label: 'Min Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD hello aralığı (ms)' },
                        { name: 'multiplier', label: 'Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç hello miss sonrası failure kabul edilsin' },
                        { name: 'session_mode', label: 'Session Mode', type: 'select', options: [
                            { value: 'automatic', label: 'automatic', selected: true },
                            { value: 'multihop', label: 'multihop' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const neighbor = cgEsc(data.neighbor || ''), localAddr = cgEsc(data.local_addr || '');
            const minInterval = cgEsc(data.min_interval || ''), multiplier = cgEsc(data.multiplier || '');
            const sessionMode = cgEsc(data.session_mode || 'automatic');
            let c = '# ========================================\n# Juniper MX — BFD\n# ========================================\n\n';
            c += '# BFD for OSPF:\n';
            c += 'set protocols ospf area 0 interface ge-0/0/1.0 bfd-liveness-detection minimum-interval ' + minInterval + ' multiplier ' + multiplier + '\n\n';
            c += '# BFD for BGP:\n';
            c += 'set protocols bgp group PEERS bfd-liveness-detection minimum-interval ' + minInterval + ' multiplier ' + multiplier + '\n\n';
            c += '# Static BFD session (neighbor=' + neighbor + ', local=' + localAddr + ', mode=' + sessionMode + '):\n';
            c += 'set routing-options static route 0.0.0.0/0 bfd-liveness-detection minimum-interval ' + minInterval + '\n';
            c += '\n# Doğrulama:\n# show bfd session\n# show bfd session detail\n';
            return c;
        });
    }
};

// ── Juniper MX: RSVP-TE ───────────────────────────────────────────────────────
JuniperMX.rsvpte = {
    label: 'Traffic Engineering RSVP-TE',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — Traffic Engineering RSVP-TE',
                desc: 'MPLS RSVP-TE LSP — bant genişliği garantili trafik mühendisliği tüneli.<br><small>Örn: <code>set protocols mpls label-switched-path LSP-TO-PE2 to 10.255.0.2 bandwidth 100m</code></small>'
            },
            sections: [
                {
                    title: 'LSP Yapılandırması',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'lsp_name', label: 'LSP Adı', type: 'text', required: true, placeholder: 'LSP-TO-PE2', hint: 'Label Switched Path adı' },
                        { name: 'destination', label: 'Destination (Router ID)', type: 'text', required: true, placeholder: '10.255.0.2', hint: 'Hedef PE Router-ID' },
                        { name: 'bandwidth', label: 'Bandwidth', type: 'text', required: true, placeholder: '100m', hint: 'Bant genişliği (ör: 100m, 1g)' },
                        { name: 'primary_path', label: 'Primary Path Adı', type: 'text', required: true, placeholder: 'PATH-DIRECT', hint: 'Birincil yol adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const lspName = cgEsc(data.lsp_name || ''), destination = cgEsc(data.destination || '');
            const bandwidth = cgEsc(data.bandwidth || ''), primaryPath = cgEsc(data.primary_path || '');
            let c = '# ========================================\n# Juniper MX — Traffic Engineering RSVP-TE\n# ========================================\n\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' to ' + destination + '\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' bandwidth ' + bandwidth + '\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' primary ' + primaryPath + '\n';
            c += 'set protocols mpls path ' + primaryPath + ' ' + destination + ' strict\n';
            c += 'set protocols rsvp interface ge-0/0/1.0\n';
            c += 'set protocols mpls interface ge-0/0/1.0\n';
            c += '\n# Doğrulama:\n# show mpls lsp\n# show rsvp session\n';
            return c;
        });
    }
};

// ── Juniper MX: Class-of-Service (QoS) ───────────────────────────────────────
JuniperMX.cos = {
    label: 'QoS / Class-of-Service',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Juniper MX — QoS / Class-of-Service',
                desc: 'Forwarding class, DSCP classifier ve scheduler map yapılandırması.<br><small>Örn: <code>set class-of-service forwarding-classes class voice queue-num 5</code></small>'
            },
            sections: [
                {
                    title: 'Forwarding Class & Scheduler',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'forwarding_class', label: 'Forwarding Class Adı', type: 'text', required: true, placeholder: 'voice', hint: 'Trafik sınıfı adı (ör: voice, video, best-effort)' },
                        { name: 'scheduler_map_name', label: 'Scheduler Map Adı', type: 'text', required: true, placeholder: 'SCH-MAP-EDGE', hint: 'Scheduler map adı' },
                        { name: 'shaping_rate', label: 'Shaping Rate', type: 'text', required: true, placeholder: '100m', hint: 'Maksimum şekillendirme hızı (ör: 100m, 1g)' },
                        { name: 'priority', label: 'Priority', type: 'select', options: [
                            { value: 'high', label: 'high', selected: true },
                            { value: 'medium-high', label: 'medium-high' },
                            { value: 'low', label: 'low' }
                        ]},
                        { name: 'dscp_match', label: 'DSCP Match', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP code point (ör: ef, af41, cs3, be)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const forwardingClass = cgEsc(data.forwarding_class || '');
            const schedulerMapName = cgEsc(data.scheduler_map_name || '');
            const shapingRate = cgEsc(data.shaping_rate || ''), priority = cgEsc(data.priority || 'high');
            const dscpMatch = cgEsc(data.dscp_match || '');
            let c = '# ========================================\n# Juniper MX — QoS / Class-of-Service\n# ========================================\n\n';
            c += 'set class-of-service forwarding-classes class ' + forwardingClass + ' queue-num 5\n';
            c += 'set class-of-service classifiers dscp DSCP-CLASSIFIER forwarding-class ' + forwardingClass + ' loss-priority low code-points ' + dscpMatch + '\n';
            c += 'set class-of-service schedulers SCH-' + forwardingClass + ' priority ' + priority + ' shaping-rate ' + shapingRate + '\n';
            c += 'set class-of-service scheduler-maps ' + schedulerMapName + ' forwarding-class ' + forwardingClass + ' scheduler SCH-' + forwardingClass + '\n';
            c += '\n# Doğrulama:\n# show class-of-service interface\n# show class-of-service classifier\n';
            return c;
        });
    }
};

// ── Juniper MX: Routing Policy + Prefix-List ─────────────────────────────────
JuniperMX.routepolicy = {
    label: 'Routing Policy + Prefix-List',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'Juniper MX — Routing Policy + Prefix-List',
                desc: 'Prefix-list tanımı, policy-statement term eşleştirmesi ve community tagging.<br><small>Örn: <code>set policy-options prefix-list PL-CUSTOMER 192.168.0.0/16 upto /24</code></small>'
            },
            sections: [
                {
                    title: 'Prefix-List',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'pl_name', label: 'Prefix-List Adı', type: 'text', required: true, placeholder: 'PL-CUSTOMER', hint: 'Prefix listesi adı' },
                        { name: 'prefix', label: 'Prefix', type: 'text', required: true, placeholder: '192.168.0.0/16 upto /24', hint: 'Prefix ve opsiyonel upto koşulu' }
                    ]
                },
                {
                    title: 'Policy Statement',
                    icon: 'fas fa-code-branch',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-EXPORT', hint: 'Policy statement adı' },
                        { name: 'term_name', label: 'Term Adı', type: 'text', required: true, placeholder: 'MATCH-CUSTOMER', hint: 'Policy term adı' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'accept', label: 'accept', selected: true },
                            { value: 'reject', label: 'reject' }
                        ]},
                        { name: 'set_community', label: 'Set Community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community ekle (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const plName = cgEsc(data.pl_name || ''), prefix = cgEsc(data.prefix || '');
            const policyName = cgEsc(data.policy_name || ''), termName = cgEsc(data.term_name || '');
            const action = cgEsc(data.action || 'accept'), setCommunity = cgEsc(data.set_community || '');
            let c = '# ========================================\n# Juniper MX — Routing Policy + Prefix-List\n# ========================================\n\n';
            c += 'set policy-options prefix-list ' + plName + ' ' + prefix + '\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' from prefix-list ' + plName + '\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' from protocol bgp\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' then ' + action + '\n';
            if (setCommunity) {
                c += 'set policy-options community COMM-' + policyName + ' members ' + setCommunity + '\n';
                c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' then community add COMM-' + policyName + '\n';
            }
            c += 'set policy-options policy-statement ' + policyName + ' term DEFAULT then reject\n';
            c += '\n# Doğrulama:\n# show route advertising-protocol bgp <neighbor> policy ' + policyName + '\n';
            return c;
        });
    }
};

// ── Juniper MX: SNMP v3 ───────────────────────────────────────────────────────
JuniperMX.snmp = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'Juniper MX — SNMP v3',
                desc: 'USM kullanıcı, authentication/privacy protokolü ve trap hedefi yapılandırması.<br><small>Örn: <code>set snmp v3 usm local-engine user snmp-mx authentication-sha authentication-password AuthPass123!</code></small>'
            },
            sections: [
                {
                    title: 'USM Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'usm_user', label: 'USM User', type: 'text', required: true, placeholder: 'snmp-mx', hint: 'SNMP v3 USM kullanıcı adı' },
                        { name: 'auth_proto', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Authentication şifresi (min 8 karakter)' },
                        { name: 'priv_proto', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_pass', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
                    icon: 'fas fa-bullseye',
                    fields: [
                        { name: 'trap_group', label: 'Trap Group Adı', type: 'text', required: true, placeholder: 'TRAPS', hint: 'SNMP trap group adı' },
                        { name: 'target_ip', label: 'Target IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap alıcısı IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const usmUser = cgEsc(data.usm_user || ''), authProto = cgEsc(data.auth_proto || 'sha');
            const authPass = cgEsc(data.auth_pass || ''), privProto = cgEsc(data.priv_proto || 'aes128');
            const privPass = cgEsc(data.priv_pass || ''), trapGroup = cgEsc(data.trap_group || '');
            const targetIp = cgEsc(data.target_ip || '');
            let c = '# ========================================\n# Juniper MX — SNMP v3\n# ========================================\n\n';
            c += 'set snmp v3 usm local-engine user ' + usmUser + ' authentication-' + authProto + ' authentication-password ' + authPass + '\n';
            c += 'set snmp v3 usm local-engine user ' + usmUser + ' privacy-' + privProto + ' privacy-password ' + privPass + '\n';
            c += 'set snmp v3 target-parameters ' + usmUser + '-params parameters security-model usm security-level privacy security-name ' + usmUser + '\n';
            c += 'set snmp trap-group ' + trapGroup + ' version v3\n';
            c += 'set snmp trap-group ' + trapGroup + ' targets ' + targetIp + '\n';
            c += '\n# Doğrulama:\n# show snmp v3\n';
            return c;
        });
    }
};
