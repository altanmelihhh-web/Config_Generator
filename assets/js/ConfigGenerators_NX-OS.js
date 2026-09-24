'use strict';

const CiscoNXOS = {};

// ── NX-OS: OSPF ───────────────────────────────────────────────────────────────
CiscoNXOS.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (NX-OS)',
                desc: 'Nexus OSPF — process-tag ile çoklu instance. Link-state routing, area yapısı ve MD5 authentication desteği.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası veya tag', tooltip: 'NX-OS OSPF process-id veya named process tag' },
                        { name: 'rid', label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Genellikle Loopback IP adresi' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface', type: 'text', required: true, placeholder: 'GigabitEthernet 1/1', hint: 'OSPF etkinleştirilecek arayüz' },
                        { name: 'iface_ip', label: 'Interface IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' },
                        { name: 'net_type', label: 'Network Type', type: 'select', options: [
                            { value: 'point-to-point', label: 'point-to-point', selected: true },
                            { value: 'broadcast', label: 'broadcast' }
                        ]},
                        { name: 'auth_key', label: 'Auth Key', type: 'text', optional: true, placeholder: 'ospfkey123', hint: 'MD5 authentication için şifre' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxOspfGen(data);
        });
    }
};
function cgNxOspfGen(data) {
    const pid = cgEsc(data.pid || ''), rid = cgEsc(data.rid || ''), area = cgEsc(data.area || '');
    const iface = cgEsc(data.iface || ''), ifaceIp = cgEsc(data.iface_ip || '');
    const netType = cgEsc(data.net_type || 'point-to-point'), authKey = cgEsc(data.auth_key || '');
    let c = '# ========================================\n# Cisco NX-OS — OSPF\n# ========================================\n\n';
    c += 'feature ospf\n\n';
    c += 'router ospf ' + pid + '\n router-id ' + rid + '\n';
    if (authKey) c += ' area ' + area + ' authentication message-digest\n';
    c += '!\n\n';
    c += 'interface ' + iface + '\n';
    c += ' no switchport\n';
    c += ' ip address ' + ifaceIp + '\n';
    c += ' ip router ospf ' + pid + ' area ' + area + '\n';
    c += ' ip ospf network ' + netType + '\n';
    if (authKey) {
        c += ' ip ospf authentication message-digest\n';
        c += ' ip ospf message-digest-key 1 md5 ' + authKey + '\n';
    }
    c += ' no shutdown\n!\n\n';
    c += '# Doğrulama:\n# show ip ospf neighbors\n# show ip ospf database\n# show ip route ospf\n';
    return c;
}

// ── NX-OS: BGP ────────────────────────────────────────────────────────────────
CiscoNXOS.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (NX-OS)',
                desc: 'NX-OS BGP — address-family, route-reflector ve confederation desteği. eBGP/iBGP peer konfigürasyonu.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'rid', label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' },
                        { name: 'network', label: 'Network (advertise)', type: 'text', optional: true, placeholder: '10.1.0.0/16', hint: 'BGP ile duyurulacak prefix' }
                    ]
                },
                {
                    title: 'Neighbor Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'nbr_ip', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'nbr_as', label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'nbr_type', label: 'Neighbor Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP', selected: true },
                            { value: 'ibgp', label: 'iBGP' }
                        ]},
                        { name: 'update_src', label: 'Update Source', type: 'text', optional: true, placeholder: 'loopback0', hint: 'iBGP için update-source arayüzü (ör: loopback0)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxBgpGen(data);
        });
    }
};
function cgNxBgpGen(data) {
    const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
    const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
    const nbrType = cgEsc(data.nbr_type || 'ebgp'), updateSrc = cgEsc(data.update_src || '');
    const network = cgEsc(data.network || '');
    let c = '# ========================================\n# Cisco NX-OS — BGP\n# ========================================\n\n';
    c += 'feature bgp\n\n';
    c += 'router bgp ' + localAs + '\n';
    c += ' router-id ' + rid + '\n';
    c += ' address-family ipv4 unicast\n';
    if (network) c += '  network ' + network + '\n';
    c += ' !\n';
    c += ' neighbor ' + nbrIp + '\n remote-as ' + nbrAs + '\n';
    if (nbrType === 'ibgp' && updateSrc) c += '  update-source ' + updateSrc + '\n';
    if (nbrType === 'ebgp') c += '  ebgp-multihop 2\n';
    c += '  address-family ipv4 unicast\n   send-community\n  !\n!\n\n';
    c += '# Doğrulama:\n# show bgp summary\n# show bgp neighbors ' + nbrIp + '\n# show ip bgp\n';
    return c;
}

