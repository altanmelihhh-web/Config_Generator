'use strict';

const CiscoASA = {};

// ── ASA: Interface ────────────────────────────────────────────────────────────
CiscoASA.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'ASA Interface',
                desc: 'ASA Interface — nameif ile mantıksal ad, güvenlik seviyesi (0-100) ve IP adresi atama.'
            },
            sections: [
                {
                    title: 'Outside (WAN)',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'out_iface', why: "Buraya fiziksel arayüz adı birebir doğru yazılmalı; yanlış slot/port girilirse komut başka bir arayüzü yapılandırır ve WAN sessizce kopar. Switch tarafı trunk ise <code>GigabitEthernet0/0.100</code> gibi alt arayüz + <code>vlan</code> tanımı gerekir.", label: 'Interface Adı', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Fiziksel interface adı' },
                        { name: 'out_nameif', why: "<code>nameif</code> atanmayan arayüz ASA için <b>yok hükmündedir</b>: ne route, ne ACL, ne NAT ona referans verebilir. Sonradan nameif değiştirmek ise o ada bağlı tüm ACL, NAT ve route satırlarını sessizce siler.", label: 'Nameif', type: 'text', required: true, placeholder: 'outside', hint: 'Mantıksal interface adı (nameif)' },
                        { name: 'out_sec', why: "Outside için <b>0</b> standarttır. ASA yüksek seviyeden düşüğe trafiğe varsayılan olarak izin verir, düşükten yükseğe ise engeller; bu yüzden dışarıdan içeriye her akış için ayrıca ACL yazmanız gerekir.", label: 'Security Level', type: 'text', required: true, placeholder: '0', hint: '0 = en az güvenilir (dış ağ)' },
                        { name: 'out_ip', why: "WAN IP yanlışsa default route ve VPN peer eşleşmesi birlikte bozulur. ISP adresi DHCP/PPPoE veriyorsa statik IP yerine <code>ip address dhcp setroute</code> kullanılmalı, yoksa ASA hiç çıkış yapamaz.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'WAN IP adresi' },
                        { name: 'out_mask', why: "Maske ISP bloğundan farklıysa next-hop aynı subnette görünmez ve statik default route <b>invalid</b> kalarak route tablosuna hiç girmez. Point-to-point WAN linklerinde genelde <code>255.255.255.252</code> kullanılır.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.252', hint: 'Subnet maskesi' }
                    ]
                },
                {
                    title: 'Inside (LAN)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'in_iface', why: "İç arayüzün fiziksel adı yanlışsa LAN gateway hiç ayağa kalkmaz ve tüm kullanıcılar internete çıkamaz. Trunk bağlantılarda alt arayüz ve VLAN etiketi şarttır.", label: 'Interface Adı', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Fiziksel interface adı' },
                        { name: 'in_nameif', why: "Pek çok ASA varsayılanı <code>inside</code> adını referans alır (örn. <code>management-access inside</code>). Farklı bir ad verirseniz NAT, ACL ve route satırlarının tamamında bu yeni adı tutarlı kullanmak zorundasınız.", label: 'Nameif', type: 'text', required: true, placeholder: 'inside', hint: 'Mantıksal interface adı (nameif)' },
                        { name: 'in_sec', why: "Inside için <b>100</b> verilir; böylece içeriden dışarıya trafik ACL olmadan geçer. İki arayüz aynı seviyedeyse aralarındaki trafik <code>same-security-traffic permit inter-interface</code> yazılmadan <b>hiç</b> geçmez.", label: 'Security Level', type: 'text', required: true, placeholder: '100', hint: '100 = en güvenilir (iç ağ)' },
                        { name: 'in_ip', why: "Bu adres LAN istemcilerinin default gateway değeridir ve DHCP kapsamındaki gateway ile birebir aynı olmalıdır. Uyuşmazlık tüm iç ağın internete çıkamamasına yol açar.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'LAN gateway IP adresi' },
                        { name: 'in_mask', why: "Maske dar verilirse LAN’ın bir bölümü gateway’e ulaşamaz; geniş verilirse başka bir VLAN ile çakışıp asimetrik yönlendirme ve kopan oturumlar oluşur.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Subnet maskesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaIfaceGen(data);
        });
    }
};
function cgAsaIfaceGen(data) {
    const outIface = cgEsc(data.out_iface || ''), outNameif = cgEsc(data.out_nameif || '');
    const outSec = cgEsc(data.out_sec || '0'), outIp = cgEsc(data.out_ip || ''), outMask = cgEsc(data.out_mask || '');
    const inIface = cgEsc(data.in_iface || ''), inNameif = cgEsc(data.in_nameif || '');
    const inSec = cgEsc(data.in_sec || '100'), inIp = cgEsc(data.in_ip || ''), inMask = cgEsc(data.in_mask || '');
    let c = '! ========================================\n! Cisco ASA — Interface Configuration\n! ========================================\n\n';
    c += '! Outside Interface\ninterface ' + outIface + '\n';
    c += ' nameif ' + outNameif + '\n';
    c += ' security-level ' + outSec + '\n';
    c += ' ip address ' + outIp + ' ' + outMask + '\n';
    c += ' no shutdown\n!\n\n';
    c += '! Inside Interface\ninterface ' + inIface + '\n';
    c += ' nameif ' + inNameif + '\n';
    c += ' security-level ' + inSec + '\n';
    c += ' ip address ' + inIp + ' ' + inMask + '\n';
    c += ' no shutdown\n!\n\n';
    c += '! Doğrulama:\n! show interface ip brief\n! show nameif\n! show ip address\n';
    return c;
}

// ── ASA: NAT ──────────────────────────────────────────────────────────────────
CiscoASA.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'ASA NAT',
                desc: 'ASA NAT — Auto-NAT (object NAT) ve Manual-NAT (twice-nat) yapılandırması. Inside/outside interface çifti ile adres dönüşümü.'
            },
            configTypes: [
                { id: 'pat', label: 'Dynamic PAT', icon: 'fas fa-random', desc: 'Çok-çok NAT, interface IP üzerinde overload', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: 'Birebir statik adres dönüşümü', badge: { text: 'Statik', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Object Ayarları',
                    icon: 'fas fa-cube',
                    fields: [
                        { name: 'obj_name', why: "Object adı NAT, ACL ve route-map satırlarında referans olarak kullanılır; sonradan değiştirmek bu satırların tamamını kırar. <code>show run object</code> çıktısında ayırt edilebilir, anlamlı bir ad seçin.", label: 'Object Adı', type: 'text', required: true, placeholder: 'LAN_NET', hint: 'NAT nesnesi için isim' }
                    ]
                },
                {
                    title: 'Dynamic PAT Ayarları',
                    icon: 'fas fa-random',
                    showFor: ['pat'],
                    fields: [
                        { name: 'pat_subnet', why: "PAT kapsamı gereğinden geniş verilirse VPN veya DMZ trafiği de NAT’lanır ve site-to-site tünel içindeki trafik tamamen bozulur. VPN varsa NAT-exempt (identity NAT) kuralı bu kuraldan <b>önce</b> gelmelidir.", label: 'İç Subnet', type: 'text', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'NAT edilecek iç ağ (IP + mask)' },
                        { name: 'pat_inside', why: "Burada fiziksel ad değil <code>nameif</code> değeri kullanılır. Arayüz çifti yanlışsa kural hiç eşleşmez; <code>packet-tracer input inside tcp 192.168.1.10 1025 8.8.8.8 53</code> ile hangi NAT kuralına düştüğünü doğrulayın.", label: 'Inside Interface', type: 'text', required: true, placeholder: 'inside', hint: 'İç taraf nameif' },
                        { name: 'pat_outside', why: "PAT, bu arayüzün IP adresi üzerinden overload yapar. Çift ISP senaryosunda yanlış arayüz seçilirse dönüş trafiği asimetrik olur ve stateful denetim oturumları düşürür.", label: 'Outside Interface', type: 'text', required: true, placeholder: 'outside', hint: 'Dış taraf nameif' }
                    ]
                },
                {
                    title: 'Static NAT Ayarları',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['static'],
                    fields: [
                        { name: 'static_host', why: "Static NAT <b>çift yönlüdür</b>: bu host artık dışarıdan da erişilebilir hale gelir. Outside arayüze sınırlayıcı bir ACL bağlanmazsa sunucu tüm internete açılmış olur.", label: 'İç Host', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.10', hint: 'NAT edilecek iç IP adresi' },
                        { name: 'static_mapped', why: "Dışarıya görünecek adres; ASA bu IP için otomatik proxy-ARP yapar. Adres outside subnetinin dışındaysa ISP’nin bu bloğu size route etmesi gerekir, aksi halde trafik hiç gelmez.", label: 'Dış (Mapped) IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.10', hint: 'Dışarıya görünen IP adresi' },
                        { name: 'static_inside', why: "Gerçek (real) adresin bulunduğu arayüzün nameif değeri. Object NAT <b>section 2</b>’de değerlendirilir; aynı hostu kapsayan bir manual/twice NAT (section 1) varsa o öncelikli olur ve bu kural hiç çalışmaz.", label: 'Inside Interface', type: 'text', required: true, placeholder: 'inside', hint: 'İç taraf nameif' },
                        { name: 'static_outside', why: "Çevrilmiş adresin göründüğü arayüz. Yanlış seçilirse kural <code>show nat</code> çıktısında görünür ama hiç hit almaz — NAT sorunlarının en sık sebebi budur.", label: 'Outside Interface', type: 'text', required: true, placeholder: 'outside', hint: 'Dış taraf nameif' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaNatGen(data);
        });
    }
};
function cgAsaNatGen(data) {
    const type = cgEsc(data._cgtype || 'pat'), obj = cgEsc(data.obj_name || '');
    let c = '! ========================================\n! Cisco ASA — NAT Configuration\n! ========================================\n\n';
    if (type === 'pat') {
        const subnet = cgEsc(data.pat_subnet || ''), inside = cgEsc(data.pat_inside || ''), outside = cgEsc(data.pat_outside || '');
        c += '! Dynamic PAT (Interface Overload)\nobject network ' + obj + '\n subnet ' + subnet + '\n nat (' + inside + ',' + outside + ') dynamic interface\n!\n\n';
    } else {
        const host = cgEsc(data.static_host || ''), mapped = cgEsc(data.static_mapped || '');
        const inside = cgEsc(data.static_inside || ''), outside = cgEsc(data.static_outside || '');
        c += '! Static NAT (One-to-One)\nobject network ' + obj + '\n host ' + host + '\n nat (' + inside + ',' + outside + ') static ' + mapped + '\n!\n\n';
    }
    c += '! Doğrulama:\n! show nat\n! show nat detail\n! show xlate\n';
    return c;
}

// ── ASA: ACL ──────────────────────────────────────────────────────────────────
CiscoASA.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ASA ACL',
                desc: 'ASA ACL — interface bazlı erişim kontrol listesi. Inbound/outbound yön belirtimi, real-IP veya mapped-IP kullanımı.'
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', why: "ACL adı, ACL’in hangi arayüze bağlı olduğundan bağımsızdır; bağlama işini <code>access-group</code> yapar. Var olan bir ada satır eklediğinizde kural listenin <b>sonuna</b> eklenir ve üstteki bir deny yüzünden hiç çalışmayabilir.", label: 'ACL Adı', type: 'text', required: true, placeholder: 'OUTSIDE_IN', hint: 'Access-list ismi' },
                        { name: 'action', why: "ASA’da her ACL’in sonunda gizli bir <b>deny ip any any</b> vardır ve ilk eşleşen satır kazanır. Bu yüzden permit satırları daha genel deny satırlarından önce gelmelidir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'Permit', selected: true },
                            { value: 'deny', label: 'Deny' }
                        ]},
                        { name: 'proto', why: "Protokol ile port belirtimi uyumlu olmalı: <code>ip</code> seçilirse port yazılamaz, ICMP’de port kavramı yoktur. ICMP’yi tümüyle kapatmak ping’i değil <b>Path MTU Discovery</b>’yi de bozar ve büyük paketler sessizce kaybolur.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'ip', label: 'IP' },
                            { value: 'icmp', label: 'ICMP' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak / Hedef',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'src', why: "8.3 ve sonrasında ACL, NAT’lanmış değil <b>gerçek (real)</b> IP adresine göre yazılır. Eski alışkanlıkla mapped adres yazmak kuralın hiç eşleşmemesine yol açar.", label: 'Kaynak', type: 'text', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'Kaynak IP adresi veya any — any veya host 10.0.0.1 de yazılabilir' },
                        { name: 'dst', why: "Dışarıdan bir DMZ sunucusuna erişim yazarken hedef, NAT’lı dış IP değil sunucunun <b>gerçek iç IP</b> adresidir. Bu ayrımı kaçırmak port-forward çalışmamasının bir numaralı nedenidir.", label: 'Hedef', type: 'text', required: true, placeholder: 'host 203.0.113.10', hint: 'Hedef IP adresi veya host — any veya ağ + maske de yazılabilir' },
                        { name: 'dst_port', why: "Port yazımı <code>eq 443</code> ya da <code>range 8000 8100</code> biçimindedir; yalnızca sayı girmek satırı geçersiz kılar. FTP, SIP, TFTP gibi dinamik port açan protokollerde ayrıca inspect gerekir.", label: 'Hedef Port', type: 'text', validate: 'port_match', optional: true, placeholder: 'eq 80', hint: 'TCP/UDP için port belirtimi — veya range 80 443' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_iface', why: "Bir ACL, <code>access-group</code> ile arayüze bağlanmadıkça hiçbir etkisi olmaz. Yazılmış ama bağlanmamış ACL, ASA’da en sık görülen sessiz hatadır.", label: 'Uygulama Interface (Nameif)', type: 'text', validate: 'nameif', optional: true, placeholder: 'outside', hint: 'ACL bağlanacak interface (boş bırakılabilir)' },
                        { name: 'direction', why: "Pratikte <b>in</b> kullanılır ve bir arayüze aynı yönde yalnızca <b>tek</b> ACL bağlanabilir; yeni bağlama eskisini uyarısızca devre dışı bırakır. Yön yanlış seçilirse kural dönüş trafiğine uygulanır ve stateful yapı bozulur.", label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'in', selected: true },
                            { value: 'out', label: 'out' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAclGen(data);
        });
    }
};
function cgAsaAclGen(data) {
    const name = cgEsc(data.acl_name || ''), action = cgEsc(data.action || 'permit'), proto = cgEsc(data.proto || 'tcp');
    const src = cgEsc(data.src || ''), dst = cgEsc(data.dst || ''), port = cgEsc(data.dst_port || '');
    const applyIface = cgEsc(data.apply_iface || ''), dir = cgEsc(data.direction || 'in');
    let c = '! ========================================\n! Cisco ASA — ACL Configuration\n! ========================================\n\n';
    let rule = 'access-list ' + name + ' extended ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (port && (proto === 'tcp' || proto === 'udp')) rule += ' ' + port;
    c += rule + '\n';
    c += 'access-list ' + name + ' extended deny ip any any\n\n';
    if (applyIface) {
        c += 'access-group ' + name + ' ' + dir + ' interface ' + applyIface + '\n\n';
    }
    c += '! Doğrulama:\n! show access-list ' + name + '\n! show access-group\n';
    return c;
}

// ── ASA: VPN (Site-to-Site IKEv1/v2) ─────────────────────────────────────────
CiscoASA.vpn = {
    label: 'VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'ASA Site-to-Site VPN',
                desc: 'ASA Site-to-Site VPN — IKEv1/v2 ISAKMP policy, transform-set ve crypto-map. Peer IP ve pre-shared key yapılandırması.'
            },
            sections: [
                {
                    title: 'Tunnel Parametreleri',
                    icon: 'fas fa-tunnel',
                    fields: [
                        { name: 'outside_iface', why: "Crypto map <code>crypto map MAP interface outside</code> ile bu arayüze bağlanmazsa tünel hiç kurulmaz. Ayrıca IKE bu arayüzde açık olmalıdır (<code>crypto ikev2 enable outside</code>).", label: 'Outside Interface', type: 'text', validate: 'nameif', required: true, placeholder: 'outside', hint: 'VPN bitişinin bağlı olduğu nameif' },
                        { name: 'peer_ip', why: "Peer, karşı tarafın gerçek dış IP adresi olmalıdır; NAT arkasındaysa NAT-T ve <b>UDP/4500</b> trafiğinin açık olması gerekir. Yanlış peer IP’sinde Phase-1 hiç başlamaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Uzak VPN endpoint IP adresi' },
                        { name: 'psk', why: "PSK iki tarafta birebir aynı olmalı; en ufak fark Phase-1’in <b>MM_WAIT_MSG</b> durumunda takılmasına yol açar. Zayıf PSK yakalanan IKE paketlerinden çevrimdışı kırılabildiği için uzun ve rastgele seçilmelidir.", label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'MyS3cr3tKey!', hint: 'Paylaşılan gizli anahtar' }
                    ]
                },
                {
                    title: 'Korunan Ağlar',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'local_net', why: "Yerel ve uzak ağ tanımları iki tarafta <b>ayna</b> olmalıdır, yoksa Phase-2 proxy-ID uyuşmaz. Ayrıca bu ağ için NAT-exempt yazılmazsa trafik PAT’lanır ve tünele hiç girmez.", label: 'Yerel Network', type: 'text', validate: 'ip_mask', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'Yerel korunan ağ (IP + mask)' },
                        { name: 'remote_net', why: "Uzak ağ, karşı tarafın yerel ağıyla aynı maskeyle tanımlanmalı; /24 yerine /16 yazmak gibi küçük bir fark Phase-2 müzakeresini düşürür ve tünel kurulmuş görünse de trafik geçmez.", label: 'Uzak Network', type: 'text', validate: 'ip_mask', required: true, placeholder: '10.0.0.0 255.255.255.0', hint: 'Uzak korunan ağ (IP + mask)' }
                    ]
                },
                {
                    title: 'Şifreleme Politikası',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'enc', why: "DES ve 3DES artık güvenli sayılmaz, AES-256 tercih edin. Ancak iki taraf ortak bir algoritmada buluşamazsa IKE proposal hiç eşleşmez; karşı tarafın policy’si ile birebir hizalayın.", label: 'IKE Şifreleme', type: 'select', options: [
                            { value: 'aes-256', label: 'AES-256', selected: true },
                            { value: 'aes-128', label: 'AES-128' },
                            { value: 'aes', label: 'AES' }
                        ], hint: 'IKE Phase 1 şifreleme algoritması' },
                        { name: 'hash', why: "SHA-1 zayıflamıştır, mümkünse SHA-256 kullanın. Hash değeri de iki tarafta aynı olmalıdır; farklıysa Phase-1 sessizce başarısız olur.", label: 'IKE Hash', type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha', label: 'SHA-1' },
                            { value: 'md5', label: 'MD5' }
                        ], hint: 'IKE bütünlük algoritması' },
                        { name: 'dhgrp', why: "Yüksek DH grubu daha güçlü anahtar ama daha yüksek CPU maliyeti demektir. Group 1 ve 2 kırılabilir kabul edilir; iki tarafta aynı grup seçilmezse Phase-1 hiç tamamlanmaz.", label: 'DH Group', type: 'select', options: [
                            { value: '14', label: 'Group 14 (2048-bit)', selected: true },
                            { value: '19', label: 'Group 19 (256-bit EC)' },
                            { value: '5', label: 'Group 5 (1536-bit)' }
                        ], hint: 'Diffie-Hellman anahtar değişim grubu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaVpnGen(data);
        });
    }
};
function cgAsaVpnGen(data) {
    const oiface = cgEsc(data.outside_iface || ''), peer = cgEsc(data.peer_ip || ''), psk = cgEsc(data.psk || '');
    const localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
    const enc = cgEsc(data.enc || 'aes-256'), hash = cgEsc(data.hash || 'sha256'), dhgrp = cgEsc(data.dhgrp || '14');
    const aclName = 'CRYPTO_ACL_' + peer.replace(/\./g, '_');
    let c = '! ========================================\n! Cisco ASA — IPSec VPN (Site-to-Site)\n! ========================================\n\n';
    c += '! Phase 1 — IKEv1 Policy\ncrypto isakmp enable ' + oiface + '\ncrypto isakmp policy 10\n';
    c += ' authentication pre-share\n encryption ' + enc + '\n hash ' + hash + '\n group ' + dhgrp + '\n lifetime 86400\n!\n\n';
    c += '! Phase 2 — Transform Set\ncrypto ipsec ikev1 transform-set TS esp-' + enc + ' esp-' + hash + '-hmac\n!\n\n';
    c += '! Tunnel Group (Peer)\ntunnel-group ' + peer + ' type ipsec-l2l\ntunnel-group ' + peer + ' ipsec-attributes\n ikev1 pre-shared-key ' + psk + '\n!\n\n';
    c += '! Crypto ACL\naccess-list ' + aclName + ' extended permit ip ' + localNet + ' ' + remoteNet + '\n!\n\n';
    c += '! Crypto Map\ncrypto map CMAP 10 match address ' + aclName + '\ncrypto map CMAP 10 set peer ' + peer + '\ncrypto map CMAP 10 set ikev1 transform-set TS\ncrypto map CMAP interface ' + oiface + '\n\n';
    c += '! Doğrulama:\n! show crypto isakmp sa\n! show crypto ipsec sa\n! show crypto map\n! show vpn-sessiondb l2l\n';
    return c;
}

