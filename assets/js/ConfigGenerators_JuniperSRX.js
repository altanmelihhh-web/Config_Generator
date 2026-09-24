'use strict';

const JuniperSRX = {};

// ── Juniper SRX: Security Zone ────────────────────────────────────────────────
JuniperSRX.zone = {
    label: 'Security Zone',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Zone (SRX)',
                desc: 'Juniper SRX güvenlik zone tanımı — interface atama ve host-inbound traffic kontrolü.<br>Örnek: <code>set security zones security-zone trust interfaces ge-0/0/1.0</code>'
            },
            sections: [
                {
                    title: 'Zone Tanımı',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'zone_name', label: 'Zone Adı', type: 'text', required: true, placeholder: 'trust', hint: 'Güvenlik zone adı (trust, untrust, dmz vb.)' },
                        { name: 'interfaces', label: 'Interface\'ler', type: 'text', required: true, placeholder: 'ge-0/0/1.0, ge-0/0/2.0', hint: 'Virgülle ayrılmış interface listesi' }
                    ]
                },
                {
                    title: 'Host-Inbound Traffic',
                    icon: 'fas fa-traffic-light',
                    info: 'Cihazın kendisine yönelik kabul edilecek trafik protokolleri. Untrust zone için minimumda tutun.',
                    fields: [
                        { name: 'svc_ping', label: 'ping', type: 'checkbox', checked: true },
                        { name: 'svc_ssh', label: 'ssh', type: 'checkbox', checked: true },
                        { name: 'svc_https', label: 'https', type: 'checkbox', checked: false },
                        { name: 'svc_ospf', label: 'ospf', type: 'checkbox', checked: false },
                        { name: 'svc_bgp', label: 'bgp', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxZoneGen(data);
        });
    }
};
function cgSrxZoneGen(data) {
    const zoneName = cgEsc(data.zone_name || '');
    const ifaces = cgEsc(data.interfaces || '').split(',').map(s => s.trim()).filter(Boolean);
    const svcs = ['ping', 'ssh', 'https', 'ospf', 'bgp'].filter(s => data['svc_' + s] === true);
    let c = '# ========================================\n# Juniper SRX — Security Zone\n# ========================================\n\n';
    c += 'set security zones security-zone ' + zoneName + ' host-inbound-traffic system-services all\n';
    svcs.forEach(s => {
        c += 'set security zones security-zone ' + zoneName + ' host-inbound-traffic protocols ' + s + '\n';
    });
    ifaces.forEach(iface => {
        c += 'set security zones security-zone ' + zoneName + ' interfaces ' + iface + '\n';
    });
    c += '\n# Doğrulama:\n# show security zones ' + zoneName + '\n';
    return c;
}

// ── Juniper SRX: Security Policy ──────────────────────────────────────────────
JuniperSRX.policy = {
    label: 'Security Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'Security Policy (SRX)',
                desc: 'Zone-to-zone trafik politikası — permit/deny/reject kuralları ve oturum loglama.<br>Örnek: <code>set security policies from-zone trust to-zone untrust policy permit-outbound then permit</code>'
            },
            configTypes: [
                { id: 'permit', label: 'Permit', icon: 'fas fa-check-circle', desc: 'Trafiğe izin ver', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'deny', label: 'Deny', icon: 'fas fa-times-circle', desc: 'Trafiği sessizce düşür', badge: { text: 'Güvenlik', cls: 'security' } },
                { id: 'reject', label: 'Reject', icon: 'fas fa-ban', desc: 'Trafiği reddet ve bildir', badge: { text: 'Güvenlik', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'permit-outbound', hint: 'Açıklayıcı policy adı' },
                        { name: 'from_zone', label: 'From Zone', type: 'text', required: true, placeholder: 'trust', hint: 'Kaynak güvenlik zone' },
                        { name: 'to_zone', label: 'To Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Hedef güvenlik zone' }
                    ]
                },
                {
                    title: 'Eşleşme Kriterleri',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'src_addr', label: 'Kaynak Adres', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.0/24', hint: '"any" veya CIDR formatında adres' },
                        { name: 'dst_addr', label: 'Hedef Adres', type: 'text', validate: 'ip', required: true, placeholder: 'any', hint: '"any" veya CIDR formatında adres' },
                        { name: 'app', label: 'Uygulama', type: 'text', required: true, placeholder: 'any', hint: '"any", "junos-https", "junos-http" vb.' }
                    ]
                },
                {
                    title: 'Aksiyon ve Loglama',
                    icon: 'fas fa-clipboard-list',
                    fields: [
                        { name: 'log', label: 'Log Modu', type: 'select', options: [
                            { value: 'session-close', label: 'Session Close', selected: true },
                            { value: 'session-init', label: 'Session Init' },
                            { value: 'none', label: 'Yok' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxPolicyGen(data);
        });
    }
};
function cgSrxPolicyGen(data) {
    const polName = cgEsc(data.pol_name || ''), fromZone = cgEsc(data.from_zone || ''), toZone = cgEsc(data.to_zone || '');
    const srcAddr = cgEsc(data.src_addr || ''), dstAddr = cgEsc(data.dst_addr || ''), app = cgEsc(data.app || '');
    const action = data._cgtype || 'permit', log = cgEsc(data.log || 'session-close');
    const pfx = 'set security policies from-zone ' + fromZone + ' to-zone ' + toZone + ' policy ' + polName;
    let c = '# ========================================\n# Juniper SRX — Security Policy\n# ========================================\n\n';
    if (srcAddr !== 'any') {
        const addrName = 'ADDR_SRC_' + srcAddr.replace(/[./]/g, '_');
        c += 'set security address-book global address ' + addrName + ' ' + srcAddr + '\n';
        c += pfx + ' match source-address ' + addrName + '\n';
    } else {
        c += pfx + ' match source-address any\n';
    }
    if (dstAddr !== 'any') {
        const addrName = 'ADDR_DST_' + dstAddr.replace(/[./]/g, '_');
        c += 'set security address-book global address ' + addrName + ' ' + dstAddr + '\n';
        c += pfx + ' match destination-address ' + addrName + '\n';
    } else {
        c += pfx + ' match destination-address any\n';
    }
    c += pfx + ' match application ' + app + '\n';
    c += pfx + ' then ' + action + '\n';
    if (log !== 'none') c += pfx + ' then log ' + log + '\n';
    c += '\n# Doğrulama:\n# show security policies from-zone ' + fromZone + ' to-zone ' + toZone + '\n';
    return c;
}

// ── Juniper SRX: NAT ──────────────────────────────────────────────────────────
JuniperSRX.nat = {
    label: 'NAT Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT Policy (SRX)',
                desc: 'Source, Destination ve Static NAT konfigürasyonu. Pool veya interface-based çeviri.<br>Örnek: <code>set security nat source rule-set snat-rs from zone trust</code>'
            },
            configTypes: [
                { id: 'source', label: 'Source NAT', icon: 'fas fa-sign-out-alt', desc: 'İç ağdan dışa — IP gizleme', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'destination', label: 'Destination NAT', icon: 'fas fa-sign-in-alt', desc: 'Dışarıdan içe — port yönlendirme', badge: { text: 'Yaygın', cls: 'common' } },
                { id: 'static', label: 'Static NAT', icon: 'fas fa-exchange-alt', desc: 'Birebir IP eşleme', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Rule Set Tanımı',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'ruleset_name', label: 'Rule Set Adı', type: 'text', required: true, placeholder: 'snat-trust-to-untrust', hint: 'NAT rule set adı' },
                        { name: 'from_zone', label: 'From Zone / Interface', type: 'text', required: true, placeholder: 'trust', hint: 'Kaynak zone veya interface' },
                        { name: 'to_zone', label: 'To Zone / Interface', type: 'text', required: true, placeholder: 'untrust', hint: 'Hedef zone veya interface' }
                    ]
                },
                {
                    title: 'Rule Tanımı',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'rule_name', label: 'Rule Adı', type: 'text', required: true, placeholder: 'rule1', hint: 'NAT kuralı adı' },
                        { name: 'src_prefix', label: 'Kaynak Prefix', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'Eşleşecek kaynak IP aralığı' },
                        { name: 'dst_prefix', label: 'Hedef Prefix', type: 'text', optional: true, placeholder: '203.0.113.10/32', hint: 'Static/Destination NAT için hedef IP' },
                        { name: 'xlat_addr', label: 'Translated Adres / Pool IP', type: 'text', optional: true, placeholder: '203.0.113.1', hint: 'Source NAT için pool IP; "interface" yazılırsa interface PAT kullanılır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxNatGen(data);
        });
    }
};
function cgSrxNatGen(data) {
    const natType = data._cgtype || 'source';
    const rulesetName = cgEsc(data.ruleset_name || '');
    const fromZone = cgEsc(data.from_zone || ''), toZone = cgEsc(data.to_zone || '');
    const ruleName = cgEsc(data.rule_name || ''), srcPrefix = cgEsc(data.src_prefix || '');
    const dstPrefix = cgEsc(data.dst_prefix || ''), xlatAddr = cgEsc(data.xlat_addr || '');
    let c = '# ========================================\n# Juniper SRX — NAT (' + natType.toUpperCase() + ')\n# ========================================\n\n';
    const pfxRS = 'set security nat ' + natType + ' rule-set ' + rulesetName;
    c += pfxRS + ' from zone ' + fromZone + '\n';
    c += pfxRS + ' to zone ' + toZone + '\n';
    const pfxR = pfxRS + ' rule ' + ruleName;
    if (natType === 'source') {
        c += pfxR + ' match source-address ' + srcPrefix + '\n';
        if (xlatAddr === 'interface' || !xlatAddr) {
            c += pfxR + ' then source-nat interface\n';
        } else {
            const poolName = 'SNAT_POOL_' + xlatAddr.replace(/[./]/g, '_');
            c += '\nset security nat source pool ' + poolName + ' address ' + xlatAddr + '\n';
            c += pfxR + ' then source-nat pool ' + poolName + '\n';
        }
    } else if (natType === 'destination') {
        c += pfxR + ' match destination-address ' + dstPrefix + '\n';
        c += pfxR + ' then destination-nat pool DNAT_POOL\n';
        c += '\nset security nat destination pool DNAT_POOL address ' + xlatAddr + '\n';
    } else {
        c += pfxR + ' match destination-address ' + dstPrefix + '\n';
        c += pfxR + ' then static-nat prefix ' + xlatAddr + '\n';
    }
    c += '\n# Doğrulama:\n# show security nat ' + natType + ' rule all\n# show security nat ' + natType + ' pool all\n';
    return c;
}

