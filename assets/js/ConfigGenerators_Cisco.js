'use strict';

const CiscoIOS = {};

// ── VLAN ──────────────────────────────────────────────────────────────────────
CiscoIOS.vlan = {
    label: 'VLAN',
    // Sitedeki tek elle yazilmis formdu. Form oluşturucuya tasindi: kural karti,
    // sebep mesaji, kosullu zorunluluk ve etiketli uyarilar diger araclarla ayni.
    // Eski canli onizleme bos metin alanlarina placeholder'i ('Örn: ...') aynen
    // yaziyordu -> 'interface Örn: GigabitEthernet0/1' ciktisi uretiyordu.
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'VLAN — Virtual Local Area Network',
                desc: 'Fiziksel ağı mantıksal bölümlere ayırarak güvenlik, performans ve yönetim kolaylığı sağlar. Her VLAN ayrı bir broadcast domain\'dir. <strong>Access portlar</strong> tek bir VLAN\'a, <strong>trunk portlar</strong> birden fazla VLAN\'a hizmet eder.'
            },
            configTypes: [
                { id: 'basic', label: 'Tek Port VLAN', icon: 'fas fa-ethernet', desc: 'Tek interface\'e VLAN ata — access veya trunk modu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'batch', label: 'Toplu VLAN', icon: 'fas fa-layer-group', desc: 'Birden fazla VLAN\'ı tek seferde oluştur', badge: { text: 'Toplu', cls: 'common' } },
                { id: 'unused', label: 'Kullanılmayan Portlar', icon: 'fas fa-power-off', desc: 'Boştaki portları park VLAN\'ına al ve kapat', badge: { text: 'Güvenlik', cls: 'security' } },
                { id: 'svi', label: 'SVI Arayüzü', icon: 'fas fa-sitemap', desc: 'Layer-3 VLAN arayüzü — inter-VLAN routing', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN Kimliği', icon: 'fas fa-id-card', showFor: ['basic'],
                    fields: [
                        { name: 'vlan_id', why: 'VLAN 1 varsayılandır ve güvenlik açısından kullanılmamalıdır.', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Oluşturulacak VLAN numarası' },
                        { name: 'vlan_name', why: 'VLAN adı yalnızca okunabilirlik içindir ama 4094 VLAN\'lı bir ağda adsız VLAN yönetilemez hale gelir.', label: 'VLAN Adı', type: 'text', placeholder: 'SALES_VLAN', hint: 'Boşluk yerine alt çizgi (_) kullanın; boşluklar otomatik alt çizgiye çevrilir' }
                    ]
                },
                {
                    title: 'Interface Ayarları', icon: 'fas fa-plug', showFor: ['basic'],
                    fields: [
                        { name: 'interface', why: 'Access port tek VLAN taşır. <code>switchport mode access</code> açıkça yazılmazsa port DTP ile kendiliğinden trunk olabilir — güvenlik riski.', label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'VLAN\'ın atanacağı fiziksel port. Gi0/1 kısa gösterimi de kullanılabilir.', tooltip: 'GigabitEthernet0/1, FastEthernet0/1 veya kısa gösterim Gi0/1 kullanılabilir.' },
                        { name: 'port_desc', why: 'Açıklamasız port, arıza anında hangi cihazın bağlı olduğunu kablo takibi yapmadan bilmeyi imkânsız kılar.', label: 'Port Açıklaması', type: 'text', placeholder: 'PC-Muhasebe-01', hint: 'description — boş = yazılmaz' },
                        { name: 'sw_mode', label: 'Switchport Mode', type: 'select', options: [
                            { value: 'access', label: 'Access — Tek VLAN (son kullanıcı portu)', selected: true },
                            { value: 'trunk', label: 'Trunk — Çoklu VLAN (switch/router arası)' }
                        ], hint: 'Access: bilgisayar/yazıcı gibi son cihazlar. Trunk: iki switch veya switch-router arası bağlantı.' },
                        { name: 'access_vlan', why: 'Porttan gelen etiketsiz trafik bu VLAN\'a ait sayılır.', label: 'Access VLAN', type: 'text', validate: 'vlan', requiredIf: { field: 'sw_mode', in: ['access'] }, placeholder: '10', hint: 'Yalnızca Access modunda kullanılır' },
                        { name: 'voice_vlan', why: 'IP telefon ses trafiğini ayrı VLAN\'da etiketli taşır, PC aynı portta data VLAN\'ında kalır. QoS ve güvenlik ayrımı bu sayede yapılır.', label: 'Voice VLAN', type: 'text', validate: 'vlan', placeholder: '20', hint: 'Yalnız Access modunda — IP telefon portları için' },
                        { name: 'allowed_vlans', why: 'Boş bırakılırsa trunk tüm VLAN\'ları taşır. Daraltmak hem broadcast\'i hem saldırı yüzeyini azaltır.', label: 'Allowed VLANs', type: 'text', validate: 'vlan_list', placeholder: '10,20,30-40', hint: 'Yalnızca Trunk modunda kullanılır — boş = tüm VLAN\'lar' },
                        { name: 'nonegotiate', why: 'DTP pazarlığını kapatır; karşı uçtaki bir cihazın portu kendiliğinden trunk\'a çevirmesini (VLAN hopping) engeller.', label: 'switchport nonegotiate (yalnızca Trunk)', type: 'checkbox' },
                        { name: 'portfast', label: 'PortFast etkinleştir (yalnızca Access)', type: 'checkbox', tooltip: 'STP bekleme süresini atlayarak portu hızlı aktif eder. SADECE son kullanıcı portlarında kullanın — switch-switch bağlantısında döngüye neden olur.' },
                        { name: 'save_config', label: 'write memory ekle (konfigürasyonu NVRAM\'e kalıcı kaydet)', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Toplu VLAN Oluşturma', icon: 'fas fa-list-ol', showFor: ['batch'],
                    info: 'Birden fazla VLAN\'ı tek seferde oluşturur. Virgülle ayırın, aralık için tire (-) kullanın.',
                    fields: [
                        { name: 'batch_vlans', label: 'VLAN ID Listesi', type: 'text', validate: 'vlan_list', required: true, placeholder: '10,20,30-40,100', hint: 'Her ID ayrı bir vlan bloğu olarak yazılır' },
                        { name: 'batch_prefix', label: 'İsim Öneki', type: 'text', placeholder: 'DATA_VLAN_', hint: 'VLAN ID otomatik eklenir: DATA_VLAN_10, DATA_VLAN_20...' }
                    ]
                },
                {
                    title: 'Kullanılmayan Portlar', icon: 'fas fa-power-off', showFor: ['unused'],
                    info: 'Boştaki portlar kapalı ve kullanılmayan bir "park" VLAN\'ında tutulur; biri kablo taksa bile ağa erişemez.',
                    fields: [
                        { name: 'unused_ports', label: 'Portlar', type: 'text', validate: 'iface_range', required: true, placeholder: 'GigabitEthernet1/0/40-48', hint: 'Aralık veya virgülle liste' },
                        { name: 'park_vlan', why: 'Park VLAN\'ının hiçbir trunk\'ta izinli olmaması ve SVI\'sinin olmaması gerekir.', label: 'Park VLAN', type: 'text', validate: 'vlan', placeholder: '999', hint: 'Boş = VLAN ataması yapılmaz, yalnız kapatılır' },
                        { name: 'unused_desc', label: 'Açıklama', type: 'text', placeholder: 'KULLANILMIYOR', hint: 'description' }
                    ]
                },
                {
                    title: 'SVI — Layer-3 VLAN Arayüzü', icon: 'fas fa-sitemap', showFor: ['svi'],
                    info: 'SVI (Switched Virtual Interface), VLAN\'a IP adresi atayarak switch üzerinde Layer-3 routing sağlar. Inter-VLAN routing için her VLAN\'ın bir SVI\'ya ihtiyacı vardır.',
                    fields: [
                        { name: 'svi_vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Bu VLAN switch\'te tanımlı olmalıdır' },
                        { name: 'svi_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.1', hint: 'VLAN içindeki cihazların default gateway\'i' },
                        { name: 'svi_mask', label: 'Subnet Mask', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.255.0', hint: '/24 için 255.255.255.0, /25 için 255.255.255.128' },
                        { name: 'svi_desc', label: 'Açıklama', type: 'text', placeholder: 'SALES VLAN Gateway', hint: 'Interface description olarak eklenir' }
                    ]
                }
            ],
            submit: 'VLAN Konfigürasyonu Oluştur'
        }, (data) => cgVlanGenerate(data));
    }
};

function cgVlanGenerate(data) {
    const fv = n => String(data[n] == null ? '' : data[n]).trim();
    const type = data._cgtype;
    let config = '! ========================================\n! Cisco IOS VLAN Configuration\n! ========================================\n\n';
    if (type === 'basic') {
        const vlanId = fv('vlan_id'), vlanName = fv('vlan_name'), iface = fv('interface'), mode = fv('sw_mode');
        config += 'vlan ' + vlanId + '\n';
        if (vlanName) config += ' name ' + vlanName.replace(/\s+/g,'_') + '\n';
        config += '!\ninterface ' + iface + '\n';
        if (fv('port_desc')) config += ' description ' + fv('port_desc') + '\n';
        if (mode === 'access') {
            config += ' switchport mode access\n switchport access vlan ' + fv('access_vlan') + '\n';
            if (fv('voice_vlan')) config += ' switchport voice vlan ' + fv('voice_vlan') + '\n';
            if (data.portfast) config += ' spanning-tree portfast\n';
        } else {
            const allowed = fv('allowed_vlans');
            config += ' switchport mode trunk\n switchport trunk encapsulation dot1q\n';
            if (allowed) config += ' switchport trunk allowed vlan ' + allowed + '\n';
            if (data.nonegotiate) config += ' switchport nonegotiate\n';
            config += '! Not: native VLAN 1 güvenlik riski — trunk\'ta farklı bir native VLAN kullanın.\n';
        }
        config += ' no shutdown\n!\n';
        if (data.save_config) config += 'write memory\n';
        config += '\n! Doğrulama:\n! show vlan brief\n! show interfaces trunk\n! show interfaces ' + iface + ' switchport\n';
    } else if (type === 'batch') {
        const parts = fv('batch_vlans').split(',').map(s => s.trim()).filter(Boolean);
        const prefix = fv('batch_prefix');
        parts.forEach(p => {
            const m = p.match(/^(\d+)\s*-\s*(\d+)$/);
            if (m) { for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++) config += 'vlan ' + i + '\n' + (prefix ? ' name ' + prefix + i + '\n' : '') + '!\n'; }
            else config += 'vlan ' + p + '\n' + (prefix ? ' name ' + prefix + p + '\n' : '') + '!\n';
        });
        config += '\n! Doğrulama: show vlan brief\n';
    } else if (type === 'unused') {
        // 'Gi1/0/40-48, Gi1/0/50' -> interface range 'Gi1/0/40 - 48 , Gi1/0/50'
        const rng = fv('unused_ports').split(/[,\s]+/).filter(Boolean).map(p => p.replace(/^(.*\D)(\d+)-(\d+)$/, '$1$2 - $3')).join(' , ');
        config += 'interface range ' + rng + '\n';
        if (fv('unused_desc')) config += ' description ' + fv('unused_desc') + '\n';
        if (fv('park_vlan')) config += ' switchport mode access\n switchport access vlan ' + fv('park_vlan') + '\n';
        config += ' shutdown\n!\n';
        config += '\n! Doğrulama:\n! show interfaces status disabled\n';
    } else if (type === 'svi') {
        const sviId = fv('svi_vlan'), sviIp = fv('svi_ip'), sviMask = fv('svi_mask'), sviDesc = fv('svi_desc');
        // Aynı VLAN/SVI kuralı Dönüştürücü sekmesiyle paylaşılıyor (bkz. ConfigConverter_IR.js ccBuildCiscoVlanBlock)
        // — iki sekme farklı çıktı üretmesin diye.
        config += ccBuildCiscoVlanBlock({ id: sviId, name: '', svi_ip: sviIp, svi_mask: sviMask, desc: sviDesc }, []);
        config += 'ip routing\n';
        config += '\n! Doğrulama:\n! show interface Vlan' + sviId + '\n! show ip route\n';
    }
    return config;
}

// ── ACL ───────────────────────────────────────────────────────────────────────
CiscoIOS.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL — Access Control List',
                desc: 'Ağ trafiğini kaynak/hedef IP, port ve protokole göre filtreler. <strong>Standard ACL</strong> yalnızca kaynağa, <strong>Extended ACL</strong> kaynak+hedef+port\'a göre filtreler.'
            },
            configTypes: [
                { id: 'standard', label: 'Standard ACL', icon: 'fas fa-list', desc: 'Kaynak IP filtresi (1-99)', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended ACL', icon: 'fas fa-filter', desc: 'Kaynak + Hedef + Port filtresi (100-199)', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'named', label: 'Named Extended', icon: 'fas fa-tag', desc: 'İsimli gelişmiş ACL — okunabilir ve düzenlenebilir', badge: { text: 'Esnek', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'ACL Kimliği',
                    icon: 'fas fa-id-card',
                    showFor: ['standard', 'extended', 'named'],
                    fields: [
                        { name: 'acl_name', why: "Numaralı ACL'lerde aralık anlamı taşır: 1-99 standart, 100-199 genişletilmiş. <b>İsimli ACL kullan</b> — sonradan araya satır ekleyebilirsin, numaralıda ACL'i silip baştan yazman gerekir.", label: 'ACL Ad / Numara', type: 'text', required: true, placeholder: 'ACL_PERMIT_WEB', hint: 'Standard: 1-99, Extended: 100-199, Named: metin isim — numaralı ACL için 1-99 / 100-199' }
                    ]
                },
                {
                    title: 'Kural Parametreleri',
                    icon: 'fas fa-sliders-h',
                    showFor: ['standard', 'extended', 'named'],
                    fields: [
                        { name: 'acl_action', why: "Cisco ACL'lerinin sonunda <b>görünmeyen bir <code>deny any</code></b> vardır. Yani en az bir <code>permit</code> yazmazsan tüm trafik düşer.", label: 'Aksiyon', type: 'select', required: true, options: [{ value: 'permit', label: 'permit — İzin ver' }, { value: 'deny', label: 'deny — Engelle' }] },
                        { name: 'protocol', why: "<code>ip</code> seçersen port alanları <b>hiç uygulanmaz</b>; port bazlı filtre için <code>tcp</code> ya da <code>udp</code> şart. ICMP'yi topyekûn kapatmak ise traceroute ve PMTU keşfini bozar.", label: 'Protokol', type: 'select', options: [{ value: 'ip', label: 'ip (tüm protokoller)' }, { value: 'tcp', label: 'tcp' }, { value: 'udp', label: 'udp' }, { value: 'icmp', label: 'icmp' }] },
                        { name: 'src_ip', why: "Ağ adresini yaz, içindeki bir host adresini değil. <code>192.168.1.5 0.0.0.255</code> yazarsan IOS satırı sessizce <code>192.168.1.0</code> olarak normalize eder ve config beklediğinden farklı görünür.", label: 'Kaynak IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.0', hint: 'Kaynak ağ adresi veya host IP' },
                        { name: 'src_wild', why: 'Cisco wildcard maskesi, subnet maskesinin <b>tersidir</b>: <code>255.255.255.0</code> → <code>0.0.0.255</code>. En sık yapılan hata normal maske yazmaktır.', label: 'Kaynak Wildcard', type: 'text', placeholder: '0.0.0.255', hint: 'Boş bırakılırsa 0.0.0.0 (host) kullanılır' }
                    ]
                },
                {
                    title: 'Hedef ve Port (Extended/Named)',
                    icon: 'fas fa-bullseye',
                    showFor: ['extended', 'named'],
                    info: 'Standard ACL yalnızca kaynağa göre filtreler, bu alanlar Standard için kullanılmaz.',
                    fields: [
                        { name: 'dst_ip', why: "Boş bırakmak <code>any</code> demektir; kural tüm hedeflere açılır. Hedefi daraltmadan yazılan <code>permit</code>, ACL'i düşündüğünden çok daha geniş yapar.", label: 'Hedef IP', type: 'text', validate: 'ip', placeholder: '10.0.0.10', hint: 'Boş bırakılırsa hedef "any" olur — boş = any' },
                        { name: 'dst_wild', why: 'Tek host için <code>0.0.0.0</code> (ya da <code>host</code> anahtar kelimesi). Yanlış wildcard, kuralın beklenenden çok daha geniş eşleşmesine yol açar.', label: 'Hedef Wildcard', type: 'text', placeholder: '0.0.0.0', hint: 'Boş bırakılırsa 0.0.0.0 (host) kullanılır' },
                        { name: 'src_port', why: "Kaynak port neredeyse her zaman rastgeledir (ephemeral). Buraya <code>eq 443</code> yazmak klasik hatadır: sunucu portu <b>hedef</b> porttur ve kural hiç eşleşmez.", label: 'Kaynak Port (opsiyonel)', type: 'text', validate: 'port_match', placeholder: 'eq 1024', hint: 'Örn: eq 1024, gt 1023 — yalnızca tcp/udp' },
                        { name: 'dst_port', why: "Yalnızca <code>tcp</code>/<code>udp</code> ile çalışır; protokol <code>ip</code> iken yazılan port satırı kabul edilmez. <code>range</code> kullanırken aralığın iki ucunun da dahil olduğunu unutma.", label: 'Hedef Port (opsiyonel)', type: 'text', validate: 'port_match', placeholder: 'eq 443', hint: 'Örn: eq 443, range 8000 8080 — yalnızca tcp/udp' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    showFor: ['standard', 'extended', 'named'],
                    info: 'Interface belirtilmezse ACL yalnızca tanımlanır, uygulanmaz.',
                    fields: [
                        { name: 'iface', why: "ACL'i tanımlamak onu <b>uygulamaz</b>. <code>ip access-group</code> ile bir arayüze bağlamadığın sürece tek bir paketi bile etkilemez — en sık atlanan adımdır.", label: 'Interface', type: 'text', validate: 'iface', placeholder: 'GigabitEthernet0/0', hint: 'ACL\'in uygulanacağı interface. Boş bırakılabilir. — boş = hiçbir arayüze uygulanmaz' },
                        { name: 'direction', why: '<code>in</code> arayüze <b>giren</b>, <code>out</code> <b>çıkan</b> trafiği süzer. Yanlış yön en yaygın ACL hatasıdır — filtrelemeyi kaynağa en yakın noktada yapmak iyi pratiktir.', label: 'Yön', type: 'select', options: [{ value: 'in', label: 'in — Gelen trafik' }, { value: 'out', label: 'out — Giden trafik' }] }
                    ]
                }
            ],
            submit: 'ACL Konfigürasyonu Oluştur'
        }, (data) => {
            const type  = data.acl_name && isNaN(data.acl_name) ? 'named' : (data._cgtype || 'standard');
            const name  = data.acl_name;
            const action = data.acl_action;
            const proto  = data.protocol || 'ip';
            const src    = data.src_ip;
            const wild   = data.src_wild || '0.0.0.0';
            const iface  = data.iface;
            const dir    = data.direction || 'in';
            let config = '! ========================================\n! Cisco IOS ACL Configuration\n! ========================================\n\n';
            if (data._cgtype === 'named' || isNaN(name)) {
                // Extended/Named ACL: aynı 5-tuple satırı Dönüştürücü'nün ccFormatAclEntryWildcard'ı ile paylaşılıyor,
                // yalnızca "kaynak" yazan eski davranış burada terk edildi.
                const srcAddr = wild === '0.0.0.0' ? 'host ' + src : src + ' ' + wild;
                const dstIp   = data.dst_ip;
                const dstWild = data.dst_wild || '0.0.0.0';
                const dstAddr = dstIp ? (dstWild === '0.0.0.0' ? 'host ' + dstIp : dstIp + ' ' + dstWild) : 'any';
                config += 'ip access-list extended ' + name + '\n';
                config += ' ' + ccFormatAclEntryWildcard({ action, proto, src: srcAddr, dst: dstAddr, src_port: data.src_port, dst_port: data.dst_port }) + '\n';
                config += ' deny ip any any log\n!\n';
            } else {
                config += 'access-list ' + name + ' ' + action + ' ' + src + ' ' + wild + '\n!\n';
            }
            if (iface) {
                config += 'interface ' + iface + '\n';
                config += ' ip access-group ' + name + ' ' + dir + '\n!\n';
            }
            config += '! Doğrulama:\n! show ip access-lists ' + name + '\n! show interfaces ' + (iface || '<iface>') + ' | include access list\n';
            return config;
        });
    }
};

// ── NAT / PAT ─────────────────────────────────────────────────────────────────
CiscoIOS.nat = {
    label: 'NAT / PAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT — Network Address Translation',
                desc: 'Özel IP adreslerini genel IP\'lere çevirir. <strong>Static NAT</strong>: 1-1 eşleme. <strong>Dynamic NAT</strong>: havuzdan atama. <strong>PAT (Overload)</strong>: tek IP üzerinde port bazlı çoğullama.'
            },
            configTypes: [
                { id: 'pat', label: 'PAT / Overload', icon: 'fas fa-compress-arrows-alt', desc: 'Tek genel IP ile tüm iç ağ — en yaygın kullanım', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: '1:1 IP eşleme — sunucu erişimi için', badge: { text: 'Sunucu', cls: 'common' } },
                { id: 'dynamic', label: 'Dynamic NAT', icon: 'fas fa-random', desc: 'IP havuzundan dinamik atama', badge: { text: 'Havuz', cls: 'advanced' } },
                { id: 'portfwd', label: 'Port Forwarding', icon: 'fas fa-share', desc: 'Dış port → iç sunucu:port (static PAT)', badge: { text: 'Sunucu', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-plug',
                    showFor: ['pat', 'static', 'dynamic', 'portfwd'],
                    fields: [
                        { name: 'inside_if', why: 'NAT çalışması için arayüzlerin <code>ip nat inside</code> / <code>ip nat outside</code> olarak işaretlenmesi <b>zorunludur</b>. Eksikse NAT hiç devreye girmez ve sorun çok geç fark edilir.', label: 'Inside Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'İç ağa bağlı interface — ip nat inside uygulanır' },
                        { name: 'outside_if', why: "Dışarı bakan arayüz. Birden fazla WAN varsa yanlış seçim trafiğin NAT'lanmadan çıkmasına ve karşı tarafta düşmesine yol açar.", label: 'Outside Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0', hint: 'İnternet/WAN interface — ip nat outside uygulanır' }
                    ]
                },
                {
                    title: 'PAT / Dynamic NAT Parametreleri',
                    icon: 'fas fa-network-wired',
                    showFor: ['pat', 'dynamic'],
                    fields: [
                        { name: 'inside_net', why: "NAT ACL'i <b>hangi kaynakların</b> çevrileceğini belirler. Fazla geniş yazmak (örn. <code>any</code>) VPN trafiğini de NAT'lar ve tünelin içinden hiçbir şey geçmez.", label: 'Inside Network', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.0', hint: 'NAT uygulanacak iç ağ adresi' },
                        { name: 'inside_wild', why: "Burada da wildcard maske kullanılır, subnet maske değil. NAT ACL'i çok geniş olursa istemediğin trafiği de NAT'larsın (ör. VPN trafiği).", label: 'Wildcard Mask', type: 'text', validate: 'wildcard', required: true, placeholder: '0.0.0.255', hint: 'NAT uygulanacak iç ağın wildcard maskesi (/24 = 0.0.0.255)' }
                    ]
                },
                {
                    title: 'Static NAT Parametreleri',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['static'],
                    fields: [
                        { name: 'local_ip', why: "Çevrilecek gerçek iç adres. Aynı adres için hem static NAT hem dinamik PAT tanımlamak beklenmedik davranışa yol açar; static her zaman önceliklidir.", label: 'Local IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.10', hint: 'Sunucunun iç (özel) IP adresi' },
                        { name: 'global_ip', why: "Dışarıya görünen adres. WAN arayüzünün kendi IP'sini buraya yazarsan cihazın uzaktan yönetimi (SSH/VPN) kopabilir — mümkünse ayrı bir genel IP kullan.", label: 'Global IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.5', hint: 'Dışarıdan erişilecek genel IP adresi' }
                    ]
                },
                {
                    title: 'Port Forwarding',
                    icon: 'fas fa-share',
                    showFor: ['portfwd'],
                    info: 'Dışarıdan gelen <code>genel adres:port</code> isteğini iç sunucunun <code>IP:port</code>\'una yönlendirir. Genel adres olarak outside arayüzünün kendi IP\'si (dinamik IP\'li hatlarda) veya sabit bir genel IP kullanılabilir.',
                    fields: [
                        { name: 'pf_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'pf_local_ip', why: 'Sunucunun iç IP\'si sabit olmalı (statik veya DHCP rezervasyonu); değişirse yönlendirme sessizce boşa düşer.', label: 'İç Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Trafiğin yönlendirileceği iç sunucu' },
                        { name: 'pf_local_port', label: 'İç Port', type: 'text', validate: 'port', required: true, placeholder: '80', hint: 'Sunucunun dinlediği port' },
                        { name: 'pf_global', label: 'Genel Adres', type: 'select', options: [
                            { value: 'interface', label: 'Outside arayüzünün IP\'si', selected: true },
                            { value: 'ip', label: 'Sabit genel IP' }
                        ], hint: 'Dinamik IP\'li hatlarda arayüz seçeneği kullanılır' },
                        { name: 'pf_global_ip', label: 'Genel IP', type: 'text', validate: 'ip', requiredIf: { field: 'pf_global', in: ['ip'] }, placeholder: '203.0.113.5', hint: 'Yalnız "Sabit genel IP" seçiliyken' },
                        { name: 'pf_global_port', why: 'Dış port iç porttan farklı olabilir (8080 → 80). Aynı iç IP birden fazla kez yönlendirilecekse satır sonuna <code>extendable</code> eklenmesi gerekir.', label: 'Dış Port', type: 'text', validate: 'port', required: true, placeholder: '8080', hint: 'İnternetten erişilecek port' }
                    ]
                },
                {
                    title: 'Dynamic NAT Pool',
                    icon: 'fas fa-layer-group',
                    showFor: ['dynamic'],
                    info: 'Havuz aralığı gerçek, size ait genel IP bloğu olmalı — örnek/placeholder IP kullanmayın.',
                    fields: [
                        { name: 'pool_start', why: "Havuzun ilk adresi. Gateway, HSRP sanal IP'si ve statik sunucu adresleri gibi kullanımdaki IP'leri havuza dahil edersen çakışma kaçınılmazdır.", label: 'Pool Başlangıç IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.1', hint: 'Havuzdaki ilk genel IP' },
                        { name: 'pool_end', why: "Havuz tükendiğinde yeni oturumlar <b>sessizce</b> kurulamaz; hata log'da belirgin değildir. <code>show ip nat translations</code> ile doluluğu izle, küçük havuzlarda <code>overload</code> ekle.", label: 'Pool Bitiş IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.10', hint: 'Havuzdaki son genel IP' },
                        { name: 'pool_mask', why: "Havuz maskesi, adreslerin ait olduğu genel alt ağla eşleşmeli. Yanlış maske ISS'nin bu adresleri yönlendirmemesine ve dönüş trafiğinin kaybolmasına yol açar.", label: 'Pool Netmask', type: 'text', required: true, validate: 'netmask', placeholder: '255.255.255.240', hint: 'Genel IP bloğunun subnet maskı' }
                    ]
                }
            ],
            submit: 'NAT Konfigürasyonu Oluştur'
        }, (data) => {
            const type    = data._cgtype;
            const inside  = data.inside_if;
            const outside = data.outside_if;
            let config = '! ========================================\n! Cisco IOS NAT Configuration\n! ========================================\n\n';
            config += 'interface ' + inside + '\n ip nat inside\n!\ninterface ' + outside + '\n ip nat outside\n!\n';
            if (type === 'pat') {
                const net  = data.inside_net;
                const wild = data.inside_wild;
                config += 'ip access-list extended NAT_ACL\n permit ip ' + net + ' ' + wild + ' any\n!\n';
                config += 'ip nat inside source list NAT_ACL interface ' + outside + ' overload\n';
            } else if (type === 'static') {
                config += 'ip nat inside source static ' + data.local_ip + ' ' + data.global_ip + '\n';
            } else if (type === 'portfwd') {
                const pub = data.pf_global === 'ip' ? data.pf_global_ip : 'interface ' + outside;
                config += 'ip nat inside source static ' + data.pf_proto + ' ' + data.pf_local_ip + ' ' + data.pf_local_port +
                          ' ' + pub + ' ' + data.pf_global_port + '\n';
            } else {
                const net  = data.inside_net;
                const wild = data.inside_wild;
                config += 'ip nat pool NAT_POOL ' + data.pool_start + ' ' + data.pool_end + ' netmask ' + data.pool_mask + '\n';
                config += 'ip access-list extended NAT_ACL\n permit ip ' + net + ' ' + wild + ' any\n!\n';
                config += 'ip nat inside source list NAT_ACL pool NAT_POOL\n';
            }
            config += '\n! Doğrulama:\n! show ip nat translations\n! show ip nat statistics\n';
            return config;
        });
    }
};

// ── STATIC ROUTE ──────────────────────────────────────────────────────────────
CiscoIOS.route = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route — Statik Yönlendirme',
                desc: 'Manuel olarak tanımlanmış ağ yolları. Dinamik routing protokolü olmayan küçük ağlarda veya varsayılan rota (default route) tanımlamak için kullanılır.'
            },
            sections: [
                {
                    title: 'Rota Parametreleri',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'is_default', why: 'Varsayılan rota, eşleşmeyen tüm trafiği gönderir. Birden fazla default rota varsa AD değeri düşük olan kazanır — yedeklilik böyle kurulur.', label: 'Default route ekle (0.0.0.0/0)', type: 'checkbox', hint: 'İşaretlenirse hedef ağ/mask otomatik 0.0.0.0 olur' },
                        { name: 'dest', why: "Ağ adresi yazılmalı, host adresi değil. <code>0.0.0.0</code> + <code>0.0.0.0</code> default rotadır; mevcut bir default rota varsa hangisinin kazanacağını AD belirler.", label: 'Hedef Ağ', type: 'text', requiredIf: { field: 'is_default', checked: false }, placeholder: '10.0.0.0', hint: 'Ulaşılmak istenen hedef ağ adresi' },
                        { name: 'mask', why: "Maske hedefin <b>spesifikliğini</b> belirler ve her zaman en uzun eşleşme kazanır. Yanlış maske rotayı ya hiç kullandırmaz ya da istemediğin trafiği bu yola çeker.", label: 'Subnet Mask', type: 'text', requiredIf: { field: 'is_default', checked: false }, validate: 'subnet', placeholder: '255.255.255.0', hint: 'Hedef ağın subnet maskı' },
                        { name: 'nexthop', why: 'Next-hop <b>IP</b> vermek, arayüz adı vermekten güvenlidir. Ethernet gibi çoklu erişimli ağlarda sadece arayüz yazmak ARP fırtınasına ve yanlış yönlendirmeye yol açabilir.', label: 'Next Hop / Interface', type: 'text', validate: 'nexthop', required: true, placeholder: '192.168.1.1', hint: 'Paketlerin yönlendirileceği sonraki IP veya çıkış interface — IP veya çıkış arayüzü (örn: GigabitEthernet0/0)' },
                        { name: 'ad', why: 'Administrative Distance, aynı hedefe giden rotalar arasında tercih sırasını belirler (düşük kazanır). Yedek rotaya yüksek AD vermek klasik floating static route tekniğidir.', label: 'Administrative Distance', type: 'number', placeholder: '1 (varsayılan)', min: 1, max: 255, hint: 'Düşük değer = öncelikli. Floating route için yüksek değer (örn: 254) girin' }
                    ]
                }
            ],
            submit: 'Static Route Oluştur'
        }, (data) => {
            const isDefault = data.is_default === true;
            const dest = isDefault ? '0.0.0.0' : (data.dest || '');
            const mask = isDefault ? '0.0.0.0' : (data.mask || '');
            const hop  = data.nexthop;
            const ad   = data.ad;
            let config = '! ========================================\n! Cisco IOS Static Route\n! ========================================\n\n';
            config += ccBuildCiscoStaticRouteLine(dest, mask, hop, ad);
            config += '\n! Doğrulama:\n! show ip route\n! show ip route ' + dest + '\n';
            return config;
        });
    }
};

