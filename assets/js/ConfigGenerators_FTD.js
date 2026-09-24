'use strict';

const CiscoFTD = {};

// ── Cisco FTD: Bootstrap ──────────────────────────────────────────────────────
CiscoFTD.bootstrap = {
    label: 'FTD Bootstrap',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-rocket',
                title: 'FTD Bootstrap',
                desc: 'FTD Bootstrap — ilk kurulum: management IP, hostname, DNS, NTP ve FMC kayıt konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Temel Kimlik',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'hostname', why: "Hostname, FMC üzerindeki cihaz listesinde ve tüm loglarda görünür. Birden çok FTD aynı adla kaydedilirse olay korelasyonu imkansızlaşır ve yanlış cihaza deploy riski doğar.", label: 'Hostname', type: 'text', required: true, placeholder: 'FTD-PRIMARY', hint: 'Cihaz hostname değeri' }
                    ]
                },
                {
                    title: 'Management Arayüzü',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'mgmt_ip', why: "Management arayüzü veri arayüzlerinden tamamen ayrıdır ve FTD’nin FMC’ye ulaştığı tek yoldur. Bu adres yanlışsa cihaz kaydolamaz; kayıttan sonra değiştirmek FMC ile bağı koparır.", label: 'Management IP (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.45.45/24', hint: 'Management0/0 IP adresi ve prefix (CIDR)' },
                        { name: 'mgmt_gw', why: "Yönetim ağı gateway’i yanlışsa FTD, FMC’ye <b>hiç</b> ulaşamaz ve <code>configure manager add</code> sessizce beklemede kalır. Aynı L2 segmentteyse gateway olarak <code>data-interfaces</code> değil gerçek router girilmelidir.", label: 'Management Gateway', type: 'text', required: true, validate: 'ip', placeholder: '192.168.45.1', hint: 'Management ağı default gateway' }
                    ]
                },
                {
                    title: 'DNS ve NTP',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'dns', why: "DNS çözülmezse FMC’ye FQDN ile kayıt, lisans sunucusuna (Smart Licensing) erişim ve URL filtreleme güncellemeleri başarısız olur. Cihaz çalışır görünür ama lisansı süresi dolmuş sayılır.", label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'DNS çözümleme için sunucu IP' },
                        { name: 'ntp', why: "Saat kayması sertifika doğrulamasını ve FMC ile SSL tünelini bozar; kayıt <b>başarısız</b> olur. Ayrıca olay zaman damgaları kayarsa adli inceleme güvenilirliğini kaybeder.", label: 'NTP Server', type: 'text', optional: true, placeholder: 'pool.ntp.org', hint: 'Zaman senkronizasyonu için NTP sunucusu' }
                    ]
                },
                {
                    title: 'FMC Kayıt',
                    icon: 'fas fa-link',
                    info: 'FMC tarafında Device > Add Device adımı ile kaydı tamamlayın. Registration key her iki tarafta eşleşmeli.',
                    fields: [
                        { name: 'fmc_ip', why: "FTD ile FMC arasındaki sftunnel <b>TCP/8305</b> üzerinden kurulur; arada firewall varsa bu port açılmalıdır. Yanlış IP girildiğinde kayıt komutu hata vermez, sadece hiç tamamlanmaz.", label: 'FMC IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.10', hint: 'Firepower Management Center IP adresi' },
                        { name: 'reg_key', why: "Kayıt anahtarı FMC tarafında da birebir aynı girilmelidir; uyuşmazlıkta cihaz FMC listesinde <b>pending</b> durumunda takılı kalır. Tek kullanımlıktır, tekrar kayıt için yeniden girilmelidir.", label: 'Registration Key', type: 'text', required: true, placeholder: 'cisco123', hint: 'FMC ile eşleşecek kayıt anahtarı' },
                        { name: 'nat_id', why: "FTD veya FMC NAT arkasındaysa NAT-ID zorunludur ve iki tarafta aynı olmalıdır. Eksik NAT-ID, kaydın hiçbir hata mesajı vermeden sonsuza kadar beklemesine yol açar.", label: 'NAT ID', type: 'text', optional: true, placeholder: '1234', hint: 'NAT arkasındaysa gerekli; FMC\'de de aynı değer girilmeli' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdBootGen(data);
        });
    }
};
function cgFtdBootGen(data) {
    const hostname = cgEsc(data.hostname || ''), mgmtIp = cgEsc(data.mgmt_ip || '');
    const mgmtGw = cgEsc(data.mgmt_gw || ''), dns = cgEsc(data.dns || '');
    const ntp = cgEsc(data.ntp || ''), fmcIp = cgEsc(data.fmc_ip || '');
    const regKey = cgEsc(data.reg_key || ''), natId = cgEsc(data.nat_id || '');
    const ipParts = mgmtIp.split('/');
    const ip = ipParts[0], prefix = ipParts[1] || '24';
    let c = '# ========================================\n# Cisco FTD — Bootstrap / Initial Setup\n# ========================================\n';
    c += '# Bu komutlar FTD CLI (setup wizard) veya FXOS chassis manager üzerinde çalıştırılır.\n\n';
    c += '> configure network ipv4 manual ' + ip + ' ' + prefix + ' ' + mgmtGw + '\n';
    c += '> configure network dns servers ' + dns + '\n';
    if (ntp) c += '> configure network ntp servers ' + ntp + '\n';
    c += '> configure hostname ' + hostname + '\n\n';
    c += '# FMC Registration\n';
    c += '> configure manager add ' + fmcIp + ' ' + regKey;
    if (natId) c += ' ' + natId;
    c += '\n\n';
    c += '# FMC tarafında Device > Add Device ile tamamla\n';
    c += '# Registration key ve NAT ID FMC\'de de aynı olmalı\n\n';
    c += '# Doğrulama:\n# > show managers\n# > show network\n# > show version\n';
    return c;
}

