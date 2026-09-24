'use strict';

const CiscoASA = {};

// ── ASA: Interface ────────────────────────────────────────────────────────────
CiscoASA.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'ASA Interface',
                desc: 'ASA Interface — nameif ile mantıksal ad, güvenlik seviyesi (0-100) ve IP adresi atama.'
            },
            sections: [
                {
                    title: 'Outside (WAN)',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'out_iface', label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Fiziksel interface adı' },
                        { name: 'out_nameif', label: 'Nameif', type: 'text', required: true, placeholder: 'outside', hint: 'Mantıksal interface adı (nameif)' },
                        { name: 'out_sec', label: 'Security Level', type: 'text', required: true, placeholder: '0', hint: '0 = en az güvenilir (dış ağ)' },
                        { name: 'out_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'WAN IP adresi' },
                        { name: 'out_mask', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.252', hint: 'Subnet maskesi' }
                    ]
                },
                {
                    title: 'Inside (LAN)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'in_iface', label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Fiziksel interface adı' },
                        { name: 'in_nameif', label: 'Nameif', type: 'text', required: true, placeholder: 'inside', hint: 'Mantıksal interface adı (nameif)' },
                        { name: 'in_sec', label: 'Security Level', type: 'text', required: true, placeholder: '100', hint: '100 = en güvenilir (iç ağ)' },
                        { name: 'in_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'LAN gateway IP adresi' },
                        { name: 'in_mask', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0', hint: 'Subnet maskesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaIfaceGen(data);
        });
    }
};
function cgAsaIfaceGen(data) {
    const outIface = cgEsc(data.out_iface || ''), outNameif = cgEsc(data.out_nameif || '');
    const outSec = cgEsc(data.out_sec || '0'), outIp = cgEsc(data.out_ip || ''), outMask = cgEsc(data.out_mask || '');
    const inIface = cgEsc(data.in_iface || ''), inNameif = cgEsc(data.in_nameif || '');
    const inSec = cgEsc(data.in_sec || '100'), inIp = cgEsc(data.in_ip || ''), inMask = cgEsc(data.in_mask || '');
    let c = '# ========================================\n# Cisco ASA — Interface Configuration\n# ========================================\n\n';
    c += '! Outside Interface\ninterface ' + outIface + '\n';
    c += ' nameif ' + outNameif + '\n';
    c += ' security-level ' + outSec + '\n';
    c += ' ip address ' + outIp + ' ' + outMask + '\n';
    c += ' no shutdown\n!\n\n';
    c += '! Inside Interface\ninterface ' + inIface + '\n';
    c += ' nameif ' + inNameif + '\n';
    c += ' security-level ' + inSec + '\n';
    c += ' ip address ' + inIp + ' ' + inMask + '\n';
    c += ' no shutdown\n!\n\n';
    c += '# Doğrulama:\n# show interface ip brief\n# show nameif\n# show ip address\n';
    return c;
}

// ── ASA: NAT ──────────────────────────────────────────────────────────────────
CiscoASA.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'ASA NAT',
                desc: 'ASA NAT — Auto-NAT (object NAT) ve Manual-NAT (twice-nat) yapılandırması. Inside/outside interface çifti ile adres dönüşümü.'
            },
            configTypes: [
                { id: 'pat', label: 'Dynamic PAT', icon: 'fas fa-random', desc: 'Çok-çok NAT, interface IP üzerinde overload', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: 'Birebir statik adres dönüşümü', badge: { text: 'Statik', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Object Ayarları',
                    icon: 'fas fa-cube',
                    fields: [
                        { name: 'obj_name', label: 'Object Adı', type: 'text', required: true, placeholder: 'LAN_NET', hint: 'NAT nesnesi için isim' }
                    ]
                },
                {
                    title: 'Dynamic PAT Ayarları',
                    icon: 'fas fa-random',
                    showFor: ['pat'],
                    fields: [
                        { name: 'pat_subnet', label: 'İç Subnet', type: 'text', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'NAT edilecek iç ağ (IP + mask)' },
                        { name: 'pat_inside', label: 'Inside Interface', type: 'text', required: true, placeholder: 'inside', hint: 'İç taraf nameif' },
                        { name: 'pat_outside', label: 'Outside Interface', type: 'text', required: true, placeholder: 'outside', hint: 'Dış taraf nameif' }
                    ]
                },
                {
                    title: 'Static NAT Ayarları',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['static'],
                    fields: [
                        { name: 'static_host', label: 'İç Host', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.10', hint: 'NAT edilecek iç IP adresi' },
                        { name: 'static_mapped', label: 'Dış (Mapped) IP', type: 'text', validate: 'ip', optional: true, placeholder: '203.0.113.10', hint: 'Dışarıya görünen IP adresi' },
                        { name: 'static_inside', label: 'Inside Interface', type: 'text', optional: true, placeholder: 'inside', hint: 'İç taraf nameif' },
                        { name: 'static_outside', label: 'Outside Interface', type: 'text', optional: true, placeholder: 'outside', hint: 'Dış taraf nameif' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaNatGen(data);
        });
    }
};
function cgAsaNatGen(data) {
    const type = cgEsc(data._cgtype || 'pat'), obj = cgEsc(data.obj_name || '');
    let c = '# ========================================\n# Cisco ASA — NAT Configuration\n# ========================================\n\n';
    if (type === 'pat') {
        const subnet = cgEsc(data.pat_subnet || ''), inside = cgEsc(data.pat_inside || ''), outside = cgEsc(data.pat_outside || '');
        c += '! Dynamic PAT (Interface Overload)\nobject network ' + obj + '\n subnet ' + subnet + '\n nat (' + inside + ',' + outside + ') dynamic interface\n!\n\n';
    } else {
        const host = cgEsc(data.static_host || ''), mapped = cgEsc(data.static_mapped || '');
        const inside = cgEsc(data.static_inside || ''), outside = cgEsc(data.static_outside || '');
        c += '! Static NAT (One-to-One)\nobject network ' + obj + '\n host ' + host + '\n nat (' + inside + ',' + outside + ') static ' + mapped + '\n!\n\n';
    }
    c += '# Doğrulama:\n# show nat\n# show nat detail\n# show xlate\n';
    return c;
}

// ── ASA: ACL ──────────────────────────────────────────────────────────────────
CiscoASA.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ASA ACL',
                desc: 'ASA ACL — interface bazlı erişim kontrol listesi. Inbound/outbound yön belirtimi, real-IP veya mapped-IP kullanımı.'
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', label: 'ACL Adı', type: 'text', required: true, placeholder: 'OUTSIDE_IN', hint: 'Access-list ismi' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'Permit', selected: true },
                            { value: 'deny', label: 'Deny' }
                        ]},
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'ip', label: 'IP' },
                            { value: 'icmp', label: 'ICMP' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak / Hedef',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'src', label: 'Kaynak', type: 'text', required: true, placeholder: 'any veya 192.168.1.0 255.255.255.0', hint: 'Kaynak IP adresi veya any' },
                        { name: 'dst', label: 'Hedef', type: 'text', required: true, placeholder: 'host 203.0.113.10 veya any', hint: 'Hedef IP adresi veya host' },
                        { name: 'dst_port', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: 'eq 80 veya range 80 443', hint: 'TCP/UDP için port belirtimi' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_iface', label: 'Uygulama Interface (Nameif)', type: 'text', optional: true, placeholder: 'outside', hint: 'ACL bağlanacak interface (boş bırakılabilir)' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'in', selected: true },
                            { value: 'out', label: 'out' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAclGen(data);
        });
    }
};
function cgAsaAclGen(data) {
    const name = cgEsc(data.acl_name || ''), action = cgEsc(data.action || 'permit'), proto = cgEsc(data.proto || 'tcp');
    const src = cgEsc(data.src || ''), dst = cgEsc(data.dst || ''), port = cgEsc(data.dst_port || '');
    const applyIface = cgEsc(data.apply_iface || ''), dir = cgEsc(data.direction || 'in');
    let c = '# ========================================\n# Cisco ASA — ACL Configuration\n# ========================================\n\n';
    let rule = 'access-list ' + name + ' extended ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (port && (proto === 'tcp' || proto === 'udp')) rule += ' ' + port;
    c += rule + '\n';
    c += 'access-list ' + name + ' extended deny ip any any\n\n';
    if (applyIface) {
        c += 'access-group ' + name + ' ' + dir + ' interface ' + applyIface + '\n\n';
    }
    c += '# Doğrulama:\n# show access-list ' + name + '\n# show access-group\n';
    return c;
}

