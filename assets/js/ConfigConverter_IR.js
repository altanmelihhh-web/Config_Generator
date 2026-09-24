'use strict';

// Faz 6: Reader/Writer registry'leri burada (IR — her zaman ilk yüklenen dosya)
// tanımlanıyor, çünkü artık her vendor kendi ayrı dosyasında (ConfigConverter_
// Readers_<Vendor>.js / ConfigConverter_Writers_<Vendor>.js) bu objelere kayıt
// yapıyor — objelerin registration'lardan ÖNCE var olması gerekiyor.
const CC_READERS = {};
const CC_WRITERS = {};

const CC_CATEGORIES = {
  'switch-router': {
    label: 'Switch / Router',
    icon: 'fas fa-network-wired',
    vendors: ['cisco-ios','cisco-nxos','huawei-vrp','huawei-ce','dell-os10','juniper-junos','arista-eos','mikrotik']
  },
  'firewall': {
    label: 'Güvenlik Duvarı',
    icon: 'fas fa-shield-alt',
    vendors: ['fortigate','paloalto','checkpoint','cisco-asa','cisco-ftd','juniper-srx','huawei-usg']
  },
  'adc': {
    label: 'Yük Dengeleyici / ADC',
    icon: 'fas fa-server',
    vendors: ['f5-bigip','citrix-adc']
  }
};

// osVersions: her vendor'ın portalde seçilebilir OS/firmware sürümleri.
// İlk eleman varsayılan (defaultOsVersion) olarak kullanılır. Faz 4 KB'sinin
// osVersion etiketleriyle tutarlı; syntax'ın gerçekten sürüme göre dallandığı
// noktalar (şimdilik: PaloAlto DH group enum'u, bkz. _ccValRuleKbRange /
// ccWritePaloAlto) bu id'lere göre seçim yapar. Diğer vendor'larda henüz
// bilinen bir sürüm-bağımlı dallanma yok — liste yalnızca "hangi sürüme göre
// üretildi" bilgisini config başlığına damgalamak için kullanılır.
const CC_VENDOR_META = {
  'cisco-ios':    { label:'Cisco IOS',           cat:'switch-router', commentChar:'!', osVersions:[{id:'ios-xe-17', label:'IOS-XE 17.x'},{id:'ios-15', label:'IOS 15.x (classic)'}] },
  'cisco-nxos':   { label:'Cisco NX-OS',         cat:'switch-router', commentChar:'!', osVersions:[{id:'nxos-10', label:'NX-OS 10.x'},{id:'nxos-9', label:'NX-OS 9.x'}] },
  'cisco-asa':    { label:'Cisco ASA',           cat:'firewall',      commentChar:'!', osVersions:[{id:'asa-9.20', label:'ASA 9.20+'},{id:'asa-9.8', label:'ASA 9.8-9.19'}] },
  'cisco-ftd':    { label:'Cisco FTD',           cat:'firewall',      commentChar:'!', osVersions:[{id:'ftd-7.4', label:'FTD 7.4+'},{id:'ftd-7.0', label:'FTD 7.0-7.3'}] },
  'huawei-vrp':   { label:'Huawei VRP',          cat:'switch-router', commentChar:'#', osVersions:[{id:'vrp-v200r' , label:'VRP V200R series'}] },
  'huawei-ce':    { label:'Huawei CE',           cat:'switch-router', commentChar:'#', osVersions:[{id:'vrp-ce', label:'VRP (CE serisi)'}] },
  'huawei-usg':   { label:'Huawei USG',          cat:'firewall',      commentChar:'#', osVersions:[{id:'vrp-usg', label:'VRP (USG serisi)'}] },
  'dell-os10':    { label:'Dell OS10',           cat:'switch-router', commentChar:'!', osVersions:[{id:'os10-10.5', label:'SmartFabric OS10 10.5.x'}] },
  'juniper-junos':{ label:'Juniper JunOS',       cat:'switch-router', commentChar:'#', osVersions:[{id:'junos-all', label:'Junos (tüm sürümler)'}] },
  'juniper-srx':  { label:'Juniper SRX',         cat:'firewall',      commentChar:'#', osVersions:[{id:'junos-srx', label:'Junos SRX'}] },
  'arista-eos':   { label:'Arista EOS',          cat:'switch-router', commentChar:'!', osVersions:[{id:'eos-4.3', label:'EOS 4.3x'}] },
  'mikrotik':     { label:'MikroTik RouterOS',   cat:'switch-router', commentChar:'#', osVersions:[{id:'ros-7', label:'RouterOS 7.x'},{id:'ros-6', label:'RouterOS 6.x (legacy)'}] },
  'fortigate':    { label:'FortiGate',           cat:'firewall',      commentChar:'#', osVersions:[{id:'fortios-7.4', label:'FortiOS 7.4'},{id:'fortios-7.2', label:'FortiOS 7.2'}] },
  'paloalto':     { label:'Palo Alto PAN-OS',    cat:'firewall',      commentChar:'#', osVersions:[{id:'panos-10.2plus', label:'PAN-OS 10.2+'},{id:'panos-pre-10.2', label:'PAN-OS 10.1 ve öncesi'}] },
  'checkpoint':   { label:'Check Point Gaia',    cat:'firewall',      commentChar:'#', osVersions:[{id:'gaia-r81', label:'Gaia R81+'},{id:'gaia-r80', label:'Gaia R80.x'}] },
  'f5-bigip':     { label:'F5 BIG-IP',           cat:'adc',           commentChar:'#', osVersions:[{id:'tmos-17', label:'TMOS 17.x'},{id:'tmos-15', label:'TMOS 15.x'}] },
  'citrix-adc':   { label:'Citrix ADC',          cat:'adc',           commentChar:'#', osVersions:[{id:'adc-14', label:'Citrix ADC 14.x'},{id:'adc-13', label:'Citrix ADC 13.x'}] },
};

function ccDefaultOsVersion(vendor) {
  const m = CC_VENDOR_META[vendor];
  return (m && m.osVersions && m.osVersions[0] && m.osVersions[0].id) || '';
}

function ccEmptyIR() {
  return {
    hostname: '',
    system: {
      dns: [], ntp: [], syslog: [], snmp: {}, banner: '',
      domainName: '', domainLookup: true,
      users: [], aaa: null, ssh: null, logging: null, archive: null,
      serviceFlags: [], vty: [], loginSecurity: null
    },
    vlans: [],
    spanningTree: {},
    interfaces: [],
    routes: [],
    ospf: [],
    bgp: null,
    addressObjects: [],
    serviceObjects: [],
    zones: [],
    securityPolicies: [],
    natRules: [],
    acls: [],
    virtualServers: [],
    pools: [],
    monitors: [],
    bundles: [],
    vpnTunnels: [],
    sslVpn: null,
    utmProfiles: [],
    sdwan: null,
    ha: null,
    pbrRules: [],
    vdoms: [],
    unknowns: [],
    // Kaynak config'te ACIKCA yazilmayan, vendor varsayilanindan turetilen
    // guvenlik etkili degerler. Sessiz varsayim guvenlik kararinda kabul
    // edilemez: hangi degerin nereden geldigi kullaniciya bildirilmelidir.
    // Kayit bicimi: { field, value, source, detail, severity }
    assumptions: [],
    lostFields: [],
    _meta: { category: '', scope: [], srcVendor: '', srcOsVersion: '', dstOsVersion: '', parseWarnings: [] }
  };
}

// Bundle helper: { id, mode: 'lacp-active'|'lacp-passive'|'static', members: [ifaceName], vlan_mode, access_vlan, trunk_vlans, ip, mask, desc, _bundleType }
function ccEnsureBundle(ir, id) {
  let b = ir.bundles.find(x => x.id === id);
  if (!b) {
    b = { id, mode: 'static', members: [], vlan_mode: null, access_vlan: null, trunk_vlans: null, ip: '', mask: '', desc: '', edge_port: false };
    ir.bundles.push(b);
  }
  return b;
}

function ccDetectCategory(text) {
  const fw_keywords = /config firewall policy|set rulebase security|access-policy|security-policy|zone-policy|policy-map type inspect|set security policies/i;
  const adc_keywords = /ltm virtual|ltm pool|add service|bind lb vserver|virtual server/i;
  if (adc_keywords.test(text)) return 'adc';
  if (fw_keywords.test(text)) return 'firewall';
  return 'switch-router';
}

function ccDetectScope(ir) {
  const scope = [];
  if (ir.hostname)                  scope.push('hostname');
  if (ir.interfaces.length)         scope.push('interfaces');
  if (ir.vlans.length)              scope.push('vlans');
  if (ir.routes.length)             scope.push('routes');
  if (ir.acls.length)               scope.push('acls');
  if (ir.addressObjects.length)     scope.push('addressObjects');
  if (ir.serviceObjects.length)     scope.push('serviceObjects');
  if (ir.securityPolicies.length)   scope.push('securityPolicies');
  if (ir.natRules.length)           scope.push('natRules');
  if (ir.zones.length)              scope.push('zones');
  if (ir.virtualServers.length)     scope.push('virtualServers');
  if (ir.ospf.length)               scope.push('ospf');
  if (ir.bgp)                       scope.push('bgp');
  return scope;
}

function ccPrefixToMask(prefix) {
  const p = parseInt(prefix);
  if (isNaN(p) || p <= 0) return '0.0.0.0';
  if (p >= 32) return '255.255.255.255';
  const mask = (0xFFFFFFFF << (32 - p)) >>> 0;
  return [(mask>>>24)&0xFF,(mask>>>16)&0xFF,(mask>>>8)&0xFF,mask&0xFF].join('.');
}

function ccMaskToPrefix(mask) {
  return mask.split('.').reduce((acc, o) => {
    let n = parseInt(o), b = 0;
    while (n > 0) { b += n & 1; n >>= 1; }
    return acc + b;
  }, 0);
}

function ccNetworkFromIpMask(ip, mask) {
  if (!ip || !mask) return '';
  const ipParts = ip.split('.').map(o => parseInt(o));
  const maskParts = mask.split('.').map(o => parseInt(o));
  if (ipParts.length !== 4 || maskParts.length !== 4 || ipParts.some(isNaN) || maskParts.some(isNaN)) return '';
  if (ipParts.some(o => o < 0 || o > 255) || maskParts.some(o => o < 0 || o > 255)) {
    const prefix = ccMaskToPrefix(mask);
    if (prefix >= 24) return [ipParts[0], ipParts[1], ipParts[2], 0].join('.') + '/' + prefix;
    if (prefix >= 16) return [ipParts[0], ipParts[1], 0, 0].join('.') + '/' + prefix;
    if (prefix >= 8) return [ipParts[0], 0, 0, 0].join('.') + '/' + prefix;
    return '0.0.0.0/' + prefix;
  }
  return ipParts.map((o, i) => o & maskParts[i]).join('.') + '/' + ccMaskToPrefix(mask);
}

