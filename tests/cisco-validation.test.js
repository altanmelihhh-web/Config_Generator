'use strict';

// Cisco IOS generator şemalarının tamamını tarayan bağımsız Node testi.
// Kaynak oracle'ları: Cisco IOS/XE command reference ve
// ansible-collections/cisco.ios resource-module argspec/fixture'ları.
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const captured = [];
const context = {
    console,
    CC_WRITERS: {},
    setTimeout() {}, clearTimeout() {},
    window: { addEventListener() {}, scrollTo() {} },
    location: { hash: '' }, history: { replaceState() {} },
    document: {
        getElementById() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, body: { classList: { contains() { return false; } } }
    },
    cgFormBuilder(container, schema, generateFn) { captured.push({ schema, generateFn }); },
};
vm.createContext(context);

function load(file) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
}

for (const f of ['common.js'].concat(fs.readdirSync(path.join(root, 'assets/js/validators')).filter(x => x.endsWith('.js') && x !== 'common.js').sort()))
    load('assets/js/validators/' + f);   // aile doğrulayıcıları CGM'den önce
load('assets/js/ConfigGeneratorManagement.js');
load('assets/js/ConfigConverter_Writers_Common.js');
load('assets/js/ConfigConverter_Writers_Cisco.js');
vm.runInContext('cgFormBuilder = (container, schema, generateFn) => __capture(schema, generateFn);',
    Object.assign(context, { __capture: (schema, generateFn) => captured.push({ schema, generateFn }) }));
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ConfigGenerators_Cisco.js'), 'utf8') +
    '\nthis.__CiscoIOS = CiscoIOS; this.__validators = new Proxy({}, { get: (_, k) => typeof k === "string" ? cgValidator(k, "cisco") : undefined });', context);

const generators = context.__CiscoIOS;
const validators = context.__validators;
for (const generator of Object.values(generators)) generator.init({});

assert.strictEqual(Object.keys(generators).length, 49, 'Cisco IOS generator sayısı beklenmedik biçimde değişti');
assert.strictEqual(captured.length, 49, 'Her Cisco IOS generator cgFormBuilder kullanmalı');

const freeFormRequired = new Set([
    // CLI sırrı/metni: varlığı zorunlu, desteklenen uzunluk komut ve IOS sürümüne bağlı.
    'psk', 'ipsec_psk', 'ro_comm', 'tacacs_key', 'radius_key', 'pri_key', 'enable_secret', 'nhrp_key', 'ntp_key',
]);

for (let i = 0; i < captured.length; i++) {
    const name = Object.keys(generators)[i];
    const schema = captured[i].schema;
    const fields = (schema.sections || []).flatMap(section => section.fields || []);
    for (const field of fields) {
        if (!(field.required || field.requiredIf)) continue;
        if (['select', 'checkbox', 'hidden'].includes(field.type)) continue;
        const constrained = field.validate || field.min !== undefined || field.max !== undefined;
        assert.ok(constrained || freeFormRequired.has(field.name),
            `${name}.${field.name}: zorunlu alan doğrulayıcısız`);
    }
}

function valid(type, value) {
    const rule = validators[type];
    assert.ok(rule, `Validator bulunamadı: ${type}`);
    return rule.re ? rule.re.test(value) : rule.fn(value);
}

// Kullanıcının bildirdiği regresyonlar.
assert.strictEqual(valid('wildcard_mask', '0.0.0.255'), true);
assert.strictEqual(valid('wildcard_mask', '2.2.2.2'), false);
assert.strictEqual(valid('wildcard_mask', '255.255.255.0'), false);
assert.strictEqual(valid('ios_iface', 'GigabitEthernet1/0/24'), true);
assert.strictEqual(valid('ios_iface', 'Gi0/1'), true);
assert.strictEqual(valid('ios_iface', 'Gig1/21323123'), false);
assert.strictEqual(valid('ios_iface', 'Patates1/1'), false);
assert.strictEqual(valid('subnet', '255.255.255.0'), true);
assert.strictEqual(valid('subnet', '255.0.255.0'), false);

// Cisco belgeleriyle sabitlenmiş sınırlar.
assert.strictEqual(valid('track_id', '1'), true);
assert.strictEqual(valid('track_id', '1000'), true);
assert.strictEqual(valid('track_id', '1001'), false);
assert.strictEqual(valid('ip_sla_id', '2147483647'), true);
assert.strictEqual(valid('ip_sla_id', '2147483648'), false);
assert.strictEqual(valid('snmpv3_secret', '1234567'), false);
assert.strictEqual(valid('snmpv3_secret', '12345678'), true);
assert.strictEqual(valid('ios_rt', '65000:100'), true);
assert.strictEqual(valid('ios_rt', 'target:65000:100'), false);

const prefixList = captured[Object.keys(generators).indexOf('prefixList')];
const badPrefix = prefixList.generateFn({
    _cgtype: 'ipv4', pl_name: 'PL-TEST', pl_seq: '10', pl_action: 'permit',
    pl_prefix: '192.0.2.0/24', pl_ge: '20', pl_le: '32', pl_desc: ''
});
assert.ok(badPrefix.warnings.length > 0, 'Prefix-list ge değeri temel prefiksten küçük olamamalı');
assert.ok(!badPrefix.config.includes('seq 10 permit'), 'Geçersiz prefix-list satırı config çıktısına girmemeli');

const bgpAf = captured[Object.keys(generators).indexOf('bgpAddressFamily')];
const badBgpNetwork = bgpAf.generateFn({
    _cgtype: 'ipv4', baf_as: '65000', baf_peer: '192.0.2.2', baf_remote_as: '65001',
    baf_network: '198.51.100.7', baf_mask: '255.255.255.0'
});
assert.ok(badBgpNetwork.warnings.length > 0, 'BGP network host bitleri açıkken uyarı üretilmeli');
assert.ok(!badBgpNetwork.config.includes('network 198.51.100.7'), 'Host bitli BGP network satırı config çıktısına girmemeli');

