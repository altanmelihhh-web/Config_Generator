'use strict';
// ─── CLI Lab: Palo Alto öğrenme yolu lab'ları (PAN-OS 11.1 görünümü) ─────────
// paloalto.js'teki temel ve NAT/teşhis lab'larını tamamlar: yönetim sıkılaştırma, sistem servisleri,
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
    // pan-09 / pan-14 yardımcıları
    const GOUT = { src: '10.64.20.50', dst: '198.51.100.80', dport: 443, app: 'ssl' }, GIN = { src: '10.64.20.50', dst: '10.64.10.50', dport: 443, app: 'ssl' };
    const GTEST = 'test security-policy-match from guest to untrust source 10.64.20.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl';
    const FIB = 'test routing fib-lookup virtual-router default ip 198.51.100.80';
    const subOk = (s, n, tag, ip, zone) => { const x = s.iface(n); return !!x && x.tag === tag && x.ips.includes(ip) && x.zone === zone && x.vr === 'default'; };
    const getSnatIf = d => { const r = d.snat && d.snat.st; const g = r && r.get && r.get('dynamic-ip-and-port'); const ia = g && g.get('interface-address'); return ia ? ia.get('interface') : null; };
    const lastFib = s => { const L = s.ev.list(); for (let i = L.length - 1; i >= 0; i--) if (L[i].fib) return L[i].fib.iface; return null; };
    const outOk = s => { const d = s.decide(OUT); return d.stage === 'allowed' && !!d.snat && d.rule === 'LAN-OUT'; };

    const LABS = [
    // ═══ Yönetim erişimini sıkılaştırma ═══
    {
        id: 'pan-07', vendor: 'paloalto', level: 1, title: 'Yönetim erişimini sıkılaştırma', minutes: 20, kind: 'firewall', hostname: 'PA-SUBE', pre: ['pan-02'],
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
        links: { tool: '#/paloalto/admin', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Device Settings'
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
        links: { tool: '#/paloalto/devsetup', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Device Settings'
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
        links: { tool: '#/paloalto/secprofilegroup', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst · Security Profiles'
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
        links: { tool: '#/paloalto/policy', cli: '#/cli/paloalto', wizard: '#/troubleshoot/traffic' }, cert: 'NGFW Engineer · Troubleshooting'
    },
    // ═══ Alt arayüzler (802.1Q) ═══
    {
        id: 'pan-09', vendor: 'paloalto', level: 1, title: 'Alt arayüzler: tek porttan misafir ve IoT VLAN\'ları', minutes: 25, kind: 'firewall', hostname: 'PA-A', pre: ['pan-02'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3', 'ethernet1/4'], hosts: ['203.0.113.1', '198.51.100.80', '10.64.20.10', '10.64.30.10'],
        start: BASE.concat(OUT_OK),
        story: 'Kat switch\'inden gelen trunk <code>ethernet1/4</code>\'e takıldı; iki VLAN taşıyor: <b>VLAN 20 misafir</b> <code>10.64.20.0/24</code> ve <b>VLAN 30 IoT</b> <code>10.64.30.0/24</code>. Güvenlik duvarı her iki ağın ağ geçidi (<code>.1</code>) olacak. Misafirler yalnız internete (web ve DNS) çıkabilmeli, iç ağa (trust) erişememeli.',
        lesson: L('PAN-OS\'ta 802.1Q alt arayüzü fiziksel arayüzün <code>layer3 units</code> altında tanımlanır: ad <code>ethernet1/4.20</code>, etiket <code>tag 20</code>. Etiket ile ad sonundaki sayı aynı olmak zorunda değildir ama aynı tutmak okumayı kolaylaştırır. Her alt arayüz ayrı bir mantıksal arayüzdür: kendi IP\'si, zone\'u ve sanal yönlendiricisi olur. Zone ayrı olunca VLAN\'lar arası trafik de güvenlik kuralından geçer.',
            'Az portla çok segment: misafir, IoT ve kurum ağları tek kabloyla gelir ama güvenlik duvarında ayrı zone\'lardır. Zone\'lar arasında kural yoksa trafik interzone-default ile reddedilir; misafir ağı iç ağdan kendiliğinden ayrılmış olur.',
            'set network interface ethernet ethernet1/4 layer3 units ethernet1/4.20 tag 20 ip 10.64.20.1/24\nset zone guest network layer3 ethernet1/4.20\nset network virtual-router default interface ethernet1/4.20\nset rulebase security rules GUEST-WEB from guest to untrust source 10.64.20.0/24 destination any application [ ssl web-browsing dns ] service application-default action allow\nset rulebase nat rules GUEST-SNAT from guest to untrust source 10.64.20.0/24 destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1\ncommit',
            ['Etiketi (tag) yazmayı unutmak: commit hata verir.', 'Alt arayüzü zone\'a ya da sanal yönlendiriciye eklememek: arayüz trafik işlemez.', 'Misafir ağını trust zone\'una koymak: iç ağdan ayrım kalmaz.', 'Kaynak NAT kuralını misafir ağına genişletmeyi unutmak: kural izin verse de internete çıkılamaz.', 'Switch tarafında trunk\'ta VLAN\'a izin vermemek.']),
        goals: ['Alt arayüz ve 802.1Q etiketi', 'Alt arayüz için zone ve sanal yönlendirici', 'Misafir → internet kuralı ve NAT', 'Misafirden iç ağa erişimin kapalı olduğunu kanıtlamak'],
        tasks: [
            { t: '<b>VLAN 20 (misafir):</b> <code>ethernet1/4.20</code> alt arayüzünü etiket <code>20</code> ve <code>10.64.20.1/24</code> ile oluşturun; <code>guest</code> zone\'una ve <code>default</code> sanal yönlendiriciye ekleyip commit edin.',
              why: 'Alt arayüz fiziksel arayüzün altında tanımlanır; zone ve sanal yönlendirici üyeliği ayrıca verilir. Üçü birden olmadan arayüz trafik işlemez.',
              hints: ['layer3 units … tag … ip …; zone guest; virtual-router interface; commit', '<code>set network interface ethernet ethernet1/4 layer3 units ethernet1/4.20 tag 20 ip 10.64.20.1/24</code> · <code>set zone guest network layer3 ethernet1/4.20</code> · <code>set network virtual-router default interface ethernet1/4.20</code>'],
              steps: C(['set network interface ethernet ethernet1/4 layer3 units ethernet1/4.20 tag 20 ip 10.64.20.1/24', 'set zone guest network layer3 ethernet1/4.20', 'set network virtual-router default interface ethernet1/4.20']),
              check: s => subOk(s, 'ethernet1/4.20', '20', '10.64.20.1/24', 'guest') },
            { t: '<b>VLAN 30 (IoT):</b> aynısını <code>ethernet1/4.30</code>, etiket <code>30</code>, <code>10.64.30.1/24</code> ve zone <code>iot</code> ile yapın.',
              why: 'IoT cihazları ayrı zone\'da olunca hem internete hem iç ağa erişimleri ayrı kurallarla sınırlanır. Bu lab\'da IoT için kural yazılmıyor: interzone-default her şeyi reddeder.',
              hints: ['VLAN 20 ile aynı üç komut.', '<code>… units ethernet1/4.30 tag 30 ip 10.64.30.1/24</code> · <code>set zone iot network layer3 ethernet1/4.30</code> · <code>… virtual-router default interface ethernet1/4.30</code>'],
              steps: C(['set network interface ethernet ethernet1/4 layer3 units ethernet1/4.30 tag 30 ip 10.64.30.1/24', 'set zone iot network layer3 ethernet1/4.30', 'set network virtual-router default interface ethernet1/4.30']),
              check: s => subOk(s, 'ethernet1/4.30', '30', '10.64.30.1/24', 'iot') },
            { t: 'Alt arayüzleri doğrulayın: mantıksal arayüz listesine bakın ve her VLAN\'daki bir istemciye alt arayüzün IP\'sinden ping atın.', why: '<code>show interface logical</code> alt arayüzleri zone, sanal yönlendirici ve <b>tag</b> sütunuyla gösterir. Kaynak verilmezse ping yönetim portundan çıkar; veri arayüzünü sınamak için <code>source</code> gerekir.',
              hints: ['show interface logical; ping source … host …', '<code>show interface logical</code> → <code>ping source 10.64.20.1 host 10.64.20.10</code> → <code>ping source 10.64.30.1 host 10.64.30.10</code>'],
              steps: ['show interface logical', 'ping source 10.64.20.1 host 10.64.20.10', 'ping source 10.64.30.1 host 10.64.30.10'], needs: [0, 1],
              check: s => s.ev.ran(/^show interface logical$/) && ['10.64.20.10', '10.64.30.10'].every(ip => s.ev.list().some(e => e.ping && e.ping.ip === ip && e.ping.ok)) },
            { t: 'Soru: commit başarılı, arayüzler listede. Ama VLAN 20\'deki istemci ağ geçidine (<code>10.64.20.1</code>) ping atamıyor. İlk nereye bakarsınız?', ask: { choices: [['trunk', 'Switch portu: trunk mı, VLAN 20 izinli ve etiketli mi'], ['nat', 'NAT kuralı'], ['rule', 'guest → untrust güvenlik kuralı'], ['license', 'Lisans']], correct: 'trunk' },
              why: 'Ağ geçidine erişim aynı VLAN içindedir; NAT ve zone\'lar arası kural devreye girmez. Etiketli çerçeve hiç gelmiyorsa sorun kablonun öbür ucundadır: switch portu access modda ya da VLAN trunk\'ta izinli değil.',
              hints: ['Aynı ağ içindeki trafik hangi kurallardan geçer?', 'Etiketli çerçeveyi kim gönderiyor?'] },
            { t: 'Misafirlerin internete çıkmasına izin verin: <code>GUEST-WEB</code> kuralı (guest → untrust, kaynak <code>10.64.20.0/24</code>, uygulamalar <code>ssl web-browsing dns</code>, servis application-default) ve <code>GUEST-SNAT</code> kaynak NAT kuralı (ethernet1/1 adresine).',
              why: 'Kural izin verir, NAT çevirir: ikisi ayrı katmandır. Özel adresle çıkan paketin dönüşü gelmez; misafir ağı mevcut SNAT kuralında (yalnız LAN-NET) yoktur.',
              hints: ['rulebase security rules GUEST-WEB …; rulebase nat rules GUEST-SNAT … dynamic-ip-and-port interface-address interface ethernet1/1', '<code>set rulebase security rules GUEST-WEB from guest to untrust source 10.64.20.0/24 destination any application [ ssl web-browsing dns ] service application-default action allow</code> · <code>set rulebase nat rules GUEST-SNAT from guest to untrust source 10.64.20.0/24 destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1</code>'],
              steps: C(['set rulebase security rules GUEST-WEB from guest to untrust source 10.64.20.0/24 destination any application [ ssl web-browsing dns ] service application-default action allow',
                  'set rulebase nat rules GUEST-SNAT from guest to untrust source 10.64.20.0/24 destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1']), needs: [0],
              check: s => { const d = s.decide(GOUT); return d.stage === 'allowed' && d.rule === 'GUEST-WEB' && !!d.snat; },
              fb: s => { const d = s.decide(GIN); return d.stage === 'allowed' ? 'Çalışır ama misafir ağı iç ağa (trust) da erişebiliyor: kuralın hedef zone\'u yalnız untrust olmalı.' : (s.decide(Object.assign({}, GOUT, { dport: 22, app: 'ssh' })).stage === 'allowed' ? 'Çalışır ama misafirler ssh gibi istenmeyen uygulamalarla da çıkabiliyor: application any kullanmayın.' : null); } },
            { t: 'Kanıtlayın: misafirden internete https izinli, misafirden iç ağdaki bir sunucuya (<code>10.64.10.50</code>) erişim reddediliyor.', why: 'İkinci test, kuralın fazlasını açmadığının kanıtıdır. guest → trust için kural olmadığından "No rule matched" ve interzone-default (deny) beklenir.',
              hints: ['İki test security-policy-match', '<code>test security-policy-match from guest to untrust source 10.64.20.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl</code> → <code>… from guest to trust … destination 10.64.10.50 …</code>'],
              steps: [GTEST, 'test security-policy-match from guest to trust source 10.64.20.50 destination 10.64.10.50 destination-port 443 protocol 6 application ssl'], needs: [0, 4],
              check: s => s.ev.list().some(e => e.sectest && e.sectest.to === 'untrust' && e.sectest.src === '10.64.20.50' && e.res === 'GUEST-WEB') && s.ev.list().some(e => e.sectest && e.sectest.to === 'trust' && e.sectest.src === '10.64.20.50' && e.res === null) },
        ],
        verify: ['show interface logical', 'show interface ethernet1/4.20', GTEST],
        learn: ['Alt arayüz: layer3 units ethernetX/Y.N tag N.', 'Her alt arayüz ayrı zone ve sanal yönlendirici üyeliği ister.', 'Zone\'lar arası kural yoksa interzone-default reddeder.', 'Yeni ağ için NAT kuralını da güncelleyin.'],
        links: { tool: '#/paloalto/interface', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/110' }, cert: 'Network Security Analyst · Interfaces'
    },
    // ═══ Yedek hat: ikinci ISP, metrik ve NAT to-interface ═══
    {
        id: 'pan-14', vendor: 'paloalto', level: 3, title: 'Yedek internet hattı: metrik, hat kopması ve NAT to-interface', minutes: 25, kind: 'firewall', hostname: 'PA-A', pre: ['pan-04'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3', 'ethernet1/4'], hosts: ['203.0.113.1', '198.51.100.1', '198.51.100.80'],
        start: BASE.concat(OUT_OK, ['set rulebase nat rules SNAT to-interface ethernet1/1']),
        story: 'İkinci bir internet hattı (ISP2) <code>ethernet1/4</code>\'e bağlandı: adres <code>198.51.100.2/28</code>, ağ geçidi <code>198.51.100.1</code>. ISP1 (<code>ethernet1/1</code>, ağ geçidi <code>203.0.113.1</code>) birincil kalacak; ISP1 koparsa trafik ISP2\'den çıkmalı. Mevcut SNAT kuralı yalnız ISP1 arayüzüne (<code>to-interface ethernet1/1</code>) bağlı.',
        lesson: L('Aynı hedefe birden çok statik rota olduğunda sanal yönlendirici önce yönetsel mesafeye, eşitse <b>metriğe</b> bakar: küçük metrik kazanır. Birincil rota metrik 10, yedek 20 olunca yedek yalnız birincil rota tablodan düşünce kullanılır. Rota, çıkış arayüzü düştüğünde düşer. Hat bağlı kalıp ötesi koparsa rota düşmez; bunun için <b>path monitoring</b> gerekir. NAT kuralındaki <code>to-interface</code>, kuralı belirli bir çıkış arayüzüne bağlar: yedek hat için ayrı bir NAT kuralı gerekir.',
            'Yedek hat kurulur ama ilk kopmada test edilmemiş NAT ya da zone yüzünden çalışmaz. Kopmayı kontrollü biçimde deneyip her katmanı (rota, zone, NAT) doğrulamak, gerçek arızada sürprizi önler.',
            'set network virtual-router default routing-table ip static-route BACKUP destination 0.0.0.0/0 metric 20 nexthop ip-address 198.51.100.1\nset rulebase nat rules SNAT-ISP2 from trust to untrust to-interface ethernet1/4 source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/4\ntest routing fib-lookup virtual-router default ip 198.51.100.80',
            ['Yedek rotayı birincille aynı metrikle yazmak: iki hat birden kullanılır (ECMP açık değilse biri seçilir, hangisi olduğu belirsizleşir).', 'Yedek hattın arayüzünü zone\'a ya da sanal yönlendiriciye eklememek.', 'NAT kuralını yalnız birincil arayüze bağlayıp yedeği unutmak.', 'Hat bağlı kalıp ISP tarafı koptuğunda rotanın düşeceğini sanmak.', '<code>metric</code>\'i <code>nexthop ip-address …</code>\'tan sonra yazmak: CLI nexthop kapsayıcısının içinde kalır ve "Invalid syntax" verir. Önce metric, sonra nexthop yazın (ya da iki ayrı set komutu).']),
        goals: ['İkinci WAN arayüzü', 'Metrikle yedek rota', 'Hat kopmasını denemek ve FIB\'i izlemek', 'NAT to-interface ile yedek hat NAT\'ı', 'Path monitoring ihtiyacı'],
        tasks: [
            { t: 'ISP2 arayüzünü hazırlayın: <code>ethernet1/4</code> = <code>198.51.100.2/28</code>, zone <code>untrust</code>, sanal yönlendirici <code>default</code>; commit.',
              why: 'Yedek hat da internet tarafıdır: aynı untrust zone\'una girer, böylece mevcut güvenlik kuralları iki hatta da geçerli olur.',
              hints: ['layer3 ip; zone untrust network layer3; virtual-router interface; commit', '<code>set network interface ethernet ethernet1/4 layer3 ip 198.51.100.2/28</code> · <code>set zone untrust network layer3 ethernet1/4</code> · <code>set network virtual-router default interface ethernet1/4</code>'],
              steps: C(['set network interface ethernet ethernet1/4 layer3 ip 198.51.100.2/28', 'set network interface ethernet ethernet1/4 comment ISP2', 'set zone untrust network layer3 ethernet1/4', 'set network virtual-router default interface ethernet1/4']),
              check: s => { const x = s.iface('ethernet1/4'); return !!x && x.ips.includes('198.51.100.2/28') && x.zone === 'untrust' && x.vr === 'default'; } },
            { t: 'Yedek varsayılan rota <code>BACKUP</code>: <code>0.0.0.0/0</code> → <code>198.51.100.1</code>, <b>metrik 20</b>; commit. Birincil rota (DEFAULT) metrik 10 ile etkin kalmalı.',
              why: 'Metrik belirtilmezse varsayılan 10\'dur; iki rota eşit olur. 20 verince yedek yalnız birincil düşünce kullanılır. Sıra önemli: <code>nexthop ip-address …</code> bir kapsayıcıdır, arkasına yazılan <code>metric</code> onun içinde aranır ve reddedilir.',
              hints: ['static-route BACKUP … metric 20', '<code>set network virtual-router default routing-table ip static-route BACKUP destination 0.0.0.0/0 metric 20 nexthop ip-address 198.51.100.1</code>'],
              steps: C(['set network virtual-router default routing-table ip static-route BACKUP destination 0.0.0.0/0 metric 20 nexthop ip-address 198.51.100.1']), needs: [0],
              check: s => s.val('network virtual-router default routing-table ip static-route BACKUP metric') === '20' && (s.route('198.51.100.80') || {}).iface === 'ethernet1/1',
              fb: s => (s.val('network virtual-router default routing-table ip static-route BACKUP metric') === undefined ? 'BACKUP rotasının metriği yok (varsayılan 10): birincille eşit.' : null) },
            { t: 'Statik rotaları görün ve internet için hangi hattın seçildiğini FIB\'e sorun.', why: '<code>show routing route type static</code>\'da iki varsayılan rota görünür; <b>A</b> bayrağı etkin olanı gösterir. <code>fib-lookup</code> gerçek yönlendirme kararıdır.',
              hints: ['show routing route type static; test routing fib-lookup …', '<code>show routing route type static</code> → <code>test routing fib-lookup virtual-router default ip 198.51.100.80</code>'],
              steps: ['show routing route type static', FIB], needs: [0, 1], loo: false, /* sonraki görevlerde aynı fib-lookup */
              check: s => s.ev.ran(/^show routing route type static$/) && s.ev.list().some(e => e.fib && e.fib.ip === '198.51.100.80' && e.fib.iface === 'ethernet1/1') },
            { t: 'Kopmayı deneyin: ISP1 arayüzünü yönetimsel olarak kapatın (<code>link-state down</code>), commit edin ve FIB\'e yeniden sorun.', why: 'Bakım penceresinde kontrollü kopma, yedeğin gerçekten çalıştığını gösterir. Arayüz düşünce DEFAULT rotası tablodan çıkar, BACKUP etkin olur.',
              hints: ['set network interface ethernet ethernet1/1 link-state down; commit; fib-lookup', '<code>set network interface ethernet ethernet1/1 link-state down</code> → commit → <code>' + FIB + '</code>'],
              steps: C(['set network interface ethernet ethernet1/1 link-state down']).concat([FIB]), needs: [0, 1],
              check: s => s.val('network interface ethernet ethernet1/1 link-state') === 'down' && s.ev.list().some(e => e.fib && e.fib.ip === '198.51.100.80' && e.fib.iface === 'ethernet1/4') },
            { t: 'Rota yedeğe geçti ama LAN yine internete çıkamıyor. NAT testini yapın ve yedek hat için <code>SNAT-ISP2</code> kuralını (to-interface <code>ethernet1/4</code>, çeviri ethernet1/4 adresine) ekleyip commit edin.',
              why: 'SNAT kuralı <code>to-interface ethernet1/1</code> ile birincil hatta bağlı: yedek hattan çıkan trafik çevrilmez ve özel adresle internete gider. Yedek hat için ayrı bir kural, kendi arayüz adresiyle çevirir.',
              hints: ['test nat-policy-match … to-interface ethernet1/4; set rulebase nat rules SNAT-ISP2 …', '<code>set rulebase nat rules SNAT-ISP2 from trust to untrust to-interface ethernet1/4 source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/4</code>'],
              steps: ['test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 to-interface ethernet1/4'].concat(C(['set rulebase nat rules SNAT-ISP2 from trust to untrust to-interface ethernet1/4 source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/4'])), needs: [0, 1, 3],
              check: s => { const d = s.decide(OUT); return d.stage === 'allowed' && !!d.snat && d.outIf === 'ethernet1/4' && getSnatIf(d) === 'ethernet1/4'; },
              fb: s => (s.val('rulebase nat rules SNAT to-interface') === undefined ? 'Çalışır ama SNAT kuralının to-interface\'i kaldırıldı: ISP2\'den çıkan trafik ISP1 adresine çevrilir ve dönüş gelmez.' : null) },
            { t: 'ISP1\'i geri açın (link-state\'i kaldırın), commit edin ve trafiğin birincil hatta döndüğünü FIB ile doğrulayın.', why: 'Bakım sonrası eski hâle dönmek de testin parçasıdır. <code>delete … link-state</code> varsayılana (auto) döndürür.',
              hints: ['delete network interface ethernet ethernet1/1 link-state; commit; fib-lookup', '<code>delete network interface ethernet ethernet1/1 link-state</code> → commit → <code>' + FIB + '</code>'],
              steps: C(['delete network interface ethernet ethernet1/1 link-state']).concat([FIB]), needs: [0, 1, 3], loo: false,
              check: s => s.val('network interface ethernet ethernet1/1 link-state') !== 'down' && (s.route('198.51.100.80') || {}).iface === 'ethernet1/1' && lastFib(s) === 'ethernet1/1' && s.ev.list().some(e => e.fib && e.fib.iface === 'ethernet1/4') },
            { t: 'Soru: ISP1 modemi açık ve kablo bağlı (link up), ama ISP\'nin ötesi kopuk. Yedek rota devreye girer mi?', ask: { choices: [['pm', 'Hayır: arayüz up kaldıkça DEFAULT rotası tabloda kalır; ağ geçidinin ötesini izlemek için rotaya path monitoring eklenmeli'], ['yes', 'Evet: sanal yönlendirici hattın çalışmadığını kendiliğinden anlar'], ['nat', 'Yalnız SNAT-ISP2 kuralı varsa'], ['metric', 'BACKUP metriği 10 yapılırsa']], correct: 'pm' },
              why: 'Statik rota yalnız çıkış arayüzü düşünce tablodan çıkar. Path monitoring belirlenen hedeflere düzenli ping atar; yanıt gelmezse rotayı tablodan çıkarır ve yedek devreye girer.',
              hints: ['Rota hangi durumda tablodan çıkıyordu?', 'Hattın ötesini kim sınar?'] },
        ],
        verify: ['show routing route type static', FIB, 'test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 to-interface ethernet1/4'],
        learn: ['Küçük metrik kazanır; yedek rotaya büyük metrik verin.', 'Arayüz düşünce rota düşer; hattın ötesi için path monitoring.', 'NAT to-interface: her çıkış hattına kendi NAT kuralı.', 'Kopmayı kontrollü deneyin, sonra geri alın.'],
        links: { tool: '#/paloalto/staticroute', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/111' }, cert: 'Network Security Analyst · Routing'
    },
    // ═══ HA: durum, config eşitleme, kontrollü failover ═══
    {
        id: 'pan-15', vendor: 'paloalto', level: 4, title: 'HA (aktif/pasif): durum okuma, config eşitleme ve kontrollü failover', minutes: 20, kind: 'firewall', hostname: 'PA-A', pre: ['pan-04'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], start: BASE.concat(OUT_OK),
        sim: { ha: { peer: 'PA-B', peerIp: '192.0.2.11', pri: 100, peerPri: 110, preempt: false, active: true, synced: false } },
        story: '<b>PA-A</b> ve <b>PA-B</b> aktif/pasif HA çifti. Bu gece PA-A\'ya bakım yapılacak: trafiği kontrollü biçimde PA-B\'ye devredin. Dikkat: dün PA-A\'da yapılan bir değişiklikten sonra yapılandırma eşitlemesi tamamlanmamış olabilir.',
        lesson: L('Aktif/pasif HA\'da bir cihaz trafiği taşır (<b>active</b>), diğeri bekler (<b>passive</b>). Oturum tablosu HA2 bağlantısıyla, yapılandırma ise commit sonrası eşitlenir. <b>Priority</b>: <u>küçük sayı daha yüksek önceliktir</u>. <b>Preemptive</b> kapalıysa (varsayılan) öncelikli cihaz geri dönünce aktifliği geri almaz. Kontrollü failover için aktif cihaz <code>request high-availability state suspend</code> ile askıya alınır, bakım sonrası <code>functional</code> ile geri alınır.',
            'Failover\'dan önce yapılandırmanın eşit olduğundan emin olmak şarttır: eşitlenmemişse pasif cihaz eski kurallarla aktif olur ve son değişiklik bir anda kaybolmuş gibi görünür.',
            'show high-availability state\nrequest high-availability sync-to-remote running-config\nrequest high-availability state suspend\nshow high-availability state\nrequest high-availability state functional',
            ['"Running Configuration: not synchronized" görmeden failover yapmak.', 'Priority değerinde büyük sayıyı öncelikli sanmak.', 'Askıya alınan cihazı bakım sonrası functional yapmayı unutmak: çift yedeksiz kalır.', 'Preemptive kapalıyken cihazın geri dönünce aktif olmamasını arıza sanmak.']),
        goals: ['show high-availability state okumak', 'Priority ve preemptive', 'Config eşitlemesi', 'suspend / functional ile kontrollü failover'],
        tasks: [
            { t: 'HA durumunu görüntüleyin.', why: 'Tek komutla yerel ve eş cihazın durumu, öncelikleri, preemptive ayarı ve yapılandırma eşitleme durumu görünür.',
              hints: ['show high-availability …', '<code>show high-availability state</code>'], steps: ['show high-availability state'], loo: false, /* sonraki doğrulama aynı komut */
              check: s => s.ev.ran(/^show high-availability state$/) },
            { t: 'Soru: bu cihazın (PA-A, priority 100) ve eşin (PA-B, priority 110) hangisi HA önceliğinde üstün?', ask: { choices: [['a', 'PA-A: PAN-OS\'ta küçük sayı daha yüksek önceliktir'], ['b', 'PA-B: büyük sayı daha yüksek önceliktir'], ['eq', 'İkisi eşit; öncelik yalnız preemptive açıkken anlamlıdır']], correct: 'a' },
              why: 'PAN-OS HA önceliğinde küçük değer kazanır (0 en yüksek). Öncelik, iki cihaz aynı anda açıldığında ve preemptive açıksa geri dönüşte hangisinin aktif olacağını belirler.',
              hints: ['PAN-OS\'ta öncelik sayısı nasıl yorumlanır?', 'Cisco HSRP\'nin tersidir.'] },
            { t: 'Yapılandırma eşit değil. Failover\'dan önce çalışan yapılandırmayı eşe gönderin ve eşitlendiğini doğrulayın.', why: 'Eşitlenmemiş yapılandırmayla failover, PA-B\'yi eski kurallarla aktif yapar. Önce eşitle, sonra devret.',
              hints: ['request high-availability sync-to-remote …; show high-availability state', '<code>request high-availability sync-to-remote running-config</code> → <code>show high-availability state</code>'],
              steps: ['request high-availability sync-to-remote running-config', 'show high-availability state'],
              check: s => s.ha().synced && s.ev.after(/^request high-availability sync-to-remote running-config$/, /^show high-availability state$/) },
            { t: 'Kontrollü failover: PA-A\'yı askıya alın ve PA-B\'nin aktif olduğunu doğrulayın.', why: 'Askıya alınan cihaz trafik taşımaz ve eş aktif olur. Kablo çekmek ya da cihazı kapatmak yerine bu yöntem kullanılır; sonuç her zaman çıktıyla doğrulanır.',
              hints: ['request high-availability state suspend; show high-availability state', '<code>request high-availability state suspend</code> → <code>show high-availability state</code>'],
              steps: ['request high-availability state suspend', 'show high-availability state'], needs: [2],
              check: s => { const h = s.ha(); return h.local === 'suspended' && h.peer === 'active' && s.ev.list().some(e => e.hastate === 'suspended'); },
              fb: s => (s.ev.list().findIndex(e => e.ha === 'suspend') < s.ev.list().findIndex(e => e.ha === 'sync') || !s.ev.list().some(e => e.ha === 'sync') ? 'Çalışır ama failover yapılandırma eşitlenmeden yapıldı: PA-B son değişiklikleri içermiyor olabilir.' : null) },
            { t: 'Bakım bitti: PA-A\'yı yeniden işlevsel yapın.', why: '<code>functional</code> cihazı askıdan çıkarır ve çifte yeniden katar; aksi hâlde çift yedeksiz kalır.',
              hints: ['request high-availability state functional', '<code>request high-availability state functional</code>'], steps: ['request high-availability state functional'], needs: [2, 3],
              check: s => { const h = s.ha(); return h.local === 'passive' && h.peer === 'active'; } },
            { t: 'Soru: PA-A daha öncelikli ama geri dönünce <b>passive</b> kaldı. Neden?', ask: { choices: [['preempt', 'Preemptive kapalı: öncelikli cihaz geri dönünce aktifliği geri almaz, gereksiz ikinci kesinti olmaz'], ['broken', 'PA-A hâlâ arızalı'], ['sync', 'Yapılandırma eşit değil'], ['prio', 'Priority 100, 110\'dan düşük olduğu için']], correct: 'preempt' },
              why: 'Preemptive varsayılan olarak kapalıdır. Açık olsaydı PA-A (daha yüksek öncelik) functional olur olmaz aktifliği geri alırdı; bu ikinci bir failover demektir. Çoğu kurulumda kapalı tutulur.',
              hints: ['Çıktıdaki Preemptive satırı.', 'Geri dönüşte ikinci bir failover istenir mi?'] },
        ],
        verify: ['show high-availability state', 'show high-availability all'],
        learn: ['PAN-OS HA: küçük priority = yüksek öncelik.', 'Failover öncesi Running Configuration: synchronized olmalı.', 'suspend → eş aktif; functional → geri katıl.', 'Preemptive kapalıysa geri dönen cihaz passive kalır.'],
        links: { cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/112' }, cert: 'Network Security Engineer · HA'
    },
    // ═══ Log iletimi: syslog profili, log iletim profili, sistem/config logları ═══
    {
        id: 'pan-11', vendor: 'paloalto', level: 4, title: 'Log iletimi: syslog profili, log iletim profili ve kurala bağlama', minutes: 25, kind: 'firewall', hostname: 'PA-A', pre: ['pan-04'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], hosts: ['203.0.113.1', '198.51.100.80'], start: BASE.concat(OUT_OK),
        sim: { mgmtReach: ['10.240.0.20'], flows: [{ src: '10.64.10.50', dst: '198.51.100.80', dport: 443, app: 'ssl' }, { src: '10.64.10.61', dst: '198.51.100.80', dport: 22, app: 'ssh' }] },
        story: 'Güvenlik ekibi güvenlik duvarının loglarını SIEM toplayıcısına (<code>10.240.0.20</code>, UDP 514, yönetim ağında) istiyor: internet çıkış kuralının trafik ve tehdit logları, ayrıca sistem ve yapılandırma (config) logları. Toplayıcı yönetim arayüzünden (MGT) erişilebilir.',
        lesson: L('PAN-OS\'ta log iletimi üç parçadır. (1) <b>Syslog sunucu profili</b>: nereye ve nasıl (<code>shared log-settings syslog</code>: sunucu, taşıma, port, biçim, facility). (2) <b>Log iletim profili</b>: hangi log tipleri nereye (<code>shared log-settings profiles … match-list … log-type … send-syslog …</code>). (3) <b>Bağlama</b>: profil güvenlik kuralına <code>log-setting</code> ile verilir; sistem ve config logları ise <code>shared log-settings system|config match-list</code> ile iletilir. Syslog varsayılan olarak yönetim arayüzünden (MGT) gönderilir; başka arayüzden gidecekse service route ayarlanır.',
            'Log iletilmezse olay incelemesinde elde yalnız cihazdaki sınırlı log kalır. Profil tanımlayıp kurala bağlamayı unutmak en sık hatadır: "SIEM\'e hiçbir şey gelmiyor" kaydının çoğu budur.',
            'set shared log-settings syslog SIEM server SIEM1 server 10.240.0.20 transport UDP port 514 format BSD facility LOG_USER\nset shared log-settings profiles LF-SIEM match-list TRAFFIC log-type traffic filter "All Logs" send-syslog SIEM\nset rulebase security rules LAN-OUT log-setting LF-SIEM\nset shared log-settings system match-list SYS filter "All Logs" send-syslog SIEM\ncommit\nshow log traffic direction equal backward',
            ['Log iletim profilini oluşturup kurala bağlamamak.', 'Varsayılan kuralların (interzone-default) logladığını sanmak: reddedilen trafik görünmez.', 'SIEM\'i yalnız veri ağından erişilebilir yapıp syslog\'un MGT\'den çıktığını unutmak.', 'log-end\'i kapatıp yalnız log-start bırakmak: oturumun uygulama ve byte bilgisi eksik kalır.', 'UDP syslog\'da iletimin garanti olmadığını unutmak (önemli loglar için TCP/SSL).']),
        goals: ['Syslog sunucu profili', 'Log iletim profili ve match-list', 'Profili kurala bağlamak', 'Sistem ve config logları', 'Varsayılan kuralların loglamadığını görmek'],
        tasks: [
            { t: 'SIEM için <code>SIEM</code> adlı syslog sunucu profili oluşturun: sunucu adı <code>SIEM1</code>, adres <code>10.240.0.20</code>, UDP, port 514, BSD biçimi, facility LOG_USER; commit.', why: 'Profil yalnız hedefi tanımlar; tek başına hiçbir log göndermez. Birden çok sunucu eklenebilir.',
              hints: ['shared log-settings syslog SIEM server SIEM1 server … transport … port … format … facility …', '<code>set shared log-settings syslog SIEM server SIEM1 server 10.240.0.20 transport UDP port 514 format BSD facility LOG_USER</code>'],
              steps: C(['set shared log-settings syslog SIEM server SIEM1 server 10.240.0.20 transport UDP port 514 format BSD facility LOG_USER']),
              check: s => s.val('shared log-settings syslog SIEM server SIEM1 server') === '10.240.0.20' && s.val('shared log-settings syslog SIEM server SIEM1 transport') === 'UDP' && s.val('shared log-settings syslog SIEM server SIEM1 port') === '514' },
            { t: '<code>LF-SIEM</code> log iletim profili: <code>TRAFFIC</code> eşleşme listesi (log-type traffic) ve <code>THREAT</code> eşleşme listesi (log-type threat), ikisi de filtre <code>"All Logs"</code> ile SIEM\'e; commit.', why: 'Her match-list bir log tipini bir ya da daha çok hedefe yollar. Filtreyle yalnız belirli kayıtlar (ör. yalnız reddedilenler) seçilebilir.',
              hints: ['shared log-settings profiles LF-SIEM match-list … log-type … filter "All Logs" send-syslog SIEM', '<code>set shared log-settings profiles LF-SIEM match-list TRAFFIC log-type traffic filter "All Logs" send-syslog SIEM</code> · <code>… match-list THREAT log-type threat …</code>'],
              steps: C(['set shared log-settings profiles LF-SIEM match-list TRAFFIC log-type traffic filter "All Logs" send-syslog SIEM', 'set shared log-settings profiles LF-SIEM match-list THREAT log-type threat filter "All Logs" send-syslog SIEM']), needs: [0],
              check: s => s.val('shared log-settings profiles LF-SIEM match-list TRAFFIC log-type') === 'traffic' && s.val('shared log-settings profiles LF-SIEM match-list THREAT log-type') === 'threat' && arr(s, 'shared log-settings profiles LF-SIEM match-list TRAFFIC send-syslog').includes('SIEM') },
            { t: 'Profili internet çıkış kuralına (<code>LAN-OUT</code>) bağlayın; commit.', why: 'Kurala bağlanmayan profil hiçbir şey iletmez. Kural loglarını oturum sonunda (log-end, varsayılan açık) yazar; kayıtta uygulama, byte ve bitiş nedeni olur.',
              hints: ['set rulebase security rules LAN-OUT log-setting …', '<code>set rulebase security rules LAN-OUT log-setting LF-SIEM</code>'], steps: C(['set rulebase security rules LAN-OUT log-setting LF-SIEM']), needs: [0, 1],
              check: s => (s.logFwd().rules['LAN-OUT'] || []).includes('traffic'),
              fb: s => (s.val('rulebase security rules LAN-OUT log-end') === 'no' ? 'Çalışır ama log-end kapalı: oturum sonu kaydı (uygulama, byte, bitiş nedeni) yazılmaz.' : s.val('rulebase security rules LAN-OUT log-start') === 'yes' ? 'Çalışır ama log-start açık: her oturum için ikinci bir kayıt üretir ve SIEM\'i gereksiz doldurur.' : null) },
            { t: 'Sistem ve yapılandırma (config) loglarını da SIEM\'e iletin: <code>SYS</code> ve <code>CFG</code> eşleşme listeleri, filtre "All Logs"; commit.', why: 'Giriş denemeleri, commit\'ler ve HA olayları sistem/config loglarındadır. Bu loglar kurala bağlı değildir; <code>shared log-settings system|config</code> altında iletilir.',
              hints: ['shared log-settings system match-list … / config match-list …', '<code>set shared log-settings system match-list SYS filter "All Logs" send-syslog SIEM</code> · <code>set shared log-settings config match-list CFG filter "All Logs" send-syslog SIEM</code>'],
              steps: C(['set shared log-settings system match-list SYS filter "All Logs" send-syslog SIEM', 'set shared log-settings config match-list CFG filter "All Logs" send-syslog SIEM']), needs: [0],
              check: s => { const f = s.logFwd(); return f.system && f.config; } },
            { t: 'Trafik loglarına en yeniden eskiye bakın.', why: '<code>show log traffic direction equal backward</code> son kayıtları önce gösterir. LAN-OUT\'a düşen https oturumu görünür. Aynı istemci grubundan denenen ssh oturumu ise görünmez: onu interzone-default reddetti ve varsayılan kurallar loglamaz.',
              hints: ['show log traffic direction equal …', '<code>show log traffic direction equal backward</code>'], steps: ['show log traffic direction equal backward'], needs: [0, 1, 2],
              check: s => s.ev.list().some(e => e.showlog === 'traffic' && e.n > 0) },
            { t: 'Soru: reddedilen ssh denemeleri logda yok. SIEM\'in reddedilen trafiği de görmesi için ne yapılır?', ask: { choices: [['override', 'interzone-default kuralını override edip loglamasını açmak (ya da en alta loglayan açık bir deny kuralı eklemek) ve log iletim profilini ona da bağlamak'], ['syslog', 'Syslog profiline ikinci sunucu eklemek'], ['start', 'LAN-OUT\'ta log-start açmak'], ['none', 'Mümkün değil; reddedilen trafik loglanmaz']], correct: 'override' },
              why: 'Varsayılan kurallar (intrazone-default, interzone-default) varsayılan olarak log yazmaz. Override ile loglama açılabilir ya da kural tabanının sonuna loglayan açık bir deny kuralı konur. Log iletim profili de o kurala bağlanmalıdır.',
              hints: ['ssh oturumu hangi kurala düştü?', 'O kural log yazıyor mu?'] },
            { t: 'Soru: SIEM toplayıcısı yalnız veri ağından (ör. trust zone\'u) erişilebilir olsaydı ne gerekirdi?', ask: { choices: [['sroute', 'Syslog için service route: gönderimi bir veri arayüzünden yaptırmak (varsayılan MGT)'], ['rule', 'trust → trust izin kuralı'], ['nat', 'Kaynak NAT kuralı'], ['nothing', 'Hiçbir şey; syslog her arayüzden çıkar']], correct: 'sroute' },
              why: 'Yönetim düzlemi servisleri (syslog, DNS, NTP, güncelleme) varsayılan olarak MGT arayüzünden çıkar. Toplayıcı yalnız veri ağındaysa service route ile kaynak arayüz değiştirilir; o zaman ilgili güvenlik kuralları da gerekebilir.',
              hints: ['Syslog\'u yönetim düzlemi mi veri düzlemi mi gönderir?', 'Varsayılan kaynak arayüz hangisi?'] },
        ],
        verify: ['show log traffic direction equal backward', 'show config running | match log-setting'],
        learn: ['Syslog profili = hedef; log iletim profili = hangi log nereye; kural = bağlama.', 'Sistem/config logları shared log-settings system|config altında.', 'Varsayılan kurallar loglamaz.', 'Syslog varsayılan olarak MGT\'den çıkar.'],
        links: { tool: '#/paloalto/logfwd', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/113' }, cert: 'Network Security Analyst · Logging'
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
