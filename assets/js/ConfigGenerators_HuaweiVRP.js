'use strict';

const HuaweiVRP = {};

// ── Lab bulgularından türetilen girdi uyarıları (CLI Lab hua-07/10/11/13/15/17 arıza ve "çalışır ama yanlış" durumları) ──
const _vrpWip = ip => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip || '').trim()) && String(ip).trim().split('.').every(o => +o <= 255);
const _vrpWn = ip => String(ip || '').trim().split('.').reduce((a, o) => a * 256 + (+o), 0);
// '24' | '/24' | '255.255.255.0' → 24; geçersizse NaN
function _vrpWlen(m) {
    const t = String(m || '').trim().replace(/^\//, '');
    if (/^\d{1,2}$/.test(t)) return +t <= 32 ? +t : NaN;
    const l = typeof cgMaskLen === 'function' ? cgMaskLen(t) : '';
    return l === '' ? NaN : +l;
}
// Adresin ağı: { base, size } (len geçersizse null)
function _vrpWnet(ip, len) {
    if (!_vrpWip(ip) || !(len >= 0 && len <= 32)) return null;
    const size = 2 ** (32 - len);
    return { base: Math.floor(_vrpWn(ip) / size) * size, size };
}
const _vrpWstr = n => [24, 16, 8, 0].map(b => Math.floor(n / 2 ** b) % 256).join('.');
const _vrpWinNet = (ip, net) => !!net && _vrpWip(ip) && Math.floor(_vrpWn(ip) / net.size) * net.size === net.base;
// Arayüz adresi ağ ya da yayın adresi mi? (/31 ve /32 hariç)
const _vrpWnetOrBc = (ip, len) => { const n = _vrpWnet(ip, len); return !!n && len < 31 && (_vrpWn(ip) === n.base || _vrpWn(ip) === n.base + n.size - 1); };
// Wildcard alanına alt ağ maskesi yazılmış mı? (255.255.255.0 gibi; 255.255.255.255 "her şey" anlamında kullanılabilir)
function _vrpWwildMask(w) {
    const t = String(w || '').trim();
    return _vrpWip(t) && /^255\./.test(t) && t !== '255.255.255.255' && !isNaN(_vrpWlen(t));
}
// Adres, wildcard'ın "önemsiz" bitlerinde 1 içeriyor mu? (10.64.10.5 0.0.0.255 gibi)
function _vrpWhostBits(ip, wild) {
    if (!_vrpWip(ip) || !_vrpWip(wild) || _vrpWwildMask(wild)) return false;
    const a = _vrpWn(ip), w = _vrpWn(wild), oct = (n, b) => Math.floor(n / 2 ** b) % 256;
    return [24, 16, 8, 0].some(b => (oct(a, b) & oct(w, b)) !== 0);
}

// ── Huawei: Basic ─────────────────────────────────────────────────────────────
HuaweiVRP.basic = {
    label: 'Basic',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Basic (Huawei VRP)',
                desc: 'Huawei VRP temel başlangıç konfigürasyonu — hostname, VLAN, LAN/WAN arayüz IP ve default gateway ayarları.'
            },
            sections: [
                {
                    title: 'Cihaz ve VLAN',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hostname', why: "Sysname sadece kozmetik değil: VRP komut isteminin (<code>[SW1]</code>) ve üretilen tüm konfig satırlarının önekidir, ayrıca SSH/TACACS loglarında cihazı bu isimle ararsınız. Aynı ismi iki cihaza verirseniz arıza anında yanlış cihaza müdahale edersiniz.", label: 'Hostname (sysname)', type: 'text', required: true, placeholder: 'SW1', hint: 'Cihaz adı (sysname komutu ile atanır)' },
                        { name: 'vlan', why: "Bu VLAN önce <code>vlan X</code> ile oluşturulmazsa <code>interface Vlanif X</code> komutu hata verir; Huawei Cisco gibi otomatik VLAN yaratmaz. Ayrıca yönetim VLAN numarası karşı switch tarafında da tanımlı ve trunk üzerinde izinli olmalı, yoksa cihaza uzaktan erişimi kaybedersiniz.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Yönetim veya LAN VLAN numarası' }
                    ]
                },
                {
                    title: 'IP Adresleme',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'ip', why: "Vlanif arayüzüne atanan bu IP cihazın yönetim adresidir; yanlış subnet verirseniz <code>save</code> sonrası reboot ile birlikte uzaktan erişim tamamen kopar ve konsol kablosu gerekir. IP çakışması olursa ARP tablosu kararsızlaşır ve yönetim oturumları rastgele düşer.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Vlanif arayüzüne atanacak IP' },
                        { name: 'mask', why: "Huawei Vlanif altında maskeyi noktalı desimal olarak bekler; <code>/24</code> yazarsanız komut reddedilir. Maske bir bit yanlışsa gateway aynı subnette görünmez ve tüm yönlendirme sessizce çalışmaz.", label: 'Subnet Mask', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.255.0', hint: 'Tam netmask formatında (örn: 255.255.255.0)' },
                        { name: 'gw', why: "Bu adres <code>ip route-static 0.0.0.0 0.0.0.0</code> olarak yazılır; next-hop yerel subnetin dışındaysa VRP rotayı kabul eder ama rota aktif olmaz (inactive) ve internet erişimi sessizce çalışmaz. <code>display ip routing-table</code> ile rotanın Active olduğunu doğrulayın.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'ip route-static 0.0.0.0 0.0.0.0 ile eklenir' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "Bu arayüz <code>port link-type access</code> + <code>port default vlan</code> ile yapılandırılır. Arayüz daha önce trunk yapıldıysa link-type değişimi izinli VLAN listesini sıfırlar; uplink portunu buraya yazarsanız o anda tüm ağ bağlantısını keserseniz.", label: 'LAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Access port olarak yapılandırılır' },
                        { name: 'wan_iface', why: "WAN portu L3 IP alabilmesi için switch üzerinde <code>undo portswitch</code> ile routed moda alınmış olmalı, aksi halde <code>ip address</code> komutu kabul edilmez. VRP arayüzleri varsayılan olarak açık gelir ama <code>undo shutdown</code> yoksa manuel kapatılmış bir portta link asla kalkmaz.", label: 'WAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'IP adresi doğrudan atanır, undo shutdown yapılır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || ''), ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || ''), gw = cgEsc(data.gw || '');
            const iface = cgEsc(data.iface || ''), wan = cgEsc(data.wan_iface || '');
            let c = '# ========================================\n# Huawei — Basic Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + hn + '\n\n';
            c += '# VLAN\n[' + hn + '] vlan ' + vlan + '\n[' + hn + '-vlan' + vlan + '] name VLAN_' + vlan + '\n[' + hn + '-vlan' + vlan + '] quit\n';
            c += '[' + hn + '] interface Vlanif' + vlan + '\n[' + hn + '-Vlanif' + vlan + '] ip address ' + ip + ' ' + mask + '\n[' + hn + '-Vlanif' + vlan + '] quit\n\n';
            c += '# LAN Interface\n[' + hn + '] interface ' + iface + '\n[' + hn + '-' + iface + '] port link-type access\n[' + hn + '-' + iface + '] port default vlan ' + vlan + '\n[' + hn + '-' + iface + '] quit\n\n';
            c += '# WAN Interface\n[' + hn + '] interface ' + wan + '\n[' + hn + '-' + wan + '] ip address ' + ip + ' ' + mask + '\n[' + hn + '-' + wan + '] undo shutdown\n[' + hn + '-' + wan + '] quit\n\n';
            c += '# Default Gateway\n[' + hn + '] ip route-static 0.0.0.0 0.0.0.0 ' + gw + '\n';
            return c;
        });
    }
};

// ── Huawei: VLAN ─────────────────────────────────────────────────────────────
HuaweiVRP.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VLAN (Huawei VRP)',
                desc: 'Huawei switch VLAN yapılandırması — access ve trunk port tipleri, batch VLAN oluşturma.'
            },
            configTypes: [
                { id: 'access', label: 'Access Port', icon: 'fas fa-plug', desc: 'Tekli VLAN, son kullanıcı portu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'trunk', label: 'Trunk Port', icon: 'fas fa-project-diagram', desc: 'Birden fazla VLAN, uplink portu' }
            ],
            sections: [
                {
                    title: 'Switch ve Arayüz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'sw_name', why: "Üretilen konfigdeki komut istemi öneki bu isimden türetilir; cihazdaki gerçek sysname ile uyuşmazsa blok halinde yapıştırırken satırların hangi moda ait olduğunu takip edemez, yanlış görünüm altında komut çalıştırırsınız.", label: 'Switch Adı', type: 'text', required: true, placeholder: 'SW1', hint: 'Cihazın sysname değeri' },
                        { name: 'iface', why: "Port tipi (<b>access / trunk / hybrid</b>) bu arayüzde değişir. Huaweide hybrid varsayılan tiptir ve Ciscodan gelenler bunu trunk sanıp <code>port trunk allow-pass</code> yazar; komut hybrid portta reddedilir ve VLAN geçişi hiç kurulmaz.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Port tipi uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'Access VLAN Ayarları',
                    icon: 'fas fa-tag',
                    showFor: ['access'],
                    fields: [
                        { name: 'vlan_id', why: "VLAN cihazda <code>vlan X</code> ile yaratılmadan porta atanamaz. Access portta bu numara <code>port default vlan</code> olur; karşı uçtaki PVID farklıysa trafik yanlış broadcast domainine düşer ve sorun ping değil sadece DHCP/ARP seviyesinde görünür.", label: 'VLAN ID (tekli)', type: 'text', required: true, validate: 'vlan', placeholder: '10', hint: 'Porta atanacak tekil VLAN numarası' },
                        { name: 'vlan_desc', why: "Açıklama boşluk içeremez ve <code>display vlan</code> çıktısında tek tanımlayıcıdır. Numaradan ibaret VLANlar zamanla kimin olduğu bilinmeyen kalıntılara dönüşür ve temizlik sırasında yanlış VLAN silinir.", label: 'VLAN Açıklaması', type: 'text', optional: true, placeholder: 'BT_Personel', hint: 'VLAN description etiketi' },
                        { name: 'vlan_batch_list', why: "<code>vlan batch</code> yalnızca VLANları oluşturur; trunk üzerinde <code>port trunk allow-pass vlan</code> ile ayrıca izin verilmezse bu VLANlarda tag işaretli trafik sessizce düşer. Toplu oluşturma yanlış aralıkla yazılırsa yüzlerce gereksiz VLAN açılır ve MSTP instance eşlemesi bozulur.", label: 'VLAN Batch Liste', type: 'text', validate: 'vlan_list', optional: true, placeholder: '5 8 17', hint: 'Boşlukla ayrılmış birden fazla VLAN ID' },
                        { name: 'vlan_batch_range', why: "Aralık sözdizimi <code>20 to 30</code> şeklindedir; tire (<code>20-30</code>) yazarsanız komut hata verir. Çok geniş aralık açmak STP hesaplama yükünü ve broadcast alanını gereksiz büyütür.", label: 'VLAN Batch Aralık', type: 'text', validate: 'vlan_list', optional: true, placeholder: '20 to 30', hint: 'Aralık formatında VLAN oluşturma (örn: 20 to 30)' }
                    ]
                },
                {
                    title: 'Trunk VLAN Ayarları',
                    icon: 'fas fa-stream',
                    showFor: ['trunk'],
                    fields: [
                        { name: 'trunk_vlans', why: "Trunk portta izin verilmeyen VLAN trafiği hata vermeden düşer; en sık arıza budur. İki ucun izin listesi simetrik olmalı ve PVID VLAN (<code>port trunk pvid vlan</code>) da listeye dahil edilmelidir, aksi halde etiketsiz yönetim trafiği kaybolur.", label: 'İzin Verilen VLAN\'lar', type: 'text', validate: 'vlan_list', optional: true, placeholder: '10 20 30', hint: 'Boşlukla ayrılmış VLAN listesi' },
                        { name: 'trunk_all', why: "<code>allow-pass vlan all</code> tüm VLANları açar; kolay çözüm gibi görünse de yayın alanını ve MAC tablosunu şişirir, komşu switchten gelen istenmeyen VLANları da içeri alır. Üretim ortamında açıkça listelemek güvenlidir.", label: 'Tüm VLAN\'lara izin ver', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.sw_name || ''), pt = data._cgtype || 'access', iface = cgEsc(data.iface || '');
            let c = '# ========================================\n# Huawei — VLAN Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + hn + '\n\n';
            if (pt === 'access') {
                const vid = cgEsc(data.vlan_id || ''), desc = cgEsc(data.vlan_desc || '');
                const blist = cgHwVlanList(cgEsc(data.vlan_batch_list || '')), brange = cgHwVlanList(cgEsc(data.vlan_batch_range || ''));
                if (vid) {
                    c += '[' + hn + '] vlan ' + vid + '\n';
                    if (desc) c += '[' + hn + '-vlan' + vid + '] description ' + desc + '\n';
                    c += '[' + hn + '-vlan' + vid + '] quit\n\n';
                }
                if (blist) c += '[' + hn + '] vlan batch ' + blist + '\n\n';
                if (brange) c += '[' + hn + '] vlan batch ' + brange + '\n\n';
                c += '[' + hn + '] interface ' + iface + '\n';
                c += '[' + hn + '-' + iface + '] port link-type access\n';
                if (vid) c += '[' + hn + '-' + iface + '] port default vlan ' + vid + '\n';
                c += '[' + hn + '-' + iface + '] quit\n';
            } else {
                const tvlans = cgHwVlanList(cgEsc(data.trunk_vlans || '')), tall = data.trunk_all;
                c += '[' + hn + '] interface ' + iface + '\n';
                c += '[' + hn + '-' + iface + '] port link-type trunk\n';
                if (tall) {
                    c += '[' + hn + '-' + iface + '] port trunk allow-pass vlan all\n';
                } else if (tvlans) {
                    c += '[' + hn + '-' + iface + '] port trunk allow-pass vlan ' + tvlans + '\n';
                }
                c += '[' + hn + '-' + iface + '] quit\n';
            }
            return c;
        });
    }
};

// ── Huawei: DHCP ─────────────────────────────────────────────────────────────
HuaweiVRP.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'DHCP (Huawei VRP)',
                desc: 'Huawei DHCP yapılandırması — interface tabanlı sunucu, global pool veya relay agent modu.'
            },
            configTypes: [
                { id: 'server', label: 'Interface (Sunucu)', icon: 'fas fa-server', desc: 'Arayüz bazlı DHCP sunucu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'global', label: 'Global Pool', icon: 'fas fa-globe', desc: 'Global IP pool ile DHCP sunucu' },
                { id: 'relay', label: 'Relay', icon: 'fas fa-arrows-alt-h', desc: 'DHCP relay agent modu' }
            ],
            sections: [
                {
                    title: 'Cihaz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'device_name', why: "Üretilen konfig satırlarının görünüm öneki bu isme göre yazılır; gerçek cihazdaki sysname farklıysa hangi komutun hangi view altında çalıştığını izlemek zorlaşır ve yanlış view içinde komut denersiniz.", label: 'Cihaz Adı (sysname)', type: 'text', required: true, placeholder: 'R1', hint: 'Router veya switch sysname değeri' }
                    ]
                },
                {
                    title: 'Interface Sunucu Ayarları',
                    icon: 'fas fa-ethernet',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_iface', why: "Bu arayüzde <code>dhcp select interface</code> aktif edilir. Global <code>dhcp enable</code> yapılmadan hiçbir DHCP komutu kabul edilmez; ayrıca aynı arayüzde hem interface hem global pool seçilemez, ikisi birbirini dışlar.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'DHCP sunucu olarak yapılandırılacak arayüz' },
                        { name: 'srv_ip', why: "İstemciler adreslerini bu arayüz IP adresinin bulunduğu subnetten alır; yanlış subnet verirseniz havuz hiç oluşmaz veya istemciler erişemeyecekleri bir gateway alır. Bu IP aynı zamanda istemcilerin varsayılan ağ geçididir.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Arayüze atanacak IP' },
                        { name: 'srv_prefix', why: "Prefix uzunluğu doğrudan dağıtılacak adres havuzunun boyutunu belirler; dar verirseniz istemciler adres bulamaz, geniş verirseniz komşu subnetle çakışır ve çift IP çatışmaları başlar.", label: 'Prefix (CIDR)', type: 'text', required: true, placeholder: '24', hint: 'Subnet prefix uzunluğu (örn: 24)' }
                    ]
                },
                {
                    title: 'Global Pool Ayarları',
                    icon: 'fas fa-database',
                    showFor: ['global'],
                    fields: [
                        { name: 'pool_name', why: "Global havuz adı <code>dhcp select global</code> yapan arayüzlerle network eşleşmesi üzerinden bağlanır, isimle değil. Havuzun <code>network</code> satırı arayüz subneti ile örtüşmezse istemciye hiç yanıt gitmez ve istemci APIPA adresine düşer.", label: 'Havuz Adı', type: 'text', required: true, placeholder: 'LAN1', hint: 'DHCP pool ismi' },
                        { name: 'pool_gw', why: "Gateway istemciye verilir ama cihazın gerçekten o IP ile ulaşılabilir olması gerekir. Yanlış gateway verildiğinde istemci IP alır, ping ile yerel ağı görür ama internete hiç çıkamaz; arıza DHCP değil yönlendirme sorunu gibi görünür.", label: 'Gateway (gateway-list)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1', hint: 'DHCP istemcilerine verilecek default gateway' },
                        { name: 'pool_dns', why: "DNS yanlış veya erişilemezse istemci IP alır ve ping IP adresleriyle çalışır, fakat kullanıcı için ağ tamamen bozuk görünür. Yedek DNS de tanımlamak tek sunucu arızasında tüm siteyi durdurmayı engeller.", label: 'DNS Sunucusu', type: 'text', validate: 'ip', optional: true, placeholder: '8.8.8.8', hint: 'DHCP ile dağıtılacak DNS IP' },
                        { name: 'gbl_iface', why: "Bu arayüzde <code>dhcp select global</code> kullanılır; arayüz IP adresi hangi global havuzun <code>network</code> tanımına düşüyorsa o havuz seçilir. Eşleşen havuz yoksa istemciye yanıt verilmez ve hata mesajı üretilmez.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'dhcp select global uygulanacak arayüz' },
                        { name: 'gbl_ip', why: "Arayüz IP adresi havuz seçimini belirleyen anahtardır; havuz network satırı ile aynı subnette olmalıdır. Aksi halde DHCP mekanizması aktif görünür ama hiçbir istemci adres alamaz.", label: 'Arayüz IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1', hint: 'Arayüze atanacak IP adresi' },
                        { name: 'gbl_prefix', why: "Prefix, arayüzün hangi havuza eşleneceğini belirler. Havuzdaki maske ile arayüzdeki maske farklıysa eşleşme kurulmaz; VRP bunu uyarı vermeden geçer.", label: 'Prefix (CIDR)', type: 'text', required: true, placeholder: '24', hint: 'Subnet prefix uzunluğu' }
                    ]
                },
                {
                    title: 'Relay Ayarları',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['relay'],
                    fields: [
                        { name: 'relay_iface', why: "Relay arayüzünde <code>dhcp select relay</code> aktif edilir. Aynı arayüzde relay ile server modu birlikte olamaz; yanlışlıkla ikisi denenirse ikinci komut reddedilir veya mevcut yapı sessizce devre dışı kalır.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/2', hint: 'Relay agent olacak arayüz' },
                        { name: 'relay_ip', why: "Bu IP relay edilen isteklerin <b>giaddr</b> alanına yazılır ve DHCP sunucusu hangi havuzdan adres vereceğine buna bakarak karar verir. Yanlış IP verirseniz sunucu yanlış subnetten adres dağıtır veya hiç yanıt vermez.", label: 'Relay Interface IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.3.1', hint: 'Relay arayüzüne atanacak IP' },
                        { name: 'relay_prefix', why: "Relay arayüzünün maskesi istemci ağının maskesiyle aynı olmalıdır; sunucu havuzu, relay'in eklediği arayüz adresine (giaddr) ve bu ağa göre seçer.", label: 'Prefix (CIDR)', type: 'text', optional: true, placeholder: '24', hint: 'Subnet prefix uzunluğu (boşsa 24)' },
                        { name: 'relay_servers', why: "Sunucu listesindeki adreslere cihazdan yönlendirilebilir bir yol olmalı ve dönüş trafiği için sunucu tarafında relay subnetine rota bulunmalıdır. Sunucuya giden yol tek yönlüyse istemci DISCOVER gönderir, OFFER asla geri dönmez.", label: 'DHCP Sunucu IP(leri)', type: 'text', required: true, placeholder: '10.128.10.1', hint: 'Virgülle ayrılmış DHCP sunucu IP listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = data._cgtype || 'server', dn = cgEsc(data.device_name || '');
            let c = '# ========================================\n# Huawei — DHCP Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + dn + '\n[' + dn + '] dhcp enable\n\n';
            if (mode === 'server') {
                const iface = cgEsc(data.srv_iface || ''), ip = cgEsc(data.srv_ip || ''), prefix = cgEsc(data.srv_prefix || '');
                c += '[' + dn + '] interface ' + iface + '\n';
                c += '[' + dn + '-' + iface + '] ip address ' + ip + ' ' + prefix + '\n';
                c += '[' + dn + '-' + iface + '] dhcp select interface\n';
                c += '[' + dn + '-' + iface + '] quit\n';
            } else if (mode === 'global') {
                const pool = cgEsc(data.pool_name || ''), gw = cgEsc(data.pool_gw || ''), dns = cgEsc(data.pool_dns || '');
                const giface = cgEsc(data.gbl_iface || ''), gip = cgEsc(data.gbl_ip || ''), gprefix = cgEsc(data.gbl_prefix || '');
                // Havuzun "network" satırı zorunludur: onsuz havuzda dağıtılacak adres yoktur ve arayüz de havuzla eşleşmez.
                const gnet = _vrpWnet(data.gbl_ip, _vrpWlen(data.gbl_prefix));
                c += '[' + dn + '] ip pool ' + pool + '\n';
                c += '[' + dn + '-ip-pool-' + pool + '] gateway-list ' + gw + '\n';
                if (gnet) c += '[' + dn + '-ip-pool-' + pool + '] network ' + _vrpWstr(gnet.base) + ' mask ' + _vrpWlen(data.gbl_prefix) + '\n';
                else c += '# UYARI: arayüz IP/prefix geçersiz — havuzun network satırı yazılamadı (network <ağ> mask <prefix>).\n';
                if (dns) c += '[' + dn + '-ip-pool-' + pool + '] dns-list ' + dns + '\n';
                c += '[' + dn + '-ip-pool-' + pool + '] quit\n\n';
                c += '[' + dn + '] interface ' + giface + '\n';
                c += '[' + dn + '-' + giface + '] ip address ' + gip + ' ' + gprefix + '\n';
                c += '[' + dn + '-' + giface + '] dhcp select global\n';
                c += '[' + dn + '-' + giface + '] quit\n';
            } else {
                const riface = cgEsc(data.relay_iface || ''), rip = cgEsc(data.relay_ip || ''), rpfx = cgEsc(data.relay_prefix || '') || '24';
                const servers = cgEsc(data.relay_servers || '').split(',').map(s => s.trim()).filter(Boolean);
                c += '[' + dn + '] interface ' + riface + '\n';
                c += '[' + dn + '-' + riface + '] ip address ' + rip + ' ' + rpfx + '\n';
                c += '[' + dn + '-' + riface + '] dhcp select relay\n';
                servers.forEach(srv => {
                    c += '[' + dn + '-' + riface + '] dhcp relay server-ip ' + srv + '\n';
                });
                c += '[' + dn + '-' + riface + '] quit\n';
            }
            c += '\n# Doğrulama:\n# display ip pool' + (mode === 'global' ? ' name ' + cgEsc(data.pool_name || '') + ' used' : '') + '   ! dağıtılan adresler\n';
            return { config: c, warnings: _vrpWdhcp(data, mode) };
        });
    }
};
// DHCP lab bulguları (hua-11): ağ geçidi ağ dışında, arayüz adresi ağ/yayın adresi, relay yanlış arayüz
function _vrpWdhcp(data, mode) {
    const w = [], v = k => String(data[k] == null ? '' : data[k]).trim();
    const chk = (ip, pfx, what) => {
        const len = _vrpWlen(v(pfx) || (pfx === 'relay_prefix' ? '24' : ''));
        if (v(pfx) && isNaN(len)) { w.push('\u26D4 ' + what + ' prefix değeri geçersiz: 8-30 arası bir uzunluk (ör. 24) ya da noktalı maske girin.'); return null; }
        if (len > 30 && len <= 32) w.push('\u26A0 /' + len + ' ağında istemciye verilecek adres kalmaz; DHCP için /30\'dan geniş bir ağ gerekir.');
        if (_vrpWnetOrBc(v(ip), len)) w.push('\u26D4 ' + what + ' IP adresi (' + v(ip) + '/' + len + ') ağ ya da yayın adresi; arayüze bir host adresi girin (ör. .1).');
        return _vrpWnet(v(ip), len);
    };
    if (mode === 'server') {
        chk('srv_ip', 'srv_prefix', 'Arayüz');
        w.push('\u2139 "dhcp select interface" arayüz IP\'sini istemcilere ağ geçidi olarak verir ve arayüzün tüm ağından dağıtır. Yazıcı/sunucu gibi statik adresleri korumak için arayüz görünümünde "dhcp server excluded-ip-address <ilk> <son>" ekleyin.');
    } else if (mode === 'global') {
        const net = chk('gbl_ip', 'gbl_prefix', 'Arayüz');
        if (net && _vrpWip(v('pool_gw'))) {
            if (!_vrpWinNet(v('pool_gw'), net)) w.push('\u26D4 Ağ geçidi (gateway-list ' + v('pool_gw') + ') havuzun ağında değil: istemciler adres alır ama ağ geçidine ulaşamaz — "IP var, internet yok".');
            else if (v('pool_gw') !== v('gbl_ip')) w.push('\u2139 Ağ geçidi arayüz adresinden (' + v('gbl_ip') + ') farklı. Bilinçli değilse (ör. VRRP sanal adresi) istemciler yanlış geçide gider.');
        }
        w.push('\u2139 Havuzdan dağıtılmaması gereken adresleri (ağ geçidi, yazıcı, sunucu) havuz görünümünde "excluded-ip-address <ilk> <son>" ile hariç tutun; yoksa IP çakışması olur.');
    } else {
        chk('relay_ip', 'relay_prefix', 'Relay arayüzü');
        w.push('\u2139 "dhcp select relay", istemcilerin bağlı olduğu (isteğin geldiği) arayüze yazılır; sunucuya bakan arayüze değil. Sunucuda da bu ağ için bir havuz ve relay ağına dönüş rotası olmalı.');
        v('relay_servers').split(',').map(x => x.trim()).filter(Boolean).forEach(x => { if (!_vrpWip(x)) w.push('\u26D4 DHCP sunucu adresi geçersiz: "' + x + '" (virgülle ayrılmış IPv4 adresleri girin).'); });
    }
    return w;
}
// ── Huawei: SNMP ─────────────────────────────────────────────────────────────
HuaweiVRP.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP (Huawei VRP)',
                desc: 'Huawei SNMP yapılandırması — SNMPv3 (güvenli) veya SNMPv1/v2c, trap hedefi ve sistem bilgileri.'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-shield-alt', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Güvenli', cls: 'security' } },
                { id: 'v1v2', label: 'SNMPv1/v2c', icon: 'fas fa-chart-bar', desc: 'Community string tabanlı' }
            ],
            sections: [
                {
                    title: 'SNMPv3 Ayarları',
                    icon: 'fas fa-user-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', why: "Kullanıcı adı NMS tarafındaki tanımla harfi harfine aynı olmalıdır; SNMPv3te uyuşmazlık hata dönmez, sorgu sessizce yanıtsız kalır ve izleme sistemi cihazı arızalı sanır.", label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netmonitor', hint: 'SNMPv3 USM kullanıcı adı' },
                        { name: 'v3_group', why: "Grup seviyesi (<code>authentication</code> / <code>privacy</code>) kullanıcının hangi güvenlik seviyesiyle bağlanacağını belirler; grup privacy isterken NMS sadece auth ile bağlanırsa paketler sessizce düşer. Grup ayrıca hangi MIB görünümünün okunacağını da sınırlar.", label: 'Grup Adı', type: 'text', required: true, placeholder: 'netgroup', hint: 'SNMPv3 grubu (privacy seviyesi)' },
                        { name: 'v3_auth', why: "Huawei cihazlarda MD5 hâlâ kabul edilir ama güvenlik denetimlerinde düşer; SHA tercih edilmelidir. Seçilen algoritma iki tarafta aynı olmazsa kimlik doğrulama sessizce başarısız olur.", label: 'Auth Yöntemi', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'v3_auth_pw', why: "Parola en az 8 karakter olmalı, aksi halde komut reddedilir. NMS tarafındaki parola ile bir karakter fark olursa cihaz yanıt vermez; loglarda çoğu zaman belirgin bir hata da görünmez.", label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123', hint: 'Kimlik doğrulama parolası (min 8 karakter)' },
                        { name: 'v3_priv', why: "Şifreleme algoritması DESin kırılabilir olması nedeniyle AES olmalıdır. Grup privacy seviyesinde tanımlıyken bu alan boş kalırsa kullanıcı gerçek güvenlik seviyesini karşılayamaz ve erişim reddedilir.", label: 'Şifreleme', type: 'select', options: [
                            { value: 'aes128', label: 'AES128', selected: true },
                            { value: 'des56', label: 'DES56' }
                        ]},
                        { name: 'v3_priv_pw', why: "Priv parolası da minimum 8 karakterdir ve auth parolasından farklı olması önerilir. İki tarafta uyuşmazsa paket çözülemez ve sorgular zaman aşımına uğrar.", label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123', hint: 'Şifreleme parolası (min 8 karakter)' }
                    ]
                },
                {
                    title: 'SNMPv1/v2c Ayarları',
                    icon: 'fas fa-key',
                    showFor: ['v1v2'],
                    fields: [
                        { name: 'community_ro', why: "Community string düz metin taşınır; <code>public</code> gibi varsayılan değerler ağdaki herkesin tüm envanteri okuyabilmesi demektir. Mümkünse v2c yerine v3 kullanın, kullanacaksanız mutlaka bir ACL ile kaynak IP sınırlayın.", label: 'Community (RO)', type: 'text', optional: true, placeholder: 'public', hint: 'Read-only community string' },
                        { name: 'community_rw', why: "RW community ile cihaz konfigürasyonu uzaktan değiştirilebilir; sızması halinde ağın tamamı ele geçirilebilir. Gerçekten yazma gerekmiyorsa bu alanı boş bırakmak en güvenli seçenektir.", label: 'Community (RW)', type: 'text', optional: true, placeholder: 'private', hint: 'Read-write community string' }
                    ]
                },
                {
                    title: 'Trap Ayarları',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', why: "Trap hedefi yanlışsa cihaz arıza anında sessiz kalır ve kimse haberdar olmaz. Hedefe giden yol ve arada duran güvenlik duvarındaki UDP 162 izni de doğrulanmalıdır.", label: 'Trap Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.10', hint: 'SNMP trap gönderilecek NMS IP adresi' },
                        { name: 'trap_iface', why: "Kaynak arayüz sabitlenmezse trap paketleri çıkış arayüzünün değişen IP adresiyle gider ve NMS bunları tanımadığı kaynaktan geldiği için yok sayar. Genellikle Loopback seçilir ki link değişimlerinden etkilenmesin.", label: 'Trap Kaynak Arayüz', type: 'text', validate: 'iface', optional: true, placeholder: 'LoopBack0', hint: 'Trap paketlerinin kaynak arayüzü' }
                    ]
                },
                {
                    title: 'Sistem Bilgisi',
                    icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'contact', why: "Arıza anında cihazı kimin sahiplendiğini gösteren tek alandır; boş bırakılan cihazlar yıllar sonra kimsenin dokunmaya cesaret edemediği kara kutulara dönüşür.", label: 'Contact', type: 'text', optional: true, placeholder: 'Network Team, +90 212 000 0000', hint: 'Sorumlu kişi/ekip bilgisi' },
                        { name: 'location', why: "Fiziksel konum envanter ve saha müdahalesi için kritiktir; rack ve kabin bilgisi olmayan bir cihaz için teknisyen veri merkezinde kabloyu deneme yanılma ile arar.", label: 'Location', type: 'text', optional: true, placeholder: 'Istanbul DC, Floor 3', hint: 'Cihazın fiziksel konumu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ver = data._cgtype || 'v3';
            let c = '# ========================================\n# Huawei — SNMP Configuration\n# ========================================\n\n';
            c += '[Huawei] system-view\n';
            if (ver === 'v3') {
                const user = cgEsc(data.v3_user || ''), grp = cgEsc(data.v3_group || '');
                const auth = cgEsc(data.v3_auth || 'sha'), apw = cgEsc(data.v3_auth_pw || '');
                const priv = cgEsc(data.v3_priv || 'aes128'), ppw = cgEsc(data.v3_priv_pw || '');
                c += '[Huawei] snmp-agent sys-info version v3\n';
                c += '[Huawei] snmp-agent group v3 ' + grp + ' privacy\n';
                c += '[Huawei] snmp-agent usm-user v3 ' + user + ' ' + grp + ' authentication-mode ' + auth + ' ' + apw + ' privacy-mode ' + priv + ' ' + ppw + '\n';
                const trap = cgEsc(data.trap_host || ''), tiface = cgEsc(data.trap_iface || '');
                if (trap) {
                    c += '[Huawei] snmp-agent trap enable\n';
                    c += '[Huawei] snmp-agent target-host trap-hostname ' + user + ' address ' + trap + ' trap-paramsname ' + user + 'TRAPS\n';
                    c += '[Huawei] snmp-agent target-host trap-paramsname ' + user + 'TRAPS v3 securityname ' + user + ' privacy\n';
                    if (tiface) c += '[Huawei] snmp-agent trap source ' + tiface + '\n';
                }
            } else {
                const ro = cgEsc(data.community_ro || ''), rw = cgEsc(data.community_rw || '');
                c += '[Huawei] snmp-agent sys-info version v2c\n';
                if (ro) c += '[Huawei] snmp-agent community read ' + ro + '\n';
                if (rw) c += '[Huawei] snmp-agent community write ' + rw + '\n';
                const trap = cgEsc(data.trap_host || ''), tiface = cgEsc(data.trap_iface || '');
                if (trap && ro) {
                    c += '[Huawei] snmp-agent trap enable\n';
                    c += '[Huawei] snmp-agent target-host trap-hostname ' + ro + ' address ' + trap + ' trap-paramsname ' + ro + 'TRAPS\n';
                    c += '[Huawei] snmp-agent target-host trap-paramsname ' + ro + 'TRAPS v2c community ' + ro + '\n';
                    if (tiface) c += '[Huawei] snmp-agent trap source ' + tiface + '\n';
                }
            }
            const contact = cgEsc(data.contact || ''), loc = cgEsc(data.location || '');
            if (contact) c += '[Huawei] snmp-agent sys-info contact "' + contact + '"\n';
            if (loc) c += '[Huawei] snmp-agent sys-info location "' + loc + '"\n';
            return c;
        });
    }
};

