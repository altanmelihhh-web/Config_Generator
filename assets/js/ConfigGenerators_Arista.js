'use strict';
const Arista = {};

// ── Arista: General ───────────────────────────────────────────────────────────
Arista.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Arista EOS — Genel Konfigürasyon',
                desc: 'Temel hostname, VLAN, IP adresi ve varsayılan gateway ayarları. Yeni bir switch devreye alırken başlangıç noktası.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'ARISTA-SW1', hint: 'Cihazın hostname değeri' }
                    ]
                },
                {
                    title: 'VLAN ve IP',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Yönetim veya birincil VLAN numarası' },
                        { name: 'wan_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'SVI veya WAN arayüzüne atanacak IP' },
                        { name: 'subnet', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet mask' },
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan ağ geçidi IP adresi' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'LAN Arayüzü (numara)', type: 'text', required: true, placeholder: '1', hint: 'Ethernet<N> — sadece numarayı girin, ör: 1' },
                        { name: 'wan_iface', label: 'WAN Arayüzü', type: 'text', required: true, placeholder: 'Ethernet5', hint: 'Tam arayüz adı, ör: Ethernet5' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaGenGen(data);
        });
    }
};
function cgAristaGenGen(data) {
    const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || ''), wanIp = cgEsc(data.wan_ip || '');
    const subnet = cgEsc(data.subnet || ''), gw = cgEsc(data.gw || '');
    const iface = cgEsc(data.iface || ''), wanIface = cgEsc(data.wan_iface || '');
    let c = '! ========================================\n! Arista EOS — General Configuration\n! ========================================\n\n';
    c += 'configure\n\n';
    c += '! Hostname\nhostname ' + hn + '\n\n';
    c += '! VLAN\nvlan ' + vlan + '\n   name VLAN_' + vlan + '\n!\n';
    c += 'interface Vlan' + vlan + '\n   ip address ' + wanIp + ' ' + subnet + '\n   no shutdown\n!\n\n';
    c += '! Default Gateway\nip route 0.0.0.0/0 ' + gw + '\n\n';
    c += '! WAN Interface\ninterface ' + wanIface + '\n   no switchport\n   ip address ' + wanIp + ' ' + subnet + '\n   no shutdown\n!\n\n';
    c += '! LAN Port — VLAN Access\ninterface Ethernet' + iface + '\n   switchport mode access\n   switchport access vlan ' + vlan + '\n   no shutdown\n!\n\n';
    c += 'end\n\n';
    c += '! Doğrulama:\n! show running-config\n! show vlan ' + vlan + '\n! show interfaces ' + wanIface + '\n! show ip route\n';
    return c;
}

// ── Arista: VLAN ──────────────────────────────────────────────────────────────
Arista.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Arista EOS — VLAN',
                desc: 'VLAN tanımı ve isteğe bağlı access/trunk port ataması. Birden fazla port aynı VLAN\'a bağlanabilir.'
            },
            sections: [
                {
                    title: 'VLAN Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası' },
                        { name: 'vlan_name', label: 'VLAN Adı', type: 'text', required: true, placeholder: 'SERVERS', hint: 'Açıklayıcı VLAN ismi' }
                    ]
                },
                {
                    title: 'Arayüz Atama',
                    icon: 'fas fa-ethernet',
                    info: 'Access ve trunk portlar isteğe bağlıdır. Boş bırakılırsa sadece VLAN tanımı oluşturulur.',
                    fields: [
                        { name: 'access_intf', label: 'Access Port', type: 'text', optional: true, placeholder: 'Ethernet1', hint: 'VLAN\'a access modda bağlanacak port' },
                        { name: 'trunk_intf', label: 'Trunk Port', type: 'text', optional: true, placeholder: 'Ethernet2', hint: 'VLAN\'ı trunk\'a ekleyecek port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaVlanGen(data);
        });
    }
};
function cgAristaVlanGen(data) {
    const vid = cgEsc(data.vlan_id || ''), vname = cgEsc(data.vlan_name || '');
    const aIntf = cgEsc(data.access_intf || ''), tIntf = cgEsc(data.trunk_intf || '');
    let c = '! ========================================\n! Arista EOS — VLAN\n! ========================================\n\n';
    c += 'vlan ' + vid + '\n   name ' + vname + '\n!\n';
    if (aIntf) {
        c += 'interface ' + aIntf + '\n   switchport mode access\n   switchport access vlan ' + vid + '\n!\n';
    }
    if (tIntf) {
        c += 'interface ' + tIntf + '\n   switchport mode trunk\n   switchport trunk allowed vlan add ' + vid + '\n!\n';
    }
    c += '\n! Doğrulama:\n! show vlan brief\n';
    if (aIntf) c += '! show interfaces ' + aIntf + ' switchport\n';
    if (tIntf) c += '! show interfaces ' + tIntf + ' switchport\n';
    return c;
}

