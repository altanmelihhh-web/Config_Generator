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
                        { name: 'hostname', why: "Hostname EOS promptunda, syslog kayıtlarında ve CloudVision envanterinde görünür; <code>localhost</code> olarak bırakılan cihazlarda log korelasyonu ve CVP eşleştirmesi imkânsız hâle gelir.", label: 'Hostname', type: 'text', required: true, placeholder: 'ARISTA-SW1', hint: 'Cihazın hostname değeri' }
                    ]
                },
                {
                    title: 'VLAN ve IP',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan', why: "LAN SVI bu VLAN üzerinde kurulur; karşı uçtaki trunk'ın <code>switchport trunk allowed vlan</code> listesinde bu ID yoksa port <b>up</b> görünür ama tek bir paket bile geçmez.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Yönetim veya birincil VLAN numarası' },
                        { name: 'wan_ip', why: "Bu adres alt cihazların gateway'i olur. Aynı adres başka bir cihazda da tanımlıysa duplicate address oluşur, ARP tablosu sürekli el değiştirir ve trafik aralıklarla kesilir.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'SVI veya WAN arayüzüne atanacak IP' },
                        { name: 'subnet', why: "Maske karşı uçtakiyle <b>birebir</b> aynı olmalıdır; /24 yerine /25 gibi dar bir maske girilirse aynı fiziksel segmentteki bazı hostlar komşu değil uzak ağ sayılır ve erişilemez.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet mask' },
                        { name: 'gw', why: "Varsayılan rota (<code>ip route 0.0.0.0/0</code>) bu adrese kurulur. Gateway SVI ile aynı subnet içinde değilse EOS rotayı kabul etmez ve cihaz dışarı çıkamaz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan ağ geçidi IP adresi' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "Buradaki portlar access moda alınır. Yanlışlıkla uplink portu yazılırsa trunk access'e döner, VLAN'lar arası taşıma durur ve uzaktan yönetim bağlantısı anında kopar.", label: 'LAN Arayüzü (numara)', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet1', hint: 'Ethernet<N> — sadece numarayı girin, ör: 1' },
                        { name: 'wan_iface', why: "Bu port <code>no switchport</code> ile L3 moda alınır; switchport olarak kalan bir arayüze IP atanamaz ve konfigürasyon sessizce etkisiz kalır.", label: 'WAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet5', hint: 'Tam arayüz adı, ör: Ethernet5' }
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
                        { name: 'vlan_id', why: "VLAN ID switch zincirindeki tüm cihazlarda aynı olmalı; karşı tarafta tanımsızsa veya trunk'ta izinli değilse bağlantı <b>sessizce</b> çalışmaz. 1002-1005 aralığı rezervedir, kullanmayın.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası' },
                        { name: 'vlan_name', why: "İsim yalnızca okunabilirlik içindir ama operasyonel olarak kritiktir: <code>show vlan</code> çıktısında anlamlı isim yoksa arızada hangi VLAN'ın ne olduğu bilinemez ve yanlış VLAN silinir.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'SERVERS', hint: 'Açıklayıcı VLAN ismi' }
                    ]
                },
                {
                    title: 'Arayüz Atama',
                    icon: 'fas fa-ethernet',
                    info: 'Access ve trunk portlar isteğe bağlıdır. Boş bırakılırsa sadece VLAN tanımı oluşturulur.',
                    fields: [
                        { name: 'access_intf', why: "Access port tek VLAN taşır ve gelen etiketli çerçeveleri düşürür. Telefon veya AP gibi etiketli trafik üreten cihazlar access porta bağlanırsa trafikleri sessizce yok edilir.", label: 'Access Port', type: 'text', validate: 'iface', optional: true, placeholder: 'Ethernet1', hint: 'VLAN\'a access modda bağlanacak port' },
                        { name: 'trunk_intf', why: "Trunk'ta <code>switchport trunk allowed vlan</code> ile listeyi daraltmak şarttır; <b>all</b> bırakmak broadcast alanını tüm VLAN'lara yayar ve bir VLAN'daki fırtına bütün switch'i etkiler.", label: 'Trunk Port', type: 'text', validate: 'iface', optional: true, placeholder: 'Ethernet2', hint: 'VLAN\'ı trunk\'a ekleyecek port' }
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
                        { name: 'intf_name', why: "Arayüz adı EOS söz dizimine tam uymalı (<code>Ethernet1</code>, <code>Port-Channel10</code>); yanlış yazılırsa EOS komutu reddeder ve blok içindeki diğer satırlar da uygulanmadan atlanır.", label: 'Arayüz Adı', type: 'text', required: true, placeholder: 'Ethernet3', hint: 'L3 moduna alınacak arayüz adı' },
                        { name: 'ip_prefix', why: "CIDR maskesi komşuyla aynı olmalı. Noktadan noktaya linklerde /31 adres israfını önler; /30 ile /31 karışırsa iki uç aynı subnet'te olmaz ve protokol komşuluğu hiç kurulmaz.", label: 'IP / Prefix (CIDR)', type: 'text', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi, ör: 10.0.0.1/30' },
                        { name: 'description', why: "Açıklama arızada çoğu zaman tek bilgi kaynağıdır; boş bırakılan portlar zamanla <b>bilinmeyen</b> hâline gelir ve bir değişiklik sırasında çalışan bir link yanlışlıkla kapatılır.", label: 'Açıklama', type: 'text', required: true, placeholder: 'WAN-Uplink', hint: 'Arayüz açıklaması' },
                        { name: 'mtu', why: "MTU her iki uçta aynı olmalı. VXLAN veya MPLS gibi kapsülleme varsa 9214 gibi jumbo değer şarttır; uyumsuz MTU'da ping çalışır ama büyük paketler (dosya transferi, TLS) sessizce takılır.", label: 'MTU', type: 'text', optional: true, placeholder: '9000', hint: 'Jumbo frame için MTU değeri, ör: 9000' }
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
                        { name: 'po_number', why: "Port-Channel numarası yereldir, ancak iki uçta aynı numarayı kullanmak operasyonu kolaylaştırır; MLAG kullanıyorsanız <b>aynı numaranın iki peer'da da aynı</b> olması zorunludur.", label: 'Port-Channel Numarası', type: 'text', required: true, placeholder: '1', hint: 'Port-Channel<N> için numara, ör: 1' },
                        { name: 'description', why: "Bundle'ın hangi cihaza gittiği yazılmazsa üye port arızasında hangi uca bakılacağı bilinmez; <code>show interfaces status</code> çıktısı tek başına bunu söylemez.", label: 'Açıklama', type: 'text', required: true, placeholder: 'UPLINK-LAG', hint: 'Port-Channel açıklaması' },
                        { name: 'lacp_mode', why: "<code>active</code> LACP müzakeresi başlatır, <code>on</code> ise müzakere olmadan statik bundle kurar. Bir uç <b>active</b> diğeri <b>on</b> ise bundle kurulmaz veya daha kötüsü döngü oluşur.", label: 'LACP Modu', type: 'select', options: [
                            { value: 'active', label: 'active', selected: true },
                            { value: 'passive', label: 'passive' }
                        ], hint: 'active: LACP paketleri gönderir; passive: bekler' },
                        { name: 'mode', why: "Switchport modu iki uçta aynı olmalı; bir taraf trunk diğeri access ise VLAN etiketleri düşer ve yalnızca native VLAN geçer. Bu da teşhisi en zor arıza tipi olan kısmi çalışmayı yaratır.", label: 'Switchport Modu', type: 'select', options: [
                            { value: 'trunk', label: 'trunk', selected: true },
                            { value: 'access', label: 'access' }
                        ]},
                        { name: 'native_vlan', why: "Native VLAN etiketsiz geçer. İki uçta farklı native VLAN varsa iki ayrı broadcast alanı birleşir (VLAN leak) ve STP uyarıları başlar; native'i kullanılmayan bir VLAN yapmak güvenlidir.", label: 'Native VLAN', type: 'text', validate: 'vlan', optional: true, placeholder: '1', hint: 'Trunk için native VLAN ID' }
                    ]
                },
                {
                    title: 'Üye Portlar',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', why: "Üye portların hız ve duplex ayarları aynı olmalı; farklı hızdaki port bundle'a katılmaz, bu da yalnızca <code>show port-channel detail</code> çıktısında görünür ve kapasite sessizce yarılanır.", label: 'Üye Portlar', type: 'text', required: true, placeholder: 'Ethernet1,Ethernet2', hint: 'Virgülle ayrılmış port listesi, ör: Ethernet1,Ethernet2' }
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
                        { name: 'domain_id', why: "MLAG <b>domain-id iki peer'da birebir aynı</b> olmak zorundadır; farklıysa MLAG hiç kurulmaz, portlar tek başına çalışır ve karşı taraf bundle'ı yarım görür.", label: 'Domain ID', type: 'text', required: true, placeholder: 'MLAG_DOMAIN', hint: 'MLAG peer\'ları arasında eşleşen domain adı' },
                        { name: 'local_vlan', why: "Peer-link üzerindeki bu VLAN yalnızca MLAG kontrol trafiği içindir ve <code>trunk group MLAGPEER</code> ile izole edilmelidir; veri VLAN'ıyla karıştırılırsa kontrol trafiği tıkanır ve MLAG sürekli flap eder.", label: 'Peer-Link VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '4094', hint: 'MLAG peer iletişimi için özel VLAN (genellikle 4094)' },
                        { name: 'local_ip', why: "Local IP, karşı peer'ın peer-address değeriyle çapraz eşleşmelidir. İki peer aynı adresi local olarak tanımlarsa MLAG <b>inactive</b> kalır ve tüm uplink'ler split-brain riskine girer.", label: 'Local IP / Prefix (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.255.255.1/30', hint: 'Bu switch\'in peer-link SVI IP adresi' },
                        { name: 'peer_ip', why: "Peer-address karşı cihazın local IP'si olmalı ve bu adresler peer-link VLAN'ı üzerinden birbirine ulaşmalıdır; yanlış adreste MLAG <code>connecting</code> aşamasında sonsuza kadar takılır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.2', hint: 'Karşı switch\'in peer-link IP adresi' },
                        { name: 'peer_link_po', why: "Peer-link <b>mutlaka bir Port-Channel</b> olmalıdır; tek fiziksel port verilirse EOS yapılandırmayı kabul etmez, ayrıca o tek link koptuğunda split-brain oluşup iki switch de aktif davranır.", label: 'Peer-Link Port-Channel', type: 'text', validate: 'iface', required: true, placeholder: 'Port-Channel100', hint: 'Peer-link olarak kullanılan Port-Channel arayüzü' },
                        { name: 'reload_delay', why: "Reboot sonrası switch'in MLAG yakınsamasını beklemeden portları açmasını engeller. Çok düşük verilirse cihaz hazır olmadan trafiği çeker ve her yeniden başlatma birkaç dakikalık kayıpla sonuçlanır.", label: 'Reload Delay (sn)', type: 'text', required: true, placeholder: '300', hint: 'Yeniden başlama sonrası MLAG\'ın aktif olması için bekleme süresi' }
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
                        { name: 'process_id', why: "Process ID yalnızca yereldir, komşuyla aynı olması <b>gerekmez</b>; ancak birden fazla process açmak istemeden rota bölünmesine yol açar, tek process ile çalışmak en güvenlisidir.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', why: "Router-ID tüm alan içinde benzersiz olmalıdır; çakışmada LSA'lar birbirini ezer, komşuluklar flap eder ve routing tablosu kararsızlaşır. Loopback adresi kullanmak en sağlam yöntemdir.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Genellikle Loopback0 IP adresi' },
                        { name: 'area', why: "Area numarası linkin iki ucunda aynı olmalı; farklıysa hello paketleri reddedilir ve komşuluk <code>INIT</code> durumunda takılır. Area 0 omurgadır, diğer tüm alanlar ona değmek zorundadır.", label: 'Alan (Area)', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' },
                        { name: 'networks', why: "Buradaki prefix hangi arayüzlerin OSPF'e katılacağını belirler. Çok geniş yazmak (<code>0.0.0.0/0</code>) WAN veya yönetim portunu da OSPF'e sokar ve dışarıya komşuluk açmaya çalışır.", label: 'Ağlar (virgülle, CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/8,192.168.0.0/16', hint: 'OSPF\'e dahil edilecek ağlar, ör: 10.0.0.0/8,192.168.0.0/16' }
                    ]
                },
                {
                    title: 'Pasif Arayüz',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'passive_default', why: "Varsayılanı passive yapmak, komşuluğun yalnızca bilinçli seçtiğiniz arayüzlerde kurulmasını sağlar; kapalı bırakılırsa sunucu ve kullanıcı portlarından hello gönderilir, bu hem güvenlik hem CPU riskidir.", label: 'Passive Default', type: 'select', options: [
                            { value: 'yes', label: 'yes — tüm portlar pasif', selected: true },
                            { value: 'no', label: 'no — tüm portlar aktif' }
                        ], hint: 'yes: tüm portlar pasif olur, aktifler aşağıda belirtilir' },
                        { name: 'active_intfs', why: "Passive default açıkken komşuluk yalnızca burada listelenen arayüzlerde kurulur; uplink'i eklemeyi unutmak OSPF'in hiçbir rota öğrenememesine ve trafiğin varsayılan rotaya düşmesine neden olur.", label: 'Aktif Arayüzler', type: 'text', validate: 'iface_range', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'passive-default=yes ise OSPF komşusu kurulacak portlar' }
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
                        { name: 'local_as', why: "Local AS, peer'ın <code>remote-as</code> değeriyle tam eşleşmeli; uyuşmazlıkta oturum <b>OpenSent</b> aşamasında sürekli resetlenir ve log'da AS mismatch mesajı döner.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: "BGP Router-ID AS içinde benzersiz olmalıdır; aynı ID'ye sahip iki cihaz peer olursa oturum kurulmaz. Fiziksel porttan bağımsız olması için loopback adresi tercih edin.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP Router-ID, genellikle Loopback IP' }
                    ]
                },
                {
                    title: 'Komşu (Neighbor)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'neighbor_ip', why: "Neighbor adresi, karşı ucun paketleri <b>gerçekten gönderdiği</b> kaynak adres olmalı; farklı bir adresten gelirse EOS oturumu reddeder. Loopback peering yapıyorsanız <code>update-source</code> da gerekir.", label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşusunun IP adresi' },
                        { name: 'remote_as', why: "Remote AS karşı tarafın local AS'i ile aynı olmalı. Ayrıca bu değer oturumun iBGP mi eBGP mi olduğunu belirler: eBGP'de TTL 1'dir, loopback peering için <code>ebgp-multihop</code> şart olur.", label: 'Remote AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'neighbor_desc', why: "Açıklama <code>show ip bgp summary</code> çıktısında peer'ın kim olduğunu gösterir; boş bırakılırsa arızada hangi operatörün veya DC'nin düştüğü yalnızca IP'den tahmin edilmeye çalışılır.", label: 'Neighbor Açıklama', type: 'text', required: true, placeholder: 'PEER-AS65002', hint: 'Komşu açıklaması' }
                    ]
                },
                {
                    title: 'Advertise',
                    icon: 'fas fa-broadcast-tower',
                    fields: [
                        { name: 'networks', why: "<code>network</code> ile duyurulan prefix'in routing tablosunda <b>birebir aynı maskeyle</b> bulunması gerekir; yoksa BGP onu hiç duyurmaz ve eksiklik sessizce fark edilmez.", label: 'Ağlar (virgülle, CIDR)', type: 'text', optional: true, placeholder: '10.0.0.0/8,172.16.0.0/12', hint: 'BGP ile duyurulacak prefix\'ler' }
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
                        { name: 'local_as', why: "EVPN omurgasında AS planı tutarlı olmalı; iBGP mi eBGP mi seçtiğiniz route-reflector ihtiyacını ve next-hop davranışını değiştirir, yanlış planda VTEP'ler birbirini öğrenemez.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'BGP Autonomous System numarası' },
                        { name: 'vtep_loopback', why: "VXLAN kaynak arayüzü bir loopback olmalıdır; fiziksel port verilirse o port düştüğünde tüm overlay çöker. Bu loopback underlay'de <b>her VTEP'ten erişilebilir</b> olmalıdır.", label: 'VTEP Loopback', type: 'text', required: true, placeholder: 'Loopback1', hint: 'VTEP kaynak loopback arayüzü' },
                        { name: 'vtep_ip', why: "VTEP IP, kapsüllenmiş paketlerin kaynak adresidir ve underlay routing ile tüm diğer VTEP'lere ulaşabilmelidir; underlay'de duyurulmayan bir VTEP IP'si tüneli tek yönlü ve kullanılamaz yapar.", label: 'VTEP IP', type: 'text', validate: 'ip', required: true, placeholder: '10.240.1.1', hint: 'Loopback1\'e atanacak /32 IP adresi' },
                        { name: 'evpn_neighbor', why: "EVPN komşusu MAC/IP bilgisini dağıtan kontrol düzlemidir. Bu peering kurulmazsa VXLAN <b>flood-and-learn</b>'e düşer; trafik kısmen çalışır ama MAC tabloları şişer ve teşhis çok zorlaşır.", label: 'EVPN Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.2', hint: 'BGP EVPN komşusunun IP adresi (genellikle spine)' }
                    ]
                },
                {
                    title: 'VLAN → VNI Eşleme',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'vlan_vni', why: "VLAN-VNI eşleşmesi tüm VTEP'lerde <b>aynı</b> olmalıdır; bir cihazda VLAN 10 için VNI 10010, diğerinde 10100 ise trafik yanlış segmente taşınır veya hiç ulaşmaz. VXLAN'da en sık yapılan hata budur.", label: 'VLAN:VNI Çiftleri', type: 'text', required: true, placeholder: '100:10100,200:10200', hint: 'Virgülle ayrılmış VLAN:VNI çiftleri, ör: 100:10100,200:10200' },
                        { name: 'rd', why: "Route Distinguisher her VTEP'te benzersiz olmalıdır (genelde <code>loopback:VNI</code>); aynı RD iki cihazda kullanılırsa EVPN rotaları birbirini ezer ve MAC'ler yanlış VTEP'i işaret eder.", label: 'Route Distinguisher (RD)', type: 'text', validate: 'rd', required: true, placeholder: '10.255.0.1:1', hint: 'BGP RD değeri, ör: <loopback-ip>:1' },
                        { name: 'rt', why: "Route Target hangi VNI'nin hangi rotaları import edeceğini belirler ve aynı segmenti paylaşan tüm VTEP'lerde <b>aynı</b> olmalıdır; uyuşmazlıkta rotalar gelir ama import edilmez, tablo boş kalır.", label: 'Route Target (RT)', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'BGP RT değeri, ör: <AS>:<VNI>' }
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
                        { name: 'acl_name', why: "ACL adı ile arayüzde uygulanan ad birebir aynı olmalı; EOS var olmayan bir ACL'in uygulanmasını kabul eder ve kural hiçbir zaman çalışmaz. Bu da yanlış bir güvenlik hissi yaratır.", label: 'ACL Adı', type: 'text', required: true, placeholder: 'MGMT-ACCESS', hint: 'ACL\'in referans adı' }
                    ]
                },
                {
                    title: 'Kural',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'entry1_seq', why: "Sequence numarası kuralların değerlendirme sırasını belirler ve <b>ilk eşleşen kural kazanır</b>. Aralıkları 10'ar bırakmak, sonradan kural eklerken tüm ACL'i yeniden yazmaktan kurtarır.", label: 'Sequence No', type: 'text', required: true, placeholder: '10', hint: 'Kural sıra numarası (10, 20, 30, ...)' },
                        { name: 'entry1_action', why: "<code>permit</code> mi <code>deny</code> mi seçiminden önce sırayı düşünün: geniş bir permit'in altına yazılan deny hiçbir zaman çalışmaz, çünkü paket zaten üst kuralda eşleşip geçmiştir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'entry1_proto', why: "Protokol daraltması kuralın gerçekte ne yaptığını belirler; <code>ip</code> seçmek TCP, UDP ve ICMP'nin tamamını kapsar ve niyetinizden çok daha geniş bir izin ya da yasak oluşturabilir.", label: 'Protokol', type: 'select', options: [
                            { value: 'ip', label: 'ip', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'entry1_src', why: "Kaynak prefix'i <code>any</code> bırakmak kuralın amacını bozar. Özellikle yönetim ACL'lerinde kaynak daraltması, cihazı internetten gelen brute-force denemelerine karşı koruyan tek katmandır.", label: 'Kaynak IP / Prefix', type: 'text', required: true, placeholder: '10.0.0.0/8', hint: 'Kaynak adres, ör: 10.0.0.0/8 veya any' },
                        { name: 'entry1_dst', why: "Hedefi doğru daraltmak kuralın yalnızca ilgili sunucuya uygulanmasını sağlar; <code>any</code> yazmak aynı VLAN'daki diğer tüm servisleri de istemeden etkiler.", label: 'Hedef', type: 'text', optional: true, placeholder: 'any', hint: 'Hedef adres, boş bırakılırsa "any"' },
                        { name: 'entry1_port', why: "Port belirtmeden yazılan kural tüm servisleri kapsar. Ayrıca port yalnızca <code>tcp</code> ve <code>udp</code> ile anlamlıdır; protokol <code>ip</code> seçilmişse port alanı yok sayılır.", label: 'Port', type: 'text', optional: true, placeholder: '22', hint: 'TCP/UDP port numarası (sadece tcp/udp protokolünde geçerli)' }
                    ]
                },
                {
                    title: 'Sonuç Kuralı',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'final_deny', why: "ACL'lerin sonunda zaten gizli bir deny vardır, ama açık yazmak sayaçları (<code>show ip access-lists</code>) görünür kılar; böylece neyin nerede durdurulduğunu tahmin etmek yerine ölçebilirsiniz.", label: 'Sona deny ip any any ekle', type: 'select', options: [
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
                        { name: 'pl_name', why: "Prefix-list adı, route-map içinde <code>match ip address prefix-list</code> ile çağrılan adla aynı olmalı; isim uyuşmazsa match hiçbir zaman gerçekleşmez ve route-map beklenen filtrelemeyi yapmaz.", label: 'Prefix-List Adı', type: 'text', required: true, placeholder: 'PL-ALLOWED', hint: 'Prefix-list referans adı' },
                        { name: 'prefix', why: "Prefix'i <code>le</code> veya <code>ge</code> olmadan yazmak yalnızca tam o maskeyle eşleşir; örneğin 10.0.0.0/8 girişi 10.1.0.0/16 rotasını <b>yakalamaz</b> ve filtre sessizce boş çalışır.", label: 'Prefix', type: 'text', required: true, placeholder: '10.0.0.0/8 le 32', hint: 'Ör: 10.0.0.0/8 le 32 — /8\'den daha spesifik tüm prefixleri eşler' }
                    ]
                },
                {
                    title: 'Route-Map',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'rm_name', why: "Route-map adı BGP neighbor altında referans verilen adla aynı olmalı; EOS var olmayan bir route-map'in uygulanmasına izin verir ve bu durumda tüm rotalar filtresiz geçer.", label: 'Route-Map Adı', type: 'text', required: true, placeholder: 'RM-IN', hint: 'Route-map referans adı' },
                        { name: 'rm_seq', why: "Route-map sequence'ları sırayla değerlendirilir ve ilk eşleşen uygulanıp çıkılır; ayrıca en sondaki örtük <code>deny</code> nedeniyle hiçbir sequence'a uymayan rotalar tamamen düşer.", label: 'Sequence No', type: 'text', required: true, placeholder: '10', hint: 'Route-map sıra numarası' },
                        { name: 'rm_action', why: "Route-map'te <code>permit</code> hem izin hem <b>set uygula</b> demektir; <code>deny</code> seçilen sequence'ta set komutları çalışmaz ve rota tamamen atılır. Karıştırılırsa rotalar beklenmedik şekilde kaybolur.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'set_localpref', why: "Local-preference yalnızca AS <b>içinde</b> taşınır ve yüksek olan kazanır; çıkış yolu seçimini belirler. Tek taraflı ayarlanırsa trafik asimetrik olur ve yolda stateful firewall varsa oturumlar kopar.", label: 'set local-preference', type: 'text', optional: true, placeholder: '200', hint: 'BGP local-preference değeri; yüksek = tercihli' },
                        { name: 'set_med', why: "MED komşu AS'e <b>bana buradan gel</b> önerisidir ve düşük olan tercih edilir; ancak karşı taraf MED'i dikkate almak zorunda değildir, bu yüzden tek başına güvenilmez bir trafik mühendisliği aracıdır.", label: 'set metric (MED)', type: 'text', optional: true, placeholder: '100', hint: 'BGP MED değeri' },
                        { name: 'set_community', why: "Community, karşı taraftaki politikayı tetikleyen etikettir. Ayrıca <code>send-community</code> aktif değilse değer hiç gönderilmez ve karşı tarafta beklenen davranış oluşmaz.", label: 'set community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community değeri, ör: 65001:100' }
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
                        { name: 'class_name', why: "Class-map adı policy-map içinde çağrılan adla aynı olmalı; uyuşmazlıkta policy uygulanmış gibi görünür ama hiçbir paket sınıflandırılmaz ve QoS tamamen etkisiz kalır.", label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'CM-VOICE', hint: 'Trafik sınıfının adı' },
                        { name: 'match_dscp', why: "DSCP değeri uçtan uca güvenilmelidir; sınır portlarında trust ayarı yoksa işaretleme silinir ya da kullanıcı cihazı kendini EF olarak işaretleyip öncelikli kuyruğa sızar.", label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP değeri, ör: ef (voice), af41 (video), cs3 (signal)' }
                    ]
                },
                {
                    title: 'Policy-Map',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'policy_name', why: "Policy-map sınıflandırma ile davranışı birleştirir; arayüze <code>service-policy</code> ile uygulanmadığı sürece tanımlı olması hiçbir şey yapmaz. En sık atlanan adım budur.", label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'PM-EGRESS', hint: 'Politika adı' },
                        { name: 'bandwidth_pct', why: "Garanti edilen yüzde, tıkanıklık anında bu sınıfa ayrılan minimumdur. Toplam %100'ü aşarsa policy uygulanmaz; çok yüksek verilirse diğer trafik açlık çeker ve TCP retransmit patlar.", label: 'Bandwidth %', type: 'text', required: true, placeholder: '20', hint: 'Bu sınıfa ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Uygulama',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_intf', why: "QoS genelde <b>çıkış</b> yönünde anlamlıdır, çünkü kuyruk darboğazın olduğu yerde oluşur; yanlış arayüze veya yanlış yöne uygulanan policy hiçbir sorunu çözmez ama çözüldü sanılır.", label: 'Arayüz', type: 'text', validate: 'iface', optional: true, placeholder: 'Ethernet1', hint: 'Policy\'nin uygulanacağı arayüz (boş bırakılırsa sadece tanım oluşturulur)' }
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
                        { name: 'mode', why: "STP modu tüm L2 alanında uyumlu olmalı; MST ile RPVST karışımı bölgelerde root seçimi beklenmedik şekilde değişir, VLAN bazlı trafik yanlış yoldan akar ve en kötü durumda döngü oluşur.", label: 'STP Modu', type: 'select', options: [
                            { value: 'mstp', label: 'mstp', selected: true },
                            { value: 'rapid-pvst', label: 'rapid-pvst' }
                        ], hint: 'mstp: IEEE 802.1s; rapid-pvst: her VLAN için ayrı instance' },
                        { name: 'priority', why: "Root bridge'i <b>bilinçli</b> seçmek zorundasınız; varsayılan bırakılırsa en düşük MAC'e sahip rastgele bir erişim switch'i root olur ve tüm trafik yanlış yoldan dolaşır. Değer 4096'nın katı olmalıdır.", label: 'Priority', type: 'text', required: true, placeholder: '4096', hint: 'Root bridge için düşük değer (4096 veya 8192 önerilir)' }
                    ]
                },
                {
                    title: 'PortFast / BPDU Guard',
                    icon: 'fas fa-shield-alt',
                    info: 'Uç cihazların (sunucu, PC) bağlandığı portlara uygulanır. BPDU Guard ile döngü koruması sağlanır.',
                    fields: [
                        { name: 'portfast_intfs', why: "PortFast yalnızca uç cihaz portlarında kullanılmalıdır; switch bağlı bir porta verilirse dinleme ve öğrenme aşaması atlandığı için <b>anında köprü döngüsü</b> oluşur ve ağ çöker.", label: 'PortFast Arayüzler', type: 'text', validate: 'iface_range', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'PortFast aktif edilecek edge portlar' },
                        { name: 'bpduguard_intfs', why: "BPDU Guard, kullanıcı portuna takılan yetkisiz bir switch'in root'u ele geçirmesini engeller; PortFast'li her portta açılmalıdır, yoksa tek bir masaüstü switch tüm STP topolojisini bozabilir.", label: 'BPDU Guard Arayüzler', type: 'text', validate: 'iface_range', optional: true, placeholder: 'Ethernet1,Ethernet2', hint: 'BPDU Guard aktif edilecek portlar (genellikle PortFast portlarıyla aynı)' }
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
                        { name: 'intf_name', why: "BFD, protokol hello zamanlayıcılarını beklemeden saniyenin altında arıza tespiti sağlar; ancak arayüz adı yanlışsa veya karşı uç BFD çalıştırmıyorsa oturum kurulmaz ve yakınsama yine saniyelerce sürer.", label: 'Arayüz Adı', type: 'text', required: true, placeholder: 'Ethernet1', hint: 'BFD aktif edilecek arayüz' },
                        { name: 'min_tx', why: "Çok agresif TX aralığı (birkaç ms) yoğun CPU'lu veya sanal platformlarda <b>yanlış pozitif</b> link düşmelerine yol açar; her flap tüm routing tablosunun yeniden hesaplanması demektir.", label: 'Min TX (ms)', type: 'text', required: true, placeholder: '300', hint: 'BFD paket gönderme aralığı (ms)' },
                        { name: 'min_rx', why: "Bu değer karşı ucun TX aralığıyla birlikte müzakere edilir; asimetrik ve aşırı düşük değerler kararsız oturumlara ve sürekli komşuluk flap'ine neden olur.", label: 'Min RX (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paket alma aralığı (ms)' },
                        { name: 'multiplier', why: "Arıza süresi yaklaşık <code>interval x multiplier</code> kadardır. 3'ün altına düşürmek tek bir kayıp pakette linki düşürür; çok yüksek vermek ise BFD kullanmanın amacını ortadan kaldırır.", label: 'Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç paket kaybında link down sayılır; toplam süre: min_rx × multiplier' }
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
                        { name: 'server_ip', why: "AAA sunucusuna yönetim ağı üzerinden erişilebilir olmalı; erişilemezse ve yerel yedek kullanıcı tanımlı değilse <b>cihaza tamamen kilitlenirsiniz</b> ve çözüm konsol erişimi gerektirir.", label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'TACACS+ sunucusunun IP adresi' },
                        { name: 'key', why: "Shared key sunucu tarafıyla birebir aynı olmalı; yanlış key'de kimlik doğrulama sessizce başarısız olur ve log'da yalnızca genel bir reddedilme görünür, bu da teşhisi uzatır.", label: 'Shared Key', type: 'text', required: true, placeholder: 'SecretKey123', hint: 'TACACS+ shared secret (cihaz ve sunucuda aynı olmalı)' },
                        { name: 'timeout', why: "Timeout çok uzunsa sunucu erişilemezken her login denemesi dakikalarca bekler; çok kısaysa yavaş yanıt veren sağlıklı bir sunucu bile başarısız sayılır ve kullanıcılar rastgele reddedilir.", label: 'Timeout (sn)', type: 'text', required: true, placeholder: '3', hint: 'TACACS+ yanıt timeout süresi (saniye)' },
                        { name: 'group_name', why: "Grup adı <code>aaa authentication login</code> satırında referans verilen adla aynı olmalı; uyuşmazlıkta EOS gruba hiç başvurmaz ve yalnızca yerel kullanıcılar çalışır.", label: 'Grup Adı', type: 'text', required: true, placeholder: 'TACACS-GROUP', hint: 'AAA server-group referans adı' }
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
                        { name: 'community', why: "SNMPv2c community açık metin gider ve şifre gibidir; <code>public</code> bırakmak cihazın tüm envanter ve topoloji bilgisini ağdaki herkese açar. Mümkünse v3 kullanın ve ACL ile sınırlayın.", label: 'Community', type: 'text', required: true, placeholder: 'PUBLIC-RO', hint: 'Read-only community string' }
                    ]
                },
                {
                    title: 'SNMPv3',
                    icon: 'fas fa-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_username', why: "SNMPv3 kullanıcı adı NMS tarafındaki tanımla aynı olmalı; uyuşmazlıkta sorgular <b>yanıtsız</b> kalır ve izleme sisteminde cihaz down görünür, oysa cihaz sağlıklı çalışmaktadır.", label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmpuser', hint: 'SNMPv3 kullanıcı adı' },
                        { name: 'auth_proto', why: "MD5 artık zayıf kabul edilir, SHA tercih edin. Ayrıca seçilen protokol NMS tarafındakiyle aynı olmalı; değilse authentication failure dışında hiçbir ipucu alamazsınız.", label: 'Auth Protokol', type: 'select', options: [
                            { value: 'md5', label: 'MD5' },
                            { value: 'sha', label: 'SHA', selected: true }
                        ]},
                        { name: 'auth_password', why: "Auth parolası en az 8 karakter olmalı ve NMS ile eşleşmelidir; zayıf parola SNMPv3'ün sağladığı bütünlüğü anlamsızlaştırır ve cihaz bilgisi dışarı sızabilir.", label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123', hint: 'Auth şifresi (min 8 karakter)' },
                        { name: 'priv_proto', why: "Priv protokolü SNMP verisini şifreler; DES yerine AES seçin. Şifreleme kullanılmazsa v2c community'den daha iyi bir gizlilik sağlanmış olmaz.", label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes', label: 'AES', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_password', why: "Şifreleme parolası olmadan <code>priv</code> seviyesi çalışmaz ve SNMPv3 sessizce authNoPriv'e düşer; bu durumda tüm MIB verisi ağ üzerinde açık metin taşınır.", label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Ortak Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trap_host', why: "Trap hedefi yanlışsa cihaz arıza anında kimseye haber veremez; <b>izleme sistemindeki sessizlik</b> sağlıklı sanılır, oysa cihaz saatlerdir sorun bildirmeye çalışıyordur.", label: 'Trap Host', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap alacak monitoring sunucusu' },
                        { name: 'location', why: "Konum bilgisi izleme sisteminde cihazı fiziksel olarak bulmayı sağlar; boş bırakılırsa saha ekibi arızada hangi kabine gideceğini bilemez ve müdahale süresi uzar.", label: 'Konum', type: 'text', optional: true, placeholder: 'DC1-Rack-42', hint: 'Fiziksel konum bilgisi' },
                        { name: 'contact', why: "İletişim alanı cihazın sahibi olan ekibi gösterir; tanımsızsa değişiklik veya arıza anında kimin onay vereceği bilinemez ve işlem gereksiz yere bekler.", label: 'İletişim', type: 'text', optional: true, placeholder: 'noc@company.com', hint: 'NOC iletişim bilgisi' }
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
    const version = data._cgtype || 'v2c';
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
                        { name: 'permit_sources', why: "Yönetim erişimini yalnızca güvenilen yönetim subnetlerine açın; <code>any</code> bırakmak SSH ve eAPI arayüzünü tüm ağa (WAN'a bağlıysa internete) açar ve sürekli brute-force denemesi alırsınız.", label: 'Kaynak Prefix\'ler (virgülle, CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/8,192.168.1.0/24', hint: 'Yönetim erişimine izin verilecek IP blokları' }
                    ]
                },
                {
                    title: 'Servisler',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'protocols', why: "Kullanılmayan protokolleri (telnet, http) kapatmak saldırı yüzeyini küçültür; eAPI açılacaksa <b>mutlaka HTTPS</b> ile ve kaynak kısıtlamasıyla açılmalı, aksi hâlde kimlik bilgileri açık metin gider.", label: 'Protokoller (virgülle)', type: 'text', required: true, placeholder: 'ssh,https,api', hint: 'Desteklenen değerler: ssh, https, api' }
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
        // Sozdizimi: AVD management-api-http.j2 — ACL, vrf alt modunda 'ip access-group' (ip access-list DEGIL)
        c += 'management api http-commands\n   no shutdown\n   vrf default\n      no shutdown\n      ip access-group MGMT-ACCESS\n!\n';
    }
    if (protocols.includes('ssh')) {
        // Sozdizimi: AVD management-ssh.j2 — 'ip access-group <ACL> in'
        c += 'management ssh\n   ip access-group MGMT-ACCESS in\n!\n';
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
                        { name: 'servers', why: "Saat kayması log korelasyonunu, sertifika doğrulamasını ve AAA/Kerberos'u bozar. En az iki sunucu girin; tek sunucu bozulursa cihaz yanlış saate <b>fark edilmeden</b> kilitlenir.", label: 'NTP Sunucular (virgülle)', type: 'text', required: true, placeholder: '10.0.0.1,10.0.0.2', hint: 'NTP sunucu IP adresleri, virgülle ayrılmış' },
                        { name: 'source_intf', why: "Kaynak arayüz sabitlenmezse NTP paketleri rotaya göre değişen adreslerden çıkar; sunucu tarafındaki ACL bu adresleri tanımayıp paketleri düşürür ve senkronizasyon hiç kurulmaz.", label: 'Kaynak Arayüz', type: 'text', validate: 'iface', optional: true, placeholder: 'Management1', hint: 'NTP paketlerinin çıkacağı arayüz' },
                        { name: 'vrf', why: "Yönetim trafiği ayrı bir VRF'teyse (<code>management</code>) VRF belirtilmediğinde paketler varsayılan tabloda dolaşır ve sunucuya hiç ulaşamaz; bu, out-of-band yönetimde sıkça atlanan bir ayrıntıdır.", label: 'VRF', type: 'text', optional: true, placeholder: 'MGMT', hint: 'NTP trafiği için VRF adı (yönetim VRF\'i ise genellikle MGMT)' }
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
                        { name: 'remote_host', why: "Uzak syslog olmadan cihaz yeniden başlatıldığında tüm kanıtlar kaybolur; arızanın kök nedenini bulabilmek için log'un <b>cihaz dışında</b> tutulması şarttır.", label: 'Remote Host', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'Syslog sunucusunun IP adresi' },
                        { name: 'port', why: "Standart dışı bir port seçilirse syslog sunucusunun o portu dinlediğini doğrulayın; ayrıca aradaki güvenlik duvarında ilgili UDP portu açık değilse log'lar sessizce kaybolur.", label: 'Port', type: 'text', validate: 'port', optional: true, placeholder: '514', hint: 'UDP port numarası (varsayılan 514)' },
                        { name: 'facility', why: "Facility, syslog sunucusunda log'ların hangi dosyaya ve kurala düşeceğini belirler; yanlış seçim, log'ların yazılmış ama <b>aranan yerde görünmüyor</b> olmasına yol açar.", label: 'Facility', type: 'select', options: [
                            { value: 'local7', label: 'local7', selected: true },
                            { value: 'local6', label: 'local6' },
                            { value: 'local5', label: 'local5' },
                            { value: 'local4', label: 'local4' }
                        ], hint: 'Syslog facility değeri' },
                        { name: 'level', why: "Seviye çok ayrıntılı (debug) seçilirse sunucu ve WAN gereksiz trafikle dolar, önemli olaylar gürültüde kaybolur; çok dar seçilirse arıza öncesi uyarılar hiç kaydedilmez.", label: 'Log Level', type: 'select', options: [
                            { value: 'informational', label: 'informational', selected: true },
                            { value: 'debugging', label: 'debugging' },
                            { value: 'notifications', label: 'notifications' },
                            { value: 'warnings', label: 'warnings' }
                        ], hint: 'Bu seviye ve üzeri loglar gönderilir' },
                        { name: 'source_intf', why: "Kaynak arayüz sabitlenmezse log'lar farklı kaynak IP'lerle gelir; syslog sunucusunda aynı cihaz birden fazla host gibi görünür, korelasyon ve ACL kuralları bozulur.", label: 'Kaynak Arayüz', type: 'text', validate: 'iface', optional: true, placeholder: 'Management1', hint: 'Syslog paketlerinin çıkacağı arayüz' }
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

// ═════════════════════════════════════════════════════════════════════════════
// Agent U eklemeleri — sözdizimi kaynakları her aracın başında.
// Ortak yardımcı: virgül/boşluk ayrılmış arayüz listesini parçalara böler.
// EOS 'interface Ethernet1-4' aralık biçimini kabul eder; her parça ayrı blok olur.
function cgAristaIfList(s) {
    return String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}

// ── Arista: Static Route ─────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/static-routes.j2
//            (ip route [vrf V] PREFIX [INTF] [NEXTHOP [track bfd]] [DISTANCE] [tag N] [name S])
Arista.staticroute = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Arista EOS — Static Route',
                desc: 'Tek bir statik rota: next-hop IP, çıkış arayüzü veya Null0 (discard). Opsiyonel VRF, administrative distance, tag, isim ve BFD takibi.'
            },
            configTypes: [
                { id: 'nh', label: 'Next-Hop IP', icon: 'fas fa-arrow-right', desc: 'Rota bir komşu IP üzerinden', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'intf_nh', label: 'Arayüz + Next-Hop', icon: 'fas fa-ethernet', desc: 'Çıkış arayüzü ve next-hop birlikte' },
                { id: 'null0', label: 'Null0 (Discard)', icon: 'fas fa-ban', desc: 'Özet/aggregate prefix için kara delik rotası' }
            ],
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'prefix', why: "Hedef ağ CIDR ile yazılır; host bitleri dolu bir prefix (10.1.1.5/24) girilirse EOS onu ağ adresine yuvarlar ve beklediğinizden farklı bir rota görürsünüz.", label: 'Hedef Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.64.0.0/16', hint: 'Hedef ağ, CIDR biçiminde' },
                        { name: 'vrf', why: "VRF belirtilmezse rota varsayılan tabloya girer; hedef ağ bir müşteri/servis VRF'indeyse trafik yanlış tabloda aranır ve düşer.", label: 'VRF', type: 'text', placeholder: 'PROD', hint: 'Boş = default VRF' }
                    ]
                },
                {
                    title: 'Next-Hop',
                    icon: 'fas fa-arrow-right',
                    showFor: ['nh', 'intf_nh'],
                    fields: [
                        { name: 'nexthop', why: "Next-hop doğrudan bağlı bir subnet içinde olmalı; değilse EOS rotayı özyinelemeli çözmeye çalışır ve çözemezse rota tabloya hiç girmez.", label: 'Next-Hop IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.1', hint: 'Komşu router IP adresi' },
                        { name: 'out_intf', why: "Arayüz + next-hop birlikte verildiğinde rota yalnızca o arayüz up iken geçerlidir; yanlış arayüz yazılırsa rota hiç kurulmaz.", label: 'Çıkış Arayüzü', type: 'text', validate: 'iface', requiredIf: { field: '_cgtype', in: ['intf_nh'] }, placeholder: 'Ethernet1', hint: 'Yalnız Arayüz + Next-Hop tipinde kullanılır' },
                        { name: 'track_bfd', why: "BFD takibi açıkken next-hop'a BFD oturumu düşerse rota milisaniyeler içinde çekilir; kapalıyken arayüz up kaldığı sürece ölü bir next-hop'a trafik gönderilmeye devam eder. Karşı uçta BFD açık olmalı.", label: 'BFD ile takip et (track bfd)', type: 'checkbox', checked: false, hint: 'Karşı uçta BFD etkin olmalı' }
                    ]
                },
                {
                    title: 'Opsiyonel Nitelikler',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'distance', why: "Administrative distance statik rotanın dinamik protokollere göre önceliğini belirler; yedek (floating) statik rota için OSPF/BGP'den yüksek bir değer verin, yoksa dinamik rota hiç kullanılmaz.", label: 'Administrative Distance', type: 'text', min: 1, max: 255, placeholder: '200', hint: '1-255; floating static için yüksek değer' },
                        { name: 'tag', why: "Tag, rotayı redistribute ederken route-map ile seçmeyi sağlar; tag olmadan hangi statiklerin dağıtılacağını filtrelemek zorlaşır.", label: 'Tag', type: 'text', validate: 'posint', placeholder: '100', hint: 'Route-map eşleştirmesi için etiket' },
                        { name: 'rname', why: "İsim yalnızca açıklayıcıdır ama <code>show ip route</code> çıktısında rotanın neden var olduğunu anlatır; boşluk içeremez.", label: 'Rota Adı', type: 'text', placeholder: 'TO-DC2', hint: 'Boşluksuz açıklayıcı ad' }
                    ]
                }
            ],
            submit: 'Static Route Oluştur'
        }, (data) => cgAristaStaticRouteGen(data));
    }
};
function cgAristaStaticRouteGen(data) {
    const ty = data._cgtype || 'nh';
    const prefix = cgEsc(data.prefix || ''), vrf = cgEsc(data.vrf || '');
    const nh = cgEsc(data.nexthop || ''), intf = cgEsc(data.out_intf || '');
    const dist = cgEsc(data.distance || ''), tag = cgEsc(data.tag || ''), name = cgEsc(data.rname || '');
    let c = '! ========================================\n! Arista EOS — Static Route\n! ========================================\n\n';
    let r = 'ip route';
    if (vrf) r += ' vrf ' + vrf;
    r += ' ' + prefix;
    if (ty === 'null0') {
        r += ' Null0';
    } else {
        if (ty === 'intf_nh' && intf) r += ' ' + intf;
        r += ' ' + nh;
        if (data.track_bfd) r += ' track bfd';
    }
    if (dist) r += ' ' + dist;
    if (tag) r += ' tag ' + tag;
    if (name) r += ' name ' + name;
    c += r + '\n!\n';
    if (ty !== 'null0' && data.track_bfd) c += '! NOT: track bfd için karşı uçta da BFD etkin olmalı.\n';
    c += '\n! Doğrulama:\n! show ip route' + (vrf ? ' vrf ' + vrf : '') + ' ' + prefix + '\n! show ip route' + (vrf ? ' vrf ' + vrf : '') + ' static\n';
    if (ty !== 'null0' && data.track_bfd) c += '! show bfd peers\n';
    return c;
}

