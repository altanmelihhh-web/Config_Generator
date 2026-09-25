'use strict';

const Dell = {};
const ExtremeNet = {};

// ── Dell OS10: lab bulgularından türetilen girdi uyarıları (CLI Lab dell-09/12/14/16 arıza ve "çalışır ama yanlış" durumları) ──
const _os10Wip = ip => /^(\d{1,3}\.){3}\d{1,3}$/.test(String(ip || '').trim()) && String(ip).trim().split('.').every(o => +o <= 255);
const _os10Wn = ip => String(ip || '').trim().split('.').reduce((a, o) => a * 256 + (+o), 0);
function _os10Wpfx(s) {
    const m = String(s || '').trim().match(/^([\d.]+)\/(\d{1,2})$/);
    if (!m || !_os10Wip(m[1]) || +m[2] > 32) return null;
    const len = +m[2], size = 2 ** (32 - len);
    return { ip: m[1], len, base: Math.floor(_os10Wn(m[1]) / size) * size, size };
}
const _os10Win = (ip, p) => !!p && _os10Wip(ip) && Math.floor(_os10Wn(ip) / p.size) * p.size === p.base;
// OS10 ACL adres ifadesi: 'any' | 'host A.B.C.D' | 'A.B.C.D/len' (yalın IP → host)
const _os10Waddr = x => { const t = String(x || '').trim(); return !t || /^any$/i.test(t) ? 'any' : _os10Wip(t) ? 'host ' + t : /^host\s+/i.test(t) ? t.replace(/^host\s+/i, 'host ') : t; };

// ── Dell: General ─────────────────────────────────────────────────────────────
Dell.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Dell OS10 — Genel Konfigürasyon',
                desc: 'Temel hostname, VLAN, IP ve gateway yapılandırması. Dell OS10 Cisco-benzeri CLI kullanır.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', why: "Hostname OS10 promptunda ve syslog kayıtlarında görünür; varsayılan bırakılan cihazlarda log korelasyonu yapılamaz ve konsola bağlanan teknisyen hangi cihazda olduğunu anlayamaz.", label: 'Hostname', type: 'text', required: true, placeholder: 'DELL-SW1', hint: 'Cihaz host adı' }
                    ]
                },
                {
                    title: 'VLAN ve IP Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan', why: "VLAN ID karşı uçtaki trunk'ta izinli değilse arayüz <b>up</b> görünür ama trafik geçmez. OS10'da VLAN interface ayrıca <code>no shutdown</code> edilmediği sürece L3 çalışmaz.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: 'Layer 2 VLAN numarası' },
                        { name: 'wan_ip', why: "Bu adres alt cihazların gateway'i olur; ağda ikinci kez kullanılırsa duplicate address oluşur, ARP tablosu sürekli değişir ve trafik aralıklarla kesilir.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'SVI / WAN IP adresi' },
                        { name: 'ip_on', why: 'Aynı IP iki arayüze verilemez; OS10 ikinci satırı çakışma nedeniyle reddeder.', label: 'IP Hangi Arayüzde', type: 'select', options: [
                            { value: 'svi', label: 'VLAN arayüzü (SVI)', selected: true },
                            { value: 'wan', label: 'WAN portu (routed)' }
                        ]},
                        { name: 'subnet', why: "Maske karşı uçla birebir aynı olmalıdır; farklı maskeler aynı fiziksel segmentteki hostların bir kısmını uzak ağ saydırır ve bu cihazlar sessizce erişilemez hâle gelir.", label: 'Subnet Mask', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.255.0', hint: 'OS10\'a CIDR olarak yazılır (255.255.255.0 → /24)' },
                        { name: 'gw', why: "Varsayılan rota bu adrese kurulur. Gateway doğrudan bağlı bir subnet içinde değilse OS10 rotayı aktif etmez ve cihaz hiçbir uzak ağa ulaşamaz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan ağ geçidi IP adresi' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "Port aralığı yazarken OS10 söz dizimine uyun (<code>ethernet 1/1/1-1/1/10</code>); yanlışlıkla uplink dâhil edilirse trunk access'e döner ve uzaktan yönetim anında kopar.", label: 'LAN Arayüzü (port aralığı)', type: 'text', validate: 'iface_range', required: true, placeholder: 'ethernet1/1/1-1/1/4', hint: 'Access VLAN atanacak port aralığı' },
                        { name: 'wan_iface', why: "WAN portu <code>no switchport</code> ile L3 moda alınmalıdır; switchport olarak kalan bir arayüze IP verilemez ve konfigürasyon sessizce etkisiz kalır.", label: 'WAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1/5', hint: 'IP adresi atanacak WAN portu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vlan = cgEsc(data.vlan || '');
            const wanIp = cgEsc(data.wan_ip || ''), subnet = cgEsc(data.subnet || '');
            const gw = cgEsc(data.gw || ''), iface = cgEsc(data.iface || '');
            const wanIface = cgEsc(data.wan_iface || '');
            let c = '# ========================================\n# Dell OS10 — General Configuration\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Hostname\nhostname ' + hn + '\n\n';
            c += '# VLAN\nvlan ' + vlan + '\n name VLAN_' + vlan + '\n!\n';
            // OS10 IP'yi CIDR ile yazar (canli config: 'ip address A.B.C.D/24'); ayni IP iki arayuze verilmez.
            const cidr = wanIp + '/' + cgMaskLen(subnet), onWan = data.ip_on === 'wan';
            c += 'interface vlan ' + vlan + '\n' + (onWan ? '' : ' ip address ' + cidr + '\n') + ' no shutdown\n!\n\n';
            // Canli config bicimi: 'ip route 0.0.0.0/0 <gw>'
            c += '# Default Gateway\nip route 0.0.0.0/0 ' + gw + '\n\n';
            c += '# WAN Interface\ninterface ' + wanIface + '\n' + (onWan ? ' no switchport\n ip address ' + cidr + '\n' : '') + ' no shutdown\n!\n\n';
            // 'interface range' bicimi dogrulanmadi; portlar tek tek yazilir
            c += '# LAN Portlari — VLAN Access\n';
            cgExpandIfList(iface).forEach(i => { c += 'interface ' + i + '\n switchport mode access\n switchport access vlan ' + vlan + '\n no shutdown\n!\n'; });
            c += '\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show running-configuration\n# show vlan ' + vlan + '\n# show interfaces ' + wanIface + '\n# show ip route\n';
            return c;
        });
    }
};

// ── ExtremeNet: General ───────────────────────────────────────────────────────
// ExtremeXOS VLAN-centric model: ports are assigned TO vlans, not the reverse.
// Routing: configure iproute add default (not "ip route")
// Save:    save configuration (not "write memory")
ExtremeNet.general = {
    label: 'General',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Extreme Networks ExtremeXOS — Genel Konfigürasyon',
                desc: 'ExtremeXOS VLAN-centric model: portlar VLAN\'a atanır (Cisco\'nun tersi). <code>save configuration</code> ile kaydedilir.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', why: "ExtremeXOS'ta <code>configure snmp sysName</code> hem prompt hem SNMP kimliğidir; boş bırakılırsa izleme sisteminde cihaz IP ile görünür ve envanter eşleştirmesi bozulur.", label: 'Hostname', type: 'text', required: true, placeholder: 'EXTR-SW1', hint: 'Cihaz sistem adı' }
                    ]
                },
                {
                    title: 'VLAN Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan_name', why: "EXOS <b>VLAN'ı numarayla değil isimle</b> yönetir: tüm port ve IP komutları bu ismi referans alır. İsim yanlış yazılırsa komut yeni bir VLAN oluşturur ve trafik beklenen VLAN'a hiç girmez.", label: 'VLAN Adı (EXOS VLAN name)', type: 'text', required: true, placeholder: 'CORP', hint: 'ExtremeXOS VLAN tanımlayıcı adı' },
                        { name: 'vlan_id', why: "EXOS'ta tag, VLAN'ın kablo üzerindeki kimliğidir ve karşı switch ile aynı olmalıdır; isim doğru olsa bile tag farklıysa trunk üzerinden hiçbir çerçeve karşıya ulaşmaz.", label: 'VLAN ID (Tag)', type: 'text', validate: 'vlan', required: true, placeholder: '10', hint: '802.1Q VLAN tag numarası' },
                        { name: 'ip', why: "IP doğrudan VLAN'a atanır (<code>configure vlan X ipaddress</code>); ayrıca <code>enable ipforwarding</code> verilmezse VLAN'lar arası yönlendirme yapılmaz ve cihaz yalnızca L2 çalışır.", label: 'SVI IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.1', hint: 'VLAN\'a atanacak IP adresi' },
                        { name: 'mask', why: "Maske karşı uçla aynı olmalı; uyuşmazlık durumunda cihaz bazı komşuları doğrudan bağlı görmez, bunun yerine gateway'e yönlendirir ve trafik gereksiz yere dolaşır veya kaybolur.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet maskesi' },
                        { name: 'gw', why: "Varsayılan rota <code>configure iproute add default</code> ile kurulur; gateway erişilebilir bir VLAN'da değilse EXOS rotayı kabul eder ama rota asla aktif olmaz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.254', hint: 'Varsayılan ağ geçidi' }
                    ]
                },
                {
                    title: 'Port Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'access_ports', why: "EXOS'ta portlar VLAN'a atanır, VLAN porta değil (<b>Cisco'nun tersi</b>). Untagged atanan bir port önceki VLAN'dan otomatik çıkarılır; bunu bilmeden yapılan atama başka bir servisi sessizce keser.", label: 'Access Port(lar)', type: 'text', required: true, placeholder: '1,2,3,4', hint: 'Virgülle ayrılmış port listesi veya aralık (ör: 1-4)' },
                        { name: 'uplink_ports', why: "Uplink <code>tagged</code> eklenmelidir; untagged eklenirse etiketler düşer ve yalnızca tek VLAN geçer. Bir port aynı anda birden çok VLAN'da tagged olabilir ama yalnızca tek VLAN'da untagged olabilir.", label: 'Uplink/Trunk Port (tagged)', type: 'text', required: true, placeholder: '49', hint: 'Tagged uplink portu veya portlar (ör: 49,50)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), vname = cgEsc(data.vlan_name || '');
            const vid = cgEsc(data.vlan_id || ''), ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || ''), gw = cgEsc(data.gw || '');
            const aPorts = cgEsc(data.access_ports || ''), uPorts = cgEsc(data.uplink_ports || '');
            let c = '# ========================================\n# Extreme Networks ExtremeXOS — General Configuration\n# ========================================\n';
            c += '# NOT: ExtremeXOS VLAN-centric model kullanır.\n# Portlar VLAN\'a atanır (Cisco\'nun tersi).\n\n';
            c += '# Hostname (EXOS: configure snmp sysName)\nconfigure snmp sysName "' + hn + '"\n\n';
            c += '# VLAN Oluştur\ncreate vlan "' + vname + '" tag ' + vid + '\n\n';
            c += '# Access Portları VLAN\'a Untagged Ekle\nconfigure vlan "' + vname + '" add ports ' + aPorts + ' untagged\n\n';
            c += '# Uplink Portu VLAN\'a Tagged Ekle\nconfigure vlan "' + vname + '" add ports ' + uPorts + ' tagged\n\n';
            c += '# VLAN\'a IP Adresi Ata\nconfigure vlan "' + vname + '" ipaddress ' + ip + ' ' + mask + '\n\n';
            c += '# IP Forwarding Etkinleştir (routing için)\nenable ipforwarding vlan "' + vname + '"\n\n';
            c += '# Default Route\nconfigure iproute add default ' + gw + '\n\n';
            c += '# Kaydet\nsave configuration\n\n';
            c += '# Doğrulama:\n# show configuration\n# show vlan "' + vname + '"\n# show ipconfig vlan "' + vname + '"\n# show iproute\n';
            return c;
        });
    }
};

// ── Dell OS10: VLAN ───────────────────────────────────────────────────────────
Dell.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Dell OS10 — VLAN',
                desc: 'VLAN oluşturma, SVI IP ataması ve port modlarını yapılandırır (access/trunk).'
            },
            sections: [
                {
                    title: 'VLAN Tanımı',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'vlan_id', why: "VLAN ID uçtan uca tüm cihazlarda aynı olmalı; karşı tarafta tanımsız veya trunk'ta izinli değilse bağlantı sessizce çalışmaz. 1 numaralı VLAN'ı üretimde kullanmaktan kaçının.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '802.1Q VLAN numarası' },
                        { name: 'vlan_name', why: "İsim <code>show vlan</code> çıktısında VLAN'ın ne işe yaradığını söyleyen tek ipucudur; boş bırakılan VLAN'lar zamanla kimsenin silmeye cesaret edemediği ölü config'e dönüşür.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'DATA_VLAN', hint: 'VLAN için açıklayıcı isim' },
                        { name: 'svi_ip', why: "SVI adresi VLAN'ın gateway'i olur ve yalnızca <code>no shutdown</code> yapıldığında aktifleşir; ayrıca VLAN'da en az bir aktif üye port yoksa SVI <b>down</b> kalır ve hiçbir host gateway'e ulaşamaz.", label: 'SVI IP', type: 'text', validate: 'cidr', optional: true, placeholder: '10.1.100.1/24', hint: 'VLAN arayüzü IP adresi — CIDR formatında' }
                    ]
                },
                {
                    title: 'Port Atamaları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'access_ports', why: "Access port tek VLAN taşır ve etiketli gelen çerçeveleri düşürür; IP telefon veya hypervisor gibi etiketli trafik üreten cihazları access porta bağlamak trafiğin sessizce yok edilmesine yol açar.", label: 'Access Port(lar)', type: 'text', optional: true, placeholder: 'ethernet1/1/1, ethernet1/1/2', hint: 'Virgülle ayrılmış access port listesi' },
                        { name: 'trunk_ports', why: "Trunk'ta izinli VLAN listesini daraltmak şarttır; tüm VLAN'lara izin vermek broadcast alanını gereksiz genişletir ve tek bir VLAN'daki fırtına bütün switch'i etkiler.", label: 'Trunk Port(lar)', type: 'text', optional: true, placeholder: 'ethernet1/1/48', hint: 'Virgülle ayrılmış trunk port listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vlanId = cgEsc(data.vlan_id || ''), vlanName = cgEsc(data.vlan_name || '');
            const sviIp = cgEsc(data.svi_ip || '');
            const accessPorts = (data.access_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const trunkPorts = (data.trunk_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — VLAN\n# ========================================\n\n';
            c += 'interface vlan ' + vlanId + '\n';
            c += ' description ' + vlanName + '\n';
            if (sviIp) c += ' ip address ' + sviIp + '\n';
            c += ' no shutdown\n!\n\n';
            accessPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' switchport mode access\n';
                c += ' switchport access vlan ' + vlanId + '\n!\n';
            });
            if (accessPorts.length) c += '\n';
            trunkPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' switchport mode trunk\n';
                c += ' switchport trunk allowed vlan ' + vlanId + '\n!\n';
            });
            c += '\n# Doğrulama:\n# show vlan id ' + vlanId + '\n# show interfaces vlan ' + vlanId + '\n';
            return c;
        });
    }
};

// ── Dell OS10: Port-Channel / LAG ─────────────────────────────────────────────
Dell.portchannel = {
    label: 'Port-Channel / LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Dell OS10 — Port-Channel / LAG',
                desc: 'LACP veya statik link aggregation yapılandırması. Trunk, access veya routed mod desteği.'
            },
            sections: [
                {
                    title: 'Port-Channel Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pc_id', why: "Port-channel numarası yereldir ama VLT/MC-LAG kullanılıyorsa <b>iki peer'da aynı</b> olmak zorundadır; farklı numaralar bundle'ın yarım kurulmasına ve kapasitenin yarılanmasına yol açar.", label: 'Port-Channel ID', type: 'text', required: true, placeholder: '1', hint: 'Port-channel grup numarası' },
                        { name: 'lacp_mode', why: "<code>active</code> LACP müzakeresi başlatır, <code>static</code> ise müzakeresiz bundle kurar. Bir uç dinamik diğeri statikse bundle kurulmaz veya daha kötüsü <b>döngü</b> oluşur.", label: 'LACP Mod', type: 'select', options: [
                            { value: 'active', label: 'Active', selected: true },
                            { value: 'passive', label: 'Passive' },
                            { value: 'on', label: 'On (Static)' }
                        ]},
                        { name: 'members', why: "Üye portların hız ve MTU ayarları aynı olmalı; uyumsuz port bundle'a katılmaz ve bu yalnızca <code>show port-channel summary</code> çıktısında görünür, kapasite fark edilmeden düşer.", label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: 'ethernet1/1/1, ethernet1/1/2', hint: 'Virgülle ayrılmış üye port listesi' }
                    ]
                },
                {
                    title: 'Switchport / Layer 3 Modu',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'sw_mode', why: "L2 mi L3 mü seçimi geri dönüşü pahalıdır: <code>no switchport</code> verildiğinde port üzerindeki tüm VLAN üyelikleri silinir ve yanlışlıkla yapılırsa servis anında kesilir.", label: 'Mod', type: 'select', options: [
                            { value: 'trunk', label: 'Trunk', selected: true },
                            { value: 'access', label: 'Access' },
                            { value: 'routed', label: 'Routed (no switchport)' }
                        ]},
                        { name: 'vlan_ip', why: "L2 modda izinli VLAN listesi, L3 modda ise IP/maske girilir; ikisinin karıştırılması komutun reddedilmesine ve port-channel'ın yapılandırılmamış hâlde kalmasına neden olur.", label: 'VLAN / IP', type: 'text', requiredIf: { field: 'sw_mode', in: ['access', 'routed'] }, placeholder: '10,20,100 veya 10.1.1.1/30', hint: 'Trunk: VLAN listesi; Access: tek VLAN ID; Routed: IP/prefix' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pcId = cgEsc(data.pc_id || ''), lacpMode = cgEsc(data.lacp_mode || 'active');
            const members = _otherDellIfList(data.members);   // 'ethernet1/1/11-1/1/12' aralığı tek tek açılır
            const swMode = cgEsc(data.sw_mode || 'trunk'), vlanIp = cgEsc(data.vlan_ip || '');
            let c = '# ========================================\n# Dell OS10 — Port-Channel / LAG\n# ========================================\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n';
                c += ' channel-group ' + pcId + ' mode ' + lacpMode + '\n!\n';
            });
            c += '\ninterface port-channel' + pcId + '\n';
            if (swMode === 'trunk') {
                c += ' switchport mode trunk\n';
                if (vlanIp) c += ' switchport trunk allowed vlan ' + vlanIp + '\n';
            } else if (swMode === 'access') {
                c += ' switchport mode access\n';
                if (vlanIp) c += ' switchport access vlan ' + vlanIp + '\n';
            } else {
                c += ' no switchport\n';
                if (vlanIp) c += ' ip address ' + vlanIp + '\n';
            }
            c += ' no shutdown\n!\n\n';
            c += '# Doğrulama:\n# show port-channel summary\n# show lacp ' + pcId + '\n';
            // LACP lab bulguları (dell-16): mode on, iki uç passive, üyede VLAN ayarı, mod/değer uyumsuzluğu
            const w = [], vi = String(data.vlan_ip || '').trim();
            if (!/^\d+$/.test(data.pc_id || '') || +data.pc_id < 1 || +data.pc_id > 128) w.push('\u26D4 Port-channel numarası 1-128 arası bir sayı olmalı.');
            if (lacpMode === 'on') w.push('\u26A0 mode on = LACP yok: yanlış kablolanan üye fark edilmez; karşı uç LACP (active) ise üyeler hiç bağlanmaz. Mümkünse iki uçta active kullanın.');
            else if (lacpMode === 'passive') w.push('\u26A0 LACP passive: karşı uç da passive ise hiçbir uç LACP başlatmaz ve port-channel kalkmaz. En az bir uç active olmalı.');
            else w.push('\u2139 Karşı uç da LACP (active/passive) olmalı; bir uç active, diğeri on ise üyeler bağlanmaz.');
            if (members.length < 2) w.push('\u26A0 Tek üyeli port-channel yedeklilik sağlamaz; en az iki üye girin.');
            w.push('\u2139 VLAN/adres ayarlarını üyelere değil port-channel' + pcId + ' arayüzüne yazın; üyelerde farklı ayar kalırsa üye bundle\'a katılmaz.');
            const isIp = /^[\d.]+\/\d{1,2}$/.test(vi), vl = /^[\d,\s-]+$/.test(vi);
            if (swMode === 'routed' && vi && !isIp) w.push('\u26D4 Routed modda IP/prefix girilmeli (ör. 10.64.0.1/30); "' + vi + '" bir adres değil.');
            if (swMode !== 'routed' && vi && isIp) w.push('\u26D4 ' + swMode + ' modunda IP adresi yazılamaz: L2 port-channel\'a VLAN girilir. IP için modu routed seçin (ya da VLAN arayüzü kullanın).');
            if (swMode === 'access' && vi && vl && /[,\s-]/.test(vi)) w.push('\u26D4 Access modu tek VLAN taşır; birden fazla VLAN için trunk seçin.');
            return { config: c, warnings: w };
        });
    }
};

