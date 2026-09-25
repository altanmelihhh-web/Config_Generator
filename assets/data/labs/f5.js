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

    // ── LTM lab'ları: sunucu ağı (server VLAN 10, 1.2 access). Sunucuların ağ geçidi BIG-IP değil (10.64.30.1): SNAT gerekir.
    const SRV = (ip, name, extra) => Object.assign({ ip, name, gw: '10.64.30.1', ports: { 80: { paths: { '/': 200, '/health': 200, '/eski': { code: 301, loc: 'http://203.0.113.100/yeni' }, '/yeni': 200, '/rapor': 502, '/yonetim': 401 } } } }, extra || {});
    const SERVERS = [SRV('10.64.30.50', 'srv-a'), SRV('10.64.30.51', 'srv-b'), SRV('10.64.30.52', 'srv-c'), { ip: '10.64.30.53', name: 'srv-app', gw: '10.64.30.1', ports: { 8080: { paths: { '/': 200, '/health': 200 } } } }];
    const SIM2 = Object.assign({}, SIM, { servers: SERVERS, client: '198.51.100.20', hosts: HOSTS.concat(SERVERS.map(x => ({ ip: x.ip, vlan: 10 })), [{ ip: '10.64.30.1', vlan: 10 }]) });
    const MON = 'create ltm monitor http mon_web defaults-from http send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n" recv "200 OK"';
    const VS_WEB = 'create ltm virtual vs_web destination 203.0.113.100:80 pool web_pool profiles add { http } source-address-translation { type automap }';
    const VS_APP = 'create ltm virtual vs_app destination 203.0.113.102:80 pool app_pool profiles add { http } source-address-translation { type automap }';
    const PG = 'modify ltm pool web_pool load-balancing-mode round-robin min-active-members 1 members modify { 10.64.30.50:80 { priority-group 10 } 10.64.30.51:80 { priority-group 10 } 10.64.30.52:80 { priority-group 5 } }';
    // üç üyeli hazır uygulama (f5-06/07/09/10 başlangıcı)
    const LTM3 = [MON, 'create ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 10.64.30.52:80 } monitor mon_web', VS_WEB];
    const curls = s => s.ev.list().filter(e => e.curl).map(e => e.curl);
    // re ile eşleşen son komuttan (ve varsa until'den önce) sonra atılan curl istekleri
    const curlsAfter = (s, re, until) => { const L2 = s.ev.list(); const i = lastIdx(L2, e => e.raw && re.test(e.raw)); if (i < 0) return []; let j = L2.length; if (until) { const k = L2.findIndex((e, n) => n > i && e.raw && until.test(e.raw)); if (k > 0) j = k; } return L2.slice(i + 1, j).filter(e => e.curl).map(e => e.curl); };
    const siteOk = s => { const r = s.vipTest ? s.vipTest('203.0.113.100', 80, '/') : null; return !!r && r.kind === 'ok' && r.code === 200; };
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
    // ═══ 2 · İlk uygulama: monitor, pool, virtual server ═══
    {
        id: 'f5-04', vendor: 'f5-ltm', level: 2, title: 'İlk uygulama: health monitor, pool ve virtual server', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-02'],
        up: UP, sim: SIM2, start: NET, startMode: 'tmsh',
        story: 'Web uygulaması iki sunucuda çalışıyor: <b>srv-a</b> <code>10.64.30.50:80</code> ve <b>srv-b</b> <code>10.64.30.51:80</code> (server VLAN\'ı). Uygulama ekibi sağlık kontrolü için <code>/health</code> adresini verdi: sağlıklıyken <b>200 OK</b> döner. Uygulama internete <code>203.0.113.100:80</code> adresinden yayınlanacak. Sunucuların varsayılan ağ geçidi BIG-IP değil, ağdaki bir router (<code>10.64.30.1</code>).',
        lesson: L('LTM\'de trafik zinciri: <b>virtual server</b> (VIP: istemcinin bağlandığı adres:port) → <b>pool</b> (arka uç sunucu grubu ve dağıtım yöntemi) → <b>pool member</b> (IP:port; IP\'si bir <b>node</b> nesnesidir). <b>Health monitor</b> üyelerin sağlığını düzenli olarak sınar; sağlıksız üye dağıtımdan çıkar. HTTP monitöründe <code>send</code> istenen isteği, <code>recv</code> yanıtta aranacak metni belirler (başlık ve gövde birlikte aranır). <b>SNAT</b> (source-address-translation), istemcinin kaynak adresini BIG-IP\'nin adresine çevirir; sunucuların ağ geçidi BIG-IP değilse yanıt BIG-IP\'ye dönsün diye gerekir.',
            'recv boş bırakılan bir HTTP monitörü sunucu 404 ya da 500 dönse bile üyeyi "up" sayar. SNAT yokken ağ geçidi BIG-IP olmayan sunucular yanıtı doğrudan istemciye yollar: TCP el sıkışması bozulur ve bağlantı zaman aşımına uğrar.',
            'create ltm monitor http mon_web defaults-from http send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n" recv "200 OK"\ncreate ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 } monitor mon_web\ncreate ltm virtual vs_web destination 203.0.113.100:80 pool web_pool profiles add { http } source-address-translation { type automap }\nshow ltm pool web_pool members\nsave sys config',
            ['HTTP/1.1 send\'de Host başlığını unutmak (birçok sunucu 400 döner).', 'recv\'i boş bırakmak: her yanıt "up" sayılır.', 'Sunucuların ağ geçidi BIG-IP değilken SNAT\'ı unutmak.', 'Virtual server\'ı pool\'suz bırakmak.', 'Sonucu yalnız renklere bakarak değil, istemciden gerçek istekle doğrulamamak.']),
        goals: ['HTTP monitörü: send ve recv', 'Pool ve üyeler', 'Virtual server ve SNAT automap', 'Durumu show ile, davranışı curl ile doğrulamak'],
        tasks: [
            { t: 'HTTP monitörü <code>mon_web</code>: <code>/health</code> isteği göndersin, yanıtta <code>200 OK</code> arasın.', why: 'send dizgesinde satır sonları <code>\\r\\n</code> ile yazılır; HTTP/1.1\'de <code>Host</code> başlığı zorunludur. recv yanıtın başlık ve gövdesinde aranır: "200 OK" durum satırıyla eşleşir.',
              hints: ['create ltm monitor http mon_web defaults-from http send "…" recv "200 OK"', '<code>create ltm monitor http mon_web defaults-from http send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n" recv "200 OK"</code>'],
              steps: [MON], check: s => { const m = s.model.monitors.mon_web; return !!m && m.type === 'http' && /GET \/health/.test(m.send) && /200/.test(m.recv); } },
            { t: '<code>web_pool</code> pool\'unu iki üye ve <code>mon_web</code> monitörüyle oluşturun.', why: 'Üye IP:port biçimindedir; üyenin IP\'si için bir node nesnesi kendiliğinden oluşur. Monitör pool\'a verildiğinde tüm üyelere uygulanır.',
              hints: ['create ltm pool … members add { ip:port ip:port } monitor …', '<code>create ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 } monitor mon_web</code>'],
              steps: ['create ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 } monitor mon_web'], needs: [0],
              check: s => { const p = s.model.pools.web_pool; return !!p && p.order.length === 2 && !!p.members['10.64.30.50:80'] && !!p.members['10.64.30.51:80'] && (p.monitor || []).includes('mon_web'); } },
            { t: 'Üyelerin durumuna bakın.', why: 'Availability <b>available</b> (yeşil) monitör başarılı, <b>offline</b> (kırmızı) monitör başarısız, <b>unknown</b> (mavi) monitör yok demektir. Reason satırı nedenini söyler.',
              hints: ['show ltm pool … members', '<code>show ltm pool web_pool members</code>'], steps: ['show ltm pool web_pool members'], needs: [0, 1],
              check: s => s.ev.list().some(e => e.show === 'ltm pool' && e.members) },
            { t: 'Virtual server <code>vs_web</code>: <code>203.0.113.100:80</code>, pool <code>web_pool</code>, HTTP profili ve SNAT <b>automap</b>.', why: 'HTTP profili BIG-IP\'nin HTTP\'yi anlamasını sağlar (cookie persistence, başlık ekleme, iRule HTTP olayları için gerekir). Automap, kaynak adresi sunucu ağındaki self IP\'ye çevirir.',
              hints: ['create ltm virtual … destination … pool … profiles add { http } source-address-translation { type automap }', '<code>create ltm virtual vs_web destination 203.0.113.100:80 pool web_pool profiles add { http } source-address-translation { type automap }</code>'],
              steps: [VS_WEB], needs: [0, 1],
              check: s => { const v = s.model.virtuals.vs_web; return !!v && v.dest === '203.0.113.100:80' && v.pool === 'web_pool' && v.sat.type !== 'none' && v.profiles.includes('http'); } },
            { t: 'İstemciden deneyin: bash\'e geçip VIP\'e dört istek gönderin, sonra tmsh\'e dönün.', why: 'Yanıt gövdesi hangi sunucunun cevap verdiğini gösterir: round-robin\'de istekler sırayla srv-a ve srv-b\'ye gider. Renkler yapılandırmayı, gerçek istek davranışı kanıtlar.',
              hints: ['run util bash; for i in {1..4}; do curl -s http://203.0.113.100/; done; exit', '<code>run util bash</code> → <code>for i in {1..4}; do curl -s http://203.0.113.100/; done</code> → <code>exit</code>'],
              steps: ['run util bash', 'for i in {1..4}; do curl -s http://203.0.113.100/; done', 'exit'], needs: [0, 1, 3],
              check: s => new Set(curls(s).filter(c => c.vip && c.kind === 'ok').map(c => c.member)).size >= 2 },
            { t: 'Soru: SNAT automap kaldırılsaydı istemci ne görürdü?', ask: { choices: [['timeout', 'Bağlantı zaman aşımı: sunucular yanıtı ağ geçitleri 10.64.30.1\'e yollar, istemci beklediği adresten yanıt alamaz'], ['ok', 'Hiçbir fark olmazdı'], ['reset', 'BIG-IP 503 döndürürdü'], ['404', 'Sunucular 404 döndürürdü']], correct: 'timeout' },
              why: 'SNAT yokken sunucu, istemcinin gerçek adresini görür ve yanıtı kendi varsayılan ağ geçidine yollar. Ağ geçidi BIG-IP değilse yanıt BIG-IP\'den geçmez; istemcinin TCP el sıkışması tamamlanmaz. Çözüm: SNAT ya da sunucuların ağ geçidini BIG-IP (HA\'da floating self IP) yapmak.',
              hints: ['Sunucu yanıtı kime ve hangi yoldan gönderir?', 'Ağ geçidi kim?'] },
            { t: 'Virtual server durumunu görün ve yapılandırmayı kaydedin.', why: 'Virtual server\'ın rengi pool\'undan gelir: en az bir üye available ise VS de available.',
              hints: ['show ltm virtual …; save sys config', '<code>show ltm virtual vs_web</code> → <code>save sys config</code>'], steps: ['show ltm virtual vs_web', 'save sys config'], needs: [0, 1, 3],
              check: s => s.ev.list().some(e => e.show === 'ltm virtual') && !s.dirty() && !!s.savedModel.virtuals.vs_web },
        ],
        verify: ['list ltm virtual vs_web', 'show ltm pool web_pool members', 'show ltm virtual vs_web'],
        learn: ['VS → pool → üye (node).', 'HTTP monitörde recv mutlaka doldurun.', 'Sunucu ağ geçidi BIG-IP değilse SNAT.', 'Durum renkleri + gerçek istekle doğrulama.'],
        links: { tool: '#/f5-ltm/vserver', cli: '#/cli/f5-ltm' }, cert: 'F5CAB2.03 · F5CAB3.01 · F5CAB3.02'
    },
    // ═══ 2 · Dağıtım yöntemleri ═══
    {
        id: 'f5-06', vendor: 'f5-ltm', level: 2, title: 'Dağıtım yöntemleri: round robin, ratio, least connections ve priority group', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-04'],
        up: UP, sim: Object.assign({}, SIM2, { conns: { '10.64.30.50:80': 40, '10.64.30.51:80': 5, '10.64.30.52:80': 12 } }), start: NET.concat(LTM3), startMode: 'tmsh',
        story: '<code>web_pool</code> üç üyeli: <b>srv-a</b> (.50, en güçlü sunucu), <b>srv-b</b> (.51) ve <b>srv-c</b> (.52, eski ve zayıf; yalnız yedek olmalı). Şu an dağıtım round robin. Yöntemleri tek tek deneyip sonuçlarını istemciden görün.',
        lesson: L('<b>Round robin</b>: istekler sırayla dağıtılır. <b>Ratio</b>: üyelere ağırlık verilir (ratio 3 olan üye, ratio 1 olana göre üç kat istek alır). <b>Least connections</b>: o an en az açık bağlantısı olan üye seçilir; uzun süren bağlantılarda dengeyi korur. <b>Priority group activation</b>: üyeler öncelik gruplarına ayrılır, yalnız en yüksek gruptaki üyeler kullanılır; bu gruptaki çalışan üye sayısı <code>min-active-members</code> altına düşerse bir alt grup devreye girer (yedek sunucu). <code>-member</code> ve <code>-node</code> sonekleri hesabın üye başına mı, node başına mı yapılacağını belirler.',
            'Yanlış yöntem, zayıf sunucuyu boğar ya da güçlü sunucuyu boş bırakır. Priority group ile yedek sunucular yalnız gerektiğinde trafik alır.',
            'modify ltm pool web_pool load-balancing-mode ratio-member members modify { 10.64.30.50:80 { ratio 3 } }\nmodify ltm pool web_pool load-balancing-mode least-connections-member\nmodify ltm pool web_pool min-active-members 1 members modify { 10.64.30.50:80 { priority-group 10 } 10.64.30.51:80 { priority-group 10 } 10.64.30.52:80 { priority-group 5 } }',
            ['<code>least-connections-members</code> (çoğul) yazmak: geçersiz değer.', 'Ratio verip yöntemi ratio-member yapmamak: ağırlık kullanılmaz.', 'Priority group verip min-active-members\'ı 0 bırakmak: gruplar etkisizdir.', 'Round robin\'in "eşit yük" sağladığını sanmak: bağlantı süreleri farklıysa yük dengesizleşir.']),
        goals: ['Round robin\'i gözlemlemek', 'Ratio ile ağırlık', 'Least connections', 'Priority group ile yedek sunucu'],
        tasks: [
            { t: 'Round robin\'i gözlemleyin: bash\'ten VIP\'e altı istek gönderin.', why: 'Round robin\'de sıra a → b → c → a… şeklindedir.',
              hints: ['run util bash; for …; exit', '<code>run util bash</code> → <code>for i in {1..6}; do curl -s http://203.0.113.100/; done</code> → <code>exit</code>'], steps: ['run util bash', 'for i in {1..6}; do curl -s http://203.0.113.100/; done', 'exit'], loo: false, /* sonraki görevlerin istekleri de üç üyeye dağılır */
              check: s => new Set(curls(s).filter(c => c.kind === 'ok').map(c => c.member)).size === 3 },
            { t: '<b>Ratio</b>: srv-a\'ya ratio <code>3</code> verin ve yöntemi <code>ratio-member</code> yapın; beş istekle sonucu görün.', why: 'a:3, b:1, c:1 ağırlıkla beş istekte srv-a üç, diğerleri birer istek alır.',
              hints: ['modify ltm pool web_pool load-balancing-mode ratio-member members modify { 10.64.30.50:80 { ratio 3 } }', 'Sonra <code>run util bash</code> → <code>for i in {1..5}; do curl -s http://203.0.113.100/; done</code> → <code>exit</code>'],
              steps: ['modify ltm pool web_pool load-balancing-mode ratio-member members modify { 10.64.30.50:80 { ratio 3 } }', 'run util bash', 'for i in {1..5}; do curl -s http://203.0.113.100/; done', 'exit'],
              check: s => s.model.pools.web_pool.members['10.64.30.50:80'].ratio === 3 && s.model.pools.web_pool.lb === 'ratio-member' && curls(s).filter(c => c.kind === 'ok' && c.member === '10.64.30.50:80').length >= 3,
              fb: s => (s.model.pools.web_pool.members['10.64.30.50:80'].ratio === 3 && !/^ratio/.test(s.model.pools.web_pool.lb) ? 'Ratio verildi ama yöntem ratio değil: ağırlık kullanılmıyor.' : null) },
            { t: '<b>Least connections</b>: yöntemi <code>least-connections-member</code> yapın ve üyelerin açık bağlantı sayılarına bakın.', why: 'show çıktısındaki <b>Current Connections</b>, yöntemin kararını verdiği sayıdır.',
              hints: ['modify ltm pool … load-balancing-mode …; show ltm pool … members', '<code>modify ltm pool web_pool load-balancing-mode least-connections-member</code> → <code>show ltm pool web_pool members</code>'],
              steps: ['modify ltm pool web_pool load-balancing-mode least-connections-member', 'show ltm pool web_pool members'],
              check: s => s.model.pools.web_pool.lb === 'least-connections-member' && s.ev.after(/least-connections-member/, /show ltm pool web_pool members/) },
            { t: 'Soru: şu an gelen yeni bir istek hangi üyeye gider?', ask: { choices: [['b', 'srv-b (10.64.30.51): en az açık bağlantı onda'], ['a', 'srv-a: en güçlü sunucu'], ['c', 'srv-c: sıradaki üye'], ['rr', 'Sırayla dağıtılır']], correct: 'b' },
              why: 'Least connections anlık açık bağlantı sayısına bakar: srv-a 40, srv-b 5, srv-c 12. En az olan seçilir. Sunucunun gücü hesaba katılmaz; bunun için ratio ya da weighted/ratio-least-connections yöntemleri vardır.',
              hints: ['Current Connections sütunu', 'En küçük sayı'] },
            { t: '<b>Priority group</b>: srv-a ve srv-b grup <code>10</code>, srv-c grup <code>5</code> (yedek); <code>min-active-members 1</code>; yöntemi yeniden round robin yapın.', why: 'Yalnız en yüksek gruptaki (10) üyeler trafik alır. Grupta çalışan üye sayısı 1\'in altına düşerse grup 5 (srv-c) devreye girer.',
              hints: ['modify ltm pool web_pool load-balancing-mode round-robin min-active-members 1 members modify { … { priority-group N } … }', '<code>modify ltm pool web_pool load-balancing-mode round-robin min-active-members 1 members modify { 10.64.30.50:80 { priority-group 10 } 10.64.30.51:80 { priority-group 10 } 10.64.30.52:80 { priority-group 5 } }</code>'],
              steps: [PG],
              check: s => { const p = s.model.pools.web_pool; return p.minActive === 1 && p.members['10.64.30.50:80'].pg === 10 && p.members['10.64.30.51:80'].pg === 10 && p.members['10.64.30.52:80'].pg === 5 && p.lb === 'round-robin'; },
              fb: s => (s.model.pools.web_pool.minActive === 0 && s.model.pools.web_pool.members['10.64.30.52:80'].pg === 5 ? 'Gruplar verildi ama min-active-members 0: priority group etkisiz.' : null) },
            { t: 'Yedeği deneyin: srv-a ve srv-b\'yi bakım için devre dışı bırakın (session user-disabled) ve istek gönderin; trafik srv-c\'ye geçmeli. Sonra ikisini geri açın.', why: 'Devre dışı üye yeni bağlantı almaz (mevcutlar sürer). Grup 10\'da etkin üye kalmayınca grup 5 devreye girer.',
              hints: ['members modify { … { session user-disabled } … }; curl; members modify { … { session user-enabled } … }', '<code>modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-disabled } 10.64.30.51:80 { session user-disabled } }</code> → bash\'te <code>curl -s http://203.0.113.100/</code> → geri açın'],
              steps: ['modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-disabled } 10.64.30.51:80 { session user-disabled } }', 'run util bash', 'curl -s http://203.0.113.100/', 'exit', 'modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-enabled } 10.64.30.51:80 { session user-enabled } }'], needs: [4],
              check: s => curlsAfter(s, /10\.64\.30\.51:80 \{ session user-disabled/, /session user-enabled/).some(c => c.kind === 'ok' && c.member === '10.64.30.52:80') && ['10.64.30.50:80', '10.64.30.51:80'].every(k => s.model.pools.web_pool.members[k].session === 'user-enabled') },
            { t: 'Kaydedin.', why: 'Dağıtım ayarları /config/bigip.conf dosyasına yazılır.', hints: ['save sys config', '<code>save sys config</code>'], steps: ['save sys config'], needs: [4],
              check: s => !s.dirty() && s.savedModel.pools.web_pool.minActive === 1 },
        ],
        verify: ['list ltm pool web_pool', 'show ltm pool web_pool members'],
        learn: ['round-robin: sırayla; ratio: ağırlıkla; least-connections: en az açık bağlantı.', 'Priority group için min-active-members > 0.', 'session user-disabled: yeni bağlantı almaz; state user-down: zorla kapalı.'],
        links: { tool: '#/f5-ltm/pool', cli: '#/cli/f5-ltm' }, cert: 'F5CAB2.02 · F5CAB3.02'
    },
    // ═══ 3 · Persistence ═══
    {
        id: 'f5-07', vendor: 'f5-ltm', level: 3, title: 'Persistence: cookie insert ve source address', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-04'],
        up: UP, sim: SIM2, start: NET.concat(LTM3, ['modify ltm virtual vs_web profiles replace-all-with { tcp }', 'create ltm virtual vs_api destination 203.0.113.101:80 pool web_pool source-address-translation { type automap }']), startMode: 'tmsh',
        story: 'Uygulama ekibi şikâyetçi: kullanıcılar oturum açtıktan sonra bir sonraki tıklamada başka sunucuya düşüyor ve oturumları kayboluyor. Web uygulaması (<code>vs_web</code>, 203.0.113.100) tarayıcıdan, API (<code>vs_api</code>, 203.0.113.101) ise cookie tutmayan istemcilerden kullanılıyor.',
        lesson: L('<b>Persistence</b> (kalıcılık), aynı istemcinin istekleri aynı üyeye gitsin diye dağıtım kararını hatırlar. <b>Cookie insert</b>: BIG-IP yanıta <code>BIGipServer&lt;pool&gt;</code> adlı bir cookie ekler; değer üyenin IP ve portunun kodlanmış hâlidir. Bilgi istemcidedir, BIG-IP tablo tutmaz; <b>HTTP profili gerekir</b>. <b>Source address</b>: istemcinin kaynak IP\'si BIG-IP\'deki kalıcılık tablosunda üyeyle eşlenir (<code>show ltm persistence persist-records</code>); NAT arkasındaki çok sayıda kullanıcı tek IP\'den geliyorsa hepsi aynı üyeye düşer.',
            'Oturum verisini sunucuda tutan uygulamalar persistence olmadan çalışmaz. Yanlış yöntem seçmek yükü tek sunucuya yığar ya da persistence\'ı hiç çalıştırmaz.',
            'modify ltm virtual vs_web profiles add { http } persist replace-all-with { cookie }\nmodify ltm virtual vs_api persist replace-all-with { source_addr }\nshow ltm persistence persist-records',
            ['HTTP profili olmadan cookie persistence eklemeye çalışmak.', 'Cookie\'yi tutmayan istemciler (API, bazı cihazlar) için cookie persistence seçmek.', 'Büyük bir NAT\'ın arkasındaki kullanıcılar için source address seçmek: hepsi tek üyeye düşer.', 'Keep-alive bağlantılarda OneConnect olmadan her isteğin yeniden dengelendiğini sanmak (aynı TCP bağlantısı aynı üyede kalır).']),
        goals: ['HTTP profili ve cookie insert', 'Cookie\'nin istemcide durduğunu görmek', 'Source address persistence ve kayıt tablosu', 'Doğru yöntemi seçmek'],
        tasks: [
            { t: '<code>vs_web</code>\'e cookie persistence ekleyin (<code>persist replace-all-with { cookie }</code>).', why: 'Deneyin: virtual server\'da HTTP profili yok. Cookie eklemek için BIG-IP\'nin HTTP yanıtını anlaması gerekir; önce <code>profiles add { http }</code>.',
              hints: ['Önce HTTP profili: modify ltm virtual vs_web profiles add { http }', '<code>modify ltm virtual vs_web profiles add { http } persist replace-all-with { cookie }</code>'],
              steps: ['modify ltm virtual vs_web profiles add { http } persist replace-all-with { cookie }'],
              check: s => { const v = s.model.virtuals.vs_web; return v.persist[0] === 'cookie' && v.profiles.includes('http'); } },
            { t: 'Deneyin: cookie saklamadan üç istek, sonra cookie dosyası kullanarak (<code>-c</code> yaz, <code>-b</code> oku) üç istek gönderin.', why: 'Cookie saklamayan istemci her istekte yeniden dengelenir. Cookie\'yi geri gönderen istemci hep aynı üyeye gider. <code>-v</code> ile yanıttaki <code>Set-Cookie: BIGipServerweb_pool=…</code> başlığını da görebilirsiniz.',
              hints: ['curl -s …; curl -s -c /var/tmp/j -b /var/tmp/j …', '<code>for i in {1..3}; do curl -s http://203.0.113.100/; done</code> → <code>for i in {1..3}; do curl -s -c /var/tmp/j -b /var/tmp/j http://203.0.113.100/; done</code>'],
              steps: ['run util bash', 'for i in {1..3}; do curl -s http://203.0.113.100/; done', 'for i in {1..3}; do curl -s -c /var/tmp/j -b /var/tmp/j http://203.0.113.100/; done', 'exit'], needs: [0],
              check: s => curls(s).filter(c => c.kind === 'ok' && c.persisted).length >= 2 },
            { t: 'Soru: cookie insert persistence\'ta "hangi istemci hangi sunucuda" bilgisi nerede tutulur?', ask: { choices: [['client', 'İstemcinin tarayıcısındaki cookie\'de; BIG-IP tablo tutmaz'], ['table', 'BIG-IP\'nin persistence tablosunda'], ['server', 'Sunucunun oturum veritabanında'], ['dns', 'DNS kaydında']], correct: 'client' },
              why: 'Cookie değeri üyenin IP ve portunun kodlanmış hâlidir (örneğin 10.64.30.50:80). Bu yüzden persist-records tablosunda cookie kayıtları görünmez ve failover\'da da kalıcılık korunur.',
              hints: ['Set-Cookie başlığını kim alıyor?', 'persist-records\'ta cookie kaydı var mı?'] },
            { t: '<code>vs_api</code>\'ye source address persistence ekleyin, iki istek gönderin ve kalıcılık tablosuna bakın.', why: 'API istemcileri cookie tutmaz; kaynak IP\'ye göre kalıcılık uygundur. Kayıt BIG-IP\'deki tabloda görünür.',
              hints: ['modify ltm virtual vs_api persist replace-all-with { source_addr }; curl; show ltm persistence persist-records', '<code>modify ltm virtual vs_api persist replace-all-with { source_addr }</code> → bash\'te <code>for i in {1..2}; do curl -s http://203.0.113.101/; done</code> → <code>show ltm persistence persist-records</code>'],
              steps: ['modify ltm virtual vs_api persist replace-all-with { source_addr }', 'run util bash', 'for i in {1..2}; do curl -s http://203.0.113.101/; done', 'exit', 'show ltm persistence persist-records'],
              check: s => s.model.virtuals.vs_api.persist[0] === 'source_addr' && curls(s).some(c => c.ip === '203.0.113.101' && c.persisted) && s.ev.list().some(e => e.show === 'ltm persistence') },
            { t: 'Soru: bir şirketin 2000 çalışanı internete tek bir NAT adresinden çıkıyor. Web uygulamasında source address persistence kullanılırsa ne olur?', ask: { choices: [['one', 'Hepsi tek kaynak IP\'den geldiği için aynı üyeye düşer; yük dengelenmez'], ['fine', 'Her çalışan ayrı üyeye dağıtılır'], ['cookie', 'BIG-IP otomatik olarak cookie\'ye geçer'], ['drop', 'Bağlantılar reddedilir']], correct: 'one' },
              why: 'Source address persistence yalnız kaynak IP\'ye bakar. Büyük NAT ya da proxy arkasındaki kullanıcılar için cookie persistence doğru seçimdir; cookie tutmayan istemciler için source address, cookie persistence\'ın fallback\'i olarak kullanılabilir.',
              hints: ['Karar neye göre veriliyor?', 'Tüm istekler aynı kaynak IP\'den.'] },
            { t: 'Kaydedin.', why: 'Persistence ayarları virtual server\'ın parçası olarak /config/bigip.conf dosyasına yazılır.', hints: ['save sys config', '<code>save sys config</code>'], steps: ['save sys config'], needs: [0, 3],
              check: s => !s.dirty() && s.savedModel.virtuals.vs_web.persist[0] === 'cookie' && s.savedModel.virtuals.vs_api.persist[0] === 'source_addr' },
        ],
        verify: ['list ltm virtual vs_web persist profiles', 'show ltm persistence persist-records'],
        learn: ['Cookie persistence = HTTP profili + istemcide cookie.', 'Source address = BIG-IP\'de tablo; NAT arkasında dengesizlik.', 'persist-records yalnız tablo tutan yöntemleri gösterir.'],
        links: { tool: '#/f5-ltm/persistence', cli: '#/cli/f5-ltm', wizard: '#/troubleshoot/f5-ltm/104' }, cert: 'F5CAB2.03 · F5CAB3.01'
    },
    // ═══ 3 · Port translation ve SNAT ═══
    {
        id: 'f5-08', vendor: 'f5-ltm', level: 3, title: 'Port translation ve SNAT: automap, SNAT pool ve dönüş yolu', minutes: 20, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-04'],
        up: UP, sim: SIM2, start: NET.concat([MON, 'create ltm pool app_pool members add { 10.64.30.53:8080 } monitor mon_web']), startMode: 'tmsh',
        story: 'Yeni bir iç uygulama <b>srv-app</b> (<code>10.64.30.53</code>) yalnız <b>8080</b> portunda dinliyor. İstemciler standart <b>80</b> portundan (<code>203.0.113.102:80</code>) erişecek. Güvenlik ekibi sunucu loglarında BIG-IP\'nin self IP\'si yerine ayrı bir kaynak adres görmek istiyor: <code>10.64.30.20</code>.',
        lesson: L('Virtual server varsayılan olarak <b>address translation</b> ve <b>port translation</b> yapar: VIP:80\'e gelen istek üyenin IP:8080\'ine çevrilir (<code>translate-port enabled</code>). Port çevirisi kapatılırsa istek üyeye VIP\'in portuyla (80) gider. <b>SNAT</b> kaynak adresi çevirir: <b>automap</b> sunucu ağındaki self IP\'yi (HA\'da floating self IP\'yi) kullanır; <b>SNAT pool</b> belirlenmiş adresleri kullanır. Bir SNAT adresi aynı hedefe yaklaşık 64 bin eşzamanlı bağlantı taşıyabilir; yoğun uygulamalarda SNAT pool\'a adres eklenir.',
            'Port çevirisinin kapatılması ya da SNAT\'ın unutulması "sağlık yeşil ama uygulama açılmıyor" arızalarının en sık iki nedenidir.',
            'create ltm virtual vs_app destination 203.0.113.102:80 pool app_pool profiles add { http } source-address-translation { type automap }\ncreate ltm snatpool sp_app members add { 10.64.30.20 }\nmodify ltm virtual vs_app source-address-translation { type snat pool sp_app }',
            ['translate-port disabled bırakıp üyeyi farklı porttan tanımlamak.', 'SNAT pool adresini sunucuların ağına yönlendirilemeyen bir ağdan seçmek.', 'Automap\'in hangi self IP\'yi kullandığını bilmemek (HA\'da floating tercih edilir).', 'Çok yoğun uygulamada tek SNAT adresiyle port tükenmesi.']),
        goals: ['Port translation', 'SNAT automap ve SNAT pool', 'Dönüş yolunun önemi'],
        tasks: [
            { t: '<code>vs_app</code> virtual server\'ı: <code>203.0.113.102:80</code> → <code>app_pool</code> (üye 8080), HTTP profili, SNAT automap. Bir istekle deneyin.', why: 'Port çevirisi varsayılan olarak açıktır: istemci 80\'e gelir, sunucuya 8080\'e gider.',
              hints: ['create ltm virtual vs_app destination … pool app_pool profiles add { http } source-address-translation { type automap }', '<code>create ltm virtual vs_app destination 203.0.113.102:80 pool app_pool profiles add { http } source-address-translation { type automap }</code> → bash\'te <code>curl -s http://203.0.113.102/</code>'],
              steps: [VS_APP, 'run util bash', 'curl -s http://203.0.113.102/', 'exit'],
              check: s => !!s.model.virtuals.vs_app && curls(s).some(c => c.ip === '203.0.113.102' && c.kind === 'ok') },
            { t: 'Deneyin: port çevirisini kapatın (<code>translate-port disabled</code>), isteği tekrarlayın, sonucu görün ve açın.', why: 'Kapalıyken istek sunucuya 80 portuyla gider; sunucu orada dinlemediği için bağlantıyı reddeder, istemci "connection reset" görür. Monitör ise 8080\'i sınadığı için üye yeşil kalır.',
              hints: ['modify ltm virtual vs_app translate-port disabled; curl; … enabled', '<code>modify ltm virtual vs_app translate-port disabled</code> → bash\'te <code>curl -s http://203.0.113.102/</code> → <code>exit</code> → <code>modify ltm virtual vs_app translate-port enabled</code>'],
              steps: ['modify ltm virtual vs_app translate-port disabled', 'run util bash', 'curl -s http://203.0.113.102/', 'exit', 'modify ltm virtual vs_app translate-port enabled'], needs: [0],
              check: s => curlsAfter(s, /translate-port disabled/, /translate-port enabled/).some(c => c.ip === '203.0.113.102' && c.kind === 'reset') && !!s.model.virtuals.vs_app && s.model.virtuals.vs_app.tport === 'enabled' },
            { t: 'SNAT pool: <code>sp_app</code> = <code>10.64.30.20</code>; vs_app automap yerine bu pool\'u kullansın. İstekle doğrulayın.', why: 'Sunucular artık istemcileri 10.64.30.20 kaynağıyla görür. Adres sunucu ağından seçildiği için yanıt BIG-IP\'ye döner.',
              hints: ['create ltm snatpool sp_app members add { … }; modify ltm virtual vs_app source-address-translation { type snat pool sp_app }', '<code>create ltm snatpool sp_app members add { 10.64.30.20 }</code> → <code>modify ltm virtual vs_app source-address-translation { type snat pool sp_app }</code> → bash\'te <code>curl -s http://203.0.113.102/</code>'],
              steps: ['create ltm snatpool sp_app members add { 10.64.30.20 }', 'modify ltm virtual vs_app source-address-translation { type snat pool sp_app }', 'run util bash', 'curl -s http://203.0.113.102/', 'exit'], needs: [0],
              check: s => { const v = s.model.virtuals.vs_app; return !!v && v.sat.type === 'snat' && v.sat.pool === 'sp_app' && curlsAfter(s, /type snat pool sp_app/).some(c => c.ip === '203.0.113.102' && c.kind === 'ok'); } },
            { t: 'Soru: SNAT pool\'daki tek adres yoğun saatlerde yetersiz kalırsa (aynı sunucuya on binlerce eşzamanlı bağlantı) ne olur ve çözüm nedir?', ask: { choices: [['ports', 'Kaynak port tükenir, yeni bağlantılar kurulamaz; SNAT pool\'a adres eklenir'], ['none', 'Hiçbir şey; SNAT sınırsızdır'], ['automap', 'Automap\'e geçmek sınırı kaldırır'], ['mtu', 'MTU büyütülür']], correct: 'ports' },
              why: 'Bir kaynak adres + hedef adres:port için yaklaşık 64 bin kaynak port vardır. Automap de tek self IP kullandığı için aynı sınıra takılır. SNAT pool\'a adres eklemek kapasiteyi artırır.',
              hints: ['Bir IP adresinde kaç kaynak port var?', 'Kapasite nasıl artar?'] },
            { t: 'Kaydedin.', why: 'SNAT pool ve virtual server ayarları kalıcı olsun.', hints: ['save sys config', '<code>save sys config</code>'], steps: ['save sys config'], needs: [0, 2],
              check: s => !s.dirty() && !!s.savedModel.snatpools.sp_app && s.savedModel.virtuals.vs_app.sat.type === 'snat' },
        ],
        verify: ['list ltm virtual vs_app', 'list ltm snatpool sp_app'],
        learn: ['translate-port enabled: VIP portu üye portuna çevrilir.', 'automap = self IP; snatpool = belirli adresler.', 'SNAT adresi sunucuların yanıtı BIG-IP\'ye döndüreceği bir ağdan olmalı.', 'Tek SNAT adresi ≈ 64 bin eşzamanlı bağlantı / hedef.'],
        links: { tool: '#/f5-ltm/snatpool', cli: '#/cli/f5-ltm' }, cert: 'F5CAB2.03'
    },
    // ═══ 2 · HTTP durum kodları ve metotları ═══
    {
        id: 'f5-09', vendor: 'f5-ltm', level: 2, title: 'HTTP durum kodları ve metotları: kim, neden, ne döndürüyor?', minutes: 20, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-04'],
        up: UP, sim: SIM2, start: NET.concat(LTM3), startMode: 'tmsh',
        story: 'Yardım masasına aynı uygulamayla (<code>http://203.0.113.100</code>) ilgili farklı şikâyetler geldi: "eski adres açılmıyor", "rapor sayfası hata veriyor", "yönetim sayfası yetki istiyor". Her birini istekle sınayıp HTTP durum kodunu doğru yorumlayın. İpucu: <code>curl -s -o /dev/null -w "%{http_code}\\n" URL</code> yalnız kodu yazar, <code>curl -I</code> başlıkları gösterir.',
        lesson: L('HTTP durum kodları beş sınıftır: <b>2xx</b> başarı (200 OK), <b>3xx</b> yönlendirme (301 kalıcı, 302 geçici; <code>Location</code> başlığı yeni adresi verir; 304 önbellekteki kopya geçerli), <b>4xx</b> istemci hatası (400 bozuk istek, 401 kimlik doğrulama gerekli, 403 yasak, 404 bulunamadı, 405 metot izinli değil), <b>5xx</b> sunucu hatası (500 uygulama hatası, 502 arkadaki bir ağ geçidi/proxy geçersiz yanıt aldı, 503 hizmet kullanılamıyor, 504 arkadaki sunucu zamanında yanıt vermedi). BIG-IP varsayılan olarak kendisi kod üretmez: kodlar sunucudan gelir. Pool\'da çalışan üye yoksa BIG-IP 503 değil <b>TCP RST</b> gönderir (istemci "connection reset" görür); 503 sayfası isteniyorsa iRule ile üretilir.',
            'Kodu doğru okumak arızayı doğru ekibe yönlendirir: 4xx çoğunlukla istek/yetki, 5xx sunucu/uygulama, RST ya da zaman aşımı ise çoğunlukla BIG-IP/ağ tarafıdır.',
            'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/eski\ncurl -I http://203.0.113.100/eski\ncurl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/rapor\ncurl -X OPTIONS -I http://203.0.113.100/',
            ['Her 5xx\'i BIG-IP\'ye yüklemek: çoğu sunucudan gelir.', 'Pool boşken 503 beklemek: varsayılan davranış RST\'dir.', '3xx\'te Location başlığına bakmamak.', 'TRACE gibi gereksiz metotları açık bırakmak (güvenlik taramalarında bulgu olur).']),
        goals: ['Durum kodu sınıfları', 'Yönlendirmede Location', 'Kodun kaynağı: sunucu mu BIG-IP mi', 'HTTP metotları ve OPTIONS'],
        tasks: [
            { t: '"Eski adres açılmıyor": <code>/eski</code> için yalnız kodu, sonra başlıkları görün.', why: 'Kod 301 ise sayfa kalıcı olarak taşınmıştır; tarayıcı <code>Location</code>\'daki adrese gider. curl yönlendirmeyi kendiliğinden izlemez.',
              hints: ['curl -s -o /dev/null -w "%{http_code}\\n" …; curl -I …', '<code>curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/eski</code> → <code>curl -I http://203.0.113.100/eski</code>'],
              steps: ['run util bash', 'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/eski', 'curl -I http://203.0.113.100/eski', 'exit'],
              check: s => curls(s).some(c => c.path === '/eski' && c.code === 301) && curls(s).some(c => c.path === '/eski' && c.method === 'HEAD') },
            { t: 'Soru: <code>/eski</code> ne döndürdü ve kullanıcı neden "açılmıyor" diyor olabilir?', ask: { choices: [['301', '301: sayfa /yeni adresine kalıcı olarak taşınmış; kullanıcının kısayolu ya da yönlendirmeyi izlemeyen bir istemci eski adreste kalıyor'], ['404', '404: sayfa yok'], ['bigip', 'BIG-IP isteği engelliyor'], ['500', '500: sunucu hatası']], correct: '301' },
              why: '3xx bir hata değil yönlendirmedir: Location başlığı yeni adresi söyler. Tarayıcılar izler; bazı eski istemciler ve betikler izlemez.', hints: ['İlk satırdaki kod', 'Location başlığı'] },
            { t: '"Rapor sayfası hata veriyor" (<code>/rapor</code>) ve "yönetim sayfası" (<code>/yonetim</code>) için kodları alın.', why: 'Aynı uygulamada farklı yollar farklı kodlar dönebilir. Kod sınıfı sorunun kimde olduğunu söyler.',
              hints: ['İki curl -w "%{http_code}"', '<code>curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/rapor</code> → <code>… /yonetim</code>'],
              steps: ['run util bash', 'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/rapor', 'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/yonetim', 'exit'],
              check: s => curls(s).some(c => c.path === '/rapor' && c.code) && curls(s).some(c => c.path === '/yonetim' && c.code) },
            { t: 'Soru: <code>/rapor</code> 502, <code>/yonetim</code> 401 döndü. Hangisi doğru yorum?', ask: { choices: [['right', '502: uygulama sunucusunun arkasındaki bir servis (ör. rapor motoru) geçersiz yanıt verdi — uygulama ekibi; 401: kimlik doğrulama gerekli — kullanıcı giriş yapmalı'], ['bigip', 'İkisini de BIG-IP üretti; pool bozuk'], ['swap', '502 kullanıcı hatası, 401 sunucu hatası'], ['net', 'İkisi de ağ sorunu']], correct: 'right' },
              why: 'BIG-IP bu kurulumda kod üretmiyor; kodlar sunucudan geliyor ve pool sağlıklı. 5xx sunucu tarafı, 4xx istemci tarafıdır. 401 bir arıza değil, oturum açma isteğidir.', hints: ['Kod sınıfları: 4xx, 5xx', 'Pool\'un durumu yeşil.'] },
            { t: 'Hangi HTTP metotlarına izin verildiğini <code>OPTIONS</code> ile sorun; <code>TRACE</code> isteğinin sonucunu görün.', why: 'OPTIONS yanıtındaki <code>Allow</code> başlığı izinli metotları listeler. TRACE, isteği olduğu gibi geri yansıttığı için (XST saldırısı) kapalı olmalıdır: sunucu 405 döndürmelidir. Not: "LIST" diye bir HTTP metodu yoktur.',
              hints: ['curl -X OPTIONS -I …; curl -X TRACE -s -o /dev/null -w …', '<code>curl -X OPTIONS -I http://203.0.113.100/</code> → <code>curl -X TRACE -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/</code>'],
              steps: ['run util bash', 'curl -X OPTIONS -I http://203.0.113.100/', 'curl -X TRACE -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/', 'exit'],
              check: s => curls(s).some(c => c.method === 'OPTIONS') && curls(s).some(c => c.method === 'TRACE' && c.code === 405) },
            { t: 'Deneyin: pool\'daki tüm üyeleri zorla kapatın (<code>state user-down</code>), istek gönderin ve sonucu görün; sonra üyeleri geri açın.', why: 'Çalışan üye kalmayınca BIG-IP bağlantıyı RST ile keser; 503 dönmez. Bu, "BIG-IP mi sunucu mu" sorusunun en net cevabıdır: RST ya da zaman aşımı → BIG-IP/ağ; HTTP kodu → sunucu (ya da iRule).',
              hints: ['members modify { … { state user-down } … }; curl -v; … user-up', '<code>modify ltm pool web_pool members modify { 10.64.30.50:80 { state user-down } 10.64.30.51:80 { state user-down } 10.64.30.52:80 { state user-down } }</code> → bash\'te <code>curl -v http://203.0.113.100/</code> → geri açın'],
              steps: ['modify ltm pool web_pool members modify { 10.64.30.50:80 { state user-down } 10.64.30.51:80 { state user-down } 10.64.30.52:80 { state user-down } }', 'run util bash', 'curl -v http://203.0.113.100/', 'exit', 'modify ltm pool web_pool members modify { 10.64.30.50:80 { state user-up } 10.64.30.51:80 { state user-up } 10.64.30.52:80 { state user-up } }'],
              check: s => curls(s).some(c => c.kind === 'reset') && Object.values(s.model.pools.web_pool.members).every(m => m.state === 'user-up') },
            { t: 'Soru: pool\'da çalışan üye kalmadığında istemci ne gördü?', ask: { choices: [['rst', 'Bağlantı sıfırlandı (TCP RST); BIG-IP varsayılan olarak 503 üretmez'], ['503', 'HTTP 503 Service Unavailable'], ['404', 'HTTP 404'], ['timeout', 'Zaman aşımı']], correct: 'rst' },
              why: 'Varsayılan davranış RST\'dir. Kullanıcıya bakım sayfası ya da 503 göstermek için iRule (LB_FAILED olayında HTTP::respond) ya da fallback host yapılandırılır.', hints: ['curl\'ün son satırı', 'Connection reset by peer'] },
        ],
        verify: ['curl -I http://203.0.113.100/eski', 'show ltm pool web_pool members'],
        learn: ['2xx başarı, 3xx yönlendirme (Location), 4xx istemci, 5xx sunucu.', 'Kodlar varsayılan olarak sunucudan gelir; BIG-IP pool boşken RST gönderir.', 'OPTIONS → Allow; TRACE kapalı olmalı (405).'],
        links: { cli: '#/cli/f5-ltm' }, cert: 'F5CAB2.02 · F5CAB5.03'
    },
    // ═══ 5 · Arıza: VIP açılmıyor ═══
    {
        id: 'f5-10', vendor: 'f5-ltm', level: 5, title: '"Web sitesi açılmıyor" — arıza kaydı (monitor, SNAT, port, üye ve VS durumu)', minutes: 25, kind: 'adc', hostname: 'bigip-a.lab.example', pre: ['f5-04', 'f5-08'],
        up: UP, sim: SIM2, start: NET.concat(LTM3), startMode: 'tmsh',
        variants: [
            { key: 'recv', start: ['modify ltm monitor http mon_web recv "200 0K"'], fix: ['modify ltm monitor http mon_web recv "200 OK"'] },
            { key: 'snat', start: ['modify ltm virtual vs_web source-address-translation { type none }'], fix: ['modify ltm virtual vs_web source-address-translation { type automap }'] },
            { key: 'port', start: ['modify ltm pool web_pool members replace-all-with { 10.64.30.50:8080 10.64.30.51:8080 10.64.30.52:8080 }', 'modify ltm pool web_pool monitor gateway_icmp'], fix: ['modify ltm pool web_pool members replace-all-with { 10.64.30.50:80 10.64.30.51:80 10.64.30.52:80 } monitor mon_web'] },
            { key: 'disabled', start: ['modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-disabled } 10.64.30.51:80 { session user-disabled } 10.64.30.52:80 { session user-disabled } }'], fix: ['modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-enabled } 10.64.30.51:80 { session user-enabled } 10.64.30.52:80 { session user-enabled } }'] },
            { key: 'vsdisabled', start: ['modify ltm virtual vs_web disabled'], fix: ['modify ltm virtual vs_web enabled'] },
        ],
        story: '<b>Arıza kaydı:</b> "Dünkü bakımdan sonra <code>http://203.0.113.100</code> açılmıyor." Beklenen: <code>vs_web</code> → <code>web_pool</code> (üç sunucu, port 80, monitör <code>mon_web</code> /health → 200 OK), SNAT automap (sunucuların ağ geçidi BIG-IP değil). Belirtiyi istemciden görün, durum ve yapılandırmayı inceleyin, tek değişiklikle düzeltin. <small>Her turda farklı bir arıza gelebilir.</small>',
        lesson: L('"Site açılmıyor" arızasında belirti türü yolu gösterir. <b>Connection refused</b>: virtual server yok ya da devre dışı. <b>Connection reset</b>: VS var ama gönderecek çalışan üye yok (monitör down, üyeler devre dışı) ya da sunucu o portta dinlemiyor. <b>Zaman aşımı</b>: istek sunucuya gidiyor ama yanıt BIG-IP\'ye dönmüyor (SNAT yok, asimetrik yol) ya da L2 sorunu. Sonra renkler (<code>show ltm virtual</code>, <code>show ltm pool … members</code>), yapılandırma (<code>list</code>) ve <code>/var/log/ltm</code> ile kanıt toplanır.',
            'Aynı belirtiyi (site açılmıyor) beş ayrı neden üretir. Belirtinin türünü okumak, doğru yere bakmanın ilk adımıdır; "yeşil" bir pool bile uygulamanın çalıştığını kanıtlamaz.',
            'curl -v http://203.0.113.100/\ntmsh show ltm virtual vs_web\ntmsh show ltm pool web_pool members\ntmsh list ltm virtual vs_web\ntail -n 20 /var/log/ltm',
            ['Monitörü yalnız ICMP yapıp "yeşil" görünce uygulamanın çalıştığını sanmak.', 'recv dizgesinde yazım hatası (0 yerine O).', 'Bakımda devre dışı bırakılan üyeleri açmayı unutmak.', 'SNAT\'ı kaldırmak.', 'Kanıt toplamadan virtual server\'ı silip yeniden oluşturmak.']),
        goals: ['Belirti türünü okumak (refused / reset / timeout)', 'Durum renkleri ve Reason', 'Yapılandırma ve log', 'Tek düzeltme ve istemciden doğrulama'],
        tasks: [
            { t: 'Belirti: bash\'ten VIP\'e <code>curl -v</code> ile istek gönderin.', why: 'curl\'ün son satırı arızanın türünü söyler: refused, reset ya da zaman aşımı.',
              hints: ['run util bash; curl -v …; exit', '<code>run util bash</code> → <code>curl -v http://203.0.113.100/</code> → <code>exit</code>'], steps: ['run util bash', 'curl -v http://203.0.113.100/', 'exit'], loo: false, /* son görevdeki doğrulama aynı isteği kullanır */
              check: s => curls(s).some(c => c.ip === '203.0.113.100') },
            { t: 'Kanıt: virtual server ve pool üyelerinin durumu, virtual server yapılandırması ve LTM logu.', why: 'Availability ve Reason satırları nedeni söyler; yapılandırmada SNAT, pool ve durum; logda monitör olayları görünür.',
              hints: ['show ltm virtual …; show ltm pool … members; list ltm virtual …; tail /var/log/ltm', '<code>show ltm virtual vs_web</code> → <code>show ltm pool web_pool members</code> → <code>list ltm virtual vs_web</code> → <code>run util bash</code> → <code>tail -n 20 /var/log/ltm</code> → <code>exit</code>'],
              steps: ['show ltm virtual vs_web', 'show ltm pool web_pool members', 'list ltm virtual vs_web', 'run util bash', 'tail -n 20 /var/log/ltm', 'exit'],
              check: s => s.ev.list().some(e => e.show === 'ltm virtual') && s.ev.list().some(e => e.show === 'ltm pool' && e.members) && s.ev.ran(/^tmsh list ltm virtual vs_web$/) && s.ev.list().some(e => e.file === '/var/log/ltm') },
            { t: 'Kök neden hangisi?', ask: { choices: [['recv', 'Monitörün recv dizgesi yanlış: tüm üyeler monitörden kırmızı'], ['snat', 'SNAT kaldırılmış: yanıtlar BIG-IP\'ye dönmüyor (zaman aşımı)'], ['port', 'Üyeler yanlış porttan (8080) tanımlanmış ve monitör yalnız ICMP: yeşil görünüyor ama sunucu reddediyor'], ['disabled', 'Üyeler bakımda devre dışı bırakılıp açılmamış'], ['vsdisabled', 'Virtual server devre dışı']], correct: v => v.key },
              why: 'refused → VS devre dışı. reset + üyeler kırmızı → monitör; reset + üyeler "disabled" → bakım; reset + üyeler yeşil ama port 8080 ve monitör ICMP → yanlış port. Zaman aşımı + üyeler yeşil + SNAT none → dönüş yolu.',
              hints: ['curl hangi hatayı verdi?', 'Üyelerin Availability/State satırlarına bakın.'], needs: [1] },
            { t: 'Tek değişiklikle düzeltin.', why: 'Yalnız bozuk halkayı onarın. Yanlış port arızasında monitörü de uygulamayı gerçekten sınayan HTTP monitörüne döndürün.',
              hints: ['Kök nedene göre tek değişiklik.', 'recv: <code>modify ltm monitor http mon_web recv "200 OK"</code> · snat: <code>… source-address-translation { type automap }</code> · port: <code>modify ltm pool web_pool members replace-all-with { 10.64.30.50:80 10.64.30.51:80 10.64.30.52:80 } monitor mon_web</code> · disabled: <code>… session user-enabled</code> · vsdisabled: <code>modify ltm virtual vs_web enabled</code>'],
              steps: v => v.fix, check: s => siteOk(s),
              fb: s => { const p = s.model.pools.web_pool; return p && (p.monitor || []).every(m => /icmp/.test(m)) ? 'Çalışır ama monitör yalnız ICMP: uygulama çökse bile üyeler yeşil kalır. HTTP monitörü kullanın.' : null; } },
            { t: 'Doğrulayın ve kaydedin: aynı istek 200 dönmeli.', why: 'İstemci tarafındaki doğrulama, kaydı kapatmanın kanıtıdır.',
              hints: ['curl; save sys config', '<code>run util bash</code> → <code>curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/</code> → <code>exit</code> → <code>save sys config</code>'],
              steps: ['run util bash', 'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/', 'exit', 'save sys config'], needs: [3], loo: false,
              check: s => { const L2 = s.ev.list(); const i = lastIdx(L2, e => e.curl && e.curl.ip === '203.0.113.100' && e.curl.code === 200); return i >= 0 && !s.dirty() && siteOk(s); } },
        ],
        verify: ['show ltm virtual vs_web', 'show ltm pool web_pool members', 'curl -v http://203.0.113.100/'],
        learn: ['refused → VS yok/devre dışı; reset → üye yok/port kapalı; zaman aşımı → dönüş yolu/L2.', 'Yeşil pool uygulamanın çalıştığını kanıtlamaz; HTTP monitörü kullanın.', 'Önce kanıt, sonra tek değişiklik.'],
        links: { tool: '#/f5-ltm/monitor', cli: '#/cli/f5-ltm', wizard: '#/troubleshoot/f5-ltm/103' }, cert: 'F5CAB5.03 · F5CAB5.04 · F5CAB5.05'
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
