'use strict';

const HuaweiCE = {};

// ── Huawei CloudEngine: VLAN + Interface ──────────────────────────────────────
HuaweiCE.vlan = {
    label: 'VLAN + Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'VLAN + Interface (CloudEngine)',
                desc: 'Huawei CloudEngine switch\'inde VLAN oluştur, SVI (Layer-3 Vlanif) tanımla ve access/trunk portları ata. Data center leaf/spine mimarisinde temel yapı taşı.'
            },
            sections: [
                {
                    title: 'VLAN Kimliği',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'vlan_id', why: "CloudEngine üzerinde VLAN önce <code>vlan X</code> ile oluşturulmadan porta atanamaz. M-LAG veya stack ortamında VLAN her iki peer cihazda da tanımlı olmalıdır; tek tarafta eksik VLAN, yük paylaşımı sırasında trafiğin yarısının sessizce düşmesine yol açar.", label: 'VLAN ID', type: 'number', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası', min: 1, max: 4094 },
                        { name: 'vlan_desc', why: "Açıklama boşluk içeremez ve <code>display vlan</code> çıktısındaki tek tanımlayıcıdır. Veri merkezinde yüzlerce VLAN arasında etiketsiz kalanlar, temizlik çalışmalarında yanlışlıkla silinen VLANlar haline gelir.", label: 'VLAN Açıklama', type: 'text', optional: true, placeholder: 'DATA_VLAN', hint: 'VLAN için açıklayıcı isim (boşluksuz)' }
                    ]
                },
                {
                    title: 'SVI (Layer-3 Arayüz)',
                    icon: 'fas fa-sitemap',
                    info: 'SVI tanımlanırsa Vlanif arayüzü oluşturulur ve inter-VLAN routing etkinleşir.',
                    fields: [
                        { name: 'svi_ip', why: "SVI (Vlanif) adresi bu VLAN için gateway görevi görür; M-LAG çiftinde aynı IPyi iki cihaza vermek yerine VRRP veya anycast gateway kullanılmalıdır, aksi halde ARP tablosu sürekli çakışır. Boş bırakılırsa VLAN sadece L2 kalır.", label: 'SVI IP / Mask', type: 'text', optional: true, placeholder: '10.1.100.1 255.255.255.0', hint: 'Örn: 10.1.100.1 255.255.255.0 — boş bırakılırsa SVI oluşturulmaz' }
                    ]
                },
                {
                    title: 'Port Atamaları',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'access_ports', why: "Access portta <code>port default vlan</code> ile PVID atanır. Port daha önce trunk yapıldıysa link-type değişimi izinli VLAN listesini sıfırlar; sunucu bağlantısında yanlış PVID trafiğin yanlış broadcast domainine düşmesine ve sorunun yalnızca DHCP seviyesinde görünmesine neden olur.", label: 'Access Port(lar)', type: 'text', optional: true, placeholder: '10GE1/0/1, 10GE1/0/2', hint: 'Virgülle ayırın — bu VLAN\'a access modda bağlanacak portlar' },
                        { name: 'trunk_ports', why: "Trunk portta bu VLANa <code>port trunk allow-pass vlan</code> ile izin verilmezse tag işaretli trafik hatasız şekilde düşer. Ayrıca PVID VLANının da listeye dahil edilmesi gerekir, yoksa etiketsiz yönetim trafiği kaybolur.", label: 'Trunk Port(lar)', type: 'text', optional: true, placeholder: '40GE1/0/1', hint: 'Virgülle ayırın — bu VLAN\'a trunk modda izin verilecek portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vlanId = cgEsc(data.vlan_id || '');
            const vlanDesc = cgEsc(data.vlan_desc || '');
            const sviIp = cgEsc(data.svi_ip || '');
            const accessPorts = (data.access_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const trunkPorts = (data.trunk_ports || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            let c = '# ========================================\n# Huawei CloudEngine — VLAN + Interface\n# ========================================\n\n';
            c += 'vlan ' + vlanId + '\n';
            if (vlanDesc) c += ' description ' + vlanDesc + '\n';
            c += '#\n\n';
            if (sviIp) {
                c += 'interface Vlanif' + vlanId + '\n';
                c += ' ip address ' + sviIp + '\n#\n\n';
            }
            accessPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' port link-type access\n';
                c += ' port default vlan ' + vlanId + '\n#\n';
            });
            if (accessPorts.length) c += '\n';
            trunkPorts.forEach(p => {
                c += 'interface ' + p + '\n';
                c += ' port link-type trunk\n';
                c += ' port trunk allow-pass vlan ' + vlanId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display vlan ' + vlanId + '\n# display interface Vlanif' + vlanId + '\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: OSPF ──────────────────────────────────────────────────
HuaweiCE.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (CloudEngine)',
                desc: 'Huawei CloudEngine\'de OSPF yapılandırması — process ID, router-id, area ve network bildirimi. Link-state routing protokolü, büyük data center ağlarında yaygın kullanılır.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'proc_id', why: "Process ID yereldir, komşuyla aynı olması gerekmez; ancak aynı cihazda birden fazla süreç varken network bildirimini yanlış sürece yazmak rotaların hiç duyurulmamasına yol açar. Underlay tasarımında VXLAN VTEP adresleri mutlaka bu sürece dahil edilmelidir.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası (1–65535)', tooltip: 'Aynı cihazda birden fazla OSPF süreci çalıştırılabilir' },
                        { name: 'router_id', why: "Router ID alan içinde benzersiz olmalı ve tercihen /32 Loopback olmalıdır. Çakışma komşuluğun kurulup sürekli düşmesine neden olur; değiştirildiğinde <code>reset ospf process</code> yapılmadan etkili olmaz ve bu reset anlık trafik kesintisi yaratır.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'Genellikle Loopback0 IP adresi — benzersiz olmalı' },
                        { name: 'area', why: "Backbone alanı 0 olmalı ve tüm alanlar ona bağlanmalıdır. Spine-leaf underlay tasarımlarında genellikle tek alan (area 0) kullanılır; aynı link üzerindeki iki cihazın farklı area numarası kullanması komşuluğun hiç kurulmamasına yol açar.", label: 'Area', type: 'text', required: true, placeholder: '0', hint: 'Backbone için 0, diğer area\'lar için 0.0.0.X formatı' }
                    ]
                },
                {
                    title: 'Network ve Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'networks', why: "CloudEngine üzerinde network satırı <b>wildcard maske</b> ile yazılır (<code>0.0.0.255</code>). VTEP Loopback adresi bu bildirime dahil edilmezse VXLAN tüneli hiç kurulmaz ve arıza EVPN sorunu sanılarak boş yere yanlış yerde aranır.", label: 'Network(ler)', type: 'text', required: true, placeholder: '10.1.0.0/24, 10.2.0.0/24', hint: 'CIDR formatında, virgülle ayırın — OSPF\'e dahil edilecek subnetler' },
                        { name: 'lo_iface', why: "Loopback arayüzünde <code>silent-interface</code> kullanmak gereksiz Hello trafiğini engeller. Ancak yanlışlıkla bir underlay uplink arayüzünü silent yapmak o komşuluğu tamamen koparır ve fabric bir bacak kaybeder.", label: 'Loopback (silent)', type: 'text', optional: true, placeholder: 'LoopBack0', hint: 'OSPF Hello paketi gönderilmeyecek interface — genellikle Loopback' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const procId = cgEsc(data.proc_id || '');
            const routerId = cgEsc(data.router_id || '');
            const area = cgEsc(data.area || '');
            const networks = (data.networks || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const loIface = cgEsc(data.lo_iface || '');
            let c = '# ========================================\n# Huawei CloudEngine — OSPF\n# ========================================\n\n';
            c += 'ospf ' + procId + ' router-id ' + routerId + '\n';
            c += ' area ' + area + '\n';
            networks.forEach(net => c += '  network ' + net + '\n');
            if (loIface) c += ' silent-interface ' + loIface + '\n';
            c += '#\n\n# Doğrulama:\n# display ospf peer\n# display ospf routing\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: BGP ───────────────────────────────────────────────────
HuaweiCE.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (CloudEngine)',
                desc: 'Huawei CloudEngine BGP yapılandırması — peer group, eBGP/iBGP modu ve IPv4 unicast address-family. Data center spine\'larında ve WAN bağlantılarında kullanılır.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "Yerel AS numarası komşunun <code>peer as-number</code> tanımıyla birebir eşleşmelidir; uyuşmazsa oturum asla Established olmaz. Spine-leaf eBGP tasarımlarında her leaf için farklı AS kullanmak yaygındır ve bu durumda AS-path döngü koruması dikkatle yönetilmelidir.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: "BGP Router ID benzersiz olmalıdır; çakışma oturumun kurulup düzenli aralıklarla düşmesine neden olur. Loopback kullanmak fiziksel link değişimlerinde ID kaymasını engeller.", label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '1.1.1.1', hint: 'BGP router-id — genellikle Loopback0 IP' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "Komşu adresine ulaşan bir underlay rotası olmalıdır; EVPN peering Loopback üzerinden yapılıyorsa eBGP için <code>peer ebgp-max-hop 2</code> ve <code>peer connect-interface LoopBack</code> gerekir. Bunlar olmadan oturum hiç kurulmaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', why: "Karşı tarafın gerçek AS numarası yazılmalıdır; yanlış numara OPEN aşamasında reddedilir. Yerel AS ile aynıysa iBGP kuralları geçerli olur ve rotalar varsayılan olarak diğer iBGP komşularına aktarılmaz, bu yüzden route-reflector gerekir.", label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', why: "Peer group tüm üyelere aynı politikayı uygular; gruba yapılan bir değişiklik farkında olmadan onlarca leaf switchi etkiler. EVPN peer grubunda <code>l2vpn-family evpn</code> altında ayrıca <code>peer enable</code> yapılmazsa oturum kurulur ama EVPN rotaları hiç taşınmaz.", label: 'Peer Group Adı', type: 'text', required: true, placeholder: 'EBGP_PEERS', hint: 'Peer grubuna verilecek isim — peer yönetimini kolaylaştırır' },
                        { name: 'bgp_type', why: "iBGP ve eBGP davranışları farklıdır: iBGP rotaları diğer iBGP komşularına iletmez (route-reflector şarttır), eBGP ise next-hop değiştirir ve VXLAN tünel kurulumunu bozabilir. Yanlış tip seçimi oturumun sağlıklı görünüp rota taşımaması demektir.", label: 'BGP Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP — farklı AS ile peering', selected: true },
                            { value: 'ibgp', label: 'iBGP — aynı AS içi peering' }
                        ], hint: 'iBGP seçilirse connect-interface LoopBack0 eklenir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const localAs = cgEsc(data.local_as || '');
            const routerId = cgEsc(data.router_id || '');
            const peerIp = cgEsc(data.peer_ip || '');
            const peerAs = cgEsc(data.peer_as || '');
            const peerGroup = cgEsc(data.peer_group || '');
            const bgpType = cgEsc(data.bgp_type || 'ebgp');
            let c = '# ========================================\n# Huawei CloudEngine — BGP\n# ========================================\n\n';
            c += 'bgp ' + localAs + '\n';
            c += ' router-id ' + routerId + '\n';
            c += ' group ' + peerGroup + ' ' + bgpType + '\n';
            if (bgpType === 'ibgp') c += ' peer ' + peerGroup + ' connect-interface LoopBack0\n';
            c += ' peer ' + peerIp + ' as-number ' + peerAs + '\n';
            c += ' peer ' + peerIp + ' group ' + peerGroup + '\n';
            c += ' ipv4-family unicast\n';
            c += '  peer ' + peerGroup + ' enable\n#\n\n';
            c += '# Doğrulama:\n# display bgp peer\n# display bgp routing-table\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: VXLAN / EVPN ─────────────────────────────────────────
HuaweiCE.vxlan = {
    label: 'VXLAN / EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VXLAN / EVPN (CloudEngine)',
                desc: 'Huawei CloudEngine VXLAN overlay ağ yapılandırması — VTEP Loopback, bridge-domain, VLAN-VNI eşlemesi ve BGP EVPN control plane. Modern data center fabric mimarisinin temel bileşeni.'
            },
            configTypes: [
                { id: 'vxlan', label: 'VXLAN + EVPN', icon: 'fas fa-layer-group', desc: 'Tam VXLAN/EVPN yapılandırması — overlay + control plane',
                  badge: { text: 'Data Center', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VTEP ve VNI Ayarları',
                    icon: 'fas fa-server',
                    warn: 'VTEP Loopback IP\'si tüm leaf switch\'lerde benzersiz olmalı ve underlay routing ile erişilebilir olmalıdır.',
                    fields: [
                        { name: 'vni', why: "VNI, VXLAN kapsüllemesinde L2 segmentini tanımlar ve <b>tüm VTEPlerde aynı</b> olmalıdır. Bir leaf üzerinde farklı VNI kullanmak, sunucuların aynı VLANda görünüp birbirini hiç görememesine yol açar; sorun kablolama hatası gibi teşhis edilir.", label: 'VNI', type: 'number', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier — 1–16777215 arası', min: 1, max: 16777215 },
                        { name: 'vlan_id', why: "VLAN, bridge-domain içinde <code>bind vlan</code> ile VNIya eşlenir. Bu eşleme yapılmazsa yerel VLAN trafiği tünele hiç girmez; port üzerinde ayrıca L2 alt arayüz veya VLAN-BD eşlemesi tanımlı olmalıdır.", label: 'VLAN ID', type: 'number', validate: 'vlan', required: true, placeholder: '100', hint: 'VXLAN ile eşlenecek VLAN numarası', min: 1, max: 4094 },
                        { name: 'vtep_lo', why: "VTEP kaynak arayüzü mutlaka Loopback olmalıdır; fiziksel arayüz kullanmak o link düştüğünde tüm VXLAN tünellerinin topluca kopmasına neden olur. Loopback ayrıca underlay yönlendirme protokolüne duyurulmuş olmalıdır.", label: 'VTEP Loopback Interface', type: 'text', required: true, placeholder: 'LoopBack1', hint: 'VTEP kaynak IP\'si için kullanılacak Loopback arayüzü' },
                        { name: 'vtep_ip', why: "VTEP adresi <b>/32</b> olmalı ve underlay üzerinden tüm diğer VTEPlere ulaşılabilir olmalıdır. Ulaşılamayan bir VTEP adresi EVPN rotalarının gelmesine ama tünelin kurulmamasına yol açar; <code>display vxlan tunnel</code> boş kalır.", label: 'VTEP IP / Mask', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1 255.255.255.255', hint: 'VTEP Loopback IP adresi — /32 host route önerilir' }
                    ]
                },
                {
                    title: 'BGP EVPN Ayarları',
                    icon: 'fas fa-route',
                    info: 'BGP EVPN, MAC/IP route\'larını control plane üzerinden öğrenir — flood-and-learn yerine daha ölçeklenebilir.',
                    fields: [
                        { name: 'bgp_as', why: "EVPN kontrol düzlemi BGP üzerinde çalışır; AS numarası tasarımla (iBGP route-reflector veya eBGP spine-leaf) tutarlı olmalıdır. Yanlış AS, oturumun hiç kurulmamasına veya kurulup EVPN adres ailesinin etkin olmamasına neden olur.", label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'EVPN BGP Autonomous System numarası' },
                        { name: 'rd', why: "RD her VTEP üzerinde benzersiz olmalıdır (genellikle <code>router-id:VNI</code>); iki leafte aynı RD kullanmak EVPN rotalarının birbirini bastırmasına ve MAC bilgilerinin kaybolmasına yol açar. RD sonradan değiştirilemez, instance yeniden kurulmalıdır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'Örn: AS:VNI formatı — 65001:100' },
                        { name: 'rt', why: "RT, hangi VTEPin hangi EVPN rotalarını içeri alacağını belirler ve import/export değerleri karşılıklı eşleşmelidir. Eşleşmezse BGP oturumu sağlıklı görünür, rotalar duyurulur ama hiçbir VTEP tablosuna düşmez; bu VXLAN arızalarının en sık sebebidir.", label: 'Route Target', type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import/export community değeri — genellikle RD ile aynı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vni = cgEsc(data.vni || '');
            const vlanId = cgEsc(data.vlan_id || '');
            const vtepLo = cgEsc(data.vtep_lo || '');
            const vtepIp = cgEsc(data.vtep_ip || '');
            const bgpAs = cgEsc(data.bgp_as || '');
            const rd = cgEsc(data.rd || '');
            const rt = cgEsc(data.rt || '');
            let c = '# ========================================\n# Huawei CloudEngine — VXLAN / EVPN\n# ========================================\n\n';
            c += '# VTEP Loopback\n';
            c += 'interface ' + vtepLo + '\n ip address ' + vtepIp + '\n#\n\n';
            c += '# VXLAN Tunnel\n';
            c += 'bridge-domain ' + vni + '\n';
            c += ' vxlan vni ' + vni + '\n#\n\n';
            c += '# VLAN-BD Mapping\n';
            c += 'interface Vbdif' + vni + '\n';
            c += ' ip address # (SVI IP buraya)\n#\n\n';
            c += 'vlan ' + vlanId + '\n';
            c += ' vxlan vni ' + vni + '\n#\n\n';
            c += '# BGP EVPN\n';
            c += 'bgp ' + bgpAs + '\n';
            c += ' l2vpn-family evpn\n';
            c += '  peer <RR_IP> enable\n';
            c += '  peer <RR_IP> advertise encap-type vxlan\n#\n\n';
            c += '# EVPN Instance\n';
            c += 'evpn vpn-instance ' + vni + ' bd-mode\n';
            c += ' route-distinguisher ' + rd + '\n';
            c += ' vpn-target ' + rt + ' export-extcommunity\n';
            c += ' vpn-target ' + rt + ' import-extcommunity\n#\n\n';
            c += '# Doğrulama:\n# display vxlan vni\n# display bgp evpn all routing-table\n';
            return c;
        });
    }
};

// ── Huawei CloudEngine: LACP / Eth-Trunk ─────────────────────────────────────
HuaweiCE.lacp = {
    label: 'LACP / Eth-Trunk',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'LACP / Eth-Trunk (CloudEngine)',
                desc: 'Huawei CloudEngine Eth-Trunk (LAG) yapılandırması — LACP static veya manual mode. Sunucu bağlantısında bant genişliği artırma ve yüksek erişilebilirlik için kullanılır.'
            },
            configTypes: [
                { id: 'lacp', label: 'LACP Static', icon: 'fas fa-link', desc: 'IEEE 802.3ad LACP — dinamik müzakere',
                  badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } },
                { id: 'manual', label: 'Manual / Static', icon: 'fas fa-ethernet', desc: 'Manuel yük dengeleme — LACP olmadan',
                  badge: { text: 'Basit', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Eth-Trunk Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'trunk_id', why: "Eth-Trunk numarası yereldir ama iki uçta aynı tutmak sorun gidermeyi kolaylaştırır. Kullanımdaki bir ID seçmek mevcut trunkın üyelerini etkiler ve yedekli sunucu bağlantısını tek bacağa düşürür.", label: 'Eth-Trunk ID', type: 'number', required: true, placeholder: '1', hint: 'Eth-Trunk numarası (0–511)', min: 0, max: 511 },
                        { name: 'lacp_mode', why: "Statik (manual) ve LACP modları uyumsuzdur; bir uç LACP diğer uç statik ise link fiziksel olarak kalkar fakat trafik döngüye girer veya kaybolur. Sunucu NIC teaming ayarı da bu modla uyumlu olmalıdır, yoksa sunucu ağ bağlantısı kararsız çalışır.", label: 'LACP Mod', type: 'select', options: [
                            { value: 'lacp-static', label: 'LACP Static (Active)', selected: true },
                            { value: 'manual load-balance', label: 'Manual / Static' }
                        ]},
                        { name: 'members', why: "Üye arayüzler aynı hız ve dupleks değerinde olmalıdır; farklı hızdaki portlar trunka alınmaz. Üye eklerken portun mevcut VLAN yapılandırması silinir, bu yüzden önce trunka alıp sonra VLAN ayarlamak gerekir.", label: 'Üye Interface(ler)', type: 'text', required: true, placeholder: '10GE1/0/1, 10GE1/0/2', hint: 'Virgülle ayırın — Eth-Trunk\'a eklenecek fiziksel portlar' }
                    ]
                },
                {
                    title: 'Switchport Modu',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'sw_mode', why: "Trunk modunda izin verilen VLAN listesi, access modunda PVID belirleyicidir. Sunucu tarafı etiketli VLAN gönderirken switch tarafını access bırakmak, trafiğin hiç geçmemesine ve arızanın kablo sorunu sanılmasına yol açar.", label: 'Mod', type: 'select', options: [
                            { value: 'trunk', label: 'Trunk — çoklu VLAN', selected: true },
                            { value: 'access', label: 'Access — tek VLAN' },
                            { value: 'routed', label: 'Routed — Layer-3 (undo portswitch)' }
                        ]},
                        { name: 'vlan_ip', why: "Eth-Trunk L2 modda VLAN taşır, L3 modda (<code>undo portswitch</code>) IP alır; ikisi aynı anda olmaz. Mod değişimi mevcut yapılandırmayı sildiği için üretim trafiği anında kesilir.", label: 'VLAN / IP', type: 'text', optional: true, placeholder: '10 20 100 veya 10.1.1.1 255.255.255.252', hint: 'Trunk: izin verilen VLAN\'lar | Access: VLAN ID | Routed: IP/mask' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const trunkId = cgEsc(data.trunk_id || '');
            const lacpMode = cgEsc(data.lacp_mode || 'lacp-static');
            const members = (data.members || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
            const swMode = cgEsc(data.sw_mode || 'trunk');
            const vlanIp = cgEsc(data.vlan_ip || '');
            let c = '# ========================================\n# Huawei CloudEngine — LACP / Eth-Trunk\n# ========================================\n\n';
            c += 'interface Eth-Trunk' + trunkId + '\n';
            c += ' mode ' + lacpMode + '\n';
            if (swMode === 'trunk') {
                c += ' port link-type trunk\n';
                if (vlanIp) c += ' port trunk allow-pass vlan ' + vlanIp + '\n';
            } else if (swMode === 'access') {
                c += ' port link-type access\n';
                if (vlanIp) c += ' port default vlan ' + vlanIp + '\n';
            } else {
                c += ' undo portswitch\n';
                if (vlanIp) c += ' ip address ' + vlanIp + '\n';
            }
            c += '#\n\n';
            members.forEach(m => {
                c += 'interface ' + m + '\n';
                c += ' eth-trunk ' + trunkId + '\n#\n';
            });
            c += '\n# Doğrulama:\n# display eth-trunk ' + trunkId + '\n# display lacp statistics\n';
            return c;
        });
    }
};

// ── HuaweiCE: M-LAG ───────────────────────────────────────────────────────────
HuaweiCE.mlag = {
    label: 'M-LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-object-group',
                title: 'M-LAG (CloudEngine)',
                desc: 'Huawei CloudEngine M-LAG (Multi-chassis Link Aggregation Group) yapılandırması — DFS group, peer link ve IP adresleri. İki switch\'i aktif-aktif çalıştırarak yüksek erişilebilirlik ve yük dengeleme sağlar.'
            },
            configTypes: [
                { id: 'mlag', label: 'M-LAG', icon: 'fas fa-object-group', desc: 'Çift şaseli aktif-aktif LAG — sıfır kesinti',
                  badge: { text: 'Yüksek Erişilebilirlik', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'DFS Group Ayarları',
                    icon: 'fas fa-cog',
                    warn: 'M-LAG peer switch\'inde karşıt priority değeri ayarlanmalıdır. Primary: priority 150, Secondary: priority 100 gibi farklı değerler kullanın.',
                    fields: [
                        { name: 'dfs_group_id', why: "DFS group numarası M-LAG çiftinin her iki cihazında <b>aynı</b> olmalıdır; farklı numara M-LAG ilişkisinin hiç kurulmamasına ve her iki switchin bağımsız davranarak sunucu bağlantısını bölmesine yol açar.", label: 'DFS Group ID', type: 'number', required: true, placeholder: '1', hint: 'DFS group numarası — genellikle 1', min: 1 },
                        { name: 'priority', why: "Yüksek öncelik primary rolü belirler. İki cihazda aynı öncelik bırakılırsa rol seçimi MAC adresine kalır ve yeniden başlatmalarda rol beklenmedik şekilde değişebilir; bu da yönetim ve sorun giderme sırasında kafa karışıklığı yaratır.", label: 'Priority', type: 'number', required: true, placeholder: '150', hint: 'Yüksek öncelik = primary switch. Önerilen: 150 (primary) / 100 (secondary)', min: 1, max: 254 }
                    ]
                },
                {
                    title: 'Peer Link ve IP Ayarları',
                    icon: 'fas fa-network-wired',
                    info: 'Peer link, iki M-LAG switch arasındaki kontrol ve veri trafiği için kullanılır. Yüksek bant genişliği önerilir.',
                    fields: [
                        { name: 'peer_link_po', why: "Peer-link M-LAG çiftinin kontrol ve senkronizasyon yoludur ve mutlaka yedekli (çok üyeli Eth-Trunk) olmalıdır. Peer-link koparsa split-brain oluşur: iki cihaz da aktif davranır, aynı MAC adresleri iki yerden duyurulur ve ağ kullanılamaz hale gelir.", label: 'Peer Link Port-Channel', type: 'text', required: true, placeholder: 'Eth-Trunk1', hint: 'Peer link olarak kullanılacak Eth-Trunk arayüzü' },
                        { name: 'local_ip', why: "Bu adres M-LAG keepalive (DAD) trafiği içindir ve peer-linkten <b>bağımsız</b> bir yol üzerinden gitmelidir. Aynı fiziksel yolu kullanırsa peer-link arızasında keepalive de kopar ve split-brain koruması devre dışı kalır.", label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Bu switch\'in M-LAG peer iletişim IP adresi' },
                        { name: 'peer_ip', why: "Karşı cihazın keepalive adresi doğru olmalı ve arada filtre bulunmamalıdır. Yanlış adres M-LAG kurulmuş gibi görünmesine ama split-brain tespitinin hiç çalışmamasına yol açar; arıza ancak gerçek bir kesinti anında ortaya çıkar.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.2', hint: 'Karşı switch\'in M-LAG IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const dfsGroupId = cgEsc(data.dfs_group_id || '');
            const priority = cgEsc(data.priority || '');
            const peerLinkPo = cgEsc(data.peer_link_po || '');
            const peerIp = cgEsc(data.peer_ip || '');
            const localIp = cgEsc(data.local_ip || '');
            let c = '# ========================================\n# Huawei CloudEngine — M-LAG\n# ========================================\n\n';
            c += 'dfs-group ' + dfsGroupId + '\n';
            c += ' priority ' + priority + '\n';
            c += ' source ip ' + localIp + '\n';
            c += ' peer ip ' + peerIp + '\n#\n\n';
            c += 'interface ' + peerLinkPo + '\n';
            c += ' dfs-group ' + dfsGroupId + ' m-lag peer-link\n#\n';
            c += '\n# Doğrulama:\n# display dfs-group ' + dfsGroupId + ' m-lag\n# display m-lag summary\n';
            return c;
        });
    }
};

// ── HuaweiCE: BFD ─────────────────────────────────────────────────────────────
HuaweiCE.bfd = {
    label: 'BFD',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'BFD (CloudEngine)',
                desc: 'Huawei CloudEngine BFD (Bidirectional Forwarding Detection) oturumu — milisaniye seviyesinde link arıza tespiti. OSPF, BGP ve statik route\'larla entegre çalışarak hızlı failover sağlar.'
            },
            sections: [
                {
                    title: 'BFD Peer Ayarları',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'peer_ip', why: "Karşı cihazda da eşleşen bir BFD oturumu tanımlanmalıdır; tek taraflı yapılandırma oturumu Down bırakır. BFD bir yönlendirme protokolüne bağlanmazsa arıza tespiti yapar ama hiçbir rotayı düşürmez, yani hiçbir işe yaramaz.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BFD oturumu kurulacak karşı cihaz IP adresi' },
                        { name: 'local_ip', why: "Kaynak adres karşı tarafın peer olarak beklediği adresle aynı olmalıdır; aksi halde paketler ulaşır ama oturum eşleşmez. Çok yollu spine-leaf ortamında kaynağı sabitlemek oturumun rastgele kopmasını önler.", label: 'Local IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Bu cihazın BFD source IP adresi' },
                        { name: 'interface', why: "Tek hop BFD oturumu belirli bir fiziksel arayüze bağlanır; Eth-Trunk üzerinde tanımlamak yalnızca tüm üyeler düştüğünde tespit yapar, tek üye arızasını yakalamaz. Üye bazlı tespit için her fiziksel arayüzde ayrı oturum gerekir.", label: 'Interface', type: 'text', required: true, placeholder: '40GE1/0/1', hint: 'BFD oturumunun bağlı olduğu fiziksel arayüz' }
                    ]
                },
                {
                    title: 'Timer Ayarları',
                    icon: 'fas fa-clock',
                    info: 'Varsayılan değerler (300ms × 3 = 900ms) çoğu senaryo için uygundur. Agresif timer\'lar CPU yükünü artırabilir.',
                    fields: [
                        { name: 'min_tx', why: "Çok agresif aralıklar yüksek CPU yükü altında yanlış pozitif arıza tespitine yol açar ve sağlam linklerin sürekli açılıp kapanmasına (flapping) neden olur. Veri merkezinde 300 ms genellikle hız ile kararlılık arasında güvenli bir dengedir.", label: 'Min TX Interval (ms)', type: 'number', required: true, placeholder: '300', hint: 'BFD paketi gönderme aralığı (ms) — önerilen: 300', min: 100, max: 30000 },
                        { name: 'min_rx', why: "İki uçtaki TX ve RX değerleri müzakere edilir ve yavaş olan taraf belirleyicidir; bir uçta yüksek değer bırakmak diğer uçtaki hızlı tespiti tamamen anlamsız kılar.", label: 'Min RX Interval (ms)', type: 'number', required: true, placeholder: '300', hint: 'BFD paketi alma aralığı (ms) — önerilen: 300', min: 100, max: 30000 },
                        { name: 'detect_mult', why: "Tespit süresi kabaca <code>interval x multiplier</code> kadardır. Çok düşük değer mikro kesintilerde rotanın düşmesine, çok yüksek değer ise arızanın saniyelerce fark edilmemesine ve trafiğin kara deliğe akmasına neden olur.", label: 'Detect Multiplier', type: 'number', required: true, placeholder: '3', hint: 'Arıza tespiti için kaçırmaya izin verilen paket sayısı — önerilen: 3', min: 3, max: 50 }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const peerIp = cgEsc(data.peer_ip || '');
            const localIp = cgEsc(data.local_ip || '');
            const intf = cgEsc(data.interface || '');
            const minTx = cgEsc(data.min_tx || '');
            const minRx = cgEsc(data.min_rx || '');
            const detectMult = cgEsc(data.detect_mult || '');
            let c = '# ========================================\n# Huawei CloudEngine — BFD\n# ========================================\n\n';
            c += 'bfd\n#\n\n';
            c += 'bfd session-name bind peer-ip ' + peerIp + ' source-ip ' + localIp + ' interface ' + intf + '\n';
            c += ' min-echo-rx-interval ' + minRx + '\n';
            c += ' min-tx-interval ' + minTx + '\n';
            c += ' detect-multiplier ' + detectMult + '\n';
            c += ' commit\n#\n';
            c += '\n# Doğrulama:\n# display bfd session all\n';
            return c;
        });
    }
};

// ── HuaweiCE: QoS MQC / DiffServ ─────────────────────────────────────────────
HuaweiCE.qos = {
    label: 'QoS MQC / DiffServ',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sliders-h',
                title: 'QoS MQC / DiffServ (CloudEngine)',
                desc: 'Huawei CloudEngine MQC (Modular QoS CLI) yapılandırması — traffic classifier, behavior ve policy ile DSCP tabanlı servis kalitesi. Gerçek zamanlı trafik (VoIP, video) önceliklendirme için kullanılır.'
            },
            sections: [
                {
                    title: 'Traffic Classifier',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'classifier_name', why: "MQC zinciri <b>classifier → behavior → policy</b> şeklindedir ve isimler policy içinde birebir referans verilir. Bir harflik fark zinciri koparır: policy kabul edilir ama hiçbir trafik sınıflandırılmaz ve QoS sessizce devre dışı kalır.", label: 'Classifier Adı', type: 'text', required: true, placeholder: 'CLS-REALTIME', hint: 'Trafik sınıflandırıcı adı — anlamlı isim kullanın' },
                        { name: 'match_dscp', why: "DSCP işaretinin uçtan uca korunması gerekir; VXLAN kapsüllemesinde iç başlıktaki işaretin dış başlığa kopyalanmadığı durumlarda fabric içinde öncelik tamamen kaybolur. Sunucudan gelen işaret güvenilir değilse leaf üzerinde yeniden işaretlemek gerekir.", label: 'Match DSCP', type: 'text', required: true, placeholder: 'ef', hint: 'DSCP değeri: ef (VoIP), af41 (video), af21 (bulk data), cs6 (routing)' }
                    ]
                },
                {
                    title: 'Traffic Behavior',
                    icon: 'fas fa-tasks',
                    fields: [
                        { name: 'behavior_name', why: "Behavior tanımlanmadan policy içinde referans verilirse komut reddedilir. İçi boş bir behavior ise sınıflandırmayı çalıştırır ama trafiğe hiçbir şey yapmaz; yapılandırma doğru görünür, etkisi sıfırdır.", label: 'Behavior Adı', type: 'text', required: true, placeholder: 'BEH-PQ', hint: 'Trafik davranış adı' },
                        { name: 'queue_type', why: "RDMA veya depolama trafiği taşıyan fabriclerde kuyruk tipi seçimi kritiktir: yanlış kuyruk PFC ile birlikte çalışmaz ve paket kaybı depolama performansını çökertir. Express kuyruğuna fazla trafik yönlendirmek diğer tüm sınıfları aç bırakır.", label: 'Queue Tipi', type: 'select', options: [
                            { value: 'llq', label: 'LLQ — Low Latency Queue (VoIP/video)', selected: true },
                            { value: 'pq', label: 'PQ — Priority Queue' },
                            { value: 'af', label: 'AF — Assured Forwarding' }
                        ], hint: 'LLQ gerçek zamanlı trafik için önerilir' }
                    ]
                },
                {
                    title: 'Traffic Policy ve Uygulama',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', why: "Policy yalnızca bir arayüze <code>traffic-policy ... inbound|outbound</code> ile uygulandığında etkindir. Uygulanmamış policy konfigürasyonda görünür ama hiçbir şey yapmaz; QoS sorunlarının en sık kök nedeni budur.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-EDGE', hint: 'QoS policy adı — interface\'e uygulanacak' },
                        { name: 'intf', why: "Yön kritiktir: darboğaz genellikle çıkış (outbound) yönündedir, inbound uygulanan shaping beklenen etkiyi vermez. Aynı arayüzde aynı yönde ikinci bir policy uygulanamaz, komut reddedilir.", label: 'Apply Interface', type: 'text', optional: true, placeholder: '40GE1/0/1', hint: 'Policy\'nin outbound yönde uygulanacağı arayüz — boş bırakılırsa uygulama satırı eklenmez' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const classifierName = cgEsc(data.classifier_name || '');
            const matchDscp = cgEsc(data.match_dscp || '');
            const behaviorName = cgEsc(data.behavior_name || '');
            const queueType = cgEsc(data.queue_type || 'llq');
            const policyName = cgEsc(data.policy_name || '');
            const intf = cgEsc(data.intf || '');
            let c = '# ========================================\n# Huawei CloudEngine — QoS MQC / DiffServ\n# ========================================\n\n';
            c += 'traffic classifier ' + classifierName + ' operator or\n if-match dscp ' + matchDscp + '\n#\n\n';
            c += 'traffic behavior ' + behaviorName + '\n queue ' + queueType + ' bandwidth percent 30\n dscp remark ef\n#\n\n';
            c += 'traffic policy ' + policyName + '\n classifier ' + classifierName + ' behavior ' + behaviorName + '\n#\n';
            if (intf) {
                c += '\ninterface ' + intf + '\n traffic-policy ' + policyName + ' outbound\n#\n';
            }
            c += '\n# Doğrulama:\n# display traffic policy applied-record\n';
            return c;
        });
    }
};