// ── ASA: AAA ──────────────────────────────────────────────────────────────────
CiscoASA.aaa = {
    label: 'AAA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'ASA AAA',
                desc: 'ASA AAA — LOCAL, LDAP veya RADIUS kimlik doğrulama. Console, SSH ve HTTP yönetim erişimi için.'
            },
            configTypes: [
                { id: 'local', label: 'LOCAL', icon: 'fas fa-user', desc: 'Yerel kullanıcı veritabanı ile kimlik doğrulama', badge: { text: 'Basit', cls: 'common' } },
                { id: 'ldap', label: 'LDAP', icon: 'fas fa-sitemap', desc: 'Active Directory / LDAP sunucu entegrasyonu', badge: { text: 'Kurumsal', cls: 'recommended' } },
                { id: 'radius', label: 'RADIUS', icon: 'fas fa-server', desc: 'RADIUS sunucu ile merkezi kimlik doğrulama', badge: { text: 'AAA', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Yönetim Erişimi',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'ssh_enable', why: "AAA sunucusu erişilemez hale gelirse cihaza SSH ile giremezsiniz. <code>aaa authentication ssh console LOCAL</code> benzeri bir yerel yedek tanımlanmadan bu seçeneği açmak kilitlenme riskidir.", label: 'SSH Kimlik Doğrulama', type: 'checkbox', checked: true, hint: 'SSH erişimini AAA ile doğrula' },
                        { name: 'http_enable', why: "ASDM erişimi AAA’ya bağlandığında sunucu çöktüğünde grafik arayüz de kapanır. Yerel yedek hesap ve <code>http</code> izin satırları olmadan yönetim tamamen kesilebilir.", label: 'ASDM/HTTP Kimlik Doğrulama', type: 'checkbox', checked: true, hint: 'ASDM web arayüzü için AAA' },
                        { name: 'console_enable', why: "Konsolu AAA’ya bağlamak, sunucu ulaşılamadığında cihazdan tamamen kilitlenmeniz anlamına gelir. Konsolu LOCAL bırakmak kurtarma yolunu açık tutar.", label: 'Console Kimlik Doğrulama', type: 'checkbox', checked: false, hint: 'Console erişimini AAA ile doğrula' }
                    ]
                },
                {
                    title: 'LDAP Sunucu Ayarları',
                    icon: 'fas fa-sitemap',
                    showFor: ['ldap'],
                    fields: [
                        { name: 'ldap_server', why: "LDAP sorgusu <code>aaa-server</code> altında belirtilen arayüz üzerinden çıkar; yanlış arayüz seçilirse istek zaman aşımına düşer ve her giriş denemesi saniyelerce takılır.", label: 'LDAP Sunucu IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.100', hint: 'Active Directory / LDAP sunucu IP' },
                        { name: 'ldap_base', why: "Base DN çok dar seçilirse kullanıcılar hiç bulunamaz, çok geniş seçilirse sorgu yavaşlar ve timeout üretir. <code>debug ldap 255</code> ile aramanın gerçekte hangi DN altında yapıldığını doğrulayın.", label: 'Base DN', type: 'text', required: true, placeholder: 'DC=corp,DC=local', hint: 'LDAP arama başlangıç noktası' },
                        { name: 'ldap_bind', why: "Bind için yetkisi kısıtlı bir servis hesabı kullanın; bu hesap kilitlenirse <b>tüm</b> kullanıcı girişleri aynı anda başarısız olur.", label: 'Bind DN', type: 'text', optional: true, placeholder: 'CN=svc-asa,OU=ServiceAccounts,DC=corp,DC=local', hint: 'Bağlantı için kullanıcı DN' },
                        { name: 'ldap_pass', why: "Şifre AD tarafında değiştiğinde ASA sessizce doğrulama yapamaz hale gelir ve hata kullanıcı hatası gibi görünür. Servis hesabını süresiz şifre politikasıyla yönetmek bu tuzağı önler.", label: 'Bind Password', type: 'text', optional: true, placeholder: 'P@ssw0rd', hint: 'Bind kullanıcı şifresi' },
                        { name: 'ldap_grp', why: "Server-group adı, AAA’yı kullanan tüm satırlarda (<code>aaa authentication</code>, tunnel-group) aynı yazılmalıdır. İsim uyuşmazlığında ASA doğrulamayı hiç denemez veya sessizce LOCAL’a düşer.", label: 'Server Group Adı', type: 'text', optional: true, placeholder: 'LDAP-AD', hint: 'AAA server-group ismi' }
                    ]
                },
                {
                    title: 'RADIUS Sunucu Ayarları',
                    icon: 'fas fa-server',
                    showFor: ['radius'],
                    fields: [
                        { name: 'rad_server', why: "RADIUS sunucusu tarafında ASA’nın IP adresi <b>NAS client</b> olarak tanımlı değilse istekler cevapsız kalır ve ASA yalnızca timeout görür. Sunucuya giden yolun hangi arayüzden geçtiği de kritiktir.", label: 'RADIUS Sunucu IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.200', hint: 'RADIUS sunucu IP adresi' },
                        { name: 'rad_key', why: "Shared secret uyuşmazsa RADIUS sunucusu isteği <b>sessizce yok sayar</b>; ASA tarafında bu timeout gibi görünür, yani hata mesajı yanıltıcıdır. İki tarafta birebir aynı olmalıdır.", label: 'Shared Secret', type: 'text', required: true, placeholder: 'radius_secret', hint: 'RADIUS paylaşılan gizli anahtar' },
                        { name: 'rad_grp', why: "Grup adı VPN tunnel-group ve yönetim erişimi satırlarında referans verilir. Yanlış ad, kimlik doğrulamanın hiç denenmeden atlanmasına yol açar.", label: 'Server Group Adı', type: 'text', optional: true, placeholder: 'RADIUS-SRV', hint: 'AAA server-group ismi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAaaGen(data);
        });
    }
};
function cgAsaAaaGen(data) {
    const authType = cgEsc(data._cgtype || 'local');
    const sshEnable = data.ssh_enable, httpEnable = data.http_enable, consoleEnable = data.console_enable;
    let c = '! ========================================\n! Cisco ASA — AAA Configuration\n! ========================================\n\n';
    let serverGrp = 'LOCAL';
    if (authType === 'ldap') {
        const ldapServer = cgEsc(data.ldap_server || ''), ldapBase = cgEsc(data.ldap_base || '');
        const ldapBind = cgEsc(data.ldap_bind || ''), ldapPass = cgEsc(data.ldap_pass || '');
        const ldapGrp = cgEsc(data.ldap_grp || 'LDAP-AD');
        serverGrp = ldapGrp;
        c += '! LDAP Sunucu Tanımı\naaa-server ' + ldapGrp + ' protocol ldap\naaa-server ' + ldapGrp + ' (inside) host ' + ldapServer + '\n';
        c += ' ldap-base-dn ' + ldapBase + '\n';
        c += ' ldap-scope subtree\n';
        c += ' ldap-naming-attribute sAMAccountName\n';
        if (ldapBind) c += ' server-type microsoft\n ldap-login-dn ' + ldapBind + '\n ldap-login-password ' + ldapPass + '\n';
        c += '!\n\n';
    } else if (authType === 'radius') {
        const radServer = cgEsc(data.rad_server || ''), radKey = cgEsc(data.rad_key || '');
        const radGrp = cgEsc(data.rad_grp || 'RADIUS-SRV');
        serverGrp = radGrp;
        c += '! RADIUS Sunucu Tanımı\naaa-server ' + radGrp + ' protocol radius\naaa-server ' + radGrp + ' (inside) host ' + radServer + '\n';
        c += ' key ' + radKey + '\n!\n\n';
    }
    // Sunucu grubu kullaniliyorsa LOCAL yedek eklenir: sunucu erisilemezse yerel
    // hesapla girilebilsin (alanlarin 'Neden?' metni tam bu kilitlenmeyi anlatiyor).
    const fb = serverGrp === 'LOCAL' ? '' : ' LOCAL';
    c += '! AAA kimlik kuralları (sunucu erişilemezse LOCAL yedek)\n';
    if (sshEnable) c += 'aaa authentication ssh console ' + serverGrp + fb + '\n';
    if (httpEnable) c += 'aaa authentication http console ' + serverGrp + fb + '\n';
    if (consoleEnable) c += 'aaa authentication serial console ' + serverGrp + fb + '\n';
    if (serverGrp === 'LOCAL') {
        c += '\n! Doğrulama:\n! show running-config aaa\n! show running-config username\n';
    } else {
        const host = cgEsc(data.ldap_server || data.rad_server || '<sunucu-ip>');
        // 'test aaa authentication GRUP ...' ASA'da yok; dogrusu 'test aaa-server authentication GRUP host IP ...'
        c += '\n! Doğrulama:\n! show aaa-server ' + serverGrp + '\n! test aaa-server authentication ' + serverGrp + ' host ' + host + ' username <kullanici> password <parola>\n';
    }
    return c;
}

