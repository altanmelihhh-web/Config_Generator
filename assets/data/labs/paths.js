'use strict';
// ─── CLI Lab öğrenme yolları ────────────────────────────────────────────────
// Her yol: sıralı modüller; her modülde kısa tanıtım ve lab kimlikleri.
// Henüz yazılmamış lab kimlikleri arayüzde gösterilmez (yarım içerik yok).
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const M = (n, title, desc, labs) => ({ n, title, desc, labs });
    const SWRT = (v, ids) => [
        M(1, 'Cihaz kurulum ve temel ayarlar', 'CLI\'da gezinme, cihaz adı, afiş, parolalar ve kaydetme. Her şeyin temeli.', ids[1]),
        M(2, 'AAA: RADIUS ve TACACS+', 'Kimlik doğrulamayı merkezi sunucuya taşımak; sunucu düşerse yerel hesaba geri dönmek.', ids[2]),
        M(3, 'Uzaktan yönetim: VTY ve SSH', 'Yönetim IP\'si, SSH v2, yalnız SSH ve yerel kullanıcı.', ids[3]),
        M(4, 'Web yönetimini kapatma', 'Kullanılmayan HTTP/HTTPS yönetimini kapatıp saldırı yüzeyini küçültmek.', ids[4]),
        M(5, 'SSH sertleştirme', 'Zayıf şifreleme, anahtar değişimi ve MAC algoritmalarını kapatmak.', ids[5]),
        M(6, 'NAT / PAT', 'İç ağın internete çıkışı ve sunucu yayınlama.', ids[6]),
        M(7, 'DHCP', 'Adres havuzu, hariç adresler ve relay.', ids[7]),
        M(8, 'VLAN', 'Ağı mantıksal olarak bölmek; access ve trunk.', ids[8]),
        M(9, 'Arayüz ayarları', 'Açıklama, hız/dupleks, kapatma ve toplu yapılandırma.', ids[9]),
        M(10, 'Port güvenliği', 'Porta bağlanabilecek MAC sayısını sınırlamak; ihlalde ne olacağı.', ids[10]),
        M(11, 'MAC tablosu', 'Switch\'in kimi nerede gördüğünü okumak; statik MAC, yaşlanma.', ids[11]),
        M(12, 'Spanning Tree', 'Döngüleri önlemek: kenar port koruması ve kök köprü seçimi.', ids[12]),
        M(13, 'Yönlendirme: statik ve OSPF', 'Statik, varsayılan, yüzen rota ve tek alan OSPF.', ids[13]),
        M(14, 'ACL / filtreler', 'Trafiği ve yönetim erişimini kurallarla sınırlamak.', ids[14]),
        M(15, 'Yedekleme ve geri dönüş', 'Otomatik archive, dosyaya/TFTP\'ye yedek, geri alma.', ids[15]),
        M(16, 'Yedeklilik: LACP ve FHRP', 'Link toplama ve ağ geçidi yedekliliği (HSRP/VRRP).', ids[16]),
        M(17, 'Ara sınav: arıza kayıtları', 'Öğrendiklerinizi gerçek arıza senaryolarında birleştirin.', ids[17]),
    ];
    root.CG_LAB_PATHS = [
        { id: 'cisco-swrt', vendor: 'cisco-ios', title: 'Cisco Switch & Router: sıfırdan üretime', desc: 'Kurulumdan yedekliliğe, bir kampüs switch\'i ve şube router\'ını adım adım üretime hazırlayın.',
          modules: SWRT('cisco-ios', { 1: ['ios-00', 'ios-01', 'ios-02'], 2: ['ios-35a'], 3: ['ios-03'], 4: ['ios-35b'], 5: ['ios-35c'], 6: ['ios-31'], 7: ['ios-30'], 8: ['ios-10'], 9: ['ios-04'],
              10: ['ios-34'], 11: ['ios-11m'], 12: ['ios-14', 'ios-13'], 13: ['ios-16', 'ios-17', 'ios-18'], 14: ['ios-32', 'ios-33'], 15: ['ios-05'], 16: ['ios-15', 'ios-22'], 17: ['ios-40', 'ios-43', 'ios-47'] }) },
        { id: 'huawei-swrt', vendor: 'huawei', title: 'Huawei Switch & Router: sıfırdan üretime', desc: 'VRP ile aynı yolu Huawei S/AR cihazlarında yürüyün.',
          modules: SWRT('huawei', { 1: ['hua-01', 'hua-04'], 2: ['hua-05'], 3: ['hua-02'], 4: ['hua-08'], 5: ['hua-09'], 6: ['hua-10'], 7: ['hua-11'], 8: ['hua-03'], 9: ['hua-12'], 10: ['hua-13'], 11: ['hua-14'], 12: ['hua-15'], 13: ['hua-06'], 14: ['hua-07'], 15: ['hua-16'], 16: ['hua-17'], 17: ['hua-40', 'hua-42'] }) },
        { id: 'dell-swrt', vendor: 'dell', title: 'Dell OS10 Switch: sıfırdan üretime', desc: 'OS10 ile veri merkezi erişim switch\'ini adım adım kurun.',
          modules: SWRT('dell', { 1: ['dell-01', 'dell-05'], 2: ['dell-06'], 3: ['dell-02'], 4: ['dell-07'], 7: ['dell-08'], 8: ['dell-03'], 9: ['dell-09'], 10: ['dell-10'], 11: ['dell-11'], 12: ['dell-12'], 13: ['dell-04', 'dell-13'], 14: ['dell-14'], 15: ['dell-15'], 16: ['dell-16'], 17: ['dell-40'] }) },
        { id: 'juniper-swrt', vendor: 'juniper', title: 'Juniper Junos: sıfırdan üretime', desc: 'Candidate/commit mantığıyla EX switch ve SRX/MX router.',
          modules: SWRT('juniper', { 1: ['jun-01', 'jun-02'], 2: ['jun-08'], 3: ['jun-09'], 4: ['jun-10'], 5: ['jun-11'], 6: ['jun-06', 'jun-12'], 7: ['jun-13'], 8: ['jun-04'], 9: ['jun-03', 'jun-14'], 10: ['jun-15'], 11: ['jun-16'], 12: ['jun-17'], 13: ['jun-05', 'jun-18'], 14: ['jun-19'], 15: ['jun-20'], 16: ['jun-21'], 17: ['jun-07', 'jun-22'] }) },
    ];
})();