// ── OSPF ──────────────────────────────────────────────────────────────────────
CiscoIOS.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF — Open Shortest Path First',
                desc: 'Open Shortest Path First — link-state routing protokolü. Büyük ağlarda hızlı convergence ve hiyerarşik area yapısı sağlar.'
            },
            sections: [
                {
                    title: 'OSPF Parametreleri',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', why: 'Process ID <b>yereldir</b>, komşuyla aynı olmak zorunda değildir. Area numarası ve alan tipi ise eşleşmelidir.', label: 'Process ID', type: 'number', required: true, value: '1', min: 1, max: 65535, hint: 'Lokal anlamlı — farklı router\'larda aynı olmak zorunda değil' },
                        { name: 'rid', why: "Router ID benzersiz olmalı; genelde Loopback IP verilir çünkü Loopback hiç 'down' olmaz. Değiştirmek OSPF sürecinin yeniden başlamasını gerektirir.", label: 'Router ID', type: 'text', validate: 'ip', placeholder: '1.1.1.1', hint: 'Opsiyonel — boş bırakılırsa en yüksek IP otomatik seçilir', optional: true },
                        { name: 'net', why: "OSPF <code>network</code> komutu hangi <b>arayüzlerin</b> OSPF'e katılacağını seçer, hangi ağın duyurulacağını değil. Ayrıca wildcard maske ister; normal maske yazmak komutu kabul ettirir ama arayüz sürece dahil olmaz.", label: 'Network', type: 'text', required: true, validate: 'ip', placeholder: '192.168.0.0', hint: 'OSPF\'e dahil edilecek ağ adresi' },
                        { name: 'wild', why: "OSPF network komutu da wildcard maske alır. <code>0.0.0.0 255.255.255.255</code> tüm arayüzleri dahil eder — istemeden WAN'da OSPF konuşmaya başlayabilirsin.", label: 'Wildcard Mask', type: 'text', required: true, validate: 'wildcard', placeholder: '0.0.0.255', hint: 'OSPF\'e katılacak ağın wildcard maskesi (/24 = 0.0.0.255)' },
                        { name: 'area', why: "Backbone alanı <code>0</code>'dır ve diğer tüm alanlar ona bitişik olmalıdır. Komşular arasında alan numarası eşleşmezse komşuluk kurulmaz.", label: 'Area', type: 'text', value: '0', hint: 'Backbone için 0, diğer area\'lar için 1, 2... vb.' },
                        { name: 'passive', why: 'Passive interface, o arayüzden OSPF <b>hello</b> göndermeyi durdurur ama ağı yine duyurur. LAN ve WAN arayüzlerinde güvenlik için açılmalıdır.', label: 'Passive Interface', type: 'text', placeholder: 'GigabitEthernet0/1 (boş = yok)', hint: 'Son kullanıcıya bağlı portlarda OSPF hello göndermemek için', optional: true }
                    ]
                }
            ],
            submit: 'OSPF Konfigürasyonu Oluştur'
        }, (data) => {
            const pid     = data.pid || '1';
            const rid     = data.rid;
            const net     = data.net;
            const wild    = data.wild;
            const area    = data.area || '0';
            const passive = data.passive;
            let config = '! ========================================\n! Cisco IOS OSPF Configuration\n! ========================================\n\n';
            config += 'router ospf ' + pid + '\n';
            if (rid) config += ' router-id ' + rid + '\n';
            config += ' network ' + net + ' ' + wild + ' area ' + area + '\n';
            if (passive) config += ' passive-interface ' + passive + '\n';
            config += '!\n';
            config += '\n! Doğrulama:\n! show ip ospf neighbor\n! show ip ospf database\n! show ip route ospf\n';
            return config;
        });
    }
};

// ── BGP ───────────────────────────────────────────────────────────────────────
CiscoIOS.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'BGP — Border Gateway Protocol',
                desc: 'Border Gateway Protocol — internet\'in routing protokolü. AS\'ler arası routing ve policy-based trafik yönetimi için kullanılır.'
            },
            sections: [
                {
                    title: 'Local AS Ayarları',
                    icon: 'fas fa-building',
                    fields: [
                        { name: 'local_as', why: "Kendi AS numaran. Peer'ın AS'i farklıysa eBGP, aynıysa iBGP olur; ikisinin davranışı belirgin şekilde farklıdır.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65000', hint: 'Bu router\'ın Autonomous System numarası. Özel: 64512-65534' },
                        { name: 'rid', why: "Router ID benzersiz olmalı; genelde Loopback IP verilir çünkü Loopback hiç 'down' olmaz. Değiştirmek OSPF sürecinin yeniden başlamasını gerektirir.", label: 'Router ID', type: 'text', validate: 'ip', placeholder: '1.1.1.1', hint: 'BGP router kimliği — boş bırakılırsa en yüksek IP seçilir', optional: true }
                    ]
                },
                {
                    title: 'Peer (Komşu) Ayarları',
                    icon: 'fas fa-handshake',
                    fields: [
                        { name: 'peer_ip', why: "Komşunun IP'si. eBGP'de genelde doğrudan bağlı arayüz IP'si kullanılır; Loopback kullanacaksan <code>ebgp-multihop</code> ve <code>update-source</code> gerekir.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'BGP komşusunun IP adresi' },
                        { name: 'peer_as', why: 'Komşunun AS numarası. Yanlış yazarsan oturum <code>Active/Idle</code> durumunda takılır — <code>show ip bgp summary</code> ile görürsün.', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Komşunun AS numarası — farklıysa eBGP, aynıysa iBGP' }
                    ]
                },
                {
                    title: 'Network Duyurusu',
                    icon: 'fas fa-broadcast-tower',
                    info: 'BGP üzerinden duyurulacak ağı girin. Routing tablosunda bu ağ mevcut olmalıdır.',
                    fields: [
                        { name: 'adv_net', why: 'BGP <code>network</code> komutu, ağı yalnızca routing tablosunda <b>birebir</b> varsa duyurur. Maske tam eşleşmezse duyuru hiç çıkmaz.', label: 'Advertise Network', type: 'text', placeholder: '192.168.0.0 (boş = yok)', hint: 'BGP ile duyurulacak ağ adresi', optional: true },
                        { name: 'adv_mask', why: "BGP'de duyurulan prefix, routing tablosundaki kayıtla <b>birebir</b> eşleşmeli. /24 duyurmak istersen tabloda tam olarak /24 bulunmalı; /25 varsa duyuru hiç çıkmaz.", label: 'Network Mask', type: 'text', validate: 'subnet', placeholder: '255.255.0.0', hint: 'Duyurulacak ağın subnet maskı', optional: true }
                    ]
                }
            ],
            submit: 'BGP Konfigürasyonu Oluştur'
        }, (data) => {
            const localAS = data.local_as;
            const rid     = data.rid;
            const peerIP  = data.peer_ip;
            const peerAS  = data.peer_as;
            const advNet  = data.adv_net;
            const advMask = data.adv_mask;
            let config = '! ========================================\n! Cisco IOS BGP Configuration\n! ========================================\n\n';
            config += 'router bgp ' + localAS + '\n';
            if (rid) config += ' bgp router-id ' + rid + '\n';
            config += ' neighbor ' + peerIP + ' remote-as ' + peerAS + '\n';
            config += ' neighbor ' + peerIP + ' description eBGP-peer\n';
            if (advNet) config += ' network ' + advNet + (advMask ? ' mask ' + advMask : '') + '\n';
            config += '!\n';
            config += '\n! Doğrulama:\n! show bgp summary\n! show bgp neighbors ' + peerIP + '\n! show ip route bgp\n';
            return config;
        });
    }
};

// ── IPSEC VPN ─────────────────────────────────────────────────────────────────
CiscoIOS.ipsec = {
    label: 'IPSec VPN',

    init(container) {
        const schema = {
            topic: { icon: 'fas fa-lock', title: 'IPSec VPN', desc: 'Site-to-Site, Remote Access ve DMVPN Ready — Crypto Map, VTI veya FlexVPN (IKEv2) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'site-to-site',  label: 'Site-to-Site',  icon: 'fas fa-building',        desc: 'İki lokasyon arası kalıcı VPN',     badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'remote-access', label: 'Remote Access',  icon: 'fas fa-laptop-house',    desc: 'Uzak kullanıcılar için VPN',        badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'dmvpn-ready',   label: 'DMVPN Ready',   icon: 'fas fa-project-diagram',  desc: 'Hub-and-Spoke dynamic VPN temeli',  badge: { text: 'Gelişmiş',  cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Yapılandırma Yöntemi', icon: 'fas fa-tools',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ipsec_method', why: "<b>Crypto map</b> klasik yöntemdir, <b>tunnel protection</b> (VTI) daha modern ve yönlendirme dostudur. VTI'da tünel arayüzü olduğu için routing protokolü çalıştırabilirsin.", label: 'Config Yöntemi', type: 'select', required: false,
                          options: [{v:'crypto-map',l:'Crypto Map (Legacy)'},{v:'vti',l:'VTI (Önerilen)'},{v:'flexvpn',l:'FlexVPN — IKEv2'}] }
                    ]
                },
                {
                    title: 'Local Site', icon: 'fas fa-map-marker-alt',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'local_ip', why: "Tünelin yerel ucu olarak kullanılan genel adres. NAT arkasındaysan buraya cihazın kendi arayüz IP'sini yaz ve NAT-T'yi aç; dışarıdan görünen IP'yi yazmak Phase 1'in kimlik doğrulamasını bozar.",   label: 'Public IP',      type: 'text', required: true,  validate: 'ip', placeholder: '85.100.1.1',        hint: 'WAN/genel IP adresi' },
                        { name: 'local_wan', why: "Crypto map bu arayüze bağlanır. Yanlış arayüze bağlarsan IKE paketleri hiç şifrelenmez ve tünel Phase 1'de takılı kalır.",  label: 'WAN Interface',  type: 'text', required: true,  placeholder: 'GigabitEthernet0/0', hint: 'WAN interface adı' },
                        { name: 'local_net', why: "Interesting traffic tanımının yerel ucu. İki tarafın ACL'leri <b>ayna görüntüsü</b> olmalı; biri /24 diğeri /16 yazarsa Phase 2 proposal uyuşmazlığı alırsın.",  label: 'Local Network',  type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.0',        hint: 'Korunan iç ağ' },
                        { name: 'local_mask', why: "Maske iki uçta simetrik olmalı. Asimetrik tanım, tünel kurulsa bile trafiğin yalnızca tek yönde akmasına yol açar ve teşhisi zordur.", label: 'Subnet Mask',    type: 'text', required: true, validate: 'subnet', placeholder: '255.255.255.0',      hint: 'Yerel ağ maskesi' }
                    ]
                },
                {
                    title: 'Remote Site', icon: 'fas fa-map-marker',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'remote_ip', why: "Karşı tarafın gerçek dış IP'si. NAT arkasındaysa dış IP yazılmalı ve NAT-T (UDP 4500) açık olmalı.",   label: 'Remote Public IP',  type: 'text', validate: 'ip', required: true,  placeholder: '85.200.2.2',    hint: 'Karşı taraf WAN IP' },
                        { name: 'remote_net', why: "Karşı tarafın yerel ağı. Bu ağ aynı zamanda NAT muafiyet (<code>deny</code>) satırında da yer almalı; yoksa trafik NAT'lanır ve tünele hiç girmez.",  label: 'Remote Network',    type: 'text', required: true, validate: 'ip', placeholder: '192.168.2.0',   hint: 'Karşı ağ adresi' },
                        { name: 'remote_mask', why: "Uzak ağın maskesi iki uçta aynı olmalı. Fazla geniş yazmak internete giden trafiği de tünele sokarak şubeyi internetsiz bırakabilir.", label: 'Remote Mask',       type: 'text', required: true, validate: 'subnet', placeholder: '255.255.255.0', hint: 'Karşı ağ maskesi' }
                    ]
                },
                {
                    title: 'Tunnel Interface (VTI / FlexVPN)', icon: 'fas fa-tunnel',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null,
                    info: 'Sadece VTI veya FlexVPN yöntemi seçildiğinde kullanılır.',
                    fields: [
                        { name: 'tunnel_num', why: "Tunnel numarası yereldir, iki tarafta aynı olmak zorunda değil. Ancak kullanımdaki bir numarayı tekrar vermek çalışan VPN'i sessizce ezer.",  label: 'Tunnel No',    type: 'text', required: false, placeholder: '1',                  hint: 'Tunnel interface numarası' },
                        { name: 'tunnel_ip', why: "VTI'da iki uç aynı /30 içinde olmalı. Fiziksel WAN ağından adres vermek yönlendirme döngüsü ve sürekli flap yaratır.",   label: 'Tunnel IP',    type: 'text', required: true, validate: 'ip', placeholder: '172.24.1.1',         hint: 'Tunnel IP (VTI/FlexVPN gerekli)' },
                        { name: 'tunnel_mask', why: "Point-to-point tünelde <code>255.255.255.252</code> (/30) yeterlidir. Daha geniş maske vermek, aynı blokta yapılandırılan başka bir tüneli istemeden kapsayabilir.", label: 'Tunnel Mask',  type: 'text', validate: 'subnet', required: false, placeholder: '255.255.255.252',    hint: 'Tunnel subnet maskesi' }
                    ]
                },
                {
                    title: 'Phase 1 (IKE) Ayarları', icon: 'fas fa-key',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ike_ver', why: "IKEv2 daha az round-trip, daha iyi NAT geçişi ve DoS koruması sunar. İki taraf <b>aynı sürümü</b> konuşmalı; uyuşmazlıkta tünel hiç kurulmaz.",  label: 'IKE Version',    type: 'select', required: false, options: [{v:'1',l:'IKEv1'},{v:'2',l:'IKEv2 (önerilen)'}] },
                        { name: 'psk', why: 'İki tarafta birebir aynı olmalı. Kopyala-yapıştırda sondaki boşluk klasik hatadır. Uzun ve rastgele seç.',      label: 'Pre-shared Key', type: 'text',   required: true,  placeholder: 'Min 8 karakter',     hint: 'Paylaşımlı anahtar (en az 8 karakter)' },
                        { name: 'p1_life', why: 'Phase 1 ömrü. İki tarafta farklı olması sorun çıkarmaz (kısa olan kazanır) ama çok kısa değerler sürekli rekey ve CPU yüküne yol açar.',  label: 'SA Lifetime (sn)',type: 'text',  required: false, placeholder: '86400',              hint: 'IKE SA yaşam süresi' },
                        { name: 'p1_enc', why: 'Phase 1 şifrelemesi iki tarafta eşleşmeli. <code>des</code> ve <code>3des</code> artık güvensizdir; <code>aes 256</code> kullan.',   label: 'Şifreleme',      type: 'select', required: false, options: [{v:'aes256',l:'AES-256 (En güvenli)'},{v:'aes192',l:'AES-192'},{v:'aes128',l:'AES-128'},{v:'3des',l:'3DES (Legacy)'}] },
                        { name: 'p1_hash', why: '<code>md5</code> kırılmıştır, <code>sha256</code> kullan. İki tarafta eşleşmeli.',  label: 'Hash',           type: 'select', required: false, options: [{v:'sha512',l:'SHA-512'},{v:'sha256',l:'SHA-256 (önerilen)'},{v:'sha1',l:'SHA-1'},{v:'md5',l:'MD5 (Legacy)'}] },
                        { name: 'p1_dh', why: 'DH grup 1, 2 ve 5 kırılabilir kabul edilir. En az grup 14 (2048-bit) seçilmeli ve iki tarafta aynı olmalı.',    label: 'DH Group',       type: 'select', required: false, options: [{v:'21',l:'Group 21 — ECP-521'},{v:'19',l:'Group 19 — ECP-256 (önerilen)'},{v:'14',l:'Group 14 — 2048-bit'},{v:'5',l:'Group 5 — 1536-bit'}] }
                    ]
                },
                {
                    title: 'Phase 2 (IPSec) Ayarları', icon: 'fas fa-shield-alt',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ts_name', why: 'Transform set adı yereldir, karşı tarafla aynı olmak zorunda değil — ama <b>içeriği</b> (şifreleme+hash) eşleşmelidir.',  label: 'Transform Set Adı', type: 'text',   required: false, placeholder: 'TS-IPSEC',          hint: 'Transform set ismi' },
                        { name: 'ipsec_mode', why: "<code>tunnel</code> tüm paketi sarar (site-to-site için standart), <code>transport</code> yalnızca payload'ı şifreler (GRE üzerinde IPSec'te kullanılır).",label: 'IPSec Mode',       type: 'select', required: false, options: [{v:'tunnel',l:'Tunnel'},{v:'transport',l:'Transport'}] },
                        { name: 'p2_life', why: "Phase 2 ömrü Phase 1'den <b>kısa</b> olmalı. Çok kısa değerler sürekli rekey demektir ve her rekeyde birkaç paketlik kayıp yaşanır.",  label: 'SA Lifetime (sn)', type: 'text',   required: false, placeholder: '3600',              hint: 'IPSec SA yaşam süresi' },
                        { name: 'p2_enc', why: "ESP şifrelemesi iki tarafta eşleşmeli. <code>3des</code> artık güvensizdir; donanım hızlandırma varsa <code>aes 256</code> gözle görülür bir performans kaybı yaratmaz.",   label: 'ESP Şifreleme',    type: 'select', required: false, options: [{v:'esp-aes256',l:'ESP-AES-256'},{v:'esp-aes192',l:'ESP-AES-192'},{v:'esp-aes128',l:'ESP-AES-128'},{v:'esp-3des',l:'ESP-3DES'}] },
                        { name: 'p2_hash', why: "ESP bütünlük algoritması. <code>esp-md5-hmac</code> kırılmıştır; <code>esp-sha256-hmac</code> tercih et. Eski cihaz uyumu için zayıf seçim yapıyorsan bunu bilerek yap.",  label: 'ESP Hash',         type: 'select', required: false, options: [{v:'esp-sha512-hmac',l:'SHA-512'},{v:'esp-sha256-hmac',l:'SHA-256 (önerilen)'},{v:'esp-sha-hmac',l:'SHA-1'},{v:'esp-md5-hmac',l:'MD5'}] },
                        { name: 'pfs', why: "PFS açıkken her rekey'de yeni anahtar üretilir; bir anahtar ele geçse bile geçmiş trafik çözülemez. İki tarafta da açık olmalı.",      label: 'Perfect Forward Secrecy (PFS)', type: 'checkbox', required: false },
                        { name: 'pfs_group', why: "PFS açıkken her rekey'de yeni anahtar üretilir; geçmiş trafik ele geçen anahtarla çözülemez. İki tarafta <b>aynı grup</b> seçilmeli.",label: 'PFS Group',        type: 'select', required: false, options: [{v:'19',l:'Group 19 — ECP-256'},{v:'21',l:'Group 21 — ECP-521'},{v:'14',l:'Group 14 — 2048-bit'}] },
                        { name: 'dpd', why: "Dead Peer Detection, karşı taraf sessizce kaybolduğunda tüneli temizler. Kapalıysa tünel 'up' görünmeye devam eder ama trafik akmaz.",      label: 'Dead Peer Detection (DPD)',      type: 'checkbox', required: false },
                        { name: 'natt', why: 'NAT arkasındaki uçlarda zorunludur. UDP 4500 kapalıysa tünel kurulmaz veya kurulup kısa sürede düşer.',     label: 'NAT Traversal',    type: 'checkbox', required: false },
                        { name: 'qos', why: 'QoS pre-classify, şifrelemeden <b>önce</b> paketi sınıflandırır. Olmadan tüm VPN trafiği tek sınıf görünür ve QoS anlamsızlaşır.',      label: 'QoS Pre-classify', type: 'checkbox', required: false }
                    ]
                }
            ],
            submit: 'IPSec VPN Konfigürasyonu Oluştur'
        };

        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const cb = n => data[n] === 'on' || data[n] === true;

            const method   = fv('ipsec_method') || 'vti';
            const ikeVer   = fv('ike_ver') || '2';
            const localIP  = fv('local_ip'),  localWAN  = fv('local_wan');
            const localNet = fv('local_net'),  localMask = fv('local_mask');
            const remoteIP = fv('remote_ip'), remoteNet = fv('remote_net'), remoteMask = fv('remote_mask');
            const psk      = fv('psk');
            const p1Life   = fv('p1_life');
            const p1Enc    = fv('p1_enc')  || 'aes256';
            const p1Hash   = fv('p1_hash') || 'sha256';
            const p1DH     = fv('p1_dh')   || '19';
            const tsName   = fv('ts_name') || 'TS-IPSEC';
            const ipsecMode= fv('ipsec_mode') || 'tunnel';
            const p2Life   = fv('p2_life');
            const p2Enc    = fv('p2_enc')  || 'esp-aes256';
            const p2Hash   = fv('p2_hash') || 'esp-sha256-hmac';
            const pfsBool  = cb('pfs');
            const pfsGrp   = fv('pfs_group') || '19';
            const dpdBool  = cb('dpd');
            const nattBool = cb('natt');
            const qosBool  = cb('qos');
            const tunNum   = fv('tunnel_num') || '1';
            const tunIP    = fv('tunnel_ip');
            const tunMask  = fv('tunnel_mask') || '255.255.255.252';

            const encMapV1  = { aes256:'aes 256', aes192:'aes 192', aes128:'aes', '3des':'3des' };
            const encMapV2  = { aes256:'aes-cbc-256', aes192:'aes-cbc-192', aes128:'aes-cbc-128', '3des':'3des' };
            const hashMapV2 = { sha512:'sha512', sha256:'sha256', sha1:'sha1', md5:'md5' };
            const esp2Enc   = { 'esp-aes256':'esp-aes 256', 'esp-aes192':'esp-aes 192', 'esp-aes128':'esp-aes', 'esp-3des':'esp-3des' };

            // Bos/gecersiz maskede 'NaN' uretmesin: bos birak, satir eksikligi gorunur olsun.
            const calcWild = mask => /^(\d{1,3}\.){3}\d{1,3}$/.test(mask) ? mask.split('.').map(o => 255 - parseInt(o, 10)).join('.') : '';

            const p2TS = () => {
                let c = '! ── IPSec Transform Set ──────────────────────────────────\n';
                c += `crypto ipsec transform-set ${tsName} ${esp2Enc[p2Enc] || 'esp-aes 256'} ${p2Hash}\n`;
                c += ` mode ${ipsecMode}\nexit\n\n`;
                if (p2Life) c += `crypto ipsec security-association lifetime seconds ${p2Life}\n`;
                c += `crypto ipsec security-association lifetime kilobytes 536870912\n\n`;
                return c;
            };

            const p1IKEv1 = () => {
                let c = '! ── IKE Phase 1 (IKEv1) ─────────────────────────────────\n';
                c += `crypto isakmp enable\ncrypto isakmp policy 10\n`;
                c += ` encr ${encMapV1[p1Enc] || 'aes 256'}\n`;
                c += ` hash ${p1Hash}\n authentication pre-share\n group ${p1DH}\n` + (p1Life ? ` lifetime ${p1Life}\n` : '') + `exit\n\n`;
                if (dpdBool) c += `crypto isakmp keepalive 10 3\n\n`;
                if (nattBool) c += `crypto isakmp nat keepalive 20\n\n`;
                return c;
            };

            let config = '! ========================================\n! Cisco IOS IPSec VPN Configuration\n! ========================================\n\n';

            if (method === 'crypto-map') {
                config += p1IKEv1();
                config += `crypto isakmp key ${psk} address ${remoteIP}\n\n`;
                config += p2TS();
                config += '! ── Crypto ACL ───────────────────────────────────────────\n';
                config += `access-list 100 permit ip ${localNet} ${calcWild(localMask)} ${remoteNet} ${calcWild(remoteMask)}\n\n`;
                config += '! ── Crypto Map ───────────────────────────────────────────\n';
                config += `crypto map IPSEC-MAP 10 ipsec-isakmp\n`;
                config += ` set peer ${remoteIP}\n set transform-set ${tsName}\n match address 100\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\ninterface ${localWAN}\n crypto map IPSEC-MAP\nexit\n`;

            } else if (method === 'vti') {
                config += p1IKEv1();
                config += `crypto isakmp key ${psk} address ${remoteIP}\n\n`;
                config += p2TS();
                config += '! ── IPSec Profile ────────────────────────────────────────\n';
                config += `crypto ipsec profile IPSEC-PROFILE\n set transform-set ${tsName}\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\n! ── Tunnel Interface ─────────────────────────────────────\n`;
                config += `interface Tunnel${tunNum}\n ip address ${tunIP} ${tunMask}\n`;
                config += ` tunnel source ${localIP}\n tunnel destination ${remoteIP}\n`;
                config += ` tunnel mode ipsec ipv4\n tunnel protection ipsec profile IPSEC-PROFILE\n`;
                if (qosBool) config += ` qos pre-classify\n`;
                config += ` no shutdown\nexit\n\n`;
                config += `ip route ${remoteNet} ${remoteMask} Tunnel${tunNum}\n`;

            } else {
                // FlexVPN (IKEv2)
                config += '! ── IKEv2 Keyring ────────────────────────────────────────\n';
                config += `crypto ikev2 keyring IKEv2-KEYRING\n peer REMOTE-PEER\n  address ${remoteIP}\n  pre-shared-key ${psk}\n exit\nexit\n\n`;
                config += '! ── IKEv2 Proposal ───────────────────────────────────────\n';
                config += `crypto ikev2 proposal IKEv2-PROPOSAL\n encryption ${encMapV2[p1Enc] || 'aes-cbc-256'}\n`;
                config += ` integrity ${hashMapV2[p1Hash] || 'sha256'}\n group ${p1DH}\nexit\n\n`;
                config += `crypto ikev2 policy IKEv2-POLICY\n proposal IKEv2-PROPOSAL\nexit\n\n`;
                config += '! ── IKEv2 Profile ────────────────────────────────────────\n';
                config += `crypto ikev2 profile IKEv2-PROFILE\n match identity remote address ${remoteIP}\n`;
                config += ` authentication remote pre-share\n authentication local pre-share\n keyring local IKEv2-KEYRING\n`;
                if (dpdBool) config += ` dpd 10 3 on-demand\n`;
                config += `exit\n\n`;
                config += p2TS();
                config += '! ── IPSec Profile ────────────────────────────────────────\n';
                config += `crypto ipsec profile FLEXVPN-PROFILE\n set transform-set ${tsName}\n set ikev2-profile IKEv2-PROFILE\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\n! ── Tunnel Interface ─────────────────────────────────────\n`;
                config += `interface Tunnel${tunNum}\n ip address ${tunIP} ${tunMask}\n`;
                config += ` tunnel source ${localIP}\n tunnel destination ${remoteIP}\n`;
                config += ` tunnel mode ipsec ipv4\n tunnel protection ipsec profile FLEXVPN-PROFILE\n`;
                if (qosBool) config += ` qos pre-classify\n`;
                config += ` no shutdown\nexit\n\n`;
                config += `ip route ${remoteNet} ${remoteMask} Tunnel${tunNum}\n`;
            }

            config += '\n! Doğrulama:\n! show crypto isakmp sa\n! show crypto ipsec sa\n! show crypto session\n';
            if (method !== 'crypto-map') config += `! show interface Tunnel${tunNum}\n`;
            return config;
        });
    }
};



