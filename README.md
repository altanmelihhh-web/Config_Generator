<div align="center">

# Config Generator

**Network konfigürasyon üretici ve vendor'lar arası dönüştürücü**

20 vendor · 311 konfigürasyon şablonu · 19 platform arası config dönüşümü
Backend yok, kurulum yok: tamamen tarayıcıda çalışır.

![HTML5](https://img.shields.io/badge/HTML5-static-e34f26?logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-f7df1e?logo=javascript&logoColor=black)
![No backend](https://img.shields.io/badge/backend-yok-2ea44f)
![Offline](https://img.shields.io/badge/offline-çalışır-0b2e5b)
[![License: MIT](https://img.shields.io/badge/lisans-MIT-blue)](LICENSE)

</div>

---

## İçindekiler

- [Ne işe yarar?](#ne-işe-yarar)
- [Özellikler](#özellikler)
- [Desteklenen platformlar](#desteklenen-platformlar)
- [Hızlı başlangıç](#hızlı-başlangıç)
- [Kullanım](#kullanım)
- [Proje yapısı](#proje-yapısı)
- [Mimari](#mimari)
- [Geliştirme: yeni şablon / vendor ekleme](#geliştirme-yeni-şablon--vendor-ekleme)
- [Güvenlik ve gizlilik](#güvenlik-ve-gizlilik)
- [Sorumluluk reddi](#sorumluluk-reddi)
- [Lisans](#lisans)

---

## Ne işe yarar?

Ağ ekiplerinin günlük işlerinde sık yazılan CLI konfigürasyonlarını (VLAN, OSPF/BGP, ACL, NAT, IPSec VPN, HA, AAA, yük dengeleme vb.) form doldurarak, hatasız ve standart biçimde üretmek için geliştirildi.

İki ana modülü var:

| Modül | Ne yapar |
|-------|----------|
| **Generator** | Vendor ve konfigürasyon tipini seçersiniz, formu doldurursunuz, cihaza yapıştırılmaya hazır CLI çıktısını alırsınız. |
| **Dönüştürücü** | Bir vendor'ın config'ini (ör. Cisco IOS) yapıştırırsınız, hedef vendor'ı seçersiniz (ör. Huawei VRP, Juniper, FortiGate), karşılık gelen config'i ve dönüşüm raporunu alırsınız. |

## Özellikler

**Generator**
- 20 vendor, 311 hazır konfigürasyon tipi (switch, router, firewall, ADC)
- Alan bazında doğrulama: IP, CIDR, VLAN ID, port, ASN vb. yanlış girilirse üretim yapılmaz
- Her şablonda konu özeti, örnek komutlar ve dikkat edilmesi gereken noktalar
- Çıktıyı tek tıkla kopyalama veya `.txt` olarak indirme
- Konfigürasyon tipi listesinde anlık arama
- Referans & topoloji sayfaları (port numaraları, subnet tablosu, tasarım örnekleri)

**Dönüştürücü**
- Switch/Router, Güvenlik Duvarı ve ADC kategorilerinde 19 platform arasında dönüşüm
- Vendor'dan bağımsız ara model (IR) üzerinden çalışır: her okuyucu config'i IR'a çevirir, her yazıcı IR'dan hedef config'i üretir
- Hedef işletim sistemi sürümü seçimi (ör. NX-OS 9.x / 10.x)
- Dönüşüm analizi: her özellik altı seviyede raporlanır: **Tam**, **Kısmi**, **Manuel**, **Desteksiz**, **Düştü**, **Tehlikeli**
- Vendor destek matrisi: hangi özelliğin hangi platformlar arasında çevrilebildiğini gösterir
- Dosyadan yükleme (`.txt`, `.cfg`, `.conf`)

**Genel**
- Açık / koyu tema (sistem tercihini izler, seçim hatırlanır)
- Mobil uyumlu yerleşim
- Harici CDN yok: font ve ikonlar repoda, internetsiz ortamda da çalışır

## Desteklenen platformlar

### Generator

| Kategori | Vendor | Şablon sayısı |
|----------|--------|:---:|
| Switch / Router | Cisco IOS / IOS-XE | 31 |
| | Cisco NX-OS | 14 |
| | Huawei VRP | 25 |
| | Huawei CloudEngine | 11 |
| | Juniper JunOS | 7 |
| | Juniper MX | 10 |
| | Arista EOS | 18 |
| | Dell OS10 | 16 |
| | MikroTik RouterOS | 13 |
| | Extreme Networks | 1 |
| Güvenlik Duvarı | FortiGate | 24 |
| | Palo Alto PAN-OS | 22 |
| | Check Point | 20 |
| | Cisco ASA | 14 |
| | Cisco FTD | 8 |
| | Juniper SRX | 18 |
| | Huawei USG | 12 |
| Yük Dengeleyici / ADC | F5 BIG-IP LTM | 21 |
| | Citrix ADC (NetScaler) | 17 |
| Referans | Referans & Topoloji | 9 |
| | **Toplam** | **311** |

### Dönüştürücü

| Kategori | Platformlar |
|----------|-------------|
| Switch / Router | Cisco IOS, Cisco NX-OS, Huawei VRP, Huawei CloudEngine, Dell OS10, Juniper JunOS, Arista EOS, MikroTik |
| Güvenlik Duvarı | FortiGate, Palo Alto, Check Point, Cisco ASA, Cisco FTD, Juniper SRX, Huawei USG |
| Yük Dengeleyici / ADC | F5 BIG-IP, Citrix ADC |

Dönüşüm aynı kategori içinde yapılır (ör. switch → switch, firewall → firewall).

## Hızlı başlangıç

Proje statik HTML + JavaScript'tir; derleme veya bağımlılık kurulumu gerekmez.

**En kısa yol:** `index.html` dosyasını tarayıcıda açın.

**Yerel web sunucusu ile (önerilir):**

```bash
git clone git@github.com:altanmelihhh-web/Config_Generator.git
cd Config_Generator

# seçeneklerden biri
python3 -m http.server 8080
# veya
npx serve .
# veya
php -S 0.0.0.0:8080
```

Ardından `http://localhost:8080` adresini açın.

**Sunucuya yayınlama:** Klasörün tamamını Apache/Nginx'in servis ettiği bir dizine kopyalamak yeterlidir. GitHub Pages ile de doğrudan yayınlanabilir (Settings → Pages → Branch: `main`, klasör: `/ (root)`).

## Kullanım

### Generator

1. Soldaki listeden **vendor**'ı seçin (ör. *FortiGate*).
2. İkinci listeden **konfigürasyon tipini** seçin (ör. *IPSec Site-to-Site VPN*).
3. Formu doldurun. Zorunlu alanlar ve format kontrolleri anlık gösterilir.
4. **Konfigürasyon Oluştur**'a basın.
5. Çıktıyı **Kopyala** ile panoya alın veya **İndir** ile dosya olarak kaydedin.

### Dönüştürücü

1. Üstteki **Dönüştürücü** sekmesine geçin.
2. Kategori ve **kaynak** platformu seçin.
3. Config'i yapıştırın veya **Dosya Seç** ile yükleyin.
4. **Hedef** platformu (ve varsa hedef OS sürümünü) seçin.
5. **Dönüştür**'e basın; çıktıyı ve dönüşüm analizini inceleyin.

> Dönüştürücü çıktısı bir başlangıç noktasıdır. Özellikle analizde *Kısmi*, *Manuel*, *Düştü* veya *Tehlikeli* olarak işaretlenen kalemleri cihaza uygulamadan önce mutlaka gözden geçirin.

## Proje yapısı

```
Config_Generator/
├── index.html                          Giriş sayfası (tek sayfa uygulama)
├── assets/
│   ├── css/
│   │   ├── base.css                    Tema değişkenleri, temel bileşenler, uygulama iskeleti
│   │   └── config-generator.css        Generator ve Dönüştürücü ekran stilleri
│   ├── js/
│   │   ├── app.js                      Başlatıcı (tema + ilk render)
│   │   ├── ConfigGeneratorManagement.js  Controller: vendor kaydı (CG_REGISTRY), form motoru, doğrulama, çıktı
│   │   ├── ConfigGenerators_<Vendor>.js  Vendor başına Generator şablonları (18 dosya)
│   │   ├── ConfigConverter.js          Dönüştürücü arayüz controller'ı
│   │   ├── ConfigConverter_IR.js       Ara model (IR), okuyucu/yazıcı kayıtları, kategoriler
│   │   ├── ConfigConverter_Readers_<Vendor>.js  Config → IR ayrıştırıcıları
│   │   └── ConfigConverter_Writers_<Vendor>.js  IR → config üreticileri
│   ├── fonts/inter/                    Inter yazı tipi (woff2)
│   └── vendor/fontawesome/             Font Awesome 6 Free (ikonlar)
├── LICENSE
└── README.md
```

## Mimari

```
                 ┌────────────────────────── Generator ──────────────────────────┐
  Kullanıcı ──►  │ CG_REGISTRY ─► şablon.init() ─► cgFormBuilder ─► doğrulama ─► │ ─► CLI çıktısı
                 └───────────────────────────────────────────────────────────────┘

                 ┌───────────────────────── Dönüştürücü ─────────────────────────┐
  Kaynak config ►│ CC_READERS[kaynak] ─► IR (vendor bağımsız) ─► CC_WRITERS[hedef]│ ─► Hedef config
                 │                                   └──► dönüşüm analizi         │     + rapor
                 └───────────────────────────────────────────────────────────────┘
```

- **Script sırası önemlidir.** Vendor modülleri ve IR, onları kullanan controller'lardan önce yüklenir; sıra `index.html` içinde tanımlıdır.
- **Generator:** Her şablon bir `init(container)` fonksiyonu olan nesnedir. Şablonların çoğu formu `cgFormBuilder` ile tanımlar: alanlar, doğrulama kuralları (`ip`, `cidr`, `vlan` …) ve form verisini CLI metnine çeviren bir fonksiyon. Kullanıcı girdisi `cgEsc` ile temizlenir.
- **Dönüştürücü:** N×N ayrı dönüştürücü yazmak yerine N okuyucu + N yazıcı kullanılır. Her okuyucu config'i ortak bir ara modele (IR: arayüzler, VLAN'lar, rotalar, ACL/policy, NAT, VPN, kullanıcılar …) çevirir; her yazıcı bu modelden hedef sözdizimini üretir. Yeni bir platform eklemek, diğer tüm platformlarla dönüşümü tek seferde açar.

## Geliştirme: yeni şablon / vendor ekleme

**Mevcut vendor'a şablon eklemek**

1. İlgili `ConfigGenerators_<Vendor>.js` dosyasında yeni bir şablon nesnesi tanımlayın:

   ```js
   MikroTik.snmp = {
       label: 'SNMP',
       init(container) {
           cgFormBuilder(container, {
               topic: { icon: 'fas fa-chart-line', title: 'SNMP (MikroTik)', desc: 'SNMP community ve erişim ayarları.' },
               sections: [{
                   title: 'SNMP', icon: 'fas fa-cog',
                   fields: [
                       { name: 'community', label: 'Community', type: 'text', required: true, placeholder: 'monitor' },
                       { name: 'nms', label: 'NMS IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.10' }
                   ]
               }],
               submit: 'Konfigürasyon Oluştur'
           }, (data) => {
               return '/snmp community add name=' + cgEsc(data.community) + ' addresses=' + cgEsc(data.nms) + '\n';
           });
       }
   };
   ```

   Referans için aynı dosyadaki mevcut şablonlara bakın; çıktı döndürme ve uyarı gösterme biçimi şablonlar arasında ortaktır.

2. `ConfigGeneratorManagement.js` içindeki `CG_REGISTRY`'de vendor'ın `types` listesine kaydedin:

   ```js
   { id: 'snmp', label: 'SNMP', gen: () => typeof MikroTik !== 'undefined' && MikroTik.snmp },
   ```

**Yeni vendor eklemek**

1. `assets/js/ConfigGenerators_<Vendor>.js` dosyasını oluşturun.
2. `CG_REGISTRY`'ye vendor girdisini (`label`, `icon`, `color`, `types`) ekleyin.
3. Dosyayı `index.html`'de `ConfigGeneratorManagement.js`'ten **önce** yükleyin.

**Dönüştürücüye platform eklemek**

1. `ConfigConverter_Readers_<Vendor>.js` içinde `CC_READERS['<id>']` ile config → IR ayrıştırıcısını tanımlayın (`ccEmptyIR()` ile boş model alın).
2. `ConfigConverter_Writers_<Vendor>.js` içinde `CC_WRITERS['<id>']` ile IR → config üreticisini tanımlayın.
3. `ConfigConverter_IR.js` içinde `CC_CATEGORIES`'teki uygun kategoriye platform kimliğini ekleyin.
4. Dosyaları `index.html`'de `ConfigConverter_IR.js`'ten sonra, `ConfigConverter.js`'ten önce yükleyin.

## Güvenlik ve gizlilik

- Uygulama hiçbir sunucuya istek atmaz; formlara girilen değerler ve yapıştırılan config'ler yalnızca tarayıcı belleğinde işlenir.
- Tek kalıcı veri, tema tercihidir (`localStorage` → `cg-theme`).
- Yine de üretim config'lerini (şifre, PSK, SNMP community içeren) paylaşılan veya güvenilmeyen bilgisayarlarda işlerken dikkatli olun.

## Sorumluluk reddi

Üretilen ve dönüştürülen konfigürasyonlar yardımcı niteliktedir. Cihaza uygulamadan önce içeriği gözden geçirin, mümkünse test/lab ortamında doğrulayın ve değişikliği kurumunuzun değişiklik yönetimi sürecine uygun şekilde yapın.

## Lisans

Bu proje [MIT Lisansı](LICENSE) ile lisanslanmıştır.

---

<div align="center">

Font Awesome Free (CC BY 4.0 / SIL OFL 1.1 / MIT) ve Inter (SIL OFL 1.1) kullanılmaktadır.

</div>
