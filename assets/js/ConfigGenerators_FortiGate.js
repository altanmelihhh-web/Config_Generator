'use strict';

const FortiGate = {};

// ── Lab bulgularından türetilen girdi uyarıları (CLI Lab fgt-01/04/06/08/11/12/15/23/24/25/27) ──
// Önekler: ⛔ engel (cihaz reddeder / çalışmaz) · ⚠ risk ya da sık hata · ℹ bilgi. Yardımcılar _fgW* önekli.
const _fgWIsIp = ip => /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(String(ip || '').trim());
const _fgWN = ip => String(ip || '').trim().split('.').reduce((a, o) => a * 256 + (+o), 0);
// Nokta-ondalık maske → önek uzunluğu (geçersizse -1)
function _fgWMaskLen(m) {
    if (!_fgWIsIp(m)) return -1;
    const b = _fgWN(m).toString(2).padStart(32, '0');
    return /^1*0*$/.test(b) ? b.indexOf('0') === -1 ? 32 : b.indexOf('0') : -1;
}
// "A.B.C.D M.M.M.M" ya da "A.B.C.D/NN" → { ip, len } (geçersizse null)
function _fgWNet(s) {
    const t = String(s || '').trim().split(/\s+/);
    if (t.length === 1) { const m = t[0].match(/^([\d.]+)\/(\d{1,2})$/); return m && _fgWIsIp(m[1]) && +m[2] <= 32 ? { ip: m[1], len: +m[2] } : null; }
    if (t.length === 2 && _fgWIsIp(t[0])) { const l = _fgWMaskLen(t[1]); return l >= 0 ? { ip: t[0], len: l } : null; }
    return null;
}
const _fgWBase = (ip, len) => len === 0 ? 0 : Math.floor(_fgWN(ip) / 2 ** (32 - len)) * 2 ** (32 - len);
const _fgWIn = (ip, net) => !!net && _fgWIsIp(ip) && _fgWBase(ip, net.len) === _fgWBase(net.ip, net.len);
const _fgWOverlap = (a, b) => !!a && !!b && _fgWBase(a.ip, Math.min(a.len, b.len)) === _fgWBase(b.ip, Math.min(a.len, b.len));
const _fgWHostBits = n => !!n && _fgWN(n.ip) !== _fgWBase(n.ip, n.len);
const _fgWPrivate = ip => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(String(ip || '').trim());
// Arayüz IP'si alt ağın ağ ya da yayın adresi mi? (/31-/32 hariç)
function _fgWNetOrBcast(ip, len) {
    if (!_fgWIsIp(ip) || len < 0 || len > 30) return false;
    const n = _fgWN(ip), b = _fgWBase(ip, len);
    return n === b || n === b + 2 ** (32 - len) - 1;
}
// allowaccess denetimi (fgt-01): WAN'da şifresiz yönetim, her yerde telnet, tanınmayan anahtar sözcük
const _FGW_ACCESS = ['ping', 'https', 'ssh', 'http', 'snmp', 'fgfm', 'telnet', 'radius-acct', 'probe-response', 'fabric', 'ftm', 'speed-test'];
function _fgWAccess(label, list, isWan, w) {
    const a = String(list || '').trim().split(/[\s,]+/).filter(Boolean).map(x => x.toLowerCase());
    const unk = a.filter(x => _FGW_ACCESS.indexOf(x) === -1);
    if (unk.length) w.push('⚠ ' + label + ': tanınmayan allowaccess değeri (' + unk.join(', ') + '); cihaz "value parse error" ile reddedebilir. FortiOS 7.4 değerleri: ' + _FGW_ACCESS.join(' ') + '.');
    if (a.indexOf('telnet') !== -1) w.push('⚠ ' + label + ': telnet parolayı düz metin taşır; yönetim için yalnız ssh/https kullanın (fgt-01).');
    if (isWan && a.indexOf('http') !== -1) w.push('⚠ ' + label + ': http, yönetim arayüzünü internete şifresiz açar; kaldırın (fgt-01).');
    if (isWan && (a.indexOf('https') !== -1 || a.indexOf('ssh') !== -1)) w.push('⚠ ' + label + ': yönetim internete açık. Yönetimi VPN\'e/iç arayüze alın ya da yöneticilere trusted host verin (Admin aracı).');
    return a;
}
// Virgül / boşluk ayrımlı liste (arayüz adları)
const _fgWList = s => String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);

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
                        { name: 'lan_ip', why: "Bu adres iç ağın gateway'idir; DHCP dağıtıyorsan istemcilere bu IP'yi vereceksin. Mevcut ağdaki bir IP ile çakışmamasına dikkat et.",     label: 'IP Adresi',              type: 'text', validate: 'ip',   required: true, placeholder: '10.64.10.1',        hint: 'LAN tarafındaki gateway IP' },
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
    const w = [];
    const wl = _fgWMaskLen(data.wan_mask), ll = _fgWMaskLen(data.lan_mask);
    if (String(data.wan_port || '').trim() && String(data.wan_port).trim() === String(data.lan_port || '').trim()) w.push('⛔ WAN ve LAN aynı arayüz (' + String(data.wan_port).trim() + '): ikinci edit bloğu ilkinin IP\'sini ezer.');
    if (_fgWIsIp(data.wan_ip) && _fgWIsIp(data.lan_ip) && wl >= 0 && ll >= 0 && _fgWOverlap({ ip: data.wan_ip, len: wl }, { ip: data.lan_ip, len: ll }))
        w.push('⛔ WAN ve LAN alt ağları çakışıyor: FortiOS iki arayüzde örtüşen alt ağı reddeder (allow-subnet-overlap kapalıyken).');
    if (_fgWNetOrBcast(data.wan_ip, wl)) w.push('⛔ WAN IP\'si alt ağın ağ ya da yayın adresi; arayüz adresi olamaz.');
    if (_fgWNetOrBcast(data.lan_ip, ll)) w.push('⛔ LAN IP\'si alt ağın ağ ya da yayın adresi; arayüz adresi olamaz.');
    _fgWAccess('WAN allowaccess', data.wan_access, true, w);
    _fgWAccess('LAN allowaccess', data.lan_access, false, w);
    return { config: c, warnings: w };
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
                        { name: 'srcintf', why: 'Trafiğin <b>girdiği</b> interface. Yanlış yön seçmek kuralın hiç eşleşmemesine yol açar — en sık yapılan hatalardan biri.', label: 'Kaynak Interface', type: 'text',   required: true, placeholder: 'port2',            hint: 'Trafiğin geldiği arayüz (birden çok: virgülle)' },
                        { name: 'dstintf', why: 'Trafiğin <b>çıktığı</b> interface. VPN trafiği için tünel arayüzünü seçmelisin, fiziksel portu değil.', label: 'Hedef Interface',  type: 'text',   required: true, placeholder: 'port1',            hint: 'Trafiğin çıktığı arayüz (birden çok: virgülle)' },
                        { name: 'srcaddr', why: 'Önceden tanımlı adres nesnesi olmalı. <code>all</code> seçmek kuralı tüm kaynaklara açar — gerçekten gerekli mi düşün.', label: 'Kaynak Adres',     type: 'text',   required: true, placeholder: 'LAN_SUBNET',       hint: 'Address Object adı veya "all" (birden çok: virgülle)' },
                        { name: 'dstaddr', why: 'Hedef adres. <code>all</code> + <code>ALL</code> servis kombinasyonu, kural listesindeki en tehlikeli satırdır.', label: 'Hedef Adres',      type: 'text',   required: true, placeholder: 'WEB_SERVERS',              hint: 'Address Object / VIP adı veya "all" (birden çok: virgülle)' },
                        { name: 'service', why: 'Port/protokol kısıtı. <code>ALL</code> yerine yalnızca gereken servisi seçmek, ihlal anında yanal hareketi sınırlar.', label: 'Servis',           type: 'text',   required: true, placeholder: 'HTTPS',              hint: 'Servis nesnesi: ALL, HTTP, HTTPS vb. (birden çok: virgülle)' }
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
                },
                {
                    // Sözdizimi: canlı config (5 cihaz — comments/groups/users/status) + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/333889629/config-firewall-policy
                    title: 'Kimlik & Ek Ayarlar',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'pol_comments', why: 'Kuralın neden var olduğunu (talep/ticket no, sahibi) yazmak, kural temizliğinde "bunu silebilir miyiz?" sorusunu cevaplar.', label: 'Açıklama (comments)', type: 'text', placeholder: 'CHG-1234 web erişimi', hint: 'Kural açıklaması' },
                        { name: 'pol_groups', why: 'Kullanıcı grubu verilirse kural yalnız kimliği doğrulanmış o grup üyeleri için eşleşir. Grup adı <code>config user group</code> altında tanımlı olmalı.', label: 'Kullanıcı Grupları', type: 'text', placeholder: 'VPN_USERS', hint: 'Virgülle ayrılmış grup adları' },
                        { name: 'pol_users', why: 'Tek tek kullanıcıya bağlanan kural, grup tabanlı kurala göre bakımı zordur; mümkünse grup kullan.', label: 'Kullanıcılar', type: 'text', placeholder: 'user1', hint: 'Virgülle ayrılmış yerel kullanıcı adları' },
                        { name: 'pol_disabled', why: 'Kuralı devre dışı oluşturmak, bakım penceresinde tek komutla (<code>set status enable</code>) açmayı sağlar.', label: 'Kuralı devre dışı oluştur', type: 'checkbox', checked: false, hint: 'set status disable' }
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
    const rid = cgEsc(String(data.rule_id || '').trim()), rname = cgEsc(data.rule_name || '');
    const act = data.action === 'deny' ? 'deny' : 'accept';
    // Çok değerli alanlar: her ad ayrı tırnak ("HTTP" "HTTPS"); tek tırnak içinde boşluklu liste tek bir (olmayan) nesne adı olur.
    const sI = _fgWList(data.srcintf), dI = _fgWList(data.dstintf);
    const splitN = s => String(s || '').split(/[,\n]+/).map(x => x.trim()).filter(Boolean);
    const sA = splitN(data.srcaddr), dA = splitN(data.dstaddr), sv = splitN(data.service);
    const q = a => a.map(x => cgQ(x)).join(' ');
    const w = [];
    if (rid && !/^\d+$/.test(rid)) w.push('⛔ Kural ID sayı olmalı (edit <sayı>); "' + rid + '" reddedilir.');
    else if (rid === '0') w.push('ℹ edit 0: FortiOS sıradaki boş kural numarasını kendisi verir.');
    if (String(data.rule_name || '').length > 35) w.push('⛔ Kural adı en çok 35 karakter olabilir (' + String(data.rule_name).length + ').');
    const ipLike = x => /^\d{1,3}(\.\d{1,3}){3}(\/\d{1,2}|\s+\d{1,3}(\.\d{1,3}){3})?$/.test(x);
    sA.concat(dA).filter(ipLike).forEach(x => w.push('⛔ Adres alanına IP yazılmış (' + x + '): kural nesne adı bekler; FortiOS "entry not found in datasource" ile reddeder. Önce Address Object oluşturun.'));
    if (sv.length > 1 && sv.some(x => /\s/.test(x))) w.push('⚠ Servis adında boşluk var (' + sv.filter(x => /\s/.test(x)).join(', ') + '): birden çok servisi virgülle ayırın.');
    const isAll = a => a.length === 1 && /^all$/i.test(a[0]);
    if (act === 'accept' && isAll(sA) && isAll(dA) && sv.some(x => /^all$/i.test(x)))
        w.push('⚠ Kaynak, hedef ve servis all/ALL: kural iki arayüz arasındaki TÜM trafiğe izin verir. Gereken ağ ve servislerle daraltın.');
    else if (act === 'accept' && sv.some(x => /^all$/i.test(x))) w.push('ℹ Servis ALL: tüm portlar açılır; en az yetki için yalnız gereken servisleri yazın (fgt-15).');
    if (sI.length && dI.length && sI.join() === dI.join()) w.push('⚠ Kaynak ve hedef arayüz aynı: aynı arayüzden girip çıkan trafik için yazılır; çoğunlukla yanlış yön seçilmiştir.');
    if ((data.logtraffic || 'all') === 'disable') w.push('⚠ Log kapalı: bu kuralın eşleştiği trafik Forward Traffic logunda görünmez; sorun gidermede ilk bakılan kaynak kaybolur.');
    const natOn = (data.nat || 'enable') === 'enable';
    if (act === 'deny' && natOn) w.push('ℹ Eylem deny: NAT anlamsız olduğu için set nat yazılmadı.');
    if (act === 'accept' && natOn && dA.some(x => /vip/i.test(x))) w.push('⚠ Hedef bir VIP gibi görünüyor ve NAT açık: gelen yayın kuralında nat enable istemci IP\'sini FortiGate adresine çevirir, sunucu gerçek istemciyi göremez (fgt-08).');
    if (act === 'accept' && natOn && sI.concat(dI).some(x => /vpn|ipsec|tun/i.test(x))) w.push('⚠ Tünel arayüzü ve NAT açık: site-to-site IPsec kuralında NAT kaynak adresi faz 2 seçicisine uymaz, paket "no matching IPsec selector" ile düşer (fgt-23).');
    if (sI.some(x => /^ssl\.root$/i.test(x)) && !String(data.pol_groups || '').trim() && !String(data.pol_users || '').trim())
        w.push('⚠ Kaynak arayüz ssl.root ama kullanıcı grubu yok: SSL-VPN kullanıcıları kuralla eşleşmez, giriş reddedilir (fgt-24).');
    if (act === 'deny') w.push('ℹ Deny kuralı yalnız kendisinden sonra gelen kuralları gölgeler; FortiGate yukarıdan aşağı ilk eşleşeni uygular. Sırayı "move <id> before <id>" ile ayarlayın.');
    else w.push('ℹ Yeni kural listenin sonuna eklenir; üstte daha geniş bir deny kuralı varsa hiç eşleşmez. Gerekirse "move ' + (rid || '<id>') + ' before <id>" (fgt-15).');
    let c = '# ========================================\n# FortiGate — Security Policy\n# ========================================\n\n';
    c += 'config firewall policy\n    edit ' + rid + '\n';
    c += '        set name "' + rname + '"\n';
    c += '        set srcintf ' + q(sI) + '\n';
    c += '        set dstintf ' + q(dI) + '\n';
    c += '        set srcaddr ' + q(sA) + '\n';
    c += '        set dstaddr ' + q(dA) + '\n';
    c += '        set action ' + act + '\n';
    c += '        set schedule "always"\n';
    c += '        set service ' + q(sv) + '\n';
    c += '        set logtraffic ' + cgEsc(data.logtraffic || 'all') + '\n';
    if (act === 'accept' && natOn) c += '        set nat enable\n';
    const pGroups = cgFgQList(data.pol_groups), pUsers = cgFgQList(data.pol_users);
    if (pGroups) c += '        set groups ' + pGroups + '\n';
    if (pUsers) c += '        set users ' + pUsers + '\n';
    if (data.pol_comments) c += '        set comments "' + cgEsc(data.pol_comments) + '"\n';
    if (data.pol_disabled) c += '        set status disable\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall policy ' + rid + '\n# diagnose firewall iprope show 00100004 ' + rid + '\n';
    return { config: c, warnings: w };
}

