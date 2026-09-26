// Blog: FortiOS 7.6.3 SSL-VPN tünel modu → IPsec dial-up (TCP 443). Adresler RFC 5737 / 10.64.0.0/16.
(window.CG_BLOG = window.CG_BLOG || []).push({
    slug: 'fortios-763-sslvpn-ipsec-gecis',
    title: 'FortiOS 7.6.3: SSL-VPN tünel modu kalktı — IPsec dial-up (TCP 443) ile geçiş',
    date: '2026-09-26',
    summary: 'FortiOS 7.6.3 ile SSL-VPN tünel modu GUI ve CLI\'dan kaldırıldı ve ayarlar yükseltmede taşınmıyor. Uzaktan erişimi kesmeden IPsec dial-up\'a geçmenin planı, örnek yapılandırma ve TCP 443 ile yönetim portu çakışması.',
    tags: ['FortiGate', 'FortiOS 7.6', 'IPsec', 'SSL-VPN', 'Uzaktan erişim', 'Geçiş'],
    vendor: 'fortinet',
    readMin: 7,
    body: [
        { h: 'Ne değişti?' },
        { p: `FortiOS 7.6.3 sürüm notuna göre SSL-VPN <b>tünel modu</b> artık GUI'de de CLI'da da yok; yerini IPsec VPN aldı. Kritik ayrıntı şu: eski sürümdeki tünel modu ayarları yükseltme sırasında <b>dönüştürülmüyor</b>. Yani 7.6.3'e geçtiğiniz anda FortiClient'la SSL-VPN tüneli kuran kullanıcılar bağlanamaz hâle gelir.` },
        { p: `Tarayıcı üzerinden çalışan eski web modu ise <b>Agentless VPN</b> adıyla sürüyor; ancak sürüm notu bunun 40F, 60F ve 90G serisi modellerde desteklenmediğini ayrıca belirtiyor. Fortinet'in önerisi net: tünel modu yapılandırmasını <b>yükseltmeden önce</b> IPsec'e taşıyın.` },
        { note: 'Sıra önemli: önce IPsec dial-up kurulup pilot kullanıcılarla denenir, FortiClient profilleri dağıtılır, en son 7.6.3+ yükseltmesi yapılır. Tersi, uzaktan erişimin bir gece boyunca kesilmesi demektir.' },
        { h: 'Neden IPsec ve neden TCP 443?' },
        { p: `SSL-VPN'in yaygınlaşmasının asıl nedeni 443 portunun hemen her ağda açık olmasıydı. Klasik IPsec ise IKE için UDP 500, NAT arkasında UDP 4500 kullanır ve otel, misafir ya da mobil operatör ağlarında bu portlar sık sık kapalıdır. FortiOS'ta <b>IKEv2</b> ile IPsec, IKE müzakeresini TCP üzerinden yapabiliyor ve ESP paketlerini TCP başlığı içinde taşıyabiliyor. Böylece IPsec, SSL-VPN'in "her yerden bağlanır" özelliğini koruyor.` },
        { list: [
            `<code>set transport udp</code>: yalnız UDP (klasik davranış).`,
            `<code>set transport auto</code>: önce UDP denenir, olmazsa TCP'ye düşülür; 7.6'da varsayılan.`,
            `<code>set transport tcp</code>: yalnız TCP.`,
            `TCP portu <code>config system settings</code> altında <code>ike-tcp-port</code> ile belirlenir; 7.6'da varsayılanı 443.`,
            `TCP taşıma yalnız IKEv2 ile çalışır, NPU hızlandırması (offload) kullanmaz ve istemci tarafında <b>FortiClient 7.4.1 veya üstü</b> gerekir. Bu yüzden Fortinet, istemcinin UDP'yi tercih edip gerektiğinde TCP'ye geçtiği <code>auto</code>'yu önerir.`,
        ] },
        { h: 'Geçiş planı' },
        { list: [
            `<b>Envanter:</b> mevcut SSL-VPN portalları, kullanıcı grupları, bölünmüş tünel (split tunnel) ağları, istemci adres havuzu ve kimlik doğrulama yöntemi (yerel, LDAP, RADIUS, SAML).`,
            `<b>İstemci sürümü:</b> TCP taşıma kullanılacaksa FortiClient sürümlerini 7.4.1+ seviyesine getirin.`,
            `<b>Dial-up tüneli:</b> faz 1 <code>type dynamic</code>, <code>mode-cfg</code> ile adres havuzu, EAP ile grup doğrulaması; faz 2 ve tünel → iç ağ kuralı.`,
            `<b>Port çakışması:</b> WAN arayüzünde web yönetimi de 443'teyse <code>admin-sport</code>'u taşıyın (aşağıya bakın).`,
            `<b>Pilot:</b> küçük bir kullanıcı grubuyla hem UDP'nin açık olduğu hem kapalı olduğu ağlardan deneyin.`,
            `<b>Yaygınlaştırma ve yükseltme:</b> tüm istemciler IPsec profiline geçtikten sonra 7.6.3+ yükseltmesini planlayın.`,
        ] },
        { h: 'Örnek dial-up yapılandırması' },
        { p: `Aşağıdaki örnek, port1 WAN arayüzünde çalışan, istemcilere 10.64.200.10–50 aralığından adres veren ve kullanıcıları <code>VPN-USERS</code> grubuyla doğrulayan bir IKEv2 dial-up tünelidir. Kullanıcı ve grup tanımlarının hazır olduğu varsayılıyor.` },
        { code: `config vpn ipsec phase1-interface
    edit "DIAL"
        set type dynamic
        set interface "port1"
        set ike-version 2
        set peertype any
        set net-device disable
        set mode-cfg enable
        set ipv4-start-ip 10.64.200.10
        set ipv4-end-ip 10.64.200.50
        set proposal aes256-sha256
        set dhgrp 20 21
        set eap enable
        set eap-identity send-request
        set authusrgrp "VPN-USERS"
        set transport auto
        set psksecret <on-paylasimli-anahtar>
    next
end
config vpn ipsec phase2-interface
    edit "DIAL"
        set phase1name "DIAL"
    next
end
config firewall address
    edit "DIAL-RANGE"
        set type iprange
        set start-ip 10.64.200.10
        set end-ip 10.64.200.50
    next
end
config firewall policy
    edit 0
        set name "VPN-LAN"
        set srcintf "DIAL"
        set dstintf "port2"
        set srcaddr "DIAL-RANGE"
        set dstaddr "LAN-NET"
        set action accept
        set schedule "always"
        set service "ALL"
    next
end`, lang: 'fortios' },
        { p: `Dial-up'ta karşı uç sabit olmadığı için faz 1'de <code>remote-gw</code> yazılmaz. <code>mode-cfg</code> istemciye havuzdan adres verir; <code>eap enable</code> ve <code>authusrgrp</code> kullanıcıyı grupla doğrular. Tünel kurulsa bile tünelden iç ağa giden kural yoksa trafik örtük ret kuralına düşer.` },
        { h: 'Sessiz tuzak: yönetim arayüzü de 443\'te' },
        { p: `Aynı arayüzde hem web yönetimi (HTTPS) hem IKE TCP 443 açıksa, tünele bağlı arayüzlerde web yönetimine erişim etkilenebilir (Fortinet'in yönetim kılavuzu bu çakışma için açıkça uyarır). İki çözüm var: yönetim portunu taşımak ya da <code>ike-tcp-port</code>'u başka bir porta almak. İkincisi tüm FortiClient profillerinin de değişmesini gerektirdiği için çoğu zaman birincisi daha az zahmetlidir.` },
        { code: `config system global
    set admin-sport 8443
end`, lang: 'fortios' },
        { note: 'admin-sport değişikliğini uzaktan yapıyorsanız oturumunuz düşer; yeni porttan (ör. https://198.51.100.10:8443) bağlanmayı ve güvenlik kurallarınızın/erişim listelerinizin bu portu kapsadığını önceden kontrol edin.' },
        { h: 'Doğrulama ve ilk teşhis' },
        { code: `get vpn ipsec tunnel summary
diagnose vpn ike gateway list
diagnose vpn ike log filter rem-addr4 198.51.100.77
diagnose debug application ike -1
diagnose debug enable
# ... istemci bağlanmayı denesin ...
diagnose debug disable
diagnose debug reset`, lang: 'fortios' },
        { p: `Önce tünel özeti ve ağ geçidi listesiyle istemcinin gelip gelmediğine bakın; ayrıntı IKE debug'ındadır. Debug'ı her zaman istemcinin genel IP'siyle filtreleyin ve iş bitince kapatın. Tipik nedenler: sunucunun yalnız UDP beklemesi, <code>ike-tcp-port</code> ile istemcideki portun farklı olması, öneri/DH uyuşmazlığı, kullanıcının grupta olmaması, havuzun tükenmesi ve tünel → LAN kuralının eksik olması.` },
        { h: 'Özet' },
        { list: [
            '7.6.3+ sürümünde SSL-VPN tünel modu yok; ayarlar yükseltmede taşınmaz.',
            'Geçişi yükseltmeden önce yapın; IPsec dial-up + IKEv2 + TCP 443 SSL-VPN esnekliğini korur.',
            'TCP taşıma için FortiClient 7.4.1+ gerekir.',
            'Yönetim HTTPS 443 ile IKE TCP 443 çakışmasını admin-sport ile giderin.',
            'Tünel → iç ağ kuralını unutmayın.',
        ] },
    ],
    sources: [
        { title: 'FortiOS 7.6.3 Release Notes — SSL VPN tunnel mode replaced with IPsec VPN', url: 'https://docs.fortinet.com/document/fortigate/7.6.3/fortios-release-notes/173430/ssl-vpn-tunnel-mode-no-longer-supported' },
        { title: 'FortiOS 7.6 — SSL VPN to IPsec VPN Migration Guide', url: 'https://docs.fortinet.com/document/fortigate/7.6.0/ssl-vpn-to-ipsec-vpn-migration/126460' },
        { title: 'FortiOS 7.6.6 CLI Reference — config vpn ipsec phase1-interface (transport)', url: 'https://docs.fortinet.com/document/fortigate/7.6.6/cli-reference/305883427/config-vpn-ipsec-phase1-interface' },
        { title: 'FortiOS 7.6.6 Administration Guide — Dialup IPsec VPN using custom TCP port', url: 'https://docs.fortinet.com/document/fortigate/7.6.6/administration-guide/567401/dialup-ipsec-vpn-using-custom-tcp-port' },
    ],
    related: [
        { label: 'Lab: 7.6 FortiClient ile IPsec dial-up (TCP 443)', href: '#/lab/f76-30' },
        { label: 'Lab: Dial-up istemci bağlanamıyor — 7.6 IPsec tanılama', href: '#/lab/f76-54' },
        { label: 'Araç: IPsec Dial-up (FortiClient) üreteci', href: '#/fortigate/ipsecdialup' },
        { label: 'Sorun giderme: 7.6.3 sonrası SSL-VPN tüneli yok', href: '#/troubleshoot/fortigate/129' },
        { label: 'Sorun giderme: dial-up istemci bağlanamıyor', href: '#/troubleshoot/fortigate/131' },
        { label: 'FortiGate komut kütüphanesi', href: '#/cli/fortigate' },
    ],
});
