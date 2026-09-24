'use strict';

const HuaweiUSG = {};

HuaweiUSG.zone = {
    label: 'Security Zone',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Zone (Huawei USG)',
                desc: 'Huawei USG/NGFW güvenlik zone tanımı — Trust ve Untrust zone için interface atama ve IP konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Trust Zone',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'trust_iface', why: "USG üzerinde bir arayüz <b>security zone</b> içine alınmadan üzerinden hiçbir trafik geçmez; IP verilmiş ve up durumda olsa bile paketler sessizce düşer. Bu, Huawei güvenlik duvarlarında en sık yapılan ve teşhisi en çok geciken hatadır.", label: 'Trust Zone Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Trust zone\'a atanacak interface adı' },
                        { name: 'trust_ip', why: "IP ve maske <b>boşlukla</b> ayrılmış yazılır (<code>10.1.1.1 255.255.255.0</code>), CIDR kabul edilmez. Yanlış subnet verildiğinde iç istemciler gateway olarak cihazı göremez ve arıza politika sorunu sanılır.", label: 'Trust IP / Mask', type: 'text', required: true, placeholder: '192.168.1.1 255.255.255.0', hint: 'IP adresi ve subnet mask (boşlukla ayrılmış)' }
                    ]
                },
                {
                    title: 'Untrust Zone',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'untrust_iface', why: "Untrust zone varsayılan olarak en düşük önceliğe sahiptir; WAN arayüzünü yanlışlıkla trust içine almak, internetten gelen trafiğin yüksek öncelikli bölgeden geliyormuş gibi değerlendirilmesine ve güvenlik modelinin tamamen çökmesine yol açar.", label: 'Untrust Zone Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'Untrust zone\'a atanacak interface adı (WAN tarafı)' },
                        { name: 'untrust_ip', why: "WAN adresi ISPnin verdiğiyle aynı olmalıdır; ayrıca bu adres NAT ve IPSec yapılandırmalarında da referans alınır. Değiştiğinde NAT Server ve VPN peer tanımlarını güncellemezseniz dışarıdan erişim ve tüneller sessizce kopar.", label: 'Untrust IP / Mask', type: 'text', required: true, placeholder: '203.0.113.1 255.255.255.252', hint: 'WAN IP adresi ve subnet mask' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ti = cgEsc(data.trust_iface || ''), tip = cgEsc(data.trust_ip || '');
            const ui = cgEsc(data.untrust_iface || ''), uip = cgEsc(data.untrust_ip || '');
            let c = '# ========================================\n# Huawei USG — Security Zone\n# ========================================\n\n';
            c += '[Huawei] system-view\n\n';
            c += '# Interface konfigürasyonu\n[Huawei] interface ' + ti + '\n[Huawei-' + ti + '] ip address ' + tip + '\n[Huawei-' + ti + '] quit\n\n';
            c += '[Huawei] interface ' + ui + '\n[Huawei-' + ui + '] ip address ' + uip + '\n[Huawei-' + ui + '] quit\n\n';
            c += '# Zone tanımla\n[Huawei] firewall zone trust\n[Huawei-zone-trust] set priority 85\n[Huawei-zone-trust] add interface ' + ti + '\n[Huawei-zone-trust] quit\n\n';
            c += '[Huawei] firewall zone untrust\n[Huawei-zone-untrust] set priority 5\n[Huawei-zone-untrust] add interface ' + ui + '\n[Huawei-zone-untrust] quit\n\n';
            c += '# Doğrulama:\n# display firewall zone\n# display interface brief\n';
            return c;
        });
    }
};

