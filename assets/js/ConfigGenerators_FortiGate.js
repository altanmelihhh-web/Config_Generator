'use strict';

const FortiGate = {};

// ── FortiGate: Interface ───────────────────────────────────────────────────────
FortiGate.interface = {
    label: 'Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface (FortiGate)',
                desc: 'FortiOS statik interface konfigürasyonu. WAN ve LAN portlarına IP, alias ve allowaccess atar.<br><code>config system interface\n  edit "port1"\n    set alias "WAN"\n    set ip 203.0.113.1 255.255.255.252\n    set allowaccess ping https\n    set role wan\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'WAN Interface',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'wan_port', why: "FortiGate'te portlar fiziksel isimle anılır (<code>port1</code>, <code>wan1</code>). Yanlış porta IP verirsen cihazla bağlantını kaybedebilirsin — önce <code>get system interface</code> ile mevcut portları gör.",   label: 'Interface Adı',          type: 'text',   required: true, placeholder: 'port1',            hint: 'WAN portunu belirtin (ör: port1, wan1)' },
                        { name: 'wan_alias', why: "Alias yalnızca görünen addır, config'te port adı kullanılmaya devam eder. Ama kural yazarken <code>WAN</code> görmek <code>port1</code> görmekten çok daha az hata yaptırır.",  label: 'Alias',                  type: 'text',   required: true, placeholder: 'WAN',               hint: 'İnsan okunabilir kısa ad' },
                        { name: 'wan_ip', why: "ISS'nin verdiği statik IP. DHCP alıyorsan bu alanı boş bırakıp <code>set mode dhcp</code> kullanmalısın; ikisini birden tanımlamak çakışır.",     label: 'IP Adresi',              type: 'text', validate: 'ip',   required: true, placeholder: '203.0.113.1',        hint: 'WAN tarafındaki statik IP' },
                        { name: 'wan_mask', why: 'FortiOS nokta-ondalık maske bekler (<code>255.255.255.252</code>), CIDR değil. Point-to-point ISS bağlantılarında genelde /30 verilir.',   label: 'Subnet Mask',            type: 'text', validate: 'subnet',   required: true, placeholder: '255.255.255.252',    hint: 'Nokta-ondalık subnet maskı' },
                        { name: 'wan_access', why: "Dışarıya açtığın her servis saldırı yüzeyidir. WAN'da <code>https</code> ve <code>ssh</code> açmak yönetim arayüzünü internete açar — mümkünse sadece <code>ping</code> bırak, yönetimi VPN üzerinden yap.", label: 'İzin Verilen Servisler', type: 'text',   required: true, placeholder: 'ping https',         hint: 'Boşlukla ayrılmış: ping https ssh' }
                    ]
                },
                {
                    title: 'LAN Interface',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'lan_port', why: "İç ağa bakan port. Bu porta verdiğin IP, LAN istemcilerinin default gateway'i olur.",   label: 'Interface Adı',          type: 'text',   required: true, placeholder: 'port2',             hint: 'LAN portunu belirtin (ör: port2, internal)' },
                        { name: 'lan_alias', why: 'Kural listesinde <code>internal</code> yerine <code>LAN</code> görmek, özellikle çok portlu cihazlarda yanlış kural yazmayı önler.',  label: 'Alias',                  type: 'text',   required: true, placeholder: 'LAN',               hint: 'İnsan okunabilir kısa ad' },
                        { name: 'lan_ip', why: "Bu adres iç ağın gateway'idir; DHCP dağıtıyorsan istemcilere bu IP'yi vereceksin. Mevcut ağdaki bir IP ile çakışmamasına dikkat et.",     label: 'IP Adresi',              type: 'text', validate: 'ip',   required: true, placeholder: '192.168.1.1',        hint: 'LAN tarafındaki gateway IP' },
                        { name: 'lan_mask', why: 'Ağ büyüklüğünü belirler. <code>255.255.255.0</code> = 254 kullanılabilir adres. Sonradan büyütmek istemci yeniden adreslemesi gerektirir.',   label: 'Subnet Mask',            type: 'text', validate: 'subnet',   required: true, placeholder: '255.255.255.0',      hint: 'Nokta-ondalık subnet maskı' },
                        { name: 'lan_access', why: "İç tarafta <code>https ssh</code> açmak normaldir; yönetim buradan yapılır. <code>ping</code>'i açık bırakmak sorun gidermeyi kolaylaştırır.", label: 'İzin Verilen Servisler', type: 'text',   required: true, placeholder: 'ping https ssh',     hint: 'Boşlukla ayrılmış servis adları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgIfaceGen(data);
        });
    }
};
function cgFgIfaceGen(data) {
    const wan_port = cgEsc(data.wan_port || ''), wan_alias = cgEsc(data.wan_alias || '');
    const wan_ip = cgEsc(data.wan_ip || ''), wan_mask = cgEsc(data.wan_mask || '');
    const wan_access = cgEsc(data.wan_access || '');
    const lan_port = cgEsc(data.lan_port || ''), lan_alias = cgEsc(data.lan_alias || '');
    const lan_ip = cgEsc(data.lan_ip || ''), lan_mask = cgEsc(data.lan_mask || '');
    const lan_access = cgEsc(data.lan_access || '');
    let c = '# ========================================\n# FortiGate — Interface Configuration\n# ========================================\n\n';
    c += 'config system interface\n';
    c += '    edit "' + wan_port + '"\n';
    c += '        set alias "' + wan_alias + '"\n';
    c += '        set mode static\n';
    c += '        set ip ' + wan_ip + ' ' + wan_mask + '\n';
    c += '        set allowaccess ' + wan_access + '\n';
    c += '        set role wan\n';
    c += '    next\n';
    c += '    edit "' + lan_port + '"\n';
    c += '        set alias "' + lan_alias + '"\n';
    c += '        set mode static\n';
    c += '        set ip ' + lan_ip + ' ' + lan_mask + '\n';
    c += '        set allowaccess ' + lan_access + '\n';
    c += '        set role lan\n';
    c += '    next\n';
    c += 'end\n\n';
    c += '# Doğrulama:\n# get system interface\n# diagnose ip address list\n';
    return c;
}

// ── FortiGate: Address Object ─────────────────────────────────────────────────
FortiGate.address = {
    label: 'Address Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-marker-alt',
                title: 'Address Object (FortiGate)',
                desc: 'Güvenlik politikalarında kaynak/hedef olarak kullanılan adres nesneleri: IP/Mask, FQDN veya IP Range.<br><code>config firewall address\n  edit "LAN_SUBNET"\n    set type ipmask\n    set subnet 192.168.1.0 255.255.255.0\n  next\nend</code>'
            },
            configTypes: [
                { id: 'ipmask',  label: 'IP/Mask',   icon: 'fas fa-network-wired', desc: 'Subnet CIDR veya nokta-ondalık',    badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'fqdn',    label: 'FQDN',      icon: 'fas fa-globe',          desc: 'Alan adı tabanlı nesne' },
                { id: 'iprange', label: 'IP Range',  icon: 'fas fa-long-arrow-alt-right', desc: 'Başlangıç–bitiş IP aralığı' }
            ],
            sections: [
                {
                    title: 'Nesne Bilgileri',
                    icon: 'fas fa-tag',
                    fields: [
                        { name: 'obj_name', why: 'Adres nesnesi olmadan kural yazamazsın. İsimlendirmede tutarlı ol (<code>SRV_WEB_01</code> gibi) — 200 kurallı bir cihazda aranabilirlik her şeydir.', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'LAN_SUBNET', hint: 'Policy içinde referans verilecek ad' },
                        { name: 'comment', why: 'Altı ay sonra bu nesneyi neden oluşturduğunu hatırlamayacaksın. Ticket numarası veya sorumlu ekip yazmak denetimlerde hayat kurtarır.',  label: 'Açıklama',  type: 'text', optional: true, placeholder: 'LAN ağı',    hint: 'Opsiyonel açıklama' }
                    ]
                },
                {
                    title: 'IP/Mask Ayarları',
                    icon: 'fas fa-network-wired',
                    showFor: ['ipmask'],
                    fields: [
                        { name: 'subnet', why: 'Tek host için <code>/32</code>, ağ için <code>/24</code> gibi. Çok geniş tanımlamak (<code>0.0.0.0/0</code>) kuralı istemeden herkese açar.', label: 'Subnet (IP Mask)', type: 'text', validate: 'ip_mask', required: true, placeholder: '192.168.1.0 255.255.255.0', hint: 'Nokta-ondalık: IP MASK veya CIDR' }
                    ]
                },
                {
                    title: 'FQDN Ayarları',
                    icon: 'fas fa-globe',
                    showFor: ['fqdn'],
                    fields: [
                        { name: 'fqdn', why: "IP'si sık değişen bulut servisleri için kullanılır; FortiGate DNS'i periyodik çözer. DNS'e erişim koparsa nesne eski IP ile kalır ve erişim sorunları yaşanır.", label: 'FQDN', type: 'text', required: true, placeholder: 'example.com', hint: 'Tam nitelikli alan adı' }
                    ]
                },
                {
                    title: 'IP Range Ayarları',
                    icon: 'fas fa-long-arrow-alt-right',
                    showFor: ['iprange'],
                    fields: [
                        { name: 'range_start', why: "IP Range nesnesinin ilk adresi. Aralık, subnet sınırına oturmak zorunda değildir — bu, CIDR ile ifade edilemeyen adres kümeleri için kullanışlıdır.", label: 'Başlangıç IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.10', hint: 'Aralığın ilk IP adresi' },
                        { name: 'range_end', why: "Son adres. Başlangıçtan küçük olursa nesne oluşturulmaz ve kural sessizce eşleşmez.",   label: 'Bitiş IP',     type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.20', hint: 'Aralığın son IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgAddrGen(data);
        });
    }
};
function cgFgAddrGen(data) {
    const name    = cgEsc(data.obj_name || '');
    const type    = cgEsc(data._cgtype || 'ipmask');
    const comment = cgEsc(data.comment || '');
    let c = '# ========================================\n# FortiGate — Address Object\n# ========================================\n\n';
    c += 'config firewall address\n    edit "' + name + '"\n        set type ' + type + '\n';
    if (type === 'ipmask') {
        c += '        set subnet ' + cgEsc(data.subnet || '') + '\n';
    } else if (type === 'fqdn') {
        c += '        set fqdn "' + cgEsc(data.fqdn || '') + '"\n';
    } else {
        c += '        set start-ip ' + cgEsc(data.range_start || '') + '\n        set end-ip ' + cgEsc(data.range_end || '') + '\n';
    }
    if (comment) c += '        set comment "' + comment + '"\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall address "' + name + '"\n# diagnose firewall address list\n';
    return c;
}

