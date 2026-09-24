'use strict';

const HuaweiVRP = {};

// ── Huawei: Basic ─────────────────────────────────────────────────────────────
HuaweiVRP.basic = {
    label: 'Basic',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Basic (Huawei VRP)',
                desc: 'Huawei VRP temel başlangıç konfigürasyonu — hostname, VLAN, LAN/WAN arayüz IP ve default gateway ayarları.'
            },
            sections: [
                {
                    title: 'Cihaz ve VLAN',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'hostname', label: 'Hostname (sysname)', type: 'text', required: true, placeholder: 'SW1', hint: 'Cihaz adı (sysname komutu ile atanır)' },
                        { name: 'vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Yönetim veya LAN VLAN numarası' }
                    ]
                },
                {
                    title: 'IP Adresleme',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Vlanif arayüzüne atanacak IP' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Tam netmask formatında (örn: 255.255.255.0)' },
                        { name: 'gw', label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'ip route-static 0.0.0.0 0.0.0.0 ile eklenir' }
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', label: 'LAN Arayüzü', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Access port olarak yapılandırılır' },
                        { name: 'wan_iface', label: 'WAN Arayüzü', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'IP adresi doğrudan atanır, undo shutdown yapılır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || ''), ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || ''), gw = cgEsc(data.gw || '');
            const iface = cgEsc(data.iface || ''), wan = cgEsc(data.wan_iface || '');
            let c = '# ========================================\n# Huawei — Basic Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + hn + '\n\n';
            c += '# VLAN\n[' + hn + '] vlan ' + vlan + '\n[' + hn + '-vlan' + vlan + '] name VLAN_' + vlan + '\n[' + hn + '-vlan' + vlan + '] quit\n';
            c += '[' + hn + '] interface Vlanif' + vlan + '\n[' + hn + '-Vlanif' + vlan + '] ip address ' + ip + ' ' + mask + '\n[' + hn + '-Vlanif' + vlan + '] quit\n\n';
            c += '# LAN Interface\n[' + hn + '] interface ' + iface + '\n[' + hn + '-' + iface + '] port link-type access\n[' + hn + '-' + iface + '] port default vlan ' + vlan + '\n[' + hn + '-' + iface + '] quit\n\n';
            c += '# WAN Interface\n[' + hn + '] interface ' + wan + '\n[' + hn + '-' + wan + '] ip address ' + ip + ' ' + mask + '\n[' + hn + '-' + wan + '] undo shutdown\n[' + hn + '-' + wan + '] quit\n\n';
            c += '# Default Gateway\n[' + hn + '] ip route-static 0.0.0.0 0.0.0.0 ' + gw + '\n';
            return c;
        });
    }
};

