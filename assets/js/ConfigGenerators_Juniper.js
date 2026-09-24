'use strict';

const Juniper = {};

// ── Juniper: General ──────────────────────────────────────────────────────────
Juniper.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Juniper JunOS — Genel Konfigürasyon',
                desc: 'Hostname, VLAN, IRB (Layer 3 gateway), LAN/WAN arayüzleri ve default route yapılandırması.<br><small>Örn: <code>set system host-name JNP-SW1</code> &nbsp;|&nbsp; <code>set vlans MGMT vlan-id 10 l3-interface irb.10</code></small>'
            },
            sections: [
                {
                    title: 'Sistem',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hostname', why: 'Sadece kozmetik değil: <code>set system host-name</code> sonrası CLI prompt ve tüm syslog kayıtları bu adla gelir. Ortak log sunucusunda hangi cihazın alarm ürettiğini ayırt etmenin tek yolu budur.', label: 'Hostname', type: 'text', required: true, placeholder: 'JNP-SW1', hint: 'Cihaz hostname\'i' }
                    ]
                },
                {
                    title: 'VLAN & IRB',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan', why: "VLAN ID, Layer 2 izolasyon sınırını belirler. JunOS'ta IRB unit numarasını VLAN ID ile aynı tutmak fiili standarttır; farklı verirseniz konfig çalışır ama sonraki mühendis yanlış unit'i silip gateway'i düşürür.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'VLAN numarası (1–4094)' },
                        { name: 'vlan_name', why: "JunOS'ta VLAN'lar numarayla değil <b>adla</b> referans edilir; trunk ve arayüz altında yazdığınız ad buradakiyle bire bir aynı olmalı. Uyuşmazsa <code>commit</code> aşamasında VLAN bulunamadı hatası alırsınız.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'MGMT', hint: 'VLAN mantıksal adı' },
                        { name: 'ip_prefix', why: "IRB arayüzüne verilen bu adres VLAN'ın gateway'idir. Maskeyi yanlış yazmak (ör. /32) istemcilerin gateway'e ARP atamamasına yol açar; ayrıca VLAN altında <code>l3-interface irb.X</code> tanımlı değilse adres hiçbir işe yaramaz.", label: 'IRB IP / Prefix', type: 'text', required: true, placeholder: '192.168.1.1/24', hint: 'Layer 3 gateway IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Routing',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'gw', why: "Statik default route'un next-hop'u. Next-hop doğrudan bağlı bir arayüzden erişilebilir olmalı; değilse route <code>show route</code> çıktısında <b>hidden</b> kalır ve trafik hiç akmaz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Statik default route next-hop' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'LAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ge-0/0/1', hint: 'VLAN\'a üye erişim portu' },
                        { name: 'wan_iface', why: 'Uplink portu. Yanlış arayüzü seçip üzerine adres yazmak, uzaktan bağlanıyorsanız <code>commit</code> anında kendinizi dışarıda bırakır; riskli değişiklikte <code>commit confirmed 5</code> kullanın, onaylamazsanız cihaz otomatik geri döner.', label: 'WAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ge-0/0/0', hint: 'Uplink/WAN portu' },
                        { name: 'wan_ip_prefix', why: "Sağlayıcının verdiği maskeyi birebir kullanın; /30 yerine /24 yazmak next-hop'u yanlış subnet'e düşürür ve uplink'i komşu devrelerle çakıştırır.", label: 'WAN IP / Prefix', type: 'text', required: true, placeholder: '203.0.113.1/30', hint: 'WAN arayüzü IP adresi (CIDR)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || ''), vname = cgEsc(data.vlan_name || '');
            const ipPrefix = cgEsc(data.ip_prefix || ''), gw = cgEsc(data.gw || '');
            const iface = cgEsc(data.iface || ''), waniface = cgEsc(data.wan_iface || ''), wanip = cgEsc(data.wan_ip_prefix || '');
            let c = '# ========================================\n# Juniper JunOS — General Configuration\n# ========================================\n\nconfigure\n\n';
            c += '# Hostname\nset system host-name ' + hn + '\n\n';
            c += '# VLAN Definition\nset vlans ' + vname + ' vlan-id ' + vlan + '\nset vlans ' + vname + ' l3-interface irb.' + vlan + '\n\n';
            c += '# IRB Interface (Layer 3 VLAN Gateway)\nset interfaces irb unit ' + vlan + ' family inet address ' + ipPrefix + '\n\n';
            c += '# LAN Port → VLAN\nset interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n\n';
            c += '# WAN Interface\nset interfaces ' + waniface + ' unit 0 family inet address ' + wanip + '\n\n';
            c += '# Default Route\nset routing-options static route 0.0.0.0/0 next-hop ' + gw + '\n\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: VLAN ─────────────────────────────────────────────────────────────
Juniper.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Juniper JunOS — VLAN Konfigürasyonu',
                desc: 'Access/trunk port modu ve L2/L3 (IRB) VLAN yapılandırması.<br><small>Örn: <code>set vlans Muhasebe vlan-id 10</code> &nbsp;|&nbsp; <code>set interfaces ge-0/0/15 unit 0 family ethernet-switching vlan members Muhasebe</code></small>'
            },
            configTypes: [
                { id: 'L2', label: 'L2 (Layer 2)', icon: 'fas fa-ethernet', desc: 'Sadece VLAN switching', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'L3', label: 'L3 (IRB)', icon: 'fas fa-network-wired', desc: 'Layer 3 gateway (IRB arayüzü)', badge: { text: 'Routing', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN Temel',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'ge-0/0/15', hint: 'Porta bağlı fiziksel arayüz' },
                        { name: 'vlan_id', why: "VLAN etiketi (1–4094). Karşı switch'te farklı ID kullanılırsa link yine up görünür ama trafik sessizce düşer; IRB unit numarasını VLAN ID ile eşleştirmek teşhisi kolaylaştırır.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'VLAN numarası (1–4094)' },
                        { name: 'vlan_name', why: "JunOS'ta VLAN'lar numarayla değil <b>adla</b> referans edilir; trunk ve arayüz altında yazdığınız ad buradakiyle bire bir aynı olmalı. Uyuşmazsa <code>commit</code> aşamasında VLAN bulunamadı hatası alırsınız.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'Muhasebe', hint: 'Tanımlayıcı VLAN adı' },
                        { name: 'port_mode', why: "<b>access</b> tek VLAN'ı etiketsiz, <b>trunk</b> birden fazla VLAN'ı etiketli taşır. Sunucu portunu trunk yapmak VLAN sızıntısına, uplink'i access yapmak diğer tüm VLAN'ların kopmasına yol açar.", label: 'Port Modu', type: 'select', options: [
                            { value: 'access', label: 'Access', selected: true },
                            { value: 'trunk', label: 'Trunk' }
                        ]}
                    ]
                },
                {
                    title: 'IRB (Layer 3 Gateway)',
                    icon: 'fas fa-route',
                    showFor: ['L3'],
                    fields: [
                        { name: 'l3_ip', why: "Bu adres IRB arayüzüne yazılır ve VLAN'ın gateway'i olur. Aynı gateway'i VRRP/MC-LAG olmadan iki cihazda birden tanımlamak duplicate IP ve kararsız ARP tablosu üretir.", label: 'IRB IP / Prefix', type: 'text', validate: 'cidr', optional: true, placeholder: '192.168.10.1/24', hint: 'VLAN gateway IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Trunk Ayarları',
                    icon: 'fas fa-sitemap',
                    info: 'Yalnızca Port Modu "Trunk" seçildiğinde geçerlidir.',
                    fields: [
                        { name: 'native_vlan', why: "Trunk üzerinde etiketsiz gelen çerçeveler bu VLAN'a atanır. İki uçtaki native VLAN farklıysa iki ağ arasında istemsiz köprü kurulur (VLAN hopping riski); mümkünse kullanılmayan bir VLAN seçin.", label: 'Native VLAN', type: 'text', validate: 'vlan', optional: true, placeholder: '1', hint: 'Trunk native VLAN ID (opsiyonel)' },
                        { name: 'allowed_vlans', why: "Trunk'ta yalnızca listelenen VLAN'lar taşınır. <code>all</code> yazmak kolaydır ama broadcast alanını tüm switch'lere yayar; yeni VLAN eklerken bu listeyi güncellemeyi unutmak en sık kopma sebebidir.", label: 'İzin Verilen VLAN\'lar', type: 'text', validate: 'vlan_list', optional: true, placeholder: '10,20,30', hint: 'Virgülle ayrılmış VLAN listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), vid = cgEsc(data.vlan_id || ''), vname = cgEsc(data.vlan_name || '');
            const mode = cgEsc(data.port_mode || 'access'), ctype = data._cgtype || 'L2';
            let c = '# ========================================\n# Juniper JunOS — VLAN Configuration\n# ========================================\n\nconfigure\n\n';
            if (ctype === 'L2') {
                c += 'set vlans ' + vname + ' vlan-id ' + vid + '\n\n';
                if (mode === 'access') {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n';
                } else {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching port-mode trunk\n';
                    const native = cgEsc(data.native_vlan || ''), allowed = cgEsc(data.allowed_vlans || '');
                    if (native) c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching native-vlan-id ' + native + '\n';
                    if (allowed) {
                        const vlans = allowed.split(',').map(s => s.trim()).join(' ');
                        c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members [ ' + vlans + ' ]\n';
                    }
                }
            } else {
                c += 'set vlans ' + vname + ' vlan-id ' + vid + '\nset vlans ' + vname + ' l3-interface irb.' + vid + '\n\n';
                const l3ip = cgEsc(data.l3_ip || '');
                if (l3ip) c += 'set interfaces irb unit ' + vid + ' family inet address ' + l3ip + '\n\n';
                if (mode === 'access') {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members ' + vname + '\n';
                } else {
                    c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching port-mode trunk\n';
                    const native = cgEsc(data.native_vlan || ''), allowed = cgEsc(data.allowed_vlans || '');
                    if (native) c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching native-vlan-id ' + native + '\n';
                    if (allowed) {
                        const vlans = allowed.split(',').map(s => s.trim()).join(' ');
                        c += 'set interfaces ' + iface + ' unit 0 family ethernet-switching vlan members [ ' + vlans + ' ]\n';
                    }
                }
            }
            c += '\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: DHCP ─────────────────────────────────────────────────────────────
Juniper.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-dhcp',
                title: 'Juniper JunOS — DHCP Konfigürasyonu',
                desc: 'DHCP Server (IRB üzerinde), Global static bind veya Relay Agent yapılandırması.<br><small>Örn: <code>set access address-assignment pool my-pool family inet network 192.168.20.0/24</code></small>'
            },
            configTypes: [
                { id: 'server', label: 'Server (IRB)', icon: 'fas fa-server', desc: 'IRB arayüzünde DHCP sunucu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'global', label: 'Global', icon: 'fas fa-globe', desc: 'Global static IP bind', badge: { text: 'Static Bind', cls: 'common' } },
                { id: 'relay', label: 'Relay', icon: 'fas fa-arrows-alt-h', desc: 'Harici DHCP sunucuya yönlendirme', badge: { text: 'Relay', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Server — Havuz & IRB',
                    icon: 'fas fa-server',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_pool', why: 'DHCP havuzunun adı; <code>dhcp-local-server</code> grubu ile havuz eşleşmesi bu adla yapılır. Ad tutarsızlığında sunucu ayakta görünür ama hiçbir istemciye OFFER gitmez.', label: 'Havuz Adı', type: 'text', required: true, placeholder: 'my-pool', hint: 'DHCP adres havuzu adı' },
                        { name: 'srv_network', why: "Havuzun ağ adresi, IRB arayüzünün subnet'iyle birebir örtüşmelidir. Örtüşmezse JunOS isteği hangi havuzdan karşılayacağını bulamaz ve DISCOVER cevapsız kalır.", label: 'Network (CIDR)', type: 'text', required: true, placeholder: '192.168.20.0/24', hint: 'Havuzun kapsadığı ağ adresi' },
                        { name: 'srv_irb_ip', why: "IRB adresi hem gateway hem de DHCP sunucunun istemci bacağıdır. Bu adres yoksa <code>dhcp-local-server</code> ilgili VLAN'da isteği hiç dinlemez.", label: 'IRB IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.20.1/24', hint: 'IRB arayüzü IP adresi (CIDR)' },
                        { name: 'srv_vlan_id', why: 'IRB unit numarası. <code>irb.20</code> ile VLAN 20 arasındaki bağ otomatik değildir; VLAN altında <code>l3-interface irb.20</code> tanımlı değilse gateway ölü durur.', label: 'VLAN ID (IRB unit)', type: 'text', validate: 'vlan', required: true, placeholder: '20', hint: 'IRB unit numarası = VLAN ID' },
                        { name: 'srv_gw', why: 'İstemcilere option 3 olarak gider ve genellikle IRB adresiyle aynı olmalıdır. Farklı yazmak klasik <b>IP alıyor ama internete çıkmıyor</b> tablosunu üretir.', label: 'Gateway', type: 'text', required: true, placeholder: '192.168.20.1', hint: 'İstemcilere atanacak gateway IP' },
                        { name: 'srv_dns', why: 'Option 6 ile iletilir. Ulaşılamayan bir DNS vermek en yanıltıcı arızadır: IP ile ping çalışır, isimle çalışmaz ve kullanıcı internet yok der.', label: 'DNS Sunucusu', type: 'text', required: true, placeholder: '8.8.8.8', hint: 'İstemcilere atanacak DNS IP' }
                    ]
                },
                {
                    title: 'Server — Static Host (opsiyonel)',
                    icon: 'fas fa-laptop',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_static_host', why: 'Statik rezervasyonun adı; JunOS bunu <code>static-binding</code> anahtarı olarak kullanır. Aynı adı ikinci kez kullanmak önceki kaydı sessizce ezer.', label: 'Static Host Adı', type: 'text', optional: true, placeholder: 'Linux-2', hint: 'Sabit IP atanacak host adı' },
                        { name: 'srv_static_mac', why: 'Rezervasyon MAC ile eşleşir. Sunucuda birden fazla NIC veya bonding varsa istek beklemediğiniz MAC ile gelir, rezervasyon tutmaz ve cihaz havuzdan rastgele IP alır.', label: 'Static MAC', type: 'text', optional: true, placeholder: 'aa:aa:aa:00:00:02', hint: 'Host MAC adresi' },
                        { name: 'srv_static_ip', why: 'Sabit atanan adres, dinamik aralığın <b>dışında</b> ya da exclude edilmiş olmalıdır; aksi halde aynı IP başka bir istemciye de dağıtılır ve çakışma yaşanır.', label: 'Static IP', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.20.100', hint: 'Atanacak sabit IP adresi' }
                    ]
                },
                {
                    title: 'Server — Exclude Range (opsiyonel)',
                    icon: 'fas fa-ban',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_excl_low', why: "Gateway, sunucu ve yazıcı gibi sabit adresleri havuzun dışında tutar. Exclude tanımlamadan gateway IP'sini havuz içinde bırakmak, bir istemcinin gateway adresini kapıp tüm VLAN'ı düşürmesi demektir.", label: 'Exclude Low', type: 'text', optional: true, placeholder: '192.168.20.1', hint: 'Hariç tutulacak aralık başlangıcı' },
                        { name: 'srv_excl_high', why: "Aralığın üst sınırı. Low/high değerlerini ters yazmak veya alt ağ dışına taşırmak commit'te yakalanmaz; havuz sadece beklediğiniz gibi davranmaz.", label: 'Exclude High', type: 'text', optional: true, placeholder: '192.168.20.19', hint: 'Hariç tutulacak aralık sonu' }
                    ]
                },
                {
                    title: 'Global — Static Bind',
                    icon: 'fas fa-globe',
                    showFor: ['global'],
                    fields: [
                        { name: 'gbl_pool', why: 'Global DHCP havuzunun adı. Global havuz tüm arayüzler için ortaktır; VLAN başına farklı gateway/DNS gerekiyorsa global yerine ayrı havuzlar kullanın.', label: 'Havuz Adı', type: 'text', required: true, placeholder: 'LAN1', hint: 'Global havuz adı' },
                        { name: 'gbl_bind_ip', why: "MAC'e sabitlenen adres. Havuzun ağı içinde ama dinamik dağıtım aralığının dışında olmalı; değilse aynı adres ikinci bir istemciye de verilebilir.", label: 'Static Bind IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.15', hint: 'MAC\'e bağlanacak sabit IP' },
                        { name: 'gbl_bind_mac', why: "Bağlamanın anahtarı MAC'tir. Sanal makinede klonlama veya NIC değişimi MAC'i değiştirdiğinde rezervasyon sessizce çalışmaz ve cihaz rastgele IP alır.", label: 'Static Bind MAC', type: 'text', required: true, placeholder: 'aa:bb:cc:dd:ee:ff', hint: 'Sabit IP atanacak MAC adresi' },
                        { name: 'gbl_iface', why: '<code>dhcp-local-server</code> yalnızca burada listelenen arayüzlerde istek dinler. Arayüzü eklemeyi unutmak, havuz doğru olsa bile hiçbir istemcinin IP alamaması demektir.', label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'ge-0/0/1', hint: 'DHCP local server arayüzü' },
                        { name: 'gbl_ip', why: "Arayüz adresi, istemcilere verilecek gateway ile aynı subnet'te olmalıdır; DHCP sunucu hangi havuzu kullanacağına bu adrese bakarak karar verir.", label: 'Arayüz IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.2.1/24', hint: 'Arayüz IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Relay — Yapılandırma',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['relay'],
                    fields: [
                        { name: 'relay_iface', why: 'Relay, istemci tarafındaki arayüzde çalışır; yanlış arayüzde broadcast DISCOVER paketleri hiç yakalanmaz. Aynı arayüzde relay ile local-server birlikte kullanılamaz.', label: 'Relay Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ge-0/0/1', hint: 'İstemci tarafındaki arayüz' },
                        { name: 'relay_server', why: "Harici DHCP sunucusunun adresi. Sunucu tarafında bu cihazın relay (giaddr) adresine dönüş route'u yoksa DISCOVER gider ama OFFER geri dönmez.", label: 'Relay Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.10.10.1', hint: 'Harici DHCP sunucu IP adresi' },
                        { name: 'relay_vrf', why: "Sunucu farklı bir routing-instance içindeyse relay'i o VRF'te tanımlamalısınız; VRF izolasyonu nedeniyle global tabloda tanımlı relay o sunucuya asla ulaşamaz.", label: 'VRF', type: 'text', optional: true, placeholder: 'blue', hint: 'VRF adı (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = data._cgtype || 'server';
            let c = '# ========================================\n# Juniper JunOS — DHCP Configuration\n# ========================================\n\ncli\nconfigure\n\n';
            if (mode === 'server') {
                const pool = cgEsc(data.srv_pool || ''), network = cgEsc(data.srv_network || ''), irbip = cgEsc(data.srv_irb_ip || '');
                const vid = cgEsc(data.srv_vlan_id || ''), gw = cgEsc(data.srv_gw || ''), dns = cgEsc(data.srv_dns || '');
                const shost = cgEsc(data.srv_static_host || ''), smac = cgEsc(data.srv_static_mac || ''), sip = cgEsc(data.srv_static_ip || '');
                const exLow = cgEsc(data.srv_excl_low || ''), exHigh = cgEsc(data.srv_excl_high || '');
                c += '# VLAN + IRB\nset vlans ' + pool + ' vlan-id ' + vid + ' l3-interface irb.' + vid + '\n';
                c += 'set interfaces irb unit ' + vid + ' family inet address ' + irbip + '\n\n';
                c += '# DHCP Address Pool\nset access address-assignment pool ' + pool + ' family inet network ' + network + '\n';
                c += 'set access address-assignment pool ' + pool + ' family inet dhcp-attributes name-server { ' + dns + '; }\n';
                c += 'set access address-assignment pool ' + pool + ' family inet dhcp-attributes router { ' + gw + '; }\n';
                if (shost && smac && sip) {
                    c += 'set access address-assignment pool ' + pool + ' family inet host ' + shost + ' hardware-address ' + smac + ' ip-address ' + sip + '\n';
                }
                if (exLow && exHigh) {
                    c += 'set access address-assignment pool ' + pool + ' family inet excluded-range my-range low ' + exLow + ' high ' + exHigh + '\n';
                }
                c += '\n# DHCP Local Server\nset system services dhcp-local-server group my-group interface irb.' + vid + '\n';
            } else if (mode === 'global') {
                const pool = cgEsc(data.gbl_pool || ''), bip = cgEsc(data.gbl_bind_ip || ''), bmac = cgEsc(data.gbl_bind_mac || '');
                const iface = cgEsc(data.gbl_iface || ''), gip = cgEsc(data.gbl_ip || '');
                c += 'set access address-assignment pool ' + pool + ' static-bind ip-address ' + bip + ' mac-address ' + bmac + '\n';
                c += 'set interfaces ' + iface + ' unit 0 family inet address ' + gip + '\n';
                c += 'set system services dhcp-local-server group my-group interface ' + iface + '.0\n';
            } else {
                const riface = cgEsc(data.relay_iface || ''), rsrv = cgEsc(data.relay_server || ''), vrf = cgEsc(data.relay_vrf || '');
                c += 'set forwarding-options dhcp-relay server-group RelayGroup server ' + rsrv + '\n';
                c += 'set forwarding-options dhcp-relay interface ' + riface + '.0\n';
                if (vrf) c += 'set forwarding-options dhcp-relay server-group RelayGroup vrf ' + vrf + '\n';
            }
            c += '\ncommit\n';
            return c;
        });
    }
};

// ── Juniper: ACL (Firewall Filter) ───────────────────────────────────────────
Juniper.acl = {
    label: 'ACL/Filter',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Juniper JunOS — Firewall Filter (ACL)',
                desc: 'Standart (kaynak IP) veya Extended (protokol + port) firewall filter tanımı.<br><small>Örn: <code>set firewall family inet filter block-telnet term term-10 from source-address 192.168.1.0/24</code></small>'
            },
            configTypes: [
                { id: 'standard', label: 'Standart', icon: 'fas fa-filter', desc: 'Kaynak IP eşleştirme', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended', icon: 'fas fa-shield-alt', desc: 'Protokol + port eşleştirme', badge: { text: 'Gelişmiş', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Filter Tanımı',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'filter_name', why: 'Firewall filter adı. Filtre bir arayüze uygulanmadığı sürece sadece konfigde durur ve hiçbir etkisi olmaz — yazıp uygulamayı unutmak en sık yanılgıdır.', label: 'Filter Adı', type: 'text', required: true, placeholder: 'block-telnet', hint: 'Firewall filter adı' },
                        { name: 'term_name', why: "Term'ler <b>yazıldıkları sırayla</b> değerlendirilir ve ilk eşleşen kazanır. Genel bir term'i yukarı koyarsanız altındaki özel term'ler hiç çalışmaz; doğru konuma almak için <code>insert</code> komutunu kullanın.", label: 'Term Adı', type: 'text', required: true, placeholder: 'term-10', hint: 'Filter term adı' }
                    ]
                },
                {
                    title: 'Kaynak',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'src', why: 'Kaynak eşleşmesi. <code>any</code> bırakmak filtreyi kendi yönetim trafiğinizi de kapsayacak kadar genişletir; uzaktan bağlıyken <code>commit confirmed</code> ile deneyin.', label: 'Kaynak', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'specific', label: 'Belirli IP/Prefix' }
                        ]},
                        { name: 'src_ip', why: 'Prefix uzunluğu eşleşmenin kapsamını belirler: /32 tek host, /24 tüm subnet. Maskeyi geniş yazmak filtreyi beklediğinizden çok daha fazla trafiğe uygular.', label: 'Kaynak IP / Prefix', type: 'text', requiredIf: { field: 'src', in: ['specific'] }, validate: 'ip_cidr', placeholder: '192.168.1.0/24', hint: '"Belirli IP/Prefix" seçilirse doldur' }
                    ]
                },
                {
                    title: 'Extended — Protokol & Hedef',
                    icon: 'fas fa-exchange-alt',
                    showFor: ['extended'],
                    fields: [
                        { name: 'proto', why: "Protokol seçimi port eşleşmesini de belirler: <code>icmp</code> seçildiğinde port alanları anlamsızdır, TCP yerine UDP yazmak ise term'in hiç eşleşmemesine yol açar.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'icmp', label: 'ICMP' },
                            { value: 'ip', label: 'IP' }
                        ]},
                        { name: 'dst', why: "Hedefi <code>any</code> bırakmak term'i çok geniş yapar. İlk eşleşen term kazandığı için geniş bir term, altındaki tüm özel term'leri ölü koda çevirir.", label: 'Hedef', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'specific', label: 'Belirli IP/Prefix' }
                        ]},
                        { name: 'dst_ip', why: "Hedef prefix'i geniş yazmak (ör. /24), tek sunucuya uyguladığınızı sandığınız kuralı tüm subnet'e uygular; host için <code>/32</code> kullanın.", label: 'Hedef IP / Prefix', type: 'text', requiredIf: { field: 'dst', in: ['specific'] }, validate: 'ip_cidr', placeholder: '10.0.0.1/32', hint: '"Belirli IP/Prefix" seçilirse doldur' },
                        { name: 'src_port', why: 'Kaynak port çoğu istemcide rastgele yüksek porttur; kaynak porta göre filtrelemek genellikle hatalıdır ve kuralın hiç eşleşmemesine yol açar.', label: 'Kaynak Port', type: 'text', validate: 'port', optional: true, placeholder: '80', hint: 'TCP/UDP kaynak port (any veya numara)' },
                        { name: 'dst_port', why: 'Servisi belirleyen alan hedef porttur. Firewall filter <b>stateless</b> olduğu için dönüş trafiği ayrı bir term ile ele alınmalıdır — sadece gidiş yönünü yazmak bağlantıyı tek yönlü kırar.', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '443', hint: 'TCP/UDP hedef port (any veya numara)' },
                        { name: 'icmp_type', why: "ICMP'yi komple kapatmak PMTU discovery'yi bozar ve büyük paketlerin sessizce düşmesine yol açar. <code>echo-request</code> dışında <code>unreachable</code> ve <code>fragmentation-needed</code> tiplerine izin vermeyi unutmayın.", label: 'ICMP Tipi', type: 'text', optional: true, placeholder: 'echo-request', hint: 'Protokol ICMP ise ICMP tip adı' }
                    ]
                },
                {
                    title: 'Eylem & Uygulama',
                    icon: 'fas fa-check-circle',
                    fields: [
                        { name: 'action', why: "<b>discard</b> paketi sessizce atar, <b>reject</b> ICMP unreachable döner — sorun giderirken bu fark kritiktir. Filtrenin sonunda <b>gizli varsayılan reddetme</b> vardır: SSH, BGP ve OSPF için accept term'i yoksa cihaza erişiminizi kaybedersiniz.", label: 'Eylem', type: 'select', options: [
                            { value: 'accept', label: 'Accept (Permit)', selected: true },
                            { value: 'discard', label: 'Discard (Deny)' },
                            { value: 'reject', label: 'Reject (ICMP unreachable)' }
                        ]},
                        { name: 'apply_iface', why: 'Filtre bir arayüze uygulanmadan hiçbir şey yapmaz. <code>lo0</code> üzerine uygulanan filtre cihazın kendi kontrol düzlemini korur — oraya yanlış filtre koymak tüm yönetim erişimini bitirir.', label: 'Uygulama Arayüzü', type: 'text', validate: 'iface', optional: true, placeholder: 'ge-0/0/0', hint: 'Filtreyi uygulayacak arayüz (opsiyonel)' },
                        { name: 'apply_dir', why: '<b>input</b> arayüze giren, <b>output</b> çıkan trafiği süzer. Yönü ters seçmek filtrenin hiç eşleşmemesine yol açar; filtre stateless olduğu için dönüş trafiğini ayrıca düşünmeniz gerekir.', label: 'Uygulama Yönü', type: 'select', options: [
                            { value: 'input', label: 'Input', selected: true },
                            { value: 'output', label: 'Output' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const fname = cgEsc(data.filter_name || ''), term = cgEsc(data.term_name || '');
            const type = data._cgtype || 'standard', action = cgEsc(data.action || 'accept');
            const src = cgEsc(data.src || 'any'), srcip = cgEsc(data.src_ip || '');
            const base = 'set firewall family inet filter ' + fname + ' term ' + term;
            let c = '# ========================================\n# Juniper JunOS — Firewall Filter (ACL)\n# ========================================\n\n';
            if (src === 'specific' && !srcip) c += '# UYARI: kaynak "Belirli IP" seçili ama IP boş — term her kaynağı eşler.\n';
            if (type !== 'standard' && data.dst === 'specific' && !data.dst_ip) c += '# UYARI: hedef "Belirli IP" seçili ama IP boş — term her hedefi eşler.\n';
            c += 'configure\n\n';
            if (type === 'standard') {
                if (src === 'specific' && srcip) {
                    const prefix = srcip.includes('/') ? srcip : srcip + '/32';
                    c += base + ' from source-address ' + prefix + '\n';
                }
                c += base + ' then ' + action + '\n';
            } else {
                const proto = cgEsc(data.proto || 'tcp'), dst = cgEsc(data.dst || 'any'), dstip = cgEsc(data.dst_ip || '');
                const sp = cgEsc(data.src_port || ''), dp = cgEsc(data.dst_port || ''), icmpType = cgEsc(data.icmp_type || '');
                c += base + ' from protocol ' + proto + '\n';
                if (src === 'specific' && srcip) {
                    const prefix = srcip.includes('/') ? srcip : srcip + '/32';
                    c += base + ' from source-address ' + prefix + '\n';
                }
                if (dst === 'specific' && dstip) {
                    const prefix = dstip.includes('/') ? dstip : dstip + '/32';
                    c += base + ' from destination-address ' + prefix + '\n';
                }
                if ((proto === 'tcp' || proto === 'udp') && sp && sp !== 'any') {
                    c += base + ' from source-port ' + sp + '\n';
                }
                if ((proto === 'tcp' || proto === 'udp') && dp && dp !== 'any') {
                    c += base + ' from destination-port ' + dp + '\n';
                }
                if (proto === 'icmp' && icmpType) {
                    c += base + ' from icmp-type ' + icmpType + '\n';
                }
                c += base + ' then ' + action + '\n';
            }
            c += base.replace(' term ' + term, ' term default') + ' then accept\n\n';
            const applyIface = cgEsc(data.apply_iface || ''), applyDir = cgEsc(data.apply_dir || 'input');
            if (applyIface) {
                c += 'set interfaces ' + applyIface + ' unit 0 family inet filter ' + applyDir + ' ' + fname + '\n';
            }
            c += '\ncommit\n';
            c += '\n# Doğrulama:\n# show firewall filter ' + fname + '\n# run show firewall filter ' + fname + '\n';
            return c;
        });
    }
};

// ── Juniper MX: Interface ─────────────────────────────────────────────────────
const JuniperMX = {};

JuniperMX.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Juniper MX — Interface Konfigürasyonu',
                desc: 'MX serisi fiziksel arayüz, IP adresi, MPLS family ve MTU yapılandırması.<br><small>Örn: <code>set interfaces xe-0/0/0 unit 0 family inet address 10.0.0.1/30</code></small>'
            },
            sections: [
                {
                    title: 'Arayüz',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'xe-0/0/0', hint: 'Fiziksel arayüz adı (ör: xe-0/0/0, ge-0/0/0)' },
                        { name: 'unit', why: "JunOS'ta adres fiziksel arayüze değil <b>logical unit</b>'e yazılır ve etiketsiz arayüzlerde unit her zaman <code>0</code> olmalıdır. Tagging açık değilken 0 dışında unit vermek commit hatası verir.", label: 'Unit', type: 'text', required: true, placeholder: '0', hint: 'Logical unit numarası (genellikle 0)' },
                        { name: 'desc', why: 'Trafiği etkilemez ama <code>show interfaces descriptions</code> çıktısında görünür. Portun hangi devreye gittiğinin bilinmemesi, sahada yanlış kablo çekilmesinin bir numaralı sebebidir.', label: 'Açıklama', type: 'text', optional: true, placeholder: 'To-Provider-PE1', hint: 'Arayüz açıklaması' },
                        { name: 'ip', why: "Adres, logical unit altında <code>family inet</code> içine yazılır. Aynı unit'e ikinci adres eklerseniz JunOS ikisini birden tutar; eskisini gerçekten kaldırmak için <code>delete</code> gerekir — yeni adresi <code>set</code> etmek eskisini silmez.", label: 'IP Adresi / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' }
                    ]
                },
                {
                    title: 'Gelişmiş Ayarlar',
                    icon: 'fas fa-cogs',
                    fields: [
                        { name: 'mpls_en', why: 'Etiketli paketin geçebilmesi için hem arayüzde <code>family mpls</code> hem de <code>protocols mpls</code> altında arayüz tanımı gerekir. Biri eksikse LDP komşuluğu kurulur ama LSP trafiği sessizce düşer.', label: 'MPLS Etkinleştir', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ]},
                        { name: 'mtu', why: "JunOS'ta arayüz MTU'su L2 başlığı dahil sayılır; komşuyla eşit değilse OSPF komşuluğu ExStart'ta takılır. MPLS/VXLAN gibi ek başlık ekleyen tasarımlarda payload için fazladan alan bırakın.", label: 'MTU', type: 'text', optional: true, placeholder: '9192', hint: 'Interface MTU (opsiyonel, ör: 9192 jumbo)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), unit = cgEsc(data.unit || '0');
            const desc = cgEsc(data.desc || ''), ip = cgEsc(data.ip || '');
            const mplsEn = cgEsc(data.mpls_en || 'yes'), mtu = cgEsc(data.mtu || '');
            let c = '# ========================================\n# Juniper MX — Interface\n# ========================================\n\n';
            if (desc) c += 'set interfaces ' + iface + ' description "' + desc + '"\n';
            if (mtu) c += 'set interfaces ' + iface + ' mtu ' + mtu + '\n';
            c += 'set interfaces ' + iface + ' unit ' + unit + ' family inet address ' + ip + '\n';
            if (mplsEn === 'yes') {
                c += 'set interfaces ' + iface + ' unit ' + unit + ' family mpls\n';
            }
            c += '\n# Doğrulama:\n# show interfaces ' + iface + '\n';
            return c;
        });
    }
};

