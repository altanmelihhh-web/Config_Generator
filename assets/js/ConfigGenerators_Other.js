'use strict';

const Dell = {};
const ExtremeNet = {};

// ── Dell: General ─────────────────────────────────────────────────────────────
Dell.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Dell OS10 — Genel Konfigürasyon',
                desc: 'Temel hostname, VLAN, IP ve gateway yapılandırması. Dell OS10 Cisco-benzeri CLI kullanır.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'DELL-SW1', hint: 'Cihaz host adı' }
                    ]
                },
                {
                    title: 'VLAN ve IP Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Layer 2 VLAN numarası' },
                        { name: 'wan_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'SVI / WAN IP adresi' },
                        { name: 'subnet', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet maskesi' },
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan ağ geçidi IP adresi' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'LAN Arayüzü (port aralığı)', type: 'text', required: true, placeholder: 'ethernet1/1/1-1/1/4', hint: 'Access VLAN atanacak port aralığı' },
                        { name: 'wan_iface', label: 'WAN Arayüzü', type: 'text', required: true, placeholder: 'ethernet1/1/5', hint: 'IP adresi atanacak WAN portu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || '');
            const wanIp = cgEsc(data.wan_ip || ''), subnet = cgEsc(data.subnet || '');
            const gw = cgEsc(data.gw || ''), iface = cgEsc(data.iface || '');
            const wanIface = cgEsc(data.wan_iface || '');
            let c = '# ========================================\n# Dell OS10 — General Configuration\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Hostname\nhostname ' + hn + '\n\n';
            c += '# VLAN\nvlan ' + vlan + '\n name VLAN_' + vlan + '\n!\n';
            c += 'interface vlan ' + vlan + '\n ip address ' + wanIp + ' ' + subnet + '\n no shutdown\n!\n\n';
            c += '# Default Gateway\nip route 0.0.0.0 0.0.0.0 ' + gw + '\n\n';
            c += '# WAN Interface\ninterface ' + wanIface + '\n ip address ' + wanIp + ' ' + subnet + '\n no shutdown\n!\n\n';
            c += '# LAN Port — VLAN Access\ninterface range ' + iface + '\n switchport mode access\n switchport access vlan ' + vlan + '\n no shutdown\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show running-configuration\n# show vlan ' + vlan + '\n# show interfaces ' + wanIface + '\n# show ip route\n';
            return c;
        });
    }
};

// ── ExtremeNet: General ───────────────────────────────────────────────────────
// ExtremeXOS VLAN-centric model: ports are assigned TO vlans, not the reverse.
// Routing: configure iproute add default (not "ip route")
// Save:    save configuration (not "write memory")
ExtremeNet.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Extreme Networks ExtremeXOS — Genel Konfigürasyon',
                desc: 'ExtremeXOS VLAN-centric model: portlar VLAN\'a atanır (Cisco\'nun tersi). <code>save configuration</code> ile kaydedilir.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'EXTR-SW1', hint: 'Cihaz sistem adı' }
                    ]
                },
                {
                    title: 'VLAN Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan_name', label: 'VLAN Adı (EXOS VLAN name)', type: 'text', required: true, placeholder: 'CORP', hint: 'ExtremeXOS VLAN tanımlayıcı adı' },
                        { name: 'vlan_id', label: 'VLAN ID (Tag)', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: '802.1Q VLAN tag numarası' },
                        { name: 'ip', label: 'SVI IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.1', hint: 'VLAN\'a atanacak IP adresi' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet maskesi' },
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.254', hint: 'Varsayılan ağ geçidi' }
                    ]
                },
                {
                    title: 'Port Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'access_ports', label: 'Access Port(lar)', type: 'text', required: true, placeholder: '1,2,3,4', hint: 'Virgülle ayrılmış port listesi veya aralık (ör: 1-4)' },
                        { name: 'uplink_ports', label: 'Uplink/Trunk Port (tagged)', type: 'text', required: true, placeholder: '49', hint: 'Tagged uplink portu veya portlar (ör: 49,50)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vname = cgEsc(data.vlan_name || '');
            const vid = cgEsc(data.vlan_id || ''), ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || ''), gw = cgEsc(data.gw || '');
            const aPorts = cgEsc(data.access_ports || ''), uPorts = cgEsc(data.uplink_ports || '');
            let c = '# ========================================\n# Extreme Networks ExtremeXOS — General Configuration\n# ========================================\n';
            c += '# NOT: ExtremeXOS VLAN-centric model kullanır.\n# Portlar VLAN\'a atanır (Cisco\'nun tersi).\n\n';
            c += '# Hostname\nset system name "' + hn + '"\n\n';
            c += '# VLAN Oluştur\ncreate vlan "' + vname + '" tag ' + vid + '\n\n';
            c += '# Access Portları VLAN\'a Untagged Ekle\nconfigure vlan "' + vname + '" add ports ' + aPorts + ' untagged\n\n';
            c += '# Uplink Portu VLAN\'a Tagged Ekle\nconfigure vlan "' + vname + '" add ports ' + uPorts + ' tagged\n\n';
            c += '# VLAN\'a IP Adresi Ata\nconfigure vlan "' + vname + '" ipaddress ' + ip + ' ' + mask + '\n\n';
            c += '# IP Forwarding Etkinleştir (routing için)\nenable ipforwarding vlan "' + vname + '"\n\n';
            c += '# Default Route\nconfigure iproute add default ' + gw + '\n\n';
            c += '# Kaydet\nsave configuration\n\n';
            c += '# Doğrulama:\n# show configuration\n# show vlan "' + vname + '"\n# show ipconfig vlan "' + vname + '"\n# show iproute\n';
            return c;
        });
    }
};

