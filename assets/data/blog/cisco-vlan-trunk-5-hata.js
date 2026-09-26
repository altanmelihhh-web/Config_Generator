// Blog: Cisco IOS VLAN ve trunk — en sık 5 hata ve show komutlarıyla teşhis. Örnek adlar/VLAN'lar kurgusal.
(window.CG_BLOG = window.CG_BLOG || []).push({
    slug: 'cisco-vlan-trunk-5-hata',
    title: 'Cisco\'da VLAN ve trunk: en sık 5 hata ve show komutlarıyla teşhis',
    date: '2026-09-26',
    summary: 'Yeni VLAN eklendi ama diğer switch\'e geçmiyor, port "inactive", trunk hiç kurulmuyor... Cisco IOS/IOS-XE switch\'lerde en sık görülen beş VLAN/trunk hatası ve her birini gösteren show komutu.',
    tags: ['Cisco', 'IOS', 'VLAN', 'Trunk', '802.1Q', 'Sorun giderme'],
    vendor: 'cisco',
    readMin: 7,
    body: [
        { h: 'Önce dört komut' },
        { p: `VLAN ve trunk sorunlarının neredeyse tamamı dört komutla görünür hâle gelir. Tahmin yürütmeden önce bunları iki uçta da çalıştırın:` },
        { code: `show vlan brief
show interfaces trunk
show interfaces GigabitEthernet1/0/24 switchport
show cdp neighbors detail`, lang: 'cisco-ios' },
        { p: `<code>show interfaces trunk</code> çıktısının dört bölümü özellikle değerlidir: portun modu ve native VLAN'ı, <b>trunk'ta izin verilen</b> VLAN'lar, <b>izinli ve yönetim alanında etkin</b> olan VLAN'lar ve <b>spanning tree'de iletimde olup budanmamış</b> VLAN'lar. Bir VLAN bu listelerin hangisinde kayboluyorsa sorun oradadır.` },
        { h: '1. İzinli VLAN listesini "add" olmadan ezmek' },
        { p: `Trunk'a yeni VLAN 30 eklenmek isteniyor ve şu yazılıyor: <code>switchport trunk allowed vlan 30</code>. Bu komut listeye ekleme yapmaz, listeyi <b>yalnız 30</b> olacak şekilde değiştirir. Sonuç: VLAN 10 ve 20 bir anda kesilir. Doğrusu <code>add</code> anahtar sözcüğüdür.` },
        { code: `interface GigabitEthernet1/0/24
 switchport trunk allowed vlan add 30
! yanlış: switchport trunk allowed vlan 30  (listeyi değiştirir)`, lang: 'cisco-ios' },
        { p: `<b>Teşhis:</b> <code>show interfaces trunk</code> → "Vlans allowed on trunk" satırında beklenen VLAN'lar yoksa liste ezilmiştir. Komutun <code>add</code>, <code>remove</code>, <code>except</code>, <code>all</code> ve <code>none</code> biçimleri vardır; varsayılan durumda 1–4094 arası tüm VLAN'lar izinlidir.` },
        { h: '2. VLAN aradaki switch\'te tanımlı değil' },
        { p: `VLAN 30 iki uç switch'te var, trunk'larda izinli, ama aradaki dağıtım switch'inde hiç oluşturulmamış. O switch VLAN 30 çerçevelerini iletmez. <b>Teşhis:</b> aradaki switch'te <code>show vlan brief</code> VLAN 30'u göstermez; <code>show interfaces trunk</code> çıktısında VLAN 30 "allowed on trunk" altında görünür ama "allowed and active in management domain" altında görünmez.` },
        { code: `vlan 30
 name MISAFIR`, lang: 'cisco-ios' },
        { h: '3. Native VLAN uyuşmazlığı' },
        { p: `802.1Q trunk'ta native VLAN'ın trafiği etiketsiz taşınır ve varsayılan native VLAN 1'dir. Bir uçta native VLAN 99, diğerinde 1 kalırsa etiketsiz çerçeveler karşı tarafta yanlış VLAN'a düşer. Cisco'nun yapılandırma kılavuzu, iki uçtaki native VLAN'ın farklı olmasının spanning tree döngülerine yol açabileceği konusunda açıkça uyarır.` },
        { p: `<b>Teşhis:</b> iki uçta <code>show interfaces trunk</code> → "Native vlan" sütunlarını karşılaştırın. Düzeltme iki uçta aynı değeri yazmaktır.` },
        { code: `interface GigabitEthernet1/0/24
 switchport trunk native vlan 99`, lang: 'cisco-ios' },
        { h: '4. DTP: iki uç da "dynamic auto"' },
        { p: `Catalyst switch'lerde Ethernet portlarının varsayılan modu <code>dynamic auto</code>'dur: port trunk'ı kendisi başlatmaz, karşı taraf isterse kabul eder. İki uç da <code>dynamic auto</code> kalırsa trunk hiç kurulmaz ve bağlantı access port gibi çalışır. <b>Teşhis:</b> <code>show interfaces ... switchport</code> çıktısında "Administrative Mode" (yapılandırılan mod) ile "Operational Mode" (portun fiilen çalıştığı mod) satırlarını karşılaştırın; yapılandırılan mod dynamic auto iken işletimsel mod trunk değilse pazarlık trunk'la sonuçlanmamıştır. <code>show interfaces trunk</code> çıktısında da portun "Status" sütununda trunking görünmesi beklenir.` },
        { code: `interface GigabitEthernet1/0/24
 switchport mode trunk
 switchport nonegotiate`, lang: 'cisco-ios' },
        { p: `Trunk'ı iki uçta da <code>switchport mode trunk</code> ile sabitlemek ve DTP'yi <code>switchport nonegotiate</code> ile kapatmak en öngörülebilir yöntemdir. Kullanıcı portlarında ise <code>switchport mode access</code> yazmak portun trunk olmasını engeller; yalnız access VLAN atayıp modu bırakmak portu <code>dynamic auto</code>'da bırakır.` },
        { note: 'Hem 802.1Q hem ISL destekleyen platformlarda (ör. Catalyst 3560) Cisco\'nun örneği trunk modundan önce kapsüllemeyi belirtir: önce switchport trunk encapsulation dot1q, sonra switchport mode trunk. Catalyst 3650/3850 ve sonrası IOS XE switch\'ler ISL desteklemez; bu modellerde yalnız 802.1Q vardır.' },
        { h: '5. Access port silinmiş (inactive) VLAN\'da' },
        { p: `Bir VLAN silindiğinde ona atanmış portlar başka bir VLAN'a alınmaz; atamaları kalır ve portlar, yeni bir VLAN'a atanana kadar <b>inactive</b> durumda kalır.` },
        { p: `<b>Teşhis:</b> <code>show interfaces ... switchport</code> çıktısındaki "Access Mode VLAN" satırından portun atandığı VLAN'ı okuyun, sonra <code>show vlan brief</code> ile o VLAN'ın switch'te var olup olmadığına bakın. Düzeltme, VLAN'ı yeniden oluşturmak ya da portu doğru VLAN'a atamaktır.` },
        { code: `interface GigabitEthernet1/0/5
 switchport mode access
 switchport access vlan 10`, lang: 'cisco-ios' },
        { h: 'Teşhis sırası (özet)' },
        { list: [
            '<code>show vlan brief</code>: VLAN bu switch\'te var mı, port hangi VLAN\'da?',
            '<code>show interfaces trunk</code>: trunk kuruldu mu, VLAN izinli mi, etkin mi, STP\'de iletimde mi?',
            '<code>show interfaces ... switchport</code>: yönetimsel ve işletimsel mod, access/native VLAN, inactive uyarısı.',
            '<code>show cdp neighbors detail</code>: karşı uçta hangi cihaz ve hangi port var?',
            '<code>show spanning-tree vlan 30</code> ve <code>show mac address-table vlan 30</code>: VLAN iletimde mi, MAC öğreniliyor mu?',
        ] },
    ],
    sources: [
        { title: 'Cisco Catalyst 9300 VLAN Configuration Guide (IOS XE 17.13.x) — Configuring VLAN Trunks', url: 'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-13/configuration_guide/vlan/b_1713_vlan_9300_cg/configuring_vlan_trunks.html' },
        { title: 'Cisco Catalyst 9300 VLAN Configuration Guide (IOS XE 17.13.x) — Configuring VLANs', url: 'https://www.cisco.com/c/en/us/td/docs/switches/lan/catalyst9300/software/release/17-13/configuration_guide/vlan/b_1713_vlan_9300_cg/configuring_vlans.html' },
        { title: 'Cisco — Configure 802.1Q Trunking Between Catalyst Switches', url: 'https://www.cisco.com/c/en/us/support/docs/switches/catalyst-6000-series-switches/10599-88.html' },
    ],
    related: [
        { label: 'Lab: VLAN oluşturma ve access portlar', href: '#/lab/ios-10' },
        { label: 'Lab: "Port çalışıyor ama sorunlu" — arıza kaydı', href: '#/lab/ios-40' },
        { label: 'Lab: EtherChannel — LACP ile trunk', href: '#/lab/ios-15' },
        { label: 'Sorun giderme: erişim portu çalışmıyor (yanlış VLAN)', href: '#/troubleshoot/cisco-ios/108' },
        { label: 'Sorun giderme: EtherChannel üyesi bağlanmıyor', href: '#/troubleshoot/cisco-ios/113' },
        { label: 'Araç: Cisco IOS VLAN üreteci', href: '#/cisco-ios/vlan' },
        { label: 'Cisco IOS komut kütüphanesi', href: '#/cli/cisco-ios' },
    ],
});