// ── Juniper MX: OSPF ──────────────────────────────────────────────────────────
JuniperMX.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — OSPF',
                desc: 'OSPF area, interface ve MD5 authentication yapılandırması.<br><small>Örn: <code>set protocols ospf area 0.0.0.0 interface xe-0/0/0.0</code></small>'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router_id', why: 'Router-ID protokollerde cihazın kimliğidir ve çakışması komşuluğun kurulup sürekli kopmasına yol açar. Loopback adresi verin: fiziksel arayüzden türetilen ID, o arayüz düştüğünde değişir ve tüm oturumları sıfırlar.', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'OSPF Router-ID (genellikle loopback IP)' },
                        { name: 'area', why: "Backbone <code>0.0.0.0</code> olmalı ve tüm alanlar ona komşu olmalıdır. Linkin iki ucunun farklı area'da olması komşuluğun hiç kurulmamasına neden olur — link up görünür, komşu yoktur.", label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'interfaces', why: "OSPF yalnızca burada listelenen arayüzlerde çalışır. Loopback'i eklemeyi unutmak router-ID prefix'inin duyurulmamasına, dolayısıyla iBGP ve LDP'nin loopback'e ulaşamamasına yol açar.", label: 'Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, lo0.0', hint: 'Virgülle ayrılmış OSPF arayüzleri' },
                        { name: 'lo_iface', why: "Loopback'i <b>passive</b> işaretlemek prefix'i duyurur ama üzerinde komşuluk aramaz. Passive yapılmayan kullanıcı/yönetim arayüzleri ise güvenilmeyen tarafa OSPF paketi yayar ve sahte komşu kabul edebilir.", label: 'Loopback (passive)', type: 'text', validate: 'iface', optional: true, placeholder: 'lo0.0', hint: 'Passive olarak işaretlenecek loopback arayüzü' },
                        { name: 'auth_key', why: "İki uçta anahtar veya tip farklıysa komşuluk sessizce kurulmaz, log'da yalnızca authentication mismatch görünür. Anahtar konfigde şifreli görünse de geri çözülebilir; tek güvenlik katmanı sayılmamalıdır.", label: 'Authentication Key', type: 'text', optional: true, placeholder: 'ospf-secret', hint: 'MD5 authentication şifresi (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
            const ifaces = cgEsc(data.interfaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const loIface = cgEsc(data.lo_iface || ''), authKey = cgEsc(data.auth_key || '');
            let c = '# ========================================\n# Juniper MX — OSPF\n# ========================================\n\n';
            c += 'set routing-options router-id ' + routerId + '\n\n';
            ifaces.forEach(iface => {
                c += 'set protocols ospf area ' + area + ' interface ' + iface;
                if (iface === loIface) c += ' passive';
                c += '\n';
                if (authKey) c += 'set protocols ospf area ' + area + ' interface ' + iface + ' authentication md5 1 key "' + authKey + '"\n';
            });
            c += '\n# Doğrulama:\n# show ospf neighbor\n# show ospf route\n';
            return c;
        });
    }
};

// ── Juniper MX: BGP ───────────────────────────────────────────────────────────
JuniperMX.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Juniper MX — BGP',
                desc: 'iBGP/eBGP peer group yapılandırması, VPNv4 address-family desteği.<br><small>Örn: <code>set protocols bgp group IBGP_PEERS type internal neighbor 10.0.0.2 peer-as 65002</code></small>'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: 'Yerel AS numarası iBGP/eBGP ayrımını belirler. Karşı tarafın beklediği AS ile farklıysa OPEN mesajında bad peer AS hatası alınır ve oturum sürekli Active/Connect arasında gidip gelir.', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: 'Router-ID protokollerde cihazın kimliğidir ve çakışması komşuluğun kurulup sürekli kopmasına yol açar. Loopback adresi verin: fiziksel arayüzden türetilen ID, o arayüz düştüğünde değişir ve tüm oturumları sıfırlar.', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP Router-ID (genellikle loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "BGP komşusunun adresi. Komşunun gördüğü kaynak adres ile burada yazdığınız adres birebir aynı olmalı; loopback üzerinden iBGP kuruyorsanız ayrıca <code>local-address</code> gerekir, yoksa oturum Idle'da kalır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', why: "Komşunun AS numarası eBGP/iBGP davranışını belirler: aynı AS ise öğrenilen route'lar diğer iBGP komşulara duyurulmaz (full-mesh veya route-reflector gerekir). Yanlış AS oturumu hiç kurdurmaz.", label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', why: "JunOS'ta komşular mutlaka bir <code>group</code> altında tanımlanır ve tip/policy ayarları gruptan miras alınır. Farklı politikaya ihtiyacı olan peer'ı aynı gruba koymak ona da grubun export policy'sini uygular.", label: 'Peer Group Adı', type: 'text', required: true, placeholder: 'IBGP_PEERS', hint: 'BGP peer group adı' },
                        { name: 'bgp_type', why: "<b>internal</b> (iBGP) öğrenilen route'ları diğer iBGP komşulara duyurmaz; bu yüzden full-mesh ya da route-reflector şarttır. Tip ile AS numaralarının tutarsız olması oturumu hiç kurdurmaz.", label: 'BGP Tipi', type: 'select', options: [
                            { value: 'internal', label: 'iBGP', selected: true },
                            { value: 'external', label: 'eBGP' }
                        ]},
                        { name: 'vpnv4', why: "L3VPN için <code>family inet-vpn unicast</code> ayrıca açılmalıdır; sadece IPv4 unicast açık bir iBGP oturumu VRF route'larını hiç taşımaz. İki PE'de de aynı family açık olmalı, yoksa oturum family mismatch ile reset olur.", label: 'VPNv4 (L3VPN için)', type: 'select', options: [
                            { value: 'no', label: 'Hayır', selected: true },
                            { value: 'yes', label: 'Evet' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || '');
            const peerGroup = cgEsc(data.peer_group || ''), bgpType = cgEsc(data.bgp_type || 'internal');
            const vpnv4 = cgEsc(data.vpnv4 || 'no');
            let c = '# ========================================\n# Juniper MX — BGP\n# ========================================\n\n';
            c += 'set routing-options autonomous-system ' + localAs + '\n';
            c += 'set routing-options router-id ' + routerId + '\n\n';
            c += 'set protocols bgp group ' + peerGroup + ' type ' + bgpType + '\n';
            if (bgpType === 'internal') {
                c += 'set protocols bgp group ' + peerGroup + ' local-as ' + localAs + '\n';
            }
            if (vpnv4 === 'yes') {
                c += 'set protocols bgp group ' + peerGroup + ' family inet-vpn unicast\n';
            } else {
                c += 'set protocols bgp group ' + peerGroup + ' family inet unicast\n';
            }
            c += 'set protocols bgp group ' + peerGroup + ' neighbor ' + peerIp + ' peer-as ' + peerAs + '\n';
            c += '\n# Doğrulama:\n# show bgp summary\n# show bgp neighbor ' + peerIp + '\n';
            return c;
        });
    }
};

// ── Juniper MX: MPLS LDP ──────────────────────────────────────────────────────
JuniperMX.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Juniper MX — MPLS / LDP',
                desc: 'MPLS ve LDP interface etkinleştirme, transport-address yapılandırması.<br><small>Örn: <code>set protocols mpls interface xe-0/0/0.0</code> &nbsp;|&nbsp; <code>set protocols ldp transport-address 1.1.1.1</code></small>'
            },
            sections: [
                {
                    title: 'MPLS & LDP Arayüzleri',
                    icon: 'fas fa-random',
                    fields: [
                        { name: 'mpls_ifaces', why: "Arayüz <code>protocols mpls</code> altında listelenmezse etiketli paket o arayüzden geçmez. Core arayüzlerden birini atlamak LSP'nin sessizce kurulmamasına yol açar.", label: 'MPLS Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, xe-0/0/1.0', hint: 'Virgülle ayrılmış MPLS arayüzleri' },
                        { name: 'ldp_ifaces', why: 'LDP komşuluğu yalnızca listelenen arayüzlerde kurulur; <code>lo0.0</code> genelde transport adresi için eklenir. LDP açık ama MPLS ailesi kapalıysa oturum kurulur, trafik akmaz.', label: 'LDP Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0.0, xe-0/0/1.0', hint: 'Virgülle ayrılmış LDP arayüzleri' },
                        { name: 'router_id', why: 'Router-ID protokollerde cihazın kimliğidir ve çakışması komşuluğun kurulup sürekli kopmasına yol açar. Loopback adresi verin: fiziksel arayüzden türetilen ID, o arayüz düştüğünde değişir ve tüm oturumları sıfırlar.', label: 'Router ID (LDP Transport)', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'LDP transport-address (genellikle loopback IP)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mplsIfaces = cgEsc(data.mpls_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const ldpIfaces = cgEsc(data.ldp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            const routerId = cgEsc(data.router_id || '');
            let c = '# ========================================\n# Juniper MX — MPLS / LDP\n# ========================================\n\n';
            mplsIfaces.forEach(i => c += 'set protocols mpls interface ' + i + '\n');
            c += '\n';
            ldpIfaces.forEach(i => c += 'set protocols ldp interface ' + i + '\n');
            c += 'set protocols ldp transport-address ' + routerId + '\n\n';
            c += '# Doğrulama:\n# show mpls interface\n# show ldp neighbor\n# show ldp database\n';
            return c;
        });
    }
};