// ── Arista: LLDP ─────────────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/lldp.j2
//            arayüz: ethernet-interfaces.j2 (no lldp transmit / no lldp receive)
//            TLV adları: python-avd/pyavd/_eos_cli_config_gen/schema/schema_fragments/lldp.schema.yml
Arista.lldp = {
    label: 'LLDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Arista EOS — LLDP',
                desc: 'LLDP global ayarları (zamanlayıcılar, yönetim adresi, TLV) ve belirli arayüzlerde LLDP gönderme/almanın kapatılması. EOS\'ta LLDP varsayılan olarak açıktır.'
            },
            sections: [
                {
                    title: 'Global',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'run', why: "LLDP kapatılırsa topoloji keşfi, CloudVision bağlantı haritası ve IP telefon/AP otomatik VLAN ataması (LLDP-MED) çalışmaz. Yalnızca güvenlik politikası gerektiriyorsa kapatın.", label: 'LLDP Durumu', type: 'select', options: [
                            { value: 'on', label: 'Açık (varsayılan)', selected: true },
                            { value: 'off', label: 'Tamamen kapat (no lldp run)' }
                        ]},
                        { name: 'timer', why: "Gönderim aralığı çok kısaysa CPU ve kontrol trafiği artar; çok uzunsa topoloji değişiklikleri geç fark edilir. Hold-time bu değerin katı olmalıdır.", label: 'Timer (sn)', type: 'text', validate: 'posint', placeholder: '30', hint: 'LLDP paket gönderim aralığı' },
                        { name: 'holdtime', why: "Hold-time, komşunun bilgisinin ne kadar süre tutulacağıdır; timer'dan küçük verilirse komşular her döngüde silinip yeniden eklenir ve log'lar dolar.", label: 'Hold-time (sn)', type: 'text', validate: 'posint', placeholder: '120', hint: 'Komşu bilgisinin tutulma süresi' },
                        { name: 'reinit', why: "Bir port LLDP'de kapatılıp açıldığında yeniden başlatma öncesi beklenen süredir; genelde varsayılan yeterlidir.", label: 'Timer Reinitialization (sn)', type: 'text', min: 1, max: 10, placeholder: '2', hint: '1-10 saniye' },
                        { name: 'mgmt_addr', why: "Yönetim adresi TLV'si komşulara hangi arayüzün IP'sini bildireceğinizi belirler; boşsa NMS keşfi yanlış (erişilemeyen) bir adrese yönelebilir.", label: 'Yönetim Adresi Arayüzü', type: 'text', validate: 'iface', placeholder: 'Management1', hint: 'lldp management-address <arayüz>' },
                        { name: 'no_sysdesc', why: "System-description TLV'si EOS sürümünü ve platformu açık metin olarak yayınlar; güvenilmeyen bir segmente bakan portlarda saldırgana sürüm bilgisi verir.", label: 'System-description TLV gönderme', type: 'checkbox', checked: false, hint: 'no lldp tlv transmit system-description' }
                    ]
                },
                {
                    title: 'Arayüz Bazında Kapatma',
                    icon: 'fas fa-ethernet',
                    info: 'Boş bırakılırsa arayüz ayarı yapılmaz. Internet/ISS veya müşteri tarafına bakan portlarda LLDP gönderimini kapatmak iyi bir uygulamadır.',
                    fields: [
                        { name: 'ifaces', why: "Dışa bakan portlarda LLDP açık kalırsa cihaz adı, model ve yönetim IP'si karşı tarafa sızar. Omurga linklerinde ise kapatmak topoloji görünürlüğünü bozar.", label: 'Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'Ethernet47-48', hint: 'Virgülle liste veya aralık: Ethernet1,Ethernet5-8' },
                        { name: 'if_dir', why: "Yalnızca gönderimi kapatmak bilgi sızıntısını önler ama komşuyu görmeye devam edersiniz; her ikisini kapatmak portu LLDP açısından tamamen körleştirir.", label: 'Kapatılacak Yön', type: 'select', options: [
                            { value: 'tx', label: 'Yalnız gönderme (no lldp transmit)', selected: true },
                            { value: 'rx', label: 'Yalnız alma (no lldp receive)' },
                            { value: 'both', label: 'Her ikisi' }
                        ]}
                    ]
                }
            ],
            submit: 'LLDP Konfigürasyonu Oluştur'
        }, (data) => cgAristaLldpGen(data));
    }
};
function cgAristaLldpGen(data) {
    const timer = cgEsc(data.timer || ''), hold = cgEsc(data.holdtime || ''), reinit = cgEsc(data.reinit || '');
    const mgmt = cgEsc(data.mgmt_addr || ''), dir = data.if_dir || 'tx';
    const ifs = cgAristaIfList(cgEsc(data.ifaces || ''));
    let c = '! ========================================\n! Arista EOS — LLDP\n! ========================================\n\n';
    if (data.run === 'off') {
        c += 'no lldp run\n!\n';
    } else {
        if (timer) c += 'lldp timer ' + timer + '\n';
        if (hold) c += 'lldp hold-time ' + hold + '\n';
        if (reinit) c += 'lldp timer reinitialization ' + reinit + '\n';
        if (data.no_sysdesc) c += 'no lldp tlv transmit system-description\n';
        if (mgmt) c += 'lldp management-address ' + mgmt + '\n';
        if (!(timer || hold || reinit || data.no_sysdesc || mgmt || ifs.length)) c += '! Değişiklik yok: LLDP varsayılan ayarlarla açık kalır.\n';
        c += '!\n';
        ifs.forEach(i => {
            c += 'interface ' + i + '\n';
            if (dir === 'tx' || dir === 'both') c += '   no lldp transmit\n';
            if (dir === 'rx' || dir === 'both') c += '   no lldp receive\n';
            c += '!\n';
        });
    }
    c += '\n! Doğrulama:\n! show lldp\n! show lldp neighbors\n! show lldp local-info\n';
    return c;
}