// ── NX-OS: HSRP ──────────────────────────────────────────────────────────────
CiscoNXOS.hsrp = {
    label: 'HSRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'HSRP (NX-OS)',
                desc: 'Nexus HSRP v2 — gateway yedekliği, preempt ve timer optimizasyonu. SVI üzerinde aktif/standby yapılandırması.'
            },
            sections: [
                {
                    title: 'Interface ve HSRP Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface (SVI)', type: 'text', required: true, placeholder: 'Vlan10', hint: 'HSRP uygulanacak SVI veya arayüz' },
                        { name: 'iface_ip', label: 'Interface IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.2/24', hint: 'CIDR formatında fiziksel IP' },
                        { name: 'grp', label: 'HSRP Grup Numarası', type: 'text', required: true, placeholder: '10', hint: '0–255 arası grup ID' },
                        { name: 'vip', label: 'Sanal IP (VIP)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.1', hint: 'Gateway olarak kullanılacak sanal IP' }
                    ]
                },
                {
                    title: 'Öncelik ve Kimlik Doğrulama',
                    icon: 'fas fa-star',
                    fields: [
                        { name: 'priority', label: 'Öncelik', type: 'text', optional: true, placeholder: '110', hint: 'Yüksek değer = aktif router (varsayılan 100)' },
                        { name: 'preempt', label: 'Preempt?', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Preempt aktif iken daha yüksek öncelikli router devralır' },
                        { name: 'auth_key', label: 'Auth Key', type: 'text', optional: true, placeholder: 'hsrpkey', hint: 'MD5 authentication şifresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxHsrpGen(data);
        });
    }
};
function cgNxHsrpGen(data) {
    const iface = cgEsc(data.iface || ''), ifaceIp = cgEsc(data.iface_ip || '');
    const grp = cgEsc(data.grp || ''), vip = cgEsc(data.vip || '');
    const priority = cgEsc(data.priority || '') || '100';
    const preempt = cgEsc(data.preempt || 'yes'), authKey = cgEsc(data.auth_key || '');
    let c = '# ========================================\n# Cisco NX-OS — HSRP\n# ========================================\n\n';
    c += 'feature hsrp\n\n';
    c += 'interface ' + iface + '\n';
    c += ' ip address ' + ifaceIp + '\n';
    c += ' hsrp version 2\n';
    c += ' hsrp ' + grp + '\n';
    c += '  ip ' + vip + '\n';
    c += '  priority ' + priority + '\n';
    if (preempt === 'yes') c += '  preempt\n';
    if (authKey) c += '  authentication md5 key-string ' + authKey + '\n';
    c += ' no shutdown\n!\n\n';
    c += '# Doğrulama:\n# show hsrp\n# show hsrp interface ' + iface + '\n# show hsrp brief\n';
    return c;
}