// ── Dell OS10: VLAN ───────────────────────────────────────────────────────────
Dell.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Dell OS10 — VLAN',
                desc: 'VLAN oluşturma, SVI IP ataması ve port modlarını yapılandırır (access/trunk).'
            },
            sections: [
                {
                    title: 'VLAN Tanımı',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '802.1Q VLAN numarası' },
                        { name: 'vlan_name', label: 'VLAN Adı', type: 'text', required: true, placeholder: 'DATA_VLAN', hint: 'VLAN için açıklayıcı isim' },
                        { name: 'svi_ip', label: 'SVI IP', type: 'text', optional: true, placeholder: '10.1.100.1/24', hint: 'VLAN arayüzü IP adresi — CIDR formatında' }
                    ]
                },
                {
                    title: 'Port Atamaları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'access_ports', label: 'Access Port(lar)', type: 'text', optional: true, placeholder: 'ethernet1/1/1, ethernet1/1/2', hint: 'Virgülle ayrılmış access port listesi' },
                        { name: 'trunk_ports', label: 'Trunk Port(lar)', type: 'text', optional: true, placeholder: 'ethernet1/1/48', hint: 'Virgülle ayrılmış trunk port listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vlanId = cgEsc(data.vlan_id || ''), vlanName = cgEsc(data.vlan_name || '');
            const sviIp = cgEsc(data.svi_ip || '');
            const accessPorts = (data.access_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const trunkPorts = (data.trunk_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — VLAN\n# ========================================\n\n';
            c += 'interface vlan ' + vlanId + '\n';
            c += ' description ' + vlanName + '\n';
            if (sviIp) c += ' ip address ' + sviIp + '\n';
            c += ' no shutdown\n!\n\n';
            accessPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' switchport mode access\n';
                c += ' switchport access vlan ' + vlanId + '\n!\n';
            });
            if (accessPorts.length) c += '\n';
            trunkPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' switchport mode trunk\n';
                c += ' switchport trunk allowed vlan ' + vlanId + '\n!\n';
            });
            c += '\n# Doğrulama:\n# show vlan id ' + vlanId + '\n# show interfaces vlan ' + vlanId + '\n';
            return c;
        });
    }
};

// ── Dell OS10: Port-Channel / LAG ─────────────────────────────────────────────
Dell.portchannel = {
    label: 'Port-Channel / LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Dell OS10 — Port-Channel / LAG',
                desc: 'LACP veya statik link aggregation yapılandırması. Trunk, access veya routed mod desteği.'
            },
            sections: [
                {
                    title: 'Port-Channel Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pc_id', label: 'Port-Channel ID', type: 'text', required: true, placeholder: '1', hint: 'Port-channel grup numarası' },
                        { name: 'lacp_mode', label: 'LACP Mod', type: 'select', options: [
                            { value: 'active', label: 'Active', selected: true },
                            { value: 'passive', label: 'Passive' },
                            { value: 'on', label: 'On (Static)' }
                        ]},
                        { name: 'members', label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'ethernet1/1/1, ethernet1/1/2', hint: 'Virgülle ayrılmış üye port listesi' }
                    ]
                },
                {
                    title: 'Switchport / Layer 3 Modu',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'sw_mode', label: 'Mod', type: 'select', options: [
                            { value: 'trunk', label: 'Trunk', selected: true },
                            { value: 'access', label: 'Access' },
                            { value: 'routed', label: 'Routed (no switchport)' }
                        ]},
                        { name: 'vlan_ip', label: 'VLAN / IP', type: 'text', optional: true, placeholder: '10,20,100 veya 10.1.1.1/30', hint: 'Trunk: VLAN listesi; Access: tek VLAN ID; Routed: IP/prefix' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pcId = cgEsc(data.pc_id || ''), lacpMode = cgEsc(data.lacp_mode || 'active');
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const swMode = cgEsc(data.sw_mode || 'trunk'), vlanIp = cgEsc(data.vlan_ip || '');
            let c = '# ========================================\n# Dell OS10 — Port-Channel / LAG\n# ========================================\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n';
                c += ' channel-group ' + pcId + ' mode ' + lacpMode + '\n!\n';
            });
            c += '\ninterface port-channel' + pcId + '\n';
            if (swMode === 'trunk') {
                c += ' switchport mode trunk\n';
                if (vlanIp) c += ' switchport trunk allowed vlan ' + vlanIp + '\n';
            } else if (swMode === 'access') {
                c += ' switchport mode access\n';
                if (vlanIp) c += ' switchport access vlan ' + vlanIp + '\n';
            } else {
                c += ' no switchport\n';
                if (vlanIp) c += ' ip address ' + vlanIp + '\n';
            }
            c += ' no shutdown\n!\n\n';
            c += '# Doğrulama:\n# show port-channel summary\n# show lacp ' + pcId + '\n';
            return c;
        });
    }
};