// ── FortiGate: Security Policy ────────────────────────────────────────────────
FortiGate.policy = {
    label: 'Security Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Policy (FortiGate)',
                desc: 'Temel güvenlik politikası — trafik izin/reddi, NAT ve log ayarları.<br><code>config firewall policy\n  edit 1\n    set name "LAN_to_WAN"\n    set srcintf "port2"\n    set dstintf "port1"\n    set action accept\n    set nat enable\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'Kural Tanımı',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'rule_id', why: 'Kural sırası içeriği kadar önemlidir: FortiGate <b>yukarıdan aşağıya ilk eşleşen</b> kuralı uygular. Geniş bir kuralı üste koyarsan altındaki spesifik kurallar hiç çalışmaz.',   label: 'Kural ID',          type: 'text',   required: true, placeholder: '1',                hint: 'Benzersiz politika numarası' },
                        { name: 'rule_name', why: 'Adsız kural, altı ay sonra kimsenin silmeye cesaret edemediği kuraldır. Amacını yaz.', label: 'Kural Adı',         type: 'text',   required: true, placeholder: 'LAN_to_WAN',       hint: 'Politikayı tanımlayan kısa ad' }
                    ]
                },
                {
                    title: 'Kaynak & Hedef',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'srcintf', why: 'Trafiğin <b>girdiği</b> interface. Yanlış yön seçmek kuralın hiç eşleşmemesine yol açar — en sık yapılan hatalardan biri.', label: 'Kaynak Interface', type: 'text',   required: true, placeholder: 'port2',            hint: 'Trafiğin geldiği arayüz' },
                        { name: 'dstintf', why: 'Trafiğin <b>çıktığı</b> interface. VPN trafiği için tünel arayüzünü seçmelisin, fiziksel portu değil.', label: 'Hedef Interface',  type: 'text',   required: true, placeholder: 'port1',            hint: 'Trafiğin çıktığı arayüz' },
                        { name: 'srcaddr', why: 'Önceden tanımlı adres nesnesi olmalı. <code>all</code> seçmek kuralı tüm kaynaklara açar — gerçekten gerekli mi düşün.', label: 'Kaynak Adres',     type: 'text',   required: true, placeholder: 'LAN_SUBNET',       hint: 'Address Object adı veya "all"' },
                        { name: 'dstaddr', why: 'Hedef adres. <code>all</code> + <code>ALL</code> servis kombinasyonu, kural listesindeki en tehlikeli satırdır.', label: 'Hedef Adres',      type: 'text',   required: true, placeholder: 'WEB_SERVERS',              hint: 'Address Object adı veya "all"' },
                        { name: 'service', why: 'Port/protokol kısıtı. <code>ALL</code> yerine yalnızca gereken servisi seçmek, ihlal anında yanal hareketi sınırlar.', label: 'Servis',           type: 'text',   required: true, placeholder: 'HTTPS',              hint: 'Servis nesnesi: ALL, HTTP, HTTPS vb.' }
                    ]
                },
                {
                    title: 'Aksiyon & Log',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'action', why: '<code>accept</code> trafiği geçirir, <code>deny</code> sessizce düşürür. Deny kurallarında log açmazsan neyin engellendiğini asla göremezsin.',      label: 'Aksiyon',        type: 'select', options: [
                            { value: 'accept', label: 'Accept', selected: true },
                            { value: 'deny',   label: 'Deny' }
                        ]},
                        { name: 'nat', why: "Açıkken kaynak IP, çıkış arayüzünün IP'siyle değiştirilir. Site-to-site VPN kurallarında NAT <b>kapalı</b> olmalıdır; açık kalırsa karşı taraf gerçek iç IP'leri göremez ve trafik geri dönmez.",         label: 'NAT',            type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]},
                        { name: 'logtraffic', why: 'Log kapalı kural, olmayan kuraldır. Sorun giderirken ve denetimde ilk bakılan yer <code>Forward Traffic</code> logudur.',  label: 'Log Trafiği',    type: 'select', options: [
                            { value: 'all',     label: 'All',     selected: true },
                            { value: 'utm',     label: 'UTM' },
                            { value: 'disable', label: 'Disable' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgPolicyGen(data);
        });
    }
};
function cgFgPolicyGen(data) {
    const rid = cgEsc(data.rule_id || ''), rname = cgEsc(data.rule_name || '');
    let c = '# ========================================\n# FortiGate — Security Policy\n# ========================================\n\n';
    if (data.action === 'accept' && /^all$/i.test(data.srcaddr || '') && /^all$/i.test(data.dstaddr || '') && /^all$/i.test(data.service || ''))
        c += '# UYARI: kaynak, hedef ve servis "all" — bu kural iki arayüz arasında TÜM trafiğe izin verir.\n';
    c += 'config firewall policy\n    edit ' + rid + '\n';
    c += '        set name "' + rname + '"\n';
    c += '        set srcintf "' + cgEsc(data.srcintf || '') + '"\n';
    c += '        set dstintf "' + cgEsc(data.dstintf || '') + '"\n';
    c += '        set srcaddr "' + cgEsc(data.srcaddr || '') + '"\n';
    c += '        set dstaddr "' + cgEsc(data.dstaddr || '') + '"\n';
    c += '        set action ' + cgEsc(data.action || '') + '\n';
    c += '        set schedule "always"\n';
    c += '        set service "' + cgEsc(data.service || '') + '"\n';
    c += '        set logtraffic ' + cgEsc(data.logtraffic || 'all') + '\n';
    if ((data.nat || 'enable') === 'enable') c += '        set nat enable\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall policy ' + rid + '\n# diagnose firewall iprope show 00100004 ' + rid + '\n';
    return c;
}

// ── FortiGate: NAT / VIP ──────────────────────────────────────────────────────
FortiGate.nat = {
    label: 'NAT / VIP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'NAT / VIP (FortiGate)',
                desc: 'Destination NAT (VIP) veya Source NAT (IP Pool) konfigürasyonu.<br><code>config firewall vip\n  edit "WEB_VIP"\n    set extintf "port1"\n    set extip 203.0.113.10\n    set mappedip "192.168.1.10"\n  next\nend</code>'
            },
            configTypes: [
                { id: 'vip',    label: 'VIP (DNAT)',      icon: 'fas fa-arrow-right', desc: 'Dışarıdan içeriye port yönlendirme',    badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'ippool', label: 'IP Pool (SNAT)',  icon: 'fas fa-random',      desc: 'Kaynak NAT için IP havuzu' }
            ],
            sections: [
                {
                    title: 'VIP Ayarları',
                    icon: 'fas fa-arrow-right',
                    showFor: ['vip'],
                    fields: [
                        { name: 'vip_name', why: "VIP nesnesi tek başına trafiği geçirmez — mutlaka bu VIP'i hedef adres olarak kullanan <b>ayrı bir firewall kuralı</b> (WAN→LAN) gerekir. En sık atlanan adım budur.",       label: 'VIP Adı',              type: 'text',   required: true,  placeholder: 'WEB_VIP',       hint: 'Policy dstaddr kısmında kullanılacak ad' },
                        { name: 'vip_extintf', why: "VIP'in dinleyeceği dış arayüz. Birden fazla WAN varsa yanlış seçim, dışarıdan erişimin hiç çalışmamasına yol açar.",    label: 'External Interface',   type: 'text',   required: true,  placeholder: 'port1',          hint: 'WAN tarafındaki interface' },
                        { name: 'vip_extip', why: "Dışarıdan erişilecek IP. WAN arayüzünün IP'siyle aynı olabilir; farklı bir IP kullanıyorsan ISS'nin o IP'yi yönlendirdiğinden emin ol.",      label: 'External IP',          type: 'text', validate: 'ip',   required: true,  placeholder: '203.0.113.10',   hint: 'Dışarıdan erişilecek genel IP' },
                        { name: 'vip_mappedip', why: "İç sunucunun gerçek IP'si. Firewall kuralında <b>hedef adres olarak VIP nesnesi</b> yazılır, iç IP değil.",   label: 'Mapped IP (İç Sunucu)',type: 'text', validate: 'ip',   required: true,  placeholder: '192.168.1.10',   hint: 'Yönlendirilecek iç sunucu IP' },
                        { name: 'vip_portfwd', why: 'Kapalıyken tüm portlar yönlendirilir (static NAT). Açıkken yalnızca belirtilen port — güvenlik açısından port yönlendirme her zaman daha dar ve tercih edilir.',    label: 'Port Yönlendirme',     type: 'select', options: [
                            { value: 'disable', label: 'Hayır', selected: true },
                            { value: 'enable',  label: 'Evet' }
                        ], hint: 'Belirli port eşleştirmesi gerekiyorsa Evet seçin' },
                        { name: 'vip_extport', why: 'Dışarıdan gelinen port. Standart olmayan port kullanmak (ör. RDP için 3389 yerine başka bir port) otomatik taramaları azaltır ama güvenlik sağlamaz.',    label: 'External Port',        type: 'text', validate: 'port',   optional: true,  placeholder: '80',    hint: 'Dışarıdan gelen port' },
                        { name: 'vip_mappedport', why: 'İç sunucunun dinlediği gerçek port. Dış 8080 → iç 80 gibi çevirmek mümkündür.', label: 'Mapped Port',          type: 'text', validate: 'port',   optional: true,  placeholder: '80',    hint: 'Yönlendirilecek iç port' }
                    ]
                },
                {
                    title: 'IP Pool Ayarları',
                    icon: 'fas fa-random',
                    showFor: ['ippool'],
                    fields: [
                        { name: 'pool_name', why: "IP Pool, giden trafikte kaynak IP'yi belirler. Kurala bağlanmadan tek başına etkisizdir.",  label: 'Pool Adı',       type: 'text', required: true, placeholder: 'SNAT_POOL',     hint: 'Policy ippool parametresi için kullanılır' },
                        { name: 'pool_start', why: "Havuzun ilk IP'si. Bu adresler WAN arayüzüyle aynı subnet'te olmalı ve ISS tarafından yönlendirilmelidir.", label: 'Başlangıç IP',   type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.10',  hint: 'SNAT havuzunun ilk IP adresi' },
                        { name: 'pool_end', why: "IP Pool'un son adresi. Havuz tükendiğinde yeni oturumlar NAT alamaz ve bağlantı kurulamaz.",   label: 'Bitiş IP',       type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.20',  hint: 'SNAT havuzunun son IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgNatGen(data);
        });
    }
};
function cgFgNatGen(data) {
    const type = cgEsc(data._cgtype || 'vip');
    let c = '# ========================================\n# FortiGate — NAT Configuration\n# ========================================\n\n';
    if (type === 'vip') {
        const name    = cgEsc(data.vip_name || '');
        const extintf = cgEsc(data.vip_extintf || '');
        const extip   = cgEsc(data.vip_extip || '');
        const mapped  = cgEsc(data.vip_mappedip || '');
        const pf      = cgEsc(data.vip_portfwd || 'disable');
        c += 'config firewall vip\n    edit "' + name + '"\n';
        c += '        set extintf "' + extintf + '"\n';
        c += '        set extip ' + extip + '\n';
        c += '        set mappedip "' + mapped + '"\n';
        if (pf === 'enable') {
            c += '        set portforward enable\n';
            c += '        set extport ' + cgEsc(data.vip_extport || '') + '\n';
            c += '        set mappedport ' + cgEsc(data.vip_mappedport || '') + '\n';
        }
        c += '    next\nend\n\n';
        c += '# VIP\'i policy\'de dstaddr olarak kullan!\n';
    } else {
        const name  = cgEsc(data.pool_name || '');
        const start = cgEsc(data.pool_start || '');
        const end   = cgEsc(data.pool_end || '');
        c += 'config firewall ippool\n    edit "' + name + '"\n';
        c += '        set startip ' + start + '\n        set endip ' + end + '\n';
        c += '        set type overload\n    next\nend\n\n';
        c += '# Policy\'de "set nat enable" + "set ippool ' + name + '" kullan!\n';
    }
    c += '\n# Doğrulama:\n# show firewall vip\n# show firewall ippool\n# diagnose firewall fqdn list\n';
    return c;
}

// ── FortiGate: IPSec VPN ──────────────────────────────────────────────────────
FortiGate.ipsec = {
    label: 'IPSec VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'IPSec VPN (FortiGate)',
                desc: 'Site-to-site IPSec VPN — Phase1 IKE parametreleri ve Phase2 tüneli.<br><code>config vpn ipsec phase1-interface\n  edit "VPN_P1"\n    set interface "port1"\n    set remote-gw 203.0.113.2\n    set psksecret ...\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Phase 1 — IKE',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'p1_name', why: 'Tünel adı aynı zamanda sanal arayüz adı olur; statik rota ve firewall kuralında bu adı kullanacaksın.',    label: 'Phase 1 Adı',      type: 'text',   required: true,  placeholder: 'VPN_P1',           hint: 'Tunnel interface adı olarak da kullanılır' },
                        { name: 'p1_iface', why: 'Tünelin kurulacağı dış arayüz. Birden fazla WAN varsa yanlış seçim tünelin hiç kurulmamasına yol açar.',   label: 'WAN Interface',    type: 'text', validate: 'iface',   required: true,  placeholder: 'port1',             hint: 'VPN trafiğinin çıkacağı WAN arayüzü' },
                        { name: 'remote_gw', why: "Karşı tarafın <b>gerçek</b> WAN IP'si. NAT arkasındaysa bu IP dış IP olmalı; yanlışsa Phase 1 hiç başlamaz (<code>diagnose sniffer packet</code> ile UDP 500 gelmediğini görürsün).",  label: 'Uzak Gateway IP',  type: 'text', validate: 'ip',   required: true,  placeholder: '203.0.113.2',       hint: 'Karşı tarafın WAN IP adresi' },
                        { name: 'psk', why: 'İki tarafta <b>birebir</b> aynı olmalı. Kopyala-yapıştır sırasında sondaki boşluk en klasik hatadır. Uzun ve rastgele seç — zayıf PSK tüm tünelin güvenliğini düşürür.',        label: 'Pre-Shared Key',   type: 'text',   required: true,  placeholder: 'MyS3cr3tKey!',      hint: 'Her iki tarafta aynı PSK kullanılmalı' },
                        { name: 'ike_ver', why: 'IKEv2 daha az round-trip, daha iyi NAT geçişi ve MOBIKE desteği sunar. Karşı taraf desteklemiyorsa IKEv1 zorunlu kalır — <b>iki tarafta aynı sürüm</b> olmalı.',    label: 'IKE Versiyon',     type: 'select', options: [
                            { value: '2', label: 'IKEv2', selected: true },
                            { value: '1', label: 'IKEv1' }
                        ]},
                        { name: 'proposal', why: 'Şifreleme ve hash algoritması. İki tarafta en az bir ortak proposal olmalı, yoksa Phase 1 kurulamaz. <code>aes256-sha256</code> günümüz için makul bir taban.',   label: 'Proposal',         type: 'select', options: [
                            { value: 'aes256-sha256', label: 'AES256-SHA256', selected: true },
                            { value: 'aes128-sha256', label: 'AES128-SHA256' },
                            { value: 'aes256-sha1',   label: 'AES256-SHA1' }
                        ]},
                        { name: 'dhgrp', why: 'Anahtar değişimi için kullanılan grup. Grup 1, 2 ve 5 artık güvensiz kabul edilir; 14 (2048-bit) alt sınırdır. İki tarafta aynı grup seçilmeli.',      label: 'DH Group',         type: 'select', options: [
                            { value: '14', label: 'Group 14', selected: true },
                            { value: '19', label: 'Group 19 (EC)' },
                            { value: '5',  label: 'Group 5 (eski)' }
                        ]}
                    ]
                },
                {
                    title: 'Phase 2 — Tünel',
                    icon: 'fas fa-tunnel',
                    fields: [
                        { name: 'p2_name', why: "Phase 2, hangi trafiğin şifreleneceğini belirler. Phase 1 kurulup Phase 2 kurulmazsa tünel 'up' görünür ama trafik geçmez.",       label: 'Phase 2 Adı',      type: 'text', required: true, placeholder: 'VPN_P2',                       hint: 'Her tünel için benzersiz ad' },
                        { name: 'local_subnet', why: "Bu tarafın şifrelenecek ağı. Trafik seçicileri iki tarafta <b>ayna</b> olmalı: senin local'in karşının remote'u olmalı.",  label: 'Yerel Subnet',     type: 'text', required: true, placeholder: '192.168.1.0 255.255.255.0',     hint: 'Nokta-ondalık: IP MASK formatı' },
                        { name: 'remote_subnet', why: 'Karşı tarafın ağı. Bu subnet için <b>statik rota</b> ve <b>iki yönlü firewall kuralı</b> da gerekir — tünel kurulup trafiğin akmamasının en yaygın sebebi budur.', label: 'Uzak Subnet',      type: 'text', required: true, placeholder: '10.0.0.0 255.255.255.0',        hint: 'Karşı tarafın iç ağı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgIpsecGen(data);
        });
    }
};
function cgFgIpsecGen(data) {
    const p1       = cgEsc(data.p1_name || '');
    const iface    = cgEsc(data.p1_iface || '');
    const gw       = cgEsc(data.remote_gw || '');
    const psk      = cgEsc(data.psk || '');
    const ikever   = cgEsc(data.ike_ver || '2');
    const proposal = cgEsc(data.proposal || 'aes256-sha256');
    const dhgrp    = cgEsc(data.dhgrp || '14');
    const p2       = cgEsc(data.p2_name || '');
    const lsub     = cgEsc(data.local_subnet || '');
    const rsub     = cgEsc(data.remote_subnet || '');
    let c = '# ========================================\n# FortiGate — IPSec VPN Configuration\n# ========================================\n\n';
    c += 'config vpn ipsec phase1-interface\n    edit "' + p1 + '"\n';
    c += '        set interface "' + iface + '"\n';
    c += '        set peertype any\n';
    c += '        set remote-gw ' + gw + '\n';
    c += '        set authmethod psk\n';
    c += '        set psksecret ' + psk + '\n';
    c += '        set ike-version ' + ikever + '\n';
    c += '        set proposal ' + proposal + '\n';
    c += '        set dhgrp ' + dhgrp + '\n';
    c += '    next\nend\n\n';
    c += 'config vpn ipsec phase2-interface\n    edit "' + p2 + '"\n';
    c += '        set phase1name "' + p1 + '"\n';
    c += '        set proposal ' + proposal + '\n';
    c += '        set dhgrp ' + dhgrp + '\n';
    c += '        set src-subnet ' + lsub + '\n';
    c += '        set dst-subnet ' + rsub + '\n';
    c += '    next\nend\n\n';
    c += '# Tunnel interface routing\'i de ayarla:\n# config router static\n#     edit 0\n#         set dst <remote-net>\n#         set device "' + p1 + '"\n#     next\n# end\n\n';
    c += '# Doğrulama:\n# get vpn ipsec tunnel summary\n# diagnose vpn ike gateway list\n# diagnose vpn tunnel list\n';
    return c;
}

