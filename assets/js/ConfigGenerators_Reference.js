'use strict';

// ─── Shared reference renderer helpers ───────────────────────────────────────
function cgRefCard(title, icon, body) {
    return `<div class="cg-ref-card"><div class="cg-ref-card-hd"><i class="${cgEsc(icon)}"></i> ${cgEsc(title)}</div><div class="cg-ref-card-body">${body}</div></div>`;
}
function cgRefTopo(ascii) {
    return `<pre class="cg-topo-art">${cgEsc(ascii)}</pre>`;
}
function cgRefTable(headers, rows) {
    const ths = headers.map(h => `<th>${cgEsc(h)}</th>`).join('');
    const trs = rows.map(r => '<tr>' + r.map(c => `<td>${c}</td>`).join('') + '</tr>').join('');
    return `<table class="cg-ref-table"><thead><tr>${ths}</tr></thead><tbody>${trs}</tbody></table>`;
}
function cgRefBadge(text, color) {
    return `<span class="cg-ref-badge" style="background:${cgEsc(color)}">${cgEsc(text)}</span>`;
}
function cgRefCmds(vendor, cmds) {
    const items = cmds.map(c => `<li><code>${cgEsc(c)}</code></li>`).join('');
    return `<div class="cg-ref-cmds"><div class="cg-ref-cmds-vendor">${cgEsc(vendor)}</div><ul>${items}</ul></div>`;
}

const CgReference = {};

// ─────────────────────────────────────────────────────────────────────────────
// BGP Topoloji
// ─────────────────────────────────────────────────────────────────────────────
CgReference.bgp = {
    label: 'BGP Topoloji',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-sitemap"></i> BGP — Border Gateway Protocol</div>
  <p class="cg-ref-intro">BGP, İnternet'in yönlendirme protokolüdür. Otonom Sistem (AS) sınırlarında çalışır. İki türü vardır: <strong>eBGP</strong> (farklı AS arası) ve <strong>iBGP</strong> (aynı AS içi).</p>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('eBGP Topoloji', 'fas fa-globe', cgDia({
        w: 480, h: 176, alt: 'İki otonom sistem arasında eBGP komşuluğu',
        zones: [
          { x: 10,  y: 30, w: 190, h: 104, label: 'AS 65001' },
          { x: 280, y: 30, w: 190, h: 104, label: 'AS 65002' }
        ],
        nodes: [
          { x: 105, y: 90, kind: 'router', label: 'R1', sub: '10.0.0.1' },
          { x: 375, y: 90, kind: 'router', label: 'R2', sub: '10.0.0.2' }
        ],
        links: [ { x1: 157, y1: 90, x2: 323, y2: 90, label: 'eBGP' } ],
        texts: [ { x: 240, y: 160, text: 'AS sınırını geçen tek BGP türü' } ],
        notes: [
          '<code>TTL=1</code> — varsayılan olarak yalnızca doğrudan bağlı peer',
          'Loopback üzerinden peer için <code>ebgp-multihop</code> gerekir',
          'Next-hop her AS geçişinde değişir'
        ]
      }))}
    </div>
    <div>
      ${cgRefCard('iBGP + Route Reflector', 'fas fa-server', cgRefTopo(`
        ┌─── RR ───┐
        │  192.0.0.1│
        └─┬──┬──┬──┘
       iBGP│  │  │iBGP
    ┌──────┘  │  └──────┐
    ▼         ▼         ▼
  PE1        PE2        PE3

  • Full-mesh yerine RR kullanılır
  • cluster-id, client/non-client ayrımı
  • next-hop-self gerekebilir
`))}
    </div>
  </div>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('BGP Path Attributes (seçim sırası)', 'fas fa-list-ol', `
        <ol class="cg-ref-list">
          <li><strong>Weight</strong> — Cisco'ya özgü, yüksek = tercihli</li>
          <li><strong>Local Preference</strong> — AS içi çıkış seçimi, yüksek = tercihli</li>
          <li><strong>Locally Originated</strong> — network / aggregate</li>
          <li><strong>AS Path Length</strong> — kısa = tercihli</li>
          <li><strong>Origin</strong> — IGP &gt; EGP &gt; Incomplete</li>
          <li><strong>MED</strong> — Multi-Exit Discriminator, düşük = tercihli</li>
          <li><strong>eBGP &gt; iBGP</strong></li>
          <li><strong>IGP Metric</strong> — next-hop'a en düşük metric</li>
          <li><strong>Router ID</strong> — en düşük</li>
        </ol>`)}
    </div>
    <div>
      ${cgRefCard('BGP State Machine', 'fas fa-project-diagram', cgRefTopo(`
  Idle ──► Connect ──► Active
            │
            ▼
         OpenSent
            │
            ▼
         OpenConfirm
            │
            ▼
         Established ✓

  Sorun: BGP stuck in Active
  → Peer IP veya AS numarası hatalı
  → TCP 179 engelli (firewall/ACL)
  → Authentication mismatch
`))}
    </div>
  </div>

  <div class="cg-ref-verify">
    <div class="cg-ref-verify-title">Doğrulama Komutları</div>
    <div class="cg-ref-cmds-grid">
      ${cgRefCmds('Cisco IOS', ['show bgp summary', 'show bgp neighbors <IP> advertised-routes', 'show bgp neighbors <IP> received-routes', 'debug bgp updates'])}
      ${cgRefCmds('Juniper', ['show bgp summary', 'show bgp neighbor <IP>', 'show route protocol bgp', 'show route advertising-protocol bgp <IP>'])}
      ${cgRefCmds('Huawei VRP', ['display bgp peer', 'display bgp routing-table', 'display bgp peer <IP> verbose'])}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// OSPF Alan Mimarisi
