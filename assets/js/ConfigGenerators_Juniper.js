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
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'LAN Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'VLAN\'a üye erişim portu' },
                        { name: 'wan_iface', why: 'Uplink portu. Yanlış arayüzü seçip üzerine adres yazmak, uzaktan bağlanıyorsanız <code>commit</code> anında kendinizi dışarıda bırakır; riskli değişiklikte <code>commit confirmed 5</code> kullanın, onaylamazsanız cihaz otomatik geri döner.', label: 'WAN Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/0', hint: 'Uplink/WAN portu' },
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
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'Arayüz', type: 'text', required: true, placeholder: 'ge-0/0/15', hint: 'Porta bağlı fiziksel arayüz' },
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
                        { name: 'l3_ip', why: "Bu adres IRB arayüzüne yazılır ve VLAN'ın gateway'i olur. Aynı gateway'i VRRP/MC-LAG olmadan iki cihazda birden tanımlamak duplicate IP ve kararsız ARP tablosu üretir.", label: 'IRB IP / Prefix', type: 'text', optional: true, placeholder: '192.168.10.1/24', hint: 'VLAN gateway IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Trunk Ayarları',
                    icon: 'fas fa-sitemap',
                    info: 'Yalnızca Port Modu "Trunk" seçildiğinde geçerlidir.',
                    fields: [
                        { name: 'native_vlan', why: "Trunk üzerinde etiketsiz gelen çerçeveler bu VLAN'a atanır. İki uçtaki native VLAN farklıysa iki ağ arasında istemsiz köprü kurulur (VLAN hopping riski); mümkünse kullanılmayan bir VLAN seçin.", label: 'Native VLAN', type: 'text', validate: 'vlan', optional: true, placeholder: '1', hint: 'Trunk native VLAN ID (opsiyonel)' },
                        { name: 'allowed_vlans', why: "Trunk'ta yalnızca listelenen VLAN'lar taşınır. <code>all</code> yazmak kolaydır ama broadcast alanını tüm switch'lere yayar; yeni VLAN eklerken bu listeyi güncellemeyi unutmak en sık kopma sebebidir.", label: 'İzin Verilen VLAN\'lar', type: 'text', optional: true, placeholder: '10,20,30', hint: 'Virgülle ayrılmış VLAN listesi' }
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
                        { name: 'srv_irb_ip', why: "IRB adresi hem gateway hem de DHCP sunucunun istemci bacağıdır. Bu adres yoksa <code>dhcp-local-server</code> ilgili VLAN'da isteği hiç dinlemez.", label: 'IRB IP / Prefix', type: 'text', required: true, placeholder: '192.168.20.1/24', hint: 'IRB arayüzü IP adresi (CIDR)' },
                        { name: 'srv_vlan_id', why: 'IRB unit numarası. <code>irb.20</code> ile VLAN 20 arasındaki bağ otomatik değildir; VLAN altında <code>l3-interface irb.20</code> tanımlı değilse gateway ölü durur.', label: 'VLAN ID (IRB unit)', type: 'text', required: true, placeholder: '20', hint: 'IRB unit numarası = VLAN ID' },
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
                        { name: 'srv_static_ip', why: 'Sabit atanan adres, dinamik aralığın <b>dışında</b> ya da exclude edilmiş olmalıdır; aksi halde aynı IP başka bir istemciye de dağıtılır ve çakışma yaşanır.', label: 'Static IP', type: 'text', optional: true, placeholder: '192.168.20.100', hint: 'Atanacak sabit IP adresi' }
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
                        { name: 'gbl_bind_ip', why: "MAC'e sabitlenen adres. Havuzun ağı içinde ama dinamik dağıtım aralığının dışında olmalı; değilse aynı adres ikinci bir istemciye de verilebilir.", label: 'Static Bind IP', type: 'text', required: true, placeholder: '192.168.2.15', hint: 'MAC\'e bağlanacak sabit IP' },
                        { name: 'gbl_bind_mac', why: "Bağlamanın anahtarı MAC'tir. Sanal makinede klonlama veya NIC değişimi MAC'i değiştirdiğinde rezervasyon sessizce çalışmaz ve cihaz rastgele IP alır.", label: 'Static Bind MAC', type: 'text', required: true, placeholder: 'aa:bb:cc:dd:ee:ff', hint: 'Sabit IP atanacak MAC adresi' },
                        { name: 'gbl_iface', why: '<code>dhcp-local-server</code> yalnızca burada listelenen arayüzlerde istek dinler. Arayüzü eklemeyi unutmak, havuz doğru olsa bile hiçbir istemcinin IP alamaması demektir.', label: 'Arayüz', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'DHCP local server arayüzü' },
                        { name: 'gbl_ip', why: "Arayüz adresi, istemcilere verilecek gateway ile aynı subnet'te olmalıdır; DHCP sunucu hangi havuzu kullanacağına bu adrese bakarak karar verir.", label: 'Arayüz IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1/24', hint: 'Arayüz IP adresi (CIDR)' }
                    ]
                },
                {
                    title: 'Relay — Yapılandırma',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['relay'],
                    fields: [
                        { name: 'relay_iface', why: 'Relay, istemci tarafındaki arayüzde çalışır; yanlış arayüzde broadcast DISCOVER paketleri hiç yakalanmaz. Aynı arayüzde relay ile local-server birlikte kullanılamaz.', label: 'Relay Arayüzü', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'İstemci tarafındaki arayüz' },
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
                        { name: 'src_ip', why: 'Prefix uzunluğu eşleşmenin kapsamını belirler: /32 tek host, /24 tüm subnet. Maskeyi geniş yazmak filtreyi beklediğinizden çok daha fazla trafiğe uygular.', label: 'Kaynak IP / Prefix', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.0/24', hint: '"Belirli IP/Prefix" seçilirse doldur' }
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
                        { name: 'dst_ip', why: "Hedef prefix'i geniş yazmak (ör. /24), tek sunucuya uyguladığınızı sandığınız kuralı tüm subnet'e uygular; host için <code>/32</code> kullanın.", label: 'Hedef IP / Prefix', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1/32', hint: '"Belirli IP/Prefix" seçilirse doldur' },
                        { name: 'src_port', why: 'Kaynak port çoğu istemcide rastgele yüksek porttur; kaynak porta göre filtrelemek genellikle hatalıdır ve kuralın hiç eşleşmemesine yol açar.', label: 'Kaynak Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 80', hint: 'TCP/UDP kaynak port (any veya numara)' },
                        { name: 'dst_port', why: 'Servisi belirleyen alan hedef porttur. Firewall filter <b>stateless</b> olduğu için dönüş trafiği ayrı bir term ile ele alınmalıdır — sadece gidiş yönünü yazmak bağlantıyı tek yönlü kırar.', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 443', hint: 'TCP/UDP hedef port (any veya numara)' },
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
                        { name: 'apply_iface', why: 'Filtre bir arayüze uygulanmadan hiçbir şey yapmaz. <code>lo0</code> üzerine uygulanan filtre cihazın kendi kontrol düzlemini korur — oraya yanlış filtre koymak tüm yönetim erişimini bitirir.', label: 'Uygulama Arayüzü', type: 'text', optional: true, placeholder: 'ge-0/0/0', hint: 'Filtreyi uygulayacak arayüz (opsiyonel)' },
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
            let c = '# ========================================\n# Juniper JunOS — Firewall Filter (ACL)\n# ========================================\n\nconfigure\n\n';
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
                        { name: 'iface', why: "JunOS'ta fiziksel arayüz adı yuva/PIC/port düzenini taşır (<code>ge-0/0/1</code>) ve konfigin etkili olması için mutlaka bir logical unit (<code>.0</code>) gerekir. Var olmayan arayüz adı commit'te hata vermeyebilir, sadece sessizce çalışmaz.", label: 'Interface', type: 'text', required: true, placeholder: 'xe-0/0/0', hint: 'Fiziksel arayüz adı (ör: xe-0/0/0, ge-0/0/0)' },
                        { name: 'unit', why: "JunOS'ta adres fiziksel arayüze değil <b>logical unit</b>'e yazılır ve etiketsiz arayüzlerde unit her zaman <code>0</code> olmalıdır. Tagging açık değilken 0 dışında unit vermek commit hatası verir.", label: 'Unit', type: 'text', required: true, placeholder: '0', hint: 'Logical unit numarası (genellikle 0)' },
                        { name: 'desc', why: 'Trafiği etkilemez ama <code>show interfaces descriptions</code> çıktısında görünür. Portun hangi devreye gittiğinin bilinmemesi, sahada yanlış kablo çekilmesinin bir numaralı sebebidir.', label: 'Açıklama', type: 'text', optional: true, placeholder: 'To-Provider-PE1', hint: 'Arayüz açıklaması' },
                        { name: 'ip', why: "Adres, logical unit altında <code>family inet</code> içine yazılır. Aynı unit'e ikinci adres eklerseniz JunOS ikisini birden tutar; eskisini gerçekten kaldırmak için <code>delete</code> gerekir — yeni adresi <code>set</code> etmek eskisini silmez.", label: 'IP Adresi / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' }
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
                        { name: 'lo_iface', why: "Loopback'i <b>passive</b> işaretlemek prefix'i duyurur ama üzerinde komşuluk aramaz. Passive yapılmayan kullanıcı/yönetim arayüzleri ise güvenilmeyen tarafa OSPF paketi yayar ve sahte komşu kabul edebilir.", label: 'Loopback (passive)', type: 'text', optional: true, placeholder: 'lo0.0', hint: 'Passive olarak işaretlenecek loopback arayüzü' },
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
                        { name: 'ce_iface', why: "Müşteri bacağı arayüzü VRF'e atandığı anda global tablodan çıkar. Alt arayüz (ör. <code>.100</code>) kullanıyorsanız VLAN tagging açık olmalı, yoksa unit adres almaz.", label: 'CE Interface', type: 'text', required: true, placeholder: 'xe-0/1/0.100', hint: 'Müşteri tarafı arayüzü' },
                        { name: 'ce_ip', why: "PE-CE link adresi VRF içinde connected route olarak görünür. İki müşteride aynı adres kullanılması sorun değildir — izolasyonu sağlayan VRF'tir.", label: 'CE IP / Prefix', type: 'text', required: true, placeholder: '10.1.1.1/30', hint: 'CE-PE link IP adresi (CIDR)' },
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
                        { name: 'ae_ip', why: "Layer 3 modda adres <code>ae0.0</code> üzerine yazılır, üye fiziksel portlara değil. Fiziksel portta adres bırakmak commit'i reddettirir.", label: 'AE IP (routed ise)', type: 'text', optional: true, placeholder: '10.0.0.1/30', hint: 'Layer 3 routed mod için IP adresi (CIDR)' },
                        { name: 'vlans', why: "L2 trunk modda taşınacak VLAN listesi. İki uçtaki liste farklıysa eksik VLAN'ların trafiği tek yönlü kaybolur ve arıza aralıklı gibi görünerek teşhisi zorlaştırır.", label: 'Trunk VLAN\'lar (L2 ise)', type: 'text', optional: true, placeholder: '10 20 100', hint: 'Boşluk/virgülle ayrılmış VLAN listesi (L2 trunk mod)' }
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
                        { name: 'lo_iface', why: "VTEP kaynağı loopback olmalıdır; fiziksel arayüz kullanmak, o link düştüğünde tüm VXLAN tünellerinin kopması demektir. Bu loopback underlay'de duyurulmazsa uzak VTEP'ler birbirini hiç bulamaz.", label: 'VTEP Loopback', type: 'text', required: true, placeholder: 'lo0.0', hint: 'VTEP kaynak arayüzü (loopback)' },
                        { name: 'vtep_ip', why: "VTEP kaynak adresi <code>/32</code> olmalı ve underlay'de duyurulmalıdır. Uzak VTEP bu adrese ulaşamıyorsa EVPN route'ları görünse bile veri düzleminde tek paket geçmez.", label: 'VTEP IP / Prefix', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1/32', hint: 'Loopback IP adresi (CIDR)' }
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
                        { name: 'trap_group', why: 'Trap group hem sürümü hem alıcıları belirler. <code>categories</code> eklemezseniz grup tanımlı görünür ama hiçbir trap gönderilmez.', label: 'Trap Group Adı', type: 'text', required: true, placeholder: 'TRAPS', hint: 'SNMP trap group adı' },
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