// ── Arista: VRRP / VARP ──────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/vlan-interfaces.j2
//            (vrrp N ipv4 / priority-level / advertisement interval / preempt delay minimum / no vrrp N preempt /
//             peer authentication text|ietf-md5 key-string / ipv4 version; ip virtual-router address)
//            https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/ip-virtual-router-mac-address.j2
Arista.vrrp = {
    label: 'VRRP / VARP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Arista EOS — VRRP / VARP (First-Hop Redundancy)',
                desc: '<b>VRRP</b>: standart aktif/yedek gateway. <b>VARP</b>: Arista\'ya özgü aktif/aktif anycast gateway — MLAG çiftinde her iki switch aynı sanal IP/MAC ile trafiği yerel olarak yönlendirir.'
            },
            configTypes: [
                { id: 'vrrp', label: 'VRRP', icon: 'fas fa-clone', desc: 'Aktif/yedek, çok üreticili uyumlu', badge: { text: 'Standart', cls: 'recommended' } },
                { id: 'varp', label: 'VARP', icon: 'fas fa-network-wired', desc: 'Aktif/aktif (MLAG), yalnız Arista' }
            ],
            sections: [
                {
                    title: 'SVI',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'svi', why: "Gateway yedekliliği L3 arayüz (genellikle <code>Vlan</code> SVI) üzerinde kurulur; VLAN L2'de tanımlı değilse SVI up olmaz ve sanal IP hiç yanıt vermez.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'Vlan10', hint: 'Genellikle Vlan<N>' },
                        { name: 'svi_ip', why: "Her switch'in SVI'sinde kendine ait, sanal adresle aynı subnet'te benzersiz bir IP olmalı; iki switch'te aynı gerçek IP verilirse duplicate address oluşur.", label: 'Bu Cihazın Gerçek IP/Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.128.10.2/24', hint: 'Her switch\'te farklı olmalı' }
                    ]
                },
                {
                    title: 'VRRP',
                    icon: 'fas fa-clone',
                    showFor: ['vrrp'],
                    fields: [
                        { name: 'vrid', why: "VRID aynı segmentteki tüm VRRP üyelerinde aynı, farklı gruplarda farklı olmalı; VRID sanal MAC'i (00:00:5e:00:01:VRID) belirler ve çakışma MAC flapping'e yol açar.", label: 'VRID', type: 'text', min: 1, max: 255, required: true, placeholder: '10', hint: '1-255' },
                        { name: 'vip', why: "Hostların default gateway'i bu adres olur; gerçek SVI IP'leriyle aynı subnet'te olmalı, yoksa VRRP grubu kurulmaz.", label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.10.1', hint: 'Hostların gateway adresi' },
                        { name: 'prio', why: "Yüksek öncelik master olur (varsayılan 100). İki cihazda aynı öncelik varsa yüksek IP kazanır — bu da planlanmamış bir master seçimine yol açabilir.", label: 'Priority', type: 'text', min: 1, max: 254, placeholder: '110', hint: '1-254; master için yüksek değer' },
                        { name: 'adv', why: "Duyuru aralığı tüm grup üyelerinde aynı olmalı; uyumsuzsa yedek cihaz master'ı ölü sanıp devralır ve iki master (split-brain) oluşur.", label: 'Advertisement Interval (sn)', type: 'text', min: 1, max: 255, placeholder: '1', hint: 'Grup üyelerinde aynı olmalı' },
                        { name: 'preempt', why: "Preempt açıkken yüksek öncelikli cihaz geri geldiğinde master rolünü geri alır; açılış sırasında routing henüz yakınsamamışsa kısa bir kara delik oluşabilir, bu yüzden gecikme önerilir.", label: 'Preempt', type: 'select', options: [
                            { value: 'default', label: 'Varsayılan (açık) — satır yazma', selected: true },
                            { value: 'off', label: 'Kapat (no vrrp N preempt)' }
                        ]},
                        { name: 'preempt_delay', why: "Reload sonrası cihaz routing tablosu dolmadan master olursa trafiği düşürür; preempt gecikmesi bu pencereyi kapatır.", label: 'Preempt Delay Minimum (sn)', type: 'text', validate: 'posint', placeholder: '30', hint: 'Yalnız preempt açıkken kullanılır' },
                        { name: 'auth', why: "Kimlik doğrulama sahte VRRP duyurularıyla master rolünün ele geçirilmesini zorlaştırır; tüm üyelerde aynı mod ve anahtar olmalı, değilse grup bölünür.", label: 'Peer Authentication', type: 'select', options: [
                            { value: 'none', label: 'Yok', selected: true },
                            { value: 'md5', label: 'ietf-md5' },
                            { value: 'text', label: 'text (açık metin)' }
                        ]},
                        { name: 'auth_key', why: "Anahtar grup üyelerinde birebir aynı olmalı; text modunda anahtar paket içinde açık gider, yalnız yanlış yapılandırmaya karşı korur.", label: 'Auth Anahtarı', type: 'text', requiredIf: { field: 'auth', in: ['md5', 'text'] }, placeholder: 'VrrpKey1', hint: 'Grup üyelerinde aynı' },
                        { name: 'ver', why: "VRRPv3 (RFC 5798) milisaniye mertebesi aralık ve IPv6 destekler; karşı üretici yalnız v2 destekliyorsa v3 seçmek grubu böler.", label: 'VRRP IPv4 Sürümü', type: 'select', options: [
                            { value: '', label: 'Varsayılan — satır yazma', selected: true },
                            { value: '3', label: '3' },
                            { value: '2', label: '2' }
                        ]}
                    ]
                },
                {
                    title: 'VARP',
                    icon: 'fas fa-network-wired',
                    showFor: ['varp'],
                    info: 'VARP\'ta sanal MAC global tanımlanır ve MLAG çiftindeki iki switch\'te <b>aynı</b> olmalıdır.',
                    fields: [
                        { name: 'varp_mac', why: "Sanal router MAC'i MLAG çiftinin her iki üyesinde aynı olmalı; farklıysa hostların ARP önbelleği hangi switch'e düştüğüne göre değişir ve trafik aralıklı kesilir.", label: 'Virtual-Router MAC', type: 'text', validate: 'mac', required: true, placeholder: '00:1c:73:00:00:99', hint: 'Unicast, yerel yönetimli bir MAC seçin' },
                        { name: 'varp_ip', why: "Hostların gateway'i bu adrestir ve iki switch'te aynı yazılır; SVI'nin gerçek IP'siyle aynı subnet'te olmalıdır.", label: 'Virtual-Router Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.128.10.1', hint: 'ip virtual-router address' }
                    ]
                }
            ],
            submit: 'Gateway Yedekliliği Oluştur'
        }, (data) => cgAristaVrrpGen(data));
    }
};
function cgAristaVrrpGen(data) {
    const ty = data._cgtype || 'vrrp';
    const svi = cgEsc(data.svi || ''), sviIp = cgEsc(data.svi_ip || '');
    let c = '! ========================================\n! Arista EOS — ' + (ty === 'varp' ? 'VARP' : 'VRRP') + '\n! ========================================\n\n';
    if (ty === 'varp') {
        const mac = cgEsc(data.varp_mac || ''), vip = cgEsc(data.varp_ip || '');
        c += 'ip virtual-router mac-address ' + mac + '\n!\n';
        c += 'interface ' + svi + '\n   ip address ' + sviIp + '\n   ip virtual-router address ' + vip + '\n!\n';
        c += '! NOT: Aynı MAC ve sanal adres MLAG eşinde de yazılmalı; gerçek IP her switch\'te farklı olmalı.\n';
        c += '\n! Doğrulama:\n! show ip virtual-router\n! show interfaces ' + svi + '\n';
        return c;
    }
    const id = cgEsc(data.vrid || ''), vip = cgEsc(data.vip || ''), prio = cgEsc(data.prio || ''), adv = cgEsc(data.adv || '');
    const pdelay = cgEsc(data.preempt_delay || ''), auth = data.auth || 'none', key = cgEsc(data.auth_key || ''), ver = cgEsc(data.ver || '');
    c += 'interface ' + svi + '\n   ip address ' + sviIp + '\n';
    if (prio) c += '   vrrp ' + id + ' priority-level ' + prio + '\n';
    if (adv) c += '   vrrp ' + id + ' advertisement interval ' + adv + '\n';
    if (data.preempt === 'off') c += '   no vrrp ' + id + ' preempt\n';
    else if (pdelay) c += '   vrrp ' + id + ' preempt delay minimum ' + pdelay + '\n';
    if (auth === 'md5' && key) c += '   vrrp ' + id + ' peer authentication ietf-md5 key-string ' + key + '\n';
    if (auth === 'text' && key) c += '   vrrp ' + id + ' peer authentication text ' + key + '\n';
    c += '   vrrp ' + id + ' ipv4 ' + vip + '\n';
    if (ver) c += '   vrrp ' + id + ' ipv4 version ' + ver + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show vrrp\n! show vrrp brief\n';
    return c;
}

