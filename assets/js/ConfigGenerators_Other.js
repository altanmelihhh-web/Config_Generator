'use strict';

const Dell = {};
const ExtremeNet = {};

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
                        { name: 'subnet', why: "Maske karşı uçla birebir aynı olmalıdır; farklı maskeler aynı fiziksel segmentteki hostların bir kısmını uzak ağ saydırır ve bu cihazlar sessizce erişilemez hâle gelir.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Noktalı ondalık subnet maskesi' },
                        { name: 'gw', why: "Varsayılan rota bu adrese kurulur. Gateway doğrudan bağlı bir subnet içinde değilse OS10 rotayı aktif etmez ve cihaz hiçbir uzak ağa ulaşamaz.", label: 'Default Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.254', hint: 'Varsayılan ağ geçidi IP adresi' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "Port aralığı yazarken OS10 söz dizimine uyun (<code>ethernet 1/1/1-1/1/10</code>); yanlışlıkla uplink dâhil edilirse trunk access'e döner ve uzaktan yönetim anında kopar.", label: 'LAN Arayüzü (port aralığı)', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1/1-1/1/4', hint: 'Access VLAN atanacak port aralığı' },
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
            c += 'interface vlan ' + vlan + '\n ip address ' + wanIp + ' ' + subnet + '\n no shutdown\n!\n\n';
            c += '# Default Gateway\nip route 0.0.0.0 0.0.0.0 ' + gw + '\n\n';
            c += '# WAN Interface\ninterface ' + wanIface + '\n ip address ' + wanIp + ' ' + subnet + '\n no shutdown\n!\n\n';
            c += '# LAN Port — VLAN Access\ninterface range ' + iface + '\n switchport mode access\n switchport access vlan ' + vlan + '\n no shutdown\n!\n\n';
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
            c += '# Hostname\nset system name "' + hn + '"\n\n';
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
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
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
            return c;
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
            c += ' seq ' + seqStart + ' ' + action + ' ' + proto + ' ' + src + ' ' + dst + '\n';
            c += ' seq ' + (parseInt(seqStart) + 10) + ' deny ip any any\n!\n\n';
            if (applyIf) {
                c += 'interface ' + applyIf + '\n';
                c += ' ip access-group ' + aclName + ' ' + direction + '\n!\n\n';
            }
            c += 'end\n\n';
            c += '# Doğrulama:\n# show ip access-lists ' + aclName + '\n# show running-configuration access-list\n';
            return c;
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
                desc: 'Merkezi log sunucusuna syslog iletimi. Severity seviyesi, facility ve kaynak arayüz yapılandırması.'
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
                        ]},
                        { name: 'facility', why: "Facility, syslog sunucusunda log'ların hangi dosyaya ve kurala düşeceğini belirler; yanlış seçim log'ların yazılmış ama <b>aranan yerde görünmüyor</b> olmasına neden olur.", label: 'Facility', type: 'select', options: [
                            { value: 'local0', label: 'local0' },
                            { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' },
                            { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4', selected: true },
                            { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' },
                            { value: 'local7', label: 'local7' }
                        ]},
                        { name: 'src_iface', why: "Kaynak arayüz sabitlenmezse aynı cihaz syslog sunucusunda farklı IP'lerle birden fazla host gibi görünür; korelasyon ve sunucu tarafındaki filtreler bozulur.", label: 'Source Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'ManagementEthernet1/1/1', hint: 'Syslog paketleri için kaynak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const syslogServer = cgEsc(data.syslog_server || ''), severity = cgEsc(data.severity || 'warnings');
            const facility = cgEsc(data.facility || 'local4'), srcIface = cgEsc(data.src_iface || '');
            let c = '# ========================================\n# Dell OS10 — Syslog\n# ========================================\n\n';
            c += 'configure terminal\n\n';
            c += 'logging server ' + syslogServer + '\n';
            c += 'logging level ' + severity + '\n';
            c += 'logging facility ' + facility + '\n';
            if (srcIface) c += 'logging source-interface ' + srcIface + '\n';
            c += 'logging on\n\n';
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