// ── Juniper SRX: IPsec VPN ────────────────────────────────────────────────────
JuniperSRX.vpn = {
    label: 'IPsec VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-secret',
                title: 'IPsec VPN (SRX)',
                desc: 'Route-based IPsec VPN — IKE proposal, policy, gateway ve ipsec tunnel konfigürasyonu.<br>Örnek: <code>set security ipsec vpn VPN_BRANCH1 bind-interface st0.1</code>'
            },
            configTypes: [
                { id: 'v2', label: 'IKEv2', icon: 'fas fa-lock', desc: 'Modern, önerilen versiyon', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v1', label: 'IKEv1', icon: 'fas fa-key', desc: 'Eski cihazlarla uyumluluk', badge: { text: 'Uyumluluk', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'VPN Kimlik Bilgileri',
                    icon: 'fas fa-user-secret',
                    warn: 'Pre-Shared Key güvenli bir kanal üzerinden iletilmeli. Üretimde sertifika tabanlı doğrulama tercih edin.',
                    fields: [
                        { name: 'vpn_name', label: 'VPN Adı', type: 'text', required: true, placeholder: 'VPN_BRANCH1', hint: 'Tünel için benzersiz tanımlayıcı' },
                        { name: 'psk', label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'MyPreSharedKey123!', hint: 'En az 16 karakter, özel karakter içermeli' }
                    ]
                },
                {
                    title: 'Gateway Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'local_gw', label: 'Local Gateway IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Bu cihazın WAN IP adresi' },
                        { name: 'remote_gw', label: 'Remote Gateway IP', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'Uzak tarafın WAN IP adresi' },
                        { name: 'ext_iface', label: 'External Interface', type: 'text', required: true, placeholder: 'ge-0/0/0.0', hint: 'IKE paketlerinin çıkacağı WAN interface' }
                    ]
                },
                {
                    title: 'Tunnel Interface',
                    icon: 'fas fa-project-diagram',
                    fields: [
                        { name: 'st0', label: 'St0 Interface', type: 'text', required: true, placeholder: 'st0.1', hint: 'Route-based VPN için secure tunnel interface' },
                        { name: 'st0_ip', label: 'St0 IP / Prefix', type: 'text', required: true, placeholder: '10.255.0.1/30', hint: 'Tünel interface IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxVpnGen(data);
        });
    }
};
function cgSrxVpnGen(data) {
    const vpnName = cgEsc(data.vpn_name || ''), localGw = cgEsc(data.local_gw || ''), remoteGw = cgEsc(data.remote_gw || '');
    const extIface = cgEsc(data.ext_iface || ''), psk = cgEsc(data.psk || '');
    const ikeVer = data._cgtype || 'v2';
    const st0 = cgEsc(data.st0 || ''), st0Ip = cgEsc(data.st0_ip || '');
    const ikeProposal = vpnName + '_IKE_PROP', ikePolicy = vpnName + '_IKE_POL', ikeGw = vpnName + '_IKE_GW';
    const ipsecProposal = vpnName + '_IPSEC_PROP', ipsecPolicy = vpnName + '_IPSEC_POL';
    let c = '# ========================================\n# Juniper SRX — IPsec VPN (' + ikeVer.toUpperCase() + ')\n# ========================================\n\n';
    c += '# IKE Proposal\n';
    c += 'set security ike proposal ' + ikeProposal + ' authentication-method pre-shared-keys\n';
    c += 'set security ike proposal ' + ikeProposal + ' dh-group group14\n';
    c += 'set security ike proposal ' + ikeProposal + ' authentication-algorithm sha-256\n';
    c += 'set security ike proposal ' + ikeProposal + ' encryption-algorithm aes-256-cbc\n\n';
    c += '# IKE Policy\n';
    c += 'set security ike policy ' + ikePolicy + ' mode ' + (ikeVer === 'v1' ? 'main' : 'aggressive') + '\n';
    c += 'set security ike policy ' + ikePolicy + ' proposals ' + ikeProposal + '\n';
    c += 'set security ike policy ' + ikePolicy + ' pre-shared-key ascii-text "' + psk + '"\n\n';
    c += '# IKE Gateway\n';
    c += 'set security ike gateway ' + ikeGw + ' ike-policy ' + ikePolicy + '\n';
    c += 'set security ike gateway ' + ikeGw + ' address ' + remoteGw + '\n';
    c += 'set security ike gateway ' + ikeGw + ' local-address ' + localGw + '\n';
    c += 'set security ike gateway ' + ikeGw + ' external-interface ' + extIface + '\n';
    c += 'set security ike gateway ' + ikeGw + ' version ' + ikeVer + '-only\n\n';
    c += '# IPsec Proposal\n';
    c += 'set security ipsec proposal ' + ipsecProposal + ' protocol esp\n';
    c += 'set security ipsec proposal ' + ipsecProposal + ' authentication-algorithm hmac-sha-256-128\n';
    c += 'set security ipsec proposal ' + ipsecProposal + ' encryption-algorithm aes-256-cbc\n\n';
    c += '# IPsec Policy\n';
    c += 'set security ipsec policy ' + ipsecPolicy + ' perfect-forward-secrecy keys group14\n';
    c += 'set security ipsec policy ' + ipsecPolicy + ' proposals ' + ipsecProposal + '\n\n';
    c += '# VPN Tunnel\n';
    c += 'set security ipsec vpn ' + vpnName + ' bind-interface ' + st0 + '\n';
    c += 'set security ipsec vpn ' + vpnName + ' ike gateway ' + ikeGw + '\n';
    c += 'set security ipsec vpn ' + vpnName + ' ike ipsec-policy ' + ipsecPolicy + '\n';
    c += 'set security ipsec vpn ' + vpnName + ' establish-tunnels immediately\n\n';
    c += '# Tunnel Interface\n';
    c += 'set interfaces ' + st0 + ' family inet address ' + st0Ip + '\n\n';
    c += '# Doğrulama:\n# show security ike security-associations\n# show security ipsec security-associations\n';
    return c;
}

