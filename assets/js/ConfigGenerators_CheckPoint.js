'use strict';

const CheckPoint = {};

// ── Check Point: Gaia Initial Setup ──────────────────────────────────────────
CheckPoint.setup = {
    label: 'Gaia Initial Setup',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Gaia Initial Setup',
                desc: 'Check Point Gaia OS ilk yapılandırması — clish komutları ile hostname, management interface, DNS, NTP ve SIC ayarları.<br><code>set hostname CP-GW-01</code>'
            },
            sections: [
                {
                    title: 'Temel Kimlik',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'CP-GW-01', hint: 'Gaia cihazının host adı' },
                        { name: 'mgmt_ip', label: 'Management Interface IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'eth0 yönetim arayüzü IP adresi' },
                        { name: 'mgmt_prefix', label: 'Prefix Uzunluğu', type: 'text', required: true, placeholder: '24', hint: 'CIDR prefix (örn: 24 → /24)' },
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.254', hint: 'Varsayılan çıkış gateway\'i' }
                    ]
                },
                {
                    title: 'DNS & NTP',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'dns', label: 'DNS Sunucu', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'Birincil DNS sunucusu' },
                        { name: 'ntp', label: 'NTP Sunucu', type: 'text', optional: true, placeholder: '216.239.35.0', hint: 'NTP senkronizasyon sunucusu' }
                    ]
                },
                {
                    title: 'Management Server & SIC',
                    icon: 'fas fa-shield-alt',
                    info: 'SmartCenter Management Server\'a kayıt için SIC key gereklidir. Opsiyoneldir — sonradan cpconfig ile de yapılabilir.',
                    fields: [
                        { name: 'mgmt_server', label: 'Management Server IP', type: 'text', optional: true, placeholder: '10.1.1.50', hint: 'SmartCenter / Management Server IP adresi' },
                        { name: 'sic_key', label: 'SIC Key', type: 'text', optional: true, placeholder: 'cpshared123', hint: 'Secure Internal Communication paylaşım anahtarı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpSetupGen(data);
        });
    }
};
function cgCpSetupGen(data) {
    const hn = cgEsc(data.hostname || ''), mgmtIp = cgEsc(data.mgmt_ip || ''), prefix = cgEsc(data.mgmt_prefix || '');
    const gw = cgEsc(data.gw || ''), dns = cgEsc(data.dns || ''), ntp = cgEsc(data.ntp || '');
    const mgmtServer = cgEsc(data.mgmt_server || ''), sicKey = cgEsc(data.sic_key || '');
    let c = '# ========================================\n# Check Point Gaia — Initial Setup (clish)\n# ========================================\n\n';
    c += 'set hostname ' + hn + '\n';
    c += 'set interface eth0 ipv4-address ' + mgmtIp + ' mask-length ' + prefix + '\n';
    c += 'set interface eth0 state on\n';
    c += 'set defaultgw ' + gw + '\n';
    c += 'set dns primary ' + dns + '\n';
    if (ntp) {
        c += 'set ntp server primary ' + ntp + ' version 4\n';
        c += 'set ntp active on\n';
    }
    c += 'save config\n\n';
    if (mgmtServer && sicKey) {
        c += '# FW Modülü — Management Server\'a kayıt (cpconfig arayüzünde yapılır):\n';
        c += '# cpconfig → SIC → Initialize SIC: ' + sicKey + '\n';
        c += '# Veya CLI:\n# cp_conf sic init ' + sicKey + '\n';
        c += '# cp_conf mgmt add ' + mgmtServer + '\n\n';
    }
    c += '# Doğrulama:\n# show hostname\n# show interface eth0\n# show route\n# cpstat os\n';
    return c;
}

// ── Check Point: Interface + Bond ────────────────────────────────────────────
CheckPoint.interface = {
    label: 'Interface / Bond',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface / Bond',
                desc: 'Gaia clish ile tekil interface veya LACP bond yapılandırması.<br><code>set interface eth1 ipv4-address 203.0.113.1 mask-length 30</code>'
            },
            configTypes: [
                { id: 'single', label: 'Tekil Interface', icon: 'fas fa-ethernet', desc: 'Standart fiziksel arayüz', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'bond', label: 'Bond (LACP)', icon: 'fas fa-link', desc: 'IEEE 802.3ad bağlaşım', badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'Tekil Interface',
                    icon: 'fas fa-ethernet',
                    showFor: ['single'],
                    fields: [
                        { name: 'iface', label: 'Interface', type: 'text', required: true, placeholder: 'eth1', hint: 'Yapılandırılacak fiziksel arayüz adı' },
                        { name: 'iface_ip', label: 'IP / Prefix (CIDR)', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1/30', hint: 'CIDR formatında IP adresi (örn: 10.0.0.1/24)' },
                        { name: 'desc', label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN', hint: 'Interface yorumu (comments)' }
                    ]
                },
                {
                    title: 'Bond (LACP) Ayarları',
                    icon: 'fas fa-link',
                    showFor: ['bond'],
                    fields: [
                        { name: 'bond_id', label: 'Bond ID', type: 'text', required: true, placeholder: 'bond0', hint: 'Bond arayüzü adı (örn: bond0)' },
                        { name: 'bond_ip', label: 'Bond IP / Prefix (CIDR)', type: 'text', required: true, placeholder: '203.0.113.1/30', hint: 'CIDR formatında bond IP adresi' },
                        { name: 'bond_m1', label: 'Üye Interface 1', type: 'text', required: true, placeholder: 'eth1', hint: 'Bond grubuna eklenecek birinci arayüz' },
                        { name: 'bond_m2', label: 'Üye Interface 2', type: 'text', required: true, placeholder: 'eth2', hint: 'Bond grubuna eklenecek ikinci arayüz' },
                        { name: 'desc', label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN-BOND', hint: 'Interface yorumu (comments)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpIfaceGen(data);
        });
    }
};
function cgCpIfaceGen(data) {
    const type = cgEsc(data._cgtype || 'single'), desc = cgEsc(data.desc || '');
    let c = '# ========================================\n# Check Point Gaia — Interface / Bond\n# ========================================\n\n';
    if (type === 'single') {
        const iface = cgEsc(data.iface || ''), ip = cgEsc(data.iface_ip || '');
        const parts = ip.split('/');
        c += 'set interface ' + iface + ' ipv4-address ' + parts[0] + ' mask-length ' + (parts[1] || '30') + '\n';
        c += 'set interface ' + iface + ' state on\n';
        if (desc) c += 'set interface ' + iface + ' comments "' + desc + '"\n';
    } else {
        const bondId = cgEsc(data.bond_id || ''), bondIp = cgEsc(data.bond_ip || '');
        const m1 = cgEsc(data.bond_m1 || ''), m2 = cgEsc(data.bond_m2 || '');
        const parts = bondIp.split('/');
        const bondNum = bondId.replace('bond', '');
        c += 'add bonding group ' + bondNum + '\n';
        c += 'set bonding group ' + bondNum + ' mode 802_3ad\n';
        c += 'set bonding group ' + bondNum + ' interfaces add ' + m1 + '\n';
        c += 'set bonding group ' + bondNum + ' interfaces add ' + m2 + '\n';
        c += 'set interface ' + bondId + ' ipv4-address ' + parts[0] + ' mask-length ' + (parts[1] || '30') + '\n';
        c += 'set interface ' + bondId + ' state on\n';
        if (desc) c += 'set interface ' + bondId + ' comments "' + desc + '"\n';
    }
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show interface all\n# show bonding group all\n';
    return c;
}

// ── Check Point: Static Route ─────────────────────────────────────────────────
CheckPoint.route = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route',
                desc: 'Gaia clish ile statik rota tanımı.<br><code>set static-route 10.0.0.0/8 nexthop gateway address 203.0.113.2 priority 1 on</code>'
            },
            sections: [
                {
                    title: 'Rota Bilgileri',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'dst', label: 'Hedef Network (CIDR)', type: 'text', required: true, placeholder: '10.0.0.0/8', hint: 'Hedef subnet CIDR formatında (örn: 192.168.0.0/24)' },
                        { name: 'gw', label: 'Next-Hop Gateway', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Bir sonraki atlama noktası IP adresi' },
                        { name: 'priority', label: 'Öncelik', type: 'text', optional: true, placeholder: '1', hint: 'Düşük değer = daha yüksek öncelik (varsayılan: 1)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpRouteGen(data);
        });
    }
};
function cgCpRouteGen(data) {
    const dst = cgEsc(data.dst || ''), gw = cgEsc(data.gw || ''), priority = cgEsc(data.priority || '') || '1';
    let c = '# ========================================\n# Check Point Gaia — Static Route\n# ========================================\n\n';
    c += 'set static-route ' + dst + ' nexthop gateway address ' + gw + ' priority ' + priority + ' on\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show route\n# show static-route\n';
    return c;
}