// ── FortiGate: NAT / VIP ──────────────────────────────────────────────────────
FortiGate.nat = {
    label: 'NAT / VIP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'NAT / VIP (FortiGate)',
                desc: 'Destination NAT (VIP) veya Source NAT (IP Pool) konfigürasyonu.<br><code>config firewall vip\n  edit "WEB_VIP"\n    set extintf "port1"\n    set extip 203.0.113.10\n    set mappedip "172.24.50.10"\n  next\nend</code>'
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
                        { name: 'vip_mappedip', why: "İç sunucunun gerçek IP'si. Firewall kuralında <b>hedef adres olarak VIP nesnesi</b> yazılır, iç IP değil.",   label: 'Mapped IP (İç Sunucu)',type: 'text', validate: 'ip',   required: true,  placeholder: '172.24.50.10',   hint: 'Yönlendirilecek iç sunucu IP' },
                        { name: 'vip_portfwd', why: 'Kapalıyken tüm portlar yönlendirilir (static NAT). Açıkken yalnızca belirtilen port — güvenlik açısından port yönlendirme her zaman daha dar ve tercih edilir.',    label: 'Port Yönlendirme',     type: 'select', options: [
                            { value: 'disable', label: 'Hayır', selected: true },
                            { value: 'enable',  label: 'Evet' }
                        ], hint: 'Belirli port eşleştirmesi gerekiyorsa Evet seçin' },
                        { name: 'vip_extport', why: 'Dışarıdan gelinen port. Standart olmayan port kullanmak (ör. RDP için 3389 yerine başka bir port) otomatik taramaları azaltır ama güvenlik sağlamaz.',    label: 'External Port',        type: 'text', requiredIf: { field: 'vip_portfwd', in: ['enable'] }, validate: 'port',  placeholder: '80',    hint: 'Dışarıdan gelen port' },
                        { name: 'vip_mappedport', why: 'İç sunucunun dinlediği gerçek port. Dış 8080 → iç 80 gibi çevirmek mümkündür.', label: 'Mapped Port',          type: 'text', requiredIf: { field: 'vip_portfwd', in: ['enable'] }, validate: 'port',  placeholder: '80',    hint: 'Yönlendirilecek iç port' }
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
    const w = [];
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
        c += '# VIP tek başına trafiği geçirmez: WAN → sunucu yönünde, hedefi bu VIP olan bir kural gerekir\n';
        c += '# (Security Policy aracı: Hedef Adres = ' + name + ', NAT = Disable).\n';
        if (_fgWIsIp(data.vip_extip) && String(data.vip_extip).trim() === String(data.vip_mappedip || '').trim()) w.push('⛔ Dış IP ile iç (mapped) IP aynı: çevrilecek bir şey yok.');
        if (_fgWIsIp(data.vip_extip) && _fgWPrivate(data.vip_extip)) w.push('ℹ Dış IP özel (RFC 1918) bir adres: FortiGate bir modem/NAT arkasındaysa doğru olabilir; aksi hâlde ISS\'nin verdiği genel adresi yazın.');
        if (_fgWIsIp(data.vip_mappedip) && !_fgWPrivate(data.vip_mappedip)) w.push('ℹ İç (mapped) IP genel bir adres: sunucunun gerçek (iç) adresini yazdığınızdan emin olun.');
        if (pf !== 'enable') w.push('⚠ Port yönlendirme kapalı: dış IP\'nin TÜM portları sunucuya çevrilir (statik NAT). Yalnız yayınlanacak portu açmak için Port Yönlendirme = Evet (fgt-08).');
        else {
            const ep = +String(data.vip_extport || '').trim();
            const risky = { 22: 'SSH', 23: 'Telnet', 445: 'SMB', 3389: 'RDP', 161: 'SNMP', 3306: 'MySQL', 1433: 'MSSQL' };
            if (risky[ep]) w.push('⚠ Dış port ' + ep + ' (' + risky[ep] + ') internete açılıyor: yönetim/dosya servislerini doğrudan yayınlamak yerine VPN kullanın.');
        }
        w.push('ℹ Kuralda hedef adres VIP nesnesidir (' + (name || 'VIP adı') + '), sunucunun gerçek IP\'si değil; gelen kuralda NAT kapalı olmalı, yoksa sunucu istemci yerine FortiGate\'i görür (fgt-08).');
    } else {
        const name  = cgEsc(data.pool_name || '');
        const start = cgEsc(data.pool_start || '');
        const end   = cgEsc(data.pool_end || '');
        c += 'config firewall ippool\n    edit "' + name + '"\n';
        c += '        set startip ' + start + '\n        set endip ' + end + '\n';
        c += '        set type overload\n    next\nend\n\n';
        // Havuz kurala "set ippool enable" + "set poolname" ile bağlanır (FortiOS 7.4 firewall policy)
        c += '# Kurala bağlamak için (Security Policy):\n#     set nat enable\n#     set ippool enable\n#     set poolname "' + name + '"\n';
        if (_fgWIsIp(data.pool_start) && _fgWIsIp(data.pool_end) && _fgWN(data.pool_start) > _fgWN(data.pool_end)) w.push('⛔ Başlangıç IP bitiş IP\'sinden büyük: FortiOS havuzu kaydetmez.');
        w.push('ℹ Havuz adresleri ISS tarafından FortiGate\'e yönlendirilmeli ya da WAN alt ağında olmalı; FortiGate bu adresler için ARP yanıtı verir (arp-reply varsayılan enable).');
    }
    c += '\n# Doğrulama:\n# show firewall vip\n# show firewall ippool\n';
    return { config: c, warnings: w };
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
                        { name: 'p2_sel', why: "Seçici tipi: <code>subnet</code> tek bir ağ; <code>name</code> ise bir adres nesnesi veya grubu (birden fazla ağı tek phase2'de taşır). İki tarafın proxy-ID'leri birebir eşleşmeli.", label: 'Trafik Seçici Tipi', type: 'select', options: [
                            { value: 'subnet', label: 'Subnet (IP MASK)', selected: true },
                            { value: 'name',   label: 'Adres nesnesi / grubu' }
                        ]},
                        { name: 'local_subnet', why: "Bu tarafın şifrelenecek ağı. Trafik seçicileri iki tarafta <b>ayna</b> olmalı: senin local'in karşının remote'u olmalı.",  label: 'Yerel Subnet',     type: 'text', requiredIf: { field: 'p2_sel', in: ['subnet'] }, validate: 'ip_mask', placeholder: '10.64.10.0 255.255.255.0',     hint: 'Nokta-ondalık: IP MASK formatı' },
                        { name: 'remote_subnet', why: 'Karşı tarafın ağı. Bu subnet için <b>statik rota</b> ve <b>iki yönlü firewall kuralı</b> da gerekir — tünel kurulup trafiğin akmamasının en yaygın sebebi budur.', label: 'Uzak Subnet',      type: 'text', requiredIf: { field: 'p2_sel', in: ['subnet'] }, validate: 'ip_mask', placeholder: '10.128.10.0 255.255.255.0',        hint: 'Karşı tarafın iç ağı' },
                        { name: 'p2_src_name', why: 'Yerel tarafı temsil eden adres nesnesi/grubu. Önceden <code>config firewall address</code> / <code>addrgrp</code> altında tanımlı olmalı.', label: 'Yerel Adres Nesnesi', type: 'text', requiredIf: { field: 'p2_sel', in: ['name'] }, placeholder: 'LAN_NETS', hint: 'src-name' },
                        { name: 'p2_dst_name', why: 'Karşı tarafı temsil eden adres nesnesi/grubu. Karşı cihazdaki yerel seçiciyle aynı ağları içermeli.', label: 'Uzak Adres Nesnesi', type: 'text', requiredIf: { field: 'p2_sel', in: ['name'] }, placeholder: 'REMOTE_NETS', hint: 'dst-name' },
                        { name: 'p2_keylife', why: 'Phase 2 anahtar ömrü (saniye). Varsayılan 43200. İki tarafta farklıysa çoğu cihaz küçüğü kabul eder ama bazı üçüncü taraf cihazlar reddeder — eşit tut.', label: 'Phase 2 Key Life (sn)', type: 'text', min: 120, max: 172800, placeholder: '3600', hint: '120–172800 (keylifeseconds)' },
                        { name: 'p2_autoneg', why: 'Açıkken SA trafik beklemeden kurulur ve süresi dolmadan yenilenir; ilk paketin düşmesini ve "tünel ilk pingte gelmiyor" şikâyetini önler.', label: 'Auto-negotiate', type: 'checkbox', checked: false, hint: 'set auto-negotiate enable' },
                        { name: 'p2_pfs', why: 'PFS her phase2 yenilemesinde yeni DH değişimi yapar; bir anahtarın ele geçmesi eski trafiği açmaz. Karşı taraf PFS desteklemiyorsa kapatmak gerekir — güvenliği düşürür.', label: 'PFS', type: 'select', options: [
                            { value: '',        label: 'Varsayılan (enable)', selected: true },
                            { value: 'disable', label: 'Disable (karşı taraf desteklemiyorsa)' }
                        ]},
                        { name: 'p2_replay', why: 'Replay tespiti aynı ESP paketinin tekrar gönderilmesini engeller. Yalnız sıra dışı paket üreten yollarda (ör. bazı SD-WAN/yük dengeleme) kapatılır.', label: 'Replay Tespiti', type: 'select', options: [
                            { value: '',        label: 'Varsayılan (enable)', selected: true },
                            { value: 'disable', label: 'Disable' }
                        ]},
                        { name: 'p2_comments', why: 'Karşı kurum/devre bilgisi yazmak, çok tünelli cihazda doğru phase2\'yi bulmayı kolaylaştırır.', label: 'Phase 2 Açıklama', type: 'text', placeholder: 'Merkez-Şube tüneli', hint: 'comments' }
                    ]
                },
                {
                    // Route-based VPN'de trafiği tünele rota yönlendirir, kural izin verir (CLI Lab fgt-11 / fgt-23)
                    title: 'Rota & Kurallar (route-based)',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'lan_iface', why: 'Tünel kurulsa da karşı ağa <b>rota</b> ve <b>iki yönlü kural</b> yoksa trafik geçmez (debug flow: "via port1" ya da "policy 0"). Doldurursan tünel rotası, tünel düşünce trafiğin internete şifresiz çıkmaması için blackhole (mesafe 254) ve NAT\'sız iki kural da üretilir.', label: 'LAN Arayüzü', type: 'text', validate: 'iface', placeholder: 'port2', hint: 'Boşsa rota ve kural üretilmez' }
                    ]
                },
                {
                    // Sözdizimi: canlı config (5 cihaz) + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/305883427/config-vpn-ipsec-phase1-interface
                    title: 'Phase 1 — Ek Ayarlar',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'p1_dpd', why: 'Dead Peer Detection karşı tarafın düştüğünü algılar ve SA\'yı temizler. Kapalıysa karşı taraf yeniden başladığında tünel uzun süre "up" görünüp trafik geçirmez.', label: 'DPD', type: 'select', options: [
                            { value: '',          label: 'Varsayılan (on-demand)', selected: true },
                            { value: 'on-idle',   label: 'on-idle' },
                            { value: 'disable',   label: 'disable' }
                        ]},
                        { name: 'p1_nat', why: 'NAT-T, IPsec\'i UDP 4500 içine alarak NAT arkasından geçirir. İki uç da genel IP ise kapatılabilir; <code>forced</code> NAT olmasa da UDP kapsüllemeyi zorlar.', label: 'NAT Traversal', type: 'select', options: [
                            { value: '',        label: 'Varsayılan (enable)', selected: true },
                            { value: 'disable', label: 'disable' },
                            { value: 'forced',  label: 'forced' }
                        ]},
                        { name: 'p1_netdevice', why: 'Her tünel için ayrı çekirdek arayüzü oluşturur. Dial-up (çok istemcili) tünellerde ölçeklenmeyi etkiler; site-to-site için genelde varsayılan yeterlidir.', label: 'net-device', type: 'select', options: [
                            { value: '',        label: 'Varsayılan', selected: true },
                            { value: 'enable',  label: 'enable' },
                            { value: 'disable', label: 'disable' }
                        ]},
                        { name: 'p1_keylife', why: 'Phase 1 anahtar ömrü (saniye). Varsayılan 86400. İki tarafta aynı değer yeniden anahtarlama sürprizlerini önler.', label: 'Phase 1 Key Life (sn)', type: 'text', min: 120, max: 172800, placeholder: '28800', hint: '120–172800 (keylife)' },
                        { name: 'p1_comments', why: 'Karşı taraf kurum/iletişim bilgisi, arıza anında kimi arayacağını söyler.', label: 'Phase 1 Açıklama', type: 'text', placeholder: 'Şube-01 VPN', hint: 'comments' }
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
    // Önce FortiOS kaçırması (\\ ve \"), sonra cgEsc: çıktı gösterilirken tek kez çözülür (cgShowOutput)
    const psk      = cgEsc(String(data.psk || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
    const ikever   = cgEsc(data.ike_ver || '2');
    const proposal = cgEsc(data.proposal || 'aes256-sha256');
    const dhgrp    = cgEsc(data.dhgrp || '14');
    const p2       = cgEsc(data.p2_name || '');
    const lsub     = cgEsc(data.local_subnet || '');
    const rsub     = cgEsc(data.remote_subnet || '');
    const lan      = cgEsc(String(data.lan_iface || '').trim());
    const w = [];
    let c = '# ========================================\n# FortiGate — IPSec VPN Configuration\n# ========================================\n\n';
    c += 'config vpn ipsec phase1-interface\n    edit "' + p1 + '"\n';
    c += '        set interface "' + iface + '"\n';
    c += '        set peertype any\n';
    c += '        set remote-gw ' + gw + '\n';
    c += '        set authmethod psk\n';
    // PSK tırnak içinde: boşluklu anahtar tırnaksız yazılırsa ikinci sözcükte "value parse error" verir
    c += '        set psksecret "' + psk + '"\n';
    c += '        set ike-version ' + ikever + '\n';
    c += '        set proposal ' + proposal + '\n';
    c += '        set dhgrp ' + dhgrp + '\n';
    if (data.p1_dpd) c += '        set dpd ' + cgEsc(data.p1_dpd) + '\n';
    if (data.p1_nat) c += '        set nattraversal ' + cgEsc(data.p1_nat) + '\n';
    if (data.p1_netdevice) c += '        set net-device ' + cgEsc(data.p1_netdevice) + '\n';
    if (data.p1_keylife) c += '        set keylife ' + cgEsc(data.p1_keylife) + '\n';
    if (data.p1_comments) c += '        set comments "' + cgEsc(data.p1_comments) + '"\n';
    c += '    next\nend\n\n';
    const p2sel = data.p2_sel === 'name' ? 'name' : 'subnet';
    const pfsOff = data.p2_pfs === 'disable';
    c += 'config vpn ipsec phase2-interface\n    edit "' + p2 + '"\n';
    c += '        set phase1name "' + p1 + '"\n';
    c += '        set proposal ' + proposal + '\n';
    if (pfsOff) c += '        set pfs disable\n';
    else c += '        set dhgrp ' + dhgrp + '\n';
    if (data.p2_replay === 'disable') c += '        set replay disable\n';
    if (data.p2_autoneg) c += '        set auto-negotiate enable\n';
    if (data.p2_keylife) c += '        set keylifeseconds ' + cgEsc(data.p2_keylife) + '\n';
    if (p2sel === 'name') {
        c += '        set src-addr-type name\n';
        c += '        set dst-addr-type name\n';
        c += '        set src-name "' + cgEsc(data.p2_src_name || '') + '"\n';
        c += '        set dst-name "' + cgEsc(data.p2_dst_name || '') + '"\n';
    } else {
        c += '        set src-subnet ' + lsub + '\n';
        c += '        set dst-subnet ' + rsub + '\n';
    }
    if (data.p2_comments) c += '        set comments "' + cgEsc(data.p2_comments) + '"\n';
    c += '    next\nend\n\n';
    const ln = _fgWNet(data.local_subnet), rn = _fgWNet(data.remote_subnet);
    if (lan) {
        // Seçici nesneleri: subnet tipinde yerel/uzak ağ için adres nesnesi üretilir; name tipinde mevcut nesneler kullanılır
        const la = p2sel === 'name' ? cgEsc(data.p2_src_name || '') : p1 + '_LOCAL';
        const ra = p2sel === 'name' ? cgEsc(data.p2_dst_name || '') : p1 + '_REMOTE';
        if (p2sel !== 'name') {
            c += '# Kurallar için yerel/uzak ağ nesneleri\nconfig firewall address\n';
            c += '    edit "' + la + '"\n        set subnet ' + lsub + '\n    next\n';
            c += '    edit "' + ra + '"\n        set subnet ' + rsub + '\n    next\nend\n\n';
            c += '# Karşı ağa tünel rotası + tünel düşünce sızıntıyı önleyen blackhole (mesafe 254)\nconfig router static\n';
            c += '    edit 0\n        set dst ' + rsub + '\n        set device "' + p1 + '"\n    next\n';
            c += '    edit 0\n        set dst ' + rsub + '\n        set blackhole enable\n        set distance 254\n    next\nend\n\n';
        } else {
            c += '# Karşı ağlar nesne/grup ile verildi: her uzak ağ için tünel rotası ve blackhole ekleyin:\n';
            c += '# config router static\n#     edit 0\n#         set dst <uzak-ag>\n#         set device "' + p1 + '"\n#     next\n# end\n\n';
            w.push('ℹ Seçici nesne/grup ile verildi: karşı ağların tünel rotaları otomatik üretilmedi; her uzak ağ için device "' + p1 + '" rotası ve blackhole ekleyin.');
        }
        c += '# İki yönlü kural — site-to-site trafikte NAT KAPALI (açık olursa kaynak seçiciye uymaz)\nconfig firewall policy\n';
        c += '    edit 0\n        set name "' + (p1 + '-OUT').slice(0, 35) + '"\n        set srcintf "' + lan + '"\n        set dstintf "' + p1 + '"\n';
        c += '        set srcaddr "' + la + '"\n        set dstaddr "' + ra + '"\n        set action accept\n        set schedule "always"\n        set service "ALL"\n        set logtraffic all\n    next\n';
        c += '    edit 0\n        set name "' + (p1 + '-IN').slice(0, 35) + '"\n        set srcintf "' + p1 + '"\n        set dstintf "' + lan + '"\n';
        c += '        set srcaddr "' + ra + '"\n        set dstaddr "' + la + '"\n        set action accept\n        set schedule "always"\n        set service "ALL"\n        set logtraffic all\n    next\nend\n\n';
        w.push('ℹ Kurallarda servis ALL: tünel içinde gereken servislerle daraltabilirsiniz. NAT bilerek yazılmadı (varsayılan disable).');
    } else {
        c += '# Route-based VPN: karşı ağa rota ve iki yönlü kural gerekir (LAN Arayüzü alanını doldurursanız üretilir):\n';
        c += '# config router static\n#     edit 0\n#         set dst <uzak-ag>\n#         set device "' + p1 + '"\n#     next\n# end\n\n';
        w.push('⚠ Rota ve kural üretilmedi: tünel up olsa da karşı ağa rota ve iki yönlü (NAT\'sız) kural olmadan trafik geçmez (fgt-23). LAN Arayüzü alanını doldurun ya da elle ekleyin.');
    }
    c += '# Doğrulama:\n# get vpn ipsec tunnel summary\n# diagnose vpn ike gateway list name ' + p1 + '\n# diagnose vpn tunnel list name ' + p1 + '\n';
    // ── Girdi uyarıları (fgt-11 / fgt-23)
    if (String(data.p1_name || '').length > 15) w.push('⛔ Phase 1 adı ' + String(data.p1_name).length + ' karakter: phase1-interface adı bir arayüz adıdır ve en çok 15 karakter olabilir.');
    if (/\s/.test(String(data.p1_name || '')) || /\s/.test(String(data.p2_name || ''))) w.push('⚠ Faz adında boşluk var: arayüz, rota ve kurallarda tırnak gerektirir; kısa ve boşluksuz ad seçin.');
    if (String(data.psk || '').length && String(data.psk).length < 12) w.push('⚠ PSK ' + String(data.psk).length + ' karakter: en az 16 karakterlik rastgele bir anahtar önerilir.');
    if (/\?/.test(String(data.psk || ''))) w.push('⚠ PSK içinde "?" var: FortiOS CLI\'de "?" yazarken yardım menüsünü açar; anahtarı yapıştırırken karakter kaybolabilir.');
    if (/\s/.test(String(data.psk || ''))) w.push('ℹ PSK boşluk içeriyor: tırnak içinde yazıldı; karşı uçta da birebir aynı olmalı.');
    if (dhgrp === '5' || dhgrp === '2' || dhgrp === '1') w.push('⚠ DH grubu ' + dhgrp + ' zayıf kabul edilir; en az 14 (tercihen 19/20/21) seçin. İki uçta aynı grup olmalı.');
    if (/sha1$/.test(proposal)) w.push('⚠ ' + proposal + ': SHA-1 artık önerilmiyor; karşı uç destekliyorsa aes256-sha256 kullanın.');
    if (ikever === '1') w.push('ℹ IKEv1 seçildi: karşı uç IKEv2 destekliyorsa IKEv2 tercih edin; sürüm iki uçta aynı olmalı ("negotiation timeout").');
    if (pfsOff) w.push('⚠ PFS kapalı: yalnız karşı taraf desteklemiyorsa kullanın; açık/kapalı iki uçta aynı olmalı, aksi hâlde faz 2 kurulmaz.');
    if (data.p2_replay === 'disable') w.push('⚠ Replay tespiti kapalı: tekrar gönderilen ESP paketleri kabul edilir.');
    if (p2sel === 'subnet') {
        if (ln && rn && ln.len === rn.len && _fgWBase(ln.ip, ln.len) === _fgWBase(rn.ip, rn.len)) w.push('⛔ Yerel ve uzak seçici aynı ağ: iki uçta aynı alt ağ kullanılamaz (NAT\'lı VPN tasarımı gerekir).');
        else if (_fgWOverlap(ln, rn)) w.push('⚠ Yerel ve uzak seçici çakışıyor: yönlendirme ve seçici eşleşmesi belirsizleşir.');
        if (_fgWHostBits(ln) || _fgWHostBits(rn)) w.push('⚠ Seçicide host bitleri dolu (ör. 10.64.10.5/24): ağ adresini yazın; karşı uçta aynı biçimde tanımlanmalı.');
        if (ln && rn) w.push('ℹ Seçiciler karşı ucun aynası olmalı: karşı uçta src-subnet ' + rsub + ', dst-subnet ' + lsub + '; değilse IKEv2\'de TS_UNACCEPTABLE (fgt-23).');
    }
    if (_fgWIsIp(data.remote_gw) && _fgWPrivate(data.remote_gw)) w.push('ℹ Uzak gateway özel (RFC 1918) adres: karşı uç NAT arkasındaysa onun GENEL adresini yazın; NAT-T açık kalmalı.');
    return { config: c, warnings: w };
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
                        { name: 'vpn_group', why: 'Erişim yetkisi kullanıcı grubuna göre verilir. Grubu geniş tutmak, ayrılan çalışanların erişiminin sürmesine yol açar. LDAP/RADIUS entegrasyonu merkezi yönetim sağlar.',   label: 'VPN User Group',  type: 'text', required: true, placeholder: 'VPN_USERS',   hint: 'Kullanıcı grubunun portal erişimini bağlar' },
                        { name: 'lan_iface', why: 'SSL-VPN kullanıcılarının iç ağa erişimi için <code>ssl.root</code> → LAN kuralı gerekir. Bu kural (grup ile) yoksa kullanıcı giriş yapsa bile "permission denied" alır.', label: 'LAN Arayüzü', type: 'text', validate: 'iface', required: true, placeholder: 'port2', hint: 'ssl.root kuralının hedef arayüzü' },
                        { name: 'lan_addr', why: 'Kullanıcıların erişeceği iç ağ nesnesi. Kuralın hedefi ve split tunnel\'da tünele gönderilecek ağ olarak kullanılır; <code>config firewall address</code> altında tanımlı olmalı.', label: 'İç Ağ Nesnesi', type: 'text', required: true, placeholder: 'LAN_NET', hint: 'Adres nesnesi / grubu adı' },
                        { name: 'split_tunnel', why: 'Split tunnel açıkken yalnız iç ağ trafiği tünele girer; kapalıyken kullanıcının tüm internet trafiği şirketten geçer (bant genişliği, ayrıca ssl.root → WAN kuralı ve NAT gerekir).', label: 'Split Tunnel', type: 'select', options: [
                            { value: 'enable',  label: 'Açık — yalnız iç ağ tünelden', selected: true },
                            { value: 'disable', label: 'Kapalı — tüm trafik tünelden' }
                        ]}
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
    const lan = cgEsc(String(data.lan_iface || '').trim()), lanAddr = cgEsc(String(data.lan_addr || '').trim());
    const split = data.split_tunnel === 'disable' ? 'disable' : 'enable';
    const w = [];
    let c = '# ========================================\n# FortiGate — SSL-VPN Configuration\n# ========================================\n\n';
    c += '# 1. Tunnel IP Havuzu\nconfig firewall address\n    edit "' + pool + '"\n        set type iprange\n';
    const parts = range.split('-');
    if (parts.length === 2) {
        c += '        set start-ip ' + parts[0].trim() + '\n        set end-ip ' + parts[1].trim() + '\n';
    }
    c += '    next\nend\n\n';
    c += '# 2. SSL-VPN Portal\nconfig vpn ssl web portal\n    edit "' + portal + '"\n';
    c += '        set tunnel-mode enable\n        set web-mode enable\n';
    c += '        set ip-pools "' + pool + '"\n';
    c += '        set split-tunneling ' + split + '\n';
    if (split === 'enable' && lanAddr) c += '        set split-tunneling-routing-address "' + lanAddr + '"\n';
    c += '    next\nend\n\n';
    c += '# 3. SSL-VPN Ayarları (kimlik doğrulama kuralı dahil)\nconfig vpn ssl settings\n';
    c += '    set servercert "' + cert + '"\n';
    c += '    set tunnel-ip-pools "' + pool + '"\n';
    c += '    set source-interface "' + iface + '"\n';
    c += '    set source-address "' + srcAddr + '"\n';
    c += '    set default-portal "' + portal + '"\n';
    c += '    set port ' + port + '\n';
    // authentication-rule 'vpn ssl settings' altindadir, portal altinda degil
    c += '    config authentication-rule\n        edit 1\n            set groups "' + grp + '"\n            set portal "' + portal + '"\n        next\n    end\nend\n\n';
    // ssl.root kuralı: groups ile — kural yoksa ya da grubu kapsamıyorsa giriş reddedilir (fgt-24 nopolicy)
    c += '# 4. Tünel kullanıcılarının iç ağa erişim kuralı (ssl.root = SSL-VPN tünel arayüzü; NAT kapalı)\nconfig firewall policy\n    edit 0\n';
    c += '        set name "SSLVPN-TO-LAN"\n        set srcintf "ssl.root"\n        set dstintf "' + lan + '"\n';
    c += '        set srcaddr "' + pool + '"\n        set dstaddr "' + lanAddr + '"\n        set groups "' + grp + '"\n';
    c += '        set action accept\n        set schedule "always"\n        set service "ALL"\n        set logtraffic all\n    next\nend\n\n';
    c += '# Doğrulama:\n# get vpn ssl monitor\n# diagnose vpn ssl list\n# diagnose debug application sslvpn -1\n';
    // ── Girdi uyarıları (fgt-12 / fgt-24)
    w.push('ℹ FortiOS 7.4 içindir: SSL-VPN tünel modu 7.6.3 ve sonrasında tüm modellerde kaldırıldı (ayarlar yükseltmede taşınmaz); yeni kurulumlarda IPsec dial-up VPN (FortiClient) değerlendirin.');
    const pr = String(data.pool_range || '').split('-').map(x => x.trim());
    if (pr.length !== 2 || !_fgWIsIp(pr[0]) || !_fgWIsIp(pr[1])) w.push('⛔ IP havuzu aralığı "başlangıç-bitiş" biçiminde olmalı; start-ip/end-ip yazılamadı.');
    else if (_fgWN(pr[0]) > _fgWN(pr[1])) w.push('⛔ Havuzun başlangıç IP\'si bitişten büyük: aralık nesnesi kaydedilmez.');
    else if (_fgWN(pr[1]) - _fgWN(pr[0]) + 1 < 10) w.push('⚠ Havuzda ' + (_fgWN(pr[1]) - _fgWN(pr[0]) + 1) + ' adres var: eşzamanlı kullanıcı sayısını karşılamalı; dolunca yeni kullanıcı IP alamaz (fgt-24).');
    if (String(data.ssl_port || '').trim() === '443') w.push('⚠ SSL-VPN portu 443: yönetim HTTPS arayüzü de varsayılan olarak 443\'tedir; aynı arayüzde çakışır. 10443 gibi ayrı bir port ya da admin-sport değişikliği gerekir.');
    if (/^all$/i.test(String(data.src_addr || '').trim())) w.push('⚠ Kaynak adres all: portal tüm internete açık; kaba kuvvet denemelerini azaltmak için ülke (geography) ya da bilinen adres nesnesiyle daraltın.');
    if (/^Fortinet_Factory$/i.test(String(data.server_cert || '').trim())) w.push('⚠ Fortinet_Factory kendinden imzalı fabrika sertifikasıdır: istemciler sertifika uyarısı alır; güvenilir bir CA sertifikası yükleyin.');
    if (split === 'disable') w.push('ℹ Split tunnel kapalı: kullanıcıların internet trafiği de tünelden gelir; ayrıca ssl.root → WAN yönünde NAT açık bir kural gerekir (bu çıktıda yok).');
    w.push('ℹ Kullanıcılar ' + (grp || 'VPN grubu') + ' grubunda olmalı (Local User & Group aracı); grup authentication-rule ve ssl.root kuralında aynı olmalı, yoksa giriş "permission denied" ile reddedilir (fgt-24).');
    return { config: c, warnings: w };
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
                        { name: 'grp_name', why: 'HA grup adı iki üyede birebir aynı olmalı (büyük/küçük harf dahil); farklıysa küme kurulmaz. Aynı L2 segmentinde birden çok küme varsa ayrıca <code>group-id</code> farklı olmalı: sanal MAC adresleri group-id\'den türetilir.',     label: 'HA Grup Adı',       type: 'text',   required: true, placeholder: 'FG-HA-CLUSTER',   hint: 'İki cihazda aynı olmalı' },
                        { name: 'ha_pass', why: "HA şifresi iki üyede aynı olmalı. Şifresiz HA, aynı ağa takılan başka bir FortiGate'in cluster'a katılmasına açık kapı bırakır.",      label: 'HA Şifresi',        type: 'text',   required: true, placeholder: 'ha-secret123',    hint: 'İki cihazda aynı olmalı' },
                        { name: 'hb_iface', why: "Heartbeat arayüzü üyeler arasında <b>doğrudan</b> bağlanmalı (switch üzerinden değil). Kopması split-brain'e yol açar; en az iki heartbeat arayüzü önerilir.",     label: 'Heartbeat Interface\'lar', type: 'text', validate: 'iface_range', required: true, placeholder: 'port3 port4', hint: 'Boşluk ya da virgülle ayrılmış arayüz adları' },
                        { name: 'ha_monitor', why: 'İzlenen arayüz düşünce failover tetiklenir. WAN ve LAN arayüzleri izlenmezse hat kopsa bile cihaz birincil kalır. Heartbeat arayüzlerini izlemeyin.', label: 'İzlenen Arayüzler (monitor)', type: 'text', validate: 'iface_range', placeholder: 'port1 port2', hint: 'Boş = izleme yok' },
                        { name: 'priority', why: '<code>override</code> kapalıyken (varsayılan) birincil seçimi: önce izlenen arayüzlerde daha az arıza, sonra <b>uptime</b> (5 dk\'dan fazla fark), sonra öncelik. Yani önceliği yüksek üye tek başına birincil olmaz; eski birincil geri döndüğünde rolü geri almaz (ikinci kesinti olmaz). override açıkken öncelik uptime\'ın önüne geçer.',     label: 'Öncelik',           type: 'text',   required: true, placeholder: '200',             hint: 'Primary\'de yüksek (ör: 200), Secondary\'de düşük (ör: 100)' },
                        { name: 'session_sync', why: "Açıkken mevcut TCP oturumları failover'da kopmaz. Kapalıysa failover anında tüm bağlantılar yeniden kurulur; kullanıcı kesinti hisseder.", label: 'Session Sync',      type: 'select', options: [
                            { value: 'enable',  label: 'Evet', selected: true },
                            { value: 'disable', label: 'Hayır' }
                        ]},
                        { name: 'ha_override', why: 'Açıkken öncelik, uptime\'ın önüne geçer: öncelikli üye her geri geldiğinde yeniden birincil olur (fazladan bir geçiş). Kapalıyken (varsayılan) uptime\'ı uzun olan üye birincil kalır; "önceliği yükselttim ama değişmedi" sürprizinin nedeni budur.', label: 'Override', type: 'select', options: [
                            { value: 'disable', label: 'Kapalı (varsayılan)', selected: true },
                            { value: 'enable',  label: 'Açık — öncelik belirleyici' }
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
    const priority    = cgEsc(String(data.priority || '200').trim());
    const sessionSync = cgEsc(data.session_sync || 'enable');
    const hbPorts     = _fgWList(data.hb_iface);
    const mon         = _fgWList(data.ha_monitor);
    const ovr         = data.ha_override === 'enable';
    const w = [];
    let c = '# ========================================\n# FortiGate — HA Active-Passive (' + (role === 'primary' ? 'Primary' : 'Secondary') + ')\n# ========================================\n\n';
    c += 'config system ha\n';
    c += '    set mode a-p\n';
    c += '    set group-name "' + grpName + '"\n';
    c += '    set password "' + haPass + '"\n';
    // hbdev tek satırda "<arayüz> <öncelik>" çiftleri: ikinci bir "set hbdev" satırı öncekinin yerine geçer
    c += '    set hbdev ' + hbPorts.map(p => cgQ(p) + ' 50').join(' ') + '\n';
    c += '    set session-pickup ' + sessionSync + '\n';
    if (mon.length) c += '    set monitor ' + mon.map(p => cgQ(p)).join(' ') + '\n';
    if (ovr) c += '    set override enable\n';
    c += '    set priority ' + priority + '\n';
    c += 'end\n\n';
    c += '# NOT: HA konfigürasyonu her iki cihaza ayrı ayrı uygulanır (mod, group-name, parola ve firmware aynı olmalı).\n';
    c += '# Secondary için priority değerini düşük tutun (ör: 100).\n\n';
    c += '# Doğrulama:\n# get system ha status\n# diagnose sys ha checksum cluster\n# diagnose sys ha history read\n';
    // ── Girdi uyarıları (fgt-25 / fgt-27)
    if (!/^\d+$/.test(priority) || +priority > 255) w.push('⛔ Öncelik 0–255 arası tam sayı olmalı.');
    else if (role === 'secondary' && +priority >= 128) w.push('⚠ Rol Secondary ama öncelik ' + priority + ' (varsayılan 128 ve üstü): birincilden düşük tutun (ör. 100).');
    else if (role === 'primary' && +priority <= 128) w.push('ℹ Rol Primary ama öncelik ' + priority + ': diğer üyeden yüksek olmalı (ör. 200). Rol seçimi yalnız başlığı değiştirir, birincili öncelik (ve uptime) belirler.');
    if (String(data.grp_name || '').length > 32) w.push('⛔ HA grup adı en çok 32 karakter olabilir.');
    if (!hbPorts.length) w.push('⛔ Heartbeat arayüzü yok: küme kurulamaz.');
    else if (hbPorts.length === 1) w.push('⚠ Tek heartbeat arayüzü: bu bağlantı koparsa iki üye de birincil olur (split-brain). En az iki heartbeat, doğrudan kabloyla önerilir.');
    const both = mon.filter(p => hbPorts.indexOf(p) !== -1);
    if (both.length) w.push('⚠ Heartbeat arayüzü izleniyor (' + both.join(', ') + '): heartbeat arayüzleri monitor listesine konmaz.');
    if (!mon.length) w.push('⚠ İzlenen arayüz yok: WAN ya da LAN kablosu kopsa bile failover olmaz (fgt-25).');
    if (!ovr) w.push('ℹ override kapalı: seçimde uptime (5 dk üzeri fark) öncelikten önce gelir; önceliği yüksek üye, uptime\'ı kısaysa birincil olmayabilir. Durumu get system ha status → "Primary selected using" satırı söyler (fgt-25).');
    else w.push('ℹ override açık: öncelikli üye her yeniden başladığında birincilliği geri alır (ek bir failover). İki üyede de override aynı olmalı.');
    if (sessionSync === 'disable') w.push('⚠ Session pickup kapalı: failover anında tüm oturumlar yeniden kurulur.');
    w.push('ℹ Aynı L2 segmentinde başka bir FortiGate kümesi varsa group-id farklı olmalı (varsayılan 0); sanal MAC\'ler group-id\'den türetilir.');
    return { config: c, warnings: w };
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
                        { name: 'ip', why: "Alt arayüz IP'si, o VLAN'daki istemcilerin gateway'i olur.",           label: 'IP Adresi',          type: 'text', validate: 'ip', required: true, placeholder: '10.64.100.1',     hint: 'Bu VLAN\'ın gateway IP\'si' },
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
    const w = [], ml = _fgWMaskLen(data.mask);
    if (String(data.name || '').length > 15) w.push('⛔ Arayüz adı en çok 15 karakter olabilir (' + String(data.name).length + ').');
    if (_fgWNetOrBcast(data.ip, ml)) w.push('⛔ IP alt ağın ağ ya da yayın adresi; arayüz adresi olamaz.');
    _fgWAccess('allowaccess', data.allowaccess, false, w);
    w.push('ℹ Zone zaten varsa "set interface" üye listesini baştan yazar ve diğer üyeleri çıkarır; mevcut zone\'a eklemek için "append interface" kullanın.');
    w.push('ℹ Karşı switch portu trunk olmalı ve bu VLAN\'ı (ID ' + (String(data.vlan_id || '').trim() || '?') + ') taşımalı; aynı VLAN ID aynı fiziksel arayüzde iki kez kullanılamaz.');
    return { config: c, warnings: w };
}

// ── FortiGate: DHCP Server ────────────────────────────────────────────────────
FortiGate.dhcp = {
    label: 'DHCP Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-hand-holding-medical',
                title: 'DHCP Server (FortiGate)',
                desc: 'Belirtilen arayüzde istemcilere IP dağıtan DHCP sunucusu konfigürasyonu.<br><code>config system dhcp server\n  edit 0\n    set interface "VLAN100"\n    set default-gateway 10.64.100.1\n    ...\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'DHCP Server',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'interface', why: "DHCP sunucusunun çalışacağı arayüz. Yanlış arayüz seçmek, istemcilerin adres alamamasına ve sorunun DHCP yerine kabloda aranmasına yol açar.", label: 'Interface',          type: 'text', validate: 'iface', required: true,  placeholder: 'VLAN100',         hint: 'DHCP sunucusunun çalışacağı arayüz' },
                        { name: 'start_ip', why: 'DHCP havuzunun başı. Statik IP verilen sunucular bu aralığın <b>dışında</b> kalmalı, aksi halde IP çakışması yaşanır.',  label: 'Pool Başlangıç IP', type: 'text', validate: 'ip', required: true,  placeholder: '10.64.100.10',  hint: 'Dağıtılacak IP aralığının başlangıcı' },
                        { name: 'end_ip', why: "Havuzun son adresi. Havuz boyutu eşzamanlı istemci sayısından büyük olmalı; dolduğunda yeni cihazlar sessizce adres alamaz.",    label: 'Pool Bitiş IP',     type: 'text', validate: 'ip', required: true,  placeholder: '10.64.100.200', hint: 'Dağıtılacak IP aralığının sonu' },
                        { name: 'gateway', why: "İstemcilere dağıtılacak varsayılan ağ geçidi. Genelde FortiGate'in o arayüzdeki IP'sidir.",   label: 'Default Gateway',   type: 'text', validate: 'ip', required: true,  placeholder: '10.64.100.1',   hint: 'İstemcilere verilecek varsayılan gateway' },
                        { name: 'mask', why: "Subnet maskesi nokta-ondalık verilir. Ağ büyüklüğünü belirler; sonradan büyütmek istemci yeniden adreslemesi gerektirir.",      label: 'Subnet Mask',       type: 'text', validate: 'subnet', required: true,  placeholder: '255.255.255.0',   hint: 'Nokta-ondalık subnet maskı' },
                        { name: 'dns1', why: 'İç kaynaklara isimle erişim için <b>iç DNS sunucusu</b> verilmelidir. Dış DNS vermek, iç sunucuların bulunamamasına yol açar.',      label: 'DNS Sunucu 1',      type: 'text', validate: 'ip', required: true,  placeholder: '10.64.99.53',         hint: 'Birincil DNS sunucusu' },
                        { name: 'dns2', why: "Yedek DNS. Tek DNS vermek, o sunucu düştüğünde tüm ağın isim çözümlemesini kaybetmesi demektir.",      label: 'DNS Sunucu 2',      type: 'text', validate: 'ip', optional: true,  placeholder: '10.64.99.54',         hint: 'İkincil DNS sunucusu (opsiyonel)' },
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
    c += '# Doğrulama:\n# show system dhcp server\n# execute dhcp lease-list\n';
    const w = [], ml = _fgWMaskLen(data.mask), net = _fgWIsIp(data.gateway) && ml >= 0 ? { ip: data.gateway, len: ml } : null;
    if (net) {
        if (_fgWIsIp(data.start_ip) && !_fgWIn(data.start_ip, net)) w.push('⛔ Başlangıç IP (' + data.start_ip + ') ağ geçidinin alt ağında değil: istemciler geçide ulaşamaz.');
        if (_fgWIsIp(data.end_ip) && !_fgWIn(data.end_ip, net)) w.push('⛔ Bitiş IP (' + data.end_ip + ') ağ geçidinin alt ağında değil.');
        if (_fgWNetOrBcast(data.gateway, ml)) w.push('⛔ Ağ geçidi alt ağın ağ ya da yayın adresi.');
        if (_fgWNetOrBcast(data.start_ip, ml) || _fgWNetOrBcast(data.end_ip, ml)) w.push('⚠ Aralık alt ağın ağ ya da yayın adresini içeriyor; o adresler istemciye verilemez.');
    }
    if (_fgWIsIp(data.start_ip) && _fgWIsIp(data.end_ip) && _fgWN(data.start_ip) > _fgWN(data.end_ip)) w.push('⛔ Başlangıç IP bitiş IP\'sinden büyük: aralık kaydedilmez.');
    if (_fgWIsIp(data.gateway) && _fgWIsIp(data.start_ip) && _fgWIsIp(data.end_ip) && _fgWN(data.gateway) >= _fgWN(data.start_ip) && _fgWN(data.gateway) <= _fgWN(data.end_ip))
        w.push('⚠ Ağ geçidi (' + data.gateway + ') dağıtım aralığının içinde: aynı adres bir istemciye verilip çakışabilir. Aralığı geçidin dışına alın.');
    const lt = String(data.lease || '').trim();
    if (lt && (!/^\d+$/.test(lt) || (+lt !== 0 && (+lt < 300 || +lt > 8640000)))) w.push('⚠ Kira süresi saniye olarak 300–8640000 arası olmalı (0 = sınırsız); "' + lt + '" reddedilebilir.');
    w.push('ℹ ' + (String(data.interface || '').trim() || 'Arayüz') + ' arayüzünün IP\'si bu alt ağda olmalı (genelde ağ geçidi adresi); DHCP sunucusu arayüzün ağına göre çalışır.');
    return { config: c, warnings: w };
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
                        { name: 'group_name', why: "HA grup adı iki üyede birebir aynı olmalı; farklıysa küme kurulmaz. Aynı L2 segmentindeki farklı kümeleri ayıran ise Group ID'dir (sanal MAC).",   label: 'Group Adı',         type: 'text',   required: true, placeholder: 'FG-HA',       hint: 'Küme adı — her iki cihazda aynı olmalı' },
                        { name: 'password', why: "HA parolası iki üyede aynı olmalı. Parolasız HA, ağa takılan başka bir FortiGate'in cluster'a katılmasına kapı bırakır.",     label: 'HA Şifresi',        type: 'text',   required: true, placeholder: 'hapassword',  hint: 'Her iki cihazda aynı şifre kullanılmalı' },
                        { name: 'monitor_intfs', why: 'İzlenen arayüz down olursa failover tetiklenir. WAN ve LAN arayüzlerini izlemek şarttır; izlenmezse hat kopsa bile cihaz primary kalmaya devam eder.',label: 'Monitor Interface\'ler', type: 'text', validate: 'iface_range', required: true, placeholder: 'port1,port2', hint: 'Virgül ya da boşlukla ayrılmış izlenecek arayüzler' },
                        { name: 'priority', why: '<code>override</code> kapalıyken (varsayılan) birincil seçimi: önce izlenen arayüzlerde daha az arıza, sonra <b>uptime</b> (5 dk\'dan fazla fark), sonra öncelik. Yani önceliği yüksek üye tek başına birincil olmaz; eski birincil geri döndüğünde rolü geri almaz (ikinci kesinti olmaz). override açıkken öncelik uptime\'ın önüne geçer.',     label: 'Priority',          type: 'text',   required: true, placeholder: '128',         hint: '0–255; birincil cihaz için daha yüksek değer' },
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
    const groupId      = cgEsc(String(data.group_id || '1').trim());
    const groupName    = cgEsc(data.group_name || '');
    const password     = cgEsc(data.password || '');
    // Virgül ya da boşluk ayrımlı: her arayüz ayrı tırnak ("port1" "port2")
    const monitorIntfs = _fgWList(data.monitor_intfs);
    const priority     = cgEsc(String(data.priority || '128').trim());
    const sessionSync  = cgEsc(data.session_sync || 'enable');
    const monitorStr   = monitorIntfs.map(i => cgQ(i)).join(' ');
    const w = [];
    let c = '# ========================================\n# FortiGate — HA Active-Active\n# ========================================\n\n';
    c += 'config system ha\n    set mode a-a\n    set group-id ' + groupId + '\n    set group-name "' + groupName + '"\n';
    c += '    set password "' + password + '"\n    set priority ' + priority + '\n';
    c += '    set session-pickup ' + sessionSync + '\n';
    if (monitorStr) c += '    set monitor ' + monitorStr + '\n';
    c += 'end\n\n';
    c += '# NOT: HA konfigürasyonu her iki cihaza ayrı ayrı uygulanır; heartbeat (hbdev) ayarı ayrıca yapılmalıdır.\n\n';
    c += '# Doğrulama:\n# get system ha status\n# diagnose sys ha checksum cluster\n';
    if (!/^\d+$/.test(priority) || +priority > 255) w.push('⛔ Priority 0–255 arası tam sayı olmalı.');
    if (!/^\d+$/.test(groupId)) w.push('⛔ Group ID tam sayı olmalı.');
    if (String(data.group_name || '').length > 32) w.push('⛔ HA grup adı en çok 32 karakter olabilir.');
    if (!monitorIntfs.length) w.push('⚠ İzlenen arayüz yok: hat kopsa bile failover olmaz.');
    w.push('ℹ override varsayılan olarak kapalı: seçimde uptime (5 dk üzeri fark) öncelikten önce gelir; önceliği yüksek üye birincil olmayabilir (fgt-25).');
    w.push('ℹ Bu araç heartbeat arayüzünü (set hbdev) yazmaz; varsayılanı modele göre değişir. hbdev\'in heartbeat kablosunun gerçekten bağlı olduğu arayüzleri gösterdiğini show system ha ile doğrulayın, yoksa küme kurulmaz (fgt-27).');
    return { config: c, warnings: w };
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
    if (!allowedVlans.length) c += '# UYARI: izinli VLAN listesi boş veya geçersiz — allowed-vlans satırı yazılmadı.\n';
    c += '# Not: FortiGate tarafından yönetilen FortiSwitch için uygulanır.\n\n';
    c += 'config switch-controller vlan-policy\n    edit "' + pname + '"\n';
    if (allowedVlans.length) c += '        set allowed-vlans ' + allowedVlans.join(' ') + '\n';
    if (nativeVlan) c += '        set untagged-vlans ' + nativeVlan + '\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show switch-controller vlan-policy "' + pname + '"\n';
    return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// Ortak yardımcılar (yeni araçlar)
// ══════════════════════════════════════════════════════════════════════════════
// Virgül / satır sonu ile ayrılmış nesne adlarını '"a" "b"' biçimine çevirir.
// Nesne adları boşluk içerebildiği için boşluk ayraç DEĞİLDİR.
function cgFgQList(s) {
    return String(s || '').split(/[,\n]+/).map(x => x.trim()).filter(Boolean)
        .map(x => cgQ(x)).join(' ');
}
// Arayüz adları boşluk içermez: virgül / boşluk / satır sonu ayraçtır.
function cgFgIfList(s) {
    return String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean)
        .map(x => cgQ(x)).join(' ');
}
// FortiOS port aralığı listesi: '443 8443 1000-2000' → geçerli parçalar + hatalı parçalar.
function cgFgPortRanges(s) {
    const ok = [], bad = [];
    String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean).forEach(p => {
        const m = p.match(/^(\d{1,5})(?:-(\d{1,5}))?$/);
        if (m && +m[1] >= 1 && +m[1] <= 65535 && (!m[2] || (+m[2] <= 65535 && +m[1] <= +m[2]))) ok.push(p);
        else bad.push(p);
    });
    return { ok, bad };
}
const CG_FG_IPRE = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

// ── FortiGate: Static Route ───────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — dst/gateway/device/distance/priority/comment/status)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/200835411/config-router-static (blackhole)
FortiGate.static = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route (FortiGate)',
                desc: 'IPv4 statik rota: gateway üzerinden veya blackhole (trafiği düşüren) rota.<br><code>config router static\n  edit 10\n    set dst 10.64.0.0 255.255.0.0\n    set gateway 192.0.2.1\n    set device "port1"\n  next\nend</code>'
            },
            configTypes: [
                { id: 'gw',        label: 'Gateway Rotası',  icon: 'fas fa-arrow-right', desc: 'Next-hop IP + çıkış arayüzü', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'tunnel',    label: 'Tünel / Arayüz',  icon: 'fas fa-lock',        desc: 'Yalnız çıkış arayüzü (IPsec tüneli)' },
                { id: 'blackhole', label: 'Blackhole',       icon: 'fas fa-ban',         desc: 'Eşleşen trafiği sessizce düşürür' }
            ],
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'seq', why: 'FortiOS statik rotaları sıra numarasıyla (<code>edit N</code>) tutar. Var olan bir numarayı yazarsan o rotanın üzerine yazılır — önce <code>show router static</code> ile boş numara seç.', label: 'Sıra No (seq-num)', type: 'text', required: true, validate: 'posint', placeholder: '10', hint: 'edit numarası' },
                        { name: 'dst', why: 'Hedef ağ ve maskesi. Varsayılan rota için <code>0.0.0.0 0.0.0.0</code>. Yanlış maske (ör. /16 yerine /24) trafiğin bir kısmını başka rotaya kaçırır.', label: 'Hedef (IP MASK)', type: 'text', required: true, validate: 'ip_mask', placeholder: '10.64.0.0 255.255.0.0', hint: 'Nokta-ondalık: IP MASK' }
                    ]
                },
                {
                    title: 'Next-hop',
                    icon: 'fas fa-arrow-right',
                    showFor: ['gw', 'tunnel'],
                    fields: [
                        { name: 'gateway', why: 'Sonraki atlama IP\'si, çıkış arayüzüyle aynı ağda olmalı. Aksi halde rota tabloya girmez (inactive kalır).', label: 'Gateway', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['gw'] }, placeholder: '192.0.2.1', hint: 'Next-hop IP' },
                        { name: 'device', why: 'FortiOS statik rotada çıkış arayüzü ister. IPsec tüneli için tünelin phase1 adı yazılır; gateway gerekmez.', label: 'Çıkış Arayüzü (device)', type: 'text', requiredIf: { field: '_cgtype', in: ['gw', 'tunnel'] }, placeholder: 'port1', hint: 'Arayüz veya tünel adı' }
                    ]
                },
                {
                    title: 'Tercih & Açıklama',
                    icon: 'fas fa-sort-amount-down',
                    fields: [
                        { name: 'distance', why: 'Yönetimsel mesafe (varsayılan 10). Küçük olan kazanır; yedek (floating) rota için daha büyük değer ver. Eşit distance\'ta <code>priority</code> devreye girer.', label: 'Distance', type: 'text', min: 1, max: 255, placeholder: '20', hint: '1–255 (varsayılan 10)' },
                        { name: 'priority', why: 'Aynı distance\'taki rotalar arasında tercih (küçük olan tercih edilir, varsayılan 1). İki rota da tabloda kalır — ECMP yerine aktif/yedek yapmak için kullanılır.', label: 'Priority', type: 'text', min: 1, max: 65535, placeholder: '5', hint: '1–65535 (varsayılan 1)' },
                        { name: 'comment', why: 'Yüzlerce statik rotası olan cihazda rotanın kime ait olduğunu açıklama söyler.', label: 'Açıklama', type: 'text', placeholder: 'Şube-01 ağı', hint: 'comment' },
                        { name: 'disabled', why: 'Rotayı pasif oluşturur; bakım penceresinde <code>set status enable</code> ile açılır.', label: 'Devre dışı oluştur', type: 'checkbox', checked: false, hint: 'set status disable' }
                    ]
                }
            ],
            submit: 'Rota Oluştur'
        }, (data) => cgFgStaticGen(data));
    }
};
function cgFgStaticGen(data) {
    const ty = data._cgtype || 'gw';
    const seq = cgEsc(data.seq || '');
    let c = '# ========================================\n# FortiGate — Static Route\n# ========================================\n\n';
    if (ty === 'blackhole') c += '# Not: blackhole rota eşleşen trafiği sessizce düşürür (özet/sinkhole rota).\n';
    c += 'config router static\n    edit ' + seq + '\n';
    c += '        set dst ' + cgEsc(data.dst || '') + '\n';
    if (ty === 'blackhole') {
        c += '        set blackhole enable\n';
    } else {
        if (ty === 'gw') c += '        set gateway ' + cgEsc(data.gateway || '') + '\n';
        c += '        set device "' + cgEsc(data.device || '') + '"\n';
    }
    if (data.distance) c += '        set distance ' + cgEsc(data.distance) + '\n';
    if (data.priority) c += '        set priority ' + cgEsc(data.priority) + '\n';
    if (data.comment) c += '        set comment "' + cgEsc(data.comment) + '"\n';
    if (data.disabled) c += '        set status disable\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show router static ' + seq + '\n# get router info routing-table static\n# get router info routing-table database\n';
    const w = [], dn = _fgWNet(data.dst), dist = String(data.distance || '').trim();
    if (_fgWHostBits(dn)) w.push('⚠ Hedefte host bitleri dolu (' + String(data.dst).trim() + '): ağ adresini yazın (ör. 10.64.10.0 255.255.255.0); aksi hâlde kastettiğiniz ağ eşleşmeyebilir.');
    if (ty === 'gw' && String(data.gateway || '').trim() === '0.0.0.0') w.push('⛔ Gateway 0.0.0.0 olamaz: next-hop yoksa Tünel / Arayüz tipini seçin.');
    if (ty !== 'blackhole' && dist && +dist > 10) w.push('ℹ Distance ' + dist + ' (varsayılan 10): aynı hedefe daha düşük mesafeli rota varken bu rota tabloda GÖRÜNMEZ; birincil düşünce devreye girer (yedek/floating rota, fgt-06). Mesafe tabanlı yedekleme yalnız arayüz düşünce çalışır; hat ölü ama arayüz up ise link-monitor gerekir.');
    if (ty !== 'blackhole' && !dist && dn && dn.len === 0) w.push('ℹ Varsayılan rota mesafe 10 ile yazılır. Yedek hat için ikinci rotaya daha yüksek distance verin; eşit mesafe ve öncelikte iki rota ECMP olur (trafik bölünür).');
    if (data.priority && dist && +dist <= 10) w.push('ℹ Priority yalnız AYNI distance\'taki rotalar arasında seçim yapar (küçük olan tercih edilir); iki rota da tabloda kalır.');
    if (ty === 'tunnel') w.push('ℹ Tünel rotası: tünel düşünce rota tablodan çıkar ve trafik varsayılan rotayla internete şifresiz gidebilir. Aynı hedefe Blackhole tipinde, distance 254 bir rota ekleyin (fgt-11).');
    if (ty === 'blackhole' && dist !== '254') w.push('ℹ Blackhole bir tünelin yedeği olarak kullanılıyorsa distance 254 verin; aksi hâlde (varsayılan 10) asıl rotayla yarışır ve trafiği düşürebilir.');
    return { config: c, warnings: w };
}