// ── Dell OS10: OSPF ───────────────────────────────────────────────────────────
Dell.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Dell OS10 — OSPF',
                desc: 'OSPF link-state routing konfigürasyonu. Area yapısı ve passive interface desteği.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'Genellikle Loopback IP — noktalı ondalık format' }
                    ]
                },
                {
                    title: 'Network ve Passive Interface',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'networks', label: 'Network(ler)', type: 'textarea', required: true, rows: 3, placeholder: '10.1.0.0/24 area 0\n10.2.0.0/24 area 1', hint: 'Her satıra: IP/prefix area N formatında' },
                        { name: 'passive', label: 'Passive Interface(ler)', type: 'text', optional: true, placeholder: 'loopback0', hint: 'Virgülle ayrılmış passive arayüz listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || ''), routerId = cgEsc(data.router_id || '');
            const networks = (data.networks || '').split('\n').map(s => cgEsc(s.trim())).filter(Boolean);
            const passive = (data.passive || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — OSPF\n# ========================================\n\n';
            c += 'router ospf ' + procId + '\n';
            c += ' router-id ' + routerId + '\n';
            networks.forEach(net => {
                const parts = net.split(/\s+/);
                c += ' network ' + parts[0] + ' ' + (parts[1] || 'area') + ' ' + (parts[2] || '0') + '\n';
            });
            passive.forEach(p => c += ' passive-interface ' + p + '\n');
            c += '!\n\n# Doğrulama:\n# show ip ospf neighbor\n# show ip ospf database\n';
            return c;
        });
    }
};

// ── Dell OS10: BGP ────────────────────────────────────────────────────────────
Dell.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Dell OS10 — BGP',
                desc: 'eBGP/iBGP peer konfigürasyonu, address-family ve network advertisement.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP Router-ID (genellikle Loopback IP)' },
                        { name: 'bgp_type', label: 'BGP Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP', selected: true },
                            { value: 'ibgp', label: 'iBGP' }
                        ]}
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'network', label: 'Advertise Network', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'BGP ile duyurulacak prefix' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || '');
            const bgpType = cgEsc(data.bgp_type || 'ebgp'), network = cgEsc(data.network || '');
            let c = '# ========================================\n# Dell OS10 — BGP\n# ========================================\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' bgp router-id ' + routerId + '\n';
            c += ' neighbor ' + peerIp + ' remote-as ' + peerAs + '\n';
            if (bgpType === 'ebgp') c += ' neighbor ' + peerIp + ' ebgp-multihop 2\n';
            c += ' address-family ipv4 unicast\n';
            c += '  neighbor ' + peerIp + ' activate\n';
            if (network) c += '  network ' + network + '\n';
            c += ' exit-address-family\n!\n\n';
            c += '# Doğrulama:\n# show ip bgp summary\n# show ip bgp neighbor ' + peerIp + '\n';
            return c;
        });
    }
};

