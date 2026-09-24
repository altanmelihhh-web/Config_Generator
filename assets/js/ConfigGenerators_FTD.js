'use strict';

const CiscoFTD = {};

// ── Cisco FTD: Bootstrap ──────────────────────────────────────────────────────
CiscoFTD.bootstrap = {
    label: 'FTD Bootstrap',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-rocket',
                title: 'FTD Bootstrap',
                desc: 'FTD Bootstrap — ilk kurulum: management IP, hostname, DNS, NTP ve FMC kayıt konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Temel Kimlik',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'FTD-PRIMARY', hint: 'Cihaz hostname değeri' }
                    ]
                },
                {
                    title: 'Management Arayüzü',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'mgmt_ip', label: 'Management IP (CIDR)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.45.45/24', hint: 'Management0/0 IP adresi ve prefix (CIDR)' },
                        { name: 'mgmt_gw', label: 'Management Gateway', type: 'text', required: true, validate: 'ip', placeholder: '192.168.45.1', hint: 'Management ağı default gateway' }
                    ]
                },
                {
                    title: 'DNS ve NTP',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'dns', label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'DNS çözümleme için sunucu IP' },
                        { name: 'ntp', label: 'NTP Server', type: 'text', optional: true, placeholder: 'pool.ntp.org', hint: 'Zaman senkronizasyonu için NTP sunucusu' }
                    ]
                },
                {
                    title: 'FMC Kayıt',
                    icon: 'fas fa-link',
                    info: 'FMC tarafında Device > Add Device adımı ile kaydı tamamlayın. Registration key her iki tarafta eşleşmeli.',
                    fields: [
                        { name: 'fmc_ip', label: 'FMC IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.10', hint: 'Firepower Management Center IP adresi' },
                        { name: 'reg_key', label: 'Registration Key', type: 'text', required: true, placeholder: 'cisco123', hint: 'FMC ile eşleşecek kayıt anahtarı' },
                        { name: 'nat_id', label: 'NAT ID', type: 'text', optional: true, placeholder: '1234', hint: 'NAT arkasındaysa gerekli; FMC\'de de aynı değer girilmeli' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdBootGen(data);
        });
    }
};
function cgFtdBootGen(data) {
    const hostname = cgEsc(data.hostname || ''), mgmtIp = cgEsc(data.mgmt_ip || '');
    const mgmtGw = cgEsc(data.mgmt_gw || ''), dns = cgEsc(data.dns || '');
    const ntp = cgEsc(data.ntp || ''), fmcIp = cgEsc(data.fmc_ip || '');
    const regKey = cgEsc(data.reg_key || ''), natId = cgEsc(data.nat_id || '');
    const ipParts = mgmtIp.split('/');
    const ip = ipParts[0], prefix = ipParts[1] || '24';
    let c = '# ========================================\n# Cisco FTD — Bootstrap / Initial Setup\n# ========================================\n';
    c += '# Bu komutlar FTD CLI (setup wizard) veya FXOS chassis manager üzerinde çalıştırılır.\n\n';
    c += '> configure network ipv4 manual ' + ip + ' ' + prefix + ' ' + mgmtGw + '\n';
    c += '> configure network dns servers ' + dns + '\n';
    if (ntp) c += '> configure network ntp servers ' + ntp + '\n';
    c += '> configure hostname ' + hostname + '\n\n';
    c += '# FMC Registration\n';
    c += '> configure manager add ' + fmcIp + ' ' + regKey;
    if (natId) c += ' ' + natId;
    c += '\n\n';
    c += '# FMC tarafında Device > Add Device ile tamamla\n';
    c += '# Registration key ve NAT ID FMC\'de de aynı olmalı\n\n';
    c += '# Doğrulama:\n# > show managers\n# > show network\n# > show version\n';
    return c;
}