// ── NX-OS: MPLS ───────────────────────────────────────────────────────────────
CiscoNXOS.mpls = {
    label: 'MPLS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tags',
                title: 'MPLS (NX-OS)',
                desc: 'Nexus MPLS/Segment Routing — LDP etiket dağıtımı ve MPLS forwarding. LDP, Segment Routing veya VRF-Lite modu seçin.'
            },
            configTypes: [
                { id: 'ldp', label: 'LDP', icon: 'fas fa-tags', desc: 'Label Distribution Protocol', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'sr', label: 'Segment Routing', icon: 'fas fa-route', desc: 'SRGB ve Node-SID konfigürasyonu', badge: { text: 'Modern', cls: 'advanced' } },
                { id: 'vrf', label: 'VRF-Lite', icon: 'fas fa-layer-group', desc: 'VRF context ile L3 segmentasyon', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'LDP Ayarları',
                    icon: 'fas fa-tags',
                    showFor: ['ldp'],
                    fields: [
                        { name: 'ldp_loopback', label: 'Router-ID Loopback', type: 'text', required: true, placeholder: 'Loopback0', hint: 'LDP Router-ID için kullanılacak loopback' },
                        { name: 'ldp_rid', label: 'Router-ID IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Loopback IP adresi' },
                        { name: 'ldp_ifaces', label: 'LDP Arayüzleri', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış arayüz listesi' },
                        { name: 'ldp_mtu', label: 'MPLS MTU', type: 'text', optional: true, placeholder: '1508', hint: 'MPLS MTU değeri (varsayılan 1500)' }
                    ]
                },
                {
                    title: 'Segment Routing Ayarları',
                    icon: 'fas fa-route',
                    showFor: ['sr'],
                    fields: [
                        { name: 'sr_srgb_start', label: 'SRGB Başlangıç', type: 'text', required: true, placeholder: '16000', hint: 'Segment Routing Global Block başlangıcı' },
                        { name: 'sr_srgb_end', label: 'SRGB Bitiş', type: 'text', required: true, placeholder: '23999', hint: 'Segment Routing Global Block bitişi' },
                        { name: 'sr_node_sid', label: 'Node-SID Index', type: 'text', required: true, placeholder: '1', hint: 'Bu node için SID index değeri' },
                        { name: 'sr_loopback', label: 'Loopback Arayüzü', type: 'text', required: true, placeholder: 'Loopback0', hint: 'SR prefix için loopback arayüzü' },
                        { name: 'sr_igp', label: 'IGP Protokol', type: 'select', options: [
                            { value: 'ospf', label: 'OSPF', selected: true },
                            { value: 'isis', label: 'IS-IS' }
                        ]},
                        { name: 'sr_igp_proc', label: 'IGP Process/Tag', type: 'text', required: true, placeholder: '1', hint: 'OSPF process ID veya IS-IS tag' }
                    ]
                },
                {
                    title: 'VRF-Lite Ayarları',
                    icon: 'fas fa-layer-group',
                    showFor: ['vrf'],
                    fields: [
                        { name: 'vrf_name', label: 'VRF Adı', type: 'text', required: true, placeholder: 'CUSTOMER-A', hint: 'VRF context adı' },
                        { name: 'vrf_rd', label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65000:100', hint: 'Format: ASN:NN' },
                        { name: 'vrf_rt_imp', label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: '65000:100', hint: 'Route-target import değeri' },
                        { name: 'vrf_rt_exp', label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: '65000:100', hint: 'Route-target export değeri' },
                        { name: 'vrf_af', label: 'Address-Family', type: 'select', options: [
                            { value: 'ipv4', label: 'IPv4 Unicast', selected: true },
                            { value: 'both', label: 'IPv4 + IPv6' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosMplsGen(data);
        });
    }
};
function cgNxosMplsGen(data) {
    const mode = cgEsc(data._cgtype || 'ldp');
    let c = '! ========================================\n! Cisco NX-OS — MPLS\n! ========================================\n\n';
    if (mode === 'ldp') {
        c += 'feature mpls ldp\n\n';
        const lo = cgEsc(data.ldp_loopback || ''), rid = cgEsc(data.ldp_rid || '');
        const mtu = cgEsc(data.ldp_mtu || '');
        if (lo && rid) {
            c += 'interface ' + lo + '\n  ip address ' + rid + ' 255.255.255.255\n  ip router ospf 1 area 0\nno shutdown\n\n';
        }
        c += 'mpls ldp configuration\n  router-id ' + (rid || '<router-id>') + '\n\n';
        const ifaces = cgEsc(data.ldp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
        ifaces.forEach(iface => {
            c += 'interface ' + iface + '\n  mpls ip\n';
            if (mtu) c += '  mpls mtu ' + mtu + '\n';
            c += '\n';
        });
    } else if (mode === 'sr') {
        c += 'feature ospf\nfeature segment-routing\n\n';
        const srgbStart = cgEsc(data.sr_srgb_start || ''), srgbEnd = cgEsc(data.sr_srgb_end || '');
        const lo = cgEsc(data.sr_loopback || ''), nodeSid = cgEsc(data.sr_node_sid || '');
        c += 'segment-routing mpls\n  global-block ' + srgbStart + ' ' + srgbEnd + '\n  connected-prefix-sid-map\n    address-family ipv4\n      ' + lo + '/32 index ' + nodeSid + ' range 1\n\n';
        const igp = cgEsc(data.sr_igp || 'ospf'), proc = cgEsc(data.sr_igp_proc || '');
        if (igp === 'ospf') {
            c += 'router ospf ' + proc + '\n  segment-routing mpls\n  segment-routing forwarding mpls\n\n';
        } else {
            c += 'router isis ' + proc + '\n  segment-routing mpls\n  address-family ipv4 unicast\n    segment-routing mpls alloc all-interfaces\n\n';
        }
    } else {
        const vname = cgEsc(data.vrf_name || ''), rd = cgEsc(data.vrf_rd || '');
        const rtimp = cgEsc(data.vrf_rt_imp || ''), rtexp = cgEsc(data.vrf_rt_exp || '');
        c += 'vrf context ' + vname + '\n  rd ' + rd + '\n  address-family ipv4 unicast\n    route-target import ' + rtimp + '\n    route-target export ' + rtexp + '\n';
        if (cgEsc(data.vrf_af || '') === 'both') {
            c += '  address-family ipv6 unicast\n    route-target import ' + rtimp + ':6\n    route-target export ' + rtexp + ':6\n';
        }
        c += '\n';
    }
    return c;
}

// ── NX-OS: vPC ────────────────────────────────────────────────────────────────
CiscoNXOS.vpc = {
    label: 'vPC',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'vPC (Virtual Port-Channel)',
                desc: 'Virtual Port-Channel — çift control-plane ile loop-free dual-homed yedeklilik. Peer-keepalive ve peer-link konfigürasyonu.'
            },
            sections: [
                {
                    title: 'vPC Domain',
                    icon: 'fas fa-th-large',
                    fields: [
                        { name: 'vpc_domain', label: 'Domain ID', type: 'text', required: true, placeholder: '10', hint: '1–1000 arası benzersiz domain ID' },
                        { name: 'vpc_priority', label: 'Role Priority', type: 'text', optional: true, placeholder: '100', hint: 'Düşük değer = primary router' },
                        { name: 'vpc_mac', label: 'System MAC', type: 'text', optional: true, placeholder: '00:23:04:ee:be:67', hint: 'vPC çifti için ortak system MAC' },
                        { name: 'vpc_autorecovery', label: 'Auto-Recovery', type: 'select', options: [
                            { value: 'yes', label: 'Etkin', selected: true },
                            { value: 'no', label: 'Devre Dışı' }
                        ]},
                        { name: 'vpc_gcc', label: 'Graceful Consistency Check', type: 'select', options: [
                            { value: 'yes', label: 'Etkin', selected: true },
                            { value: 'no', label: 'Devre Dışı' }
                        ]}
                    ]
                },
                {
                    title: 'Peer-Keepalive',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'ka_src', label: 'Kaynak IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Bu switchin keepalive kaynak IP' },
                        { name: 'ka_dst', label: 'Hedef IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Peer switchin keepalive hedef IP' },
                        { name: 'ka_vrf', label: 'VRF', type: 'text', optional: true, placeholder: 'management', hint: 'Keepalive VRF (management arayüzü için "management")' }
                    ]
                },
                {
                    title: 'Peer-Link (Port-Channel)',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'pl_po', label: 'Port-Channel Numarası', type: 'text', required: true, placeholder: '1', hint: 'Peer-link için port-channel numarası' },
                        { name: 'pl_ifaces', label: 'Üye Arayüzler', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış peer-link üye portları' }
                    ]
                },
                {
                    title: 'vPC Üye Port-Channel',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'vpc_po', label: 'Port-Channel Numarası', type: 'text', optional: true, placeholder: '10', hint: 'vPC üye port-channel numarası' },
                        { name: 'vpc_id', label: 'vPC ID', type: 'text', optional: true, placeholder: '10', hint: 'vPC kimlik numarası (peer ile aynı olmalı)' },
                        { name: 'vpc_po_ifaces', label: 'Üye Arayüzler', type: 'text', optional: true, placeholder: 'Ethernet1/3, Ethernet1/4', hint: 'Virgülle ayrılmış üye portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosVpcGen(data);
        });
    }
};
function cgNxosVpcGen(data) {
    let c = '! ========================================\n! Cisco NX-OS — vPC\n! ========================================\n\n';
    c += 'feature vpc\nfeature lacp\n\n';
    c += 'vpc domain ' + cgEsc(data.vpc_domain || '') + '\n';
    if (data.vpc_priority) c += '  role priority ' + cgEsc(data.vpc_priority) + '\n';
    if (data.vpc_mac) c += '  system-mac ' + cgEsc(data.vpc_mac) + '\n';
    if (data.vpc_autorecovery === 'yes') c += '  auto-recovery\n';
    if (data.vpc_gcc === 'no') c += '  no graceful consistency-check\n';
    const kavrf = cgEsc(data.ka_vrf || '');
    c += '  peer-keepalive destination ' + cgEsc(data.ka_dst || '') + ' source ' + cgEsc(data.ka_src || '');
    if (kavrf) c += ' vrf ' + kavrf;
    c += '\n\n';
    const pl = cgEsc(data.pl_po || '');
    c += 'interface port-channel' + pl + '\n  switchport\n  switchport mode trunk\n  spanning-tree port type network\n  vpc peer-link\n\n';
    cgEsc(data.pl_ifaces || '').split(',').map(s => s.trim()).filter(Boolean).forEach(iface => {
        c += 'interface ' + iface + '\n  switchport\n  switchport mode trunk\n  channel-group ' + pl + ' mode active\n\n';
    });
    const vpo = cgEsc(data.vpc_po || ''), vid = cgEsc(data.vpc_id || '');
    if (vpo && vid) {
        c += 'interface port-channel' + vpo + '\n  switchport\n  switchport mode trunk\n  vpc ' + vid + '\n\n';
        cgEsc(data.vpc_po_ifaces || '').split(',').map(s => s.trim()).filter(Boolean).forEach(iface => {
            c += 'interface ' + iface + '\n  switchport\n  switchport mode trunk\n  channel-group ' + vpo + ' mode active\n\n';
        });
    }
    return c;
}