// ── Check Point: OSPF ────────────────────────────────────────────────────────
CheckPoint.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (Gaia clish)',
                desc: 'Check Point Gaia üzerinde OSPF yönlendirme protokolü yapılandırması.<br><code>set ospf on</code> → <code>set ospf instance default router-id 1.1.1.1</code>'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'rid', label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'Genellikle Loopback veya management IP adresi' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0, diğerleri için ör: 0.0.0.1' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'Interface', type: 'text', required: true, placeholder: 'eth1', hint: 'OSPF etkinleştirilecek fiziksel arayüz adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpOspfGen(data);
        });
    }
};
function cgCpOspfGen(data) {
    const rid = cgEsc(data.rid || ''), iface = cgEsc(data.iface || ''), area = cgEsc(data.area || '');
    let c = '# ========================================\n# Check Point Gaia — OSPF\n# ========================================\n\n';
    c += 'set ospf on\n';
    c += 'set ospf instance default router-id ' + rid + '\n';
    c += 'set ospf instance default area ' + area + ' type normal\n';
    c += 'set ospf interface ' + iface + ' area ' + area + '\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show ospf neighbors\n# show ospf routes\n# show ospf database\n';
    return c;
}

// ── Check Point: Security Policy (mgmt_cli) ───────────────────────────────────
CheckPoint.policy = {
    label: 'Security Rule (mgmt_cli)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Rule (mgmt_cli)',
                desc: 'SmartCenter Management API üzerinden güvenlik kuralı ve host nesnesi oluşturma, policy yükleme.<br><code>mgmt_cli add access-rule layer "Network" name "Allow-HTTPS" ...</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Management Bağlantısı',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'mgmt_ip', label: 'Management Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.50', hint: 'SmartCenter veya Multi-Domain Server IP adresi' },
                        { name: 'mgmt_user', label: 'Kullanıcı', type: 'text', required: true, placeholder: 'admin', hint: 'API erişim kullanıcısı' },
                        { name: 'mgmt_pass', label: 'Şifre', type: 'text', required: true, placeholder: 'admin123', hint: 'API kullanıcı şifresi' }
                    ]
                },
                {
                    title: 'Host Nesnesi',
                    icon: 'fas fa-desktop',
                    fields: [
                        { name: 'host_name', label: 'Host Adı', type: 'text', required: true, placeholder: 'WebServer-01', hint: 'SmartConsole\'da oluşturulacak nesne adı' },
                        { name: 'host_ip', label: 'Host IP', type: 'text', required: true, placeholder: '10.1.2.10', hint: 'Sunucunun IP adresi' }
                    ]
                },
                {
                    title: 'Güvenlik Kuralı',
                    icon: 'fas fa-list-alt',
                    fields: [
                        { name: 'rule_name', label: 'Kural Adı', type: 'text', required: true, placeholder: 'Allow-HTTPS-to-WebServer', hint: 'Güvenlik kuralının benzersiz adı' },
                        { name: 'service', label: 'Servis', type: 'text', required: true, placeholder: 'https', hint: 'İzin verilecek servis adı (örn: https, ssh, http)' },
                        { name: 'policy_pkg', label: 'Policy Package', type: 'text', required: true, placeholder: 'Standard', hint: 'Kuralın ekleneceği policy paketi' },
                        { name: 'gateway', label: 'Gateway', type: 'text', validate: 'ip', required: true, placeholder: 'CP-GW-01', hint: 'Policy\'nin yükleneceği gateway adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpPolicyGen(data);
        });
    }
};
function cgCpPolicyGen(data) {
    const mgmtIp = cgEsc(data.mgmt_ip || ''), user = cgEsc(data.mgmt_user || ''), pass = cgEsc(data.mgmt_pass || '');
    const hostName = cgEsc(data.host_name || ''), hostIp = cgEsc(data.host_ip || ''), ruleName = cgEsc(data.rule_name || '');
    const service = cgEsc(data.service || ''), policyPkg = cgEsc(data.policy_pkg || ''), gateway = cgEsc(data.gateway || '');
    let c = '#!/bin/bash\n# ========================================\n# Check Point — Security Rule (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli -r true login user "' + user + '" password "' + pass + '" management "' + mgmtIp + '" > /tmp/sid.txt\n\n';
    c += '# Host nesnesi oluştur\nmgmt_cli add host name "' + hostName + '" ip-address "' + hostIp + '" -s /tmp/sid.txt\n\n';
    c += '# Güvenlik kuralı ekle\nmgmt_cli add access-rule layer "Network" \\\n';
    c += '  name "' + ruleName + '" \\\n';
    c += '  source "any" \\\n';
    c += '  destination "' + hostName + '" \\\n';
    c += '  service "' + service + '" \\\n';
    c += '  action "accept" \\\n';
    c += '  track-settings.type "Log" \\\n';
    c += '  position top \\\n';
    c += '  -s /tmp/sid.txt\n\n';
    c += '# Yayınla ve kur\nmgmt_cli publish -s /tmp/sid.txt\n';
    c += 'mgmt_cli install-policy policy-package "' + policyPkg + '" \\\n';
    c += '  access true \\\n';
    c += '  targets.1 "' + gateway + '" \\\n';
    c += '  -s /tmp/sid.txt\n\n';
    c += 'mgmt_cli logout -s /tmp/sid.txt\n\n';
    c += '# Doğrulama:\n# mgmt_cli show access-rule layer "Network" name "' + ruleName + '" -s /tmp/sid.txt\n';
    return c;
}