// ── Huawei: VLAN ─────────────────────────────────────────────────────────────
HuaweiVRP.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VLAN (Huawei VRP)',
                desc: 'Huawei switch VLAN yapılandırması — access ve trunk port tipleri, batch VLAN oluşturma.'
            },
            configTypes: [
                { id: 'access', label: 'Access Port', icon: 'fas fa-plug', desc: 'Tekli VLAN, son kullanıcı portu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'trunk', label: 'Trunk Port', icon: 'fas fa-project-diagram', desc: 'Birden fazla VLAN, uplink portu' }
            ],
            sections: [
                {
                    title: 'Switch ve Arayüz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'sw_name', label: 'Switch Adı', type: 'text', required: true, placeholder: 'SW1', hint: 'Cihazın sysname değeri' },
                        { name: 'iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Port tipi uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'Access VLAN Ayarları',
                    icon: 'fas fa-tag',
                    showFor: ['access'],
                    fields: [
                        { name: 'vlan_id', label: 'VLAN ID (tekli)', type: 'text', validate: 'vlan', optional: true, placeholder: '10', hint: 'Porta atanacak tekil VLAN numarası' },
                        { name: 'vlan_desc', label: 'VLAN Açıklaması', type: 'text', optional: true, placeholder: 'BT_Personel', hint: 'VLAN description etiketi' },
                        { name: 'vlan_batch_list', label: 'VLAN Batch Liste', type: 'text', optional: true, placeholder: '5 8 17', hint: 'Boşlukla ayrılmış birden fazla VLAN ID' },
                        { name: 'vlan_batch_range', label: 'VLAN Batch Aralık', type: 'text', optional: true, placeholder: '20 to 30', hint: 'Aralık formatında VLAN oluşturma (örn: 20 to 30)' }
                    ]
                },
                {
                    title: 'Trunk VLAN Ayarları',
                    icon: 'fas fa-stream',
                    showFor: ['trunk'],
                    fields: [
                        { name: 'trunk_vlans', label: 'İzin Verilen VLAN\'lar', type: 'text', optional: true, placeholder: '10 20 30', hint: 'Boşlukla ayrılmış VLAN listesi' },
                        { name: 'trunk_all', label: 'Tüm VLAN\'lara izin ver', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.sw_name || ''), pt = data._cgtype || 'access', iface = cgEsc(data.iface || '');
            let c = '# ========================================\n# Huawei — VLAN Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + hn + '\n\n';
            if (pt === 'access') {
                const vid = cgEsc(data.vlan_id || ''), desc = cgEsc(data.vlan_desc || '');
                const blist = cgEsc(data.vlan_batch_list || ''), brange = cgEsc(data.vlan_batch_range || '');
                if (vid) {
                    c += '[' + hn + '] vlan ' + vid + '\n';
                    if (desc) c += '[' + hn + '-vlan' + vid + '] description ' + desc + '\n';
                    c += '[' + hn + '-vlan' + vid + '] quit\n\n';
                }
                if (blist) c += '[' + hn + '] vlan batch ' + blist + '\n\n';
                if (brange) c += '[' + hn + '] vlan batch ' + brange + '\n\n';
                c += '[' + hn + '] interface ' + iface + '\n';
                c += '[' + hn + '-' + iface + '] port link-type access\n';
                if (vid) c += '[' + hn + '-' + iface + '] port default vlan ' + vid + '\n';
                c += '[' + hn + '-' + iface + '] quit\n';
            } else {
                const tvlans = cgEsc(data.trunk_vlans || ''), tall = data.trunk_all;
                c += '[' + hn + '] interface ' + iface + '\n';
                c += '[' + hn + '-' + iface + '] port link-type trunk\n';
                if (tall) {
                    c += '[' + hn + '-' + iface + '] port trunk allow-pass vlan all\n';
                } else if (tvlans) {
                    c += '[' + hn + '-' + iface + '] port trunk allow-pass vlan ' + tvlans + '\n';
                }
                c += '[' + hn + '-' + iface + '] quit\n';
            }
            return c;
        });
    }
};

// ── Huawei: DHCP ─────────────────────────────────────────────────────────────
HuaweiVRP.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'DHCP (Huawei VRP)',
                desc: 'Huawei DHCP yapılandırması — interface tabanlı sunucu, global pool veya relay agent modu.'
            },
            configTypes: [
                { id: 'server', label: 'Interface (Sunucu)', icon: 'fas fa-server', desc: 'Arayüz bazlı DHCP sunucu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'global', label: 'Global Pool', icon: 'fas fa-globe', desc: 'Global IP pool ile DHCP sunucu' },
                { id: 'relay', label: 'Relay', icon: 'fas fa-arrows-alt-h', desc: 'DHCP relay agent modu' }
            ],
            sections: [
                {
                    title: 'Cihaz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'device_name', label: 'Cihaz Adı (sysname)', type: 'text', required: true, placeholder: 'R1', hint: 'Router veya switch sysname değeri' }
                    ]
                },
                {
                    title: 'Interface Sunucu Ayarları',
                    icon: 'fas fa-ethernet',
                    showFor: ['server'],
                    fields: [
                        { name: 'srv_iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'DHCP sunucu olarak yapılandırılacak arayüz' },
                        { name: 'srv_ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Arayüze atanacak IP' },
                        { name: 'srv_prefix', label: 'Prefix (CIDR)', type: 'text', required: true, placeholder: '24', hint: 'Subnet prefix uzunluğu (örn: 24)' }
                    ]
                },
                {
                    title: 'Global Pool Ayarları',
                    icon: 'fas fa-database',
                    showFor: ['global'],
                    fields: [
                        { name: 'pool_name', label: 'Havuz Adı', type: 'text', required: true, placeholder: 'LAN1', hint: 'DHCP pool ismi' },
                        { name: 'pool_gw', label: 'Gateway (gateway-list)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1', hint: 'DHCP istemcilerine verilecek default gateway' },
                        { name: 'pool_dns', label: 'DNS Sunucusu', type: 'text', validate: 'ip', optional: true, placeholder: '8.8.8.8', hint: 'DHCP ile dağıtılacak DNS IP' },
                        { name: 'gbl_iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'dhcp select global uygulanacak arayüz' },
                        { name: 'gbl_ip', label: 'Arayüz IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.2.1', hint: 'Arayüze atanacak IP adresi' },
                        { name: 'gbl_prefix', label: 'Prefix (CIDR)', type: 'text', required: true, placeholder: '24', hint: 'Subnet prefix uzunluğu' }
                    ]
                },
                {
                    title: 'Relay Ayarları',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['relay'],
                    fields: [
                        { name: 'relay_iface', label: 'Arayüz', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/2', hint: 'Relay agent olacak arayüz' },
                        { name: 'relay_ip', label: 'Relay Interface IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.3.1', hint: 'Relay arayüzüne atanacak IP' },
                        { name: 'relay_servers', label: 'DHCP Sunucu IP(leri)', type: 'text', required: true, placeholder: '10.10.10.1', hint: 'Virgülle ayrılmış DHCP sunucu IP listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = data._cgtype || 'server', dn = cgEsc(data.device_name || '');
            let c = '# ========================================\n# Huawei — DHCP Configuration\n# ========================================\n\n';
            c += '<Huawei> system-view\n[Huawei] sysname ' + dn + '\n[' + dn + '] dhcp enable\n\n';
            if (mode === 'server') {
                const iface = cgEsc(data.srv_iface || ''), ip = cgEsc(data.srv_ip || ''), prefix = cgEsc(data.srv_prefix || '');
                c += '[' + dn + '] interface ' + iface + '\n';
                c += '[' + dn + '-' + iface + '] ip address ' + ip + ' ' + prefix + '\n';
                c += '[' + dn + '-' + iface + '] dhcp select interface\n';
                c += '[' + dn + '-' + iface + '] quit\n';
            } else if (mode === 'global') {
                const pool = cgEsc(data.pool_name || ''), gw = cgEsc(data.pool_gw || ''), dns = cgEsc(data.pool_dns || '');
                const giface = cgEsc(data.gbl_iface || ''), gip = cgEsc(data.gbl_ip || ''), gprefix = cgEsc(data.gbl_prefix || '');
                c += '[' + dn + '] ip pool ' + pool + '\n';
                c += '[' + dn + '-ip-pool-' + pool + '] gateway-list ' + gw + '\n';
                if (dns) c += '[' + dn + '-ip-pool-' + pool + '] dns-list ' + dns + '\n';
                c += '[' + dn + '-ip-pool-' + pool + '] quit\n\n';
                c += '[' + dn + '] interface ' + giface + '\n';
                c += '[' + dn + '-' + giface + '] ip address ' + gip + ' ' + gprefix + '\n';
                c += '[' + dn + '-' + giface + '] dhcp select global\n';
                c += '[' + dn + '-' + giface + '] quit\n';
            } else {
                const riface = cgEsc(data.relay_iface || ''), rip = cgEsc(data.relay_ip || '');
                const servers = cgEsc(data.relay_servers || '').split(',').map(s => s.trim()).filter(Boolean);
                c += '[' + dn + '] interface ' + riface + '\n';
                c += '[' + dn + '-' + riface + '] ip address ' + rip + ' 24\n';
                c += '[' + dn + '-' + riface + '] dhcp select relay\n';
                servers.forEach(srv => {
                    c += '[' + dn + '-' + riface + '] dhcp relay server-ip ' + srv + '\n';
                });
                c += '[' + dn + '-' + riface + '] quit\n';
            }
            return c;
        });
    }
};

// ── Huawei: SNMP ─────────────────────────────────────────────────────────────
HuaweiVRP.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP (Huawei VRP)',
                desc: 'Huawei SNMP yapılandırması — SNMPv3 (güvenli) veya SNMPv1/v2c, trap hedefi ve sistem bilgileri.'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-shield-alt', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Güvenli', cls: 'security' } },
                { id: 'v1v2', label: 'SNMPv1/v2c', icon: 'fas fa-chart-bar', desc: 'Community string tabanlı' }
            ],
            sections: [
                {
                    title: 'SNMPv3 Ayarları',
                    icon: 'fas fa-user-lock',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netmonitor', hint: 'SNMPv3 USM kullanıcı adı' },
                        { name: 'v3_group', label: 'Grup Adı', type: 'text', required: true, placeholder: 'netgroup', hint: 'SNMPv3 grubu (privacy seviyesi)' },
                        { name: 'v3_auth', label: 'Auth Yöntemi', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'v3_auth_pw', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123', hint: 'Kimlik doğrulama parolası (min 8 karakter)' },
                        { name: 'v3_priv', label: 'Şifreleme', type: 'select', options: [
                            { value: 'aes128', label: 'AES128', selected: true },
                            { value: 'des56', label: 'DES56' }
                        ]},
                        { name: 'v3_priv_pw', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123', hint: 'Şifreleme parolası (min 8 karakter)' }
                    ]
                },
                {
                    title: 'SNMPv1/v2c Ayarları',
                    icon: 'fas fa-key',
                    showFor: ['v1v2'],
                    fields: [
                        { name: 'community_ro', label: 'Community (RO)', type: 'text', optional: true, placeholder: 'public', hint: 'Read-only community string' },
                        { name: 'community_rw', label: 'Community (RW)', type: 'text', optional: true, placeholder: 'private', hint: 'Read-write community string' }
                    ]
                },
                {
                    title: 'Trap Ayarları',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', label: 'Trap Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.10', hint: 'SNMP trap gönderilecek NMS IP adresi' },
                        { name: 'trap_iface', label: 'Trap Kaynak Arayüz', type: 'text', optional: true, placeholder: 'LoopBack0', hint: 'Trap paketlerinin kaynak arayüzü' }
                    ]
                },
                {
                    title: 'Sistem Bilgisi',
                    icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'contact', label: 'Contact', type: 'text', optional: true, placeholder: 'Network Team, +90 212 000 0000', hint: 'Sorumlu kişi/ekip bilgisi' },
                        { name: 'location', label: 'Location', type: 'text', optional: true, placeholder: 'Istanbul DC, Floor 3', hint: 'Cihazın fiziksel konumu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ver = data._cgtype || 'v3';
            let c = '# ========================================\n# Huawei — SNMP Configuration\n# ========================================\n\n';
            c += '[Huawei] system-view\n';
            if (ver === 'v3') {
                const user = cgEsc(data.v3_user || ''), grp = cgEsc(data.v3_group || '');
                const auth = cgEsc(data.v3_auth || 'sha'), apw = cgEsc(data.v3_auth_pw || '');
                const priv = cgEsc(data.v3_priv || 'aes128'), ppw = cgEsc(data.v3_priv_pw || '');
                c += '[Huawei] snmp-agent sys-info version v3\n';
                c += '[Huawei] snmp-agent group v3 ' + grp + ' privacy\n';
                c += '[Huawei] snmp-agent usm-user v3 ' + user + ' ' + grp + ' authentication-mode ' + auth + ' ' + apw + ' privacy-mode ' + priv + ' ' + ppw + '\n';
                const trap = cgEsc(data.trap_host || ''), tiface = cgEsc(data.trap_iface || '');
                if (trap) {
                    c += '[Huawei] snmp-agent trap enable\n';
                    c += '[Huawei] snmp-agent target-host trap-hostname ' + user + ' address ' + trap + ' trap-paramsname ' + user + 'TRAPS\n';
                    c += '[Huawei] snmp-agent target-host trap-paramsname ' + user + 'TRAPS v3 securityname ' + user + ' privacy\n';
                    if (tiface) c += '[Huawei] snmp-agent trap source ' + tiface + '\n';
                }
            } else {
                const ro = cgEsc(data.community_ro || ''), rw = cgEsc(data.community_rw || '');
                c += '[Huawei] snmp-agent sys-info version v2c\n';
                if (ro) c += '[Huawei] snmp-agent community read ' + ro + '\n';
                if (rw) c += '[Huawei] snmp-agent community write ' + rw + '\n';
                const trap = cgEsc(data.trap_host || ''), tiface = cgEsc(data.trap_iface || '');
                if (trap && ro) {
                    c += '[Huawei] snmp-agent trap enable\n';
                    c += '[Huawei] snmp-agent target-host trap-hostname ' + ro + ' address ' + trap + ' trap-paramsname ' + ro + 'TRAPS\n';
                    c += '[Huawei] snmp-agent target-host trap-paramsname ' + ro + 'TRAPS v2c community ' + ro + '\n';
                    if (tiface) c += '[Huawei] snmp-agent trap source ' + tiface + '\n';
                }
            }
            const contact = cgEsc(data.contact || ''), loc = cgEsc(data.location || '');
            if (contact) c += '[Huawei] snmp-agent sys-info contact "' + contact + '"\n';
            if (loc) c += '[Huawei] snmp-agent sys-info location "' + loc + '"\n';
            return c;
        });
    }
};