// ── DHCP ──────────────────────────────────────────────────────────────────────
CiscoIOS.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'DHCP (IOS)',
                desc: 'Ağ cihazlarına otomatik IP adresi, gateway ve DNS parametresi dağıtır. Server modunda havuz tanımlanır; Relay modunda merkezi sunucuya yönlendirilir; Snooping ile yetkisiz DHCP sunucuları engellenir.'
            },
            configTypes: [
                { id: 'server',   label: 'DHCP Server',   icon: 'fas fa-server',     desc: 'Cihaz üzerinde IP havuzu oluştur ve dağıt',              badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'relay',    label: 'DHCP Relay',    icon: 'fas fa-exchange-alt', desc: 'IP Helper ile merkezi DHCP sunucuya yönlendir',          badge: { text: 'Relay',     cls: 'common'      } },
                { id: 'snooping', label: 'DHCP Snooping', icon: 'fas fa-shield-alt',  desc: 'Yetkisiz DHCP sunucularını tespit et ve engelle',         badge: { text: 'Güvenlik',  cls: 'security'    } },
            ],
            sections: [
                {
                    title: 'IP Havuzu (Pool) Ayarları', icon: 'fas fa-database',
                    showFor: ['server'],
                    fields: [
                        { name: 'pool_name', why: "Havuz adı komutlarda referans alınır. Var olan bir adı tekrar kullanmak eski havuzun ayarlarını <b>üzerine yazar</b> ve mevcut istemciler etkilenir.",  label: 'Pool Adı',           type: 'text',   required: true,  placeholder: 'LAN_POOL',       hint: 'DHCP pool için benzersiz ve açıklayıcı bir isim. Boşluk kullanmayın.' },
                        { name: 'network', why: "Havuzun ağı, DHCP isteğinin geldiği arayüzün ağıyla örtüşmeli. Örtüşmezse router isteğe hiç yanıt vermez ve istemci APIPA adresine düşer.",    label: 'Network Adresi',      type: 'text',   required: true,  validate: 'ip', placeholder: '192.168.1.0',    hint: 'DHCP havuzunun ağ adresi. Host değil ağ adresi olmalı — son oktet genelde .0\'dır.' },
                        { name: 'mask', why: "Havuzun maskesi arayüzün maskesiyle aynı olmalı. Daha dar bir maske vermek, aynı segmentteki bazı istemcilerin gateway'e ulaşamamasına yol açar.",       label: 'Subnet Mask',         type: 'text', validate: 'subnet',   required: true,  placeholder: '255.255.255.0',  hint: 'Ağ büyüklüğünü belirler. /24 → 255.255.255.0 çoğu LAN için uygundur.', tooltip: '/24 = 255.255.255.0 → 254 host\n/25 = 255.255.255.128 → 126 host\n/16 = 255.255.0.0 → 65534 host' },
                        { name: 'gateway', why: "İstemcilere dağıtılan gateway. HSRP/VRRP varsa buraya <b>sanal</b> IP yazılmalı; fiziksel IP yazmak failover'ı tamamen anlamsızlaştırır.",    label: 'Default Gateway',     type: 'text',   required: false, validate: 'ip', placeholder: '192.168.1.1',    optional: true, hint: 'Client\'ların internet/diğer ağlara ulaşmak için kullanacağı gateway IP adresi.', tooltip: 'Client\'ların internete veya diğer ağlara çıkacağı router adresi. Genelde bu cihazın aynı subnet\'teki interface IP\'sidir.' },
                        { name: 'dns1', why: "DNS yanlışsa kullanıcı için durum “internet yok” demektir, oysa IP bağlantısı çalışır. Active Directory ortamında iç DNS zorunludur; harici DNS vermek oturum açmayı bozar.",       label: 'DNS Server 1',        type: 'text',   required: false, validate: 'ip', placeholder: '8.8.8.8',        optional: true, hint: 'Birincil DNS. Google: 8.8.8.8, Cloudflare: 1.1.1.1 veya kurumsal DNS sunucunuz girilebilir.' },
                        { name: 'dns2', why: "Yedek DNS. İkisini de aynı sunucu yapmak yedekliliği ortadan kaldırır: birincil çökünce tüm ad çözümlemesi durur.",       label: 'DNS Server 2',        type: 'text',   required: false, validate: 'ip', placeholder: '8.8.4.4',        optional: true, hint: 'İkincil (yedek) DNS sunucusu. Birincil erişilemez olduğunda devreye girer.' },
                        { name: 'lease_days', why: 'Uzun lease havuzu tüketir, kısa lease DHCP trafiğini artırır. Misafir ağlarında kısa tutmak mantıklıdır.', label: 'Lease Süresi (gün)',  type: 'number', required: false, min: 0, max: 365, placeholder: '1',            optional: true, hint: 'Önerilen: masaüstü/sunucu için 7-30 gün, misafir ağı için 1 gün veya daha az.', tooltip: 'IP adresinin cihaza ne kadar süre tahsis edileceği. Kısa lease: daha fazla DHCP trafiği. Uzun lease: statik benzeri davranış.' },
                        { name: 'domain', why: 'SSH anahtarı üretmek için hostname <b>ve</b> domain adı tanımlı olmalıdır. Eksikse <code>crypto key generate rsa</code> komutu hata verir.',     label: 'Domain Name',         type: 'text',   required: false, placeholder: 'example.com',    optional: true, hint: 'Client\'lara iletilecek DNS arama domain\'i. Kurumsal ortamda Active Directory domain adı kullanılabilir.' },
                    ]
                },
                {
                    title: 'Excluded IP Aralığı', icon: 'fas fa-ban',
                    showFor: ['server'],
                    info: 'DHCP havuzundan <strong>dağıtılmaması</strong> gereken IP\'leri tanımlayın. Gateway, sunucu ve yazıcı gibi sabit IP\'li cihazları buraya ekleyin.',
                    fields: [
                        { name: 'excl_start', why: "Havuzdan hariç tutulan aralık. Statik IP'li sunucular ve gateway <b>mutlaka</b> hariç tutulmalı, aksi halde IP çakışması yaşanır.", label: 'Excluded Başlangıç', type: 'text', required: false, validate: 'ip', placeholder: '192.168.1.1',  optional: true, hint: 'Hariç tutulacak aralığın ilk IP\'si. Tek bir IP için sadece bu alanı doldurun.' },
                        { name: 'excl_end', why: "<code>ip dhcp excluded-address</code> satırı, statik verilmiş sunucu ve yazıcı adreslerini korur. Unutursan DHCP aynı IP'yi dağıtır ve çakışma yaşanır.",   label: 'Excluded Bitiş',     type: 'text', required: false, validate: 'ip', placeholder: '192.168.1.10', optional: true, hint: 'Aralık sonu. Örn: .1 ile .10 girilerek 10 IP hariç tutulur.' },
                    ]
                },
                {
                    title: 'Static Binding', icon: 'fas fa-fingerprint',
                    showFor: ['server'],
                    info: 'MAC adresine göre sabit IP ataması — yazıcılar, IP kameralar ve sunucular için kullanışlıdır (opsiyonel).',
                    fields: [
                        { name: 'static_mac', why: "IOS MAC formatı <code>aabb.cc00.1100</code> şeklindedir; iki nokta üst üsteli format kabul edilmez. İstemci DHCP client-id kullanıyorsa MAC eşleşmesi hiç tutmayabilir.", label: 'MAC Adresi',     type: 'text', required: false, validate: 'mac', placeholder: '00:1A:2B:3C:4D:5E', optional: true, hint: 'Sabit IP atanacak cihazın MAC adresi — xx:xx:xx:xx:xx:xx formatında.' },
                        { name: 'static_ip', why: "Rezerve edilen adres <b>havuz aralığının dışında</b> ya da excluded olmalı; aksi halde aynı IP başka bir istemciye de dağıtılır.",  label: 'Sabit IP Adresi', type: 'text', required: false, validate: 'ip',  placeholder: '192.168.1.100',      optional: true, hint: 'Bu MAC adresine her zaman atanacak IP. Havuz aralığı içinde yer almalıdır.' },
                    ]
                },
                {
                    title: 'IP Helper Yapılandırması', icon: 'fas fa-route',
                    showFor: ['relay'],
                    info: 'DHCP Relay, client\'ın broadcast DHCP isteğini unicast olarak uzaktaki sunucuya iletir. Client ile sunucu farklı subnet\'lerde olduğunda kullanılır.',
                    fields: [
                        { name: 'relay_iface', why: "<code>ip helper-address</code>, istemcinin bulunduğu <b>iç</b> arayüze yazılır; sunucunun bulunduğu arayüze değil. Ters yazmak en yaygın DHCP relay hatasıdır.",  label: 'Interface',      type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Client\'ların bağlı olduğu interface veya SVI arayüzü (örn: Vlan10).', tooltip: 'DHCP isteklerinin geldiği interface — client\'lara bağlı port veya SVI arayüzü. ip helper-address bu interface altına eklenir.' },
                        { name: 'relay_server', why: 'DHCP sunucusu farklı bir ağdaysa <code>ip helper-address</code> zorunludur. Eksikse istemciler adres alamaz ve sorun sessizce sürer.', label: 'DHCP Server IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.10', hint: 'Uzaktaki DHCP sunucusunun IP adresi. Birden fazla sunucu için komut tekrarlanır.' },
                    ]
                },
                {
                    title: 'DHCP Snooping Yapılandırması', icon: 'fas fa-shield-alt',
                    showFor: ['snooping'],
                    warn: '<strong>Önemli:</strong> DHCP Snooping aktif edildiğinde tüm portlar varsayılan olarak <strong>untrusted</strong> olur. DHCP sunucusuna veya uplink\'e bağlı portları mutlaka <strong>trusted</strong> yapın — aksi hâlde DHCP trafiği kesilir.',
                    fields: [
                        { name: 'snoop_vlan', why: 'DHCP Snooping, sahte DHCP sunucularını engeller. <b>Gerçek DHCP sunucusuna giden port trusted işaretlenmezse</b> meşru sunucu da bloklanır — en sık yapılan hata.',   label: 'VLAN Aralığı',  type: 'text', validate: 'vlan_list', required: true,  placeholder: '10,20,30-40',       hint: 'Snooping aktif edilecek VLAN\'lar. Tüm VLAN\'lar için: 1-4094' },
                        { name: 'trusted_port', why: "Yalnızca gerçek DHCP sunucusuna veya uplink'e bakan port trusted olmalı. Tüm portları trusted yapmak özelliği anlamsızlaştırır.", label: 'Trusted Port',   type: 'text', required: false, placeholder: 'GigabitEthernet0/0', optional: true, hint: 'DHCP sunucuya bağlı veya uplink port. Her port için ayrı komut gerekir.', tooltip: 'DHCP sunucusuna veya uplink switche bağlı port. Bu porttan gelen DHCP server paketleri güvenilir kabul edilir ve iletilir.' },
                        { name: 'dai_enable', why: 'Dynamic ARP Inspection, DHCP Snooping veritabanını kullanarak ARP zehirlemesini engeller. Snooping olmadan çalışmaz.',   label: 'DAI (Dynamic ARP Inspection) etkinleştir', type: 'checkbox', required: false, hint: 'DHCP Snooping binding tablosunu kullanarak sahte ARP paketlerini engeller. Man-in-the-Middle saldırılarına karşı koruma sağlar.' },
                    ]
                },
            ],
            submit: 'DHCP Konfigürasyonu Oluştur'
        }, (data) => {
            return cgDhcpGen(data);
        });
    }
};
function cgDhcpGen(data) {
    const g = k => cgEsc((data[k] || '').toString().trim());
    const mode = data._cgtype || '';
    let c = '! ========================================\n! Cisco IOS DHCP Configuration\n! ========================================\n\n';
    if (mode === 'server') {
        const es = g('excl_start'), ee = g('excl_end');
        if (es) c += 'ip dhcp excluded-address ' + es + (ee ? ' ' + ee : '') + '\n';
        c += '!\nip dhcp pool ' + g('pool_name') + '\n network ' + g('network') + ' ' + g('mask') + '\n';
        const gw = g('gateway'); if (gw) c += ' default-router ' + gw + '\n';
        const d1 = g('dns1'); if (d1) c += ' dns-server ' + d1 + (g('dns2') ? ' ' + g('dns2') : '') + '\n';
        c += ' lease ' + (g('lease_days') || '1') + '\n';
        const dom = g('domain'); if (dom) c += ' domain-name ' + dom + '\n';
        c += '!\n';
        const sm = g('static_mac'), si = g('static_ip');
        if (sm && si) c += 'ip dhcp pool HOST-' + sm.replace(/[:\-.]/g,'') + '\n host ' + si + ' ' + g('mask') + '\n client-identifier ' + sm + '\n!\n';
    } else if (mode === 'relay') {
        c += 'interface ' + g('relay_iface') + '\n ip helper-address ' + g('relay_server') + '\nexit\n';
    } else if (mode === 'snooping') {
        const sv = g('snoop_vlan');
        c += 'ip dhcp snooping\nip dhcp snooping vlan ' + sv + '\nno ip dhcp snooping information option\n';
        const tp = g('trusted_port');
        if (tp) c += 'interface ' + tp + '\n ip dhcp snooping trust\nexit\n';
        if (data.dai_enable) c += 'ip arp inspection vlan ' + sv + '\n';
        c += '!\n';
    }
    c += '! Doğrulama: show ip dhcp pool | show ip dhcp binding | show ip dhcp snooping\n';
    return c;
}

// ── SNMP ──────────────────────────────────────────────────────────────────────
CiscoIOS.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP — Simple Network Management Protocol',
                desc: 'Simple Network Management Protocol — cihaz izleme. <strong>v2c</strong>: basit, yaygın. <strong>v3</strong>: şifreli, kimlik doğrulamalı, üretimde önerilen.'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Auth + Privacy — şifreli ve kimlik doğrulamalı', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v1v2c', label: 'SNMPv1/v2c', icon: 'fas fa-unlock', desc: 'Community string — basit, şifresiz', badge: { text: 'Eski', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'SNMPv3 Kimlik Bilgileri',
                    icon: 'fas fa-user-shield',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_group', why: "SNMPv3 grubu, yetki seviyesini belirler. <code>priv</code> hem kimlik doğrulama hem şifreleme ister — v1/v2c'den tek gerçek güvenlik farkı budur.", label: 'Grup Adı', type: 'text', required: true, placeholder: 'SNMPV3_GROUP', hint: 'SNMPv3 erişim grubu adı' },
                        { name: 'v3_view', why: 'View tanımlanmazsa grup varsayılan görünümü kullanır; <code>iso included</code> tüm MIB ağacını açar, daraltmak için alt OID ekleyin.', label: 'Okuma View Adı', type: 'text', placeholder: 'ALL-VIEW', hint: 'snmp-server view <ad> iso included — boş = view yazılmaz' },
                        { name: 'v3_user', why: "SNMPv3 kullanıcısı bir gruba bağlıdır; grup tanımlanmadan kullanıcı yazmak sessizce işe yaramaz. Kullanıcıyı değiştirmek için çoğu IOS sürümünde silip yeniden oluşturman gerekir.", label: 'Kullanıcı', type: 'text', required: true, placeholder: 'snmpuser', hint: 'SNMPv3 kullanıcı adı' },
                        { name: 'v3_auth', why: 'Auth şifresi en az 8 karakter olmalı. <code>md5</code> zayıftır, <code>sha</code> tercih edilmelidir.', label: 'Auth Şifre', type: 'text', required: true, placeholder: 'AuthPassword123', hint: 'SHA algoritması ile kimlik doğrulama şifresi (min 8 karakter)' },
                        { name: 'v3_priv', why: 'Şifreleme olmadan (authNoPriv) SNMP verisi ağda <b>açık</b> geçer; cihaz envanteri ve arayüz bilgileri dinlenebilir.', label: 'Priv Şifre', type: 'text', required: true, placeholder: 'PrivPassword123', hint: 'AES-256 ile şifreleme anahtarı (min 8 karakter)' }
                    ]
                },
                {
                    title: 'SNMPv3 Ek Ayarlar',
                    icon: 'fas fa-cog',
                    showFor: ['v3'],
                    fields: [
                        { name: 'contact', why: 'Sorumlu kişi/ekip. Devir teslimlerde ve gece arızalarında kime ulaşılacağını gösterir.', label: 'Contact', type: 'text', placeholder: 'noc@example.com', optional: true },
                        { name: 'location', why: 'Fiziksel konum. 200 cihazlı bir ağda arızalı cihazı bulmanın en hızlı yolu budur — boş bırakma.', label: 'Location', type: 'text', placeholder: 'Istanbul-DC1', optional: true },
                        { name: 'trap_host', why: 'Trap alıcısı (NMS). Tanımlanmazsa cihaz arıza bildirmez; sorunları ancak kullanıcı şikayetiyle öğrenirsin.', label: 'Trap Host', type: 'text', validate: 'ip', placeholder: '10.0.0.100', hint: 'SNMP trap alacak sunucu IP', optional: true },
                        { name: 'mgmt_net', why: 'SNMP erişimini yalnızca yönetim ağıyla sınırlayan ACL. Community adı güçlü olsa bile kaynak kısıtı olmadan tüm ağdan denenebilir.', label: 'Mgmt Network', type: 'text', placeholder: '10.0.0.0', hint: 'SNMP erişimine izin verilecek ağ', optional: true },
                        { name: 'mgmt_wild', why: 'Burada da wildcard maske kullanılır, subnet maske değil.', label: 'Mgmt Wildcard', type: 'text', placeholder: '0.0.0.255', optional: true }
                    ]
                },
                {
                    title: 'SNMPv1/v2c Community',
                    icon: 'fas fa-key',
                    showFor: ['v1v2c'],
                    warn: 'SNMPv1/v2c community string şifresiz iletilir. Üretim ortamında SNMPv3 tercih edin.',
                    fields: [
                        { name: 'ro_comm', why: "v2c community adı düz metin parola gibidir ve ağda şifresiz taşınır. <code>public</code>/<code>private</code> gibi varsayılanları asla bırakma — mümkünse v3'e geç.", label: 'RO Community', type: 'text', required: true, placeholder: 'public_ro', hint: 'Read-Only erişim için community string' },
                        { name: 'rw_comm', why: 'Yazma yetkili community, cihazı SNMP üzerinden yeniden yapılandırmaya izin verir. <b>Gerçekten gerekmedikçe tanımlama.</b>', label: 'RW Community', type: 'text', placeholder: 'private_rw', hint: 'Read-Write erişim — mümkünse kullanmayın', optional: true },
                        { name: 'contact', why: 'Sorumlu kişi/ekip. Devir teslimlerde ve gece arızalarında kime ulaşılacağını gösterir.', label: 'Contact', type: 'text', placeholder: 'noc@example.com', optional: true },
                        { name: 'location', why: 'Fiziksel konum. 200 cihazlı bir ağda arızalı cihazı bulmanın en hızlı yolu budur — boş bırakma.', label: 'Location', type: 'text', placeholder: 'Istanbul-DC1', optional: true },
                        { name: 'trap_host', why: 'Trap alıcısı (NMS). Tanımlanmazsa cihaz arıza bildirmez; sorunları ancak kullanıcı şikayetiyle öğrenirsin.', label: 'Trap Host', type: 'text', validate: 'ip', placeholder: '10.0.0.100', optional: true },
                        { name: 'trap_comm', why: "Trap community'sini okuma community'sinden ayrı tut. <code>public</code> bırakmak, cihaz envanterini ağı dinleyen herkese açık hale getirir.", label: 'Trap Community', type: 'text', placeholder: 'trap_comm', optional: true }
                    ]
                }
            ],
            submit: 'SNMP Konfigürasyonu Oluştur'
        }, (data) => {
            const ver = data._cgtype;
            let c = '! ========================================\n! Cisco IOS SNMP Configuration\n! ========================================\n\n';
            if (ver === 'v3') {
                if (data.v3_view) c += 'snmp-server view ' + cgEsc(data.v3_view) + ' iso included\n';
                c += 'snmp-server group ' + data.v3_group + ' v3 priv' + (data.v3_view ? ' read ' + cgEsc(data.v3_view) : '') + '\n';
                c += 'snmp-server user ' + data.v3_user + ' ' + data.v3_group + ' v3 auth sha ' + data.v3_auth + ' priv aes 256 ' + data.v3_priv + '\n';
                if (data.contact) c += 'snmp-server contact ' + data.contact + '\n';
                if (data.location) c += 'snmp-server location ' + data.location + '\n';
                if (data.trap_host) { c += 'snmp-server host ' + data.trap_host + ' version 3 priv ' + data.v3_user + '\nsnmp-server enable traps\n'; }
                if (data.mgmt_net && data.mgmt_wild) { c += 'ip access-list standard SNMP-ACCESS\n permit ' + data.mgmt_net + ' ' + data.mgmt_wild + '\n!\nsnmp-server community SNMPV3 RO SNMP-ACCESS\n'; }
            } else {
                c += 'snmp-server community ' + data.ro_comm + ' RO\n';
                if (data.rw_comm) c += 'snmp-server community ' + data.rw_comm + ' RW\n';
                if (data.contact) c += 'snmp-server contact ' + data.contact + '\n';
                if (data.location) c += 'snmp-server location ' + data.location + '\n';
                if (data.trap_host) c += 'snmp-server host ' + data.trap_host + ' version 2c ' + (data.trap_comm || data.ro_comm) + '\n';
            }
            c += '!\n! Doğrulama: show snmp | show snmp group | show snmp user\n';
            return c;
        });
    }
};

// ── AAA ───────────────────────────────────────────────────────────────────────
CiscoIOS.aaa = {
    label: 'AAA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-check',
                title: 'AAA — Authentication, Authorization, Accounting',
                desc: '<strong>Authentication</strong> (kim?), <strong>Authorization</strong> (ne yapabilir?), <strong>Accounting</strong> (ne yaptı?). TACACS+ veya RADIUS sunucusu ile merkezi kimlik doğrulama.'
            },
            sections: [
                {
                    title: 'Auth Yöntemi',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'auth_method', why: '<code>local</code> cihaz üzerindeki kullanıcıları, TACACS+/RADIUS merkezi sunucuyu kullanır. Merkezi doğrulamada <b>mutlaka local yedek</b> tanımla — sunucu erişilemezse cihaza giremezsin.', label: 'Auth Yöntemi', type: 'select', required: true, options: [
                            { value: 'local', label: 'Sadece Local' },
                            { value: 'tacacs', label: 'TACACS+ (fallback local)' },
                            { value: 'radius', label: 'RADIUS (fallback local)' },
                            { value: 'tacacs_only', label: 'Sadece TACACS+' },
                            { value: 'radius_only', label: 'Sadece RADIUS' }
                        ]}
                    ]
                },
                {
                    title: 'TACACS+ Sunucu',
                    icon: 'fas fa-server',
                    info: 'TACACS+ seçildiğinde doldurulması gerekir.',
                    fields: [
                        { name: 'tacacs_ip', why: "TACACS+ sunucusuna giden yol <b>her koşulda</b> açık olmalı. Sunucu erişilemez ve local fallback tanımlı değilse cihaza hiç giriş yapamazsın.", label: 'Sunucu IP', type: 'text', requiredIf: { field: 'auth_method', in: ['tacacs', 'tacacs_only'] }, validate: 'ip', placeholder: '10.0.0.10', hint: 'TACACS+ sunucusunun IP adresi' },
                        { name: 'tacacs_key', why: 'Paylaşılan anahtar cihazda ve sunucuda birebir aynı olmalı. TACACS+ komut bazlı yetkilendirme yapabilir, RADIUS yapamaz.', label: 'Key', type: 'text', requiredIf: { field: 'auth_method', in: ['tacacs', 'tacacs_only'] }, placeholder: 'SecretKey123', hint: 'Shared secret — cihaz ve sunucuda aynı olmalı' }
                    ]
                },
                {
                    title: 'RADIUS Sunucu',
                    icon: 'fas fa-server',
                    info: 'RADIUS seçildiğinde doldurulması gerekir.',
                    fields: [
                        { name: 'radius_ip', why: "RADIUS UDP 1812/1813 kullanır (eski cihazlarda 1645/1646). Yanlış port sunucu yanıt vermiyor hatası verir ve sunucu tarafında hiç iz bırakmaz.", label: 'Sunucu IP', type: 'text', requiredIf: { field: 'auth_method', in: ['radius', 'radius_only'] }, validate: 'ip', placeholder: '10.0.0.20', hint: 'RADIUS sunucusunun IP adresi' },
                        { name: 'radius_key', why: "Paylaşılan anahtar cihaz ve sunucuda birebir aynı olmalı. Uyuşmazlıkta sunucu isteği sessizce düşürür; cihaz tarafında yalnızca timeout görürsün.", label: 'Key', type: 'text', requiredIf: { field: 'auth_method', in: ['radius', 'radius_only'] }, placeholder: 'SecretKey123', hint: 'Shared secret — auth-port 1812, acct-port 1813' }
                    ]
                },
                {
                    title: 'Line Yapılandırması',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'sess_id', why: 'Kimlik doğrulama, yetkilendirme ve accounting kayıtlarının aynı oturum numarasını taşımasını sağlar; SIEM\'de bir oturumun tüm adımları eşlenebilir.', label: 'aaa session-id common', type: 'checkbox', checked: true },
                        { name: 'vty_range', why: "Genelde <code>0 4</code> (5 eşzamanlı oturum) ya da <code>0 15</code>. Yalnızca <code>0 4</code>'ü yapılandırıp 5-15'i unutmak, o hatlardan <b>korumasız</b> erişim bırakır.", label: 'VTY Line Aralığı', type: 'text', value: '0 15', hint: 'Genelde "0 15" — tüm VTY satırları' }
                    ]
                }
            ],
            submit: 'AAA Konfigürasyonu Oluştur'
        }, (data) => {
            const method = data.auth_method;
            const vty = data.vty_range || '0 15';
            const useTacacs = method.includes('tacacs');
            const useRadius = method.includes('radius');
            const fallback = method.endsWith('_only') ? '' : ' local';
            const grp = useTacacs ? 'tacacs+' : (useRadius ? 'radius' : '');
            let c = '! ========================================\n! Cisco IOS AAA Configuration\n! ========================================\n\naaa new-model\n' + (data.sess_id ? 'aaa session-id common\n' : '') + '!\n';
            if (useTacacs) {
                c += 'tacacs server PRIMARY\n address ipv4 ' + data.tacacs_ip + '\n key ' + data.tacacs_key + '\nexit\n!\n';
            }
            if (useRadius) {
                c += 'radius server PRIMARY\n address ipv4 ' + data.radius_ip + ' auth-port 1812 acct-port 1813\n key ' + data.radius_key + '\nexit\n!\n';
            }
            if (method === 'local') {
                c += 'aaa authentication login default local\naaa authorization exec default local\n';
            } else {
                c += 'aaa authentication login default group ' + grp + fallback + '\n';
                c += 'aaa authorization exec default group ' + grp + ' local if-authenticated\n';
                c += 'aaa accounting exec default start-stop group ' + grp + '\n';
            }
            c += '!\nline vty ' + vty + '\n login authentication default\n transport input ssh\nexit\n';
            c += '!\n! Doğrulama: show aaa servers | debug aaa authentication\n';
            return c;
        });
    }
};

// ── TACACS+ ───────────────────────────────────────────────────────────────────
CiscoIOS.tacacs = {
    label: 'TACACS+',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'TACACS+ — Terminal Access Controller Access-Control System Plus',
                desc: 'Cisco AAA protokolü. Tüm bileşenler şifreli, ayrı yetkilendirme, port 49. Merkezi kimlik yönetimi için kullanılır.'
            },
            sections: [
                {
                    title: 'Birincil Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'pri_name', why: "Sunucu adı yereldir ve AAA grubunda referans alınır. Sıralama ada göre değil, grup içindeki yazım sırasına göre belirlenir.", label: 'Sunucu Adı', type: 'text', required: true, placeholder: 'TACACS-PRIMARY', hint: 'Cihaz üzerindeki referans adı' },
                        { name: 'pri_ip', why: "Birincil kimlik doğrulama sunucusu. Yönetim ağına giden rota ya da araya giren bir ACL bu IP'yi engelliyorsa tüm oturumlar timeout'a düşer.", label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10' },
                        { name: 'pri_key', why: "Anahtar iki tarafta birebir aynı olmalı; kopyala-yapıştırda sondaki boşluk klasik hatadır. <code>service password-encryption</code> bunu güvenli hale getirmez, yalnızca gizler.", label: 'Key', type: 'text', required: true, placeholder: 'SecretKey123', hint: 'Shared secret — sunucu ve cihazda aynı olmalı' },
                        { name: 'grp_name', why: "AAA grup adı <code>aaa authentication</code> satırlarında kullanılır. Adı yanlış yazarsan cihaz sessizce varsayılana (local ya da none) düşer — bu fark edilmezse ciddi açıktır.", label: 'AAA Grup Adı', type: 'text', required: true, placeholder: 'TACACS_GROUP', hint: 'aaa group server tacacs+ için grup adı' }
                    ]
                },
                {
                    title: 'İkincil Sunucu',
                    icon: 'fas fa-server',
                    info: 'Yedek TACACS+ sunucusu — birincil erişilemez olduğunda devreye girer.',
                    fields: [
                        { name: 'sec_name', why: "İkincil sunucu tanımı birincil çöktüğünde devreye girer. AAA grubunun içine eklemeyi unutursan yedek sunucu hiçbir zaman denenmez.", label: 'Sunucu Adı', type: 'text', placeholder: 'TACACS-SECONDARY', optional: true },
                        { name: 'sec_ip', why: "Yedek sunucu birincilden <b>farklı</b> bir ağ yolunda olmalı. Aynı switch'e bağlı iki sunucu gerçek yedeklilik sağlamaz.", label: 'Sunucu IP', type: 'text', validate: 'ip', placeholder: '10.0.0.11', optional: true },
                        { name: 'sec_key', why: "Yedek sunucunun anahtarı ayrıdır. Birincilinkini kopyalayıp sunucu tarafında farklı tanımlamak, failover anında toplu kimlik doğrulama hatasına yol açar.", label: 'Key', type: 'text', placeholder: 'SecretKey123 (boş = birincil ile aynı)', optional: true }
                    ]
                },
                {
                    title: 'Lokal Fallback',
                    icon: 'fas fa-user',
                    info: 'TACACS+ erişilemez olduğunda kullanılacak lokal hesap.',
                    fields: [
                        { name: 'local_user', why: 'AAA sunucusu erişilemez olduğunda kullanılacak yedek hesap. Bu hesabı tanımlamamak, yönetim ağı kopunca cihaza erişimin tamamen kesilmesi demektir.', label: 'Local Kullanıcı', type: 'text', placeholder: 'admin', optional: true },
                        { name: 'local_pass', why: "Local fallback, AAA sunucuları erişilemezken cihaza girmenin <b>tek</b> yoludur. Tanımlamazsan WAN kesintisinde cihaza yalnızca konsol kablosuyla ulaşabilirsin.", label: 'Local Şifre', type: 'text', placeholder: 'LocalPass123!', optional: true },
                        { name: 'login_protect', why: 'Ardışık başarısız girişlerde oturum açmayı geçici bloklar. Brute-force denemelerini pratikte durduran basit ve etkili bir ayardır.', label: 'Login block-for etkinleştir (5 yanlış girişte 5 dk blok)', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'TACACS+ Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS TACACS+ Configuration\n! ========================================\n\n';
            c += 'tacacs server ' + data.pri_name + '\n address ipv4 ' + data.pri_ip + '\n key ' + data.pri_key + '\nexit\n';
            if (data.sec_name && data.sec_ip) {
                c += 'tacacs server ' + data.sec_name + '\n address ipv4 ' + data.sec_ip + '\n key ' + (data.sec_key || data.pri_key) + '\nexit\n';
            }
            c += '!\naaa group server tacacs+ ' + data.grp_name + '\n server name ' + data.pri_name + '\n';
            if (data.sec_name && data.sec_ip) c += ' server name ' + data.sec_name + '\n';
            c += 'exit\n!\naaa new-model\naaa authentication login default group ' + data.grp_name + ' local\naaa authorization exec default group ' + data.grp_name + ' local\naaa accounting exec default start-stop group ' + data.grp_name + '\n';
            if (data.local_user && data.local_pass) c += '!\nusername ' + data.local_user + ' privilege 15 secret ' + data.local_pass + '\n';
            c += '!\nline vty 0 15\n login authentication default\n authorization exec default\n transport input ssh\nexit\n';
            if (data.login_protect === true) c += '!\nlogin block-for 300 attempts 5 within 120\n';
            c += '!\n! Doğrulama: show aaa servers | test aaa group ' + data.grp_name + ' ' + (data.local_user || '<kullanici>') + ' <parola> legacy\n';
            return c;
        });
    }
};