// ── Juniper SRX: Chassis Cluster (HA) ────────────────────────────────────────
JuniperSRX.ha = {
    label: 'Chassis Cluster',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Chassis Cluster — HA (SRX)',
                desc: 'Active/Passive yüksek erişilebilirlik kümesi — control link, fabric link ve redundancy group yapılandırması.<br>Örnek: <code>set chassis cluster cluster-id 1 node 0 reboot</code>'
            },
            configTypes: [
                { id: '0', label: 'Node 0 — Primary', icon: 'fas fa-crown', desc: 'Birincil cihaz konfigürasyonu', badge: { text: 'Primary', cls: 'recommended' } },
                { id: '1', label: 'Node 1 — Secondary', icon: 'fas fa-clone', desc: 'İkincil cihaz konfigürasyonu', badge: { text: 'Secondary', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Cluster Kimliği',
                    icon: 'fas fa-server',
                    warn: 'Cluster ID komutu cihazı yeniden başlatır. Önce tüm ayarları kaydedin.',
                    fields: [
                        { name: 'cluster_id', label: 'Cluster ID', type: 'text', required: true, placeholder: '1', hint: '1–15 arası, aynı cluster\'daki tüm cihazlarda aynı olmalı' }
                    ]
                },
                {
                    title: 'Link Arayüzleri',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ctrl_iface', label: 'Control Link Interface', type: 'text', required: true, placeholder: 'ge-0/0/0', hint: 'Control plane haberleşmesi için dedicated interface' },
                        { name: 'fab_iface', label: 'Fabric Link Interface', type: 'text', required: true, placeholder: 'ge-0/0/1', hint: 'Data plane senkronizasyonu için dedicated interface' }
                    ]
                },
                {
                    title: 'Yönetim',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'mgmt_ip', label: 'Management IP (fxp0)', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.0.1/24', hint: 'Out-of-band yönetim IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxHaGen(data);
        });
    }
};
function cgSrxHaGen(data) {
    const clusterId = cgEsc(data.cluster_id || '1');
    const nodeId = data._cgtype || '0';
    const ctrlIface = cgEsc(data.ctrl_iface || ''), fabIface = cgEsc(data.fab_iface || ''), mgmtIp = cgEsc(data.mgmt_ip || '');
    const roleName = nodeId === '0' ? 'Primary' : 'Secondary';
    let c = '# ========================================\n# Juniper SRX — Chassis Cluster (' + roleName + ')\n# ========================================\n\n';
    c += '# 1. Adım: Cluster modunu aktifleştir (reboot gerekir)\n';
    c += 'set chassis cluster cluster-id ' + clusterId + ' node ' + nodeId + ' reboot\n\n';
    c += '# 2. Adım: Reboot sonrası — Control/Fabric linkleri tanımla\n';
    c += 'set interfaces ' + ctrlIface + ' fastether-options no-auto-negotiation\n';
    c += 'set interfaces fab' + nodeId + ' fabric-options member-interfaces ' + fabIface + '\n\n';
    c += '# 3. Adım: Redundancy Group\n';
    c += 'set chassis cluster redundancy-group 0 node 0 priority 100\n';
    c += 'set chassis cluster redundancy-group 0 node 1 priority 1\n';
    c += 'set chassis cluster redundancy-group 1 node 0 priority 100\n';
    c += 'set chassis cluster redundancy-group 1 node 1 priority 1\n';
    c += 'set chassis cluster redundancy-group 1 preempt\n\n';
    if (mgmtIp) {
        c += '# Management\n';
        c += 'set interfaces fxp0 unit 0 family inet address ' + mgmtIp + '\n\n';
    }
    c += '# Doğrulama:\n# show chassis cluster status\n# show chassis cluster interfaces\n';
    return c;
}