// ── Huawei: NAT/Port Forwarding ───────────────────────────────────────────────
HuaweiVRP.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'NAT / Port Forwarding (Huawei VRP)',
                desc: 'Huawei NAT statik port yönlendirme — inside/outside arayüz tanımı ve TCP/UDP/her ikisi için port forwarding kuralı.'
            },
            sections: [
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'in_iface', label: 'Inside Arayüzü', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'İç ağa bağlı arayüz (nat inside)' },
                        { name: 'out_iface', label: 'Outside Arayüzü', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/0', hint: 'WAN/İnternet arayüzü (nat outside)' },
                        { name: 'out_ip', label: 'Dış IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Outside arayüze atanacak public IP' }
                    ]
                },
                {
                    title: 'Port Forwarding',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'both', label: 'Both (TCP+UDP)' }
                        ]},
                        { name: 'pub_port', label: 'Dış Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'İnternet tarafından erişilen port' },
                        { name: 'priv_ip', label: 'İç IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Yönlendirilecek iç sunucu IP adresi' },
                        { name: 'priv_port', label: 'İç Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'İç sunucudaki hedef port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iniface = cgEsc(data.in_iface || ''), outiface = cgEsc(data.out_iface || ''), outip = cgEsc(data.out_ip || '');
            const proto = cgEsc(data.proto || 'tcp'), pubport = cgEsc(data.pub_port || '');
            const privip = cgEsc(data.priv_ip || ''), privport = cgEsc(data.priv_port || '');
            let c = '# ========================================\n# Huawei — NAT / Port Forwarding\n# ========================================\n\n';
            c += '[Huawei] system-view\n\n';
            c += '# Interface Konfigürasyonu\n';
            c += '[Huawei] interface ' + iniface + '\n[Huawei-' + iniface + '] nat inside\n[Huawei-' + iniface + '] quit\n\n';
            c += '[Huawei] interface ' + outiface + '\n[Huawei-' + outiface + '] ip address ' + outip + ' 255.255.255.252\n[Huawei-' + outiface + '] nat outside\n[Huawei-' + outiface + '] quit\n\n';
            c += '# Port Forwarding\n';
            if (proto === 'both') {
                c += '[Huawei] nat static tcp global ' + outip + ' ' + pubport + ' inside ' + privip + ' ' + privport + '\n';
                c += '[Huawei] nat static udp global ' + outip + ' ' + pubport + ' inside ' + privip + ' ' + privport + '\n';
            } else {
                c += '[Huawei] nat static ' + proto + ' global ' + outip + ' ' + pubport + ' inside ' + privip + ' ' + privport + '\n';
            }
            return c;
        });
    }
};

// ── Huawei: TACACS ────────────────────────────────────────────────────────────
HuaweiVRP.tacacs = {
    label: 'TACACS+',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'TACACS+ (Huawei VRP)',
                desc: 'Huawei HWTACACS yapılandırması — birincil/ikincil sunucu, AAA domain, VTY arayüz authentication ve yerel yedek.'
            },
            sections: [
                {
                    title: 'TACACS+ Sunucular',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'srv1', label: 'Sunucu 1 IP', type: 'text', validate: 'ip', required: true, placeholder: '10.7.66.66', hint: 'Birincil HWTACACS sunucu IP adresi' },
                        { name: 'key1', label: 'Sunucu 1 Shared Key', type: 'text', required: true, placeholder: 'TacacsKey123', hint: 'TACACS şifreli anahtar' },
                        { name: 'srv2', label: 'Sunucu 2 IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.7.66.67', hint: 'Yedek HWTACACS sunucu (opsiyonel)' },
                        { name: 'key2', label: 'Sunucu 2 Shared Key', type: 'text', optional: true, placeholder: 'TacacsKey123', hint: 'İkincil sunucu için paylaşılan anahtar' }
                    ]
                },
                {
                    title: 'AAA / Domain',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'grp_name', label: 'TACACS Grubu Adı', type: 'text', required: true, placeholder: 'ht', hint: 'hwtacacs-server template adı' },
                        { name: 'domain', label: 'Domain Adı', type: 'text', required: true, placeholder: 'huawei', hint: 'AAA domain tanımı' },
                        { name: 'remove_domain', label: 'Domain bilgisini sunucuya gönderme', type: 'select', options: [
                            { value: 'no', label: 'Hayır (gönderilir)', selected: true },
                            { value: 'yes', label: 'Evet (gönderilmesin)' }
                        ]}
                    ]
                },
                {
                    title: 'VTY / Local Backup',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'vty_start', label: 'VTY Başlangıç', type: 'text', required: true, placeholder: '0', hint: 'VTY hat aralığı başlangıcı' },
                        { name: 'vty_end', label: 'VTY Bitiş', type: 'text', required: true, placeholder: '4', hint: 'VTY hat aralığı sonu' },
                        { name: 'enable_local', label: 'Yerel yetkilendirme (backup)', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const srv1 = cgEsc(data.srv1 || ''), key1 = cgEsc(data.key1 || '');
            const srv2 = cgEsc(data.srv2 || ''), grp = cgEsc(data.grp_name || '');
            const domain = cgEsc(data.domain || ''), remdom = cgEsc(data.remove_domain || 'no');
            const vs = cgEsc(data.vty_start || ''), ve = cgEsc(data.vty_end || '');
            let c = '# ========================================\n# Huawei — TACACS+ Configuration\n# ========================================\n\n';
            c += 'system-view\nhwtacacs enable\n\n';
            c += '# AAA Şemaları ve Domain\naaa\n';
            c += ' authentication-scheme l-h\n  authentication-mode hwtacacs local\n';
            c += ' authorization-scheme hwtacacs\n  authorization-mode hwtacacs local\n';
            c += ' accounting-scheme hwtacacs\n  accounting-mode hwtacacs\n  accounting start-fail online\nquit\n\n';
            c += 'aaa\n domain ' + domain + '\n  authentication-scheme l-h\n  authorization-scheme hwtacacs\n  accounting-scheme hwtacacs\n  hwtacacs-server ' + grp + '\nquit\n\n';
            c += '# HWTACACS Sunucu Şablonu\nhwtacacs-server template ' + grp + '\n';
            c += ' hwtacacs-server authentication ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server authentication ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server authorization ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server authorization ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server accounting ' + srv1 + ' 49\n';
            if (srv2) c += ' hwtacacs-server accounting ' + srv2 + ' 49 secondary\n';
            c += ' hwtacacs-server shared-key cipher ' + key1 + '\n';
            if (remdom === 'yes') c += ' undo hwtacacs-server user-name domain-included\n';
            c += 'quit\n\n';
            if (data.enable_local === 'yes') {
                c += '# Yerel Backup\naaa\n authorization-cmd 15 hwtacacs local\nquit\n\n';
            }
            c += '# VTY Konfigürasyonu\nuser-interface vty ' + vs + ' ' + ve + '\n authentication-mode aaa\n user privilege level 15\n protocol inbound all\nquit\n';
            return c;
        });
    }
};

