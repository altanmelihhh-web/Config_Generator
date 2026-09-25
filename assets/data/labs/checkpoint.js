'use strict';
// ─── CLI Lab içerikleri: Check Point (Gaia R81.20 görünümü: clish + expert) ───
// Politika SmartConsole'da yazılır; burada kural tabanı / anti-spoofing / NAT lab verisinde SABİTTİR (sim).
// Öğrenci CLI ile teşhis eder; düzeltme gerçek CLI karşılığı varsa CLI ile, yoksa "SmartConsole'da ne yapılmalı?" sorusuyla.
// Adresler: yalnız güvenli örnek bloklar (bkz. docs/LAB-VENDOR-AGENT-KURALLARI.md).
(function () {
    const PW = 'Expert-Lab1';
    const EX = cmds => ['expert', PW].concat(cmds);   // clish → expert → komutlar
    // Ortak başlangıç: eth1 WAN, eth2 LAN, eth3 DMZ, varsayılan rota
    const BASE = ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on', 'set interface eth1 comments WAN',
        'set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on', 'set interface eth2 comments LAN',
        'set interface eth3 ipv4-address 172.24.50.1 mask-length 24', 'set interface eth3 state on', 'set interface eth3 comments DMZ',
        'set static-route default nexthop gateway address 203.0.113.1 on'];
    const GWIPS = ['203.0.113.2/32', '10.64.10.1/32', '172.24.50.1/32'];
    // SmartConsole'da kurulu kural tabanı (lab'da sabit). lan: LAN-Nets grubunun içeriği
    const RULES = (lan, inetSvc) => [
        { n: 1, name: 'Stealth', src: ['any'], dst: GWIPS, svc: ['any'], act: 'drop' },
        { n: 2, name: 'Mgmt-Access', src: ['10.240.0.0/16'], dst: GWIPS, svc: ['ssh', 'https'], act: 'accept' },
        { n: 3, name: 'LAN-to-DMZ-Web', src: lan, dst: ['172.24.50.10/32'], svc: ['https'], act: 'accept' },
        { n: 4, name: 'LAN-to-Internet', src: lan, dst: ['any'], svc: inetSvc || ['http', 'https', 'dns'], act: 'accept' },
        { n: 5, name: 'Cleanup', src: ['any'], dst: ['any'], svc: ['any'], act: 'drop' }];
    const NAT = [{ src: '10.64.0.0/16', out: 'eth1' }];   // LAN-Nets → eth1 IP arkasına Hide NAT
    const NOISE = [{ src: '198.51.100.77', dst: '203.0.113.2', dport: 23, in: 'eth1' }, { src: '10.64.10.33', dst: '198.51.100.80', dport: 8080, in: 'eth2' }, { src: '10.64.10.51', dst: '198.51.100.80', dport: 80, in: 'eth2' }];
    const RBHTML = '<br><code>1 Stealth &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Any → GW · Any · Drop</code><br><code>2 Mgmt-Access &nbsp;&nbsp;&nbsp;MGMT-NET → GW · ssh, https · Accept</code>'
        + '<br><code>3 LAN-to-DMZ-Web LAN-Nets → WEB-SRV (172.24.50.10) · https · Accept</code><br><code>4 LAN-to-Internet LAN-Nets → Any · http, https, dns · Accept</code><br><code>5 Cleanup &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Any → Any · Any · Drop</code><br>';
    const SIMBASE = { policy: { name: 'LAB-Policy' }, cpu: { user: 4, sys: 3, idle: 93, cpus: 4 } };

    const LABS = [
    {
        id: 'cp-01', vendor: 'checkpoint', level: 0, title: 'Gaia clish temelleri: show/set, save config, expert', minutes: 15, kind: 'firewall', hostname: 'gw-a', up: ['eth1', 'eth2'], ordered: true,
        start: BASE.slice(0, 6), sim: SIMBASE,
        story: 'Yeni kurulmuş bir Check Point gateway\'ine SSH ile bağlandınız; karşınızda <b>clish</b> var (istem <code>gw-a&gt;</code>). Gaia\'nın iki kabuğu vardır: işletim sistemi ayarları için <b>clish</b>, Check Point teşhis araçları için <b>expert</b> (bash). clish\'te yaptığınız değişiklik <b>hemen</b> çalışır ama <code>save config</code> demezseniz yeniden başlatmada kaybolur. Expert parolası: <code>' + PW + '</code>.',
        goals: ['clish\'te show / set ayrımı', '? ve kısaltma ile gezinmek', 'Çalışan ve kaydedilmiş yapılandırma farkı (show config-state)', 'save config', 'expert moda girip çıkmak'],
        tasks: [
            { t: 'Gaia sürümünü görüntüleyin.',
              why: '<code>show</code> yalnız okur. Destek kaydında ya da bir hotfix\'in uyup uymadığına bakarken ilk bilgi sürüm ve build\'dir.',
              hints: ['show + version.', '<code>show version ___</code>'], steps: ['show version all'],
              check: s => s.ev.ran(/^show version all$/) },
            { t: '<code>set interface eth1 </code> yazıp <kbd>?</kbd> ile bu arayüzde neleri ayarlayabileceğinizi görün.',
              why: 'clish\'te <kbd>?</kbd> o noktada yazılabilecekleri açıklamalarıyla listeler; Tab tek adayı tamamlar. Komut ağacında kaybolmamanın yolu budur.',
              hints: ['Komutun sonuna boşluk bırakıp ? basın.', '<code>set interface eth1 ?</code>'], steps: [{ help: 'set interface eth1 ' }],
              check: s => s.ev.helped(/^\s*set\s+int\S*\s+eth1\s+$/i) },
            { t: 'Kısaltma kullanarak yönlendirme tablosunu görüntüleyin (ör. <code>sh ro</code>).',
              why: 'Gaia clish, bir sözcüğü belirsiz olmayan en kısa önekiyle kabul eder. Belirsizse (ör. <code>show int</code>: interface/interfaces) daha fazla harf yazın.',
              hints: ['show route\'u kısaltın.', '<code>sh ro</code>'], steps: ['sh ro'],
              check: s => s.ev.abbrev('show route') },
            { t: 'Cihaz adını <code>gw-lab</code> yapın ve yapılandırmanın artık <b>kaydedilmemiş</b> olduğunu görün.',
              why: 'clish değişikliği anında çalışan sisteme uygular (istem hemen değişir), ama açılış yapılandırmasına yazmaz. <code>show config-state</code> bu farkı <code>unsaved</code> diye gösterir.',
              hints: ['set hostname, sonra config-state.', '<code>set hostname gw-lab</code> → <code>show config-state</code>'], steps: ['set hostname gw-lab', 'show config-state'],
              check: s => s.model.hostname === 'gw-lab' && s.ev.after(/^set hostname gw-lab$/, /^show config-state$/) },
            { t: 'Yapılandırmayı kalıcı kaydedin ve durumun <code>saved</code> olduğunu doğrulayın.',
              why: '<code>save config</code> çalışan yapılandırmayı açılış veritabanına yazar. Unutulursa ilk yeniden başlatmada (bakım, elektrik kesintisi) değişiklik sessizce geri gider — CheckMates\'te en sık görülen "rota kayboldu" nedenidir.',
              hints: ['İki kelimelik kaydetme komutu.', '<code>save config</code> → <code>show config-state</code>'], steps: ['save config', 'show config-state'],
              check: s => !s.dirty() && s.savedModel.hostname === 'gw-lab' && s.ev.after(/^save config$/, /^show config-state$/) },
            { t: 'Expert moda geçin, kurulu politikayı <code>fw stat</code> ile görün ve <code>exit</code> ile clish\'e dönün.',
              why: 'Check Point\'in teşhis araçları (fw, cpstat, cphaprob, fw monitor…) expert kabuğundadır. İstem <code>[Expert@gw-lab:0]#</code> olur. Uyarının dediği gibi OS ayarları yine clish\'ten yapılmalıdır.',
              hints: ['expert → parola → fw stat → exit.', '<code>expert</code>, parola <code>' + PW + '</code>, <code>fw stat</code>, <code>exit</code>'], steps: EX(['fw stat', 'exit']),
              check: s => s.ev.ranIn(/^fw stat$/, 'expert') && s.ev.after(/^fw stat$/, /^exit$/) },
            { t: 'Deneyin: eth2\'ye <code>LAB-TEST</code> açıklaması verin, <b>kaydetmeden</b> <code>reboot</code> edin (onay: <code>y</code>) ve açıklamanın gittiğini görün.',
              why: 'Açılışta son <code>save config</code> yüklenir; arada yapılan her şey kaybolur. Simülatör hangi değişikliklerin kaybolduğunu listeler. Gerçek cihazda bunu bakım penceresinde öğrenmek pahalıdır.',
              hints: ['comments → reboot → y → show interface eth2', '<code>set interface eth2 comments LAB-TEST</code> → <code>reboot</code> → <code>y</code>'],
              steps: ['set interface eth2 comments LAB-TEST', 'reboot', 'y', 'show interface eth2'],
              check: s => s.ev.list().some(e => e.reboot && e.lost.includes('interface eth2')) && s.model.ifs.eth2.comments !== 'LAB-TEST' },
            { t: 'Gördüğünüze göre: kaydedilmemiş bir clish değişikliği varken cihaz yeniden başlarsa ne olur?', ask: { choices: [['lost', 'Kaybolur: açılışta son save config ile kaydedilen yapılandırma yüklenir'], ['kept', 'Korunur: clish değişikliği anında uygulandığı için kalıcıdır'], ['auto', 'Gaia kapanırken otomatik kaydeder']], correct: 'lost' },
              why: '"Anında uygulanır" ile "kalıcıdır" farklı şeylerdir. Her clish oturumunu <code>save config</code> ile bitirin; <code>show config-state</code> emin olmanın yoludur.',
              hints: ['Az önceki reboot çıktısına bakın.', 'Açılışta hangi yapılandırma yükleniyor?'] },
        ],
        solution: ['show version all', { help: 'set interface eth1 ' }, 'sh ro', 'set hostname gw-lab', 'show config-state', 'save config', 'show config-state', 'expert', PW, 'fw stat', 'exit',
            'set interface eth2 comments LAB-TEST', 'reboot', 'y', 'show interface eth2', { answer: 7, v: 'lost' }],
        alts: [['show version all', { help: 'set int eth1 ' }, 'sh ro', 'set hostname gw-lab', 'sh config-state', 'save config', 'sh config-state', 'expert', PW, 'fw stat', 'exit',
            'set interface eth2 comments LAB-TEST', 'reboot', 'y', { answer: 7, v: 'lost' }]],
        verify: ['show version all', 'show config-state', 'show configuration'],
        learn: ['clish: OS ayarları (show/set/add/delete); expert: bash + Check Point araçları.', 'clish değişikliği anında çalışır, <code>save config</code> ile kalıcı olur.', '<code>show config-state</code>: saved / unsaved.', '? seçenekleri açıklamalı listeler; kısaltma belirsiz olmamalı.', 'Expert\'ten <code>exit</code> ile clish\'e dönülür.'],
        links: { cli: '#/cli/checkpoint', tool: '#/checkpoint/setup' }, cert: 'CCSA R81.20'
    },
    {
        id: 'cp-02', vendor: 'checkpoint', level: 1, title: 'Temel yapılandırma: arayüz, rota, DNS/NTP', minutes: 20, kind: 'firewall', hostname: 'gw-new', pre: ['cp-01'],
        up: ['eth1', 'eth2'], hosts: ['203.0.113.1', '10.64.10.254'], sim: Object.assign({ remote: ['10.128.0.0/16'] }, SIMBASE),
        story: 'İlk kurulum sihirbazından yeni çıkmış bir gateway: yalnız eth0 (yönetim) açık. eth1 internete (ağ geçidi <code>203.0.113.1</code>), eth2 iç ağa bağlı; iç ağdaki <code>10.128.0.0/16</code> şube ağlarına <code>10.64.10.254</code> çekirdek yönlendiricisi üzerinden gidiliyor. Gaia OS ayarlarını clish\'ten yapın ve <b>kaydetmeyi unutmayın</b>.',
        goals: ['set hostname', 'Arayüze IPv4 ve state on', 'Varsayılan ve statik rota', 'DNS ve NTP', 'save config ile kalıcılık'],
        tasks: [
            { t: 'Cihaz adını <code>gw-a</code> yapın.', why: 'Ad; loglarda, SmartConsole\'da ve istemde görünür. Gaia\'da ad değişikliği anında geçerlidir.',
              hints: ['set hostname', '<code>set hostname gw-a</code>'], steps: ['set hostname gw-a'], check: s => s.model.hostname === 'gw-a' },
            { t: '<b>eth2 (LAN):</b> <code>10.64.10.1/24</code> atayın ve arayüzü açın.',
              why: 'Gaia\'da IP ile açma/kapama ayrı komutlardır; IP verip <code>state on</code> demezseniz arayüz çalışmaz. Maske <code>mask-length</code> (önek) ile verilir.',
              hints: ['ipv4-address … mask-length …, sonra state on.', '<code>set interface eth2 ipv4-address 10.64.10.1 mask-length 24</code> → <code>set interface eth2 state on</code>'],
              steps: ['set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on'],
              check: s => { const i = s.model.ifs.eth2; return i.ip === '10.64.10.1' && i.len === 24 && i.state === 'on'; },
              fb: s => { const i = s.model.ifs.eth2; return i.ip === '10.64.10.1' && i.state !== 'on' ? 'IP doğru ama arayüz kapalı: state on.' : null; } },
            { t: '<b>eth1 (WAN):</b> <code>203.0.113.2/24</code> atayın ve açın.', why: 'WAN arayüzü açılmadan varsayılan rotanın ağ geçidine ulaşılamaz; Gaia o rotayı etkin saymaz.',
              hints: ['eth2 ile aynı iki komut.', '<code>set interface eth1 ipv4-address 203.0.113.2 mask-length 24</code> → <code>… state on</code>'],
              steps: ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on'],
              check: s => { const i = s.model.ifs.eth1; return i.ip === '203.0.113.2' && i.len === 24 && i.state === 'on'; } },
            { t: 'Varsayılan rota: <code>203.0.113.1</code>.', why: 'Gaia sözdizimi uzun ama düzenlidir: <code>set static-route &lt;hedef&gt; nexthop gateway address &lt;ip&gt; on</code>. Hedef olarak <code>default</code> yazılır.',
              hints: ['static-route default …', '<code>set static-route default nexthop gateway address 203.0.113.1 on</code>'], steps: ['set static-route default nexthop gateway address 203.0.113.1 on'], needs: [2],
              check: s => s.rib().some(r => r.len === 0 && r.gw === '203.0.113.1'),
              fb: s => (s.model.routes.default && !s.rib().some(r => r.len === 0)) ? 'Rota tanımlı ama etkin değil: ağ geçidi bağlı bir ağda olmalı (eth1 açık ve adresli mi?).' : null },
            { t: 'Şube ağları: <code>10.128.0.0/16</code> → <code>10.64.10.254</code>.', why: 'Daha özel önek varsayılan rotadan önce seçilir (en uzun önek eşleşmesi); şube trafiği internete değil iç yönlendiriciye gider.',
              hints: ['Hedef ağ/önek biçiminde.', '<code>set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on</code>'], steps: ['set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on'], needs: [1],
              check: s => s.rib().some(r => r.net === '10.128.0.0' && r.len === 16 && r.gw === '10.64.10.254') },
            { t: 'DNS birincil sunucu <code>10.64.10.53</code>; NTP birincil sunucu <code>10.64.10.123</code> (sürüm 4) ve NTP\'yi etkinleştirin.',
              why: 'Doğru saat; log sıralaması, sertifika ve VPN doğrulaması için şarttır. NTP sunucusu tanımlamak yetmez, servis <code>set ntp active on</code> ile açılır.',
              hints: ['set dns primary; set ntp server primary … version 4; set ntp active on', '<code>set dns primary 10.64.10.53</code> · <code>set ntp server primary 10.64.10.123 version 4</code> · <code>set ntp active on</code>'],
              steps: ['set dns primary 10.64.10.53', 'set ntp server primary 10.64.10.123 version 4', 'set ntp active on'],
              check: s => s.model.dns.primary === '10.64.10.53' && !!s.model.ntp.servers.primary && s.model.ntp.servers.primary.ip === '10.64.10.123' && s.model.ntp.active,
              fb: s => (s.model.ntp.servers.primary && !s.model.ntp.active) ? 'NTP sunucusu tanımlı ama servis kapalı: set ntp active on.' : null },
            { t: 'Ağ geçidini <code>ping</code> ile test edin.', why: 'Rota tablosu doğru görünse de kablo/ARP sorunu olabilir; ilk atlamaya ping en hızlı sağlamadır.',
              hints: ['clish\'te ping vardır.', '<code>ping 203.0.113.1</code>'], steps: ['ping 203.0.113.1'], needs: [2],
              check: s => s.ev.list().some(e => e.ping === '203.0.113.1' && e.ok) },
            { t: 'Yönlendirme tablosunu gösterin ve <b>tüm yapılandırmayı kaydedin</b>.',
              why: '<code>show route</code>\'da <code>S 0.0.0.0/0</code> ve <code>C</code> (bağlı) ağları görün. Sonra <code>save config</code>: kaydedilmezse bir sonraki yeniden başlatmada bu labdaki her şey kaybolur.',
              hints: ['show route, save config', '<code>show route</code> → <code>save config</code>'], steps: ['show route', 'save config'], needs: [0, 1, 2, 3, 4, 5],
              check: s => s.ev.ran(/^show route$/) && !s.dirty() && s.savedModel.hostname === 'gw-a' && !!s.savedModel.routes.default && !!s.savedModel.routes['10.128.0.0/16'] && s.savedModel.ntp.active,
              fb: s => s.dirty() ? 'Kaydedilmemiş değişiklik var (show config-state → unsaved): save config.' : null },
        ],
        solution: ['set hostname gw-a', 'set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on', 'set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on',
            'set static-route default nexthop gateway address 203.0.113.1 on', 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on',
            'set dns primary 10.64.10.53', 'set ntp server primary 10.64.10.123 version 4', 'set ntp active on', 'ping 203.0.113.1', 'show route', 'save config'],
        alts: [['set hostname gw-a', 'set interface eth1 ipv4-address 203.0.113.2 subnet-mask 255.255.255.0', 'set interface eth1 state on', 'set interface eth2 ipv4-address 10.64.10.1 subnet-mask 255.255.255.0', 'set interface eth2 state on',
            'set static-route default nexthop gateway address 203.0.113.1 on', 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on', 'set ntp active on', 'set ntp server primary 10.64.10.123 version 4', 'set dns primary 10.64.10.53',
            'ping 203.0.113.1', 'sh route', 'save config']],
        verify: ['show interfaces all', 'show route', 'show dns', 'show ntp servers', 'show configuration', 'show config-state'],
        learn: ['<code>set interface … ipv4-address … mask-length …</code> + <code>state on</code>.', '<code>set static-route default|&lt;ağ/önek&gt; nexthop gateway address &lt;ip&gt; on</code>.', 'Ağ geçidi bağlı bir ağda değilse rota etkin olmaz.', 'NTP: sunucu + <code>set ntp active on</code>.', 'Her oturumun sonu: <code>save config</code>.'],
        links: { tool: '#/checkpoint/route', cli: '#/cli/checkpoint' }, cert: 'CCSA R81.20'
    },
    {
        id: 'cp-06', vendor: 'checkpoint', level: 1, title: 'Sağlık kontrolü: sürüm, politika, CPU, bağlantılar', minutes: 15, kind: 'firewall', hostname: 'gw-a', pre: ['cp-01'], ordered: true,
        up: ['eth1', 'eth2', 'eth3'], start: BASE, sim: Object.assign({ flows: NOISE }, SIMBASE),
        story: '"Firewall\'da bir terslik var mı?" sorusu geldi. Uzmanların ilk beş dakikada baktığı yerleri sırayla gezin: sürüm, kurulu politika, CPU, canlı özet ekranı ve bağlantı tablosu. Expert parolası: <code>' + PW + '</code>.',
        goals: ['Sürüm ve kurulu politikayı doğrulamak', 'cpstat ile CPU okumak', 'cpview\'in ne gösterdiğini bilmek', 'Bağlantı tablosu doluluğunu okumak'],
        tasks: [
            { t: 'Gaia sürümünü clish\'ten görüntüleyin.', why: 'Sürüm/build; bilinen hatalar ve Jumbo Hotfix uyumu için ilk bilgidir.',
              hints: ['show version …', '<code>show version all</code>'], steps: ['show version all'], check: s => s.ev.ran(/^show version all$/) },
            { t: 'Expert moda geçip gateway\'de kurulu politikayı görün.', why: '<code>fw stat</code> hangi politikanın, ne zaman ve hangi arayüzlere kurulduğunu gösterir. Management\'ta değiştirdiğiniz kural "çalışmıyorsa" önce buraya bakın: kurulum tarihi eski olabilir.',
              hints: ['expert → fw stat', '<code>expert</code> → parola → <code>fw stat</code>'], steps: EX(['fw stat']), check: s => s.ev.ranIn(/^fw stat$/, 'expert') },
            { t: 'Kurulu politikanın adı nedir?', ask: { choices: [['LAB-Policy', 'LAB-Policy'], ['InitialPolicy', 'InitialPolicy'], ['defaultfilter', 'defaultfilter'], ['Standard', 'Standard']], correct: 'LAB-Policy' },
              why: '<code>InitialPolicy</code>: ilk kurulumdan sonra, management\'tan henüz politika kurulmamış gateway. <code>defaultfilter</code>: açılışta politika yüklenemediğinde devreye giren koruyucu filtre. İkisini görmek "politika kurulmamış" demektir.',
              hints: ['fw stat çıktısında POLICY sütunu.', 'Tarih sütunu da kurulumun ne zaman yapıldığını söyler.'] },
            { t: 'CPU kullanımını <code>cpstat</code> ile görün.', why: '<code>cpstat os -f cpu</code> kullanıcı/sistem/boşta yüzdelerini ve CPU sayısını verir; SNMP ile izlenen değerlerin kaynağı da budur.',
              hints: ['cpstat os -f …', '<code>cpstat os -f cpu</code>'], steps: EX(['cpstat os -f cpu']), check: s => s.ev.ran(/^cpstat os -f cpu$/) },
            { t: 'CPU ne kadar boşta (idle)?', ask: { choices: [['93', '%93 — rahat'], ['50', '%50 — orta'], ['7', '%7 — çok yoğun']], correct: '93' },
              why: 'Idle yüksekse sorun kaynak tüketimi değildir; başka yere (politika, rota, NAT) bakılır. Tek çekirdek %100 ama toplam düşük olabilir: çekirdek bazında cpview\'e bakın.',
              hints: ['"CPU Idle Time (%)" satırı.', 'Usage = 100 − Idle.'] },
            { t: 'Canlı özet ekranını (<code>cpview</code>) açın.', why: 'cpview CPU, bellek, bağlantı, throughput ve blade durumlarını tek ekranda, canlı gösterir; geçmiş için <code>cpview -t</code>. Sorun anında ilk açılacak ekrandır.',
              hints: ['Tek kelime.', '<code>cpview</code>'], steps: EX(['cpview']), check: s => s.ev.ran(/^cpview$/) },
            { t: 'Bağlantı tablosunun anlık ve tepe değerini görün.', why: '<code>#VALS</code> anlık, <code>#PEAK</code> tepe bağlantı sayısıdır. Tablo sınırına yaklaşılırsa yeni bağlantılar düşer (forumlarda "bağlantı tablosu doldu" vakası).',
              hints: ['fw tab -t connections …', '<code>fw tab -t connections -s</code>'], steps: EX(['fw tab -t connections -s']), check: s => s.ev.ran(/^fw tab -t connections -s$/) },
        ],
        solution: ['show version all', 'expert', PW, 'fw stat', { answer: 2, v: 'LAB-Policy' }, 'cpstat os -f cpu', { answer: 4, v: '93' }, 'cpview', 'fw tab -t connections -s', 'exit'],
        verify: ['show version all', 'fw stat', 'cpstat os -f cpu', 'cpview', 'fw tab -t connections -s'],
        learn: ['<code>fw stat</code>: politika adı + kurulum zamanı + arayüzler.', 'InitialPolicy / defaultfilter = gerçek politika kurulmamış.', '<code>cpstat os -f cpu</code>: idle yüksekse darboğaz CPU değil.', 'cpview: canlı tek ekran özet.', '<code>fw tab -t connections -s</code>: #VALS / #PEAK.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/3' }, cert: 'CCSA R81.20'
    },
    {
        id: 'cp-05', vendor: 'checkpoint', level: 4, title: 'ClusterXL: durum okuma ve kontrollü failover', minutes: 20, kind: 'firewall', hostname: 'gw-a-1', pre: ['cp-06'], ordered: true,
        up: ['eth1', 'eth2', 'eth3'],
        start: ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on', 'set interface eth2 ipv4-address 10.64.10.2 mask-length 24', 'set interface eth2 state on',
            'set interface eth3 ipv4-address 10.240.99.1 mask-length 24', 'set interface eth3 state on', 'set interface eth3 comments Sync', 'set static-route default nexthop gateway address 203.0.113.254 on'],
        sim: Object.assign({ cluster: { names: ['gw-a-1', 'gw-a-2'], ips: ['10.240.99.1', '10.240.99.2'], sync: 'eth3', ifs: ['eth1', 'eth2'], vips: { eth1: '203.0.113.1', eth2: '10.64.10.1' } } }, SIMBASE),
        story: 'İki üyeli bir ClusterXL (High Availability) kümesinin <b>gw-a-1</b> üyesindesiniz. Bu gece bu üyeye bakım yapılacak: önce kümenin sağlıklı olduğunu doğrulayın, sonra trafiği <b>kontrollü</b> biçimde diğer üyeye devredin ve bakım bitince üyeyi kümeye geri alın. Expert parolası: <code>' + PW + '</code>.',
        goals: ['cphaprob stat çıktısını okumak', 'Küme arayüzlerini ve sync\'i tanımak', 'clusterXL_admin down/up ile kontrollü failover', 'Yeniden alınan üyenin neden STANDBY kaldığını anlamak'],
        tasks: [
            { t: 'Expert moda geçip küme durumunu görüntüleyin.', why: '<code>cphaprob stat</code> (= <code>cphaprob state</code>) küme modunu, üyeleri, yüklerini, durumlarını ve aktif pnote\'ları gösterir; ClusterXL\'de ilk komuttur. clish karşılığı <code>show cluster state</code>.',
              hints: ['cphaprob …', '<code>cphaprob stat</code>'], steps: EX(['cphaprob stat']), loo: false, /* 6. görevin doğrulaması aynı komutu çalıştırır */
              check: s => s.ev.ran(/^cphaprob (stat|state)$|^show cluster state$/) },
            { t: 'Bu üyenin (local) durumu nedir?', ask: { choices: [['active', 'ACTIVE — trafiği bu üye taşıyor (%100)'], ['standby', 'STANDBY — yedekte bekliyor (%0)'], ['down', 'DOWN — arızalı']], correct: 'active' },
              why: 'HA modunda tek üye ACTIVE (%100 yük) olur. "Active PNOTEs: None" hiçbir kritik aygıtın sorun bildirmediğini gösterir.', hints: ['"(local)" satırının State sütunu.', 'Assigned Load sütununa da bakın.'] },
            { t: 'Küme arayüzlerini ve sanal (VIP) adresleri görüntüleyin.', why: '<code>cphaprob -a if</code> izlenen arayüzleri, durumlarını, sync arayüzünü (S) ve küme sanal IP\'lerini listeler. Bir arayüz DOWN görünürse üye failover yapar.',
              hints: ['cphaprob -a …', '<code>cphaprob -a if</code>'], steps: EX(['cphaprob -a if']), check: s => s.ev.ran(/^cphaprob -a (-m )?if$/) },
            { t: 'Hangi arayüz state sync (eşitleme) arayüzü?', ask: { choices: [['eth1', 'eth1'], ['eth2', 'eth2'], ['eth3', 'eth3']], correct: 'eth3' },
              why: 'Sync arayüzü bağlantı tablosunu üyeler arasında eşitler; failover\'da açık oturumların kopmamasını sağlar. Çıktıda <code>(S)</code> ile işaretlidir.', hints: ['(S) işaretine bakın.', 'Virtual cluster interfaces listesinde olmayan arayüz.'] },
            { t: 'Bakım için bu üyeyi yönetimsel olarak devre dışı bırakın (kontrollü failover).',
              why: '<code>clusterXL_admin down</code> üyeye ADMIN pnote\'u koyar; üye DOWN olur, diğer üye ACTIVE\'e geçer. Kablo çekmek ya da <code>cpstop</code> yerine bu yöntem kullanılır. Varsayılan hâli yeniden başlatmada kalıcı değildir (<code>-p</code> kalıcı yapar).',
              hints: ['clusterXL_admin …', '<code>clusterXL_admin down</code>'], steps: EX(['clusterXL_admin down']),
              check: s => { const c = s.cluster(); return c.local === 'DOWN' && c.peer === 'ACTIVE'; } },
            { t: 'Failover\'ı doğrulayın: küme durumunu yeniden görüntüleyin.', why: 'Artık local DOWN, diğer üye ACTIVE ve "Active PNOTEs: ADMIN" görünmeli. Failover sayacı da bir arttı. Her müdahaleden sonra sonucu çıktıyla doğrulayın.',
              hints: ['İlk komutun aynısı.', '<code>cphaprob stat</code>'], steps: EX(['cphaprob stat']),
              check: s => s.ev.list().some((e, i, L) => e.clstate === 'DOWN') },
            { t: 'Bakım bitti: üyeyi kümeye geri alın.', why: '<code>clusterXL_admin up</code> ADMIN pnote\'unu kaldırır. Üye kümeye döner.',
              hints: ['down\'un tersi.', '<code>clusterXL_admin up</code>'], steps: EX(['clusterXL_admin up']),
              check: s => { const c = s.cluster(); return !c.admin && c.local === 'STANDBY' && s.ev.ran(/^clusterXL_admin up$/); } },
            { t: 'Üye geri geldi ama neden ACTIVE değil de STANDBY?', ask: { choices: [['maintain', 'Küme "Maintain current active" ile çalışıyor: yeni ACTIVE üye görevde kalır, gereksiz ikinci failover yapılmaz'], ['broken', 'Üye hâlâ arızalı'], ['sync', 'Sync arayüzü koptu']], correct: 'maintain' },
              why: 'ClusterXL HA\'da geri dönüş davranışı ayarlanabilir: "Maintain current active Cluster Member" (varsayılan) ya da "Switch to higher priority Cluster Member". Varsayılanda her geri dönüş ikinci bir kesinti yaratmasın diye STANDBY kalınır.',
              hints: ['Çıktıda pnote var mı? Yoksa üye sağlıklı.', 'Küme nesnesindeki geri dönüş (recovery) ayarını düşünün.'] },
        ],
        solution: ['expert', PW, 'cphaprob stat', { answer: 1, v: 'active' }, 'cphaprob -a if', { answer: 3, v: 'eth3' }, 'clusterXL_admin down', 'cphaprob stat', 'clusterXL_admin up', { answer: 7, v: 'maintain' }, 'exit'],
        alts: [['expert', PW, 'cphaprob state', { answer: 1, v: 'active' }, 'cphaprob -a if', { answer: 3, v: 'eth3' }, 'clusterXL_admin down', 'exit', 'show cluster state', 'expert', PW, 'clusterXL_admin up', { answer: 7, v: 'maintain' }]],
        verify: ['cphaprob stat', 'cphaprob -a if', 'show cluster state'],
        learn: ['<code>cphaprob stat</code>: mod, üyeler, yük, durum, pnote.', '<code>cphaprob -a if</code>: izlenen arayüzler, sync (S), VIP\'ler.', 'Kontrollü failover: <code>clusterXL_admin down</code> / <code>up</code> (kalıcı için <code>-p</code>).', 'Varsayılan "Maintain current active": geri gelen üye STANDBY kalır.'],
        links: { tool: '#/checkpoint/clusterxl', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/1' }, cert: 'CCSE R81.20'
    },
    {
        id: 'cp-03', vendor: 'checkpoint', level: 5, title: '"Trafik geçmiyor": zdebug drop ile düşme nedenini bulmak', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-06'],
        up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1', '10.64.10.254'], start: BASE,
        sim: Object.assign({ nat: NAT, noise: NOISE, flows: [{ src: '10.64.20.50', dst: '172.24.50.10', dport: 443, in: 'eth2' }] }, SIMBASE),
        variants: [
            { key: 'rule', start: ['set static-route 10.64.20.0/24 nexthop gateway address 10.64.10.254 on'], sim: { rules: RULES(['10.64.10.0/24']), spoof: { eth2: ['10.64.10.0/24', '10.64.20.0/24'], eth3: ['172.24.50.0/24'] } } },
            { key: 'spoof', start: ['set static-route 10.64.20.0/24 nexthop gateway address 10.64.10.254 on'], sim: { rules: RULES(['10.64.10.0/24', '10.64.20.0/24']), spoof: { eth2: ['10.64.10.0/24'], eth3: ['172.24.50.0/24'] } } },
            { key: 'route', sim: { rules: RULES(['10.64.10.0/24', '10.64.20.0/24']), spoof: { eth2: ['10.64.10.0/24', '10.64.20.0/24'], eth3: ['172.24.50.0/24'] } } },
        ],
        story: '<b>Arıza kaydı:</b> "Yeni kat ağındaki (10.64.20.0/24) <code>10.64.20.50</code>, DMZ\'deki web sunucusuna (<code>172.24.50.10:443</code>) bağlanamıyor. Eski kat (10.64.10.0/24) sorunsuz." Yeni kat ağı, çekirdek yönlendirici <code>10.64.10.254</code> arkasında. Kurulu politika (SmartConsole\'da; gateway\'den değiştiremezsiniz):' + RBHTML
            + '<small>Cihazda başka trafik de akıyor. Her denemede farklı bir arıza gelir — "Yeni tur" ile tekrar oynayın. Expert parolası: <code>' + PW + '</code>.</small>',
        goals: ['Doğru politikanın kurulu olduğunu doğrulamak', 'fw ctl zdebug drop çıktısını filtreli okumak', 'Rulebase drop / Address spoofing / düşme yok ayrımı', 'Dönüş yolunu kernel\'e sormak', 'Düzeltmenin nerede yapılacağına karar vermek'],
        tasks: [
            { t: 'Expert moda geçip gateway\'de hangi politikanın kurulu olduğunu kontrol edin.', why: 'Kural SmartConsole\'da eklenmiş ama <b>kurulmamış</b> olabilir. <code>fw stat</code>\'taki politika adı ve tarih, management\'taki son kurulumla eşleşmeli.',
              hints: ['fw …', '<code>fw stat</code>'], steps: EX(['fw stat']), check: s => s.ev.ranIn(/^fw stat$/, 'expert') },
            { t: 'Kernel\'in düşürdüğü paketleri izleyin; çıktıyı yalnız <code>10.64.20.50</code> ile sınırlayın.',
              why: '<code>fw ctl zdebug drop</code> kernel\'in düşürdüğü her paketi ve <b>nedenini</b> canlı yazar. Filtresiz çalıştırırsanız yoğun cihazda satırlar akıp gider; <code>| grep &lt;ip&gt;</code> ile daraltın ve kısa süre çalıştırın.',
              hints: ['zdebug drop + grep', '<code>fw ctl zdebug drop | grep 10.64.20.50</code>'], steps: EX(['fw ctl zdebug drop | grep 10.64.20.50']),
              check: s => s.ev.zdebug(z => /10\.64\.20\.50/.test(z.grep || '')),
              fb: s => s.ev.zdebug(z => !z.grep) ? 'Filtresiz çalıştırdınız: başka hostların düşen paketleri de göründü. | grep 10.64.20.50 ekleyin.' : null },
            { t: 'Çıktı ne söylüyor?', ask: { choices: [['rule', 'Kural tabanı düşürüyor ("Rulebase drop - rule N")'], ['spoof', 'Anti-spoofing düşürüyor ("Address spoofing")'], ['none', 'Bu host için düşürme satırı yok: gateway paketi düşürmüyor']], correct: v => ({ rule: 'rule', spoof: 'spoof', route: 'none' })[v.key] },
              why: '<b>Rulebase drop - rule 5</b> = paket Cleanup kuralına düştü (eşleşen izin kuralı yok). <b>Address spoofing</b> = kaynak adres, geldiği arayüzün topolojisinde (anti-spoofing grubunda) tanımlı değil. <b>Satır yok</b> = kernel düşürmüyor; sorun başka yerde (rota, karşı taraf).',
              hints: ['"Reason:" kısmını okuyun.', 'Satır hiç gelmediyse bu da bir bulgudur.'] },
            { t: 'Gateway\'in <code>10.64.20.50</code>\'ye dönüş yolunu kernel\'e sorun.',
              why: '<code>ip route get &lt;ip&gt;</code> kernel\'in o hedefe hangi arayüzden ve hangi ağ geçidiyle gideceğini söyler. Yanıt paketleri iç ağ yerine internete (eth1) gidiyorsa istemci yanıtı hiç görmez — zdebug\'da da iz bırakmaz.',
              hints: ['ip route get …', '<code>ip route get 10.64.20.50</code>'], steps: EX(['ip route get 10.64.20.50']), check: s => s.ev.ran(/^ip route get 10\.64\.20\.50$/) },
            { t: 'Doğru düzeltme hangisi?', ask: { choices: [
                ['sc-rule', 'SmartConsole: LAN-Nets grubuna 10.64.20.0/24\'ü ekle (ya da Cleanup\'tan önce kural), politikayı kur'],
                ['sc-topo', 'SmartConsole: eth2 topolojisine (anti-spoofing grubu) 10.64.20.0/24\'ü ekle, politikayı kur'],
                ['route', 'clish: set static-route 10.64.20.0/24 nexthop gateway address 10.64.10.254 on + save config'],
                ['unload', 'fw unloadlocal ile politikayı kaldırıp tekrar denemek'],
                ['spoof-off', 'eth2\'de anti-spoofing\'i kapatmak / Detect moduna almak']], correct: v => ({ rule: 'sc-rule', spoof: 'sc-topo', route: 'route' })[v.key] },
              why: 'Kural ve topoloji management\'ta tanımlıdır; gateway CLI\'dan kalıcı olarak değiştirilemez. Rota ise Gaia OS ayarıdır: clish + <code>save config</code>. <code>fw unloadlocal</code> gateway\'i korumasız bırakır; anti-spoofing\'i kapatmak sorunu gizler, çözmez.',
              hints: ['Bulgunuz kural mı, topoloji mi, rota mı?', 'Hangisi Gaia OS\'ta, hangisi politikada yaşar?'] },
            { t: 'İş bitti: kernel debug bayraklarını varsayılana döndürün.', why: 'zdebug çıkarken kendi bayraklarını sıfırlar; yine de iş sonunda <code>fw ctl debug 0</code> çalıştırmak, başkasının açık bıraktığı debug\'ı da kapatan iyi bir alışkanlıktır.',
              hints: ['fw ctl debug …', '<code>fw ctl debug 0</code>'], steps: EX(['fw ctl debug 0']), needs: [1],
              check: s => s.ev.after(/^fw ctl zdebug/, /^fw ctl debug 0$/) },
        ],
        solution: v => ['expert', PW, 'fw stat', 'fw ctl zdebug drop | grep 10.64.20.50', { answer: 2, v: ({ rule: 'rule', spoof: 'spoof', route: 'none' })[v.key] }, 'ip route get 10.64.20.50',
            { answer: 4, v: ({ rule: 'sc-rule', spoof: 'sc-topo', route: 'route' })[v.key] }, 'fw ctl debug 0', 'exit'],
        verify: ['fw stat', 'fw ctl zdebug drop | grep <ip>', 'ip route get <ip>', 'show route'],
        learn: ['Önce <code>fw stat</code>: doğru politika kurulu mu?', '<code>fw ctl zdebug drop | grep &lt;ip&gt;</code>: düşme nedeni (kısa süre!).', 'Rulebase drop - rule N → kural; Address spoofing → arayüz topolojisi.', 'Düşme satırı yoksa: <code>ip route get</code>, <code>show route</code>, dönüş yolu.', 'Kural/topoloji SmartConsole\'da; rota clish\'te. <code>fw unloadlocal</code> çözüm değildir.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/0', tool: '#/checkpoint/policy' }, cert: 'CCSE R81.20'
    },
    {
        id: 'cp-04', vendor: 'checkpoint', level: 5, title: 'fw monitor ve tcpdump: paket nerede kayboluyor?', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-03'],
        up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1'], start: BASE,
        sim: Object.assign({ rules: RULES(['10.64.10.0/24']), spoof: { eth2: ['10.64.10.0/24'], eth3: ['172.24.50.0/24'] }, nat: NAT, noise: NOISE }, SIMBASE),
        variants: [
            { key: 'noarrive', sim: { flows: [{ src: '10.64.10.60', dst: '198.51.100.25', dport: 443, in: 'eth2', arrives: false }] } },
            { key: 'drop', sim: { flows: [{ src: '10.64.10.60', dst: '198.51.100.25', dport: 443, in: 'eth2' }], rules: RULES(['10.64.10.0/24'], ['http', 'dns']) } },
            { key: 'noreply', sim: { flows: [{ src: '10.64.10.60', dst: '198.51.100.25', dport: 443, in: 'eth2', reply: 'none' }] } },
            { key: 'nat', sim: { flows: [{ src: '10.64.10.60', dst: '198.51.100.25', dport: 443, in: 'eth2' }], nat: [] } },
        ],
        story: '<b>Arıza kaydı:</b> "10.64.10.60, internetteki <code>198.51.100.25:443</code> sunucusuna bağlanamıyor." Paketin gateway içinde nereye kadar gittiğini okuyun. <code>fw monitor</code> her paketi dört noktada gösterir: <b>i</b> (giriş, kural öncesi) → <b>I</b> (giriş, kural sonrası) → <b>o</b> (çıkış, NAT öncesi) → <b>O</b> (çıkış, kablo tarafı). LAN-Nets için eth1 arkasına Hide NAT tanımlı olmalı. '
            + '<small>Her denemede farklı bir arıza gelir — "Yeni tur" ile tekrar oynayın. Expert parolası: <code>' + PW + '</code>.</small>',
        goals: ['fw monitor ifadesi yazmak (accept host(…);)', 'i / I / o / O noktalarını okumak', 'tcpdump ile kablodaki paketi görmek', 'İstek yok / gateway düşürüyor / dönüş yok / NAT yok ayrımı'],
        tasks: [
            { t: '<code>fw monitor</code> ile <b>sunucu adresine</b> (<code>198.51.100.25</code>) giden/gelen paketleri yakalayın.',
              why: 'Filtreyi istemci yerine sunucu adresiyle yazın: Hide NAT\'tan sonra (O noktası) ve dönüşte kaynak/hedef değişir; istemci IP\'siyle filtrelerseniz çevrilmiş paketleri kaçırırsınız. Sunucu adresi her iki yönde sabittir.',
              hints: ['fw monitor -e "accept host(…);"', '<code>fw monitor -e "accept host(198.51.100.25);"</code>'], steps: EX(['fw monitor -e "accept host(198.51.100.25);"']),
              check: s => s.ev.fwmon(x => x.hosts.includes('198.51.100.25')),
              fb: s => s.ev.fwmon(x => x.hosts.includes('10.64.10.60') && !x.hosts.includes('198.51.100.25')) ? 'İstemci IP\'siyle filtrelediniz: NAT sonrası (O) ve dönüş paketleri görünmez. Sunucu adresini kullanın.' : null },
            { t: 'Dış arayüzde (eth1) kabloya ne çıktığını <code>tcpdump</code> ile görün (sunucu adresiyle filtreleyin).',
              why: 'tcpdump arayüzdeki paketleri (Check Point kernel\'inin dışından) gösterir: eth1\'de çıkan paketin kaynağı genel IP (203.0.113.2) olmalı. <code>-nn</code> ad/port çözümlemesini kapatır, <code>-i</code> arayüzü seçer.',
              hints: ['tcpdump -nni <arayüz> host <ip>', '<code>tcpdump -nni eth1 host 198.51.100.25</code>'], steps: EX(['tcpdump -nni eth1 host 198.51.100.25']),
              check: s => s.ev.tcpdump(x => x.dev === 'eth1' && /198\.51\.100\.25/.test(x.expr)) },
            { t: 'Çıktılara göre sorun nerede?', ask: { choices: [['noarrive', 'İstek gateway\'e hiç gelmiyor (i bile yok)'], ['drop', 'i var, I yok: gateway (kural tabanı) düşürüyor'], ['noreply', 'i, I, o, O var ve kaynak çevrilmiş; dönüş gelmiyor'], ['nat', 'O noktasında kaynak hâlâ 10.64.10.60: NAT yapılmamış, dönüş gelemez']], correct: v => v.key },
              why: 'Okuma anahtarı: hiç satır yok → sorun gateway\'den önce · yalnız <b>i</b> → kural/anti-spoofing düşürüyor · <b>O</b>\'da özel (10.x) kaynak → Hide NAT çalışmıyor, internet yanıtı geri yönlendiremez · <b>O</b> doğru, dönüş yok → karşı taraf ya da ISP.',
              hints: ['Hangi noktalar var: i, I, o, O?', 'O satırında kaynak adres ne?'] },
            { t: 'Sıradaki doğru adım hangisi?', ask: { choices: [['client', 'İstemci tarafı: ağ geçidi ayarı, ARP, anahtar portu, VLAN'], ['zdebug', 'fw ctl zdebug drop ile düşme nedenini görmek'], ['upstream', 'Dönüş yolu / karşı taraf: ISP, sunucu, uzak firewall'], ['sc-nat', 'SmartConsole: LAN ağı için Hide NAT (nesne NAT\'ı ya da NAT kuralı) tanımlayıp politikayı kurmak']], correct: v => ({ noarrive: 'client', drop: 'zdebug', noreply: 'upstream', nat: 'sc-nat' })[v.key] },
              why: 'fw monitor "nerede" sorusunu, zdebug "neden" sorusunu yanıtlar. NAT kuralları politikanın parçasıdır; gateway CLI\'dan değil SmartConsole\'dan düzeltilir.',
              hints: ['Sorun gateway\'in içinde mi, dışında mı?', 'İçindeyse nedeni hangi araç söyler?'] },
        ],
        solution: v => ['expert', PW, 'fw monitor -e "accept host(198.51.100.25);"', 'tcpdump -nni eth1 host 198.51.100.25', { answer: 2, v: v.key }, { answer: 3, v: ({ noarrive: 'client', drop: 'zdebug', noreply: 'upstream', nat: 'sc-nat' })[v.key] }, 'exit'],
        verify: ['fw monitor -e "accept host(<ip>);"', 'fw monitor -F "<src>,<sport>,<dst>,<dport>,<proto>"', 'tcpdump -nni <arayüz> host <ip>'],
        learn: ['i → I arası: kural tabanı / anti-spoofing; o → O arası: kaynak NAT.', 'Filtreyi NAT\'tan etkilenmeyen adresle (sunucu) yazın.', '<code>-F</code> tek yönlüdür; dönüş için ikinci -F verin.', 'tcpdump kablodaki gerçeği gösterir; fw monitor gateway\'in içini.', 'Hiç i yok → istemci tarafı; O\'da özel IP → NAT eksik.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/0', tool: '#/checkpoint/nat' }, cert: 'CCSE R81.20'
    },
    {
        id: 'cp-07', vendor: 'checkpoint', level: 5, title: 'Site-to-site VPN kurulmuyor: vpn tu ve IKE günlüğü', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-03'],
        up: ['eth1', 'eth2'], hosts: ['203.0.113.1'], start: BASE.slice(0, 6).concat(['set static-route default nexthop gateway address 203.0.113.1 on']), sim: SIMBASE,
        variants: [
            { key: 'proposal', sim: { vpn: { peer: '198.51.100.2', me: '203.0.113.2', local: '10.64.10.0/24', remote: '10.128.10.0/24', fail: 'proposal' } } },
            { key: 'psk', sim: { vpn: { peer: '198.51.100.2', me: '203.0.113.2', local: '10.64.10.0/24', remote: '10.128.10.0/24', fail: 'psk' } } },
            { key: 'ts', sim: { vpn: { peer: '198.51.100.2', me: '203.0.113.2', local: '10.64.10.0/24', remote: '10.128.10.0/24', fail: 'ts', proposed: '10.64.0.0/16' } } },
        ],
        story: '<b>Arıza kaydı:</b> "Şube ile (üçüncü parti firewall, <code>198.51.100.2</code>) VPN kurulmuyor; LAN <code>10.64.10.0/24</code> ↔ şube <code>10.128.10.0/24</code>." Karşı uç IKEv2, AES-256/SHA-256, DH 14 bekliyor ve seçici olarak yalnız 10.64.10.0/24 kabul ediyor. Tünelin hangi aşamada kaldığını bulun. '
            + '<small>Her denemede farklı bir arıza gelir. Expert parolası: <code>' + PW + '</code>.</small>',
        goals: ['vpn tu tlist ile SA durumunu okumak', 'vpn debug trunc ile IKE debug açmak', 'IKE sonucunu (notify) yorumlamak', 'Faz 1 / faz 2 ayrımı', 'Debug\'ı kapatmak'],
        tasks: [
            { t: 'Expert moda geçip tünel listesini görüntüleyin.', why: '<code>vpn tu tlist</code> eş başına IKE/IPsec SA\'ları tablo olarak verir. Eşin satırı yoksa tünel hiç kurulmamıştır. Menü sürümü: <code>vpn tu</code>.',
              hints: ['vpn tu …', '<code>vpn tu tlist</code>'], steps: EX(['vpn tu tlist']), check: s => s.ev.ran(/^vpn tu tlist$/) },
            { t: 'Günlükleri sıfırlayıp VPN/IKE debug\'ını başlatın.', why: '<code>vpn debug trunc</code> ike ve vpnd günlüklerini sıfırlar ve debug\'ı açar; böylece yalnız yeni denemeyi okursunuz. IKEv2 ayrıntısı <code>$FWDIR/log/ikev2.xmll</code> dosyasına yazılır (IKEView ile açılır).',
              hints: ['vpn debug …', '<code>vpn debug trunc</code>'], steps: EX(['vpn debug trunc']), check: s => s.ev.ran(/^vpn debug trunc$/) },
            { t: 'IKE günlüğünü okuyun (<code>$FWDIR/log/ikev2.xmll</code>).', why: 'IKE pazarlığının hangi mesajda ve hangi bildirimle (notify) kesildiği kök nedeni söyler: öneri mi, kimlik doğrulama mı, trafik seçicisi mi?',
              hints: ['cat ile dosyayı açın.', '<code>cat $FWDIR/log/ikev2.xmll</code>'], steps: EX(['cat $FWDIR/log/ikev2.xmll']), needs: [1],
              check: s => { const L = s.ev.list(), i = L.findIndex(e => e.canon === 'vpn debug trunc'); return i >= 0 && L.slice(i + 1).some(e => e.ikelog); } },
            { t: 'Tünel hangi aşamada kalmış?', ask: { choices: [['p1down', 'Faz 1 (IKE SA) kurulamıyor'], ['p2down', 'Faz 1 kurulu, faz 2 (IPsec SA) kurulamıyor'], ['up', 'Tünel kurulu, sorun trafikte']], correct: v => (v.key === 'ts' ? 'p2down' : 'p1down') },
              why: 'IKEv2\'de IKE_SA_INIT + IKE_AUTH faz 1\'e, CHILD_SA faz 2\'ye karşılık gelir. Faz 1 sorunları öneri ve kimliktir; faz 2 sorunları seçiciler (encryption domain).',
              hints: ['IKE_AUTH tamam mı?', 'tlist\'te IKE SA var mı?'] },
            { t: 'Kök neden hangisi?', ask: { choices: [['proposal', 'Faz 1 önerisi uyuşmuyor (NO_PROPOSAL_CHOSEN)'], ['psk', 'Ön paylaşımlı anahtar farklı (AUTHENTICATION_FAILED)'], ['ts', 'Check Point encryption domain\'i birleştirip daha geniş ağ (10.64.0.0/16) öneriyor; karşı uç reddediyor (TS_UNACCEPTABLE)']], correct: v => v.key },
              why: 'Check Point bitişik ağları birleştirerek (supernetting) daha geniş seçici önerebilir; üçüncü parti cihazlar yalnız birebir eşleşen seçiciyi kabul eder. Çözüm community\'de tünel paylaşımını alt ağ çifti başına ayarlamak ve encryption domain\'i karşı uçla birebir eşlemektir.',
              hints: ['Notify adına bakın.', 'Önerilen TS, karşı ucun beklediğiyle aynı mı?'] },
            { t: 'Düzeltme nerede yapılır?', ask: { choices: [['sc', 'SmartConsole: VPN community / gateway ayarları (şifreleme, paylaşılan anahtar, encryption domain, tünel paylaşımı) ve politika kurulumu'], ['clish', 'Gaia clish: set vpn … + save config'], ['tu', 'vpn tu ile SA\'ları silmek sorunu kalıcı çözer'], ['unload', 'fw unloadlocal']], correct: 'sc' },
              why: 'VPN community ayarları politikanın parçasıdır. <code>vpn tu</code> ile SA silmek yalnız yeniden pazarlığı tetikler; yanlış ayarı düzeltmez.',
              hints: ['VPN ayarları hangi arayüzde yaşar?', 'Gaia OS mu, politika mı?'] },
            { t: 'Debug\'ı kapatın.', why: 'Açık kalan VPN debug\'ı disk ve CPU tüketir. <code>vpn debug ikeoff</code> ve <code>vpn debug off</code> ile kapatın.',
              hints: ['ikeoff ve off.', '<code>vpn debug ikeoff</code> → <code>vpn debug off</code>'], steps: EX(['vpn debug ikeoff', 'vpn debug off']), needs: [1],
              check: s => s.ev.ran(/^vpn debug trunc$/) && !s.vpnDebug().ike && !s.vpnDebug().vpn },
        ],
        solution: v => ['expert', PW, 'vpn tu tlist', 'vpn debug trunc', 'cat $FWDIR/log/ikev2.xmll', { answer: 3, v: v.key === 'ts' ? 'p2down' : 'p1down' }, { answer: 4, v: v.key }, { answer: 5, v: 'sc' }, 'vpn debug ikeoff', 'vpn debug off', 'exit'],
        verify: ['vpn tu tlist', 'vpn tu', 'vpn debug trunc', 'cat $FWDIR/log/ikev2.xmll'],
        learn: ['<code>vpn tu tlist</code>: eş başına SA tablosu.', '<code>vpn debug trunc</code> → trafik → günlük → <code>vpn debug ikeoff</code>/<code>off</code>.', 'NO_PROPOSAL_CHOSEN / AUTHENTICATION_FAILED → faz 1; TS_UNACCEPTABLE → faz 2 seçicisi.', 'Supernetting: encryption domain\'i ve tünel paylaşımını karşı uçla eşleyin.', 'Düzeltme SmartConsole\'da; vpn tu yalnız SA siler.'],
        links: { tool: '#/checkpoint/s2svpn', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/2' }, cert: 'CCSE R81.20'
    },
    { id: 'cp-sandbox', vendor: 'checkpoint', level: null, sandbox: true, title: 'Serbest terminal — Check Point Gaia', kind: 'firewall', hostname: 'gw-a', up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1', '10.64.10.254'],
      start: BASE, sim: Object.assign({ rules: RULES(['10.64.10.0/24']), spoof: { eth2: ['10.64.10.0/24'], eth3: ['172.24.50.0/24'] }, nat: NAT, flows: [{ src: '10.64.10.60', dst: '198.51.100.25', dport: 443, in: 'eth2' }], noise: NOISE }, SIMBASE),
      story: 'eth1 (WAN 203.0.113.2/24), eth2 (LAN 10.64.10.1/24), eth3 (DMZ 172.24.50.1/24) yapılandırılmış bir gateway. Görev yok: clish\'te <kbd>?</kbd> ile gezinin, <code>expert</code> (parola <code>' + PW + '</code>) ile fw stat, fw ctl zdebug drop, fw monitor, tcpdump deneyin.', tasks: [] },
    ];
    // Çoktan seçmeli (ask) görevler: cevap s.answers['<lab>:<görev>'] içinde
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
    const root = typeof window !== 'undefined' ? window : globalThis;
    const OWN = new Set(LABS.map(l => l.id));
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