// ── FortiGate: Service Object / Service Group ─────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — tcp-portrange/udp-portrange/protocol ICMP|IP/icmptype/protocol-number/category/comment; service group member)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/198499981/config-firewall-service-custom
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/242456538/config-firewall-service-group
FortiGate.service = {
    label: 'Service Object / Group',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'Servis Nesnesi & Grubu (FortiGate)',
                desc: 'Policy\'lerde kullanılacak özel TCP/UDP, ICMP, IP protokol servisleri ve servis grupları.<br><code>config firewall service custom\n  edit "TCP_8443"\n    set tcp-portrange 8443\n  next\nend</code>'
            },
            configTypes: [
                { id: 'tcpudp', label: 'TCP / UDP',      icon: 'fas fa-exchange-alt', desc: 'Port veya port aralığı', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'icmp',   label: 'ICMP',           icon: 'fas fa-satellite-dish', desc: 'ICMP tipi (ör. 8 = echo)' },
                { id: 'ip',     label: 'IP Protokol No', icon: 'fas fa-hashtag',     desc: 'GRE (47), ESP (50) gibi' },
                { id: 'group',  label: 'Servis Grubu',   icon: 'fas fa-layer-group', desc: 'Mevcut servisleri gruplar' }
            ],
            sections: [
                {
                    title: 'Servis',
                    icon: 'fas fa-tag',
                    showFor: ['tcpudp', 'icmp', 'ip'],
                    fields: [
                        { name: 'svc_name', why: 'Adda protokol ve portu taşımak (<code>TCP_8443</code>) kural okumasını hızlandırır. Hazır servislerle (HTTPS, SSH) aynı adı verme.', label: 'Servis Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['tcpudp', 'icmp', 'ip'] }, placeholder: 'TCP_8443', hint: 'Policy service alanında kullanılacak ad' },
                        { name: 'svc_category', why: 'GUI\'deki servis kategorisi; yalnız görünümü düzenler. Var olmayan kategori adı hataya yol açar — boş bırakabilirsin.', label: 'Kategori', type: 'text', placeholder: 'Network Services', hint: 'Mevcut kategori adı (opsiyonel)' },
                        { name: 'svc_comment', why: 'Portun hangi uygulamaya ait olduğunu yazmak, ileride "bu port neden açık?" sorusunu cevaplar.', label: 'Açıklama', type: 'text', placeholder: 'Uygulama yönetim portu', hint: 'comment' }
                    ]
                },
                {
                    title: 'TCP / UDP Portları',
                    icon: 'fas fa-exchange-alt',
                    showFor: ['tcpudp'],
                    fields: [
                        { name: 'svc_l4', why: 'TCP ve UDP aynı servis nesnesinde birlikte tanımlanabilir (ör. DNS 53, LDAP 389). Gerekmeyen protokolü eklemek kuralı gereksiz genişletir.', label: 'L4 Protokol', type: 'select', options: [
                            { value: 'tcp',  label: 'TCP', selected: true },
                            { value: 'udp',  label: 'UDP' },
                            { value: 'both', label: 'TCP + UDP' }
                        ]},
                        { name: 'svc_ports', why: 'Hedef port(lar). Birden çok port/aralık boşlukla: <code>443 8443 1000-2000</code>. Geniş aralık (<code>1-65535</code>) servisi <code>ALL</code> ile eşdeğer yapar — kuralı daraltmanın anlamı kalmaz.', label: 'Port(lar)', type: 'text', requiredIf: { field: '_cgtype', in: ['tcpudp'] }, placeholder: '8443', hint: 'ör: 443 8443 1000-2000' }
                    ]
                },
                {
                    title: 'ICMP',
                    icon: 'fas fa-satellite-dish',
                    showFor: ['icmp'],
                    fields: [
                        { name: 'icmp_type', why: 'ICMP tipi: 8 = echo request, 0 = echo reply, 3 = unreachable. Boş bırakılırsa tüm ICMP tipleri eşleşir.', label: 'ICMP Tipi', type: 'text', min: 0, max: 255, placeholder: '8', hint: '0–255 (boş = tümü)' }
                    ]
                },
                {
                    title: 'IP Protokolü',
                    icon: 'fas fa-hashtag',
                    showFor: ['ip'],
                    fields: [
                        { name: 'proto_num', why: 'IANA protokol numarası: 47 = GRE, 50 = ESP, 89 = OSPF. TCP (6) / UDP (17) için TCP/UDP tipini kullan.', label: 'Protokol No', type: 'text', min: 0, max: 255, requiredIf: { field: '_cgtype', in: ['ip'] }, placeholder: '47', hint: '0–255' }
                    ]
                },
                {
                    title: 'Servis Grubu',
                    icon: 'fas fa-layer-group',
                    showFor: ['group'],
                    fields: [
                        { name: 'grp_name', why: 'Grup, birden fazla servisi tek policy satırında toplar; kural sayısını azaltır.', label: 'Grup Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['group'] }, placeholder: 'WEB_SERVICES', hint: 'Servis grubu adı' },
                        { name: 'grp_members', why: 'Üyeler önceden tanımlı servisler olmalı (hazır: HTTP, HTTPS, SSH… veya özel). Yazım hatası tüm komutu reddettirir.', label: 'Üyeler', type: 'textarea', requiredIf: { field: '_cgtype', in: ['group'] }, placeholder: 'HTTP\nHTTPS\nTCP_8443', hint: 'Her satıra bir servis (veya virgülle)' },
                        { name: 'grp_comment', why: 'Grubun hangi uygulama için olduğunu yaz.', label: 'Açıklama', type: 'text', placeholder: 'Web uygulama servisleri', hint: 'comment' }
                    ]
                }
            ],
            submit: 'Servis Oluştur'
        }, (data) => cgFgServiceGen(data));
    }
};
function cgFgServiceGen(data) {
    const ty = data._cgtype || 'tcpudp';
    let c = '# ========================================\n# FortiGate — Service Object\n# ========================================\n\n';
    if (ty === 'group') {
        const name = cgEsc(data.grp_name || '');
        const mem = cgFgQList(data.grp_members);
        if (!mem) c += '# UYARI: üye listesi boş — member satırı yazılmadı.\n';
        c += 'config firewall service group\n    edit "' + name + '"\n';
        if (mem) c += '        set member ' + mem + '\n';
        if (data.grp_comment) c += '        set comment "' + cgEsc(data.grp_comment) + '"\n';
        c += '    next\nend\n\n';
        c += '# Doğrulama:\n# show firewall service group "' + name + '"\n';
        return c;
    }
    const name = cgEsc(data.svc_name || '');
    let body = '';
    if (ty === 'tcpudp') {
        const pr = cgFgPortRanges(data.svc_ports), l4 = data.svc_l4 || 'tcp';
        if (pr.bad.length) c += '# UYARI: geçersiz port ifadesi atlandı: ' + cgEsc(pr.bad.join(' ')) + '\n';
        if (!pr.ok.length) return c + '\n# Servis yazılmadı: en az bir geçerli port (1-65535) girin.\n';
        if (pr.ok.indexOf('1-65535') !== -1) c += '# UYARI: 1-65535 aralığı tüm portları kapsar (ALL ile eşdeğer).\n';
        if (l4 === 'tcp' || l4 === 'both') body += '        set tcp-portrange ' + pr.ok.join(' ') + '\n';
        if (l4 === 'udp' || l4 === 'both') body += '        set udp-portrange ' + pr.ok.join(' ') + '\n';
    } else if (ty === 'icmp') {
        body += '        set protocol ICMP\n';
        if (data.icmp_type !== undefined && String(data.icmp_type).trim() !== '') body += '        set icmptype ' + cgEsc(data.icmp_type) + '\n';
    } else {
        body += '        set protocol IP\n';
        body += '        set protocol-number ' + cgEsc(data.proto_num || '') + '\n';
    }
    c += 'config firewall service custom\n    edit "' + name + '"\n' + body;
    if (data.svc_category) c += '        set category "' + cgEsc(data.svc_category) + '"\n';
    if (data.svc_comment) c += '        set comment "' + cgEsc(data.svc_comment) + '"\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall service custom "' + name + '"\n';
    return c;
}