HuaweiUSG.policy = {
    label: 'Security Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Policy (Huawei USG)',
                desc: 'Huawei USG zone tabanlı güvenlik politikası — kaynak/hedef zone ve IP bazlı erişim kuralı tanımı.'
            },
            sections: [
                {
                    title: 'Kural Tanımı',
                    icon: 'fas fa-list-alt',
                    fields: [
                        { name: 'rule_name', why: "Kural adı USGde benzersiz kimliktir ve boşluk içeremez. Var olan bir adı tekrar kullanmak eski kuralın üzerine yazar; fark edilmeden mevcut bir izin kuralını silmiş olabilirsiniz.", label: 'Kural Adı', type: 'text', required: true, placeholder: 'ALLOW-TRUST-TO-UNTRUST', hint: 'Benzersiz kural adı, boşluk kullanmayın' },
                        { name: 'src_zone', why: "Kaynak zone trafiğin hangi yönde değerlendirileceğini belirler. Zone çiftini ters yazmak (inbound yerine outbound) kuralın hiç eşleşmemesine neden olur ve kural listesinde doğru görünmesine rağmen trafik varsayılan <code>deny</code> ile düşer.", label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'trust', hint: 'Trafiğin geldiği güvenlik zone adı' },
                        { name: 'dst_zone', why: "Hedef zone kaynakla birlikte interzone ilişkisini kurar; aynı zone içindeki trafik (intrazone) varsayılan olarak farklı işlenir ve bu kural onu kapsamaz. Local zone yönetim trafiği içindir, veri trafiği için kullanılmaz.", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Trafiğin gideceği güvenlik zone adı' }
                    ]
                },
                {
                    title: 'Adres ve Aksiyon',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'src_ip', why: "Boş bırakmak <code>any</code> anlamına gelir ve kuralı düşündüğünüzden çok daha geniş açar. Adres nesnesi tanımlanmadan doğrudan subnet yazmak, ileride adres değiştiğinde onlarca kuralı tek tek düzeltmenizi gerektirir.", label: 'Kaynak IP', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'any için boş bırakın, aksi hâlde subnet girin' },
                        { name: 'dst_ip', why: "Hedefi daraltmamak, tek bir servise izin vermek isterken tüm DMZ veya iç ağı açmak demektir. NAT Server ile birlikte kullanırken politika <b>çevrilmiş (iç) adresi</b> görür, dış global IPyi değil; burada yapılan karışıklık en sık NAT arızası nedenidir.", label: 'Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.0 255.255.255.0', hint: 'any için boş bırakın' },
                        { name: 'action', why: "USGde politika listesinin sonunda örtük <code>deny</code> vardır; eşleşmeyen her şey düşer. Kurallar yukarıdan aşağı işlenir ve ilk eşleşen uygulanır, bu yüzden geniş bir permit kuralını listenin üstüne koymak altındaki tüm daraltmaları etkisiz kılar.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'Permit — trafiğe izin ver', selected: true },
                            { value: 'deny', label: 'Deny — trafiği engelle' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ruleName = cgEsc(data.rule_name || ''), srcZone = cgEsc(data.src_zone || '');
            const dstZone = cgEsc(data.dst_zone || ''), srcIp = cgEsc(data.src_ip || '');
            const dstIp = cgEsc(data.dst_ip || ''), action = cgEsc(data.action || 'permit');
            let c = '# ========================================\n# Huawei USG — Security Policy\n# ========================================\n\n';
            c += '[Huawei] system-view\n[Huawei] security-policy\n';
            c += '[Huawei-policy-security] rule name ' + ruleName + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] source-zone ' + srcZone + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] destination-zone ' + dstZone + '\n';
            if (srcIp) c += '[Huawei-policy-security-rule-' + ruleName + '] source-address ' + srcIp + '\n';
            if (dstIp) c += '[Huawei-policy-security-rule-' + ruleName + '] destination-address ' + dstIp + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] action ' + action + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] quit\n[Huawei-policy-security] quit\n\n';
            c += '# Doğrulama:\n# display security-policy rule name ' + ruleName + '\n# display firewall session table\n';
            return c;
        });
    }
};

