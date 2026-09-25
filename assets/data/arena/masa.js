'use strict';
// Trafik Masası görevleri (CgArena.js). Adresler yalnız belgeleme blokları; alan adları example.com.
// pools: { ad: [üye, …] } · down: kapalı üyeler · clients: istemci kartları · traffic: [istemci, yöntem, host, uri, { başlık }]
// expect(req) → { pool } | { code, loc? } | { reset: true }  (req: { method, host, uri, path, ip, ua })
window.CG_ARENA_MASA = [
    {
        id: 'ayrim', title: 'Trafik ayrımı: API, mobil ve yönetim', level: 1, topic: 'Pool seçimi ve erişim',
        brief: 'Tek bir virtual server (<code>vs_web</code>, 203.0.113.100:80) arkasında üç pool var. Varsayılan pool <code>web_pool</code>. Kuralı yaz, trafiği başlat: her istek beklenen yere gitmeli.',
        goals: [
            '<code>/api/</code> ile başlayan istekler → <code>api_pool</code>',
            'Diğer isteklerde User-Agent\'ta <code>Mobile</code> geçiyorsa → <code>mobile_pool</code>',
            '<code>/admin</code> ile başlayan yollar yalnız <code>10.240.0.0/16</code>\'dan; diğerlerine <code>403</code>',
            'Geri kalan her şey → <code>web_pool</code> (varsayılan)',
        ],
        vs: { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80', '10.64.30.51:80'], api_pool: ['10.64.30.53:8080'], mobile_pool: ['10.64.30.60:80'] },
        dg: { dg_yonetim: { type: 'ip', records: [['10.240.0.0/16', '']] } },
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'tel', ip: '198.51.100.31', label: 'Telefon', icon: 'fa-mobile-alt', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148' },
            { id: 'app', ip: '192.0.2.44', label: 'Uygulama', icon: 'fa-cogs', ua: 'curl/7.81.0' },
            { id: 'ops', ip: '10.240.3.4', label: 'Yönetici', icon: 'fa-user-shield', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1' },
        ],
        traffic: [
            ['pc', 'GET', 'www.example.com', '/'],
            ['tel', 'GET', 'www.example.com', '/kampanya'],
            ['app', 'POST', 'www.example.com', '/api/v1/siparis'],
            ['pc', 'GET', 'www.example.com', '/admin/panel'],
            ['ops', 'GET', 'www.example.com', '/admin/panel'],
            ['tel', 'GET', 'www.example.com', '/api/v1/sepet'],
            ['pc', 'GET', 'www.example.com', '/urunler?kat=3'],
            ['tel', 'GET', 'www.example.com', '/admin'],
            ['app', 'GET', 'www.example.com', '/apiler'],
            ['ops', 'GET', 'www.example.com', '/rapor'],
        ],
        expect: q => {
            if (q.path.startsWith('/admin') && !q.ip.startsWith('10.240.')) return { code: 403 };
            if (q.path.startsWith('/api/')) return { pool: 'api_pool' };
            if (q.path.startsWith('/admin')) return { pool: /Mobile/.test(q.ua) ? 'mobile_pool' : 'web_pool' };
            return { pool: /Mobile/.test(q.ua) ? 'mobile_pool' : 'web_pool' };
        },
        start: 'when HTTP_REQUEST {\n    # 1) /api/ ile başlayanlar → api_pool\n\n    # 2) User-Agent\'ta "Mobile" → mobile_pool\n\n    # 3) /admin yalnız dg_yonetim (10.240.0.0/16); diğerlerine 403\n\n}',
        hints: [
            'Yol için <code>[HTTP::path] starts_with "/api/"</code>, User-Agent için <code>[HTTP::header User-Agent] contains "Mobile"</code>, adres için <code>[class match [IP::client_addr] equals dg_yonetim]</code>.',
            'Sıra önemli: önce /admin engeli (yanıt verip <code>return</code>), sonra /api/, sonra mobil. <code>/apiler</code> bir API isteği değildir; eğik çizgiye dikkat.',
        ],
        solution: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/admin" and ![class match [IP::client_addr] equals dg_yonetim] } {\n        HTTP::respond 403 content "Erisim yok"\n        return\n    }\n    if { [HTTP::path] starts_with "/api/" } {\n        pool api_pool\n    } elseif { [HTTP::header User-Agent] contains "Mobile" } {\n        pool mobile_pool\n    }\n}',
        learn: ['Karar sırası = öncelik: engeller önce, yanıttan sonra <code>return</code>.', 'Hiçbir dala uymayan istek VS\'nin varsayılan pool\'una gider; ayrıca <code>pool web_pool</code> yazmak gerekmez.', '<code>starts_with "/api/"</code> ile <code>"/api"</code> farklıdır: <code>/apiler</code> tuzağı.'],
    },
    {
        id: 'tasinma', title: 'Taşınma günü: HTTPS ve eski alan adı', level: 1, topic: 'Yönlendirme sırası, 301 ve sorgu dizesi',
        brief: 'Site HTTPS\'e taşınıyor ve <code>eski.example.com</code> kapanıyor. <code>vs_web</code> 80. portta HTTP dinliyor. Sertifika yenileme (ACME HTTP-01) doğrulaması ise hâlâ düz HTTP ile gelmek zorunda.',
        goals: [
            '<code>/.well-known/acme-challenge/</code> ile başlayan yollar <b>yönlendirilmez</b> → <code>web_pool</code>',
            '<code>eski.example.com</code> → <code>301</code> <code>https://www.example.com</code> + aynı URI',
            'Diğer her istek → <code>301</code> <code>https://</code> + aynı host + aynı URI',
            'Sorgu dizesi (<code>?…</code>) yönlendirmede kaybolmamalı',
        ],
        vs: { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80', '10.64.30.51:80'] },
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'tel', ip: '198.51.100.31', label: 'Telefon', icon: 'fa-mobile-alt', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148' },
            { id: 'acme', ip: '192.0.2.10', label: 'Sertifika doğrulayıcı', icon: 'fa-certificate', ua: 'Mozilla/5.0 (compatible; ACME validation)' },
        ],
        traffic: [
            ['pc', 'GET', 'www.example.com', '/'],
            ['pc', 'GET', 'www.example.com', '/sepet?id=7'],
            ['acme', 'GET', 'www.example.com', '/.well-known/acme-challenge/Xy12'],
            ['tel', 'GET', 'eski.example.com', '/kampanya?kod=YAZ'],
            ['acme', 'GET', 'eski.example.com', '/.well-known/acme-challenge/Qa9'],
            ['pc', 'GET', 'blog.example.com', '/yazi/5'],
            ['tel', 'GET', 'eski.example.com', '/'],
        ],
        expect: q => {
            if (q.path.startsWith('/.well-known/acme-challenge/')) return { pool: 'web_pool' };
            if (q.host === 'eski.example.com') return { code: 301, loc: 'https://www.example.com' + q.uri };
            return { code: 301, loc: 'https://' + q.host + q.uri };
        },
        start: 'when HTTP_REQUEST {\n    HTTP::redirect "https://[HTTP::host][HTTP::path]"\n}',
        hints: [
            '<code>HTTP::redirect</code> her zaman 302 döner; kalıcı için <code>HTTP::respond 301 Location "…"</code>. <code>[HTTP::path]</code> sorgu dizesini içermez, <code>[HTTP::uri]</code> içerir.',
            'Önce ACME istisnası: eşleşirse <code>return</code> (VS varsayılan pool\'una gider). Sonra <code>[HTTP::host] eq "eski.example.com"</code> kontrolü, en son genel yönlendirme.',
        ],
        solution: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/.well-known/acme-challenge/" } {\n        return\n    }\n    if { [HTTP::host] eq "eski.example.com" } {\n        HTTP::respond 301 Location "https://www.example.com[HTTP::uri]"\n    } else {\n        HTTP::respond 301 Location "https://[HTTP::host][HTTP::uri]"\n    }\n}',
        learn: ['İstisnalar önce: ACME doğrulaması yönlendirilirse sertifika yenilenmez.', '<code>HTTP::redirect</code> = 302 (geçici); taşınma için <code>HTTP::respond 301 Location</code>.', '<code>HTTP::uri</code> sorgu dizesini taşır; <code>HTTP::path</code> taşımaz.'],
    },
    {
        id: 'kalkan', title: 'Kalkan ve maske: güvenlik başlıkları', level: 2, topic: 'Yanıt başlıkları, sızıntı, sahte XFF',
        brief: 'Güvenlik taraması üç bulgu verdi: HSTS ve nosniff yok, sunucular sürümlerini (<code>Server</code>, <code>X-Powered-By</code>) sızdırıyor, uygulama logundaki istemci adresleri sahte olabiliyor. <code>vs_web_ssl</code> 443\'te HTTPS sonlandırıyor (client-ssl bağlı).',
        goals: [
            'Her yanıtta <b>tek</b> <code>Strict-Transport-Security: max-age=31536000</code> ve <code>X-Content-Type-Options: nosniff</code>',
            'Yanıtlardan <code>Server</code> ve <code>X-Powered-By</code> kaldırılsın',
            'Sunucuya giden <code>X-Forwarded-For</code> <b>tek</b> olsun ve gerçek istemci adresini taşısın (istemcinin gönderdiği silinsin)',
        ],
        vs: { name: 'vs_web_ssl', ip: '203.0.113.100', port: 443, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80', '10.64.30.51:80'] },
        server: (req) => {
            if (req.path.startsWith('/api/')) return { status: 200, headers: [['Content-Type', 'application/json'], ['Server', 'nginx/1.24.0']] };
            const H = [['Content-Type', 'text/html; charset=utf-8'], ['Server', 'Apache/2.4.58 (Ubuntu)'], ['X-Powered-By', 'PHP/8.2.12']];
            if (req.path === '/giris') H.push(['Strict-Transport-Security', 'max-age=300']);
            return { status: 200, headers: H };
        },
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'tel', ip: '198.51.100.31', label: 'Telefon', icon: 'fa-mobile-alt', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148' },
            { id: 'saldiri', ip: '198.51.100.66', label: 'Saldırgan', icon: 'fa-user-secret', ua: 'python-requests/2.31' },
            { id: 'app', ip: '192.0.2.44', label: 'Uygulama', icon: 'fa-cogs', ua: 'curl/7.81.0' },
        ],
        traffic: [
            ['pc', 'GET', 'www.example.com', '/'],
            ['tel', 'GET', 'www.example.com', '/giris'],
            ['saldiri', 'GET', 'www.example.com', '/yonetim', { 'X-Forwarded-For': '10.240.0.1' }],
            ['app', 'GET', 'www.example.com', '/api/durum'],
            ['pc', 'GET', 'www.example.com', '/urun?id=3'],
        ],
        expect: q => ({ pool: 'web_pool', sent: { 'X-Forwarded-For': q.ip }, hdr: { 'Strict-Transport-Security': 'max-age=31536000', 'X-Content-Type-Options': 'nosniff', Server: null, 'X-Powered-By': null } }),
        start: 'when HTTP_REQUEST {\n    HTTP::header insert X-Forwarded-For [IP::client_addr]\n    HTTP::header insert Strict-Transport-Security "max-age=31536000"\n}',
        hints: [
            'İstekte eklenen başlık <b>sunucuya</b>, yanıtta eklenen <b>tarayıcıya</b> gider: yanıt başlıkları <code>when HTTP_RESPONSE</code> içinde. <code>insert</code> var olanın yanına ikinci bir başlık ekler; <code>replace</code> tek değere indirir.',
            '<code>HTTP::header replace X-Forwarded-For [IP::client_addr]</code> (istekte); yanıtta iki <code>replace</code> ve iki <code>HTTP::header remove</code>.',
        ],
        solution: 'when HTTP_REQUEST {\n    HTTP::header replace X-Forwarded-For [IP::client_addr]\n}\nwhen HTTP_RESPONSE {\n    HTTP::header replace Strict-Transport-Security "max-age=31536000"\n    HTTP::header replace X-Content-Type-Options "nosniff"\n    HTTP::header remove Server\n    HTTP::header remove X-Powered-By\n}',
        learn: ['Yön önemli: HTTP_REQUEST başlıkları sunucuya, HTTP_RESPONSE başlıkları tarayıcıya.', '<code>insert</code> çoğaltır (<code>/giris</code>\'te iki HSTS, saldırganın sahte XFF\'i kalır); <code>replace</code> tekler.', 'Sürüm başlıklarını silmek saldırganın keşfini zorlaştırır.'],
    },
    {
        id: 'bakim', title: 'Bakım gecesi: pool boşaldığında', level: 2, topic: 'LB_FAILED, özel 503 ve Retry-After',
        brief: 'Gece bakımında <code>web_pool</code>\'un iki üyesi de kapatıldı (monitor: down). API ayakta, yönetici ağı yeni sürümü <code>bakim_pool</code>\'daki önizleme sunucusunda test ediyor. Kullanıcılar bağlantı hatası değil, düzgün bir bakım sayfası görmeli.',
        goals: [
            '<code>/api/</code> ile başlayanlar → <code>api_pool</code> (herkes için)',
            'Yönetici ağı (<code>dg_yonetim</code>, 10.240.0.0/16) → <code>bakim_pool</code>',
            '<code>web_pool</code>\'da üye kalmadığında: <code>503</code> + <code>Retry-After: 600</code> ile bakım sayfası; bağlantı sıfırlanmasın',
        ],
        vs: { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80', '10.64.30.51:80'], api_pool: ['10.64.30.53:8080'], bakim_pool: ['10.64.30.90:80'] },
        down: ['10.64.30.50:80', '10.64.30.51:80'],
        dg: { dg_yonetim: { type: 'ip', records: [['10.240.0.0/16', '']] } },
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'tel', ip: '198.51.100.31', label: 'Telefon', icon: 'fa-mobile-alt', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148' },
            { id: 'app', ip: '192.0.2.44', label: 'Uygulama', icon: 'fa-cogs', ua: 'curl/7.81.0' },
            { id: 'ops', ip: '10.240.3.4', label: 'Yönetici', icon: 'fa-user-shield', ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) Safari/605.1' },
        ],
        traffic: [
            ['pc', 'GET', 'www.example.com', '/'],
            ['app', 'GET', 'www.example.com', '/api/v1/durum'],
            ['ops', 'GET', 'www.example.com', '/'],
            ['tel', 'GET', 'www.example.com', '/kampanya'],
            ['ops', 'GET', 'www.example.com', '/api/v1/durum'],
            ['pc', 'GET', 'www.example.com', '/iletisim'],
        ],
        expect: q => q.path.startsWith('/api/') ? { pool: 'api_pool' } : q.ip.startsWith('10.240.') ? { pool: 'bakim_pool' } : { code: 503, hdr: { 'Retry-After': '600' } },
        start: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/api/" } {\n        pool api_pool\n    }\n}',
        hints: [
            'Seçilen pool\'da üye yoksa <code>LB_SELECTED</code> yerine <code>LB_FAILED</code> tetiklenir; orada <code>HTTP::respond 503 content "…" Retry-After 600</code> ile yanıt verebilirsin.',
            'Yönetici kontrolü: <code>elseif { [class match [IP::client_addr] equals dg_yonetim] } { pool bakim_pool }</code>. /api/ kontrolü önce gelmeli.',
        ],
        solution: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/api/" } {\n        pool api_pool\n    } elseif { [class match [IP::client_addr] equals dg_yonetim] } {\n        pool bakim_pool\n    }\n}\nwhen LB_FAILED {\n    HTTP::respond 503 content "<h1>Bakimdayiz</h1>" Retry-After 600\n}',
        learn: ['Üye kalmayınca <code>LB_FAILED</code> tetiklenir; kural yoksa istemci bağlantı sıfırlaması görür.', '<code>Retry-After</code> tarayıcıya ve arama motorlarına kesintinin geçici olduğunu söyler.', 'Alternatif: HTTP_REQUEST\'te <code>[active_members web_pool] == 0</code> kontrolü; LB_FAILED her pool için tek yerden yakalar.'],
    },
    {
        id: 'tablo', title: 'Yönlendirme tablosu: data group ile pool', level: 3, topic: 'class match -value, küçük harf, önek tuzağı',
        brief: 'Dil siteleri ayrı pool\'larda. Yeni dil eklendikçe kuralı değiştirmek istemiyoruz: yol öneki → pool eşlemesi <code>dg_yollar</code> data group\'unda (<code>/tr/ := tr_pool</code>, <code>/en/ := en_pool</code>, <code>/de/ := de_pool</code>).',
        goals: [
            'Yol <code>dg_yollar</code>\'daki bir önekle başlıyorsa, kaydın <b>değerindeki</b> pool\'a git',
            'Büyük harfli yollar da eşleşsin (<code>/TR/kampanya</code> → tr_pool)',
            'Eşleşmeyen her şey → <code>web_pool</code>',
            'Kodda dil pool adları (<code>tr_pool</code> …) <b>yazılmasın</b>: tablo tek kaynak',
        ],
        vs: { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80'], tr_pool: ['10.64.31.10:80'], en_pool: ['10.64.31.20:80'], de_pool: ['10.64.31.30:80'] },
        dg: { dg_yollar: { type: 'string', records: [['/tr/', 'tr_pool'], ['/en/', 'en_pool'], ['/de/', 'de_pool']] } },
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'tel', ip: '198.51.100.31', label: 'Telefon', icon: 'fa-mobile-alt', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5) Mobile/15E148' },
            { id: 'de', ip: '203.0.113.77', label: 'Yurt dışı', icon: 'fa-globe-europe', ua: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0' },
        ],
        traffic: [
            ['pc', 'GET', 'www.example.com', '/tr/urun/5'],
            ['de', 'GET', 'www.example.com', '/de/hilfe'],
            ['tel', 'GET', 'www.example.com', '/trabzon-gezi'],
            ['de', 'GET', 'www.example.com', '/en/'],
            ['tel', 'GET', 'www.example.com', '/TR/kampanya'],
            ['de', 'GET', 'www.example.com', '/fr/accueil'],
            ['pc', 'GET', 'www.example.com', '/en'],
        ],
        expect: q => { const p = q.path.toLowerCase(), m = [['/tr/', 'tr_pool'], ['/en/', 'en_pool'], ['/de/', 'de_pool']].find(r => p.startsWith(r[0])); return { pool: m ? m[1] : 'web_pool' }; },
        lint: code => (/\b(tr|en|de)_pool\b/.test(code) ? 'Kodda dil pool adı var; eşleme yalnız <code>dg_yollar</code>\'dan gelmeli (yeni dil = yalnız tabloya kayıt).' : null),
        start: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/tr" } {\n        pool tr_pool\n    }\n}',
        hints: [
            '<code>class match -value &lt;öğe&gt; starts_with dg_yollar</code> eşleşen kaydın değerini (pool adını) döndürür; eşleşme yoksa boş metin.',
            '<code>set p [class match -value [string tolower [HTTP::path]] starts_with dg_yollar]</code> → <code>if { $p ne "" } { pool $p }</code>',
        ],
        solution: 'when HTTP_REQUEST {\n    set p [class match -value [string tolower [HTTP::path]] starts_with dg_yollar]\n    if { $p ne "" } {\n        pool $p\n    }\n}',
        learn: ['<code>-value</code> ile data group bir yönlendirme tablosuna dönüşür: yeni dil = kural değişmeden tabloya bir satır.', 'Önek kayıtlarının sonundaki <code>/</code> <code>/trabzon</code> gibi yanlış eşleşmeleri önler.', '<code>string tolower</code> ile karşılaştırmadan önce normalleştir.'],
    },
    {
        id: 'cerrah', title: 'Yol cerrahı: sunucuya giden URI', level: 3, topic: 'HTTP::uri yeniden yazma, string range',
        brief: 'Dışarıya tek adres (<code>www.example.com</code>) gösteriyoruz ama arkada farklı uygulamalar var. API sunucusu <code>/api</code> önekini bilmiyor; statik dosya sunucusu dosyaları <code>/assets/</code> altında tutuyor. Yanlış yola giden istek 404 alır.',
        goals: [
            '<code>/api/…</code> → <code>api_pool</code>, sunucuya önek atılarak: <code>/api/v1/kisi?id=4</code> → <code>/v1/kisi?id=4</code>',
            '<code>/statik/…</code> → <code>static_pool</code>, sunucuya <code>/assets/…</code> olarak: <code>/statik/css/a.css</code> → <code>/assets/css/a.css</code>',
            'Diğerleri değişmeden <code>web_pool</code>; sorgu dizesi hiçbir durumda kaybolmasın',
        ],
        vs: { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' },
        pools: { web_pool: ['10.64.30.50:80'], api_pool: ['10.64.30.53:8080'], static_pool: ['10.64.30.70:80'] },
        server: (req, member, pool) => ({ status: (pool === 'api_pool' && req.path.startsWith('/api')) || (pool === 'static_pool' && !req.path.startsWith('/assets/')) ? 404 : 200 }),
        clients: [
            { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0' },
            { id: 'app', ip: '192.0.2.44', label: 'Uygulama', icon: 'fa-cogs', ua: 'curl/7.81.0' },
        ],
        traffic: [
            ['app', 'GET', 'www.example.com', '/api/v1/kisi?id=4'],
            ['pc', 'GET', 'www.example.com', '/statik/css/site.css?v=9'],
            ['pc', 'GET', 'www.example.com', '/hakkinda'],
            ['app', 'POST', 'www.example.com', '/api/v2/sepet'],
            ['pc', 'GET', 'www.example.com', '/statik/img/logo.png'],
            ['app', 'GET', 'www.example.com', '/apiler?s=2'],
        ],
        expect: q => {
            if (q.path.startsWith('/api/')) return { pool: 'api_pool', code: 200, uri: q.uri.slice(4) };
            if (q.path.startsWith('/statik/')) return { pool: 'static_pool', code: 200, uri: '/assets' + q.uri.slice(7) };
            return { pool: 'web_pool', code: 200, uri: q.uri };
        },
        start: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/api/" } {\n        pool api_pool\n    }\n}',
        hints: [
            '<code>HTTP::uri &lt;yeni&gt;</code> sunucuya giden yolu değiştirir (tarayıcı fark etmez). <code>[string range [HTTP::uri] 4 end]</code> ilk 4 karakteri ("/api") atar ve sorgu dizesini korur.',
            '"/statik" 7 karakter: <code>HTTP::uri "/assets[string range [HTTP::uri] 7 end]"</code>',
        ],
        solution: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/api/" } {\n        HTTP::uri [string range [HTTP::uri] 4 end]\n        pool api_pool\n    } elseif { [HTTP::path] starts_with "/statik/" } {\n        HTTP::uri "/assets[string range [HTTP::uri] 7 end]"\n        pool static_pool\n    }\n}',
        learn: ['URI yeniden yazma istemciye görünmez; yönlendirmeden (3xx) farkı budur.', '<code>HTTP::uri</code> sorgu dizesini de taşır; <code>HTTP::path</code> ile yazmak sorguyu korur ama okumada sorguyu vermez.', 'Sayısal kesme (<code>string range</code>) önekin uzunluğuna bağlıdır: önek değişirse sayı da değişmeli.'],
    },
];