// ── Arista: Interface (L3 Routed Port) ───────────────────────────────────────
Arista.interface = {
    label: 'Interface (L3)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Arista EOS — L3 Routed Port',
                desc: 'Layer 3 routed port konfigürasyonu. Switchport modunu kaldırıp arayüze IP adresi atar. WAN uplink ve inter-VLAN routing için kullanılır.'
            },
            sections: [
                {
                    title: 'L3 Arayüz',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intf_name', label: 'Arayüz Adı', type: 'text', required: true, placeholder: 'Ethernet3', hint: 'L3 moduna alınacak arayüz adı' },
                        { name: 'ip_prefix', label: 'IP / Prefix (CIDR)', type: 'text', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi, ör: 10.0.0.1/30' },
                        { name: 'description', label: 'Açıklama', type: 'text', required: true, placeholder: 'WAN-Uplink', hint: 'Arayüz açıklaması' },
                        { name: 'mtu', label: 'MTU', type: 'text', optional: true, placeholder: '9000', hint: 'Jumbo frame için MTU değeri, ör: 9000' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaInterfaceGen(data);
        });
    }
};
function cgAristaInterfaceGen(data) {
    const intf = cgEsc(data.intf_name || ''), ip = cgEsc(data.ip_prefix || '');
    const desc = cgEsc(data.description || ''), mtu = cgEsc(data.mtu || '');
    let c = '! ========================================\n! Arista EOS — Interface (L3 Routed Port)\n! ========================================\n\n';
    c += 'interface ' + intf + '\n';
    c += '   no switchport\n';
    c += '   description ' + desc + '\n';
    c += '   ip address ' + ip + '\n';
    if (mtu) c += '   mtu ' + mtu + '\n';
    c += '   no shutdown\n!\n';
    c += '\n! Doğrulama:\n! show interfaces ' + intf + '\n! show ip interface brief\n';
    return c;
}

