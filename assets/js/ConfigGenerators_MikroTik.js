'use strict';

const MikroTik = {};

// ── MikroTik: General ─────────────────────────────────────────────────────────
MikroTik.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Genel Konfigürasyon (MikroTik)',
                desc: 'RouterOS temel ayarları — hostname, VLAN arayüzü ve statik rota.<br><code>/system identity set name=&lt;hostname&gt;</code><br><code>/interface vlan add name=vlan&lt;id&gt; vlan-id=&lt;id&gt; interface=&lt;iface&gt;</code>'
            },
            sections: [
                {
                    title: 'Sistem Kimliği',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hostname', why: "System identity Winbox neighbor listesinde, MAC-telnet ekranında ve log'larda görünür; varsayılan <code>MikroTik</code> bırakılırsa aynı ağdaki onlarca cihaz birbirinden ayırt edilemez ve yanlış cihaza config basılır.", label: 'Hostname', type: 'text', required: true, placeholder: 'MikroTik-GW1', hint: 'Cihaz adı (/system identity)' }
                    ]
                },
                {
                    title: 'VLAN ve Arayüz',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'vlan', why: "VLAN ID bridge VLAN tablosunda ve karşı uçtaki tagged portta birebir aynı olmalıdır; RouterOS'ta VLAN interface tanımlansa bile bridge tarafında izin verilmemişse trafik <b>sessizce</b> düşer.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: '1–4094 arası VLAN kimliği' },
                        { name: 'wan_ip', why: "RouterOS adresi CIDR ile ister (<code>/24</code>); prefix yazmayı unutursanız adres /32 olarak eklenir, cihaz hiçbir komşuyu göremez ve bağlantı anında kopar.", label: 'IP Adresi / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.1/24', hint: 'CIDR formatında (örn: 192.168.1.1/24)' },
                        { name: 'gw', why: "Varsayılan rota bu gateway'e kurulur. Gateway doğrudan bağlı bir ağda değilse RouterOS rotayı <b>unreachable</b> işaretler ve rota mavi (inactive) kalır, hiçbir hata mesajı görmezsiniz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan çıkış gateway adresi' },
                        { name: 'iface', why: "Arayüz adı RouterOS'ta birebir yazılmalıdır (<code>ether2</code>, <code>bridge1</code>); isim yanlışsa komut hata verip durur ve script'in geri kalanı uygulanmaz, config yarım kalır.", label: 'LAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether2', hint: 'VLAN eklenecek arayüz' },
                        { name: 'wan_iface', why: "WAN arayüzü masquerade ve firewall kurallarının dayanağıdır; yanlış arayüz seçilirse ya NAT hiç çalışmaz ya da <b>iç ağınız internete açık</b> hâle gelir.", label: 'WAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: 'Internet bağlantısı taşıyan port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || '');
            const wanIp = cgEsc(data.wan_ip || ''), gw = cgEsc(data.gw || '');
            const iface = cgEsc(data.iface || ''), wanIface = cgEsc(data.wan_iface || '');
            let c = '# ========================================\n# MikroTik RouterOS — General Configuration\n# ========================================\n\n';
            c += '# Hostname\n/system identity set name=' + hn + '\n\n';
            c += '# VLAN Interface\n/interface vlan add name=vlan' + vlan + ' vlan-id=' + vlan + ' interface=' + iface + '\n';
            c += '/ip address add address=' + wanIp + ' interface=vlan' + vlan + '\n\n';
            c += '# Default Gateway\n/ip route add gateway=' + gw + '\n\n';
            c += '# WAN Interface\n/interface ethernet set ' + wanIface + ' disabled=no\n';
            c += '/ip address add address=' + wanIp + ' interface=' + wanIface + '\n\n';
            c += '# VLAN Port Mapping\n/interface ethernet switch vlan add vlan-id=' + vlan + ' ports=' + iface + '\n';
            c += '/interface ethernet switch port set ' + iface + ' vlan-mode=secure\n\n';
            c += '# Doğrulama:\n# /interface vlan print\n# /ip address print\n# /ip route print\n# /system identity print\n';
            return c;
        });
    }
};

// ── MikroTik: Bridge + VLAN ───────────────────────────────────────────────────
MikroTik.bridgevlan = {
    label: 'Bridge + VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Bridge + VLAN (MikroTik)',
                desc: 'RouterOS bridge VLAN filtering — 802.1Q tagged/untagged port konfigürasyonu.<br><code>/interface bridge add name=&lt;br&gt; vlan-filtering=yes</code><br><code>/interface bridge vlan add bridge=&lt;br&gt; vlan-ids=&lt;id&gt; tagged=&lt;ports&gt;</code>'
            },
            sections: [
                {
                    title: 'Bridge + VLAN Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'bridge_name', why: "Tüm portlar aynı bridge altında toplanmalıdır; ayrı bridge'ler VLAN'ları birleştirmez. Ayrıca <code>vlan-filtering=yes</code> yapmadan önce yönetim erişiminizi güvenceye alın, aksi hâlde cihaza <b>kilitlenirsiniz</b>.", label: 'Bridge Adı', type: 'text', required: true, placeholder: 'bridge1', hint: 'Oluşturulacak bridge arayüzünün adı' },
                        { name: 'vlan_id', why: "Bridge VLAN tablosuna eklenmeyen bir VLAN, port üzerinde tanımlı olsa bile taşınmaz. VLAN filtering açıldığında listede olmayan her VLAN <b>anında düşer</b> - en sık yaşanan kesinti sebebidir.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1–4094 arası VLAN kimliği' },
                        { name: 'tagged_ports', why: "Tagged listesine uplink'i ve gerekirse bridge'in kendisini eklemeyi unutmayın; bridge tagged değilse yönetim VLAN'ı üzerinden cihaza erişemezsiniz ve konsol dışında dönüş yolu kalmaz.", label: 'Tagged Port(lar)', type: 'text', required: true, placeholder: 'ether1,ether2', hint: 'Virgülle ayrılmış tagged portlar (trunk portlar)' },
                        { name: 'untagged_port', why: "Untagged port için <code>pvid</code> da aynı VLAN'a ayarlanmalıdır; pvid eşleşmezse gelen etiketsiz trafik yanlış VLAN'a düşer ve iki ayrı segment istemeden birleşir.", label: 'Untagged Port', type: 'text', optional: true, placeholder: 'ether3', hint: 'Access port (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const bridgeName = cgEsc(data.bridge_name || ''), vlanId = cgEsc(data.vlan_id || '');
            const taggedPorts = (data.tagged_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const untaggedPort = cgEsc(data.untagged_port || '');
            let c = '# ========================================\n# MikroTik RouterOS — Bridge + VLAN\n# ========================================\n\n';
            c += '/interface bridge\nadd name=' + bridgeName + ' vlan-filtering=yes\n\n';
            c += '/interface bridge port\n';
            taggedPorts.forEach(port => {
                c += 'add bridge=' + bridgeName + ' interface=' + port + ' frame-types=admit-only-vlan-tagged\n';
            });
            c += '\n/interface bridge vlan\nadd bridge=' + bridgeName + ' vlan-ids=' + vlanId + ' tagged=' + taggedPorts.join(',') + '\n';
            if (untaggedPort) c += 'add bridge=' + bridgeName + ' vlan-ids=' + vlanId + ' untagged=' + untaggedPort + '\n';
            c += '\n# Doğrulama:\n# /interface bridge vlan print\n# /interface bridge port print\n';
            return c;
        });
    }
};

// ── MikroTik: IP Address + Static Route ───────────────────────────────────────
MikroTik.ipaddress = {
    label: 'IP Address + Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-marker-alt',
                title: 'IP Adresi + Statik Rota (MikroTik)',
                desc: 'Arayüze IP atama ve statik rota tanımlama.<br><code>/ip address add address=&lt;IP/prefix&gt; interface=&lt;arayüz&gt;</code><br><code>/ip route add dst-address=&lt;hedef&gt; gateway=&lt;gw&gt;</code>'
            },
            sections: [
                {
                    title: 'IP Adresi',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'interface', why: "Adres yanlış arayüze eklenirse trafik beklenen bacaktan çıkmaz ve asimetrik yönlendirme oluşur; connection tracking bu durumda oturumları <b>invalid</b> sayıp düşürür.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: 'IP atanacak fiziksel veya sanal arayüz' },
                        { name: 'ip_address', why: "RouterOS adresi mutlaka CIDR ile ister; <code>/24</code> yazmadan girilen adres /32 kabul edilir, komşuluk kurulmaz. Uzaktan bağlıysanız yanlış adres girmek oturumunuzu anında koparır.", label: 'IP Adresi (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.1/24', hint: 'Örn: 192.168.1.1/24' },
                        { name: 'comment', why: "RouterOS'ta yorum, kuralı ve adresi script ile bulmanın tek güvenilir yoludur (<code>find comment=</code>); boş bırakılan kayıtlar zamanla kimsenin silmeye cesaret edemediği ölü config'e dönüşür.", label: 'Yorum', type: 'text', optional: true, placeholder: 'WAN uplink', hint: 'Tanımlayıcı not (opsiyonel)' }
                    ]
                },
                {
                    title: 'Statik Rota',
                    icon: 'fas fa-route',
                    info: 'Her iki alan da doldurulursa statik rota eklenir.',
                    fields: [
                        { name: 'dst_route', why: "Hedef ağ çok geniş yazılırsa (<code>0.0.0.0/0</code>) mevcut varsayılan rotayla yarışır; RouterOS en uzun eşleşmeyi seçtiği için trafik sessizce yanlış bacaktan çıkabilir.", label: 'Hedef Route', type: 'text', optional: true, placeholder: '0.0.0.0/0', hint: 'Default route için 0.0.0.0/0' },
                        { name: 'gateway', why: "Gateway doğrudan erişilebilir bir ağda olmalıdır; değilse rota inactive kalır. Yedeklilik için <code>check-gateway=ping</code> eklemezseniz gateway ölse bile rota aktif görünmeye devam eder.", label: 'Gateway', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.254', hint: 'Çıkış gateway IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intf = cgEsc(data.interface || ''), ipAddress = cgEsc(data.ip_address || '');
            const comment = cgEsc(data.comment || '');
            const dstRoute = cgEsc(data.dst_route || ''), gateway = cgEsc(data.gateway || '');
            let c = '# ========================================\n# MikroTik RouterOS — IP Address + Static Route\n# ========================================\n\n';
            c += '/ip address\nadd address=' + ipAddress + ' interface=' + intf;
            if (comment) c += ' comment="' + comment + '"';
            c += '\n';
            if (dstRoute && gateway) {
                c += '\n/ip route\nadd dst-address=' + dstRoute + ' gateway=' + gateway + '\n';
            }
            c += '\n# Doğrulama:\n# /ip address print\n# /ip route print\n';
            return c;
        });
    }
};

// ── MikroTik: Firewall Filter ─────────────────────────────────────────────────
MikroTik.firewall = {
    label: 'Firewall Filter',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Firewall Filter (MikroTik)',
                desc: 'RouterOS /ip firewall filter — chain/aksiyon bazlı paket filtreleme.<br><code>/ip firewall filter add chain=input src-address=&lt;IP&gt; action=accept</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Kural Ayarları',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'chain', why: "<b>Chain seçimi yanlışsa kural hiç eşleşmez.</b> <code>input</code> yalnızca router'ın kendisine gelen trafiktir, <code>forward</code> router üzerinden geçen kullanıcı trafiğidir; LAN-WAN trafiğini input'ta engellemeye çalışmak hiçbir işe yaramaz.", label: 'Chain', type: 'select', options: [
                            { value: 'input', label: 'input', selected: true },
                            { value: 'forward', label: 'forward' },
                            { value: 'output', label: 'output' }
                        ], hint: 'input: cihaza gelen, forward: yönlendirilen, output: cihazdan çıkan' },
                        { name: 'src_address', why: "Kaynak boş bırakılırsa kural tüm kaynaklar için çalışır. Yönetim erişimi kurallarında kaynağı daraltmamak, Winbox ve API portlarını internete açık bırakmakla aynı anlama gelir.", label: 'Kaynak Adres', type: 'text', optional: true, placeholder: '10.0.0.0/8', hint: 'Boş bırakılırsa tüm kaynaklar eşleşir' },
                        { name: 'dst_address', why: "Hedef daraltması kuralın kapsamını belirler; boş bırakmak kuralı tüm hedeflere uygular ve istemeden kendi yönetim trafiğinizi de engelleyebilirsiniz.", label: 'Hedef Adres', type: 'text', optional: true, placeholder: '192.168.1.1', hint: 'Boş bırakılırsa tüm hedefler eşleşir' },
                        { name: 'protocol', why: "Port belirtebilmek için protokolün <code>tcp</code> veya <code>udp</code> olması gerekir; protokol seçilmeden yazılan port alanı RouterOS tarafından kabul edilmez ve kural eklenmez.", label: 'Protokol', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'dst_port', why: "Tek port yerine aralık veya liste kullanabilirsiniz, ancak port daraltması olmayan bir drop kuralı tüm servisleri kapatır. Kuralı eklemeden önce <b>Safe Mode</b> açın.", label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '22', hint: 'Protokol seçiliyken geçerli (örn: 80, 443, 22)' },
                        { name: 'action', why: "Kurallar <b>yukarıdan aşağı sırayla</b> değerlendirilir ve ilk eşleşen uygulanır; <code>drop</code> kuralını <code>accept</code> kuralının üstüne koymak çalışan trafiği keser. <code>drop</code> sessizce düşürür, <code>reject</code> ise geri bildirim verir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'accept', label: 'accept', selected: true },
                            { value: 'drop', label: 'drop' },
                            { value: 'reject', label: 'reject' }
                        ], hint: 'accept: izin ver, drop: sessizce düşür, reject: reddet' },
                        { name: 'comment', why: "Yorumsuz firewall kuralları birkaç ay sonra dokunulamaz hâle gelir; kimse hangi kuralın hangi servisi ayakta tuttuğunu bilemediği için gereksiz kurallar yıllarca temizlenmeden kalır.", label: 'Yorum', type: 'text', optional: true, placeholder: 'Allow SSH from mgmt', hint: 'Kural açıklaması' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const chain = cgEsc(data.chain || 'input');
            const srcAddress = cgEsc(data.src_address || ''), dstAddress = cgEsc(data.dst_address || '');
            const protocol = cgEsc(data.protocol || 'any'), dstPort = cgEsc(data.dst_port || '');
            const action = cgEsc(data.action || 'accept'), comment = cgEsc(data.comment || '');
            let c = '# ========================================\n# MikroTik RouterOS — Firewall Filter\n# ========================================\n\n';
            c += '/ip firewall filter\nadd chain=' + chain + ' \\\n';
            if (srcAddress && srcAddress !== 'any') c += '    src-address=' + srcAddress + ' \\\n';
            if (dstAddress && dstAddress !== 'any') c += '    dst-address=' + dstAddress + ' \\\n';
            if (protocol !== 'any') c += '    protocol=' + protocol + ' \\\n';
            if (dstPort) c += '    dst-port=' + dstPort + ' \\\n';
            c += '    action=' + action;
            if (comment) c += ' \\\n    comment="' + comment + '"';
            c += '\n\n# Doğrulama:\n# /ip firewall filter print\n';
            return c;
        });
    }
};