// ── Huawei: NAT/Port Forwarding ───────────────────────────────────────────────
HuaweiVRP.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'NAT / Port Forwarding (Huawei VRP)',
                desc: 'Huawei AR NAT — Easy IP (nat outbound) ile internet çıkışı ve NAT Server ile port yönlendirme. VRP\'de Cisco\'daki gibi inside/outside işaretlemesi yoktur: her iki kural da WAN (çıkış) arayüzüne yazılır.'
            },
            sections: [
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'in_iface', why: "VRP'de iç arayüze NAT komutu yazılmaz (Cisco'daki <code>ip nat inside</code> karşılığı yoktur). Bu alan yalnız kontrol içindir: iç ve dış arayüz aynı girilirse ya da <code>nat outbound</code> iç arayüze yazılırsa hiçbir paket çevrilmez.", label: 'İç (LAN) Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'İç ağa bağlı arayüz (yalnız kontrol; komut yazılmaz)' },
                        { name: 'out_iface', why: "NAT dönüşümü çıkış arayüzünde yapılır; <code>nat server</code> veya <code>nat outbound</code> yanlış arayüze bağlanırsa kurallar hiç devreye girmez. Yedek WAN varsa her iki arayüzde de ayrı tanım gerekir.", label: 'WAN (Çıkış) Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'nat outbound ve nat server bu arayüze yazılır' },
                        { name: 'out_ip', why: "Port yönlendirmede dış dünyanın bağlandığı adres budur; ISP tarafından size atanmamış bir IP yazarsanız trafik cihaza hiç ulaşmaz. Dinamik WAN IP kullanılıyorsa sabit IP yerine arayüz temelli NAT gerekir.", label: 'Dış (Global) IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'NAT Server global adresi (genelde WAN arayüz adresi)' },
                        { name: 'out_mask', why: "Doluysa WAN arayüzüne bu maske ile adres yazılır. Arayüzde adres zaten varsa boş bırakın; yanlış maske ISP ağ geçidini alt ağ dışına düşürür ve internet tamamen kesilir.", label: 'WAN Arayüz Maskesi', type: 'text', validate: 'netmask', optional: true, placeholder: '255.255.255.252', hint: 'Opsiyonel — doluysa arayüze ip address yazılır' }
                    ]
                },
                {
                    title: 'Easy IP (internet çıkışı)',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'lan_net', why: "ACL 2000'deki permit kuralı hangi iç adreslerin çevrileceğini belirler; kurala uymayan kaynak çevrilmez ve özel adresle dışarı çıkıp kaybolur. <code>rule permit</code> (kaynaksız) yazmak tüm kaynakları çevirir.", label: 'Çevrilecek İç Ağ', type: 'text', validate: 'ip', optional: true, placeholder: '10.64.0.0', hint: 'Opsiyonel — doluysa ACL 2000 + nat outbound 2000 üretilir' },
                        { name: 'lan_wc', why: "VRP ACL'si <b>wildcard</b> (ters maske) ister: /16 için <code>0.0.255.255</code>. Maske (255.255.0.0) yazmak hiçbir iç adresi eşlemez ve kimse internete çıkamaz.", label: 'İç Ağ Wildcard', type: 'text', validate: 'wildcard', optional: true, placeholder: '0.0.255.255', hint: 'Ters maske: /16 → 0.0.255.255, /24 → 0.0.0.255' }
                    ]
                },
                {
                    title: 'Port Forwarding',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'proto', why: "TCP kuralı UDP trafiğini kapsamaz. DNS, VPN veya VoIP gibi servisler yanlış protokolle tanımlandığında bağlantı hiç kurulmaz ve hata mesajı üretilmez; her iki protokol gerekiyorsa iki ayrı kural yazılmalıdır.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'both', label: 'Both (TCP+UDP)' }
                        ]},
                        { name: 'pub_port', why: "Dış port doğrudan internete açılır; 3389 veya 22 gibi portları tüm dünyaya açmak saldırı yüzeyini ciddi büyütür. Ayrıca aynı dış portu iki farklı iç sunucuya yönlendiremezsiniz, ikinci kural ilkini geçersiz kılar.", label: 'Dış Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'İnternet tarafından erişilen port' },
                        { name: 'priv_ip', why: "İç sunucunun IP adresi sabit olmalıdır; DHCP ile değişen bir adrese yönlendirme yapılırsa kural bir süre sonra yanlış makineye trafik taşır. Sunucuya giden yönlendirme yolu ve sunucunun yerel güvenlik duvarı da açık olmalıdır.", label: 'İç IP', type: 'text', validate: 'ip', required: true, placeholder: '10.64.50.10', hint: 'Yönlendirilecek iç sunucu IP adresi' },
                        { name: 'priv_port', why: "Sunucunun gerçekten dinlediği port yazılmalı; dış port ile iç port farklı olabilir. İç portta servis kapalıysa NAT çalışır ama bağlantı reddedilir ve sorun NAT hatası sanılarak boşa vakit harcanır.", label: 'İç Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'İç sunucudaki hedef port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iniface = cgEsc(data.in_iface || ''), outiface = cgEsc(data.out_iface || ''), outip = cgEsc(data.out_ip || '');
            const outmask = cgEsc(data.out_mask || ''), proto = cgEsc(data.proto || 'tcp'), pubport = cgEsc(data.pub_port || '');
            const privip = cgEsc(data.priv_ip || ''), privport = cgEsc(data.priv_port || '') || pubport;
            const lannet = cgEsc(data.lan_net || ''), lanwc = cgEsc(data.lan_wc || '');
            let c = '# ========================================\n# Huawei AR — NAT (Easy IP / NAT Server)\n# ========================================\n\n';
            c += '# VRP\'de inside/outside işareti yoktur; NAT komutları yalnız WAN arayüzüne (' + outiface + ') yazılır.\n';
            c += '# İç arayüz ' + (iniface || '(boş)') + ' üzerinde NAT komutu gerekmez.\n';
            c += '[Huawei] system-view\n\n';
            if (lannet) {
                c += '# Easy IP: ACL 2000\'e uyan iç kaynaklar WAN arayüz adresine çevrilir\n';
                c += '[Huawei] acl number 2000\n[Huawei-acl-basic-2000] rule 5 permit source ' + lannet + ' ' + (lanwc || '0') + '\n[Huawei-acl-basic-2000] quit\n\n';
            }
            c += '[Huawei] interface ' + outiface + '\n';
            if (outmask) c += '[Huawei-' + outiface + '] ip address ' + outip + ' ' + outmask + '\n';
            if (lannet) c += '[Huawei-' + outiface + '] nat outbound 2000\n';
            if (pubport && privip) {
                (proto === 'both' ? ['tcp', 'udp'] : [proto]).forEach(p => {
                    c += '[Huawei-' + outiface + '] nat server protocol ' + p + ' global ' + outip + ' ' + pubport + ' inside ' + privip + ' ' + privport + '\n';
                });
            }
            c += '[Huawei-' + outiface + '] quit\n';
            c += '\n# Doğrulama:\n# display nat outbound        ! ACL ve arayüz eşleşmesi\n# display nat server          ! yayınlanan servisler\n# display nat session all     ! çevrilen akışlar\n';
            return { config: c, warnings: _vrpWnat(data) };
        });
    }
};
// NAT lab bulguları (hua-10): nat outbound LAN arayüzünde, ACL'de maske/wildcard karışıklığı, kaynaksız permit
function _vrpWnat(data) {
    const w = [], v = k => String(data[k] == null ? '' : data[k]).trim();
    if (v('in_iface') && v('out_iface') && v('in_iface').toLowerCase() === v('out_iface').toLowerCase()) w.push('\u26D4 İç ve WAN arayüzü aynı. nat outbound / nat server trafiğin ÇIKTIĞI WAN arayüzüne yazılır; iç arayüze yazılan kural hiçbir paketi çevirmez.');
    if (v('lan_net')) {
        if (_vrpWwildMask(v('lan_wc'))) w.push('\u26A0 Wildcard alanına maske yazılmış görünüyor (' + v('lan_wc') + '). VRP ACL\'si ters maske ister (/16 → 0.0.255.255); bu hâliyle iç adresler eşleşmez ve kimse internete çıkamaz.');
        else if (_vrpWhostBits(v('lan_net'), v('lan_wc'))) w.push('\u26A0 İç ağ adresi wildcard\'ın kapsadığı bitlerde değer içeriyor; ağ adresini yazın (ör. 10.64.0.0 0.0.255.255).');
        if (!v('lan_wc')) w.push('\u26A0 Wildcard boş: kural yalnız ' + v('lan_net') + ' tek adresini çevirir. Bir ağ için ters maske girin (ör. 0.0.0.255).');
        if (v('lan_wc') === '255.255.255.255') w.push('\u26A0 Wildcard 255.255.255.255 her kaynağı çevirir (rule permit ile aynı). Yalnız kendi iç ağınızı yazın.');
    }
    if (v('pub_port')) {
        if (['22', '23', '3389', '445', '161'].includes(v('pub_port'))) w.push('\u26A0 Dış port ' + v('pub_port') + ' yönetim/dosya paylaşımı servisidir; internete açmak kaba kuvvet saldırılarına kapı açar. VPN ya da kaynak kısıtlaması tercih edin.');
        if (_vrpWip(v('out_ip')) && v('out_ip') === v('priv_ip')) w.push('\u26D4 Dış IP ile iç sunucu IP\'si aynı.');
    }
    return w;
}

// ── Huawei: TACACS ────────────────────────────────────────────────────────────
HuaweiVRP.tacacs = {
    label: 'TACACS+',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'TACACS+ (Huawei VRP)',
                desc: 'Huawei HWTACACS yapılandırması — birincil/ikincil sunucu, AAA domain, VTY arayüz authentication ve yerel yedek.'
            },
            sections: [
                {
                    title: 'TACACS+ Sunucular',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'srv1', why: "Sunucuya cihazdan ulaşılamıyorsa ve yerel yedek hesap tanımlı değilse cihaza uzaktan hiç giriş yapamazsınız; konsol erişimi şart olur. Kaynak arayüz sabitlenmemişse sunucu isteği tanımadığı IP adresinden gelmiş sayıp reddeder.", label: 'Sunucu 1 IP', type: 'text', validate: 'ip', required: true, placeholder: '10.7.66.66', hint: 'Birincil HWTACACS sunucu IP adresi' },
                        { name: 'key1', why: "Paylaşılan anahtar sunucudaki kayıtla birebir aynı olmalıdır; bir karakter farkı kimlik doğrulamanın sessizce başarısız olmasına yol açar ve cihaz logunda genellikle sadece <code>reject</code> görünür. Anahtar VRP tarafında şifreli saklanır, sonradan okunamaz.", label: 'Sunucu 1 Shared Key', type: 'text', required: true, placeholder: 'TacacsKey123', hint: 'TACACS şifreli anahtar' },
                        { name: 'srv2', why: "Tek TACACS sunucusu tek arıza noktasıdır; sunucu bakıma girdiğinde tüm cihazlara erişim kesilir. İkinci sunucu tanımlamak bu riski ortadan kaldırır.", label: 'Sunucu 2 IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.7.66.67', hint: 'Yedek HWTACACS sunucu (opsiyonel)' },
                        { name: 'key2', why: "Yedek sunucunun anahtarı çoğu zaman birinciyle aynı sanılıp yanlış girilir; hata ancak birincil sunucu düştüğünde, yani en kötü anda ortaya çıkar. Yedeğe geçişi önceden test edin.", label: 'Sunucu 2 Shared Key', type: 'text', optional: true, placeholder: 'TacacsKey123', hint: 'VRP şablonda tek ortak anahtar kullanır; farklıysa uyarı verilir' }
                    ]
                },
                {
                    title: 'AAA / Domain',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'grp_name', why: "Huaweide sunucular tek tek değil <code>hwtacacs-server template</code> altında gruplanır ve AAA şeması bu template adını referans alır. İsim uyuşmazsa şema boş bir gruba bakar ve kimlik doğrulama hiç denenmez.", label: 'TACACS Grubu Adı', type: 'text', required: true, placeholder: 'ht', hint: 'hwtacacs-server template adı' },
                        { name: 'domain', why: "VRP kullanıcıyı her zaman bir domain altında değerlendirir; kullanıcı <code>kullanici@domain</code> formatında gelmezse <code>default</code> domain kuralları uygulanır. Şemayı yanlış domaine bağlamak, kurulumun doğru görünüp hiç devreye girmemesine neden olur.", label: 'Domain Adı', type: 'text', required: true, placeholder: 'huawei', hint: 'AAA domain tanımı' },
                        { name: 'remove_domain', why: "Cihaz kullanıcı adını sunucuya domain ekiyle gönderirse sunucu tarafındaki hesap (<code>ahmet</code> yerine <code>ahmet@default</code>) bulunamaz ve giriş reddedilir. Bu ayar Huawei ile TACACS arasındaki en sık uyumsuzluk kaynağıdır.", label: 'Domain bilgisini sunucuya gönderme', type: 'select', options: [
                            { value: 'no', label: 'Hayır (gönderilir)', selected: true },
                            { value: 'yes', label: 'Evet (gönderilmesin)' }
                        ]}
                    ]
                },
                {
                    title: 'VTY / Local Backup',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'vty_start', why: "AAA yalnızca burada belirtilen VTY aralığına uygulanır; aralık dışında kalan hatlar eski kimlik doğrulama yöntemiyle açık kalır ve güvenlik denetiminden geçmeyen bir arka kapı oluşur.", label: 'VTY Başlangıç', type: 'text', required: true, placeholder: '0', hint: 'VTY hat aralığı başlangıcı' },
                        { name: 'vty_end', why: "Huaweide genellikle VTY 0-4 veya 0-14 vardır; aralığı eksik tanımlamak bazı oturumların korumasız kalmasına, fazla dar tanımlamak eşzamanlı yönetici sayısının yetmemesine yol açar.", label: 'VTY Bitiş', type: 'text', required: true, placeholder: '4', hint: 'VTY hat aralığı sonu' },
                        { name: 'enable_local', why: "Yerel yedek hesap olmadan TACACS erişilemez hale geldiğinde cihaza yalnızca fiziksel konsolla girilebilir. Bu seçenek, uzak lokasyondaki bir cihazı tamamen kaybetmekle bir dakikada geri almak arasındaki farktır.", label: 'Yerel yetkilendirme (backup)', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const srv1 = cgEsc(data.srv1 || ''), key1 = cgEsc(data.key1 || '');
            const srv2 = cgEsc(data.srv2 || ''), grp = cgEsc(data.grp_name || '');
            const key2 = cgEsc(data.key2 || '');
            const domain = cgEsc(data.domain || ''), remdom = cgEsc(data.remove_domain || 'no');
            const vs = cgEsc(data.vty_start || ''), ve = cgEsc(data.vty_end || '');
            let c = '# ========================================\n# Huawei — TACACS+ Configuration\n# ========================================\n\n';
            c += 'system-view\nhwtacacs enable\n\n';
            c += '# AAA Şemaları ve Domain\naaa\n';
            c += ' authentication-scheme l-h\n  authentication-mode hwtacacs local\n';
            c += ' authorization-scheme hwtacacs\n  authorization-mode hwtacacs local\n';
            c += ' accounting-scheme hwtacacs\n  accounting-mode hwtacacs\n  accounting start-fail online\nquit\n\n';
            c += 'aaa\n domain ' + domain + '\n  authentication-scheme l-h\n  authorization-scheme hwtacacs\n  accounting-scheme hwtacacs\n  hwtacacs-server ' + grp + '\nquit\n\n';
            c += '# HWTACACS Sunucu Şablonu\nhwtacacs-server template ' + grp + '\n';
            c += ' hwtacacs-server authentication ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server authentication ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server authorization ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server authorization ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server accounting ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server accounting ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server shared-key cipher ' + key1 + '\n';
            // VRP'de paylasilan anahtar SABLON duzeyindedir: iki sunucu da key1'i kullanir.
            // key2 eskiden hic okunmuyordu; farkliysa bunu sessizce yutmak yerine bildir.
            if (srv2 && key2 && key2 !== key1)
                c = '# UYARI: yedek sunucu anahtarı birincilden farklı. VRP bu şablonda tek ortak anahtar (hwtacacs-server shared-key) kullanır;\n#        ' + srv2 + ' farklı anahtar istiyorsa ayrı bir HWTACACS şablonu tanımlayın.\n' + c;
            if (remdom === 'yes') c += ' undo hwtacacs-server user-name domain-included\n';
            c += 'quit\n\n';
            if (data.enable_local === 'yes') {
                c += '# Yerel Backup\naaa\n authorization-cmd 15 hwtacacs local\nquit\n\n';
            }
            c += '# VTY Konfigürasyonu\nuser-interface vty ' + vs + ' ' + ve + '\n authentication-mode aaa\n user privilege level 15\n protocol inbound all\nquit\n';
            return c;
        });
    }
};