// ── Cisco düzeltme partisi (fix5): BGP AF+VRF, prefix-list ge, EIGRP named network, ios_acl, archive_path ──
{
    const G = (n, d) => { const r = captured[Object.keys(generators).indexOf(n)].generateFn(d); return typeof r === 'string' ? { config: r, warnings: [] } : r; };
    // 1. BGP AF + VRF: remote-as VRF AF içinde (cisco.ios test_ios_bgp_address_family fixture'ı).
    const bgpBase = { _cgtype: 'ipv4', baf_as: '65000', baf_peer: '192.0.2.2', baf_remote_as: '65001', baf_network: '198.51.100.0', baf_mask: '255.255.255.0' };
    const vrfAf = G('bgpAddressFamily', Object.assign({}, bgpBase, { baf_vrf: 'CUSTOMER_A' })).config;
    assert.ok(vrfAf.includes('router bgp 65000\n address-family ipv4 unicast vrf CUSTOMER_A\n  neighbor 192.0.2.2 remote-as 65001\n  neighbor 192.0.2.2 activate\n'), 'VRF komşusu AF içinde remote-as almalı');
    assert.ok(!/^ neighbor 192\.0\.2\.2 remote-as/m.test(vrfAf), 'VRF komşusu global bağlamda remote-as almamalı');
    assert.ok(vrfAf.includes('show ip bgp vpnv4 vrf CUSTOMER_A summary') && !vrfAf.includes('show bgp ipv4 unicast summary'), 'VRF doğrulama komutu VRF içermeli');
    const glAf = G('bgpAddressFamily', bgpBase).config;
    assert.ok(glAf.includes('router bgp 65000\n neighbor 192.0.2.2 remote-as 65001\n address-family ipv4 unicast\n  neighbor 192.0.2.2 activate\n'), 'Global AF çıktısı değişmemeli');
    assert.ok(glAf.includes('! show bgp ipv4 unicast summary\n'), 'Global doğrulama değişmemeli');
    // 2. Prefix-list: uzunluk < ge ≤ le ≤ 32.
    const pl = (ge, le) => G('prefixList', { _cgtype: 'ipv4', pl_name: 'PL-T', pl_seq: '10', pl_action: 'permit', pl_prefix: '192.0.2.0/24', pl_ge: ge, pl_le: le, pl_desc: '' });
    for (const [ge, le] of [['24', ''], ['24', '32'], ['33', ''], ['26', '25']]) {
        const r = pl(ge, le);
        assert.ok(r.warnings.length > 0 && !r.config.includes('seq 10'), 'prefix-list ge ' + ge + ' le ' + le + ' reddedilmeli');
    }
    for (const [ge, le, line] of [['25', '', ' ge 25\n'], ['25', '32', ' ge 25 le 32\n'], ['32', '32', ' ge 32 le 32\n'], ['', '28', ' le 28\n'], ['', '', '\n']]) {
        const r = pl(ge, le);
        assert.ok(!r.warnings.length && r.config.includes('seq 10 permit 192.0.2.0/24' + line), 'prefix-list ge ' + ge + ' le ' + le + ' kabul edilmeli');
    }
    // 3. EIGRP named: CIDR → wildcard; düz adres aynen.
    const eg = net => G('eigrpnamed', { _cgtype: 'eigrpnamed', proc_name: 'CORP', asn: '100', router_id: '192.0.2.1', network: net, af_iface: 'GigabitEthernet0/0' }).config;
    assert.ok(eg('10.1.0.0/24').includes('  network 10.1.0.0 0.0.0.255\n'), 'EIGRP /24 wildcard');
    assert.ok(eg('10.0.0.0/8').includes('  network 10.0.0.0 0.255.255.255\n'), 'EIGRP /8 wildcard');
    assert.ok(eg('192.0.2.1/32').includes('  network 192.0.2.1 0.0.0.0\n'), 'EIGRP /32 wildcard');
    assert.ok(eg('0.0.0.0/0').includes('  network 0.0.0.0 255.255.255.255\n'), 'EIGRP /0 wildcard');
    assert.ok(eg('10.0.0.0').includes('  network 10.0.0.0\n') && !eg('10.1.0.0/24').includes('/24'), 'EIGRP düz adres aynen, CIDR ham yazılmaz');
    // 4. ios_acl: 1300-1999 standart, 2000-2699 genişletilmiş (Cisco-IOS-XE-types std/ext-acl-type).
    for (const v of ['1', '99', '100', '199', '1300', '1999', '2000', '2699', 'ACL_WEB']) assert.strictEqual(valid('ios_acl', v), true, 'ios_acl ' + v);
    for (const v of ['0', '200', '1299', '2700', '9999']) assert.strictEqual(valid('ios_acl', v), false, 'ios_acl ' + v);
    // 5. archive_path: ftp/http/https/rcp/disk0 (Cisco Configuration Versioning).
    for (const v of ['flash:archive-$h', 'bootflash:a', 'nvram:a', 'disk0:archive-$h-$t', 'scp://u@192.0.2.30/y/$h', 'tftp://192.0.2.30/$h', 'ftp://u:p@192.0.2.30/y/$h', 'http://192.0.2.30/y/$h', 'https://192.0.2.30/y/$h', 'rcp://u@192.0.2.30/y/$h']) assert.strictEqual(valid('archive_path', v), true, 'archive_path ' + v);
    for (const v of ['usb0:a', 'ftp:/a', 'disk0: a', 'gopher://x/a', 'archive']) assert.strictEqual(valid('archive_path', v), false, 'archive_path ' + v);
    console.log('OK: Cisco fix5 (BGP AF VRF, prefix-list ge, EIGRP wildcard, ios_acl, archive_path) geçti.');
}

// ── EVPN / VXLAN (cisco.ios ios_evpn_* + ios_vxlan_vtep; IOS XE 17.11 YANG sınırları) ──
// vm bağlamındaki diziler farklı realm'dedir; yapısal karşılaştırma JSON ile.
const same = (a, b, m) => assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m);
const gen = name => captured[Object.keys(generators).indexOf(name)].generateFn;
const cfg = r => (typeof r === 'string' ? r : r.config);
const schemaOf = name => captured[Object.keys(generators).indexOf(name)].schema;
const fieldOf = (name, field) => schemaOf(name).sections.flatMap(s => s.fields).find(x => x.name === field);
const optionValues = (name, field) => fieldOf(name, field).options.map(o => o.value);