// ── Cisco FTD: Interface ──────────────────────────────────────────────────────
CiscoFTD.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'FTD Interface',
                desc: 'FTD Interface — fiziksel/logical interface, güvenlik zone atama ve IPv4/IPv6 adresi.'
            },
            sections: [
                {
                    title: 'Interface Tanımı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'iface_name', label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Fiziksel interface adı (ör: GigabitEthernet0/0)' },
                        { name: 'nameif', label: 'Logical Name (nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'Mantıksal interface adı' },
                        { name: 'mode', label: 'Mode', type: 'select', options: [
                            { value: 'routed', label: 'routed', selected: true },
                            { value: 'passive', label: 'passive' }
                        ], hint: 'Interface çalışma modu' }
                    ]
                },
                {
                    title: 'IP Adresi',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Interface IPv4 adresi' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.252', hint: 'Subnet maskesi' },
                        { name: 'mtu', label: 'MTU', type: 'text', optional: true, placeholder: '1500', hint: 'Maximum Transmission Unit (default: 1500)' }
                    ]
                },
                {
                    title: 'Security Zone',
                    icon: 'fas fa-shield-alt',
                    info: 'Security Zone ataması FMC arayüzünde Devices > Device Management > Interfaces > Edit adımından yapılır.',
                    fields: [
                        { name: 'sec_zone', label: 'Security Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'FMC\'de tanımlı security zone adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdIfaceGen(data);
        });
    }
};
function cgFtdIfaceGen(data) {
    const ifaceName = cgEsc(data.iface_name || ''), nameif = cgEsc(data.nameif || '');
    const ip = cgEsc(data.ip || ''), mask = cgEsc(data.mask || '');
    const secZone = cgEsc(data.sec_zone || ''), mode = cgEsc(data.mode || 'routed'), mtu = cgEsc(data.mtu || '');
    let c = '# ========================================\n# Cisco FTD — Interface Configuration\n# ========================================\n';
    c += '# FTD CLI (clish) — interface yapılandırması FMC veya clish üzerinden uygulanır.\n\n';
    c += '> configure interface ' + ifaceName + '\n';
    c += '>   nameif ' + nameif + '\n';
    c += '>   ip address ' + ip + ' ' + mask + '\n';
    c += '>   mode ' + mode + '\n';
    if (mtu) c += '>   mtu ' + mtu + '\n';
    c += '>   no shutdown\n\n';
    c += '# FMC\'de Security Zone atama:\n';
    c += '# Devices > Device Management > Interfaces > Edit > Security Zone: ' + secZone + '\n\n';
    c += '# Doğrulama:\n# > show interface ' + ifaceName + '\n# > show interface ip brief\n# > show nameif\n';
    return c;
}

