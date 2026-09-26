'use strict';
// ─── iRule Arenası · Nöbet: hikâyeli olay müdahalesi (CgArena._nb*) ───────────────────────────
// Her vaka bir tmsh simülatörü oturumu (assets/js/lab/tmsh.js) üzerinde çalışır: teşhis eylemleri gerçek komut çıktısı üretir,
// seçilen düzeltmeler aynı motorda uygulanır ve "kanıt" komutlarıyla doğrulanır (düzeldi mi, bir şey bozuldu mu?).
// Şirket kurgusaldır. Adresler yalnız belgeleme blokları (RFC 5737), 10.64/16, 10.240/16; alan adları lab.example.
// Log biçimleri gerçek örneklerden (notes/f5-tmsh-cikti-ornekleri.md §7, §11; f5.js NIGHT); gecenin kayıtları temsilîdir.
//
// Şema: { id, title, topic, level, clock: 'SS:DD', target: dk, budget: eylem, alarm: { sev: 'crit'|'warn', src, text }, story, symptom,
//   team: [{ who, role, at, text }], report?: [{ id, sev, title, text }],
//   lab: { hostname, up, sim, start, startMode },
//   diag: [{ id, label, icon, cmds: [...], min, useful: bool, issues?: [issue id], note }],
//   issues: [{ id, title, q, causes: [[v, metin]], cause, why, fixes: [{ id, label, cmds: [...], min, level: 'best'|'good'|'bad', note }] }],
//   checks: [{ id, label, kind: 'fix'|'safe', issue?, cmd: komut | [komutlar], test: (r, s) => bool }]   r = { out, curl } — curl: komutun son curl kaydı
//   learn: [...], sources: [...] }
(function () {
    // ── ortak ağ ve sunucular (f5.js ile aynı yerleşim)
    const SW = { '1.1': { mode: 'trunk', vlans: [20] }, '1.2': { mode: 'access', vlan: 10 }, '1.3': { mode: 'trunk', vlans: [30] } };
    const UP = ['1.1', '1.2', '1.3'];
    const NET = ['create sys management-ip 10.240.10.11/24', 'create sys management-route default gateway 10.240.10.1',
        'create net vlan external interfaces add { 1.1 { tagged } } tag 20', 'create net vlan internal interfaces add { 1.3 { tagged } } tag 30', 'create net vlan server interfaces add { 1.2 { untagged } } tag 10',
        'create net self self_ext address 203.0.113.11/24 vlan external allow-service none', 'create net self self_int address 10.64.10.11/24 vlan internal allow-service default',
        'create net self self_srv address 10.64.30.11/24 vlan server allow-service none', 'create net route default network default gw 203.0.113.1'];
    const BASE_SIM = srv => ({ sw: SW, remote: ['198.51.100.0/24'], mgmtHosts: ['10.240.10.1'], mgmtRemote: ['10.240.0.0/16'], adminSrc: '10.240.20.5', client: '198.51.100.20', servers: srv,
        hosts: [{ ip: '203.0.113.1', vlan: 20 }, { ip: '10.64.10.50', vlan: 30 }, { ip: '10.64.30.1', vlan: 10 }].concat(srv.map(x => ({ ip: x.ip, vlan: 10 }))) });
    const H = ' bigip-a.lab.example ';

    // ═══ (a) Pentest raporu geldi ═══
    // Uygulama sunucuları: TRACE açık, Server/X-Powered-By sızdırıyor; mobil API PUT/DELETE kullanıyor
    const LEAK = ['Server: Apache/2.4.29 (Ubuntu)', 'X-Powered-By: PHP/7.2.24'];
    const PT_PORT = { methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE'], paths: {
        '/': { code: 200, headers: LEAK, body: 'Magaza ana sayfa' }, '/health': 200,
        '/giris': { code: 200, headers: LEAK, body: 'Giris sayfasi' },
        '/api/bilgi': { code: 200, headers: LEAK.concat(['Content-Type: application/json']), body: '{"surum":"3.2"}' },
        '*': { code: 200, headers: LEAK.concat(['Content-Type: application/json']), body: '{"ok":true}' } } };
    const PT_SRV = [['10.64.30.50', 'srv-a'], ['10.64.30.51', 'srv-b'], ['10.64.30.52', 'srv-c']].map(([ip, name]) => ({ ip, name, gw: '10.64.30.1', ports: { 80: PT_PORT } }));
    const PT_SIM = Object.assign(BASE_SIM(PT_SRV), {
        tmp: ['app.lab.example.crt', 'app.lab.example.key', 'intermediate-ca.crt'], trust: ['Lab Root CA'],
        sslFiles: {
            '/var/tmp/app.lab.example.crt': { type: 'cert', cn: 'app.lab.example', san: ['DNS:app.lab.example'], issuer: 'Lab Intermediate CA', pair: 'app' },
            '/var/tmp/app.lab.example.key': { type: 'key', pair: 'app' },
            '/var/tmp/intermediate-ca.crt': { type: 'cert', cn: 'Lab Intermediate CA', issuer: 'Lab Root CA', ca: true, nb: 'Jan  1 00:00:00 2024 GMT', na: 'Jan  1 00:00:00 2029 GMT' } },
        // dünden kalma oturum: şifresiz BIGipServer çerezi srv-b'yi (10.64.30.51:80) gösteriyor
        jars: { '/var/tmp/eski_oturum': { BIGipServerweb_pool: '857620490.20480.0000' } } });
    const PT_START = NET.concat([
        'create ltm monitor http mon_web defaults-from http send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n" recv "200 OK"',
        'create ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 10.64.30.52:80 } monitor mon_web',
        'install sys crypto key app.lab.example.key from-local-file /var/tmp/app.lab.example.key', 'install sys crypto cert app.lab.example.crt from-local-file /var/tmp/app.lab.example.crt',
        'install sys crypto cert intermediate-ca.crt from-local-file /var/tmp/intermediate-ca.crt',
        'create ltm profile client-ssl app_clientssl defaults-from clientssl cert-key-chain replace-all-with { app.lab.example { cert app.lab.example.crt key app.lab.example.key chain intermediate-ca.crt } }',
        'create ltm profile http http_web defaults-from http', 'create ltm persistence cookie p_cookie defaults-from cookie',
        'create ltm virtual vs_https destination 203.0.113.100:443 pool web_pool profiles add { http_web app_clientssl } persist replace-all-with { p_cookie } source-address-translation { type automap }']);
    const U = p => '--resolve app.lab.example:443:203.0.113.100 https://app.lab.example' + p;
    const hdrs = r => (r.curl && r.curl.rhdrs) || [];

    // ═══ (b) Gece 02:14 ═══
    // 02:00'de başlayan gece yedeği ana sayfayı (/) yavaşlatıyor: srv-a 7 sn, srv-c 11 sn (en kötü), srv-b 4 sn; /health hafif (≤ 1 sn)
    const NT_PORT = d => ({ paths: { '/': { code: 200, body: 'Magaza ana sayfa', delay: d }, '/health': { code: 200, body: 'OK', delay: 0.4 }, '*': 200 } });
    const NT_SRV = [['10.64.30.50', 'srv-a', 7.2], ['10.64.30.51', 'srv-b', 4.1], ['10.64.30.52', 'srv-c', 11.4]].map(([ip, name, d]) => ({ ip, name, gw: '10.64.30.1', ports: { 80: NT_PORT(d) } }));
    const MD = (t, k, err, was) => 'Sep 25 ' + t + H + 'notice mcpd[7276]: 01070638:5: Pool /Common/web_pool member /Common/10.64.30.' + k + ':80 monitor status down. [ /Common/mon_web: down; last error: /Common/mon_web: ' + err + ' @2026/09/25 ' + t + '.  ]  [ was up for ' + was + ' ]';
    const MU = (t, k, was) => 'Sep 25 ' + t + H + 'notice mcpd[7276]: 01070727:5: Pool /Common/web_pool member /Common/10.64.30.' + k + ':80 monitor status up. [ /Common/mon_web: up ]  [ was down for ' + was + ' ]';
    const DL = 'No successful responses received before deadline.';
    const NT_LOG = [
        'Sep 25 01:12:40' + H + 'notice mcpd[7276]: 01070727:5: Pool /Common/web_pool member /Common/10.64.30.52:80 monitor status up. [ /Common/mon_web: up ]  [ was down for 0hr:0min:6sec ]',
        MD('02:01:07', 50, DL, '14hrs:2mins:11sec'), MU('02:01:17', 50, '0hr:0min:10sec'),
        MD('02:02:31', 52, DL, '0hr:49mins:51sec'), MU('02:02:41', 52, '0hr:0min:10sec'),
        MD('02:04:12', 50, DL, '0hr:2mins:55sec'), MD('02:04:15', 52, DL, '0hr:1min:34sec'), MU('02:04:22', 50, '0hr:0min:10sec'), MU('02:04:25', 52, '0hr:0min:10sec'),
        MD('02:07:48', 52, DL, '0hr:3mins:23sec'), MU('02:07:58', 52, '0hr:0min:10sec'),
        MD('02:09:02', 50, DL, '0hr:4mins:40sec'), MU('02:09:12', 50, '0hr:0min:10sec'),
        MD('02:11:37', 50, DL, '0hr:2mins:25sec'), MD('02:11:39', 52, DL, '0hr:3mins:41sec'),
        'Sep 25 02:11:44' + H + 'notice mcpd[7276]: 01071682:5: SNMP_TRAP: Virtual /Common/vs_web has become unavailable',
        MU('02:11:47', 50, '0hr:0min:10sec'), MU('02:11:49', 52, '0hr:0min:10sec'),
        'Sep 25 02:11:49' + H + 'notice mcpd[7276]: 01071681:5: SNMP_TRAP: Virtual /Common/vs_web has become available',
        MD('02:13:52', 52, DL, '0hr:2mins:3sec'), MD('02:14:01', 50, DL, '0hr:2mins:14sec'),
    ];
    const NT_SIM = Object.assign(BASE_SIM(NT_SRV), { ltmlog: NT_LOG });
    const NT_START = NET.concat([
        'create ltm monitor http mon_web defaults-from http interval 5 timeout 6 send "GET / HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n" recv "200 OK"',
        'create ltm pool web_pool members add { 10.64.30.50:80 10.64.30.51:80 10.64.30.52:80 } monitor mon_web',
        'create ltm virtual vs_web destination 203.0.113.100:80 pool web_pool profiles add { http } source-address-translation { type automap }']);
    const monOf = s => (s.model.monitors || {}).mon_web || {};

    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_ARENA_NOBET = [
        {
            id: 'pentest', title: 'Pentest raporu geldi', topic: 'TRACE, Server sızıntısı, BIGipServer çerezi, HSTS · "bozmadım" kanıtı', level: 3,
            clock: '09:40', target: 40, budget: 8,
            alarm: { sev: 'warn', src: 'Bilgi Güvenliği · bilet GUV-2291', text: 'Sızma testi raporu: magaza.lab.example için 4 bulgu. Kapanış tarihi cuma. Canlı sistemde çalışılacak; kesinti kabul edilmez.' },
            symptom: 'Kesinti yok; dış firma raporu dört bulgu listeliyor. Her bulgu için doğru katmanda, en dar ve geri alınabilir düzeltme; ardından hem bulgunun kapandığının hem de işleyişin bozulmadığının kanıtı isteniyor.',
            story: 'Mağaza sitesi <code>vs_https</code> (203.0.113.100:443) arkasında üç sunucuda çalışıyor. Mobil uygulama aynı adres üzerinden <code>PUT</code> ve <code>DELETE</code> ile sepet API\'sini kullanıyor. Cookie persistence açık: dün akşamdan beri alışveriş yapan kullanıcıların sepeti sunucuya bağlı.',
            team: [
                { who: 'Selin', role: 'Bilgi Güvenliği', at: '09:32', text: 'Rapor ekte. Denetçi her madde için "önce / sonra" çıktısı istiyor, ekran görüntüsü değil komut çıktısı.' },
                { who: 'Burak', role: 'Mobil ekip', at: '09:35', text: 'Uyarı: uygulama sepeti PUT /api/sepet ve DELETE /api/sepet/… ile güncelliyor. Bir daha kırılmasın lütfen 🙏' },
                { who: 'Deniz', role: 'Uygulama ekibi', at: '09:37', text: 'Sunucu tarafında Apache ayarına bu hafta dokunamıyoruz, dondurma dönemi. BIG-IP\'de çözebilir misiniz?' },
                { who: 'Ekip lideri', role: 'Nöbet', at: '09:39', text: 'Açık oturumlar kopmasın. Dün "required" deneyen oldu, müşteri hizmetleri ayağa kalktı.' },
            ],
            report: [
                { id: 'trace', sev: 'Orta', title: 'HTTP TRACE metodu açık', text: 'TRACE isteği 200 ile yanıtlanıyor (Cross-Site Tracing riski).' },
                { id: 'hdr', sev: 'Düşük', title: 'Sunucu sürüm bilgisi sızıyor', text: 'Yanıtlarda "Server: Apache/2.4.29 (Ubuntu)" ve "X-Powered-By: PHP/7.2.24".' },
                { id: 'cookie', sev: 'Orta', title: 'Yük dengeleyici çerezi iç adres içeriyor', text: 'BIGipServerweb_pool çerezi çözülebilir: iç IP ve port açığa çıkıyor.' },
                { id: 'hsts', sev: 'Düşük', title: 'HSTS başlığı yok', text: 'Strict-Transport-Security başlığı gönderilmiyor.' },
            ],
            lab: { hostname: 'bigip-a.lab.example', up: UP, sim: PT_SIM, start: PT_START, startMode: 'bash' },
            diag: [
                { id: 'trace', icon: 'fa-route', label: 'TRACE isteği gönder', min: 2, useful: true, issues: ['trace'], cmds: ['curl -sk -X TRACE -o /dev/null -w "%{http_code}\\n" ' + U('/')] },
                { id: 'head', icon: 'fa-heading', label: 'Ana sayfanın yanıt başlıkları', min: 2, useful: true, issues: ['hdr', 'cookie', 'hsts'], cmds: ['curl -skI -c /var/tmp/tani ' + U('/')] },
                { id: 'api', icon: 'fa-plug', label: 'API yanıt başlıkları (/api/bilgi)', min: 2, useful: true, issues: ['hdr'], cmds: ['curl -skI ' + U('/api/bilgi')] },
                { id: 'prof', icon: 'fa-sliders-h', label: 'HTTP profilini oku', min: 2, useful: true, issues: ['trace', 'hsts', 'hdr'], cmds: ['tmsh list ltm profile http http_web all-properties'] },
                { id: 'persist', icon: 'fa-cookie-bite', label: 'Persistence profilini oku', min: 2, useful: true, issues: ['cookie'], cmds: ['tmsh list ltm persistence cookie p_cookie'] },
                { id: 'vs', icon: 'fa-server', label: 'Virtual server yapılandırması', min: 2, useful: true, cmds: ['tmsh list ltm virtual vs_https'] },
                { id: 'iface', icon: 'fa-ethernet', label: 'Arayüz durumları', min: 2, useful: false, note: 'Bulguların hiçbiri L1/L2 ile ilgili değil.', cmds: ['tmsh show net interface'] },
                { id: 'ping', icon: 'fa-satellite-dish', label: 'Sunuculara ping', min: 2, useful: false, note: 'Sunucular ayakta; rapor erişilebilirlikle ilgili değil.', cmds: ['ping -c 2 10.64.30.50'] },
                { id: 'ver', icon: 'fa-info-circle', label: 'Yazılım sürümü', min: 1, useful: false, note: 'Rapor BIG-IP sürümüyle ilgili bir bulgu içermiyor.', cmds: ['tmsh show sys version'] },
            ],
            issues: [
                { id: 'trace', title: 'Bulgu 1 · TRACE açık', q: 'TRACE neden sunucuya kadar ulaşıyor?',
                  causes: [['prof', 'HTTP profilinde TRACE bilinen metotlar listesinde ve istek sunucuya iletiliyor (varsayılan profil)'], ['ssl', 'client-ssl profili TRACE\'i şifrelemiyor'], ['none', 'BIG-IP metotlara hiç karışamaz, yalnız sunucu kapatabilir']], cause: 'prof',
                  why: 'HTTP profilinin enforcement bölümü (known-methods + unknown-method) metot politikasını BIG-IP\'de uygular (K85840901). Varsayılan listede TRACE vardır.',
                  fixes: [
                      { id: 'del', level: 'best', min: 3, label: 'Profilde TRACE\'i bilinen metotlardan çıkar, bilinmeyen metodu reddet', cmds: ['tmsh modify ltm profile http http_web enforcement { known-methods delete { TRACE } unknown-method reject }'], note: 'En dar değişiklik: diğer metotlar aynen çalışır; TRACE bağlantı sıfırlamayla reddedilir.' },
                      { id: 'irule', level: 'good', min: 5, label: 'iRule ile TRACE\'e 405 döndür', cmds: ['tmsh create ltm rule r_trace when HTTP_REQUEST { if { [HTTP::method] eq "TRACE" } { HTTP::respond 405 content "" Allow "GET, HEAD, POST, PUT, DELETE" } }', 'tmsh modify ltm virtual vs_https rules add { r_trace }'], note: 'Çalışır ama her istekte kural çalışır; profil ayarı kodsuz ve ucuzdur.' },
                      { id: 'strict', level: 'bad', min: 3, label: 'Yalnız GET, HEAD, POST bırak; gerisini reddet', cmds: ['tmsh modify ltm profile http http_web enforcement { known-methods replace-all-with { GET HEAD POST } unknown-method reject }'], note: 'TRACE kapanır ama mobil uygulamanın PUT/DELETE istekleri de sıfırlanır.' },
                  ] },
                { id: 'hdr', title: 'Bulgu 2 · Server / X-Powered-By sızıntısı', q: 'Başlıklar nereden geliyor?',
                  causes: [['srv', 'Uygulama sunucusunun yanıtından; BIG-IP başlıkları olduğu gibi iletiyor'], ['bigip', 'BIG-IP\'nin kendi Server başlığından (server-agent-name)'], ['ssl', 'client-ssl profilinden']], cause: 'srv',
                  why: 'server-agent-name yalnız BIG-IP\'nin kendi ürettiği yanıtlardaki (yönlendirme, blok, HTTP::respond) Server başlığını belirler; sunucudan gelen başlıklar HTTP_RESPONSE\'ta iRule ile silinir.',
                  fixes: [
                      { id: 'both', level: 'best', min: 5, label: 'iRule: HTTP_RESPONSE\'ta Server ve X-Powered-By\'ı sil + server-agent-name none', cmds: ['tmsh create ltm rule r_gizle when HTTP_RESPONSE { HTTP::header remove Server ; HTTP::header remove X-Powered-By }', 'tmsh modify ltm virtual vs_https rules add { r_gizle }', 'tmsh modify ltm profile http http_web server-agent-name none'], note: 'Sunucu başlıkları silinir; BIG-IP\'nin kendi yanıtları da "BigIP" demez.' },
                      { id: 'rule', level: 'good', min: 4, label: 'Yalnız iRule: HTTP_RESPONSE\'ta iki başlığı sil', cmds: ['tmsh create ltm rule r_gizle when HTTP_RESPONSE { HTTP::header remove Server ; HTTP::header remove X-Powered-By }', 'tmsh modify ltm virtual vs_https rules add { r_gizle }'], note: 'Bulgu kapanır; BIG-IP\'nin kendi yanıtlarında "Server: BigIP" kalır.' },
                      { id: 'agent', level: 'bad', min: 2, label: 'Yalnız server-agent-name none', cmds: ['tmsh modify ltm profile http http_web server-agent-name none'], note: 'Sunucudan gelen başlıklara dokunmaz: bulgu açık kalır.' },
                  ] },
                { id: 'cookie', title: 'Bulgu 3 · BIGipServer çerezi iç adres içeriyor', q: 'Çerez değeri neden iç adresi veriyor?',
                  causes: [['enc', 'cookie-encryption kapalı: değer IP ve portun ters bayt kodlaması'], ['name', 'Çerez adı pool adını içeriyor'], ['http', 'HTTPS değil HTTP kullanılıyor']], cause: 'enc',
                  why: 'Şifresiz insert çerezi <IP>.<port>.0000 biçimindedir (840843274 → 10.64.30.50). Şifreleme preferred ile açılır: eski şifresiz çerezler de kabul edilir, oturumlar kopmaz.',
                  fixes: [
                      { id: 'pref', level: 'best', min: 3, label: 'cookie-encryption preferred + parola', cmds: ['tmsh modify ltm persistence cookie p_cookie cookie-encryption preferred cookie-encryption-passphrase NobetAnahtar2026'], note: 'Yeni çerezler şifreli; eski çerezli kullanıcılar sunucusunda kalır. Çerezler yenilenince required\'a geçilir.' },
                      { id: 'req', level: 'bad', min: 3, label: 'cookie-encryption required + parola', cmds: ['tmsh modify ltm persistence cookie p_cookie cookie-encryption required cookie-encryption-passphrase NobetAnahtar2026'], note: 'Şifresiz çerezler tanınmaz: dünden beri alışveriş yapanların sepeti başka sunucuya düşer.' },
                      { id: 'none', level: 'bad', min: 2, label: 'Cookie persistence\'ı kaldır', cmds: ['tmsh modify ltm virtual vs_https persist none'], note: 'Bulgu kapanır ama sepetler sunucuya bağlı: kullanıcılar her istekte başka sunucuya düşer.' },
                  ] },
                { id: 'hsts', title: 'Bulgu 4 · HSTS yok', q: 'HSTS nerede açılır?',
                  causes: [['prof', 'HTTP profilinin hsts ayarında (mode disabled)'], ['ssl', 'client-ssl profilinde'], ['srv', 'Yalnız sunucuda']], cause: 'prof',
                  why: 'HTTP profilinde hsts mode enabled, BIG-IP\'nin yanıtlara Strict-Transport-Security eklemesini sağlar; maximum-age saniyedir.',
                  fixes: [
                      { id: 'prof', level: 'best', min: 2, label: 'Profilde hsts mode enabled, maximum-age 31536000', cmds: ['tmsh modify ltm profile http http_web hsts { mode enabled maximum-age 31536000 }'], note: 'Kodsuz; tüm yanıtlara eklenir.' },
                      { id: 'irule', level: 'good', min: 4, label: 'iRule ile HTTP_RESPONSE\'ta başlık ekle', cmds: ['tmsh create ltm rule r_hsts when HTTP_RESPONSE { HTTP::header replace Strict-Transport-Security "max-age=31536000" }', 'tmsh modify ltm virtual vs_https rules add { r_hsts }'], note: 'Çalışır; profil ayarı varken kod gereksiz.' },
                      { id: 'zero', level: 'bad', min: 2, label: 'Profilde hsts mode enabled, maximum-age 0', cmds: ['tmsh modify ltm profile http http_web hsts { mode enabled maximum-age 0 }'], note: 'max-age=0 tarayıcıya HSTS kaydını SİLMESİNİ söyler: bulgu kapanmaz.' },
                  ] },
            ],
            checks: [
                { id: 'trace', kind: 'fix', issue: 'trace', label: 'TRACE reddediliyor', cmd: 'curl -sk -X TRACE -o /dev/null -w "%{http_code}\\n" ' + U('/'), test: r => !!r.curl && (r.curl.kind === 'reset' || [403, 405, 501].includes(r.curl.code)) },
                { id: 'hdr', kind: 'fix', issue: 'hdr', label: 'Server / X-Powered-By yok (/api/bilgi)', cmd: 'curl -skI ' + U('/api/bilgi'), test: r => !!r.curl && r.curl.code === 200 && !hdrs(r).some(h => /^(Server: Apache|X-Powered-By)/i.test(h)) && !/^Server: Apache/m.test(r.out) },
                { id: 'cookie', kind: 'fix', issue: 'cookie', label: 'Yeni ziyaretçi şifreli çerez alıyor', cmd: 'curl -skI -c /var/tmp/yeni ' + U('/'), test: r => hdrs(r).some(h => /^Set-Cookie: BIGipServerweb_pool=!/.test(h)) },
                { id: 'hsts', kind: 'fix', issue: 'hsts', label: 'HSTS başlığı (max-age > 0)', cmd: 'curl -skI ' + U('/giris'), test: r => hdrs(r).some(h => /^Strict-Transport-Security: max-age=[1-9]/.test(h)) },
                { id: 'put', kind: 'safe', label: 'Mobil API: PUT çalışıyor', cmd: 'curl -sk -X PUT -o /dev/null -w "%{http_code}\\n" ' + U('/api/sepet'), test: r => !!r.curl && r.curl.code === 200 },
                { id: 'delete', kind: 'safe', label: 'Mobil API: DELETE çalışıyor', cmd: 'curl -sk -X DELETE -o /dev/null -w "%{http_code}\\n" ' + U('/api/sepet/7'), test: r => !!r.curl && r.curl.code === 200 },
                { id: 'old', kind: 'safe', label: 'Dünkü oturum (şifresiz çerez) aynı sunucuda', cmd: 'curl -sk -b /var/tmp/eski_oturum -o /dev/null -w "%{http_code}\\n" ' + U('/sepet'), test: r => !!r.curl && r.curl.persisted && r.curl.member === '10.64.30.51:80' },
                { id: 'sticky', kind: 'safe', label: 'Yeni kullanıcının ikinci isteği aynı sunucuda', cmd: ['curl -sk -c /var/tmp/k2 -b /var/tmp/k2 -o /dev/null ' + U('/'), 'curl -sk -c /var/tmp/k2 -b /var/tmp/k2 -o /dev/null -w "%{http_code}\\n" ' + U('/sepet')], test: r => !!r.curl && r.curl.persisted },
            ],
            learn: ['Metot politikası HTTP profilinde: known-methods + unknown-method (en dar: yalnız TRACE\'i çıkar).', 'server-agent-name yalnız BIG-IP\'nin kendi yanıtları; sunucu başlıkları HTTP_RESPONSE\'ta silinir.', 'Çerez şifreleme: önce preferred, çerezler yenilenince required.', 'Her düzeltmenin iki kanıtı: bulgu kapandı + iş akışı bozulmadı.'],
            sources: ['K85840901 (HTTP profili metot ayarları)', 'K000141473 (CISA duyurusu: persistence çerezi şifreleme)', 'K23254150 (cookie encryption yapılandırma)', 'clouddocs.f5.com/api/irules/HTTP__header.html', 'tmsh-reference: ltm profile http (server-agent-name, hsts)'],
        },
        {
            id: 'gece', title: 'Gece 02:14', topic: 'Monitor flap: interval/timeout oranı, send dizgesi, yavaşlayan sunucu', level: 3,
            clock: '02:14', target: 30, budget: 7,
            alarm: { sev: 'crit', src: 'NOC · izleme sistemi', text: 'vs_web (203.0.113.100:80) son 15 dakikada 1 kez kırmızı; web_pool üyeleri 02:01\'den beri gidip geliyor. Kullanıcı şikâyeti: "site bazen çok yavaş, bazen hata".' },
            symptom: 'Pool üyeleri 10 saniyede bir yeşil-kırmızı oluyor; bir kez hepsi aynı anda düşüp VS kırmızıya döndü. Sunucular ayakta, uygulama "bazen yavaş".',
            story: 'Gece nöbetindesiniz. <code>vs_web</code> üç sunuculu <code>web_pool</code>\'a dağıtıyor; monitör <code>mon_web</code>. Uygulama ekibi geçen hafta monitörü "daha hızlı fark etsin" diye değiştirmiş.',
            team: [
                { who: 'NOC', role: 'İzleme', at: '02:11', text: 'vs_web alarmı açıldı-kapandı. Üyeler flap ediyor, 01070638 / 01070727 satırları art arda.' },
                { who: 'Deniz', role: 'Uygulama ekibi (uykulu)', at: '02:13', text: 'Gece 02:00\'de veritabanı yedeği başlıyor, ana sayfa yavaşlar ama açılır. Geçen hafta monitörü sıklaştırdık, 5 sn / 6 sn yaptık.' },
                { who: 'Vardiya müdürü', role: 'Operasyon', at: '02:14', text: 'Sunucuları yeniden başlatsak geçer mi? Sabah kampanya var, çözüm kalıcı olsun.' },
            ],
            lab: { hostname: 'bigip-a.lab.example', up: UP, sim: NT_SIM, start: NT_START, startMode: 'bash' },
            diag: [
                { id: 'log', icon: 'fa-file-alt', label: '/var/log/ltm son kayıtlar', min: 2, useful: true, issues: ['flap'], cmds: ['grep -c 01070638 /var/log/ltm', 'tail -n 8 /var/log/ltm'] },
                { id: 'members', icon: 'fa-list', label: 'Üye durumu ve nedeni', min: 2, useful: true, issues: ['flap'], cmds: ['tmsh show ltm pool web_pool members'] },
                { id: 'mon', icon: 'fa-heartbeat', label: 'Monitor yapılandırması', min: 2, useful: true, issues: ['flap', 'send'], cmds: ['tmsh list ltm monitor http mon_web'] },
                { id: 'time', icon: 'fa-stopwatch', label: 'Sunucu yanıt süresi: ana sayfa ve /health', min: 3, useful: true, issues: ['send', 'slow'], cmds: ['curl -s -o /dev/null -w "%{http_code} %{time_total}\\n" http://10.64.30.50/', 'curl -s -o /dev/null -w "%{http_code} %{time_total}\\n" http://10.64.30.50/health'] },
                { id: 'vip', icon: 'fa-globe', label: 'VIP\'i dışarıdan dene', min: 2, useful: true, issues: ['slow'], cmds: ['curl -s -o /dev/null -w "%{http_code} %{time_total}\\n" http://203.0.113.100/'] },
                { id: 'ping', icon: 'fa-satellite-dish', label: 'Sunuculara ping', min: 2, useful: false, note: 'Ping ağın sağlam olduğunu gösterir; monitör HTTP yanıtını beklediği için flap nedenini söylemez.', cmds: ['ping -c 2 10.64.30.50'] },
                { id: 'iface', icon: 'fa-ethernet', label: 'Arayüz ve bağlantı durumu', min: 2, useful: false, note: 'Arayüzler up; L1/L2 sorunu yok.', cmds: ['tmsh show net interface'] },
                { id: 'ha', icon: 'fa-random', label: 'HA durumu', min: 1, useful: false, note: 'Cihaz tek (standalone); failover yok.', cmds: ['tmsh show cm failover-status'] },
            ],
            issues: [
                { id: 'flap', title: 'Sorun 1 · Üyeler neden gidip geliyor?', q: 'Flap\'in BIG-IP tarafındaki nedeni?',
                  causes: [['ratio', 'timeout 6, interval 5: tek yavaş yanıt (6 sn\'den uzun) üyeyi düşürüyor; önerilen timeout 3 × interval + 1 = 16'], ['net', 'Sunucu ağı paket kaybediyor'], ['down', 'Sunucular gerçekten çöküp açılıyor']], cause: 'ratio',
                  why: 'Önerilen timeout, üç ardışık denemenin başarısız olmasına izin verir (varsayılan 5/16). 6 sn\'lik timeout tek bir yavaş yanıtı "kapalı" sayar; yanıt süresi 7–11 sn olan üyeler her yavaşlıkta düşer.',
                  fixes: [
                      { id: 't16', level: 'best', min: 3, label: 'timeout 16 (3 × 5 + 1)', cmds: ['tmsh modify ltm monitor http mon_web timeout 16'], note: 'Önerilen oran; gerçek bir arıza hâlâ 16 sn içinde fark edilir.' },
                      { id: 't120', level: 'bad', min: 3, label: 'timeout 120 (hiç düşmesin)', cmds: ['tmsh modify ltm monitor http mon_web timeout 120'], note: 'Flap durur ama gerçekten çöken üye 2 dakika trafik almaya devam eder.' },
                      { id: 'nomon', level: 'bad', min: 2, label: 'Monitörü pool\'dan kaldır', cmds: ['tmsh modify ltm pool web_pool monitor none'], note: 'Üyeler "unknown" olur; çöken sunucuya da trafik gider.' },
                      { id: 't10', level: 'bad', min: 3, label: 'timeout 10 (biraz artır)', cmds: ['tmsh modify ltm monitor http mon_web timeout 10'], note: 'Oran hâlâ önerinin (16) altında: 10 sn\'den yavaş tek yanıt üyeyi yine düşürür; yoğunluk artınca flap geri gelir.' },
                  ] },
                { id: 'send', title: 'Sorun 2 · Monitör neyi sınıyor?', q: 'send dizgesinin sorunu?',
                  causes: [['heavy', 'Ana sayfayı (/) istiyor: gece yedeğinde 7–11 sn süren ağır sayfa; hafif /health yerine'], ['host', 'Host başlığı eksik'], ['crlf', 'İstek boş satırla bitmiyor']], cause: 'heavy',
                  why: 'send dizgesi doğru biçimde (Host var, \\r\\n\\r\\n ile bitiyor) ama yanlış hedefi sınıyor. Sağlık yolu hafif olmalı ve uygulamanın gerçekten çalıştığını göstermeli.',
                  fixes: [
                      { id: 'health', level: 'best', min: 3, label: 'send: GET /health (Host ve boş satırla)', cmds: ['tmsh modify ltm monitor http mon_web send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n"'], note: '/health 0,4 sn: yoğunlukta bile timeout\'a yaklaşmaz.' },
                      { id: 'nohost', level: 'bad', min: 3, label: 'send: GET /health HTTP/1.1 (kısa yazım)', cmds: ['tmsh modify ltm monitor http mon_web send "GET /health HTTP/1.1\\r\\n\\r\\n"'], note: 'HTTP/1.1\'de Host zorunlu: sunucu 400 döner, tüm üyeler kırmızı olur.' },
                      { id: 'keep', level: 'bad', min: 0, label: 'Dokunma (send doğru yazılmış)', cmds: [], note: 'Biçim doğru ama ağır sayfayı sınamak yoğun saatte yine flap üretir.' },
                  ] },
                { id: 'slow', title: 'Sorun 3 · Sunucu yavaşlığı', q: 'Ana sayfanın 02:00\'den sonra yavaşlamasının nedeni?',
                  causes: [['batch', 'Gece veritabanı yedeği (uygulama tarafı)'], ['bigip', 'BIG-IP CPU\'su'], ['snat', 'SNAT port tükenmesi']], cause: 'batch',
                  why: 'Yavaşlık uygulama tarafında ve zamanı yedekle örtüşüyor; BIG-IP\'de çözülmez, sahibine kanıtla iletilir.',
                  fixes: [
                      { id: 'ticket', level: 'best', min: 2, label: 'Uygulama ekibine kanıtla kayıt aç (yanıt süreleri + log saatleri)', cmds: [], note: 'Kalıcı çözüm yedek zamanlaması/kaynağı; kanıt: curl time_total ve 02:01 ile başlayan log.' },
                      { id: 'reboot', level: 'bad', min: 10, label: 'Sunucuları sırayla yeniden başlat', cmds: [], note: 'Yedeği yarıda keser, açık oturumları koparır; yavaşlık yedek sürdükçe geri gelir.' },
                      { id: 'ignore', level: 'good', min: 0, label: 'Kayıt açma, sabah konuşulur', cmds: [], note: 'Monitör düzeldiği için kesinti durur ama yavaşlık kullanıcıya yansımaya devam eder.' },
                  ] },
            ],
            checks: [
                { id: 'stable', kind: 'fix', issue: 'flap', label: 'Üç üye de available', cmd: 'tmsh show ltm pool web_pool members', test: (r, s) => ['50', '51', '52'].every(k => s.memberStatus('web_pool', '10.64.30.' + k + ':80').avail === 'available') },
                { id: 'ratio', kind: 'fix', issue: 'flap', label: 'timeout ≥ 3 × interval + 1', cmd: 'tmsh list ltm monitor http mon_web', test: (r, s) => { const m = monOf(s); return m.timeout >= 3 * m.interval + 1; } },
                { id: 'path', kind: 'fix', issue: 'send', label: 'Monitör hafif sağlık yolunu sınıyor', cmd: 'tmsh list ltm monitor http mon_web', test: (r, s) => /^GET \/health HTTP\/1\.1\\r\\nHost: \S+\\r\\n.*\\r\\n\\r\\n$/.test(monOf(s).send || '') },
                { id: 'vip', kind: 'safe', label: 'Site dışarıdan 200', cmd: 'curl -s -o /dev/null -w "%{http_code}\\n" http://203.0.113.100/', test: r => !!r.curl && r.curl.code === 200 },
                { id: 'detect', kind: 'safe', label: 'Arıza tespiti ≤ 31 sn ve monitör bağlı', cmd: 'tmsh list ltm pool web_pool monitor', test: (r, s) => { const m = monOf(s); return (s.model.pools.web_pool.monitor || []).includes('mon_web') && m.timeout <= 31; } },
            ],
            learn: ['Flap = monitörün sağlıklı ama yavaş üyeyi "kapalı" sayması: timeout ≥ 3 × interval + 1.', 'send dizgesi hafif ve anlamlı bir sağlık yolunu sınamalı.', 'Uygulama kaynaklı yavaşlık BIG-IP\'de kapatılmaz; kanıtla sahibine iletilir.', 'Yeniden başlatma, kök neden bilinmeden yapılan yan etkili bir eylemdir.'],
            sources: ['K2167 / K13397 (HTTP monitor send dizgesi)', 'Monitor timeout önerisi: 3 × interval + 1 (varsayılan 5/16)', 'Lab f5-66 Monitor atölyesi', 'Lab f5-13 /var/log/ltm okuma'],
        },
    ];
})();