// ── FortiGate: SSL-VPN ────────────────────────────────────────────────────────
FortiGate.sslvpn = {
    label: 'SSL-VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'SSL-VPN (FortiGate)',
                desc: 'FortiClient / web tabanlı SSL-VPN portali ve tunnel-mode konfigürasyonu.<br><code>config vpn ssl settings\n  set port 10443\n  set tunnel-ip-pools "SSLVPN_TUNNEL_ADDR1"\n  set source-interface "port1"\nend</code>'
            },
            sections: [
                {
                    title: 'SSL-VPN Genel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'src_iface', why: "SSL-VPN'in dinleyeceği dış arayüz. Yönetim arayüzüyle <b>aynı portu</b> paylaşırsa çakışma olur.",   label: 'WAN Interface',        type: 'text', validate: 'iface', required: true, placeholder: 'port1',                          hint: 'SSL-VPN dinleyeceği WAN arayüzü' },
                        { name: 'ssl_port', why: "Varsayılan 443, ama yönetim arayüzü de 443 kullanır. İkisini aynı portta bırakmak yönetim erişimini kırar — SSL-VPN'i 10443 gibi bir porta almak yaygın pratiktir.",    label: 'SSL-VPN Port',         type: 'text', validate: 'port', required: true, placeholder: '10443',                          hint: 'HTTPS 443\'ten farklı bir port önerilir' },
                        { name: 'tunnel_pool', why: 'VPN istemcilerine dağıtılacak IP havuzu. İç ağdaki hiçbir subnet ile <b>çakışmamalı</b>, aksi halde yönlendirme kırılır.', label: 'Tunnel IP Pool Adı',   type: 'text', required: true, placeholder: 'SSLVPN_TUNNEL_ADDR1',            hint: 'IP pool nesnesinin adı' },
                        { name: 'pool_range', why: 'Havuz aralığı eşzamanlı kullanıcı sayısından büyük olmalı. Dolduğunda yeni kullanıcılar sessizce bağlanamaz.',  label: 'IP Pool Aralığı',      type: 'text', validate: 'ip_range', required: true, placeholder: '10.212.134.200-10.212.134.210',  hint: 'Başlangıç-Bitiş formatında IP aralığı' }
                    ]
                },
                {
                    title: 'Portal & Grup Ayarları',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'src_addr',     why: 'SSL-VPN portalına bağlanabilecek kaynak adresler. <code>all</code> portalı tüm internete açar; brute-force ve zafiyet taramalarının büyük kısmı buradan gelir. Coğrafi (geography) veya IP adres nesnesiyle daraltın.', label: 'İzinli Kaynak Adres', type: 'text', required: true, placeholder: 'VPN_ALLOWED_SRC', hint: 'Adres nesnesi veya grubu (herkese açmak için all)' },
                        { name: 'server_cert',  why: '<code>Fortinet_Factory</code> self-signed fabrika sertifikasıdır; istemciler sertifika uyarısı alır ve kullanıcıları uyarıyı geçmeye alıştırır — MITM\'e kapı açar. Güvenilir bir CA\'dan alınmış sertifika yükleyin.', label: 'Sunucu Sertifikası', type: 'text', required: true, placeholder: 'SSLVPN_CERT', hint: 'Yüklenmiş sertifika adı (Fortinet_Factory değil)' },
                        { name: 'portal_name', why: 'Portal, kullanıcının hangi kaynaklara ve hangi modda (web/tunnel) erişeceğini belirler. Kullanıcı grubuna atanmazsa erişim olmaz.', label: 'Portal Adı',      type: 'text', required: true, placeholder: 'full-access', hint: 'Web portal şablonu adı' },
                        { name: 'vpn_group', why: 'Erişim yetkisi kullanıcı grubuna göre verilir. Grubu geniş tutmak, ayrılan çalışanların erişiminin sürmesine yol açar. LDAP/RADIUS entegrasyonu merkezi yönetim sağlar.',   label: 'VPN User Group',  type: 'text', required: true, placeholder: 'VPN_USERS',   hint: 'Kullanıcı grubunun portal erişimini bağlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgSslvpnGen(data);
        });
    }
};
function cgFgSslvpnGen(data) {
    const iface  = cgEsc(data.src_iface || '');
    const port   = cgEsc(data.ssl_port || '10443');
    const pool   = cgEsc(data.tunnel_pool || '');
    const range  = cgEsc(data.pool_range || '');
    const portal = cgEsc(data.portal_name || '');
    const grp    = cgEsc(data.vpn_group || '');
    const srcAddr = cgEsc(data.src_addr || ''), cert = cgEsc(data.server_cert || '');
    let c = '# ========================================\n# FortiGate — SSL-VPN Configuration\n# ========================================\n\n';
    c += '# 1. Tunnel IP Havuzu\nconfig firewall address\n    edit "' + pool + '"\n        set type iprange\n';
    const parts = range.split('-');
    if (parts.length === 2) {
        c += '        set start-ip ' + parts[0].trim() + '\n        set end-ip ' + parts[1].trim() + '\n';
    }
    c += '    next\nend\n\n';
    c += '# 2. SSL-VPN Portal\nconfig vpn ssl web portal\n    edit "' + portal + '"\n';
    c += '        set tunnel-mode enable\n        set web-mode enable\n';
    c += '        set ip-pools "' + pool + '"\n    next\nend\n\n';
    c += '# 3. SSL-VPN Ayarları (kimlik doğrulama kuralı dahil)\nconfig vpn ssl settings\n';
    c += '    set servercert "' + cert + '"\n';
    c += '    set tunnel-ip-pools "' + pool + '"\n';
    c += '    set source-interface "' + iface + '"\n';
    c += '    set source-address "' + srcAddr + '"\n';
    c += '    set default-portal "' + portal + '"\n';
    c += '    set port ' + port + '\n';
    // authentication-rule 'vpn ssl settings' altindadir, portal altinda degil
    c += '    config authentication-rule\n        edit 1\n            set groups "' + grp + '"\n            set portal "' + portal + '"\n        next\n    end\nend\n\n';
    c += '# Doğrulama:\n# get vpn ssl monitor\n# diagnose vpn ssl list\n# diagnose vpn ssl hw-acceleration-status\n';
    return c;
}