// ── Juniper MX: L3VPN ─────────────────────────────────────────────────────────
JuniperMX.l3vpn = {
    label: 'L3VPN (VRF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — L3VPN (VRF)',
                desc: 'MPLS L3VPN: VRF tanımı, Route Distinguisher, Route Target ve CE-PE BGP yapılandırması.<br><small>Örn: <code>set routing-instances CUST_A instance-type vrf</code> &nbsp;|&nbsp; <code>set routing-instances CUST_A route-distinguisher 65001:100</code></small>'
            },
            sections: [
                {
                    title: 'VRF Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vrf_name', why: "Routing instance adı VRF'i tanımlar ve tam izolasyon sağlar: global tablodaki route'lar buraya sızmaz. Arayüzü VRF'e taşıdığınız anda global tablodan çıkar — yönetim arayüzünü yanlışlıkla VRF'e almak klasik erişim kaybı sebebidir.", label: 'VRF Adı', type: 'text', required: true, placeholder: 'CUST_A', hint: 'Routing instance (VRF) adı' },
                        { name: 'rd', why: "RD, aynı prefix'in farklı müşterilerde çakışmasını önlemek için route'u benzersizleştirir ve her VRF'te farklı olmalıdır. RD tek başına route sızdırmayı kontrol etmez — onu yapan route-target'tır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'ASN:NN formatında RD' },
                        { name: 'rt_import', why: "Bu VRF'in hangi route-target'lı route'ları kabul edeceğini belirler. Hub-spoke tasarımda import/export'u simetrik yazmak, izole olması gereken spoke'ların birbirini görmesine yol açar.", label: 'Route Target Import', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import community' },
                        { name: 'rt_export', why: "Bu VRF'ten duyurulan route'lara eklenen community. Karşı PE'nin import ettiği değerle eşleşmezse route BGP tablosunda görünür ama VRF'e hiç yüklenmez.", label: 'Route Target Export', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Export community' }
                    ]
                },
                {
                    title: 'CE Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ce_iface', why: "Müşteri bacağı arayüzü VRF'e atandığı anda global tablodan çıkar. Alt arayüz (ör. <code>.100</code>) kullanıyorsanız VLAN tagging açık olmalı, yoksa unit adres almaz.", label: 'CE Interface', type: 'text', validate: 'iface', required: true, placeholder: 'xe-0/1/0.100', hint: 'Müşteri tarafı arayüzü' },
                        { name: 'ce_ip', why: "PE-CE link adresi VRF içinde connected route olarak görünür. İki müşteride aynı adres kullanılması sorun değildir — izolasyonu sağlayan VRF'tir.", label: 'CE IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.1.1.1/30', hint: 'CE-PE link IP adresi (CIDR)' },
                        { name: 'ce_as', why: "Aynı CE AS numarası farklı sahalarda tekrarlanıyorsa route'lar AS-path loop sayılıp reddedilir; bu durumda <code>as-override</code> ya da <code>loops</code> ayarı gerekir.", label: 'CE BGP AS', type: 'text', validate: 'asn', optional: true, placeholder: '65100', hint: 'CE-PE BGP için CE AS numarası (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vrfName = cgEsc(data.vrf_name || ''), rd = cgEsc(data.rd || '');
            const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
            const ceIface = cgEsc(data.ce_iface || ''), ceIp = cgEsc(data.ce_ip || ''), ceAs = cgEsc(data.ce_as || '');
            let c = '# ========================================\n# Juniper MX — L3VPN (VRF)\n# ========================================\n\n';
            c += '# VRF Tanımı\n';
            c += 'set routing-instances ' + vrfName + ' instance-type vrf\n';
            c += 'set routing-instances ' + vrfName + ' route-distinguisher ' + rd + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-target target:' + rtImport + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-import VRF_IMPORT_' + vrfName + '\n';
            c += 'set routing-instances ' + vrfName + ' vrf-export VRF_EXPORT_' + vrfName + '\n\n';
            c += '# CE Interface\n';
            c += 'set interfaces ' + ceIface + ' family inet address ' + ceIp + '\n';
            c += 'set routing-instances ' + vrfName + ' interface ' + ceIface + '\n\n';
            if (ceAs) {
                c += '# CE-PE BGP\n';
                c += 'set routing-instances ' + vrfName + ' protocols bgp group CE_' + vrfName;
                c += ' type external peer-as ' + ceAs + '\n';
                const ceIpAddr = ceIp.split('/')[0].replace(/\.\d+$/, '') + '.' + (parseInt(ceIp.split('/')[0].split('.').pop()) + 1);
                c += 'set routing-instances ' + vrfName + ' protocols bgp group CE_' + vrfName + ' neighbor ' + ceIpAddr + '\n\n';
            }
            c += '# Route Policy (import/export)\n';
            c += 'set policy-options policy-statement VRF_IMPORT_' + vrfName + ' term 1 from community VRF_COM_' + vrfName + '\n';
            c += 'set policy-options policy-statement VRF_IMPORT_' + vrfName + ' term 1 then accept\n';
            c += 'set policy-options policy-statement VRF_EXPORT_' + vrfName + ' term 1 then community add VRF_COM_' + vrfName + '\n';
            c += 'set policy-options policy-statement VRF_EXPORT_' + vrfName + ' term 1 then accept\n';
            c += 'set policy-options community VRF_COM_' + vrfName + ' members target:' + rtExport + '\n\n';
            c += '# Doğrulama:\n# show route table ' + vrfName + '.inet.0\n# show bgp summary instance ' + vrfName + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: LAG (ae interface) ─────────────────────────────────────────
Juniper.lag = {
    label: 'LAG (ae Interface)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Juniper JunOS — LAG (ae Interface)',
                desc: 'LACP ile Link Aggregation Group yapılandırması — routed veya L2 trunk modda.<br><small>Örn: <code>set interfaces xe-0/0/0 ether-options 802.3ad ae0</code> &nbsp;|&nbsp; <code>set interfaces ae0 aggregated-ether-options lacp active</code></small>'
            },
            sections: [
                {
                    title: 'AE Interface',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'ae_id', why: '<code>ae0</code> gibi bir toplu arayüz oluşturur. Ayrıca <code>chassis aggregated-devices ethernet device-count</code> değerinin yeterli olması gerekir; değilse arayüz hiç oluşmaz ve konfig boş yere durur.', label: 'AE Interface ID', type: 'text', required: true, placeholder: '0', hint: 'ae arayüzü numarası (ör: 0 → ae0)' },
                        { name: 'lacp_mode', why: "<b>active</b> taraf LACP paketini başlatır; iki uç da passive ise pazarlık hiç başlamaz ve link bundle'a katılmaz. LACP tamamen kapalıysa kablolama hatası tespit edilemez ve trafik kara deliğe gider.", label: 'LACP Mod', type: 'select', options: [
                            { value: 'active', label: 'Active', selected: true },
                            { value: 'passive', label: 'Passive' }
                        ]},
                        { name: 'members', why: "Üye portların hızı ve dupleksi aynı olmalıdır; farklı hızda port eklemek bazı platformlarda bundle'ı komple reddettirir. Üye eklemeden önce portun eski adres/VLAN konfigini <code>delete</code> edin, aksi halde commit hata verir.", label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'xe-0/0/0, xe-0/0/1', hint: 'Virgülle ayrılmış fiziksel arayüzler' }
                    ]
                },
                {
                    title: 'AE Kullanım Modu',
                    icon: 'fas fa-cogs',
                    info: 'Routed IP veya L2 Trunk moddan birini doldurun; ikisi birden kullanılmaz.',
                    fields: [
                        { name: 'ae_ip', why: "Layer 3 modda adres <code>ae0.0</code> üzerine yazılır, üye fiziksel portlara değil. Fiziksel portta adres bırakmak commit'i reddettirir.", label: 'AE IP (routed ise)', type: 'text', validate: 'cidr', optional: true, placeholder: '10.0.0.1/30', hint: 'Layer 3 routed mod için IP adresi (CIDR)' },
                        { name: 'vlans', why: "L2 trunk modda taşınacak VLAN listesi. İki uçtaki liste farklıysa eksik VLAN'ların trafiği tek yönlü kaybolur ve arıza aralıklı gibi görünerek teşhisi zorlaştırır.", label: 'Trunk VLAN\'lar (L2 ise)', type: 'text', validate: 'vlan_list', optional: true, placeholder: '10 20 100', hint: 'Boşluk/virgülle ayrılmış VLAN listesi (L2 trunk mod)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const aeId = cgEsc(data.ae_id || ''), lacpMode = cgEsc(data.lacp_mode || 'active');
            const members = cgEsc(data.members || '').split(',').map(s => s.trim()).filter(Boolean);
            const aeIp = cgEsc(data.ae_ip || ''), vlans = cgEsc(data.vlans || '');
            let c = '# ========================================\n# Juniper JunOS — LAG (ae Interface)\n# ========================================\n\n';
            c += 'set chassis aggregated-devices ethernet device-count 10\n\n';
            members.forEach(m => {
                c += 'set interfaces ' + m + ' ether-options 802.3ad ae' + aeId + '\n';
                c += 'set interfaces ' + m + ' gigether-options 802.3ad ae' + aeId + '\n';
            });
            c += '\nset interfaces ae' + aeId + ' aggregated-ether-options lacp ' + lacpMode + '\n';
            if (aeIp) {
                c += 'set interfaces ae' + aeId + ' unit 0 family inet address ' + aeIp + '\n';
            } else if (vlans) {
                c += 'set interfaces ae' + aeId + ' unit 0 family ethernet-switching interface-mode trunk\n';
                vlans.split(/[\s,]+/).filter(Boolean).forEach(v => c += 'set interfaces ae' + aeId + ' unit 0 family ethernet-switching vlan members ' + v + '\n');
            }
            c += '\n# Doğrulama:\n# show interfaces ae' + aeId + ' detail\n# show lacp interfaces ae' + aeId + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: MC-LAG ─────────────────────────────────────────────────────
Juniper.mclag = {
    label: 'MC-LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Juniper JunOS — MC-LAG',
                desc: 'İki Juniper cihazı arasında Multi-Chassis LAG — ICCP ile kontrol düzlemi senkronizasyonu.<br><small>Örn: <code>set protocols iccp local-ip-addr 192.168.255.1</code> &nbsp;|&nbsp; <code>set interfaces ae10 aggregated-ether-options lacp system-id 00:11:22:33:44:55</code></small>'
            },
            sections: [
                {
                    title: 'ICCP Ayarları',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'local_ip', why: 'ICCP oturumunun yerel adresi; karşı cihazdan yönlendirilebilir olmalıdır. Bu oturumu ICL üzerinden taşımak, ICL koptuğunda hem veri hem kontrol yolunu aynı anda kaybetmek demektir.', label: 'ICCP Local IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.255.1', hint: 'Bu cihazın ICCP IP adresi' },
                        { name: 'peer_ip', why: "ICCP oturumunun karşı ucu. Bu oturum ayrı bir L3 yol üzerinden kurulmalıdır; ICCP koptuğu halde ICL ayakta kalırsa MC-LAG split-brain'e girip Layer 2 loop üretebilir.", label: 'ICCP Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.255.2', hint: 'Karşı cihazın ICCP IP adresi' }
                    ]
                },
                {
                    title: 'MC-LAG Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'sys_id', why: "İki şasi karşı switch'e <b>tek bir cihaz</b> gibi görünmek zorundadır; LACP system-id her iki tarafta birebir aynı olmalıdır. Farklı olursa karşı taraf iki ayrı LAG görür ve loop oluşur.", label: 'LACP System ID', type: 'text', required: true, placeholder: '00:11:22:33:44:55', hint: 'Her iki cihazda aynı LACP system-id (sanal MAC)' },
                        { name: 'ae_id', why: "MC-LAG'de iki şasideki ae numaraları farklı olabilir ama <b>LACP system-id ve mc-ae id</b> aynı olmalıdır. Uyuşmazsa karşı switch iki ayrı LAG görür ve Layer 2 loop oluşur.", label: 'AE Interface ID (MC-LAG)', type: 'text', required: true, placeholder: '10', hint: 'MC-LAG ae arayüzü numarası' },
                        { name: 'icl_ae', why: "ICL, üyelerden biri düştüğünde trafiğin diğer şasiye geçtiği yoldur ve MAC senkronizasyonunu taşır. Tek fiziksel link bırakmak ICL'i tekil arıza noktasına çevirir.", label: 'ICL AE Interface ID', type: 'text', required: true, placeholder: '0', hint: 'Inter-Chassis Link (ICL) ae arayüzü numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localIp = cgEsc(data.local_ip || ''), peerIp = cgEsc(data.peer_ip || '');
            const sysId = cgEsc(data.sys_id || ''), aeId = cgEsc(data.ae_id || ''), iclAe = cgEsc(data.icl_ae || '');
            let c = '# ========================================\n# Juniper JunOS — MC-LAG\n# ========================================\n\n';
            c += '# ICCP (Inter-Chassis Control Protocol)\n';
            c += 'set protocols iccp local-ip-addr ' + localIp + '\n';
            c += 'set protocols iccp peer ' + peerIp + ' redundancy-group-id-list 1\n';
            c += 'set protocols iccp peer ' + peerIp + ' liveness-detection minimum-interval 1000\n\n';
            c += '# MC-LAG Interface\n';
            c += 'set interfaces ae' + aeId + ' aggregated-ether-options lacp active\n';
            c += 'set interfaces ae' + aeId + ' aggregated-ether-options lacp system-id ' + sysId + '\n';
            c += 'set interfaces ae' + aeId + ' multi-chassis-protection ' + peerIp + ' interface ae' + iclAe + '\n\n';
            c += '# Redundancy Group\n';
            c += 'set multi-chassis multi-chassis-protection interface ae' + iclAe + ' redundancy-group 1\n\n';
            c += '# Doğrulama:\n# show iccp\n# show multi-chassis mc-lag interfaces\n';
            return c;
        });
    }
};

// ── Juniper JunOS: EVPN-VXLAN ────────────────────────────────────────────────
Juniper.evpnvxlan = {
    label: 'EVPN-VXLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'Juniper JunOS — EVPN-VXLAN',
                desc: 'BGP tabanlı EVPN control-plane ile VXLAN data-plane yapılandırması.<br><small>Örn: <code>set vlans VNI_10100 vxlan vni 10100</code> &nbsp;|&nbsp; <code>set protocols evpn extended-vni-list 10100</code></small>'
            },
            sections: [
                {
                    title: 'VNI & VLAN',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vni', why: "VNI, VXLAN'ın ağ kimliğidir ve aynı VLAN için tüm VTEP'lerde aynı olmalıdır. Bir uçta farklı VNI kullanmak tüneli kurdurur ama trafiği hiç eşleştirmez.", label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'vlan_id', why: "VLAN etiketi (1–4094). Karşı switch'te farklı ID kullanılırsa link yine up görünür ama trafik sessizce düşer; IRB unit numarasını VLAN ID ile eşleştirmek teşhisi kolaylaştırır.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek VLAN ID' }
                    ]
                },
                {
                    title: 'VTEP (Loopback)',
                    icon: 'fas fa-circle',
                    fields: [
                        { name: 'lo_iface', why: "VTEP kaynağı loopback olmalıdır; fiziksel arayüz kullanmak, o link düştüğünde tüm VXLAN tünellerinin kopması demektir. Bu loopback underlay'de duyurulmazsa uzak VTEP'ler birbirini hiç bulamaz.", label: 'VTEP Loopback', type: 'text', validate: 'iface', required: true, placeholder: 'lo0.0', hint: 'VTEP kaynak arayüzü (loopback)' },
                        { name: 'vtep_ip', why: "VTEP kaynak adresi <code>/32</code> olmalı ve underlay'de duyurulmalıdır. Uzak VTEP bu adrese ulaşamıyorsa EVPN route'ları görünse bile veri düzleminde tek paket geçmez.", label: 'VTEP IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/32', hint: 'Loopback IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'BGP EVPN',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'bgp_as', why: "EVPN kontrol düzlemi BGP üzerinde çalışır. AS tasarımı yanlışsa (iBGP'de route-reflector yoksa) VTEP'ler birbirinin MAC route'larını hiç görmez, tüneller boş kalır.", label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel AS numarası' },
                        { name: 'rd', why: "RD, aynı prefix'in farklı müşterilerde çakışmasını önlemek için route'u benzersizleştirir ve her VRF'te farklı olmalıdır. RD tek başına route sızdırmayı kontrol etmez — onu yapan route-target'tır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '10.0.0.1:100', hint: 'EVPN routing instance RD' },
                        { name: 'rt', why: "Route-target, VNI'ye hangi route'ların yükleneceğini belirler. Otomatik türetme kullanılmıyorsa tüm leaf'lerde aynı değer yazılmalı; tek cihazda farklı yazmak o cihazı sessizce ağdan izole eder.", label: 'Route Target', type: 'text', validate: 'rt', required: true, placeholder: 'target:65001:100', hint: 'EVPN VNI route target' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || ''), vlanId = cgEsc(data.vlan_id || '');
            const loIface = cgEsc(data.lo_iface || ''), vtepIp = cgEsc(data.vtep_ip || '');
            const bgpAs = cgEsc(data.bgp_as || ''), rd = cgEsc(data.rd || ''), rt = cgEsc(data.rt || '');
            let c = '# ========================================\n# Juniper JunOS — EVPN-VXLAN\n# ========================================\n\n';
            c += '# VTEP Loopback\nset interfaces ' + loIface.split('.')[0] + ' unit ' + (loIface.split('.')[1] || '0') + ' family inet address ' + vtepIp + '\n\n';
            c += '# VXLAN Tunnel\nset vlans VNI_' + vni + ' vxlan vni ' + vni + '\nset vlans VNI_' + vni + ' vlan-id ' + vlanId + '\n\n';
            c += '# EVPN\nset routing-instances EVPN_' + vni + ' instance-type evpn\n';
            c += 'set routing-instances EVPN_' + vni + ' vxlan source-interface ' + loIface + '\n';
            c += 'set routing-instances EVPN_' + vni + ' vxlan vni ' + vni + '\n\n';
            c += '# BGP EVPN\nset routing-options autonomous-system ' + bgpAs + '\n';
            c += 'set protocols bgp group EVPN type internal\n';
            c += 'set protocols bgp group EVPN family evpn signaling\n';
            c += 'set protocols evpn encapsulation vxlan\n';
            c += 'set protocols evpn extended-vni-list ' + vni + '\n';
            c += 'set protocols evpn vni-options vni ' + vni + ' vrf-target ' + rt + '\n\n';
            c += '# Doğrulama:\n# show evpn database\n# show bgp summary\n# show vxlan interface\n';
            return c;
        });
    }
};

// ── Juniper MX: BFD ───────────────────────────────────────────────────────────
JuniperMX.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Juniper MX — BFD',
                desc: 'Bidirectional Forwarding Detection — OSPF ve BGP için hızlı link failure detection.<br><small>Örn: <code>set protocols ospf area 0 interface ge-0/0/1.0 bfd-liveness-detection minimum-interval 300 multiplier 3</code></small>'
            },
            sections: [
                {
                    title: 'BFD Parametreleri',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'neighbor', why: "BFD oturumu iki uçta da yapılandırılmalıdır; tek taraflı konfig oturumu Down'da bırakır. Adres, üzerinde çalıştığı protokolün (OSPF/BGP) kullandığı komşu adresiyle aynı olmalıdır.", label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD komşu IP adresi' },
                        { name: 'local_addr', why: 'BFD paketlerinin kaynak adresi. Multihop senaryolarda yanlış kaynak adres karşı tarafta eşleşmez ve oturum sürekli flap ederek üzerindeki protokolü de düşürür.', label: 'Local Address', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Yerel BFD kaynak IP adresi' },
                        { name: 'min_interval', why: "Çok agresif değerler (ör. 50 ms) kontrol düzlemi yoğunken yanlış pozitif arıza algısına ve protokol flap'ine yol açar. Platformun donanım destekli BFD sunup sunmadığını bilmeden 300 ms altına inmeyin.", label: 'Min Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD hello aralığı (ms)' },
                        { name: 'multiplier', why: 'Algılama süresi = interval × multiplier. Çok düşük değer tek paket kaybında linki down sayar; çok yüksek değer ise BFD kullanmanın amacını ortadan kaldırır.', label: 'Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç hello miss sonrası failure kabul edilsin' },
                        { name: 'session_mode', why: 'Single-hop doğrudan bağlı komşular içindir; loopback üzerinden kurulan iBGP gibi oturumlarda <b>multihop</b> gerekir. Yanlış mod seçimi oturumun asla Up olmamasıyla sonuçlanır.', label: 'Session Mode', type: 'select', options: [
                            { value: 'automatic', label: 'automatic', selected: true },
                            { value: 'multihop', label: 'multihop' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const neighbor = cgEsc(data.neighbor || ''), localAddr = cgEsc(data.local_addr || '');
            const minInterval = cgEsc(data.min_interval || ''), multiplier = cgEsc(data.multiplier || '');
            const sessionMode = cgEsc(data.session_mode || 'automatic');
            let c = '# ========================================\n# Juniper MX — BFD\n# ========================================\n\n';
            c += '# BFD for OSPF:\n';
            c += 'set protocols ospf area 0 interface ge-0/0/1.0 bfd-liveness-detection minimum-interval ' + minInterval + ' multiplier ' + multiplier + '\n\n';
            c += '# BFD for BGP:\n';
            c += 'set protocols bgp group PEERS bfd-liveness-detection minimum-interval ' + minInterval + ' multiplier ' + multiplier + '\n\n';
            c += '# Static BFD session (neighbor=' + neighbor + ', local=' + localAddr + ', mode=' + sessionMode + '):\n';
            c += 'set routing-options static route 0.0.0.0/0 bfd-liveness-detection minimum-interval ' + minInterval + '\n';
            c += '\n# Doğrulama:\n# show bfd session\n# show bfd session detail\n';
            return c;
        });
    }
};

// ── Juniper MX: RSVP-TE ───────────────────────────────────────────────────────
JuniperMX.rsvpte = {
    label: 'Traffic Engineering RSVP-TE',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper MX — Traffic Engineering RSVP-TE',
                desc: 'MPLS RSVP-TE LSP — bant genişliği garantili trafik mühendisliği tüneli.<br><small>Örn: <code>set protocols mpls label-switched-path LSP-TO-PE2 to 10.255.0.2 bandwidth 100m</code></small>'
            },
            sections: [
                {
                    title: 'LSP Yapılandırması',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'lsp_name', why: "LSP adı yalnızca yerel anlamlıdır ama istatistik, policy ve sorun gidermede tek referansınızdır. Aynı adı iki LSP'de kullanmak ikincisinin birincisini ezmesine neden olur.", label: 'LSP Adı', type: 'text', required: true, placeholder: 'LSP-TO-PE2', hint: 'Label Switched Path adı' },
                        { name: 'destination', why: "Hedef PE'nin router-ID'si olmalıdır; fiziksel arayüz adresi vermek RSVP'nin yolu kuramamasına yol açar. Hedef loopback IGP'de görünmüyorsa LSP Down kalır.", label: 'Destination (Router ID)', type: 'text', required: true, placeholder: '10.255.0.2', hint: 'Hedef PE Router-ID' },
                        { name: 'bandwidth', why: "Ayrılan bant genişliği gerçek trafiği sınırlamaz, sadece CSPF hesabında rezervasyon yapar. Aşırı rezervasyon, kapasitesi olan linklerde bile LSP'nin kurulamamasına neden olur.", label: 'Bandwidth', type: 'text', required: true, placeholder: '100m', hint: 'Bant genişliği (ör: 100m, 1g)' },
                        { name: 'primary_path', why: 'Adlandırılmış yol, <code>explicit-path</code> ile hop zorlamak veya yedek yolla karşılaştırmak için kullanılır. Yedek yolun birincisiyle aynı fiziksel güzergâhı paylaşmadığından emin olun, yoksa koruma kâğıt üzerinde kalır.', label: 'Primary Path Adı', type: 'text', required: true, placeholder: 'PATH-DIRECT', hint: 'Birincil yol adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const lspName = cgEsc(data.lsp_name || ''), destination = cgEsc(data.destination || '');
            const bandwidth = cgEsc(data.bandwidth || ''), primaryPath = cgEsc(data.primary_path || '');
            let c = '# ========================================\n# Juniper MX — Traffic Engineering RSVP-TE\n# ========================================\n\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' to ' + destination + '\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' bandwidth ' + bandwidth + '\n';
            c += 'set protocols mpls label-switched-path ' + lspName + ' primary ' + primaryPath + '\n';
            c += 'set protocols mpls path ' + primaryPath + ' ' + destination + ' strict\n';
            c += 'set protocols rsvp interface ge-0/0/1.0\n';
            c += 'set protocols mpls interface ge-0/0/1.0\n';
            c += '\n# Doğrulama:\n# show mpls lsp\n# show rsvp session\n';
            return c;
        });
    }
};