// ── Arista: Port-Channel / LACP ───────────────────────────────────────────────
Arista.portchannel = {
    label: 'Port-Channel/LACP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Arista EOS — Port-Channel / LACP',
                desc: 'LACP link aggregation (802.3ad) konfigürasyonu. Birden fazla fiziksel portu mantıksal bir kanal grubuna bağlar; bant genişliği artışı ve yedeklilik sağlar.'
            },
            sections: [
                {
                    title: 'Port-Channel',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'po_number', label: 'Port-Channel Numarası', type: 'text', required: true, placeholder: '1', hint: 'Port-Channel<N> için numara, ör: 1' },
                        { name: 'description', label: 'Açıklama', type: 'text', required: true, placeholder: 'UPLINK-LAG', hint: 'Port-Channel açıklaması' },
                        { name: 'lacp_mode', label: 'LACP Modu', type: 'select', options: [
                            { value: 'active', label: 'active', selected: true },
                            { value: 'passive', label: 'passive' }
                        ], hint: 'active: LACP paketleri gönderir; passive: bekler' },
                        { name: 'mode', label: 'Switchport Modu', type: 'select', options: [
                            { value: 'trunk', label: 'trunk', selected: true },
                            { value: 'access', label: 'access' }
                        ]},
                        { name: 'native_vlan', label: 'Native VLAN', type: 'text', validate: 'vlan', optional: true, placeholder: '1', hint: 'Trunk için native VLAN ID' }
                    ]
                },
                {
                    title: 'Üye Portlar',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', label: 'Üye Portlar', type: 'text', required: true, placeholder: 'Ethernet1,Ethernet2', hint: 'Virgülle ayrılmış port listesi, ör: Ethernet1,Ethernet2' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaPortchannelGen(data);
        });
    }
};
function cgAristaPortchannelGen(data) {
    const poNum = cgEsc(data.po_number || ''), desc = cgEsc(data.description || '');
    const lacpMode = cgEsc(data.lacp_mode || 'active'), mode = cgEsc(data.mode || 'trunk');
    const nativeVlan = cgEsc(data.native_vlan || '');
    const members = cgEsc(data.members || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Arista EOS — Port-Channel / LACP\n! ========================================\n\n';
    c += 'interface Port-Channel' + poNum + '\n';
    c += '   description ' + desc + '\n';
    c += '   switchport mode ' + mode + '\n';
    if (nativeVlan) c += '   switchport trunk native vlan ' + nativeVlan + '\n';
    c += '   no shutdown\n!\n';
    members.forEach(m => {
        c += 'interface ' + m + '\n';
        c += '   channel-group ' + poNum + ' mode ' + lacpMode + '\n';
        c += '   no shutdown\n!\n';
    });
    c += '\n! Doğrulama:\n! show port-channel ' + poNum + ' summary\n! show lacp ' + poNum + ' internal\n';
    return c;
}

// ── Arista: MLAG ──────────────────────────────────────────────────────────────
Arista.mlag = {
    label: 'MLAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-code-branch',
                title: 'Arista EOS — MLAG',
                desc: 'Multi-Chassis Link Aggregation (MLAG) konfigürasyonu. İki Arista switch\'i aktif-aktif yedeklilik için birbirine bağlar; peer-link üzerinden senkronizasyon sağlar.',
                badge: { text: 'Data Center', cls: 'advanced' }
            },
            sections: [
                {
                    title: 'MLAG Konfigürasyonu',
                    icon: 'fas fa-code-branch',
                    warn: 'Her iki switch\'te tutarlı domain-id ve peer-link konfigürasyonu gereklidir.',
                    fields: [
                        { name: 'domain_id', label: 'Domain ID', type: 'text', required: true, placeholder: 'MLAG_DOMAIN', hint: 'MLAG peer\'ları arasında eşleşen domain adı' },
                        { name: 'local_vlan', label: 'Peer-Link VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '4094', hint: 'MLAG peer iletişimi için özel VLAN (genellikle 4094)' },
                        { name: 'local_ip', label: 'Local IP / Prefix (CIDR)', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.1/30', hint: 'Bu switch\'in peer-link SVI IP adresi' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.2', hint: 'Karşı switch\'in peer-link IP adresi' },
                        { name: 'peer_link_po', label: 'Peer-Link Port-Channel', type: 'text', required: true, placeholder: 'Port-Channel100', hint: 'Peer-link olarak kullanılan Port-Channel arayüzü' },
                        { name: 'reload_delay', label: 'Reload Delay (sn)', type: 'text', required: true, placeholder: '300', hint: 'Yeniden başlama sonrası MLAG\'ın aktif olması için bekleme süresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaMlagGen(data);
        });
    }
};
function cgAristaMlagGen(data) {
    const domId = cgEsc(data.domain_id || ''), localVlan = cgEsc(data.local_vlan || '');
    const localIp = cgEsc(data.local_ip || ''), peerIp = cgEsc(data.peer_ip || '');
    const peerLinkPo = cgEsc(data.peer_link_po || ''), reloadDelay = cgEsc(data.reload_delay || '');
    let c = '! ========================================\n! Arista EOS — MLAG\n! ========================================\n\n';
    c += 'vlan ' + localVlan + '\n!\n';
    c += 'interface Vlan' + localVlan + '\n';
    c += '   description MLAG-Peer-Link\n';
    c += '   ip address ' + localIp + '\n';
    c += '   no autostate\n!\n';
    c += 'mlag configuration\n';
    c += '   domain-id ' + domId + '\n';
    c += '   local-interface Vlan' + localVlan + '\n';
    c += '   peer-address ' + peerIp + '\n';
    c += '   peer-link ' + peerLinkPo + '\n';
    c += '   reload-delay mlag ' + reloadDelay + '\n!\n';
    c += '\n! Doğrulama:\n! show mlag\n! show mlag detail\n';
    return c;
}

// ── Arista: OSPF ──────────────────────────────────────────────────────────────
Arista.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Arista EOS — OSPF',
                desc: 'Open Shortest Path First (OSPFv2) konfigürasyonu. Process ID, router-id, alan tanımı ve pasif arayüz yönetimi.'
            },
            sections: [
                {
                    title: 'OSPF Genel',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'process_id', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Genellikle Loopback0 IP adresi' },
                        { name: 'area', label: 'Alan (Area)', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' },
                        { name: 'networks', label: 'Ağlar (virgülle, CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/8,192.168.0.0/16', hint: 'OSPF\'e dahil edilecek ağlar, ör: 10.0.0.0/8,192.168.0.0/16' }
                    ]
                },
                {
                    title: 'Pasif Arayüz',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'passive_default', label: 'Passive Default', type: 'select', options: [
                            { value: 'yes', label: 'yes — tüm portlar pasif', selected: true },
                            { value: 'no', label: 'no — tüm portlar aktif' }
                        ], hint: 'yes: tüm portlar pasif olur, aktifler aşağıda belirtilir' },
                        { name: 'active_intfs', label: 'Aktif Arayüzler', type: 'text', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'passive-default=yes ise OSPF komşusu kurulacak portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaOspfGen(data);
        });
    }
};
function cgAristaOspfGen(data) {
    const pid = cgEsc(data.process_id || ''), rid = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
    const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
    const passiveDef = cgEsc(data.passive_default || 'yes');
    const activeIntfs = cgEsc(data.active_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Arista EOS — OSPF\n! ========================================\n\n';
    c += 'router ospf ' + pid + '\n';
    c += '   router-id ' + rid + '\n';
    networks.forEach(net => { c += '   network ' + net + ' area ' + area + '\n'; });
    if (passiveDef === 'yes') {
        c += '   passive-interface default\n';
        activeIntfs.forEach(intf => { c += '   no passive-interface ' + intf + '\n'; });
    }
    c += '   redistribute connected subnets route-map RM_CONNECTED\n';
    c += '   max-lsa 12000\n!\n';
    c += '\n! Doğrulama:\n! show ip ospf neighbor\n! show ip ospf database\n! show ip route ospf\n';
    return c;
}

// ── Arista: BGP ───────────────────────────────────────────────────────────────
Arista.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Arista EOS — BGP',
                desc: 'Border Gateway Protocol konfigürasyonu. eBGP/iBGP komşu tanımı, address-family ve ağ duyurusu.'
            },
            sections: [
                {
                    title: 'BGP Genel',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP Router-ID, genellikle Loopback IP' }
                    ]
                },
                {
                    title: 'Komşu (Neighbor)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'neighbor_ip', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşusunun IP adresi' },
                        { name: 'remote_as', label: 'Remote AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'neighbor_desc', label: 'Neighbor Açıklama', type: 'text', required: true, placeholder: 'PEER-AS65002', hint: 'Komşu açıklaması' }
                    ]
                },
                {
                    title: 'Advertise',
                    icon: 'fas fa-broadcast-tower',
                    fields: [
                        { name: 'networks', label: 'Ağlar (virgülle, CIDR)', type: 'text', optional: true, placeholder: '10.0.0.0/8,172.16.0.0/12', hint: 'BGP ile duyurulacak prefix\'ler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaBgpGen(data);
        });
    }
};
function cgAristaBgpGen(data) {
    const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.router_id || '');
    const neighborIp = cgEsc(data.neighbor_ip || ''), remoteAs = cgEsc(data.remote_as || '');
    const neighborDesc = cgEsc(data.neighbor_desc || '');
    const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Arista EOS — BGP\n! ========================================\n\n';
    c += 'router bgp ' + localAs + '\n';
    c += '   router-id ' + rid + '\n';
    c += '   no bgp default ipv4-unicast\n';
    c += '   neighbor ' + neighborIp + ' remote-as ' + remoteAs + '\n';
    c += '   neighbor ' + neighborIp + ' description ' + neighborDesc + '\n';
    c += '   neighbor ' + neighborIp + ' send-community\n';
    c += '   !\n';
    c += '   address-family ipv4\n';
    c += '      neighbor ' + neighborIp + ' activate\n';
    networks.forEach(net => { c += '      network ' + net + '\n'; });
    c += '   exit-address-family\n!\n';
    c += '\n! Doğrulama:\n! show bgp summary\n! show bgp neighbors ' + neighborIp + '\n! show ip route bgp\n';
    return c;
}