// ── HuaweiCE: SNMP + NTP ──────────────────────────────────────────────────────
HuaweiCE.snmpntp = {
    label: 'SNMP + NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bell',
                title: 'SNMP + NTP (CloudEngine)',
                desc: 'Huawei CloudEngine SNMP v2c trap yapılandırması ve NTP saat senkronizasyonu. Ağ izleme sistemleri (LibreNMS, Zabbix) ile entegrasyon için gereklidir.'
            },
            sections: [
                {
                    title: 'SNMP Ayarları',
                    icon: 'fas fa-eye',
                    warn: 'SNMP community string\'i tahmin edilmesi güç, benzersiz bir değer olmalıdır. PUBLIC veya PRIVATE kullanmayın.',
                    fields: [
                        { name: 'community', why: "Community string düz metin taşınır; <code>public</code> gibi varsayılan değerler tüm fabric envanterinin okunabilmesi demektir. Mümkünse SNMPv3 kullanın, v2c kullanacaksanız mutlaka ACL ile kaynak IPyi sınırlayın.", label: 'SNMP Community (RO)', type: 'text', required: true, placeholder: 'NMS-RO-CE6870', hint: 'Read-only community string — NMS sistemiyle eşleşmeli' },
                        { name: 'trap_host', why: "Trap hedefi yanlışsa cihaz arıza anında sessiz kalır. Hedefe giden yol, UDP 162 izni ve trap kaynak arayüzünün sabitlenmiş olması birlikte doğrulanmalıdır; aksi halde NMS bilinmeyen kaynaktan gelen trapleri yok sayar.", label: 'Trap Host IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap\'larının gönderileceği NMS/monitoring sunucusu IP' }
                    ]
                },
                {
                    title: 'NTP Ayarları',
                    icon: 'fas fa-clock',
                    info: 'Saat senkronizasyonu log korelasyonu ve sertifika doğrulaması için kritiktir. En az iki NTP sunucusu önerilir.',
                    fields: [
                        { name: 'ntp_server', why: "Fabric genelinde saat senkronizasyonu olmadan leaf ve spine loglarını korele edemezsiniz ve VXLAN arıza analizinde olayların sırasını çıkaramazsınız. NTP trafiğinin (UDP 123) yönetim ağı üzerinden geçtiğini doğrulayın.", label: 'NTP Server', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucusu IP adresi' },
                        { name: 'ntp_server2', why: "Tek NTP kaynağı sessiz bir tek arıza noktasıdır; sunucu yanlış saat yayınlarsa tüm fabric onunla birlikte kayar ve sapma fark edilmez. İkinci kaynak bu hatayı görünür kılar.", label: 'NTP Server 2', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucusu — yedeklilik için önerilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const community = cgEsc(data.community || '');
            const trapHost = cgEsc(data.trap_host || '');
            const ntpServer = cgEsc(data.ntp_server || '');
            const ntpServer2 = cgEsc(data.ntp_server2 || '');
            let c = '# ========================================\n# Huawei CloudEngine — SNMP + NTP\n# ========================================\n\n';
            c += 'snmp-agent sys-info version v2c\n';
            c += 'snmp-agent community read ' + community + '\n';
            c += 'snmp-agent target-host trap address udp-domain ' + trapHost + ' params securityname ' + community + ' v2c\n#\n\n';
            c += 'ntp-service server ' + ntpServer + '\n';
            if (ntpServer2) c += 'ntp-service server ' + ntpServer2 + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display snmp-agent community\n# display ntp-service sessions\n';
            return c;
        });
    }
};

// ── HuaweiCE: EVPN Symmetric IRB ─────────────────────────────────────────────
HuaweiCE.evpnsymirb = {
    label: 'EVPN Symmetric IRB',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'EVPN Symmetric IRB (CloudEngine)',
                desc: 'Huawei CloudEngine EVPN Symmetric IRB (Integrated Routing and Bridging) — Vbdif arayüzü, bridge-domain VNI eşlemesi ve L3 EVPN route-distinguisher/target yapılandırması. East-West trafik optimizasyonu için distributed gateway tasarımı.'
            },
            configTypes: [
                { id: 'symirb', label: 'Symmetric IRB', icon: 'fas fa-exchange-alt', desc: 'Her leaf\'te distributed L3 gateway — optimal routing',
                  badge: { text: 'Data Center', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN ve VNI Eşlemesi',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vbdif_id', why: "Vbdif arayüzü bridge-domain için L3 gateway görevi görür ve BD numarasıyla eşleşmelidir. Yanlış numara, arayüzün hiçbir bridge-domain ile ilişkilendirilmemesine ve gateway trafiğinin sessizce düşmesine yol açar.", label: 'Vbdif ID', type: 'number', required: true, placeholder: '100', hint: 'Virtual Bridge-Domain Interface numarası — genellikle VLAN ID ile aynı' },
                        { name: 'vlan_id', why: "VLAN, bridge-domain içinde <code>bind vlan</code> ile VNIya eşlenir; eşleme eksikse yerel trafik tünele hiç girmez. Symmetric IRB tasarımında bu VLAN tüm ilgili leaf cihazlarda tutarlı yapılandırılmalıdır.", label: 'VLAN ID', type: 'number', required: true, placeholder: '100', hint: 'VXLAN ile eşlenecek VLAN numarası', min: 1, max: 4094 },
                        { name: 'vni', why: "Symmetric IRBde L2 VNI yanında ayrı bir <b>L3 VNI</b> gerekir ve L3 VNI tüm leaf cihazlarda aynı olmalıdır. İkisini karıştırmak, aynı subnet içinde iletişimin çalışıp subnetler arası yönlendirmenin hiç çalışmamasına neden olur.", label: 'VNI', type: 'number', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier — 1–16777215 arası', min: 1, max: 16777215 }
                    ]
                },
                {
                    title: 'Gateway IP ve ARP Suppress',
                    icon: 'fas fa-sitemap',
                    info: 'ARP Suppress, leaf switch\'lerin ARP flood\'unu EVPN üzerinden çözmesini sağlar — bandwidth tasarrufu yapar.',
                    fields: [
                        { name: 'ip', why: "Distributed anycast gateway adresi tüm leaf cihazlarda <b>aynı</b> olmalıdır; farklı IP vermek sunucu taşındığında gateway değişmesine ve oturumların kopmasına yol açar. Aynı MAC adresinin de paylaşılması gerekir.", label: 'IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '192.168.100.1', hint: 'Distributed gateway IP adresi — tüm leaf\'lerde aynı olabilir (anycast)' },
                        { name: 'mask', why: "Maske tüm leaf cihazlarda aynı olmalıdır; bir leafte farklı maske, sunucuların kendi subnetlerinin sınırını farklı algılamasına ve bazı hedeflere gateway üzerinden gitmeye çalışıp başarısız olmasına neden olur.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Alt ağ maskesi — Örn: 255.255.255.0' },
                        { name: 'arp_suppress', why: "ARP suppression, EVPN MAC/IP rotalarını kullanarak yayın ARP trafiğini leafte sonlandırır ve fabric yayın yükünü ciddi azaltır. EVPN rotaları tam senkronize değilken açmak, bazı hostların ARP yanıtı alamayıp erişilemez görünmesine yol açabilir.", label: 'ARP Suppress', type: 'select', options: [
                            { value: 'enable', label: 'Enable — ARP flood suppress (önerilir)', selected: true },
                            { value: 'disable', label: 'Disable — normal ARP davranışı' }
                        ]}
                    ]
                },
                {
                    title: 'EVPN Route Policy',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'local_as', why: "AS numarası EVPN route-target değerlerinin otomatik hesabında kullanılır; leaf cihazlarda farklı AS varsa otomatik RT değerleri eşleşmez ve rotalar duyurulsa bile hiçbir VTEP tarafından içeri alınmaz. Bu durumda RT manuel tanımlanmalıdır.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'EVPN route-target hesabı için AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vbdifId = cgEsc(data.vbdif_id || '');
            const vlanId = cgEsc(data.vlan_id || '');
            const vni = cgEsc(data.vni || '');
            const ip = cgEsc(data.ip || '');
            const mask = cgEsc(data.mask || '');
            const localAs = cgEsc(data.local_as || '');
            const arpSuppress = cgEsc(data.arp_suppress || 'enable');
            let c = '# ========================================\n# Huawei CloudEngine — EVPN Symmetric IRB\n# ========================================\n\n';
            c += 'vlan ' + vlanId + '\n#\n\n';
            c += 'interface Vbdif' + vbdifId + '\n';
            c += ' ip address ' + ip + ' ' + mask + '\n';
            if (arpSuppress === 'enable') c += ' arp-proxy inner-sub-vlan-proxy enable\n';
            c += '#\n\n';
            c += 'bridge-domain ' + vlanId + '\n';
            c += ' vxlan vni ' + vni + '\n';
            c += ' l2-multicast-vxlan-mode suppress\n#\n\n';
            c += 'evpn\n';
            c += ' vpn-instance ' + vlanId + ' vni ' + vni + '\n';
            c += ' route-distinguisher 10.255.0.1:' + vlanId + '\n';
            c += ' vpn-target ' + localAs + ':' + vlanId + ' export-extcommunity\n';
            c += ' vpn-target ' + localAs + ':' + vlanId + ' import-extcommunity\n#\n';
            c += '\n# Doğrulama:\n# display evpn vpn-instance vni ' + vni + '\n# display bridge-domain ' + vlanId + '\n';
            return c;
        });
    }
};

