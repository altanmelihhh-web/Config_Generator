'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (paloalto) ─────────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
// Komutlar PAN-OS 10.x/11.x içindir. Değişiklik komutları configure → set → commit sırasıyla verilir:
// PAN-OS'ta commit edilmeyen değişiklik uygulanmaz. test komutları commit edilmiş (running) kurallara bakar.
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['paloalto'] = [
        {
            title: 'Trafik Geçmiyor: Arayüz, Rota, NAT ve Kuralı Test Komutlarıyla Katman Katman Ayırmak', severity: 'err', topic: 'traffic', lab: 'pan-04', replaces: 'Trafik Gecmiyor — Policy / NAT / Route Kontrolu',
            symptom: 'LAN\'daki bir kullanıcı (10.64.10.50) internetteki bir sunucuya (198.51.100.80:443) ulaşamıyor. Tahmin yerine cihazın bu akışa hangi katmanda ne karar verdiğini sırayla görmek gerekiyor.',
            steps: [
                { code: 'show interface ethernet1/2', desc: 'Giriş arayüzünden başlayın. Bakılacak satırlar: link durumu up mı, "Zone" ve "Virtual router" dolu mu, IP doğru mu. Zone N/A ise arayüz hiçbir zone\'a üye değildir ve paket hiç işlenmez. Virtual router N/A ise bağlı ağ rota tablosuna girmez.',
                  fix: [{ cause: 'Arayüz bir zone\'a üye değil', cmd: 'configure\nset zone trust network layer3 ethernet1/2\ncommit\nexit' },
                        { cause: 'Arayüz sanal yönlendiriciye (virtual-router) eklenmemiş', cmd: 'configure\nset network virtual-router default interface ethernet1/2\ncommit\nexit' }] },
                { code: 'test routing fib-lookup virtual-router default ip 198.51.100.80', desc: 'Hedefe gerçekte hangi arayüzden ve hangi sonraki atlamayla çıkılacağını gösterir. Sonuç boşsa rota yoktur. Çıkış arayüzü beklenmedikse rota yanlıştır. Çıkış arayüzünün zone\'u güvenlik kuralındaki hedef zone\'dur (burada untrust).',
                  fix: [{ cause: 'Varsayılan rota yok', cmd: 'configure\nset network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1\ncommit\nexit' }] },
                { code: 'test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6', desc: 'NAT testine pre-NAT değerler verilir. Beklenen çıktı: "Source-NAT: Rule matched: …" ve 10.64.10.50 adresinin WAN IP\'sine (203.0.113.2) çevrildiği satır. Eşleşme yoksa özel adres çevrilmeden çıkar ve dönüş trafiği gelmez.',
                  fix: [{ cause: 'Kaynak NAT kuralı yok', cmd: 'configure\nset rulebase nat rules SNAT-OUT from trust to untrust source 10.64.10.0/24 destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1\ncommit\nexit' }] },
                { code: 'test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl', desc: 'Protokol numarayla verilir: 6 TCP, 17 UDP, 1 ICMP. Çıktının ilk satırı eşleşen kuralın adı ve sırasıdır (index), action satırı kararı verir. "No rule matched" ise interzone-default (deny) uygulanır. Deny eden bir kural çıkarsa izin kuralınız ya yok ya da ondan aşağıda.',
                  fix: [{ cause: 'İzin veren kural yok', cmd: 'configure\nset rulebase security rules WEB-OUT from trust to untrust source 10.64.10.0/24 destination any application [ web-browsing ssl ] service application-default action allow\ncommit\nexit' },
                        { cause: 'Kural var ama üstteki bir deny kuralı onu gölgeliyor', cmd: 'configure\nmove rulebase security rules WEB-OUT top\ncommit\nexit' }] },
                { code: 'show session all filter source 10.64.10.50', desc: 'Testler temizse gerçek trafiğe bakın. Oturum ACTIVE ve Flag sütununda NS (kaynak NAT) görünmeli. Satırın parantez içindeki ikinci yarısı çevrilmiş adrestir. Oturum hiç yoksa paket cihaza gelmiyor ya da ilk pakette düşüyor demektir. DISCARD ise kural düşürüyordur.' },
                { code: 'show counter global filter delta yes severity drop', desc: 'Trafiği yeniden üretip komutu iki kez çalıştırın: delta yes, son çalıştırmadan beri artan düşürme sayaçlarını gösterir. Artan sayaçlara göre yorum: flow_policy_deny kural, flow_fwd_l3_noarp sonraki atlamaya ARP çözülemiyor, flow_tcp_non_syn_drop asimetrik yol (SYN başka yoldan geçmiş). Filtresiz sayaçlar tüm cihazı gösterir; tek akış için "Paket Nerede Düşüyor" senaryosundaki packet-diag filtresini kullanın.' },
            ]
        },
        {
            title: 'Kural Yazıldı Ama Eşleşmiyor: Gölgelenme ve Kural Sırası', severity: 'warn', topic: 'traffic', lab: 'pan-05',
            symptom: 'LAN\'dan DMZ\'deki web sunucusuna (172.24.50.10, SSL) izin veren kural yazılıp commit edildi, kullanıcılar yine bağlanamıyor.',
            steps: [
                { code: 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl', desc: 'Kural tabanı yukarıdan aşağı okunur, ilk eşleşen kazanır. Çıktıdaki kural sizin yazdığınız değilse (ör. DENY-DMZ, index 1) üstteki daha geniş bir kural sizinkini gölgeliyordur. Kural hiç görünmüyorsa değerlerine bakın: zone, adres, uygulama ve servis.' },
                { code: 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl show-all yes', desc: 'show-all yes, akışla eşleşebilecek kuralları sırasıyla, ilk allow kuralına kadar listeler. Gölgelenme böyle kanıtlanır: özel izin kuralınız listede görünür ama önünde bir deny kuralı vardır.',
                  fix: [{ cause: 'Geniş deny kuralı özel kuralın üstünde: silmeden sırayı düzeltin', cmd: 'configure\nmove rulebase security rules LAN-TO-WEB before DENY-DMZ\ncommit\nexit' }] },
                { code: 'show config running | match LAN-TO-WEB', desc: 'Kuralın running yapılandırmada olduğunu doğrulayın. Kural yalnız candidate\'teyse test onu görmez: commit edilmemiştir (show config diff).',
                  fix: [{ cause: 'Kural candidate\'te duruyor, commit edilmemiş', cmd: 'configure\ncommit\nexit' }] },
                { code: 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 22 protocol 6 application ssh', desc: 'Sırayı değiştirdikten sonra başka bir akışla da test edin: izin verilmeyen SSH yine deny kuralına düşmeli. Böylece düzeltmenin güvenliği gevşetmediğini kanıtlarsınız. Kuralı silmek yerine taşımanın nedeni budur.' },
            ]
        },
        {
            title: 'Yayınlanan Sunucuya Dışarıdan Erişilemiyor (Hedef NAT: pre-NAT IP, post-NAT Zone)', severity: 'err', topic: 'traffic', lab: 'pan-06',
            symptom: 'DMZ\'deki web sunucusu (172.24.50.10) 203.0.113.10:443 ile dışarı yayınlandı. Dış istemciler bağlanamıyor, iç ağdan sunucuya erişim çalışıyor.',
            steps: [
                { code: 'test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6', desc: 'Önce NAT katmanını sınayın. Paket untrust\'tan gelir ve hedefi (203.0.113.10) rota aramasına göre yine untrust\'tadır. Bu yüzden NAT testi "from untrust to untrust" ile yapılır. Beklenen çıktı: "Destination-NAT: Rule matched: WEB-DNAT" ve 203.0.113.10 → 172.24.50.10. Eşleşme yoksa NAT kuralının zone\'larına bakın.',
                  fix: [{ cause: 'NAT kuralında hedef zone dmz yazılmış; NAT kuralında to = pre-NAT zone (untrust) olmalı', cmd: 'configure\ndelete rulebase nat rules WEB-DNAT to dmz\nset rulebase nat rules WEB-DNAT to untrust\ncommit\nexit' }] },
                { code: 'test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl', desc: 'Sonra güvenlik katmanını sınayın. Güvenlik kuralında hedef IP pre-NAT (203.0.113.10), hedef zone post-NAT (dmz, sunucunun gerçek yeri) yazılır. Sonuca göre: WEB-IN allow ise kural tamamdır. Deny eden başka bir kural çıkıyorsa gölgelenme vardır. "No rule matched" ise WEB-IN\'in değerleri yanlıştır.',
                  fix: [{ cause: 'Kuralın hedefinde gerçek (post-NAT) adres var', cmd: 'configure\ndelete rulebase security rules WEB-IN destination WEB-SRV\nset rulebase security rules WEB-IN destination 203.0.113.10\ncommit\nexit' },
                        { cause: 'Kuralın hedef zone\'u untrust; post-NAT zone (dmz) olmalı', cmd: 'configure\ndelete rulebase security rules WEB-IN to untrust\nset rulebase security rules WEB-IN to dmz\ncommit\nexit' },
                        { cause: 'Üstteki geniş bir deny kuralı WEB-IN\'i gölgeliyor', cmd: 'configure\nmove rulebase security rules WEB-IN before BLOCK-INBOUND\ncommit\nexit' }] },
                { code: 'show config diff', desc: 'Testler eski sonucu göstermeye devam ediyorsa düzeltme candidate\'te bekliyor olabilir: test komutları yalnız commit edilmiş yapılandırmaya bakar. Çıktı boş değilse commit edilmemiş değişiklik vardır.',
                  fix: [{ cause: 'Düzeltme yapılmış ama commit edilmemiş', cmd: 'configure\ncommit\nexit' }] },
                { code: 'show session all filter destination 203.0.113.10', desc: 'Gerçek trafikte oturumun ikinci satırında hedef 172.24.50.10\'a çevrilmiş olmalı (Flag ND). Oturum var ama sunucu cevap vermiyorsa sunucunun ağ geçidi güvenlik duvarı mı, sunucu 443\'ü dinliyor mu, bunlara bakın. Dışarıya yalnız 443 açılmalı: iki yönlü "any" kuralı sunucuyu tüm internete açar.' },
            ]
        },
        {
            title: 'Paket Nerede Düşüyor: packet-diag Filtresi, Sayaçlar ve Düşürme Yakalaması', severity: 'err', topic: 'traffic', lab: 'pan-04', replaces: 'Paket Nerede Dusuyor — packet-diag',
            symptom: 'Test komutları akışın izinli olduğunu söylüyor ama trafik yine geçmiyor ya da ara ara kopuyor. Cihazın bu tek akışı nerede düşürdüğünü sayaçlar ve paket yakalamayla görmek gerekiyor.',
            steps: [
                { code: 'debug dataplane packet-diag clear all', desc: 'Başkasının bıraktığı filtre ve yakalama ayarlarını temizleyin; eski filtre sayaçları yanıltır.' },
                { code: 'debug dataplane packet-diag set filter match source 10.64.10.50 destination 198.51.100.80', desc: 'Sayaç ve yakalamayı tek akışa daraltın. Kaynak NAT varsa dönüş paketi çevrilmiş adrese gelir; dönüş yönünü de görmek için ikinci bir filtre ekleyin.',
                  fix: [{ cause: 'Dönüş yönü (SNAT sonrası) filtrede yok', cmd: 'debug dataplane packet-diag set filter match source 198.51.100.80 destination 203.0.113.2' }] },
                { code: 'debug dataplane packet-diag set filter on', desc: 'Filtreyi etkinleştirir. Ayarları "debug dataplane packet-diag show setting" ile kontrol edin.' },
                { code: 'show counter global filter delta yes packet-filter yes', desc: 'Trafiği üretin ve komutu iki kez çalıştırın. packet-filter yes yalnız filtreye uyan paketlerin sayaçlarını gösterir. Artan drop sayaçları: flow_policy_deny kural, flow_fwd_l3_noarp sonraki atlamaya ARP yok, flow_tcp_non_syn_drop asimetrik yol (SYN bu cihazdan geçmemiş).',
                  fix: [{ cause: 'flow_fwd_l3_noarp: sonraki atlama cevap vermiyor ya da yanlış', cmd: 'test routing fib-lookup virtual-router default ip 198.51.100.80' },
                        { cause: 'flow_tcp_non_syn_drop: gidiş ve dönüş farklı yollardan geçiyor. Rotaları düzeltin, iki yön aynı güvenlik duvarından geçmeli' },
                        { cause: 'flow_policy_deny: kural düşürüyor. "Trafik Geçmiyor" senaryosundaki test security-policy-match adımına dönün' }] },
                { code: 'debug dataplane packet-diag set capture stage drop file drop.pcap', desc: 'Yalnız düşürülen paketleri yakalar. Diğer aşamalar receive, firewall ve transmit\'tir. Paket hiç receive\'de görünmüyorsa cihaza gelmiyordur; transmit\'te var ama karşıdan dönüş yoksa sorun dışarıdadır.' },
                { code: 'debug dataplane packet-diag set capture on', desc: 'Yakalamayı başlatın ve trafiği yeniden üretin. Yakalama dataplane\'i yorar; yalnız filtre açıkken ve kısa süre çalıştırın.' },
                { code: 'debug dataplane packet-diag set capture off', desc: 'Yakalamayı durdurun. İş bitince filtreyi de kapatın: debug dataplane packet-diag set filter off.' },
                { code: 'view-pcap filter-pcap drop.pcap', desc: 'Düşürülen paketleri okuyun. SYN düşüyorsa kural ya da NAT, SYN-ACK düşüyorsa asimetri, belirli boyuttaki paketler düşüyorsa MTU ya da parçalanma sorunu vardır.' },
            ]
        },
        {
            title: 'Commit Başarısız ya da Yapılan Değişiklik Uygulanmıyor', severity: 'warn', topic: 'ops', lab: 'pan-01',
            symptom: 'Yapılandırma değiştirildi, commit hata verdi ya da commit\'ten sonra cihaz eskisi gibi davranıyor.',
            steps: [
                { code: 'show jobs all', desc: 'Commit ve validate birer iştir (job). Type Commit, Status FIN, Result OK ya da FAIL olmalı. Son commit listede yoksa değişiklik hiç commit edilmemiştir.' },
                { code: 'show jobs id 2', desc: 'FAIL olan işin ayrıntısını gösterir (numarayı show jobs all çıktısından alın). Details altında sık görülen iletiler: "… \'X\' is not a valid reference" silinmiş ya da yanlış yazılmış nesneyi, "… is invalid" aynı satırdaki geçersiz değeri gösterir. Zone\'a katman 3 olmayan arayüz eklemek de commit\'i durdurur.',
                  fix: [{ cause: 'Kural olmayan bir nesneye başvuruyor: nesneyi oluşturun ve commit etmeden doğrulayın', cmd: 'configure\nset address WEB-SRV ip-netmask 172.24.50.10/32\nvalidate full\nexit' }] },
                { code: 'show config diff', desc: 'Candidate ile running arasındaki farkı gösterir. Boş değilse commit edilmemiş değişiklik vardır ve cihaz bunları uygulamaz. İstemeden yapılmış değişiklikleri geri almak için revert config kullanılır.',
                  fix: [{ cause: 'Candidate\'te istenmeyen değişiklik var: running\'e geri dönün', cmd: 'configure\nrevert config\nexit' }] },
                { code: 'show commit-locks', desc: 'Başka bir yönetici commit kilidi aldıysa commit "other administrators are holding … commit locks" hatasıyla durur. Kilidi kimin tuttuğunu buradan görün, önce o kişiyle konuşun.',
                  fix: [{ cause: 'Terk edilmiş bir oturumun kilidi kalmış (yalnız superuser; kilit sahibinin commit edilmemiş işi kaybolabilir)', cmd: 'request commit-lock remove' }] },
            ]
        },
        {
            title: 'Arayüz Up Ama Trafik Yok: IP, Zone ve Sanal Yönlendirici Üçlüsü', severity: 'err', topic: 'iface', lab: 'pan-02',
            symptom: 'Kablo takılı, arayüz up görünüyor ama o arayüzdeki ağdan ne cihaza ne de başka bir ağa trafik geçiyor.',
            steps: [
                { code: 'show interface all', desc: 'Alttaki mantıksal arayüz tablosuna bakın. Her veri arayüzünde zone sütunu dolu olmalı, forwarding sütununda "vr:default" gibi bir değer ve address sütununda IP görünmeli. PAN-OS\'ta trafik için bu üçü birlikte gerekir: katman 3 adres, zone ve sanal yönlendirici.',
                  fix: [{ cause: 'Arayüzde IP yok (katman 3 değil)', cmd: 'configure\nset network interface ethernet ethernet1/2 layer3 ip 10.64.10.1/24\ncommit\nexit' },
                        { cause: 'Zone sütunu boş', cmd: 'configure\nset zone trust network layer3 ethernet1/2\ncommit\nexit' },
                        { cause: 'forwarding N/A (sanal yönlendiricide değil)', cmd: 'configure\nset network virtual-router default interface ethernet1/2\ncommit\nexit' }] },
                { code: 'show interface ethernet1/2', desc: 'Tek arayüzün ayrıntısı: link durumu, Operation mode layer3, Virtual router, Zone ve IP. Link down ise sorun fizikseldir: kablo, karşı port ya da hız/dupleks.' },
                { code: 'show routing route', desc: 'Arayüzün bağlı ağı "A C" bayraklarıyla (aktif, bağlı) görünmeli. Görünmüyorsa arayüz VR\'da değildir ya da link down\'dır. Bu ağa giden statik rotalar da tabloya girmez.' },
                { code: 'ping source 10.64.10.1 host 10.64.10.20', desc: 'Veri arayüzünden ping atar. source verilmezse ping yönetim (MGT) arayüzünden çıkar ve veri yolunu sınamaz. Cevap yoksa istemcinin IP/ağ geçidi ayarına ve istemci güvenlik duvarına bakın.' },
            ]
        },
        {
            title: 'Cihaz Ping, SSH ya da HTTPS\'e Cevap Vermiyor: Yönetim Profili ve permitted-ip', severity: 'warn', topic: 'iface', lab: 'pan-02',
            symptom: 'Veri arayüzünün IP\'sine (ör. 10.64.10.1) ping, SSH ya da web yönetimi erişilemiyor. Aynı ağdaki başka cihazlara erişim var.',
            steps: [
                { code: 'show interface ethernet1/2', desc: '"Interface management profile" satırına bakın. Veri arayüzleri varsayılan olarak cihazın kendisine gelen ping, SSH ve HTTPS\'e cevap vermez; hangi hizmetin açık olacağını yönetim profili belirler. N/A ise profil bağlı değildir.',
                  fix: [{ cause: 'Arayüze yönetim profili bağlı değil', cmd: 'configure\nset network profiles interface-management-profile PING-SSH ping yes ssh yes https yes\nset network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH\ncommit\nexit' }] },
                { code: 'show config running | match permitted-ip', desc: 'Profilde permitted-ip varsa yalnız bu ağlardan gelen istekler kabul edilir; listede olmayan kaynak sessizce reddedilir. Hiç yoksa profil hizmetleri arayüze erişebilen herkese açıktır. Güvenli olan, yalnız yönetim ağını yazmaktır.',
                  fix: [{ cause: 'Yönetici bilgisayarının ağı permitted-ip listesinde yok', cmd: 'configure\nset network profiles interface-management-profile PING-SSH permitted-ip 10.64.10.0/24\ncommit\nexit' },
                        { cause: 'Sorun MGT (yönetim) portunda: onun izin listesi ayrıdır', cmd: 'configure\nset deviceconfig system permitted-ip 10.64.10.0/24\ncommit\nexit' }] },
                { code: 'show counter global filter delta yes severity drop', desc: 'Erişimi yeniden deneyip çalıştırın. flow_host_service_deny artıyorsa istek cihaza ulaşıyor ama yönetim profili ya da permitted-ip reddediyor demektir. Artmıyorsa istek cihaza hiç gelmiyordur: istemcinin rotasına bakın.' },
                { code: 'ping source 10.64.10.1 host 10.64.10.20', desc: 'Ters yönü deneyin: cihaz istemciye ulaşabiliyorsa katman 2/3 yolu sağlamdır ve sorun yalnız yönetim erişim izinlerindedir. İnternete bakan arayüzde SSH/HTTPS açmayın; http ve telnet şifresizdir, hiç kullanmayın.' },
            ]
        },
        {
            title: 'Rota Sorunu: Trafik Yanlış Arayüzden Çıkıyor ya da Hiç Çıkmıyor', severity: 'err', topic: 'routing', lab: 'pan-02',
            symptom: 'Belirli bir hedefe trafik gitmiyor ya da beklenmeyen hattan çıkıyor. Kural ve NAT testleri temiz.',
            steps: [
                { code: 'show routing route', desc: 'Bayraklar: A aktif, S statik, C bağlı, H host. Tanımladığınız statik rota listede yoksa sonraki atlama VR\'daki bir bağlı ağda değildir, çıkış arayüzü VR\'da değildir ya da link down\'dır. Aynı hedefe iki rota varsa düşük metric kazanır (yönetsel mesafe eşitse).',
                  fix: [{ cause: 'Varsayılan rota yok', cmd: 'configure\nset network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1\ncommit\nexit' },
                        { cause: 'İç ağa dönüş rotası eksik (arkadaki bir ağa giden trafik varsayılan rotadan dışarı kaçıyor)', cmd: 'configure\nset network virtual-router default routing-table ip static-route LAN-10-128 destination 10.128.0.0/16 nexthop ip-address 10.64.10.254\ncommit\nexit' }] },
                { code: 'test routing fib-lookup virtual-router default ip 198.51.100.80', desc: 'Belirli bir hedef için gerçek iletim kararı (en uzun önek eşleşmesi). Çıkan arayüz ve sonraki atlama beklediğiniz değilse daha özel bir rota öne geçiyordur. show routing route\'ta o öneki arayın.' },
                { code: 'show routing route type static', desc: 'Yalnız statik rotalar. A bayrağı olmayan statik rota tanımlı ama pasiftir: aynı hedefe daha iyi bir rota var ya da sonraki atlama erişilemez.',
                  fix: [{ cause: 'Rotada yanlış sonraki atlama', cmd: 'configure\ndelete network virtual-router default routing-table ip static-route DEFAULT\nset network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1\ncommit\nexit' }] },
                { code: 'show advanced-routing route', desc: 'PAN-OS 10.2 ve sonrasında Advanced Routing açıksa virtual-router yerine logical-router kullanılır. Bu durumda show routing ve test routing çıktıları boş kalır; rota tablosu bu komutla görülür.' },
            ]
        },
        {
            title: 'Uygulama Kuralı Eşleşmiyor: App-ID, application-default ve incomplete / insufficient-data', severity: 'warn', topic: 'traffic', lab: 'pan-03',
            symptom: 'Bir uygulama için izin kuralı yazıldı ama trafik interzone-default\'a düşüyor ya da oturumlarda uygulama "incomplete", "insufficient-data" veya "unknown-tcp" görünüyor.',
            steps: [
                { code: 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 8443 protocol 6 application ssl', desc: 'service application-default, uygulamaya yalnız kendi standart portunda izin verir (ssl için 443). Uygulama standart dışı bir portta (8443) çalışıyorsa kural atlanır ve "No rule matched" gelir. service any yazmak çözüm değildir: uygulamayı her portta açar.',
                  fix: [{ cause: 'Uygulama standart dışı portta: o portu tanımlayan servis nesnesi ile kural yazın', cmd: 'configure\nset service SVC-TCP-8443 protocol tcp port 8443\nset rulebase security rules APP-8443 from trust to dmz source 10.64.10.0/24 destination 172.24.50.10/32 application ssl service SVC-TCP-8443 action allow\ncommit\nexit' }] },
                { code: 'show session all filter destination 172.24.50.10', desc: 'Application sütununa bakın. incomplete: TCP el sıkışması tamamlanmadı (sunucu cevap vermiyor ya da dönüş yolu yok); bu App-ID değil bağlantı sorunudur. insufficient-data: el sıkışma tamam ama tanıma için yeterli veri gelmedi. unknown-tcp: App-ID uygulamayı tanımadı; özel uygulama ya da application override gerekir.' },
                { code: 'show session all filter application incomplete', desc: 'Cevapsız kalan bağlantıları toplu görür. Hep aynı hedefe gidiyorsa o sunucuya ya da dönüş rotasına bakın. Oturumlar "Rota Sorunu" senaryosuyla birlikte incelenebilir.',
                  fix: [{ cause: 'Sunucunun dönüş yolu güvenlik duvarından geçmiyor: sunucunun ağ geçidini ya da rotasını düzeltin' },
                        { cause: 'unknown-tcp olarak görünen kurum içi uygulama: Custom Application ya da Application Override aracıyla tanımlayın; kuralda "application any" ile geçiştirmeyin' }] },
                { code: 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application web-browsing', desc: 'Bazı uygulamalar başka uygulamalara bağımlıdır (ör. ssl üzerinden çalışan bir web uygulaması). Kuralda yalnız üst uygulama yazılıysa ilk paketlerde bağımlı uygulama tanınırken oturum kesilebilir. Commit sırasında çıkan "application dependency" uyarılarını okuyun ve gereken uygulamayı da kurala ekleyin.' },
            ]
        },
        {
            title: 'Cihaz Yavaş: Yönetim Düzlemi mi, Veri Düzlemi mi, Oturum Tablosu mu?', severity: 'warn', topic: 'perf', lab: 'pan-sandbox', replaces: 'Yuksek Dataplane CPU',
            symptom: 'Web arayüzü ağır açılıyor, commit uzun sürüyor ya da kullanıcılar genel yavaşlık ve kopmalar bildiriyor.',
            steps: [
                { code: 'show system resources', desc: 'Yönetim düzleminin (MP) CPU, bellek ve süreç tablosunu gösterir (top çıktısı). Yüksek CPU mgmtsrvr, devsrvr gibi yönetim süreçlerindeyse web arayüzü ve commit yavaşlar ama trafik etkilenmez. Sürekli izlemek için sonuna follow ekleyin.' },
                { code: 'show running resource-monitor minute', desc: 'Veri düzlemi (DP) çekirdeklerinin son 60 dakikadaki kullanımı, paket tamponu ve oturum kullanımı. Trafiği etkileyen yavaşlık buradadır. Çekirdekler sürekli yüksekse: trafik artışı, çok sayıda yeni oturum (flood) ya da ağır profiller (şifre çözme, tehdit taraması) incelenir.' },
                { code: 'show session info', desc: 'Etkin oturum sayısı, oturum tablosu doluluğu, saniyedeki yeni bağlantı (cps) ve paket hızı. Doluluk sınıra yaklaşıyorsa yeni oturumlar kurulamaz ve bağlantılar kopar.',
                  fix: [{ cause: 'Tek bir kaynak aşırı oturum açıyor: önce sayın', cmd: 'show session all filter source 10.64.10.50 count yes' },
                        { cause: 'Sorunlu kaynağın oturumlarını temizleyin (yalnız o kaynağın bağlantıları kesilir)', cmd: 'clear session all filter source 10.64.10.50' },
                        { cause: 'Flood tekrar ediyor: ilgili zone\'a Zone Protection Profile (SYN/UDP/ICMP flood eşikleri) bağlayın' }] },
                { code: 'show counter global filter delta yes severity drop', desc: 'Yavaşlık anında artan düşürme sayaçlarına bakın: flow_dos_* sayaçları flood korumasının devrede olduğunu, flow_policy_deny kural düşürmesini gösterir. Sayaç adlarının açıklaması çıktıda yanlarında yazar.' },
            ]
        },
        {
            title: 'Yeni VLAN (Alt Arayüz) Çalışmıyor: Etiket, Zone, Sanal Yönlendirici ve NAT', severity: 'warn', topic: 'l2', lab: 'pan-09',
            symptom: 'Güvenlik duvarında yeni bir alt arayüz (ör. ethernet1/4.20, misafir VLAN\'ı) açıldı. İstemciler ağ geçidine ya da internete ulaşamıyor.',
            steps: [
                { code: 'show interface logical', desc: 'Alt arayüz listede mi; zone, sanal yönlendirici (forwarding: vr:default) ve tag sütunu dolu mu? Zone boşsa arayüz trafik işlemez; tag 0 ya da farklıysa switch\'in gönderdiği etiketle eşleşmez.',
                  fix: [{ cause: 'Alt arayüz zone\'a eklenmemiş', cmd: 'configure\nset zone guest network layer3 ethernet1/4.20\ncommit\nexit' },
                        { cause: 'Alt arayüz sanal yönlendiriciye eklenmemiş', cmd: 'configure\nset network virtual-router default interface ethernet1/4.20\ncommit\nexit' },
                        { cause: 'Etiket yanlış ya da yok', cmd: 'configure\nset network interface ethernet ethernet1/4 layer3 units ethernet1/4.20 tag 20\ncommit\nexit' }] },
                { code: 'ping source 10.64.20.1 host 10.64.20.10', desc: 'Alt arayüzün IP\'sinden aynı VLAN\'daki bir istemciye ping. Kaynak verilmezse ping yönetim portundan çıkar. Yanıt yoksa ve yukarıdaki satırlar doğruysa sorun switch tarafındadır: port trunk mı, VLAN 20 izinli ve etiketli mi?' },
                { code: 'test security-policy-match from guest to untrust source 10.64.20.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl', desc: 'Ağ geçidine ulaşılıyor ama internet yoksa: yeni zone için kural var mı? "No rule matched" ise interzone-default reddeder.',
                  fix: [{ cause: 'Misafir ağı için izin kuralı yok', cmd: 'configure\nset rulebase security rules GUEST-WEB from guest to untrust source 10.64.20.0/24 destination any application [ ssl web-browsing dns ] service application-default action allow\ncommit\nexit' }] },
                { code: 'test nat-policy-match from guest to untrust source 10.64.20.50 destination 198.51.100.80 destination-port 443 protocol 6', desc: 'Kural eşleşiyor ama bağlantı kurulmuyorsa: kaynak NAT kuralı yeni ağı kapsıyor mu? Mevcut SNAT kuralı yalnız eski LAN ağını içeriyorsa misafir trafiği özel adresle çıkar ve dönüş gelmez.',
                  fix: [{ cause: 'Yeni ağ NAT kuralında yok', cmd: 'configure\nset rulebase nat rules GUEST-SNAT from guest to untrust source 10.64.20.0/24 destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1\ncommit\nexit' }] },
            ]
        },
        {
            title: 'Yedek İnternet Hattı Devreye Girmiyor ya da Girince Trafik Geçmiyor', severity: 'err', topic: 'routing', lab: 'pan-14',
            symptom: 'Birincil ISP hattı koptu. Ya trafik yedek hatta hiç geçmiyor ya da geçiyor ama kullanıcılar internete çıkamıyor.',
            steps: [
                { code: 'show routing route type static', desc: 'İki varsayılan rota görünmeli; A (active) bayrağı etkin olanı gösterir. Birincil metrik 10, yedek daha büyük (ör. 20) olmalı. Yedek rota listede yoksa sonraki atlaması bağlı bir ağda değildir ya da çıkış arayüzü sanal yönlendiricide değildir.',
                  fix: [{ cause: 'Yedek rota yok ya da metriği birincille aynı', cmd: 'configure\nset network virtual-router default routing-table ip static-route BACKUP destination 0.0.0.0/0 metric 20 nexthop ip-address 198.51.100.1\ncommit\nexit' }] },
                { code: 'test routing fib-lookup virtual-router default ip 198.51.100.80', desc: 'Gerçek yönlendirme kararı. Hat kopmasına rağmen birincil arayüz görünüyorsa arayüz hâlâ up\'tır (ISP\'nin ötesi kopuk): statik rota yalnız arayüz düşünce tablodan çıkar.',
                  fix: [{ cause: 'Hat up ama ötesi kopuk: rotaya path monitoring ekleyin (hedeflere düzenli ping; yanıt yoksa rota düşer). Sözdizimini sürümünüzün yönetici kılavuzundan doğrulayın.' }] },
                { code: 'test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 to-interface ethernet1/4', desc: 'Rota yedeğe geçti ama internet yoksa: NAT kuralı to-interface ile birincil arayüze bağlı olabilir. Yedek arayüz için eşleşme yoksa trafik özel adresle çıkar.',
                  fix: [{ cause: 'Yedek hat için NAT kuralı yok', cmd: 'configure\nset rulebase nat rules SNAT-ISP2 from trust to untrust to-interface ethernet1/4 source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/4\ncommit\nexit' }] },
                { code: 'show interface ethernet1/4', desc: 'Yedek arayüzün zone\'u ve sanal yönlendiricisi dolu olmalı. Zone untrust değilse mevcut güvenlik kuralları bu hatta eşleşmez.' },
            ]
        },
        {
            title: 'HA Failover Öncesi ve Sonrası: Durum, Öncelik ve Config Eşitlemesi', severity: 'warn', topic: 'ha', lab: 'pan-15',
            symptom: 'Aktif/pasif HA çiftinde bakım için kontrollü failover yapılacak; ya da failover sonrası yeni aktif cihazda son değişiklikler eksik görünüyor.',
            steps: [
                { code: 'show high-availability state', desc: 'Yerel ve eş cihazın durumu (active/passive/suspended), öncelikleri, preemptive ayarı ve "Running Configuration" satırı. PAN-OS\'ta küçük priority değeri daha yüksek önceliktir. "not synchronized" görünüyorsa failover yapmadan önce eşitleyin.',
                  fix: [{ cause: 'Yapılandırma eşit değil', cmd: 'request high-availability sync-to-remote running-config' }] },
                { code: 'request high-availability state suspend', desc: 'Kontrollü failover: aktif cihaz askıya alınır, eş aktif olur. Kablo çekmek ya da cihazı kapatmak yerine bunu kullanın; sonucu show high-availability state ile doğrulayın.' },
                { code: 'request high-availability state functional', desc: 'Bakım sonrası cihazı çifte geri katar. Unutulursa çift yedeksiz kalır. Preemptive kapalıysa (varsayılan) öncelikli cihaz geri dönünce passive kalır; bu normaldir, ikinci bir kesinti yaşanmaz.' },
            ]
        },
    ];
})();
