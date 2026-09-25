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
];