// ─── Paylaşılan concept builder'ları ────────────────────────────────────────
// Bu fonksiyonlar hem Config Generator (form → CLI) hem Config Dönüştürücü
// (IR → CLI) tarafından çağrılır — vendor kuralı TEK yerde yaşasın diye.
// Girdi: v = { id, name, svi_ip, svi_mask, desc, _aclIn, _aclOut, pbr_route_map }
// vrrpList: ir.vrrp dizisi (o VLAN'a ait olanlar burada filtrelenir)
function ccBuildCiscoVlanBlock(v, vrrpList) {
  let c = 'vlan ' + v.id + '\n';
  c += ' name ' + (v.name || 'VLAN' + v.id) + '\n';
  c += '!\n';
  if (v.svi_ip) {
    c += 'interface Vlan' + v.id + '\n';
    if (v.desc) c += ' description ' + v.desc + '\n';
    c += ' ip address ' + v.svi_ip + ' ' + (v.svi_mask || '255.255.255.0') + '\n';
    (vrrpList || []).filter(x => x.vlan_id === v.id).forEach(vr => {
      c += ' standby ' + vr.group_id + ' ip ' + vr.virtual_ip + '\n';
      if (vr.priority && vr.priority !== 100) c += ' standby ' + vr.group_id + ' priority ' + vr.priority + '\n';
      if (vr.preempt) c += ' standby ' + vr.group_id + ' preempt\n';
    });
    if (v._aclIn)  c += ' ip access-group ' + v._aclIn  + ' in\n';
    if (v._aclOut) c += ' ip access-group ' + v._aclOut + ' out\n';
    if (v.pbr_route_map) c += ' ip policy route-map ' + v.pbr_route_map + '\n';
    c += ' no shutdown\n!\n';
  }
  return c;
}

// Cisco IOS static route satırı — AD/metric varsayılan (1) ise yazılmaz.
// Generator ve Writer aynı kuralı kullanır, aksi halde aynı girdi iki farklı satır üretebilir.
function ccBuildCiscoStaticRouteLine(network, mask, nexthop, ad) {
  const adStr = String(ad == null ? '' : ad).trim();
  const suffix = (adStr && adStr !== '1') ? ' ' + adStr : '';
  return 'ip route ' + network + ' ' + mask + ' ' + nexthop + suffix + '\n';
}

function ccParseVlanBatch(spec) {
  const ids = [];
  const parts = spec.trim().split(/\s+/);
  let k = 0;
  while (k < parts.length) {
    if (parts[k+1] === 'to' && parts[k+2]) {
      for (let v = parseInt(parts[k]); v <= parseInt(parts[k+2]); v++) ids.push(v);
      k += 3;
    } else {
      const n = parseInt(parts[k]);
      if (!isNaN(n)) ids.push(n);
      k++;
    }
  }
  return ids;
}

function ccExpandTrunkVlans(raw, vlans) {
  if (!raw || raw === 'all') return vlans.map(v => v.name || 'VLAN' + v.id);
  const names = [];
  const normalized = raw.replace(/(\d+)\s+to\s+(\d+)/g, (_, a, b) => {
    const r = [];
    for (let v = parseInt(a); v <= parseInt(b); v++) r.push(v);
    return r.join(' ');
  }).replace(/,/g, ' ');
  normalized.split(/\s+/).forEach(t => {
    const id = parseInt(t);
    if (!isNaN(id)) {
      const vlan = vlans.find(v => v.id === id);
      names.push(vlan ? (vlan.name || 'VLAN' + id) : 'VLAN' + id);
    }
  });
  return names;
}

// Normalize vendor interface name → Juniper format
// Cisco/Huawei → Juniper interface name normalization
// Juniper interface format her zaman 3-segment: ge-A/B/C
//   Cisco 2-segment (A/B)   → ge-A/0/B  (boş slot 0 ile doldurulur)
//   Cisco 3-segment (A/B/C) → ge-A/B/C
//   Huawei 3-segment (A/B/C)→ ge-A/B/C
// GigabitEthernet0/1     → ge-0/0/1
// GigabitEthernet1/0/24  → ge-1/0/24
// GigabitEthernet0/0/1   → ge-0/0/1
// XGigabitEthernet0/0/1  → xe-0/0/1
// 25GE0/0/1 → et-0/0/1   |  10GE0/0/1 → xe-0/0/1   |  Eth-Trunk1 → ae1
// Vlanif10  → irb.10     |  already juniper-style → unchanged
function ccForceJuniper3Seg(path) {
  // "0/1" → "0/0/1", "0/0/1" → "0/0/1", "1/24" → "1/0/24"
  const segs = path.split('/');
  if (segs.length === 2) return segs[0] + '/0/' + segs[1];
  return path;
}
function ccNormalizeIfaceForJuniper(name) {
  if (!name) return name;
  let m;
  if ((m = name.match(/^GigabitEthernet(.+)/i)))     return 'ge-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^XGigabitEthernet(.+)/i)))    return 'xe-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^(?:25GE|40GE|100GE)(.+)/i))) return 'et-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^10GE(.+)/i)))                return 'xe-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^Eth-Trunk(\d+)/i)))          return 'ae'   + m[1];
  if ((m = name.match(/^Vlanif(\d+)/i)))             return 'irb.' + m[1];
  if ((m = name.match(/^FastEthernet(.+)/i)))        return 'fe-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^TenGigabitEthernet(.+)/i)))  return 'xe-'  + ccForceJuniper3Seg(m[1]);
  if ((m = name.match(/^FortyGigabitEthernet(.+)/i)))return 'et-'  + ccForceJuniper3Seg(m[1]);
  return name; // already normalized or unknown — pass through
}

// Reverse: ge-0/0/1 → Cisco/Huawei interface name
// target = 'cisco' (2-segment) | 'huawei' (3-segment)
function ccNormalizeIfaceFromJuniper(name, target) {
  if (!name) return name;
  let m;
  const lastN = (s, n) => s.split('/').slice(-n).join('/');
  const force3 = (s) => s.split('/').length < 3 ? '0/' + s : s;
  // Juniper → Cisco/Huawei: deterministic 3-segment mapping
  //   ge-A/B/C → GigabitEthernetA/B/C (3 segment korunur)
  //   ge-A/B   → GigabitEthernet0/A/B (eksikse 0/ önek)
  if ((m = name.match(/^ge-(.+)/i)))
    return 'GigabitEthernet' + force3(m[1]);
  if ((m = name.match(/^xe-(.+)/i)))
    return (target === 'cisco' ? 'TenGigabitEthernet' : 'XGigabitEthernet') + force3(m[1]);
  if ((m = name.match(/^et-(.+)/i)))
    return (target === 'cisco' ? 'FortyGigabitEthernet' + force3(m[1]) : '40GE' + m[1]);
  if ((m = name.match(/^fe-(.+)/i)))
    return 'FastEthernet' + force3(m[1]);
  if ((m = name.match(/^ae(\d+)/i)))
    return target === 'cisco' ? 'Port-channel' + m[1] : 'Eth-Trunk' + m[1];
  if ((m = name.match(/^irb\.(\d+)/i)))
    return target === 'cisco' ? 'Vlan' + m[1] : 'Vlanif' + m[1];
  return name;
}

// Translate well-known port names to numeric ports
const CC_PORT_NAMES = {
  'ftp-data': 20, 'ftp': 21, 'ssh': 22, 'telnet': 23, 'smtp': 25, 'mail': 25,
  'dns': 53, 'domain': 53, 'bootps': 67, 'bootpc': 68, 'tftp': 69,
  'http': 80, 'www': 80, 'pop3': 110, 'sunrpc': 111, 'ntp': 123,
  'imap': 143, 'snmp': 161, 'snmptrap': 162, 'bgp': 179, 'ldap': 389,
  'https': 443, 'smtps': 465, 'syslog': 514, 'imaps': 993, 'pop3s': 995,
  'mssql': 1433, 'oracle': 1521, 'mysql': 3306, 'rdp': 3389,
  'isakmp': 500, 'ike': 500, 'l2tp': 1701, 'radius': 1812, 'radius-acct': 1813,
  'tacacs': 49, 'tacacs+': 49, 'sip': 5060, 'rtsp': 554,
  'biff': 512, 'who': 513, 'syslog-tcp': 6514
};
function ccTranslatePortName(s) {
  if (s === undefined || s === null) return s;
  const key = String(s).toLowerCase().trim();
  if (CC_PORT_NAMES[key] !== undefined) return String(CC_PORT_NAMES[key]);
  return s; // already numeric or unknown
}

// Junos hız birimlerini (1g, 100m, 10g, 40g) Cisco "speed" komutunun beklediği
// Mbps tam sayısına çevirir. Tanınmayan birim ise olduğu gibi bırakılır (writer
// tarafında lostFields'a düşer, sessizce yanlış değer yazılmaz).
function ccJunosSpeedToMbps(s) {
  if (!s) return '';
  const m = String(s).trim().match(/^(\d+(?:\.\d+)?)\s*([gGmM])?$/);
  if (!m) return '';
  const n = parseFloat(m[1]);
  const unit = (m[2] || '').toLowerCase();
  if (unit === 'g') return String(Math.round(n * 1000));
  if (unit === 'm') return String(Math.round(n));
  return String(Math.round(n)); // birim yoksa zaten Mbps kabul edilir
}

// Expand Cisco "interface range" spec → individual interface names
// Inputs: "GigabitEthernet0/1 - 10", "Gi0/1-10", "GE1/0/47 - 48",
//         "Gi0/1, Gi0/3, Gi0/5 - 7", "GE0/1 - 0/5"
// Output: array of full interface names
function ccExpandCiscoRange(spec) {
  if (!spec) return [];
  const names = [];
  // First split by comma into segments
  spec.split(',').forEach(seg => {
    const s = seg.trim();
    if (!s) return;
    // Range with " - " or "-": split into start and end
    const rangeMatch = s.match(/^(\S+?)(\d+(?:\/\d+)*)\s*-\s*(\d+(?:\/\d+)*)$/);
    if (rangeMatch) {
      const prefix = rangeMatch[1];   // "GigabitEthernet" or "Gi"
      const startPath = rangeMatch[2]; // "0/1" or "1/0/47"
      const endPath = rangeMatch[3];   // "10" or "0/5" or "48"
      const startParts = startPath.split('/').map(Number);
      // End may be only last segment or full path
      const endParts = endPath.split('/').map(Number);
      // Align end to start length: if end has fewer segments, treat as last segments
      const fullEnd = startParts.slice(0, startParts.length - endParts.length).concat(endParts);
      // Iterate last segment from start to end (only single-segment ranges supported here)
      // For multi-dim ranges (e.g., 0/1 to 0/5), iterate the differing index
      const diffIdx = fullEnd.findIndex((v, i) => v !== startParts[i]);
      if (diffIdx === -1) {
        names.push(prefix + startParts.join('/'));
      } else {
        // Iterate from start[diffIdx] to fullEnd[diffIdx], keep other indices = start
        for (let v = startParts[diffIdx]; v <= fullEnd[diffIdx]; v++) {
          const path = startParts.slice();
          path[diffIdx] = v;
          names.push(prefix + path.join('/'));
        }
      }
    } else {
      names.push(s);
    }
  });
  return names;
}

