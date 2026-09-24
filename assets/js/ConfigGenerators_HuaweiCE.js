'use strict';

const HuaweiCE = {};

// ── Huawei CloudEngine: VLAN + Interface ──────────────────────────────────────
HuaweiCE.vlan = {
    label: 'VLAN + Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'VLAN + Interface (CloudEngine)',
                desc: 'Huawei CloudEngine switch\'inde VLAN oluştur, SVI (Layer-3 Vlanif) tanımla ve access/trunk portları ata. Data center leaf/spine mimarisinde temel yapı taşı.'
            },
            sections: [
                {
                    title: 'VLAN Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'vlan_id', label: 'VLAN ID', type: 'number', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası', min: 1, max: 4094 },
                        { name: 'vlan_desc', label: 'VLAN Açıklama', type: 'text', optional: true, placeholder: 'DATA_VLAN', hint: 'VLAN için açıklayıcı isim (boşluksuz)' }
                    ]
                },
                {
                    title: 'SVI (Layer-3 Arayüz)',
                    icon: 'fas fa-sitemap',
                    info: 'SVI tanımlanırsa Vlanif arayüzü oluşturulur ve inter-VLAN routing etkinleşir.',
                    fields: [
                        { name: 'svi_ip', label: 'SVI IP / Mask', type: 'text', optional: true, placeholder: '10.1.100.1 255.255.255.0', hint: 'Örn: 10.1.100.1 255.255.255.0 — boş bırakılırsa SVI oluşturulmaz' }
                    ]
                },
                {
                    title: 'Port Atamaları',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'access_ports', label: 'Access Port(lar)', type: 'text', optional: true, placeholder: '10GE1/0/1, 10GE1/0/2', hint: 'Virgülle ayırın — bu VLAN\'a access modda bağlanacak portlar' },
                        { name: 'trunk_ports', label: 'Trunk Port(lar)', type: 'text', optional: true, placeholder: '40GE1/0/1', hint: 'Virgülle ayırın — bu VLAN\'a trunk modda izin verilecek portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vlanId = cgEsc(data.vlan_id || '');
            const vlanDesc = cgEsc(data.vlan_desc || '');
            const sviIp = cgEsc(data.svi_ip || '');
            const accessPorts = (data.access_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const trunkPorts = (data.trunk_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Huawei CloudEngine — VLAN + Interface\n# ========================================\n\n';
            c += 'vlan ' + vlanId + '\n';
            if (vlanDesc) c += ' description ' + vlanDesc + '\n';
            c += '#\n\n';
            if (sviIp) {
                c += 'interface Vlanif' + vlanId + '\n';
                c += ' ip address ' + sviIp + '\n#\n\n';
            }
            accessPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' port link-type access\n';
                c += ' port default vlan ' + vlanId + '\n#\n';
            });
            if (accessPorts.length) c += '\n';
            trunkPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' port link-type trunk\n';
                c += ' port trunk allow-pass vlan ' + vlanId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display vlan ' + vlanId + '\n# display interface Vlanif' + vlanId + '\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: OSPF ──────────────────────────────────────────────────
HuaweiCE.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (CloudEngine)',
                desc: 'Huawei CloudEngine\'de OSPF yapılandırması — process ID, router-id, area ve network bildirimi. Link-state routing protokolü, büyük data center ağlarında yaygın kullanılır.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası (1–65535)', tooltip: 'Aynı cihazda birden fazla OSPF süreci çalıştırılabilir' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'Genellikle Loopback0 IP adresi — benzersiz olmalı' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'Backbone için 0, diğer area\'lar için 0.0.0.X formatı' }
                    ]
                },
                {
                    title: 'Network ve Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'networks', label: 'Network(ler)', type: 'text', required: true, placeholder: '10.1.0.0/24, 10.2.0.0/24', hint: 'CIDR formatında, virgülle ayırın — OSPF\'e dahil edilecek subnetler' },
                        { name: 'lo_iface', label: 'Loopback (silent)', type: 'text', optional: true, placeholder: 'LoopBack0', hint: 'OSPF Hello paketi gönderilmeyecek interface — genellikle Loopback' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || '');
            const routerId = cgEsc(data.router_id || '');
            const area = cgEsc(data.area || '');
            const networks = (data.networks || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const loIface = cgEsc(data.lo_iface || '');
            let c = '# ========================================\n# Huawei CloudEngine — OSPF\n# ========================================\n\n';
            c += 'ospf ' + procId + ' router-id ' + routerId + '\n';
            c += ' area ' + area + '\n';
            networks.forEach(net => c += '  network ' + net + '\n');
            if (loIface) c += ' silent-interface ' + loIface + '\n';
            c += '#\n\n# Doğrulama:\n# display ospf peer\n# display ospf routing\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: BGP ───────────────────────────────────────────────────
HuaweiCE.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (CloudEngine)',
                desc: 'Huawei CloudEngine BGP yapılandırması — peer group, eBGP/iBGP modu ve IPv4 unicast address-family. Data center spine\'larında ve WAN bağlantılarında kullanılır.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP router-id — genellikle Loopback0 IP' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', label: 'Peer Group Adı', type: 'text', required: true, placeholder: 'EBGP_PEERS', hint: 'Peer grubuna verilecek isim — peer yönetimini kolaylaştırır' },
                        { name: 'bgp_type', label: 'BGP Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP — farklı AS ile peering', selected: true },
                            { value: 'ibgp', label: 'iBGP — aynı AS içi peering' }
                        ], hint: 'iBGP seçilirse connect-interface LoopBack0 eklenir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || '');
            const routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || '');
            const peerAs = cgEsc(data.peer_as || '');
            const peerGroup = cgEsc(data.peer_group || '');
            const bgpType = cgEsc(data.bgp_type || 'ebgp');
            let c = '# ========================================\n# Huawei CloudEngine — BGP\n# ========================================\n\n';
            c += 'bgp ' + localAs + '\n';
            c += ' router-id ' + routerId + '\n';
            c += ' group ' + peerGroup + ' ' + bgpType + '\n';
            if (bgpType === 'ibgp') c += ' peer ' + peerGroup + ' connect-interface LoopBack0\n';
            c += ' peer ' + peerIp + ' as-number ' + peerAs + '\n';
            c += ' peer ' + peerIp + ' group ' + peerGroup + '\n';
            c += ' ipv4-family unicast\n';
            c += '  peer ' + peerGroup + ' enable\n#\n\n';
            c += '# Doğrulama:\n# display bgp peer\n# display bgp routing-table\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: VXLAN / EVPN ─────────────────────────────────────────