// ── ASA: Route Map (Static Route + PBR) ──────────────────────────────────────
CiscoASA.routeMap = {
    label: 'Route Map',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'ASA Routing',
                desc: 'ASA Routing — static route ve PBR (Policy-Based Routing) ile trafik yönlendirme.'
            },
            configTypes: [
                { id: 'static', label: 'Static Route', icon: 'fas fa-map-signs', desc: 'Hedef ağa statik rota tanımı', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'pbr', label: 'Policy-Based Routing', icon: 'fas fa-route', desc: 'Kaynak/protokol bazlı trafik yönlendirme (route-map)', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Static Route',
                    icon: 'fas fa-map-signs',
                    showFor: ['static'],
                    fields: [
                        { name: 'nameif', why: "Statik route’ta fiziksel ad değil <code>nameif</code> değeri kullanılır. Yanlış arayüz yazılırsa route tabloda görünür ama trafik o yoldan hiç çıkmaz.", label: 'Interface (Nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'Çıkış interface nameif değeri' },
                        { name: 'network', why: "<code>0.0.0.0</code> girmek default route anlamına gelir ve var olan bir default route ile administrative distance üzerinden yarışır. Yanlış hedef ağ, tüm internet trafiğinin yanlış arayüze yönelmesine neden olur.", label: 'Hedef Network', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Hedef ağ adresi (0.0.0.0 = default route)' },
                        { name: 'mask', why: "Maske ile hedef ağ tutarsızsa (örn. 10.0.0.0 için 255.255.255.0) route beklenenden çok daha dar kapsar ve longest-prefix eşleşmesi tamamen değişir.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '0.0.0.0', hint: 'Hedef ağ maskesi' },
                        { name: 'nexthop', why: "Next-hop, çıkış arayüzü ile aynı subnette olmalıdır; değilse ASA route’u <b>invalid</b> sayıp tabloya hiç koymaz. <code>show route</code> ile gerçekten yüklendiğini doğrulayın.", label: 'Next-Hop (Gateway)', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Bir sonraki atlamanın IP adresi' },
                        { name: 'metric', why: "ASA’da bu değer pratikte administrative distance’tır; yedek ISP için floating static yazarken daha <b>yüksek</b> değer verilmelidir. Aynı AD ile iki route yazmak ECMP üretir ve asimetrik trafikle oturumları düşürebilir.", label: 'Metric', type: 'text', optional: true, placeholder: '1', hint: 'Route metrik değeri (default: 1)' }
                    ]
                },
                {
                    title: 'PBR Route-Map Tanımı',
                    icon: 'fas fa-route',
                    showFor: ['pbr'],
                    fields: [
                        { name: 'rm_name', why: "Route-map adı PBR uygulanan arayüzde referans verilir; ad uyuşmazlığında PBR sessizce devre dışı kalır ve trafik normal route tablosunu izler.", label: 'Route-Map Adı', type: 'text', optional: true, placeholder: 'PBR_MAP', hint: 'Route-map tanımı için isim' },
                        { name: 'rm_seq', why: "Sequence’ler küçükten büyüğe değerlendirilir ve <b>ilk eşleşen</b> uygulanır. 10’ar artırarak yazmak, sonradan araya kural eklemeyi mümkün kılar.", label: 'Sequence', type: 'text', optional: true, placeholder: '10', hint: 'Route-map sequence numarası' },
                        { name: 'acl_match', why: "PBR yalnızca bu ACL’de <b>permit</b> edilen trafiğe uygulanır; deny satırları PBR dışında kalıp normal route tablosuna düşer. Bu mantığı ters kurmak beklenmedik yönlendirmeye yol açar.", label: 'Match ACL Adı', type: 'text', optional: true, placeholder: 'PBR_ACL', hint: 'Eşleşme kriteri olarak kullanılacak ACL' },
                        { name: 'src_net', why: "PBR kapsamı fazla geniş tutulursa yönetim veya VPN trafiği de ikinci çıkışa kaçar ve mevcut oturumlar kopar. Kapsamı mümkün olan en dar subnetle sınırlayın.", label: 'Kaynak Network (ACL)', type: 'text', optional: true, placeholder: '192.168.10.0 255.255.255.0', hint: 'PBR uygulanacak kaynak ağ' },
                        { name: 'pbr_nexthop', why: "PBR next-hop erişilemez hale gelirse trafik <b>kara deliğe</b> düşebilir, çünkü PBR normal route tablosunu atlar. Yedekli tasarımda <code>set ip next-hop verify-availability</code> ile SLA izleme ekleyin.", label: 'PBR Next-Hop IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.254', hint: 'Eşleşen trafiğin yönlendirileceği IP' },
                        { name: 'pbr_iface', why: "PBR, trafiğin <b>girdiği</b> arayüze uygulanır; çıkış arayüzüne uygulamak hiçbir etki yaratmaz. PBR çalışmıyor şikayetlerinin büyük kısmı bu hatadan kaynaklanır.", label: 'PBR Interface (Nameif)', type: 'text', validate: 'nameif', optional: true, placeholder: 'inside', hint: 'Route-map uygulanacak interface' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaRouteMapGen(data);
        });
    }
};
function cgAsaRouteMapGen(data) {
    const type = cgEsc(data._cgtype || 'static');
    let c = '! ========================================\n! Cisco ASA — Routing Configuration\n! ========================================\n\n';
    if (type === 'static') {
        const nameif = cgEsc(data.nameif || ''), network = cgEsc(data.network || '');
        const mask = cgEsc(data.mask || ''), nexthop = cgEsc(data.nexthop || '');
        const metric = cgEsc(data.metric || '1');
        c += 'route ' + nameif + ' ' + network + ' ' + mask + ' ' + nexthop + ' ' + metric + '\n\n';
        c += '! Doğrulama:\n! show route\n! show route ' + network + '\n';
    } else {
        const rmName = cgEsc(data.rm_name || 'PBR_MAP'), rmSeq = cgEsc(data.rm_seq || '10');
        const aclMatch = cgEsc(data.acl_match || 'PBR_ACL'), srcNet = cgEsc(data.src_net || '');
        const pbrNexthop = cgEsc(data.pbr_nexthop || ''), pbrIface = cgEsc(data.pbr_iface || '');
        if (srcNet) {
            c += '! PBR — Eşleşme ACL\naccess-list ' + aclMatch + ' extended permit ip ' + srcNet + ' any\n!\n\n';
        }
        c += '! PBR — Route-Map\nroute-map ' + rmName + ' permit ' + rmSeq + '\n';
        c += ' match ip address ' + aclMatch + '\n';
        c += ' set ip next-hop ' + pbrNexthop + '\n!\n\n';
        if (pbrIface) {
            c += '! Route-Map Uygulama\ninterface ' + pbrIface + '\n ip policy route-map ' + rmName + '\n!\n\n';
        }
        // 'show ip policy' / 'debug ip policy' IOS komutlaridir, ASA'da yoktur.
    c += '! Doğrulama:\n! show route-map\n! debug policy-route\n';
    }
    return c;
}

// ── ASA: MPF Service Policy ───────────────────────────────────────────────────
CiscoASA.mpfServicePolicy = {
    label: 'MPF Service Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'ASA MPF',
                desc: 'ASA MPF — Modular Policy Framework. Class-map ile trafik sınıflandırma, policy-map ile aksiyon atama.'
            },
            sections: [
                {
                    title: 'Class-Map (Trafik Sınıfı)',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'class_name', why: "MPF zinciri class-map → policy-map → service-policy şeklindedir; class tanımlı ama policy-map’e eklenmemişse hiçbir inspect ya da QoS uygulanmaz. Adları zincir boyunca birebir aynı tutun.", label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'INSPECT_HTTP', hint: 'Trafik sınıfı için isim' },
                        { name: 'class_acl', why: "Sınıf bu ACL ile eşleşir; ACL’de deny olan trafik sınıfa <b>girmez</b> ve varsayılan global politikaya düşer. Yani deny burada engelleme değil kapsam dışı bırakma anlamına gelir.", label: 'Match ACL Adı', type: 'text', required: true, placeholder: 'HTTP_ACL', hint: 'Eşleşme kriteri ACL adı' },
                        { name: 'match_src', why: "Kaynak fazla geniş (<code>any</code>) bırakılırsa inspect/QoS tüm trafiğe uygulanır ve CPU beklenmedik şekilde yükselir. Kapsamı daraltmak hem performans hem öngörülebilirlik sağlar.", label: 'Kaynak Network', type: 'text', required: true, placeholder: 'any', hint: 'Kaynak IP (any veya subnet mask formatı)' },
                        { name: 'match_dst', why: "Hedef tanımı NAT sonrası değil <b>gerçek</b> adrese göre yazılmalıdır. Yanlış yazılırsa sınıf hiç hit almaz ve <code>show service-policy</code> çıktısında sayaçlar sıfır kalır.", label: 'Hedef Network', type: 'text', required: true, placeholder: 'any', hint: 'Hedef IP (any veya subnet mask formatı)' },
                        { name: 'match_port', why: "Port <code>eq 80</code> biçiminde yazılır. Uygulama standart dışı bir portta çalışıyorsa inspect devreye girmez; bu durumda protokolü o porta açıkça eşlemeniz gerekir.", label: 'Hedef Port', type: 'text', validate: 'port_match', optional: true, placeholder: 'eq 80', hint: 'Eşleştirilecek port (ör: eq 80)' }
                    ]
                },
                {
                    title: 'Policy-Map (Aksiyon)',
                    icon: 'fas fa-tasks',
                    fields: [
                        { name: 'policy_name', why: "Birden çok policy-map tanımlanabilir ama bir arayüze aynı anda yalnızca biri uygulanabilir; yeni uygulama eskisini sessizce değiştirir. Global policy de tek olabilir.", label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'INSPECT_POLICY', hint: 'Politika için isim' },
                        { name: 'inspect_proto', why: "Inspection kapatılırsa FTP, SIP, TFTP gibi dinamik port açan protokoller çalışmaz. Açık bırakmak ise bazı ortamlarda SIP ALG’nin çağrıları bozmasına yol açar — ihtiyaca göre seçilmelidir.", label: 'Inspect Protokolü', type: 'select', options: [
                            { value: 'http', label: 'HTTP', selected: true },
                            { value: 'ftp', label: 'FTP' },
                            { value: 'smtp', label: 'SMTP' },
                            { value: 'dns', label: 'DNS' },
                            { value: 'sip', label: 'SIP' },
                            { value: 'rtsp', label: 'RTSP' }
                        ], hint: 'Deep inspection için protokol' },
                        { name: 'enable_inspect', why: "Varsayılan <code>global_policy</code> zaten bir dizi inspect içerir; ikinci bir politika eklemek yerine mevcut olanı düzenlemek çakışmaları önler. Aynı trafiğe iki inspect uygulanamaz.", label: 'Inspect Aktif', type: 'checkbox', checked: true, hint: 'Seçili protokolü inspect et' }
                    ]
                },
                {
                    title: 'Service Policy Uygulama',
                    icon: 'fas fa-play',
                    fields: [
                        { name: 'sp_name', why: "Service-policy adı policy-map adıyla eşleşmezse komut reddedilir ya da yanlış politikayı devreye alır. <code>show service-policy</code> ile hangi politikanın gerçekte aktif olduğunu kontrol edin.", label: 'Service Policy Adı', type: 'text', required: true, placeholder: 'GLOBAL_POLICY', hint: 'service-policy komutunda kullanılacak isim' },
                        { name: 'sp_scope', why: "<b>global</b> seçilirse politika tüm arayüzlere uygulanır ama arayüz bazlı bir service-policy varsa <b>o</b> önceliklidir ve global olan o arayüzde çalışmaz. Bu öncelik sırası sık gözden kaçar.", label: 'Kapsam', type: 'select', options: [
                            { value: 'global', label: 'Global (tüm interface)', selected: true },
                            { value: 'interface', label: 'Belirli Interface' }
                        ]},
                        { name: 'sp_iface', why: "Arayüz bazlı uygulama global politikayı o arayüzde tamamen devre dışı bırakır; yani mevcut varsayılan inspect’leri de kaybedersiniz. Gerekli inspect satırlarını yeni politikaya elle eklemelisiniz.", label: 'Interface (Nameif)', type: 'text', requiredIf: { field: 'sp_scope', in: ['interface'] }, placeholder: 'outside', hint: 'Belirli interface seçiliyse nameif girin' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaMpfGen(data);
        });
    }
};
function cgAsaMpfGen(data) {
    const className = cgEsc(data.class_name || ''), classAcl = cgEsc(data.class_acl || '');
    const matchSrc = cgEsc(data.match_src || 'any'), matchDst = cgEsc(data.match_dst || 'any');
    const matchPort = cgEsc(data.match_port || '');
    const policyName = cgEsc(data.policy_name || ''), inspectProto = cgEsc(data.inspect_proto || 'http');
    const enableInspect = data.enable_inspect;
    const spName = cgEsc(data.sp_name || ''), spScope = cgEsc(data.sp_scope || 'global');
    const spIface = cgEsc(data.sp_iface || '');
    let c = '! ========================================\n! Cisco ASA — MPF Service Policy\n! ========================================\n\n';
    c += '! 1. ACL Tanımı\naccess-list ' + classAcl + ' extended permit ' + inspectProto + ' ' + matchSrc + ' ' + matchDst;
    if (matchPort) c += ' ' + matchPort;
    c += '\n!\n\n';
    c += '! 2. Class-Map\nclass-map ' + className + '\n match access-list ' + classAcl + '\n!\n\n';
    c += '! 3. Policy-Map\npolicy-map ' + policyName + '\n class ' + className + '\n';
    if (enableInspect) c += '  inspect ' + inspectProto + '\n';
    c += '!\n\n';
    c += '! 4. Service Policy\n';
    if (spScope === 'global') {
        c += 'service-policy ' + spName + ' global\n\n';
    } else {
        c += 'service-policy ' + spName + ' interface ' + spIface + '\n\n';
    }
    c += '! Doğrulama:\n! show service-policy\n! show service-policy global\n! show service-policy interface ' + (spIface || 'outside') + '\n';
    return c;
}

// ── ASA: Failover HA ──────────────────────────────────────────────────────────
CiscoASA.failoverHA = {
    label: 'Failover HA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sync-alt',
                title: 'ASA Failover HA',
                desc: 'ASA Failover — Active/Standby veya Active/Active yüksek erişilebilirlik. Failover link ve state link konfigürasyonu.'
            },
            configTypes: [
                { id: 'active_standby', label: 'Active/Standby', icon: 'fas fa-toggle-on', desc: 'Tek aktif cihaz, yedek beklemede', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'active_active', label: 'Active/Active', icon: 'fas fa-random', desc: 'Her iki cihaz aktif, context bazlı', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Failover Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'fo_key', why: "Failover anahtarı iki cihazda aynı olmalıdır; yoksa eşleşme kurulmaz ve her iki ASA da kendini <b>active</b> sanarak ağda IP/MAC çakışması yaratır. Anahtar ayrıca config senkronizasyonunu şifreler.", label: 'Failover Key', type: 'text', required: true, placeholder: 'FoSecretKey123', hint: 'Failover iletişim şifreleme anahtarı' },
                        { name: 'fo_iface', why: "Failover link ayrı ve adanmış bir arayüz olmalı, veri trafiği ile paylaşılmamalıdır. Link koparsa split-brain oluşur ve her iki cihaz aynı anda aktif olur.", label: 'Failover Link Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/3', hint: 'Failover kontrolü için kullanılan interface' },
                        { name: 'fo_iface_nameif', why: "Failover arayüzüne verilen ad yalnızca failover için kullanılır; bu arayüze ACL veya NAT bağlamayın. Ad iki cihazda tutarlı olmalıdır.", label: 'Failover Link Nameif', type: 'text', required: true, placeholder: 'failover', hint: 'Failover interface mantıksal adı' }
                    ]
                },
                {
                    title: 'Active/Standby IP Adresleri',
                    icon: 'fas fa-exchange-alt',
                    showFor: ['active_standby'],
                    fields: [
                        { name: 'active_ip', why: "Failover link üzerindeki aktif cihazın IP’si. Standby IP ile aynı subnette olmalı, aksi halde iki ASA birbirini hiç göremez ve senkronizasyon başlamaz.", label: 'Aktif Cihaz IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.1', hint: 'Failover link — aktif ASA IP' },
                        { name: 'standby_ip', why: "Standby adresi yalnızca failover için ayrılmıştır ve ağda başka bir cihaza verilmemelidir. Çakışma, rol değişimlerinde öngörülemeyen kopmalara yol açar.", label: 'Standby Cihaz IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.2', hint: 'Failover link — standby ASA IP' },
                        { name: 'fo_mask', why: "Failover linki genelde /30 bir point-to-point ağdır. Maske hatası iki cihazın birbirini komşu görememesine ve sürekli rol yarışına neden olur.", label: 'Subnet Mask', type: 'text', required: true, validate: 'subnet', placeholder: '255.255.255.252', hint: 'Failover link subnet maskesi' },
                        { name: 'state_iface', why: "Stateful link olmadan failover çalışır ama devralma anında <b>tüm mevcut oturumlar düşer</b>; kullanıcılar kopma yaşar. Yoğun ortamlarda ayrı bir stateful link şarttır.", label: 'State Link Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'GigabitEthernet0/2', hint: 'Session state senkronizasyon interface' },
                        { name: 'state_active_ip', why: "State link IP’si failover link ile aynı subnette olmamalıdır; ikisi ayrı L2 segmentlerde tutulursa tek bir kablo arızası her ikisini birden düşürmez.", label: 'State Link Aktif IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.1.1', hint: 'State link — aktif IP' },
                        { name: 'state_standby_ip', why: "Standby tarafındaki state adresi; yanlış girilirse oturum tablosu hiç kopyalanmaz ve failover sonrası bağlantılar sıfırdan kurulur.", label: 'State Link Standby IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.1.2', hint: 'State link — standby IP' },
                        { name: 'state_mask', why: "State linki genelde /30’dur. Maske uyuşmazlığı senkronizasyonun sessizce çalışmamasına yol açar — <code>show failover state</code> ile doğrulayın.", label: 'State Link Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.252', hint: 'State link subnet maskesi' }
                    ]
                },
                {
                    title: 'Active/Active Failover Grubu',
                    icon: 'fas fa-layer-group',
                    showFor: ['active_active'],
                    fields: [
                        { name: 'aa_grp1_active', why: "Active/Active modda her failover grubu ayrı bir security context’e aittir ve yük iki cihaza bölünür. Her iki grubu da aynı cihazda aktif bırakmak Active/Standby’den farksız hale getirir.", label: 'Grup 1 — Aktif Cihaz', type: 'select', options: [
                            { value: 'primary', label: 'primary', selected: true },
                            { value: 'secondary', label: 'secondary' }
                        ], hint: 'Bu grubun normalde aktif olduğu birim' },
                        { name: 'aa_grp2_active', why: "İkinci grubu diğer cihazda aktif tutmak yükü dağıtır, ancak bir cihaz düştüğünde tek cihaz <b>iki katı</b> trafiği taşımak zorunda kalır. Kapasiteyi buna göre planlayın.", label: 'Grup 2 — Aktif Cihaz', type: 'select', options: [
                            { value: 'primary', label: 'primary' },
                            { value: 'secondary', label: 'secondary', selected: true }
                        ], hint: 'Bu grubun normalde aktif olduğu birim' },
                        { name: 'aa_active_ip', why: "Active/Active kurulumunda failover link IP’si; multiple context modu gerektirir ve tek context ile bu mod kullanılamaz.", label: 'Failover Link Aktif IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.1', hint: 'Failover link IP' },
                        { name: 'aa_standby_ip', why: "Standby tarafın failover link adresi. Aynı subnette olmadığında gruplar hiç eşleşmez ve her iki cihaz kendi kararını verir.", label: 'Failover Link Standby IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.2', hint: 'Failover link standby IP' },
                        { name: 'aa_mask', why: "Failover link maskesi; iki cihazda birebir aynı olmalıdır. Tutarsızlık, rol müzakeresinin hiç başlamamasına neden olur.", label: 'Subnet Mask', type: 'text', required: true, validate: 'subnet', placeholder: '255.255.255.252', hint: 'Failover link maskesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaFailoverGen(data);
        });
    }
};
function cgAsaFailoverGen(data) {
    const foType = cgEsc(data._cgtype || 'active_standby');
    const foKey = cgEsc(data.fo_key || ''), foIface = cgEsc(data.fo_iface || '');
    const foIfaceNameif = cgEsc(data.fo_iface_nameif || 'failover');
    let c = '! ========================================\n! Cisco ASA — Failover HA\n! ========================================\n\n';
    c += 'failover\nfailover key ' + foKey + '\n\n';
    if (foType === 'active_standby') {
        const activeIp = cgEsc(data.active_ip || ''), standbyIp = cgEsc(data.standby_ip || '');
        const foMask = cgEsc(data.fo_mask || '');
        const stateIface = cgEsc(data.state_iface || ''), stateActiveIp = cgEsc(data.state_active_ip || '');
        const stateStandbyIp = cgEsc(data.state_standby_ip || ''), stateMask = cgEsc(data.state_mask || '');
        c += '! Failover Link\ninterface ' + foIface + '\n no shutdown\n!\n';
        c += 'failover interface ip ' + foIfaceNameif + ' ' + activeIp + ' ' + foMask + ' standby ' + standbyIp + '\n';
        c += 'failover link ' + foIfaceNameif + ' ' + foIface + '\n\n';
        if (stateIface && stateActiveIp) {
            c += '! State Link\ninterface ' + stateIface + '\n no shutdown\n!\n';
            c += 'failover interface ip stateful ' + stateActiveIp + ' ' + stateMask + ' standby ' + stateStandbyIp + '\n';
            c += 'failover state-link stateful ' + stateIface + '\n\n';
        }
        c += '! Bu konfigürasyonu aktif cihaza uygula\n! Standby cihaz otomatik sync alır\n\n';
    } else {
        const grp1Active = cgEsc(data.aa_grp1_active || ''), grp2Active = cgEsc(data.aa_grp2_active || '');
        const aaActiveIp = cgEsc(data.aa_active_ip || ''), aaStandbyIp = cgEsc(data.aa_standby_ip || '');
        const aaMask = cgEsc(data.aa_mask || '');
        c += '! Active/Active — Multi-Context gereklidir\nmode multiple\n\n';
        c += '! Failover Link\ninterface ' + foIface + '\n no shutdown\n!\n';
        c += 'failover interface ip ' + foIfaceNameif + ' ' + aaActiveIp + ' ' + aaMask + ' standby ' + aaStandbyIp + '\n';
        c += 'failover link ' + foIfaceNameif + ' ' + foIface + '\n\n';
        c += '! Failover Grupları\nfailover group 1\n ' + (grp1Active === 'secondary' ? 'secondary' : 'primary') + '\n preempt\n!\n';
        c += 'failover group 2\n ' + (grp2Active === 'secondary' ? 'secondary' : 'primary') + '\n preempt\n!\n\n';
    }
    c += '! Doğrulama:\n! show failover\n! show failover state\n! show failover statistics\n';
    return c;
}

// ── ASA: AAA RADIUS ───────────────────────────────────────────────────────────
CiscoASA.aaaRadius = {
    label: 'AAA RADIUS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'ASA AAA RADIUS',
                desc: 'ASA AAA RADIUS — RADIUS sunucu grubu tanımı, timeout, retry ve kimlik doğrulama protokolü.'
            },
            sections: [
                {
                    title: 'RADIUS Sunucu Grubu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'grp_name', why: "Server-group adı SSH, ASDM ve VPN satırlarının tamamında referans verilir; ad değişikliği bu satırların hepsini birden kırar ve kimlik doğrulama sessizce atlanabilir.", label: 'Server Group Adı', type: 'text', required: true, placeholder: 'RADIUS-SERVERS', hint: 'AAA server-group tanımı için isim' },
                        { name: 'rad_iface', why: "RADIUS trafiği bu arayüzden çıkar; yanlış arayüz seçilirse paketler sunucuya hiç ulaşmaz ve her giriş timeout’a düşer. Sunucu tarafında da ASA’nın bu arayüz IP’si NAS client olarak tanımlı olmalıdır.", label: 'Bağlantı Interface (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'RADIUS sunucusuna erişim interface' }
                    ]
                },
                {
                    title: 'Birincil RADIUS Sunucu',
                    icon: 'fas fa-star',
                    fields: [
                        { name: 'rad1_ip', why: "Birincil RADIUS sunucusu erişilemezse ASA sıradaki sunucuya geçer; tek sunucu tanımlıysa yönetim erişimi tamamen durur. Yerel fallback hesabı mutlaka bulunmalıdır.", label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Birincil RADIUS sunucu IP adresi' },
                        { name: 'rad1_key', why: "Yanlış secret’ta sunucu paketi <b>sessizce düşürür</b>; ASA bunu timeout olarak raporlar. Bu yüzden semptom ağ sorunu gibi görünür ama sebep anahtar uyuşmazlığıdır.", label: 'Shared Secret', type: 'text', required: true, placeholder: 'radius_secret_key', hint: 'ASA ve sunucu arasında paylaşılan gizli anahtar' },
                        { name: 'rad1_auth_port', why: "Modern sunucular <b>1812</b> kullanır, ASA varsayılanı ise eski <b>1645</b>’tir. Portu açıkça yazmazsanız istekler yanlış porta gidip cevapsız kalır.", label: 'Auth Port', type: 'text', validate: 'port', optional: true, placeholder: '1812', hint: 'RADIUS authentication portu (default: 1645)' },
                        { name: 'rad1_acct_port', why: "Accounting portu varsayılan olarak 1646’dır, standart ise 1813’tür. Yanlış port oturum kayıtlarının hiç tutulmamasına yol açar; kimlik doğrulama çalışsa bile loglar boş kalır.", label: 'Accounting Port', type: 'text', validate: 'port', optional: true, placeholder: '1813', hint: 'RADIUS accounting portu (default: 1646)' }
                    ]
                },
                {
                    title: 'İkincil RADIUS Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'rad2_ip', why: "İkinci sunucu tanımlamak tek arıza noktasını kaldırır. Yalnızca birincil sunucu varsa bakım penceresi sırasında tüm yönetim ve VPN girişleri kesilir.", label: 'Sunucu IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.101', hint: 'Yedek RADIUS sunucu (opsiyonel)' },
                        { name: 'rad2_key', why: "İkincil sunucunun secret’ı farklı olabilir; yanlış girilirse failover sırasında sessizce devreye girmez ve yedek olmadığını ancak arıza anında fark edersiniz.", label: 'Shared Secret', type: 'text', optional: true, placeholder: 'radius_secret_key', hint: 'İkincil sunucu shared secret' }
                    ]
                },
                {
                    title: 'Timeout ve Retry Ayarları',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'timeout', why: "Timeout çok yüksekse başarısız sunucu her girişte kullanıcıyı uzun süre bekletir; çok düşükse yavaş ama sağlıklı sunucu boşuna ölü sayılır. 5-10 saniye tipik bir dengedir.", label: 'Timeout (saniye)', type: 'text', optional: true, placeholder: '10', hint: 'RADIUS sunucu yanıt bekleme süresi (default: 10)' },
                        { name: 'retries', why: "Retry sayısı yüksek tutulursa toplam bekleme süresi katlanır (timeout × retry) ve kullanıcı giriş ekranında kilitlenmiş gibi hisseder.", label: 'Retry Sayısı', type: 'text', optional: true, placeholder: '3', hint: 'Başarısız deneme tekrar sayısı (default: 3)' },
                        { name: 'dead_time', why: "Ölü işaretlenen sunucu bu süre boyunca hiç denenmez; çok uzun verilirse geri gelen sunucu gereksiz yere devre dışı kalır, çok kısa verilirse her istekte tekrar timeout yaşanır.", label: 'Dead Time (dakika)', type: 'text', optional: true, placeholder: '10', hint: 'Erişilemeyen sunucunun tekrar denenmesi için bekleme süresi' }
                    ]
                },
                {
                    title: 'AAA Uygulama',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'apply_ssh', why: "Bu seçenek açıkken RADIUS erişilemezse SSH ile cihaza giremezsiniz. Komut satırında <code>LOCAL</code> yedeğini eklemek kilitlenmeye karşı tek güvencedir.", label: 'SSH Authentication', type: 'checkbox', checked: true, hint: 'SSH yönetim erişimi için RADIUS kullan' },
                        { name: 'apply_http', why: "ASDM erişimini RADIUS’a bağlamak sunucu arızasında grafik yönetimi de kapatır. En az bir yerel yönetici hesabı ve <code>http</code> izin satırı bırakın.", label: 'ASDM Authentication', type: 'checkbox', checked: false, hint: 'ASDM web erişimi için RADIUS kullan' },
                        { name: 'apply_vpn', why: "VPN kullanıcılarının RADIUS ile doğrulanması merkezi politika sağlar, ancak sunucu çöktüğünde <b>tüm</b> uzak erişim durur. Yedek sunucu tanımlamak bu riski azaltır.", label: 'VPN Authentication', type: 'checkbox', checked: true, hint: 'VPN kullanıcı doğrulaması için RADIUS kullan' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAaaRadiusGen(data);
        });
    }
};
function cgAsaAaaRadiusGen(data) {
    const grpName = cgEsc(data.grp_name || ''), radIface = cgEsc(data.rad_iface || '');
    const rad1Ip = cgEsc(data.rad1_ip || ''), rad1Key = cgEsc(data.rad1_key || '');
    const rad1AuthPort = cgEsc(data.rad1_auth_port || ''), rad1AcctPort = cgEsc(data.rad1_acct_port || '');
    const rad2Ip = cgEsc(data.rad2_ip || ''), rad2Key = cgEsc(data.rad2_key || '');
    const timeout = cgEsc(data.timeout || '10'), retries = cgEsc(data.retries || '3');
    const deadTime = cgEsc(data.dead_time || '');
    const applySsh = data.apply_ssh, applyHttp = data.apply_http, applyVpn = data.apply_vpn;
    let c = '! ========================================\n! Cisco ASA — AAA RADIUS\n! ========================================\n\n';
    c += '! RADIUS Server Group\naaa-server ' + grpName + ' protocol radius\n';
    if (deadTime) c += ' deadtime ' + deadTime + '\n';
    c += '!\n\n';
    c += '! Birincil RADIUS Sunucu\naaa-server ' + grpName + ' (' + radIface + ') host ' + rad1Ip + '\n';
    c += ' key ' + rad1Key + '\n';
    c += ' timeout ' + timeout + '\n';
    c += ' retry-interval ' + retries + '\n';
    if (rad1AuthPort) c += ' authentication-port ' + rad1AuthPort + '\n';
    if (rad1AcctPort) c += ' accounting-port ' + rad1AcctPort + '\n';
    c += '!\n\n';
    if (rad2Ip && rad2Key) {
        c += '! İkincil RADIUS Sunucu\naaa-server ' + grpName + ' (' + radIface + ') host ' + rad2Ip + '\n';
        c += ' key ' + rad2Key + '\n';
        c += ' timeout ' + timeout + '\n';
        c += ' retry-interval ' + retries + '\n!\n\n';
    }
    c += '! AAA Authentication Kuralları\n';
    if (applySsh) c += 'aaa authentication ssh console ' + grpName + ' LOCAL\n';
    if (applyHttp) c += 'aaa authentication http console ' + grpName + ' LOCAL\n';
    if (applyVpn) c += 'aaa authentication match ANY_TRAFFIC ' + radIface + ' ' + grpName + '\n';
    c += '\n! Doğrulama:\n! show aaa-server\n! show aaa-server ' + grpName + '\n! show aaa-server ' + grpName + ' host ' + rad1Ip + '\n';
    c += '! test aaa-server authentication ' + grpName + ' host ' + rad1Ip + ' username testuser password testpass\n';
    return c;
}