// Parse trunk VLAN string from various vendors → canonical number[]
// Inputs: "10,20", "10 20", "10-15,20", "[ 10 20 ]"  → [10,20] or [10,11,...,15,20]
function ccParseTrunkVlanStr(str) {
  const ids = [];
  if (!str) return ids;
  const cleaned = String(str).replace(/[\[\]]/g, '').trim();
  if (!cleaned || cleaned === 'all') return ids;
  cleaned.split(/[\s,]+/).forEach(tok => {
    if (!tok) return;
    const rng = tok.split(/[-]|\s+to\s+/);
    if (rng.length === 2 && !isNaN(+rng[0]) && !isNaN(+rng[1])) {
      for (let v = +rng[0]; v <= +rng[1]; v++) ids.push(v);
    } else if (!isNaN(+tok)) {
      ids.push(+tok);
    }
  });
  return Array.from(new Set(ids)).sort((a, b) => a - b);
}

// Parse one ACL address token group: 'any' | 'host X' | 'X.X.X.X W.W.W.W'
// Returns { addr: string, consumed: number }
function ccParseAclAddr(tokens, pos) {
  if (!tokens[pos]) return { addr: 'any', consumed: 0 };
  if (tokens[pos] === 'any') return { addr: 'any', consumed: 1 };
  if (tokens[pos] === 'host') return { addr: 'host ' + (tokens[pos + 1] || ''), consumed: 2 };
  const next = tokens[pos + 1];
  if (next && /^[\d.]+$/.test(next)) return { addr: tokens[pos] + ' ' + next, consumed: 2 };
  return { addr: tokens[pos], consumed: 1 };
}

// Parse port spec: 'eq 80' | 'range 80 443' | ''
function ccParseAclPort(tokens, pos) {
  const kw = tokens[pos];
  if (!kw || !['eq', 'gt', 'lt', 'neq', 'range'].includes(kw)) return { port: '', consumed: 0 };
  if (kw === 'range') return { port: 'range ' + (tokens[pos+1]||'') + ' ' + (tokens[pos+2]||''), consumed: 3 };
  return { port: kw + ' ' + (tokens[pos+1]||''), consumed: 2 };
}

function ccParseAclEntry(action, proto, tokens) {
  let pos = 0;
  const srcA = ccParseAclAddr(tokens, pos); pos += srcA.consumed;
  const srcP = ccParseAclPort(tokens, pos); pos += srcP.consumed;
  const dstA = ccParseAclAddr(tokens, pos); pos += dstA.consumed;
  const dstP = ccParseAclPort(tokens, pos);
  return {
    action,
    proto,
    src: srcA.addr,
    src_port: srcP.port,
    dst: dstA.addr,
    dst_port: dstP.port
  };
}

// Convert ACL address string to CIDR: 'any'→null, 'host X'→'X/32', 'X W'→'X/N'
function ccAclAddrToCidr(addr) {
  if (!addr || addr === 'any') return null;
  if (addr.startsWith('host ')) return addr.slice(5) + '/32';
  const p = addr.split(' ');
  if (p.length === 2) {
    // wildcard → prefix length: invert wildcard bits
    const bits = p[1].split('.').reduce((acc, o) => {
      let n = 255 - parseInt(o), b = 0;
      while (n > 0) { b += n & 1; n >>= 1; }
      return acc + b;
    }, 0);
    return p[0] + '/' + bits;
  }
  return addr.includes('/') ? addr : addr + '/32';
}

// Juniper firewall filter term'lerinde "from source-prefix-list NAME" /
// "from destination-prefix-list NAME" ile referans verilen policy-options
// prefix-list'lerini (ir._prefixLists'te toplanmıştır) gerçek CIDR'lara açar.
// Birden fazla prefix-list OR semantiğiyle birleşir (Junos'ta aynı alan için
// birden fazla "from" satırı = "herhangi biri eşleşirse"), bu yüzden her CIDR
// için ayrı bir ACL girişi (klonlanmış entry) üretilir. Referans çözülemezse
// (prefix-list tanımsız) entry olduğu gibi (src/dst 'any') bırakılır ve
// ir.lostFields'a 'partial' olarak düşer — sessizce fazla izin verici bir
// kural üretmek yerine.
function ccExpandAclPrefixListRefs(ir, acl) {
  const lists = ir._prefixLists || {};
  const out = [];
  (acl.entries || []).forEach(e => {
    const srcNames = e._srcPrefixLists || [];
    const dstNames = e._dstPrefixLists || [];
    if (!srcNames.length && !dstNames.length) { out.push(e); return; }
    const srcCidrs = srcNames.length
      ? srcNames.reduce((acc, n) => acc.concat(lists[n] || []), [])
      : [e.src];
    const dstCidrs = dstNames.length
      ? dstNames.reduce((acc, n) => acc.concat(lists[n] || []), [])
      : [e.dst];
    if (srcNames.some(n => !lists[n]) || dstNames.some(n => !lists[n])) {
      ccDropField(ir, 'acl', acl.name, 'prefix-list', srcNames.concat(dstNames).join(', '),
        'prefix-list-reference-unresolved-verify-manually', ir._meta && ir._meta.srcVendor, 'partial');
    }
    srcCidrs.forEach(s => {
      dstCidrs.forEach(d => {
        out.push(Object.assign({}, e, { src: s || 'any', dst: d || 'any', _srcPrefixLists: undefined, _dstPrefixLists: undefined }));
      });
    });
  });
  return out;
}

// Convert canonical/CIDR ACL address to Cisco/Dell wildcard format.
function ccAclAddrToWildcard(addr) {
  if (!addr || addr === 'any') return 'any';
  if (addr.startsWith('host ')) return addr;
  if (/^[\d.]+\/\d+$/.test(addr)) {
    const [ip, pre] = addr.split('/');
    const wildcard = ccPrefixToMask(parseInt(pre)).split('.').map(o => 255 - parseInt(o)).join('.');
    return parseInt(pre) === 32 ? 'host ' + ip : ip + ' ' + wildcard;
  }
  return addr;
}

// Convert ACL address string to Huawei rule format: 'any'→'any', 'host X'→'X 0', 'X W'→'X W'
function ccAclAddrToHuawei(addr) {
  if (!addr || addr === 'any') return 'any';
  if (addr.startsWith('host ')) return addr.slice(5) + ' 0';
  if (/^[\d.]+\/\d+$/.test(addr)) {
    const [ip, pre] = addr.split('/');
    const wildcard = ccPrefixToMask(parseInt(pre)).split('.').map(o => 255 - parseInt(o)).join('.');
    return parseInt(pre) === 32 ? ip + ' 0' : ip + ' ' + wildcard;
  }
  return addr; // already 'IP wildcard'
}

function ccFormatAclEntryWildcard(e) {
  const src = ccAclAddrToWildcard(e.src);
  const dst = ccAclAddrToWildcard(e.dst);
  let line = e.action + ' ' + e.proto + ' ' + src;
  if (e.src_port) line += ' ' + e.src_port;
  line += dst !== 'any' ? ' ' + dst : ' any';
  if (e.dst_port) line += ' ' + e.dst_port;
  return line;
}

function ccComment(vendor, text) {
  const ch = (CC_VENDOR_META[vendor] || {}).commentChar || '!';
  return text.split('\n').map(l => ch + ' ' + l).join('\n');
}

// Cevrilemeyen satirlar cikti dosyasina YORUM olarak yazilir. Kaynak config'te
// parola hash'i, PSK, SNMP community ve anahtar bulundugundan bu satirlar oldugu
// gibi yazilirsa secret'lar donusturulmus config'e sizar. Cikti tek cikis noktasi
// oldugu icin maskeleme burada yapilir.
// Arayuz adi normalizasyonu — ad karsilastirmasi icin kanonik bicim uretir.
//
// Ayni portu farkli yazan uc kaynak var:
//   cihaz ciktisi : 'ethernet1/1/1'   (Dell OS10)
//   referans veri : 'Ethernet 1/1/1'  (netbox devicetype-library, ayni aile icinde
//                                      bile tutarsiz — bkz. ConfigConverter_DeviceTypes.js)
//   kullanici     : 'Gi0/1', 'Te1/1/1', 'Eth1/1'  (kisaltma)
// Bosluk, buyuk/kucuk harf ve kisaltma farki ad eslestirmesini sessizce bozar —
// Dell reader'indaki 196 arayuz kaybi tam olarak bu sinifta bir hataydi.
//
// NOT: Yalnizca KARSILASTIRMA icindir; IR'de saklanan ad her zaman cihazin
// yazdigi orijinal bicimdir.
function ccNormIfName(name) {
  let n = String(name == null ? '' : name).trim().toLowerCase();
  n = n.replace(/\s+/g, '');
  const ABBR = [
    [/^tengige(?=\d)/,            'tengigabitethernet'],
    [/^tengig(?=\d)/,             'tengigabitethernet'],
    [/^te(?=\d)/,                 'tengigabitethernet'],
    [/^fortygige(?=\d)/,          'fortygigabitethernet'],
    [/^hundredgige(?=\d)/,        'hundredgigabitethernet'],
    [/^twentyfivegige(?=\d)/,     'twentyfivegigabitethernet'],
    [/^gigabitether(?=\d)/,       'gigabitethernet'],
    [/^gig(?=\d)/,                'gigabitethernet'],
    [/^gi(?=\d)/,                 'gigabitethernet'],
    [/^fa(?=\d)/,                 'fastethernet'],
    [/^eth(?=\d)/,                'ethernet'],
    [/^et(?=\d)/,                 'ethernet'],
    [/^po(?=\d)/,                 'port-channel'],
    [/^portchannel(?=\d)/,        'port-channel'],
    [/^vl(?=\d)/,                 'vlan'],
    [/^lo(?=\d)/,                 'loopback']
  ];
  for (const [pat, rep] of ABBR) {
    if (pat.test(n)) { n = n.replace(pat, rep); break; }
  }
  return n;
}

// Iki arayuz adi ayni fiziksel portu mu gosteriyor?
function ccSameIfName(a, b) {
  return ccNormIfName(a) === ccNormIfName(b);
}