// ── Juniper SRX: AppSecure / UTM ─────────────────────────────────────────────
JuniperSRX.appfw = {
    label: 'AppSecure / UTM',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'AppSecure / UTM (SRX)',
                desc: 'Uygulama güvenliği — antivirus, web filtreleme ve IDP politikaları security policy\'ye bağlanır.<br>Örnek: <code>set security utm utm-policy UTM_DEFAULT anti-virus http-profile AV_DEFAULT</code>'
            },
            sections: [
                {
                    title: 'UTM Policy',
                    icon: 'fas fa-bug',
                    warn: 'UTM lisansı ve IDP imza güncellemesi gerektirir. "show security utm status" ile lisans durumunu kontrol edin.',
                    fields: [
                        { name: 'utm_pol', label: 'UTM Policy Adı', type: 'text', required: true, placeholder: 'UTM_DEFAULT', hint: 'Oluşturulacak UTM policy adı' },
                        { name: 'av_prof', label: 'Antivirus Profil Adı', type: 'text', optional: true, placeholder: 'AV_DEFAULT', hint: 'HTTP antivirus tarama profili; boş bırakılırsa eklenmez' },
                        { name: 'wf_prof', label: 'Web Filter Profil Adı', type: 'text', optional: true, placeholder: 'WF_DEFAULT', hint: 'HTTP web filtreleme profili; boş bırakılırsa eklenmez' },
                        { name: 'idp_pol', label: 'IDP Policy Adı', type: 'text', optional: true, placeholder: 'Recommended', hint: 'Intrusion Detection Policy; boş bırakılırsa eklenmez' }
                    ]
                },
                {
                    title: 'Security Policy Bağlama',
                    icon: 'fas fa-link',
                    info: 'UTM policy\'nin uygulanacağı mevcut security policy\'yi belirtin.',
                    fields: [
                        { name: 'sec_pol', label: 'Security Policy Adı', type: 'text', required: true, placeholder: 'permit-outbound', hint: 'Mevcut security policy adı' },
                        { name: 'zones', label: 'From / To Zone', type: 'text', required: true, placeholder: 'trust untrust', hint: 'Boşlukla ayrılmış: from-zone to-zone' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxAppFwGen(data);
        });
    }
};
function cgSrxAppFwGen(data) {
    const utmPol = cgEsc(data.utm_pol || ''), avProf = cgEsc(data.av_prof || ''), wfProf = cgEsc(data.wf_prof || '');
    const idpPol = cgEsc(data.idp_pol || ''), secPol = cgEsc(data.sec_pol || '');
    const zones = cgEsc(data.zones || '').split(/\s+/);
    const fromZone = zones[0] || 'trust', toZone = zones[1] || 'untrust';
    let c = '# ========================================\n# Juniper SRX — AppSecure / UTM\n# ========================================\n\n';
    if (avProf) {
        c += 'set security utm feature-profile anti-virus type juniper-express-av\n';
        c += 'set security utm utm-policy ' + utmPol + ' anti-virus http-profile ' + avProf + '\n';
    }
    if (wfProf) {
        c += 'set security utm utm-policy ' + utmPol + ' web-filtering http-profile ' + wfProf + '\n';
    }
    c += '\n# UTM policy\'yi security policy\'ye bağla\n';
    c += 'set security policies from-zone ' + fromZone + ' to-zone ' + toZone;
    c += ' policy ' + secPol + ' then permit application-services utm-policy ' + utmPol + '\n';
    if (idpPol) {
        c += 'set security policies from-zone ' + fromZone + ' to-zone ' + toZone;
        c += ' policy ' + secPol + ' then permit application-services idp-policy ' + idpPol + '\n';
    }
    c += '\n# Doğrulama:\n# show security utm statistics\n# show security idp status\n';
    return c;
}

// ── Juniper SRX: Interface ────────────────────────────────────────────────────
JuniperSRX.interface = {
    label: 'Interface ge/xe/ae',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface (SRX)',
                desc: 'Fiziksel ve mantıksal interface konfigürasyonu — ge, xe, ae veya st0 tipi arayüzler.<br>Örnek: <code>set interfaces ge-0/0/2 unit 0 family inet address 10.0.0.1/30</code>'
            },
            sections: [
                {
                    title: 'Interface Tanımı',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intf_name', label: 'Interface Adı', type: 'text', required: true, placeholder: 'ge-0/0/2', hint: 'ge-0/0/x, xe-0/0/x, ae0, st0.x formatında' },
                        { name: 'unit', label: 'Unit', type: 'text', required: true, placeholder: '0', hint: 'Mantıksal alt interface numarası (genellikle 0)' },
                        { name: 'ip_prefix', label: 'IP / Prefix', type: 'text', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' }
                    ]
                },
                {
                    title: 'Opsiyonel Ayarlar',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'description', label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN Link — ISP1', hint: 'Interface açıklaması; dokümantasyon için önerilir' },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', optional: true, placeholder: '100', hint: 'Trunk bağlantılarda 802.1Q VLAN etiketi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxIntfGen(data);
        });
    }
};
function cgSrxIntfGen(data) {
    const intfName = cgEsc(data.intf_name || ''), unit = cgEsc(data.unit || '0'), ipPrefix = cgEsc(data.ip_prefix || '');
    const description = cgEsc(data.description || ''), vlanId = cgEsc(data.vlan_id || '');
    let c = '# ========================================\n# Juniper SRX — Interface\n# ========================================\n\n';
    if (description) c += 'set interfaces ' + intfName + ' unit ' + unit + ' description "' + description + '"\n';
    c += 'set interfaces ' + intfName + ' unit ' + unit + ' family inet address ' + ipPrefix + '\n';
    if (vlanId) c += 'set interfaces ' + intfName + ' unit ' + unit + ' vlan-id ' + vlanId + '\n';
    c += '\n# Doğrulama:\n# show interfaces ' + intfName + '\n# show interfaces terse\n';
    return c;
}