// ── Dell OS10: VLT (MLAG) ─────────────────────────────────────────────────────
Dell.vlt = {
    label: 'VLT (MLAG)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Dell OS10 — VLT / MLAG',
                desc: 'Virtual Link Trunking (MLAG) yapılandırması. Primary/Secondary rol, ICL port-channel ve backup destination.'
            },
            sections: [
                {
                    title: 'VLT Domain',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'domain_id', label: 'VLT Domain ID', type: 'text', required: true, placeholder: '1', hint: 'VLT domain numarası (1–255)' },
                        { name: 'vlt_role', label: 'Rol', type: 'select', options: [
                            { value: 'primary', label: 'Primary', selected: true },
                            { value: 'secondary', label: 'Secondary' }
                        ]},
                        { name: 'backup_dest', label: 'Backup Destination IP (peer management IP)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.0.2', hint: 'Peer cihazının yönetim IP adresi' }
                    ]
                },
                {
                    title: 'ICL (Interconnect) Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'icl_ifaces', label: 'ICL Interface(ler)', type: 'text', required: true, placeholder: 'ethernet1/1/49, ethernet1/1/50', hint: 'Virgülle ayrılmış ICL port listesi' },
                        { name: 'icl_pc', label: 'ICL Port-Channel ID', type: 'text', required: true, placeholder: '127', hint: 'ICL için kullanılacak port-channel numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const domainId = cgEsc(data.domain_id || ''), vltRole = cgEsc(data.vlt_role || 'primary');
            const backupDest = cgEsc(data.backup_dest || '');
            const iclIfaces = (data.icl_ifaces || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const iclPc = cgEsc(data.icl_pc || '');
            let c = '# ========================================\n# Dell OS10 — VLT / MLAG (' + vltRole.toUpperCase() + ')\n# ========================================\n\n';
            iclIfaces.forEach(i => {
                c += 'interface ' + i + '\n';
                c += ' channel-group ' + iclPc + ' mode active\n!\n';
            });
            c += '\ninterface port-channel' + iclPc + '\n no switchport\n!\n\n';
            c += 'vlt domain ' + domainId + '\n';
            c += ' backup destination ' + backupDest + '\n';
            c += ' discovery-interface port-channel' + iclPc + '\n';
            if (vltRole === 'primary') c += ' primary-priority 1\n';
            c += '!\n\n# Doğrulama:\n# show vlt ' + domainId + '\n# show vlt backup-link\n';
            return c;
        });
    }
};

// ── Dell OS10: ACL ────────────────────────────────────────────────────────────
Dell.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Dell OS10 — ACL',
                desc: 'IP erişim kontrol listesi oluşturma ve interface\'e uygulama. Protokol, kaynak/hedef ve yön desteği.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL_INBOUND', hint: 'Erişim listesi adı' },
                        { name: 'seq_start', label: 'Seq Başlangıç Numarası', type: 'text', optional: true, placeholder: '10', hint: 'İlk kural sıra numarası (varsayılan: 10)' },
                        { name: 'action', label: 'Action', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'ip', label: 'ip', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'src', label: 'Kaynak (src)', type: 'text', required: true, placeholder: '10.1.0.0/24', hint: 'CIDR formatında kaynak veya "any"' },
                        { name: 'dst', label: 'Hedef (dst)', type: 'text', required: true, placeholder: 'any', hint: 'CIDR formatında hedef veya "any"' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', label: 'Uygulanan Interface', type: 'text', optional: true, placeholder: 'ethernet1/1/1', hint: 'ACL uygulanacak port (boş bırakılabilir)' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'Inbound', selected: true },
                            { value: 'out', label: 'Outbound' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const aclName = cgEsc(data.acl_name || ''), action = cgEsc(data.action || 'permit');
            const proto = cgEsc(data.protocol || 'ip'), src = cgEsc(data.src || '');
            const dst = cgEsc(data.dst || ''), applyIf = cgEsc(data.apply_if || '');
            const direction = cgEsc(data.direction || 'in'), seqStart = cgEsc(data.seq_start || '10') || '10';
            let c = '# ========================================\n# Dell OS10 — ACL\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ip access-list ' + aclName + '\n';
            c += ' seq ' + seqStart + ' ' + action + ' ' + proto + ' ' + src + ' ' + dst + '\n';
            c += ' seq ' + (parseInt(seqStart) + 10) + ' deny ip any any\n!\n\n';
            if (applyIf) {
                c += 'interface ' + applyIf + '\n';
                c += ' ip access-group ' + aclName + ' ' + direction + '\n!\n\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ip access-lists ' + aclName + '\n# show running-configuration access-list\n';
            return c;
        });
    }
};