// ── ASA: VPN (Site-to-Site IKEv1/v2) ─────────────────────────────────────────
CiscoASA.vpn = {
    label: 'VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'ASA Site-to-Site VPN',
                desc: 'ASA Site-to-Site VPN — IKEv1/v2 ISAKMP policy, transform-set ve crypto-map. Peer IP ve pre-shared key yapılandırması.'
            },
            sections: [
                {
                    title: 'Tunnel Parametreleri',
                    icon: 'fas fa-tunnel',
                    fields: [
                        { name: 'outside_iface', label: 'Outside Interface', type: 'text', required: true, placeholder: 'outside', hint: 'VPN bitişinin bağlı olduğu nameif' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Uzak VPN endpoint IP adresi' },
                        { name: 'psk', label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'MyS3cr3tKey!', hint: 'Paylaşılan gizli anahtar' }
                    ]
                },
                {
                    title: 'Korunan Ağlar',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'local_net', label: 'Yerel Network', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'Yerel korunan ağ (IP + mask)' },
                        { name: 'remote_net', label: 'Uzak Network', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.0 255.255.255.0', hint: 'Uzak korunan ağ (IP + mask)' }
                    ]
                },
                {
                    title: 'Şifreleme Politikası',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'enc', label: 'IKE Şifreleme', type: 'select', options: [
                            { value: 'aes-256', label: 'AES-256', selected: true },
                            { value: 'aes-128', label: 'AES-128' },
                            { value: 'aes', label: 'AES' }
                        ], hint: 'IKE Phase 1 şifreleme algoritması' },
                        { name: 'hash', label: 'IKE Hash', type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha', label: 'SHA-1' },
                            { value: 'md5', label: 'MD5' }
                        ], hint: 'IKE bütünlük algoritması' },
                        { name: 'dhgrp', label: 'DH Group', type: 'select', options: [
                            { value: '14', label: 'Group 14 (2048-bit)', selected: true },
                            { value: '19', label: 'Group 19 (256-bit EC)' },
                            { value: '5', label: 'Group 5 (1536-bit)' }
                        ], hint: 'Diffie-Hellman anahtar değişim grubu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaVpnGen(data);
        });
    }
};
function cgAsaVpnGen(data) {
    const oiface = cgEsc(data.outside_iface || ''), peer = cgEsc(data.peer_ip || ''), psk = cgEsc(data.psk || '');
    const localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
    const enc = cgEsc(data.enc || 'aes-256'), hash = cgEsc(data.hash || 'sha256'), dhgrp = cgEsc(data.dhgrp || '14');
    const aclName = 'CRYPTO_ACL_' + peer.replace(/\./g, '_');
    let c = '# ========================================\n# Cisco ASA — IPSec VPN (Site-to-Site)\n# ========================================\n\n';
    c += '! Phase 1 — IKEv1 Policy\ncrypto isakmp enable ' + oiface + '\ncrypto isakmp policy 10\n';
    c += ' authentication pre-share\n encryption ' + enc + '\n hash ' + hash + '\n group ' + dhgrp + '\n lifetime 86400\n!\n\n';
    c += '! Phase 2 — Transform Set\ncrypto ipsec ikev1 transform-set TS esp-' + enc + ' esp-' + hash + '-hmac\n!\n\n';
    c += '! Tunnel Group (Peer)\ntunnel-group ' + peer + ' type ipsec-l2l\ntunnel-group ' + peer + ' ipsec-attributes\n ikev1 pre-shared-key ' + psk + '\n!\n\n';
    c += '! Crypto ACL\naccess-list ' + aclName + ' extended permit ip ' + localNet + ' ' + remoteNet + '\n!\n\n';
    c += '! Crypto Map\ncrypto map CMAP 10 match address ' + aclName + '\ncrypto map CMAP 10 set peer ' + peer + '\ncrypto map CMAP 10 set ikev1 transform-set TS\ncrypto map CMAP interface ' + oiface + '\n\n';
    c += '# Doğrulama:\n# show crypto isakmp sa\n# show crypto ipsec sa\n# show crypto map\n# show vpn-sessiondb l2l\n';
    return c;
}