// ── Check Point: NAT Rule (mgmt_cli) ──────────────────────────────────────────
CheckPoint.nat = {
    label: 'NAT Rule (mgmt_cli)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT Rule (mgmt_cli)',
                desc: 'mgmt_cli ile Hide NAT (SNAT/PAT) veya Static NAT (1-to-1) kuralı oluşturma.<br><code>mgmt_cli add nat-rule package "Standard" ...</code>'
            },
            sections: [
                {
                    title: 'Management Bağlantısı',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'mgmt_ip', label: 'Management Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.50', hint: 'SmartCenter IP adresi' },
                        { name: 'mgmt_user', label: 'Kullanıcı', type: 'text', required: true, placeholder: 'admin', hint: 'API erişim kullanıcısı' },
                        { name: 'mgmt_pass', label: 'Şifre', type: 'text', required: true, placeholder: 'admin123', hint: 'API kullanıcı şifresi' }
                    ]
                },
                {
                    title: 'NAT Kuralı',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'nat_type', label: 'NAT Tipi', type: 'select', options: [
                            { value: 'hide', label: 'Hide (SNAT/PAT)', selected: true },
                            { value: 'static', label: 'Static (1-to-1)' }
                        ]},
                        { name: 'src_obj', label: 'Kaynak Nesne', type: 'text', required: true, placeholder: 'LAN_Network', hint: 'NAT uygulanacak kaynak nesne adı' },
                        { name: 'trans_ip', label: 'Translated IP', type: 'text', validate: 'ip', optional: true, placeholder: '203.0.113.10', hint: 'Static NAT için hedef public IP (Hide modunda kullanılmaz)' },
                        { name: 'policy_pkg', label: 'Policy Package', type: 'text', required: true, placeholder: 'Standard', hint: 'NAT kuralının ekleneceği policy paketi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpNatGen(data);
        });
    }
};
function cgCpNatGen(data) {
    const mgmtIp = cgEsc(data.mgmt_ip || ''), user = cgEsc(data.mgmt_user || ''), pass = cgEsc(data.mgmt_pass || '');
    const natType = cgEsc(data.nat_type || 'hide'), srcObj = cgEsc(data.src_obj || '');
    const transIp = cgEsc(data.trans_ip || ''), pkg = cgEsc(data.policy_pkg || '');
    let c = '#!/bin/bash\n# ========================================\n# Check Point — NAT Rule (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli -r true login user "' + user + '" password "' + pass + '" management "' + mgmtIp + '" > /tmp/sid.txt\n\n';
    if (natType === 'hide') {
        c += 'mgmt_cli add nat-rule package "' + pkg + '" \\\n';
        c += '  original-source "' + srcObj + '" \\\n';
        c += '  original-destination "Any" \\\n';
        c += '  translated-source "Hide" \\\n';
        c += '  method "hide" \\\n';
        c += '  -s /tmp/sid.txt\n\n';
    } else {
        c += 'mgmt_cli add nat-rule package "' + pkg + '" \\\n';
        c += '  original-source "' + srcObj + '" \\\n';
        c += '  original-destination "Any" \\\n';
        c += '  translated-source "' + transIp + '" \\\n';
        c += '  method "static" \\\n';
        c += '  -s /tmp/sid.txt\n\n';
    }
    c += 'mgmt_cli publish -s /tmp/sid.txt\nmgmt_cli logout -s /tmp/sid.txt\n\n';
    c += '# Doğrulama:\n# mgmt_cli show nat-rulebase package "' + pkg + '" -s /tmp/sid.txt\n';
    return c;
}

// ── Check Point: BGP (Gaia clish) ────────────────────────────────────────────
CheckPoint.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (Gaia clish)',
                desc: 'Check Point Gaia üzerinde BGP peer yapılandırması.<br><code>set bgp as 65001</code> → <code>set bgp peer 10.0.0.2 remote-as 65002</code>'
            },
            sections: [
                {
                    title: 'BGP Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'neighbor_ip', label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'remote_as', label: 'Remote AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun Autonomous System numarası' },
                        { name: 'description', label: 'Açıklama', type: 'text', optional: true, placeholder: 'ISP-PEER', hint: 'BGP komşu açıklaması' },
                        { name: 'redistribute_static', label: 'Redistribute Static', type: 'select', options: [
                            { value: 'no', label: 'Hayır', selected: true },
                            { value: 'yes', label: 'Evet' }
                        ], hint: 'Statik rotaları BGP\'ye yeniden dağıt' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpBgpGen(data);
        });
    }
};
function cgCpBgpGen(data) {
    const localAs = cgEsc(data.local_as || ''), neighborIp = cgEsc(data.neighbor_ip || ''), remoteAs = cgEsc(data.remote_as || '');
    const description = cgEsc(data.description || ''), redistStatic = cgEsc(data.redistribute_static || 'no');
    let c = '# ========================================\n# Check Point Gaia — BGP (clish)\n# ========================================\n\n';
    c += 'set bgp as ' + localAs + '\n';
    c += 'set bgp peer ' + neighborIp + ' remote-as ' + remoteAs + '\n';
    c += 'set bgp peer ' + neighborIp + ' on\n';
    if (description) c += 'set bgp peer ' + neighborIp + ' description "' + description + '"\n';
    if (redistStatic === 'yes') c += 'set bgp redistribute static\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show bgp peer ' + neighborIp + '\n# show route bgp\n';
    return c;
}