// ── Juniper MX: Class-of-Service (QoS) ───────────────────────────────────────
JuniperMX.cos = {
    label: 'QoS / Class-of-Service',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Juniper MX — QoS / Class-of-Service',
                desc: 'Forwarding class, DSCP classifier ve scheduler map yapılandırması.<br><small>Örn: <code>set class-of-service forwarding-classes class voice queue-num 5</code></small>'
            },
            sections: [
                {
                    title: 'Forwarding Class & Scheduler',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'forwarding_class', why: "Trafik sınıfı bir kuyruğa eşlenir. JunOS'un varsayılan <b>network-control</b> sınıfı protokol paketlerinin tıkanmada düşmesini önler — yeni şema yazarken onu ezmek OSPF/BGP flap'ine yol açar.", label: 'Forwarding Class Adı', type: 'text', required: true, placeholder: 'voice', hint: 'Trafik sınıfı adı (ör: voice, video, best-effort)' },
                        { name: 'scheduler_map_name', why: 'Scheduler map arayüze uygulanmadıkça QoS hiçbir şey yapmaz; uygulama <code>class-of-service interfaces</code> altında yapılır. Yanlış arayüze bağlanan map sessizce etkisiz kalır.', label: 'Scheduler Map Adı', type: 'text', required: true, placeholder: 'SCH-MAP-EDGE', hint: 'Scheduler map adı' },
                        { name: 'shaping_rate', why: 'Şekillendirme, hattın gerçek kapasitesinin biraz altına ayarlanmalıdır; aksi halde kuyruk sizde değil sağlayıcıda oluşur ve önceliklendirme tamamen anlamsızlaşır.', label: 'Shaping Rate', type: 'text', required: true, placeholder: '100m', hint: 'Maksimum şekillendirme hızı (ör: 100m, 1g)' },
                        { name: 'priority', why: 'Strict-high kuyruk yukarıdan sınırlandırılmazsa diğer tüm sınıfları aç bırakabilir. Sesi strict-high yaparken mutlaka bir transmit-rate veya shaping sınırı koyun.', label: 'Priority', type: 'select', options: [
                            { value: 'high', label: 'high', selected: true },
                            { value: 'medium-high', label: 'medium-high' },
                            { value: 'low', label: 'low' }
                        ]},
                        { name: 'dscp_match', why: 'Sınıflandırma işaretlere güvenir. Sınır cihazında güvenilmeyen işaretleri yeniden yazmazsanız istemciler kendilerini EF işaretleyip öncelikli kuyruğu ele geçirir.', label: 'DSCP Match', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP code point (ör: ef, af41, cs3, be)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const forwardingClass = cgEsc(data.forwarding_class || '');
            const schedulerMapName = cgEsc(data.scheduler_map_name || '');
            const shapingRate = cgEsc(data.shaping_rate || ''), priority = cgEsc(data.priority || 'high');
            const dscpMatch = cgEsc(data.dscp_match || '');
            let c = '# ========================================\n# Juniper MX — QoS / Class-of-Service\n# ========================================\n\n';
            c += 'set class-of-service forwarding-classes class ' + forwardingClass + ' queue-num 5\n';
            c += 'set class-of-service classifiers dscp DSCP-CLASSIFIER forwarding-class ' + forwardingClass + ' loss-priority low code-points ' + dscpMatch + '\n';
            c += 'set class-of-service schedulers SCH-' + forwardingClass + ' priority ' + priority + ' shaping-rate ' + shapingRate + '\n';
            c += 'set class-of-service scheduler-maps ' + schedulerMapName + ' forwarding-class ' + forwardingClass + ' scheduler SCH-' + forwardingClass + '\n';
            c += '\n# Doğrulama:\n# show class-of-service interface\n# show class-of-service classifier\n';
            return c;
        });
    }
};

// ── Juniper MX: Routing Policy + Prefix-List ─────────────────────────────────
JuniperMX.routepolicy = {
    label: 'Routing Policy + Prefix-List',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'Juniper MX — Routing Policy + Prefix-List',
                desc: 'Prefix-list tanımı, policy-statement term eşleştirmesi ve community tagging.<br><small>Örn: <code>set policy-options prefix-list PL-CUSTOMER 192.168.0.0/16 upto /24</code></small>'
            },
            sections: [
                {
                    title: 'Prefix-List',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'pl_name', why: "Prefix-list, policy içinde yeniden kullanılabilir bir liste sunar. Boş bir prefix-list'e atıfta bulunan term hiçbir şeyle eşleşmez ve sessizce atlanır — policy doğru görünse de çalışmaz.", label: 'Prefix-List Adı', type: 'text', required: true, placeholder: 'PL-CUSTOMER', hint: 'Prefix listesi adı' },
                        { name: 'prefix', why: "<code>upto</code>, <code>exact</code>, <code>orlonger</code> niteleyicileri eşleşmenin kapsamını tamamen değiştirir: <code>exact</code> alt prefix'leri kaçırır, <code>orlonger</code> ise beklediğinizden çok fazlasını yakalar.", label: 'Prefix', type: 'text', required: true, placeholder: '192.168.0.0/16 upto /24', hint: 'Prefix ve opsiyonel upto koşulu' }
                    ]
                },
                {
                    title: 'Policy Statement',
                    icon: 'fas fa-code-branch',
                    fields: [
                        { name: 'policy_name', why: "Policy, tanımlandığı yerde değil uygulandığı yerde (BGP import/export, OSPF export) çalışır. Uygulamayı unutmak, doğru yazılmış bir policy'nin hiçbir etkisi olmaması demektir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-EXPORT', hint: 'Policy statement adı' },
                        { name: 'term_name', why: "Term'ler <b>yazıldıkları sırayla</b> değerlendirilir ve ilk eşleşen kazanır. Genel bir term'i yukarı koyarsanız altındaki özel term'ler hiç çalışmaz; doğru konuma almak için <code>insert</code> komutunu kullanın.", label: 'Term Adı', type: 'text', required: true, placeholder: 'MATCH-CUSTOMER', hint: 'Policy term adı' },
                        { name: 'action', why: "Policy term'inde <code>accept</code>/<code>reject</code> değerlendirmeyi bitirir, <code>next term</code> devam ettirir. Hiçbir term eşleşmezse protokolün varsayılan davranışı devreye girer; BGP export'ta bu, route'un hiç duyurulmaması demektir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'accept', label: 'accept', selected: true },
                            { value: 'reject', label: 'reject' }
                        ]},
                        { name: 'set_community', why: "Community eklerken <code>set</code> mevcut değerleri ezer, <code>add</code> üzerine ekler. Yanlışını seçmek karşı tarafın filtrelediği bir etiketi silip route'un beklenmedik yerlere yayılmasına yol açar.", label: 'Set Community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community ekle (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const plName = cgEsc(data.pl_name || ''), prefix = cgEsc(data.prefix || '');
            const policyName = cgEsc(data.policy_name || ''), termName = cgEsc(data.term_name || '');
            const action = cgEsc(data.action || 'accept'), setCommunity = cgEsc(data.set_community || '');
            let c = '# ========================================\n# Juniper MX — Routing Policy + Prefix-List\n# ========================================\n\n';
            c += 'set policy-options prefix-list ' + plName + ' ' + prefix + '\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' from prefix-list ' + plName + '\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' from protocol bgp\n';
            c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' then ' + action + '\n';
            if (setCommunity) {
                c += 'set policy-options community COMM-' + policyName + ' members ' + setCommunity + '\n';
                c += 'set policy-options policy-statement ' + policyName + ' term ' + termName + ' then community add COMM-' + policyName + '\n';
            }
            c += 'set policy-options policy-statement ' + policyName + ' term DEFAULT then reject\n';
            c += '\n# Doğrulama:\n# show route advertising-protocol bgp <neighbor> policy ' + policyName + '\n';
            return c;
        });
    }
};