// ── MikroTik: NAT ─────────────────────────────────────────────────────────────
MikroTik.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT (MikroTik)',
                desc: 'RouterOS /ip firewall nat — masquerade, dst-nat (port yönlendirme) ve src-nat desteği.<br><code>/ip firewall nat add chain=srcnat action=masquerade</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            configTypes: [
                { id: 'masquerade', label: 'Masquerade', icon: 'fas fa-mask', desc: 'LAN→WAN çıkışı için dinamik NAT',
                  badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'dst-nat', label: 'DST-NAT', icon: 'fas fa-arrow-right', desc: 'Gelen bağlantıyı iç sunucuya yönlendir' },
                { id: 'src-nat', label: 'SRC-NAT', icon: 'fas fa-arrow-left', desc: 'Kaynak adresi statik IP ile değiştir' }
            ],
            sections: [
                {
                    title: 'Masquerade',
                    icon: 'fas fa-mask',
                    showFor: ['masquerade'],
                    fields: [
                        { name: 'out_interface', why: "Masquerade kuralı <b>mutlaka out-interface ile sınırlanmalıdır</b>; sınırlanmazsa VPN ve iç ağlar arası trafik de NAT'lanır, kaynak adresler bozulur ve site-to-site tüneller çalışmaz.", label: 'Çıkış Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: 'Internet çıkışı yapan WAN arayüzü' },
                        { name: 'masq_src_address', why: "<code>masquerade</code> çıkış arayüzünün adresini dinamik kullanır ve DHCP/PPPoE WAN için uygundur; sabit public IP varsa <code>src-nat</code> daha öngörülebilirdir, çünkü masquerade her link değişiminde bağlantıları sıfırlar.", label: 'Kaynak Ağ', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'Belirli bir ağı NAT etmek için (boş = tümü)' }
                    ]
                },
                {
                    title: 'DST-NAT (Port Yönlendirme)',
                    icon: 'fas fa-arrow-right',
                    showFor: ['dst-nat'],
                    fields: [
                        { name: 'dst_address', why: "dst-nat kuralında hedef public IP belirtilmezse kural tüm gelen trafiğe uygulanır; bu, iç sunucunuzu istemeden her arayüzden erişilebilir yapar.", label: 'Hedef Adres (Public IP)', type: 'text', required: true, placeholder: '203.0.113.1', hint: 'Gelen paketin hedef adresi (WAN IP)' },
                        { name: 'dst_protocol', why: "Port yönlendirmesi yalnızca tcp veya udp ile anlamlıdır; protokol seçilmeden port yazılamaz ve kural hiç eklenmez. Yanlış protokolde servis dışarıdan sessizce erişilemez kalır.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'tcp', selected: true },
                            { value: 'udp', label: 'udp' }
                        ]},
                        { name: 'dst_port', why: "Dışarıdan gelen port ile iç porttaki servis farklı olabilir; ikisini karıştırmak <b>bağlantı kuruluyor ama cevap gelmiyor</b> tablosunu yaratır. Ayrıca bu portu firewall'da da izinli hâle getirmeniz gerekir.", label: 'Hedef Port', type: 'text', validate: 'port', required: true, placeholder: '80', hint: 'Dışarıdan erişilen port numarası' },
                        { name: 'to_addresses', why: "Yönlendirilecek iç adres yanlışsa RouterOS paketi var olmayan bir hosta gönderir ve istemci zaman aşımına uğrar; hiçbir hata log'lanmaz, yalnızca <code>/ip firewall connection</code> tablosunda takılı oturumlar görünür.", label: 'Yönlendirilecek Adres', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.100', hint: 'İç sunucunun IP adresi' },
                        { name: 'to_ports', why: "İç servis farklı bir portta dinliyorsa burada belirtin; boş bırakılırsa gelen port aynen kullanılır ve servis dinlemediği porta yönlendirildiği için bağlantı reddedilir.", label: 'Yönlendirilecek Port', type: 'text', optional: true, placeholder: '8080', hint: 'İç sunucunun dinlediği port (farklıysa)' }
                    ]
                },
                {
                    title: 'SRC-NAT',
                    icon: 'fas fa-arrow-left',
                    showFor: ['src-nat'],
                    fields: [
                        { name: 'src_address', why: "src-nat kuralında kaynak ağı daraltmak şarttır; daraltmazsanız router üzerinden geçen tüm trafik tek bir adrese çevrilir ve iç ağdaki kaynak takibi tamamen kaybolur.", label: 'Kaynak Adres / Ağ', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'NAT uygulanacak iç kaynak ağı' },
                        { name: 'src_to_addresses', why: "<code>src-nat</code> sabit bir adres gerektirir ve WAN adresi değişirse kural <b>kırılır</b>, trafik tamamen durur; dinamik IP kullanıyorsanız masquerade tercih edin.", label: 'Çevrileceği Adres', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Kaynak adresin yerini alacak public IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const natType = cgEsc(data._cgtype || 'masquerade');
            let c = '# ========================================\n# MikroTik RouterOS — NAT\n# ========================================\n\n';
            c += '/ip firewall nat\n';
            if (natType === 'masquerade') {
                const outIntf = cgEsc(data.out_interface || ''), masqSrc = cgEsc(data.masq_src_address || '');
                c += 'add chain=srcnat out-interface=' + outIntf;
                if (masqSrc) c += ' src-address=' + masqSrc;
                c += ' action=masquerade\n';
            } else if (natType === 'dst-nat') {
                const dstAddr = cgEsc(data.dst_address || ''), proto = cgEsc(data.dst_protocol || 'tcp');
                const dstPort = cgEsc(data.dst_port || ''), toAddr = cgEsc(data.to_addresses || '');
                const toPorts = cgEsc(data.to_ports || '');
                c += 'add chain=dstnat dst-address=' + dstAddr + ' protocol=' + proto + ' dst-port=' + dstPort;
                c += ' action=dst-nat to-addresses=' + toAddr;
                if (toPorts) c += ' to-ports=' + toPorts;
                c += '\n';
            } else if (natType === 'src-nat') {
                const srcAddr = cgEsc(data.src_address || ''), toAddr = cgEsc(data.src_to_addresses || '');
                c += 'add chain=srcnat src-address=' + srcAddr + ' action=src-nat to-addresses=' + toAddr + '\n';
            }
            c += '\n# Doğrulama:\n# /ip firewall nat print\n';
            return c;
        });
    }
};

// ── MikroTik: DHCP Server ─────────────────────────────────────────────────────
MikroTik.dhcp = {
    label: 'DHCP Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-dhcp',
                title: 'DHCP Server (MikroTik)',
                desc: 'RouterOS DHCP server — IP pool, ağ ve kira süresi konfigürasyonu.<br><code>/ip pool add name=dhcp_pool ranges=&lt;start&gt;-&lt;end&gt;</code><br><code>/ip dhcp-server add interface=&lt;iface&gt; address-pool=dhcp_pool</code>'
            },
            sections: [
                {
                    title: 'DHCP Server Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'interface', why: "DHCP server yanlış arayüze bağlanırsa istemcilere hiç ulaşamaz veya daha kötüsü <b>başka bir ağa IP dağıtmaya başlar</b> ve o ağdaki mevcut DHCP ile çakışır.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'bridge1', hint: 'DHCP hizmeti verilecek arayüz veya bridge' },
                        { name: 'network', why: "Network tanımı arayüzdeki IP ile aynı subnet'te olmalıdır; uyuşmazlıkta istemciler adres alır ama gateway'e erişemez, klasik <b>IP var internet yok</b> tablosu oluşur.", label: 'Ağ Adresi (CIDR)', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'DHCP dağıtılacak ağ bloğu' },
                        { name: 'gateway', why: "İstemcilere dağıtılan gateway yanlışsa cihazlar birbirini görür ama dışarı çıkamaz; bu, DHCP'nin çalışıyor görünmesi nedeniyle teşhisi en çok geciken hatalardandır.", label: 'Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'İstemcilere verilecek default gateway' },
                        { name: 'pool_start', why: "Havuz başlangıcı statik adresler ve gateway ile çakışmamalıdır; çakışırsa DHCP bir sunucunun adresini bir istemciye verir ve o servis aralıklarla erişilemez hâle gelir.", label: 'Pool Başlangıç', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Dağıtılacak IP aralığının başlangıcı' },
                        { name: 'pool_end', why: "Havuz aralığı beklenen istemci sayısını karşılamalı; havuz dolduğunda yeni cihazlar <b>hiç adres alamaz</b> ve kullanıcılar sorunu rastgele bir ağ arızası sanır.", label: 'Pool Bitiş', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.100', hint: 'Dağıtılacak IP aralığının sonu' },
                        { name: 'dns_servers', why: "DNS dağıtılmazsa istemciler IP alır ama hiçbir ismi çözemez. Router'ın kendisini DNS olarak vereceksen <code>/ip dns allow-remote-requests=yes</code> olmalı ve bu port dışarıya <b>kapalı</b> tutulmalıdır.", label: 'DNS Sunucuları', type: 'text', required: true, placeholder: '8.8.8.8,8.8.4.4', hint: 'Virgülle ayrılmış DNS adresleri' },
                        { name: 'lease_time', why: "Çok uzun lease, havuzun ayrılan ama kullanılmayan adreslerle dolmasına yol açar; çok kısa lease ise DHCP sunucusunda ve log'larda gereksiz yük oluşturur.", label: 'Kira Süresi', type: 'text', required: true, placeholder: '1d', hint: 'Örn: 1d (1 gün), 12h (12 saat)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intf = cgEsc(data.interface || ''), network = cgEsc(data.network || '');
            const gateway = cgEsc(data.gateway || ''), poolStart = cgEsc(data.pool_start || '');
            const poolEnd = cgEsc(data.pool_end || ''), dnsServers = cgEsc(data.dns_servers || '');
            const leaseTime = cgEsc(data.lease_time || '');
            let c = '# ========================================\n# MikroTik RouterOS — DHCP Server\n# ========================================\n\n';
            c += '/ip pool\nadd name=dhcp_pool ranges=' + poolStart + '-' + poolEnd + '\n\n';
            c += '/ip dhcp-server network\nadd address=' + network + ' gateway=' + gateway + ' dns-server=' + dnsServers + '\n\n';
            c += '/ip dhcp-server\nadd name=dhcp_' + intf + ' interface=' + intf + ' address-pool=dhcp_pool lease-time=' + leaseTime + '\n\n';
            c += '# Doğrulama:\n# /ip dhcp-server print\n# /ip dhcp-server lease print\n';
            return c;
        });
    }
};

// ── MikroTik: IPSec Site-to-Site IKEv2 ───────────────────────────────────────
MikroTik.ipsec = {
    label: 'IPSec Site-to-Site',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'IPSec Site-to-Site IKEv2 (MikroTik)',
                desc: 'RouterOS IKEv2 site-to-site VPN — profile, peer, identity ve policy yapılandırması.<br><code>/ip ipsec peer add address=&lt;peer&gt; profile=ike2-profile</code><br><code>/ip ipsec policy add src-address=&lt;local-net&gt; dst-address=&lt;remote-net&gt; tunnel=yes</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'IPSec IKEv2 Ayarları',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'peer_address', why: "Peer adresi karşı ucun gerçek public adresi olmalı ve iki uçtaki tanımlar birbirini işaret etmelidir; NAT arkasındaki uçta bu adres değişiyorsa tünel sürekli kurulup kopar.", label: 'Peer Adresi', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Uzak tarafın public IP adresi' },
                        { name: 'local_address', why: "Yerel adres sabitlenmezse RouterOS çıkış arayüzüne göre farklı kaynak adres kullanabilir; karşı uç bu adresi tanımadığı için IKE müzakeresi <b>no phase1 peer</b> hatasıyla düşer.", label: 'Yerel Adres', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'Bu cihazın WAN (public) IP adresi' },
                        { name: 'preshared_key', why: "PSK iki uçta birebir aynı olmalıdır ve yeterince uzun olmalıdır; kısa bir PSK yakalanan IKE trafiğinden çevrimdışı kırılabilir ve tünelin tüm gizliliği kaybolur.", label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'VerySecretKey123', hint: 'Her iki tarafta aynı PSK kullanılmalı' },
                        { name: 'local_network', why: "Policy'deki yerel ağ karşı uçtaki uzak ağ ile <b>ayna görüntüsü</b> olmalıdır; uyuşmazlıkta Phase 2 kurulmaz. Ayrıca bu trafiğin masquerade kuralına yakalanmaması için NAT'tan muaf tutulmalıdır.", label: 'Yerel Ağ (CIDR)', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'Şifrelenecek yerel ağ bloğu' },
                        { name: 'remote_network', why: "Uzak ağ karşı uçtaki yerel ağ ile aynı olmalı; iki tarafta çakışan adres planı (her iki uçta 192.168.1.0/24) varsa tünel kurulsa bile trafik hiçbir zaman karşıya gitmez.", label: 'Uzak Ağ (CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/24', hint: 'Uzak taraftaki ağ bloğu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerAddr = cgEsc(data.peer_address || ''), localAddr = cgEsc(data.local_address || '');
            const psk = cgEsc(data.preshared_key || ''), localNet = cgEsc(data.local_network || '');
            const remoteNet = cgEsc(data.remote_network || '');
            let c = '# ========================================\n# MikroTik RouterOS — IPSec Site-to-Site IKEv2\n# ========================================\n\n';
            c += '/ip ipsec profile\nadd name=ike2-profile ike-version=2 enc-algorithm=aes-256 dh-group=modp2048 lifetime=8h\n\n';
            c += '/ip ipsec peer\nadd address=' + peerAddr + ' local-address=' + localAddr + ' profile=ike2-profile\n\n';
            c += '/ip ipsec identity\nadd peer=' + peerAddr + ' auth-method=pre-shared-key secret="' + psk + '"\n\n';
            c += '/ip ipsec proposal\nadd name=ike2-proposal auth-algorithms=sha256 enc-algorithms=aes-256-cbc lifetime=1h pfs-group=modp2048\n\n';
            c += '/ip ipsec policy\nadd src-address=' + localNet + ' dst-address=' + remoteNet + ' tunnel=yes action=encrypt proposal=ike2-proposal peer=' + peerAddr + '\n\n';
            c += '# Doğrulama:\n# /ip ipsec active-peers print\n# /ip ipsec installed-sa print\n';
            return c;
        });
    }
};