// ── Dell OS10: OSPF ───────────────────────────────────────────────────────────
Dell.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Dell OS10 — OSPF',
                desc: 'OSPF link-state routing konfigürasyonu. Area yapısı ve passive interface desteği.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', why: "Process ID yalnızca yereldir ve komşuyla aynı olması gerekmez; ancak birden fazla process açmak rotaların bölünmesine ve hangi process'in hangi arayüzü taşıdığının kaybolmasına yol açar.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası' },
                        { name: 'router_id', why: "Router-ID alan içinde benzersiz olmalı; çakışmada LSA'lar birbirini ezer, komşuluklar sürekli flap eder. Fiziksel porttan bağımsız olması için loopback adresi kullanın.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'Genellikle Loopback IP — noktalı ondalık format' }
                    ]
                },
                {
                    title: 'Network ve Passive Interface',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'networks', why: "Bu prefix'ler hangi arayüzlerin OSPF'e katılacağını belirler; çok geniş yazmak WAN veya yönetim portunu da dâhil eder ve cihaz güvenilmeyen taraflara komşuluk açmaya çalışır.", label: 'Network(ler)', type: 'textarea', required: true, rows: 3, placeholder: '10.1.0.0/24 area 0\n10.2.0.0/24 area 1', hint: 'Her satıra: IP/prefix area N formatında' },
                        { name: 'passive', why: "Kullanıcı ve sunucu portlarını passive yapmak hem CPU yükünü azaltır hem de yetkisiz bir cihazın sahte rota enjekte etmesini engeller; unutulan tek bir port tüm routing tablosunu riske atar.", label: 'Passive Interface(ler)', type: 'text', optional: true, placeholder: 'loopback0', hint: 'Virgülle ayrılmış passive arayüz listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || ''), routerId = cgEsc(data.router_id || '');
            const networks = (data.networks || '').split('\n').map(s => cgEsc(s.trim())).filter(Boolean);
            const passive = (data.passive || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — OSPF\n# ========================================\n\n';
            c += 'router ospf ' + procId + '\n';
            c += ' router-id ' + routerId + '\n';
            networks.forEach(net => {
                const parts = net.split(/\s+/);
                c += ' network ' + parts[0] + ' ' + (parts[1] || 'area') + ' ' + (parts[2] || '0') + '\n';
            });
            passive.forEach(p => c += ' passive-interface ' + p + '\n');
            c += '!\n\n# Doğrulama:\n# show ip ospf neighbor\n# show ip ospf database\n';
            return c;
        });
    }
};

// ── Dell OS10: BGP ────────────────────────────────────────────────────────────
Dell.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Dell OS10 — BGP',
                desc: 'eBGP/iBGP peer konfigürasyonu, address-family ve network advertisement.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "Local AS karşı taraftaki remote-as ile tam eşleşmeli; uyuşmazlıkta oturum açılış aşamasında sürekli resetlenir ve log'da yalnızca tekrarlayan bağlantı denemeleri görünür.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: "BGP Router-ID benzersiz olmalıdır; aynı ID'ye sahip iki cihaz arasında oturum hiç kurulmaz. Loopback adresi kullanmak arayüz arızalarından etkilenmemeyi sağlar.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP Router-ID (genellikle Loopback IP)' },
                        { name: 'bgp_type', why: "iBGP ile eBGP arasındaki fark kritiktir: iBGP'de öğrenilen rotalar diğer iBGP komşularına <b>yeniden duyurulmaz</b> (full-mesh veya route-reflector gerekir), eBGP'de ise TTL 1 olduğu için loopback peering ek ayar ister.", label: 'BGP Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP', selected: true },
                            { value: 'ibgp', label: 'iBGP' }
                        ]}
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "Peer adresi karşı ucun paketleri gerçekten gönderdiği kaynak adres olmalıdır; farklı bir adresten gelen bağlantı reddedilir ve oturum hiçbir zaman kurulmaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', why: "Peer AS karşı tarafın local AS'i ile aynı olmalı; ayrıca bu değer oturumun iBGP mi eBGP mi olduğunu belirlediği için yanlış girilmesi rota dağıtım davranışını tamamen değiştirir.", label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'network', why: "<code>network</code> ile duyurulan prefix'in routing tablosunda <b>birebir aynı maskeyle</b> bulunması gerekir; yoksa BGP onu hiç duyurmaz ve eksiklik ancak karşı taraf şikâyet edince fark edilir.", label: 'Advertise Network', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'BGP ile duyurulacak prefix' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || '');
            const bgpType = cgEsc(data.bgp_type || 'ebgp'), network = cgEsc(data.network || '');
            let c = '# ========================================\n# Dell OS10 — BGP\n# ========================================\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' bgp router-id ' + routerId + '\n';
            c += ' neighbor ' + peerIp + ' remote-as ' + peerAs + '\n';
            if (bgpType === 'ebgp') c += ' neighbor ' + peerIp + ' ebgp-multihop 2\n';
            c += ' address-family ipv4 unicast\n';
            c += '  neighbor ' + peerIp + ' activate\n';
            if (network) c += '  network ' + network + '\n';
            c += ' exit-address-family\n!\n\n';
            c += '# Doğrulama:\n# show ip bgp summary\n# show ip bgp neighbor ' + peerIp + '\n';
            return c;
        });
    }
};

// ── Dell OS10: VLT (MLAG) ─────────────────────────────────────────────────────
Dell.vlt = {
    label: 'VLT (MLAG)',
    // OS10 sozdizimi canli config'lerle dogrulandi (5/5 cihaz): 'vlt-domain N' ve
    // VLTi FIZIKSEL arayuzlerle 'discovery-interface ethernet1/1/25-1/1/26'.
    // Eski surum 'vlt domain' yaziyor ve VLTi'yi port-channel'a bagliyordu.
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Dell OS10 — VLT / MLAG',
                desc: 'Virtual Link Trunking: iki switch tek mantıksal switch gibi port-channel sunar. VLTi (peer bağlantısı) fiziksel portlarla kurulur, backup link yönetim ağı üzerinden peer\'ı izler.'
            },
            sections: [
                {
                    title: 'VLT Domain',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'domain_id', why: 'Domain ID iki peer\'da aynı olmalı; VLT sistem MAC\'i bu değerden türetilir.', label: 'VLT Domain ID', type: 'text', min: 1, max: 255, required: true, placeholder: '1', hint: 'İki peer\'da aynı değer' },
                        { name: 'backup_dest', why: 'VLTi koparsa peer\'ın hâlâ canlı olup olmadığı bu adres üzerinden anlaşılır; olmazsa iki switch de primary olup split-brain yaşanır.', label: 'Backup Destination IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.0.2', hint: 'Peer cihazın yönetim IP adresi' },
                        { name: 'primary_priority', why: 'Düşük değer primary olur. Boş bırakılırsa cihaz varsayılanı kullanılır ve rol MAC adresine göre belirlenir.', label: 'Primary Priority', type: 'text', min: 1, max: 65535, placeholder: '4096', hint: 'Düşük değer = primary; iki peer\'da farklı verin' },
                        { name: 'peer_routing', label: 'peer-routing (peer\'ın MAC\'ine gelen L3 trafiği de yönlendir)', type: 'checkbox' }
                    ]
                },
                {
                    title: 'VLTi (Peer Bağlantısı)',
                    icon: 'fas fa-ethernet',
                    info: 'VLTi portları port-channel\'a ÜYE YAPILMAZ ve üzerlerinde switchport ayarı olmamalıdır; OS10 bunları discovery-interface ile kendisi bağlar.',
                    fields: [
                        { name: 'vlti_ifaces', label: 'VLTi Arayüzleri', type: 'text', validate: 'iface_range', required: true, placeholder: 'ethernet1/1/25-1/1/26', hint: 'Aralık veya virgülle liste' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const domainId = cgEsc(data.domain_id || ''), backupDest = cgEsc(data.backup_dest || '');
            const prio = cgEsc(data.primary_priority || '');
            const vlti = cgEsc(data.vlti_ifaces || '').split(/[,\s]+/).filter(Boolean).join(',');
            let c = '# ========================================\n# Dell OS10 — VLT / MLAG\n# ========================================\n\n';
            c += 'vlt-domain ' + domainId + '\n';
            c += ' backup destination ' + backupDest + '\n';
            c += ' discovery-interface ' + vlti + '\n';
            if (prio) c += ' primary-priority ' + prio + '\n';
            if (data.peer_routing) c += ' peer-routing\n';
            c += '!\n\n# Doğrulama:\n# show vlt ' + domainId + '\n# show vlt ' + domainId + ' backup-link\n';
            return c;
        });
    }
};

// ── Dell OS10: ACL ────────────────────────────────────────────────────────────
Dell.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Dell OS10 — ACL',
                desc: 'IP erişim kontrol listesi oluşturma ve interface\'e uygulama. Protokol, kaynak/hedef ve yön desteği.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', why: "ACL adı arayüzde uygulanan adla birebir aynı olmalı; var olmayan bir ACL'in uygulanması hata vermeden kabul edilir ve kural hiç çalışmaz, bu da yanlış bir güvenlik hissi yaratır.", label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL_INBOUND', hint: 'Erişim listesi adı' },
                        { name: 'seq_start', why: "Sequence numarası değerlendirme sırasını belirler ve <b>ilk eşleşen kural kazanır</b>; araları 10'ar bırakmak sonradan araya kural eklemeyi mümkün kılar, yoksa tüm ACL yeniden yazılır.", label: 'Seq Başlangıç Numarası', type: 'text', optional: true, placeholder: '10', hint: 'İlk kural sıra numarası (varsayılan: 10)' },
                        { name: 'action', why: "Sıralamayı düşünmeden yazılan <code>permit</code>/<code>deny</code> kuralları birbirini gölgeler: geniş bir permit'in altındaki deny hiçbir zaman eşleşmez çünkü paket zaten üstte kabul edilmiştir.", label: 'Action', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'protocol', why: "<code>ip</code> seçmek TCP, UDP ve ICMP'nin tamamını kapsar ve niyetinizden çok daha geniş bir kural oluşturur; ayrıca port daraltması yalnızca tcp/udp seçildiğinde anlamlıdır.", label: 'Protokol', type: 'select', options: [
                            { value: 'ip', label: 'ip', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'src', why: "Kaynağı <code>any</code> bırakmak kuralın amacını bozar; özellikle yönetim erişimi kurallarında kaynak daraltması, cihazı dışarıdan gelen deneme saldırılarına karşı koruyan tek katmandır.", label: 'Kaynak (src)', type: 'text', required: true, placeholder: '10.1.0.0/24', hint: 'CIDR formatında kaynak veya "any"' },
                        { name: 'dst', why: "Hedefi daraltmadan yazılan kural aynı segmentteki tüm servisleri etkiler; tek bir sunucuyu korumak isterken istemeden tüm VLAN'ın trafiğini kesebilirsiniz.", label: 'Hedef (dst)', type: 'text', required: true, placeholder: 'any', hint: 'CIDR formatında hedef veya "any"' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', why: "ACL tanımlanması tek başına hiçbir şey yapmaz; bir arayüze uygulanmadığı sürece etkisizdir. Bu, ACL yapılandırmasında en sık atlanan adımdır.", label: 'Uygulanan Interface', type: 'text', optional: true, placeholder: 'ethernet1/1/1', hint: 'ACL uygulanacak port (boş bırakılabilir)' },
                        { name: 'direction', why: "<code>in</code> arayüze giren, <code>out</code> çıkan trafiktir. Yön yanlış seçilirse kural hiç eşleşmez; ayrıca yanlış yönde yazılan bir yönetim ACL'i kendi SSH oturumunuzu kesebilir.", label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'Inbound', selected: true },
                            { value: 'out', label: 'Outbound' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const aclName = cgEsc(data.acl_name || ''), action = cgEsc(data.action || 'permit');
            const proto = cgEsc(data.protocol || 'ip'), src = cgEsc(data.src || '');
            const dst = cgEsc(data.dst || ''), applyIf = cgEsc(data.apply_if || '');
            const direction = cgEsc(data.direction || 'in'), seqStart = cgEsc(data.seq_start || '10') || '10';
            let c = '# ========================================\n# Dell OS10 — ACL\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ip access-list ' + aclName + '\n';
            // Yalın IP 'host A.B.C.D' olarak yazılır (OS10 adres: any | host A.B.C.D | A.B.C.D/len)
            c += ' seq ' + seqStart + ' ' + action + ' ' + proto + ' ' + cgEsc(_os10Waddr(data.src)) + ' ' + cgEsc(_os10Waddr(data.dst)) + '\n';
            // Sonda örtük deny var (dell-14). Tek "deny" satırından sonra "deny ip any any" eklemek arayüzdeki TÜM trafiği
            // keserdi; deny kuralında sona "permit ip any any" yazılır. permit kuralında açık deny, örtük deny'ı görünür kılar.
            const tail = action === 'deny';
            c += ' seq ' + ((parseInt(seqStart, 10) || 10) + 10) + (tail ? ' permit ip any any' : ' deny ip any any') + '\n!\n\n';
            if (applyIf) {
                c += 'interface ' + applyIf + '\n';
                c += ' ip access-group ' + aclName + ' ' + direction + '\n!\n\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ip access-lists ' + aclName + '   ! kural başına eşleşme sayacı\n# show running-configuration access-list\n';
            const w = [], v = k => String(data[k] == null ? '' : data[k]).trim();
            if (tail) w.push('\u2139 Tek satır "deny" olduğu için sona "permit ip any any" eklendi. Eklenmeseydi sondaki örtük deny, arayüzdeki diğer tüm trafiği (internet dahil) de keserdi.');
            else w.push('\u26A0 Bu ACL yalnız tanımladığınız trafiğe izin verir; diğer her şey sondaki deny ile düşer. Arayüzden başka trafik de geçiyorsa gerekli permit satırlarını deny\'dan önce (daha küçük seq ile) ekleyin.');
            ['src', 'dst'].forEach((k, i) => {
                const x = v(k), p = _os10Wpfx(x);
                if (x && !/^any$/i.test(x) && !_os10Wip(x) && !/^host\s+/i.test(x) && !p) w.push('\u26D4 ' + (i ? 'Hedef' : 'Kaynak') + ' "' + x + '" geçersiz: any, tek host IP ya da A.B.C.D/uzunluk (ör. 10.64.20.0/24) girin.');
                else if (p && _os10Wn(p.ip) !== p.base) w.push('\u26A0 ' + (i ? 'Hedef' : 'Kaynak') + ' prefix ağ adresi değil (' + x + '); ağ adresini yazın (ör. ' + [24, 16, 8, 0].map(b => Math.floor(p.base / 2 ** b) % 256).join('.') + '/' + p.len + ').');
            });
            if (/^any$/i.test(v('src')) && /^any$/i.test(v('dst')) && (data.protocol || 'ip') === 'ip') w.push(action === 'deny' ? '\u26D4 Kaynak ve hedef any, protokol ip: deny satırı tüm trafiği keser; alttaki permit\'e hiç ulaşılmaz.' : '\u26A0 permit ip any any her şeye izin verir; alttaki satırlar hiç çalışmaz.');
            if (applyIf && direction === 'out') w.push('\u2139 out yönü arayüzden ÇIKAN trafiği süzer. Bir VLAN\'dan gelen trafiği süzmek için ACL, o VLAN\'ın arayüzüne in yönünde uygulanır.');
            if (!applyIf) w.push('\u2139 Uygulama arayüzü girilmedi: ACL bir arayüze bağlanmadıkça hiçbir şey yapmaz.');
            w.push('\u2139 Kurallar seq sırasıyla denenir, ilk eşleşen kazanır. Araya kural eklemek için daha küçük bir seq verin (ör. 5).');
            return { config: c, warnings: w };
        });
    }
};

// ── Dell OS10: QoS Policy ─────────────────────────────────────────────────────
Dell.qos = {
    label: 'QoS Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Dell OS10 — QoS Policy',
                desc: 'DSCP tabanlı trafik sınıflandırma ve bandwidth garantisi. Policy-map ile interface\'e uygulama.'
            },
            sections: [
                {
                    title: 'Policy ve Class-Map',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pol_name', why: "Policy adı arayüzde uygulanan adla aynı olmalı; uyuşmazlıkta QoS uygulanmış gibi görünür ama hiçbir paket sınıflandırılmaz ve tıkanıklık anında öncelik çalışmaz.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'QOS_VOIP', hint: 'Policy-map adı' },
                        { name: 'dscp_match', why: "DSCP işaretlemesi uçtan uca güvenilmelidir; sınır portlarında trust ayarı yoksa işaretleme silinir veya kullanıcı cihazı kendini yüksek öncelikli işaretleyip ses kuyruğuna sızar.", label: 'DSCP Match Değeri', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (EF, AF41, CS3 vb.)' },
                        { name: 'bandwidth', why: "Garanti edilen yüzde tıkanıklık anındaki minimumdur; toplam %100'ü aşarsa policy uygulanmaz ve çok yüksek değer diğer trafiği açlığa iterek TCP retransmit patlamasına yol açar.", label: 'Bandwidth %', type: 'text', required: true, placeholder: '30', hint: 'Priority kuyruğu için ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', why: "QoS yalnızca darboğazın olduğu arayüzde anlamlıdır; kuyruk trafiğin sıkıştığı yerde oluşur, başka bir porta uygulanan policy hiçbir sorunu çözmediği hâlde çözüldü sanılır.", label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'ethernet1/1/1', hint: 'Policy uygulanacak port' },
                        { name: 'direction', why: "QoS genelde <b>çıkış</b> yönünde uygulanır çünkü kuyruklama çıkışta yapılır; giriş yönüne uygulanan shaping beklenen gecikme iyileştirmesini sağlamaz.", label: 'Yön', type: 'select', options: [
                            { value: 'output', label: 'Outbound', selected: true },
                            { value: 'input', label: 'Inbound' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const polName = cgEsc(data.pol_name || ''), dscpMatch = cgEsc(data.dscp_match || '');
            const bandwidth = cgEsc(data.bandwidth || ''), applyIf = cgEsc(data.apply_if || '');
            const direction = cgEsc(data.direction || 'output');
            const cmName = 'CM_' + dscpMatch.toUpperCase();
            let c = '# ========================================\n# Dell OS10 — QoS\n# ========================================\n\n';
            c += 'class-map match-any ' + cmName + '\n';
            c += ' match dscp ' + dscpMatch + '\n!\n\n';
            c += 'policy-map ' + polName + '\n';
            c += ' class ' + cmName + '\n';
            c += '  priority bandwidth percent ' + bandwidth + '\n!\n\n';
            c += 'interface ' + applyIf + '\n';
            c += ' service-policy ' + direction + ' ' + polName + '\n!\n\n';
            c += '# Doğrulama:\n# show policy-map interface ' + applyIf + '\n# show qos interface ' + applyIf + '\n';
            return c;
        });
    }
};

// ── Dell OS10: VXLAN Overlay ──────────────────────────────────────────────────
Dell.vxlan = {
    label: 'VXLAN Overlay',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Dell OS10 — VXLAN Overlay',
                desc: 'VTEP tabanlı VXLAN overlay ağı. VNI-VLAN eşlemesi, multicast grubu ve Loopback VTEP kaynak arayüzü.'
            },
            sections: [
                {
                    title: 'VXLAN Ayarları',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vni', why: "VNI-VLAN eşleşmesi <b>tüm VTEP'lerde aynı</b> olmalıdır; bir cihazda farklı eşleştirilirse trafik yanlış segmente taşınır veya hiç ulaşmaz. VXLAN'da en sık yapılan hata budur.", label: 'VNI (VXLAN Network Identifier)', type: 'text', validate: 'vni', required: true, placeholder: '10000', hint: '1–16777215 arası VXLAN segment ID' },
                        { name: 'vtep_ip', why: "VTEP IP kapsüllenmiş paketlerin kaynak adresidir ve underlay routing ile diğer tüm VTEP'lere ulaşabilmelidir; underlay'de duyurulmayan bir VTEP IP'si tüneli tek yönlü ve kullanılamaz kılar.", label: 'VTEP IP (Loopback)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.1', hint: 'VTEP kaynak Loopback IP adresi' },
                        { name: 'mcast', why: "Multicast grubu <b>flood-and-learn</b> modunda BUM trafiğini taşır ve underlay'de PIM çalışması gerekir; multicast yoksa ARP çözümlenemez ve overlay hiç ayağa kalkmaz. EVPN kullanmak bu bağımlılığı ortadan kaldırır.", label: 'Multicast Group', type: 'text', required: true, placeholder: '239.1.1.1', hint: 'BUM trafik için multicast grup IP' },
                        { name: 'vlan', why: "Yerel VLAN, VNI'ye bağlanan L2 segmentidir; VLAN cihazda tanımlı değilse veya üye portu yoksa eşleme kurulur ama hiçbir trafik tünele girmez.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek yerel VLAN ID' },
                        { name: 'loopback', why: "VXLAN kaynak arayüzü mutlaka loopback olmalıdır; fiziksel port kullanılırsa o port düştüğünde tüm overlay çöker, oysa loopback underlay'deki herhangi bir yoldan erişilebilir kalır.", label: 'Loopback Interface', type: 'text', required: true, placeholder: 'loopback0', hint: 'VTEP kaynak arayüzü' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || ''), vtepIp = cgEsc(data.vtep_ip || '');
            const mcast = cgEsc(data.mcast || ''), vlan = cgEsc(data.vlan || '');
            const loopback = cgEsc(data.loopback || '');
            let c = '# ========================================\n# Dell OS10 — VXLAN Overlay\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Loopback (VTEP source)\ninterface ' + loopback + '\n';
            c += ' ip address ' + vtepIp + '/32\n no shutdown\n!\n\n';
            c += '# VXLAN instance\ninterface vxlan 1\n';
            c += ' vxlan-instance ' + vni + '\n';
            c += '  source-ip ' + vtepIp + '\n';
            c += '  multicast-group ' + mcast + '\n';
            c += '  vlan ' + vlan + '\n';
            c += ' !\n!\n\n';
            c += '# Map VLAN to VNI\nvlan ' + vlan + '\n vxlan-vni ' + vni + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show vxlan\n# show vxlan interface\n# show vxlan vni ' + vni + '\n# show interface vxlan 1\n';
            return c;
        });
    }
};

// ── Dell OS10: MC-LAG ─────────────────────────────────────────────────────────
Dell.mclag = {
    label: 'MC-LAG Domain',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Dell OS10 — MC-LAG Domain',
                desc: 'Multi-Chassis LAG konfigürasyonu. Peer-link, keepalive ve üye interface yapılandırması.'
            },
            sections: [
                {
                    title: 'MC-LAG Domain',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'domain_id', why: "MC-LAG domain ID iki peer'da <b>birebir aynı</b> olmalıdır; farklıysa domain kurulmaz ve her switch bağımsız davranarak karşı taraftaki LAG'ı yarım bırakır.", label: 'Domain ID', type: 'text', required: true, placeholder: '1', hint: 'MC-LAG domain numarası' },
                        { name: 'peer_link', why: "Peer-link mutlaka port-channel olmalıdır ve tüm VLAN'ları taşımalıdır; tek fiziksel link bırakmak kopma anında split-brain yaratır, iki switch de aktif gateway gibi davranır.", label: 'Peer-Link Port-Channel', type: 'text', validate: 'iface', required: true, placeholder: 'port-channel100', hint: 'Peer-link olarak kullanılacak port-channel' },
                        { name: 'peer_ip', why: "Peer IP karşı cihazın keepalive kaynak adresi olmalıdır ve bu adreslerin peer-link'ten <b>bağımsız</b> bir yoldan erişilebilir olması gerekir; aksi hâlde peer-link koptuğunda keepalive da kesilir ve split-brain tespit edilemez.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.2', hint: 'Peer cihazının keepalive IP adresi' },
                        { name: 'local_ip', why: "Keepalive kaynak adresi iki cihazda çapraz eşleşmeli; aynı adres iki tarafta local olarak tanımlanırsa oturum kurulamaz ve MC-LAG sürekli başlatma aşamasında takılır.", label: 'Local IP (keepalive source)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.1', hint: 'Bu cihazın keepalive kaynak IP adresi' }
                    ]
                },
                {
                    title: 'Member ve Peer-Link Interface',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'members', why: "Uplink üyeleri iki peer'da aynı port-channel numarasına ve aynı hıza sahip olmalıdır; uyumsuzlukta karşı taraftaki sunucu yalnızca bir bacaktan trafik alır ve yedeklilik gerçekte yoktur.", label: 'Uplink Member Interfaces', type: 'text', required: true, placeholder: 'ethernet1/1/1,ethernet1/1/2', hint: 'Virgülle ayrılmış üye port listesi' },
                        { name: 'pl_members', why: "Peer-link üyeleri en az iki fiziksel port olmalı ve mümkünse farklı hat kartlarından seçilmelidir; tek kart üzerindeki üyeler kart arızasında peer-link'i tamamen kaybettirir.", label: 'Peer-Link Member Interfaces', type: 'text', required: true, placeholder: 'ethernet1/1/47,ethernet1/1/48', hint: 'Peer-link portları (virgülle ayrılmış)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const domainId = cgEsc(data.domain_id || ''), peerLink = cgEsc(data.peer_link || '');
            const peerIp = cgEsc(data.peer_ip || ''), localIp = cgEsc(data.local_ip || '');
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const plMembers = (data.pl_members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Dell OS10 — MC-LAG Domain\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Peer-Link Port-Channel\ninterface ' + peerLink + '\n channel-member ';
            c += plMembers.join(' ') + '\n no shutdown\n!\n\n';
            c += '# MC-LAG Domain\nmclag domain ' + domainId + '\n';
            c += ' peer-link ' + peerLink + '\n';
            c += ' peer-ip ' + peerIp + '\n';
            c += ' local-ip ' + localIp + '\n';
            c += ' keepalive-interval 1000\n keepalive-timeout 5\n!\n\n';
            if (members.length) {
                c += '# Member Interfaces\n';
                members.forEach(m => {
                    c += 'interface ' + m + '\n channel-group 1 mode active\n no shutdown\n!\n';
                });
                c += '\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show mclag\n# show mclag domain ' + domainId + '\n# show mclag interface\n';
            return c;
        });
    }
};

// ── Dell OS10: BGP EVPN ───────────────────────────────────────────────────────
Dell.bgpEvpn = {
    label: 'BGP EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Dell OS10 — BGP EVPN',
                desc: 'L2VPN EVPN address-family konfigürasyonu. VNI route-target, send-community extended ve VXLAN VNI-VLAN eşlemesi.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "EVPN omurgasında AS planı tutarlı olmalıdır; iBGP mi eBGP mi seçtiğiniz route-reflector ihtiyacını ve next-hop davranışını değiştirir, yanlış planda VTEP'ler birbirinin MAC'lerini hiç öğrenemez.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'rid', why: "Router-ID olarak loopback kullanın ve benzersiz olmasını sağlayın; çakışan ID'lerde EVPN oturumları kurulmaz ve overlay flood-and-learn'e düşerek MAC tablolarını şişirir.", label: 'Router-ID (Loopback IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID — Loopback IP kullanılması önerilir' }
                    ]
                },
                {
                    title: 'Neighbor ve EVPN Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'nbr_ip', why: "EVPN komşusu kontrol düzlemidir; bu peering kurulmazsa VXLAN veri düzlemi çalışsa bile MAC/IP bilgisi dağıtılmaz ve trafik yalnızca flood ile taşınır.", label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP EVPN komşu IP adresi' },
                        { name: 'nbr_as', why: "Komşu AS değeri karşı tarafın local AS'i ile eşleşmelidir; uyuşmazlıkta oturum açılmaz ve EVPN rotaları hiç alınmaz, bu da overlay'in sessizce yarım çalışmasına yol açar.", label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Komşunun AS numarası (iBGP için aynı)' },
                        { name: 'vni', why: "EVPN'de VNI, route target ile birlikte hangi segmentin hangi VTEP'lerde paylaşılacağını belirler; tüm VTEP'lerde aynı VNI-VLAN eşlemesi kurulmazsa trafik yanlış segmente düşer.", label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10000', hint: 'VXLAN Network Identifier' },
                        { name: 'vni_vlan', why: "VNI'ye bağlanan yerel VLAN her cihazda farklı olabilir ama <b>VNI numarası aynı olmak zorundadır</b>; bu ayrımı karıştırmak, birbirine bağlı sanılan iki segmentin aslında hiç konuşmamasına neden olur.", label: 'VNI VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'VNI ile eşlenecek yerel VLAN ID' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
            const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
            const vni = cgEsc(data.vni || ''), vniVlan = cgEsc(data.vni_vlan || '');
            let c = '# ========================================\n# Dell OS10 — BGP EVPN\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' router-id ' + rid + '\n';
            c += ' neighbor ' + nbrIp + '\n  remote-as ' + nbrAs + '\n';
            c += '  address-family l2vpn evpn\n   activate\n   send-community extended\n  !\n !\n';
            c += ' address-family l2vpn evpn\n  advertise-all-vni\n  vni ' + vni + '\n   rd ' + localAs + ':' + vni + '\n';
            c += '   route-target export ' + localAs + ':' + vni + '\n';
            c += '   route-target import ' + localAs + ':' + vni + '\n  !\n !\n!\n\n';
            c += '# VXLAN VNI-VLAN mapping\nvlan ' + vniVlan + '\n vxlan-vni ' + vni + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show bgp l2vpn evpn summary\n# show bgp l2vpn evpn vni-id ' + vni + '\n# show evpn\n';
            return c;
        });
    }
};

