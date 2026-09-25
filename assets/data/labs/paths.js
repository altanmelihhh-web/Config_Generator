'use strict';
// ─── CLI Lab öğrenme yolları ────────────────────────────────────────────────
// Her yol: sıralı modüller; her modülde kısa tanıtım ve lab kimlikleri.
// Henüz yazılmamış lab kimlikleri arayüzde gösterilmez (yarım içerik yok).
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const M = (n, title, desc, labs) => ({ n, title, desc, labs });
    const SWRT = (v, ids) => [
        M(1, 'Cihaz kurulum ve temel ayarlar', 'CLI\'da gezinme, cihaz adı, afiş, parolalar ve kaydetme. Her şeyin temeli.', ids[1]),
        M(2, 'AAA: RADIUS ve TACACS+', 'Kimlik doğrulamayı merkezi sunucuya taşımak; sunucu düşerse yerel hesaba geri dönmek.', ids[2]),
        M(3, 'Uzaktan yönetim: VTY ve SSH', 'Yönetim IP\'si, SSH v2, yalnız SSH ve yerel kullanıcı.', ids[3]),
        M(4, 'Web yönetimini kapatma', 'Kullanılmayan HTTP/HTTPS yönetimini kapatıp saldırı yüzeyini küçültmek.', ids[4]),
        M(5, 'SSH sıkılaştırma', 'Zayıf şifreleme, anahtar değişimi ve MAC algoritmalarını kapatmak.', ids[5]),
        M(6, 'NAT / PAT', 'İç ağın internete çıkışı ve sunucu yayınlama.', ids[6]),
        M(7, 'DHCP', 'Adres havuzu, hariç adresler ve relay.', ids[7]),
        M(8, 'VLAN', 'Ağı mantıksal olarak bölmek; access ve trunk.', ids[8]),
        M(9, 'Arayüz ayarları', 'Açıklama, hız/dupleks, kapatma ve toplu yapılandırma.', ids[9]),
        M(10, 'Port güvenliği', 'Porta bağlanabilecek MAC sayısını sınırlamak; ihlalde ne olacağı.', ids[10]),
        M(11, 'MAC tablosu', 'Switch\'in kimi nerede gördüğünü okumak; statik MAC, yaşlanma.', ids[11]),
        M(12, 'Spanning Tree', 'Döngüleri önlemek: kenar port koruması ve kök köprü seçimi.', ids[12]),
        M(13, 'Yönlendirme: statik ve OSPF', 'Statik, varsayılan, yüzen rota ve tek alan OSPF.', ids[13]),
        M(14, 'ACL / filtreler', 'Trafiği ve yönetim erişimini kurallarla sınırlamak.', ids[14]),
        M(15, 'Yedekleme ve geri dönüş', 'Otomatik archive, dosyaya/TFTP\'ye yedek, geri alma.', ids[15]),
        M(16, 'Yedeklilik: LACP ve FHRP', 'Link toplama ve ağ geçidi yedekliliği (HSRP/VRRP).', ids[16]),
        M(17, 'Ara sınav: arıza kayıtları', 'Öğrendiklerinizi gerçek arıza senaryolarında birleştirin.', ids[17]),
    ];
    // Güvenlik duvarı yolu (FortiGate Administrator müfredat sırası)
    // d: vendor'a özgü modül açıklamaları (varsayılan metin FortiOS/PAN-OS terimleri içerir)
    const FW = (ids, d) => [
        M(1, 'CLI temelleri ve ilk kurulum', (d && d[1]) || 'config/edit/set/next/end akışı, arayüzler ve yönetim erişimi.', ids[1]),
        M(2, 'Yönetim erişimini sıkılaştırma', (d && d[2]) || 'WAN\'da yönetimi kapatmak, trusthost, güçlü şifreleme, giriş kilidi.', ids[2]),
        M(3, 'Sistem servisleri', (d && d[3]) || 'DNS, NTP ve DHCP sunucusu.', ids[3]),
        M(4, 'VLAN ve zone', (d && d[4]) || 'Tek porttan çok segment; arayüzleri kural için gruplamak.', ids[4]),
        M(5, 'Adres ve servis nesneleri', (d && d[5]) || 'Kuralların yapı taşları: adres, servis, gruplar.', ids[5]),
        M(6, 'Güvenlik kuralları ve kural sırası', (d && d[6]) || 'İlk kural, örtük deny, gölgelenen kural ve move.', ids[6]),
        M(7, 'Bağlantı kontrolleri', (d && d[7]) || 'ping, ARP, telnet ve kaynak adres seçimi.', ids[7]),
        M(8, 'Yönlendirme ve yedek hat', (d && d[8]) || 'Statik rota, mesafe/öncelik, yük devri.', ids[8]),
        M(9, 'NAT: IP havuzu ve VIP', (d && d[9]) || 'Sabit çıkış adresi ve sunucu yayınlama.', ids[9]),
        M(10, 'Kimlik doğrulama', (d && d[10]) || 'RADIUS/LDAP ile merkezi yönetici ve kullanıcı doğrulama.', ids[10]),
        M(11, 'Güvenlik profilleri', (d && d[11]) || 'SSL denetimi, web filtre, uygulama kontrolü, IPS, antivirüs.', ids[11]),
        M(12, 'Log ve izleme', (d && d[12]) || 'Trafik logu, syslog/SIEM ve sağlık kontrolü.', ids[12]),
        M(13, 'Site-to-site IPsec', (d && d[13]) || 'Route-based tünel kurulumu ve adım adım teşhis.', ids[13]),
        M(14, 'SSL-VPN', (d && d[14]) || 'Uzaktan erişim kurulumu ve kullanıcı sorunları.', ids[14]),
        M(15, 'Yedekleme ve geri dönüş', (d && d[15]) || 'TFTP yedeği, revizyon ve restore.', ids[15]),
        M(16, 'Yüksek erişilebilirlik (HA)', (d && d[16]) || 'Aktif-pasif küme, kontrollü failover ve sorun giderme.', ids[16]),
        M(17, 'Teşhis ve arıza', (d && d[17]) || 'debug flow, sniffer, performans, crashlog.', ids[17]),
    ];
    // ADC (F5 BIG-IP) şablonu: F5-CAB blueprint sırasına yakın; iRule modülü sonra dolacak
    const ADC = ids => [
        M(1, 'bash ve tmsh temelleri', 'İki kabuk, list / show, save sys config.', ids[1]),
        M(2, 'İlk kurulum: yönetim, VLAN, self IP, rota', 'Yönetim IP\'si, tagged/untagged VLAN, port lockdown, varsayılan rota.', ids[2]),
        M(3, 'Yönetim erişim güvenliği', 'httpd/sshd allow, port lockdown, parola politikası, roller.', ids[3]),
        M(4, 'İlk uygulama: monitor, pool, virtual server', 'HTTP monitörü, pool, VS ve SNAT; curl ile doğrulama.', ids[4]),
        M(5, 'HTTP durum kodları ve metotları', 'Kodun kaynağı: sunucu mu BIG-IP mi; RST ve 5xx.', ids[5]),
        M(6, 'Dağıtım yöntemleri', 'Round robin, ratio, least connections, priority group.', ids[6]),
        M(7, 'Persistence', 'Cookie insert ve source address.', ids[7]),
        M(8, 'SNAT, VS önceliği ve SSL', 'Automap, SNAT pool, dönüş yolu; host / ağ / wildcard VS önceliği; SSL offload ve bridging.', ids[8]),
        M(9, 'Bağlantı tablosu ve kalıcılık kayıtları', 'show/delete sys connection, persist-records, üyeyi boşaltma.', ids[9]),
        M(10, 'Loglar', '/var/log/ltm: mesaj kodları, önem seviyeleri, tail ve grep.', ids[10]),
        M(11, 'Yedek ve yükseltme', 'Service check date, UCS, ISO, volume, geri dönüş.', ids[11]),
        M(12, 'Yüksek erişilebilirlik (HA)', 'Device trust, config sync, kontrollü failover, MAC masquerade.', ids[12]),
        M(13, 'Arıza kayıtları', 'L2, VIP, yükseltme ve HA arızaları.', ids[13]),
        M(14, 'Paket yakalama (tcpdump)', '0.0:nnnp, VLAN ve mgmt, dosyaya yazma, RST nedeni ve paket desenleriyle arıza.', ids[14]),
        M(15, 'iRule', 'Yakında: olaylar, yönlendirme, başlık işleme.', ids[15]),
    ];
    root.CG_LAB_PATHS = [
        { id: 'cisco-swrt', vendor: 'cisco-ios', title: 'Cisco Switch & Router: sıfırdan üretime', desc: 'Kurulumdan yedekliliğe, bir kampüs switch\'i ve şube router\'ını adım adım üretime hazırlayın.',
          modules: SWRT('cisco-ios', { 1: ['ios-00', 'ios-01', 'ios-02'], 2: ['ios-35a'], 3: ['ios-03'], 4: ['ios-35b'], 5: ['ios-35c'], 6: ['ios-31'], 7: ['ios-30'], 8: ['ios-10'], 9: ['ios-04'],
              10: ['ios-34'], 11: ['ios-11m'], 12: ['ios-14', 'ios-13'], 13: ['ios-16', 'ios-17', 'ios-18'], 14: ['ios-32', 'ios-33'], 15: ['ios-05'], 16: ['ios-15', 'ios-22'], 17: ['ios-40', 'ios-43', 'ios-47', 'ios-45', 'ios-46', 'ios-44'] }) },
        { id: 'fortigate-fw', vendor: 'fortigate', title: 'FortiGate: sıfırdan üretime', desc: 'Yeni bir FortiGate\'i kurulumdan HA\'ya ve arıza teşhisine adım adım üretime hazırlayın.',
          modules: FW({ 1: ['fgt-00', 'fgt-01'], 2: ['fgt-17'], 3: ['fgt-02'], 4: ['fgt-13'], 5: ['fgt-03'], 6: ['fgt-04', 'fgt-05'], 7: ['fgt-26'], 8: ['fgt-06'], 9: ['fgt-07', 'fgt-08'],
              10: ['fgt-09'], 11: ['fgt-10'], 12: ['fgt-14', 'fgt-20'], 13: ['fgt-11', 'fgt-23'], 14: ['fgt-12', 'fgt-24'], 15: ['fgt-18'], 16: ['fgt-25', 'fgt-27'], 17: ['fgt-15', 'fgt-16', 'fgt-21', 'fgt-22'] }) },
        { id: 'paloalto-fw', vendor: 'paloalto', title: 'Palo Alto: sıfırdan üretime', desc: 'PAN-OS güvenlik duvarını kurulumdan güvenlik profillerine ve arıza teşhisine adım adım üretime hazırlayın.',
          modules: FW({ 1: ['pan-01'], 2: ['pan-07'], 3: ['pan-08'], 4: ['pan-02', 'pan-09'], 5: ['pan-03'], 6: ['pan-05'], 8: ['pan-14'], 9: ['pan-04'], 11: ['pan-10'], 12: ['pan-11'], 15: ['pan-12'], 16: ['pan-15'], 17: ['pan-06', 'pan-13'] },
              { 1: 'configure/set/commit akışı, arayüzler ve yönetim erişimi.', 2: 'Yönetim profili, izinli IP\'ler, güçlü şifreleme, giriş kilidi.', 15: 'Yapılandırma dışa aktarma, sürüm ve geri yükleme.' }) },
        { id: 'checkpoint-fw', vendor: 'checkpoint', title: 'Check Point: sıfırdan üretime', desc: 'Gaia gateway\'ini clish ile kurulumdan ClusterXL\'e ve arıza teşhisine adım adım üretime hazırlayın. Politika SmartConsole\'da yazılır; burada gateway tarafı çalışılır.',
          modules: FW({ 1: ['cp-01', 'cp-02'], 2: ['cp-08'], 4: ['cp-09'], 5: ['cp-13'], 9: ['cp-14'], 12: ['cp-10', 'cp-06'], 13: ['cp-07'], 15: ['cp-11'], 16: ['cp-05'], 17: ['cp-03', 'cp-04', 'cp-12', 'cp-15'] },
              { 1: 'clish ve expert, show/set, save config; arayüz ve rota.', 2: 'İzinli istemciler, oturum zaman aşımı, parola politikası, roller.', 4: 'VLAN alt arayüzleri ve SmartConsole topolojisi.', 5: 'mgmt_cli ile nesne ve kural; publish ve install-policy.', 9: 'Nesnede otomatik Hide NAT ve fw monitor ile doğrulama.', 12: 'Saat dilimi, uzak syslog ve sağlık kontrolü.', 13: 'vpn tu ve IKE günlüğüyle faz 1/faz 2 teşhisi.', 15: 'save configuration, backup ve snapshot.', 16: 'ClusterXL durumu ve kontrollü failover.', 17: 'zdebug drop, fw monitor, tcpdump, rota ve kural arızaları.' }) },
        { id: 'f5-adc', vendor: 'f5-ltm', title: 'F5 BIG-IP: sıfırdan üretime', desc: 'Boş bir BIG-IP\'yi ilk kurulumdan uygulama yayınına, operasyona, HA\'ya ve arıza teşhisine adım adım üretime hazırlayın (F5-CAB hedefleriyle).',
          modules: ADC({ 1: ['f5-01'], 2: ['f5-02'], 3: ['f5-03'], 4: ['f5-04'], 5: ['f5-09'], 6: ['f5-06'], 7: ['f5-07'], 8: ['f5-08', 'f5-23', 'f5-24'], 9: ['f5-14'], 10: ['f5-13'], 11: ['f5-11'], 12: ['f5-15'], 13: ['f5-05', 'f5-10', 'f5-12', 'f5-16'], 14: ['f5-17', 'f5-18'] }) },
        { id: 'huawei-swrt', vendor: 'huawei', title: 'Huawei Switch & Router: sıfırdan üretime', desc: 'VRP ile aynı yolu Huawei S/AR cihazlarında yürüyün.',
          modules: SWRT('huawei', { 1: ['hua-01', 'hua-04'], 2: ['hua-05'], 3: ['hua-02'], 4: ['hua-08'], 5: ['hua-09'], 6: ['hua-10'], 7: ['hua-11'], 8: ['hua-03'], 9: ['hua-12'], 10: ['hua-13'], 11: ['hua-14'], 12: ['hua-15'], 13: ['hua-06'], 14: ['hua-07'], 15: ['hua-16'], 16: ['hua-17'], 17: ['hua-40', 'hua-42'] }) },
        { id: 'dell-swrt', vendor: 'dell', title: 'Dell OS10 Switch: sıfırdan üretime', desc: 'OS10 ile veri merkezi erişim switch\'ini adım adım kurun.',
          modules: SWRT('dell', { 1: ['dell-01', 'dell-05'], 2: ['dell-06'], 3: ['dell-02'], 4: ['dell-07'], 7: ['dell-08'], 8: ['dell-03'], 9: ['dell-09'], 10: ['dell-10'], 11: ['dell-11'], 12: ['dell-12'], 13: ['dell-04', 'dell-13'], 14: ['dell-14'], 15: ['dell-15'], 16: ['dell-16'], 17: ['dell-40'] }) },
        { id: 'juniper-swrt', vendor: 'juniper', title: 'Juniper Junos: sıfırdan üretime', desc: 'Candidate/commit mantığıyla EX switch ve MX router.',
          modules: SWRT('juniper', { 1: ['jun-01', 'jun-02'], 2: ['jun-08'], 3: ['jun-09'], 4: ['jun-10'], 5: ['jun-11'], 7: ['jun-13'], 8: ['jun-04'], 9: ['jun-03', 'jun-14'], 10: ['jun-15'], 11: ['jun-16'], 12: ['jun-17'], 13: ['jun-05', 'jun-18'], 14: ['jun-19', 'jun-06'], 15: ['jun-20'], 16: ['jun-21'], 17: ['jun-07', 'jun-12', 'jun-22'] }) },
    ];
})();