// ─────────────────────────────────────────────────────────────────────────────
CgReference.ospf = {
    label: 'OSPF Alan Mimarisi',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-project-diagram"></i> OSPF — Open Shortest Path First</div>
  <p class="cg-ref-intro">OSPF, link-state tabanlı bir IGP'dir. Dijkstra algoritması (SPF) ile en kısa yolu hesaplar. Hiyerarşik tasarım için Area kavramını kullanır.</p>

  ${cgRefCard('OSPF Alan Hiyerarşisi', 'fas fa-layer-group', cgRefTopo(`
                ┌─────────────────────────────┐
                │      Area 0 (Backbone)       │
                │   ┌────┐     ┌────┐          │
                │   │ R1 ├─────┤ R2 │          │
                │   └──┬─┘     └─┬──┘          │
                └──────┼─────────┼─────────────┘
                       │ ABR     │ ABR
          ┌────────────┘         └────────────┐
          │                                   │
  ┌───────┴──────┐                   ┌────────┴─────┐
  │   Area 1     │                   │   Area 2     │
  │   (Normal)   │                   │   (Stub)     │
  │  ┌───┐       │                   │  ┌───┐       │
  │  │R3 │       │                   │  │R4 │       │
  │  └───┘       │                   │  └───┘       │
  └──────────────┘                   └──────────────┘

  ABR  = Area Border Router (iki area'ya bağlı)
  ASBR = AS Boundary Router (dış rota redistribution)
  DR   = Designated Router (multi-access ağlarda)
  BDR  = Backup Designated Router
`))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Alan Tipleri', 'fas fa-map', cgRefTable(
          ['Alan Tipi', 'Özellik', 'Default Route'],
          [
              ['Normal', 'Tüm LSA\'lar geçer', 'Hayır'],
              ['Stub', 'Tip 5 LSA engellenir', 'Evet (otomat.)'],
              ['Totally Stub', 'Tip 3,5 LSA engellenir', 'Evet'],
              ['NSSA', 'Tip 7 → Tip 5 çevrim', 'Opsiyonel'],
          ]
      ))}
    </div>
    <div>
      ${cgRefCard('OSPF Paket Tipleri', 'fas fa-envelope', cgRefTable(
          ['Tip', 'Ad', 'Amaç'],
          [
              ['1', 'Hello', 'Komşuluk kurma/koruma'],
              ['2', 'DBD', 'LSDB özeti paylaşımı'],
              ['3', 'LSR', 'LSA isteme'],
              ['4', 'LSU', 'LSA gönderme'],
              ['5', 'LSAck', 'Onaylama'],
          ]
      ))}
    </div>
  </div>

  <div class="cg-ref-verify">
    <div class="cg-ref-verify-title">Doğrulama Komutları</div>
    <div class="cg-ref-cmds-grid">
      ${cgRefCmds('Cisco IOS', ['show ip ospf neighbor', 'show ip ospf database', 'show ip ospf interface brief', 'debug ip ospf events'])}
      ${cgRefCmds('Juniper', ['show ospf neighbor', 'show ospf database', 'show ospf route', 'show ospf statistics'])}
      ${cgRefCmds('FortiGate', ['get router info ospf neighbor', 'get router info routing-table ospf', 'diagnose ip router ospf all enable'])}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// MPLS L3VPN
