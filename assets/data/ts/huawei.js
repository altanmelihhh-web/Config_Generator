'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (huawei) ─────────────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['huawei'] = [
        {
            title: 'VLAN Kullanıcısı Ağ Geçidine Ulaşamıyor (Access / Trunk)', severity: 'err', topic: 'l2', lab: 'hua-40',
            symptom: 'Bir VLAN\'daki kullanıcı (ör. VLAN 20) ağ geçidine ping atamıyor; aynı switch\'teki başka VLAN\'lar sorunsuz.',
            steps: [
                { code: 'display port vlan', desc: 'Kullanıcı portu Link Type "access" ve PVID kullanıcının VLAN\'ı (20) olmalı; "hybrid" ve PVID 1 = port hiç yapılandırılmamış. Uplink "trunk" olmalı ve Trunk VLAN List\'te 20 bulunmalı.',
                  fix: [{ cause: 'Uplink trunk VLAN 20\'yi geçirmiyor: yalnız eksik VLAN\'ı ekleyin (allow-pass vlan all ile "çözmeyin")', cmd: 'interface GigabitEthernet0/0/24\n port trunk allow-pass vlan 20' },
                        { cause: 'Kullanıcı portu yanlış VLAN\'da', cmd: 'interface GigabitEthernet0/0/5\n port default vlan 20' },
                        { cause: 'Kullanıcı portu access yapılmamış (hybrid)', cmd: 'interface GigabitEthernet0/0/5\n port link-type access\n port default vlan 20' }] },
                { code: 'display interface brief', desc: 'PHY sütunu "*down" = shutdown ile kapatılmış (yönetsel); "down" = kablo/karşı uç. Uplink kapalıysa VLAN ayarı doğru olsa bile hiçbir şey geçmez.',
                  fix: [{ cause: 'Uplink yönetsel olarak kapalı', cmd: 'interface GigabitEthernet0/0/24\n undo shutdown' }] },
                { code: 'display vlan 20', desc: 'VLAN 20 üyeleri: kullanıcı portu UT (etiketsiz), uplink TG (etiketli) ve ikisi de (U) olmalı. Üye eksikse ya da (D) görünüyorsa önceki adımlara dönün; VLAN hiç yoksa oluşturun.',
                  fix: [{ cause: 'VLAN tanımlı değil', cmd: 'vlan batch 20' }] },
                { code: 'display mac-address vlan 20', desc: 'Düzeltmeden sonra kullanıcının MAC\'i kendi portunda ve ağ geçidinin MAC\'i uplink\'te öğrenilmiş olmalı. Değişikliği save ile kaydedin.' },
            ],
        },
        {
            title: 'OSPF Komşuluğu Kurulmuyor (Alan / Network / Silent)', severity: 'err', topic: 'routing', lab: 'hua-42', replaces: 'OSPF Komsulugu Kurulmuyor',
            symptom: 'Bakımdan sonra uzak ağlara (OSPF ile öğrenilen) ulaşılamıyor, internet (statik varsayılan rota) çalışıyor.',
            steps: [
                { code: 'display ospf peer brief', desc: 'Komşu satırı ve State "Full" olmalı. Komşu hiç yoksa sorun hello aşamasındadır: arayüz, network kapsamı, alan ya da silent-interface.' },
                { code: 'display ip interface brief', desc: 'Komşuya bakan arayüz doğru IP\'de ve Physical/Protocol "up" olmalı. "*down" = shutdown.',
                  fix: [{ cause: 'Arayüz kapalı', cmd: 'interface GigabitEthernet0/0/1\n undo shutdown' }] },
                { code: 'display current-configuration | begin ospf', desc: 'Arayüz ağı, komşunun alanıyla aynı "area" altında bir network satırıyla kapsanmalı (wildcard: /30 → 0.0.0.3). Arayüz "silent-interface" listesindeyse hello göndermez.',
                  fix: [{ cause: 'Ağ yanlış alanda: yanlış alandan silip doğru alana yazın (OSPF sürecini silmeyin)', cmd: 'ospf 1\n area 1\n undo network 10.64.0.0 0.0.0.3\n quit\n area 0\n network 10.64.0.0 0.0.0.3' },
                        { cause: 'network satırı arayüz adresini kapsamıyor', cmd: 'ospf 1\n area 0\n undo network 10.64.0.4 0.0.0.3\n network 10.64.0.0 0.0.0.3' },
                        { cause: 'Komşuya bakan arayüz silent: hello gönderilmiyor', cmd: 'ospf 1\n undo silent-interface GigabitEthernet0/0/1' }] },
                { code: 'ping 10.64.0.2', desc: 'Komşunun arayüz adresine IP erişimi olmalı. Ping yoksa sorun OSPF\'ten önce: adres/maske ya da fiziksel bağlantı.' },
                { code: 'display ip routing-table', desc: 'Komşuluk Full olduktan sonra uzak ağlar Proto "OSPF", Pre 10 ve NextHop komşu adresiyle görünmeli. Değişikliği save ile kaydedin.' },
            ],
        },
        {
            title: 'DHCP: İstemci Adres ya da Ağ Geçidi Alamıyor', severity: 'err', topic: 'iface', lab: 'hua-11',
            symptom: 'Bir VLAN\'daki bilgisayarlar adres alamıyor ya da adres alıp alt ağı dışına çıkamıyor.',
            steps: [
                { code: 'display current-configuration | include dhcp', desc: 'Çıktıda "dhcp enable" olmalı: DHCP sunucusu da relay de bu komut olmadan çalışmaz. Vlanif\'lerde "dhcp select global" (yerel havuz) ya da "dhcp select relay" görünmeli.',
                  fix: [{ cause: 'DHCP global olarak kapalı', cmd: 'dhcp enable' }] },
                { code: 'display ip pool', desc: 'İstemcinin ağı için bir havuz olmalı: havuz Vlanif\'e adıyla değil, alt ağıyla eşleşir (Vlanif20 = 10.64.20.1/24 → network 10.64.20.0). Gateway değeri boşsa istemci adres alır ama alt ağından çıkamaz.',
                  fix: [{ cause: 'Havuzda ağ geçidi (gateway-list) yok', cmd: 'ip pool VLAN20\n gateway-list 10.64.20.1' },
                        { cause: 'Havuz yok ya da ağı Vlanif\'le uyuşmuyor', cmd: 'ip pool VLAN20\n gateway-list 10.64.20.1\n network 10.64.20.0 mask 255.255.255.0\n dns-list 10.64.99.53' }] },
                { code: 'display current-configuration interface Vlanif20', desc: 'Yerel havuz kullanılacaksa "dhcp select global" olmalı. Sunucu başka ağdaysa "dhcp select relay" ve "dhcp relay server-ip" doğru sunucuyu göstermeli.',
                  fix: [{ cause: 'Vlanif havuzu kullanmıyor', cmd: 'interface Vlanif20\n dhcp select global' },
                        { cause: 'Merkezi sunucu kullanılacak (relay) ya da relay yanlış sunucuyu gösteriyor', cmd: 'interface Vlanif30\n dhcp select relay\n dhcp relay server-ip 10.64.99.5' }] },
                { code: 'display ip pool name VLAN20 used', desc: 'Dağıtılmış adresler ve MAC\'ler. İstemcinin MAC\'i burada görünüyorsa adres verildi; statik cihaz aralığı (ör. .2–.20) listede görünmemeli.',
                  fix: [{ cause: 'Statik cihaz adresleri dağıtılıyor', cmd: 'ip pool VLAN20\n excluded-ip-address 10.64.20.2 10.64.20.20' }] },
            ],
        },
        {
            title: 'Port Güvenliği İhlali: Port Error-Down ya da Yabancı Cihaz', severity: 'err', topic: 'iface', lab: 'hua-13',
            symptom: 'Terminalde port güvenliği alarmı çıktı; bir masa portundaki cihaz ağa çıkamıyor ya da port kapandı.',
            steps: [
                { code: 'display interface brief', desc: 'Kapanan portun PHY sütunu "down" görünür. "*down" ise port elle (shutdown) kapatılmıştır, koruma değil.' },
                { code: 'display interface GigabitEthernet0/0/3', desc: 'İlk satırdaki "current state" ERROR DOWN ise port bir koruma tarafından kapatıldı; parantez içindeki neden kapatanı söyler.',
                  fix: [{ cause: 'Yabancı cihaz söküldü: portu port güvenliğini kapatmadan açın', cmd: 'interface GigabitEthernet0/0/3\n shutdown\n undo shutdown' }] },
                { code: 'display mac-address security', desc: 'Porttaki güvenli MAC\'ler. Port güvenliği açıkken yabancı MAC tabloya giremez; o portta yalnız masadaki cihazın MAC\'i görünmeli.' },
                { code: 'display mac-address sticky', desc: 'Sticky MAC\'ler yapılandırmaya yazılır; masadaki bilgisayar değiştiyse eski sticky MAC yenisini ihlal sayar.' },
                { code: 'display current-configuration interface GigabitEthernet0/0/3', desc: 'port-security max-mac-num masadaki meşru cihaz sayısına uygun olmalı; protect-action shutdown ise ihlalde port kapanır, restrict ise port açık kalır ve alarm üretir.',
                  fix: [{ cause: 'Portun kapanması yerine yabancı trafiği düşürüp alarm üreten eylem isteniyor', cmd: 'interface GigabitEthernet0/0/3\n port-security protect-action restrict' },
                        { cause: 'Masada birden çok meşru cihaz var', cmd: 'interface GigabitEthernet0/0/3\n port-security max-mac-num 2' }] },
            ],
        },
        {
            title: 'STP: Kenar Port Kapandı (BPDU Protection) ya da Kök Köprü Yanlış', severity: 'err', topic: 'l2', lab: 'hua-15',
            symptom: 'Bir kullanıcı portu kendiliğinden kapandı ya da trafik gereksiz uzun yoldan akıyor; kök köprü tasarımdaki switch değil.',
            steps: [
                { code: 'display interface brief', desc: 'Kapanan kullanıcı portunun PHY sütunu "down" görünür; hangi port olduğunu buradan bulun.' },
                { code: 'display interface GigabitEthernet0/0/5', desc: '"current state : ERROR DOWN(bpdu-protection)" = kenar porta BPDU geldi (bir switch takıldı) ve BPDU koruması portu kapattı: koruma çalışıyor.',
                  fix: [{ cause: 'İzinsiz switch söküldü: korumayı kapatmadan portu açın', cmd: 'interface GigabitEthernet0/0/5\n shutdown\n undo shutdown' },
                        { cause: 'Otomatik kurtarma isteniyor', cmd: 'error-down auto-recovery cause bpdu-protection interval 300' }] },
                { code: 'display stp', desc: '"CIST Bridge" bu switch\'in, "CIST Root/ERPC" kökün kimliğidir; ikisi farklıysa kök başka switch\'tir. "CIST RootPortId" köke giden portu, "BPDU-Protection" korumanın açık olup olmadığını gösterir.',
                  fix: [{ cause: 'Kök köprü bu switch olmalı (öncelik 0)', cmd: 'stp root primary' },
                        { cause: 'BPDU koruması kapalı', cmd: 'stp bpdu-protection' }] },
                { code: 'display stp brief', desc: 'Port rolleri: ROOT köke giden port, DESI iletim yapan port, ALTE yedek (DISCARDING). Kullanıcı portları kenar port olmalı; uplink kenar port olmamalı.',
                  fix: [{ cause: 'Kullanıcı portları kenar port değil', cmd: 'port-group USERS\n stp edged-port enable' }] },
            ],
        },
        {
            title: 'Eth-Trunk Üyesi Selected Olmuyor (LACP)', severity: 'warn', topic: 'l2', lab: 'hua-17', replaces: 'Eth-Trunk Uyesi Selected Olmuyor',
            symptom: 'Eth-Trunk up ama bant genişliği düşük ya da bir kablo takılı olduğu hâlde trafik taşımıyor.',
            steps: [
                { code: 'display eth-trunk 1', desc: 'LACP modunda her üyenin Status sütunu "Selected" olmalı; "Unselect" üye trafik taşımaz. "Number Of Up Port In Trunk" üye sayısına eşit olmalı; Partner bölümünde karşı ucun sistem kimliği görünmeli.',
                  fix: [{ cause: 'Bu uç manual, karşı uç LACP (ya da tersi): iki uç aynı modda olmalı', cmd: 'interface Eth-Trunk1\n mode lacp' }] },
                { code: 'display interface brief', desc: 'Üye portlar PHY "up" olmalı; inErrors/outErrors artıyorsa kablo/optik sorunlu. Kopuk kablo ya da kapalı (*down) port üyeyi Unselect bırakır.',
                  fix: [{ cause: 'Üye port kapalı', cmd: 'interface GigabitEthernet0/0/23\n undo shutdown' }] },
                { code: 'display current-configuration interface Eth-Trunk1', desc: 'L2 ayarları (port link-type trunk, allow-pass) üyelere değil Eth-Trunk arayüzüne yazılır; iki uçta izinli VLAN listesi aynı olmalı.',
                  fix: [{ cause: 'Eth-Trunk izinli VLAN listesi eksik', cmd: 'interface Eth-Trunk1\n port link-type trunk\n port trunk allow-pass vlan 10 99' }] },
                { code: 'display current-configuration interface GigabitEthernet0/0/23', desc: 'Üye portta "eth-trunk 1" satırı olmalı ve kendi L2 ayarı olmamalı; üye eklenmeden önce port varsayılan ayarda olmalıdır.',
                  fix: [{ cause: 'Port Eth-Trunk üyesi değil', cmd: 'interface GigabitEthernet0/0/23\n eth-trunk 1' }] },
            ],
        },
        {
            title: 'VRRP: Beklenen Switch Master Değil', severity: 'warn', topic: 'ha', lab: 'hua-17',
            symptom: 'Sanal ağ geçidi çalışıyor ama trafik yedek switch\'ten geçiyor ya da ana switch yeniden açıldıktan sonra Master\'ı geri almıyor.',
            steps: [
                { code: 'display vrrp brief', desc: 'VRID, State (Master/Backup) ve Virtual IP. Ana switch\'te State "Master" olmalı. İki switch de Master görünüyorsa aralarındaki bağlantı (VLAN) koptuğu için birbirlerinin duyurusunu almıyorlar.',
                  fix: [{ cause: 'Öncelik varsayılan (100): eşitlikte arayüz IP\'si büyük olan kazanır', cmd: 'interface Vlanif10\n vrrp vrid 1 priority 120' }] },
                { code: 'display current-configuration interface Vlanif10', desc: 'İki switch\'te aynı VRID ve aynı virtual-ip olmalı; ana switch\'te priority karşı taraftan yüksek olmalı. preempt-mode timer delay yeniden açılışta devralmayı geciktirir.',
                  fix: [{ cause: 'Sanal adres tanımlı değil ya da iki uçta farklı', cmd: 'interface Vlanif10\n vrrp vrid 1 virtual-ip 10.64.10.254' },
                        { cause: 'Yeniden açılışta hazır olmadan devralıyor: gecikme ekleyin', cmd: 'interface Vlanif10\n vrrp vrid 1 preempt-mode timer delay 20' }] },
                { code: 'display interface brief', desc: 'Vlanif10 ve uplink up olmalı. Vlanif down ise VRRP grubu Initialize kalır.' },
            ],
        },
        {
            title: 'NAT (Easy IP): Kullanıcılar İnternete Çıkamıyor ya da Sunucu Dışarıdan Açılmıyor', severity: 'err', topic: 'traffic', lab: 'hua-10',
            symptom: 'Varsayılan rota var ama kullanıcılar internete çıkamıyor ya da içerideki sunucu dışarıdan açılmıyor.',
            steps: [
                { code: 'display nat outbound', desc: 'Easy IP satırı WAN (çıkış) arayüzünde olmalı ve doğru ACL numarasını göstermeli. Satır yoksa ya da LAN arayüzündeyse hiçbir şey çevrilmez.',
                  fix: [{ cause: 'nat outbound yok ya da yanlış arayüzde', cmd: 'interface GigabitEthernet0/0/0\n nat outbound 2000' }] },
                { code: 'display acl 2000', desc: 'NAT\'ta ACL seçicidir: permit kuralı iç ağı kapsamalı (10.64.0.0/16 → wildcard 0.0.255.255). Wildcard yerine maske (255.255.0.0) yazılmışsa hiçbir iç adres eşleşmez.',
                  fix: [{ cause: 'ACL iç ağı kapsamıyor', cmd: 'acl 2000\n rule permit source 10.64.0.0 0.0.255.255' }] },
                { code: 'display nat server', desc: 'Dışarıdan erişilecek sunucu için global adres/port ile inside adres/port doğru olmalı (ör. 203.0.113.10:443 → 10.64.50.10:443).',
                  fix: [{ cause: 'NAT Server tanımlı değil', cmd: 'interface GigabitEthernet0/0/0\n nat server protocol tcp global 203.0.113.10 443 inside 10.64.50.10 443' }] },
                { code: 'display nat session all', desc: 'Kanıt: kullanıcı oturumlarında yeni kaynak adres WAN adresi olmalı (farklı portlarla). Oturum yoksa çeviri yapılmıyor; önceki adımlara dönün.' },
                { code: 'display ip routing-table', desc: '0.0.0.0/0 rotası ISP ağ geçidini göstermeli; rota yoksa NAT doğru olsa da paket çıkmaz.',
                  fix: [{ cause: 'Varsayılan rota yok', cmd: 'ip route-static 0.0.0.0 0.0.0.0 203.0.113.1' }] },
            ],
        },
        {
            title: 'ACL (traffic-filter): Engellenmesi Gereken Trafik Geçiyor', severity: 'err', topic: 'traffic', lab: 'hua-07',
            symptom: 'Gelişmiş ACL yazıldı ama misafir ağı yönetim sunucusuna yine SSH/Telnet yapabiliyor.',
            steps: [
                { code: 'display traffic-filter applied-record', desc: 'ACL, trafiğin router\'a girdiği arayüzde "inbound" yönünde uygulanmış olmalı (misafirden gelen trafik için misafir arayüzü). outbound ya da başka arayüz = trafik eşleşmez.',
                  fix: [{ cause: 'Filtre yanlış yönde ya da yanlış arayüzde', cmd: 'interface GigabitEthernet0/0/2\n undo traffic-filter outbound\n traffic-filter inbound acl 3000' }] },
                { code: 'display acl 3000', desc: 'Kurallar numara sırasıyla denenir, ilk eşleşen kazanır. deny kuralının kaynağı, hedefi ve portu (eq 22 / telnet) doğru olmalı; önde geniş bir permit olmamalı. Dikkat: traffic-filter\'da hiçbir kurala uymayan trafik İZİNLİDİR (Cisco\'nun örtük deny\'ından farklı).',
                  fix: [{ cause: 'Deny kuralı eksik', cmd: 'acl 3000\n rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 22' },
                        { cause: '"Yalnız izinliler geçsin" isteniyorsa sona açık bir deny ekleyin', cmd: 'acl 3000\n rule deny ip' }] },
            ],
        },
    ];
})();