// ── Huawei: ACL ───────────────────────────────────────────────────────────────
HuaweiVRP.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL (Huawei VRP)',
                desc: 'Huawei ACL yapılandırması — temel (basic, 2000-2999) ve gelişmiş (advanced, 3000-3999) erişim listesi kuralları.'
            },
            configTypes: [
                { id: 'standard', label: 'Standart ACL', icon: 'fas fa-list', desc: '2000-2999 (basic) — kaynak IP bazlı filtreleme', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended ACL', icon: 'fas fa-sliders-h', desc: '3000-3999 (advanced) — protokol, port ve hedef bazlı filtreleme', badge: { text: 'Detaylı', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'acl_num', why: "Numara aralığı ACL yeteneğini belirler: 2000-2999 yalnızca kaynak IP bakar, 3000-3999 protokol ve port eşlemesi yapar. Basic aralıkta port kuralı yazmaya çalışırsanız komut reddedilir; en sık karşılaşılan hata budur.", label: 'ACL Numarası', type: 'text', required: true, placeholder: '2000', hint: 'Temel (basic): 2000-2999, Gelişmiş (advanced): 3000-3999' },
                        { name: 'rule_id', why: "Kurallar ID sırasına göre değerlendirilir ve ilk eşleşen uygulanır. Araya kural ekleyebilmek için 5 veya 10ar atlamalı numaralandırın; ardışık numaralar sonradan kural ekleme imkânını tamamen ortadan kaldırır.", label: 'Kural ID', type: 'text', optional: true, placeholder: '10', hint: 'Kural sıra numarası (varsayılan: 10)' },
                        { name: 'action', why: "Eşleşmeyen trafiğin akıbeti ACL'nin uygulandığı yere göre değişir: <code>traffic-filter</code>'da hiçbir kurala uymayan paket <b>geçer</b> (Cisco'nun tersi), NAT'ta çevrilmez, VTY'de reddedilir. Yanlış seçilen aksiyon uzaktan yönetim oturumunuzu da keserek cihaza erişimi kaybettirebilir.", label: 'Eylem', type: 'select', options: [
                            { value: 'permit', label: 'Permit', selected: true },
                            { value: 'deny', label: 'Deny' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak Adres',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'src', why: "Kaynağı <code>any</code> bırakmak kuralı olması gerekenden çok daha geniş uygular; özellikle deny kurallarında yanlışlıkla yönetim trafiğini de kapsayıp kendinizi dışarı kilitlersiniz.", label: 'Kaynak', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'host', label: 'Tek host (IP)' },
                            { value: 'specific', label: 'Ağ (IP + wildcard)' }
                        ]},
                        { name: 'src_ip', why: "VRP kaynak eşlemesinde wildcard maske kullanır (<code>0.0.0.255</code>), Cisco alışkanlığıyla subnet maskesi yazmak kuralın beklenmedik bir aralığı eşlemesine neden olur. Tek host için <code>0</code> wildcard gerekir.", label: 'Kaynak IP', type: 'text', requiredIf: { field: 'src', in: ['host', 'specific'] }, validate: 'ip', placeholder: '192.168.1.0', hint: 'Kaynak olarak "Belirli IP" seçildiğinde doldurulur' },
                        { name: 'src_wc', why: 'VRP ACL <b>wildcard</b> maske kullanır (0.0.0.255 = /24), subnet maskesi değil. 255.255.255.0 yazmak bambaşka adresleri eşler.', label: 'Kaynak Wildcard', type: 'text', validate: 'wildcard', requiredIf: { field: 'src', in: ['specific'] }, placeholder: '0.0.0.255', hint: 'Ters maske: /24 için 0.0.0.255' },
                    ]
                },
                {
                    title: 'Extended — Protokol ve Hedef',
                    icon: 'fas fa-network-wired',
                    showFor: ['extended'],
                    fields: [
                        { name: 'proto', why: "IP seçildiğinde port alanları göz ardı edilir; port kısıtı istiyorsanız mutlaka TCP veya UDP seçmelisiniz. Yanlış protokol seçimi kuralın hiç eşleşmemesine ve trafiğin beklenenin tersine davranmasına yol açar.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'icmp', label: 'ICMP' },
                            { value: 'ip', label: 'IP' }
                        ]},
                        { name: 'dst', why: "Hedefi <code>any</code> bırakmak, servis bazlı izin vermek isterken tüm ağa erişim açmak anlamına gelebilir. Özellikle DMZ kurallarında hedefi daraltmak saldırı yüzeyini belirgin şekilde düşürür.", label: 'Hedef', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'host', label: 'Tek host (IP)' },
                            { value: 'specific', label: 'Ağ (IP + wildcard)' }
                        ]},
                        { name: 'dst_ip', why: "Hedef adres yine wildcard maske ile yazılır. Hedef subnet yanlışsa kural sessizce hiç eşleşmez; ACLnin çalışmadığını ancak <code>display acl</code> çıktısındaki match sayacının sıfır kalmasından anlarsınız.", label: 'Hedef IP', type: 'text', requiredIf: { field: 'dst', in: ['host', 'specific'] }, validate: 'ip', placeholder: '10.0.0.1', hint: 'Hedef olarak "Belirli IP" seçildiğinde doldurulur' },
                        { name: 'dst_wc', why: 'VRP ACL <b>wildcard</b> maske kullanır (0.0.0.255 = /24), subnet maskesi değil. 255.255.255.0 yazmak bambaşka adresleri eşler.', label: 'Hedef Wildcard', type: 'text', validate: 'wildcard', requiredIf: { field: 'dst', in: ['specific'] }, placeholder: '0.0.0.255', hint: 'Ters maske: /24 için 0.0.0.255' },
                        { name: 'src_port', why: "Kaynak port çoğu istemci trafiğinde rastgeledir; buraya sabit port yazmak kuralın neredeyse hiç eşleşmemesine neden olur. Servis kısıtlaması genelde hedef portla yapılır.", label: 'Kaynak Port', type: 'text', validate: 'port', optional: true, placeholder: '80', hint: 'Boş bırakılırsa tüm portlar' },
                        { name: 'dst_port', why: "Servisin gerçek portu yazılmalıdır (<code>destination-port eq 443</code>); pasif FTP veya SIP gibi dinamik port kullanan protokollerde tek port yeterli olmaz ve bağlantı el sıkışmadan sonra kopar. Aralık gerekiyorsa <code>range</code> operatörünü kullanın.", label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '443', hint: 'Boş bırakılırsa tüm portlar' }
                    ]
                },
                {
                    title: 'Zaman Kısıtlaması',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'time_range', why: "Time-range önce <code>time-range</code> komutuyla tanımlanmalı, yoksa kural referans verilen zaman dilimi olmadığı için hiç etkin olmaz. Ayrıca cihaz saati NTP ile doğru değilse kural yanlış saatlerde devreye girer.", label: 'Time Range', type: 'text', optional: true, placeholder: 't1', hint: 'Önceden tanımlanmış time-range adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'standard', num = cgEsc(data.acl_num || '');
            const rid = cgEsc(data.rule_id || '') || '10', action = cgEsc(data.action || 'permit');
            const src = cgEsc(data.src || 'any'), srcip = cgEsc(data.src_ip || ''), tr = cgEsc(data.time_range || '');
            // VRP sozdizimi: 'any' | '<ip> 0' (tek host) | '<ip> <wildcard>' — 'host' anahtar kelimesi yoktur.
            const addr = (sel, ip, wc) => !ip ? 'any' : sel === 'host' ? ip + ' 0' : sel === 'specific' ? ip + ' ' + wc : 'any';
            const srcStr = addr(src, srcip, cgEsc(data.src_wc || ''));
            const warnAny = (sel, ip, what) => (sel !== 'any' && !ip) ? '# UYARI: ' + what + ' IP boş — kural bu alanda any eşler.\n' : '';
            let c = '# ========================================\n# Huawei — ACL Configuration\n# ========================================\n\n';
            c += warnAny(src, srcip, 'kaynak');
            c += 'acl number ' + num + '\n';
            if (type === 'standard') {
                c += ' rule ' + rid + ' ' + action + ' source ' + srcStr;
                if (tr) c += ' time-range ' + tr;
                c += '\nquit\n';
            } else {
                const proto = cgEsc(data.proto || 'tcp'), dst = cgEsc(data.dst || 'any'), dstip = cgEsc(data.dst_ip || '');
                const sp = cgEsc(data.src_port || ''), dp = cgEsc(data.dst_port || '');
                const dstStr = addr(dst, dstip, cgEsc(data.dst_wc || ''));
                const ports = proto === 'tcp' || proto === 'udp';   // port eşlemesi yalnız TCP/UDP'de
                c = c.replace('acl number ', warnAny(dst, dstip, 'hedef') + 'acl number ');
                // VRP: port anahtar kelimeleri 'source-port eq N' / 'destination-port eq N' (adresin ardına 'eq' yazılmaz)
                c += ' rule ' + rid + ' ' + action + ' ' + proto + ' source ' + srcStr + ' destination ' + dstStr;
                if (ports && sp && sp !== 'any') c += ' source-port eq ' + sp;
                if (ports && dp && dp !== 'any') c += ' destination-port eq ' + dp;
                if (tr) c += ' time-range ' + tr;
                c += '\nquit\n';
            }
            c += '\n# Uygulama örneği (arayüze giren trafik):\n# interface <arayüz>\n#  traffic-filter inbound acl ' + num + '\n';
            c += '# Doğrulama: display acl ' + num + '   ! kural başına eşleşme (matched) sayacı\n';
            return { config: c, warnings: _vrpWacl(data, type) };
        });
    }
};
// ACL lab bulguları (hua-07): numara aralığı ile tür uyumsuzluğu, maske/wildcard karışıklığı, traffic-filter'da örtük permit
function _vrpWacl(data, type) {
    const w = [], v = k => String(data[k] == null ? '' : data[k]).trim();
    const num = +v('acl_num'), adv = type !== 'standard';
    if (!/^\d+$/.test(v('acl_num')) || num < 2000 || num > 3999) w.push('\u26D4 ACL numarası ' + (v('acl_num') || '(boş)') + ' geçersiz: temel (basic) 2000-2999, gelişmiş (advanced) 3000-3999.');
    else if (adv && num < 3000) w.push('\u26D4 Gelişmiş (protokol/hedef/port) kural 2000-2999 aralığındaki temel ACL\'ye yazılamaz; VRP komutu reddeder. 3000-3999 arası bir numara seçin.');
    else if (!adv && num >= 3000) w.push('\u2139 3000-3999 gelişmiş ACL aralığıdır; yalnız kaynak eşlemesi için 2000-2999 (basic) yeterli.');
    if (v('rule_id') && (!/^\d+$/.test(v('rule_id')) || +v('rule_id') > 4294967294)) w.push('\u26D4 Kural ID 0-4294967294 arası bir sayı olmalı.');
    const wild = [['src', 'src_ip', 'src_wc', 'Kaynak'], ['dst', 'dst_ip', 'dst_wc', 'Hedef']];
    wild.forEach(([sel, ip, wc, what]) => {
        if (sel === 'dst' && !adv) return;
        if (v(sel) !== 'specific' || !v(ip)) return;
        if (_vrpWwildMask(v(wc))) w.push('\u26A0 ' + what + ' wildcard alanına alt ağ maskesi yazılmış görünüyor (' + v(wc) + '). VRP ACL\'si ters maske ister: /24 için 0.0.0.255.');
        else if (_vrpWhostBits(v(ip), v(wc))) w.push('\u26A0 ' + what + ' adresi wildcard\'ın kapsadığı bitlerde değer içeriyor (ör. 10.64.10.5 0.0.0.255). Ağ için ağ adresini, tek host için "Tek host" seçeneğini kullanın.');
    });
    if (adv) {
        const ports = /^(tcp|udp)$/.test(v('proto') || 'tcp');
        if (!ports && (v('src_port') || v('dst_port'))) w.push('\u2139 Port alanları yalnız TCP/UDP\'de kullanılır; ' + (v('proto') || 'ip').toUpperCase() + ' kuralında yok sayıldı.');
        if (ports && v('src_port') && v('src_port') !== 'any' && !v('dst_port')) w.push('\u26A0 Yalnız kaynak port girildi. İstemcinin kaynak portu rastgeledir; sunucu portu (ör. 443) hedef porttur — kural büyük olasılıkla hiç eşleşmez.');
    }
    if ((data.action || 'permit') === 'permit') w.push('\u26A0 traffic-filter ile uygulanırsa hiçbir kurala uymayan trafik de GEÇER (VRP\'de örtük permit; Cisco\'nun tersi). "Yalnız bunlar geçsin" istiyorsanız sona daha büyük numaralı "rule deny ip" ekleyin.');
    else w.push('\u2139 traffic-filter\'da bu deny yalnız eşleşen trafiği keser; diğer trafik örtük olarak geçer. Kuralların sırası numaraya göredir, ilk eşleşen kazanır.');
    if (v('time_range')) w.push('\u2139 time-range ' + v('time_range') + ' önceden tanımlı değilse kural etkin olmaz (display time-range all).');
    return w;
}

// ── Huawei: Security Policy ───────────────────────────────────────────────────
HuaweiVRP.security = {
    label: 'Security',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Policy (Huawei VRP)',
                desc: 'Huawei switch güvenlik özellikleri — Port Security, DHCP Snooping, DAI, IP Source Guard ve BPDU Guard.'
            },
            sections: [
                {
                    title: 'Port Security ve MAC Sınırlama',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'ps_enable', why: "Port security MAC öğrenmeyi kilitler; yanlış uygulanırsa cihaz taşındığında veya kullanıcı değiştiğinde port kendini kapatır ve saha müdahalesi gerekir. Uplink ve sunucu portlarında asla açılmamalıdır.", label: 'Port Security Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'ps_iface', why: "Yalnızca son kullanıcı erişim portlarında anlamlıdır. Uplink veya trunk portunda açarsanız komşu switchten gelen yüzlerce MAC limiti anında aşar ve tüm ağ segmentini düşürürsünüz.", label: 'Arayüz', type: 'text', requiredIf: { field: 'ps_enable', checked: true }, validate: 'iface', placeholder: 'GigabitEthernet0/0/1', hint: 'Port security uygulanacak arayüz' },
                        { name: 'ps_max_mac', why: "Limit çok dar ise IP telefon arkasındaki bilgisayar gibi meşru ikinci cihaz portu ihlale sokar; çok geniş ise koruma anlamını yitirir. Telefon + PC senaryosunda en az 2 gerekir.", label: 'Maks. MAC Sayısı', type: 'text', optional: true, min: 1, max: 4096, placeholder: '2', hint: 'port-security max-mac-num (varsayılan 1)' },
                        { name: 'ps_violation', why: "<code>shutdown</code> modu portu err-down durumuna alır ve manuel müdahale olmadan geri gelmez; <code>protect</code> sessizce düşürür ve kimse fark etmez, <code>restrict</code> ise log üretir. Seçim doğrudan arıza süresini belirler.", label: 'İhlal Modu', type: 'select', options: [
                            { value: '', label: 'Varsayılan (restrict)', selected: true },
                            { value: 'shutdown', label: 'Shutdown' },
                            { value: 'restrict', label: 'Restrict' },
                            { value: 'protect', label: 'Protect' }
                        ]},
                        { name: 'ps_sticky', why: "Sticky MAC öğrenilen adresi konfigürasyona yazar; ancak <code>save</code> yapılmazsa reboot sonrası tüm öğrenilen adresler kaybolur ve portlar yeniden öğrenmeye başlar. Donanım değişiminde sticky kayıtların elle temizlenmesi gerekir.", label: 'Sticky MAC', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'DHCP Snooping',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'ds_enable', why: "DHCP snooping globalde açılmadan arayüz veya VLAN seviyesindeki komutlar etkisizdir. Ayrıca snooping açıldığında tüm portlar varsayılan olarak untrusted olur; gerçek DHCP sunucusuna giden portu trusted yapmazsanız ağdaki herkes adres almayı bırakır.", label: 'DHCP Snooping Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'ds_iface', why: "Bu arayüz meşru DHCP sunucusunun bulunduğu yön (uplink) olmalı ve <code>dhcp snooping trusted</code> yapılır. Yanlış yönü trusted yapmak sahte DHCP sunucusuna kapı açar; doğru yönü unutmak ise tüm istemcileri adressiz bırakır.", label: 'Trusted Arayüz (DHCP sunucusu yönü)', type: 'text', requiredIf: { field: 'ds_enable', checked: true }, validate: 'iface', placeholder: 'GigabitEthernet0/0/2', hint: 'dhcp snooping trusted yazılacak uplink' },
                        { name: 'ds_vlan', why: "Snooping VLAN bazında çalışır; sadece bir VLANda açmak diğer VLANlardaki sahte DHCP sunucularını engellemez. Ayrıca DAI ve IP Source Guard bu VLANdaki snooping binding tablosuna dayanır.", label: 'VLAN', type: 'text', validate: 'vlan_list', optional: true, placeholder: '10', hint: 'Snooping açılacak VLAN(lar) — boşsa hiçbir VLAN korunmaz' }
                    ]
                },
                {
                    title: 'Dynamic ARP Inspection (DAI)',
                    icon: 'fas fa-exclamation-triangle',
                    fields: [
                        { name: 'dai_enable', why: "DAI, DHCP snooping binding tablosu olmadan çalışamaz; snooping kapalıyken açarsanız tablo boş olur ve tüm ARP paketleri düşürülerek ağ tamamen durur. Sabit IPli sunucular için statik binding gerekir.", label: 'DAI Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'dai_iface', why: "ARP anti-attack erişim portlarında uygulanır. Sunucu veya uplink portunda binding kaydı bulunmadığından meşru ARP trafiği de düşürülür ve kesinti kaynağı olarak ilk akla DAI gelmez.", label: 'Arayüz', type: 'text', requiredIf: { field: 'dai_enable', checked: true }, validate: 'iface', placeholder: 'GigabitEthernet0/0/3', hint: 'ARP anti-attack uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'IP Source Guard',
                    icon: 'fas fa-fingerprint',
                    fields: [
                        { name: 'isg_enable', why: "IP Source Guard paketin kaynak IP ve MAC ikilisini binding tablosuyla karşılaştırır. Statik IP kullanan yazıcı veya sunucular için elle binding girilmezse bu cihazlar ağdan tamamen kopar.", label: 'IP Source Guard Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'isg_iface', why: "Yalnızca DHCP ile adres alan istemci portlarında güvenlidir. Sabit IP atanmış cihazların bulunduğu portta açmak, o cihazların trafiğini sessizce düşürür ve arıza fiziksel katman sorunu gibi görünür.", label: 'Arayüz', type: 'text', requiredIf: { field: 'isg_enable', checked: true }, validate: 'iface', placeholder: 'GigabitEthernet0/0/4', hint: 'IP source guard uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'BPDU Guard',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'bpdu_enable', why: "BPDU protection, edge port olarak işaretlenmiş bir porta BPDU geldiğinde portu kapatır ve yanlışlıkla takılan switchin STP topolojisini bozmasını engeller. Edge port işaretlemesi olmadan bu koruma devreye girmez.", label: 'BPDU Guard Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'bpdu_iface', why: "Bu port <code>stp edged-port enable</code> ile işaretlenmiş olmalıdır. Uplink veya switche giden portta BPDU protection açmak, meşru BPDU geldiği anda portu err-down yaparak yedek yolu koparır.", label: 'Arayüz', type: 'text', requiredIf: { field: 'bpdu_enable', checked: true }, validate: 'iface', placeholder: 'GigabitEthernet0/0/5', hint: 'BPDU protection uygulanacak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            let c = '# ========================================\n# Huawei — Security Configuration\n# ========================================\n\n';
            c += '[Huawei] system-view\n\n';
            const warnings = [];
            if (data.ps_enable) {
                const iface = cgEsc(data.ps_iface || ''), maxmac = cgEsc(data.ps_max_mac || '');
                const viol = cgEsc(data.ps_violation || ''), sticky = data.ps_sticky;
                if (iface) {
                    // VRP (S serisi): önce port-security enable, sonra sınır/eylem (enable olmadan diğer komutlar reddedilir).
                    // Komut adları: max-mac-num ve protect-action (Cisco'daki maximum/violation karşılıkları).
                    c += '# Port Security\ninterface ' + iface + '\n port-security enable\n';
                    if (maxmac) c += ' port-security max-mac-num ' + maxmac + '\n';
                    if (viol) c += ' port-security protect-action ' + viol + '\n';
                    if (sticky) c += ' port-security mac-address sticky\n';
                    c += 'quit\n\n';
                    const mx = +(data.ps_max_mac || 1);
                    if (viol === 'protect') warnings.push('\u26A0 protect ihlali sessizce düşürür: alarm üretmez, ihlali kimse fark etmez. İz bırakması için restrict (varsayılan) ya da shutdown seçin.');
                    if (viol === 'shutdown') warnings.push('\u2139 shutdown ihlalde portu error-down yapar; port elle shutdown / undo shutdown ile açılır. Port kapanınca port güvenliğini kaldırarak "çözmeyin".');
                    if (mx === 1) warnings.push('\u2139 En fazla 1 MAC (varsayılan): IP telefon + arkasında PC olan portta en az 2 gerekir; yoksa ikinci cihaz ihlal sayılır.');
                    if (mx > 10) warnings.push('\u26A0 MAC sınırı ' + mx + ': masaya takılan bir switch arkasındaki cihazlar da sınırın altında kalır, koruma anlamını yitirir.');
                    if (sticky) warnings.push('\u2139 Sticky MAC\'ler yapılandırmaya yazılır; kalıcı olması için save gerekir.');
                    if (/^(eth-trunk|vlanif)/i.test(data.ps_iface || '')) warnings.push('\u26D4 Port güvenliği fiziksel erişim portunda çalışır; ' + data.ps_iface + ' üzerinde uygulanamaz.');
                }
            }
            if (data.ds_enable) {
                const iface = cgEsc(data.ds_iface || ''), vlan = cgHwVlanList(cgEsc(data.ds_vlan || ''));
                if (iface) {
                    // VRP (S serisi): global "dhcp enable" + "dhcp snooping enable", VLAN'da etkinleştirme,
                    // meşru sunucu yönündeki arayüz trusted (diğerleri varsayılan untrusted).
                    c += '# DHCP Snooping\ndhcp enable\ndhcp snooping enable\n';
                    if (vlan) c += 'dhcp snooping enable vlan ' + vlan + '\n';
                    c += 'interface ' + iface + '\n dhcp snooping trusted\nquit\n\n';
                    if (!vlan) warnings.push('\u26A0 DHCP snooping için VLAN girilmedi: global açık ama hiçbir VLAN\'da etkin değil, sahte DHCP sunucusu engellenmez.');
                    warnings.push('\u2139 Snooping açılınca tüm portlar untrusted olur: yalnız meşru DHCP sunucusuna (ya da relay\'e) giden uplink trusted olmalı, yoksa istemciler adres alamaz.');
                }
            }
            if (data.dai_enable) {
                const iface = cgEsc(data.dai_iface || '');
                // DAI: ARP paketlerini snooping bağlama tablosuna göre denetler (arp anti-attack check user-bind enable)
                if (iface) c += '# DAI\ninterface ' + iface + '\n arp anti-attack check user-bind enable\nquit\n\n';
                if (iface && !data.ds_enable) warnings.push('\u26A0 DAI, DHCP snooping bağlama tablosunu kullanır; snooping kapalıysa tablo boştur ve bu porttaki ARP trafiği düşer (statik IP\'li cihazlar için user-bind static gerekir).');
            }
            if (data.isg_enable) {
                const iface = cgEsc(data.isg_iface || '');
                // IP Source Guard: kaynak IP/MAC'i bağlama tablosuna göre denetler (ip source check user-bind enable)
                if (iface) c += '# IP Source Guard\ninterface ' + iface + '\n ip source check user-bind enable\nquit\n\n';
                if (iface && !data.ds_enable) warnings.push('\u26A0 IP Source Guard, DHCP snooping bağlama tablosunu kullanır; snooping kapalıysa bu portun tüm IP trafiği düşer.');
            }
            if (data.bpdu_enable) {
                const iface = cgEsc(data.bpdu_iface || '');
                // VRP: BPDU korumasi GLOBAL komuttur ('stp bpdu-protection', 'enable' eki yok) ve
                // yalniz edge portlari korur; portlar edged-port yapilir.
                if (iface) {
                    c += '# BPDU Guard\nstp bpdu-protection\n';
                    cgExpandIfList(iface).forEach(i => { c += 'interface ' + i + '\n stp edged-port enable\nquit\n'; });
                    c += '\n';
                    warnings.push('\u2139 BPDU koruması edge porta BPDU gelince portu error-down yapar. Uplink/trunk portunu edge yapmayın; port kapanınca korumayı kaldırmak yerine takılan cihazı sökün.');
                }
            }
            if (c.endsWith('[Huawei] system-view\n\n')) c += '# En az bir güvenlik özelliği etkinleştirin.\n';
            return { config: c, warnings };
        });
    }
};

// ── Huawei VRP: IS-IS ─────────────────────────────────────────────────────────
HuaweiVRP.isis = {
    label: 'IS-IS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'IS-IS (Huawei VRP)',
                desc: 'Huawei VRP IS-IS routing protokolü — process ID, NET adresi, level seçimi ve arayüz aktivasyonu.'
            },
            sections: [
                {
                    title: 'IS-IS Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', why: "Process ID yereldir ve komşuyla aynı olması gerekmez; fakat arayüzdeki <code>isis enable</code> komutunda aynı numarayı kullanmazsanız arayüz hiçbir IS-IS sürecine bağlanmaz ve komşuluk hiç kurulmaz.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'IS-IS process numarası' },
                        { name: 'net', why: "NET adresi <code>49.0001.0000.0000.0001.00</code> biçimindedir ve System ID alanı tüm alan içinde benzersiz olmalıdır. Aynı System ID iki cihazda kullanılırsa LSP veritabanı sürekli çakışır ve topoloji kararsızlaşır; son bayt (NSEL) mutlaka <code>00</code> olmalıdır.", label: 'Network Entity (NET)', type: 'text', required: true, placeholder: '49.0001.0000.0000.0001.00', hint: 'OSI NET adresi (area.systemID.selector formatında)' },
                        { name: 'level', why: "Level-1 yalnızca kendi alanı içinde, Level-2 alanlar arasında komşuluk kurar. İki uçtaki seviye uyuşmazsa (örneğin biri L1 diğeri L2) komşuluk hiç oluşmaz ve <code>display isis peer</code> boş kalır.", label: 'IS-IS Level', type: 'select', options: [
                            { value: 'level-2', label: 'Level-2', selected: true },
                            { value: 'level-1', label: 'Level-1' },
                            { value: 'level-1-2', label: 'Level-1-2' }
                        ]}
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifaces', why: "IS-IS arayüz bazında etkinleştirilir; unutulan bir arayüz o linki topolojiden dışlar ve trafik daha uzun yoldan akar. Ayrıca her iki uçtaki MTU değerleri uyuşmazsa komşuluk kurulur ama LSP aktarımı başarısız olur.", label: 'Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/0, GE0/0/1', hint: 'Virgülle ayrılmış IS-IS etkinleştirilecek arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || ''), net = cgEsc(data.net || ''), level = cgEsc(data.level || 'level-2');
            const ifaces = cgEsc(data.ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei VRP — IS-IS\n# ========================================\n\n';
            c += 'isis ' + procId + '\n network-entity ' + net + '\n is-level ' + level + '\n#\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n isis enable ' + procId + '\n';
                if (level !== 'level-1-2') c += ' isis circuit-level ' + level + '\n';
                c += '#\n';
            });
            c += '\n# Doğrulama:\n# display isis peer\n# display isis lsdb\n# display ip routing-table protocol isis\n';
            return c;
        });
    }
};

