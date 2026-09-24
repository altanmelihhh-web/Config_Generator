'use strict';

// ─── Sertifikasyon haritası ──────────────────────────────────────────────────
//
// Sertifikasyon programları sık değişir. Buradaki her kayıt Eylül 2026'da
// kaynağından kontrol edilmiştir ve doğrulama durumu kullanıcıya GÖSTERİLİR:
//
//   ✓ resmi   — vendor'ın kendi sayfasından doğrulandı
//   ~ 3. parti — eğitim sağlayıcı / topluluk kaynağı; vendor sayfası erişilemedi
//   ? teyit    — doğrulanamadı, üretimde kullanmadan önce kontrol edilmeli
//
// Ezberden sınav kodu YAZILMAZ. Doğrulanamayan kod hiç yazılmaz.

function cgCertBadge(kind) {
    const m = {
        resmi:  ['✓', 'Resmi kaynaktan doğrulandı', 'cg-cert-ok'],
        ucuncu: ['~', 'Üçüncü parti kaynak — vendor sayfası erişilemedi', 'cg-cert-warn'],
        teyit:  ['?', 'Doğrulanamadı — kullanmadan önce teyit edin', 'cg-cert-unk'],
        emekli: ['✕', 'Emekli edildi — artık alınamaz', 'cg-cert-dead']
    };
    const b = m[kind];
    if (!b) return '';
    return `<span class="cg-cert-badge ${b[2]}" title="${b[1]}">${b[0]}</span>`;
}

// Gereklilik etiketi — bir sınavın sertifikayı almak için zorunlu mu, seçmeli mi
// olduğunu gösterir. Bu ayrım kritik: örneğin CCNP'de core sınavı geçmek tek
// başına sertifikayı VERMEZ, bir konsantrasyon sınavı daha gerekir.
function cgCertReq(kind) {
    const m = {
        zorunlu:  ['ZORUNLU',   'Bu sertifikayı almak için şart', 'cg-req-must'],
        secmeli:  ['SEÇMELİ',   'Listeden biri seçilir — biri zorunludur', 'cg-req-pick'],
        onkosul:  ['ÖN KOŞUL',  'Diğer sınavlara girmek için önce bu gerekir', 'cg-req-pre'],
        otomatik: ['OTOMATİK',  'Ayrı sınav yok; koşullar sağlanınca verilir', 'cg-req-auto'],
        bagimsiz: ['BAĞIMSIZ',  'Kendi başına alınır, bir üst sertifikanın parçası değil', 'cg-req-free'],
        lab:      ['LAB',       'Uygulamalı laboratuvar sınavı', 'cg-req-lab']
    };
    const b = m[kind];
    if (!b) return '';
    return `<span class="cg-cert-req ${b[2]}" title="${b[1]}">${b[0]}</span>`;
}

// Seviye merdiveni — vendor'ın kademe yapısını gösterir
function cgCertLadder(steps, opt) {
    opt = opt || {};
    const w = 560, stepW = Math.min(150, (w - 40) / steps.length - 14);
    const gap = (w - steps.length * stepW) / (steps.length + 1);
    const nodes = [], links = [];
    steps.forEach((s, i) => {
        const x = gap + stepW / 2 + i * (stepW + gap);
        nodes.push({ x, y: 46, w: stepW, h: 52, kind: s.kind || 'router',
                     label: s.label, sub: s.sub });
        if (i > 0) {
            const px = gap + stepW / 2 + (i - 1) * (stepW + gap);
            links.push({ x1: px + stepW / 2 + 2, y1: 46, x2: x - stepW / 2 - 2, y2: 46, arrow: true });
        }
    });
    return cgDia({
        w, h: 92, alt: opt.alt || 'Sertifikasyon seviye merdiveni',
        nodes, links, notes: opt.notes || []
    });
}

// Vendor kartı: merdiven + ayrıntı tablosu + emekli olanlar + bizim modüllerimiz
function cgCertVendor(v) {
    const rows = v.certs.map(c => [
        c.level,
        `<strong>${c.name}</strong>` + (c.badge ? ' ' + cgCertBadge(c.badge) : ''),
        c.req ? cgCertReq(c.req) : '',
        c.code ? `<code>${c.code}</code>` : '<span class="cg-cert-nocode">yayınlanmıyor</span>',
        c.topics
    ]);
    const retired = (v.retired && v.retired.length)
        ? `<div class="cg-cert-retired"><strong>${cgCertBadge('emekli')} Emekli edildi</strong>
           <ul>${v.retired.map(r => `<li>${r}</li>`).join('')}</ul></div>`
        : '';
    const ours = (v.ours && v.ours.length)
        ? `<div class="cg-cert-ours"><strong>Bu araçtaki karşılığı</strong>
           <p>${v.ours.join(' · ')}</p></div>`
        : '';
    const warn = v.warn
        ? `<div class="cg-cert-warnbox">${v.warn}</div>`
        : '';
    return cgRefCard(v.title, v.icon,
        (v.ladder || '') +
        (v.intro ? `<p class="cg-cert-intro">${v.intro}</p>` : '') +
        cgRefTable(['Seviye', 'Sertifika', 'Gereklilik', 'Sınav kodu', 'Kapsam'], rows) +
        warn + retired + ours);
}