// ── ASA: AAA ──────────────────────────────────────────────────────────────────
CiscoASA.aaa = {
    label: 'AAA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'ASA AAA',
                desc: 'ASA AAA — LOCAL, LDAP veya RADIUS kimlik doğrulama. Console, SSH ve HTTP yönetim erişimi için.'
            },
            configTypes: [
                { id: 'local', label: 'LOCAL', icon: 'fas fa-user', desc: 'Yerel kullanıcı veritabanı ile kimlik doğrulama', badge: { text: 'Basit', cls: 'common' } },
                { id: 'ldap', label: 'LDAP', icon: 'fas fa-sitemap', desc: 'Active Directory / LDAP sunucu entegrasyonu', badge: { text: 'Kurumsal', cls: 'recommended' } },
                { id: 'radius', label: 'RADIUS', icon: 'fas fa-server', desc: 'RADIUS sunucu ile merkezi kimlik doğrulama', badge: { text: 'AAA', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Yönetim Erişimi',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'ssh_enable', label: 'SSH Kimlik Doğrulama', type: 'checkbox', checked: true, hint: 'SSH erişimini AAA ile doğrula' },
                        { name: 'http_enable', label: 'ASDM/HTTP Kimlik Doğrulama', type: 'checkbox', checked: true, hint: 'ASDM web arayüzü için AAA' },
                        { name: 'console_enable', label: 'Console Kimlik Doğrulama', type: 'checkbox', checked: false, hint: 'Console erişimini AAA ile doğrula' }
                    ]
                },
                {
                    title: 'LDAP Sunucu Ayarları',
                    icon: 'fas fa-sitemap',
                    showFor: ['ldap'],
                    fields: [
                        { name: 'ldap_server', label: 'LDAP Sunucu IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.100', hint: 'Active Directory / LDAP sunucu IP' },
                        { name: 'ldap_base', label: 'Base DN', type: 'text', optional: true, placeholder: 'DC=corp,DC=local', hint: 'LDAP arama başlangıç noktası' },
                        { name: 'ldap_bind', label: 'Bind DN', type: 'text', optional: true, placeholder: 'CN=svc-asa,OU=ServiceAccounts,DC=corp,DC=local', hint: 'Bağlantı için kullanıcı DN' },
                        { name: 'ldap_pass', label: 'Bind Password', type: 'text', optional: true, placeholder: 'P@ssw0rd', hint: 'Bind kullanıcı şifresi' },
                        { name: 'ldap_grp', label: 'Server Group Adı', type: 'text', optional: true, placeholder: 'LDAP-AD', hint: 'AAA server-group ismi' }
                    ]
                },
                {
                    title: 'RADIUS Sunucu Ayarları',
                    icon: 'fas fa-server',
                    showFor: ['radius'],
                    fields: [
                        { name: 'rad_server', label: 'RADIUS Sunucu IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.200', hint: 'RADIUS sunucu IP adresi' },
                        { name: 'rad_key', label: 'Shared Secret', type: 'text', optional: true, placeholder: 'radius_secret', hint: 'RADIUS paylaşılan gizli anahtar' },
                        { name: 'rad_grp', label: 'Server Group Adı', type: 'text', optional: true, placeholder: 'RADIUS-SRV', hint: 'AAA server-group ismi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAaaGen(data);
        });
    }
};
function cgAsaAaaGen(data) {
    const authType = cgEsc(data._cgtype || 'local');
    const sshEnable = data.ssh_enable, httpEnable = data.http_enable, consoleEnable = data.console_enable;
    let c = '# ========================================\n# Cisco ASA — AAA Configuration\n# ========================================\n\n';
    let serverGrp = 'LOCAL';
    if (authType === 'ldap') {
        const ldapServer = cgEsc(data.ldap_server || ''), ldapBase = cgEsc(data.ldap_base || '');
        const ldapBind = cgEsc(data.ldap_bind || ''), ldapPass = cgEsc(data.ldap_pass || '');
        const ldapGrp = cgEsc(data.ldap_grp || 'LDAP-AD');
        serverGrp = ldapGrp;
        c += '! LDAP Sunucu Tanımı\naaa-server ' + ldapGrp + ' protocol ldap\naaa-server ' + ldapGrp + ' (inside) host ' + ldapServer + '\n';
        c += ' ldap-base-dn ' + ldapBase + '\n';
        c += ' ldap-scope subtree\n';
        c += ' ldap-naming-attribute sAMAccountName\n';
        if (ldapBind) c += ' server-type microsoft\n ldap-login-dn ' + ldapBind + '\n ldap-login-password ' + ldapPass + '\n';
        c += '!\n\n';
    } else if (authType === 'radius') {
        const radServer = cgEsc(data.rad_server || ''), radKey = cgEsc(data.rad_key || '');
        const radGrp = cgEsc(data.rad_grp || 'RADIUS-SRV');
        serverGrp = radGrp;
        c += '! RADIUS Sunucu Tanımı\naaa-server ' + radGrp + ' protocol radius\naaa-server ' + radGrp + ' (inside) host ' + radServer + '\n';
        c += ' key ' + radKey + '\n!\n\n';
    }
    c += '! AAA Kimlik Doğrulama Kuralları\n';
    if (sshEnable) c += 'aaa authentication ssh console ' + serverGrp + '\n';
    if (httpEnable) c += 'aaa authentication http console ' + serverGrp + '\n';
    if (consoleEnable) c += 'aaa authentication serial console ' + serverGrp + '\n';
    c += '\n# Doğrulama:\n# show aaa-server\n# show aaa-server ' + serverGrp + '\n# test aaa authentication ' + serverGrp + ' username admin password test\n';
    return c;
}