// ── ASA: OSPF ─────────────────────────────────────────────────────────────────
CiscoASA.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'ASA OSPF',
                desc: 'ASA OSPF — OSPF process, network duyurusu ve interface parametreleri. Router-ID ve area konfigürasyonu.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', why: "Process ID yalnızca yereldir, komşuyla aynı olması gerekmez; ancak ASA’da aynı anda sınırlı sayıda OSPF süreci çalışabilir. Var olan bir ID’yi tekrar kullanmak mevcut yapılandırmayı değiştirir.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', why: "Router-ID elle verilmezse ASA en yüksek arayüz IP’sini seçer; o arayüz kapandığında ID değişir ve <b>tüm komşuluklar sıfırlanır</b>. Sabit bir loopback/ID vermek bu kesintiyi önler.", label: 'Router ID', type: 'text', validate: 'ip', optional: true, placeholder: '1.1.1.1', hint: 'OSPF Router-ID (opsiyonel)' },
                        { name: 'network', why: "ASA’da OSPF <code>network</code> satırı wildcard maske ile eşleşen arayüzlerde OSPF’i açar. Kapsamı geniş tutmak istemeden WAN arayüzünde de komşuluk kurmaya ve iç topolojinin dışarı sızmasına yol açar.", label: 'Network', type: 'text', required: true, placeholder: '192.168.1.0', hint: 'OSPF duyurulacak ağ' },
                        { name: 'wildcard', why: "OSPF wildcard maskesi normal subnet maskesinin tersidir (255.255.255.0 → 0.0.0.255). Subnet maskesi yazmak komşuluk kurulmamasının klasik nedenidir.", label: 'Wildcard Mask', type: 'text', required: true, placeholder: '0.0.0.255', hint: 'Ters subnet maskesi' },
                        { name: 'area', why: "Komşu arayüzler aynı area’da olmalıdır; area uyuşmazlığında hello paketleri gelir ama komşuluk <b>ExStart</b>’ta takılır. Backbone dışı area’lar area 0’a bağlanmak zorundadır.", label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'OSPF area numarası' }
                    ]
                },
                {
                    title: 'Interface OSPF Parametreleri',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "OSPF’in bu arayüzde gerçekten açıldığını <code>show ospf interface</code> ile doğrulayın. Arayüz security-level veya ACL nedeniyle OSPF çoklu yayınını engelliyorsa komşuluk hiç kurulmaz.", label: 'Interface (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'OSPF etkinleştirilecek interface nameif' },
                        { name: 'cost', why: "Cost, yol seçimini doğrudan belirler ve yalnızca bir tarafta değiştirmek asimetrik yönlendirmeye yol açar — stateful firewall için bu kopan oturum demektir. Her iki uçta tutarlı planlayın.", label: 'OSPF Cost', type: 'text', optional: true, placeholder: '10', hint: 'Interface OSPF metrik değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaOspfGen(data);
        });
    }
};
function cgAsaOspfGen(data) {
    const pid = cgEsc(data.pid || ''), network = cgEsc(data.network || ''), wc = cgEsc(data.wildcard || '');
    const area = cgEsc(data.area || ''), iface = cgEsc(data.iface || '');
    const cost = cgEsc(data.cost || ''), rid = cgEsc(data.router_id || '');
    let c = '! ========================================\n! Cisco ASA — OSPF Configuration\n! ========================================\n\n';
    c += 'router ospf ' + pid + '\n';
    if (rid) c += ' router-id ' + rid + '\n';
    c += ' network ' + network + ' ' + wc + ' area ' + area + '\n';
    c += ' log-adj-changes\n!\n\n';
    if (cost) {
        c += '! OSPF Interface Parameters\ninterface ' + iface + '\n ospf cost ' + cost + '\n ospf hello-interval 10\n ospf dead-interval 40\n!\n\n';
    }
    c += '! Doğrulama:\n! show ospf\n! show ospf neighbor\n! show ospf database\n! show route ospf\n';
    return c;
}

// ── ASA: AnyConnect SSL VPN ───────────────────────────────────────────────────
CiscoASA.anyconnect = {
    label: 'AnyConnect VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'ASA AnyConnect VPN',
                desc: 'ASA AnyConnect SSL VPN — WebVPN, IP pool, group-policy ve tunnel-group konfigürasyonu.'
            },
            sections: [
                {
                    title: 'WebVPN ve Image',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'outside', why: "WebVPN bu arayüzde <code>enable</code> edilmezse istemciler bağlanamaz. Aynı arayüzde ASDM için HTTPS dinliyorsa port çakışması yaşanır; ASDM portunu değiştirmek gerekir.", label: 'Outside Interface (Nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'VPN bitiş interface nameif değeri' },
                        { name: 'ac_image', why: "Paket dosyası gerçekten <code>disk0:</code> üzerinde olmalı ve dosya adı birebir eşleşmelidir; eksik veya yanlış adlı paket bağlantıyı istemci indirme aşamasında düşürür. İşletim sistemi başına ayrı paket gerekir.", label: 'AnyConnect Image Adı', type: 'text', required: true, placeholder: 'anyconnect-win-4.10.pkg', hint: 'disk0:/ sonrasındaki dosya adı' }
                    ]
                },
                {
                    title: 'IP Pool',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'pool_name', why: "Havuz adı group-policy ve tunnel-group içinde referans edilir; ad uyuşmazlığında kullanıcı doğrulanır ama <b>IP alamaz</b> ve bağlantı yarıda kalır.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'VPN-POOL', hint: 'IP havuzu tanımı için isim' },
                        { name: 'pool_start', why: "Havuz aralığı iç ağ ile çakışmamalıdır; çakışırsa yönlendirme belirsizleşir ve VPN istemcileri iç kaynaklara ulaşamaz. Ayrıca bu subnet iç yönlendirmede ASA’ya işaret etmelidir.", label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.0.1', hint: 'Havuz başlangıç adresi' },
                        { name: 'pool_end', why: "Havuz boyutu eşzamanlı kullanıcı sayısından küçükse fazladan kullanıcılar <b>adres yok</b> hatasıyla reddedilir. Büyüme payı bırakın.", label: 'Pool Bitiş IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.0.254', hint: 'Havuz bitiş adresi' },
                        { name: 'pool_mask', why: "Maske, havuzun bulunduğu mantıksal subnet ile tutarlı olmalıdır. Yanlış maske istemcinin iç ağa giden trafiğini yanlış yönlendirir.", label: 'Pool Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Havuz subnet maskesi' }
                    ]
                },
                {
                    title: 'Group Policy ve Tunnel Group',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'gp_name', why: "Group-policy, DNS, split-tunnel ve protokol ayarlarını taşır; tunnel-group’a bağlanmazsa kullanıcılar <code>DfltGrpPolicy</code> ayarlarını alır ve beklediğiniz politika hiç uygulanmaz.", label: 'Group Policy Adı', type: 'text', required: true, placeholder: 'GP-REMOTE', hint: 'VPN grup politikası ismi' },
                        { name: 'tg_name', why: "Tunnel-group (connection profile) adı, istemcinin seçtiği profile karşılık gelir. Yanlış profile düşen kullanıcı farklı bir havuz ve farklı yetkilerle bağlanabilir.", label: 'Tunnel Group Adı', type: 'text', required: true, placeholder: 'REMOTE-VPN', hint: 'Bağlantı profili ismi' },
                        { name: 'tg_alias', why: "Alias yalnızca giriş ekranında görünen addır ama <code>tunnel-group-list enable</code> yapılmazsa kullanıcı listede hiçbir profil göremez ve varsayılana düşer.", label: 'Tunnel Group Alias', type: 'text', required: true, placeholder: 'Corporate VPN', hint: 'Login ekranında görünecek bağlantı adı' },
                        { name: 'dns', why: "VPN istemcisine DNS verilmezse iç kaynaklara isimle erişilemez, yalnızca IP ile ulaşılır. Split-tunnel ile birlikte split-dns de ayarlanmazsa iç alan adları dış DNS’e sorulur.", label: 'DNS Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.53', hint: 'VPN bağlantısı için DNS sunucusu' },
                        { name: 'split_acl', why: "Boş bırakılırsa <b>full tunnel</b> uygulanır ve kullanıcının tüm internet trafiği ASA üzerinden geçer; bu, hem bant genişliği hem NAT/hairpin ayarı gerektirir. Split tunnel ise güvenlik denetimini azaltır.", label: 'Split Tunnel ACL Adı', type: 'text', optional: true, placeholder: 'SPLIT-ACL', hint: 'Boş bırakılırsa full tunnel' },
                        { name: 'split_net', why: "Split ACL’de yalnızca tünelden geçmesi istenen ağlar listelenmelidir; fazla geniş yazmak tüm trafiği tünele sokar, eksik yazmak bazı iç kaynakları erişilemez kılar.", label: 'Split Tunnel Network', type: 'text', optional: true, placeholder: '10.0.0.0 255.0.0.0', hint: 'Split ACL varsa tünel içi ağ' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAnyconnectGen(data);
        });
    }
};
function cgAsaAnyconnectGen(data) {
    const outside = cgEsc(data.outside || ''), acImage = cgEsc(data.ac_image || '');
    const poolName = cgEsc(data.pool_name || ''), poolStart = cgEsc(data.pool_start || '');
    const poolEnd = cgEsc(data.pool_end || ''), poolMask = cgEsc(data.pool_mask || '');
    const gpName = cgEsc(data.gp_name || ''), tgName = cgEsc(data.tg_name || ''), tgAlias = cgEsc(data.tg_alias || '');
    const dns = cgEsc(data.dns || ''), splitAcl = cgEsc(data.split_acl || ''), splitNet = cgEsc(data.split_net || '');
    let c = '! ========================================\n! Cisco ASA — AnyConnect SSL VPN\n! ========================================\n\n';
    c += '! 1. WebVPN Etkinleştir\nwebvpn\n enable ' + outside + '\n anyconnect image disk0:/' + acImage + ' 1\n anyconnect enable\n!\n\n';
    c += '! 2. IP Pool\nip local pool ' + poolName + ' ' + poolStart + '-' + poolEnd + ' mask ' + poolMask + '\n!\n\n';
    if (splitAcl && splitNet) {
        c += '! 3. Split Tunnel ACL\naccess-list ' + splitAcl + ' standard permit ' + splitNet + '\n!\n\n';
    }
    c += '! 4. Group Policy\ngroup-policy ' + gpName + ' internal\ngroup-policy ' + gpName + ' attributes\n';
    c += ' vpn-tunnel-protocol ssl-client\n';
    if (dns) c += ' dns-server value ' + dns + '\n';
    if (splitAcl) {
        c += ' split-tunnel-policy tunnelspecified\n split-tunnel-network-list value ' + splitAcl + '\n';
    } else {
        c += ' split-tunnel-policy tunnelall\n';
    }
    c += '!\n\n';
    c += '! 5. Tunnel Group\ntunnel-group ' + tgName + ' type remote-access\ntunnel-group ' + tgName + ' general-attributes\n';
    c += ' address-pool ' + poolName + '\n default-group-policy ' + gpName + '\n!\n';
    c += 'tunnel-group ' + tgName + ' webvpn-attributes\n group-alias "' + tgAlias + '" enable\n!\n\n';
    c += '! Doğrulama:\n! show vpn-sessiondb anyconnect\n! show webvpn anyconnect\n! show run webvpn\n! show run tunnel-group ' + tgName + '\n';
    return c;
}