HuaweiCE.vxlan = {
    label: 'VXLAN / EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VXLAN / EVPN (CloudEngine)',
                desc: 'Huawei CloudEngine VXLAN overlay ağ yapılandırması — VTEP Loopback, bridge-domain, VLAN-VNI eşlemesi ve BGP EVPN control plane. Modern data center fabric mimarisinin temel bileşeni.'
            },
            configTypes: [
                { id: 'vxlan', label: 'VXLAN + EVPN', icon: 'fas fa-layer-group', desc: 'Tam VXLAN/EVPN yapılandırması — overlay + control plane',
                  badge: { text: 'Data Center', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VTEP ve VNI Ayarları',
                    icon: 'fas fa-server',
                    warn: 'VTEP Loopback IP\'si tüm leaf switch\'lerde benzersiz olmalı ve underlay routing ile erişilebilir olmalıdır.',
                    fields: [
                        { name: 'vni', label: 'VNI', type: 'number', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier — 1–16777215 arası', min: 1, max: 16777215 },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'number', validate: 'vlan', required: true, placeholder: '100', hint: 'VXLAN ile eşlenecek VLAN numarası', min: 1, max: 4094 },
                        { name: 'vtep_lo', label: 'VTEP Loopback Interface', type: 'text', required: true, placeholder: 'LoopBack1', hint: 'VTEP kaynak IP\'si için kullanılacak Loopback arayüzü' },
                        { name: 'vtep_ip', label: 'VTEP IP / Mask', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1 255.255.255.255', hint: 'VTEP Loopback IP adresi — /32 host route önerilir' }
                    ]
                },
                {
                    title: 'BGP EVPN Ayarları',
                    icon: 'fas fa-route',
                    info: 'BGP EVPN, MAC/IP route\'larını control plane üzerinden öğrenir — flood-and-learn yerine daha ölçeklenebilir.',
                    fields: [
                        { name: 'bgp_as', label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'EVPN BGP Autonomous System numarası' },
                        { name: 'rd', label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'Örn: AS:VNI formatı — 65001:100' },
                        { name: 'rt', label: 'Route Target', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import/export community değeri — genellikle RD ile aynı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || '');
            const vlanId = cgEsc(data.vlan_id || '');
            const vtepLo = cgEsc(data.vtep_lo || '');
            const vtepIp = cgEsc(data.vtep_ip || '');
            const bgpAs = cgEsc(data.bgp_as || '');
            const rd = cgEsc(data.rd || '');
            const rt = cgEsc(data.rt || '');
            let c = '# ========================================\n# Huawei CloudEngine — VXLAN / EVPN\n# ========================================\n\n';
            c += '# VTEP Loopback\n';
            c += 'interface ' + vtepLo + '\n ip address ' + vtepIp + '\n#\n\n';
            c += '# VXLAN Tunnel\n';
            c += 'bridge-domain ' + vni + '\n';
            c += ' vxlan vni ' + vni + '\n#\n\n';
            c += '# VLAN-BD Mapping\n';
            c += 'interface Vbdif' + vni + '\n';
            c += ' ip address # (SVI IP buraya)\n#\n\n';
            c += 'vlan ' + vlanId + '\n';
            c += ' vxlan vni ' + vni + '\n#\n\n';
            c += '# BGP EVPN\n';
            c += 'bgp ' + bgpAs + '\n';
            c += ' l2vpn-family evpn\n';
            c += '  peer <RR_IP> enable\n';
            c += '  peer <RR_IP> advertise encap-type vxlan\n#\n\n';
            c += '# EVPN Instance\n';
            c += 'evpn vpn-instance ' + vni + ' bd-mode\n';
            c += ' route-distinguisher ' + rd + '\n';
            c += ' vpn-target ' + rt + ' export-extcommunity\n';
            c += ' vpn-target ' + rt + ' import-extcommunity\n#\n\n';
            c += '# Doğrulama:\n# display vxlan vni\n# display bgp evpn all routing-table\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: LACP / Eth-Trunk ─────────────────────────────────────
HuaweiCE.lacp = {
    label: 'LACP / Eth-Trunk',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'LACP / Eth-Trunk (CloudEngine)',
                desc: 'Huawei CloudEngine Eth-Trunk (LAG) yapılandırması — LACP static veya manual mode. Sunucu bağlantısında bant genişliği artırma ve yüksek erişilebilirlik için kullanılır.'
            },
            configTypes: [
                { id: 'lacp', label: 'LACP Static', icon: 'fas fa-link', desc: 'IEEE 802.3ad LACP — dinamik müzakere',
                  badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } },
                { id: 'manual', label: 'Manual / Static', icon: 'fas fa-ethernet', desc: 'Manuel yük dengeleme — LACP olmadan',
                  badge: { text: 'Basit', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Eth-Trunk Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trunk_id', label: 'Eth-Trunk ID', type: 'number', required: true, placeholder: '1', hint: 'Eth-Trunk numarası (0–511)', min: 0, max: 511 },
                        { name: 'lacp_mode', label: 'LACP Mod', type: 'select', options: [
                            { value: 'lacp-static', label: 'LACP Static (Active)', selected: true },
                            { value: 'manual load-balance', label: 'Manual / Static' }
                        ]},
                        { name: 'members', label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: '10GE1/0/1, 10GE1/0/2', hint: 'Virgülle ayırın — Eth-Trunk\'a eklenecek fiziksel portlar' }
                    ]
                },
                {
                    title: 'Switchport Modu',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'sw_mode', label: 'Mod', type: 'select', options: [
                            { value: 'trunk', label: 'Trunk — çoklu VLAN', selected: true },
                            { value: 'access', label: 'Access — tek VLAN' },
                            { value: 'routed', label: 'Routed — Layer-3 (undo portswitch)' }
                        ]},
                        { name: 'vlan_ip', label: 'VLAN / IP', type: 'text', optional: true, placeholder: '10 20 100 veya 10.1.1.1 255.255.255.252', hint: 'Trunk: izin verilen VLAN\'lar | Access: VLAN ID | Routed: IP/mask' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const trunkId = cgEsc(data.trunk_id || '');
            const lacpMode = cgEsc(data.lacp_mode || 'lacp-static');
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const swMode = cgEsc(data.sw_mode || 'trunk');
            const vlanIp = cgEsc(data.vlan_ip || '');
            let c = '# ========================================\n# Huawei CloudEngine — LACP / Eth-Trunk\n# ========================================\n\n';
            c += 'interface Eth-Trunk' + trunkId + '\n';
            c += ' mode ' + lacpMode + '\n';
            if (swMode === 'trunk') {
                c += ' port link-type trunk\n';
                if (vlanIp) c += ' port trunk allow-pass vlan ' + vlanIp + '\n';
            } else if (swMode === 'access') {
                c += ' port link-type access\n';
                if (vlanIp) c += ' port default vlan ' + vlanIp + '\n';
            } else {
                c += ' undo portswitch\n';
                if (vlanIp) c += ' ip address ' + vlanIp + '\n';
            }
            c += '#\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n';
                c += ' eth-trunk ' + trunkId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display eth-trunk ' + trunkId + '\n# display lacp statistics\n';
            return c;
        });
    }
};

// ── HuaweiCE: M-LAG ───────────────────────────────────────────────────────────
HuaweiCE.mlag = {
    label: 'M-LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-object-group',
                title: 'M-LAG (CloudEngine)',
                desc: 'Huawei CloudEngine M-LAG (Multi-chassis Link Aggregation Group) yapılandırması — DFS group, peer link ve IP adresleri. İki switch\'i aktif-aktif çalıştırarak yüksek erişilebilirlik ve yük dengeleme sağlar.'
            },
            configTypes: [
                { id: 'mlag', label: 'M-LAG', icon: 'fas fa-object-group', desc: 'Çift şaseli aktif-aktif LAG — sıfır kesinti',
                  badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'DFS Group Ayarları',
                    icon: 'fas fa-cog',
                    warn: 'M-LAG peer switch\'inde karşıt priority değeri ayarlanmalıdır. Primary: priority 150, Secondary: priority 100 gibi farklı değerler kullanın.',
                    fields: [
                        { name: 'dfs_group_id', label: 'DFS Group ID', type: 'number', required: true, placeholder: '1', hint: 'DFS group numarası — genellikle 1', min: 1 },
                        { name: 'priority', label: 'Priority', type: 'number', required: true, placeholder: '150', hint: 'Yüksek öncelik = primary switch. Önerilen: 150 (primary) / 100 (secondary)', min: 1, max: 254 }
                    ]
                },
                {
                    title: 'Peer Link ve IP Ayarları',
                    icon: 'fas fa-network-wired',
                    info: 'Peer link, iki M-LAG switch arasındaki kontrol ve veri trafiği için kullanılır. Yüksek bant genişliği önerilir.',
                    fields: [
                        { name: 'peer_link_po', label: 'Peer Link Port-Channel', type: 'text', required: true, placeholder: 'Eth-Trunk1', hint: 'Peer link olarak kullanılacak Eth-Trunk arayüzü' },
                        { name: 'local_ip', label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Bu switch\'in M-LAG peer iletişim IP adresi' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.2', hint: 'Karşı switch\'in M-LAG IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const dfsGroupId = cgEsc(data.dfs_group_id || '');
            const priority = cgEsc(data.priority || '');
            const peerLinkPo = cgEsc(data.peer_link_po || '');
            const peerIp = cgEsc(data.peer_ip || '');
            const localIp = cgEsc(data.local_ip || '');
            let c = '# ========================================\n# Huawei CloudEngine — M-LAG\n# ========================================\n\n';
            c += 'dfs-group ' + dfsGroupId + '\n';
            c += ' priority ' + priority + '\n';
            c += ' source ip ' + localIp + '\n';
            c += ' peer ip ' + peerIp + '\n#\n\n';
            c += 'interface ' + peerLinkPo + '\n';
            c += ' dfs-group ' + dfsGroupId + ' m-lag peer-link\n#\n';
            c += '\n# Doğrulama:\n# display dfs-group ' + dfsGroupId + ' m-lag\n# display m-lag summary\n';
            return c;
        });
    }
};

// ── HuaweiCE: BFD ─────────────────────────────────────────────────────────────
HuaweiCE.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'BFD (CloudEngine)',
                desc: 'Huawei CloudEngine BFD (Bidirectional Forwarding Detection) oturumu — milisaniye seviyesinde link arıza tespiti. OSPF, BGP ve statik route\'larla entegre çalışarak hızlı failover sağlar.'
            },
            sections: [
                {
                    title: 'BFD Peer Ayarları',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD oturumu kurulacak karşı cihaz IP adresi' },
                        { name: 'local_ip', label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Bu cihazın BFD source IP adresi' },
                        { name: 'interface', label: 'Interface', type: 'text', required: true, placeholder: '40GE1/0/1', hint: 'BFD oturumunun bağlı olduğu fiziksel arayüz' }
                    ]
                },
                {
                    title: 'Timer Ayarları',
                    icon: 'fas fa-clock',
                    info: 'Varsayılan değerler (300ms × 3 = 900ms) çoğu senaryo için uygundur. Agresif timer\'lar CPU yükünü artırabilir.',
                    fields: [
                        { name: 'min_tx', label: 'Min TX Interval (ms)', type: 'number', required: true, placeholder: '300', hint: 'BFD paketi gönderme aralığı (ms) — önerilen: 300', min: 100, max: 30000 },
                        { name: 'min_rx', label: 'Min RX Interval (ms)', type: 'number', required: true, placeholder: '300', hint: 'BFD paketi alma aralığı (ms) — önerilen: 300', min: 100, max: 30000 },
                        { name: 'detect_mult', label: 'Detect Multiplier', type: 'number', required: true, placeholder: '3', hint: 'Arıza tespiti için kaçırmaya izin verilen paket sayısı — önerilen: 3', min: 3, max: 50 }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerIp = cgEsc(data.peer_ip || '');
            const localIp = cgEsc(data.local_ip || '');
            const intf = cgEsc(data.interface || '');
            const minTx = cgEsc(data.min_tx || '');
            const minRx = cgEsc(data.min_rx || '');
            const detectMult = cgEsc(data.detect_mult || '');
            let c = '# ========================================\n# Huawei CloudEngine — BFD\n# ========================================\n\n';
            c += 'bfd\n#\n\n';
            c += 'bfd session-name bind peer-ip ' + peerIp + ' source-ip ' + localIp + ' interface ' + intf + '\n';
            c += ' min-echo-rx-interval ' + minRx + '\n';
            c += ' min-tx-interval ' + minTx + '\n';
            c += ' detect-multiplier ' + detectMult + '\n';
            c += ' commit\n#\n';
            c += '\n# Doğrulama:\n# display bfd session all\n';
            return c;
        });
    }
};

// ── HuaweiCE: QoS MQC / DiffServ ─────────────────────────────────────────────
HuaweiCE.qos = {
    label: 'QoS MQC / DiffServ',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sliders-h',
                title: 'QoS MQC / DiffServ (CloudEngine)',
                desc: 'Huawei CloudEngine MQC (Modular QoS CLI) yapılandırması — traffic classifier, behavior ve policy ile DSCP tabanlı servis kalitesi. Gerçek zamanlı trafik (VoIP, video) önceliklendirme için kullanılır.'
            },
            sections: [
                {
                    title: 'Traffic Classifier',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'classifier_name', label: 'Classifier Adı', type: 'text', required: true, placeholder: 'CLS-REALTIME', hint: 'Trafik sınıflandırıcı adı — anlamlı isim kullanın' },
                        { name: 'match_dscp', label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP değeri: ef (VoIP), af41 (video), af21 (bulk data), cs6 (routing)' }
                    ]
                },
                {
                    title: 'Traffic Behavior',
                    icon: 'fas fa-tasks',
                    fields: [
                        { name: 'behavior_name', label: 'Behavior Adı', type: 'text', required: true, placeholder: 'BEH-PQ', hint: 'Trafik davranış adı' },
                        { name: 'queue_type', label: 'Queue Tipi', type: 'select', options: [
                            { value: 'llq', label: 'LLQ — Low Latency Queue (VoIP/video)', selected: true },
                            { value: 'pq', label: 'PQ — Priority Queue' },
                            { value: 'af', label: 'AF — Assured Forwarding' }
                        ], hint: 'LLQ gerçek zamanlı trafik için önerilir' }
                    ]
                },
                {
                    title: 'Traffic Policy ve Uygulama',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-EDGE', hint: 'QoS policy adı — interface\'e uygulanacak' },
                        { name: 'intf', label: 'Apply Interface', type: 'text', optional: true, placeholder: '40GE1/0/1', hint: 'Policy\'nin outbound yönde uygulanacağı arayüz — boş bırakılırsa uygulama satırı eklenmez' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const classifierName = cgEsc(data.classifier_name || '');
            const matchDscp = cgEsc(data.match_dscp || '');
            const behaviorName = cgEsc(data.behavior_name || '');
            const queueType = cgEsc(data.queue_type || 'llq');
            const policyName = cgEsc(data.policy_name || '');
            const intf = cgEsc(data.intf || '');
            let c = '# ========================================\n# Huawei CloudEngine — QoS MQC / DiffServ\n# ========================================\n\n';
            c += 'traffic classifier ' + classifierName + ' operator or\n if-match dscp ' + matchDscp + '\n#\n\n';
            c += 'traffic behavior ' + behaviorName + '\n queue ' + queueType + ' bandwidth percent 30\n dscp remark ef\n#\n\n';
            c += 'traffic policy ' + policyName + '\n classifier ' + classifierName + ' behavior ' + behaviorName + '\n#\n';
            if (intf) {
                c += '\ninterface ' + intf + '\n traffic-policy ' + policyName + ' outbound\n#\n';
            }
            c += '\n# Doğrulama:\n# display traffic policy applied-record\n';
            return c;
        });
    }
};