// ─────────────────────────────────────────────────────────────────────────────
CgReference.mpls_vpn = {
    label: 'MPLS L3VPN Mimarisi',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-tags"></i> MPLS L3VPN — Layer 3 Virtual Private Network</div>
  <p class="cg-ref-intro">MPLS L3VPN, servis sağlayıcıların aynı fiziksel altyapı üzerinde izole müşteri ağları sunmasını sağlar. VRF (Virtual Routing and Forwarding) ile her müşteriye özel routing tablosu oluşturulur.</p>

  ${cgRefCard('PE–P–CE Topoloji', 'fas fa-network-wired', cgRefTopo(`
  Müşteri A                                          Müşteri A
  Site 1                                             Site 2
  ┌──────┐   CE-PE         MPLS Core        PE-CE   ┌──────┐
  │  CE1 ├──────┤PE1├──────────────────────┤PE2├────┤  CE2 │
  └──────┘      │   LABEL  ┌──────┐  LABEL  │       └──────┘
  10.1.1.0/24   │  STACK   │  P   │  STACK  │       10.2.2.0/24
  VRF: CUST_A   │   ══════►│Router│══════►  │       VRF: CUST_A
                │          └──────┘          │
  ┌──────┐   CE-PE                      PE-CE   ┌──────┐
  │  CE3 ├──────┤PE1│                   ┤PE2├────┤  CE4 │
  └──────┘      │                            │       └──────┘
  VRF: CUST_B   │                            │       VRF: CUST_B

  PE  = Provider Edge  (VRF, MP-BGP, label imposition)
  P   = Provider Core  (label switching only, no VRF)
  CE  = Customer Edge  (PE'ye bağlı müşteri cihazı)
`))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('VRF Kavramları', 'fas fa-table', cgRefTable(
          ['Kavram', 'Açıklama'],
          [
              ['RD (Route Distinguisher)', 'BGP prefix\'i benzersiz yapar (ASN:NN). İzolasyon değil, ayrım içindir.'],
              ['RT Import', 'Hangi community\'lerin bu VRF\'e alınacağı'],
              ['RT Export', 'Bu VRF\'in rotalarına hangi community ekleneceği'],
              ['MP-BGP (VPNv4)', 'PE\'ler arası VRF rotalarını taşır (RD+prefix)'],
              ['Label Stack', 'Dış: LSP etiketi (P router\'lar için), İç: VPN etiketi (PE lookup için)'],
          ]
      ))}
    </div>
    <div>
      ${cgRefCard('Etiket (Label) Yığını', 'fas fa-layer-group', cgRefTopo(`
  ┌──────────────────────────┐
  │  Ethernet Header         │
  ├──────────────────────────┤
  │  Outer Label (LSP)  ◄── P router'lar bu etikete bakar
  ├──────────────────────────┤
  │  Inner Label (VPN)  ◄── PE router bu etiketle VRF seçer
  ├──────────────────────────┤
  │  IP Header (müşteri)     │
  ├──────────────────────────┤
  │  Payload                 │
  └──────────────────────────┘

  Penultimate Hop Popping (PHP):
  Son P router, dış etiketi söker → PE
  sadece iç (VPN) etiketiyle gelir.
`))}
    </div>
  </div>

  <div class="cg-ref-verify">
    <div class="cg-ref-verify-title">Doğrulama Komutları</div>
    <div class="cg-ref-cmds-grid">
      ${cgRefCmds('Cisco IOS PE', ['show ip vrf', 'show ip route vrf CUST_A', 'show bgp vpnv4 unicast all summary', 'show mpls forwarding-table', 'ping vrf CUST_A <IP>'])}
      ${cgRefCmds('Juniper MX PE', ['show route table CUST_A.inet.0', 'show bgp summary instance CUST_A', 'show ldp neighbor', 'show mpls lsp', 'show route protocol bgp table bgp.l3vpn.0'])}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// HA Pattern'ları
// ─────────────────────────────────────────────────────────────────────────────
CgReference.ha = {
    label: 'Yüksek Erişilebilirlik (HA)',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-heartbeat"></i> Yüksek Erişilebilirlik — HA Pattern'ları</div>
  <p class="cg-ref-intro">Ağ cihazlarında yüksek erişilebilirlik, tek nokta arızasını (SPOF) ortadan kaldırır. Farklı vendor'ların farklı implementasyonları olsa da temel kavramlar evrenseldir.</p>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Active / Passive (A/P)', 'fas fa-sync-alt', cgRefTopo(`
        İnternete
           │
    ┌──────┴──────┐
    │  Virtual IP  │  (VIP = Trafik adresi)
    └──────┬──────┘
           │
    ┌──────┴──────┐   Heartbeat   ┌─────────────┐
    │  FW-1       ├───────────────┤  FW-2       │
    │  ACTIVE ✓   │               │  STANDBY    │
    │  Config Sync│               │  (bekliyor) │
    └──────┬──────┘               └─────────────┘
           │
      İç Ağa

  Avantaj: Basit, session sync
  Dezavantaj: Standby kaynak kullanmıyor
`))}
    </div>
    <div>
      ${cgRefCard('Active / Active (A/A)', 'fas fa-balance-scale', cgRefTopo(`
        İnternete
           │
    ┌──────┴──────┐
    │  Load Balancer│
    └──────┬──────┘
    ┌──────┴──────┐
    │             │
  FW-1          FW-2
  ACTIVE        ACTIVE
  (Flow 1-N)   (Flow N+1-M)

  Avantaj: Her iki cihaz trafik taşır
  Dikkat: Asimetrik routing sorunu
  → Stateful session sync şart
`))}
    </div>
  </div>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Vendor HA Karşılaştırması', 'fas fa-table', cgRefTable(
          ['Vendor', 'Teknoloji', 'Anahtar Özellik'],
          [
              ['Cisco ASA', 'Failover (A/P or A/A)', 'stateful failover, spanned etherchannel'],
              ['FortiGate', 'FGCP HA', 'session-sync, heartbeat interface'],
              ['Palo Alto', 'HA1/HA2 links', 'HA1=control, HA2=data-sync'],
              ['Check Point', 'ClusterXL', 'pivot mode veya LS mode'],
              ['F5 BIG-IP', 'DSC (Device Service Cluster)', 'configsync, device-trust'],
              ['Juniper SRX', 'Chassis Cluster', 'fabric link, redundancy-group'],
              ['Citrix ADC', 'HA Pair', 'sync via management network'],
          ]
      ))}
    </div>
    <div>
      ${cgRefCard('FHRP Protokolleri (Gateway HA)', 'fas fa-route', cgRefTable(
          ['Protokol', 'Vendor', 'Virtual IP Tipi'],
          [
              ['HSRP v2', 'Cisco', 'Aktif/Standby, preempt'],
              ['VRRP v3', 'Standart', 'Master/Backup, RFC 5798'],
              ['GLBP', 'Cisco', 'AVG + AVF, load-balance'],
              ['CARP', 'OpenBSD/pfSense', 'Master/Backup'],
          ]
      ))}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// NAT Tipleri