// ── SSH ───────────────────────────────────────────────────────────────────────
CiscoIOS.ssh = {
    label: 'SSH',
    // Sözdizimi: canlı config — ip domain name (16) / ip domain-name (6), ip ssh time-out (18),
    // authentication-retries (18), server algorithm encryption/mac/kex (11), dh min size (3), vty access-class (11)
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-terminal', title: 'SSH — Güvenli Uzak Erişim', desc: 'RSA anahtarı üretir, SSHv2\'yi zorunlu kılar, VTY hatlarını yalnız SSH\'e açar. Algoritma listesi ve yönetim ACL\'i ile eski/zayıf şifreleme ve yetkisiz kaynaklar dışarıda tutulur.' },
            sections: [
                {
                    title: 'Kimlik', icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', why: 'SSH anahtarı üretmek için hostname <b>ve</b> domain adı tanımlı olmalıdır. Varsayılan <code>Router</code> adıyla anahtar üretilemez.', label: 'Hostname', type: 'text', validate: 'hostname', required: true, placeholder: 'ROUTER-01', hint: 'Cihaz adı — RSA anahtar adını belirler' },
                        { name: 'domain', why: 'SSH anahtarı üretmek için hostname <b>ve</b> domain adı tanımlı olmalıdır. Eksikse <code>crypto key generate rsa</code> komutu hata verir.', label: 'Domain Name', type: 'text', required: true, placeholder: 'example.com', hint: 'RSA anahtarı için gerekli' },
                        { name: 'dom_syntax', why: 'IOS-XE 16 ve sonrası running-config\'e <code>ip domain name</code> (boşluklu) yazar; klasik IOS <code>ip domain-name</code> ister. Yanlış biçim eski sürümde komut hatası verir.', label: 'Domain komutu biçimi', type: 'select', options: [
                            { value: 'new', label: 'ip domain name (IOS-XE 16+)', selected: true },
                            { value: 'old', label: 'ip domain-name (klasik IOS)' }
                        ]}
                    ]
                },
                {
                    title: 'SSH Ayarları', icon: 'fas fa-lock',
                    fields: [
                        { name: 'key_size', why: 'RSA anahtar boyutu. <b>768 bit altı SSHv2 desteklemez</b>; 2048 bit günümüz için alt sınırdır.', label: 'RSA Key Boyutu', type: 'select', options: [
                            { value: '2048', label: '2048 bit (Önerilen)', selected: true },
                            { value: '4096', label: '4096 bit' }
                        ], hint: '1024 bit artık güvenli değildir' },
                        { name: 'ssh_timeout', label: 'Oturum Açma Zaman Aşımı (sn)', type: 'text', min: 1, max: 120, placeholder: '60', hint: 'ip ssh time-out — boş = yazılmaz' },
                        { name: 'ssh_retries', label: 'Kimlik Doğrulama Deneme Hakkı', type: 'text', min: 0, max: 5, placeholder: '3', hint: 'ip ssh authentication-retries — boş = yazılmaz' },
                        { name: 'ssh_algo', why: 'Varsayılan liste eski CBC şifreleri ve SHA-1 MAC\'leri içerebilir; denetimlerde (PCI, BDDK) zayıf algoritma bulgusu olarak işaretlenir.', label: 'Algoritmalar', type: 'select', options: [
                            { value: 'strong', label: 'Güçlü liste (aes-ctr, hmac-sha2, dh-group14/ecdh)', selected: true },
                            { value: 'keep', label: 'Cihaz varsayılanı' }
                        ]},
                        { name: 'dh_min', label: 'DH minimum boyutu 2048 bit', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'VTY Erişimi', icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vty_acl', why: 'Yönetim ACL\'i olmadan VTY hatlarına ulaşabilen her kaynak kaba kuvvet deneyebilir. Standart ACL numarası veya adı yazın; ACL önceden tanımlı olmalı.', label: 'Yönetim ACL\'i', type: 'text', placeholder: 'MGMT-ACCESS', hint: 'line vty → access-class <ACL> in — boş = kısıtlama yok' },
                        { name: 'vty_login', label: 'VTY Kimlik Doğrulama', type: 'select', options: [
                            { value: 'local', label: 'login local (yerel kullanıcılar)', selected: true },
                            { value: 'aaa', label: 'AAA (login authentication default)' }
                        ], hint: 'AAA seçilirse AAA aracındaki liste kullanılır' }
                    ]
                },
                {
                    title: 'Lokal Kullanıcı', icon: 'fas fa-user',
                    info: 'login local seçiliyse cihazda en az bir yerel kullanıcı olmalıdır; yoksa SSH ile giriş yapılamaz.',
                    fields: [
                        { name: 'ssh_user', why: "SSH için en az bir yerel kullanıcı ve <code>login local</code> şarttır. Kullanıcı oluşturmadan <code>transport input ssh</code> yazmak seni cihazın dışında bırakır.", label: 'Kullanıcı Adı', type: 'text', placeholder: 'admin', hint: 'Boş = kullanıcı oluşturulmaz' },
                        { name: 'ssh_pass', why: "<code>secret</code> kullan, <code>password</code> değil: ikincisi geri çevrilebilir şekilde saklanır ve config paylaşıldığında şifre açığa çıkar.", label: 'Şifre', type: 'text', placeholder: 'Admin123!', hint: 'secret (tip 9/8 hash) olarak saklanır' }
                    ]
                }
            ],
            submit: 'SSH Konfigürasyonu Oluştur'
        }, (data) => {
            const h = cgEsc(data.hostname || ''), d = cgEsc(data.domain || ''), u = cgEsc(data.ssh_user || ''), pw = cgEsc(data.ssh_pass || '');
            const to = cgEsc(data.ssh_timeout || ''), rt = cgEsc(data.ssh_retries || ''), acl = cgEsc(data.vty_acl || '');
            let c = '! ========================================\n! Cisco IOS SSH Configuration\n! ========================================\n\n';
            if (data.vty_login !== 'aaa' && !(u && pw))
                c += '! UYARI: login local seçili ama yerel kullanıcı tanımlanmadı — cihazda kullanıcı yoksa SSH ile giriş yapılamaz.\n';
            c += 'hostname ' + h + '\n' + (data.dom_syntax === 'old' ? 'ip domain-name ' : 'ip domain name ') + d + '\n!\n';
            c += 'crypto key generate rsa modulus ' + cgEsc(data.key_size || '') + '\n!\n';
            c += 'ip ssh version 2\n';
            if (to) c += 'ip ssh time-out ' + to + '\n';
            if (rt) c += 'ip ssh authentication-retries ' + rt + '\n';
            if (data.dh_min) c += 'ip ssh dh min size 2048\n';
            if (data.ssh_algo === 'strong') {
                c += 'ip ssh server algorithm encryption aes256-ctr aes192-ctr aes128-ctr\n';
                c += 'ip ssh server algorithm mac hmac-sha2-256 hmac-sha2-512\n';
                c += 'ip ssh server algorithm kex diffie-hellman-group14-sha256 ecdh-sha2-nistp256\n';
            }
            c += '!\n';
            if (u && pw) c += 'username ' + u + ' privilege 15 secret ' + pw + '\n!\n';
            c += 'line vty 0 15\n';
            if (acl) c += ' access-class ' + acl + ' in\n';
            c += ' transport input ssh\n' + (data.vty_login === 'aaa' ? ' login authentication default\n' : ' login local\n') + 'exit\n';
            c += '!\n! Doğrulama:\n! show ip ssh\n! show ssh\n! show line vty 0 4\n';
            return c;
        });
    }
};

// ── PASSWORD / USER ───────────────────────────────────────────────────────────
CiscoIOS.password = {
    label: 'Password/User',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-key',
                title: 'Password / User — Şifre ve Kullanıcı Yönetimi',
                desc: 'Cihaz erişim şifreleri ve yerel kullanıcı hesapları. Enable secret, console/VTY şifreleri ve privilege level yönetimi.'
            },
            sections: [
                {
                    title: 'Enable & Servis',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'enable_secret', why: "<code>enable secret</code> hash'lenir, <code>enable password</code> ise geri döndürülebilir zayıf şifreleme kullanır. Her zaman <code>secret</code> kullan.", label: 'Enable Secret', type: 'text', required: true, placeholder: 'EnSecret123!', hint: 'Privileged EXEC moduna geçiş şifresi — "enable password" yerine bu kullanılmalı' },
                        { name: 'pwd_enc', why: '<code>service password-encryption</code> yalnızca Type 7 zayıf şifreleme uygular ve saniyeler içinde çözülür. Gerçek koruma değil, sadece omuz sörfünü engeller.', label: 'service password-encryption ekle', type: 'checkbox', checked: true, hint: 'Running config\'deki şifreleri şifreler' }
                    ]
                },
                {
                    title: 'Console Line',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'con_local', why: "Konsolda <code>login local</code> açmak, yerel kullanıcı yoksa konsolu da kilitler. Önce kullanıcıyı oluştur, sonra bu satırı uygula.", label: 'login local (console)', type: 'checkbox', checked: true },
                        { name: 'con_pass', why: "Konsol şifresi fiziksel erişime karşı son savunmadır. Boş bırakmak, rack'e ulaşan herkesin doğrudan <code>enable</code> moduna geçmesi demektir.", label: 'Console Şifre', type: 'text', placeholder: 'Boş = login local kullanılır', optional: true, hint: 'Sadece login local kullanmıyorsanız doldurun' },
                        { name: 'con_timeout', why: "<code>exec-timeout 0 0</code> oturumu hiç kapatmaz; açık unutulmuş bir konsol oturumu ciddi bir güvenlik açığıdır. 5-10 dakika makul bir değerdir.", label: 'Exec Timeout (dk)', type: 'number', value: '5', hint: '0 = timeout yok (önerilmez)', min: 0 }
                    ]
                },
                {
                    title: 'VTY Lines',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'vty_timeout', why: 'Boşta kalan oturumu kapatır. <code>exec-timeout 0 0</code> (sınırsız) bırakmak, açık unutulan oturumların ele geçirilmesine yol açar.', label: 'Exec Timeout (dk)', type: 'number', value: '10', min: 0 },
                        { name: 'motd', why: "Yasal uyarı banner'ı, yetkisiz erişim davalarında önem taşır. Hoş geldiniz benzeri ifadeler kullanma; erişimin yalnızca yetkili kişilere açık olduğunu yaz.", label: 'MOTD banner ekle', type: 'checkbox', hint: 'Yetkisiz erişim uyarı mesajı' }
                    ]
                }
            ],
            submit: 'Password Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS Password / User Configuration\n! ========================================\n\n';
            c += 'enable secret ' + data.enable_secret + '\n';
            if (data.pwd_enc === true) c += 'service password-encryption\n';
            c += '!\nline console 0\n';
            if (data.con_pass) { c += ' password ' + data.con_pass + '\n login\n'; }
            else if (data.con_local === true) { c += ' login local\n'; }
            c += ' exec-timeout ' + (data.con_timeout || '5') + ' 0\nexit\n';
            c += '!\nline vty 0 15\n login local\n exec-timeout ' + (data.vty_timeout || '10') + ' 0\nexit\n';
            if (data.motd === true) c += '!\nbanner motd ^WARNING: Unauthorized access to this device is prohibited!^\n';
            c += '!\n! Doğrulama: show running-config | include enable|password|username\n';
            return c;
        });
    }
};

// ── FHRP (HSRP / VRRP / GLBP) ────────────────────────────────────────────────
CiscoIOS.vrrp = {
    label: 'HSRP/VRRP/GLBP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'FHRP — First Hop Redundancy Protocol',
                desc: 'First-Hop Redundancy — gateway yedekliği. <strong>HSRP</strong> (Cisco özel), <strong>VRRP</strong> (standart RFC), <strong>GLBP</strong> (yük dengeleme + yedeklilik).'
            },
            configTypes: [
                { id: 'hsrp', label: 'HSRP', icon: 'fas fa-exchange-alt', desc: 'Hot Standby Router Protocol — Cisco özel', badge: { text: 'Cisco', cls: 'common' } },
                { id: 'vrrp', label: 'VRRP', icon: 'fas fa-sync-alt', desc: 'Virtual Router Redundancy Protocol — standart RFC', badge: { text: 'Standart', cls: 'recommended' } },
                { id: 'glbp', label: 'GLBP', icon: 'fas fa-random', desc: 'Gateway Load Balancing Protocol — yük dengeleme', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Ortak Parametreler',
                    icon: 'fas fa-cog',
                    showFor: ['hsrp', 'vrrp', 'glbp'],
                    fields: [
                        { name: 'fhrp_iface', why: "FHRP yalnızca yönlendirilen arayüzde (SVI ya da routed port) çalışır; <code>switchport</code> modundaki portta yapılandıramazsın. İki cihazda da aynı VLAN/arayüz kullanılmalı.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Virtual IP\'nin atanacağı Layer-3 interface' },
                        { name: 'fhrp_group', why: "Grup numarası iki router'da aynı olmalı. Aynı VLAN'daki farklı gruplar ise çakışmamalıdır.", label: 'Grup No', type: 'text', required: true, placeholder: '1', hint: 'HSRP/VRRP/GLBP grup numarası' },
                        { name: 'virtual_ip', why: "İstemcilerin gateway olarak gördüğü sanal IP. Fiziksel arayüz IP'lerinden farklı ve <b>aynı subnet'te</b> olmalıdır.", label: 'Virtual IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.254', hint: 'Gateway olarak kullanılacak sanal IP adresi' },
                        { name: 'priority', why: "Yüksek öncelik kazanır (varsayılan 100). Ama <code>preempt</code> açık değilse önceliği yükseltmek aktif rolü geri <b>almaz</b> — en sık karıştırılan ikili budur.", label: 'Priority', type: 'number', placeholder: '100 (default)', hint: 'Yüksek priority = Active/Master router. Varsayılan: 100', optional: true },
                        { name: 'preempt', why: 'Açık değilse birincil router döndüğünde rolü geri almaz. Yedeklilik planına göre bilinçli seçilmeli — preempt açmak ikinci bir kesinti demektir.', label: 'Preempt etkinleştir', type: 'checkbox', checked: true, hint: 'Yüksek priority\'li router geri döndüğünde Active rolünü geri alır' },
                        { name: 'auth_key', why: 'Kimlik doğrulama olmadan, ağa takılan herhangi bir cihaz yüksek öncelikle kendini aktif router ilan edip trafiği çalabilir.', label: 'Auth Key (MD5)', type: 'text', placeholder: 'md5 key string', hint: 'Komşu kimlik doğrulama — aynı grubun tüm router\'larında aynı olmalı', optional: true },
                        { name: 'hello', why: "Hello ve hold değerleri gruptaki tüm üyelerde aynı olmalı. Agresif (msec) değerler hızlı failover verir ama CPU yükü ve tek paket kaybında gereksiz rol değişimi riski getirir.", label: 'Hello Timer (sn)', type: 'number', placeholder: '3', optional: true },
                        { name: 'hold', why: "Hold, hello'nun yaklaşık <b>3 katı</b> olmalı. Daha kısa vermek tek bir kaybolan hello paketinde gereksiz failover tetikler.", label: 'Hold Timer (sn)', type: 'number', placeholder: '10', optional: true },
                        { name: 'track_num', why: 'İzlenen nesne (ör. WAN arayüzü) down olduğunda öncelik düşer ve rol devredilir. <b>Track olmadan FHRP, kendi arayüzü dışındaki arızalardan habersizdir</b> — WAN kopsa bile aktif kalmaya devam eder.', label: 'Track Object No', type: 'text', placeholder: '1', optional: true },
                        { name: 'track_dec', why: "Öncelik düşüş miktarı, yedek router'ın önceliğini <b>geçecek</b> kadar olmalı. Yetersiz düşüş failover'ın hiç gerçekleşmemesine yol açar.", label: 'Priority Decrement', type: 'number', placeholder: '20', optional: true }
                    ]
                },
                {
                    title: 'HSRP Ek Ayarlar',
                    icon: 'fas fa-sliders-h',
                    showFor: ['hsrp'],
                    fields: [
                        { name: 'hsrp_v2', why: "HSRPv2 farklı multicast adresi kullanır ve 4095'e kadar grup destekler. Bir cihazı v2, diğerini v1 bırakırsan birbirlerini görmez ve <b>ikisi de aktif</b> olur.", label: 'HSRP version 2 kullan', type: 'checkbox', checked: true, hint: 'v2: daha fazla grup (0-4095), IPv6 desteği' }
                    ]
                },
                {
                    title: 'GLBP Ek Ayarlar',
                    icon: 'fas fa-balance-scale',
                    showFor: ['glbp'],
                    fields: [
                        { name: 'glbp_lb', why: "GLBP, HSRP'den farklı olarak yükü gerçekten dağıtır. <code>host-dependent</code> aynı istemciyi hep aynı gateway'e bağlar; oturum durumu tutan uygulamalarda bunu seç.", label: 'Load-Balance Yöntemi', type: 'select', options: [
                            { value: '', label: 'Round-robin (default)' },
                            { value: 'weighted', label: 'Weighted' },
                            { value: 'host-dependent', label: 'Host-dependent' }
                        ]}
                    ]
                }
            ],
            submit: 'FHRP Konfigürasyonu Oluştur'
        }, (data) => {
            const proto = data._cgtype, iface = data.fhrp_iface, grp = data.fhrp_group;
            const vip = data.virtual_ip, pri = data.priority, ak = data.auth_key;
            const hello = data.hello, hold = data.hold, tn = data.track_num, td = data.track_dec;
            let c = '! ========================================\n! Cisco IOS FHRP (' + (proto||'').toUpperCase() + ') Configuration\n! ========================================\n\n';
            if (proto === 'hsrp') {
                if (data.hsrp_v2 === true) c += 'standby version 2\n';
                c += 'interface ' + iface + '\n';
                c += ' standby ' + grp + ' ip ' + vip + '\n';
                if (pri) c += ' standby ' + grp + ' priority ' + pri + '\n';
                if (data.preempt === true) c += ' standby ' + grp + ' preempt\n';
                if (ak) c += ' standby ' + grp + ' authentication md5 key-string ' + ak + '\n';
                if (tn && td) c += ' standby ' + grp + ' track ' + tn + ' decrement ' + td + '\n';
                if (hello && hold) c += ' standby ' + grp + ' timers ' + hello + ' ' + hold + '\n';
                c += 'exit\n';
            } else if (proto === 'vrrp') {
                c += 'interface ' + iface + '\n';
                c += ' vrrp ' + grp + ' address-family ipv4\n';
                c += '  address ' + vip + ' primary\n';
                if (pri) c += '  priority ' + pri + '\n';
                if (data.preempt === true) c += '  preempt\n';
                if (hello) c += '  timers advertise ' + hello + '\n';
                if (tn && td) c += '  track ' + tn + ' decrement ' + td + '\n';
                c += ' exit-address-family\nexit\n';
            } else {
                c += 'interface ' + iface + '\n';
                c += ' glbp ' + grp + ' ip ' + vip + '\n';
                if (pri) c += ' glbp ' + grp + ' priority ' + pri + '\n';
                if (data.preempt === true) c += ' glbp ' + grp + ' preempt\n';
                if (data.glbp_lb) c += ' glbp ' + grp + ' load-balancing ' + data.glbp_lb + '\n';
                if (ak) c += ' glbp ' + grp + ' authentication md5 key-string ' + ak + '\n';
                if (hello && hold) c += ' glbp ' + grp + ' timers ' + hello + ' ' + hold + '\n';
                c += 'exit\n';
            }
            c += '!\n! Doğrulama: show standby | show vrrp | show glbp\n';
            return c;
        });
    }
};

// ── STP ───────────────────────────────────────────────────────────────────────
CiscoIOS.stp = {
    label: 'STP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tree',
                title: 'STP — Spanning Tree Protocol',
                desc: 'Spanning Tree Protocol — Layer-2 döngü önleme. <strong>PVST+</strong>, <strong>Rapid-PVST</strong> ve <strong>MST</strong> modları. Root bridge seçimi ve port rollerini yönetir.'
            },
            configTypes: [
                { id: 'pvst', label: 'PVST+', icon: 'fas fa-tree', desc: 'Per-VLAN Spanning Tree — Cisco klasik', badge: { text: 'Klasik', cls: 'common' } },
                { id: 'rapid', label: 'Rapid-PVST', icon: 'fas fa-bolt', desc: 'Hızlı convergence — IEEE 802.1w tabanlı', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'mst', label: 'MST', icon: 'fas fa-sitemap', desc: 'Multiple Spanning Tree — büyük ağlar için', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Root Bridge',
                    icon: 'fas fa-crown',
                    showFor: ['pvst', 'rapid'],
                    fields: [
                        { name: 'root_vlans', why: "Her VLAN'ın ayrı spanning-tree örneği vardır (PVST+). Root'u VLAN bazında planlamak trafiği dengeler.", label: 'VLANs', type: 'text', validate: 'vlan_list', placeholder: '1,10,20', hint: 'Root bridge olunacak VLAN listesi', optional: true },
                        { name: 'root_type', why: "<code>primary</code> önceliği 24576, <code>secondary</code> 28672 yapar. Root bridge'i <b>elle belirlemezsen</b> en düşük MAC'li switch root olur — genelde en eski ve en yavaş cihaz.", label: 'Root Tipi', type: 'select', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }] }
                    ]
                },
                {
                    title: 'MST Yapılandırması',
                    icon: 'fas fa-sitemap',
                    showFor: ['mst'],
                    fields: [
                        { name: 'mst_region', why: "MST'de <b>region adı, revizyon ve VLAN-instance eşlemesi</b> tüm switch'lerde birebir aynı olmalı. En ufak fark, switch'lerin ayrı region sanmasına ve topolojinin bozulmasına yol açar.", label: 'Region Adı', type: 'text', placeholder: 'MST_REGION_1', optional: true },
                        { name: 'mst_rev', why: 'Revizyon numarası region kimliğinin parçasıdır. Değiştirmeyi unutmak sessiz topoloji hatalarının klasik sebebidir.', label: 'Revision', type: 'number', min: 0, max: 65535, placeholder: '1', optional: true },
                        { name: 'mst_inst', why: "MST instance'ı VLAN gruplarını tek topolojiye eşler. Region adı, revizyon numarası ve VLAN-instance eşlemesi tüm switch'lerde <b>birebir</b> aynı olmalı.", label: 'Instance No', type: 'text', placeholder: '1', optional: true },
                        { name: 'mst_vlans', why: "Bir VLAN yalnızca tek instance'a ait olabilir. Eşlemeyi bir cihazda değiştirip diğerlerinde unutmak ağı iki ayrı region'a böler ve döngü riski doğurur.", label: 'MST VLANs', type: 'text', validate: 'vlan_list', placeholder: '10,20,30', optional: true },
                        { name: 'root_type', why: "<code>primary</code> önceliği 24576, <code>secondary</code> 28672 yapar. Root bridge'i <b>elle belirlemezsen</b> en düşük MAC'li switch root olur — genelde en eski ve en yavaş cihaz.", label: 'Root Tipi', type: 'select', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }] }
                    ]
                },
                {
                    title: 'Global Özellikler',
                    icon: 'fas fa-cog',
                    showFor: ['pvst', 'rapid', 'mst'],
                    fields: [
                        { name: 'pf_syntax', why: 'IOS 15.2(2)E ve IOS-XE PortFast\'ı <code>portfast edge</code> olarak yazar; eski IOS yalnız <code>portfast</code> tanır.', label: 'PortFast biçimi', type: 'select', options: [
                            { value: 'edge', label: 'portfast edge (IOS 15.2E+ / IOS-XE)', selected: true },
                            { value: 'classic', label: 'portfast (eski IOS)' }
                        ]},
                        { name: 'ext_sysid', why: 'Bridge ID\'ye VLAN numarasını ekler; 4096\'nın katı öncelik değerlerinin ön koşuludur. Sahadaki tüm cihazlarda açık.', label: 'spanning-tree extend system-id', type: 'checkbox', checked: true },
                        { name: 'portfast_def', why: "PortFast, access portu dinleme/öğrenme aşamalarını atlayarak anında forwarding'e alır. <b>Yalnızca uç cihaz portlarında</b> açılmalı; switch'e bakan portta döngü yaratır.", label: 'spanning-tree portfast default', type: 'checkbox', hint: 'Tüm access portlarda portfast etkinleştirir' },
                        { name: 'bpduguard_def', why: "PortFast açık bir porta BPDU gelirse portu kapatır. PortFast'in güvenlik tamamlayıcısıdır — <b>ikisi birlikte açılmalıdır</b>, aksi halde kullanıcı kendi switch'ini takıp topolojiyi bozabilir.", label: 'spanning-tree portfast bpduguard default', type: 'checkbox', hint: 'Portfast portlarda BPDU gelirse port kapanır' },
                        { name: 'loopguard', why: "Tek yönlü link arızasında BPDU kesilirse portun yanlışlıkla forwarding'e geçmesini önler. Fiber bağlantılarda özellikle değerlidir.", label: 'spanning-tree loopguard default', type: 'checkbox' },
                        { name: 'uplinkfast', why: "UplinkFast yalnızca <b>erişim katmanı</b> switch'lerinde anlamlıdır ve bridge priority'yi 49152'ye çıkarır. Dağıtım ya da çekirdek switch'te açmak root seçimini bozar.", label: 'spanning-tree uplinkfast', type: 'checkbox' }
                    ]
                },
                {
                    title: 'Port Yapılandırmaları',
                    icon: 'fas fa-plug',
                    showFor: ['pvst', 'rapid', 'mst'],
                    fields: [
                        { name: 'access_int', why: "PortFast yalnızca uç cihaz bağlı portlarda kullanılır. Switch bağlı bir portta açmak <b>anında döngü</b> demektir; mutlaka <code>bpduguard</code> ile birlikte kullan.", label: 'Access Port (portfast)', type: 'text', placeholder: 'GigabitEthernet0/1', optional: true },
                        { name: 'trunk_int', why: "Trunk portta PortFast kullanma. Ayrıca <code>switchport trunk allowed vlan</code> komutunu <code>add</code> olmadan vermek mevcut VLAN listesini <b>siler</b> ve tüm trunk'ı düşürür.", label: 'Trunk Port (priority 64)', type: 'text', placeholder: 'GigabitEthernet0/0', optional: true },
                        { name: 'rootguard_ports', why: "Root Guard, o porttan üstün BPDU gelirse portu bloklar. Müşteri/şube switch'ine bakan portlarda root'un ele geçirilmesini engeller.", label: 'Root Guard Ports', type: 'text', placeholder: 'GigabitEthernet0/2', optional: true }
                    ]
                }
            ],
            submit: 'STP Konfigürasyonu Oluştur'
        }, (data) => {
            const mode = data._cgtype;
            const modeMap = { pvst: 'pvst', rapid: 'rapid-pvst', mst: 'mst' };
            let c = '! ========================================\n! Cisco IOS STP Configuration\n! ========================================\n\n';
            c += 'spanning-tree mode ' + modeMap[mode] + '\n!\n';
            if (mode === 'mst') {
                const reg = data.mst_region, rev = data.mst_rev, inst = data.mst_inst, mv = data.mst_vlans;
                if (reg || inst) {
                    c += 'spanning-tree mst configuration\n';
                    if (reg) c += ' name ' + reg + '\n';
                    if (rev) c += ' revision ' + rev + '\n';
                    if (inst && mv) c += ' instance ' + inst + ' vlan ' + mv + '\n';
                    c += 'exit\n';
                    if (inst) c += 'spanning-tree mst ' + inst + ' root ' + (data.root_type || 'primary') + '\n';
                }
            } else {
                if (data.root_vlans) c += 'spanning-tree vlan ' + data.root_vlans + ' root ' + (data.root_type || 'primary') + '\n';
            }
            c += '!\n';
            if (data.portfast_def === true) c += 'spanning-tree portfast ' + (data.pf_syntax === 'classic' ? '' : 'edge ') + 'default\n';
            if (data.bpduguard_def === true) c += 'spanning-tree portfast ' + (data.pf_syntax === 'classic' ? '' : 'edge ') + 'bpduguard default\n';
            if (data.ext_sysid) c += 'spanning-tree extend system-id\n';
            if (data.loopguard === true) c += 'spanning-tree loopguard default\n';
            if (data.uplinkfast === true) c += 'spanning-tree uplinkfast\n';
            if (data.access_int) { c += '!\ninterface ' + data.access_int + '\n spanning-tree portfast' + (data.pf_syntax === 'classic' ? '' : ' edge') + '\n spanning-tree bpduguard enable\nexit\n'; }
            if (data.trunk_int) { c += '!\ninterface ' + data.trunk_int + '\n spanning-tree port-priority 64\nexit\n'; }
            if (data.rootguard_ports) { c += '!\ninterface ' + data.rootguard_ports + '\n spanning-tree guard root\nexit\n'; }
            c += '!\n! Doğrulama: show spanning-tree | show spanning-tree detail\n';
            return c;
        });
    }
};

// ── PORT SECURITY ─────────────────────────────────────────────────────────────
CiscoIOS.portSecurity = {
    label: 'Port Security',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Port Security — MAC Tabanlı Erişim Kontrolü',
                desc: 'Switch portunda izin verilen MAC adreslerini sınırlar. Yetkisiz cihaz bağlantısını engeller ve ihlalde port\'u devre dışı bırakır.'
            },
            sections: [
                {
                    title: 'Interface Seçimi',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'ps_iface', why: "Port security yalnızca access portlarda çalışır; trunk ya da DTP ile dinamik portta yapılandırılamaz. Önce <code>switchport mode access</code> ver.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'FastEthernet0/1', hint: 'Tekil port. Range için "range Fa0/1 - Fa0/10" formatında girebilirsiniz.' },
                        { name: 'access_vlan', why: "Access port tek VLAN taşır. Port'u access yapmadan VLAN atamak, portun DTP ile kendiliğinden trunk olmasına yol açabilir — <code>switchport mode access</code> her zaman açıkça yazılmalı.", label: 'Access VLAN', type: 'number', validate: 'vlan', placeholder: '10', hint: 'Port security access modda çalışır — VLAN ataması yapılır', optional: true }
                    ]
                },
                {
                    title: 'Port Security Parametreleri',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'max_mac', why: 'Porttan öğrenilecek maksimum MAC sayısı. IP telefon + PC senaryosunda en az 2 olmalı, aksi halde telefon arkasındaki PC portu düşürür.', label: 'Max MAC', type: 'number', value: '1', min: 1, hint: 'Portta izin verilen maksimum MAC adresi sayısı' },
                        { name: 'violation', why: "<code>shutdown</code> portu err-disable yapar (en katı), <code>restrict</code> fazla MAC'i düşürüp loglar, <code>protect</code> sessizce düşürür. Üretimde <code>restrict</code> genelde daha yönetilebilirdir.", label: 'Violation Aksiyonu', type: 'select', options: [
                            { value: 'shutdown', label: 'shutdown — Port kapanır (önerilen)' },
                            { value: 'restrict', label: 'restrict — Paket drop + log' },
                            { value: 'protect', label: 'protect — Paket drop, log yok' }
                        ]},
                        { name: 'sticky', why: "Öğrenilen MAC'ler running-config'e yazılır. <b>Kaydetmezsen</b> yeniden başlatmada kaybolur ve tüm portlar yeniden öğrenir.", label: 'Sticky MAC learning etkinleştir', type: 'checkbox', checked: true, hint: 'Öğrenilen MAC adresleri running-config\'e kaydedilir' },
                        { name: 'sticky_mac', why: "Sticky MAC öğrenilen adresi çalışan config'e yazar, ama <code>write memory</code> demezsen reboot sonrası kaybolur ve port yeni MAC'i öğrenir.", label: 'Sticky MAC (manuel)', type: 'text', placeholder: '0000.1111.2222 (boş = dynamic)', hint: 'Belirli bir MAC adresi sabitlemek istiyorsanız girin', optional: true },
                        { name: 'aging_time', why: "Aging 0 (varsayılan) öğrenilen adreslerin <b>hiç</b> düşmemesi demektir. Ortak kullanılan masalarda bu, cihaz değişince portun kapanmasına yol açar.", label: 'Aging Time (dk)', type: 'number', min: 1, max: 1440, placeholder: '30', optional: true },
                        { name: 'aging_type', why: "<code>absolute</code> süre dolunca siler, <code>inactivity</code> yalnızca trafik kesilince. IP telefon arkası PC gibi aralıklı trafik üreten uçlarda <code>inactivity</code> daha doğrudur.", label: 'Aging Type', type: 'select', options: [
                            { value: '', label: 'Yok' },
                            { value: 'absolute', label: 'absolute' },
                            { value: 'inactivity', label: 'inactivity' }
                        ]}
                    ]
                },
                {
                    title: 'Auto Recovery',
                    icon: 'fas fa-redo',
                    info: 'Violation sonucu err-disabled olan portun otomatik kurtarılması.',
                    fields: [
                        { name: 'auto_rec', why: 'err-disable olan portu belirli süre sonra otomatik açar. Açmazsan her ihlalde sahaya gitmek gerekir.', label: 'errdisable recovery etkinleştir', type: 'checkbox' },
                        { name: 'rec_interval', why: "<code>errdisable recovery</code> portu otomatik açar. Süre çok kısaysa gerçek bir döngü sürekli açılıp kapanır; bu ayar kök nedeni çözmez, yalnızca belirtiyi gizler.", label: 'Recovery Interval (sn)', type: 'number', min: 30, max: 86400, placeholder: '300', optional: true }
                    ]
                }
            ],
            submit: 'Port Security Konfigürasyonu Oluştur'
        }, (data) => {
            const ifaceStr = data.ps_iface;
            let c = '! ========================================\n! Cisco IOS Port Security Configuration\n! ========================================\n\n';
            if (data.auto_rec === true) {
                c += 'errdisable recovery interval ' + (data.rec_interval || '300') + '\nerrdisable recovery cause psecure-violation\n!\n';
            }
            c += 'interface ' + ifaceStr + '\n switchport mode access\n';
            if (data.access_vlan) c += ' switchport access vlan ' + data.access_vlan + '\n';
            c += ' switchport port-security\n';
            c += ' switchport port-security maximum ' + (data.max_mac || '1') + '\n';
            c += ' switchport port-security violation ' + (data.violation || 'shutdown') + '\n';
            if (data.sticky === true) {
                c += ' switchport port-security mac-address sticky\n';
                if (data.sticky_mac) c += ' switchport port-security mac-address sticky ' + data.sticky_mac + '\n';
            }
            if (data.aging_time) {
                c += ' switchport port-security aging time ' + data.aging_time + '\n';
                if (data.aging_type) c += ' switchport port-security aging type ' + data.aging_type + '\n';
            }
            c += 'exit\n!\n! Doğrulama: show port-security | show port-security address\n';
            return c;
        });
    }
};

