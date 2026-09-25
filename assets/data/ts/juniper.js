'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (juniper) ─────────────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['juniper'] = [
        {
            title: 'SRX: İçeriden Dışarıya Trafik Geçmiyor (Kural / Bölge / Commit / NAT)', severity: 'err', topic: 'traffic', replaces: 'SRX Uzerinden Trafik Gecmiyor',
            symptom: 'LAN\'daki bir kullanıcı (ör. 10.64.10.50) internete çıkamıyor; izin kuralı yazılmış görünüyor.',
            steps: [
                { code: 'show security match-policies from-zone trust to-zone untrust source-ip 10.64.10.50 destination-ip 203.0.113.80 source-port 1025 destination-port 443 protocol tcp', desc: 'Trafik üretmeden SRX\'in bu akış için seçeceği kuralı gösterir. İzin kuralı (ALLOW-WEB) yerine alttaki bir deny kuralı (DENY-ALL) ya da hiç kural çıkmıyorsa sorun kural sırası/eşleşmesidir. "permit" çıkması yetmez: sonraki adımlar bölgeyi ve NAT\'ı sınar.',
                  fix: [{ cause: 'Deny kuralı izin kuralının üstünde: deny\'ı silmeden sırayı düzeltin', cmd: 'insert security policies from-zone trust to-zone untrust policy ALLOW-WEB before policy DENY-ALL\ncommit' }] },
                { code: 'show security zones', desc: 'LAN arayüzü (ör. ge-0/0/1.0) trust bölgesinin Interfaces listesinde olmalı. Başka bölgedeyse paket o bölgeden gelir ve trust → untrust kuralı hiç denenmez.',
                  fix: [{ cause: 'Arayüz yanlış bölgede: eski bölgeden silip doğru bölgeye ekleyin', cmd: 'delete security zones security-zone dmz interfaces ge-0/0/1.0\nset security zones security-zone trust interfaces ge-0/0/1.0\ncommit' }] },
                { code: 'show | compare', desc: 'Yapılandırma kipinde (configure) çalıştırın. "+" ile başlayan satırlar candidate\'te bekleyen, commit edilmemiş değişikliklerdir: cihazda henüz yoktur.',
                  fix: [{ cause: 'Düzeltme commit edilmemiş: farkı gözden geçirip uygulayın', cmd: 'commit' }] },
                { code: 'show security flow session destination-prefix 203.0.113.80', desc: 'Oturum olmalı. Out (dönüş) satırı WAN adresine (NAT\'lı) dönmeli; hâlâ 10.64.x iç adresine dönüyorsa kaynak NAT çalışmıyor ve yanıt internetten geri gelemez.' },
                { code: 'show security nat source rule all', desc: 'Kural kümesinin From/To bölgeleri ve Source addresses LAN ağını (10.64.10.0/24) kapsamalı; Translation hits sayacı artmalı.',
                  fix: [{ cause: 'NAT kuralı LAN ağını kapsamıyor: yanlış öneki silip doğrusunu yazın', cmd: 'delete security nat source rule-set TRUST-TO-UNTRUST rule SNAT match source-address 10.128.10.0/24\nset security nat source rule-set TRUST-TO-UNTRUST rule SNAT match source-address 10.64.10.0/24\ncommit' }] },
            ],
        },
        {
            title: 'SRX: Sunucu Dışarıdan Açılmıyor (Hedef/Statik NAT, Proxy-ARP)', severity: 'err', topic: 'traffic', 
            symptom: 'NAT kuralı yazıldı ama internetten genel adrese (ör. 203.0.113.10:443) gelen bağlantı sunucuya ulaşmıyor.',
            steps: [
                { code: 'show security flow session', desc: 'Dışarıdan gelen hiçbir oturum yoksa paket SRX\'e hiç ulaşmıyor: genel adres arayüz adresi değil ve ISP yönlendiricisinin ARP sorusuna cevap veren yok (proxy-ARP).',
                  fix: [{ cause: 'Genel adres WAN alt ağında ama arayüz adresi değil: proxy-ARP ekleyin', cmd: 'set security nat proxy-arp interface ge-0/0/0.0 address 203.0.113.10/32 to 203.0.113.11\ncommit' }] },
                { code: 'show security nat destination rule all', desc: 'Kural kümesinin From zone\'u paketin geldiği bölge (untrust) olmalı; hedef adres/port genel adresle eşleşmeli. Translation hits artmıyorsa kural eşleşmiyor.',
                  fix: [{ cause: 'Hedef NAT kuralı yok', cmd: 'set security nat destination pool WEB-POOL address 10.64.20.10/32 port 443\nset security nat destination rule-set DNAT from zone untrust\nset security nat destination rule-set DNAT rule WEB match destination-address 203.0.113.10/32 destination-port 443\nset security nat destination rule-set DNAT rule WEB then destination-nat pool WEB-POOL\ncommit' }] },
                { code: 'show security nat static rule all', desc: 'Bire bir (statik) NAT: genel adres ↔ iç adres doğru olmalı. Statik NAT iki yönlüdür; sunucunun çıkış trafiği de aynı genel adresle çıkar.' },
                { code: 'show security policies from-zone untrust to-zone dmz', desc: 'Kuralın hedefi sunucunun GERÇEK (NAT sonrası) adresi olmalı: SRX güvenlik kuralını hedef NAT\'tan sonra değerlendirir. Genel adresle yazılan kural hiç eşleşmez.',
                  fix: [{ cause: 'Kural genel adres nesnesiyle yazılmış ya da yok', cmd: 'set security policies from-zone untrust to-zone dmz policy ALLOW-WEB match source-address any destination-address WEB-SRV application junos-https\nset security policies from-zone untrust to-zone dmz policy ALLOW-WEB then permit\ncommit' }] },
            ],
        },
        {
            title: 'EX Erişim Portu: Bilgisayar Ağa Bağlanmıyor', severity: 'err', topic: 'iface', lab: 'jun-22',
            symptom: 'Masa portundaki bilgisayar (ör. ge-0/0/4) ağa bağlanmıyor; dün çalışıyordu.',
            steps: [
                { code: 'show interfaces terse ge-0/0/4', desc: 'Admin up / Link down = fiziksel sorun ya da bir koruma kapattı; up/up = sorun üst katmanda (VLAN, öğrenme). Admin down ise port disable edilmiş.' },
                { code: 'show interfaces ge-0/0/4', desc: 'Auto-negotiation "Disabled" ve sabit hız görünüyor, hata bayrağı yoksa hız karşı uçla uyuşmuyor. "BPDU Error: Detected" ise porta BPDU gelmiş.',
                  fix: [{ cause: 'Sabit hız karşı uçla uyuşmuyor: sabit ayarı kaldırıp otomatik uzlaşmaya dönün', cmd: 'delete interfaces ge-0/0/4 speed\ndelete interfaces ge-0/0/4 ether-options\ncommit' }] },
                { code: 'show ethernet-switching interface', desc: 'Portun bayrakları: "DN,LH" = MAC sınırı aşıldı (LH) ve port kapatıldı (DN). VLAN sütunu kullanıcının VLAN\'ını göstermeli.',
                  fix: [{ cause: 'MAC sınırı aşıldı ve hub söküldü: sınırı silmeden portu açın', cmd: 'clear ethernet-switching recovery-timeout interface ge-0/0/4.0' }] },
                { code: 'show spanning-tree interface', desc: 'Port "BLK" ve "DIS (Bpdu-Incon)" görünüyorsa kenar porta BPDU geldi ve bpdu-block-on-edge portu engelledi.',
                  fix: [{ cause: 'Masadaki switch söküldü: korumayı silmeden engeli kaldırın', cmd: 'clear error bpdu interface ge-0/0/4' }] },
                { code: 'show vlans', desc: 'Port doğru VLAN\'ın (ör. V10) üyesi olmalı. Başka VLAN\'daysa port up/up olsa da bilgisayar yanlış ağa düşer.',
                  fix: [{ cause: 'Port yanlış VLAN\'da: eskisini silip doğrusunu ekleyin', cmd: 'delete interfaces ge-0/0/4 unit 0 family ethernet-switching vlan members V20\nset interfaces ge-0/0/4 unit 0 family ethernet-switching vlan members V10\ncommit' }] },
                { code: 'show ethernet-switching table interface ge-0/0/4', desc: 'Kapanış kanıtı: bilgisayarın MAC\'i doğru VLAN\'da öğrenilmiş olmalı.' },
            ],
        },
        {
            title: 'EX Port Güvenliği: MAC Sınırı Aşıldı, Port Kapandı', severity: 'err', topic: 'iface', lab: 'jun-15',
            symptom: 'Bir ofis portu kendiliğinden kapandı; terminalde MAC sınırı olayı görüldü.',
            steps: [
                { code: 'show ethernet-switching interface', desc: '"LH" (MAC limit hit) ve "DN" (down) bayrakları portun MAC sınırı yüzünden kapatıldığını gösterir.' },
                { code: 'show interfaces terse ge-0/0/5', desc: 'Admin up, Link down: portu kapatan yönetici değil, koruma mekanizmasıdır.',
                  fix: [{ cause: 'Hub/masaüstü switch söküldü: MAC sınırını silmeden portu açın', cmd: 'clear ethernet-switching recovery-timeout interface ge-0/0/5.0' }] },
                { code: 'show configuration switch-options', desc: 'interface-mac-limit masadaki meşru cihaz sayısına uygun olmalı; packet-action shutdown portu kapatır, drop/log yalnız fazlasını düşürür. persistent-learning öğrenilen MAC\'i kalıcı yapar.',
                  fix: [{ cause: 'Portun kendiliğinden açılması isteniyor (yalnız bu ayardan sonraki olayları etkiler)', cmd: 'set interfaces ge-0/0/5 unit 0 family ethernet-switching recovery-timeout 300\ncommit' }] },
                { code: 'show ethernet-switching table persistent-mac', desc: 'Kalıcı öğrenilmiş MAC\'ler: portun "sahibi" olan cihaz. Masadaki bilgisayar değiştiyse eski kalıcı MAC yenisini sınır dışında bırakır.' },
            ],
        },
        {
            title: 'RSTP: Kök Köprü Yanlış ya da Kenar Port Engellendi', severity: 'err', topic: 'l2', lab: 'jun-17',
            symptom: 'Trafik gereksiz uzun yoldan akıyor ya da bir masa portu BPDU nedeniyle engellendi.',
            steps: [
                { code: 'show spanning-tree bridge', desc: 'Root ID, bu anahtarın Bridge ID\'sine eşitse kök sizsiniz; değilse Root port kök yönündeki porttur. Eşit öncelikte düşük MAC kazanır.',
                  fix: [{ cause: 'Kök bu anahtar olmalı: önceliği kökünkinden düşük seçin (4k adımlı)', cmd: 'set protocols rstp bridge-priority 4k\ncommit' }] },
                { code: 'show spanning-tree interface', desc: 'Masa portları DESG/FWD olmalı. "BLK" ve "DIS (Bpdu-Incon)" = kenar porta BPDU geldi, bpdu-block-on-edge engelledi.',
                  fix: [{ cause: 'Masadaki switch söküldü: korumayı silmeden engeli kaldırın', cmd: 'clear error bpdu interface ge-0/0/3' }] },
                { code: 'show configuration protocols rstp', desc: 'Masa portları "edge", genel ayarda "bpdu-block-on-edge" olmalı; anahtarlar arası bağlantı (uplink) edge olmamalı.',
                  fix: [{ cause: 'Kenar port koruması yok', cmd: 'set protocols rstp interface ge-0/0/3 edge\nset protocols rstp bpdu-block-on-edge\ncommit' }] },
            ],
        },
        {
            title: 'OSPF Komşuluğu Kurulmuyor (Junos)', severity: 'err', topic: 'routing', lab: 'jun-18',
            symptom: 'Komşu yönlendiricilerden biri OSPF komşu listesinde görünmüyor; hata iletisi yok.',
            steps: [
                { code: 'show ospf neighbor', desc: 'Her komşu için State "Full" olmalı. Eksik komşu varsa uyuşmazlık sessizdir: sonraki adımlarla bulunur.' },
                { code: 'show ospf interface', desc: 'OSPF\'in çalıştığı arayüzler ve Nbrs (komşu sayısı). Arayüz listede yoksa OSPF\'e eklenmemiş; listede ama Nbrs 0 ise alan, hello/dead ya da alt ağ karşı uçla uyuşmuyor.',
                  fix: [{ cause: 'Hello aralığı karşı uçtan farklı (dead otomatik 4 katı olur)', cmd: 'set protocols ospf area 0 interface ge-0/0/2.0 hello-interval 5\ncommit' },
                        { cause: 'Alan kimliği karşı uçtan farklı: arayüzü doğru alana taşıyın', cmd: 'delete protocols ospf area 0 interface ge-0/0/2.0\nset protocols ospf area 0.0.0.1 interface ge-0/0/2.0\ncommit' }] },
                { code: 'show configuration protocols ospf', desc: 'Arayüz birimiyle (ge-0/0/2.0) doğru alanda olmalı; komşuya bakan arayüz "passive" olmamalı (passive yalnız lo0 ve kullanıcı ağları için).',
                  fix: [{ cause: 'Arayüz OSPF\'e eklenmemiş', cmd: 'set protocols ospf area 0 interface ge-0/0/2.0\ncommit' }] },
                { code: 'show route protocol ospf', desc: 'Komşuluk kurulduktan sonra uzak ağlar [OSPF/10] ile gelmeli; birden çok yol varsa düşük metric\'li olan aktif (*) olur.' },
            ],
        },
        {
            title: 'EX DHCP: İstemciler Adres Alamıyor', severity: 'err', topic: 'iface', lab: 'jun-13',
            symptom: 'Bir VLAN\'daki istemciler DHCP ile adres alamıyor ya da statik cihazlarla çakışan adres alıyor.',
            steps: [
                { code: 'show dhcp server binding', desc: 'IP ↔ MAC ↔ arayüz eşleşmeleri. İstemcinin MAC\'i yoksa adres verilmedi; adres statik cihaz aralığındaysa havuz aralığı (range) yanlış.' },
                { code: 'show configuration system services dhcp-local-server', desc: 'İstemcinin geldiği arayüz (ör. irb.10, irb.20) bir dhcp-local-server group\'ta olmalı. Havuz tek başına bir şey dağıtmaz.',
                  fix: [{ cause: 'Arayüz hiçbir DHCP grubunda değil', cmd: 'set system services dhcp-local-server group KULLANICILAR interface irb.20\ncommit' }] },
                { code: 'show configuration access', desc: 'Her VLAN için arayüz alt ağıyla eşleşen bir address-assignment pool olmalı; range statik cihazları dışarıda bırakmalı; dhcp-attributes altında router (ağ geçidi) ve name-server tanımlı olmalı.',
                  fix: [{ cause: 'VLAN\'ın alt ağına uyan havuz yok', cmd: 'set access address-assignment pool V20-POOL family inet network 10.64.20.0/24\nset access address-assignment pool V20-POOL family inet range MISAFIR low 10.64.20.50 high 10.64.20.99\nset access address-assignment pool V20-POOL family inet dhcp-attributes router 10.64.20.1\ncommit' }] },
            ],
        },
        {
            title: 'Statik Rota: Yedek Hat Devreye Girmiyor ya da Trafik Yedekten Gidiyor', severity: 'warn', topic: 'routing', lab: 'jun-05',
            symptom: 'Birincil hat düşünce trafik yedeğe geçmiyor ya da birincil çalışırken trafik iki hatta paylaşılıyor.',
            steps: [
                { code: 'show route 0.0.0.0/0 exact', desc: 'Birincil next-hop aktif (*) ve Static/5 olmalı; yedek (qualified-next-hop) yıldızsız ve Static/250 beklemeli. İki next-hop aynı tercihle görünüyorsa yedek değil yük paylaşımıdır.',
                  fix: [{ cause: 'Yedek next-hop tercih değeri verilmeden eklenmiş: normal next-hop olarak silip qualified-next-hop olarak yazın', cmd: 'delete routing-options static route 0.0.0.0/0 next-hop 198.51.100.1\nset routing-options static route 0.0.0.0/0 qualified-next-hop 198.51.100.1 preference 250\ncommit' }] },
                { code: 'show configuration routing-options', desc: 'Statik rotaların next-hop\'ları doğrudan bağlı ağlarda olmalı; değilse rota çözülmez ve tabloya girmez.' },
                { code: 'show interfaces terse', desc: 'Birincil hattın arayüzü Admin/Link up olmalı. Yedeğe geçiş yalnız arayüz ya da next-hop çözülemez olunca olur; uzak uçtaki kopmayı fark etmek için BFD/RPM izlemesi gerekir.' },
            ],
        },
    ];
})();