// ── Cisco FTD: NAT ───────────────────────────────────────────────────────────
CiscoFTD.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'FTD NAT',
                desc: 'FTD NAT — FMC REST API ile Auto-NAT (object NAT) ve Manual-NAT policy kuralları.'
            },
            configTypes: [
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: 'Birebir statik adres dönüşümü', badge: { text: 'Statik', cls: 'common' } },
                { id: 'dynamic', label: 'Dynamic NAT / PAT', icon: 'fas fa-random', desc: 'Dinamik adres/port dönüşümü (PAT)', badge: { text: 'En Yaygın', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'NAT Nesne Tanımı',
                    icon: 'fas fa-cube',
                    fields: [
                        { name: 'real_obj', label: 'Kaynak Nesne Adı', type: 'text', required: true, placeholder: 'OBJ_INTERNAL_NET', hint: 'FMC\'de tanımlanacak network nesnesi adı' },
                        { name: 'real_ip', label: 'Real IP/Network', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'Orijinal iç ağ adresi (CIDR)' },
                        { name: 'mapped_ip', label: 'Mapped IP (NAT sonrası)', type: 'text', required: true, placeholder: '203.0.113.10', hint: 'Dışarıya görünen IP adresi' }
                    ]
                },
                {
                    title: 'Zone Seçimi',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'src_zone', label: 'Source Zone', type: 'text', required: true, placeholder: 'INSIDE_ZONE', hint: 'Kaynak güvenlik bölgesi' },
                        { name: 'dst_zone', label: 'Destination Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'Hedef güvenlik bölgesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdNatGen(data);
        });
    }
};
function cgFtdNatGen(data) {
    const natType = cgEsc(data._cgtype || 'static'), realObj = cgEsc(data.real_obj || '');
    const realIp = cgEsc(data.real_ip || ''), mappedIp = cgEsc(data.mapped_ip || '');
    const srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    let c = '# ========================================\n# Cisco FTD — NAT Rule\n# ========================================\n';
    c += '# FMC: Devices > NAT > Add Rule\n\n';
    c += '# Object: ' + realObj + ' (' + realIp + ')\n';
    c += '# NAT Type: ' + (natType === 'static' ? 'Static NAT' : 'Dynamic NAT/PAT') + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Objects > Network > Add Network Object\n';
    c += '#    Name: ' + realObj + ', Value: ' + realIp + '\n';
    c += '# 2. Devices > NAT > Add Auto NAT Rule\n';
    c += '#    Type: ' + natType + '\n';
    c += '#    Source Zone: ' + srcZone + '\n';
    c += '#    Destination Zone: ' + dstZone + '\n';
    c += '#    Original Network: ' + realObj + '\n';
    if (natType === 'static') {
        c += '#    Translated IP: ' + mappedIp + '\n';
    } else {
        c += '#    Translated Address: Interface (PAT) or ' + mappedIp + '\n';
    }
    c += '\n# Doğrulama:\n# > show nat\n# > show nat detail\n# > show conn\n';
    return c;
}

// ── Cisco FTD: Access Control Policy ─────────────────────────────────────────
CiscoFTD.accessControl = {
    label: 'Access Control Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'FTD ACP',
                desc: 'FTD ACP — Access Control Policy kuralları: kaynak/hedef zone, ağ, port ve aksiyon (allow/block/monitor).'
            },
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-folder',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_ACP', hint: 'Access Control Policy için isim' },
                        { name: 'default_action', label: 'Default Action', type: 'select', options: [
                            { value: 'Block', label: 'Block', selected: true },
                            { value: 'Allow', label: 'Allow' },
                            { value: 'Trust', label: 'Trust' }
                        ], hint: 'Eşleşmeyen trafik için varsayılan işlem' }
                    ]
                },
                {
                    title: 'Erişim Kuralı',
                    icon: 'fas fa-list-alt',
                    fields: [
                        { name: 'rule_name', label: 'Kural Adı', type: 'text', required: true, placeholder: 'ALLOW_INTERNAL_TO_INET', hint: 'Erişim kuralı için açıklayıcı isim' },
                        { name: 'rule_action', label: 'Kural Aksiyonu', type: 'select', options: [
                            { value: 'Allow', label: 'Allow', selected: true },
                            { value: 'Block', label: 'Block' },
                            { value: 'Trust', label: 'Trust' }
                        ], hint: 'Eşleşen trafiğe uygulanacak işlem' },
                        { name: 'src_zone', label: 'Source Zone', type: 'text', required: true, placeholder: 'INSIDE_ZONE', hint: 'Kaynak güvenlik bölgesi' },
                        { name: 'dst_zone', label: 'Destination Zone', type: 'text', required: true, placeholder: 'OUTSIDE_ZONE', hint: 'Hedef güvenlik bölgesi' }
                    ]
                },
                {
                    title: 'Inspection Politikaları',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'ips_policy', label: 'IPS Policy', type: 'text', optional: true, placeholder: 'Balanced_Security_Connectivity', hint: 'Intrusion Prevention System politikası' },
                        { name: 'file_policy', label: 'File Policy', type: 'text', optional: true, placeholder: 'Block_Malware', hint: 'Dosya analizi/kötücül yazılım engelleme' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdAcpGen(data);
        });
    }
};
function cgFtdAcpGen(data) {
    const polName = cgEsc(data.pol_name || ''), defaultAction = cgEsc(data.default_action || 'Block');
    const ruleName = cgEsc(data.rule_name || ''), ruleAction = cgEsc(data.rule_action || 'Allow');
    const srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    const ipsPolicy = cgEsc(data.ips_policy || ''), filePolicy = cgEsc(data.file_policy || '');
    let c = '# ========================================\n# Cisco FTD — Access Control Policy\n# ========================================\n';
    c += '# FMC: Policies > Access Control > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Default Action: ' + defaultAction + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Policies > Access Control > Add Policy\n';
    c += '#    Name: ' + polName + '\n';
    c += '#    Default Action: ' + defaultAction + '\n\n';
    c += '# 2. Add Rule: ' + ruleName + '\n';
    c += '#    Action: ' + ruleAction + '\n';
    c += '#    Source Zones: ' + srcZone + '\n';
    c += '#    Destination Zones: ' + dstZone + '\n';
    if (ipsPolicy) c += '#    Inspection > IPS Policy: ' + ipsPolicy + '\n';
    if (filePolicy) c += '#    Inspection > File Policy: ' + filePolicy + '\n';
    c += '\n# 3. Policy\'yi cihaza deploy et:\n';
    c += '#    Deploy > Deploy Policies > Select Device > Deploy\n\n';
    c += '# Doğrulama:\n# > show access-list\n# Analysis > Connections > Events\n';
    return c;
}