// ── QoS ───────────────────────────────────────────────────────────────────────
CiscoIOS.qos = {
    label: 'QoS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS — Quality of Service',
                desc: 'Quality of Service — trafik önceliklendirme. DSCP/CoS işaretleme, policing (trafik sınırlama) ve shaping (tampon kullanımı).'
            },
            configTypes: [
                { id: 'manual', label: 'Manuel QoS', icon: 'fas fa-sliders-h', desc: 'Class-Map + Policy-Map — tam kontrol', badge: { text: 'Esnek', cls: 'advanced' } },
                { id: 'ratelimit', label: 'Rate Limit', icon: 'fas fa-tachometer-alt', desc: 'Basit bant genişliği sınırlama', badge: { text: 'Basit', cls: 'common' } },
                { id: 'auto', label: 'Auto QoS', icon: 'fas fa-magic', desc: 'Cisco IP telefon için otomatik QoS', badge: { text: 'VoIP', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'Class-Map / Policy-Map',
                    icon: 'fas fa-layer-group',
                    showFor: ['manual'],
                    fields: [
                        { name: 'class_name', why: "Class-map adı büyük/küçük harfe <b>duyarlıdır</b>. Policy-map içinde farklı yazarsan IOS yeni ve boş bir class oluşturur; trafik hiçbir zaman eşleşmez.", label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'VOICE-CLASS' },
                        { name: 'match_type', why: "Class-map eşleşme kriteri. <code>match-all</code> tüm koşulları, <code>match-any</code> herhangi birini arar — varsayılan <code>match-all</code>'dur ve sık atlanır.", label: 'Match Tipi', type: 'select', options: [{ value: 'dscp', label: 'DSCP' }, { value: 'protocol', label: 'Protocol' }, { value: 'acl', label: 'ACL' }] },
                        { name: 'match_val', why: "Değer seçilen match tipiyle uyumlu olmalı: DSCP için <code>ef</code>, ACL için ACL adı. Uyumsuz değer, sessizce hiçbir şeye eşleşmeyen bir class üretir.", label: 'Match Değeri', type: 'text', placeholder: 'ef | voip | VOICE-ACL', optional: true },
                        { name: 'policy_name', why: "Policy-map, <code>service-policy</code> ile bir arayüze bağlanmadıkça hiçbir etki yaratmaz. Tanımlamak uygulamak değildir.", label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'QOS-POLICY' },
                        { name: 'set_dscp', why: "DSCP işaretlemesi ağın <b>tamamında</b> tutarlı olmalı. Bir cihazda işaretleyip diğerinde güvenmemek (trust boundary), QoS'un hiç çalışmamasına yol açar.", label: 'Set DSCP', type: 'select', options: [{ value: '', label: 'Yok' }, { value: 'ef', label: 'ef (Voice)' }, { value: 'af41', label: 'af41' }, { value: 'af31', label: 'af31' }, { value: 'cs3', label: 'cs3' }] },
                        { name: 'police_en', why: "Policing fazla trafiği <b>düşürür</b>, shaping ise kuyruklar. Hassas uygulamalarda policing ani paket kaybına yol açar; önce shaping'i değerlendir.", label: 'Police ekle', type: 'checkbox' },
                        { name: 'm_cir', why: 'Taahhüt edilen hız (bit/sn). Burst değerleri çok düşükse TCP performansı ciddi düşer — genel kural CIR/8 civarıdır.', label: 'CIR (bps)', type: 'text', placeholder: '1000000', optional: true },
                        { name: 'qos_iface', why: "Politikanın bağlanacağı arayüz. Alt arayüz kullanıyorsan shaping ana arayüzde değil alt arayüzde tanımlanmalı, yoksa hız sınırı beklediğin gibi işlemez.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0' },
                        { name: 'qos_dir', why: 'Shaping yalnızca <b>çıkış</b> yönünde anlamlıdır; policing her iki yönde çalışır. Giriş yönünde shaping tanımlamak etkisizdir.', label: 'Yön', type: 'select', options: [{ value: 'output', label: 'output' }, { value: 'input', label: 'input' }] }
                    ]
                },
                {
                    title: 'Rate Limit Parametreleri',
                    icon: 'fas fa-tachometer-alt',
                    showFor: ['ratelimit'],
                    fields: [
                        { name: 'rl_iface', why: "Rate-limit arayüz bazlıdır ve ACL yoksa tüm trafiği etkiler — yönetim trafiğin dahil. Kendi SSH oturumunu boğabileceğini unutma.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0' },
                        { name: 'rl_acl', why: "ACL boş bırakılırsa <b>tüm</b> trafik sınırlanır. Yedekleme gibi tek bir akışı kısacaksan mutlaka ACL ile daralt.", label: 'ACL', type: 'text', placeholder: '100 (boş = tüm trafik)', optional: true },
                        { name: 'rl_rate', why: "Değer bit/saniye cinsindendir, byte değil: 1 Mbps için <code>1000000</code>. Sıfır sayısını şaşırmak en sık yapılan hatadır.", label: 'Rate (bps)', type: 'text', required: true, placeholder: '1000000' },
                        { name: 'rl_bc', why: "Normal burst çok küçükse TCP sürekli kesilir ve gerçek throughput hedefin çok altına düşer. Pratik kural: CIR/8, yani bir saniyelik byte miktarı.", label: 'Normal Burst', type: 'text', validate: 'posint', placeholder: '187500', hint: 'Boş = hızdan hesaplanır (hız × 1,5 sn / 8)' },
                        { name: 'rl_be', why: "Extended burst genelde Bc'nin iki katıdır. Bc ile eşit vermek TCP yavaş başlangıç aşamasında aşırı paket kaybına yol açar.", label: 'Extended Burst', type: 'text', validate: 'posint', placeholder: '375000', hint: 'Boş = 2 × normal burst' },
                        { name: 'rl_dir', why: "<code>input</code> yönünde sınırlama, bant genişliği <b>zaten harcandıktan sonra</b> devreye girer. Gelen trafiği gerçekten korumak istiyorsan çözüm karşı uçta shaping'dir.", label: 'Yön', type: 'select', options: [{ value: 'output', label: 'output' }, { value: 'input', label: 'input' }] }
                    ]
                },
                {
                    title: 'Auto QoS Parametreleri',
                    icon: 'fas fa-magic',
                    showFor: ['auto'],
                    fields: [
                        { name: 'aq_iface', why: "AutoQoS arayüze onlarca komutu <b>tek seferde</b> yazar. Mevcut QoS yapılandırman varsa önce yedek al; geri almak elle temizlik gerektirir.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1' },
                        { name: 'aq_type', why: "<code>cisco-phone</code> telefonu CDP ile doğrular; <code>trust</code> ise gelen işaretlemeye koşulsuz güvenir ve kullanıcı PC'sinin kendini EF olarak işaretlemesine izin verir.", label: 'Tip', type: 'select', options: [{ value: 'cisco-phone', label: 'cisco-phone' }, { value: 'cisco-softphone', label: 'cisco-softphone' }, { value: 'trust', label: 'trust' }] },
                        { name: 'mls_qos', why: "Catalyst switch'lerde QoS global olarak açılmadan arayüz ayarları çalışmaz. Açtığında <b>varsayılan davranış değişir</b> ve işaretlenmemiş trafik farklı kuyruğa düşebilir.", label: 'mls qos (global) ekle', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'QoS Konfigürasyonu Oluştur'
        }, (data) => {
            const mode = data._cgtype;
            let c = '! ========================================\n! Cisco IOS QoS Configuration\n! ========================================\n\n';
            if (mode === 'manual') {
                const mt = data.match_type, mv = data.match_val, cn = data.class_name;
                c += 'class-map match-all ' + cn + '\n';
                if (mv) {
                    const matchMap = { dscp: 'match dscp ', protocol: 'match protocol ', acl: 'match access-group name ' };
                    c += ' ' + (matchMap[mt] || 'match dscp ') + mv + '\n';
                }
                c += '!\npolicy-map ' + data.policy_name + '\n class ' + cn + '\n';
                if (data.set_dscp) c += '  set dscp ' + data.set_dscp + '\n';
                if (data.police_en === true && data.m_cir) c += '  police cir ' + data.m_cir + '\n   conform-action transmit\n   exceed-action drop\n';
                c += ' class class-default\n  fair-queue\n!\ninterface ' + data.qos_iface + '\n service-policy ' + (data.qos_dir || 'output') + ' ' + data.policy_name + '\n!\n';
            } else if (mode === 'ratelimit') {
                const _nb = Math.round((+data.rl_rate || 0) * 1.5 / 8);
                const bc = data.rl_bc || String(_nb), be = data.rl_be || String(_nb * 2);   // Cisco önerisi: hız×1.5sn/8, max=2×normal
                c += 'interface ' + data.rl_iface + '\n rate-limit ' + (data.rl_dir || 'output') + (data.rl_acl ? ' access-group ' + data.rl_acl : '') + ' ' + data.rl_rate + ' ' + bc + ' ' + be + ' conform-action transmit exceed-action drop\n!\n';
            } else {
                if (data.mls_qos === true) c += 'mls qos\n!\n';
                c += 'interface ' + data.aq_iface + '\n auto qos voip ' + (data.aq_type || 'cisco-phone') + '\n mls qos trust dscp\n!\n';
            }
            c += '! Doğrulama: show policy-map interface | show mls qos interface\n';
            return c;
        });
    }
};

// ── GRE TUNNEL ────────────────────────────────────────────────────────────────
CiscoIOS.gre = {
    label: 'GRE Tunnel',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'GRE — Generic Routing Encapsulation',
                desc: 'Generic Routing Encapsulation — tünel protokolü. Multicast ve routing protokollerini taşıyabilir, şifresiz (IPSec ile kombinlenebilir).'
            },
            configTypes: [
                { id: 'gre', label: 'Standard GRE', icon: 'fas fa-long-arrow-alt-right', desc: 'Basit GRE tüneli — şifresiz', badge: { text: 'Basit', cls: 'common' } },
                { id: 'ipsec', label: 'GRE over IPSec', icon: 'fas fa-lock', desc: 'GRE + IPSec şifreleme', badge: { text: 'Güvenli', cls: 'recommended' } },
                { id: 'mgre', label: 'mGRE (DMVPN)', icon: 'fas fa-project-diagram', desc: 'Multipoint GRE — hub-and-spoke dinamik tünel', badge: { text: 'DMVPN', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Tunnel Parametreleri',
                    icon: 'fas fa-cog',
                    showFor: ['gre', 'ipsec', 'mgre'],
                    fields: [
                        { name: 'tun_int', why: "Tunnel numarası cihaz içinde benzersiz olmalı. Kullanımdaki bir numarayı seçmek çalışan tüneli habersizce yeniden yapılandırır.", label: 'Tunnel Interface', type: 'text', required: true, placeholder: 'Tunnel0', hint: 'Sanal tünel arayüzü numarası' },
                        { name: 'tun_ip', why: "Tünel IP'si fiziksel WAN ağından farklı bir blokta olmalı. Tünel hedefine giden rota tünelin kendi üzerinden geçerse arayüz sürekli up/down olur (recursive routing).", label: 'Tunnel IP', type: 'text', validate: 'ip', placeholder: '10.128.10.1', optional: true },
                        { name: 'tun_mask', why: "Point-to-point tünelde /30 yeterlidir. mGRE (DMVPN) kullanıyorsan tüm spoke'lar <b>aynı</b> alt ağda olmalı; /30 vermek DMVPN'i tamamen bozar.", label: 'Tunnel Mask', type: 'text', validate: 'subnet', placeholder: '255.255.255.252', optional: true },
                        { name: 'tun_src', why: 'Tünel kaynağı olarak <b>Loopback</b> kullanmak, fiziksel arayüz down olsa bile tünelin ayakta kalmasını sağlar.', label: 'Tunnel Source', type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Tünelin kaynak interface veya IP adresi — arayüz adı veya IP adresi' },
                        { name: 'tun_dst', why: "Karşı tarafın ulaşılabilir IP'si. Bu adrese giden rota tünelin <b>kendi içinden</b> geçmemelidir — aksi halde tünel kendini yer (recursive routing) ve flap eder.", label: 'Tunnel Destination', type: 'text', placeholder: '5.6.7.8 (mGRE için boş)', hint: 'Karşı uç public IP. mGRE\'de boş bırakın.', optional: true },
                        { name: 'tun_mtu', why: 'GRE 24 byte ek yük getirir. MTU ayarlanmazsa büyük paketler parçalanır; 1400 yaygın bir değerdir.', label: 'MTU', type: 'number', placeholder: '1400', hint: 'GRE overhead için önerilen: 1400', optional: true },
                        { name: 'tun_mss', why: "TCP MSS clamping, parçalanmayı kaynakta önler. GRE/IPSec tünellerinde <b>MTU'dan daha etkili</b> bir çözümdür; 1360 tipik değerdir.", label: 'TCP MSS', type: 'number', min: 500, max: 1460, placeholder: '1360', optional: true },
                        { name: 'keepalive', why: "GRE keepalive, karşı taraf kaybolduğunda tüneli down işaretler. Olmadan tünel 'up' görünmeye devam eder ve trafik kara deliğe gider.", label: 'Keepalive', type: 'text', placeholder: '10 3 (interval retries)', optional: true }
                    ]
                },
                {
                    title: 'IPSec Profil',
                    icon: 'fas fa-lock',
                    showFor: ['ipsec'],
                    fields: [
                        { name: 'ipsec_peer', why: "Peer IP karşı tarafın NAT sonrası gerçek genel adresi olmalı. Dinamik IP'li uçlarda sabit peer yerine dinamik crypto map ya da FlexVPN kullanılır.", label: 'Peer IP', type: 'text', required: true, validate: 'ip', placeholder: '5.6.7.8' },
                        { name: 'ipsec_psk', why: "PSK iki tarafta birebir aynı, uzun ve rastgele olmalı. Kısa PSK, yakalanan IKE trafiğinden çevrimdışı kırılabilir.", label: 'Pre-shared Key', type: 'text', required: true, placeholder: 'MySecretKey123' },
                        { name: 'ts_name', why: 'Transform set adı yereldir, karşı tarafla aynı olmak zorunda değil — ama <b>içeriği</b> (şifreleme+hash) eşleşmelidir.', label: 'Transform-Set Adı', type: 'text', value: 'GRE-TS', placeholder: 'GRE-TS' },
                        { name: 'ipsec_profile', why: "Profil adı yereldir ama <b>içeriği</b> (transform-set, PFS) iki tarafta uyuşmalı. Uyuşmazlıkta Phase 1 up görünür, Phase 2 kurulmaz — bu görüntü çok yanıltıcıdır.", label: 'Profile Adı', type: 'text', value: 'GRE-IPSEC-PROFILE', placeholder: 'GRE-IPSEC-PROFILE' }
                    ]
                },
                {
                    title: 'Routing',
                    icon: 'fas fa-route',
                    showFor: ['gre', 'ipsec', 'mgre'],
                    fields: [
                        { name: 'routing_type', why: "Tünel üzerinde routing yoksa yalnızca elle yazdığın ağlara erişirsin. Dinamik protokol seçersen tünel MTU'su nedeniyle büyük update paketleri parçalanabilir; <code>ip mtu 1400</code> düşün.", label: 'Routing Tipi', type: 'select', options: [{ value: 'none', label: 'Yok' }, { value: 'static', label: 'Static Route' }, { value: 'ospf', label: 'OSPF' }, { value: 'eigrp', label: 'EIGRP' }] },
                        { name: 'remote_net', why: "Karşı tarafın yerel ağı. Bu ağ aynı zamanda NAT muafiyet (<code>deny</code>) satırında da yer almalı; yoksa trafik NAT'lanır ve tünele hiç girmez.", label: 'Remote Network', type: 'text', validate: 'ip_mask', placeholder: '192.168.2.0 255.255.255.0', optional: true },
                        { name: 'routing_pid', why: "OSPF process ID <b>yereldir</b>, EIGRP AS numarası ise komşuyla aynı olmak <b>zorundadır</b>. İkisini karıştırmak EIGRP komşuluğunun hiç kurulmamasına yol açar.", label: 'Process ID / AS', type: 'text', placeholder: '1', optional: true },
                        { name: 'ospf_area', why: "Tünel arayüzü genelde area 0'a konur. Uzak uç farklı area'daysa ve arada backbone yoksa virtual-link gerekir; yoksa rotalar hiç yayılmaz.", label: 'Area (OSPF)', type: 'text', placeholder: '0', optional: true }
                    ]
                }
            ],
            submit: 'GRE Tunnel Konfigürasyonu Oluştur'
        }, (data) => {
            const type = data._cgtype;
            let c = '! ========================================\n! Cisco IOS GRE Tunnel Configuration\n! ========================================\n\n';
            if (type === 'ipsec') {
                const peer = data.ipsec_peer, psk = data.ipsec_psk;
                const ts = data.ts_name || 'GRE-TS', prof = data.ipsec_profile || 'GRE-IPSEC-PROFILE';
                c += 'crypto isakmp policy 10\n encr aes 256\n authentication pre-share\n group 5\n lifetime 86400\nexit\ncrypto isakmp key ' + psk + ' address ' + peer + '\n!\n';
                c += 'crypto ipsec transform-set ' + ts + ' esp-aes 256 esp-sha-hmac\n mode transport\nexit\n!\ncrypto ipsec profile ' + prof + '\n set transform-set ' + ts + '\nexit\n!\n';
            }
            c += 'interface ' + data.tun_int + '\n description GRE Tunnel\n';
            if (data.tun_ip && data.tun_mask) c += ' ip address ' + data.tun_ip + ' ' + data.tun_mask + '\n';
            c += ' tunnel source ' + data.tun_src + '\n';
            if (data.tun_dst) c += ' tunnel destination ' + data.tun_dst + '\n';
            if (type === 'mgre') c += ' tunnel mode gre multipoint\n';
            else if (type === 'ipsec') c += ' tunnel protection ipsec profile ' + (data.ipsec_profile || 'GRE-IPSEC-PROFILE') + '\n';
            if (data.tun_mtu) c += ' ip mtu ' + data.tun_mtu + '\n';
            if (data.tun_mss) c += ' ip tcp adjust-mss ' + data.tun_mss + '\n';
            if (data.keepalive) c += ' keepalive ' + data.keepalive + '\n';
            c += ' no shutdown\nexit\n!\n';
            const rt = data.routing_type, rn = data.remote_net, pid = data.routing_pid;
            if (rt === 'static' && rn) {
                c += 'ip route ' + rn + ' ' + data.tun_int + '\n';
            } else if (rt === 'ospf' && pid) {
                c += 'router ospf ' + pid + '\n network ' + (data.tun_ip || '0.0.0.0') + ' 0.0.0.0 area ' + (data.ospf_area || '0') + '\n!\ninterface ' + data.tun_int + '\n ip ospf network point-to-point\n!\n';
            } else if (rt === 'eigrp' && pid) {
                c += 'router eigrp ' + pid + '\n network ' + (data.tun_ip || '0.0.0.0') + ' 0.0.0.0\n no auto-summary\n!\n';
            }
            c += '! Doğrulama: show interface ' + (data.tun_int || 'Tunnel0') + ' | show ip route\n';
            return c;
        });
    }
};

// ── IP TRACKING / IP SLA ──────────────────────────────────────────────────────
CiscoIOS.tracking = {
    label: 'IP Tracking/SLA',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-heartbeat', title: 'IP Tracking / IP SLA', desc: 'Interface, IP SLA, route ve track list izleme konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'iface', label: 'Interface',   icon: 'fas fa-ethernet',   desc: 'Interface line-protocol tracking', badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'ipsla', label: 'IP SLA',      icon: 'fas fa-heartbeat',  desc: 'ICMP/TCP SLA probe + track',       badge: { text: 'Önerilen',  cls: 'recommended' } },
                { id: 'route', label: 'IP Route',    icon: 'fas fa-route',      desc: 'Rota erişilebilirlik takibi',      badge: { text: 'Gelişmiş',  cls: 'advanced' } },
                { id: 'list',  label: 'Track List',  icon: 'fas fa-list',       desc: 'Birden fazla track nesnesi listesi',badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Interface Tracking', icon: 'fas fa-ethernet', showFor: ['iface'], warn: null, info: null,
                    fields: [
                        { name: 'track_id', why: "Track nesne numarası rota ve FHRP tarafından referans alınır. Kullanımdaki bir numarayı yeniden kullanmak eski izlemeyi sessizce ezer.",    label: 'Track ID',        type: 'text', required: true,  placeholder: '1',                  hint: 'Takip nesnesi numarası' },
                        { name: 'track_iface', why: "<code>line-protocol</code> izlemek yalnızca yerel arayüz durumunu görür. ISS tarafında uzakta bir arıza varsa arayüz up kalır ve failover <b>hiç</b> tetiklenmez — bunun için IP SLA kullan.", label: 'Interface',       type: 'text', validate: 'iface', required: true,  placeholder: 'GigabitEthernet0/0', hint: 'İzlenecek interface' },
                        { name: 'delay_down', why: "Track nesnesinin down sayılması için beklenecek süre. Kısa süre, anlık dalgalanmalarda gereksiz failover'a (flapping) yol açar.",  label: 'Delay Down (sn)', type: 'text', required: false, placeholder: '10',                 hint: 'Down gecikmesi (saniye)' },
                        { name: 'delay_up', why: 'Geri dönüşte bekleme süresi. Hattın kararlı hale gelmesini beklemek, art arda kesintileri önler.',    label: 'Delay Up (sn)',   type: 'text', required: false, placeholder: '10',                 hint: 'Up gecikmesi (saniye)' }
                    ]
                },
                {
                    title: 'IP SLA', icon: 'fas fa-heartbeat', showFor: ['ipsla'], warn: null, info: null,
                    fields: [
                        { name: 'sla_id', why: "Operasyonu tanımlamak yetmez: <code>ip sla schedule</code> ile başlatmazsan probe hiç çalışmaz ve bağlı track nesnesi kalıcı olarak down görünür.",       label: 'SLA ID',           type: 'text',   required: true,  placeholder: '10',                 hint: 'IP SLA operasyon numarası' },
                        { name: 'sla_track_id', why: "Track nesnesi SLA ile aynı numarayı taşımak zorunda değildir, bu yüzden yanlış eşleştirme sessiz bir hatadır: track sürekli down kalır ve failover kilitlenir.", label: 'Track ID',         type: 'text',   required: true,  placeholder: '1',                  hint: 'Track nesnesi numarası' },
                        { name: 'sla_type', why: "ICMP Echo yaygındır ama bazı ISS'ler ICMP'yi düşük öncelikli işler ve yanıltıcı sonuç verir. Gerçek servis erişimini ölçmek için TCP Connect daha güvenilirdir.",     label: 'SLA Tipi',         type: 'select', required: false, options: [{v:'icmp',l:'ICMP Echo'},{v:'tcp',l:'TCP Connect'}] },
                        { name: 'sla_dest', why: "SLA hedefi <b>ISS'den bağımsız</b> ve sürekli erişilebilir olmalı. ISS'nin kendi gateway'ine ping atmak, ISS içi arızaları göremez.",     label: 'Hedef IP',         type: 'text',   required: true,  placeholder: '8.8.8.8',            hint: 'Probe hedef IP' },
                        { name: 'sla_src', why: "Kaynak arayüz belirtmezsen probe, çıkış arayüzünün IP'siyle gider; dönüş rotası yoksa test haksız yere başarısız olur. Yedek hat testinde kaynağı açıkça yaz.",      label: 'Source Interface', type: 'text',   required: false, placeholder: 'GigabitEthernet0/0', hint: 'Kaynak interface (opsiyonel)' },
                        { name: 'sla_freq', why: 'Ölçüm sıklığı. Çok sık ölçüm CPU yükü, çok seyrek ölçüm geç failover demektir.',     label: 'Frequency (sn)',   type: 'text',   required: false, placeholder: '60',                 hint: 'Probe sıklığı' },
                        { name: 'sla_timeout', why: 'Yanıt bekleme süresi. Uydu gibi yüksek gecikmeli hatlarda varsayılan değer yanlış negatif üretir.',  label: 'Timeout (ms)',     type: 'text',   required: false, placeholder: '5000',               hint: 'Zaman aşımı' }
                    ]
                },
                {
                    title: 'Route Tracking', icon: 'fas fa-route', showFor: ['route'], warn: null, info: null,
                    fields: [
                        { name: 'rt_track_id', why: "Track ID, statik rotadaki <code>track</code> anahtar kelimesiyle eşleşmeli. Eşleşmezse rota izlemeden bağımsız olarak <b>her zaman</b> tabloda kalır.", label: 'Track ID', type: 'text', required: true, placeholder: '1',         hint: 'Track nesnesi numarası' },
                        { name: 'rt_network', why: "İzlenen rotanın kendisi. Default rotayı izlemek yalnızca rotanın varlığını kontrol eder, hedefin gerçekten erişilebilir olduğunu değil.",  label: 'Network',  type: 'text', required: true, placeholder: '0.0.0.0',   hint: 'İzlenecek ağ adresi' },
                        { name: 'rt_mask', why: "Maske routing tablosundaki kayıtla birebir eşleşmeli. /24 izleyip tabloda /25 varsa track hiçbir zaman up olmaz.",     label: 'Mask',     type: 'text', validate: 'subnet', required: true, placeholder: '0.0.0.0',   hint: 'Alt ağ maskesi' }
                    ]
                },
                {
                    title: 'Track List', icon: 'fas fa-list', showFor: ['list'], warn: null, info: null,
                    fields: [
                        { name: 'tl_id', why: "Track list birden fazla nesneyi tek karara indirir. Listenin numarası içindeki nesne numaralarıyla çakışmamalı, aksi halde kendi kendini izleyen bir yapı kurarsın.",      label: 'Track ID',       type: 'text',   required: true,  placeholder: '10',      hint: 'Track list numarası' },
                        { name: 'tl_type', why: "<code>boolean-and</code> hepsinin up olmasını ister (katı), <code>boolean-or</code> birinin yetmesini (gevşek). Yanlış seçim ya hiç failover yapmaz ya da sürekli yapar.",    label: 'List Tipi',      type: 'select', required: false, options: [{v:'boolean-and',l:'boolean-and'},{v:'boolean-or',l:'boolean-or'},{v:'threshold percentage',l:'threshold percentage'}] },
                        { name: 'tl_objects', why: "Listedeki nesnelerin <b>önceden</b> tanımlı olması gerekir; var olmayan bir numara sessizce yok sayılır ve karar beklediğinden farklı çıkar.", label: 'Objects (virgülle)', type: 'text', required: false, placeholder: '1,2,3', hint: 'Track nesneleri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const type = fv('_cgtype');
            let c = '! ========================================\n! Cisco IOS IP Tracking / IP SLA\n! ========================================\n\n';
            if (type === 'iface') {
                c += 'track ' + fv('track_id') + ' interface ' + fv('track_iface') + ' line-protocol\n';
                const dd = fv('delay_down'), du = fv('delay_up');
                if (dd || du) c += ' delay down ' + (dd||'0') + ' up ' + (du||'0') + '\n';
                c += '!\n';
            } else if (type === 'ipsla') {
                const sid = fv('sla_id'), stype = fv('sla_type'), sdest = fv('sla_dest');
                const ssrc = fv('sla_src'), freq = fv('sla_freq'), tout = fv('sla_timeout');
                c += 'ip sla ' + sid + '\n';
                if (stype === 'icmp') {
                    c += ' icmp-echo ' + sdest + (ssrc ? ' source-interface ' + ssrc : '') + '\n';
                } else {
                    c += ' tcp-connect ' + sdest + ' 80\n';
                }
                if (freq) c += ' frequency ' + freq + '\n';
                if (tout) c += ' timeout ' + tout + '\n';
                c += 'exit\n';
                c += 'ip sla schedule ' + sid + ' life forever start-time now\n!\n';
                c += 'track ' + fv('sla_track_id') + ' ip sla ' + sid + ' reachability\n!\n';
            } else if (type === 'route') {
                c += 'track ' + fv('rt_track_id') + ' ip route ' + fv('rt_network') + ' ' + fv('rt_mask') + ' reachability\n!\n';
            } else if (type === 'list') {
                const objs = fv('tl_objects').split(',').map(s => s.trim()).filter(Boolean);
                c += 'track ' + fv('tl_id') + ' list ' + fv('tl_type') + '\n';
                objs.forEach(o => { c += ' object ' + cgEsc(o) + '\n'; });
                c += '!\n';
            }
            c += '! Doğrulama: show track | show ip sla statistics\n';
            return c;
        });
    }
};

// ── RATE LIMIT ────────────────────────────────────────────────────────────────
CiscoIOS.rateLimit = {
    label: 'Rate Limit',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-tachometer-alt', title: 'Rate Limit', desc: 'ACL tabanlı interface rate limiting (police) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'ratelimit', label: 'Rate Limit', icon: 'fas fa-tachometer-alt', desc: 'Interface rate-limit komutu', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Rate Limit Parametreleri', icon: 'fas fa-tachometer-alt', showFor: ['ratelimit'], warn: null, info: null,
                    fields: [
                        { name: 'rl_iface', why: "Rate-limit arayüz bazlıdır ve ACL yoksa tüm trafiği etkiler — yönetim trafiğin dahil. Kendi SSH oturumunu boğabileceğini unutma.",   label: 'Interface',           type: 'text', validate: 'iface',   required: true,  placeholder: 'GigabitEthernet0/0',         hint: 'Rate limit uygulanacak interface' },
                        { name: 'rl_acl', why: "ACL boş bırakılırsa <b>tüm</b> trafik sınırlanır — kendi SSH oturumun dahil. Tek bir akışı kısacaksan mutlaka ACL ile daralt.",     label: 'ACL No/Adı',          type: 'text',   required: false, placeholder: '100 (boş = tüm trafik)',      hint: 'Opsiyonel ACL filtresi' },
                        { name: 'ip_blocks', why: "Her satır bir ACL <code>permit</code> satırına dönüşür ve wildcard maske ister, subnet maske değil. Sıra önemlidir: geniş bir blok üstteyse altındakiler hiç değerlendirilmez.",  label: 'IP Bloklar (satır satır)', type: 'textarea', required: false, placeholder: '192.168.1.0 0.0.0.255\n10.0.0.0 0.0.0.255', hint: 'ACL için permit satırları' },
                        { name: 'rl_cir', why: "CIR bit/saniye cinsindendir. ISS'nin sattığı hızın tamamını yazmak yerine %90-95'ini seçmek, kuyruk oluşumunu karşı tarafa bırakmamanı sağlar.",     label: 'CIR (bps)',           type: 'text',   required: true,  placeholder: '1000000',                    hint: 'Committed Information Rate' },
                        { name: 'rl_bc', why: "Normal burst çok küçükse TCP sürekli kesilir ve gerçek throughput hedefin çok altına düşer. Pratik kural: CIR/8, yani bir saniyelik byte miktarı.",      label: 'Bc (normal burst)',    type: 'text', validate: 'posint', placeholder: '187500',                     hint: 'Boş = hızdan hesaplanır (hız × 1,5 sn / 8)' },
                        { name: 'rl_be', why: "Extended burst genelde Bc'nin iki katıdır. Bc ile eşit vermek TCP yavaş başlangıç aşamasında aşırı paket kaybına yol açar.",      label: 'Be (extended burst)', type: 'text', validate: 'posint', placeholder: '375000',                     hint: 'Boş = 2 × normal burst' },
                        { name: 'rl_dir', why: "<code>input</code> yönünde sınırlama, bant genişliği <b>zaten harcandıktan sonra</b> devreye girer. Gelen trafiği gerçekten korumak istiyorsan çözüm karşı uçta shaping'dir.",     label: 'Yön',                 type: 'select', required: false, options: [{v:'output',l:'output'},{v:'input',l:'input'},{v:'both',l:'input + output'}] },
                        { name: 'rl_conform', why: 'Limit içindeki trafiğe uygulanan aksiyon. <code>transmit</code> normal geçiştir.', label: 'Conform Action',      type: 'select', required: false, options: [{v:'transmit',l:'transmit'},{v:'set-dscp-transmit 0',l:'set-dscp-transmit'}] },
                        { name: 'rl_exceed', why: 'Limiti aşan trafik. <code>drop</code> sert keser, <code>set-dscp-transmit</code> ise işaretleyip geçirir ve tıkanıklıkta önce onu düşürür — genelde daha yumuşak bir davranıştır.',  label: 'Exceed Action',       type: 'select', required: false, options: [{v:'drop',l:'drop'},{v:'set-dscp-transmit 0',l:'set-dscp-transmit'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const acl = fv('rl_acl'), cir = fv('rl_cir'), _nb = Math.round((+fv('rl_cir') || 0) * 1.5 / 8), bc = fv('rl_bc') || String(_nb), be = fv('rl_be') || String(_nb * 2);   // Cisco önerisi: hız×1.5sn/8, max=2×normal
            const dir = fv('rl_dir') || 'output', iface = fv('rl_iface'), conf = fv('rl_conform') || 'transmit', exc = fv('rl_exceed') || 'drop';
            let c = '! ========================================\n! Cisco IOS Rate Limit Configuration\n! ========================================\n\n';
            const blocks = fv('ip_blocks');
            if (blocks && acl) {
                blocks.split('\n').forEach(line => {
                    const b = line.trim(); if (b) c += 'access-list ' + acl + ' permit ip ' + cgEsc(b) + ' any\n';
                });
                c += '!\n';
            }
            c += 'interface ' + iface + '\n';
            const rlLine = (d) => ' rate-limit ' + d + (acl ? ' access-group ' + acl : '') + ' ' + cir + ' ' + bc + ' ' + be + ' conform-action ' + conf + ' exceed-action ' + exc + '\n';
            if (dir === 'both') { c += rlLine('input'); c += rlLine('output'); }
            else { c += rlLine(dir); }
            c += 'exit\n!\n! Doğrulama: show interfaces ' + iface + ' rate-limit\n';
            return c;
        });
    }
};
// ── ADVANCED MULTI-CONFIG ─────────────────────────────────────────────────────
CiscoIOS.advanced = {
    label: 'Advanced Multi-Config',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-layer-group', title: 'Advanced Multi-Config', desc: 'VLAN, ACL, Static Route, OSPF, BGP ve VRRP/HSRP snippet\'lerini tek formdan üretir.' },
            configTypes: [
                { id: 'advanced', label: 'Multi-Config', icon: 'fas fa-layer-group', desc: 'İstediğiniz bölümleri etkinleştirin', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN / Trunk', icon: 'fas fa-network-wired', showFor: ['advanced'], warn: null,
                    info: 'VLAN ve trunk ayarları — boş bırakılan alanlar çıktıya eklenmez.',
                    fields: [
                        { name: 'sec_vlan', why: 'Bu bölümü işaretlemezsen ilgili config üretilmez. Çoklu bölüm seçerek tek seferde birden fazla yapılandırma üretebilirsin.',      label: 'VLAN/Trunk Ekle', type: 'checkbox', required: false },
                        { name: 'adv_vlan_id', why: "VLAN'ı switch'te oluşturmak yetmez; trunk'ın <code>allowed vlan</code> listesinde de bulunmalı. VLAN 1'i kullanmaktan kaçın, varsayılan yönetim trafiğiyle karışır.",   label: 'VLAN ID',         type: 'text', validate: 'vlan',     required: false, placeholder: '10' },
                        { name: 'adv_vlan_name', why: "VLAN adı yalnızca yerel bir etikettir ve VTP dışında komşuya yayılmaz. Yine de tutarsız isimlendirme, arıza anında yanlış VLAN'a müdahaleye yol açar.", label: 'VLAN Name',       type: 'text',     required: false, placeholder: 'SALES' },
                        { name: 'adv_trunk_iface', why: 'Trunk portun karşı uçta da trunk modda olması gerekir. Tek taraflı trunk, VLAN trafiğinin sessizce düşmesine yol açar.',label: 'Trunk Interface',type: 'text', validate: 'iface',     required: false, placeholder: 'GigabitEthernet0/1' }
                    ]
                },
                {
                    title: 'ACL', icon: 'fas fa-filter', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_acl', why: "ACL eklemek onu bir arayüze bağlamak anlamına gelmez. Ayrıca her ACL'in sonunda görünmeyen bir <code>deny any</code> olduğunu unutma.",      label: 'ACL Ekle',       type: 'checkbox', required: false },
                        { name: 'adv_acl_name', why: "Named ACL'de isim büyük/küçük harfe duyarlıdır. Var olan bir isme satır eklemek listenin <b>sonuna</b> yazar; sıralama yüzünden kural etkisiz kalabilir.", label: 'ACL Adı',        type: 'text',     required: false, placeholder: 'MGMT-ACL' },
                        { name: 'adv_acl_net', why: "ACL'de wildcard maske kullanılır. Ayrıca ACL sonunda gizli <code>deny any</code> vardır.",  label: 'Permit Network', type: 'text',     required: false, placeholder: '10.0.0.0 0.0.0.255' }
                    ]
                },
                {
                    title: 'Static Route', icon: 'fas fa-route', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_route', why: "Statik rota, AD değeri düşükse dinamik rotaları ezer. Default rota ekliyorsan önce mevcut default'ları kontrol et, yoksa tüm çıkış trafiğini yanlış hatta yönlendirirsin.",  label: 'Static Route Ekle', type: 'checkbox', required: false },
                        { name: 'adv_rt_net', why: "Hedef ağ adresi yazılmalı. Host adresi yazarsan IOS /32 rota oluşturur ve beklediğin alt ağ trafiği bu rotayı hiç kullanmaz.", label: 'Network',           type: 'text',     required: false, placeholder: '0.0.0.0 0.0.0.0' },
                        { name: 'adv_rt_nh', why: 'Next-hop IP vermek, arayüz adı vermekten güvenlidir.',  label: 'Next-hop',          type: 'text',     required: false, placeholder: '192.168.1.1' }
                    ]
                },
                {
                    title: 'OSPF Snippet', icon: 'fas fa-project-diagram', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_ospf', why: "OSPF'i açmak komşuluk denemesi başlatır; WAN arayüzü kapsama girerse ISS ile istenmeyen komşuluk ya da topoloji sızıntısı riski doğar. <code>passive-interface default</code> ile başla.",      label: 'OSPF Ekle', type: 'checkbox', required: false },
                        { name: 'adv_ospf_pid', why: "Process ID yereldir, komşuyla aynı olmak zorunda değildir. Ama aynı cihazda iki farklı PID çalıştırmak, rotaların otomatik paylaşılmadığı iki ayrı domain yaratır.",  label: 'PID',       type: 'text',     required: false, placeholder: '1' },
                        { name: 'adv_ospf_net', why: "<code>network</code> satırı wildcard maske ister. <code>255.255.255.0</code> yazarsan komut kabul edilir ama beklediğin arayüz OSPF'e <b>dahil olmaz</b>.",  label: 'Network',   type: 'text',     required: false, placeholder: '192.168.0.0 0.0.0.255' },
                        { name: 'adv_ospf_area', why: "Backbone <code>0</code>'dır; alan numarası komşuyla eşleşmezse komşuluk kurulmaz.", label: 'Area',      type: 'text',     required: false, placeholder: '0' }
                    ]
                },
                {
                    title: 'BGP Snippet', icon: 'fas fa-exchange-alt', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_bgp', why: "BGP açmak, dikkatsiz yapılandırmada istemeden transit AS olmana yol açabilir. Giden duyuruları mutlaka prefix-list ya da route-map ile filtrele.",       label: 'BGP Ekle',   type: 'checkbox', required: false },
                        { name: 'adv_bgp_as', why: "Yerel AS numarası. Private aralık 64512-65534'tür; internete çıkan bir oturumda private AS kullanmak duyurularının yol boyunca süzülmesine neden olur.",    label: 'Local AS',   type: 'text',     required: false, placeholder: '65001' },
                        { name: 'adv_bgp_peer', why: "Komşu IP'si, karşı tarafın senin paketlerini <b>gördüğü</b> kaynak IP ile eşleşmeli. Loopback peering yapıyorsan <code>update-source</code> vermeyi unutma.",  label: 'Neighbor IP',type: 'text',     required: false, placeholder: '10.0.0.2' },
                        { name: 'adv_bgp_remote', why: "Yanlış remote-AS, oturumun Idle/Active'de takılmasına yol açar.",label: 'Remote AS',  type: 'text',     required: false, placeholder: '65002' }
                    ]
                },
                {
                    title: 'VRRP/HSRP Snippet', icon: 'fas fa-redo', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_vrrp', why: "Her iki cihazda aynı grup numarası ve aynı sanal IP kullanılmalı. Tek tarafı yapılandırmak, o cihazın tek başına aktif kalmasına ve failover olmamasına yol açar.",   label: 'VRRP/HSRP Ekle', type: 'checkbox', required: false },
                        { name: 'adv_vr_iface', why: "FHRP yönlendirilen arayüzde çalışır (SVI ya da routed port); Layer 2 portta yapılandırılamaz.",label: 'Interface',     type: 'text', validate: 'iface',     required: false, placeholder: 'GigabitEthernet0/0' },
                        { name: 'adv_vr_grp', why: "Grup numarası iki cihazda aynı olmalı; sanal MAC bu numaradan türer. Aynı VLAN'da iki farklı grup numarası, birbirinden habersiz iki aktif router demektir.", label: 'Group/VRID',     type: 'text',     required: false, placeholder: '1' },
                        { name: 'adv_vr_vip', why: "Sanal IP, fiziksel arayüz IP'lerinden farklı ve aynı subnet'te olmalıdır.", label: 'Virtual IP',     type: 'text',     required: false, placeholder: '192.168.1.254' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const cb = n => data[n] === 'on' || data[n] === true;
            let c = '! ========================================\n! Cisco IOS Advanced Multi-Config\n! ========================================\n\n';
            if (cb('sec_vlan')) {
                const vid = fv('adv_vlan_id'), vn = fv('adv_vlan_name'), ti = fv('adv_trunk_iface');
                if (vid) { c += 'vlan ' + vid + '\n'; if (vn) c += ' name ' + vn + '\n'; c += '!\n'; }
                if (ti) c += 'interface ' + ti + '\n switchport mode trunk\n switchport trunk encapsulation dot1q\n' + (vid ? ' switchport trunk allowed vlan add ' + vid + '\n' : '') + 'exit\n!\n';
            }
            if (cb('sec_acl')) {
                const an = fv('adv_acl_name'), net = fv('adv_acl_net');
                if (an) { c += 'ip access-list standard ' + an + '\n'; if (net) c += ' permit ' + net + '\n'; c += ' deny any\n!\n'; }
            }
            if (cb('sec_route')) {
                const rn = fv('adv_rt_net'), nh = fv('adv_rt_nh');
                if (rn && nh) c += 'ip route ' + rn + ' ' + nh + '\n!\n';
            }
            if (cb('sec_ospf')) {
                const pid = fv('adv_ospf_pid') || '1', net = fv('adv_ospf_net'), area = fv('adv_ospf_area') || '0';
                c += 'router ospf ' + pid + '\n'; if (net) c += ' network ' + net + ' area ' + area + '\n'; c += 'exit\n!\n';
            }
            if (cb('sec_bgp')) {
                const as = fv('adv_bgp_as'), peer = fv('adv_bgp_peer'), ra = fv('adv_bgp_remote');
                if (as) { c += 'router bgp ' + as + '\n'; if (peer && ra) c += ' neighbor ' + peer + ' remote-as ' + ra + '\n'; c += 'exit\n!\n'; }
            }
            if (cb('sec_vrrp')) {
                const vi = fv('adv_vr_iface'), vg = fv('adv_vr_grp'), vip = fv('adv_vr_vip');
                if (vi && vg && vip) c += 'interface ' + vi + '\n standby version 2\n standby ' + vg + ' ip ' + vip + '\n standby ' + vg + ' preempt\nexit\n!\n';
            }
            if (c.endsWith('! ========================================\n! Cisco IOS Advanced Multi-Config\n! ========================================\n\n')) {
                c += '! En az bir bölüm seçin.\n';
            }
            return c;
        });
    }
};

