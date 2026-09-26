'use strict';

// Cisco ASA mevcut araçlarının zorunlu alan doğrulaması (Cisco parti 4).
// Kaynaklar: ansible-collections/cisco.asa @c467f33a84d0 argspec (asa_acls
// kaynak/hedef biçimleri, asa_objects/asa_ogs ad ve port alanları) ve Cisco ASA
// 9.x CLI yapılandırma kılavuzları / komut başvurusu. Üretilen CLI değişmez;
// yalnız geçersiz girdiler form hattında boşaltılır (config'e girmez).
const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.resolve(__dirname, '..');
const captured = [];
const context = {
    console,
    setTimeout() {}, clearTimeout() {},
    window: { addEventListener() {}, scrollTo() {} },
    location: { hash: '' }, history: { replaceState() {} },
    document: {
        getElementById() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
        addEventListener() {}, body: { classList: { contains() { return false; } } }
    },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ConfigGeneratorManagement.js'), 'utf8'), context);
context.__capture = (schema, generateFn) => captured.push({ schema, generateFn });
vm.runInContext('cgFormBuilder = (c, schema, fn) => __capture(schema, fn);', context);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/js/ConfigGenerators_ASA.js'), 'utf8') +
    '\nthis.__A = CiscoASA; this.__V = CG_VALIDATORS; this.__W = CG_WHY; this.__R = CG_RULES; this.__RV = cgRangeValidator;', context);

const A = context.__A, V = context.__V, W = context.__W, R = context.__R;
const tools = {};
for (const id of Object.keys(A)) { const n = captured.length; A[id].init({}); tools[id] = captured[n]; }
assert.strictEqual(Object.keys(tools).length, 21, 'ASA araç sayısı değişmemeli');

const fieldsOf = (t, ty) => (t.schema.sections || []).filter(s => !(s.showFor && ty && !s.showFor.includes(ty))).flatMap(s => s.fields || []);
const vtypeOf = f => f.validate || ((f.min !== undefined || f.max !== undefined) ? context.__RV(f.min, f.max) : '');
const pass = (vt, x) => { const v = V[vt]; return v.re ? v.re.test(x) : v.fn(x); };

// 1. Her zorunlu/koşullu-zorunlu metin alanı doğrulayıcılı; placeholder kendi doğrulayıcısından geçer.
const freeForm = new Set(['localUsers.priv_cmd']); // ASA komut ağacındaki ad; biçim komuta bağlı
for (const [id, t] of Object.entries(tools)) {
    for (const f of fieldsOf(t, '')) {
        if (!f.name || ['select', 'checkbox', 'hidden'].includes(f.type)) continue;
        const vt = vtypeOf(f);
        if ((f.required || f.requiredIf) && !freeForm.has(id + '.' + f.name)) assert.ok(vt, `${id}.${f.name}: zorunlu alan doğrulayıcısız`);
        if (vt) {
            assert.ok(V[vt], `${id}.${f.name}: bilinmeyen doğrulayıcı ${vt}`);
            if (f.placeholder) assert.ok(pass(vt, f.placeholder.trim()), `${id}.${f.name}: placeholder "${f.placeholder}" kendi doğrulayıcısından geçmiyor`);
        }
    }
}