// ── NX-OS: VXLAN ─────────────────────────────────────────────────────────────
CiscoNXOS.vxlan = {
    label: 'VXLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'VXLAN',
                desc: 'NX-OS VXLAN Overlay — VNI ve NVE interface konfigürasyonu, underlay routing. L2 VNI (bridging) veya L3 VNI (routing) modu seçin.'
            },
            configTypes: [
                { id: 'l2vni', label: 'L2 VNI', icon: 'fas fa-network-wired', desc: 'Layer-2 overlay, VLAN-to-VNI mapping', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'l3vni', label: 'L3 VNI (Routing)', icon: 'fas fa-route', desc: 'VRF-to-VNI mapping, inter-tenant routing', badge: { text: 'İleri', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VTEP (NVE Interface)',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'vtep_loopback', label: 'Source Loopback', type: 'text', required: true, placeholder: 'Loopback1', hint: 'NVE source-interface için loopback' },
                        { name: 'vtep_ip', label: 'VTEP IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Bu VTEP için overlay IP adresi' }
                    ]
                },
                {
                    title: 'L2 VNI Mapping',
                    icon: 'fas fa-map',
                    showFor: ['l2vni'],
                    fields: [
                        { name: 'l2_vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'Yerel VLAN numarası' },
                        { name: 'l2_vni', label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'l2_rd', label: 'BGP EVPN RD', type: 'text', validate: 'rd', required: true, placeholder: 'auto', hint: 'Route Distinguisher (auto önerilir)' },
                        { name: 'l2_rt', label: 'RT Import/Export', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target değeri (auto önerilir)' }
                    ]
                },
                {
                    title: 'L3 VNI (VRF-to-VNI)',
                    icon: 'fas fa-layer-group',
                    showFor: ['l3vni'],
                    fields: [
                        { name: 'l3_vrf', label: 'VRF Adı', type: 'text', required: true, placeholder: 'TENANT-A', hint: 'L3 VNI ilişkilendirilecek VRF' },
                        { name: 'l3_vni', label: 'L3 VNI', type: 'text', validate: 'vni', required: true, placeholder: '50001', hint: 'Layer-3 VNI değeri' },
                        { name: 'l3_svi_vlan', label: 'SVI (VLAN) ID', type: 'text', validate: 'vlan', required: true, placeholder: '901', hint: 'L3 VNI için SVI VLAN ID' },
                        { name: 'l3_bgp_as', label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65000', hint: 'BGP Autonomous System numarası' },
                        { name: 'l3_rt', label: 'RT Import/Export', type: 'text', validate: 'rt', required: true, placeholder: '65000:50001', hint: 'Route-target değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosVxlanGen(data);
        });
    }
};
function cgNxosVxlanGen(data) {
    const mode = cgEsc(data._cgtype || 'l2vni');
    let c = '! ========================================\n! Cisco NX-OS — VXLAN/EVPN\n! ========================================\n\n';
    c += 'feature nv overlay\nfeature vn-segment-vlan-based\nfeature bgp\nnv overlay evpn\n\n';
    const lo = cgEsc(data.vtep_loopback || ''), vtep = cgEsc(data.vtep_ip || '');
    c += 'interface ' + lo + '\n  ip address ' + vtep + '/32\n  ip router ospf 1 area 0\nno shutdown\n\n';
    c += 'interface nve1\n  no shutdown\n  source-interface ' + lo + '\n  host-reachability protocol bgp\n';
    if (mode === 'l2vni') {
        const vlan = cgEsc(data.l2_vlan || ''), vni = cgEsc(data.l2_vni || '');
        c += '  member vni ' + vni + '\n    ingress-replication protocol bgp\n\n';
        c += 'vlan ' + vlan + '\n  vn-segment ' + vni + '\n\n';
        c += 'evpn\n  vni ' + vni + ' l2\n    rd ' + cgEsc(data.l2_rd || '') + '\n    route-target import ' + cgEsc(data.l2_rt || '') + '\n    route-target export ' + cgEsc(data.l2_rt || '') + '\n\n';
    } else {
        const vrf = cgEsc(data.l3_vrf || ''), l3vni = cgEsc(data.l3_vni || '');
        const sviVlan = cgEsc(data.l3_svi_vlan || ''), as = cgEsc(data.l3_bgp_as || ''), rt = cgEsc(data.l3_rt || '');
        c += '  member vni ' + l3vni + ' associate-vrf\n\n';
        c += 'vlan ' + sviVlan + '\n  vn-segment ' + l3vni + '\n\n';
        c += 'vrf context ' + vrf + '\n  vni ' + l3vni + '\n  rd auto\n  address-family ipv4 unicast\n    route-target import ' + rt + ' evpn\n    route-target export ' + rt + ' evpn\n\n';
        c += 'interface Vlan' + sviVlan + '\n  no shutdown\n  vrf member ' + vrf + '\n  ip forward\n\n';
        c += 'router bgp ' + as + '\n  address-family l2vpn evpn\n    advertise-pip\n\n';
    }
    return c;
}

// ── NX-OS: SPAN ──────────────────────────────────────────────────────────────
CiscoNXOS.span = {
    label: 'SPAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'SPAN',
                desc: 'Nexus SPAN/ERSPAN — trafik kopyalama, analiz ve troubleshooting portları. Local SPAN, RSPAN veya ERSPAN modu seçin.'
            },
            configTypes: [
                { id: 'local', label: 'Local SPAN', icon: 'fas fa-eye', desc: 'Aynı switch içi trafik kopyalama', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'rspan', label: 'RSPAN', icon: 'fas fa-broadcast-tower', desc: 'VLAN üzerinden uzak switch kopyalama', badge: { text: 'Yaygın', cls: 'common' } },
                { id: 'erspan', label: 'ERSPAN', icon: 'fas fa-cloud', desc: 'IP tüneli üzerinden uzak kopyalama', badge: { text: 'İleri', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Oturum Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'span_session', label: 'Oturum Numarası', type: 'text', required: true, placeholder: '1', hint: 'SPAN oturum numarası (1–66)' }
                    ]
                },
                {
                    title: 'Local SPAN Ayarları',
                    icon: 'fas fa-eye',
                    showFor: ['local'],
                    fields: [
                        { name: 'local_src', label: 'Kaynak Arayüz(ler)', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış kaynak portlar' },
                        { name: 'local_dir', label: 'Kaynak Yönü', type: 'select', options: [
                            { value: 'both', label: 'Both (TX+RX)', selected: true },
                            { value: 'tx', label: 'TX' },
                            { value: 'rx', label: 'RX' }
                        ]},
                        { name: 'local_dst', label: 'Hedef Arayüz', type: 'text', required: true, placeholder: 'Ethernet1/48', hint: 'Trafik kopyalanacak analyzer portu' }
                    ]
                },
                {
                    title: 'RSPAN Ayarları',
                    icon: 'fas fa-broadcast-tower',
                    showFor: ['rspan'],
                    fields: [
                        { name: 'rspan_vlan', label: 'RSPAN VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '999', hint: 'RSPAN trafiği taşıyacak VLAN' },
                        { name: 'rspan_role', label: 'Rol', type: 'select', options: [
                            { value: 'src', label: 'Kaynak Switch', selected: true },
                            { value: 'dst', label: 'Hedef Switch' }
                        ]},
                        { name: 'rspan_src', label: 'Kaynak Arayüz(ler)', type: 'text', optional: true, placeholder: 'Ethernet1/1', hint: 'Kaynak switch üzerindeki izlenecek portlar' },
                        { name: 'rspan_dst', label: 'Hedef Arayüz', type: 'text', optional: true, placeholder: 'Ethernet1/48', hint: 'Hedef switch üzerindeki analyzer portu' }
                    ]
                },
                {
                    title: 'ERSPAN Ayarları',
                    icon: 'fas fa-cloud',
                    showFor: ['erspan'],
                    fields: [
                        { name: 'erspan_id', label: 'ERSPAN ID', type: 'text', required: true, placeholder: '1', hint: 'ERSPAN oturum kimliği' },
                        { name: 'erspan_src', label: 'Kaynak Arayüz(ler)', type: 'text', required: true, placeholder: 'Ethernet1/1', hint: 'İzlenecek kaynak portlar' },
                        { name: 'erspan_src_ip', label: 'Kaynak IP (VTEP)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'ERSPAN GRE tüneli kaynak IP' },
                        { name: 'erspan_dst_ip', label: 'Hedef IP (Analyzer)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Uzak analyzer cihazının IP adresi' },
                        { name: 'erspan_ttl', label: 'TTL', type: 'text', optional: true, placeholder: '64', hint: 'GRE paketi TTL değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosSpanGen(data);
        });
    }
};
function cgNxosSpanGen(data) {
    const mode = cgEsc(data._cgtype || 'local'), sess = cgEsc(data.span_session || '');
    let c = '! ========================================\n! Cisco NX-OS — SPAN/RSPAN\n! ========================================\n\n';
    if (mode === 'local') {
        c += 'monitor session ' + sess + '\n';
        const srcs = cgEsc(data.local_src || '').split(',').map(s => s.trim()).filter(Boolean);
        const dir = cgEsc(data.local_dir || 'both');
        srcs.forEach(src => {
            c += '  source interface ' + src;
            if (dir !== 'both') c += ' ' + dir;
            c += '\n';
        });
        c += '  destination interface ' + cgEsc(data.local_dst || '') + '\nno shut\n\n';
    } else if (mode === 'rspan') {
        const vlan = cgEsc(data.rspan_vlan || ''), role = cgEsc(data.rspan_role || 'src');
        c += 'vlan ' + vlan + '\n  remote-span\n\n';
        if (role === 'src') {
            const srcs = cgEsc(data.rspan_src || '').split(',').map(s => s.trim()).filter(Boolean);
            c += 'monitor session ' + sess + ' type rspan-source\n';
            srcs.forEach(src => { if (src) c += '  source interface ' + src + '\n'; });
            c += '  destination remote vlan ' + vlan + '\nno shut\n\n';
        } else {
            c += 'monitor session ' + sess + ' type rspan-destination\n';
            c += '  source remote vlan ' + vlan + '\n';
            const dst = cgEsc(data.rspan_dst || '');
            if (dst) c += '  destination interface ' + dst + '\n';
            c += 'no shut\n\n';
        }
    } else {
        const id = cgEsc(data.erspan_id || ''), ttl = cgEsc(data.erspan_ttl || '');
        c += 'monitor session ' + sess + ' type erspan-source\n';
        const srcs = cgEsc(data.erspan_src || '').split(',').map(s => s.trim()).filter(Boolean);
        srcs.forEach(src => { c += '  source interface ' + src + '\n'; });
        c += '  destination ip ' + cgEsc(data.erspan_dst_ip || '') + '\n  erspan-id ' + id + '\n  origin ip address ' + cgEsc(data.erspan_src_ip || '') + '\n';
        if (ttl) c += '  ip ttl ' + ttl + '\n';
        c += 'no shut\n\n';
    }
    c += '! Doğrulama:\n! show monitor session ' + sess + '\n! show monitor session all\n';
    return c;
}

// ── NX-OS: BGP EVPN ──────────────────────────────────────────────────────────
CiscoNXOS.evpn = {
    label: 'VXLAN EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'VXLAN EVPN',
                desc: 'BGP EVPN kontrolü ile VXLAN overlay — modern data center fabric protokolü. MP-BGP üzerinden MAC/IP route dağıtımı.'
            },
            sections: [
                {
                    title: 'BGP EVPN Ayarları',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel BGP AS numarası' },
                        { name: 'rid', label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID (Loopback IP)' },
                        { name: 'nbr_ip', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'EVPN peer IP adresi' },
                        { name: 'nbr_as', label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'iBGP için aynı AS, eBGP için farklı AS' }
                    ]
                },
                {
                    title: 'EVPN VNI Ayarları',
                    icon: 'fas fa-cloud',
                    fields: [
                        { name: 'vni', label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'rd', label: 'RD (Route Distinguisher)', type: 'text', validate: 'rd', required: true, placeholder: 'auto', hint: 'Route Distinguisher değeri' },
                        { name: 'rt_import', label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target import değeri' },
                        { name: 'rt_export', label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target export değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxEvpnGen(data);
        });
    }
};
function cgNxEvpnGen(data) {
    const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
    const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
    const vni = cgEsc(data.vni || ''), rd = cgEsc(data.rd || '');
    const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
    let c = '! ========================================\n! Cisco NX-OS — BGP EVPN\n! ========================================\n\n';
    c += 'feature bgp\nfeature nv overlay\nfeature vn-segment-vlan-based\nnv overlay evpn\n\n';
    c += 'router bgp ' + localAs + '\n';
    c += '  router-id ' + rid + '\n';
    c += '  neighbor ' + nbrIp + '\n    remote-as ' + nbrAs + '\n';
    c += '    update-source loopback0\n';
    c += '    address-family l2vpn evpn\n      send-community\n      send-community extended\n    !\n  !\n!\n\n';
    c += 'evpn\n  vni ' + vni + ' l2\n    rd ' + rd + '\n';
    c += '    route-target import ' + rtImport + '\n';
    c += '    route-target export ' + rtExport + '\n  !\n!\n\n';
    c += '! Doğrulama:\n! show bgp l2vpn evpn summary\n! show nve peers\n! show evpn evi vni ' + vni + ' detail\n';
    return c;
}

// ── NX-OS: FabricPath ────────────────────────────────────────────────────────
CiscoNXOS.fabricPath = {
    label: 'FabricPath',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bezier-curve',
                title: 'FabricPath',
                desc: 'Cisco FabricPath — Layer-2 multipath fabric, IS-IS tabanlı loop-free topoloji. ECMP ile yüksek bant genişliği ve yedeklilik.'
            },
            sections: [
                {
                    title: 'FabricPath Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'switch_id', label: 'Switch-ID', type: 'text', required: true, placeholder: '1', hint: 'FabricPath topolojisindeki benzersiz switch kimliği' },
                        { name: 'metric_style', label: 'IS-IS Metric Style', type: 'select', options: [
                            { value: 'wide', label: 'wide', selected: true },
                            { value: 'narrow', label: 'narrow' }
                        ], hint: 'Wide metric modern ağlar için önerilir' }
                    ]
                },
                {
                    title: 'FabricPath VLAN ve Interface',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'fp_vlans', label: "FabricPath VLAN'lar", type: 'text', required: true, placeholder: '100,200,300', hint: 'Virgülle ayrılmış VLAN ID listesi' },
                        { name: 'fp_ifaces', label: "FabricPath Interface'ler", type: 'text', required: true, placeholder: 'Ethernet1/1,Ethernet1/2', hint: 'Virgülle ayrılmış fabric uplink portları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxFabricPathGen(data);
        });
    }
};
function cgNxFabricPathGen(data) {
    const switchId = cgEsc(data.switch_id || ''), metricStyle = cgEsc(data.metric_style || 'wide');
    const fpVlans = cgEsc(data.fp_vlans || '').split(',').map(s => s.trim()).filter(Boolean);
    const fpIfaces = cgEsc(data.fp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Cisco NX-OS — FabricPath\n! ========================================\n\n';
    c += 'feature-set fabricpath\n\n';
    c += 'fabricpath switch-id ' + switchId + '\n\n';
    c += '! FabricPath IS-IS\nrouter isis fabricpath\n  metric-style ' + metricStyle + '\n!\n\n';
    c += '! FabricPath VLANs\n';
    fpVlans.forEach(v => {
        c += 'vlan ' + v + '\n  mode fabricpath\n!\n';
    });
    c += '\n! FabricPath Interfaces\n';
    fpIfaces.forEach(iface => {
        c += 'interface ' + iface + '\n  switchport mode fabricpath\n  no shutdown\n!\n';
    });
    c += '\n! Doğrulama:\n! show fabricpath switch\n! show fabricpath topology\n! show fabricpath isis neighbors\n';
    return c;
}

// ── NX-OS: AAA ───────────────────────────────────────────────────────────────
CiscoNXOS.aaa = {
    label: 'AAA (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'AAA (NX-OS)',
                desc: 'Nexus AAA — TACACS+/RADIUS, role-based access control (RBAC). Merkezi kimlik doğrulama ve yetkilendirme.'
            },
            sections: [
                {
                    title: 'RADIUS Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'radius_ip', label: 'RADIUS Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'RADIUS sunucu IP adresi' },
                        { name: 'radius_key', label: 'RADIUS Key', type: 'text', required: true, placeholder: 'RadiusKey123!', hint: 'Paylaşılan gizli anahtar' },
                        { name: 'auth_port', label: 'Auth Port', type: 'text', validate: 'port', required: true, placeholder: '1812', hint: 'Authentication portu (standart: 1812)' },
                        { name: 'acct_port', label: 'Accounting Port', type: 'text', validate: 'port', required: true, placeholder: '1813', hint: 'Accounting portu (standart: 1813)' }
                    ]
                },
                {
                    title: 'Server Group ve Zamanlama',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'grp_name', label: 'Server Group Adı', type: 'text', required: true, placeholder: 'RADIUS_SERVERS', hint: 'AAA server group adı' },
                        { name: 'timeout', label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Sunucu yanıt bekleme süresi' },
                        { name: 'retransmit', label: 'Retransmit', type: 'text', optional: true, placeholder: '3', hint: 'Yeniden deneme sayısı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxAaaGen(data);
        });
    }
};
function cgNxAaaGen(data) {
    const radiusIp = cgEsc(data.radius_ip || ''), radiusKey = cgEsc(data.radius_key || '');
    const authPort = cgEsc(data.auth_port || ''), acctPort = cgEsc(data.acct_port || '');
    const grpName = cgEsc(data.grp_name || '');
    const timeout = cgEsc(data.timeout || ''), retransmit = cgEsc(data.retransmit || '');
    let c = '! ========================================\n! Cisco NX-OS — AAA / RADIUS\n! ========================================\n\n';
    c += 'feature radius\n\n';
    c += 'radius-server host ' + radiusIp + ' key ' + radiusKey;
    c += ' authentication port ' + authPort + ' accounting port ' + acctPort + '\n';
    if (timeout) c += 'radius-server timeout ' + timeout + '\n';
    if (retransmit) c += 'radius-server retransmit ' + retransmit + '\n';
    c += '\naaa group server radius ' + grpName + '\n  server ' + radiusIp + '\n!\n\n';
    c += 'aaa authentication login default group ' + grpName + ' local\n';
    c += 'aaa authorization commands default group ' + grpName + ' local\n';
    c += 'aaa accounting default group ' + grpName + '\n\n';
    c += '! Doğrulama:\n! show radius-server\n! show aaa authentication\n! show aaa accounting\n';
    return c;
}

// ── NX-OS: ACL ───────────────────────────────────────────────────────────────
CiscoNXOS.acl = {
    label: 'ACL (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL (NX-OS)',
                desc: 'Nexus ACL — IPv4/IPv6 erişim listeleri, object-group ve statistics desteği. Sequence numaralı girişler ile esnek kural yönetimi.'
            },
            sections: [
                {
                    title: 'ACL Kural Ayarları',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL_MGMT_IN', hint: 'Erişim listesi adı' },
                        { name: 'seq', label: 'Seq Numarası', type: 'text', required: true, placeholder: '10', hint: 'ACE sıra numarası (10 ile artımlı kullanım önerilir)' },
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
                        { name: 'src', label: 'Kaynak (src)', type: 'text', required: true, placeholder: '10.0.0.0/8', hint: 'CIDR formatı veya "any"' },
                        { name: 'dst', label: 'Hedef (dst)', type: 'text', required: true, placeholder: 'any', hint: 'CIDR formatı veya "any"' },
                        { name: 'dscp', label: 'DSCP', type: 'text', optional: true, placeholder: 'ef', hint: 'DSCP eşleştirme değeri (ör: ef, af41)' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_if', label: 'Uygulanan Interface', type: 'text', optional: true, placeholder: 'Ethernet1/1', hint: 'ACL uygulanacak arayüz (boş bırakılabilir)' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'in', selected: true },
                            { value: 'out', label: 'out' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxAclGen(data);
        });
    }
};
function cgNxAclGen(data) {
    const aclName = cgEsc(data.acl_name || ''), seq = cgEsc(data.seq || '');
    const action = cgEsc(data.action || 'permit'), proto = cgEsc(data.protocol || 'ip');
    const src = cgEsc(data.src || ''), dst = cgEsc(data.dst || '');
    const dscp = cgEsc(data.dscp || ''), applyIf = cgEsc(data.apply_if || '');
    const direction = cgEsc(data.direction || 'in');
    let c = '! ========================================\n! Cisco NX-OS — ACL\n! ========================================\n\n';
    c += 'ip access-list ' + aclName + '\n';
    c += '  ' + seq + ' ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (dscp) c += ' dscp ' + dscp;
    c += '\n  ' + (parseInt(seq) + 10) + ' deny ip any any\n!\n\n';
    if (applyIf) {
        c += 'interface ' + applyIf + '\n  ip access-group ' + aclName + ' ' + direction + '\n!\n\n';
    }
    c += '! Doğrulama:\n! show ip access-lists ' + aclName + '\n! show ip access-lists\n';
    return c;
}

// ── NX-OS: QoS ───────────────────────────────────────────────────────────────
CiscoNXOS.qos = {
    label: 'QoS (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS (NX-OS)',
                desc: 'Nexus QoS — modular policy, class-map, policy-map, service-policy. DSCP eşleştirme ve trafik policing konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Class-Map ve Policy-Map',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'PM_EGRESS_QOS', hint: 'Policy-map adı' },
                        { name: 'class_name', label: 'Class Adı', type: 'text', required: true, placeholder: 'CM_VOIP', hint: 'Class-map adı' },
                        { name: 'dscp_match', label: 'DSCP Match', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (ör: ef, af41, cs3)' },
                        { name: 'dscp_set', label: 'Set DSCP', type: 'select', options: [
                            { value: 'ef', label: 'EF', selected: true },
                            { value: 'af41', label: 'AF41' },
                            { value: 'af31', label: 'AF31' },
                            { value: 'cs3', label: 'CS3' },
                            { value: 'default', label: 'default' }
                        ], hint: 'Atanacak DSCP değeri' },
                        { name: 'police_rate', label: 'Police Rate (bps)', type: 'text', optional: true, placeholder: '1000000', hint: 'Policing hız sınırı (bit/sn), boş = policing yok' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_if', label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'Ethernet1/1', hint: 'QoS policy uygulanacak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxQosGen(data);
        });
    }
};
function cgNxQosGen(data) {
    const polName = cgEsc(data.pol_name || ''), className = cgEsc(data.class_name || '');
    const dscpMatch = cgEsc(data.dscp_match || ''), dscpSet = cgEsc(data.dscp_set || 'ef');
    const policeRate = cgEsc(data.police_rate || ''), applyIf = cgEsc(data.apply_if || '');
    let c = '! ========================================\n! Cisco NX-OS — QoS Policy Map\n! ========================================\n\n';
    c += 'class-map type qos match-all ' + className + '\n  match dscp ' + dscpMatch + '\n!\n\n';
    c += 'policy-map type qos ' + polName + '\n';
    c += '  class ' + className + '\n';
    c += '    set dscp ' + dscpSet + '\n';
    if (policeRate) {
        c += '    police rate ' + policeRate + ' bps bc 1000 ms\n';
        c += '      conform-action transmit\n      violate-action drop\n';
    }
    c += '  !\n!\n\n';
    c += 'interface ' + applyIf + '\n  service-policy type qos output ' + polName + '\n!\n\n';
    c += '! Doğrulama:\n! show policy-map interface ' + applyIf + '\n! show queuing interface ' + applyIf + '\n';
    return c;
}