// ── ASA: Object Groups ────────────────────────────────────────────────────────
CiscoASA.objectgroup = {
    label: 'Object Groups',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-object-group',
                title: 'ASA Object Groups',
                desc: 'ASA Object Groups — network ve service grupları tanımlayarak ACL kurallarını basitleştirme.'
            },
            configTypes: [
                { id: 'network', label: 'Network Group', icon: 'fas fa-network-wired', desc: 'IP adresi/subnet grupları', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'service', label: 'Service Group', icon: 'fas fa-plug', desc: 'TCP/UDP port grupları', badge: { text: 'Port Grubu', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Network Object Grubu',
                    icon: 'fas fa-network-wired',
                    showFor: ['network'],
                    fields: [
                        { name: 'net_obj_name', why: "Object adları ACL ve NAT satırlarında kullanıldığında yapılandırma okunabilir hale gelir; ancak kullanılan bir nesneyi silmek ona bağlı tüm satırları da kaldırır.", label: 'Network Object Adı', type: 'text', required: true, placeholder: 'OBJ-WEB-SERVERS', hint: 'Tekil network nesnesi için isim' },
                        { name: 'net_subnet', why: "Nesnenin subnet değeri değiştirildiğinde ona referans veren <b>tüm</b> ACL ve NAT kuralları anında etkilenir. Tek satırlık bir düzenleme beklenmedik erişim açabilir.", label: 'Subnet (IP + Mask)', type: 'text', required: true, placeholder: '10.1.2.0 255.255.255.0', hint: 'Nesne subnet değeri' },
                        { name: 'net_grp_name', why: "Object-group kullanmak ACL satır sayısını azaltır ama ASA bunları arka planda tek tek genişletir; aşırı büyük gruplar kural sayısını ve bellek kullanımını hızla artırır.", label: 'Object Group Adı', type: 'text', required: true, placeholder: 'GRP-SERVERS', hint: 'Object group için isim' },
                        { name: 'net_grp_desc', why: "Açıklama <code>show run object-group</code> çıktısında görünür ve grubun neden var olduğunu belgeler. Açıklamasız gruplar zamanla kimsenin silmeye cesaret edemediği ölü kurallara dönüşür.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'Sunucu grubu', hint: 'Object group açıklaması' },
                        { name: 'net_extra', why: "Gruba eklenen her üye, o grubu kullanan tüm ACL satırlarına anında yansır. Yanlışlıkla geniş bir subnet eklemek tek hamlede istenmeyen erişim açabilir.", label: 'Ek Üye', type: 'text', optional: true, placeholder: 'host 10.1.2.50', hint: 'Gruba eklenecek ek eleman' }
                    ]
                },
                {
                    title: 'Service Object Grubu',
                    icon: 'fas fa-plug',
                    showFor: ['service'],
                    fields: [
                        { name: 'svc_grp_name', why: "Servis grubu, aynı port kümesini birden çok kuralda tekrar yazmayı önler. Gruptan bir port çıkarmak ise o portu kullanan tüm kuralları aynı anda etkiler.", label: 'Service Group Adı', type: 'text', required: true, placeholder: 'GRP-WEB-PORTS', hint: 'Port grubu için isim' },
                        { name: 'svc_proto', why: "TCP ve UDP için ayrı gruplar gerekir; tek grupta karıştırmak yerine <code>service-group tcp-udp</code> kullanılmalıdır. Yanlış protokol seçimi kuralın hiç eşleşmemesine yol açar.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'tcp-udp', label: 'TCP-UDP' }
                        ]},
                        { name: 'svc_ports', why: "Portlar boşlukla ayrılır ve <code>www</code> gibi isimler kullanılabilir. Gereğinden fazla port eklemek saldırı yüzeyini sessizce genişletir; listeyi düzenli gözden geçirin.", label: 'Port Listesi', type: 'text', required: true, placeholder: 'www https 8080', hint: 'Boşlukla ayrılmış port adı/numaraları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaObjGrpGen(data);
        });
    }
};
function cgAsaObjGrpGen(data) {
    const type = cgEsc(data._cgtype || 'network');
    let c = '! ========================================\n! Cisco ASA — Object Groups\n! ========================================\n\n';
    if (type === 'network') {
        const objName = cgEsc(data.net_obj_name || ''), subnet = cgEsc(data.net_subnet || '');
        const grpName = cgEsc(data.net_grp_name || ''), desc = cgEsc(data.net_grp_desc || '');
        const extra = cgEsc(data.net_extra || '');
        c += '! Network Object\nobject network ' + objName + '\n subnet ' + subnet + '\n!\n\n';
        c += '! Network Object Group\nobject-group network ' + grpName + '\n';
        if (desc) c += ' description ' + desc + '\n';
        c += ' network-object object ' + objName + '\n';
        if (extra) c += ' network-object ' + extra + '\n';
        c += '!\n\n';
        c += '! ACL\'de kullanım:\n! access-list OUTSIDE_IN extended permit tcp any object-group ' + grpName + ' eq https\n';
    } else {
        const grpName = cgEsc(data.svc_grp_name || ''), proto = cgEsc(data.svc_proto || 'tcp');
        const ports = cgEsc(data.svc_ports || '').split(/\s+/).filter(Boolean);
        c += '! Service Object Group\nobject-group service ' + grpName + ' ' + proto + '\n';
        ports.forEach(p => { c += ' port-object eq ' + p + '\n'; });
        c += '!\n\n';
        c += '! ACL\'de kullanım:\n! access-list OUTSIDE_IN extended permit ' + proto + ' any any object-group ' + grpName + '\n';
    }
    c += '\n! Doğrulama:\n! show object-group\n! show run object-group\n';
    return c;
}

// ════════════════════════════════════════════════════════════════════════════
// Agent Y eklemeleri (2026-09-24). Bu bölümdeki araçlarda yorum karakteri '!'
// kullanıldı (ASA running-config ayracı). Resmi ASA kitabında belgelenen yorum
// ':' dır; '#' belgelenmemiştir — bkz. ~/inventory/notes/arastirma-asa-ftd.md
// ════════════════════════════════════════════════════════════════════════════

// ── ASA: Syslog / Logging ─────────────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/monitor-syslog.html
CiscoASA.logging = {
    label: 'Syslog / Logging',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'ASA Syslog / Logging',
                desc: 'ASA logging — <code>logging enable</code>, zaman damgası, iç tampon (buffered), syslog sunucusu (<code>logging host</code>) ve trap seviyesi.'
            },
            sections: [
                {
                    title: 'Syslog Sunucusu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'log_host_if', label: 'Sunucuya Giden Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'Syslog sunucusuna ulaşılan arayüzün nameif değeri', why: "ASA, syslog paketini <b>bu arayüzden</b> gönderir; route tablosuna bakmaz. Yanlış nameif yazılırsa loglar sessizce kaybolur ve <code>show logging</code> çıktısında sunucu için gönderim sayacı artmaz." },
                        { name: 'log_host_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Syslog / SIEM sunucusu', why: "Olay incelemesinde elinizdeki tek kalıcı kayıt budur; iç tampon yeniden başlatmada silinir. Sunucu adresi yanlışsa ASA hata vermez, loglar sadece hiç ulaşmaz." },
                        { name: 'log_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'udp', label: 'UDP (varsayılan 514)', selected: true },
                            { value: 'tcp', label: 'TCP (varsayılan 1470)' }
                        ], hint: 'Taşıma protokolü', why: "UDP kayıp olabilir ama sunucu çökse bile trafiği etkilemez. <b>TCP</b> seçilirse ve sunucu erişilemezse ASA varsayılan olarak <b>yeni bağlantıları engeller</b>; bunu istemiyorsanız <code>logging permit-hostdown</code> gerekir." },
                        { name: 'log_port', label: 'Port', type: 'text', validate: 'port', placeholder: '514', hint: 'Boş bırakılırsa protokolün varsayılan portu kullanılır', why: "Sunucu standart dışı bir portta dinliyorsa buraya yazılmalıdır; port uyuşmazlığında paketler sunucuya ulaşır ama işlenmez." },
                        { name: 'log_hostdown', label: 'TCP sunucu düşünce trafiğe izin ver (permit-hostdown)', type: 'checkbox', checked: false, hint: 'Yalnızca TCP seçiliyse çıktıya girer', why: "TCP syslog kullanılırken bu seçenek kapalıysa sunucu arızası <b>tüm yeni bağlantıları durdurur</b> (denetim gereği). Kesintiye tahammül yoksa açın; ancak o süre loglanmayan trafik geçer." }
                    ]
                },
                {
                    title: 'Seviyeler ve Tampon',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'log_trap', label: 'Sunucuya Gönderilecek Seviye (trap)', type: 'select', options: [
                            { value: 'errors', label: '3 - errors' },
                            { value: 'warnings', label: '4 - warnings' },
                            { value: 'notifications', label: '5 - notifications' },
                            { value: 'informational', label: '6 - informational (bağlantı kayıtları)', selected: true },
                            { value: 'debugging', label: '7 - debugging' }
                        ], hint: 'Bu seviye ve daha kritik mesajlar sunucuya gider', why: "Bağlantı kurulum/sonlanma kayıtları (302013/302014 vb.) <b>informational</b> seviyededir; daha düşük seçilirse SIEM erişim geçmişini göremez. <b>debugging</b> ise CPU ve bant genişliğini ciddi artırır." },
                        { name: 'log_buffered', label: 'İç Tampon Seviyesi (buffered)', type: 'select', options: [
                            { value: '', label: 'Kapalı' },
                            { value: 'errors', label: '3 - errors' },
                            { value: 'warnings', label: '4 - warnings', selected: true },
                            { value: 'notifications', label: '5 - notifications' },
                            { value: 'informational', label: '6 - informational' }
                        ], hint: '<code>show logging</code> ile cihaz üzerinde okunan kayıtlar', why: "Tampon, sunucuya ulaşılamadığında bile son olayları cihazda görmenizi sağlar. Informational gibi yüksek seviyeler küçük tamponu saniyeler içinde doldurur ve eski kayıtlar ezilir." },
                        { name: 'log_buf_size', label: 'Tampon Boyutu (bayt)', type: 'text', min: 4096, max: 52428800, placeholder: '65536', hint: 'Boş bırakılırsa cihaz varsayılanı (4096) kalır', why: "Varsayılan 4 KB çok küçüktür; birkaç yüz satırdan sonra eski kayıtlar silinir. Bellek sınırlı modellerde aşırı büyük değer vermeyin." }
                    ]
                },
                {
                    title: 'Mesaj Biçimi',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'log_timestamp', label: 'Zaman Damgası (logging timestamp)', type: 'checkbox', checked: true, hint: 'Her mesaja tarih/saat ekler', why: "Zaman damgası olmadan olayları diğer cihazlarla ilişkilendiremezsiniz. Damga, cihaz saatini kullanır — NTP yapılandırılmamışsa saatler kayar." },
                        { name: 'log_devid', label: 'Cihaz Kimliği (device-id)', type: 'select', options: [
                            { value: '', label: 'Ekleme' },
                            { value: 'hostname', label: 'hostname', selected: true }
                        ], hint: 'Mesajlara cihaz adını ekler', why: "Aynı sunucuya birden çok firewall log gönderiyorsa, özellikle NAT arkasındaysanız, hangi mesajın hangi cihazdan geldiğini ayırmanın en güvenilir yolu budur." },
                        { name: 'log_facility', label: 'Facility', type: 'text', min: 16, max: 23, placeholder: '20', hint: '16-23 (LOCAL0-LOCAL7); boşsa varsayılan 20', why: "SIEM tarafındaki ayrıştırma kuralı belirli bir facility bekliyorsa uyuşmazlık, logların yanlış dosyaya/kaynağa düşmesine yol açar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaLoggingGen(data));
    }
};
function cgAsaLoggingGen(data) {
    const hIf = cgEsc(data.log_host_if || ''), hIp = cgEsc(data.log_host_ip || '');
    const proto = cgEsc(data.log_proto || 'udp'), port = cgEsc(data.log_port || '');
    const trap = cgEsc(data.log_trap || ''), buffered = cgEsc(data.log_buffered || '');
    const bufSize = cgEsc(data.log_buf_size || ''), devid = cgEsc(data.log_devid || '');
    const facility = cgEsc(data.log_facility || '');
    let c = '! ========================================\n! Cisco ASA — Syslog / Logging\n! ========================================\n';
    c += 'logging enable\n';
    if (data.log_timestamp) c += 'logging timestamp\n';
    if (buffered) {
        if (bufSize) c += 'logging buffer-size ' + bufSize + '\n';
        c += 'logging buffered ' + buffered + '\n';
    }
    if (trap) c += 'logging trap ' + trap + '\n';
    if (facility) c += 'logging facility ' + facility + '\n';
    if (devid) c += 'logging device-id ' + devid + '\n';
    let hostLine = 'logging host ' + hIf + ' ' + hIp;
    if (proto === 'tcp') hostLine += port ? ' tcp/' + port : ' tcp';
    else if (port) hostLine += ' udp/' + port;
    c += hostLine + '\n';
    if (proto === 'tcp') {
        if (data.log_hostdown) c += 'logging permit-hostdown\n';
        else c += '! UYARI: TCP syslog sunucusu erişilemezse ASA yeni bağlantıları engeller (permit-hostdown yok).\n';
    }
    c += '!\n! Doğrulama:\n! show logging\n! show logging queue\n! show running-config logging\n';
    return c;
}

// ── ASA: NTP + Saat ───────────────────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/basic-hostname-pw.html
CiscoASA.ntpClock = {
    label: 'NTP / Saat',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'ASA NTP ve Saat Dilimi',
                desc: 'ASA saat dilimi (<code>clock timezone</code>), yaz saati ve kimlik doğrulamalı NTP (<code>ntp server ... key</code>).'
            },
            sections: [
                {
                    title: 'Saat Dilimi',
                    icon: 'fas fa-globe-europe',
                    fields: [
                        { name: 'tz_mode', label: 'Platform / Biçim', type: 'select', options: [
                            { value: 'offset', label: 'Ad + UTC farkı (ASA 5500-X, ASAv)', selected: true },
                            { value: 'named', label: 'Bölge adı (Firepower / Secure Firewall donanımı)' }
                        ], hint: 'Cisco kılavuzu iki farklı sözdizimi tanımlar', why: "Firepower/Secure Firewall donanımında <code>clock timezone</code> yalnızca bölge adı alır (örn. Europe/Istanbul); ASA 5500-X ve ASAv'de ise kısaltma + saat farkı yazılır. Yanlış biçim komutun reddedilmesine yol açar." },
                        { name: 'tz_abbr', label: 'Dilim Kısaltması', type: 'text', requiredIf: { field: 'tz_mode', in: ['offset'] }, placeholder: 'CET', hint: 'Loglarda görünecek kısaltma', why: "Kısaltma yalnızca görüntü amaçlıdır; asıl etkiyi saat farkı belirler. Yine de loglarda tutarlılık için gerçek dilim adını yazın." },
                        { name: 'tz_hours', label: 'UTC Farkı (saat)', type: 'text', min: -23, max: 23, requiredIf: { field: 'tz_mode', in: ['offset'] }, placeholder: '1', hint: 'Örn. Türkiye için 3 (TRT), UTC-5 için -5', why: "Yanlış fark tüm log zaman damgalarını kaydırır; saatler doğru görünse bile olay korelasyonu diğer cihazlarla tutmaz." },
                        { name: 'tz_minutes', label: 'UTC Farkı (dakika)', type: 'text', min: 0, max: 59, placeholder: '0', hint: 'Yalnızca yarım saatlik dilimlerde (örn. UTC+5:30)', why: "Çoğu dilim tam saattir; bu alan yalnızca Hindistan gibi kesirli farklarda gerekir." },
                        { name: 'tz_region', label: 'Bölge Adı', type: 'text', requiredIf: { field: 'tz_mode', in: ['named'] }, placeholder: 'Europe/Istanbul', hint: 'Firepower donanımında kullanılan bölge adı', why: "Bölge adı yaz saati kurallarını da içerir; bu yüzden ayrıca <code>clock summer-time</code> gerekmez." },
                        { name: 'dst_zone', label: 'Yaz Saati Kısaltması', type: 'text', placeholder: 'CEST', hint: 'Yalnızca UTC farkı biçiminde ve yaz saati uygulanan ülkelerde', why: "Türkiye 2016'dan beri yaz saati uygulamaz; gereksiz <code>clock summer-time</code> yılda iki kez saati 1 saat kaydırır." },
                        { name: 'dst_rule', label: 'Yaz Saati Kuralı', type: 'text', placeholder: 'last Sun Mar 2:00 last Sun Oct 3:00', hint: 'hafta gün ay ss:dd hafta gün ay ss:dd — boşsa ABD kuralı uygulanır', why: "Kural yazılmazsa ASA <code>recurring</code> için ABD tarihlerini kullanır; Avrupa'da saat birkaç hafta boyunca yanlış olur." }
                    ]
                },
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp1', label: 'Birincil NTP Sunucusu', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.123', hint: 'IPv4 adresi', why: "Saat sapması sertifika doğrulamasını (AnyConnect, IKEv2 sertifika kimlik doğrulaması) bozar ve log korelasyonunu imkansız kılar." },
                        { name: 'ntp2', label: 'İkincil NTP Sunucusu', type: 'text', validate: 'ip', placeholder: '10.0.0.124', hint: 'Opsiyonel yedek sunucu', why: "Tek sunucu arızalandığında saat serbest kalır; iki sunucu, hatalı bir kaynağın tespit edilmesini de kolaylaştırır." },
                        { name: 'ntp_src', label: 'Kaynak Arayüz (Nameif)', type: 'text', validate: 'nameif', placeholder: 'inside', hint: 'NTP isteklerinin çıkacağı arayüz', why: "Belirtilmezse ASA route tablosuna göre arayüz seçer; NTP sunucusu yalnızca belirli bir kaynak adrese yanıt veriyorsa senkron hiç olmaz." },
                        { name: 'ntp_prefer', label: 'Birincil sunucuyu tercih et (prefer)', type: 'checkbox', checked: true, hint: 'Birincil sunucuya öncelik verir', why: "Eşit kalitedeki sunucular arasında seçimi sabitler; saat kaynağının sürekli değişmesini önler." }
                    ]
                },
                {
                    title: 'NTP Kimlik Doğrulama',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'ntp_auth', label: 'NTP kimlik doğrulamasını aç', type: 'checkbox', checked: false, hint: 'Sunucuda aynı anahtar tanımlı olmalı', why: "Doğrulamasız NTP sahte zaman yanıtlarına açıktır; saatin ileri alınması sertifikaların süresinin dolmuş görünmesine yol açabilir." },
                        { name: 'ntp_key_id', label: 'Anahtar ID', type: 'text', validate: 'posint', requiredIf: { field: 'ntp_auth', checked: true }, placeholder: '1', hint: 'Sunucudaki anahtar numarası ile aynı', why: "ID uyuşmazsa ASA sunucuyu doğrulanamamış sayar ve senkronize olmaz; <code>show ntp associations</code> çıktısında sunucu seçilmez." },
                        { name: 'ntp_hash', label: 'Hash Algoritması', type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha512', label: 'SHA-512' },
                            { value: 'sha1', label: 'SHA-1' },
                            { value: 'md5', label: 'MD5 (eski sürümler)' },
                            { value: 'cmac', label: 'CMAC' }
                        ], hint: 'Sunucu ile aynı algoritma', why: "SHA-256/512 ve CMAC yeni sürümlerde gelir; eski ASA sürümleri yalnızca MD5 destekler. Sürümünüzü <code>ntp authentication-key ?</code> ile kontrol edin." },
                        { name: 'ntp_key', label: 'Anahtar', type: 'text', requiredIf: { field: 'ntp_auth', checked: true }, placeholder: 'NtpKey2026', hint: 'Sunucudaki anahtar değeri', why: "Anahtar yanlışsa hiçbir hata mesajı görmezsiniz; ASA sadece senkronize olmaz." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaNtpGen(data));
    }
};
function cgAsaNtpGen(data) {
    const mode = cgEsc(data.tz_mode || 'offset');
    const abbr = cgEsc(data.tz_abbr || ''), hours = cgEsc(data.tz_hours || ''), mins = cgEsc(data.tz_minutes || '');
    const region = cgEsc(data.tz_region || ''), dstZone = cgEsc(data.dst_zone || ''), dstRule = cgEsc(data.dst_rule || '');
    const ntp1 = cgEsc(data.ntp1 || ''), ntp2 = cgEsc(data.ntp2 || ''), src = cgEsc(data.ntp_src || '');
    const keyId = cgEsc(data.ntp_key_id || ''), hash = cgEsc(data.ntp_hash || ''), key = cgEsc(data.ntp_key || '');
    const auth = data.ntp_auth && keyId && key && hash;
    let c = '! ========================================\n! Cisco ASA — NTP / Saat\n! ========================================\n';
    if (mode === 'named') {
        if (region) c += 'clock timezone ' + region + '\n';
    } else if (abbr && hours) {
        c += 'clock timezone ' + abbr + ' ' + hours + (mins ? ' ' + mins : '') + '\n';
        if (dstZone) c += 'clock summer-time ' + dstZone + ' recurring' + (dstRule ? ' ' + dstRule : '') + '\n';
    }
    if (auth) {
        c += 'ntp authenticate\n';
        c += 'ntp authentication-key ' + keyId + ' ' + hash + ' ' + key + '\n';
        c += 'ntp trusted-key ' + keyId + '\n';
    }
    const opts = (auth ? ' key ' + keyId : '') + (src ? ' source ' + src : '');
    c += 'ntp server ' + ntp1 + opts + (data.ntp_prefer ? ' prefer' : '') + '\n';
    if (ntp2) c += 'ntp server ' + ntp2 + opts + '\n';
    c += '!\n! Doğrulama:\n! show clock\n! show ntp associations\n! show ntp status\n';
    return c;
}