// ── Dell OS10: QoS Policy (Extended) ─────────────────────────────────────────
Dell.qosPolicy = {
    label: 'QoS Policy (Extended)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Dell OS10 — QoS Policy (Extended)',
                desc: 'Gelişmiş DSCP tabanlı QoS: class-map eşleştirme, DSCP re-marking ve bandwidth yüzdesi ayarı.'
            },
            sections: [
                {
                    title: 'Policy ve Class-Map Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pol_name', why: "Policy-map adı arayüzde <code>service-policy</code> ile çağrılan adla aynı olmalı; uyuşmazlıkta yapılandırma geçerli görünür ama QoS hiç devreye girmez.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'QOS_POLICY_OUT', hint: 'Policy-map adı' },
                        { name: 'class_name', why: "Class-map adı policy içinde referans alınan adla aynı olmalı; isim uyuşmazsa sınıf hiçbir paketi yakalamaz ve tüm trafik varsayılan sınıfta işlem görür.", label: 'Class Adı', type: 'text', required: true, placeholder: 'CLASS_VOIP', hint: 'Class-map adı' },
                        { name: 'dscp_match', why: "Eşleşme değeri, trafiği üreten uygulamanın gerçekte işaretlediği değer olmalıdır; varsayım üzerine yazılan DSCP eşleşmesi sıfır paket yakalar ve QoS etkisiz kalır.", label: 'DSCP Match Değeri', type: 'text', required: true, placeholder: 'ef', hint: 'Trafiği tanımlamak için DSCP değeri' },
                        { name: 'dscp_set', why: "Yeniden işaretleme yalnızca <b>güvenilir sınırda</b> yapılmalıdır; ağın ortasında rastgele marking yapmak uçtan uca QoS planını bozar ve aşağı akıştaki cihazların önceliklendirmesini yanlışa sürükler.", label: 'DSCP Marking (set)', type: 'select', options: [
                            { value: 'ef', label: 'EF (46) — Voice', selected: true },
                            { value: 'af41', label: 'AF41 (34) — Video' },
                            { value: 'af31', label: 'AF31 (26) — Kritik Veri' },
                            { value: 'cs3', label: 'CS3 (24) — Sinyal' },
                            { value: 'default', label: 'default (0) — Best Effort' }
                        ]},
                        { name: 'bandwidth', why: "Garanti yüzdesi tıkanıklık anındaki minimumdur; sınıfların toplamı %100'ü aşarsa policy uygulanmaz ve tek bir sınıfa aşırı garanti vermek diğer trafiği açlığa iter.", label: 'Bandwidth %', type: 'text', required: true, placeholder: '30', hint: 'Class için ayrılacak bant genişliği yüzdesi' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'apply_if', why: "Policy yalnızca uygulandığı arayüzde çalışır ve genellikle darboğazın bulunduğu uplink'e uygulanmalıdır; yanlış porta uygulanan policy hiçbir sorunu çözmediği hâlde iş bitti sanılır.", label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'ethernet1/1/1', hint: 'Policy uygulanacak port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const polName = cgEsc(data.pol_name || ''), className = cgEsc(data.class_name || '');
            const dscpSet = cgEsc(data.dscp_set || 'ef'), bandwidth = cgEsc(data.bandwidth || '');
            const dscpMatch = cgEsc(data.dscp_match || ''), applyIf = cgEsc(data.apply_if || '');
            let c = '# ========================================\n# Dell OS10 — QoS Policy (Extended)\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# Class-Map\nclass-map match-any ' + className + '\n';
            c += ' match dscp ' + dscpMatch + '\n!\n\n';
            c += '# Policy-Map\npolicy-map ' + polName + '\n';
            c += ' class ' + className + '\n';
            c += '  set dscp ' + dscpSet + '\n';
            c += '  bandwidth percent ' + bandwidth + '\n!\n\n';
            c += '# Apply to Interface\ninterface ' + applyIf + '\n';
            c += ' service-policy output ' + polName + '\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show policy-map interface ' + applyIf + '\n# show qos interface ' + applyIf + '\n# show class-map ' + className + '\n';
            return c;
        });
    }
};

// ── Dell OS10: NTP ────────────────────────────────────────────────────────────
Dell.ntp = {
    label: 'NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'Dell OS10 — NTP',
                desc: 'Ağ zaman senkronizasyonu konfigürasyonu. Birincil ve yedek NTP sunucusu, timezone ve kaynak arayüz.'
            },
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp_server', why: "Saat kayması log korelasyonunu, sertifika doğrulamasını ve kimlik doğrulama protokollerini bozar; yanlış saatli bir cihazda arıza analizi yapmak neredeyse imkânsızdır.", label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'ntp_server2', why: "Tek NTP sunucusu tek hata noktasıdır ve bozulduğunda cihaz yanlış saate <b>fark edilmeden</b> kilitlenir; ikinci bir kaynak çoğunluk kararı sağlayarak bunu önler.", label: 'Yedek NTP Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucu IP adresi' },
                        { name: 'src_iface', why: "Kaynak arayüz sabitlenmezse NTP paketleri rotaya göre değişen adreslerden çıkar; sunucudaki ACL bu adresleri tanımaz, paketler düşer ve senkronizasyon hiç kurulmaz.", label: 'Source Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'ManagementEthernet1/1/1', hint: 'NTP paketleri için kaynak arayüz' }
                    ]
                },
                {
                    title: 'Saat Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', why: "Cihazlar arasında farklı timezone kullanmak log'ların merkezî sistemde yanlış sırada görünmesine yol açar; olay zincirini takip edemediğiniz için kök neden analizi yanlış sonuca varır.", label: 'Timezone', type: 'text', required: true, placeholder: 'Europe/Istanbul', hint: 'POSIX timezone tanımlayıcısı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ntpServer = cgEsc(data.ntp_server || ''), srcIface = cgEsc(data.src_iface || '');
            const timezone = cgEsc(data.timezone || ''), ntpServer2 = cgEsc(data.ntp_server2 || '');
            let c = '# ========================================\n# Dell OS10 — NTP\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ntp server ' + ntpServer;
            if (srcIface) c += ' source ' + srcIface;
            c += '\n';
            if (ntpServer2) {
                c += 'ntp server ' + ntpServer2;
                if (srcIface) c += ' source ' + srcIface;
                c += '\n';
            }
            c += '\nclock timezone ' + timezone + '\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ntp status\n# show ntp associations\n# show clock\n';
            return c;
        });
    }
};

// ── Dell OS10: Syslog ─────────────────────────────────────────────────────────
Dell.syslog = {
    label: 'Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Dell OS10 — Syslog',
                desc: 'Merkezi log sunucusuna syslog iletimi ve gönderilecek en düşük seviye (OS10: logging server IP severity log-*).'
            },
            sections: [
                {
                    title: 'Syslog Sunucu Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'syslog_server', why: "Cihaz yeniden başlatıldığında yerel log'lar kaybolur; uzak syslog tanımlanmazsa arıza sonrası incelenecek hiçbir kanıt kalmaz ve aynı sorun tekrar eder.", label: 'Syslog Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Syslog toplayıcı sunucu IP adresi' },
                        { name: 'severity', why: "Seviye çok ayrıntılı seçilirse sunucu gereksiz log ile dolar ve kritik olaylar gürültüde kaybolur; çok dar seçilirse arıza öncesi uyarılar hiç kaydedilmez.", label: 'Severity', type: 'select', options: [
                            { value: 'emergencies', label: 'emergencies (0)' },
                            { value: 'alerts', label: 'alerts (1)' },
                            { value: 'critical', label: 'critical (2)' },
                            { value: 'errors', label: 'errors (3)' },
                            { value: 'warnings', label: 'warnings (4)', selected: true },
                            { value: 'notifications', label: 'notifications (5)' },
                            { value: 'informational', label: 'informational (6)' },
                            { value: 'debugging', label: 'debugging (7)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const syslogServer = cgEsc(data.syslog_server || ''), severity = cgEsc(data.severity || 'warnings');
                        let c = '# ========================================\n# Dell OS10 — Syslog\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            // Canli config bicimi (4 cihaz): 'logging server <IP> severity <log-*>'. 'logging level/facility/on'
            // OS10'da dogrulanmadigi icin kaldirildi.
            const sevMap = { emergencies: 'log-emerg', alerts: 'log-alert', critical: 'log-crit', errors: 'log-err', warnings: 'log-warning', notifications: 'log-notice', informational: 'log-info', debugging: 'log-debug' };
            c += 'logging server ' + syslogServer + ' severity ' + (sevMap[severity] || 'log-info') + '\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show logging\n# show running-configuration logging\n';
            return c;
        });
    }
};

// ── Dell OS10: SNMPv3 ─────────────────────────────────────────────────────────
Dell.snmpv3 = {
    label: 'SNMPv3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'Dell OS10 — SNMPv3',
                desc: 'SNMPv3 güvenli izleme konfigürasyonu. Auth/Priv protokol seçimi, kullanıcı grubu ve opsiyonel v2c uyumluluk.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'snmp_user', why: "SNMPv3 kullanıcı adı NMS tarafındaki tanımla aynı olmalı; uyuşmazlıkta sorgular yanıtsız kalır ve izleme sisteminde cihaz down görünür, oysa cihaz sağlıklı çalışmaktadır.", label: 'SNMPv3 Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmpv3user', hint: 'SNMPv3 kimlik doğrulama kullanıcısı' },
                        { name: 'snmp_group', why: "Grup, kullanıcının hangi MIB görünümüne ve hangi güvenlik seviyesine sahip olacağını belirler; yanlış gruba atanan kullanıcı ya hiçbir veri alamaz ya da <b>yazma yetkisiyle</b> cihazı değiştirebilir.", label: 'SNMP Group Adı', type: 'text', required: true, placeholder: 'MONITOR_GROUP', hint: 'Kullanıcının dahil olacağı SNMP grubu' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama ve Şifreleme',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'auth_proto', why: "MD5 zayıf kabul edilir, SHA tercih edin; ayrıca protokol NMS tarafındakiyle aynı olmalı, değilse genel bir kimlik doğrulama hatası dışında hiçbir ipucu alamazsınız.", label: 'Auth Protokol', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', why: "Auth parolası en az 8 karakter olmalı ve NMS ile eşleşmelidir; zayıf parola SNMPv3'ün sağladığı bütünlük güvencesini anlamsızlaştırır.", label: 'Auth Parolası', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'Auth şifresi (min 8 karakter)' },
                        { name: 'priv_proto', why: "Priv protokolü SNMP verisini şifreler; DES yerine AES seçin. Şifreleme kullanılmazsa cihazın tüm envanter ve trafik bilgisi ağ üzerinde okunabilir şekilde taşınır.", label: 'Priv Protokol', type: 'select', options: [
                            { value: 'aes128', label: 'AES-128', selected: true },
                            { value: 'des', label: 'DES' }
                        ]},
                        { name: 'priv_pass', why: "Şifreleme parolası tanımlanmazsa SNMPv3 sessizce authNoPriv seviyesine düşer ve <b>veri şifrelenmez</b>; bunu yalnızca trafiği dinleyen biri fark eder.", label: 'Priv Parolası', type: 'text', required: true, placeholder: 'PrivPass456!', hint: 'Privacy şifresi (min 8 karakter)' }
                    ]
                },
                {
                    title: 'v2c Uyumluluk (Opsiyonel)',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'community', why: "SNMPv2c community açık metin taşınır ve şifre gibidir; <code>public</code> bırakmak cihazın topoloji ve trafik bilgisini ağdaki herkese açar. Mümkünse v2c yerine v3 kullanın.", label: 'SNMP Community Adı', type: 'text', optional: true, placeholder: 'public_ro', hint: 'v2c read-only community (eski sistemler için)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const snmpUser = cgEsc(data.snmp_user || ''), authProto = cgEsc(data.auth_proto || 'sha');
            const authPass = cgEsc(data.auth_pass || ''), privProto = cgEsc(data.priv_proto || 'aes128');
            const privPass = cgEsc(data.priv_pass || ''), snmpGroup = cgEsc(data.snmp_group || '');
            const community = cgEsc(data.community || '');
            let c = '# ========================================\n# Dell OS10 — SNMPv3\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += '# SNMP Group\nsnmp-server group ' + snmpGroup + ' v3 priv\n\n';
            c += '# SNMPv3 User\nsnmp-server user ' + snmpUser + ' ' + snmpGroup + ' v3 auth ' + authProto + ' ' + authPass + ' priv ' + privProto + ' ' + privPass + '\n\n';
            if (community) {
                c += '# SNMP v2c (uyumluluk)\nsnmp-server community ' + community + ' ro\n\n';
            }
            c += 'snmp-server enable traps\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show snmp\n# show snmp user\n# show snmp group\n';
            return c;
        });
    }
};