// ── FortiGate: Security Profiles (UTM) ───────────────────────────────────────
FortiGate.secprofile = {
    label: 'Security Profiles (UTM)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-virus',
                title: 'Security Profiles — UTM (FortiGate)',
                desc: 'AV, IPS, Web Filter ve Application Control profilleri oluşturup policy\'e bağlar.<br><code>config firewall policy\n  edit 10\n    set utm-status enable\n    set av-profile "corp-av"\n    set ips-sensor "corp-ips"\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'Profil Adları',
                    icon: 'fas fa-tag',
                    info: 'Her profil ayrı oluşturulur ve belirtilen policy ID\'sine bağlanır.',
                    fields: [
                        { name: 'av_name', why: 'Antivirüs profili firewall kuralına <b>bağlanmalıdır</b>; oluşturmak tek başına korumaz. Ayrıca HTTPS trafiğinde tarama için SSL Inspection gerekir.',   label: 'AV Profil Adı',         type: 'text', required: true, placeholder: 'corp-av',        hint: 'Antivirus profil adı' },
                        { name: 'ips_name', why: "IPS sensörü kurala bağlanmadan çalışmaz. Üretimde önce <code>monitor</code> ile izleyip sonra <code>block</code>'a geçmek kesintiyi önler.",  label: 'IPS Sensor Adı',        type: 'text', required: true, placeholder: 'corp-ips',       hint: 'IPS sensor adı' },
                        { name: 'wf_name', why: "Web Filter profili. HTTPS sitelerde kategori tespiti için SSL Inspection açık olmalı; aksi halde yalnızca SNI'ye bakılır.",   label: 'Web Filter Profil Adı', type: 'text', required: true, placeholder: 'corp-webfilter', hint: 'Web filtre profil adı' },
                        { name: 'app_name', why: 'Application Control, uygulamayı port/protokolden bağımsız tanır. Böylece 443 üzerinden geçen TeamViewer veya torrent yakalanabilir.',  label: 'App Control Liste Adı', type: 'text', required: true, placeholder: 'corp-appctrl',   hint: 'Uygulama denetim listesi adı' }
                    ]
                },
                {
                    title: 'Policy Binding',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'policy_id', why: "Kural numarası sırayı belirler ve FortiGate <b>ilk eşleşen</b> kuralı uygular. Yeni kuralı listenin sonuna eklemek, üstteki geniş bir kural yüzünden hiç çalışmamasına yol açabilir.",  label: 'Policy ID',      type: 'text',   required: true, placeholder: '10',   hint: 'UTM profillerinin bağlanacağı kural ID' },
                        { name: 'logtraffic', why: 'Log kapalı kural, olmayan kuraldır. Sorun giderirken ve denetimde ilk bakılan yer <code>Forward Traffic</code> logudur.', label: 'Log Trafiği',    type: 'select', options: [
                            { value: 'all', label: 'All', selected: true },
                            { value: 'utm', label: 'UTM only' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgSecProfGen(data);
        });
    }
};
function cgFgSecProfGen(data) {
    const avName   = cgEsc(data.av_name || '');
    const ipsName  = cgEsc(data.ips_name || '');
    const wfName   = cgEsc(data.wf_name || '');
    const appName  = cgEsc(data.app_name || '');
    const policyId = cgEsc(data.policy_id || '');
    const log      = cgEsc(data.logtraffic || 'all');
    let c = '# ========================================\n# FortiGate — Security Profiles (UTM) + Policy Binding\n# ========================================\n\n';
    c += '! 1. Antivirus Profil\nconfig antivirus profile\n    edit "' + avName + '"\n';
    c += '        config http\n            set options scan\n        end\n';
    c += '        config ftp\n            set options scan\n        end\n';
    c += '        set comment "Corporate AV profile"\n    next\nend\n\n';
    c += '! 2. IPS Sensor\nconfig ips sensor\n    edit "' + ipsName + '"\n';
    c += '        config entries\n            edit 1\n                set severity high critical\n                set status enable\n            next\n        end\n';
    c += '        set comment "Corporate IPS sensor"\n    next\nend\n\n';
    c += '! 3. Web Filter Profil\nconfig webfilter profile\n    edit "' + wfName + '"\n';
    c += '        set comment "Corporate web filter"\n';
    c += '        config ftgd-wf\n            config filters\n                edit 1\n                    set category 26\n                    set action block\n                next\n            end\n        end\n    next\nend\n\n';
    c += '! 4. Application Control\nconfig application list\n    edit "' + appName + '"\n';
    c += '        set comment "Corporate app control"\n';
    c += '        config entries\n            edit 1\n                set category 2\n                set action block\n            next\n        end\n    next\nend\n\n';
    c += '! 5. Policy\'e UTM Profilleri Bağla\nconfig firewall policy\n    edit ' + policyId + '\n';
    c += '        set utm-status enable\n';
    c += '        set av-profile "' + avName + '"\n';
    c += '        set ips-sensor "' + ipsName + '"\n';
    c += '        set webfilter-profile "' + wfName + '"\n';
    c += '        set application-list "' + appName + '"\n';
    c += '        set logtraffic ' + log + '\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show antivirus profile "' + avName + '"\n# show ips sensor "' + ipsName + '"\n# show firewall policy ' + policyId + '\n# diagnose firewall iprope show 00100004 ' + policyId + '\n';
    return c;
}

// ── FortiGate: SD-WAN ─────────────────────────────────────────────────────────
FortiGate.sdwan = {
    label: 'SD-WAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'SD-WAN (FortiGate)',
                desc: 'Çoklu WAN bağlantısı üzerinde SLA tabanlı trafik yönlendirme. Health-check ve failover politikası.<br><code>config system sdwan\n  set status enable\n  config members\n    edit 1\n      set interface "port1"\n    next\n  end\nend</code>',
            },
            sections: [
                {
                    title: 'WAN1 Üyesi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'wan1_iface', why: 'SD-WAN üyesi arayüz. Üye eklenmeden önce o arayüzün <b>statik rotası kaldırılmalıdır</b>; SD-WAN kendi rotasını yönetir.', label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'port1',       hint: 'Birincil WAN bağlantısının arayüzü' },
                        { name: 'wan1_gw', why: "Üyenin gateway'i. Yanlışsa health check hep başarısız olur ve o hat hiç kullanılmaz.",    label: 'Gateway',   type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'ISP tarafından verilen default gateway' },
                        { name: 'wan1_cost', why: 'Maliyet, eşit performanslı hatlar arasında tercih belirler. Düşük maliyet kazanır.',  label: 'Maliyet',   type: 'text', optional: true, placeholder: '0',           hint: 'Düşük değer daha yüksek öncelik (varsayılan: 0)' }
                    ]
                },
                {
                    title: 'WAN2 Üyesi',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'wan2_iface', why: "İkinci SD-WAN üyesi. Üye eklemeden önce o arayüzün statik rotası kaldırılmalıdır; SD-WAN kendi rotasını yönetir.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'port2',       hint: 'İkincil WAN bağlantısının arayüzü' },
                        { name: 'wan2_gw', why: "İkinci hattın gateway'i. Yanlışsa health check hep başarısız olur ve yedek hat hiç devreye girmez — arıza anında fark edilir.",    label: 'Gateway',   type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1',hint: 'İkinci ISP tarafından verilen gateway' },
                        { name: 'wan2_cost', why: "Maliyet, eşit performanslı hatlar arasında tercih belirler. Yedek hattı daha yüksek maliyetle işaretlemek, yalnızca birincil hat düştüğünde kullanılmasını sağlar.",  label: 'Maliyet',   type: 'text', optional: true, placeholder: '10',          hint: 'WAN1\'den yüksek tutulması önerilir (ör: 10)' }
                    ]
                },
                {
                    title: 'Health Check & SLA',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'hc_server', why: "Health check hedefi. <b>ISS'den bağımsız</b> bir adres seç (kendi veri merkezin gibi); ISS'nin DNS'ine ping atmak yanıltıcı sonuç verir.",  label: 'Health Check Sunucusu', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'Ping ile test edilecek IP (genellikle DNS)' },
                        { name: 'hc_latency', why: 'Gecikme eşiği. Bu değerin üstündeki hat SLA dışı sayılır. Eşiği çok dar tutmak gereksiz hat değişimine (flapping) yol açar.', label: 'Latency Eşiği (ms)',    type: 'text', optional: true, placeholder: '150',     hint: 'Aşıldığında link degrade sayılır' },
                        { name: 'hc_jitter', why: "Jitter eşiği özellikle VoIP için kritiktir. Ses kalitesi jitter'a gecikmeden daha duyarlıdır.",  label: 'Jitter Eşiği (ms)',     type: 'text', optional: true, placeholder: '30',      hint: 'Jitter tolerans sınırı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgSdwanGen(data);
        });
    }
};
function cgFgSdwanGen(data) {
    const w1i      = cgEsc(data.wan1_iface || '');
    const w1g      = cgEsc(data.wan1_gw || '');
    const w1c      = cgEsc(data.wan1_cost || '0');
    const w2i      = cgEsc(data.wan2_iface || '');
    const w2g      = cgEsc(data.wan2_gw || '');
    const w2c      = cgEsc(data.wan2_cost || '10');
    const hcServer = cgEsc(data.hc_server || '8.8.8.8');
    const hcLat    = cgEsc(data.hc_latency || '150');
    const hcJit    = cgEsc(data.hc_jitter || '30');
    let c = '# ========================================\n# FortiGate — SD-WAN\n# ========================================\n\n';
    c += 'config system sdwan\n    set status enable\n';
    c += '    config members\n';
    c += '        edit 1\n            set interface "' + w1i + '"\n            set gateway ' + w1g + '\n            set cost ' + w1c + '\n        next\n';
    c += '        edit 2\n            set interface "' + w2i + '"\n            set gateway ' + w2g + '\n            set cost ' + w2c + '\n        next\n';
    c += '    end\n';
    c += '    config health-check\n        edit "hc-primary"\n';
    c += '            set server "' + hcServer + '"\n            set protocol ping\n';
    c += '            config sla\n                edit 1\n';
    c += '                    set latency-threshold ' + hcLat + '\n';
    c += '                    set jitter-threshold ' + hcJit + '\n';
    c += '                next\n            end\n        next\n    end\n';
    c += '    config service\n        edit 1\n            set name "primary-route"\n            set mode sla\n';
    c += '            config sla\n                edit "hc-primary"\n                    set id 1\n                next\n            end\n';
    c += '            set priority-members 1 2\n        next\n    end\nend\n\n';
    c += '# Statik route SD-WAN zone\'a yönlendir:\n# config router static\n#     edit 1\n#         set dst 0.0.0.0/0\n#         set sdwan-zone "virtual-wan-link"\n#     next\n# end\n\n';
    c += '# Doğrulama:\n# diagnose sys sdwan member\n# diagnose sys sdwan health-check\n# diagnose sys sdwan service\n# get system sdwan\n';
    return c;
}