// ── Huawei VRP: Eth-Trunk (LAG) ───────────────────────────────────────────────
HuaweiVRP.ethtunk = {
    label: 'Eth-Trunk (LAG)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Eth-Trunk / LAG (Huawei VRP)',
                desc: 'Huawei link aggregation — LACP dinamik veya statik mod, üye arayüzler ve isteğe bağlı routed IP ataması.'
            },
            sections: [
                {
                    title: 'Eth-Trunk Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trunk_id', why: "Eth-Trunk numarası yereldir ama iki uçta aynı tutmak sorun gidermeyi kolaylaştırır. Zaten kullanılan bir ID seçerseniz mevcut trunk üyeleri etkilenir ve yedekli uplink bir anda tek bacağa düşer.", label: 'Eth-Trunk ID', type: 'text', required: true, placeholder: '1', hint: 'Eth-Trunk arayüz numarası (örn: 1 → Eth-Trunk1)' },
                        { name: 'mode', why: "Statik (manual) ve LACP modları karşılıklı uyumsuzdur; bir uç LACP diğer uç manual ise link fiziksel olarak kalkar fakat trafik döngüye girer veya kara deliğe düşer. LACP en azından bir tarafta active olmalıdır.", label: 'Mod', type: 'select', options: [
                            { value: 'lacp', label: 'LACP (mode lacp — V200R005 ve sonrası)', selected: true },
                            { value: 'lacp-static', label: 'LACP (mode lacp-static — eski sürümler)' },
                            { value: 'manual load-balance', label: 'Manual (LACP yok)' }
                        ]}
                    ]
                },
                {
                    title: 'Üye Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', why: "Üye arayüzler hız, dupleks ve port tipi bakımından aynı olmalıdır; farklı hızda portlar trunka alınmaz. Üye ekleme sırasında portun mevcut VLAN yapılandırması silinir, bu yüzden önce trunka alıp sonra VLAN yapılandırın.", label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/1, GE0/0/2', hint: 'Virgülle ayrılmış Eth-Trunk üye arayüzler' },
                        { name: 'ip', why: "Eth-Trunka IP vermek için arayüzün L3 (<code>undo portswitch</code>) modda olması gerekir. L2 modda IP komutu reddedilir; ayrıca IP verdikten sonra VLAN taşıyamazsınız, ikisi aynı anda olmaz.", label: 'Interface IP', type: 'text', validate: 'ip_mask', optional: true, placeholder: '10.0.0.1 255.255.255.252', hint: 'Routed interface ise IP adresi ve netmask' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const trunkId = cgEsc(data.trunk_id || ''), mode = cgEsc(data.mode || 'lacp');
            const members = cgExpandIfList(cgEsc(data.members || ''));   // 'GE0/0/1-2, GE0/0/5' → tek tek
            const ip = cgEsc(data.ip || '');
            let c = '# ========================================\n# Huawei VRP — Eth-Trunk (LAG)\n# ========================================\n\n';
            c += 'interface Eth-Trunk' + trunkId + '\n mode ' + mode + '\n';
            if (ip) c += ' ip address ' + ip + '\n';
            c += '#\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n eth-trunk ' + trunkId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display eth-trunk ' + trunkId + '   ! üyeler Selected mi?\n# display lacp statistics eth-trunk ' + trunkId + '\n';
            // LACP lab bulguları (hua-17): tek uçta mod, manual'da yanlış kablolama, üyede kalan eski ayar
            const warnings = [];
            if (!/^\d+$/.test(data.trunk_id || '')) warnings.push('\u26D4 Eth-Trunk ID bir sayı olmalı (ör. 1 → Eth-Trunk1).');
            if (mode === 'manual load-balance') warnings.push('\u26A0 Manual modda LACP yok: yanlış kablolanan ya da karşı uçta başka gruba bağlı üye fark edilmez, trafik kara deliğe düşebilir. Karşı uç destekliyorsa LACP kullanın.');
            else warnings.push('\u2139 Karşı uç da LACP olmalı. Bir uç LACP, diğeri manual/statik ise üyeler Unselect kalır ve trunk trafik taşımaz.');
            if (members.length < 2) warnings.push('\u26A0 Tek üyeli Eth-Trunk yedeklilik sağlamaz; en az iki üye girin.');
            warnings.push('\u2139 Üye portlar varsayılan durumda olmalı: üzerinde VLAN/port tipi ayarı kalan port Eth-Trunk\'a eklenemez. VLAN ayarlarını üyelere değil interface Eth-Trunk' + trunkId + ' altına yazın.');
            if (ip) warnings.push('\u2139 S serisi switch\'te Eth-Trunk varsayılan L2\'dir; IP adresi için önce Eth-Trunk görünümünde "undo portswitch" gerekir (destekleyen modellerde). Aksi hâlde Vlanif kullanın.');
            return { config: c, warnings };
        });
    }
};

// ── Huawei VRP: MPLS LDP ──────────────────────────────────────────────────────
HuaweiVRP.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'MPLS / LDP (Huawei VRP)',
                desc: 'Huawei VRP MPLS ve LDP yapılandırması — LSR ID ataması ve arayüzlerde MPLS/LDP aktivasyonu.'
            },
            sections: [
                {
                    title: 'MPLS Global',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'lsr_id', why: "LSR ID tüm MPLS alanında benzersiz ve yönlendirme ile ulaşılabilir olmalıdır; genellikle /32 Loopback adresi seçilir. Fiziksel arayüz IP adresi kullanmak link düştüğünde LDP oturumlarının topluca kopmasına yol açar.", label: 'LSR ID (Loopback IP)', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'MPLS Label Switching Router kimliği (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'MPLS Arayüzleri',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifaces', why: "MPLS önce global, sonra her arayüzde ayrı ayrı etkinleştirilmelidir ve LDP de aynı arayüzlerde açılmalıdır. Bir arayüzde LDP unutulursa etiket dağıtımı kesilir ve o yol üzerindeki VPN trafiği sessizce düşer.", label: 'MPLS Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/0, GE0/0/1', hint: 'Virgülle ayrılmış MPLS ve LDP etkinleştirilecek arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const lsrId = cgEsc(data.lsr_id || '');
            const ifaces = cgEsc(data.ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei VRP — MPLS / LDP\n# ========================================\n\n';
            c += 'mpls lsr-id ' + lsrId + '\nmpls\nmpls ldp\n#\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n mpls\n mpls ldp\n#\n';
            });
            c += '\n# Doğrulama:\n# display mpls ldp session\n# display mpls ldp lsp\n# display mpls lsp\n';
            return c;
        });
    }
};

// ── Huawei VRP: L3VPN ─────────────────────────────────────────────────────────
HuaweiVRP.l3vpn = {
    label: 'L3VPN (VRF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'L3VPN / VRF (Huawei VRP)',
                desc: 'Huawei VRP MPLS L3VPN — VPN instance, Route Distinguisher, RT import/export, CE arayüzü ve BGP VPNv4 yapılandırması.'
            },
            sections: [
                {
                    title: 'VPN Instance',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vpn_name', why: "VPN instance adı büyük-küçük harfe duyarlıdır ve yalnızca yereldir. Arayüzü <code>ip binding vpn-instance</code> ile bağlarken isim farklı yazılırsa arayüzün IP adresi silinir ve bağlantı anında kopar.", label: 'VPN Instance Adı', type: 'text', required: true, placeholder: 'CUST_A', hint: 'Benzersiz müşteri VPN adı' },
                        { name: 'rd', why: "RD yalnızca prefixleri benzersiz kılar, hangi VPNin hangi rotayı alacağını belirlemez; bunu RT yapar. Her PE üzerinde aynı müşteri için farklı RD kullanmak normaldir, fakat RD sonradan değiştirilemez, instance silinip yeniden kurulmalıdır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'RD değeri (AS:NN veya IP:NN formatında)' },
                        { name: 'rt_import', why: "Import RT, bu VPNin hangi rotaları içeri alacağını belirler. Karşı PE üzerindeki export RT ile eşleşmezse BGP oturumu sağlıklı görünür, rotalar taşınır ama VRF tablosuna hiç düşmez ve arıza teşhisi zorlaşır.", label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'VPN route-target import değeri' },
                        { name: 'rt_export', why: "Export RT, duyurulan rotalara eklenen etikettir. Hub-and-spoke tasarımlarda import ve export değerlerini asimetrik kurmak gerekir; ikisini körlemesine aynı yapmak tüm şubelerin birbirini görmesine neden olur.", label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'VPN route-target export değeri' }
                    ]
                },
                {
                    title: 'CE Arayüzü ve BGP',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ce_iface', why: "Arayüzü VPN instancea bağlamak üzerindeki IP adresini siler; bu yüzden önce binding yapıp sonra IP vermek gerekir. Sırayı ters yaparsanız uzaktan bağlıysanız oturumunuz da o anda kopar.", label: 'CE Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GE0/1/0', hint: 'CE cihazına bağlanan PE arayüzü' },
                        { name: 'ce_ip', why: "Bu IP artık global tabloda değil VRF tablosundadır; <code>ping</code> ve <code>display ip routing-table</code> komutlarını <code>vpn-instance</code> parametresiyle çalıştırmazsanız adres yokmuş gibi görünür ve boşuna arıza aranır.", label: 'CE Interface IP', type: 'text', validate: 'ip_mask', required: true, placeholder: '10.1.1.1 255.255.255.252', hint: 'CE arayüzüne atanacak IP ve netmask' },
                        { name: 'bgp_as', why: "PE-CE arasında BGP kullanılıyorsa AS numarası <code>ipv4-family vpn-instance</code> altında doğru tanımlanmalıdır. Aynı AS numarası birden fazla şubede kullanılıyorsa AS-path döngü koruması rotaları düşürür ve <code>as-path-loop</code> ayarı gerekir.", label: 'PE BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Provider Edge BGP AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vpnName = cgEsc(data.vpn_name || ''), rd = cgEsc(data.rd || '');
            const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
            const ceIface = cgEsc(data.ce_iface || ''), ceIp = cgEsc(data.ce_ip || ''), bgpAs = cgEsc(data.bgp_as || '');
            let c = '# ========================================\n# Huawei VRP — L3VPN (VRF)\n# ========================================\n\n';
            c += 'ip vpn-instance ' + vpnName + '\n route-distinguisher ' + rd + '\n vpn-target ' + rtImport + ' import-extcommunity\n vpn-target ' + rtExport + ' export-extcommunity\n#\n\n';
            c += 'interface ' + ceIface + '\n ip binding vpn-instance ' + vpnName + '\n ip address ' + ceIp + '\n#\n\n';
            c += 'bgp ' + bgpAs + '\n ipv4-family vpn-instance ' + vpnName + '\n  import-route direct\n#\n\n';
            c += '# Doğrulama:\n# display ip vpn-instance ' + vpnName + '\n# display ip routing-table vpn-instance ' + vpnName + '\n# display bgp vpnv4 vpn-instance ' + vpnName + ' routing-table\n';
            return c;
        });
    }
};

// ── HuaweiVRP: Interface / Loopback ───────────────────────────────────────────
HuaweiVRP.interface = {
    label: 'Interface / Loopback',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface / Loopback (Huawei VRP)',
                desc: 'Huawei VRP arayüz yapılandırması — IP adresi, açıklama ve admin durumu. Loopback için de kullanılabilir.'
            },
            sections: [
                {
                    title: 'Arayüz Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'intf_name', why: "Huawei arayüz isimleri tam yazılmalıdır (<code>GigabitEthernet0/0/1</code>); kısaltma <code>GE0/0/1</code> CLIde çalışsa da konfig dosyasında tam hâliyle saklanır. Var olmayan bir arayüz adı yazarsanız komut hatasız kabul edilir ama hiçbir etkisi olmaz.", label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Tam arayüz adı (örn: GE0/0/1, LoopBack0)' },
                        { name: 'ip', why: "Switch arayüzüne IP vermek için önce <code>undo portswitch</code> ile L3 moda geçilmelidir. Mod değişimi arayüzdeki tüm VLAN yapılandırmasını siler; uzaktan bağlıysanız erişiminizi kaybedersiniz.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Arayüze atanacak IPv4 adresi' },
                        { name: 'mask', why: "Huawei noktalı desimal maske bekler. Point-to-point linklerde /30 yerine /24 kullanmak adres alanını israf eder ve komşu subnetlerle çakışma riskini artırır.", label: 'Subnet Mask', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.255.252', hint: 'Tam netmask formatında (örn: 255.255.255.252)' },
                        { name: 'description', why: "Açıklama <code>display interface description</code> çıktısında görünür ve hangi portun nereye gittiğini gösteren tek kaynaktır. Etiketsiz portlar, kesinti sırasında yanlış kablonun çekilmesinin en yaygın nedenidir.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN-Link', hint: 'Arayüz için açıklayıcı etiket' },
                        { name: 'shutdown', why: "VRP arayüzleri varsayılan olarak açıktır, Ciscodan farklı olarak <code>shutdown</code> ayrıca uygulanmalıdır. Uzaktan bağlıyken yanlış arayüzü kapatmak cihaza erişimi tamamen keser ve <code>save</code> yapılmışsa reboot da kurtarmaz.", label: 'Shutdown Durumu', type: 'select', options: [
                            { value: 'undo shutdown', label: 'undo shutdown (aktif)', selected: true },
                            { value: 'shutdown', label: 'shutdown (pasif)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.intf_name || ''), ip = cgEsc(data.ip || ''), mask = cgEsc(data.mask || '');
            const description = cgEsc(data.description || ''), shutdown = cgEsc(data.shutdown || 'undo shutdown');
            let c = '# ========================================\n# Huawei VRP — Interface / Loopback\n# ========================================\n\n';
            c += 'interface ' + intfName + '\n';
            if (description) c += ' description ' + description + '\n';
            c += ' ip address ' + ip + ' ' + mask + '\n';
            c += ' ' + shutdown + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display interface ' + intfName + '\n# display ip interface brief\n';
            // Arayüz lab bulguları (hua-12/40): ağ/yayın adresi, maske, portswitch
            const warnings = [], len = _vrpWlen(data.mask);
            if (_vrpWnetOrBc(data.ip, len)) warnings.push('\u26D4 ' + data.ip + '/' + len + ' ağ ya da yayın adresi; arayüze bir host adresi girin (ör. .1).');
            if (/^loopback/i.test(data.intf_name || '') && len !== 32 && !isNaN(len)) warnings.push('\u2139 Loopback adresleri genelde /32 (255.255.255.255) verilir; daha geniş maske bu ağı gereksiz yere yönlendirme tablosuna sokar.');
            if (/^(gigabitethernet|ge|xgigabitethernet|xge|ethernet|eth)\s*\d/i.test(data.intf_name || '')) warnings.push('\u2139 S serisi switch\'te fiziksel port varsayılan L2\'dir: IP için önce "undo portswitch" (destekleyen modellerde) gerekir; kullanıcı VLAN\'ları için Vlanif kullanın. AR router portları zaten L3\'tür.');
            if (data.shutdown === 'shutdown') warnings.push('\u26A0 Arayüz kapatılacak: uzaktan bu arayüz üzerinden bağlıysanız erişiminizi kaybedersiniz.');
            return { config: c, warnings };
        });
    }
};

// ── HuaweiVRP: OSPF ───────────────────────────────────────────────────────────
HuaweiVRP.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (Huawei VRP)',
                desc: 'Huawei VRP OSPF yapılandırması — process ID, router-ID, area, network bildirimi ve passive interface.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'process_id', why: "Process ID yereldir, komşuyla aynı olması gerekmez; fakat aynı cihazda birden fazla süreç varsa network bildirimini yanlış sürece yazmak rotaların hiç duyurulmamasına yol açar.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF process numarası' },
                        { name: 'router_id', why: "Router ID alan içinde benzersiz olmalı ve tercihen /32 Loopback adresi olmalıdır. Çakışan Router ID komşuluğun kurulup sürekli kopmasına neden olur; değiştirildiğinde ise süreç yeniden başlatılmadan (<code>reset ospf process</code>) etkili olmaz.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'OSPF router kimliği (genellikle Loopback IP)' },
                        { name: 'area', why: "Backbone alanı 0 olmalı ve diğer tüm alanlar ona fiziksel veya sanal olarak bağlanmalıdır. Kopuk bir alan rotalarını hiç duyuramaz; ayrıca iki komşunun aynı link üzerinde farklı area numarası kullanması komşuluğun hiç kurulmamasına yol açar.", label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'OSPF area numarası (backbone için 0)' }
                    ]
                },
                {
                    title: 'Network Bildirimi',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'networks', why: "Huaweide network satırı <code>area</code> altında ve <b>wildcard maske</b> ile yazılır (<code>0.0.0.255</code>). Subnet maskesi yazmak beklenmedik arayüzlerin sürece dahil olmasına veya hiçbirinin dahil olmamasına neden olur.", label: 'Network(ler)', type: 'text', required: true, placeholder: '192.168.1.0/24,10.0.0.0/30', hint: 'Virgülle ayrılmış CIDR formatında networkler' },
                        { name: 'passive_intfs', why: "Huaweide karşılığı <code>silent-interface</code> komutudur. Kullanıcı VLANlarında bunu uygulamamak, ağa takılan sahte bir routerla komşuluk kurulmasına açık kapı bırakır; uplink arayüzünde uygulamak ise komşuluğu koparır.", label: 'Passive Interface(ler)', type: 'text', validate: 'iface_range', optional: true, placeholder: 'GigabitEthernet0/0/2', hint: 'Virgülle ayrılmış silent-interface listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const processId = cgEsc(data.process_id || ''), routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
            const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
            const passiveIntfs = cgEsc(data.passive_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
            function cidrToWildcard(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                const wild = (~mask) >>> 0;
                return net + ' ' + [(wild >>> 24) & 0xFF, (wild >>> 16) & 0xFF, (wild >>> 8) & 0xFF, wild & 0xFF].join('.');
            }
            let c = '# ========================================\n# Huawei VRP — OSPF\n# ========================================\n\n';
            c += 'ospf ' + processId + ' router-id ' + routerId + '\n';
            c += ' area ' + area + '\n';
            networks.forEach(net => { c += '  network ' + cidrToWildcard(net) + '\n'; });
            passiveIntfs.forEach(intf => { c += ' silent-interface ' + intf + '\n'; });
            c += '#\n';
            c += '\n# Doğrulama:\n# display ospf peer\n# display ip routing-table protocol ospf\n';
            return c;
        });
    }
};