// ── Dell OS10: Storm Control ──────────────────────────────────────────────────
Dell.stormControl = {
    label: 'Storm Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'Dell OS10 — Storm Control',
                desc: 'Broadcast/multicast/unknown-unicast fırtına koruması. Yüzde eşiği ve otomatik aksiyon tanımı.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Interface ve Eşikler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "Storm control uç cihaz portlarında anlamlıdır; uplink veya port-channel üzerinde agresif eşik uygulamak, normal yedekleme trafiğini bile fırtına sanıp <b>bağlantıyı kesebilir</b>.", label: 'Interface (veya range, virgülle)', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1/1', hint: 'Storm control uygulanacak port(lar)' },
                        { name: 'bc_pct', why: "Broadcast eşiği çok yüksekse döngü anında switch'i korumaz, çok düşükse ARP ve DHCP gibi normal broadcast trafiğini keser ve istemciler sebepsiz şekilde adres alamaz.", label: 'Broadcast Threshold (%)', type: 'text', required: true, placeholder: '20', hint: 'Broadcast trafik yüzde eşiği (0-100)' },
                        { name: 'mc_pct', why: "Multicast eşiğini düşük tutmak IPTV, IP kamera veya küme (cluster) heartbeat trafiğini istemeden kırpabilir; bu servisler kesildiğinde sorun genelde storm control'de aranmaz.", label: 'Multicast Threshold (%)', type: 'text', required: true, placeholder: '20', hint: 'Multicast trafik yüzde eşiği (0-100)' },
                        { name: 'uc_pct', why: "Unknown unicast flood'u sınırlamak MAC tablosu taşmasında switch'i korur; ancak eşik çok düşükse sessiz kalan sunuculara giden ilk paketler düşer ve bağlantılar rastgele yavaş açılır.", label: 'Unknown Unicast Threshold (%)', type: 'text', optional: true, placeholder: '10', hint: 'Bilinmeyen unicast trafik eşiği (opsiyonel)' }
                    ]
                },
                {
                    title: 'Aksiyon',
                    icon: 'fas fa-exclamation-triangle',
                    fields: [
                        { name: 'action', why: "<code>shutdown</code> portu err-disable eder ve <b>elle veya recovery timer olmadan geri gelmez</b>; uzak sahadaki bir portta bu seçim tek bir anlık fırtına yüzünden kalıcı kesinti demektir.", label: 'Action', type: 'select', options: [
                            { value: 'shutdown', label: 'shutdown — portu kapat', selected: true },
                            { value: 'drop', label: 'drop — sadece aşan trafiği düşür' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ifaces = (data.iface || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const bcPct = cgEsc(data.bc_pct || ''), mcPct = cgEsc(data.mc_pct || '');
            const ucPct = cgEsc(data.uc_pct || ''), action = cgEsc(data.action || 'shutdown');
            let c = '# ========================================\n# Dell OS10 — Storm Control\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            ifaces.forEach(iface => {
                c += 'interface ' + iface + '\n';
                c += ' storm-control broadcast ' + bcPct + '\n';
                c += ' storm-control multicast ' + mcPct + '\n';
                if (ucPct) c += ' storm-control unknown-unicast ' + ucPct + '\n';
                c += ' storm-control action ' + action + '\n!\n';
            });
            c += '\nend\n\n';
            c += '# Doğrulama:\n';
            ifaces.forEach(iface => {
                c += '# show storm-control interface ' + iface + '\n';
            });
            return c;
        });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// Dell OS10 — ek araçlar (AAA, STP, VRF, statik rota, LLDP, mirroring, VRRP,
// arayüz, breakout, iSCSI, sıkılaştırma)
// ══════════════════════════════════════════════════════════════════════════════

// 'ethernet1/1/1, ethernet1/1/3-1/1/4' → ['ethernet1/1/1','ethernet1/1/3','ethernet1/1/4']
// Aralık sözdizimi ('interface range') yerine her arayüz ayrı blok olarak yazılır;
// böylece OS10 sürümleri arasındaki range yazım farkına bağımlı kalınmaz.
function _otherDellIfList(s) {
    const out = [];
    String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean).forEach(p => {
        const m = p.match(/^([A-Za-z-]+)(\d+)\/(\d+)\/(\d+)-(?:(\d+)\/(\d+)\/)?(\d+)$/);
        if (m && (!m[5] || (m[5] === m[2] && m[6] === m[3])) && +m[7] >= +m[4] && +m[7] - +m[4] < 128) {
            for (let i = +m[4]; i <= +m[7]; i++) out.push(m[1] + m[2] + '/' + m[3] + '/' + i);
        } else {
            out.push(p);
        }
    });
    return out.map(x => cgEsc(x));
}

// OS10 VLAN listesi: '10 20 30-40' → '10,20,30-40'
function _otherDellVlanList(s) {
    return String(s || '').trim().split(/[,\s]+/).filter(Boolean).join(',');
}

// Boşluk içeren açıklamalar tırnaklanır (dellemc.os10 os10_interface şablonu gibi)
function _otherDellDesc(s) {
    const t = String(s || '').replace(/"/g, '').trim();
    if (!t) return '';
    return /\s/.test(t) ? '"' + cgEsc(t) + '"' : cgEsc(t);
}

// ── Dell OS10: AAA / Kullanıcı / Parola Politikası ───────────────────────────
// Sözdizimi: canlı config (username/role/priv-lvl 5 cihaz; aaa authentication
//   login default/console local 5 cihaz; password-attributes lockout-period /
//   max-retry 3 cihaz; ip access-list + line vty / ip access-class 3 cihaz)
// Sözdizimi: password-attributes min-length / character-restriction —
//   https://www.dell.com/support/manuals/en-us/smartfabric-os10-emp-partner/os10-scg-10-5-6-x/user-and-credential-management
// Sözdizimi: tacacs-server/radius-server host … key 0, aaa authentication login default group … local —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_aaa
Dell.aaa = {
    label: 'AAA / Kullanıcı',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Dell OS10 — AAA, Yerel Kullanıcı ve Parola Politikası',
                desc: 'Yerel yönetici hesabı, parola kuralları (uzunluk, kilitleme), TACACS+/RADIUS ile giriş ve VTY erişim listesi.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Yerel Kullanıcı',
                    icon: 'fas fa-user',
                    info: 'AAA sunucusu erişilemez olduğunda cihaza bu yerel hesapla girilir; sunucu tabanlı girişte bile en az bir yerel yönetici hesabı bırakın.',
                    fields: [
                        { name: 'username', why: "OS10'da <code>admin</code> fabrika hesabıdır ve saldırganların ilk denediği addır; kişiye özel bir yönetici hesabı açıp admin'in parolasını değiştirmek denetim izini de anlamlı kılar.", label: 'Kullanıcı Adı', type: 'text', validate: 'objname', required: true, placeholder: 'netadmin01', hint: 'Harfle başlar; boşluk içermez' },
                        { name: 'password', why: "Parola aşağıdaki <code>password-attributes</code> kurallarına uymazsa OS10 komutu reddeder ve hesap hiç oluşmaz. Config dosyasında hash'lenmiş görünür ama yapıştırılan metin düz yazıdır — ekran paylaşırken dikkat.", label: 'Parola', type: 'text', required: true, placeholder: 'Str0ng!Passw0rd', hint: 'Düz metin; cihaz kaydederken hash\'ler' },
                        { name: 'role', why: "<code>sysadmin</code> tüm yetkilere sahiptir (Linux kabuğu dahil). Yalnız ağ ayarı yapacak personele <code>netadmin</code>, yalnız izleme yapacaklara <code>netoperator</code> vermek yanlışlıkla sistem ayarı değiştirilmesini önler.", label: 'Rol', type: 'select', options: [
                            { value: 'sysadmin', label: 'sysadmin — tam yetki' },
                            { value: 'netadmin', label: 'netadmin — ağ yapılandırma', selected: true },
                            { value: 'secadmin', label: 'secadmin — güvenlik/AAA' },
                            { value: 'netoperator', label: 'netoperator — salt okunur' }
                        ]},
                        { name: 'priv_lvl', why: "Privilege level, rol içinde hangi komut setinin açık olacağını belirler. Boş bırakılırsa rolün varsayılan seviyesi kullanılır; 15 vermek rolün tüm komutlarını açar.", label: 'Privilege Level (priv-lvl)', type: 'text', min: 0, max: 15, placeholder: '15', hint: '0-15; boş = rol varsayılanı' }
                    ]
                },
                {
                    title: 'Parola Politikası',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'min_len', why: "OS10 varsayılanı 9 karakterdir. Kısa parolalar kaba kuvvet saldırısına dayanmaz; ancak politikayı sıkılaştırdıktan sonra mevcut kısa parolalı hesaplar bir sonraki değişiklikte reddedilir.", label: 'Minimum Parola Uzunluğu', type: 'text', min: 6, max: 32, placeholder: '12', hint: '6-32 (password-attributes min-length)' },
                        { name: 'complex', why: "Büyük/küçük harf, rakam ve özel karakterin her birinden en az bir tane istemek sözlük saldırılarını büyük ölçüde etkisizleştirir.", label: 'Karmaşıklık zorunlu (büyük, küçük, rakam, özel karakter)', type: 'checkbox', checked: true },
                        { name: 'lockout', why: "Belirtilen sayıda hatalı denemeden sonra hesap bu süre (dakika) boyunca kilitlenir; kaba kuvvet denemelerini yavaşlatır. Çok uzun tutmak, parolayı yanlış giren yöneticinin arıza anında dışarıda kalmasına yol açar.", label: 'Kilitleme Süresi (dakika)', type: 'text', validate: 'posint', placeholder: '30', hint: 'password-attributes lockout-period' },
                        { name: 'max_retry', why: "Kilitlemeden önce izin verilen hatalı deneme sayısı. Kilitleme süresi tanımlı değilse tek başına etkisizdir.", label: 'Maksimum Hatalı Deneme', type: 'text', validate: 'posint', placeholder: '5', hint: 'password-attributes max-retry' }
                    ]
                },
                {
                    title: 'Kimlik Doğrulama Yöntemi',
                    icon: 'fas fa-server',
                    warn: 'Konsol girişi her durumda <b>local</b> bırakılır; AAA sunucusu çöktüğünde cihaza konsoldan girebilmek için.',
                    fields: [
                        { name: 'auth_method', why: "Merkezi AAA ile kim ne zaman girdi kaydı tek yerde tutulur. Listenin sonundaki <code>local</code> yedektir: sunucu erişilemezse yerel hesaplar devreye girer; olmazsa sunucu kesintisi cihazı kilitler.", label: 'VTY/SSH Giriş Yöntemi', type: 'select', options: [
                            { value: 'local', label: 'Yalnız yerel hesaplar', selected: true },
                            { value: 'tacacs', label: 'TACACS+ → yerel yedek' },
                            { value: 'radius', label: 'RADIUS → yerel yedek' }
                        ]},
                        { name: 'aaa_server', why: "Sunucu cihazın yönetim ağından erişilebilir olmalı; erişilemezse her girişte zaman aşımı beklenir ve ardından yerel hesaba düşülür.", label: 'AAA Sunucu IP', type: 'text', validate: 'ip', requiredIf: { field: 'auth_method', in: ['tacacs', 'radius'] }, placeholder: '10.0.0.5', hint: 'TACACS+ veya RADIUS sunucusu' },
                        { name: 'aaa_key', why: "Paylaşılan anahtar sunucudaki istemci tanımıyla birebir aynı olmalı; farklıysa sunucu isteği reddeder ve log'da yalnızca genel bir kimlik doğrulama hatası görünür.", label: 'Paylaşılan Anahtar', type: 'text', requiredIf: { field: 'auth_method', in: ['tacacs', 'radius'] }, placeholder: 'S3cretKey', hint: 'key 0 (düz metin) olarak yazılır' }
                    ]
                },
                {
                    title: 'VTY Erişim Listesi',
                    icon: 'fas fa-filter',
                    warn: 'Uzaktan bağlıysanız kendi yönetim alt ağınızın listede olduğundan emin olun; aksi halde <b>oturumunuz kapanır ve yeniden giremezsiniz</b>.',
                    fields: [
                        { name: 'vty_acl', why: "SSH'a yalnız yönetim ağından izin vermek, parola saldırılarının cihaza ulaşmasını en baştan keser.", label: 'VTY erişimini IP ile sınırla', type: 'checkbox', checked: false },
                        { name: 'acl_name', why: "ACL adı <code>line vty</code> altındaki <code>ip access-class</code> ile eşleşmeli; ad yanlış yazılırsa kısıt uygulanmaz ve bu hata sessiz kalır.", label: 'ACL Adı', type: 'text', validate: 'objname', requiredIf: { field: 'vty_acl', checked: true }, placeholder: 'VTY-MGMT', hint: 'ip access-list adı' },
                        { name: 'mgmt_net', why: "Yalnız bu alt ağdan gelen SSH oturumları kabul edilir; diğer her şey loglanarak reddedilir.", label: 'İzinli Yönetim Ağı', type: 'text', validate: 'cidr', requiredIf: { field: 'vty_acl', checked: true }, placeholder: '10.0.0.0/24', hint: 'CIDR biçiminde' },
                        { name: 'mgmt_net2', why: "Yedek yönetim ağı veya atlama sunucusu. Tek ağa bağımlı kalmak, o ağ kesildiğinde cihaza erişimi imkânsız kılar.", label: 'İkinci İzinli Ağ', type: 'text', validate: 'cidr', placeholder: '192.0.2.0/28', hint: 'Opsiyonel' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const user = cgEsc(data.username || ''), pass = cgEsc(data.password || '');
            const role = cgEsc(data.role || ''), priv = cgEsc(data.priv_lvl || '');
            const minLen = cgEsc(data.min_len || ''), lockout = cgEsc(data.lockout || ''), maxRetry = cgEsc(data.max_retry || '');
            const method = data.auth_method || 'local';
            const srv = cgEsc(data.aaa_server || ''), key = cgEsc(data.aaa_key || '');
            const aclName = cgEsc(data.acl_name || ''), net1 = cgEsc(data.mgmt_net || ''), net2 = cgEsc(data.mgmt_net2 || '');
            let c = '# ========================================\n# Dell OS10 — AAA / Kullanıcı / Parola Politikası\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            const cr = data.complex ? 'character-restriction upper 1 lower 1 numeric 1 special-char 1' : '';
            if (minLen || cr) {
                c += '# Parola politikası (kullanıcı parolası bu kurallara uymalı)\n';
                c += 'password-attributes' + (minLen ? ' min-length ' + minLen : '') + (cr ? ' ' + cr : '') + '\n';
            }
            if (lockout) c += 'password-attributes lockout-period ' + lockout + '\n';
            if (maxRetry) c += 'password-attributes max-retry ' + maxRetry + '\n';
            if (minLen || cr || lockout || maxRetry) c += '\n';
            c += '# Yerel kullanıcı\n';
            c += 'username ' + user + ' password ' + pass + ' role ' + role + (priv ? ' priv-lvl ' + priv : '') + '\n\n';
            if (method === 'tacacs' && srv) {
                c += '# TACACS+ sunucusu\ntacacs-server host ' + srv + (key ? ' key 0 ' + key : '') + '\n\n';
            } else if (method === 'radius' && srv) {
                c += '# RADIUS sunucusu\nradius-server host ' + srv + (key ? ' key 0 ' + key : '') + '\n\n';
            }
            c += '# Giriş yöntemi sırası (konsol her zaman yerel)\n';
            if (method === 'tacacs' && srv) c += 'aaa authentication login default group tacacs+ local\n';
            else if (method === 'radius' && srv) c += 'aaa authentication login default group radius local\n';
            else c += 'aaa authentication login default local\n';
            c += 'aaa authentication login console local\n\n';
            if (data.vty_acl && aclName && net1) {
                c += '# VTY erişim listesi\nip access-list ' + aclName + '\n';
                c += ' seq 10 permit ip ' + net1 + ' any\n';
                if (net2) c += ' seq 20 permit ip ' + net2 + ' any\n';
                c += ' seq 100 deny ip any any log\n!\n';
                c += 'line vty\n ip access-class ' + aclName + '\n!\n\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show running-configuration users\n# show running-configuration | grep aaa\n';
            if (data.vty_acl && aclName) c += '# show running-configuration | grep access-class\n';
            return c;
        });
    }
};

// ── Dell OS10: Spanning Tree ─────────────────────────────────────────────────
// Sözdizimi: canlı config (spanning-tree vlan X priority N 4 cihaz;
//   spanning-tree mst configuration / name / instance N vlan X 2 cihaz;
//   arayüzde spanning-tree port type edge 32 satır)
// Sözdizimi: spanning-tree mode rstp|rapid-pvst|mst, spanning-tree rstp priority,
//   spanning-tree mst N priority, revision, spanning-tree bpduguard enable, spanning-tree guard root —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_xstp
//   https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/stp/dellos10.j2
Dell.stp = {
    label: 'Spanning Tree',
    init(container) {
        const prio = [0, 4096, 8192, 12288, 16384, 20480, 24576, 28672, 32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440]
            .map(p => ({ value: String(p), label: String(p) + (p === 4096 ? ' — kök (root) adayı' : p === 8192 ? ' — yedek kök' : p === 32768 ? ' — varsayılan' : ''), selected: p === 32768 }));
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Dell OS10 — Spanning Tree (RSTP / Rapid-PVST+ / MST)',
                desc: 'STP modu, köprü önceliği, MST bölgesi, edge port ve BPDU Guard / Root Guard. OS10 varsayılan modu Rapid-PVST+\'tır.'
            },
            configTypes: [
                { id: 'rpvst', label: 'Rapid-PVST+', icon: 'fas fa-layer-group', desc: 'VLAN başına ayrı ağaç (OS10 varsayılanı)', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'rstp', label: 'RSTP', icon: 'fas fa-bolt', desc: 'Tüm VLAN\'lar için tek ağaç' },
                { id: 'mst', label: 'MST', icon: 'fas fa-sitemap', desc: 'VLAN gruplarını instance\'lara eşler' }
            ],
            sections: [
                {
                    title: 'Köprü Önceliği',
                    icon: 'fas fa-crown',
                    showFor: ['rpvst', 'rstp'],
                    fields: [
                        { name: 'priority', why: "En düşük öncelikli switch kök (root) olur. Hiçbiri ayarlanmazsa kökü en düşük MAC adresli — çoğu zaman en eski ve en yavaş — switch kazanır ve trafik gereksiz yollardan akar.", label: 'Bridge Priority', type: 'select', options: prio },
                        { name: 'pvst_vlans', why: "Rapid-PVST+'ta öncelik VLAN başına verilir. Listeye girmeyen VLAN'larda bu switch varsayılan önceliğiyle kalır ve kök başka yerde seçilebilir.", label: 'VLAN Listesi', type: 'text', validate: 'vlan_list', requiredIf: { field: '_cgtype', in: ['rpvst'] }, placeholder: '1-4093', hint: 'Rapid-PVST+ için: öncelik uygulanacak VLAN\'lar' }
                    ]
                },
                {
                    title: 'MST Bölgesi',
                    icon: 'fas fa-sitemap',
                    showFor: ['mst'],
                    warn: 'Bölge adı, revizyon ve VLAN→instance eşlemesi bölgedeki <b>tüm switch\'lerde birebir aynı</b> olmalıdır; tek fark switch\'i ayrı bölge yapar ve beklenmedik port blokajı oluşur.',
                    fields: [
                        { name: 'mst_name', why: "Bölge adı uyuşmazsa komşu switch farklı bölgede sayılır; MST o sınırda tek bir CST gibi davranır ve yük paylaşımı bozulur.", label: 'Bölge Adı', type: 'text', validate: 'objname', requiredIf: { field: '_cgtype', in: ['mst'] }, placeholder: 'REGION1', hint: 'name' },
                        { name: 'mst_rev', why: "Revizyon numarası da bölge kimliğinin parçasıdır; eşlemeyi değiştirdiğinizde tüm switch'lerde birlikte artırın.", label: 'Revizyon', type: 'text', min: 0, max: 65535, placeholder: '1', hint: 'revision (opsiyonel)' },
                        { name: 'mst_inst', why: "Instance 0 (CIST) her zaman vardır; burada tanımlanan instance VLAN'ları CIST'ten ayırır.", label: 'Instance No', type: 'text', min: 1, max: 63, requiredIf: { field: '_cgtype', in: ['mst'] }, placeholder: '1', hint: 'instance N' },
                        { name: 'mst_vlans', why: "Eşlenmeyen VLAN'lar instance 0'da kalır. Aynı VLAN iki instance'a verilemez.", label: 'Instance VLAN\'ları', type: 'text', validate: 'vlan_list', requiredIf: { field: '_cgtype', in: ['mst'] }, placeholder: '10,20,30-40', hint: 'instance N vlan …' },
                        { name: 'mst_prio', why: "Instance bazında öncelik; farklı instance'larda farklı switch'i kök yaparak iki uplink'i birlikte kullanabilirsiniz.", label: 'Instance Önceliği', type: 'select', options: prio }
                    ]
                },
                {
                    title: 'Port Korumaları',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'edge_ports', why: "Edge port, dinleme/öğrenme beklemeden anında forwarding'e geçer; sunucu ve PC portlarında DHCP zaman aşımlarını önler. Başka bir switch'e bağlı porta verilirse <b>döngü</b> riski doğar.", label: 'Edge (uç cihaz) Portları', type: 'text', validate: 'iface_range', placeholder: 'ethernet1/1/1-1/1/4', hint: 'Virgülle ayrılmış; aralık aynı modülde açılır' },
                        { name: 'bpduguard', why: "Edge porta BPDU gelirse (biri araya switch taktıysa) port err-disable olur. Korumasız edge port, yanlış kablolamada tüm L2 alanını döngüye sokabilir.", label: 'Edge portlarda BPDU Guard', type: 'checkbox', checked: true },
                        { name: 'root_guard_ports', why: "Root Guard, aşağı yönlü (erişim switch'lerine giden) portlarda daha iyi öncelikli BPDU gelse bile kök rolünün el değiştirmesini engeller; yeni takılan bir switch'in topolojiyi ele geçirmesini önler.", label: 'Root Guard Portları', type: 'text', validate: 'iface_range', placeholder: 'ethernet1/1/48', hint: 'Opsiyonel — aşağı yönlü downlink\'ler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'rpvst';
            const pr = cgEsc(data.priority || ''), vlans = cgEsc(_otherDellVlanList(data.pvst_vlans));
            const mName = cgEsc(data.mst_name || ''), mRev = cgEsc(data.mst_rev || ''), mInst = cgEsc(data.mst_inst || '');
            const mVlans = cgEsc(_otherDellVlanList(data.mst_vlans)), mPrio = cgEsc(data.mst_prio || '');
            const edges = _otherDellIfList(data.edge_ports), roots = _otherDellIfList(data.root_guard_ports);
            let c = '# ========================================\n# Dell OS10 — Spanning Tree\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            if (t === 'rstp') {
                c += 'spanning-tree mode rstp\n';
                if (pr) c += 'spanning-tree rstp priority ' + pr + '\n';
            } else if (t === 'mst') {
                c += 'spanning-tree mode mst\n';
                c += 'spanning-tree mst configuration\n';
                if (mName) c += ' name ' + mName + '\n';
                if (mRev) c += ' revision ' + mRev + '\n';
                if (mInst && mVlans) c += ' instance ' + mInst + ' vlan ' + mVlans + '\n';
                c += '!\n';
                if (mInst && mPrio) c += 'spanning-tree mst ' + mInst + ' priority ' + mPrio + '\n';
            } else {
                c += 'spanning-tree mode rapid-pvst\n';
                if (pr && vlans) c += 'spanning-tree vlan ' + vlans + ' priority ' + pr + '\n';
            }
            c += '\n';
            edges.forEach(i => {
                c += 'interface ' + i + '\n spanning-tree port type edge\n';
                if (data.bpduguard) c += ' spanning-tree bpduguard enable\n';
                c += '!\n';
            });
            roots.forEach(i => { c += 'interface ' + i + '\n spanning-tree guard root\n!\n'; });
            c += '\nend\n\n';
            c += '# Doğrulama:\n# show spanning-tree brief\n';
            c += '# show running-configuration | grep spanning-tree\n';
            // STP lab bulguları (dell-12): varsayılan öncelik, rapid-pvst'de VLAN'sız öncelik, edge korumasız
            const w = [], p = +(t === 'mst' ? (data.mst_prio || 32768) : (data.priority || 32768));
            if (t === 'rpvst' && pr && !vlans) w.push('\u26A0 Rapid-PVST+\'ta öncelik VLAN başına verilir: VLAN listesi boş olduğu için öncelik satırı yazılmadı.');
            if (p >= 32768) w.push('\u2139 Öncelik varsayılan (32768) ya da daha yüksek: kök seçimi MAC adresine kalır, genelde en eski switch kök olur. Kök olacak switch\'te 0/4096 verin.');
            else w.push('\u2139 Komşu da aynı önceliği kullanıyorsa eşitlikte küçük MAC kazanır; kök olunduğunu "show spanning-tree" ile doğrulayın.');
            if (edges.length && !data.bpduguard) w.push('\u26A0 Edge portlar BPDU Guard\'sız: kullanıcı portuna takılan switch döngü yaratabilir ya da kökü ele geçirebilir.');
            if (edges.length && data.bpduguard) w.push('\u2139 BPDU gelen edge port kapanır; takılan cihaz sökülüp port shutdown / no shutdown ile açılır. BPDU Guard\'ı kaldırarak "çözmeyin". Uplink/trunk portlarını edge yapmayın.');
            if (edges.some(e => roots.includes(e))) w.push('\u26A0 Aynı port hem edge hem root guard listesinde: root guard aşağı yönlü switch portları içindir, uç cihaz portu değil.');
            return { config: c, warnings: w };
        });
    }
};