// ── Cisco FTD: Interface ──────────────────────────────────────────────────────
CiscoFTD.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'FTD Interface',
                desc: 'FTD Interface — fiziksel/logical interface, güvenlik zone atama ve IPv4/IPv6 adresi.'
            },
            sections: [
                {
                    title: 'Interface Tanımı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'iface_name', why: "Fiziksel arayüz adı yanlışsa yapılandırma başka bir porta uygulanır. FTD’de veri arayüzleri yalnızca FMC üzerinden yönetilmelidir; CLI’dan yapılan değişiklikler bir sonraki <b>deploy</b> ile ezilir.", label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Fiziksel interface adı (ör: GigabitEthernet0/0)' },
                        { name: 'nameif', why: "Mantıksal ad atanmadan arayüz trafiği geçirmez. FTD’de asıl kural eşleşmesi <b>security zone</b> üzerinden yapılır; nameif tek başına ACP kurallarında kullanılamaz.", label: 'Logical Name (nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'Mantıksal interface adı' },
                        { name: 'mode', why: "Routed ve transparent mod arasındaki geçiş cihazı yeniden başlatır ve mevcut yapılandırmanın büyük kısmını siler. Modu baştan doğru seçmek sonradan dönüşten çok daha ucuzdur.", label: 'Mode', type: 'select', options: [
                            { value: 'routed', label: 'routed', selected: true },
                            { value: 'passive', label: 'passive' }
                        ], hint: 'Interface çalışma modu' }
                    ]
                },
                {
                    title: 'IP Adresi',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'ip', why: "Arayüz IP’si yanlışsa komşu cihazlar bu FTD’yi göremez. Değişiklik FMC’de yapılıp <b>deploy</b> edilmedikçe cihazda hiçbir etkisi olmaz.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Interface IPv4 adresi' },
                        { name: 'mask', why: "Maske hatası, arayüzün doğrudan bağlı ağı yanlış hesaplamasına ve statik route’ların invalid kalmasına yol açar.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.252', hint: 'Subnet maskesi' },
                        { name: 'mtu', why: "VPN veya VXLAN gibi kapsülleme varsa 1500 MTU fragmentasyona ve performans kaybına neden olur. MTU’yu bir tarafta düşürüp diğerinde bırakmak ise büyük paketlerin sessizce kaybolmasına yol açar.", label: 'MTU', type: 'text', optional: true, placeholder: '1500', hint: 'Maximum Transmission Unit (default: 1500)' }
                    ]
                },
                {
                    title: 'Security Zone',
                    icon: 'fas fa-shield-alt',
                    info: 'Security Zone ataması FMC arayüzünde Devices > Device Management > Interfaces > Edit adımından yapılır.',
                    fields: [
                        { name: 'sec_zone', why: "FTD’de Access Control kuralları arayüz değil <b>security zone</b> üzerinden eşleşir. Arayüz bir zone’a atanmazsa onu kullanan hiçbir ACP kuralı çalışmaz ve trafik default action’a düşer.", label: 'Security Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'FMC\'de tanımlı security zone adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdIfaceGen(data);
        });
    }
};
function cgFtdIfaceGen(data) {
    const ifaceName = cgEsc(data.iface_name || ''), nameif = cgEsc(data.nameif || '');
    const ip = cgEsc(data.ip || ''), mask = cgEsc(data.mask || '');
    const secZone = cgEsc(data.sec_zone || ''), mode = cgEsc(data.mode || 'routed'), mtu = cgEsc(data.mtu || '');
    let c = '# ========================================\n# Cisco FTD — Interface Configuration\n# ========================================\n';
    c += '# FTD CLI (clish) — interface yapılandırması FMC veya clish üzerinden uygulanır.\n\n';
    c += '> configure interface ' + ifaceName + '\n';
    c += '>   nameif ' + nameif + '\n';
    c += '>   ip address ' + ip + ' ' + mask + '\n';
    c += '>   mode ' + mode + '\n';
    if (mtu) c += '>   mtu ' + mtu + '\n';
    c += '>   no shutdown\n\n';
    c += '# FMC\'de Security Zone atama:\n';
    c += '# Devices > Device Management > Interfaces > Edit > Security Zone: ' + secZone + '\n\n';
    c += '# Doğrulama:\n# > show interface ' + ifaceName + '\n# > show interface ip brief\n# > show nameif\n';
    return c;
}