// ── Arista: Port Mirroring (Monitor Session) ─────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/monitor-sessions.j2
//            (monitor session NAME source IF [rx|tx|both] / monitor session NAME destination IF)
Arista.monitor = {
    label: 'Port Mirroring (SPAN)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-copy',
                title: 'Arista EOS — Port Mirroring (Monitor Session)',
                desc: 'Kaynak port(lar)daki trafiğin bir kopyasını analiz cihazının bağlı olduğu hedef porta gönderir (IDS, paket yakalama, NPM).'
            },
            sections: [
                {
                    title: 'Oturum',
                    icon: 'fas fa-copy',
                    fields: [
                        { name: 'sess', why: "Oturum adı kaynak ve hedef satırlarını bağlar; iki farklı oturuma aynı hedef port verilirse EOS ikincisini reddeder veya hedef bir oturumdan düşer.", label: 'Oturum Adı', type: 'text', required: true, placeholder: 'SPAN1', hint: 'Boşluksuz ad' },
                        { name: 'src', why: "Kaynak portların toplam trafiği hedef portun hızını aşarsa kopyalar sessizce düşer ve analiz eksik kalır; ör. iki 10G porttan 1G hedefe yansıtma kayıplıdır.", label: 'Kaynak Arayüz(ler)', type: 'text', validate: 'iface_range', required: true, placeholder: 'Ethernet1-2', hint: 'Virgülle liste veya aralık' },
                        { name: 'dir', why: "Her iki yön seçildiğinde kopya trafik ikiye katlanır; yalnız gelen (rx) veya giden (tx) trafik gerekiyorsa yönü daraltmak hedef portu rahatlatır.", label: 'Yön', type: 'select', options: [
                            { value: 'both', label: 'both (her iki yön)', selected: true },
                            { value: 'rx', label: 'rx (gelen)' },
                            { value: 'tx', label: 'tx (giden)' }
                        ]},
                        { name: 'dst', why: "Hedef port monitor oturumuna alındığında normal switching'den çıkar ve üzerindeki mevcut bağlantı kesilir; kullanıcı veya uplink portu yazmak kesintiye yol açar.", label: 'Hedef Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet48', hint: 'Analiz cihazının bağlı olduğu port' }
                    ]
                }
            ],
            submit: 'Monitor Session Oluştur'
        }, (data) => cgAristaMonitorGen(data));
    }
};
function cgAristaMonitorGen(data) {
    const s = cgEsc(data.sess || ''), dir = cgEsc(data.dir || 'both'), dst = cgEsc(data.dst || '');
    const srcs = cgAristaIfList(cgEsc(data.src || ''));
    let c = '! ========================================\n! Arista EOS — Port Mirroring\n! ========================================\n\n';
    srcs.forEach(x => { c += 'monitor session ' + s + ' source ' + x + ' ' + dir + '\n'; });
    c += 'monitor session ' + s + ' destination ' + dst + '\n!\n';
    c += '! UYARI: Hedef port (' + dst + ') normal switching\'den çıkar; üzerindeki bağlantı kesilir.\n';
    c += '\n! Doğrulama:\n! show monitor session ' + s + '\n! show interfaces ' + dst + ' counters\n';
    return c;
}