// ── FortiGate: Address Group + toplu adres ────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — addrgrp member/comment/allow-routing; address subnet/start-ip/end-ip)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/301511994/config-firewall-addrgrp
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/306021697/config-firewall-address
FortiGate.addrgrp = {
    label: 'Address Group / Toplu Adres',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-object-group',
                title: 'Adres Grubu & Toplu Adres (FortiGate)',
                desc: 'Mevcut adres nesnelerinden grup oluşturur veya IP listesinden tek seferde adres nesneleri + grup üretir.<br><code>config firewall addrgrp\n  edit "WEB_SERVERS"\n    set member "SRV_10.0.0.10" "SRV_10.0.0.11"\n  next\nend</code>'
            },
            configTypes: [
                { id: 'bulk',  label: 'IP Listesinden', icon: 'fas fa-list', desc: 'IP/CIDR/aralık listesi → adres + grup', badge: { text: 'Toplu', cls: 'recommended' } },
                { id: 'group', label: 'Mevcut Nesneler', icon: 'fas fa-object-group', desc: 'Tanımlı adres nesnelerini grupla' }
            ],
            sections: [
                {
                    title: 'Grup',
                    icon: 'fas fa-object-group',
                    fields: [
                        { name: 'ag_name', why: 'Grup adı policy\'de srcaddr/dstaddr olarak kullanılır. Grup üyeliğini değiştirmek, kuralı değiştirmeden erişimi günceller.', label: 'Grup Adı', type: 'text', required: true, placeholder: 'WEB_SERVERS', hint: 'addrgrp adı' },
                        { name: 'ag_comment', why: 'Grubun amacını (hangi uygulama, kim talep etti) yazmak denetimde işe yarar.', label: 'Açıklama', type: 'text', placeholder: 'Web sunucuları', hint: 'comment' },
                        { name: 'ag_routing', why: 'Açıksa grup statik rota / SD-WAN hedefi olarak da kullanılabilir. Yalnız policy için gerekmez.', label: 'Rotalamada kullanılabilir (allow-routing)', type: 'checkbox', checked: false, hint: 'set allow-routing enable' }
                    ]
                },
                {
                    title: 'IP Listesi',
                    icon: 'fas fa-list',
                    showFor: ['bulk'],
                    info: 'Her satıra bir girdi: <code>10.0.0.10</code> · <code>10.0.1.0/24</code> · <code>10.0.2.0 255.255.255.0</code> · <code>10.0.3.10-10.0.3.20</code>. Tekrarlar atlanır.',
                    fields: [
                        { name: 'ag_list', why: 'Her satır ayrı <code>firewall address</code> nesnesi olur ve gruba eklenir. Geçersiz satırlar atlanır ve çıktıda UYARI olarak listelenir.', label: 'IP / Ağ Listesi', type: 'textarea', requiredIf: { field: '_cgtype', in: ['bulk'] }, placeholder: '10.0.0.10\n10.0.1.0/24', hint: 'Satır satır' },
                        { name: 'ag_prefix', why: 'Nesne adı = önek + adres (ör. <code>SRV_10.0.0.10</code>, ağlar için <code>SRV_10.0.1.0_24</code>). Önek, nesneyi hangi amaçla açtığını gösterir.', label: 'Nesne Adı Öneki', type: 'text', placeholder: 'SRV_', hint: 'Boşsa ad = adres' }
                    ]
                },
                {
                    title: 'Üyeler',
                    icon: 'fas fa-list',
                    showFor: ['group'],
                    fields: [
                        { name: 'ag_members', why: 'Üyeler önceden tanımlı adres nesnesi/grubu olmalı. Olmayan ad yazılırsa FortiOS tüm satırı reddeder.', label: 'Üye Nesneler', type: 'textarea', requiredIf: { field: '_cgtype', in: ['group'] }, placeholder: 'SRV_WEB01\nSRV_WEB02', hint: 'Her satıra bir nesne (veya virgülle)' }
                    ]
                }
            ],
            submit: 'Grup Oluştur'
        }, (data) => cgFgAddrgrpGen(data));
    }
};
function cgFgAddrgrpGen(data) {
    const ty = data._cgtype || 'bulk';
    const gname = cgEsc(data.ag_name || '');
    let c = '# ========================================\n# FortiGate — Address Group\n# ========================================\n\n';
    let members = [];
    if (ty === 'bulk') {
        const prefix = String(data.ag_prefix || '').trim();
        const seen = new Set(), bad = [];
        let addr = '';
        String(data.ag_list || '').split(/\n+/).map(x => x.trim()).filter(Boolean).forEach(line => {
            let name = '', body = '', m;
            if (CG_FG_IPRE.test(line)) {
                name = line; body = '        set subnet ' + line + ' 255.255.255.255\n';
            } else if ((m = line.match(/^(\S+)\/(\d{1,2})$/)) && CG_FG_IPRE.test(m[1]) && +m[2] <= 32) {
                const len = +m[2];
                const mask = [0, 1, 2, 3].map(i => { const b = Math.max(0, Math.min(8, len - i * 8)); return 256 - Math.pow(2, 8 - b); }).join('.');
                name = len === 32 ? m[1] : m[1] + '_' + len; body = '        set subnet ' + m[1] + ' ' + mask + '\n';
            } else if ((m = line.match(/^(\S+)\s+(\S+)$/)) && CG_FG_IPRE.test(m[1]) && cgMaskLen(m[2]) !== '') {
                const len = cgMaskLen(m[2]);
                name = String(len) === '32' ? m[1] : m[1] + '_' + len; body = '        set subnet ' + m[1] + ' ' + m[2] + '\n';
            } else if ((m = line.match(/^(\S+)\s*-\s*(\S+)$/)) && CG_FG_IPRE.test(m[1]) && CG_FG_IPRE.test(m[2])) {
                name = m[1] + '-' + m[2]; body = '        set type iprange\n        set start-ip ' + m[1] + '\n        set end-ip ' + m[2] + '\n';
            } else { bad.push(line); return; }
            name = cgEsc(prefix + name);
            if (seen.has(name)) return;
            seen.add(name); members.push(name);
            addr += '    edit "' + name + '"\n' + body + '    next\n';
        });
        if (bad.length) c += '# UYARI: tanınmayan satır atlandı: ' + cgEsc(bad.join(' | ')) + '\n';
        if (addr) c += 'config firewall address\n' + addr + 'end\n\n';
    } else {
        members = String(data.ag_members || '').split(/[,\n]+/).map(x => x.trim()).filter(Boolean).map(cgEsc);
    }
    if (!members.length) {
        c += '# UYARI: geçerli üye yok — boş grup oluşturulamaz, addrgrp yazılmadı.\n';
        return c;
    }
    c += 'config firewall addrgrp\n    edit "' + gname + '"\n';
    c += '        set member ' + members.map(x => '"' + x + '"').join(' ') + '\n';
    if (data.ag_comment) c += '        set comment "' + cgEsc(data.ag_comment) + '"\n';
    if (data.ag_routing) c += '        set allow-routing enable\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall addrgrp "' + gname + '"\n# show firewall address\n';
    return c;
}

