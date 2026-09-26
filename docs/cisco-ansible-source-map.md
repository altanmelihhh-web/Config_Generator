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
| NX-OS | 28 | 44 | IPv4/IPv6 Prefix-List, BFD Global/Interface, OSPFv3, Route-Map, Model-Driven Telemetry, NX-API, BGP AF, BGP Neighbor AF, BGP Peer Template, IGMP, IGMP Snooping, PIM, UDLD, VRRP, VRRPv3, VTP (parti 3'ün yedisi kayıt bekliyor) |
| ASA | 21 | 21 | Yeni araç yok; parti 4'te mevcut 21 aracın 57 zorunlu/koşullu alanına doğrulayıcı bağlandı |

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

### 26 Eylül 2026 — Cisco parti 3 (NX-OS IGMP/PIM/UDLD/VRRP/VTP)

Mevcut araçlar değişmedi. Yedi yeni araç `ConfigGenerators_NX-OS.js` sonunda. Kaynak:
`cisco.nxos` @5645581 eski tip modüller (`argument_spec` modül içinde) ve Nexus 9000
NX-OS 10.4(x) Multicast Routing / Interfaces / Unicast Routing / Layer 2 CG.

| Araç (NX-OS) | Ansible modülü | Sınırlar ve kurallar | Platform |
|---|---|---|---|
| IGMP | `nxos_igmp`, `nxos_igmp_interface` | startup-query-interval 1-18000, count 1-10, robustness 1-7, querier-timeout 1-65535, MRT 1-25 (< query-interval), query-interval 1-18000, LMQRT 1-25, LMQC 1-5, group-timeout 3-65535; static-oif grup/route-map dışlar; (S,G) yalnız IGMPv3 notu | Nexus 9000, NX-OS 10.x |
| IGMP Snooping | `nxos_igmp_snooping` + CG VLAN düzeyi | group-timeout 1-10080 dk / never, snooping kapalıyken reddedilir; VLAN last-member-query-interval 1-25 | 〃 |
| PIM | `nxos_pim`, `nxos_pim_rp_address`, `nxos_pim_interface` | RP unicast; group-list/route-map/prefix-list dışlar; SSM/group-list multicast prefix; dr-priority 1-4294967295, hello 1000-18724286 ms | 〃 |
| UDLD | `nxos_udld`, `nxos_udld_interface` | message-time yalnız pozitif tam sayı (belgede sınır yok) | 〃 |
| VRRP | `nxos_vrrp` | grup 1-255, priority 1-254, interval 1-255; mgmt reddi; VIP alt ağ ve adres sahibi kontrolü; parola yer tutucu | 〃 |
| VRRPv3 | yok (yalnız Cisco belgesi) | grup 1-255, priority 1-254, timers 100-40950 ms, preempt delay 0-3600; vrrp2 yalnız IPv4 | 〃 |
| VTP | `nxos_vtp_domain`, `_version`, `_password` | sürüm 3 seçeneği korunur ama N9K belgesinde yok → reddedilir; parola yer tutucu; transparent notu | 〃 |

Kapsam dışı: PIM hello-authentication (gizli veri), VRRP track (belgede sınır yok).

### 26 Eylül 2026 — Cisco parti 4 (ASA mevcut araç doğrulaması)

Yeni araç yok; üretilen CLI değişmedi. 21 ASA aracındaki doğrulayıcısız zorunlu ve
koşullu-zorunlu 57 metin alanı doğrulayıcıya bağlandı. Kaynak: `cisco.asa` @c467f33
argspec (`asa_acls` kaynak/hedef biçimleri, `asa_objects`/`asa_ogs` ad ve
`port_object`, service protokol choices) + Cisco ASA 9.x CLI yapılandırma kılavuzları
ve komut başvurusu.

| Alan grubu | Doğrulayıcı | Cisco sınırı |
|---|---|---|
| nameif (arayüz, NAT, route, failover link, AnyConnect, service-policy) | `nameif` (mevcut) | en fazla 48 karakter |
| security-level | min/max 0-100 | "integer between 0 and 100" |
| object / object-group adları | `asa_objname` | 64 karakter; harf, rakam, `.!@#$%^&()-_{}` |
| ACL adı / ACL kaynak-hedef | `asa_acl_name` / `asa_acl_addr` | 241 karakter; any/any4/any6, host, adres+maske, IPv6 önek, object, object-group, interface |
| class-map / policy-map | `asa_mpf_name` | 40 karakter |
| PSK / RADIUS key / failover key / NTP key | `asa_psk` / `asa_radius_key` / `asa_failover_key` / `asa_ntp_key` | 1-128 / 64 / 1-63 veya hex 32 / 32 |
| group-policy, IP pool, username / parola | `asa_name64` / `asa_user_pw` | 64 / 64 yazdırılabilir ASCII |
| SNMP kullanıcı / community | `asa_snmp_user` / `asa_snmp_community` | harfle başlar ≤32 / ≤32 |
| LDAP base DN / service port listesi | `asa_ldap_dn` / `asa_port_list` | öznitelik=değer / port adı veya 0-65535 |
| tunnel-group, group-alias, aaa-server grubu, image, SNMP grup ve parolaları, saat dilimi | `asa_token` | belgede sınır yok → yalnız tek sözcük |
| OSPF pid / area / network; route network | `posint` / `ospf_area` / `ip` (mevcut) | "any positive integer" / 0-4294967295 |

Tek placeholder düzeltmesi: `anyconnect.tg_alias` "Corporate VPN" → "Corporate-VPN"
(Cisco: group-alias boşluk içeremez). Bulgu, dokunulmadı: ASA OSPF `network` komutu
subnet maskesi ister; mevcut araç wildcard (`0.0.0.255`) yazıyor, bu yüzden alana
yalnız `wildcard` (noktalı dörtlü) bağlandı. Test: `tests/cisco-asa-validation.test.js`.

Kalan Config Generator işleri, öncelik sırasıyla:

1. ~~IOS EVPN global/EVI/Ethernet ve VXLAN VTEP.~~ (parti 1; kayıt bekliyor)
2. IOS'taki mevcut 38 başlığın tüm koşullu alanlarını komut bazında son kez
   tarama; genel `iface` kullanılan yerleri IOS'a özgü doğrulayıcıya taşıma.
3. ~~NX-OS BGP address-family/neighbor AF/template.~~ (parti 2; kayıt bekliyor) —
   BGP global (`nxos_bgp_global`) alt seçenekleri kaldı.
4. ~~NX-OS IGMP/PIM, UDLD, VRRP, VTP~~ (parti 3; kayıt bekliyor) — FC/VSAN/zoning kaldı.
5. NX-OS mevcut 28 başlıktaki doğrulayıcısız zorunlu alanları argspec ve Cisco
   ürün belgeleriyle kapatma.
6. ~~ASA mevcut araçlarında interface/nameif/security-level ve koşullu NAT/VPN
   alanlarını doğrulama.~~ (parti 4; CGM yaması bekliyor) — `asa_objects`/`asa_ogs`
   alt türleri için yeni bağımsız araçlar kaldı.
7. FTD/FMC network/port object, physical/subinterface, DNS server group,
   access-rule seçenekleri, deployment ve device registration araçları.
8. Her aile için boş, geçerli, geçersiz ve koşullu alan testlerini tamamlama;
   tarayıcıda masaüstü/mobil regresyon.

### Cisco düzeltme partisi (fix5)

- `bgpAddressFamily`: VRF girilince `neighbor X remote-as` VRF address-family içinde
  (`test_ios_bgp_address_family.py`, `address-family ipv4 unicast vrf blue`); doğrulama
  `show ip bgp vpnv4 vrf V ...`. VRF'siz çıktı değişmedi.
- `prefixList`: `uzunluk < ge ≤ le ≤ 32` (Cisco `ip prefix-list` komut referansı); ihlalde satır yok + uyarı.
- `eigrpnamed`: CIDR girişi `network A.B.C.D wildcard` olarak yazılır (IOS `network ip-address [wildcard-mask]`).
- `ios_acl`: 1300–1999 standart, 2000–2699 genişletilmiş (Cisco-IOS-XE-types `std/ext-acl-type`).
- `archive_path`: ek şemalar `ftp://`, `http(s)://`, `rcp://`, `disk0:` (Configuration Versioning).

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