// ── Cisco FTD: Intrusion Policy ───────────────────────────────────────────────
CiscoFTD.intrusionPolicy = {
    label: 'Intrusion Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'FTD IPS',
                desc: 'FTD IPS — Intrusion Prevention Policy ve Snort kural grubu seçimi (Security over Connectivity / Balanced).'
            },
            sections: [
                {
                    title: 'IPS Policy Tanımı',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_IPS', hint: 'Intrusion policy için isim' },
                        { name: 'base_policy', label: 'Base Policy', type: 'select', options: [
                            { value: 'Balanced Security and Connectivity', label: 'Balanced Security and Connectivity', selected: true },
                            { value: 'Security over Connectivity', label: 'Security over Connectivity' },
                            { value: 'Connectivity over Security', label: 'Connectivity over Security' },
                            { value: 'Maximum Detection', label: 'Maximum Detection' }
                        ], hint: 'Snort kural seti için temel profil' },
                        { name: 'inline_mode', label: 'Inline Mode (Drop Rules)', type: 'select', options: [
                            { value: 'yes', label: 'Evet (Drop Rules Aktif)', selected: true },
                            { value: 'no', label: 'Hayır (Detection Only)' }
                        ], hint: 'Inline modda saldırılar drop edilir; detection-only modda sadece alert üretilir' },
                        { name: 'var_set', label: 'Variable Set', type: 'text', required: true, placeholder: 'Default-Set', hint: 'HOME_NET ve EXTERNAL_NET tanımlı variable set' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdIpsGen(data);
        });
    }
};
function cgFtdIpsGen(data) {
    const polName = cgEsc(data.pol_name || ''), basePolicy = cgEsc(data.base_policy || '');
    const inlineMode = cgEsc(data.inline_mode || 'yes'), varSet = cgEsc(data.var_set || '');
    let c = '# ========================================\n# Cisco FTD — Intrusion Policy\n# ========================================\n';
    c += '# FMC: Policies > Intrusion > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Base Policy: ' + basePolicy + '\n';
    c += '# Mode: ' + (inlineMode === 'yes' ? 'Inline (Drop aktif)' : 'Passive/Detection Only') + '\n';
    c += '# Variable Set: ' + varSet + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Policies > Intrusion > Create Policy\n';
    c += '#    Name: ' + polName + '\n';
    c += '#    Base Policy: ' + basePolicy + '\n';
    c += '# 2. Policy Variables > Variable Set: ' + varSet + '\n';
    if (inlineMode === 'yes') {
        c += '# 3. Drop when Inline: Enabled\n';
        c += '# 4. Rules > Action: Drop for high-severity\n';
    } else {
        c += '# 3. Drop when Inline: Disabled (Alert only)\n';
    }
    c += '\n# ACP\'ye Ekle:\n';
    c += '# Access Control Rule > Inspection > IPS Policy: ' + polName + '\n\n';
    c += '# Doğrulama:\n# Analysis > Intrusions > Events\n# > show snort statistics\n';
    return c;
}