// ── Dell OS10: VRF ────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (ip vrf default — 6 cihaz)
// Sözdizimi: arayüzde ip vrf forwarding NAME —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_vrf
//   https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/initial/dellos10.j2
Dell.vrf = {
    label: 'VRF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Dell OS10 — VRF (ip vrf)',
                desc: 'Yeni bir VRF oluşturur ve L3 arayüzü bu VRF\'e bağlar. Rota tabloları birbirinden tamamen ayrılır.'
            },
            sections: [
                {
                    title: 'VRF ve Arayüz',
                    icon: 'fas fa-network-wired',
                    warn: '<code>ip vrf forwarding</code> komutu arayüzdeki mevcut IP adresini <b>siler</b>; adres bu yüzden VRF atamasından sonra yeniden yazılır. Yönetimi bu arayüzden yapıyorsanız bağlantı kopar.',
                    fields: [
                        { name: 'vrf_name', why: "VRF adı arayüz, statik rota ve yönlendirme protokolü tanımlarında aynı yazılmalı; tek harf farkı yeni ve boş bir VRF'e işaret eder.", label: 'VRF Adı', type: 'text', validate: 'objname', required: true, placeholder: 'TENANT_A', hint: 'Harfle başlar; boşluk yok' },
                        { name: 'iface', why: "VRF'e bağlanan arayüzün tüm trafiği artık global tabloyu değil bu VRF'in tablosunu kullanır; bu VRF'te rota yoksa arayüz up olsa bile trafik gitmez.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'vlan100', hint: 'vlanN, ethernet1/1/x, port-channelN, loopbackN' },
                        { name: 'ip', why: "Adres VRF atamasından sonra verilir. Aynı adres farklı VRF'lerde tekrar kullanılabilir — VRF'lerin amacı da budur.", label: 'IP Adresi', type: 'text', validate: 'cidr', placeholder: '10.128.100.1/24', hint: 'Opsiyonel — CIDR' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vrf = cgEsc(data.vrf_name || ''), iface = cgEsc(data.iface || ''), ip = cgEsc(data.ip || '');
            let c = '# ========================================\n# Dell OS10 — VRF\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ip vrf ' + vrf + '\n!\n\n';
            c += 'interface ' + iface + '\n';
            if (/^(ethernet|port-channel)/i.test(iface)) c += ' no switchport\n';
            c += ' ip vrf forwarding ' + vrf + '\n';
            if (ip) c += ' ip address ' + ip + '\n';
            c += ' no shutdown\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ip vrf\n# show ip route vrf ' + vrf + '\n';
            return c;
        });
    }
};

// ── Dell OS10: Statik Rota ────────────────────────────────────────────────────
// Sözdizimi: canlı config (ip route A.B.C.D/N A.B.C.D — 6 cihaz)
// Sözdizimi: ip route vrf NAME prefix nexthop —
//   https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/routing/dellos10.j2
Dell.staticRoute = {
    label: 'Statik Rota',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-directions',
                title: 'Dell OS10 — Statik Rota',
                desc: 'Global tabloya veya bir VRF\'e statik rota ekler. OS10 hedefi <b>önek/uzunluk</b> biçiminde bekler (10.0.0.0/8).'
            },
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'prefix', why: "OS10 hedef ağı CIDR biçiminde ister; 0.0.0.0/0 varsayılan rotadır. Host biti dolu bir önek (10.0.0.5/24) girilirse rota beklenenden farklı bir ağa kurulabilir.", label: 'Hedef Ağ', type: 'text', validate: 'cidr', required: true, placeholder: '10.64.0.0/16', hint: 'CIDR biçiminde; varsayılan rota için 0.0.0.0/0' },
                        { name: 'nexthop', why: "Next-hop doğrudan bağlı bir alt ağda olmalı; değilse rota tabloya girmez ve <code>show ip route</code> çıktısında görünmez.", label: 'Next-Hop IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'Doğrudan bağlı komşu adresi' },
                        { name: 'vrf', why: "VRF belirtilirse rota yalnız o VRF'in tablosuna girer; global tabloda aranmaz. VRF adı <code>ip vrf</code> tanımıyla aynı olmalı.", label: 'VRF', type: 'text', validate: 'objname', placeholder: 'TENANT_A', hint: 'Opsiyonel — boş = global tablo' }
                    ]
                },
                {
                    title: 'Ek Rotalar',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'extra', why: "Her satır aynı VRF'e ayrı bir rota olarak eklenir. Biçime uymayan satırlar yazılmaz, çıktıda UYARI olarak işaretlenir.", label: 'Ek Rotalar (her satıra: önek next-hop)', type: 'textarea', placeholder: '172.16.0.0/12 10.0.0.2\n192.168.0.0/16 10.0.0.3', hint: 'Opsiyonel' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pfx = cgEsc(data.prefix || ''), nh = cgEsc(data.nexthop || ''), vrf = cgEsc(data.vrf || '');
            const vp = vrf ? 'vrf ' + vrf + ' ' : '';
            const ipRe = '((25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(25[0-5]|2[0-4]\\d|[01]?\\d\\d?)';
            const lineRe = new RegExp('^' + ipRe + '\\/(3[0-2]|[12]?\\d)\\s+' + ipRe + '$');
            let c = '# ========================================\n# Dell OS10 — Statik Rota\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'ip route ' + vp + pfx + ' ' + nh + '\n';
            String(data.extra || '').split('\n').map(s => s.trim()).filter(Boolean).forEach(l => {
                if (lineRe.test(l)) { const p = l.split(/\s+/); c += 'ip route ' + vp + cgEsc(p[0]) + ' ' + cgEsc(p[1]) + '\n'; }
                else c += '# UYARI: biçime uymayan satır atlandı: ' + cgEsc(l) + '\n';
            });
            c += '\nend\n\n';
            c += '# Doğrulama:\n# show ip route' + (vrf ? ' vrf ' + vrf : '') + '\n';
            return c;
        });
    }
};

// ── Dell OS10: LLDP ───────────────────────────────────────────────────────────
// Sözdizimi: lldp enable, lldp timer, lldp holdtime-multiplier, lldp reinit,
//   arayüzde lldp transmit / lldp receive —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_lldp
//   https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/initial/dellos10.j2
Dell.lldp = {
    label: 'LLDP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-broadcast-tower',
                title: 'Dell OS10 — LLDP',
                desc: 'Komşu keşfi için LLDP zamanlayıcıları ve belirli portlarda LLDP\'nin kapatılması (ör. internet/operatör portları).'
            },
            sections: [
                {
                    title: 'Global Ayarlar',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timer', why: "LLDP duyuru aralığı (saniye). Çok uzun tutulursa kablo değişikliği komşu tablosuna geç yansır; varsayılan 30 sn çoğu ortam için uygundur.", label: 'Gönderim Aralığı (sn)', type: 'text', min: 5, max: 254, placeholder: '30', hint: '5-254; boş = varsayılan' },
                        { name: 'hold', why: "Komşu kaydının ömrü = aralık × çarpan. Düşük çarpan geçici paket kaybında komşunun tablodan düşmesine yol açar.", label: 'Holdtime Çarpanı', type: 'text', min: 2, max: 10, placeholder: '4', hint: '2-10; boş = varsayılan' },
                        { name: 'reinit', why: "Port LLDP kapatılıp açıldığında yeniden başlatmadan önce beklenecek süre; çok kısa tutmak flap eden portlarda gereksiz LLDP trafiği üretir.", label: 'Reinit Gecikmesi (sn)', type: 'text', min: 1, max: 10, placeholder: '2', hint: '1-10; boş = varsayılan' }
                    ]
                },
                {
                    title: 'LLDP Kapatılacak Portlar',
                    icon: 'fas fa-eye-slash',
                    info: 'LLDP; hostname, model, yazılım sürümü ve yönetim IP\'sini karşı tarafa duyurur. Güvenilmeyen ağlara (internet, operatör, misafir) bakan portlarda kapatın.',
                    fields: [
                        { name: 'off_ports', why: "Operatör veya müşteri tarafına LLDP göndermek cihaz modeli ve sürümünü dışarıya açıklar; hedefli saldırı için ilk bilgi bu duyurudan toplanır.", label: 'Portlar', type: 'text', validate: 'iface_range', placeholder: 'ethernet1/1/48', hint: 'Opsiyonel — virgülle ayrılmış' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const timer = cgEsc(data.timer || ''), hold = cgEsc(data.hold || ''), reinit = cgEsc(data.reinit || '');
            const off = _otherDellIfList(data.off_ports);
            let c = '# ========================================\n# Dell OS10 — LLDP\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'lldp enable\n';
            if (timer) c += 'lldp timer ' + timer + '\n';
            if (hold) c += 'lldp holdtime-multiplier ' + hold + '\n';
            if (reinit) c += 'lldp reinit ' + reinit + '\n';
            c += '\n';
            off.forEach(i => { c += 'interface ' + i + '\n no lldp transmit\n no lldp receive\n!\n'; });
            c += '\nend\n\n';
            c += '# Doğrulama:\n# show lldp neighbors\n';
            return c;
        });
    }
};

// ── Dell OS10: Port Mirroring ─────────────────────────────────────────────────
// Sözdizimi: canlı config (monitor session N / description / destination interface /
//   source interface / no shut — 1 cihaz, 3 oturum)
// Sözdizimi: https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_flow_monitor
Dell.mirror = {
    label: 'Port Mirroring',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'Dell OS10 — Port Mirroring (monitor session)',
                desc: 'Yerel SPAN: kaynak portların trafiğini analiz cihazının bağlı olduğu hedef porta kopyalar.'
            },
            sections: [
                {
                    title: 'Oturum',
                    icon: 'fas fa-video',
                    warn: 'Hedef port normal trafik taşımaz; üzerindeki VLAN/IP ayarları etkisiz kalır. Kaynak toplam trafiği hedef port hızını aşarsa kopyalanan paketler <b>düşer</b>.',
                    fields: [
                        { name: 'session', why: "Oturum numarası cihazdaki diğer monitor oturumlarıyla çakışmamalı; mevcut bir numara verilirse o oturumun kaynaklarına ekleme yapılır.", label: 'Oturum No', type: 'text', validate: 'posint', required: true, placeholder: '1', hint: 'monitor session N' },
                        { name: 'desc', why: "Açıklama, oturumun kim tarafından ve neden açıldığını gösterir; unutulan SPAN oturumları analiz portunu aylarca meşgul eder.", label: 'Açıklama', type: 'text', placeholder: 'IDS_TAP', hint: 'Opsiyonel' },
                        { name: 'sources', why: "Kaynak portlardan hem giden hem gelen trafik kopyalanır. Uplink'i kaynak yapmak hedef portu kolayca doyurur.", label: 'Kaynak Portlar', type: 'text', validate: 'iface_range', required: true, placeholder: 'ethernet1/1/1,ethernet1/1/2', hint: 'Virgülle ayrılmış' },
                        { name: 'dest', why: "Hedef port kaynak listesinde olmamalı ve bir port-channel üyesi olmamalıdır; aksi halde oturum etkinleşmez.", label: 'Hedef Port', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1/36', hint: 'Analiz cihazının bağlı olduğu port' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sid = cgEsc(data.session || ''), desc = _otherDellDesc(data.desc), dest = cgEsc(data.dest || '');
            const src = _otherDellIfList(data.sources);
            let c = '# ========================================\n# Dell OS10 — Port Mirroring\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'monitor session ' + sid + '\n';
            if (desc) c += ' description ' + desc + '\n';
            c += ' destination interface ' + dest + '\n';
            src.forEach(s => { c += ' source interface ' + s + '\n'; });
            c += ' no shut\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show monitor session ' + sid + '\n';
            return c;
        });
    }
};

// ── Dell OS10: VRRP ───────────────────────────────────────────────────────────
// Sözdizimi: vrrp version 3, vrrp-group N, virtual-address, priority, no preempt,
//   advertise-interval centisecs —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_vrrp
//   https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/gateway/dellos10.j2
Dell.vrrp = {
    label: 'VRRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Dell OS10 — VRRP',
                desc: 'İki switch arasında sanal gateway adresi. VLT çiftlerinde OS10 VRRP\'yi varsayılan olarak active-active çalıştırır.'
            },
            sections: [
                {
                    title: 'Arayüz',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'iface', why: "VRRP genellikle SVI (<code>vlanN</code>) üzerinde çalışır. Arayüzün kendi fiziksel IP'si olmadan VRRP grubu başlamaz.", label: 'Arayüz', type: 'text', validate: 'iface', required: true, placeholder: 'vlan10', hint: 'vlanN veya L3 port' },
                        { name: 'real_ip', why: "Her switch'in bu arayüzde kendine ait, sanal adresten farklı bir IP'si olmalı; iki switch'e aynı gerçek IP verilirse ARP çakışması olur.", label: 'Arayüz IP (gerçek)', type: 'text', validate: 'cidr', placeholder: '10.128.10.2/24', hint: 'Opsiyonel — zaten tanımlıysa boş bırakın' },
                        { name: 'v3', why: "OS10 varsayılan olarak VRRPv2 kullanır. İki uç farklı sürümdeyse birbirinin ilanlarını anlamaz ve ikisi birden master olur.", label: 'VRRPv3 kullan (global)', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'VRRP Grubu',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'group', why: "Grup numarası (VRID) iki switch'te aynı olmalı ve aynı VLAN'daki başka bir VRRP/HSRP grubuyla çakışmamalı; çakışma sanal MAC'in iki cihazdan duyurulmasına neden olur.", label: 'Grup No (VRID)', type: 'text', min: 1, max: 255, required: true, placeholder: '10', hint: '1-255' },
                        { name: 'vip', why: "Sanal IP host'ların varsayılan gateway'idir ve arayüz alt ağında olmalıdır. Grup, sanal adres girilene kadar ilan göndermez.", label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.10.1', hint: 'virtual-address' },
                        { name: 'priority', why: "Yüksek öncelikli switch master olur (varsayılan 100). Master olması istenen tarafta 100'ün üstünde bir değer verin.", label: 'Öncelik', type: 'text', min: 1, max: 254, placeholder: '110', hint: 'Opsiyonel; boş = 100' },
                        { name: 'preempt', why: "Preempt açıkken öncelikli switch geri geldiğinde master rolünü geri alır. Kapatırsanız trafik, arıza sonrası yedek switch'te kalır — bazen istenen budur (gereksiz ikinci kesintiyi önler).", label: 'Preempt (öncelikli cihaz rolü geri alsın)', type: 'checkbox', checked: true },
                        { name: 'adv', why: "İlan aralığı iki uçta aynı olmalı. Kısaltmak arıza algılamayı hızlandırır ama CPU yükü altında gereksiz master değişimlerine yol açabilir.", label: 'İlan Aralığı (centisaniye)', type: 'text', min: 25, max: 4075, placeholder: '100', hint: 'Opsiyonel — 25\'in katları; 100 = 1 sn' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const iface = cgEsc(data.iface || ''), rip = cgEsc(data.real_ip || '');
            const grp = cgEsc(data.group || ''), vip = cgEsc(data.vip || ''), prio = cgEsc(data.priority || ''), adv = cgEsc(data.adv || '');
            let c = '# ========================================\n# Dell OS10 — VRRP\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            if (data.v3) c += 'vrrp version 3\n\n';
            c += 'interface ' + iface + '\n';
            if (rip) c += ' ip address ' + rip + '\n';
            c += ' vrrp-group ' + grp + '\n';
            c += '  virtual-address ' + vip + '\n';
            if (prio) c += '  priority ' + prio + '\n';
            if (!data.preempt) c += '  no preempt\n';
            if (adv) c += '  advertise-interval centisecs ' + adv + '\n';
            c += ' no shutdown\n!\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show vrrp brief\n# show vrrp ' + grp + '\n';
            // VRRP lab bulguları (dell-16): eşit öncelik, sanal adres alt ağ dışında / gerçek adresle aynı
            const w = [], rp = _os10Wpfx(data.real_ip), pv = data.priority ? +data.priority : 100;
            if (data.real_ip && !rp) w.push('\u26D4 Arayüz IP\'si A.B.C.D/uzunluk biçiminde olmalı (ör. 10.64.10.2/24).');
            if (rp && _os10Wip(data.vip)) {
                if (!_os10Win(data.vip, rp)) w.push('\u26D4 Sanal IP (' + data.vip + ') arayüz alt ağında (' + data.real_ip + ') değil: grup çalışmaz.');
                else if (data.vip === rp.ip) w.push('\u26A0 Sanal IP arayüzün gerçek adresiyle aynı: her switch\'e ayrı gerçek IP, ikisine ortak bir sanal IP verin.');
            }
            if (pv <= 100) w.push('\u2139 Öncelik ' + pv + (data.priority ? '' : ' (varsayılan)') + ': karşı switch de ' + pv + ' ise Master\'ı büyük arayüz IP\'si belirler. Master olacak switch\'e 100\'ün üstünde (ör. 110) verin.');
            if (!data.preempt) w.push('\u2139 Preempt kapalı: arızadan dönen yüksek öncelikli switch rolü geri almaz, trafik yedekte kalır.');
            if (data.v3) w.push('\u2139 vrrp version 3 globaldir; karşı switch de aynı sürümde olmalı, yoksa iki taraf da Master olur.');
            return { config: c, warnings: w };
        });
    }
};

// ── Dell OS10: Arayüz ─────────────────────────────────────────────────────────
// Sözdizimi: canlı config (description 6 cihaz; mtu 3 cihaz; flowcontrol receive/transmit
//   on|off 5 cihaz; switchport mode trunk / switchport access vlan /
//   switchport trunk allowed vlan 6 cihaz; no switchport 5 cihaz; speed 1 cihaz;
//   spanning-tree port type edge; no shutdown)
// Sözdizimi: switchport mode access, shutdown —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_interface
Dell.iface = {
    label: 'Arayüz',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Dell OS10 — Fiziksel Arayüz',
                desc: 'Port açıklaması, MTU, hız, flow control, access/trunk/routed mod ve yönetimsel durum.'
            },
            sections: [
                {
                    title: 'Portlar ve Temel Ayarlar',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'ports', why: "Aynı ayar listedeki tüm portlara ayrı ayrı yazılır. Uplink veya yönetim portunu yanlışlıkla listeye katmak bağlantıyı anında koparabilir.", label: 'Port(lar)', type: 'text', validate: 'iface_range', required: true, placeholder: 'ethernet1/1/1-1/1/4', hint: 'Virgülle ayrılmış; aralık aynı modülde açılır' },
                        { name: 'desc', why: "Açıklama, <code>show interface status</code> çıktısında portun neye bağlı olduğunu söyleyen tek bilgidir; açıklamasız portlar arıza anında yanlış kabloya müdahale edilmesine yol açar.", label: 'Açıklama', type: 'text', placeholder: 'ESX01_vmnic0', hint: 'Opsiyonel' },
                        { name: 'mtu', why: "OS10'da MTU L2 başlığını da içerir (jumbo için 9216). Uç ile switch MTU'su uyuşmazsa küçük paketler geçer, büyükler sessizce düşer — iSCSI/vMotion gibi trafik rastgele yavaşlar.", label: 'MTU', type: 'text', min: 1312, max: 9216, placeholder: '9216', hint: 'Opsiyonel; 1312-9216' },
                        { name: 'speed', why: "Hız sabitlenirse karşı uçta da aynı sabit hız olmalıdır; bir uç auto diğeri sabitse link kalkmaz veya half-duplex'e düşer.", label: 'Hız', type: 'select', options: [
                            { value: '', label: '(dokunma — varsayılan)', selected: true },
                            { value: 'auto', label: 'auto' },
                            { value: '1000', label: '1000 (1G)' },
                            { value: '10000', label: '10000 (10G)' },
                            { value: '25000', label: '25000 (25G)' },
                            { value: '40000', label: '40000 (40G)' },
                            { value: '100000', label: '100000 (100G)' }
                        ]},
                        { name: 'fc_rx', why: "Receive flow control açıkken switch karşıdan gelen PAUSE çerçevelerine uyar. Depolama (iSCSI) portlarında önerilir; genel veri portlarında bir yavaş cihaz tüm portu duraklatabilir.", label: 'Flow Control Receive', type: 'select', options: [
                            { value: '', label: '(dokunma)', selected: true },
                            { value: 'on', label: 'on' },
                            { value: 'off', label: 'off' }
                        ]},
                        { name: 'fc_tx', why: "Transmit flow control switch'in kendisinin PAUSE göndermesidir; yanlış kullanımda tıkanıklık ağ boyunca yayılır (head-of-line blocking).", label: 'Flow Control Transmit', type: 'select', options: [
                            { value: '', label: '(dokunma)', selected: true },
                            { value: 'on', label: 'on' },
                            { value: 'off', label: 'off' }
                        ]}
                    ]
                },
                {
                    title: 'Port Modu',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'mode', why: "Access tek VLAN taşır, trunk birden çok etiketli VLAN. Routed (<code>no switchport</code>) portu L3 yapar ve üzerindeki tüm VLAN üyeliklerini siler — geri dönüşte bu üyelikler elle yeniden girilmelidir.", label: 'Mod', type: 'select', options: [
                            { value: '', label: '(dokunma)', selected: true },
                            { value: 'access', label: 'Access' },
                            { value: 'trunk', label: 'Trunk' },
                            { value: 'routed', label: 'Routed (no switchport)' }
                        ]},
                        { name: 'access_vlan', why: "Access VLAN switch'te tanımlı değilse port trafik taşımaz. VLAN 1'i kullanıcı trafiği için kullanmaktan kaçının.", label: 'Access VLAN', type: 'text', validate: 'vlan', requiredIf: { field: 'mode', in: ['access'] }, placeholder: '10', hint: 'switchport access vlan' },
                        { name: 'trunk_vlans', why: "İzinli listeyi daraltmak broadcast alanını küçültür. Karşı uçta izinli olmayan VLAN'lar bu port üzerinden geçemez.", label: 'Trunk İzinli VLAN\'lar', type: 'text', validate: 'vlan_list', requiredIf: { field: 'mode', in: ['trunk'] }, placeholder: '10,20,30-40', hint: 'switchport trunk allowed vlan' },
                        { name: 'routed_ip', why: "Routed port kendi alt ağına sahip olmalı; aynı alt ağı bir SVI'da da kullanmak OS10'da reddedilir.", label: 'IP Adresi', type: 'text', validate: 'cidr', requiredIf: { field: 'mode', in: ['routed'] }, placeholder: '10.0.12.1/30', hint: 'Routed mod için' },
                        { name: 'edge', why: "Sunucu/PC portunu STP edge yapmak linkin anında forwarding'e geçmesini sağlar. Switch'e bağlı portta açmayın.", label: 'STP edge port', type: 'checkbox', checked: false },
                        { name: 'admin', why: "Kullanılmayan portları kapalı tutmak yetkisiz cihaz takılmasını engeller.", label: 'Yönetimsel Durum', type: 'select', options: [
                            { value: 'up', label: 'no shutdown — açık', selected: true },
                            { value: 'down', label: 'shutdown — kapalı' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ports = _otherDellIfList(data.ports);
            const desc = _otherDellDesc(data.desc), mtu = cgEsc(data.mtu || ''), speed = cgEsc(data.speed || '');
            const fcRx = cgEsc(data.fc_rx || ''), fcTx = cgEsc(data.fc_tx || ''), mode = data.mode || '';
            const av = cgEsc(data.access_vlan || ''), tv = cgEsc(_otherDellVlanList(data.trunk_vlans)), rip = cgEsc(data.routed_ip || '');
            let c = '# ========================================\n# Dell OS10 — Arayüz\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            ports.forEach(p => {
                c += 'interface ' + p + '\n';
                if (desc) c += ' description ' + desc + '\n';
                if (mode === 'access') {
                    c += ' switchport mode access\n';
                    if (av) c += ' switchport access vlan ' + av + '\n';
                } else if (mode === 'trunk') {
                    c += ' switchport mode trunk\n';
                    if (tv) c += ' switchport trunk allowed vlan ' + tv + '\n';
                } else if (mode === 'routed') {
                    c += ' no switchport\n';
                    if (rip) c += ' ip address ' + rip + '\n';
                }
                if (mtu) c += ' mtu ' + mtu + '\n';
                if (speed) c += ' speed ' + speed + '\n';
                if (fcRx) c += ' flowcontrol receive ' + fcRx + '\n';
                if (fcTx) c += ' flowcontrol transmit ' + fcTx + '\n';
                if (data.edge && mode !== 'routed') c += ' spanning-tree port type edge\n';
                c += (data.admin === 'down' ? ' shutdown' : ' no shutdown') + '\n!\n';
            });
            c += '\nend\n\n';
            c += '# Doğrulama:\n# show interface status\n';
            // Arayüz lab bulguları (dell-09/40): aynı IP birden çok portta, trunk'ta edge, sabit hız, MTU tek uç
            const w = [];
            if (mode === 'routed' && ports.length > 1 && rip) w.push('\u26D4 Aynı IP (' + data.routed_ip + ') ' + ports.length + ' porta yazılıyor: her routed portun ayrı alt ağı olmalı, ikinci port çakışma nedeniyle reddedilir. Routed modda tek port seçin.');
            const rp = _os10Wpfx(data.routed_ip);
            if (mode === 'routed' && rp && rp.len < 31 && (_os10Wn(rp.ip) === rp.base || _os10Wn(rp.ip) === rp.base + rp.size - 1)) w.push('\u26A0 ' + data.routed_ip + ' ağ ya da yayın adresi; arayüze bir host adresi girin.');
            if (data.edge && mode === 'trunk') w.push('\u26A0 Trunk portu STP edge yapılıyor: trunk genelde switch\'ler arası bağlantıdır; edge yapmak döngü riski doğurur.');
            if (mode === 'access' && av === '1') w.push('\u2139 Access VLAN 1: kullanıcı trafiği için VLAN 1 yerine ayrı bir VLAN kullanın.');
            if (speed && speed !== 'auto') w.push('\u2139 Hız sabitlendi: karşı uçta da aynı sabit hız olmalı; bir uç auto kalırsa link kalkmayabilir.');
            if (mtu) w.push('\u2139 MTU ' + mtu + ': yolun iki ucunda (sunucu ve karşı switch) aynı olmalı; uyuşmazlıkta küçük paket (ping) geçer, büyük aktarımlar takılır.');
            if (data.admin === 'down') w.push('\u26A0 Portlar kapatılacak: listede kullanılan bir port ya da uplink olmadığını kontrol edin.');
            return { config: c, warnings: w };
        });
    }
};