// ── ASA: SNMP ─────────────────────────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/monitor-snmp.html
CiscoASA.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'ASA SNMP',
                desc: 'ASA SNMP — v3 kullanıcı/grup (<code>snmp-server user ... v3 auth ... priv ...</code>) veya v2c community, izleme sunucusu ve trap\'ler.'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-unlock', desc: 'Community string (düz metin)', badge: { text: 'Eski', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'İzleme Sunucusu',
                    icon: 'fas fa-desktop',
                    fields: [
                        { name: 'snmp_host_if', label: 'Sunucuya Giden Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'NMS sunucusunun bulunduğu arayüz', why: "ASA yalnızca <code>snmp-server host</code> ile tanımlı adres ve arayüzden gelen sorgulara yanıt verir; yanlış arayüzde NMS zaman aşımı alır." },
                        { name: 'snmp_host_ip', label: 'NMS IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.60', hint: 'İzleme sunucusu', why: "SNMP erişimini tek bir sunucuyla sınırlamak, community/kullanıcı sızsa bile başka adreslerden sorgu yapılmasını engeller." },
                        { name: 'snmp_mode', label: 'Kullanım', type: 'select', options: [
                            { value: '', label: 'Poll + Trap', selected: true },
                            { value: 'poll', label: 'Yalnız poll' },
                            { value: 'trap', label: 'Yalnız trap' }
                        ], hint: 'Sunucu sorgu mu yapacak, trap mi alacak', why: "Yalnız trap seçilirse sunucu cihazı sorgulayamaz; yalnız poll seçilirse arayüz düşmesi gibi olaylar anında bildirilmez." },
                        { name: 'snmp_location', label: 'Konum', type: 'text', placeholder: 'DC1-Rack4', hint: 'sysLocation', why: "NMS envanterinde cihazın fiziksel yerini gösterir; arıza anında sahada doğru kabini bulmayı hızlandırır." },
                        { name: 'snmp_contact', label: 'İletişim', type: 'text', placeholder: 'noc@example.com', hint: 'sysContact', why: "Cihazdan sorumlu ekibi belgeler; paylaşılan ortamlarda yanlış ekibe eskalasyonu önler." },
                        { name: 'snmp_traps', label: 'Temel SNMP trap\'lerini aç', type: 'checkbox', checked: true, hint: 'authentication, linkup, linkdown, coldstart, warmstart', why: "Trap'ler kapalıysa NMS olayları ancak bir sonraki poll'da fark eder; link düşmesi dakikalarca görünmeyebilir." }
                    ]
                },
                {
                    title: 'SNMPv3 Kullanıcısı',
                    icon: 'fas fa-user-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'snmp_group', label: 'Grup Adı', type: 'text', required: true, placeholder: 'SNMP-V3-GRP', hint: 'priv seviyesinde grup', why: "Kullanıcı yalnızca bağlı olduğu grubun güvenlik seviyesiyle erişebilir; grup <code>priv</code> değilse şifreleme devreye girmez." },
                        { name: 'snmp_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmpmon', hint: 'NMS tarafında aynı kullanıcı', why: "NMS'teki kullanıcı adı, algoritma ve parolalar birebir aynı olmalıdır; aksi halde sorgular sessizce reddedilir." },
                        { name: 'snmp_auth', label: 'Kimlik Doğrulama Algoritması', type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha384', label: 'SHA-384' },
                            { value: 'sha224', label: 'SHA-224' },
                            { value: 'sha', label: 'SHA-1 (eski NMS uyumu)' }
                        ], hint: '9.20\'de MD5 desteklenmez', why: "Eski ASA sürümleri yalnızca MD5/SHA destekler; SHA-2 ailesi yeni sürümlerde gelir. NMS de aynı algoritmayı desteklemelidir." },
                        { name: 'snmp_auth_pw', label: 'Auth Parolası', type: 'text', required: true, placeholder: 'AuthPass2026', hint: 'En az 8 karakter', why: "Parola NMS ile birebir aynı olmalıdır; farklıysa ASA <i>authentication failure</i> sayar ve trap üretir." },
                        { name: 'snmp_priv', label: 'Şifreleme', type: 'select', options: [
                            { value: 'aes 256', label: 'AES-256', selected: true },
                            { value: 'aes 192', label: 'AES-192' },
                            { value: 'aes 128', label: 'AES-128' },
                            { value: '3des', label: '3DES (eski)' }
                        ], hint: '9.20\'de DES desteklenmez', why: "AES-256 bazı eski NMS yazılımlarında desteklenmez; bağlantı kurulamazsa AES-128 deneyin." },
                        { name: 'snmp_priv_pw', label: 'Priv Parolası', type: 'text', required: true, placeholder: 'PrivPass2026', hint: 'Auth parolasından farklı olmalı', why: "Aynı parolayı iki amaçla kullanmak, birinin sızmasıyla her iki korumayı da kaybettirir." }
                    ]
                },
                {
                    title: 'SNMPv2c Community',
                    icon: 'fas fa-users',
                    showFor: ['v2c'],
                    fields: [
                        { name: 'snmp_comm', label: 'Community String', type: 'text', required: true, placeholder: 'Ro-Str0ng-C0mm', hint: 'Tahmin edilemez bir değer', why: "v2c community ağda <b>düz metin</b> taşınır. <code>public</code> gibi varsayılanlar taramalarla anında bulunur; mümkünse v3 kullanın." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaSnmpGen(data));
    }
};
function cgAsaSnmpGen(data) {
    const type = cgEsc(data._cgtype || 'v3');
    const hIf = cgEsc(data.snmp_host_if || ''), hIp = cgEsc(data.snmp_host_ip || ''), mode = cgEsc(data.snmp_mode || '');
    const loc = cgEsc(data.snmp_location || ''), contact = cgEsc(data.snmp_contact || '');
    let c = '! ========================================\n! Cisco ASA — SNMP\n! ========================================\n';
    c += 'snmp-server enable\n';
    if (loc) c += 'snmp-server location ' + loc + '\n';
    if (contact) c += 'snmp-server contact ' + contact + '\n';
    const hostPre = 'snmp-server host ' + hIf + ' ' + hIp + (mode ? ' ' + mode : '');
    if (type === 'v3') {
        const grp = cgEsc(data.snmp_group || ''), user = cgEsc(data.snmp_user || '');
        const auth = cgEsc(data.snmp_auth || ''), authPw = cgEsc(data.snmp_auth_pw || '');
        const priv = cgEsc(data.snmp_priv || ''), privPw = cgEsc(data.snmp_priv_pw || '');
        c += 'snmp-server group ' + grp + ' v3 priv\n';
        c += 'snmp-server user ' + user + ' ' + grp + ' v3 auth ' + auth + ' ' + authPw + ' priv ' + priv + ' ' + privPw + '\n';
        c += hostPre + ' version 3 ' + user + '\n';
    } else {
        const comm = cgEsc(data.snmp_comm || '');
        c += '! UYARI: SNMPv2c community ağda düz metin taşınır; mümkünse SNMPv3 kullanın.\n';
        c += hostPre + ' community ' + comm + ' version 2c\n';
    }
    if (data.snmp_traps) c += 'snmp-server enable traps snmp authentication linkup linkdown coldstart warmstart\n';
    c += '!\n! Doğrulama:\n! show snmp-server statistics\n';
    if (type === 'v3') c += '! show snmp-server user\n! show snmp-server group\n';
    c += '! show running-config snmp-server\n';
    return c;
}

