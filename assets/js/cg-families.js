'use strict';
// ─── Vendor aileleri: config aracı kaydı (CG_REGISTRY), CLI Lab (CgLab.VENDORS) ve komut kütüphanesi (CG_CLI_INDEX) anahtarlarını tek çatıda toplar ───
// Rotalar: #/v/<slug>[/araclar|lab|yol|komutlar[/<cli>]|sorun|arena]. Sayılar render anında hesaplanır; sabit sayı yazılmaz.
// "referans" kaydı ailesizdir (vendor bağımsız).
const CG_FAMILIES = [
    { slug: 'cisco',      name: 'Cisco',       reg: ['cisco-ios', 'cisco-nxos', 'cisco-asa', 'cisco-ftd'], lab: ['cisco-ios'],  cli: ['cisco-ios', 'cisco-asa'] },
    { slug: 'fortinet',   name: 'Fortinet',    reg: ['fortigate'],                                     lab: ['fortigate'],  cli: ['fortigate'] },
    { slug: 'paloalto',   name: 'Palo Alto',   reg: ['paloalto'],                                      lab: ['paloalto'],   cli: ['paloalto'] },
    { slug: 'checkpoint', name: 'Check Point', reg: ['checkpoint'],                                    lab: ['checkpoint'], cli: ['checkpoint'] },
    { slug: 'f5',         name: 'F5 BIG-IP',   reg: ['f5-ltm'],                                        lab: ['f5-ltm'],     cli: ['f5-ltm'], arena: true },
    { slug: 'juniper',    name: 'Juniper',     reg: ['juniper', 'juniper-mx', 'juniper-srx'],          lab: ['juniper'],    cli: ['juniper'] },
    { slug: 'huawei',     name: 'Huawei',      reg: ['huawei', 'huawei-ce', 'huawei-usg'],             lab: ['huawei'],     cli: ['huawei'] },
    { slug: 'dell',       name: 'Dell',        reg: ['dell'],                                          lab: ['dell'],       cli: ['dell'] },
    { slug: 'arista',     name: 'Arista',      reg: ['arista'],                                        lab: [],             cli: ['arista'] },
    { slug: 'citrix',     name: 'Citrix ADC',  reg: ['citrix-adc'],                                    lab: [],             cli: ['citrix-adc'] },
    { slug: 'mikrotik',   name: 'MikroTik',    reg: ['mikrotik'],                                      lab: [],             cli: ['mikrotik'] },
    { slug: 'extreme',    name: 'Extreme',     reg: ['extreme'],                                       lab: [],             cli: ['extreme'] },
];
const CG_FAMILY_BY_SLUG = Object.fromEntries(CG_FAMILIES.map(f => [f.slug, f]));

// Kayıt / lab / komut anahtarından aileyi bulur (yoksa null).
function cgFamilyOf(key) {
    return CG_FAMILIES.find(f => f.reg.includes(key) || f.lab.includes(key) || f.cli.includes(key)) || null;
}

// Aile sayıları. Lab, komut ve senaryo verisi tembel yüklendiği için yüklenmemişse null döner.
function cgFamilyCounts(slug) {
    const f = CG_FAMILY_BY_SLUG[slug];
    if (!f) return null;
    const R = typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY : {};
    const idx = (typeof window !== 'undefined' && window.CG_CLI_INDEX) || null;
    const labs = (typeof window !== 'undefined' && window.CG_LABS) || null;
    const pick = k => idx ? f.cli.reduce((a, c) => a + ((idx.find(v => v.key === c) || {})[k] || 0), 0) : null;
    return {
        tools: f.reg.reduce((a, r) => a + ((R[r] && R[r].types.length) || 0), 0),
        labs: labs ? labs.filter(l => !l.sandbox && f.lab.includes(l.vendor)).length : null,
        cmds: pick('count'),
        // Sorun giderme: CgTroubleshoot listesi yüklendiyse o (ek senaryolar ve "replaces" dahil), değilse null
        scenarios: typeof CgTroubleshoot !== 'undefined' && CgTroubleshoot._list ? CgTroubleshoot._list.filter(x => f.cli.includes(x.vendor)).length : null,
    };
}

if (typeof window !== 'undefined') Object.assign(window, { CG_FAMILIES, CG_FAMILY_BY_SLUG, cgFamilyOf, cgFamilyCounts });
if (typeof module !== 'undefined') module.exports = { CG_FAMILIES, CG_FAMILY_BY_SLUG, cgFamilyOf, cgFamilyCounts };