// ── FortiGate: Zone ───────────────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — interface/intrazone) + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/314783845/config-system-zone
FortiGate.zone = {
    label: 'Zone',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-th-large',
                title: 'Zone (FortiGate)',
                desc: 'Birden çok arayüzü tek bir zone altında toplar; policy\'ler arayüz yerine zone\'a yazılır.<br><code>config system zone\n  edit "INTERNAL"\n    set interface "port2" "port3"\n    set intrazone deny\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Zone',
                    icon: 'fas fa-th-large',
                    warn: 'Bir arayüz zone\'a eklenmeden önce ona doğrudan referans veren policy/rota olmamalıdır; aksi halde FortiOS ekleme işlemini reddeder.',
                    fields: [
                        { name: 'zone_name', why: 'Zone adı policy\'de <code>srcintf</code>/<code>dstintf</code> olarak kullanılır (en fazla 35 karakter).', label: 'Zone Adı', type: 'text', required: true, placeholder: 'INTERNAL', hint: 'Zone adı' },
                        { name: 'zone_ifaces', why: 'Zone üyesi arayüzler. Bir arayüz yalnız bir zone\'da olabilir.', label: 'Arayüzler', type: 'text', required: true, validate: 'iface_range', placeholder: 'port2 port3', hint: 'Boşluk veya virgülle ayrılmış' },
                        { name: 'intrazone', why: '<code>deny</code> (varsayılan): aynı zone\'daki arayüzler arası trafik için ayrıca policy gerekir. <code>allow</code>: zone içi trafik policy olmadan geçer — segmentasyonu kaldırır.', label: 'Zone İçi Trafik', type: 'select', options: [
                            { value: 'deny',  label: 'deny (policy gerekir)', selected: true },
                            { value: 'allow', label: 'allow (serbest)' }
                        ]},
                        { name: 'zone_desc', why: 'Zone\'un hangi ağları kapsadığını açıklar.', label: 'Açıklama', type: 'text', placeholder: 'Kullanıcı VLANları', hint: 'description' }
                    ]
                }
            ],
            submit: 'Zone Oluştur'
        }, (data) => cgFgZoneGen(data));
    }
};
function cgFgZoneGen(data) {
    const name = cgEsc(data.zone_name || '');
    const ifs = cgFgIfList(data.zone_ifaces);
    const intra = data.intrazone === 'allow' ? 'allow' : 'deny';
    let c = '# ========================================\n# FortiGate — Zone\n# ========================================\n\n';
    if (intra === 'allow') c += '# UYARI: intrazone allow — zone içindeki arayüzler arası trafik policy olmadan geçer.\n';
    c += 'config system zone\n    edit "' + name + '"\n';
    if (data.zone_desc) c += '        set description "' + cgEsc(data.zone_desc) + '"\n';
    if (ifs) c += '        set interface ' + ifs + '\n';
    c += '        set intrazone ' + intra + '\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show system zone "' + name + '"\n';
    return c;
}

// ── FortiGate: Traffic Shaping ────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — traffic-shaper bandwidth-unit/guaranteed/maximum/priority/per-policy;
//            shaping-policy name/srcintf/dstintf/srcaddr/dstaddr/service/traffic-shaper/traffic-shaper-reverse/comment/status)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/315847846/config-firewall-shaper-traffic-shaper
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/968775025/config-firewall-shaping-policy
FortiGate.shaper = {
    label: 'Traffic Shaping',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Traffic Shaper & Shaping Policy (FortiGate)',
                desc: 'Paylaşımlı trafik şekillendirici (garanti / üst sınır / öncelik) ve onu trafiğe bağlayan shaping policy.<br><code>config firewall shaper traffic-shaper\n  edit "LIMIT_50M"\n    set bandwidth-unit mbps\n    set maximum-bandwidth 50\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Traffic Shaper',
                    icon: 'fas fa-tachometer-alt',
                    fields: [
                        { name: 'sh_name', why: 'Shaper adında limiti taşımak (<code>LIMIT_50M</code>) policy okurken değeri hemen gösterir.', label: 'Shaper Adı', type: 'text', required: true, placeholder: 'LIMIT_50M', hint: 'traffic-shaper adı' },
                        { name: 'sh_unit', why: 'Garanti ve üst sınır bu birimle yorumlanır. Varsayılan kbps\'dir — birimi yazmayı unutup 50 girmek 50 kbps demektir.', label: 'Birim', type: 'select', options: [
                            { value: 'mbps', label: 'Mbps', selected: true },
                            { value: 'kbps', label: 'Kbps' },
                            { value: 'gbps', label: 'Gbps' }
                        ]},
                        { name: 'sh_max', why: 'Üst sınır: trafik bu değeri aşamaz. 0 = sınır yok.', label: 'Maksimum Bant', type: 'text', required: true, min: 0, max: 80000000, placeholder: '50', hint: 'Seçilen birimde' },
                        { name: 'sh_guar', why: 'Garanti edilen bant; tıkanıklıkta bu trafiğe öncelikle ayrılır. Tüm shaper garantilerinin toplamı hat kapasitesini aşmamalı.', label: 'Garanti Bant', type: 'text', min: 0, max: 80000000, placeholder: '10', hint: 'Seçilen birimde (opsiyonel)' },
                        { name: 'sh_prio', why: 'Garanti ile maksimum arasındaki bant paylaşımında öncelik. Ses/video için <code>high</code>, yedekleme için <code>low</code>.', label: 'Öncelik', type: 'select', options: [
                            { value: 'high',   label: 'high (varsayılan)', selected: true },
                            { value: 'medium', label: 'medium' },
                            { value: 'low',    label: 'low' }
                        ]},
                        { name: 'sh_perpolicy', why: 'Kapalıyken shaper\'ı kullanan tüm policy\'ler aynı bandı paylaşır. Açıkken her policy kendi ayrı limitini alır.', label: 'Policy başına ayrı (per-policy)', type: 'checkbox', checked: false, hint: 'set per-policy enable' }
                    ]
                },
                {
                    title: 'Shaping Policy',
                    icon: 'fas fa-filter',
                    info: 'Shaper tek başına etkisizdir; bir shaping policy trafiği ona bağlar.',
                    fields: [
                        { name: 'sp_enable', why: 'Shaper\'ı trafiğe bağlayan policy\'yi de üretir. Kapalıysa yalnız shaper nesnesi oluşur (mevcut bir policy\'de kullanmak için).', label: 'Shaping policy de oluştur', type: 'checkbox', checked: true, hint: 'config firewall shaping-policy' },
                        { name: 'sp_id', why: 'Shaping policy\'ler de yukarıdan aşağı ilk eşleşme ile çalışır. Var olan bir ID üzerine yazar.', label: 'Policy ID', type: 'text', validate: 'posint', requiredIf: { field: 'sp_enable', checked: true }, placeholder: '1', hint: 'edit numarası' },
                        { name: 'sp_name', why: 'Policy\'yi listede tanımayı sağlar.', label: 'Policy Adı', type: 'text', placeholder: 'YEDEKLEME_LIMIT', hint: 'name (opsiyonel)' },
                        { name: 'sp_srcintf', why: 'Trafiğin girdiği arayüz (opsiyonel). Boşsa tüm girişler eşleşir.', label: 'Kaynak Arayüz', type: 'text', placeholder: 'port2', hint: 'srcintf (opsiyonel)' },
                        { name: 'sp_dstintf', why: 'Şekillendirme çıkış arayüzünde uygulanır; genelde WAN arayüzü.', label: 'Hedef Arayüz', type: 'text', requiredIf: { field: 'sp_enable', checked: true }, placeholder: 'port1', hint: 'dstintf' },
                        { name: 'sp_srcaddr', why: 'Kaynak adres nesnesi. <code>all</code> tüm kaynakları şekillendirir.', label: 'Kaynak Adres', type: 'text', requiredIf: { field: 'sp_enable', checked: true }, placeholder: 'LAN_SUBNET', hint: 'Adres nesnesi (virgülle çoklu)' },
                        { name: 'sp_dstaddr', why: 'Hedef adres nesnesi.', label: 'Hedef Adres', type: 'text', requiredIf: { field: 'sp_enable', checked: true }, placeholder: 'all', hint: 'Adres nesnesi (virgülle çoklu)' },
                        { name: 'sp_service', why: 'Şekillendirilecek servis. Yalnız belirli bir uygulamayı sınırlamak için daraltın.', label: 'Servis', type: 'text', requiredIf: { field: 'sp_enable', checked: true }, placeholder: 'ALL', hint: 'Servis nesnesi (virgülle çoklu)' },
                        { name: 'sp_reverse', why: 'Reverse shaper dönüş (indirme) yönünü şekillendirir. Çoğu senaryoda iki yönün de sınırlanması istenir.', label: 'Dönüş yönünde de uygula', type: 'checkbox', checked: true, hint: 'traffic-shaper-reverse' }
                    ]
                }
            ],
            submit: 'Shaper Oluştur'
        }, (data) => cgFgShaperGen(data));
    }
};
function cgFgShaperGen(data) {
    const name = cgEsc(data.sh_name || '');
    const max = String(data.sh_max || '').trim(), guar = String(data.sh_guar || '').trim();
    let c = '# ========================================\n# FortiGate — Traffic Shaping\n# ========================================\n\n';
    if (guar && max && +max > 0 && +guar > +max) c += '# UYARI: garanti bant maksimumdan büyük — FortiOS bu değeri kabul etmez.\n';
    c += 'config firewall shaper traffic-shaper\n    edit "' + name + '"\n';
    c += '        set bandwidth-unit ' + cgEsc(data.sh_unit || 'mbps') + '\n';
    if (guar) c += '        set guaranteed-bandwidth ' + cgEsc(guar) + '\n';
    c += '        set maximum-bandwidth ' + cgEsc(max) + '\n';
    if (data.sh_prio && data.sh_prio !== 'high') c += '        set priority ' + cgEsc(data.sh_prio) + '\n';
    if (data.sh_perpolicy) c += '        set per-policy enable\n';
    c += '    next\nend\n\n';
    const spid = String(data.sp_id || '').trim();
    if (data.sp_enable) {
        const need = { 'Policy ID': spid, 'Hedef Arayüz': data.sp_dstintf, 'Kaynak Adres': data.sp_srcaddr, 'Hedef Adres': data.sp_dstaddr, 'Servis': data.sp_service };
        const miss = Object.keys(need).filter(k => !String(need[k] || '').trim());
        if (miss.length) {
            c += '# Shaping policy yazılmadı — eksik alan: ' + miss.join(', ') + '\n\n';
        } else {
            c += 'config firewall shaping-policy\n    edit ' + cgEsc(spid) + '\n';
            if (data.sp_name) c += '        set name "' + cgEsc(data.sp_name) + '"\n';
            if (data.sp_srcintf) c += '        set srcintf ' + cgFgIfList(data.sp_srcintf) + '\n';
            c += '        set dstintf ' + cgFgIfList(data.sp_dstintf) + '\n';
            c += '        set srcaddr ' + cgFgQList(data.sp_srcaddr) + '\n';
            c += '        set dstaddr ' + cgFgQList(data.sp_dstaddr) + '\n';
            c += '        set service ' + cgFgQList(data.sp_service) + '\n';
            c += '        set traffic-shaper "' + name + '"\n';
            if (data.sp_reverse) c += '        set traffic-shaper-reverse "' + name + '"\n';
            c += '    next\nend\n\n';
        }
    }
    c += '# Doğrulama:\n# show firewall shaper traffic-shaper "' + name + '"\n# show firewall shaping-policy\n# diagnose firewall shaper traffic-shaper list\n';
    return c;
}

