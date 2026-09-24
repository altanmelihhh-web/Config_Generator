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
    let c = '# ========================================\n# Cisco ASA — Interface Configuration\n# ========================================\n\n';
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
    c += '# Doğrulama:\n# show interface ip brief\n# show nameif\n# show ip address\n';
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
    let c = '# ========================================\n# Cisco ASA — NAT Configuration\n# ========================================\n\n';
    if (type === 'pat') {
        const subnet = cgEsc(data.pat_subnet || ''), inside = cgEsc(data.pat_inside || ''), outside = cgEsc(data.pat_outside || '');
        c += '! Dynamic PAT (Interface Overload)\nobject network ' + obj + '\n subnet ' + subnet + '\n nat (' + inside + ',' + outside + ') dynamic interface\n!\n\n';
    } else {
        const host = cgEsc(data.static_host || ''), mapped = cgEsc(data.static_mapped || '');
        const inside = cgEsc(data.static_inside || ''), outside = cgEsc(data.static_outside || '');
        c += '! Static NAT (One-to-One)\nobject network ' + obj + '\n host ' + host + '\n nat (' + inside + ',' + outside + ') static ' + mapped + '\n!\n\n';
    }
    c += '# Doğrulama:\n# show nat\n# show nat detail\n# show xlate\n';
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
                        { name: 'src', why: "8.3 ve sonrasında ACL, NAT’lanmış değil <b>gerçek (real)</b> IP adresine göre yazılır. Eski alışkanlıkla mapped adres yazmak kuralın hiç eşleşmemesine yol açar.", label: 'Kaynak', type: 'text', required: true, placeholder: 'any veya 192.168.1.0 255.255.255.0', hint: 'Kaynak IP adresi veya any' },
                        { name: 'dst', why: "Dışarıdan bir DMZ sunucusuna erişim yazarken hedef, NAT’lı dış IP değil sunucunun <b>gerçek iç IP</b> adresidir. Bu ayrımı kaçırmak port-forward çalışmamasının bir numaralı nedenidir.", label: 'Hedef', type: 'text', required: true, placeholder: 'host 203.0.113.10 veya any', hint: 'Hedef IP adresi veya host' },
                        { name: 'dst_port', why: "Port yazımı <code>eq 443</code> ya da <code>range 8000 8100</code> biçimindedir; yalnızca sayı girmek satırı geçersiz kılar. FTP, SIP, TFTP gibi dinamik port açan protokollerde ayrıca inspect gerekir.", label: 'Hedef Port', type: 'text', validate: 'port_match', optional: true, placeholder: 'eq 80', hint: 'TCP/UDP için port belirtimi — veya range 80 443' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_iface', why: "Bir ACL, <code>access-group</code> ile arayüze bağlanmadıkça hiçbir etkisi olmaz. Yazılmış ama bağlanmamış ACL, ASA’da en sık görülen sessiz hatadır.", label: 'Uygulama Interface (Nameif)', type: 'text', validate: 'iface', optional: true, placeholder: 'outside', hint: 'ACL bağlanacak interface (boş bırakılabilir)' },
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
    let c = '# ========================================\n# Cisco ASA — ACL Configuration\n# ========================================\n\n';
    let rule = 'access-list ' + name + ' extended ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (port && (proto === 'tcp' || proto === 'udp')) rule += ' ' + port;
    c += rule + '\n';
    c += 'access-list ' + name + ' extended deny ip any any\n\n';
    if (applyIface) {
        c += 'access-group ' + name + ' ' + dir + ' interface ' + applyIface + '\n\n';
    }
    c += '# Doğrulama:\n# show access-list ' + name + '\n# show access-group\n';
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
                        { name: 'outside_iface', why: "Crypto map <code>crypto map MAP interface outside</code> ile bu arayüze bağlanmazsa tünel hiç kurulmaz. Ayrıca IKE bu arayüzde açık olmalıdır (<code>crypto ikev2 enable outside</code>).", label: 'Outside Interface', type: 'text', validate: 'iface', required: true, placeholder: 'outside', hint: 'VPN bitişinin bağlı olduğu nameif' },
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
    let c = '# ========================================\n# Cisco ASA — IPSec VPN (Site-to-Site)\n# ========================================\n\n';
    c += '! Phase 1 — IKEv1 Policy\ncrypto isakmp enable ' + oiface + '\ncrypto isakmp policy 10\n';
    c += ' authentication pre-share\n encryption ' + enc + '\n hash ' + hash + '\n group ' + dhgrp + '\n lifetime 86400\n!\n\n';
    c += '! Phase 2 — Transform Set\ncrypto ipsec ikev1 transform-set TS esp-' + enc + ' esp-' + hash + '-hmac\n!\n\n';
    c += '! Tunnel Group (Peer)\ntunnel-group ' + peer + ' type ipsec-l2l\ntunnel-group ' + peer + ' ipsec-attributes\n ikev1 pre-shared-key ' + psk + '\n!\n\n';
    c += '! Crypto ACL\naccess-list ' + aclName + ' extended permit ip ' + localNet + ' ' + remoteNet + '\n!\n\n';
    c += '! Crypto Map\ncrypto map CMAP 10 match address ' + aclName + '\ncrypto map CMAP 10 set peer ' + peer + '\ncrypto map CMAP 10 set ikev1 transform-set TS\ncrypto map CMAP interface ' + oiface + '\n\n';
    c += '# Doğrulama:\n# show crypto isakmp sa\n# show crypto ipsec sa\n# show crypto map\n# show vpn-sessiondb l2l\n';
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
    let c = '# ========================================\n# Cisco ASA — AAA Configuration\n# ========================================\n\n';
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
    c += '! AAA Kimlik Doğrulama Kuralları\n';
    if (sshEnable) c += 'aaa authentication ssh console ' + serverGrp + '\n';
    if (httpEnable) c += 'aaa authentication http console ' + serverGrp + '\n';
    if (consoleEnable) c += 'aaa authentication serial console ' + serverGrp + '\n';
    c += '\n# Doğrulama:\n# show aaa-server\n# show aaa-server ' + serverGrp + '\n# test aaa authentication ' + serverGrp + ' username admin password test\n';
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
                        { name: 'pbr_iface', why: "PBR, trafiğin <b>girdiği</b> arayüze uygulanır; çıkış arayüzüne uygulamak hiçbir etki yaratmaz. PBR çalışmıyor şikayetlerinin büyük kısmı bu hatadan kaynaklanır.", label: 'PBR Interface (Nameif)', type: 'text', validate: 'iface', optional: true, placeholder: 'inside', hint: 'Route-map uygulanacak interface' }
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
    let c = '# ========================================\n# Cisco ASA — Routing Configuration\n# ========================================\n\n';
    if (type === 'static') {
        const nameif = cgEsc(data.nameif || ''), network = cgEsc(data.network || '');
        const mask = cgEsc(data.mask || ''), nexthop = cgEsc(data.nexthop || '');
        const metric = cgEsc(data.metric || '1');
        c += 'route ' + nameif + ' ' + network + ' ' + mask + ' ' + nexthop + ' ' + metric + '\n\n';
        c += '# Doğrulama:\n# show route\n# show route ' + network + '\n';
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
        c += '# Doğrulama:\n# show route-map\n# show ip policy\n# debug ip policy\n';
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
                        { name: 'sp_iface', why: "Arayüz bazlı uygulama global politikayı o arayüzde tamamen devre dışı bırakır; yani mevcut varsayılan inspect’leri de kaybedersiniz. Gerekli inspect satırlarını yeni politikaya elle eklemelisiniz.", label: 'Interface (Nameif)', type: 'text', validate: 'iface', optional: true, placeholder: 'outside', hint: 'Belirli interface seçiliyse nameif girin' }
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
    let c = '# ========================================\n# Cisco ASA — MPF Service Policy\n# ========================================\n\n';
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
    c += '# Doğrulama:\n# show service-policy\n# show service-policy global\n# show service-policy interface ' + (spIface || 'outside') + '\n';
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
                        { name: 'aa_grp1_active', why: "Active/Active modda her failover grubu ayrı bir security context’e aittir ve yük iki cihaza bölünür. Her iki grubu da aynı cihazda aktif bırakmak Active/Standby’den farksız hale getirir.", label: 'Grup 1 — Aktif Cihaz', type: 'text', optional: true, placeholder: 'primary', hint: 'primary veya secondary' },
                        { name: 'aa_grp2_active', why: "İkinci grubu diğer cihazda aktif tutmak yükü dağıtır, ancak bir cihaz düştüğünde tek cihaz <b>iki katı</b> trafiği taşımak zorunda kalır. Kapasiteyi buna göre planlayın.", label: 'Grup 2 — Aktif Cihaz', type: 'text', optional: true, placeholder: 'secondary', hint: 'primary veya secondary' },
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
    let c = '# ========================================\n# Cisco ASA — Failover HA\n# ========================================\n\n';
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
        c += '# Bu konfigürasyonu aktif cihaza uygula\n# Standby cihaz otomatik sync alır\n\n';
    } else {
        const grp1Active = cgEsc(data.aa_grp1_active || 'primary'), grp2Active = cgEsc(data.aa_grp2_active || 'secondary');
        const aaActiveIp = cgEsc(data.aa_active_ip || ''), aaStandbyIp = cgEsc(data.aa_standby_ip || '');
        const aaMask = cgEsc(data.aa_mask || '');
        c += '! Active/Active — Multi-Context gereklidir\nmode multiple\n\n';
        c += '! Failover Link\ninterface ' + foIface + '\n no shutdown\n!\n';
        c += 'failover interface ip ' + foIfaceNameif + ' ' + aaActiveIp + ' ' + aaMask + ' standby ' + aaStandbyIp + '\n';
        c += 'failover link ' + foIfaceNameif + ' ' + foIface + '\n\n';
        c += '! Failover Grupları\nfailover group 1\n primary\n preempt\n!\n';
        c += 'failover group 2\n ' + (grp2Active === 'secondary' ? 'secondary' : 'primary') + '\n preempt\n!\n\n';
    }
    c += '# Doğrulama:\n# show failover\n# show failover state\n# show failover statistics\n';
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
                        { name: 'rad_iface', why: "RADIUS trafiği bu arayüzden çıkar; yanlış arayüz seçilirse paketler sunucuya hiç ulaşmaz ve her giriş timeout’a düşer. Sunucu tarafında da ASA’nın bu arayüz IP’si NAS client olarak tanımlı olmalıdır.", label: 'Bağlantı Interface (Nameif)', type: 'text', validate: 'iface', required: true, placeholder: 'inside', hint: 'RADIUS sunucusuna erişim interface' }
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
    let c = '# ========================================\n# Cisco ASA — AAA RADIUS\n# ========================================\n\n';
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
    c += '\n# Doğrulama:\n# show aaa-server\n# show aaa-server ' + grpName + '\n# show aaa-server ' + grpName + ' host ' + rad1Ip + '\n';
    c += '# test aaa-server authentication ' + grpName + ' host ' + rad1Ip + ' username testuser password testpass\n';
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
                        { name: 'iface', why: "OSPF’in bu arayüzde gerçekten açıldığını <code>show ospf interface</code> ile doğrulayın. Arayüz security-level veya ACL nedeniyle OSPF çoklu yayınını engelliyorsa komşuluk hiç kurulmaz.", label: 'Interface (Nameif)', type: 'text', validate: 'iface', required: true, placeholder: 'inside', hint: 'OSPF etkinleştirilecek interface nameif' },
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
    let c = '# ========================================\n# Cisco ASA — OSPF Configuration\n# ========================================\n\n';
    c += 'router ospf ' + pid + '\n';
    if (rid) c += ' router-id ' + rid + '\n';
    c += ' network ' + network + ' ' + wc + ' area ' + area + '\n';
    c += ' log-adj-changes\n!\n\n';
    if (cost) {
        c += '! OSPF Interface Parameters\ninterface ' + iface + '\n ospf cost ' + cost + '\n ospf hello-interval 10\n ospf dead-interval 40\n!\n\n';
    }
    c += '# Doğrulama:\n# show ospf\n# show ospf neighbor\n# show ospf database\n# show route ospf\n';
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
                        { name: 'pool_start', why: "Havuz aralığı iç ağ ile çakışmamalıdır; çakışırsa yönlendirme belirsizleşir ve VPN istemcileri iç kaynaklara ulaşamaz. Ayrıca bu subnet iç yönlendirmede ASA’ya işaret etmelidir.", label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '10.200.0.1', hint: 'Havuz başlangıç adresi' },
                        { name: 'pool_end', why: "Havuz boyutu eşzamanlı kullanıcı sayısından küçükse fazladan kullanıcılar <b>adres yok</b> hatasıyla reddedilir. Büyüme payı bırakın.", label: 'Pool Bitiş IP', type: 'text', validate: 'ip', required: true, placeholder: '10.200.0.254', hint: 'Havuz bitiş adresi' },
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
    let c = '# ========================================\n# Cisco ASA — AnyConnect SSL VPN\n# ========================================\n\n';
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
    c += '# Doğrulama:\n# show vpn-sessiondb anyconnect\n# show webvpn anyconnect\n# show run webvpn\n# show run tunnel-group ' + tgName + '\n';
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
    let c = '# ========================================\n# Cisco ASA — Object Groups\n# ========================================\n\n';
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
        c += '# ACL\'de kullanım:\n# access-list OUTSIDE_IN extended permit tcp any object-group ' + grpName + ' eq https\n';
    } else {
        const grpName = cgEsc(data.svc_grp_name || ''), proto = cgEsc(data.svc_proto || 'tcp');
        const ports = cgEsc(data.svc_ports || '').split(/\s+/).filter(Boolean);
        c += '! Service Object Group\nobject-group service ' + grpName + ' ' + proto + '\n';
        ports.forEach(p => { c += ' port-object eq ' + p + '\n'; });
        c += '!\n\n';
        c += '# ACL\'de kullanım:\n# access-list OUTSIDE_IN extended permit ' + proto + ' any any object-group ' + grpName + '\n';
    }
    c += '\n# Doğrulama:\n# show object-group\n# show run object-group\n';
    return c;
}