// ── MikroTik: WireGuard ───────────────────────────────────────────────────────
MikroTik.wireguard = {
    label: 'WireGuard',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'WireGuard VPN (MikroTik)',
                desc: 'RouterOS WireGuard — modern VPN protokolü, peer konfigürasyonu.<br><code>/interface wireguard add name=wg0 listen-port=51820</code><br><code>/interface wireguard peers add interface=wg0 public-key="..." allowed-address=&lt;IP&gt;</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'WireGuard Arayüzü',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'interface_name', why: "Arayüz adı firewall ve routing kurallarında referans alınır; adı sonradan değiştirmek bu kuralları sessizce etkisiz bırakır ve tünel kurulur ama trafik geçmez.", label: 'Arayüz Adı', type: 'text', required: true, placeholder: 'wg0', hint: 'WireGuard sanal arayüz adı' },
                        { name: 'listen_port', why: "Dinleme portunun WAN tarafında <code>input</code> chain'inde <b>açık olması</b> gerekir; firewall'da izin verilmezse el sıkışma paketleri düşer ve tünel hiçbir zaman kurulmaz.", label: 'Dinleme Portu', type: 'text', validate: 'port', required: true, placeholder: '51820', hint: 'WireGuard UDP port numarası' },
                        { name: 'wg_address', why: "Tünel adresi iki uçta aynı subnet'te ama farklı adresler olmalı; çakışma veya farklı subnet kullanımı el sıkışma başarılı olsa bile veri akışını imkânsız kılar.", label: 'WireGuard Yerel IP (CIDR)', type: 'text', required: true, placeholder: '10.128.0.1/24', hint: 'VPN tünel arayüzüne atanacak IP' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'peer_pubkey', why: "Public key karşı ucun <b>public</b> anahtarı olmalıdır, kendi anahtarınız değil; yanlış anahtarda el sıkışma sessizce başarısız olur ve log'da yalnızca handshake tekrarları görünür.", label: 'Peer Public Key', type: 'text', required: true, placeholder: 'PEER_PUBLIC_KEY_BASE64=', hint: 'Uzak tarafın WireGuard public key değeri' },
                        { name: 'allowed_address', why: "Allowed-address hem routing hem de kabul filtresidir: burada listelenmeyen kaynaklardan gelen paketler <b>düşürülür</b>. Çok dar yazmak trafiği keser, <code>0.0.0.0/0</code> yazmak tüm trafiği tünele sokar.", label: 'Allowed Address', type: 'text', required: true, placeholder: '10.128.0.2/32', hint: 'Bu peer üzerinden geçecek IP aralığı' },
                        { name: 'endpoint', why: "Endpoint yalnızca bağlantıyı başlatan tarafta gereklidir; NAT arkasındaki uçta tanımlanmazsa tünel ancak karşı taraf veri gönderdiğinde ayağa kalkar, bu yüzden keepalive kullanmak gerekir.", label: 'Endpoint (IP:Port)', type: 'text', optional: true, placeholder: '203.0.113.1:51820', hint: 'Uzak peer adresi — client tarafında gerekli' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.interface_name || ''), listenPort = cgEsc(data.listen_port || '');
            const wgAddress = cgEsc(data.wg_address || ''), peerPubkey = cgEsc(data.peer_pubkey || '');
            const allowedAddress = cgEsc(data.allowed_address || '');
            const endpointRaw = (data.endpoint || '').trim();
            let c = '# ========================================\n# MikroTik RouterOS — WireGuard\n# ========================================\n\n';
            c += '/interface wireguard\nadd name=' + intfName + ' listen-port=' + listenPort + ' mtu=1420\n\n';
            c += '# IMPORTANT: Generate private key first:\n';
            c += '# /interface wireguard generate-private-key ' + intfName + '\n\n';
            c += '/ip address\nadd address=' + wgAddress + ' interface=' + intfName + '\n\n';
            c += '/interface wireguard peers\nadd interface=' + intfName + ' public-key="' + peerPubkey + '" allowed-address=' + allowedAddress;
            if (endpointRaw) {
                const lastColon = endpointRaw.lastIndexOf(':');
                const epIp = cgEsc(endpointRaw.substring(0, lastColon));
                const epPort = cgEsc(endpointRaw.substring(lastColon + 1));
                c += ' endpoint-address=' + epIp + ' endpoint-port=' + epPort;
            }
            c += '\n\n# Doğrulama:\n# /interface wireguard print\n# /interface wireguard peers print\n';
            return c;
        });
    }
};

// ── MikroTik: OSPF ────────────────────────────────────────────────────────────
MikroTik.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (MikroTik)',
                desc: 'RouterOS OSPF — instance, area ve interface-template konfigürasyonu.<br><code>/routing ospf instance add name=ospf1 router-id=&lt;RID&gt;</code><br><code>/routing ospf interface-template add area=area_0.0.0.0 interfaces=&lt;iface&gt;</code>',
                badge: { text: 'Routing', cls: 'common' }
            },
            sections: [
                {
                    title: 'OSPF Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router_id', why: "Router-ID ağ genelinde benzersiz olmalı; çakışmada komşuluklar sürekli flap eder ve rota tablosu kararsızlaşır. RouterOS v7'de bu bir loopback adresi olarak verilmelidir.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.240.0.1', hint: 'Genellikle Loopback IP adresi' },
                        { name: 'instance_name', why: "Instance adı area ve interface template tanımlarında referans alınır; isim uyuşmazsa RouterOS v7 yapılandırmayı kabul eder ama OSPF hiçbir arayüzde çalışmaz.", label: 'Instance Adı', type: 'text', required: true, placeholder: 'ospf1', hint: 'OSPF process adı' },
                        { name: 'area', why: "Area ID linkin iki ucunda aynı olmalı; farklıysa hello paketleri reddedilir ve komşuluk kurulmaz. Backbone (<code>0.0.0.0</code>) dışındaki tüm alanlar backbone'a değmek zorundadır.", label: 'Area ID', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' },
                        { name: 'interfaces', why: "Interface template'te ağı çok geniş tanımlamak WAN ve kullanıcı portlarını da OSPF'e sokar; bu portlardan hello göndermek hem güvenlik açığıdır hem de yetkisiz bir komşunun rota enjekte etmesine izin verir.", label: 'Arayüzler', type: 'text', required: true, placeholder: 'ether1,ether2', hint: 'Virgülle ayrılmış OSPF arayüzleri' },
                        { name: 'redistribute_static', why: "Statik rotaları dağıtmak, filtre olmadan yapıldığında varsayılan rota dâhil her şeyi komşulara yayar ve <b>trafiği kendi üzerinize çekersiniz</b>; mutlaka routing filter ile sınırlayın.", label: 'Static Redistribute', type: 'select', options: [
                            { value: 'no', label: 'Hayır', selected: true },
                            { value: 'yes', label: 'Evet' }
                        ], hint: 'Statik rotaları OSPF ile duyur' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const routerId = cgEsc(data.router_id || ''), instanceName = cgEsc(data.instance_name || '');
            const area = cgEsc(data.area || '');
            const intfs = (data.interfaces || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const redistributeStatic = cgEsc(data.redistribute_static || 'no');
            let c = '# ========================================\n# MikroTik RouterOS — OSPF\n# ========================================\n\n';
            c += '/routing ospf instance\nadd name=' + instanceName + ' router-id=' + routerId + '\n\n';
            c += '/routing ospf area\nadd name=area_' + area + ' area-id=' + area + ' instance=' + instanceName + '\n\n';
            intfs.forEach(intf => {
                c += '/routing ospf interface-template\nadd area=area_' + area + ' interfaces=' + intf + ' type=broadcast\n';
            });
            if (redistributeStatic === 'yes') {
                c += '\n/routing ospf instance\nset ' + instanceName + ' redistribute=static\n';
            }
            c += '\n# Doğrulama:\n# /routing ospf neighbor print\n# /routing ospf route print\n';
            return c;
        });
    }
};

// ── MikroTik: BGP ─────────────────────────────────────────────────────────────
MikroTik.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (MikroTik)',
                desc: 'RouterOS BGP — template ve connection tabanlı yapılandırma, prefix filter desteği.<br><code>/routing bgp template add name=bgp-template as=&lt;ASN&gt;</code><br><code>/routing bgp connection add remote.address=&lt;peer&gt; remote.as=&lt;peer-ASN&gt;</code>',
                badge: { text: 'Routing', cls: 'common' }
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "Local AS karşı taraftaki remote-as ile eşleşmeli; uyuşmazlıkta oturum açılmaz ve log'da yalnızca tekrar eden bağlantı denemeleri görünür. RouterOS v7'de bu alan <code>/routing bgp connection</code> altındadır.", label: 'Yerel AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Bu cihazın Autonomous System numarası' },
                        { name: 'router_id', why: "BGP Router-ID benzersiz olmalıdır; aynı ID'li iki cihaz arasında oturum hiç kurulmaz. Arayüz bağımsız olması için loopback adresi kullanın.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.240.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "Peer adresi karşı ucun paketleri gerçekten gönderdiği adres olmalıdır; farklı bir kaynaktan gelirse RouterOS oturumu reddeder. Loopback peering yapıyorsanız <code>local.address</code> da tanımlanmalıdır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'remote_as', why: "Remote AS karşı tarafın local AS'i ile aynı olmalı ve oturumun iBGP mi eBGP mi olduğunu belirler; eBGP'de TTL 1 olduğu için loopback peering ek ayar (multihop) gerektirir.", label: 'Uzak AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'prefix_list', why: "Çıkış filtresi olmadan BGP kurmak, öğrendiğiniz tüm rotaları komşuya geri duyurmanıza yani <b>istemeden transit sağlayıcı olmanıza</b> yol açar; mutlaka yalnızca kendi prefix'lerinizi duyurun.", label: 'Prefix Listesi (CIDR)', type: 'text', optional: true, placeholder: '192.168.0.0/16', hint: 'Output filter için duyurulacak prefix (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), remoteAs = cgEsc(data.remote_as || '');
            const prefixList = cgEsc(data.prefix_list || '');
            let c = '# ========================================\n# MikroTik RouterOS — BGP\n# ========================================\n\n';
            c += '/routing bgp template\nadd name=bgp-template as=' + localAs + ' router-id=' + routerId + '\n\n';
            c += '/routing bgp connection\nadd name=peer-' + peerIp + ' as=' + localAs + ' remote.address=' + peerIp + ' remote.as=' + remoteAs + ' template=bgp-template\n';
            if (prefixList) {
                c += '\n/routing filter rule\nadd chain=bgp-out rule="if (dst in ' + prefixList + ') { accept }"\n';
                c += '/routing bgp connection set peer-' + peerIp + ' output.filter=bgp-out\n';
            }
            c += '\n# Doğrulama:\n# /routing bgp connection print\n# /routing bgp advertisements print\n';
            return c;
        });
    }
};

// ── MikroTik: Queue / HTB ─────────────────────────────────────────────────────
MikroTik.queue = {
    label: 'Queue / HTB',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Queue / HTB Bant Genişliği Kontrolü (MikroTik)',
                desc: 'RouterOS Simple Queue — per-client bant genişliği limitleme ve burst desteği.<br><code>/queue simple add name=&lt;ad&gt; target=&lt;IP&gt; max-limit=&lt;up&gt;/&lt;down&gt;</code>'
            },
            sections: [
                {
                    title: 'Queue Ayarları',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'queue_name', why: "Queue adı script ve izleme için referanstır; anlamsız isimler zamanla hangi kuyruğun hangi müşteriye ait olduğunun bilinmemesine ve yanlış kuyruğun silinmesine yol açar.", label: 'Queue Adı', type: 'text', required: true, placeholder: 'CLIENT-QUEUE', hint: 'Tanımlayıcı kuyruk adı' },
                        { name: 'target', why: "Hedef adres veya subnet yanlış girilirse limit istenmeyen kullanıcılara uygulanır; ayrıca <code>0.0.0.0/0</code> gibi geniş bir hedef tüm ağı tek bir bant genişliğine hapseder.", label: 'Hedef (IP veya subnet)', type: 'text', required: true, placeholder: '192.168.1.100', hint: 'Sınırlandırılacak IP veya ağ' },
                        { name: 'max_limit_up', why: "Simple queue'de yön <b>hedefin bakış açısına göredir</b>: upload istemciden çıkan trafiktir. Yönleri karıştırmak kullanıcıların indirme hızını yanlışlıkla kısar.", label: 'Maks. Upload Limiti', type: 'text', required: true, placeholder: '10M', hint: 'Örn: 10M, 512k, 1G' },
                        { name: 'max_limit_down', why: "Limiti fiziksel hat kapasitesinin biraz altında tutmak kuyruğun sizde oluşmasını sağlar; hattın tam kapasitesine eşit verilirse tıkanıklık operatör tarafında oluşur ve QoS tamamen etkisiz kalır.", label: 'Maks. Download Limiti', type: 'text', required: true, placeholder: '50M', hint: 'Örn: 50M, 100M' }
                    ]
                },
                {
                    title: 'Burst Ayarları',
                    icon: 'fas fa-bolt',
                    info: 'Burst ayarları opsiyoneldir. Her iki alan da doldurulursa aktif olur.',
                    fields: [
                        { name: 'burst_limit_up', why: "Burst limiti max-limit'ten büyük olmalıdır, aksi hâlde burst hiç devreye girmez. Çok yüksek burst ise hattı anlık doldurup diğer kullanıcılarda gecikme sıçramasına neden olur.", label: 'Burst Upload Limiti', type: 'text', optional: true, placeholder: '15M', hint: 'Burst dönemindeki maksimum upload hızı' },
                        { name: 'burst_time', why: "Burst-time gerçek burst süresi değil, ortalamanın hesaplandığı penceredir; değeri yanlış anlamak burst'ün beklenenden çok daha kısa veya uzun sürmesine yol açar.", label: 'Burst Süresi (saniye)', type: 'text', optional: true, placeholder: '8', hint: 'Burst uygulanacak süre (saniye)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const queueName = cgEsc(data.queue_name || ''), target = cgEsc(data.target || '');
            const maxLimitUp = cgEsc(data.max_limit_up || ''), maxLimitDown = cgEsc(data.max_limit_down || '');
            const burstLimitUp = cgEsc(data.burst_limit_up || ''), burstTime = cgEsc(data.burst_time || '');
            let c = '# ========================================\n# MikroTik RouterOS — Queue / HTB\n# ========================================\n\n';
            c += '/queue simple\nadd name=' + queueName + ' target=' + target + ' max-limit=' + maxLimitUp + '/' + maxLimitDown;
            if (burstLimitUp && burstTime) {
                c += ' \\\n    burst-limit=' + burstLimitUp + '/0 burst-time=' + burstTime + 's/0s';
            }
            c += '\n\n# Doğrulama:\n# /queue simple print\n# /queue simple monitor ' + queueName + '\n';
            return c;
        });
    }
};