// ── FortiGate: HA Active-Passive ──────────────────────────────────────────────
FortiGate.ha = {
    label: 'HA Active-Passive',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'HA Active-Passive (FortiGate)',
                desc: 'Aktif-Pasif yüksek erişilebilirlik konfigürasyonu. Her cihaza ayrı ayrı uygulanır; priority değeri ayırt eder.<br><code>config system ha\n  set mode a-p\n  set group-name "FG-HA-CLUSTER"\n  set priority 200\nend</code>',
            },
            sections: [
                {
                    title: 'HA Temel Ayarlar',
                    icon: 'fas fa-crown',
                    fields: [
                        { name: 'ha_role', why: "Active-Passive'de tek cihaz trafik işler. İki cihazın <b>aynı FortiOS sürümü ve aynı model</b> olması zorunludur.",      label: 'Rol',               type: 'select', options: [
                            { value: 'primary',   label: 'Primary',   selected: true },
                            { value: 'secondary', label: 'Secondary' }
                        ], hint: 'Bu cihazın HA kümesindeki rolü' },
                        { name: 'grp_name', why: 'HA grup adı iki üyede aynı olmalı. Aynı L2 segmentindeki farklı HA çiftlerinde ise <b>farklı</b> olmalı, aksi halde üyeler birbirini yanlış eşleştirir.',     label: 'HA Grup Adı',       type: 'text',   required: true, placeholder: 'FG-HA-CLUSTER',   hint: 'İki cihazda aynı olmalı' },
                        { name: 'ha_pass', why: "HA şifresi iki üyede aynı olmalı. Şifresiz HA, aynı ağa takılan başka bir FortiGate'in cluster'a katılmasına açık kapı bırakır.",      label: 'HA Şifresi',        type: 'text',   required: true, placeholder: 'ha-secret123',    hint: 'İki cihazda aynı olmalı' },
                        { name: 'hb_iface', why: "Heartbeat arayüzü üyeler arasında <b>doğrudan</b> bağlanmalı (switch üzerinden değil). Kopması split-brain'e yol açar; en az iki heartbeat arayüzü önerilir.",     label: 'Heartbeat Interface\'lar', type: 'text', validate: 'iface_range', required: true, placeholder: 'port3 port4', hint: 'Boşlukla ayrılmış arayüz adları' },
                        { name: 'priority', why: 'Yüksek öncelikli üye primary olur. <code>override</code> kapalıyken primary döndüğünde rolü geri almaz — bu ikinci kesintiyi önler.',     label: 'Öncelik',           type: 'text',   required: true, placeholder: '200',             hint: 'Primary\'de yüksek (ör: 200), Secondary\'de düşük (ör: 100)' },
                        { name: 'session_sync', why: "Açıkken mevcut TCP oturumları failover'da kopmaz. Kapalıysa failover anında tüm bağlantılar yeniden kurulur; kullanıcı kesinti hisseder.", label: 'Session Sync',      type: 'select', options: [
                            { value: 'enable',  label: 'Evet', selected: true },
                            { value: 'disable', label: 'Hayır' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgHaGen(data);
        });
    }
};
function cgFgHaGen(data) {
    const role        = cgEsc(data.ha_role || 'primary');
    const grpName     = cgEsc(data.grp_name || '');
    const haPass      = cgEsc(data.ha_pass || '');
    const hbIface     = cgEsc(data.hb_iface || '');
    const priority    = cgEsc(data.priority || '200');
    const sessionSync = cgEsc(data.session_sync || 'enable');
    const hbPorts     = hbIface.trim().split(/\s+/);
    let c = '# ========================================\n# FortiGate — HA Active-Passive (' + (role === 'primary' ? 'Primary' : 'Secondary') + ')\n# ========================================\n\n';
    c += 'config system ha\n';
    c += '    set mode a-p\n';
    c += '    set group-name "' + grpName + '"\n';
    c += '    set password "' + haPass + '"\n';
    c += '    set priority ' + priority + '\n';
    c += '    set session-pickup ' + sessionSync + '\n';
    hbPorts.forEach((p, i) => {
        c += '    set hbdev "' + cgEsc(p) + '" ' + (i * 50) + '\n';
    });
    c += 'end\n\n';
    c += '# NOT: HA konfigürasyonu her iki cihaza ayrı ayrı uygulanır.\n';
    c += '# Secondary için priority değerini düşük tutun (ör: 100).\n\n';
    c += '# Doğrulama:\n# get system ha status\n# diagnose sys ha status\n# diagnose sys ha checksum cluster\n';
    return c;
}

// ── FortiGate: VLAN Interface ─────────────────────────────────────────────────
FortiGate.vlanintf = {
    label: 'VLAN Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'VLAN Interface (FortiGate)',
                desc: 'Mevcut bir fiziksel porta bağlı VLAN alt arayüzü oluşturur ve opsiyonel olarak zone\'a ekler.<br><code>config system interface\n  edit "VLAN100"\n    set type vlan\n    set vlanid 100\n    set interface "port1"\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'VLAN Interface',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'name', why: "VLAN alt arayüzünün adı. FortiOS'ta bu ad kural ve rotalarda kullanılır; sonradan değiştirmek bağlı tüm nesneleri etkiler.",         label: 'VLAN Interface Adı', type: 'text', required: true, placeholder: 'VLAN100',           hint: 'Yeni alt interface adı' },
                        { name: 'vlan_id', why: "802.1Q etiketi (1-4094). Karşı switch portu <b>trunk</b> modda ve bu VLAN'a izin veriyor olmalı, yoksa tag'li trafik sessizce düşer.",      label: 'VLAN ID',            type: 'text', validate: 'vlan', required: true, placeholder: '100',               hint: '1–4094 arası VLAN ID' },
                        { name: 'parent_intf', why: "VLAN alt arayüzünün bağlanacağı fiziksel arayüz. FortiOS'ta ad <code>port1</code> üzerinde <code>VLAN100</code> şeklinde oluşur.",  label: 'Parent Interface',   type: 'text', validate: 'iface', required: true, placeholder: 'port1',             hint: 'Trunk port (ör: port1, internal)' },
                        { name: 'ip', why: "Alt arayüz IP'si, o VLAN'daki istemcilerin gateway'i olur.",           label: 'IP Adresi',          type: 'text', validate: 'ip', required: true, placeholder: '192.168.100.1',     hint: 'Bu VLAN\'ın gateway IP\'si' },
                        { name: 'mask', why: "Subnet maskesi nokta-ondalık verilir. Ağ büyüklüğünü belirler; sonradan büyütmek istemci yeniden adreslemesi gerektirir.",         label: 'Subnet Mask',        type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0',     hint: 'Nokta-ondalık subnet maskı' },
                        { name: 'zone', why: "Zone, birden fazla arayüzü tek isimde gruplar ve kural sayısını azaltır. Zone'a alınan arayüzler arası trafik varsayılan olarak <b>engellidir</b>.",         label: 'Zone Adı',           type: 'text', required: true, placeholder: 'LAN',              hint: 'Arayüzün atanacağı zone' },
                        { name: 'allowaccess', why: 'Bu arayüzden hangi yönetim servislerine erişilebileceği. WAN tarafında <code>https</code>/<code>ssh</code> açmak yönetim arayüzünü internete açar — mümkünse yalnızca <code>ping</code> bırak.',  label: 'İzin Verilen Servisler', type: 'text', optional: true, placeholder: 'ping https', hint: 'Boşlukla ayrılmış: ping https ssh' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgVlanIntfGen(data);
        });
    }
};
function cgFgVlanIntfGen(data) {
    const name   = cgEsc(data.name || '');
    const vlanId = cgEsc(data.vlan_id || '');
    const parent = cgEsc(data.parent_intf || '');
    const ip     = cgEsc(data.ip || '');
    const mask   = cgEsc(data.mask || '');
    const zone   = cgEsc(data.zone || '');
    const allow  = cgEsc(data.allowaccess || '');
    let c = '# ========================================\n# FortiGate — VLAN Interface\n# ========================================\n\n';
    c += 'config system interface\n    edit "' + name + '"\n';
    c += '        set type vlan\n        set vlanid ' + vlanId + '\n';
    c += '        set interface "' + parent + '"\n        set ip ' + ip + ' ' + mask + '\n';
    if (allow) c += '        set allowaccess ' + allow + '\n';
    c += '        set role lan\n    next\nend\n\n';
    c += 'config system zone\n    edit "' + zone + '"\n        set interface "' + name + '"\n    next\nend\n\n';
    c += '# Doğrulama:\n# get system interface ' + name + '\n# show system zone ' + zone + '\n';
    return c;
}

// ── FortiGate: DHCP Server ────────────────────────────────────────────────────
FortiGate.dhcp = {
    label: 'DHCP Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-hand-holding-medical',
                title: 'DHCP Server (FortiGate)',
                desc: 'Belirtilen arayüzde istemcilere IP dağıtan DHCP sunucusu konfigürasyonu.<br><code>config system dhcp server\n  edit 0\n    set interface "VLAN100"\n    set default-gateway 192.168.100.1\n    ...\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'DHCP Server',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'interface', why: "DHCP sunucusunun çalışacağı arayüz. Yanlış arayüz seçmek, istemcilerin adres alamamasına ve sorunun DHCP yerine kabloda aranmasına yol açar.", label: 'Interface',          type: 'text', validate: 'iface', required: true,  placeholder: 'VLAN100',         hint: 'DHCP sunucusunun çalışacağı arayüz' },
                        { name: 'start_ip', why: 'DHCP havuzunun başı. Statik IP verilen sunucular bu aralığın <b>dışında</b> kalmalı, aksi halde IP çakışması yaşanır.',  label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true,  placeholder: '192.168.100.10',  hint: 'Dağıtılacak IP aralığının başlangıcı' },
                        { name: 'end_ip', why: "Havuzun son adresi. Havuz boyutu eşzamanlı istemci sayısından büyük olmalı; dolduğunda yeni cihazlar sessizce adres alamaz.",    label: 'Pool Bitiş IP',     type: 'text', validate: 'ip', required: true,  placeholder: '192.168.100.200', hint: 'Dağıtılacak IP aralığının sonu' },
                        { name: 'gateway', why: "İstemcilere dağıtılacak varsayılan ağ geçidi. Genelde FortiGate'in o arayüzdeki IP'sidir.",   label: 'Default Gateway',   type: 'text', validate: 'ip', required: true,  placeholder: '192.168.100.1',   hint: 'İstemcilere verilecek varsayılan gateway' },
                        { name: 'mask', why: "Subnet maskesi nokta-ondalık verilir. Ağ büyüklüğünü belirler; sonradan büyütmek istemci yeniden adreslemesi gerektirir.",      label: 'Subnet Mask',       type: 'text', validate: 'subnet', required: true,  placeholder: '255.255.255.0',   hint: 'Nokta-ondalık subnet maskı' },
                        { name: 'dns1', why: 'İç kaynaklara isimle erişim için <b>iç DNS sunucusu</b> verilmelidir. Dış DNS vermek, iç sunucuların bulunamamasına yol açar.',      label: 'DNS Sunucu 1',      type: 'text', validate: 'ip', required: true,  placeholder: '8.8.8.8',         hint: 'Birincil DNS sunucusu' },
                        { name: 'dns2', why: "Yedek DNS. Tek DNS vermek, o sunucu düştüğünde tüm ağın isim çözümlemesini kaybetmesi demektir.",      label: 'DNS Sunucu 2',      type: 'text', validate: 'ip', optional: true,  placeholder: '8.8.4.4',         hint: 'İkincil DNS sunucusu (opsiyonel)' },
                        { name: 'lease', why: 'Lease süresi kısa olursa DHCP trafiği artar, uzun olursa havuz dolabilir. Misafir ağlarında kısa (ör. 2 saat) tutmak mantıklıdır.',     label: 'Lease Süresi (sn)', type: 'text', required: true,  placeholder: '86400',           hint: 'IP kiralama süresi saniye cinsinden (86400 = 1 gün)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgDhcpGen(data);
        });
    }
};
function cgFgDhcpGen(data) {
    const iface   = cgEsc(data.interface || '');
    const startIp = cgEsc(data.start_ip || '');
    const endIp   = cgEsc(data.end_ip || '');
    const gw      = cgEsc(data.gateway || '');
    const mask    = cgEsc(data.mask || '');
    const dns1    = cgEsc(data.dns1 || '');
    const dns2    = cgEsc(data.dns2 || '');
    const lease   = cgEsc(data.lease || '86400');
    let c = '# ========================================\n# FortiGate — DHCP Server\n# ========================================\n\n';
    c += 'config system dhcp server\n    edit 0\n        set interface "' + iface + '"\n';
    c += '        set default-gateway ' + gw + '\n        set netmask ' + mask + '\n';
    c += '        set dns-server1 ' + dns1 + '\n';
    if (dns2) c += '        set dns-server2 ' + dns2 + '\n';
    c += '        set lease-time ' + lease + '\n';
    c += '        config ip-range\n            edit 1\n                set start-ip ' + startIp + '\n                set end-ip ' + endIp + '\n            next\n        end\n    next\nend\n\n';
    c += '# Doğrulama:\n# show system dhcp server\n# diagnose sys dhcp server list\n';
    return c;
}

// ── FortiGate: OSPF ───────────────────────────────────────────────────────────
FortiGate.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (FortiGate)',
                desc: 'FortiOS dinamik yönlendirme: OSPF area, network prefix ve passive interface konfigürasyonu.<br><code>config router ospf\n  set router-id 10.0.0.1\n  config network\n    edit 1\n      set prefix 192.168.1.0/24\n    next\n  end\nend</code>'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'router_id', why: 'Benzersiz olmalı; Loopback IP tercih edilir çünkü hiç down olmaz. Değiştirmek OSPF sürecini sıfırlar.',   label: 'Router ID',                  type: 'text', validate: 'ip', required: true,  placeholder: '10.0.0.1',              hint: 'Genellikle Loopback IP adresi' },
                        { name: 'area', why: "Backbone <code>0</code>'dır ve tüm alanlar ona bitişik olmalıdır. Alan numarası eşleşmezse komşuluk kurulmaz.",        label: 'Area',                       type: 'text', required: true,  placeholder: '0.0.0.0',               hint: 'Backbone için 0.0.0.0' },
                        { name: 'networks', why: "OSPF'e dahil edilecek ağlar. Çok geniş tanımlamak (<code>0.0.0.0/0</code>) WAN arayüzünde de OSPF konuşmaya başlamana ve komşuluk bilgilerini dışarı sızdırmana yol açar.",    label: 'Network\'ler (virgülle, CIDR)',type: 'text', required: true,  placeholder: '192.168.1.0/24,10.0.0.0/30', hint: 'OSPF\'e dahil edilecek prefixler' },
                        { name: 'passive_intfs', why: 'Passive arayüz hello göndermez ama ağı duyurur. WAN arayüzlerinde güvenlik için açılmalıdır.',label: 'Passive Interface\'ler',    type: 'text', validate: 'iface_range', optional: true,  placeholder: 'port2,port3',           hint: 'OSPF paketi gönderilmeyecek arayüzler' },
                        { name: 'redistribute_connected', why: "Bağlı ağları OSPF'e duyurur. Dikkatli kullan — istemeden yönetim ağını da duyurabilirsin.", label: 'Redistribute Connected', type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgOspfGen(data);
        });
    }
};
function cgFgOspfGen(data) {
    const routerId    = cgEsc(data.router_id || '');
    const area        = cgEsc(data.area || '0.0.0.0');
    const networks    = cgEsc(data.networks || '').split(',').map(s => s.trim()).filter(Boolean);
    const passiveIntfs= cgEsc(data.passive_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const redist      = cgEsc(data.redistribute_connected || 'enable');
    let c = '# ========================================\n# FortiGate — OSPF\n# ========================================\n\n';
    c += 'config router ospf\n    set router-id ' + routerId + '\n';
    c += '    config area\n        edit ' + area + '\n        next\n    end\n';
    c += '    config network\n';
    networks.forEach((net, i) => { c += '        edit ' + (i+1) + '\n            set prefix ' + net + '\n            set area ' + area + '\n        next\n'; });
    c += '    end\n';
    if (passiveIntfs.length > 0) {
        c += '    config ospf-interface\n';
        passiveIntfs.forEach(intf => { c += '        edit "' + cgEsc(intf) + '"\n            set passive enable\n        next\n'; });
        c += '    end\n';
    }
    c += '    set redistribute connected ' + redist + '\nend\n\n';
    c += '# Doğrulama:\n# get router info ospf neighbor\n# get router info routing-table ospf\n';
    return c;
}

// ── FortiGate: BGP ────────────────────────────────────────────────────────────
FortiGate.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (FortiGate)',
                desc: 'eBGP/iBGP komşu konfigürasyonu, route-map ve prefix duyurusu.<br><code>config router bgp\n  set as 65001\n  set router-id 10.0.0.1\n  config neighbor\n    edit "10.0.0.2"\n      set remote-as 65002\n    next\n  end\nend</code>'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "Kendi AS numaran. Peer'ın AS'i farklıysa eBGP, aynıysa iBGP olur.",   label: 'Local AS',    type: 'text', validate: 'asn', required: true,  placeholder: '65001',    hint: 'Bu cihazın Autonomous System numarası' },
                        { name: 'router_id', why: 'Benzersiz olmalı; Loopback IP tercih edilir çünkü hiç down olmaz. Değiştirmek OSPF sürecini sıfırlar.',  label: 'Router ID',   type: 'text', validate: 'ip', required: true,  placeholder: '10.0.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Neighbor Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'neighbor_ip', why: "BGP komşusunun IP'si. FortiGate'te oturumun kurulabilmesi için komşu IP'sine giden trafiğe <b>izin veren kural</b> da gerekir.",    label: 'Neighbor IP',      type: 'text', validate: 'ip', required: true,  placeholder: '10.0.0.2',  hint: 'BGP komşusunun IP adresi' },
                        { name: 'remote_as', why: "Komşunun AS numarası. Yanlışsa oturum Idle/Active'de takılır — <code>get router info bgp summary</code> ile görürsün.",      label: 'Remote AS',        type: 'text', validate: 'asn', required: true,  placeholder: '65002',     hint: 'Komşunun AS numarası' },
                        { name: 'route_map_in', why: 'Gelen duyuruları filtreler. Route-map olmadan komşunun duyurduğu her şeyi kabul edersin — internet tablosunun tamamı gelebilir.',   label: 'Route Map IN',     type: 'text', optional: true,  placeholder: 'RM-IN',     hint: 'Gelen rotalar için uygulanan politika' },
                        { name: 'route_map_out', why: 'Giden duyuruları filtreler. Filtresiz bırakmak, istemeden transit AS olmana ve trafiğin üzerinden akmasına yol açabilir.',  label: 'Route Map OUT',    type: 'text', optional: true,  placeholder: 'RM-OUT',    hint: 'Gönderilen rotalar için uygulanan politika' },
                        { name: 'networks', why: "OSPF'e dahil edilecek ağlar. Çok geniş tanımlamak (<code>0.0.0.0/0</code>) WAN arayüzünde de OSPF konuşmaya başlamana ve komşuluk bilgilerini dışarı sızdırmana yol açar.",       label: 'Advertise Network (virgülle, CIDR)', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'BGP ile duyurulacak prefixler' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgBgpGen(data);
        });
    }
};
function cgFgBgpGen(data) {
    const localAs     = cgEsc(data.local_as || '');
    const routerId    = cgEsc(data.router_id || '');
    const neighborIp  = cgEsc(data.neighbor_ip || '');
    const remoteAs    = cgEsc(data.remote_as || '');
    const rmIn        = cgEsc(data.route_map_in || '');
    const rmOut       = cgEsc(data.route_map_out || '');
    const networksRaw = cgEsc(data.networks || '');
    let c = '# ========================================\n# FortiGate — BGP\n# ========================================\n\n';
    c += 'config router bgp\n    set as ' + localAs + '\n    set router-id ' + routerId + '\n';
    c += '    config neighbor\n        edit "' + neighborIp + '"\n            set remote-as ' + remoteAs + '\n';
    if (rmIn)  c += '            set route-map-in "' + rmIn + '"\n';
    if (rmOut) c += '            set route-map-out "' + rmOut + '"\n';
    c += '        next\n    end\n';
    if (networksRaw) {
        const nets = networksRaw.split(',').map(s => s.trim()).filter(Boolean);
        c += '    config network\n';
        nets.forEach((net, i) => { c += '        edit ' + (i+1) + '\n            set prefix ' + net + '\n        next\n'; });
        c += '    end\n';
    }
    c += 'end\n\n# Doğrulama:\n# get router info bgp summary\n# get router info bgp neighbors ' + neighborIp + '\n';
    return c;
}