// ── EtherChannel / LACP ───────────────────────────────────────────────────────
CiscoIOS.etherchannel = {
    label: 'EtherChannel / LACP',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-link', title: 'EtherChannel / LACP', desc: 'Port-Channel ve üye interface LACP/statik EtherChannel konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'trunk',  label: 'Trunk Mode',  icon: 'fas fa-network-wired', desc: 'Trunk port-channel (multi-VLAN)', badge: { text: 'Yaygın',   cls: 'common' } },
                { id: 'access', label: 'Access Mode',  icon: 'fas fa-plug',          desc: 'Access port-channel (tek VLAN)', badge: { text: 'Yaygın',   cls: 'common' } }
            ],
            sections: [
                {
                    title: 'EtherChannel Temel', icon: 'fas fa-link', showFor: ['trunk', 'access'], warn: null, info: null,
                    fields: [
                        { name: 'pc_num', why: 'Port-channel numarası iki uçta <b>farklı olabilir</b>, ama üye portların ayarları (hız, dupleks, VLAN, trunk modu) birebir aynı olmalıdır.',       label: 'Port-Channel No',      type: 'text',   required: true,  placeholder: '1',                   hint: 'Port-channel numarası' },
                        { name: 'member_range', why: 'Üye portlara önce kanal yapılandırması uygulanmalı, sonra IP/VLAN. Ters sıra config kaybına yol açar.', label: 'Üye Interface Aralığı',type: 'text', validate: 'iface_range',   required: true,  placeholder: 'GigabitEthernet0/1-2', hint: 'Interface range komutu için' },
                        { name: 'lacp_mode', why: '<code>active</code> LACP başlatır, <code>passive</code> bekler. İki uç da <code>passive</code> ise kanal <b>hiç kurulmaz</b>. <code>on</code> ise protokolsüzdür ve yanlış kabloda döngü yaratır — kaçınılmalıdır.',    label: 'LACP Modu',            type: 'select', required: false, options: [{v:'active',l:'active (LACP gönder + bekle)'},{v:'passive',l:'passive (LACP yalnız bekle)'},{v:'on',l:'on (statik, LACP yok)'}] },
                        { name: 'desc', why: "Arayüz açıklaması, arıza anında hangi portun nereye gittiğini söyleyen tek kaynaktır. LAG üyelerine de aynı açıklamayı yaz; sonradan hangi portun bundle'a ait olduğunu aramak zaman kaybıdır.",         label: 'Açıklama',             type: 'text',   required: false, placeholder: 'UPLINK-LAG-to-CORE',   hint: 'Interface description' }
                    ]
                },
                {
                    title: 'Trunk Ayarları', icon: 'fas fa-network-wired', showFor: ['trunk'], warn: null, info: null,
                    fields: [
                        { name: 'allowed_vlans', why: "Trunk'tan geçmesine izin verilen VLAN'lar. Varsayılan <b>tüm VLAN'lar</b>dır; daraltmak hem broadcast'i hem saldırı yüzeyini azaltır.", label: 'Allowed VLANs', type: 'text', validate: 'vlan_list', required: false, placeholder: '10,20,30', hint: 'Trunk allowed VLAN listesi — tümü için all' },
                        { name: 'native_vlan', why: "Trunk'ta etiketsiz geçen VLAN. İki uçta farklı native VLAN, <b>VLAN hopping</b> saldırısına kapı açar. Native VLAN'ı kullanılmayan bir ID'ye (ör. 999) almak iyi pratiktir.",   label: 'Native VLAN',   type: 'text', validate: 'vlan', required: false, placeholder: '1',                hint: 'Native VLAN (opsiyonel)' }
                    ]
                },
                {
                    title: 'Access Ayarları', icon: 'fas fa-plug', showFor: ['access'], warn: null, info: null,
                    fields: [
                        { name: 'access_vlan', why: "Access port tek VLAN taşır. Port'u access yapmadan VLAN atamak, portun DTP ile kendiliğinden trunk olmasına yol açabilir — <code>switchport mode access</code> her zaman açıkça yazılmalı.", label: 'Access VLAN', type: 'text', validate: 'vlan', required: false, placeholder: '10', hint: 'Access VLAN numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const pcNum = fv('pc_num'), memberRange = fv('member_range');
            const lacpMode = fv('lacp_mode') || 'active', pcMode = fv('_cgtype');
            const desc = fv('desc'), allowedVlans = fv('allowed_vlans');
            const nativeVlan = fv('native_vlan'), accessVlan = fv('access_vlan');
            let c = '! ========================================\n! Cisco IOS — EtherChannel / LACP\n! ========================================\n\n';
            c += '! Port-Channel Interface\ninterface Port-channel' + pcNum + '\n';
            if (desc) c += ' description ' + desc + '\n';
            if (pcMode === 'trunk') {
                c += ' switchport mode trunk\n';
                if (allowedVlans) c += ' switchport trunk allowed vlan ' + allowedVlans + '\n';
                if (nativeVlan) c += ' switchport trunk native vlan ' + nativeVlan + '\n';
            } else {
                c += ' switchport mode access\n';
                if (accessVlan) c += ' switchport access vlan ' + accessVlan + '\n';
            }
            c += ' no shutdown\n!\n\n';
            c += '! Üye Interfaces\ninterface range ' + memberRange + '\n';
            if (desc) c += ' description ' + desc + '-MEMBER\n';
            c += ' channel-group ' + pcNum + ' mode ' + lacpMode + '\n';
            c += ' no shutdown\n!\n\n';
            c += '! Doğrulama:\n! show etherchannel summary\n! show etherchannel ' + pcNum + ' detail\n! show interfaces Port-channel' + pcNum + '\n';
            return c;
        });
    }
};

