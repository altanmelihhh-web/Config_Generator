'use strict';

// Dört Cisco ürün ailesinin kayıt ve form şeması bütünlüğünü birlikte denetler.
// Ürün-komut semantiği için aile bazındaki kaynaklı regresyon testleri ayrıca eklenir.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = {
    console,
    CC_WRITERS: {},
    setTimeout() {}, clearTimeout() {},
    window: { addEventListener() {}, scrollTo() {} },
    location: { hash: '' }, history: { replaceState() {} },
    document: {
        getElementById() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, body: { classList: { contains() { return false; } } }
    }
};
vm.createContext(context);

function source(file) {
    return fs.readFileSync(path.join(root, file), 'utf8');
}

vm.runInContext(source('assets/js/ConfigGeneratorManagement.js') +
    '\nthis.__validators = CG_VALIDATORS; this.__registry = CG_REGISTRY;', context);

const families = [
    { id: 'cisco-ios', file: 'assets/js/ConfigGenerators_Cisco.js', symbol: 'CiscoIOS', expected: 49,
      // Cisco parti 1 araçları: registry satırları yöneticiye istek olarak iletildi
      // (ConfigGeneratorManagement.js başka iş kolunda). Kayda girince bu liste boşaltılır.
      pendingRegistry: [] },
    { id: 'cisco-ftd', file: 'assets/js/ConfigGenerators_FTD.js', symbol: 'CiscoFTD', expected: 14 },
    { id: 'cisco-nxos', file: 'assets/js/ConfigGenerators_NX-OS.js', symbol: 'CiscoNXOS', expected: 37,
      // Cisco parti 2 araçları: registry satırları yönetici onayında (scratchpad/cisco-p2-registry.txt).
      pendingRegistry: [] },
    { id: 'cisco-asa', file: 'assets/js/ConfigGenerators_ASA.js', symbol: 'CiscoASA', expected: 21 },
];

const audit = {};
const familyRuntime = {};
for (const family of families) {
    const captured = [];
    context.__capture = (schema, generateFn) => captured.push({ schema, generateFn });
    vm.runInContext('cgFormBuilder = (container, schema, generateFn) => __capture(schema, generateFn);', context);
    vm.runInContext(source(family.file) + `\nthis.__currentFamily = ${family.symbol};`, context,
        { filename: family.file });

    const generators = context.__currentFamily;
    const registryTypes = context.__registry[family.id].types;
    Object.values(generators).forEach(generator => generator.init({}));

    assert.strictEqual(Object.keys(generators).length, family.expected,
        `${family.id}: generator sayısı değişti`);
    // Her generator kayıtlı olmalı; yalnız pendingRegistry'deki yeni araçlar geçici olarak kayıtsız olabilir.
    const registered = new Set(registryTypes.map(t => { try { return t.gen(); } catch (e) { return null; } }));
    const unregistered = Object.keys(generators).filter(k => !registered.has(generators[k]));
    const pending = family.pendingRegistry || [];
    assert.deepStrictEqual(unregistered.filter(k => !pending.includes(k)), [],
        `${family.id}: kayıtsız generator var`);
    assert.strictEqual(registryTypes.length, family.expected - unregistered.length,
        `${family.id}: kayıt sayısı generator sayısıyla aynı olmalı`);
    if (unregistered.length) console.log(`BEKLEYEN KAYIT (${family.id}): ${unregistered.join(', ')}`);
    assert.strictEqual(captured.length, family.expected,
        `${family.id}: her generator bir form şeması üretmeli`);

    const unknownValidators = [];
    const unconstrainedRequired = [];
    for (let i = 0; i < captured.length; i++) {
        const generatorName = Object.keys(generators)[i];
        const fields = (captured[i].schema.sections || []).flatMap(section => section.fields || []);
        for (const field of fields) {
            if (field.validate && !context.__validators[field.validate]) {
                unknownValidators.push(`${generatorName}.${field.name}:${field.validate}`);
            }
            if ((field.required || field.requiredIf) &&
                !['select', 'checkbox', 'hidden', 'password', 'textarea'].includes(field.type) &&
                !field.validate && field.min === undefined && field.max === undefined) {
                unconstrainedRequired.push(`${generatorName}.${field.name}`);
            }
        }
    }
    assert.deepStrictEqual(unknownValidators, [], `${family.id}: bilinmeyen validator var`);
    audit[family.id] = { count: captured.length, unconstrainedRequired };
    familyRuntime[family.id] = { generators, captured };
}

assert.strictEqual(families.reduce((sum, family) => sum + family.expected, 0), 121);