// ── ASA: Route Map (Static Route + PBR) ──────────────────────────────────────
CiscoASA.routeMap = {
    label: 'Route Map',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'ASA Routing',
                desc: 'ASA Routing — static route ve PBR (Policy-Based Routing) ile trafik yönlendirme.'
            },
            configTypes: [
                { id: 'static', label: 'Static Route', icon: 'fas fa-map-signs', desc: 'Hedef ağa statik rota tanımı', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'pbr', label: 'Policy-Based Routing', icon: 'fas fa-route', desc: 'Kaynak/protokol bazlı trafik yönlendirme (route-map)', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Static Route',
                    icon: 'fas fa-map-signs',
                    showFor: ['static'],
                    fields: [
                        { name: 'nameif', label: 'Interface (Nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'Çıkış interface nameif değeri' },
                        { name: 'network', label: 'Hedef Network', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Hedef ağ adresi (0.0.0.0 = default route)' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '0.0.0.0', hint: 'Hedef ağ maskesi' },
                        { name: 'nexthop', label: 'Next-Hop (Gateway)', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Bir sonraki atlamanın IP adresi' },
                        { name: 'metric', label: 'Metric', type: 'text', optional: true, placeholder: '1', hint: 'Route metrik değeri (default: 1)' }
                    ]
                },
                {
                    title: 'PBR Route-Map Tanımı',
                    icon: 'fas fa-route',
                    showFor: ['pbr'],
                    fields: [
                        { name: 'rm_name', label: 'Route-Map Adı', type: 'text', optional: true, placeholder: 'PBR_MAP', hint: 'Route-map tanımı için isim' },
                        { name: 'rm_seq', label: 'Sequence', type: 'text', optional: true, placeholder: '10', hint: 'Route-map sequence numarası' },
                        { name: 'acl_match', label: 'Match ACL Adı', type: 'text', optional: true, placeholder: 'PBR_ACL', hint: 'Eşleşme kriteri olarak kullanılacak ACL' },
                        { name: 'src_net', label: 'Kaynak Network (ACL)', type: 'text', optional: true, placeholder: '192.168.10.0 255.255.255.0', hint: 'PBR uygulanacak kaynak ağ' },
                        { name: 'pbr_nexthop', label: 'PBR Next-Hop IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.254', hint: 'Eşleşen trafiğin yönlendirileceği IP' },
                        { name: 'pbr_iface', label: 'PBR Interface (Nameif)', type: 'text', optional: true, placeholder: 'inside', hint: 'Route-map uygulanacak interface' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaRouteMapGen(data);
        });
    }
};
function cgAsaRouteMapGen(data) {
    const type = cgEsc(data._cgtype || 'static');
    let c = '# ========================================\n# Cisco ASA — Routing Configuration\n# ========================================\n\n';
    if (type === 'static') {
        const nameif = cgEsc(data.nameif || ''), network = cgEsc(data.network || '');
        const mask = cgEsc(data.mask || ''), nexthop = cgEsc(data.nexthop || '');
        const metric = cgEsc(data.metric || '1');
        c += 'route ' + nameif + ' ' + network + ' ' + mask + ' ' + nexthop + ' ' + metric + '\n\n';
        c += '# Doğrulama:\n# show route\n# show route ' + network + '\n';
    } else {
        const rmName = cgEsc(data.rm_name || 'PBR_MAP'), rmSeq = cgEsc(data.rm_seq || '10');
        const aclMatch = cgEsc(data.acl_match || 'PBR_ACL'), srcNet = cgEsc(data.src_net || '');
        const pbrNexthop = cgEsc(data.pbr_nexthop || ''), pbrIface = cgEsc(data.pbr_iface || '');
        if (srcNet) {
            c += '! PBR — Eşleşme ACL\naccess-list ' + aclMatch + ' extended permit ip ' + srcNet + ' any\n!\n\n';
        }
        c += '! PBR — Route-Map\nroute-map ' + rmName + ' permit ' + rmSeq + '\n';
        c += ' match ip address ' + aclMatch + '\n';
        c += ' set ip next-hop ' + pbrNexthop + '\n!\n\n';
        if (pbrIface) {
            c += '! Route-Map Uygulama\ninterface ' + pbrIface + '\n ip policy route-map ' + rmName + '\n!\n\n';
        }
        c += '# Doğrulama:\n# show route-map\n# show ip policy\n# debug ip policy\n';
    }
    return c;
}

// ── ASA: MPF Service Policy ───────────────────────────────────────────────────
CiscoASA.mpfServicePolicy = {
    label: 'MPF Service Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'ASA MPF',
                desc: 'ASA MPF — Modular Policy Framework. Class-map ile trafik sınıflandırma, policy-map ile aksiyon atama.'
            },
            sections: [
                {
                    title: 'Class-Map (Trafik Sınıfı)',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'class_name', label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'INSPECT_HTTP', hint: 'Trafik sınıfı için isim' },
                        { name: 'class_acl', label: 'Match ACL Adı', type: 'text', required: true, placeholder: 'HTTP_ACL', hint: 'Eşleşme kriteri ACL adı' },
                        { name: 'match_src', label: 'Kaynak Network', type: 'text', required: true, placeholder: 'any', hint: 'Kaynak IP (any veya subnet mask formatı)' },
                        { name: 'match_dst', label: 'Hedef Network', type: 'text', required: true, placeholder: 'any', hint: 'Hedef IP (any veya subnet mask formatı)' },
                        { name: 'match_port', label: 'Hedef Port', type: 'text', optional: true, placeholder: 'eq 80', hint: 'Eşleştirilecek port (ör: eq 80)' }
                    ]
                },
                {
                    title: 'Policy-Map (Aksiyon)',
                    icon: 'fas fa-tasks',
                    fields: [
                        { name: 'policy_name', label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'INSPECT_POLICY', hint: 'Politika için isim' },
                        { name: 'inspect_proto', label: 'Inspect Protokolü', type: 'select', options: [
                            { value: 'http', label: 'HTTP', selected: true },
                            { value: 'ftp', label: 'FTP' },
                            { value: 'smtp', label: 'SMTP' },
                            { value: 'dns', label: 'DNS' },
                            { value: 'sip', label: 'SIP' },
                            { value: 'rtsp', label: 'RTSP' }
                        ], hint: 'Deep inspection için protokol' },
                        { name: 'enable_inspect', label: 'Inspect Aktif', type: 'checkbox', checked: true, hint: 'Seçili protokolü inspect et' }
                    ]
                },
                {
                    title: 'Service Policy Uygulama',
                    icon: 'fas fa-play',
                    fields: [
                        { name: 'sp_name', label: 'Service Policy Adı', type: 'text', required: true, placeholder: 'GLOBAL_POLICY', hint: 'service-policy komutunda kullanılacak isim' },
                        { name: 'sp_scope', label: 'Kapsam', type: 'select', options: [
                            { value: 'global', label: 'Global (tüm interface)', selected: true },
                            { value: 'interface', label: 'Belirli Interface' }
                        ]},
                        { name: 'sp_iface', label: 'Interface (Nameif)', type: 'text', optional: true, placeholder: 'outside', hint: 'Belirli interface seçiliyse nameif girin' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaMpfGen(data);
        });
    }
};
function cgAsaMpfGen(data) {
    const className = cgEsc(data.class_name || ''), classAcl = cgEsc(data.class_acl || '');
    const matchSrc = cgEsc(data.match_src || 'any'), matchDst = cgEsc(data.match_dst || 'any');
    const matchPort = cgEsc(data.match_port || '');
    const policyName = cgEsc(data.policy_name || ''), inspectProto = cgEsc(data.inspect_proto || 'http');
    const enableInspect = data.enable_inspect;
    const spName = cgEsc(data.sp_name || ''), spScope = cgEsc(data.sp_scope || 'global');
    const spIface = cgEsc(data.sp_iface || '');
    let c = '# ========================================\n# Cisco ASA — MPF Service Policy\n# ========================================\n\n';
    c += '! 1. ACL Tanımı\naccess-list ' + classAcl + ' extended permit ' + inspectProto + ' ' + matchSrc + ' ' + matchDst;
    if (matchPort) c += ' ' + matchPort;
    c += '\n!\n\n';
    c += '! 2. Class-Map\nclass-map ' + className + '\n match access-list ' + classAcl + '\n!\n\n';
    c += '! 3. Policy-Map\npolicy-map ' + policyName + '\n class ' + className + '\n';
    if (enableInspect) c += '  inspect ' + inspectProto + '\n';
    c += '!\n\n';
    c += '! 4. Service Policy\n';
    if (spScope === 'global') {
        c += 'service-policy ' + spName + ' global\n\n';
    } else {
        c += 'service-policy ' + spName + ' interface ' + spIface + '\n\n';
    }
    c += '# Doğrulama:\n# show service-policy\n# show service-policy global\n# show service-policy interface ' + (spIface || 'outside') + '\n';
    return c;
}

// ── ASA: Failover HA ──────────────────────────────────────────────────────────
CiscoASA.failoverHA = {
    label: 'Failover HA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sync-alt',
                title: 'ASA Failover HA',
                desc: 'ASA Failover — Active/Standby veya Active/Active yüksek erişilebilirlik. Failover link ve state link konfigürasyonu.'
            },
            configTypes: [
                { id: 'active_standby', label: 'Active/Standby', icon: 'fas fa-toggle-on', desc: 'Tek aktif cihaz, yedek beklemede', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'active_active', label: 'Active/Active', icon: 'fas fa-random', desc: 'Her iki cihaz aktif, context bazlı', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Failover Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'fo_key', label: 'Failover Key', type: 'text', required: true, placeholder: 'FoSecretKey123', hint: 'Failover iletişim şifreleme anahtarı' },
                        { name: 'fo_iface', label: 'Failover Link Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/3', hint: 'Failover kontrolü için kullanılan interface' },
                        { name: 'fo_iface_nameif', label: 'Failover Link Nameif', type: 'text', required: true, placeholder: 'failover', hint: 'Failover interface mantıksal adı' }
                    ]
                },
                {
                    title: 'Active/Standby IP Adresleri',
                    icon: 'fas fa-exchange-alt',
                    showFor: ['active_standby'],
                    fields: [
                        { name: 'active_ip', label: 'Aktif Cihaz IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1', hint: 'Failover link — aktif ASA IP' },
                        { name: 'standby_ip', label: 'Standby Cihaz IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'Failover link — standby ASA IP' },
                        { name: 'fo_mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.252', hint: 'Failover link subnet maskesi' },
                        { name: 'state_iface', label: 'State Link Interface', type: 'text', optional: true, placeholder: 'GigabitEthernet0/2', hint: 'Session state senkronizasyon interface' },
                        { name: 'state_active_ip', label: 'State Link Aktif IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.1.1', hint: 'State link — aktif IP' },
                        { name: 'state_standby_ip', label: 'State Link Standby IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.1.2', hint: 'State link — standby IP' },
                        { name: 'state_mask', label: 'State Link Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.252', hint: 'State link subnet maskesi' }
                    ]
                },
                {
                    title: 'Active/Active Failover Grubu',
                    icon: 'fas fa-layer-group',
                    showFor: ['active_active'],
                    fields: [
                        { name: 'aa_grp1_active', label: 'Grup 1 — Aktif Cihaz', type: 'text', optional: true, placeholder: 'primary', hint: 'primary veya secondary' },
                        { name: 'aa_grp2_active', label: 'Grup 2 — Aktif Cihaz', type: 'text', optional: true, placeholder: 'secondary', hint: 'primary veya secondary' },
                        { name: 'aa_active_ip', label: 'Failover Link Aktif IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1', hint: 'Failover link IP' },
                        { name: 'aa_standby_ip', label: 'Failover Link Standby IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'Failover link standby IP' },
                        { name: 'aa_mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.252', hint: 'Failover link maskesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaFailoverGen(data);
        });
    }
};
function cgAsaFailoverGen(data) {
    const foType = cgEsc(data._cgtype || 'active_standby');
    const foKey = cgEsc(data.fo_key || ''), foIface = cgEsc(data.fo_iface || '');
    const foIfaceNameif = cgEsc(data.fo_iface_nameif || 'failover');
    let c = '# ========================================\n# Cisco ASA — Failover HA\n# ========================================\n\n';
    c += 'failover\nfailover key ' + foKey + '\n\n';
    if (foType === 'active_standby') {
        const activeIp = cgEsc(data.active_ip || ''), standbyIp = cgEsc(data.standby_ip || '');
        const foMask = cgEsc(data.fo_mask || '');
        const stateIface = cgEsc(data.state_iface || ''), stateActiveIp = cgEsc(data.state_active_ip || '');
        const stateStandbyIp = cgEsc(data.state_standby_ip || ''), stateMask = cgEsc(data.state_mask || '');
        c += '! Failover Link\ninterface ' + foIface + '\n no shutdown\n!\n';
        c += 'failover interface ip ' + foIfaceNameif + ' ' + activeIp + ' ' + foMask + ' standby ' + standbyIp + '\n';
        c += 'failover link ' + foIfaceNameif + ' ' + foIface + '\n\n';
        if (stateIface && stateActiveIp) {
            c += '! State Link\ninterface ' + stateIface + '\n no shutdown\n!\n';
            c += 'failover interface ip stateful ' + stateActiveIp + ' ' + stateMask + ' standby ' + stateStandbyIp + '\n';
            c += 'failover state-link stateful ' + stateIface + '\n\n';
        }
        c += '# Bu konfigürasyonu aktif cihaza uygula\n# Standby cihaz otomatik sync alır\n\n';
    } else {
        const grp1Active = cgEsc(data.aa_grp1_active || 'primary'), grp2Active = cgEsc(data.aa_grp2_active || 'secondary');
        const aaActiveIp = cgEsc(data.aa_active_ip || ''), aaStandbyIp = cgEsc(data.aa_standby_ip || '');
        const aaMask = cgEsc(data.aa_mask || '');
        c += '! Active/Active — Multi-Context gereklidir\nmode multiple\n\n';
        c += '! Failover Link\ninterface ' + foIface + '\n no shutdown\n!\n';
        c += 'failover interface ip ' + foIfaceNameif + ' ' + aaActiveIp + ' ' + aaMask + ' standby ' + aaStandbyIp + '\n';
        c += 'failover link ' + foIfaceNameif + ' ' + foIface + '\n\n';
        c += '! Failover Grupları\nfailover group 1\n primary\n preempt\n!\n';
        c += 'failover group 2\n ' + (grp2Active === 'secondary' ? 'secondary' : 'primary') + '\n preempt\n!\n\n';
    }
    c += '# Doğrulama:\n# show failover\n# show failover state\n# show failover statistics\n';
    return c;
}

// ── ASA: AAA RADIUS ───────────────────────────────────────────────────────────
CiscoASA.aaaRadius = {
    label: 'AAA RADIUS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'ASA AAA RADIUS',
                desc: 'ASA AAA RADIUS — RADIUS sunucu grubu tanımı, timeout, retry ve kimlik doğrulama protokolü.'
            },
            sections: [
                {
                    title: 'RADIUS Sunucu Grubu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'grp_name', label: 'Server Group Adı', type: 'text', required: true, placeholder: 'RADIUS-SERVERS', hint: 'AAA server-group tanımı için isim' },
                        { name: 'rad_iface', label: 'Bağlantı Interface (Nameif)', type: 'text', required: true, placeholder: 'inside', hint: 'RADIUS sunucusuna erişim interface' }
                    ]
                },
                {
                    title: 'Birincil RADIUS Sunucu',
                    icon: 'fas fa-star',
                    fields: [
                        { name: 'rad1_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Birincil RADIUS sunucu IP adresi' },
                        { name: 'rad1_key', label: 'Shared Secret', type: 'text', required: true, placeholder: 'radius_secret_key', hint: 'ASA ve sunucu arasında paylaşılan gizli anahtar' },
                        { name: 'rad1_auth_port', label: 'Auth Port', type: 'text', validate: 'port', optional: true, placeholder: '1812', hint: 'RADIUS authentication portu (default: 1645)' },
                        { name: 'rad1_acct_port', label: 'Accounting Port', type: 'text', validate: 'port', optional: true, placeholder: '1813', hint: 'RADIUS accounting portu (default: 1646)' }
                    ]
                },
                {
                    title: 'İkincil RADIUS Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'rad2_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.101', hint: 'Yedek RADIUS sunucu (opsiyonel)' },
                        { name: 'rad2_key', label: 'Shared Secret', type: 'text', optional: true, placeholder: 'radius_secret_key', hint: 'İkincil sunucu shared secret' }
                    ]
                },
                {
                    title: 'Timeout ve Retry Ayarları',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'timeout', label: 'Timeout (saniye)', type: 'text', optional: true, placeholder: '10', hint: 'RADIUS sunucu yanıt bekleme süresi (default: 10)' },
                        { name: 'retries', label: 'Retry Sayısı', type: 'text', optional: true, placeholder: '3', hint: 'Başarısız deneme tekrar sayısı (default: 3)' },
                        { name: 'dead_time', label: 'Dead Time (dakika)', type: 'text', optional: true, placeholder: '10', hint: 'Erişilemeyen sunucunun tekrar denenmesi için bekleme süresi' }
                    ]
                },
                {
                    title: 'AAA Uygulama',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'apply_ssh', label: 'SSH Authentication', type: 'checkbox', checked: true, hint: 'SSH yönetim erişimi için RADIUS kullan' },
                        { name: 'apply_http', label: 'ASDM Authentication', type: 'checkbox', checked: false, hint: 'ASDM web erişimi için RADIUS kullan' },
                        { name: 'apply_vpn', label: 'VPN Authentication', type: 'checkbox', checked: true, hint: 'VPN kullanıcı doğrulaması için RADIUS kullan' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAaaRadiusGen(data);
        });
    }
};
function cgAsaAaaRadiusGen(data) {
    const grpName = cgEsc(data.grp_name || ''), radIface = cgEsc(data.rad_iface || '');
    const rad1Ip = cgEsc(data.rad1_ip || ''), rad1Key = cgEsc(data.rad1_key || '');
    const rad1AuthPort = cgEsc(data.rad1_auth_port || ''), rad1AcctPort = cgEsc(data.rad1_acct_port || '');
    const rad2Ip = cgEsc(data.rad2_ip || ''), rad2Key = cgEsc(data.rad2_key || '');
    const timeout = cgEsc(data.timeout || '10'), retries = cgEsc(data.retries || '3');
    const deadTime = cgEsc(data.dead_time || '');
    const applySsh = data.apply_ssh, applyHttp = data.apply_http, applyVpn = data.apply_vpn;
    let c = '# ========================================\n# Cisco ASA — AAA RADIUS\n# ========================================\n\n';
    c += '! RADIUS Server Group\naaa-server ' + grpName + ' protocol radius\n';
    if (deadTime) c += ' deadtime ' + deadTime + '\n';
    c += '!\n\n';
    c += '! Birincil RADIUS Sunucu\naaa-server ' + grpName + ' (' + radIface + ') host ' + rad1Ip + '\n';
    c += ' key ' + rad1Key + '\n';
    c += ' timeout ' + timeout + '\n';
    c += ' retry-interval ' + retries + '\n';
    if (rad1AuthPort) c += ' authentication-port ' + rad1AuthPort + '\n';
    if (rad1AcctPort) c += ' accounting-port ' + rad1AcctPort + '\n';
    c += '!\n\n';
    if (rad2Ip && rad2Key) {
        c += '! İkincil RADIUS Sunucu\naaa-server ' + grpName + ' (' + radIface + ') host ' + rad2Ip + '\n';
        c += ' key ' + rad2Key + '\n';
        c += ' timeout ' + timeout + '\n';
        c += ' retry-interval ' + retries + '\n!\n\n';
    }
    c += '! AAA Authentication Kuralları\n';
    if (applySsh) c += 'aaa authentication ssh console ' + grpName + ' LOCAL\n';
    if (applyHttp) c += 'aaa authentication http console ' + grpName + ' LOCAL\n';
    if (applyVpn) c += 'aaa authentication match ANY_TRAFFIC ' + radIface + ' ' + grpName + '\n';
    c += '\n# Doğrulama:\n# show aaa-server\n# show aaa-server ' + grpName + '\n# show aaa-server ' + grpName + ' host ' + rad1Ip + '\n';
    c += '# test aaa-server authentication ' + grpName + ' host ' + rad1Ip + ' username testuser password testpass\n';
    return c;
}

