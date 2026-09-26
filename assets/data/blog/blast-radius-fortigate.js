// Blog: Blast-RADIUS (CVE-2024-3596) ve FortiGate require-message-authenticator. Adresler 10.64.0.0/16.
(window.CG_BLOG = window.CG_BLOG || []).push({
    slug: 'blast-radius-fortigate',
    title: 'Blast-RADIUS (CVE-2024-3596): FortiGate\'te require-message-authenticator',
    date: '2026-09-26',
    summary: 'Güncellemeden sonra RADIUS girişleri neden birden başarısız oluyor? Blast-RADIUS açığı, FortiOS\'un Message-Authenticator zorunluluğu, teşhis komutları ve kalıcı çözüm olarak sunucu güncellemesi ile RADSEC.',
    tags: ['FortiGate', 'RADIUS', 'CVE-2024-3596', 'Kimlik doğrulama', 'Sıkılaştırma'],
    vendor: 'fortinet',
    readMin: 6,
    body: [
        { h: 'Belirti: "Güncelledik, RADIUS bozuldu"' },
        { p: `Yamalı bir FortiOS sürümüne geçtikten sonra yönetici girişleri, VPN ya da kimlik tabanlı kurallar RADIUS üzerinden doğrulanamıyor. Paylaşılan anahtar doğru, sunucu yanıt veriyor, parola doğru. Bu durumların önemli bir kısmı arıza değil, bilinçli bir korumadır: FortiGate artık yanıtında <b>Message-Authenticator</b> özniteliği bulunmayan RADIUS paketlerini kabul etmiyor.` },
        { h: 'Blast-RADIUS nedir?' },
        { p: `Blast-RADIUS (CVE-2024-3596), UDP/TCP üzerinde çalışan klasik RADIUS protokolündeki bir tasarım zayıflığıdır. Klasik RADIUS'ta sunucu yanıtının bütünlüğü MD5 tabanlı "Response Authenticator" alanına dayanır. İstemci ile sunucu arasındaki yola girebilen bir saldırgan, MD5 çakışması üreterek bir <b>Access-Reject</b> yanıtını geçerli görünen bir <b>Access-Accept</b>'e dönüştürebilir; yani yanlış parolayla bile giriş sağlanabilir.` },
        { p: `Karşı önlem, RFC 2869 ile tanımlı <b>Message-Authenticator</b> özniteliğinin (paketin tamamı üzerinde, paylaşılan anahtarla hesaplanan HMAC-MD5) her yanıtta zorunlu tutulmasıdır. Öznitelik zorunlu olduğunda saldırganın yanıtı fark edilmeden değiştirmesi mümkün olmaz.` },
        { h: 'FortiOS tarafında durum' },
        { p: `Fortinet'in FG-IR-24-255 bildirimine göre etkilenen sürümler 7.6.0, 7.4.0–7.4.5, 7.2.0–7.2.10 ile 7.0 ve 6.4'ün tümüdür; düzeltme 7.6.1+, 7.4.6+ ve 7.2.11+ sürümlerindedir. Düzeltilmiş sürümlerde <code>config user radius</code> altındaki <code>require-message-authenticator</code> ayarı vardır ve varsayılanı <b>enable</b>'dır: UDP/TCP RADIUS yanıtında öznitelik yoksa doğrulama başarısız sayılır. Fortinet'in yönetim kılavuzuna göre FortiGate ayrıca tanımadığı Proxy-State özniteliği taşıyan yanıtları da reddeder; TLS (RADSEC) kullanıldığında ise Message-Authenticator zorunlu değildir.` },
        { code: `config user radius
    edit "RAD-NPS"
        set server 10.64.99.20
        set secret <paylasimli-anahtar>
        set require-message-authenticator enable
    next
end`, lang: 'fortios' },
        { h: 'Teşhis' },
        { p: `Girişi canlıya almadan sınamak için <code>diagnose test authserver</code> kullanılır. Ayrıntı gerekiyorsa kimlik doğrulama sürecinin (fnbamd) debug'ı açılır; iş bitince kapatılır.` },
        { code: `diagnose test authserver radius RAD-NPS pap netadmin <parola>
diagnose debug application fnbamd -1
diagnose debug enable
# ... testi tekrarlayın ...
diagnose debug disable
diagnose debug reset`, lang: 'fortios' },
        { p: `Anahtar ve parola doğru, sunucu yanıt veriyor ama test başarısızsa ilk şüphe, sunucunun yanıtlarına Message-Authenticator eklemeyen eski bir RADIUS yazılımı olmasıdır.` },
        { h: 'Doğru çözüm sırası' },
        { list: [
            `<b>1. Sunucuyu güncelleyin:</b> RADIUS sunucusunu, üreticinin Blast-RADIUS düzeltmesini içeren sürüme yükseltin ve yanıtlarında Message-Authenticator göndermesini sağlayın. Kalıcı çözüm budur.`,
            `<b>2. Mümkünse RADSEC kullanın:</b> RADIUS'u TLS içinde taşımak (RADSEC) kanalı bütünüyle şifreler. FortiOS 7.4.0 ve sonrası RADSEC istemcisini destekler; TLS ile kimlik doğrulama ve hesap (accounting) trafiği TCP 2083 üzerinden gider. Sunucu sertifikasını imzalayan CA önceden FortiGate'e alınmalıdır; sunucu kimlik denetimi (<code>server-identity-check</code>) varsayılan olarak açıktır.`,
            `<b>3. Geçici önlem (yalnız gerekirse):</b> sunucu hemen güncellenemiyorsa ilgili sunucu için zorunluluk kapatılabilir; ancak bu, açığı o sunucu için yeniden açar. Değişiklik kaydı açılmalı, süre belirlenmeli ve sunucu güncellenince ayar yeniden enable yapılmalıdır.`,
        ] },
        { code: `# RADSEC (RADIUS over TLS) örneği
config user radius
    edit "RAD-TLS"
        set server 10.64.99.21
        set secret <paylasimli-anahtar>
        set transport-protocol tls
        set radius-port 2083
        set ca-cert <sunucu-sertifikasini-imzalayan-CA>
        set server-identity-check enable
    next
end`, lang: 'fortios' },
        { code: `# Geçici önlem — değişiklik kaydıyla ve süreli
config user radius
    edit "RAD-NPS"
        set require-message-authenticator disable
    next
end
# Sunucu güncellenince:
#   set require-message-authenticator enable`, lang: 'fortios' },
        { note: 'require-message-authenticator\'ı kalıcı olarak kapatıp unutmak, en sık yapılan hatadır. Kontrolü kapatmak girişi geri getirir ama açığı da geri getirir. Sorunu paylaşılan anahtarda aramak da vakit kaybettirir: anahtar yanlış olsaydı güncellemeden önce de çalışmazdı.' },
        { h: 'Kontrol listesi' },
        { list: [
            'FortiOS sürümü düzeltilmiş dalda mı (7.6.1+, 7.4.6+, 7.2.11+)?',
            'Tüm RADIUS sunucuları Message-Authenticator gönderiyor mu? Her sunucu için diagnose test authserver ile sınayın.',
            'Yol güvenilmez ağlardan geçiyorsa RADSEC planlandı mı?',
            'require-message-authenticator disable olan sunucu var mı? Varsa değişiklik kaydı ve bitiş tarihi var mı?',
        ] },
    ],
    sources: [
        { title: 'Fortinet PSIRT FG-IR-24-255 — RADIUS Protocol CVE-2024-3596', url: 'https://www.fortiguard.com/psirt/FG-IR-24-255' },
        { title: 'FortiOS 7.6.6 Administration Guide — Configuring a RADIUS server (CVE-2024-3596)', url: 'https://docs.fortinet.com/document/fortigate/7.6.6/administration-guide/759080/configuring-a-radius-server' },
        { title: 'Fortinet Community — How to test FortiGate RADIUS user authentication', url: 'https://community.fortinet.com/t5/FortiGate/Troubleshooting-Tip-How-to-test-a-FortiGate-user-authentication/ta-p/198406' },
        { title: 'FortiOS 7.6.6 CLI Reference — config user radius', url: 'https://docs.fortinet.com/document/fortigate/7.6.6/cli-reference/164332072/config-user-radius' },
        { title: 'FortiOS 7.4.0 New Features — Add RADSEC client support', url: 'https://docs.fortinet.com/document/fortigate/7.4.0/new-features/729374/add-radsec-client-support' },
        { title: 'RFC 6614 — TLS Encryption for RADIUS (RadSec)', url: 'https://www.rfc-editor.org/rfc/rfc6614' },
        { title: 'RFC 2869 — RADIUS Extensions (Message-Authenticator)', url: 'https://www.rfc-editor.org/rfc/rfc2869' },
    ],
    related: [
        { label: 'Lab: RADIUS testi başarısız — Message-Authenticator ve Blast-RADIUS', href: '#/lab/fgt-61' },
        { label: 'Lab: Uzak kimlik doğrulama — RADIUS ile yönetici, LDAP testi', href: '#/lab/fgt-09' },
        { label: 'Araç: RADIUS / LDAP sunucusu üreteci', href: '#/fortigate/authserver' },
        { label: 'Sorun giderme: güncellemeden sonra RADIUS girişi başarısız', href: '#/troubleshoot/fortigate/132' },
        { label: 'FortiGate komut kütüphanesi', href: '#/cli/fortigate' },
    ],
});