// ── FortiGate: Web Filter Profile ────────────────────────────────────────────
FortiGate.webfilter = {
    label: 'Web Filter Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'Web Filter Profile (FortiGate)',
                desc: 'FortiGuard kategorileri üzerinden URL filtreleme ve safe search konfigürasyonu.<br><code>config webfilter profile\n  edit "WF-PROFILE"\n    set safe-search enable\n    config filters\n      edit 1\n        set category gambling\n        set action block\n      next\n    end\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'Web Filter',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'profile_name', why: 'Profil adı kuralda görünür. Tutarlı isimlendirme (ör. <code>WF_CORPORATE</code>) çok profilli kurulumlarda karışıklığı önler.',     label: 'Profil Adı',              type: 'text',   required: true,  placeholder: 'WF-PROFILE',           hint: 'Policy\'e bağlanacak profil adı' },
                        { name: 'action_safesearch', why: "Google, Bing ve YouTube'da güvenli arama zorunlu hale gelir. Eğitim kurumlarında yaygın gereksinimdir.", label: 'Safe Search',             type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]},
                        { name: 'block_categories', why: "Kategori engelleme. Engellenen kategorinin kullanıcıya nasıl bildirileceğini (block page) ayarlamazsan kullanıcı 'internet çalışmıyor' der.",  label: 'Engellenen Kategoriler', type: 'text',   required: true,  placeholder: '26,61', hint: 'FortiGuard kategori NUMARALARI, virgülle (26 Malicious Websites, 61 Phishing). Liste: get webfilter categories' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgWebfilterGen(data);
        });
    }
};
function cgFgWebfilterGen(data) {
    const pname      = cgEsc(data.profile_name || '');
    const safeSearch = cgEsc(data.action_safesearch || 'enable');
    const catsIn     = cgEsc(data.block_categories || '').split(',').map(s => s.trim()).filter(Boolean);
    // FortiOS 'set category' sayisal ID bekler; ad yazilirsa komut reddedilir.
    const blockCats  = catsIn.filter(x => /^\d+$/.test(x));
    const badCats    = catsIn.filter(x => !/^\d+$/.test(x));
    let c = '# ========================================\n# FortiGate — Web Filter Profile\n# ========================================\n\n';
    if (badCats.length) c += '# UYARI: sayısal olmayan kategori atlandı: ' + badCats.join(', ') + ' — numarasını "get webfilter categories" ile bulun.\n';
    if (!blockCats.length) c += '# UYARI: engellenen kategori yok — bu profil hiçbir siteyi engellemez.\n';
    c += 'config webfilter profile\n    edit "' + pname + '"\n';
    c += '        set web-content-log enable\n        set web-filter-command-log enable\n        set web-url-log enable\n';
    if (blockCats.length > 0) {
        c += '        config ftgd-wf\n            config filters\n';
        blockCats.forEach((cat, i) => { c += '                edit ' + (i+1) + '\n                    set category ' + cat + '\n                    set action block\n                next\n'; });
        c += '            end\n        end\n';
    }
    if (safeSearch === 'enable') c += '        config web\n            set safe-search url header\n        end\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show webfilter profile "' + pname + '"\n';
    return c;
}

// ── FortiGate: IPS Sensor ─────────────────────────────────────────────────────
FortiGate.ips = {
    label: 'IPS Sensor',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'IPS Sensor (FortiGate)',
                desc: 'Saldırı önleme sensörü — severity seviyesine göre engelleme veya izleme.<br><code>config ips sensor\n  edit "IPS-SENSOR"\n    config entries\n      edit 1\n        set severity high\n        set action block\n      next\n    end\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'IPS Sensor',
                    icon: 'fas fa-bug',
                    fields: [
                        { name: 'sensor_name', why: "IPS sensörü içindeki imza grupları. Tüm imzaları açmak CPU'yu ciddi yükler; kritik olanlarla başla.", label: 'Sensor Adı', type: 'text',   required: true,  placeholder: 'IPS-SENSOR', hint: 'Policy\'e bağlanacak sensor adı' },
                        { name: 'severity', why: 'İmza önem seviyesi. Düşük severity imzaları çok sayıda false positive üretir; <code>high</code> ve <code>critical</code> ile başlamak doğru yaklaşımdır.',    label: 'Severity',   type: 'select', options: [
                            { value: 'critical', label: 'Critical' },
                            { value: 'high',     label: 'High',    selected: true },
                            { value: 'medium',   label: 'Medium' },
                            { value: 'low',      label: 'Low' }
                        ], hint: 'Bu eşik ve üzerindeki imzalar etkilenir' },
                        { name: 'action', why: '<code>accept</code> trafiği geçirir, <code>deny</code> sessizce düşürür. Deny kurallarında log açmazsan neyin engellendiğini asla göremezsin.',      label: 'Aksiyon',    type: 'select', options: [
                            { value: 'block',   label: 'Block',   selected: true },
                            { value: 'monitor', label: 'Monitor' },
                            { value: 'reset',   label: 'Reset' }
                        ]},
                        { name: 'log', why: "IPS olaylarının loglanması. Log kapalıyken sensör çalışır ama <b>neyi engellediğini göremezsin</b> — false positive tespiti imkânsız hale gelir.",         label: 'Log',        type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgIpsGen(data);
        });
    }
};
function cgFgIpsGen(data) {
    const sname    = cgEsc(data.sensor_name || '');
    const severity = cgEsc(data.severity || 'high');
    const action   = cgEsc(data.action || 'block');
    const log      = cgEsc(data.log || 'enable');
    let c = '# ========================================\n# FortiGate — IPS Sensor\n# ========================================\n\n';
    c += 'config ips sensor\n    edit "' + sname + '"\n        config entries\n            edit 1\n';
    c += '                set severity ' + severity + '\n                set action ' + action + '\n                set log ' + log + '\n';
    c += '            next\n        end\n    next\nend\n\n';
    c += '# Doğrulama:\n# show ips sensor "' + sname + '"\n';
    return c;
}

