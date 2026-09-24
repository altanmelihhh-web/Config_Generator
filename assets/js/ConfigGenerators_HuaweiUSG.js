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
                        { name: 'trust_iface', why: "USG üzerinde bir arayüz <b>security zone</b> içine alınmadan üzerinden hiçbir trafik geçmez; IP verilmiş ve up durumda olsa bile paketler sessizce düşer. Bu, Huawei güvenlik duvarlarında en sık yapılan ve teşhisi en çok geciken hatadır.", label: 'Trust Zone Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Trust zone\'a atanacak interface adı' },
                        { name: 'trust_ip', why: "IP ve maske <b>boşlukla</b> ayrılmış yazılır (<code>10.1.1.1 255.255.255.0</code>), CIDR kabul edilmez. Yanlış subnet verildiğinde iç istemciler gateway olarak cihazı göremez ve arıza politika sorunu sanılır.", label: 'Trust IP / Mask', type: 'text', validate: 'ip_mask', required: true, placeholder: '192.168.1.1 255.255.255.0', hint: 'IP adresi ve subnet mask (boşlukla ayrılmış)' }
                    ]
                },
                {
                    title: 'Untrust Zone',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'untrust_iface', why: "Untrust zone varsayılan olarak en düşük önceliğe sahiptir; WAN arayüzünü yanlışlıkla trust içine almak, internetten gelen trafiğin yüksek öncelikli bölgeden geliyormuş gibi değerlendirilmesine ve güvenlik modelinin tamamen çökmesine yol açar.", label: 'Untrust Zone Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'Untrust zone\'a atanacak interface adı (WAN tarafı)' },
                        { name: 'untrust_ip', why: "WAN adresi ISPnin verdiğiyle aynı olmalıdır; ayrıca bu adres NAT ve IPSec yapılandırmalarında da referans alınır. Değiştiğinde NAT Server ve VPN peer tanımlarını güncellemezseniz dışarıdan erişim ve tüneller sessizce kopar.", label: 'Untrust IP / Mask', type: 'text', validate: 'ip_mask', required: true, placeholder: '203.0.113.1 255.255.255.252', hint: 'WAN IP adresi ve subnet mask' }
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
                        { name: 'src_ip', why: "Boş bırakmak <code>any</code> anlamına gelir ve kuralı düşündüğünüzden çok daha geniş açar. Adres nesnesi tanımlanmadan doğrudan subnet yazmak, ileride adres değiştiğinde onlarca kuralı tek tek düzeltmenizi gerektirir.", label: 'Kaynak IP', type: 'text', validate: 'ip_mask', optional: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'any için boş bırakın, aksi hâlde subnet girin' },
                        { name: 'dst_ip', why: "Hedefi daraltmamak, tek bir servise izin vermek isterken tüm DMZ veya iç ağı açmak demektir. NAT Server ile birlikte kullanırken politika <b>çevrilmiş (iç) adresi</b> görür, dış global IPyi değil; burada yapılan karışıklık en sık NAT arızası nedenidir.", label: 'Hedef IP', type: 'text', validate: 'ip_mask', optional: true, placeholder: '10.0.0.0 255.255.255.0', hint: 'any için boş bırakın' },
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
            const dstIp = cgEsc(data.dst_ip || ''), action = cgEsc(data.action || '');
            // USG sozdizimi: 'source-address 192.168.1.0 mask 255.255.255.0'
            const addr = a => a.split(/\s+/).length === 2 ? a.replace(/\s+/, ' mask ') : a;
            let c = '# ========================================\n# Huawei USG — Security Policy\n# ========================================\n\n';
            c += '[Huawei] system-view\n[Huawei] security-policy\n';
            if (!srcIp && !dstIp && action === 'permit')
                c += '# UYARI: kaynak ve hedef adres boş — bu kural ' + srcZone + ' -> ' + dstZone + ' arasında TÜM trafiğe izin verir.\n';
            c += '[Huawei-policy-security] rule name ' + ruleName + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] source-zone ' + srcZone + '\n';
            c += '[Huawei-policy-security-rule-' + ruleName + '] destination-zone ' + dstZone + '\n';
            if (srcIp) c += '[Huawei-policy-security-rule-' + ruleName + '] source-address ' + addr(srcIp) + '\n';
            if (dstIp) c += '[Huawei-policy-security-rule-' + ruleName + '] destination-address ' + addr(dstIp) + '\n';
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
                        { name: 'out_iface', why: "NAT çıkış arayüzü yanlışsa iç adresler çevrilmeden WAN tarafına çıkar ve ISP tarafında düşürülür; arıza internet kesintisi gibi görünür. Yedek WAN varsa her iki arayüz için ayrı NAT politikası gerekir.", label: 'Outbound Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'WAN tarafındaki çıkış interface\'i' },
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
                        { name: 'ip_pool_start', why: "Havuz, iç ağda kullanılan hiçbir subnetle çakışmamalıdır; çakışma durumunda VPN istemcileri kendi yerel ağlarına erişemez. Ayrıca iç yönlendiricilerde bu havuza dönüş rotası olmalı, yoksa trafik tek yönlü çalışır.", label: 'IP Pool Start', type: 'text', validate: 'ip', required: true, placeholder: '172.24.0.1', hint: 'VPN istemcilerine atanacak IP havuzunun başlangıcı' },
                        { name: 'ip_pool_end', why: "Havuz aralığı eşzamanlı bağlanabilecek kullanıcı sayısını belirler; dar tutulursa yoğun saatte kullanıcılar sessizce bağlanamaz ve hata mesajı erişim reddi gibi görünür.", label: 'IP Pool End', type: 'text', validate: 'ip', required: true, placeholder: '172.24.0.100', hint: 'VPN istemcilerine atanacak IP havuzunun sonu' }
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
                        { name: 'peer_ip', why: "Karşı cihazın heartbeat adresi doğru olmalı ve arada başka bir cihaz veya filtre bulunmamalıdır. Yanlış adres HA kurulmuş gibi görünmesine ama senkronizasyonun hiç çalışmamasına yol açar; yedek cihaz oturum tablosu boş kalır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.240.0.2', hint: 'Karşı cihazın HRP heartbeat IP adresi' },
                        { name: 'heartbeat_intf', why: "Heartbeat arayüzü doğrudan kablo ile bağlanmalı ve bu arayüz güvenlik politikalarından etkilenmemelidir. Switch üzerinden geçiriliyorsa o switchin arızası aynı anda her iki güvenlik duvarını da kararsız hale getirir.", label: 'Heartbeat Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'HA heartbeat trafiği için kullanılacak interface' }
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
            const peerIp = cgEsc(data.peer_ip || '');
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

// ── HuaweiUSG yardımcıları (yalnız bu dosyadaki yeni araçlar) ─────────────────
// '10.1.1.0/24' -> '10.1.1.0 24' (USG politika/adres satırlarındaki 'IP maske-uzunluğu' biçimi)
function cgUsgIpLen(s) {
    const m = String(s || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
    return m ? m[1] + ' ' + m[2] : '';
}

// ── HuaweiUSG: Adres ve Servis Nesneleri ─────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100172313/4c244ae/referencing-address-objects-and-address-groups-in-security-policies
//            https://support.huawei.com/enterprise/en/doc/EDOC1100172313/1fe156e8/referencing-services-and-service-groups-in-security-policies
HuaweiUSG.objects = {
    label: 'Adres / Servis Nesnesi',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cubes',
                title: 'Adres ve Servis Nesneleri (Huawei USG)',
                desc: 'Politikalarda tekrar kullanılacak adres kümesi (<code>ip address-set</code>) veya özel servis (<code>ip service-set</code>) tanımlar; isteğe bağlı olarak mevcut bir politika kuralına bağlar.<br><code>ip address-set WEB_SRV type object</code> · <code>address 0 10.1.1.10 mask 32</code>'
            },
            configTypes: [
                { id: 'addr', label: 'Adres Nesnesi', icon: 'fas fa-map-marker-alt', desc: 'ip address-set … type object', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'svc', label: 'Servis Nesnesi', icon: 'fas fa-plug', desc: 'ip service-set … type object', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Adres Nesnesi',
                    icon: 'fas fa-map-marker-alt',
                    showFor: ['addr'],
                    fields: [
                        { name: 'ob_aname', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'WEB_SERVERS', hint: 'Boşluksuz', why: "Politikalar nesneye adıyla bağlanır; adres değiştiğinde yalnız nesneyi güncellemek yeter. Aynı adla ikinci kez tanımlamak mevcut nesneye giriş ekler, üzerine yazmaz." },
                        { name: 'ob_net', label: 'Ağ (CIDR)', type: 'text', validate: 'cidr', placeholder: '10.1.1.0/24', hint: 'address N IP mask LEN olarak yazılır' },
                        { name: 'ob_host', label: 'Tek Host', type: 'text', validate: 'ip', placeholder: '10.1.1.10', hint: 'mask 32 olarak yazılır' },
                        { name: 'ob_range', label: 'Aralık', type: 'text', validate: 'ip_range', placeholder: '10.1.1.20-10.1.1.40', hint: 'address N range A B', why: "Aralık, maskeye sığmayan adres gruplarını tek girişte toplar; başlangıç bitişten büyük yazılırsa USG girişi reddeder." }
                    ]
                },
                {
                    title: 'Servis Nesnesi',
                    icon: 'fas fa-plug',
                    showFor: ['svc'],
                    fields: [
                        { name: 'ob_sname', label: 'Servis Adı', type: 'text', required: true, placeholder: 'TCP_8443', hint: 'Önceden tanımlı adlarla (http, ftp, dns…) çakışmamalı' },
                        { name: 'ob_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ] },
                        { name: 'ob_dport', label: 'Hedef Port', type: 'text', validate: 'port', required: true, placeholder: '8443', why: "Genellikle yalnız hedef port belirtilir (resmi doküman); kaynak portu kısıtlamak istemcilerin rastgele kaynak portları nedeniyle eşleşmeyi bozar." }
                    ]
                },
                {
                    title: 'Politikaya Bağla (opsiyonel)',
                    icon: 'fas fa-link',
                    info: 'Kural adı doluysa nesne o kurala eklenir. Mevcut bir kuralın adını girin; ad yoksa eylemi tanımsız yeni bir kural oluşur ve eylemi ayrıca verilmelidir.',
                    fields: [
                        { name: 'ob_rule', label: 'Güvenlik Kuralı Adı', type: 'text', placeholder: 'ALLOW-WEB', hint: 'security-policy altındaki rule name' },
                        { name: 'ob_dir', label: 'Adres Yönü', type: 'select', options: [
                            { value: 'destination', label: 'destination-address', selected: true },
                            { value: 'source', label: 'source-address' }
                        ], hint: 'Yalnız adres nesnesi için', why: "NAT Server arkasındaki sunucular için politika çevrilmiş iç adresi görür; nesneye global adresi koyup hedef olarak bağlamak kuralın hiç eşleşmemesine yol açar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'addr';
            const rule = cgEsc(data.ob_rule || '');
            let c = '# ========================================\n# Huawei USG — ' + (t === 'addr' ? 'Adres' : 'Servis') + ' Nesnesi\n# ========================================\n\n';
            c += 'system-view\n';
            let objName = '';
            if (t === 'addr') {
                objName = cgEsc(data.ob_aname || '');
                const net = cgUsgIpLen(cgEsc(data.ob_net || '')), host = cgEsc(data.ob_host || '');
                const rng = cgEsc(data.ob_range || '').split(/\s*[-\s]\s*/).filter(Boolean);
                let idx = 0, body = '';
                if (net) { const p = net.split(' '); body += ' address ' + (idx++) + ' ' + p[0] + ' mask ' + p[1] + '\n'; }
                if (host) body += ' address ' + (idx++) + ' ' + host + ' mask 32\n';
                if (rng.length === 2) body += ' address ' + (idx++) + ' range ' + rng[0] + ' ' + rng[1] + '\n';
                c += 'ip address-set ' + objName + ' type object\n';
                c += body || '# UYARI: nesneye hiç adres girilmedi — Ağ, Tek Host veya Aralık alanlarından en az birini doldurun\n';
                c += ' quit\n';
            } else {
                objName = cgEsc(data.ob_sname || '');
                c += 'ip service-set ' + objName + ' type object\n';
                c += ' service protocol ' + cgEsc(data.ob_proto || '') + ' destination-port ' + cgEsc(data.ob_dport || '') + '\n';
                c += ' quit\n';
            }
            if (rule) {
                c += '\nsecurity-policy\n rule name ' + rule + '\n';
                if (t === 'addr') c += '  ' + cgEsc(data.ob_dir || '') + '-address address-set ' + objName + '\n';
                else c += '  service ' + objName + '\n';
                c += '  quit\n quit\n';
            }
            c += '\n# Doğrulama:\n# display current-configuration | include ' + objName + '\n';
            if (rule) c += '# display security-policy rule name ' + rule + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Statik Rota ───────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100387632/ada3b42b/cli-example-for-deploying-devices-in-in-path-mode-and-connecting-to-switches-in-upstream-and-downstream-directions
//            (ip route-static 0.0.0.0 0.0.0.0 NH)
//            https://support.huawei.com/enterprise/en/doc/EDOC1100387632/e64a96d2/cli-example-for-configuring-stelnet-login-password-authentication
//            (ip route-static vpn-instance _management_vpn_ 0.0.0.0 0 NH)
HuaweiUSG.staticroute = {
    label: 'Statik Rota',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Statik Rota (Huawei USG)',
                desc: 'Genel tabloya veya bir VPN instance\'a (ör. yönetim VRF\'i) statik rota ekler.<br><code>ip route-static 0.0.0.0 0.0.0.0 203.0.113.254</code>'
            },
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'sr_dst', label: 'Hedef Ağ', type: 'text', validate: 'ip', required: true, placeholder: '0.0.0.0', hint: 'Default route için 0.0.0.0', why: "Hedef, maske ile birlikte ağ adresi olmalıdır; host biti set edilmiş bir adres (10.1.1.5/24) girildiğinde VRP maskeyi uygular ve beklenenden farklı bir önek oluşur." },
                        { name: 'sr_mask', label: 'Maske', type: 'text', validate: 'netmask', required: true, placeholder: '0.0.0.0', hint: 'Noktalı ondalık (255.255.255.0)' },
                        { name: 'sr_nh', label: 'Next-Hop', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.254', why: "Next-hop doğrudan bağlı bir ağda değilse rota inactive kalır. Hot standby kurulumlarında next-hop upstream cihazın VRRP sanal adresi olmalıdır; fiziksel adrese yazmak failover sonrası trafiği kaybeder." },
                        { name: 'sr_vpn', label: 'VPN Instance', type: 'text', placeholder: '_management_vpn_', hint: 'Boşsa genel tablo; MEth yönetim portu için _management_vpn_', why: "USG6000F'de MEth0/0/0 yönetim portu varsayılan olarak <code>_management_vpn_</code> içindedir; yönetim ağına rota genel tabloya yazılırsa cevaplar yanlış arayüzden çıkar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const dst = cgEsc(data.sr_dst || ''), mask = cgEsc(data.sr_mask || ''), nh = cgEsc(data.sr_nh || ''), vpn = cgEsc(data.sr_vpn || '');
            let c = '# ========================================\n# Huawei USG — Statik Rota\n# ========================================\n\n';
            c += 'system-view\n';
            c += 'ip route-static ' + (vpn ? 'vpn-instance ' + vpn + ' ' : '') + dst + ' ' + mask + ' ' + nh + '\n';
            c += '\n# Doğrulama:\n# display ip routing-table' + (vpn ? ' vpn-instance ' + vpn : '') + '\n';
            return c;
        });
    }
};

// ── HuaweiUSG: OSPF ──────────────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100387632/68c91a53/cli-example-for-deploying-devices-in-in-path-mode-and-connecting-to-upstream-and-downstream-routers-through-ebgp-and-ospf-respectively
//            (ospf N / area 0 / network A W; local<->zone 'service ospf' politikaları)
//            Politika gerekliliği: https://support.huawei.com/enterprise/en/doc/EDOC1100172313/59798fc7/how-to-configure-security-policies-to-allow-ospf
HuaweiUSG.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (Huawei USG)',
                desc: 'OSPF süreci, alan ve ağ ilanları; USG\'ye özgü olarak OSPF paketlerine izin veren <b>local zone</b> güvenlik politikaları.<br><code>ospf 10</code> · <code>area 0</code> · <code>network 10.3.0.0 0.0.0.255</code>'
            },
            sections: [
                {
                    title: 'OSPF Süreci',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'os_pid', label: 'Süreç No', type: 'text', required: true, min: 1, max: 65535, placeholder: '10' },
                        { name: 'os_area', label: 'Alan', type: 'text', required: true, placeholder: '0', hint: '0 veya 0.0.0.0 biçimi', why: "Alan numarası komşuyla birebir aynı olmalıdır; uyuşmazlıkta komşuluk hiç kurulmaz ve yalnız hata sayaçları artar." },
                        { name: 'os_net', label: 'İlan Edilecek Ağ', type: 'text', validate: 'ip', required: true, placeholder: '10.3.0.0', hint: 'network satırının adresi' },
                        { name: 'os_wild', label: 'Wildcard', type: 'text', validate: 'wildcard', required: true, placeholder: '0.0.0.255', hint: 'Ters maske (/24 = 0.0.0.255)', why: "VRP <code>network</code> komutu maske değil wildcard ister; 255.255.255.0 yazmak neredeyse tüm adres uzayını eşler ve istenmeyen arayüzlerde OSPF açar." },
                        { name: 'os_net2', label: 'İkinci Ağ', type: 'text', validate: 'ip', placeholder: '10.3.1.0' },
                        { name: 'os_wild2', label: 'İkinci Wildcard', type: 'text', validate: 'wildcard', placeholder: '0.0.0.255', hint: 'İkisi de doluysa eklenir' }
                    ]
                },
                {
                    title: 'Güvenlik Politikası (local zone)',
                    icon: 'fas fa-shield-alt',
                    warn: 'Broadcast/NBMA/P2MP ağlarda DD, LSR ve LSU paketleri unicast gider ve güvenlik politikasından geçmek zorundadır; politika yoksa komşuluk ExStart/Exchange\'de takılır. Temel protokol denetim anahtarının varsayılanı model ve sürüme göre değişir.',
                    fields: [
                        { name: 'os_pol', label: 'local ↔ komşu zone OSPF politikalarını ekle', type: 'checkbox', checked: true },
                        { name: 'os_zone', label: 'Komşu Zone', type: 'text', requiredIf: { field: 'os_pol', checked: true }, placeholder: 'trust', hint: 'OSPF komşusunun bulunduğu zone' },
                        { name: 'os_peer', label: 'Komşu Ağı', type: 'text', validate: 'cidr', requiredIf: { field: 'os_pol', checked: true }, placeholder: '10.3.0.0/24', hint: 'Politikada adres kısıtı', why: "Adres kısıtı olmayan bir local-zone OSPF izni, aynı zone'daki herhangi bir cihazın sahte OSPF komşusu olup rota enjekte etmesine kapı açar." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pid = cgEsc(data.os_pid || ''), area = cgEsc(data.os_area || ''), n1 = cgEsc(data.os_net || ''), w1 = cgEsc(data.os_wild || '');
            const n2 = cgEsc(data.os_net2 || ''), w2 = cgEsc(data.os_wild2 || '');
            const zone = cgEsc(data.os_zone || ''), peer = cgUsgIpLen(cgEsc(data.os_peer || ''));
            let c = '# ========================================\n# Huawei USG — OSPF\n# ========================================\n\n';
            c += 'system-view\nospf ' + pid + '\n area ' + area + '\n  network ' + n1 + ' ' + w1 + '\n';
            if (n2 && w2) c += '  network ' + n2 + ' ' + w2 + '\n';
            c += '  quit\n quit\n';
            if (data.os_pol === true && zone && peer) {
                c += '\nsecurity-policy\n';
                c += ' rule name policy_ospf_out\n  source-zone local\n  destination-zone ' + zone + '\n  destination-address ' + peer + '\n  service ospf\n  action permit\n  quit\n';
                c += ' rule name policy_ospf_in\n  source-zone ' + zone + '\n  destination-zone local\n  source-address ' + peer + '\n  service ospf\n  action permit\n  quit\n';
                c += ' quit\n';
            }
            c += '\n# Doğrulama:\n# display ospf peer brief\n# display ip routing-table protocol ospf\n';
            if (data.os_pol === true) c += '# display security-policy rule name policy_ospf_in\n';
            return c;
        });
    }
};

// ── HuaweiUSG: VRRP + HRP (Hot Standby arayüz tarafı) ────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100387632/ada3b42b/cli-example-for-deploying-devices-in-in-path-mode-and-connecting-to-switches-in-upstream-and-downstream-directions
//            (vrrp vrid N virtual-ip A [M] active|standby; hrp interface X remote Y; hrp authentication-key; hrp enable;
//             heartbeat zone politikası source-zone local Z / destination-zone local Z)
//            hrp track interface: https://support.huawei.com/enterprise/en/doc/EDOC1100387632/68c91a53/cli-example-for-deploying-devices-in-in-path-mode-and-connecting-to-upstream-and-downstream-routers-through-ebgp-and-ospf-respectively
HuaweiUSG.vrrp = {
    label: 'VRRP + HRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Hot Standby — VRRP + HRP (Huawei USG)',
                desc: 'Aktif/yedek çiftte iş arayüzüne VRRP sanal IP\'si, heartbeat arayüzüne HRP tanımlar. Her iki cihaz için ayrı ayrı üretin (aktif / yedek).<br><code>vrrp vrid 1 virtual-ip 10.3.0.3 active</code> · <code>hrp interface GE0/0/7 remote 10.128.0.2</code>'
            },
            configTypes: [
                { id: 'active', label: 'Aktif Cihaz', icon: 'fas fa-crown', desc: 'VRRP active', badge: { text: 'Birincil', cls: 'recommended' } },
                { id: 'standby', label: 'Yedek Cihaz', icon: 'fas fa-clone', desc: 'VRRP standby', badge: { text: 'Yedek', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'VRRP (iş arayüzü)',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'hv_iface', label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/3', hint: 'Kendi IP\'si tanımlı iş arayüzü', why: "Sanal IP arayüzün kendi subnet'inde olmalıdır. Arayüze gerçek IP verilmeden VRRP çalışmaz; iki cihazın gerçek IP'leri farklı, sanal IP'leri aynıdır." },
                        { name: 'hv_vrid', label: 'VRID', type: 'text', required: true, min: 1, max: 255, placeholder: '2', why: "Aynı L2 segmentinde başka bir VRRP grubu (ör. upstream router) aynı VRID'yi kullanıyorsa sanal MAC çakışır ve trafik iki grup arasında gidip gelir." },
                        { name: 'hv_vip', label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '10.3.0.3', hint: 'İstemcilerin gateway\'i' },
                        { name: 'hv_mask', label: 'Sanal IP Maskesi', type: 'text', validate: 'netmask', placeholder: '255.255.255.0', hint: 'Sanal IP arayüz subnet\'i dışındaysa gerekir (ör. WAN)', why: "Resmi örnekte WAN tarafındaki sanal IP maskeyle, LAN tarafındaki maskesiz yazılmıştır; arayüzün gerçek IP subnet'inde olmayan sanal IP için maske şarttır." }
                    ]
                },
                {
                    title: 'HRP (heartbeat)',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'hv_hb', label: 'Heartbeat Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/7', why: "Heartbeat koparsa iki cihaz da kendini aktif sanar (split-brain). Doğrudan kablo tercih edin ve bu arayüzü iş trafiğinden ayrı tutun." },
                        { name: 'hv_peer', label: 'Karşı Cihaz Heartbeat IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.0.2', hint: 'Yedek cihazda aktifin adresi girilir' },
                        { name: 'hv_key', label: 'HRP Doğrulama Anahtarı', type: 'text', placeholder: 'HrpAnahtar-2026', hint: 'İki cihazda aynı', why: "Anahtar iki cihazda farklıysa HRP paketleri reddedilir ve yapılandırma/oturum senkronizasyonu çalışmaz." },
                        { name: 'hv_track', label: 'İzlenecek Arayüz', type: 'text', validate: 'iface', placeholder: 'GigabitEthernet0/0/1', hint: 'hrp track interface — düşerse cihaz rolü devreder', why: "Takip edilmeyen bir uplink koptuğunda VGMP bunu bilmez ve trafik ölü bağlantıya sahip aktif cihazda kalır." },
                        { name: 'hv_zone', label: 'Heartbeat Zone', type: 'text', placeholder: 'dmz', hint: 'Heartbeat arayüzünün zone\'u — local↔zone izin politikası eklenir', why: "Resmi örnekte heartbeat arayüzü dmz zone'undadır ve local↔dmz politikası eklenmiştir; politika yoksa HRP paketleri güvenlik politikasına takılabilir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const role = data._cgtype || 'active';
            const iface = cgEsc(data.hv_iface || ''), vrid = cgEsc(data.hv_vrid || ''), vip = cgEsc(data.hv_vip || ''), mask = cgEsc(data.hv_mask || '');
            const hb = cgEsc(data.hv_hb || ''), peer = cgEsc(data.hv_peer || ''), key = cgEsc(data.hv_key || '');
            const track = cgEsc(data.hv_track || ''), zone = cgEsc(data.hv_zone || '');
            let c = '# ========================================\n# Huawei USG — VRRP + HRP (' + (role === 'active' ? 'Aktif' : 'Yedek') + ')\n# ========================================\n\n';
            c += 'system-view\ninterface ' + iface + '\n vrrp vrid ' + vrid + ' virtual-ip ' + vip + (mask ? ' ' + mask : '') + ' ' + role + '\n quit\n\n';
            if (zone) {
                c += '# UYARI: bu kural local ile ' + zone + ' arasında TÜM trafiğe izin verir — heartbeat için yalnız heartbeat arayüzünü içeren ayrı bir zone kullanın\n';
                c += 'security-policy\n rule name ha_local_' + zone + '\n  source-zone local ' + zone + '\n  destination-zone local ' + zone + '\n  action permit\n  quit\n quit\n\n';
            }
            if (track) c += 'hrp track interface ' + track + '\n';
            c += 'hrp interface ' + hb + ' remote ' + peer + '\n';
            if (key) c += 'hrp authentication-key ' + key + '\n';
            c += 'hrp enable\n';
            c += '\n# Doğrulama:\n# display vrrp\n# display hrp state verbose\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Syslog (info-center loghost) ──────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000179232/facd9831/fw-and-log-server-interconnection-issues
//            (info-center loghost source IF; info-center loghost IP [vpn-instance V];
//             info-center source POLICY channel loghost log level informational)
//            Politika gerekliliği: https://support.huawei.com/enterprise/en/doc/EDOC1100172313/87636019/how-to-configure-security-policies-to-allow-logs
//            ip service-set sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100172313/1fe156e8/referencing-services-and-service-groups-in-security-policies
HuaweiUSG.syslog = {
    label: 'Syslog (info-center)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Syslog — info-center loghost (Huawei USG)',
                desc: 'Sistem ve politika loglarını syslog sunucusuna gönderir. USG\'de cihazın kendi ürettiği sistem logları <b>local → sunucu zone</b> güvenlik politikası ister.<br><code>info-center loghost source GigabitEthernet1/0/7</code> · <code>info-center loghost 10.0.0.200</code>'
            },
            sections: [
                {
                    title: 'Log Sunucusu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hs_host', label: 'Syslog Sunucusu', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200' },
                        { name: 'hs_src', label: 'Kaynak Arayüz', type: 'text', validate: 'iface', placeholder: 'GigabitEthernet1/0/7', hint: 'info-center loghost source', why: "Kaynak arayüz bir VPN instance'a bağlıysa log sunucusu da aynı instance ile tanımlanmalıdır; aksi hâlde loglar hiç çıkmaz (resmi sorun giderme örneği)." },
                        { name: 'hs_vpn', label: 'VPN Instance', type: 'text', placeholder: 'default', hint: 'Kaynak arayüz bir VPN instance\'a bağlıysa' },
                        { name: 'hs_policy', label: 'Politika eşleşme loglarını da gönder (POLICY → loghost, informational)', type: 'checkbox', checked: true, why: "Politika logları ayrı bir modül (POLICY) üzerinden gelir; bu satır olmadan kuralda log açık olsa bile sunucuya yalnız sistem logları ulaşır." }
                    ]
                },
                {
                    title: 'Güvenlik Politikası',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'hs_zone', label: 'Sunucunun Zone\'u', type: 'text', placeholder: 'trust', hint: 'Doluysa local → zone UDP 514 izni eklenir', why: "Resmi dokümana göre sistem logları (UDP 514) güvenlik politikası gerektirir; politika yoksa cihaz logları üretir ama sunucuya hiçbiri ulaşmaz." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const host = cgEsc(data.hs_host || ''), src = cgEsc(data.hs_src || ''), vpn = cgEsc(data.hs_vpn || ''), zone = cgEsc(data.hs_zone || '');
            let c = '# ========================================\n# Huawei USG — Syslog (info-center)\n# ========================================\n\n';
            c += 'system-view\n';
            if (src) c += 'info-center loghost source ' + src + '\n';
            c += 'info-center loghost ' + host + (vpn ? ' vpn-instance ' + vpn : '') + '\n';
            if (data.hs_policy === true) c += 'info-center source POLICY channel loghost log level informational\n';
            if (zone) {
                c += '\nip service-set SYSLOG_UDP514 type object\n service protocol udp destination-port 514\n quit\n';
                c += 'security-policy\n rule name Local_Out_Syslog\n  source-zone local\n  destination-zone ' + zone + '\n  destination-address ' + host + ' 32\n  service SYSLOG_UDP514\n  action permit\n  quit\n quit\n';
            }
            c += '\n# Doğrulama:\n# display current-configuration | include info-center\n# display info-center statistics\n';
            if (zone) c += '# display security-policy rule name Local_Out_Syslog\n';
            return c;
        });
    }
};