// ── Arista: EVPN-VXLAN ────────────────────────────────────────────────────────
Arista.evpnvxlan = {
    label: 'EVPN-VXLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'Arista EOS — EVPN-VXLAN',
                desc: 'Ethernet VPN üzerinden VXLAN overlay konfigürasyonu. VTEP loopback, VNI eşlemesi ve BGP EVPN address-family. Data center leaf-spine mimarisinde yaygın kullanım.',
                badge: { text: 'Data Center', cls: 'advanced' }
            },
            sections: [
                {
                    title: 'VTEP ve BGP',
                    icon: 'fas fa-cloud',
                    warn: 'BGP EVPN için underlay routing (OSPF/ISIS) önceden yapılandırılmış olmalıdır.',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'BGP Autonomous System numarası' },
                        { name: 'vtep_loopback', label: 'VTEP Loopback', type: 'text', required: true, placeholder: 'Loopback1', hint: 'VTEP kaynak loopback arayüzü' },
                        { name: 'vtep_ip', label: 'VTEP IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.1.1', hint: 'Loopback1\'e atanacak /32 IP adresi' },
                        { name: 'evpn_neighbor', label: 'EVPN Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.2', hint: 'BGP EVPN komşusunun IP adresi (genellikle spine)' }
                    ]
                },
                {
                    title: 'VLAN → VNI Eşleme',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'vlan_vni', label: 'VLAN:VNI Çiftleri', type: 'text', required: true, placeholder: '100:10100,200:10200', hint: 'Virgülle ayrılmış VLAN:VNI çiftleri, ör: 100:10100,200:10200' },
                        { name: 'rd', label: 'Route Distinguisher (RD)', type: 'text', validate: 'rd', required: true, placeholder: '10.255.0.1:1', hint: 'BGP RD değeri, ör: <loopback-ip>:1' },
                        { name: 'rt', label: 'Route Target (RT)', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'BGP RT değeri, ör: <AS>:<VNI>' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaEvpnvxlanGen(data);
        });
    }
};
function cgAristaEvpnvxlanGen(data) {
    const localAs = cgEsc(data.local_as || ''), vtepLo = cgEsc(data.vtep_loopback || '');
    const vtepIp = cgEsc(data.vtep_ip || ''), evpnNeighbor = cgEsc(data.evpn_neighbor || '');
    const rd = cgEsc(data.rd || ''), rt = cgEsc(data.rt || '');
    const pairs = cgEsc(data.vlan_vni || '').split(',').map(s => s.trim()).filter(Boolean).map(p => {
        const parts = p.split(':');
        return { vlan: cgEsc(parts[0] ? parts[0].trim() : ''), vni: cgEsc(parts[1] ? parts[1].trim() : '') };
    });
    let c = '! ========================================\n! Arista EOS — EVPN-VXLAN\n! ========================================\n\n';
    c += 'interface ' + vtepLo + '\n   ip address ' + vtepIp + '/32\n!\n';
    c += 'interface Vxlan1\n';
    c += '   vxlan source-interface ' + vtepLo + '\n';
    c += '   vxlan udp-port 4789\n';
    pairs.forEach(p => { c += '   vxlan vlan ' + p.vlan + ' vni ' + p.vni + '\n'; });
    c += '!\n';
    c += 'router bgp ' + localAs + '\n';
    c += '   address-family evpn\n';
    c += '      neighbor ' + evpnNeighbor + ' activate\n';
    c += '   !\n';
    pairs.forEach(p => {
        c += '   vlan ' + p.vlan + '\n';
        c += '      rd ' + rd + '\n';
        c += '      route-target both ' + rt + '\n';
        c += '      redistribute learned\n';
    });
    c += '!\n';
    c += '\n! Doğrulama:\n! show vxlan vtep\n! show bgp evpn summary\n! show vxlan vni\n';
    return c;
}