// ── FortiGate: Anti-Virus Profile ─────────────────────────────────────────────
FortiGate.antivirus = {
    label: 'Anti-Virus Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-virus-slash',
                title: 'Anti-Virus Profile (FortiGate)',
                desc: 'HTTP, FTP ve SMTP trafiği üzerinde virüs tarama ve karantina konfigürasyonu.<br><code>config antivirus profile\n  edit "AV-PROFILE"\n    config http\n      set av-scan enable\n    end\n    set quarantine infected\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'Anti-Virus Profil',
                    icon: 'fas fa-virus-slash',
                    fields: [
                        { name: 'profile_name', why: 'Profil adı kuralda görünür. Tutarlı isimlendirme (ör. <code>WF_CORPORATE</code>) çok profilli kurulumlarda karışıklığı önler.', label: 'Profil Adı',    type: 'text',   required: true,  placeholder: 'AV-PROFILE', hint: 'Policy\'e bağlanacak profil adı' },
                        { name: 'http_scan', why: "HTTP trafiğinin taranması. HTTPS için ayrıca SSL Inspection gerekir; bugün trafiğin çoğu HTTPS olduğundan yalnız HTTP taraması sınırlı koruma sağlar.",    label: 'HTTP Tarama',   type: 'select', options: [{ value: 'enable', label: 'Enable', selected: true }, { value: 'disable', label: 'Disable' }] },
                        { name: 'ftp_scan', why: "FTP dosya aktarımı taraması. FTP düz metin protokoldür; mümkünse tamamen kapatıp SFTP'ye geçmek daha doğrudur.",     label: 'FTP Tarama',    type: 'select', options: [{ value: 'enable', label: 'Enable', selected: true }, { value: 'disable', label: 'Disable' }] },
                        { name: 'smtp_scan', why: "SMTP taraması, e-posta ekindeki zararlıları yakalar. Giden yönde de açmak, kendi ağından zararlı yayılmasını önler.",    label: 'SMTP Tarama',   type: 'select', options: [{ value: 'enable', label: 'Enable', selected: true }, { value: 'disable', label: 'Disable' }] },
                        { name: 'quarantine', why: 'Karantina, tehdit tespit edilen kaynağı belirli süre bloklar. Yanlış pozitifte meşru kullanıcıyı da keser — süreyi kısa tut.',   label: 'Quarantine',    type: 'select', options: [
                            { value: 'infected', label: 'Infected', selected: true },
                            { value: 'none',     label: 'None' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgAntivirusGen(data);
        });
    }
};
function cgFgAntivirusGen(data) {
    const pname      = cgEsc(data.profile_name || '');
    const httpScan   = cgEsc(data.http_scan || 'enable');
    const ftpScan    = cgEsc(data.ftp_scan || 'enable');
    const smtpScan   = cgEsc(data.smtp_scan || 'enable');
    const quarantine = cgEsc(data.quarantine || 'infected');
    let c = '# ========================================\n# FortiGate — Anti-Virus Profile\n# ========================================\n\n';
    c += 'config antivirus profile\n    edit "' + pname + '"\n        set comment "AV Profile"\n';
    c += '        config http\n            set av-scan ' + httpScan + '\n        end\n';
    c += '        config ftp\n            set av-scan ' + ftpScan + '\n        end\n';
    c += '        config smtp\n            set av-scan ' + smtpScan + '\n        end\n';
    c += '        set quarantine ' + quarantine + '\n    next\nend\n\n';
    c += '# Doğrulama:\n# show antivirus profile "' + pname + '"\n';
    return c;
}

// ── FortiGate: Application Control ───────────────────────────────────────────
FortiGate.appcontrol = {
    label: 'Application Control',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cubes',
                title: 'Application Control (FortiGate)',
                desc: 'Uygulama kategorilerine göre engelleme ve loglama listesi oluşturur.<br><code>config application list\n  edit "APP-CTRL"\n    config entries\n      edit 1\n        set category botnet\n        set action block\n      next\n    end\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'Application Control',
                    icon: 'fas fa-cubes',
                    fields: [
                        { name: 'profile_name', why: 'Profil adı kuralda görünür. Tutarlı isimlendirme (ör. <code>WF_CORPORATE</code>) çok profilli kurulumlarda karışıklığı önler.', label: 'Profil Adı',     type: 'text', required: true, placeholder: 'APP-CTRL',    hint: 'Policy\'e bağlanacak liste adı' },
                        { name: 'categories', why: "DNS Filter kategorileri. DNS seviyesinde engelleme, bağlantı kurulmadan <b>önce</b> devreye girer; Web Filter'dan daha erken ve daha ucuz bir katmandır.",   label: 'Kategoriler',    type: 'text', required: true, placeholder: 'botnet,P2P',  hint: 'Virgülle ayrılmış FortiGuard uygulama kategori adları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgAppcontrolGen(data);
        });
    }
};
function cgFgAppcontrolGen(data) {
    const pname = cgEsc(data.profile_name || '');
    const cats  = cgEsc(data.categories || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '# ========================================\n# FortiGate — Application Control\n# ========================================\n\n';
    c += 'config application list\n    edit "' + pname + '"\n        config entries\n';
    cats.forEach((cat, i) => { c += '            edit ' + (i+1) + '\n                set category ' + cat + '\n                set action block\n                set log enable\n            next\n'; });
    c += '        end\n        set other-application-log enable\n    next\nend\n\n';
    c += '# Doğrulama:\n# show application list "' + pname + '"\n';
    return c;
}

// ── FortiGate: DNS Filter ─────────────────────────────────────────────────────
FortiGate.dnsfilter = {
    label: 'DNS Filter',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-search',
                title: 'DNS Filter (FortiGate)',
                desc: 'DNS düzeyinde botnet engelleme, safe search ve yönlendirme portalı konfigürasyonu.<br><code>config dnsfilter profile\n  edit "DNS-FILTER"\n    set block-botnet enable\n    set safe-search enable\n  next\nend</code>',
            },
            sections: [
                {
                    title: 'DNS Filter',
                    icon: 'fas fa-search',
                    fields: [
                        { name: 'profile_name', why: 'Profil adı kuralda görünür. Tutarlı isimlendirme (ör. <code>WF_CORPORATE</code>) çok profilli kurulumlarda karışıklığı önler.',    label: 'Profil Adı',          type: 'text',   required: true,  placeholder: 'DNS-FILTER',    hint: 'Policy\'e bağlanacak DNS filtre profili' },
                        { name: 'block_botnet', why: 'Botnet C2 adreslerini engeller. <b>Enfekte iç makineyi tespit etmenin en pratik yoludur</b> — loglarda sürekli botnet bloğu gören bir IP muhtemelen zararlı yazılım barındırıyordur.',    label: 'Botnet Engelle',       type: 'select', options: [{ value: 'enable', label: 'Enable', selected: true }, { value: 'disable', label: 'Disable' }] },
                        { name: 'safe_search', why: 'Arama motorlarında güvenli aramayı zorunlu kılar. HTTPS trafiğinde çalışması için SSL Inspection gerekir.',     label: 'Safe Search',          type: 'select', options: [{ value: 'enable', label: 'Enable', selected: true }, { value: 'disable', label: 'Disable' }] },
                        { name: 'redirect_portal', why: 'Engellenen DNS sorgularını yönlendirilecek adres. Kullanıcıya neden engellendiğini gösteren bir sayfa, destek çağrılarını azaltır.', label: 'Redirect Portal IP',   type: 'text',   optional: true,  placeholder: '192.168.1.1',   hint: 'Engellenen sorgular bu IP\'ye yönlendirilir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgDnsfilterGen(data);
        });
    }
};
function cgFgDnsfilterGen(data) {
    const pname          = cgEsc(data.profile_name || '');
    const blockBotnet    = cgEsc(data.block_botnet || 'enable');
    const safeSearch     = cgEsc(data.safe_search || 'enable');
    const redirectPortal = cgEsc(data.redirect_portal || '');
    let c = '# ========================================\n# FortiGate — DNS Filter\n# ========================================\n\n';
    c += 'config dnsfilter profile\n    edit "' + pname + '"\n';
    c += '        set block-botnet ' + blockBotnet + '\n        set safe-search ' + safeSearch + '\n';
    if (redirectPortal) c += '        set redirect-portal ' + redirectPortal + '\n';
    c += '    next\nend\n\n# Doğrulama:\n# show dnsfilter profile "' + pname + '"\n';
    return c;
}

// ── FortiGate: Policy Route (PBR) ────────────────────────────────────────────
FortiGate.pbr = {
    label: 'Policy Route (PBR)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-directions',
                title: 'Policy Route — PBR (FortiGate)',
                desc: 'Kaynak adrese göre belirli bir çıkış arayüzüne yönlendirme (policy-based routing).<br><code>config router policy\n  edit 1\n    set src 192.168.1.0/24\n    set output-device "port2"\n    set gateway 203.0.113.1\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Policy Based Route',
                    icon: 'fas fa-directions',
                    fields: [
                        { name: 'seq', why: "Policy route'lar sıra numarasına göre <b>yukarıdan aşağıya</b> değerlendirilir ve normal routing tablosundan <b>önce</b> gelir. Geniş bir kural üstteyse altındakiler hiç çalışmaz.",           label: 'Sequence No',            type: 'text', required: true,  placeholder: '1',               hint: 'Kural sırası (küçük sayı önce işlenir)' },
                        { name: 'src_addr', why: 'Kaynak ağ. Policy route, routing tablosunu bypass eder — yanlış tanım trafiği yanlış hatta gönderir ve teşhisi zorlaştırır.',      label: 'Kaynak Adres (CIDR)',    type: 'text', validate: 'cidr', required: true,  placeholder: '192.168.1.0/24',  hint: 'PBR\'ı tetikleyen kaynak subnet' },
                        { name: 'dst_addr', why: "Policy route'un hedef ağı. PBR normal routing tablosunu bypass eder — tanım çok genişse trafiğin tamamını yanlış hatta gönderir ve teşhisi zorlaştırır.",      label: 'Hedef Adres (CIDR)',     type: 'text', validate: 'cidr', optional: true,  placeholder: '0.0.0.0/0',       hint: 'Hedef kısıtı (opsiyonel, tüm için 0.0.0.0/0)' },
                        { name: 'out_interface', why: "Trafiğin zorla yönlendirileceği arayüz. Bu arayüz down olduğunda PBR devre dışı kalır ve trafik normal routing'e döner.", label: 'Çıkış Interface',        type: 'text', validate: 'iface', required: true,  placeholder: 'port2',           hint: 'Trafiğin yönlendirileceği arayüz' },
                        { name: 'gateway', why: "İstemcilere dağıtılacak varsayılan ağ geçidi. Genelde FortiGate'in o arayüzdeki IP'sidir.",       label: 'Gateway',                type: 'text', validate: 'ip', required: true,  placeholder: '203.0.113.1',     hint: 'Çıkış arayüzündeki next-hop IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgPbrGen(data);
        });
    }
};
function cgFgPbrGen(data) {
    const seq      = cgEsc(data.seq || '');
    const srcAddr  = cgEsc(data.src_addr || '');
    const dstAddr  = cgEsc(data.dst_addr || '');
    const outIface = cgEsc(data.out_interface || '');
    const gateway  = cgEsc(data.gateway || '');
    let c = '# ========================================\n# FortiGate — Policy Based Route (PBR)\n# ========================================\n\n';
    c += 'config router policy\n    edit ' + seq + '\n        set src ' + srcAddr + '\n';
    if (dstAddr) c += '        set dst ' + dstAddr + '\n';
    c += '        set output-device "' + outIface + '"\n        set gateway ' + gateway + '\n    next\nend\n\n';
    c += '# Doğrulama:\n# get router info routing-table all\n# diagnose ip route list\n';
    return c;
}

// ── FortiGate: IPv6 Interface ─────────────────────────────────────────────────
FortiGate.ipv6 = {
    label: 'IPv6 Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe-asia',
                title: 'IPv6 Interface (FortiGate)',
                desc: 'FortiOS IPv6 adres ataması, Router Advertisement ve statik default route konfigürasyonu.<br><code>config system interface\n  edit "port1"\n    config ipv6\n      set ip6-address 2001:db8::1/64\n    end\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'IPv6 Interface Ayarları',
                    icon: 'fas fa-globe-asia',
                    fields: [
                        { name: 'interface', why: "DHCP sunucusunun çalışacağı arayüz. Yanlış arayüz seçmek, istemcilerin adres alamamasına ve sorunun DHCP yerine kabloda aranmasına yol açar.",   label: 'Interface',               type: 'text', validate: 'iface',   required: true,  placeholder: 'port1',           hint: 'IPv6 adresi atanacak arayüz' },
                        { name: 'ipv6_addr', why: "IPv6 adresi prefix ile birlikte (<code>2001:db8::1/64</code>). IPv6 kuralları IPv4'ten <b>ayrıdır</b>; IPv4 kuralı yazmak IPv6 trafiğini kapsamaz — sessiz bir güvenlik açığı kaynağıdır.",   label: 'IPv6 Adresi (prefix dahil)', type: 'text', required: true, placeholder: '2001:db8::1/64',  hint: 'CIDR formatında IPv6 adresi' },
                        { name: 'ra_send', why: 'Router Advertisement, istemcilerin SLAAC ile adres almasını sağlar. Kapalıysa istemciler IPv6 gateway bulamaz.',     label: 'RA Gönder',               type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ], hint: 'Router Advertisement (SLAAC için gerekli)' },
                        { name: 'default_gw6', why: "IPv6 varsayılan ağ geçidi. IPv6 kuralları IPv4'ten ayrıdır; IPv4 tarafını kapatıp IPv6'yı açık unutmak sessiz bir güvenlik açığıdır.", label: 'IPv6 Default Gateway',    type: 'text',   optional: true,  placeholder: '2001:db8::254',   hint: 'IPv6 default route ekler (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgIpv6Gen(data);
        });
    }
};
function cgFgIpv6Gen(data) {
    const iface      = cgEsc(data.interface || '');
    const ipv6Addr   = cgEsc(data.ipv6_addr || '');
    const raSend     = cgEsc(data.ra_send || 'enable');
    const defaultGw6 = cgEsc(data.default_gw6 || '');
    let c = '# ========================================\n# FortiGate — IPv6 Interface\n# ========================================\n\n';
    c += 'config system interface\n    edit "' + iface + '"\n        config ipv6\n';
    c += '            set ip6-address ' + ipv6Addr + '\n            set ip6-send-adv ' + raSend + '\n        end\n    next\nend\n\n';
    if (defaultGw6) {
        c += 'config router static6\n    edit 1\n        set dst ::/0\n        set gateway ' + defaultGw6 + '\n        set device "' + iface + '"\n    next\nend\n\n';
    }
    c += '# Doğrulama:\n# get system interface ' + iface + ' | grep ip6\n';
    return c;
}