// ── Check Point: VLAN Interface (Gaia clish) ──────────────────────────────────
CheckPoint.vlanintf = {
    label: 'VLAN Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'VLAN Interface (Gaia clish)',
                desc: 'Bond veya fiziksel interface üzerinde VLAN alt arayüzü tanımı.<br><code>add interface bond0.100 vlan-id 100</code>'
            },
            sections: [
                {
                    title: 'VLAN Ayarları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası' },
                        { name: 'parent_bond', label: 'Parent Bond / Interface', type: 'text', required: true, placeholder: 'bond0', hint: 'VLAN\'ın oluşturulacağı üst arayüz (örn: bond0, eth1)' },
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.100.1', hint: 'VLAN interface IP adresi' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Subnet maskesi (örn: 255.255.255.0)' },
                        { name: 'comment', label: 'Açıklama', type: 'text', optional: true, placeholder: 'Server VLAN', hint: 'Interface yorumu (comments)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpVlanIntfGen(data);
        });
    }
};
function cgCpVlanIntfGen(data) {
    const vlanId = cgEsc(data.vlan_id || ''), parentBond = cgEsc(data.parent_bond || '');
    const ip = cgEsc(data.ip || ''), mask = cgEsc(data.mask || ''), comment = cgEsc(data.comment || '');
    const maskToCidr = {
        '255.255.255.0': '24', '255.255.254.0': '23', '255.255.252.0': '22',
        '255.255.248.0': '21', '255.255.240.0': '20', '255.255.224.0': '19',
        '255.255.192.0': '18', '255.255.128.0': '17', '255.255.0.0': '16',
        '255.254.0.0': '15', '255.252.0.0': '14', '255.248.0.0': '13',
        '255.255.255.128': '25', '255.255.255.192': '26',
        '255.255.255.224': '27', '255.255.255.240': '28',
        '255.255.255.248': '29', '255.255.255.252': '30'
    };
    const cidr = maskToCidr[mask] || mask + ' # (CIDR cevirisi manuel yapilacak)';
    const vlanIface = parentBond + '.' + vlanId;
    let c = '# ========================================\n# Check Point Gaia — VLAN Interface (clish)\n# ========================================\n\n';
    c += 'add interface ' + vlanIface + ' vlan-id ' + vlanId + '\n';
    c += 'set interface ' + vlanIface + ' ipv4-address ' + ip + ' mask-length ' + cidr + '\n';
    c += 'set interface ' + vlanIface + ' state on\n';
    if (comment) c += 'set interface ' + vlanIface + ' comments "' + comment + '"\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show interface ' + vlanIface + '\n';
    return c;
}

// ── Check Point: Host Object (mgmt_cli) ───────────────────────────────────────
CheckPoint.hostobj = {
    label: 'Host Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-desktop',
                title: 'Host Object (mgmt_cli)',
                desc: 'SmartCenter üzerinde host nesnesi oluşturma ve gruplara ekleme.<br><code>mgmt_cli add host name "SRV-WEB-01" ip-address "192.168.1.10"</code>'
            },
            sections: [
                {
                    title: 'Host Nesnesi',
                    icon: 'fas fa-desktop',
                    fields: [
                        { name: 'name', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'SRV-WEB-01', hint: 'SmartConsole\'da görünecek nesne adı' },
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Host\'un IP adresi' },
                        { name: 'color', label: 'Renk', type: 'select', options: [
                            { value: 'blue', label: 'blue', selected: true },
                            { value: 'red', label: 'red' },
                            { value: 'green', label: 'green' },
                            { value: 'yellow', label: 'yellow' }
                        ], hint: 'SmartConsole\'da nesne rengi' },
                        { name: 'groups', label: 'Gruplar', type: 'text', optional: true, placeholder: 'GRP-SERVERS,GRP-DMZ', hint: 'Virgülle ayrılmış grup adları — nesne bu gruplara eklenecek' },
                        { name: 'comment', label: 'Açıklama', type: 'text', optional: true, placeholder: 'Web server 1', hint: 'Nesne yorumu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpHostObjGen(data);
        });
    }
};
function cgCpHostObjGen(data) {
    const name = cgEsc(data.name || ''), ip = cgEsc(data.ip || ''), color = cgEsc(data.color || 'blue');
    const groupsRaw = cgEsc(data.groups || ''), comment = cgEsc(data.comment || '');
    const groups = groupsRaw ? groupsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    let c = '# ========================================\n# Check Point — Host Object (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli add host name "' + name + '" ip-address "' + ip + '" color "' + color + '"';
    if (comment) c += ' comments "' + comment + '"';
    c += '\n';
    groups.forEach(grp => {
        c += 'mgmt_cli add group member name "' + cgEsc(grp) + '" member.add.name "' + name + '"\n';
    });
    c += 'mgmt_cli publish\n\n';
    c += '# Doğrulama:\n# mgmt_cli show host name "' + name + '"\n';
    return c;
}

// ── Check Point: Network Object (mgmt_cli) ────────────────────────────────────
CheckPoint.netobj = {
    label: 'Network Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Network Object (mgmt_cli)',
                desc: 'SmartCenter üzerinde network (subnet) nesnesi oluşturma.<br><code>mgmt_cli add network name "NET-DMZ" subnet "192.168.2.0" mask-length 24</code>'
            },
            sections: [
                {
                    title: 'Network Nesnesi',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'name', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'NET-DMZ', hint: 'SmartConsole\'da görünecek nesne adı' },
                        { name: 'subnet', label: 'Subnet', type: 'text', required: true, placeholder: '192.168.2.0', hint: 'Ağ adresi (host bitleri sıfır olmalı)' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Subnet maskesi (örn: 255.255.255.0 → /24)' },
                        { name: 'color', label: 'Renk', type: 'select', options: [
                            { value: 'green', label: 'green', selected: true },
                            { value: 'blue', label: 'blue' },
                            { value: 'red', label: 'red' }
                        ]},
                        { name: 'groups', label: 'Gruplar', type: 'text', optional: true, placeholder: 'GRP-INTERNAL', hint: 'Virgülle ayrılmış grup adları' },
                        { name: 'comment', label: 'Açıklama', type: 'text', optional: true, placeholder: 'DMZ subnet', hint: 'Nesne yorumu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpNetObjGen(data);
        });
    }
};
function cgCpNetObjGen(data) {
    const name = cgEsc(data.name || ''), subnet = cgEsc(data.subnet || ''), mask = cgEsc(data.mask || '');
    const color = cgEsc(data.color || 'green'), groupsRaw = cgEsc(data.groups || ''), comment = cgEsc(data.comment || '');
    const groups = groupsRaw ? groupsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const maskToCidr = {
        '255.255.255.0': '24', '255.255.254.0': '23', '255.255.252.0': '22',
        '255.255.248.0': '21', '255.255.240.0': '20', '255.255.224.0': '19',
        '255.255.192.0': '18', '255.255.128.0': '17', '255.255.0.0': '16',
        '255.254.0.0': '15', '255.252.0.0': '14', '255.248.0.0': '13',
        '255.255.255.128': '25', '255.255.255.192': '26',
        '255.255.255.224': '27', '255.255.255.240': '28',
        '255.255.255.248': '29', '255.255.255.252': '30'
    };
    const cidr = maskToCidr[mask] || mask + ' # (CIDR cevirisi manuel yapilacak)';
    let c = '# ========================================\n# Check Point — Network Object (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli add network name "' + name + '" subnet "' + subnet + '" mask-length ' + cidr + ' color "' + color + '"';
    if (comment) c += ' comments "' + comment + '"';
    c += '\n';
    groups.forEach(grp => {
        c += 'mgmt_cli add group member name "' + cgEsc(grp) + '" member.add.name "' + name + '"\n';
    });
    c += 'mgmt_cli publish\n\n';
    c += '# Doğrulama:\n# mgmt_cli show network name "' + name + '"\n';
    return c;
}