CgReference.certmap = {
    label: 'Sertifikasyon Haritası',
    init(container) {

        // ── Cisco ────────────────────────────────────────────────────────────
        const cisco = cgCertVendor({
            title: 'Cisco — Enterprise, Security, Data Center',
            icon: 'fas fa-network-wired',
            ladder: cgCertLadder([
                { label: 'CCST',  sub: 'Entry',        kind: 'cloud'    },
                { label: 'CCNA',  sub: 'Associate',    kind: 'server'   },
                { label: 'CCNP',  sub: 'Professional', kind: 'router'   },
                { label: 'CCIE',  sub: 'Expert',       kind: 'firewall' }
            ], { alt: 'Cisco sertifikasyon kademeleri' }),
            intro: `Cisco 2020'de tüm associate sertifikalarını <strong>tek bir CCNA</strong> altında birleştirdi.
                    Professional seviyede yapı <strong>core sınav + 1 konsantrasyon</strong> şeklindedir:
                    core sınavı geçmek CCNP'yi tek başına vermez, bir konsantrasyon sınavı daha gerekir.
                    Core sınav aynı zamanda CCIE yazılı aşaması sayılır.`,
            certs: [
                { level: 'Entry',        name: 'CCST Networking / Cybersecurity', code: '', req: 'bagimsiz', badge: 'resmi',
                  topics: 'Temel ağ kavramları, temel güvenlik' },
                { level: 'Associate',    name: 'CCNA', code: '200-301', req: 'bagimsiz', badge: 'resmi',
                  topics: 'VLAN, STP, EtherChannel · tek alan OSPF · ACL, NAT, DHCP, SSH · temel wireless ve otomasyon' },
                { level: 'Associate',    name: 'CCNA Cybersecurity', code: '', badge: 'resmi',
                  topics: 'Güvenlik operasyon temelleri' },
                { level: 'Associate',    name: 'CCNA Automation', code: '', badge: 'resmi',
                  topics: 'Ağ otomasyonu — eski DevNet Associate\'in ağ tarafı' },
                { level: 'Professional', name: 'CCNP Enterprise — core', code: '350-401 ENCOR', req: 'zorunlu', badge: 'resmi',
                  topics: 'İleri OSPF / EIGRP / BGP · GRE, DMVPN, VRF-Lite · QoS, multicast · güvenlik ve otomasyon temeli' },
                { level: '↳ konsantrasyon', name: 'ENARSI — İleri yönlendirme', code: '300-410', req: 'secmeli', badge: 'resmi',
                  topics: '<strong>MPLS LDP, L3VPN</strong>, ileri BGP/EIGRP/OSPF sorun giderme, VRF' },
                { level: '↳ konsantrasyon', name: 'ENSDWI — SD-WAN', code: '300-415', req: 'secmeli', badge: 'resmi',
                  topics: 'Catalyst SD-WAN mimarisi, politika, dağıtım' },
                { level: '↳ konsantrasyon', name: 'ENSLD / ENAUTO / ENCC / ENNA', code: '300-420 / 435 / 440 / 445', req: 'secmeli', badge: 'resmi',
                  topics: 'Tasarım · otomasyon · bulut bağlantısı · ağ güvencesi' },
                { level: 'Professional', name: 'CCNP Security — core', code: '350-701 SCOR', req: 'zorunlu', badge: 'resmi',
                  topics: 'Ağ güvenliği, bulut, içerik, uç nokta, güvenli erişim' },
                { level: '↳ konsantrasyon', name: 'SNCF — Firepower', code: '300-710', req: 'secmeli', badge: 'resmi',
                  topics: '<strong>FTD / ASA politika</strong>, NAT, IPS, yüksek erişilebilirlik' },
                { level: '↳ konsantrasyon', name: 'SISE / SSCA / SDSI', code: '300-715 / 740 / 745', req: 'secmeli', badge: 'resmi',
                  topics: 'ISE ve NAC · güvenli bulut erişimi · dağıtık altyapı' },
                { level: 'Professional', name: 'CCNP Data Center — core', code: '350-601 DCCOR', req: 'zorunlu', badge: 'resmi',
                  topics: '<strong>NX-OS, vPC, VXLAN/EVPN</strong>, ACI, depolama ağı, otomasyon' },
                { level: 'Expert',       name: 'CCIE Enterprise Infrastructure / Security / Data Center', code: '', req: 'lab', badge: 'resmi',
                  topics: 'Core yazılı sınav + 8 saatlik laboratuvar · tasarım, dağıtım, işletme, optimizasyon' }
            ],
            retired: [
                '<strong>CCNA Security</strong>, CCNA Routing &amp; Switching, CCNA Wireless, CCNA Data Center, CCNA Cyber Ops, CCENT — 24 Şubat 2020\'de tek CCNA altında birleştirildi ' + cgCertBadge('ucuncu') + ' <em>(tarih üçüncü parti; Cisco\'nun güncel listesinde bulunmadıkları resmi olarak doğrulandı)</em>'
            ],
            ours: ['VLAN', 'ACL', 'NAT', 'OSPF', 'BGP', 'EIGRP Named', 'MPLS / L3VPN', 'VRF-Lite',
                   'GRE', 'DMVPN', 'IPsec', 'QoS', 'STP', 'EtherChannel', 'HSRP/VRRP', 'Zone-Based FW']
        });

        // ── Juniper ──────────────────────────────────────────────────────────
        const juniper = cgCertVendor({
            title: 'Juniper — dört track, dört kademe',
            icon: 'fas fa-leaf',
            ladder: cgCertLadder([
                { label: 'JNCIA', sub: 'Associate',    kind: 'server'   },
                { label: 'JNCIS', sub: 'Specialist',   kind: 'switch'   },
                { label: 'JNCIP', sub: 'Professional', kind: 'router'   },
                { label: 'JNCIE', sub: 'Expert (lab)', kind: 'firewall' }
            ], { alt: 'Juniper sertifikasyon kademeleri' }),
            intro: `Juniper'da kademe adı sabittir, <strong>track son eki değişir</strong>:
                    <code>-ENT</code> enterprise, <code>-SEC</code> güvenlik (SRX), <code>-DC</code> veri merkezi,
                    <code>-SP</code> servis sağlayıcı. Her track kendi içinde Associate → Expert ilerler;
                    <code>JNCIA-Junos</code> çoğu track için ortak giriş noktasıdır.`,
            certs: [
                { level: 'Associate',    name: 'JNCIA-Junos', code: '', req: 'onkosul', badge: 'resmi',
                  topics: 'Junos CLI, konfigürasyon hiyerarşisi (<code>set</code> / candidate / commit), yönlendirme temelleri' },
                { level: 'Specialist',   name: 'JNCIS-ENT', code: '', badge: 'resmi',
                  topics: 'OSPF, BGP, switching, VLAN, temel politika' },
                { level: 'Professional', name: 'JNCIP-ENT', code: '', badge: 'resmi',
                  topics: 'İleri yönlendirme, MPLS, routing policy, sınıf bazlı iletim' },
                { level: 'Expert',       name: 'JNCIE-ENT', code: '', req: 'lab', badge: 'resmi',
                  topics: 'Laboratuvar sınavı' },
                { level: 'Associate',    name: 'JNCIA-SEC', code: '', badge: 'resmi',
                  topics: 'SRX temel, zone ve politika, NAT' },
                { level: 'Specialist',   name: 'JNCIS-SEC', code: '', badge: 'resmi',
                  topics: 'UTM, IPS, ALG' },
                { level: 'Professional', name: 'JNCIP-SEC', code: '', badge: 'resmi',
                  topics: '<strong>IPsec VPN, AppSecure, chassis cluster (HA)</strong>' },
                { level: 'Associate→Expert', name: 'JNCIA / JNCIS / JNCIP / JNCIE-DC', code: '', badge: 'resmi',
                  topics: '<strong>EVPN-VXLAN</strong>, IP fabric, QFX platformu' },
                { level: 'Specialist→Expert', name: 'JNCIS / JNCIP / JNCIE-SP', code: '', badge: 'resmi',
                  topics: '<strong>MPLS, L2VPN / L3VPN</strong>, servis sağlayıcı yönlendirme' }
            ],
            warn: `${cgCertBadge('teyit')} <strong>Sınav kodları (JN0-xxx) burada yazılmamıştır.</strong>
                   Juniper'ın öğrenme portalı kod listesini sunucu tarafında render ettiği için
                   resmi teyit alınamadı; ezberden yazmak yerine boş bırakıldı.
                   Kademe ve track yapısı resmi portaldan doğrulanmıştır.`,
            ours: ['Junos interface / VLAN', 'OSPF', 'BGP', 'MPLS', 'SRX zone &amp; policy', 'SRX NAT',
                   'IPsec VPN', 'chassis cluster']
        });

        // ── Huawei ───────────────────────────────────────────────────────────
        const huawei = cgCertVendor({
            title: 'Huawei — Datacom ve Security',
            icon: 'fas fa-tower-broadcast',
            ladder: cgCertLadder([
                { label: 'HCIA', sub: 'Associate',    kind: 'server'   },
                { label: 'HCIP', sub: 'Professional', kind: 'router'   },
                { label: 'HCIE', sub: 'Expert',       kind: 'firewall' }
            ], { alt: 'Huawei sertifikasyon kademeleri' }),
            intro: `Huawei üç kademe kullanır. <strong>Datacom</strong>, eski Routing &amp; Switching
                    sertifikasyonunun yerini <strong>2021 Q4'te tamamen aldı</strong> — eski R&amp;S adı artık geçersizdir.
                    HCIP seviyesinde yapı <strong>zorunlu Core sınavı + 1 konsantrasyon</strong> şeklindedir.`,
            certs: [
                { level: 'Associate',    name: 'HCIA-Datacom', code: 'H12-811', badge: 'ucuncu',
                  topics: 'VRP CLI, VLAN, STP, Eth-Trunk, statik yönlendirme, tek alan OSPF, ACL, NAT, DHCP, temel WLAN' },
                { level: 'Professional', name: 'HCIP-Datacom — Core (zorunlu)', code: 'H12-821', req: 'zorunlu', badge: 'ucuncu',
                  topics: 'OSPF, IS-IS, BGP · MPLS · ileri VLAN · multicast · IPv6 · ağ güvenilirliği' },
                { level: '↳ konsantrasyon', name: 'Advanced Routing &amp; Switching (ARST)', code: 'H12-831', req: 'secmeli', badge: 'ucuncu',
                  topics: '<strong>VXLAN/EVPN (kampüs)</strong>, ileri yönlendirme ve anahtarlama' },
                { level: '↳ konsantrasyon', name: 'Campus / WAN / SD-WAN Planning · Solution Design · Network Automation', code: '', req: 'secmeli', badge: 'resmi',
                  topics: 'Kampüs ağ planlama · WAN tasarımı · SD-WAN · çözüm tasarımı · otomasyon geliştirici' },
                { level: 'Expert',       name: 'HCIE-Datacom', code: 'H12-891 + lab', req: 'lab', badge: 'ucuncu',
                  topics: 'Çapraz domain tasarım, SR / SRv6, VXLAN/EVPN, otomasyon' },
                { level: 'Associate',    name: 'HCIA-Security', code: 'H12-711', badge: 'ucuncu',
                  topics: 'USG firewall temel, güvenlik politikası, NAT, temel VPN' },
                { level: 'Professional', name: 'HCIP-Security', code: 'H12-725', badge: 'ucuncu',
                  topics: 'İleri firewall, IPsec / SSL VPN, IPS ve AV, <strong>hot-standby (HA)</strong>' },
                { level: 'Expert',       name: 'HCIE-Security', code: '', req: 'lab', badge: 'teyit',
                  topics: 'Uçtan uca güvenlik mimarisi (yazılı + laboratuvar)' }
            ],
            warn: `${cgCertBadge('ucuncu')} <strong>Sınav kodları üçüncü parti kaynaklıdır.</strong>
                   Huawei'nin sertifikasyon portalı (<code>e.huawei.com</code>) tüm denemelerde HTTP 403 döndürdü.
                   <strong>Kademe yapısı, konsantrasyon listesi ve R&amp;S'in emekliye ayrılması resmi duyurudan doğrulandı;</strong>
                   kod sürüm numaraları (V4.0 vb.) değişmiş olabilir — sınava girmeden önce Huawei portalından teyit edin.`,
            ours: ['VRP interface / VLAN', 'STP', 'Eth-Trunk', 'OSPF', 'BGP', 'ACL', 'traffic-filter',
                   'USG güvenlik politikası', 'NAT', 'IPsec', 'CloudEngine VXLAN']
        });

        // ── Fortinet ─────────────────────────────────────────────────────────
        const fortinet = cgCertVendor({
            title: 'Fortinet — NSE 1-8',
            icon: 'fas fa-shield-halved',
            ladder: cgCertLadder([
                { label: 'NSE 1-3', sub: 'Foundational', kind: 'cloud'    },
                { label: 'NSE 4',   sub: 'Associate',    kind: 'server'   },
                { label: 'NSE 5-6', sub: 'Advanced',     kind: 'router'   },
                { label: 'NSE 7-8', sub: 'Expert',       kind: 'firewall' }
            ], { alt: 'Fortinet NSE kademeleri' }),
            intro: `<strong>Program iki kez yeniden adlandırıldı.</strong> 2024'te NSE bırakılıp
                    FCA / FCF / FCP / FCSS / FCX adlandırmasına geçildi; <strong>15 Temmuz 2026'da NSE 1-8'e geri dönüldü</strong>.
                    Aktif FCP / FCSS sahiplerine karşılık gelen NSE rozeti otomatik verildi (FCP → NSE 4/5/6, FCSS → NSE 6/7);
                    başvuru veya ücret gerekmedi, sertifika tarihleri korundu.
                    Bugün geçerli olan adlandırma <strong>NSE</strong>'dir.`,
            certs: [
                { level: 'NSE 1-2', name: 'Foundational', code: '', badge: 'resmi',
                  topics: 'Siber güvenlik temelleri · yeni nesil güvenlik duvarı kavramları' },
                { level: 'NSE 3',   name: 'Foundational', code: '', badge: 'resmi',
                  topics: 'FortiGate üzerinde üst düzey operasyon' },
                { level: 'NSE 4',   name: 'FortiOS', code: '', badge: 'resmi',
                  topics: '<strong>FortiGate politika, NAT, temel SD-WAN, loglama</strong> — günlük yönetim (gözetimli sınav)' },
                { level: 'NSE 5-6', name: 'Intermediate / Advanced', code: '', badge: 'resmi',
                  topics: 'FortiManager, FortiAnalyzer · ileri FortiGate · çözüm kurulum ve yönetimi' },
                { level: 'NSE 7',   name: 'Expert', code: '', badge: 'resmi',
                  topics: '<strong>İleri tasarım, SD-WAN, IPsec, HA, güvenli erişim</strong> ve sorun giderme' },
                { level: 'NSE 8',   name: 'Elite Expert', code: '', badge: 'resmi',
                  topics: 'Uçtan uca karmaşık ağ güvenliği (yazılı + pratik laboratuvar)' }
            ],
            warn: `Track'ler: <strong>Secure Networking</strong> · Security Operations · Cloud Security ·
                   <strong>OT Security</strong> · SASE.<br>
                   ${cgCertBadge('resmi')} Fortinet yeni programda sınav kodu yayınlamıyor — sertifika adı sınav adıdır.
                   NSE 4-8 gözetimli (Pearson VUE / ProctorU), tüm sertifikalar <strong>2 yıl</strong> geçerli.`,
            ours: ['FortiGate interface', 'firewall policy', 'adres ve servis nesneleri', 'VIP / DNAT',
                   'SNAT', 'IPsec VPN', 'SSL-VPN', 'SD-WAN', 'HA', 'statik yönlendirme', 'zone']
        });

        // ── Palo Alto ────────────────────────────────────────────────────────
        const panw = cgCertVendor({
            title: 'Palo Alto Networks — rol bazlı yeni program',
            icon: 'fas fa-fire',
            ladder: cgCertLadder([
                { label: 'Apprentice',   sub: 'Foundational',  kind: 'cloud'    },
                { label: 'Professional', sub: 'Geniş kapsam',  kind: 'server'   },
                { label: 'Specialist',   sub: 'Derin uzmanlık', kind: 'router'  },
                { label: 'Architect',    sub: 'Mimari',        kind: 'firewall' }
            ], { alt: 'Palo Alto sertifikasyon kademeleri' }),
            intro: `Palo Alto <strong>ürün bazlı sertifikasyonu bırakıp rol bazlıya geçti</strong>.
                    Bu, sektördeki en büyük yapısal değişikliklerden biri:
                    uzun yıllar standart olan <strong>PCNSA ve PCNSE artık alınamıyor</strong>.
                    Yeni programda Professional geniş kapsamlı giriş, Specialist ise belirli bir role odaklı derinliktir —
                    yani Professional → Specialist sıralı bir merdiven değil, farklı eksenlerdir.`,
            certs: [
                { level: 'Foundational', name: 'Cybersecurity Apprentice / Practitioner', code: '', badge: 'resmi',
                  topics: 'Siber güvenlik temelleri' },
                { level: 'Professional', name: 'Network Security Professional', code: '', badge: 'resmi',
                  topics: 'Ağ güvenliği portföyünün kurulumu, konfigürasyonu, bakımı ve dağıtımı' },
                { level: 'Specialist',   name: 'Network Security Analyst', code: '', badge: 'resmi',
                  topics: '<strong>Nesne ve politika oluşturma</strong>, merkezi yönetim, Strata Cloud Manager ve Logging Service' },
                { level: 'Specialist',   name: 'Next-Generation Firewall Engineer', code: '', badge: 'resmi',
                  topics: '<strong>PAN-OS ağ yapılandırması, cihaz ayarları, nesne ve politika, NGFW operasyonu</strong>, entegrasyon ve otomasyon' },
                { level: 'Specialist',   name: 'SD-WAN Engineer / Security Service Edge Engineer', code: '', badge: 'resmi',
                  topics: 'SD-WAN · Prisma Access ve SASE' },
                { level: 'Architect',    name: 'Network Security Architect', code: '', badge: 'resmi',
                  topics: 'Uçtan uca ağ güvenliği mimarisi' }
            ],
            warn: `${cgCertBadge('resmi')} Yeni programda <strong>sınav kodu yayınlanmıyor</strong>; sertifika adı sınav adıdır.
                   Eski PCNSE / PCNSA kodlarıyla karıştırmayın.`,
            retired: [
                '<strong>PCNSA</strong> — 31 Ağustos 2024 ' + cgCertBadge('ucuncu'),
                '<strong>PCNSE</strong> — 31 Temmuz 2025 ' + cgCertBadge('ucuncu'),
                '<em>Tarihler üçüncü parti kaynaklı; her ikisinin de PANW\'ın güncel resmi listesinde bulunmadığı doğrulandı.</em>',
                '"Generalist" adı 30 Mayıs 2025\'te "Professional" olarak değiştirildi ' + cgCertBadge('ucuncu')
            ],
            ours: ['PAN-OS interface', 'zone', 'güvenlik politikası', 'NAT', 'adres ve servis nesneleri',
                   'statik yönlendirme', 'IPsec', 'HA']
        });

        // ── F5 ───────────────────────────────────────────────────────────────
        const f5 = cgCertVendor({
            title: 'F5 BIG-IP — beş sınavlı yeni Administrator yapısı',
            icon: 'fas fa-scale-balanced',
            intro: `F5 sertifikasyonu <strong>23 Nisan 2025'te baştan kurgulandı</strong>.
                    Tek bir geniş sınav yerine, F5 Certified Administrator (F5-CA) artık
                    <strong>beş ayrı küçük sınavın tamamının</strong> geçilmesini gerektiriyor.
                    Sınavlar istenen sırada alınabilir; her biri 30 soru / 30 dakika / 50 USD.`,
            certs: [
                { level: 'Administrator', name: 'Install, Initial Configuration &amp; Upgrade', code: 'F5CAB1', req: 'zorunlu', badge: 'resmi',
                  topics: 'Kurulum, ilk yapılandırma, sürüm yükseltme' },
                { level: 'Administrator', name: 'Data Plane Concepts', code: 'F5CAB2', req: 'zorunlu', badge: 'resmi',
                  topics: 'Trafik akışı kavramları, <strong>virtual server, pool, profil</strong>' },
                { level: 'Administrator', name: 'Data Plane Configuration', code: 'F5CAB3', req: 'zorunlu', badge: 'resmi',
                  topics: '<strong>Load balancing yöntemleri, SSL profilleri, persistence, monitör</strong>' },
                { level: 'Administrator', name: 'Control Plane Administration', code: 'F5CAB4', req: 'zorunlu', badge: 'resmi',
                  topics: 'Yönetim düzlemi, kullanıcı ve rol yönetimi, yedekleme' },
                { level: 'Administrator', name: 'Support &amp; Troubleshoot', code: 'F5CAB5', req: 'zorunlu', badge: 'resmi',
                  topics: 'Sorun giderme, log analizi, destek süreçleri' },
                { level: 'Yenileme',      name: 'F5-CA BIG-IP Recertification', code: 'F5CABR', badge: 'resmi',
                  topics: 'Yenileme; süresi dolmuş F5-CA sertifikalarını yeniden aktive eder' },
                { level: 'Specialist',    name: '301a / 301b LTM Specialist', code: '', badge: 'teyit',
                  topics: 'LTM ileri seviye — <strong>güncel durumu doğrulanamadı</strong>' }
            ],
            warn: `${cgCertBadge('teyit')} <code>support.education.f5.com</code> ve <code>my.f5.com</code> HTTP 403 döndürdü;
                   <strong>301a / 301b ve F5-CTS / F5-CSE seviyelerinin güncel durumu doğrulanamadı.</strong>
                   Administrator yapısı F5 DevCentral'ın resmi duyurusundan doğrulanmıştır.`,
            retired: [
                '<strong>101 — Application Delivery Fundamentals</strong>: 30 Nisan 2025\'te kaldırıldı, yeniden girilemiyor ' + cgCertBadge('resmi'),
                '<strong>201 — TMOS Administration</strong>: yeni adaylara kapalı; yalnızca 30 Nisan 2025\'ten önce 101\'i geçenler, o tarihten itibaren 2 yıl içinde girebiliyor ' + cgCertBadge('resmi'),
                '<em>"201-LTM" ve "F5-301" gibi kod yazımları hiçbir zaman doğru değildi — 201 genel TMOS sınavıydı.</em>'
            ],
            ours: ['virtual server', 'pool ve pool member', 'monitör', 'persistence', 'SSL profil', 'iRule', 'HA']
        });

        // ── Check Point ──────────────────────────────────────────────────────
        const checkpoint = cgCertVendor({
            title: 'Check Point — CCSA / CCSE / CCSM',
            icon: 'fas fa-lock',
            ladder: cgCertLadder([
                { label: 'CCSA',      sub: 'Administrator', kind: 'server'   },
                { label: 'CCSE',      sub: 'Expert',        kind: 'router'   },
                { label: 'CCSM',      sub: 'Master',        kind: 'firewall' },
                { label: 'CCSM Elite', sub: 'Master Elite', kind: 'cloud'    }
            ], { alt: 'Check Point sertifikasyon kademeleri' }),
            intro: `Check Point sınav kodları <strong>sürüm numarasını taşır</strong>:
                    <code>156-215.<u>82</u></code> ifadesindeki 82, yazılım sürümü <strong>R82</strong> demektir.
                    Sürüm değiştiğinde kod da değişir — R81.20 dönemindeki
                    <code>156-215.81.20</code> artık eski sürümdür.`,
            certs: [
                { level: 'Associate', name: 'CCSA — Certified Security Administrator', code: '156-215.82', badge: 'resmi',
                  topics: 'Security Gateway ve Management Software Blade yapılandırma, <strong>SmartConsole, politika yönetimi</strong>' },
                { level: 'Professional', name: 'CCSE — Certified Security Expert', code: '156-315.82', badge: 'resmi',
                  topics: 'İleri tasarım ve optimizasyon, <strong>VPN, ClusterXL / HA</strong>, sorun giderme' },
                { level: 'Master',    name: 'CCSM — Certified Security Master', code: '', badge: 'teyit',
                  topics: 'Infinity mimarisi, ileri sorun giderme — iki ISA sınavı gerektirir, <strong>kodlar doğrulanamadı</strong>' },
                { level: 'Master Elite', name: 'CCSM Elite', code: '', badge: 'resmi',
                  topics: 'En üst teknik ustalık seviyesi' }
            ],
            warn: `${cgCertBadge('resmi')} Check Point'in resmi Certification FAQ belgesinden (revizyon 3/2026) doğrulandı.`,
            ours: ['Gaia interface', 'ağ ve servis nesneleri', 'güvenlik politikası', 'NAT', 'ClusterXL',
                   'site-to-site VPN', 'Remote Access VPN', 'HTTPS inspection', 'IPS', 'Anti-Bot']
        });

        // ── Arista, MikroTik, Dell, Citrix ───────────────────────────────────
        const arista = cgCertVendor({
            title: 'Arista — ACE Learning Track',
            icon: 'fas fa-server',
            intro: `Eski <strong>Arista Cloud Engineer (L1-L7)</strong> programı,
                    <strong>Arista Certified Engineer (ACE) Learning Track</strong> programına dönüştü.
                    Professional seviyesi ayrı bir sınavla değil, <strong>bir domain'in her iki Specialist alt track'i
                    tamamlanınca otomatik olarak</strong> verilir.`,
            certs: [
                { level: 'Associate',    name: 'ACE Associate <em>(eski L1)</em>', code: '', badge: 'resmi',
                  topics: 'EOS temelleri, ağ temelleri' },
                { level: 'Specialist',   name: 'ACE Specialist <em>(eski L3)</em>', code: '', badge: 'resmi',
                  topics: 'Alt track\'ler: DC Ops / DC Eng · Campus Ops / Campus Eng · Automation Foundations / Advanced — <strong>MLAG, VXLAN/EVPN, CloudVision</strong>' },
                { level: 'Professional', name: 'ACE Professional <em>(eski L5)</em>', code: '', req: 'otomatik', badge: 'resmi',
                  topics: 'Bir domain\'in her iki Specialist alt track\'i alınınca otomatik verilir' },
                { level: 'Expert',       name: 'ACE Expert <em>(eski L7)</em>', code: '', badge: 'resmi',
                  topics: 'Çok domainli mimari' }
            ],
            warn: `Track'ler: Network Foundations · Data Center · Campus · WAN Routing · Automation.<br>
                   ${cgCertBadge('ucuncu')} Eski L1-L5 sınavlarının 31 Aralık 2025'te EOL olduğu ve Level 6'nın emekli edildiği
                   üçüncü parti kaynaklıdır; Arista'nın resmi sayfası EOL tarihi vermiyor.`,
            ours: ['EOS interface / VLAN', 'MLAG', 'BGP', 'OSPF', 'EVPN-VXLAN', 'ACL', 'port-channel']
        });

        const mikrotik = cgCertVendor({
            title: 'MikroTik — konu bazlı mühendislik sertifikaları',
            icon: 'fas fa-router',
            intro: `MikroTik'te <strong>associate → professional → expert</strong> şeklinde tek bir dikey merdiven yoktur.
                    Yapı: <strong>MTCNA ön koşul</strong> → istediğin konu sertifikalarını yatay olarak topla →
                    zirvede <strong>MTCINE</strong>. Bu, diğer vendor'lardan yapısal olarak farklıdır.`,
            certs: [
                { level: 'Ön koşul', name: 'Certified Network Associate', code: 'MTCNA', req: 'onkosul', badge: 'resmi',
                  topics: 'RouterOS temel, yönlendirme, bridge, firewall, DHCP, temel wireless — <strong>diğerlerinin ön koşulu</strong>' },
                { level: 'Engineer', name: 'Routing Engineer', code: 'MTCRE', req: 'bagimsiz', badge: 'resmi',
                  topics: 'Statik ve dinamik yönlendirme, <strong>OSPF</strong>, tüneller' },
                { level: 'Engineer', name: 'Security Engineer', code: 'MTCSE', req: 'bagimsiz', badge: 'resmi',
                  topics: 'Firewall, <strong>IPsec</strong>, saldırı azaltma' },
                { level: 'Engineer', name: 'Traffic Control Engineer', code: 'MTCTCE', badge: 'resmi',
                  topics: '<strong>QoS</strong>, queue, mangle' },
                { level: 'Engineer', name: 'User Management Engineer', code: 'MTCUME', badge: 'resmi',
                  topics: 'Hotspot, PPP, RADIUS' },
                { level: 'Engineer', name: 'IPv6 Engineer', code: 'MTCIPv6E', badge: 'resmi', topics: 'IPv6' },
                { level: 'Engineer', name: 'Switching / Wireless Engineer', code: 'MTCSWE', badge: 'resmi',
                  topics: '<strong>VLAN</strong>, switch chip, bridging' },
                { level: 'Engineer', name: 'Enterprise Wireless Engineer', code: 'MTCEWE', badge: 'resmi',
                  topics: 'CAPsMAN, kurumsal kablosuz' },
                { level: 'Expert',   name: 'Inter-networking Engineer', code: 'MTCINE', req: 'bagimsiz', badge: 'resmi',
                  topics: '<strong>BGP, MPLS, trafik mühendisliği</strong>' }
            ],
            ours: ['RouterOS interface', 'VLAN', 'firewall filter', 'NAT', 'yönlendirme', 'OSPF', 'queue / QoS', 'IPsec']
        });

        const dell = cgCertVendor({
            title: 'Dell — PowerSwitch / OS10',
            icon: 'fas fa-hard-drive',
            intro: `Dell'in ağ tarafında <strong>Associate → Professional → Expert merdiveni yoktur</strong>;
                    yalnızca <strong>Specialist</strong> katmanı bulunur. Sınav kodlaması eski
                    <code>DES-xxxx</code> şemasından <code>D-xxx-xx-xx</code> şemasına geçmiştir.`,
            certs: [
                { level: 'Specialist', name: 'PowerSwitch Data Center Deploy', code: 'D-PDC-DY-23', badge: 'resmi',
                  topics: '<strong>SmartFabric OS10 protokolleri</strong>, S/Z serisi kurulum, yapılandırma, sorun giderme' },
                { level: 'Specialist', name: 'Dell Networking Design', code: 'D-NWG-DS-00', badge: 'resmi',
                  topics: 'Ağ tasarımı' }
            ],
            retired: [
                '<strong>DES-5221 / DES-5222</strong> — Specialist Implementation Engineer, Data Center Networking. ' +
                'Eski kodlama, <code>D-xxx</code> şemasıyla değiştirildi ' + cgCertBadge('teyit') +
                ' <em>(emeklilik tarihi doğrulanamadı)</em>'
            ],
            ours: ['OS10 interface', 'VLAN', 'port-channel', 'ACL', 'OSPF', 'BGP', 'SNMP', 'QoS']
        });

        const citrix = cgCertVendor({
            title: 'Citrix / NetScaler — ADC',
            icon: 'fas fa-arrows-split-up-and-left',
            intro: `Citrix ürünü <strong>"NetScaler" adına geri döndü</strong> ve sertifikasyon çerçevesini
                    birkaç kez değiştirdi. <strong>NetScaler / ADC 12 track'leri emekli edilmiştir.</strong>`,
            certs: [
                { level: 'Associate',    name: 'CCA-AppDS — App Delivery and Security', code: '1Y0-241', badge: 'teyit',
                  topics: 'Trafik yönetimi, <strong>load balancing, SSL offload, content switching</strong>' },
                { level: 'Professional', name: 'CCP-AppDS', code: '', badge: 'teyit',
                  topics: 'İleri ADC' }
            ],
            warn: `${cgCertBadge('teyit')} <strong>Bu bölüm en zayıf doğrulanan bölümdür.</strong>
                   <code>citrix.com</code> içeriği alınamadı; <code>1Y0-241</code> kodu üçüncü parti kaynaklıdır ve
                   Citrix ADC 13 sürümüne dayandığı düşünülmektedir. Güncel olup olmadığı <strong>doğrulanamadı</strong> —
                   sınava yönelmeden önce mutlaka citrix.com'dan teyit edin.`,
            ours: ['NetScaler vserver', 'service group', 'load balancing', 'SSL', 'content switching', 'HA']
        });

        // ── Vendor-nötr ──────────────────────────────────────────────────────
        const neutral = cgRefCard('Vendor-nötr — yalnızca ağ ve güvenlik', 'fas fa-globe',
            `<p class="cg-cert-intro">Bu araçtaki konularla örtüşen, üreticiden bağımsız sertifikalar.
             Bulut, veri, yapay zekâ ve genel BT sertifikaları <strong>bilerek listelenmemiştir</strong>.</p>` +
            cgRefTable(['Sertifika', 'Kod', 'Durum', 'Kapsam'], [
                ['<strong>CompTIA Network+</strong>', '<code>N10-009</code>', 'Aktif ' + cgCertBadge('ucuncu'),
                 'OSI modeli, IP adresleme, temel switching ve routing, kablosuz, sorun giderme'],
                ['<strong>CompTIA Security+</strong>', '<code>SY0-701</code>', 'Aktif ' + cgCertBadge('ucuncu'),
                 'Ağ güvenliği temelleri, kriptografi, erişim kontrolü — halefi <code>SY0-801</code> 17 Kasım 2026\'da bekleniyor'],
                ['(ISC)² CISSP', '—', 'Aktif ' + cgCertBadge('ucuncu'),
                 'Domain 4 = Communication and Network Security. Yönetişim ağırlıklı; bu araçla <strong>kısmen</strong> örtüşür']
            ]) +
            `<div class="cg-cert-warnbox">${cgCertBadge('ucuncu')} CompTIA sürüm tarihleri eğitim sağlayıcı kaynaklıdır;
             <code>comptia.org</code>'dan doğrulanmadı.</div>`);

        // ── Kapsam dışı bırakılanlar ─────────────────────────────────────────
        const excluded = cgRefCard('Bilerek listelenmeyenler', 'fas fa-filter',
            `<p class="cg-cert-intro">Bu sayfa <strong>yalnızca ağ ve güvenlik</strong> sertifikalarını kapsar.
             Vendor'ların aşağıdaki programları bu araçla örtüşmediği için dışarıda bırakılmıştır:</p>
             <ul class="cg-ref-list">
               <li><strong>Cisco</strong> — DevNet (geliştirici), Collaboration, CyberOps'un SOC ağırlıklı kısmı</li>
               <li><strong>Huawei</strong> — HCIA/HCIP-AI, Big Data, Cloud Computing, Storage, Kunpeng</li>
               <li><strong>Palo Alto</strong> — XSIAM / XDR / XSOAR Analyst ve Engineer, Cloud Security, Security Operations</li>
               <li><strong>Fortinet</strong> — Cloud Security ve Security Operations track'lerinin SIEM/bulut ağırlıklı kısmı</li>
               <li>Genel bulut sertifikaları (AWS, Azure, GCP), proje yönetimi, yazılım geliştirme</li>
             </ul>`);

        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-certificate"></i> Ağ &amp; Güvenlik Sertifikasyon Haritası</div>
  <p class="cg-ref-intro">
    Desteklenen her platform için güncel sertifikasyon yolları, sınav kodları ve emekli edilmiş sertifikalar.
    <strong>Sertifikasyon programları sık değişir</strong> — bu sayfadaki her kayıt
    <strong>Eylül 2026</strong>'da kaynağından kontrol edilmiş ve doğrulama durumu işaretlenmiştir.
  </p>

  <div class="cg-cert-legend">
    ${cgCertBadge('resmi')} <span>Vendor'ın kendi sayfasından doğrulandı</span>
    ${cgCertBadge('ucuncu')} <span>Üçüncü parti kaynak — vendor sayfasına erişilemedi</span>
    ${cgCertBadge('teyit')} <span>Doğrulanamadı — kullanmadan önce teyit edin</span>
    ${cgCertBadge('emekli')} <span>Emekli edildi</span>
  </div>

  <div class="cg-cert-warnbox" style="margin-bottom:18px">
    <strong>Doğrulanamayan sınav kodları bu sayfaya yazılmamıştır.</strong>
    Juniper (JN0-xxx), Palo Alto ve Fortinet'in yeni programları kod yayınlamıyor ya da
    portalları erişime kapalı. Eksik kod, unutulmuş kod değil — <em>bilerek boş bırakılmış</em> koddur.
  </div>

  ${cisco}
  ${juniper}
  ${huawei}
  ${fortinet}
  ${panw}
  ${f5}
  ${checkpoint}
  ${arista}
  ${mikrotik}
  ${dell}
  ${citrix}
  ${neutral}
  ${excluded}
</div>`;
    }
};