// ── MikroTik: SNMP ────────────────────────────────────────────────────────────
MikroTik.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-satellite-dish',
                title: 'SNMP (MikroTik)',
                desc: 'RouterOS SNMP — community, trap hedefi ve sistem bilgisi konfigürasyonu.<br><code>/snmp community add name=&lt;community&gt;</code><br><code>/snmp target add address=&lt;trap-host&gt; community=&lt;community&gt;</code>'
            },
            sections: [
                {
                    title: 'SNMP Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'community', why: "Community açık metin taşınır ve bir şifre gibidir; <code>public</code> bırakmak cihazın arayüz, trafik ve komşu bilgilerini ağdaki herkese açar. Erişimi <code>addresses</code> ile sınırlayın.", label: 'Community', type: 'text', required: true, placeholder: 'PUBLIC-RO', hint: 'SNMP community string (read-only önerilir)' },
                        { name: 'trap_target', why: "Trap hedefi yanlışsa arıza bildirimleri hiçbir yere ulaşmaz; izleme sistemindeki sessizlik sağlıklı sanılır, oysa cihaz saatlerdir sorun bildirmeye çalışıyordur.", label: 'Trap Hedefi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap alacak sunucunun IP adresi' }
                    ]
                },
                {
                    title: 'Sistem Bilgisi',
                    icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'contact', why: "İletişim bilgisi cihazın sahibi ekibi gösterir; tanımsızsa arıza veya değişiklik anında kimin onay vereceği bilinemez ve müdahale gereksiz yere bekler.", label: 'İletişim', type: 'text', optional: true, placeholder: 'noc@company.com', hint: 'sysContact değeri (SNMP MIB-II)' },
                        { name: 'location', why: "Konum bilgisi izleme sisteminde cihazı fiziksel olarak bulmayı sağlar; boş bırakılırsa saha ekibi hangi kabine gideceğini bilemez ve kesinti süresi uzar.", label: 'Konum', type: 'text', optional: true, placeholder: 'DC1-Rack-A', hint: 'sysLocation değeri (SNMP MIB-II)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const community = cgEsc(data.community || ''), trapTarget = cgEsc(data.trap_target || '');
            const contact = cgEsc(data.contact || ''), location = cgEsc(data.location || '');
            let c = '# ========================================\n# MikroTik RouterOS — SNMP\n# ========================================\n\n';
            c += '/snmp community\nadd name=' + community + ' security=none\n\n';
            c += '/snmp\nset enabled=yes';
            if (contact)  c += ' contact="' + contact + '"';
            if (location) c += ' location="' + location + '"';
            c += '\n\n';
            c += '/snmp target\nadd address=' + trapTarget + ' community=' + community + ' version=2\n\n';
            c += '# Doğrulama:\n# /snmp print\n# /snmp community print\n';
            return c;
        });
    }
};

// ── MikroTik: Logging / Remote Syslog ────────────────────────────────────────
MikroTik.logging = {
    label: 'Logging / Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Logging / Remote Syslog (MikroTik)',
                desc: 'RouterOS uzak syslog — sistem olaylarını merkezi log sunucusuna gönder.<br><code>/system logging action add name=remote target=remote remote=&lt;host&gt;</code><br><code>/system logging add action=remote topics=&lt;konu&gt;</code>'
            },
            sections: [
                {
                    title: 'Remote Syslog Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'remote_host', why: "RouterOS log'ları varsayılan olarak <b>bellekte</b> tutar ve yeniden başlatmada tamamen kaybolur; uzak syslog tanımlanmazsa arıza sonrası inceleyecek hiçbir kanıt kalmaz.", label: 'Uzak Syslog Sunucusu', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'Syslog mesajlarının gönderileceği sunucu IP' },
                        { name: 'remote_port', why: "Syslog sunucusunun dinlediği port ile aynı olmalı ve aradaki firewall'da izinli olmalıdır; uyuşmazlıkta paketler sessizce düşer, RouterOS hiçbir hata göstermez.", label: 'Uzak Port', type: 'text', validate: 'port', optional: true, placeholder: '514', hint: 'Varsayılan UDP 514 (boş bırakılabilir)' },
                        { name: 'topics', why: "Konu seçimi kritiktir: <code>debug</code> veya tüm konuları açmak cihazın CPU'sunu ve WAN'ı gereksiz log ile doldurur, <code>error,warning,critical</code> gibi dar bir seçim ise kritik olayları kaçırmamanızı sağlar.", label: 'Konular', type: 'text', required: true, placeholder: 'info,error,warning', hint: 'Virgülle ayrılmış log konuları: info, error, warning, debug, firewall...' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const remoteHost = cgEsc(data.remote_host || ''), remotePort = cgEsc(data.remote_port || '');
            const topics = (data.topics || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# MikroTik RouterOS — Remote Syslog\n# ========================================\n\n';
            c += '/system logging action\nadd name=remote target=remote remote=' + remoteHost;
            if (remotePort) c += ' remote-port=' + remotePort;
            c += ' syslog-facility=daemon\n\n';
            topics.forEach(topic => {
                c += '/system logging\nadd action=remote topics=' + topic + '\n';
            });
            c += '\n# Doğrulama:\n# /system logging print\n# /system logging action print\n';
            return c;
        });
    }
};

// ── MikroTik yardımcıları (yalnız bu dosyadaki yeni araçlar kullanır) ───────
// '10.5.50.1/24' -> { ip:'10.5.50.1', len:24, net:'10.5.50.0/24' }; geçersizse null
function cgMtCidr(s) {
    const m = String(s || '').trim().match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
    if (!m) return null;
    const o = m[1].split('.').map(Number), len = +m[2];
    if (o.some(x => x > 255) || len > 32) return null;
    const n = o.reduce((a, x) => a * 256 + x, 0);
    const mask = len === 0 ? 0 : (0xFFFFFFFF << (32 - len)) >>> 0;
    const nw = (n & mask) >>> 0;
    return { ip: m[1], len: len, net: [24, 16, 8, 0].map(b => (nw >>> b) & 255).join('.') + '/' + len };
}
function cgMtList(s) {
    return String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}

// ── MikroTik: Load Balancing (PCC / ECMP) ─────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/high-availability-solutions/load-balancing/per-connection-classifier
//            (routing table + mangle + route + NAT örneği birebir)
//            ECMP: https://manual.mikrotik.com/docs/user-guides/routing-and-networking-protocols/routing-decision
MikroTik.lb = {
    label: 'Load Balancing (PCC / ECMP)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-balance-scale',
                title: 'İki WAN Yük Paylaşımı — PCC / ECMP (MikroTik RouterOS 7)',
                desc: 'İki internet hattını bağlantı bazında paylaştırır. PCC: mangle ile bağlantıyı işaretleyip ayrı routing table\'lara yollar; ECMP: aynı distance\'lı iki default route.<br><code>/routing table add fib name=ISP1_table</code><br><code>per-connection-classifier=both-addresses:2/0</code>'
            },
            configTypes: [
                { id: 'pcc', label: 'PCC', icon: 'fas fa-random', desc: 'Mangle + routing table, oturum yapışkan', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'ecmp', label: 'ECMP', icon: 'fas fa-equals', desc: 'Aynı distance\'lı iki default route', badge: { text: 'Basit', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Hatlar',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'wan1_iface', label: 'WAN1 Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: '1. ISP arayüzü', why: "PCC'de dışarıdan gelen bağlantılar bu arayüze göre işaretlenir ve cevap aynı hattan döner. Yanlış arayüz, dönüş trafiğinin diğer ISP'den (farklı kaynak IP ile) çıkıp karşı tarafta düşmesine yol açar." },
                        { name: 'wan1_gw', label: 'WAN1 Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.128.4.1', hint: '1. ISP next-hop', why: "<code>check-gateway=ping</code> bu adrese ping atar; ISP gateway'i ICMP'ye cevap vermiyorsa rota sürekli inactive olur ve hat hiç kullanılmaz." },
                        { name: 'wan2_iface', label: 'WAN2 Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether2', hint: '2. ISP arayüzü', why: "İki WAN aynı bridge'e alınmamalıdır; aksi hâlde arayüz eşleşmesi (in-interface) hiç tutmaz ve işaretleme boşa çıkar." },
                        { name: 'wan2_gw', label: 'WAN2 Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.128.5.1', hint: '2. ISP next-hop', why: "ECMP'de iki gateway eşit ağırlıktadır; farklı hızdaki hatlar için ECMP trafiği yine yarı yarıya böler, yavaş hat darboğaz olur." }
                    ]
                },
                {
                    title: 'PCC Ayarları',
                    icon: 'fas fa-random',
                    showFor: ['pcc'],
                    warn: 'FastTrack açıksa mangle işaretlemesi atlanan paketlerde çalışmaz; PCC ile birlikte <code>fasttrack-connection</code> kuralını gözden geçirin. HotSpot kullanan cihazda PCC geçerli bir yöntem değildir (resmi dokümandaki uyarı).',
                    fields: [
                        { name: 'lan_iface', label: 'LAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'bridge1', hint: 'İstemcilerin geldiği arayüz', why: "Routing mark yalnız LAN'dan gelen trafiğe konur (<code>in-interface</code>). Burayı yanlış yazmak ya hiçbir trafiği dengelemez ya da router'ın kendi trafiğini yanlış tabloya sokar." },
                        { name: 'wan1_net', label: 'WAN1 Bağlı Ağ', type: 'text', validate: 'cidr', required: true, placeholder: '10.128.4.0/24', hint: 'WAN1 arayüzündeki ağ (CIDR)', why: "Bağlı ağlara giden trafik <code>action=accept</code> ile policy routing dışında tutulur; tutulmazsa o ağdaki hostlara giden paketler zorla diğer gateway'e gider ve döngü oluşur (resmi örnekteki ilk iki kural)." },
                        { name: 'wan2_net', label: 'WAN2 Bağlı Ağ', type: 'text', validate: 'cidr', required: true, placeholder: '10.128.5.0/24', hint: 'WAN2 arayüzündeki ağ (CIDR)', why: "WAN1 ile aynı nedenle; iki bağlı ağ da muafiyet listesinde olmalıdır." },
                        { name: 'classifier', label: 'PCC Sınıflandırıcı', type: 'select', options: [
                            { value: 'both-addresses', label: 'both-addresses (istemci-sunucu çifti aynı hatta — önerilen)', selected: true },
                            { value: 'both-addresses-and-ports', label: 'both-addresses-and-ports (en dengeli)' },
                            { value: 'src-address', label: 'src-address (istemci hep aynı hatta)' }
                        ], hint: 'Hash girdisi', why: "Portları hash'e katmak dağılımı iyileştirir ama aynı siteye açılan paralel bağlantılar farklı IP'lerden çıkar; bankacılık gibi oturumu IP'ye bağlayan siteler kullanıcıyı atar. <code>both-addresses</code> bu sorunu önler." }
                    ]
                },
                {
                    title: 'NAT',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'masq', label: 'Her iki WAN için masquerade ekle', type: 'checkbox', checked: true, why: "Routing kararı verildikten sonra kaynak adres çıkış arayüzüne göre çevrilmelidir; masquerade yoksa özel adresli paketler ISP'de düşer. Mevcut bir srcnat kuralınız varsa çift kural oluşmaması için kapatın." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'pcc';
            const w1 = cgEsc(data.wan1_iface || ''), g1 = cgEsc(data.wan1_gw || '');
            const w2 = cgEsc(data.wan2_iface || ''), g2 = cgEsc(data.wan2_gw || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — Load Balancing (' + t.toUpperCase() + ')\n# ========================================\n\n';
            if (t === 'pcc') {
                const lan = cgEsc(data.lan_iface || ''), n1 = cgEsc(data.wan1_net || ''), n2 = cgEsc(data.wan2_net || '');
                const cls = cgEsc(data.classifier || '');
                c += '/routing table\nadd disabled=no fib name=ISP1_table\nadd disabled=no fib name=ISP2_table\n\n';
                c += '/ip firewall mangle\n';
                c += 'add action=accept chain=prerouting dst-address=' + n1 + ' in-interface=' + lan + '\n';
                c += 'add action=accept chain=prerouting dst-address=' + n2 + ' in-interface=' + lan + '\n';
                c += 'add action=mark-connection chain=input connection-state=new in-interface=' + w1 + ' new-connection-mark=ISP1\n';
                c += 'add action=mark-connection chain=input connection-state=new in-interface=' + w2 + ' new-connection-mark=ISP2\n';
                c += 'add action=mark-connection chain=output connection-mark=no-mark connection-state=new new-connection-mark=ISP1 per-connection-classifier=' + cls + ':2/0\n';
                c += 'add action=mark-connection chain=output connection-mark=no-mark connection-state=new new-connection-mark=ISP2 per-connection-classifier=' + cls + ':2/1\n';
                c += 'add action=mark-connection chain=prerouting connection-mark=no-mark connection-state=new dst-address-type=!local in-interface=' + lan + ' new-connection-mark=ISP1 per-connection-classifier=' + cls + ':2/0\n';
                c += 'add action=mark-connection chain=prerouting connection-mark=no-mark connection-state=new dst-address-type=!local in-interface=' + lan + ' new-connection-mark=ISP2 per-connection-classifier=' + cls + ':2/1\n';
                c += 'add action=mark-routing chain=output connection-mark=ISP1 new-routing-mark=ISP1_table\n';
                c += 'add action=mark-routing chain=prerouting connection-mark=ISP1 in-interface=' + lan + ' new-routing-mark=ISP1_table\n';
                c += 'add action=mark-routing chain=output connection-mark=ISP2 new-routing-mark=ISP2_table\n';
                c += 'add action=mark-routing chain=prerouting connection-mark=ISP2 in-interface=' + lan + ' new-routing-mark=ISP2_table\n\n';
                c += '/ip route\n';
                c += 'add check-gateway=ping disabled=no dst-address=0.0.0.0/0 gateway=' + g1 + ' routing-table=ISP1_table\n';
                c += 'add check-gateway=ping disabled=no dst-address=0.0.0.0/0 gateway=' + g2 + ' routing-table=ISP2_table\n';
                c += '# Yedek (failover) rotaları: işaretli tablodaki gateway düşünce main tablo devreye girer\n';
                c += 'add distance=1 dst-address=0.0.0.0/0 gateway=' + g1 + '\n';
                c += 'add distance=2 dst-address=0.0.0.0/0 gateway=' + g2 + '\n';
            } else {
                c += '# Aynı dst-address + aynı distance = ECMP (varsayılan hash: L3 kaynak/hedef IP)\n';
                c += '/ip route\n';
                c += 'add check-gateway=ping distance=1 dst-address=0.0.0.0/0 gateway=' + g1 + '\n';
                c += 'add check-gateway=ping distance=1 dst-address=0.0.0.0/0 gateway=' + g2 + '\n';
            }
            if (data.masq === true) {
                c += '\n/ip firewall nat\n';
                c += 'add action=masquerade chain=srcnat out-interface=' + w1 + '\n';
                c += 'add action=masquerade chain=srcnat out-interface=' + w2 + '\n';
            }
            c += '\n# Doğrulama:\n# /ip route print\n';
            if (t === 'pcc') c += '# /routing table print\n# /ip firewall mangle print stats\n';
            c += '# /ip firewall nat print\n';
            return c;
        });
    }
};