// ── Juniper SRX: Address Book Object ─────────────────────────────────────────
JuniperSRX.addrbook = {
    label: 'Address Book Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-address-book',
                title: 'Address Book Object (SRX)',
                desc: 'Güvenlik politikalarında kullanılmak üzere adres nesneleri ve grupları tanımla.<br>Örnek: <code>set security address-book global address SRV-WEB 192.168.1.10/32</code>'
            },
            sections: [
                {
                    title: 'Adres Tanımı',
                    icon: 'fas fa-address-book',
                    fields: [
                        { name: 'book_name', label: 'Address Book Adı', type: 'text', required: true, placeholder: 'global', hint: '"global" tüm zone\'larda kullanılabilir; veya zone adı girin' },
                        { name: 'addr_name', label: 'Address Adı', type: 'text', required: true, placeholder: 'SRV-WEB', hint: 'Politikalarda referans alınacak sembolik ad' },
                        { name: 'prefix', label: 'IP Prefix', type: 'text', required: true, placeholder: '192.168.1.10/32', hint: 'CIDR formatında host veya ağ adresi' }
                    ]
                },
                {
                    title: 'Adres Grubu',
                    icon: 'fas fa-layer-group',
                    info: 'Birden fazla adresi tek isim altında gruplayarak politika yönetimini kolaylaştırın.',
                    fields: [
                        { name: 'group_name', label: 'Group Adı', type: 'text', optional: true, placeholder: 'GRP-SERVERS', hint: 'Bu adresi ekleyeceğiniz address-set adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxAddrGen(data);
        });
    }
};
function cgSrxAddrGen(data) {
    const bookName = cgEsc(data.book_name || ''), addrName = cgEsc(data.addr_name || '');
    const prefix = cgEsc(data.prefix || ''), groupName = cgEsc(data.group_name || '');
    let c = '# ========================================\n# Juniper SRX — Address Book Object\n# ========================================\n\n';
    c += 'set security address-book ' + bookName + ' address ' + addrName + ' ' + prefix + '\n';
    if (groupName) c += 'set security address-book ' + bookName + ' address-set ' + groupName + ' address ' + addrName + '\n';
    c += '\n# Doğrulama:\n# show security address-book ' + bookName + '\n';
    return c;
}

// ── Juniper SRX: OSPF ─────────────────────────────────────────────────────────
JuniperSRX.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (SRX)',
                desc: 'Link-state yönlendirme protokolü — area yapısı, passive interface ve export policy desteği.<br>Örnek: <code>set protocols ospf area 0.0.0.0 interface ge-0/0/1.0</code>'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Loopback interface IP adresi önerilir' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0; stub area için örn. 0.0.0.1' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intfs', label: 'Aktif Interface\'ler', type: 'text', required: true, placeholder: 'ge-0/0/1.0, ge-0/0/2.0', hint: 'Virgülle ayrılmış OSPF interface listesi' },
                        { name: 'passive_intfs', label: 'Passive Interface\'ler', type: 'text', optional: true, placeholder: 'ge-0/0/3.0, lo0.0', hint: 'Sadece prefix duyurulur, komşu oluşturulmaz' }
                    ]
                },
                {
                    title: 'Policy Ayarları',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'export_policy', label: 'Export Policy', type: 'text', optional: true, placeholder: 'OSPF-EXPORT', hint: 'OSPF\'e redistribute edilecek route\'lar için policy adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxOspfGen(data);
        });
    }
};
function cgSrxOspfGen(data) {
    const routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
    const intfs = cgEsc(data.intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const passiveIntfs = cgEsc(data.passive_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const exportPolicy = cgEsc(data.export_policy || '');
    let c = '# ========================================\n# Juniper SRX — OSPF\n# ========================================\n\n';
    c += 'set routing-options router-id ' + routerId + '\n';
    intfs.forEach(intf => {
        c += 'set protocols ospf area ' + area + ' interface ' + intf + '\n';
    });
    passiveIntfs.forEach(intf => {
        c += 'set protocols ospf area ' + area + ' interface ' + intf + ' passive\n';
    });
    if (exportPolicy) c += 'set protocols ospf export ' + exportPolicy + '\n';
    c += '\n# Doğrulama:\n# show ospf neighbor\n# show route protocol ospf\n';
    return c;
}

// ── Juniper SRX: BGP ──────────────────────────────────────────────────────────
JuniperSRX.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (SRX)',
                desc: 'eBGP/iBGP peer konfigürasyonu — group yapısı, import/export policy ile tam kontrol.<br>Örnek: <code>set protocols bgp group EBGP-PEERS neighbor 10.0.0.2</code>'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Group Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'group_name', label: 'Group Adı', type: 'text', required: true, placeholder: 'EBGP-PEERS', hint: 'BGP peer grubunun adı' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun Autonomous System numarası' }
                    ]
                },
                {
                    title: 'Policy Ayarları',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'import_policy', label: 'Import Policy', type: 'text', optional: true, placeholder: 'BGP-IMPORT', hint: 'Alınan route\'lar için filtreleme policy adı' },
                        { name: 'export_policy', label: 'Export Policy', type: 'text', optional: true, placeholder: 'BGP-EXPORT', hint: 'Gönderilen route\'lar için filtreleme policy adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxBgpGen(data);
        });
    }
};
function cgSrxBgpGen(data) {
    const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || ''), groupName = cgEsc(data.group_name || '');
    const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || '');
    const importPolicy = cgEsc(data.import_policy || ''), exportPolicy = cgEsc(data.export_policy || '');
    let c = '# ========================================\n# Juniper SRX — BGP\n# ========================================\n\n';
    c += 'set routing-options autonomous-system ' + localAs + '\n';
    c += 'set routing-options router-id ' + routerId + '\n';
    c += 'set protocols bgp group ' + groupName + ' type external\n';
    c += 'set protocols bgp group ' + groupName + ' peer-as ' + peerAs + '\n';
    c += 'set protocols bgp group ' + groupName + ' neighbor ' + peerIp + '\n';
    if (importPolicy) c += 'set protocols bgp group ' + groupName + ' import ' + importPolicy + '\n';
    if (exportPolicy) c += 'set protocols bgp group ' + groupName + ' export ' + exportPolicy + '\n';
    c += '\n# Doğrulama:\n# show bgp summary\n# show bgp neighbor ' + peerIp + '\n';
    return c;
}

