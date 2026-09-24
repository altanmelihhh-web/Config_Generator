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
      ${cgRefCard('iBGP + Route Reflector', 'fas fa-server', cgDia({
        w: 480, h: 210, alt: 'Route reflector ile iBGP dağıtımı',
        zones: [ { x: 10, y: 8, w: 460, h: 178, label: 'Tek AS içinde (iBGP)' } ],
        nodes: [
          { x: 240, y: 52,  kind: 'router', label: 'RR',  sub: '192.0.0.1' },
          { x: 90,  y: 148, kind: 'router', label: 'PE1' },
          { x: 240, y: 148, kind: 'router', label: 'PE2' },
          { x: 390, y: 148, kind: 'router', label: 'PE3' }
        ],
        links: [
          { x1: 210, y1: 75, x2: 110, y2: 125, arrow: true, label: 'iBGP' },
          { x1: 240, y1: 75, x2: 240, y2: 125, arrow: true },
          { x1: 270, y1: 75, x2: 370, y2: 125, arrow: true, label: 'iBGP' }
        ],
        notes: [
          'Full-mesh yerine RR: n(n-1)/2 oturum yerine n oturum',
          '<code>cluster-id</code> ve client / non-client ayrımı önemli',
          '<code>next-hop-self</code> gerekebilir'
        ]
      }))}
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
      ${cgRefCard('BGP State Machine', 'fas fa-project-diagram', cgDia({
        w: 480, h: 250, alt: 'BGP oturum kurulum durumları',
        nodes: [
          { x: 70,  y: 34,  w: 96, h: 34, kind: 'cloud',  label: 'Idle' },
          { x: 240, y: 34,  w: 96, h: 34, kind: 'cloud',  label: 'Connect' },
          { x: 410, y: 34,  w: 96, h: 34, kind: 'cloud',  label: 'Active' },
          { x: 240, y: 104, w: 130, h: 34, kind: 'router', label: 'OpenSent' },
          { x: 240, y: 158, w: 130, h: 34, kind: 'router', label: 'OpenConfirm' },
          { x: 240, y: 212, w: 150, h: 34, kind: 'server', label: 'Established' }
        ],
        links: [
          { x1: 118, y1: 34,  x2: 192, y2: 34,  arrow: true },
          { x1: 288, y1: 34,  x2: 362, y2: 34,  arrow: true },
          { x1: 410, y1: 51,  x2: 410, y2: 78, arrow: false, dash: true },
          { x1: 410, y1: 78,  x2: 305, y2: 78, arrow: false, dash: true },
          { x1: 305, y1: 78,  x2: 305, y2: 40, arrow: true,  dash: true, label: 'retry' },
          { x1: 240, y1: 51,  x2: 240, y2: 87,  arrow: true },
          { x1: 240, y1: 121, x2: 240, y2: 141, arrow: true },
          { x1: 240, y1: 175, x2: 240, y2: 195, arrow: true }
        ],
        notes: [
          '<strong>Active durumunda takılıyorsa</strong> oturum kurulamıyor demektir:',
          'Peer IP veya AS numarası hatalı',
          'TCP <code>179</code> engelli (firewall / ACL)',
          'Authentication (MD5 / TCP-AO) uyuşmazlığı'
        ]
      }))}
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

  ${cgRefCard('OSPF Alan Hiyerarşisi', 'fas fa-layer-group', cgDia({
    w: 520, h: 240, alt: 'OSPF alan hiyerarşisi ve ABR konumları',
    zones: [
      { x: 130, y: 8,   w: 260, h: 86,  label: 'Area 0 — Backbone' },
      { x: 20,  y: 140, w: 210, h: 88,  label: 'Area 1 (Normal)' },
      { x: 290, y: 140, w: 210, h: 88,  label: 'Area 2 (Stub)' }
    ],
    nodes: [
      { x: 205, y: 58,  kind: 'router', label: 'R1' },
      { x: 315, y: 58,  kind: 'router', label: 'R2' },
      { x: 125, y: 192, kind: 'router', label: 'R3' },
      { x: 395, y: 192, kind: 'router', label: 'R4' }
    ],
    links: [
      { x1: 257, y1: 58,  x2: 263, y2: 58 },
      { x1: 185, y1: 81,  x2: 125, y2: 169, label: 'ABR', lx: 138, ly: 128 },
      { x1: 335, y1: 81,  x2: 395, y2: 169, label: 'ABR', lx: 382, ly: 128 }
    ],
    notes: [
      '<strong>ABR</strong> — Area Border Router: iki alana birden bağlı',
      '<strong>ASBR</strong> — AS Boundary Router: dış rotaları redistribute eder',
      '<strong>DR / BDR</strong> — çok erişimli ağlarda komşuluk sayısını azaltır',
      'Her alan Area 0\'a bağlanmalıdır; olmuyorsa <code>virtual-link</code> gerekir'
    ]
  }))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Alan Tipleri', 'fas fa-map', cgRefTable(
          ['Alan Tipi', 'Özellik', 'Default Route'],
          [
              ['Normal', 'Tüm LSA\'lar geçer', 'Hayır'],
              ['Stub', 'Tip 4 ve 5 engellenir', 'Evet (otomat.)'],
              ['Totally Stub', 'Tip 3, 4, 5 engellenir (default yine Tip 3 gelir)', 'Evet'],
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

  ${cgRefCard('PE–P–CE Topoloji', 'fas fa-network-wired', cgDia({
    w: 560, h: 220, alt: 'MPLS L3VPN PE P CE topolojisi',
    zones: [ { x: 150, y: 44, w: 260, h: 104, label: 'MPLS Core (etiket anahtarlama)' } ],
    nodes: [
      { x: 60,  y: 78,  w: 84, kind: 'router', label: 'CE1', sub: '10.1.1.0/24' },
      { x: 500, y: 78,  w: 84, kind: 'router', label: 'CE2', sub: '10.2.2.0/24' },
      { x: 60,  y: 168, w: 84, kind: 'router', label: 'CE3' },
      { x: 500, y: 168, w: 84, kind: 'router', label: 'CE4' },
      { x: 195, y: 122, w: 78, kind: 'switch', label: 'PE1' },
      { x: 365, y: 122, w: 78, kind: 'switch', label: 'PE2' },
      { x: 280, y: 92,  w: 78, kind: 'cloud',  label: 'P' }
    ],
    links: [
      { x1: 102, y1: 78,  x2: 156, y2: 114 },
      { x1: 102, y1: 168, x2: 156, y2: 130 },
      { x1: 458, y1: 78,  x2: 404, y2: 114 },
      { x1: 458, y1: 168, x2: 404, y2: 130 },
      { x1: 234, y1: 114, x2: 241, y2: 98 },
      { x1: 319, y1: 98,  x2: 326, y2: 114 }
    ],
    texts: [ { x: 280, y: 200, text: 'CE tarafı VRF ile ayrılır — CUST_A ve CUST_B birbirini görmez' } ],
    notes: [
      '<strong>PE</strong> — Provider Edge: VRF tutar, MP-BGP konuşur, etiketi ekler',
      '<strong>P</strong> — Provider Core: yalnızca etiket anahtarlar, VRF bilmez',
      '<strong>CE</strong> — Customer Edge: müşteri cihazı, MPLS\'ten habersizdir'
    ]
  }))}

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
      ${cgRefCard('Etiket (Label) Yığını', 'fas fa-layer-group', cgDia({
        w: 420, h: 210, alt: 'MPLS etiket yığını katmanları',
        nodes: [
          { x: 150, y: 24,  w: 240, h: 30, kind: 'cloud',  label: 'Ethernet Header' },
          { x: 150, y: 62,  w: 240, h: 30, kind: 'router', label: 'Outer Label (LSP)' },
          { x: 150, y: 100, w: 240, h: 30, kind: 'switch', label: 'Inner Label (VPN)' },
          { x: 150, y: 138, w: 240, h: 30, kind: 'server', label: 'IP Header (müşteri)' },
          { x: 150, y: 176, w: 240, h: 30, kind: 'cloud',  label: 'Payload' }
        ],
        texts: [
          { x: 280, y: 66,  text: '← P router bu etikete bakar',  anchor: 'start' },
          { x: 280, y: 104, text: '← PE bununla VRF seçer',       anchor: 'start' }
        ],
        notes: [
          '<strong>PHP (Penultimate Hop Popping):</strong> son P router dış etiketi söker,',
          'PE yalnızca iç (VPN) etiketiyle alır — PE\'de bir arama işlemi azalır'
        ]
      }))}
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
      ${cgRefCard('Active / Passive (A/P)', 'fas fa-sync-alt', cgDia({
        w: 460, h: 250, alt: 'Aktif pasif firewall kumesi',
        nodes: [
          { x: 230, y: 24,  w: 110, h: 32, kind: 'cloud',    label: 'İnternet' },
          { x: 230, y: 84,  w: 150, h: 34, kind: 'lb',       label: 'Virtual IP (VIP)' },
          { x: 120, y: 160, w: 130, h: 46, kind: 'firewall', label: 'FW-1', sub: 'ACTIVE' },
          { x: 340, y: 160, w: 130, h: 46, kind: 'firewall', label: 'FW-2', sub: 'STANDBY' },
          { x: 120, y: 226, w: 110, h: 30, kind: 'cloud',    label: 'İç Ağ' }
        ],
        links: [
          { x1: 230, y1: 40,  x2: 230, y2: 67 },
          { x1: 200, y1: 101, x2: 140, y2: 137 },
          { x1: 185, y1: 160, x2: 275, y2: 160, dash: true, label: 'heartbeat' },
          { x1: 120, y1: 183, x2: 120, y2: 211 }
        ],
        notes: [
          'VIP her zaman aktif üyededir; devralma sırasında IP yer değiştirir',
          '<strong>Avantaj:</strong> basit, oturum senkronizasyonu kolay',
          '<strong>Dezavantaj:</strong> standby cihaz kaynak üretmez'
        ]
      }))}
    </div>
    <div>
      ${cgRefCard('Active / Active (A/A)', 'fas fa-balance-scale', cgDia({
        w: 460, h: 240, alt: 'Aktif aktif firewall kumesi',
        nodes: [
          { x: 230, y: 24,  w: 110, h: 32, kind: 'cloud',    label: 'İnternet' },
          { x: 230, y: 86,  w: 190, h: 34, kind: 'router',   label: 'ECMP / Cluster dağıtımı' },
          { x: 120, y: 164, w: 130, h: 46, kind: 'firewall', label: 'FW-1', sub: 'Akış 1..N' },
          { x: 340, y: 164, w: 130, h: 46, kind: 'firewall', label: 'FW-2', sub: 'Akış N+1..M' }
        ],
        links: [
          { x1: 230, y1: 40,  x2: 230, y2: 69 },
          { x1: 200, y1: 103, x2: 140, y2: 141 },
          { x1: 260, y1: 103, x2: 320, y2: 141 },
          { x1: 185, y1: 164, x2: 275, y2: 164, dash: true, label: 'session sync' }
        ],
        notes: [
          '<strong>Avantaj:</strong> her iki cihaz da trafik taşır',
          '<strong>Dikkat:</strong> asimetrik yönlendirme — gidiş ve dönüş farklı cihazdan geçerse oturum düşer',
          'Dağıtım normalde ECMP veya cluster ile yapılır; önüne load balancer koymak istisnadır',
          'Stateful oturum senkronizasyonu <strong>şarttır</strong>'
        ]
      }))}
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
      ${cgRefCard('Source NAT (SNAT / Masquerade)', 'fas fa-sign-out-alt', cgDia({
        w: 500, h: 150, alt: 'Kaynak NAT akisi',
        nodes: [
          { x: 60,  y: 62, w: 96,  kind: 'server', label: 'Client', sub: '10.1.1.5' },
          { x: 250, y: 62, w: 120, kind: 'firewall', label: 'NAT', sub: '203.0.113.1' },
          { x: 440, y: 62, w: 96,  kind: 'cloud',  label: 'Server', sub: '8.8.8.8' }
        ],
        links: [
          { x1: 108, y1: 62, x2: 190, y2: 62, arrow: true, label: 'src 10.1.1.5' },
          { x1: 310, y1: 62, x2: 392, y2: 62, arrow: true, label: 'src 203.0.113.1' }
        ],
        texts: [ { x: 250, y: 130, text: 'Kaynak adres değişir, hedef aynı kalır' } ],
        notes: [
          '<strong>Dynamic NAT</strong> — havuzdan IP atanır, 1:1',
          '<strong>PAT / Overload</strong> — tek IP, farklı portlar (en yaygın)',
          '<strong>Interface NAT</strong> — WAN arayüzünün IP\'si kullanılır'
        ]
      }))}
    </div>
    <div>
      ${cgRefCard('Destination NAT (DNAT / Port Forward)', 'fas fa-sign-in-alt', cgDia({
        w: 500, h: 150, alt: 'Hedef NAT akisi',
        nodes: [
          { x: 60,  y: 62, w: 96,  kind: 'cloud',    label: 'Kullanıcı' },
          { x: 250, y: 62, w: 120, kind: 'firewall', label: 'DNAT' },
          { x: 440, y: 62, w: 96,  kind: 'server',   label: 'Web', sub: '10.1.1.10' }
        ],
        links: [
          { x1: 108, y1: 62, x2: 190, y2: 62, arrow: true, label: 'dst 203.0.113.5:80' },
          { x1: 310, y1: 62, x2: 392, y2: 62, arrow: true, label: 'dst 10.1.1.10:8080' }
        ],
        texts: [ { x: 250, y: 130, text: 'Hedef adres (ve gerekirse port) değişir' } ],
        notes: [
          'Web sunucu yayınlama (publishing)',
          'Port yönlendirme — dış port ile iç port farklı olabilir',
          'Birden fazla hedefe dağıtımda basit yük dengeleme'
        ]
      }))}
    </div>
  </div>

  ${cgRefCard('Vendor NAT Komutları', 'fas fa-code', cgRefTable(
      ['Vendor', 'SNAT (Outbound)', 'DNAT (Port Forward)'],
      [
          ['Cisco IOS', 'ip nat inside source list ACL interface Gi0/0 overload', 'ip nat inside source static tcp 10.1.1.10 8080 203.0.113.5 80 extendable'],
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
      ${cgRefCard('Tunnel vs Transport Modu', 'fas fa-layer-group', cgDia({
        w: 460, h: 190, alt: 'IPsec tunnel ve transport modu paket yapisi',
        nodes: [
          { x: 52,  y: 42,  w: 76,  h: 32, kind: 'firewall', label: 'Yeni IP' },
          { x: 132, y: 42,  w: 62,  h: 32, kind: 'router',   label: 'ESP' },
          { x: 236, y: 42,  w: 116, h: 32, kind: 'switch',   label: 'Orijinal IP' },
          { x: 372, y: 42,  w: 116, h: 32, kind: 'cloud',    label: 'Payload' },
          { x: 92,  y: 128, w: 156, h: 32, kind: 'switch',   label: 'Orijinal IP' },
          { x: 206, y: 128, w: 62,  h: 32, kind: 'router',   label: 'ESP' },
          { x: 350, y: 128, w: 152, h: 32, kind: 'cloud',    label: 'Payload' }
        ],
        texts: [
          { x: 20,  y: 20,  text: 'TUNNEL — Site-to-Site', anchor: 'start', cls: 'cg-dia-zonelabel' },
          { x: 20,  y: 106, text: 'TRANSPORT — Host-to-Host', anchor: 'start', cls: 'cg-dia-zonelabel' },
          { x: 230, y: 86,  text: 'Yeni IP başlığı eklenir (tünel uç noktaları)' },
          { x: 230, y: 172, text: 'Orijinal IP başlığı korunur' }
        ]
      }))}
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

  ${cgRefCard('Tipik Site-to-Site IPsec Kurulumu', 'fas fa-network-wired', cgDia({
    w: 520, h: 210, alt: 'Site to site IPsec tunel kurulumu',
    zones: [
      { x: 10,  y: 30, w: 170, h: 150, label: 'Site A' },
      { x: 340, y: 30, w: 170, h: 150, label: 'Site B' }
    ],
    nodes: [
      { x: 95,  y: 86,  w: 120, kind: 'firewall', label: 'FW / R', sub: '203.0.113.1' },
      { x: 425, y: 86,  w: 120, kind: 'firewall', label: 'FW / R', sub: '198.51.100.1' },
      { x: 95,  y: 152, w: 120, h: 30, kind: 'cloud', label: '10.1.0.0/24' },
      { x: 425, y: 152, w: 120, h: 30, kind: 'cloud', label: '10.2.0.0/24' }
    ],
    links: [
      { x1: 157, y1: 72,  x2: 363, y2: 72,  arrow: true, label: 'Phase 1 — IKE SA' },
      { x1: 157, y1: 102, x2: 363, y2: 102, arrow: true, label: 'Phase 2 — IPsec SA' },
      { x1: 95,  y1: 109, x2: 95,  y2: 137 },
      { x1: 425, y1: 109, x2: 425, y2: 137 }
    ],
    notes: [
      'Her iki tarafta <strong>aynı</strong> şifreleme / hash / DH grubu',
      'Pre-shared key tam eşleşmeli',
      '<code>UDP 500</code> ve NAT arkasındaysa <code>UDP 4500</code> (NAT-T) açık olmalı',
      'Proxy ID / Traffic Selector eşleşmeli',
      'Lifetime uyumlu olmalı — uyumsuzsa tünel periyodik olarak düşer'
    ]
  }))}

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

  ${cgRefCard('VXLAN Topoloji: Spine-Leaf', 'fas fa-sitemap', cgDia({
    w: 560, h: 260, alt: 'Spine leaf VXLAN topolojisi',
    zones: [ { x: 10, y: 6, w: 540, h: 86, label: 'IP Underlay — OSPF / eBGP' } ],
    nodes: [
      { x: 190, y: 58,  w: 110, kind: 'switch', label: 'Spine 1' },
      { x: 380, y: 58,  w: 110, kind: 'switch', label: 'Spine 2' },
      { x: 90,  y: 148, w: 104, kind: 'router', label: 'Leaf 1', sub: 'VTEP' },
      { x: 285, y: 148, w: 104, kind: 'router', label: 'Leaf 2', sub: 'VTEP' },
      { x: 480, y: 148, w: 104, kind: 'router', label: 'Leaf 3', sub: 'VTEP' },
      { x: 90,  y: 224, w: 104, h: 32, kind: 'server', label: 'VNI 10100' },
      { x: 285, y: 224, w: 104, h: 32, kind: 'server', label: 'VNI 10100' },
      { x: 480, y: 224, w: 104, h: 32, kind: 'cloud',  label: 'VNI 10200' }
    ],
    links: [
      { x1: 160, y1: 81, x2: 110, y2: 125 }, { x1: 210, y1: 81, x2: 275, y2: 125 },
      { x1: 355, y1: 81, x2: 305, y2: 125 }, { x1: 405, y1: 81, x2: 465, y2: 125 },
      { x1: 142, y1: 148, x2: 233, y2: 148, dash: true },
      { x1: 337, y1: 148, x2: 428, y2: 148, dash: true },
      { x1: 90,  y1: 171, x2: 480, y2: 171, dash: true, bend: [285, 205],
        label: 'VXLAN tünelleri full-mesh', lx: 285, ly: 196 },
      { x1: 90,  y1: 171, x2: 90,  y2: 208 },
      { x1: 285, y1: 171, x2: 285, y2: 208 },
      { x1: 480, y1: 171, x2: 480, y2: 208 }
    ],
    notes: [
      '<strong>VTEP</strong> — tüneli başlatan / sonlandıran uç; yalnızca leaf katmanında',
      '<strong>VNI</strong> — 24 bit segment kimliği (~16M segment)',
      'Spine yalnızca IP yönlendirir, VTEP değildir — aynı VNI\'deki leaf\'ler L2 komşu gibi davranır'
    ]
  }))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('VXLAN Frame Yapısı', 'fas fa-layer-group', cgDia({
        w: 430, h: 236, alt: 'VXLAN kapsulleme katmanlari',
        nodes: [
          { x: 160, y: 22,  w: 280, h: 30, kind: 'cloud',    label: 'Outer Ethernet' },
          { x: 160, y: 58,  w: 280, h: 30, kind: 'firewall', label: 'Outer IP — VTEP src → dst' },
          { x: 160, y: 94,  w: 280, h: 30, kind: 'router',   label: 'Outer UDP — dport 4789' },
          { x: 160, y: 130, w: 280, h: 30, kind: 'switch',   label: 'VXLAN Header — VNI 24 bit' },
          { x: 160, y: 166, w: 280, h: 30, kind: 'server',   label: 'Inner Ethernet (orijinal)' },
          { x: 160, y: 202, w: 280, h: 30, kind: 'cloud',    label: 'Inner IP + Payload' }
        ],
        texts: [ { x: 355, y: 134, text: '← kapsülleme', anchor: 'start' } ],
        notes: [
          'Ek yük yaklaşık <strong>50 bayt</strong>',
          'Underlay MTU en az <code>1550</code> olmalı — aksi halde parçalanma veya kayıp'
        ]
      }))}
    </div>
    <div>
      ${cgRefCard('EVPN Route Tipleri', 'fas fa-table', cgRefTable(
          ['Tip', 'Ad', 'Kullanım'],
          [
              ['Tip 1', 'Ethernet Auto-Discovery', 'ESI multi-homing'],
              ['Tip 2', 'MAC/IP Advertisement', 'MAC + ARP öğrenme (L2 VNI) — <strong>standart fabric\'te en yaygın</strong>'],
              ['Tip 3', 'Inclusive Multicast', 'BUM traffic (broadcast)'],
              ['Tip 4', 'Ethernet Segment', 'DF seçimi'],
              ['Tip 5', 'IP Prefix', 'L3 VNI routing — harici/özet prefix, silent host (RFC 9136)'],
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

  ${cgRefCard('Temel Bileşenler', 'fas fa-sitemap', cgDia({
    w: 520, h: 300, alt: 'Load balancer bilesenleri',
    nodes: [
      { x: 260, y: 24,  w: 130, h: 32, kind: 'cloud',  label: 'İstemciler' },
      { x: 260, y: 82,  w: 210, h: 40, kind: 'lb',     label: 'Virtual Server', sub: 'VIP 10.1.1.100:443' },
      { x: 260, y: 152, w: 230, h: 40, kind: 'router', label: 'LB Engine', sub: 'persistence · health · SSL' },
      { x: 260, y: 214, w: 190, h: 30, kind: 'switch', label: 'Pool: POOL_APP_HTTPS' },
      { x: 70,  y: 274, w: 96, h: 30, kind: 'server', label: ':8080' },
      { x: 197, y: 274, w: 96, h: 30, kind: 'server', label: ':8080' },
      { x: 324, y: 274, w: 96, h: 30, kind: 'server', label: ':8080' },
      { x: 451, y: 274, w: 96, h: 30, kind: 'server', label: ':8080' }
    ],
    links: [
      { x1: 260, y1: 40,  x2: 260, y2: 62 },
      { x1: 260, y1: 102, x2: 260, y2: 132 },
      { x1: 260, y1: 172, x2: 260, y2: 199 },
      { x1: 220, y1: 229, x2: 70,  y2: 259 },
      { x1: 245, y1: 229, x2: 197, y2: 259 },
      { x1: 275, y1: 229, x2: 324, y2: 259 },
      { x1: 300, y1: 229, x2: 451, y2: 259 }
    ],
    notes: [
      '<strong>VIP</strong> — istemcinin bağlandığı sanal adres',
      '<strong>Pool</strong> — gerçek sunucu grubu',
      '<strong>Node</strong> — sunucunun <em>yalnızca IP</em> adresi',
      '<strong>Pool Member</strong> — Node + port (örn. <code>10.0.0.5:8080</code>)'
    ]
  }))}

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
              ['SSL Session', 'SSL session ID ile — passthrough/L4 senaryosu (offload varsa cookie insert kullanılır; TLS 1.3\'te session ID anlamsızdır)'],
              ['Universal', 'İstenen offset\'ten veri alınır'],
          ]
      ))}
    </div>
  </div>

  ${cgRefCard('SSL Offload vs Passthrough vs Re-encryption', 'fas fa-lock', cgDia({
    w: 540, h: 250, alt: 'Uc SSL sonlandirma yontemi',
    nodes: [
      { x: 60,  y: 40,  w: 88, h: 30, kind: 'cloud',  label: 'Client' },
      { x: 270, y: 40,  w: 130, h: 30, kind: 'lb',    label: 'LB — decrypt' },
      { x: 480, y: 40,  w: 88, h: 30, kind: 'server', label: 'Server' },
      { x: 60,  y: 122, w: 88, h: 30, kind: 'cloud',  label: 'Client' },
      { x: 270, y: 122, w: 130, h: 30, kind: 'router', label: 'LB — L4 only' },
      { x: 480, y: 122, w: 88, h: 30, kind: 'server', label: 'Server' },
      { x: 60,  y: 204, w: 88, h: 30, kind: 'cloud',  label: 'Client' },
      { x: 270, y: 204, w: 150, h: 30, kind: 'firewall', label: 'LB — decrypt+inspect' },
      { x: 480, y: 204, w: 88, h: 30, kind: 'server', label: 'Server' }
    ],
    links: [
      { x1: 104, y1: 40,  x2: 205, y2: 40,  arrow: true, label: 'HTTPS' },
      { x1: 335, y1: 40,  x2: 436, y2: 40,  arrow: true, label: 'HTTP' },
      { x1: 104, y1: 122, x2: 205, y2: 122, arrow: true, label: 'HTTPS' },
      { x1: 335, y1: 122, x2: 436, y2: 122, arrow: true, label: 'HTTPS' },
      { x1: 104, y1: 204, x2: 195, y2: 204, arrow: true, label: 'HTTPS' },
      { x1: 345, y1: 204, x2: 436, y2: 204, arrow: true, label: 'HTTPS' }
    ],
    texts: [
      { x: 20, y: 20,  text: 'OFFLOAD',       anchor: 'start', cls: 'cg-dia-zonelabel' },
      { x: 20, y: 102, text: 'PASSTHROUGH',   anchor: 'start', cls: 'cg-dia-zonelabel' },
      { x: 20, y: 184, text: 'RE-ENCRYPTION', anchor: 'start', cls: 'cg-dia-zonelabel' }
    ],
    notes: [
      '<strong>Offload</strong> — sunucu CPU yükü azalır, L7 inceleme mümkün. En yaygın.',
      '<strong>Passthrough</strong> — uçtan uca şifreleme; LB içeriği göremez, cookie/header değiştiremez',
      '<strong>Re-encryption</strong> — hem inceleme hem şifreleme; iki TLS el sıkışması, gecikme artar'
    ]
  }))}
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
  <div class="cg-ref-title"><i class="fas fa-certificate"></i> Ağ & Güvenlik Sertifikasyon Haritası</div>
  <p class="cg-ref-intro">Bu araçtaki konuların vendor sertifikasyonlarıyla eşleşmesi. Sertifikasyon programları sık değişir — aşağıdaki bilgiler <strong>Eylül 2026</strong> itibarıyla resmi vendor sayfalarından doğrulanmıştır. Yalnızca ağ ve güvenlik sertifikaları listelenmiştir.</p>

  ${cgRefCard('Cisco — Enterprise ve Security', 'fas fa-road', cgDia({
    w: 560, h: 200, alt: 'Cisco sertifikasyon seviyeleri',
    nodes: [
      { x: 90,  y: 44,  w: 160, h: 46, kind: 'server',   label: 'CCNA', sub: '200-301' },
      { x: 300, y: 44,  w: 200, h: 46, kind: 'router',   label: 'CCNP Enterprise', sub: '350-401 ENCOR' },
      { x: 500, y: 44,  w: 116, h: 46, kind: 'firewall', label: 'CCIE', sub: 'Enterprise' },
      { x: 90,  y: 140, w: 160, h: 46, kind: 'server',   label: 'CCNA', sub: 'Cybersecurity' },
      { x: 300, y: 140, w: 200, h: 46, kind: 'router',   label: 'CCNP Security', sub: '350-701 SCOR' },
      { x: 500, y: 140, w: 116, h: 46, kind: 'firewall', label: 'CCIE', sub: 'Security' }
    ],
    links: [
      { x1: 171, y1: 44,  x2: 198, y2: 44,  arrow: true },
      { x1: 401, y1: 44,  x2: 440, y2: 44,  arrow: true },
      { x1: 171, y1: 140, x2: 198, y2: 140, arrow: true },
      { x1: 401, y1: 140, x2: 440, y2: 140, arrow: true }
    ],
    notes: [
      '<strong>CCNA</strong> — VLAN, STP, EtherChannel, tek alan OSPF, ACL, NAT, DHCP, SSH',
      '<strong>CCNP</strong> — core sınav + bir konsantrasyon. Enterprise: 350-401 ENCOR; ileri yönlendirme, MPLS ve L3VPN <code>ENARSI</code> konsantrasyonunda',
      '<strong>CCIE</strong> — tüm CCNP konuları + VXLAN/EVPN, Segment Routing',
      '<strong>CCNA Security artık yok</strong> — 2020 yeniden yapılandırmasında emekli edildi; yerine CCNA Cybersecurity ve CCNP Security'
    ]
  }))}

  ${cgRefCard('Vendor Sertifikasyon Eşleşmesi', 'fas fa-table', cgRefTable(
      ['Konu', 'Cisco', 'Juniper', 'Huawei', 'Fortinet', 'Palo Alto', 'F5'],
      [
          ['VLAN / L2',        'CCNA',            'JNCIA-Junos', 'HCIA-Datacom',  'NSE 4',    '—', '—'],
          ['OSPF / BGP',       'CCNP ENCOR',      'JNCIS-ENT',   'HCIP-Datacom',  '—',        '—', '—'],
          ['MPLS / L3VPN',     'CCNP ENARSI',     'JNCIP-SP',    'HCIP-Datacom',  '—',        '—', '—'],
          ['VXLAN / EVPN',     'CCIE Enterprise', 'JNCIP-DC',    'HCIE-Datacom',  '—',        '—', '—'],
          ['Firewall politikası', 'CCNP Security', 'JNCIA-SEC',  'HCIA-Security', 'NSE 4',    'Network Security Analyst', '—'],
          ['VPN (IPsec / SSL)','CCNP Security',   'JNCIP-SEC',   'HCIP-Security', 'NSE 6-7',  'NGFW Engineer', 'F5-CA'],
          ['HA / Clustering',  'CCNP Security',   'JNCIP-SEC',   'HCIP-Security', 'NSE 6-7',  'NGFW Engineer', 'F5-CA'],
          ['Load balancing',   '—',               '—',           '—',             '—',        '—', 'F5-CA (F5CAB1-5)']
      ]
  ))}

  <div class="cg-ref-cols">
    <div>
      ${cgRefCard('Juniper ve Huawei', 'fas fa-leaf', `
      <ul class="cg-ref-list">
        <li><strong>JNCIA-Junos</strong> — Junos CLI, temel yönlendirme</li>
        <li><strong>JNCIS-ENT</strong> — OSPF, BGP, switching</li>
        <li><strong>JNCIP-ENT / -SP</strong> — ileri yönlendirme, MPLS</li>
        <li><strong>JNCIA-SEC → JNCIP-SEC</strong> — SRX, politika, NAT, VPN, chassis cluster</li>
        <li style="margin-top:8px"><strong>HCIA-Datacom</strong> — temel yönlendirme ve anahtarlama (VRP)</li>
        <li><strong>HCIP-Datacom</strong> — Core + konsantrasyon (Advanced R&amp;S, Campus, WAN, SD-WAN, Solution Design, Automation)</li>
        <li><strong>HCIE-Datacom</strong> — uzman seviye</li>
        <li><strong>HCIA/HCIP/HCIE-Security</strong> — USG güvenlik yolu</li>
      </ul>
      <p style="font-size:.78rem;color:var(--text-tertiary,#95a5a6);margin:8px 0 0">
      Huawei 2021 Q4'te R&amp;S sertifikalarını Datacom ile değiştirdi. Sınav kodları üçüncü parti kaynaklıdır, resmi teyit edilmedi.</p>`)}
    </div>
    <div>
      ${cgRefCard('Güvenlik ve ADC', 'fas fa-shield-alt', `
      <ul class="cg-ref-list">
        <li><strong>Fortinet NSE 1-8</strong> — NSE 4 FortiOS operasyonu, NSE 6-7 ileri/uzman.
            5 track: Secure Networking, Security Operations, Cloud Security, OT Security, SASE</li>
        <li><strong>Palo Alto</strong> — Network Security Analyst, <strong>Next-Generation Firewall Engineer</strong>,
            Network Security Professional, Network Security Architect</li>
        <li><strong>Check Point CCSA / CCSE</strong> — R82: <code>156-215.82</code> / <code>156-315.82</code></li>
        <li><strong>F5 Certified Administrator, BIG-IP</strong> — 5 sınav: <code>F5CAB1</code>–<code>F5CAB5</code>, yenileme <code>F5CABR</code></li>
      </ul>
      <p style="font-size:.78rem;color:var(--text-tertiary,#95a5a6);margin:8px 0 0">
      <strong>Değişen adlar:</strong> Fortinet 2024'te FCP/FCSS'e geçti, 15 Temmuz 2026'da NSE adlandırmasına döndü.
      Palo Alto PCNSA (2024) ve PCNSE (2025) emekli edildi, program rol bazlı oldu.
      F5'te 101 sınavı Nisan 2025'te kaldırıldı; "201-LTM" ve "F5-301" kodları geçersiz.</p>`)}
    </div>
  </div>
</div>`;
    }
};