// ── HuaweiVRP: BGP ────────────────────────────────────────────────────────────
HuaweiVRP.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (Huawei VRP)',
                desc: 'Huawei VRP BGP yapılandırması — yerel AS, router-ID, peer tanımı, peer group ve ağ bildirimi.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "Yerel AS numarası komşunun <code>peer remote-as</code> tanımıyla birebir eşleşmelidir; uyuşmazsa oturum Active/Idle arasında gidip gelir ve asla Established olmaz. Private AS aralığı (64512-65534) ISPye duyurulmadan önce temizlenmelidir.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: "BGP Router ID benzersiz olmalıdır; çakışma durumunda oturum kurulur gibi görünür sonra sürekli düşer. Loopback kullanmak fiziksel link değişimlerinde ID kaymasını önler.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP router kimliği (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "Komşu IP adresine ulaşan bir rota olmalıdır; eBGP varsayılan olarak TTL 1 ile çalıştığı için Loopback üzerinden peering yapılacaksa <code>peer ebgp-max-hop</code> gerekir. Aksi halde oturum hiç kurulmaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'remote_as', why: "Remote AS karşı tarafın gerçek AS numarasıyla aynı olmalıdır; yanlış numara oturumun OPEN aşamasında reddedilmesine neden olur. Remote AS yerel AS ile aynıysa iBGP kuralları geçerli olur ve rotalar varsayılan olarak başka iBGP komşularına aktarılmaz.", label: 'Remote AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', why: "Peer group ayarları tüm üyelere uygulanır; gruba sonradan yapılan bir değişiklik farkında olmadan onlarca komşuyu etkiler. Üye eklemeden önce grup politikalarını doğrulamak gerekir.", label: 'Peer Group', type: 'text', optional: true, placeholder: 'EBGP-PEERS', hint: 'Peer group adı (birden fazla komşu için)' }
                    ]
                },
                {
                    title: 'Network Bildirimi',
                    icon: 'fas fa-broadcast-tower',
                    fields: [
                        { name: 'networks', why: "<code>network</code> komutu yalnızca prefix yönlendirme tablosunda birebir aynı maskeyle varsa duyuru yapar; /24 duyurmak isteyip tabloda /25 varsa hiçbir şey duyurulmaz. Bu, BGP duyurusunun sessizce çalışmamasının en yaygın nedenidir.", label: 'Network(ler)', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'Virgülle ayrılmış BGP ile duyurulacak prefix\'ler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), remoteAs = cgEsc(data.remote_as || '');
            const peerGroup = cgEsc(data.peer_group || '');
            const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
            function cidrToNetMask(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                return net + ' ' + [(mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF].join('.');
            }
            let c = '# ========================================\n# Huawei VRP — BGP\n# ========================================\n\n';
            c += 'bgp ' + localAs + '\n';
            c += ' router-id ' + routerId + '\n';
            c += ' peer ' + peerIp + ' as-number ' + remoteAs + '\n';
            if (peerGroup) c += ' peer ' + peerIp + ' group ' + peerGroup + '\n';
            c += ' ipv4-family unicast\n';
            c += '  peer ' + peerIp + ' enable\n';
            networks.forEach(net => { c += '  network ' + cidrToNetMask(net) + '\n'; });
            c += '#\n';
            c += '\n# Doğrulama:\n# display bgp peer\n# display bgp routing-table\n';
            return c;
        });
    }
};

// ── HuaweiVRP: MSTP / STP ─────────────────────────────────────────────────────
HuaweiVRP.mstp = {
    label: 'MSTP / STP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'MSTP / STP (Huawei VRP)',
                desc: 'Huawei VRP Spanning Tree yapılandırması — mod seçimi (MSTP/RSTP/STP), priority, instance ve edge port tanımı.'
            },
            sections: [
                {
                    title: 'STP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'mode', why: "Huaweide varsayılan mod MSTPdir. Karşı cihaz RSTP veya Ciscoda PVST çalışıyorsa mod uyumsuzluğu bölge sınırı yaratır, tüm VLANlar tek instance gibi davranır ve yük dengeleme tasarımınız çalışmaz.", label: 'STP Modu', type: 'select', options: [
                            { value: 'mstp', label: 'MSTP', selected: true },
                            { value: 'rstp', label: 'RSTP' },
                            { value: 'stp', label: 'STP' }
                        ]},
                        { name: 'priority', why: "Priority yalnızca 4096nın katları olabilir; ara değerler reddedilir. Root bridge elle belirlenmezse en düşük MAC adresine sahip rastgele bir erişim switchi root olur ve trafik beklenmedik yollardan akar.", label: 'Priority', type: 'text', required: true, placeholder: '4096', hint: 'Bridge priority değeri (4096\'nın katları: 0, 4096, 8192...)' },
                        { name: 'instance', why: "Instance 0 (CIST) her zaman vardır ve eşlenmemiş tüm VLANları taşır. Bir VLANı instance eşlemesinden unutmak, o VLANın yük dengeleme dışında kalıp yanlış uplinki kullanmasına neden olur.", label: 'Instance', type: 'text', required: true, placeholder: '0', hint: 'MSTP instance numarası (0 = CIST)' }
                    ]
                },
                {
                    title: 'MSTP Region ve Edge Port',
                    icon: 'fas fa-map',
                    fields: [
                        { name: 'vlan_map', why: "VLAN-instance eşlemesi bölgedeki <b>tüm</b> switchlerde birebir aynı olmalıdır; region adı, revizyon numarası ve eşleme tablosundan biri bile farklıysa cihaz farklı bölge sayılır ve MSTP tek instancea düşerek yedek yolları bloklar.", label: 'VLAN Map', type: 'text', validate: 'vlan_list', optional: true, placeholder: '1-100', hint: 'Instance\'a bağlanacak VLAN aralığı (örn: 1-100)' },
                        { name: 'portfast_intfs', why: "<code>stp edged-port</code> yalnızca uç cihaz bağlı portlarda kullanılmalıdır; switche giden bir portta açmak geçici döngü ve yayın fırtınası riski yaratır. Birlikte BPDU protection açmak bu riski kontrol altına alır.", label: 'Edge Port Interface(ler)', type: 'text', validate: 'iface_range', optional: true, placeholder: 'GigabitEthernet0/0/5', hint: 'Virgülle ayrılmış stp edged-port uygulanacak arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = cgEsc(data.mode || 'mstp'), priority = cgEsc(data.priority || ''), instance = cgEsc(data.instance || '');
            const vlanMap = cgHwVlanList(cgEsc(data.vlan_map || ''));
            const portfastIntfs = cgExpandIfList(cgEsc(data.portfast_intfs || ''));   // VRP aralik kabul etmez, tek tek acilir
            const mstp = mode === 'mstp';
            let c = '# ========================================\n# Huawei VRP — MSTP / STP\n# ========================================\n\n';
            c += 'stp mode ' + mode + '\n';
            // "stp instance N priority" MSTP örneğine aittir; STP/RSTP modunda köprü önceliği "stp priority" ile verilir.
            c += (mstp ? 'stp instance ' + instance + ' priority ' : 'stp priority ') + priority + '\n';
            if (vlanMap && mstp) {
                c += 'stp region-configuration\n';
                c += ' instance ' + instance + ' vlan ' + vlanMap + '\n';
                c += ' active region-configuration\n';
                c += ' quit\n';
            }
            portfastIntfs.forEach(intf => {
                c += 'interface ' + intf + '\n stp edged-port enable\n#\n';
            });
            c += '\n# Doğrulama:\n# display stp brief\n# display stp' + (mstp ? ' instance ' + instance : '') + '   ! Root ID kendi köprü kimliğiniz mi?\n';
            if (mstp && vlanMap) c += '# display stp region-configuration   ! bölge adı/revizyon/eşleme komşuyla aynı mı?\n';
            // STP lab bulguları (hua-15): varsayılan öncelik, eşit öncelikte MAC, bölge adı varsayılanı, edge port korumasız
            const warnings = [], pr = +priority;
            if (!/^\d+$/.test(priority) || pr > 61440 || pr % 4096) warnings.push('\u26D4 Köprü önceliği 0-61440 arasında 4096\'nın katı olmalı (0, 4096, 8192 …); diğer değerleri VRP reddeder.');
            else if (pr >= 32768) warnings.push('\u2139 Öncelik varsayılan (32768) ya da daha yüksek: kök seçimi MAC adresine kalır, genelde en eski switch kök olur. Kök olacak çekirdekte 0/4096 (ya da "stp root primary") verin.');
            else warnings.push('\u2139 Komşu da aynı önceliği kullanıyorsa eşitlikte küçük MAC kazanır; kök olunduğunu "display stp" çıktısındaki CIST Root ile doğrulayın.');
            if (!mstp && vlanMap) warnings.push('\u2139 VLAN eşlemesi yalnız MSTP modunda anlamlıdır; ' + mode.toUpperCase() + ' modunda region-configuration yazılmadı.');
            if (mstp && instance !== '' && (!/^\d+$/.test(instance) || +instance > 4094)) warnings.push('\u26D4 Instance numarası geçersiz (0 = CIST, diğerleri pozitif bir sayı).');
            if (mstp && vlanMap && +instance === 0) warnings.push('\u26A0 VLAN\'lar instance 0\'a (CIST) zaten eşlidir; ayrı bir ağaç için 1 ya da üstü bir instance kullanın.');
            if (mstp && vlanMap) warnings.push('\u26A0 Bölge adı yazılmadı: VRP\'de varsayılan bölge adı köprünün MAC adresidir, yani her switch farklı bölgede kalır ve eşleme çalışmaz. region-configuration altında tüm switch\'lerde aynı "region-name" ve "revision-level" verin.');
            if (portfastIntfs.length) warnings.push('\u2139 Edge port BPDU korumasız: sisteme "stp bpdu-protection" ekleyin (STP Port Koruması aracı). Uplink/trunk portunu edge yapmayın.');
            return { config: c, warnings };
        });
    }
};

// ── HuaweiVRP: QoS MQC ────────────────────────────────────────────────────────
HuaweiVRP.qos = {
    label: 'QoS MQC',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS MQC (Huawei VRP)',
                desc: 'Huawei VRP Modular QoS CLI — traffic classifier, behavior ve policy tanımı ile arayüze uygulama.'
            },
            sections: [
                {
                    title: 'Traffic Classifier',
                    icon: 'fas fa-tags',
                    fields: [
                        { name: 'classifier_name', why: "MQC zinciri <b>classifier → behavior → policy</b> şeklindedir ve isimler policy içinde birebir referans verilir. Bir harflik fark zinciri kopartır: policy kabul edilir ama hiçbir trafik sınıflandırılmaz ve QoS sessizce devre dışı kalır.", label: 'Classifier Adı', type: 'text', required: true, placeholder: 'CLASS-VOICE', hint: 'Traffic sınıflandırıcı adı' },
                        { name: 'match_dscp', why: "DSCP işaretini uçtan uca tüm cihazlar korumalıdır; yolda bir cihaz trafiği yeniden işaretlerse (remark) sınıflandırma çöker ve öncelik kaybolur. İşaret güvenilir değilse sınırda yeniden işaretlemek gerekir.", label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (örn: ef, af41, cs3)' }
                    ]
                },
                {
                    title: 'Traffic Behavior',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'behavior_name', why: "Behavior tanımlanmadan policy içinde referans verilirse komut reddedilir. Behavior içinde hiçbir aksiyon yoksa sınıflandırma çalışır ama trafiğe hiçbir şey yapılmaz ve yapılandırma çalışıyor sanılır.", label: 'Behavior Adı', type: 'text', required: true, placeholder: 'BEH-VOICE', hint: 'Traffic davranış tanımı adı' },
                        { name: 'priority', why: "Kuyruk önceliği yanlış atanırsa kritik trafik (VoIP) toplu veri trafiğinin arkasında kuyruğa girer ve ses kalitesi bozulur. Express/EF kuyruğuna fazla trafik yönlendirmek ise diğer tüm sınıfları aç bırakır.", label: 'Queue Priority', type: 'select', options: [
                            { value: 'ef', label: 'EF — Expedited Forwarding', selected: true },
                            { value: 'af41', label: 'AF41 — Assured Forwarding' },
                            { value: 'be', label: 'BE — Best Effort' }
                        ]}
                    ]
                },
                {
                    title: 'Traffic Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', why: "Policy yalnızca bir arayüze <code>traffic-policy ... inbound|outbound</code> ile uygulandığında etkindir. Uygulanmamış bir policy konfigürasyonda görünür ama hiçbir şey yapmaz; bu QoS sorunlarının en sık sebebidir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-QOS', hint: 'QoS policy adı' },
                        { name: 'apply_intf', why: "Yön kritiktir: darboğaz genelde çıkış (outbound) yönündedir, inbound uygulanan shaping beklenen etkiyi vermez. Ayrıca aynı arayüzde aynı yönde birden fazla policy uygulanamaz, ikincisi reddedilir.", label: 'Apply Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Policy uygulanacak çıkış arayüzü' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const classifierName = cgEsc(data.classifier_name || ''), matchDscp = cgEsc(data.match_dscp || '');
            const behaviorName = cgEsc(data.behavior_name || ''), priority = cgEsc(data.priority || 'ef');
            const policyName = cgEsc(data.policy_name || ''), applyIntf = cgEsc(data.apply_intf || '');
            let c = '# ========================================\n# Huawei VRP — QoS MQC\n# ========================================\n\n';
            c += 'traffic classifier ' + classifierName + ' operator or\n if-match dscp ' + matchDscp + '\n#\n\n';
            c += 'traffic behavior ' + behaviorName + '\n queue ' + priority + '\n#\n\n';
            c += 'traffic policy ' + policyName + '\n classifier ' + classifierName + ' behavior ' + behaviorName + '\n#\n';
            if (applyIntf) {
                c += '\ninterface ' + applyIntf + '\n traffic-policy ' + policyName + ' outbound\n#\n';
            }
            c += '\n# Doğrulama:\n# display traffic policy applied-record\n# display qos policy interface\n';
            return c;
        });
    }
};

// ── HuaweiVRP: BFD ────────────────────────────────────────────────────────────
HuaweiVRP.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'BFD (Huawei VRP)',
                desc: 'Huawei VRP Bidirectional Forwarding Detection — hızlı link failure tespiti için BFD session yapılandırması.'
            },
            sections: [
                {
                    title: 'BFD Session',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'session_name', why: "Session adı yereldir ama iki uçta anlamlı ve tutarlı olmalıdır. Aynı isimle ikinci bir oturum tanımlanamaz; ayrıca global <code>bfd</code> komutu çalıştırılmadan hiçbir oturum aktif olmaz.", label: 'Session Adı', type: 'text', required: true, placeholder: 'BFD-TO-PEER', hint: 'BFD session tanımlayıcı adı' },
                        { name: 'peer_ip', why: "Karşı tarafta da eşleşen bir BFD oturumu tanımlanmalıdır; tek taraflı yapılandırma oturumu Down durumunda bırakır. Peer adresi yanlışsa BFD, izlediği protokolü boş yere aşağı çekebilir.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD karşı taraf IP adresi' },
                        { name: 'local_ip', why: "Kaynak IP, karşı tarafın peer olarak beklediği adresle aynı olmalıdır; aksi halde paketler ulaşır ama oturum eşleşmez. Çok yollu ortamlarda kaynak sabitlemek oturumun rastgele kopmasını önler.", label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Yerel kaynak IP adresi' }
                    ]
                },
                {
                    title: 'Timer Ayarları',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'min_tx', why: "Çok agresif aralıklar (örneğin 10 ms) düşük kapasiteli kontrol düzleminde CPUyu zorlar ve yük altında yanlış pozitif arıza tespitine yol açar; bu da çalışan linklerin sürekli kapanıp açılmasına neden olur.", label: 'Min TX Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paketi gönderme aralığı (ms)' },
                        { name: 'min_rx', why: "İki uçtaki TX ve RX değerleri müzakere edilir ve yavaş olan taraf belirleyicidir; bir uçta yüksek değer bırakmak diğer uçtaki hızlı tespiti anlamsız kılar.", label: 'Min RX Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paketi alma aralığı (ms)' },
                        { name: 'detect_mult', why: "Tespit süresi kabaca <code>interval x multiplier</code> kadardır. Çok düşük değer kısa mikro kesintilerde bile rotanın düşmesine, çok yüksek değer ise arızanın saniyelerce fark edilmemesine neden olur.", label: 'Detect Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç paket kaybında arıza ilan edilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sessionName = cgEsc(data.session_name || ''), peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
            const minTx = cgEsc(data.min_tx || ''), minRx = cgEsc(data.min_rx || ''), detectMult = cgEsc(data.detect_mult || '');
            let c = '# ========================================\n# Huawei VRP — BFD\n# ========================================\n\n';
            c += 'bfd ' + sessionName + ' bind peer-ip ' + peerIp + ' source-ip ' + localIp + '\n';
            c += ' min-echo-rx-interval ' + minRx + '\n';
            c += ' min-tx-interval ' + minTx + '\n';
            c += ' detect-multiplier ' + detectMult + '\n';
            c += ' commit\n#\n';
            c += '\n# Doğrulama:\n# display bfd session all\n';
            return c;
        });
    }
};

// ── HuaweiVRP: NTP / Clock ────────────────────────────────────────────────────
HuaweiVRP.ntp = {
    label: 'NTP / Clock',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP / Clock (Huawei VRP)',
                desc: 'Huawei VRP NTP yapılandırması — birincil ve yedek NTP sunucusu, kaynak arayüz ve timezone ayarları.'
            },
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server_ip', why: "Cihaz saati yanlışsa loglar korelasyona uygun olmaz, sertifika doğrulaması ve time-range tabanlı ACL kuralları beklenmedik davranır. NTP sunucusuna UDP 123 trafiğinin güvenlik duvarından geçtiğini de doğrulayın.", label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'server_ip2', why: "Tek NTP kaynağı sessiz bir tek arıza noktasıdır; sunucu yanlış saat yayınlarsa tüm ağ onunla birlikte kayar. İkinci kaynak sapmayı fark etmeyi sağlar.", label: 'NTP Server 2', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'Yedek NTP sunucu IP adresi' },
                        { name: 'source_intf', why: "Kaynak arayüz sabitlenmezse NTP paketleri değişen arayüz IPsi ile gider ve sunucu tarafındaki ACLlere takılır. Loopback kullanmak link değişimlerinden bağımsız kalmayı sağlar.", label: 'Source Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'GigabitEthernet0/0/0', hint: 'NTP paketlerinin kaynak arayüzü' }
                    ]
                },
                {
                    title: 'Zaman Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', why: "Zaman dilimi tanımlanmazsa cihaz UTC ile çalışır ve loglardaki saat saha ekibinin saatiyle örtüşmez; olay korelasyonu birkaç saat kayar ve arıza analizi yanıltıcı hale gelir.", label: 'Timezone Adı', type: 'text', required: true, placeholder: 'Turkey', hint: 'Zaman dilimi adı (örn: Turkey, UTC)' },
                        { name: 'utc_offset', why: "Offset yanlış işaretle girilirse (+ yerine -) saat çift kayar. Yaz saati uygulaması ayrıca <code>clock daylight-saving-time</code> ile tanımlanmalıdır, offset tek başına bunu karşılamaz.", label: 'UTC Offset', type: 'text', required: true, placeholder: '+3', hint: 'UTC\'ye göre ofset (örn: +3, -5)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const serverIp = cgEsc(data.server_ip || ''), serverIp2 = cgEsc(data.server_ip2 || '');
            const sourceIntf = cgEsc(data.source_intf || ''), timezone = cgEsc(data.timezone || ''), utcOffset = cgEsc(data.utc_offset || '');
            let c = '# ========================================\n# Huawei VRP — NTP / Clock\n# ========================================\n\n';
            c += 'ntp-service server ' + serverIp + '\n';
            if (serverIp2) c += 'ntp-service server ' + serverIp2 + '\n';
            if (sourceIntf) c += 'ntp-service source-interface ' + sourceIntf + '\n';
            c += 'clock timezone ' + timezone + ' add ' + utcOffset + ':00:00\n';
            c += '\n# Doğrulama:\n# display ntp-service status\n# display ntp-service sessions\n';
            return c;
        });
    }
};

