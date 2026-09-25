'use strict';
// ─── CLI Lab içerikleri: F5 BIG-IP (TMOS 17.1 görünümü: bash + tmsh) ──────────
// Motor: assets/js/lab/tmsh.js. Hedefler: F5-CAB (Certified Administrator, BIG-IP) blueprint F5-CAB.0425.
// Adresler yalnız güvenli örnek bloklardan: yönetim 10.240.0.0/16, iç ağlar 10.64.0.0/16, dış 203.0.113.0/24, uzak 198.51.100.0/24.
(function () {
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const lastIdx = (L2, f) => { for (let i = L2.length - 1; i >= 0; i--) if (f(L2[i])) return i; return -1; };
    const pingOk = (s, ip) => s.ev.list().some(e => e.ping === ip && e.ok);
    // Ortak kablolama: 1.1 = dış trunk (VLAN 20), 1.2 = sunucu switch'i access (VLAN 10), 1.3 = iç trunk (VLAN 30)
    const SW = { '1.1': { mode: 'trunk', vlans: [20] }, '1.2': { mode: 'access', vlan: 10 }, '1.3': { mode: 'trunk', vlans: [30] } };
    const HOSTS = [{ ip: '203.0.113.1', vlan: 20 }, { ip: '10.64.10.50', vlan: 30 }, { ip: '10.64.30.50', vlan: 10 }];
    const SIM = { sw: SW, hosts: HOSTS, remote: ['198.51.100.0/24'], mgmtHosts: ['10.240.10.1'], mgmtRemote: ['10.240.0.0/16'], adminSrc: '10.240.20.5' };
    const UP = ['1.1', '1.2', '1.3'];
    // İlk kurulum tamamlanmış hâl (f5-02'nin çözümü)
    const NET = ['create sys management-ip 10.240.10.11/24', 'create sys management-route default gateway 10.240.10.1',
        'create net vlan external interfaces add { 1.1 { tagged } } tag 20', 'create net vlan internal interfaces add { 1.3 { tagged } } tag 30', 'create net vlan server interfaces add { 1.2 { untagged } } tag 10',
        'create net self self_ext address 203.0.113.11/24 vlan external allow-service none', 'create net self self_int address 10.64.10.11/24 vlan internal allow-service default',
        'create net self self_srv address 10.64.30.11/24 vlan server allow-service none', 'create net route default network default gw 203.0.113.1'];

    const LABS = [
    // ═══ 0 · bash ve tmsh ═══
    {
        id: 'f5-01', vendor: 'f5-ltm', level: 0, title: 'BIG-IP\'ye ilk bakış: bash ve tmsh, list / show, save sys config', minutes: 15, kind: 'adc', hostname: 'bigip-a.lab.example', ordered: true,
        up: UP, sim: SIM, start: NET.slice(0, 5),
        story: 'Bir BIG-IP\'ye SSH ile <b>root</b> olarak bağlandınız. Karşınızda Linux kabuğu (<b>bash</b>) var; istem <code>[root@bigip-a:Active:Standalone] config #</code>. BIG-IP\'nin asıl yönetim kabuğu <b>tmsh</b>\'tir (Traffic Management Shell). Bu lab\'da iki kabuk arasında gezinmeyi, yapılandırma (<code>list</code>) ile durumu (<code>show</code>) ayırmayı ve değişikliği kalıcı kaydetmeyi öğreneceksiniz.',
        lesson: L('BIG-IP\'de iki kabuk vardır. <b>bash</b> Linux kabuğudur: log dosyaları, <code>ping</code>, <code>tcpdump</code>, <code>qkview</code> buradadır. <b>tmsh</b> ise cihazın yapılandırma ve durum kabuğudur: <code>list</code> yapılandırmayı, <code>show</code> çalışma durumunu ve istatistikleri gösterir; <code>create / modify / delete</code> değiştirir. tmsh değişiklikleri çalışan yapılandırmaya anında uygulanır ama dosyaya (<code>/config/bigip.conf</code>, <code>bigip_base.conf</code>) ancak <code>save sys config</code> ile yazılır. bash\'ten tek bir tmsh komutu <code>tmsh &lt;komut&gt;</code> ile, tmsh\'ten bash <code>run util bash</code> ile çalıştırılır.',
            'Kaydedilmeyen tmsh değişikliği ilk yeniden başlatmada kaybolur. GUI her değişikliği kendisi kaydeder, tmsh kaydetmez: CLI\'a geçen yöneticilerin en sık yaşadığı sürpriz budur.',
            'tmsh\nshow sys version\nlist net vlan\nshow net interface\nmodify sys global-settings hostname bigip-lab.lab.example\nsave sys config\nquit\ntmsh list sys global-settings hostname',
            ['bash\'te tmsh komutunu doğrudan yazmak (<code>list net vlan</code> → command not found).', 'list ile show\'u karıştırmak: list yapılandırmayı, show durumu gösterir.', '<code>save sys config</code>\'i unutmak.', 'Cihaz adını alan adsız vermek (tmsh FQDN ister).']),
        goals: ['bash ve tmsh istemlerini tanımak', 'list (yapılandırma) ve show (durum)', '? ile komut keşfi', 'save sys config ile kalıcılık', 'bash\'ten tek komutluk tmsh'],
        tasks: [
            { t: 'tmsh\'e geçin ve yazılım sürümünü görüntüleyin.', why: 'İstem <code>root@(bigip-a)(cfg-sync Standalone)(Active)(/Common)(tmos)#</code> olur: cihaz adı, HA senkron durumu, aktiflik, bulunduğunuz klasör (partition) ve modül. Sürüm; destek kaydında ve yükseltme planında ilk bilgidir.',
              hints: ['tmsh, sonra show sys …', '<code>tmsh</code> → <code>show sys version</code>'], steps: ['tmsh', 'show sys version'],
              check: s => s.ev.ran(/^tmsh show sys version$/) },
            { t: 'VLAN yapılandırmasını (<code>list</code>) ve arayüz durumunu (<code>show</code>) görüntüleyin.', why: '<code>list net vlan</code> yapılandırılmış VLAN\'ları (arayüz, tagged/untagged, tag) gösterir. <code>show net interface</code> ise fiziksel arayüzlerin çalışma durumunu ve sayaçlarını gösterir. Biri "ne ayarlandı", diğeri "şu an ne oluyor" sorusunun cevabıdır.',
              hints: ['list net vlan; show net interface', '<code>list net vlan</code> → <code>show net interface</code>'], steps: ['tmsh', 'list net vlan', 'show net interface'],
              check: s => s.ev.ran(/^tmsh list net vlan$/) && s.ev.ran(/^tmsh show net interface$/) },
            { t: 'Soru: <code>show net interface</code> çıktısına göre hangi veri arayüzünün bağlantısı yok?', ask: { choices: [['1.4', '1.4'], ['1.1', '1.1'], ['1.2', '1.2'], ['mgmt', 'mgmt']], correct: '1.4' },
              why: 'Status sütununda <code>up</code> bağlantı var, <code>down</code> kablo/karşı port yok, <code>DS</code> yönetimsel olarak kapatılmış demektir. Media sütunu da <code>none</code> görünür.',
              hints: ['Status sütunu', 'Media sütunu none olan satır'] },
            { t: '<code>list net </code> yazıp <kbd>?</kbd> ile bu noktada yazılabilecekleri görün.', why: 'tmsh\'te <kbd>?</kbd> o noktadaki seçenekleri listeler, <kbd>Tab</kbd> tamamlar. Komut ağacında kaybolmamanın yolu budur.',
              hints: ['Sonuna boşluk bırakıp ? basın.', '<code>list net ?</code>'], steps: ['tmsh', { help: 'list net ' }],
              check: s => s.ev.helped(/^\s*list\s+net\s+$/) },
            { t: 'Cihaz adını <code>bigip-lab.lab.example</code> yapın ve yapılandırmayı kaydedin.', why: 'Ad tam alan adı (FQDN) olmalıdır; istem hemen değişir. <code>save sys config</code> çalışan yapılandırmayı <code>/config/*.conf</code> dosyalarına yazar.',
              hints: ['modify sys global-settings hostname …; save sys config', '<code>modify sys global-settings hostname bigip-lab.lab.example</code> → <code>save sys config</code>'],
              steps: ['tmsh', 'modify sys global-settings hostname bigip-lab.lab.example', 'save sys config'],
              check: s => s.model.hostname === 'bigip-lab.lab.example' && !s.dirty(),
              fb: s => (s.model.hostname === 'bigip-lab.lab.example' && s.dirty() ? 'Ad değişti ama kaydedilmedi: save sys config.' : null) },
            { t: 'tmsh\'ten çıkın (<code>quit</code>) ve bash\'ten tek bir tmsh komutuyla cihaz adını listeleyin.', why: 'bash\'te <code>tmsh &lt;komut&gt;</code> tek komut çalıştırıp geri döner. Betiklerde ve log incelerken sık kullanılır.',
              hints: ['quit; tmsh list sys global-settings …', '<code>quit</code> → <code>tmsh list sys global-settings hostname</code>'], steps: ['tmsh list sys global-settings hostname'],
              check: s => s.ev.list().some(e => e.mode === 'bash' && e.tmshOne && /^list sys global-settings/.test(e.tmshOne)) },
            { t: 'Soru: <code>save sys config</code> yapılmadan cihaz yeniden başlarsa tmsh ile yapılan değişikliklere ne olur?', ask: { choices: [['lost', 'Kaybolur: açılışta /config dosyalarındaki kayıtlı yapılandırma yüklenir'], ['kept', 'Korunur: tmsh değişikliği anında uygulandığı için kalıcıdır'], ['gui', 'GUI\'ye girilince otomatik kaydedilir']], correct: 'lost' },
              why: 'tmsh, çalışan yapılandırmayı (mcpd) değiştirir. Dosyaya yazmak ayrı bir adımdır. GUI her değişiklikte kaydeder; tmsh kaydetmez.', hints: ['Açılışta hangi yapılandırma yüklenir?', 'Çalışan ile kayıtlı yapılandırma farkı.'] },
        ],
        // görevler testte ayrı ayrı bash'ten başlar; örnek çözüm tek oturumdur
        solution: ['tmsh', 'show sys version', 'list net vlan', 'show net interface', { answer: 2, v: '1.4' }, { help: 'list net ' }, 'modify sys global-settings hostname bigip-lab.lab.example', 'save sys config', 'quit', 'tmsh list sys global-settings hostname', { answer: 6, v: 'lost' }],
        verify: ['tmsh show sys version', 'tmsh list net vlan', 'tmsh show net interface'],
        learn: ['bash = Linux; tmsh = BIG-IP yönetim kabuğu.', 'list = yapılandırma, show = durum.', 'save sys config olmadan değişiklik kalıcı değil.', 'bash\'ten tek komut: tmsh <komut>; tmsh\'ten bash: run util bash.'],
        links: { cli: '#/cli/f5-ltm', wizard: '#/troubleshoot/f5-ltm/102' }, cert: 'F5CAB4 · Control Plane Administration'
    },
    // ═══ 1 · İlk kurulum ═══
    {
        id: 'f5-02', vendor: 'f5-ltm', level: 1, title: 'İlk kurulum: yönetim IP\'si, VLAN (tagged / untagged), self IP ve rota', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-01'],
        up: UP, sim: SIM, start: [], startMode: 'tmsh',
        story: 'Yeni bir BIG-IP VE kuruldu, yapılandırma boş. Kablolama: <b>1.1</b> dış switch\'e <b>trunk</b> (VLAN 20), <b>1.3</b> iç switch\'e <b>trunk</b> (VLAN 30), <b>1.2</b> sunucu switch\'ine <b>access</b> port (VLAN 10). Yönetim ağı <code>10.240.10.0/24</code> (ağ geçidi <code>.1</code>). İnternet ağ geçidi <code>203.0.113.1</code>.',
        lesson: L('Veri düzleminde (TMM) trafik <b>VLAN</b> ve <b>self IP</b> üzerinden akar. VLAN\'a arayüz <b>tagged</b> (802.1Q etiketli, trunk port) ya da <b>untagged</b> (etiketsiz, access port) eklenir; tagged üyelik için <code>tag</code> switch\'teki VLAN numarası olmalıdır. Bir arayüz yalnız bir VLAN\'da untagged, birçok VLAN\'da tagged olabilir. <b>Self IP</b>, BIG-IP\'nin o VLAN\'daki adresidir; <code>allow-service</code> (port lockdown) bu adrese hangi servislerin açık olduğunu belirler (varsayılan: none). Yönetim arayüzü (mgmt) ayrıdır: <code>sys management-ip</code> ve <code>sys management-route</code> ile ayarlanır, veri trafiği taşımaz.',
            'Tagged/untagged ya da tag numarası switch ile uyuşmazsa hiçbir hata çıkmaz ama trafik de geçmez. Dışa bakan self IP\'de port lockdown açık bırakılırsa yönetim servisleri internete açılır.',
            'create sys management-ip 10.240.10.11/24\ncreate sys management-route default gateway 10.240.10.1\ncreate net vlan external interfaces add { 1.1 { tagged } } tag 20\ncreate net vlan server interfaces add { 1.2 { untagged } } tag 10\ncreate net self self_ext address 203.0.113.11/24 vlan external allow-service none\ncreate net route default network default gw 203.0.113.1\nsave sys config',
            ['Switch access portuna bağlı arayüzü tagged eklemek (ya da tersi).', 'Tag vermeyi unutmak: sistem 4094\'ten geriye otomatik bir numara seçer; tagged VLAN\'da bu switch ile uyuşmaz.', 'Dışa bakan self IP\'de allow-service default/all bırakmak.', 'Yönetim IP\'sini veri VLAN\'larından birinin ağına koymak.', 'save sys config\'i unutmak.']),
        goals: ['Yönetim IP\'si ve yönetim rotası', 'Tagged ve untagged VLAN', 'Self IP ve port lockdown', 'Varsayılan rota', 'ping ile uçtan uca doğrulama'],
        tasks: [
            { t: 'Yönetim IP\'sini <code>10.240.10.11/24</code>, yönetim varsayılan rotasını <code>10.240.10.1</code> yapın.', why: 'Yönetim arayüzü (mgmt) veri trafiğinden ayrıdır; kendi IP\'si ve rotası vardır. GUI ve SSH erişimi normalde buradan olur.',
              hints: ['create sys management-ip …; create sys management-route default gateway …', '<code>create sys management-ip 10.240.10.11/24</code> → <code>create sys management-route default gateway 10.240.10.1</code>'],
              steps: ['create sys management-ip 10.240.10.11/24', 'create sys management-route default gateway 10.240.10.1'],
              check: s => s.model.mgmtIp === '10.240.10.11/24' && !!s.model.mgmtRoutes.default && s.model.mgmtRoutes.default.gateway === '10.240.10.1' },
            { t: '<b>external</b> VLAN: 1.1 üzerinde <b>tagged</b>, tag <code>20</code>. <b>internal</b> VLAN: 1.3 üzerinde <b>tagged</b>, tag <code>30</code>.', why: '1.1 ve 1.3 switch\'te trunk port: çerçeveler 802.1Q etiketiyle gelir. Tag, switch\'teki VLAN numarasıyla aynı olmalı.',
              hints: ['create net vlan … interfaces add { 1.1 { tagged } } tag 20', '<code>create net vlan external interfaces add { 1.1 { tagged } } tag 20</code> · <code>create net vlan internal interfaces add { 1.3 { tagged } } tag 30</code>'],
              steps: ['create net vlan external interfaces add { 1.1 { tagged } } tag 20', 'create net vlan internal interfaces add { 1.3 { tagged } } tag 30'],
              check: s => { const e = s.model.vlans.external, i = s.model.vlans.internal; return !!e && !!i && e.ifs['1.1'] === 'tagged' && e.tag === 20 && i.ifs['1.3'] === 'tagged' && i.tag === 30; } },
            { t: '<b>server</b> VLAN: 1.2 üzerinde <b>untagged</b> (switch portu access, VLAN 10). Tag olarak <code>10</code> verin.', why: 'Access portta etiket yoktur; BIG-IP de etiketsiz göndermelidir. Tag verilmezse sistem otomatik bir numara seçer; untagged VLAN\'da kabloya yansımaz ama okuyanı yanıltır, bu yüzden switch ile aynı numarayı vermek iyi uygulamadır.',
              hints: ['interfaces add { 1.2 { untagged } } tag 10', '<code>create net vlan server interfaces add { 1.2 { untagged } } tag 10</code>'],
              steps: ['create net vlan server interfaces add { 1.2 { untagged } } tag 10'],
              check: s => { const v = s.model.vlans.server; return !!v && v.ifs['1.2'] === 'untagged'; },
              fb: s => { const v = s.model.vlans.server; return v && v.autoTag ? 'Çalışır ama tag verilmedi: sistem ' + v.tag + ' seçti. Untagged üyelikte kabloya yansımaz, yine de switch ile aynı numarayı (10) verin.' : null; } },
            { t: 'Self IP\'ler: <code>self_ext</code> 203.0.113.11/24 (external, allow-service <b>none</b>), <code>self_int</code> 10.64.10.11/24 (internal, allow-service <b>default</b>), <code>self_srv</code> 10.64.30.11/24 (server, allow-service <b>none</b>).',
              why: 'Self IP, BIG-IP\'nin o ağdaki adresidir. <code>allow-service</code> (port lockdown) bu adrese gelen yönetim/servis trafiğini belirler: dışa bakan adreste <b>none</b>; <b>default</b> ise SSH, HTTPS, SNMP, DNS ve HA portlarını açar.',
              hints: ['create net self … address … vlan … allow-service …', '<code>create net self self_ext address 203.0.113.11/24 vlan external allow-service none</code> (diğer ikisi aynı biçimde)'],
              steps: ['create net self self_ext address 203.0.113.11/24 vlan external allow-service none', 'create net self self_int address 10.64.10.11/24 vlan internal allow-service default', 'create net self self_srv address 10.64.30.11/24 vlan server allow-service none'], needs: [1, 2],
              check: s => { const S2 = s.model.selfs; return !!S2.self_ext && S2.self_ext.address === '203.0.113.11/24' && S2.self_ext.vlan === 'external' && !!S2.self_int && S2.self_int.vlan === 'internal' && S2.self_int.address === '10.64.10.11/24' && !!S2.self_srv && S2.self_srv.vlan === 'server' && S2.self_srv.address === '10.64.30.11/24'; },
              fb: s => (s.selfAllows('self_ext', 'tcp:443') || s.selfAllows('self_ext', 'tcp:22') ? 'Çalışır ama dışa bakan self IP\'de (self_ext) yönetim portları açık: allow-service none olmalı.' : null) },
            { t: 'Varsayılan rota: <code>203.0.113.1</code>.', why: 'Veri düzleminin varsayılan rotası <code>net route</code> ile verilir; yönetim rotasından ayrıdır. Ağ geçidi bir self IP\'nin ağında olmalı.',
              hints: ['create net route default network default gw …', '<code>create net route default network default gw 203.0.113.1</code>'], steps: ['create net route default network default gw 203.0.113.1'], needs: [1, 2, 3],
              check: s => !!s.model.routes.default && s.model.routes.default.gw === '203.0.113.1' && s.model.routes.default.network === 'default' },
            { t: 'Doğrulayın: ağ geçidine, iç ağdaki bir istemciye (<code>10.64.10.50</code>) ve sunucu ağındaki bir sunucuya (<code>10.64.30.50</code>) ping atın.', why: 'Ping başarılıysa arayüz, VLAN modu, tag ve self IP uçtan uca doğrudur. tmsh\'ten ping <code>run util ping</code> ile atılır (bash\'te doğrudan <code>ping</code>).',
              hints: ['run util ping …', '<code>run util ping -c 2 203.0.113.1</code> → <code>… 10.64.10.50</code> → <code>… 10.64.30.50</code>'],
              steps: ['run util ping -c 2 203.0.113.1', 'run util ping -c 2 10.64.10.50', 'run util ping -c 2 10.64.30.50'], needs: [1, 2, 3],
              check: s => ['203.0.113.1', '10.64.10.50', '10.64.30.50'].every(ip => pingOk(s, ip)) },
            { t: 'Yapılandırmayı kaydedin.', why: 'Ağ ayarları <code>/config/bigip_base.conf</code> dosyasına yazılır. Bu dosya HA eşleri arasında senkronlanmaz: her cihazın kendi ağ ayarı vardır.',
              hints: ['save sys config', '<code>save sys config</code>'], steps: ['save sys config'], needs: [0, 1, 2, 3, 4],
              check: s => !s.dirty() && !!s.savedModel.routes.default && !!s.savedModel.selfs.self_ext && !!s.savedModel.mgmtIp },
        ],
        verify: ['list net vlan', 'list net self', 'show net route', 'list sys management-ip'],
        learn: ['Trunk port → tagged + switch ile aynı tag; access port → untagged.', 'Bir arayüz tek VLAN\'da untagged, birçoğunda tagged olabilir.', 'Self IP allow-service varsayılanı none; dışa bakan adreste none bırakın.', 'Yönetim (mgmt) ve veri düzlemi rotaları ayrıdır.'],
        links: { tool: '#/f5-ltm/vlanself', cli: '#/cli/f5-ltm' }, cert: 'F5CAB1 · F5CAB2.01'
    },
    // ═══ 1 · Yönetim erişim güvenliği ═══
    {
        id: 'f5-03', vendor: 'f5-ltm', level: 1, title: 'Yönetim erişim güvenliği: httpd/sshd allow, port lockdown, parola politikası, roller', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-02'],
        up: UP, sim: SIM, start: NET.map(x => x.replace('self_ext address 203.0.113.11/24 vlan external allow-service none', 'self_ext address 203.0.113.11/24 vlan external allow-service default')), startMode: 'tmsh',
        story: 'Güvenlik taraması üç bulgu raporladı: yönetim arayüzü (GUI ve SSH) <b>her adresten</b> erişilebilir, dışa bakan self IP\'de (203.0.113.11) <b>443 ve 22 açık</b>, yerel hesaplarda parola kuralı yok. Ayrıca NOC ekibi için yalnız <b>izleme</b> yetkili bir hesap istendi. Yönetim ağı <code>10.240.0.0/16</code>; siz <code>10.240.20.5</code> adresinden bağlısınız.',
        lesson: L('BIG-IP\'nin yönetim erişimi katman katmandır. <code>sys httpd allow</code> GUI\'ye (Configuration utility), <code>sys sshd allow</code> SSH\'a hangi kaynak adreslerin bağlanabileceğini belirler (varsayılan: hepsi). Bu listeler hem yönetim IP\'sine hem self IP\'lere gelen yönetim trafiğini filtreler. Self IP\'lerde ayrıca <b>port lockdown</b> (<code>allow-service</code>) geçerlidir. <code>auth password-policy</code> yerel hesapların parola kuralını, kullanıcı <b>rolü</b> (admin, operator, guest…) yetkisini belirler.',
            'Yönetim düzlemine internetten erişim, BIG-IP\'deki kritik açıkların (ör. CVE-2020-5902) doğrudan istismar edilmesine yol açmıştır. Kaynak kısıtı, kapalı port ve en az yetki birlikte uygulanınca tek hata tüm cihazı açmaz.',
            'modify sys httpd allow replace-all-with { 10.240.0.0/255.255.0.0 }\nmodify sys sshd allow replace-all-with { 10.240.0.0/255.255.0.0 }\nmodify net self self_ext allow-service none\nmodify auth password-policy policy-enforcement enabled minimum-length 12 required-uppercase 1 required-numeric 1 required-special 1 max-login-failures 5\ncreate auth user noc password &lt;parola&gt; partition-access add { all-partitions { role guest } } shell tmsh\nsave sys config',
            ['<code>replace-all-with</code> ile kendi yönetim ağınızı dışarıda bırakmak: GUI ya da SSH kilitlenir, yalnız konsol kalır.', 'httpd ve sshd\'yi aynı anda yanlış kısıtlayıp ikisinden de kilitlenmek.', 'Dışa bakan self IP\'de allow-service default bırakmak.', 'Herkese admin rolü vermek.', 'Değişikliklerden sonra save sys config\'i unutmak.']),
        goals: ['httpd ve sshd allow listeleri', 'Dışa bakan self IP\'de port lockdown', 'Parola politikası', 'En az yetkili kullanıcı', 'Kendini kilitlememe sırası'],
        tasks: [
            { t: 'GUI ve SSH\'a şu an hangi adreslerin bağlanabildiğini görün.', why: 'Değiştirmeden önce mevcut durumu görün. Varsayılan <code>All</code> / <code>ALL</code>: her adres bağlanabilir.',
              hints: ['list sys httpd allow; list sys sshd allow', '<code>list sys httpd allow</code> → <code>list sys sshd allow</code>'], steps: ['list sys httpd allow', 'list sys sshd allow'],
              check: s => s.ev.ran(/^tmsh list sys httpd allow$/) && s.ev.ran(/^tmsh list sys sshd allow$/) },
            { t: 'GUI erişimini yalnız yönetim ağıyla (<code>10.240.0.0/255.255.0.0</code>) sınırlayın.', why: '<code>replace-all-with</code> listeyi tamamen değiştirir; <code>add</code> mevcut listeye ekler. Kendi adresiniz (10.240.20.5) yeni listede olmalı.',
              hints: ['modify sys httpd allow replace-all-with { … }', '<code>modify sys httpd allow replace-all-with { 10.240.0.0/255.255.0.0 }</code>'], steps: ['modify sys httpd allow replace-all-with { 10.240.0.0/255.255.0.0 }'],
              check: s => s.guiAllowed('10.240.20.5') && !s.model.httpd.allow.includes('ALL') && !s.guiAllowed('198.51.100.9'),
              fb: s => (s.ev.warned('gui-lockout') ? 'Çalışır ama arada kendi istasyonunuzu GUI\'den kilitlediniz: listeyi değiştirirken yönetim ağınızın içinde kalmasına dikkat edin.' : null) },
            { t: 'SSH erişimini de aynı ağla sınırlayın.', why: 'SSH ve GUI ayrı listelerdir. Sıra önemlidir: önce GUI, sonra SSH değiştirilir ve her adımda bağlantının sürdüğü doğrulanır; ikisi birden yanlış giderse yalnız konsol kalır.',
              hints: ['modify sys sshd allow replace-all-with { … }', '<code>modify sys sshd allow replace-all-with { 10.240.0.0/255.255.0.0 }</code>'], steps: ['modify sys sshd allow replace-all-with { 10.240.0.0/255.255.0.0 }'],
              check: s => s.sshAllowed('10.240.20.5') && !s.model.sshd.allow.includes('ALL') && !s.sshAllowed('198.51.100.9'),
              fb: s => (s.ev.warned('ssh-lockout') ? 'Çalışır ama arada kendi SSH erişiminizi kestiniz: gerçek cihazda bu oturum kapanınca yalnız konsol kalırdı.' : null) },
            { t: 'Dışa bakan self IP\'yi (<code>self_ext</code>) kapatın: allow-service <b>none</b>.', why: 'Port lockdown yalnız self IP\'ye gelen trafiği etkiler; virtual server\'lar etkilenmez. İnternete bakan adreste yönetim ve servis portlarının açık olmasına gerek yoktur.',
              hints: ['modify net self … allow-service none', '<code>modify net self self_ext allow-service none</code>'], steps: ['modify net self self_ext allow-service none'],
              check: s => !s.selfAllows('self_ext', 'tcp:443') && !s.selfAllows('self_ext', 'tcp:22') },
            { t: 'Parola politikası: zorunlu kıl, en az <b>12</b> karakter, en az 1 büyük harf, 1 rakam, 1 özel karakter; <b>5</b> hatalı girişte kilit.', why: '<code>policy-enforcement enabled</code> olmadan diğer alanlar uygulanmaz. Kural yeni belirlenen parolalara uygulanır.',
              hints: ['modify auth password-policy policy-enforcement enabled minimum-length … required-… max-login-failures …', '<code>modify auth password-policy policy-enforcement enabled minimum-length 12 required-uppercase 1 required-numeric 1 required-special 1 max-login-failures 5</code>'],
              steps: ['modify auth password-policy policy-enforcement enabled minimum-length 12 required-uppercase 1 required-numeric 1 required-special 1 max-login-failures 5'],
              check: s => { const w = s.model.pwpol; return w.enf === 'enabled' && w.min >= 12 && w.up >= 1 && w.num >= 1 && w.spec >= 1 && w.fail > 0 && w.fail <= 5; },
              fb: s => (s.model.pwpol.enf !== 'enabled' && s.model.pwpol.min >= 12 ? 'Kurallar yazıldı ama policy-enforcement kapalı: hiçbiri uygulanmaz.' : null) },
            { t: 'NOC için <code>noc</code> kullanıcısı: parola <code>Izleme-Noc-2026</code>, rol <b>guest</b> (yalnız okuma), kabuk <b>tmsh</b>.', why: 'Rol yetkiyi belirler: guest ve operator yapılandırmayı değiştiremez (operator pool üyelerini açıp kapatabilir). Kabuk <code>tmsh</code> ise kullanıcının bash\'e düşmemesini sağlar.',
              hints: ['create auth user noc password … partition-access add { all-partitions { role guest } } shell tmsh', '<code>create auth user noc password Izleme-Noc-2026 partition-access add { all-partitions { role guest } } shell tmsh</code>'],
              steps: ['create auth user noc password Izleme-Noc-2026 partition-access add { all-partitions { role guest } } shell tmsh'], needs: [4],
              check: s => { const u = s.model.users.noc; return !!u && u.pw && u.role === 'guest' && u.shell === 'tmsh'; },
              fb: s => { const u = s.model.users.noc; return u && ['admin', 'resource-admin', 'manager'].includes(u.role) ? 'Çalışır ama izleme hesabına değiştirme yetkisi veren bir rol verildi.' : (u && u.shell === 'bash' ? 'Çalışır ama izleme hesabına bash verildi: işletim sistemine tam erişim demektir.' : null); } },
            { t: 'Soru: httpd allow listesi yalnız yönetim ağını içeriyor. İnternetten self_ext\'e (203.0.113.11) GUI isteği gelirse ne olur?', ask: { choices: [['both', 'İki katmanda da durur: port lockdown (none) bağlantıyı almaz, httpd allow da kaynağı reddederdi'], ['open', 'GUI açılır; httpd allow yalnız yönetim IP\'sini korur'], ['vs', 'İstek bir virtual server\'a yönlendirilir'], ['ssh', 'Yalnız SSH engellenir']], correct: 'both' },
              why: 'httpd/sshd allow listeleri yönetim servislerine (Apache, sshd) gelen tüm bağlantılara uygulanır: yönetim IP\'si de self IP\'ler de. Self IP\'de port lockdown ise bağlantının servise ulaşıp ulaşmayacağını belirleyen ilk katmandır.',
              hints: ['İki ayrı koruma katmanı var.', 'Port lockdown hangi adresleri etkiler?'] },
            { t: 'Kalıcı kaydedin.', why: 'Kaydedilmeyen sıkılaştırma yeniden başlatmada geri gider ve tarama bulgusu geri gelir.',
              hints: ['save sys config', '<code>save sys config</code>'], steps: ['save sys config'], needs: [1, 2, 3, 4, 5],
              check: s => !s.dirty() && !s.savedModel.httpd.allow.includes('ALL') && !s.savedModel.sshd.allow.includes('ALL') && s.savedModel.pwpol.enf === 'enabled' && !!s.savedModel.users.noc },
        ],
        verify: ['list sys httpd allow', 'list sys sshd allow', 'list net self self_ext allow-service', 'list auth password-policy', 'list auth user noc'],
        learn: ['httpd allow = GUI, sshd allow = SSH; replace-all-with listeyi değiştirir, add ekler.', 'Kendi yönetim ağınızı listede tutun.', 'Port lockdown yalnız self IP\'leri etkiler.', 'policy-enforcement enabled olmadan parola kuralı işlemez.', 'En az yetki: guest/operator, kabuk tmsh.'],
        links: { tool: '#/f5-ltm/mgmtaccess', cli: '#/cli/f5-ltm', wizard: '#/troubleshoot/f5-ltm/101' }, cert: 'F5CAB1.01 · F5CAB4.06'
    },
    // ═══ 5 · Arıza: iç ağa ulaşılamıyor ═══
    {
        id: 'f5-05', vendor: 'f5-ltm', level: 5, title: '"İç ağdaki istemcilere ulaşılamıyor" — arıza kaydı (VLAN / arayüz / self IP)', minutes: 20, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-02'],
        up: UP, sim: SIM, start: NET, startMode: 'tmsh',
        variants: [
            { key: 'tag', start: ['modify net vlan internal tag 31'], fix: ['modify net vlan internal tag 30'] },
            { key: 'untagged', start: ['modify net vlan internal interfaces replace-all-with { 1.3 { untagged } }'], fix: ['modify net vlan internal interfaces replace-all-with { 1.3 { tagged } }'] },
            { key: 'disabled', start: ['modify net interface 1.3 disabled'], fix: ['modify net interface 1.3 enabled'] },
            { key: 'selfvlan', start: ['delete net self self_int', 'create net self self_int address 10.64.10.11/24 vlan server allow-service default'], fix: ['delete net self self_int', 'create net self self_int address 10.64.10.11/24 vlan internal allow-service default'] },
        ],
        story: '<b>Arıza kaydı:</b> "Dün geceki değişiklikten sonra BIG-IP iç ağdaki istemcilere (<code>10.64.10.0/24</code>, ör. <code>10.64.10.50</code>) ulaşamıyor." Beklenen: iç ağ <b>internal</b> VLAN\'ında, 1.3 üzerinden <b>tagged</b>, tag <b>30</b> (switch portu trunk); BIG-IP\'nin adresi <code>self_int</code> 10.64.10.11. Kanıt toplayın, kök nedeni seçin, tek değişiklikle düzeltin. <small>Her turda farklı bir arıza gelebilir.</small>',
        lesson: L('Veri düzleminde bir ağa ulaşmak için zincir: <b>arayüz</b> açık ve bağlı → arayüz doğru <b>VLAN</b>\'a doğru modda (tagged/untagged) üye → VLAN\'ın <b>tag</b>\'i switch ile aynı → o ağın <b>self IP</b>\'si doğru VLAN\'da. Zincirin her halkası ayrı bir komutla görülür: <code>show net interface</code>, <code>list net vlan</code>, <code>list net self</code>, <code>show net arp</code>.',
            'Bu arızaların hiçbiri hata mesajı üretmez; yapılandırma "geçerli"dir ama trafik gitmez. ARP tablosunda <code>incomplete</code> görmek, sorunun L2\'de (VLAN/etiket/arayüz) olduğunun ilk işaretidir.',
            'run util ping -c 2 10.64.10.50\nshow net arp\nshow net interface\nlist net vlan internal\nlist net self self_int',
            ['Switch trunk portunda VLAN\'ı untagged tanımlamak.', 'Tag numarasında tek hanelik yazım hatası.', 'Bakım için kapatılan arayüzü açmayı unutmak.', 'Self IP\'yi yanlış VLAN\'a bağlamak: IP doğru görünür ama çerçeveler başka VLAN\'a gider.', 'Kanıt toplamadan her şeyi silip yeniden kurmak.']),
        goals: ['Belirtiyi ping ve ARP ile doğrulamak', 'Arayüz, VLAN ve self IP halkalarını incelemek', 'Kök nedeni kanıtla seçmek', 'Tek değişiklik, doğrulama, kayıt'],
        tasks: [
            { t: 'Belirti: <code>10.64.10.50</code>\'ye ping atın ve ARP tablosuna bakın.', why: 'Ping hedefe ulaşılamadığını, ARP tablosundaki <code>incomplete</code> ise BIG-IP\'nin hedefin MAC adresini öğrenemediğini gösterir: sorun L2\'dedir (arayüz, VLAN, etiket).',
              hints: ['run util ping …; show net arp', '<code>run util ping -c 2 10.64.10.50</code> → <code>show net arp</code>'], steps: ['run util ping -c 2 10.64.10.50', 'show net arp'], loo: false, /* son görevdeki doğrulama aynı ping'i kullanır */
              check: s => s.ev.list().some(e => e.ping === '10.64.10.50') && s.ev.ran(/^tmsh show net arp$/) },
            { t: 'Kanıt toplayın: arayüz durumu, internal VLAN\'ı ve self_int.', why: 'Üç komut zincirin üç halkasını gösterir: arayüz açık ve bağlı mı; VLAN\'da 1.3 tagged mi, tag 30 mu; self_int hangi VLAN\'da.',
              hints: ['show net interface; list net vlan internal; list net self self_int', '<code>show net interface</code> → <code>list net vlan internal</code> → <code>list net self self_int</code>'],
              steps: ['show net interface', 'list net vlan internal', 'list net self self_int'],
              check: s => s.ev.ran(/^tmsh show net interface$/) && s.ev.ran(/^tmsh list net vlan internal$/) && s.ev.ran(/^tmsh list net self self_int$/) },
            { t: 'Kök neden hangisi?', ask: { choices: [['tag', 'internal VLAN\'ının tag\'i switch ile uyuşmuyor'], ['untagged', '1.3, internal VLAN\'ına untagged eklenmiş (switch portu trunk)'], ['disabled', '1.3 arayüzü yönetimsel olarak kapatılmış'], ['selfvlan', 'self_int yanlış VLAN\'a bağlı']], correct: v => v.key },
              why: 'show net interface\'te 1.3 <code>DS</code> ise arayüz kapalı. VLAN çıktısında 1.3 <code>untagged</code> ya da tag 30\'dan farklıysa etiket uyuşmuyor. self_int\'in <code>vlan</code> satırı internal değilse IP başka VLAN\'dan konuşuyor.',
              hints: ['Hangi çıktı beklenenden farklıydı?', 'Beklenen: 1.3 up, internal = 1.3 tagged tag 30, self_int vlan internal.'], needs: [1] },
            { t: 'Tek değişiklikle düzeltin.', why: 'Yalnız bozuk halkayı onarın. Self IP\'nin VLAN\'ı yanlışsa self IP silinip doğru VLAN\'la yeniden oluşturulur.',
              hints: ['Kök nedene göre tek değişiklik.', 'tag: <code>modify net vlan internal tag 30</code> · untagged: <code>modify net vlan internal interfaces replace-all-with { 1.3 { tagged } }</code> · disabled: <code>modify net interface 1.3 enabled</code> · selfvlan: <code>delete net self self_int</code> → <code>create net self self_int address 10.64.10.11/24 vlan internal allow-service default</code>'],
              steps: v => v.fix,
              check: s => s.reach('10.64.10.50').ok && s.model.vlans.internal.tag === 30 && s.model.vlans.internal.ifs['1.3'] === 'tagged' && (s.model.selfs.self_int || {}).vlan === 'internal' },
            { t: 'Doğrulayın ve kaydedin.', why: 'Aynı ping artık yanıt almalı; ARP kaydı <code>resolved</code> olur. Sonra <code>save sys config</code>.',
              hints: ['run util ping …; save sys config', '<code>run util ping -c 2 10.64.10.50</code> → <code>save sys config</code>'], steps: ['run util ping -c 2 10.64.10.50', 'save sys config'], needs: [3], loo: false,
              check: s => pingOk(s, '10.64.10.50') && !s.dirty() && s.savedModel.vlans.internal.tag === 30 && s.savedModel.vlans.internal.ifs['1.3'] === 'tagged' && (s.savedModel.selfs.self_int || {}).vlan === 'internal' && s.savedModel.ifs['1.3'].enabled },
        ],
        verify: ['show net interface', 'list net vlan internal', 'list net self self_int', 'show net arp'],
        learn: ['Zincir: arayüz → VLAN (mod, tag) → self IP.', 'ARP incomplete = L2 sorunu.', 'Etiket uyuşmazlığı hata üretmez; trafik sessizce kaybolur.', 'Düzeltmeden sonra save sys config.'],
        links: { tool: '#/f5-ltm/vlanself', cli: '#/cli/f5-ltm', wizard: '#/troubleshoot/f5-ltm/100' }, cert: 'F5CAB2.01 · F5CAB5.02'
    },
    // ═══ Serbest çalışma ═══
    {
        id: 'f5-sandbox', vendor: 'f5-ltm', level: null, sandbox: true, title: 'F5 BIG-IP serbest çalışma alanı', minutes: 0, kind: 'adc', hostname: 'bigip-a.lab.example',
        up: UP, sim: SIM, start: NET, startMode: 'tmsh',
        story: 'Görev yok: ilk kurulumu tamamlanmış bir BIG-IP\'de (VLAN\'lar, self IP\'ler, rota, yönetim IP\'si) tmsh ve bash komutlarını serbestçe deneyin.',
        goals: [], tasks: [], links: { cli: '#/cli/f5-ltm' }
    },
    ];
    // Çoktan seçmeli (ask) görevler ve adımlardan türetilen örnek çözüm
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
    void lastIdx;
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