// ── FortiGate: VDOM ───────────────────────────────────────────────────────────
FortiGate.vdom = {
    label: 'VDOM',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VDOM (FortiGate)',
                desc: 'Virtual Domain oluşturma, operation mode ayarlama ve VDOM yöneticisi tanımlama.<br><code>config vdom\n  edit VDOM-CUSTOMER1\n  next\nend\nconfig vdom\n  edit VDOM-CUSTOMER1\n  config system settings\n    set opmode nat\n  end\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'VDOM Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vdom_name', why: "VDOM, tek cihazı bağımsız firewall'lara böler. Her VDOM'un kendi kuralları, rotaları ve yönetici hesapları olur — çoklu müşteri senaryolarında kullanılır.",  label: 'VDOM Adı',           type: 'text',   required: true, placeholder: 'VDOM-CUSTOMER1',   hint: 'Benzersiz virtual domain adı' },
                        { name: 'opmode', why: "<b>NAT</b> modda VDOM yönlendirme yapar, <b>Transparent</b> modda şeffaf köprü gibi davranır. Mod değişimi o VDOM'un config'ini sıfırlar.",     label: 'Operation Mode',     type: 'select', options: [
                            { value: 'nat',         label: 'NAT',         selected: true },
                            { value: 'transparent', label: 'Transparent' }
                        ]}
                    ]
                },
                {
                    title: 'VDOM Yöneticisi',
                    icon: 'fas fa-user-cog',
                    fields: [
                        { name: 'admin_user', why: "VDOM yöneticisi. Her VDOM'un kendi yönetici hesapları olur; global yönetici tüm VDOM'lara erişir.", label: 'Admin Kullanıcı Adı', type: 'text', required: true, placeholder: 'admin-cust1',      hint: 'Bu VDOM\'a erişecek yönetici adı' },
                        { name: 'admin_pass', why: "Yönetici parolası. VDOM ayrımının anlamı izolasyon olduğundan, VDOM yöneticisine global yetki vermek bu izolasyonu ortadan kaldırır.", label: 'Admin Şifresi',       type: 'text', required: true, placeholder: 'SecurePass123!',   hint: 'Güçlü bir şifre kullanın' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgVdomGen(data);
        });
    }
};
function cgFgVdomGen(data) {
    const vdomName  = cgEsc(data.vdom_name || '');
    const opmode    = cgEsc(data.opmode || 'nat');
    const adminUser = cgEsc(data.admin_user || '');
    const adminPass = cgEsc(data.admin_pass || '');
    let c = '# ========================================\n# FortiGate — VDOM\n# ========================================\n\n';
    c += 'config vdom\n    edit ' + vdomName + '\n    next\nend\n\n';
    c += 'config global\n    config system admin\n        edit "' + adminUser + '"\n';
    c += '            set password ' + adminPass + '\n            set vdom "' + vdomName + '"\n            set accprofile "prof_admin"\n        next\n    end\nend\n\n';
    c += 'config vdom\n    edit ' + vdomName + '\n    config system settings\n        set opmode ' + opmode + '\n    end\n    next\nend\n\n';
    c += '# Doğrulama:\n# show vdom\n# get system admin ' + adminUser + '\n';
    return c;
}

// ── FortiGate: HA Active-Active ───────────────────────────────────────────────
FortiGate.haaa = {
    label: 'HA Active-Active',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'HA Active-Active (FortiGate)',
                desc: 'Yük paylaşımlı aktif-aktif HA kümesi. Her cihaza ayrı ayrı uygulanır.<br><code>config system ha\n  set mode a-a\n  set group-id 1\n  set group-name "FG-HA"\n  set priority 128\nend</code>',
            },
            sections: [
                {
                    title: 'HA Active-Active',
                    icon: 'fas fa-clone',
                    fields: [
                        { name: 'group_id', why: 'Group ID aynı ağdaki HA çiftlerinde benzersiz olmalı. Çakışma iki ayrı çiftin birbirine karışmasına yol açar.',     label: 'Group ID',          type: 'text',   required: true, placeholder: '1',           hint: '0–255 arası grup numarası' },
                        { name: 'group_name', why: "HA grup adı iki üyede aynı olmalı. Aynı L2 segmentindeki farklı HA çiftlerinde ise <b>farklı</b> olmalı, aksi halde üyeler yanlış eşleşir.",   label: 'Group Adı',         type: 'text',   required: true, placeholder: 'FG-HA',       hint: 'Küme adı — her iki cihazda aynı olmalı' },
                        { name: 'password', why: "HA parolası iki üyede aynı olmalı. Parolasız HA, ağa takılan başka bir FortiGate'in cluster'a katılmasına kapı bırakır.",     label: 'HA Şifresi',        type: 'text',   required: true, placeholder: 'hapassword',  hint: 'Her iki cihazda aynı şifre kullanılmalı' },
                        { name: 'monitor_intfs', why: 'İzlenen arayüz down olursa failover tetiklenir. WAN ve LAN arayüzlerini izlemek şarttır; izlenmezse hat kopsa bile cihaz primary kalmaya devam eder.',label: 'Monitor Interface\'ler', type: 'text', validate: 'iface_range', required: true, placeholder: 'port1,port2', hint: 'Virgülle ayrılmış izlenecek arayüzler' },
                        { name: 'priority', why: 'Yüksek öncelikli üye primary olur. <code>override</code> kapalıyken primary döndüğünde rolü geri almaz — bu ikinci kesintiyi önler.',     label: 'Priority',          type: 'text',   required: true, placeholder: '128',         hint: '0–255; birincil cihaz için daha yüksek değer' },
                        { name: 'session_sync', why: "Açıkken mevcut TCP oturumları failover'da kopmaz. Kapalıysa failover anında tüm bağlantılar yeniden kurulur; kullanıcı kesinti hisseder.", label: 'Session Sync',      type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgHaaaGen(data);
        });
    }
};
function cgFgHaaaGen(data) {
    const groupId      = cgEsc(data.group_id || '1');
    const groupName    = cgEsc(data.group_name || '');
    const password     = cgEsc(data.password || '');
    const monitorIntfs = cgEsc(data.monitor_intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const priority     = cgEsc(data.priority || '128');
    const sessionSync  = cgEsc(data.session_sync || 'enable');
    const monitorStr   = monitorIntfs.map(i => '"' + cgEsc(i) + '"').join(' ');
    let c = '# ========================================\n# FortiGate — HA Active-Active\n# ========================================\n\n';
    c += 'config system ha\n    set mode a-a\n    set group-id ' + groupId + '\n    set group-name "' + groupName + '"\n';
    c += '    set password ' + password + '\n    set priority ' + priority + '\n';
    c += '    set session-pickup ' + sessionSync + '\n    set monitor ' + monitorStr + '\nend\n\n';
    c += '# NOT: HA konfigürasyonu her iki cihaza ayrı ayrı uygulanır.\n\n';
    c += '# Doğrulama:\n# get system ha status\n# diagnose sys ha checksum cluster\n';
    return c;
}

// ── FortiGate: SNMP v3 ────────────────────────────────────────────────────────
FortiGate.snmpv3 = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP v3 (FortiGate)',
                desc: 'SNMPv3 kullanıcı tanımı, kimlik doğrulama ve şifreleme protokolleri ile trap host konfigürasyonu.<br><code>config system snmp user\n  edit "snmp-admin"\n    set auth-proto sha256\n    set priv-proto aes256\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'SNMPv3 Kullanıcısı',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'username', why: "SNMPv3 kullanıcısı. v2c community'lerinden farklı olarak kullanıcı bazlı yetki ve şifreleme sağlar.",   label: 'Kullanıcı Adı',      type: 'text',   required: true, placeholder: 'snmp-admin',    hint: 'NMS\'te de aynı kullanıcı adı kullanılmalı' },
                        { name: 'auth_proto', why: "SNMPv3'te <code>MD5</code> ve <code>SHA1</code> zayıftır; mümkünse <code>SHA256</code> kullan.", label: 'Auth Protocol',      type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha',    label: 'SHA' },
                            { value: 'md5',    label: 'MD5' }
                        ]},
                        { name: 'auth_pass', why: "Kimlik doğrulama parolası en az 8 karakter olmalı. Kısa parola SNMPv3'ü pratikte v2c seviyesine düşürür.",  label: 'Auth Şifresi',       type: 'text',   required: true, placeholder: 'AuthPass123!',   hint: 'En az 8 karakter' },
                        { name: 'priv_proto', why: '<code>DES</code> kırılabilir; <code>AES</code> tercih edilmeli. authPriv seviyesi olmadan SNMP verisi ağda açık geçer.', label: 'Privacy Protocol',   type: 'select', options: [
                            { value: 'aes256', label: 'AES-256', selected: true },
                            { value: 'aes',    label: 'AES' },
                            { value: 'des',    label: 'DES' }
                        ]},
                        { name: 'priv_pass', why: "Şifreleme parolası olmadan SNMP verisi ağda <b>açık</b> geçer.",  label: 'Privacy Şifresi',    type: 'text',   required: true, placeholder: 'PrivPass123!',   hint: 'Auth şifresinden farklı olması önerilir' },
                        { name: 'trap_host', why: "Trap alıcısı (NMS). Tanımlanmazsa cihaz arıza bildirmez; sorunları ancak kullanıcı şikayetiyle öğrenirsin.",  label: 'Trap Host IP',       type: 'text', validate: 'ip',   required: true, placeholder: '10.0.0.100',     hint: 'SNMP trap\'ların gönderileceği NMS adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgSnmpv3Gen(data);
        });
    }
};
function cgFgSnmpv3Gen(data) {
    const username  = cgEsc(data.username || '');
    const authProto = cgEsc(data.auth_proto || 'sha256');
    const authPass  = cgEsc(data.auth_pass || '');
    const privProto = cgEsc(data.priv_proto || 'aes256');
    const privPass  = cgEsc(data.priv_pass || '');
    const trapHost  = cgEsc(data.trap_host || '');
    let c = '# ========================================\n# FortiGate — SNMP v3\n# ========================================\n\n';
    c += 'config system snmp sysinfo\n    set status enable\nend\n\n';
    c += 'config system snmp user\n    edit "' + username + '"\n';
    c += '        set auth-proto ' + authProto + '\n        set auth-pwd ' + authPass + '\n';
    c += '        set priv-proto ' + privProto + '\n        set priv-pwd ' + privPass + '\n';
    c += '        set events cpu-high mem-low\n';
    c += '        config notify-hosts\n            edit 1\n                set ip ' + trapHost + '\n            next\n        end\n    next\nend\n\n';
    c += '# Doğrulama:\n# show system snmp user "' + username + '"\n';
    return c;
}

// ── FortiGate: FortiSwitch Port Profile ──────────────────────────────────────
FortiGate.fswport = {
    label: 'FortiSwitch Port Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'FortiSwitch Port Profile (FortiGate)',
                desc: 'FortiLink ile yönetilen FortiSwitch portları için VLAN politikası, PoE ve storm control konfigürasyonu.<br><code>config switch-controller vlan-policy\n  edit "ACCESS-PROFILE"\n    set allowed-vlans 10 20 30\n    set untagged-vlans 1\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'FortiSwitch Port Profil',
                    icon: 'fas fa-plug',
                    info: 'Bu konfigürasyon FortiGate tarafından yönetilen (FortiLink) FortiSwitch cihazları için geçerlidir.',
                    fields: [
                        { name: 'profile_name', why: 'Profil adı kuralda görünür. Tutarlı isimlendirme (ör. <code>WF_CORPORATE</code>) çok profilli kurulumlarda karışıklığı önler.',  label: 'Profil Adı',           type: 'text',   required: true, placeholder: 'ACCESS-PROFILE', hint: 'FortiSwitch port profilinin adı' },
                        { name: 'native_vlan', why: 'Trunk portta etiketsiz gelen trafiğin atanacağı VLAN. İki uçta farklı native VLAN, <b>VLAN hopping</b> saldırısına kapı açar. Belirtilmezse cihaz varsayılanı geçerli olur.',   label: 'Native VLAN',          type: 'text', validate: 'vlan',   required: false, placeholder: '1',              hint: 'Etiketlenmemiş (untagged) VLAN ID' },
                        { name: 'allowed_vlans', why: "Trunk'tan geçmesine izin verilen VLAN'lar. Tümünü açmak (<code>all</code>) gereksiz broadcast ve güvenlik riski üretir.", label: 'Allowed VLAN\'lar',    type: 'text', validate: 'vlan_list',   required: true, placeholder: '10,20,30',       hint: 'Virgülle ayrılmış izin verilen VLAN ID\'leri' },
                        { name: 'poe', why: 'Port üzerinden güç. Toplam PoE bütçesini aşmak, portların sessizce kapanmasına yol açar.',           label: 'PoE',                  type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]},
                        { name: 'storm_control', why: 'Broadcast/multicast fırtınasını sınırlar. Döngü oluştuğunda ağın tamamen kilitlenmesini önler — açık bırakılması önerilir.', label: 'Storm Control',        type: 'select', options: [
                            { value: 'enable',  label: 'Enable',  selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgFgFswportGen(data);
        });
    }
};
function cgFgFswportGen(data) {
    const pname        = cgEsc(data.profile_name || '');
    const nativeVlan   = cgEsc(data.native_vlan || '');
    const allowedVlans = cgEsc(data.allowed_vlans || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '# ========================================\n# FortiGate — FortiSwitch Port Profile\n# ========================================\n\n';
    c += '# Not: FortiGate tarafından yönetilen FortiSwitch için uygulanır.\n\n';
    c += 'config switch-controller vlan-policy\n    edit "' + pname + '"\n';
    c += '        set allowed-vlans ' + allowedVlans.join(' ') + '\n';
    if (nativeVlan) c += '        set untagged-vlans ' + nativeVlan + '\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show switch-controller vlan-policy "' + pname + '"\n';
    return c;
}