// ── HuaweiCE: SNMP + NTP ──────────────────────────────────────────────────────
HuaweiCE.snmpntp = {
    label: 'SNMP + NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bell',
                title: 'SNMP + NTP (CloudEngine)',
                desc: 'Huawei CloudEngine SNMP v2c trap yapılandırması ve NTP saat senkronizasyonu. Ağ izleme sistemleri (LibreNMS, Zabbix) ile entegrasyon için gereklidir.'
            },
            sections: [
                {
                    title: 'SNMP Ayarları',
                    icon: 'fas fa-eye',
                    warn: 'SNMP community string\'i tahmin edilmesi güç, benzersiz bir değer olmalıdır. PUBLIC veya PRIVATE kullanmayın.',
                    fields: [
                        { name: 'community', label: 'SNMP Community (RO)', type: 'text', required: true, placeholder: 'NMS-RO-CE6870', hint: 'Read-only community string — NMS sistemiyle eşleşmeli' },
                        { name: 'trap_host', label: 'Trap Host IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap\'larının gönderileceği NMS/monitoring sunucusu IP' }
                    ]
                },
                {
                    title: 'NTP Ayarları',
                    icon: 'fas fa-clock',
                    info: 'Saat senkronizasyonu log korelasyonu ve sertifika doğrulaması için kritiktir. En az iki NTP sunucusu önerilir.',
                    fields: [
                        { name: 'ntp_server', label: 'NTP Server', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucusu IP adresi' },
                        { name: 'ntp_server2', label: 'NTP Server 2', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucusu — yedeklilik için önerilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const community = cgEsc(data.community || '');
            const trapHost = cgEsc(data.trap_host || '');
            const ntpServer = cgEsc(data.ntp_server || '');
            const ntpServer2 = cgEsc(data.ntp_server2 || '');
            let c = '# ========================================\n# Huawei CloudEngine — SNMP + NTP\n# ========================================\n\n';
            c += 'snmp-agent sys-info version v2c\n';
            c += 'snmp-agent community read ' + community + '\n';
            c += 'snmp-agent target-host trap address udp-domain ' + trapHost + ' params securityname ' + community + ' v2c\n#\n\n';
            c += 'ntp-service server ' + ntpServer + '\n';
            if (ntpServer2) c += 'ntp-service server ' + ntpServer2 + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display snmp-agent community\n# display ntp-service sessions\n';
            return c;
        });
    }
};

// ── HuaweiCE: EVPN Symmetric IRB ─────────────────────────────────────────────
HuaweiCE.evpnsymirb = {
    label: 'EVPN Symmetric IRB',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'EVPN Symmetric IRB (CloudEngine)',
                desc: 'Huawei CloudEngine EVPN Symmetric IRB (Integrated Routing and Bridging) — Vbdif arayüzü, bridge-domain VNI eşlemesi ve L3 EVPN route-distinguisher/target yapılandırması. East-West trafik optimizasyonu için distributed gateway tasarımı.'
            },
            configTypes: [
                { id: 'symirb', label: 'Symmetric IRB', icon: 'fas fa-exchange-alt', desc: 'Her leaf\'te distributed L3 gateway — optimal routing',
                  badge: { text: 'Data Center', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN ve VNI Eşlemesi',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vbdif_id', label: 'Vbdif ID', type: 'number', required: true, placeholder: '100', hint: 'Virtual Bridge-Domain Interface numarası — genellikle VLAN ID ile aynı' },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'number', required: true, placeholder: '100', hint: 'VXLAN ile eşlenecek VLAN numarası', min: 1, max: 4094 },
                        { name: 'vni', label: 'VNI', type: 'number', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier — 1–16777215 arası', min: 1, max: 16777215 }
                    ]
                },
                {
                    title: 'Gateway IP ve ARP Suppress',
                    icon: 'fas fa-sitemap',
                    info: 'ARP Suppress, leaf switch\'lerin ARP flood\'unu EVPN üzerinden çözmesini sağlar — bandwidth tasarrufu yapar.',
                    fields: [
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.100.1', hint: 'Distributed gateway IP adresi — tüm leaf\'lerde aynı olabilir (anycast)' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Alt ağ maskesi — Örn: 255.255.255.0' },
                        { name: 'arp_suppress', label: 'ARP Suppress', type: 'select', options: [
                            { value: 'enable', label: 'Enable — ARP flood suppress (önerilir)', selected: true },
                            { value: 'disable', label: 'Disable — normal ARP davranışı' }
                        ]}
                    ]
                },
                {
                    title: 'EVPN Route Policy',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'EVPN route-target hesabı için AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vbdifId = cgEsc(data.vbdif_id || '');
            const vlanId = cgEsc(data.vlan_id || '');
            const vni = cgEsc(data.vni || '');
            const ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || '');
            const localAs = cgEsc(data.local_as || '');
            const arpSuppress = cgEsc(data.arp_suppress || 'enable');
            let c = '# ========================================\n# Huawei CloudEngine — EVPN Symmetric IRB\n# ========================================\n\n';
            c += 'vlan ' + vlanId + '\n#\n\n';
            c += 'interface Vbdif' + vbdifId + '\n';
            c += ' ip address ' + ip + ' ' + mask + '\n';
            if (arpSuppress === 'enable') c += ' arp-proxy inner-sub-vlan-proxy enable\n';
            c += '#\n\n';
            c += 'bridge-domain ' + vlanId + '\n';
            c += ' vxlan vni ' + vni + '\n';
            c += ' l2-multicast-vxlan-mode suppress\n#\n\n';
            c += 'evpn\n';
            c += ' vpn-instance ' + vlanId + ' vni ' + vni + '\n';
            c += ' route-distinguisher 10.255.0.1:' + vlanId + '\n';
            c += ' vpn-target ' + localAs + ':' + vlanId + ' export-extcommunity\n';
            c += ' vpn-target ' + localAs + ':' + vlanId + ' import-extcommunity\n#\n';
            c += '\n# Doğrulama:\n# display evpn vpn-instance vni ' + vni + '\n# display bridge-domain ' + vlanId + '\n';
            return c;
        });
    }
};