// 2. Yeni ASA doğrulayıcıları: kural metni + sebep üreteci + olumlu/olumsuz örnek.
const cases = {
    asa_objname: [['OBJ-WEB', 'LAN_NET', 'srv.1', 'A(1){x}', 'x'.repeat(64)], ['my obj', 'x'.repeat(65), 'a/b', 'a,b', 'a"b']],
    asa_acl_name: [['OUTSIDE_IN', 'x'.repeat(241)], ['OUT IN', 'x'.repeat(242), 'a"b']],
    asa_acl_addr: [['any', 'any4', 'any6', 'host 192.0.2.10', '192.0.2.0 255.255.255.0', '2001:db8::/32', 'object WEB', 'object-group GRP-A', 'interface outside'],
        ['sanane', '192.0.2.0', '192.0.2.0/24', 'host 999.1.1.1', 'host 2001:db8::1', 'object my obj', 'interface 1out', '192.0.2.0 255.255.255.0 x', '2001:db8::/129']],
    asa_mpf_name: [['INSPECT_HTTP', 'x'.repeat(40)], ['x'.repeat(41), 'MY MAP']],
    asa_psk: [['MyS3cr3tKey!', 'x'.repeat(128)], ['x'.repeat(129), 'my key']],
    asa_radius_key: [['radius_secret', 'x'.repeat(64)], ['x'.repeat(65), 'my key']],
    asa_failover_key: [['FoSecretKey123', 'x'.repeat(63), 'hex 0123456789abcdef0123456789ABCDEF'], ['x'.repeat(64), 'my key', 'hex 0123', 'hex zz23456789abcdef0123456789abcdef']],
    asa_name64: [['GP-REMOTE', 'x'.repeat(64)], ['x'.repeat(65), 'Sales Group']],
    asa_token: [['REMOTE-VPN', 'Corporate-VPN', 'anyconnect-win-4.10.pkg'], ['Corporate VPN', 'a"b']],
    asa_ldap_dn: [['DC=corp,DC=local', 'OU=Users, DC=example,DC=com'], ['corp.local', 'DC=corp,,DC=local', 'DC=']],
    asa_snmp_user: [['snmpmon', 'a' + 'x'.repeat(31)], ['1user', 'a' + 'x'.repeat(32), 'snmp mon']],
    asa_snmp_community: [['Ro-Str0ng-C0mm', 'x'.repeat(32)], ['x'.repeat(33), 'my comm']],
    asa_user_pw: [['Str0ngPassw0rd2026', 'P@ss-w0rd!', 'x'.repeat(64)], ['x'.repeat(65), 'my pass', 'şifre1']],
    asa_port_list: [['www https 8080', 'domain 0 65535', 'SSH'], ['70000', 'www,https', 'foo', '']],
    asa_ntp_key: [['NtpKey2026', 'x'.repeat(32)], ['x'.repeat(33), 'ntp key']],
    // ASA OSPF 'network <ip> <mask> area': subnet maskesi (ASA 9.18/9.20 CLI kılavuzu, OSPF: network 10.0.0.0 255.0.0.0 area 0)
    asa_ospf_mask: [['255.255.255.0', '255.0.0.0', '255.255.255.252', '255.255.255.255', '0.0.0.0'], ['0.0.0.255', '0.0.255.255', '0.0.0.3', '255.0.255.0', '256.0.0.0', '24']],
};
for (const [vt, [good, bad]] of Object.entries(cases)) {
    assert.ok(V[vt] && W[vt] && R[vt], `${vt}: doğrulayıcı/sebep/kural eksik`);
    for (const x of good) { assert.ok(pass(vt, x), `${vt} "${x}" kabul edilmeli`); assert.strictEqual(W[vt](x), '', `${vt} "${x}" sebepsiz olmalı`); }
    for (const x of bad) {
        assert.ok(!pass(vt, x), `${vt} "${x}" reddedilmeli`);
        if (x) assert.ok(W[vt](x), `${vt} "${x}" için sebep üretilmeli`);
    }
}
// Güvenlik seviyesi: Cisco "An integer between 0 (lowest) and 100 (highest)".
const secVt = vtypeOf(fieldsOf(tools.interface, '').find(f => f.name === 'out_sec'));
for (const x of ['0', '50', '100']) assert.ok(pass(secVt, x), 'security-level ' + x);
for (const x of ['-1', '101', 'high', '1.5']) assert.ok(!pass(secVt, x), 'security-level ' + x + ' reddedilmeli');
// Ortak doğrulayıcıların anlamı değişmedi.
assert.ok(V.nameif.re.test('outside') && !V.nameif.re.test('x'.repeat(49)), 'nameif 48 karakter sınırı');
assert.ok(V.subnet.fn('255.255.255.0') && !V.subnet.fn('255.0.255.0'), 'subnet anlamı korunmalı');
assert.ok(V.wildcard.re.test('0.0.0.255') && V.wildcard_mask.fn('0.0.0.255') && !V.wildcard_mask.fn('255.255.255.0'), 'IOS wildcard doğrulayıcılarının anlamı korunmalı');
// Wildcard girilince açık uyarı: ASA subnet maskesi ister + karşılığı.
assert.ok(/ASA subnet maskesi ister, ör\. 255\.255\.255\.0/.test(W.asa_ospf_mask('0.0.0.255')) && W.asa_ospf_mask('0.0.0.255').includes('255.255.255.0'), 'wildcard uyarısı');
assert.ok(W.asa_ospf_mask('0.0.0.3').includes('255.255.255.252'), 'wildcard karşılığı');
assert.ok(!/wildcard/.test(W.asa_ospf_mask('255.0.255.0')), 'dağınık maske wildcard sayılmamalı');