// ── Arista: sFlow ────────────────────────────────────────────────────────────
// Sözdizimi: https://www.arista.com/en/um-eos/eos-sflow
//            https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/sflow.j2
Arista.sflow = {
    label: 'sFlow',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-stream',
                title: 'Arista EOS — sFlow',
                desc: 'Örneklenmiş paket ve arayüz sayaçlarını sFlow collector\'a gönderir (trafik analizi, top-talker, DDoS tespiti). sFlow çalışınca tüm Ethernet/Port-Channel arayüzleri varsayılan olarak örneklenir.'
            },
            sections: [
                {
                    title: 'Collector',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'coll', why: "Collector erişilemezse örnekler sessizce kaybolur; cihaz tarafında hata görünmez. Collector'ın bu cihazın kaynak IP'sini kabul ettiğinden emin olun.", label: 'Collector IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'sFlow collector adresi' },
                        { name: 'cport', why: "Varsayılan UDP 6343'tür; collector farklı bir portu dinliyorsa buraya yazın, aksi hâlde paketler karşıda reddedilir.", label: 'UDP Port', type: 'text', validate: 'port', placeholder: '6343', hint: 'Boş = 6343' },
                        { name: 'svrf', why: "Collector yönetim VRF'i üzerinden erişiliyorsa VRF belirtilmeli; belirtilmezse paketler default tabloda yönlendirilir ve collector'a ulaşmaz.", label: 'VRF', type: 'text', placeholder: 'MGMT', hint: 'Boş = default VRF' },
                        { name: 'ssrc', why: "Kaynak arayüz sabitlenmezse sFlow datagramlarındaki agent adresi değişebilir; collector aynı cihazı birden fazla ajan olarak görür.", label: 'Kaynak Arayüz', type: 'text', validate: 'iface', placeholder: 'Loopback0', hint: 'sflow [vrf V] source-interface' }
                    ]
                },
                {
                    title: 'Örnekleme',
                    icon: 'fas fa-percentage',
                    fields: [
                        { name: 'rate', why: "Örnekleme oranı 1/N'dir; N küçüldükçe CPU yükü artar. EOS 16384 altındaki oranlar için <code>dangerous</code> anahtarını ister — bu araç o yüzden 16384 altını kabul etmez.", label: 'Sample Rate (1/N)', type: 'text', min: 16384, max: 16777215, placeholder: '16384', hint: 'Boş = EOS varsayılanı (1048576)' },
                        { name: 'poll', why: "Sayaç yoklama aralığı arayüz istatistiklerinin collector'a ne sıklıkla gideceğini belirler; 0 sayaç örneklemeyi kapatır.", label: 'Polling Interval (sn)', type: 'text', min: 0, max: 3600, placeholder: '10', hint: '0-3600; varsayılan 2' },
                        { name: 'noif', why: "Uplink'ler gibi zaten başka bir yerde örneklenen portlarda sFlow'u kapatmak çift sayımı önler.", label: 'sFlow Kapatılacak Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'Ethernet49-50', hint: 'no sflow enable' }
                    ]
                }
            ],
            submit: 'sFlow Oluştur'
        }, (data) => cgAristaSflowGen(data));
    }
};
function cgAristaSflowGen(data) {
    const coll = cgEsc(data.coll || ''), port = cgEsc(data.cport || ''), vrf = cgEsc(data.svrf || ''), src = cgEsc(data.ssrc || '');
    const rate = cgEsc(data.rate || ''), poll = cgEsc(data.poll || '');
    const noif = cgAristaIfList(cgEsc(data.noif || ''));
    let c = '! ========================================\n! Arista EOS — sFlow\n! ========================================\n\n';
    if (rate) c += 'sflow sample ' + rate + '\n';
    if (poll) c += 'sflow polling-interval ' + poll + '\n';
    if (vrf) {
        c += 'sflow vrf ' + vrf + ' destination ' + coll + (port ? ' ' + port : '') + '\n';
        if (src) c += 'sflow vrf ' + vrf + ' source-interface ' + src + '\n';
    } else {
        c += 'sflow destination ' + coll + (port ? ' ' + port : '') + '\n';
        if (src) c += 'sflow source-interface ' + src + '\n';
    }
    c += 'sflow run\n!\n';
    noif.forEach(i => { c += 'interface ' + i + '\n   no sflow enable\n!\n'; });
    c += '\n! Doğrulama:\n! show sflow\n! show sflow interfaces\n';
    return c;
}