// ── DMVPN Phase 1/2/3 ────────────────────────────────────────────────────────
CiscoIOS.dmvpn = {
    label: 'DMVPN',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-cloud', title: 'DMVPN Faz 1/2/3', desc: 'Hub veya Spoke rolü için GRE multipoint tunnel + NHRP konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'hub',   label: 'Hub',   icon: 'fas fa-network-wired', desc: 'DMVPN Hub — NHS, multicast dynamic', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'spoke', label: 'Spoke', icon: 'fas fa-sitemap',       desc: 'DMVPN Spoke — NHS map, shortcut',   badge: { text: 'Yaygın',   cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Tunnel Temel', icon: 'fas fa-cloud', showFor: ['hub', 'spoke'], warn: null, info: null,
                    fields: [
                        { name: 'tun_num', why: "Tunnel numarası yereldir ama hub ve spoke'ta aynı tutmak sorun gidermeyi ciddi kolaylaştırır. Numara değiştirmek çalışan tüneli anında düşürür.",  label: 'Tunnel Numarası',  type: 'text', required: true, placeholder: '0',                       hint: 'Tunnel arayüz numarası' },
                        { name: 'tun_ip', why: "DMVPN'de hub ve tüm spoke'lar <b>aynı</b> tünel alt ağında olmalı. /30 vermek ya da farklı bloklar seçmek spoke-to-spoke kısayollarını tamamen bozar.",   label: 'Tunnel IP / Mask', type: 'text', validate: 'ip_mask', required: true, placeholder: '10.64.0.1 255.255.255.0', hint: 'Tunnel interface IP adresi' },
                        { name: 'wan_iface', why: "Tünelin kaynak arayüzü. Dinamik IP alan bir hatta <code>tunnel source</code> olarak arayüz adını kullan, IP'yi değil — IP değişince tünel kalıcı olarak down kalır.",label: 'WAN Interface',    type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0',       hint: 'Tunnel kaynağı (fiziksel WAN)' },
                        { name: 'nhrp_id', why: "NHRP network-id tüm DMVPN üyelerinde <b>aynı</b> olmalı. Farklı olması spoke'ların hub'ı bulamamasına yol açar.",  label: 'NHRP Network-ID', type: 'text', required: true, placeholder: '1',                        hint: 'NHRP network ID' },
                        { name: 'nhrp_key', why: 'NHRP kimlik doğrulaması olmadan, tünel ağına katılan herhangi bir cihaz sahte eşleme kaydedebilir.', label: 'NHRP Auth Key',   type: 'text', required: true, placeholder: 'cisco123',                 hint: 'NHRP kimlik doğrulama anahtarı' }
                    ]
                },
                {
                    title: 'Spoke — NHS Bilgileri', icon: 'fas fa-sitemap', showFor: ['spoke'], warn: null, info: null,
                    fields: [
                        { name: 'hub_wan', why: "Hub'ın sabit dış IP'si. Spoke'lar dinamik IP alabilir ama hub'ın IP'si sabit olmalıdır.", label: 'Hub WAN IP (NHS)',    type: 'text', required: true, placeholder: '203.0.113.1', hint: 'Hub fiziksel WAN IP' },
                        { name: 'hub_tun', why: "NHS adresi hub'ın <b>tünel</b> IP'sidir, genel IP'si değil. İkisini karıştırmak NHRP kaydının hiç tamamlanmamasına ve spoke'ların hub'ı bulamamasına yol açar.", label: 'Hub Tunnel IP (NHS)', type: 'text', required: true, placeholder: '10.64.0.1',  hint: 'Hub tunnel IP' }
                    ]
                },
                {
                    title: 'Protokol Seçenekleri', icon: 'fas fa-cogs', showFor: ['hub', 'spoke'], warn: null, info: null,
                    fields: [
                        { name: 'dmvpn_phase', why: "<b>Faz 1</b>'de tüm trafik hub üzerinden geçer. <b>Faz 2/3</b>'te spoke'lar doğrudan tünel kurar (spoke-to-spoke) — ses/video için kritik fark.", label: 'DMVPN Faz',             type: 'select', required: false, options: [{v:'1',l:'Faz 1 (hub-spoke)'},{v:'2',l:'Faz 2 (spoke-to-spoke)'},{v:'3',l:'Faz 3 (NHRP redirect)'}] },
                        { name: 'routing', why: "DMVPN'de spoke-to-spoke için hub'da <code>no ip split-horizon eigrp</code> ya da OSPF'te broadcast network tipi gerekir. Varsayılan ayarlarla tüm trafik hub üzerinden akar ve hub darboğaz olur.",     label: 'Yönlendirme Protokolü', type: 'select', required: false, options: [{v:'ospf',l:'OSPF'},{v:'eigrp',l:'EIGRP'},{v:'bgp',l:'BGP'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const role = fv('_cgtype'), tunNum = fv('tun_num'), tunIp = fv('tun_ip');
            const wanIface = fv('wan_iface'), nhrpId = fv('nhrp_id'), nhrpKey = fv('nhrp_key');
            const phase = fv('dmvpn_phase') || '1', routing = fv('routing') || 'ospf';
            const hubWan = fv('hub_wan'), hubTun = fv('hub_tun');
            let c = '! ========================================\n! Cisco IOS — DMVPN Faz ' + phase + ' (' + (role === 'hub' ? 'Hub' : 'Spoke') + ')\n! ========================================\n\n';
            c += 'interface Tunnel' + tunNum + '\n';
            c += ' ip address ' + tunIp + '\n';
            c += ' tunnel source ' + wanIface + '\n';
            c += ' tunnel mode gre multipoint\n';
            c += ' ip nhrp network-id ' + nhrpId + '\n';
            c += ' ip nhrp authentication ' + nhrpKey + '\n';
            if (role === 'hub') {
                c += ' ip nhrp map multicast dynamic\n';
                if (phase === '3') c += ' ip nhrp redirect\n';
                if (routing === 'ospf') c += ' ip ospf network point-to-multipoint\n';
                if (routing === 'eigrp') c += ' no ip split-horizon eigrp 100\n no ip next-hop-self eigrp 100\n';
            } else {
                c += ' ip nhrp map multicast ' + hubWan + '\n';
                c += ' ip nhrp map ' + hubTun + ' ' + hubWan + '\n';
                c += ' ip nhrp nhs ' + hubTun + '\n';
                if (phase === '3') c += ' ip nhrp shortcut\n';
                if (routing === 'ospf') c += ' ip ospf network point-to-multipoint\n';
            }
            c += ' tunnel key ' + nhrpId + '\n!\n\n';
            if (routing === 'ospf') {
                c += '! OSPF — Tunnel interface area 0\'a ekle:\n! router ospf 1\n!  network 10.64.0.0 0.0.0.255 area 0\n\n';
            } else if (routing === 'eigrp') {
                c += '! EIGRP:\n! router eigrp 100\n!  network 10.64.0.0 0.0.0.255\n\n';
            }
            c += '! Doğrulama:\n! show dmvpn\n! show ip nhrp\n! show interface Tunnel' + tunNum + '\n';
            return c;
        });
    }
};

// ── EIGRP Named Mode ──────────────────────────────────────────────────────────
CiscoIOS.eigrpnamed = {
    label: 'EIGRP Named Mode',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-project-diagram', title: 'EIGRP Named Mode', desc: 'Modern EIGRP named mode konfigürasyonu — AF-interface, auth ve redistribute desteğiyle.' },
            configTypes: [
                { id: 'eigrpnamed', label: 'EIGRP Named', icon: 'fas fa-project-diagram', desc: 'Named mode EIGRP prosesi', badge: { text: 'Önerilen', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'EIGRP Named Mode', icon: 'fas fa-project-diagram', showFor: ['eigrpnamed'], warn: null, info: null,
                    fields: [
                        { name: 'proc_name', why: "Named mode'da proses adı <b>yereldir</b>; komşuyla eşleşmesi gereken AS numarasıdır. Adı sonradan değiştirmek tüm alt yapılandırmayı baştan yazmayı gerektirir.",    label: 'Proses Adı',                   type: 'text',   required: true,  placeholder: 'CORP',             hint: 'EIGRP named process adı' },
                        { name: 'asn', why: "EIGRP AS numarası komşularla <b>birebir</b> aynı olmalı. Farklıysa komşuluk hiç kurulmaz ve log'da bariz bir hata görmezsin — bu yüzden önce AS'i doğrula.",          label: 'AS Numarası',                  type: 'text', validate: 'asn',   required: true,  placeholder: '100',              hint: 'Autonomous System numarası' },
                        { name: 'router_id', why: "Router-ID benzersiz olmalı. Çakışan ID, harici rotaların sessizce yok sayılmasına yol açar — en zor teşhis edilen EIGRP arızalarından biridir.",    label: 'Router-ID',                    type: 'text', validate: 'ip',   required: true,  placeholder: '1.1.1.1',          hint: 'EIGRP router-id' },
                        { name: 'network', why: "Named mode'da <code>network</code> yine wildcard maske ister ve hangi arayüzlerin EIGRP'e katılacağını belirler. Fazla geniş yazmak WAN arayüzünü de komşuluğa açar.",      label: 'Network',                      type: 'text',   required: true,  placeholder: '10.0.0.0',         hint: 'CIDR veya classful network' },
                        { name: 'af_iface', why: "Named mode'da arayüz ayarları <code>af-interface</code> altında yapılır; klasik mode komutları buraya işlemez. <code>af-interface default</code> ile başlayıp istisnaları ayrı yazmak daha güvenlidir.",     label: 'AF Interface',                 type: 'text', validate: 'iface',   required: true,  placeholder: 'GigabitEthernet0/0',hint: 'Auth + hello ayarları için' },
                        { name: 'hello', why: "EIGRP hello değeri komşuyla eşleşmek <b>zorunda değildir</b>, bu yüzden hata sessizdir: bir tarafta hello'yu kısaltıp diğerinde bırakmak tespit süresini asimetrik yapar.",        label: 'Hello Interval (sn)',          type: 'text',   required: false, placeholder: '5',                hint: 'Hello timer (varsayılan: 5)' },
                        { name: 'hold', why: "Hello'yu değiştirip hold'u güncellemeyi unutmak klasik EIGRP hatasıdır: komşuluk düzenli aralıklarla düşüp geri gelir ve nedeni geç bulunur.",         label: 'Hold Time (sn)',               type: 'text',   required: false, placeholder: '15',               hint: 'Hold-time (varsayılan: 15)' },
                        { name: 'auth_key', why: 'Kimlik doğrulama olmadan, ağa takılan herhangi bir cihaz yüksek öncelikle kendini aktif router ilan edip trafiği çalabilir.',     label: 'Auth Key',                     type: 'text',   required: false, placeholder: 'cisco123',         hint: 'MD5 kimlik doğrulama anahtarı (opsiyonel)' },
                        { name: 'redist_static', why: "EIGRP'ye statik rota dağıtırken metrik vermezsen rota <b>hiç</b> duyurulmaz. Ayrıca default rotayı dağıtmak tüm komşuları senin üzerinden çıkmaya zorlayabilir.",label: 'Redistribute Static',          type: 'select', required: false, options: [{v:'yes',l:'Evet'},{v:'no',l:'Hayır'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const name = fv('proc_name'), asn = fv('asn'), rid = fv('router_id');
            const network = fv('network'), afIface = fv('af_iface');
            const hello = fv('hello') || '5', hold = fv('hold') || '15';
            const authKey = fv('auth_key'), redistStatic = fv('redist_static');
            let c = '! ========================================\n! Cisco IOS — EIGRP Named Mode\n! ========================================\n\n';
            c += 'router eigrp ' + name + '\n';
            c += ' address-family ipv4 unicast autonomous-system ' + asn + '\n';
            c += '  af-interface ' + afIface + '\n';
            c += '   hello-interval ' + hello + '\n';
            c += '   hold-time ' + hold + '\n';
            if (authKey) {
                c += '   authentication mode md5\n';
                c += '   authentication key-chain EIGRP-KEY\n';
            }
            c += '  exit-af-interface\n';
            c += '  topology base\n';
            if (redistStatic === 'yes') {
                c += '   redistribute static metric 1000 10 255 1 1500\n';
            }
            c += '  exit-af-topology\n';
            c += '  network ' + network + '\n';
            c += '  eigrp router-id ' + rid + '\n';
            c += ' exit-address-family\n!\n\n';
            if (authKey) {
                c += '! Auth Key Chain\nkey chain EIGRP-KEY\n key 1\n  key-string ' + authKey + '\n!\n\n';
            }
            c += '! Doğrulama:\n! show eigrp address-family ipv4 neighbors\n! show eigrp address-family ipv4 topology\n! show ip route eigrp\n';
            return c;
        });
    }
};

// ── VRF-Lite ──────────────────────────────────────────────────────────────────
CiscoIOS.vrflite = {
    label: 'VRF-Lite',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-sitemap', title: 'VRF-Lite', desc: 'VRF tanımı, interface atama ve opsiyonel default route konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'vrflite', label: 'VRF-Lite', icon: 'fas fa-sitemap', desc: 'VRF definition + interface + route', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'VRF-Lite Konfigürasyonu', icon: 'fas fa-sitemap', showFor: ['vrflite'], warn: null, info: null,
                    fields: [
                        { name: 'vrf_name', why: "VRF, routing tablosunu izole eder. Arayüzü VRF'e atamak <b>üzerindeki IP'yi siler</b> — önce VRF'e al, sonra IP ver.",  label: 'VRF Adı',                    type: 'text', required: true,  placeholder: 'CORP',               hint: 'VRF ismi' },
                        { name: 'rd', why: "Route Distinguisher, aynı prefix'in farklı VRF'lerde ayırt edilmesini sağlar. VRF başına benzersiz olmalı (ör. <code>65000:100</code>).",        label: 'Route Distinguisher (RD)',    type: 'text', validate: 'rd', required: true,  placeholder: '65001:1',            hint: 'Benzersiz RD değeri' },
                        { name: 'rt_exp', why: "Route Target export, bu VRF'in rotalarını hangi etiketle duyuracağını belirler. Import/export eşleşmesi yanlışsa siteler birbirini göremez.",    label: 'Route Target Export',         type: 'text', required: true,  placeholder: '65001:1',            hint: 'Export RT' },
                        { name: 'rt_imp', why: "Import, hangi etiketli rotaların bu VRF'e alınacağını belirler. Hub-and-spoke topolojide import/export asimetrik kurulur.",    label: 'Route Target Import',         type: 'text', required: true,  placeholder: '65001:1',            hint: 'Import RT' },
                        { name: 'vrf_iface', why: "Bir arayüzü VRF'e almak üzerindeki IP adresini <b>siler</b>. Önce <code>vrf forwarding</code>, sonra IP ver; sırayı karıştırmak uzaktan bağlantıyı koparır.", label: 'VRF Interface',              type: 'text', validate: 'iface', required: true,  placeholder: 'GigabitEthernet0/1', hint: 'VRF\'e atanacak interface' },
                        { name: 'iface_ip', why: "VRF'e aldıktan sonra IP'yi yeniden girmen gerekir. Aynı adres başka bir VRF'te de kullanılabilir — bu VRF'in amacıdır ama sorun giderirken ciddi karışıklık yaratır.",  label: 'Interface IP / Mask',        type: 'text', validate: 'ip_mask', required: true,  placeholder: '10.1.1.1 255.255.255.0', hint: 'Interface IP adresi' },
                        { name: 'vrf_gw', why: "VRF içindeki rotalar global tabloya <b>bakmaz</b>. Default rotayı <code>ip route vrf &lt;ad&gt;</code> ile ayrıca tanımlamazsan VRF trafiği hiçbir yere gitmez.",    label: 'VRF Default Route (Next-Hop)',type: 'text', required: false, placeholder: '10.1.1.254',         hint: 'VRF içi default gateway (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const vrfName = fv('vrf_name'), rd = fv('rd'), rtExp = fv('rt_exp'), rtImp = fv('rt_imp');
            const iface = fv('vrf_iface'), ifaceIp = fv('iface_ip'), gw = fv('vrf_gw');
            let c = '! ========================================\n! Cisco IOS — VRF-Lite\n! ========================================\n\n';
            c += 'vrf definition ' + vrfName + '\n';
            c += ' rd ' + rd + '\n';
            c += ' route-target export ' + rtExp + '\n';
            c += ' route-target import ' + rtImp + '\n';
            c += ' address-family ipv4\n exit-address-family\n!\n\n';
            c += 'interface ' + iface + '\n';
            c += ' vrf forwarding ' + vrfName + '\n';
            c += ' ip address ' + ifaceIp + '\n';
            c += ' no shutdown\n!\n\n';
            if (gw) {
                c += 'ip route vrf ' + vrfName + ' 0.0.0.0 0.0.0.0 ' + gw + '\n\n';
            }
            c += '! Doğrulama:\n! show vrf\n! show ip route vrf ' + vrfName + '\n! show interfaces ' + iface + ' | include VRF\n';
            return c;
        });
    }
};

// ── Cisco IOS: MPLS LDP ───────────────────────────────────────────────────────
CiscoIOS.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-tags', title: 'MPLS / LDP', desc: 'Global MPLS etkinleştirme, LDP router-id ve interface bazlı mpls ip konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'mpls', label: 'MPLS / LDP', icon: 'fas fa-tags', desc: 'LDP tabanlı MPLS konfigürasyonu', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'MPLS / LDP Konfigürasyonu', icon: 'fas fa-tags', showFor: ['mpls'], warn: null, info: null,
                    fields: [
                        { name: 'router_id', why: "LDP router-ID'si olarak kullanılan loopback, IGP'de <code>/32</code> olarak duyurulmalı. Duyurulmazsa LDP oturumu kurulmaz ve tüm MPLS yolu çöker.",   label: 'Router ID (Loopback IP)',              type: 'text', validate: 'ip',     required: true,  placeholder: '1.1.1.1',                         hint: 'Loopback interface IP adresi' },
                        { name: 'lo_iface', why: "LDP router-ID'si bu loopback'ten alınır ve IGP'de <code>/32</code> duyurulmalı. Duyurulmazsa LDP oturumu kurulmaz ve MPLS yolu baştan çöker.",    label: 'Loopback Interface',                   type: 'text', validate: 'iface',     required: true,  placeholder: 'Loopback0',                       hint: 'Loopback interface adı' },
                        { name: 'mpls_ifaces', why: "MPLS'in çalışacağı arayüzler. LDP komşuluğu kurulmadan etiket dağıtımı olmaz ve L3VPN trafiği geçmez.", label: 'MPLS Interface\'ler (her satıra bir)', type: 'textarea', required: true,  placeholder: 'GigabitEthernet0/0\nGigabitEthernet0/1', hint: 'mpls ip etkinleştirilecek interface\'ler' },
                        { name: 'ldp_rid_if', why: 'LDP Router-ID için Loopback kullanılmalı; fiziksel arayüz down olduğunda LDP oturumları kopar.',  label: 'LDP Router-ID Interface',              type: 'text',     required: true,  placeholder: 'Loopback0',                       hint: 'LDP router-id için interface' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const routerId = fv('router_id'), loIface = fv('lo_iface');
            const mplsIfaces = fv('mpls_ifaces').split('\n').map(s => s.trim()).filter(Boolean);
            const ldpRidIf = fv('ldp_rid_if');
            let c = '! ========================================\n! Cisco IOS — MPLS / LDP\n! ========================================\n\n';
            c += 'mpls ip\n';
            c += 'mpls ldp router-id ' + ldpRidIf + ' force\n\n';
            c += 'interface ' + loIface + '\n';
            c += ' ip address ' + routerId + ' 255.255.255.255\n\n';
            mplsIfaces.forEach(iface => {
                c += 'interface ' + iface + '\n';
                c += ' mpls ip\n\n';
            });
            c += '! Doğrulama:\n! show mpls ldp neighbor\n! show mpls ldp bindings\n! show mpls forwarding-table\n';
            return c;
        });
    }
};

// ── Cisco IOS: L3VPN (PE) ─────────────────────────────────────────────────────
CiscoIOS.l3vpn = {
    label: 'L3VPN (PE)',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-cloud-upload-alt', title: 'L3VPN PE Konfigürasyonu', desc: 'MPLS L3VPN PE tarafı — ip vrf, CE interface ve BGP VPNv4/VRF address-family yapılandırması.' },
            configTypes: [
                { id: 'l3vpn', label: 'L3VPN PE', icon: 'fas fa-cloud-upload-alt', desc: 'PE yönlendirici L3VPN konfigürasyonu', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VRF & RD/RT', icon: 'fas fa-sitemap', showFor: ['l3vpn'], warn: null, info: null,
                    fields: [
                        { name: 'vrf_name', why: "VRF, routing tablosunu izole eder. Arayüzü VRF'e atamak <b>üzerindeki IP'yi siler</b> — önce VRF'e al, sonra IP ver.",  label: 'VRF Adı',             type: 'text', required: true, placeholder: 'CUST_A',    hint: 'Müşteri VRF ismi' },
                        { name: 'rd', why: "Route Distinguisher, aynı prefix'in farklı VRF'lerde ayırt edilmesini sağlar. VRF başına benzersiz olmalı (ör. <code>65000:100</code>).",        label: 'Route Distinguisher',  type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'Benzersiz RD değeri' },
                        { name: 'rt_import', why: "Import edilen route target, karşı VRF'in export ettiğiyle eşleşmeli. Yanlış RT, rotaların VPNv4 tablosunda görünüp VRF'e hiç kopyalanmamasına yol açar — <code>show bgp vpnv4 all</code> ile teşhis et.", label: 'Route Target Import',  type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import RT' },
                        { name: 'rt_export', why: "Export RT, bu VRF'in rotalarını kimin alacağını belirler. Hub-and-spoke topolojide import ve export'u aynı vermek, istemeden full-mesh bir VPN yaratır.", label: 'Route Target Export',  type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Export RT' }
                    ]
                },
                {
                    title: 'CE Interface & BGP', icon: 'fas fa-exchange-alt', showFor: ['l3vpn'], warn: null, info: null,
                    fields: [
                        { name: 'ce_iface', why: "PE üzerinde müşteriye bakan arayüz. Doğru VRF'e almazsan müşteri rotaları global tabloya karışır; bu, müşteriler arası sızıntı anlamına gelir.",   label: 'CE Interface',       type: 'text', validate: 'iface', required: true,  placeholder: 'GigabitEthernet0/1',      hint: 'PE-CE bağlantı interface' },
                        { name: 'ce_ip', why: "PE-CE bağlantı adresi. Müşterinin adres planıyla çakışmayan bir /30 seç; çakışma aynı prefix'in iki farklı yere işaret etmesine yol açar.",      label: 'CE Interface IP',    type: 'text', validate: 'ip_mask', required: true,  placeholder: '10.1.1.1 255.255.255.252', hint: 'PE tarafı IP adresi' },
                        { name: 'local_as', why: "Kendi AS numaran. Peer'ın AS'i farklıysa eBGP, aynıysa iBGP olur; ikisinin davranışı belirgin şekilde farklıdır.",   label: 'Local BGP AS (PE)',  type: 'text', validate: 'asn', required: true,  placeholder: '65001',                   hint: 'PE BGP AS numarası' },
                        { name: 'ce_as', why: "Müşteri AS'i. Birden fazla şube aynı AS'i kullanıyorsa BGP döngü koruması rotaları reddeder; çözüm <code>as-override</code> ya da <code>allowas-in</code>'dir.",      label: 'CE BGP AS',          type: 'text', validate: 'asn', required: false, placeholder: '65100',                   hint: 'CE BGP AS (opsiyonel)' },
                        { name: 'ce_neighbor', why: "Komşu <code>address-family ipv4 vrf</code> altında tanımlanmalı. Global BGP altında tanımlamak, rotaların VRF'e hiç girmemesi demektir.",label: 'CE BGP Neighbor IP', type: 'text', required: false, placeholder: '10.1.1.2',                hint: 'CE\'nin IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const vrfName = fv('vrf_name'), rd = fv('rd'), rtImport = fv('rt_import'), rtExport = fv('rt_export');
            const ceIface = fv('ce_iface'), ceIp = fv('ce_ip'), ceAs = fv('ce_as');
            const ceNeighbor = fv('ce_neighbor'), localAs = fv('local_as');
            let c = '! ========================================\n! Cisco IOS — L3VPN PE Konfigürasyonu\n! ========================================\n\n';
            c += 'ip vrf ' + vrfName + '\n';
            c += ' rd ' + rd + '\n';
            c += ' route-target export ' + rtExport + '\n';
            c += ' route-target import ' + rtImport + '\n\n';
            c += 'interface ' + ceIface + '\n';
            c += ' ip vrf forwarding ' + vrfName + '\n';
            c += ' ip address ' + ceIp + '\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' address-family vpnv4\n';
            c += '  neighbor <RR_IP> activate\n';
            c += '  neighbor <RR_IP> send-community extended\n';
            c += ' exit-address-family\n\n';
            if (ceAs && ceNeighbor) {
                c += ' address-family ipv4 vrf ' + vrfName + '\n';
                c += '  neighbor ' + ceNeighbor + ' remote-as ' + ceAs + '\n';
                c += '  neighbor ' + ceNeighbor + ' activate\n';
                c += '  redistribute connected\n';
                c += ' exit-address-family\n\n';
            }
            c += '! Doğrulama:\n! show ip vrf\n! show bgp vpnv4 unicast all summary\n! show ip route vrf ' + vrfName + '\n';
            return c;
        });
    }
};

// ── Cisco IOS: Route-Map & Redistribution ─────────────────────────────────────
CiscoIOS.routemap = {
    label: 'Route-Map & Redistribution',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-map-signs', title: 'Route-Map & Redistribution', desc: 'Route-map tanımı ve protokoller arası redistribution konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'routemap', label: 'Route-Map', icon: 'fas fa-map-signs', desc: 'Match/set + redistribute', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Route-Map Tanımı', icon: 'fas fa-map-signs', showFor: ['routemap'], warn: null, info: null,
                    fields: [
                        { name: 'rm_name', why: "Route-map adı ve sequence numarası birlikte kritiktir: numara vermezsen varsayılan 10 kullanılır ve mevcut girdiyi sessizce ezebilirsin.",   label: 'Route-Map Adı', type: 'text',   required: true,  placeholder: 'RM_OSPF_TO_BGP', hint: 'Route-map ismi' },
                        { name: 'rm_action', why: '<code>permit</code> eşleşeni işler, <code>deny</code> reddeder. <b>Route-map sonunda gizli bir <code>deny any</code> vardır</b> — eşleşmeyen tüm rotalar düşer.', label: 'Aksiyon',       type: 'select', required: false, options: [{v:'permit',l:'Permit'},{v:'deny',l:'Deny'}] },
                        { name: 'rm_seq', why: 'Sıra numarası önemlidir; yukarıdan aşağıya ilk eşleşen uygulanır. Aralıklı numaralamak (10, 20, 30) sonradan araya ekleme imkânı verir.',    label: 'Sequence',      type: 'text',   required: true,  placeholder: '10',             hint: 'Sequence numarası' }
                    ]
                },
                {
                    title: 'Match Koşulları', icon: 'fas fa-filter', showFor: ['routemap'], warn: null, info: 'Boş bırakılan match satırları çıktıya eklenmez.',
                    fields: [
                        { name: 'match_pl', why: "Prefix-list, ACL'den farklı olarak prefix <b>uzunluğunu</b> da denetler (<code>le</code>/<code>ge</code>). Rota filtrelemede ACL kullanmak /24 ile /32'yi ayırt edememek demektir.",  label: 'Match: Prefix-List Adı',  type: 'text', required: false, placeholder: 'PL_NETWORKS', hint: 'Prefix-list adı' },
                        { name: 'match_acl', why: "Route-map satırında hiç <code>match</code> yoksa satır <b>her şeye</b> uyar. Boş bırakılmış bir <code>deny</code> satırı tüm rotaları sessizce düşürür.", label: 'Match: IP Address ACL',   type: 'text', required: false, placeholder: '1',            hint: 'ACL numarası/adı' }
                    ]
                },
                {
                    title: 'Set Değerleri', icon: 'fas fa-sliders-h', showFor: ['routemap'], warn: null, info: 'Boş bırakılan set satırları çıktıya eklenmez.',
                    fields: [
                        { name: 'set_lp', why: 'Local-Preference yalnızca <b>iBGP içinde</b> taşınır ve yüksek olan kazanır. Giden trafiğin hangi çıkıştan gideceğini belirlemenin ana yoludur.',        label: 'Set: Local-Preference', type: 'text', required: false, placeholder: '150',       hint: 'BGP local-preference' },
                        { name: 'set_med', why: "MED komşu AS'e 'beni buradan tercih et' der ama <b>bağlayıcı değildir</b>; karşı taraf dikkate almayabilir. Gelen trafiği yönlendirmek her zaman zordur.",        label: 'Set: MED',              type: 'text', required: false, placeholder: '100',       hint: 'BGP MED metriği' },
                        { name: 'set_community', why: "Community etiketi, karşı AS'in tanımladığı politikaları tetikler (ör. no-export). Sağlayıcının doküman ettiği değerleri kullanmalısın.",  label: 'Set: Community',        type: 'text', required: false, placeholder: '65001:200', hint: 'BGP community değeri' }
                    ]
                },
                {
                    title: 'Redistribution', icon: 'fas fa-exchange-alt', showFor: ['routemap'], warn: null, info: 'Sadece route-map oluşturmak için boş bırakın.',
                    fields: [
                        { name: 'src_proto', why: "Redistribution protokoller arasında metrik taşımaz. Hedef protokolde varsayılan metrik tanımlanmazsa rotalar dağıtılmış görünür ama tabloya hiç girmez.", label: 'Kaynak Protokol', type: 'select', required: false, options: [{v:'ospf 1',l:'OSPF'},{v:'eigrp 100',l:'EIGRP'},{v:'connected',l:'Connected'},{v:'static',l:'Static'},{v:'',l:'Sadece Route-Map'}] },
                        { name: 'dst_proto', why: "Karşılıklı (mutual) redistribution yapıyorsan route-map ile etiketleyip filtrele; yoksa rota döngüsü ve kalıcı flap kaçınılmazdır.", label: 'Hedef Protokol',  type: 'select', required: false, options: [{v:'bgp',l:'BGP'},{v:'ospf 1',l:'OSPF'},{v:'eigrp 100',l:'EIGRP'},{v:'',l:'Sadece Route-Map'}] },
                        { name: 'bgp_as', why: "Hedef BGP ise duyuruların kontrolsüz yayılma riski vardır. <code>network</code> yerine redistribute kullanmak, IGP'deki her dalgalanmayı internete taşır.",    label: 'BGP AS',          type: 'text', validate: 'asn',   required: false, placeholder: '65001', hint: 'BGP hedef ise AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const rmName = fv('rm_name'), rmAction = fv('rm_action') || 'permit', rmSeq = fv('rm_seq');
            const matchPl = fv('match_pl'), matchAcl = fv('match_acl');
            const setLp = fv('set_lp'), setMed = fv('set_med'), setCom = fv('set_community');
            const srcProto = fv('src_proto'), dstProto = fv('dst_proto'), bgpAs = fv('bgp_as');
            let c = '! ========================================\n! Cisco IOS — Route-Map & Redistribution\n! ========================================\n\n';
            c += 'route-map ' + rmName + ' ' + rmAction + ' ' + rmSeq + '\n';
            if (matchPl) c += ' match ip address prefix-list ' + matchPl + '\n';
            if (matchAcl) c += ' match ip address ' + matchAcl + '\n';
            if (setLp) c += ' set local-preference ' + setLp + '\n';
            if (setMed) c += ' set metric ' + setMed + '\n';
            if (setCom) c += ' set community ' + setCom + ' additive\n';
            c += '!\n\n';
            if (srcProto && dstProto) {
                if (dstProto === 'bgp' && bgpAs) {
                    c += 'router bgp ' + bgpAs + '\n';
                    c += ' redistribute ' + srcProto + ' route-map ' + rmName + '\n';
                } else {
                    c += 'router ' + dstProto + '\n';
                    c += ' redistribute ' + srcProto + ' subnets route-map ' + rmName + '\n';
                }
                c += '!\n\n';
            }
            c += '! Doğrulama:\n! show route-map ' + rmName + '\n! show ip bgp neighbors <IP> advertised-routes\n';
            return c;
        });
    }
};

// ── Cisco IOS: IS-IS ──────────────────────────────────────────────────────────
CiscoIOS.isis = {
    label: 'IS-IS',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-broadcast-tower', title: 'IS-IS', desc: 'IS-IS routing protokolü — NET, level, interface ve passive-interface konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'isis', label: 'IS-IS', icon: 'fas fa-broadcast-tower', desc: 'IS-IS routing konfigürasyonu', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'IS-IS Konfigürasyonu', icon: 'fas fa-broadcast-tower', showFor: ['isis'], warn: null, info: null,
                    fields: [
                        { name: 'net', why: "NET adresi CLNS formatındadır: alan kimliği + 6 byte sistem kimliği + <code>00</code> selector. Sistem kimliği tüm alanda <b>benzersiz</b> olmalı ve adres mutlaka <code>.00</code> ile bitmeli; aksi halde IS-IS hiç başlamaz.",     label: 'NET (Network Entity Title)',         type: 'text',     required: true,  placeholder: '49.0001.0000.0000.0001.00',  hint: 'CLNS network entity title' },
                        { name: 'level', why: 'IS-IS Level-1 alan içi, Level-2 alanlar arası çalışır. Gereksiz yere Level-1-2 çalıştırmak iki ayrı veritabanı tutulmasına ve fazla yüke yol açar.',   label: 'IS-IS Level',                       type: 'select',   required: false, options: [{v:'level-2-only',l:'Level-2 Only'},{v:'level-1-only',l:'Level-1 Only'},{v:'level-1-2',l:'Level-1-2'}] },
                        { name: 'ifaces', why: "IS-IS arayüz altında <code>ip router isis</code> ile açılır; OSPF'teki gibi <code>network</code> satırı yoktur. Loopback'i eklemeyi unutmak router-ID ve duyuru sorunlarına yol açar.",  label: 'Interface\'ler (her satıra bir)',   type: 'textarea', required: true,  placeholder: 'GigabitEthernet0/0\nLoopback0', hint: 'IS-IS etkinleştirilecek interface\'ler' },
                        { name: 'passive', why: 'Passive interface, o arayüzden OSPF <b>hello</b> göndermeyi durdurur ama ağı yine duyurur. LAN ve WAN arayüzlerinde güvenlik için açılmalıdır.', label: 'Passive Interface\'ler (virgülle)', type: 'text',     required: false, placeholder: 'Loopback0',                   hint: 'Pasif interface listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const net = fv('net'), level = fv('level') || 'level-2-only';
            const ifaces = fv('ifaces').split('\n').map(s => s.trim()).filter(Boolean);
            const passive = fv('passive').split(',').map(s => s.trim()).filter(Boolean);
            let c = '! ========================================\n! Cisco IOS — IS-IS\n! ========================================\n\n';
            c += 'router isis\n net ' + net + '\n is-type ' + level + '\n';
            passive.forEach(p => c += ' passive-interface ' + p + '\n');
            c += '!\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n ip router isis\n';
                if (level !== 'level-1-2') c += ' isis circuit-type ' + level + '\n';
                c += '!\n';
            });
            c += '\n! Doğrulama:\n! show isis neighbors\n! show isis database\n! show ip route isis\n';
            return c;
        });
    }
};

// ── Cisco IOS: Zone-Based Firewall ───────────────────────────────────────────
CiscoIOS.zbfw = {
    label: 'Zone-Based Firewall',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-shield-alt', title: 'Zone-Based Firewall', desc: 'ZBF zone, class-map, policy-map ve zone-pair konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'zbfw', label: 'Zone-Based FW', icon: 'fas fa-shield-alt', desc: 'Inside/Outside zone çifti', badge: { text: 'Güvenlik', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Zone-Based Firewall', icon: 'fas fa-shield-alt', showFor: ['zbfw'], warn: null, info: null,
                    fields: [
                        { name: 'in_zone', why: "ZBFW'de <b>aynı zone içi trafik serbesttir</b>, farklı zone'lar arası ise zone-pair tanımlanmadan tamamen bloklu. Self zone (cihazın kendisi) ayrıca ele alınmalıdır.",  label: 'Inside Zone Adı',    type: 'text', required: true, placeholder: 'INSIDE',             hint: 'İç ağ zone adı' },
                        { name: 'out_zone', why: "Zone-pair yönlüdür: inside→outside tanımlamak, outside→inside'ı açmaz. Dönüş trafiği için inspect kullanılır.", label: 'Outside Zone Adı',   type: 'text', required: true, placeholder: 'OUTSIDE',            hint: 'Dış ağ zone adı' },
                        { name: 'in_iface', why: "Arayüzü zone'a atamadan zone-pair yazmak hiçbir şey yapmaz. Arayüz zone'a alındığı anda varsayılan davranış değişir: eşleşmeyen tüm trafik düşer.", label: 'Inside Interface',   type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/1', hint: 'İç interface' },
                        { name: 'out_iface', why: "Dış arayüzü zone'a aldığın anda cihazın kendi trafiği de etkilenir. <code>self</code> zone için kural yazmazsan SSH erişimini kaybedebilirsin.",label: 'Outside Interface',  type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Dış interface' },
                        { name: 'protos', why: "Yalnızca burada saydığın protokoller <code>inspect</code> edilir; geri kalan her şey sessizce düşer. ICMP'yi unutmak, çalışan bir ağda ping'in aniden kesilmesi demektir.",   label: 'İzin verilen protokoller (virgülle)', type: 'text', required: true, placeholder: 'tcp,udp,icmp', hint: 'Örn: tcp,udp,icmp' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const inZone = fv('in_zone'), outZone = fv('out_zone');
            const inIface = fv('in_iface'), outIface = fv('out_iface');
            const protos = fv('protos').split(',').map(s => s.trim()).filter(Boolean);
            const cmName = 'CM_' + inZone + '_TO_' + outZone;
            const pmName = 'PM_' + inZone + '_TO_' + outZone;
            let c = '! ========================================\n! Cisco IOS — Zone-Based Firewall\n! ========================================\n\n';
            c += 'zone security ' + inZone + '\nzone security ' + outZone + '\n!\n\n';
            c += 'class-map type inspect match-any ' + cmName + '\n';
            protos.forEach(p => c += ' match protocol ' + p + '\n');
            c += '!\npolicy-map type inspect ' + pmName + '\n class type inspect ' + cmName + '\n  inspect\n!\n\n';
            c += 'zone-pair security ZP_IN_OUT source ' + inZone + ' destination ' + outZone + '\n';
            c += ' service-policy type inspect ' + pmName + '\n!\n\n';
            c += 'interface ' + inIface + '\n zone-member security ' + inZone + '\n!\n';
            c += 'interface ' + outIface + '\n zone-member security ' + outZone + '\n!\n\n';
            c += '! Doğrulama:\n! show policy-map type inspect zone-pair\n! show zone security\n';
            return c;
        });
    }
};

// ── Cisco IOS: BFD ────────────────────────────────────────────────────────────
CiscoIOS.bfd = {
    label: 'BFD',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-heartbeat', title: 'BFD (Bidirectional Forwarding Detection)', desc: 'Interface BFD timer ve protokol entegrasyonu (OSPF/BGP/EIGRP) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'bfd', label: 'BFD', icon: 'fas fa-heartbeat', desc: 'BFD timer + protokol entegrasyonu', badge: { text: 'Önerilen', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'BFD Konfigürasyonu', icon: 'fas fa-heartbeat', showFor: ['bfd'], warn: null, info: null,
                    fields: [
                        { name: 'iface', why: "BFD her <b>iki uçta</b> da aynı arayüzde açılmalı. Tek taraflı yapılandırma oturumu <code>down</code> durumunda bekletir ve sessizce hiçbir şey yapmaz.",        label: 'Interface',               type: 'text', validate: 'iface',   required: true,  placeholder: 'GigabitEthernet0/0', hint: 'BFD etkinleştirilecek interface' },
                        { name: 'interval', why: 'BFD, saniyeler yerine <b>milisaniyeler</b> içinde arıza tespit eder. Çok agresif değerler CPU yükü ve yanlış pozitif üretir; 300ms tipik bir başlangıçtır.',     label: 'BFD Interval (ms)',       type: 'text',   required: true,  placeholder: '300',                hint: 'Gönderme aralığı' },
                        { name: 'min_rx', why: "Karşı tarafın gönderim aralığıyla uyumlu olmalı; asimetrik değerler BFD oturumunun hiç kurulmamasına yol açar. Yazılım tabanlı BFD'de 50 ms gibi değerler CPU'yu boğar.",       label: 'Min-Rx (ms)',             type: 'text',   required: true,  placeholder: '300',                hint: 'Minimum alma aralığı' },
                        { name: 'multiplier', why: 'Kaç ardışık kayıp paketten sonra komşunun down sayılacağı. interval × multiplier = tespit süresi.',   label: 'Multiplier',              type: 'text',   required: true,  placeholder: '3',                  hint: 'Dead interval çarpanı' },
                        { name: 'protocol', why: "BFD tek başına failover hızlandırmaz; hangi protokolün onu dinleyeceğini burada seçersin. Protokol altında etkinleştirilmezse BFD oturumu kurulur ama kimse sonucunu kullanmaz.",     label: 'Protokol',                type: 'select', required: false, options: [{v:'ospf',l:'OSPF'},{v:'bgp',l:'BGP'},{v:'eigrp',l:'EIGRP'}] },
                        { name: 'proc_id', why: "BFD'yi yalnızca arayüzde açmak yetmez; protokol altında da (<code>bfd all-interfaces</code> ya da neighbor bazlı) etkinleştirmelisin. Eksikse BFD çalışır ama kimse sonucunu kullanmaz.",      label: 'OSPF PID / BGP AS',       type: 'text',   required: false, placeholder: '1',                  hint: 'OSPF process ID veya BGP AS numarası' },
                        { name: 'bgp_neighbor', why: "BGP için BFD, neighbor bazlı <code>fall-over bfd</code> ile açılır. Multihop eBGP'de ayrıca <code>bfd multihop</code> gerekir; yoksa oturum hiç kurulmaz.", label: 'BGP Neighbor IP',         type: 'text',   required: false, placeholder: '10.0.0.2',           hint: 'BGP seçiliyse neighbor IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const iface = fv('iface'), interval = fv('interval'), minRx = fv('min_rx'), mult = fv('multiplier');
            const proto = fv('protocol') || 'ospf', procId = fv('proc_id'), bgpNeighbor = fv('bgp_neighbor');
            let c = '! ========================================\n! Cisco IOS — BFD\n! ========================================\n\n';
            c += 'interface ' + iface + '\n';
            c += ' bfd interval ' + interval + ' min_rx ' + minRx + ' multiplier ' + mult + '\n!\n\n';
            if (proto === 'ospf') {
                c += 'router ospf ' + (procId || '1') + '\n bfd all-interfaces\n!\n\n';
            } else if (proto === 'bgp' && bgpNeighbor) {
                c += 'router bgp ' + (procId || '65001') + '\n neighbor ' + bgpNeighbor + ' fall-over bfd\n!\n\n';
            } else if (proto === 'eigrp') {
                c += 'router eigrp ' + (procId || '100') + '\n bfd all-interfaces\n!\n\n';
            }
            c += '! Doğrulama:\n! show bfd neighbors\n! show bfd neighbors details\n';
            return c;
        });
    }
};

// ── SPAN / RSPAN ──────────────────────────────────────────────────────────────
CiscoIOS.span = {
    label: 'SPAN / RSPAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'SPAN / RSPAN — Port Mirroring',
                desc: 'Bir port veya VLAN trafiğinin kopyasını analiz portuna (Wireshark, IDS, NDR) gönderir. <strong>SPAN</strong> aynı switch içinde, <strong>RSPAN</strong> ayrılmış bir RSPAN VLAN\'ı üzerinden başka bir switch\'e taşır.'
            },
            configTypes: [
                { id: 'local', label: 'Yerel SPAN', icon: 'fas fa-eye', desc: 'Kaynak ve analiz portu aynı switch\'te', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'rspan_src', label: 'RSPAN — Kaynak Switch', icon: 'fas fa-upload', desc: 'Trafiği RSPAN VLAN\'ına kopyalar', badge: { text: 'Uzak', cls: 'common' } },
                { id: 'rspan_dst', label: 'RSPAN — Hedef Switch', icon: 'fas fa-download', desc: 'RSPAN VLAN\'ından analiz portuna', badge: { text: 'Uzak', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Oturum', icon: 'fas fa-hashtag', showFor: ['local', 'rspan_src', 'rspan_dst'],
                    fields: [
                        { name: 'session', why: 'Platform başına eşzamanlı oturum sayısı sınırlıdır (Catalyst\'lerde çoğunlukla 2 yerel/RSPAN kaynak oturumu). Aynı numara başka oturumda kullanılıyorsa üzerine yazılır.', label: 'Oturum No', type: 'text', validate: 'posint', required: true, placeholder: '1', hint: 'monitor session numarası' }
                    ]
                },
                {
                    title: 'Kaynak', icon: 'fas fa-sign-in-alt', showFor: ['local', 'rspan_src'],
                    fields: [
                        { name: 'src_type', label: 'Kaynak Tipi', type: 'select', options: [
                            { value: 'interface', label: 'Arayüz(ler)', selected: true },
                            { value: 'vlan', label: 'VLAN(lar)' }
                        ]},
                        { name: 'src_ifaces', why: 'Birden fazla portu aynı yönde izlemek analiz portunun bant genişliğini aşabilir; kopyalanamayan paketler sessizce düşer.', label: 'Kaynak Arayüzler', type: 'text', validate: 'iface_range', requiredIf: { field: 'src_type', in: ['interface'] }, placeholder: 'GigabitEthernet1/0/1', hint: 'Virgülle liste veya aralık: Gi1/0/1-4' },
                        { name: 'src_vlans', label: 'Kaynak VLAN\'lar', type: 'text', validate: 'vlan_list', requiredIf: { field: 'src_type', in: ['vlan'] }, placeholder: '10,20', hint: 'VLAN kaynağında yön genellikle yalnız rx desteklenir' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [
                            { value: 'both', label: 'both — giden ve gelen', selected: true },
                            { value: 'rx', label: 'rx — yalnız gelen' },
                            { value: 'tx', label: 'tx — yalnız giden' }
                        ]}
                    ]
                },
                {
                    title: 'RSPAN VLAN', icon: 'fas fa-route', showFor: ['rspan_src', 'rspan_dst'],
                    info: 'RSPAN VLAN\'ı kaynak ile hedef arasındaki TÜM switch\'lerde <code>remote-span</code> olarak tanımlı ve trunk\'lardan izinli olmalıdır.',
                    fields: [
                        { name: 'rspan_vlan', why: 'Bu VLAN yalnızca yansıtılan trafik için ayrılmalıdır; üzerinde son kullanıcı portu olmamalıdır.', label: 'RSPAN VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '900', hint: 'Yalnızca SPAN trafiği için ayrılmış VLAN' }
                    ]
                },
                {
                    title: 'Hedef (Analiz Portu)', icon: 'fas fa-sign-out-alt', showFor: ['local', 'rspan_dst'],
                    fields: [
                        { name: 'dst_iface', why: 'Hedef port normal trafiği taşımaz; SPAN hedefi olduğu sürece bağlı cihaz ağa erişemez.', label: 'Hedef Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'GigabitEthernet1/0/24', hint: 'Analiz cihazının bağlı olduğu port' },
                        { name: 'replicate', label: 'encapsulation replicate (CDP/STP/VTP gibi L2 protokol çerçevelerini de kopyala)', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'SPAN Konfigürasyonu Oluştur'
        }, (data) => cgIosSpanGen(data));
    }
};

// Kullanicinin 'Gi1/0/1-4, Gi1/0/8' listesini IOS bicimine cevirir:
// 'Gi1/0/1 - 4 , Gi1/0/8' (aralikta tire, listede virgul, ikisinin cevresinde bosluk).
function cgIosSpanList(s) {
    return String(s || '').split(/[,\s]+/).filter(Boolean)
        .map(p => p.replace(/^(.*\D)(\d+)-(\d+)$/, '$1$2 - $3')).join(' , ');
}

function cgIosSpanGen(data) {
    const t = data._cgtype, sid = cgEsc(data.session || '');
    const src = data.src_type === 'vlan'
        ? 'vlan ' + cgEsc(data.src_vlans || '')
        : 'interface ' + cgIosSpanList(cgEsc(data.src_ifaces || ''));
    const dir = cgEsc(data.direction || 'both'), rv = cgEsc(data.rspan_vlan || '');
    const dst = cgEsc(data.dst_iface || ''), rep = data.replicate ? ' encapsulation replicate' : '';
    let c = '! ========================================\n! Cisco IOS SPAN / RSPAN\n! ========================================\n\n';
    c += 'no monitor session ' + sid + '\n';
    if (t === 'local') {
        c += 'monitor session ' + sid + ' source ' + src + ' ' + dir + '\n';
        c += 'monitor session ' + sid + ' destination interface ' + dst + rep + '\n';
    } else if (t === 'rspan_src') {
        c += 'vlan ' + rv + '\n remote-span\n!\n';
        c += 'monitor session ' + sid + ' source ' + src + ' ' + dir + '\n';
        c += 'monitor session ' + sid + ' destination remote vlan ' + rv + '\n';
    } else {
        c += 'vlan ' + rv + '\n remote-span\n!\n';
        c += 'monitor session ' + sid + ' source remote vlan ' + rv + '\n';
        c += 'monitor session ' + sid + ' destination interface ' + dst + rep + '\n';
    }
    c += '\n! Doğrulama:\n! show monitor session ' + sid + '\n! show monitor session ' + sid + ' detail\n';
    return c;
}

// ── NTP + Saat Dilimi ─────────────────────────────────────────────────────────
// Sözdizimi: canlı config (ntp server/prefer/source: 20 cihaz, ntp access-group: 4, clock timezone: 21)
CiscoIOS.ntp = {
    label: 'NTP / Saat',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-clock', title: 'NTP ve Saat Dilimi', desc: 'Zaman senkronu olmadan log korelasyonu, sertifika doğrulaması ve Kerberos/802.1X çalışmaz. En az iki NTP sunucusu ve sabit bir kaynak arayüz önerilir.' },
            sections: [
                {
                    title: 'NTP Sunucuları', icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp1', why: 'Tek sunucu tek arıza noktasıdır; üç sunucu, biri saparsa çoğunluğun doğruyu seçmesini sağlar.', label: 'NTP Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'Birincil zaman kaynağı (prefer eklenir)' },
                        { name: 'ntp2', label: 'NTP Sunucu 2', type: 'text', validate: 'ip', placeholder: '10.0.0.11', hint: 'Yedek sunucu' },
                        { name: 'ntp_src', why: 'Kaynak arayüz sabitlenmezse NTP paketleri çıkış arayüzünün IP\'siyle gider; sunucu tarafındaki erişim listesi bu yüzden reddedebilir.', label: 'Kaynak Arayüz', type: 'text', validate: 'iface', placeholder: 'Loopback0', hint: 'ntp source' },
                        { name: 'ntp_vrf', label: 'VRF', type: 'text', placeholder: 'MGMT', hint: 'Yönetim VRF\'i kullanılıyorsa' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama ve Erişim', icon: 'fas fa-key',
                    fields: [
                        { name: 'ntp_key_id', label: 'Anahtar No', type: 'text', min: 1, max: 65535, placeholder: '1', hint: 'Boş = kimlik doğrulama yok' },
                        { name: 'ntp_key', why: 'Kimlik doğrulamasız NTP sahte zaman sunucusuna açıktır; saat kaydırılarak log ve sertifika kontrolleri atlatılabilir.', label: 'Anahtar (MD5)', type: 'text', requiredIf: { field: 'ntp_auth', checked: true }, placeholder: 'NtpKey123', hint: 'Sunucudakiyle aynı' },
                        { name: 'ntp_auth', label: 'NTP kimlik doğrulamasını etkinleştir', type: 'checkbox' },
                        { name: 'ntp_acl', why: 'serve-only/query-only erişim listeleri, cihazın başkalarına zaman sunmasını veya uzaktan sorgulanmasını sınırlar (NTP amplification saldırılarına karşı).', label: 'Sunmaya izinli ACL', type: 'text', placeholder: '10', hint: 'ntp access-group serve-only — boş = kısıtlama yok' }
                    ]
                },
                {
                    title: 'Saat Dilimi', icon: 'fas fa-globe',
                    fields: [
                        { name: 'tz_name', label: 'Saat Dilimi Adı', type: 'text', placeholder: 'TRT', hint: 'Log\'larda görünen kısaltma (TRT, UTC, CET)' },
                        { name: 'tz_offset', why: 'Türkiye 2016\'dan beri sabit UTC+3\'tür; yaz saati (summer-time) tanımlanmaz.', label: 'UTC Farkı (saat)', type: 'text', min: -12, max: 14, requiredIf: { field: 'tz_set', checked: true }, placeholder: '3', hint: 'Örn: 3, -5' },
                        { name: 'tz_set', label: 'Saat dilimini ayarla (clock timezone)', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'NTP Konfigürasyonu Oluştur'
        }, (data) => {
            const n1 = cgEsc(data.ntp1 || ''), n2 = cgEsc(data.ntp2 || ''), src = cgEsc(data.ntp_src || ''), vrf = cgEsc(data.ntp_vrf || '');
            const kid = cgEsc(data.ntp_key_id || ''), key = cgEsc(data.ntp_key || ''), acl = cgEsc(data.ntp_acl || '');
            const v = vrf ? ' vrf ' + vrf : '';
            const auth = data.ntp_auth && kid && key;
            let c = '! ========================================\n! Cisco IOS — NTP ve Saat\n! ========================================\n\n';
            if (data.tz_set && data.tz_offset !== '') c += 'clock timezone ' + (cgEsc(data.tz_name || '') || 'UTC') + ' ' + cgEsc(data.tz_offset) + ' 0\n';
            if (data.ntp_auth && !auth) c += '! UYARI: kimlik doğrulama seçili ama anahtar no/anahtar eksik — doğrulama satırları yazılmadı.\n';
            if (auth) c += 'ntp authentication-key ' + kid + ' md5 ' + key + '\nntp authenticate\nntp trusted-key ' + kid + '\n';
            if (src) c += 'ntp source ' + src + '\n';
            if (n1) c += 'ntp server' + v + ' ' + n1 + (auth ? ' key ' + kid : '') + ' prefer\n';
            if (n2) c += 'ntp server' + v + ' ' + n2 + (auth ? ' key ' + kid : '') + '\n';
            if (acl) c += 'ntp access-group serve-only ' + acl + '\n';
            c += '\n! Doğrulama:\n! show ntp associations\n! show ntp status\n! show clock detail\n';
            return c;
        });
    }
};

// ── Syslog ────────────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (logging host: 22 cihaz; transport udp port / vrf: 8; buffered: 11; source-interface: 4; service timestamps: 23)
CiscoIOS.logging = {
    label: 'Syslog / Logging',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-file-alt', title: 'Syslog / Logging', desc: 'Olay kayıtlarını merkezi syslog/SIEM sunucusuna gönderir, yerel tamponu ve zaman damgasını ayarlar. Denetim ve olay müdahalesinin temelidir.' },
            sections: [
                {
                    title: 'Syslog Sunucuları', icon: 'fas fa-server',
                    fields: [
                        { name: 'log1', label: 'Syslog Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.20', hint: 'Birincil SIEM/syslog' },
                        { name: 'log2', label: 'Syslog Sunucu 2', type: 'text', validate: 'ip', placeholder: '10.0.0.21', hint: 'Yedek' },
                        { name: 'log_port', why: 'Varsayılan UDP 514\'tür; SIEM farklı portta dinliyorsa buraya yazın.', label: 'UDP Port', type: 'text', validate: 'port', placeholder: '514', hint: 'Boş = varsayılan 514' },
                        { name: 'log_vrf', label: 'VRF', type: 'text', placeholder: 'MGMT', hint: 'Yönetim VRF\'i kullanılıyorsa' },
                        { name: 'log_src', why: 'Kaynak arayüz sabit değilse SIEM aynı cihazı farklı IP\'lerden gelen iki ayrı cihaz sanabilir.', label: 'Kaynak Arayüz', type: 'text', validate: 'iface', placeholder: 'Loopback0', hint: 'logging source-interface' },
                        { name: 'log_trap', label: 'Gönderilecek Seviye', type: 'select', options: [
                            { value: 'informational', label: '6 — informational (önerilen)', selected: true },
                            { value: 'notifications', label: '5 — notifications' },
                            { value: 'warnings', label: '4 — warnings' },
                            { value: 'errors', label: '3 — errors' },
                            { value: 'debugging', label: '7 — debugging (yalnız sorun gidermede)' }
                        ]}
                    ]
                },
                {
                    title: 'Yerel Tampon ve Konsol', icon: 'fas fa-memory',
                    fields: [
                        { name: 'buf_size', why: 'Tampon, sunucuya ulaşılamayan sürede son olayları cihazda tutar; çok küçük olursa arıza anının kayıtları silinir.', label: 'Tampon Boyutu (bayt)', type: 'text', min: 4096, max: 2147483647, placeholder: '64000', hint: 'Boş = tampon ayarı yazılmaz' },
                        { name: 'console_log', label: 'Konsol Loglama', type: 'select', options: [
                            { value: 'off', label: 'Kapalı — no logging console (önerilen)', selected: true },
                            { value: 'warnings', label: 'warnings' },
                            { value: 'informational', label: 'informational' },
                            { value: 'keep', label: 'Değiştirme' }
                        ], hint: 'Yoğun konsol loglaması CPU\'yu yükler' },
                        { name: 'ts', label: 'Zaman damgası: datetime msec (debug ve log için)', type: 'checkbox', checked: true },
                        { name: 'ts_local', label: 'Zaman damgasında yerel saat (localtime)', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'Logging Konfigürasyonu Oluştur'
        }, (data) => {
            const hosts = [data.log1, data.log2].map(x => cgEsc(x || '')).filter(Boolean);
            const port = cgEsc(data.log_port || ''), vrf = cgEsc(data.log_vrf || ''), src = cgEsc(data.log_src || '');
            const buf = cgEsc(data.buf_size || ''), lt = data.ts_local ? ' localtime' : '';
            let c = '! ========================================\n! Cisco IOS — Syslog / Logging\n! ========================================\n\n';
            if (data.ts) c += 'service timestamps debug datetime msec' + lt + '\nservice timestamps log datetime msec' + lt + '\n';
            if (buf) c += 'logging buffered ' + buf + ' informational\n';
            if (data.console_log === 'off') c += 'no logging console\n';
            else if (data.console_log && data.console_log !== 'keep') c += 'logging console ' + cgEsc(data.console_log) + '\n';
            c += 'logging trap ' + cgEsc(data.log_trap || 'informational') + '\n';
            if (src) c += 'logging source-interface ' + src + (vrf ? ' vrf ' + vrf : '') + '\n';
            hosts.forEach(h => { c += 'logging host ' + h + (vrf ? ' vrf ' + vrf : '') + (port ? ' transport udp port ' + port : '') + '\n'; });
            c += '\n! Doğrulama:\n! show logging\n! show logging | include Trap|host\n';
            return c;
        });
    }
};

// ── LLDP / CDP ────────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (lldp run: 17 cihaz; lldp timer/tlv-select); CDP: Cisco IOS Network Management Guide
CiscoIOS.lldp = {
    label: 'LLDP / CDP',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-project-diagram', title: 'LLDP / CDP — Komşu Keşfi', desc: '<strong>LLDP</strong> standart (IEEE 802.1AB), <strong>CDP</strong> Cisco\'ya özeldir. Topoloji keşfi, NMS envanteri ve IP telefon tanıma için kullanılır; güvenilmeyen (internet, misafir) portlarda kapatılmalıdır.' },
            sections: [
                {
                    title: 'Global', icon: 'fas fa-globe',
                    fields: [
                        { name: 'lldp', label: 'LLDP', type: 'select', options: [
                            { value: 'on', label: 'Açık — lldp run', selected: true },
                            { value: 'off', label: 'Kapalı — no lldp run' }
                        ]},
                        { name: 'cdp', why: 'CDP cihaz modeli, IOS sürümü ve yönetim IP\'sini açık metinle yayınlar; saldırgan için hazır keşif bilgisidir.', label: 'CDP', type: 'select', options: [
                            { value: 'keep', label: 'Değiştirme', selected: true },
                            { value: 'on', label: 'Açık — cdp run' },
                            { value: 'off', label: 'Kapalı — no cdp run' }
                        ]},
                        { name: 'lldp_timer', label: 'LLDP Gönderim Aralığı (sn)', type: 'text', min: 5, max: 65534, placeholder: '30', hint: 'Boş = varsayılan 30' },
                        { name: 'lldp_hold', label: 'LLDP Holdtime (sn)', type: 'text', min: 0, max: 65535, placeholder: '120', hint: 'Boş = varsayılan 120' }
                    ]
                },
                {
                    title: 'Güvenilmeyen Portlarda Kapat', icon: 'fas fa-ban',
                    fields: [
                        { name: 'off_ifaces', why: 'İnternet, misafir ve üçüncü taraf portlarında keşif protokolü bilgi sızdırır; bu portlarda kapatılması önerilir.', label: 'Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'GigabitEthernet1/0/48', hint: 'Virgülle liste; boş = dokunma' }
                    ]
                }
            ],
            submit: 'LLDP/CDP Konfigürasyonu Oluştur'
        }, (data) => {
            const t = cgEsc(data.lldp_timer || ''), h = cgEsc(data.lldp_hold || '');
            const offs = cgEsc(data.off_ifaces || '').split(/[,\s]+/).filter(Boolean);
            let c = '! ========================================\n! Cisco IOS — LLDP / CDP\n! ========================================\n\n';
            c += (data.lldp === 'off' ? 'no lldp run' : 'lldp run') + '\n';
            if (data.lldp !== 'off' && t) c += 'lldp timer ' + t + '\n';
            if (data.lldp !== 'off' && h) c += 'lldp holdtime ' + h + '\n';
            if (data.cdp === 'on') c += 'cdp run\n'; else if (data.cdp === 'off') c += 'no cdp run\n';
            offs.forEach(i => {
                c += '!\ninterface ' + i + '\n no lldp transmit\n no lldp receive\n';
                if (data.cdp !== 'off') c += ' no cdp enable\n';
            });
            c += '\n! Doğrulama:\n! show lldp neighbors\n! show cdp neighbors\n';
            return c;
        });
    }
};

// ── Config Archive / Otomatik Yedek ──────────────────────────────────────────
// Sözdizimi: canlı config (archive bloğu 22 cihaz: log config, logging enable, notify syslog contenttype plaintext, hidekeys, path, write-memory)
CiscoIOS.archive = {
    label: 'Config Archive / Yedek',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-archive', title: 'Config Archive — Otomatik Yedek ve Değişiklik Kaydı', desc: 'Her <code>write memory</code>\'de (ve/veya periyodik olarak) konfigürasyonu belirtilen yola kopyalar; <code>log config</code> ile kim hangi komutu girdi syslog\'a yazılır.' },
            sections: [
                {
                    title: 'Yedek Hedefi', icon: 'fas fa-hdd',
                    fields: [
                        { name: 'arch_path', why: 'Yedek cihazın kendi flash\'ında kalırsa cihazla birlikte kaybolur; uzak (scp/tftp) hedef tercih edilmelidir. $h hostname, $t zaman damgası ile değiştirilir.', label: 'Yol', type: 'text', required: true, placeholder: 'flash:archive-$h-$t', hint: 'Örn: scp://kullanici@10.0.0.30/yedek/$h-$t' },
                        { name: 'arch_wm', label: 'Her write memory\'de yedekle (write-memory)', type: 'checkbox', checked: true },
                        { name: 'arch_period', label: 'Periyodik Yedek (dakika)', type: 'text', min: 1, max: 525600, placeholder: '1440', hint: 'Boş = periyodik yedek yok; 1440 = günlük' },
                        { name: 'arch_max', why: 'Yalnız yerel (flash:) hedeflerde geçerlidir; eski kopyaların flash\'ı doldurmasını önler.', label: 'En Fazla Kopya', type: 'text', min: 1, max: 14, placeholder: '14', hint: 'Yalnız flash: yolunda' }
                    ]
                },
                {
                    title: 'Değişiklik Kaydı', icon: 'fas fa-history',
                    fields: [
                        { name: 'log_cfg', label: 'Girilen komutları kaydet (log config / logging enable)', type: 'checkbox', checked: true },
                        { name: 'log_notify', label: 'Komutları syslog\'a gönder (notify syslog contenttype plaintext)', type: 'checkbox', checked: true },
                        { name: 'log_hide', why: 'Parola ve anahtar içeren komutlar kayda ve syslog\'a açık metinle düşmesin.', label: 'Parolaları kayıtta gizle (hidekeys)', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Archive Konfigürasyonu Oluştur'
        }, (data) => {
            const p = cgEsc(data.arch_path || ''), per = cgEsc(data.arch_period || ''), mx = cgEsc(data.arch_max || '');
            let c = '! ========================================\n! Cisco IOS — Config Archive\n! ========================================\n\n';
            c += 'archive\n';
            if (data.log_cfg) {
                c += ' log config\n  logging enable\n';
                if (data.log_notify) c += '  notify syslog contenttype plaintext\n';
                if (data.log_hide) c += '  hidekeys\n';
            }
            c += ' path ' + p + '\n';
            if (mx && /^flash|^bootflash|^disk/i.test(p)) c += ' maximum ' + mx + '\n';
            if (data.arch_wm) c += ' write-memory\n';
            if (per) c += ' time-period ' + per + '\n';
            c += '!\n\n! Doğrulama:\n! show archive\n! show archive log config all\n';
            return c;
        });
    }
};

// ── VTP ───────────────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (vtp mode/domain/version: 15 cihaz)
CiscoIOS.vtp = {
    label: 'VTP',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-share-alt', title: 'VTP — VLAN Trunking Protocol', desc: 'VLAN veritabanını switch\'ler arasında dağıtır. Yanlış mod veya daha yüksek revizyonlu bir switch ağa eklendiğinde <strong>tüm VLAN\'ları silebilir</strong>; çoğu kurumsal ağda <strong>transparent</strong> veya <strong>off</strong> kullanılır.' },
            sections: [
                {
                    title: 'VTP Ayarları', icon: 'fas fa-cog',
                    warn: 'Server/Client modundaki bir switch\'i ağa bağlamadan önce revizyon numarasını sıfırlayın (domain adını geçici değiştirip geri alarak); aksi halde VLAN veritabanı üzerine yazılabilir.',
                    fields: [
                        { name: 'vtp_mode', label: 'Mod', type: 'select', options: [
                            { value: 'transparent', label: 'Transparent — VLAN\'ları yerel tut (önerilen)', selected: true },
                            { value: 'off', label: 'Off — VTP\'yi kapat (VTPv3)' },
                            { value: 'server', label: 'Server' },
                            { value: 'client', label: 'Client' }
                        ]},
                        { name: 'vtp_domain', why: 'Transparent modda bile domain adı eşleşmezse bazı platformlar trunk\'ta DTP pazarlığını reddeder.', label: 'Domain', type: 'text', requiredIf: { field: 'vtp_mode', in: ['server', 'client'] }, placeholder: 'CORP', hint: 'Server/Client için zorunlu' },
                        { name: 'vtp_ver', label: 'Sürüm', type: 'select', options: [
                            { value: '2', label: 'Sürüm 2', selected: true },
                            { value: '3', label: 'Sürüm 3 (primary server, off modu)' },
                            { value: '', label: 'Değiştirme' }
                        ]},
                        { name: 'vtp_pw', label: 'Parola', type: 'text', placeholder: 'VtpPass123', hint: 'Server/Client\'ta yetkisiz güncellemeyi engeller' }
                    ]
                }
            ],
            submit: 'VTP Konfigürasyonu Oluştur'
        }, (data) => {
            const m = cgEsc(data.vtp_mode || 'transparent'), d = cgEsc(data.vtp_domain || ''), v = cgEsc(data.vtp_ver || ''), pw = cgEsc(data.vtp_pw || '');
            let c = '! ========================================\n! Cisco IOS — VTP\n! ========================================\n\n';
            if (m === 'off' && v !== '3') c += '! UYARI: VTP off modu yalnız VTP sürüm 3\'te vardır.\n';
            if (v) c += 'vtp version ' + v + '\n';
            if (d) c += 'vtp domain ' + d + '\n';
            c += 'vtp mode ' + m + '\n';
            if (pw) c += 'vtp password ' + pw + '\n';
            c += '\n! Doğrulama:\n! show vtp status\n! show vtp password\n';
            return c;
        });
    }
};

// ── Cihaz Sertleştirme ───────────────────────────────────────────────────────
// Sözdizimi: canlı config (service timestamps/login on-success log/no ip http: 23 cihaz; login block-for: 19;
// no ip domain lookup: 15; no service pad: 6; ip scp server enable: 3; ip http authentication local: 14)
CiscoIOS.hardening = {
    label: 'Cihaz Sertleştirme',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-user-shield', title: 'Cihaz Sertleştirme — Temel Ayarlar', desc: 'Sahadaki cihazların neredeyse tamamında bulunan tek satırlık güvenlik ve işletim ayarları: gereksiz servisleri kapatma, giriş denemelerini sınırlama ve kaydetme, zaman damgası.' },
            sections: [
                {
                    title: 'Servisler', icon: 'fas fa-power-off',
                    fields: [
                        { name: 'no_http', why: 'Kullanılmayan web yönetim arayüzü saldırı yüzeyidir; IOS HTTP sunucusunda geçmişte kritik açıklar çıkmıştır.', label: 'HTTP/HTTPS yönetim sunucusu', type: 'select', options: [
                            { value: 'off', label: 'Kapat (no ip http server / secure-server)', selected: true },
                            { value: 'https', label: 'Yalnız HTTPS, yerel kimlik doğrulama' },
                            { value: 'keep', label: 'Değiştirme' }
                        ]},
                        { name: 'no_pad', label: 'no service pad (X.25 PAD kapat)', type: 'checkbox', checked: true },
                        { name: 'no_lookup', why: 'Yanlış yazılan komut DNS adı sanılır ve konsol saniyelerce kilitlenir.', label: 'no ip domain lookup', type: 'checkbox', checked: true },
                        { name: 'keepalive', why: 'Yarım kalan (koparılmış) vty oturumlarını temizler; oturum limitinin dolmasını önler.', label: 'service tcp-keepalives-in / out', type: 'checkbox', checked: true },
                        { name: 'pw_enc', label: 'service password-encryption', type: 'checkbox', checked: true },
                        { name: 'scp', label: 'ip scp server enable (SCP ile dosya aktarımı)', type: 'checkbox' }
                    ]
                },
                {
                    title: 'Giriş Güvenliği', icon: 'fas fa-sign-in-alt',
                    fields: [
                        { name: 'blk_sec', why: 'Belirtilen süre içinde çok sayıda hatalı girişte cihaz tüm girişleri geçici olarak engeller (kaba kuvvet koruması).', label: 'Engelleme Süresi (sn)', type: 'text', min: 1, max: 65535, placeholder: '120', hint: 'login block-for — boş = yazılmaz' },
                        { name: 'blk_try', label: 'Deneme Sayısı', type: 'text', min: 1, max: 65535, requiredIf: { field: 'blk_on', checked: true }, placeholder: '5', hint: 'attempts' },
                        { name: 'blk_win', label: 'Pencere (sn)', type: 'text', min: 1, max: 65535, requiredIf: { field: 'blk_on', checked: true }, placeholder: '60', hint: 'within' },
                        { name: 'blk_on', label: 'Kaba kuvvet korumasını etkinleştir (login block-for)', type: 'checkbox', checked: true },
                        { name: 'log_ok', label: 'Başarılı girişleri logla (login on-success log)', type: 'checkbox', checked: true },
                        { name: 'log_fail', label: 'Başarısız girişleri logla (login on-failure log)', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Zaman Damgası', icon: 'fas fa-stopwatch',
                    fields: [
                        { name: 'ts', label: 'service timestamps debug/log datetime msec', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Sertleştirme Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS — Cihaz Sertleştirme\n! ========================================\n\n';
            if (data.ts) c += 'service timestamps debug datetime msec\nservice timestamps log datetime msec\n';
            if (data.pw_enc) c += 'service password-encryption\n';
            if (data.keepalive) c += 'service tcp-keepalives-in\nservice tcp-keepalives-out\n';
            if (data.no_pad) c += 'no service pad\n';
            if (data.no_lookup) c += 'no ip domain lookup\n';
            if (data.no_http === 'off') c += 'no ip http server\nno ip http secure-server\n';
            else if (data.no_http === 'https') c += 'no ip http server\nip http secure-server\nip http authentication local\n';
            if (data.scp) c += 'ip scp server enable\n';
            const bs = cgEsc(data.blk_sec || ''), bt = cgEsc(data.blk_try || ''), bw = cgEsc(data.blk_win || '');
            if (data.blk_on && bs && bt && bw) c += 'login block-for ' + bs + ' attempts ' + bt + ' within ' + bw + '\n';
            else if (data.blk_on) c += '! UYARI: login block-for için süre, deneme ve pencere değerlerinin üçü de gerekli — satır yazılmadı.\n';
            if (data.log_ok) c += 'login on-success log\n';
            if (data.log_fail) c += 'login on-failure log\n';
            c += '\n! Doğrulama:\n! show login\n! show ip http server status\n! show running-config | include service|login\n';
            return c;
        });
    }
};