// ── ASA: OSPF ─────────────────────────────────────────────────────────────────
CiscoASA.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'ASA OSPF',
                desc: 'ASA OSPF — OSPF process, network duyurusu ve interface parametreleri. Router-ID ve area konfigürasyonu.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', optional: true, placeholder: '1.1.1.1', hint: 'OSPF Router-ID (opsiyonel)' },
                        { name: 'network', label: 'Network', type: 'text', required: true, placeholder: '192.168.1.0', hint: 'OSPF duyurulacak ağ' },
                        { name: 'wildcard', label: 'Wildcard Mask', type: 'text', required: true, placeholder: '0.0.0.255', hint: 'Ters subnet maskesi' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'OSPF area numarası' }
                    ]
                },
                {
                    title: 'Interface OSPF Parametreleri',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface (Nameif)', type: 'text', required: true, placeholder: 'inside', hint: 'OSPF etkinleştirilecek interface nameif' },
                        { name: 'cost', label: 'OSPF Cost', type: 'text', optional: true, placeholder: '10', hint: 'Interface OSPF metrik değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaOspfGen(data);
        });
    }
};
function cgAsaOspfGen(data) {
    const pid = cgEsc(data.pid || ''), network = cgEsc(data.network || ''), wc = cgEsc(data.wildcard || '');
    const area = cgEsc(data.area || ''), iface = cgEsc(data.iface || '');
    const cost = cgEsc(data.cost || ''), rid = cgEsc(data.router_id || '');
    let c = '# ========================================\n# Cisco ASA — OSPF Configuration\n# ========================================\n\n';
    c += 'router ospf ' + pid + '\n';
    if (rid) c += ' router-id ' + rid + '\n';
    c += ' network ' + network + ' ' + wc + ' area ' + area + '\n';
    c += ' log-adj-changes\n!\n\n';
    if (cost) {
        c += '! OSPF Interface Parameters\ninterface ' + iface + '\n ospf cost ' + cost + '\n ospf hello-interval 10\n ospf dead-interval 40\n!\n\n';
    }
    c += '# Doğrulama:\n# show ospf\n# show ospf neighbor\n# show ospf database\n# show route ospf\n';
    return c;
}