// ── Check Point: Service Object (mgmt_cli) ────────────────────────────────────
CheckPoint.serviceobj = {
    label: 'Service Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'Service Object (mgmt_cli)',
                desc: 'SmartCenter üzerinde TCP veya UDP servis nesnesi oluşturma.<br><code>mgmt_cli add service-tcp name "SVC-APP-8443" port "8443"</code>'
            },
            sections: [
                {
                    title: 'Servis Nesnesi',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'name', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'SVC-APP-8443', hint: 'SmartConsole\'da görünecek servis nesne adı' },
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '8443', hint: 'TCP/UDP port numarası (1–65535)' },
                        { name: 'groups', label: 'Gruplar', type: 'text', optional: true, placeholder: 'GRP-WEB-SVCS', hint: 'Virgülle ayrılmış grup adları' },
                        { name: 'comment', label: 'Açıklama', type: 'text', optional: true, placeholder: 'App HTTPS', hint: 'Servis nesnesinin kısa açıklaması' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpServiceObjGen(data);
        });
    }
};
function cgCpServiceObjGen(data) {
    const name = cgEsc(data.name || ''), protocol = cgEsc(data.protocol || 'tcp'), port = cgEsc(data.port || '');
    const groupsRaw = cgEsc(data.groups || ''), comment = cgEsc(data.comment || '');
    const groups = groupsRaw ? groupsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const svcType = protocol === 'udp' ? 'service-udp' : 'service-tcp';
    let c = '# ========================================\n# Check Point — Service Object (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli add ' + svcType + ' name "' + name + '" port "' + port + '"';
    if (comment) c += ' comments "' + comment + '"';
    c += '\n';
    groups.forEach(grp => {
        c += 'mgmt_cli add group member name "' + cgEsc(grp) + '" member.add.name "' + name + '"\n';
    });
    c += 'mgmt_cli publish\n\n';
    c += '# Doğrulama:\n# mgmt_cli show ' + svcType + ' name "' + name + '"\n';
    return c;
}

// ── Check Point: ClusterXL HA ─────────────────────────────────────────────────
CheckPoint.clusterxl = {
    label: 'ClusterXL HA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'ClusterXL HA',
                desc: 'Check Point ClusterXL High Availability yapılandırması — clish ve mgmt_cli komutları.<br><code>set cluster member interface eth0 main on</code>',
            },
            sections: [
                {
                    title: 'Cluster Modu & Arayüzler',
                    icon: 'fas fa-server',
                    warn: 'Bu komutlar her iki cluster üyesinde de ayrı ayrı çalıştırılmalıdır.',
                    fields: [
                        { name: 'mode', label: 'Mod', type: 'select', options: [
                            { value: 'New High Availability', label: 'New High Availability', selected: true },
                            { value: 'Load Sharing Multicast', label: 'Load Sharing Multicast' }
                        ], hint: 'ClusterXL çalışma modu', badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } },
                        { name: 'cluster_ip', label: 'Cluster IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Sanal cluster IP adresi (VIP)' },
                        { name: 'cluster_intf', label: 'Cluster Interface', type: 'text', required: true, placeholder: 'eth0', hint: 'Cluster trafiğini taşıyan fiziksel arayüz' },
                        { name: 'sync_intf', label: 'Sync Interface', type: 'text', required: true, placeholder: 'eth1', hint: 'State senkronizasyon trafiği için arayüz' }
                    ]
                },
                {
                    title: 'Cluster Üyeleri',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'member1_ip', label: 'Member 1 IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birinci üye gateway IP adresi' },
                        { name: 'member2_ip', label: 'Member 2 IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'İkinci üye gateway IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpClusterXLGen(data);
        });
    }
};
function cgCpClusterXLGen(data) {
    const mode = cgEsc(data.mode || 'New High Availability'), clusterIp = cgEsc(data.cluster_ip || '');
    const member1Ip = cgEsc(data.member1_ip || ''), member2Ip = cgEsc(data.member2_ip || '');
    const syncIntf = cgEsc(data.sync_intf || ''), clusterIntf = cgEsc(data.cluster_intf || '');
    let c = '# ========================================\n# Check Point Gaia — ClusterXL HA\n# ========================================\n\n';
    c += '# Her iki üyede de çalıştırın:\n';
    c += 'set cluster member interface ' + clusterIntf + ' main on\n';
    c += 'set cluster member interface ' + syncIntf + ' sync on\n';
    c += 'set cluster member interface ' + clusterIntf + ' cluster-ip ' + clusterIp + '\n';
    c += 'save config\n\n';
    c += '# SmartConsole / mgmt_cli ile küme yapılandırması:\n';
    c += 'mgmt_cli set cluster name "FW-CLUSTER" cluster-mode "cluster-xl-ha" \\\n';
    c += '  topology.members.add.name "MEMBER-1" topology.members.add.ip-address "' + member1Ip + '" \\\n';
    c += '  topology.members.add.name "MEMBER-2" topology.members.add.ip-address "' + member2Ip + '"\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Mod: ' + mode + '\n\n';
    c += '# Doğrulama:\n# cphaprob -a if\n# cphaprob stat\n# fw hastat\n';
    return c;
}

// ── Check Point: VSX Virtual System ───────────────────────────────────────────
CheckPoint.vsx = {
    label: 'VSX Virtual System',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VSX Virtual System',
                desc: 'Check Point VSX üzerinde sanal sistem (Virtual System) oluşturma.<br><code>mgmt_cli add virtual-system name "VS-CUSTOMER1" vsid 1 ...</code>'
            },
            sections: [
                {
                    title: 'Virtual System Ayarları',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vs_name', label: 'VS Adı', type: 'text', required: true, placeholder: 'VS-CUSTOMER1', hint: 'SmartConsole\'da görünecek virtual system adı' },
                        { name: 'vs_id', label: 'VS ID', type: 'text', required: true, placeholder: '1', hint: 'Virtual system benzersiz kimlik numarası (VSID)' },
                        { name: 'vs_intf', label: 'VS Interface', type: 'text', required: true, placeholder: 'bond0.100', hint: 'Virtual system\'e atanacak arayüz (örn: bond0.100)' },
                        { name: 'vs_ip', label: 'VS IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.100.1', hint: 'Virtual system ana IP adresi' },
                        { name: 'vs_mask', label: 'Mask Length (CIDR)', type: 'text', required: true, placeholder: '24', hint: 'Prefix uzunluğu (örn: 24 → /24)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpVsxGen(data);
        });
    }
};
function cgCpVsxGen(data) {
    const vsName = cgEsc(data.vs_name || ''), vsId = cgEsc(data.vs_id || ''), vsIntf = cgEsc(data.vs_intf || '');
    const vsIp = cgEsc(data.vs_ip || ''), vsMask = cgEsc(data.vs_mask || '');
    let c = '# ========================================\n# Check Point — VSX Virtual System (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli add virtual-system name "' + vsName + '" vsid ' + vsId + ' ipv4-address "' + vsIp + '" mask-length ' + vsMask + ' main-ip-address "' + vsIp + '"\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Interface bağlama (VSX gateway üzerinde):\n';
    c += '# vsx_util add_if -v ' + vsId + ' -i ' + vsIntf + ' -t regular\n\n';
    c += '# Doğrulama:\n# vsx stat -v ' + vsId + '\n# vsx_util show_vs\n';
    return c;
}