// ── HuaweiVRP: AAA / RADIUS ───────────────────────────────────────────────────
HuaweiVRP.aaa = {
    label: 'AAA / RADIUS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-check',
                title: 'AAA / RADIUS (Huawei VRP)',
                desc: 'Huawei VRP RADIUS tabanlı AAA yapılandırması — sunucu şablonu, kimlik doğrulama/muhasebe şemaları ve domain tanımı.'
            },
            sections: [
                {
                    title: 'RADIUS Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server_ip', why: "RADIUS sunucusuna ulaşılamadığında yerel yedek şema tanımlı değilse cihaza giriş yapılamaz. Sunucu tarafında bu cihazın IP adresi NAS istemcisi olarak kayıtlı olmalıdır, aksi halde istekler sessizce atılır.", label: 'RADIUS Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'RADIUS sunucu IP adresi (auth:1812, acct:1813)' },
                        { name: 'key', why: "Shared key sunucudaki kayıtla birebir aynı olmalıdır; uyuşmazlıkta RADIUS yanıt bile vermez ve cihaz zaman aşımı görür. Bu nedenle hata genellikle yanlış parola değil, erişilemeyen sunucu gibi teşhis edilir.", label: 'Shared Key', type: 'text', required: true, placeholder: 'RadiusKey123', hint: 'RADIUS şifreli paylaşılan anahtar' }
                    ]
                },
                {
                    title: 'AAA Şemaları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'auth_scheme', why: "Şema bir domaine bağlanmazsa hiç kullanılmaz. Şema içinde yedek yöntem (<code>radius local</code>) tanımlamak, sunucu erişilemezken cihazı tamamen kilitlememenin tek yoludur.", label: 'Auth Scheme Adı', type: 'text', required: true, placeholder: 'RADIUS-AUTH', hint: 'Kimlik doğrulama şeması adı' },
                        { name: 'acct_scheme', why: "Muhasebe şeması olmadan kimin ne zaman giriş yapıp hangi komutu çalıştırdığı kayıt altına alınmaz; denetim gerektiren ortamlarda bu doğrudan uyumsuzluk bulgusudur. Accounting sunucusu erişilemezse oturum açmayı engellememesi için ayarı gözden geçirin.", label: 'Accounting Scheme Adı', type: 'text', required: true, placeholder: 'RADIUS-ACCT', hint: 'Muhasebe şeması adı' },
                        { name: 'domain', why: "VRPde kimlik doğrulama daima domain üzerinden çalışır; kullanıcı domain belirtmezse <code>default</code> domain kuralları uygulanır. Şemaları yanlış domaine bağlamak, yapılandırmanın doğru görünüp hiç devreye girmemesine yol açar.", label: 'Domain Adı', type: 'text', required: true, placeholder: 'default', hint: 'AAA domain adı (örn: default veya kurumsal domain)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const serverIp = cgEsc(data.server_ip || ''), key = cgEsc(data.key || '');
            const authScheme = cgEsc(data.auth_scheme || ''), acctScheme = cgEsc(data.acct_scheme || ''), domain = cgEsc(data.domain || '');
            let c = '# ========================================\n# Huawei VRP — AAA / RADIUS\n# ========================================\n\n';
            c += 'radius-server template ' + authScheme + '\n';
            c += ' radius-server authentication ' + serverIp + ' 1812\n';
            c += ' radius-server accounting ' + serverIp + ' 1813\n';
            c += ' radius-server shared-key cipher ' + key + '\n#\n\n';
            c += 'aaa\n';
            c += ' authentication-scheme ' + authScheme + '\n  authentication-mode radius local\n';
            c += ' accounting-scheme ' + acctScheme + '\n  accounting-mode radius\n';
            c += ' domain ' + domain + '\n';
            c += '  authentication-scheme ' + authScheme + '\n';
            c += '  accounting-scheme ' + acctScheme + '\n';
            c += '  radius-server ' + authScheme + '\n#\n';
            c += '\n# Doğrulama:\n# display aaa configuration\n# display radius-server template ' + authScheme + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: SNMP v3 (Detaylı) ─────────────────────────────────────────────
HuaweiVRP.snmpv3 = {
    label: 'SNMP v3 (Detaylı)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'SNMP v3 Detaylı (Huawei VRP)',
                desc: 'Huawei VRP SNMPv3 tam yapılandırması — USM kullanıcısı, auth/priv protokol ve trap hedefi.'
            },
            sections: [
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'username', why: "Kullanıcı adı NMS tarafındaki tanımla tam olarak eşleşmelidir; SNMPv3te uyuşmazlık hata üretmez, sorgu sessizce yanıtsız kalır. Kullanıcı ayrıca bir gruba bağlanmalıdır, yoksa yetki seviyesi tanımsız kalır.", label: 'Username', type: 'text', required: true, placeholder: 'snmp-admin', hint: 'USM (User-based Security Model) kullanıcı adı' },
                        { name: 'auth_proto', why: "MD5 artık güvenli kabul edilmez, SHA tercih edilmelidir. Algoritma iki tarafta farklıysa kimlik doğrulama sessizce başarısız olur ve izleme sisteminde cihaz kayıp görünür.", label: 'Auth Protokol', type: 'select', options: [
                            { value: 'SHA', label: 'SHA', selected: true },
                            { value: 'MD5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', why: "Parola en az 8 karakter olmalıdır, kısa parola komut düzeyinde reddedilir. NMS ile birebir aynı olmazsa sorgular zaman aşımına uğrar ve cihaz arızalı sanılır.", label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Kimlik doğrulama parolası (min 8 karakter)' },
                        { name: 'priv_proto', why: "DES kırılabilir; AES128 veya üzeri kullanın. Kullanıcının grubu privacy seviyesindeyse priv protokolü tanımlanmadan erişim hiç kurulmaz.", label: 'Priv Protokol', type: 'select', options: [
                            { value: 'AES128', label: 'AES128', selected: true },
                            { value: 'DES56', label: 'DES56' }
                        ]},
                        { name: 'priv_pass', why: "Priv parolası da minimum 8 karakterdir ve auth parolasından farklı olmalıdır. Uyuşmazlıkta paket çözülemez; cihaz yanıt vermez ama log da üretmez.", label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Şifreleme parolası (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', why: "Trap hedefi v3 kullanıcı bilgileriyle birlikte tanımlanmalıdır; v2c parametreleriyle tanımlanan bir hedef v3 traplerini alamaz. Ayrıca hedefe giden yolda UDP 162 açık olmalıdır.", label: 'Trap Host IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap\'larının gönderileceği NMS IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const username = cgEsc(data.username || ''), authProto = cgEsc(data.auth_proto || 'SHA'), authPass = cgEsc(data.auth_pass || '');
            const privProto = cgEsc(data.priv_proto || 'AES128'), privPass = cgEsc(data.priv_pass || ''), trapHost = cgEsc(data.trap_host || '');
            let c = '# ========================================\n# Huawei VRP — SNMP v3\n# ========================================\n\n';
            c += 'snmp-agent sys-info version v3\n';
            c += 'snmp-agent group v3 SNMP-GROUP privacy\n';
            c += 'snmp-agent usm-user v3 ' + username + ' SNMP-GROUP authentication-mode ' + authProto + ' ' + authPass + ' privacy-mode ' + privProto + ' ' + privPass + '\n';
            c += 'snmp-agent target-host trap address udp-domain ' + trapHost + ' params securityname ' + username + ' v3 privacy\n';
            c += '\n# Doğrulama:\n# display snmp-agent user\n# display snmp-agent trap\n';
            return c;
        });
    }
};

// ── HuaweiVRP: SSH / User ─────────────────────────────────────────────────────
HuaweiVRP.ssh = {
    label: 'SSH / User',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'SSH / User (Huawei VRP)',
                desc: 'Huawei VRP SSH kullanıcı yapılandırması — AAA yerel kullanıcı, auth tipi, privilege level ve stelnet aktivasyonu.'
            },
            sections: [
                {
                    title: 'Kullanıcı Ayarları',
                    icon: 'fas fa-user-cog',
                    fields: [
                        { name: 'username', why: "SSH erişimi için kullanıcının <code>service-type ssh</code> ile işaretlenmesi şarttır; sadece kullanıcı oluşturmak yetmez ve giriş sessizce reddedilir. Ayrıca VTY hatlarında <code>protocol inbound ssh</code> tanımlı olmalıdır.", label: 'Username', type: 'text', required: true, placeholder: 'netadmin', hint: 'SSH erişimi için yerel kullanıcı adı' },
                        { name: 'auth_type', why: "Parola tabanlı doğrulama kaba kuvvet saldırılarına açıktır; RSA anahtar tabanlı doğrulama üretim ortamında tercih edilmelidir. Anahtar seçilirse cihazda önce <code>rsa local-key-pair create</code> çalıştırılmalı, yoksa SSH servisi hiç başlamaz.", label: 'Auth Tipi', type: 'select', options: [
                            { value: 'password', label: 'password', selected: true },
                            { value: 'rsa', label: 'rsa' },
                            { value: 'all', label: 'all (password + rsa)' }
                        ]},
                        { name: 'level', why: "Seviye 15 tam yönetici yetkisidir; günlük kullanıcılara verilmesi yanlışlıkla yapılan değişiklikleri ve kötü niyetli erişimi kolaylaştırır. Çok düşük seviye ise kullanıcının <code>display</code> komutlarını bile çalıştıramamasına yol açar.", label: 'Privilege Level', type: 'text', required: true, placeholder: '3', hint: 'Kullanıcı yetki seviyesi (0-15, yönetici için 15)' },
                        { name: 'password', why: "<code>irreversible-cipher</code> ile saklanan parola geri okunamaz; unutulursa sıfırlamak için konsol erişimi gerekir. Zayıf parola, internete açık yönetim arayüzlerinde en sık kullanılan giriş noktasıdır.", label: 'Şifre', type: 'text', required: true, placeholder: 'SecurePass123!', hint: 'irreversible-cipher ile şifrelenmiş saklanır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const username = cgEsc(data.username || ''), authType = cgEsc(data.auth_type || 'password');
            const level = cgEsc(data.level || ''), password = cgEsc(data.password || '');
            let c = '# ========================================\n# Huawei VRP — SSH / User\n# ========================================\n\n';
            c += 'aaa\n';
            c += ' local-user ' + username + ' password irreversible-cipher ' + password + '\n';
            c += ' local-user ' + username + ' service-type ssh\n';
            c += ' local-user ' + username + ' privilege level ' + level + '\n#\n\n';
            c += 'ssh user ' + username + ' authentication-type ' + authType + '\n';
            c += 'stelnet server enable\n';
            c += '\n# Doğrulama:\n# display local-user username ' + username + '\n# display ssh user-information ' + username + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: Route Policy ───────────────────────────────────────────────────
HuaweiVRP.routepolicy = {
    label: 'Route Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Route Policy (Huawei VRP)',
                desc: 'Huawei VRP route-policy yapılandırması — node tanımı, prefix eşleştirme, local-preference ve community uygulama.'
            },
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', why: "Route-policy tanımlandıktan sonra BGP komşusuna veya redistribute komutuna <code>route-policy ... import|export</code> ile bağlanmazsa hiçbir etkisi olmaz. Ayrıca isim uyuşmazlığında VRP boş bir politika uygular ve bu <b>her şeyi reddetmek</b> anlamına gelir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-IN', hint: 'Route-policy tanımlayıcı adı' },
                        { name: 'node_seq', why: "Node numaraları küçükten büyüğe işlenir ve ilk eşleşen düğüm kazanır. Araya düğüm ekleyebilmek için 10ar atlamalı numaralandırın; ayrıca sonunda tüm rotaları kapsayan bir permit düğümü yoksa eşleşmeyen tüm rotalar sessizce düşürülür.", label: 'Node Sequence', type: 'text', required: true, placeholder: '10', hint: 'Node sıra numarası (küçük numara önce işlenir)' },
                        { name: 'mode', why: "Permit düğümü eşleşen rotaya apply komutlarını uygular; deny düğümü rotayı tamamen atar ve apply satırları çalışmaz. Deny düğümü altında apply yazmak sık yapılan ve tamamen etkisiz kalan bir hatadır.", label: 'Mode', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]}
                    ]
                },
                {
                    title: 'Match ve Apply',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'match_prefix', why: "Match satırı olmayan bir permit düğümü tüm rotalarla eşleşir; bunu yanlışlıkla politikanın başına koymak sonraki tüm düğümleri anlamsız kılar. Prefix eşlemesi için önce <code>ip ip-prefix</code> tanımı gerekir.", label: 'Match Prefix', type: 'text', optional: true, placeholder: '10.0.0.0/8', hint: 'Eşleştirilecek CIDR prefix (boş bırakılırsa tümü eşleşir)' },
                        { name: 'apply_localpref', why: "Local-preference yalnızca AS içinde (iBGP) taşınır, eBGP komşusuna geçmez; dış çıkış tercihini yönetmek için doğru araçtır fakat komşuya duyurmak için kullanılamaz. Yüksek değer tercih edilir, varsayılan 100dür.", label: 'Apply Local Preference', type: 'text', optional: true, placeholder: '200', hint: 'BGP local-preference değeri (iBGP için)' },
                        { name: 'apply_community', why: "Community değeri komşuya gönderilmesi için ayrıca <code>peer ... advertise-community</code> tanımlanmalıdır; aksi halde değer yerel kalır ve karşı taraftaki politikalar hiç tetiklenmez. Additive kullanılmazsa mevcut community değerleri silinir.", label: 'Apply Community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const policyName = cgEsc(data.policy_name || ''), nodeSeq = cgEsc(data.node_seq || ''), mode = cgEsc(data.mode || 'permit');
            const matchPrefix = cgEsc(data.match_prefix || ''), applyLocalpref = cgEsc(data.apply_localpref || ''), applyCommunity = cgEsc(data.apply_community || '');
            let c = '# ========================================\n# Huawei VRP — Route Policy\n# ========================================\n\n';
            if (matchPrefix) c += 'ip ip-prefix PFX-' + policyName + ' index 5 permit ' + matchPrefix + '\n#\n\n';
            c += 'route-policy ' + policyName + ' ' + mode + ' node ' + nodeSeq + '\n';
            if (matchPrefix) c += ' if-match ip-prefix PFX-' + policyName + '\n';
            if (applyLocalpref) c += ' apply local-preference ' + applyLocalpref + '\n';
            if (applyCommunity) c += ' apply community ' + applyCommunity + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display route-policy ' + policyName + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: IPSec VPN IKEv2 ────────────────────────────────────────────────
HuaweiVRP.ipsec = {
    label: 'IPSec VPN IKEv2',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'IPSec VPN IKEv2 (Huawei VRP)',
                desc: 'Huawei VRP site-to-site IPSec IKEv2 VPN — IKE proposal, peer tanımı, IPSec proposal ve policy template.'
            },
            sections: [
                {
                    title: 'Peer Bilgileri',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_name', why: "Peer adı IKE peer, IPSec policy ve proposal zincirini birbirine bağlar. Policy içinde farklı yazılan bir isim tüneli tamamen sessiz bırakır: yapılandırma hatasız görünür ama SA hiç kurulmaz.", label: 'Peer Adı', type: 'text', required: true, placeholder: 'PEER-REMOTE', hint: 'IKE peer tanımlayıcı adı' },
                        { name: 'peer_ip', why: "Karşı gateway adresi NAT arkasındaysa NAT-T gerekir ve IKE kimliği IP yerine FQDN olmalıdır. Adres yanlışsa faz 1 hiç başlamaz; <code>display ike sa</code> çıktısı tamamen boş kalır.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Karşı taraf VPN gateway IP adresi' },
                        { name: 'local_ip', why: "Yerel adres, karşı tarafın peer olarak tanımladığı adresle aynı olmalıdır. Birden fazla WAN varsa policy doğru arayüze uygulanmalı, yoksa tünel yanlış kaynak adresle kurulmaya çalışılır ve karşı taraf reddeder.", label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'Yerel VPN gateway IP adresi' },
                        { name: 'psk', why: "PSK iki tarafta birebir aynı olmalıdır; en küçük fark faz 1i başarısız kılar ve log genellikle yalnızca <code>authentication failed</code> der. Ayrıca proposal parametreleri (şifreleme, hash, DH grubu) da iki tarafta eşleşmezse anahtar doğru olsa bile tünel kurulmaz.", label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'IKEv2Secret!', hint: 'Paylaşılan ön anahtar (cipher ile saklanır)' }
                    ]
                },
                {
                    title: 'Network Tanımları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'local_net', why: "Korunan ağlar faz 2 seçicileridir ve iki tarafta <b>ayna simetrik</b> olmalıdır: bir uçtaki local diğer uçtaki remote ile aynı olmalı. Maskeler uyuşmazsa faz 1 kurulur, faz 2 sürekli başarısız olur ve arıza bulmak zorlaşır.", label: 'Local Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel korunan ağ (CIDR formatında)' },
                        { name: 'remote_net', why: "Uzak ağ tanımı karşı taraftaki local tanımıyla birebir eşleşmelidir; ayrıca bu ağa giden trafiğin gerçekten tünel arayüzüne yönlenmesi için rota gerekir. NAT kuralları bu trafiği kapsıyorsa paketler tünele girmeden dışarı çıkar ve tünel boş kalır.", label: 'Remote Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.0/24', hint: 'Uzak korunan ağ (CIDR formatında)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerName = cgEsc(data.peer_name || ''), peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
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
            let c = '# ========================================\n# Huawei VRP — IPSec VPN IKEv2\n# ========================================\n\n';
            c += 'ike proposal 10\n encryption-algorithm aes-256\n dh group14\n authentication-algorithm sha2-256\n authentication-method pre-share\n integrity-algorithm hmac-sha2-256\n prf hmac-sha2-256\n#\n\n';
            c += 'ike peer ' + peerName + '\n pre-shared-key cipher ' + psk + '\n ike-proposal 10\n remote-address ' + peerIp + '\n local-address ' + localIp + '\n#\n\n';
            c += 'ipsec proposal PROP-' + peerName + '\n encapsulation-mode tunnel\n transform esp\n esp authentication-algorithm sha2-256\n esp encryption-algorithm aes-256\n#\n\n';
            c += 'ipsec policy-template TMPL-' + peerName + ' 1\n ike-peer ' + peerName + '\n proposal PROP-' + peerName + '\n ip-address-left ' + ln.net + ' ' + ln.wild + '\n ip-address-right ' + rn.net + ' ' + rn.wild + '\n#\n';
            c += '\n# Doğrulama:\n# display ike sa\n# display ipsec sa\n';
            return c;
        });
    }
};

// ── HuaweiVRP: IPv6 Interface ─────────────────────────────────────────────────
HuaweiVRP.ipv6 = {
    label: 'IPv6 Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'IPv6 Interface (Huawei VRP)',
                desc: 'Huawei VRP IPv6 arayüz yapılandırması — IPv6 etkinleştirme, adres ataması ve RA (Router Advertisement) kontrolü.'
            },
            sections: [
                {
                    title: 'IPv6 Arayüz Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intf_name', why: "IPv6 önce global olarak (<code>ipv6</code>) sonra arayüzde (<code>ipv6 enable</code>) açılmalıdır; ikisinden biri eksikse adres komutu reddedilir. IPv4 çalışıyor diye IPv6nın da çalıştığını varsaymak yaygın bir yanılgıdır.", label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'IPv6 etkinleştirilecek arayüz (örn: GE0/0/1)' },
                        { name: 'ipv6_addr', why: "Adres prefix uzunluğuyla birlikte yazılmalıdır ve LAN segmentlerinde SLAACın çalışması için /64 gerekir; daha dar prefix otomatik adreslemeyi tamamen bozar. Link-local adres otomatik oluşur ancak komşuluk protokolleri onu kullanır, silinemez.", label: 'IPv6 Adresi/Prefix', type: 'text', required: true, placeholder: '2001:db8::1/64', hint: 'CIDR formatında IPv6 adresi (örn: 2001:db8::1/64)' },
                        { name: 'ra_send', why: "Router Advertisement varsayılan olarak Huaweide <b>kapalıdır</b> (<code>undo ipv6 nd ra halt</code> gerekir); açılmazsa istemciler SLAAC ile adres alamaz ve IPv6 sessizce çalışmaz. Yanlış segmentte RA yayınlamak ise istemcilerin hatalı gateway seçmesine yol açar.", label: 'RA Send', type: 'select', options: [
                            { value: 'enable', label: 'enable (RA gönder)', selected: true },
                            { value: 'disable', label: 'disable (RA göndermez)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.intf_name || ''), ipv6Addr = cgEsc(data.ipv6_addr || ''), raSend = cgEsc(data.ra_send || 'enable');
            let c = '# ========================================\n# Huawei VRP — IPv6 Interface\n# ========================================\n\n';
            c += 'ipv6\n';
            c += 'interface ' + intfName + '\n';
            c += ' ipv6 enable\n';
            c += ' ipv6 address ' + ipv6Addr + '\n';
            c += (raSend === 'enable') ? ' undo ipv6 nd ra halt\n' : ' ipv6 nd ra halt\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display ipv6 interface ' + intfName + '\n# display ipv6 routing-table\n';
            return c;
        });
    }
};

// ═════════════════════════════════════════════════════════════════════════════
// Ek araçlar (Agent R). Hedef platform: S serisi kampüs switch'leri, VRP V200.
// ═════════════════════════════════════════════════════════════════════════════

// Virgülle ayrılmış arayüz listesi → [{ name, range }]. VRP arayüz görünümüne
// 'Gi0/0/1-4' gibi aralık girilemez; aralık olanlar üreteçte UYARI'ya çevrilir.
function _hwvrpIfList(s) {
    return String(s || '').split(',').map(x => x.trim()).filter(Boolean)
        .map(x => ({ name: cgEsc(x), range: /\d\s*-\s*\d/.test(x) }));
}

// '10,20,30-32' → ['10','20','30','31','32']; 128'den fazla VLAN'da null.
function _hwvrpVlanExpand(s) {
    const out = [];
    for (const p of String(s || '').replace(/\s+to\s+/gi, '-').split(/[,\s]+/).filter(Boolean)) {
        const m = p.match(/^(\d+)-(\d+)$/);
        if (m) { for (let v = +m[1]; v <= +m[2]; v++) { out.push(String(v)); if (out.length > 128) return null; } }
        else if (/^\d+$/.test(p)) out.push(p);
    }
    return out.length > 128 ? null : out;
}

// ── Huawei VRP: Syslog (info-center) ─────────────────────────────────────────
// Sözdizimi: canlı config (1 cihaz: info-center loghost / info-center source default channel N log level)
//            + https://support.huawei.com/enterprise/en/doc/EDOC1000178167/89b6f3b4/configuring-the-device-to-output-logs-to-a-log-host
//            + https://support.huawei.com/enterprise/en/doc/EDOC1100064353/783fcf36/info-center-loghost-source
HuaweiVRP.syslog = {
    label: 'Syslog (info-center)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Syslog / info-center (Huawei VRP)',
                desc: 'Logları uzak syslog sunucusuna gönderir: <code>info-center loghost</code>, kaynak arayüz, facility ve log host kanalının (channel 2) seviye filtresi.'
            },
            sections: [
                {
                    title: 'Log Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'loghost1', label: 'Log Host 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.50', hint: 'Syslog sunucusunun IPv4 adresi (UDP 514)', why: "Log host tanımlanmazsa loglar yalnızca cihazın küçük log tamponunda kalır ve yeniden başlatmada kaybolur. Bir güvenlik olayı veya arıza sonrası kök neden analizi yapmanın tek yolu merkezi syslog kaydıdır." },
                        { name: 'loghost2', label: 'Log Host 2', type: 'text', validate: 'ip', placeholder: '192.0.2.51', hint: 'İkinci (yedek) syslog sunucusu', why: "VRP en fazla 8 log host destekler ve her birine aynı logu ayrı ayrı gönderir. Tek sunucu bakımdayken üretilen loglar geri getirilemez; ikinci hedef bu boşluğu kapatır." },
                        { name: 'vpn', label: 'VPN Instance', type: 'text', placeholder: 'MGMT', hint: 'Log sunucusuna VRF üzerinden gidiliyorsa VPN instance adı', why: "Yönetim ağı bir VPN instance içindeyse ve bu belirtilmezse cihaz sunucuyu global tabloda arar; rota bulamaz ve loglar hatasız şekilde hiç gönderilmez." },
                        { name: 'facility', label: 'Facility', type: 'select', options: [
                            { value: '', label: 'Varsayılan (local7)', selected: true },
                            { value: 'local0', label: 'local0' }, { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' }, { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4' }, { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' }
                        ], hint: 'Syslog sunucusunda ayrıştırma için kullanılan facility', why: "Syslog sunucusu gelen logları genellikle facility değerine göre dosyalara ayırır. Sunucu kuralı local4 beklerken cihaz local7 gönderirse loglar gelir ama yanlış dosyaya düşer ve kimse görmez." }
                    ]
                },
                {
                    title: 'Kaynak ve Seviye',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'src_if', label: 'Kaynak Arayüz', type: 'text', validate: 'iface', placeholder: 'Vlanif10', hint: 'info-center loghost source — logların kaynak IP\'si bu arayüzden alınır', why: "Kaynak sabitlenmezse log paketi çıkış arayüzünün IP'si ile gider; rota değiştiğinde syslog sunucusu cihazı farklı bir IP'den görür ve kaynak IP'ye göre yazılmış filtre veya firewall kuralı logları düşürür." },
                        { name: 'level', label: 'Log Host Seviyesi (channel 2)', type: 'select', options: [
                            { value: '', label: 'Değiştirme (cihaz varsayılanı)', selected: true },
                            { value: 'informational', label: 'informational (6)' },
                            { value: 'notification', label: 'notification (5)' },
                            { value: 'warning', label: 'warning (4)' },
                            { value: 'error', label: 'error (3)' },
                            { value: 'debugging', label: 'debugging (7)' }
                        ], hint: 'info-center source default channel 2 log level ...', why: "Channel 2 varsayılan olarak log host kanalıdır. Seviyeyi <b>debugging</b> yapmak sunucuyu gereksiz mesajla doldurur; <b>error</b> gibi yüksek bir seviye ise arayüz düşme ve oturum açma gibi önemli <b>informational</b> olayları sessizce eler." }
                    ]
                }
            ],
            submit: 'Syslog Konfigürasyonu Oluştur'
        }, (data) => {
            const h1 = cgEsc(data.loghost1 || ''), h2 = cgEsc(data.loghost2 || ''), vpn = cgEsc(data.vpn || '');
            const fac = cgEsc(data.facility || ''), src = cgEsc(data.src_if || ''), lvl = cgEsc(data.level || '');
            const opts = (vpn ? ' vpn-instance ' + vpn : '') + (fac ? ' facility ' + fac : '');
            let c = '# ========================================\n# Huawei VRP — Syslog (info-center)\n# ========================================\n\n';
            c += 'system-view\n';
            if (lvl) c += 'info-center source default channel 2 log level ' + lvl + '\n';
            if (src) c += 'info-center loghost source ' + src + '\n';
            c += 'info-center loghost ' + h1 + opts + '\n';
            if (h2) c += 'info-center loghost ' + h2 + opts + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display info-center\n# display logbuffer\n';
            return c;
        });
    }
};

// ── Huawei VRP: LLDP ─────────────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100127035/8def618c/lldp-configuration-commands
//            (lldp enable, lldp message-transmission interval / hold-multiplier, arayüzde undo lldp enable)
HuaweiVRP.lldp = {
    label: 'LLDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'LLDP (Huawei VRP)',
                desc: 'Komşu keşfi için LLDP\'yi global açar, gönderim aralığı/TTL çarpanını ayarlar ve istenmeyen portlarda (ör. internet, müşteri portu) kapatır.'
            },
            sections: [
                {
                    title: 'Global LLDP',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'interval', label: 'Gönderim Aralığı (sn)', type: 'text', min: 5, max: 32768, placeholder: '30', hint: 'lldp message-transmission interval (varsayılan 30)', why: "Aralık kısaldıkça topoloji değişikliği NMS'te daha hızlı görünür ama her portta CPU'ya giden LLDP paketi artar. Değer, gecikme (delay) değerinin en az 4 katı olmalıdır; aksi halde komut reddedilir." },
                        { name: 'hold', label: 'Hold Çarpanı', type: 'text', min: 2, max: 10, placeholder: '4', hint: 'lldp message-transmission hold-multiplier (TTL = aralık × çarpan)', why: "Komşu bilgisi TTL süresince tutulur. Çarpan çok küçükse tek bir kayıp paket komşunun tablodan düşmesine ve NMS'te sahte 'bağlantı koptu' alarmına yol açar." }
                    ]
                },
                {
                    title: 'LLDP Kapatılacak Portlar',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'disable_ifs', label: 'Portlar', type: 'text', validate: 'iface_range', placeholder: 'GigabitEthernet0/0/24', hint: 'Virgülle ayırın; bu portlarda undo lldp enable uygulanır', why: "LLDP cihaz adı, model, yazılım sürümü ve yönetim IP'sini düz metin yayınlar. Operatör, müşteri veya internet yönlü portlarda açık bırakmak altyapı bilgisini dışarı sızdırır." }
                    ]
                }
            ],
            submit: 'LLDP Konfigürasyonu Oluştur'
        }, (data) => {
            const iv = cgEsc(data.interval || ''), hold = cgEsc(data.hold || '');
            const ifs = _hwvrpIfList(data.disable_ifs);
            let c = '# ========================================\n# Huawei VRP — LLDP\n# ========================================\n\n';
            c += 'system-view\nlldp enable\n';
            if (iv) c += 'lldp message-transmission interval ' + iv + '\n';
            if (hold) c += 'lldp message-transmission hold-multiplier ' + hold + '\n';
            c += '#\n';
            ifs.forEach(i => {
                if (i.range) { c += '# UYARI: aralık girilemez, portları tek tek yazın: ' + i.name + '\n'; return; }
                c += 'interface ' + i.name + '\n undo lldp enable\n quit\n';
            });
            c += '\n# Doğrulama:\n# display lldp neighbor brief\n';
            return c;
        });
    }
};