// ── Huawei: ACL ───────────────────────────────────────────────────────────────
HuaweiVRP.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL (Huawei VRP)',
                desc: 'Huawei ACL yapılandırması — standart (2000-2699) ve extended (2700-3799) erişim listesi kuralları.'
            },
            configTypes: [
                { id: 'standard', label: 'Standart ACL', icon: 'fas fa-list', desc: '2000-2699 — kaynak IP bazlı filtreleme', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended ACL', icon: 'fas fa-sliders-h', desc: '2700-3799 — protokol, port ve hedef bazlı filtreleme', badge: { text: 'Detaylı', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'acl_num', label: 'ACL Numarası', type: 'text', required: true, placeholder: '2000', hint: 'Standart: 2000-2699, Extended: 2700-3799' },
                        { name: 'rule_id', label: 'Kural ID', type: 'text', optional: true, placeholder: '10', hint: 'Kural sıra numarası (varsayılan: 10)' },
                        { name: 'action', label: 'Eylem', type: 'select', options: [
                            { value: 'permit', label: 'Permit', selected: true },
                            { value: 'deny', label: 'Deny' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak Adres',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'src', label: 'Kaynak', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'host', label: 'host' },
                            { value: 'specific', label: 'Belirli IP' }
                        ]},
                        { name: 'src_ip', label: 'Kaynak IP', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.0', hint: 'Kaynak olarak "Belirli IP" seçildiğinde doldurulur' }
                    ]
                },
                {
                    title: 'Extended — Protokol ve Hedef',
                    icon: 'fas fa-network-wired',
                    showFor: ['extended'],
                    fields: [
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' },
                            { value: 'icmp', label: 'ICMP' },
                            { value: 'ip', label: 'IP' }
                        ]},
                        { name: 'dst', label: 'Hedef', type: 'select', options: [
                            { value: 'any', label: 'any', selected: true },
                            { value: 'host', label: 'host' },
                            { value: 'specific', label: 'Belirli IP' }
                        ]},
                        { name: 'dst_ip', label: 'Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1', hint: 'Hedef olarak "Belirli IP" seçildiğinde doldurulur' },
                        { name: 'src_port', label: 'Kaynak Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 80', hint: 'Boş bırakılırsa tüm portlar' },
                        { name: 'dst_port', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: 'any veya 443', hint: 'Boş bırakılırsa tüm portlar' }
                    ]
                },
                {
                    title: 'Zaman Kısıtlaması',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'time_range', label: 'Time Range', type: 'text', optional: true, placeholder: 't1', hint: 'Önceden tanımlanmış time-range adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const type = data._cgtype || 'standard', num = cgEsc(data.acl_num || '');
            const rid = cgEsc(data.rule_id || '') || '10', action = cgEsc(data.action || 'permit');
            const src = cgEsc(data.src || 'any'), srcip = cgEsc(data.src_ip || ''), tr = cgEsc(data.time_range || '');
            let c = '# ========================================\n# Huawei — ACL Configuration\n# ========================================\n\n';
            c += 'acl number ' + num + '\n';
            if (type === 'standard') {
                let srcStr = src === 'specific' ? 'host ' + srcip : src;
                c += ' rule ' + rid + ' ' + action + ' source ' + srcStr;
                if (tr) c += ' time-range ' + tr;
                c += '\nquit\n';
            } else {
                const proto = cgEsc(data.proto || 'tcp'), dst = cgEsc(data.dst || 'any'), dstip = cgEsc(data.dst_ip || '');
                const sp = cgEsc(data.src_port || ''), dp = cgEsc(data.dst_port || '');
                let srcStr = src === 'specific' ? 'host ' + srcip : src;
                let dstStr = dst === 'specific' ? 'host ' + dstip : dst;
                c += ' rule ' + rid + ' ' + action + ' ' + proto + ' source ' + srcStr;
                if (sp && sp !== 'any') c += ' eq ' + sp;
                c += ' destination ' + dstStr;
                if (dp && dp !== 'any') c += ' eq ' + dp;
                if (tr) c += ' time-range ' + tr;
                c += '\nquit\n';
            }
            return c;
        });
    }
};

// ── Huawei: Security Policy ───────────────────────────────────────────────────
HuaweiVRP.security = {
    label: 'Security',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Policy (Huawei VRP)',
                desc: 'Huawei switch güvenlik özellikleri — Port Security, DHCP Snooping, DAI, IP Source Guard ve BPDU Guard.'
            },
            sections: [
                {
                    title: 'Port Security ve MAC Sınırlama',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'ps_enable', label: 'Port Security Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'ps_iface', label: 'Arayüz', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Port security uygulanacak arayüz' },
                        { name: 'ps_max_mac', label: 'Maks. MAC Sayısı', type: 'text', optional: true, placeholder: '2', hint: 'İzin verilen maksimum MAC adresi sayısı' },
                        { name: 'ps_violation', label: 'İhlal Modu', type: 'select', options: [
                            { value: '', label: 'Seçin', selected: true },
                            { value: 'shutdown', label: 'Shutdown' },
                            { value: 'restrict', label: 'Restrict' },
                            { value: 'protect', label: 'Protect' }
                        ]},
                        { name: 'ps_sticky', label: 'Sticky MAC', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'DHCP Snooping',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'ds_enable', label: 'DHCP Snooping Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'ds_iface', label: 'Arayüz', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/2', hint: 'DHCP snooping uygulanacak arayüz' },
                        { name: 'ds_vlan', label: 'VLAN', type: 'text', optional: true, placeholder: '10', hint: 'DHCP snooping VLAN numarası' }
                    ]
                },
                {
                    title: 'Dynamic ARP Inspection (DAI)',
                    icon: 'fas fa-exclamation-triangle',
                    fields: [
                        { name: 'dai_enable', label: 'DAI Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'dai_iface', label: 'Arayüz', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/3', hint: 'ARP anti-attack uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'IP Source Guard',
                    icon: 'fas fa-fingerprint',
                    fields: [
                        { name: 'isg_enable', label: 'IP Source Guard Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'isg_iface', label: 'Arayüz', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/4', hint: 'IP source guard uygulanacak arayüz' }
                    ]
                },
                {
                    title: 'BPDU Guard',
                    icon: 'fas fa-ban',
                    fields: [
                        { name: 'bpdu_enable', label: 'BPDU Guard Etkinleştir', type: 'checkbox', checked: false },
                        { name: 'bpdu_iface', label: 'Arayüz', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/5', hint: 'BPDU protection uygulanacak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            let c = '# ========================================\n# Huawei — Security Configuration\n# ========================================\n\n';
            c += '[Huawei] system-view\n\n';
            if (data.ps_enable) {
                const iface = cgEsc(data.ps_iface || ''), maxmac = cgEsc(data.ps_max_mac || '');
                const viol = cgEsc(data.ps_violation || ''), sticky = data.ps_sticky;
                if (iface) {
                    c += '# Port Security\ninterface ' + iface + '\n port-security enable\n';
                    if (maxmac) c += ' port-security max-mac-number ' + maxmac + '\n';
                    if (viol) c += ' port-security violation ' + viol + '\n';
                    if (sticky) c += ' port-security mac-address sticky\n';
                    c += 'quit\n\n';
                }
            }
            if (data.ds_enable) {
                const iface = cgEsc(data.ds_iface || ''), vlan = cgEsc(data.ds_vlan || '');
                if (iface) {
                    c += '# DHCP Snooping\ninterface ' + iface + '\n dhcp snooping enable\n';
                    if (vlan) c += ' dhcp snooping vlan ' + vlan + '\n';
                    c += 'quit\n\n';
                }
            }
            if (data.dai_enable) {
                const iface = cgEsc(data.dai_iface || '');
                if (iface) c += '# DAI\ninterface ' + iface + '\n arp anti-attack enable\nquit\n\n';
            }
            if (data.isg_enable) {
                const iface = cgEsc(data.isg_iface || '');
                if (iface) c += '# IP Source Guard\ninterface ' + iface + '\n ip source guard enable\nquit\n\n';
            }
            if (data.bpdu_enable) {
                const iface = cgEsc(data.bpdu_iface || '');
                if (iface) c += '# BPDU Guard\ninterface ' + iface + '\n stp bpdu-protection enable\nquit\n\n';
            }
            if (c.endsWith('[Huawei] system-view\n\n')) c += '# En az bir güvenlik özelliği etkinleştirin.\n';
            return c;
        });
    }
};

// ── Huawei VRP: IS-IS ─────────────────────────────────────────────────────────
HuaweiVRP.isis = {
    label: 'IS-IS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'IS-IS (Huawei VRP)',
                desc: 'Huawei VRP IS-IS routing protokolü — process ID, NET adresi, level seçimi ve arayüz aktivasyonu.'
            },
            sections: [
                {
                    title: 'IS-IS Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'IS-IS process numarası' },
                        { name: 'net', label: 'Network Entity (NET)', type: 'text', required: true, placeholder: '49.0001.0000.0000.0001.00', hint: 'OSI NET adresi (area.systemID.selector formatında)' },
                        { name: 'level', label: 'IS-IS Level', type: 'select', options: [
                            { value: 'level-2', label: 'Level-2', selected: true },
                            { value: 'level-1', label: 'Level-1' },
                            { value: 'level-1-2', label: 'Level-1-2' }
                        ]}
                    ]
                },
                {
                    title: 'Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifaces', label: 'Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/0, GE0/0/1', hint: 'Virgülle ayrılmış IS-IS etkinleştirilecek arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || ''), net = cgEsc(data.net || ''), level = cgEsc(data.level || 'level-2');
            const ifaces = cgEsc(data.ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei VRP — IS-IS\n# ========================================\n\n';
            c += 'isis ' + procId + '\n network-entity ' + net + '\n is-level ' + level + '\n#\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n isis enable ' + procId + '\n';
                if (level !== 'level-1-2') c += ' isis circuit-level ' + level + '\n';
                c += '#\n';
            });
            c += '\n# Doğrulama:\n# display isis peer\n# display isis lsdb\n# display ip routing-table protocol isis\n';
            return c;
        });
    }
};