// ── MikroTik: WAN Failover (Recursive / check-gateway) ───────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/high-availability-solutions/load-balancing/failover-wan-backup
//            https://manual.mikrotik.com/docs/high-availability-solutions/load-balancing/ (basit failover)
MikroTik.failover = {
    label: 'WAN Failover',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'WAN Failover — Recursive Routing / check-gateway (MikroTik)',
                desc: 'Birincil hat koptuğunda trafiği yedek hatta geçirir. Recursive yöntem gateway\'in ötesindeki bir internet hostunu izler (ISP modemi ayakta ama internet yokken de çalışır).<br><code>/ip route add dst-address=&lt;izlenen-host&gt; scope=10 gateway=&lt;gw1&gt;</code><br><code>/ip route add distance=1 gateway=&lt;izlenen-host&gt; target-scope=11 check-gateway=ping</code>'
            },
            configTypes: [
                { id: 'recursive', label: 'Recursive', icon: 'fas fa-sitemap', desc: 'İnternetteki bir hostu izler', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'simple', label: 'check-gateway', icon: 'fas fa-heartbeat', desc: 'Yalnız gateway\'e ping atar', badge: { text: 'Basit', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Gateway\'ler',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'gw1', label: 'Birincil Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.240.0.1', hint: 'ISP1 next-hop', why: "Birincil rota <code>distance=1</code> ile kurulur. Basit yöntemde yalnız bu adrese ping atılır: ISP modemi ayakta ama upstream kopuksa failover <b>tetiklenmez</b> — recursive yöntemin varlık sebebi budur." },
                        { name: 'gw2', label: 'Yedek Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.112.0.1', hint: 'ISP2 next-hop', why: "Yedek rota <code>distance=2</code> ile bekler; birincil geri geldiğinde trafik otomatik geri döner (RouterOS'ta ayrı preempt ayarı yoktur)." }
                    ]
                },
                {
                    title: 'İzlenecek Hostlar',
                    icon: 'fas fa-bullseye',
                    showFor: ['recursive'],
                    info: 'Her hat için ayrı bir internet hostu seçin (ör. iki farklı genel DNS anycast adresi). Bu hostlara giden trafik kalıcı olarak ilgili hatta sabitlenir.',
                    fields: [
                        { name: 'host1', label: 'Host 1 (ISP1 üzerinden)', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.53', hint: 'ICMP cevabı veren güvenilir genel adres', why: "Bu adrese /32 host rotası <code>scope=10</code> ile ISP1 gateway'ine sabitlenir. Aynı adresi istemciler DNS olarak da kullanıyorsa, ISP1 düştüğünde o DNS'e erişim de kesilir — izleme hostunu servis olarak kullanmayın." },
                        { name: 'host2', label: 'Host 2 (ISP2 üzerinden)', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.53', hint: 'Host 1\'den farklı olmalı', why: "İki hat aynı hostu izlerse host rotası tek gateway'e bağlanır ve ikinci hattın sağlığı hiç ölçülmez." }
                    ]
                },
                {
                    title: 'NAT',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'fo_masq', label: 'Her iki WAN için masquerade ekle', type: 'checkbox', checked: false, why: "Yedek hatta geçildiğinde paketler ISP2 arayüzünden çıkar; o arayüz için srcnat yoksa internet erişimi failover sonrası tamamen kesilir. Zaten masquerade kuralınız varsa kapalı bırakın." },
                        { name: 'fo_wan1', label: 'WAN1 Arayüzü', type: 'text', validate: 'iface', requiredIf: { field: 'fo_masq', checked: true }, placeholder: 'ether1', hint: 'Masquerade için' },
                        { name: 'fo_wan2', label: 'WAN2 Arayüzü', type: 'text', validate: 'iface', requiredIf: { field: 'fo_masq', checked: true }, placeholder: 'ether2', hint: 'Masquerade için' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'recursive';
            const g1 = cgEsc(data.gw1 || ''), g2 = cgEsc(data.gw2 || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — WAN Failover (' + (t === 'recursive' ? 'Recursive' : 'check-gateway') + ')\n# ========================================\n\n';
            if (data.fo_masq === true) {
                const w1 = cgEsc(data.fo_wan1 || ''), w2 = cgEsc(data.fo_wan2 || '');
                c += '/ip firewall nat\n';
                if (w1) c += 'add chain=srcnat action=masquerade out-interface=' + w1 + '\n';
                if (w2) c += 'add chain=srcnat action=masquerade out-interface=' + w2 + '\n';
                c += '\n';
            }
            if (t === 'recursive') {
                const h1 = cgEsc(data.host1 || ''), h2 = cgEsc(data.host2 || '');
                c += '# İzleme hostlarını ilgili hatta sabitle\n/ip route\n';
                c += 'add dst-address=' + h1 + ' scope=10 gateway=' + g1 + '\n';
                c += 'add dst-address=' + h2 + ' scope=10 gateway=' + g2 + '\n\n';
                c += '# Default route hostlar üzerinden recursive çözülür\n/ip route\n';
                c += 'add distance=1 gateway=' + h1 + ' target-scope=11 check-gateway=ping\n';
                c += 'add distance=2 gateway=' + h2 + ' target-scope=11 check-gateway=ping\n';
            } else {
                c += '/ip route\n';
                c += 'add gateway=' + g1 + ' distance=1 check-gateway=ping\n';
                c += 'add gateway=' + g2 + ' distance=2\n';
            }
            c += '\n# Doğrulama:\n# /ip route print\n# /ip route print detail where dst-address=0.0.0.0/0\n';
            return c;
        });
    }
};