// ── HuaweiCE: Route Policy ────────────────────────────────────────────────────
HuaweiCE.routepolicy = {
    label: 'Route Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Route Policy (CloudEngine)',
                desc: 'Huawei CloudEngine route-policy yapılandırması — prefix-list eşleşme, community ve local-preference uygulama. BGP route filtreleme ve manipülasyonu için kullanılır.'
            },
            configTypes: [
                { id: 'permit', label: 'Permit Node', icon: 'fas fa-check-circle', desc: 'Eşleşen route\'lara izin ver ve attribute uygula',
                  badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'deny', label: 'Deny Node', icon: 'fas fa-times-circle', desc: 'Eşleşen route\'ları filtrele',
                  badge: { text: 'Filtreleme', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-OUT', hint: 'Route policy adı — BGP neighbor\'a apply edilecek' },
                        { name: 'seq', label: 'Node Sequence', type: 'number', required: true, placeholder: '10', hint: 'Node numarası — düşük numara önce işlenir, 10\'ar 10\'ar artırın', min: 1 },
                        { name: 'mode', label: 'Mode', type: 'select', options: [
                            { value: 'permit', label: 'permit — eşleşen route\'lara izin ver', selected: true },
                            { value: 'deny', label: 'deny — eşleşen route\'ları filtrele' }
                        ]}
                    ]
                },
                {
                    title: 'Match Koşulları',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'match_prefix', label: 'Match Prefix (CIDR)', type: 'text', optional: true, placeholder: '10.0.0.0/8', hint: 'Eşleştirilecek prefix — CIDR formatında. Boş bırakılırsa tüm route\'lar eşleşir' }
                    ]
                },
                {
                    title: 'Apply Aksiyonları',
                    icon: 'fas fa-edit',
                    fields: [
                        { name: 'apply_community', label: 'Apply Community', type: 'text', optional: true, placeholder: '65001:200', hint: 'BGP community değeri — additive mod ile eklenir' },
                        { name: 'apply_localpref', label: 'Apply Local Preference', type: 'number', optional: true, placeholder: '100', hint: 'BGP local-preference değeri — yüksek değer tercih edilir (varsayılan: 100)', min: 0, max: 4294967295 }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const policyName = cgEsc(data.policy_name || '');
            const seq = cgEsc(data.seq || '');
            const mode = cgEsc(data.mode || 'permit');
            const matchPrefix = cgEsc(data.match_prefix || '');
            const applyCommunity = cgEsc(data.apply_community || '');
            const applyLocalpref = cgEsc(data.apply_localpref || '');
            let c = '# ========================================\n# Huawei CloudEngine — Route Policy\n# ========================================\n\n';
            if (matchPrefix) c += 'ip ip-prefix PFX-' + policyName + ' index 5 permit ' + matchPrefix + '\n#\n\n';
            c += 'route-policy ' + policyName + ' ' + mode + ' node ' + seq + '\n';
            if (matchPrefix) c += ' if-match ip-prefix PFX-' + policyName + '\n';
            if (applyCommunity) c += ' apply community ' + applyCommunity + ' additive\n';
            if (applyLocalpref) c += ' apply local-preference ' + applyLocalpref + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display route-policy ' + policyName + '\n';
            return c;
        });
    }
};
