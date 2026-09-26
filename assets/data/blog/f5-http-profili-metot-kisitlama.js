// Blog: F5 BIG-IP HTTP profili ile metot kısıtlama (known-methods, unknown-method). Adresler RFC 5737.
(window.CG_BLOG = window.CG_BLOG || []).push({
    slug: 'f5-http-profili-metot-kisitlama',
    title: 'F5 BIG-IP: HTTP profili ile metot kısıtlama — known-methods ve unknown-method',
    date: '2026-09-26',
    summary: 'Güvenlik taraması "TRACE açık" dediğinde sunucuya dokunmadan BIG-IP\'de nasıl kapatılır? HTTP profilinin enforcement bölümü, türetilmiş profil, en dar değişiklik ve curl ile doğrulama.',
    tags: ['F5', 'BIG-IP', 'LTM', 'HTTP profili', 'TRACE', 'Sıkılaştırma'],
    vendor: 'f5',
    readMin: 6,
    body: [
        { h: 'Senaryo' },
        { p: `Sızma testi raporunda iki bulgu var: "HTTP TRACE açık" ve "WebDAV metotları (PROPFIND) yanıt alıyor". Uygulama yalnız GET, HEAD ve POST kullanıyor. Sunucu TRACE'e zaten 405 dönüyor olsa bile tarayıcı haklıdır: istek BIG-IP'den geçip arka uca kadar ulaşıyor. Metot politikasını ön kapıda, yani BIG-IP'de uygulamak hem tüm uygulamaları tek yerden korur hem de sunucuya gereksiz istek gitmesini önler.` },
        { h: 'HTTP profilinin enforcement bölümü' },
        { p: `HTTP profilinde metot davranışını iki ayar belirler:` },
        { list: [
            `<code>known-methods</code>: BIG-IP'nin tanıdığı metotlar. Varsayılan liste CONNECT, DELETE, GET, HEAD, LOCK, OPTIONS, POST, PROPFIND, PUT, TRACE, UNLOCK.`,
            `<code>unknown-method</code>: listede olmayan bir metot geldiğinde ne yapılacağı; <code>allow</code>, <code>reject</code> ya da <code>pass-through</code>. Varsayılanı <b>allow</b>.`,
        ] },
        { p: `Önemli nokta: bir metodu listeden çıkarmak onu engellemez, yalnızca "bilinmeyen" sınıfına taşır. Bilinmeyen metoda hangi davranışın uygulanacağını <code>unknown-method</code> belirler. Varsayılan <code>allow</code> kaldığı sürece listeden çıkarılan TRACE yine geçer. Engellemek için <code>unknown-method reject</code> gerekir: listede olmayan metodu BIG-IP reddeder. F5 belgeleri ayrıca HEAD ya da CONNECT gibi standart bir metodu listeden çıkarmanın, o metodu algılamaya dayanan BIG-IP işlevlerini bozabileceği konusunda uyarır.` },
        { note: 'Varsayılan "http" profilini doğrudan değiştirmeyin: onu kullanan tüm virtual server\'lar etkilenir. Değişiklik defaults-from ile türetilmiş özel bir profilde yapılır ve yalnız ilgili VS\'ye bağlanır.' },
        { h: 'İki yaklaşım: beyaz liste ya da en dar değişiklik' },
        { p: `<b>Beyaz liste:</b> Uygulamanın kullandığı metotlar biliniyorsa listeyi tamamen değiştirip gerisini reddetmek en temiz yoldur.` },
        { code: `create ltm profile http http_web defaults-from http enforcement { known-methods replace-all-with { GET HEAD POST } unknown-method reject }
modify ltm virtual vs_web profiles delete { http } profiles add { http_web }
save sys config`, lang: 'tmsh' },
        { p: `<b>En dar değişiklik:</b> Profil zaten türetilmişse ve uygulamanın hangi metotları kullandığından emin değilseniz, yalnız TRACE'i listeden çıkarıp bilinmeyen metodu reddetmek diğer metotları olduğu gibi bırakır.` },
        { code: `modify ltm profile http http_web enforcement { known-methods delete { TRACE } unknown-method reject }`, lang: 'tmsh' },
        { p: `<code>replace-all-with</code> listeyi baştan yazar; <code>add</code> ve <code>delete</code> yalnız ekler ya da çıkarır. Bir VS'de tek HTTP profili olabildiği için yenisini eklerken eskisini aynı komutta çıkarmak gerekir.` },
        { h: 'Doğrulama: önce ve sonra karşılaştırın' },
        { code: `curl -v -X TRACE http://203.0.113.100/
curl -v -X PROPFIND http://203.0.113.100/
curl -I http://203.0.113.100/`, lang: 'bash' },
        { list: [
            `<b>Değişiklikten önce:</b> TRACE'e 405 ve sunucunun kendi <code>Server</code> başlığı dönüyorsa yanıt arka uçtan gelmiştir; istek BIG-IP'den geçmiş demektir.`,
            `<b>Değişiklikten sonra:</b> TRACE ve PROPFIND için artık sunucunun kendi yanıtı (ve <code>Server</code> başlığı) görülmemeli.`,
            `<b>GET/HEAD 200:</b> iş bozulmadı. Doğrulama hem "engellendi mi" hem "normal trafik çalışıyor mu" sorusunu yanıtlamalı.`,
        ] },
        { h: 'Sık yapılan hatalar' },
        { list: [
            'Metodu listeden çıkarıp unknown-method\'u allow bırakmak: hiçbir şey değişmez.',
            'Varsayılan http profilini değiştirmek: paylaşan tüm VS\'ler etkilenir.',
            'API\'nin kullandığı PUT, DELETE, PATCH gibi metotları unutmak: API istekleri sıfırlanır. API ve web farklı ihtiyaçlara sahipse ayrı profil kullanın.',
            'Sunucu tarafındaki 405\'i "kapalı" saymak: istek yine arka uca ulaşıyor.',
        ] },
        { h: 'Alternatifler' },
        { p: `Metot denetimi bir iRule ile de yapılabilir; örneğin istemciye <code>Allow</code> başlığıyla anlamlı bir 405 dönmek için. Ancak kural her istekte çalışır. Profil ayarı ilk ve en ucuz kapıdır; iRule, yola ya da istemciye göre değişen özel kurallar gerektiğinde eklenir.` },
    ],
    sources: [
        { title: 'tmsh Reference — ltm profile http', url: 'https://clouddocs.f5.com/cli/tmsh-reference/v16/modules/ltm/ltm_profile_http.html' },
        { title: 'BIG-IP LTM Profiles Reference 13.0 — Services Profiles (HTTP)', url: 'https://techdocs.f5.com/kb/en-us/products/big-ip_ltm/manuals/product/ltm-profiles-reference-13-0-0/2.html' },
    ],
    related: [
        { label: 'Lab: HTTP profili — metot politikası (TRACE ve WebDAV kapat)', href: '#/lab/f5-60' },
        { label: 'Sorun giderme: PUT / DELETE / WebDAV istekleri sıfırlanıyor', href: '#/troubleshoot/f5-ltm/114' },
        { label: 'Arena · Trafik Masası: Metot kapısı — profil mi, iRule mı?', href: '#/arena/masa/kapi' },
        { label: 'Arena · Nöbet: Pentest raporu geldi', href: '#/arena/nobet/pentest' },
        { label: 'Araç: HTTP Profile üreteci', href: '#/f5-ltm/httpprofile' },
        { label: 'Araç: HTTP profil denetle', href: '#/f5-ltm/httpaudit' },
        { label: 'F5 BIG-IP komut kütüphanesi', href: '#/cli/f5-ltm' },
    ],
});
