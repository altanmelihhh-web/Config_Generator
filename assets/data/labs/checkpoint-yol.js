'use strict';
// ─── CLI Lab: Check Point öğrenme yolu lab'ları (Gaia R81.20 görünümü) ────────
// checkpoint.js'teki temel ve teşhis lab'larını tamamlar: yönetim sertleştirme, VLAN, log/saat,
// yedekleme ve "bakım sonrası şubelere erişim yok" arıza lab'ı. Hepsi Gaia clish ile yapılır.
// Adresler yalnız güvenli örnek bloklardan (bkz. docs/LAB-VENDOR-AGENT-KURALLARI.md).
(function () {
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    // Ortak başlangıç: eth1 WAN, eth2 LAN, eth3 DMZ, varsayılan rota (checkpoint.js ile aynı)
    const BASE = ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on', 'set interface eth1 comments WAN',
        'set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on', 'set interface eth2 comments LAN',
        'set interface eth3 ipv4-address 172.24.50.1 mask-length 24', 'set interface eth3 state on', 'set interface eth3 comments DMZ',
        'set static-route default nexthop gateway address 203.0.113.1 on'];
    const SIMBASE = { policy: { name: 'LAB-Policy' }, cpu: { user: 4, sys: 3, idle: 93, cpus: 4 } };
    const BRANCH = 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on';
    const NPW = 'Izleme-Ops26';
    const branchOk = s => { const r = s.lookup('10.128.5.10'); return !!r && r.type === 'S' && r.gw === '10.64.10.254' && r.dev === 'eth2'; };   // netops kullanıcısının lab parolası (12 karakter, 4 karakter türü)

    const LABS = [
    // ═══ Yönetim erişimini sertleştirme ═══
    {
        id: 'cp-08', vendor: 'checkpoint', level: 2, title: 'Yönetim erişimini sertleştirme: izinli istemciler, zaman aşımı, parola politikası, roller', minutes: 20, kind: 'firewall', hostname: 'gw-a', pre: ['cp-02'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, sim: Object.assign({ adminSrc: '10.240.0.10' }, SIMBASE),
        story: 'Denetim raporu gateway\'in yönetimi için üç bulgu yazmış: SSH ve Gaia Portal (WebUI) <b>her adresten</b> açık, boşta kalan oturum kapanmıyor, parola kuralı zayıf. Ayrıca NOC ekibi için yalnız <b>izleme</b> yetkili bir hesap istenmiş. Yönetim ağı <code>10.240.0.0/16</code>; siz <code>10.240.0.10</code> adresinden bağlısınız.',
        lesson: L('Gaia\'da yönetim erişimi katman katmandır. <b>allowed-client</b> listesi SSH ve Gaia Portal\'a hangi kaynak adreslerin bağlanabileceğini belirler (varsayılan: <code>any-host</code>). <b>inactivity-timeout</b> boşta kalan clish oturumunu kapatır. <b>password-controls</b> yerel hesapların parola kuralını belirler. <b>RBA</b> (Role Based Administration) kullanıcıya rol atar: <code>adminRole</code> tam yetki, <code>monitorRole</code> yalnız okuma.',
            'Yönetim düzlemine her adresten erişim, bir parola sızıntısını doğrudan cihaz ele geçirmeye çevirir. Kaynak kısıtı, zaman aşımı ve en az yetki birlikte uygulanınca tek bir hata tüm cihazı açmaz.',
            'add allowed-client network ipv4-address 10.240.0.0 mask-length 16\ndelete allowed-client host any-host\nset inactivity-timeout 5\nset password-controls min-password-length 12\nset password-controls complexity 3\nadd user netops uid 2001 homedir /home/netops\nset user netops password\nadd rba user netops roles monitorRole\nsave config',
            ['<code>any-host</code>\'u kendi yönetim ağınızı eklemeden silmek: oturum kapanınca yalnız konsol kalır.', 'allowed-client\'ın güvenlik politikasının yerini tuttuğunu sanmak: yalnız Gaia\'nın SSH/WebUI erişimini sınırlar; gateway\'e gelen yönetim trafiği yine politika kurallarıyla (ör. Stealth kuralı) korunmalıdır.', 'Parola kuralını sonradan sıkılaştırıp eski parolaların da değiştiğini sanmak: kural yeni belirlenen parolalara uygulanır.', 'Her kullanıcıya adminRole vermek.', 'Değişikliklerden sonra <code>save config</code>\'i unutmak.']),
        goals: ['İzinli istemci listesini doğru sırayla daraltmak', 'Oturum zaman aşımı', 'Parola uzunluğu ve karmaşıklığı', 'monitorRole ile en az yetkili kullanıcı', 'save config'],
        tasks: [
            { t: 'Gaia\'ya şu an hangi adreslerden bağlanılabildiğini görün.', why: 'Değiştirmeden önce mevcut durumu görün. Varsayılanda liste yalnız <code>any-host</code> içerir: her adres SSH ve WebUI\'a bağlanabilir.',
              hints: ['show allowed-client …', '<code>show allowed-client all</code>'], steps: ['show allowed-client all'],
              check: s => s.ev.ran(/^show allowed-client all$/) },
            { t: 'Yönetim ağını (<code>10.240.0.0/16</code>) izinli istemci olarak ekleyin.', why: 'Önce kendi ağınızı ekleyin. Tek bir yönetim istasyonu için <code>host</code>, bir yönetim ağı için <code>network … mask-length</code> kullanılır.',
              hints: ['add allowed-client network …', '<code>add allowed-client network ipv4-address 10.240.0.0 mask-length 16</code>'], steps: ['add allowed-client network ipv4-address 10.240.0.0 mask-length 16'],
              check: s => s.model.allowed.includes('10.240.0.0/16') },
            { t: 'Artık <code>any-host</code> kaydını kaldırın.', why: 'Liste yalnız yönetim ağını içerince diğer adreslerden SSH/WebUI bağlantısı reddedilir. Sıra önemlidir: önce ekle, sonra sil.',
              hints: ['delete allowed-client host …', '<code>delete allowed-client host any-host</code>'], steps: ['delete allowed-client host any-host'], needs: [1],
              check: s => !s.model.allowed.includes('any') && s.allowedOk('10.240.0.10'),
              fb: s => (s.ev.warned('lockout') ? 'Çalışır ama sıra riskliydi: any-host kendi ağınız eklenmeden silindi. Gerçek cihazda bu oturum kapandığında yalnız konsoldan girebilirdiniz.' : null) },
            { t: 'Boşta kalan oturumlar <b>5 dakika</b> sonra kapansın.', why: 'Açık unutulmuş bir yönetim terminali, kilitlenmemiş bir kapı gibidir. Değer dakika cinsindendir.',
              hints: ['set inactivity-timeout …', '<code>set inactivity-timeout 5</code>'], steps: ['set inactivity-timeout 5'],
              check: s => s.model.inact === 5,
              fb: s => (s.model.inact > 5 ? 'Değer istenenden uzun.' : null) },
            { t: 'Parola kuralı: en az <b>12 karakter</b> ve en az <b>3 karakter türü</b> (küçük/büyük harf, rakam, sembol).', why: '<code>min-password-length</code> uzunluğu, <code>complexity</code> kaç farklı karakter türü gerektiğini belirler (1: kontrol yok … 4: dört tür).',
              hints: ['set password-controls min-password-length … / complexity …', '<code>set password-controls min-password-length 12</code> → <code>set password-controls complexity 3</code>'],
              steps: ['set password-controls min-password-length 12', 'set password-controls complexity 3'],
              check: s => s.model.pwc.min >= 12 && s.model.pwc.cx >= 3 },
            { t: 'NOC için <code>netops</code> kullanıcısını oluşturun (uid <code>2001</code>, ev dizini <code>/home/netops</code>), parolasını <code>' + NPW + '</code> yapın ve yalnız <b>monitorRole</b> verin.',
              why: 'Kullanıcı üç adımda hazırlanır: hesap (<code>add user</code>), parola (<code>set user … password</code>, iki kez sorar) ve rol (<code>add rba user … roles</code>). monitorRole yalnız okuma yetkisi verir; izleme ekibinin ayar değiştirmesi gerekmez.',
              hints: ['add user → set user … password → add rba user … roles monitorRole', '<code>add user netops uid 2001 homedir /home/netops</code> · <code>set user netops password</code> · <code>add rba user netops roles monitorRole</code>'],
              steps: ['add user netops uid 2001 homedir /home/netops', 'set user netops password', NPW, NPW, 'add rba user netops roles monitorRole'],
              check: s => { const u = s.model.users.netops, r = s.model.rba.netops || []; return !!u && u.pw && r.includes('monitorRole'); },
              fb: s => ((s.model.rba.netops || []).includes('adminRole') ? 'Çalışır ama netops\'a adminRole da verilmiş: izleme hesabının tam yetkisi olmamalı (delete rba user netops roles adminRole).' : null) },
            { t: 'Soru: izinli istemci (allowed-client) listesi neyi korur?', ask: { choices: [['gaia', 'Gaia\'nın kendi yönetim erişimini (SSH ve Gaia Portal/WebUI)'], ['all', 'Gateway\'den geçen tüm trafiği; güvenlik politikasının yerine geçer'], ['smc', 'Yalnız SmartConsole bağlantısını'], ['console', 'Seri konsol erişimini']], correct: 'gaia' },
              why: 'Bu liste işletim sisteminin yönetim servislerine bağlanabilecek adresleri sınırlar. Geçen trafik ve gateway\'e gelen diğer bağlantılar SmartConsole\'da yazılan güvenlik politikasıyla korunur. Konsol erişimi bu listeden etkilenmez; kilitlenmede son çare odur.',
              hints: ['Liste Gaia\'nın hangi servislerinde uygulanıyor?', 'Politika kuralları ayrı bir katmandır.'] },
            { t: 'Yapılandırmada yeni satırları görün ve kalıcı kaydedin.', why: '<code>show configuration</code> bu lab\'da eklediğiniz satırları gösterir. <code>save config</code> olmadan yeniden başlatmada sertleştirme geri gider ve denetim bulgusu geri gelir.',
              hints: ['show configuration → save config', '<code>show configuration</code> → <code>save config</code>'], steps: ['show configuration', 'save config'], needs: [1, 2, 3, 4, 5],
              check: s => s.ev.ran(/^show configuration$/) && !s.dirty() && !s.savedModel.allowed.includes('any') && s.savedModel.inact === 5 && !!s.savedModel.users.netops,
              fb: s => (s.dirty() ? 'Kaydedilmemiş değişiklik var: save config.' : null) },
        ],
        verify: ['show allowed-client all', 'show inactivity-timeout', 'show password-controls all', 'show rba user netops', 'show config-state'],
        learn: ['Önce kendi yönetim ağını ekle, sonra any-host\'u sil.', 'allowed-client yalnız SSH/WebUI\'ı sınırlar; politika ayrı.', 'inactivity-timeout dakika cinsinden.', 'Kullanıcı = add user + set user password + add rba user roles.', 'monitorRole yalnız okuma.'],
        links: { tool: '#/checkpoint/system', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/108' }, cert: 'CCSA R81.20'
    },
    // ═══ VLAN alt arayüzleri ═══
    {
        id: 'cp-09', vendor: 'checkpoint', level: 1, title: 'VLAN alt arayüzleri: tek porttan iki segment', minutes: 20, kind: 'firewall', hostname: 'gw-a', pre: ['cp-02'],
        ifaces: ['eth0', 'eth1', 'eth2', 'eth3', 'eth4'], up: ['eth1', 'eth2', 'eth3', 'eth4'], hosts: ['10.64.20.10', '10.64.30.10'],
        start: BASE.concat(['add interface eth4 vlan 200']), sim: SIMBASE,
        story: 'Kat switch\'inden gelen yeni kablo <code>eth4</code>\'e takıldı; switch portu 802.1Q trunk ve iki VLAN taşıyor: <b>VLAN 20 Misafir</b> <code>10.64.20.0/24</code> ve <b>VLAN 30 IoT</b> <code>10.64.30.0/24</code>. Gateway her iki ağın varsayılan ağ geçidi (<code>.1</code>) olacak. Bir mesai arkadaşınız dün yanlışlıkla <code>eth4.200</code> oluşturmuş.',
        lesson: L('Gaia\'da VLAN alt arayüzü fiziksel arayüzün altında oluşturulur: <code>add interface eth4 vlan 20</code> komutu <code>eth4.20</code> adlı mantıksal arayüzü açar. IP adresi fiziksel arayüze değil alt arayüze verilir. Alt arayüz, fiziksel arayüz kapalıysa (<code>state off</code>) ya da bağlantısı yoksa çalışmaz.',
            'Tek bir fiziksel port ve switch\'te bir trunk ile çok sayıda segmenti ayrı güvenlik bölgeleri olarak korursunuz. Misafir ve IoT ağları arasındaki trafik de gateway\'den ve dolayısıyla politikadan geçer.',
            'set interface eth4 state on\nadd interface eth4 vlan 20\nset interface eth4.20 ipv4-address 10.64.20.1 mask-length 24\nset interface eth4.20 comments Misafir\nadd interface eth4 vlan 30\nset interface eth4.30 ipv4-address 10.64.30.1 mask-length 24\ndelete interface eth4 vlan 200\nsave config',
            ['Fiziksel arayüzü açmayı unutmak: alt arayüzler de çalışmaz.', 'Switch tarafında VLAN\'ı trunk\'a eklemeyi unutmak (gateway doğru, trafik yine gelmez).', 'Yeni arayüzlerden sonra SmartConsole\'da topolojiyi güncellemeyip politikayı kurmamak: yeni ağdan gelen paketler anti-spoofing ile düşer.', 'IP\'si olan bir VLAN\'ı silmeye çalışmak: önce adres kaldırılır.']),
        goals: ['Fiziksel arayüzü açmak', 'VLAN alt arayüzü ve IP', 'Hatalı VLAN\'ı silmek', 'Bağlı ağları doğrulamak', 'SmartConsole topoloji adımı'],
        tasks: [
            { t: '<code>eth4</code>\'ün durumuna bakın ve arayüzü açın.', why: '<code>show interface eth4</code> çıktısında <code>state off</code> ve <code>link-state link down</code> görürsünüz: kablo takılı ama arayüz yönetimsel olarak kapalı. Alt arayüzler fiziksel arayüz açıkken çalışır.',
              hints: ['show interface eth4, sonra state on', '<code>show interface eth4</code> → <code>set interface eth4 state on</code>'], steps: ['show interface eth4', 'set interface eth4 state on'],
              check: s => s.model.ifs.eth4.state === 'on' && s.ev.ran(/^show interface eth4$/) },
            { t: '<b>VLAN 20 (Misafir):</b> alt arayüzü oluşturun, <code>10.64.20.1/24</code> atayın ve açıklamasını <code>Misafir</code> yapın.', why: 'Alt arayüz adı <code>&lt;fiziksel&gt;.&lt;vlan&gt;</code> biçimindedir. Açıklama, SmartConsole\'da topolojiyi okurken ve loglarda arayüzü tanımayı kolaylaştırır.',
              hints: ['add interface eth4 vlan 20, sonra eth4.20\'ye IP', '<code>add interface eth4 vlan 20</code> · <code>set interface eth4.20 ipv4-address 10.64.20.1 mask-length 24</code> · <code>set interface eth4.20 comments Misafir</code>'],
              steps: ['add interface eth4 vlan 20', 'set interface eth4.20 ipv4-address 10.64.20.1 mask-length 24', 'set interface eth4.20 comments Misafir'],
              check: s => { const i = s.model.ifs['eth4.20']; return !!i && i.ip === '10.64.20.1' && i.len === 24 && /misafir/i.test(i.comments); } },
            { t: '<b>VLAN 30 (IoT):</b> aynısını <code>10.64.30.1/24</code> ve açıklama <code>IoT</code> ile yapın.', why: 'Aynı fiziksel porta istediğiniz kadar VLAN eklenebilir; her biri ayrı bir bağlı ağdır.',
              hints: ['VLAN 20 ile aynı üç komut.', '<code>add interface eth4 vlan 30</code> · <code>set interface eth4.30 ipv4-address 10.64.30.1 mask-length 24</code> · <code>set interface eth4.30 comments IoT</code>'],
              steps: ['add interface eth4 vlan 30', 'set interface eth4.30 ipv4-address 10.64.30.1 mask-length 24', 'set interface eth4.30 comments IoT'],
              check: s => { const i = s.model.ifs['eth4.30']; return !!i && i.ip === '10.64.30.1' && i.len === 24 && /iot/i.test(i.comments); } },
            { t: 'Yanlışlıkla oluşturulmuş <code>eth4.200</code>\'ü silin.', why: 'Kullanılmayan arayüzler topolojiye karışır ve yanlışlıkla adres verilirse beklenmedik bir ağ açılır. Silme komutu ekleme komutunun aynısıdır, başında <code>delete</code> vardır.',
              hints: ['delete interface eth4 vlan …', '<code>delete interface eth4 vlan 200</code>'], steps: ['delete interface eth4 vlan 200'],
              check: s => !s.model.ifs['eth4.200'] },
            { t: 'Her iki VLAN\'daki bir istemciye ping atın: <code>10.64.20.10</code> ve <code>10.64.30.10</code>.', why: 'Ping başarılıysa fiziksel bağlantı, trunk ve VLAN etiketi uçtan uca doğrudur. Başarısızsa önce switch tarafındaki trunk\'a bakın.',
              hints: ['İki ping.', '<code>ping 10.64.20.10</code> → <code>ping 10.64.30.10</code>'], steps: ['ping 10.64.20.10', 'ping 10.64.30.10'], needs: [0, 1, 2],
              check: s => ['10.64.20.10', '10.64.30.10'].every(ip => s.ev.list().some(e => e.ping === ip && e.ok)) },
            { t: 'Soru: arayüzler Gaia\'da hazır. Bu ağlardan gelen trafiğin güvenlik duvarından geçebilmesi için SmartConsole\'da ne yapılmalı?', ask: { choices: [['topo', 'Gateway nesnesinde arayüzleri yeniden çekmek (Get Interfaces), topolojiyi ve anti-spoofing ayarını kontrol edip politikayı kurmak'], ['none', 'Hiçbir şey; gateway yeni arayüzleri otomatik tanır ve korur'], ['unload', 'fw unloadlocal ile politikayı kaldırıp yeniden yüklemek'], ['restart', 'cpstop ve cpstart ile servisleri yeniden başlatmak']], correct: 'topo' },
              why: 'Gaia\'daki arayüz değişikliği yönetim sunucusundaki gateway nesnesine kendiliğinden yansımaz. Topoloji güncellenmez ve politika kurulmazsa yeni ağdan gelen paketler anti-spoofing ya da kural tabanı tarafından düşürülür (bkz. zdebug drop lab\'ı).',
              hints: ['Gaia ayarı ile yönetim sunucusundaki nesne ayrı yerlerde tutulur.', 'Politika kurulumu gateway\'e neyi götürür?'] },
            { t: 'Yönlendirme tablosunda iki yeni bağlı ağı görün ve kaydedin.', why: '<code>show route</code>\'da <code>C 10.64.20.0/24 … eth4.20</code> ve <code>C 10.64.30.0/24 … eth4.30</code> satırları görünmeli. Sonra <code>save config</code>.',
              hints: ['show route → save config', '<code>show route</code> → <code>save config</code>'], steps: ['show route', 'save config'], needs: [0, 1, 2, 3],
              check: s => s.ev.ran(/^show route$/) && !s.dirty() && !!s.savedModel.ifs['eth4.20'] && !!s.savedModel.ifs['eth4.30'] && !s.savedModel.ifs['eth4.200'],
              fb: s => (s.dirty() ? 'Kaydedilmemiş değişiklik var: save config.' : null) },
        ],
        verify: ['show interfaces', 'show interface eth4.20', 'show route', 'show config-state'],
        learn: ['add interface &lt;fiziksel&gt; vlan &lt;id&gt; → &lt;fiziksel&gt;.&lt;id&gt;.', 'IP alt arayüze verilir; fiziksel arayüz açık olmalı.', 'Gaia değişikliği SmartConsole topolojisine kendiliğinden geçmez.', 'delete interface … vlan … ile silinir.'],
        links: { tool: '#/checkpoint/interface', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/111' }, cert: 'CCSA R81.20'
    },
    // ═══ Log ve saat ═══
    {
        id: 'cp-10', vendor: 'checkpoint', level: 2, title: 'Log ve saat: saat dilimi ve uzak syslog', minutes: 15, kind: 'firewall', hostname: 'gw-a', pre: ['cp-02'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE.concat(['set ntp server primary 10.64.10.123 version 4', 'set ntp active on', 'add syslog log-remote-address 198.51.100.99 level debug']), sim: SIMBASE,
        story: 'Güvenlik ekibi gateway\'in işletim sistemi loglarını yeni SIEM toplayıcısına (<code>10.240.0.20</code>) istiyor. Eski toplayıcı (<code>198.51.100.99</code>) kapatıldı ama gateway hâlâ ona <b>debug</b> seviyesinde log yolluyor. Ayrıca log saatleri yerel saatle uyuşmuyor: saat dilimi hiç ayarlanmamış.',
        lesson: L('Gaia\'nın <b>uzak syslog</b> ayarı işletim sistemi loglarını (girişler, clish komutları, sistem olayları) bir syslog sunucusuna gönderir. Güvenlik duvarı trafik logları ise ayrı yoldan, gateway\'den Log Server\'a (yönetim sunucusu) gider; SIEM\'e aktarılmaları Log Exporter ile yapılır. <b>Saat dilimi</b> NTP\'den bağımsızdır: NTP saati doğru tutar, saat dilimi yerel gösterimi belirler.',
            'Olay incelemesinde farklı cihazların logları zamana göre yan yana konur. Saat dilimi yanlışsa olaylar saatlerce kaymış görünür. Gereksiz debug seviyesi hem toplayıcıyı doldurur hem de hassas ayrıntıyı ağa taşır.',
            'show timezone\nset timezone Europe / Istanbul\nadd syslog log-remote-address 10.240.0.20 level info\ndelete syslog log-remote-address 198.51.100.99\nshow syslog log-remote-addresses\nsave config',
            ['<code>set timezone Europe/Istanbul</code> yazmak: Gaia bölge ile şehir arasında boşluklu "/" ister.', 'Trafik loglarının Gaia syslog ayarıyla SIEM\'e gittiğini sanmak.', 'Kapatılmış toplayıcıyı listeden silmemek.', 'Debug seviyesini üretimde açık bırakmak.']),
        goals: ['Saat dilimini ayarlamak', 'Uzak syslog sunucusu eklemek', 'Eski/yanlış hedefi silmek', 'Gaia logu ile trafik logu ayrımı'],
        tasks: [
            { t: 'Mevcut saat dilimine bakın.', why: 'Değiştirmeden önce görün: <code>Etc/GMT</code> yerel saatten farklıysa log zamanları kayık görünür.',
              hints: ['show timezone', '<code>show timezone</code>'], steps: ['show timezone'], check: s => s.ev.ran(/^show timezone$/) },
            { t: 'Saat dilimini <code>Europe / Istanbul</code> yapın.', why: 'Gaia sözdizimi bölge ve şehir arasında boşluklu bir "/" ister. Değişiklik anında uygulanır.',
              hints: ['set timezone Bölge / Şehir', '<code>set timezone Europe / Istanbul</code>'], steps: ['set timezone Europe / Istanbul'],
              check: s => s.model.tz === 'Europe / Istanbul' },
            { t: 'Yeni toplayıcıyı ekleyin: <code>10.240.0.20</code>, seviye <code>info</code>.', why: 'Seviye, gönderilecek en düşük önem derecesidir: <code>info</code> bilgi ve üstünü gönderir, <code>debug</code> her şeyi.',
              hints: ['add syslog log-remote-address … level …', '<code>add syslog log-remote-address 10.240.0.20 level info</code>'], steps: ['add syslog log-remote-address 10.240.0.20 level info'],
              check: s => s.model.syslog.some(y => y.ip === '10.240.0.20' && y.lv === 'info'),
              fb: s => (s.model.syslog.some(y => y.ip === '10.240.0.20' && y.lv === 'debug') ? 'debug seviyesi gereksiz yük getirir.' : null) },
            { t: 'Kapatılan eski toplayıcıyı (<code>198.51.100.99</code>) silin ve listeyi görün.', why: 'Kapatılmış bir hedefe log göndermek boşa trafik üretir. Adres başka birine geçerse loglarınız ona gider.',
              hints: ['delete syslog log-remote-address …', '<code>delete syslog log-remote-address 198.51.100.99</code> → <code>show syslog log-remote-addresses</code>'],
              steps: ['delete syslog log-remote-address 198.51.100.99', 'show syslog log-remote-addresses'],
              check: s => !s.model.syslog.some(y => y.ip === '198.51.100.99') && s.ev.after(/^delete syslog log-remote-address 198\.51\.100\.99$/, /^show syslog log-remote-addresses$/) },
            { t: 'Soru: SIEM ekibi bir kullanıcının hangi siteye erişip engellendiğini (trafik logu) de görmek istiyor. Bu loglar nereden gelir?', ask: { choices: [['exp', 'Trafik logları Log Server\'a gider; SIEM\'e Log Exporter ile aktarılır. Gaia syslog ayarı bunları göndermez'], ['syslog', 'Az önce eklediğiniz Gaia uzak syslog ayarından, info seviyesinde'], ['debug', 'Yalnız debug seviyesinde syslog açılırsa'], ['none', 'Check Point trafik loglarını dışa aktaramaz']], correct: 'exp' },
              why: 'Gaia syslog işletim sistemi olaylarını taşır. Güvenlik duvarı logları gateway\'den Log Server\'a gider ve oradan Log Exporter ile syslog/CEF/LEEF biçiminde SIEM\'e aktarılır.',
              hints: ['Trafik logu Gaia\'da değil, Check Point yazılımında üretilir.', 'Loglar önce nereye gider?'] },
            { t: 'Kalıcı kaydedin.', why: 'Saat dilimi ve syslog ayarları da <code>save config</code> ile kalıcı olur.',
              hints: ['save config', '<code>save config</code>'], steps: ['save config'], needs: [1, 2, 3],
              check: s => !s.dirty() && s.savedModel.tz === 'Europe / Istanbul' && s.savedModel.syslog.some(y => y.ip === '10.240.0.20') && !s.savedModel.syslog.some(y => y.ip === '198.51.100.99') },
        ],
        verify: ['show timezone', 'show syslog log-remote-addresses', 'show ntp servers', 'show config-state'],
        learn: ['set timezone Bölge / Şehir (boşluklu).', 'Gaia syslog = işletim sistemi logları.', 'Trafik logu → Log Server → Log Exporter → SIEM.', 'Kapatılan hedefleri listeden silin.'],
        links: { tool: '#/checkpoint/system', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/109' }, cert: 'CCSA R81.20'
    },
    // ═══ Yedekleme ve geri dönüş ═══
    {
        id: 'cp-11', vendor: 'checkpoint', level: 2, title: 'Yedekleme ve geri dönüş: save configuration, backup, snapshot', minutes: 15, kind: 'firewall', hostname: 'gw-a', pre: ['cp-02'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE.concat([BRANCH]), hosts: ['10.64.10.254'], sim: SIMBASE,
        story: 'Bu gece gateway\'e bir Jumbo Hotfix kurulacak. Değişiklik kaydı üç güvence istiyor: clish ayarlarının dışa aktarılmış bir kopyası, sistem yedeği (backup) ve işler kötü giderse işletim sistemiyle birlikte geri dönülebilecek bir <b>snapshot</b>.',
        lesson: L('Gaia\'da üç ayrı güvence vardır. <code>save configuration &lt;dosya&gt;</code> clish ayarlarını set komutları olarak bir dosyaya yazar; <code>load configuration</code> ile geri yüklenir. <code>add backup local</code> Gaia ve Check Point yapılandırmasının yedeğini alır (<code>/var/log/CPbackup/backups/</code>); aynı sürüme geri yüklenir. <code>add snapshot</code> işletim sistemi dahil tüm sistem bölümünün görüntüsünü alır; yükseltme ya da hotfix öncesi geri dönüş içindir.',
            'Bakım sırasında sorun çıkarsa geri dönüş yolu önceden hazır olmalıdır. Snapshot en eksiksiz geri dönüştür ama dakikalar sürer ve diskte boş alan ister. Backup daha küçüktür ve cihaz dışına taşınabilir.',
            'save configuration gw-a-oncesi\nadd backup local\nshow backups\nadd snapshot hotfix-oncesi desc "Jumbo Hotfix oncesi"\nshow snapshots',
            ['Yalnız cihaz üzerinde yedek tutup dışarı kopyalamamak: disk arızasında yedek de gider.', 'Snapshot için diskte yer olup olmadığına bakmamak.', 'save config ile save configuration\'ı karıştırmak: ilki açılış yapılandırmasına kaydeder, ikincisi dosyaya dışa aktarır.', 'Yedeklerin politikayı da içerdiğini sanmak: politika ve nesneler yönetim sunucusundadır.']),
        goals: ['clish ayarlarını dosyaya aktarmak', 'Yerel backup almak', 'Snapshot almak', 'Hangi durumda hangisi'],
        tasks: [
            { t: 'clish ayarlarını <code>gw-a-oncesi</code> adlı dosyaya aktarın.', why: '<code>save configuration</code> tüm clish ayarlarını set komutları olarak yazar; bakımdan sonra farkı görmek ya da aynı ayarları başka bir cihaza uygulamak için kullanılır.',
              hints: ['save configuration <dosya>', '<code>save configuration gw-a-oncesi</code>'], steps: ['save configuration gw-a-oncesi'],
              check: s => Object.keys(s.files()).length > 0 },
            { t: 'Yerel backup alın ve listede görün.', why: 'Backup, Gaia ve Check Point yapılandırmasının sıkıştırılmış bir kopyasıdır. Gerçekte birkaç dakika sürer; <code>show backups</code> ile izlenir. Sonra dosyayı cihaz dışına (SCP/FTP) kopyalamak iyi uygulamadır.',
              hints: ['add backup local → show backups', '<code>add backup local</code> → <code>show backups</code>'], steps: ['add backup local', 'show backups'],
              check: s => s.backups().length > 0 && s.ev.after(/^add backup local$/, /^show backups$/) },
            { t: 'Açıklamasıyla bir snapshot alın (ad: <code>hotfix-oncesi</code>) ve listede görün.', why: 'Snapshot işletim sistemi dahil tüm sistemin görüntüsüdür; hotfix ya da sürüm yükseltme geri alınacaksa en hızlı ve eksiksiz yol budur. Açıklama, aylar sonra hangisinin ne için alındığını anlatır.',
              hints: ['add snapshot <ad> desc "<açıklama>"', '<code>add snapshot hotfix-oncesi desc "Jumbo Hotfix oncesi"</code> → <code>show snapshots</code>'],
              steps: ['add snapshot hotfix-oncesi desc "Jumbo Hotfix oncesi"', 'show snapshots'],
              check: s => s.snaps().some(x => x.n === 'hotfix-oncesi') && s.ev.ran(/^show snapshots$/) },
            { t: 'Soru: hotfix kurulduktan sonra gateway düzgün açılmıyor. İşletim sistemi ve hotfix dahil her şeyi bakım öncesine döndürmek için hangisini kullanırsınız?', ask: { choices: [['snap', 'Snapshot (tüm sistem bölümünün görüntüsü)'], ['file', 'save configuration dosyası (yalnız clish ayarları)'], ['backup', 'Backup (yapılandırma; kurulu hotfix\'i geri almaz)'], ['saveconf', 'save config']], correct: 'snap' },
              why: 'Yalnız snapshot işletim sistemi ve kurulu yazılımla birlikte geri döner. Backup ve save configuration yapılandırmayı taşır, kurulu hotfix\'i kaldırmaz.',
              hints: ['Hangisi yazılımı da içerir?', 'Yapılandırma ile kurulu yazılım farklı şeylerdir.'] },
            { t: 'Soru: <code>save configuration</code> ile aldığınız dosya neyi <b>içermez</b>?', ask: { choices: [['policy', 'Güvenlik politikasını ve nesneleri: bunlar yönetim sunucusunda tutulur'], ['if', 'Arayüz adreslerini'], ['route', 'Statik rotaları'], ['dns', 'DNS ve NTP ayarlarını']], correct: 'policy' },
              why: 'Dosya Gaia işletim sistemi ayarlarıdır (show configuration çıktısı). Kurallar, nesneler ve NAT SmartConsole ile yönetim sunucusunda tutulur ve gateway\'e politika kurulumuyla gelir; onların yedeği yönetim sunucusunda alınır.',
              hints: ['Dosyanın içeriği show configuration ile aynıdır.', 'Politika hangi sunucuda yazılır?'] },
        ],
        verify: ['show backups', 'show snapshots', 'show configuration'],
        learn: ['save configuration = clish ayarlarını dosyaya aktar.', 'add backup local = yapılandırma yedeği.', 'add snapshot = işletim sistemi dahil tam görüntü.', 'Politika yedeği yönetim sunucusundadır.'],
        links: { tool: '#/checkpoint/system', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/112' }, cert: 'CCSA R81.20'
    },
    // ═══ Arıza: bakım sonrası şubelere erişim yok ═══
    {
        id: 'cp-12', vendor: 'checkpoint', level: 5, title: '"Bakımdan sonra şubelere erişilemiyor" — arıza kaydı', minutes: 20, kind: 'firewall', hostname: 'gw-a', pre: ['cp-02', 'cp-06'],
        up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1', '10.64.10.254'], sim: Object.assign({ remote: [{ net: '10.128.0.0/16', gw: '10.64.10.254' }] }, SIMBASE),
        start: BASE.concat([BRANCH]),
        variants: [
            { key: 'lost', start: ['set static-route 10.128.0.0/16 off'], fix: [BRANCH] },
            { key: 'nexthop', start: ['set static-route 10.128.0.0/16 off', 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.11.254 on'],
              fix: ['set static-route 10.128.0.0/16 nexthop gateway address 10.64.11.254 off', BRANCH] },
            { key: 'ifdown', start: ['set interface eth2 state off'], fix: ['set interface eth2 state on'] },
            { key: 'mask', start: ['set interface eth2 ipv4-address 10.64.10.1 mask-length 28'], fix: ['set interface eth2 ipv4-address 10.64.10.1 mask-length 24'] },
        ],
        story: '<b>Arıza kaydı:</b> "Dün gece bakımda gateway yeniden başlatıldı. Sabahtan beri şubelerdeki (<code>10.128.0.0/16</code>) sunuculara erişilemiyor." Beklenen: şube trafiği LAN\'daki çekirdek yönlendiriciye (<code>10.64.10.254</code>, eth2 üzerinden) gider. Belirtiden başlayıp kanıt toplayın, kök nedeni seçin, tek değişiklikle düzeltin. <small>Her turda farklı bir arıza gelebilir.</small>',
        lesson: L('Gaia\'da bir statik rota ancak sonraki atlaması (nexthop) açık ve adresli bir arayüzün ağındaysa <b>etkin</b> olur. Etkin olmayan rota yapılandırmada durur ama <code>show route</code>\'da görünmez; <code>show route inactive</code> ile görülür. Aynı belirtiyi dört farklı neden üretebilir: rota hiç yok (kaydedilmemişti), nexthop yanlış, arayüz kapalı ya da arayüz maskesi nexthop\'u dışarıda bırakıyor.',
            'Yeniden başlatma sonrası arızaların çoğu kaydedilmemiş ya da yanlış yazılmış bir ayarın ortaya çıkmasıdır. Katman katman bakmak (arayüz → bağlı ağ → rota → erişim) tahmin yürütmeden kök nedeni gösterir.',
            'ping 10.128.5.10\nshow route\nshow route inactive\nshow interface eth2\nshow configuration\n# düzeltme sonrası\nping 10.128.5.10\nsave config',
            ['Rotayı ekleyip <code>save config</code> demeyip arızayı bir sonraki yeniden başlatmaya ertelemek.', 'Yanlış nexthop\'u silmeden yenisini eklemek: yapılandırmada etkin olmayan eski satır kalır.', 'Maskeyi düzeltmek yerine rotayı başka bir nexthop\'a çevirmek.', 'Arayüzü kontrol etmeden rotayı sorgulamak.']),
        goals: ['Belirtiyi doğrulamak', 'Etkin olmayan rotaları ve arayüzü incelemek', 'Kök nedeni kanıtla seçmek', 'Tek değişiklik, doğrulama, kayıt'],
        tasks: [
            { t: 'Belirti: bir şube sunucusuna (<code>10.128.5.10</code>) ping atın ve yönlendirme tablosuna bakın.', why: 'Ping sorunun gerçek olduğunu, <code>show route</code> gateway\'in bu hedef için ne bildiğini gösterir. <code>S 10.128.0.0/16</code> satırı yoksa bu hedef varsayılan rotayla internete gider.',
              hints: ['ping, sonra show route', '<code>ping 10.128.5.10</code> → <code>show route</code>'], steps: ['ping 10.128.5.10', 'show route'], loo: false, /* son görevdeki doğrulama ping'i bu görevi de karşılar */
              check: s => s.ev.list().some(e => e.ping === '10.128.5.10') && s.ev.ran(/^show route$/) },
            { t: 'Kanıt toplayın: etkin olmayan rotalara ve LAN arayüzüne (eth2) bakın.', why: '<code>show route inactive</code> tanımlı ama kullanılamayan rotaları gösterir. <code>show interface eth2</code> ise arayüzün açık olup olmadığını ve adres/maskesini gösterir. İkisi birlikte dört olası nedeni ayırır.',
              hints: ['show route inactive, show interface eth2', '<code>show route inactive</code> → <code>show interface eth2</code>'], steps: ['show route inactive', 'show interface eth2'],
              check: s => s.ev.ran(/^show route inactive$/) && s.ev.ran(/^show interface eth2$/) },
            { t: 'Kök neden hangisi?', ask: { choices: [['lost', 'Şube rotası hiç yok: eklenmiş ama kaydedilmemiş, yeniden başlatmada gitmiş'], ['nexthop', 'Şube rotasının nexthop\'u yanlış yazılmış: bağlı bir ağda değil'], ['ifdown', 'LAN arayüzü eth2 kapalı (state off)'], ['mask', 'eth2\'nin maskesi yanlış: nexthop 10.64.10.254 bağlı ağın dışında kalmış']], correct: v => v.key },
              why: 'Rota ne etkin ne etkin olmayan listede ise: hiç yok. Etkin olmayan listede ve nexthop farklı bir ağda ise: nexthop yanlış. eth2 <code>state off</code> ise bağlı ağ da yok. eth2 açık ama maskesi /28 ise .254 o ağın dışında kalır.',
              hints: ['show route inactive çıktısı boş mu?', 'show interface eth2\'de state ve ipv4-address satırlarına bakın.'], needs: [1] },
            { t: 'Tek değişiklikle düzeltin.', why: 'Yalnız bozuk halkayı onarın. Yanlış nexthop\'u yenisini eklemeden önce <code>off</code> ile kaldırın ki yapılandırmada ölü satır kalmasın.',
              hints: ['Kök nedene göre tek değişiklik.', 'lost: rotayı ekleyin · nexthop: yanlışı <code>… 10.64.11.254 off</code>, doğruyu <code>… 10.64.10.254 on</code> · ifdown: <code>set interface eth2 state on</code> · mask: <code>… mask-length 24</code>'],
              steps: v => v.fix,
              check: s => branchOk(s),
              fb: s => (!branchOk(s) ? null : s.inactive().length ? 'Çalışır ama yapılandırmada etkin olmayan bir rota kaldı (show route inactive): set static-route … off ile temizleyin.' : (s.model.ifs.eth2.len !== 24 ? 'Çalışır ama eth2 maskesi LAN\'ın gerçek maskesi (/24) değil.' : null)) },
            { t: 'Doğrulayın ve kalıcı kaydedin.', why: 'Aynı ping artık yanıt almalı. Sonra <code>save config</code>: bu arızanın kaynağı büyük olasılıkla kaydedilmemiş ya da gözden geçirilmeden kaydedilmiş bir değişiklikti.',
              hints: ['ping → save config', '<code>ping 10.128.5.10</code> → <code>save config</code>'], steps: ['ping 10.128.5.10', 'save config'], needs: [3],
              check: s => s.ev.list().some(e => e.ping === '10.128.5.10' && e.ok) && !s.dirty() && !!s.savedModel.routes['10.128.0.0/16'] && s.savedModel.routes['10.128.0.0/16'].gw === '10.64.10.254' && s.savedModel.ifs.eth2.state === 'on' && s.savedModel.ifs.eth2.len === 24,
              fb: s => (s.dirty() ? 'Kaydedilmemiş değişiklik var: save config.' : null) },
        ],
        verify: ['show route', 'show route inactive', 'show interface eth2', 'ping 10.128.5.10', 'show config-state'],
        learn: ['Nexthop bağlı ağda değilse rota etkin olmaz.', 'show route inactive tanımlı ama kullanılamayan rotaları gösterir.', 'Önce arayüz, sonra rota.', 'Düzeltmeden sonra save config.'],
        links: { tool: '#/checkpoint/route', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/110' }, cert: 'CCSA R81.20 · Troubleshooting'
    },
    ];
    // Çoktan seçmeli (ask) görevler ve adımlardan türetilen örnek çözüm (checkpoint.js ile aynı kural)
    LABS.forEach(l => l.tasks.forEach((t, i) => {
        if (!t.ask) return;
        const key = l.id + ':' + i, want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
        t.check = s => !!s.answers && s.answers[key] === want(s.variant && s.variant());
        t.steps = t.steps || (v => [{ answer: i, v: want(v) }]);
    }));
    LABS.forEach(l => {
        l.solution = v => [].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps));
    });
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