// ── Huawei VRP: Static Route ─────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100127035/ac7caed7/ip-route-static
//            https://support.huawei.com/enterprise/en/doc/EDOC1100176877/8d51b4f2/ip-route-static-vpn-instance
//            (preference, track bfd-session / track nqa, description); canlı config (1 cihaz: ip route-static D M NH)
HuaweiVRP.staticroute = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route (Huawei VRP)',
                desc: '<code>ip route-static</code> — hedef ağ, next-hop veya çıkış arayüzü, preference (floating route), VPN instance ve isteğe bağlı BFD/NQA takibi.'
            },
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'dest', label: 'Hedef Ağ', type: 'text', validate: 'ip', required: true, placeholder: '10.64.0.0', hint: 'Default route için 0.0.0.0', why: "Hedef ağın host bitleri sıfır olmalıdır; VRP maskeyle hizalı olmayan adresi kabul eder ama maskeyle keserek kaydeder, sonuçta tabloda beklediğinizden farklı bir önek görürsünüz." },
                        { name: 'mask', label: 'Maske', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.0.0', hint: 'Noktalı maske (örn: 255.255.255.0)', why: "Maske bir bit fazla/eksik olursa rota ya komşu ağları da yutar ya da hedefin yarısını kapsamaz; longest-match nedeniyle sorun yalnızca bazı adreslerde görünür." },
                        { name: 'nexthop', label: 'Next-hop IP', type: 'text', validate: 'ip', requiredIf: { field: 'out_if', in: [''] }, placeholder: '192.0.2.1', hint: 'Çıkış arayüzü boşsa zorunlu', why: "Next-hop doğrudan bağlı bir subnette değilse VRP rotayı yinelemeli (recursive) çözmeye çalışır; çözülemezse rota tabloya girer ama <b>inactive</b> kalır ve trafik hiç akmaz." },
                        { name: 'out_if', label: 'Çıkış Arayüzü', type: 'text', validate: 'iface', placeholder: 'Vlanif100', hint: 'Opsiyonel; next-hop ile birlikte yazılırsa ikisi de kullanılır', why: "Ethernet (broadcast) arayüzünde yalnızca çıkış arayüzü yazmak her hedef için ARP sorgusu üretir ve karşı tarafta proxy-ARP yoksa trafik düşer. Ethernet'te arayüzle birlikte next-hop da verin." },
                        { name: 'vpn', label: 'VPN Instance', type: 'text', placeholder: 'VRF-A', hint: 'Rota bir VPN instance tablosuna eklenecekse', why: "VPN instance belirtilmezse rota global tabloya eklenir; VRF içindeki trafik bu rotayı hiç görmez ve sorun 'rota var ama çalışmıyor' şeklinde yanıltıcı görünür." }
                    ]
                },
                {
                    title: 'Öncelik ve Takip',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'pref', label: 'Preference', type: 'text', min: 1, max: 255, placeholder: '60', hint: 'Varsayılan 60; yedek (floating) rota için daha büyük değer', why: "VRP'de düşük preference kazanır. Yedek hat rotasına ana rotadan <b>büyük</b> değer verilmezse iki rota eşit maliyetli olur ve trafik yedek hatta da bölünür." },
                        { name: 'track', label: 'Takip', type: 'select', options: [
                            { value: '', label: 'Yok', selected: true },
                            { value: 'bfd', label: 'BFD oturumu (track bfd-session)' },
                            { value: 'nqa', label: 'NQA testi (track nqa)' }
                        ], hint: 'Next-hop ulaşılamaz olduğunda rotayı geri çeker', why: "Arada bir L2 switch varken karşı uç çökerse yerel port up kalır ve statik rota aktif kalmaya devam eder; trafik kara deliğe gider. BFD veya NQA takibi rotayı gerçekten ulaşılabilirliğe bağlar." },
                        { name: 'bfd_name', label: 'BFD Oturum Adı', type: 'text', requiredIf: { field: 'track', in: ['bfd'] }, placeholder: 'BFD-WAN1', hint: 'Önceden tanımlı statik BFD oturumu (BFD aracı)', why: "Takip edilen BFD oturumu cihazda tanımlı değilse rota hiç aktif olmaz. Ayrıca track bfd-session parametresini yalnızca belirli S modelleri destekler; komut reddedilirse modelinizin dokümanını kontrol edin." },
                        { name: 'nqa_admin', label: 'NQA Admin Adı', type: 'text', requiredIf: { field: 'track', in: ['nqa'] }, placeholder: 'nqa-adm', hint: 'nqa test-instance <admin> <test>', why: "NQA test örneği (ICMP) önceden oluşturulmuş ve <code>start now</code> ile başlatılmış olmalıdır; başlatılmamış test 'başarısız' sayılır ve rota hemen geri çekilir." },
                        { name: 'nqa_test', label: 'NQA Test Adı', type: 'text', requiredIf: { field: 'track', in: ['nqa'] }, placeholder: 'icmp1', hint: 'NQA test adı', why: "Admin ve test adı birlikte tek bir test örneğini tanımlar; ikisinden biri yanlışsa komut kabul edilse bile takip hiçbir teste bağlanmaz." },
                        { name: 'desc', label: 'Açıklama', type: 'text', placeholder: 'ISP1-yedek', hint: 'description (en fazla 35 karakter)', why: "Açıklamasız statik rotalar yıllar içinde kimin neden eklediği bilinmeyen kalıntılara dönüşür; temizlik sırasında hâlâ kullanılan bir rota silinir." }
                    ]
                }
            ],
            submit: 'Static Route Oluştur'
        }, (data) => {
            const dest = cgEsc(data.dest || ''), mask = cgEsc(data.mask || ''), nh = cgEsc(data.nexthop || '');
            const oif = cgEsc(data.out_if || ''), vpn = cgEsc(data.vpn || ''), pref = cgEsc(data.pref || '');
            const track = data.track || '', bfd = cgEsc(data.bfd_name || ''), na = cgEsc(data.nqa_admin || ''), nt = cgEsc(data.nqa_test || '');
            const desc = cgEsc(data.desc || '');
            let c = '# ========================================\n# Huawei VRP — Static Route\n# ========================================\n\n';
            if (!nh && !oif) return c + '# UYARI: next-hop IP veya çıkış arayüzünden en az biri gerekli.\n';
            let r = 'ip route-static ' + (vpn ? 'vpn-instance ' + vpn + ' ' : '') + dest + ' ' + mask;
            r += (oif ? ' ' + oif : '') + (nh ? ' ' + nh : '');
            if (pref) r += ' preference ' + pref;
            if (track === 'bfd' && bfd) r += ' track bfd-session ' + bfd;
            if (track === 'nqa' && na && nt) r += ' track nqa ' + na + ' ' + nt;
            if (desc) r += ' description ' + desc;
            c += 'system-view\n' + r + '\n#\n';
            c += '\n# Doğrulama:\n# display ip routing-table ' + (vpn ? 'vpn-instance ' + vpn + ' ' : '') + dest + '\n# display ip routing-table protocol static\n';
            return c;
        });
    }
};

// ── Huawei VRP: VRRP ─────────────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1100126875/4737a341/example-for-configuring-a-vrrp-group-in-redundancy-mode
//            https://support.huawei.com/enterprise/en/doc/EDOC1000178165/3f68ca6c/vrrp-configuration-commands
//            (vrrp vrid N virtual-ip / priority / preempt-mode timer delay / track interface ... reduced / authentication-mode md5)
HuaweiVRP.vrrp = {
    label: 'VRRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'VRRP (Huawei VRP)',
                desc: 'İki L3 switch arasında yedekli sanal gateway. Vlanif üzerinde VRRP grubu, öncelik, preemption gecikmesi, uplink takibi ve MD5 doğrulama.'
            },
            sections: [
                {
                    title: 'Arayüz ve Grup',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'iface', label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'Vlanif10', hint: 'VRRP çalışacak L3 arayüz (genelde Vlanif)', why: "VRRP grubu yalnızca IP adresi olan bir L3 arayüzde çalışır. Sanal IP bu arayüzün subnetinde değilse komut reddedilir." },
                        { name: 'if_ip', label: 'Arayüz IP / Maske', type: 'text', validate: 'ip_mask', placeholder: '10.1.10.2 255.255.255.0', hint: 'Opsiyonel — arayüzde IP zaten varsa boş bırakın', why: "Her cihazın arayüz IP'si farklı, sanal IP ise iki cihazda aynı olmalıdır. Arayüz IP'sini sanal IP ile aynı vermek (IP owner) o cihazı önceliğe bakmadan kalıcı master yapar." },
                        { name: 'vrid', label: 'VRID', type: 'text', required: true, min: 1, max: 255, placeholder: '1', hint: '1-255; iki cihazda aynı', why: "VRID, sanal MAC adresini (00-00-5E-00-01-<VRID>) belirler. Aynı VLAN'da başka bir VRRP grubu aynı VRID'i kullanırsa iki grup birbirinin master'ını görür ve gateway MAC'i sürekli yer değiştirir." },
                        { name: 'vip', label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.10.1', hint: 'İstemcilerin default gateway adresi', why: "Sanal IP iki cihazda birebir aynı olmalıdır. Farklı yazılırsa her iki cihaz da kendini master sanar (split-brain) ve istemciler DHCP'den aldıkları gateway'e göre rastgele birine gider." }
                    ]
                },
                {
                    title: 'Öncelik ve Preemption',
                    icon: 'fas fa-sort-amount-up',
                    fields: [
                        { name: 'priority', label: 'Öncelik', type: 'text', min: 1, max: 254, placeholder: '120', hint: 'Varsayılan 100; master olacak cihaza daha yüksek değer', why: "İki cihaz eşit öncelikteyse master'ı arayüz IP'si büyük olan belirler; tasarımda hangi cihazın master olduğu tesadüfe kalır ve STP root ile gateway farklı cihazlara düşerek trafik gereksiz yere ara link üzerinden akar." },
                        { name: 'preempt_delay', label: 'Preemption Gecikmesi (sn)', type: 'text', min: 0, max: 3600, placeholder: '20', hint: 'vrrp vrid N preempt-mode timer delay', why: "Yeniden açılan master, yönlendirme protokolleri yakınsamadan gateway rolünü geri alırsa trafik birkaç saniye kara deliğe düşer. Gecikme, cihazın önce rotalarını öğrenmesine zaman tanır." },
                        { name: 'track_if', label: 'Takip Edilen Uplink', type: 'text', validate: 'iface', placeholder: 'GigabitEthernet0/0/24', hint: 'Uplink düşerse öncelik düşürülür', why: "Uplink'i kopan master, gateway olmaya devam ederse istemci trafiği önce ona gelir, sonra ara link üzerinden diğer cihaza aktarılır ya da tamamen düşer. Uplink takibi rolün yedek cihaza geçmesini sağlar." },
                        { name: 'reduced', label: 'Öncelik Düşüşü', type: 'text', min: 1, max: 255, placeholder: '30', hint: 'Uplink düşünce öncelikten çıkarılacak değer', why: "Düşüş miktarı, master'ın yeni önceliğini yedek cihazın önceliğinin <b>altına</b> indirmelidir (örn: 120 − 30 = 90 < 100). Yetersiz değer takibi işlevsiz bırakır." }
                    ]
                },
                {
                    title: 'Doğrulama (Kimlik)',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'md5_key', label: 'MD5 Anahtarı', type: 'text', placeholder: 'Vrrp-Key-01', hint: 'vrrp vrid N authentication-mode md5', why: "Doğrulama olmadan aynı VLAN'a bağlanan herhangi bir cihaz yüksek öncelikli VRRP paketi göndererek gateway rolünü ele geçirebilir. Anahtar iki cihazda aynı olmalıdır; farklıysa ikisi de master olur." }
                    ]
                }
            ],
            submit: 'VRRP Konfigürasyonu Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), ifip = cgEsc(data.if_ip || ''), vrid = cgEsc(data.vrid || ''), vip = cgEsc(data.vip || '');
            const prio = cgEsc(data.priority || ''), pd = cgEsc(data.preempt_delay || ''), tif = cgEsc(data.track_if || '');
            const red = cgEsc(data.reduced || ''), key = cgEsc(data.md5_key || '');
            let c = '# ========================================\n# Huawei VRP — VRRP\n# ========================================\n\n';
            c += 'system-view\ninterface ' + iface + '\n';
            if (ifip) c += ' ip address ' + ifip + '\n';
            c += ' vrrp vrid ' + vrid + ' virtual-ip ' + vip + '\n';
            if (prio) c += ' vrrp vrid ' + vrid + ' priority ' + prio + '\n';
            if (pd) c += ' vrrp vrid ' + vrid + ' preempt-mode timer delay ' + pd + '\n';
            if (tif) c += ' vrrp vrid ' + vrid + ' track interface ' + tif + (red ? ' reduced ' + red : '') + '\n';
            if (key) c += ' vrrp vrid ' + vrid + ' authentication-mode md5 ' + key + '\n';
            c += ' quit\n#\n';
            c += '\n# Doğrulama:\n# display vrrp brief   ! hangi cihaz Master?\n# display vrrp\n';
            return { config: c, warnings: _vrpWvrrp(data) };
        });
    }
};

// VRRP lab bulguları (hua-17): eşit öncelik, sanal IP alt ağ dışında, yetersiz track düşüşü
function _vrpWvrrp(data) {
    const w = [], v = k => String(data[k] == null ? '' : data[k]).trim();
    const pr = v('priority') ? +v('priority') : 100, vip = v('vip');
    const m = v('if_ip').split(/\s+/), rip = m[0], len = _vrpWlen(m[1]);
    if (v('if_ip') && _vrpWip(rip) && !isNaN(len) && _vrpWip(vip)) {
        const net = _vrpWnet(rip, len);
        if (!_vrpWinNet(vip, net)) w.push('\u26D4 Sanal IP (' + vip + ') arayüz alt ağında (' + v('if_ip') + ') değil: istemciler bu geçide ulaşamaz, grup çalışmaz.');
        else if (vip === rip) w.push('\u26A0 Sanal IP arayüz adresiyle aynı: bu cihaz IP sahibi (owner) olur, önceliği 255 sayılır ve hep Master kalır; öncelik/track ayarları etkisizleşir. Her cihaza ayrı gerçek IP, ortak bir sanal IP verin.');
    }
    if (pr <= 100) w.push('\u2139 Öncelik ' + pr + (v('priority') ? '' : ' (varsayılan)') + ': karşı cihaz da ' + pr + ' ise Master\'ı büyük arayüz IP\'si belirler. Master olması istenen cihaza 100\'ün üstünde (ör. 120) verin.');
    if (v('track_if') && v('reduced') && pr - +v('reduced') >= 100) w.push('\u26A0 Track düşüşü yetersiz: uplink kopunca öncelik ' + pr + ' − ' + v('reduced') + ' = ' + (pr - +v('reduced')) + ' olur ve yedeğin (varsayılan 100) altına inmez; Master değişmez.');
    if (v('track_if') && !v('reduced')) w.push('\u2139 Düşüş değeri boş: VRP varsayılan düşüşü uygular; yedeğin altına indiğini "display vrrp" ile doğrulayın.');
    if (v('md5_key')) w.push('\u2139 MD5 anahtarı iki cihazda birebir aynı olmalı; farklıysa ilanlar reddedilir ve iki cihaz da Master olur.');
    return w;
}

// ── Huawei VRP: Port Mirroring ───────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000178174/4be883cd/example-for-configuring-local-mn-port-mirroring
//            https://support.huawei.com/enterprise/en/doc/DOC1000047414/ef00aa8/port-mirroring-to-observe-port
//            (observe-port N interface X; port-mirroring to observe-port N { inbound | outbound | both })
HuaweiVRP.mirror = {
    label: 'Port Mirroring',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Port Mirroring (Huawei VRP)',
                desc: 'Yerel port yansıtma: bir veya birden fazla portun trafiğini IDS, sniffer veya analizöre bağlı gözlem portuna (observe-port) kopyalar.'
            },
            sections: [
                {
                    title: 'Gözlem Portu',
                    icon: 'fas fa-eye',
                    fields: [
                        { name: 'obs_idx', label: 'Observe-port Numarası', type: 'text', required: true, min: 1, max: 8, placeholder: '1', hint: 'observe-port indeksi', why: "Aynı indeksi farklı bir arayüze yeniden atamak önceki gözlem portunu değiştirir ve o indekse bağlı tüm yansıtmaları yeni porta taşır; mevcut bir analiz oturumu fark edilmeden bozulur." },
                        { name: 'obs_if', label: 'Gözlem Portu', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0/24', hint: 'Analizörün bağlı olduğu port', why: "Gözlem portu normal veri trafiği taşımamalıdır; kopyalanan trafik bu portun bant genişliğini doldurur. Kaynak portların toplam trafiği gözlem portunun hızını aşarsa kopyaların bir kısmı sessizce düşer." }
                    ]
                },
                {
                    title: 'Yansıtılacak Portlar',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'src_ifs', label: 'Kaynak Port(lar)', type: 'text', validate: 'iface_range', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Virgülle ayırın (örn: GigabitEthernet0/0/1, GigabitEthernet0/0/2)', why: "Gözlem portunun kendisini kaynak olarak eklemek döngü yaratır. Uplink gibi yoğun bir portu <b>both</b> yönde yansıtmak trafiği ikiye katlar ve gözlem portunu hızla doyurur." },
                        { name: 'dir', label: 'Yön', type: 'select', options: [
                            { value: 'inbound', label: 'inbound — gelen', selected: true },
                            { value: 'outbound', label: 'outbound — giden' },
                            { value: 'both', label: 'both — iki yön' }
                        ], hint: 'Hangi yöndeki trafiğin kopyalanacağı', why: "Yalnızca gelen trafik yansıtılırsa analizör cevap paketlerini görmez; TCP oturum analizi yarım kalır. <b>both</b> tam görünürlük verir ama bant genişliği ihtiyacını iki katına çıkarır. Bazı modeller outbound yansıtmayı desteklemez." }
                    ]
                }
            ],
            submit: 'Port Mirroring Oluştur'
        }, (data) => {
            const idx = cgEsc(data.obs_idx || ''), oif = cgEsc(data.obs_if || ''), dir = cgEsc(data.dir || 'inbound');
            const srcs = _hwvrpIfList(data.src_ifs);
            let c = '# ========================================\n# Huawei VRP — Port Mirroring\n# ========================================\n\n';
            c += 'system-view\nobserve-port ' + idx + ' interface ' + oif + '\n#\n';
            srcs.forEach(i => {
                if (i.range) { c += '# UYARI: aralık girilemez, portları tek tek yazın: ' + i.name + '\n'; return; }
                c += 'interface ' + i.name + '\n port-mirroring to observe-port ' + idx + ' ' + dir + '\n quit\n';
            });
            c += '#\n\n# Doğrulama:\n# display observe-port\n# display port-mirroring\n';
            return c;
        });
    }
};