// ── FortiGate: Log (Syslog / FortiAnalyzer) ───────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — syslogd..syslogd4 setting status/server/source-ip/facility;
//            fortianalyzer setting status/server/serial/source-ip/upload-option/reliable/enc-algorithm/certificate-verification)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/141516630/config-log-syslogd-setting (mode/port/format)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/269170403/config-log-fortianalyzer-setting
FortiGate.logging = {
    label: 'Log (Syslog / FortiAnalyzer)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Uzak Log Hedefi (FortiGate)',
                desc: 'Syslog sunucusu (4 slota kadar) veya FortiAnalyzer\'a log gönderimi.<br><code>config log syslogd setting\n  set status enable\n  set server "192.0.2.50"\nend</code>'
            },
            configTypes: [
                { id: 'syslog', label: 'Syslog',        icon: 'fas fa-server',    desc: 'SIEM / syslog sunucusu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'faz',    label: 'FortiAnalyzer', icon: 'fas fa-chart-bar', desc: 'FortiAnalyzer / FAZ Cloud' }
            ],
            sections: [
                {
                    title: 'Syslog',
                    icon: 'fas fa-server',
                    showFor: ['syslog'],
                    fields: [
                        { name: 'sl_slot', why: 'FortiOS dört bağımsız syslog hedefi tutar (<code>syslogd</code> … <code>syslogd4</code>). Dolu bir slotu seçersen mevcut hedefin üzerine yazarsın.', label: 'Slot', type: 'select', options: [
                            { value: 'syslogd',  label: 'syslogd (1)', selected: true },
                            { value: 'syslogd2', label: 'syslogd2' },
                            { value: 'syslogd3', label: 'syslogd3' },
                            { value: 'syslogd4', label: 'syslogd4' }
                        ]},
                        { name: 'sl_server', why: 'Syslog sunucusunun IP\'si veya FQDN\'i.', label: 'Sunucu', type: 'text', requiredIf: { field: '_cgtype', in: ['syslog'] }, placeholder: '192.0.2.50', hint: 'IP veya FQDN' },
                        { name: 'sl_mode', why: 'UDP kayıpsızlık garantisi vermez; denetim logları için TCP tabanlı <code>reliable</code> (RFC 6587) daha güvenlidir. Sunucu tarafı da TCP dinlemeli.', label: 'Taşıma', type: 'select', options: [
                            { value: 'udp',      label: 'UDP (varsayılan)', selected: true },
                            { value: 'reliable', label: 'reliable (TCP, RFC 6587)' }
                        ]},
                        { name: 'sl_port', why: 'Varsayılan 514. SIEM farklı port dinliyorsa değiştir.', label: 'Port', type: 'text', validate: 'port', placeholder: '514', hint: 'Boşsa 514' },
                        { name: 'sl_facility', why: 'SIEM tarafında kaynak ayırmak için facility kullanılır (varsayılan local7).', label: 'Facility', type: 'select', options: [
                            { value: '',       label: 'Varsayılan (local7)', selected: true },
                            { value: 'local0', label: 'local0' }, { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' }, { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4' }, { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' }
                        ]},
                        { name: 'sl_format', why: 'SIEM ayrıştırıcısı hangi biçimi bekliyorsa onu seç; yanlış format logların parse edilmemesine yol açar.', label: 'Format', type: 'select', options: [
                            { value: '',        label: 'Varsayılan', selected: true },
                            { value: 'cef',     label: 'CEF' },
                            { value: 'rfc5424', label: 'RFC 5424' },
                            { value: 'csv',     label: 'CSV' },
                            { value: 'json',    label: 'JSON' }
                        ]},
                        { name: 'sl_srcip', why: 'Logların hangi kaynak IP ile çıkacağı. SIEM tarafında cihaz IP ile tanınıyorsa sabitle.', label: 'Kaynak IP', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'source-ip (opsiyonel)' }
                    ]
                },
                {
                    title: 'FortiAnalyzer',
                    icon: 'fas fa-chart-bar',
                    showFor: ['faz'],
                    fields: [
                        { name: 'fz_server', why: 'FortiAnalyzer IP\'si veya FQDN\'i.', label: 'Sunucu', type: 'text', requiredIf: { field: '_cgtype', in: ['faz'] }, placeholder: '192.0.2.60', hint: 'IP veya FQDN' },
                        { name: 'fz_serial', why: 'FAZ seri numarası yazılırsa FortiGate yalnız bu cihaza bağlanır; ortadaki adam riskini azaltır.', label: 'FAZ Seri No', type: 'text', placeholder: 'FAZ-VMTM00000000', hint: 'serial (opsiyonel)' },
                        { name: 'fz_srcip', why: 'FAZ\'a bağlanırken kullanılacak kaynak IP.', label: 'Kaynak IP', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'source-ip (opsiyonel)' },
                        { name: 'fz_upload', why: '<code>realtime</code> logları anında gönderir; hat kesintisinde kayıp olmaması için diskli cihazlarda <code>store-and-upload</code> seçilebilir.', label: 'Gönderim', type: 'select', options: [
                            { value: 'realtime',         label: 'realtime', selected: true },
                            { value: '1-minute',         label: '1-minute' },
                            { value: '5-minute',         label: '5-minute (varsayılan)' },
                            { value: 'store-and-upload', label: 'store-and-upload' }
                        ]},
                        { name: 'fz_certverify', why: 'Kapatmak, FAZ kimliğinin sertifikayla doğrulanmasını devre dışı bırakır; araya giren bir cihaz logları toplayabilir.', label: 'Sertifika Doğrulama', type: 'select', options: [
                            { value: 'enable',  label: 'enable (önerilen)', selected: true },
                            { value: 'disable', label: 'disable' }
                        ]},
                        { name: 'fz_reliable', why: 'Log bağlantısını güvenilir (TCP) moda alır; kayıp log riskini azaltır.', label: 'Reliable', type: 'checkbox', checked: true, hint: 'set reliable enable' }
                    ]
                }
            ],
            submit: 'Log Ayarı Oluştur'
        }, (data) => cgFgLoggingGen(data));
    }
};
function cgFgLoggingGen(data) {
    let c = '# ========================================\n# FortiGate — Remote Logging\n# ========================================\n\n';
    if ((data._cgtype || 'syslog') === 'faz') {
        if (data.fz_certverify === 'disable') c += '# UYARI: certificate-verification disable — FAZ kimliği doğrulanmaz.\n';
        c += 'config log fortianalyzer setting\n';
        c += '    set status enable\n';
        c += '    set server "' + cgEsc(data.fz_server || '') + '"\n';
        if (data.fz_serial) c += '    set serial "' + cgEsc(data.fz_serial) + '"\n';
        c += '    set certificate-verification ' + (data.fz_certverify === 'disable' ? 'disable' : 'enable') + '\n';
        if (data.fz_srcip) c += '    set source-ip "' + cgEsc(data.fz_srcip) + '"\n';
        c += '    set upload-option ' + cgEsc(data.fz_upload || 'realtime') + '\n';
        if (data.fz_reliable) c += '    set reliable enable\n';
        c += 'end\n\n';
        c += '# Doğrulama:\n# get log fortianalyzer setting\n# execute log fortianalyzer test-connectivity\n# diagnose log test\n';
        return c;
    }
    const slot = ['syslogd', 'syslogd2', 'syslogd3', 'syslogd4'].indexOf(data.sl_slot) !== -1 ? data.sl_slot : 'syslogd';
    if ((data.sl_mode || 'udp') === 'udp') c += '# Not: UDP syslog kayıpsızlık garantisi vermez; denetim için reliable (TCP) önerilir.\n';
    c += 'config log ' + slot + ' setting\n';
    c += '    set status enable\n';
    c += '    set server "' + cgEsc(data.sl_server || '') + '"\n';
    if (data.sl_mode === 'reliable') c += '    set mode reliable\n';
    if (data.sl_port) c += '    set port ' + cgEsc(data.sl_port) + '\n';
    if (data.sl_facility) c += '    set facility ' + cgEsc(data.sl_facility) + '\n';
    if (data.sl_format) c += '    set format ' + cgEsc(data.sl_format) + '\n';
    if (data.sl_srcip) c += '    set source-ip "' + cgEsc(data.sl_srcip) + '"\n';
    c += 'end\n\n';
    c += '# Doğrulama:\n# get log ' + slot + ' setting\n# diagnose log test\n';
    return c;
}

// ── FortiGate: NTP ────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — ntpsync/type custom/config ntpserver server)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/105110478/config-system-ntp (source-ip/server-mode/interface)
FortiGate.ntp = {
    label: 'NTP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP (FortiGate)',
                desc: 'Sistem saatini NTP ile eşitler; isteğe bağlı olarak FortiGate\'i iç ağa NTP sunucusu yapar.<br><code>config system ntp\n  set ntpsync enable\n  set type custom\n  config ntpserver\n    edit 1\n      set server "192.0.2.123"\n    next\n  end\nend</code>'
            },
            configTypes: [
                { id: 'custom',     label: 'Özel Sunucular', icon: 'fas fa-server', desc: 'Kurum içi / belirli NTP sunucuları', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'fortiguard', label: 'FortiGuard',     icon: 'fas fa-cloud',  desc: 'Fortinet NTP servisi' }
            ],
            sections: [
                {
                    title: 'NTP Sunucuları',
                    icon: 'fas fa-server',
                    showFor: ['custom'],
                    fields: [
                        { name: 'ntp1', why: 'Saat yanlışsa log korelasyonu, sertifika doğrulaması ve FortiToken kodları bozulur.', label: 'NTP Sunucu 1', type: 'text', requiredIf: { field: '_cgtype', in: ['custom'] }, placeholder: '192.0.2.123', hint: 'IP veya FQDN' },
                        { name: 'ntp2', why: 'İkinci sunucu tek kaynağa bağımlılığı kaldırır.', label: 'NTP Sunucu 2', type: 'text', placeholder: '192.0.2.124', hint: 'Opsiyonel' },
                        { name: 'ntp3', why: 'Üç kaynak, bir sunucunun sapmasını çoğunlukla ayırt etmeyi sağlar.', label: 'NTP Sunucu 3', type: 'text', placeholder: '', hint: 'Opsiyonel' },
                        { name: 'ntp_srcip', why: 'NTP isteklerinin kaynak IP\'si; sunucu tarafında ACL varsa sabitlenmeli.', label: 'Kaynak IP', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'source-ip (opsiyonel)' }
                    ]
                },
                {
                    title: 'NTP Sunucu Modu',
                    icon: 'fas fa-broadcast-tower',
                    fields: [
                        { name: 'ntp_srvmode', why: 'Açıkken FortiGate, seçilen arayüzlerdeki istemcilere NTP hizmeti verir. Yalnız iç arayüzlerde açın; WAN\'da açmak cihazı NTP yansıtma saldırılarına açar.', label: 'FortiGate NTP sunucusu olsun', type: 'checkbox', checked: false, hint: 'set server-mode enable' },
                        { name: 'ntp_srvif', why: 'NTP hizmetinin verileceği arayüzler.', label: 'Hizmet Arayüzleri', type: 'text', requiredIf: { field: 'ntp_srvmode', checked: true }, validate: 'iface_range', placeholder: 'port2', hint: 'Boşluk veya virgülle' }
                    ]
                }
            ],
            submit: 'NTP Oluştur'
        }, (data) => cgFgNtpGen(data));
    }
};
function cgFgNtpGen(data) {
    const ty = data._cgtype === 'fortiguard' ? 'fortiguard' : 'custom';
    let c = '# ========================================\n# FortiGate — NTP\n# ========================================\n\n';
    c += 'config system ntp\n    set ntpsync enable\n    set type ' + ty + '\n';
    if (ty === 'custom') {
        const srv = [data.ntp1, data.ntp2, data.ntp3].map(x => String(x || '').trim()).filter(Boolean);
        c += '    config ntpserver\n';
        srv.forEach((s, i) => { c += '        edit ' + (i + 1) + '\n            set server "' + cgEsc(s) + '"\n        next\n'; });
        c += '    end\n';
        if (data.ntp_srcip) c += '    set source-ip ' + cgEsc(data.ntp_srcip) + '\n';
    }
    const ifs = cgFgIfList(data.ntp_srvif);
    if (data.ntp_srvmode && ifs) c += '    set server-mode enable\n    set interface ' + ifs + '\n';
    c += 'end\n\n';
    if (data.ntp_srvmode && !ifs) c += '# UYARI: sunucu modu için arayüz girilmedi — server-mode yazılmadı.\n\n';
    c += '# Doğrulama:\n# show system ntp\n# diagnose sys ntp status\n';
    return c;
}

// ── FortiGate: DNS ────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — primary/secondary/domain)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/190194324/config-system-dns (protocol/server-hostname/source-ip)
FortiGate.dns = {
    label: 'DNS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'Sistem DNS (FortiGate)',
                desc: 'FortiGate\'in kendi DNS çözümlemesi (FortiGuard, FQDN adres nesneleri, güncellemeler bunu kullanır).<br><code>config system dns\n  set primary 192.0.2.53\n  set secondary 192.0.2.54\nend</code>'
            },
            sections: [
                {
                    title: 'DNS Sunucuları',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'dns1', why: 'DNS çözülemezse FQDN adres nesneleri boş kalır, FortiGuard web filtreleme ve imza güncellemeleri durur.', label: 'Birincil DNS', type: 'text', required: true, validate: 'ip', placeholder: '192.0.2.53', hint: 'primary' },
                        { name: 'dns2', why: 'Tek DNS sunucusu tek hata noktasıdır.', label: 'İkincil DNS', type: 'text', validate: 'ip', placeholder: '192.0.2.54', hint: 'secondary (opsiyonel)' },
                        { name: 'dns_domain', why: 'Kısa adların tamamlanacağı yerel alan adı.', label: 'Yerel Alan Adı', type: 'text', placeholder: 'corp.example.com', hint: 'domain (opsiyonel)' },
                        { name: 'dns_srcip', why: 'DNS sorgularının kaynak IP\'si; iç DNS sunucusunda ACL varsa sabitle.', label: 'Kaynak IP', type: 'text', validate: 'ip', placeholder: '10.0.0.1', hint: 'source-ip (opsiyonel)' },
                        { name: 'dns_proto', why: 'DoT/DoH sorguları şifreler ve yolda değiştirilmesini önler; sunucunun bu protokolleri desteklemesi ve sertifika adının (server-hostname) doğru olması gerekir.', label: 'Protokol', type: 'select', options: [
                            { value: 'cleartext', label: 'cleartext (UDP/TCP 53, varsayılan)', selected: true },
                            { value: 'dot',       label: 'DoT (TLS/853)' },
                            { value: 'doh',       label: 'DoH (HTTPS/443)' }
                        ]},
                        { name: 'dns_host', why: 'DoT/DoH sunucusunun sertifikasındaki ad. Yanlışsa TLS doğrulaması başarısız olur ve çözümleme durur.', label: 'Sunucu Adı (DoT/DoH)', type: 'text', requiredIf: { field: 'dns_proto', in: ['dot', 'doh'] }, placeholder: 'dns.example.com', hint: 'server-hostname' }
                    ]
                }
            ],
            submit: 'DNS Oluştur'
        }, (data) => cgFgDnsGen(data));
    }
};
function cgFgDnsGen(data) {
    const proto = ['dot', 'doh'].indexOf(data.dns_proto) !== -1 ? data.dns_proto : 'cleartext';
    let c = '# ========================================\n# FortiGate — System DNS\n# ========================================\n\n';
    c += 'config system dns\n';
    c += '    set primary ' + cgEsc(data.dns1 || '') + '\n';
    if (data.dns2) c += '    set secondary ' + cgEsc(data.dns2) + '\n';
    if (proto !== 'cleartext') {
        c += '    set protocol ' + proto + '\n';
        if (data.dns_host) c += '    set server-hostname "' + cgEsc(data.dns_host) + '"\n';
    }
    if (data.dns_domain) c += '    set domain "' + cgEsc(data.dns_domain) + '"\n';
    if (data.dns_srcip) c += '    set source-ip ' + cgEsc(data.dns_srcip) + '\n';
    c += 'end\n\n';
    c += '# Doğrulama:\n# show system dns\n# diagnose test application dnsproxy 3\n';
    return c;
}