// ── Huawei VRP: Eth-Trunk (LAG) ───────────────────────────────────────────────
HuaweiVRP.ethtunk = {
    label: 'Eth-Trunk (LAG)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Eth-Trunk / LAG (Huawei VRP)',
                desc: 'Huawei link aggregation — LACP dinamik veya statik mod, üye arayüzler ve isteğe bağlı routed IP ataması.'
            },
            sections: [
                {
                    title: 'Eth-Trunk Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trunk_id', label: 'Eth-Trunk ID', type: 'text', required: true, placeholder: '1', hint: 'Eth-Trunk arayüz numarası (örn: 1 → Eth-Trunk1)' },
                        { name: 'mode', label: 'Mod', type: 'select', options: [
                            { value: 'lacp-static', label: 'LACP (Dynamic)', selected: true },
                            { value: 'manual load-balance', label: 'Manual (Static)' }
                        ]}
                    ]
                },
                {
                    title: 'Üye Arayüzler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/1, GE0/0/2', hint: 'Virgülle ayrılmış Eth-Trunk üye arayüzler' },
                        { name: 'ip', label: 'Interface IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.1 255.255.255.252', hint: 'Routed interface ise IP adresi ve netmask' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const trunkId = cgEsc(data.trunk_id || ''), mode = cgEsc(data.mode || 'lacp-static');
            const members = cgEsc(data.members || '').split(',').map(s => s.trim()).filter(Boolean);
            const ip = cgEsc(data.ip || '');
            let c = '# ========================================\n# Huawei VRP — Eth-Trunk (LAG)\n# ========================================\n\n';
            c += 'interface Eth-Trunk' + trunkId + '\n mode ' + mode + '\n';
            if (ip) c += ' ip address ' + ip + '\n';
            c += '#\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n eth-trunk ' + trunkId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display eth-trunk ' + trunkId + '\n# display lacp statistics\n';
            return c;
        });
    }
};

// ── Huawei VRP: MPLS LDP ──────────────────────────────────────────────────────
HuaweiVRP.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'MPLS / LDP (Huawei VRP)',
                desc: 'Huawei VRP MPLS ve LDP yapılandırması — LSR ID ataması ve arayüzlerde MPLS/LDP aktivasyonu.'
            },
            sections: [
                {
                    title: 'MPLS Global',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'lsr_id', label: 'LSR ID (Loopback IP)', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'MPLS Label Switching Router kimliği (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'MPLS Arayüzleri',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ifaces', label: 'MPLS Interface(ler)', type: 'text', required: true, placeholder: 'GE0/0/0, GE0/0/1', hint: 'Virgülle ayrılmış MPLS ve LDP etkinleştirilecek arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const lsrId = cgEsc(data.lsr_id || '');
            const ifaces = cgEsc(data.ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei VRP — MPLS / LDP\n# ========================================\n\n';
            c += 'mpls lsr-id ' + lsrId + '\nmpls\nmpls ldp\n#\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n mpls\n mpls ldp\n#\n';
            });
            c += '\n# Doğrulama:\n# display mpls ldp session\n# display mpls ldp lsp\n# display mpls lsp\n';
            return c;
        });
    }
};

// ── Huawei VRP: L3VPN ─────────────────────────────────────────────────────────
HuaweiVRP.l3vpn = {
    label: 'L3VPN (VRF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'L3VPN / VRF (Huawei VRP)',
                desc: 'Huawei VRP MPLS L3VPN — VPN instance, Route Distinguisher, RT import/export, CE arayüzü ve BGP VPNv4 yapılandırması.'
            },
            sections: [
                {
                    title: 'VPN Instance',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vpn_name', label: 'VPN Instance Adı', type: 'text', required: true, placeholder: 'CUST_A', hint: 'Benzersiz müşteri VPN adı' },
                        { name: 'rd', label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'RD değeri (AS:NN veya IP:NN formatında)' },
                        { name: 'rt_import', label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'VPN route-target import değeri' },
                        { name: 'rt_export', label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'VPN route-target export değeri' }
                    ]
                },
                {
                    title: 'CE Arayüzü ve BGP',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'ce_iface', label: 'CE Interface', type: 'text', required: true, placeholder: 'GE0/1/0', hint: 'CE cihazına bağlanan PE arayüzü' },
                        { name: 'ce_ip', label: 'CE Interface IP', type: 'text', required: true, placeholder: '10.1.1.1 255.255.255.252', hint: 'CE arayüzüne atanacak IP ve netmask' },
                        { name: 'bgp_as', label: 'PE BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Provider Edge BGP AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vpnName = cgEsc(data.vpn_name || ''), rd = cgEsc(data.rd || '');
            const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
            const ceIface = cgEsc(data.ce_iface || ''), ceIp = cgEsc(data.ce_ip || ''), bgpAs = cgEsc(data.bgp_as || '');
            let c = '# ========================================\n# Huawei VRP — L3VPN (VRF)\n# ========================================\n\n';
            c += 'ip vpn-instance ' + vpnName + '\n route-distinguisher ' + rd + '\n vpn-target ' + rtImport + ' import-extcommunity\n vpn-target ' + rtExport + ' export-extcommunity\n#\n\n';
            c += 'interface ' + ceIface + '\n ip binding vpn-instance ' + vpnName + '\n ip address ' + ceIp + '\n#\n\n';
            c += 'bgp ' + bgpAs + '\n ipv4-family vpn-instance ' + vpnName + '\n  import-route direct\n#\n\n';
            c += '# Doğrulama:\n# display ip vpn-instance ' + vpnName + '\n# display ip routing-table vpn-instance ' + vpnName + '\n# display bgp vpnv4 vpn-instance ' + vpnName + ' routing-table\n';
            return c;
        });
    }
};

// ── HuaweiVRP: Interface / Loopback ───────────────────────────────────────────
HuaweiVRP.interface = {
    label: 'Interface / Loopback',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface / Loopback (Huawei VRP)',
                desc: 'Huawei VRP arayüz yapılandırması — IP adresi, açıklama ve admin durumu. Loopback için de kullanılabilir.'
            },
            sections: [
                {
                    title: 'Arayüz Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'intf_name', label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Tam arayüz adı (örn: GE0/0/1, LoopBack0)' },
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Arayüze atanacak IPv4 adresi' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.252', hint: 'Tam netmask formatında (örn: 255.255.255.252)' },
                        { name: 'description', label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN-Link', hint: 'Arayüz için açıklayıcı etiket' },
                        { name: 'shutdown', label: 'Shutdown Durumu', type: 'select', options: [
                            { value: 'undo shutdown', label: 'undo shutdown (aktif)', selected: true },
                            { value: 'shutdown', label: 'shutdown (pasif)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.intf_name || ''), ip = cgEsc(data.ip || ''), mask = cgEsc(data.mask || '');
            const description = cgEsc(data.description || ''), shutdown = cgEsc(data.shutdown || 'undo shutdown');
            let c = '# ========================================\n# Huawei VRP — Interface / Loopback\n# ========================================\n\n';
            c += 'interface ' + intfName + '\n';
            c += ' description ' + description + '\n';
            c += ' ip address ' + ip + ' ' + mask + '\n';
            c += ' ' + shutdown + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display interface ' + intfName + '\n# display ip interface brief\n';
            return c;
        });
    }
};