// ── MikroTik: Netwatch ────────────────────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/diagnostics-monitoring-and-troubleshooting/netwatch
//            https://manual.mikrotik.com/docs/cli-reference/tool/netwatch (argüman tablosu)
//            'set [find comment=...]' kalıbı: https://manual.mikrotik.com/docs/developer-guides/scripting/scripting-examples
MikroTik.netwatch = {
    label: 'Netwatch',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Netwatch — Host İzleme (MikroTik)',
                desc: 'Bir hostu periyodik test eder; durum değişince log yazar veya yorumla işaretlenmiş bir rotayı açıp kapatır.<br><code>/tool netwatch add host=&lt;ip&gt; type=icmp up-script=... down-script=...</code>'
            },
            sections: [
                {
                    title: 'Prob',
                    icon: 'fas fa-bullseye',
                    fields: [
                        { name: 'nw_host', label: 'İzlenen Host', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.53', hint: 'IP adresi', why: "Netwatch varsayılan olarak main tablodan çıkar; izlenen host yedek hattan da erişilebiliyorsa birincil hat düşse bile prob <b>up</b> kalır. Hostu tek hatta sabitlemek için recursive failover aracındaki host rotasını kullanın." },
                        { name: 'nw_name', label: 'Prob Adı', type: 'text', placeholder: 'ISP1-probe', hint: 'Log ve listede görünen ad' },
                        { name: 'nw_type', label: 'Prob Tipi', type: 'select', options: [
                            { value: 'icmp', label: 'icmp — çoklu ping + eşikler', selected: true },
                            { value: 'simple', label: 'simple — tek ping (eski davranış)' },
                            { value: 'tcp-conn', label: 'tcp-conn — TCP el sıkışması' }
                        ], why: "<code>simple</code> tek pakete bakar ve anlık kayıpta yanlış alarm üretir; <code>icmp</code> 10 paket gönderip kayıp/gecikme eşiğiyle karar verir. Servis izliyorsanız <code>tcp-conn</code> ICMP'yi filtreleyen hedeflerde de çalışır." },
                        { name: 'nw_port', label: 'TCP Port', type: 'text', validate: 'port', requiredIf: { field: 'nw_type', in: ['tcp-conn'] }, placeholder: '443', hint: 'Yalnız tcp-conn için' },
                        { name: 'nw_interval', label: 'Aralık', type: 'text', placeholder: '10s', hint: 'Test aralığı (varsayılan 10s)', why: "Çok kısa aralık küçük cihazlarda CPU yükü ve log gürültüsü yaratır; çok uzun aralık kesintinin geç fark edilmesi demektir." },
                        { name: 'nw_thr_avg', label: 'Ortalama RTT Eşiği', type: 'text', placeholder: '100ms', hint: 'Yalnız icmp; aşılırsa down sayılır', why: "Eşik, hattı 'ayakta ama kullanılamaz' durumda da düşmüş saymanızı sağlar. Uydu/LTE gibi yüksek gecikmeli hatlarda düşük eşik sürekli flap'e yol açar." },
                        { name: 'nw_src', label: 'Kaynak Adres', type: 'text', validate: 'ip', placeholder: '10.240.0.2', hint: 'Probun çıkacağı yerel adres', why: "Kaynak adres router'da tanımlı değilse veya kaybolursa prob doğrudan <b>down</b> sayılır (resmi doküman). Belirli bir hattan çıkışı zorlamak için o hattın adresini yazın." }
                    ]
                },
                {
                    title: 'Aksiyon',
                    icon: 'fas fa-bolt',
                    info: 'Netwatch scriptleri yalnız read,write,test,reboot politikalarıyla çalışır.',
                    fields: [
                        { name: 'nw_action', label: 'Durum Değişince', type: 'select', options: [
                            { value: 'log', label: 'Log yaz', selected: true },
                            { value: 'route', label: 'Yorumu eşleşen rotayı devre dışı bırak / aç' }
                        ], why: "Rota aksiyonu, <code>check-gateway</code>'in göremediği durumlar (gateway ayakta, internet yok) için kullanılır. Yanlış yoruma bağlanırsa başka bir rotayı kapatıp kesinti yaratabilir; yorumları benzersiz tutun." },
                        { name: 'nw_route_comment', label: 'Rota Yorumu', type: 'text', requiredIf: { field: 'nw_action', in: ['route'] }, placeholder: 'ISP1-default', hint: '/ip route üzerindeki comment değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const host = cgEsc(data.nw_host || ''), name = cgEsc(data.nw_name || ''), type = cgEsc(data.nw_type || '');
            const port = cgEsc(data.nw_port || ''), interval = cgEsc(data.nw_interval || ''), thr = cgEsc(data.nw_thr_avg || '');
            const src = cgEsc(data.nw_src || ''), action = data.nw_action || 'log', rc = cgEsc(data.nw_route_comment || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — Netwatch\n# ========================================\n\n';
            let line = '/tool netwatch add host=' + host + ' type=' + type;
            if (name) line += ' name=' + name;
            if (type === 'tcp-conn' && port) line += ' port=' + port;
            if (interval) line += ' interval=' + interval;
            if (type === 'icmp' && thr) line += ' thr-avg=' + thr;
            if (src) line += ' src-address=' + src;
            if (action === 'route' && rc) {
                line += ' \\\n    down-script="/ip route set [find comment=\\"' + rc + '\\"] disabled=yes"';
                line += ' \\\n    up-script="/ip route set [find comment=\\"' + rc + '\\"] disabled=no"';
            } else {
                // ':log info message=test' biçimi resmi scheduler örneğinden
                line += ' \\\n    down-script=":log warning message=netwatch-down-' + host + '"';
                line += ' \\\n    up-script=":log info message=netwatch-up-' + host + '"';
            }
            c += line + '\n';
            c += '\n# Doğrulama:\n# /tool netwatch print\n# /log print where message~"netwatch"\n';
            return c;
        });
    }
};

// ── MikroTik: HotSpot (Captive Portal) ────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/authentication-authorization-accounting/hotspot-captive-portal/
//            (HotSpot / Profile / User Profile / User / Walled Garden özellik tabloları)
//            DHCP + pool: https://manual.mikrotik.com/docs/cli-reference/ip/dhcp-server/ , .../dhcp-server/network , .../ip/pool/
MikroTik.hotspot = {
    label: 'HotSpot',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-wifi',
                title: 'HotSpot / Captive Portal (MikroTik)',
                desc: '<code>/ip hotspot setup</code> sihirbazının etkileşimsiz karşılığı: adres, havuz, DHCP, hotspot profili, sunucu, kullanıcı profili ve kullanıcı.<br><code>/ip hotspot profile add hotspot-address=... dns-name=...</code><br><code>/ip hotspot add interface=... address-pool=... profile=...</code>'
            },
            sections: [
                {
                    title: 'Ağ',
                    icon: 'fas fa-network-wired',
                    warn: 'HotSpot, <code>/system device-mode</code> tarafından engellenmiş olabilir. HotSpot yalnız main routing table\'ı kullanır; aynı cihazda PCC ile birlikte çalışmaz.',
                    fields: [
                        { name: 'hs_iface', label: 'HotSpot Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether3', hint: 'Misafir ağının arayüzü (bridge olabilir)', why: "HotSpot bir bridge üzerinde çalışacaksa WAN arayüzü o bridge'in portu olmamalıdır (resmi doküman). Aksi hâlde internet tarafı da portala yönlendirilir." },
                        { name: 'hs_gw', label: 'Gateway Adresi', type: 'text', validate: 'cidr', required: true, placeholder: '10.5.50.1/24', hint: 'Arayüze atanacak adres (CIDR)', why: "Bu adres hem istemcilerin gateway'i hem <code>hotspot-address</code> olur. İstemci subnet'iyle uyuşmazsa login sayfası hiç açılmaz." },
                        { name: 'hs_pool', label: 'Adres Havuzu', type: 'text', validate: 'ip_range', required: true, placeholder: '10.5.50.2-10.5.50.254', hint: 'DHCP havuzu (başlangıç-bitiş)', why: "Havuz gateway adresini içermemelidir; içerirse bir istemciye gateway'in adresi verilir ve tüm segment kilitlenir." },
                        { name: 'hs_dns', label: 'İstemci DNS Sunucusu', type: 'text', validate: 'ip', placeholder: '10.5.50.1', hint: 'DHCP ile dağıtılacak DNS (boşsa gönderilmez)', why: "Portal yönlendirmesi DNS'e dayanır: istemci ad çözemezse tarayıcı hiçbir HTTP isteği yapmaz ve login sayfası görünmez. Router'ı DNS olarak veriyorsanız <code>/ip dns</code> altında <code>allow-remote-requests=yes</code> gerekir." },
                        { name: 'hs_masq', label: 'HotSpot ağını masquerade et', type: 'checkbox', checked: true, why: "Sihirbazın varsayılanı; özel adresli misafir ağının internete çıkması için gerekir. Üst katmanda NAT yapılıyorsa kapatın." }
                    ]
                },
                {
                    title: 'HotSpot Sunucusu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hs_name', label: 'Sunucu Adı', type: 'text', required: true, placeholder: 'hotspot1', hint: 'Profil adları bundan türetilir' },
                        { name: 'hs_dnsname', label: 'DNS Adı', type: 'text', validate: 'hostname', required: true, placeholder: 'login.example.net', hint: 'Login sayfasının adresi (FQDN)', why: "Bu ad statik DNS kaydı olarak otomatik eklenir ve login sayfasının URL'si olur. HTTPS login kullanacaksanız sertifikanın CN/SAN değeriyle aynı olmalıdır." },
                        { name: 'hs_loginby', label: 'Login Yöntemi', type: 'select', options: [
                            { value: 'http-chap,cookie', label: 'http-chap + cookie (varsayılan)', selected: true },
                            { value: 'https', label: 'https (sertifika gerekir)' },
                            { value: 'http-pap', label: 'http-pap (parola düz metin — önerilmez)' }
                        ], why: "<code>http-pap</code> kullanıcı adı ve parolayı ağda düz metin taşır. <code>https</code> için <code>ssl-certificate</code> tanımlanmalıdır, aksi hâlde login çalışmaz." }
                    ]
                },
                {
                    title: 'Kullanıcı Profili',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'hs_rate', label: 'Hız Limiti (rx/tx)', type: 'text', placeholder: '2M/10M', hint: 'Router açısından: rx = istemci upload, tx = istemci download', why: "Yön router'ın bakış açısıyladır; <code>512k/1M</code> istemciye 1M indirme, 512k yükleme verir. Yönleri karıştırmak kullanıcıların indirme hızını kısar." },
                        { name: 'hs_shared', label: 'Eşzamanlı Oturum', type: 'text', min: 1, max: 1000, placeholder: '1', hint: 'Aynı kullanıcı adıyla kaç cihaz (varsayılan 1)', why: "Değer büyüdükçe tek bir hesabın paylaşılması kolaylaşır; misafir ağında genelde 1-2 yeterlidir." }
                    ]
                },
                {
                    title: 'Kullanıcı ve Walled Garden',
                    icon: 'fas fa-user-plus',
                    fields: [
                        { name: 'hs_adduser', label: 'Yerel kullanıcı ekle', type: 'checkbox', checked: false },
                        { name: 'hs_user', label: 'Kullanıcı Adı', type: 'text', requiredIf: { field: 'hs_adduser', checked: true }, placeholder: 'misafir01', hint: 'HotSpot login adı' },
                        { name: 'hs_pass', label: 'Parola', type: 'text', requiredIf: { field: 'hs_adduser', checked: true }, placeholder: 'Misafir-2026!', hint: 'Export çıktısında gizlenir (sensitive)' },
                        { name: 'hs_wg', label: 'Walled Garden Host', type: 'text', placeholder: 'www.example.com', hint: 'Login olmadan erişilebilecek site (dst-host)', why: "Walled garden login öncesi erişimi açar; joker karakterli geniş bir desen (<code>*</code>) tüm portalı fiilen devre dışı bırakır." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.hs_iface || ''), gwS = cgEsc(data.hs_gw || ''), pool = cgEsc(data.hs_pool || '').replace(/\s+/g, '');
            const dns = cgEsc(data.hs_dns || ''), name = cgEsc(data.hs_name || ''), dnsName = cgEsc(data.hs_dnsname || '');
            const loginBy = cgEsc(data.hs_loginby || ''), rate = cgEsc(data.hs_rate || ''), shared = cgEsc(data.hs_shared || '');
            const user = cgEsc(data.hs_user || ''), pass = cgEsc(data.hs_pass || ''), wg = cgEsc(data.hs_wg || '');
            const cidr = cgMtCidr(data.hs_gw);
            let c = '# ========================================\n# MikroTik RouterOS 7 — HotSpot\n# ========================================\n\n';
            c += '/ip address\nadd address=' + gwS + ' interface=' + iface + '\n\n';
            c += '/ip pool\nadd name=' + name + '-pool ranges=' + pool + '\n\n';
            c += '/ip dhcp-server\nadd name=' + name + '-dhcp interface=' + iface + ' address-pool=' + name + '-pool\n';
            if (cidr) {
                c += '/ip dhcp-server network\nadd address=' + cidr.net + ' gateway=' + cidr.ip + (dns ? ' dns-server=' + dns : '') + '\n';
            }
            c += '\n/ip hotspot profile\nadd name=' + name + '-prof' + (cidr ? ' hotspot-address=' + cidr.ip : '') + ' dns-name=' + dnsName + ' login-by=' + loginBy + '\n\n';
            let up = 'add name=' + name + '-users';
            if (rate) up += ' rate-limit=' + rate;
            if (shared) up += ' shared-users=' + shared;
            c += '/ip hotspot user profile\n' + up + '\n\n';
            c += '/ip hotspot\nadd name=' + name + ' interface=' + iface + ' address-pool=' + name + '-pool profile=' + name + '-prof\n';
            if (data.hs_adduser === true && user && pass) {
                c += '\n/ip hotspot user\nadd name=' + user + ' password="' + pass + '" profile=' + name + '-users server=' + name + '\n';
            }
            if (wg) c += '\n/ip hotspot walled-garden\nadd dst-host=' + wg + '\n';
            if (data.hs_masq === true && cidr) {
                c += '\n/ip firewall nat\nadd chain=srcnat action=masquerade src-address=' + cidr.net + '\n';
            }
            c += '\n# Doğrulama:\n# /ip hotspot print\n# /ip hotspot active print\n# /ip hotspot host print\n# /ip dhcp-server lease print\n';
            return c;
        });
    }
};

// ── MikroTik: PPPoE (Client / Server) ─────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/virtual-private-networks/pppoe/
//            https://manual.mikrotik.com/docs/cli-reference/interface/pppoe-client/
//            https://manual.mikrotik.com/docs/cli-reference/interface/pppoe-server/server
MikroTik.pppoe = {
    label: 'PPPoE',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'PPPoE Client / Server (MikroTik)',
                desc: 'Client: ISP\'ye PPPoE ile bağlanır. Server: abonelere PPPoE oturumu sunar (havuz + PPP profili + secret + sunucu).<br><code>/interface pppoe-client add interface=... user=... password=...</code><br><code>/interface pppoe-server server add interface=... default-profile=...</code>'
            },
            configTypes: [
                { id: 'client', label: 'PPPoE Client', icon: 'fas fa-sign-in-alt', desc: 'ISP bağlantısı (WAN)', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'server', label: 'PPPoE Server', icon: 'fas fa-server', desc: 'Abone erişim sunucusu', badge: { text: 'ISP', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Client Ayarları',
                    icon: 'fas fa-sign-in-alt',
                    showFor: ['client'],
                    fields: [
                        { name: 'pc_iface', label: 'Fiziksel Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: 'Modem/ONT\'ye bağlı port veya VLAN', why: "ISP PPPoE'yi VLAN etiketiyle istiyorsa önce VLAN arayüzü oluşturup onu seçin; fiziksel porta yazmak PADI paketlerinin cevapsız kalmasına yol açar." },
                        { name: 'pc_name', label: 'PPPoE Arayüz Adı', type: 'text', required: true, placeholder: 'pppoe-out1', hint: 'NAT ve firewall kurallarında bu ad kullanılır' },
                        { name: 'pc_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'abone@isp.example', hint: 'ISP\'nin verdiği kullanıcı' },
                        { name: 'pc_pass', label: 'Parola', type: 'text', required: true, placeholder: 'IspParola-2026', hint: 'ISP\'nin verdiği parola', why: "Parola export'ta gizlenir ama <code>show-sensitive</code> ile görünür; yedek dosyalarını buna göre saklayın." },
                        { name: 'pc_service', label: 'Service Name', type: 'text', placeholder: 'internet', hint: 'ISP istiyorsa (genelde boş)' },
                        { name: 'pc_defroute', label: 'Default route ekle', type: 'checkbox', checked: true, why: "Kapalıysa oturum kurulur ama internet trafiği bu arayüzden çıkmaz; yedek hat senaryosunda <code>default-route-distance</code> ile önceliği ayarlayın." },
                        { name: 'pc_distance', label: 'Default Route Distance', type: 'text', min: 0, max: 255, placeholder: '1', hint: 'Yedek hat ise büyük değer' },
                        { name: 'pc_peerdns', label: 'ISP DNS\'ini kullan', type: 'checkbox', checked: true },
                        { name: 'pc_masq', label: 'PPPoE arayüzü için masquerade ekle', type: 'checkbox', checked: true, why: "LAN'ın internete çıkması için srcnat gerekir; <code>out-interface</code> fiziksel port değil PPPoE arayüzü olmalıdır." }
                    ]
                },
                {
                    title: 'Server Ayarları',
                    icon: 'fas fa-server',
                    showFor: ['server'],
                    fields: [
                        { name: 'ps_iface', label: 'Abone Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ether3', hint: 'PPPoE isteklerinin geldiği port', why: "Bu arayüzde IP adresi olması gerekmez; abonelere adres PPP profilinden verilir. Aynı arayüzde DHCP sunucusu açık kalırsa aboneler PPPoE yerine DHCP ile adres alabilir." },
                        { name: 'ps_local', label: 'Sunucu (Local) Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'PPP profilinin local-address değeri' },
                        { name: 'ps_pool', label: 'Abone Havuzu', type: 'text', validate: 'ip_range', required: true, placeholder: '10.0.0.2-10.0.0.254', hint: 'remote-address havuzu', why: "Havuz local adresi içermemelidir; havuz tükendiğinde yeni aboneler bağlanamaz ve log'da yalnızca IP atanamadı mesajı görünür." },
                        { name: 'ps_service', label: 'Service Name', type: 'text', placeholder: 'pppoeservice', hint: 'Boşsa tüm service-name istekleri' },
                        { name: 'ps_onesession', label: 'Host başına tek oturum', type: 'checkbox', checked: true, why: "Aynı MAC'ten gelen ikinci oturum reddedilir; kapalıyken kopan bağlantılar askıda oturum bırakıp havuzu tüketebilir." },
                        { name: 'ps_addsecret', label: 'Örnek abone (secret) ekle', type: 'checkbox', checked: false },
                        { name: 'ps_user', label: 'Abone Kullanıcı Adı', type: 'text', requiredIf: { field: 'ps_addsecret', checked: true }, placeholder: 'abone01' },
                        { name: 'ps_pass', label: 'Abone Parolası', type: 'text', requiredIf: { field: 'ps_addsecret', checked: true }, placeholder: 'Abone-Parola1' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'client';
            let c = '# ========================================\n# MikroTik RouterOS 7 — PPPoE ' + (t === 'client' ? 'Client' : 'Server') + '\n# ========================================\n\n';
            if (t === 'client') {
                const iface = cgEsc(data.pc_iface || ''), name = cgEsc(data.pc_name || ''), user = cgEsc(data.pc_user || '');
                const pass = cgEsc(data.pc_pass || ''), svc = cgEsc(data.pc_service || ''), dist = cgEsc(data.pc_distance || '');
                let l = '/interface pppoe-client\nadd name=' + name + ' interface=' + iface + ' user=' + user + ' password="' + pass + '"';
                if (svc) l += ' service-name=' + svc;
                l += ' add-default-route=' + (data.pc_defroute === true ? 'yes' : 'no');
                if (data.pc_defroute === true && dist) l += ' default-route-distance=' + dist;
                l += ' use-peer-dns=' + (data.pc_peerdns === true ? 'yes' : 'no') + ' disabled=no';
                c += l + '\n';
                if (data.pc_masq === true) c += '\n/ip firewall nat\nadd chain=srcnat action=masquerade out-interface=' + name + '\n';
                c += '\n# Doğrulama:\n# /interface pppoe-client print\n# /interface pppoe-client monitor ' + name + '\n# /ip route print where dst-address=0.0.0.0/0\n';
            } else {
                const iface = cgEsc(data.ps_iface || ''), local = cgEsc(data.ps_local || ''), pool = cgEsc(data.ps_pool || '').replace(/\s+/g, '');
                const svc = cgEsc(data.ps_service || ''), user = cgEsc(data.ps_user || ''), pass = cgEsc(data.ps_pass || '');
                c += '/ip pool\nadd name=pppoe-pool ranges=' + pool + '\n\n';
                c += '/ppp profile\nadd name=pppoe-profile local-address=' + local + ' remote-address=pppoe-pool\n\n';
                if (data.ps_addsecret === true && user && pass) {
                    c += '/ppp secret\nadd name=' + user + ' password="' + pass + '" profile=pppoe-profile service=pppoe\n\n';
                }
                let l = '/interface pppoe-server server\nadd interface=' + iface + ' default-profile=pppoe-profile';
                if (svc) l += ' service-name=' + svc;
                if (data.ps_onesession === true) l += ' one-session-per-host=yes';
                l += ' disabled=no';
                c += l + '\n';
                c += '\n# Doğrulama:\n# /interface pppoe-server server print\n# /interface pppoe-server print\n# /ppp secret print\n';
            }
            return c;
        });
    }
};

// ── MikroTik: NTP Client + Saat Dilimi ───────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/system-information-and-utilities/ntp
//            https://manual.mikrotik.com/docs/cli-reference/system/clock/ (time-zone-name, time-zone-autodetect)
MikroTik.ntp = {
    label: 'NTP / Saat',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP Client ve Saat Dilimi (MikroTik RouterOS 7)',
                desc: 'RouterOS 7 dahili NTP istemcisi; isteğe bağlı olarak LAN\'a NTP sunucusu olarak hizmet verir.<br><code>/system ntp client set enabled=yes</code><br><code>/system ntp client servers add address=&lt;sunucu&gt;</code>'
            },
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp1', label: 'NTP Sunucusu 1', type: 'text', required: true, placeholder: '0.pool.ntp.org', hint: 'IP veya FQDN', why: "FQDN kullanılırsa her istekte çözülür; <code>/ip dns</code> tanımlı değilse saat hiç senkronize olmaz. Saat yanlışsa sertifika doğrulaması, IPsec ve log zaman damgaları bozulur." },
                        { name: 'ntp2', label: 'NTP Sunucusu 2', type: 'text', placeholder: '1.pool.ntp.org', hint: 'Yedek sunucu', why: "Tek sunucu tek hata noktasıdır ve yanlış saat veren bir sunucuyu tespit etmek için karşılaştırma imkânı bırakmaz." },
                        { name: 'tz', label: 'Saat Dilimi', type: 'text', placeholder: 'Europe/Istanbul', hint: 'time-zone-name (boşsa otomatik algılama kalır)', why: "Otomatik algılama cihazın genel IP'sine göre tahmin yapar; NAT/VPN arkasında yanlış bölge seçebilir ve zamanlanmış görevler yanlış saatte çalışır." },
                        { name: 'ntp_server', label: 'LAN\'a NTP sunucusu olarak hizmet ver', type: 'checkbox', checked: false, why: "Sunucu modu açılınca UDP 123 dinlenir; WAN tarafından erişimi firewall input zincirinde engellemezseniz cihaz NTP yansıtma saldırılarında kullanılabilir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const n1 = cgEsc(data.ntp1 || ''), n2 = cgEsc(data.ntp2 || ''), tz = cgEsc(data.tz || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — NTP\n# ========================================\n\n';
            c += '/system ntp client\nset enabled=yes\n\n/system ntp client servers\nadd address=' + n1 + '\n';
            if (n2) c += 'add address=' + n2 + '\n';
            if (tz) c += '\n/system clock\nset time-zone-autodetect=no time-zone-name=' + tz + '\n';
            if (data.ntp_server === true) c += '\n/system ntp server\nset enabled=yes\n';
            c += '\n# Doğrulama:\n# /system ntp client print\n# /system ntp monitor-peers\n# /system clock print\n';
            return c;
        });
    }
};