// ── Juniper MX: SNMP v3 ───────────────────────────────────────────────────────
JuniperMX.snmp = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'Juniper MX — SNMP v3',
                desc: 'USM kullanıcı, authentication/privacy protokolü ve trap hedefi yapılandırması.<br><small>Örn: <code>set snmp v3 usm local-engine user snmp-mx authentication-sha authentication-password AuthPass123!</code></small>'
            },
            sections: [
                {
                    title: 'USM Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'usm_user', why: 'SNMPv3 kullanıcı adı NMS tarafındaki tanımla birebir aynı olmalıdır. Uyuşmazlığı anlamlı bir hata olarak değil, yalnızca zaman aşımı olarak görürsünüz — teşhisi bu yüzden zordur.', label: 'USM User', type: 'text', required: true, placeholder: 'snmp-mx', hint: 'SNMP v3 USM kullanıcı adı' },
                        { name: 'auth_proto', why: 'MD5 artık zayıf kabul edilir, mümkünse SHA seçin. Protokolü değiştirip NMS tarafını güncellemezseniz cihaz sessizce cevap vermez.', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', why: "Şifre konfigde hash'li görünse de yedeklerde taşınır. SNMP kullanıcısına yazma yetkisi gerekmedikçe yalnızca read-only view bağlayın.", label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Authentication şifresi (min 8 karakter)' },
                        { name: 'priv_proto', why: 'Privacy kapalıysa SNMP verisi düz metin gider ve tüm topoloji bilgisi dinlenebilir. DES yerine AES tercih edin; desteklemeyen NMS güncellenmelidir.', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_pass', why: 'Auth şifresiyle aynı değeri kullanmak yaygın ama kötü bir alışkanlıktır: tek bir sızıntı hem doğrulamayı hem şifrelemeyi aynı anda çökertir.', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
                    icon: 'fas fa-bullseye',
                    fields: [
                        { name: 'trap_group', why: 'Trap group hem sürümü hem alıcıları belirler. <code>categories</code> verilmezse (timing-events dışında) tüm trap kategorileri gönderilir; NMS\'i gereksiz trap\'le boğmamak için ihtiyaç duyulan kategorilere daraltın.', label: 'Trap Group Adı', type: 'text', required: true, placeholder: 'TRAPS', hint: 'SNMP trap group adı' },
                        { name: 'target_ip', why: "Alıcı adres yönlendirilebilir olmalı ve trap'lerin çıkacağı kaynak adres NMS tarafında tanımlı olmalıdır; tanımadığı kaynaktan gelen trap'i NMS sessizce düşürür.", label: 'Target IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap alıcısı IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const usmUser = cgEsc(data.usm_user || ''), authProto = cgEsc(data.auth_proto || 'sha');
            const authPass = cgEsc(data.auth_pass || ''), privProto = cgEsc(data.priv_proto || 'aes128');
            const privPass = cgEsc(data.priv_pass || ''), trapGroup = cgEsc(data.trap_group || '');
            const targetIp = cgEsc(data.target_ip || '');
            let c = '# ========================================\n# Juniper MX — SNMP v3\n# ========================================\n\n';
            c += 'set snmp v3 usm local-engine user ' + usmUser + ' authentication-' + authProto + ' authentication-password ' + authPass + '\n';
            c += 'set snmp v3 usm local-engine user ' + usmUser + ' privacy-' + privProto + ' privacy-password ' + privPass + '\n';
            c += 'set snmp v3 target-parameters ' + usmUser + '-params parameters security-model usm security-level privacy security-name ' + usmUser + '\n';
            c += 'set snmp trap-group ' + trapGroup + ' version v3\n';
            c += 'set snmp trap-group ' + trapGroup + ' targets ' + targetIp + '\n';
            c += '\n# Doğrulama:\n# show snmp v3\n';
            return c;
        });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// Juniper JunOS (EX/QFX, ELS) — yönetim, L2 koruma ve yönlendirme araçları
// ═════════════════════════════════════════════════════════════════════════════

// Virgül/boşluk ayrılmış listeyi temiz diziye çevirir.
function cgJnpList(s) {
    return String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
}
// 'ge-0/0/1.0' → ['ge-0/0/1', '0'];  'ge-0/0/1' → ['ge-0/0/1', '0']
function cgJnpIfUnit(i) {
    const m = String(i).match(/^(.+?)\.(\d+)$/);
    return m ? [m[1], m[2]] : [String(i), '0'];
}
// Serbest metni çift tırnak içine güvenle koymak için içteki çift tırnakları temizler.
function cgJnpTxt(s) {
    return String(s || '').replace(/"/g, "'").replace(/\s+/g, ' ').trim();
}
function cgJnpHdr(t) {
    return '# ========================================\n# Juniper JunOS — ' + t + '\n# ========================================\n\n';
}
const CG_JNP_SEV = [
    { value: 'emergency', label: 'emergency' },
    { value: 'alert', label: 'alert' },
    { value: 'critical', label: 'critical' },
    { value: 'error', label: 'error' },
    { value: 'warning', label: 'warning' },
    { value: 'notice', label: 'notice' },
    { value: 'info', label: 'info' },
    { value: 'any', label: 'any (tüm seviyeler)' }
];
function cgJnpSev(def) { return CG_JNP_SEV.map(o => Object.assign({}, o, o.value === def ? { selected: true } : {})); }

// ── Juniper JunOS: Sistem Temeli (DNS / NTP / Banner) ────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: ntp server … prefer, ntp boot-server,
//   name-server, time-zone) + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/ntp-edit-system.html
//   (ntp source-address) + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/domain-name-edit-system.html
//   + https://www.juniper.net/documentation/us/en/software/junos/user-access/topics/topic-map/junos-os-login-settings.html (login message / announcement)
Juniper.system = {
    label: 'Sistem Temeli (DNS/NTP/Banner)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Juniper JunOS — Sistem Temeli',
                desc: 'NTP, DNS, domain-name, saat dilimi ve login banner (message / announcement). Hostname için <b>Genel</b> aracını kullanın.<br><small>Örn: <code>set system ntp server 192.0.2.10 prefer</code> &nbsp;|&nbsp; <code>set system name-server 192.0.2.53</code></small>'
            },
            sections: [
                {
                    title: 'NTP',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'ntp1', label: 'NTP Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.10', hint: 'Birincil NTP sunucusu (IPv4)', why: 'Saat kayarsa syslog zaman damgaları olaylarla eşleşmez, sertifika/SSH anahtar doğrulaması ve commit geçmişi yanıltıcı olur. Olay incelemesinde ilk bakılan şey doğru saattir.' },
                        { name: 'ntp1_prefer', label: 'Sunucu 1 tercihli (prefer)', type: 'checkbox', checked: true, why: '<code>prefer</code> işaretli sunucu, eşit kalitedeki adaylar arasında seçilir. İki sunucu farklı saat verirse cihazın hangisine kilitleneceği belirsiz kalmaz.' },
                        { name: 'ntp2', label: 'NTP Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.11', hint: 'Yedek NTP sunucusu', why: 'Tek NTP sunucusu tekil arıza noktasıdır; o sunucu kapanınca saat sessizce kaymaya başlar. En az iki (tercihen üç) kaynak önerilir.' },
                        { name: 'boot_srv', label: 'Sunucu 1 aynı zamanda boot-server olsun', type: 'checkbox', checked: true, why: '<code>boot-server</code>, açılışta saatin bir kerede ayarlandığı sunucudur. Tanımlı değilse cihaz saati çok farklı başlatıp NTP senkronunu uzun süre kuramayabilir.' },
                        { name: 'ntp_src', label: 'NTP Kaynak Adresi', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'NTP paketlerinin çıkacağı yerel adres (loopback/mgmt)', why: 'NTP sunucusu veya firewall yalnız belirli kaynak adreslere izin veriyorsa, cihaz farklı bir arayüzden çıktığında istekler sessizce düşer.' }
                    ]
                },
                {
                    title: 'DNS & Saat Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'dns1', label: 'DNS Sunucu 1', type: 'text', validate: 'ip', placeholder: '192.0.2.53', hint: 'name-server', why: 'DNS yoksa <code>ping</code>/<code>ssh</code> ad ile çalışmaz ve ad kullanan NTP/syslog hedefleri çözülemez. Ulaşılamayan DNS ise CLI komutlarını çözümleme zaman aşımı kadar yavaşlatır.' },
                        { name: 'dns2', label: 'DNS Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.54', hint: 'Yedek name-server', why: 'İkinci sunucu, birincisi yanıt vermediğinde devreye girer; tek DNS ile her çözümleme o sunucunun erişilebilirliğine bağlı kalır.' },
                        { name: 'domain', label: 'Domain Adı', type: 'text', validate: 'hostname', placeholder: 'example.net', hint: 'Tam nitelenmemiş adlara eklenecek alan adı', why: 'Kısa adlar (ör. <code>ntp1</code>) bu alan adıyla tamamlanır. Yanlış domain, kısa adların hiç çözülmemesine veya başka bir hosta çözülmesine yol açar.' },
                        { name: 'tz', label: 'Saat Dilimi', type: 'text', placeholder: 'Europe/Istanbul', hint: 'Bölge/Şehir biçiminde (ör. Europe/Istanbul, UTC)', why: 'Log ve <code>show system uptime</code> çıktıları bu dilimde gösterilir. Farklı cihazlarda farklı dilim kullanmak olay korelasyonunu zorlaştırır; merkezi logda genelde UTC tercih edilir.' }
                    ]
                },
                {
                    title: 'Login Banner',
                    icon: 'fas fa-comment-alt',
                    fields: [
                        { name: 'login_msg', label: 'Login Mesajı (giriş öncesi)', type: 'text', placeholder: 'Yetkisiz erisim yasaktir. Tum oturumlar kayit altindadir.', hint: 'Kullanıcı adı sorulmadan önce gösterilir', why: 'Giriş öncesi uyarı, yetkisiz erişimde hukuki dayanak sağlar ve birçok denetim standardında zorunludur. İç sistem bilgisi (model, sürüm, lokasyon) yazmayın; saldırgana keşif bilgisi verir.' },
                        { name: 'announce', label: 'Duyuru (giriş sonrası)', type: 'text', placeholder: 'Degisiklikler icin commit confirmed kullanin.', hint: 'Başarılı girişten sonra gösterilir', why: 'Operatörlere bakım penceresi, değişiklik kuralı gibi notları iletmek için kullanılır; giriş öncesi mesajdan farklı olarak yalnız yetkili kullanıcılar görür.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ntp1 = cgEsc(data.ntp1 || ''), ntp2 = cgEsc(data.ntp2 || ''), src = cgEsc(data.ntp_src || '');
            const dns1 = cgEsc(data.dns1 || ''), dns2 = cgEsc(data.dns2 || ''), dom = cgEsc(data.domain || ''), tz = cgEsc(data.tz || '');
            const msg = cgEsc(cgJnpTxt(data.login_msg)), ann = cgEsc(cgJnpTxt(data.announce));
            let c = cgJnpHdr('Sistem Temeli');
            c += '# NTP\n';
            if (data.boot_srv) c += 'set system ntp boot-server ' + ntp1 + '\n';
            c += 'set system ntp server ' + ntp1 + (data.ntp1_prefer ? ' prefer' : '') + '\n';
            if (ntp2) c += 'set system ntp server ' + ntp2 + '\n';
            if (src) c += 'set system ntp source-address ' + src + '\n';
            if (dns1 || dns2 || dom || tz) {
                c += '\n# DNS / Saat dilimi\n';
                if (dns1) c += 'set system name-server ' + dns1 + '\n';
                if (dns2) c += 'set system name-server ' + dns2 + '\n';
                if (dom) c += 'set system domain-name ' + dom + '\n';
                if (tz) c += 'set system time-zone ' + tz + '\n';
            }
            if (msg || ann) {
                c += '\n# Login banner\n';
                if (msg) c += 'set system login message "' + msg + '"\n';
                if (ann) c += 'set system login announcement "' + ann + '"\n';
            }
            c += '\n# Doğrulama:\n# show ntp associations\n# show ntp status\n# show system uptime\n# show configuration system\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Syslog ─────────────────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: syslog host … any any, host … source-address,
//   file … any notice, file … interactive-commands info, file … authorization info,
//   file … archive files N, file … structured-data)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/syslog-edit-system.html
Juniper.syslog = {
    label: 'Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Juniper JunOS — Syslog',
                desc: 'Uzak syslog sunucuları, kaynak adres ve yerel log dosyası (CLI komut kaydı dahil).<br><small>Örn: <code>set system syslog host 192.0.2.20 any info</code> &nbsp;|&nbsp; <code>set system syslog file CHANGES interactive-commands info</code></small>'
            },
            sections: [
                {
                    title: 'Uzak Syslog',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'host1', label: 'Syslog Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.20', hint: 'Merkezi log sunucusu', why: 'Cihazın yerel log alanı küçüktür ve dönerek silinir; bir arıza veya yetkisiz erişim sonrası kanıt çoğunlukla yalnız merkezi sunucuda kalır.' },
                        { name: 'host1_sev', label: 'Sunucu 1 Seviye (facility any)', type: 'select', options: cgJnpSev('info'), why: 'Seçilen seviye ve üstü gönderilir. <b>any</b> hata ayıklama seviyesini de içerir ve log sunucusunu gereksiz yere doldurabilir; <b>info</b> operasyon için genelde yeterlidir.' },
                        { name: 'host2', label: 'Syslog Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.21', hint: 'Yedek log sunucusu (aynı seviye)', why: 'Syslog UDP ile gider ve teslim onayı yoktur; tek sunucu bakımdayken üretilen loglar kalıcı olarak kaybolur.' },
                        { name: 'src', label: 'Kaynak Adres', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'Log paketlerinin kaynak IP\'si (loopback/mgmt)', why: 'Log sunucusu kaydı kaynak IP ile cihaza eşler. Kaynak sabitlenmezse çıkış arayüzüne göre farklı IP\'lerden gelir ve aynı cihaz iki ayrı kaynak gibi görünür.' }
                    ]
                },
                {
                    title: 'Yerel Log Dosyası',
                    icon: 'fas fa-hdd',
                    fields: [
                        { name: 'file_en', label: 'Yerel log dosyası tanımla', type: 'checkbox', why: 'Uzak sunucuya erişim kesildiğinde olayları cihaz üzerinde görebilmenin tek yolu yerel dosyadır.' },
                        { name: 'file_name', label: 'Dosya Adı', type: 'text', requiredIf: { field: 'file_en', checked: true }, placeholder: 'SYSLOG-LOCAL', hint: '/var/log altında oluşturulur', why: 'Varsayılan <code>messages</code> dosyasından ayrı tutmak, ilgili kayıtları <code>show log DOSYA</code> ile hızlıca süzmeyi sağlar.' },
                        { name: 'file_sev', label: 'Dosya Seviyesi (facility any)', type: 'select', options: cgJnpSev('notice'), why: 'Yerel disk sınırlıdır; düşük seviye (<b>info/any</b>) dosyayı hızla döndürür ve eski kayıtlar kaybolur.' },
                        { name: 'file_cmds', label: 'CLI komutlarını da kaydet (interactive-commands info)', type: 'checkbox', checked: true, why: 'Kim hangi komutu ne zaman çalıştırdı sorusunun cevabıdır. Değişiklik sonrası kesintilerde kök nedeni bulmayı çok hızlandırır.' },
                        { name: 'file_auth', label: 'Kimlik doğrulama olaylarını kaydet (authorization info)', type: 'checkbox', checked: true, why: 'Başarısız giriş denemeleri ve yetki hataları bu facility ile gelir; kaba kuvvet denemesini ancak bu kayıtla fark edersiniz.' },
                        { name: 'file_files', label: 'Arşiv Dosya Sayısı', type: 'text', validate: 'posint', placeholder: '10', hint: 'Döndürmede tutulacak eski dosya sayısı', why: 'Dosya dolunca sıkıştırılıp döndürülür; bu sayı aşılınca en eski arşiv silinir. Az tutmak geçmişe dönük incelemeyi kısaltır.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const h1 = cgEsc(data.host1 || ''), h2 = cgEsc(data.host2 || ''), sev = cgEsc(data.host1_sev || 'info');
            const src = cgEsc(data.src || '');
            let c = cgJnpHdr('Syslog');
            c += 'set system syslog host ' + h1 + ' any ' + sev + '\n';
            if (src) c += 'set system syslog host ' + h1 + ' source-address ' + src + '\n';
            if (h2) {
                c += 'set system syslog host ' + h2 + ' any ' + sev + '\n';
                if (src) c += 'set system syslog host ' + h2 + ' source-address ' + src + '\n';
            }
            const fname = cgEsc(data.file_name || ''), fsev = cgEsc(data.file_sev || 'notice'), files = cgEsc(data.file_files || '');
            if (data.file_en && fname) {
                c += '\n# Yerel log dosyası\n';
                c += 'set system syslog file ' + fname + ' any ' + fsev + '\n';
                if (data.file_auth) c += 'set system syslog file ' + fname + ' authorization info\n';
                if (data.file_cmds) c += 'set system syslog file ' + fname + ' interactive-commands info\n';
                if (files) c += 'set system syslog file ' + fname + ' archive files ' + files + '\n';
            }
            c += '\n# Doğrulama:\n# show configuration system syslog\n';
            if (data.file_en && fname) c += '# show log ' + fname + '\n';
            c += '# show log messages\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Kullanıcı & Login Class ────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: login user … class super-user,
//   authentication encrypted-password, root-authentication encrypted-password,
//   login class … permissions view / view-configuration, login idle-timeout,
//   retry-options tries-before-disconnect/backoff-threshold/backoff-factor/lockout-period)
//   + https://www.juniper.net/documentation/us/en/software/junos/user-access/topics/topic-map/junos-os-user-accounts.html
//   (authentication ssh-ed25519|ssh-rsa|ssh-ecdsa, plain-text-password, class … permissions [ ... ])
//   + https://www.juniper.net/documentation/us/en/software/junos/user-access/topics/topic-map/junos-os-login-settings.html (class idle-timeout)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/retry-options-edit-system.html (aralıklar)
Juniper.users = {
    label: 'Kullanıcı & Login Class',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Juniper JunOS — Kullanıcı & Login Class',
                desc: 'Yerel kullanıcı, hazır veya özel login class, parola/SSH anahtarı, oturum zaman aşımı ve başarısız giriş (retry-options) koruması.<br><small>Örn: <code>set system login user netops class super-user authentication ssh-ed25519 "..."</code></small>'
            },
            configTypes: [
                { id: 'builtin', label: 'Hazır Sınıf', icon: 'fas fa-user', desc: 'super-user / operator / read-only', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'custom', label: 'Özel Sınıf', icon: 'fas fa-user-cog', desc: 'Kendi yetki setiniz + idle-timeout', badge: { text: 'En Az Yetki', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Kullanıcı',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netops', hint: 'Küçük harf, rakam, tire', why: 'Ortak hesap (ör. herkesin kullandığı <code>admin</code>) yerine kişiye özel hesap açmak, <code>interactive-commands</code> loglarında değişikliği kimin yaptığını görmenin tek yoludur.' },
                        { name: 'auth', label: 'Kimlik Doğrulama', type: 'select', options: [
                            { value: 'sshkey', label: 'SSH açık anahtarı', selected: true },
                            { value: 'hash', label: 'Şifrelenmiş parola (hash)' },
                            { value: 'plain', label: 'Düz parola (CLI sorar)' }
                        ], why: 'SSH anahtarı parola tahmin saldırılarını anlamsız kılar. Hash seçeneği parolayı konfig metnine düz yazmadan taşımanızı sağlar; düz parola seçeneğinde CLI parolayı etkileşimli sorar, bu yüzden <code>load set</code> ile toplu yüklemede çalışmaz.' },
                        { name: 'key_type', label: 'Anahtar Tipi', type: 'select', options: [
                            { value: 'ssh-ed25519', label: 'ssh-ed25519', selected: true },
                            { value: 'ssh-ecdsa', label: 'ssh-ecdsa' },
                            { value: 'ssh-rsa', label: 'ssh-rsa' }
                        ], why: 'Anahtar tipi, yapıştırdığınız açık anahtarın başındaki türle aynı olmalı; uyuşmazsa commit hata verir veya anahtar hiç eşleşmez.' },
                        { name: 'ssh_key', label: 'SSH Açık Anahtarı', type: 'text', requiredIf: { field: 'auth', in: ['sshkey'] }, placeholder: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExampleExampleExampl netops@example', hint: '~/.ssh/id_ed25519.pub içeriğinin tamamı (tek satır)', why: 'Yalnız <b>açık</b> (.pub) anahtar yapıştırılır. Özel anahtarı yapıştırmak onu konfig yedeklerine ve log sunucularına sızdırır.' },
                        { name: 'pw_hash', label: 'Parola Hash', type: 'text', requiredIf: { field: 'auth', in: ['hash'] }, placeholder: '$6$EXAMPLEsalt$ExampleHashValueOnlyForPreview0123456789', hint: 'Başka bir Junos cihazdaki encrypted-password değeri veya $6$ (SHA-512) hash', why: 'Hash konfigde düz parola bırakmaz; yine de yedek dosyaları çalınırsa çevrimdışı kırılabilir. Güçlü ve benzersiz parola kullanın.' }
                    ]
                },
                {
                    title: 'Hazır Sınıf',
                    icon: 'fas fa-id-badge',
                    showFor: ['builtin'],
                    fields: [
                        { name: 'builtin_class', label: 'Hazır Sınıf', type: 'select', options: [
                            { value: 'read-only', label: 'read-only', selected: true },
                            { value: 'operator', label: 'operator' },
                            { value: 'super-user', label: 'super-user' }
                        ], why: 'En az yetki ilkesi: izleme yapacak kişiye <b>super-user</b> vermek, yanlışlıkla <code>delete</code> veya <code>request system reboot</code> çalıştırabilmesi demektir. Not: operator ve read-only sınıflarında SCP/SFTP kapalıdır.' }
                    ]
                },
                {
                    title: 'Özel Login Class',
                    icon: 'fas fa-user-cog',
                    showFor: ['custom'],
                    fields: [
                        { name: 'class_name', label: 'Sınıf Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['custom'] }, placeholder: 'NOC-RO', hint: 'Hazır sınıf adlarını (super-user, operator, read-only, unauthorized) kullanmayın', why: 'Hazır sınıflar değiştirilemez; kendi yetki setiniz ve zaman aşımınız için yeni bir sınıf gerekir. RADIUS/TACACS ile gelen kullanıcılar da bu ada eşlenebilir.' },
                        { name: 'perms', label: 'Yetki Seti', type: 'select', options: [
                            { value: 'view view-configuration', label: 'İzleme: view + view-configuration', selected: true },
                            { value: 'clear network reset trace view', label: 'Operatör: clear network reset trace view' },
                            { value: 'all', label: 'Tam yetki: all' }
                        ], why: '<code>view-configuration</code> konfigi görmeyi sağlar ama değiştirmeyi değil. <code>all</code> super-user ile eşdeğerdir; özel sınıf açmanın amacı genelde yetkiyi daraltmaktır.' },
                        { name: 'class_idle', label: 'Idle Timeout (dk)', type: 'text', validate: 'posint', placeholder: '15', hint: 'Boşta kalan oturum bu süre sonunda kapatılır', why: 'Açık bırakılmış bir terminal, oturumu devralan herkese o kullanıcının yetkisini verir. Zaman aşımı bu riski sınırlar.' }
                    ]
                },
                {
                    title: 'Genel Login Koruması',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'global_idle', label: 'Global Idle Timeout (dk)', type: 'text', validate: 'posint', placeholder: '30', hint: 'Tüm oturumlar için (system login idle-timeout)', why: 'Sınıf bazlı zaman aşımı olmayan hazır sınıflardaki oturumları da kapsar; boşta unutulan SSH oturumlarını temizler.' },
                        { name: 'tries', label: 'Bağlantı Başına Deneme', type: 'text', min: 2, max: 10, placeholder: '3', hint: 'tries-before-disconnect (2–10)', why: 'Bu sayıda başarısız parola sonrası bağlantı kesilir; kaba kuvvet denemesini yavaşlatır.' },
                        { name: 'backoff_th', label: 'Gecikme Eşiği', type: 'text', min: 1, max: 3, placeholder: '2', hint: 'backoff-threshold (1–3)', why: 'Bu sayıda hatadan sonra her yeni denemeden önce bekleme eklenir; otomatik tahmin araçlarının hızını düşürür.' },
                        { name: 'backoff_f', label: 'Gecikme Artışı (sn)', type: 'text', min: 5, max: 10, placeholder: '5', hint: 'backoff-factor (5–10)', why: 'Eşikten sonraki her denemede bekleme bu kadar artar.' },
                        { name: 'lockout', label: 'Kilitleme Süresi (dk)', type: 'text', min: 1, max: 43200, placeholder: '15', hint: 'lockout-period (1–43200)', why: 'Deneme limiti dolunca hesap bu süre kilitlenir. Çok uzun tutmak, tek yönetici hesabının saldırgan tarafından bilerek kilitlenmesine (DoS) yol açabilir; konsol erişimini unutmayın.' }
                    ]
                },
                {
                    title: 'Root Parolası',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'root_hash', label: 'Root Parola Hash', type: 'text', placeholder: '$6$EXAMPLEsalt$RootHashValueOnlyForPreview0123456789ab', hint: 'Boş bırakılırsa root parolasına dokunulmaz', why: 'Junos root parolası tanımlanmadan commit kabul etmez; mevcut cihazda boş bırakın. Root yalnız konsol/acil durum içindir, günlük iş için kişisel hesap kullanın.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'builtin';
            const user = cgEsc(data.user || ''), auth = data.auth || 'sshkey';
            const ktype = cgEsc(data.key_type || 'ssh-ed25519'), key = cgEsc(cgJnpTxt(data.ssh_key)), hash = cgEsc(cgJnpTxt(data.pw_hash));
            const cname = cgEsc(data.class_name || ''), perms = cgEsc(data.perms || 'view view-configuration'), cidle = cgEsc(data.class_idle || '');
            const cls = type === 'custom' ? cname : cgEsc(data.builtin_class || 'read-only');
            let c = cgJnpHdr('Kullanıcı & Login Class');
            if (type === 'custom' && cname) {
                c += '# Özel login class\n';
                c += 'set system login class ' + cname + ' permissions [ ' + perms + ' ]\n';
                if (cidle) c += 'set system login class ' + cname + ' idle-timeout ' + cidle + '\n';
                c += '\n';
            }
            c += '# Kullanıcı\n';
            if (cls) c += 'set system login user ' + user + ' class ' + cls + '\n';
            if (auth === 'sshkey' && key) c += 'set system login user ' + user + ' authentication ' + ktype + ' "' + key + '"\n';
            else if (auth === 'hash' && hash) c += 'set system login user ' + user + ' authentication encrypted-password "' + hash + '"\n';
            else if (auth === 'plain') c += '# NOT: Aşağıdaki satır parolayı etkileşimli sorar; load set ile toplu yüklemede kullanılamaz.\nset system login user ' + user + ' authentication plain-text-password\n';
            const gidle = cgEsc(data.global_idle || ''), tries = cgEsc(data.tries || ''), bth = cgEsc(data.backoff_th || '');
            const bf = cgEsc(data.backoff_f || ''), lock = cgEsc(data.lockout || '');
            if (gidle || tries || bth || bf || lock) {
                c += '\n# Login koruması\n';
                if (gidle) c += 'set system login idle-timeout ' + gidle + '\n';
                if (tries) c += 'set system login retry-options tries-before-disconnect ' + tries + '\n';
                if (bth) c += 'set system login retry-options backoff-threshold ' + bth + '\n';
                if (bf) c += 'set system login retry-options backoff-factor ' + bf + '\n';
                if (lock) c += 'set system login retry-options lockout-period ' + lock + '\n';
            }
            const root = cgEsc(cgJnpTxt(data.root_hash));
            if (root) c += '\n# Root parolası\nset system root-authentication encrypted-password "' + root + '"\n';
            c += '\n# Doğrulama:\n# show system users\n# show configuration system login\n';
            return c;
        });
    }
};

// ── Juniper JunOS: SSH Servisi ────────────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: services ssh protocol-version v2,
//   root-login, ciphers, macs, connection-limit, rate-limit)
//   + https://www.juniper.net/documentation/us/en/software/junos/user-access/topics/topic-map/junos-software-remote-access-overview.html
//   (root-login allow|deny|deny-password, ciphers [ ... ], connection-limit/rate-limit 1–250)
//   + https://www.juniper.net/documentation/en_US/junos/topics/reference/configuration-statement/system-edit-ssh-macs.html
Juniper.ssh = {
    label: 'SSH Servisi',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'Juniper JunOS — SSH Servisi',
                desc: 'SSH sürümü, root girişi, şifreleme/MAC algoritmaları ve bağlantı sınırları.<br><small>Örn: <code>set system services ssh root-login deny</code> &nbsp;|&nbsp; <code>set system services ssh protocol-version v2</code></small>'
            },
            sections: [
                {
                    title: 'Erişim',
                    icon: 'fas fa-door-closed',
                    fields: [
                        { name: 'root_login', label: 'Root SSH Girişi', type: 'select', options: [
                            { value: 'deny', label: 'deny (root SSH ile giremez)', selected: true },
                            { value: 'deny-password', label: 'deny-password (yalnız anahtarla)' },
                            { value: 'allow', label: 'allow (önerilmez)' }
                        ], why: 'Root herkesin bildiği bir hesap adıdır ve kaba kuvvet saldırılarının ilk hedefidir. <b>deny</b> ile root yalnız konsoldan kullanılır; kişisel hesaplar sayesinde her değişiklik bir kişiye bağlanır. Varsayılan <b>deny-password</b>dır.' },
                        { name: 'v2', label: 'Yalnız SSHv2 (protocol-version v2)', type: 'checkbox', checked: true, why: 'SSHv1 kriptografik olarak kırılmıştır; açık bırakmak oturumun ele geçirilmesine izin verir.' },
                        { name: 'conn_limit', label: 'Eşzamanlı Bağlantı Limiti', type: 'text', min: 1, max: 250, placeholder: '10', hint: 'connection-limit (1–250, varsayılan 75)', why: 'Limit, oturum doldurma (resource exhaustion) saldırısında Routing Engine\'in korunmasına yardım eder. Çok düşük tutmak otomasyon araçlarının bağlanamamasına yol açar.' },
                        { name: 'rate_limit', label: 'Dakikalık Bağlantı Denemesi', type: 'text', min: 1, max: 250, placeholder: '5', hint: 'rate-limit (1–250, varsayılan 150)', why: 'Dakikada kabul edilen yeni bağlantı sayısını sınırlar; parola tahmin betiklerini ciddi ölçüde yavaşlatır.' }
                    ]
                },
                {
                    title: 'Algoritmalar',
                    icon: 'fas fa-lock',
                    warn: 'Algoritma listesi tanımlanınca varsayılan set yerine yalnız bu liste kullanılır. Eski SSH istemcileri (ve bazı otomasyon kütüphaneleri) bağlanamayabilir — önce bir oturumu açık tutarak test edin.',
                    fields: [
                        { name: 'ciphers', label: 'Şifreleme (ciphers)', type: 'select', options: [
                            { value: '', label: 'Varsayılan (dokunma)', selected: true },
                            { value: 'aes256-ctr aes192-ctr aes128-ctr', label: 'Yalnız AES-CTR' },
                            { value: 'aes256-gcm@openssh.com aes128-gcm@openssh.com aes256-ctr aes192-ctr aes128-ctr', label: 'AES-GCM + AES-CTR' }
                        ], why: 'CBC ve arcfour gibi zayıf şifreler güvenlik taramalarında bulgu olarak çıkar. Listeyi daraltmak bu bulguları kapatır ama istemcinin desteklediği en az bir ortak şifre kalmalıdır.' },
                        { name: 'macs', label: 'MAC Algoritmaları', type: 'select', options: [
                            { value: '', label: 'Varsayılan (dokunma)', selected: true },
                            { value: 'hmac-sha2-512 hmac-sha2-256', label: 'Yalnız HMAC-SHA2' }
                        ], why: 'MD5 ve SHA1 tabanlı MAC\'ler zayıf kabul edilir. SHA2 dışı MAC\'leri kaldırmak bütünlük korumasını güçlendirir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const rl = cgEsc(data.root_login || 'deny'), cl = cgEsc(data.conn_limit || ''), rt = cgEsc(data.rate_limit || '');
            const ci = cgEsc(data.ciphers || ''), ma = cgEsc(data.macs || '');
            let c = cgJnpHdr('SSH Servisi');
            if (rl === 'allow') c += '# UYARI: root-login allow — root hesabı SSH ile parola denemesine açık olur.\n';
            c += 'set system services ssh root-login ' + rl + '\n';
            if (data.v2) c += 'set system services ssh protocol-version v2\n';
            if (cl) c += 'set system services ssh connection-limit ' + cl + '\n';
            if (rt) c += 'set system services ssh rate-limit ' + rt + '\n';
            if (ci) c += 'set system services ssh ciphers [ ' + ci + ' ]\n';
            if (ma) c += 'set system services ssh macs [ ' + ma + ' ]\n';
            c += '\n# Doğrulama:\n# show configuration system services ssh\n# show system connections\n# show system users\n';
            return c;
        });
    }
};

// ── Juniper JunOS: SNMP (v2c + client-list / v3 USM+VACM) ────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: snmp community … authorization read-only,
//   contact, location, view … oid .1 include, v3 usm local-engine user … authentication-sha,
//   v3 vacm security-to-group security-model usm security-name … group …,
//   v3 vacm access group … default-context-prefix security-model usm security-level privacy read-view …)
//   + https://www.juniper.net/documentation/us/en/software/junos/network-mgmt/topics/topic-map/snmp-communities.html (client-list, client-list-name)
//   + https://www.juniper.net/documentation/us/en/software/junos/network-mgmt/topics/topic-map/configure-snmpv3.html (authentication-password, privacy-password)
//   + https://www.juniper.net/documentation/us/en/software/junos/network-mgmt/topics/topic-map/configure-the-snmpv3-authentication-type-and-encryption-type.html
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/trap-group-edit-snmp.html (trap-group version/targets)
Juniper.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'Juniper JunOS — SNMP',
                desc: 'SNMPv2c (client-list ile kaynak kısıtlı, salt okunur) veya SNMPv3 (USM kullanıcı + VACM grup/view). İsteğe bağlı v2c trap hedefi.<br><small>Örn: <code>set snmp community N0C-RO client-list-name NMS-HOSTS</code> &nbsp;|&nbsp; <code>set snmp v3 usm local-engine user nms-user authentication-sha authentication-password "..."</code></small>'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Güvenli', cls: 'security' } },
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-unlock', desc: 'Community + client-list', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Sistem Bilgisi',
                    icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'contact', label: 'Contact', type: 'text', placeholder: 'noc@example.net', hint: 'sysContact', why: 'NMS ekranında cihazdan kimin sorumlu olduğunu gösterir; alarm anında doğru ekibe ulaşmayı hızlandırır.' },
                        { name: 'location', label: 'Location', type: 'text', placeholder: 'DC1-Kabin-A12', hint: 'sysLocation', why: 'Sahada fiziksel müdahale gerektiğinde cihazın hangi kabinde olduğunu envanter açmadan gösterir.' }
                    ]
                },
                {
                    title: 'SNMPv2c',
                    icon: 'fas fa-users',
                    showFor: ['v2c'],
                    warn: 'v2c community ağda düz metin gider. Mümkünse SNMPv3 kullanın; v2c gerekiyorsa yalnız salt okunur ve client-list ile kısıtlı açın.',
                    fields: [
                        { name: 'community', label: 'Community', type: 'text', requiredIf: { field: '_cgtype', in: ['v2c'] }, placeholder: 'N0c-R3ad-2026', hint: 'Tahmin edilmesi zor bir değer', why: 'Community parola işlevi görür. <code>public</code>/<code>private</code> gibi bilinen değerler internet taramalarında ilk denenenlerdir.' },
                        { name: 'authz', label: 'Yetki', type: 'select', options: [
                            { value: 'read-only', label: 'read-only', selected: true },
                            { value: 'read-write', label: 'read-write (önerilmez)' }
                        ], why: '<b>read-write</b> community\'yi bilen herkes SNMP SET ile arayüz kapatabilir veya konfig değiştirebilir. İzleme için read-only yeterlidir.' },
                        { name: 'cl_name', label: 'Client-List Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['v2c'] }, placeholder: 'NMS-HOSTS', hint: 'İzin verilen NMS adres listesinin adı', why: 'Client-list olmadan community\'yi bilen <b>her</b> adres cihazı sorgulayabilir. Liste, community sızsa bile erişimi yalnız NMS sunucularıyla sınırlar.' },
                        { name: 'cl_prefixes', label: 'İzinli NMS Adresleri', type: 'text', requiredIf: { field: '_cgtype', in: ['v2c'] }, placeholder: '192.0.2.30/32, 192.0.2.31/32', hint: 'Virgülle ayrılmış IP/prefix listesi', why: 'Tek NMS için <code>/32</code> yazın. Geniş bir subnet (ör. /16) yazmak kısıtlamayı fiilen etkisiz kılar.' }
                    ]
                },
                {
                    title: 'SNMPv2c Trap (opsiyonel)',
                    icon: 'fas fa-bell',
                    showFor: ['v2c'],
                    fields: [
                        { name: 'trap_group', label: 'Trap Group Adı', type: 'text', placeholder: 'NMS-TRAPS', hint: 'Boş bırakılırsa trap tanımlanmaz', why: 'v1/v2c trap\'lerinde trap-group adı community olarak gönderilir; NMS tarafında beklenen community ile aynı olmalı, yoksa trap\'ler reddedilir.' },
                        { name: 'trap_target', label: 'Trap Hedefi', type: 'text', validate: 'ip', placeholder: '192.0.2.30', hint: 'Trap alıcısı IPv4 (hostname değil)', why: 'Trap hedefi IP adresi olmalıdır; kategori belirtilmezse (timing-events hariç) tüm trap türleri gönderilir.' }
                    ]
                },
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', label: 'USM Kullanıcı', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'nms-user', hint: 'NMS\'te tanımlı kullanıcı adıyla aynı', why: 'SNMPv3 kimliği bu kullanıcıdır; NMS\'teki kullanıcı adı, algoritma ve parolalar birebir aynı olmalı, yoksa sorgular <b>unknown user name</b> ile düşer.' },
                        { name: 'v3_auth', label: 'Auth Algoritması', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'sha256', label: 'SHA-256' }
                        ], why: 'MD5 zayıf kabul edilir. SHA-256 daha güçlüdür ama eski NMS yazılımları desteklemeyebilir; iki tarafın aynı algoritmayı kullandığından emin olun.' },
                        { name: 'v3_auth_pw', label: 'Auth Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'AuthPass-Example1', hint: 'En az 8 karakter', why: 'Junos 8 karakterden kısa parolayı commit\'te reddeder. Anahtar, yerel engine-id\'den türetilir; engine-id değişirse kullanıcıların yeniden tanımlanması gerekir.' },
                        { name: 'v3_priv', label: 'Privacy Algoritması', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128', selected: true },
                            { value: '3des', label: '3DES' }
                        ], why: 'Privacy olmadan SNMP yanıtları (arayüz adları, route tablosu) ağda düz metin gider. AES-128 önerilir.' },
                        { name: 'v3_priv_pw', label: 'Privacy Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'PrivPass-Example2', hint: 'En az 8 karakter; auth parolasından farklı', why: 'Auth ile aynı parolayı kullanmak, tek sızıntıda hem doğrulamayı hem şifrelemeyi aynı anda çökertir.' },
                        { name: 'v3_group', label: 'VACM Grup', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'NMS-RO', hint: 'Kullanıcının bağlanacağı erişim grubu', why: 'VACM\'de yetki kullanıcıya değil gruba verilir. Kullanıcı bir gruba bağlanmazsa kimlik doğrulama başarılı olsa bile hiçbir OID okunamaz.' },
                        { name: 'v3_view', label: 'Read View Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'ALL-MIB', hint: 'oid .1 include ile tüm MIB ağacı', why: 'View, grubun görebileceği OID ağacını belirler. Grup yalnız okuma view\'ı ile tanımlanır; write-view verilmediği için SET yapılamaz.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'v3';
            const contact = cgEsc(cgJnpTxt(data.contact)), loc = cgEsc(cgJnpTxt(data.location));
            let c = cgJnpHdr('SNMP');
            if (contact) c += 'set snmp contact "' + contact + '"\n';
            if (loc) c += 'set snmp location "' + loc + '"\n';
            if (contact || loc) c += '\n';
            if (type === 'v2c') {
                const com = cgEsc(data.community || ''), authz = cgEsc(data.authz || 'read-only'), cl = cgEsc(data.cl_name || '');
                const pfx = cgJnpList(data.cl_prefixes).map(cgEsc);
                if (authz === 'read-write') c += '# UYARI: read-write community SNMP SET ile konfig değişikliğine izin verir.\n';
                if (cl && pfx.length) {
                    c += '# İzinli NMS adresleri\n';
                    pfx.forEach(p => c += 'set snmp client-list ' + cl + ' ' + p + '\n');
                }
                if (com) {
                    c += 'set snmp community ' + com + ' authorization ' + authz + '\n';
                    if (cl) c += 'set snmp community ' + com + ' client-list-name ' + cl + '\n';
                }
                const tg = cgEsc(data.trap_group || ''), tt = cgEsc(data.trap_target || '');
                if (tg && tt) {
                    c += '\n# Trap\nset snmp trap-group ' + tg + ' version v2\nset snmp trap-group ' + tg + ' targets ' + tt + '\n';
                }
            } else {
                const u = cgEsc(data.v3_user || ''), au = cgEsc(data.v3_auth || 'sha'), apw = cgEsc(cgJnpTxt(data.v3_auth_pw));
                const pr = cgEsc(data.v3_priv || 'aes128'), ppw = cgEsc(cgJnpTxt(data.v3_priv_pw));
                const g = cgEsc(data.v3_group || ''), v = cgEsc(data.v3_view || '');
                if (v) c += 'set snmp view ' + v + ' oid .1 include\n';
                if (u && apw) c += 'set snmp v3 usm local-engine user ' + u + ' authentication-' + au + ' authentication-password "' + apw + '"\n';
                if (u && ppw) c += 'set snmp v3 usm local-engine user ' + u + ' privacy-' + pr + ' privacy-password "' + ppw + '"\n';
                if (u && g) c += 'set snmp v3 vacm security-to-group security-model usm security-name ' + u + ' group ' + g + '\n';
                if (g && v) c += 'set snmp v3 vacm access group ' + g + ' default-context-prefix security-model usm security-level privacy read-view ' + v + '\n';
            }
            c += '\n# Doğrulama:\n# show snmp statistics\n';
            if (type === 'v3') c += '# show snmp v3\n';
            c += '# show configuration snmp\n';
            return c;
        });
    }
};