// ── HuaweiVRP: OSPF ───────────────────────────────────────────────────────────
HuaweiVRP.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (Huawei VRP)',
                desc: 'Huawei VRP OSPF yapılandırması — process ID, router-ID, area, network bildirimi ve passive interface.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'process_id', label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF process numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'OSPF router kimliği (genellikle Loopback IP)' },
                        { name: 'area', label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'OSPF area numarası (backbone için 0)' }
                    ]
                },
                {
                    title: 'Network Bildirimi',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'networks', label: 'Network(ler)', type: 'text', required: true, placeholder: '192.168.1.0/24,10.0.0.0/30', hint: 'Virgülle ayrılmış CIDR formatında networkler' },
                        { name: 'passive_intfs', label: 'Passive Interface(ler)', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/2', hint: 'Virgülle ayrılmış silent-interface listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const processId = cgEsc(data.process_id || ''), routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
            const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
            const passiveIntfs = cgEsc(data.passive_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
            function cidrToWildcard(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                const wild = (~mask) >>> 0;
                return net + ' ' + [(wild >>> 24) & 0xFF, (wild >>> 16) & 0xFF, (wild >>> 8) & 0xFF, wild & 0xFF].join('.');
            }
            let c = '# ========================================\n# Huawei VRP — OSPF\n# ========================================\n\n';
            c += 'ospf ' + processId + ' router-id ' + routerId + '\n';
            c += ' area ' + area + '\n';
            networks.forEach(net => { c += '  network ' + cidrToWildcard(net) + '\n'; });
            passiveIntfs.forEach(intf => { c += ' silent-interface ' + intf + '\n'; });
            c += '#\n';
            c += '\n# Doğrulama:\n# display ospf peer\n# display ip routing-table protocol ospf\n';
            return c;
        });
    }
};

// ── HuaweiVRP: BGP ────────────────────────────────────────────────────────────
HuaweiVRP.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (Huawei VRP)',
                desc: 'Huawei VRP BGP yapılandırması — yerel AS, router-ID, peer tanımı, peer group ve ağ bildirimi.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP router kimliği (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'remote_as', label: 'Remote AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', label: 'Peer Group', type: 'text', optional: true, placeholder: 'EBGP-PEERS', hint: 'Peer group adı (birden fazla komşu için)' }
                    ]
                },
                {
                    title: 'Network Bildirimi',
                    icon: 'fas fa-broadcast-tower',
                    fields: [
                        { name: 'networks', label: 'Network(ler)', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'Virgülle ayrılmış BGP ile duyurulacak prefix\'ler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), remoteAs = cgEsc(data.remote_as || '');
            const peerGroup = cgEsc(data.peer_group || '');
            const networks = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
            function cidrToNetMask(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                return net + ' ' + [(mask >>> 24) & 0xFF, (mask >>> 16) & 0xFF, (mask >>> 8) & 0xFF, mask & 0xFF].join('.');
            }
            let c = '# ========================================\n# Huawei VRP — BGP\n# ========================================\n\n';
            c += 'bgp ' + localAs + '\n';
            c += ' router-id ' + routerId + '\n';
            c += ' peer ' + peerIp + ' as-number ' + remoteAs + '\n';
            if (peerGroup) c += ' peer ' + peerIp + ' group ' + peerGroup + '\n';
            c += ' ipv4-family unicast\n';
            c += '  peer ' + peerIp + ' enable\n';
            networks.forEach(net => { c += '  network ' + cidrToNetMask(net) + '\n'; });
            c += '#\n';
            c += '\n# Doğrulama:\n# display bgp peer\n# display bgp routing-table\n';
            return c;
        });
    }
};

// ── HuaweiVRP: MSTP / STP ─────────────────────────────────────────────────────
HuaweiVRP.mstp = {
    label: 'MSTP / STP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'MSTP / STP (Huawei VRP)',
                desc: 'Huawei VRP Spanning Tree yapılandırması — mod seçimi (MSTP/RSTP/STP), priority, instance ve edge port tanımı.'
            },
            sections: [
                {
                    title: 'STP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'mode', label: 'STP Modu', type: 'select', options: [
                            { value: 'mstp', label: 'MSTP', selected: true },
                            { value: 'rstp', label: 'RSTP' },
                            { value: 'stp', label: 'STP' }
                        ]},
                        { name: 'priority', label: 'Priority', type: 'text', required: true, placeholder: '4096', hint: 'Bridge priority değeri (4096\'nın katları: 0, 4096, 8192...)' },
                        { name: 'instance', label: 'Instance', type: 'text', required: true, placeholder: '0', hint: 'MSTP instance numarası (0 = CIST)' }
                    ]
                },
                {
                    title: 'MSTP Region ve Edge Port',
                    icon: 'fas fa-map',
                    fields: [
                        { name: 'vlan_map', label: 'VLAN Map', type: 'text', optional: true, placeholder: '1-100', hint: 'Instance\'a bağlanacak VLAN aralığı (örn: 1-100)' },
                        { name: 'portfast_intfs', label: 'Edge Port Interface(ler)', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/5', hint: 'Virgülle ayrılmış stp edged-port uygulanacak arayüzler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const mode = cgEsc(data.mode || 'mstp'), priority = cgEsc(data.priority || ''), instance = cgEsc(data.instance || '');
            const vlanMap = cgEsc(data.vlan_map || '');
            const portfastIntfs = cgEsc(data.portfast_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# Huawei VRP — MSTP / STP\n# ========================================\n\n';
            c += 'stp mode ' + mode + '\n';
            c += 'stp instance ' + instance + ' priority ' + priority + '\n';
            if (vlanMap) {
                c += 'stp region-configuration\n';
                c += ' instance ' + instance + ' vlan ' + vlanMap + '\n';
                c += ' active region-configuration\n';
            }
            portfastIntfs.forEach(intf => {
                c += 'interface ' + intf + '\n stp edged-port enable\n#\n';
            });
            c += '\n# Doğrulama:\n# display stp brief\n# display stp instance ' + instance + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: QoS MQC ────────────────────────────────────────────────────────
HuaweiVRP.qos = {
    label: 'QoS MQC',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS MQC (Huawei VRP)',
                desc: 'Huawei VRP Modular QoS CLI — traffic classifier, behavior ve policy tanımı ile arayüze uygulama.'
            },
            sections: [
                {
                    title: 'Traffic Classifier',
                    icon: 'fas fa-tags',
                    fields: [
                        { name: 'classifier_name', label: 'Classifier Adı', type: 'text', required: true, placeholder: 'CLASS-VOICE', hint: 'Traffic sınıflandırıcı adı' },
                        { name: 'match_dscp', label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (örn: ef, af41, cs3)' }
                    ]
                },
                {
                    title: 'Traffic Behavior',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'behavior_name', label: 'Behavior Adı', type: 'text', required: true, placeholder: 'BEH-VOICE', hint: 'Traffic davranış tanımı adı' },
                        { name: 'priority', label: 'Queue Priority', type: 'select', options: [
                            { value: 'ef', label: 'EF — Expedited Forwarding', selected: true },
                            { value: 'af41', label: 'AF41 — Assured Forwarding' },
                            { value: 'be', label: 'BE — Best Effort' }
                        ]}
                    ]
                },
                {
                    title: 'Traffic Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-QOS', hint: 'QoS policy adı' },
                        { name: 'apply_intf', label: 'Apply Interface', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/1', hint: 'Policy uygulanacak çıkış arayüzü' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const classifierName = cgEsc(data.classifier_name || ''), matchDscp = cgEsc(data.match_dscp || '');
            const behaviorName = cgEsc(data.behavior_name || ''), priority = cgEsc(data.priority || 'ef');
            const policyName = cgEsc(data.policy_name || ''), applyIntf = cgEsc(data.apply_intf || '');
            let c = '# ========================================\n# Huawei VRP — QoS MQC\n# ========================================\n\n';
            c += 'traffic classifier ' + classifierName + ' operator or\n if-match dscp ' + matchDscp + '\n#\n\n';
            c += 'traffic behavior ' + behaviorName + '\n queue ' + priority + '\n#\n\n';
            c += 'traffic policy ' + policyName + '\n classifier ' + classifierName + ' behavior ' + behaviorName + '\n#\n';
            if (applyIntf) {
                c += '\ninterface ' + applyIntf + '\n traffic-policy ' + policyName + ' outbound\n#\n';
            }
            c += '\n# Doğrulama:\n# display traffic policy applied-record\n# display qos policy interface\n';
            return c;
        });
    }
};

// ── HuaweiVRP: BFD ────────────────────────────────────────────────────────────
HuaweiVRP.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'BFD (Huawei VRP)',
                desc: 'Huawei VRP Bidirectional Forwarding Detection — hızlı link failure tespiti için BFD session yapılandırması.'
            },
            sections: [
                {
                    title: 'BFD Session',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'session_name', label: 'Session Adı', type: 'text', required: true, placeholder: 'BFD-TO-PEER', hint: 'BFD session tanımlayıcı adı' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD karşı taraf IP adresi' },
                        { name: 'local_ip', label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Yerel kaynak IP adresi' }
                    ]
                },
                {
                    title: 'Timer Ayarları',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'min_tx', label: 'Min TX Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paketi gönderme aralığı (ms)' },
                        { name: 'min_rx', label: 'Min RX Interval (ms)', type: 'text', required: true, placeholder: '300', hint: 'Minimum BFD paketi alma aralığı (ms)' },
                        { name: 'detect_mult', label: 'Detect Multiplier', type: 'text', required: true, placeholder: '3', hint: 'Kaç paket kaybında arıza ilan edilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sessionName = cgEsc(data.session_name || ''), peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
            const minTx = cgEsc(data.min_tx || ''), minRx = cgEsc(data.min_rx || ''), detectMult = cgEsc(data.detect_mult || '');
            let c = '# ========================================\n# Huawei VRP — BFD\n# ========================================\n\n';
            c += 'bfd ' + sessionName + ' bind peer-ip ' + peerIp + ' source-ip ' + localIp + '\n';
            c += ' min-echo-rx-interval ' + minRx + '\n';
            c += ' min-tx-interval ' + minTx + '\n';
            c += ' detect-multiplier ' + detectMult + '\n';
            c += ' commit\n#\n';
            c += '\n# Doğrulama:\n# display bfd session all\n';
            return c;
        });
    }
};