// Ansible choices kaybolmamalı.
same(optionValues('evpnGlobal', 'eg_repl').filter(Boolean), ['ingress', 'static']);
same(optionValues('evpnEvi', 'ev_repl').filter(Boolean), ['ingress', 'static']);
same(optionValues('evpnEvi', 'ev_encap'), ['vxlan']);
same(optionValues('evpnEthernet', 'es_type').filter(Boolean), ['0', '3']);
same(optionValues('evpnEthernet', 'es_red').filter(Boolean), ['all-active', 'single-active']);
same(optionValues('vxlanVtep', 'vt_l2_rep').filter(v => v !== 'none'), ['ingress', 'static']);
// Cisco YANG sınırları form şemasında.
same([fieldOf('evpnEvi', 'ev_id').min, fieldOf('evpnEvi', 'ev_id').max], [1, 65535]);
same([fieldOf('evpnEthernet', 'es_id').min, fieldOf('evpnEthernet', 'es_id').max], [1, 65535]);
same([fieldOf('evpnEthernet', 'es_wait').min, fieldOf('evpnEthernet', 'es_wait').max], [1, 10]);
same([fieldOf('vxlanVtep', 'vt_nve').min, fieldOf('vxlanVtep', 'vt_nve').max], [1, 4096]);
// Platform etiketi.
for (const n of ['evpnGlobal', 'evpnEvi', 'evpnEthernet', 'vxlanVtep']) {
    assert.ok(/Catalyst 9000/.test(schemaOf(n).topic.desc), `${n}: platform etiketi eksik`);
    assert.ok(/Cat9k/.test(schemaOf(n).configTypes[0].badge.text), `${n}: platform rozeti eksik`);
}

// EVPN global: olumlu (Ansible merged fixture komutları), üç durumlu bool, boş girdi.
const eg = cfg(gen('evpnGlobal')({ _cgtype: 'global', eg_repl: 'ingress', eg_rid: 'Loopback1', eg_dgw: 'off', eg_rt_auto: 'on', eg_ip_ll_disable: 'on', eg_flood_disable: '' }));
assert.ok(eg.includes('l2vpn evpn\n replication-type ingress\n router-id Loopback1\n no default-gateway advertise\n route-target auto vni\n ip local-learning disable\n'));
assert.ok(!eg.includes('flooding-suppression'), 'Seçilmeyen bool satır üretmemeli');
const egEmpty = gen('evpnGlobal')({ _cgtype: 'global' });
assert.ok(egEmpty.warnings.length > 0 && !egEmpty.config.includes('l2vpn evpn\n'), 'Boş global EVPN satır üretmemeli');

// EVI: olumlu, olumsuz (sınır ve rd), koşullu eşleme.
const evOk = cfg(gen('evpnEvi')({ _cgtype: 'evi', ev_id: '101', ev_encap: 'vxlan', ev_repl: 'ingress', ev_rd: '65000:101', ev_dgw: 'enable', ev_ip_ll: 'disable', ev_map: 'map', ev_vlan: '101', ev_vni: '10101' }));
assert.ok(evOk.includes('l2vpn evpn instance 101 vlan-based\n encapsulation vxlan\n replication-type ingress\n rd 65000:101\n default-gateway advertise enable\n ip local-learning disable\n'));
assert.ok(evOk.includes('vlan configuration 101\n member evpn-instance 101 vni 10101\n'));
const evBig = gen('evpnEvi')({ _cgtype: 'evi', ev_id: '65536', ev_map: 'none' });
assert.ok(evBig.warnings.length > 0 && !evBig.config.includes('l2vpn evpn instance'), 'EVI 65536 satır üretmemeli');
const evRd = gen('evpnEvi')({ _cgtype: 'evi', ev_id: '10', ev_rd: 'auto', ev_map: 'none' });
assert.ok(evRd.warnings.length > 0 && !evRd.config.includes(' rd '), 'rd auto IOS EVI altında reddedilmeli');
const evMapMissing = gen('evpnEvi')({ _cgtype: 'evi', ev_id: '10', ev_map: 'map', ev_vlan: '10', ev_vni: '' });
assert.ok(evMapMissing.warnings.length > 0 && !evMapMissing.config.includes('member evpn-instance'), 'Eksik VNI ile eşleme üretilmemeli');
const evNoMap = cfg(gen('evpnEvi')({ _cgtype: 'evi', ev_id: '10', ev_map: 'none', ev_vlan: '', ev_vni: '' }));
assert.ok(evNoMap.includes('l2vpn evpn instance 10 vlan-based') && !evNoMap.includes('vlan configuration'));
same(fieldOf('evpnEvi', 'ev_vni').requiredIf, { field: 'ev_map', in: ['map'] });

// Ethernet segment: Ansible fixture (type 0), type 3 system-mac, geçersiz ESI/timer.
const es0 = cfg(gen('evpnEthernet')({ _cgtype: 'es', es_id: '2', es_type: '0', es_value: '00.00.00.00.00.00.00.00.02', es_red: 'single-active', es_wait: '', es_preempt: '1' }));
assert.ok(es0.includes('l2vpn evpn ethernet-segment 2\n identifier type 0 00.00.00.00.00.00.00.00.02\n redundancy single-active\n df-election preempt-time 1\n'));
const es3 = cfg(gen('evpnEthernet')({ _cgtype: 'es', es_id: '3', es_type: '3', es_value: '0011.2233.4455', es_red: 'all-active', es_wait: '1' }));
assert.ok(es3.includes(' identifier type 3 system-mac 0011.2233.4455\n redundancy all-active\n df-election wait-time 1\n'));
const esBadEsi = gen('evpnEthernet')({ _cgtype: 'es', es_id: '1', es_type: '0', es_value: '00.00.01' });
assert.ok(esBadEsi.warnings.length > 0 && !esBadEsi.config.includes('ethernet-segment 1\n'), 'Kısa ESI satır üretmemeli');
const esBadMac = gen('evpnEthernet')({ _cgtype: 'es', es_id: '1', es_type: '3', es_value: '00.00.00.00.00.00.00.00.03' });
assert.ok(esBadMac.warnings.length > 0 && !esBadMac.config.includes('system-mac'), 'type 3 için Cisco MAC gerekir');
const esWait = gen('evpnEthernet')({ _cgtype: 'es', es_id: '1', es_type: '', es_wait: '11' });
assert.ok(esWait.warnings.length > 0 && !esWait.config.includes('wait-time'), 'wait-time 11 reddedilmeli');
const esNoId = cfg(gen('evpnEthernet')({ _cgtype: 'es', es_id: '4', es_type: '', es_value: '' }));
assert.ok(esNoId.includes('l2vpn evpn ethernet-segment 4\n') && !esNoId.includes('identifier'));

