'use strict';
// ─── CLI Lab: Palo Alto öğrenme yolu lab'ları (PAN-OS 11.1 görünümü) ─────────
// paloalto.js'teki temel ve NAT/teşhis lab'larını tamamlar: yönetim sertleştirme, sistem servisleri,
// güvenlik profilleri, yapılandırma yönetimi ve "internete çıkılamıyor" arıza lab'ı.
// Kontroller RUNNING (commit edilmiş) yapılandırmaya bakar. Adresler yalnız güvenli örnek bloklardan.
(function () {
    const has = (s, p, w) => s.val(p, w) !== undefined;
    const arr = (s, p, w) => { const v = s.val(p, w); return Array.isArray(v) ? v : v === undefined ? [] : [v]; };
    const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
    const lastIdx = (s, f) => { const L = s.ev.list(); for (let i = L.length - 1; i >= 0; i--) if (f(L[i])) return i; return -1; };
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const C = cmds => ['configure'].concat(cmds, ['commit', 'exit']);
    const OUT = { src: '10.64.10.50', dst: '198.51.100.80', dport: 443, app: 'ssl' };
    // Ortak başlangıç: arayüzler, zone'lar, sanal yönlendirici, varsayılan rota (paloalto.js ile aynı)
    const BASE = ['set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24', 'set network interface ethernet ethernet1/1 comment WAN',
        'set network interface ethernet ethernet1/2 layer3 ip 10.64.10.1/24', 'set network interface ethernet ethernet1/2 comment LAN',
        'set network interface ethernet ethernet1/3 layer3 ip 172.24.50.1/24', 'set network interface ethernet ethernet1/3 comment DMZ',
        'set zone untrust network layer3 ethernet1/1', 'set zone trust network layer3 ethernet1/2', 'set zone dmz network layer3 ethernet1/3',
        'set network virtual-router default interface [ ethernet1/1 ethernet1/2 ethernet1/3 ]',
        'set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1'];
    // Çalışan internet çıkışı: kural + kaynak NAT
    const OUT_OK = ['set address LAN-NET ip-netmask 10.64.10.0/24',
        'set rulebase security rules LAN-OUT from trust to untrust source LAN-NET destination any application [ ssl web-browsing dns ] service application-default action allow',
        'set rulebase nat rules SNAT from trust to untrust source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1'];
    const TSP = 'test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl';
    const outOk = s => { const d = s.decide(OUT); return d.stage === 'allowed' && !!d.snat && d.rule === 'LAN-OUT'; };

    const LABS = [
    // ═══ Yönetim erişimini sertleştirme ═══
    {
        id: 'pan-07', vendor: 'paloalto', level: 1, title: 'Yönetim erişimini sertleştirme', minutes: 20, kind: 'firewall', hostname: 'PA-SUBE', pre: ['pan-02'],
        up: ['ethernet1/1', 'ethernet1/2'], hosts: ['203.0.113.1'],
        start: BASE.concat(['set network profiles interface-management-profile HERSEY ping yes ssh yes https yes http yes',
            'set network interface ethernet ethernet1/1 layer3 interface-management-profile HERSEY']),
        story: 'Dış tarama raporu: "Güvenlik duvarının WAN arayüzü (ethernet1/1) internetten HTTP, HTTPS ve SSH ile yönetime açık; yönetim portuna her ağdan erişilebiliyor; boşta kalan oturum kapanmıyor ve hatalı girişte kilit yok." Yönetim yalnız iç ağdan (LAN) ve yönetim ağından (10.240.0.0/16) yapılacak.',
        lesson: L('PAN-OS\'ta yönetime iki kapı vardır: <b>MGT portu</b> (<code>deviceconfig system</code>: <code>permitted-ip</code> ile izinli ağlar, <code>service disable-…</code> ile kapatılan protokoller) ve <b>veri arayüzleri</b> (<code>interface-management-profile</code> ile hangi arayüzde ping/SSH/HTTPS açık). Ayrıca <code>deviceconfig setting management</code> altında boşta kalma zaman aşımı ve hatalı giriş kilidi ayarlanır.',
            'İnternete açık yönetim arayüzleri, PAN-OS dahil tüm güvenlik duvarı üreticilerinde kritik açıkların ilk hedefidir. Yönetimi WAN\'dan kaldırmak ve MGT portunu izinli ağlarla sınırlamak, yama yayımlanana kadar bile saldırı yüzeyini ortadan kaldırır.',
            'set network profiles interface-management-profile MGMT-LAN ping yes ssh yes https yes\nset network interface ethernet ethernet1/2 layer3 interface-management-profile MGMT-LAN\ndelete network interface ethernet ethernet1/1 layer3 interface-management-profile\nset deviceconfig system permitted-ip 10.240.0.0/16\nset deviceconfig system service disable-http yes disable-telnet yes\nset deviceconfig setting management idle-timeout 10\nset deviceconfig setting management admin-lockout failed-attempts 5 lockout-time 30\ncommit',
            ['WAN arayüzünde profili bırakıp "şifre güçlü" demek.', 'permitted-ip\'e kendi yönetim ağınızı eklemeden commit edip kilitlenmek.', 'HTTP\'yi açık bırakmak (parola açık metin gider).']),
        goals: ['Veri arayüzünde yönetim profili', 'MGT portunda permitted-ip ve kapalı protokoller', 'Zaman aşımı ve hatalı giriş kilidi'],
        tasks: [
            { t: '<code>MGMT-LAN</code> profili (ping, SSH, HTTPS; HTTP yok) LAN\'a (ethernet1/2) bağlansın, WAN\'daki (ethernet1/1) profil kaldırılsın. Commit edin.', why: 'Profil, veri arayüzünün IP\'sine hangi yönetim protokolleriyle bağlanılabileceğini belirler; profil yoksa o arayüzde yönetim kapalıdır.',
              hints: ['set network profiles interface-management-profile … / delete … interface-management-profile', '<code>set network profiles interface-management-profile MGMT-LAN ping yes ssh yes https yes</code> · <code>set network interface ethernet ethernet1/2 layer3 interface-management-profile MGMT-LAN</code> · <code>delete network interface ethernet ethernet1/1 layer3 interface-management-profile</code> · <code>commit</code>'],
              steps: C(['set network profiles interface-management-profile MGMT-LAN ping yes ssh yes https yes', 'set network interface ethernet ethernet1/2 layer3 interface-management-profile MGMT-LAN', 'delete network interface ethernet ethernet1/1 layer3 interface-management-profile']),
              check: s => !s.mgmtAllows('ethernet1/1', 'https') && !s.mgmtAllows('ethernet1/1', 'ssh') && s.mgmtAllows('ethernet1/2', 'https') && s.mgmtAllows('ethernet1/2', 'ssh') && !s.mgmtAllows('ethernet1/2', 'http'),
              fb: s => (s.mgmtAllows('ethernet1/1', 'https') || s.mgmtAllows('ethernet1/1', 'ssh') ? 'WAN (ethernet1/1) hâlâ yönetime açık.' : s.mgmtAllows('ethernet1/2', 'http') ? 'LAN profilinde HTTP açık: parola açık metin gider.' : null) },
            { t: 'MGT portu: yalnız 10.240.0.0/16 erişebilsin; HTTP ve Telnet kapalı. Commit edin.', why: 'permitted-ip listesi boşsa MGT portuna her ağdan bağlanılabilir. HTTP ve Telnet şifresizdir.',
              hints: ['deviceconfig system permitted-ip / service', '<code>set deviceconfig system permitted-ip 10.240.0.0/16</code> · <code>set deviceconfig system service disable-http yes disable-telnet yes</code>'],
              steps: C(['set deviceconfig system permitted-ip 10.240.0.0/16', 'set deviceconfig system service disable-http yes disable-telnet yes']),
              check: s => has(s, 'deviceconfig system permitted-ip 10.240.0.0/16') && s.val('deviceconfig system service disable-http') === 'yes' && s.val('deviceconfig system service disable-telnet') === 'yes' },
            { t: 'Oturum ve hesap koruması: boşta 10 dk sonra oturum kapansın; 5 hatalı girişte hesap 30 dk kilitlensin. Commit edin.', why: 'Açık bırakılan yönetici oturumu ele geçirilebilir; kilit, parola deneme saldırılarını yavaşlatır.',
              hints: ['deviceconfig setting management', '<code>set deviceconfig setting management idle-timeout 10</code> · <code>set deviceconfig setting management admin-lockout failed-attempts 5 lockout-time 30</code>'],
              steps: C(['set deviceconfig setting management idle-timeout 10', 'set deviceconfig setting management admin-lockout failed-attempts 5 lockout-time 30']),
              check: s => s.val('deviceconfig setting management idle-timeout') === '10' && s.val('deviceconfig setting management admin-lockout failed-attempts') === '5' && s.val('deviceconfig setting management admin-lockout lockout-time') === '30',
              fb: s => (s.val('deviceconfig setting management idle-timeout') === '0' ? 'idle-timeout 0 sınırsız demektir: oturum hiç kapanmaz.' : null) },
            { t: 'permitted-ip listesi boş olsaydı MGT portuna kimler bağlanabilirdi?', ask: { choices: [['any', 'MGT portuna ulaşabilen her adres'], ['lan', 'Yalnız LAN'], ['none', 'Hiç kimse']], correct: 'any' },
              why: 'Boş liste kısıt yok demektir; tek engel ağ tasarımı olur. MGT portu ayrı bir yönetim ağında olmalı ve permitted-ip ile ayrıca sınırlanmalıdır.', hints: ['Boş liste = kısıt yok', 'Hangi katman kalıyor?'] },
        ],
        verify: ['show config running', 'show interface ethernet1/1'],
        learn: ['Veri arayüzünde yönetim: interface-management-profile.', 'MGT portu: permitted-ip + service disable-…', 'idle-timeout ve admin-lockout.', 'WAN\'da yönetim profili olmaz.'],
        links: { tool: '#/paloalto/mgmt', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Device Settings'
    },
    // ═══ Sistem servisleri: DNS, NTP, DHCP ═══
    {
        id: 'pan-08', vendor: 'paloalto', level: 1, title: 'Sistem servisleri: DNS, NTP ve DHCP sunucusu', minutes: 20, kind: 'firewall', hostname: 'PA-SUBE', pre: ['pan-02'],
        up: ['ethernet1/1', 'ethernet1/2'], hosts: ['203.0.113.1'],
        start: BASE,
        sim: { ntp: ['192.0.2.123'], dhcp: [{ mac: '00:50:56:A1:06:01', intf: 'ethernet1/2', host: 'PC-MUHASEBE' }, { mac: '00:50:56:A1:06:02', intf: 'ethernet1/2', host: 'PC-SATIS' }, { mac: '00:50:56:A1:06:03', intf: 'ethernet1/2', host: 'YAZICI-KAT1' }] },
        story: 'Yeni şube güvenlik duvarı (PA-SUBE) kuruluyor. Cihaz ad çözebilmeli (lisans, imza ve URL güncellemeleri buna bağlı) ve saati doğru olmalı. Kurum NTP sunucuları 192.0.2.123 (birincil) ve 192.0.2.124 (ikincil). LAN\'daki bilgisayarlar adreslerini güvenlik duvarından alacak: aralık .100–.199, ağ geçidi 10.64.10.1.',
        lesson: L('Cihazın kendi servisleri <code>deviceconfig system</code> altındadır: <code>dns-setting servers</code> ve <code>ntp-servers primary-ntp-server / secondary-ntp-server</code>. DHCP sunucusu arayüz başına tanımlanır: <code>network dhcp interface ethernet1/2 server</code> altında <code>ip-pool</code> (aralık), <code>option gateway</code>, <code>option subnet-mask</code>, <code>option dns</code> ve <code>mode enabled</code>. Kiralar <code>show dhcp server lease interface …</code> ile görülür.',
            'DNS yoksa imza ve URL kategorisi güncellemeleri gelmez; saat yanlışsa loglar ve sertifika doğrulaması bozulur. DHCP\'de ağ geçidi verilmezse istemci IP alır ama başka ağa çıkamaz.',
            'set deviceconfig system dns-setting servers primary 198.51.100.53\nset deviceconfig system ntp-servers primary-ntp-server ntp-server-address 192.0.2.123\nset deviceconfig system ntp-servers secondary-ntp-server ntp-server-address 192.0.2.124\nset network dhcp interface ethernet1/2 server mode enabled\nset network dhcp interface ethernet1/2 server ip-pool 10.64.10.100-10.64.10.199\nset network dhcp interface ethernet1/2 server option gateway 10.64.10.1\nset network dhcp interface ethernet1/2 server option subnet-mask 255.255.255.0\ncommit',
            ['Aralığı arayüzün alt ağı dışında vermek.', 'option gateway\'i unutmak.', 'Tek NTP sunucusuyla yetinmek.']),
        goals: ['Cihaz DNS ve NTP', 'NTP eşitlemesini doğrulamak', 'Arayüz DHCP sunucusu', 'Kiraları okumak'],
        tasks: [
            { t: 'DNS: birincil 198.51.100.53, ikincil 198.51.100.54. Commit edin.', why: 'Güvenlik duvarı güncellemeleri ve FQDN nesneleri için ad çözer; ikincil sunucu tek hata noktasını kaldırır.',
              hints: ['deviceconfig system dns-setting servers', '<code>set deviceconfig system dns-setting servers primary 198.51.100.53</code> · <code>… secondary 198.51.100.54</code>'],
              steps: C(['set deviceconfig system dns-setting servers primary 198.51.100.53', 'set deviceconfig system dns-setting servers secondary 198.51.100.54']),
              check: s => s.val('deviceconfig system dns-setting servers primary') === '198.51.100.53' && s.val('deviceconfig system dns-setting servers secondary') === '198.51.100.54' },
            { t: 'NTP: birincil 192.0.2.123, ikincil 192.0.2.124. Commit edin.', why: 'İkincil sunucu, birincil erişilemezken saatin kaymasını önler.',
              hints: ['deviceconfig system ntp-servers', '<code>set deviceconfig system ntp-servers primary-ntp-server ntp-server-address 192.0.2.123</code> · <code>… secondary-ntp-server ntp-server-address 192.0.2.124</code>'],
              steps: C(['set deviceconfig system ntp-servers primary-ntp-server ntp-server-address 192.0.2.123', 'set deviceconfig system ntp-servers secondary-ntp-server ntp-server-address 192.0.2.124']),
              check: s => s.val('deviceconfig system ntp-servers primary-ntp-server ntp-server-address') === '192.0.2.123' && s.val('deviceconfig system ntp-servers secondary-ntp-server ntp-server-address') === '192.0.2.124' },
            { t: 'Saat hangi sunucuya eşitlendi?', ask: { choices: [['123', '192.0.2.123 (birincil)'], ['124', '192.0.2.124 (ikincil)'], ['none', 'Hiçbirine; yerel saat kullanılıyor']], correct: '123' },
              why: '<code>show ntp</code> "NTP synched to …" satırında eşitlenen sunucuyu, altında her sunucunun durumunu gösterir. İkincil "rejected" ise o sunucuya ulaşılamıyordur — birincil düşerse saat kayar.', hints: ['show ntp', '"NTP synched to" satırı'],
              steps: ['show ntp', { answer: 2, v: '123' }], needs: [1] },
            { t: 'ethernet1/2 için DHCP sunucusu: aralık 10.64.10.100–10.64.10.199, ağ geçidi 10.64.10.1, maske /24, DNS 198.51.100.53. Commit edin.', why: 'Aralık arayüzün alt ağında olmalı; ağ geçidi ve DNS olmadan istemci yalnız kendi ağında konuşabilir.',
              hints: ['network dhcp interface ethernet1/2 server …', '<code>… server mode enabled</code> · <code>… server ip-pool 10.64.10.100-10.64.10.199</code> · <code>… option gateway 10.64.10.1</code> · <code>… option subnet-mask 255.255.255.0</code> · <code>… option dns primary 198.51.100.53</code>'],
              steps: C(['set network dhcp interface ethernet1/2 server mode enabled', 'set network dhcp interface ethernet1/2 server ip-pool 10.64.10.100-10.64.10.199', 'set network dhcp interface ethernet1/2 server option gateway 10.64.10.1',
                  'set network dhcp interface ethernet1/2 server option subnet-mask 255.255.255.0', 'set network dhcp interface ethernet1/2 server option dns primary 198.51.100.53']),
              check: s => { const L2 = s.dhcpLeases(); return L2.length === 3 && L2.every(l => l.ip && l.gw === '10.64.10.1'); },
              fb: s => { const L2 = s.dhcpLeases(); if (L2.some(l => l.reason === 'range')) return 'Aralık ethernet1/2 ağının (10.64.10.0/24) dışında.'; if (L2.some(l => l.ip && !l.gw)) return 'Çalışır ama eksik: ağ geçidi yok.'; return null; } },
            { t: 'Kiralara bakın: muhasebe bilgisayarı hangi adresi aldı?', ask: { choices: [['100', '10.64.10.100'], ['1', '10.64.10.1'], ['199', '10.64.10.199']], correct: '100' },
              why: 'Kiralar aralığın başından verilir; <code>show dhcp server lease interface ethernet1/2</code> IP, MAC ve ana makine adını gösterir.', hints: ['show dhcp server lease interface ethernet1/2', 'PC-MUHASEBE satırı'],
              steps: ['show dhcp server lease interface ethernet1/2', { answer: 4, v: '100' }], needs: [3] },
        ],
        verify: ['show ntp', 'show dhcp server lease interface all', 'show config running'],
        learn: ['deviceconfig system: DNS ve NTP.', 'show ntp ile eşitleme kontrolü.', 'DHCP arayüz başına: ip-pool + option gateway.', 'Kiralar: show dhcp server lease.'],
        links: { tool: '#/paloalto/system', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Device Settings'
    },
    // ═══ Güvenlik profilleri ═══
    {
        id: 'pan-10', vendor: 'paloalto', level: 3, title: 'Güvenlik profilleri: antivirüs, anti-spyware, zafiyet, URL, WildFire', minutes: 20, kind: 'firewall', hostname: 'PA-A', pre: ['pan-04'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], hosts: ['203.0.113.1'],
        start: BASE.concat(OUT_OK, ['set address WEB-SRV ip-netmask 172.24.50.10/32', 'set address WEB-PUB ip-netmask 203.0.113.10/32',
            'set rulebase security rules WEB-IN from untrust to dmz source any destination WEB-PUB application [ ssl web-browsing ] service application-default action allow']),
        story: 'Kurallar trafiğe izin veriyor ama <b>içeriği incelemiyor</b>: kullanıcılar zararlı dosya indirebilir, yayınlanan web sunucusu (WEB-IN kuralı) istismar girişimlerine açık. Kullanıcı çıkışına ve sunucu yayınına güvenlik profillerini bağlayın.',
        lesson: L('Bir <code>allow</code> kuralı yalnız "geçsin" der; içeriği <b>güvenlik profilleri</b> inceler: <b>virus</b> (antivirüs), <b>spyware</b> (komuta-kontrol trafiği), <b>vulnerability</b> (istismar/IPS), <b>url-filtering</b>, <b>file-blocking</b>, <b>wildfire-analysis</b>. Kurala <code>profile-setting profiles …</code> ile tek tek ya da <code>profile-setting group …</code> ile grup olarak bağlanır — ikisi birlikte kullanılamaz. Şifreli (HTTPS) içeriği görmek için ayrıca <b>şifre çözme (decryption)</b> kuralı gerekir.',
            'Profilsiz allow kuralı, NGFW\'yi yalnız port/uygulama süzgecine indirger. Sunucu yayın kurallarında zafiyet koruması (vulnerability) en kritik profildir; <code>strict</code> daha fazla imzayı engelleme eylemine alır.',
            'set rulebase security rules LAN-OUT profile-setting profiles virus default spyware default vulnerability default url-filtering default wildfire-analysis default\nset rulebase security rules WEB-IN profile-setting profiles vulnerability strict virus default\ncommit',
            ['Profili yalnız bir kurala bağlayıp diğer allow kurallarını unutmak.', 'Şifre çözme olmadan HTTPS içeriğinin tarandığını sanmak.', 'Grup ve tek tek profilleri aynı kuralda karıştırmak.']),
        goals: ['Kurala profil bağlamak', 'Sunucu yayınına zafiyet koruması', 'group ve profiles farkı', 'Şifre çözmenin rolü'],
        tasks: [
            { t: 'LAN-OUT kuralına antivirüs, anti-spyware, zafiyet, URL filtreleme ve WildFire profillerini (<code>default</code>) bağlayın. Commit edin.', why: 'Her profil farklı bir tehdidi inceler; kullanıcı çıkışında hepsi birlikte kullanılır.',
              hints: ['set rulebase security rules LAN-OUT profile-setting profiles …', '<code>… profile-setting profiles virus default spyware default vulnerability default url-filtering default wildfire-analysis default</code>'],
              steps: C(['set rulebase security rules LAN-OUT profile-setting profiles virus default spyware default vulnerability default url-filtering default wildfire-analysis default']),
              check: s => ['virus', 'spyware', 'vulnerability', 'url-filtering', 'wildfire-analysis'].every(k => arr(s, 'rulebase security rules LAN-OUT profile-setting profiles ' + k).includes('default')),
              fb: s => { const miss = ['virus', 'spyware', 'vulnerability', 'url-filtering', 'wildfire-analysis'].filter(k => !arr(s, 'rulebase security rules LAN-OUT profile-setting profiles ' + k).length); return miss.length && miss.length < 5 ? 'Eksik profil: ' + miss.join(', ') + '.' : null; } },
            { t: 'Yayınlanan web sunucusu (WEB-IN) için zafiyet korumasını <code>strict</code>, antivirüsü <code>default</code> yapın. Commit edin.', why: 'İçeri gelen trafikte korunan taraf sunucudur; istismar girişimleri zafiyet profiliyle engellenir. strict, daha çok imzayı engelleme eylemine alır.',
              hints: ['WEB-IN profile-setting profiles …', '<code>set rulebase security rules WEB-IN profile-setting profiles vulnerability strict virus default</code>'],
              steps: C(['set rulebase security rules WEB-IN profile-setting profiles vulnerability strict virus default']),
              check: s => arr(s, 'rulebase security rules WEB-IN profile-setting profiles vulnerability').includes('strict') && arr(s, 'rulebase security rules WEB-IN profile-setting profiles virus').includes('default') },
            { t: 'Aynı kurala hem <code>profile-setting group</code> hem <code>profiles</code> verilebilir mi?', ask: { choices: [['no', 'Hayır: ya grup ya tek tek profiller; biri seçilince diğeri kalkar'], ['yes', 'Evet, ikisi birleşir'], ['group', 'Evet ama grup her zaman kazanır']], correct: 'no' },
              why: 'profile-setting altında group ve profiles birbirini dışlar. Grup, aynı profil setini onlarca kurala tek adla bağlamak için kullanılır.', hints: ['İkisini de set etmeyi deneyin.', 'show rulebase security rules LAN-OUT'] },
            { t: 'Kullanıcının HTTPS ile indirdiği zararlı dosyanın antivirüs profiline takılması için ne gerekir?', ask: { choices: [['decrypt', 'Bu trafik için SSL Forward Proxy şifre çözme kuralı (ve istemcilerde güvenilen CA)'], ['nothing', 'Hiçbir şey; profil HTTPS içeriğini de görür'], ['port', 'Yalnız service\'i 443 yapmak']], correct: 'decrypt' },
              why: 'İçerik şifreliyken taranamaz. Şifre çözme kuralı trafiği güvenlik duvarında açar; istemciler güvenlik duvarının CA sertifikasına güvenmezse sertifika uyarısı görür. Hassas kategoriler (bankacılık, sağlık) genelde hariç tutulur.', hints: ['Şifreli içerik görülebilir mi?', 'Decryption policy'] },
        ],
        verify: ['show config running'],
        learn: ['allow ≠ güvenli: içeriği profiller inceler.', 'profiles ya da group; ikisi birden değil.', 'Sunucu yayınına zafiyet koruması (strict).', 'HTTPS içeriği için şifre çözme gerekir.'],
        links: { tool: '#/paloalto/security', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Security Profiles'
    },
    // ═══ Yapılandırma yönetimi ═══
    {
        id: 'pan-12', vendor: 'paloalto', level: 2, title: 'Yapılandırma yönetimi: kaydet, farkı gör, geri al, yükle', minutes: 20, kind: 'firewall', hostname: 'PA-A', pre: ['pan-01'],
        up: ['ethernet1/1', 'ethernet1/2'], hosts: ['203.0.113.1', '198.51.100.80'],
        start: BASE.concat(OUT_OK),
        story: 'Değişiklik kuralı: "Bakımdan önce adlı yedek, commit\'ten önce fark kontrolü, hatalı commit\'te dakikalar içinde geri dönüş." Bu akışı canlandırın: önce yedek, sonra commit edilmemiş bir hatayı geri alma, sonra commit edilmiş bir hatadan yedekle dönme.',
        lesson: L('PAN-OS\'ta değişiklikler <b>candidate</b> yapılandırmada birikir, <code>commit</code> ile <b>running</b> olur. <code>show config diff</code> (op modu) ikisinin farkını gösterir. <code>revert config</code> commit edilmemiş değişiklikleri atar. <code>save config to &lt;dosya&gt;</code> candidate\'in adlı kopyasını cihazda saklar; <code>load config from &lt;dosya&gt;</code> onu candidate\'e yükler — etkili olması için <b>commit</b> gerekir.',
            'Commit\'ten önce farka bakmak, "yanlışlıkla silinen kural" gibi hataları canlıya çıkmadan yakalar. Commit edilmiş bir hatadan dönmenin en hızlı yolu önceden alınmış adlı yedektir.',
            'configure\nsave config to bakim-oncesi.xml\n… değişiklikler …\nrun show config diff\nrevert config            # commit edilmemiş değişiklikleri at\nload config from bakim-oncesi.xml\ncommit',
            ['load config\'ten sonra commit etmeyi unutmak (running değişmez).', 'Farka bakmadan commit etmek.', 'Yedeği değişiklikten sonra almak.']),
        goals: ['Adlı yedek', 'Candidate/running farkı', 'revert config', 'load config + commit ile geri dönüş'],
        tasks: [
            { t: 'Değişiklikten önce yapılandırmayı <code>bakim-oncesi.xml</code> olarak kaydedin.', why: 'Yedek değişiklikten ÖNCE alınır; sonradan alınan yedek hatayı da içerir.',
              hints: ['configure → save config to …', '<code>configure</code> → <code>save config to bakim-oncesi.xml</code> → <code>exit</code>'], steps: ['configure', 'save config to bakim-oncesi.xml', 'exit'],
              check: s => s.files().includes('bakim-oncesi.xml') },
            { t: 'Bir hata yapın (LAN-OUT kuralını silin) ama commit etmeyin; op modunda farka bakın.', why: 'show config diff candidate ile running arasındaki farkı gösterir: commit edilmemiş her değişiklik burada görünür.',
              hints: ['configure → delete … → exit → show config diff', '<code>delete rulebase security rules LAN-OUT</code> → <code>exit</code> → <code>show config diff</code>'],
              steps: ['configure', 'delete rulebase security rules LAN-OUT', 'exit', 'show config diff'],
              check: s => s.ev.ran(/^show config diff/) && !has(s, 'rulebase security rules LAN-OUT', 'cand') && has(s, 'rulebase security rules LAN-OUT') },
            { t: 'Commit edilmemiş hatayı geri alın.', why: '<code>revert config</code> candidate\'i running\'e döndürür; commit edilmemiş tüm değişiklikler atılır.',
              hints: ['configure → revert config', '<code>configure</code> → <code>revert config</code> → <code>exit</code>'], steps: ['configure', 'revert config', 'exit'], needs: [1],
              check: s => s.committed() && has(s, 'rulebase security rules LAN-OUT') && s.ev.list().some(e => e.canon === 'revert config') },
            { t: 'Şimdi hatayı commit edin (LAN-OUT\'u silip commit), sonra yedekten dönüp commit edin. İnternet çıkışı geri gelmeli.', why: 'Commit edilmiş hatada revert işe yaramaz (candidate zaten running). Adlı yedeği load edip commit etmek running\'i geri getirir.',
              hints: ['delete + commit → load config from … → commit', '<code>load config from bakim-oncesi.xml</code> → <code>commit</code>'],
              steps: ['configure', 'delete rulebase security rules LAN-OUT', 'commit', 'load config from bakim-oncesi.xml', 'commit', 'exit'], needs: [0],
              check: s => outOk(s) && s.ev.list().some(e => e.loaded === 'bakim-oncesi.xml') && s.committed() },
            { t: '<code>load config from</code> sonrası commit edilmezse ne olur?', ask: { choices: [['cand', 'Yedek yalnız candidate\'e yüklenir; cihaz hâlâ eski (running) yapılandırmayla çalışır'], ['run', 'Yedek hemen etkin olur'], ['reboot', 'Cihaz yeniden başlar']], correct: 'cand' },
              why: 'PAN-OS\'ta hiçbir değişiklik commit olmadan etkin olmaz; load config de candidate\'i değiştiren bir işlemdir.', hints: ['Candidate mi running mi?', 'show config diff ne gösterir?'] },
        ],
        verify: ['show config diff', 'show jobs all'],
        learn: ['Yedek değişiklikten önce: save config to.', 'show config diff ile commit öncesi kontrol.', 'revert config: commit edilmemiş değişiklikleri atar.', 'load config + commit: commit edilmiş hatadan dönüş.'],
        links: { cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Device Settings'
    },
    // ═══ Arıza: internete çıkılamıyor ═══
    {
        id: 'pan-13', vendor: 'paloalto', level: 5, title: '"LAN\'dan internete çıkılamıyor" — arıza kaydı', minutes: 25, kind: 'firewall', hostname: 'PA-A', pre: ['pan-05'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], hosts: ['203.0.113.1', '198.51.100.80'],
        start: BASE.concat(OUT_OK),
        variants: [
            { key: 'nat', start: ['delete rulebase nat rules SNAT'], fix: C(['set rulebase nat rules SNAT from trust to untrust source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1']) },
            { key: 'zone', start: ['delete zone trust network layer3'], fix: C(['set zone trust network layer3 ethernet1/2']) },
            { key: 'route', start: ['delete network virtual-router default routing-table ip static-route DEFAULT'], fix: C(['set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1']) },
            // PAN-OS'ta çok değerli alana set üye EKLER; yanlış üye önce delete ile çıkarılır
            { key: 'rulezone', start: ['delete rulebase security rules LAN-OUT from trust', 'set rulebase security rules LAN-OUT from untrust', 'delete rulebase security rules LAN-OUT to untrust', 'set rulebase security rules LAN-OUT to trust'],
              fix: C(['delete rulebase security rules LAN-OUT from untrust', 'set rulebase security rules LAN-OUT from trust', 'delete rulebase security rules LAN-OUT to trust', 'set rulebase security rules LAN-OUT to untrust']) },
            { key: 'order', start: ['set rulebase security rules GECICI-ENGEL from trust to untrust source any destination any application any service any action deny', 'move rulebase security rules GECICI-ENGEL top'], fix: C(['delete rulebase security rules GECICI-ENGEL']) },
        ],
        story: '<b>Arıza kaydı:</b> "Bakım gecesinden sonra LAN\'daki kimse internete çıkamıyor." Beklenen: trust (ethernet1/2, 10.64.10.0/24) → untrust (ethernet1/1) web ve DNS izinli, kaynak adres WAN arayüzüne çevriliyor (SNAT). Zinciri katman katman kontrol edin: zone → rota → güvenlik kuralı → NAT. <small>Her turda farklı arıza — "Yeni tur".</small>',
        lesson: L('Bir paketin yolu PAN-OS\'ta sırayla: giriş arayüzünün <b>zone</b>\'u → sanal yönlendiricide <b>rota</b> (çıkış arayüzü ve hedef zone) → <b>NAT kuralı</b> araması (pre-NAT değerlerle) → <b>güvenlik kuralı</b> araması → izin varsa NAT uygulanır. Her halkanın test komutu vardır: <code>test routing fib-lookup</code>, <code>test security-policy-match</code>, <code>test nat-policy-match</code>; arayüzün zone\'u <code>show interface</code>\'ta görünür.',
            'Belirti hep aynıdır ("internet yok") ama kök neden farklı katmandadır. Test komutları trafiği beklemeden her katmanı ayrı ayrı sınar; tahmin yerine kanıtla ilerlemek arızayı dakikalar içinde bulur.',
            'show interface ethernet1/2                      # zone atanmış mı?\ntest routing fib-lookup virtual-router default ip 198.51.100.80\n' + TSP + '\ntest nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6',
            ['Tüm kuralları silip "any any allow" yazmak.', 'NAT kuralını güvenlik kuralının yerine koymak (ikisi ayrı katman).', 'Geçici engel kuralını en üstte unutmak.']),
        goals: ['Zone / rota / kural / NAT katmanlarını ayrı sınamak', 'Kök nedeni kanıtla seçmek', 'Tek değişiklik ve doğrulama'],
        tasks: [
            { t: 'Belirti: rota ve güvenlik kuralı eşleşmesini test edin.', why: 'fib-lookup çıkış arayüzünü, security-policy-match eşleşen kuralı gösterir; ikisi arızanın hangi katmanda olduğunu hemen daraltır.',
              hints: ['test routing fib-lookup … / test security-policy-match …', '<code>test routing fib-lookup virtual-router default ip 198.51.100.80</code> → <code>' + TSP + '</code>'],
              steps: ['test routing fib-lookup virtual-router default ip 198.51.100.80', TSP],
              check: s => s.ev.ran(/^test routing fib-lookup/) && s.ev.ran(/^test security-policy-match/) },
            { t: 'Kök neden hangisi?', ask: { choices: [['nat', 'Kaynak NAT kuralı yok'], ['zone', 'LAN arayüzü (ethernet1/2) hiçbir zone\'da değil'], ['route', 'Varsayılan rota yok'], ['rulezone', 'LAN-OUT kuralının zone yönü ters (untrust → trust)'], ['order', 'Üstte geçici bir engelleme kuralı var']], correct: v => v.key },
              why: 'fib-lookup sonuç vermiyorsa: rota. security-policy-match bir deny kuralı gösteriyorsa: sıra. Hiç kural eşleşmiyorsa: kural yönü. Kural eşleşiyor ama NAT eşleşmiyorsa: NAT. Arayüzün zone\'u boşsa: zone.',
              hints: ['test nat-policy-match … / show interface ethernet1/2', 'Hangi test beklenmeyen sonuç verdi?'],
              steps: v => ['test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6', 'show interface ethernet1/2', { answer: 1, v: v.key }], needs: [0] },
            { t: 'Tek değişiklikle düzeltin ve commit edin: LAN internete SNAT ile çıksın.', why: 'Yalnız bozulan halkayı onarın; "any any allow" gibi kaçamaklar güvenliği kaldırır.',
              hints: ['Kök nedene göre tek değişiklik.', 'nat: SNAT kuralı · zone: zone\'a ethernet1/2 · route: DEFAULT rota · rulezone: yanlış zone\'u <code>delete … from untrust</code> ile çıkarıp doğrusunu ekleyin (set listeye ekler) · order: GECICI-ENGEL\'i silin'],
              steps: v => v.fix, check: s => outOk(s),
              fb: s => (s.rules().some(n => arr(s, 'rulebase security rules ' + n + ' application').includes('any') && s.val('rulebase security rules ' + n + ' action') === 'allow') ? 'application any + allow kuralı eklendi: arıza kapandı ama güvenlik kalktı.' : null) },
            { t: 'Doğrulayın: kural ve NAT testleri beklenen sonucu vermeli.', why: 'Commit\'ten sonra aynı testler, kaydı kapatmanın kanıtıdır.',
              hints: ['Aynı test komutları', 'security-policy-match → LAN-OUT; nat-policy-match → SNAT'], needs: [2], loo: false, /* 1. görevle aynı komut */
              steps: [TSP, 'test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6'],
              check: s => { const c = lastIdx(s, e => e.commit === 'ok' || e.canon === 'commit'), i = lastIdx(s, e => e.canon && /^test nat-policy-match/.test(e.canon)); return i > c && c >= 0 && outOk(s); } },
        ],
        verify: ['test routing fib-lookup virtual-router default ip 198.51.100.80', TSP, 'show interface ethernet1/2'],
        learn: ['Zincir: zone → rota → NAT araması → güvenlik kuralı → NAT uygulaması.', 'Her halkanın test komutu var.', 'NAT ve güvenlik kuralı ayrı katmanlar.', 'Geçici kuralları kaldırmayı unutmayın.'],
        links: { tool: '#/paloalto/security', cli: '#/cli/paloalto', wizard: '#/troubleshoot/traffic' }, cert: 'NGFW Engineer · Troubleshooting'
    },
    ];
    // Çoktan seçmeli (ask) görevler ve adımlardan türetilen örnek çözüm (paloalto.js ile aynı kural)
    LABS.forEach(l => l.tasks.forEach((t, i) => {
        if (!t.ask) return;
        const key = l.id + ':' + i, want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
        t.check = s => !!s.answers && s.answers[key] === want(s.variant && s.variant());
        t.steps = t.steps || (v => [{ answer: i, v: want(v) }]);
    }));
    LABS.forEach(l => {
        if (l.solution || l.sandbox) return;
        l.solution = v => [].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps));
    });
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