// ── MikroTik: DNS ─────────────────────────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/network-management/dns
//            https://manual.mikrotik.com/docs/cli-reference/ip/dns/ (servers, allow-remote-requests, use-doh-server, verify-doh-cert)
//            input drop kuralı: https://manual.mikrotik.com/docs/getting-started/securing-your-router
MikroTik.dns = {
    label: 'DNS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'DNS Resolver (MikroTik)',
                desc: 'Upstream DNS sunucuları, isteğe bağlı DoH, LAN\'a DNS hizmeti ve statik kayıtlar.<br><code>/ip dns set servers=... allow-remote-requests=...</code><br><code>/ip dns static add name=... address=...</code>'
            },
            sections: [
                {
                    title: 'Resolver',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'dns_servers', label: 'Upstream Sunucular', type: 'text', required: true, placeholder: '192.0.2.53,198.51.100.53', hint: 'Virgülle ayrılmış IP listesi', why: "PPPoE/DHCP'den gelen dinamik sunucular bunlara eklenir (dynamic-servers); tamamen kendi sunucunuzu kullanmak istiyorsanız istemci tarafında <code>use-peer-dns=no</code> yapın." },
                        { name: 'dns_remote', label: 'LAN\'a DNS hizmeti ver', type: 'select', options: [
                            { value: 'no', label: 'Hayır — yalnız router kendisi kullanır', selected: true },
                            { value: 'yes', label: 'Evet — istemciler router\'ı DNS olarak kullanır' }
                        ], why: "<code>allow-remote-requests=yes</code> router'ı açık resolver yapar; WAN'dan UDP/TCP 53 engellenmezse cihaz DNS amplification saldırılarının aracı olur (MikroTik sertleştirme rehberinin ilk maddelerinden)." },
                        { name: 'dns_wan', label: 'WAN Arayüzü (53 engeli için)', type: 'text', validate: 'iface', requiredIf: { field: 'dns_remote', in: ['yes'] }, placeholder: 'ether1', hint: 'Bu arayüzden gelen DNS istekleri düşürülür' },
                        { name: 'dns_doh', label: 'DoH URL', type: 'text', placeholder: 'https://dns.example.net/dns-query', hint: 'DNS-over-HTTPS (boşsa kullanılmaz)', why: "DoH sunucusunun adını çözmek için <code>servers</code> listesinde en az bir klasik sunucu kalmalıdır. <code>verify-doh-cert=yes</code> için ilgili kök sertifikanın cihazda yüklü olması gerekir, yoksa tüm çözümleme durur." }
                    ]
                },
                {
                    title: 'Statik Kayıt',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'st_name', label: 'Ad', type: 'text', validate: 'hostname', placeholder: 'nas.lan.example', hint: 'Statik A kaydı (ikisi de doluysa eklenir)' },
                        { name: 'st_addr', label: 'Adres', type: 'text', validate: 'ip', placeholder: '192.168.88.10', hint: 'Kaydın IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const servers = cgMtList(data.dns_servers).map(cgEsc).join(','), remote = cgEsc(data.dns_remote || '');
            const wan = cgEsc(data.dns_wan || ''), doh = cgEsc(data.dns_doh || '');
            const stName = cgEsc(data.st_name || ''), stAddr = cgEsc(data.st_addr || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — DNS\n# ========================================\n\n';
            c += '/ip dns\nset servers=' + servers + ' allow-remote-requests=' + remote + '\n';
            if (doh) c += 'set use-doh-server=' + doh + ' verify-doh-cert=yes\n';
            if (stName && stAddr) c += '\n/ip dns static\nadd name=' + stName + ' address=' + stAddr + '\n';
            if (remote === 'yes' && wan) {
                c += '\n# WAN\'dan gelen DNS isteklerini düşür (mevcut input kurallarınızdaki accept\'lerden ÖNCE olmalı)\n';
                c += '/ip firewall filter\n';
                c += 'add chain=input in-interface=' + wan + ' protocol=udp dst-port=53 action=drop comment="drop WAN DNS udp"\n';
                c += 'add chain=input in-interface=' + wan + ' protocol=tcp dst-port=53 action=drop comment="drop WAN DNS tcp"\n';
            }
            c += '\n# Doğrulama:\n# /ip dns print\n# /ip dns static print\n# /ip dns cache print\n';
            return c;
        });
    }
};