// ── ASA: AnyConnect SSL VPN ───────────────────────────────────────────────────
CiscoASA.anyconnect = {
    label: 'AnyConnect VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'ASA AnyConnect VPN',
                desc: 'ASA AnyConnect SSL VPN — WebVPN, IP pool, group-policy ve tunnel-group konfigürasyonu.'
            },
            sections: [
                {
                    title: 'WebVPN ve Image',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'outside', label: 'Outside Interface (Nameif)', type: 'text', required: true, placeholder: 'outside', hint: 'VPN bitiş interface nameif değeri' },
                        { name: 'ac_image', label: 'AnyConnect Image Adı', type: 'text', required: true, placeholder: 'anyconnect-win-4.10.pkg', hint: 'disk0:/ sonrasındaki dosya adı' }
                    ]
                },
                {
                    title: 'IP Pool',
                    icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'VPN-POOL', hint: 'IP havuzu tanımı için isim' },
                        { name: 'pool_start', label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '10.200.0.1', hint: 'Havuz başlangıç adresi' },
                        { name: 'pool_end', label: 'Pool Bitiş IP', type: 'text', validate: 'ip', required: true, placeholder: '10.200.0.254', hint: 'Havuz bitiş adresi' },
                        { name: 'pool_mask', label: 'Pool Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Havuz subnet maskesi' }
                    ]
                },
                {
                    title: 'Group Policy ve Tunnel Group',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'gp_name', label: 'Group Policy Adı', type: 'text', required: true, placeholder: 'GP-REMOTE', hint: 'VPN grup politikası ismi' },
                        { name: 'tg_name', label: 'Tunnel Group Adı', type: 'text', required: true, placeholder: 'REMOTE-VPN', hint: 'Bağlantı profili ismi' },
                        { name: 'tg_alias', label: 'Tunnel Group Alias', type: 'text', required: true, placeholder: 'Corporate VPN', hint: 'Login ekranında görünecek bağlantı adı' },
                        { name: 'dns', label: 'DNS Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.53', hint: 'VPN bağlantısı için DNS sunucusu' },
                        { name: 'split_acl', label: 'Split Tunnel ACL Adı', type: 'text', optional: true, placeholder: 'SPLIT-ACL', hint: 'Boş bırakılırsa full tunnel' },
                        { name: 'split_net', label: 'Split Tunnel Network', type: 'text', optional: true, placeholder: '10.0.0.0 255.0.0.0', hint: 'Split ACL varsa tünel içi ağ' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaAnyconnectGen(data);
        });
    }
};
function cgAsaAnyconnectGen(data) {
    const outside = cgEsc(data.outside || ''), acImage = cgEsc(data.ac_image || '');
    const poolName = cgEsc(data.pool_name || ''), poolStart = cgEsc(data.pool_start || '');
    const poolEnd = cgEsc(data.pool_end || ''), poolMask = cgEsc(data.pool_mask || '');
    const gpName = cgEsc(data.gp_name || ''), tgName = cgEsc(data.tg_name || ''), tgAlias = cgEsc(data.tg_alias || '');
    const dns = cgEsc(data.dns || ''), splitAcl = cgEsc(data.split_acl || ''), splitNet = cgEsc(data.split_net || '');
    let c = '# ========================================\n# Cisco ASA — AnyConnect SSL VPN\n# ========================================\n\n';
    c += '! 1. WebVPN Etkinleştir\nwebvpn\n enable ' + outside + '\n anyconnect image disk0:/' + acImage + ' 1\n anyconnect enable\n!\n\n';
    c += '! 2. IP Pool\nip local pool ' + poolName + ' ' + poolStart + '-' + poolEnd + ' mask ' + poolMask + '\n!\n\n';
    if (splitAcl && splitNet) {
        c += '! 3. Split Tunnel ACL\naccess-list ' + splitAcl + ' standard permit ' + splitNet + '\n!\n\n';
    }
    c += '! 4. Group Policy\ngroup-policy ' + gpName + ' internal\ngroup-policy ' + gpName + ' attributes\n';
    c += ' vpn-tunnel-protocol ssl-client\n';
    if (dns) c += ' dns-server value ' + dns + '\n';
    if (splitAcl) {
        c += ' split-tunnel-policy tunnelspecified\n split-tunnel-network-list value ' + splitAcl + '\n';
    } else {
        c += ' split-tunnel-policy tunnelall\n';
    }
    c += '!\n\n';
    c += '! 5. Tunnel Group\ntunnel-group ' + tgName + ' type remote-access\ntunnel-group ' + tgName + ' general-attributes\n';
    c += ' address-pool ' + poolName + '\n default-group-policy ' + gpName + '\n!\n';
    c += 'tunnel-group ' + tgName + ' webvpn-attributes\n group-alias "' + tgAlias + '" enable\n!\n\n';
    c += '# Doğrulama:\n# show vpn-sessiondb anyconnect\n# show webvpn anyconnect\n# show run webvpn\n# show run tunnel-group ' + tgName + '\n';
    return c;
}