// ── Juniper JunOS: LLDP / LLDP-MED ────────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: protocols lldp interface all, protocols lldp-med interface all)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/lldp-edit-protocols.html
//   (advertisement-interval 5–32768, hold-multiplier 2–10, interface … disable, port-id-subtype interface-name)
Juniper.lldp = {
    label: 'LLDP / LLDP-MED',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper JunOS — LLDP / LLDP-MED',
                desc: 'Komşu keşfi (LLDP) ve IP telefon/uç cihaz için LLDP-MED.<br><small>Örn: <code>set protocols lldp interface all</code> &nbsp;|&nbsp; <code>set protocols lldp interface ge-0/0/47 disable</code></small>'
            },
            sections: [
                {
                    title: 'LLDP',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'scope', label: 'Etkin Arayüzler', type: 'select', options: [
                            { value: 'all', label: 'Tüm arayüzler (interface all)', selected: true },
                            { value: 'list', label: 'Belirli arayüzler' }
                        ], why: 'LLDP kablolama hatalarını ve topolojiyi <code>show lldp neighbors</code> ile görmenin en hızlı yoludur. Tüm arayüzlerde açıp güvenilmeyen portlarda tek tek kapatmak yaygın yaklaşımdır.' },
                        { name: 'ifaces', label: 'Arayüz Listesi', type: 'text', validate: 'iface_range', requiredIf: { field: 'scope', in: ['list'] }, placeholder: 'ge-0/0/0, xe-0/1/0', hint: 'Virgülle ayrılmış fiziksel arayüzler', why: 'Yalnız listelenen arayüzlerde LLDP çalışır; uplink\'i atlamak komşu switch\'in görünmemesine yol açar.' },
                        { name: 'disable_ifaces', label: 'LLDP Kapalı Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'ge-0/0/47', hint: 'İnternet/misafir gibi güvenilmeyen portlar', why: 'LLDP cihaz modelini, yazılım sürümünü ve yönetim adresini karşı tarafa duyurur. Güvenilmeyen taraflara bakan portlarda bu bilgi keşif için kullanılabilir.' },
                        { name: 'adv_int', label: 'Duyuru Aralığı (sn)', type: 'text', min: 5, max: 32768, placeholder: '30', hint: 'advertisement-interval (varsayılan 30)', why: 'Kısa aralık komşu değişikliğini daha hızlı gösterir ama CPU ve kontrol trafiğini artırır; varsayılan çoğu ortam için uygundur.' },
                        { name: 'hold_mult', label: 'Hold Çarpanı', type: 'text', min: 2, max: 10, placeholder: '4', hint: 'hold-multiplier (varsayılan 4)', why: 'Komşu bilgisinin tutulma süresi = aralık × çarpan. Çok düşük çarpan, tek kayıp pakette komşunun tablodan düşmesine yol açar.' },
                        { name: 'port_id', label: 'Port ID Biçimi', type: 'select', options: [
                            { value: '', label: 'Varsayılan (locally-assigned / SNMP index)', selected: true },
                            { value: 'interface-name', label: 'interface-name (ge-0/0/1 gibi)' }
                        ], why: 'Karşı cihaz (özellikle başka üretici) port ID\'yi SNMP index olarak gösterirse hangi porta bağlı olduğunuzu anlamak zorlaşır; <b>interface-name</b> okunabilir ad gönderir.' }
                    ]
                },
                {
                    title: 'LLDP-MED',
                    icon: 'fas fa-phone',
                    fields: [
                        { name: 'med', label: 'LLDP-MED etkin (aynı arayüz kapsamında)', type: 'checkbox', why: 'IP telefonlar ses VLAN\'ı, PoE ve konum bilgisini LLDP-MED ile öğrenir. Kapalıysa telefon yanlış VLAN\'a düşebilir veya PoE pazarlığı yapılamaz.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const scope = data.scope || 'all';
            const list = scope === 'list' ? cgJnpList(data.ifaces).map(cgEsc) : ['all'];
            const dis = cgJnpList(data.disable_ifaces).map(cgEsc);
            const ai = cgEsc(data.adv_int || ''), hm = cgEsc(data.hold_mult || ''), pid = cgEsc(data.port_id || '');
            let c = cgJnpHdr('LLDP / LLDP-MED');
            list.forEach(i => c += 'set protocols lldp interface ' + i + '\n');
            dis.forEach(i => c += 'set protocols lldp interface ' + i + ' disable\n');
            if (ai) c += 'set protocols lldp advertisement-interval ' + ai + '\n';
            if (hm) c += 'set protocols lldp hold-multiplier ' + hm + '\n';
            if (pid) c += 'set protocols lldp port-id-subtype ' + pid + '\n';
            if (data.med) {
                c += '\n# LLDP-MED\n';
                list.forEach(i => c += 'set protocols lldp-med interface ' + i + '\n');
            }
            c += '\n# Doğrulama:\n# show lldp\n# show lldp neighbors\n# show lldp local-information\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Static Route ───────────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: routing-options static route … next-hop …)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/static-edit-routing-options.html
//   (preference, qualified-next-hop … preference, discard, no-readvertise)
Juniper.staticroute = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Juniper JunOS — Static Route',
                desc: 'Tek next-hop, yedekli (floating — qualified-next-hop) veya discard (blackhole) statik rota.<br><small>Örn: <code>set routing-options static route 10.100.0.0/16 next-hop 10.0.0.2</code> &nbsp;|&nbsp; <code>… qualified-next-hop 10.0.1.2 preference 10</code></small>'
            },
            configTypes: [
                { id: 'nh', label: 'Next-Hop', icon: 'fas fa-arrow-right', desc: 'Tek sonraki atlama', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'float', label: 'Yedekli (Floating)', icon: 'fas fa-random', desc: 'Birincil + yüksek preference\'lı yedek', badge: { text: 'Yedeklilik', cls: 'advanced' } },
                { id: 'discard', label: 'Discard', icon: 'fas fa-ban', desc: 'Sessizce düşür (blackhole)', badge: { text: 'Özetleme', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'prefix', label: 'Hedef Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.100.0.0/16', hint: 'Default için 0.0.0.0/0', why: 'Ağ adresini yazın (host bitleri sıfır). En uzun eşleşme kazandığı için dar bir prefix (ör. /24) aynı aralığı kapsayan geniş rotayı (ör. /16) o aralık için ezer.' },
                        { name: 'nh', label: 'Next-Hop', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['nh', 'float'] }, placeholder: '10.0.0.2', hint: 'Doğrudan bağlı bir subnet içinde olmalı', why: 'Next-hop doğrudan bağlı değilse rota <b>hidden</b> kalır ve trafik akmaz; <code>show route hidden</code> ile görülür.' },
                        { name: 'pref', label: 'Preference', type: 'text', min: 0, max: 4294967295, placeholder: '5', hint: 'Junos statik varsayılanı 5; düşük olan kazanır', why: 'Aynı prefix OSPF/BGP\'den de öğreniliyorsa hangi kaynağın kazanacağını preference belirler. Statik 5, OSPF iç 10, BGP 170 varsayılandır.' },
                        { name: 'no_readv', label: 'Diğer protokollere dağıtma (no-readvertise)', type: 'checkbox', why: 'Yönetim ağına giden statik rotanın export policy ile yanlışlıkla OSPF/BGP\'ye sızmasını engeller.' }
                    ]
                },
                {
                    title: 'Yedek Next-Hop',
                    icon: 'fas fa-random',
                    showFor: ['float'],
                    fields: [
                        { name: 'bk_nh', label: 'Yedek Next-Hop', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['float'] }, placeholder: '10.0.1.2', hint: 'qualified-next-hop olarak eklenir', why: 'Birincil next-hop erişilemez olunca (arayüz düşünce) rota bu next-hop\'a geçer. Not: yalnız arayüz kopmasında devreye girer; uzaktaki arızayı algılamak için BFD gerekir.' },
                        { name: 'bk_pref', label: 'Yedek Preference', type: 'text', min: 0, max: 4294967295, requiredIf: { field: '_cgtype', in: ['float'] }, placeholder: '10', hint: 'Birincilden BÜYÜK olmalı', why: 'Yedeğin preference\'ı birincilden küçük veya eşit olursa trafik yedek hatta akar ya da iki hat arasında bölünür.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'nh';
            const p = cgEsc(data.prefix || ''), nh = cgEsc(data.nh || ''), pref = cgEsc(data.pref || '');
            const base = 'set routing-options static route ' + p;
            let c = cgJnpHdr('Static Route');
            if (type === 'discard') {
                c += base + ' discard\n';
            } else if (nh) {
                c += base + ' next-hop ' + nh + '\n';
            }
            if (pref) c += base + ' preference ' + pref + '\n';
            if (type === 'float') {
                const bnh = cgEsc(data.bk_nh || ''), bp = cgEsc(data.bk_pref || '');
                if (bnh && bp && pref && +bp <= +pref) c += '# UYARI: yedek preference (' + bp + ') birincilden (' + pref + ') büyük değil.\n';
                if (bnh) c += base + ' qualified-next-hop ' + bnh + (bp ? ' preference ' + bp : '') + '\n';
            }
            if (data.no_readv) c += base + ' no-readvertise\n';
            c += '\n# Doğrulama:\n# show route ' + p + ' exact detail\n# show route protocol static\n# show route hidden\n';
            return c;
        });
    }
};

// ── Juniper JunOS: RSTP / MSTP ────────────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: protocols rstp bridge-priority 4k,
//   rstp interface all, rstp interface ae1)
//   + https://www.juniper.net/documentation/us/en/software/junos/stp-l2/topics/topic-map/spanning-tree-bpdu-protection.html
//   (rstp interface … edge, rstp|mstp bpdu-block-on-edge)
//   + https://www.juniper.net/documentation/us/en/software/junos/stp-l2/topics/topic-map/spanning-tree-configuring-mstp.html
//   (mstp configuration-name, msti N vlan [ … ], msti N bridge-priority, mstp bridge-priority)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/mstp-edit-protocols.html (revision-level)
function cgJnpBrPrio(def) {
    const o = [{ value: '', label: 'Varsayılan (32k)' }];
    ['0', '4k', '8k', '12k', '16k', '20k', '24k', '28k', '32k', '36k', '40k', '44k', '48k', '52k', '56k', '60k']
        .forEach(v => o.push({ value: v, label: v }));
    return o.map(x => Object.assign({}, x, x.value === def ? { selected: true } : {}));
}
Juniper.stp = {
    label: 'RSTP / MSTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'Juniper JunOS — RSTP / MSTP',
                desc: 'Root köprü önceliği, edge portlar ve BPDU koruması; MSTP için bölge adı, revizyon ve MSTI–VLAN eşlemesi.<br><small>Örn: <code>set protocols rstp bridge-priority 4k</code> &nbsp;|&nbsp; <code>set protocols rstp bpdu-block-on-edge</code></small>'
            },
            configTypes: [
                { id: 'rstp', label: 'RSTP', icon: 'fas fa-sitemap', desc: 'Tek ağaç, hızlı yakınsama', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'mstp', label: 'MSTP', icon: 'fas fa-stream', desc: 'VLAN gruplarına ayrı ağaç', badge: { text: 'Yük Paylaşımı', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Köprü & Edge Portlar',
                    icon: 'fas fa-crown',
                    fields: [
                        { name: 'prio', label: 'Bridge Priority (CIST)', type: 'select', options: cgJnpBrPrio(''), why: 'En düşük öncelikli switch root olur. Öncelik bırakılırsa root, MAC adresi en küçük (genelde en eski) switch olur ve trafik beklenmedik yollardan akar. Çekirdekte 4k, yedek çekirdekte 8k yaygındır.' },
                        { name: 'edge_ifaces', label: 'Edge (uç cihaz) Arayüzleri', type: 'text', validate: 'iface_range', placeholder: 'ge-0/0/0, ge-0/0/1', hint: 'Yalnız PC/sunucu/yazıcı bağlı erişim portları', why: 'Edge port, listening/learning beklemeden hemen forwarding\'e geçer; DHCP zaman aşımlarını önler. Switch bağlı bir portu edge yapmak geçici döngü riskidir.' },
                        { name: 'bpdu_block', label: 'Edge portta BPDU gelirse portu kapat (bpdu-block-on-edge)', type: 'checkbox', checked: true, why: 'Kullanıcının erişim portuna taktığı yönetilmeyen bir switch veya kötü niyetli cihaz BPDU gönderip root olmaya çalışabilir. Bu koruma portu hata durumuna alır; <code>clear error bpdu interface</code> ile açılır.' }
                    ]
                },
                {
                    title: 'RSTP Kapsamı',
                    icon: 'fas fa-ethernet',
                    showFor: ['rstp'],
                    fields: [
                        { name: 'all_if', label: 'Tüm arayüzlerde çalıştır (interface all) — yalnız RSTP', type: 'checkbox', checked: true, why: 'STP çalışmayan bir port döngüye karşı korumasızdır. Özel bir neden yoksa tüm arayüzlerde açık tutun.' }
                    ]
                },
                {
                    title: 'MSTP Bölge',
                    icon: 'fas fa-stream',
                    showFor: ['mstp'],
                    info: 'Bölgedeki TÜM switch\'lerde configuration-name, revision-level ve MSTI–VLAN eşlemesi birebir aynı olmalıdır.',
                    fields: [
                        { name: 'region', label: 'Configuration Name', type: 'text', requiredIf: { field: '_cgtype', in: ['mstp'] }, placeholder: 'REGION1', hint: 'Bölge adı (büyük/küçük harf duyarlı)', why: 'Ad, revizyon veya VLAN eşlemesinde tek fark switch\'i ayrı bir bölgeye düşürür; bölge sınırında tüm VLAN\'lar tek ağaç (CIST) gibi davranır ve yük paylaşımı bozulur.' },
                        { name: 'revision', label: 'Revision Level', type: 'text', min: 0, max: 65535, placeholder: '1', hint: 'Varsayılan 0', why: 'Eşleme değiştiğinde revizyonu artırmak, bölgeyi bilinçli olarak güncellemenin işaretidir; ama tüm switch\'lerde aynı anda değişmezse bölge bölünür.' },
                        { name: 'msti1_vlans', label: 'MSTI 1 VLAN\'ları', type: 'text', validate: 'vlan_list', requiredIf: { field: '_cgtype', in: ['mstp'] }, placeholder: '10,20,30-40', hint: 'Virgülle ayrılmış VLAN ID / aralık', why: 'MSTI\'ye atanmayan VLAN\'lar CIST (MSTI 0) üzerinde kalır. Bir VLAN yalnız bir MSTI\'ye ait olabilir; eşleme bölgedeki tüm switch\'lerde aynı olmalıdır.' },
                        { name: 'msti1_prio', label: 'MSTI 1 Bridge Priority', type: 'select', options: cgJnpBrPrio(''), why: 'Yük paylaşımı için MSTI 1\'in root\'unu bir çekirdeğe, MSTI 2\'ninkini diğerine verin; ikisi de aynı switch\'te root olursa MSTP\'nin avantajı kalmaz.' },
                        { name: 'msti2_vlans', label: 'MSTI 2 VLAN\'ları', type: 'text', validate: 'vlan_list', placeholder: '50,60', hint: 'Opsiyonel ikinci instance', why: 'İkinci instance, yedek uplink\'i boşta bekletmek yerine bir VLAN grubunu o yoldan taşımayı sağlar.' },
                        { name: 'msti2_prio', label: 'MSTI 2 Bridge Priority', type: 'select', options: cgJnpBrPrio(''), why: 'Diğer çekirdekte düşük öncelik vererek MSTI 2 trafiğini o yöne çekin.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'rstp', proto = type === 'mstp' ? 'mstp' : 'rstp';
            const P = 'set protocols ' + proto;
            const prio = cgEsc(data.prio || ''), edges = cgJnpList(data.edge_ifaces).map(cgEsc);
            let c = cgJnpHdr(proto.toUpperCase());
            c += '# NOT: Aynı anda yalnız bir spanning-tree protokolü (rstp veya mstp) etkin olabilir.\n';
            if (type === 'mstp') {
                const reg = cgEsc(data.region || ''), rev = cgEsc(data.revision || '');
                if (reg) c += P + ' configuration-name ' + reg + '\n';
                if (rev) c += P + ' revision-level ' + rev + '\n';
            }
            if (prio) c += P + ' bridge-priority ' + prio + '\n';
            if (type === 'rstp' && data.all_if) c += P + ' interface all\n';
            edges.forEach(i => c += P + ' interface ' + i + ' edge\n');
            if (data.bpdu_block) c += P + ' bpdu-block-on-edge\n';
            if (type === 'mstp') {
                [['1', data.msti1_vlans, data.msti1_prio], ['2', data.msti2_vlans, data.msti2_prio]].forEach(([id, vl, pr]) => {
                    const v = cgJnpList(vl).map(cgEsc);
                    if (!v.length) return;
                    c += P + ' msti ' + id + ' vlan [ ' + v.join(' ') + ' ]\n';
                    if (pr) c += P + ' msti ' + id + ' bridge-priority ' + cgEsc(pr) + '\n';
                });
            }
            c += '\n# Doğrulama:\n# show spanning-tree bridge\n# show spanning-tree interface\n# show ethernet-switching interfaces\n';
            return c;
        });
    }
};

// ── Juniper JunOS: OSPF (EX/QFX) ──────────────────────────────────────────────
// Sözdizimi: https://www.juniper.net/documentation/us/en/software/junos/ospf/topics/topic-map/configuring-ospf-interfaces.html
//   (protocols ospf area … interface …, … passive) + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/interface-type-edit-protocols-ospf.html (interface-type p2p)
//   + https://www.juniper.net/documentation/us/en/software/junos/ospf/topics/topic-map/configuring-ospf-authentication.html (authentication md5 N key …, key-id 0–255)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/reference-bandwidth-edit-protocols-ospf.html (bps)
Juniper.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Juniper JunOS — OSPF',
                desc: 'Router-ID, area, IRB/uplink arayüzleri, passive arayüzler, point-to-point tip, MD5 kimlik doğrulama ve export policy.<br><small>Örn: <code>set protocols ospf area 0.0.0.0 interface irb.10 passive</code> &nbsp;|&nbsp; <code>set protocols ospf area 0.0.0.0 interface ae0.0 interface-type p2p</code></small>'
            },
            sections: [
                {
                    title: 'Temel',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'rid', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.1', hint: 'Genelde lo0 adresi', why: 'Router-ID verilmezse Junos ilk uygun arayüz adresini seçer; o adres değişince OSPF komşulukları yeniden kurulur. İki cihazda aynı ID, LSA\'ların sürekli ezilmesine ve kararsız yönlendirmeye yol açar.' },
                        { name: 'area', label: 'Area', type: 'text', validate: 'ip', required: true, placeholder: '0.0.0.0', hint: 'Noktalı biçim; backbone 0.0.0.0', why: 'Linkin iki ucu aynı area\'da olmalıdır; farklı area\'da link up görünür ama komşuluk hiç kurulmaz. Backbone dışı area\'lar 0.0.0.0\'a bağlı olmalıdır.' },
                        { name: 'ifaces', label: 'OSPF Arayüzleri', type: 'text', validate: 'iface_range', required: true, placeholder: 'ae0.0, irb.10, lo0.0', hint: 'Unit ile birlikte (ae0.0, irb.10)', why: 'Junos\'ta OSPF logical unit üzerinde çalışır; <code>.0</code> gibi unit yazılmazsa commit kabul edebilir ama arayüz OSPF\'e girmez. Loopback eklenmezse router-ID prefix\'i duyurulmaz.' },
                        { name: 'passive', label: 'Passive Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'irb.10, lo0.0', hint: 'Prefix duyurulur, komşuluk aranmaz', why: 'Kullanıcı VLAN\'ı (IRB) ve loopback passive olmalı: prefix duyurulur ama hello gönderilmez. Aksi halde o VLAN\'daki herhangi bir cihaz OSPF komşusu olup sahte rota enjekte edebilir.' },
                        { name: 'p2p', label: 'Point-to-Point Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'ae0.0', hint: 'İki cihazlı uplink/LAG\'ler', why: 'İki uçlu Ethernet linkte broadcast tipi gereksiz DR/BDR seçimi ve Type-2 LSA üretir; p2p yakınsamayı hızlandırır. İki uçta aynı tip olmalıdır, yoksa komşuluk FULL olmaz.' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama & Politika',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'auth_en', label: 'MD5 kimlik doğrulama (passive olmayan arayüzlerde)', type: 'checkbox', why: 'Kimlik doğrulamasız OSPF\'te aynı segmente bağlanan her cihaz komşu olup rota enjekte edebilir. MD5 iki uçta aynı key-id ve anahtarla tanımlanmalıdır.' },
                        { name: 'key_id', label: 'MD5 Key ID', type: 'text', min: 0, max: 255, requiredIf: { field: 'auth_en', checked: true }, placeholder: '1', hint: '0–255, iki uçta aynı', why: 'Anahtar değiştirirken yeni key-id ile ikinci anahtar eklenip geçiş kesintisiz yapılabilir; key-id uyuşmazsa komşuluk düşer.' },
                        { name: 'md5_key', label: 'MD5 Anahtarı', type: 'text', requiredIf: { field: 'auth_en', checked: true }, placeholder: 'Ospf-Key-Example', hint: 'İki uçta birebir aynı', why: 'Anahtar konfigde $9$ biçiminde saklanır ancak bu biçim geri çözülebilir; konfig yedeklerini gizli tutun.' },
                        { name: 'ref_bw', label: 'Reference Bandwidth', type: 'select', options: [
                            { value: '', label: 'Varsayılan (100 Mbps)', selected: true },
                            { value: '10000000000', label: '10 Gbps' },
                            { value: '100000000000', label: '100 Gbps' },
                            { value: '400000000000', label: '400 Gbps' }
                        ], why: 'Varsayılan 100 Mbps ile 1G, 10G ve 100G linklerin hepsi maliyet 1 alır ve OSPF en hızlı yolu seçemez. Değer ağdaki TÜM cihazlarda aynı olmalıdır.' },
                        { name: 'export', label: 'Export Policy', type: 'text', placeholder: 'OSPF-EXPORT', hint: 'Önceden tanımlı policy-statement (Policy-Options aracı)', why: 'Statik veya direct rotaları OSPF\'e dağıtmanın yolu export policy\'dir. Filtresiz bir policy tüm statikleri (default route dahil) domaine yayabilir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const rid = cgEsc(data.rid || ''), area = cgEsc(data.area || '');
            const ifs = cgJnpList(data.ifaces).map(cgEsc), pas = cgJnpList(data.passive).map(cgEsc), p2p = cgJnpList(data.p2p).map(cgEsc);
            const kid = cgEsc(data.key_id || ''), key = cgEsc(cgJnpTxt(data.md5_key)), rbw = cgEsc(data.ref_bw || ''), exp = cgEsc(data.export || '');
            const A = 'set protocols ospf area ' + area + ' interface ';
            let c = cgJnpHdr('OSPF');
            c += 'set routing-options router-id ' + rid + '\n\n';
            const all = ifs.slice(); pas.concat(p2p).forEach(i => { if (!all.includes(i)) all.push(i); });
            all.forEach(i => c += A + i + '\n');
            pas.forEach(i => c += A + i + ' passive\n');
            p2p.forEach(i => c += A + i + ' interface-type p2p\n');
            if (data.auth_en && kid && key) {
                all.filter(i => !pas.includes(i)).forEach(i => c += A + i + ' authentication md5 ' + kid + ' key "' + key + '"\n');
            }
            if (rbw) c += 'set protocols ospf reference-bandwidth ' + rbw + '\n';
            if (exp) c += 'set protocols ospf export ' + exp + '\n';
            c += '\n# Doğrulama:\n# show ospf neighbor\n# show ospf interface\n# show route protocol ospf\n';
            return c;
        });
    }
};

