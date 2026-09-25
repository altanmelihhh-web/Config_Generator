'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (dell) ─────────────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['dell'] = [
        {
            title: 'VLAN Sunucuları Ağ Geçidine Ulaşamıyor (Access / Trunk / SVI)', severity: 'err', topic: 'l2', lab: 'dell-40',
            symptom: 'Bir VLAN\'daki sunucular (ör. VLAN 20) ağ geçidine ping atamıyor; aynı switch\'teki diğer VLAN\'lar sorunsuz.',
            steps: [
                { code: 'show vlan', desc: 'VLAN 20 satırında sunucu portu "A Eth1/1/5" (access) ve uplink "T Eth1/1/12" (tagged) olmalı. Port başka VLAN\'ın altında görünüyorsa yanlış access VLAN; T üyesi yoksa trunk VLAN\'ı taşımıyor.',
                  fix: [{ cause: 'Uplink trunk VLAN 20\'yi taşımıyor: listeyi tam yazın (tek VLAN yazmak diğerini düşürür)', cmd: 'interface ethernet 1/1/12\n switchport trunk allowed vlan 10,20' },
                        { cause: 'Sunucu portu yanlış VLAN\'da', cmd: 'interface ethernet 1/1/5\n switchport access vlan 20' }] },
                { code: 'show interface status', desc: 'Sunucu portu ve uplink Status "up" olmalı; Mode/Vlan sütunları access portun VLAN\'ını ve trunk\'ı gösterir.',
                  fix: [{ cause: 'Port kapalı', cmd: 'interface ethernet 1/1/5\n no shutdown' }] },
                { code: 'show ip interface brief', desc: 'Vlan 20 satırında IP-Address sunucuların ağ geçidi (10.64.20.1/24) olmalı, Status/Protocol "up". Status down = SVI shutdown; farklı adres = sunucuların ağ geçidiyle uyuşmuyor.',
                  fix: [{ cause: 'SVI kapalı', cmd: 'interface vlan 20\n no shutdown' },
                        { cause: 'SVI adresi yanlış', cmd: 'interface vlan 20\n no ip address\n ip address 10.64.20.1/24' }] },
                { code: 'ping 10.64.20.50', desc: 'Ağ geçidinden sunucuya ping yanıt vermeli: VLAN yolu ve ARP çalışıyor. Düzeltmeyi write memory ile kaydedin.' },
            ],
        },
        {
            title: 'DHCP: İstemci Adres ya da Ağ Geçidi Alamıyor (OS10)', severity: 'err', topic: 'iface', lab: 'dell-08',
            symptom: 'Bir VLAN\'daki istemciler adres alamıyor, statik cihazlarla çakışan adres alıyor ya da alt ağ dışına çıkamıyor.',
            steps: [
                { code: 'show ip dhcp binding', desc: 'İstemcinin MAC\'i ve aldığı IP burada görünmeli. Adresler statik cihaz aralığındaysa havuzun range\'i yanlış; hiç kayıt yoksa sunucu kapalı ya da havuz ağı uyuşmuyor.' },
                { code: 'show running-configuration | find "ip dhcp server"', desc: '"ip dhcp server" altında "no disable" olmalı (yoksa sunucu kapalı). Havuzun network\'ü SVI ağıyla aynı olmalı; default-router ve dns-server tanımlı, range yalnız dağıtılacak aralığı kapsamalı.',
                  fix: [{ cause: 'DHCP sunucusu kapalı', cmd: 'ip dhcp server\n no disable' },
                        { cause: 'Ağ geçidi yok: istemciler alt ağ dışına çıkamaz', cmd: 'ip dhcp server\n pool VLAN20\n default-router 10.64.20.1' },
                        { cause: 'Dağıtım aralığı statik cihazları kapsıyor', cmd: 'ip dhcp server\n pool VLAN20\n range 10.64.20.50 10.64.20.200' }] },
                { code: 'show running-configuration interface vlan 30', desc: 'Merkezi sunucu kullanan VLAN\'da ip helper-address sunucuyu (ör. 10.64.99.5) göstermeli. Helper istemcinin VLAN\'ının SVI\'sine yazılır, sunucununkine değil.',
                  fix: [{ cause: 'Relay yok ya da yanlış SVI\'de', cmd: 'interface vlan 30\n ip helper-address 10.64.99.5' }] },
            ],
        },
        {
            title: 'Port Güvenliği: MAC Sınırı İhlali, Port Kapandı', severity: 'err', topic: 'iface', lab: 'dell-10',
            symptom: 'Terminalde MAC sınırı ihlali olayı çıktı; bir masa portundaki cihaz ağa çıkamıyor ya da port kapandı.',
            steps: [
                { code: 'show interface status', desc: 'İhlal eylemi shutdown ise kapanan port Status "down" görünür; hangi port olduğunu buradan bulun.' },
                { code: 'show switchport port-security', desc: 'Portlarda port güvenliğinin açık olduğu, MAC sınırı ve ihlal eylemi görünür: drop = sessizce düşürür, log = düşürür ve iz bırakır, shutdown = portu kapatır.' },
                { code: 'show mac address-table interface ethernet 1/1/2', desc: 'Sınır dolu olduğu için yabancı MAC tabloya giremez; portta yalnız masadaki cihazın MAC\'i görünmeli.',
                  fix: [{ cause: 'Yabancı cihaz söküldü: portu port güvenliğini kapatmadan açın', cmd: 'interface ethernet 1/1/2\n shutdown\n no shutdown' },
                        { cause: 'Portun kapanması yerine yabancı trafiği düşürüp log üreten eylem isteniyor', cmd: 'interface ethernet 1/1/2\n switchport port-security\n mac-learn limit violation log' }] },
            ],
        },
        {
            title: 'STP: Kenar Port Kapandı (BPDU Guard) ya da Kök Köprü Yanlış', severity: 'err', topic: 'l2', lab: 'dell-12',
            symptom: 'Bir kullanıcı portu kendiliğinden kapandı ya da kök köprü tasarımdaki switch değil.',
            steps: [
                { code: 'show interface status', desc: 'BPDU Guard\'ın kapattığı kullanıcı portu Status "down" görünür; terminal olayı portu ve nedeni (bpduguard) söyler.',
                  fix: [{ cause: 'İzinsiz switch söküldü: BPDU Guard\'ı kaldırmadan portu açın', cmd: 'interface ethernet 1/1/6\n shutdown\n no shutdown' }] },
                { code: 'show spanning-tree brief', desc: 'Root ID bu switch\'in Bridge ID\'sine eşit değilse kök başka switch\'tir; Root rolündeki port köke giden yoldur. Kullanıcı portlarında Edge ve BpduGuard "Yes" olmalı, uplink\'lerde Edge "No".',
                  fix: [{ cause: 'Kullanıcı portları kenar port değil ya da korumasız', cmd: 'interface range ethernet 1/1/1-1/1/8\n spanning-tree port type edge\n spanning-tree bpduguard enable' }] },
                { code: 'show running-configuration | grep spanning', desc: 'OS10 varsayılanı Rapid-PVST\'dir. "spanning-tree rstp priority" yalnız "spanning-tree mode rstp" iken etkilidir; Rapid-PVST\'de öncelik VLAN başına verilir.',
                  fix: [{ cause: 'Tek RSTP ağacında kök bu switch olmalı: önce mod, sonra öncelik', cmd: 'spanning-tree mode rstp\nspanning-tree rstp priority 0' },
                        { cause: 'Rapid-PVST kullanılıyor: öncelik VLAN başına', cmd: 'spanning-tree vlan 10 priority 0' }] },
            ],
        },
        {
            title: 'Port-Channel Üyesi Aktif Değil (LACP)', severity: 'warn', topic: 'l2', lab: 'dell-16',
            symptom: 'Port-channel up ama bant genişliği düşük ya da bir kablo takılı olduğu hâlde trafik taşımıyor.',
            steps: [
                { code: 'show port-channel summary', desc: 'Port-channel (U) ve üyeler (P) olmalı. (D) = üye down (kablo/port), (I) = üye up ama LACP anlaşmadı (karşı uç farklı modda ya da farklı gruba bağlı).',
                  fix: [{ cause: 'Üye LACP\'siz (on) ya da gruba eklenmemiş: iki uç da LACP olmalı', cmd: 'interface ethernet 1/1/11\n channel-group 1 mode active' }] },
                { code: 'show interface status', desc: 'Üye portlar up olmalı ve aynı hızda çalışmalı. Down üye (D) fiziksel sorundur.',
                  fix: [{ cause: 'Üye port kapalı', cmd: 'interface ethernet 1/1/11\n no shutdown' }] },
                { code: 'show running-configuration interface port-channel 1', desc: 'L2 ayarları (switchport mode trunk, allowed vlan) üyelere değil port-channel\'a yazılır; iki uçta izinli VLAN listesi aynı olmalı.',
                  fix: [{ cause: 'Port-channel VLAN\'ı taşımıyor', cmd: 'interface port-channel 1\n switchport mode trunk\n switchport trunk allowed vlan 10' }] },
            ],
        },
        {
            title: 'VRRP: Beklenen Switch Primary (Master) Değil', severity: 'warn', topic: 'ha', lab: 'dell-16',
            symptom: 'Sanal ağ geçidi çalışıyor ama trafik yedek switch\'ten geçiyor.',
            steps: [
                { code: 'show vrrp brief', desc: 'Grup, Priority ve State sütunları: ana switch\'te State master olmalı. Öncelikler eşitse (varsayılan 100) arayüz IP\'si büyük olan kazanır.',
                  fix: [{ cause: 'Öncelik karşı taraftan yüksek değil', cmd: 'interface vlan 10\n vrrp-group 1\n priority 120' }] },
                { code: 'show running-configuration interface vlan 10', desc: 'İki switch\'te aynı vrrp-group numarası ve aynı virtual-address olmalı; sanal adres switch\'lerin kendi adreslerinden farklı olmalı.',
                  fix: [{ cause: 'Sanal adres tanımlı değil ya da iki uçta farklı', cmd: 'interface vlan 10\n vrrp-group 1\n virtual-address 10.64.10.254' }] },
                { code: 'show ip interface brief', desc: 'vlan 10 SVI\'si up olmalı; SVI down ise VRRP grubu çalışmaz.' },
            ],
        },
        {
            title: 'OSPF Komşuluğu Kurulmuyor (OS10)', severity: 'err', topic: 'routing', lab: 'dell-13',
            symptom: 'Omurgadan öğrenilmesi gereken ağlar tabloda yok; OSPF komşusu listede görünmüyor.',
            steps: [
                { code: 'show ip ospf neighbor', desc: 'Komşu satırı ve State "FULL" olmalı. Komşu hiç yoksa sorun hello aşamasında: alan, alt ağ, passive ya da arayüz.' },
                { code: 'show running-configuration interface ethernet 1/1/12', desc: 'Uplink\'te "ip ospf 1 area 0.0.0.0" olmalı ve alan karşı uçla aynı olmalı. "ip ospf passive" uplink\'te olmamalı (hello gönderilmez).',
                  fix: [{ cause: 'Arayüz OSPF\'e bağlı değil ya da alan yanlış', cmd: 'interface ethernet 1/1/12\n ip ospf 1 area 0.0.0.0' }] },
                { code: 'show running-configuration | find "router ospf"', desc: 'router ospf 1 altında sabit router-id olmalı; iki uçta router-id farklı olmalı.',
                  fix: [{ cause: 'Router-id yok ya da komşuyla aynı', cmd: 'router ospf 1\n router-id 10.64.255.1' }] },
                { code: 'show ip route', desc: 'Komşuluk FULL olduktan sonra uzak ağlar "O" koduyla gelmeli. Aynı önek statik rotayla da tanımlıysa statik (mesafe 1) OSPF\'i (110) ezer.' },
            ],
        },
        {
            title: 'ACL: İzinli Trafik Kesildi ya da Yasak Trafik Geçiyor (OS10)', severity: 'err', topic: 'traffic', lab: 'dell-14',
            symptom: 'ACL değişikliğinden sonra misafir ağının interneti kesildi ya da yönetim sunucusuna SSH yine açık.',
            steps: [
                { code: 'show ip access-lists', desc: 'Kurallar seq sırasıyla denenir, ilk eşleşen kazanır. Sonda "permit ip any any" yoksa örtük deny her şeyi keser; başta geniş bir permit varsa alttaki deny\'lar hiç çalışmaz.',
                  fix: [{ cause: 'Sondaki permit eksik', cmd: 'ip access-list GUEST-IN\n seq 30 permit ip any any' },
                        { cause: 'Deny\'dan önce çalışması gereken istisna: küçük bir sıra numarası verin', cmd: 'ip access-list GUEST-IN\n seq 5 permit tcp host 10.64.20.5 host 10.64.99.10 eq 22' }] },
                { code: 'show running-configuration interface vlan 20', desc: 'ACL, trafiğin switch\'e girdiği misafir SVI\'sinde "ip access-group GUEST-IN in" olmalı. out yönü misafirden gelen trafiği süzmez.',
                  fix: [{ cause: 'ACL yanlış yönde ya da bağlı değil', cmd: 'interface vlan 20\n no ip access-group GUEST-IN out\n ip access-group GUEST-IN in' }] },
            ],
        },
    ];
})();