// ── Arista: VRF ──────────────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/vrfs.j2
//            ip-routing-vrfs.j2 (ip routing vrf V), ethernet-interfaces.j2 / vlan-interfaces.j2 (vrf V + ip address)
Arista.vrf = {
    label: 'VRF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Arista EOS — VRF',
                desc: 'VRF oluşturma, VRF içinde IPv4 routing\'i açma ve bir L3 arayüzü VRF\'e bağlama. EVPN/BGP ile kullanılacaksa RD de verilebilir.'
            },
            sections: [
                {
                    title: 'VRF Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vname', why: "VRF adı büyük/küçük harfe duyarlıdır ve BGP, statik rota, NTP gibi tüm referanslarda aynı yazılmalı; farklı yazım yeni, boş bir VRF anlamına gelir.", label: 'VRF Adı', type: 'text', required: true, placeholder: 'PROD', hint: 'Boşluksuz' },
                        { name: 'vdesc', why: "Açıklama VRF'in hangi servise/müşteriye ait olduğunu belgeler; çok sayıda VRF olan cihazlarda yanlış VRF'te değişiklik yapma riskini azaltır.", label: 'Açıklama', type: 'text', placeholder: 'Production', hint: 'VRF açıklaması' },
                        { name: 'vrd', why: "RD, aynı prefix'in farklı VRF'lerde BGP tarafından ayırt edilmesini sağlar; yalnızca MP-BGP/EVPN kullanılıyorsa gerekir ve her VRF için benzersiz olmalıdır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', placeholder: '65000:100', hint: 'Yalnız BGP/EVPN için' },
                        { name: 'vrouting', why: "EOS'ta VRF içinde routing ayrıca açılmazsa arayüzler IP alır ama VRF'ler arası/uzak ağlara yönlendirme yapılmaz; statik ve dinamik rotalar çalışmaz.", label: 'ip routing vrf', type: 'checkbox', checked: true, hint: 'VRF içinde IPv4 yönlendirmeyi aç' }
                    ]
                },
                {
                    title: 'Arayüz Ataması',
                    icon: 'fas fa-ethernet',
                    info: 'Opsiyonel. Arayüz VRF\'e alındığında <b>mevcut IP adresi silinir</b>; bu yüzden IP adresi <code>vrf</code> satırından sonra yeniden yazılır.',
                    fields: [
                        { name: 'vif', why: "Arayüz VRF'e taşındığında üzerindeki IP ve komşuluklar (OSPF/BGP) düşer; yönetim bağlantınız bu arayüzden geçiyorsa oturum kopar.", label: 'Arayüz', type: 'text', validate: 'iface', placeholder: 'Vlan100', hint: 'Ethernet/Port-Channel ise no switchport eklenir' },
                        { name: 'vip', why: "VRF'e alındıktan sonra IP yeniden verilmezse arayüz IP'siz kalır; bu alan boşsa yalnızca VRF ataması yapılır.", label: 'IP / Prefix', type: 'text', validate: 'cidr', placeholder: '10.64.0.1/24', hint: 'Arayüz verilmediyse yok sayılır' }
                    ]
                }
            ],
            submit: 'VRF Oluştur'
        }, (data) => cgAristaVrfGen(data));
    }
};
function cgAristaVrfGen(data) {
    const n = cgEsc(data.vname || ''), d = cgEsc(data.vdesc || ''), rd = cgEsc(data.vrd || '');
    const iface = cgEsc(data.vif || ''), ip = cgEsc(data.vip || '');
    let c = '! ========================================\n! Arista EOS — VRF\n! ========================================\n\n';
    c += 'vrf instance ' + n + '\n';
    if (d) c += '   description ' + d + '\n';
    if (rd) c += '   rd ' + rd + '\n';
    c += '!\n';
    if (data.vrouting) c += 'ip routing vrf ' + n + '\n!\n';
    if (iface) {
        c += 'interface ' + iface + '\n';
        if (/^(ethernet|port-channel)/i.test(iface)) c += '   no switchport\n';
        c += '   vrf ' + n + '\n';
        if (ip) c += '   ip address ' + ip + '\n';
        c += '!\n';
    }
    c += '\n! Doğrulama:\n! show vrf ' + n + '\n! show ip route vrf ' + n + '\n';
    if (iface) c += '! show ip interface brief vrf ' + n + '\n';
    return c;
}

// ── Arista: Yerel Kullanıcı & Rol ────────────────────────────────────────────
// Sözdizimi: https://www.arista.com/en/um-eos/eos-user-security (username ... secret 0|sha512, role, network-admin/operator)
//            https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/local-users.j2
//            https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/roles.j2
//            RBAC etkinleştirme: aaa authorization commands all default local (EOS User Security)
Arista.localuser = {
    label: 'Yerel Kullanıcı & Rol',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-cog',
                title: 'Arista EOS — Yerel Kullanıcı & Rol (RBAC)',
                desc: 'Yerel kullanıcı hesabı, yetki seviyesi, rol ve SSH anahtarı. İsteğe bağlı olarak basit bir özel rol tanımlanır. AAA sunucusu çöktüğünde erişimin yedeği yerel kullanıcıdır.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Kullanıcı',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'uname', why: "Varsayılan <code>admin</code> hesabı her EOS'ta vardır ve saldırganların ilk denediği addır; kişiye özel bir hesap açıp admin'i kapatmak denetim izini de netleştirir.", label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin', hint: 'Boşluksuz' },
                        { name: 'priv', why: "Privilege 15 enable moduna doğrudan girer. Yerel EXEC yetkilendirmesinde başlangıç seviyesini belirler; operatör hesaplarına 15 vermek gereksiz yetki demektir.", label: 'Privilege', type: 'text', min: 0, max: 15, required: true, placeholder: '15', hint: '0-15' },
                        { name: 'urole', why: "Rol, kullanıcının hangi komutları çalıştırabileceğini belirler; ancak <code>aaa authorization commands all default local</code> yoksa rol uygulanmaz ve kullanıcı privilege'ına göre her şeyi yapabilir.", label: 'Rol', type: 'select', options: [
                            { value: 'network-operator', label: 'network-operator (salt okunur)', selected: true },
                            { value: 'network-admin', label: 'network-admin (tam yetki)' },
                            { value: 'custom', label: 'Özel rol (aşağıda tanımla)' }
                        ]},
                        { name: 'ptype', why: "Açık metin parola EOS'ta kaydedilirken hash'lenir ama bu çıktıyı paylaşırsanız parola görünür; sha512 hash vermek daha güvenlidir. nopassword yalnızca SSH anahtarlı hesaplar içindir.", label: 'Parola Biçimi', type: 'select', options: [
                            { value: 'clear', label: 'Açık metin (secret 0)', selected: true },
                            { value: 'sha512', label: 'SHA-512 hash (secret sha512)' },
                            { value: 'none', label: 'Parolasız (nopassword) — yalnız SSH anahtarı' }
                        ]},
                        { name: 'upass', why: "Zayıf parolalı bir yerel hesap, AAA sunucusu erişilemezken tüm cihazın anahtarıdır. SHA-512 seçildiyse buraya <b>hash</b> girin (başka bir EOS'ta aynı kullanıcı adıyla üretilmiş).", label: 'Parola / Hash', type: 'text', requiredIf: { field: 'ptype', in: ['clear', 'sha512'] }, placeholder: 'Str0ngP@ss!', hint: 'Seçilen biçime göre açık metin veya hash' },
                        { name: 'sshkey', why: "Anahtarlı giriş parola tahminini imkânsız kılar; nopassword seçildiyse bu alan boşsa kullanıcı hiç giriş yapamaz.", label: 'SSH Public Key', type: 'text', requiredIf: { field: 'ptype', in: ['none'] }, placeholder: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKeyOnly user@host', hint: 'Tek satır OpenSSH public key' }
                    ]
                },
                {
                    title: 'Özel Rol',
                    icon: 'fas fa-user-tag',
                    info: 'Yalnızca "Özel rol" seçildiğinde kullanılır. Komutlar düzenli ifade (regex) ile eşlenir; kurallar sıra numarasına göre değerlendirilir.',
                    fields: [
                        { name: 'rname', why: "Rol adı <code>username ... role</code> satırıyla aynı olmalı; tanımsız bir rol atanırsa kullanıcı beklenmedik biçimde reddedilir.", label: 'Rol Adı', type: 'text', requiredIf: { field: 'urole', in: ['custom'] }, placeholder: 'NOC-RO', hint: 'Boşluksuz' },
                        { name: 'rmode', why: "Mod, kuralın hangi CLI bağlamında geçerli olduğunu belirler; <code>exec</code> yalnız exec komutlarını, <code>config-all</code> tüm config alt modlarını kapsar.", label: 'İzin Modu', type: 'select', options: [
                            { value: 'exec', label: 'exec', selected: true },
                            { value: 'config', label: 'config' },
                            { value: 'config-all', label: 'config-all' }
                        ]},
                        { name: 'rpermit', why: "Çok geniş bir regex (<code>.*</code>) rolü network-admin'e eşitler; yalnız gereken komut kalıbını yazın.", label: 'İzin Verilen Komut (regex)', type: 'text', requiredIf: { field: 'urole', in: ['custom'] }, placeholder: 'show.*', hint: '10 permit mode <mod> command <regex>' },
                        { name: 'rdeny', why: "Açık bir deny kuralı, izin kuralının istemeden kapsadığı tehlikeli komutları (ör. reload) engellemek için kullanılır; permit'ten önce değerlendirilmesi için düşük sıra numarası alır.", label: 'Yasaklanan Komut (regex)', type: 'text', placeholder: 'reload.*', hint: '5 deny mode exec command <regex>' }
                    ]
                },
                {
                    title: 'RBAC Etkinleştirme',
                    icon: 'fas fa-shield-alt',
                    warn: 'TACACS+ kullanıyorsanız bu satırı buradan eklemeyin; AAA / TACACS+ aracı zaten <code>aaa authorization commands all default group ... local</code> yazar. İki satır birbirini ezer.',
                    fields: [
                        { name: 'rbac', why: "Bu satır olmadan roller yalnızca kayıttır ve uygulanmaz. Açıldığında yanlış rol atanmış hesaplar komut çalıştıramaz; önce konsol erişiminizin olduğundan emin olun.", label: 'aaa authorization commands all default local', type: 'checkbox', checked: false, hint: 'Yerel rol denetimini aç' }
                    ]
                }
            ],
            submit: 'Kullanıcı Oluştur'
        }, (data) => cgAristaLocalUserGen(data));
    }
};
function cgAristaLocalUserGen(data) {
    const u = cgEsc(data.uname || ''), priv = cgEsc(data.priv || ''), ptype = data.ptype || 'clear';
    const pass = cgEsc(data.upass || ''), key = cgEsc(data.sshkey || '');
    const custom = data.urole === 'custom';
    const rname = cgEsc(data.rname || ''), rmode = cgEsc(data.rmode || 'exec'), rp = cgEsc(data.rpermit || ''), rd = cgEsc(data.rdeny || '');
    const role = custom ? rname : cgEsc(data.urole || 'network-operator');
    let c = '! ========================================\n! Arista EOS — Yerel Kullanıcı & Rol\n! ========================================\n\n';
    if (custom && rname) {
        c += 'role ' + rname + '\n';
        if (rd) c += '   5 deny mode exec command ' + rd + '\n';
        if (rp) c += '   10 permit mode ' + rmode + ' command ' + rp + '\n';
        c += '!\n';
    }
    let l = 'username ' + u + ' privilege ' + priv;
    if (role) l += ' role ' + role;
    if (ptype === 'clear' && pass) l += ' secret 0 ' + pass;
    else if (ptype === 'sha512' && pass) l += ' secret sha512 ' + pass;
    else if (ptype === 'none') l += ' nopassword';
    c += l + '\n';
    if (key) c += 'username ' + u + ' ssh-key ' + key + '\n';
    c += '!\n';
    if (data.rbac) c += 'aaa authorization commands all default local\n!\n';
    if (ptype === 'none' && !key) c += '! UYARI: Parolasız hesapta SSH anahtarı yok; bu kullanıcı giriş yapamaz.\n';
    c += '\n! Doğrulama:\n! show users accounts\n! show users roles\n! show running-config section username\n';
    return c;
}