// ── Cisco FTD: NAT ───────────────────────────────────────────────────────────
CiscoFTD.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'FTD NAT',
                desc: 'FTD NAT — FMC REST API ile Auto-NAT (object NAT) ve Manual-NAT policy kuralları.'
            },
            configTypes: [
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: 'Birebir statik adres dönüşümü', badge: { text: 'Statik', cls: 'common' } },
                { id: 'dynamic', label: 'Dynamic NAT / PAT', icon: 'fas fa-random', desc: 'Dinamik adres/port dönüşümü (PAT)', badge: { text: 'En Yaygın', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'NAT Nesne Tanımı',
                    icon: 'fas fa-cube',
                    fields: [
                        { name: 'real_obj', why: "Nesne FMC’de önceden tanımlı olmalıdır; kural içinde ad uyuşmazlığı deploy sırasında hata verir. Nesneyi değiştirmek onu kullanan tüm kuralları aynı anda etkiler.", label: 'Kaynak Nesne Adı', type: 'text', required: true, placeholder: 'OBJ_INTERNAL_NET', hint: 'FMC\'de tanımlanacak network nesnesi adı' },
                        { name: 'real_ip', why: "Gerçek (NAT öncesi) adres; FTD’de Access Control kuralları da NAT öncesi <b>gerçek</b> IP ile yazılır. Mapped adres kullanmak kuralın hiç eşleşmemesine yol açar.", label: 'Real IP/Network', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Orijinal iç ağ adresi (CIDR)' },
                        { name: 'mapped_ip', why: "Dışarıya görünen adres; bu IP outside subnetinde değilse ISP tarafından route edilmeli ya da proxy-ARP ayarı kontrol edilmelidir. Aksi halde NAT tanımlı görünür ama trafik hiç gelmez.", label: 'Mapped IP (NAT sonrası)', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.10', hint: 'Dışarıya görünen IP adresi' }
                    ]
                },
                {
                    title: 'Zone Seçimi',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'src_zone', why: "NAT kuralı yalnızca bu zone çiftinde geçerlidir; zone yanlış seçilirse kural listede görünür ama hiç hit almaz. FMC’de <b>Manual NAT</b> kuralları Auto NAT’tan önce değerlendirilir.", label: 'Source Zone', type: 'text', required: true, placeholder: 'INSIDE_ZONE', hint: 'Kaynak güvenlik bölgesi' },
                        { name: 'dst_zone', why: "Hedef zone yanlışsa NAT hiç tetiklenmez. Çıkış arayüzünün zone’u ile route tablosunun gösterdiği arayüz aynı olmalıdır, yoksa kural atlanır.", label: 'Destination Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'Hedef güvenlik bölgesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdNatGen(data);
        });
    }
};
function cgFtdNatGen(data) {
    const natType = cgEsc(data._cgtype || 'static'), realObj = cgEsc(data.real_obj || '');
    const realIp = cgEsc(data.real_ip || ''), mappedIp = cgEsc(data.mapped_ip || '');
    const srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    let c = '# ========================================\n# Cisco FTD — NAT Rule\n# ========================================\n';
    c += '# FMC: Devices > NAT > Add Rule\n\n';
    c += '# Object: ' + realObj + ' (' + realIp + ')\n';
    c += '# NAT Type: ' + (natType === 'static' ? 'Static NAT' : 'Dynamic NAT/PAT') + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Objects > Network > Add Network Object\n';
    c += '#    Name: ' + realObj + ', Value: ' + realIp + '\n';
    c += '# 2. Devices > NAT > Add Auto NAT Rule\n';
    c += '#    Type: ' + natType + '\n';
    c += '#    Source Zone: ' + srcZone + '\n';
    c += '#    Destination Zone: ' + dstZone + '\n';
    c += '#    Original Network: ' + realObj + '\n';
    if (natType === 'static') {
        c += '#    Translated IP: ' + mappedIp + '\n';
    } else {
        c += '#    Translated Address: Interface (PAT) or ' + mappedIp + '\n';
    }
    c += '\n# Doğrulama:\n# > show nat\n# > show nat detail\n# > show conn\n';
    return c;
}