// ── Arista: ACL ───────────────────────────────────────────────────────────────
Arista.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Arista EOS — ACL',
                desc: 'IP erişim kontrol listesi (ACL) konfigürasyonu. Tek kural girişi; daha fazla kural için manuel ekleme yapılabilir.'
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', label: 'ACL Adı', type: 'text', required: true, placeholder: 'MGMT-ACCESS', hint: 'ACL\'in referans adı' }
                    ]
                },
                {
                    title: 'Kural',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'entry1_seq', label: 'Sequence No', type: 'text', required: true, placeholder: '10', hint: 'Kural sıra numarası (10, 20, 30, ...)' },
                        { name: 'entry1_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'entry1_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'ip', label: 'ip', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'entry1_src', label: 'Kaynak IP / Prefix', type: 'text', required: true, placeholder: '10.0.0.0/8', hint: 'Kaynak adres, ör: 10.0.0.0/8 veya any' },
                        { name: 'entry1_dst', label: 'Hedef', type: 'text', optional: true, placeholder: 'any', hint: 'Hedef adres, boş bırakılırsa "any"' },
                        { name: 'entry1_port', label: 'Port', type: 'text', optional: true, placeholder: '22', hint: 'TCP/UDP port numarası (sadece tcp/udp protokolünde geçerli)' }
                    ]
                },
                {
                    title: 'Sonuç Kuralı',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'final_deny', label: 'Sona deny ip any any ekle', type: 'select', options: [
                            { value: 'yes', label: 'Evet (önerilen)', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Explicit deny kuralı tüm eşleşmeyen trafiği loglar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaAclGen(data);
        });
    }
};
function cgAristaAclGen(data) {
    const aclName = cgEsc(data.acl_name || '');
    const seq = cgEsc(data.entry1_seq || ''), action = cgEsc(data.entry1_action || 'permit');
    const proto = cgEsc(data.entry1_proto || 'ip'), src = cgEsc(data.entry1_src || '');
    const dst = cgEsc(data.entry1_dst || '') || 'any', port = cgEsc(data.entry1_port || '');
    const finalDeny = cgEsc(data.final_deny || 'yes');
    let c = '! ========================================\n! Arista EOS — ACL\n! ========================================\n\n';
    c += 'ip access-list ' + aclName + '\n';
    let rule = '   ' + seq + ' ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (port && (proto === 'tcp' || proto === 'udp')) rule += ' eq ' + port;
    c += rule + '\n';
    if (finalDeny === 'yes') c += '   999 deny ip any any log\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show ip access-lists ' + aclName + '\n';
    return c;
}

// ── Arista: Route-Map + Prefix-List ──────────────────────────────────────────
Arista.routemap = {
    label: 'Route-Map + Prefix-List',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Arista EOS — Route-Map + Prefix-List',
                desc: 'Prefix-list ile route filtreleme ve route-map ile BGP/OSPF politikası. Local-preference, MED ve community değerleri atanabilir.'
            },
            sections: [
                {
                    title: 'Prefix-List',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'pl_name', label: 'Prefix-List Adı', type: 'text', required: true, placeholder: 'PL-ALLOWED', hint: 'Prefix-list referans adı' },
                        { name: 'prefix', label: 'Prefix', type: 'text', required: true, placeholder: '10.0.0.0/8 le 32', hint: 'Ör: 10.0.0.0/8 le 32 — /8\'den daha spesifik tüm prefixleri eşler' }
                    ]
                },
                {
                    title: 'Route-Map',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'rm_name', label: 'Route-Map Adı', type: 'text', required: true, placeholder: 'RM-IN', hint: 'Route-map referans adı' },
                        { name: 'rm_seq', label: 'Sequence No', type: 'text', required: true, placeholder: '10', hint: 'Route-map sıra numarası' },
                        { name: 'rm_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'set_localpref', label: 'set local-preference', type: 'text', optional: true, placeholder: '200', hint: 'BGP local-preference değeri; yüksek = tercihli' },
                        { name: 'set_med', label: 'set metric (MED)', type: 'text', optional: true, placeholder: '100', hint: 'BGP MED değeri' },
                        { name: 'set_community', label: 'set community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community değeri, ör: 65001:100' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaRoutemapGen(data);
        });
    }
};
function cgAristaRoutemapGen(data) {
    const plName = cgEsc(data.pl_name || ''), prefix = cgEsc(data.prefix || '');
    const rmName = cgEsc(data.rm_name || ''), rmSeq = cgEsc(data.rm_seq || ''), rmAction = cgEsc(data.rm_action || 'permit');
    const setLp = cgEsc(data.set_localpref || ''), setMed = cgEsc(data.set_med || ''), setCom = cgEsc(data.set_community || '');
    let c = '! ========================================\n! Arista EOS — Route-Map + Prefix-List\n! ========================================\n\n';
    c += 'ip prefix-list ' + plName + ' seq 5 permit ' + prefix + '\n!\n';
    c += 'route-map ' + rmName + ' ' + rmAction + ' ' + rmSeq + '\n';
    c += '   match ip address prefix-list ' + plName + '\n';
    if (setLp)  c += '   set local-preference ' + setLp + '\n';
    if (setMed) c += '   set metric ' + setMed + '\n';
    if (setCom) c += '   set community ' + setCom + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show ip prefix-list ' + plName + '\n! show route-map ' + rmName + '\n';
    return c;
}

// ── Arista: QoS (Traffic-Policy) ─────────────────────────────────────────────
Arista.qos = {
    label: 'QoS (Traffic-Policy)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Arista EOS — QoS (Traffic-Policy)',
                desc: 'DSCP tabanlı traffic classification ve bandwidth garantisi. Class-map ile trafik sınıflandırılır, policy-map ile bant genişliği ayrılır.'
            },
            sections: [
                {
                    title: 'Class-Map',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'class_name', label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'CM-VOICE', hint: 'Trafik sınıfının adı' },
                        { name: 'match_dscp', label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP değeri, ör: ef (voice), af41 (video), cs3 (signal)' }
                    ]
                },
                {
                    title: 'Policy-Map',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'policy_name', label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'PM-EGRESS', hint: 'Politika adı' },
                        { name: 'bandwidth_pct', label: 'Bandwidth %', type: 'text', required: true, placeholder: '20', hint: 'Bu sınıfa ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Uygulama',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_intf', label: 'Arayüz', type: 'text', optional: true, placeholder: 'Ethernet1', hint: 'Policy\'nin uygulanacağı arayüz (boş bırakılırsa sadece tanım oluşturulur)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaQosGen(data);
        });
    }
};
function cgAristaQosGen(data) {
    const className = cgEsc(data.class_name || ''), matchDscp = cgEsc(data.match_dscp || '');
    const policyName = cgEsc(data.policy_name || ''), bwPct = cgEsc(data.bandwidth_pct || '');
    const applyIntf = cgEsc(data.apply_intf || '');
    let c = '! ========================================\n! Arista EOS — QoS (Traffic-Policy)\n! ========================================\n\n';
    c += 'class-map match-any ' + className + '\n   match dscp ' + matchDscp + '\n!\n';
    c += 'policy-map ' + policyName + '\n';
    c += '   class ' + className + '\n      bandwidth percent ' + bwPct + '\n';
    c += '   class class-default\n      bandwidth percent 100\n!\n';
    if (applyIntf) {
        c += 'interface ' + applyIntf + '\n   service-policy output ' + policyName + '\n!\n';
    }
    c += '\n! Doğrulama:\n';
    if (applyIntf) c += '! show policy-map interface ' + applyIntf + '\n';
    else c += '! show policy-map ' + policyName + '\n';
    return c;
}

