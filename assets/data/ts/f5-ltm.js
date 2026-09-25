'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (f5-ltm) ───────────────────────────
// Kaynak: CLI Lab arıza bulguları (assets/data/labs/f5.js) ve araştırma notları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?, steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
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
                { code: 'tmsh list sys httpd allow\ntmsh list sys sshd allow', desc: 'Yöneticinin kaynak adresi (ya da ağı) listede mi? "replace-all-with" ile yapılan bir değişiklik kendi yönetim ağını dışarıda bırakmış olabilir. Liste yönetim IP\'sine ve self IP\'lere gelen yönetim bağlantılarının hepsine uygulanır.',
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
    ];
})();
