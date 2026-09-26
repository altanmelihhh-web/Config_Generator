'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (f5-ltm) ───────────────────────────
// Kaynak: CLI Lab arıza bulguları (assets/data/labs/f5.js) ve araştırma notları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?, steps: [{ code, desc, sample?, fix?: string | [{ cause, cmd? }] }], quiz?: [{ q, choices: [[v, etiket]], correct, why }] }
// Komutlar TMOS 16.1/17.x içindir; tmsh komutları tmsh içinde ya da bash'te "tmsh" önekiyle çalışır.
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['f5-ltm'] = [
        {
            title: 'BIG-IP Bir İç Ağa / Sunucu Ağına Ulaşamıyor: Arayüz, VLAN Etiketi ve Self IP', severity: 'err', topic: 'l2', lab: 'f5-05',
            symptom: 'BIG-IP belirli bir VLAN\'daki istemci ya da sunuculara ulaşamıyor: ping yanıt almıyor, pool üyeleri (varsa) monitor down. Yapılandırmada hata mesajı yok.',
            steps: [
                { code: 'tmsh show net arp', desc: 'Hedefin kaydı "incomplete" ise BIG-IP hedefin MAC adresini öğrenemiyor: sorun L2\'de (arayüz, VLAN üyeliği, etiket ya da switch portu). Kayıt "resolved" ise L2 sağlam; sorun yukarıda (rota, port lockdown, sunucu).' },
                { code: 'tmsh show net interface', desc: 'VLAN\'ın üye arayüzü "up" olmalı. "down" kablo ya da karşı port sorunu, "DS" arayüzün yönetimsel olarak kapatıldığı anlamına gelir.',
                  fix: [{ cause: 'Arayüz yönetimsel olarak kapalı', cmd: 'tmsh modify net interface 1.3 enabled\ntmsh save sys config' }] },
                { code: 'tmsh list net vlan internal', desc: 'Arayüzün modu switch portuyla uyumlu olmalı: trunk port → tagged; access port → untagged. Tagged üyelikte tag, switch\'teki VLAN numarasıyla aynı olmalı. Tag verilmezse BIG-IP 4094\'ten geriye otomatik bir numara seçer.',
                  fix: [{ cause: 'Tag switch ile uyuşmuyor', cmd: 'tmsh modify net vlan internal tag 30\ntmsh save sys config' },
                        { cause: 'Trunk porta bağlı arayüz untagged eklenmiş', cmd: 'tmsh modify net vlan internal interfaces replace-all-with { 1.3 { tagged } }\ntmsh save sys config' }] },
                { code: 'tmsh list net self', desc: 'O ağın self IP\'si doğru VLAN\'a bağlı mı? IP doğru ama vlan satırı farklıysa çerçeveler başka VLAN\'dan gider. Self IP\'nin VLAN\'ı değiştirilecekse silinip doğru VLAN ile yeniden oluşturulur.',
                  fix: [{ cause: 'Self IP yanlış VLAN\'da', cmd: 'tmsh delete net self self_int\ntmsh create net self self_int address 10.64.10.11/24 vlan internal allow-service default\ntmsh save sys config' }] },
                { code: 'tcpdump -nni internal -e host 10.64.10.50', desc: 'bash\'te. -e ile 802.1Q etiketi de görünür. Yalnız giden ARP istekleri görünüp yanıt gelmiyorsa çerçeveler switch\'e ulaşıyor ama doğru VLAN\'a düşmüyordur: switch portunun modunu ve izinli VLAN listesini kontrol edin.' },
            ]
        },
        {
            title: 'GUI (Configuration Utility) ya da SSH\'a Erişilemiyor: httpd/sshd Allow, Port Lockdown ve Yönetim Rotası', severity: 'warn', topic: 'aaa', lab: 'f5-03',
            symptom: 'Bir yönetici BIG-IP GUI\'sine ya da SSH\'a bağlanamıyor; bağlantı reddediliyor ya da zaman aşımına uğruyor. Başka bir ağdan erişim çalışıyor olabilir.',
            steps: [
                { code: 'tmsh list sys httpd allow\ntmsh list sys sshd allow', desc: 'Yöneticinin kaynak adresi (ya da ağı) listede mi? "replace-all-with" ile yapılan bir değişiklik kendi yönetim ağını dışarıda bırakmış olabilir. Liste yönetim IP\'sine ve self IP\'lere gelen yönetim bağlantılarının hepsine uygulanır. Liste All içeriyorsa add kısıtlama yapmaz; kısıtlamak için replace-all-with kullanılır.',
                  fix: [{ cause: 'Yönetim ağı GUI listesinde yok (konsoldan ya da SSH ile girip ekleyin)', cmd: 'tmsh modify sys httpd allow add { 10.240.0.0/255.255.0.0 }\ntmsh save sys config' },
                        { cause: 'Yönetim ağı SSH listesinde yok (konsoldan girip ekleyin)', cmd: 'tmsh modify sys sshd allow add { 10.240.0.0/255.255.0.0 }\ntmsh save sys config' }] },
                { code: 'tmsh list sys management-ip\ntmsh list sys management-route', desc: 'Yönetici başka bir ağdan geliyorsa dönüş için yönetim rotası gerekir. Yönetim IP\'si değiştirilecekse eskisi silinip yenisi oluşturulur.' },
                { code: 'tmsh list net self allow-service', desc: 'Erişim bir self IP üzerinden deneniyorsa port lockdown da açık olmalı (tcp:443 / tcp:22). Varsayılan none\'dır. İnternete bakan self IP\'de açmak yerine yönetim IP\'sini kullanın.' },
                { code: 'tail -n 50 /var/log/audit', desc: 'Kim, ne zaman, hangi allow komutunu çalıştırdı? tmsh ile yapılan her değişiklik "AUDIT … cmd_data=" satırıyla kaydedilir; son değişikliği bulup geri almak için kullanılır.' },
            ]
        },
        {
            title: 'Yeniden Başlatmadan Sonra Yapılandırma Değişiklikleri Kayboldu (save sys config)', severity: 'warn', topic: 'ops', lab: 'f5-01',
            symptom: 'Bakımda cihaz yeniden başlatıldı; bir gün önce tmsh ile yapılan VLAN, self IP ya da kullanıcı değişiklikleri yok.',
            steps: [
                { code: 'grep "cmd_data" /var/log/audit | tail -n 20', desc: 'Kaybolan değişikliklerin komutlarını audit logundan bulun. tmsh değişiklikleri çalışan yapılandırmaya anında uygulanır ama dosyaya ancak "save sys config" ile yazılır; GUI ise her değişiklikte kaydeder.' },
                { code: 'tmsh load sys config verify', desc: 'Dosyadaki yapılandırmanın hatasız olduğunu yüklemeden doğrular. Değişiklikleri yeniden uyguladıktan sonra kaydetmeden önce kullanılabilir.' },
                { code: 'tmsh save sys config', desc: 'Değişiklikleri yeniden uygulayıp kaydedin. Ağ ayarları /config/bigip_base.conf, trafik nesneleri /config/bigip.conf dosyasına yazılır.',
                  fix: [{ cause: 'Değişiklik yapıldı ama kaydedilmedi', cmd: 'tmsh save sys config' }] },
            ]
        },
        {
            title: 'Web Sitesi (VIP) Açılmıyor: Refused, Reset ya da Zaman Aşımı?', severity: 'err', topic: 'adc', lab: 'f5-10', replaces: 'Virtual Server Offline / Unavailable',
            symptom: 'Kullanıcılar bir virtual server üzerinden yayınlanan siteye ulaşamıyor. Belirti türü (bağlantı reddi, sıfırlama, zaman aşımı) arızanın yerini gösterir.',
            steps: [
                { code: 'curl -v http://203.0.113.100/', desc: 'Bir istemciden. "Connection refused": virtual server yok ya da devre dışı. "Connection reset by peer": VS var ama gönderecek çalışan üye yok ya da sunucu o portta dinlemiyor (BIG-IP pool boşken 503 değil RST gönderir). "Operation timed out": istek sunucuya gidiyor ama yanıt BIG-IP\'ye dönmüyor (SNAT yok, asimetrik yol) ya da L2 sorunu.',
                  fix: [{ cause: 'Virtual server devre dışı', cmd: 'tmsh modify ltm virtual vs_web enabled\ntmsh save sys config' }] },
                { code: 'tmsh show ltm virtual vs_web\ntmsh show ltm pool web_pool members', desc: 'Availability (available / offline / unknown), State (enabled / disabled) ve Reason satırları. Üyeler "marked down by a monitor" ise monitörün son hatası Reason\'da ve /var/log/ltm\'de yazar. Üyeler "disabled" ise bakımda kapatılıp açılmamıştır.',
                  fix: [{ cause: 'Üyeler bakımda devre dışı bırakılmış', cmd: 'tmsh modify ltm pool web_pool members modify { 10.64.30.50:80 { session user-enabled } }\ntmsh save sys config' }] },
                { code: 'tail -n 30 /var/log/ltm | grep -E "01070638|01010028"', desc: '01070638: üye monitor status down (satırda last error: Response Code, bağlantı hatası vb.). 01010028: pool\'da çalışan üye kalmadı. "Response Code: 200 (OK)" ile down olan üye, sunucunun 200 döndüğünü ama recv dizgesinin eşleşmediğini gösterir.',
                  fix: [{ cause: 'Monitör recv dizgesi yanlış', cmd: 'tmsh modify ltm monitor http mon_web recv "200 OK"\ntmsh save sys config' }] },
                { code: 'tmsh list ltm virtual vs_web source-address-translation\ntmsh list ltm pool web_pool', desc: 'Zaman aşımında: SNAT type none ve sunucuların ağ geçidi BIG-IP değilse dönüş yolu yoktur. Reset + yeşil üyelerde: üye portu uygulamanın portu mu, monitör yalnız ICMP mi (yeşil ama uygulamayı sınamıyor)?',
                  fix: [{ cause: 'SNAT kaldırılmış', cmd: 'tmsh modify ltm virtual vs_web source-address-translation { type automap }\ntmsh save sys config' },
                        { cause: 'Üyeler yanlış porttan ve monitör yalnız ICMP', cmd: 'tmsh modify ltm pool web_pool members replace-all-with { 10.64.30.50:80 10.64.30.51:80 } monitor mon_web\ntmsh save sys config' }] },
                { code: 'curl -v http://10.64.30.50/health', desc: 'BIG-IP bash\'ten doğrudan sunucuya: monitörün gördüğü yanıtı görürsünüz. Kaynak adresi seçmek için --interface <self-ip>.' },
            ]
        },
        {
            title: 'Kullanıcının Oturumu Düşüyor / Başka Sunucuya Gidiyor: Persistence', severity: 'warn', topic: 'adc', lab: 'f5-07',
            symptom: 'Kullanıcılar oturum açtıktan sonra bir sonraki tıklamada oturumları kayboluyor ya da sepet boşalıyor; uygulama oturumu sunucuda tutuyor.',
            steps: [
                { code: 'tmsh list ltm virtual vs_web persist profiles', desc: 'Persistence tanımlı mı, hangi tip? Cookie persistence HTTP profili ister. Cookie tutmayan istemcilerde (API, bazı cihazlar) cookie persistence işlemez; fallback olarak source_addr verilebilir.',
                  fix: [{ cause: 'Persistence yok', cmd: 'tmsh modify ltm virtual vs_web profiles add { http } persist replace-all-with { cookie }\ntmsh save sys config' }] },
                { code: 'curl -v -c /var/tmp/j -b /var/tmp/j http://203.0.113.100/', desc: 'Yanıtta "Set-Cookie: BIGipServer<pool>=…" başlığı olmalı; değer üyenin IP ve portunun kodlanmış hâlidir. Tarayıcı bu cookie\'yi geri göndermiyorsa (ör. farklı alan adı, cookie engeli) kalıcılık çalışmaz.' },
                { code: 'tmsh show ltm persistence persist-records', desc: 'Source address persistence kayıtları burada görünür. Tüm kullanıcılar tek bir NAT adresinden geliyorsa hepsi aynı üyededir: yük dengelenmez; cookie persistence\'a geçin.' },
            ]
        },
        {
            title: 'Yükseltme Başarısız ya da Sonrasında Cihaz Çalışmıyor: Lisans, Disk, ISO ve Hacim', severity: 'err', topic: 'ops', lab: 'f5-12',
            symptom: 'Yazılım yükseltmesi ya kurulum aşamasında başarısız oldu ya da cihaz yeni sürümle açıldı ama istemde INOPERATIVE görünüyor ve uygulamalar çalışmıyor.',
            steps: [
                { code: 'tmsh show sys software status', desc: 'Hacimlerin durumu. "failed (Disk full (volume group))" kurulumun yer yüzünden yarıda kaldığını gösterir; eski ve kullanılmayan hacimler ya da /shared/images altındaki eski ISO\'lar silinerek yer açılır. "complete" ise kurulum sağlam, sorun açılışta.' },
                { code: 'tail -n 50 /var/log/ltm', desc: '"01070608:0: License is not operational" satırı yapılandırmanın lisans nedeniyle yüklenmediğini söyler. İstemde INOPERATIVE ve tmsh\'te "The configuration has not yet loaded" görülür.',
                  fix: [{ cause: 'Hizmeti hemen geri getirmek: eski sürümün hacminden açın', cmd: 'tmsh reboot volume HD1.1' }] },
                { code: 'grep "Service check date" /config/bigip.license', desc: 'Tarih, hedef sürümün lisans kontrol tarihinden (K7727 tablosu) eskiyse lisans yeniden etkinleştirilir (reactivate) ve yükseltme tekrarlanır. Bu kontrol her yükseltmenin ilk adımıdır.' },
                { code: 'md5sum -c /shared/images/BIGIP-17.1.1.3-0.0.5.iso.md5\ndf -h /shared', desc: 'Kurulum başlamıyor ya da yarıda kalıyorsa: ISO bozuk mu (FAILED), /shared dolu mu? Bozuk ISO yeniden indirilip kopyalanır.' },
                { code: 'tmsh list sys ucs', desc: 'Geri dönüşte ya da cihaz değişiminde kullanılacak UCS yedeği var mı? Yoksa bundan sonraki yükseltmeden önce save sys config + save sys ucs yapılıp dosya cihaz dışına kopyalanmalı.' },
            ]
        },
        {
            title: 'VS / Pool / Node Alarmı Geldi ya da Yükseltme-Failover Sonrası Kontrol: /var/log/ltm Okuma', severity: 'info', topic: 'ops', lab: 'f5-13',
            symptom: 'İzleme sistemi bir virtual server ya da pool için alarm üretti, ya da bir bakım (yükseltme, failover) sonrasında "her şey oturdu mu" kontrolü yapılacak.',
            steps: [
                { code: 'tail -n 50 /var/log/ltm', desc: 'Satır yapısı: zaman, host, seviye, süreç, mesaj kodu:seviye, metin. Kodun son rakamı önem seviyesidir: 0 emerg, 3 err, 4 warning, 5 notice. err ve üstü önceliklidir.' },
                { code: 'grep -E "01070638|01070727|01070640|01070728" /var/log/ltm', desc: 'Üye (01070638 down / 01070727 up) ve node (01070640 down / 01070728 up) durum değişimleri. "last error" kısmı nedeni söyler: Response Code 500 uygulama hatası, "No successful responses received before deadline" bağlantı/erişim sorunu, "forced down" bir yöneticinin kapattığı üye.' },
                { code: 'grep -E "01010028|01010221|01071682|01071681|010719e7" /var/log/ltm', desc: '01010028: pool\'da çalışan üye kalmadı (hizmet kesildi); 01010221: pool yeniden üyeli. 01071682/01071681: virtual server unavailable/available (SNMP trap). 010719e7: virtual address rengi (GREEN/RED). Kesinti süresi bu satırların zaman farkıdır.' },
                { code: 'grep -iE "connection limit|01200017|01200009" /var/log/ltm', desc: '01200017: bir üye connection-limit\'e ulaştı; 01200009: virtual server bağlantı limiti aşıldı ve bağlantı reddedildi. Limit gerçek kapasiteye göre mi ayarlanmış, bakın.' },
                { code: 'tmsh show sys log ltm lines 20', desc: 'Aynı log tmsh\'ten kodsuz biçimde. Yükseltme ya da failover sonrasında son satırlarda beklenmeyen down, No members available ya da unavailable olmamalıdır; varsa uygulama ekibiyle doğrulama yapılmadan bakım kapatılmaz.' },
            ]
        },
        {
            title: 'Kullanıcı Hep Aynı (Sorunlu) Sunucuya Gidiyor ya da Bakıma Alınan Üyeye Hâlâ Trafik Gidiyor: Bağlantı Tablosu ve Persist Kayıtları', severity: 'warn', topic: 'adc', lab: 'f5-14', replaces: 'Client Belirli Sunucuya Yonlendirilmiyor',
            symptom: 'Belirli bir kullanıcı hep aynı sunucuya düşüyor; ya da bakım için devre dışı bırakılan pool üyesine trafik gitmeye devam ediyor.',
            steps: [
                { code: 'tmsh show sys connection cs-client-addr 198.51.100.23', desc: 'Satır: istemci → VIP → SNAT adresi (ss-client) → sunucu (ss-server). Dördüncü sütun kullanıcının gerçekte hangi sunucuda olduğunu gösterir. Kayıt yoksa istek BIG-IP\'ye ulaşmıyor; sunucu tarafı any6.any ise bağlantı açılmış ama bir üye seçilememiş (üye yok ya da istek bekleniyor).' },
                { code: 'tmsh show ltm persistence persist-records client-addr 198.51.100.23', desc: 'Source address persistence kaydı istemciyi bir üyeye bağlar ve süresi dolana kadar aynı üye seçilir. Cookie insert persistence tabloda kayıt tutmaz; bilgi istemcideki BIGipServer<pool> cookie\'sindedir (tarayıcıdan silinir).',
                  fix: [{ cause: 'Kullanıcıyı başka sunucuya taşımak (önce persist kaydı, sonra bağlantı)', cmd: 'tmsh delete ltm persistence persist-records client-addr 198.51.100.23\ntmsh delete sys connection cs-client-addr 198.51.100.23 cs-server-addr 203.0.113.100 cs-server-port 80' }] },
                { code: 'tmsh show sys connection ss-server-addr 10.64.30.52 ss-server-port 80', desc: 'Bakımdaki üyede kalan bağlantılar. Disabled (session user-disabled) üye yeni bağlantı almaz ama mevcut bağlantılar ve kalıcılık kaydı olan istemciler sürer. Kurulu bağlantılar yapılandırma değişikliğinden etkilenmez (K13253).',
                  fix: [{ cause: 'Üyeyi kesintisiz boşaltmak', cmd: 'tmsh delete ltm persistence persist-records node-addr 10.64.30.52 node-port 80\ntmsh delete sys connection ss-server-addr 10.64.30.52 ss-server-port 80\ntmsh modify ltm pool web_pool members modify { 10.64.30.52:80 { state user-down } }' }] },
                { code: 'tmsh show sys connection cs-client-addr 198.51.100.23 all-properties', desc: 'Ayrıntılı blok: Idle Timeout (TCP profilinin süresi), Virtual Path (VIP), Lasthop. Filtresiz "delete sys connection" TÜM tabloyu (mirror dahil) siler; her zaman adres ve port ile daraltın.' },
            ]
        },
        {
            title: 'HA Çifti Eşitlenmiyor: Disconnected, Changes Pending ve Awaiting Initial Sync', severity: 'err', topic: 'ha', lab: 'f5-16', replaces: 'HA Sync Sorunu (Changes Pending)',
            symptom: 'İstemde ya da show cm sync-status çıktısında "Disconnected", "Changes Pending" veya "Awaiting Initial Sync" görünüyor; değişiklikler eşe gitmiyor.',
            steps: [
                { code: 'tmsh show cm sync-status', desc: 'Durum ve Details satırları. Disconnected: cihazlar birbirini görmüyor. Changes Pending: bir cihazda eşitlenmemiş değişiklik var; Details hangi cihazın güncel olduğunu söyler. Awaiting Initial Sync: grup kuruldu ama ilk sync yapılmadı.',
                  fix: [{ cause: 'Changes Pending / Awaiting Initial Sync: güncel cihazdan gruba eşitle', cmd: 'tmsh run cm config-sync to-group dg-failover' }] },
                { code: 'tmsh list cm device bigip-a.lab.example configsync-ip unicast-address', desc: 'ConfigSync adresi tanımlı ve HA VLAN\'ındaki non-floating self IP mi? Yönetim IP\'si ConfigSync için kullanılmaz (K14348).',
                  fix: [{ cause: 'ConfigSync adresi yok ya da yanlış', cmd: 'tmsh modify cm device bigip-a.lab.example configsync-ip 172.24.1.1' }] },
                { code: 'tmsh list net self self_ha allow-service', desc: 'HA self IP\'sinde port lockdown default olmalı: TCP 4353 (ConfigSync/CMI) ve UDP 1026 (network failover) açık. "none" iki cihazı Disconnected yapar (K14666670).',
                  fix: [{ cause: 'HA self IP\'sinde port lockdown none', cmd: 'tmsh modify net self self_ha allow-service default' }] },
                { code: 'tmsh show sys ntp\ndate', desc: 'İki cihazın saati uyuşmalı; fark aygıt sertifikalarının geçersiz sayılmasına ve Disconnected durumuna yol açar. /var/log/ltm\'de CMI bağlantı hataları (0107142f "Can\'t connect to CMI peer") görülebilir.' },
            ]
        },
        {
            title: 'Kontrollü Failover ve Sonrası: Geçiş, Eski Yapılandırma ve GARP / MAC Masquerade', severity: 'warn', topic: 'ha', lab: 'f5-15', replaces: 'Failover Testi (Kontrollü Gecis)',
            symptom: 'Bakım için failover yapılacak ya da failover sonrasında bazı siteler açılmıyor / tüm VIP\'ler bir süre yanıt vermiyor.',
            steps: [
                { code: 'tmsh show cm sync-status', desc: 'Failover\'dan ÖNCE durum In Sync olmalı. Changes Pending iken geçilirse eş eski yapılandırmayla hizmet verir; son eklenen VS ya da değişiklikler yokmuş gibi olur.',
                  fix: [{ cause: 'Failover sonrası yeni uygulama açılmıyor (eşitlenmemiş değişiklik)', cmd: 'tmsh run cm config-sync to-group dg-failover' }] },
                { code: 'tmsh run sys failover standby traffic-group traffic-group-1', desc: 'Aktif cihazda çalıştırılır. Ardından istemde Standby görünür; /var/log/ltm\'de "010c0026 Failover condition, active attempting to go standby", "010c0052 Standby for traffic group …" ve "010c0018 Standby" satırları düşer. Eş cihazda "010c0053 Active for traffic group …".' },
                { code: 'curl -v http://203.0.113.100/', desc: 'İstemciden doğrulama. Tüm VIP\'ler bağlantı kuramıyorsa (Connection timed out) üst router/switch GARP\'ı işlememiş ve eski cihazın MAC\'ine gönderiyor olabilir.',
                  fix: [{ cause: 'GARP işlenmiyor: MAC masquerade ayarlayın (iki cihazda da)', cmd: 'tmsh modify cm traffic-group traffic-group-1 mac 02:01:d7:0a:40:0a' }] },
                { code: 'tail -n 30 /var/log/ltm', desc: 'Geçiş sonrası beklenmeyen monitor down, "No members available" ya da "has become unavailable" satırı olmamalı; varsa eşin sunucu ağına erişimini (VLAN, floating self IP) kontrol edin.' },
            ]
        },
            {
            title: 'Bağlantı Sıfırlanıyor ya da Zaman Aşımına Düşüyor: tcpdump ile Kim, Neden? (0.0:nnnp ve RST Nedeni)', severity: 'err', topic: 'adc', lab: 'f5-18',
            symptom: 'Kullanıcılar "bağlantı sıfırlandı" (reset) ya da zaman aşımı görüyor; uygulama ve ağ ekipleri sorunun kendi tarafında olmadığını söylüyor.',
            steps: [
                { code: 'tmsh modify sys db tm.rstcause.log value enable', desc: 'BIG-IP\'nin gönderdiği her RST için /var/log/ltm\'e neden satırı yazar (01230140:3). Yoğun sistemde log hızla büyür: iş bitince disable yapın.' },
                { code: 'tcpdump -nni 0.0:nnnp -c 200 host 203.0.113.100', desc: 'bash\'te. 0.0 tüm TMM arayüzleri, :nnn en yüksek F5 ayrıntısı, p karşı taraf: filtre VIP\'e yazılsa da SNAT\'lı sunucu tarafı gelir. Satır sonunda in/out, virtual server (lis=) ve BIG-IP\'nin RST\'lerinde rst_cause yazar.',
                  fix: [{ cause: 'SYN\'e anında RST, sunucu tarafı yok (VS devre dışı ya da o portta dinleyen yok: No local listener)', cmd: 'tmsh list ltm virtual vs_web destination\ntmsh modify ltm virtual vs_web enabled' },
                        { cause: 'GET\'ten sonra BIG-IP RST, rst_cause "No pool member available": gönderilecek üye yok', cmd: 'tmsh show ltm pool web_pool members\ntmsh list ltm monitor http mon_web recv' },
                        { cause: 'Sunucudan RST, istemciye "{peer} TCP RST from remote system": sunucu o portta dinlemiyor', cmd: 'tmsh list ltm pool web_pool members\ncurl -v http://10.64.30.50:80/' },
                        { cause: 'Sunucuya SYN yanıtsız tekrar ediyor ve kaynak istemci adresi: SNAT yok, yanıt BIG-IP\'ye dönmüyor', cmd: 'tmsh modify ltm virtual vs_web source-address-translation { type automap }' }] },
                { code: 'grep 01230140 /var/log/ltm', desc: 'Satır: "RST sent from <kaynak> to <hedef>, [0x…:…] <neden>". {peer} nedenin karşı bağlantıda oluştuğunu söyler. Kaynak VIP ise RST BIG-IP\'den, kaynak üye ise sunucudan gelmiştir.' },
                { code: 'tmsh show net rst-cause', desc: 'Nedene göre sayaçlar. Port denied: self IP port lockdown; Unable to select local port: SNAT kaynak portu tükendi (SNAT pool\'a adres ekleyin); RST from BIG-IP internal Linux host: çoğunlukla monitör kapanışları, normal.' },
                { code: 'tcpdump -nni 0.0:nnnp -s0 -c 100000 -w /var/tmp/vip.pcap host 203.0.113.100', desc: 'Destek kaydı ya da Wireshark için dosyaya yazın; -c unutulan yakalamanın /var/tmp\'yi doldurmasını önler. Yönetim portu trafiği 0.0 ile değil, -i mgmt ile yakalanır.' },
                { code: 'tmsh modify sys db tm.rstcause.log value disable', desc: 'Tanı ayarını geri alın. tm.rstcause.pkt açtıysanız onu da kapatın: nedeni istemciye giden RST paketine yazar.' },
            ]
        },
        {
            title: 'Trafik Beklenmeyen Virtual Server\'a Gidiyor: Wildcard / Ağ VS Önceliği (K14800)', severity: 'warn', topic: 'adc', lab: 'f5-23',
            symptom: 'Yeni bir wildcard (0.0.0.0:any) ya da ağ (203.0.113.0/24) virtual server eklendikten sonra bazı istekler beklenen VS yerine başka bir VS\'ye düşüyor ya da tersi.',
            steps: [
                { code: 'tmsh list ltm virtual destination mask source', desc: 'Eşleşme sırası (K14800): önce hedef adres (en uzun maske kazanır: /32 > /24 > any), sonra kaynak adres (source; en uzun önek), en son port (belirli port > any). Port belirli diye bir ağ VS\'si host VS\'sini geçemez.' },
                { code: 'curl -v http://203.0.113.9/', desc: 'İstemciden deneyin; hangi VS\'nin karşıladığını istatistik artışıyla (show ltm virtual … Total Connections) ya da bağlantı tablosundan (show sys connection cs-server-addr …) görün.' },
                { code: 'tmsh show sys connection cs-server-addr 203.0.113.9', desc: 'Bağlantının hangi virtual server üzerinden (Virtual Path) kurulduğunu gösterir (all-properties).',
                  fix: [{ cause: 'Belirli bir hizmet için daha özel bir VS gerekiyor', cmd: 'tmsh create ltm virtual vs_app9 destination 203.0.113.9:443 pool app_pool profiles add { http clientssl } source-address-translation { type automap }' },
                        { cause: 'Yalnız belirli istemci ağı için ayrı davranış (source ile)', cmd: 'tmsh modify ltm virtual vs_partner source 198.51.100.0/24' }] },
            ]
        },
        {
            title: 'HTTPS Sertifika Hatası ya da SSL Sonrası Site Açılmıyor: Zincir, Ad, Anahtar ve server-ssl', severity: 'err', topic: 'adc', lab: 'f5-24',
            symptom: 'Bazı istemciler (mobil, API, curl) "sertifikaya güvenilmiyor / unable to get local issuer" diyor; ya da HTTPS\'e geçildikten sonra 400, reset ya da el sıkışma hatası alınıyor.',
            steps: [
                { code: 'curl -v --resolve app.lab.example:443:203.0.113.100 https://app.lab.example/', desc: 'İstemci tarafı doğrulama. (60) unable to get local issuer certificate: ara sertifika gönderilmiyor. (60) no alternative certificate subject name: istemcinin yazdığı ad SAN\'da yok. (35) wrong version number: VS\'de client-ssl yok. 400 "plain HTTP to an SSL-enabled server port": sunucu bacağında server-ssl eksik.',
                  fix: [{ cause: 'Ara sertifika (chain) eksik', cmd: 'tmsh modify ltm profile client-ssl app_clientssl cert-key-chain modify { app.lab.example { chain intermediate-ca.crt } }' },
                        { cause: 'Sunucular HTTPS bekliyor, server-ssl yok (400)', cmd: 'tmsh create ltm profile server-ssl app_serverssl defaults-from serverssl\ntmsh modify ltm virtual vs_https profiles add { app_serverssl }' },
                        { cause: 'VS\'de client-ssl yok (wrong version number)', cmd: 'tmsh modify ltm virtual vs_https profiles add { app_clientssl }' }] },
                { code: 'openssl s_client -connect 203.0.113.100:443 -servername app.lab.example', desc: '"Certificate chain" bloğunda yalnız 0 numaralı satır varsa zincir eksiktir (Verify return code: 21). -servername SNI\'yi gönderir; birden çok client-ssl profili olan VS\'de hangi sertifikanın döndüğünü gösterir.' },
                { code: 'tmsh list sys file ssl-cert app.lab.example.crt subject issuer subject-alternative-name expiration-string', desc: 'Sertifikanın adları (SAN), vereni ve bitiş tarihi. Veren bir ara CA ise o sertifika da yüklenip profilde chain olarak verilmelidir.' },
                { code: 'tmsh list ltm profile client-ssl app_clientssl cert-key-chain', desc: 'Profilde doğru cert, key ve chain üçlüsü var mı? Başka sertifikanın anahtarı seçilirse "01070317:3: profile …\'s key and certificate do not match". Aynı VS\'de birden çok client-ssl profili varsa biri sni-default true olmalı (0107149c).' },
            ]
        },
        {
            title: 'iRule Çalışmıyor, Kaydedilmiyor ya da Bağlantıyı Sıfırlıyor: 01070151, 01070394 ve 01220001', severity: 'err', topic: 'adc', lab: 'f5-31',
            symptom: 'Yeni iRule kaydedilmiyor, virtual server\'a bağlanmıyor, hiç tetiklenmiyor gibi görünüyor ya da bağlandıktan sonra bazı istekler "connection reset" alıyor.',
            steps: [
                { code: 'tmsh list ltm virtual vs_web rules profiles', desc: 'Kural gerçekten bu VS\'ye bağlı mı? HTTP_* olayı kullanan kural HTTP profili olmayan VS\'ye bağlanamaz: "01070394:3: HTTP_REQUEST event in rule (/Common/x) requires an associated HTTP or FASTHTTP profile on the virtual server (/Common/vs)."',
                  fix: [{ cause: 'VS\'de HTTP profili yok', cmd: 'tmsh modify ltm virtual vs_web profiles add { http }' }, { cause: 'Kural VS\'ye bağlı değil (mevcutları koruyarak ekle)', cmd: 'tmsh modify ltm virtual vs_web rules add { r_kural }' }] },
                { code: 'tmsh show ltm rule r_kural', desc: 'Executions Total artıyor mu? Artmıyorsa olay tetiklenmiyor (yanlış olay, VS\'ye trafik gelmiyor ya da başka bir kural önce yanıt veriyor). Failures artıyorsa kural çalışırken hata veriyor.' },
                { code: 'grep -E "01220001|01070151" /var/log/ltm', desc: '01070151 kayıt hatasıdır: [undefined procedure: X] yazım hatası; [command is not valid in current event context (HTTP_RESPONSE)] istek komutunun yanıt olayında kullanılması (HTTP::uri\'yi HTTP_REQUEST\'te bir değişkene alın); Unable to find pool (p) olmayan pool adı. 01220001 TCL error çalışma hatasıdır ve bağlantı sıfırlanır: "no such variable" tanımsız değişken; "Multiple redirect/respond invocations not allowed" aynı istekte ikinci yanıt.',
                  fix: [{ cause: 'Tanımsız değişken (bazı yollarda set edilmiyor)', cmd: '# değişkeni her yolda başlatın ya da okumadan önce sınayın:\nif { [info exists user] } { log local0. "kullanıcı: $user" }' }, { cause: 'İkinci respond/redirect', cmd: '# ilk yanıttan sonra olaydan çıkın:\nHTTP::respond 403 content "Erişim yok"\nreturn' }] },
                { code: 'tmsh modify sys db tm.rstcause.log value enable', desc: 'Sıfırlamaların nedeni loga yazılır: "01230140:3: RST sent from … iRule execution error" satırı sorunun iRule\'da olduğunu kanıtlar. İş bitince disable yapın.' },
                { code: 'tmsh list ltm rule r_kural', desc: 'Birden çok kural aynı olayı kullanıyorsa sırayı priority belirler (küçük önce, varsayılan 500; eşitse VS\'deki sıra). Bir kuralın verdiği pool kararını sonraki kural ezebilir.' },
            ]
        },
        {
            title: 'PUT / DELETE / WebDAV İstekleri Sıfırlanıyor, GET Çalışıyor: HTTP Profili Metot Politikası', severity: 'err', topic: 'adc', lab: 'f5-60',
            symptom: 'Web sayfaları açılıyor ama API\'nin PUT/DELETE istekleri ya da WebDAV istemcisi (PROPFIND) "connection reset" alıyor; sunucu loglarında bu istekler hiç görünmüyor.',
            steps: [
                { expect: 'bad', code: 'curl -v -X PUT http://203.0.113.100/api/kayit/5', desc: '"Recv failure: Connection reset by peer" ve sunucu logunda iz yoksa istek BIG-IP\'de kesiliyor. 405 ya da 501 alıyorsanız istek sunucuya ulaşmış demektir: metodu sunucu reddediyor, BIG-IP değil.',
                  sample: '> PUT /api/kayit/5 HTTP/1.1\n> Host: 203.0.113.100\n> User-Agent: curl/7.81.0\n>\n* Recv failure: Connection reset by peer\ncurl: (56) Recv failure: Connection reset by peer\n\n# Yanıt satırı (< HTTP/1.1 …) hiç yok: bağlantı yanıt gelmeden kesildi.\n# Karşılaştırın: sunucu reddetseydi "< HTTP/1.1 405 Method Not Allowed" ve "< Server: Apache" görürdünüz.' },
                { code: 'tmsh list ltm virtual vs_web profiles rules policies', desc: 'VS hangi HTTP profilini kullanıyor; metodu kesen bir iRule (HTTP::method … reject) ya da LTM policy var mı?' },
                { code: 'tmsh list ltm profile http http_web enforcement', desc: 'known-methods listesinde isteğin metodu var mı? Yoksa istek unknown-method kuralına düşer; "unknown-method reject" bağlantıyı sıfırlar (K85840901). Varsayılan liste CONNECT DELETE GET HEAD LOCK OPTIONS POST PROPFIND PUT TRACE UNLOCK, varsayılan kural allow.',
                  fix: [{ cause: 'Metot listede yok, unknown-method reject', cmd: 'tmsh modify ltm profile http http_web enforcement { known-methods add { PUT DELETE } }' },
                        { cause: 'API ve web aynı profili paylaşıyor: API VS\'i için ayrı profil', cmd: 'tmsh create ltm profile http http_api defaults-from http enforcement { known-methods replace-all-with { GET HEAD POST PUT DELETE OPTIONS } unknown-method reject }\ntmsh modify ltm virtual vs_api profiles delete { http_web } profiles add { http_api }' }] },
                { code: 'tmsh list ltm rule', desc: 'VS\'deki kurallarda HTTP::method ile reject/drop ya da HTTP::respond 405 var mı? iRule sıfırlamasında "tm.rstcause.log" açıkken /var/log/ltm\'de "iRule execution error" ya da kuralın kendi log satırı görünür.' },
                { code: 'tmsh list ltm virtual vs_web policies', desc: 'VS\'ye ASM (WAF) bağlıysa izinsiz metot "Illegal method" ihlali üretir; ancak ASM bağlantıyı sıfırlamaz, blok sayfasını HTTP 200 ile döner (K41633422). Reset görüyorsanız neden büyük olasılıkla HTTP profili ya da iRule\'dur.' },
            ],
            quiz: [
                { q: 'PUT isteği "405 Method Not Allowed" ve "Server: Apache" ile dönüyor. Metodu kim reddetti?', choices: [['srv', 'Arka uç sunucu: istek BIG-IP\'den geçti'], ['prof', 'BIG-IP HTTP profili'], ['asm', 'ASM']], correct: 'srv', why: 'HTTP profili reddi yanıt üretmez, bağlantıyı sıfırlar; Server: Apache yanıtın sunucudan geldiğini gösterir.' },
                { q: 'known-methods listesinden TRACE\'i çıkardınız ama unknown-method allow kaldı. Sonuç?', choices: [['same', 'Hiçbir şey değişmez: TRACE artık bilinmeyen metot olarak yine izinli'], ['blk', 'TRACE engellenir'], ['err', 'Profil kaydedilmez']], correct: 'same', why: 'Listeden çıkarmak yalnız hangi kuralın uygulanacağını değiştirir; engellemek için unknown-method reject gerekir.' },
                { q: 'Varsayılan "http" profilinde metot listesini daraltmanın riski?', choices: [['all', 'Bu profili kullanan tüm VS\'ler etkilenir'], ['none', 'Risk yok'], ['sync', 'HA eşitlemesi bozulur']], correct: 'all', why: 'Değişiklikler defaults-from ile türetilmiş özel profilde yapılır.' },
            ]
        },
        {
            title: 'SSO Sonrası Bazı Kullanıcılar Siteye Giremiyor (Bağlantı Sıfırlandı): Başlık Boyutu ve Sayısı', severity: 'err', topic: 'adc', lab: 'f5-62',
            symptom: 'Tek oturum açma (SSO) ya da çok sayıda çerez biriktiren kullanıcılar "bağlantı sıfırlandı" hatası alıyor; aynı sayfa başka kullanıcılar ve gizli pencerede sorunsuz açılıyor.',
            steps: [
                { expect: 'bad', code: 'grep 011f0005 /var/log/ltm', desc: '"HTTP header (N) exceeded maximum allowed size of M" satırı istek (ya da yanıt) başlıklarının profil sınırını aştığını gösterir; N gelen boyut, M sınırdır (K8482). Satırdaki vip ve profile alanları hangi VS ve profil olduğunu söyler.',
                  sample: 'Sep 26 09:14:02 bigip-a.lab.example err tmm1[11925]: 011f0005:3: HTTP header (20211) exceeded maximum allowed size of 16384 (Client side: vip=vs_web profile=http_web pool=web_pool)\n\n# 20211: bu isteğin başlık boyutu (istek satırı dahil)\n# 16384: http_web profilindeki max-header-size\n# Client side: istemciden gelen istek; "Server side" olsaydı sunucunun yanıt başlıkları büyük demekti',
                  fix: [{ cause: 'max-header-size düşük (varsayılan 32768)', cmd: 'tmsh modify ltm profile http http_web enforcement { max-header-size 32768 }' }] },
                { code: 'tmsh list ltm profile http http_web enforcement', desc: 'max-header-size (varsayılan 32768 bayt) ve max-header-count (varsayılan 64) değerleri. Değer, logdaki gerçek boyuta makul pay eklenerek seçilir; sınırı ölçüsüzce büyütmek bellek ve saldırı yüzeyi demektir.',
                  fix: [{ cause: 'Başlık sayısı sınırı (çok sayıda çerez/başlık, K000161470)', cmd: 'tmsh modify ltm profile http http_web enforcement { max-header-count 128 }' }] },
                { code: 'curl -I -b /var/tmp/sorunlu_kullanici_cerezleri.txt http://203.0.113.100/', desc: 'Sorunu yaşayan kullanıcının çerezleriyle tekrar deneyin (tarayıcı geliştirici araçlarından dışa aktarılabilir). Kendi küçük çerezli tarayıcınızla yapılan test "çalışıyor" yanıltmasına yol açar.' },
                { code: 'grep -c 011f0005 /var/log/ltm', desc: 'Düzeltmeden sonra sayı artmaya devam ediyor mu? Artıyorsa başka bir VS/profil de etkileniyor olabilir (satırlardaki vip= alanına bakın).' },
            ],
            quiz: [
                { q: 'max-header-size neyi sınırlar?', choices: [['all', 'İstek satırı dahil tüm başlıkların toplam boyutunu'], ['cookie', 'Yalnız Cookie başlığını'], ['body', 'İstek gövdesini']], correct: 'all', why: 'Tek bir büyük çerez de, çok sayıda küçük başlık da toplamı aşabilir.' },
                { q: 'Sınır aşıldığında istemci ne görür?', choices: [['rst', 'Bağlantı sıfırlanır'], ['431', '431 hata sayfası'], ['413', '413 hata sayfası']], correct: 'rst', why: 'BIG-IP bu durumda yanıt üretmez; TCP RST gönderir ve 011f0005 loglar (K8482).' },
            ]
        },
        {
            title: 'ASM: "The requested URL was rejected… Your support ID is" Sayfası: Engellenen İsteği Bul ve Yanlış Pozitifi Ayıkla', severity: 'warn', topic: 'adc', lab: 'f5-65',
            symptom: 'Kullanıcı bir form gönderince ya da belirli bir sayfada "The requested URL was rejected. Please consult with your administrator. Your support ID is: …" sayfası görüyor.',
            steps: [
                { expect: 'bad', code: 'Security ›› Event Logs : Application : Requests  (filtre: Support ID)', desc: 'Kullanıcının verdiği support ID ile isteği bulun. İstek detayında policy adı, ihlaller (violations), istek metni ve engellenip engellenmediği görünür.',
                  sample: 'Support ID : 1234567890123456789\nPolicy     : /Common/waf_app\nStatus     : Blocked\nViolations : Illegal meta character in parameter value\n             Attack signature detected\nParameter  : yorum\nIstek      : POST /form/gonder  yorum=Fiyat\'lar <b>çok</b> iyi\n\n# Okuma: "yorum" alanındaki kesme işareti ve <b> etiketi meta karakter/imza ihlali üretmiş.\n# Karar: metin düzenleyicili bir yorum alanı için bu meşru olabilir (yanlış pozitif).' },
                { code: 'İstek detayı › Violations › ihlalin ayrıntısı (imza adı/ID, parametre, URL)', desc: 'Karar: bu meşru kullanıcı davranışı mı (yanlış pozitif), gerçek saldırı mı? Aynı ihlal çok sayıda farklı kullanıcıda ve normal iş akışında görülüyorsa yanlış pozitif olasılığı yüksektir.',
                  fix: [{ cause: 'Yanlış pozitif: istisnayı en dar kapsamda yapın (yalnız o parametre / URL; tüm policy\'de imzayı kapatmayın)' }, { cause: 'Gerçek saldırı: engel doğru; kaynak IP ve benzer istekleri inceleyin' }] },
                { code: 'Policy Building › Traffic Learning', desc: 'ASM aynı ihlal için öneri (suggestion) üretmiş olabilir; öneriyi kabul etmeden önce kapsamını okuyun (ör. "parametrede meta karaktere izin ver" mi, "imzayı tüm policy\'de kapat" mı).' },
                { code: 'tmsh publish asm policy /Common/waf_app', desc: 'Policy değişiklikleri yayınlanmadan (Apply Policy) etkin olmaz. Yayından sonra kullanıcıdan aynı işlemi tekrarlamasını isteyin ve yeni istek logunu kontrol edin.' },
            ],
            quiz: [
                { q: 'Yanlış pozitifte en iyi istisna?', choices: [['narrow', 'İmzayı/ihlali yalnız ilgili parametre ya da URL için devre dışı bırakmak'], ['global', 'İmzayı tüm policy\'de kapatmak'], ['transp', 'Policy\'yi transparent moda almak']], correct: 'narrow', why: 'Geniş istisna, aynı saldırıyı sitenin geri kalanında da serbest bırakır.' },
                { q: 'Kullanıcının verdiği support ID ne işe yarar?', choices: [['find', 'Engellenen isteği istek logunda bulmaya'], ['auth', 'Kullanıcının kimliğini doğrulamaya'], ['unblock', 'İsteği otomatik olarak serbest bırakmaya']], correct: 'find', why: 'Support ID, istek loğundaki kaydın anahtarıdır.' },
            ]
        },
        {
            title: 'İzleme Sistemi "200 OK" Görüyor ama Kullanıcı Engellendiğini Söylüyor: ASM Blok Sayfası', severity: 'warn', topic: 'adc', lab: 'f5-65',
            symptom: 'Sentetik izleme ve erişim logları başarılı (200) gösteriyor; kullanıcılar ise işlem yapamadığını, bir "rejected" sayfası gördüğünü söylüyor.',
            steps: [
                { expect: 'bad', code: 'curl -v "http://203.0.113.100/ara?q=%27%20OR%201%3D1"', desc: 'Yanıtın durum satırı ile gövdeyi birlikte okuyun: ASM varsayılan blok sayfası HTTP 200 ile döner (K41633422). Yalnız koda bakan izleme bunu başarı sayar.',
                  sample: '< HTTP/1.1 200 OK\n< Content-Type: text/html; charset=utf-8\n< Cache-Control: no-cache\n< Connection: close\n<\n<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.<br><br>Your support ID is: 1234567890123456789 …\n\n# Kod 200 ama gövde bir blok sayfası: koda değil içeriğe bakan bir kontrol gerekir.' },
                { code: 'Security ›› Event Logs : Application : Requests', desc: 'Aynı zaman aralığında engellenen istekler var mı? Blok oranı ile izleme sonuçlarını karşılaştırın.' },
                { code: 'Security ›› Application Security : Policy : Response and Blocking Pages', desc: 'Blok sayfasının durum kodu ve içeriği buradan özelleştirilebilir (varsayılan 200; K35004154). İzleme ve analitik için 403 gibi bir hata kodu dönmek daha anlaşılırdır.',
                  fix: [{ cause: 'İzleme yalnız koda bakıyor', cmd: '# izleme / monitor tarafında gövde kontrolü ekleyin (ör. "Request Rejected" metni görülürse başarısız say)' }, { cause: 'Blok yanıtı 200', cmd: '# Response and Blocking Pages\'te blok yanıtını 403 gibi bir kodla dönecek şekilde özelleştirin (K35004154), sonra policy\'yi yayınlayın:\ntmsh publish asm policy /Common/waf_app' }] },
            ],
            quiz: [
                { q: 'ASM varsayılan blok sayfası hangi HTTP koduyla döner?', choices: [['200', '200'], ['403', '403'], ['503', '503']], correct: '200', why: 'K41633422: engellenen istek varsayılan olarak 200 ile yanıtlanır; bu yüzden içerik kontrolü gerekir.' },
            ]
        },
        {
            title: 'WAF (ASM) Policy Var ama Hiçbir Şey Engellenmiyor: Bağlama, Blocking Modu, Staging ve Yayın', severity: 'err', topic: 'adc', lab: 'f5-64',
            symptom: 'Güvenlik testi bilinen saldırı kalıplarını (SQL enjeksiyonu, XSS) gönderiyor; istekler sunucuya ulaşıyor, blok sayfası hiç çıkmıyor.',
            steps: [
                { code: 'tmsh list ltm virtual vs_web policies profiles', desc: 'ASM policy VS\'ye profil olarak değil, "asm enable policy" eylemli bir LTM policy ile bağlanır; VS\'de websecurity profili de olmalı (K16303347). Liste boşsa policy hiçbir trafiği görmüyor.',
                  fix: [{ cause: 'Policy VS\'ye bağlı değil', cmd: 'tmsh create ltm policy /Common/Drafts/asm_waf_app controls add { asm } requires add { http } rules add { default { ordinal 1 actions add { 1 { asm enable policy /Common/waf_app } } } }\ntmsh publish ltm policy /Common/Drafts/asm_waf_app\ntmsh modify ltm virtual vs_web profiles add { websecurity } policies add { asm_waf_app }' }] },
                { code: 'tmsh list asm policy /Common/waf_app blocking-mode', desc: '"blocking-mode disabled" transparent modu demektir: ihlaller loglanır, hiçbir istek engellenmez. Rapid Deployment şablonu varsayılan olarak transparent başlar.',
                  fix: [{ cause: 'Policy transparent', cmd: 'tmsh modify asm policy /Common/waf_app blocking-mode enabled\ntmsh publish asm policy /Common/waf_app' }] },
                { code: 'Security ›› Application Security : Policy Building : Enforcement Readiness', desc: 'İmzalar ve varlıklar staging\'de (varsayılan 7 gün) ise ihlaller yalnız loglanır. Hazır olanlar "enforce" edilmeden engelleme olmaz.' },
                { code: 'tmsh list ltm virtual vs_web profiles', desc: 'HTTPS trafiği BIG-IP\'de client-ssl ile çözülmüyorsa (SSL passthrough) WAF şifreli içeriği göremez; HTTP profili de olmalı.' },
                { code: 'tmsh publish asm policy /Common/waf_app', desc: 'Yapılan ayar değişiklikleri yayınlanmadan etkin olmaz. Yayından sonra saldırı testini tekrarlayıp istek logunda "Blocked" durumunu arayın.' },
            ],
            quiz: [
                { q: 'ASM policy\'yi VS\'ye bağlamanın doğru yolu?', choices: [['ltmpol', '"asm enable policy" eylemli LTM policy + websecurity profili'], ['prof', 'profiles add { waf_app }'], ['rule', 'rules add { waf_app }']], correct: 'ltmpol', why: 'ASM policy bir profil değildir; K16303347.' },
                { q: 'Policy blocking modda ama saldırı yalnız loglanıyor. İlk bakılacak yer?', choices: [['stg', 'İlgili imza/varlık staging\'de mi (enforcement readiness)'], ['dns', 'DNS kaydı'], ['mon', 'Pool monitor']], correct: 'stg', why: 'Staging\'deki imza ihlal üretir ama engellemez.' },
            ]
        },
        {
            title: 'Monitor Kırmızı ama Sunucu Tarayıcıdan Açılıyor: send/recv, Host, Boş Satır, Port ve Kaynak IP', severity: 'err', topic: 'adc', lab: 'f5-66',
            symptom: 'Pool üyeleri (ya da biri) kırmızı/offline; uygulama ekibi sunucunun ayakta olduğunu, sağlık sayfasının tarayıcıdan açıldığını söylüyor.',
            steps: [
                { expect: 'bad', code: 'tmsh show ltm pool web_pool members', desc: 'Reason satırı monitorün gördüğünü söyler. "Response Code: 400 (Bad Request)": send dizgesi hatalı (HTTP/1.1\'de Host yok). "Response Code: 404/500": yanlış yol ya da uygulama hatası. "No successful responses received before deadline": istek boş satırla bitmiyor, yanıt yavaş ya da trafik engelleniyor. "Unable to connect; Connection refused": yanlış port.',
                  sample: 'Ltm::Pool Member: 10.64.30.50:80\n  Availability : offline\n  Reason       : /Common/mon_app: Response Code: 400 (Bad Request) @2026/09/26 10:25:07.\n\n# 400: sunucu isteği anlamadı → send dizgesini okuyun (Host başlığı, satır sonları)\n# Kod 200 ama yine offline ise recv dizgesi yanıtta bulunamıyordur' },
                { code: 'tmsh list ltm monitor http mon_app send recv recv-disable destination interval timeout', desc: 'send ham HTTP isteğidir: satırlar \\r\\n ile ayrılır, istek \\r\\n\\r\\n ile biter; HTTP/1.1\'de Host başlığı zorunludur (K2167, K13397). destination "*:8080" gibi bir alias port varsa monitor üyenin değil o portun yanıtına bakar. Önerilen timeout = 3 × interval + 1.',
                  fix: [{ cause: 'Host başlığı ya da son boş satır eksik', cmd: 'tmsh modify ltm monitor http mon_app send "GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n"' }, { cause: 'recv yanıtta yok (yanlış metin ya da 0K/OK gibi yazım)', cmd: 'tmsh modify ltm monitor http mon_app recv "200 OK"' }] },
                { code: "printf 'GET /health HTTP/1.1\\r\\nHost: app.lab.example\\r\\nConnection: close\\r\\n\\r\\n' | nc 10.64.30.50 80", desc: 'Monitorün gönderdiği isteğin aynısını BIG-IP bash\'ten elle gönderin; tarayıcı kendi doğru isteğini gönderdiği için onun açılması monitorün doğru olduğunu göstermez. Yanıtın ilk satırı ve recv dizgesinin gövdede olup olmadığına bakın.' },
                { code: 'tcpdump -ni 0.0:nnn host 10.64.30.50 and port 80', desc: 'Monitor istekleri BIG-IP\'nin sunucu ağındaki non-floating self IP\'sinden çıkar. SYN gidip yanıt gelmiyorsa sunucu güvenlik duvarı ya da yönlendirme bu adresi engelliyordur.' },
            ],
            quiz: [
                { q: 'Reason "Response Code: 400 (Bad Request)" diyor. En olası neden?', choices: [['host', 'send dizgesi HTTP/1.1 ama Host başlığı yok'], ['fw', 'Güvenlik duvarı'], ['down', 'Sunucu kapalı']], correct: 'host', why: '400 yanıtı sunucunun ayakta olduğunu ama isteği anlamadığını gösterir.' },
                { q: 'Bakıma alınacak sunucuyu, açık oturumları kesmeden devreden çıkarmak için?', choices: [['rd', 'recv-disable dizgesi (ya da üyeyi session disabled)'], ['del', 'Üyeyi pool\'dan silmek'], ['down', 'Üyeyi forced offline yapmak']], correct: 'rd', why: 'disabled: yeni bağlantı yok, mevcut oturumlar sürer; forced offline mevcutları da reddeder.' },
            ]
        },
        {
            title: 'Güvenlik Taraması: BIGipServer Çerezi İç Sunucu Adresini Açığa Çıkarıyor', severity: 'warn', topic: 'adc', lab: 'f5-67',
            symptom: 'Sızma testi ya da tarama aracı, "BIGipServer<pool>" çerezinin iç IP adresi ve port bilgisi içerdiğini raporluyor.',
            steps: [
                { expect: 'bad', code: 'curl -I http://203.0.113.100/', desc: 'Set-Cookie satırında BIGipServer<pool> değeri "sayı.sayı.0000" biçimindeyse şifresizdir: ilk sayı IP\'nin baytlarının ters sırayla yazılmışı, ikincisi baytları çevrilmiş porttur.',
                  sample: 'Set-Cookie: BIGipServerweb_pool=840843274.20480.0000; path=/; Httponly\n\n# 840843274 → 10.64.30.50 (10 + 64×256 + 30×65536 + 50×16777216)\n# 20480 → 0x5000 → baytları çevir → 0x0050 → port 80\n# Şifreli değer "!" ile başlar ve adres içermez' },
                { code: 'tmsh list ltm persistence cookie p_cookie cookie-encryption cookie-encryption-passphrase', desc: 'cookie-encryption disabled ise değer çözülebilir. Seçenekler: required (yalnız şifreli çerez), preferred (ikisi de), disabled.',
                  fix: [{ cause: 'Kesintisiz geçiş: önce preferred', cmd: 'tmsh modify ltm persistence cookie p_cookie cookie-encryption preferred cookie-encryption-passphrase <parola>' }, { cause: 'Eski çerezler yenilendikten sonra required', cmd: 'tmsh modify ltm persistence cookie p_cookie cookie-encryption required' }] },
                { code: 'tmsh run cm config-sync to-group <device-group>', desc: 'HA çiftinde parola iki cihazda aynı olmalı; aksi halde failover sonrası çerezler çözülemez ve kullanıcılar başka sunuculara dağılır.' },
            ],
            quiz: [
                { q: 'Doğrudan required\'a geçmenin riski?', choices: [['lost', 'Şifresiz çerezli kullanıcıların kalıcılığı kaybolur (oturum/sepet kopar)'], ['none', 'Risk yok'], ['rst', 'Bağlantılar sıfırlanır']], correct: 'lost', why: 'required eski çerezi tanımaz; geçiş preferred ile yapılır.' },
            ]
        },
        {
            title: 'ASM iRule Olayları Tetiklenmiyor: ASM_REQUEST_DONE Çalışmıyor ya da Özel Blok Sayfası Bağlantıyı Sıfırlıyor', severity: 'warn', topic: 'adc', lab: 'f5-68',
            symptom: 'VS\'ye ASM_REQUEST_DONE içeren bir iRule bağlandı ama log satırı hiç düşmüyor; ya da özel blok sayfası için yazılan kural, engellenen istekte bağlantıyı sıfırlıyor.',
            steps: [
                { code: 'tmsh list ltm virtual vs_web rules policies profiles', desc: 'Kural VS\'de mi, ASM politikası (asm enable eylemli LTM policy + websecurity profili) aynı VS\'ye bağlı ve yayınlanmış mı? Politika bağlı değilse ASM değerlendirmesi olmaz, ASM_* olayları da olmaz.' },
                { code: 'tmsh show ltm rule r_asm', desc: '"Ltm::Rule Event: r_asm:ASM_REQUEST_DONE" satırında Executions Total 0 ise olay hiç tetiklenmiyordur. En sık neden: politikada "Trigger ASM iRule Events" kapalı ya da Compatibility mode (GUI: Security › Application Security › Policy › Policy Properties). Olay ihlal olmasa da her istekte tetiklenmelidir.',
                  sample: '------------------------------------------------------------\nLtm::Rule Event: r_asm:ASM_REQUEST_DONE\n------------------------------------------------------------\nPriority                         500\nExecutions\n  Total                            0\n  Failures                         0\n\n# Total 0: olay çalışmıyor → Trigger ASM iRule Events (Normal mode) kontrol' },
                { code: 'grep -e "Invalid action" -e 01220001 /var/log/ltm', desc: 'HTTP::respond ASM olaylarında geçerli değildir; engellenen istekte bağlantı sıfırlanır ve "http_process_state_prepend - Invalid action" görülür. Yanıtı HTTP_REQUEST_SEND\'e taşıyın (ASM_REQUEST_DONE\'da bayrak + ASM::unblock).',
                  fix: [{ cause: 'HTTP::respond ASM_REQUEST_DONE içinde', cmd: 'tmsh modify ltm rule r_asm when ASM_REQUEST_DONE { if { [ASM::status] eq "blocked" } { set sid [ASM::support_id] ; ASM::unblock } } when HTTP_REQUEST_SEND { if { [info exists sid] } { HTTP::respond 403 content "Istek engellendi. Destek numarasi: $sid" ; TCP::close } }' }] },
                { code: 'tmsh list ltm rule r_asm', desc: 'ASM::unblock yalnız engellenecek istekte ve yalnız özel yanıt verilecekse çağrılmalı; koşulsuz unblock tüm saldırıları sunucuya iletir. ASM::violation / support_id / status yalnız ASM olaylarında geçerlidir (başka olayda kayıt 01070151 ile reddedilir).' },
            ],
            quiz: [
                { q: 'Kural VS\'de, politika bağlı ve yayınlı; ama ASM_REQUEST_DONE sayacı 0. İlk bakılacak ayar?', choices: [['trig', 'Politikada Trigger ASM iRule Events (Normal mode)'], ['prio', 'Kural priority değeri'], ['snat', 'SNAT']], correct: 'trig', why: 'Ayar kapalıyken ASM_* olayları tetiklenmez.' },
                { q: 'Engellenen istekte özel sayfa neden bağlantıyı sıfırlıyor olabilir?', choices: [['resp', 'HTTP::respond ASM_REQUEST_DONE içinde çağrılmış'], ['sid', 'support ID çok uzun'], ['rule', 'Kural iki when içeriyor']], correct: 'resp', why: 'Yanıt HTTP_REQUEST_SEND\'de verilir.' },
            ]
        },
        {
            title: 'Yedek Sunuculara Trafik Gitmiyor ya da Hiç Geri Dönmüyor: Priority Group, min-active-members, Slow Ramp ve Persistence', severity: 'warn', topic: 'adc', lab: 'f5-69',
            symptom: 'Birincil sunucular düştüğü hâlde yedek sunucular trafik almıyor; ya da birincil sunucular döndüğü hâlde kullanıcılar yedekte kalıyor, yedek her zaman biraz trafik alıyor.',
            steps: [
                { code: 'tmsh list ltm pool web_pool members min-active-members slow-ramp-time', desc: 'min-active-members 0 ise priority group etkisizdir (tüm üyeler trafik alır). Üyelerin priority-group değerleri doğru mu (büyük sayı = yüksek öncelik)?',
                  fix: [{ cause: 'min-active-members 0 (özellik kapalı)', cmd: 'tmsh modify ltm pool web_pool min-active-members 1' }] },
                { code: 'tmsh show ltm pool web_pool members', desc: '"Priority Groups: 10/5/5 (highest/current/lowest)" current değeri o an kullanılan en alt grubu gösterir. Birincil üyeler "available" ama current düşük kalıyorsa geri dönüşü geciktiren bir ayar vardır.',
                  sample: 'Ltm::Pool: web_pool\n  Minimum Active Members : 1\n  Priority Groups        : 10/5/5 (highest/current/lowest)\n  Available Members      : 3\n\n# current 5: yedek grup da trafik alıyor' },
                { code: 'tmsh list ltm pool web_pool slow-ramp-time', desc: 'slow-ramp-time (varsayılan 10) süren üye tam aktif sayılmaz; yeterli üst grup üyesi varken alt gruba trafik gidebilir. Priority group kullanan pool\'larda 0 önerilir (K000149891, K16242).',
                  fix: [{ cause: 'Slow ramp priority group ile çakışıyor', cmd: 'tmsh modify ltm pool web_pool slow-ramp-time 0' }] },
                { code: 'tmsh show ltm persistence persist-records pool web_pool', desc: 'Persistence kaydı priority group kararından önce uygulanır: yedeğe düşen istemci kayıt bitene kadar orada kalır. Kalıcılığı kaldırmak yerine eski kayıtları silin.',
                  fix: [{ cause: 'Yedeğe yapışan kalıcılık kayıtları', cmd: 'tmsh delete ltm persistence persist-records pool web_pool' }] },
            ],
            quiz: [
                { q: 'Birincil grup döndü ama bazı kullanıcılar saatlerdir yedekte. En olası neden?', choices: [['per', 'Persistence kayıtları yedeği gösteriyor'], ['mon', 'Monitor'], ['ramp', 'Slow ramp saatlerce sürer']], correct: 'per', why: 'Slow ramp saniyeler sürer; saatlerce süren yapışma kalıcılıktır.' },
            ]
        },
        {
            title: 'Bakımdan Dönen Sunucu Anında Boğuldu: Least Connections ve Slow Ramp', severity: 'warn', topic: 'adc', lab: 'f5-70',
            symptom: 'Bakımdan dönen (enabled yapılan) üye birkaç saniyede yüzlerce bağlantı alıyor; uygulama havuzu doluyor, sunucu yanıt veremez hâle geliyor.',
            steps: [
                { code: 'tmsh list ltm pool web_pool load-balancing-mode slow-ramp-time', desc: 'least-connections-member + slow-ramp-time 0: yeni dönen üyenin bağlantısı 0 olduğu için tüm yeni bağlantılar ona gider.',
                  fix: [{ cause: 'Slow ramp kapalı', cmd: 'tmsh modify ltm pool web_pool slow-ramp-time 60' }] },
                { code: 'tmsh show ltm pool web_pool members', desc: 'Current Connections sütunu: dönen üye ile diğerleri arasındaki fark ne kadar büyükse, slow ramp bittikten sonra da o kadar uzun süre yeni bağlantılar ona yönelir. Kapasite sınırı gerekiyorsa üyeye connection-limit ya da ratio yöntemi düşünülür.' },
            ],
            quiz: [
                { q: 'slow-ramp-time ne yapar?', choices: [['ramp', 'Yeni etkinleşen/up olan üyenin payını süreyle orantılı sınırlar'], ['delay', 'Üyeyi süre dolana kadar tamamen kapalı tutar'], ['bal', 'Bağlantı sayılarını eşitler']], correct: 'ramp', why: 'Süre dolunca üye tam pay alır; dengeleme yapmaz.' },
            ]
        },
];
})();
