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
| IOS | ACL, interface/L2/L3, BFD, BGP, OSPF, prefix-list, route-map, SNMP, static route, VLAN, VRF, EVPN global/EVI/Ethernet, VXLAN VTEP | mevcut başlıklarda argspec alt seçenekleri |
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
| NX-OS | 28 | 37 | IPv4/IPv6 Prefix-List, BFD Global/Interface, OSPFv3, Route-Map, Model-Driven Telemetry, NX-API, BGP AF, BGP Neighbor AF, BGP Peer Template (son üçü kayıt bekliyor) |
| ASA | 21 | 21 | Henüz yeni bağımsız araç yok; mevcut alan denetimi bekliyor |

Tamamlanan altyapı:

- Dört Cisco ailesinin registry ve form şemalarını birlikte yükleyen otomatik test.
- IOS ACL wildcard, interface, subnet mask, track/IP SLA, SNMPv3, RT ve yeni
  generator çapraz-alan regresyonları.
- Ortak IPv6/IPv6-CIDR, NX-OS process tag, telemetry ve sayısal sınır
  doğrulayıcıları.
- İncelenen dört Ansible deposunun commit kimlikleri ve ürün eşlemesi.

### 26 Eylül 2026 — Cisco parti 1

Yöntem: her yeni alan sabitlenmiş Ansible commit'indeki argspec (`choices`, tür,
`required`) ve `rm_templates` (üretilen CLI) ile Cisco'nun kendi YANG modelleri
(YangModels/yang `vendor/cisco/xe/1711`: `Cisco-IOS-XE-l2vpn`,
`Cisco-IOS-XE-interfaces`, `Cisco-IOS-XE-types`) ve Catalyst 9000 BGP EVPN VXLAN
yapılandırma kılavuzlarından alındı. Ansible'da ve Cisco kaynağında olmayan sınır
uydurulmadı (ör. `df-election preempt-time` yalnız tür olarak `uint32`).

| Araç (IOS) | Ansible modülü | Cisco sınırları | Platform etiketi |
|---|---|---|---|
| EVPN Global | `ios_evpn_global` | replication-type `ingress`/`static` (Ansible choices) | IOS XE Catalyst 9000 |
| EVPN Instance (EVI) | `ios_evpn_evi` | EVI 1-65535 (YANG), encapsulation `vxlan`; VLAN→EVI→VNI eşlemesi Cisco kılavuzundan | IOS XE Catalyst 9000 |
| EVPN Ethernet Segment | `ios_evpn_ethernet` | segment 1-65535, wait-time 1-10, ESI type 0 (9 bayt) / type 3 (system-mac, Cisco MAC) (YANG) | IOS XE Catalyst 9000; multihoming model/sürüme bağlı |
| VXLAN VTEP (NVE) | `ios_vxlan_vtep` | nve 1-4096 (YANG), VNI 1-16777215, mcast-group IPv4 224/4 + opsiyonel IPv6 ff00::/8 | IOS XE Catalyst 9000 |

Çapraz alan kuralları (geçersizse satır üretilmez, testli): EVI/segment/NVE sınırı,
EVI `rd` için `auto`/`target:` reddi, eksik VLAN/VNI ile eşleme, ESI biçimi türe
göre, `static` replikasyonda multicast grubu zorunlu ve multicast aralığında,
aynı VNI'nin hem L2 hem L3 olması, üyeliksiz NVE. `ingress-replication`
seçiliyken girilen grup yazılmaz (Ansible `rm_templates` davranışı).

Durum: 4 araç `ConfigGenerators_Cisco.js`'te ve `tests/cisco-validation.test.js`
testlerinde; kayıt defteri (`CG_REGISTRY`) satırları yönetici onayında. Kayda girene
kadar `tests/cisco-family-schema-audit.test.js` bu dört aracı "bekleyen kayıt" olarak
listeler. Ayrıca: 27 doğrulayıcının `CG_RULES`/`CG_WHY` metinleri (davranış
değişmeden), NX-OS prefix-list eşleşme kipi (`pl_match`) ve alan düzeyi `showFor`
kullanan NX-OS alanlarının `showFor`'lu bölümlere taşınması.

Madde 2 (genel `iface` → `ios_iface`) kullanıcı kararıyla ertelendi: mevcut Cisco
alan kuralları değiştirilmeyecek; 25 `iface` + 4 `iface_range` alanının listesi ve
denetim bulgularının kanıtları parti 1 raporunda (depo dışı yönetici notu).

### 26 Eylül 2026 — Cisco parti 2 (NX-OS BGP)

Mevcut `CiscoNXOS.bgp` aracı ve üretilen CLI'si değişmedi (testli). Üç yeni
bağımsız araç `ConfigGenerators_NX-OS.js` sonunda; kaynak `cisco.nxos` @5645581
argspec + `rm_templates` + unit fixture komutları ve Nexus 9000 Unicast Routing
CG 10.4(x) "Configuring Advanced BGP".

| Araç (NX-OS) | Ansible modülü | Cisco sınırları | Platform |
|---|---|---|---|
| BGP Address-Family | `nxos_bgp_address_family` | distance 1-255 (üçü birlikte), dampening half-life 1-45, reuse/suppress 1-20000, max-suppress 1-255; maximum-paths yalnız tür | Nexus 9000, NX-OS 10.x |
| BGP Neighbor Address-Family | `nxos_bgp_neighbor_address_family` | maximum-prefix 1-300000, eşik 1-100, restart 1-65535; `restart`/`warning-only` birbirini dışlar | 〃 |
| BGP Peer Template | `nxos_bgp_templates` (`template peer`) | ebgp-multihop 2-255, ttl-security 1-254 (ikisi birlikte reddedilir), timers 0-3600 | 〃 |

Korunan choices: AFI 6 değer (template'te 4), SAFI 4 değer, redistribute 10
protokol, additional-paths enable/disable, send-community standard/extended/both,
bfd set/singlehop/multihop. Çapraz alan kuralları (geçersizse satır üretilmez):
l2vpn→evpn, vpnv4/vpnv6→unicast, link-state SAFI'siz; VRF yalnız ipv4/ipv6;
redistribute route-map zorunlu, eigrp/isis/ospf/ospfv3/rip için tag zorunlu;
AF'ye uymayan prefix; `advertise l2vpn evpn` yalnız VRF'te; inherit peer-policy
sıra numarasıyla. Kayıt satırları yönetici onayında; o zamana kadar
`cisco-family-schema-audit` bu üç aracı "bekleyen kayıt" olarak listeler.

Kalan Config Generator işleri, öncelik sırasıyla:

1. ~~IOS EVPN global/EVI/Ethernet ve VXLAN VTEP.~~ (parti 1; kayıt bekliyor)
2. IOS'taki mevcut 38 başlığın tüm koşullu alanlarını komut bazında son kez
   tarama; genel `iface` kullanılan yerleri IOS'a özgü doğrulayıcıya taşıma.
3. ~~NX-OS BGP address-family/neighbor AF/template.~~ (parti 2; kayıt bekliyor) —
   BGP global (`nxos_bgp_global`) alt seçenekleri kaldı.
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
