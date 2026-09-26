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

load('assets/js/ConfigGeneratorManagement.js');
load('assets/js/ConfigConverter_Writers_Common.js');
load('assets/js/ConfigConverter_Writers_Cisco.js');
vm.runInContext('cgFormBuilder = (container, schema, generateFn) => __capture(schema, generateFn);',
    Object.assign(context, { __capture: (schema, generateFn) => captured.push({ schema, generateFn }) }));
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ConfigGenerators_Cisco.js'), 'utf8') +
    '\nthis.__CiscoIOS = CiscoIOS; this.__validators = CG_VALIDATORS;', context);

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