// VXLAN VTEP: Ansible fixture komutları, multicast/L3 çapraz alanları.
const vt = cfg(gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_bgp: true, vt_l2_rep: 'static', vt_l2_vni: '10201', vt_mcast4: '233.252.0.101', vt_mcast6: 'FF0E::DB8:101', vt_l3: true, vt_l3_vni: '50901', vt_l3_vrf: 'green' }));
assert.ok(vt.includes('interface nve1\n no ip address\n source-interface Loopback1\n host-reachability protocol bgp\n member vni 10201 mcast-group 233.252.0.101 FF0E::DB8:101\n member vni 50901 vrf green\n'));
const vtIr = cfg(gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_bgp: true, vt_l2_rep: 'ingress', vt_l2_vni: '10102', vt_mcast4: '233.252.0.1' }));
assert.ok(vtIr.includes(' member vni 10102 ingress-replication\n') && !vtIr.includes('233.252.0.1'), 'ingress-replication multicast grubu yazmamalı');
const vtUni = gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_l2_rep: 'static', vt_l2_vni: '10101', vt_mcast4: '192.0.2.1' });
assert.ok(vtUni.warnings.length > 0 && !vtUni.config.includes('member vni'), 'Unicast adres mcast-group olamaz');
const vtNoGroup = gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_l2_rep: 'static', vt_l2_vni: '10101', vt_mcast4: '' });
assert.ok(vtNoGroup.warnings.length > 0 && !vtNoGroup.config.includes('interface nve'), 'static replikasyonda grup zorunlu');
const vtSame = gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_l2_rep: 'ingress', vt_l2_vni: '5000', vt_l3: true, vt_l3_vni: '5000', vt_l3_vrf: 'A' });
assert.ok(vtSame.warnings.length > 0 && !vtSame.config.includes('member vni'), 'Aynı VNI L2 ve L3 olamaz');
const vtNve = gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '4097', vt_src: 'Loopback1', vt_l2_rep: 'ingress', vt_l2_vni: '10101' });
assert.ok(vtNve.warnings.length > 0 && !vtNve.config.includes('interface nve4097'), 'NVE 4097 reddedilmeli');
const vtNothing = gen('vxlanVtep')({ _cgtype: 'nve', vt_nve: '1', vt_src: 'Loopback1', vt_l2_rep: 'none' });
assert.ok(vtNothing.warnings.length > 0 && !vtNothing.config.includes('interface nve'), 'Üyeliksiz NVE üretilmemeli');
same(fieldOf('vxlanVtep', 'vt_mcast4').requiredIf, { field: 'vt_l2_rep', in: ['static'] });
same(fieldOf('vxlanVtep', 'vt_l3_vrf').requiredIf, { field: 'vt_l3', checked: true });

console.log(`OK: ${captured.length} Cisco IOS generator şeması ve kritik validator regresyonları geçti.`);