// ── ASA: Object Groups ────────────────────────────────────────────────────────
CiscoASA.objectgroup = {
    label: 'Object Groups',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-object-group',
                title: 'ASA Object Groups',
                desc: 'ASA Object Groups — network ve service grupları tanımlayarak ACL kurallarını basitleştirme.'
            },
            configTypes: [
                { id: 'network', label: 'Network Group', icon: 'fas fa-network-wired', desc: 'IP adresi/subnet grupları', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'service', label: 'Service Group', icon: 'fas fa-plug', desc: 'TCP/UDP port grupları', badge: { text: 'Port Grubu', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Network Object Grubu',
                    icon: 'fas fa-network-wired',
                    showFor: ['network'],
                    fields: [
                        { name: 'net_obj_name', label: 'Network Object Adı', type: 'text', optional: true, placeholder: 'OBJ-WEB-SERVERS', hint: 'Tekil network nesnesi için isim' },
                        { name: 'net_subnet', label: 'Subnet (IP + Mask)', type: 'text', optional: true, placeholder: '10.1.2.0 255.255.255.0', hint: 'Nesne subnet değeri' },
                        { name: 'net_grp_name', label: 'Object Group Adı', type: 'text', optional: true, placeholder: 'GRP-SERVERS', hint: 'Object group için isim' },
                        { name: 'net_grp_desc', label: 'Açıklama', type: 'text', optional: true, placeholder: 'Sunucu grubu', hint: 'Object group açıklaması' },
                        { name: 'net_extra', label: 'Ek Üye', type: 'text', optional: true, placeholder: 'host 10.1.2.50', hint: 'Gruba eklenecek ek eleman' }
                    ]
                },
                {
                    title: 'Service Object Grubu',
                    icon: 'fas fa-plug',
                    showFor: ['service'],
                    fields: [
                        { name: 'svc_grp_name', label: 'Service Group Adı', type: 'text', optional: true, placeholder: 'GRP-WEB-PORTS', hint: 'Port grubu için isim' },
                        { name: 'svc_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'tcp-udp', label: 'TCP-UDP' }
                        ]},
                        { name: 'svc_ports', label: 'Port Listesi', type: 'text', optional: true, placeholder: 'www https 8080', hint: 'Boşlukla ayrılmış port adı/numaraları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgAsaObjGrpGen(data);
        });
    }
};
function cgAsaObjGrpGen(data) {
    const type = cgEsc(data._cgtype || 'network');
    let c = '# ========================================\n# Cisco ASA — Object Groups\n# ========================================\n\n';
    if (type === 'network') {
        const objName = cgEsc(data.net_obj_name || ''), subnet = cgEsc(data.net_subnet || '');
        const grpName = cgEsc(data.net_grp_name || ''), desc = cgEsc(data.net_grp_desc || '');
        const extra = cgEsc(data.net_extra || '');
        c += '! Network Object\nobject network ' + objName + '\n subnet ' + subnet + '\n!\n\n';
        c += '! Network Object Group\nobject-group network ' + grpName + '\n';
        if (desc) c += ' description ' + desc + '\n';
        c += ' network-object object ' + objName + '\n';
        if (extra) c += ' network-object ' + extra + '\n';
        c += '!\n\n';
        c += '# ACL\'de kullanım:\n# access-list OUTSIDE_IN extended permit tcp any object-group ' + grpName + ' eq https\n';
    } else {
        const grpName = cgEsc(data.svc_grp_name || ''), proto = cgEsc(data.svc_proto || 'tcp');
        const ports = cgEsc(data.svc_ports || '').split(/\s+/).filter(Boolean);
        c += '! Service Object Group\nobject-group service ' + grpName + ' ' + proto + '\n';
        ports.forEach(p => { c += ' port-object eq ' + p + '\n'; });
        c += '!\n\n';
        c += '# ACL\'de kullanım:\n# access-list OUTSIDE_IN extended permit ' + proto + ' any any object-group ' + grpName + '\n';
    }
    c += '\n# Doğrulama:\n# show object-group\n# show run object-group\n';
    return c;
}