// ── HuaweiUSG: NTP ────────────────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000179232/607f774c/case-study-the-clock-is-not-synchronized
//            (ntp-service unicast-server; display ntp-service status / sessions)
//            ip service-set / security-policy: https://support.huawei.com/enterprise/en/doc/EDOC1100172313/1fe156e8/referencing-services-and-service-groups-in-security-policies
HuaweiUSG.ntp = {
    label: 'NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP İstemcisi (Huawei USG)',
                desc: 'USG\'yi unicast NTP istemcisi yapar; isteğe bağlı olarak local → sunucu zone NTP politikası ekler.<br><code>ntp-service unicast-server 10.0.0.123</code>'
            },
            sections: [
                {
                    title: 'NTP',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hn_srv1', label: 'NTP Sunucusu 1', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.123', why: "Saat senkron değilse log zaman damgaları, sertifika ve IPsec doğrulaması ile zaman tabanlı politikalar bozulur. Sunucu tarafında kaynak adres kısıtlaması varsa istemci adresinin eşleştiğinden emin olun (resmi vaka çalışması)." },
                        { name: 'hn_srv2', label: 'NTP Sunucusu 2', type: 'text', validate: 'ip', placeholder: '10.0.1.123' },
                        { name: 'hn_zone', label: 'Sunucunun Zone\'u', type: 'text', placeholder: 'trust', hint: 'Doluysa local → zone UDP 123 izni eklenir', why: "Cihazın kendi başlattığı NTP trafiği local zone'dan çıkar; politika gerektiren durumlarda izin yoksa istemci sonsuza dek unsynchronized kalır." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const s1 = cgEsc(data.hn_srv1 || ''), s2 = cgEsc(data.hn_srv2 || ''), zone = cgEsc(data.hn_zone || '');
            let c = '# ========================================\n# Huawei USG — NTP\n# ========================================\n\n';
            c += 'system-view\nntp-service unicast-server ' + s1 + '\n';
            if (s2) c += 'ntp-service unicast-server ' + s2 + '\n';
            if (zone) {
                c += '\nip service-set NTP_UDP123 type object\n service protocol udp destination-port 123\n quit\n';
                c += 'security-policy\n rule name Local_Out_NTP\n  source-zone local\n  destination-zone ' + zone + '\n  destination-address ' + s1 + ' 32\n';
                if (s2) c += '  destination-address ' + s2 + ' 32\n';
                c += '  service NTP_UDP123\n  action permit\n  quit\n quit\n';
            }
            c += '\n# Doğrulama:\n# display ntp-service status\n# display ntp-service sessions\n';
            return c;
        });
    }
};

