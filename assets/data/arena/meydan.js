'use strict';
// iRule Arenası · Meydan Okuma: görünür + gizli testli kod görevleri (CgArena.js). Maliyet = çalışan iRule satırı + regex cezası.
// test: { req: [istemci, yöntem, host, uri, { başlık }], expect: {pool|code|deny, loc?, hdr?, allow?}, hidden?, tag? }
// Adresler yalnız belgeleme blokları; alan adları example.com. Kaynak: RFC 9110 (405 + Allow §15.5.6, 401 + WWW-Authenticate §15.5.2, 308 §15.4.9).
(function () {
    const CL = [
        { id: 'pc', ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0' },
        { id: 'app', ip: '192.0.2.44', label: 'Uygulama', icon: 'fa-cogs', ua: 'curl/7.81.0' },
        { id: 'ops', ip: '10.240.3.4', label: 'Yönetici', icon: 'fa-user-shield', ua: 'Mozilla/5.0 (Macintosh) Safari/605.1' },
    ];
    const VS = { name: 'vs_web', ip: '203.0.113.100', port: 80, pool: 'web_pool' };
    (typeof window !== 'undefined' ? window : globalThis).CG_ARENA_MO = [
        {
            id: 'beyaz', title: 'Metot beyaz listesi', level: 2, topic: '405 + Allow, büyük/küçük harf, önek tuzakları',
            story: 'API ve web sitesi aynı virtual server\'da. Her yol için izinli metotlar farklı; izin dışı metoda <b>405</b> dönülmeli ve RFC 9110 gereği <code>Allow</code> başlığı o yolda izinli metotları listelemeli.',
            reqs: [
                '<code>/api/</code> ile başlayan yollar: GET POST PUT DELETE → <code>api_pool</code>',
                'Diğer tüm yollar: GET HEAD POST → <code>web_pool</code> (VS varsayılanı)',
                'İzin dışı metot: <code>405</code> + <code>Allow</code> başlığında o yolun izinli metotları (virgülle)',
            ],
            vs: VS, clients: CL, pools: { web_pool: ['10.64.30.50:80', '10.64.30.51:80'], api_pool: ['10.64.30.53:8080'] },
            tests: [
                { req: ['pc', 'GET', 'www.example.com', '/'], expect: { pool: 'web_pool' } },
                { req: ['app', 'PUT', 'www.example.com', '/api/v1/kayit/5'], expect: { pool: 'api_pool' } },
                { req: ['pc', 'DELETE', 'www.example.com', '/profil'], expect: { code: 405, allow: ['GET', 'HEAD', 'POST'] } },
                { req: ['pc', 'TRACE', 'www.example.com', '/'], expect: { code: 405, allow: ['GET', 'HEAD', 'POST'] }, hidden: true, tag: 'riskli metot' },
                { req: ['app', 'PUT', 'www.example.com', '/API/v1/kayit/5'], expect: { code: 405, allow: ['GET', 'HEAD', 'POST'] }, hidden: true, tag: 'yol büyük/küçük harf' },
                { req: ['pc', 'GET', 'www.example.com', '/apix/tanitim'], expect: { pool: 'web_pool' }, hidden: true, tag: 'önek tuzağı (/api değil /api/)' },
                { req: ['app', 'OPTIONS', 'www.example.com', '/api/v1/'], expect: { code: 405, allow: ['GET', 'POST', 'PUT', 'DELETE'] }, hidden: true, tag: 'API\'de izinsiz metot' },
                { req: ['pc', 'get', 'www.example.com', '/'], expect: { code: 405, allow: ['GET', 'HEAD', 'POST'] }, hidden: true, tag: 'metot büyük/küçük harf' },
                { req: ['app', 'POST', 'www.example.com', '/api/'], expect: { pool: 'api_pool' }, hidden: true, tag: 'kök API yolu' },
                { req: ['app', 'PATCH', 'www.example.com', '/api/v1/kayit/5'], expect: { code: 405, allow: ['GET', 'POST', 'PUT', 'DELETE'] }, hidden: true, tag: 'listede olmayan metot' },
                { req: ['pc', 'HEAD', 'www.example.com', '/urunler?kat=2'], expect: { pool: 'web_pool' }, hidden: true, tag: 'HEAD + sorgu dizesi' },
            ],
            start: 'when HTTP_REQUEST {\n    \n}',
            hints: [
                'HTTP metotları büyük/küçük harfe duyarlıdır: "get" GET değildir. Yol karşılaştırmasında da <code>/API/</code> ≠ <code>/api/</code>. Önek <code>/api/</code> (eğik çizgiyle) olmalı.',
                'Yola göre izinli listeyi bir değişkene koyup <code>lsearch -exact</code> ya da <code>in</code> ile arayın; 405 yanıtında <code>Allow [join $izin ", "]</code>.',
            ],
            solution: 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "/api/" } {\n        set izin {GET POST PUT DELETE}\n        set p api_pool\n    } else {\n        set izin {GET HEAD POST}\n        set p ""\n    }\n    if { !([HTTP::method] in $izin) } {\n        HTTP::respond 405 content "Method Not Allowed" Allow [join $izin ", "]\n        return\n    }\n    if { $p ne "" } { pool $p }\n}',
            cost: [0, 80, 61],
        },
        {
            id: 'kodlar', title: 'Doğru durum kodu', level: 3, topic: '503/Retry-After, 301 vs 308, 401 vs 403',
            story: 'Aynı virtual server\'da dört durum var: bakımdaki bölüm, taşınan ürün sayfaları, korumalı yönetim paneli ve normal site. Her biri için <b>doğru</b> durum kodunu ve gerekli başlığı üretin. Gizli testler kodların inceliklerini yoklar.',
            reqs: [
                '<code>/bakim/</code> altı: <code>503</code> + <code>Retry-After: 120</code>',
                '<code>/eski-urun/&lt;n&gt;</code> → <code>/urun/&lt;n&gt;</code> kalıcı taşındı: GET/HEAD için <code>301</code>, metodu korunması gereken POST için <code>308</code>; sorgu dizesi korunur',
                '<code>/yonetim</code> ile başlayan yollar: <code>Authorization</code> başlığı yoksa <code>401</code> + <code>WWW-Authenticate: Basic realm="yonetim"</code>; varsa ama istemci 10.240.0.0/16 dışındaysa <code>403</code>; iç ağdan ve başlıklıysa <code>admin_pool</code>',
                'Geri kalan her şey → <code>web_pool</code>',
            ],
            vs: VS, clients: CL, pools: { web_pool: ['10.64.30.50:80'], admin_pool: ['10.64.30.90:80'] },
            tests: [
                { req: ['pc', 'GET', 'www.example.com', '/bakim/rapor'], expect: { code: 503, hdr: { 'Retry-After': '120' } } },
                { req: ['pc', 'GET', 'www.example.com', '/eski-urun/5'], expect: { code: 301, loc: '/urun/5' } },
                { req: ['pc', 'GET', 'www.example.com', '/yonetim'], expect: { code: 401, hdr: { 'WWW-Authenticate': 'Basic realm="yonetim"' } } },
                { req: ['app', 'POST', 'www.example.com', '/eski-urun/5'], expect: { code: 308, loc: '/urun/5' }, hidden: true, tag: 'POST: metot korunmalı (308)' },
                { req: ['pc', 'HEAD', 'www.example.com', '/eski-urun/9?renk=mavi'], expect: { code: 301, loc: '/urun/9?renk=mavi' }, hidden: true, tag: 'sorgu dizesi korunmalı' },
                { req: ['pc', 'GET', 'www.example.com', '/yonetim/panel', { Authorization: 'Basic eW9uOmRlbmVtZQ==' }], expect: { code: 403 }, hidden: true, tag: 'kimlik var, yetki yok (dış ağ)' },
                { req: ['ops', 'GET', 'www.example.com', '/yonetim/panel', { Authorization: 'Basic eW9uOmRlbmVtZQ==' }], expect: { pool: 'admin_pool' }, hidden: true, tag: 'iç ağ + kimlik' },
                { req: ['ops', 'GET', 'www.example.com', '/yonetim'], expect: { code: 401, hdr: { 'WWW-Authenticate': 'Basic realm="yonetim"' } }, hidden: true, tag: 'iç ağ ama kimlik yok' },
                { req: ['pc', 'GET', 'www.example.com', '/bakimda-neler-var'], expect: { pool: 'web_pool' }, hidden: true, tag: 'önek tuzağı (/bakim/)' },
                { req: ['pc', 'GET', 'www.example.com', '/eski-urunler'], expect: { pool: 'web_pool' }, hidden: true, tag: 'önek tuzağı (/eski-urun/)' },
            ],
            start: 'when HTTP_REQUEST {\n    \n}',
            hints: [
                '301 ile gelen POST\'u tarayıcılar GET\'e çevirebilir; metodu korumak için 308 kullanılır. <code>[HTTP::uri]</code> sorgu dizesini taşır. 401 "kimsin?" (kimlik yok), 403 "biliyorum ama izin yok" demektir.',
                '<code>string range [HTTP::uri] 10 end</code> "/eski-urun" (10 karakter) önekini atar. Başlık kontrolü: <code>[HTTP::header exists Authorization]</code>; adres: <code>[IP::addr [IP::client_addr] equals 10.240.0.0/16]</code>.',
            ],
            solution: 'when HTTP_REQUEST {\n    set u [HTTP::uri]\n    if { [HTTP::path] starts_with "/bakim/" } {\n        HTTP::respond 503 content "Bakim" Retry-After 120\n    } elseif { [HTTP::path] starts_with "/eski-urun/" } {\n        set yeni "/urun[string range $u 10 end]"\n        if { [HTTP::method] eq "POST" } { HTTP::respond 308 Location $yeni } else { HTTP::respond 301 Location $yeni }\n    } elseif { [HTTP::path] starts_with "/yonetim" } {\n        if { ![HTTP::header exists Authorization] } {\n            HTTP::respond 401 content "Kimlik gerekli" WWW-Authenticate {Basic realm="yonetim"}\n        } elseif { ![IP::addr [IP::client_addr] equals 10.240.0.0/16] } {\n            HTTP::respond 403 content "Yasak"\n        } else {\n            pool admin_pool\n        }\n    }\n}',
            cost: [0, 68, 52],
        },
    ];
})();