// ── NX-OS: Syslog ────────────────────────────────────────────────────────────
CiscoNXOS.syslog = {
    label: 'Syslog (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Syslog (NX-OS)',
                desc: 'Nexus logging — severity seviyesi, facility ve uzak syslog sunucusu. Merkezi log yönetimi için UDP/TCP gönderim konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Syslog Konfigürasyonu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'syslog_ip', label: 'Syslog Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Uzak syslog sunucu IP adresi' },
                        { name: 'severity', label: 'Severity', type: 'select', options: [
                            { value: '0', label: '0 - emergencies' },
                            { value: '1', label: '1 - alerts' },
                            { value: '2', label: '2 - critical' },
                            { value: '3', label: '3 - errors' },
                            { value: '4', label: '4 - warnings', selected: true },
                            { value: '5', label: '5 - notifications' },
                            { value: '6', label: '6 - informational' },
                            { value: '7', label: '7 - debugging' }
                        ], hint: 'Seçilen seviye ve üzeri loglar gönderilir' },
                        { name: 'facility', label: 'Facility', type: 'select', options: [
                            { value: 'local0', label: 'local0' },
                            { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' },
                            { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4', selected: true },
                            { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' },
                            { value: 'local7', label: 'local7' }
                        ], hint: 'Syslog facility kodu' },
                        { name: 'src_iface', label: 'Source Interface', type: 'text', optional: true, placeholder: 'mgmt0', hint: 'Log paketleri için kaynak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxSyslogGen(data);
        });
    }
};
function cgNxSyslogGen(data) {
    const syslogIp = cgEsc(data.syslog_ip || ''), severity = cgEsc(data.severity || '4');
    const facility = cgEsc(data.facility || 'local4'), srcIface = cgEsc(data.src_iface || '');
    let c = '! ========================================\n! Cisco NX-OS — Syslog\n! ========================================\n\n';
    c += 'logging server ' + syslogIp + ' ' + severity + ' facility ' + facility + '\n';
    if (srcIface) c += 'logging source-interface ' + srcIface + '\n';
    c += 'logging timestamp milliseconds\n\n';
    c += '! Doğrulama:\n! show logging server\n! show logging last 100\n';
    return c;
}

// ── NX-OS: NTP ───────────────────────────────────────────────────────────────
CiscoNXOS.ntp = {
    label: 'NTP (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP (NX-OS)',
                desc: 'Nexus NTP — zaman senkronizasyonu, authentication key, prefer server. Doğru zaman damgası log ve sertifika güvenilirliği için kritiktir.'
            },
            sections: [
                {
                    title: 'NTP Server Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp_ip', label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'prefer', label: 'Prefer?', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Prefer ile bu sunucu öncelikli seçilir' },
                        { name: 'ntp_ip2', label: 'Yedek NTP Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucu IP adresi' },
                        { name: 'src_iface', label: 'Source Interface', type: 'text', optional: true, placeholder: 'mgmt0', hint: 'NTP paketleri için kaynak arayüz' }
                    ]
                },
                {
                    title: 'Saat Dilimi Ayarları',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', label: 'Timezone', type: 'text', required: true, placeholder: 'Turkey', hint: 'Saat dilimi adı (ör: Turkey, UTC, CET)' },
                        { name: 'utc_offset', label: 'UTC Offset Saatleri', type: 'text', required: true, placeholder: '3', hint: 'UTC farkı (ör: Türkiye için 3)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxNtpGen(data);
        });
    }
};
function cgNxNtpGen(data) {
    const ntpIp = cgEsc(data.ntp_ip || ''), prefer = cgEsc(data.prefer || 'yes');
    const srcIface = cgEsc(data.src_iface || '');
    const timezone = cgEsc(data.timezone || ''), utcOffset = cgEsc(data.utc_offset || '');
    const ntpIp2 = cgEsc(data.ntp_ip2 || '');
    let c = '! ========================================\n! Cisco NX-OS — NTP\n! ========================================\n\n';
    c += 'ntp server ' + ntpIp;
    if (prefer === 'yes') c += ' prefer';
    if (srcIface) c += ' use-vrf management';
    c += '\n';
    if (ntpIp2) {
        c += 'ntp server ' + ntpIp2;
        if (srcIface) c += ' use-vrf management';
        c += '\n';
    }
    if (srcIface) c += 'ntp source-interface ' + srcIface + '\n';
    c += '\nclock timezone ' + timezone + ' ' + utcOffset + ' 0\n\n';
    c += '! Doğrulama:\n! show ntp status\n! show ntp peers\n! show clock detail\n';
    return c;
}