// ── Juniper JunOS: BGP (EX/QFX) ───────────────────────────────────────────────
// Sözdizimi: https://www.juniper.net/documentation/us/en/software/junos/routing-policy/topics/example/policy-prefix-list.html
//   (bgp group … type external|internal, neighbor, peer-as, local-address)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/neighbor-edit-protocols-bgp.html
//   (description, authentication-key, import, export, peer-as)
Juniper.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'Juniper JunOS — BGP',
                desc: 'Yerel AS, router-ID, BGP grubu, komşu, MD5 kimlik doğrulama ve import/export policy.<br><small>Örn: <code>set protocols bgp group UPSTREAM type external</code> &nbsp;|&nbsp; <code>set protocols bgp group UPSTREAM neighbor 192.0.2.1 peer-as 64500</code></small>'
            },
            sections: [
                {
                    title: 'Yerel',
                    icon: 'fas fa-home',
                    fields: [
                        { name: 'las', label: 'Yerel AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'routing-options autonomous-system', why: 'Karşı tarafın beklediği AS ile farklıysa OPEN mesajı <b>bad peer AS</b> ile reddedilir ve oturum Active/Connect arasında döner.' },
                        { name: 'rid', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.255.1', hint: 'Genelde lo0 adresi', why: 'Router-ID BGP\'de en iyi yol seçiminde eşitlik bozucudur ve iki cihazda aynıysa oturum kurulmaz. OSPF aracında da tanımlıysa aynı değeri kullanın.' }
                    ]
                },
                {
                    title: 'Grup & Komşu',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'group', label: 'Grup Adı', type: 'text', required: true, placeholder: 'UPSTREAM', hint: 'Aynı politikayı paylaşan komşular', why: 'Junos\'ta komşu her zaman bir grup altında tanımlanır; policy ve tip gruptan miras alınır. Farklı politikaya ihtiyacı olan komşuyu aynı gruba koymak ona da grubun export policy\'sini uygular.' },
                        { name: 'gtype', label: 'Tip', type: 'select', options: [
                            { value: 'external', label: 'external (eBGP)', selected: true },
                            { value: 'internal', label: 'internal (iBGP)' }
                        ], why: 'iBGP\'de öğrenilen rotalar diğer iBGP komşulara duyurulmaz (full-mesh veya route-reflector gerekir). eBGP\'de komşu AS\'ı zorunludur.' },
                        { name: 'nbr', label: 'Komşu IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.1', hint: 'BGP komşusunun adresi', why: 'Komşu, oturumu bu adresten gelen TCP/179 bağlantısıyla eşler. Loopback\'ten kurulan oturumlarda <code>local-address</code> verilmezse kaynak adres uyuşmaz ve oturum Idle\'da kalır.' },
                        { name: 'pas', label: 'Komşu AS', type: 'text', validate: 'asn', requiredIf: { field: 'gtype', in: ['external'] }, placeholder: '64500', hint: 'eBGP için zorunlu; iBGP\'de yerel AS kullanılır', why: 'Yanlış komşu AS, OPEN aşamasında oturumun reddedilmesine yol açar.' },
                        { name: 'laddr', label: 'Local Address', type: 'text', validate: 'ip', placeholder: '10.255.255.1', hint: 'iBGP loopback oturumlarında önerilir', why: 'Oturumu loopback\'ten kurmak, fiziksel link düştüğünde alternatif yoldan oturumun ayakta kalmasını sağlar.' },
                        { name: 'desc', label: 'Açıklama', type: 'text', placeholder: 'ISP-A transit', hint: 'Komşu açıklaması', why: '<code>show bgp summary</code> çıktısında yalnız IP görünür; açıklama hangi devrenin/sağlayıcının olduğunu hızlıca gösterir.' },
                        { name: 'md5', label: 'MD5 Anahtarı', type: 'text', placeholder: 'Bgp-Key-Example', hint: 'Karşı tarafla birebir aynı', why: 'TCP-MD5, sahte RST ile oturum düşürme ve oturum ele geçirme saldırılarını engeller. Anahtar uyuşmazsa oturum hiç kurulmaz ve log\'da yalnız MD5 hatası görünür.' }
                    ]
                },
                {
                    title: 'Politikalar',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'imp', label: 'Import Policy', type: 'text', placeholder: 'UPSTREAM-IN', hint: 'Önceden tanımlı policy-statement', why: 'Import policy olmadan komşunun gönderdiği tüm rotalar kabul edilir; yanlış bir duyuru (ör. default veya sizin prefix\'iniz) trafiği ele geçirebilir.' },
                        { name: 'exp', label: 'Export Policy', type: 'text', placeholder: 'UPSTREAM-OUT', hint: 'Önceden tanımlı policy-statement', why: 'Export policy olmadan Junos aktif BGP rotalarını komşulara yeniden duyurur; eBGP\'de iki sağlayıcı arasında istemeden transit AS olabilirsiniz.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const las = cgEsc(data.las || ''), rid = cgEsc(data.rid || ''), g = cgEsc(data.group || ''), t = cgEsc(data.gtype || 'external');
            const nbr = cgEsc(data.nbr || ''), pas = cgEsc(data.pas || ''), la = cgEsc(data.laddr || ''), desc = cgEsc(cgJnpTxt(data.desc));
            const md5 = cgEsc(cgJnpTxt(data.md5)), imp = cgEsc(data.imp || ''), exp = cgEsc(data.exp || '');
            const G = 'set protocols bgp group ' + g, N = G + ' neighbor ' + nbr;
            let c = cgJnpHdr('BGP');
            c += 'set routing-options autonomous-system ' + las + '\nset routing-options router-id ' + rid + '\n\n';
            if (t === 'external' && !imp) c += '# UYARI: eBGP grubunda import policy yok — komşudan gelen tüm rotalar kabul edilir.\n';
            if (t === 'external' && !exp) c += '# UYARI: eBGP grubunda export policy yok — aktif BGP rotaları komşuya duyurulur.\n';
            c += G + ' type ' + t + '\n';
            if (la) c += G + ' local-address ' + la + '\n';
            if (imp) c += G + ' import ' + imp + '\n';
            if (exp) c += G + ' export ' + exp + '\n';
            c += N + (t === 'external' && pas ? ' peer-as ' + pas : '') + '\n';
            if (desc) c += N + ' description "' + desc + '"\n';
            if (md5) c += N + ' authentication-key "' + md5 + '"\n';
            c += '\n# Doğrulama:\n# show bgp summary\n# show bgp neighbor ' + nbr + '\n# show route receive-protocol bgp ' + nbr + '\n# show route advertising-protocol bgp ' + nbr + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Policy-Options (Prefix-List + Policy-Statement) ────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: policy-options prefix-list … <prefix>)
//   + https://www.juniper.net/documentation/us/en/software/junos/routing-policy/topics/example/policy-prefix-list.html
//   (policy-statement … term … from prefix-list, from protocol static, then accept|reject)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/prefix-list-filter-edit-policy-options.html (exact|longer|orlonger)
Juniper.policy = {
    label: 'Policy-Options',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'Juniper JunOS — Prefix-List & Policy-Statement',
                desc: 'Prefix-list tanımı ve onu kullanan tek term\'li policy-statement (OSPF/BGP export/import için).<br><small>Örn: <code>set policy-options prefix-list CUSTOMER 10.200.0.0/16</code> &nbsp;|&nbsp; <code>set policy-options policy-statement BGP-OUT term T1 from prefix-list CUSTOMER</code></small>'
            },
            sections: [
                {
                    title: 'Prefix-List',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'pl', label: 'Prefix-List Adı', type: 'text', required: true, placeholder: 'CUSTOMER-NETS', hint: 'Policy içinde bu adla anılır', why: 'Prefix-list hem routing policy\'de hem firewall filter\'da yeniden kullanılabilir; aynı listeyi iki yerde ayrı ayrı yazıp zamanla farklılaşmasını önler.' },
                        { name: 'pfx', label: 'Prefix\'ler', type: 'text', required: true, placeholder: '10.200.0.0/16, 172.16.0.0/12', hint: 'Virgülle ayrılmış CIDR listesi', why: 'Geçersiz biçimdeki satırlar çıktıda UYARI olarak işaretlenir ve yazılmaz. Boş kalan bir prefix-list\'e başvuran term hiçbir şeyle eşleşmez.' }
                    ]
                },
                {
                    title: 'Policy-Statement',
                    icon: 'fas fa-code-branch',
                    fields: [
                        { name: 'pol', label: 'Policy Adı', type: 'text', required: true, placeholder: 'BGP-OUT', hint: 'BGP/OSPF export/import\'ta kullanılacak ad', why: 'Policy tanımlandığı yerde değil uygulandığı yerde (bgp group export, ospf export) çalışır; uygulanmayan policy etkisizdir.' },
                        { name: 'term', label: 'Term Adı', type: 'text', required: true, placeholder: 'ALLOW-CUSTOMER', hint: 'Term\'ler yazılış sırasıyla değerlendirilir', why: 'İlk eşleşen term (accept/reject) değerlendirmeyi bitirir. Sonradan eklenen term\'ler en alta gider; araya almak için <code>insert</code> gerekir.' },
                        { name: 'match', label: 'Eşleşme', type: 'select', options: [
                            { value: 'exact', label: 'Tam eşleşme (from prefix-list)', selected: true },
                            { value: 'orlonger', label: 'Kendisi + alt prefix\'ler (prefix-list-filter orlonger)' },
                            { value: 'longer', label: 'Yalnız alt prefix\'ler (prefix-list-filter longer)' }
                        ], why: '<code>from prefix-list</code> yalnız birebir aynı prefix\'i eşler; /16 listesi /24 duyurusunu yakalamaz. <b>orlonger</b> geniş kapsar ve istemediğiniz alt ağları da geçirebilir.' },
                        { name: 'proto', label: 'Protokol Koşulu', type: 'select', options: [
                            { value: '', label: 'Yok', selected: true },
                            { value: 'direct', label: 'direct' },
                            { value: 'static', label: 'static' },
                            { value: 'ospf', label: 'ospf' },
                            { value: 'bgp', label: 'bgp' }
                        ], why: 'Protokol koşulu eklemek, aynı prefix başka bir kaynaktan öğrenildiğinde yanlışlıkla duyurulmasını engeller (ör. yalnız statik olarak tanımlı müşteri ağlarını duyur).' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'accept', label: 'accept', selected: true },
                            { value: 'reject', label: 'reject' }
                        ], why: 'accept/reject değerlendirmeyi bitirir. Hiçbir term eşleşmezse protokolün varsayılan politikası uygulanır (BGP export\'ta aktif BGP rotaları duyurulur).' },
                        { name: 'final_reject', label: 'Sona "diğer her şeyi reddet" term\'i ekle', type: 'checkbox', checked: true, why: 'Açık reject term\'i olmadan eşleşmeyen rotalar protokol varsayılanına düşer; BGP export\'ta bu, beklenmedik rotaların duyurulması demektir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pl = cgEsc(data.pl || ''), pol = cgEsc(data.pol || ''), term = cgEsc(data.term || '');
            const match = data.match || 'exact', proto = cgEsc(data.proto || ''), act = cgEsc(data.action || 'accept');
            const re = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/;
            const items = cgJnpList(data.pfx), ok = items.filter(p => re.test(p)).map(cgEsc), bad = items.filter(p => !re.test(p)).map(cgEsc);
            const T = 'set policy-options policy-statement ' + pol + ' term ' + term;
            let c = cgJnpHdr('Policy-Options');
            bad.forEach(p => c += '# UYARI: geçersiz prefix atlandı: ' + p + '\n');
            ok.forEach(p => c += 'set policy-options prefix-list ' + pl + ' ' + p + '\n');
            c += '\n';
            if (match === 'exact') c += T + ' from prefix-list ' + pl + '\n';
            else c += T + ' from prefix-list-filter ' + pl + ' ' + cgEsc(match) + '\n';
            if (proto) c += T + ' from protocol ' + proto + '\n';
            c += T + ' then ' + act + '\n';
            if (data.final_reject) c += 'set policy-options policy-statement ' + pol + ' term REJECT-REST then reject\n';
            c += '\n# Doğrulama:\n# show policy ' + pol + '\n# show configuration policy-options\n';
            return c;
        });
    }
};