// ── MikroTik: Yönetim Sertleştirme (kullanıcı + servisler) ───────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/getting-started/securing-your-router (komutlar birebir)
//            https://manual.mikrotik.com/docs/system-information-and-utilities/services
//            https://manual.mikrotik.com/docs/management-tools/mac-server
MikroTik.hardening = {
    label: 'Yönetim Sertleştirme',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Kullanıcı ve Servis Sertleştirme (MikroTik)',
                desc: 'Resmi "Securing your router" rehberindeki adımlar: yeni yönetici, admin\'i kapatma, gereksiz servisleri kapatma, MAC erişimi ve komşu keşfini kısıtlama.<br><code>/user add name=... group=full</code><br><code>/ip service disable telnet,ftp,www,api</code>'
            },
            sections: [
                {
                    title: 'Yönetici Hesabı',
                    icon: 'fas fa-user-plus',
                    warn: 'Önce yeni kullanıcıyla ayrı bir oturumda giriş yapabildiğinizi doğrulayın, sonra <code>admin</code>\'i kapatın. Aksi hâlde cihaza erişiminizi kaybedersiniz.',
                    fields: [
                        { name: 'hd_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin', hint: 'admin yerine kullanılacak hesap', why: "Varsayılan <code>admin</code> adı brute-force denemelerinin ilk hedefidir; tahmin edilmesi zor bir ad bu saldırıların büyük kısmını boşa çıkarır." },
                        { name: 'hd_pass', label: 'Parola', type: 'text', required: true, placeholder: 'Uzun-Rastgele-Parola-2026', hint: 'Uzun ve rastgele', why: "RouterOS parola karmaşıklığı zorlamaz; kısa parolalar WinBox/SSH üzerinden hızla kırılır. Export çıktısına parola yazılmaz, bu yüzden bir parola kasasında saklayın." },
                        { name: 'hd_group', label: 'Grup', type: 'select', options: [
                            { value: 'full', label: 'full — tam yetki', selected: true },
                            { value: 'write', label: 'write — yapılandırma (kullanıcı yönetimi hariç)' },
                            { value: 'read', label: 'read — salt okuma' }
                        ] },
                        { name: 'hd_mgmt', label: 'Yönetim Ağı', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.88.0/24', hint: 'Kullanıcı ve servislerin kabul edileceği kaynak ağ', why: "Kullanıcıya <code>address</code> verilmesi başka ağlardan doğru parolayla bile girişi engeller. Ağı yanlış yazmak sizi dışarıda bırakır — önce ayrı oturumla test edin." },
                        { name: 'hd_disable_admin', label: 'admin kullanıcısını devre dışı bırak', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Servisler',
                    icon: 'fas fa-power-off',
                    fields: [
                        { name: 'hd_svc_off', label: 'telnet, ftp, www, api servislerini kapat', type: 'checkbox', checked: true, why: "Bu servisler kimlik bilgisini şifresiz taşır ya da nadiren kullanılır; açık kalan her servis ek saldırı yüzeyidir." },
                        { name: 'hd_ssh_port', label: 'SSH Portu', type: 'text', validate: 'port', placeholder: '2200', hint: 'Boşsa 22 kalır', why: "Port değiştirmek güvenlik sağlamaz ama otomatik tarayıcı gürültüsünü azaltır; firewall kurallarınızı yeni porta göre güncellemeyi unutmayın." },
                        { name: 'hd_strong', label: 'SSH strong-crypto', type: 'checkbox', checked: true, why: "Zayıf şifre ve anahtar değişim algoritmalarını kapatır; çok eski SSH istemcileri bağlanamayabilir." },
                        { name: 'hd_misc_off', label: 'bandwidth-server, proxy, socks, upnp kapat', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Katman 2 Erişim',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'hd_mac_off', label: 'MAC-Telnet / MAC-WinBox / MAC-ping kapat', type: 'checkbox', checked: true, why: "MAC erişimi IP gerektirmeden aynı L2'deki herkese giriş ekranı açar. Kapatınca IP yapılandırması bozulduğunda kurtarma yolunuz konsol olur." },
                        { name: 'hd_nd_off', label: 'Neighbor discovery kapat', type: 'checkbox', checked: true, why: "MNDP/CDP/LLDP; model, sürüm ve kimlik bilgisini ağa yayınlar. Yalnız güvenilir arayüzlerde gerekiyorsa bir interface list ile sınırlayın." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const user = cgEsc(data.hd_user || ''), pass = cgEsc(data.hd_pass || ''), group = cgEsc(data.hd_group || '');
            const mgmt = cgEsc(data.hd_mgmt || ''), sshPort = cgEsc(data.hd_ssh_port || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — Yönetim Sertleştirme\n# ========================================\n\n';
            c += '/user\nadd name=' + user + ' password="' + pass + '" group=' + group + ' address=' + mgmt + '\n';
            if (data.hd_disable_admin === true) c += '# UYARI: yeni kullanıcıyla girişi test etmeden bir sonraki satırı çalıştırmayın\ndisable admin\n';
            c += '\n/ip service\n';
            if (data.hd_svc_off === true) c += 'disable telnet,ftp,www,api\n';
            if (sshPort) c += 'set ssh port=' + sshPort + '\n';
            c += 'set ssh address=' + mgmt + '\nset winbox address=' + mgmt + '\n';
            if (data.hd_strong === true) c += '\n/ip ssh\nset strong-crypto=yes\n';
            if (data.hd_mac_off === true) {
                c += '\n/tool mac-server\nset allowed-interface-list=none\n';
                c += '/tool mac-server mac-winbox\nset allowed-interface-list=none\n';
                c += '/tool mac-server ping\nset enabled=no\n';
            }
            if (data.hd_nd_off === true) c += '\n/ip neighbor discovery-settings\nset discover-interface-list=none\n';
            if (data.hd_misc_off === true) {
                c += '\n/tool bandwidth-server\nset enabled=no\n/ip proxy\nset enabled=no\n/ip socks\nset enabled=no\n/ip upnp\nset enabled=no\n';
            }
            c += '\n# Doğrulama:\n# /user print\n# /ip service print\n# /tool mac-server print\n# /ip neighbor discovery-settings print\n';
            return c;
        });
    }
};

// ── MikroTik: VRRP ────────────────────────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/high-availability-solutions/vrrp
//            https://manual.mikrotik.com/docs/high-availability-solutions/user-guides/vrrp-configuration-examples
//            https://manual.mikrotik.com/docs/cli-reference/interface/vrrp (argüman tablosu)
MikroTik.vrrp = {
    label: 'VRRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'VRRP — Yedekli Gateway (MikroTik)',
                desc: 'İki router aynı sanal IP\'yi paylaşır; master düşünce backup devralır. Sanal IP, VRRP arayüzüne /32 olarak eklenir.<br><code>/interface vrrp add interface=ether1 vrid=49 priority=254</code><br><code>/ip address add address=192.168.51.1/32 interface=vrrp1</code>'
            },
            configTypes: [
                { id: 'master', label: 'Master', icon: 'fas fa-crown', desc: 'Yüksek öncelik', badge: { text: 'Birincil', cls: 'recommended' } },
                { id: 'backup', label: 'Backup', icon: 'fas fa-clone', desc: 'Düşük öncelik', badge: { text: 'Yedek', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'VRRP',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'vr_iface', label: 'Fiziksel Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'ether1', hint: 'LAN arayüzü (bridge olabilir)', why: "VRRP arayüzü bu arayüzün üzerine kurulur; iki router'da aynı L2 segmentinde olmalıdır. Farklı VLAN'larda kalırsa ikisi de master olur ve aynı sanal IP iki yerden cevap verir." },
                        { name: 'vr_real', label: 'Gerçek Adres', type: 'text', validate: 'cidr', placeholder: '192.168.51.2/24', hint: 'Fiziksel arayüzün kendi adresi (zaten varsa boş bırakın)', why: "Her router'ın fiziksel arayüzünde kendi benzersiz adresi olmalıdır; sanal IP bunun yerine geçmez." },
                        { name: 'vr_name', label: 'VRRP Arayüz Adı', type: 'text', required: true, placeholder: 'vrrp1', hint: 'Sanal IP bu arayüze eklenir' },
                        { name: 'vr_vrid', label: 'VRID', type: 'text', required: true, min: 1, max: 255, placeholder: '49', hint: 'İki router\'da aynı', why: "VRID sanal MAC'i belirler; aynı segmentteki başka bir VRRP grubuyla çakışırsa sanal MAC çakışır ve trafik iki grup arasında gidip gelir." },
                        { name: 'vr_vip', label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.51.1', hint: 'İstemcilerin gateway\'i (/32 eklenir)', why: "Resmi örneklerde sanal IP VRRP arayüzüne <b>/32</b> olarak eklenir. Gerçek subnet maskesiyle eklemek aynı ağa iki bağlı rota oluşturur." },
                        { name: 'vr_prio', label: 'Öncelik', type: 'text', min: 1, max: 254, placeholder: '254', hint: 'Master için yüksek (backup boş bırakabilir; varsayılan 100)', why: "Eşit öncelikte master seçimi IP adresine göre yapılır ve tahmin edilemez; master'a açıkça yüksek değer verin." },
                        { name: 'vr_preempt', label: 'Preemption (yüksek öncelikli geri alsın)', type: 'checkbox', checked: true, why: "Kapalıyken düzelen master rolü geri almaz; bu, kararsız bir cihazın sürekli rol değiştirmesini (flapping) önler ama trafiğin tercih edilmeyen cihazda kalmasına neden olur." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const role = data._cgtype || 'master';
            const iface = cgEsc(data.vr_iface || ''), real = cgEsc(data.vr_real || ''), name = cgEsc(data.vr_name || '');
            const vrid = cgEsc(data.vr_vrid || ''), vip = cgEsc(data.vr_vip || ''), prio = cgEsc(data.vr_prio || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — VRRP (' + (role === 'master' ? 'Master' : 'Backup') + ')\n# ========================================\n\n';
            if (real) c += '/ip address\nadd address=' + real + ' interface=' + iface + '\n\n';
            let l = '/interface vrrp\nadd name=' + name + ' interface=' + iface + ' vrid=' + vrid;
            if (prio) l += ' priority=' + prio;
            if (data.vr_preempt !== true) l += ' preemption-mode=no';
            c += l + '\n\n';
            c += '/ip address\nadd address=' + vip + '/32 interface=' + name + '\n';
            c += '\n# Doğrulama:\n# /interface vrrp print detail\n# /ip address print\n';
            return c;
        });
    }
};

// ── MikroTik: Bonding ─────────────────────────────────────────────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/high-availability-solutions/bonding
//            https://manual.mikrotik.com/docs/cli-reference/interface/bonding/ (mode, transmit-hash-policy, lacp-rate, min-links, primary)
MikroTik.bonding = {
    label: 'Bonding / LACP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Bonding / LACP (MikroTik)',
                desc: 'Birden fazla fiziksel portu tek mantıksal arayüzde birleştirir. 802.3ad (LACP), balance-xor ve active-backup modları donanımda hızlandırılabilir.<br><code>/interface bonding add name=bond1 slaves=ether1,ether2 mode=802.3ad</code>'
            },
            sections: [
                {
                    title: 'Bond',
                    icon: 'fas fa-link',
                    warn: 'Slave portlar başka bir bridge\'in portu olmamalı ve üzerlerinde IP adresi bulunmamalıdır.',
                    fields: [
                        { name: 'bd_name', label: 'Bond Adı', type: 'text', required: true, placeholder: 'bond1' },
                        { name: 'bd_slaves', label: 'Slave Portlar', type: 'text', required: true, placeholder: 'ether1,ether2', hint: 'Virgülle ayrılmış', why: "802.3ad'de tüm üyeler aynı hız ve duplex'te olmalıdır; farklı hızdaki port gruba alınmaz ve kapasite sessizce düşer." },
                        { name: 'bd_mode', label: 'Mod', type: 'select', options: [
                            { value: '802.3ad', label: '802.3ad (LACP)', selected: true },
                            { value: 'active-backup', label: 'active-backup' },
                            { value: 'balance-xor', label: 'balance-xor (statik LAG)' }
                        ], why: "Karşı switch LACP konuşmuyorsa 802.3ad link kurmaz; statik port-channel için balance-xor kullanın. active-backup switch tarafında yapılandırma gerektirmez." },
                        { name: 'bd_hash', label: 'Transmit Hash', type: 'select', options: [
                            { value: 'layer-2-and-3', label: 'layer-2-and-3 (802.3ad uyumlu)', selected: true },
                            { value: 'layer-3-and-4', label: 'layer-3-and-4 (daha dengeli, tam uyumlu değil)' },
                            { value: 'layer-2', label: 'layer-2' }
                        ], hint: '802.3ad ve balance-xor için', why: "layer-2 tek bir gateway'e giden tüm trafiği tek porta koyar. Donanım offload açıkken bazı switch çiplerinde bu ayarın etkisi yoktur (resmi doküman)." },
                        { name: 'bd_lacp_rate', label: 'LACP Rate', type: 'select', options: [
                            { value: '30secs', label: '30secs (varsayılan)', selected: true },
                            { value: '1sec', label: '1sec (hızlı algılama)' }
                        ], hint: 'Yalnız 802.3ad' },
                        { name: 'bd_primary', label: 'Primary Port', type: 'text', validate: 'iface', requiredIf: { field: 'bd_mode', in: ['active-backup'] }, placeholder: 'ether1', hint: 'active-backup için tercih edilen port' },
                        { name: 'bd_minlinks', label: 'min-links', type: 'text', min: 1, max: 32, placeholder: '1', hint: 'Bond\'un up olması için gereken asgari aktif port' },
                        { name: 'bd_ip', label: 'IP Adresi', type: 'text', validate: 'cidr', placeholder: '172.24.0.1/24', hint: 'Bond arayüzüne (boşsa eklenmez)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const name = cgEsc(data.bd_name || ''), slaves = cgMtList(data.bd_slaves).map(cgEsc).join(',');
            const mode = cgEsc(data.bd_mode || ''), hash = cgEsc(data.bd_hash || ''), rate = cgEsc(data.bd_lacp_rate || '');
            const primary = cgEsc(data.bd_primary || ''), minl = cgEsc(data.bd_minlinks || ''), ip = cgEsc(data.bd_ip || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — Bonding (' + mode + ')\n# ========================================\n\n';
            let l = '/interface bonding\nadd name=' + name + ' slaves=' + slaves + ' mode=' + mode + ' link-monitoring=mii';
            if (mode === '802.3ad' || mode === 'balance-xor') l += ' transmit-hash-policy=' + hash;
            if (mode === '802.3ad') l += ' lacp-rate=' + rate;
            if (mode === 'active-backup' && primary) l += ' primary=' + primary;
            if (minl) l += ' min-links=' + minl;
            c += l + '\n';
            if (ip) c += '\n/ip address\nadd address=' + ip + ' interface=' + name + '\n';
            c += '\n# Doğrulama:\n# /interface bonding print\n# /interface bonding monitor [find]\n# /interface bonding monitor-slaves ' + name + '\n';
            return c;
        });
    }
};

// ── MikroTik: Otomatik Yedek (backup + export + scheduler) ───────────────────
// Sözdizimi: https://manual.mikrotik.com/docs/system-information-and-utilities/scheduler (e-mail backup örneği)
//            https://manual.mikrotik.com/docs/getting-started/configuration-management/backup (/system backup save name= password=)
//            https://manual.mikrotik.com/docs/getting-started/configuration-management/ (/export file=)
//            https://manual.mikrotik.com/docs/cli-reference/tool/e-mail/ (server, port, tls, from, user, password)
MikroTik.backup = {
    label: 'Otomatik Yedek',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-save',
                title: 'Zamanlanmış Yedek — backup + export (MikroTik)',
                desc: 'Bir script ikili yedek (.backup) ve metin export (.rsc) üretir; scheduler bunu periyodik çalıştırır, isteğe bağlı e-posta ile gönderir.<br><code>/system backup save name=... password=...</code><br><code>/system scheduler add interval=1d on-event=...</code>'
            },
            sections: [
                {
                    title: 'Yedek',
                    icon: 'fas fa-save',
                    fields: [
                        { name: 'bk_name', label: 'Dosya Adı', type: 'text', required: true, placeholder: 'auto-backup', hint: 'Her çalışmada üzerine yazılır', why: "Sabit ad disk dolmasını önler ama yalnız son yedeği tutar; bozuk bir config yedeklendikten sonra geri dönülecek eski kopya kalmaz. Dosyaları düzenli olarak cihaz dışına alın." },
                        { name: 'bk_pass', label: 'Yedek Parolası', type: 'text', placeholder: 'Yedek-Sifresi-2026', hint: '.backup dosyasını şifreler', why: "Yedek dosyası kullanıcı parola özetlerini ve anahtarları içerir; şifresiz yedek, ele geçirilirse cihazın tüm sırlarını verir. Parola script kaynağında düz metin durur." },
                        { name: 'bk_export', label: 'Metin export (.rsc) de al', type: 'checkbox', checked: true, why: "Export farklı RouterOS sürümüne/cihaza taşınabilir ve diff alınabilir; ikili yedek yalnız aynı cihaz ve sürüme geri yüklenmelidir. Export parolaları içermez." },
                        { name: 'bk_interval', label: 'Aralık', type: 'select', options: [
                            { value: '1d', label: 'Günlük', selected: true },
                            { value: '7d', label: 'Haftalık' }
                        ] },
                        { name: 'bk_start', label: 'Başlangıç Saati', type: 'text', placeholder: '03:00:00', hint: 'hh:mm:ss (boşsa hemen başlar)', why: "Saat NTP ile senkronize değilse görev beklenmedik saatte çalışır; yoğun saatte alınan yedek küçük cihazlarda CPU sıçraması yaratır." }
                    ]
                },
                {
                    title: 'E-posta',
                    icon: 'fas fa-envelope',
                    info: 'İsteğe bağlı. Parola ve yedek dosyası e-posta ile taşınacağı için TLS kullanın.',
                    fields: [
                        { name: 'bk_mail', label: 'Yedeği e-posta ile gönder', type: 'checkbox', checked: false },
                        { name: 'bk_smtp', label: 'SMTP Sunucusu', type: 'text', validate: 'ip', requiredIf: { field: 'bk_mail', checked: true }, placeholder: '192.0.2.25', hint: 'IP adresi' },
                        { name: 'bk_smtp_port', label: 'SMTP Portu', type: 'text', validate: 'port', placeholder: '587', hint: 'Boşsa varsayılan' },
                        { name: 'bk_tls', label: 'TLS', type: 'select', options: [
                            { value: 'starttls', label: 'starttls', selected: true },
                            { value: 'yes', label: 'yes (implicit TLS)' },
                            { value: 'no', label: 'no (şifresiz — önerilmez)' }
                        ], why: "<code>tls=no</code> SMTP kimlik bilgisini ve yedek dosyasını ağda açık taşır." },
                        { name: 'bk_from', label: 'Gönderen', type: 'text', requiredIf: { field: 'bk_mail', checked: true }, placeholder: 'router@example.net' },
                        { name: 'bk_to', label: 'Alıcı', type: 'text', requiredIf: { field: 'bk_mail', checked: true }, placeholder: 'noc@example.net' },
                        { name: 'bk_smtp_user', label: 'SMTP Kullanıcı', type: 'text', placeholder: 'router@example.net' },
                        { name: 'bk_smtp_pass', label: 'SMTP Parola', type: 'text', placeholder: 'SmtpParola-1' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const name = cgEsc(data.bk_name || ''), pass = cgEsc(data.bk_pass || ''), interval = cgEsc(data.bk_interval || '');
            const start = cgEsc(data.bk_start || ''), mail = data.bk_mail === true;
            const smtp = cgEsc(data.bk_smtp || ''), port = cgEsc(data.bk_smtp_port || ''), tls = cgEsc(data.bk_tls || '');
            const from = cgEsc(data.bk_from || ''), to = cgEsc(data.bk_to || '');
            const su = cgEsc(data.bk_smtp_user || ''), sp = cgEsc(data.bk_smtp_pass || '');
            let c = '# ========================================\n# MikroTik RouterOS 7 — Zamanlanmış Yedek\n# ========================================\n\n';
            if (mail && smtp) {
                let e = '/tool e-mail\nset server=' + smtp;
                if (port) e += ' port=' + port;
                e += ' tls=' + tls;
                if (from) e += ' from=' + from;
                if (su) e += ' user=' + su;
                if (sp) e += ' password="' + sp + '"';
                c += e + '\n\n';
            }
            if (!pass) c += '# UYARI: yedek parolası boş — .backup dosyası şifrelenmeden kaydedilecek\n';
            let src = '/system backup save name=' + name + (pass ? ' password=' + pass : ' dont-encrypt=yes');
            if (data.bk_export === true) src += '; /export file=' + name;
            if (mail && to) {
                src += '; /tool e-mail send to=\\"' + to + '\\" subject=\\"RouterOS yedek ' + name + '\\" file=' + name + '.backup';
            }
            c += '/system script\nadd name=' + name + '-script source="' + src + '"\n\n';
            let s = '/system scheduler\nadd name=' + name + '-sched interval=' + interval + ' on-event=' + name + '-script';
            if (start) s += ' start-time=' + start;
            c += s + '\n';
            c += '\n# Doğrulama:\n# /system script print\n# /system scheduler print\n# /file print\n';
            return c;
        });
    }
};