// ── Cisco FTD: Access Control Policy ─────────────────────────────────────────
CiscoFTD.accessControl = {
    label: 'Access Control Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'FTD ACP',
                desc: 'FTD ACP — Access Control Policy kuralları: kaynak/hedef zone, ağ, port ve aksiyon (allow/block/monitor).'
            },
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-folder',
                    fields: [
                        { name: 'pol_name', why: "ACP adı, cihazlara atanırken kullanılır; yanlış politikayı yanlış cihaza atamak tüm trafik kurallarını bir anda değiştirir. Bir cihaza aynı anda yalnızca bir ACP atanabilir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_ACP', hint: 'Access Control Policy için isim' },
                        { name: 'default_action', why: "Default action, hiçbir kurala uymayan trafiğin kaderidir; <b>Block</b> güvenli ama yanlış yazılmış kurallarda tüm trafiği keser. <b>Trust</b> seçmek ise denetimsiz geçiş demektir.", label: 'Default Action', type: 'select', options: [
                            { value: 'Block', label: 'Block', selected: true },
                            { value: 'Allow', label: 'Allow' },
                            { value: 'Trust', label: 'Trust' }
                        ], hint: 'Eşleşmeyen trafik için varsayılan işlem' }
                    ]
                },
                {
                    title: 'Erişim Kuralı',
                    icon: 'fas fa-list-alt',
                    fields: [
                        { name: 'rule_name', why: "Kural adı olay loglarında görünür; anlamsız isimler olay incelemesini imkansız kılar. Kural adları FMC içinde benzersiz olmalıdır.", label: 'Kural Adı', type: 'text', required: true, placeholder: 'ALLOW_INTERNAL_TO_INET', hint: 'Erişim kuralı için açıklayıcı isim' },
                        { name: 'rule_action', why: "<b>Trust</b> seçilen trafik IPS ve dosya denetiminden tamamen muaf olur — Allow ile arasındaki bu fark sık karıştırılır. <b>Monitor</b> ise trafiği durdurmaz, yalnızca loglar ve alttaki kurallara devam eder.", label: 'Kural Aksiyonu', type: 'select', options: [
                            { value: 'Allow', label: 'Allow', selected: true },
                            { value: 'Block', label: 'Block' },
                            { value: 'Trust', label: 'Trust' }
                        ], hint: 'Eşleşen trafiğe uygulanacak işlem' },
                        { name: 'src_zone', why: "ACP kuralı bu kaynak zone ile eşleşir; boş bırakmak kuralı <b>tüm</b> zone’lara uygular ve beklenenden çok daha geniş bir izin oluşturur.", label: 'Source Zone', type: 'text', required: true, placeholder: 'INSIDE_ZONE', hint: 'Kaynak güvenlik bölgesi' },
                        { name: 'dst_zone', why: "Hedef zone boş bırakılan bir ACP kuralı beklenenden fazla trafiği kapsar. Kural sırası da kritiktir: üstteki bir kural eşleşirse alttakiler hiç değerlendirilmez.", label: 'Destination Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'Hedef güvenlik bölgesi' }
                    ]
                },
                {
                    title: 'Inspection Politikaları',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'ips_policy', why: "IPS politikası ACP kuralına bağlanmazsa Snort denetimi devreye girmez. Ayrıca IPS yalnızca <b>Allow</b> aksiyonlu kurallarda çalışır; Trust veya Block kurallarında hiç çalışmaz.", label: 'IPS Policy', type: 'text', optional: true, placeholder: 'Balanced_Security_Connectivity', hint: 'Intrusion Prevention System politikası' },
                        { name: 'file_policy', why: "Dosya/malware politikası yalnızca Allow kurallarında uygulanır ve şifreli trafikte SSL decryption olmadan hiçbir dosyayı göremez. Ek denetim gecikme ve CPU maliyeti getirir.", label: 'File Policy', type: 'text', optional: true, placeholder: 'Block_Malware', hint: 'Dosya analizi/kötücül yazılım engelleme' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdAcpGen(data);
        });
    }
};
function cgFtdAcpGen(data) {
    const polName = cgEsc(data.pol_name || ''), defaultAction = cgEsc(data.default_action || 'Block');
    const ruleName = cgEsc(data.rule_name || ''), ruleAction = cgEsc(data.rule_action || 'Allow');
    const srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    const ipsPolicy = cgEsc(data.ips_policy || ''), filePolicy = cgEsc(data.file_policy || '');
    let c = '# ========================================\n# Cisco FTD — Access Control Policy\n# ========================================\n';
    c += '# FMC: Policies > Access Control > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Default Action: ' + defaultAction + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Policies > Access Control > Add Policy\n';
    c += '#    Name: ' + polName + '\n';
    c += '#    Default Action: ' + defaultAction + '\n\n';
    c += '# 2. Add Rule: ' + ruleName + '\n';
    c += '#    Action: ' + ruleAction + '\n';
    c += '#    Source Zones: ' + srcZone + '\n';
    c += '#    Destination Zones: ' + dstZone + '\n';
    if (ipsPolicy) c += '#    Inspection > IPS Policy: ' + ipsPolicy + '\n';
    if (filePolicy) c += '#    Inspection > File Policy: ' + filePolicy + '\n';
    c += '\n# 3. Policy\'yi cihaza deploy et:\n';
    c += '#    Deploy > Deploy Policies > Select Device > Deploy\n\n';
    c += '# Doğrulama:\n# > show access-list\n# Analysis > Connections > Events\n';
    return c;
}