// ── NX-OS BGP AF / Neighbor AF / Peer Template (Cisco parti 2) ──
// Kaynak: cisco.nxos @5645581 argspec + rm_templates + unit fixture komutları;
// Nexus 9000 Unicast Routing CG 10.4(x) "Configuring Advanced BGP" sınırları.
{
    const nxCap = [];
    context.__capture = (schema, generateFn) => nxCap.push({ schema, generateFn });
    vm.runInContext('cgFormBuilder = (container, schema, generateFn) => __capture(schema, generateFn);', context);
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ConfigGenerators_NX-OS.js'), 'utf8') +
        '\nthis.__CiscoNXOS = CiscoNXOS;', context);
    const nx = context.__CiscoNXOS;
    const nxTool = name => { nxCap.length = 0; nx[name].init({}); return nxCap[0]; };
    const nxGen = name => nxTool(name).generateFn;
    const nxField = (name, f) => nxTool(name).schema.sections.flatMap(s => s.fields).find(x => x.name === f);
    const nxOpts = (name, f) => nxField(name, f).options.map(o => o.value).filter(Boolean);
    const bad = (r, needle, m) => assert.ok(r.warnings && r.warnings.length > 0 && !r.config.includes(needle), m);

    // Mevcut bgp aracı değişmedi (üretilen CLI aynı).
    const legacy = nxGen('bgp')({ local_as: '65001', rid: '192.0.2.1', nbr_ip: '192.0.2.2', nbr_as: '65002', nbr_type: 'ebgp', network: '' });
    assert.ok(legacy.includes('router bgp 65001\n router-id 192.0.2.1\n address-family ipv4 unicast\n !\n neighbor 192.0.2.2\n remote-as 65002\n  ebgp-multihop 2\n'));

    // Ansible choices kaybolmamalı.
    const afis = ['ipv4', 'ipv6', 'link-state', 'vpnv4', 'vpnv6', 'l2vpn'];
    for (const n of ['bgpAddressFamily', 'bgpNeighborAf']) {
        same(nxTool(n).schema.configTypes.map(t => t.id).sort(), afis.slice().sort());
        assert.ok(/Nexus 9000/.test(nxTool(n).schema.topic.desc), n + ': platform etiketi eksik');
    }
    same(nxOpts('bgpAddressFamily', 'baf_safi'), ['unicast', 'multicast', 'mvpn', 'evpn']);
    same(nxOpts('bgpAddressFamily', 'baf_red_proto'), ['am', 'direct', 'eigrp', 'isis', 'lisp', 'ospf', 'ospfv3', 'rip', 'static', 'hmm']);
    same(nxOpts('bgpNeighborAf', 'nbaf_ap_rx'), ['enable', 'disable']);
    same(nxOpts('bgpNeighborAf', 'nbaf_ap_tx'), ['enable', 'disable']);
    same(nxOpts('bgpTemplate', 'bt_afi'), ['ipv4', 'ipv6', 'link-state', 'l2vpn']);
    same(nxOpts('bgpTemplate', 'bt_af_sc'), ['standard', 'extended', 'both']);
    same(nxOpts('bgpTemplate', 'bt_bfd'), ['set', 'singlehop', 'multihop']);
    assert.ok(/Nexus 9000/.test(nxTool('bgpTemplate').schema.topic.desc));
    // Cisco sınırları şemada.
    same([nxField('bgpAddressFamily', 'baf_dist_e').min, nxField('bgpAddressFamily', 'baf_dist_e').max], [1, 255]);
    same([nxField('bgpAddressFamily', 'baf_damp_hl').min, nxField('bgpAddressFamily', 'baf_damp_hl').max], [1, 45]);
    same([nxField('bgpNeighborAf', 'nbaf_maxp').min, nxField('bgpNeighborAf', 'nbaf_maxp').max], [1, 300000]);
    same([nxField('bgpNeighborAf', 'nbaf_maxp_th').min, nxField('bgpNeighborAf', 'nbaf_maxp_th').max], [1, 100]);
    same([nxField('bgpTemplate', 'bt_mhop').min, nxField('bgpTemplate', 'bt_mhop').max], [2, 255]);
    same([nxField('bgpTemplate', 'bt_ttl').min, nxField('bgpTemplate', 'bt_ttl').max], [1, 254]);
    same([nxField('bgpTemplate', 'bt_ka').min, nxField('bgpTemplate', 'bt_ka').max], [0, 3600]);
    same(nxField('bgpAddressFamily', 'baf_red_rm').requiredIf.field, 'baf_red_proto');
    same(nxField('bgpNeighborAf', 'nbaf_maxp_rst').requiredIf, { field: 'nbaf_maxp_act', in: ['restart'] });

    // BGP AF: olumlu (Ansible fixture: additional-paths yerine rm_template biçimleri), VRF girintisi.
    const af = nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65563', baf_safi: 'unicast', baf_vrf: 'site-1',
        baf_net4: '192.0.2.0/24', baf_net_rm: 'rmap1', baf_red_proto: 'ospf', baf_red_id: '100', baf_red_rm: 'rmap2', baf_mp: '8',
        baf_dist_e: '20', baf_dist_i: '100', baf_dist_l: '200', baf_damp: true });
    assert.ok(af.includes('router bgp 65563\n  vrf site-1\n    address-family ipv4 unicast\n      network 192.0.2.0/24 route-map rmap1\n      redistribute ospf 100 route-map rmap2\n      maximum-paths 8\n      distance 20 100 200\n      dampening\n'));
    const evpnAf = nxGen('bgpAddressFamily')({ _cgtype: 'l2vpn', baf_as: '65000', baf_safi: 'evpn', baf_mp: '2', baf_net4: '192.0.2.0/24' });
    assert.ok(evpnAf.includes('  address-family l2vpn evpn\n    maximum-paths 2\n') && !evpnAf.includes('network'), 'l2vpn evpn altında IPv4 network yazılmamalı');
    const ls = nxGen('bgpAddressFamily')({ _cgtype: 'link-state', baf_as: '65000', baf_safi: '' });
    assert.ok(ls.includes('  address-family link-state\n'));
    // Olumsuz / koşullu.
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'l2vpn', baf_as: '65000', baf_safi: 'unicast' }), '  address-family', 'l2vpn unicast reddedilmeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'vpnv4', baf_as: '65000', baf_safi: 'unicast', baf_vrf: 'A' }), '  address-family', 'VRF altında vpnv4 reddedilmeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'link-state', baf_as: '65000', baf_safi: 'unicast' }), '  address-family', 'link-state SAFI almaz');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '', baf_safi: 'unicast' }), 'router bgp', 'AS boşken üretilmemeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_red_proto: 'ospf', baf_red_rm: 'RM' }), 'redistribute', 'ospf tag zorunlu');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_red_proto: 'static', baf_red_rm: '' }), 'redistribute', 'route-map zorunlu');
    assert.ok(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_red_proto: 'static', baf_red_rm: 'RM' }).includes('redistribute static route-map RM\n'));
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_dist_e: '20', baf_dist_i: '', baf_dist_l: '' }), 'distance', 'distance üç değer birlikte');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_dist_e: '0', baf_dist_i: '200', baf_dist_l: '220' }), 'distance', 'distance 0 reddedilmeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_damp: true, baf_damp_hl: '46', baf_damp_reuse: '750', baf_damp_supp: '2000', baf_damp_max: '60' }), 'dampening', 'half-life 46 reddedilmeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv6', baf_as: '65000', baf_safi: 'unicast', baf_net6: '192.0.2.0/24' }), 'network', 'IPv6 AF altında IPv4 prefix reddedilmeli');
    bad(nxGen('bgpAddressFamily')({ _cgtype: 'ipv4', baf_as: '65000', baf_safi: 'unicast', baf_adv_evpn: true }), 'advertise l2vpn', 'advertise l2vpn evpn yalnız VRF');

    // Neighbor AF: Ansible fixture biçimleri.
    const nb = nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65536', nbaf_vrf: 'site-1', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'multicast',
        nbaf_sc: 'both', nbaf_rm_in: 'rmap1', nbaf_nhs: 'all', nbaf_soft: 'always', nbaf_allowas: true, nbaf_allowas_n: '3',
        nbaf_maxp: '12', nbaf_maxp_th: '80', nbaf_maxp_act: 'warning', nbaf_ap_rx: 'disable', nbaf_inh: 'POL1', nbaf_inh_seq: '10' });
    assert.ok(nb.includes('router bgp 65536\n  vrf site-1\n    neighbor 192.0.2.1\n      address-family ipv4 multicast\n        inherit peer-policy POL1 10\n        send-community\n        send-community extended\n        route-map rmap1 in\n        next-hop-self all\n        soft-reconfiguration inbound always\n        allowas-in 3\n        maximum-prefix 12 80 warning-only\n        capability additional-paths receive disable\n'));
    const nb6 = nxGen('bgpNeighborAf')({ _cgtype: 'ipv6', nbaf_as: '65000', nbaf_nfam: 'ipv6', nbaf_nbr6: '2001:db8::2', nbaf_safi: 'unicast', nbaf_rrc: true });
    assert.ok(nb6.includes('  neighbor 2001:db8::2\n    address-family ipv6 unicast\n      route-reflector-client\n'));
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_safi: 'unicast' }), '  neighbor', 'komşusuz üretilmemeli');
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nfam: 'ipv6', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast' }), '  neighbor', 'IPv6 komşu seçiliyken IPv4 adresi kullanılmamalı');
    same(nxField('bgpNeighborAf', 'nbaf_nbr6').requiredIf, { field: 'nbaf_nfam', in: ['ipv6'] });
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast', nbaf_maxp: '300001' }), 'maximum-prefix', 'maximum-prefix 300001 reddedilmeli');
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast', nbaf_maxp: '100', nbaf_maxp_act: 'restart', nbaf_maxp_rst: '' }), 'maximum-prefix', 'restart süresi zorunlu');
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast', nbaf_maxp_th: '80' }), 'maximum-prefix', 'eşik tek başına yazılmamalı');
    bad(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast', nbaf_inh: 'POL1', nbaf_inh_seq: '' }), 'inherit', 'peer-policy sırası zorunlu');
    assert.ok(nxGen('bgpNeighborAf')({ _cgtype: 'ipv4', nbaf_as: '65000', nbaf_nbr4: '192.0.2.1', nbaf_safi: 'unicast', nbaf_dorig_rm: 'RM' }).includes('      default-originate route-map RM\n'));

    // Peer template: Ansible fixture (tmplt_2 / tmplt_3) komutları.
    const tp = nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65536', bt_name: 'tmplt_2', bt_bfd: 'set', bt_remote_as: '65534', bt_rpas: 'replace-as',
        bt_shut: true, bt_ka: '200', bt_hold: '300', bt_passive: true, bt_ttl: '10', bt_upd: 'Ethernet1/1', bt_afi: 'l2vpn', bt_safi: 'evpn', bt_af_sc: 'both' });
    assert.ok(tp.includes('router bgp 65536\n  template peer tmplt_2\n    bfd\n    remote-as 65534\n    remove-private-as replace-as\n    shutdown\n    timers 200 300\n    transport connection-mode passive\n    ttl-security hops 10\n    update-source Ethernet1/1\n    address-family l2vpn evpn\n      send-community\n      send-community extended\n'));
    const tpNoAf = nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65536', bt_name: 'tmplt_1', bt_bfd: 'singlehop', bt_desc: 'test-neighbor-template', bt_mhop: '5', bt_local_as: '65535', bt_lnc: 'disable', bt_inh_sess: 'peer_sess_1', bt_afi: '', bt_af_sc: 'both' });
    assert.ok(tpNoAf.includes('    bfd singlehop\n    description test-neighbor-template\n    ebgp-multihop 5\n    inherit peer-session peer_sess_1\n    local-as 65535\n    log-neighbor-changes disable\n') && !tpNoAf.includes('address-family') && !tpNoAf.includes('send-community'), 'AF seçilmezken AF politikası yazılmamalı');
    bad(nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65000', bt_name: 'T', bt_mhop: '2', bt_ttl: '1' }), 'template peer', 'ebgp-multihop + ttl-security birlikte reddedilmeli');
    bad(nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65000', bt_name: 'T', bt_mhop: '1' }), 'template peer', 'ebgp-multihop 1 reddedilmeli');
    bad(nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65000', bt_name: 'T', bt_ka: '10', bt_hold: '' }), 'template peer', 'timers iki değer birlikte');
    bad(nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65000', bt_name: '' }), 'template peer', 'ad boşken üretilmemeli');
    bad(nxGen('bgpTemplate')({ _cgtype: 'peer', bt_as: '65000', bt_name: 'T', bt_afi: 'l2vpn', bt_safi: 'unicast' }), 'template peer', 'template l2vpn unicast reddedilmeli');
    console.log('OK: NX-OS BGP AF / neighbor AF / peer template regresyonları geçti.');
}

// ── NX-OS IGMP / IGMP Snooping / PIM / UDLD / VRRP / VRRPv3 / VTP (Cisco parti 3) ──
// Kaynak: cisco.nxos @5645581 eski tip modüller (argument_spec, choices, komut şablonları);
// Nexus 9000 NX-OS 10.4(x) Multicast / Interfaces / Unicast Routing / Layer 2 CG sınırları.
{
    const cap = [];
    context.__capture = (schema, generateFn) => cap.push({ schema, generateFn });
    vm.runInContext('cgFormBuilder = (container, schema, generateFn) => __capture(schema, generateFn);', context);
    const nx = context.__CiscoNXOS; // parti 2 bloğunda yüklendi
    const tool = name => { cap.length = 0; nx[name].init({}); return cap[0]; };
    const G = (name, d) => tool(name).generateFn(d);
    const F = (name, f) => tool(name).schema.sections.flatMap(s => s.fields).find(x => x.name === f);
    const O = (name, f) => F(name, f).options.map(o => o.value).filter(Boolean);
    const R = (name, f) => [F(name, f).min, F(name, f).max];
    const txt = r => (typeof r === 'string' ? r : r.config);
    const bad = (r, needle, m) => assert.ok(r.warnings && r.warnings.length > 0 && !r.config.includes(needle), m);
    const has = (r, s, m) => assert.ok(typeof r === 'string' && r.includes(s), m + '\n' + txt(r));

    // Platform etiketi + korunan choices + Cisco/Ansible sınırları.
    for (const n of ['igmp', 'igmpSnooping', 'pim', 'udld', 'vrrp', 'vrrpv3', 'vtp']) assert.ok(/Nexus 9000/.test(tool(n).schema.topic.desc), n + ': platform etiketi');
    same(O('igmp', 'igi_ver'), ['2', '3', 'default']);
    same(O('pim', 'pi_bfd'), ['enable', 'disable', 'default']);
    same(O('pim', 'pm_bfd'), ['enable', 'disable']);
    same(O('pim', 'pi_nbr_type'), ['prefix', 'routemap']);
    same(O('udld', 'ud_agg'), ['enabled', 'disabled']);
    same(O('udld', 'ui_mode'), ['enabled', 'disabled', 'aggressive']);
    same(O('vrrp', 'vr_admin'), ['no shutdown', 'shutdown', 'default']);
    same(O('vtp', 'vt_ver'), ['1', '2', '3']);
    same(R('igmp', 'igi_sqi'), [1, 18000]); same(R('igmp', 'igi_sqc'), [1, 10]); same(R('igmp', 'igi_rob'), [1, 7]);
    same(R('igmp', 'igi_mrt'), [1, 25]); same(R('igmp', 'igi_lmqc'), [1, 5]); same(R('igmp', 'igi_gto'), [3, 65535]);
    same(R('pim', 'pi_dr'), [1, 4294967295]); same(R('pim', 'pi_hello'), [1000, 18724286]);
    same(R('vrrp', 'vr_grp'), [1, 255]); same(R('vrrp', 'vr_prio'), [1, 254]); same(R('vrrp', 'vr_int'), [1, 255]);
    same(R('vrrpv3', 'v3_tmr'), [100, 40950]); same(R('vrrpv3', 'v3_pdelay'), [0, 3600]);

    // IGMP — olumlu (Ansible örnek komutları), olumsuz, koşullu.
    has(G('igmp', { _cgtype: 'global', ig_flush: true, ig_rtr_alert: 'disable' }), 'ip igmp flush-routes\nno ip igmp enforce-router-alert\n', 'IGMP global');
    has(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/32', igi_ver: '3', igi_sqc: '10', igi_oif_grp: '233.252.0.6', igi_oif_src: '192.0.2.1' }),
        'interface Ethernet1/32\n  ip igmp version 3\n  ip igmp startup-query-count 10\n  ip igmp static-oif 233.252.0.6 source 192.0.2.1\n', 'IGMP arayüz');
    bad(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_rob: '8' }), 'interface', 'robustness 8 reddedilmeli');
    bad(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_gto: '2' }), 'interface', 'group-timeout 2 reddedilmeli');
    bad(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_mrt: '20', igi_qi: '20' }), 'interface', 'MRT < query-interval');
    bad(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_oif_grp: '233.252.0.6', igi_oif_rm: 'RM' }), 'static-oif', 'static-oif grup + route-map dışlar');
    bad(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_oif_grp: '192.0.2.5' }), 'static-oif', 'unicast grup reddedilmeli');
    bad(G('igmp', { _cgtype: 'interface', igi_if: '' }), 'interface', 'arayüzsüz üretilmemeli');
    has(G('igmp', { _cgtype: 'interface', igi_if: 'Ethernet1/1', igi_oif_grp: '233.252.0.6', igi_oif_src: '192.0.2.1' }), 'yalnız IGMPv3', '(S,G) v2 notu');
    bad(G('igmp', { _cgtype: 'global' }), 'ip igmp', 'boş global');

    // IGMP snooping.
    has(G('igmpSnooping', { sn_state: 'enable', sn_gto: '50', sn_llg: 'enable', sn_rs: 'disable', sn_v3rs: 'disable' }),
        'ip igmp snooping\nip igmp snooping group-timeout 50\nip igmp snooping link-local-groups-suppression\nno ip igmp snooping report-suppression\nno ip igmp snooping v3-report-suppression\n', 'snooping global');
    has(G('igmpSnooping', { sn_state: 'enable', sn_gto: 'never', sn_vlan: '10', sn_querier: '192.0.2.1', sn_fl: true }), 'vlan configuration 10\n  ip igmp snooping querier 192.0.2.1\n  ip igmp snooping fast-leave\n', 'snooping VLAN');
    bad(G('igmpSnooping', { sn_state: 'disable', sn_gto: '50' }), 'group-timeout', 'kapalıyken group-timeout reddedilmeli');
    bad(G('igmpSnooping', { sn_state: 'enable', sn_gto: '10081' }), 'group-timeout', 'group-timeout 10081 reddedilmeli');
    bad(G('igmpSnooping', { sn_state: 'enable', sn_querier: '192.0.2.1' }), 'querier', 'VLAN olmadan querier reddedilmeli');

    // PIM.
    has(G('pim', { _cgtype: 'global', pm_rp: '192.0.2.100', pm_rp_grp: '233.252.0.0/24', pm_rp_bidir: true, pm_ssm: '232.0.0.0/8, 233.252.1.0/24', pm_bfd: 'enable' }),
        'ip pim rp-address 192.0.2.100 group-list 233.252.0.0/24 bidir\nip pim ssm range 232.0.0.0/8 233.252.1.0/24\nip pim bfd\n', 'PIM global');
    has(G('pim', { _cgtype: 'global', pm_ssm: 'none' }), 'ip pim ssm range none\n', 'ssm none');
    bad(G('pim', { _cgtype: 'global', pm_rp: '192.0.2.100', pm_rp_grp: '233.252.0.0/24', pm_rp_rm: 'RM' }), 'rp-address', 'group-list + route-map dışlar');
    bad(G('pim', { _cgtype: 'global', pm_rp: '233.252.0.1' }), 'rp-address', 'multicast RP reddedilmeli');
    bad(G('pim', { _cgtype: 'global', pm_ssm: '192.0.2.0/24' }), 'ssm range', 'unicast SSM reddedilmeli');
    bad(G('pim', { _cgtype: 'global', pm_rp_pl: 'PL' }), 'rp-address', 'RP olmadan prefix-list reddedilmeli');
    has(G('pim', { _cgtype: 'interface', pi_if: 'Ethernet1/32', pi_sparse: true, pi_dr: '10', pi_hello: '40000', pi_border: true, pi_bfd: 'disable',
        pi_nbr: 'test', pi_nbr_type: 'prefix', pi_jp_in: 'JPIN', pi_jp_in_type: 'routemap', pi_jp_out: 'JPOUT', pi_jp_out_type: 'prefix' }),
        '  ip pim sparse-mode\n  ip pim dr-priority 10\n  ip pim hello-interval 40000\n  ip pim border\n  ip pim bfd-instance disable\n  ip pim neighbor-policy prefix-list test\n  ip pim jp-policy JPIN in\n  ip pim jp-policy prefix-list JPOUT out\n', 'PIM arayüz');
    bad(G('pim', { _cgtype: 'interface', pi_if: 'Ethernet1/1', pi_hello: '999' }), 'interface', 'hello 999 ms reddedilmeli');
    bad(G('pim', { _cgtype: 'interface', pi_if: 'Ethernet1/1', pi_dr: '0' }), 'interface', 'dr-priority 0 reddedilmeli');

    // UDLD.
    has(G('udld', { _cgtype: 'global', ud_agg: 'enabled', ud_msg: '40' }), 'feature udld\nudld aggressive\nudld message-time 40\n', 'UDLD global');
    has(G('udld', { _cgtype: 'interface', ui_if: 'Ethernet1/1', ui_mode: 'disabled' }), 'interface Ethernet1/1\n  udld disable\n', 'UDLD arayüz');
    has(G('udld', { _cgtype: 'interface', ui_if: 'Ethernet1/1', ui_mode: 'aggressive' }), 'noktadan noktaya', 'aggressive notu');
    bad(G('udld', { _cgtype: 'global', ud_msg: '0' }), 'message-time', 'message-time 0 reddedilmeli');
    bad(G('udld', { _cgtype: 'interface', ui_if: '' }), 'interface', 'arayüzsüz UDLD');

    // VRRP (Ansible örneği: vlan10, grup 150, 10.1.15.1 → güvenli adres).
    has(G('vrrp', { vr_if: 'Vlan10', vr_grp: '150', vr_vip: '192.0.2.1', vr_prio: '110', vr_int: '1', vr_preempt: 'disable', vr_auth: true, vr_admin: 'no shutdown' }),
        'interface Vlan10\n  vrrp 150\n    shutdown\n    address 192.0.2.1\n    priority 110\n    advertisement-interval 1\n    no preempt\n    authentication text <VRRP-PAROLA>\n    no shutdown\n', 'VRRP');
    bad(G('vrrp', { vr_if: 'Vlan10', vr_grp: '256', vr_vip: '192.0.2.1' }), 'vrrp ', 'grup 256 reddedilmeli');
    bad(G('vrrp', { vr_if: 'Vlan10', vr_grp: '1', vr_prio: '255' }), 'vrrp ', 'priority 255 reddedilmeli');
    bad(G('vrrp', { vr_if: 'Vlan10', vr_grp: '1', vr_int: '256' }), 'vrrp ', 'interval 256 reddedilmeli');
    bad(G('vrrp', { vr_if: 'mgmt0', vr_grp: '1', vr_vip: '192.0.2.1' }), 'vrrp ', 'mgmt reddedilmeli');
    bad(G('vrrp', { vr_if: 'Vlan10', vr_ifip: '192.0.2.2/24', vr_grp: '1', vr_vip: '198.51.100.1' }), 'vrrp ', 'VIP farklı alt ağ');
    bad(G('vrrp', { vr_if: 'Vlan10', vr_ifip: '192.0.2.1/24', vr_grp: '1', vr_vip: '192.0.2.1', vr_prio: '120' }), 'vrrp ', 'adres sahibi priority');
    assert.ok(!txt(G('vrrp', { vr_if: 'Vlan10', vr_grp: '1', vr_vip: '192.0.2.1' })).includes('PAROLA'), 'auth seçilmezse parola satırı yok');

    // VRRPv3 (yalnız Cisco belgesi).
    has(G('vrrpv3', { _cgtype: 'ipv4', v3_if: 'Vlan20', v3_grp: '20', v3_a4: '198.51.100.1', v3_s4: '198.51.100.254', v3_prio: '110', v3_tmr: '1000', v3_preempt: true, v3_pdelay: '30', v3_track: '5', v3_dec: '20', v3_v2: true, v3_shut: 'no shutdown' }),
        '  vrrpv3 20 address-family ipv4\n    address 198.51.100.1 primary\n    address 198.51.100.254 secondary\n    priority 110\n    timers advertise 1000\n    preempt delay minimum 30\n    track 5 decrement 20\n    vrrp2\n    no shutdown\n', 'VRRPv3 v4');
    has(G('vrrpv3', { _cgtype: 'ipv6', v3_if: 'Vlan20', v3_grp: '20', v3_a6: '2001:db8:20::1' }), 'address-family ipv6\n    address 2001:db8:20::1 primary\n', 'VRRPv3 v6');
    bad(G('vrrpv3', { _cgtype: 'ipv4', v3_if: 'Vlan20', v3_grp: '20', v3_a4: '198.51.100.1', v3_tmr: '99' }), 'vrrpv3 ', 'timer 99 ms reddedilmeli');
    bad(G('vrrpv3', { _cgtype: 'ipv4', v3_if: 'Vlan20', v3_grp: '20', v3_a4: '198.51.100.1', v3_pdelay: '10' }), 'vrrpv3 ', 'preempt yokken delay reddedilmeli');
    bad(G('vrrpv3', { _cgtype: 'ipv4', v3_if: 'Vlan20', v3_grp: '20', v3_a4: '198.51.100.1', v3_dec: '10' }), 'vrrpv3 ', 'track yokken decrement reddedilmeli');
    bad(G('vrrpv3', { _cgtype: 'ipv6', v3_if: 'Vlan20', v3_grp: '20', v3_a6: '2001:db8::1', v3_v2: true }), 'vrrpv3 ', 'IPv6 + vrrp2 reddedilmeli');
    bad(G('vrrpv3', { _cgtype: 'ipv4', v3_if: 'Vlan20', v3_grp: '20', v3_a4: '' }), 'vrrpv3 ', 'adres zorunlu');

    // VTP (parola gizli veri: yer tutucu).
    has(G('vtp', { vt_domain: 'LAB-DOMAIN', vt_ver: '2', vt_pass: true }), 'feature vtp\nvtp domain LAB-DOMAIN\nvtp version 2\nvtp password <VTP-PAROLA>\n', 'VTP');
    bad(G('vtp', { vt_domain: 'LAB', vt_ver: '3' }), 'vtp domain', 'N9K v3 reddedilmeli');
    bad(G('vtp', { vt_domain: '' }), 'vtp domain', 'domain zorunlu');
    bad(G('vtp', { vt_domain: 'LAB', vt_file: 'bad file' }), 'vtp domain', 'boşluklu dosya reddedilmeli');
    console.log('OK: NX-OS IGMP / snooping / PIM / UDLD / VRRP / VRRPv3 / VTP regresyonları geçti.');
}