// ── Arista: STP / MSTP ────────────────────────────────────────────────────────
Arista.stp = {
    label: 'STP / MSTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'Arista EOS — STP / MSTP',
                desc: 'Spanning Tree Protocol konfigürasyonu. MSTP veya Rapid-PVST modu, bridge priority ayarı ve edge portlar için PortFast/BPDU Guard.'
            },
            sections: [
                {
                    title: 'STP Genel',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'mode', label: 'STP Modu', type: 'select', options: [
                            { value: 'mstp', label: 'mstp', selected: true },
                            { value: 'rapid-pvst', label: 'rapid-pvst' }
                        ], hint: 'mstp: IEEE 802.1s; rapid-pvst: her VLAN için ayrı instance' },
                        { name: 'priority', label: 'Priority', type: 'text', required: true, placeholder: '4096', hint: 'Root bridge için düşük değer (4096 veya 8192 önerilir)' }
                    ]
                },
                {
                    title: 'PortFast / BPDU Guard',
                    icon: 'fas fa-shield-alt',
                    info: 'Uç cihazların (sunucu, PC) bağlandığı portlara uygulanır. BPDU Guard ile döngü koruması sağlanır.',
                    fields: [
                        { name: 'portfast_intfs', label: 'PortFast Arayüzler', type: 'text', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'PortFast aktif edilecek edge portlar' },
                        { name: 'bpduguard_intfs', label: 'BPDU Guard Arayüzler', type: 'text', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'BPDU Guard aktif edilecek portlar (genellikle PortFast portlarıyla aynı)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaStpGen(data);
        });
    }
};
function cgAristaStpGen(data) {
    const mode = cgEsc(data.mode || 'mstp'), priority = cgEsc(data.priority || '');
    const portfastIntfs = cgEsc(data.portfast_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const bpduguardIntfs = cgEsc(data.bpduguard_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Arista EOS — STP / MSTP\n! ========================================\n\n';
    c += 'spanning-tree mode ' + mode + '\n';
    c += 'spanning-tree priority ' + priority + '\n!\n';
    portfastIntfs.forEach(intf => {
        c += 'interface ' + intf + '\n   spanning-tree portfast\n!\n';
    });
    bpduguardIntfs.forEach(intf => {
        c += 'interface ' + intf + '\n   spanning-tree bpduguard enable\n!\n';
    });
    c += '\n! Doğrulama:\n! show spanning-tree\n';
    if (portfastIntfs.length || bpduguardIntfs.length) {
        const sample = portfastIntfs[0] || bpduguardIntfs[0];
        c += '! show spanning-tree interface ' + sample + '\n';
    }
    return c;
}

// ── Arista: BFD ───────────────────────────────────────────────────────────────
Arista.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Arista EOS — BFD',
                desc: 'Bidirectional Forwarding Detection — hızlı link failure tespiti. BGP/OSPF/IS-IS ile birlikte kullanılarak yakınsama süresini düşürür.'
            },
            sections: [
                {
                    title: 'BFD Parametreleri',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'intf_name', label: 'Arayüz Adı', type: 'text', required: true, placeholder: 'Ethernet1', hint: 'BFD aktif edilecek arayüz' },
                        { name: 'min_tx', label: 'Min TX (ms)', type: 'text', required: true, placeholder: '300', hint: 'BFD paket gönderme aralığı (ms)' },
                        { name: 'min_rx', label: 'Min RX (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paket alma aralığı (ms)' },
                        { name: 'multiplier', label: 'Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç paket kaybında link down sayılır; toplam süre: min_rx × multiplier' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaBfdGen(data);
        });
    }
};
function cgAristaBfdGen(data) {
    const intf = cgEsc(data.intf_name || ''), minTx = cgEsc(data.min_tx || '');
    const minRx = cgEsc(data.min_rx || ''), mult = cgEsc(data.multiplier || '');
    let c = '! ========================================\n! Arista EOS — BFD\n! ========================================\n\n';
    c += 'interface ' + intf + '\n';
    c += '   bfd interval ' + minTx + ' min_rx ' + minRx + ' multiplier ' + mult + '\n!\n';
    c += '\n! Doğrulama:\n! show bfd peers\n! show bfd peers detail\n';
    return c;
}

