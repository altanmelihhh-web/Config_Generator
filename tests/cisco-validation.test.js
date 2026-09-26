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

assert.strictEqual(Object.keys(generators).length, 45, 'Cisco IOS generator sayısı beklenmedik biçimde değişti');
assert.strictEqual(captured.length, 45, 'Her Cisco IOS generator cgFormBuilder kullanmalı');

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

console.log(`OK: ${captured.length} Cisco IOS generator şeması ve kritik validator regresyonları geçti.`);