// ── ASA: Yönetim Erişimi Sertleştirme ─────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/admin-management.html
CiscoASA.mgmtAccess = {
    label: 'Yönetim Erişimi (SSH/ASDM)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'ASA Yönetim Erişimi Sertleştirme',
                desc: 'SSH/ASDM erişimini kaynak ağ ile sınırlama, SSH şifre takımı ve anahtar değişimi, zaman aşımları, giriş banner\'ı ve <code>management-access</code>. Telnet yapılandırılmaz.'
            },
            sections: [
                {
                    title: 'SSH',
                    icon: 'fas fa-terminal',
                    info: 'ASA 9.x\'te SSH için AAA zorunludur; önce <b>Yerel Kullanıcılar</b> aracıyla en az bir kullanıcı oluşturun.',
                    fields: [
                        { name: 'ssh_net', label: 'İzinli Yönetim Ağı (IP Maske)', type: 'text', validate: 'ip_mask', required: true, placeholder: '10.0.10.0 255.255.255.0', hint: 'Yalnızca bu ağdan SSH kabul edilir', why: "ASA SSH'ı yalnızca <code>ssh</code> satırlarındaki ağlardan kabul eder; ayrı bir ACL gerekmez. <code>0.0.0.0 0.0.0.0</code> yazmak yönetim düzlemini tüm dünyaya açar." },
                        { name: 'ssh_if', label: 'Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'Yönetim ağının geldiği arayüz', why: "SSH'ı outside arayüzünde açmak brute-force hedefi yaratır. Uzaktan erişim gerekiyorsa VPN + <code>management-access</code> tercih edin." },
                        { name: 'ssh_genkey', label: 'Host Anahtarı Üret', type: 'select', options: [
                            { value: 'rsa', label: 'RSA 2048', selected: true },
                            { value: 'eddsa', label: 'EdDSA ed25519 (yeni sürümler)' },
                            { value: '', label: 'Üretme (mevcut anahtar var)' }
                        ], hint: 'Anahtar yoksa SSH başlamaz', why: "Anahtar zaten varsa ASA <b>değiştirmek istiyor musunuz</b> diye sorar; toplu yapıştırmada bu soru sonraki satırı yanıt olarak yutabilir. Mevcut anahtar varsa 'Üretme' seçin." },
                        { name: 'ssh_timeout', label: 'SSH Boşta Zaman Aşımı (dk)', type: 'text', min: 1, max: 60, placeholder: '15', hint: '1-60 dk; boşsa varsayılan 5', why: "Açık bırakılan oturumlar yetkisiz kullanım riski taşır; çok kısa değer ise uzun işlemler sırasında bağlantıyı koparır." },
                        { name: 'ssh_cipher', label: 'Şifreleme Takımı', type: 'select', options: [
                            { value: 'high', label: 'high (yalnız güçlü AES)', selected: true },
                            { value: 'fips', label: 'fips' },
                            { value: 'medium', label: 'medium (eski istemci uyumu)' }
                        ], hint: '<code>ssh cipher encryption</code>', why: "Zayıf CBC/3DES şifreleri denetimlerde bulgu olarak çıkar. Çok eski SSH istemcileri <b>high</b> ile bağlanamayabilir." },
                        { name: 'ssh_integrity', label: 'Bütünlük (MAC) Takımı', type: 'select', options: [
                            { value: 'high', label: 'high', selected: true },
                            { value: 'fips', label: 'fips' },
                            { value: 'medium', label: 'medium' }
                        ], hint: '<code>ssh cipher integrity</code>', why: "SHA-1 tabanlı MAC'ler zayıf kabul edilir; high seviyesi yalnız SHA-2 bırakır." },
                        { name: 'ssh_kex', label: 'Anahtar Değişimi (KEX)', type: 'select', options: [
                            { value: 'dh-group14-sha256', label: 'dh-group14-sha256', selected: true },
                            { value: 'curve25519-sha256', label: 'curve25519-sha256' },
                            { value: 'ecdh-sha2-nistp256', label: 'ecdh-sha2-nistp256' },
                            { value: 'dh-group14-sha1', label: 'dh-group14-sha1 (eski)' }
                        ], hint: '<code>ssh key-exchange group</code>', why: "dh-group1 ve SHA-1 tabanlı gruplar zayıftır. Eski ASA sürümlerinde yalnızca dh-group1/dh-group14-sha1 bulunur; komut reddedilirse sürüm desteğini kontrol edin." },
                        { name: 'ssh_aaa', label: 'SSH Kimlik Doğrulama', type: 'select', options: [
                            { value: 'LOCAL', label: 'LOCAL (yerel kullanıcılar)', selected: true },
                            { value: '', label: 'Yazma (AAA/RADIUS aracında tanımlı)' }
                        ], hint: '<code>aaa authentication ssh console</code>', why: "Bu satır olmadan 9.x ASA SSH girişine izin vermez. RADIUS/LDAP kullanıyorsanız AAA aracının ürettiği satır (LOCAL yedekli) geçerli olsun, burada yazmayın." }
                    ]
                },
                {
                    title: 'ASDM / HTTPS',
                    icon: 'fas fa-desktop',
                    fields: [
                        { name: 'http_enable', label: 'ASDM (HTTPS) erişimini aç', type: 'checkbox', checked: false, hint: 'Kapalıysa HTTPS yönetimi yapılandırılmaz', why: "Kullanılmayan yönetim servisi saldırı yüzeyidir; ASDM kullanmıyorsanız kapalı bırakın." },
                        { name: 'http_net', label: 'İzinli ASDM Ağı (IP Maske)', type: 'text', validate: 'ip_mask', requiredIf: { field: 'http_enable', checked: true }, placeholder: '10.0.10.0 255.255.255.0', hint: 'Yalnızca bu ağdan HTTPS', why: "ASDM erişimini yönetim ağıyla sınırlamak, web yönetim arayüzüne yönelik zafiyetlerin istismarını ciddi biçimde zorlaştırır." },
                        { name: 'http_if', label: 'Arayüz (Nameif)', type: 'text', validate: 'nameif', requiredIf: { field: 'http_enable', checked: true }, placeholder: 'inside', hint: 'ASDM ağının geldiği arayüz', why: "ASDM'i outside'da açmak yönetim portunu internete açar." },
                        { name: 'http_port', label: 'HTTPS Portu', type: 'text', validate: 'port', placeholder: '8443', hint: 'Boşsa 443', why: "Aynı arayüzde AnyConnect/WebVPN 443'ü kullanıyorsa ASDM için farklı port gerekir; aksi halde biri çalışmaz." },
                        { name: 'http_session_to', label: 'ASDM Oturum Süresi (dk)', type: 'text', min: 1, max: 1440, placeholder: '20', hint: '<code>http server session-timeout</code>', why: "Sınırsız oturumlar, açık bırakılmış bir tarayıcıda yetkisiz değişiklik riskini artırır." }
                    ]
                },
                {
                    title: 'Banner ve Diğer',
                    icon: 'fas fa-flag',
                    fields: [
                        { name: 'banner_type', label: 'Banner Tipi', type: 'select', options: [
                            { value: 'login', label: 'login (giriş öncesi)', selected: true },
                            { value: 'motd', label: 'motd' },
                            { value: 'exec', label: 'exec (giriş sonrası)' }
                        ], hint: 'Mesajın ne zaman gösterileceği', why: "Yasal uyarının kimlik doğrulamadan <b>önce</b> gösterilmesi, yetkisiz erişimde hukuki dayanak açısından önemlidir." },
                        { name: 'banner_text', label: 'Banner Metni', type: 'textarea', placeholder: 'Yalnizca yetkili erisim. Tum islemler kayit altindadir.', hint: 'Her satır ayrı <code>banner</code> komutu olur; ASCII kullanın', why: "Karşılama ifadesi (hoş geldiniz vb.) yerine yetkisiz erişimi yasaklayan bir metin kullanın; ASCII dışı karakterler bazı istemcilerde bozuk görünür." },
                        { name: 'mgmt_access_if', label: 'management-access Arayüzü', type: 'text', validate: 'nameif', placeholder: 'inside', hint: 'VPN tüneli üzerinden bu arayüzün IP\'sine yönetim erişimi', why: "VPN ile gelen yönetici ASA'nın inside IP'sine ancak bu komutla ulaşabilir. Kılavuza göre CiscoSSH yığınında SSH için desteklenmez." },
                        { name: 'console_to', label: 'Konsol Zaman Aşımı (dk)', type: 'text', min: 0, max: 60, placeholder: '10', hint: '0 = sınırsız', why: "Fiziksel konsolda açık kalan oturum, cihaza erişen herkese tam yetki verir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaMgmtGen(data));
    }
};
function cgAsaMgmtGen(data) {
    const sshNet = cgEsc(data.ssh_net || '').trim().split(/\s+/).join(' '), sshIf = cgEsc(data.ssh_if || '');
    const genkey = cgEsc(data.ssh_genkey || ''), sshTo = cgEsc(data.ssh_timeout || '');
    const cipher = cgEsc(data.ssh_cipher || ''), integ = cgEsc(data.ssh_integrity || ''), kex = cgEsc(data.ssh_kex || '');
    const aaa = cgEsc(data.ssh_aaa || '');
    const httpNet = cgEsc(data.http_net || '').trim().split(/\s+/).join(' '), httpIf = cgEsc(data.http_if || '');
    const httpPort = cgEsc(data.http_port || ''), httpTo = cgEsc(data.http_session_to || '');
    const bType = cgEsc(data.banner_type || 'login');
    const bLines = String(data.banner_text || '').split(/\r?\n/).map(l => cgEsc(l).trim()).filter(Boolean);
    const mgmtIf = cgEsc(data.mgmt_access_if || ''), conTo = cgEsc(data.console_to || '');
    let c = '! ========================================\n! Cisco ASA — Yönetim Erişimi Sertleştirme\n! ========================================\n';
    c += '! SSH\n';
    if (genkey === 'rsa') c += '! Not: anahtar zaten varsa ASA değiştirme onayı ister.\ncrypto key generate rsa modulus 2048\n';
    else if (genkey === 'eddsa') c += '! Not: anahtar zaten varsa ASA değiştirme onayı ister.\ncrypto key generate eddsa edwards-curve ed25519\n';
    c += 'ssh ' + sshNet + ' ' + sshIf + '\n';
    if (sshTo) c += 'ssh timeout ' + sshTo + '\n';
    if (cipher) c += 'ssh cipher encryption ' + cipher + '\n';
    if (integ) c += 'ssh cipher integrity ' + integ + '\n';
    if (kex) c += 'ssh key-exchange group ' + kex + '\n';
    if (aaa) c += 'aaa authentication ssh console ' + aaa + '\n';
    if (data.http_enable && httpNet && httpIf) {
        c += '!\n! ASDM / HTTPS\n';
        c += 'http server enable' + (httpPort ? ' ' + httpPort : '') + '\n';
        c += 'http ' + httpNet + ' ' + httpIf + '\n';
        if (httpTo) c += 'http server session-timeout ' + httpTo + '\n';
        if (aaa) c += 'aaa authentication http console ' + aaa + '\n';
    }
    if (bLines.length) {
        c += '!\n! Banner\n';
        bLines.forEach(l => { c += 'banner ' + bType + ' ' + l + '\n'; });
    }
    if (mgmtIf) c += 'management-access ' + mgmtIf + '\n';
    if (conTo) c += 'console timeout ' + conTo + '\n';
    c += '! Telnet yapılandırılmadı: yönetim için yalnız SSH kullanın.\n';
    c += '!\n! Doğrulama:\n! show ssh\n! show ssh sessions\n! show running-config ssh\n';
    if (genkey === 'eddsa') c += '! show crypto key mypubkey eddsa\n';
    else c += '! show crypto key mypubkey rsa\n';
    if (data.http_enable) c += '! show running-config http\n';
    return c;
}

// ── ASA: Yerel Kullanıcılar ve Yetki Seviyeleri ───────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/admin-management.html
CiscoASA.localUsers = {
    label: 'Yerel Kullanıcılar / Privilege',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-users-cog',
                title: 'ASA Yerel Kullanıcılar ve Yetki',
                desc: '<code>username ... privilege</code>, enable parolası, komut bazlı yetki (<code>privilege ... command</code>) ve <code>aaa authorization command LOCAL</code>.'
            },
            sections: [
                {
                    title: 'Yönetici Kullanıcı',
                    icon: 'fas fa-user-tie',
                    fields: [
                        { name: 'u1_name', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin', hint: 'Yerel yönetici hesabı', why: "AAA sunucusu erişilemediğinde cihaza girebilmenin tek yolu bu yerel hesaptır (LOCAL yedek). <code>admin</code> gibi tahmin edilebilir adlardan kaçının." },
                        { name: 'u1_pw', label: 'Parola', type: 'text', required: true, placeholder: 'Str0ngPassw0rd2026', hint: '8-127 karakter; ASA parolayı PBKDF2 ile saklar', why: "Yerel hesap parolası, AAA'dan bağımsız 'son kapı' olduğu için güçlü ve kasada saklanmış olmalıdır." },
                        { name: 'u1_priv', label: 'Privilege Seviyesi', type: 'text', min: 0, max: 15, required: true, placeholder: '15', hint: '15 = tam yetki', why: "Seviye 15 tüm komutlara erişir. Komut yetkilendirmesi açıldığında seviyeler komut listesini doğrudan belirler." }
                    ]
                },
                {
                    title: 'İkinci Kullanıcı (opsiyonel)',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'u2_name', label: 'Kullanıcı Adı', type: 'text', placeholder: 'noc-ro', hint: 'Örn. salt-okunur NOC hesabı', why: "Ayrı hesaplar, loglarda kimin ne yaptığını ayırt etmeyi sağlar; ortak hesap kullanımı denetim izini yok eder." },
                        { name: 'u2_pw', label: 'Parola', type: 'text', placeholder: 'NocPassw0rd2026', hint: 'Kullanıcı adı girildiyse zorunlu', why: "Parolasız hesap oluşturulamaz; ad girip parolayı boş bırakırsanız bu kullanıcı çıktıya yazılmaz." },
                        { name: 'u2_priv', label: 'Privilege Seviyesi', type: 'text', min: 0, max: 15, placeholder: '5', hint: 'Boşsa ASA varsayılanı (2)', why: "Düşük seviye kullanıcılar ancak aşağıdaki komut yetkilendirmesi açıksa gerçekten kısıtlanır." }
                    ]
                },
                {
                    title: 'Komut Yetkilendirme',
                    icon: 'fas fa-list-ol',
                    warn: '<code>aaa authorization command LOCAL</code> açıldığında seviye 15 altındaki kullanıcılar yalnızca kendi seviyelerine atanmış komutları çalıştırabilir.',
                    fields: [
                        { name: 'enable_pw', label: 'Enable Parolası', type: 'text', placeholder: 'EnablePassw0rd2026', hint: 'Boşsa değiştirilmez', why: "Enable parolası boş bırakılmış bir ASA'da seviye 1 kullanıcı ayrıcalıklı moda parolasız geçebilir." },
                        { name: 'priv_type', label: 'Özel Komut Ataması', type: 'select', options: [
                            { value: '', label: 'Yok', selected: true },
                            { value: 'show', label: 'show komutu' },
                            { value: 'clear', label: 'clear komutu' },
                            { value: 'cmd', label: 'yapılandırma komutu (cmd)' }
                        ], hint: '<code>privilege [show|clear|cmd] level N command X</code>', why: "Örn. <code>show running-config</code>'i seviye 5'e açmak NOC ekibine değişiklik yetkisi vermeden görünürlük sağlar." },
                        { name: 'priv_level', label: 'Atanacak Seviye', type: 'text', min: 0, max: 15, requiredIf: { field: 'priv_type', in: ['show', 'clear', 'cmd'] }, placeholder: '5', hint: '0-15', why: "Komut bu seviyeye ve üstüne açılır; seviye 15'e atamak komutu herkese kapatır." },
                        { name: 'priv_cmd', label: 'Komut', type: 'text', requiredIf: { field: 'priv_type', in: ['show', 'clear', 'cmd'] }, placeholder: 'running-config', hint: 'Anahtar kelimeden sonraki komut (show için: running-config)', why: "Komut adı ASA'nın komut ağacındaki adla birebir eşleşmelidir; yanlış ad kabul edilmez." },
                        { name: 'cmd_author', label: 'aaa authorization command LOCAL', type: 'checkbox', checked: false, hint: 'Komutları seviyelere göre kısıtla', why: "Bu açılmadan privilege seviyeleri yalnızca kozmetiktir. Açmadan önce seviye 15 bir yerel hesabınız olduğundan emin olun, yoksa kendinizi kilitleyebilirsiniz." },
                        { name: 'enable_auth', label: 'aaa authentication enable console LOCAL', type: 'checkbox', checked: false, hint: 'enable için kullanıcının kendi parolası', why: "Paylaşılan enable parolası yerine kişisel parola kullanılır; kimin ayrıcalıklı moda geçtiği loglanır." },
                        { name: 'exec_author', label: 'aaa authorization exec LOCAL auto-enable', type: 'checkbox', checked: false, hint: 'Girişte kullanıcı seviyesine doğrudan geç', why: "auto-enable, seviye 15 kullanıcıları enable yazmadan ayrıcalıklı moda alır; kullanıcı yetkileri doğru tanımlı değilse fazla yetki riski doğar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaUsersGen(data));
    }
};
function cgAsaUsersGen(data) {
    const u1 = cgEsc(data.u1_name || ''), p1 = cgEsc(data.u1_pw || ''), l1 = cgEsc(data.u1_priv || '');
    const u2 = cgEsc(data.u2_name || ''), p2 = cgEsc(data.u2_pw || ''), l2 = cgEsc(data.u2_priv || '');
    const en = cgEsc(data.enable_pw || ''), pType = cgEsc(data.priv_type || '');
    const pLvl = cgEsc(data.priv_level || ''), pCmd = cgEsc(data.priv_cmd || '');
    let c = '! ========================================\n! Cisco ASA — Yerel Kullanıcılar / Privilege\n! ========================================\n';
    c += 'username ' + u1 + ' password ' + p1 + ' privilege ' + l1 + '\n';
    if (u2 && p2) c += 'username ' + u2 + ' password ' + p2 + (l2 ? ' privilege ' + l2 : '') + '\n';
    if (en) c += 'enable password ' + en + '\n';
    if (pType && pLvl && pCmd) c += 'privilege ' + pType + ' level ' + pLvl + ' command ' + pCmd + '\n';
    if (data.enable_auth) c += 'aaa authentication enable console LOCAL\n';
    if (data.exec_author) c += 'aaa authorization exec LOCAL auto-enable\n';
    if (data.cmd_author) c += 'aaa authorization command LOCAL\n';
    c += '!\n! Doğrulama:\n! show running-config username\n! show curpriv\n! show running-config all privilege all\n';
    return c;
}

// ── ASA: Statik Rota + SLA İzleme (Dual ISP) ──────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/route-static.html
//            https://www.cisco.com/c/en/us/support/docs/security/asa-5500-x-series-next-generation-firewalls/118962-configure-asa-00.html
//            https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/T-Z/asa-command-ref-T-Z/m_ta-tk.html (timeout/threshold)
CiscoASA.routeTrack = {
    label: 'Statik Rota + SLA Tracking',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'ASA Statik Rota İzleme (SLA Monitor)',
                desc: 'Birincil rotayı ICMP ile izleyen <code>sla monitor</code> + <code>track</code>; hedef yanıt vermezse daha yüksek mesafeli yedek rota devreye girer.'
            },
            sections: [
                {
                    title: 'Birincil Rota',
                    icon: 'fas fa-road',
                    fields: [
                        { name: 'rt_dst', label: 'Hedef Ağ (IP Maske)', type: 'text', validate: 'ip_mask', placeholder: '0.0.0.0 0.0.0.0', hint: 'Boşsa varsayılan rota (0.0.0.0 0.0.0.0)', why: "Genellikle varsayılan rota izlenir. Belirli bir ağ için yazarsanız yalnızca o ağın trafiği yedek hatta geçer." },
                        { name: 'rt_pri_if', label: 'Birincil Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'outside', hint: 'Birincil ISP arayüzü', why: "SLA ICMP paketleri de bu arayüzden çıkmalıdır; farklı arayüz seçilirse izleme yanlış hattı ölçer." },
                        { name: 'rt_pri_gw', label: 'Birincil Gateway', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Birincil ISP next-hop', why: "Gateway arayüz subnetinde değilse rota tabloya hiç girmez." }
                    ]
                },
                {
                    title: 'SLA İzleme',
                    icon: 'fas fa-heartbeat',
                    info: 'Kılavuz: threshold, timeout değerinden büyük olmamalı. Timeout (ms), frequency (sn) süresinden kısa tutulmalı.',
                    fields: [
                        { name: 'sla_id', label: 'SLA ID', type: 'text', validate: 'posint', required: true, placeholder: '10', hint: 'sla monitor numarası', why: "Aynı ID'yi başka bir SLA için kullanmak mevcut izleme tanımını değiştirir; <code>show running-config sla monitor</code> ile kontrol edin." },
                        { name: 'sla_target', label: 'İzlenecek Hedef IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.10', hint: 'ICMP\'ye yanıt veren, birincil hat üzerinden erişilen adres', why: "Hedef olarak ISP gateway'i yalnızca yerel linki ölçer; ISP omurga arızasını yakalamak için hat üzerinden erişilen uzak bir adres seçin. Hedefe ICMP yanıtı engelliyse rota sürekli düşer." },
                        { name: 'sla_freq', label: 'Frequency (sn)', type: 'text', min: 1, max: 604800, placeholder: '10', hint: 'Boşsa varsayılan 60 sn', why: "Varsayılan 60 sn'de arıza en geç bir dakika sonra fark edilir; çok kısa değer hedefe gereksiz yük bindirir." },
                        { name: 'sla_timeout', label: 'Timeout (ms)', type: 'text', min: 0, max: 2147483647, placeholder: '3000', hint: 'Boşsa varsayılan 5000 ms', why: "Yanıt bu süre içinde gelmezse hedef ulaşılamaz sayılır. Frequency süresinden uzun olmamalıdır." },
                        { name: 'sla_threshold', label: 'Threshold (ms)', type: 'text', min: 0, max: 2147483647, placeholder: '2000', hint: 'Boşsa varsayılan 5000 ms', why: "Threshold erişilebilirliği etkilemez, yalnızca 'eşik aşıldı' olayı üretir; timeout değerinden büyük olmamalıdır." },
                        { name: 'sla_pkts', label: 'Paket Sayısı', type: 'text', min: 1, max: 100, placeholder: '3', hint: 'Her denemede gönderilecek echo sayısı', why: "Tek paket kaybında rotanın gereksiz düşmesini önlemek için 3 gibi bir değer kullanılır." },
                        { name: 'track_id', label: 'Track ID', type: 'text', min: 1, max: 500, required: true, placeholder: '1', hint: 'track numarası', why: "Rota bu track nesnesine bağlanır; track ID yanlışsa rota izlenmez ve arızada yedeğe geçilmez." }
                    ]
                },
                {
                    title: 'Yedek Rota',
                    icon: 'fas fa-life-ring',
                    fields: [
                        { name: 'rt_bk_if', label: 'Yedek Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'backup', hint: 'İkinci ISP arayüzü', why: "Yedek hatta NAT kuralları da tanımlı olmalıdır; aksi halde rota geçer ama trafik internete çıkamaz." },
                        { name: 'rt_bk_gw', label: 'Yedek Gateway', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'İkinci ISP next-hop', why: "Yedek gateway erişilemezse failover gerçekleşir ama trafik yine kaybolur; hattı önceden test edin." },
                        { name: 'rt_bk_dist', label: 'Yedek Rota Mesafesi', type: 'text', min: 2, max: 255, required: true, placeholder: '254', hint: 'Birincil rotanın mesafesi 1\'dir', why: "Yedek mesafe birincilden büyük olmalıdır; eşit olursa iki rota birlikte kurulur ve trafik iki hatta bölünür." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaRouteTrackGen(data));
    }
};
function cgAsaRouteTrackGen(data) {
    const dst = cgEsc(data.rt_dst || '').trim().split(/\s+/).join(' ') || '0.0.0.0 0.0.0.0';
    const priIf = cgEsc(data.rt_pri_if || ''), priGw = cgEsc(data.rt_pri_gw || '');
    const slaId = cgEsc(data.sla_id || ''), target = cgEsc(data.sla_target || '');
    const freq = cgEsc(data.sla_freq || ''), tmo = cgEsc(data.sla_timeout || ''), thr = cgEsc(data.sla_threshold || '');
    const pkts = cgEsc(data.sla_pkts || ''), trackId = cgEsc(data.track_id || '');
    const bkIf = cgEsc(data.rt_bk_if || ''), bkGw = cgEsc(data.rt_bk_gw || ''), bkDist = cgEsc(data.rt_bk_dist || '');
    let c = '! ========================================\n! Cisco ASA — Statik Rota + SLA Tracking\n! ========================================\n';
    if (tmo && freq && +tmo > +freq * 1000) c += '! UYARI: timeout (' + tmo + ' ms) frequency (' + freq + ' sn) süresinden uzun.\n';
    if (thr && +thr > +(tmo || 5000)) c += '! UYARI: threshold timeout değerinden büyük olmamalı.\n';
    c += 'sla monitor ' + slaId + '\n';
    c += ' type echo protocol ipIcmpEcho ' + target + ' interface ' + priIf + '\n';
    if (pkts) c += ' num-packets ' + pkts + '\n';
    if (tmo) c += ' timeout ' + tmo + '\n';
    if (thr) c += ' threshold ' + thr + '\n';
    if (freq) c += ' frequency ' + freq + '\n';
    c += 'sla monitor schedule ' + slaId + ' life forever start-time now\n';
    c += 'track ' + trackId + ' rtr ' + slaId + ' reachability\n';
    c += '!\n! Birincil (izlenen) ve yedek rota\n';
    c += 'route ' + priIf + ' ' + dst + ' ' + priGw + ' 1 track ' + trackId + '\n';
    c += 'route ' + bkIf + ' ' + dst + ' ' + bkGw + ' ' + bkDist + '\n';
    c += '!\n! Doğrulama:\n! show sla monitor configuration ' + slaId + '\n! show sla monitor operational-state ' + slaId + '\n';
    c += '! show track ' + trackId + '\n! show route\n! show running-config sla monitor\n';
    return c;
}

// ── ASA: Twice NAT / Identity NAT ─────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/firewall/asa-920-firewall-config/nat-basics.html
//            https://www.cisco.com/c/en/us/td/docs/security/asa/asa-cli-reference/I-R/asa-command-ref-I-R/n-commands.html
CiscoASA.twiceNat = {
    label: 'Twice NAT / Identity NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'ASA Twice NAT (Manual NAT)',
                desc: 'Kaynak <b>ve</b> hedefe göre NAT: VPN NAT muafiyeti (identity NAT), hedefe özel statik NAT ve hedefe özel PAT. Manual NAT section 1\'de, object NAT\'tan önce değerlendirilir.'
            },
            configTypes: [
                { id: 'identity', label: 'Identity NAT (VPN muafiyeti)', icon: 'fas fa-equals', desc: 'Adres kendine çevrilir — site-to-site trafiği NAT\'lanmaz', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Hedefe Özel Statik NAT', icon: 'fas fa-arrows-alt-h', desc: 'Kaynak yalnızca belirli hedefe giderken başka adrese çevrilir', badge: { text: 'Çakışan Ağ', cls: 'common' } },
                { id: 'dynamic', label: 'Hedefe Özel PAT', icon: 'fas fa-random', desc: 'Kaynak yalnızca belirli hedefe giderken arayüz IP\'sine PAT', badge: { text: 'Politika PAT', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Arayüzler ve Sıra',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'tn_real_if', label: 'Gerçek (Kaynak) Arayüz', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'Kaynak ağın bulunduğu nameif', why: "Arayüz çifti yanlışsa kural <code>show nat</code>'ta görünür ama hiç hit almaz; NAT sorunlarının en sık sebebidir." },
                        { name: 'tn_mapped_if', label: 'Çevrilmiş (Hedef) Arayüz', type: 'text', validate: 'nameif', required: true, placeholder: 'outside', hint: 'Hedef ağa çıkılan nameif', why: "Site-to-site VPN'de bu, crypto map'in bağlı olduğu arayüzdür." },
                        { name: 'tn_pos', label: 'Kural Sırası', type: 'select', options: [
                            { value: '', label: 'Section 1 sonu (varsayılan)', selected: true },
                            { value: '1', label: 'Section 1 en üst (satır 1)' },
                            { value: 'after-auto', label: 'Section 3 (after-auto)' }
                        ], hint: 'Manual NAT tablosundaki konum', why: "NAT ilk eşleşmede durur. VPN muafiyeti genel bir PAT kuralının altında kalırsa tünel trafiği NAT'lanır ve karşı tarafta eşleşmez; muafiyeti en üste koyun." },
                        { name: 'tn_desc', label: 'Açıklama', type: 'text', placeholder: 'SITE-B-NAT', hint: '<code>description</code>', why: "Açıklamasız manual NAT kuralları zamanla kimsenin dokunmaya cesaret edemediği ölü kurallara dönüşür." }
                    ]
                },
                {
                    title: 'Kaynak ve Hedef Ağlar',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'tn_src_obj', label: 'Kaynak Object Adı', type: 'text', required: true, placeholder: 'LAN-NET', hint: 'object network adı', why: "Aynı adla bir object zaten varsa <code>subnet</code> satırı onu değiştirir ve ona bağlı tüm ACL/NAT kuralları etkilenir." },
                        { name: 'tn_src_net', label: 'Kaynak Ağ (IP Maske)', type: 'text', validate: 'ip_mask', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'Gerçek kaynak ağ', why: "Kapsam, crypto ACL'deki yerel ağ ile birebir aynı olmalıdır; aksi halde bazı hostlar NAT'lanıp tünele girmez." },
                        { name: 'tn_dst_obj', label: 'Hedef Object Adı', type: 'text', required: true, placeholder: 'REMOTE-NET', hint: 'object network adı', why: "Hedef object, kuralın yalnızca bu hedefe giden trafikte çalışmasını sağlar; genel internet trafiği etkilenmez." },
                        { name: 'tn_dst_net', label: 'Hedef Ağ (IP Maske)', type: 'text', validate: 'ip_mask', required: true, placeholder: '10.64.0.0 255.255.0.0', hint: 'Karşı taraf ağı', why: "Karşı site ağı ile çakışan geniş bir maske, başka hedeflere giden trafiği de bu kurala sokar." }
                    ]
                },
                {
                    title: 'Identity NAT Seçenekleri',
                    icon: 'fas fa-equals',
                    showFor: ['identity'],
                    fields: [
                        { name: 'tn_noproxy', label: 'no-proxy-arp route-lookup', type: 'checkbox', checked: true, hint: 'VPN muafiyetinde önerilir', why: "Identity NAT'ta proxy ARP gereksizdir ve bazı durumlarda ARP çakışmasına yol açar. route-lookup, çıkış arayüzünü route tablosundan belirler; management-access ile VPN üzerinden yönetimde gereklidir." }
                    ]
                },
                {
                    title: 'Çevrilmiş Kaynak',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['static'],
                    fields: [
                        { name: 'tn_map_obj', label: 'Çevrilmiş Object Adı', type: 'text', required: true, placeholder: 'LAN-NET-MAPPED', hint: 'Karşı tarafın göreceği adres bloğu', why: "Çakışan iç ağlarda (iki tarafta da 192.168.1.0/24) karşı tarafa benzersiz bir blok göstermek tek çözümdür." },
                        { name: 'tn_map_net', label: 'Çevrilmiş Ağ (IP Maske)', type: 'text', validate: 'ip_mask', required: true, placeholder: '172.24.1.0 255.255.255.0', hint: 'Kaynak ağ ile aynı boyutta', why: "Statik NAT birebir eşleme yapar; çevrilmiş blok kaynak bloktan küçükse bazı hostlar çevrilemez." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaTwiceNatGen(data));
    }
};
function cgAsaTwiceNatGen(data) {
    const type = cgEsc(data._cgtype || 'identity');
    const norm = s => cgEsc(s || '').trim().split(/\s+/).join(' ');
    const realIf = cgEsc(data.tn_real_if || ''), mapIf = cgEsc(data.tn_mapped_if || '');
    const pos = cgEsc(data.tn_pos || ''), desc = cgEsc(data.tn_desc || '').trim();
    const srcObj = cgEsc(data.tn_src_obj || ''), srcNet = norm(data.tn_src_net);
    const dstObj = cgEsc(data.tn_dst_obj || ''), dstNet = norm(data.tn_dst_net);
    let c = '! ========================================\n! Cisco ASA — Twice NAT\n! ========================================\n';
    c += 'object network ' + srcObj + '\n subnet ' + srcNet + '\n';
    c += 'object network ' + dstObj + '\n subnet ' + dstNet + '\n';
    let src;
    if (type === 'static') {
        const mapObj = cgEsc(data.tn_map_obj || ''), mapNet = norm(data.tn_map_net);
        c += 'object network ' + mapObj + '\n subnet ' + mapNet + '\n';
        src = 'source static ' + srcObj + ' ' + mapObj;
    } else if (type === 'dynamic') {
        src = 'source dynamic ' + srcObj + ' interface';
    } else {
        src = 'source static ' + srcObj + ' ' + srcObj;
    }
    let line = 'nat (' + realIf + ',' + mapIf + ')' + (pos ? ' ' + pos : '') + ' ' + src;
    line += ' destination static ' + dstObj + ' ' + dstObj;
    if (type === 'identity' && data.tn_noproxy) line += ' no-proxy-arp route-lookup';
    if (desc) line += ' description ' + desc;
    c += '!\n' + line + '\n';
    c += '!\n! Doğrulama:\n! show nat detail\n! show xlate\n';
    c += '! packet-tracer input ' + realIf + ' tcp KAYNAK-IP 12345 HEDEF-IP 443 detailed\n';
    return c;
}

// ── ASA: Threat Detection ─────────────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/firewall/asa-920-firewall-config/conns-threat.html
//            https://www.cisco.com/c/en/us/support/docs/security/secure-firewall-asa/222315-configure-threat-detection-services-for.html (VPN servisleri)
CiscoASA.threatDetection = {
    label: 'Threat Detection',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-radiation',
                title: 'ASA Threat Detection',
                desc: 'Temel tehdit istatistikleri, tarama tespiti (isteğe bağlı shun) ve RA-VPN parola püskürtme (brute-force) koruması.'
            },
            sections: [
                {
                    title: 'Temel ve İstatistik',
                    icon: 'fas fa-chart-bar',
                    fields: [
                        { name: 'td_basic', label: 'threat-detection basic-threat', type: 'checkbox', checked: true, hint: 'Varsayılan açıktır; performans etkisi yok', why: "ACL düşüşleri, bozuk paketler ve DoS oranlarını izler. Kapatılmışsa <code>show threat-detection rate</code> boş döner ve saldırı anında görünürlük kaybolur." },
                        { name: 'td_acl_stats', label: 'threat-detection statistics access-list', type: 'checkbox', checked: true, hint: 'Varsayılan açık', why: "ACL bazlı istatistikler en çok düşürülen kuralı gösterir. Host/port istatistikleri ise ciddi performans etkisi yaptığı için burada sunulmadı." }
                    ]
                },
                {
                    title: 'Tarama Tespiti',
                    icon: 'fas fa-search',
                    warn: 'Kılavuz: tarama tespiti ASA performansını ve belleğini <b>ciddi</b> biçimde etkileyebilir.',
                    fields: [
                        { name: 'td_scan', label: 'threat-detection scanning-threat', type: 'checkbox', checked: false, hint: 'Port/host taramalarını tespit eder', why: "Yüksek trafikli cihazlarda host bazlı veri yapıları bellek tüketir; önce bakım penceresinde deneyin." },
                        { name: 'td_shun', label: 'Tarayanları engelle (shun)', type: 'checkbox', checked: false, hint: 'Yalnız tarama tespiti açıkken', why: "Shun, tespit edilen IP'nin tüm bağlantılarını keser. Yanlış pozitif (ör. zafiyet tarayıcısı, izleme sunucusu) kritik bir sistemi engelleyebilir; istisna ekleyin." },
                        { name: 'td_shun_except', label: 'Shun İstisnası (IP Maske)', type: 'text', validate: 'ip_mask', placeholder: '10.0.0.0 255.0.0.0', hint: 'Asla engellenmeyecek ağ', why: "İç izleme ve tarama sistemlerini istisna etmezseniz kendi güvenlik araçlarınız engellenir." },
                        { name: 'td_shun_dur', label: 'Shun Süresi (sn)', type: 'text', min: 10, max: 2592000, placeholder: '3600', hint: 'Boşsa varsayılan 3600', why: "Çok uzun süre, yanlış pozitifte uzun kesinti demektir; çok kısa süre ise saldırganın hızla geri dönmesine izin verir." }
                    ]
                },
                {
                    title: 'RA-VPN Brute-Force Koruması',
                    icon: 'fas fa-user-lock',
                    info: 'Asgari sürümler: 9.16(4)67, 9.17(1)45, 9.18(4)40, 9.19(1)37, 9.20(3), 9.22(1.1). Varsayılan olarak kapalıdır.',
                    fields: [
                        { name: 'td_vpn_auth', label: 'remote-access-authentication', type: 'checkbox', checked: false, hint: 'Tekrarlanan başarısız VPN girişlerini shun\'la', why: "Parola püskürtme saldırıları AAA sunucusunu kilitler ve hesapları kilitletir. Bu servis, eşik aşıldığında kaynak IP'yi engeller." },
                        { name: 'td_vpn_auth_hold', label: 'Auth Hold-down (dk)', type: 'text', min: 1, max: 1440, requiredIf: { field: 'td_vpn_auth', checked: true }, placeholder: '10', hint: 'Başarısız denemelerin sayıldığı pencere', why: "Pencere çok kısa olursa yavaş saldırılar eşiğe hiç ulaşmaz." },
                        { name: 'td_vpn_auth_thr', label: 'Auth Eşiği', type: 'text', min: 1, max: 100, requiredIf: { field: 'td_vpn_auth', checked: true }, placeholder: '20', hint: 'Pencere içinde kaç başarısız deneme', why: "Çok düşük eşik, parolasını unutan meşru kullanıcıyı ve aynı NAT arkasındaki herkesi engelleyebilir." },
                        { name: 'td_vpn_init', label: 'remote-access-client-initiations', type: 'checkbox', checked: false, hint: 'Tamamlanmayan bağlantı başlatmalarını shun\'la', why: "Kimlik doğrulamaya hiç ulaşmayan tekrarlı oturum başlatmaları kaynak tüketir; bu servis onları sınırlar." },
                        { name: 'td_vpn_init_hold', label: 'Initiation Hold-down (dk)', type: 'text', min: 1, max: 1440, requiredIf: { field: 'td_vpn_init', checked: true }, placeholder: '10', hint: '1-1440', why: "Başlatmaların sayıldığı pencere; kısa pencere yavaş saldırıları kaçırır." },
                        { name: 'td_vpn_init_thr', label: 'Initiation Eşiği', type: 'text', min: 5, max: 100, requiredIf: { field: 'td_vpn_init', checked: true }, placeholder: '20', hint: '5-100', why: "Çok düşük eşik, bağlantısı kararsız meşru kullanıcıları engelleyebilir." },
                        { name: 'td_vpn_invalid', label: 'invalid-vpn-access', type: 'checkbox', checked: false, hint: 'Geçersiz VPN erişim denemelerini engelle', why: "Var olmayan bağlantı profillerine veya yanlış yöntemlerle yapılan denemeleri anında engeller." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaThreatGen(data));
    }
};
function cgAsaThreatGen(data) {
    const exc = cgEsc(data.td_shun_except || '').trim().split(/\s+/).join(' '), dur = cgEsc(data.td_shun_dur || '');
    const aHold = cgEsc(data.td_vpn_auth_hold || ''), aThr = cgEsc(data.td_vpn_auth_thr || '');
    const iHold = cgEsc(data.td_vpn_init_hold || ''), iThr = cgEsc(data.td_vpn_init_thr || '');
    let c = '! ========================================\n! Cisco ASA — Threat Detection\n! ========================================\n';
    if (data.td_basic) c += 'threat-detection basic-threat\n';
    if (data.td_acl_stats) c += 'threat-detection statistics access-list\n';
    if (data.td_scan) {
        c += 'threat-detection scanning-threat' + (data.td_shun ? ' shun' : '') + '\n';
        if (data.td_shun && exc) c += 'threat-detection scanning-threat shun except ip-address ' + exc + '\n';
        if (data.td_shun && dur) c += 'threat-detection scanning-threat shun duration ' + dur + '\n';
    }
    if (data.td_vpn_invalid) c += 'threat-detection service invalid-vpn-access\n';
    if (data.td_vpn_init && iHold && iThr) c += 'threat-detection service remote-access-client-initiations hold-down ' + iHold + ' threshold ' + iThr + '\n';
    if (data.td_vpn_auth && aHold && aThr) c += 'threat-detection service remote-access-authentication hold-down ' + aHold + ' threshold ' + aThr + '\n';
    c += '!\n! Doğrulama:\n! show threat-detection rate\n';
    if (data.td_scan) c += '! show threat-detection scanning-threat\n! show threat-detection shun\n';
    if (data.td_vpn_auth || data.td_vpn_init || data.td_vpn_invalid) c += '! show threat-detection service\n';
    c += '! show shun\n';
    return c;
}

// ── ASA: DHCP Sunucu / Relay ──────────────────────────────────────────────────
// Sözdizimi: https://www.cisco.com/c/en/us/td/docs/security/asa/asa920/configuration/general/asa-920-general-config/basic-dhcp-ddns.html
CiscoASA.dhcpServer = {
    label: 'DHCP Sunucu / Relay',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'ASA DHCP',
                desc: 'ASA üzerinde DHCPv4 sunucusu (<code>dhcpd</code>) veya merkezi sunucuya DHCP relay (<code>dhcprelay</code>). Aynı arayüzde ikisi birlikte çalışmaz.'
            },
            configTypes: [
                { id: 'server', label: 'DHCP Sunucu', icon: 'fas fa-server', desc: 'Adresleri ASA dağıtır (küçük şube)', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'relay', label: 'DHCP Relay', icon: 'fas fa-share', desc: 'İstekleri merkezi DHCP sunucusuna iletir', badge: { text: 'Kurumsal', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'DHCP Sunucu',
                    icon: 'fas fa-server',
                    showFor: ['server'],
                    info: 'Havuz arayüz subnetinde olmalı ve en fazla 256 adres içerebilir. DNS, alan adı ve kira süresi tüm arayüzler için geneldir.',
                    fields: [
                        { name: 'dh_if', label: 'Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'Adres dağıtılacak arayüz', why: "Her arayüzde yalnızca bir havuz olabilir; havuz arayüz subnetinin dışındaysa komut reddedilir." },
                        { name: 'dh_range', label: 'Adres Havuzu', type: 'text', validate: 'ip_range', required: true, placeholder: '192.168.1.100-192.168.1.199', hint: 'başlangıç-bitiş', why: "Havuz, statik IP'li cihazlar ve ASA'nın kendi adresiyle çakışmamalıdır; çakışmada IP çatışması ve kesinti yaşanır." },
                        { name: 'dh_gw', label: 'Default Gateway (option 3)', type: 'text', validate: 'ip', placeholder: '192.168.1.1', hint: 'Boşsa istemciler gateway olarak ASA arayüzünü alır', why: "Gateway ASA değil de başka bir router ise option 3 ile açıkça verilmelidir." },
                        { name: 'dh_dns1', label: 'DNS 1', type: 'text', validate: 'ip', placeholder: '10.0.0.53', hint: 'İstemcilere verilecek DNS', why: "DNS verilmezse istemciler isim çözemez; internet 'çalışmıyor' gibi görünür." },
                        { name: 'dh_dns2', label: 'DNS 2', type: 'text', validate: 'ip', placeholder: '10.0.0.54', hint: 'Yedek DNS', why: "Tek DNS sunucusunun arızası tüm isim çözümlemesini durdurur." },
                        { name: 'dh_domain', label: 'Alan Adı', type: 'text', validate: 'hostname', placeholder: 'corp.example.com', hint: 'option 15', why: "Kısa adlarla erişimde (ör. <code>fileserver</code>) istemcinin tam adı oluşturması için gerekir." },
                        { name: 'dh_lease', label: 'Kira Süresi (sn)', type: 'text', min: 300, max: 1048575, placeholder: '86400', hint: 'Boşsa varsayılan 3600', why: "Kısa kira yoğun ağlarda DHCP trafiğini artırır; uzun kira ise misafir ağlarında havuzun tükenmesine yol açar." }
                    ]
                },
                {
                    title: 'DHCP Relay',
                    icon: 'fas fa-share',
                    showFor: ['relay'],
                    fields: [
                        { name: 'rl_server', label: 'DHCP Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.20', hint: 'Merkezi DHCP sunucusu', why: "Sunucuda relay edilen subnet için kapsam tanımlı olmalıdır; aksi halde istekler iletilir ama yanıt gelmez." },
                        { name: 'rl_server_if', label: 'Sunucuya Giden Arayüz (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'inside', hint: 'Sunucunun bulunduğu arayüz', why: "Relay paketleri bu arayüzden çıkar; yanlış arayüz seçimi isteklerin sunucuya ulaşmamasına yol açar." },
                        { name: 'rl_client_if', label: 'İstemci Arayüzü (Nameif)', type: 'text', validate: 'nameif', required: true, placeholder: 'dmz', hint: 'DHCP isteklerinin geldiği arayüz', why: "Bu arayüzde aynı anda <code>dhcpd enable</code> varsa relay çalışmaz." },
                        { name: 'rl_setroute', label: 'dhcprelay setroute', type: 'checkbox', checked: true, hint: 'Yanıttaki gateway\'i ASA arayüzü yap', why: "Sunucu istemciye farklı bir gateway bildirirse istemci trafiği ASA'yı atlayabilir; setroute bunu ASA arayüz adresiyle değiştirir." },
                        { name: 'rl_timeout', label: 'Relay Zaman Aşımı (sn)', type: 'text', min: 1, max: 3600, placeholder: '60', hint: 'Boşsa varsayılan 60', why: "Yavaş WAN üzerindeki sunucularda kısa zaman aşımı yanıtların düşürülmesine yol açar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgAsaDhcpGen(data));
    }
};
function cgAsaDhcpGen(data) {
    const type = cgEsc(data._cgtype || 'server');
    let c = '! ========================================\n! Cisco ASA — DHCP\n! ========================================\n';
    if (type === 'relay') {
        const srv = cgEsc(data.rl_server || ''), srvIf = cgEsc(data.rl_server_if || '');
        const cliIf = cgEsc(data.rl_client_if || ''), tmo = cgEsc(data.rl_timeout || '');
        c += 'dhcprelay server ' + srv + ' ' + srvIf + '\n';
        c += 'dhcprelay enable ' + cliIf + '\n';
        if (data.rl_setroute) c += 'dhcprelay setroute ' + cliIf + '\n';
        if (tmo) c += 'dhcprelay timeout ' + tmo + '\n';
        c += '!\n! Doğrulama:\n! show dhcprelay state\n! show dhcprelay statistics\n';
        return c;
    }
    const dIf = cgEsc(data.dh_if || '');
    const range = cgEsc(data.dh_range || '').trim().split(/\s*[-\s]\s*/).filter(Boolean).join('-');
    const gw = cgEsc(data.dh_gw || ''), dns1 = cgEsc(data.dh_dns1 || ''), dns2 = cgEsc(data.dh_dns2 || '');
    const dom = cgEsc(data.dh_domain || ''), lease = cgEsc(data.dh_lease || '');
    c += 'dhcpd address ' + range + ' ' + dIf + '\n';
    const dns = [dns1, dns2].filter(Boolean).join(' ');
    if (dns) c += 'dhcpd dns ' + dns + '\n';
    if (dom) c += 'dhcpd domain ' + dom + '\n';
    if (lease) c += 'dhcpd lease ' + lease + '\n';
    if (gw) c += 'dhcpd option 3 ip ' + gw + '\n';
    c += 'dhcpd enable ' + dIf + '\n';
    c += '!\n! Doğrulama:\n! show dhcpd state\n! show dhcpd binding\n! show dhcpd statistics\n';
    return c;
}
