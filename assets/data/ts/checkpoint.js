'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (checkpoint) ───────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
// Komutlar Gaia R81.x içindir. clish komutları gw> isteminde, fw / cphaprob / vpn / tcpdump gibi
// teşhis araçları expert kabuğunda çalışır. Gaia OS ayarı (arayüz, rota, DNS, NTP) clish'te yapılır ve
// save config ile kalıcı olur. Kural, NAT, anti-spoofing topolojisi ve VPN community ise politikanın
// parçasıdır: SmartConsole'da değiştirilir ve politika kurulur (Install Policy); gateway CLI'dan düzeltilmez.
// Sıra önemli: ilk dört senaryo (100-103) hub'daki 0-3 numaralı senaryoların yerini alır.
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['checkpoint'] = [
        {
            title: 'Trafik Geçmiyor: fw stat, zdebug drop ve Dönüş Rotasıyla Düşme Nedenini Bulmak', severity: 'err', topic: 'traffic', lab: 'cp-03', replaces: 'Paket Dusuyor — Neden?',
            symptom: 'Yeni kat ağındaki bir istemci (10.64.20.50) DMZ\'deki web sunucusuna (172.24.50.10:443) bağlanamıyor, eski kat ağı sorunsuz. SmartLog\'da anlamlı bir drop kaydı yok. Gateway\'in paketi düşürüp düşürmediğini ve nedenini görmek gerekiyor.',
            steps: [
                { code: 'fw stat', desc: 'Expert kabuğunda ilk komut. POLICY sütunu gateway\'de kurulu politikanın adıdır, DATE sütunu ne zaman kurulduğunu gösterir. SmartConsole\'da eklenen kural politika kurulmadan gateway\'e ulaşmaz: tarih son değişiklikten eskiyse sorun buradadır. InitialPolicy ya da defaultfilter görüyorsanız gerçek politika hiç yüklenmemiştir ("Politika Kurulu Değil" senaryosu).',
                  fix: [{ cause: 'Kural SmartConsole\'da var ama kurulmamış: SmartConsole\'da Publish, ardından Install Policy ile bu gateway\'e kurun. fw stat\'taki tarih güncellenmeli' }] },
                { code: 'fw ctl zdebug drop | grep 10.64.20.50', desc: 'Kernel\'in düşürdüğü her paketi nedeniyle birlikte canlı yazar. Filtresiz çalıştırmayın: yoğun cihazda satırlar akıp gider ve CPU yükü artar. Trafiği üretip birkaç saniye izleyin, Ctrl+C ile durdurun. Satırın sonundaki "Reason:" kısmını okuyun. "Rulebase drop - rule N": paket N numaralı kurala düştü (çoğunlukla sondaki Cleanup). "Address spoofing": kaynak adres, paketin geldiği arayüzün topolojisinde tanımlı değil. "First packet isn\'t SYN": bağlantının SYN paketi bu gateway\'den geçmemiş (asimetrik yol ya da süresi dolmuş bağlantı). Hiç satır gelmiyorsa gateway bu paketi düşürmüyordur: sonraki adımdaki dönüş yoluna bakın.',
                  fix: [{ cause: 'Rulebase drop - rule N (Cleanup): SmartConsole\'da kaynağı kapsayan bir izin kuralı yazın ya da kaynak ağı mevcut kuralın grubuna (ör. LAN-Nets) ekleyin, Cleanup\'ın üstünde olduğundan emin olun ve politikayı kurun' },
                        { cause: 'Address spoofing: SmartConsole\'da gateway nesnesi → Network Management → eth2 → Topology\'de bu arayüzün arkasındaki ağlar grubuna 10.64.20.0/24\'ü ekleyin ve politikayı kurun. Anti-spoofing\'i kapatmak ya da Detect\'e almak sorunu gizler, çözmez' },
                        { cause: 'First packet isn\'t SYN: gidiş ve dönüş farklı yollardan geçiyor. İki yönün de bu gateway\'den geçmesi için rotaları düzeltin (sonraki adım)' }] },
                { code: 'ip route get 10.64.20.50', desc: 'Kernel\'e gateway\'in bu istemciye hangi arayüzden ve hangi ağ geçidiyle döneceğini sorar (expert). Beklenen: "via 10.64.10.254 dev eth2". Yanıt "via 203.0.113.1 dev eth1" ise yeni kat ağına rota yoktur: yanıt paketleri varsayılan rotadan internete gider, istemci yanıtı hiç görmez ve zdebug\'da da iz kalmaz.',
                  fix: [{ cause: 'Yeni ağa rota yok: clish\'te statik rota ekleyin ve kaydedin (rota Gaia OS ayarıdır, politikada yaşamaz)', cmd: 'set static-route 10.64.20.0/24 nexthop gateway address 10.64.10.254 on\nsave config' }] },
                { code: 'show route', desc: 'clish\'te rota tablosu. Yeni rota "S 10.64.20.0/24 via 10.64.10.254" olarak görünmeli. Görünmüyorsa "Statik Rota Tanımlı Ama Trafik Gitmiyor" senaryosuna geçin. Rota eklendikten sonra anti-spoofing topolojisinin de bu ağı içermesi gerekir; yoksa bu kez "Address spoofing" düşmesi başlar.' },
                { code: 'fw ctl debug 0', desc: 'İş bitince kernel debug bayraklarını varsayılana döndürün. zdebug çıkarken kendi bayraklarını sıfırlar, ama başkasının açık bıraktığı debug\'ı da kapatmak iyi bir alışkanlıktır. fw unloadlocal ile politikayı kaldırıp denemek teşhis değildir: gateway\'i korumasız bırakır.' },
            ]
        },
        {
            title: 'ClusterXL Failover Oldu: Durum, pnote ve Kontrollü Geri Dönüş', severity: 'warn', topic: 'ha', lab: 'cp-05', replaces: 'ClusterXL Failover Oldu',
            symptom: 'İzleme sistemi kümenin aktif üyesinin değiştiğini bildirdi ya da kullanıcılar kısa bir kesinti yaşadı. Hangi üyenin neden devrettiğini, sorunun sürüp sürmediğini ve üyenin kümeye güvenle geri alınıp alınamayacağını anlamak gerekiyor.',
            steps: [
                { code: 'cphaprob stat', desc: 'Expert\'te küme modu, üyeler, yükleri ve durumları (clish karşılığı: show cluster state). HA modunda bir üye ACTIVE (%100), diğeri STANDBY olmalı. DOWN: üye trafik alamaz durumda. ACTIVE ATTENTION: üyede sorun var ama diğer üye daha kötü durumda olduğu için trafiği yine bu üye taşıyor; bu bir uyarıdır, normal değildir. READY: üye kümeye katılmaya hazır ama sürüm ya da yapılandırma farkı yüzünden aktif olamıyor. Alttaki "Active PNOTEs" satırı sorunu bildiren aygıtı (pnote) gösterir; sağlıklı kümede None olmalı.' },
                { code: 'cphaprob show_failover', desc: 'Son failover\'ların zamanını ve nedenini listeler. Nedeni izleme sisteminin bildirdiği saatle karşılaştırın: arayüz, fwd süreci ya da yönetimsel (ADMIN) devretme gibi.' },
                { code: 'cphaprob list', desc: 'Sorun bildiren kritik aygıtları (pnote) gösterir; tümünü görmek için cphaprob -l list. Sık görülenler: Interface Active Check (izlenen bir arayüz CCP paketi alamıyor), fwd (güvenlik duvarı süreci yanıt vermiyor), Synchronization (sync koptu), routed (yönlendirme süreci), ADMIN (biri clusterXL_admin down çalıştırmış).',
                  fix: [{ cause: 'ADMIN pnote\'u kalmış: bakım bitmiş ama üye kümeye geri alınmamış', cmd: 'clusterXL_admin up' }] },
                { code: 'cphaprob -a if', desc: 'İzlenen arayüzleri, durumlarını, sync arayüzünü (S işaretli) ve küme sanal IP\'lerini (VIP) listeler. DOWN görünen arayüz failover\'ın nedenidir: iki üyede de aynı arayüz aynı VLAN\'da olmalı ve CCP paketleri karşı üyeye ulaşmalı. Çıktı CCP modunu da (unicast/multicast/broadcast) gösterir; anahtar multicast\'i süzüyorsa arayüz DOWN görünür.',
                  fix: [{ cause: 'Arayüz linki gerçekten düşük: kabloyu ve anahtar portunu kontrol edin. "Link detected: no" fiziksel sorundur', cmd: 'ethtool eth2' },
                        { cause: 'Link var ama arayüz DOWN: iki üyenin bu arayüzleri aynı VLAN\'da değil ya da anahtar CCP trafiğini süzüyor. Anahtar ekibiyle port/VLAN yapılandırmasını karşılaştırın' }] },
                { code: 'cphaprob syncstat', desc: 'State sync istatistikleri. Kayıp ya da yeniden gönderilen sync paketlerinin sürekli artması, sync hattının sorunlu olduğunu gösterir; bu durumda failover\'da açık bağlantılar kopar. Çıktının biçimi sürüme göre değişir; sayaçları iki kez çalıştırıp artışa bakın. Sync arayüzü üyeler arasında doğrudan ya da ayrık bir VLAN üzerinden bağlanmalıdır.' },
                { code: 'clusterXL_admin down;clusterXL_admin up', desc: 'Kontrollü failover için olağan kullanım: iki komut tek satırda çalışır. down üyeye ADMIN pnote\'u koyar ve trafik diğer üyeye geçer; up pnote\'u hemen kaldırır, üye STANDBY olarak kümeye döner ve küme yedeksiz kalmaz. Kablo çekmek ya da cpstop kullanmak yerine bunu tercih edin. Uzun bakımda (üye bakım boyunca trafik devralmamalıysa) yalnız clusterXL_admin down kullanılır; bakımda yeniden başlatma olacaksa -p ile kalıcı yapılır ve bitince clusterXL_admin up -p ile geri alınır. Sonucu cphaprob stat ile doğrulayın. Geri gelen üyenin STANDBY kalması normaldir: varsayılan "Maintain current active Cluster Member" ayarı ikinci bir kesinti yaratmamak için yeni aktif üyeyi görevde tutar.' },
            ]
        },
        {
            title: 'Site-to-Site VPN Kurulmuyor: Faz 1 mi, Faz 2 mi? (vpn tu, IKE Günlüğü)', severity: 'err', topic: 'vpn', lab: 'cp-07', replaces: 'Site-to-Site VPN Kurulmuyor',
            symptom: 'Başka marka bir şube güvenlik duvarıyla (198.51.100.2) kurulan tünel çalışmıyor: LAN 10.64.10.0/24 ile şube 10.128.10.0/24 arasında trafik geçmiyor. Tünelin hangi aşamada kaldığını ve kök nedeni bulmak gerekiyor.',
            steps: [
                { code: 'vpn tu tlist', desc: 'Eş başına IKE ve IPsec SA\'ları tablo olarak gösterir (expert). Eşin satırı hiç yoksa faz 1 kurulmamıştır. IKE SA var ama IPsec SA yoksa sorun faz 2\'dedir (trafik seçicileri / encryption domain). İkisi de varsa tünel kuruludur; sorun kural, NAT ya da rotadadır.' },
                { code: 'vpn debug trunc', desc: 'IKE ve VPN günlüklerini sıfırlar ve debug\'ı açar; böylece yalnız yeni denemeyi okursunuz. Ardından LAN\'dan şubeye trafik üretin (ör. bir istemciden ping). IKEv2 ayrıntısı $FWDIR/log/ikev2.xmll, IKEv1 ayrıntısı $FWDIR/log/ike.elg dosyasına yazılır; ikisi de IKEView ile rahat okunur.' },
                { code: 'grep -i -E "NO_PROPOSAL_CHOSEN|AUTHENTICATION_FAILED|TS_UNACCEPTABLE" $FWDIR/log/ikev2.xmll', desc: 'Pazarlığın hangi bildirimle (notify) kesildiği kök nedeni söyler. NO_PROPOSAL_CHOSEN: şifreleme, bütünlük, DH grubu ya da IKE sürümü iki uçta aynı değil (faz 1; IKE_AUTH içindeyse faz 2 önerisi). AUTHENTICATION_FAILED: ön paylaşımlı anahtar ya da kimlik farklı. TS_UNACCEPTABLE: faz 2 trafik seçicisi karşı ucun beklediğiyle eşleşmiyor. Hiçbiri yoksa ve günlükte yalnız giden istekler varsa karşı uç yanıt vermiyordur: UDP 500/4500 yolda engelleniyor olabilir.',
                  fix: [{ cause: 'NO_PROPOSAL_CHOSEN: SmartConsole\'da VPN community → Encryption ayarlarını karşı uçla birebir eşleyin (ör. IKEv2, AES-256, SHA-256, DH 14; faz 2 için de aynı özen) ve politikayı kurun' },
                        { cause: 'AUTHENTICATION_FAILED: community\'deki paylaşılan anahtarı (Shared Secret) karşı uçla yeniden eşleyin; kopyalarken sona eklenen boşluk klasik hatadır' },
                        { cause: 'TS_UNACCEPTABLE: Check Point bitişik ağları birleştirip daha geniş bir seçici (ör. 10.64.0.0/16) önerebilir; başka marka cihazlar yalnız birebir seçiciyi kabul eder. Community\'de VPN Tunnel Sharing ayarını alt ağ çifti başına (One VPN tunnel per subnet pair) yapın ve encryption domain\'i karşı uçla birebir eşleyin' },
                        { cause: 'Yanıt yok: karşı ucun genel IP\'sine UDP 500 ve 4500 paketlerinin çıktığını görün; çıkıyor ama yanıt gelmiyorsa sorun yolda ya da karşı uçtadır', cmd: 'tcpdump -nni eth1 host 198.51.100.2 and udp' }] },
                { code: 'vpn debug ikeoff', desc: 'IKE debug\'ını kapatır; ardından vpn debug off ile VPN debug\'ını da kapatın. Açık kalan debug disk ve CPU tüketir.' },
                { code: 'vpn tu', desc: 'Düzeltmeyi SmartConsole\'da yapıp politikayı kurduktan sonra, eski SA\'ları temizleyip pazarlığı yeniden başlatmak için menüden ilgili eşin SA\'larını silin. SA silmek tek başına hiçbir yanlış ayarı düzeltmez; yalnız yeniden pazarlığı tetikler ve o eşle kurulu tüm tünelleri anlık keser.' },
            ]
        },
        {
            title: 'Gateway Yavaş: CPU, SecureXL, CoreXL ve Bağlantı Tablosu', severity: 'warn', topic: 'perf', lab: 'cp-06', replaces: 'Yuksek CPU / Yavaslik',
            symptom: 'Kullanıcılar genel yavaşlık ve ara ara kopmalar bildiriyor; kural ya da rota değişikliği yapılmamış. Yükün nerede olduğunu (genel CPU, tek çekirdek, hızlandırılmayan trafik, bağlantı tablosu) sırayla ayırmak gerekiyor.',
            steps: [
                { code: 'cpstat os -f cpu', desc: 'Toplam CPU kullanımı: kullanıcı, sistem, boşta (idle) yüzdeleri ve CPU sayısı. Idle yüksekse (ör. %90) sorun genel CPU tüketimi değildir. Toplam düşük görünse bile tek bir çekirdek %100 olabilir; bunu cpview gösterir.' },
                { code: 'cpview', desc: 'CPU, bellek, bağlantı, throughput ve blade durumunu tek ekranda canlı gösterir; CPU sekmesinde çekirdek bazında kullanım vardır. Sorun geçmişteyse cpview -t ile geçmiş kayıtlarda o saate gidilir. Tek çekirdeğin sürekli dolu, diğerlerinin boş olması tek büyük bir akışa (elephant flow) ya da dengesiz çekirdek atamasına işaret eder.' },
                { code: 'fwaccel stat', desc: 'SecureXL (hızlandırma) durumu. "Accelerator Status : on" olmalı. Kapalıysa tüm trafik yavaş yoldan (firewall kernel) geçer ve CPU hızla dolar.',
                  fix: [{ cause: 'SecureXL biri tarafından kapatılmış (fwaccel off): yeniden açın ve nedenini kayıtlardan sorun', cmd: 'fwaccel on' }] },
                { code: 'fwaccel stats -s', desc: 'Trafiğin ne kadarının hızlandırıldığını özetler: Accelerated (hızlı yol), PXL (orta yol, içerik denetimi) ve F2F (yavaş yol). F2F oranı yüksekse trafiğin büyük kısmı hızlandırılamıyordur; bunun nedeni çoğunlukla hızlandırmayı engelleyen kurallar ya da servislerdir. Oranlar tek başına iyi/kötü değildir; normal zamandaki değerle karşılaştırın.' },
                { code: 'fw ctl affinity -l -r', desc: 'Hangi CPU çekirdeğine neyin (arayüz kuyrukları / SND ve güvenlik duvarı örnekleri / fw_worker) atandığını gösterir. Yoğun arayüzlerin hepsi aynı çekirdeğe atanmışsa o çekirdek darboğaz olur. Çekirdek atamasını değiştirmek bakım penceresi gerektirir; önce kanıtı toplayın.' },
                { code: 'fw ctl multik stat', desc: 'CoreXL örnekleri (instance) başına bağlantı sayısı ve tepe değer. Bir örnekte bağlantı sayısı diğerlerinden çok yüksekse yük dengesizdir.',
                  fix: [{ cause: 'Tek büyük akış bir çekirdeği dolduruyor olabilir: ağır bağlantıları listeleyin, kaynak ve hedefi uygulama sahibiyle konuşun (yedekleme, çoğaltma trafiği gibi)', cmd: 'fw ctl multik print_heavy_conn' }] },
                { code: 'fw tab -t connections -s', desc: '#VALS anlık, #PEAK tepe bağlantı sayısıdır. Tablo sınırına yaklaşılırsa yeni bağlantılar düşer ve kullanıcı "ara ara kopuyor" der. Ani bir artış çoğunlukla tek bir kaynaktan gelen bağlantı selinden (zararlı yazılım, döngüye girmiş uygulama) kaynaklanır; kaynağı cpview\'in bağlantı ekranından ya da SmartLog\'dan bulun.' },
            ]
        },
        {
            title: 'NAT Uygulanmıyor ya da Paket Kayboluyor: fw monitor i / I / o / O Noktalarını Okumak', severity: 'err', topic: 'traffic', lab: 'cp-04',
            symptom: 'LAN\'daki bir istemci (10.64.10.60) internetteki bir sunucuya (198.51.100.25:443) bağlanamıyor. Kural izin veriyor gibi görünüyor. Paketin gateway içinde nereye kadar gittiğini ve kaynak adresin çevrilip çevrilmediğini görmek gerekiyor.',
            steps: [
                { code: 'fw monitor -e "accept host(198.51.100.25);"', desc: 'Her paketi gateway içindeki dört noktada gösterir: i (giriş, kural öncesi), I (giriş, kural sonrası), o (çıkış, NAT öncesi), O (çıkış, kablo tarafı). Filtreyi istemci yerine sunucu adresiyle yazın: Hide NAT\'tan sonra ve dönüşte istemcinin adresi değişir, sunucunun adresi iki yönde de sabittir. Okuma anahtarı: hiç satır yok = istek gateway\'e gelmiyor; yalnız i var = kural ya da anti-spoofing düşürüyor (nedeni zdebug söyler); O noktasında kaynak hâlâ 10.64.10.60 = Hide NAT uygulanmamış, internetten yanıt gelemez; O\'da kaynak 203.0.113.2 ve dönüş yok = sorun gateway\'den sonrasındadır.',
                  fix: [{ cause: 'Yalnız i var: düşme nedenini kernel\'e sorun', cmd: 'fw ctl zdebug drop | grep 10.64.10.60' },
                        { cause: 'O\'da özel kaynak adres: SmartConsole\'da LAN ağ nesnesinde "Add automatic address translation rules" → Hide → Hide behind the gateway seçin (ya da manuel NAT kuralı yazın) ve politikayı kurun' },
                        { cause: 'Hiç satır yok: istemcinin ağ geçidi ayarı, VLAN\'ı ve anahtar portu kontrol edilir; gateway sorunun parçası değildir' }] },
                { code: 'fw monitor -F "10.64.10.60,0,198.51.100.25,443,0" -F "198.51.100.25,443,0,0,0"', desc: 'R80.20 ve sonrası için -F süzgeci: "kaynak,kaynak port,hedef,hedef port,protokol" (0 = herhangi). -F tek yönlüdür; dönüşü görmek için ikinci bir -F verin. SecureXL açıkken de hızlandırılan paketleri gösterdiği için R81\'de tercih edilen biçimdir. Dönüşte hedef adres çevrilmiş (203.0.113.2) olacağından dönüş süzgecinde hedefi 0 bırakın.' },
                { code: 'tcpdump -nni eth1 host 198.51.100.25', desc: 'Dış arayüzden kabloya gerçekte ne çıktığını gösterir (Check Point kernel\'inin dışından). Çıkan paketin kaynağı gateway\'in genel adresi (203.0.113.2) olmalı. -nn ad ve port çözümlemesini kapatır. fw monitor gateway\'in içini, tcpdump kablodaki gerçeği gösterir; ikisi birlikte "nerede" sorusunu yanıtlar.' },
                { code: 'fw ctl arp', desc: 'Gateway\'in kendi adresi olmayan statik NAT adresleri (ör. 203.0.113.10 → 172.24.50.10 sunucu yayını) için proxy ARP kayıtlarını listeler. Çevrilmiş adres burada yoksa üst yönlendirici o adresin MAC\'ini bulamaz ve gelen trafik gateway\'e hiç ulaşmaz. Otomatik NAT\'ta bunu Global Properties → NAT → "Automatic ARP configuration" yapar.',
                  fix: [{ cause: 'Manuel NAT kuralı kullanılıyor ve proxy ARP yok: Gaia\'da proxy ARP ekleyin (SmartConsole Global Properties → NAT → "Merge manual proxy ARP configuration" de açık olmalı), ardından politikayı kurun. Sözdizimini sürümünüzün Gaia kılavuzunda doğrulayın', cmd: 'add arp proxy ipv4-address 203.0.113.10 interface eth1 real-ipv4-address 203.0.113.2\nsave config' }] },
            ]
        },
        {
            title: 'clish Değişikliği Yeniden Başlatmada Kayboldu (save config)', severity: 'warn', topic: 'ops', lab: 'cp-01',
            symptom: 'Bakım penceresinde ya da elektrik kesintisinde gateway yeniden başladı; geçen hafta eklenen statik rota, arayüz açıklaması ya da DNS ayarı gitmiş. Değişikliği yapan kişi komutların "çalıştığını" görmüştü.',
            steps: [
                { code: 'show config-state', desc: 'clish değişikliği anında çalışan sisteme uygulanır ama açılış yapılandırmasına yazılmaz. Bu komut "saved" ya da "unsaved" der. unsaved görüyorsanız şu anda da kaydedilmemiş değişiklik vardır ve bir sonraki yeniden başlatmada o da kaybolacaktır.',
                  fix: [{ cause: 'Kaydedilmemiş değişiklik var: bilerek yapıldığını doğrulayıp kaydedin', cmd: 'save config' }] },
                { code: 'show route static', desc: 'Kaybolan ayarın şu anki durumuna bakın (burada statik rotalar). Açılışta son save config ile kaydedilen yapılandırma yüklendiği için, kaydedilmemiş her değişiklik sessizce geri gider.',
                  fix: [{ cause: 'Rota kaybolmuş: yeniden ekleyin ve aynı oturumda kaydedin', cmd: 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on\nsave config' }] },
                { code: 'show configuration', desc: 'Kaydedilecek (çalışan) yapılandırmanın tamamını clish komutları biçiminde gösterir. Değişiklik öncesi ve sonrası bu çıktıyı saklamak, neyin kaybolduğunu karşılaştırmanın en kolay yoludur. Gaia Portal\'da (web arayüzü) yapılan değişiklikler otomatik kaydedilir; clish\'te ise her oturum save config ile bitmelidir.' },
                { code: 'save config', desc: 'Kayıt başarısızsa clish yapılandırma kilidinin başka bir oturumda olduğunu söyleyebilir: aynı anda Gaia Portal ya da başka bir clish oturumu açıksa kilit ondadır. Kilidi zorla almadan önce diğer yöneticiyle konuşun; o oturumun kaydedilmemiş işi kaybolabilir.',
                  fix: [{ cause: 'Kilit terk edilmiş bir oturumda kalmış: kilidi alın, sonra kaydedin', cmd: 'lock database override\nsave config' }] },
            ]
        },
        {
            title: 'Statik Rota Tanımlı Ama Trafik Gitmiyor', severity: 'err', topic: 'routing', lab: 'cp-02',
            symptom: 'Şube ağlarına (10.128.0.0/16) iç yönlendirici 10.64.10.254 üzerinden gidilmesi için clish\'te statik rota eklendi. Trafik yine gitmiyor ya da internete (varsayılan rotaya) kaçıyor.',
            steps: [
                { code: 'show route', desc: 'Rota tablosu. Bayraklar: C bağlı ağ, S statik. Eklediğiniz rota listede yoksa Gaia onu etkin saymıyordur. En sık iki neden: rota "off" olarak tanımlandı ya da sonraki atlama (10.64.10.254) hiçbir bağlı ağda değil. Sonraki atlamanın bulunduğu ağ C bayrağıyla görünmüyorsa arayüz kapalıdır ya da IP\'si yoktur.',
                  fix: [{ cause: 'Rota tanımlı değil ya da off: on ile yeniden tanımlayın ve kaydedin', cmd: 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on\nsave config' },
                        { cause: 'Sonraki atlamanın ağı yok: iç arayüz kapalı ya da adressiz. IP verip açın', cmd: 'set interface eth2 ipv4-address 10.64.10.1 mask-length 24\nset interface eth2 state on\nsave config' }] },
                { code: 'show route static', desc: 'Yalnız statik rotalar ve sonraki atlamaları. Yanlış sonraki atlama yazıldıysa burada görünür. Aynı hedefe ikinci bir sonraki atlama eklemek eskisini silmez; ikisi birden kalır.',
                  fix: [{ cause: 'Yanlış sonraki atlama: eskisini kapatıp doğrusunu ekleyin', cmd: 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.253 off\nset static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on\nsave config' }] },
                { code: 'ping 10.64.10.254', desc: 'Rota doğru görünse de sonraki atlama cevap vermiyor olabilir (kablo, VLAN, ARP). Sonraki atlamaya ping en hızlı sağlamadır. Yanıt yoksa sorun katman 2\'dedir; iç yönlendiricinin ICMP\'yi engelleyip engellemediğini de sorun.' },
                { code: 'ip route get 10.128.10.20', desc: 'Expert\'te belirli bir hedef için kernel\'in gerçek kararı (en uzun önek eşleşmesi). "via 10.64.10.254 dev eth2" görünmeli. Rota doğruysa ve trafik yine geçmiyorsa sıradaki şüpheliler güvenlik kuralı ve anti-spoofing\'dir: yeni ağı iç arayüzün topolojisine eklemeyi unutmayın ("Trafik Geçmiyor" senaryosu).' },
            ]
        },
        {
            title: 'Politika Kurulu Değil ya da Eski: InitialPolicy, defaultfilter ve SIC', severity: 'err', topic: 'ops', lab: 'cp-06',
            symptom: 'Yeni kurulmuş ya da yeniden başlatılmış bir gateway ya hiç trafik geçirmiyor ya da SmartConsole\'da yapılan değişiklikleri uygulamıyor.',
            steps: [
                { code: 'fw stat', desc: 'POLICY sütunu. Gerçek politika adı (ör. LAB-Policy) ve güncel bir tarih görmelisiniz. InitialPolicy: gateway ilk kurulumdan sonra management\'tan henüz politika almamış; yalnız yönetim bağlantısına izin verir. defaultfilter: açılışta politika yüklenemedi ve koruyucu filtre devrede. "-" ya da boş: hiç politika yok. Üçü de "gerçek politika kurulmamış" demektir.' },
                { code: 'cpstat fw', desc: 'Kurulu politikanın adı ve kurulum zamanı, arayüz bazında kabul/düşürme sayaçları. Kurulum zamanını SmartConsole\'daki son Install Policy zamanıyla karşılaştırın; eskiyse son kurulum bu gateway\'e ulaşmamıştır (hedef listesinde değil ya da kurulum hata verdi).' },
                { code: 'cp_conf sic state', desc: 'Management ile gateway arasındaki güven (SIC) durumu. "Trust established" görünmüyorsa management politikayı gateway\'e gönderemez. SIC kurulamamasının sık nedenleri: iki uçta farklı etkinleştirme anahtarı, saat farkı (sertifika doğrulaması) ve aradaki bir kuralın TCP 18191/18192/18211 portlarını engellemesi.',
                  fix: [{ cause: 'SIC kopuk: SmartConsole\'da gateway nesnesinde Communication → Reset, gateway\'de cpconfig → Secure Internal Communication ile aynı tek kullanımlık anahtarı verin, sonra SmartConsole\'da Initialize. Saatin doğru olduğunu önce doğrulayın ("Saat ve DNS" senaryosu)' }] },
                { code: 'fw fetch 10.240.0.10', desc: 'Gateway\'in politikayı management sunucusundan (burada 10.240.0.10) kendisinin çekmesini ister. SIC sağlamsa ve management\'ta bu gateway\'e kurulmuş bir politika varsa defaultfilter durumundan çıkmanın yoludur. Başarısızsa hata iletisi nedeni (SIC, erişim) söyler. Kalıcı çözüm her zaman SmartConsole\'dan Install Policy\'dir; kurulum hatalarını SmartConsole\'daki kurulum ayrıntısında okuyun.' },
            ]
        },
        {
            title: 'Yönetim Erişimi Sorunu: Expert Parolası, Rol ve allowed-client', severity: 'warn', topic: 'aaa', lab: 'cp-01',
            symptom: 'Bir yönetici gateway\'e SSH ya da Gaia Portal ile bağlanamıyor, bağlandığında expert moda geçemiyor ya da clish komutları "yetki yok" hatası veriyor.',
            steps: [
                { code: 'expert', desc: 'Expert kabuğu ayrı bir parolayla korunur. Parola hiç tanımlanmamışsa clish bunu söyler ve expert\'e geçilmez. Tanımlıysa yanlış parola denemeleri de kayda geçer.',
                  fix: [{ cause: 'Expert parolası tanımlı değil: tanımlayın (parola iki kez, ekranda görünmeden sorulur) ve kaydedin', cmd: 'set expert-password\nsave config' }] },
                { code: 'show users', desc: 'Gaia yerel kullanıcıları, UID\'leri, ev dizinleri ve login kabukları. Kabuk /etc/cli.sh ise kullanıcı clish\'e, /bin/bash ise doğrudan expert\'e düşer. Bir kullanıcıya bash vermek tüm kısıtlamaları aşmasına izin verir; yalnız gerekli yöneticilere verin.' },
                { code: 'show rba user netops', desc: 'Kullanıcının rolünü ve erişim yollarını (Web-UI, CLI) gösterir. monitorRole salt okurdur: set komutları reddedilir; bu bir hata değil, tasarımdır. Erişim yolunda CLI yoksa kullanıcı SSH ile giremez.',
                  fix: [{ cause: 'Kullanıcının CLI erişim yolu yok', cmd: 'add rba user netops access-mechanisms CLI\nsave config' }] },
                { code: 'show allowed-client all', desc: 'Gaia Portal ve SSH\'e yalnız bu listedeki adreslerden bağlanılabilir. Listede "any" varsa yönetim her kaynağa açıktır; yalnız yönetim ağını yazmak daha güvenlidir. Yöneticinin adresi listede yoksa bağlantı reddedilir. Ayrıca güvenlik politikasındaki Stealth kuralı yönetim ağına izin veren kuraldan önce geliyorsa SSH kernel\'de düşer: zdebug\'da "Rulebase drop - rule 1" görürsünüz.',
                  fix: [{ cause: 'Yönetim ağı listede yok: ekleyin (any\'yi kaldırmadan önce kendi adresinizin listede olduğundan emin olun, yoksa erişiminiz kopar)', cmd: 'add allowed-client network ipv4-address 10.240.0.0 mask-length 16\nsave config' }] },
            ]
        },
        {
            title: 'Saat ve DNS Sorunu: NTP Senkron Değil, Ad Çözülemiyor', severity: 'warn', topic: 'ops', lab: 'cp-02',
            symptom: 'Loglar yanlış saatle geliyor, SIC ya da sertifika tabanlı VPN "sertifika geçersiz" hatası veriyor veya lisans/imza güncellemeleri indirilemiyor.',
            steps: [
                { code: 'show ntp servers', desc: 'Tanımlı NTP sunucuları ve sürümleri. Tek sunucu tanımlıysa o sunucuya erişim kesildiğinde saat kaymaya başlar; en az iki sunucu tanımlayın. Sunucu tanımlamak yetmez: servisin ayrıca açılması gerekir.',
                  fix: [{ cause: 'İkinci sunucu yok ya da servis kapalı', cmd: 'set ntp server secondary 10.64.10.124 version 4\nset ntp active on\nsave config' }] },
                { code: 'show ntp current', desc: 'Şu anda eşitlenilen sunucuyu gösterir. Boşsa gateway hiçbir sunucuyla eşitlenmemiştir: sunucuya UDP 123 ile ulaşılamıyor olabilir. Gateway\'in kendi ürettiği trafik de politikadan geçer; kural ya da anti-spoofing düşürüyorsa zdebug\'da görünür.' },
                { code: 'show clock', desc: 'Sistem saati ve tarihi. Doğru saatten birkaç dakikadan fazla farklıysa SIC ve sertifika doğrulamaları başarısız olabilir, loglar olay sırasını yanlış gösterir. Saat dilimi yanlışsa (show timezone) zaman nesneli kurallar da yanlış saatlerde çalışır.' },
                { code: 'show dns', desc: 'Birincil, ikincil ve üçüncül DNS sunucuları. Tek sunucu tanımlıysa o sunucu düştüğünde lisans, imza güncellemeleri ve URL/bulut sorguları durur. Expert\'te nslookup ile bir adı çözerek sınayın.',
                  fix: [{ cause: 'Yalnız birincil DNS tanımlı: ikinciyi ekleyin', cmd: 'set dns secondary 10.64.10.54\nsave config' }] },
            ]
        },
        {
            title: 'Yeniden Başlatmadan Sonra Şubelere/İç Ağa Erişim Yok: Statik Rota Etkin Değil', severity: 'err', topic: 'routing', lab: 'cp-12',
            symptom: 'Bakım gecesi gateway yeniden başlatıldı. Sabahtan beri iç yönlendirici (10.64.10.254) arkasındaki şube ağlarına (10.128.0.0/16) erişilemiyor; internet çalışıyor.',
            steps: [
                { code: 'show route', desc: 'Hedef için bir S (statik) satırı arayın. Yoksa trafik varsayılan rotayla internete gider ve kaybolur. Bağlı ağların (C) listesinde LAN ağı var mı, maskesi doğru mu, ona da bakın.' },
                { code: 'show route inactive', desc: 'Tanımlı ama kullanılamayan rotaları gösterir. Bir rota, sonraki atlaması (nexthop) açık ve adresli bir arayüzün ağında değilse etkin olmaz. Rota burada da yoksa hiç tanımlı değildir: büyük olasılıkla eklenmiş ama save config yapılmamıştı.',
                  fix: [{ cause: 'Rota hiç yok (kaydedilmemişti)', cmd: 'set static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on\nsave config' },
                        { cause: 'Nexthop yanlış yazılmış (bağlı bir ağda değil)', cmd: 'set static-route 10.128.0.0/16 nexthop gateway address <yanlış-ip> off\nset static-route 10.128.0.0/16 nexthop gateway address 10.64.10.254 on\nsave config' }] },
                { code: 'show interface eth2', desc: 'Nexthop\'un bulunduğu arayüz: state on mu, link up mı, ipv4-address satırındaki maske doğru mu? Maske örneğin /28 yazılmışsa .254 o ağın dışında kalır ve rota etkin olmaz.',
                  fix: [{ cause: 'Arayüz kapalı', cmd: 'set interface eth2 state on\nsave config' },
                        { cause: 'Arayüz maskesi yanlış', cmd: 'set interface eth2 ipv4-address 10.64.10.1 mask-length 24\nsave config' }] },
                { code: 'show configuration', desc: 'Açılışta yüklenen ile çalışan arasındaki farkı düşünün: show config-state "unsaved" diyorsa kaydedilmemiş değişiklik vardır. Bir sonraki yeniden başlatmada yine kaybolmaması için düzeltmeden sonra save config şarttır.' },
                { code: 'ping 10.128.5.10', desc: 'Düzeltmeden sonra doğrulama. Hâlâ yanıt yoksa iç yönlendiricinin dönüş rotasına ve güvenlik politikasına (fw ctl zdebug drop) bakın.' },
            ]
        },
        {
            title: 'Yeni VLAN / Arayüz Eklendi, Trafik Geçmiyor', severity: 'warn', topic: 'iface', lab: 'cp-09',
            symptom: 'Gaia\'da yeni bir VLAN alt arayüzü (ör. eth4.20) oluşturuldu ve adreslendi. O ağdaki istemciler gateway\'e ping atabiliyor ama diğer ağlara geçemiyor.',
            steps: [
                { code: 'show interface eth4.20', desc: 'Alt arayüz state on ve link up olmalı. Fiziksel arayüz (eth4) kapalıysa alt arayüzler de çalışmaz; switch tarafında VLAN trunk\'a eklenmemişse ping bile gelmez.',
                  fix: [{ cause: 'Fiziksel arayüz kapalı', cmd: 'set interface eth4 state on\nsave config' }] },
                { code: 'fw ctl zdebug drop | grep 10.64.20.', desc: 'Expert modda. "Address spoofing" satırı görünüyorsa gateway nesnesinin topolojisi güncel değildir: yeni ağ arayüzün arkasındaki ağlar arasında tanımlı olmadığı için anti-spoofing düşürür. "Rulebase drop" ise bu ağ için izin kuralı yoktur.',
                  fix: [{ cause: 'Topoloji güncel değil (SmartConsole: gateway nesnesi > Network Management > Get Interfaces, anti-spoofing ayarını kontrol edip politikayı kurun)' },
                        { cause: 'İzin kuralı yok (SmartConsole\'da kural ekleyip politikayı kurun)' }] },
                { code: 'fw stat', desc: 'Politika kurulduktan sonra kurulum zamanı güncellenmiş ve yeni arayüz listede görünüyor olmalı.' },
            ]
        },
        {
            title: 'Bakım Öncesi Güvence: Yedek, Snapshot ve Geri Dönüş', severity: 'info', topic: 'ops', lab: 'cp-11',
            symptom: 'Hotfix ya da sürüm yükseltmesi planlanıyor. İşler kötü giderse nasıl geri dönüleceği önceden hazırlanmalı.',
            steps: [
                { code: 'save configuration <dosya-adı>', desc: 'clish ayarlarını set komutları olarak dosyaya yazar. Bakımdan sonra farkı görmek ya da ayarları yeniden uygulamak için kullanılır. Politika ve nesneleri içermez: onlar yönetim sunucusundadır.' },
                { code: 'add backup local', desc: 'Gaia ve Check Point yapılandırmasının yedeğini alır; show backups ile izlenir. Dosyayı cihaz dışına kopyalayın: disk arızasında yerel yedek de gider. Backup kurulu hotfix\'i geri almaz.' },
                { code: 'add snapshot <ad> desc "<açıklama>"', desc: 'İşletim sistemi dahil tüm sistem bölümünün görüntüsüdür; hotfix ya da yükseltme geri alınacaksa en eksiksiz yol budur. Dakikalar sürer ve diskte boş alan ister; show snapshots ile izleyin.' },
                { code: 'show config-state', desc: 'Bakıma başlamadan önce "saved" olmalı. Kaydedilmemiş bir değişiklik bakım sırasındaki yeniden başlatmada kaybolur ve arızanın nedenini bulmayı zorlaştırır.' },
            ]
        },
        {
            title: 'Kural Yazıldı Ama Trafik Hâlâ Düşüyor: Yayın, Kurulum, Sıra, Nesne ve Servis', severity: 'err', topic: 'traffic', lab: 'cp-15',
            symptom: 'LAN\'dan DMZ\'deki web sunucusuna (172.24.50.10, https) izin veren kural yazıldı; kullanıcılar (ör. 10.64.10.50) hâlâ bağlanamıyor.',
            steps: [
                { code: 'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=443', desc: 'Expert modda. Gateway\'e kurulu politikada bu akışın hangi kurala düştüğünü trafik üretmeden gösterir. Cleanup ya da başka bir Drop kuralı çıkıyorsa trafik politikada düşüyordur. Yayınlanmamış ya da kurulmamış değişiklikleri görmez.' },
                { code: 'fw stat', desc: 'Son politika kurulum zamanı. Kural yayınlandıktan sonraysa ve tarih eskiyse değişiklik gateway\'e hiç gitmemiştir.',
                  fix: [{ cause: 'Kural yayınlanmış ama kurulmamış', cmd: 'mgmt_cli install-policy policy-package standard targets.1 gw-a -r true' }] },
                { code: 'mgmt_cli show access-rulebase name Network -r true', desc: 'Yayınlanmış kural tabanı (SmartConsole\'daki görünüm). Kuralın üstünde aynı trafiği yakalayan bir Drop kuralı var mı, servis https mi, kural devre dışı mı, bakın. Kural hiç görünmüyorsa yayınlanmamıştır (SmartConsole\'da Publish).',
                  fix: [{ cause: 'Üstteki bir Drop kuralı gölgeliyor: sırayı düzeltin, kuralı silmeyin', cmd: 'mgmt_cli set access-rule layer Network name LAN-to-WEB new-position.above DMZ-Block -r true\nmgmt_cli install-policy policy-package standard targets.1 gw-a -r true' },
                        { cause: 'Servis yanlış', cmd: 'mgmt_cli set access-rule layer Network name LAN-to-WEB service https -r true\nmgmt_cli install-policy policy-package standard targets.1 gw-a -r true' },
                        { cause: 'Kural devre dışı', cmd: 'mgmt_cli set access-rule layer Network name LAN-to-WEB enabled true -r true\nmgmt_cli install-policy policy-package standard targets.1 gw-a -r true' }] },
                { code: 'mgmt_cli show host name WEB-SRV -r true', desc: 'Kuraldaki nesnenin gerçekten sunucunun adresini gösterip göstermediğine bakın. Tek haneli bir yazım hatası kuralı başka bir adrese yazar.',
                  fix: [{ cause: 'Nesnenin adresi yanlış', cmd: 'mgmt_cli set host name WEB-SRV ip-address 172.24.50.10 -r true\nmgmt_cli install-policy policy-package standard targets.1 gw-a -r true' }] },
                { code: 'fw ctl zdebug drop | grep 172.24.50.10', desc: 'up_execute kuralın izin verdiğini gösteriyor ama trafik yine düşüyorsa gerçek düşme nedenine bakın (anti-spoofing, rota, ilk paket SYN değil). Kısa süre ve filtreli çalıştırın.' },
            ]
        },
    ];
})();
