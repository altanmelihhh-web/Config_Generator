# Cisco Ansible kaynak haritası

Bu belge, Ansible koleksiyonlarındaki içeriğin Config Generator projesine hangi
amaçla aktarılacağını izler. Ansible şeması tek başına IOS/NX-OS/ASA/FTD komut
referansı değildir; sınır veya platform desteği belirsizse Cisco'nun ilgili ürün
belgesi ayrıca kaynak alınır.

## Sabitlenen referanslar

| Ürün | Depo | İncelenen commit | Kullanım |
|---|---|---|---|
| IOS / IOS-XE | `ansible-collections/cisco.ios` | `42bf389006fdd7046e4040c85c697779f4f68bf3` | argspec, resource module, parsed/rendered ve integration fixture |
| NX-OS | `ansible-collections/cisco.nxos` | `5645581dc52134af8c6baa6218fb465867feacde` | argspec, resource module, parsed/rendered ve integration fixture |
| ASA | `ansible-collections/cisco.asa` | `c467f33a84d0f7247396406e0648721bd6979ac5` | ACL, object, object-group modelleri ve fixture'lar |
| FTD / FMC | `CiscoDevNet/FMCAnsible` | `ed50d5562f0b8d08d0f9b6d25f7aee16ede411bd` | FMC REST operasyonları ve örnek playbook'lar |

## Aktarım sırası

1. **Config Generator:** `required`, `choices`, türler, komut hiyerarşisi ve
   koleksiyon fixture'larındaki beklenen CLI/API gövdeleri.
2. **Converter:** resource module `parsed` girdisi ile `rendered` komutlarını
   reader → IR → writer gidiş-dönüş testlerine dönüştürme.
3. **CLI Lab:** integration testlerinin güvenli kurulum, değişiklik,
   idempotence ve teardown adımlarından görev/senaryo üretme.
4. **Sorun giderme:** facts parser'larının kullandığı `show` komutları,
   beklenen durum alanları ve integration assertion'larından teşhis adımları.

## Config Generator boşlukları

| Aile | Mevcut karşılıklar | Eklenecek / genişletilecek Ansible kaynaklı konular |
|---|---|---|
| IOS | ACL, interface/L2/L3, BFD, BGP, OSPF, prefix-list, route-map, SNMP, static route, VLAN, VRF | EVPN global/EVI/Ethernet ve VXLAN VTEP; mevcut başlıklarda argspec alt seçenekleri |
| NX-OS | AAA, ACL, BFD global/interface, BGP, EVPN/VXLAN, interface, HSRP, LLDP, logging, NTP, NX-API, OSPFv2/OSPFv3, prefix-list, route-map, SNMP, static route, telemetry, VLAN, vPC, VRF | BGP AF/neighbor AF/template; OSPF interface seçeneklerini genişletme; IGMP/PIM; UDLD; VRRP; VTP; FC/VSAN/zoning |
| ASA | ACL, object-group, banner/yönetim, çok sayıda ASA CLI konusu | `asa_acls` seçeneklerini genişletme; `asa_objects` ağ/service nesneleri; `asa_ogs` ağ/service/protocol/ICMP object-group alt türleri |
| FTD/FMC | bootstrap, interface, NAT, ACP, IPS/SSL, VPN, platform settings, route, prefilter, identity | network/port object; physical/subinterface; DNS server group; access-rule logging/network seçenekleri; deployment ve device registration alt seçenekleri |

## Config aracı olmayan modüller

`command`, `facts`, `ping`, `file_copy`, `install_os`, `reboot`, `rollback`,
`snapshot`, `rpm` ve GIR gibi modüller otomatik olarak Config Generator başlığı
yapılmaz. Okuma/teşhis işlemleri komut kütüphanesi veya sorun gidermeye;
durum değiştiren operasyonlar ise risk etiketi ve açık kullanıcı onayı olan ayrı
bir iş akışına adaydır.

## Kabul ölçütü