// ── HuaweiUSG: Yönetici + STelnet (SSH) ──────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100387632/e64a96d2/cli-example-for-configuring-stelnet-login-password-authentication
//            (user-interface vty 0 4 / authentication-mode aaa / user privilege level / protocol inbound ssh;
//             aaa / local-user X password / local-user X service-type ssh / local-user X privilege level;
//             ssh user X authentication-type password / service-type stelnet; ssh server-source all-interface;
//             stelnet server enable; ssh server cipher/hmac/key-exchange; service-manage ssh permit)
HuaweiUSG.admin = {
    label: 'Yönetici / SSH',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Yönetici Hesabı ve STelnet (SSH) Girişi (Huawei USG)',
                desc: 'VTY hatlarını AAA + yalnız SSH\'e kısıtlar, yerel yönetici oluşturur, STelnet\'i açar ve isteğe bağlı güçlü SSH algoritmalarını ayarlar. (HiSecEngine USG6000F resmi örneği; eski USG6000 sürümleri <code>manager-user</code> kullanır.)<br><code>local-user netadmin service-type ssh</code> · <code>stelnet server enable</code>'
            },
            sections: [
                {
                    title: 'Yerel Yönetici',
                    icon: 'fas fa-user',
                    warn: '<code>local-user … password</code> parolayı <b>etkileşimli</b> sorar (8-128 karakter); script ile yapıştırırken bu satırda durup parolayı elle girin.',
                    fields: [
                        { name: 'ad_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin' },
                        { name: 'ad_level', label: 'Yetki Seviyesi', type: 'select', options: [
                            { value: '3', label: '3 (resmi örnekteki yönetici seviyesi)', selected: true },
                            { value: '15', label: '15' }
                        ], why: "VTY hattındaki <code>user privilege level</code> ile kullanıcının seviyesi birlikte değerlendirilir; kullanıcıya düşük seviye verip hatta yüksek seviye bırakmak beklenmeyen yetki farklarına yol açar." }
                    ]
                },
                {
                    title: 'Erişim',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'ad_mgmt_if', label: 'Yönetim Arayüzü', type: 'text', validate: 'iface', placeholder: 'GigabitEthernet0/0/1', hint: 'Doluysa arayüzde service-manage ssh permit', why: "USG arayüzlerinde erişim denetimi açıktır; <code>service-manage ssh permit</code> yoksa SSH bu arayüze ulaşsa bile reddedilir. MEth0/0/0 yönetim portunda varsayılan olarak açıktır." },
                        { name: 'ad_strong', label: 'Güçlü SSH algoritmaları (cipher / hmac / key-exchange)', type: 'checkbox', checked: true, why: "Eski CBC şifreleri ve SHA1 HMAC kapatılır; çok eski SSH istemcileri bağlanamayabilir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const user = cgEsc(data.ad_user || ''), lvl = cgEsc(data.ad_level || ''), mif = cgEsc(data.ad_mgmt_if || '');
            let c = '# ========================================\n# Huawei USG — Yönetici / STelnet\n# ========================================\n\n';
            c += 'system-view\n';
            if (mif) c += 'interface ' + mif + '\n service-manage ssh permit\n quit\n\n';
            if (data.ad_strong === true) {
                c += 'ssh server cipher aes128_ctr aes256_ctr aes192_ctr aes128_gcm aes256_gcm\n';
                c += 'ssh server hmac sha2_256 sha2_512\n';
                c += 'ssh server key-exchange dh_group_exchange_sha256 dh_group16_sha512\n\n';
            }
            c += 'user-interface vty 0 4\n authentication-mode aaa\n user privilege level ' + lvl + '\n protocol inbound ssh\n quit\n\n';
            c += 'aaa\n local-user ' + user + ' password\n';
            c += '# (parola burada etkileşimli sorulur — iki kez girin)\n';
            c += ' local-user ' + user + ' service-type ssh\n local-user ' + user + ' privilege level ' + lvl + '\n quit\n\n';
            c += 'ssh user ' + user + '\nssh user ' + user + ' authentication-type password\nssh user ' + user + ' service-type stelnet\n';
            c += 'ssh server-source all-interface\nstelnet server enable\n';
            c += '\n# Doğrulama:\n# display current-configuration | include ssh\n';
            return c;
        });
    }
};