assert.strictEqual(context.__validators.ipv6.fn('2001:db8::1'), true);
assert.strictEqual(context.__validators.ipv6.fn('2001:db8:::1'), false);
assert.strictEqual(context.__validators.ipv6_cidr.fn('2001:db8::/32'), true);
assert.strictEqual(context.__validators.ipv6_cidr.fn('2001:db8::/129'), false);

const nx = familyRuntime['cisco-nxos'];
const nxPrefix = nx.captured[Object.keys(nx.generators).indexOf('prefixList')];
const validPrefix = nxPrefix.generateFn({
    _cgtype: 'ipv4', pl_name: 'ALLOW-PREFIX', pl_seq: '10', pl_action: 'permit',
    pl_v4: '192.0.2.0/24', pl_match: 'range', pl_ge: '25', pl_le: '32'
});
assert.ok(String(validPrefix).includes('ip prefix-list ALLOW-PREFIX seq 10 permit 192.0.2.0/24 ge 25 le 32'));
const invalidPrefix = nxPrefix.generateFn({
    _cgtype: 'ipv6', pl_name: 'ALLOW-V6', pl_seq: '10', pl_action: 'permit',
    pl_v6: '2001:db8::/32', pl_match: 'eq', pl_eq: '16', pl_ge: '48'
});
assert.ok(invalidPrefix.warnings.length > 0, 'NX-OS prefix-list eq temel prefiksten küçük olamaz');
assert.ok(!invalidPrefix.config.includes('seq 10 permit'), 'Geçersiz NX-OS prefix-list satırı üretilmemeli');
// eq ve ge/le ayrı eşleşme modlarıdır: seçilmeyen moddaki değer satıra girmez.
const exactPrefix = nxPrefix.generateFn({
    _cgtype: 'ipv6', pl_name: 'ALLOW-V6', pl_seq: '10', pl_action: 'permit',
    pl_v6: '2001:db8::/32', pl_match: 'exact', pl_eq: '64', pl_ge: '48'
});
assert.ok(String(exactPrefix).includes('ipv6 prefix-list ALLOW-V6 seq 10 permit 2001:db8::/32\n'));
const eqPrefix = nxPrefix.generateFn({
    _cgtype: 'ipv6', pl_name: 'ALLOW-V6', pl_seq: '10', pl_action: 'permit',
    pl_v6: '2001:db8::/32', pl_match: 'eq', pl_eq: '64', pl_ge: '48'
});
assert.ok(String(eqPrefix).includes('seq 10 permit 2001:db8::/32 eq 64\n'));
const emptyRange = nxPrefix.generateFn({
    _cgtype: 'ipv4', pl_name: 'P', pl_seq: '10', pl_action: 'permit', pl_v4: '192.0.2.0/24', pl_match: 'range'
});
assert.ok(emptyRange.warnings.length > 0 && !emptyRange.config.includes('seq 10'), 'ge/le modunda değer yoksa satır üretilmemeli');

const nxBfd = nx.captured[Object.keys(nx.generators).indexOf('bfd')];
const bfdGlobal = nxBfd.generateFn({
    _cgtype: 'global', bfd_tx: '50', bfd_rx: '50', bfd_mult: '3',
    bfd_slow: '2000', bfd_echo_if: 'loopback1'
});
assert.ok(bfdGlobal.includes('bfd interval 50 min_rx 50 multiplier 3'));
assert.ok(bfdGlobal.indexOf('bfd echo-interface loopback1') > bfdGlobal.indexOf('bfd slow-timer 2000'),
    'Ansible fixture davranışı gereği echo-interface en son yazılmalı');
const bfdIface = nxBfd.generateFn({
    _cgtype: 'interface', bfd_tx: '100', bfd_rx: '100', bfd_mult: '5',
    bfd_ifaces: 'Ethernet1/1', bfd_enable: true, bfd_echo: false
});
assert.ok(bfdIface.includes('interface Ethernet1/1\n  bfd\n  no bfd echo\n  bfd interval 100 min_rx 100 multiplier 5'));