// ── Cisco FTD: SSL Policy ─────────────────────────────────────────────────────
CiscoFTD.sslPolicy = {
    label: 'SSL Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-certificate',
                title: 'FTD SSL',
                desc: 'FTD SSL — SSL/TLS inspection: decrypt-resign, decrypt-known-key veya do-not-decrypt aksiyon politikası.'
            },
            sections: [
                {
                    title: 'SSL Policy Tanımı',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'CORP_SSL_INSPECT', hint: 'SSL inspection policy için isim' },
                        { name: 'default_action', label: 'Default Action', type: 'select', options: [
                            { value: 'Do not decrypt', label: 'Do not decrypt', selected: true },
                            { value: 'Decrypt - Resign', label: 'Decrypt - Resign' },
                            { value: 'Block', label: 'Block' }
                        ], hint: 'Eşleşmeyen SSL trafik için varsayılan işlem' }
                    ]
                },
                {
                    title: 'Sertifika Ayarları',
                    icon: 'fas fa-certificate',
                    fields: [
                        { name: 'ca_cert', label: 'CA Sertifikası (Re-Sign)', type: 'text', required: true, placeholder: 'CORP_CA', hint: 'Decrypt-Resign için kullanılacak dahili CA sertifikası adı' },
                        { name: 'exempt_cats', label: 'Muaf Kategoriler', type: 'text', optional: true, placeholder: 'Financial,Health,Government', hint: 'Şifre çözülmeyecek URL kategorileri (virgülle ayrılmış)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdSslPolGen(data);
        });
    }
};
function cgFtdSslPolGen(data) {
    const polName = cgEsc(data.pol_name || ''), defaultAction = cgEsc(data.default_action || 'Do not decrypt');
    const caCert = cgEsc(data.ca_cert || '');
    const exemptCats = cgEsc(data.exempt_cats || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '# ========================================\n# Cisco FTD — SSL Policy\n# ========================================\n';
    c += '# FMC: Policies > SSL > New Policy\n\n';
    c += '# Policy: ' + polName + '\n';
    c += '# Default Action: ' + defaultAction + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Objects > PKI > Internal CAs > Import: ' + caCert + '\n';
    c += '# 2. Policies > SSL > Add Policy: ' + polName + '\n';
    c += '#    Default Action: ' + defaultAction + '\n';
    if (defaultAction === 'Decrypt - Resign') {
        c += '#    Re-sign Certificate: ' + caCert + '\n';
    }
    if (exemptCats.length) {
        c += '# 3. Add Rules — Do Not Decrypt (Category):\n';
        exemptCats.forEach(cat => {
            c += '#    Category: ' + cat + ' > Do not decrypt\n';
        });
    }
    c += '\n# ACP\'ye Ekle:\n# Access Control Policy > SSL Policy: ' + polName + '\n\n';
    c += '# Doğrulama:\n# Analysis > Connections > Events > SSL Status\n# > show ssl errors\n';
    return c;
}

// ── Cisco FTD: Site-to-Site VPN ───────────────────────────────────────────────
CiscoFTD.siteToSiteVpn = {
    label: 'Site-to-Site VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'FTD Site-to-Site VPN',
                desc: 'FTD Site-to-Site VPN — IKEv2 ile şifreli tünel. Endpoint, PSK/sertifika ve şifreleme politikası.'
            },
            sections: [
                {
                    title: 'Topoloji Bilgileri',
                    icon: 'fas fa-project-diagram',
                    fields: [
                        { name: 'topo_name', label: 'Topology Adı', type: 'text', required: true, placeholder: 'HQ_TO_BRANCH', hint: 'VPN topolojisi için isim' },
                        { name: 'ike_ver', label: 'IKE Versiyonu', type: 'select', options: [
                            { value: 'IKEv2', label: 'IKEv2', selected: true },
                            { value: 'IKEv1', label: 'IKEv1' }
                        ], hint: 'IKEv2 önerilir (daha güvenli ve verimli)' }
                    ]
                },
                {
                    title: 'Endpoint Bilgileri',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'local_ep', label: 'Local Endpoint (FTD Outside IP)', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.1', hint: 'Bu FTD cihazının dış IP adresi' },
                        { name: 'remote_ep', label: 'Remote Endpoint (Peer IP)', type: 'text', required: true, validate: 'ip', placeholder: '198.51.100.1', hint: 'Uzak VPN peer IP adresi' },
                        { name: 'local_net', label: 'Local Network', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel korunan ağ (CIDR)' },
                        { name: 'remote_net', label: 'Remote Network', type: 'text', validate: 'cidr', required: true, placeholder: '10.10.0.0/24', hint: 'Uzak korunan ağ (CIDR)' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'psk', label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'VpnKey123!', hint: 'IKE kimlik doğrulama için paylaşılan gizli anahtar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdS2sVpnGen(data);
        });
    }
};
function cgFtdS2sVpnGen(data) {
    const topoName = cgEsc(data.topo_name || ''), ikeVer = cgEsc(data.ike_ver || 'IKEv2');
    const localEp = cgEsc(data.local_ep || ''), remoteEp = cgEsc(data.remote_ep || '');
    const localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
    const psk = cgEsc(data.psk || '');
    let c = '# ========================================\n# Cisco FTD — Site-to-Site VPN\n# ========================================\n';
    c += '# FMC: Devices > VPN > Site To Site\n\n';
    c += '# Topology: ' + topoName + '\n';
    c += '# IKE Version: ' + ikeVer + '\n\n';
    c += '# FMC Adımları:\n';
    c += '# 1. Devices > VPN > Site To Site > Add Topology\n';
    c += '#    Name: ' + topoName + '\n';
    c += '#    Type: Point to Point\n';
    c += '#    IKE Version: ' + ikeVer + '\n\n';
    c += '# 2. Node A (Local FTD):\n';
    c += '#    Device: Bu FTD cihazı\n';
    c += '#    Interface: Outside (' + localEp + ')\n';
    c += '#    Protected Networks: ' + localNet + '\n\n';
    c += '# 3. Node B (Remote Peer):\n';
    c += '#    IP: ' + remoteEp + '\n';
    c += '#    Protected Networks: ' + remoteNet + '\n\n';
    c += '# 4. Authentication: Pre-shared Key\n';
    c += '#    Key: ' + psk + '\n\n';
    c += '# 5. IKE Policy + IPsec Proposal (default veya custom)\n\n';
    c += '# Doğrulama:\n# > show crypto ikev2 sa\n# > show crypto ipsec sa\n# > show vpn-sessiondb l2l\n';
    return c;
}

// ── Cisco FTD: Remote Access VPN ─────────────────────────────────────────────
CiscoFTD.raVpn = {
    label: 'Remote Access VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'FTD RA VPN',
                desc: 'FTD RA VPN — AnyConnect SSL remote access VPN. IP havuzu, split-tunnel ve kimlik doğrulama profili.'
            },
            sections: [
                {
                    title: 'RA-VPN Policy',
                    icon: 'fas fa-folder',
                    fields: [
                        { name: 'pol_name', label: 'RA-VPN Policy Adı', type: 'text', required: true, placeholder: 'CORP_RA_VPN', hint: 'Remote Access VPN policy ismi' },
                        { name: 'auth_method', label: 'Auth Method', type: 'select', options: [
                            { value: 'AAA', label: 'AAA (RADIUS/LDAP)', selected: true },
                            { value: 'Certificate', label: 'Certificate' },
                            { value: 'AAA+Certificate', label: 'AAA + Certificate' }
                        ], hint: 'VPN kullanıcı kimlik doğrulama yöntemi' },
                        { name: 'aaa_grp', label: 'AAA Server Group', type: 'text', optional: true, placeholder: 'RADIUS_SERVERS', hint: 'AAA seçiliyse: FMC\'de tanımlı server group adı' }
                    ]
                },
                {
                    title: 'IP Pool',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'VPN_POOL', hint: 'IP havuzu için isim' },
                        { name: 'pool_start', label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '172.16.100.1', hint: 'Havuz başlangıç adresi' },
                        { name: 'pool_end', label: 'Pool Bitiş IP', type: 'text', validate: 'ip', required: true, placeholder: '172.16.100.254', hint: 'Havuz bitiş adresi' },
                        { name: 'pool_mask', label: 'Pool Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Havuz subnet maskesi' }
                    ]
                },
                {
                    title: 'DNS ve Split Tunnel',
                    icon: 'fas fa-cut',
                    fields: [
                        { name: 'dns', label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'VPN bağlantısı için DNS sunucusu' },
                        { name: 'split_acl', label: 'Split-Tunnel ACL', type: 'text', optional: true, placeholder: 'ACL_SPLIT_TUNNEL', hint: 'Boş bırakılırsa full tunnel uygulanır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFtdRaVpnGen(data);
        });
    }
};
function cgFtdRaVpnGen(data) {
    const polName = cgEsc(data.pol_name || ''), authMethod = cgEsc(data.auth_method || 'AAA');
    const aaaGrp = cgEsc(data.aaa_grp || '');
    const poolName = cgEsc(data.pool_name || ''), poolStart = cgEsc(data.pool_start || '');
    const poolEnd = cgEsc(data.pool_end || ''), poolMask = cgEsc(data.pool_mask || '');
    const dns = cgEsc(data.dns || ''), splitAcl = cgEsc(data.split_acl || '');
    let c = '# ========================================\n# Cisco FTD — Remote Access VPN\n# ========================================\n';
    c += '# FMC: Devices > VPN > Remote Access\n\n';
    c += '# RA-VPN Policy: ' + polName + '\n';
    c += '# Authentication: ' + authMethod + '\n';
    if (aaaGrp) c += '# AAA Server Group: ' + aaaGrp + '\n';
    c += '\n# IP Pool: ' + poolName + '\n';
    c += '#   Range: ' + poolStart + ' - ' + poolEnd + '\n';
    c += '#   Mask: ' + poolMask + '\n';
    c += '#   DNS: ' + dns + '\n';
    if (splitAcl) {
        c += '\n# Split Tunneling: Enabled\n#   ACL: ' + splitAcl + '\n';
    } else {
        c += '\n# Split Tunneling: Disabled (Full Tunnel)\n';
    }
    c += '\n# FMC Adımları:\n';
    c += '# 1. Devices > VPN > Remote Access > Add\n';
    c += '# 2. Policy Name: ' + polName + '\n';
    c += '# 3. Connection Profile > Add\n';
    c += '#    Auth Method: ' + authMethod + '\n';
    if (aaaGrp) c += '#    AAA Server: ' + aaaGrp + '\n';
    c += '#    IP Pool: Objects > Address Pools > ' + poolName + ' (' + poolStart + '-' + poolEnd + '/' + poolMask + ')\n';
    c += '#    DNS Server: ' + dns + '\n';
    if (splitAcl) c += '#    Split Tunnel ACL: ' + splitAcl + '\n';
    c += '# 4. AnyConnect Profile bağla (Objects > VPN > AnyConnect File)\n';
    c += '# 5. Interface: outside interface seç\n\n';
    c += '# Doğrulama:\n# > show vpn-sessiondb anyconnect\n# > show vpn-sessiondb summary\n# FMC: Analysis > Users > Active Sessions\n';
    return c;
}