// ── Dell OS10: QoS Policy ─────────────────────────────────────────────────────
Dell.qos = {
    label: 'QoS Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Dell OS10 — QoS Policy',
                desc: 'DSCP tabanlı trafik sınıflandırma ve bandwidth garantisi. Policy-map ile interface\'e uygulama.'
            },
            sections: [
                {
                    title: 'Policy ve Class-Map',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'QOS_VOIP', hint: 'Policy-map adı' },
                        { name: 'dscp_match', label: 'DSCP Match Değeri', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (EF, AF41, CS3 vb.)' },
                        { name: 'bandwidth', label: 'Bandwidth %', type: 'text', required: true, placeholder: '30', hint: 'Priority kuyruğu için ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'ethernet1/1/1', hint: 'Policy uygulanacak port' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [
                            { value: 'output', label: 'Outbound', selected: true },
                            { value: 'input', label: 'Inbound' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const polName = cgEsc(data.pol_name || ''), dscpMatch = cgEsc(data.dscp_match || '');
            const bandwidth = cgEsc(data.bandwidth || ''), applyIf = cgEsc(data.apply_if || '');
            const direction = cgEsc(data.direction || 'output');
            const cmName = 'CM_' + dscpMatch.toUpperCase();
            let c = '# ========================================\n# Dell OS10 — QoS\n# ========================================\n\n';
            c += 'class-map match-any ' + cmName + '\n';
            c += ' match dscp ' + dscpMatch + '\n!\n\n';
            c += 'policy-map ' + polName + '\n';
            c += ' class ' + cmName + '\n';
            c += '  priority bandwidth percent ' + bandwidth + '\n!\n\n';
            c += 'interface ' + applyIf + '\n';
            c += ' service-policy ' + direction + ' ' + polName + '\n!\n\n';
            c += '# Doğrulama:\n# show policy-map interface ' + applyIf + '\n# show qos interface ' + applyIf + '\n';
            return c;
        });
    }
};

// ── Dell OS10: VXLAN Overlay ──────────────────────────────────────────────────
Dell.vxlan = {
    label: 'VXLAN Overlay',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Dell OS10 — VXLAN Overlay',
                desc: 'VTEP tabanlı VXLAN overlay ağı. VNI-VLAN eşlemesi, multicast grubu ve Loopback VTEP kaynak arayüzü.'
            },
            sections: [
                {
                    title: 'VXLAN Ayarları',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vni', label: 'VNI (VXLAN Network Identifier)', type: 'text', validate: 'vni', required: true, placeholder: '10000', hint: '1–16777215 arası VXLAN segment ID' },
                        { name: 'vtep_ip', label: 'VTEP IP (Loopback)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.1', hint: 'VTEP kaynak Loopback IP adresi' },
                        { name: 'mcast', label: 'Multicast Group', type: 'text', required: true, placeholder: '239.1.1.1', hint: 'BUM trafik için multicast grup IP' },
                        { name: 'vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek yerel VLAN ID' },
                        { name: 'loopback', label: 'Loopback Interface', type: 'text', required: true, placeholder: 'loopback0', hint: 'VTEP kaynak arayüzü' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || ''), vtepIp = cgEsc(data.vtep_ip || '');
            const mcast = cgEsc(data.mcast || ''), vlan = cgEsc(data.vlan || '');
            const loopback = cgEsc(data.loopback || '');
            let c = '# ========================================\n# Dell OS10 — VXLAN Overlay\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Loopback (VTEP source)\ninterface ' + loopback + '\n';
            c += ' ip address ' + vtepIp + '/32\n no shutdown\n!\n\n';
            c += '# VXLAN instance\ninterface vxlan 1\n';
            c += ' vxlan-instance ' + vni + '\n';
            c += '  source-ip ' + vtepIp + '\n';
            c += '  multicast-group ' + mcast + '\n';
            c += '  vlan ' + vlan + '\n';
            c += ' !\n!\n\n';
            c += '# Map VLAN to VNI\nvlan ' + vlan + '\n vxlan-vni ' + vni + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show vxlan\n# show vxlan interface\n# show vxlan vni ' + vni + '\n# show interface vxlan 1\n';
            return c;
        });
    }
};

