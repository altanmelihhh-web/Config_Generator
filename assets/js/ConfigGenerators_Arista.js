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
                        { name: 'iface', why: "Buradaki portlar access moda alınır. Yanlışlıkla uplink portu yazılırsa trunk access'e döner, VLAN'lar arası taşıma durur ve uzaktan yönetim bağlantısı anında kopar.", label: 'LAN Arayüzü (numara)', type: 'text', validate: 'iface', required: true, placeholder: '1', hint: 'Ethernet<N> — sadece numarayı girin, ör: 1' },
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
                        { name: 'local_ip', why: "Local IP, karşı peer'ın peer-address değeriyle çapraz eşleşmelidir. İki peer aynı adresi local olarak tanımlarsa MLAG <b>inactive</b> kalır ve tüm uplink'ler split-brain riskine girer.", label: 'Local IP / Prefix (CIDR)', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.1/30', hint: 'Bu switch\'in peer-link SVI IP adresi' },
                        { name: 'peer_ip', why: "Peer-address karşı cihazın local IP'si olmalı ve bu adresler peer-link VLAN'ı üzerinden birbirine ulaşmalıdır; yanlış adreste MLAG <code>connecting</code> aşamasında sonsuza kadar takılır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.2', hint: 'Karşı switch\'in peer-link IP adresi' },
                        { name: 'peer_link_po', why: "Peer-link <b>mutlaka bir Port-Channel</b> olmalıdır; tek fiziksel port verilirse EOS yapılandırmayı kabul etmez, ayrıca o tek link koptuğunda split-brain oluşup iki switch de aktif davranır.", label: 'Peer-Link Port-Channel', type: 'text', validate: 'ip', required: true, placeholder: 'Port-Channel100', hint: 'Peer-link olarak kullanılan Port-Channel arayüzü' },
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
                        { name: 'vtep_ip', why: "VTEP IP, kapsüllenmiş paketlerin kaynak adresidir ve underlay routing ile tüm diğer VTEP'lere ulaşabilmelidir; underlay'de duyurulmayan bir VTEP IP'si tüneli tek yönlü ve kullanılamaz yapar.", label: 'VTEP IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.1.1', hint: 'Loopback1\'e atanacak /32 IP adresi' },
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