// ── Check Point: Site-to-Site VPN (mgmt_cli) ──────────────────────────────────
CheckPoint.s2svpn = {
    label: 'Site-to-Site VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'Site-to-Site VPN (mgmt_cli)',
                desc: 'mgmt_cli ile peer gateway, VPN community ve preshared key yapılandırması.<br><code>mgmt_cli add vpn-community-meshed name "VPN-COMMUNITY" ike-version 2 ...</code>',
            },
            sections: [
                {
                    title: 'VPN Community',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'community_name', label: 'Community Adı', type: 'text', required: true, placeholder: 'VPN-COMMUNITY', hint: 'VPN community nesnesinin adı' },
                        { name: 'ike_version', label: 'IKE Versiyonu', type: 'select', options: [
                            { value: 'IKEv2', label: 'IKEv2', selected: true },
                            { value: 'IKEv1', label: 'IKEv1' }
                        ], hint: 'IKEv2 modern standart, IKEv1 eski cihazlarla uyumluluk için' }
                    ]
                },
                {
                    title: 'Peer Gateway',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_gw_name', label: 'Peer Gateway Adı', type: 'text', required: true, placeholder: 'REMOTE-GW', hint: 'Uzak taraf gateway nesnesinin adı' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Uzak taraf gateway\'in public IP adresi' },
                        { name: 'preshared_key', label: 'Preshared Key', type: 'text', required: true, placeholder: 'VPNSecret123!', hint: 'VPN tüneli için paylaşılan gizli anahtar' }
                    ]
                },
                {
                    title: 'Network Tanımları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'local_net', label: 'Local Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel taraftaki korunan ağ (CIDR)' },
                        { name: 'remote_net', label: 'Remote Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.0/24', hint: 'Uzak taraftaki korunan ağ (CIDR)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpS2sVpnGen(data);
        });
    }
};
function cgCpS2sVpnGen(data) {
    const communityName = cgEsc(data.community_name || ''), peerGwName = cgEsc(data.peer_gw_name || ''), peerIp = cgEsc(data.peer_ip || '');
    const localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
    const presharedKey = cgEsc(data.preshared_key || ''), ikeVersion = cgEsc(data.ike_version || 'IKEv2');
    const ikeVersionNum = ikeVersion === 'IKEv2' ? '2' : '1';
    const remoteNetParts = remoteNet.split('/');
    const remoteNetIp = remoteNetParts[0] || remoteNet;
    const remoteNetCidr = remoteNetParts[1] || '24';
    let c = '#!/bin/bash\n# ========================================\n# Check Point — Site-to-Site VPN (mgmt_cli)\n# ========================================\n\n';
    c += '# Peer gateway nesnesi oluştur\n';
    c += 'mgmt_cli add simple-gateway name "' + peerGwName + '" ip-address "' + peerIp + '"\n\n';
    c += '# VPN Community oluştur\n';
    c += 'mgmt_cli add vpn-community-meshed name "' + communityName + '" \\\n';
    c += '  ike-phase-1.encryption-algorithm AES-256 \\\n';
    c += '  ike-phase-1.data-integrity SHA-256 \\\n';
    c += '  ike-phase-1.ike-p1-use-suite-b-flag false \\\n';
    c += '  ike-version ' + ikeVersionNum + '\n\n';
    c += '# Remote network nesnesi oluştur\n';
    c += 'mgmt_cli add network name "NET-REMOTE-' + peerGwName + '" subnet "' + remoteNetIp + '" mask-length ' + remoteNetCidr + '\n\n';
    c += '# Preshared key ata\n';
    c += 'mgmt_cli set vpn-community-meshed name "' + communityName + '" \\\n';
    c += '  shared-secrets.add.external-gateway "' + peerGwName + '" \\\n';
    c += '  shared-secrets.add.shared-secret "' + presharedKey + '"\n\n';
    c += '# Yerel ağ: ' + localNet + '\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Doğrulama:\n# vpn tu\n# vpn debug ikeon\n';
    return c;
}

// ── Check Point: Remote Access VPN ────────────────────────────────────────────
CheckPoint.ravpn = {
    label: 'Remote Access VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Remote Access VPN (mgmt_cli)',
                desc: 'Check Point Remote Access VPN community yapılandırması — kimlik doğrulama, kullanıcı grubu ve şifreleme.<br><code>mgmt_cli set remote-access-community name "RA-VPN-PROFILE" ...</code>',
            },
            sections: [
                {
                    title: 'VPN Profili',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'RA-VPN-PROFILE', hint: 'Remote access community adı' },
                        { name: 'auth_method', label: 'Auth Yöntemi', type: 'select', options: [
                            { value: 'Password+Cert', label: 'Password + Certificate', selected: true },
                            { value: 'Certificate', label: 'Certificate Only' },
                            { value: 'RADIUS', label: 'RADIUS' }
                        ], hint: 'Kullanıcı kimlik doğrulama yöntemi' },
                        { name: 'user_group', label: 'Kullanıcı Grubu', type: 'text', required: true, placeholder: 'VPN-USERS', hint: 'VPN erişimine izin verilen kullanıcı grubu adı' }
                    ]
                },
                {
                    title: 'Şifreleme & Topoloji',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'encryption', label: 'Şifreleme', type: 'select', options: [
                            { value: 'AES-256', label: 'AES-256', selected: true },
                            { value: '3DES', label: '3DES' }
                        ], hint: 'Phase 2 şifreleme algoritması' },
                        { name: 'topology', label: 'Topoloji', type: 'select', options: [
                            { value: 'Hub', label: 'Hub', selected: true },
                            { value: 'Peer-to-Peer', label: 'Peer-to-Peer' }
                        ], hint: 'VPN topoloji tipi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpRaVpnGen(data);
        });
    }
};
function cgCpRaVpnGen(data) {
    const profileName = cgEsc(data.profile_name || ''), authMethod = cgEsc(data.auth_method || '');
    const userGroup = cgEsc(data.user_group || ''), encryption = cgEsc(data.encryption || 'AES-256'), topology = cgEsc(data.topology || 'Hub');
    let c = '# ========================================\n# Check Point — Remote Access VPN (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli set remote-access-community name "' + profileName + '" \\\n';
    c += '  user-encryption.method "' + authMethod + '" \\\n';
    c += '  participant-user-groups.add.name "' + userGroup + '" \\\n';
    c += '  encryption-method.ike-p2.transform-algorithm "' + encryption + '"\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Topoloji: ' + topology + '\n\n';
    c += '# Doğrulama:\n# mgmt_cli show remote-access-community name "' + profileName + '"\n# SmartConsole > VPN Communities > Remote Access\n';
    return c;
}

