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
                        { name: 'wan_ip', why: "RouterOS adresi CIDR ile ister (<code>/24</code>); prefix yazmayı unutursanız adres /32 olarak eklenir, cihaz hiçbir komşuyu göremez ve bağlantı anında kopar.", label: 'IP Adresi / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1/24', hint: 'CIDR formatında (örn: 192.168.1.1/24)' },
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
                        { name: 'ip_address', why: "RouterOS adresi mutlaka CIDR ile ister; <code>/24</code> yazmadan girilen adres /32 kabul edilir, komşuluk kurulmaz. Uzaktan bağlıysanız yanlış adres girmek oturumunuzu anında koparır.", label: 'IP Adresi (CIDR)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1/24', hint: 'Örn: 192.168.1.1/24' },
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
                        { name: 'wg_address', why: "Tünel adresi iki uçta aynı subnet'te ama farklı adresler olmalı; çakışma veya farklı subnet kullanımı el sıkışma başarılı olsa bile veri akışını imkânsız kılar.", label: 'WireGuard Yerel IP (CIDR)', type: 'text', required: true, placeholder: '10.10.0.1/24', hint: 'VPN tünel arayüzüne atanacak IP' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'peer_pubkey', why: "Public key karşı ucun <b>public</b> anahtarı olmalıdır, kendi anahtarınız değil; yanlış anahtarda el sıkışma sessizce başarısız olur ve log'da yalnızca handshake tekrarları görünür.", label: 'Peer Public Key', type: 'text', validate: 'ip', required: true, placeholder: 'PEER_PUBLIC_KEY_BASE64=', hint: 'Uzak tarafın WireGuard public key değeri' },
                        { name: 'allowed_address', why: "Allowed-address hem routing hem de kabul filtresidir: burada listelenmeyen kaynaklardan gelen paketler <b>düşürülür</b>. Çok dar yazmak trafiği keser, <code>0.0.0.0/0</code> yazmak tüm trafiği tünele sokar.", label: 'Allowed Address', type: 'text', required: true, placeholder: '10.10.0.2/32', hint: 'Bu peer üzerinden geçecek IP aralığı' },
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
                        { name: 'router_id', why: "Router-ID ağ genelinde benzersiz olmalı; çakışmada komşuluklar sürekli flap eder ve rota tablosu kararsızlaşır. RouterOS v7'de bu bir loopback adresi olarak verilmelidir.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Genellikle Loopback IP adresi' },
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
                        { name: 'router_id', why: "BGP Router-ID benzersiz olmalıdır; aynı ID'li iki cihaz arasında oturum hiç kurulmaz. Arayüz bağımsız olması için loopback adresi kullanın.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' }
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