// ── HuaweiCE: Route Policy ────────────────────────────────────────────────────
HuaweiCE.routepolicy = {
    label: 'Route Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-signs',
                title: 'Route Policy (CloudEngine)',
                desc: 'Huawei CloudEngine route-policy yapılandırması — prefix-list eşleşme, community ve local-preference uygulama. BGP route filtreleme ve manipülasyonu için kullanılır.'
            },
            configTypes: [
                { id: 'permit', label: 'Permit Node', icon: 'fas fa-check-circle', desc: 'Eşleşen route\'lara izin ver ve attribute uygula',
                  badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'deny', label: 'Deny Node', icon: 'fas fa-times-circle', desc: 'Eşleşen route\'ları filtrele',
                  badge: { text: 'Filtreleme', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'policy_name', why: "Route-policy bir BGP komşusuna veya import/export işlemine bağlanmazsa hiçbir etkisi olmaz. İsim uyuşmazlığında CloudEngine boş bir politika uygular ve bu pratikte <b>her şeyi reddetmek</b> anlamına gelir; fabric rotaları bir anda kaybolur.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-OUT', hint: 'Route policy adı — BGP neighbor\'a apply edilecek' },
                        { name: 'seq', why: "Node numaraları küçükten büyüğe işlenir ve ilk eşleşen kazanır. Araya ekleme yapabilmek için 10ar atlamalı numaralandırın; ayrıca sonunda tüm rotaları kapsayan bir permit düğümü yoksa eşleşmeyen tüm rotalar sessizce düşürülür.", label: 'Node Sequence', type: 'number', required: true, placeholder: '10', hint: 'Node numarası — düşük numara önce işlenir, 10\'ar 10\'ar artırın', min: 1 },
                        { name: 'mode', why: "Permit düğümü eşleşen rotaya apply komutlarını uygular; deny düğümü rotayı tamamen atar ve apply satırları hiç çalışmaz. Deny düğümü altına apply yazmak sık yapılan ve tamamen etkisiz kalan bir hatadır.", label: 'Mode', type: 'select', options: [
                            { value: 'permit', label: 'permit — eşleşen route\'lara izin ver', selected: true },
                            { value: 'deny', label: 'deny — eşleşen route\'ları filtrele' }
                        ]}
                    ]
                },
                {
                    title: 'Match Koşulları',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'match_prefix', why: "Match satırı olmayan bir permit düğümü tüm rotalarla eşleşir; bunu politikanın başına koymak sonraki tüm düğümleri anlamsız kılar. Prefix eşlemesi için önce <code>ip ip-prefix</code> tanımı yapılmalıdır.", label: 'Match Prefix (CIDR)', type: 'text', optional: true, placeholder: '10.0.0.0/8', hint: 'Eşleştirilecek prefix — CIDR formatında. Boş bırakılırsa tüm route\'lar eşleşir' }
                    ]
                },
                {
                    title: 'Apply Aksiyonları',
                    icon: 'fas fa-edit',
                    fields: [
                        { name: 'apply_community', why: "Community değerinin komşuya gitmesi için ayrıca <code>peer ... advertise-community</code> gerekir; aksi halde değer yerel kalır ve karşı taraftaki politikalar hiç tetiklenmez. Additive kullanılmazsa mevcut community değerleri silinir, EVPN route-target community değerleri de bu yolla bozulabilir.", label: 'Apply Community', type: 'text', optional: true, placeholder: '65001:200', hint: 'BGP community değeri — additive mod ile eklenir' },
                        { name: 'apply_localpref', why: "Local-preference yalnızca AS içinde (iBGP) taşınır, eBGP komşusuna geçmez. Yüksek değer tercih edilir ve varsayılan 100dür; spine-leaf tasarımında bunu yanlış kullanmak trafiğin tek bir spine üzerinden akmasına ve yük dengelemenin kaybolmasına yol açar.", label: 'Apply Local Preference', type: 'number', optional: true, placeholder: '100', hint: 'BGP local-preference değeri — yüksek değer tercih edilir (varsayılan: 100)', min: 0, max: 4294967295 }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const policyName = cgEsc(data.policy_name || '');
            const seq = cgEsc(data.seq || '');
            const mode = cgEsc(data.mode || 'permit');
            const matchPrefix = cgEsc(data.match_prefix || '');
            const applyCommunity = cgEsc(data.apply_community || '');
            const applyLocalpref = cgEsc(data.apply_localpref || '');
            let c = '# ========================================\n# Huawei CloudEngine — Route Policy\n# ========================================\n\n';
            if (matchPrefix) c += 'ip ip-prefix PFX-' + policyName + ' index 5 permit ' + matchPrefix + '\n#\n\n';
            c += 'route-policy ' + policyName + ' ' + mode + ' node ' + seq + '\n';
            if (matchPrefix) c += ' if-match ip-prefix PFX-' + policyName + '\n';
            if (applyCommunity) c += ' apply community ' + applyCommunity + ' additive\n';
            if (applyLocalpref) c += ' apply local-preference ' + applyLocalpref + '\n';
            c += '#\n';
            c += '\n# Doğrulama:\n# display route-policy ' + policyName + '\n';
            return c;
        });
    }
};