// ── Dell OS10: MC-LAG ─────────────────────────────────────────────────────────
Dell.mclag = {
    label: 'MC-LAG Domain',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Dell OS10 — MC-LAG Domain',
                desc: 'Multi-Chassis LAG konfigürasyonu. Peer-link, keepalive ve üye interface yapılandırması.'
            },
            sections: [
                {
                    title: 'MC-LAG Domain',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'domain_id', label: 'Domain ID', type: 'text', required: true, placeholder: '1', hint: 'MC-LAG domain numarası' },
                        { name: 'peer_link', label: 'Peer-Link Port-Channel', type: 'text', required: true, placeholder: 'port-channel100', hint: 'Peer-link olarak kullanılacak port-channel' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.2', hint: 'Peer cihazının keepalive IP adresi' },
                        { name: 'local_ip', label: 'Local IP (keepalive source)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.1', hint: 'Bu cihazın keepalive kaynak IP adresi' }
                    ]
                },
                {
                    title: 'Member ve Peer-Link Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', label: 'Uplink Member Interfaces', type: 'text', required: true, placeholder: 'ethernet1/1/1,ethernet1/1/2', hint: 'Virgülle ayrılmış üye port listesi' },
                        { name: 'pl_members', label: 'Peer-Link Member Interfaces', type: 'text', required: true, placeholder: 'ethernet1/1/47,ethernet1/1/48', hint: 'Peer-link portları (virgülle ayrılmış)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const domainId = cgEsc(data.domain_id || ''), peerLink = cgEsc(data.peer_link || '');
            const peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const plMembers = (data.pl_members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — MC-LAG Domain\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Peer-Link Port-Channel\ninterface ' + peerLink + '\n channel-member ';
            c += plMembers.join(' ') + '\n no shutdown\n!\n\n';
            c += '# MC-LAG Domain\nmclag domain ' + domainId + '\n';
            c += ' peer-link ' + peerLink + '\n';
            c += ' peer-ip ' + peerIp + '\n';
            c += ' local-ip ' + localIp + '\n';
            c += ' keepalive-interval 1000\n keepalive-timeout 5\n!\n\n';
            if (members.length) {
                c += '# Member Interfaces\n';
                members.forEach(m => {
                    c += 'interface ' + m + '\n channel-group 1 mode active\n no shutdown\n!\n';
                });
                c += '\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show mclag\n# show mclag domain ' + domainId + '\n# show mclag interface\n';
            return c;
        });
    }
};

// ── Dell OS10: BGP EVPN ───────────────────────────────────────────────────────
Dell.bgpEvpn = {
    label: 'BGP EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Dell OS10 — BGP EVPN',
                desc: 'L2VPN EVPN address-family konfigürasyonu. VNI route-target, send-community extended ve VXLAN VNI-VLAN eşlemesi.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'rid', label: 'Router-ID (Loopback IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID — Loopback IP kullanılması önerilir' }
                    ]
                },
                {
                    title: 'Neighbor ve EVPN Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'nbr_ip', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP EVPN komşu IP adresi' },
                        { name: 'nbr_as', label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Komşunun AS numarası (iBGP için aynı)' },
                        { name: 'vni', label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10000', hint: 'VXLAN Network Identifier' },
                        { name: 'vni_vlan', label: 'VNI VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek yerel VLAN ID' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
            const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
            const vni = cgEsc(data.vni || ''), vniVlan = cgEsc(data.vni_vlan || '');
            let c = '# ========================================\n# Dell OS10 — BGP EVPN\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' router-id ' + rid + '\n';
            c += ' neighbor ' + nbrIp + '\n  remote-as ' + nbrAs + '\n';
            c += '  address-family l2vpn evpn\n   activate\n   send-community extended\n  !\n !\n';
            c += ' address-family l2vpn evpn\n  advertise-all-vni\n  vni ' + vni + '\n   rd ' + localAs + ':' + vni + '\n';
            c += '   route-target export ' + localAs + ':' + vni + '\n';
            c += '   route-target import ' + localAs + ':' + vni + '\n  !\n !\n!\n\n';
            c += '# VXLAN VNI-VLAN mapping\nvlan ' + vniVlan + '\n vxlan-vni ' + vni + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show bgp l2vpn evpn summary\n# show bgp l2vpn evpn vni-id ' + vni + '\n# show evpn\n';
            return c;
        });
    }
};

// ── Dell OS10: QoS Policy (Extended) ─────────────────────────────────────────
Dell.qosPolicy = {
    label: 'QoS Policy (Extended)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Dell OS10 — QoS Policy (Extended)',
                desc: 'Gelişmiş DSCP tabanlı QoS: class-map eşleştirme, DSCP re-marking ve bandwidth yüzdesi ayarı.'
            },
            sections: [
                {
                    title: 'Policy ve Class-Map Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'QOS_POLICY_OUT', hint: 'Policy-map adı' },
                        { name: 'class_name', label: 'Class Adı', type: 'text', required: true, placeholder: 'CLASS_VOIP', hint: 'Class-map adı' },
                        { name: 'dscp_match', label: 'DSCP Match Değeri', type: 'text', required: true, placeholder: 'ef', hint: 'Trafiği tanımlamak için DSCP değeri' },
                        { name: 'dscp_set', label: 'DSCP Marking (set)', type: 'select', options: [
                            { value: 'ef', label: 'EF (46) — Voice', selected: true },
                            { value: 'af41', label: 'AF41 (34) — Video' },
                            { value: 'af31', label: 'AF31 (26) — Kritik Veri' },
                            { value: 'cs3', label: 'CS3 (24) — Sinyal' },
                            { value: 'default', label: 'default (0) — Best Effort' }
                        ]},
                        { name: 'bandwidth', label: 'Bandwidth %', type: 'text', required: true, placeholder: '30', hint: 'Class için ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'ethernet1/1/1', hint: 'Policy uygulanacak port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const polName = cgEsc(data.pol_name || ''), className = cgEsc(data.class_name || '');
            const dscpSet = cgEsc(data.dscp_set || 'ef'), bandwidth = cgEsc(data.bandwidth || '');
            const dscpMatch = cgEsc(data.dscp_match || ''), applyIf = cgEsc(data.apply_if || '');
            let c = '# ========================================\n# Dell OS10 — QoS Policy (Extended)\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Class-Map\nclass-map match-any ' + className + '\n';
            c += ' match dscp ' + dscpMatch + '\n!\n\n';
            c += '# Policy-Map\npolicy-map ' + polName + '\n';
            c += ' class ' + className + '\n';
            c += '  set dscp ' + dscpSet + '\n';
            c += '  bandwidth percent ' + bandwidth + '\n!\n\n';
            c += '# Apply to Interface\ninterface ' + applyIf + '\n';
            c += ' service-policy output ' + polName + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show policy-map interface ' + applyIf + '\n# show qos interface ' + applyIf + '\n# show class-map ' + className + '\n';
            return c;
        });
    }
};