// 3. Form hattı: geçersiz değer boşaltılır, geçerli değer aynen geçer.
function run(id, ty, over) {
    const t = tools[id], data = { _cgtype: ty, _configType: ty };
    for (const f of fieldsOf(t, ty)) {
        if (!f.name) continue;
        if (f.type === 'checkbox') { data[f.name] = !!f.checked; continue; }
        if (f.type === 'select') { const o = (f.options || []).find(o => o.selected) || (f.options || [])[0]; data[f.name] = o ? (o.value !== undefined ? o.value : o.v) : ''; continue; }
        data[f.name] = f.required || f.requiredIf ? (f.placeholder || '') : (f.value || '');
    }
    Object.assign(data, over);
    const invalid = [];
    for (const f of fieldsOf(t, ty)) {
        const vt = vtypeOf(f); if (!vt) continue;
        const raw = String(data[f.name] == null ? '' : data[f.name]).trim();
        if (raw && !pass(vt, raw)) { invalid.push(f.name); data[f.name] = ''; }
    }
    const out = t.generateFn(data);
    return { cli: typeof out === 'object' ? String(out.config || '') : String(out), invalid };
}
// Geçerli girdi: birebir beklenen CLI (üretici değişmedi).
const ifc = run('interface', '', { out_nameif: 'wan', out_sec: '5', out_ip: '198.51.100.2', out_mask: '255.255.255.252', in_nameif: 'lan-1', in_sec: '90', in_ip: '192.0.2.1' });
assert.deepStrictEqual(ifc.invalid, []);
assert.ok(ifc.cli.includes('interface GigabitEthernet0/0\n nameif wan\n security-level 5\n ip address 198.51.100.2 255.255.255.252\n'));
assert.ok(ifc.cli.includes(' nameif lan-1\n security-level 90\n ip address 192.0.2.1 255.255.255.0\n'));
const acl = run('acl', '', { src: 'object-group GRP-SRC', dst: 'host 198.51.100.10', dst_port: 'eq 443' });
assert.deepStrictEqual(acl.invalid, []);
assert.ok(acl.cli.includes('access-list OUTSIDE_IN extended permit tcp object-group GRP-SRC host 198.51.100.10 eq 443\n'));
const nat = run('nat', 'pat', { obj_name: 'OBJ_LAN-1', pat_subnet: '192.0.2.0 255.255.255.0' });
assert.ok(nat.cli.includes('object network OBJ_LAN-1\n subnet 192.0.2.0 255.255.255.0\n nat (inside,outside) dynamic interface\n'));
const og = run('objectgroup', 'service', { svc_ports: 'https 8443 domain' });
assert.ok(og.cli.includes(' port-object eq https\n port-object eq 8443\n port-object eq domain\n'));