- Her yeni form alanı için zorunlu/opsiyonel/koşullu durumu belirli olmalı.
- Ansible'daki `choices` ve türler kaybolmamalı; sayısal sınır Ansible'da yoksa
  Cisco belgesi bulunmadan uydurulmamalı.
- Geçersiz çapraz alan ilişkisi config satırı üretmemeli.
- En az bir olumlu, bir olumsuz ve bir eksik/koşullu otomatik test bulunmalı.
- Platforma göre değişen özellik açıkça etiketlenmeli.

## 26 Eylül 2026 çalışma durumu

Başlangıç Cisco envanteri 101 araçtı: IOS 38, FTD 14, NX-OS 28 ve ASA 21.
Bu çalışma sonunda yerel envanter 114 araca ulaştı:

| Aile | Başlangıç | Güncel | Eklenen bağımsız araçlar |
|---|---:|---:|---|
| IOS | 38 | 45 | Interface, IPv4 Prefix-List, OSPF Interface, OSPFv3, BFD Template, BGP Address-Family, VRF Address-Family |
| FTD | 14 | 14 | Henüz yeni bağımsız araç yok; mevcut alan denetimi bekliyor |
| NX-OS | 28 | 34 | IPv4/IPv6 Prefix-List, BFD Global/Interface, OSPFv3, Route-Map, Model-Driven Telemetry, NX-API |
| ASA | 21 | 21 | Henüz yeni bağımsız araç yok; mevcut alan denetimi bekliyor |

Tamamlanan altyapı:

- Dört Cisco ailesinin registry ve form şemalarını birlikte yükleyen otomatik test.
- IOS ACL wildcard, interface, subnet mask, track/IP SLA, SNMPv3, RT ve yeni
  generator çapraz-alan regresyonları.
- Ortak IPv6/IPv6-CIDR, NX-OS process tag, telemetry ve sayısal sınır
  doğrulayıcıları.
- İncelenen dört Ansible deposunun commit kimlikleri ve ürün eşlemesi.

Kalan Config Generator işleri, öncelik sırasıyla:

1. IOS EVPN global/EVI/Ethernet ve VXLAN VTEP.
2. IOS'taki mevcut 38 başlığın tüm koşullu alanlarını komut bazında son kez
   tarama; genel `iface` kullanılan yerleri IOS'a özgü doğrulayıcıya taşıma.
3. NX-OS BGP global/address-family/neighbor/template alt seçenekleri.
4. NX-OS IGMP/PIM, UDLD, VRRP, VTP ve FC/VSAN/zoning başlıkları.
5. NX-OS mevcut 28 başlıktaki doğrulayıcısız zorunlu alanları argspec ve Cisco
   ürün belgeleriyle kapatma.
6. ASA `asa_acls`, `asa_objects` ve `asa_ogs` kapsamını mevcut araçlara aktarma;
   interface/nameif/security-level ve koşullu NAT/VPN alanlarını doğrulama.
7. FTD/FMC network/port object, physical/subinterface, DNS server group,
   access-rule seçenekleri, deployment ve device registration araçları.
8. Her aile için boş, geçerli, geçersiz ve koşullu alan testlerini tamamlama;
   tarayıcıda masaüstü/mobil regresyon.

Config Generator tamamlandıktan sonraki aşamalar:

1. Ansible `parsed`/`rendered` fixture çiftlerini Converter reader → IR → writer
   gidiş-dönüş testlerine ve yeni Cisco kurallarına dönüştürme.
2. Integration testlerinin güvenli setup/change/idempotence/teardown akışlarından
   IOS, NX-OS ve ASA CLI Lab senaryoları üretme.
3. Facts parser'larının `show` komutları ve assertion'larından belirtilere dayalı
   sorun-giderme adımları oluşturma.
4. `command`, `facts` ve `ping` gibi salt-okunur modülleri komut/sorun-giderme
   alanına; reboot/install/rollback gibi riskli işlemleri ayrı güvenlik sınıfına
   yerleştirme.