assert.strictEqual(context.__validators.nxos_process_tag.re.test('201'), true);
assert.strictEqual(context.__validators.nxos_process_tag.re.test('COREv3'), true);
assert.strictEqual(context.__validators.nxos_process_tag.re.test('CORE-v3'), false);
const nxOspfv3 = nx.captured[Object.keys(nx.generators).indexOf('ospfv3')];
const ospfv3 = nxOspfv3.generateFn({
    o3_tag: '201', o3_rid: '192.0.2.1', o3_area: '0.0.0.10', o3_area_type: 'stub',
    o3_no_summary: true, o3_log_detail: true, o3_distance: '110', o3_max_paths: '4',
    o3_range: '2001:db8::/32', o3_range_cost: '25', o3_iface: 'Ethernet1/2',
    o3_ipv6: '2001:db8:10::1/64', o3_network: 'point-to-point', o3_cost: '25',
    o3_hello: '10', o3_dead: '40', o3_instance: '0', o3_priority: '1'
});
assert.ok(ospfv3.includes('feature ospfv3\n\nrouter ospfv3 201'));
assert.ok(ospfv3.includes('address-family ipv6 unicast'));
assert.ok(ospfv3.includes('ipv6 router ospfv3 201 area 0.0.0.10'));
assert.ok(ospfv3.includes('ospfv3 instance 0'), 'Sıfır geçerli instance ID olarak atlanmamalı');

assert.strictEqual(context.__validators.uint32_delta.fn('+100'), true);
assert.strictEqual(context.__validators.uint32_delta.fn('-4294967296'), false);
assert.strictEqual(context.__validators.bgp_community_list.fn('65000:100 no-export'), true);
assert.strictEqual(context.__validators.bgp_community_list.fn('65000:not-a-number'), false);
const nxRouteMap = nx.captured[Object.keys(nx.generators).indexOf('routeMap')];
const routeMap = nxRouteMap.generateFn({
    _cgtype: 'ipv4-prefix', rm_name: 'RM-BGP-IN', rm_action: 'permit', rm_seq: '10',
    rm_v4_pl: 'ALLOW-PREFIX BACKUP-PREFIX', rm_local_pref: '0', rm_metric: '+100',
    rm_weight: '0', rm_community: '65000:100 no-export', rm_additive: true
});
assert.ok(routeMap.includes('match ip address prefix-list ALLOW-PREFIX BACKUP-PREFIX'));
assert.ok(routeMap.includes('set local-preference 0'), 'Sıfır local-preference atlanmamalı');
assert.ok(routeMap.includes('set weight 0'), 'Sıfır weight atlanmamalı');
assert.ok(routeMap.includes('set community 65000:100 no-export additive'));

assert.strictEqual(context.__validators.telemetry_id.re.test('group-1'), false);
assert.strictEqual(context.__validators.single_cli_line.fn('sys/intf\nfeature bash-shell'), false);
assert.strictEqual(context.__validators.uint32.fn('0'), true);
const nxTelemetry = nx.captured[Object.keys(nx.generators).indexOf('telemetry')];
const telemetry = nxTelemetry.generateFn({
    tm_dst_id: '100', tm_ip: '192.0.2.50', tm_port: '50051', tm_protocol: 'gRPC',
    tm_encoding: 'GPB', tm_vrf: 'management', tm_source_type: 'NX-API',
    tm_sensor_id: '200', tm_path: 'show bgp l2vpn evpn summary', tm_depth: '0',
    tm_sub_id: '300', tm_interval: '0'
});
assert.ok(telemetry.includes('feature telemetry\nfeature nxapi'));
assert.ok(telemetry.includes('path &quot;show bgp l2vpn evpn summary&quot; depth 0'));
assert.ok(telemetry.includes('snsr-grp 200 sample-interval 0'), 'Event-based interval 0 korunmalı');

const nxapiGen = nx.captured[Object.keys(nx.generators).indexOf('nxapi')];
const nxapiSecure = nxapiGen.generateFn({
    _cgtype: 'enable', na_http: false, na_https: true, na_https_port: '443',
    na_vrf: 'management', na_strong: true, na_tls12: true, na_tls13: false
});
assert.ok(nxapiSecure.includes('no nxapi http'));
assert.ok(nxapiSecure.includes('nxapi https port 443'));
assert.ok(nxapiSecure.includes('no nxapi ssl ciphers weak'));
assert.ok(nxapiSecure.includes('nxapi ssl protocols TLSv1.2'));
const nxapiNoTransport = nxapiGen.generateFn({ _cgtype: 'enable', na_http: false, na_https: false });
assert.ok(nxapiNoTransport.warnings.length > 0, 'Tüm NX-API transportları kapalıysa uyarı verilmeli');
const nxapiDisabled = nxapiGen.generateFn({ _cgtype: 'disable' });
assert.ok(nxapiDisabled.includes('no feature nxapi'));

console.log(JSON.stringify(audit, null, 2));
console.log('OK: Cisco aile envanteri 49 IOS + 14 FTD + 37 NX-OS + 21 ASA = 121.');