// ── Dell OS10: NTP ────────────────────────────────────────────────────────────
Dell.ntp = {
    label: 'NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'Dell OS10 — NTP',
                desc: 'Ağ zaman senkronizasyonu konfigürasyonu. Birincil ve yedek NTP sunucusu, timezone ve kaynak arayüz.'
            },
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp_server', label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'ntp_server2', label: 'Yedek NTP Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucu IP adresi' },
                        { name: 'src_iface', label: 'Source Interface', type: 'text', optional: true, placeholder: 'ManagementEthernet1/1/1', hint: 'NTP paketleri için kaynak arayüz' }
                    ]
                },
                {
                    title: 'Saat Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', label: 'Timezone', type: 'text', required: true, placeholder: 'Europe/Istanbul', hint: 'POSIX timezone tanımlayıcısı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ntpServer = cgEsc(data.ntp_server || ''), srcIface = cgEsc(data.src_iface || '');
            const timezone = cgEsc(data.timezone || ''), ntpServer2 = cgEsc(data.ntp_server2 || '');
            let c = '# ========================================\n# Dell OS10 — NTP\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ntp server ' + ntpServer;
            if (srcIface) c += ' source ' + srcIface;
            c += '\n';
            if (ntpServer2) {
                c += 'ntp server ' + ntpServer2;
                if (srcIface) c += ' source ' + srcIface;
                c += '\n';
            }
            c += '\nclock timezone ' + timezone + '\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ntp status\n# show ntp associations\n# show clock\n';
            return c;
        });
    }
};