// ── Huawei VRP: Storm Control / Traffic Suppression ──────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000178165/49f3d8a/traffic-suppression-and-storm-control-configuration-commands
//            https://support.huawei.com/enterprise/en/doc/EDOC1000178177/f10aa989/example-for-configuring-storm-control
//            (broadcast/multicast/unicast-suppression { percent | packets N }; storm-control X min-rate A max-rate B;
//             storm-control action { block | error-down }; storm-control enable log)
HuaweiVRP.storm = {
    label: 'Storm Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Storm Control / Traffic Suppression (Huawei VRP)',
                desc: 'Broadcast, bilinmeyen multicast ve bilinmeyen unicast fırtınalarını port bazında sınırlar. Traffic suppression aşan paketi atar; storm control eşik aşılınca portu bloklar veya error-down yapar.'
            },
            configTypes: [
                { id: 'pct', label: 'Suppression (%)', icon: 'fas fa-percent', desc: 'Bant genişliği yüzdesiyle sınırla', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'pps', label: 'Suppression (pps)', icon: 'fas fa-tachometer-alt', desc: 'Saniyedeki paket sayısıyla sınırla' },
                { id: 'storm', label: 'Storm Control', icon: 'fas fa-bolt', desc: 'Eşik aşılınca block / error-down' }
            ],
            sections: [
                {
                    title: 'Arayüz',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifs', label: 'Arayüz(ler)', type: 'text', validate: 'iface_range', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Virgülle ayırın; erişim portlarına uygulanır', why: "Fırtına genellikle erişim portundaki bir döngü veya arızalı NIC'ten başlar. Sınırı yalnızca uplink'e koymak fırtınanın switch içinde diğer erişim portlarına yayılmasını engellemez." }
                    ]
                },
                {
                    title: 'Suppression (yüzde)',
                    icon: 'fas fa-percent',
                    showFor: ['pct'],
                    fields: [
                        { name: 'bc_pct', label: 'Broadcast %', type: 'text', min: 0, max: 100, requiredIf: { field: '_cgtype', in: ['pct'] }, placeholder: '5', hint: 'broadcast-suppression (varsayılan %10)', why: "Normal bir erişim portunda broadcast (ARP, DHCP) trafiği bant genişliğinin %1'ini nadiren aşar. Çok düşük değer ise yoğun ARP anlarında meşru paketleri de atar ve bağlantı kopmaları sanki rastgeleymiş gibi görünür." },
                        { name: 'mc_pct', label: 'Multicast %', type: 'text', min: 0, max: 100, placeholder: '5', hint: 'multicast-suppression', why: "Multicast bastırma IPTV veya yazılım dağıtımı gibi meşru multicast akışlarını da keser; bu servislerin geçtiği portlarda değeri trafik profiline göre seçin." },
                        { name: 'uc_pct', label: 'Bilinmeyen Unicast %', type: 'text', min: 0, max: 100, placeholder: '5', hint: 'unicast-suppression', why: "MAC tablosu taşması veya asimetrik yönlendirmede bilinmeyen unicast flood edilir. Sınır, bu durumun tüm VLAN'ı doldurmasını engeller." }
                    ]
                },
                {
                    title: 'Suppression (pps)',
                    icon: 'fas fa-tachometer-alt',
                    showFor: ['pps'],
                    fields: [
                        { name: 'bc_pps', label: 'Broadcast pps', type: 'text', validate: 'posint', requiredIf: { field: '_cgtype', in: ['pps'] }, placeholder: '1000', hint: 'broadcast-suppression packets', why: "Paket sayısı bazlı sınır port hızından bağımsızdır; 1G ve 10G portlarda aynı eşik aynı korumayı verir. Yüzde bazlı sınırda ise 10G porttaki %5, erişim switch'inin CPU'sunu bunaltacak kadar yüksektir." },
                        { name: 'mc_pps', label: 'Multicast pps', type: 'text', validate: 'posint', placeholder: '1000', hint: 'multicast-suppression packets', why: "Multicast yoğun bir segmentte (ör. kamera VLAN'ı) eşik düşük tutulursa görüntü akışları kesilir." },
                        { name: 'uc_pps', label: 'Bilinmeyen Unicast pps', type: 'text', validate: 'posint', placeholder: '1000', hint: 'unicast-suppression packets', why: "Bilinmeyen unicast flood'u normalde kısa sürelidir; sürekli yüksekse MAC tablosunda yaşlanma veya asimetrik yol sorunu vardır — sınır semptomu hafifletir, nedeni ayrıca araştırın." }
                    ]
                },
                {
                    title: 'Storm Control (pps)',
                    icon: 'fas fa-bolt',
                    showFor: ['storm'],
                    warn: 'Storm control ile traffic suppression aynı pakette aynı anda kullanılmamalıdır; birini seçin.',
                    fields: [
                        { name: 'sc_type', label: 'Paket Tipi', type: 'select', options: [
                            { value: 'broadcast', label: 'broadcast', selected: true },
                            { value: 'multicast', label: 'multicast' },
                            { value: 'unicast', label: 'unicast (bilinmeyen)' }
                        ], hint: 'Eşiğin uygulanacağı paket tipi', why: "Storm control her paket tipi için ayrı eşik tutar. Döngü kaynaklı fırtınalarda ilk yükselen broadcast trafiğidir; önce broadcast için eşik tanımlamak en yüksek faydayı sağlar." },
                        { name: 'sc_min', label: 'Alt Eşik (pps)', type: 'text', validate: 'posint', requiredIf: { field: '_cgtype', in: ['storm'] }, placeholder: '1000', hint: 'min-rate — bloklanan port bu değerin altına inince açılır', why: "Alt eşik üst eşiğe çok yakınsa port sürekli blok/açık arasında gidip gelir (flapping). Aralarında belirgin fark bırakın." },
                        { name: 'sc_max', label: 'Üst Eşik (pps)', type: 'text', validate: 'posint', requiredIf: { field: '_cgtype', in: ['storm'] }, placeholder: '2000', hint: 'max-rate — aşılınca eylem uygulanır', why: "Üst eşik, portun normal tepe trafiğinin üzerinde olmalıdır; aksi halde sabah oturum açma saatlerindeki meşru ARP/DHCP patlaması portu kapatır." },
                        { name: 'sc_action', label: 'Eylem', type: 'select', options: [
                            { value: 'block', label: 'block — eşik altına inince kendiliğinden açılır', selected: true },
                            { value: 'error-down', label: 'error-down — port kapanır' }
                        ], hint: 'storm-control action', why: "<b>error-down</b> portu tamamen kapatır ve otomatik kurtarma tanımlı değilse elle <code>shutdown</code>/<code>undo shutdown</code> gerekir; uzaktaki bir şubede bu, saha ziyareti demektir. <b>block</b> yalnızca o tipteki paketleri geçici olarak durdurur." },
                        { name: 'sc_log', label: 'Olayı logla (storm-control enable log)', type: 'checkbox', checked: true, why: "Log olmadan port bloklandığında kullanıcı yalnızca 'ağ gitti geldi' der; hangi portta fırtına olduğunu bulmak için log kaydı tek ipucudur." }
                    ]
                }
            ],
            submit: 'Storm Control Oluştur'
        }, (data) => {
            const t = data._cgtype || 'pct', ifs = _hwvrpIfList(data.ifs);
            let body = '';
            if (t === 'pct') {
                const bc = cgEsc(data.bc_pct || ''), mc = cgEsc(data.mc_pct || ''), uc = cgEsc(data.uc_pct || '');
                if (bc) body += ' broadcast-suppression ' + bc + '\n';
                if (mc) body += ' multicast-suppression ' + mc + '\n';
                if (uc) body += ' unicast-suppression ' + uc + '\n';
            } else if (t === 'pps') {
                const bc = cgEsc(data.bc_pps || ''), mc = cgEsc(data.mc_pps || ''), uc = cgEsc(data.uc_pps || '');
                if (bc) body += ' broadcast-suppression packets ' + bc + '\n';
                if (mc) body += ' multicast-suppression packets ' + mc + '\n';
                if (uc) body += ' unicast-suppression packets ' + uc + '\n';
            } else {
                const ty = cgEsc(data.sc_type || 'broadcast'), mn = cgEsc(data.sc_min || ''), mx = cgEsc(data.sc_max || '');
                const act = cgEsc(data.sc_action || 'block');
                if (mn && mx) {
                    if (+mn >= +mx) body += ' # UYARI: alt eşik üst eşikten küçük olmalı\n';
                    body += ' storm-control ' + ty + ' min-rate ' + mn + ' max-rate ' + mx + '\n';
                    body += ' storm-control action ' + act + '\n';
                    if (data.sc_log) body += ' storm-control enable log\n';
                }
            }
            let c = '# ========================================\n# Huawei VRP — Storm Control / Traffic Suppression\n# ========================================\n\n';
            if (!body) return c + '# UYARI: en az bir eşik değeri girin.\n';
            c += 'system-view\n';
            const plain = [];
            ifs.forEach(i => {
                if (i.range) { c += '# UYARI: aralık girilemez, portları tek tek yazın: ' + i.name + '\n'; return; }
                plain.push(i.name);
                c += 'interface ' + i.name + '\n' + body + ' quit\n';
            });
            c += '#\n\n# Doğrulama:\n';
            if (t === 'storm') c += '# display storm-control\n';
            else plain.forEach(n => { c += '# display flow-suppression interface ' + n + '\n'; });
            return c;
        });
    }
};

// ── Huawei VRP: VTY / User-interface ─────────────────────────────────────────
// Sözdizimi: canlı config (1 cihaz: user-interface maximum-vty, user-interface vty 0 4, acl N inbound,
//            authentication-mode aaa, user privilege level, idle-timeout M S, protocol inbound ssh,
//            stelnet server enable, acl number 2xxx / rule N permit source A W / rule N deny)
HuaweiVRP.vty = {
    label: 'VTY / Yönetim Erişimi',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'VTY / User-interface (Huawei VRP)',
                desc: 'Uzaktan yönetim hatlarını sıkılaştırır: yalnız SSH, AAA doğrulama, yönetim ağına ACL kısıtı, oturum zaman aşımı ve VTY sayısı. Yerel kullanıcıyı <b>SSH / User</b> aracıyla oluşturun.'
            },
            sections: [
                {
                    title: 'VTY Hatları',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'vty_last', label: 'Son VTY Numarası', type: 'text', required: true, min: 0, max: 14, placeholder: '4', hint: 'user-interface vty 0 <N> (varsayılan 0-4)', why: "Ayarlar yalnızca bu aralıktaki hatlara uygulanır. maximum-vty artırılıp aralık genişletilmezse fazladan açılan hatlar eski (ör. telnet açık, ACL'siz) ayarlarla kalır ve saldırgan o hatlara düşer." },
                        { name: 'max_vty', label: 'Maksimum VTY', type: 'text', min: 0, max: 15, placeholder: '5', hint: 'user-interface maximum-vty', why: "Eşzamanlı oturum sayısını sınırlar. Çok düşük değer, arıza anında ikinci bir yöneticinin cihaza bağlanamamasına yol açar; çok yüksek değer kaba kuvvet denemelerine daha fazla paralel hat açar." },
                        { name: 'level', label: 'Kullanıcı Seviyesi', type: 'text', min: 0, max: 15, placeholder: '3', hint: 'user privilege level (AAA kullanıcısında seviye tanımlıysa o geçerlidir)', why: "Seviye 3 yönetici (manage) seviyesidir. Hat seviyesi yerel kullanıcıya seviye atanmamışsa devreye girer; burada 15 vermek seviyesiz tanımlanmış her kullanıcıyı tam yetkili yapar." }
                    ]
                },
                {
                    title: 'Güvenlik',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'idle_min', label: 'Zaman Aşımı (dakika)', type: 'text', min: 0, max: 35791, placeholder: '10', hint: 'idle-timeout <dk> 0', why: "Açık bırakılan yönetim oturumu, kilitlenmemiş bir PC'den cihaza doğrudan erişim demektir. <b>0</b> zaman aşımını tamamen kapatır; bunu üretimde kullanmayın." },
                        { name: 'acl_num', label: 'Yönetim ACL Numarası', type: 'text', min: 2000, max: 2999, placeholder: '2000', hint: 'Temel ACL (2000-2999); acl N inbound olarak VTY\'ye bağlanır', why: "ACL olmadan cihazın herhangi bir IP'sine SSH ile ulaşabilen herkes giriş ekranını görür ve parola denemesi yapabilir. Yönetimi yalnızca atlama sunucusu / NOC ağından kabul etmek saldırı yüzeyini ciddi daraltır." },
                        { name: 'acl_src', label: 'İzinli Yönetim Ağı', type: 'text', validate: 'ip', placeholder: '10.0.0.0', hint: 'ACL oluşturulacaksa izin verilen ağ adresi', why: "Kendi bağlı olduğunuz ağı listeye eklemeyi unutursanız ACL uygulandığı anda mevcut oturum dışında cihaza bir daha bağlanamazsınız. Uygulamadan önce kaynak IP'nizin bu ağda olduğunu doğrulayın." },
                        { name: 'acl_wc', label: 'Wildcard', type: 'text', validate: 'wildcard', placeholder: '0.0.0.255', hint: 'Ters maske (0.0.0.255 = /24, 0 = tek host)', why: "Huawei ACL'de ters maske kullanılır; 255.255.255.0 yazmak /24 değil neredeyse tüm adresleri eşleştirir ve kısıtı anlamsız hale getirir." },
                        { name: 'stelnet', label: 'stelnet server enable ekle', type: 'checkbox', checked: true, why: "VTY'de yalnızca SSH'a izin verilip SSH sunucusu etkin değilse hiçbir uzak protokol çalışmaz ve cihaz yalnızca konsoldan erişilebilir kalır." },
                        { name: 'con_aaa', label: 'Konsolda da AAA kullan', type: 'checkbox', checked: false, why: "Konsol varsayılan olarak ayrı bir parolayla korunur; AAA'ya bağlamak konsol girişlerini de kullanıcı bazlı kayıt altına alır. Ancak AAA'da çalışan bir yerel kullanıcı yoksa konsoldan da kilitlenirsiniz." }
                    ]
                }
            ],
            submit: 'VTY Konfigürasyonu Oluştur'
        }, (data) => {
            const last = cgEsc(data.vty_last || ''), maxv = cgEsc(data.max_vty || ''), lvl = cgEsc(data.level || '');
            const idle = cgEsc(data.idle_min || ''), acl = cgEsc(data.acl_num || ''), src = cgEsc(data.acl_src || ''), wc = cgEsc(data.acl_wc || '');
            let c = '# ========================================\n# Huawei VRP — VTY / User-interface\n# ========================================\n\n';
            c += 'system-view\n';
            if (data.stelnet) c += 'stelnet server enable\n';
            if (acl && src) {
                c += 'acl number ' + acl + '\n';
                c += ' rule 5 permit source ' + src + ' ' + (wc || '0') + '\n';
                c += ' rule 100 deny\n quit\n';
            }
            if (maxv) c += 'user-interface maximum-vty ' + maxv + '\n';
            c += 'user-interface vty 0 ' + last + '\n';
            if (acl) c += ' acl ' + acl + ' inbound\n';
            c += ' authentication-mode aaa\n';
            if (lvl) c += ' user privilege level ' + lvl + '\n';
            if (idle) c += ' idle-timeout ' + idle + ' 0\n';
            c += ' protocol inbound ssh\n quit\n';
            if (data.con_aaa) c += 'user-interface con 0\n authentication-mode aaa\n quit\n';
            c += '#\n';
            if (acl && !src) c += '# UYARI: ACL ' + acl + ' cihazda tanımlı değilse VTY kısıtı uygulanmaz.\n';
            c += '\n# Doğrulama:\n# display user-interface\n# display ssh server status\n';
            if (acl) c += '# display acl ' + acl + '\n';
            return c;
        });
    }
};

// ── Huawei VRP: iStack ───────────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000178165/3689aaf8/stack-configuration-commands
//            https://support.huawei.com/enterprise/en/doc/EDOC1000069608/c770df84/example-for-setting-up-a-stack-using-service-ports-v200r003-and-later-versions
//            (stack slot N priority P, stack slot N renumber M, interface stack-port N/1, port interface X enable)
HuaweiVRP.stack = {
    label: 'iStack',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'iStack (Huawei VRP V200)',
                desc: 'Servis portlarıyla yığın (stack) kurulumu — üye önceliği, stack ID ve mantıksal stack-port\'lara fiziksel port atama. Her üye için ayrı çalıştırın.'
            },
            sections: [
                {
                    title: 'Üye',
                    icon: 'fas fa-server',
                    warn: 'Bu araç S serisi V200 sözdizimini üretir. V600 (CloudEngine S) yazılımında stack yapılandırması <code>stack</code> görünümü altında yapılır ve komutlar farklıdır.',
                    fields: [
                        { name: 'slot', label: 'Mevcut Stack ID', type: 'text', required: true, min: 0, max: 8, placeholder: '0', hint: 'Tek başına çalışan switch için 0', why: "Komutlar cihazın <b>şu anki</b> stack ID'si ile yazılır. Yanlış ID girilirse komut başka bir üyeye uygulanır veya 'slot yok' hatası verir." },
                        { name: 'priority', label: 'Öncelik', type: 'text', min: 1, max: 255, placeholder: '200', hint: 'Varsayılan 100; master olacak üyeye en yüksek değer', why: "Master seçimi önce önceliğe bakar. Tüm üyeler varsayılan 100'de kalırsa master'ı MAC adresi belirler; yeniden başlatma sonrası beklenmedik bir üye master olur ve yönetim IP'si ile config o cihazdan yönetilir." },
                        { name: 'renumber', label: 'Yeni Stack ID', type: 'text', min: 0, max: 8, placeholder: '1', hint: 'Opsiyonel — ikinci/üçüncü üye için benzersiz ID', why: "İki üye aynı stack ID ile birleşemez; çakışan üye yığına katılmaz. Yeni ID ancak <code>save</code> ve yeniden başlatma sonrası geçerli olur ve port adları (Gi<b>1</b>/0/1) bu ID'ye göre değişir." }
                    ]
                },
                {
                    title: 'Stack Portları',
                    icon: 'fas fa-link',
                    info: 'Bir üyenin stack-port N/1\'i komşu üyenin stack-port N/2\'sine bağlanır (zincir veya halka).',
                    fields: [
                        { name: 'sp1_ifs', label: 'stack-port <ID>/1 Portları', type: 'text', validate: 'iface_range', required: true, placeholder: 'XGigabitEthernet0/0/3', hint: 'Virgülle ayırın', why: "Stack kablosu bağlı olan fiziksel port, mantıksal stack-port'a eklenmeden stack kurulmaz. Portu eklemek o porttaki mevcut servis konfigürasyonunu siler; üzerinde VLAN/IP olan bir portu seçmeyin." },
                        { name: 'sp2_ifs', label: 'stack-port <ID>/2 Portları', type: 'text', validate: 'iface_range', placeholder: 'XGigabitEthernet0/0/4', hint: 'Halka topoloji için ikinci stack-port', why: "Tek stack-port ile kurulan zincirde ortadaki bağlantı koparsa yığın ikiye bölünür (split) ve iki master oluşur. İkinci stack-port ile halka kurmak tek bağlantı arızasında yığını ayakta tutar." }
                    ]
                }
            ],
            submit: 'iStack Konfigürasyonu Oluştur'
        }, (data) => {
            const slot = cgEsc(data.slot || ''), prio = cgEsc(data.priority || ''), ren = cgEsc(data.renumber || '');
            const sp = [[1, _hwvrpIfList(data.sp1_ifs)], [2, _hwvrpIfList(data.sp2_ifs)]];
            let c = '# ========================================\n# Huawei VRP — iStack (V200)\n# ========================================\n\n';
            c += 'system-view\n';
            if (prio) c += 'stack slot ' + slot + ' priority ' + prio + '\n';
            sp.forEach(([n, list]) => {
                if (!list.length) return;
                c += 'interface stack-port ' + slot + '/' + n + '\n';
                list.forEach(i => {
                    if (i.range) { c += ' # UYARI: aralık girilemez, portları tek tek yazın: ' + i.name + '\n'; return; }
                    c += ' port interface ' + i.name + ' enable\n';
                });
                c += ' quit\n';
            });
            if (ren && ren !== slot) c += 'stack slot ' + slot + ' renumber ' + ren + '\n';
            c += '#\n# Not: port interface ... enable onay (Y) ister. Yeni stack ID save + reboot sonrası geçerli olur.\n';
            c += '\n# Doğrulama:\n# display stack\n# display stack configuration\n';
            return c;
        });
    }
};

// ── Huawei VRP: IGMP Snooping ────────────────────────────────────────────────
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000178169/d4cb9072/configuring-basic-vlan-based-igmp-snooping-functions
//            https://support.huawei.com/enterprise/en/doc/EDOC1000178165/992007f/vlan-based-igmp-snooping-configuration-commands
//            (igmp-snooping enable [global + vlan], igmp-snooping version, igmp-snooping querier enable)
HuaweiVRP.igmpsnoop = {
    label: 'IGMP Snooping',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'IGMP Snooping (Huawei VRP)',
                desc: 'Multicast trafiğini yalnızca üye portlara iletir (IPTV, kamera, yazılım dağıtımı). Global + VLAN bazında etkinleştirme, sürüm ve querier.'
            },
            sections: [
                {
                    title: 'VLAN Ayarları',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlans', label: 'VLAN(lar)', type: 'text', validate: 'vlan_list', required: true, placeholder: '10,20', hint: 'Virgül veya aralık (en fazla 128 VLAN)', why: "Global açmak tek başına yetmez; snooping yalnızca VLAN içinde de etkinleştirildiğinde çalışır. Etkin olmayan VLAN'da multicast broadcast gibi tüm portlara flood edilir." },
                        { name: 'version', label: 'IGMP Sürümü', type: 'select', options: [
                            { value: '', label: 'Varsayılan (v2)', selected: true },
                            { value: '1', label: 'v1' },
                            { value: '3', label: 'v3 (SSM)' }
                        ], hint: 'igmp-snooping version', why: "Varsayılan olarak switch IGMPv1/v2 mesajlarını işler, IGMPv3 raporlarını işlemez. Kaynağa özel (SSM) multicast kullanan istemciler v3 rapor gönderir; sürüm v3 yapılmazsa bu istemciler akışı hiç alamaz." },
                        { name: 'querier', label: 'Querier etkinleştir', type: 'checkbox', checked: false, why: "VLAN'da multicast router (PIM) yoksa kimse IGMP sorgusu göndermez; üyelik kayıtları zaman aşımına uğrar ve akış birkaç dakika sonra kesilir. Router olmayan L2 segmentlerde bir switch querier olmalıdır — ama VLAN başına yalnızca bir tane." }
                    ]
                }
            ],
            submit: 'IGMP Snooping Oluştur'
        }, (data) => {
            const vl = _hwvrpVlanExpand(data.vlans), ver = cgEsc(data.version || '');
            let c = '# ========================================\n# Huawei VRP — IGMP Snooping\n# ========================================\n\n';
            if (!vl || !vl.length) return c + '# UYARI: 1-128 VLAN girin.\n';
            c += 'system-view\nigmp-snooping enable\n';
            vl.forEach(v => {
                const id = cgEsc(v);
                c += 'vlan ' + id + '\n igmp-snooping enable\n';
                if (ver) c += ' igmp-snooping version ' + ver + '\n';
                if (data.querier) c += ' igmp-snooping querier enable\n';
                c += ' quit\n';
            });
            c += '#\n\n# Doğrulama:\n# display igmp-snooping port-info\n# display igmp-snooping router-port vlan ' + cgEsc(vl[0]) + '\n';
            return c;
        });
    }
};

// ── Huawei VRP: STP Port Koruması ────────────────────────────────────────────
// Mevcut 'mstp' aracı mod/priority/instance/edged-port'u kapsar; bu araç yalnız koruma özelliklerini ekler.
// Sözdizimi: https://support.huawei.com/enterprise/en/doc/EDOC1000178168/eb3f0a3b/configuring-bpdu-protection-on-a-switch
//            https://support.huawei.com/enterprise/en/doc/EDOC1000178168/5316b17/configuring-root-protection-on-an-interface
//            https://support.huawei.com/enterprise/en/doc/EDOC1000178168/1866ae9a/configuring-loop-protection-on-a-port
//            (stp bpdu-protection [global], stp edged-port enable, stp root-protection, stp loop-protection,
//             error-down auto-recovery cause bpdu-protection interval N)
HuaweiVRP.stpguard = {
    label: 'STP Port Koruması',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'STP Port Koruması (Huawei VRP)',
                desc: 'Edge port + BPDU koruması (erişim portları), root koruması (aşağı yönlü portlar), loop koruması (root/alternate portlar) ve BPDU korumasından otomatik kurtarma.'
            },
            sections: [
                {
                    title: 'Erişim Portları (Edge + BPDU Protection)',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'edge_ifs', label: 'Edge Port(lar)', type: 'text', validate: 'iface_range', placeholder: 'GigabitEthernet0/0/1', hint: 'Virgülle ayırın; stp edged-port enable', why: "Edge port, bağlandığı anda forwarding'e geçer; PC'lerin DHCP zaman aşımına düşmesini önler. Switch'e giden bir portu edge yapmak ise geçici döngü riski yaratır." },
                        { name: 'bpdu_prot', label: 'BPDU Protection (global)', type: 'checkbox', checked: true, why: "BPDU protection global bir komuttur ve yalnızca edge portlara etki eder: edge porta BPDU gelirse port error-down olur. Böylece kullanıcının masasına taktığı bir switch STP topolojisini değiştiremez." },
                        { name: 'recovery', label: 'Otomatik Kurtarma (sn)', type: 'text', min: 30, max: 86400, placeholder: '300', hint: 'error-down auto-recovery cause bpdu-protection interval', why: "Kurtarma tanımlanmazsa BPDU protection ile kapanan port elle <code>shutdown</code>/<code>undo shutdown</code> yapılana kadar kapalı kalır. Çok kısa aralık ise döngü kaynağı hâlâ takılıyken portun sürekli açılıp kapanmasına yol açar." }
                    ]
                },
                {
                    title: 'Omurga Portları',
                    icon: 'fas fa-sitemap',
                    info: 'Root protection ve loop protection aynı portta birlikte kullanılamaz.',
                    fields: [
                        { name: 'root_ifs', label: 'Root Protection Port(lar)', type: 'text', validate: 'iface_range', placeholder: 'GigabitEthernet0/0/10', hint: 'Root bridge\'de aşağı yönlü (designated) portlar', why: "Aşağıdaki bir switch'e yanlışlıkla düşük priority verilirse root rolünü ele geçirir ve tüm trafik o cihaz üzerinden dolaşır. Root protection bu portlardan gelen üstün BPDU'yu yok sayıp portu bloklar." },
                        { name: 'loop_ifs', label: 'Loop Protection Port(lar)', type: 'text', validate: 'iface_range', placeholder: 'GigabitEthernet0/0/24', hint: 'Root ve alternate (uplink) portlar', why: "Tek yönlü fiber arızasında port BPDU alamaz, alternate port yanlışlıkla forwarding'e geçer ve döngü oluşur. Loop protection BPDU kesilince portu forwarding'e almak yerine bloklu tutar." }
                    ]
                }
            ],
            submit: 'STP Korumasını Oluştur'
        }, (data) => {
            const edge = _hwvrpIfList(data.edge_ifs), root = _hwvrpIfList(data.root_ifs), loop = _hwvrpIfList(data.loop_ifs);
            const rec = cgEsc(data.recovery || '');
            let c = '# ========================================\n# Huawei VRP — STP Port Koruması\n# ========================================\n\n';
            if (!edge.length && !root.length && !loop.length && !data.bpdu_prot) return c + '# UYARI: en az bir koruma seçin.\n';
            c += 'system-view\n';
            if (data.bpdu_prot) c += 'stp bpdu-protection\n';
            if (data.bpdu_prot && rec) c += 'error-down auto-recovery cause bpdu-protection interval ' + rec + '\n';
            const rootNames = new Set(root.map(i => i.name));
            const put = (list, cmd) => list.forEach(i => {
                if (i.range) { c += '# UYARI: aralık girilemez, portları tek tek yazın: ' + i.name + '\n'; return; }
                if (cmd === 'stp loop-protection' && rootNames.has(i.name)) { c += '# UYARI: ' + i.name + ' root protection ile çakışıyor, loop protection atlandı\n'; return; }
                c += 'interface ' + i.name + '\n ' + cmd + '\n quit\n';
            });
            put(edge, 'stp edged-port enable');
            put(root, 'stp root-protection');
            put(loop, 'stp loop-protection');
            if (!data.bpdu_prot && edge.length) c += '# UYARI: BPDU protection kapalı — edge porta takılan switch topolojiyi etkileyebilir.\n';
            c += '#\n\n# Doğrulama:\n# display stp brief\n';
            return c;
        });
    }
};
