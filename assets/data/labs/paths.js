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
    // FortiGate 7 seviyeli müfredat (notes/fortigate-mufredat-seviyeleri.md): modül = seviyenin alt başlığı.
    // Yalnız FortiGate yolları kullanır (FW() Palo Alto ve Check Point ile ortak kalır). d: modül açıklaması üzerine yazma (ör. 7.6 yolu).
    // Planlanmış ama henüz yazılmamış lab kimlikleri arayüzde gizlenir (parti 13 itibarıyla yolda yazılmamış kimlik kalmadı).
    const FGT = (ids, d) => [
        [1, 'Giriş: FortiOS CLI', 'config/edit/set/next/end akışı; get, show, execute ve diagnose fiilleri.'],
        [2, 'Seviye 1 · OSI/TCP-IP, alt ağ ve yönlendirme temeli', 'Katmanlar ve araçları, alt ağ hesabı, bağlı ve statik rotalar, en uzun önek eşleşmesi ve yönetsel mesafe.'],
        [3, 'Seviye 1 · ARP, ICMP, TCP, UDP, DNS, DHCP ve NAT', 'Sniffer ile protokol davranışı; DHCP kiraları, DNS ve oturum tablosunda PAT.'],
        [4, 'Seviye 1 · Temel sorun giderme araçları', 'Sağlık turu, ping, ARP tablosu, telnet ile port testi ve kaynak adres seçimi.'],
        [5, 'Seviye 2 · Mimari, arayüzler, yönetim erişimi ve kimlik', 'Donanım/VM ve hızlandırma, arayüz ve allowaccess, yönetimi sıkılaştırma, RADIUS/LDAP ile yönetici doğrulama.'],
        [6, 'Seviye 2 · Sistem servisleri', 'DNS, NTP ve DHCP sunucusu.'],
        [7, 'Seviye 2 · Adres ve servis nesneleri', 'Kuralların yapı taşları: adres, servis, gruplar.'],
        [8, 'Seviye 2 · Politikalar ve kural sırası', 'İlk kural, kaynak NAT, örtük deny, gölgelenen kural ve move.'],
        [9, 'Seviye 2 · VLAN ve zone', 'Tek porttan çok segment; arayüzleri kural için gruplamak.'],
        [10, 'Seviye 2 · Statik rota ve yedek hat', 'Mesafe/öncelik ve yük devri.'],
        [11, 'Seviye 2 · NAT: IP havuzu, VIP ve central NAT', 'Sabit çıkış adresi, sunucu yayınlama ve merkezi SNAT tablosu.'],
        [12, 'Seviye 2 · Yedekleme ve geri yükleme', 'TFTP yedeği, revizyon ve restore.'],
        [13, 'Seviye 3 · Güvenlik duvarı politikaları: denetim ve log', 'Kural eşleşmesini sınamak (iprope lookup), örtük deny, engellenen trafiği loglamak.'],
        [14, 'Seviye 3 · Güvenlik profilleri ve SSL denetimi', 'Web ve DNS filtre, uygulama kontrolü, IPS, antivirüs; certificate ve deep inspection.'],
        [15, 'Seviye 3 · Loglama ve izleme', 'Trafik logu, syslog/SIEM, log okuma ve SNMP.'],
        [16, 'Seviye 4 · Site-to-site IPsec', 'Route-based tünel kurulumu, faz 1 ve faz 2.'],
        [17, 'Seviye 4 · SSL-VPN ve uzaktan erişim', 'Uzaktan erişim kurulumu, portal, havuz ve kural.'],
        [18, 'Seviye 4 · İleri yönlendirme, SD-WAN ve policy route', 'ECMP, öncelik, kara delik ve rota veritabanı; SD-WAN, PBR, OSPF ve BGP.'],
        [19, 'Seviye 5 · Yüksek erişilebilirlik (FGCP)', 'Aktif-pasif küme, kontrollü failover, split-brain.'],
        [20, 'Seviye 5 · FortiLink, FortiAP ve VDOM', 'Güvenlik yapısına bağlı switch ve AP; sanal alanlar.'],
        [21, 'Seviye 6 · FortiManager ve FortiAnalyzer', 'Merkezi yönetim bağlantısı (FGFM), revizyonlar, FortiAnalyzer\'a log ve güvenlik analitiği.'],
        [22, 'Seviye 7 · debug flow, sniffer ve oturumlar', 'Paketin neden düştüğünü ve nerede kaybolduğunu kanıtla bulmak.'],
        [23, 'Seviye 7 · Performans ve sistem kayıtları', 'CPU/bellek, süreçler, crashlog ve config-error-log.'],
        [24, 'Seviye 7 · VPN tanılama', 'IPsec faz 1/faz 2 ve SSL-VPN bağlantı sorunları.'],
        [25, 'Seviye 7 · HA tanılama', 'Küme neden sağlıksız: checksum, heartbeat, öncelik.'],
        [26, 'Sınav: karma arıza kayıtları', 'Öğrendiklerinizi birden çok arızayı birleştiren senaryolarda sınayın.'],
    ].map(([n, t, x]) => M(n, t, (d && d[n]) || x, ids[n]));
    // ADC (F5 BIG-IP) şablonu: F5-CAB blueprint sırasına yakın
    const ADC = ids => [
        M(1, 'bash ve tmsh temelleri', 'İki kabuk, list / show, save sys config.', ids[1]),
        M(2, 'İlk kurulum: yönetim, VLAN, self IP, rota', 'Yönetim IP\'si, tagged/untagged VLAN, port lockdown, varsayılan rota.', ids[2]),
        M(3, 'Yönetim erişim güvenliği', 'httpd/sshd allow, port lockdown, parola politikası, roller.', ids[3]),
        M(4, 'İlk uygulama: monitor, pool, virtual server', 'HTTP monitörü, pool, VS ve SNAT; curl ile doğrulama.', ids[4]),
        M(5, 'HTTP: kodlar, metotlar, mesaj okuma ve HTTP profili', 'Kodun kaynağı: sunucu mu BIG-IP mi; yanıtı satır satır okuma; metot politikası ve başlık sınırları.', ids[5]),
        M(6, 'Dağıtım yöntemleri', 'Round robin, ratio, least connections, priority group ve slow ramp.', ids[6]),
        M(7, 'Persistence', 'Cookie insert ve source address.', ids[7]),
        M(8, 'SNAT, VS önceliği ve SSL', 'Automap, SNAT pool, dönüş yolu; host / ağ / wildcard VS önceliği; SSL offload ve bridging.', ids[8]),
        M(9, 'Bağlantı tablosu ve kalıcılık kayıtları', 'show/delete sys connection, persist-records, üyeyi boşaltma.', ids[9]),
        M(10, 'Loglar', '/var/log/ltm: mesaj kodları, önem seviyeleri, tail ve grep.', ids[10]),
        M(11, 'Yedek ve yükseltme', 'Service check date, UCS, ISO, volume, geri dönüş.', ids[11]),
        M(12, 'Yüksek erişilebilirlik (HA)', 'Device trust, config sync, kontrollü failover, MAC masquerade.', ids[12]),
        M(13, 'Arıza kayıtları', 'L2, VIP, yükseltme ve HA arızaları.', ids[13]),
        M(14, 'Paket yakalama (tcpdump)', '0.0:nnnp, VLAN ve mgmt, dosyaya yazma, RST nedeni ve paket desenleriyle arıza.', ids[14]),
        M(15, 'iRule', 'İlk kural, olaylar ve log, pool seçimi, başlıklar, data group, özür sayfası.', ids[15]),
        M(16, 'iRule Arenası', 'Bulmaca ve oyunlar: Dedektif, Tahmin Et, Kırmızı → Yeşil, Döngü Kırıcı, Data Group\'a Taşı, Olay Sırası, Policy mi iRule mı, Performans Avcısı, Eksik Satır, Log Okuyucu, Olay Yanlış Yerde, Zamana Karşı, Açık Avı.', ids[16]),
        M(17, 'Advanced WAF (ASM)', 'Provision, politika, LTM policy ile bağlama, publish, blocking; blok sayfası, support ID ve yanlış pozitif.', ids[17]),
    ];
    // FortiGate yolunun lab kimlikleri (7.4). 7.6 yolu aynı modülleri f76- klonlarıyla kullanır (fortigate-76.js);
    // SSL-VPN tünel lab'ları (fgt-12, fgt-24) 7.6'da yok, yerlerine 7.6'ya özgü planlı lab'lar (f76-30 dial-up, f76-47 ZTNA, f76-54 dial-up tanılama).
    const FGT_IDS = { 1: ['fgt-00'], 2: ['fgt-62', 'fgt-40'], 3: ['fgt-41', 'fgt-63'], 4: ['fgt-20', 'fgt-26'], 5: ['fgt-64', 'fgt-01', 'fgt-17', 'fgt-09', 'fgt-61'], 6: ['fgt-02'], 7: ['fgt-03'], 8: ['fgt-04', 'fgt-05'], 9: ['fgt-13'],
              10: ['fgt-06'], 11: ['fgt-07', 'fgt-08', 'fgt-42'], 12: ['fgt-18'], 13: ['fgt-58'], 14: ['fgt-10', 'fgt-43', 'fgt-44', 'fgt-45', 'fgt-67'], 15: ['fgt-14', 'fgt-46'],
              16: ['fgt-11'], 17: ['fgt-12', 'fgt-47'], 18: ['fgt-65', 'fgt-28', 'fgt-29', 'fgt-48', 'fgt-49', 'fgt-50'], 19: ['fgt-25', 'fgt-51'], 20: ['fgt-60', 'fgt-52', 'fgt-53', 'fgt-66'], 21: ['fgt-59', 'fgt-56', 'fgt-57', 'fgt-68'],
              22: ['fgt-15', 'fgt-16'], 23: ['fgt-21', 'fgt-22'], 24: ['fgt-23', 'fgt-24'], 25: ['fgt-27'], 26: ['fgt-55'] };
    const FGT_76 = {};
    Object.keys(FGT_IDS).forEach(n => { FGT_76[n] = FGT_IDS[n].filter(id => id !== 'fgt-12' && id !== 'fgt-24').map(id => id.replace(/^fgt-/, 'f76-')); });
    FGT_76[17] = ['f76-30', 'f76-47']; FGT_76[24] = FGT_76[24].concat(['f76-54']);
    root.CG_LAB_PATHS = [
        { id: 'cisco-swrt', vendor: 'cisco-ios', title: 'Cisco Switch & Router: sıfırdan üretime', desc: 'Kurulumdan yedekliliğe, bir kampüs switch\'i ve şube router\'ını adım adım üretime hazırlayın.',
          modules: SWRT('cisco-ios', { 1: ['ios-00', 'ios-01', 'ios-02'], 2: ['ios-35a'], 3: ['ios-03'], 4: ['ios-35b'], 5: ['ios-35c'], 6: ['ios-31'], 7: ['ios-30'], 8: ['ios-10'], 9: ['ios-04'],
              10: ['ios-34'], 11: ['ios-11m'], 12: ['ios-14', 'ios-13'], 13: ['ios-16', 'ios-17', 'ios-18'], 14: ['ios-32', 'ios-33'], 15: ['ios-05'], 16: ['ios-15', 'ios-22'], 17: ['ios-40', 'ios-43', 'ios-47', 'ios-45', 'ios-46', 'ios-44'] }) },
        { id: 'fortigate-fw', vendor: 'fortigate', title: 'FortiGate: sıfırdan üretime', desc: 'Yedi seviyede ağ temellerinden FortiGate temellerine, güvenlik profillerine, VPN\'e, HA\'ya ve sorun gidermede ustalığa adım adım ilerleyin.',
          modules: FGT(FGT_IDS) },
        { id: 'fortigate-fw-76', vendor: 'fortigate-76', title: 'FortiGate 7.6: sıfırdan üretime', desc: 'Aynı yedi seviyeli yol FortiOS 7.6 görünümünde. Uzaktan erişim 7.6\'da IPsec dial-up ile yapılır (7.6.3 ve sonrasında SSL-VPN tünel modu yok).',
          modules: FGT(FGT_76, { 17: 'Uzaktan erişim 7.6\'da IPsec dial-up (FortiClient) ile; 7.6.3 ve sonrasında SSL-VPN tünel modu yok.' }) },
        { id: 'paloalto-fw', vendor: 'paloalto', title: 'Palo Alto: sıfırdan üretime', desc: 'PAN-OS güvenlik duvarını kurulumdan güvenlik profillerine ve arıza teşhisine adım adım üretime hazırlayın.',
          modules: FW({ 1: ['pan-01'], 2: ['pan-07'], 3: ['pan-08'], 4: ['pan-02', 'pan-09'], 5: ['pan-03'], 6: ['pan-05'], 8: ['pan-14'], 9: ['pan-04'], 11: ['pan-10'], 12: ['pan-11'], 15: ['pan-12'], 16: ['pan-15'], 17: ['pan-06', 'pan-13'] },
              { 1: 'configure/set/commit akışı, arayüzler ve yönetim erişimi.', 2: 'Yönetim profili, izinli IP\'ler, güçlü şifreleme, giriş kilidi.', 15: 'Yapılandırma dışa aktarma, sürüm ve geri yükleme.' }) },
        { id: 'checkpoint-fw', vendor: 'checkpoint', title: 'Check Point: sıfırdan üretime', desc: 'Gaia gateway\'ini clish ile kurulumdan ClusterXL\'e ve arıza teşhisine adım adım üretime hazırlayın. Politika SmartConsole\'da yazılır; burada gateway tarafı çalışılır.',
          modules: FW({ 1: ['cp-01', 'cp-02'], 2: ['cp-08'], 4: ['cp-09'], 5: ['cp-13'], 9: ['cp-14'], 12: ['cp-10', 'cp-06'], 13: ['cp-07'], 15: ['cp-11'], 16: ['cp-05'], 17: ['cp-03', 'cp-04', 'cp-12', 'cp-15'] },
              { 1: 'clish ve expert, show/set, save config; arayüz ve rota.', 2: 'İzinli istemciler, oturum zaman aşımı, parola politikası, roller.', 4: 'VLAN alt arayüzleri ve SmartConsole topolojisi.', 5: 'mgmt_cli ile nesne ve kural; publish ve install-policy.', 9: 'Nesnede otomatik Hide NAT ve fw monitor ile doğrulama.', 12: 'Saat dilimi, uzak syslog ve sağlık kontrolü.', 13: 'vpn tu ve IKE günlüğüyle faz 1/faz 2 teşhisi.', 15: 'save configuration, backup ve snapshot.', 16: 'ClusterXL durumu ve kontrollü failover.', 17: 'zdebug drop, fw monitor, tcpdump, rota ve kural arızaları.' }) },
        { id: 'f5-adc', vendor: 'f5-ltm', title: 'F5 BIG-IP: sıfırdan üretime', desc: 'Boş bir BIG-IP\'yi ilk kurulumdan uygulama yayınına, operasyona, HA\'ya ve arıza teşhisine adım adım üretime hazırlayın (F5-CAB hedefleriyle).',
          modules: ADC({ 1: ['f5-01'], 2: ['f5-02'], 3: ['f5-03'], 4: ['f5-04'], 5: ['f5-09', 'f5-63', 'f5-60', 'f5-62'], 6: ['f5-06', 'f5-69', 'f5-70'], 7: ['f5-07', 'f5-67'], 8: ['f5-08', 'f5-23', 'f5-24'], 9: ['f5-14'], 10: ['f5-13'], 11: ['f5-11'], 12: ['f5-15'], 13: ['f5-05', 'f5-10', 'f5-12', 'f5-16', 'f5-66'], 14: ['f5-17', 'f5-18'], 15: ['f5-30', 'f5-31', 'f5-32', 'f5-33', 'f5-34', 'f5-35'], 16: ['f5-40', 'f5-41', 'f5-42', 'f5-43', 'f5-44', 'f5-45', 'f5-46', 'f5-47', 'f5-48', 'f5-49', 'f5-50', 'f5-51', 'f5-52'], 17: ['f5-64', 'f5-65', 'f5-68'] }) },
        { id: 'huawei-swrt', vendor: 'huawei', title: 'Huawei Switch & Router: sıfırdan üretime', desc: 'VRP ile aynı yolu Huawei S/AR cihazlarında yürüyün.',
          modules: SWRT('huawei', { 1: ['hua-01', 'hua-04'], 2: ['hua-05'], 3: ['hua-02'], 4: ['hua-08'], 5: ['hua-09'], 6: ['hua-10'], 7: ['hua-11'], 8: ['hua-03'], 9: ['hua-12'], 10: ['hua-13'], 11: ['hua-14'], 12: ['hua-15'], 13: ['hua-06'], 14: ['hua-07'], 15: ['hua-16'], 16: ['hua-17'], 17: ['hua-40', 'hua-42'] }) },
        { id: 'dell-swrt', vendor: 'dell', title: 'Dell OS10 Switch: sıfırdan üretime', desc: 'OS10 ile veri merkezi erişim switch\'ini adım adım kurun.',
          modules: SWRT('dell', { 1: ['dell-01', 'dell-05'], 2: ['dell-06'], 3: ['dell-02'], 4: ['dell-07'], 7: ['dell-08'], 8: ['dell-03'], 9: ['dell-09'], 10: ['dell-10'], 11: ['dell-11'], 12: ['dell-12'], 13: ['dell-04', 'dell-13'], 14: ['dell-14'], 15: ['dell-15'], 16: ['dell-16'], 17: ['dell-40'] }) },
        { id: 'juniper-swrt', vendor: 'juniper', title: 'Juniper Junos: sıfırdan üretime', desc: 'Candidate/commit mantığıyla EX switch ve MX router.',
          modules: SWRT('juniper', { 1: ['jun-01', 'jun-02'], 2: ['jun-08'], 3: ['jun-09'], 4: ['jun-10'], 5: ['jun-11'], 7: ['jun-13'], 8: ['jun-04'], 9: ['jun-03', 'jun-14'], 10: ['jun-15'], 11: ['jun-16'], 12: ['jun-17'], 13: ['jun-05', 'jun-18'], 14: ['jun-19', 'jun-06'], 15: ['jun-20'], 16: ['jun-21'], 17: ['jun-07', 'jun-12', 'jun-22'] }) },
    ];
})();