// ── Arista: Sistem (Hostname, DNS, Banner) ───────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/hostname.j2
//            dns-domain.j2 (dns domain), ip-name-server.j2 (ip name-server vrf V ADDR),
//            ip-domain-lookup.j2 (ip domain lookup [vrf V] source-interface IF), banners.j2 (banner login|motd ... EOF)
Arista.system = {
    label: 'Sistem (Hostname/DNS/Banner)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-id-card',
                title: 'Arista EOS — Hostname, DNS ve Banner',
                desc: 'Cihaz adı, DNS alan adı ve name-server\'lar, DNS sorgu kaynak arayüzü ile login/MOTD banner\'ları.'
            },
            sections: [
                {
                    title: 'Kimlik',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'hn', why: "Hostname prompt'ta, syslog'da ve SSH host anahtarı üretiminde kullanılır; <code>localhost</code> kalan cihazlarda log korelasyonu ve CloudVision eşleştirmesi bozulur.", label: 'Hostname', type: 'text', validate: 'hostname', required: true, placeholder: 'LEAF-SW1', hint: 'Harf, rakam, tire' },
                        { name: 'dom', why: "Alan adı FQDN oluşturur ve kısa adların çözümlenmesinde eklenir; sertifika ve SSH known_hosts eşleşmeleri FQDN'e dayanır.", label: 'DNS Alan Adı', type: 'text', placeholder: 'example.net', hint: 'dns domain' }
                    ]
                },
                {
                    title: 'DNS Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ns1', why: "DNS yoksa NTP/syslog/AAA sunucuları ad ile yazıldığında çözülemez ve servisler sessizce çalışmaz. İki sunucu verin; biri düşerse ikincisi kullanılır.", label: 'Name-Server 1', type: 'text', validate: 'ip', placeholder: '10.0.0.53', hint: 'Birincil DNS' },
                        { name: 'ns2', why: "Tek DNS sunucusu tek hata noktasıdır; ikinci sunucu farklı bir lokasyonda olmalı.", label: 'Name-Server 2', type: 'text', validate: 'ip', placeholder: '10.0.1.53', hint: 'İkincil DNS' },
                        { name: 'nsvrf', why: "DNS sunucusuna yönetim VRF'inden erişiliyorsa VRF doğru verilmeli; default VRF'te aranan sunucuya paket hiç ulaşmaz.", label: 'DNS VRF', type: 'text', placeholder: 'MGMT', hint: 'Boş = default' },
                        { name: 'nssrc', why: "Kaynak arayüz sabitlenmezse DNS sorguları rotaya göre değişen IP'lerden çıkar; DNS sunucusundaki ACL bunları reddedebilir.", label: 'DNS Kaynak Arayüzü', type: 'text', validate: 'iface', placeholder: 'Management1', hint: 'ip domain lookup source-interface' }
                    ]
                },
                {
                    title: 'Banner',
                    icon: 'fas fa-flag',
                    info: 'Her satır olduğu gibi yazılır; EOS banner metnini <code>EOF</code> satırıyla bitirir, bu yüzden metin içinde tek başına <code>EOF</code> satırı olamaz (otomatik atılır).',
                    fields: [
                        { name: 'blogin', why: "Login banner yetkisiz erişim uyarısıdır; birçok hukuk sisteminde uyarı yoksa izinsiz girişin kovuşturulması zorlaşır. Banner'da cihaz modeli, sürüm veya kurum içi bilgi vermeyin.", label: 'Login Banner', type: 'textarea', rows: 4, placeholder: 'Yetkisiz erisim yasaktir.\nTum islemler kayit altindadir.', hint: 'Giriş öncesi gösterilir' },
                        { name: 'bmotd', why: "MOTD girişten sonra gösterilir; bakım penceresi, sorumlu ekip gibi operasyonel notlar için uygundur.", label: 'MOTD Banner', type: 'textarea', rows: 3, placeholder: 'Bakim: her Pazar 02:00-04:00', hint: 'Giriş sonrası gösterilir' }
                    ]
                }
            ],
            submit: 'Sistem Ayarlarını Oluştur'
        }, (data) => cgAristaSystemGen(data));
    }
};
function cgAristaBannerBody(s) {
    return String(s || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() !== 'EOF');
}
function cgAristaSystemGen(data) {
    const hn = cgEsc(data.hn || ''), dom = cgEsc(data.dom || '');
    const ns = [cgEsc(data.ns1 || ''), cgEsc(data.ns2 || '')].filter(Boolean);
    const vrf = cgEsc(data.nsvrf || ''), src = cgEsc(data.nssrc || '');
    const bl = cgAristaBannerBody(cgEsc(data.blogin || '')), bm = cgAristaBannerBody(cgEsc(data.bmotd || ''));
    let c = '! ========================================\n! Arista EOS — Hostname, DNS, Banner\n! ========================================\n\n';
    c += 'hostname ' + hn + '\n';
    if (dom) c += 'dns domain ' + dom + '\n';
    ns.forEach(n => { c += 'ip name-server vrf ' + (vrf || 'default') + ' ' + n + '\n'; });
    if (src) c += 'ip domain lookup' + (vrf ? ' vrf ' + vrf : '') + ' source-interface ' + src + '\n';
    c += '!\n';
    if (bl.some(l => l.trim())) c += 'banner login\n' + bl.join('\n') + '\nEOF\n!\n';
    if (bm.some(l => l.trim())) c += 'banner motd\n' + bm.join('\n') + '\nEOF\n!\n';
    c += '\n! Doğrulama:\n! show hostname\n! show ip name-server\n! show running-config section banner\n';
    return c;
}

// ── Arista: SSH Sıkılaştırma ─────────────────────────────────────────────────
// Sözdizimi: https://www.arista.com/en/um-eos/eos-session-management-commands (cipher/key-exchange/mac değer listeleri,
//            idle-timeout 0-86400 dk, connection limit/per-host, authentication protocol)
//            https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/management-ssh.j2
Arista.sshharden = {
    label: 'SSH Sıkılaştırma',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'Arista EOS — SSH Sıkılaştırma',
                desc: '<code>management ssh</code> altında boşta kalma zaman aşımı, bağlantı sınırları, kimlik doğrulama yöntemleri ve zayıf algoritmaların (CBC, SHA-1, group1) dışlanması.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Oturum',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'idle', why: "Zaman aşımı yoksa açık bırakılan bir terminal günlerce yetkili oturum olarak kalır; 0 zaman aşımını kapatır.", label: 'Idle-timeout (dakika)', type: 'text', min: 0, max: 86400, required: true, placeholder: '15', hint: '0 = kapalı' },
                        { name: 'climit', why: "Toplam oturum sınırı, brute-force veya kaçak script'lerin tüm VTY'leri doldurup meşru yöneticiyi dışarıda bırakmasını önler.", label: 'Connection Limit', type: 'text', min: 1, max: 100, placeholder: '10', hint: '1-100' },
                        { name: 'phost', why: "Tek kaynaktan açılabilecek oturum sayısını sınırlamak, tek bir istemcinin tüm kapasiteyi tüketmesini engeller.", label: 'Connection Per-Host', type: 'text', min: 1, max: 20, placeholder: '3', hint: '1-20' },
                        { name: 'authp', why: "Yalnız public-key izin vermek parola tahmini saldırılarını tamamen keser, ancak anahtarı olmayan yöneticiler (ve AAA parolası kullananlar) giremez.", label: 'Kimlik Doğrulama Yöntemleri', type: 'select', options: [
                            { value: '', label: 'Değiştirme (EOS varsayılanı)', selected: true },
                            { value: 'public-key password', label: 'public-key + password' },
                            { value: 'public-key', label: 'Yalnız public-key' }
                        ]}
                    ]
                },
                {
                    title: 'Algoritmalar',
                    icon: 'fas fa-lock',
                    warn: 'Sıkı algoritma listesi eski SSH istemcilerini (eski PuTTY, eski otomasyon kütüphaneleri) dışarıda bırakabilir. Değişiklikten önce ikinci bir oturum açık tutun.',
                    fields: [
                        { name: 'ciph', why: "CBC modlu şifreler ve arcfour/3des zayıf kabul edilir; CTR modlu AES tüm güncel istemcilerde desteklenir.", label: 'Cipher', type: 'select', options: [
                            { value: '', label: 'Değiştirme (EOS varsayılanı)' },
                            { value: 'aes256-ctr aes192-ctr aes128-ctr', label: 'Yalnız AES-CTR', selected: true }
                        ]},
                        { name: 'kex', why: "diffie-hellman-group1-sha1 ve SHA-1 tabanlı değişimler kırılabilir kabul edilir; eğri tabanlı ve group14/16-sha2 yöntemleri önerilir.", label: 'Key-Exchange', type: 'select', options: [
                            { value: '', label: 'Değiştirme (EOS varsayılanı)' },
                            { value: 'curve25519-sha256 ecdh-sha2-nistp384 ecdh-sha2-nistp256 diffie-hellman-group16-sha512 diffie-hellman-group14-sha256', label: 'Güçlü (curve25519, ECDH, DH14/16-SHA2)', selected: true }
                        ]},
                        { name: 'macs', why: "hmac-md5 ve hmac-sha1 bütünlük koruması için artık önerilmez; SHA-2 tabanlı MAC'ler yeterlidir.", label: 'MAC', type: 'select', options: [
                            { value: '', label: 'Değiştirme (EOS varsayılanı)' },
                            { value: 'hmac-sha2-512 hmac-sha2-256', label: 'Yalnız HMAC-SHA2', selected: true }
                        ]}
                    ]
                }
            ],
            submit: 'SSH Ayarlarını Oluştur'
        }, (data) => cgAristaSshHardenGen(data));
    }
};
function cgAristaSshHardenGen(data) {
    const idle = cgEsc(data.idle || ''), lim = cgEsc(data.climit || ''), ph = cgEsc(data.phost || '');
    const authp = cgEsc(data.authp || ''), ciph = cgEsc(data.ciph || ''), kex = cgEsc(data.kex || ''), macs = cgEsc(data.macs || '');
    let c = '! ========================================\n! Arista EOS — SSH Sıkılaştırma\n! ========================================\n\n';
    c += '! UYARI: Uygulamadan önce ikinci bir SSH/konsol oturumu açık tutun.\n';
    c += 'management ssh\n';
    c += '   idle-timeout ' + idle + '\n';
    if (authp) c += '   authentication protocol ' + authp + '\n';
    if (ciph) c += '   cipher ' + ciph + '\n';
    if (kex) c += '   key-exchange ' + kex + '\n';
    if (macs) c += '   mac ' + macs + '\n';
    if (lim) c += '   connection limit ' + lim + '\n';
    if (ph) c += '   connection per-host ' + ph + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show management ssh\n! show running-config section management ssh\n';
    return c;
}

// ── Arista: Management API (eAPI) ────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/management-api-http.j2
//            https://www.arista.com/en/um-eos/eos-session-management-commands (protocol http|https, shutdown, vrf)
Arista.eapi = {
    label: 'Management API (eAPI)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'Arista EOS — Management API (eAPI)',
                desc: 'JSON-RPC tabanlı eAPI\'yi yalnız HTTPS üzerinden açar (Ansible, AVD, CloudVision dışı otomasyon için) veya tamamen kapatır. Kaynak kısıtlaması için önce bir IP access-list tanımlayın (ACL / Management ACL aracı).'
            },
            configTypes: [
                { id: 'on', label: 'Etkinleştir (HTTPS)', icon: 'fas fa-lock', desc: 'Yalnız HTTPS, isteğe bağlı VRF ve ACL', badge: { text: 'Güvenli', cls: 'security' } },
                { id: 'off', label: 'Kapat', icon: 'fas fa-power-off', desc: 'eAPI kullanılmıyorsa saldırı yüzeyini kaldır' }
            ],
            sections: [
                {
                    title: 'eAPI',
                    icon: 'fas fa-plug',
                    showFor: ['on'],
                    fields: [
                        { name: 'avrf', why: "eAPI hangi VRF'te dinleyecekse orada <code>no shutdown</code> edilmeli; yönetim VRF'i kullanılıyorsa default VRF'te açmak API'yi veri düzlemine açar.", label: 'VRF', type: 'text', placeholder: 'MGMT', hint: 'Boş = default VRF' },
                        { name: 'aacl', why: "ACL olmadan eAPI, VRF'e erişebilen herkese açıktır ve kimlik bilgisi deneme hedefi olur. ACL önceden <code>ip access-list</code> ile tanımlanmış olmalı.", label: 'IP Access-List (VRF altında)', type: 'text', requiredIf: { field: '_cgtype', in: ['on'] }, placeholder: 'MGMT-ACCESS', hint: 'Önceden tanımlı standart/genişletilmiş ACL adı' }
                    ]
                }
            ],
            submit: 'eAPI Konfigürasyonu Oluştur'
        }, (data) => cgAristaEapiGen(data));
    }
};
function cgAristaEapiGen(data) {
    const ty = data._cgtype || 'on';
    let c = '! ========================================\n! Arista EOS — Management API (eAPI)\n! ========================================\n\n';
    if (ty === 'off') {
        c += 'management api http-commands\n   shutdown\n!\n';
        c += '\n! Doğrulama:\n! show management api http-commands\n';
        return c;
    }
    const vrf = cgEsc(data.avrf || ''), acl = cgEsc(data.aacl || '');
    c += 'management api http-commands\n';
    c += '   protocol https\n';
    c += '   no protocol http\n';
    c += '   no shutdown\n';
    c += '   !\n   vrf ' + (vrf || 'default') + '\n      no shutdown\n';
    if (acl) c += '      ip access-group ' + acl + '\n';
    c += '!\n';
    if (!acl) c += '! UYARI: ACL verilmedi — eAPI bu VRF\'te her kaynaktan erişilebilir.\n';
    c += '\n! Doğrulama:\n! show management api http-commands\n! show management http-server\n';
    return c;
}