// ── Check Point: IPS Profile ──────────────────────────────────────────────────
CheckPoint.ips = {
    label: 'IPS Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-virus',
                title: 'IPS Profile (mgmt_cli)',
                desc: 'Threat Prevention IPS profili — performans etkisi, kapsam ve güncelleme takvimi.<br><code>mgmt_cli set threat-profile name "IPS-PROTECT" ...</code>'
            },
            sections: [
                {
                    title: 'IPS Profil Ayarları',
                    icon: 'fas fa-shield-virus',
                    fields: [
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'IPS-PROTECT', hint: 'Threat Prevention profil adı' },
                        { name: 'scope', label: 'Kapsam', type: 'select', options: [
                            { value: 'Protect All', label: 'Protect All', selected: true },
                            { value: 'Protect Internal Hosts', label: 'Protect Internal Hosts Only' }
                        ], hint: 'IPS\'in koruma kapsamı' },
                        { name: 'performance_impact', label: 'Performans Etkisi', type: 'select', options: [
                            { value: 'medium-or-lower', label: 'Medium or Lower', selected: true },
                            { value: 'low-or-lower', label: 'Low or Lower' },
                            { value: 'high', label: 'High (Tümünü etkinleştir)' }
                        ], hint: 'Aktif imzaların performans etkisi filtresi' },
                        { name: 'update_schedule', label: 'Güncelleme Takvimi', type: 'select', options: [
                            { value: 'daily', label: 'Günlük', selected: true },
                            { value: 'weekly', label: 'Haftalık' }
                        ], hint: 'IPS imza güncelleme sıklığı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpIpsGen(data);
        });
    }
};
function cgCpIpsGen(data) {
    const profileName = cgEsc(data.profile_name || ''), scope = cgEsc(data.scope || '');
    const performanceImpact = cgEsc(data.performance_impact || 'medium-or-lower'), updateSchedule = cgEsc(data.update_schedule || 'daily');
    let c = '# ========================================\n# Check Point — IPS Profile (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli set threat-profile name "' + profileName + '" \\\n';
    c += '  active-protections-performance-impact "' + performanceImpact + '" \\\n';
    c += '  active-protections-severity medium-or-above \\\n';
    c += '  use-extended-attributes true\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Kapsam: ' + scope + '\n';
    c += '# Güncelleme: ' + updateSchedule + '\n\n';
    c += '# Doğrulama:\n# mgmt_cli show threat-profile name "' + profileName + '"\n# SmartConsole > Threat Prevention Profiles\n';
    return c;
}

// ── Check Point: Anti-Bot + Anti-Virus ────────────────────────────────────────
CheckPoint.antibot = {
    label: 'Anti-Bot + Anti-Virus',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'Anti-Bot + Anti-Virus (mgmt_cli)',
                desc: 'Threat Prevention Anti-Bot ve Anti-Virus profil ayarları — confidence seviyesi, aksiyon ve güncelleme takvimi.<br><code>mgmt_cli set threat-profile name "AB-AV-PROFILE" anti-bot.action "Prevent" ...</code>'
            },
            sections: [
                {
                    title: 'Anti-Bot / Anti-Virus Profili',
                    icon: 'fas fa-bug',
                    fields: [
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'AB-AV-PROFILE', hint: 'Threat Prevention profil adı' },
                        { name: 'confidence', label: 'Confidence Seviyesi', type: 'select', options: [
                            { value: 'Medium', label: 'Medium', selected: true },
                            { value: 'High', label: 'High' },
                            { value: 'Critical', label: 'Critical' }
                        ], hint: 'Tespit güven seviyesi eşiği — düşük değer daha fazla tespit, daha fazla false positive' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'Prevent', label: 'Prevent (Engelle)', selected: true },
                            { value: 'Detect', label: 'Detect (Sadece Logla)' },
                            { value: 'Ask', label: 'Ask (Kullanıcıya Sor)' }
                        ], hint: 'Tehdit tespit edildiğinde yapılacak aksiyon' },
                        { name: 'update_schedule', label: 'Güncelleme Takvimi', type: 'select', options: [
                            { value: 'Scheduled', label: 'Scheduled (Planlanmış)', selected: true },
                            { value: 'Always On', label: 'Always On (Sürekli)' }
                        ], hint: 'İmza güncellemesi sıklığı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpAntiBotGen(data);
        });
    }
};
function cgCpAntiBotGen(data) {
    const profileName = cgEsc(data.profile_name || ''), confidence = cgEsc(data.confidence || 'Medium');
    const action = cgEsc(data.action || 'Prevent'), updateSchedule = cgEsc(data.update_schedule || 'Scheduled');
    let c = '# ========================================\n# Check Point — Anti-Bot + Anti-Virus (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli set threat-profile name "' + profileName + '" \\\n';
    c += '  anti-bot.action "' + action + '" \\\n';
    c += '  anti-bot.confidence-level "' + confidence + '" \\\n';
    c += '  anti-virus.action "' + action + '" \\\n';
    c += '  anti-virus.confidence-level "' + confidence + '"\n';
    c += 'mgmt_cli publish\n\n';
    c += '# Güncelleme takvimi: ' + updateSchedule + '\n\n';
    c += '# Doğrulama:\n# mgmt_cli show threat-profile name "' + profileName + '"\n';
    return c;
}