// ── Dell OS10: Breakout / Port-Group ──────────────────────────────────────────
// Sözdizimi: canlı config (interface breakout 1/1/N map 100g-1x — 2 cihaz;
//   port-group 1/1/N / mode Eth 25g-4x — 3 cihaz)
// Sözdizimi: map / mode değerleri (10g-4x, 25g-4x, 40g-1x, 50g-2x, 100g-1x) —
//   https://github.com/ansible-collections/dellemc.os10/tree/master/roles/os10_interface (fanout)
//   https://www.dell.com/support/manuals/en-us/dell-emc-smartfabric-os10/smartfabric-os-user-guide-10-5-2-6/unified-port-groups
Dell.breakout = {
    label: 'Breakout / Port-Group',
    init(container) {
        const maps = [
            { value: '10g-4x', label: '10g-4x — 4 × 10G' },
            { value: '25g-4x', label: '25g-4x — 4 × 25G', selected: true },
            { value: '40g-1x', label: '40g-1x — 1 × 40G' },
            { value: '50g-2x', label: '50g-2x — 2 × 50G' },
            { value: '100g-1x', label: '100g-1x — 1 × 100G (bölünmemiş)' }
        ];
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-code-branch',
                title: 'Dell OS10 — Breakout / Port-Group Modu',
                desc: 'QSFP portunu alt portlara böler (ör. 100G → 4×25G). Model tipine göre <code>interface breakout</code> veya <code>port-group</code> kullanılır.'
            },
            configTypes: [
                { id: 'breakout', label: 'interface breakout', icon: 'fas fa-cut', desc: 'Port başına breakout (S4100/S5200 uplink, Z9 serisi)', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'portgroup', label: 'port-group', icon: 'fas fa-th', desc: 'Port grubu profili (S5200 unified port-group)' }
            ],
            sections: [
                {
                    title: 'Breakout',
                    icon: 'fas fa-cut',
                    showFor: ['breakout'],
                    warn: 'Breakout değişikliği porttaki <b>tüm arayüz ayarlarını siler</b>; yeni alt portlar (ör. ethernet1/1/25:1) sıfır config ile gelir. Canlı trafik taşıyan portta bakım penceresinde yapın.',
                    fields: [
                        { name: 'bo_port', why: "Port numarası slot/modül/port biçimindedir (1/1/25); başına 'ethernet' yazılmaz. Yanlış porta uygulanan breakout o portun bağlantısını keser.", label: 'Port (1/1/N)', type: 'text', requiredIf: { field: '_cgtype', in: ['breakout'] }, placeholder: '1/1/25', hint: 'interface breakout <port>' },
                        { name: 'bo_map', why: "Seçilen mod takılı optik/DAC kablo ile uyumlu olmalı; 4×25G modu 4×10G breakout kablosuyla link kaldırmaz.", label: 'Breakout Modu', type: 'select', options: maps }
                    ]
                },
                {
                    title: 'Port-Group',
                    icon: 'fas fa-th',
                    showFor: ['portgroup'],
                    warn: 'Port-group modu gruptaki <b>bütün portları birlikte</b> değiştirir ve üzerlerindeki ayarları siler.',
                    fields: [
                        { name: 'pg_id', why: "Port-group numarası modele göre sabittir; hangi fiziksel portların bu gruba ait olduğunu <code>show port-group</code> ile önceden kontrol edin.", label: 'Port-Group (1/1/N)', type: 'text', requiredIf: { field: '_cgtype', in: ['portgroup'] }, placeholder: '1/1/1', hint: 'port-group <id>' },
                        { name: 'pg_mode', why: "Grup modu tüm üye portların hızını belirler; tek bir 10G cihaz için grubu 10G'ye almak gruptaki 25G sunucu bağlantılarını da düşürür.", label: 'Mod (Eth)', type: 'select', options: maps }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'breakout';
            let c = '# ========================================\n# Dell OS10 — Breakout / Port-Group\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            if (t === 'portgroup') {
                const id = cgEsc(data.pg_id || ''), mode = cgEsc(data.pg_mode || '');
                if (id) c += 'port-group ' + id + '\n mode Eth ' + mode + '\n!\n\n';
                c += 'end\n\n# Doğrulama:\n# show port-group\n# show interface status\n';
            } else {
                const port = cgEsc(data.bo_port || ''), map = cgEsc(data.bo_map || '');
                if (port) {
                    c += 'interface breakout ' + port + ' map ' + map + '\n\n';
                    if (/-[24]x$/.test(map)) c += '# Yeni alt portlar: ethernet' + port + ':1 … :' + map.slice(-2, -1) + '\n\n';
                }
                c += 'end\n\n# Doğrulama:\n# show interface status\n';
            }
            return c;
        });
    }
};

// ── Dell OS10: iSCSI Optimizasyonu ────────────────────────────────────────────
// Sözdizimi: canlı config (iscsi enable 3 cihaz; iscsi target port 860/3260 6 cihaz;
//   default mtu 9216 4 cihaz; flowcontrol receive on, mtu 9216, spanning-tree port type edge)
// Sözdizimi: iscsi session-monitoring enable —
//   https://www.dell.com/support/manuals/en-us/dell-emc-smartfabric-os10/smartfabric-os-user-guide-10-5-3/configure-iscsi-optimization
Dell.iscsi = {
    label: 'iSCSI',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-hdd',
                title: 'Dell OS10 — iSCSI Optimizasyonu',
                desc: 'iSCSI oturum algılama ve depolama portları için jumbo MTU, flow control ve edge port ayarı. 860 ve 3260 hedef portları OS10\'da varsayılan olarak tanımlıdır.'
            },
            sections: [
                {
                    title: 'Global iSCSI',
                    icon: 'fas fa-database',
                    fields: [
                        { name: 'enable', why: "iSCSI optimizasyonu OS10'da elle açılmalıdır; kapalıyken switch iSCSI oturumlarını tanımaz ve depolama trafiğine öncelik uygulanmaz.", label: 'iSCSI optimizasyonunu aç (iscsi enable)', type: 'checkbox', checked: true },
                        { name: 'target_port', why: "Depolama dizisi standart dışı bir TCP portu kullanıyorsa bu port eklenmezse oturumlar algılanmaz. 860 ve 3260 zaten varsayılandır, tekrar yazmaya gerek yok.", label: 'Ek Hedef TCP Portu', type: 'text', validate: 'port', placeholder: '3261', hint: 'Opsiyonel — 860/3260 dışında bir port' },
                        { name: 'monitor', why: "Oturum izleme, hangi initiator'ın hangi hedefe bağlı olduğunu <code>show iscsi session</code> ile görmenizi sağlar; bağlantı sorunlarında ilk bakılacak yerdir.", label: 'Oturum izlemeyi aç (session-monitoring)', type: 'checkbox', checked: true },
                        { name: 'def_mtu', why: "Tüm portlar için varsayılan MTU'yu 9216 yapar. Depolama ağında tek bir 1500 MTU'lu port jumbo çerçeveleri düşürür ve iSCSI oturumu kurulur ama veri aktarımı takılır.", label: 'Global varsayılan MTU 9216 (default mtu)', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Depolama Portları',
                    icon: 'fas fa-ethernet',
                    info: 'Sunucu ve depolama dizisine bakan portlara jumbo MTU, <code>flowcontrol receive on</code> ve STP edge uygulanır.',
                    fields: [
                        { name: 'ports', why: "iSCSI kayıpsız ağ ister; flow control ve jumbo MTU uygulanmayan tek bir port, tüm yolda yeniden iletime ve gecikmeye yol açar.", label: 'Portlar', type: 'text', validate: 'iface_range', placeholder: 'ethernet1/1/1-1/1/8', hint: 'Opsiyonel — virgülle ayrılmış' },
                        { name: 'jumbo', why: "Jumbo çerçeve CPU yükünü ve başlık oranını düşürür; ancak uçtaki NIC ve depolama dizisi de jumbo olmalı.", label: 'Portlara MTU 9216', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const tp = cgEsc(data.target_port || ''), ports = _otherDellIfList(data.ports);
            let c = '# ========================================\n# Dell OS10 — iSCSI Optimizasyonu\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            if (data.def_mtu) c += 'default mtu 9216\n';
            if (data.enable) c += 'iscsi enable\n';
            if (tp) c += 'iscsi target port ' + tp + '\n';
            if (data.monitor) c += 'iscsi session-monitoring enable\n';
            c += '\n';
            ports.forEach(p => {
                c += 'interface ' + p + '\n';
                if (data.jumbo) c += ' mtu 9216\n';
                c += ' flowcontrol receive on\n spanning-tree port type edge\n!\n';
            });
            c += '\nend\n\n';
            c += '# Doğrulama:\n# show iscsi\n# show iscsi session\n';
            return c;
        });
    }
};

// ── Dell OS10: Banner / Hostname / Sıkılaştırma ───────────────────────────────
// Sözdizimi: canlı config (hostname 6 cihaz; banner motd ^C … ^C 1 cihaz;
//   banner login/motd disable 2 cihaz; ip ssh server cipher/mac 1 cihaz)
// Sözdizimi: exec-timeout (0-3600 sn) —
//   https://www.dell.com/support/manuals/en-us/smartfabric-os10-emp-partner/smartfabric-os-user-guide-10-5-2/exec-timeout
// Sözdizimi: banner login (^C ayraçlı) —
//   https://www.dell.com/support/manuals/en-us/dell-emc-smartfabric-os10/smartfabric-os-user-guide-10-5-2-6/banner-login
// Sözdizimi: system-user linuxadmin disable —
//   https://www.dell.com/support/manuals/en-us/smartfabric-os10-emp-partner/os10-scg-10-5-6-x/user-and-credential-management
Dell.hardening = {
    label: 'Banner / Sıkılaştırma',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'Dell OS10 — Hostname, Banner ve Yönetim Sıkılaştırma',
                desc: 'Cihaz adı, yasal uyarı banner\'ı, oturum zaman aşımı, SSH şifreleme kısıtı ve linuxadmin hesabının kapatılması.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Kimlik ve Banner',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', why: "Hostname prompt'ta ve syslog'da görünür; aynı adlı iki cihaz log korelasyonunu ve yanlış cihaza komut girilmesini kolaylaştırır.", label: 'Hostname', type: 'text', validate: 'hostname', placeholder: 'DELL-LEAF1', hint: 'Opsiyonel' },
                        { name: 'banner_login', why: "Girişten önce gösterilen yasal uyarı, yetkisiz erişimde hukuki süreç için gereklidir. Uyarı yoksa 'bilmiyordum' savunması geçerli sayılabilir.", label: 'Login Banner Metni', type: 'textarea', placeholder: 'Yetkisiz erisim yasaktir.\nTum islemler kayit altindadir.', hint: 'Opsiyonel; ^C ayracı otomatik eklenir' },
                        { name: 'banner_motd', why: "MOTD girişten sonra gösterilir; bakım duyurusu veya cihaz rolü için kullanılır. Hassas bilgi (IP planı, parola ipucu) yazmayın.", label: 'MOTD Banner Metni', type: 'textarea', placeholder: 'Bakim penceresi: Pazar 02:00-04:00', hint: 'Opsiyonel' }
                    ]
                },
                {
                    title: 'Oturum ve SSH',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'exec_timeout', why: "Açık bırakılan bir oturum, masadan kalkan yöneticinin yetkileriyle herkesin kullanımına açıktır. Zaman aşımı tanımlı değilse OS10 oturumu hiç kapatmaz.", label: 'Oturum Zaman Aşımı (sn)', type: 'text', min: 0, max: 3600, placeholder: '600', hint: 'exec-timeout; 0 = kapalı' },
                        { name: 'ssh_strong', why: "Yalnız AES-CTR/GCM şifreleri ve SHA-2 MAC'lerine izin vermek, eski ve zayıf algoritmalarla (CBC, SHA-1) bağlantı kurulmasını engeller. Çok eski SSH istemcileri bağlanamayabilir.", label: 'SSH\'ı güçlü şifre/MAC ile sınırla', type: 'checkbox', checked: true },
                        { name: 'linuxadmin_off', why: "<code>linuxadmin</code>, OS10'un altındaki Linux kabuğuna doğrudan erişen fabrika hesabıdır. Kullanılmıyorsa kapatmak, CLI denetiminin tamamen dışında kalan bir giriş yolunu kapatır.", label: 'linuxadmin hesabını kapat', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hn = cgEsc(data.hostname || ''), to = cgEsc(data.exec_timeout || '');
            const bl = String(data.banner_login || '').replace(/\^C/g, '').replace(/\r/g, '').split('\n').map(l => cgEsc(l.replace(/\s+$/, ''))).filter(l => l.trim());
            const bm = String(data.banner_motd || '').replace(/\^C/g, '').replace(/\r/g, '').split('\n').map(l => cgEsc(l.replace(/\s+$/, ''))).filter(l => l.trim());
            let c = '# ========================================\n# Dell OS10 — Banner / Sıkılaştırma\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            if (hn) c += 'hostname ' + hn + '\n\n';
            if (bl.length) c += 'banner login ^C\n' + bl.join('\n') + '\n^C\n\n';
            if (bm.length) c += 'banner motd ^C\n' + bm.join('\n') + '\n^C\n\n';
            if (to) c += 'exec-timeout ' + to + '\n\n';
            if (data.ssh_strong) {
                c += '# SSH şifre ve MAC kısıtı\n';
                c += 'ip ssh server cipher aes256-ctr aes256-gcm@openssh.com aes128-ctr aes128-gcm@openssh.com\n';
                c += 'ip ssh server mac hmac-sha2-256 hmac-sha2-512\n\n';
            }
            if (data.linuxadmin_off) c += '# Linux kabuk hesabını kapat\nsystem-user linuxadmin disable\n\n';
            c += 'end\n\n';
            c += '# Doğrulama:\n# show running-configuration | grep banner\n# show running-configuration | grep ssh\n';
            return c;
        });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// Extreme Networks ExtremeXOS (EXOS) — ek araçlar
// Canlı EXOS config'i yok; sözdizimi Extreme resmi Command Reference'tan
// (EXOS 16.2, komut başına sayfa) ve ipspace/netlab EXOS şablonlarından
// (MIT, yalnız sözdizimi referansı) doğrulandı.
//   EXOS CR: https://documentation.extremenetworks.com/exos_commands_16/EXOS_16_2/EXOS_Commands_All/
//   netlab : https://github.com/ipspace/netlab/tree/dev/netsim/ansible/templates
// ══════════════════════════════════════════════════════════════════════════════

const _EXOS_CR = 'https://documentation.extremenetworks.com/exos_commands_16/EXOS_16_2/EXOS_Commands_All/';

// EXOS port listesi: '1-4, 7' → '1-4,7' ; '1:1-1:4' (stack) aynen korunur
function _otherExosPorts(s) {
    return String(s || '').trim().split(/[,\s]+/).filter(Boolean).map(p => cgEsc(p)).join(',');
}

// Sanal yönlendirici seçenekleri (EXOS'ta yönetim portu VR-Mgmt'tedir)
const _EXOS_VR_OPTS = () => ([
    { value: 'VR-Mgmt', label: 'VR-Mgmt — yönetim portu (Mgmt) üzerinden', selected: true },
    { value: 'VR-Default', label: 'VR-Default — ön panel portları / VLAN\'lar' }
]);

// ── Extreme EXOS: VLAN ────────────────────────────────────────────────────────
// Sözdizimi: create vlan … tag … description, configure vlan … add ports … tagged|untagged,
//   configure vlan … delete ports, configure ports … display-string —
//   _EXOS_CR + r_create-vlan.shtml, r_configure-vlan-add-ports.shtml,
//   r_configure-vlan-delete-ports.shtml, r_configure-ports-displaystring.shtml
//   netlab: vlan/exos.j2, initial/exos.vlan.j2
ExtremeNet.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Extreme EXOS — VLAN',
                desc: 'EXOS VLAN\'ı adla yönetir: önce VLAN oluşturulur, sonra portlar VLAN\'a <b>tagged</b> veya <b>untagged</b> eklenir.'
            },
            sections: [
                {
                    title: 'VLAN Tanımı',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'vlan_name', why: "Bütün port ve IP komutları VLAN'ı bu adla çağırır. Ad sonraki komutlarda farklı yazılırsa EXOS hata verir ya da yanlış VLAN'a işlem yapılır.", label: 'VLAN Adı', type: 'text', validate: 'objname', required: true, placeholder: 'SERVERS', hint: 'Harfle başlar, en fazla 32 karakter' },
                        { name: 'vlan_tag', why: "Tag, VLAN'ın kablo üzerindeki 802.1Q kimliğidir ve karşı switch ile aynı olmalı. Tag verilmeyen VLAN'a tagged port eklenemez. Tag 1 fabrika Default VLAN'ına aittir.", label: 'VLAN ID (tag)', type: 'text', min: 2, max: 4094, required: true, placeholder: '100', hint: '2-4094' },
                        { name: 'vlan_desc', why: "Açıklama <code>show vlan</code> çıktısında görünür; VLAN'ın hangi servise ait olduğunu belgeleyen tek yerdir.", label: 'Açıklama', type: 'text', placeholder: 'Sunucu_ag', hint: 'Opsiyonel — en fazla 64 karakter' }
                    ]
                },
                {
                    title: 'Port Üyelikleri',
                    icon: 'fas fa-ethernet',
                    warn: 'Bir port aynı anda yalnızca <b>bir</b> VLAN\'da untagged olabilir. Port fabrika çıkışında <code>Default</code> VLAN\'da untagged\'dır; önce oradan çıkarılmazsa ekleme reddedilir.',
                    fields: [
                        { name: 'untagged', why: "Untagged portlar tek VLAN taşıyan uç cihaz portlarıdır. Port başka bir VLAN'da untagged ise EXOS bu komutu reddeder.", label: 'Untagged Portlar', type: 'text', placeholder: '1-4', hint: 'Opsiyonel — ör. 1-4,7 veya stack\'te 1:1-1:4' },
                        { name: 'tagged', why: "Tagged portlar trunk/uplink'tir ve aynı anda birden çok VLAN taşır; karşı uç da bu VLAN'ı etiketli beklemelidir.", label: 'Tagged Portlar', type: 'text', placeholder: '49,50', hint: 'Opsiyonel — uplink/trunk' },
                        { name: 'del_default', why: "Untagged portu Default VLAN'dan çıkarmadan yeni VLAN'a untagged ekleyemezsiniz. Bu seçenek yalnız yukarıdaki untagged portları Default'tan siler.", label: 'Untagged portları önce Default VLAN\'dan çıkar', type: 'checkbox', checked: true },
                        { name: 'port_label', why: "Display-string, <code>show ports</code> çıktısında portun neye bağlı olduğunu gösterir (en fazla 15 karakter).", label: 'Port Etiketi (display-string)', type: 'text', placeholder: 'ESX01', hint: 'Opsiyonel — untagged portlara uygulanır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vn = cgEsc(data.vlan_name || ''), tag = cgEsc(data.vlan_tag || '');
            const desc = String(data.vlan_desc || '').replace(/"/g, '').trim();
            const ut = _otherExosPorts(data.untagged), tg = _otherExosPorts(data.tagged);
            const lbl = cgEsc(String(data.port_label || '').replace(/\s+/g, '_').slice(0, 15));
            let c = '# ========================================\n# Extreme EXOS — VLAN\n# ========================================\n\n';
            c += 'create vlan "' + vn + '" tag ' + tag + (desc ? ' description "' + cgEsc(desc) + '"' : '') + '\n\n';
            if (ut) {
                if (data.del_default) c += '# Portları Default VLAN\'dan çıkar\nconfigure vlan Default delete ports ' + ut + '\n';
                c += 'configure vlan ' + vn + ' add ports ' + ut + ' untagged\n';
                if (lbl) c += 'configure ports ' + ut + ' display-string ' + lbl + '\n';
                c += '\n';
            }
            if (tg) c += 'configure vlan ' + vn + ' add ports ' + tg + ' tagged\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show vlan ' + vn + '\n# show ports information\n';
            return c;
        });
    }
};