// ── Juniper JunOS: VRRP (IRB üzerinde) ────────────────────────────────────────
// Sözdizimi: https://www.juniper.net/documentation/us/en/software/junos/high-availability/topics/topic-map/vrrp-configuring.html
//   (family inet address … vrrp-group N virtual-address / priority / accept-data / track interface … priority-cost,
//    no-preempt, authentication-type/-key, protocols vrrp version-3, show vrrp / show vrrp track detail)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/security-interfaces-unit-family-inet-address-vrrp-group.html
Juniper.vrrp = {
    label: 'VRRP (IRB)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Juniper JunOS — VRRP (IRB)',
                desc: 'İki switch arasında IRB (VLAN gateway) için sanal IP. Her switch\'te kendi gerçek adresiyle ayrı ayrı üretin.<br><small>Örn: <code>set interfaces irb unit 10 family inet address 10.0.10.2/24 vrrp-group 10 virtual-address 10.0.10.1</code></small>'
            },
            sections: [
                {
                    title: 'IRB & Sanal IP',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'unit', label: 'IRB Unit (VLAN ID)', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'irb.<unit>; VLAN altında l3-interface irb.<unit> tanımlı olmalı', why: 'VRRP IRB\'nin logical unit\'inde çalışır. VLAN\'a <code>l3-interface irb.X</code> bağlanmamışsa IRB up olmaz ve VRRP hiç başlamaz.' },
                        { name: 'real', label: 'Bu Switch\'in IRB Adresi', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.10.2/24', hint: 'Her switch\'te farklı', why: 'VRRP grubu bu adresin altına tanımlanır. Adres satırı konfigdekiyle birebir aynı olmalıdır; farklı yazılırsa ikinci bir adres eklenir ve VRRP yanlış adrese bağlanır.' },
                        { name: 'grp', label: 'VRRP Grup ID', type: 'text', min: 0, max: 255, required: true, placeholder: '10', hint: 'İki switch\'te aynı; aynı L2\'de diğer gruplardan farklı', why: 'Grup ID sanal MAC\'i belirler (00:00:5e:00:01:XX). Aynı VLAN\'da iki ayrı grup aynı ID\'yi kullanırsa sanal MAC çakışır.' },
                        { name: 'vip', label: 'Sanal IP (Gateway)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.10.1', hint: 'İstemcilerin default gateway\'i', why: 'İki switch\'te aynı olmalı ve IRB subnet\'i içinde bulunmalıdır. İstemcilere DHCP ile bu adres gateway olarak verilir.' }
                    ]
                },
                {
                    title: 'Öncelik & Davranış',
                    icon: 'fas fa-sort-amount-up',
                    fields: [
                        { name: 'prio', label: 'Priority', type: 'text', min: 1, max: 254, placeholder: '200', hint: 'Varsayılan 100; yüksek olan master', why: 'Master olması istenen switch\'e yüksek öncelik verin. İki tarafta eşitse gerçek IP\'si büyük olan kazanır; bu da genelde planlanmamış bir seçimdir.' },
                        { name: 'preempt', label: 'Preempt', type: 'select', options: [
                            { value: 'preempt', label: 'preempt (varsayılan)', selected: true },
                            { value: 'no-preempt', label: 'no-preempt' }
                        ], why: 'Preempt açıkken yüksek öncelikli switch geri geldiğinde master\'lığı geri alır; bu ikinci bir kısa kesinti demektir. <b>no-preempt</b> yeni master\'ı yerinde bırakır.' },
                        { name: 'accept', label: 'Sanal IP\'ye gelen trafiği kabul et (accept-data)', type: 'checkbox', why: 'Kapalıyken master sanal IP\'ye gelen ping\'e yanıt vermez; izleme sistemleri gateway\'i "down" görebilir. Açmak sanal IP\'yi cihaza yönelik trafiğe açar.' },
                        { name: 'track_if', label: 'İzlenecek Uplink', type: 'text', validate: 'iface', placeholder: 'ae0.0', hint: 'Düşerse öncelik düşürülür', why: 'Uplink\'i düşen switch master kalırsa istemci trafiği ona gelir ve kara deliğe gider. Track ile öncelik düşer, diğer switch master olur.' },
                        { name: 'track_cost', label: 'Priority-Cost', type: 'text', min: 1, max: 254, placeholder: '150', hint: 'Uplink düşünce öncelikten çıkarılacak değer', why: 'Priority − cost, yedek switch\'in önceliğinin altına inmelidir; aksi halde uplink düşse bile master değişmez.' },
                        { name: 'ver3', label: 'VRRPv3 kullan (protocols vrrp version-3)', type: 'checkbox', why: 'Sistem genelidir; tüm VRRP grupları etkilenir ve iki switch aynı sürümü kullanmalıdır. VRRPv3\'te authentication-type kullanılamaz.' },
                        { name: 'auth_key', label: 'MD5 Anahtarı (yalnız VRRPv2)', type: 'text', placeholder: 'Vrrp-Key-Ex', hint: 'İki switch\'te aynı', why: 'Kimlik doğrulamasız VRRP\'de aynı VLAN\'daki bir cihaz yüksek öncelikli sahte ilan göndererek gateway\'i ele geçirebilir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const u = cgEsc(data.unit || ''), real = cgEsc(data.real || ''), g = cgEsc(data.grp || ''), vip = cgEsc(data.vip || '');
            const prio = cgEsc(data.prio || ''), pre = data.preempt || 'preempt';
            const tif = cgEsc(data.track_if || ''), tcost = cgEsc(data.track_cost || ''), key = cgEsc(cgJnpTxt(data.auth_key));
            const V = 'set interfaces irb unit ' + u + ' family inet address ' + real + ' vrrp-group ' + g;
            let c = cgJnpHdr('VRRP (IRB)');
            if (data.ver3) c += 'set protocols vrrp version-3\n\n';
            c += V + ' virtual-address ' + vip + '\n';
            if (prio) c += V + ' priority ' + prio + '\n';
            if (pre === 'no-preempt') c += V + ' no-preempt\n';
            if (data.accept) c += V + ' accept-data\n';
            if (tif && tcost) c += V + ' track interface ' + tif + ' priority-cost ' + tcost + '\n';
            else if (tif) c += '# UYARI: izlenecek arayüz verildi ama priority-cost boş — track satırı yazılmadı.\n';
            if (key && data.ver3) c += '# UYARI: VRRPv3 ile authentication kullanılamaz — anahtar yazılmadı.\n';
            else if (key) c += V + ' authentication-type md5\n' + V + ' authentication-key "' + key + '"\n';
            c += '\n# Doğrulama:\n# show vrrp\n# show vrrp detail\n';
            if (tif) c += '# show vrrp track detail\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Storm Control (ELS) ────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: forwarding-options storm-control-profiles default all)
//   + https://www.juniper.net/documentation/us/en/software/junos/security-services/topics/task/rate-limiting-storm-control-disabling-cli-els.html
//   (… all bandwidth-level, no-broadcast / no-multicast / no-unknown-unicast,
//    interfaces … unit 0 family ethernet-switching storm-control <profil>)
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/storm-control-profiles-rate-limiting.html (action-shutdown, bandwidth-percentage)
//   + https://www.juniper.net/documentation/en_US/junos/topics/reference/configuration-statement/recovery-timeout-edit-interfaces.html (10–3600 sn)
Juniper.storm = {
    label: 'Storm Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Juniper JunOS — Storm Control (ELS)',
                desc: 'Broadcast / multicast / bilinmeyen unicast (BUM) trafiği için eşik profili ve arayüzlere bağlama. EX (ELS) varsayılanı: tüm L2 portlarda %80.<br><small>Örn: <code>set forwarding-options storm-control-profiles SC-ACCESS all bandwidth-percentage 5</code></small>'
            },
            sections: [
                {
                    title: 'Profil',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'prof', label: 'Profil Adı', type: 'text', required: true, placeholder: 'SC-ACCESS', hint: 'En fazla 127 karakter', why: 'Aynı profil birden çok arayüze bağlanabilir; erişim ve uplink portları için ayrı profiller kullanmak, uplink\'i gereksiz yere kısmayı önler.' },
                        { name: 'unit_t', label: 'Eşik Birimi', type: 'select', options: [
                            { value: 'pct', label: 'Yüzde (bandwidth-percentage)', selected: true },
                            { value: 'kbps', label: 'Kbps (bandwidth-level)' }
                        ], why: 'Yüzde, port hızına göre ölçeklenir ve farklı hızdaki portlarda aynı profil kullanılabilir. Kbps sabit bir tavan verir. LAG\'de eşik her üyeye ayrı uygulanır.' },
                        { name: 'pct', label: 'Yüzde', type: 'text', min: 1, max: 100, requiredIf: { field: 'unit_t', in: ['pct'] }, placeholder: '5', hint: 'BUM trafiği için port bant genişliği yüzdesi', why: 'Çok düşük eşik, meşru multicast (IPTV, görüntü) veya büyük ARP patlamalarını keser; çok yüksek eşik döngüde koruma sağlamaz. Erişim portlarında %1–5 yaygındır.' },
                        { name: 'kbps', label: 'Kbps', type: 'text', validate: 'posint', requiredIf: { field: 'unit_t', in: ['kbps'] }, placeholder: '15000', hint: 'Birleşik BUM trafiği tavanı', why: 'Sabit tavan, portun hızından bağımsızdır; 10G porta 1G için hesaplanmış değer yazmak oranı fiilen çok düşürür.' },
                        { name: 'no_bc', label: 'Broadcast\'i sınırlama (no-broadcast)', type: 'checkbox', why: 'Broadcast fırtınası döngünün en tipik belirtisidir; broadcast\'i hariç tutmak korumanın ana amacını ortadan kaldırır. Yalnız bilinçli olarak kullanın.' },
                        { name: 'no_mc', label: 'Multicast\'i sınırlama (no-multicast)', type: 'checkbox', why: 'Yoğun multicast kullanan (IPTV, yayın) portlarda meşru trafiğin kesilmesini önler.' },
                        { name: 'no_uu', label: 'Bilinmeyen unicast\'i sınırlama (no-unknown-unicast)', type: 'checkbox', why: 'MAC tablosu henüz öğrenmemişken yapılan büyük aktarımlar flood edilir; bu trafiği hariç tutmak ilk dakikadaki kesintileri önleyebilir.' },
                        { name: 'shut', label: 'Eşik aşılınca portu kapat (action-shutdown)', type: 'checkbox', why: 'Varsayılan davranış fazla trafiği düşürmektir; shutdown ise portu tamamen kapatır. Kurtarma süresi verilmezse port elle açılana kadar kapalı kalır.' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifaces', label: 'Arayüzler', type: 'text', validate: 'iface_range', required: true, placeholder: 'ge-0/0/0, ge-0/0/1', hint: 'family ethernet-switching olan L2 portlar', why: 'Profil yalnız bağlandığı arayüzlerde etkilidir. Arayüzde <code>family ethernet-switching</code> yoksa bu satır commit\'te hata verir.' },
                        { name: 'recov', label: 'Otomatik Kurtarma (sn)', type: 'text', min: 10, max: 3600, placeholder: '300', hint: 'recovery-timeout; yalnız action-shutdown ile anlamlı', why: 'Kapatılan port bu süre sonunda kendiliğinden açılır. Verilmezse <code>clear ethernet-switching recovery-timeout</code> ile elle açmak gerekir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const p = cgEsc(data.prof || ''), ut = data.unit_t || 'pct', pct = cgEsc(data.pct || ''), kb = cgEsc(data.kbps || '');
            const ifs = cgJnpList(data.ifaces), rec = cgEsc(data.recov || '');
            const S = 'set forwarding-options storm-control-profiles ' + p;
            let c = cgJnpHdr('Storm Control (ELS)');
            if (ut === 'pct' && pct) c += S + ' all bandwidth-percentage ' + pct + '\n';
            if (ut === 'kbps' && kb) c += S + ' all bandwidth-level ' + kb + '\n';
            if (data.no_bc && data.no_mc && data.no_uu) c += '# UYARI: broadcast, multicast ve bilinmeyen unicast hariç tutuldu — profil hiçbir trafiği sınırlamaz.\n';
            if (data.no_bc) c += S + ' all no-broadcast\n';
            if (data.no_mc) c += S + ' all no-multicast\n';
            if (data.no_uu) c += S + ' all no-unknown-unicast\n';
            if (data.shut) c += S + ' action-shutdown\n';
            c += '\n';
            ifs.forEach(i => {
                const [ifn, un] = cgJnpIfUnit(i).map(cgEsc);
                c += 'set interfaces ' + ifn + ' unit ' + un + ' family ethernet-switching storm-control ' + p + '\n';
                if (data.shut && rec) c += 'set interfaces ' + ifn + ' unit ' + un + ' family ethernet-switching recovery-timeout ' + rec + '\n';
            });
            if (!data.shut && rec) c += '# NOT: recovery-timeout yalnız action-shutdown ile anlamlıdır — yazılmadı.\n';
            c += '\n# Doğrulama:\n# show configuration forwarding-options storm-control-profiles\n';
            if (ifs.length) c += '# show interfaces ' + cgEsc(cgJnpIfUnit(ifs[0])[0]) + ' extensive\n';
            if (data.shut) c += '# clear ethernet-switching recovery-timeout   (kapanan portu elle açmak için)\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Port Mirroring (Analyzer, ELS) ─────────────────────────────
// Sözdizimi: https://www.juniper.net/documentation/us/en/software/junos/network-mgmt/topics/topic-map/port-mirroring-and-analyzers-configuring.html
//   ([edit forwarding-options] analyzer … input ingress interface …, output interface …, output vlan …)
//   + https://www.juniper.net/documentation/us/en/software/junos/network-mgmt/topics/ref/statement/input-port-mirroring-els.html
//   (input egress interface …, input ingress vlan …)
Juniper.mirror = {
    label: 'Port Mirroring (Analyzer)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'Juniper JunOS — Port Mirroring (Analyzer)',
                desc: 'Yerel (çıkış portu) veya uzak (analyzer VLAN) trafik yansıtma.<br><small>Örn: <code>set forwarding-options analyzer MON1 input ingress interface ge-0/0/0.0</code> &nbsp;|&nbsp; <code>set forwarding-options analyzer MON1 output interface ge-0/0/10.0</code></small>'
            },
            sections: [
                {
                    title: 'Kaynak',
                    icon: 'fas fa-sign-in-alt',
                    fields: [
                        { name: 'name', label: 'Analyzer Adı', type: 'text', required: true, placeholder: 'MON1', hint: 'Oturum adı', why: 'Platforma göre aynı anda çalışabilecek analyzer sayısı sınırlıdır; işi biten oturumu <code>deactivate</code> veya <code>delete</code> ile kapatın, açık kalan yansıtma ASIC kaynağı tüketir.' },
                        { name: 'src_t', label: 'Kaynak Tipi', type: 'select', options: [
                            { value: 'iface', label: 'Arayüz', selected: true },
                            { value: 'vlan', label: 'VLAN (ingress)' }
                        ], why: 'Arayüz kaynağı belirli bir sunucu/portu izlemek içindir; VLAN kaynağı tüm VLAN\'a giren trafiği yansıtır ve çıkış portunu kolayca doyurur.' },
                        { name: 'in_ifaces', label: 'Ingress Arayüzler', type: 'text', validate: 'iface_range', requiredIf: { field: 'src_t', in: ['iface'] }, placeholder: 'ge-0/0/0.0, ge-0/0/1.0', hint: 'Unit ile (.0); porta GİREN trafik', why: 'Yalnız giren trafik yansıtılır; bir konuşmanın iki yönünü görmek için aynı portu egress olarak da ekleyin.' },
                        { name: 'eg_ifaces', label: 'Egress Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'ge-0/0/0.0', hint: 'Porttan ÇIKAN trafik (opsiyonel)', why: 'Ingress + egress birlikte port hızının iki katı trafik üretebilir; çıkış portu yetmezse fazlası sessizce düşer ve analizde eksik paket görürsünüz.' },
                        { name: 'in_vlan', label: 'Kaynak VLAN', type: 'text', requiredIf: { field: 'src_t', in: ['vlan'] }, placeholder: 'USERS', hint: 'VLAN adı veya ID', why: 'Analyzer\'ın giriş ve çıkışında aynı VLAN veya o VLAN\'ın üyeleri bulunmamalıdır; aksi halde yansıtılan paketler yeniden yansıtılır.' }
                    ]
                },
                {
                    title: 'Hedef',
                    icon: 'fas fa-sign-out-alt',
                    info: 'Çıkış arayüzü family ethernet-switching altında olmalı, kaynak port olamaz ve STP\'ye katılmaz.',
                    fields: [
                        { name: 'dst_t', label: 'Hedef Tipi', type: 'select', options: [
                            { value: 'iface', label: 'Yerel arayüz (analiz cihazı bu switch\'te)', selected: true },
                            { value: 'vlan', label: 'Analyzer VLAN (uzak analiz)' }
                        ], why: 'Analiz cihazı başka bir switch\'teyse trafik ayrı bir analyzer VLAN\'ı ile taşınır; bu VLAN üretim trafiği taşımamalıdır.' },
                        { name: 'out_if', label: 'Çıkış Arayüzü', type: 'text', validate: 'iface', requiredIf: { field: 'dst_t', in: ['iface'] }, placeholder: 'ge-0/0/10.0', hint: 'Analiz cihazının bağlı olduğu port (unit ile)', why: 'Çıkış portuna bağlı cihaz yansıtılan tüm trafiği görür; yanlış porta (ör. bir kullanıcı portuna) yönlendirmek veri sızıntısıdır.' },
                        { name: 'out_vlan', label: 'Analyzer VLAN', type: 'text', requiredIf: { field: 'dst_t', in: ['vlan'] }, placeholder: 'REMOTE-ANALYZER', hint: 'Önceden tanımlı VLAN adı veya ID', why: 'Analyzer VLAN\'ı uplink trunk\'larda taşınmalı ve uzak switch\'te analiz portuna access olarak verilmelidir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const n = cgEsc(data.name || ''), st = data.src_t || 'iface', dt = data.dst_t || 'iface';
            const ins = cgJnpList(data.in_ifaces).map(cgEsc), egs = cgJnpList(data.eg_ifaces).map(cgEsc), iv = cgEsc(data.in_vlan || '');
            const oi = cgEsc(data.out_if || ''), ov = cgEsc(data.out_vlan || '');
            const A = 'set forwarding-options analyzer ' + n;
            let c = cgJnpHdr('Port Mirroring (Analyzer)');
            if (st === 'iface') {
                ins.forEach(i => c += A + ' input ingress interface ' + i + '\n');
                egs.forEach(i => c += A + ' input egress interface ' + i + '\n');
            } else if (iv) {
                c += A + ' input ingress vlan ' + iv + '\n';
            }
            if (dt === 'iface' && oi) c += A + ' output interface ' + oi + '\n';
            if (dt === 'vlan' && ov) c += A + ' output vlan ' + ov + '\n';
            c += '\n# Doğrulama:\n# show forwarding-options analyzer\n# show configuration forwarding-options analyzer ' + n + '\n';
            return c;
        });
    }
};

// ── Juniper JunOS: Config Arşivleme (system archival) ─────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: system archival configuration transfer-interval, archive-sites "scp://…")
//   + https://www.juniper.net/documentation/us/en/software/junos/cli-reference/topics/ref/statement/archival-edit-system.html
//   (archive-sites <url> password <pw>, transfer-interval 15–2880 dk, transfer-on-commit)
Juniper.archival = {
    label: 'Config Arşivleme',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-archive',
                title: 'Juniper JunOS — Config Arşivleme',
                desc: 'Aktif konfigürasyonun periyodik veya her commit\'te SCP/FTP sunucusuna otomatik kopyalanması.<br><small>Örn: <code>set system archival configuration transfer-on-commit</code> &nbsp;|&nbsp; <code>set system archival configuration archive-sites "scp://backup@192.0.2.40/junos"</code></small>'
            },
            configTypes: [
                { id: 'commit', label: 'Her Commit\'te', icon: 'fas fa-check-circle', desc: 'transfer-on-commit', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'interval', label: 'Periyodik', icon: 'fas fa-clock', desc: 'transfer-interval (dk)', badge: { text: 'Zamanlı', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Arşiv Sunucusu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'site', label: 'Arşiv URL', type: 'text', required: true, placeholder: 'scp://backup@192.0.2.40/junos-archive', hint: 'scp://, ftp://, pasvftp://, http:// veya file://', why: 'SCP tercih edin; FTP/HTTP hem konfigü hem parolayı ağda düz metin taşır. Birden fazla site tanımlanırsa ilki başarısız olunca sıradakine geçilir.' },
                        { name: 'pw', label: 'Sunucu Parolası', type: 'text', placeholder: 'Arch-Pass-Example', hint: 'Boşsa parola satırı yazılmaz (anahtar tabanlı SCP)', why: 'Parola konfigde şifreli saklanır ama arşiv hesabının yetkisi yalnız hedef dizine yazmakla sınırlı olmalı; bu hesap tüm cihazlarda ortak olduğu için sızması tüm yedeklere erişim demektir.' },
                    ]
                },
                {
                    title: 'Periyot',
                    icon: 'fas fa-clock',
                    showFor: ['interval'],
                    fields: [
                        { name: 'interval', label: 'Aktarım Aralığı (dk)', type: 'text', min: 15, max: 2880, requiredIf: { field: '_cgtype', in: ['interval'] }, placeholder: '1440', hint: '15–2880 dakika', why: 'Periyodik aktarımda iki aktarım arasında yapılan ve sonra geri alınan değişiklikler arşive hiç girmez; değişiklik takibi için transfer-on-commit daha doğrudur.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'commit', site = cgEsc(cgJnpTxt(data.site)), pw = cgEsc(cgJnpTxt(data.pw)), iv = cgEsc(data.interval || '');
            const A = 'set system archival configuration';
            let c = cgJnpHdr('Config Arşivleme');
            if (/^(ftp|http):\/\//i.test(site)) c += '# UYARI: ftp:// / http:// konfigürasyonu ve parolayı düz metin taşır; scp:// önerilir.\n';
            if (type === 'commit') c += A + ' transfer-on-commit\n';
            else if (iv) c += A + ' transfer-interval ' + iv + '\n';
            c += A + ' archive-sites "' + site + '"' + (pw ? ' password "' + pw + '"' : '') + '\n';
            c += '\n# Doğrulama:\n# show configuration system archival\n# show system commit\n# show log messages\n';
            return c;
        });
    }
};

// ── Juniper JunOS: IGMP Snooping (ELS) ────────────────────────────────────────
// Sözdizimi: canlı config (1 Junos EX cihazı: protocols igmp-snooping vlan all / vlan <ad>)
//   + https://www.juniper.net/documentation/us/en/software/junos/multicast/topics/example/igmp-snooping-ex-series-configuring.html
//   (igmp-snooping vlan … immediate-leave, vlan … interface … multicast-router-interface)
//   + https://www.juniper.net/documentation/us/en/software/junos/multicast/topics/topic-map/mcast-igmp-snooping.html (show igmp snooping …)
Juniper.igmp = {
    label: 'IGMP Snooping',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'Juniper JunOS — IGMP Snooping (ELS)',
                desc: 'Multicast trafiğini yalnız dinleyen portlara iletmek için IGMP snooping; immediate-leave ve statik multicast-router portu.<br><small>Örn: <code>set protocols igmp-snooping vlan IPTV immediate-leave</code> &nbsp;|&nbsp; <code>… vlan IPTV interface ae0.0 multicast-router-interface</code></small>'
            },
            sections: [
                {
                    title: 'VLAN Kapsamı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'scope', label: 'Kapsam', type: 'select', options: [
                            { value: 'list', label: 'Belirli VLAN\'lar', selected: true },
                            { value: 'all', label: 'Tüm VLAN\'lar (vlan all)' }
                        ], why: 'Snooping kapalı VLAN\'da multicast broadcast gibi tüm portlara taşar. Per-VLAN seçenekler (immediate-leave, mrouter portu) yalnız belirli VLAN\'lar için yazılır.' },
                        { name: 'vlans', label: 'VLAN Adları', type: 'text', requiredIf: { field: 'scope', in: ['list'] }, placeholder: 'IPTV, CAMERA', hint: 'set vlans altında tanımlı adlar, virgülle', why: 'Junos\'ta VLAN burada adıyla anılır; tanımsız bir ad commit\'te hata verir.' },
                        { name: 'imm', label: 'Immediate-leave', type: 'checkbox', why: 'Son dinleyici ayrılınca trafik o porttan hemen kesilir; kanal değiştirmede (IPTV) gecikmeyi azaltır. Portta birden fazla dinleyici (arkasında hub/AP) varsa diğerlerinin yayını da kesilir.' },
                        { name: 'mrouter', label: 'Multicast Router Portu', type: 'text', validate: 'iface', placeholder: 'ae0.0', hint: 'Multicast kaynağına/router\'a giden uplink (unit ile)', why: 'Ağda IGMP querier yoksa switch router portunu öğrenemez ve join\'ler kaynağa ulaşmaz; statik mrouter portu bu durumda yayının akmasını sağlar.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const scope = data.scope || 'list', vl = cgJnpList(data.vlans).map(cgEsc), mr = cgEsc(data.mrouter || '');
            const I = 'set protocols igmp-snooping vlan ';
            let c = cgJnpHdr('IGMP Snooping');
            if (scope === 'all') {
                c += I + 'all\n';
                if (data.imm || mr) c += '# NOT: immediate-leave ve multicast-router-interface yalnız belirli VLAN\'lar için yazılır — "Belirli VLAN\'lar" seçin.\n';
            } else {
                vl.forEach(v => {
                    c += I + v + '\n';
                    if (data.imm) c += I + v + ' immediate-leave\n';
                    if (mr) c += I + v + ' interface ' + mr + ' multicast-router-interface\n';
                });
            }
            c += '\n# Doğrulama:\n# show igmp snooping membership\n# show igmp snooping interface\n# show igmp snooping statistics\n';
            return c;
        });
    }
};