// ── Check Point: HTTPS Inspection Policy ──────────────────────────────────────
CheckPoint.httpsinspect = {
    label: 'HTTPS Inspection',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-search',
                title: 'HTTPS Inspection Policy (mgmt_cli)',
                desc: 'HTTPS trafik denetimi — CA sertifikası, bypass kategorileri ve aksiyon tanımı.<br><code>mgmt_cli set https-inspection-rule name "HTTPS-INSPECT" certificate "CP-INTERNAL-CA" ...</code>'
            },
            sections: [
                {
                    title: 'HTTPS Inspection Kuralı',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'HTTPS-INSPECT', hint: 'HTTPS inspection kural adı' },
                        { name: 'ca_cert', label: 'CA Sertifikası', type: 'text', required: true, placeholder: 'CP-INTERNAL-CA', hint: 'HTTPS denetimi için kullanılacak CA sertifikası adı' },
                        { name: 'bypass_categories', label: 'Bypass Kategoriler', type: 'text', required: true, placeholder: 'Finance,Health', hint: 'Denetimden muaf tutulacak uygulama kategorileri (virgülle ayrılmış)' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'Inspect', label: 'Inspect (Denetle)', selected: true },
                            { value: 'Bypass', label: 'Bypass (Atla)' }
                        ], hint: 'HTTPS trafiğine uygulanacak aksiyon' },
                        { name: 'src_zone', label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'trust', hint: 'Denetimin uygulanacağı kaynak güvenlik bölgesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpHttpsInspectGen(data);
        });
    }
};
function cgCpHttpsInspectGen(data) {
    const policyName = cgEsc(data.policy_name || ''), caCert = cgEsc(data.ca_cert || '');
    const bypassCategoriesRaw = cgEsc(data.bypass_categories || ''), action = cgEsc(data.action || 'Inspect'), srcZone = cgEsc(data.src_zone || '');
    const bypassCategories = bypassCategoriesRaw ? bypassCategoriesRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    let c = '# ========================================\n# Check Point — HTTPS Inspection Policy (mgmt_cli)\n# ========================================\n\n';
    c += 'mgmt_cli set https-inspection-rule name "' + policyName + '" \\\n';
    c += '  source ' + srcZone + ' \\\n';
    c += '  track log \\\n';
    c += '  action inspect \\\n';
    c += '  certificate "' + caCert + '"\n\n';
    if (bypassCategories.length > 0) {
        c += '# Bypass kategorileri:\n';
        bypassCategories.forEach(cat => {
            c += 'mgmt_cli add application-site name "' + cgEsc(cat) + '-BYPASS" primary-category "' + cgEsc(cat) + '"\n';
        });
        c += '\n';
    }
    c += 'mgmt_cli publish\n\n';
    c += '# Aksiyon: ' + action + '\n\n';
    c += '# Doğrulama:\n# mgmt_cli show https-inspection-rule name "' + policyName + '"\n';
    return c;
}

// ── Check Point: Logging / SmartEvent ────────────────────────────────────────
CheckPoint.logging = {
    label: 'Logging / SmartEvent',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clipboard-list',
                title: 'Logging / SmartEvent (Gaia clish)',
                desc: 'Gaia syslog-ng yapılandırması — dış SIEM/syslog sunucusuna log iletimi ve format seçimi.<br><code>set syslog-ng server 10.0.0.50 port 514 protocol udp format CEF</code>'
            },
            sections: [
                {
                    title: 'Log Sunucu Ayarları',
                    icon: 'fas fa-clipboard-list',
                    fields: [
                        { name: 'server_ip', label: 'Syslog Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Logların iletileceği SIEM veya syslog sunucusu' },
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'udp', label: 'syslog-udp', selected: true },
                            { value: 'tcp', label: 'syslog-tcp' }
                        ], hint: 'UDP bağlantısız, TCP güvenilir iletim sağlar' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '514', hint: 'Syslog dinleme portu (varsayılan: 514)' },
                        { name: 'format', label: 'Format', type: 'select', options: [
                            { value: 'CEF', label: 'CEF (Common Event Format)', selected: true },
                            { value: 'LEEF', label: 'LEEF (Log Event Extended Format)' },
                            { value: 'Standard', label: 'Standard Syslog' }
                        ], hint: 'Log mesaj formatı — SIEM ürününüze göre seçin' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpLoggingGen(data);
        });
    }
};
function cgCpLoggingGen(data) {
    const serverIp = cgEsc(data.server_ip || ''), protocol = cgEsc(data.protocol || 'udp');
    const port = cgEsc(data.port || '514'), format = cgEsc(data.format || 'CEF');
    let c = '# ========================================\n# Check Point Gaia — Logging / SmartEvent (clish)\n# ========================================\n\n';
    c += 'set syslog-ng on\n';
    c += 'set syslog-ng server ' + serverIp + ' port ' + port + ' protocol ' + protocol + ' format ' + format + '\n\n';
    c += '# SmartEvent / Log Export (Management üzerinde):\n';
    c += '# set log-export syslog on\n';
    c += '# set log-export syslog target ' + serverIp + '\n\n';
    c += '# Doğrulama:\n# show syslog-ng\n# tail -f /var/log/messages\n';
    return c;
}

// ── Check Point: SNMP v3 ──────────────────────────────────────────────────────
CheckPoint.snmp = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP v3 (Gaia clish)',
                desc: 'Gaia üzerinde SNMP v3 kullanıcısı ve trap hedefi yapılandırması.<br><code>set snmp user snmp-v3-user auth-pass ... auth-proto SHA priv-pass ... priv-proto AES</code>'
            },
            sections: [
                {
                    title: 'SNMP v3 Kullanıcısı',
                    icon: 'fas fa-user-cog',
                    fields: [
                        { name: 'username', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmp-v3-user', hint: 'SNMP v3 kullanıcı adı' },
                        { name: 'auth_proto', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'SHA', label: 'SHA (Önerilen)', selected: true },
                            { value: 'MD5', label: 'MD5 (Eski)' }
                        ], hint: 'SNMP kimlik doğrulama hash algoritması' },
                        { name: 'auth_pass', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Authentication şifresi (en az 8 karakter)' },
                        { name: 'priv_proto', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'AES', label: 'AES (Önerilen)', selected: true },
                            { value: 'DES', label: 'DES (Eski)' }
                        ], hint: 'SNMP şifreleme protokolü' },
                        { name: 'priv_pass', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Privacy (şifreleme) şifresi (en az 8 karakter)' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_target', label: 'Trap Hedef IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap mesajlarının gönderileceği NMS sunucusu IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgCpSnmpGen(data);
        });
    }
};
function cgCpSnmpGen(data) {
    const username = cgEsc(data.username || ''), authProto = cgEsc(data.auth_proto || 'SHA'), authPass = cgEsc(data.auth_pass || '');
    const privProto = cgEsc(data.priv_proto || 'AES'), privPass = cgEsc(data.priv_pass || ''), trapTarget = cgEsc(data.trap_target || '');
    let c = '# ========================================\n# Check Point Gaia — SNMP v3 (clish)\n# ========================================\n\n';
    c += 'set snmp agent on\n';
    c += 'set snmp user ' + username + ' auth-pass ' + authPass + ' auth-proto ' + authProto + ' priv-pass ' + privPass + ' priv-proto ' + privProto + '\n';
    c += 'set snmp notif target ' + trapTarget + ' port 162 community "' + username + '"\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show snmp agent\n# show snmp user ' + username + '\n';
    return c;
}