function ccMaskSecrets(line) {
  let s = String(line == null ? '' : line);
  // Unix crypt hash'leri: $1$ $5$ $6$ (rounds= varyanti dahil), bcrypt $2a$/$2y$
  s = s.replace(/\$(?:1|2[aby]?|5|6)\$[^\s]*/g, '<MASKED-HASH>');
  // Cisco type-5 / type-7 / type-8 / type-9 ve genel 'password|secret|key <deger>'
  s = s.replace(/\b(password|passwd|secret|psksecret|pre-shared-key|key-string|key)\s+(?:\d+\s+)?(?:ENC\s+)?\S+/gi,
                (mm, kw) => kw + ' <MASKED>');
  // SNMP community
  s = s.replace(/\b(community)\s+\S+/gi, '$1 <MASKED>');
  // 'set ... ENC <blob>' (FortiOS)
  s = s.replace(/\bENC\s+\S+/g, 'ENC <MASKED>');
  return s;
}

// Varsayilan atanan guvenlik alanlarini cikti sonuna yorum olarak yazar.
function ccWriteAssumptionsFor(vendor, assumptions) {
  if (!assumptions || !assumptions.length) return '';
  const ch = (CC_VENDOR_META[vendor] || {}).commentChar || '!';
  const lines = assumptions.map(a =>
    ch + ' [' + (a.severity || CC_SEVERITY.PARTIAL) + '] ' + a.field +
    ' = ' + a.value + '  (' + a.source + (a.detail ? ': ' + a.detail : '') + ')');
  return '\n' + ch + ' ---- Kaynakta acikca belirtilmeyen, varsayilandan turetilen degerler (' +
    assumptions.length + ') ----\n' + lines.join('\n') + '\n';
}

// Ayni varsayimin her kayit icin tekrar tekrar yazilmasini onler: alan+deger+kaynak
// ayni olanlari tek satirda toplar ve kac kayda uygulandigini belirtir.
function ccAddAssumption(ir, field, value, source, detail, severity) {
  if (!ir.assumptions) ir.assumptions = [];
  const key = field + '|' + value + '|' + source;
  let e = ir.assumptions.find(a => a._key === key);
  if (e) { e.count++; e.detail = e.count + ' kayit'; return; }
  ir.assumptions.push({
    _key: key, field, value, source,
    detail: detail || '', count: 1,
    severity: severity || CC_SEVERITY.DANGEROUS
  });
}

function ccWriteUnknownsFor(vendor, unknowns) {
  if (!unknowns || !unknowns.length) return '';
  const ch = (CC_VENDOR_META[vendor] || {}).commentChar || '!';
  return '\n' + ch + ' ---- Çevrilemeyen satırlar (' + unknowns.length + ') ----\n' +
    unknowns.map(u => ch + ' ' + ccMaskSecrets(u)).join('\n') + '\n';
}

// =============================================================================
// FIELD SUPPORT MATRIX — Sprint 1 altyapısı
// Her IR section'ın her field'inin her vendor'da desteğini deklare eder.
// Değerler: 'full' | 'translated' | 'partial' | 'unsupported'
// - full:        birebir emit edilir
// - translated:  vendor'da farklı söz dizimi var; writer çeviri yapar
// - partial:     alt-alanlar düşer; comment ile not düşülür
// - unsupported: vendor protokolü desteklemez → ir.lostFields'a kaydedilir
//                ve output'a `<comment> Unsupported: ...` yorumu yazılır
// Kategori-içi senaryolar için tasarlanmıştır (cross-category zaten engellidir).
// =============================================================================