// ── Extreme EXOS: IP Arayüzü (L3 VLAN) ────────────────────────────────────────
// Sözdizimi: configure vlan … ipaddress, enable ipforwarding vlan …, configure ip-mtu … vlan,
//   enable loopback-mode vlan — _EXOS_CR + r_configure-vlan-ipaddress.shtml,
//   r_configure-ipmtu-vlan.shtml, r_enable-loopbackmode-vlan.shtml
//   netlab: initial/exos.j2
ExtremeNet.ipIface = {
    label: 'IP Arayüzü',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Extreme EXOS — IP Arayüzü (L3 VLAN)',
                desc: 'EXOS\'ta IP adresi porta değil VLAN\'a verilir. VLAN\'lar arası yönlendirme için VLAN\'da <code>ipforwarding</code> açılmalıdır.'
            },
            sections: [
                {
                    title: 'VLAN Arayüzü',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'vlan_name', why: "VLAN önceden oluşturulmuş olmalı; olmayan bir VLAN adına IP verilemez.", label: 'VLAN Adı', type: 'text', validate: 'objname', required: true, placeholder: 'SERVERS', hint: 'Mevcut VLAN' },
                        { name: 'ip', why: "Bu adres VLAN'daki hostların gateway'idir. Aynı alt ağ başka bir VLAN'da tanımlıysa EXOS ikinci atamayı reddeder.", label: 'IP / Önek', type: 'text', validate: 'cidr', required: true, placeholder: '10.128.100.1/24', hint: 'CIDR biçiminde' },
                        { name: 'fwd', why: "<code>ipforwarding</code> kapalıyken VLAN'a IP verilse bile cihaz bu VLAN'dan gelen trafiği başka VLAN'a yönlendirmez; yalnızca yönetim adresi gibi davranır.", label: 'IP yönlendirmeyi aç (ipforwarding)', type: 'checkbox', checked: true },
                        { name: 'ip_mtu', why: "IP MTU, VLAN'daki L3 paket boyutunu belirler. Jumbo açılmamış portlarda 1500'den büyük değer paketlerin parçalanmasına veya düşmesine yol açar.", label: 'IP MTU', type: 'text', min: 1500, max: 9194, placeholder: '9000', hint: 'Opsiyonel — portlarda jumbo-frame açık olmalı' },
                        { name: 'loopback', why: "Loopback modu, VLAN'da aktif port olmasa bile arayüzü ayakta tutar; router-id ve yönetim adresi için kullanılır.", label: 'Loopback modu (port olmadan da up)', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vn = cgEsc(data.vlan_name || ''), ip = cgEsc(data.ip || ''), mtu = cgEsc(data.ip_mtu || '');
            let c = '# ========================================\n# Extreme EXOS — IP Arayüzü\n# ========================================\n\n';
            if (data.loopback) c += 'enable loopback-mode vlan ' + vn + '\n';
            c += 'configure vlan ' + vn + ' ipaddress ' + ip + '\n';
            if (data.fwd) c += 'enable ipforwarding vlan ' + vn + '\n';
            if (mtu) c += 'configure ip-mtu ' + mtu + ' vlan ' + vn + '\n';
            c += '\nsave configuration\n\n';
            c += '# Doğrulama:\n# show ipconfig vlan ' + vn + '\n# show vlan ' + vn + '\n';
            return c;
        });
    }
};

// ── Extreme EXOS: Statik Rota ─────────────────────────────────────────────────
// Sözdizimi: configure iproute add [ipNetmask] gateway {vr vrname} —
//   _EXOS_CR + r_configure-iproute-add-ipv4.shtml, r_configure-iproute-add-default.shtml
ExtremeNet.staticRoute = {
    label: 'Statik Rota',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-directions',
                title: 'Extreme EXOS — Statik Rota',
                desc: '<code>configure iproute add</code> ile statik rota. Gateway doğrudan bağlı bir VLAN alt ağında olmalıdır.'
            },
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'prefix', why: "Hedef ağ; 0.0.0.0/0 verilirse varsayılan rota yazılır. Maske yanlışsa rota beklenenden dar veya geniş bir ağı kapsar.", label: 'Hedef Ağ', type: 'text', validate: 'cidr', required: true, placeholder: '10.64.0.0/16', hint: 'CIDR; varsayılan rota için 0.0.0.0/0' },
                        { name: 'gw', why: "EXOS gateway doğrudan bağlı bir alt ağda değilse 'Gateway is not on directly attached subnet' hatası verir ve rota eklenmez.", label: 'Gateway', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'Doğrudan bağlı next-hop' },
                        { name: 'vr', why: "Rota yalnız seçilen sanal yönlendiricinin tablosuna girer. Yönetim ağına giden rotalar VR-Mgmt'e, veri trafiği VR-Default'a yazılmalıdır; yanlış VR'a yazılan rota hiç kullanılmaz.", label: 'Sanal Yönlendirici (VR)', type: 'select', options: [
                            { value: '', label: '(geçerli VR — belirtme)', selected: true },
                            { value: 'VR-Default', label: 'VR-Default' },
                            { value: 'VR-Mgmt', label: 'VR-Mgmt' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pfx = cgEsc(data.prefix || ''), gw = cgEsc(data.gw || ''), vr = cgEsc(data.vr || '');
            const vrs = vr ? ' vr ' + vr : '';
            let c = '# ========================================\n# Extreme EXOS — Statik Rota\n# ========================================\n\n';
            if (pfx === '0.0.0.0/0') c += 'configure iproute add default ' + gw + vrs + '\n';
            else c += 'configure iproute add ' + pfx + ' ' + gw + vrs + '\n';
            c += '\nsave configuration\n\n';
            c += '# Doğrulama:\n# show iproute' + vrs + '\n';
            return c;
        });
    }
};

// ── Extreme EXOS: OSPF ────────────────────────────────────────────────────────
// Sözdizimi: configure ospf routerid, create ospf area, configure ospf add vlan … area …
//   {link-type …} {passive}, configure ospf vlan … cost, enable ospf —
//   _EXOS_CR + r_configure-ospf-routerid.shtml, r_create-ospf-area.shtml,
//   r_configure-ospf-add-vlan-area.shtml, r_configure-ospf-add-vlan-area-linktype.shtml, r_enable-ospf.shtml
//   netlab: ospf/exos.ospfv2.j2
ExtremeNet.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Extreme EXOS — OSPFv2',
                desc: 'OSPF, IP adresli VLAN\'lar üzerinde çalışır. Alan 0.0.0.0 varsayılan olarak vardır; diğer alanlar önce oluşturulmalıdır.'
            },
            sections: [
                {
                    title: 'Süreç',
                    icon: 'fas fa-cog',
                    warn: 'Router-ID değişikliği OSPF etkinken yapılırsa komşuluklar yeniden kurulur; ID\'yi <code>enable ospf</code> öncesinde verin.',
                    fields: [
                        { name: 'rid', why: "Router-ID alanda benzersiz olmalı. Otomatik bırakılırsa en yüksek arayüz IP'si seçilir ve o IP değiştiğinde komşuluklar kopar.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Genellikle loopback adresi' }
                    ]
                },
                {
                    title: 'Arayüz (VLAN)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan_name', why: "OSPF yalnız IP adresli ve ipforwarding açık VLAN'da komşuluk kurar.", label: 'VLAN Adı', type: 'text', validate: 'objname', required: true, placeholder: 'UPLINK1', hint: 'IP adresli VLAN' },
                        { name: 'area', why: "Alan numarası komşuyla aynı olmalı; farklı alandaki komşular hello paketlerini reddeder ve komşuluk hiç kurulmaz.", label: 'Alan (area)', type: 'text', validate: 'ip', required: true, placeholder: '0.0.0.0', hint: 'Noktalı biçim (0.0.0.0, 0.0.0.1)' },
                        { name: 'link_type', why: "İki router'ın doğrudan bağlandığı linklerde point-to-point DR/BDR seçimini kaldırır ve yakınsamayı hızlandırır. İki uç aynı tipte olmalı.", label: 'Link Tipi', type: 'select', options: [
                            { value: '', label: '(varsayılan — auto)', selected: true },
                            { value: 'point-to-point', label: 'point-to-point' },
                            { value: 'broadcast', label: 'broadcast' }
                        ]},
                        { name: 'passive', why: "Passive VLAN ağını OSPF'e duyurur ama hello göndermez; kullanıcı VLAN'larında yetkisiz bir cihazın OSPF komşusu olmasını engeller.", label: 'Passive (komşuluk kurma, yalnız duyur)', type: 'checkbox', checked: false },
                        { name: 'cost', why: "Cost, yol seçimini belirler; düşük cost tercih edilir. Tek yönlü değiştirmek asimetrik yönlendirmeye yol açar.", label: 'Cost', type: 'text', min: 1, max: 65535, placeholder: '10', hint: 'Opsiyonel' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const rid = cgEsc(data.rid || ''), vn = cgEsc(data.vlan_name || ''), area = cgEsc(data.area || '');
            const lt = cgEsc(data.link_type || ''), cost = cgEsc(data.cost || '');
            let c = '# ========================================\n# Extreme EXOS — OSPFv2\n# ========================================\n\n';
            c += 'configure ospf routerid ' + rid + '\n';
            if (area && area !== '0.0.0.0') c += 'create ospf area ' + area + '\n';
            c += 'configure ospf add vlan ' + vn + ' area ' + area + (lt ? ' link-type ' + lt : '') + (data.passive ? ' passive' : '') + '\n';
            if (cost) c += 'configure ospf vlan ' + vn + ' cost ' + cost + '\n';
            c += 'enable ospf\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show ospf\n# show ospf neighbor\n# show ospf interfaces\n# show iproute\n';
            return c;
        });
    }
};

// ── Extreme EXOS: VRRP ────────────────────────────────────────────────────────
// Sözdizimi: create vrrp vlan … vrid, configure vrrp vlan … vrid … add|priority|preempt|
//   dont-preempt|advertisement-interval|version, enable vrrp vlan … vrid —
//   _EXOS_CR + r_create-vrrp-vlan-vrid.shtml, r_configure-vrrp-vlan-vrid-add-ipaddress.shtml,
//   r_configure-vrrp-vlan-vrid-priority.shtml, r_configure-vrrp-vlan-vrid-preempt.shtml,
//   r_configure-vrrp-vlan-vrid-advertisementinterval.shtml, r_enable-vrrp-vrid.shtml
//   netlab: gateway/exos.j2
ExtremeNet.vrrp = {
    label: 'VRRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Extreme EXOS — VRRP',
                desc: 'VLAN üzerinde sanal gateway. VLAN\'ın kendi IP adresi önceden tanımlı olmalıdır.'
            },
            sections: [
                {
                    title: 'VRRP Örneği',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'vlan_name', why: "VRRP örneği VLAN'a bağlanır; VLAN'da gerçek IP yoksa örnek başlamaz.", label: 'VLAN Adı', type: 'text', validate: 'objname', required: true, placeholder: 'SERVERS', hint: 'IP adresli VLAN' },
                        { name: 'vrid', why: "VRID iki switch'te aynı olmalı; aynı VLAN'daki başka bir VRRP grubuyla çakışırsa sanal MAC iki kaynaktan duyurulur.", label: 'VRID', type: 'text', min: 1, max: 255, required: true, placeholder: '10', hint: '1-255' },
                        { name: 'vip', why: "Sanal IP, host'ların gateway'idir ve VLAN alt ağında olmalı.", label: 'Sanal IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.100.1', hint: 'Host\'ların gateway adresi' },
                        { name: 'priority', why: "Yüksek öncelikli switch master olur (varsayılan 100). Sanal IP switch'in kendi IP'si ise öncelik otomatik 255 olur.", label: 'Öncelik', type: 'text', min: 1, max: 254, placeholder: '110', hint: 'Opsiyonel; boş = 100' },
                        { name: 'preempt', why: "Preempt açıkken öncelikli switch geri geldiğinde master'ı geri alır; kapalıyken trafik yedekte kalır ve ikinci bir kısa kesinti yaşanmaz.", label: 'Preempt', type: 'checkbox', checked: true },
                        { name: 'adv', why: "İlan aralığı iki uçta aynı olmalı; farklıysa yedek switch master'ı kayıp sanıp ikisi birden master olabilir.", label: 'İlan Aralığı (sn)', type: 'text', min: 1, max: 40, placeholder: '1', hint: 'Opsiyonel' },
                        { name: 'v3', why: "VRRPv3 hem IPv4 hem IPv6 destekler ve saniye altı ilan aralığına izin verir. İki uç aynı sürümde olmalı.", label: 'VRRPv3 kullan', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vn = cgEsc(data.vlan_name || ''), id = cgEsc(data.vrid || ''), vip = cgEsc(data.vip || '');
            const pr = cgEsc(data.priority || ''), adv = cgEsc(data.adv || '');
            const b = 'configure vrrp vlan ' + vn + ' vrid ' + id;
            let c = '# ========================================\n# Extreme EXOS — VRRP\n# ========================================\n\n';
            c += 'create vrrp vlan ' + vn + ' vrid ' + id + '\n';
            if (data.v3) c += b + ' version v3\n';
            c += b + ' add ' + vip + '\n';
            if (pr) c += b + ' priority ' + pr + '\n';
            c += b + (data.preempt ? ' preempt' : ' dont-preempt') + '\n';
            if (adv) c += b + ' advertisement-interval ' + adv + '\n';
            c += 'enable vrrp vlan ' + vn + ' vrid ' + id + '\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show vrrp\n# show vrrp vlan ' + vn + '\n';
            return c;
        });
    }
};

// ── Extreme EXOS: Link Aggregation (LAG) ──────────────────────────────────────
// Sözdizimi: enable sharing <port> grouping <port_list> {algorithm address-based …} {lacp},
//   configure sharing <port> lacp activity-mode, configure sharing <port> lacp timeout —
//   _EXOS_CR + r_enable-sharing-grouping.shtml, r_configure-sharing-lacp-activitymode.shtml,
//   r_configure-sharing-lacp-timeout.shtml
//   https://documentation.extremenetworks.com/exos_32.6.3/GUID-F5744EA0-C4D9-4DE8-ACCE-96D3D1EB33A6.shtml
ExtremeNet.lag = {
    label: 'Link Aggregation',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Extreme EXOS — Link Aggregation (sharing)',
                desc: 'Birden çok portu tek mantıksal port yapar. <b>Master port</b> (listedeki ilk port) LAG\'in kimliğidir; VLAN ve diğer ayarlar bu porta yapılır.'
            },
            sections: [
                {
                    title: 'LAG Üyeleri',
                    icon: 'fas fa-ethernet',
                    warn: 'LAG kurulduktan sonra VLAN üyeliği yalnız <b>master port</b> üzerinden yapılır; üye portları VLAN\'a ayrıca eklemeyin.',
                    fields: [
                        { name: 'master', why: "Master port LAG'in kimliğidir ve üye listesinde de yer almalıdır. VLAN, STP ve diğer tüm port komutları bu numarayla yazılır.", label: 'Master Port', type: 'text', required: true, placeholder: '49', hint: 'ör. 49 veya stack\'te 1:49' },
                        { name: 'members', why: "Üye portlar aynı hızda olmalı. Karşı uçla aynı fiziksel bağlantılar seçilmezse LACP bazı üyeleri gruba almaz ve kapasite fark edilmeden düşer.", label: 'Üye Portlar (master dahil)', type: 'text', required: true, placeholder: '49-50', hint: 'ör. 49-50 veya 1:49,2:49' },
                        { name: 'mode', why: "LACP karşı uçla müzakere eder ve kablolama hatasında üyeyi gruptan çıkarır. Statik LAG'da bu koruma yoktur; yanlış kablolama döngü veya kara delik yaratır.", label: 'Mod', type: 'select', options: [
                            { value: 'lacp', label: 'LACP (önerilir)', selected: true },
                            { value: 'static', label: 'Statik (müzakeresiz)' }
                        ]},
                        { name: 'algo', why: "L3_L4, akışları IP ve port bilgisine göre dağıtır; tek bir sunucu-sunucu trafiğinde bile üyeler arasında daha dengeli yük sağlar. L2 yalnız MAC'e bakar.", label: 'Yük Dağıtım Algoritması', type: 'select', options: [
                            { value: '', label: '(varsayılan — L2)' },
                            { value: 'L2', label: 'address-based L2' },
                            { value: 'L3', label: 'address-based L3' },
                            { value: 'L3_L4', label: 'address-based L3_L4', selected: true }
                        ]},
                        { name: 'passive', why: "Passive modda switch LACP başlatmaz, yalnız cevap verir. İki uç da passive ise LAG hiç kurulmaz.", label: 'LACP passive', type: 'checkbox', checked: false },
                        { name: 'fast', why: "Short timeout ile arızalı üye 3 sn içinde gruptan çıkarılır (varsayılan long: 90 sn). Karşı uç da short beklemelidir.", label: 'LACP timeout short', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const m = cgEsc(String(data.master || '').trim()), mem = _otherExosPorts(data.members);
            const algo = cgEsc(data.algo || ''), lacp = data.mode !== 'static';
            let c = '# ========================================\n# Extreme EXOS — Link Aggregation\n# ========================================\n\n';
            c += 'enable sharing ' + m + ' grouping ' + mem + (algo ? ' algorithm address-based ' + algo : '') + (lacp ? ' lacp' : '') + '\n';
            if (lacp && data.passive) c += 'configure sharing ' + m + ' lacp activity-mode passive\n';
            if (lacp && data.fast) c += 'configure sharing ' + m + ' lacp timeout short\n';
            c += '\nsave configuration\n\n';
            c += '# Doğrulama:\n# show ports sharing\n';
            if (lacp) c += '# show lacp lag ' + m + '\n';
            return c;
        });
    }
};