// Geçersiz girdi: alan işaretlenir, değer config'e girmez.
const bads = [
    ['interface', '', { out_sec: '101', in_nameif: 'in side' }, ['out_sec', 'in_nameif'], ['security-level 101', 'in side']],
    ['nat', 'pat', { obj_name: 'LAN NET', pat_inside: '1inside' }, ['obj_name', 'pat_inside'], ['LAN NET', '1inside']],
    ['acl', '', { acl_name: 'OUT IN', src: 'sanane', dst: '192.0.2.0/24' }, ['acl_name', 'src', 'dst'], ['OUT IN', 'sanane', '192.0.2.0/24']],
    ['vpn', '', { psk: 'my shared key' }, ['psk'], ['my shared key']],
    ['mpfServicePolicy', '', { class_name: 'x'.repeat(41), match_src: '10.0.0.0/8', sp_scope: 'interface', sp_iface: 'out side' }, ['class_name', 'match_src', 'sp_iface'], ['x'.repeat(41), '10.0.0.0/8', 'out side']],
    ['failoverHA', 'active-standby', { fo_key: 'hex 12' }, ['fo_key'], ['hex 12']],
    ['ospf', '', { pid: '0', area: '4294967296' }, ['pid', 'area'], ['router ospf 0', 'area 4294967296']],
    ['anyconnect', '', { tg_alias: 'Corporate VPN', gp_name: 'Sales Group' }, ['tg_alias', 'gp_name'], ['Corporate VPN', 'Sales Group']],
    ['objectgroup', 'service', { svc_ports: 'www,https' }, ['svc_ports'], ['www,https']],
    ['snmp', 'v2c', { snmp_comm: 'x'.repeat(33) }, ['snmp_comm'], ['x'.repeat(33)]],
    ['localUsers', '', { u1_pw: 'my pass' }, ['u1_pw'], ['my pass']],
    ['twiceNat', '', { tn_src_obj: 'LAN NET' }, ['tn_src_obj'], ['LAN NET']],
];
for (const [id, ty, over, expInvalid, absent] of bads) {
    const r = run(id, ty, over);
    for (const n of expInvalid) assert.ok(r.invalid.includes(n), `${id}.${n} geçersiz işaretlenmeli`);
    for (const s of absent) assert.ok(!r.cli.includes(s), `${id}: geçersiz "${s}" config'e girmemeli`);
}
// OSPF network: subnet maskesi aynen yazılır; wildcard girilirse satır üretilmez, uyarı düşer.
const ospfOk = run('ospf', '', { network: '192.0.2.0', wildcard: '255.255.255.0', area: '0' });
assert.deepStrictEqual(ospfOk.invalid, []);
assert.ok(ospfOk.cli.includes('router ospf 1\n network 192.0.2.0 255.255.255.0 area 0\n'), 'ASA OSPF network subnet maskesiyle');
for (const wc of ['0.0.0.255', '0.0.255.255']) {
    const r = run('ospf', '', { network: '192.0.2.0', wildcard: wc, area: '0' });
    assert.ok(r.invalid.includes('wildcard'), 'OSPF wildcard ' + wc + ' geçersiz işaretlenmeli');
    assert.ok(!/^ network /m.test(r.cli) && !r.cli.includes(wc + ' area'), 'OSPF wildcard ' + wc + ' ile network satırı üretilmemeli');
    assert.ok(r.cli.includes('ASA subnet maskesi ister, ör. 255.255.255.0'), 'OSPF config içinde açık uyarı');
}
const ospfField = fieldsOf(tools.ospf, '').find(f => f.name === 'wildcard');
assert.ok(ospfField.validate === 'asa_ospf_mask' && ospfField.placeholder === '255.255.255.0' && !/tersidir/.test(ospfField.why), 'OSPF maske alanı ASA\'ya uygun');
// Koşullu alan: sp_iface yalnız interface kapsamında yazılır ve nameif olmalı.
const spOk = run('mpfServicePolicy', '', { sp_scope: 'interface', sp_iface: 'outside' });
assert.ok(spOk.cli.includes('service-policy GLOBAL_POLICY interface outside\n'));

console.log('OK: Cisco ASA zorunlu alan doğrulaması (parti 4) — 21 araç, ' + Object.keys(cases).length + ' ASA doğrulayıcısı.');