// ── FortiGate: Admin + Access Profile (sertleştirme) ──────────────────────────
// Sözdizimi: canlı config (5 cihaz — admin accprofile/vdom/trusthost1-3; accprofile *grp read|read-write;
//            global admintimeout/admin-lockout-threshold/admin-lockout-duration/admin-https-ssl-versions/pre-login-banner)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/390485493/config-system-admin (password/two-factor/fortitoken/email-to/force-password-change)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/309990135/config-system-accprofile
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/339914554/config-system-global (admin-telnet)
const CG_FG_ACCGRP = ['secfabgrp', 'ftviewgrp', 'authgrp', 'sysgrp', 'netgrp', 'loggrp', 'fwgrp', 'vpngrp', 'utmgrp', 'wanoptgrp', 'wifi'];
FortiGate.admin = {
    label: 'Admin & Access Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'Yönetici Hesabı & Erişim Profili (FortiGate)',
                desc: 'Trusted host kısıtlı yönetici hesabı, isteğe bağlı rol profili, 2FA ve yönetim düzlemi sertleştirmesi.<br><code>config system admin\n  edit "netops1"\n    set accprofile "RO_PROFILE"\n    set vdom "root"\n    set trusthost1 10.0.0.0 255.255.255.0\n  next\nend</code>'
            },
            configTypes: [
                { id: 'existing', label: 'Mevcut Profil', icon: 'fas fa-id-badge', desc: 'super_admin, prof_admin veya tanımlı bir profil', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'newprof',  label: 'Yeni Profil',   icon: 'fas fa-user-cog', desc: 'Salt-okur veya ağ operatörü profili de üret' }
            ],
            sections: [
                {
                    title: 'Erişim Profili',
                    icon: 'fas fa-id-badge',
                    fields: [
                        { name: 'ad_prof', why: 'Profil, yöneticinin hangi menüleri okuyup yazabileceğini belirler. Herkese <code>super_admin</code> vermek en az yetki ilkesini bozar ve hesap ele geçtiğinde tüm cihazı açar.', label: 'Profil Adı', type: 'text', required: true, placeholder: 'RO_PROFILE', hint: 'accprofile' }
                    ]
                },
                {
                    title: 'Profil Şablonu',
                    icon: 'fas fa-user-cog',
                    showFor: ['newprof'],
                    fields: [
                        { name: 'ad_preset', why: '<b>Salt-okur</b>: tüm bölümler read. <b>Ağ operatörü</b>: ağ, firewall ve VPN read-write; sistem ve diğerleri read. Sistem ayarlarına yazma yetkisi yalnız gerçekten gerekenlere verilmeli.', label: 'Profil Şablonu', type: 'select', options: [
                            { value: 'ro',    label: 'Salt-okur (tüm bölümler read)', selected: true },
                            { value: 'netop', label: 'Ağ operatörü (net/fw/vpn read-write)' }
                        ]}
                    ]
                },
                {
                    title: 'Yönetici',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'ad_user', why: 'Kişiye özel hesap aç; paylaşılan <code>admin</code> hesabı denetim izini yok eder.', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netops1', hint: 'Yönetici adı' },
                        { name: 'ad_pass', why: 'Parola config\'e düz metin girilir, cihaz kaydederken şifreler. <code>system password-policy</code> tanımlıysa kurallara uymayan parola reddedilir.', label: 'Parola', type: 'text', required: true, placeholder: 'Degistir-Beni-2026!', hint: 'Güçlü, benzersiz parola' },
                        { name: 'ad_vdom', why: 'VDOM kapalı cihazlarda da yönetici <code>root</code> VDOM\'a atanır.', label: 'VDOM', type: 'text', required: true, placeholder: 'root', hint: 'Genelde root' },
                        { name: 'ad_th1', why: 'Trusted host, yöneticinin yalnız bu ağlardan giriş yapmasını sağlar; başka kaynaktan doğru parolayla bile giriş reddedilir. Hiç trusted host tanımlamamak her yerden girişe izin verir.', label: 'Trusted Host 1', type: 'text', validate: 'ip_mask', placeholder: '10.0.0.0 255.255.255.0', hint: 'IP MASK (önerilir)' },
                        { name: 'ad_th2', why: 'İkinci yönetim ağı (ör. VPN havuzu).', label: 'Trusted Host 2', type: 'text', validate: 'ip_mask', placeholder: '', hint: 'IP MASK (opsiyonel)' },
                        { name: 'ad_th3', why: 'Üçüncü yönetim ağı (ör. jump sunucusu /32).', label: 'Trusted Host 3', type: 'text', validate: 'ip_mask', placeholder: '', hint: 'IP MASK (opsiyonel)' },
                        { name: 'ad_forcechg', why: 'Hesabı başkası için açıyorsan, ilk girişte parola değişimini zorlamak parolanın yalnız sahibince bilinmesini sağlar.', label: 'İlk girişte parola değiştirt', type: 'checkbox', checked: false, hint: 'set force-password-change enable' }
                    ]
                },
                {
                    title: 'İki Faktörlü Doğrulama',
                    icon: 'fas fa-mobile-alt',
                    fields: [
                        { name: 'ad_2fa', why: 'Parola sızsa bile ikinci faktör olmadan giriş yapılamaz. FortiToken seri numarası önce <code>config user fortitoken</code> altına kayıtlı olmalı; e-posta 2FA için <code>system email-server</code> çalışmalı.', label: '2FA Yöntemi', type: 'select', options: [
                            { value: 'disable',    label: 'Kapalı', selected: true },
                            { value: 'fortitoken', label: 'FortiToken' },
                            { value: 'email',      label: 'E-posta' }
                        ]},
                        { name: 'ad_token', why: 'Yöneticiye atanacak FortiToken (Mobile) seri numarası.', label: 'FortiToken Seri No', type: 'text', requiredIf: { field: 'ad_2fa', in: ['fortitoken'] }, placeholder: 'FTKMOB0000000000', hint: 'fortitoken' },
                        { name: 'ad_email', why: 'Tek kullanımlık kodun gönderileceği adres.', label: 'E-posta', type: 'text', requiredIf: { field: 'ad_2fa', in: ['email'] }, placeholder: 'netops@example.com', hint: 'email-to' }
                    ]
                },
                {
                    title: 'Yönetim Düzlemi Sertleştirme (system global)',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'gl_enable', why: 'Tüm yöneticileri etkileyen global ayarlar: oturum zaman aşımı, hatalı girişte kilitleme, yalnız TLS 1.2/1.3, telnet kapalı ve giriş öncesi uyarı metni.', label: 'Global sertleştirme ayarlarını ekle', type: 'checkbox', checked: true, hint: 'config system global' },
                        { name: 'gl_timeout', why: 'Boşta kalan yönetici oturumu bu kadar dakika sonra kapanır (varsayılan 5). Uzun süre açık kalan oturum, kilitlenmemiş bir ekranda cihazı açık bırakır.', label: 'Oturum Zaman Aşımı (dk)', type: 'text', min: 1, max: 480, requiredIf: { field: 'gl_enable', checked: true }, placeholder: '10', hint: '1–480' },
                        { name: 'gl_lockthr', why: 'Bu kadar hatalı denemeden sonra hesap kilitlenir (1–10, varsayılan 3). Kaba kuvvet denemelerini yavaşlatır.', label: 'Kilitleme Eşiği', type: 'text', min: 1, max: 10, requiredIf: { field: 'gl_enable', checked: true }, placeholder: '3', hint: '1–10 deneme' },
                        { name: 'gl_lockdur', why: 'Kilit süresi (saniye, varsayılan 60). Çok kısa süre kaba kuvveti durdurmaz.', label: 'Kilit Süresi (sn)', type: 'text', validate: 'posint', requiredIf: { field: 'gl_enable', checked: true }, placeholder: '300', hint: 'saniye' },
                        { name: 'gl_banner', why: 'Giriş sayfasında yasal uyarı metni gösterir; birçok denetim standardı ister.', label: 'Giriş öncesi uyarı (pre-login-banner)', type: 'checkbox', checked: true, hint: 'set pre-login-banner enable' }
                    ]
                }
            ],
            submit: 'Yönetici Oluştur'
        }, (data) => cgFgAdminGen(data));
    }
};
function cgFgAdminGen(data) {
    const prof = cgEsc(data.ad_prof || ''), user = cgEsc(data.ad_user || '');
    const th = [data.ad_th1, data.ad_th2, data.ad_th3].map(x => String(x || '').trim().replace(/\s+/g, ' ')).filter(Boolean);
    let c = '# ========================================\n# FortiGate — Admin & Access Profile\n# ========================================\n\n';
    const w = [];
    if (/[?\s]/.test(data.ad_pass || '')) w.push('⚠ Parolada boşluk veya "?" var: FortiOS CLI\'de "?" yardım menüsünü açar, boşluk parolayı böler.');
    if (!th.length) w.push('⚠ Trusted host tanımlanmadı: bu yönetici her kaynaktan giriş yapabilir.');
    else if (th.some(t => { const n = _fgWNet(t); return n && n.len === 0; })) w.push('⚠ Trusted host 0.0.0.0 0.0.0.0: her kaynaktan girişe izin verir, kısıtlama yok hükmündedir.');
    if (th.some(t => _fgWHostBits(_fgWNet(t)))) w.push('⚠ Trusted host\'ta host bitleri dolu (ör. 10.64.10.5 255.255.255.0): tek makine için /32 (255.255.255.255), ağ için ağ adresini yazın.');
    if ((data.ad_2fa || 'disable') === 'disable') w.push('ℹ 2FA kapalı. Yönetici hesapları için FortiToken önerilir.');
    if (/^super_admin$/i.test(data.ad_prof || '')) w.push('⚠ super_admin profili tam yetki verir: en az yetki ilkesine göre daha dar bir profil seçin.');
    w.push('ℹ Trusted host yalnız bu hesabı kısıtlar; arayüzde allowaccess https/ssh açıksa diğer hesaplar için de trusted host tanımlayın (fgt-01).');
    if ((data._cgtype || 'existing') === 'newprof') {
        const rw = data.ad_preset === 'netop' ? ['netgrp', 'fwgrp', 'vpngrp'] : [];
        c += 'config system accprofile\n    edit "' + prof + '"\n';
        CG_FG_ACCGRP.forEach(g => { c += '        set ' + g + ' ' + (rw.indexOf(g) !== -1 ? 'read-write' : 'read') + '\n'; });
        c += '    next\nend\n\n';
    }
    c += 'config system admin\n    edit "' + user + '"\n';
    c += '        set accprofile "' + prof + '"\n';
    c += '        set vdom "' + cgEsc(data.ad_vdom || '') + '"\n';
    c += '        set password ' + cgEsc(data.ad_pass || '') + '\n';
    th.forEach((t, i) => { c += '        set trusthost' + (i + 1) + ' ' + cgEsc(t) + '\n'; });
    if (data.ad_2fa === 'fortitoken') {
        c += '        set two-factor fortitoken\n        set fortitoken "' + cgEsc(data.ad_token || '') + '"\n';
    } else if (data.ad_2fa === 'email') {
        c += '        set two-factor email\n        set email-to "' + cgEsc(data.ad_email || '') + '"\n';
    }
    if (data.ad_forcechg) c += '        set force-password-change enable\n';
    c += '    next\nend\n\n';
    if (data.gl_enable) {
        c += 'config system global\n';
        if (data.gl_timeout) c += '    set admintimeout ' + cgEsc(data.gl_timeout) + '\n';
        if (data.gl_lockthr) c += '    set admin-lockout-threshold ' + cgEsc(data.gl_lockthr) + '\n';
        if (data.gl_lockdur) c += '    set admin-lockout-duration ' + cgEsc(data.gl_lockdur) + '\n';
        c += '    set admin-https-ssl-versions tlsv1-2 tlsv1-3\n';
        c += '    set admin-telnet disable\n';
        if (data.gl_banner) c += '    set pre-login-banner enable\n';
        c += 'end\n\n';
    }
    c += '# Doğrulama:\n# show system admin "' + user + '"\n# show system accprofile "' + prof + '"\n# get system global\n';
    return { config: c, warnings: w };
}

// ── FortiGate: Local User + User Group ────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — user local type password|radius|ldap/passwd/radius-server/ldap-server/two-factor fortitoken/fortitoken/email-to/status;
//            user group member)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/109120963/config-user-local
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/328136827/config-user-group
FortiGate.user = {
    label: 'Local User & Group',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-users',
                title: 'Yerel Kullanıcı & Kullanıcı Grubu (FortiGate)',
                desc: 'SSL-VPN, IPsec dial-up ve kimlik tabanlı policy\'ler için kullanıcı ve grup.<br><code>config user local\n  edit "ayse"\n    set type password\n    set passwd ...\n  next\nend\nconfig user group\n  edit "VPN_USERS"\n    set member "ayse"\n  next\nend</code>'
            },
            configTypes: [
                { id: 'password', label: 'Yerel Parola', icon: 'fas fa-key',       desc: 'Parola FortiGate üzerinde', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'radius',   label: 'RADIUS',       icon: 'fas fa-server',    desc: 'Parola RADIUS sunucusunda' },
                { id: 'ldap',     label: 'LDAP',         icon: 'fas fa-sitemap',   desc: 'Parola LDAP/AD üzerinde' }
            ],
            sections: [
                {
                    title: 'Kullanıcı',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'us_name', why: 'Kullanıcı adı, RADIUS/LDAP türünde sunucudaki hesap adıyla aynı olmalı.', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'user1', hint: 'user local adı' },
                        { name: 'us_pass', why: 'Yerel parola cihazda şifrelenerek saklanır. <code>user password-policy</code> ile süre/uzunluk kuralı bağlanabilir.', label: 'Parola', type: 'text', requiredIf: { field: '_cgtype', in: ['password'] }, placeholder: 'Degistir-Beni-2026!', hint: 'passwd' },
                        { name: 'us_server', why: 'Kimlik doğrulamanın yapılacağı sunucunun FortiGate\'teki adı (<code>config user radius</code> / <code>config user ldap</code>). Önceden tanımlı olmalı.', label: 'Sunucu Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['radius', 'ldap'] }, placeholder: 'AUTH_SRV', hint: 'radius-server / ldap-server' },
                        { name: 'us_disabled', why: 'Hesabı pasif oluşturur (ör. işe başlama tarihinden önce).', label: 'Devre dışı oluştur', type: 'checkbox', checked: false, hint: 'set status disable' }
                    ]
                },
                {
                    title: 'İki Faktörlü Doğrulama',
                    icon: 'fas fa-mobile-alt',
                    fields: [
                        { name: 'us_2fa', why: 'Uzaktan erişim (SSL-VPN) kullanıcıları için 2FA, çalınan parolayla girişi engelleyen en etkili kontroldür. FortiToken önce <code>config user fortitoken</code> altına kayıtlı olmalı.', label: '2FA Yöntemi', type: 'select', options: [
                            { value: 'disable',    label: 'Kapalı', selected: true },
                            { value: 'fortitoken', label: 'FortiToken' },
                            { value: 'email',      label: 'E-posta' }
                        ]},
                        { name: 'us_token', why: 'Kullanıcıya atanacak FortiToken (Mobile) seri numarası.', label: 'FortiToken Seri No', type: 'text', requiredIf: { field: 'us_2fa', in: ['fortitoken'] }, placeholder: 'FTKMOB0000000000', hint: 'fortitoken' },
                        { name: 'us_email', why: 'FortiToken Mobile aktivasyonu veya e-posta kodu bu adrese gider.', label: 'E-posta', type: 'text', requiredIf: { field: 'us_2fa', in: ['email'] }, placeholder: 'user1@example.com', hint: 'email-to' }
                    ]
                },
                {
                    title: 'Kullanıcı Grubu',
                    icon: 'fas fa-users',
                    fields: [
                        { name: 'ug_name', why: 'Policy ve SSL-VPN kuralları kullanıcıya değil gruba bağlanmalı; kullanıcı eklemek/çıkarmak kuralı değiştirmeden yapılır.', label: 'Grup Adı', type: 'text', placeholder: 'VPN_USERS', hint: 'Boşsa grup üretilmez' },
                        { name: 'ug_extra', why: 'Gruba eklenecek diğer mevcut kullanıcılar (yukarıdaki kullanıcı otomatik eklenir).', label: 'Ek Üyeler', type: 'text', placeholder: 'user2, user3', hint: 'Virgülle ayrılmış' }
                    ]
                }
            ],
            submit: 'Kullanıcı Oluştur'
        }, (data) => cgFgUserGen(data));
    }
};
function cgFgUserGen(data) {
    const ty = ['radius', 'ldap'].indexOf(data._cgtype) !== -1 ? data._cgtype : 'password';
    const name = cgEsc(data.us_name || '');
    let c = '# ========================================\n# FortiGate — Local User & Group\n# ========================================\n\n';
    if (ty === 'password' && /[?\s]/.test(data.us_pass || '')) c += '# UYARI: parolada boşluk veya "?" var — FortiOS CLI\'de "?" yardım menüsünü açar, boşluk parolayı böler.\n';
    c += 'config user local\n    edit "' + name + '"\n';
    c += '        set type ' + ty + '\n';
    if (ty === 'password') c += '        set passwd ' + cgEsc(data.us_pass || '') + '\n';
    else c += '        set ' + ty + '-server "' + cgEsc(data.us_server || '') + '"\n';
    if (data.us_2fa === 'fortitoken') {
        c += '        set two-factor fortitoken\n        set fortitoken "' + cgEsc(data.us_token || '') + '"\n';
        if (data.us_email) c += '        set email-to "' + cgEsc(data.us_email) + '"\n';
    } else if (data.us_2fa === 'email') {
        c += '        set two-factor email\n        set email-to "' + cgEsc(data.us_email || '') + '"\n';
    }
    if (data.us_disabled) c += '        set status disable\n';
    c += '    next\nend\n\n';
    const g = String(data.ug_name || '').trim();
    if (g) {
        const extra = cgFgQList(data.ug_extra);
        c += 'config user group\n    edit "' + cgEsc(g) + '"\n';
        c += '        set member "' + name + '"' + (extra ? ' ' + extra : '') + '\n';
        c += '    next\nend\n\n';
    }
    c += '# Doğrulama:\n# show user local "' + name + '"\n' + (g ? '# show user group "' + cgEsc(g) + '"\n' : '') + '# diagnose firewall auth list\n';
    return c;
}

