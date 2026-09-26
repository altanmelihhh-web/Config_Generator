'use strict';
// iRule Arenası · WAF Masası: ASM eğitim motoru (assets/js/lab/asm.js) ile politika ayarı ve istek logu dedektifliği.
// İmzalar kurgusaldır (E-xxxx eğitim imzaları). İhlal adları F5 ASM::ViolationName adlarıdır. Adresler belgeleme blokları.
// trafik: { c: istemci, m: metot, u: uri, b?: form gövdesi, h?: { başlık }, block: beklenen, why }
(function () {
    const CL = {
        pc: { ip: '198.51.100.20', label: 'Masaüstü', icon: 'fa-desktop', ua: 'Mozilla/5.0 (Windows NT 10.0) Chrome/128.0' },
        tel: { ip: '198.51.100.31', label: 'Mobil uygulama', icon: 'fa-mobile-alt', ua: 'MagazaApp/4.2 (iOS 17)' },
        sal: { ip: '203.0.113.66', label: 'Saldırgan', icon: 'fa-user-secret', ua: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0' },
        bot: { ip: '203.0.113.77', label: 'Tarama aracı', icon: 'fa-robot', ua: 'sqlmap/1.7.2#stable (https://sqlmap.org)' },
    };
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_ARENA_WAF = [
        {
            id: 'politika', mode: 'policy', title: 'Policy Masası: sıfır yanlış pozitif, sıfır kaçak', level: 2, topic: 'Blocking, izinli metot ve dosya türleri, parametre bazlı meta karakter',
            brief: 'Mağaza sitesine yeni WAF politikası (<code>waf_magaza</code>) Rapid Deployment ile açıldı: <b>transparent</b> modda, yani hiçbir şeyi engellemiyor. Mobil uygulama sepeti PUT ile güncelliyor; yorum alanında kullanıcılar kesme işareti ve kalın yazı (<code>&lt;b&gt;</code>) kullanıyor. Politikayı ayarlayın: meşru istekler geçsin, saldırılar engellensin.',
            goals: ['Meşru 6 istek geçmeli (yanlış pozitif yok)', 'Saldırı 7 istek engellenmeli (kaçak yok)', 'İstisnalar dar olmalı: bir parametre için verilen izin başka parametreye yayılmamalı'],
            clients: CL,
            base: { name: 'waf_magaza', blocking: false, methods: ['GET', 'HEAD', 'POST'], filetypes: ['*'], params: { '*': { meta: false }, yorum: { meta: false }, q: { meta: false } } },
            traffic: [
                { c: 'pc', m: 'GET', u: '/', block: false, why: 'Ana sayfa' },
                { c: 'pc', m: 'GET', u: '/ara?q=kablosuz+kulaklik', block: false, why: 'Normal arama' },
                { c: 'pc', m: 'POST', u: '/yorum', b: 'urun=12&yorum=Fiyat%27lar+%3Cb%3Ecok%3C%2Fb%3E+iyi', block: false, why: 'Kesme işareti ve <b> içeren meşru yorum' },
                { c: 'tel', m: 'PUT', u: '/api/v1/sepet/5', block: false, why: 'Mobil uygulama sepet güncellemesi (PUT)' },
                { c: 'pc', m: 'GET', u: '/urun/42/resim.jpg', block: false, why: 'Ürün görseli' },
                { c: 'pc', m: 'GET', u: '/kampanya.html', block: false, why: 'Statik sayfa' },
                { c: 'sal', m: 'GET', u: '/ara?q=%27%20OR%201%3D1', block: true, why: 'SQL enjeksiyonu' },
                { c: 'sal', m: 'POST', u: '/yorum', b: 'urun=12&yorum=%3Cscript%3Ealert(1)%3C%2Fscript%3E', block: true, why: 'Yorum alanında XSS (meta izni olsa da imza yakalamalı)' },
                { c: 'sal', m: 'GET', u: '/yedek.bak', block: true, why: 'Yedek dosya indirme denemesi' },
                { c: 'bot', m: 'GET', u: '/', block: true, why: 'Otomatik tarama aracı' },
                { c: 'sal', m: 'TRACE', u: '/', block: true, why: 'TRACE metodu' },
                { c: 'sal', m: 'GET', u: '/ara?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E', block: true, why: 'Aramada XSS' },
                { c: 'sal', m: 'GET', u: '/ara?q=%22%3E%3Ciframe%20src%3D%2F%2F203.0.113.9%3E', block: true, why: 'iframe enjeksiyonu: imzası yok, yalnız meta karakter denetimi yakalar (izin yalnız yorum\'a verilmeli)' },
            ],
            hints: [
                'Önce <b>blocking</b>\'i açın; transparent modda hiçbir istek engellenmez. Sonra her yanlış pozitifin hangi ihlalden geldiğine bakın (satıra tıklayın).',
                'PUT\'u metotlara ekleyin; dosya türlerinde <code>*</code> yerine izin listesi yazın (<code>html, jpg, no_ext</code>…); meta karakter iznini yalnız <code>yorum</code> parametresine verin, imza denetimini kapatmayın.',
            ],
            solution: { blocking: true, methods: ['GET', 'HEAD', 'POST', 'PUT'], filetypes: ['html', 'jpg', 'png', 'css', 'js', 'no_ext'], params: { '*': { meta: false }, yorum: { meta: true }, q: { meta: false } } },
            learn: ['Transparent modda politika yalnız gözlemler; engelleme için blocking + ihlallerin Block bayrağı gerekir.', 'Dosya türü izin listesi (".bak" yok) sızıntı denemelerini keser; "*" her şeye izin verir.', 'İstisna en dar kapsamda: meta karakter izni yalnız o parametreye; imza denetimi açık kalır.'],
        },
        {
            id: 'dedektif', mode: 'log', title: 'Request Log Dedektifi: yanlış pozitif mi, saldırı mı?', level: 3, topic: 'İstek detayı okuma, dar istisna, tekrar oynatma',
            brief: 'Politika <code>waf_magaza</code> blocking modda ve son bir saatte 6 istek engelledi; destek ekibine şikâyet geldi. Her log kaydını açın, ihlalleri okuyun ve karar verin: <b>saldırıysa dokunmayın</b>, yanlış pozitifse <b>en dar</b> istisnayı seçin. Sonra "Uygula ve tekrar oynat": kararlarınız aynı trafiğe ve <b>görmediğiniz saldırı varyantlarına</b> karşı sınanır.',
            goals: ['Yanlış pozitifleri (meşru kullanıcı) serbest bırak', 'Saldırıları engelli bırak', 'Geniş istisna (imzayı tüm politikada kapatmak, transparent) gizli saldırıları geçirir: kaybettirir'],
            clients: CL,
            base: { name: 'waf_magaza', blocking: true, methods: ['GET', 'HEAD', 'POST'], filetypes: ['*'], params: { '*': { meta: false } } },
            traffic: [
                { c: 'pc', m: 'POST', u: '/yorum', b: 'urun=12&yorum=Fiyat%27lar+%3Cb%3Ecok%3C%2Fb%3E+iyi', block: false, why: 'Meşru yorum (kesme işareti + <b>)' },
                { c: 'sal', m: 'GET', u: '/ara?q=%27%20OR%201%3D1', block: true, why: 'SQL enjeksiyonu' },
                { c: 'tel', m: 'PUT', u: '/api/v1/sepet/5', block: false, why: 'Mobil uygulama PUT' },
                { c: 'pc', m: 'GET', u: '/uye?ad=O%27Neil', block: false, why: 'Soyadında kesme işareti' },
                { c: 'sal', m: 'GET', u: '/..%2f..%2fetc/passwd', block: true, why: 'Dizin geçişi' },
                { c: 'sal', m: 'POST', u: '/yorum', b: 'urun=12&yorum=%3Cscript%3Ealert(1)%3C%2Fscript%3E', block: true, why: 'XSS' },
            ],
            hidden: [
                { c: 'sal', m: 'POST', u: '/yorum', b: 'urun=7&yorum=Harika%3Cscript%3Ealert(2)%3C%2Fscript%3E', block: true, why: 'Yorumda yeni XSS: meta izni var, onu yalnız imza yakalar (imza tüm politikada kapatıldıysa geçer)' },
                { c: 'sal', m: 'GET', u: '/uye?ad=%27%20OR%20%27a%27%3D%27a', block: true, why: 'ad parametresinde SQLi (meta izni verilse bile imza yakalamalı)' },
                { c: 'sal', m: 'DELETE', u: '/api/v1/sepet/5', block: true, why: 'İzin verilmeyen metot (yalnız PUT eklenmeli)' },
                { c: 'pc', m: 'GET', u: '/uye?ad=D%27Angelo', block: false, why: 'Başka meşru soyadı' },
            ],
            actions: [
                ['none', 'Saldırı: dokunma (engel doğru)'],
                ['meta', 'Bu parametrede meta karaktere izin ver'],
                ['method', 'Bu metodu izinli metotlara ekle'],
                ['sigall', 'İhlale yol açan imzayı TÜM politikada kapat'],
                ['transparent', 'Politikayı transparent moda al'],
            ],
            answer: ['meta', 'none', 'method', 'meta', 'none', 'none'],
            hints: [
                'Her kaydın "ihlaller" satırına bakın: yalnız "Illegal meta character" varsa ve istek gerçek bir kullanıcının doğal girdisiyse yanlış pozitiftir. "Attack signature detected" ile birlikte gelen tipik saldırı kalıpları (<code>\' OR 1=1</code>, <code>&lt;script&gt;</code>, <code>../</code>) saldırıdır.',
                'Yorum ve soyadı: meta izni (yalnız o parametre). Mobil PUT: metot ekle. Diğerleri: dokunma. "Tüm politikada imzayı kapat" ve "transparent" gizli varyantları geçirir.',
            ],
            learn: ['Karar ihlal türüne ve bağlama göre verilir: aynı karakter (kesme işareti) bir yerde meşru, başka yerde saldırıdır.', 'Meta karakter izni imza denetimini kapatmaz: ad=\' OR \'a\'=\'a yine imzaya takılır.', 'Geniş istisna bugünkü şikâyeti çözer, yarının saldırısını geçirir.'],
        },
    ];
    root.CG_ARENA_WAF_CLIENTS = CL;
})();