const CC_FIELD_SUPPORT = {
  interface: {
    desc:           { default: 'full', 'citrix-adc': 'partial' },
    ip:             { default: 'full' },
    mask:           { default: 'full' },
    shutdown:       { default: 'full', 'paloalto': 'partial' },
    vlan_mode:      { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full','mikrotik':'full',
                      'checkpoint':'unsupported','f5-bigip':'translated','citrix-adc':'translated' },
    access_vlan:    { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full','mikrotik':'full' },
    trunk_vlans:    { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full','mikrotik':'full' },
    native_vlan:    { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full','mikrotik':'full' },
    voice_vlan:     { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full' },
    mtu:            { default: 'full', 'citrix-adc': 'partial' },
    no_switchport:  { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','arista-eos':'full' },
    edge_port:      { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full' },
    bpdu_guard:     { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full' },
    port_security:  { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'translated',
                      'arista-eos':'full' },
    dhcp_snoop_trust:{ default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','arista-eos':'full' },
    bfd:            { default: 'partial',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full',
                      'fortigate':'partial','paloalto':'partial',
                      'f5-bigip':'unsupported','citrix-adc':'unsupported' },
    service_policy: { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'partial','arista-eos':'full',
                      'dell-os10':'partial','huawei-vrp':'partial','huawei-ce':'partial',
                      'juniper-junos':'translated' },
    pbr_route_map:  { default: 'unsupported',
                      'cisco-ios':'full','cisco-nxos':'full','arista-eos':'full',
                      'dell-os10':'full','huawei-vrp':'translated',
                      'juniper-junos':'translated' },
    _aclIn:         { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full' },
    _aclOut:        { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','huawei-vrp':'full',
                      'huawei-ce':'full','dell-os10':'full','juniper-junos':'full',
                      'arista-eos':'full' },
    _bundleId:      { default: 'full' },
    _bundleMode:    { default: 'full' },
    nameif:         { default: 'unsupported',
                      'cisco-asa':'full','cisco-ftd':'full',
                      'fortigate':'translated','paloalto':'translated',
                      'juniper-srx':'translated','huawei-usg':'translated','checkpoint':'translated' },
    security_level: { default: 'unsupported',
                      'cisco-asa':'full','cisco-ftd':'full' },
    _vrrp:          { default: 'translated',
                      'cisco-ios':'translated','cisco-nxos':'translated',
                      'huawei-vrp':'full','huawei-ce':'full','juniper-junos':'full',
                      'dell-os10':'translated','arista-eos':'full' },
    _hsrp:          { default: 'translated',
                      'cisco-ios':'full','cisco-nxos':'full','dell-os10':'translated' }
  }
  // Sprint 5'te genişler: vlan, route, ospf, bgp, acl, addressObject,
  // serviceObject, zone, securityPolicy, natRule, virtualServer, pool, monitor
};

// Bir field için bu vendor'da support level'ı döndürür.
// Bilinmeyen alanlar 'full' kabul edilir (optimistic — backward compatible).
function ccFieldSupport(section, field, vendor) {
  const sec = CC_FIELD_SUPPORT[section];
  if (!sec) return 'full';
  const fmap = sec[field];
  if (!fmap) return 'full';
  return fmap[vendor] || fmap.default || 'full';
}

// Section-level support matrix — UI "Vendor Support Matrix" modal'ında
// kullanılır. CC_FIELD_SUPPORT field-level olduğu için section seviyesinde
// özet sağlar. Değerler: 'full' | 'partial' | 'none'
// 'partial' = vendor o section'ın bazı alt-yapılarını destekliyor
// 'none' = vendor o section'ı hiç desteklemiyor
const CC_SECTION_SUPPORT = {
  hostname:        { default: 'full' },
  interface:       { default: 'full' },
  vlan:            { default: 'full',
                     'cisco-asa':'partial','cisco-ftd':'partial','paloalto':'partial',
                     'fortigate':'partial','checkpoint':'partial','huawei-usg':'partial',
                     'juniper-srx':'partial' },
  route:           { default: 'full' },
  ospf:            { default: 'full',
                     'fortigate':'partial','paloalto':'partial','checkpoint':'partial',
                     'cisco-asa':'partial','f5-bigip':'none','citrix-adc':'none' },
  bgp:             { default: 'full',
                     'f5-bigip':'partial','citrix-adc':'partial' },
  acl:             { default: 'full',
                     'fortigate':'partial' /* policy bloğuna map */,
                     'paloalto':'partial', 'checkpoint':'partial',
                     'f5-bigip':'partial', 'citrix-adc':'partial' },
  addressObject:   { default: 'full',
                     'cisco-ios':'partial','cisco-nxos':'partial','huawei-vrp':'partial',
                     'huawei-ce':'partial','dell-os10':'partial','arista-eos':'partial',
                     'juniper-junos':'partial','mikrotik':'none',
                     'f5-bigip':'partial','citrix-adc':'partial' },
  serviceObject:   { default: 'full',
                     'cisco-ios':'partial','cisco-nxos':'partial','huawei-vrp':'partial',
                     'mikrotik':'none', 'f5-bigip':'none','citrix-adc':'none' },
  zone:            { default: 'full',
                     'cisco-ios':'none','cisco-nxos':'none','huawei-vrp':'none',
                     'huawei-ce':'none','dell-os10':'none','arista-eos':'none',
                     'juniper-junos':'none','mikrotik':'none',
                     'f5-bigip':'none','citrix-adc':'none' },
  securityPolicy:  { default: 'full',
                     // switch-router: ACL'e map'lenir
                     'cisco-ios':'partial','cisco-nxos':'partial','huawei-vrp':'partial',
                     'huawei-ce':'partial','dell-os10':'partial','arista-eos':'partial',
                     'juniper-junos':'partial','mikrotik':'none',
                     'f5-bigip':'none','citrix-adc':'none' },
  natRule:         { default: 'full',
                     'cisco-ios':'partial','cisco-nxos':'partial','huawei-vrp':'partial',
                     'huawei-ce':'partial','dell-os10':'partial','arista-eos':'partial',
                     'juniper-junos':'partial','mikrotik':'partial',
                     'f5-bigip':'partial','citrix-adc':'partial' },
  virtualServer:   { default: 'none',
                     'f5-bigip':'full','citrix-adc':'full' },
  pool:            { default: 'none',
                     'f5-bigip':'full','citrix-adc':'full' },
  monitor:         { default: 'none',
                     'f5-bigip':'full','citrix-adc':'full' },
  bundle:          { default: 'full',
                     'mikrotik':'partial','f5-bigip':'partial','citrix-adc':'partial',
                     'checkpoint':'partial' }
};

// UI tarafı için: CC_SECTION_SUPPORT'tan vendor x section tablosu HTML'i üret.
function ccBuildVendorMatrixHTML() {
  const sections = Object.keys(CC_SECTION_SUPPORT);
  const allVendors = Object.keys(CC_VENDOR_META);
  // Kategorilere göre sırala
  const order = { 'switch-router': 1, 'firewall': 2, 'adc': 3 };
  allVendors.sort((a, b) => {
    const ca = (CC_VENDOR_META[a] || {}).cat || '';
    const cb = (CC_VENDOR_META[b] || {}).cat || '';
    return (order[ca] || 9) - (order[cb] || 9) || a.localeCompare(b);
  });
  const cellFor = (sec, ven) => {
    const map = CC_SECTION_SUPPORT[sec] || {};
    const v = map[ven] || map.default || 'full';
    const color = v === 'full' ? '#16a34a' : v === 'partial' ? '#f59e0b' : v === 'none' ? '#dc2626' : '#9ca3af';
    const text = v === 'full' ? '✓' : v === 'partial' ? '~' : v === 'none' ? '✗' : '?';
    const title = v === 'full' ? 'Tam destek' : v === 'partial' ? 'Kısmi / çevrilmiş' : 'Desteklenmiyor';
    return '<td style="background:' + color + ';color:#fff;text-align:center;font-weight:600" title="' + title + '">' + text + '</td>';
  };
  let html = '<table class="cc-vendor-matrix">';
  html += '<thead><tr><th>Bölüm</th>';
  allVendors.forEach(v => {
    const label = (CC_VENDOR_META[v] || {}).label || v;
    html += '<th style="writing-mode:vertical-rl;transform:rotate(180deg);padding:6px 2px;font-size:.75rem">' + label + '</th>';
  });
  html += '</tr></thead><tbody>';
  sections.forEach(sec => {
    html += '<tr><th style="text-align:left;padding:4px 8px;font-weight:600">' + sec + '</th>';
    allVendors.forEach(v => html += cellFor(sec, v));
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// Severity sınıflandırması — Sprint 11.
// 6 seviye: FULL, PARTIAL, MANUAL, DROPPED, UNSUPPORTED, DANGEROUS.
//
// - FULL          → birebir karşılığı emit edildi (lostFields'a girmez normalde)
// - PARTIAL       → bazı alt alanlar kaybedildi ama intent korundu
// - MANUAL        → operatör manuel müdahale yapacak (track binding, EEM, vb.)
// - DROPPED       → alan tamamen yok edildi (kategori-içi)
// - UNSUPPORTED   → vendor kavramı desteklemiyor (semantik yok)
// - DANGEROUS     → syntactic çevirildi ama semantic AYNI DEĞİL — yanlış
//                   davranışa yol açabilir; manuel review zorunlu
const CC_SEVERITY = {
  FULL: 'full',
  PARTIAL: 'partial',
  MANUAL: 'manual',
  DROPPED: 'dropped',
  UNSUPPORTED: 'unsupported',
  DANGEROUS: 'dangerous'
};

// Reason kodundan severity tahmini (writer severity vermediğinde fallback).
function ccInferSeverity(reason) {
  const r = String(reason || '');
  if (/dangerous|semantic-reverse|semantic-downgrade|wrong-/.test(r))                return CC_SEVERITY.DANGEROUS;
  if (/manual|needs-manual|must-be-manual|policy-block|in-policy|binding-manual/.test(r)) return CC_SEVERITY.MANUAL;
  if (/partial|translated|needs-|mapped-to|different|no-timers/.test(r))             return CC_SEVERITY.PARTIAL;
  if (/unsupported|not-supported|no-native|no-equivalent/.test(r))                    return CC_SEVERITY.UNSUPPORTED;
  return CC_SEVERITY.DROPPED;  // default: alan emit edilmedi
}

// Drop edilen alanı ir.lostFields'a kaydet.
// severity opsiyoneldir; verilmezse reason kodundan tahmin edilir.
function ccDropField(ir, section, name, field, value, reason, vendor, severity) {
  if (!ir.lostFields) ir.lostFields = [];
  ir.lostFields.push({
    section: section,
    name: name || '',
    field: field,
    value: value,
    reason: reason,
    vendor: vendor,
    severity: severity || ccInferSeverity(reason)
  });
}

// Confidence score — Sprint 11.
// 100 = mükemmel; 0 = tüm alanlar kayıp. Severity-ağırlıklı.
// Ağırlıklar:
//   DANGEROUS = -15  (semantic risk en yüksek)
//   DROPPED   = -5
//   UNSUPPORTED = -3 (zaten desteksiz; suç converter'da değil)
//   MANUAL    = -2
//   PARTIAL   = -1
function ccComputeConfidence(ir) {
  const weights = {
    dangerous: 15, dropped: 5, unsupported: 3, manual: 2, partial: 1, full: 0
  };
  let penalty = 0;
  let breakdown = { dangerous: 0, dropped: 0, unsupported: 0, manual: 0, partial: 0, full: 0 };
  (ir.lostFields || []).forEach(r => {
    const sev = r.severity || ccInferSeverity(r.reason);
    breakdown[sev] = (breakdown[sev] || 0) + 1;
    penalty += weights[sev] || 0;
  });
  // Reader'ın hiç tanımadığı ham satırlar (ir.unknowns) — bunlar lostFields'a
  // hiç girmediği için önceden skora yansımıyordu, bu da içerik neredeyse hiç
  // çevrilmemişken bile %100 gösterebiliyordu. "Dropped"tan biraz daha ağır
  // (tamamen tanınmadığı için) ama tek satır tüm skoru sıfırlamasın diye
  // satır başı ağırlığı düşük tutulur.
  penalty += (ir.unknowns || []).length * 4;
  const score = Math.max(0, Math.min(100, 100 - penalty));
  return { score: score, breakdown: breakdown };
}

// =============================================================================
// SEMANTIC VALIDATOR ENGINE — Sprint 12
//
// Writer çalıştıktan sonra IR + output text üzerinde 10 detection rule çalıştırır.
// Amaç: syntactic olarak geçerli ama semantic olarak yanlış dönüşümleri yakalamak.
//
// Tüm validator rule'ları ir.lostFields'a push'lar — UI panelinde otomatik gösterilir.
// Hata fırlatması ana akışı bozmaz (try/catch wrapper).
// =============================================================================

// Daha önce aynı kayıt push'lanmış mı? (writer + validator dedupe)
function _ccLostExists(ir, section, name, field, reason) {
  return (ir.lostFields || []).some(r =>
    r.section === section && r.name === name && r.field === field && r.reason === reason);
}

// Rule 1: ACL → PBR semantic flip
// Source'da interface filter/ACL var; output'ta `ip policy route-map X` veya
// `policy-based-route X` olarak çıkmışsa (X = ACL adı) DANGEROUS.
function _ccValRuleAclPbrFlip(ir, output, dst) {
  const checkIface = (obj, label) => {
    const acl = obj._aclIn || obj._aclOut;
    if (!acl) return;
    const pbrPatterns = [
      'ip policy route-map ' + acl,
      'policy-based-route ' + acl,
      'ip policy-based-route ' + acl,
      'set policy ' + acl
    ];
    if (pbrPatterns.some(p => output.indexOf(p) !== -1)) {
      ccDropField(ir, label, obj.name || String(obj.id || ''), '_aclIn', acl,
        'acl-semantic-converted-to-pbr', dst, CC_SEVERITY.DANGEROUS);
    }
  };
  (ir.interfaces || []).forEach(f => checkIface(f, 'interface'));
  (ir.vlans || []).forEach(v => checkIface(v, 'vlan'));
}

// Rule 2: PBR → ACL semantic loss
// Source'da pbr_route_map var; output'ta PBR keyword'ü yok.
function _ccValRulePbrAclLoss(ir, output, dst) {
  const pbrKws = ['ip policy route-map ', 'policy-based-route ', 'ip policy-based-route ',
                  'set firewall family inet filter ', 'filter input ', 'policy-statement '];
  const check = (obj, label) => {
    if (!obj.pbr_route_map) return;
    const found = pbrKws.some(kw => output.indexOf(kw + obj.pbr_route_map) !== -1) ||
                  output.indexOf(obj.pbr_route_map) !== -1; // gevşek arama
    if (!found) {
      ccDropField(ir, label, obj.name || String(obj.id || ''), 'pbr_route_map', obj.pbr_route_map,
        'pbr-next-hop-behavior-lost', dst, CC_SEVERITY.DANGEROUS);
    }
  };
  (ir.interfaces || []).forEach(f => check(f, 'interface'));
  (ir.vlans || []).forEach(v => check(v, 'vlan'));
}

// Rule 3: Native VLAN loss
// Source trunk'ında native_vlan var; output'ta karşılığı yoksa DANGEROUS.
// Router L3 subif (iface._subif var) bu rule'dan muaf — onların native flag'i
// Rule 13 (subif native flag loss) altında yakalanır.
function _ccValRuleNativeVlan(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f.native_vlan) return;
    if (f._subif) return;  // router subif → rule 13 kapsamı
    const v = f.native_vlan;
    const patterns = [
      'native vlan ' + v,
      'pvid vlan ' + v,
      'port trunk pvid vlan ' + v,
      'native-vlan-id ' + v,
      'pvid=' + v
    ];
    if (!patterns.some(p => output.indexOf(p) !== -1)) {
      ccDropField(ir, 'interface', f.name, 'native_vlan', v,
        'native-vlan-removed-from-trunk', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule 4: Routed port downgrade
// Source L3 (no_switchport veya ip varsa) ama output'ta L2 switching komutları
// (switchport mode/port link-type) görünüyorsa — global heuristic (per-iface
// text scoping güvenilmez olduğundan kaba kontrol).
function _ccValRuleRoutedPortDowngrade(ir, output, dst) {
  const l3Ifaces = (ir.interfaces || []).filter(f =>
    f.no_switchport === true || (f.ip && !f.vlan_mode));
  if (!l3Ifaces.length) return;
  // Eğer source TAMAMEN L3 ama output'ta switchport komutu çoksa, downgrade
  // şüphesi var. Eşik: switchport komutları > L3 IP komutları.
  const switchportCount =
    (output.match(/switchport mode (access|trunk)/g) || []).length +
    (output.match(/port link-type (access|trunk)/g) || []).length;
  const ipAddrCount = (output.match(/ip address/g) || []).length;
  if (switchportCount > 0 && ipAddrCount === 0) {
    l3Ifaces.forEach(f => {
      ccDropField(ir, 'interface', f.name, 'l3_mode', 'no_switchport',
        'routed-interface-converted-to-switching', dst, CC_SEVERITY.DANGEROUS);
    });
  }
}

// Rule 5: ACL defined but unattached
// ACL definition var ama hiçbir interface/vlan/bundle/PBR/QoS classifier'da
// kullanılmamışsa DANGEROUS (security policy delik).
function _ccValRuleAclUnattached(ir, output, dst) {
  (ir.acls || []).forEach(acl => {
    const refsInIr =
      (ir.interfaces || []).some(f => f._aclIn === acl.name || f._aclOut === acl.name) ||
      (ir.vlans || []).some(v => v._aclIn === acl.name || v._aclOut === acl.name) ||
      (ir.bundles || []).some(b => b._aclIn === acl.name || b._aclOut === acl.name) ||
      (ir.routeMaps || []).some(rm => rm.match_acl === acl.name) ||
      (ir.qos && (ir.qos.classMaps || []).some(c => c.match_acl === acl.name));
    if (!refsInIr) {
      ccDropField(ir, 'acl', acl.name, 'attachment', '(none)',
        'acl-definition-emitted-but-no-enforcement', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule 6: Routing protocol partial
// OSPF process var ama network kayıp; BGP neighbor var ama peer-as kayıp.
function _ccValRuleRoutingProtocolPartial(ir, output, dst) {
  (ir.ospf || []).forEach(proc => {
    const pid = String(proc.process_id || proc.id || proc.pid || '?');
    const hasNets = (proc.areas || []).some(a => (a.networks || []).length > 0);
    if (!hasNets) {
      ccDropField(ir, 'ospf', pid, 'networks', '(empty)',
        'ospf-routing-adjacency-lost-no-networks', dst, CC_SEVERITY.DROPPED);
    }
    if (!proc.router_id) {
      ccDropField(ir, 'ospf', pid, 'router_id', '(none)',
        'ospf-router-id-missing', dst, CC_SEVERITY.PARTIAL);
    }
  });
  if (ir.bgp) {
    const neighbors = ir.bgp.neighbors || [];
    if (neighbors.length > 0 && !neighbors.some(n => n.remote_as)) {
      ccDropField(ir, 'bgp', 'global', 'remote_as', '(missing)',
        'bgp-peer-as-missing', dst, CC_SEVERITY.PARTIAL);
    }
  }
}

// Rule 7: SNMPv3 downgrade
// Source SNMPv3 authPriv user'ı var; output sadece v2c community içeriyorsa.
function _ccValRuleSnmpV3Downgrade(ir, output, dst) {
  const snmp = (ir.system && ir.system.snmp) || {};
  const v3users = snmp.v3_users || snmp.users || [];
  const hasAuthPriv = v3users.some(u => u && (u.privacy || u.priv || u.privPasswd));
  if (!hasAuthPriv) return;
  const hasV2c = /snmp-server\s+community/.test(output);
  const hasV3Priv = /v3\s+priv|usm-user .* privacy-mode/.test(output);
  if (hasV2c && !hasV3Priv) {
    ccDropField(ir, 'snmp', 'v3', 'security_model', 'authPriv',
      'snmp-security-model-downgraded-to-v2c', dst, CC_SEVERITY.DANGEROUS);
  }
}

// Rule 8: QoS semantic downgrade (writer push'unu validator de doğrular)
// Writer zaten LLQ→permit'i DANGEROUS olarak işaretliyor; validator ek tarama:
// classifier var ama hiçbir behavior'da scheduler/priority/queue yoksa.
function _ccValRuleQosDowngrade(ir, output, dst) {
  const policyMaps = (ir.qos && ir.qos.policyMaps) || [];
  policyMaps.forEach(pm => {
    (pm.classes || []).forEach(cl => {
      if (cl.action === 'priority' && cl.priority_pct) {
        if (!_ccLostExists(ir, 'qos', cl.name, 'priority_scheduling',
                           'huawei-llq-semantic-downgrade-needs-manual-queue-ef-pq')) {
          // Writer'da yakalanmadıysa burada yakala (genel)
          ccDropField(ir, 'qos', cl.name, 'priority_scheduling', cl.priority_pct,
            'qos-priority-semantics-lost', dst, CC_SEVERITY.DANGEROUS);
        }
      }
    });
  });
}

// Rule 9: Mirror/SPAN shrink — source/destination sayısı düşmüşse
function _ccValRuleSpanShrink(ir, output, dst) {
  const sessions = ir.spanSessions || ir.span || [];
  sessions.forEach(s => {
    const srcCount = (s.sources || []).length;
    if (srcCount > 0) {
      const emittedCount = (output.match(new RegExp('monitor session\\s+' + s.id, 'g')) || []).length;
      if (emittedCount > 0 && emittedCount < srcCount) {
        ccDropField(ir, 'span', String(s.id), 'sources', '(' + emittedCount + '/' + srcCount + ')',
          'mirror-source-set-reduced', dst, CC_SEVERITY.PARTIAL);
      }
    }
  });
}

// Rule 10: BFD protocol binding loss
// Interface'te bfd var ama output'ta OSPF/BGP altında bfd binding yoksa.
function _ccValRuleBfdBindingLoss(ir, output, dst) {
  const hasIfaceBfd = (ir.interfaces || []).some(f => f.bfd);
  if (!hasIfaceBfd) return;
  const hasOspf = (ir.ospf || []).length > 0;
  const hasBgp = !!ir.bgp;
  if (!hasOspf && !hasBgp) return; // protocol yok, binding gerekmez
  const ospfBindPatterns = ['bfd all-interfaces', 'ospf bfd', 'set protocols ospf bfd'];
  const bgpBindPatterns  = ['fall-over bfd', 'peer .* bfd enable', 'bfd-liveness-detection'];
  const ospfOk = !hasOspf || ospfBindPatterns.some(p => new RegExp(p).test(output));
  const bgpOk  = !hasBgp  || bgpBindPatterns.some(p => new RegExp(p).test(output));
  if (!ospfOk || !bgpOk) {
    ccDropField(ir, 'bfd', 'protocol_binding', 'enabled', 'interface-only',
      'bfd-protocol-binding-lost', dst, CC_SEVERITY.PARTIAL);
  }
}

// =============================================================================
// SUBINTERFACE / QinQ / ENCAPSULATION VALIDATOR RULES — Sprint 20
// =============================================================================

// Rule 11: Subif encapsulation loss
// Source iface._subif var; output'ta vendor-uygun VLAN tag emit komutlarından
// hiçbiri görülmüyorsa DANGEROUS (subif çevrim semantic'i kaybedildi).
function _ccValRuleSubifEncapLoss(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f._subif || !f._subif.encapsulation) return;
    const enc = f._subif.encapsulation;
    const vid = enc.vlan;
    // Vendor-uygun encapsulation pattern'leri (hangi vendor için hangileri geçerli)
    const patterns = [
      'encapsulation dot1Q ' + vid,
      'encapsulation dot1q ' + vid,
      'dot1q termination vid ' + vid,
      'vlan-id ' + vid,        // JunOS unit N vlan-id N
      'vlan-id=' + vid,         // MikroTik /interface vlan add vlan-id=N
      'vlan-tags outer ' + vid, // JunOS QinQ
      'qinq termination',       // Huawei QinQ
    ];
    if (!patterns.some(p => output.indexOf(p) !== -1)) {
      ccDropField(ir, 'interface', f.name, '_subif.encapsulation', vid,
        'subif-encapsulation-tag-lost-semantic-downgrade', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule 12: QinQ inner VLAN loss
// Source qinq_inner var ama output'ta inner tag emit edilmiyor → çift-tagged
// frame'lerin inner VLAN davranışı kayıp.
function _ccValRuleQinqInnerLoss(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f._subif || !f._subif.encapsulation) return;
    const enc = f._subif.encapsulation;
    if (!enc.qinq_inner) return;
    const innerPatterns = [
      'second-dot1q ' + enc.qinq_inner,
      'ce-vid ' + enc.qinq_inner,
      'qinq termination l2 ' + enc.vlan + ' ' + enc.qinq_inner,
      'inner-vlan-id ' + enc.qinq_inner
    ];
    if (!innerPatterns.some(p => output.indexOf(p) !== -1)) {
      ccDropField(ir, 'interface', f.name, '_subif.qinq_inner', enc.qinq_inner,
        'qinq-inner-vlan-tag-lost-double-tagged-frames-untagged', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule 13: Subif native flag loss
// Source _subif.encapsulation.native=true ama output'ta vendor'a uygun native
// marker (Cisco "native", Huawei "arp broadcast enable", JunOS "native-vlan-id")
// emit edilmemişse PARTIAL (untagged frame handling kaybı).
function _ccValRuleSubifNativeFlagLoss(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f._subif || !f._subif.encapsulation) return;
    const enc = f._subif.encapsulation;
    if (!enc.native) return;
    const nativePatterns = [
      'encapsulation dot1Q ' + enc.vlan + ' native',
      'arp broadcast enable',
      'native-vlan-id ' + enc.vlan
    ];
    if (!nativePatterns.some(p => output.indexOf(p) !== -1)) {
      ccDropField(ir, 'interface', f.name, '_subif.native', true,
        'subif-native-vlan-flag-lost-untagged-handling', dst, CC_SEVERITY.PARTIAL);
    }
  });
}

// Rule 14: Subif unit/vlan-id mismatch (VLAN rewrite loss)
// JunOS subif modelinde `unit N` ile `vlan-id M` (N != M) farklı olabilir —
// bu "VLAN translation" anlamına gelir. Eğer hedef vendor bu ayrımı yansıtmıyorsa
// (örn. Cisco IOS sadece tek tag emit ediyor, unit=vlan zorunluluğu) PARTIAL.
function _ccValRuleSubifUnitVlanMismatch(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f._subif || !f._subif.encapsulation) return;
    const unit = f._subif.unit;
    const vlan = f._subif.encapsulation.vlan;
    if (unit === vlan) return;
    // Mismatch — sadece JunOS hedefte direkt korunabilir (unit N vlan-id M)
    // Diğer hedeflerde vlan değeri kullanılır; unit value kayıp.
    if (dst !== 'juniper-junos' && dst !== 'juniper-srx') {
      ccDropField(ir, 'interface', f.name, '_subif.unit_vlan_mismatch',
        { unit: unit, vlan: vlan },
        'vlan-rewrite-unit-vs-vlanid-mismatch-not-preserved-in-target', dst, CC_SEVERITY.PARTIAL);
    }
  });
}

// Rule 15: Subif IP unbound
// Source subif'inde IP var ama output'ta IP adresi HİÇ yazılmamışsa
// → IP kayboldu (subif IP emisyonu unutulmuş).
// Vendor name normalize'ı (ge-0/0/1.10 → Gi0/0/1.10) yüzünden name match
// yerine direkt IP varlığı kontrol edilir.
function _ccValRuleSubifIpUnbound(ir, output, dst) {
  (ir.interfaces || []).forEach(f => {
    if (!f._subif || !f.ip) return;
    if (output.indexOf(f.ip) === -1) {
      ccDropField(ir, 'interface', f.name, '_subif.ip_emission', f.ip,
        'subif-ip-not-emitted-on-target', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// =============================================================================
// FAZ 4 — Statik Bilgi Tabanı (KB): vendor + OS/sürüm damgalı, kaynağı
// belgelenmiş kısıtlar. Elle tahmin yerine resmi dokümantasyondan (2026-07
// itibarıyla) doğrulanmış. YANG/Ansible şemasının tam otomatik ingest'i ayrı
// bir offline pipeline gerektirir (bkz. docs/_audit/config-generator-kb-
// arastirma-plani-2026-07-22.md §4 Faz A) — bu, o hedefin ilk, elle
// doğrulanmış sürümü: aynı JSON şekli, ileride scriptle üretilen dosyayla
// yer değiştirebilir.
// =============================================================================
const CC_KB = {
  'cisco-ios': {
    osVersion: 'IOS / IOS-XE (12.x - 17.x)',
    // AD aralığı: openconfig-local-routing.yang'daki "preference" leaf'i kasıtlı olarak
    // generic uint32 (vendor implementasyonuna bırakılmış) — Cisco'nun somut 1-255 kısıtı
    // OpenConfig'te YOK, sadece Cisco'nun kendi dokümantasyonunda var. Bu, YANG'ın nerede
    // yetersiz kaldığının (vendor-nötr model, implementasyon-özel limitleri atlıyor) somut
    // örneği — 2026-07-22 doğrulandı.
    source: 'https://www.cisco.com/c/en/us/td/docs/ios-xml/ios/sec_data_acl/configuration/xe-3s/sec-data-acl-xe-3s-book/sec-access-list-ov.html, https://www.cisco.com/c/en/us/support/docs/ip/border-gateway-protocol-bgp/15986-admin-distance.html',
    vlan: { idRange: [1, 4094] },
    acl: { standardRanges: [[1, 99], [1300, 1999]], extendedRanges: [[100, 199], [2000, 2699]] },
    route: { adRange: [1, 255] }
  },
  'huawei-vrp': {
    osVersion: 'VRP (V200R serisi)',
    source: 'https://support.huawei.com/enterprise/en/doc/EDOC1000178177/b1e74756/configuring-an-advanced-acl',
    vlan: { idRange: [1, 4094] },
    acl: { basicRanges: [[2000, 2999]], advancedRanges: [[3000, 3999]] }
  },
  'huawei-ce': { osVersion: 'VRP (CE serisi)', vlan: { idRange: [1, 4094] } },
  'huawei-usg': { osVersion: 'VRP (USG serisi)', vlan: { idRange: [1, 4094] } },
  'dell-os10': {
    osVersion: 'SmartFabric OS10 10.5.x',
    source: 'https://www.dell.com/support/manuals/en-us/smartfabric-os10-emp-partner/smartfabric-os-user-guide-10-5-1/ip-acls',
    vlan: { idRange: [1, 4094] },
    acl: { note: 'OS10 sequence-number tabanlı ACL kullanır; Cisco/Huawei tarzı sabit numaralı tip ayrımı yok — numara aralığı kontrolü uygulanmaz.' }
  },
  'juniper-junos': {
    osVersion: 'Junos (tüm sürümler)',
    source: 'https://www.juniper.net/documentation/us/en/software/junos/interfaces-ethernet/topics/ref/statement/unit-edit-interfaces.html',
    vlan: { idRange: [1, 4094] },
    interface: { unitRange: [0, 16385], unitRangeNote: 'demux/PPPoE interface\'lerde üst sınır 65535' }
  },
  'juniper-srx': { osVersion: 'Junos SRX', vlan: { idRange: [1, 4094] } },
  'arista-eos': { osVersion: 'EOS', vlan: { idRange: [1, 4094] } },
  'mikrotik': { osVersion: 'RouterOS', vlan: { idRange: [1, 4094] } },
  'fortigate': {
    osVersion: 'FortiOS 7.x',
    // policy ID aralığı ve action enum'ı hem docs.fortinet.com hem de
    // fortinet-ansible-dev/ansible-galaxy-fortios-collection reposundaki
    // fortios_firewall_policy.py modülünün argument_spec'inden (2026-07-22) doğrulandı.
    source: 'https://docs.fortinet.com/document/fortigate/7.4.4/administration-guide/656084/firewall-policy, https://github.com/fortinet-ansible-dev/ansible-galaxy-fortios-collection/blob/main/plugins/modules/fortios_firewall_policy.py',
    vlan: { idRange: [1, 4094] },
    policy: { idRange: [0, 4294967294], actionEnum: ['accept', 'deny', 'ipsec'] }
  },
  'paloalto': {
    osVersion: 'PAN-OS 10.2+',
    source: 'https://docs.paloaltonetworks.com/network-security/ipsec-vpn/administration/set-up-site-to-site-vpn/define-cryptographic-profiles/define-ike-crypto-profiles',
    vlan: { idRange: [1, 4094] },
    // dh_group/authentication enum'ları docs.paloaltonetworks.com'un yanı sıra
    // PaloAltoNetworks/pan-os-ansible reposundaki panos_ike_crypto_profile.py
    // modülünün gerçek argument_spec'inden (choices=[...]) doğrulandı —
    // 2026-07-22, github.com/PaloAltoNetworks/pan-os-ansible/blob/develop/plugins/modules/panos_ike_crypto_profile.py
    ipsec: {
      dhGroupEnum_pre10_2: ['group1', 'group2', 'group5', 'group14', 'group19', 'group20'],
      dhGroupEnum_10_2plus: ['group1', 'group2', 'group5', 'group14', 'group15', 'group16', 'group19', 'group20', 'group21'],
      hashEnum: ['non-auth', 'md5', 'sha1', 'sha256', 'sha384', 'sha512']
    }
  },
  'checkpoint': {
    osVersion: 'R80+',
    source: 'https://community.checkpoint.com/t5/Management/What-are-the-limitations-for-network-object-names-in-R80-10/td-p/5726',
    note: 'R80 itibarıyla nesne adı karakter kısıtlaması resmen kaldırıldı; öncesi (R77 ve altı) için güncel/güvenilir bir sayısal limit bulunamadı — sabit değer varsayılmadı.'
  },
  'cisco-asa': { osVersion: 'ASA', vlan: { idRange: [1, 4094] } },
  'cisco-ftd': { osVersion: 'FTD', vlan: { idRange: [1, 4094] } },
  'cisco-nxos': { osVersion: 'NX-OS', vlan: { idRange: [1, 4094] } },
  'f5-bigip': { osVersion: 'BIG-IP TMOS', vlan: { idRange: [1, 4094] } },
  'citrix-adc': { osVersion: 'Citrix ADC', vlan: { idRange: [1, 4094] } }
};

// ── Faz 3 kuralları — Faz 0-2'de eklenen bölümler için (VLAN/NAT/IPsec/PBR) ────
// Amaç converter'a özel değil: "üretilen/dönüştürülen config cihazda hata verir
// mi ya da sessizce hiçbir şey yapmaz mı" sorusuna cevap veriyor.

// Faz 4: CC_KB'ye dayalı genel aralık/enum kontrolü — hardcoded "1-4094" gibi
// tek-vendor varsayımları yerine kaynağı belgelenmiş, vendor+sürüm damgalı
// kısıtları kullanır. CC_KB'de kaydı olmayan vendor için VLAN'da evrensel
// 802.1Q varsayılanına (1-4094) düşer, diğer kontroller sessizce atlanır.
function _ccValRuleKbRange(ir, output, dst) {
  const kb = CC_KB[dst] || {};
  const vlanRange = (kb.vlan && kb.vlan.idRange) || [1, 4094];
  (ir.vlans || []).forEach(v => {
    const id = parseInt(v.id, 10);
    if (isNaN(id) || id < vlanRange[0] || id > vlanRange[1]) {
      ccDropField(ir, 'vlan', v.name || String(v.id), 'id', v.id,
        'kb-vlan-id-out-of-range-' + dst, dst, CC_SEVERITY.DANGEROUS);
    }
  });
  if (kb.acl && (kb.acl.standardRanges || kb.acl.advancedRanges || kb.acl.basicRanges)) {
    const allRanges = [].concat(kb.acl.standardRanges || [], kb.acl.extendedRanges || [], kb.acl.basicRanges || [], kb.acl.advancedRanges || []);
    (ir.acls || []).forEach(a => {
      if (!/^\d+$/.test(String(a.name))) return; // named ACL — numara kontrolü uygulanmaz
      const num = parseInt(a.name, 10);
      if (!allRanges.some(([lo, hi]) => num >= lo && num <= hi)) {
        ccDropField(ir, 'acls', a.name, 'name', a.name,
          'kb-acl-number-out-of-known-ranges-' + dst, dst, CC_SEVERITY.MANUAL);
      }
    });
  }
  if (dst === 'fortigate' && kb.policy && kb.policy.idRange) {
    const [lo, hi] = kb.policy.idRange;
    (ir.securityPolicies || []).forEach(p => {
      const id = parseInt(p.seq, 10);
      if (!isNaN(id) && (id < lo || id > hi)) {
        ccDropField(ir, 'securityPolicies', p.name || String(p.seq), 'seq', p.seq,
          'kb-policy-id-out-of-range-fortigate', dst, CC_SEVERITY.DANGEROUS);
      }
    });
  }
  if (dst === 'paloalto' && kb.ipsec) {
    const useOld = ir._meta && ir._meta.dstOsVersion === 'panos-pre-10.2';
    const validGroups = useOld ? kb.ipsec.dhGroupEnum_pre10_2 : kb.ipsec.dhGroupEnum_10_2plus;
    (ir.vpnTunnels || []).forEach(t => {
      if (!t.dhgrp) return;
      const g = /^group/.test(t.dhgrp) ? t.dhgrp : 'group' + t.dhgrp;
      if (validGroups.indexOf(g) === -1) {
        ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'dhgrp', t.dhgrp,
          'kb-dhgroup-not-in-paloalto-enum', dst, CC_SEVERITY.MANUAL);
      }
    });
  }
  if (dst === 'juniper-junos' && kb.interface && kb.interface.unitRange) {
    const [lo, hi] = kb.interface.unitRange;
    (ir.interfaces || []).forEach(f => {
      const sub = ccGetWriterSubif(f);
      if (sub && (sub.unit < lo || sub.unit > hi)) {
        ccDropField(ir, 'interface', f.name, 'unit', sub.unit,
          'kb-junos-unit-out-of-range', dst, CC_SEVERITY.DANGEROUS);
      }
    });
  }
  if (kb.route && kb.route.adRange) {
    const [lo, hi] = kb.route.adRange;
    (ir.routes || []).forEach(r => {
      if (r.metric === undefined || r.metric === null || r.metric === '') return;
      const ad = parseInt(r.metric, 10);
      if (!isNaN(ad) && (ad < lo || ad > hi)) {
        ccDropField(ir, 'routes', r.network || '', 'metric', r.metric,
          'kb-ad-out-of-range-' + dst, dst, CC_SEVERITY.DANGEROUS);
      }
    });
  }
}

// Rule: NAT kuralında ne kaynak ne hedef çeviri hedefi var — kural sessizce no-op olur.
function _ccValRuleNatIncomplete(ir, output, dst) {
  (ir.natRules || []).forEach(n => {
    const hasSrcTrans = !!(n.transSrc && String(n.transSrc).trim());
    const hasDstTrans = !!(n.transDst && String(n.transDst).trim());
    if (!hasSrcTrans && !hasDstTrans) {
      ccDropField(ir, 'natRules', n.name || n._ruleName || '', 'transSrc/transDst', '',
        'nat-rule-no-translation-target-noop', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule: IPsec PSK boş veya çok kısa — tünel kurulmaz ya da zayıf paylaşılan anahtar.
function _ccValRuleIpsecWeakPsk(ir, output, dst) {
  (ir.vpnTunnels || []).forEach(t => {
    if (!t.psk || String(t.psk).trim().length === 0) {
      ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'psk', '',
        'ipsec-psk-empty-tunnel-will-not-establish', dst, CC_SEVERITY.DANGEROUS);
    } else if (String(t.psk).trim().length < 8) {
      ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'psk', '(kısa)',
        'ipsec-psk-weak-below-8-chars', dst, CC_SEVERITY.MANUAL);
    }
    if (!t.remoteGw || !/^\d{1,3}(\.\d{1,3}){3}$/.test(String(t.remoteGw).trim())) {
      ccDropField(ir, 'vpnTunnels', t.p1Name || '', 'remoteGw', t.remoteGw || '',
        'ipsec-remote-gateway-missing-or-invalid', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule: FortiGate'e özel "policy-based IPsec route" action'ı (accept/deny/ipsec enum'ının
// üçüncü değeri — fortios_firewall_policy Ansible modülü kaynağından doğrulandı) başka
// vendor'a çevrilirken sessizce "deny"e düşer — bu semantik olarak yanlış (trafiği
// engellemek değil VPN'e yönlendirmek amaçlıydı).
function _ccValRulePolicyIpsecActionDowngrade(ir, output, dst) {
  if (dst === 'fortigate') return;
  (ir.securityPolicies || []).forEach(p => {
    if (p.action === 'ipsec') {
      ccDropField(ir, 'securityPolicies', p.name || '', 'action', 'ipsec',
        'fortigate-ipsec-policy-action-downgraded-to-deny', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Rule: PBR kuralında çıkış interface veya gateway eksik — kural cihaz tarafından reddedilir.
function _ccValRulePbrMissingTarget(ir, output, dst) {
  (ir.pbrRules || []).forEach(p => {
    if (!p.outInterface && !p.gateway) {
      ccDropField(ir, 'pbrRules', String(p.seq || ''), 'outInterface/gateway', '',
        'pbr-rule-no-output-target', dst, CC_SEVERITY.DANGEROUS);
    }
  });
}

// Main entry: tüm rule'ları sırayla çalıştır, hata fırlatmayı tolere et.
function ccValidateSemantic(ir, output, dstVendor) {
  if (!ir || !output || !dstVendor) return;
  const rules = [
    _ccValRuleKbRange,
    _ccValRuleNatIncomplete,
    _ccValRuleIpsecWeakPsk,
    _ccValRulePolicyIpsecActionDowngrade,
    _ccValRulePbrMissingTarget,
    _ccValRuleAclPbrFlip,
    _ccValRulePbrAclLoss,
    _ccValRuleNativeVlan,
    _ccValRuleRoutedPortDowngrade,
    _ccValRuleAclUnattached,
    _ccValRuleRoutingProtocolPartial,
    _ccValRuleSnmpV3Downgrade,
    _ccValRuleQosDowngrade,
    _ccValRuleSpanShrink,
    _ccValRuleBfdBindingLoss,
    // Sprint 20 subif/QinQ rules
    _ccValRuleSubifEncapLoss,
    _ccValRuleQinqInnerLoss,
    _ccValRuleSubifNativeFlagLoss,
    _ccValRuleSubifUnitVlanMismatch,
    _ccValRuleSubifIpUnbound
  ];
  rules.forEach(rule => {
    try { rule(ir, output, dstVendor); }
    catch (e) { /* validator main akışı bozmaz */ }
  });
}

// Unsupported field için vendor-uygun comment satırı üret.
function ccUnsupportedComment(vendor, section, name, field, value) {
  const ch = (CC_VENDOR_META[vendor] || {}).commentChar || '!';
  let v;
  if (value === true || value === false) v = String(value);
  else if (value === null || value === undefined) v = '';
  else if (typeof value === 'object') v = JSON.stringify(value);
  else v = String(value);
  const namePart = name ? ' [' + name + ']' : '';
  return ch + ' Unsupported: ' + section + namePart + '.' + field +
    (v ? ' = ' + v : '') + ' — ' + vendor + ' does not support this';
}

// Emit veya kaybet helper'ı.
// - Boş value → '' (no-op)
// - support === 'unsupported' → lostFields'a düşür, opsiyonel comment döndür
// - Aksi takdirde formatter(value, support) sonucunu döndür
// opts.emitComment (default true): unsupported'da yorum satırı emit edilsin mi?
function ccEmitOrLose(ir, vendor, section, name, field, value, formatter, opts) {
  opts = opts || {};
  const isEmpty = value === undefined || value === null || value === '' ||
                  value === false ||
                  (Array.isArray(value) && value.length === 0) ||
                  (typeof value === 'object' && value !== null && Object.keys(value).length === 0);
  if (isEmpty) return '';
  const support = ccFieldSupport(section, field, vendor);
  if (support === 'unsupported') {
    ccDropField(ir, section, name, field, value, 'vendor-not-supported', vendor);
    return (opts.emitComment === false) ? '' :
      ccUnsupportedComment(vendor, section, name, field, value) + '\n';
  }
  if (typeof formatter !== 'function') return '';
  return formatter(value, support);
}

// Sprint 1 feature flag — false'a alınınca yeni helper'lar by-pass edilir
// (formatter dönerse hala emit eder; sadece lostFields ve comment yazılmaz).
// Sprint 5 sonunda kaldırılır.
const CC_USE_FIELD_SUPPORT = true;

// =============================================================================
// VENDOR PROFILES — Sprint 10
//
// Hedef vendor'un belirli sürüm/davranış varyantlarını kod-seviyesinde
// konfigüre eder. UI'da gösterilmez (kullanıcı seçmez); operatör bu dosyayı
// düzenleyerek cihaz parkına göre default'u değiştirebilir.
//
// Tüm değerler "modern/yaygın varsayılan" — eski sürümler için override
// gerekli olduğunda alttaki notlara bakın.
// =============================================================================
const CC_VENDOR_PROFILES = {
  'huawei-vrp': {
    // Named ACL desteği (acl name X advance + traffic-filter inbound acl name X
    // + policy-based-route if-match acl X)
    // - true  → modern VRP (V200R005C00+, S5700-EI 5.130+, S9300/S12700)
    // - false → eski VRP (V5.110 ve öncesi, bazı düşük segment switch'ler)
    //           Tüm ACL refleri otomatik olarak numeric'e (3000+) çevrilir.
    named_acl_supported: true
  },
  'huawei-ce': {
    named_acl_supported: true
  }
  // Diğer vendor'lar için profile gerekirse buraya eklenir
};

function ccGetVendorProfile(vendor) {
  return (CC_VENDOR_PROFILES && CC_VENDOR_PROFILES[vendor]) || {};
}

// =============================================================================
// SUBINTERFACE IR SCHEMA — Sprint 17
//
// Vendor-neutral router L3 subinterface modeli. Reader'lar her vendor için
// kendi subif syntax'ını parse ettiğinde bu yapıyı populate eder; writer'lar
// _subif field'ına bakarak doğru vendor output'unu üretir.
//
// Mevcut backward-compat field'ları (iface.access_vlan, iface.native_vlan,
// iface.name="...N") korunur — _subif eklenmiş zenginleştirme katmanıdır.
//
// Schema:
//   iface._subif = {
//     parent: 'GigabitEthernet0/0/1',  // fiziksel parent interface adı
//     unit:   100,                      // JunOS unit / subif index (number)
//     encapsulation: {
//       type:        'dot1q' | 'qinq' | 'dot1ad',
//       vlan:        100,               // outer/primary VLAN id
//       native:      true | false,      // Cisco "dot1Q N native"
//       qinq_inner:  200 | null         // Q-in-Q için iç VLAN
//     }
//   }
//
// Helper aşağıdadır.
// =============================================================================
function ccBuildSubif(parent, unit, vlan, opts) {
  opts = opts || {};
  return {
    parent: String(parent || ''),
    unit: parseInt(unit, 10),
    encapsulation: {
      type: opts.type || 'dot1q',
      vlan: parseInt(vlan, 10),
      native: !!opts.native,
      qinq_inner: opts.qinq_inner != null ? parseInt(opts.qinq_inner, 10) : null
    }
  };
}

// Iface name'inden parent + unit ayır (subif olmayan iface için null döner).
function ccParseSubifName(name) {
  const m = String(name || '').match(/^([A-Za-z][^.]*)\.(\d+)$/);
  if (!m) return null;
  return { parent: m[1], unit: parseInt(m[2], 10) };
}

// Writer'lar için subif info yardımcısı.
// Öncelik: iface._subif (Sprint 17 structured field) → fallback: iface.name'den
// parse. Subif olmayan iface için null döner.
function ccGetWriterSubif(f) {
  if (!f) return null;
  if (f._subif && f._subif.encapsulation) return f._subif;
  const parsed = ccParseSubifName(f.name);
  if (!parsed) return null;
  // Native flag fallback: access_vlan === native_vlan ise native
  const isNative = (f.native_vlan != null && f.native_vlan === parsed.unit);
  return ccBuildSubif(parsed.parent, parsed.unit, f.access_vlan || parsed.unit,
    { type: 'dot1q', native: isNative, qinq_inner: f._qinqInner || null });
}

// Deploy mode'da çıktıdan strip edilecek annotation pattern'leri.
// `# ` veya `! ` prefix'iyle başlayan ve uyarı/açıklama içeren satırlar.
const CC_DEPLOY_STRIP_PATTERNS = [
  /^[#!]\s*PARTIAL\b/,
  /^[#!]\s*MANUAL\s+(REVIEW|IMPLEMENTATION)/,
  /^[#!]\s*NOTE\b/,
  /^[#!]\s*Önerilen\b/,
  /^[#!]\s*Unsupported:/,
  /^[#!]\s*OPTIONAL\b/,
  /^[#!]\s*----\s*Çevrilemeyen\b/,
  /^[#!]\s*Trigger:/,
  /^[#!]\s*Action:/,
  /^[#!]\s*track\s+\d+\s+bağlantısı/
];

// Deploy mode'da çıktıdan annotation/yorum satırlarını strip et.
// Block-aware: PARTIAL/MANUAL header'ı sonrası devam eden `# ` satırlarını da
// strip et (multi-line yorum block'ları için). Boş satır veya `#` separator
// veya başka kod satırı block'u sonlandırır.
function ccStripDeployUnsafe(text) {
  if (!text) return text;
  const lines = text.split('\n');
  const out = [];
  let inAnnotationBlock = false;
  for (const line of lines) {
    const t = line.trimStart();
    const matchesPattern = CC_DEPLOY_STRIP_PATTERNS.some(re => re.test(t));
    if (matchesPattern) {
      inAnnotationBlock = true;
      continue;  // skip this line
    }
    // Annotation block continuation: `# ` veya `! ` ile başlayan ve config
    // separator (`#\n` veya `!\n`) olmayan yorum satırları.
    if (inAnnotationBlock && /^[#!]\s+\S/.test(t)) {
      continue;
    }
    // Block bitişi: boş satır, config separator, veya kod satırı
    inAnnotationBlock = false;
    out.push(line);
  }
  return out.join('\n');
}