// ── FortiGate: DoS Policy ─────────────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — name/interface/srcaddr/dstaddr/service/comments;
//            config anomaly > edit "tcp_syn_flood" … status/log/action/threshold)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/561707922/config-firewall-dos-policy
const CG_FG_DOS = [
    { id: 'tcp_syn_flood', f: 'dos_syn',  ph: '2000', lbl: 'tcp_syn_flood (yeni SYN/sn)' },
    { id: 'tcp_port_scan', f: 'dos_scan', ph: '1000', lbl: 'tcp_port_scan (SYN/sn, tek kaynak)' },
    { id: 'udp_flood',     f: 'dos_udp',  ph: '2000', lbl: 'udp_flood (paket/sn)' },
    { id: 'icmp_flood',    f: 'dos_icmp', ph: '250',  lbl: 'icmp_flood (paket/sn)' }
];
FortiGate.dos = {
    label: 'DoS Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bolt',
                title: 'DoS Policy (FortiGate)',
                desc: 'Giriş arayüzünde, firewall policy\'lerinden ÖNCE uygulanan anomali (flood / scan) koruması.<br><code>config firewall DoS-policy\n  edit 1\n    set interface "port1"\n    config anomaly\n      edit "tcp_syn_flood"\n        set status enable\n        set log enable\n        set action block\n      next\n    end\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Kapsam',
                    icon: 'fas fa-crosshairs',
                    fields: [
                        { name: 'dos_id', why: 'DoS policy\'ler ID sırasıyla eşleşir; var olan ID\'nin üzerine yazar.', label: 'Policy ID', type: 'text', required: true, validate: 'posint', placeholder: '1', hint: 'edit numarası' },
                        { name: 'dos_name', why: 'Policy\'yi listede tanımayı sağlar.', label: 'Ad', type: 'text', placeholder: 'WAN_DOS', hint: 'name (opsiyonel)' },
                        { name: 'dos_if', why: 'DoS koruması trafiğin <b>girdiği</b> arayüzde uygulanır; genelde internete bakan WAN arayüzü.', label: 'Giriş Arayüzü', type: 'text', required: true, validate: 'iface', placeholder: 'port1', hint: 'interface' },
                        { name: 'dos_src', why: 'Korunacak trafiğin kaynağı; internet için <code>all</code>.', label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'all', hint: 'Adres nesnesi (virgülle çoklu)' },
                        { name: 'dos_dst', why: 'Korunan hedef (ör. yayınlanan sunucular / VIP\'ler).', label: 'Hedef Adres', type: 'text', required: true, placeholder: 'all', hint: 'Adres nesnesi (virgülle çoklu)' },
                        { name: 'dos_svc', why: 'Kapsanan servisler; tüm anomali tipleri için <code>ALL</code>.', label: 'Servis', type: 'text', required: true, placeholder: 'ALL', hint: 'Servis nesnesi (virgülle çoklu)' },
                        { name: 'dos_comment', why: 'Eşik değerlerinin hangi ölçüme dayandığını yazmak ileride ayar yaparken işe yarar.', label: 'Açıklama', type: 'text', placeholder: 'Baseline 2 hafta izlendi', hint: 'comments' }
                    ]
                },
                {
                    title: 'Anomaliler',
                    icon: 'fas fa-bolt',
                    info: 'Eşik boş bırakılırsa cihaz varsayılanı kullanılır. Fortinet önerisi: önce <b>pass</b> (yalnız log) ile normal trafiği ölçün, eşikleri ayarlayın, sonra <b>block</b>\'a geçin.',
                    fields: [
                        { name: 'dos_action', why: '<code>block</code> eşik aşıldığında trafiği keser; eşik düşük seçilirse meşru yoğun trafik (ör. kampanya günü) de kesilir. <code>pass</code> yalnız loglar.', label: 'Aksiyon (seçili anomaliler)', type: 'select', options: [
                            { value: 'pass',  label: 'pass — yalnız log (izleme)', selected: true },
                            { value: 'block', label: 'block — engelle' }
                        ]}
                    ].concat(CG_FG_DOS.map(a => ({ name: a.f, why: 'Eşik saniye başına değerdir. Normal tepe trafiğin üzerinde bir değer seçin; ölçmeden verilen düşük eşik kesintiye yol açar.', label: a.lbl, type: 'text', validate: 'posint', placeholder: a.ph, hint: 'Boş = cihaz varsayılanı' })))
                }
            ],
            submit: 'DoS Policy Oluştur'
        }, (data) => cgFgDosGen(data));
    }
};
function cgFgDosGen(data) {
    const id = cgEsc(data.dos_id || '');
    const act = data.dos_action === 'block' ? 'block' : 'pass';
    let c = '# ========================================\n# FortiGate — DoS Policy\n# ========================================\n\n';
    if (act === 'pass') c += '# Not: aksiyon pass — anomaliler yalnız loglanır, engellenmez (izleme modu).\n';
    c += 'config firewall DoS-policy\n    edit ' + id + '\n';
    if (data.dos_name) c += '        set name "' + cgEsc(data.dos_name) + '"\n';
    if (data.dos_comment) c += '        set comments "' + cgEsc(data.dos_comment) + '"\n';
    c += '        set interface "' + cgEsc(data.dos_if || '') + '"\n';
    c += '        set srcaddr ' + cgFgQList(data.dos_src) + '\n';
    c += '        set dstaddr ' + cgFgQList(data.dos_dst) + '\n';
    c += '        set service ' + cgFgQList(data.dos_svc) + '\n';
    c += '        config anomaly\n';
    CG_FG_DOS.forEach(a => {
        c += '            edit "' + a.id + '"\n';
        c += '                set status enable\n';
        c += '                set log enable\n';
        c += '                set action ' + act + '\n';
        if (data[a.f]) c += '                set threshold ' + cgEsc(data[a.f]) + '\n';
        c += '            next\n';
    });
    c += '        end\n    next\nend\n\n';
    c += '# Doğrulama:\n# show firewall DoS-policy ' + id + '\n';
    return c;
}

// ── FortiGate: Local-in Policy ────────────────────────────────────────────────
// Sözdizimi: https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/185227842/config-firewall-local-in-policy
//            (canlı config'lerde bu blok yok — yalnız resmi CLI Reference'tan)
FortiGate.localin = {
    label: 'Local-in Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-door-closed',
                title: 'Local-in Policy (FortiGate)',
                desc: 'FortiGate\'in <b>kendisine</b> gelen trafiği (yönetim, SNMP, BGP, IKE…) kısıtlar; geçen trafiği etkilemez.<br><code>config firewall local-in-policy\n  edit 1\n    set intf "port1"\n    set srcaddr "MGMT_NET"\n    set dstaddr "all"\n    set action accept\n    set service "SSH" "HTTPS"\n    set schedule "always"\n  next\nend</code>'
            },
            configTypes: [
                { id: 'restrict', label: 'İzinli Kaynak + Geri Kalanı Reddet', icon: 'fas fa-user-check', desc: 'Yönetimi yalnız belirli ağlara aç', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'deny',     label: 'Yalnız Reddet',                     icon: 'fas fa-ban',        desc: 'Belirli kaynak/servisi kapat' }
            ],
            sections: [
                {
                    title: 'Kapsam',
                    icon: 'fas fa-crosshairs',
                    warn: 'Yanlış kural sizi cihazdan kilitleyebilir. Önce izinli kaynağın doğru olduğunu doğrulayın; konsol erişiminiz olmadan WAN yönetim servislerini kapatmayın.',
                    fields: [
                        { name: 'li_id', why: 'Local-in policy\'ler ID sırasıyla değerlendirilir: izin kuralı, reddetme kuralından ÖNCE (daha küçük ID) olmalı.', label: 'Policy ID', type: 'text', required: true, validate: 'posint', placeholder: '1', hint: 'İlk kuralın edit numarası' },
                        { name: 'li_if', why: 'Kuralın uygulanacağı gelen arayüz (genelde WAN).', label: 'Arayüz', type: 'text', required: true, validate: 'iface_range', placeholder: 'port1', hint: 'intf (boşluk/virgülle çoklu)' },
                        { name: 'li_dst', why: 'FortiGate üzerindeki hedef adres; arayüz IP\'sini temsil eden nesne veya <code>all</code>.', label: 'Hedef Adres', type: 'text', required: true, placeholder: 'all', hint: 'Adres nesnesi (virgülle çoklu)' },
                        { name: 'li_svc', why: 'Kısıtlanacak servisler. Yalnız yönetim servislerini (SSH, HTTPS, SNMP) seçin; <code>ALL</code> seçerseniz IPsec (IKE), BGP gibi kontrol trafiği de etkilenir.', label: 'Servis', type: 'text', required: true, placeholder: 'SSH, HTTPS', hint: 'Servis nesnesi (virgülle çoklu)' },
                        { name: 'li_comment', why: 'Kuralın amacı; local-in kuralları GUI\'de az görünür olduğu için açıklama önemlidir.', label: 'Açıklama', type: 'text', placeholder: 'Yönetim erişim kısıtı', hint: 'comments' }
                    ]
                },
                {
                    title: 'İzinli Kaynak',
                    icon: 'fas fa-user-check',
                    showFor: ['restrict'],
                    fields: [
                        { name: 'li_src', why: 'Yönetime izin verilen kaynak ağ(lar)ın adres nesnesi. <code>all</code> yazmak kısıtı anlamsız kılar.', label: 'İzinli Kaynak Adres', type: 'text', requiredIf: { field: '_cgtype', in: ['restrict'] }, placeholder: 'MGMT_NET', hint: 'Adres nesnesi/grubu' },
                        { name: 'li_denyid', why: 'Geri kalan kaynakları reddeden ikinci kuralın ID\'si; izin kuralından büyük olmalı.', label: 'Reddet Kuralı ID', type: 'text', validate: 'posint', requiredIf: { field: '_cgtype', in: ['restrict'] }, placeholder: '2', hint: 'edit numarası' }
                    ]
                },
                {
                    title: 'Reddedilecek Kaynak',
                    icon: 'fas fa-ban',
                    showFor: ['deny'],
                    fields: [
                        { name: 'li_denysrc', why: 'Reddedilecek kaynak; tüm kaynaklar için <code>all</code>.', label: 'Kaynak Adres', type: 'text', requiredIf: { field: '_cgtype', in: ['deny'] }, placeholder: 'all', hint: 'Adres nesnesi (virgülle çoklu)' }
                    ]
                }
            ],
            submit: 'Local-in Policy Oluştur'
        }, (data) => cgFgLocalinGen(data));
    }
};
function cgFgLocalinGen(data) {
    const ty = data._cgtype === 'deny' ? 'deny' : 'restrict';
    const id = String(data.li_id || '').trim(), did = String(data.li_denyid || '').trim();
    const intf = cgFgIfList(data.li_if), dst = cgFgQList(data.li_dst), svc = cgFgQList(data.li_svc);
    const cm = data.li_comment ? '        set comments "' + cgEsc(data.li_comment) + '"\n' : '';
    const rule = (rid, src, action) => '    edit ' + cgEsc(rid) + '\n        set intf ' + intf + '\n        set srcaddr ' + src + '\n        set dstaddr ' + dst +
        '\n        set action ' + action + '\n        set service ' + svc + '\n        set schedule "always"\n' + cm + '    next\n';
    let c = '# ========================================\n# FortiGate — Local-in Policy\n# ========================================\n\n';
    if (ty === 'restrict') {
        if (/^all$/i.test(String(data.li_src || '').trim())) c += '# UYARI: izinli kaynak "all" — kısıt etkisiz.\n';
        if (did && id && +did <= +id) c += '# UYARI: reddet kuralı ID\'si izin kuralından büyük olmalı; aksi halde izinli kaynak da reddedilir.\n';
        c += 'config firewall local-in-policy\n';
        c += rule(id, cgFgQList(data.li_src), 'accept');
        c += rule(did, '"all"', 'deny');
        c += 'end\n\n';
    } else {
        c += 'config firewall local-in-policy\n' + rule(id, cgFgQList(data.li_denysrc), 'deny') + 'end\n\n';
    }
    c += '# Doğrulama:\n# show firewall local-in-policy\n';
    return c;
}

// ── FortiGate: Automation Stitch ──────────────────────────────────────────────
// Sözdizimi: canlı config (5 cihaz — automation-trigger event-type/logid/license-type; automation-action action-type email/email-to/email-subject;
//            automation-stitch trigger/description/config actions > action)
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/878454488/config-system-automation-stitch
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/160942731/config-system-automation-trigger
//            + https://docs.fortinet.com/document/fortigate/7.4.8/cli-reference/332365236/config-system-automation-action
//            + https://docs.fortinet.com/document/fortigate/7.4.0/administration-guide/921599/diagnosing-automation-stitches (diagnose automation test)
FortiGate.automation = {
    label: 'Automation Stitch (E-posta Uyarısı)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-robot',
                title: 'Automation Stitch (FortiGate)',
                desc: 'Olay tetikleyici (config değişikliği, HA failover, yeniden başlama…) → e-posta aksiyonu. EEM\'in FortiOS karşılığı.<br><code>config system automation-stitch\n  edit "CFG_CHANGE_MAIL"\n    set trigger "CFG_CHANGE"\n    config actions\n      edit 1\n        set action "MAIL_NOC"\n      next\n    end\n  next\nend</code>'
            },
            sections: [
                {
                    title: 'Tetikleyici',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'at_trig', why: 'Tetikleyici nesnesinin adı; birden çok stitch aynı tetikleyiciyi kullanabilir.', label: 'Tetikleyici Adı', type: 'text', required: true, placeholder: 'CFG_CHANGE', hint: 'automation-trigger adı' },
                        { name: 'at_event', why: 'Hangi olayda çalışacağı. <code>config-change</code> yetkisiz değişikliği fark etmenin en ucuz yoludur; <code>event-log</code> belirli bir log ID\'sine bağlanır.', label: 'Olay', type: 'select', options: [
                            { value: 'config-change',       label: 'config-change (yapılandırma değişti)', selected: true },
                            { value: 'ha-failover',         label: 'ha-failover' },
                            { value: 'reboot',              label: 'reboot' },
                            { value: 'high-cpu',            label: 'high-cpu' },
                            { value: 'low-memory',          label: 'low-memory' },
                            { value: 'license-near-expiry', label: 'license-near-expiry (tüm lisanslar)' },
                            { value: 'event-log',           label: 'event-log (log ID ile)' }
                        ]},
                        { name: 'at_logid', why: 'Tetikleyecek log ID(ler)i; birden fazlası boşlukla. Yanlış ID stitch\'in hiç çalışmamasına yol açar — <b>Log & Report</b> ekranından doğrulayın.', label: 'Log ID', type: 'text', requiredIf: { field: 'at_event', in: ['event-log'] }, placeholder: '32002', hint: 'Boşlukla ayrılmış log ID' }
                    ]
                },
                {
                    title: 'E-posta Aksiyonu',
                    icon: 'fas fa-envelope',
                    info: 'E-posta gönderimi için <code>config system email-server</code> çalışır durumda olmalıdır.',
                    fields: [
                        { name: 'at_act', why: 'Aksiyon nesnesinin adı; farklı stitch\'lerde tekrar kullanılabilir.', label: 'Aksiyon Adı', type: 'text', required: true, placeholder: 'MAIL_NOC', hint: 'automation-action adı' },
                        { name: 'at_to', why: 'Uyarının gideceği adres; kişi yerine ekip/dağıtım listesi kullanın.', label: 'Alıcı', type: 'text', required: true, placeholder: 'noc@example.com', hint: 'email-to' },
                        { name: 'at_subj', why: 'Konu satırı; e-posta kurallarıyla filtrelemeyi kolaylaştırır.', label: 'Konu', type: 'text', required: true, placeholder: 'FortiGate uyarısı', hint: 'email-subject' }
                    ]
                },
                {
                    title: 'Stitch',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'at_stitch', why: 'Stitch, tetikleyici ile aksiyonu bağlar; ancak stitch varsa bir şey olur.', label: 'Stitch Adı', type: 'text', required: true, placeholder: 'CFG_CHANGE_MAIL', hint: 'automation-stitch adı' },
                        { name: 'at_desc', why: 'Stitch\'in amacını açıklar.', label: 'Açıklama', type: 'text', placeholder: 'Config değişikliği bildirimi', hint: 'description' }
                    ]
                }
            ],
            submit: 'Stitch Oluştur'
        }, (data) => cgFgAutomationGen(data));
    }
};
function cgFgAutomationGen(data) {
    const ev = ['config-change', 'ha-failover', 'reboot', 'high-cpu', 'low-memory', 'license-near-expiry', 'event-log'].indexOf(data.at_event) !== -1 ? data.at_event : 'config-change';
    const trig = cgEsc(data.at_trig || ''), act = cgEsc(data.at_act || ''), st = cgEsc(data.at_stitch || '');
    let c = '# ========================================\n# FortiGate — Automation Stitch\n# ========================================\n\n';
    c += 'config system automation-trigger\n    edit "' + trig + '"\n';
    c += '        set event-type ' + ev + '\n';
    if (ev === 'license-near-expiry') c += '        set license-type any\n';
    if (ev === 'event-log') {
        const ids = String(data.at_logid || '').split(/[,\s]+/).filter(x => /^\d+$/.test(x));
        if (ids.length) c += '        set logid ' + ids.join(' ') + '\n';
        else c += '        # UYARI: geçerli log ID girilmedi\n';
    }
    c += '    next\nend\n\n';
    c += 'config system automation-action\n    edit "' + act + '"\n';
    c += '        set action-type email\n';
    c += '        set email-to "' + cgEsc(data.at_to || '') + '"\n';
    c += '        set email-subject "' + cgEsc(data.at_subj || '') + '"\n';
    c += '    next\nend\n\n';
    c += 'config system automation-stitch\n    edit "' + st + '"\n';
    if (data.at_desc) c += '        set description "' + cgEsc(data.at_desc) + '"\n';
    c += '        set trigger "' + trig + '"\n';
    c += '        config actions\n            edit 1\n                set action "' + act + '"\n            next\n        end\n';
    c += '    next\nend\n\n';
    c += '# Doğrulama:\n# show system automation-stitch "' + st + '"\n# diagnose automation test ' + st + '\n';
    return c;
}