// ── Dell OS10: Syslog ─────────────────────────────────────────────────────────
Dell.syslog = {
    label: 'Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Dell OS10 — Syslog',
                desc: 'Merkezi log sunucusuna syslog iletimi. Severity seviyesi, facility ve kaynak arayüz yapılandırması.'
            },
            sections: [
                {
                    title: 'Syslog Sunucu Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'syslog_server', label: 'Syslog Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Syslog toplayıcı sunucu IP adresi' },
                        { name: 'severity', label: 'Severity', type: 'select', options: [
                            { value: 'emergencies', label: 'emergencies (0)' },
                            { value: 'alerts', label: 'alerts (1)' },
                            { value: 'critical', label: 'critical (2)' },
                            { value: 'errors', label: 'errors (3)' },
                            { value: 'warnings', label: 'warnings (4)', selected: true },
                            { value: 'notifications', label: 'notifications (5)' },
                            { value: 'informational', label: 'informational (6)' },
                            { value: 'debugging', label: 'debugging (7)' }
                        ]},
                        { name: 'facility', label: 'Facility', type: 'select', options: [
                            { value: 'local0', label: 'local0' },
                            { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' },
                            { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4', selected: true },
                            { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' },
                            { value: 'local7', label: 'local7' }
                        ]},
                        { name: 'src_iface', label: 'Source Interface', type: 'text', optional: true, placeholder: 'ManagementEthernet1/1/1', hint: 'Syslog paketleri için kaynak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const syslogServer = cgEsc(data.syslog_server || ''), severity = cgEsc(data.severity || 'warnings');
            const facility = cgEsc(data.facility || 'local4'), srcIface = cgEsc(data.src_iface || '');
            let c = '# ========================================\n# Dell OS10 — Syslog\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'logging server ' + syslogServer + '\n';
            c += 'logging level ' + severity + '\n';
            c += 'logging facility ' + facility + '\n';
            if (srcIface) c += 'logging source-interface ' + srcIface + '\n';
            c += 'logging on\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show logging\n# show running-configuration logging\n';
            return c;
        });
    }
};

// ── Dell OS10: SNMPv3 ─────────────────────────────────────────────────────────
Dell.snmpv3 = {
    label: 'SNMPv3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'Dell OS10 — SNMPv3',
                desc: 'SNMPv3 güvenli izleme konfigürasyonu. Auth/Priv protokol seçimi, kullanıcı grubu ve opsiyonel v2c uyumluluk.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'snmp_user', label: 'SNMPv3 Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmpv3user', hint: 'SNMPv3 kimlik doğrulama kullanıcısı' },
                        { name: 'snmp_group', label: 'SNMP Group Adı', type: 'text', required: true, placeholder: 'MONITOR_GROUP', hint: 'Kullanıcının dahil olacağı SNMP grubu' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama ve Şifreleme',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'auth_proto', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', label: 'Auth Parolası', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Auth şifresi (min 8 karakter)' },
                        { name: 'priv_proto', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_pass', label: 'Priv Parolası', type: 'text', required: true, placeholder: 'PrivPass456!', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'v2c Uyumluluk (Opsiyonel)',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'community', label: 'SNMP Community Adı', type: 'text', optional: true, placeholder: 'public_ro', hint: 'v2c read-only community (eski sistemler için)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const snmpUser = cgEsc(data.snmp_user || ''), authProto = cgEsc(data.auth_proto || 'sha');
            const authPass = cgEsc(data.auth_pass || ''), privProto = cgEsc(data.priv_proto || 'aes128');
            const privPass = cgEsc(data.priv_pass || ''), snmpGroup = cgEsc(data.snmp_group || '');
            const community = cgEsc(data.community || '');
            let c = '# ========================================\n# Dell OS10 — SNMPv3\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# SNMP Group\nsnmp-server group ' + snmpGroup + ' v3 priv\n\n';
            c += '# SNMPv3 User\nsnmp-server user ' + snmpUser + ' ' + snmpGroup + ' v3 auth ' + authProto + ' ' + authPass + ' priv ' + privProto + ' ' + privPass + '\n\n';
            if (community) {
                c += '# SNMP v2c (uyumluluk)\nsnmp-server community ' + community + ' ro\n\n';
            }
            c += 'snmp-server enable traps\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show snmp\n# show snmp user\n# show snmp group\n';
            return c;
        });
    }
};

// ── Dell OS10: Storm Control ──────────────────────────────────────────────────
Dell.stormControl = {
    label: 'Storm Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Dell OS10 — Storm Control',
                desc: 'Broadcast/multicast/unknown-unicast fırtına koruması. Yüzde eşiği ve otomatik aksiyon tanımı.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Interface ve Eşikler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface (veya range, virgülle)', type: 'text', required: true, placeholder: 'ethernet1/1/1', hint: 'Storm control uygulanacak port(lar)' },
                        { name: 'bc_pct', label: 'Broadcast Threshold (%)', type: 'text', required: true, placeholder: '20', hint: 'Broadcast trafik yüzde eşiği (0-100)' },
                        { name: 'mc_pct', label: 'Multicast Threshold (%)', type: 'text', required: true, placeholder: '20', hint: 'Multicast trafik yüzde eşiği (0-100)' },
                        { name: 'uc_pct', label: 'Unknown Unicast Threshold (%)', type: 'text', optional: true, placeholder: '10', hint: 'Bilinmeyen unicast trafik eşiği (opsiyonel)' }
                    ]
                },
                {
                    title: 'Aksiyon',
                    icon: 'fas fa-exclamation-triangle',
                    fields: [
                        { name: 'action', label: 'Action', type: 'select', options: [
                            { value: 'shutdown', label: 'shutdown — portu kapat', selected: true },
                            { value: 'drop', label: 'drop — sadece aşan trafiği düşür' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ifaces = (data.iface || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const bcPct = cgEsc(data.bc_pct || ''), mcPct = cgEsc(data.mc_pct || '');
            const ucPct = cgEsc(data.uc_pct || ''), action = cgEsc(data.action || 'shutdown');
            let c = '# ========================================\n# Dell OS10 — Storm Control\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            ifaces.forEach(iface => {
                c += 'interface ' + iface + '\n';
                c += ' storm-control broadcast ' + bcPct + '\n';
                c += ' storm-control multicast ' + mcPct + '\n';
                if (ucPct) c += ' storm-control unknown-unicast ' + ucPct + '\n';
                c += ' storm-control action ' + action + '\n!\n';
            });
            c += '\nend\n\n';
            c += '# Doğrulama:\n';
            ifaces.forEach(iface => {
                c += '# show storm-control interface ' + iface + '\n';
            });
            return c;
        });
    }
};