// ── HuaweiVRP: NTP / Clock ────────────────────────────────────────────────────
HuaweiVRP.ntp = {
    label: 'NTP / Clock',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP / Clock (Huawei VRP)',
                desc: 'Huawei VRP NTP yapılandırması — birincil ve yedek NTP sunucusu, kaynak arayüz ve timezone ayarları.'
            },
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server_ip', label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'server_ip2', label: 'NTP Server 2', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'Yedek NTP sunucu IP adresi' },
                        { name: 'source_intf', label: 'Source Interface', type: 'text', optional: true, placeholder: 'GigabitEthernet0/0/0', hint: 'NTP paketlerinin kaynak arayüzü' }
                    ]
                },
                {
                    title: 'Zaman Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', label: 'Timezone Adı', type: 'text', required: true, placeholder: 'Turkey', hint: 'Zaman dilimi adı (örn: Turkey, UTC)' },
                        { name: 'utc_offset', label: 'UTC Offset', type: 'text', required: true, placeholder: '+3', hint: 'UTC\'ye göre ofset (örn: +3, -5)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const serverIp = cgEsc(data.server_ip || ''), serverIp2 = cgEsc(data.server_ip2 || '');
            const sourceIntf = cgEsc(data.source_intf || ''), timezone = cgEsc(data.timezone || ''), utcOffset = cgEsc(data.utc_offset || '');
            let c = '# ========================================\n# Huawei VRP — NTP / Clock\n# ========================================\n\n';
            c += 'ntp-service server ' + serverIp + '\n';
            if (serverIp2) c += 'ntp-service server ' + serverIp2 + '\n';
            if (sourceIntf) c += 'ntp-service source-interface ' + sourceIntf + '\n';
            c += 'clock timezone ' + timezone + ' add ' + utcOffset + ':00:00\n';
            c += '\n# Doğrulama:\n# display ntp-service status\n# display ntp-service sessions\n';
            return c;
        });
    }
};

// ── HuaweiVRP: AAA / RADIUS ───────────────────────────────────────────────────
HuaweiVRP.aaa = {
    label: 'AAA / RADIUS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-check',
                title: 'AAA / RADIUS (Huawei VRP)',
                desc: 'Huawei VRP RADIUS tabanlı AAA yapılandırması — sunucu şablonu, kimlik doğrulama/muhasebe şemaları ve domain tanımı.'
            },
            sections: [
                {
                    title: 'RADIUS Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server_ip', label: 'RADIUS Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'RADIUS sunucu IP adresi (auth:1812, acct:1813)' },
                        { name: 'key', label: 'Shared Key', type: 'text', required: true, placeholder: 'RadiusKey123', hint: 'RADIUS şifreli paylaşılan anahtar' }
                    ]
                },
                {
                    title: 'AAA Şemaları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'auth_scheme', label: 'Auth Scheme Adı', type: 'text', required: true, placeholder: 'RADIUS-AUTH', hint: 'Kimlik doğrulama şeması adı' },
                        { name: 'acct_scheme', label: 'Accounting Scheme Adı', type: 'text', required: true, placeholder: 'RADIUS-ACCT', hint: 'Muhasebe şeması adı' },
                        { name: 'domain', label: 'Domain Adı', type: 'text', required: true, placeholder: 'default', hint: 'AAA domain adı (örn: default veya kurumsal domain)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const serverIp = cgEsc(data.server_ip || ''), key = cgEsc(data.key || '');
            const authScheme = cgEsc(data.auth_scheme || ''), acctScheme = cgEsc(data.acct_scheme || ''), domain = cgEsc(data.domain || '');
            let c = '# ========================================\n# Huawei VRP — AAA / RADIUS\n# ========================================\n\n';
            c += 'radius-server template ' + authScheme + '\n';
            c += ' radius-server authentication ' + serverIp + ' 1812\n';
            c += ' radius-server accounting ' + serverIp + ' 1813\n';
            c += ' radius-server shared-key cipher ' + key + '\n#\n\n';
            c += 'aaa\n';
            c += ' authentication-scheme ' + authScheme + '\n  authentication-mode radius local\n';
            c += ' accounting-scheme ' + acctScheme + '\n  accounting-mode radius\n';
            c += ' domain ' + domain + '\n';
            c += '  authentication-scheme ' + authScheme + '\n';
            c += '  accounting-scheme ' + acctScheme + '\n';
            c += '  radius-server ' + authScheme + '\n#\n';
            c += '\n# Doğrulama:\n# display aaa configuration\n# display radius-server template ' + authScheme + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: SNMP v3 (Detaylı) ─────────────────────────────────────────────
HuaweiVRP.snmpv3 = {
    label: 'SNMP v3 (Detaylı)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'SNMP v3 Detaylı (Huawei VRP)',
                desc: 'Huawei VRP SNMPv3 tam yapılandırması — USM kullanıcısı, auth/priv protokol ve trap hedefi.'
            },
            sections: [
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'snmp-admin', hint: 'USM (User-based Security Model) kullanıcı adı' },
                        { name: 'auth_proto', label: 'Auth Protokol', type: 'select', options: [
                            { value: 'SHA', label: 'SHA', selected: true },
                            { value: 'MD5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Kimlik doğrulama parolası (min 8 karakter)' },
                        { name: 'priv_proto', label: 'Priv Protokol', type: 'select', options: [
                            { value: 'AES128', label: 'AES128', selected: true },
                            { value: 'DES56', label: 'DES56' }
                        ]},
                        { name: 'priv_pass', label: 'Priv Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Şifreleme parolası (min 8 karakter)' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', label: 'Trap Host IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap\'larının gönderileceği NMS IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const username = cgEsc(data.username || ''), authProto = cgEsc(data.auth_proto || 'SHA'), authPass = cgEsc(data.auth_pass || '');
            const privProto = cgEsc(data.priv_proto || 'AES128'), privPass = cgEsc(data.priv_pass || ''), trapHost = cgEsc(data.trap_host || '');
            let c = '# ========================================\n# Huawei VRP — SNMP v3\n# ========================================\n\n';
            c += 'snmp-agent sys-info version v3\n';
            c += 'snmp-agent group v3 SNMP-GROUP privacy\n';
            c += 'snmp-agent usm-user v3 ' + username + ' SNMP-GROUP authentication-mode ' + authProto + ' ' + authPass + ' privacy-mode ' + privProto + ' ' + privPass + '\n';
            c += 'snmp-agent target-host trap address udp-domain ' + trapHost + ' params securityname ' + username + ' v3 privacy\n';
            c += '\n# Doğrulama:\n# display snmp-agent user\n# display snmp-agent trap\n';
            return c;
        });
    }
};

// ── HuaweiVRP: SSH / User ─────────────────────────────────────────────────────
HuaweiVRP.ssh = {
    label: 'SSH / User',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'SSH / User (Huawei VRP)',
                desc: 'Huawei VRP SSH kullanıcı yapılandırması — AAA yerel kullanıcı, auth tipi, privilege level ve stelnet aktivasyonu.'
            },
            sections: [
                {
                    title: 'Kullanıcı Ayarları',
                    icon: 'fas fa-user-cog',
                    fields: [
                        { name: 'username', label: 'Username', type: 'text', required: true, placeholder: 'netadmin', hint: 'SSH erişimi için yerel kullanıcı adı' },
                        { name: 'auth_type', label: 'Auth Tipi', type: 'select', options: [
                            { value: 'password', label: 'password', selected: true },
                            { value: 'rsa', label: 'rsa' },
                            { value: 'all', label: 'all (password + rsa)' }
                        ]},
                        { name: 'level', label: 'Privilege Level', type: 'text', required: true, placeholder: '3', hint: 'Kullanıcı yetki seviyesi (0-15, yönetici için 15)' },
                        { name: 'password', label: 'Şifre', type: 'text', required: true, placeholder: 'SecurePass123!', hint: 'irreversible-cipher ile şifrelenmiş saklanır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const username = cgEsc(data.username || ''), authType = cgEsc(data.auth_type || 'password');
            const level = cgEsc(data.level || ''), password = cgEsc(data.password || '');
            let c = '# ========================================\n# Huawei VRP — SSH / User\n# ========================================\n\n';
            c += 'aaa\n';
            c += ' local-user ' + username + ' password irreversible-cipher ' + password + '\n';
            c += ' local-user ' + username + ' service-type ssh\n';
            c += ' local-user ' + username + ' privilege level ' + level + '\n#\n\n';
            c += 'ssh user ' + username + ' authentication-type ' + authType + '\n';
            c += 'stelnet server enable\n';
            c += '\n# Doğrulama:\n# display local-user username ' + username + '\n# display ssh user-information ' + username + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: Route Policy ───────────────────────────────────────────────────
HuaweiVRP.routepolicy = {
    label: 'Route Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Route Policy (Huawei VRP)',
                desc: 'Huawei VRP route-policy yapılandırması — node tanımı, prefix eşleştirme, local-preference ve community uygulama.'
            },
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-IN', hint: 'Route-policy tanımlayıcı adı' },
                        { name: 'node_seq', label: 'Node Sequence', type: 'text', required: true, placeholder: '10', hint: 'Node sıra numarası (küçük numara önce işlenir)' },
                        { name: 'mode', label: 'Mode', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]}
                    ]
                },
                {
                    title: 'Match ve Apply',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'match_prefix', label: 'Match Prefix', type: 'text', optional: true, placeholder: '10.0.0.0/8', hint: 'Eşleştirilecek CIDR prefix (boş bırakılırsa tümü eşleşir)' },
                        { name: 'apply_localpref', label: 'Apply Local Preference', type: 'text', optional: true, placeholder: '200', hint: 'BGP local-preference değeri (iBGP için)' },
                        { name: 'apply_community', label: 'Apply Community', type: 'text', optional: true, placeholder: '65001:100', hint: 'BGP community değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const policyName = cgEsc(data.policy_name || ''), nodeSeq = cgEsc(data.node_seq || ''), mode = cgEsc(data.mode || 'permit');
            const matchPrefix = cgEsc(data.match_prefix || ''), applyLocalpref = cgEsc(data.apply_localpref || ''), applyCommunity = cgEsc(data.apply_community || '');
            let c = '# ========================================\n# Huawei VRP — Route Policy\n# ========================================\n\n';
            if (matchPrefix) c += 'ip ip-prefix PFX-' + policyName + ' index 5 permit ' + matchPrefix + '\n#\n\n';
            c += 'route-policy ' + policyName + ' ' + mode + ' node ' + nodeSeq + '\n';
            if (matchPrefix) c += ' if-match ip-prefix PFX-' + policyName + '\n';
            if (applyLocalpref) c += ' apply local-preference ' + applyLocalpref + '\n';
            if (applyCommunity) c += ' apply community ' + applyCommunity + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display route-policy ' + policyName + '\n';
            return c;
        });
    }
};