// ── Arista: AAA / TACACS+ ─────────────────────────────────────────────────────
Arista.aaa = {
    label: 'AAA / TACACS+',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Arista EOS — AAA / TACACS+',
                desc: 'TACACS+ sunucu tanımı ve AAA authentication/authorization/accounting konfigürasyonu. Merkezi kimlik doğrulama ile kullanıcı yönetimini kolaylaştırır.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'TACACS+ Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'TACACS+ sunucusunun IP adresi' },
                        { name: 'key', label: 'Shared Key', type: 'text', required: true, placeholder: 'SecretKey123', hint: 'TACACS+ shared secret (cihaz ve sunucuda aynı olmalı)' },
                        { name: 'timeout', label: 'Timeout (sn)', type: 'text', required: true, placeholder: '3', hint: 'TACACS+ yanıt timeout süresi (saniye)' },
                        { name: 'group_name', label: 'Grup Adı', type: 'text', required: true, placeholder: 'TACACS-GROUP', hint: 'AAA server-group referans adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaAaaGen(data);
        });
    }
};
function cgAristaAaaGen(data) {
    const serverIp = cgEsc(data.server_ip || ''), key = cgEsc(data.key || '');
    const timeout = cgEsc(data.timeout || ''), groupName = cgEsc(data.group_name || '');
    let c = '! ========================================\n! Arista EOS — AAA / TACACS+\n! ========================================\n\n';
    c += 'tacacs-server host ' + serverIp + '\n';
    c += '   key ' + key + '\n';
    c += '   timeout ' + timeout + '\n!\n';
    c += 'aaa group server tacacs+ ' + groupName + '\n';
    c += '   server ' + serverIp + '\n!\n';
    c += 'aaa authentication login default group ' + groupName + ' local\n';
    c += 'aaa authentication enable default group ' + groupName + ' local\n';
    c += 'aaa authorization commands all default group ' + groupName + ' local\n';
    c += 'aaa accounting commands all default start-stop group ' + groupName + '\n!\n';
    c += '\n! Doğrulama:\n! show tacacs\n! test aaa server tacacs+ ' + serverIp + ' ...\n';
    return c;
}

// ── Arista: SNMP ──────────────────────────────────────────────────────────────
Arista.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'Arista EOS — SNMP',
                desc: 'SNMPv2c veya SNMPv3 konfigürasyonu. Monitoring sistemleri (LibreNMS, Zabbix) için community/kullanıcı tanımı ve trap hedefi.'
            },
            configTypes: [
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-chart-line', desc: 'Community string ile basit SNMP', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Auth + Priv ile güvenli SNMP', badge: { text: 'Güvenli', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'SNMPv2c',
                    icon: 'fas fa-chart-line',
                    showFor: ['v2c'],
                    fields: [
                        { name: 'community', label: 'Community', type: 'text', required: true, placeholder: 'PUBLIC-RO', hint: 'Read-only community string' }
                    ]
                },
                {
                    title: 'SNMPv3',
                    icon: 'fas fa-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_username', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmpuser', hint: 'SNMPv3 kullanıcı adı' },
                        { name: 'auth_proto', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'md5', label: 'MD5' },
                            { value: 'sha', label: 'SHA', selected: true }
                        ]},
                        { name: 'auth_password', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123', hint: 'Auth şifresi (min 8 karakter)' },
                        { name: 'priv_proto', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes', label: 'AES', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_password', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Ortak Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trap_host', label: 'Trap Host', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap alacak monitoring sunucusu' },
                        { name: 'location', label: 'Konum', type: 'text', optional: true, placeholder: 'DC1-Rack-42', hint: 'Fiziksel konum bilgisi' },
                        { name: 'contact', label: 'İletişim', type: 'text', optional: true, placeholder: 'noc@company.com', hint: 'NOC iletişim bilgisi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaSnmpGen(data);
        });
    }
};
function cgAristaSnmpGen(data) {
    const version = data._configType || 'v2c';
    const trapHost = cgEsc(data.trap_host || '');
    const location = cgEsc(data.location || ''), contact = cgEsc(data.contact || '');
    let c = '! ========================================\n! Arista EOS — SNMP\n! ========================================\n\n';
    if (version === 'v2c') {
        const community = cgEsc(data.community || '');
        c += 'snmp-server community ' + community + ' ro\n';
        c += 'snmp-server host ' + trapHost + ' version 2c ' + community + '\n';
    } else {
        const username = cgEsc(data.v3_username || ''), authProto = cgEsc(data.auth_proto || 'sha');
        const authPass = cgEsc(data.auth_password || ''), privProto = cgEsc(data.priv_proto || 'aes');
        const privPass = cgEsc(data.priv_password || '');
        c += 'snmp-server user ' + username + ' SNMP-GROUP v3 auth ' + authProto + ' ' + authPass + ' priv ' + privProto + ' ' + privPass + '\n';
        c += 'snmp-server group SNMP-GROUP v3 priv\n';
        c += 'snmp-server host ' + trapHost + ' version 3 priv ' + username + '\n';
    }
    if (location) c += 'snmp-server location ' + location + '\n';
    if (contact)  c += 'snmp-server contact ' + contact + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show snmp\n! show snmp community\n';
    return c;
}