// ─────────────────────────────────────────────────────────────────────────────
CgReference.nat = {
    label: 'NAT Tipleri',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-exchange-alt"></i> NAT — Network Address Translation</div>
  <p class="cg-ref-intro">NAT, IP paketlerindeki kaynak veya hedef adreslerini değiştirerek adres çevirisi yapar. Güvenlik (RFC 1918 adresleri gizleme) ve adres tasarrufu için kullanılır.</p>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Source NAT (SNAT / Masquerade)', 'fas fa-sign-out-alt', cgRefTopo(`
  İç Ağ              Firewall/Router          İnternet
  ┌──────┐    Kaynak   ┌─────────┐   Kaynak   ┌──────┐
  │Client│  10.1.1.5   │   NAT   │  203.0.113 │Server│
  │      ├────────────►│         ├────────────►│      │
  │      │ →dst:8.8.8.8│  Pool   │ →dst:8.8.8.8│      │
  └──────┘             └─────────┘             └──────┘

  SNAT türleri:
  • Dynamic NAT    — Pool'dan IP atanır
  • PAT/Overload   — Tek IP, farklı port (en yaygın)
  • Interface NAT  — WAN interface IP'si kullanılır
`))}
    </div>
    <div>
      ${cgRefCard('Destination NAT (DNAT / Port Forward)', 'fas fa-sign-in-alt', cgRefTopo(`
  İnternet              Firewall/Router        İç Ağ
  ┌──────┐   Hedef:     ┌─────────┐  Hedef:   ┌──────┐
  │Kullan│ 203.0.113:80 │   DNAT  │ 10.1.1.10 │  Web │
  │  ıcı ├────────────►│         ├────────────►│Server│
  └──────┘             └─────────┘  :8080      └──────┘

  Kullanım:
  • Web sunucu yayınlama
  • Port yönlendirme (port forward)
  • Load balancing (birden fazla hedef)
`))}
    </div>
  </div>

  ${cgRefCard('Vendor NAT Komutları', 'fas fa-code', cgRefTable(
      ['Vendor', 'SNAT (Outbound)', 'DNAT (Port Forward)'],
      [
          ['Cisco IOS', 'ip nat inside source list ACL interface Gi0/0 overload', 'ip nat inside destination list ACL pool DNAT-POOL'],
          ['FortiGate', 'config firewall policy → NAT enable', 'config firewall vip + policy'],
          ['Palo Alto', 'NAT Policy → Dynamic IP/Port (src)', 'NAT Policy → Destination Address'],
          ['Check Point', 'mgmt_cli add nat-rule (hide)', 'mgmt_cli add nat-rule (static)'],
          ['Juniper SRX', 'security nat source rule-set ... then source-nat interface', 'security nat destination rule-set ... then destination-nat pool'],
          ['Huawei USG', 'nat-policy + easy-ip', 'nat server protocol tcp global <ext-ip> <port> inside <int-ip> <port>'],
      ]
  ))}
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// IPsec VPN Modları
// ─────────────────────────────────────────────────────────────────────────────
CgReference.ipsec = {
    label: 'IPsec VPN Modları',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-lock"></i> IPsec — Internet Protocol Security</div>
  <p class="cg-ref-intro">IPsec, IP katmanında şifreleme ve kimlik doğrulama sağlar. IKE ile anahtar değişimi, ESP/AH ile veri koruması yapılır.</p>

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Tunnel vs Transport Modu', 'fas fa-layer-group', cgRefTopo(`
  TUNNEL MODU (Site-to-Site VPN):
  ┌─────┬─────────────────────────────┐
  │New  │ ESP │  Orig IP  │  Payload  │
  │IP   │     │  Header   │           │
  └─────┴─────────────────────────────┘
  ← Yeni IP header eklenir (tunnel endpoint'leri)

  TRANSPORT MODU (Host-to-Host):
  ┌─────────────┬──────────────────────┐
  │  IP Header  │ ESP │    Payload     │
  │  (değişmez) │     │                │
  └─────────────┴──────────────────────┘
  ← Orijinal IP header korunur
`))}
    </div>
    <div>
      ${cgRefCard('IKE Faz Karşılaştırması', 'fas fa-handshake', cgRefTable(
          ['Faz', 'IKEv1', 'IKEv2'],
          [
              ['Faz 1', 'Main (6 mesaj) veya Aggressive (3 mesaj)', 'IKE_SA_INIT (2 mesaj)'],
              ['Faz 2', 'Quick Mode (3 mesaj)', 'IKE_AUTH + CREATE_CHILD_SA'],
              ['Toplam', '9 veya 6 mesaj', '4 mesaj (daha hızlı)'],
              ['EAP Auth', 'Desteklenmez', 'Desteklenir'],
              ['MOBIKE', 'Yok', 'RFC 4555 (IP değişimi)'],
          ]
      ))}
    </div>
  </div>

  ${cgRefCard('Tipik Site-to-Site IPsec Kurulumu', 'fas fa-network-wired', cgRefTopo(`
  Site A                                              Site B
  ┌──────────┐    Phase 1: IKE SA    ┌──────────┐
  │  FW/R    │ ◄────────────────────►│  FW/R    │
  │203.0.113.1│                      │198.51.100.1│
  │          │    Phase 2: IPsec SA  │          │
  │          │ ◄────────────────────►│          │
  └────┬─────┘                      └─────┬────┘
       │                                   │
  10.1.0.0/24                        10.2.0.0/24

  Kontrol Listesi:
  ✓ Her iki tarafta aynı encryption/hash/DH group
  ✓ Pre-shared key tam eşleşmeli
  ✓ UDP 500 ve 4500 (NAT-T) açık olmalı
  ✓ Proxy ID / Traffic Selector eşleşmeli
  ✓ Yaşam süresi (lifetime) uyumlu olmalı
`))}

  <div class="cg-ref-verify">
    <div class="cg-ref-verify-title">Doğrulama Komutları</div>
    <div class="cg-ref-cmds-grid">
      ${cgRefCmds('Cisco IOS', ['show crypto isakmp sa', 'show crypto ikev2 sa', 'show crypto ipsec sa', 'show crypto session', 'debug crypto isakmp', 'debug crypto ipsec'])}
      ${cgRefCmds('FortiGate', ['diagnose vpn ike status', 'diagnose vpn tunnel list', 'get vpn ipsec tunnel summary'])}
      ${cgRefCmds('Juniper SRX', ['show security ike security-associations', 'show security ipsec security-associations', 'clear security ike security-associations all'])}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// VXLAN / EVPN
// ─────────────────────────────────────────────────────────────────────────────
CgReference.vxlan = {
    label: 'VXLAN / EVPN',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-network-wired"></i> VXLAN / EVPN — Modern Data Center Fabric</div>
  <p class="cg-ref-intro">VXLAN (Virtual Extensible LAN), Layer 2 ağları UDP tüneller içinde taşıyarak veri merkezi fabric'i üzerinde overlay ağlar oluşturur. EVPN, BGP tabanlı kontrol düzlemidir.</p>

  ${cgRefCard('VXLAN Topoloji: Spine-Leaf', 'fas fa-sitemap', cgRefTopo(`
                ┌──────────┐    ┌──────────┐
                │  Spine 1 │    │  Spine 2 │  (IP Underlay: OSPF/eBGP)
                └────┬─┬───┘    └───┬─┬────┘
                   ╱   ╲          ╱   ╲
                 ╱       ╲      ╱       ╲
         ┌──────┐          ┌──────┐          ┌──────┐
         │Leaf 1│  VXLAN   │Leaf 2│  VXLAN   │Leaf 3│
         │VTEP  │◄────────►│VTEP  │◄────────►│VTEP  │
         └──┬───┘  Tunnel  └──┬───┘  Tunnel  └──┬───┘
            │                 │                  │
         Server A           Server B           Server C
         VNI: 10100         VNI: 10100         VNI: 10200

  VTEP  = VXLAN Tunnel Endpoint (tüneli başlatan/sonlandıran)
  VNI   = VXLAN Network Identifier (24-bit, ~16M segment)
  Spine = Sadece IP routing, VTEP değil
`))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('VXLAN Frame Yapısı', 'fas fa-layer-group', cgRefTopo(`
  ┌──────────────────────────────────────────┐
  │  Outer Ethernet Header                   │
  ├──────────────────────────────────────────┤
  │  Outer IP Header (VTEP src → dst)        │
  ├──────────────────────────────────────────┤
  │  Outer UDP Header (dport: 4789)          │
  ├──────────────────────────────────────────┤
  │  VXLAN Header (VNI: 24-bit)              │
  ├──────────────────────────────────────────┤
  │  Inner Ethernet Header (orijinal frame)  │
  ├──────────────────────────────────────────┤
  │  Inner IP + Payload                      │
  └──────────────────────────────────────────┘
  Overhead: ~50 byte → MTU en az 1550 önerilir
`))}
    </div>
    <div>
      ${cgRefCard('EVPN Route Tipleri', 'fas fa-table', cgRefTable(
          ['Tip', 'Ad', 'Kullanım'],
          [
              ['Tip 1', 'Ethernet Auto-Discovery', 'ESI multi-homing'],
              ['Tip 2', 'MAC/IP Advertisement', 'MAC + ARP öğrenme (L2 VNI)'],
              ['Tip 3', 'Inclusive Multicast', 'BUM traffic (broadcast)'],
              ['Tip 4', 'Ethernet Segment', 'DF seçimi'],
              ['Tip 5', 'IP Prefix', 'L3 VNI routing (en yaygın)'],
          ]
      ))}
    </div>
  </div>
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Load Balancer Mimarisi
// ─────────────────────────────────────────────────────────────────────────────
CgReference.lb = {
    label: 'Load Balancer Mimarisi',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-balance-scale"></i> Load Balancer — Yük Dengeleme Mimarisi</div>
  <p class="cg-ref-intro">Load Balancer, gelen trafiği birden fazla sunucuya dağıtarak hem yük dengeleme hem de yüksek erişilebilirlik sağlar. F5 BIG-IP ve Citrix ADC kurumsal dünyada en yaygın kullanılan ürünlerdir.</p>

  ${cgRefCard('Temel Bileşenler', 'fas fa-sitemap', cgRefTopo(`
       İstemciler
           │
    VIP: 10.1.1.100:443   ← Virtual Server (VS)
           │
    ┌──────┴──────┐
    │  LB Engine  │ ← Persistence, Health Check, SSL Offload
    └──────┬──────┘
           │  Pool: POOL_APP_HTTPS
    ┌──────┼──────┬──────┐
    │      │      │      │
  Node1  Node2  Node3  Node4   ← Pool Members (Real Servers)
  :8080  :8080  :8080  :8080

  VIP  = Virtual IP (istemcinin bağlandığı adres)
  Pool = Gerçek sunucu grubu
  Node = Sunucunun IP adresi (yalniz IP)
  Pool Member = Node + port (ornek 10.0.0.5:8080)
`))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('LB Algoritmaları', 'fas fa-random', cgRefTable(
          ['Algoritma', 'Açıklama', 'Kullanım'],
          [
              ['Round Robin', 'Sırayla dağıtır', 'Eşit kapasiteli sunucular'],
              ['Least Connections', 'En az aktif bağlantı', 'Uzun süreli oturumlar'],
              ['IP Hash', 'Kaynak IP hash', 'Basit session affinity'],
              ['Weighted RR', 'Ağırlıklı dağıtım', 'Farklı kapasiteli sunucular'],
              ['Fastest', 'En hızlı yanıt veren', 'Performans kritik'],
              ['Observed', 'Bağlantı + yanıt süresi', 'Adaptif dağıtım'],
          ]
      ))}
    </div>
    <div>
      ${cgRefCard('Persistence (Session Affinity)', 'fas fa-thumbtack', cgRefTable(
          ['Tip', 'Açıklama'],
          [
              ['Cookie Insert', 'LB, HTTP response\'a cookie ekler (en güvenilir)'],
              ['Source IP', 'Kaynak IP\'ye göre aynı sunucu (NAT sorunları var)'],
              ['SSL Session', 'SSL session ID ile (SSL offload gerekir)'],
              ['Universal', 'İstenen offset\'ten veri alınır'],
          ]
      ))}
    </div>
  </div>

  ${cgRefCard('SSL Offload vs SSL Passthrough vs SSL Re-encryption', 'fas fa-lock', cgRefTopo(`
  SSL OFFLOAD (en yaygın):
  Client ──HTTPS──► LB (decrypt) ──HTTP──► Server
  Avantaj: Sunucu CPU yükü azalır, L7 inspection mümkün

  SSL PASSTHROUGH:
  Client ──HTTPS──► LB (L4 only) ──HTTPS──► Server
  Avantaj: End-to-end şifreleme, LB içeriği göremez
  Dezavantaj: Cookie/header manipulation imkansız

  SSL RE-ENCRYPTION (SSL Bridging):
  Client ──HTTPS──► LB (decrypt + inspect) ──HTTPS──► Server
  Avantaj: Hem inspection hem şifreleme
  Dezavantaj: İki SSL handshake = daha yüksek gecikme
`))}
</div>`;
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// Sertifikasyon Haritası
// ─────────────────────────────────────────────────────────────────────────────
CgReference.certmap = {
    label: 'Sertifikasyon Haritası',
    init(container) {
        container.innerHTML = `
<div class="cg-ref-page">
  <div class="cg-ref-title"><i class="fas fa-certificate"></i> Ağ Sertifikasyon Haritası</div>
  <p class="cg-ref-intro">Bu generator'daki konular çeşitli vendor sertifikasyonlarıyla örtüşmektedir. Aşağıdaki tablo hangi generator'ın hangi sertifikasyonla ilgili olduğunu gösterir.</p>

  ${cgRefCard('Cisco Sertifikasyon Yolu', 'fas fa-road', cgRefTopo(`
  CCNA (200-301)
  ├── VLAN, STP, EtherChannel
  ├── OSPF (single area), BGP temel
  ├── ACL, NAT, DHCP, SSH
  └── Temel güvenlik

  CCNP Enterprise (350-401 ENCOR + seçmeli)
  ├── Advanced OSPF, EIGRP Named Mode, BGP
  ├── DMVPN, GRE, VRF-Lite
  ├── MPLS LDP, L3VPN (ENARSI seçmeli)
  └── SD-WAN (ENSDWI seçmeli)

  CCIE Enterprise Infrastructure
  └── Tüm CCNP konuları + VXLAN/EVPN, SR
`))}

  ${cgRefCard('Vendor Sertifikasyon Eşleşmesi', 'fas fa-table', cgRefTable(
      ['Generator Konusu', 'Cisco', 'Juniper', 'Palo Alto', 'F5', 'Fortinet'],
      [
          ['VLAN/L2', 'CCNA', 'JNCIA', '—', '—', 'NSE4'],
          ['OSPF/BGP', 'CCNP ENCOR', 'JNCIP', '—', '—', 'NSE5'],
          ['MPLS/L3VPN', 'CCNP ENARSI', 'JNCIP-SP', '—', '—', '—'],
          ['Firewall Policy', 'CCNA Sec', 'JNCIA-SEC', 'PCNSA', '—', 'NSE4'],
          ['VPN (IPsec/SSL)', 'CCNP Sec', 'JNCIP-SEC', 'PCNSE', '201-LTM', 'NSE5'],
          ['Load Balancing', '—', '—', '—', 'F5-201/301', '—'],
          ['VXLAN/EVPN', 'CCIE', 'JNCIP-DC', '—', '—', 'NSE7'],
          ['HA/Clustering', 'CCNP Sec', 'JNCIP-SEC', 'PCNSE', 'F5-301', 'NSE5'],
      ]
  ))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Juniper Sertifikasyon Yolu', 'fas fa-leaf', `
      <ul class="cg-ref-list">
        <li><strong>JNCIA-Junos</strong> — JunOS CLI, routing basics</li>
        <li><strong>JNCIS-ENT</strong> — OSPF, BGP, switching</li>
        <li><strong>JNCIP-ENT</strong> — Advanced routing, MPLS</li>
        <li><strong>JNCIA-SEC</strong> — SRX basics, policies, NAT</li>
        <li><strong>JNCIP-SEC</strong> — VPN, AppSecure, chassis cluster</li>
      </ul>`)}
    </div>
    <div>
      ${cgRefCard('Güvenlik Sertifikasyonları', 'fas fa-shield-alt', `
      <ul class="cg-ref-list">
        <li><strong>Palo Alto PCNSA/PCNSE</strong> — Zones, policies, URL filtering, GlobalProtect, HA</li>
        <li><strong>Fortinet NSE 4-7</strong> — FortiGate politika, UTM, SD-WAN, HA</li>
        <li><strong>Check Point CCSA/CCSE</strong> — SmartConsole, mgmt_cli, VPN, HA</li>
        <li><strong>F5 201/301 LTM</strong> — Virtual server, pool, iRule, SSL profil</li>
      </ul>`)}
    </div>
  </div>
</div>`;
    }
};