// ── Juniper SRX: Static Route ─────────────────────────────────────────────────
JuniperSRX.staticroute = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Static Route (SRX)',
                desc: 'Statik yönlendirme — default route, VRF içi ve global routing-options desteği.<br>Örnek: <code>set routing-options static route 0.0.0.0/0 next-hop 10.0.0.254</code>'
            },
            sections: [
                {
                    title: 'Route Tanımı',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'dst', label: 'Destination (CIDR)', type: 'text', required: true, placeholder: '0.0.0.0/0', hint: 'Hedef ağ; 0.0.0.0/0 default route için' },
                        { name: 'nexthop', label: 'Next-Hop', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.254', hint: 'Bir sonraki atlama IP adresi' }
                    ]
                },
                {
                    title: 'Opsiyonel Ayarlar',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'vr_name', label: 'Routing Instance Adı', type: 'text', optional: true, placeholder: 'VRF-MGMT', hint: 'Boş veya "default" → global; VRF adı → routing-instances altına eklenir' },
                        { name: 'preference', label: 'Preference (AD)', type: 'text', optional: true, placeholder: '5', hint: 'Administrative distance; küçük değer daha tercih edilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxStaticGen(data);
        });
    }
};
function cgSrxStaticGen(data) {
    const vrName = cgEsc(data.vr_name || ''), dst = cgEsc(data.dst || '');
    const nexthop = cgEsc(data.nexthop || ''), preference = cgEsc(data.preference || '');
    let c = '# ========================================\n# Juniper SRX — Static Route\n# ========================================\n\n';
    const useVr = vrName && vrName !== 'default';
    if (useVr) {
        c += 'set routing-instances ' + vrName + ' routing-options static route ' + dst + ' next-hop ' + nexthop + '\n';
    } else {
        c += 'set routing-options static route ' + dst + ' next-hop ' + nexthop + '\n';
        if (preference) c += 'set routing-options static route ' + dst + ' preference ' + preference + '\n';
    }
    c += '\n# Doğrulama:\n# show route ' + dst + '\n';
    if (useVr) c += '# show route table ' + vrName + '.inet.0\n';
    return c;
}

// ── Juniper SRX: DHCP Server ──────────────────────────────────────────────────
JuniperSRX.dhcp = {
    label: 'DHCP Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'DHCP Server (SRX)',
                desc: 'SRX üzerinde DHCP server pool tanımı — IP aralığı, gateway ve DNS konfigürasyonu.<br>Örnek: <code>set access address-assignment pool POOL-LAN family inet network 192.168.1.0/24</code>'
            },
            sections: [
                {
                    title: 'Pool Tanımı',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL-LAN', hint: 'DHCP adres havuzu için tanımlayıcı ad' },
                        { name: 'network', label: 'Network (CIDR)', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'DHCP scope network adresi' }
                    ]
                },
                {
                    title: 'IP Aralığı',
                    icon: 'fas fa-sort-numeric-up',
                    fields: [
                        { name: 'range_start', label: 'Range Başlangıç', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Dağıtılacak IP aralığının başlangıcı' },
                        { name: 'range_end', label: 'Range Bitiş', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.200', hint: 'Dağıtılacak IP aralığının sonu' }
                    ]
                },
                {
                    title: 'DHCP Seçenekleri',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router', label: 'Gateway (Router)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'İstemcilere verilecek default gateway IP' },
                        { name: 'dns', label: 'DNS Server', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'Birincil DNS sunucu IP adresi' },
                        { name: 'lease', label: 'Lease Süresi (saniye)', type: 'text', required: true, placeholder: '86400', hint: '86400 = 1 gün; 3600 = 1 saat' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxDhcpGen(data);
        });
    }
};
function cgSrxDhcpGen(data) {
    const poolName = cgEsc(data.pool_name || ''), network = cgEsc(data.network || '');
    const rangeStart = cgEsc(data.range_start || ''), rangeEnd = cgEsc(data.range_end || '');
    const router = cgEsc(data.router || ''), dns = cgEsc(data.dns || ''), lease = cgEsc(data.lease || '');
    let c = '# ========================================\n# Juniper SRX — DHCP Server\n# ========================================\n\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet network ' + network + '\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet range ' + poolName + '-range low ' + rangeStart + '\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet range ' + poolName + '-range high ' + rangeEnd + '\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet dhcp-attributes router ' + router + '\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet dhcp-attributes name-server ' + dns + '\n';
    c += 'set access address-assignment pool ' + poolName + ' family inet dhcp-attributes maximum-lease-time ' + lease + '\n';
    c += '\n# Doğrulama:\n# show dhcp server binding\n# show dhcp server statistics\n';
    return c;
}

// ── Juniper SRX: Screens DoS ──────────────────────────────────────────────────
JuniperSRX.screens = {
    label: 'Screens DoS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-virus',
                title: 'Screens DoS (SRX)',
                desc: 'IDS/Screen profili ile DoS/DDoS saldırı tespiti ve engellemesi — flood threshold değerleri zone\'a uygulanır.<br>Örnek: <code>set security screen ids-option DOS-SCREEN tcp syn-flood alarm-threshold 10000</code>'
            },
            sections: [
                {
                    title: 'Screen Tanımı',
                    icon: 'fas fa-shield-virus',
                    warn: 'Threshold değerlerini ortama göre ayarlayın. Çok düşük değerler meşru trafiği engelleyebilir.',
                    fields: [
                        { name: 'screen_name', label: 'Screen Adı', type: 'text', required: true, placeholder: 'DOS-SCREEN', hint: 'IDS screen profili için tanımlayıcı ad' }
                    ]
                },
                {
                    title: 'Flood Threshold\'ları',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'icmp_flood_threshold', label: 'ICMP Flood Threshold (pps)', type: 'text', required: true, placeholder: '1000', hint: 'Saniyedeki ICMP paketi sınırı' },
                        { name: 'syn_flood_threshold', label: 'SYN Flood Threshold (pps)', type: 'text', required: true, placeholder: '10000', hint: 'Saniyedeki TCP SYN paketi sınırı' },
                        { name: 'udp_flood_threshold', label: 'UDP Flood Threshold (pps)', type: 'text', required: true, placeholder: '5000', hint: 'Saniyedeki UDP paketi sınırı' }
                    ]
                },
                {
                    title: 'Uygulama',
                    icon: 'fas fa-map-marker-alt',
                    info: 'Screen genellikle untrust zone\'a uygulanır. Dışarıdan gelen saldırı vektörlerini engeller.',
                    fields: [
                        { name: 'apply_zone', label: 'Apply Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Screen profili uygulanacak zone adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxScreenGen(data);
        });
    }
};
function cgSrxScreenGen(data) {
    const screenName = cgEsc(data.screen_name || ''), icmpFlood = cgEsc(data.icmp_flood_threshold || '');
    const synFlood = cgEsc(data.syn_flood_threshold || ''), udpFlood = cgEsc(data.udp_flood_threshold || ''), applyZone = cgEsc(data.apply_zone || '');
    let c = '# ========================================\n# Juniper SRX — Screens DoS\n# ========================================\n\n';
    c += 'set security screen ids-option ' + screenName + ' icmp flood threshold ' + icmpFlood + '\n';
    c += 'set security screen ids-option ' + screenName + ' tcp syn-flood alarm-threshold ' + synFlood + '\n';
    c += 'set security screen ids-option ' + screenName + ' udp flood threshold ' + udpFlood + '\n';
    c += 'set security screen ids-option ' + screenName + ' tcp land\n';
    c += 'set security screen ids-option ' + screenName + ' ip spoofing\n';
    c += 'set security zones security-zone ' + applyZone + ' screen ' + screenName + '\n';
    c += '\n# Doğrulama:\n# show security screen statistics zone ' + applyZone + '\n';
    return c;
}