// ── Arista: Management ACL ────────────────────────────────────────────────────
Arista.mgmtacl = {
    label: 'Management ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'Arista EOS — Management ACL',
                desc: 'SSH, HTTPS ve eAPI erişimi için kaynak bazlı kısıtlama. Sadece belirtilen IP blokları yönetim arayüzlerine ulaşabilir.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'İzin Verilen Kaynaklar',
                    icon: 'fas fa-check-circle',
                    fields: [
                        { name: 'permit_sources', label: 'Kaynak Prefix\'ler (virgülle, CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/8,192.168.1.0/24', hint: 'Yönetim erişimine izin verilecek IP blokları' }
                    ]
                },
                {
                    title: 'Servisler',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'protocols', label: 'Protokoller (virgülle)', type: 'text', required: true, placeholder: 'ssh,https,api', hint: 'Desteklenen değerler: ssh, https, api' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaMgmtaclGen(data);
        });
    }
};
function cgAristaMgmtaclGen(data) {
    const sources = cgEsc(data.permit_sources || '').split(',').map(s => s.trim()).filter(Boolean);
    const protocols = cgEsc(data.protocols || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    let c = '! ========================================\n! Arista EOS — Management ACL\n! ========================================\n\n';
    c += 'ip access-list MGMT-ACCESS\n';
    sources.forEach((src, i) => {
        c += '   ' + ((i + 1) * 10) + ' permit ip ' + src + ' any\n';
    });
    c += '   999 deny ip any any log\n!\n';
    if (protocols.includes('https') || protocols.includes('api')) {
        c += 'management api http-commands\n   no shutdown\n   ip access-list MGMT-ACCESS\n!\n';
    }
    if (protocols.includes('ssh')) {
        c += 'management ssh\n   ip access-list MGMT-ACCESS\n!\n';
    }
    c += '\n! Doğrulama:\n! show management api http-commands\n! show management ssh\n';
    return c;
}

// ── Arista: NTP ───────────────────────────────────────────────────────────────
Arista.ntp = {
    label: 'NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'Arista EOS — NTP',
                desc: 'Zaman senkronizasyonu için NTP sunucu konfigürasyonu. Birden fazla sunucu eklenebilir; opsiyonel VRF ve kaynak arayüz desteği.'
            },
            sections: [
                {
                    title: 'NTP Sunucular',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'servers', label: 'NTP Sunucular (virgülle)', type: 'text', required: true, placeholder: '10.0.0.1,10.0.0.2', hint: 'NTP sunucu IP adresleri, virgülle ayrılmış' },
                        { name: 'source_intf', label: 'Kaynak Arayüz', type: 'text', optional: true, placeholder: 'Management1', hint: 'NTP paketlerinin çıkacağı arayüz' },
                        { name: 'vrf', label: 'VRF', type: 'text', optional: true, placeholder: 'MGMT', hint: 'NTP trafiği için VRF adı (yönetim VRF\'i ise genellikle MGMT)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaNtpGen(data);
        });
    }
};
function cgAristaNtpGen(data) {
    const servers = cgEsc(data.servers || '').split(',').map(s => s.trim()).filter(Boolean);
    const sourceIntf = cgEsc(data.source_intf || ''), vrf = cgEsc(data.vrf || '');
    let c = '! ========================================\n! Arista EOS — NTP\n! ========================================\n\n';
    servers.forEach(srv => {
        c += 'ntp server' + (vrf ? ' vrf ' + vrf : '') + ' ' + srv + '\n';
    });
    if (sourceIntf) c += 'ntp source ' + sourceIntf + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show ntp status\n! show ntp associations\n';
    return c;
}

// ── Arista: Logging / Syslog ──────────────────────────────────────────────────
Arista.logging = {
    label: 'Logging / Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Arista EOS — Logging / Syslog',
                desc: 'Merkezi syslog sunucusuna log gönderimi. Facility, seviye ve kaynak arayüz konfigürasyonu. SIEM entegrasyonu için temel adım.'
            },
            sections: [
                {
                    title: 'Syslog Hedef',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'remote_host', label: 'Remote Host', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'Syslog sunucusunun IP adresi' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', optional: true, placeholder: '514', hint: 'UDP port numarası (varsayılan 514)' },
                        { name: 'facility', label: 'Facility', type: 'select', options: [
                            { value: 'local7', label: 'local7', selected: true },
                            { value: 'local6', label: 'local6' },
                            { value: 'local5', label: 'local5' },
                            { value: 'local4', label: 'local4' }
                        ], hint: 'Syslog facility değeri' },
                        { name: 'level', label: 'Log Level', type: 'select', options: [
                            { value: 'informational', label: 'informational', selected: true },
                            { value: 'debugging', label: 'debugging' },
                            { value: 'notifications', label: 'notifications' },
                            { value: 'warnings', label: 'warnings' }
                        ], hint: 'Bu seviye ve üzeri loglar gönderilir' },
                        { name: 'source_intf', label: 'Kaynak Arayüz', type: 'text', optional: true, placeholder: 'Management1', hint: 'Syslog paketlerinin çıkacağı arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAristaLoggingGen(data);
        });
    }
};
function cgAristaLoggingGen(data) {
    const host = cgEsc(data.remote_host || ''), port = cgEsc(data.port || '');
    const facility = cgEsc(data.facility || 'local7'), level = cgEsc(data.level || 'informational');
    const sourceIntf = cgEsc(data.source_intf || '');
    let c = '! ========================================\n! Arista EOS — Logging / Syslog\n! ========================================\n\n';
    c += 'logging host ' + host + (port ? ' ' + port : '') + '\n';
    c += 'logging facility ' + facility + '\n';
    c += 'logging trap ' + level + '\n';
    if (sourceIntf) c += 'logging source-interface ' + sourceIntf + '\n';
    c += 'logging on\n!\n';
    c += '\n! Doğrulama:\n! show logging\n! show logging host\n';
    return c;
}