// ── Extreme EXOS: Spanning Tree ───────────────────────────────────────────────
// Sözdizimi: create stpd, configure stpd … tag, configure stpd … mode dot1d|dot1w,
//   configure stpd … add vlan … ports all, configure stpd … priority,
//   configure stpd … ports link-type edge … edge-safeguard enable {bpdu-restrict}, enable stpd —
//   _EXOS_CR + r_create-stpd.shtml, r_configure-stpd-tag.shtml, r_configure-stpd-mode.shtml,
//   r_configure-stpd-add-vlan.shtml, r_configure-stpd-priority.shtml,
//   r_configure-stpd-ports-linktype.shtml, r_enable-stpd.shtml
ExtremeNet.stp = {
    label: 'Spanning Tree',
    init(container) {
        const prio = [0, 4096, 8192, 12288, 16384, 20480, 24576, 28672, 32768, 36864, 40960, 45056, 49152, 53248, 57344, 61440]
            .map(p => ({ value: String(p), label: String(p) + (p === 4096 ? ' — kök (root) adayı' : p === 32768 ? ' — varsayılan' : ''), selected: p === 32768 }));
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'Extreme EXOS — Spanning Tree (STPD)',
                desc: 'EXOS STP\'yi <b>STP domain</b> (STPD) olarak yönetir. Fabrika çıkışında <code>s0</code> domain\'i vardır ama <b>kapalıdır</b>.'
            },
            sections: [
                {
                    title: 'STP Domain',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'stpd', why: "Varsayılan s0 domain'i genellikle yeterlidir. Yeni domain açılırsa carrier VLAN tag'i verilmelidir; aksi halde domain etkinleşmez.", label: 'STPD Adı', type: 'text', validate: 'objname', required: true, placeholder: 's0', hint: 'Varsayılan: s0' },
                        { name: 'new_stpd', why: "Yalnız s0 dışında yeni bir domain kullanacaksanız işaretleyin; mevcut s0 için create komutu hata verir.", label: 'Yeni domain oluştur (create stpd)', type: 'checkbox', checked: false },
                        { name: 'stpd_tag', why: "Yeni domain'in (s0 dışında bir ad) StpdID'si, domain'e ait carrier VLAN'ın tag'idir; BPDU'lar bu VLAN'da taşınır.", label: 'Carrier VLAN Tag', type: 'text', validate: 'vlan', requiredIf: { field: 'new_stpd', checked: true }, placeholder: '100', hint: 'Yeni domain için zorunlu' },
                        { name: 'mode', why: "dot1w (RSTP) saniyeler içinde yakınsar; dot1d (klasik STP) 30-50 sn kesintiye yol açar. Komşu switch'ler de uyumlu modda olmalı.", label: 'Mod', type: 'select', options: [
                            { value: 'dot1w', label: 'dot1w — RSTP (önerilir)', selected: true },
                            { value: 'dot1d', label: 'dot1d — klasik STP' }
                        ]},
                        { name: 'priority', why: "En düşük öncelik kök olur. Çekirdek switch'e düşük öncelik verilmezse kök en düşük MAC'li rastgele bir erişim switch'i olabilir.", label: 'Bridge Priority', type: 'select', options: prio },
                        { name: 'vlans', why: "STP yalnız domain'e eklenen VLAN'larda çalışır; eklenmeyen VLAN'lardaki döngüler engellenmez.", label: 'Korunacak VLAN Adları', type: 'text', required: true, placeholder: 'SERVERS,USERS', hint: 'Virgülle ayrılmış VLAN adları (tüm portlarıyla eklenir)' }
                    ]
                },
                {
                    title: 'Edge Portlar',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'edge_ports', why: "Edge portlar anında forwarding'e geçer. Edge-safeguard, portta BPDU görülürse onu normal STP portuna çevirerek döngüyü engeller.", label: 'Edge Portlar', type: 'text', placeholder: '1-24', hint: 'Opsiyonel — uç cihaz portları' },
                        { name: 'bpdu_restrict', why: "BPDU restrict, edge porta BPDU gelince portu tamamen kapatır (BPDU Guard eşdeğeri). Yanlışlıkla takılan switch'ler ağı etkilemez ama port elle açılana kadar kapalı kalır.", label: 'BPDU gelirse portu kapat (bpdu-restrict)', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sd = cgEsc(data.stpd || ''), tag = cgEsc(data.stpd_tag || ''), mode = cgEsc(data.mode || '');
            const pr = cgEsc(data.priority || ''), edges = _otherExosPorts(data.edge_ports);
            const vlans = String(data.vlans || '').split(/[,\s]+/).map(v => cgEsc(v.trim())).filter(Boolean);
            let c = '# ========================================\n# Extreme EXOS — Spanning Tree\n# ========================================\n\n';
            if (data.new_stpd && sd.toLowerCase() === 's0') {
                c += '# UYARI: s0 fabrika domain\'idir, yeniden oluşturulmaz — create/tag satırları atlandı\n';
            } else if (data.new_stpd) {
                c += 'create stpd ' + sd + '\n';
                if (tag) c += 'configure stpd ' + sd + ' tag ' + tag + '\n';
            }
            c += 'configure stpd ' + sd + ' mode ' + mode + '\n';
            vlans.forEach(v => { c += 'configure stpd ' + sd + ' add vlan ' + v + ' ports all\n'; });
            if (pr) c += 'configure stpd ' + sd + ' priority ' + pr + '\n';
            if (edges) c += 'configure stpd ' + sd + ' ports link-type edge ' + edges + ' edge-safeguard enable' + (data.bpdu_restrict ? ' bpdu-restrict' : '') + '\n';
            c += 'enable stpd ' + sd + '\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show stpd ' + sd + '\n# show stpd ' + sd + ' ports\n';
            return c;
        });
    }
};

// ── Extreme EXOS: SNMPv3 ──────────────────────────────────────────────────────
// Sözdizimi: configure snmp syslocation|syscontact, configure snmpv3 add user … authentication …
//   privacy …, configure snmpv3 add group … user …, configure snmpv3 add access … sec-level priv
//   read-view … notify-view …, configure snmpv3 add target-params / target-addr / notify,
//   disable snmp access snmp-v1v2c —
//   _EXOS_CR + r_configure-snmp-syslocation.shtml, r_configure-snmp-syscontact.shtml,
//   r_configure-snmpv3-add-user.shtml, r_configure-snmpv3-add-group-user.shtml,
//   r_configure-snmpv3-add-access.shtml, r_configure-snmpv3-add-targetparams.shtml,
//   r_configure-snmpv3-add-targetaddr.shtml, r_configure-snmpv3-add-notify.shtml, r_disable-snmp-access.shtml
ExtremeNet.snmp = {
    label: 'SNMPv3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'Extreme EXOS — SNMPv3',
                desc: 'SNMPv3 kullanıcı, grup ve erişim görünümü; opsiyonel trap hedefi ve v1/v2c erişiminin kapatılması.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Sistem Bilgisi',
                    icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'location', why: "sysLocation NMS'te cihazın fiziksel yerini gösterir; arıza anında sahaya doğru kişinin gönderilmesini sağlar.", label: 'Konum (sysLocation)', type: 'text', placeholder: 'DC1-Kabin05', hint: 'Opsiyonel' },
                        { name: 'contact', why: "sysContact, cihazdan sorumlu ekibi belirtir.", label: 'İletişim (sysContact)', type: 'text', placeholder: 'noc-ekibi', hint: 'Opsiyonel' }
                    ]
                },
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'user', why: "Kullanıcı adı NMS tanımıyla birebir aynı olmalı; uyuşmazlıkta sorgular sessizce yanıtsız kalır.", label: 'Kullanıcı Adı', type: 'text', validate: 'objname', required: true, placeholder: 'nmsuser', hint: 'USM kullanıcısı' },
                        { name: 'group', why: "Grup, kullanıcının hangi MIB görünümünü okuyabileceğini belirler.", label: 'Grup Adı', type: 'text', validate: 'objname', required: true, placeholder: 'NMS_RO', hint: 'Salt okunur izleme grubu' },
                        { name: 'auth', why: "MD5 artık zayıf kabul edilir; SHA seçin. Protokol NMS ile aynı olmalı.", label: 'Auth Protokolü', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5' }
                        ]},
                        { name: 'auth_pass', why: "Auth parolası en az 8 karakter olmalı ve NMS ile eşleşmelidir.", label: 'Auth Parolası', type: 'text', required: true, placeholder: 'AuthPass123', hint: 'En az 8 karakter' },
                        { name: 'priv', why: "Privacy, SNMP verisini şifreler. DES kırılabilir kabul edilir; AES seçin.", label: 'Privacy Protokolü', type: 'select', options: [
                            { value: 'aes', label: 'AES-128', selected: true },
                            { value: 'aes 256', label: 'AES-256' },
                            { value: 'des', label: 'DES (eski)' }
                        ]},
                        { name: 'priv_pass', why: "Privacy parolası tanımlanmazsa trafik şifresiz gider; bu yüzden zorunludur.", label: 'Privacy Parolası', type: 'text', required: true, placeholder: 'PrivPass456', hint: 'En az 8 karakter' }
                    ]
                },
                {
                    title: 'Trap Hedefi ve Sıkılaştırma',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', why: "Trap'ler link düşmesi gibi olayları anında NMS'e bildirir; tanımlanmazsa sorun bir sonraki sorgu döngüsüne kadar fark edilmez.", label: 'Trap Hedefi IP', type: 'text', validate: 'ip', placeholder: '10.0.0.60', hint: 'Opsiyonel — SNMPv3 trap alıcısı' },
                        { name: 'trap_vr', why: "Trap, NMS'e erişilen sanal yönlendirici üzerinden gönderilmelidir; yönetim portu kullanılıyorsa VR-Mgmt.", label: 'Trap VR', type: 'select', options: _EXOS_VR_OPTS() },
                        { name: 'no_v12', why: "SNMP v1/v2c community düz metin taşır. v3'e geçtikten sonra kapatılmazsa varsayılan community'ler cihaz bilgisine erişimi açık bırakır.", label: 'SNMP v1/v2c erişimini kapat', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const loc = cgEsc(String(data.location || '').replace(/\s+/g, '_')), con = cgEsc(String(data.contact || '').replace(/\s+/g, '_'));
            const u = cgEsc(data.user || ''), g = cgEsc(data.group || ''), auth = cgEsc(data.auth || '');
            const ap = cgEsc(data.auth_pass || ''), priv = cgEsc(data.priv || ''), pp = cgEsc(data.priv_pass || '');
            const th = cgEsc(data.trap_host || ''), tvr = cgEsc(data.trap_vr || '');
            let c = '# ========================================\n# Extreme EXOS — SNMPv3\n# ========================================\n\n';
            if (loc) c += 'configure snmp syslocation ' + loc + '\n';
            if (con) c += 'configure snmp syscontact ' + con + '\n';
            if (loc || con) c += '\n';
            c += '# Kullanıcı, grup ve erişim (salt okunur)\n';
            c += 'configure snmpv3 add user ' + u + ' authentication ' + auth + ' ' + ap + ' privacy ' + priv + ' ' + pp + '\n';
            c += 'configure snmpv3 add group ' + g + ' user ' + u + ' sec-model usm\n';
            c += 'configure snmpv3 add access ' + g + ' sec-model usm sec-level priv read-view defaultUserView notify-view defaultNotifyView\n\n';
            if (th) {
                c += '# SNMPv3 trap hedefi\n';
                c += 'configure snmpv3 add target-params NMS_PARAMS user ' + u + ' mp-model snmpv3 sec-model usm sec-level priv\n';
                c += 'configure snmpv3 add target-addr NMS_TARGET param NMS_PARAMS ipaddress ' + th + (tvr ? ' vr ' + tvr : '') + ' tag-list NMS_TAG\n';
                c += 'configure snmpv3 add notify NMS_NOTIFY tag NMS_TAG\n\n';
            }
            if (data.no_v12) c += '# v1/v2c erişimini kapat\ndisable snmp access snmp-v1v2c\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show snmpv3 user\n# show snmpv3 access\n';
            if (th) c += '# show snmpv3 target-addr\n';
            return c;
        });
    }
};

// ── Extreme EXOS: Syslog ──────────────────────────────────────────────────────
// Sözdizimi: configure syslog add <ip> {vr} <facility>, configure log target syslog … severity …,
//   configure log target syslog … from <src>, enable log target syslog …, enable syslog —
//   _EXOS_CR + r_configure-syslog-add.shtml, r_configure-log-target-severity.shtml,
//   r_configure-log-target-syslog.shtml, r_enable-log-target.shtml, r_enable-syslog.shtml
//   Önem seviyeleri: https://documentation.extremenetworks.com/exos_31.5/GUID-D3F3B734-61C5-4F78-A6C6-198B56174DE2.shtml
ExtremeNet.syslog = {
    label: 'Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Extreme EXOS — Syslog',
                desc: 'Uzak syslog hedefi, önem seviyesi ve kaynak IP. EXOS\'ta her syslog hedefi <b>IP + VR + facility</b> üçlüsüyle tanımlanır.'
            },
            sections: [
                {
                    title: 'Syslog Hedefi',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'server', why: "Yerel log tamponu sınırlıdır ve yeniden başlatmada kaybolur; uzak syslog olmadan arıza sonrası inceleme yapılamaz.", label: 'Syslog Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'UDP 514' },
                        { name: 'vr', why: "Sunucuya erişilen sanal yönlendirici. Yanlış VR seçilirse paketler hiç çıkmaz; hata mesajı da üretilmez.", label: 'VR', type: 'select', options: _EXOS_VR_OPTS() },
                        { name: 'facility', why: "Facility, syslog sunucusunda log'ların hangi dosyaya/kurala düşeceğini belirler. Sonraki tüm komutlarda aynı facility kullanılmalıdır; hedef IP+VR+facility ile tanımlanır.", label: 'Facility', type: 'select', options: ['local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'].map(f => ({ value: f, label: f, selected: f === 'local7' })) },
                        { name: 'severity', why: "Seçilen seviye ve daha önemlileri gönderilir. EXOS varsayılanı syslog için debug-data'dır; bu, sunucuyu gereksiz log ile doldurur.", label: 'Minimum Önem', type: 'select', options: [
                            { value: 'critical', label: 'critical' },
                            { value: 'error', label: 'error' },
                            { value: 'warning', label: 'warning', selected: true },
                            { value: 'notice', label: 'notice' },
                            { value: 'info', label: 'info' }
                        ]},
                        { name: 'src', why: "Kaynak IP sabitlenmezse log'lar çıkış arayüzüne göre farklı adreslerden gelir ve sunucudaki filtreler cihazı tanımaz.", label: 'Kaynak IP', type: 'text', validate: 'ip', placeholder: '10.0.0.10', hint: 'Opsiyonel — cihazda tanımlı bir adres' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const ip = cgEsc(data.server || ''), vr = cgEsc(data.vr || ''), fac = cgEsc(data.facility || '');
            const sev = cgEsc(data.severity || ''), src = cgEsc(data.src || '');
            const tgt = ip + (vr ? ' vr ' + vr : '') + ' ' + fac;
            let c = '# ========================================\n# Extreme EXOS — Syslog\n# ========================================\n\n';
            c += 'configure syslog add ' + tgt + '\n';
            if (sev) c += 'configure log target syslog ' + tgt + ' severity ' + sev + '\n';
            if (src) c += 'configure log target syslog ' + tgt + ' from ' + src + '\n';
            c += 'enable log target syslog ' + tgt + '\n';
            c += 'enable syslog\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show log configuration target\n';
            return c;
        });
    }
};

// ── Extreme EXOS: NTP / SNTP ──────────────────────────────────────────────────
// Sözdizimi: configure sntp-client primary|secondary <ip> {vr}, enable sntp-client,
//   configure ntp server add <ip>, configure ntp vr, enable ntp,
//   configure timezone {name} <GMT_offset> noautodst —
//   _EXOS_CR + r_configure-sntpclient.shtml, r_enable-sntpclient.shtml,
//   r_configure-ntp-serverpeer-add.shtml, r_configure-ntp-vr.shtml, r_enable-ntp.shtml, r_configure-timezone.shtml
ExtremeNet.ntp = {
    label: 'NTP / SNTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'Extreme EXOS — Zaman Senkronizasyonu',
                desc: 'EXOS iki istemci sunar: basit <b>SNTP istemcisi</b> (birincil/ikincil sunucu) veya tam <b>NTP</b>. İkisini birlikte kullanmayın.'
            },
            configTypes: [
                { id: 'sntp', label: 'SNTP İstemcisi', icon: 'fas fa-clock', desc: 'Birincil + ikincil sunucu; çoğu erişim switch\'i için yeterli', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'ntp', label: 'NTP', icon: 'fas fa-server', desc: 'Tam NTP istemcisi (çoklu sunucu, kimlik doğrulama desteği)' }
            ],
            sections: [
                {
                    title: 'Sunucular',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'srv1', why: "Saat kayması log korelasyonunu ve sertifika doğrulamasını bozar; arıza analizinde olay sırası yanlış görünür.", label: 'Birincil Sunucu', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'NTP sunucu IP' },
                        { name: 'srv2', why: "Tek sunucu tek hata noktasıdır; ikinci kaynak olmadan sunucu bozulduğunda cihaz yanlış saate kaymaya başlar.", label: 'İkincil Sunucu', type: 'text', validate: 'ip', placeholder: '10.0.0.2', hint: 'Opsiyonel' },
                        { name: 'vr', why: "NTP paketleri sunucuya erişilen VR üzerinden gitmeli. NTP modunda VR değiştirmek için NTP'nin önce kapalı olması gerekir; bu yüzden VR, enable'dan önce yazılır.", label: 'VR', type: 'select', options: _EXOS_VR_OPTS() }
                    ]
                },
                {
                    title: 'Saat Dilimi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'tz_offset', why: "EXOS saat dilimini GMT'den <b>dakika</b> farkı olarak alır (Türkiye: +180). Yanlış fark, log'ların saatlerce kaymış görünmesine yol açar.", label: 'GMT Farkı (dakika)', type: 'text', min: -720, max: 780, placeholder: '180', hint: 'Opsiyonel — ör. 180 = UTC+3' },
                        { name: 'tz_name', why: "Ad yalnız görüntü içindir (show switch çıktısında görünür).", label: 'Saat Dilimi Adı', type: 'text', validate: 'objname', placeholder: 'TRT', hint: 'Opsiyonel' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'sntp';
            const s1 = cgEsc(data.srv1 || ''), s2 = cgEsc(data.srv2 || ''), vr = cgEsc(data.vr || '');
            const off = cgEsc(data.tz_offset || ''), tzn = cgEsc(data.tz_name || '');
            const vrs = vr ? ' vr ' + vr : '';
            let c = '# ========================================\n# Extreme EXOS — ' + (t === 'ntp' ? 'NTP' : 'SNTP') + '\n# ========================================\n\n';
            if (off) c += 'configure timezone ' + (tzn ? 'name ' + tzn + ' ' : '') + off + ' noautodst\n\n';
            if (t === 'ntp') {
                if (vr) c += 'configure ntp vr ' + vr + '\n';
                c += 'configure ntp server add ' + s1 + '\n';
                if (s2) c += 'configure ntp server add ' + s2 + '\n';
                c += 'enable ntp\n\n';
                c += 'save configuration\n\n# Doğrulama:\n# show ntp\n# show ntp association\n';
            } else {
                c += 'configure sntp-client primary ' + s1 + vrs + '\n';
                if (s2) c += 'configure sntp-client secondary ' + s2 + vrs + '\n';
                c += 'enable sntp-client\n\n';
                c += 'save configuration\n\n# Doğrulama:\n# show sntp-client\n# show switch\n';
            }
            return c;
        });
    }
};

// ── Extreme EXOS: Kullanıcı Hesapları / Yönetim Sıkılaştırma ──────────────────
// Sözdizimi: create account admin|user <name> <password>,
//   configure account all password-policy min-length | char-validation all-char-groups |
//   lockout-on-login-failures on | lockout-time-period, configure idletimeout, enable idletimeout,
//   disable telnet —
//   _EXOS_CR + r_create-account.shtml, r_configure-account-passwordpolicy-minlength.shtml,
//   r_configure-account-passwordpolicy-charvalidation.shtml,
//   r_configure-account-passwordpolicy-lockoutonloginfailures.shtml,
//   r_configure-account-password-policy-lockout-time-period.shtml,
//   r_configure-idletimeout.shtml, r_enable-idletimeout.shtml, r_disable-telnet.shtml
ExtremeNet.accounts = {
    label: 'Kullanıcı Hesapları',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Extreme EXOS — Kullanıcı Hesapları ve Parola Politikası',
                desc: 'Yönetici/izleme hesabı, parola politikası, hatalı girişte kilitleme, oturum zaman aşımı ve Telnet\'in kapatılması.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Hesap',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'level', why: "admin hesabı yazma yetkisine sahiptir; izleme personeline 'user' (salt okunur) verin. Fabrika 'admin' hesabının parolası da mutlaka değiştirilmelidir.", label: 'Seviye', type: 'select', options: [
                            { value: 'admin', label: 'admin — okuma/yazma', selected: true },
                            { value: 'user', label: 'user — salt okunur' }
                        ]},
                        { name: 'name', why: "Kişiye özel hesap, kimin hangi değişikliği yaptığının log'da görünmesini sağlar; ortak hesap kullanımı denetimi anlamsızlaştırır.", label: 'Hesap Adı', type: 'text', validate: 'objname', required: true, placeholder: 'netadmin01', hint: 'Harfle başlar' },
                        { name: 'pass', why: "Parola aşağıdaki politikaya uymalı; politika sonradan sıkılaştırılırsa mevcut parolalar bir sonraki değişiklikte kontrol edilir.", label: 'Parola', type: 'text', required: true, placeholder: 'Str0ng!Passw0rd', hint: 'Düz metin; cihaz hash\'leyerek saklar' }
                    ]
                },
                {
                    title: 'Parola Politikası (tüm hesaplar)',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'min_len', why: "Kısa parolalar kaba kuvvet saldırısına dayanmaz; en az 12 karakter önerilir.", label: 'Minimum Uzunluk', type: 'text', min: 1, max: 32, placeholder: '12', hint: 'Opsiyonel — 1-32' },
                        { name: 'complex', why: "Büyük/küçük harf, rakam ve sembol zorunluluğu sözlük saldırılarını etkisizleştirir.", label: 'Tüm karakter gruplarını zorunlu kıl', type: 'checkbox', checked: true },
                        { name: 'lockout', why: "Ardışık 3 hatalı girişte hesap kilitlenir. Konsol erişimi olmayan uzak sahalarda kilitlenme süresi de tanımlayın, yoksa hesap elle açılana kadar kilitli kalır.", label: 'Hatalı girişte kilitle', type: 'checkbox', checked: true },
                        { name: 'lock_min', why: "Kilit süresi (dakika). Tanımlanmazsa kilit yalnız yönetici tarafından kaldırılabilir.", label: 'Kilit Süresi (dakika)', type: 'text', min: 1, max: 60, placeholder: '15', hint: 'Opsiyonel — 1-60' }
                    ]
                },
                {
                    title: 'Oturum Güvenliği',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'idle', why: "Boşta kalan oturum, masadan kalkan yöneticinin yetkileriyle açık kalır. EXOS varsayılanı 20 dakikadır.", label: 'Boşta Zaman Aşımı (dakika)', type: 'text', min: 1, max: 240, placeholder: '10', hint: 'Opsiyonel — 1-240' },
                        { name: 'no_telnet', why: "Telnet parolaları düz metin taşır ve EXOS'ta varsayılan olarak açıktır. SSH2 çalıştığından emin olmadan kapatırsanız uzaktan erişim kesilir.", label: 'Telnet\'i kapat', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const lvl = cgEsc(data.level || ''), nm = cgEsc(data.name || ''), pw = cgEsc(data.pass || '');
            const ml = cgEsc(data.min_len || ''), lm = cgEsc(data.lock_min || ''), idle = cgEsc(data.idle || '');
            let c = '# ========================================\n# Extreme EXOS — Kullanıcı Hesapları\n# ========================================\n\n';
            if (ml || data.complex || data.lockout || lm) {
                c += '# Parola politikası (tüm hesaplar)\n';
                if (ml) c += 'configure account all password-policy min-length ' + ml + '\n';
                if (data.complex) c += 'configure account all password-policy char-validation all-char-groups\n';
                if (data.lockout) c += 'configure account all password-policy lockout-on-login-failures on\n';
                if (lm) c += 'configure account all password-policy lockout-time-period ' + lm + '\n';
                c += '\n';
            }
            c += '# Hesap\ncreate account ' + lvl + ' ' + nm + ' ' + pw + '\n\n';
            if (idle) c += 'configure idletimeout ' + idle + '\nenable idletimeout\n\n';
            if (data.no_telnet) c += '# UYARI: SSH2 erişimini test etmeden Telnet\'i kapatmayın\ndisable telnet\n\n';
            c += 'save configuration\n\n';
            c += '# Doğrulama:\n# show accounts\n# show accounts password-policy\n# show management\n';
            return c;
        });
    }
};