// ── Arista: Storm Control ────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/ethernet-interfaces.j2
//            (storm-control broadcast|multicast|unknown-unicast|all level [pps] N; logging event storm-control discards)
Arista.storm = {
    label: 'Storm Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Arista EOS — Storm Control',
                desc: 'Erişim portlarında broadcast, multicast ve bilinmeyen unicast trafiğine eşik koyar; bir döngü veya arızalı NIC\'in tüm VLAN\'ı çökertmesini sınırlar.'
            },
            configTypes: [
                { id: 'pct', label: 'Yüzde (%)', icon: 'fas fa-percentage', desc: 'Port bant genişliğinin yüzdesi', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'pps', label: 'Paket/sn (pps)', icon: 'fas fa-tachometer-alt', desc: 'Mutlak paket hızı' }
            ],
            sections: [
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'sifs', why: "Storm control genellikle erişim (host) portlarına uygulanır; uplink veya MLAG peer-link'e düşük eşik koymak meşru yayın trafiğini (ARP, DHCP) keserek tüm segmenti etkiler.", label: 'Arayüzler', type: 'text', validate: 'iface_range', required: true, placeholder: 'Ethernet1-24', hint: 'Virgülle liste veya aralık' },
                        { name: 'slog', why: "Discard log'u eşik aşıldığında syslog kaydı üretir; kapalıyken storm control sessizce paket düşürür ve arıza kaynağı bulunamaz.", label: 'Discard olaylarını logla', type: 'checkbox', checked: true, hint: 'logging event storm-control discards' }
                    ]
                },
                {
                    title: 'Eşikler (%)',
                    icon: 'fas fa-percentage',
                    showFor: ['pct'],
                    fields: [
                        { name: 'bc_pct', why: "Broadcast eşiği çok düşükse ARP/DHCP yoğun anlarda meşru trafik düşer; tipik erişim portu değeri %1-5'tir.", label: 'Broadcast', type: 'text', min: 1, max: 100, required: true, placeholder: '5', hint: 'Tam sayı yüzde' },
                        { name: 'mc_pct', why: "Multicast eşiği IPTV/yayın akışı olan portlarda akışı kesebilir; bu portlarda boş bırakın veya yüksek tutun.", label: 'Multicast', type: 'text', min: 1, max: 100, placeholder: '10', hint: 'Boş = uygulanmaz' },
                        { name: 'uu_pct', why: "Bilinmeyen unicast taşması MAC tablosu dolduğunda veya asimetrik yönlendirmede görülür; eşik bu flood'u sınırlar.", label: 'Unknown-Unicast', type: 'text', min: 1, max: 100, placeholder: '5', hint: 'Boş = uygulanmaz' }
                    ]
                },
                {
                    title: 'Eşikler (pps)',
                    icon: 'fas fa-tachometer-alt',
                    showFor: ['pps'],
                    fields: [
                        { name: 'bc_pps', why: "pps eşiği port hızından bağımsızdır; 1G ve 10G portlarda aynı koruma seviyesini verir. Çok düşük değer meşru ARP patlamalarını keser.", label: 'Broadcast (pps)', type: 'text', validate: 'posint', required: true, placeholder: '1000', hint: 'Saniyedeki paket' },
                        { name: 'mc_pps', why: "Multicast akışları yüksek pps üretir; IPTV/yayın portlarında boş bırakın.", label: 'Multicast (pps)', type: 'text', validate: 'posint', placeholder: '5000', hint: 'Boş = uygulanmaz' },
                        { name: 'uu_pps', why: "Bilinmeyen unicast flood'unu mutlak hızla sınırlar.", label: 'Unknown-Unicast (pps)', type: 'text', validate: 'posint', placeholder: '1000', hint: 'Boş = uygulanmaz' }
                    ]
                }
            ],
            submit: 'Storm Control Oluştur'
        }, (data) => cgAristaStormGen(data));
    }
};
function cgAristaStormGen(data) {
    const pps = (data._cgtype || 'pct') === 'pps';
    const unit = pps ? 'level pps ' : 'level ';
    const bc = cgEsc((pps ? data.bc_pps : data.bc_pct) || ''), mc = cgEsc((pps ? data.mc_pps : data.mc_pct) || ''), uu = cgEsc((pps ? data.uu_pps : data.uu_pct) || '');
    const ifs = cgAristaIfList(cgEsc(data.sifs || ''));
    let c = '! ========================================\n! Arista EOS — Storm Control\n! ========================================\n\n';
    ifs.forEach(i => {
        c += 'interface ' + i + '\n';
        if (bc) c += '   storm-control broadcast ' + unit + bc + '\n';
        if (mc) c += '   storm-control multicast ' + unit + mc + '\n';
        if (uu) c += '   storm-control unknown-unicast ' + unit + uu + '\n';
        if (data.slog) c += '   logging event storm-control discards\n';
        c += '!\n';
    });
    c += '\n! Doğrulama:\n! show storm-control\n';
    return c;
}

// ── Arista: IGMP Snooping ────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/ip-igmp-snooping.j2
Arista.igmpsnoop = {
    label: 'IGMP Snooping',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'Arista EOS — IGMP Snooping',
                desc: 'VLAN bazında IGMP snooping, querier ve fast-leave. EOS\'ta IGMP snooping global olarak varsayılan açıktır; multicast router (PIM) olmayan L2 segmentlerde querier gerekir.'
            },
            sections: [
                {
                    title: 'VLAN',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'ivlan', why: "Snooping bu VLAN'da kapalıysa multicast akışlar broadcast gibi tüm portlara taşar; IPTV/kamera trafiği erişim portlarını doldurur.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1-4094' },
                        { name: 'iquer', why: "Segmentte multicast router yoksa querier olmadan üyelik raporları yenilenmez; snooping tablosu zaman aşımıyla boşalır ve akışlar birkaç dakika sonra kesilir.", label: 'Querier', type: 'checkbox', checked: false, hint: 'Segmentte PIM router yoksa açın' },
                        { name: 'iqaddr', why: "Querier sorgularının kaynak adresidir; VLAN subnet'inde kullanılmayan bir IP olmalı. Birden fazla querier varsa en düşük IP kazanır.", label: 'Querier Adresi', type: 'text', validate: 'ip', requiredIf: { field: 'iquer', checked: true }, placeholder: '10.64.0.2', hint: 'VLAN subnet\'inden' },
                        { name: 'iqver', why: "Querier sürümü hostların IGMP sürümüyle uyumlu olmalı; SSM (kaynağa özgü) akışlar IGMPv3 gerektirir.", label: 'Querier Sürümü', type: 'select', options: [
                            { value: '', label: 'Varsayılan — satır yazma', selected: true },
                            { value: '2', label: '2' },
                            { value: '3', label: '3' }
                        ]},
                        { name: 'ifl', why: "Fast-leave, leave mesajı gelir gelmez portu gruptan çıkarır; port başına tek alıcı varsa kanal değişimini hızlandırır, ancak aynı porta bağlı birden fazla alıcı varsa diğerlerinin akışını keser.", label: 'Fast-Leave', type: 'select', options: [
                            { value: '', label: 'Varsayılan — satır yazma', selected: true },
                            { value: 'on', label: 'Aç' },
                            { value: 'off', label: 'Kapat' }
                        ]},
                        { name: 'imax', why: "Grup sınırı, tek bir VLAN'daki aşırı join isteklerinin snooping tablosunu doldurmasını önler.", label: 'Max Groups', type: 'text', validate: 'posint', placeholder: '256', hint: 'Boş = sınırsız' }
                    ]
                }
            ],
            submit: 'IGMP Snooping Oluştur'
        }, (data) => cgAristaIgmpSnoopGen(data));
    }
};
function cgAristaIgmpSnoopGen(data) {
    const v = cgEsc(data.ivlan || ''), qa = cgEsc(data.iqaddr || ''), qv = cgEsc(data.iqver || ''), mx = cgEsc(data.imax || '');
    let c = '! ========================================\n! Arista EOS — IGMP Snooping\n! ========================================\n\n';
    c += 'ip igmp snooping vlan ' + v + '\n';
    if (data.iquer) {
        c += 'ip igmp snooping vlan ' + v + ' querier\n';
        if (qa) c += 'ip igmp snooping vlan ' + v + ' querier address ' + qa + '\n';
        if (qv) c += 'ip igmp snooping vlan ' + v + ' querier version ' + qv + '\n';
    }
    if (mx) c += 'ip igmp snooping vlan ' + v + ' max-groups ' + mx + '\n';
    if (data.ifl === 'on') c += 'ip igmp snooping vlan ' + v + ' fast-leave\n';
    if (data.ifl === 'off') c += 'no ip igmp snooping vlan ' + v + ' fast-leave\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show ip igmp snooping vlan ' + v + '\n! show ip igmp snooping groups vlan ' + v + '\n';
    if (data.iquer) c += '! show ip igmp snooping querier\n';
    return c;
}

// ── Arista: Event Handler ────────────────────────────────────────────────────
// Sözdizimi: https://github.com/aristanetworks/avd/blob/devel/python-avd/pyavd/_eos_cli_config_gen/j2templates/eos/event-handlers.j2
//            (event-handler NAME / trigger on-intf IF operstatus | trigger on-logging + regex / action bash CMD | action log / delay N)
Arista.eventhandler = {
    label: 'Event Handler',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Arista EOS — Event Handler',
                desc: 'Bir arayüzün durum değişiminde veya belirli bir syslog mesajında otomatik eylem (bash komutu veya log) çalıştırır. Yalnız basit tek satırlık eylemler desteklenir.'
            },
            configTypes: [
                { id: 'intf', label: 'Arayüz Durumu', icon: 'fas fa-ethernet', desc: 'trigger on-intf ... operstatus', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'log', label: 'Syslog Mesajı', icon: 'fas fa-file-alt', desc: 'trigger on-logging + regex' }
            ],
            sections: [
                {
                    title: 'Handler',
                    icon: 'fas fa-bolt',
                    fields: [
                        { name: 'ehname', why: "Handler adı <code>show event-handler</code> çıktısında görünür; aynı adla ikinci tanım öncekini ezer.", label: 'Handler Adı', type: 'text', required: true, placeholder: 'UPLINK-WATCH', hint: 'Boşluksuz' }
                    ]
                },
                {
                    title: 'Tetikleyici: Arayüz',
                    icon: 'fas fa-ethernet',
                    showFor: ['intf'],
                    fields: [
                        { name: 'ehif', why: "Tetikleyici yalnız bu arayüzün operasyonel durum (up/down) değişiminde çalışır; flap eden bir portta eylem art arda tetiklenir, delay bu yüzden önemlidir.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet49', hint: 'İzlenecek arayüz' }
                    ]
                },
                {
                    title: 'Tetikleyici: Syslog',
                    icon: 'fas fa-file-alt',
                    showFor: ['log'],
                    fields: [
                        { name: 'ehregex', why: "Regex çok genişse (ör. <code>.*</code>) her log satırı eylemi tetikler ve CPU'yu yorar; özgün bir mesaj anahtarı kullanın.", label: 'Log Regex', type: 'text', required: true, placeholder: 'LINEPROTO-5-UPDOWN', hint: 'Eşleşecek syslog kalıbı' },
                        { name: 'ehpoll', why: "Yoklama aralığı log'un ne sıklıkla taranacağıdır; kısa aralık tepkiyi hızlandırır ama CPU kullanımını artırır.", label: 'Poll Interval (sn)', type: 'text', validate: 'posint', placeholder: '10', hint: 'Boş = EOS varsayılanı' }
                    ]
                },
                {
                    title: 'Eylem',
                    icon: 'fas fa-play',
                    fields: [
                        { name: 'ehact', why: "Bash eylemi root yetkisiyle çalışır; hatalı bir komut (ör. arayüz kapatma) tetikleyiciyle döngüye girip cihazı erişilemez yapabilir. Önce <code>action log</code> ile deneyin.", label: 'Eylem', type: 'select', options: [
                            { value: 'log', label: 'action log (yalnız kaydet)', selected: true },
                            { value: 'bash', label: 'action bash (komut çalıştır)' }
                        ]},
                        { name: 'ehcmd', why: "Komut tek satır olmalıdır; EOS CLI komutu çalıştırmak için <code>FastCli -p 15 -c '...'</code> kalıbı kullanılır. Komutu önce elle test edin.", label: 'Bash Komutu', type: 'text', requiredIf: { field: 'ehact', in: ['bash'] }, placeholder: 'logger -t EVH uplink-degisti', hint: 'Tek satır' },
                        { name: 'ehdelay', why: "Gecikme, tetikleyiciden sonra eylemin kaç saniye bekleyeceğidir; flap eden bir arayüzde eylemin art arda çalışmasını önler.", label: 'Delay (sn)', type: 'text', min: 0, max: 3600, placeholder: '10', hint: 'Boş = EOS varsayılanı' }
                    ]
                }
            ],
            submit: 'Event Handler Oluştur'
        }, (data) => cgAristaEventHandlerGen(data));
    }
};
function cgAristaEventHandlerGen(data) {
    const ty = data._cgtype || 'intf';
    const n = cgEsc(data.ehname || ''), iface = cgEsc(data.ehif || ''), rx = cgEsc(data.ehregex || ''), poll = cgEsc(data.ehpoll || '');
    const act = data.ehact || 'log', cmd = cgEsc(data.ehcmd || ''), delay = cgEsc(data.ehdelay || '');
    let c = '! ========================================\n! Arista EOS — Event Handler\n! ========================================\n\n';
    c += 'event-handler ' + n + '\n';
    if (act === 'log') c += '   action log\n';
    if (ty === 'log') {
        c += '   trigger on-logging\n';
        if (poll) c += '      poll interval ' + poll + '\n';
        c += '      regex ' + rx + '\n';
    } else {
        c += '   trigger on-intf ' + iface + ' operstatus\n';
    }
    if (act === 'bash' && cmd) c += '   action bash ' + cmd + '\n';
    if (delay) c += '   delay ' + delay + '\n';
    c += '!\n';
    c += '\n! Doğrulama:\n! show event-handler ' + n + '\n';
    return c;
}