HuaweiUSG.nat = {
    label: 'NAT (Easy IP / Static)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'NAT (Huawei USG)',
                desc: 'Huawei USG NAT konfigürasyonu — Easy IP (SNAT/masquerade) veya Static NAT (DNAT/sunucu yayınlama).'
            },
            configTypes: [
                { id: 'easyip', label: 'Easy IP (SNAT)', icon: 'fas fa-random', desc: 'İç ağ → WAN, outbound masquerade', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Static NAT (DNAT)', icon: 'fas fa-arrows-alt-h', desc: 'Sunucu yayınlama, port yönlendirme' }
            ],
            sections: [
                {
                    title: 'Easy IP Ayarları',
                    icon: 'fas fa-network-wired',
                    showFor: ['easyip'],
                    fields: [
                        { name: 'out_iface', why: "NAT çıkış arayüzü yanlışsa iç adresler çevrilmeden WAN tarafına çıkar ve ISP tarafında düşürülür; arıza internet kesintisi gibi görünür. Yedek WAN varsa her iki arayüz için ayrı NAT politikası gerekir.", label: 'Outbound Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'WAN tarafındaki çıkış interface\'i' },
                        { name: 'acl_name', why: "USGde kaynak NAT bir <b>address-group</b> üzerinden çalışır; grup tanımlanmadan politikada referans verilirse NAT hiç uygulanmaz. Havuzdaki adres sayısı eşzamanlı oturum sayısını sınırlar, tek adres yoğun kullanımda port tükenmesine yol açar.", label: 'ACL / Address Group Adı', type: 'text', required: true, placeholder: 'LAN_TO_WAN', hint: 'NAT politikası için address group adı' },
                        { name: 'int_net', why: "İç ağ tanımı NATın hangi trafiği kapsadığını belirler; fazla geniş yazmak VPN tüneline gitmesi gereken trafiği de NATlayarak tünelin sessizce boş kalmasına neden olur. IPSec ile birlikte kullanırken NAT muafiyeti şarttır.", label: 'İç Network', type: 'text', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'NAT uygulanacak iç ağ (IP mask formatında)' }
                    ]
                },
                {
                    title: 'Static NAT Ayarları',
                    icon: 'fas fa-server',
                    showFor: ['static'],
                    fields: [
                        { name: 'global_ip', why: "NAT Server için internetten erişilen adres budur ve ISP tarafından size atanmış olmalıdır. Bu adres WAN arayüz IPsi ile aynıysa yönetim portlarıyla çakışma riski doğar; farklıysa ISPnin o adresi cihaza yönlendirdiğinden emin olun.", label: 'Global (Dış) IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.10', hint: 'İnternetten erişilecek dış IP adresi' },
                        { name: 'inside_ip', why: "Sunucunun gerçek iç adresidir ve sabit olmalıdır. Kritik ayrıntı: güvenlik politikası NATtan sonraki bu <b>iç adresi</b> görür, dolayısıyla politikada hedef olarak global IPyi yazarsanız kural hiç eşleşmez ve bağlantı reddedilir.", label: 'Inside (İç) IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Sunucunun iç IP adresi' },
                        { name: 'proto', why: "TCP kuralı UDP trafiğini kapsamaz; DNS, VPN veya VoIP servislerinde yanlış protokol seçimi bağlantının hiç kurulmamasına yol açar ve hata mesajı üretilmez. Her iki protokol gerekiyorsa iki ayrı NAT Server tanımı yazılmalıdır.", label: 'Protocol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'global_port', why: "Dış port doğrudan internete açılır; RDP veya SSH gibi portları tüm dünyaya açmak saldırı yüzeyini ciddi büyütür. Aynı global IP ve port ikilisini iki farklı sunucuya yönlendiremezsiniz, ikinci tanım reddedilir.", label: 'Global Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'Dışarıdan gelen bağlantı portu' },
                        { name: 'inside_port', why: "Sunucunun gerçekten dinlediği port yazılmalıdır; dış port ile farklı olabilir (port çevirme). İç portta servis kapalıysa NAT doğru çalışır ama bağlantı reddedilir ve sorun boş yere güvenlik duvarında aranır.", label: 'Inside Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'Sunucunun dinlediği iç port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'easyip';
            let c = '# ========================================\n# Huawei USG — NAT\n# ========================================\n\n';
            c += '[Huawei] system-view\n\n';
            if (type === 'easyip') {
                const iface = cgEsc(data.out_iface || ''), aclName = cgEsc(data.acl_name || ''), intNet = cgEsc(data.int_net || '');
                c += '# Address Group oluştur\n[Huawei] nat address-group ' + aclName + ' 0\n';
                c += '# Easy IP — Outbound NAT Policy\n[Huawei] nat-policy\n';
                c += '[Huawei-policy-nat] rule name EASY_IP_RULE\n';
                c += '[Huawei-policy-nat-rule-EASY_IP_RULE] source-address ' + intNet + '\n';
                c += '[Huawei-policy-nat-rule-EASY_IP_RULE] egress-interface ' + iface + '\n';
                c += '[Huawei-policy-nat-rule-EASY_IP_RULE] action nat easy-ip\n';
                c += '[Huawei-policy-nat-rule-EASY_IP_RULE] quit\n[Huawei-policy-nat] quit\n';
            } else {
                const gIp = cgEsc(data.global_ip || ''), iIp = cgEsc(data.inside_ip || '');
                const proto = cgEsc(data.proto || 'tcp'), gPort = cgEsc(data.global_port || ''), iPort = cgEsc(data.inside_port || '');
                c += '# Static NAT (Server Map)\n[Huawei] nat server protocol ' + proto + ' global ' + gIp + ' ' + gPort + ' inside ' + iIp + ' ' + iPort + '\n';
            }
            c += '\n# Doğrulama:\n# display nat-policy rule all\n# display nat server\n# display firewall session table\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Interface + Zone ───────────────────────────────────────────────
HuaweiUSG.interface = {
    label: 'Interface + Zone',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface + Zone (Huawei USG)',
                desc: 'Huawei USG interface IP konfigürasyonu ve zone ataması — hem interface hem de zone bağlaması tek adımda.'
            },
            sections: [
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intf_name', why: "Arayüz adı tam yazılmalıdır (<code>GigabitEthernet1/0/1</code>). USGde alt arayüz kullanılıyorsa (<code>.100</code>) VLAN etiketi ayrıca tanımlanmalı, aksi halde arayüz up görünür ama etiketli trafik alınmaz.", label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet1/0/1', hint: 'Fiziksel veya mantıksal interface adı' },
                        { name: 'ip', why: "IP vermek tek başına yetmez; arayüz bir zone içine alınmazsa trafik geçmez. Ayrıca yönetim erişimi için arayüzde <code>service-manage</code> ile ping/https/ssh izinleri ayrı ayrı açılmalıdır, yoksa cihaza kendi arayüzünden erişemezsiniz.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Interface IP adresi' },
                        { name: 'mask', why: "Maske noktalı desimal yazılır. Bir bit hata gateway adresinin subnet dışında kalmasına ve tüm yönlendirmenin sessizce çalışmamasına yol açar; USG bu durumda hata vermez, sadece paketleri düşürür.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Subnet mask (noktalı desimal formatında)' },
                        { name: 'description', why: "Arayüz etiketi kesinti anında hangi kablonun nereye gittiğini gösteren tek güvenilir kaynaktır. Etiketsiz arayüzler, bakım sırasında yanlış WAN bacağının kapatılmasının en yaygın nedenidir.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'LAN Interface', hint: 'Interface açıklaması (opsiyonel)' }
                    ]
                },
                {
                    title: 'Zone Ataması',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'zone', why: "Zone ataması USGde zorunludur: <b>zone yoksa trafik yok</b>. Zone önceliği (local 100, trust 85, dmz 50, untrust 5) varsayılan davranışı belirler; arayüzü yanlış zone içine almak güvenlik modelini tersine çevirir ve dışarıya beklenmedik erişim açar.", label: 'Zone Adı', type: 'text', required: true, placeholder: 'trust', hint: 'Interface\'in atanacağı güvenlik zone adı (trust/untrust/dmz vb.)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.intf_name || ''), ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || ''), zone = cgEsc(data.zone || '');
            const description = cgEsc(data.description || '');
            let c = '# ========================================\n# Huawei USG — Interface + Zone\n# ========================================\n\n';
            c += 'interface ' + intfName + '\n';
            c += ' ip address ' + ip + ' ' + mask + '\n';
            if (description) c += ' description ' + description + '\n';
            c += '#\n\n';
            c += 'firewall zone ' + zone + '\n';
            c += ' add interface ' + intfName + '\n#\n';
            c += '\n# Doğrulama:\n# display interface ' + intfName + '\n# display firewall zone\n';
            return c;
        });
    }
};

// ── HuaweiUSG: IPSec VPN IKEv2 ────────────────────────────────────────────────
HuaweiUSG.ipsec = {
    label: 'IPSec VPN IKEv2',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'IPSec VPN IKEv2 (Huawei USG)',
                desc: 'Huawei USG site-to-site IPSec VPN — IKEv2, AES-256 şifreleme, SHA2-256 ile kimlik doğrulama ve pre-shared key.'
            },
            sections: [
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_name', why: "Bu ad IKE peer, IPSec proposal ve policy zincirini birbirine bağlar. Policy içinde farklı yazılan bir isim tüneli tamamen sessiz bırakır: yapılandırma hatasız görünür fakat SA hiç kurulmaz.", label: 'Peer Adı', type: 'text', required: true, placeholder: 'PEER-HQ', hint: 'IKE peer ve IPSec policy için referans ad' },
                        { name: 'peer_ip', why: "Karşı gateway NAT arkasındaysa NAT-T gerekir ve kimlik IP yerine FQDN olmalıdır. Ayrıca untrust zone ile local zone arasında IKE (UDP 500/4500) trafiğine izin veren bir politika yoksa tünel hiç başlamaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Uzak VPN gateway\'in genel IP adresi' },
                        { name: 'psk', why: "PSK iki tarafta birebir aynı olmalıdır; tek karakter farkı faz 1i başarısız kılar ve log çoğu zaman yalnızca kimlik doğrulama hatası der. Proposal parametreleri (şifreleme, hash, DH grubu) de eşleşmezse doğru anahtarla bile tünel kurulmaz.", label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'VPNSecret123', hint: 'Her iki tarafta aynı olmalı' }
                    ]
                },
                {
                    title: 'Tünel Ağları',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'local_net', why: "Korunan ağlar faz 2 seçicileridir ve iki uçta <b>ayna simetrik</b> olmalıdır. Ayrıca bu trafiğin kaynak NATa girmemesi için NAT muafiyeti tanımlanmalıdır; aksi halde paketler çevrilmiş adresle çıkar, seçiciyle eşleşmez ve tünel boş kalır.", label: 'Local Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel korumalı ağ (CIDR formatında)' },
                        { name: 'remote_net', why: "Uzak ağ karşı taraftaki local tanımıyla birebir eşleşmelidir; maske farkı faz 1 kurulurken faz 2nin sürekli başarısız olmasına yol açar. Bu ağa giden trafiğin tünel arayüzüne yönlenmesi için rota ve iki zone arasında izin politikası da gerekir.", label: 'Remote Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.0/24', hint: 'Uzak korumalı ağ (CIDR formatında)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerName = cgEsc(data.peer_name || ''), peerIp = cgEsc(data.peer_ip || '');
            const psk = cgEsc(data.psk || ''), localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
            function cidrToNetWild(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                const wild = (~mask) >>> 0;
                return { net, wild: [(wild >>> 24) & 0xFF, (wild >>> 16) & 0xFF, (wild >>> 8) & 0xFF, wild & 0xFF].join('.') };
            }
            const ln = cidrToNetWild(localNet), rn = cidrToNetWild(remoteNet);
            let c = '# ========================================\n# Huawei USG — IPSec VPN IKEv2\n# ========================================\n\n';
            c += 'ike proposal 10\n encryption-algorithm aes-256\n dh group14\n authentication-algorithm sha2-256\n authentication-method pre-share\n#\n\n';
            c += 'ike peer ' + peerName + '\n pre-shared-key ' + psk + '\n remote-address ' + peerIp + '\n#\n\n';
            c += 'ipsec proposal ESP-AES256\n transform esp\n esp authentication-algorithm sha2-256\n esp encryption-algorithm aes-256\n#\n\n';
            c += 'ipsec policy ' + peerName + '-POLICY 1 isakmp\n security acl 3100\n ike-peer ' + peerName + '\n proposal ESP-AES256\n#\n\n';
            c += 'acl number 3100\n rule 5 permit ip source ' + ln.net + ' ' + ln.wild + ' destination ' + rn.net + ' ' + rn.wild + '\n#\n';
            c += '\n# Doğrulama:\n# display ike sa\n# display ipsec sa\n';
            return c;
        });
    }
};