// ── Juniper SRX: Custom Application ──────────────────────────────────────────
JuniperSRX.customapp = {
    label: 'Custom Application',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-puzzle-piece',
                title: 'Custom Application (SRX)',
                desc: 'Özel uygulama tanımı — protokol, port ve timeout değerleriyle security policy\'de kullanılır.<br>Örnek: <code>set applications application APP-CUSTOM-8443 protocol tcp destination-port 8443</code>'
            },
            sections: [
                {
                    title: 'Uygulama Tanımı',
                    icon: 'fas fa-puzzle-piece',
                    fields: [
                        { name: 'app_name', label: 'Application Adı', type: 'text', required: true, placeholder: 'APP-CUSTOM-8443', hint: 'Politikalarda referans alınacak uygulama adı' },
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'dst_port', label: 'Destination Port', type: 'text', validate: 'port', required: true, placeholder: '8443', hint: 'Tek port veya aralık (ör. 8080-8090)' },
                        { name: 'inactivity_timeout', label: 'Inactivity Timeout (saniye)', type: 'text', required: true, placeholder: '3600', hint: 'Hareketsizlik sonrası oturum kapanma süresi' },
                        { name: 'description', label: 'Açıklama', type: 'text', optional: true, placeholder: 'Custom HTTPS App', hint: 'Uygulama açıklaması; dokümantasyon için önerilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxCustomAppGen(data);
        });
    }
};
function cgSrxCustomAppGen(data) {
    const appName = cgEsc(data.app_name || ''), protocol = cgEsc(data.protocol || 'tcp'), dstPort = cgEsc(data.dst_port || '');
    const inactivityTimeout = cgEsc(data.inactivity_timeout || ''), description = cgEsc(data.description || '');
    let c = '# ========================================\n# Juniper SRX — Custom Application\n# ========================================\n\n';
    c += 'set applications application ' + appName + ' protocol ' + protocol + '\n';
    c += 'set applications application ' + appName + ' destination-port ' + dstPort + '\n';
    c += 'set applications application ' + appName + ' inactivity-timeout ' + inactivityTimeout + '\n';
    if (description) c += 'set applications application ' + appName + ' description "' + description + '"\n';
    c += '\n# Doğrulama:\n# show applications application ' + appName + '\n';
    return c;
}

// ── Juniper SRX: ALG Settings ────────────────────────────────────────────────
JuniperSRX.alg = {
    label: 'ALG Settings',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'ALG Settings (SRX)',
                desc: 'Application Layer Gateway — FTP, SIP, TFTP ve H.323 protokollerinin NAT geçişi ayarları.<br>Örnek: <code>set security alg sip disable</code>'
            },
            sections: [
                {
                    title: 'ALG Protokol Ayarları',
                    icon: 'fas fa-random',
                    info: 'SIP ALG VoIP sorunlarına yol açabilir. SIP proxy kullanıyorsanız devre dışı bırakmayı düşünün.',
                    fields: [
                        { name: 'ftp_val', label: 'FTP ALG', type: 'select', options: [
                            { value: 'enable', label: 'Etkin (enable)', selected: true },
                            { value: 'disable', label: 'Devre Dışı (disable)' }
                        ]},
                        { name: 'sip_val', label: 'SIP ALG', type: 'select', options: [
                            { value: 'enable', label: 'Etkin (enable)', selected: true },
                            { value: 'disable', label: 'Devre Dışı (disable)' }
                        ]},
                        { name: 'tftp_val', label: 'TFTP ALG', type: 'select', options: [
                            { value: 'enable', label: 'Etkin (enable)', selected: true },
                            { value: 'disable', label: 'Devre Dışı (disable)' }
                        ]},
                        { name: 'h323_val', label: 'H.323 ALG', type: 'select', options: [
                            { value: 'disable', label: 'Devre Dışı (disable)', selected: true },
                            { value: 'enable', label: 'Etkin (enable)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxAlgGen(data);
        });
    }
};
function cgSrxAlgGen(data) {
    const ftpVal = cgEsc(data.ftp_val || 'enable'), sipVal = cgEsc(data.sip_val || 'enable');
    const tftpVal = cgEsc(data.tftp_val || 'enable'), h323Val = cgEsc(data.h323_val || 'disable');
    let c = '# ========================================\n# Juniper SRX — ALG Settings\n# ========================================\n\n';
    c += 'set security alg ftp ' + ftpVal + '\n';
    c += 'set security alg sip ' + sipVal + '\n';
    c += 'set security alg tftp ' + tftpVal + '\n';
    c += 'set security alg h323 ' + h323Val + '\n';
    c += '\n# Doğrulama:\n# show security alg status\n';
    return c;
}

// ── Juniper SRX: J-Flow / NetFlow ────────────────────────────────────────────
JuniperSRX.jflow = {
    label: 'J-Flow / NetFlow',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'J-Flow / NetFlow (SRX)',
                desc: 'Trafik örnekleme ve akış verisi ihracatı — SIEM veya NetFlow collector\'a veri gönderimi.<br>Örnek: <code>set forwarding-options sampling instance JFLOW input rate 1</code>'
            },
            sections: [
                {
                    title: 'Flow Collector Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'flow_version', label: 'Flow Versiyonu', type: 'select', options: [
                            { value: '9', label: 'NetFlow v9', selected: true },
                            { value: 'ipfix', label: 'IPFIX' }
                        ]},
                        { name: 'collector_ip', label: 'Collector IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'NetFlow/IPFIX veri alacak sunucu IP' },
                        { name: 'port', label: 'Collector Port', type: 'text', validate: 'port', required: true, placeholder: '2055', hint: 'UDP port; varsayılan 2055' }
                    ]
                },
                {
                    title: 'Örnekleme Ayarları',
                    icon: 'fas fa-stopwatch',
                    fields: [
                        { name: 'active_timeout', label: 'Active Timeout (saniye)', type: 'text', required: true, placeholder: '60', hint: 'Aktif akış ihracat aralığı' },
                        { name: 'export_intf', label: 'Export Interface', type: 'text', required: true, placeholder: 'ge-0/0/0.0', hint: 'Örneklemenin etkinleştirileceği interface (unit dahil)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxJflowGen(data);
        });
    }
};
function cgSrxJflowGen(data) {
    const flowVersion = cgEsc(data.flow_version || '9'), collectorIp = cgEsc(data.collector_ip || ''), port = cgEsc(data.port || '');
    const activeTimeout = cgEsc(data.active_timeout || ''), exportIntf = cgEsc(data.export_intf || '');
    const intfParts = exportIntf.split('.');
    const intfBase = intfParts[0], intfUnit = intfParts[1] || '0';
    let c = '# ========================================\n# Juniper SRX — J-Flow / NetFlow\n# ========================================\n\n';
    c += 'set forwarding-options sampling instance JFLOW input rate 1\n';
    c += 'set forwarding-options sampling instance JFLOW family inet output flow-server ' + collectorIp + ' port ' + port + ' version9 template ipv4\n';
    c += 'set forwarding-options sampling instance JFLOW family inet output inline-jflow source-address (local-mgmt-ip)\n';
    c += 'set interfaces ' + intfBase + ' unit ' + intfUnit + ' family inet sampling input\n';
    c += 'set interfaces ' + intfBase + ' unit ' + intfUnit + ' family inet sampling output\n';
    c += '\n# Doğrulama:\n# show services flow-monitoring version9 template\n# show interfaces ' + intfBase + ' statistics\n';
    return c;
}