// ── Cisco FTD: Intrusion Policy ───────────────────────────────────────────────
CiscoFTD.intrusionPolicy = {
    label: 'Intrusion Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'FTD IPS',
                desc: 'FTD IPS — Intrusion Prevention Policy ve Snort kural grubu seçimi (Security over Connectivity / Balanced).'
            },
            sections: [
                {
                    title: 'IPS Policy Tanımı',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'pol_name', why: "Intrusion policy adı ACP kuralları içinde referans verilir; politikayı ACP kuralına bağlamadığınız sürece IPS denetimi <b>hiç</b> çalışmaz.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_IPS', hint: 'Intrusion policy için isim' },
                        { name: 'base_policy', why: "Base policy kural setinin sıkılığını belirler; <b>Security over Connectivity</b> daha çok yakalar ama false positive ile meşru trafiği de düşürebilir. Değişiklikten sonra bir süre pasif izlemek gerekir.", label: 'Base Policy', type: 'select', options: [
                            { value: 'Balanced Security and Connectivity', label: 'Balanced Security and Connectivity', selected: true },
                            { value: 'Security over Connectivity', label: 'Security over Connectivity' },
                            { value: 'Connectivity over Security', label: 'Connectivity over Security' },
                            { value: 'Maximum Detection', label: 'Maximum Detection' }
                        ], hint: 'Snort kural seti için temel profil' },
                        { name: 'inline_mode', why: "Inline (drop) kapalıyken IPS yalnızca uyarı üretir, hiçbir paketi engellemez — <b>IPS çalışmıyor</b> şikayetlerinin en yaygın nedeni budur. Açmadan önce false positive oranını ölçün.", label: 'Inline Mode (Drop Rules)', type: 'select', options: [
                            { value: 'yes', label: 'Evet (Drop Rules Aktif)', selected: true },
                            { value: 'no', label: 'Hayır (Detection Only)' }
                        ], hint: 'Inline modda saldırılar drop edilir; detection-only modda sadece alert üretilir' },
                        { name: 'var_set', why: "HOME_NET yanlış tanımlıysa Snort saldırı yönünü ters okur ve kritik imzalar hiç tetiklenmez. Varsayılan set çoğu ortamda iç ağınızı doğru tanımlamaz, özelleştirin.", label: 'Variable Set', type: 'text', required: true, placeholder: 'Default-Set', hint: 'HOME_NET ve EXTERNAL_NET tanımlı variable set' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdIpsGen(data);
        });
    }
};
function cgFtdIpsGen(data) {
    const polName = cgEsc(data.pol_name || ''), basePolicy = cgEsc(data.base_policy || '');
    const inlineMode = cgEsc(data.inline_mode || 'yes'), varSet = cgEsc(data.var_set || '');
    let c = '# ========================================\n# Cisco FTD — Intrusion Policy\n# ========================================\n';
    c += '# FMC: Policies > Intrusion > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Base Policy: ' + basePolicy + '\n';
    c += '# Mode: ' + (inlineMode === 'yes' ? 'Inline (Drop aktif)' : 'Passive/Detection Only') + '\n';
    c += '# Variable Set: ' + varSet + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Policies > Intrusion > Create Policy\n';
    c += '#    Name: ' + polName + '\n';
    c += '#    Base Policy: ' + basePolicy + '\n';
    c += '# 2. Policy Variables > Variable Set: ' + varSet + '\n';
    if (inlineMode === 'yes') {
        c += '# 3. Drop when Inline: Enabled\n';
        c += '# 4. Rules > Action: Drop for high-severity\n';
    } else {
        c += '# 3. Drop when Inline: Disabled (Alert only)\n';
    }
    c += '\n# ACP\'ye Ekle:\n';
    c += '# Access Control Rule > Inspection > IPS Policy: ' + polName + '\n\n';
    c += '# Doğrulama:\n# Analysis > Intrusions > Events\n# > show snort statistics\n';
    return c;
}