// ── HuaweiUSG: SSL VPN ────────────────────────────────────────────────────────
HuaweiUSG.sslvpn = {
    label: 'SSL VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'SSL VPN (Huawei USG)',
                desc: 'Huawei USG SSL VPN gateway ve context konfigürasyonu — uzaktan erişim için IP pool ve AES-256 şifreleme.'
            },
            sections: [
                {
                    title: 'Gateway Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'gw_name', why: "Gateway adı, kullanıcı grupları ve kaynak politikalarının bağlandığı referanstır. İsim uyuşmazlığında kullanıcı giriş yapar ama hiçbir kaynağa erişemez ve sorun kimlik doğrulama gibi görünür.", label: 'Gateway Adı', type: 'text', required: true, placeholder: 'SSL-GW1', hint: 'SSL VPN gateway referans adı' },
                        { name: 'ip', why: "Gateway adresi genellikle untrust arayüz IPsidir ve o arayüzde <code>service-manage https</code> açık olmalıdır. Yönetim HTTPS portu ile çakışırsa cihazın web arayüzüne erişimi kaybedebilirsiniz.", label: 'Gateway IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.254', hint: 'SSL VPN dinleyeceği IP adresi' },
                        { name: 'port', why: "443 seçilirse cihazın yönetim web arayüzüyle çakışır ve biri diğerini devre dışı bırakır; farklı port seçilirse kullanıcıların URLye port yazması gerekir ve kısıtlı misafir ağlarında bu port engellenmiş olabilir.", label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'SSL VPN servis portu (genellikle 443)' }
                    ]
                },
                {
                    title: 'IP Pool',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'ip_pool_start', why: "Havuz, iç ağda kullanılan hiçbir subnetle çakışmamalıdır; çakışma durumunda VPN istemcileri kendi yerel ağlarına erişemez. Ayrıca iç yönlendiricilerde bu havuza dönüş rotası olmalı, yoksa trafik tek yönlü çalışır.", label: 'IP Pool Start', type: 'text', validate: 'ip', required: true, placeholder: '172.16.0.1', hint: 'VPN istemcilerine atanacak IP havuzunun başlangıcı' },
                        { name: 'ip_pool_end', why: "Havuz aralığı eşzamanlı bağlanabilecek kullanıcı sayısını belirler; dar tutulursa yoğun saatte kullanıcılar sessizce bağlanamaz ve hata mesajı erişim reddi gibi görünür.", label: 'IP Pool End', type: 'text', validate: 'ip', required: true, placeholder: '172.16.0.100', hint: 'VPN istemcilerine atanacak IP havuzunun sonu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const gwName = cgEsc(data.gw_name || ''), ip = cgEsc(data.ip || ''), port = cgEsc(data.port || '');
            const ipPoolStart = cgEsc(data.ip_pool_start || ''), ipPoolEnd = cgEsc(data.ip_pool_end || '');
            let c = '# ========================================\n# Huawei USG — SSL VPN\n# ========================================\n\n';
            c += 'ssl vpn gateway ' + gwName + '\n';
            c += ' ip address ' + ip + ' port ' + port + '\n';
            c += ' ssl encrypt-cipher aes-256-sha256\n';
            c += ' service enable\n#\n\n';
            c += 'ssl vpn context ' + gwName + '-CTX\n';
            c += ' gateway ' + gwName + '\n';
            c += ' ip-pool start-ip ' + ipPoolStart + ' end-ip ' + ipPoolEnd + '\n';
            c += ' service enable\n#\n';
            c += '\n# Doğrulama:\n# display ssl vpn gateway\n# display ssl vpn context\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Anti-Virus Profile ─────────────────────────────────────────────
HuaweiUSG.antivirus = {
    label: 'Anti-Virus Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'Anti-Virus Profile (Huawei USG)',
                desc: 'Huawei USG AV profili — tüm uygulama protokollerinde virüs tarama, aksiyon ve opsiyonel whitelist tanımı.'
            },
            sections: [
                {
                    title: 'Profil Ayarları',
                    icon: 'fas fa-shield-virus',
                    fields: [
                        { name: 'profile_name', why: "Profil oluşturmak tek başına hiçbir şey yapmaz; mutlaka bir güvenlik politikasına <code>profile av</code> ile bağlanmalıdır. Bağlanmamış profil konfigürasyonda görünür ve koruma var sanılır, oysa hiçbir dosya taranmaz.", label: 'Profile Adı', type: 'text', required: true, placeholder: 'AV-POLICY', hint: 'Security policy\'de referans gösterilecek AV profil adı' },
                        { name: 'action', why: "<code>declare</code> yalnızca uyarır ve dosya geçer, <code>block</code> engeller. Doğrudan block ile başlamak meşru iş trafiğini kesebilir; önce declare ile izleyip yanlış pozitifleri görmek daha güvenli bir geçiştir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'block', label: 'Block — zararlıları engelle', selected: true },
                            { value: 'alert', label: 'Alert — uyar ve geçir' },
                            { value: 'permit', label: 'Permit — sadece logla' }
                        ]},
                        { name: 'whitelist', why: "Muafiyet listesi taramayı tamamen atlar; gereğinden geniş tutmak kritik sunucuları korumasız bırakır. Yedekleme veya büyük dosya aktarımı yapan sunucular için ise dar bir muafiyet performans sorununu çözer.", label: 'Whitelist IP (CIDR)', type: 'text', validate: 'cidr', optional: true, placeholder: '192.168.1.0/24', hint: 'AV taramasından muaf tutulacak ağ (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const profileName = cgEsc(data.profile_name || ''), action = cgEsc(data.action || 'block');
            const whitelist = cgEsc(data.whitelist || '');
            let c = '# ========================================\n# Huawei USG — Anti-Virus Profile\n# ========================================\n\n';
            c += 'profile type av name ' + profileName + '\n';
            c += ' application all detect action ' + action + '\n';
            if (whitelist) c += ' whitelist ip ' + whitelist + '\n';
            c += '#\n';
            c += '\n# Security policy\'ye eklemek için:\n# In security-policy rule, add: profile av ' + profileName + '\n';
            c += '# Doğrulama:\n# display profile type av name ' + profileName + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: IPS Profile ────────────────────────────────────────────────────
HuaweiUSG.ips = {
    label: 'IPS Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-crosshairs',
                title: 'IPS Profile (Huawei USG)',
                desc: 'Huawei USG IPS profili — imza severity seviyesine göre saldırı tespiti ve önleme aksiyonu tanımı.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'IPS Profil Ayarları',
                    icon: 'fas fa-crosshairs',
                    fields: [
                        { name: 'profile_name', why: "IPS profili bir güvenlik politikasına bağlanmadan etkinleşmez. Ayrıca imza veritabanı güncel değilse profil çalışır ama yeni saldırıları tanımaz; lisans süresi dolduğunda güncelleme sessizce durur.", label: 'Profile Adı', type: 'text', required: true, placeholder: 'IPS-POLICY', hint: 'Security policy\'de referans gösterilecek IPS profil adı' },
                        { name: 'severity', why: "Yalnızca yüksek seviyeyi izlemek orta seviyeli ama gerçek saldırıları kaçırır; tüm seviyeleri engellemek ise yanlış pozitiflerle iş trafiğini keser. Seviye seçimi doğrudan alarm gürültüsü ile risk arasındaki dengeyi belirler.", label: 'Severity', type: 'select', options: [
                            { value: 'high', label: 'High — kritik tehditler', selected: true },
                            { value: 'medium', label: 'Medium — orta düzey tehditler' },
                            { value: 'low', label: 'Low — düşük öncelikli tehditler' },
                            { value: 'all', label: 'All — tüm imzalar' }
                        ]},
                        { name: 'action', why: "Block modunda bir yanlış pozitif üretim uygulamasını anında durdurur ve sorun ağ arızası gibi görünür. Yeni profilleri önce alarm modunda çalıştırıp loglara bakmak kesinti riskini büyük ölçüde azaltır.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'block', label: 'Block — saldırıyı engelle', selected: true },
                            { value: 'alert', label: 'Alert — uyar ve geçir' },
                            { value: 'permit', label: 'Permit — sadece logla' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const profileName = cgEsc(data.profile_name || ''), severity = cgEsc(data.severity || 'high');
            const action = cgEsc(data.action || 'block');
            let c = '# ========================================\n# Huawei USG — IPS Profile\n# ========================================\n\n';
            c += 'profile type ips name ' + profileName + '\n';
            c += ' signature-set severity ' + severity + ' action ' + action + '\n';
            c += ' exception-profile default\n#\n';
            c += '\n# Doğrulama:\n# display profile type ips name ' + profileName + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: URL Filtering ──────────────────────────────────────────────────
HuaweiUSG.urlfilter = {
    label: 'URL Filtering',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'URL Filtering (Huawei USG)',
                desc: 'Huawei USG URL filtreleme profili — kategori bazlı web erişim kontrolü, blacklist ve aksiyon tanımı.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'URL Filtre Ayarları',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'profile_name', why: "URL filtresi güvenlik politikasına bağlanmadan çalışmaz. HTTPS trafiğinde SSL inceleme yapılandırılmamışsa yalnızca SNI üzerinden sınırlı filtreleme yapılabilir ve birçok site kategorilendirilemez.", label: 'Profile Adı', type: 'text', required: true, placeholder: 'URL-FILTER', hint: 'Security policy\'de referans gösterilecek URL filtre profil adı' },
                        { name: 'category', why: "Kategori isimleri cihazın veritabanındaki adlarla birebir eşleşmelidir; yanlış yazılan kategori sessizce yok sayılır ve filtre uygulanmış sanılır. Kategori veritabanı lisansı yoksa sınıflandırma hiç çalışmaz.", label: 'Kategori(ler)', type: 'text', required: true, placeholder: 'gambling,porn', hint: 'Virgülle ayrılmış kategori listesi (ör: gambling, porn, social-networking)' },
                        { name: 'action', why: "Block yanlış kategorilendirilmiş iş sitelerini de keser ve kullanıcı bunu genel internet arızası olarak bildirir. İstisna listesi hazırlamadan geniş kategori engellemek en sık şikâyet kaynağıdır.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'block', label: 'Block — kategoriyi engelle', selected: true },
                            { value: 'alert', label: 'Alert — uyar ve geçir' },
                            { value: 'permit', label: 'Permit — sadece logla' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const profileName = cgEsc(data.profile_name || ''), action = cgEsc(data.action || 'block');
            const categories = cgEsc(data.category || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei USG — URL Filtering\n# ========================================\n\n';
            c += 'profile type url-filter name ' + profileName + '\n';
            c += ' category blacklist\n';
            categories.forEach(cat => {
                c += '  category-name ' + cat + ' action ' + action + '\n';
            });
            c += '#\n';
            c += '\n# Doğrulama:\n# display profile type url-filter name ' + profileName + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Application Control ───────────────────────────────────────────
HuaweiUSG.appcontrol = {
    label: 'Application Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-th-large',
                title: 'Application Control (Huawei USG)',
                desc: 'Huawei USG uygulama kontrolü — app-group bazlı erişim kısıtlaması, P2P/sosyal medya ve kurumsal uygulama yönetimi.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Uygulama Kontrol Ayarları',
                    icon: 'fas fa-app-indicator',
                    fields: [
                        { name: 'profile_name', why: "Uygulama kontrolü profili politikaya bağlanmadan etkisizdir. Uygulama imza veritabanı güncel değilse yeni sürüm uygulamalar tanınmaz ve engellendiği sanılan trafik rahatça geçer.", label: 'Profile Adı', type: 'text', required: true, placeholder: 'APP-CTRL', hint: 'Security policy\'de referans gösterilecek uygulama kontrol profil adı' },
                        { name: 'app_group', why: "Grup adları veritabanındaki adlarla birebir eşleşmelidir; yanlış yazım sessizce yok sayılır. P2P gibi geniş grupları engellemek bazı meşru güncelleme ve yedekleme servislerini de kapsayabilir.", label: 'App Group(lar)', type: 'text', required: true, placeholder: 'P2P,Social-Networking', hint: 'Virgülle ayrılmış uygulama grubu listesi (ör: P2P, Social-Networking, Games)' },
                        { name: 'action', why: "Uygulama engelleme kullanıcı tarafından ağ yavaşlığı veya uygulama hatası olarak algılanır ve destek ekibine güvenlik kuralı olarak ulaşmaz. Engellenen uygulamaları belgelemek teşhis süresini kısaltır.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'block', label: 'Block — grubu engelle', selected: true },
                            { value: 'alert', label: 'Alert — uyar ve geçir' },
                            { value: 'permit', label: 'Permit — sadece logla' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const profileName = cgEsc(data.profile_name || ''), action = cgEsc(data.action || 'block');
            const appGroups = cgEsc(data.app_group || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei USG — Application Control\n# ========================================\n\n';
            c += 'profile type app-control name ' + profileName + '\n';
            appGroups.forEach(grp => {
                c += ' app-group ' + grp + ' action ' + action + '\n';
            });
            c += '#\n';
            c += '\n# Doğrulama:\n# display profile type app-control name ' + profileName + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: HA Dual-System ─────────────────────────────────────────────────
HuaweiUSG.ha = {
    label: 'HA Dual-System',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sync-alt',
                title: 'HA Dual-System (Huawei USG)',
                desc: 'Huawei USG çift sistem yüksek erişilebilirlik — HRP heartbeat, session yansıtma ve preempt konfigürasyonu.'
            },
            sections: [
                {
                    title: 'HA Bağlantı Ayarları',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'local_ip', why: "HRP heartbeat adresi üretim trafiğinden ayrı bir bağlantıda olmalıdır. Heartbeat koparsa iki cihaz da kendini aktif sanar (split-brain), aynı IP adresleri iki yerde duyurulur ve ağ kullanılamaz hale gelir.", label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Bu cihazın HRP heartbeat arayüzü IP adresi' },
                        { name: 'peer_ip', why: "Karşı cihazın heartbeat adresi doğru olmalı ve arada başka bir cihaz veya filtre bulunmamalıdır. Yanlış adres HA kurulmuş gibi görünmesine ama senkronizasyonun hiç çalışmamasına yol açar; yedek cihaz oturum tablosu boş kalır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.2', hint: 'Karşı cihazın HRP heartbeat IP adresi' },
                        { name: 'heartbeat_intf', why: "Heartbeat arayüzü doğrudan kablo ile bağlanmalı ve bu arayüz güvenlik politikalarından etkilenmemelidir. Switch üzerinden geçiriliyorsa o switchin arızası aynı anda her iki güvenlik duvarını da kararsız hale getirir.", label: 'Heartbeat Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'HA heartbeat trafiği için kullanılacak interface' }
                    ]
                },
                {
                    title: 'HA Davranış Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'preempt', why: "Preempt açıkken düzelen birincil cihaz derhal aktif rolü geri alır ve bu geçiş mevcut oturumları düşürebilir; kararsız bir donanımda sürekli rol değişimi (flapping) yaşanır. Kapalı tutmak, sorunu inceleyene kadar kararlı kalmayı sağlar.", label: 'Preempt', type: 'select', options: [
                            { value: 'enable', label: 'Enable — preempt aktif (60sn gecikme)', selected: true },
                            { value: 'disable', label: 'Disable — preempt pasif' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localIp = cgEsc(data.local_ip || ''), peerIp = cgEsc(data.peer_ip || '');
            const heartbeatIntf = cgEsc(data.heartbeat_intf || ''), preempt = cgEsc(data.preempt || 'enable');
            let c = '# ========================================\n# Huawei USG — HA Dual-System\n# ========================================\n\n';
            c += 'hrp enable\n';
            c += 'hrp interface ' + heartbeatIntf + ' remote ' + peerIp + '\n';
            c += 'hrp mirror session enable\n';
            if (preempt === 'enable') c += 'hrp preempt delay 60\n';
            c += '\n# Doğrulama:\n# display hrp state\n# display hrp statistics\n';
            return c;
        });
    }
};

// ── HuaweiUSG: DNS Transparent Proxy ─────────────────────────────────────────
HuaweiUSG.dnsproxy = {
    label: 'DNS Transparent Proxy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-dns',
                title: 'DNS Transparent Proxy (Huawei USG)',
                desc: 'Huawei USG DNS şeffaf proxy — iç ağdan gelen DNS sorgularını yakalayarak belirlenen DNS sunucusuna yönlendirme.'
            },
            sections: [
                {
                    title: 'DNS Proxy Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'zone_from', why: "DNS proxy yalnızca belirtilen zoneden gelen sorguları işler; yanlış zone seçilirse istemci sorguları hiç yakalanmaz ve doğrudan dışarı çıkar. Zone ile istemcilerin gerçekte bağlı olduğu arayüzün bölgesi eşleşmelidir.", label: 'Zone (From)', type: 'text', required: true, placeholder: 'trust', hint: 'DNS sorgularının geldiği güvenlik zone adı' },
                        { name: 'dns_server', why: "Cihazın kendi DNS çözümlemesi de bu sunucuya bağlıdır; erişilemezse lisans güncellemesi, imza veritabanı indirme ve FQDN tabanlı politikalar sessizce çalışmaz. Yedek sunucu tanımlamak bu zinciri korur.", label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'Varsayılan DNS sunucusu IP adresi' },
                        { name: 'redirect_dns', why: "Yönlendirilen iç DNS sunucusuna güvenlik duvarı üzerinden UDP/TCP 53 izni olmalıdır; izin yoksa istemciler ad çözemez ve arıza internet kesintisi gibi görünür. Split-DNS senaryolarında yanlış sunucu iç kaynakların dış adreslerle çözülmesine yol açar.", label: 'Redirect DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Sorguların yönlendirileceği iç DNS sunucusu' },
                        { name: 'domain', why: "Alan adı tabanlı yönlendirme yalnızca tam eşleşen sorguları kapsar; alt alan adları için ayrıca tanım gerekebilir. Yanlış alan adı yazmak kuralı sessizce etkisiz bırakır ve sorgular varsayılan sunucuya gider.", label: 'Domain', type: 'text', optional: true, placeholder: 'company.local', hint: 'Özel yönlendirme uygulanacak domain (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const zoneFrom = cgEsc(data.zone_from || ''), dnsServer = cgEsc(data.dns_server || '');
            const domain = cgEsc(data.domain || ''), redirectDns = cgEsc(data.redirect_dns || '');
            let c = '# ========================================\n# Huawei USG — DNS Transparent Proxy\n# ========================================\n\n';
            c += 'dns proxy enable\n';
            c += 'dns server ' + dnsServer + '\n';
            if (domain) c += 'dns domain ' + domain + ' server ' + redirectDns + '\n';
            c += 'firewall zone ' + zoneFrom + '\n#\n';
            c += '\n# Doğrulama:\n# display dns proxy\n# display dns server\n';
            return c;
        });
    }
};