// ── HuaweiVRP: IPSec VPN IKEv2 ────────────────────────────────────────────────
HuaweiVRP.ipsec = {
    label: 'IPSec VPN IKEv2',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'IPSec VPN IKEv2 (Huawei VRP)',
                desc: 'Huawei VRP site-to-site IPSec IKEv2 VPN — IKE proposal, peer tanımı, IPSec proposal ve policy template.'
            },
            sections: [
                {
                    title: 'Peer Bilgileri',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_name', label: 'Peer Adı', type: 'text', required: true, placeholder: 'PEER-REMOTE', hint: 'IKE peer tanımlayıcı adı' },
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Karşı taraf VPN gateway IP adresi' },
                        { name: 'local_ip', label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'Yerel VPN gateway IP adresi' },
                        { name: 'psk', label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'IKEv2Secret!', hint: 'Paylaşılan ön anahtar (cipher ile saklanır)' }
                    ]
                },
                {
                    title: 'Network Tanımları',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'local_net', label: 'Local Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.0/24', hint: 'Yerel korunan ağ (CIDR formatında)' },
                        { name: 'remote_net', label: 'Remote Network (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.0/24', hint: 'Uzak korunan ağ (CIDR formatında)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerName = cgEsc(data.peer_name || ''), peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
            const psk = cgEsc(data.psk || ''), localNet = cgEsc(data.local_net || ''), remoteNet = cgEsc(data.remote_net || '');
            function cidrToNetWild(cidr) {
                const parts = cidr.split('/');
                const net = parts[0];
                const prefix = parseInt(parts[1] || '24');
                const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
                const wild = (~mask) >>> 0;
                return { net, wild: [(wild >>> 24) & 0xFF, (wild >>> 16) & 0xFF, (wild >>> 8) & 0xFF, wild & 0xFF].join('.') };
            }
            const ln = cidrToNetWild(localNet), rn = cidrToNetWild(remoteNet);
            let c = '# ========================================\n# Huawei VRP — IPSec VPN IKEv2\n# ========================================\n\n';
            c += 'ike proposal 10\n encryption-algorithm aes-256\n dh group14\n authentication-algorithm sha2-256\n authentication-method pre-share\n integrity-algorithm hmac-sha2-256\n prf hmac-sha2-256\n#\n\n';
            c += 'ike peer ' + peerName + '\n pre-shared-key cipher ' + psk + '\n ike-proposal 10\n remote-address ' + peerIp + '\n local-address ' + localIp + '\n#\n\n';
            c += 'ipsec proposal PROP-' + peerName + '\n encapsulation-mode tunnel\n transform esp\n esp authentication-algorithm sha2-256\n esp encryption-algorithm aes-256\n#\n\n';
            c += 'ipsec policy-template TMPL-' + peerName + ' 1\n ike-peer ' + peerName + '\n proposal PROP-' + peerName + '\n ip-address-left ' + ln.net + ' ' + ln.wild + '\n ip-address-right ' + rn.net + ' ' + rn.wild + '\n#\n';
            c += '\n# Doğrulama:\n# display ike sa\n# display ipsec sa\n';
            return c;
        });
    }
};

// ── HuaweiVRP: IPv6 Interface ─────────────────────────────────────────────────
HuaweiVRP.ipv6 = {
    label: 'IPv6 Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'IPv6 Interface (Huawei VRP)',
                desc: 'Huawei VRP IPv6 arayüz yapılandırması — IPv6 etkinleştirme, adres ataması ve RA (Router Advertisement) kontrolü.'
            },
            sections: [
                {
                    title: 'IPv6 Arayüz Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intf_name', label: 'Interface Adı', type: 'text', required: true, placeholder: 'GigabitEthernet0/0/1', hint: 'IPv6 etkinleştirilecek arayüz (örn: GE0/0/1)' },
                        { name: 'ipv6_addr', label: 'IPv6 Adresi/Prefix', type: 'text', required: true, placeholder: '2001:db8::1/64', hint: 'CIDR formatında IPv6 adresi (örn: 2001:db8::1/64)' },
                        { name: 'ra_send', label: 'RA Send', type: 'select', options: [
                            { value: 'enable', label: 'enable (RA gönder)', selected: true },
                            { value: 'disable', label: 'disable (RA göndermez)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const intfName = cgEsc(data.intf_name || ''), ipv6Addr = cgEsc(data.ipv6_addr || ''), raSend = cgEsc(data.ra_send || 'enable');
            let c = '# ========================================\n# Huawei VRP — IPv6 Interface\n# ========================================\n\n';
            c += 'ipv6\n';
            c += 'interface ' + intfName + '\n';
            c += ' ipv6 enable\n';
            c += ' ipv6 address ' + ipv6Addr + '\n';
            c += (raSend === 'enable') ? ' undo ipv6 nd ra halt\n' : ' ipv6 nd ra halt\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display ipv6 interface ' + intfName + '\n# display ipv6 routing-table\n';
            return c;
        });
    }
};