// ── Cisco FTD: SSL Policy ─────────────────────────────────────────────────────
CiscoFTD.sslPolicy = {
    label: 'SSL Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-certificate',
                title: 'FTD SSL',
                desc: 'FTD SSL — SSL/TLS inspection: decrypt-resign, decrypt-known-key veya do-not-decrypt aksiyon politikası.'
            },
            sections: [
                {
                    title: 'SSL Policy Tanımı',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'pol_name', why: "SSL policy ACP’ye bağlanmadıkça şifreli trafik denetlenmez. Politikayı oluşturmak tek başına yeterli değildir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_SSL_INSPECT', hint: 'SSL inspection policy için isim' },
                        { name: 'default_action', why: "SSL politikasında varsayılan <b>Do Not Decrypt</b> olmalıdır; agresif bir varsayılan, sertifika pinning kullanan uygulamaların (bankacılık, mobil) tamamen kırılmasına yol açar.", label: 'Default Action', type: 'select', options: [
                            { value: 'Do not decrypt', label: 'Do not decrypt', selected: true },
                            { value: 'Decrypt - Resign', label: 'Decrypt - Resign' },
                            { value: 'Block', label: 'Block' }
                        ], hint: 'Eşleşmeyen SSL trafik için varsayılan işlem' }
                    ]
                },
                {
                    title: 'Sertifika Ayarları',
                    icon: 'fas fa-certificate',
                    fields: [
                        { name: 'ca_cert', why: "Decrypt-Resign için kullanılan CA, tüm istemci cihazlarda <b>güvenilir</b> olarak yüklü olmalıdır; değilse kullanıcılar her sitede sertifika uyarısı alır. Bu CA’nın özel anahtarı ele geçerse tüm trafik okunabilir hale gelir.", label: 'CA Sertifikası (Re-Sign)', type: 'text', required: true, placeholder: 'CORP_CA', hint: 'Decrypt-Resign için kullanılacak dahili CA sertifikası adı' },
                        { name: 'exempt_cats', why: "Bankacılık ve sağlık gibi kategorilerin şifresini çözmek çoğu ülkede yasal risk taşır; ayrıca sertifika pinning yapan uygulamalar decrypt edildiğinde tamamen çalışmaz. Muafiyet listesi hem uyumluluk hem işlevsellik için gereklidir.", label: 'Muaf Kategoriler', type: 'text', optional: true, placeholder: 'Financial,Health,Government', hint: 'Şifre çözülmeyecek URL kategorileri (virgülle ayrılmış)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdSslPolGen(data);
        });
    }
};
function cgFtdSslPolGen(data) {
    const polName = cgEsc(data.pol_name || ''), defaultAction = cgEsc(data.default_action || 'Do not decrypt');
    const caCert = cgEsc(data.ca_cert || '');
    const exemptCats = cgEsc(data.exempt_cats || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '# ========================================\n# Cisco FTD — SSL Policy\n# ========================================\n';
    c += '# FMC: Policies > SSL > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Default Action: ' + defaultAction + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Objects > PKI > Internal CAs > Import: ' + caCert + '\n';
    c += '# 2. Policies > SSL > Add Policy: ' + polName + '\n';
    c += '#    Default Action: ' + defaultAction + '\n';
    if (defaultAction === 'Decrypt - Resign') {
        c += '#    Re-sign Certificate: ' + caCert + '\n';
    }
    if (exemptCats.length) {
        c += '# 3. Add Rules — Do Not Decrypt (Category):\n';
        exemptCats.forEach(cat => {
            c += '#    Category: ' + cat + ' > Do not decrypt\n';
        });
    }
    c += '\n# ACP\'ye Ekle:\n# Access Control Policy > SSL Policy: ' + polName + '\n\n';
    c += '# Doğrulama:\n# Analysis > Connections > Events > SSL Status\n# > show ssl errors\n';
    return c;
}

// ── Cisco FTD: Site-to-Site VPN ───────────────────────────────────────────────
CiscoFTD.siteToSiteVpn = {
    label: 'Site-to-Site VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'FTD Site-to-Site VPN',
                desc: 'FTD Site-to-Site VPN — IKEv2 ile şifreli tünel. Endpoint, PSK/sertifika ve şifreleme politikası.'
            },
            sections: [
                {
                    title: 'Topoloji Bilgileri',
                    icon: 'fas fa-project-diagram',
                    fields: [
                        { name: 'topo_name', why: "Topoloji adı FMC içinde benzersiz olmalı; yanlış topolojiyi düzenlemek çalışan bir tüneli anında düşürebilir.", label: 'Topology Adı', type: 'text', required: true, placeholder: 'HQ_TO_BRANCH', hint: 'VPN topolojisi için isim' },
                        { name: 'ike_ver', why: "IKEv2 daha güvenli ve daha hızlı yeniden anahtarlama sağlar, ancak karşı uç yalnızca IKEv1 destekliyorsa tünel hiç kurulmaz. Versiyon iki tarafta aynı olmalıdır.", label: 'IKE Versiyonu', type: 'select', options: [
                            { value: 'IKEv2', label: 'IKEv2', selected: true },
                            { value: 'IKEv1', label: 'IKEv1' }
                        ], hint: 'IKEv2 önerilir (daha güvenli ve verimli)' }
                    ]
                },
                {
                    title: 'Endpoint Bilgileri',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'local_ep', why: "Yerel endpoint, FTD’nin dış arayüz IP’si olmalıdır. FTD NAT arkasındaysa karşı taraf gerçek dış IP’yi görecektir; bu durumda NAT-T ve UDP/4500 açık olmalıdır.", label: 'Local Endpoint (FTD Outside IP)', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.1', hint: 'Bu FTD cihazının dış IP adresi' },
                        { name: 'remote_ep', why: "Peer IP yanlışsa IKE hiç başlamaz ve FMC olay günlüğünde yalnızca timeout görünür. Dinamik IP’li uçlar için peer IP yerine dinamik topoloji tipi seçilmelidir.", label: 'Remote Endpoint (Peer IP)', type: 'text', required: true, validate: 'ip', placeholder: '198.51.100.1', hint: 'Uzak VPN peer IP adresi' },
                        { name: 'local_net', why: "Yerel ve uzak ağlar iki tarafta <b>ayna</b> tanımlanmalıdır; uyuşmazlık Phase-2’yi düşürür. Ayrıca bu trafiğin NAT’lanmaması için NAT exemption kuralı gerekir.", label: 'Local Network', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel korunan ağ (CIDR)' },
                        { name: 'remote_net', why: "Uzak ağ karşı tarafın yerel ağıyla birebir aynı maskede olmalıdır. Örtüşen (overlapping) ağlarda ayrıca çift NAT gerekir, aksi halde trafik yanlış yöne gider.", label: 'Remote Network', type: 'text', validate: 'cidr', required: true, placeholder: '10.10.0.0/24', hint: 'Uzak korunan ağ (CIDR)' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'psk', why: "PSK iki tarafta aynı olmalı; fark Phase-1’in tamamlanmamasına neden olur. FMC’de PSK’yi değiştirmek <b>deploy</b> edilene kadar cihazda etkili olmaz ve tünel eski anahtarla çalışmaya devam eder.", label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'VpnKey123!', hint: 'IKE kimlik doğrulama için paylaşılan gizli anahtar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdS2sVpnGen(data);
        });
    }
};
function cgFtdS2sVpnGen(data) {
    const topoName = cgEsc(data.topo_name || ''), ikeVer = cgEsc(data.ike_ver || 'IKEv2');
    const localEp = cgEsc(data.local_ep || ''), remoteEp = cgEsc(data.remote_ep || '');
    const localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
    const psk = cgEsc(data.psk || '');
    let c = '# ========================================\n# Cisco FTD — Site-to-Site VPN\n# ========================================\n';
    c += '# FMC: Devices > VPN > Site To Site\n\n';
    c += '# Topology: ' + topoName + '\n';
    c += '# IKE Version: ' + ikeVer + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Devices > VPN > Site To Site > Add Topology\n';
    c += '#    Name: ' + topoName + '\n';
    c += '#    Type: Point to Point\n';
    c += '#    IKE Version: ' + ikeVer + '\n\n';
    c += '# 2. Node A (Local FTD):\n';
    c += '#    Device: Bu FTD cihazı\n';
    c += '#    Interface: Outside (' + localEp + ')\n';
    c += '#    Protected Networks: ' + localNet + '\n\n';
    c += '# 3. Node B (Remote Peer):\n';
    c += '#    IP: ' + remoteEp + '\n';
    c += '#    Protected Networks: ' + remoteNet + '\n\n';
    c += '# 4. Authentication: Pre-shared Key\n';
    c += '#    Key: ' + psk + '\n\n';
    c += '# 5. IKE Policy + IPsec Proposal (default veya custom)\n\n';
    c += '# Doğrulama:\n# > show crypto ikev2 sa\n# > show crypto ipsec sa\n# > show vpn-sessiondb l2l\n';
    return c;
}

// ── Cisco FTD: Remote Access VPN ─────────────────────────────────────────────
CiscoFTD.raVpn = {
    label: 'Remote Access VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'FTD RA VPN',
                desc: 'FTD RA VPN — AnyConnect SSL remote access VPN. IP havuzu, split-tunnel ve kimlik doğrulama profili.'
            },
            sections: [
                {
                    title: 'RA-VPN Policy',
                    icon: 'fas fa-folder',
                    fields: [
                        { name: 'pol_name', why: "RA-VPN policy adı; politika bir cihaza atanıp <b>deploy</b> edilmeden kullanıcılar bağlanamaz.", label: 'RA-VPN Policy Adı', type: 'text', required: true, placeholder: 'CORP_RA_VPN', hint: 'Remote Access VPN policy ismi' },
                        { name: 'auth_method', why: "Sertifika tabanlı doğrulama AAA’dan daha güçlüdür ama PKI altyapısı gerektirir. AAA seçilip server group tanımlanmazsa hiçbir kullanıcı bağlanamaz.", label: 'Auth Method', type: 'select', options: [
                            { value: 'AAA', label: 'AAA (RADIUS/LDAP)', selected: true },
                            { value: 'Certificate', label: 'Certificate' },
                            { value: 'AAA+Certificate', label: 'AAA + Certificate' }
                        ], hint: 'VPN kullanıcı kimlik doğrulama yöntemi' },
                        { name: 'aaa_grp', why: "Server group FMC’de önceden tanımlı olmalıdır; ad uyuşmazlığında deploy başarısız olur. Sunucu erişilemezse tüm uzak erişim aynı anda durur, yedek sunucu tanımlayın.", label: 'AAA Server Group', type: 'text', requiredIf: { field: 'auth_method', in: ['AAA', 'AAA+Certificate'] }, placeholder: 'RADIUS_SERVERS', hint: 'AAA seçiliyse: FMC\'de tanımlı server group adı' }
                    ]
                },
                {
                    title: 'IP Pool',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'pool_name', why: "Havuz adı grup politikasında referans verilir; uyuşmazlıkta kullanıcı doğrulanır ama IP alamayıp bağlantı yarıda kalır.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'VPN_POOL', hint: 'IP havuzu için isim' },
                        { name: 'pool_start', why: "Havuz aralığı iç ağlarla çakışmamalı ve iç yönlendirmede FTD’ye işaret etmelidir. Aksi halde VPN kullanıcıları bağlanır ama hiçbir iç kaynağa erişemez.", label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '172.16.100.1', hint: 'Havuz başlangıç adresi' },
                        { name: 'pool_end', why: "Havuz kapasitesi eşzamanlı kullanıcı sayısını karşılamıyorsa fazladan kullanıcılar adres bulunamadığı için reddedilir. Lisans limitini de ayrıca kontrol edin.", label: 'Pool Bitiş IP', type: 'text', validate: 'ip', required: true, placeholder: '172.16.100.254', hint: 'Havuz bitiş adresi' },
                        { name: 'pool_mask', why: "Maske havuz subneti ile tutarlı olmalıdır; yanlış maske istemcinin iç ağa giden trafiğini yanlış yönlendirir ve kısmi erişim sorunları yaratır.", label: 'Pool Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Havuz subnet maskesi' }
                    ]
                },
                {
                    title: 'DNS ve Split Tunnel',
                    icon: 'fas fa-cut',
                    fields: [
                        { name: 'dns', why: "Uzak erişim istemcisine DNS verilmezse iç kaynaklara isimle ulaşılamaz. Split-tunnel kullanıyorsanız split-DNS de tanımlanmalı, yoksa iç alan adları dış DNS sunucusuna sorulur.", label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'VPN bağlantısı için DNS sunucusu' },
                        { name: 'split_acl', why: "Boş bırakılırsa <b>full tunnel</b> uygulanır ve kullanıcının tüm internet trafiği FTD üzerinden geçerek bant genişliği ile hairpin NAT gerektirir. Split tunnel ise kullanıcı trafiğinin bir kısmını denetim dışına çıkarır.", label: 'Split-Tunnel ACL', type: 'text', optional: true, placeholder: 'ACL_SPLIT_TUNNEL', hint: 'Boş bırakılırsa full tunnel uygulanır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdRaVpnGen(data);
        });
    }
};
function cgFtdRaVpnGen(data) {
    const polName = cgEsc(data.pol_name || ''), authMethod = cgEsc(data.auth_method || 'AAA');
    const aaaGrp = cgEsc(data.aaa_grp || '');
    const poolName = cgEsc(data.pool_name || ''), poolStart = cgEsc(data.pool_start || '');
    const poolEnd = cgEsc(data.pool_end || ''), poolMask = cgEsc(data.pool_mask || '');
    const dns = cgEsc(data.dns || ''), splitAcl = cgEsc(data.split_acl || '');
    let c = '# ========================================\n# Cisco FTD — Remote Access VPN\n# ========================================\n';
    c += '# FMC: Devices > VPN > Remote Access\n\n';
    c += '# RA-VPN Policy: ' + polName + '\n';
    c += '# Authentication: ' + authMethod + '\n';
    if (aaaGrp) c += '# AAA Server Group: ' + aaaGrp + '\n';
    c += '\n# IP Pool: ' + poolName + '\n';
    c += '#   Range: ' + poolStart + ' - ' + poolEnd + '\n';
    c += '#   Mask: ' + poolMask + '\n';
    c += '#   DNS: ' + dns + '\n';
    if (splitAcl) {
        c += '\n# Split Tunneling: Enabled\n#   ACL: ' + splitAcl + '\n';
    } else {
        c += '\n# Split Tunneling: Disabled (Full Tunnel)\n';
    }
    c += '\n# FMC Adımları:\n';
    c += '# 1. Devices > VPN > Remote Access > Add\n';
    c += '# 2. Policy Name: ' + polName + '\n';
    c += '# 3. Connection Profile > Add\n';
    c += '#    Auth Method: ' + authMethod + '\n';
    if (aaaGrp) c += '#    AAA Server: ' + aaaGrp + '\n';
    c += '#    IP Pool: Objects > Address Pools > ' + poolName + ' (' + poolStart + '-' + poolEnd + '/' + poolMask + ')\n';
    c += '#    DNS Server: ' + dns + '\n';
    if (splitAcl) c += '#    Split Tunnel ACL: ' + splitAcl + '\n';
    c += '# 4. AnyConnect Profile bağla (Objects > VPN > AnyConnect File)\n';
    c += '# 5. Interface: outside interface seç\n\n';
    c += '# Doğrulama:\n# > show vpn-sessiondb anyconnect\n# > show vpn-sessiondb summary\n# FMC: Analysis > Users > Active Sessions\n';
    return c;
}