// ── Juniper SRX: SNMP v3 ─────────────────────────────────────────────────────
JuniperSRX.snmp = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-bar',
                title: 'SNMP v3 (SRX)',
                desc: 'Güvenli SNMP izleme — USM kullanıcısı, authentication ve privacy şifreleme ile trap konfigürasyonu.<br>Örnek: <code>set snmp v3 usm local-engine user snmp-v3 authentication-sha authentication-password ...</code>'
            },
            sections: [
                {
                    title: 'USM Kullanıcısı',
                    icon: 'fas fa-user-shield',
                    warn: 'SNMP kimlik bilgilerini güvenli şekilde saklayın. MD5 ve DES zayıf şifreleme kullanır; SHA + AES128 tercih edin.',
                    fields: [
                        { name: 'usm_user', label: 'USM Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmp-v3', hint: 'SNMP v3 USM kullanıcı adı' },
                        { name: 'auth_proto', label: 'Auth Protokolü', type: 'select', options: [
                            { value: 'sha', label: 'SHA (önerilen)', selected: true },
                            { value: 'md5', label: 'MD5 (zayıf)' }
                        ]},
                        { name: 'auth_pass', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'En az 8 karakter authentication şifresi' },
                        { name: 'priv_proto', label: 'Privacy Protokolü', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128 (önerilen)', selected: true },
                            { value: 'des', label: 'DES (zayıf)' }
                        ]},
                        { name: 'priv_pass', label: 'Privacy Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'En az 8 karakter privacy şifresi' }
                    ]
                },
                {
                    title: 'Trap Ayarları',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_group', label: 'Trap Group Adı', type: 'text', required: true, placeholder: 'TRAP-SERVERS', hint: 'SNMP trap hedef grubu adı' },
                        { name: 'target_ip', label: 'Target IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Trap\'lerin gönderileceği NMS/SIEM IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxSnmpGen(data);
        });
    }
};
function cgSrxSnmpGen(data) {
    const usmUser = cgEsc(data.usm_user || ''), authProto = cgEsc(data.auth_proto || 'sha'), authPass = cgEsc(data.auth_pass || '');
    const privProto = cgEsc(data.priv_proto || 'aes128'), privPass = cgEsc(data.priv_pass || '');
    const trapGroup = cgEsc(data.trap_group || ''), targetIp = cgEsc(data.target_ip || '');
    let c = '# ========================================\n# Juniper SRX — SNMP v3\n# ========================================\n\n';
    c += 'set snmp v3 usm local-engine user ' + usmUser + ' authentication-' + authProto + ' authentication-password ' + authPass + '\n';
    c += 'set snmp v3 usm local-engine user ' + usmUser + ' privacy-' + privProto + ' privacy-password ' + privPass + '\n';
    c += 'set snmp v3 target-parameters ' + usmUser + '-params parameters security-model usm security-level privacy security-name ' + usmUser + '\n';
    c += 'set snmp trap-group ' + trapGroup + ' version v3\n';
    c += 'set snmp trap-group ' + trapGroup + ' targets ' + targetIp + '\n';
    c += '\n# Doğrulama:\n# show snmp v3\n# show snmp statistics\n';
    return c;
}

// ── Juniper SRX: AAA / RADIUS ────────────────────────────────────────────────
JuniperSRX.aaa = {
    label: 'AAA / RADIUS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-id-card',
                title: 'AAA / RADIUS (SRX)',
                desc: 'Merkezi kimlik doğrulama — RADIUS server, authentication order ve access profile yapılandırması.<br>Örnek: <code>set access radius-server 10.0.0.10 secret RadiusSecret123</code>'
            },
            sections: [
                {
                    title: 'RADIUS Server',
                    icon: 'fas fa-server',
                    warn: 'RADIUS secret güvenli kanaldan iletilmeli. Üretimde EAP-TLS gibi sertifika tabanlı yöntemler tercih edin.',
                    fields: [
                        { name: 'server_ip', label: 'RADIUS Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'Birincil RADIUS kimlik doğrulama sunucusu' },
                        { name: 'secret', label: 'Shared Secret', type: 'text', required: true, placeholder: 'RadiusSecret123!', hint: 'RADIUS sunucuyla paylaşılan gizli anahtar' }
                    ]
                },
                {
                    title: 'Access Profile',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'access_profile', label: 'Access Profile Adı', type: 'text', required: true, placeholder: 'MGMT-ACCESS', hint: 'Yönetim erişimi için access profile adı' },
                        { name: 'auth_order', label: 'Authentication Order', type: 'select', options: [
                            { value: 'radius local', label: 'RADIUS → Yerel (önerilen)', selected: true },
                            { value: 'local radius', label: 'Yerel → RADIUS' },
                            { value: 'radius', label: 'Sadece RADIUS' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgSrxAaaGen(data);
        });
    }
};
function cgSrxAaaGen(data) {
    const serverIp = cgEsc(data.server_ip || ''), secret = cgEsc(data.secret || '');
    const authOrder = cgEsc(data.auth_order || 'radius local'), accessProfile = cgEsc(data.access_profile || '');
    let c = '# ========================================\n# Juniper SRX — AAA / RADIUS\n# ========================================\n\n';
    c += 'set access radius-server ' + serverIp + ' secret ' + secret + '\n';
    c += 'set access radius-server ' + serverIp + ' port 1812\n';
    c += 'set access profile ' + accessProfile + ' authentication-order ' + authOrder + '\n';
    c += 'set access profile ' + accessProfile + ' radius authentication-server ' + serverIp + '\n';
    c += 'set system authentication-order ' + authOrder + '\n';
    c += '\n# Doğrulama:\n# show access profile ' + accessProfile + '\n# show radius servers\n';
    return c;
}
