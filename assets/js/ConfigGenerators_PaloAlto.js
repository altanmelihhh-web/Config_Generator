'use strict';

const PaloAlto = {};

// ── Lab bulgularından türetilen girdi uyarıları (CLI Lab pan-02/03/04/05/06) ──
// Önekler: ⛔ engel (commit reddeder / çalışmaz) · ⚠ risk ya da sık hata · ℹ bilgi. Yardımcılar _paW* önekli.
// Sözdizimi kaynakları: pan-os-python (network.py / policies.py / ha.py XML yolları = set CLI yolları),
// iron-skillet PAN-OS 10.1 set şablonu, docs.paloaltonetworks.com.
const _paWIsIp = ip => /^((25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(String(ip || '').trim());
const _paWN = ip => String(ip || '').trim().split('.').reduce((a, o) => a * 256 + (+o), 0);
// "A.B.C.D/NN" → { ip, len } (geçersizse null)
function _paWNet(s) {
    const m = String(s || '').trim().match(/^([\d.]+)\/(\d{1,2})$/);
    return m && _paWIsIp(m[1]) && +m[2] <= 32 ? { ip: m[1], len: +m[2] } : null;
}
const _paWBase = (ip, len) => len === 0 ? 0 : Math.floor(_paWN(ip) / 2 ** (32 - len)) * 2 ** (32 - len);
const _paWIn = (ip, net) => !!net && _paWIsIp(ip) && _paWBase(ip, net.len) === _paWBase(net.ip, net.len);
const _paWOverlap = (a, b) => !!a && !!b && _paWBase(a.ip, Math.min(a.len, b.len)) === _paWBase(b.ip, Math.min(a.len, b.len));
const _paWHostBits = n => !!n && _paWN(n.ip) !== _paWBase(n.ip, n.len);
// Arayüz IP'si alt ağın ağ ya da yayın adresi mi? (/31-/32 hariç)
function _paWNetOrBcast(n) {
    if (!n || n.len > 30) return false;
    const v = _paWN(n.ip), b = _paWBase(n.ip, n.len);
    return v === b || v === b + 2 ** (32 - n.len) - 1;
}
const _paWIpOf = v => [24, 16, 8, 0].map(k => Math.floor(v / 2 ** k) % 256).join('.');
const _paWMask = len => [0, 1, 2, 3].map(i => { const b = Math.max(0, Math.min(8, len - i * 8)); return 256 - 2 ** (8 - b); }).join('.');
// Virgül / boşluk ayrımlı liste
const _paWList = s => String(s || '').split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
// PAN-OS üye alanı: tek değer düz, çok değer köşeli parantezle ("[ a b ]")
const _paWMembers = a => a.length > 1 ? '[ ' + a.map(cgEsc).join(' ') + ' ]' : cgEsc(a[0] || '');
const _paWUntrust = z => /untrust|outside|wan|internet|external/i.test(String(z || ''));
const _paWInside = z => !_paWUntrust(z) && /dmz|trust|inside|lan|server|srv/i.test(String(z || ''));
// Nesne adı: en çok 63 karakter; harf/rakam/_ ile başlar; harf, rakam, boşluk, - _ . içerir
function _paWName(label, v, w, max) {
    const s = String(v || '');
    if (!s) return;
    if (s.length > (max || 63)) w.push('⛔ ' + label + ' en çok ' + (max || 63) + ' karakter olabilir (' + s.length + ').');
    if (!/^[A-Za-z0-9_][A-Za-z0-9 ._-]*$/.test(s)) w.push('⛔ ' + label + ' "' + s + '": PAN-OS adı harf, rakam ya da _ ile başlar; yalnız harf, rakam, boşluk, - _ . içerir.');
}
// Arayüz yönetim profili hizmetleri (pan-os-python ManagementProfile)
const _PAW_MP = ['ping', 'telnet', 'ssh', 'http', 'http-ocsp', 'https', 'snmp', 'response-pages', 'userid-service', 'userid-syslog-listener-ssl', 'userid-syslog-listener-udp'];
const _PAW_VRNOTE = 'ℹ PAN-OS 10.2+ cihazda Advanced Routing açıksa virtual-router yerine logical-router kullanılır (network logical-router …); bu komutlar eski (legacy) yönlendirme motoru içindir.';

// ── Palo Alto: Zone ───────────────────────────────────────────────────────────
PaloAlto.zone = {
    label: 'Zone',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Zone & Interface (PAN-OS)',
                desc: 'Palo Alto zone ve arayüz yapılandırması — Layer3, TAP veya Virtual Wire modu. Outside/Inside zone çifti ve Virtual Router ataması.'
            },
            sections: [
                {
                    title: 'Zone Tipi',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'zone_type', why: "Palo Alto'da <b>her arayüz bir zone'a ait olmalıdır</b>, yoksa trafik işlenmez. Layer3 en yaygın tiptir; Virtual Wire ise mevcut topolojiye dokunmadan araya girer.", label: 'Zone Tipi', type: 'select', options: [
                            { value: 'layer3', label: 'Layer 3', selected: true },
                            { value: 'tap', label: 'TAP' },
                            { value: 'virtual-wire', label: 'Virtual Wire' }
                        ], hint: 'Layer3 en yaygın mod; TAP pasif izleme için kullanılır' }
                    ]
                },
                {
                    title: 'Outside (Untrust) Zone',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'outside_zone', why: 'Zone adları kural yazarken kullanılır. Aynı zone içi trafik varsayılan olarak <b>izinlidir</b> (intrazone-default) — bunu bilmemek beklenmedik geçişlere yol açar.', label: 'Outside Zone Adı', type: 'text', required: true, placeholder: 'outside', hint: 'Untrust zone adı (ör: outside, Untrust)' },
                        { name: 'outside_iface', why: "Arayüz adları <code>ethernet1/1</code> biçimindedir. Arayüzü bir Virtual Router'a ve zone'a atamadan trafik akmaz.", label: 'Outside Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1', hint: 'WAN bacağı arayüzü — PAN-OS formatı: ethernet1/1' },
                        { name: 'outside_ip', why: "CIDR formatında (<code>203.0.113.1/30</code>). PAN-OS'ta arayüz IP'si değişince <b>commit</b> gerekir; commit edilmeden hiçbir değişiklik devreye girmez.", label: 'Outside IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '203.0.113.1/30', hint: 'CIDR formatında WAN IP' }
                    ]
                },
                {
                    title: 'Inside (Trust) Zone',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'inside_zone', why: "İç ağ zone'u. Zone isimlendirmesinde tutarlılık (TRUST/UNTRUST/DMZ) 300 kurallı bir cihazda okunabilirliği belirler.", label: 'Inside Zone Adı', type: 'text', required: true, placeholder: 'inside', hint: 'Trust zone adı (ör: inside, Trust)' },
                        { name: 'inside_iface', why: "Arayüzü bir zone'a atamadan trafik <b>hiç</b> geçmez; zone'suz arayüz tüm paketleri sessizce düşürür. Virtual Router'a eklemeyi de unutma.", label: 'Inside Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/2', hint: 'LAN bacağı arayüzü' },
                        { name: 'inside_ip', why: "İç arayüz IP'si; LAN istemcilerinin gateway'i olur.", label: 'Inside IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.64.10.1/24', hint: 'CIDR formatında LAN gateway IP' }
                    ]
                },
                {
                    title: 'Virtual Router',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'vr', why: "Virtual Router, PAN-OS'un routing tablosudur. Arayüz bir VR'a atanmazsa rota öğrenemez ve trafik yönlendirilemez.", label: 'Virtual Router Adı', type: 'text', required: true, placeholder: 'default', hint: 'Varsayılan VR adı genellikle "default" bırakılır' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaZoneGen(data);
        });
    }
};
function cgPaZoneGen(data) {
    const zt = ['layer3', 'tap', 'virtual-wire'].includes(data.zone_type) ? data.zone_type : 'layer3';
    const oz = cgEsc(data.outside_zone || ''), oi = cgEsc(data.outside_iface || ''), oip = cgEsc(data.outside_ip || '');
    const iz = cgEsc(data.inside_zone || ''), ii = cgEsc(data.inside_iface || ''), iip = cgEsc(data.inside_ip || '');
    const vr = cgEsc(data.vr || '');
    const w = [];
    _paWName('Outside zone adı', data.outside_zone, w, 31);
    _paWName('Inside zone adı', data.inside_zone, w, 31);
    if (oz && oz === iz) w.push('⛔ İki zone aynı adda: arayüzler aynı zone\'a düşer, aralarındaki trafik intrazone-default ile kuralsız geçer.');
    if (oi && oi === ii) w.push('⛔ Outside ve inside aynı arayüz: bir arayüz yalnız bir zone\'a üye olabilir, commit reddeder.');
    let c = '# ========================================\n# Palo Alto — Zone & Interface Configuration\n# ========================================\n\n';
    if (zt === 'layer3') {
        const on = _paWNet(data.outside_ip), inn = _paWNet(data.inside_ip);
        [['Outside', on], ['Inside', inn]].forEach(([l, n]) => { if (_paWNetOrBcast(n)) w.push('⛔ ' + l + ' IP\'si alt ağın ağ ya da yayın adresi (' + n.ip + '/' + n.len + '); arayüze kullanılabilir bir host adresi verin.'); });
        if (on && inn && _paWOverlap(on, inn)) w.push('⛔ Outside ve inside alt ağları çakışıyor: aynı VR\'da iki bağlı ağ çakışınca commit reddeder ya da trafik yanlış arayüze gider.');
        c += '# Outside Interface\nset network interface ethernet ' + oi + ' layer3 ip ' + oip + '\nset network interface ethernet ' + oi + ' layer3 mtu 1500\n\n';
        c += '# Inside Interface\nset network interface ethernet ' + ii + ' layer3 ip ' + iip + '\nset network interface ethernet ' + ii + ' layer3 mtu 1500\n\n';
        c += '# Zones\nset zone ' + oz + ' network layer3 [ ' + oi + ' ]\nset zone ' + iz + ' network layer3 [ ' + ii + ' ]\n\n';
        c += '# Virtual Router (VR\'a eklenmeyen arayüzün bağlı ağı rota tablosuna girmez)\nset network virtual-router ' + vr + ' interface [ ' + oi + ' ' + ii + ' ]\n\n';
        w.push('ℹ Varsayılan rota üretilmedi: "Virtual Router + Route" aracıyla 0.0.0.0/0 ekleyin. Arayüzü doğrulamak için show interface all (zone ve VR sütunları) (pan-02).');
        w.push(_PAW_VRNOTE);
    } else if (zt === 'tap') {
        // TAP: arayüz tap modunda, IP ve VR yok; zone tipi tap
        c += '# TAP arayüzleri (pasif izleme: IP ve sanal yönlendirici kullanılmaz)\n';
        c += 'set network interface ethernet ' + oi + ' tap\nset network interface ethernet ' + ii + ' tap\n\n';
        c += '# Zones\nset zone ' + oz + ' network tap [ ' + oi + ' ]\nset zone ' + iz + ' network tap [ ' + ii + ' ]\n\n';
        w.push('ℹ TAP modunda IP adresi ve Virtual Router alanları kullanılmaz; arayüz yalnız SPAN kopyasını dinler, trafik geçirmez.');
    } else {
        // Virtual Wire: iki arayüz bir vwire nesnesiyle eşlenir; IP ve VR yok; zone tipi virtual-wire
        const vw = 'VW-' + oz + '-' + iz;
        c += '# Virtual Wire arayüzleri (şeffaf geçiş: IP ve sanal yönlendirici kullanılmaz)\n';
        c += 'set network interface ethernet ' + oi + ' virtual-wire\nset network interface ethernet ' + ii + ' virtual-wire\n';
        c += 'set network virtual-wire ' + vw + ' interface1 ' + oi + ' interface2 ' + ii + '\n\n';
        c += '# Zones\nset zone ' + oz + ' network virtual-wire [ ' + oi + ' ]\nset zone ' + iz + ' network virtual-wire [ ' + ii + ' ]\n\n';
        w.push('ℹ Virtual Wire modunda IP adresi ve Virtual Router alanları kullanılmaz; iki arayüz ' + vw + ' nesnesiyle eşlenir.');
    }
    w.push('ℹ Zone\'lar arası trafik için güvenlik kuralı gerekir: kural yoksa interzone-default (deny) uygulanır; aynı zone içi trafik intrazone-default (allow) ile geçer.');
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show interface all\n' + (zt === 'layer3' ? '# show routing route\n' : '');
    return { config: c, warnings: w };
}

// ── Palo Alto: Address Object ──────────────────────────────────────────────────
PaloAlto.address = {
    label: 'Address Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-map-marker-alt',
                title: 'Address Object (PAN-OS)',
                desc: 'Palo Alto adres nesnesi — IP/Netmask, FQDN veya IP Range tipinde. Security policy ve NAT kurallarında kullanılır.'
            },
            sections: [
                {
                    title: 'Adres Nesnesi',
                    icon: 'fas fa-address-card',
                    fields: [
                        { name: 'addr_name', why: 'Nesne adı kuralda görünür. Tutarlı isimlendirme (<code>SRV_WEB_01</code>) büyük kural setlerinde aranabilirliği belirler.', label: 'Nesne Adı', type: 'text', required: true, placeholder: 'WEB_SERVER', hint: 'Büyük harf ve alt çizgi önerilir (ör: WEB_SERVER)' },
                        { name: 'addr_type', why: "<b>IP Netmask</b> sabit ağlar, <b>FQDN</b> IP'si değişen bulut servisleri, <b>IP Range</b> ardışık adresler için. FQDN nesneleri DNS çözümlemesine bağımlıdır.", label: 'Tip', type: 'select', options: [
                            { value: 'ip-netmask', label: 'IP/Netmask', selected: true },
                            { value: 'fqdn', label: 'FQDN' },
                            { value: 'ip-range', label: 'IP Range' }
                        ], hint: 'IP/Netmask en yaygın; FQDN DNS tabanlı nesneler için' },
                        { name: 'netmask', why: "PAN-OS CIDR bekler. Tek host için <code>/32</code> yaz; ağ tanımlarken prefix'i unutmak nesneyi tek adrese daraltır ve kural beklediğinden çok dar çalışır.", label: 'IP / Prefix (CIDR)', type: 'text', requiredIf: { field: 'addr_type', in: ['ip-netmask'] }, validate: 'cidr', placeholder: '172.24.50.10/32', hint: 'IP/Netmask tipi seçildiyse doldurun' },
                        { name: 'fqdn_val', why: "PAN-OS, FQDN'i periyodik çözer ve önbelleğe alır. DNS erişimi koparsa nesne eski IP ile kalır; erişim sorunlarının sessiz kaynağıdır.", label: 'FQDN', type: 'text', requiredIf: { field: 'addr_type', in: ['fqdn'] }, placeholder: 'example.com', hint: 'FQDN tipi seçildiyse doldurun' },
                        { name: 'ip_range', why: "Range nesnesi, aradaki kullanılmayan adresler dahil <b>tüm</b> aralığı kapsar. İleride bu bloğa eklenecek her cihaz otomatik olarak aynı yetkiyi alır.", label: 'IP Range', type: 'text', requiredIf: { field: 'addr_type', in: ['ip-range'] }, validate: 'ip_range', placeholder: '172.24.50.10-172.24.50.20', hint: 'IP Range tipi seçildiyse doldurun' },
                        { name: 'desc', why: "Altı ay sonra bu nesnenin neden açıldığını hatırlamayacaksın. Ticket numarası yazmak, kural temizliğinde neyin silinebileceğini belirleyen tek ipucudur.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'Web sunucusu', hint: 'Nesne açıklaması (opsiyonel)' },
                        { name: 'group_name', why: 'Adres grubu kural sayısını azaltır. <b>Dynamic Address Group</b> ise etiket bazlı çalışır ve commit gerektirmeden güncellenir — otomasyon için güçlü bir araçtır.', label: 'Adres Grubu', type: 'text', optional: true, placeholder: 'WEB_SERVERS', hint: 'Bu nesneyi eklemek istediğiniz adres grubu adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaAddrGen(data);
        });
    }
};
function cgPaAddrGen(data) {
    const name = cgEsc(data.addr_name || ''), type = ['ip-netmask', 'fqdn', 'ip-range'].includes(data.addr_type) ? data.addr_type : 'ip-netmask';
    const desc = cgEsc(data.desc || ''), grp = cgEsc(data.group_name || '');
    const w = [];
    _paWName('Nesne adı', data.addr_name, w);
    if (grp) _paWName('Adres grubu adı', data.group_name, w);
    let c = '# ========================================\n# Palo Alto — Address Object\n# ========================================\n\n';
    if (type === 'ip-netmask') {
        const n = _paWNet(data.netmask);
        if (!n && _paWIsIp(data.netmask)) w.push('ℹ Önek verilmedi: PAN-OS tek adresi /32 kabul eder. Bir ağ kastediliyorsa /24 gibi önek yazın.');
        if (n && n.len < 32 && _paWHostBits(n)) w.push('⚠ ' + n.ip + '/' + n.len + ' host bitleri dolu: nesne tek sunucuyu değil tüm /' + n.len + ' ağını kapsar. Tek host için /32, ağ için ağ adresi yazın.');
        c += 'set address "' + name + '" ip-netmask ' + cgEsc(data.netmask || '') + '\n';
    } else if (type === 'fqdn') {
        w.push('ℹ FQDN nesnesi cihazın DNS ayarıyla çözülür; DNS erişilemezse nesne eski ya da boş adresle kalır (Device Setup aracı).');
        c += 'set address "' + name + '" fqdn ' + cgEsc(data.fqdn_val || '') + '\n';
    } else {
        const r = String(data.ip_range || '').split('-').map(x => x.trim());
        if (r.length === 2 && _paWIsIp(r[0]) && _paWIsIp(r[1]) && _paWN(r[0]) > _paWN(r[1])) w.push('⛔ IP aralığının başlangıcı bitişinden büyük (' + r[0] + ' > ' + r[1] + '): commit reddeder.');
        c += 'set address "' + name + '" ip-range ' + cgEsc(data.ip_range || '') + '\n';
    }
    if (desc) c += 'set address "' + name + '" description ' + cgQ(data.desc) + '\n';
    c += '\n';
    if (grp) {
        c += '# Adres Grubuna Ekle (set üye listesine ekler, mevcut üyeler korunur)\nset address-group "' + grp + '" static [ "' + name + '" ]\n\n';
    }
    c += '# Doğrulama (configure modu):\n# show address "' + name + '"\n' + (grp ? '# show address-group "' + grp + '"\n' : '');
    return { config: c, warnings: w };
}

// ── Palo Alto: Security Policy ────────────────────────────────────────────────
PaloAlto.policy = {
    label: 'Security Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Policy (PAN-OS)',
                desc: 'Palo Alto güvenlik politikası — zone, adres, uygulama ve servis bazlı allow/deny kuralları. App-ID ile uygulama tanıma desteği.',
            },
            sections: [
                {
                    title: 'Kural Tanımı',
                    icon: 'fas fa-lock',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'rule_name', why: 'Kurallar yukarıdan aşağıya değerlendirilir, <b>ilk eşleşen</b> uygulanır. Sonda iki gizli kural vardır: intrazone-default (allow) ve interzone-default (deny).', label: 'Kural Adı', type: 'text', required: true, placeholder: 'Allow_LAN_to_WAN', hint: 'Kural adı boşluk içermemeli (ör: Allow_LAN_to_WAN)' },
                        { name: 'from_zone', why: 'Kaynak zone. Palo Alto kuralları <b>zone bazlıdır</b>, arayüz bazlı değil — yanlış zone kuralın hiç eşleşmemesine yol açar.', label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'inside', hint: 'Trafiğin geldiği zone' },
                        { name: 'to_zone', why: "Hedef zone. Hedef NAT (DNAT) varsa güvenlik kuralında <b>post-NAT zone</b>, yani sunucunun gerçekte bulunduğu zone yazılır (ör. dmz); NAT kuralında ise pre-NAT zone (untrust) yazılır. En kafa karıştırıcı noktalardan biri (pan-04).", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'outside', hint: 'Trafiğin gittiği zone; birden çok zone boşlukla' },
                        { name: 'src_addr', why: "Boş ya da <code>any</code> bırakmak, zone içindeki her cihaza aynı hakkı verir. Palo Alto kuralı zaten zone ile sınırlıdır; adresi daraltmamak bu sınırı anlamsız kılar.", label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'LAN_SUBNET', hint: '"any" veya adres nesnesi adı (ör: LAN_SUBNET)' },
                        { name: 'dst_addr', why: "DNAT'lı bir yayında güvenlik kuralının hedef adresi <b>pre-NAT</b> (dıştaki genel) IP'dir, zone'u ise <b>post-NAT</b> zone'dur. Sunucunun gerçek iç IP'sini yazmak kuralı ıskalatır; Palo Alto'daki en klasik NAT hatasıdır (pan-06).", label: 'Hedef Adres', type: 'text', required: true, placeholder: 'WEB_SERVERS', hint: '"any" veya hedef adres nesnesi; birden çok değer boşlukla' },
                        { name: 'application', why: "App-ID, Palo Alto'nun asıl farkıdır: trafiği porttan değil içeriğinden tanır. <code>any</code> yazmak bu korumayı devre dışı bırakır. Bağımlılıkları da eklemeyi unutma (ör. <code>ssl</code>, <code>web-browsing</code>).", label: 'Uygulama', type: 'text', required: true, placeholder: 'web-browsing ssl', hint: '"any" veya App-ID adları boşlukla ayrılmış (ör: web-browsing ssl)' }
                    ]
                },
                {
                    title: 'Aksiyon ve Log',
                    icon: 'fas fa-gavel',
                    fields: [
                        { name: 'service', why: 'App-ID kullanırken <code>application-default</code> seçmek en güvenlisidir: uygulama yalnızca kendi standart portunda çalışabilir.', label: 'Servis', type: 'select', options: [
                            { value: 'application-default', label: 'application-default', selected: true },
                            { value: 'any', label: 'any' }
                        ], hint: '"application-default" App-ID ile port uyumunu zorunlu kılar' },
                        { name: 'action', why: '<code>allow</code> geçirir, <code>deny</code> uygulamaya göre davranır, <code>drop</code> sessizce düşürür, <code>reset</code> RST gönderir. Deny kuralında log açmazsan engellenen trafiği göremezsin.', label: 'Aksiyon', type: 'select', options: [
                            { value: 'allow', label: 'Allow', selected: true },
                            { value: 'deny', label: 'Deny' },
                            { value: 'drop', label: 'Drop' }
                        ]},
                        { name: 'log_end', why: "<b>Log at Session End</b> varsayılan ve doğru olandır; session start loglaması disk ve CPU'yu gereksiz yorar. Log açılmamış kural, denetimde yok sayılır.", label: 'Log', type: 'select', options: [
                            { value: 'yes', label: 'Log at Session End', selected: true },
                            { value: 'no', label: 'No Log' }
                        ], hint: 'Session end loglaması önerilir; log başlangıç için log-start kullanın' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaPolicyGen(data);
        });
    }
};
function cgPaPolicyGen(data) {
    const rname = cgEsc(data.rule_name || '');
    const base = 'set rulebase security rules "' + rname + '"';
    const fz = _paWList(data.from_zone), tz = _paWList(data.to_zone);
    const sa = _paWList(data.src_addr), da = _paWList(data.dst_addr), ap = _paWList(data.application);
    const svc = data.service === 'any' ? 'any' : 'application-default';
    const act = ['allow', 'deny', 'drop'].includes(data.action) ? data.action : 'allow';
    const logEnd = data.log_end === 'no' ? 'no' : 'yes';
    const isAny = a => a.length === 1 && /^any$/i.test(a[0]);
    const w = [];
    _paWName('Kural adı', data.rule_name, w);
    [['Kaynak adres', sa], ['Hedef adres', da], ['Uygulama', ap], ['Kaynak zone', fz], ['Hedef zone', tz]].forEach(([l, a]) => { if (a.length > 1 && a.some(x => /^any$/i.test(x))) w.push('⛔ ' + l + ': "any" başka değerle birlikte yazılamaz; ya any ya da liste.'); });
    if (act === 'allow' && isAny(sa) && isAny(da) && isAny(ap))
        w.push('⚠ Kaynak, hedef ve uygulama "any": kural iki zone arasındaki TÜM trafiğe izin verir. Gereken ağ ve uygulamalarla daraltın.');
    if (act === 'allow' && isAny(ap) && svc === 'any')
        w.push('⚠ Uygulama any + servis any: port ve uygulama sınırı yok; App-ID koruması devre dışı kalır (pan-03).');
    else if (act === 'allow' && !isAny(ap) && svc === 'any')
        w.push('⚠ Servis any: ' + ap.join(' ') + ' uygulaması standart dışı her portta da geçer (tünelleme). application-default seçin; standart dışı port gerekiyorsa Service Object ile yalnız o portu yazın (pan-03).');
    else if (isAny(ap) && svc === 'application-default')
        w.push('ℹ Uygulama any + application-default: her uygulama yalnız kendi standart portunda eşleşir; bilinmeyen (unknown-tcp) trafik bu kurala girmez.');
    if (logEnd === 'no') w.push('⚠ log-end kapalı: bu kuralın eşleştiği oturumlar Traffic logunda görünmez; sorun gidermede "hangi kural düşürdü/izin verdi" sorusunun cevabı kaybolur.');
    if (fz.length && fz.join() === tz.join() && !isAny(fz)) w.push('ℹ Kaynak ve hedef zone aynı: aynı zone içi trafik kural olmadan da intrazone-default (allow) ile geçer; bu kural yalnız kısıtlama ya da loglama için anlamlıdır.');
    if (act === 'allow' && fz.some(_paWUntrust) && !isAny(da))
        w.push('ℹ Dışarıdan yayınlanan (DNAT) bir sunucu içinse: hedef adres pre-NAT genel IP, hedef zone post-NAT zone (sunucunun gerçek zone\'u) yazılır. Gerçek iç IP ya da "to untrust" kuralı ıskalatır (pan-04 / pan-06).');
    if (act !== 'allow') w.push('ℹ ' + act + ' kuralı: eşleşmeyen trafik zaten interzone-default ile düşer ama o kural varsayılan olarak loglanmaz; açık deny kuralı log üretir. Geniş bir deny, altındaki özel allow kurallarını gölgeler (pan-05).');
    else w.push('ℹ Yeni kural kural tabanının sonuna eklenir: üstte daha geniş bir deny varsa hiç eşleşmez (gölgelenme). Gerekirse: move rulebase security rules "' + rname + '" before <kural> (pan-05).');
    let c = '# ========================================\n# Palo Alto — Security Policy\n# ========================================\n\n';
    c += base + ' from ' + _paWMembers(fz) + '\n';
    c += base + ' to ' + _paWMembers(tz) + '\n';
    c += base + ' source ' + _paWMembers(sa) + '\n';
    c += base + ' destination ' + _paWMembers(da) + '\n';
    c += base + ' application ' + _paWMembers(ap) + '\n';
    c += base + ' service ' + svc + '\n';
    c += base + ' action ' + act + '\n';
    c += base + ' log-end ' + logEnd + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    const app1 = isAny(ap) ? '<uygulama>' : cgEsc(ap[0] || '');
    c += '# Doğrulama (test komutu commit edilmiş kurallara bakar; protocol 6=TCP 17=UDP):\n# show rulebase security rules "' + rname + '"   (configure modu)\n# test security-policy-match from ' + cgEsc(fz[0] || '') + ' to ' + cgEsc(tz[0] || '') + ' source <ip> destination <ip> destination-port <port> protocol 6 application ' + app1 + '\n';
    return { config: c, warnings: w };
}

// ── Palo Alto: NAT ────────────────────────────────────────────────────────────
PaloAlto.nat = {
    label: 'NAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT Kuralı (PAN-OS)',
                desc: 'Palo Alto NAT — Source NAT (internet erişimi) veya Destination NAT (port forwarding/DNAT). Kural tipi seçerek ilgili alanları doldurun.'
            },
            configTypes: [
                { id: 'source', label: 'Source NAT', icon: 'fas fa-arrow-up', desc: 'İç ağdan internete — dynamic/static IP çevirisi', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'destination', label: 'Destination NAT', icon: 'fas fa-arrow-down', desc: 'Port forwarding, DNAT — dışarıdan içeriye', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'NAT Kural Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'rule_name', why: 'Kurallar yukarıdan aşağıya değerlendirilir, <b>ilk eşleşen</b> uygulanır. Sonda iki gizli kural vardır: intrazone-default (allow) ve interzone-default (deny).', label: 'Kural Adı', type: 'text', required: true, placeholder: 'Source_NAT', hint: 'NAT kuralı için anlamlı bir ad' },
                        { name: 'from_zone', why: 'Kaynak zone. Palo Alto kuralları <b>zone bazlıdır</b>, arayüz bazlı değil — yanlış zone kuralın hiç eşleşmemesine yol açar.', label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'inside', hint: 'Kaynak zone adı' },
                        { name: 'to_zone', why: "Hedef zone. NAT uygulanıyorsa kuralda <b>çevrilmiş hedefin zone'u</b> değil, orijinal paketin gideceği zone yazılır — en kafa karıştırıcı noktalardan biri.", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'outside', hint: 'Hedef zone adı' },
                        { name: 'src_addr', why: "Boş ya da <code>any</code> bırakmak, zone içindeki her cihaza aynı hakkı verir. Palo Alto kuralı zaten zone ile sınırlıdır; adresi daraltmamak bu sınırı anlamsız kılar.", label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'any', hint: '"any" veya adres nesnesi' },
                        { name: 'dst_addr', why: "NAT kuralında hedef adres <b>pre-NAT</b> (çevrilmeden önceki) adrestir, ama zone <b>post-NAT</b> zone'dur. Bu asimetri Palo Alto'daki en klasik NAT hatasıdır.", label: 'Hedef Adres', type: 'text', required: true, placeholder: 'any', hint: '"any" veya hedef adres nesnesi' },
                        { name: 'service', why: 'NAT kuralının eşleşeceği servis. <code>any</code> kaynak NAT\'ta olağandır; <b>hedef NAT\'ta</b> yayınlanan sunucunun tüm portlarını açar — yalnızca yayınlanan servisi (örn: service-https) yazın.', label: 'Servis', type: 'text', required: true, placeholder: 'any', hint: 'Hedef NAT için yayınlanan servis (örn: service-https)' },
                    ]
                },
                {
                    title: 'Source NAT Ayarları',
                    icon: 'fas fa-arrow-up',
                    showFor: ['source'],
                    fields: [
                        { name: 'src_trans_type', why: "<b>Dynamic IP and Port</b> çok kaynağı tek IP'ye gizler (giden trafik). <b>Static IP</b> bire bir eşler. Yanlış tip, dışarıdan erişimi imkânsız kılar.", label: 'Source Translation Tipi', type: 'select', options: [
                            { value: 'dynamic-ip-and-port interface-address', label: 'Dynamic IP+Port (Interface)', selected: true },
                            { value: 'dynamic-ip-and-port translated-address', label: 'Dynamic IP+Port (Pool)' },
                            { value: 'static-ip static-translated-address', label: 'Static IP' }
                        ], hint: 'Interface-address: WAN IP üzerinden PAT' },
                        { name: 'to_iface', why: "Interface NAT'ta kaynak adres bu arayüzün IP'sine çevrilir (<code>interface-address interface ethernet1/1</code>) — ISS'den tek IP alıyorsan doğru seçimdir. Arayüz adı verilmezse satır eksik kalır ve commit reddeder.", label: 'Çeviri Arayüzü (Interface NAT için)', type: 'text', requiredIf: { field: 'src_trans_type', in: ['dynamic-ip-and-port interface-address'] }, validate: 'iface', placeholder: 'ethernet1/1', hint: 'Dynamic IP+Port Interface seçildiyse WAN arayüzü' },
                        { name: 'snat_pool', why: "Havuzlu DIPP'te kaynaklar bu adres(ler)e port çevirisiyle bağlanır; Static IP'de tek adrese 1:1 eşlenir. Havuz adresleri WAN alt ağındaysa cihaz onlar için ARP'a cevap verir; değilse ISS'nin bu adresleri size yönlendirmesi gerekir.", label: 'Çevrilmiş Adres / Havuz', type: 'text', requiredIf: { field: 'src_trans_type', in: ['dynamic-ip-and-port translated-address', 'static-ip static-translated-address'] }, placeholder: '203.0.113.20', hint: 'IP, IP/önek, aralık ya da adres nesnesi (havuzda boşlukla birden çok)' }
                    ]
                },
                {
                    title: 'Destination NAT Ayarları',
                    icon: 'fas fa-arrow-down',
                    showFor: ['destination'],
                    fields: [
                        { name: 'trans_dst_ip', why: "Destination NAT'ta iç sunucunun gerçek IP'si. <b>Güvenlik kuralında hedef adres olarak orijinal (dış) IP yazılır</b>, çevrilmiş IP değil — bu ayrımı kaçırmak en sık yapılan Palo Alto hatasıdır.", label: 'Translated Hedef IP', type: 'text', required: true, validate: 'ip', placeholder: '172.24.50.10', hint: 'İç sunucunun IP adresi' },
                        { name: 'trans_dst_port', why: "Port yönlendirme. Dış 8080'i iç 80'e çevirmek gibi. Servis nesnesinin <b>orijinal</b> portu içermesi gerekir.", label: 'Translated Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '80', hint: 'Hedef porta yönlendirilecek port (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaNatGen(data);
        });
    }
};
function cgPaNatGen(data) {
    const type = data._cgtype === 'destination' ? 'destination' : 'source', rname = cgEsc(data.rule_name || '');
    const base = 'set rulebase nat rules "' + rname + '"';
    const fz = _paWList(data.from_zone), tz = _paWList(data.to_zone);
    const sa = _paWList(data.src_addr), da = _paWList(data.dst_addr), sv = _paWList(data.service);
    const isAny = a => a.length === 1 && /^any$/i.test(a[0]);
    const w = [];
    _paWName('Kural adı', data.rule_name, w);
    if (tz.length > 1) w.push('⛔ NAT kuralında yalnız bir hedef (to) zone olabilir; commit reddeder.');
    if (sv.length > 1) w.push('⛔ NAT kuralında servis tek değerdir (any, service-http, service-https ya da bir Service Object adı); birden çok port için Service Group kullanılamaz, ayrı NAT kuralı yazın.');
    else if (sv.length && /^(tcp|udp)?[\/-]?\d+$/i.test(sv[0])) w.push('⛔ Servis alanına port yazılmış (' + sv[0] + '): NAT kuralı servis NESNESİ adı bekler (ör. service-https ya da Service Object aracıyla oluşturulan SVC-TCP-8443).');
    let c = '# ========================================\n# Palo Alto — NAT Rule\n# ========================================\n\n';
    c += base + ' from ' + _paWMembers(fz) + '\n';
    c += base + ' to ' + _paWMembers(tz) + '\n';
    c += base + ' source ' + _paWMembers(sa) + '\n';
    c += base + ' destination ' + _paWMembers(da) + '\n';
    c += base + ' service ' + cgEsc(sv[0] || '') + '\n';
    if (type === 'source') {
        const tt = data.src_trans_type || 'dynamic-ip-and-port interface-address';
        const toIface = cgEsc(String(data.to_iface || '').trim()), pool = _paWList(data.snat_pool);
        if (tt === 'dynamic-ip-and-port interface-address') {
            // Çeviri adresi, verilen arayüzün IP'si (DIPP). "to-interface" ayrı bir eşleşme alanıdır, çeviri arayüzü değildir.
            if (!toIface) w.push('⛔ Interface NAT için çeviri arayüzü gerekli: source-translation dynamic-ip-and-port interface-address interface <arayüz> eksik kalır.');
            c += base + ' source-translation dynamic-ip-and-port interface-address interface ' + toIface + '\n';
        } else if (tt === 'dynamic-ip-and-port translated-address') {
            if (!pool.length) w.push('⛔ Havuzlu DIPP için çeviri adres(ler)i gerekli (IP, aralık ya da adres nesnesi).');
            c += base + ' source-translation dynamic-ip-and-port translated-address ' + _paWMembers(pool) + '\n';
        } else {
            if (!pool.length) w.push('⛔ Static IP çevirisi için çevrilmiş adres gerekli.');
            if (pool.length > 1) w.push('⛔ Static IP çevirisinde tek çevrilmiş adres (ya da aynı boyutta ağ) verilir.');
            c += base + ' source-translation static-ip translated-address ' + cgEsc(pool[0] || '') + '\n';
            w.push('ℹ Static IP (1:1) çeviri varsayılan olarak tek yönlüdür; dışarıdan da aynı eşlemeyle erişilecekse bi-directional yes eklenebilir. Güvenlik kuralı yine ayrıca gerekir.');
        }
        if (fz.length && fz.join() === tz.join()) w.push('⚠ Kaynak NAT\'ta from ve to aynı zone: internete çıkışta "to" çıkış (untrust) zone\'udur; aynı zone ile kural beklenen trafiği yakalamaz.');
        w.push('ℹ Kaynak NAT tek başına trafiği geçirmez: aynı akış için ayrı güvenlik kuralı (ör. trust → untrust allow) gerekir (pan-04).');
    } else {
        const tdip = String(data.trans_dst_ip || '').trim(), tdport = cgEsc(data.trans_dst_port || '');
        if (isAny(da)) w.push('⛔ Hedef NAT\'ta hedef adres any: zone\'a gelen TÜM hedefler sunucuya çevrilir. Yayınlanan genel (pre-NAT) IP\'yi yazın.');
        if (tdip && da.some(x => x === tdip || x === tdip + '/32')) w.push('⛔ Hedef adres ile çevrilmiş adres aynı (' + tdip + '): NAT kuralının hedefi pre-NAT genel IP, translated-address sunucunun gerçek IP\'sidir.');
        if (sv.length === 1 && /^any$/i.test(sv[0])) w.push('⚠ Hedef NAT\'ta servis any: sunucunun TÜM portları dışarı açılır. Yalnız yayınlanan servisi yazın (ör. service-https) (pan-04).');
        if (tz.some(_paWInside)) w.push('⚠ NAT kuralında hedef zone "' + tz.join(' ') + '": NAT kuralı pre-NAT değerlerle eşleşir; genel IP\'nin bulunduğu zone (çoğunlukla untrust, yani from ile aynı) yazılmalı. "to dmz" en yaygın DNAT hatasıdır (pan-06 natzone).');
        c += base + ' destination-translation translated-address ' + cgEsc(tdip) + '\n';
        if (tdport) c += base + ' destination-translation translated-port ' + tdport + '\n';
        w.push('ℹ Eşleşen güvenlik kuralı: from ' + (fz.join(' ') || '<from>') + ' to <sunucunun zone\'u (post-NAT, ör. dmz)> destination ' + (da.join(' ') || '<genel IP>') + ' (pre-NAT IP) — Security Policy aracı (pan-04).');
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama (NAT testi pre-NAT değerlerle yapılır):\n# show rulebase nat rules "' + rname + '"   (configure modu)\n# test nat-policy-match from ' + cgEsc(fz[0] || '') + ' to ' + cgEsc(tz[0] || '') + ' source <ip> destination <ip> destination-port <port> protocol 6\n# show session all filter source <ip>\n';
    return { config: c, warnings: w };
}

// ── Palo Alto: IPSec VPN ───────────────────────────────────────────────────────
PaloAlto.ipsec = {
    label: 'IPSec VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'IPSec VPN (PAN-OS)',
                desc: 'Palo Alto site-to-site IPSec VPN — IKE Crypto profil, IPSec Crypto profil, IKE Gateway ve Tunnel konfigürasyonu. IKEv2 önerilir.'
            },
            sections: [
                {
                    title: 'Crypto Profilleri',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'ike_profile', why: "Profil adı yereldir, <b>içeriği</b> karşı tarafla eşleşmeli. PAN-OS varsayılan profili zayıf algoritmalar içerir; üretimde kendi profilini tanımla.", label: 'IKE Crypto Profil', type: 'text', required: true, placeholder: 'IKE_PROFILE', hint: 'IKE Phase-1 şifreleme profili adı' },
                        { name: 'ipsec_profile', why: "Phase 2 profili. PFS grubu iki tarafta aynı olmalı; bir tarafta PFS kapalıysa tünel Phase 1'de up görünür ama içinden tek paket geçmez.", label: 'IPSec Crypto Profil', type: 'text', required: true, placeholder: 'IPSEC_PROFILE', hint: 'IPSec Phase-2 şifreleme profili adı' },
                        { name: 'ike_ver', why: 'IKEv2 daha az round-trip ve daha iyi NAT geçişi sağlar. İki tarafta <b>aynı sürüm</b> olmalı.', label: 'IKE Versiyon', type: 'select', options: [
                            { value: 'ikev2', label: 'IKEv2', selected: true },
                            { value: 'ikev1', label: 'IKEv1' }
                        ], hint: 'IKEv2 tercih edilir; IKEv1 legacy cihazlar için' },
                        { name: 'ike_enc', why: '<code>3DES</code> ve <code>DES</code> güvensizdir; <code>aes-256-cbc</code> kullan. İki tarafta en az bir ortak proposal bulunmalı.', label: 'IKE Şifreleme', type: 'select', options: [
                            { value: 'aes-256-cbc', label: 'AES-256-CBC', selected: true },
                            { value: 'aes-128-cbc', label: 'AES-128-CBC' }
                        ]},
                        { name: 'ike_hash', why: "<code>md5</code> ve <code>sha1</code> artık güvenli kabul edilmiyor; <code>sha256</code> ve üstünü seç. İki tarafta eşleşmezse Phase 1 proposal hatası alırsın.", label: 'IKE Hash', type: 'select', options: [
                            { value: 'sha256', label: 'SHA-256', selected: true },
                            { value: 'sha1', label: 'SHA-1' }
                        ]},
                        { name: 'dh_grp', why: 'DH grup 1, 2 ve 5 kırılabilir kabul edilir. En az grup 14 (2048-bit) seçilmeli ve iki tarafta aynı olmalı.', label: 'DH Group', type: 'select', options: [
                            { value: 'group14', label: 'Group 14', selected: true },
                            { value: 'group19', label: 'Group 19 (ECDH)' },
                            { value: 'group5', label: 'Group 5 (eski)' }
                        ], hint: 'Group 14 veya üzeri önerilir' }
                    ]
                },
                {
                    title: 'IKE Gateway',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'gw_name', why: "Gateway adı IPSec tünel nesnesinde referans alınır. Sonradan değiştirmek tüneli yeniden bağlamayı gerektirir ve commit sırasında oturum düşer.", label: 'IKE Gateway Adı', type: 'text', required: true, placeholder: 'IKE_GW', hint: 'Gateway nesnesi adı' },
                        { name: 'gw_iface', why: "IKE paketlerinin çıkacağı arayüz. Yanlış arayüz seçersen paketler beklenen kaynak IP'yi taşımaz ve karşı taraf peer'ı tanımaz — hata mesajı da yanıltıcı olur.", label: 'WAN Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1', hint: 'Karşı tarafa bağlı WAN arayüzü' },
                        { name: 'peer_ip', why: "Karşı tarafın gerçek dış IP'si. NAT arkasındaysa NAT-T açık olmalı ve UDP 4500 geçmelidir.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.2', hint: 'Uzak IPSec endpoint IP adresi' },
                        { name: 'psk', why: 'İki tarafta birebir aynı olmalı; kopyalarken sondaki boşluk klasik hatadır. Uzun ve rastgele seç.', label: 'Pre-Shared Key', type: 'text', required: true, placeholder: 'MyS3cr3tKey!', hint: 'Her iki tarafta aynı PSK girilmeli' }
                    ]
                },
                {
                    title: 'IPSec Tunnel',
                    icon: 'fas fa-tunnel',
                    fields: [
                        { name: 'tunnel_name', why: "Tünel arayüzünü bir zone'a ve Virtual Router'a eklemeyi unutma. İkisi olmadan tünel up olur ama üzerinden hiçbir trafik akmaz — en sık yaşanan yanılgıdır.", label: 'Tunnel Adı', type: 'text', required: true, placeholder: 'VPN_TUNNEL', hint: 'IPSec tunnel nesnesi adı' },
                        { name: 'tunnel_iface', why: "Tünel arayüzü (<code>tunnel.1</code>) bir zone'a ve Virtual Router'a atanmalıdır. Atanmazsa tünel kurulur ama trafik akmaz.", label: 'Tunnel Interface', type: 'text', validate: 'iface', required: true, placeholder: 'tunnel.1', hint: 'PAN-OS tunnel arayüzü (ör: tunnel.1)' },
                        { name: 'proxy_local', why: "Proxy ID, hangi trafiğin şifreleneceğini belirler. <b>Route-based</b> VPN'de bile karşı taraf policy-based ise Proxy ID zorunludur.", label: 'Proxy ID — Yerel Subnet', type: 'text', required: true, placeholder: '10.64.10.0/24', hint: 'Bu taraftaki ilgili subnet' },
                        { name: 'proxy_remote', why: "İki tarafın Proxy ID'leri <b>ayna</b> olmalı: senin local'in karşının remote'u. Uyuşmazlık Phase 2'nin kurulmamasına yol açar.", label: 'Proxy ID — Uzak Subnet', type: 'text', required: true, placeholder: '10.128.20.0/24', hint: 'Karşı taraftaki ilgili subnet' },
                        { name: 'tun_zone', why: "Tünel arayüzü de bir zone'a üye olmalıdır; zone'suz tunnel arayüzü up olsa bile trafik işlemez. Ayrı bir <code>vpn</code> zone'u, tünel trafiğini kural düzeyinde LAN'dan ayırır.", label: 'Tünel Zone\'u', type: 'text', optional: true, placeholder: 'vpn', hint: 'Tunnel arayüzünün atanacağı zone (ör: vpn)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaIpsecGen(data);
        });
    }
};
function cgPaIpsecGen(data) {
    const ikeProf = cgEsc(data.ike_profile || ''), ipsecProf = cgEsc(data.ipsec_profile || '');
    const gwName = cgEsc(data.gw_name || ''), gwIface = cgEsc(data.gw_iface || '');
    const peerIp = cgEsc(data.peer_ip || ''), ikeVer = data.ike_ver === 'ikev1' ? 'ikev1' : 'ikev2';
    // Tırnak içi: önce \\ ve \" kaçırması, sonra cgEsc (çıktı gösterilirken tek kez çözülür)
    const pskRaw = String(data.psk || ''), psk = cgEsc(pskRaw.replace(/\\/g, '\\\\').replace(/"/g, '\\"'));
    const ikeEnc = cgEsc(data.ike_enc || 'aes-256-cbc'), ikeHash = cgEsc(data.ike_hash || 'sha256'), dhGrp = cgEsc(data.dh_grp || 'group14');
    const tunName = cgEsc(data.tunnel_name || ''), tunIface = cgEsc(data.tunnel_iface || ''), tunZone = cgEsc(String(data.tun_zone || '').trim());
    const proxyLocal = cgEsc(data.proxy_local || ''), proxyRemote = cgEsc(data.proxy_remote || '');
    const w = [];
    [['IKE crypto profil adı', data.ike_profile], ['IPSec crypto profil adı', data.ipsec_profile], ['IKE gateway adı', data.gw_name], ['Tünel adı', data.tunnel_name]].forEach(([l, v]) => _paWName(l, v, w));
    if (tunIface && !/^tunnel\.\d+$/.test(tunIface)) w.push('⛔ Tünel arayüzü adı tunnel.<sayı> biçiminde olmalı (ör. tunnel.1): "' + tunIface + '".');
    if (/["\\]/.test(pskRaw)) w.push('⛔ Pre-shared key çift tırnak ya da ters bölü içeriyor: CLI\'da tırnaklı değer bu karakterlerde bölünür. Bu karakterleri kullanmayın ya da anahtarı web arayüzünden girin.');
    if (pskRaw.length && pskRaw.length < 12) w.push('⚠ Pre-shared key ' + pskRaw.length + ' karakter: en az 20 karakterlik rastgele bir anahtar kullanın.');
    if (ikeHash === 'sha1') w.push('⚠ SHA-1 zayıf kabul ediliyor; iki tarafta da sha256 ya da üstünü kullanın.');
    if (dhGrp === 'group5') w.push('⚠ DH group 5 (1536 bit) kırılabilir kabul ediliyor; en az group14, tercihen group19/20.');
    if (ikeVer === 'ikev1') w.push('ℹ IKEv1 eski cihazlar içindir; karşı taraf destekliyorsa IKEv2 kullanın.');
    const pl = _paWNet(data.proxy_local), pr = _paWNet(data.proxy_remote);
    if (pl && pr && pl.ip === pr.ip && pl.len === pr.len) w.push('⛔ Yerel ve uzak Proxy ID aynı ağ: faz 2 kurulmaz.');
    else if (pl && pr && _paWOverlap(pl, pr)) w.push('⚠ Yerel ve uzak ağ çakışıyor: uzak ağa giden rota yerel ağı da kapsar; iki uçta NAT ya da farklı adresleme gerekir.');
    [['Yerel', pl], ['Uzak', pr]].forEach(([l, n]) => { if (_paWHostBits(n)) w.push('⚠ ' + l + ' Proxy ID\'de host bitleri dolu (' + n.ip + '/' + n.len + '): ağ adresi yazın; karşı taraf ayna değeri beklerken uyuşmazlık faz 2\'yi durdurur.'); });
    if (!tunZone) w.push('⚠ Tünel arayüzü için zone verilmedi: zone\'suz tunnel arayüzü trafik geçirmez. Arayüzü bir zone\'a (ör. vpn) ekleyin ve o zone ile LAN arasında güvenlik kuralı yazın.');
    let c = '# ========================================\n# Palo Alto — IPSec VPN Configuration\n# ========================================\n\n';
    const ike = 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '"';
    c += '# IKE Crypto Profile (faz 1)\n' + ike + ' dh-group ' + dhGrp + '\n' + ike + ' hash ' + ikeHash + '\n' + ike + ' encryption ' + ikeEnc + '\n' + ike + ' lifetime hours 8\n\n';
    const ips = 'set network ike crypto-profiles ipsec-crypto-profiles "' + ipsecProf + '"';
    c += '# IPSec Crypto Profile (faz 2; dh-group = PFS)\n' + ips + ' esp authentication ' + ikeHash + '\n' + ips + ' esp encryption ' + ikeEnc + '\n' + ips + ' dh-group ' + dhGrp + '\n' + ips + ' lifetime hours 1\n\n';
    const gw = 'set network ike gateway "' + gwName + '"';
    c += '# IKE Gateway\n' + gw + ' local-address interface ' + gwIface + '\n';
    c += gw + ' peer-address ip ' + peerIp + '\n';
    // Anahtar ham yazılır (HTML kaçışı anahtarı bozar: & → &amp;); boşluk ve özel karakter için tırnak içinde
    c += gw + ' authentication pre-shared-key key "' + psk + '"\n';
    c += gw + ' protocol version ' + ikeVer + '\n';
    c += gw + ' protocol ' + ikeVer + ' ike-crypto-profile "' + ikeProf + '"\n\n';
    c += '# Tunnel Interface (zone + virtual router olmadan trafik geçmez)\nset network interface tunnel units ' + tunIface + '\n';
    if (tunZone) c += 'set zone ' + tunZone + ' network layer3 ' + tunIface + '\n';
    c += 'set network virtual-router default interface ' + tunIface + '\n\n';
    const tn = 'set network tunnel ipsec "' + tunName + '"';
    c += '# IPSec Tunnel\n' + tn + ' tunnel-interface ' + tunIface + '\n';
    c += tn + ' auto-key ike-gateway "' + gwName + '"\n';
    c += tn + ' auto-key ipsec-crypto-profile "' + ipsecProf + '"\n\n';
    c += '# Proxy ID (karşı taraf policy-based ise gerekli; iki uçta ayna olmalı)\n';
    c += tn + ' auto-key proxy-id "proxy1" local ' + proxyLocal + '\n';
    c += tn + ' auto-key proxy-id "proxy1" remote ' + proxyRemote + '\n\n';
    c += '# Uzak ağa rota (route-based VPN: trafik tünel arayüzüne yönlendirilir)\n';
    c += 'set network virtual-router default routing-table ip static-route "VPN-' + tunName + '" destination ' + proxyRemote + '\n';
    c += 'set network virtual-router default routing-table ip static-route "VPN-' + tunName + '" interface ' + tunIface + '\n';
    c += '\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# test vpn ike-sa gateway "' + gwName + '"\n# show vpn ike-sa gateway "' + gwName + '"\n# show vpn ipsec-sa tunnel "' + tunName + '"\n# show vpn flow name "' + tunName + '"\n# less mp-log ikemgr.log\n';
    w.push('ℹ Tünel trafiği için iki yönlü güvenlik kuralı gerekir (LAN zone ↔ ' + (tunZone || 'tünel zone\'u') + '); site-to-site trafikte kaynak NAT uygulanmamalı, aksi hâlde Proxy ID eşleşmez.');
    w.push(_PAW_VRNOTE);
    return { config: c, warnings: w };
}

// ── Palo Alto: Threat Prevention Profiles ────────────────────────────────────
PaloAlto.threatprev = {
    label: 'Threat Prevention',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bug',
                title: 'Threat Prevention Profilleri (PAN-OS)',
                desc: 'Antivirus, Vulnerability Protection, Anti-Spyware ve WildFire Analysis profilleri oluştur ve security rule\'a bağla. Kurumsal güvenlik temeli.',
            },
            sections: [
                {
                    title: 'Profil Adları',
                    icon: 'fas fa-shield-virus',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'av_name', why: 'Antivirus profili kurala <b>bağlanmalıdır</b>; oluşturmak tek başına korumaz. Profilsiz kural hiçbir tarama yapmaz.', label: 'Antivirus Profil', type: 'text', required: true, placeholder: 'corp-av', hint: 'FTP/HTTP/SMTP trafiğini tarar' },
                        { name: 'vp_name', why: "Vulnerability Protection, exploit denemelerini durdurur. Üretimde önce <code>alert</code> ile izleyip sonra <code>block</code>'a geçmek kesintiyi önler.", label: 'Vulnerability Protection Profil', type: 'text', required: true, placeholder: 'strict-vp', hint: 'CVE tabanlı exploit koruması' },
                        { name: 'spy_name', why: 'Anti-Spyware, C2 (command-and-control) trafiğini yakalar. <b>DNS Sinkhole</b> özelliğini açmak, enfekte iç makineyi tespit etmenin en pratik yoludur.', label: 'Anti-Spyware Profil', type: 'text', required: true, placeholder: 'corp-spyware', hint: 'C2 trafiği ve spyware tespiti' },
                        { name: 'wf_name', why: 'WildFire bilinmeyen dosyaları buluta gönderip analiz eder. Gizlilik kısıtı olan kurumlarda hangi dosya tiplerinin gönderileceği dikkatle seçilmelidir.', label: 'WildFire Analysis Profil', type: 'text', required: true, placeholder: 'corp-wildfire', hint: 'Bilinmeyen dosyaları bulut analizine gönderir' }
                    ]
                },
                {
                    title: 'Security Rule Binding',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'rule_name', why: 'Kurallar yukarıdan aşağıya değerlendirilir, <b>ilk eşleşen</b> uygulanır. Sonda iki gizli kural vardır: intrazone-default (allow) ve interzone-default (deny).', label: 'Kural Adı', type: 'text', required: true, placeholder: 'OUTBOUND-WEB', hint: 'Profillerin bağlanacağı mevcut security rule adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaThreatPrevGen(data);
        });
    }
};
function cgPaThreatPrevGen(data) {
    const avName = cgEsc(data.av_name || ''), vpName = cgEsc(data.vp_name || '');
    const spyName = cgEsc(data.spy_name || ''), wfName = cgEsc(data.wf_name || ''), ruleName = cgEsc(data.rule_name || '');
    let c = '# ========================================\n# Palo Alto — Threat Prevention Profiles\n# ========================================\n\n';
    c += '# 1. Antivirus Profil\nset profiles virus "' + avName + '" description "Corporate AV"\n';
    c += 'set profiles virus "' + avName + '" decoder ftp action default\n';
    c += 'set profiles virus "' + avName + '" decoder http action default\n';
    c += 'set profiles virus "' + avName + '" decoder smtp action default\n\n';
    c += '# 2. Vulnerability Protection Profil\nset profiles vulnerability "' + vpName + '" description "Strict VP"\n';
    c += 'set profiles vulnerability "' + vpName + '" rules "block-critical" severity [ critical high ] action block-ip duration 300\n';
    c += 'set profiles vulnerability "' + vpName + '" rules "alert-medium" severity [ medium ] action alert\n\n';
    c += '# 3. Anti-Spyware Profil\nset profiles spyware "' + spyName + '" description "Corporate Anti-Spyware"\n';
    c += 'set profiles spyware "' + spyName + '" rules "block-critical" severity [ critical high ] action block-ip duration 300\n';
    c += 'set profiles spyware "' + spyName + '" rules "sinkhole-medium" severity [ medium ] action sinkhole\n\n';
    c += '# 4. WildFire Analysis Profil\nset profiles wildfire-analysis "' + wfName + '" description "Corporate WildFire"\n';
    c += 'set profiles wildfire-analysis "' + wfName + '" rules "forward-all" application any file-type any direction both analysis public-cloud\n\n';
    c += '# 5. Security Rule\'e Profilleri Bağla\nset rulebase security rules "' + ruleName + '" profile-setting profiles virus "' + avName + '"\n';
    c += 'set rulebase security rules "' + ruleName + '" profile-setting profiles vulnerability "' + vpName + '"\n';
    c += 'set rulebase security rules "' + ruleName + '" profile-setting profiles spyware "' + spyName + '"\n';
    c += 'set rulebase security rules "' + ruleName + '" profile-setting profiles wildfire-analysis "' + wfName + '"\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show profiles virus "' + avName + '"\n# show profiles vulnerability "' + vpName + '"\n# show rulebase security rules "' + ruleName + '"\n';
    return c;
}

// ── Palo Alto: URL Filtering Profile ─────────────────────────────────────────
PaloAlto.urlfilter = {
    label: 'URL Filtering',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'URL Filtering Profili (PAN-OS)',
                desc: 'Kategori bazlı URL filtreleme profili — engelleme, uyarı ve safe search konfigürasyonu. Security rule\'a bağlanarak etkinleşir.',
            },
            sections: [
                {
                    title: 'Profil Ayarları',
                    icon: 'fas fa-globe-europe',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'profile_name', why: "Profil oluşturmak yetmez, bir güvenlik kuralına bağlanmalı. Bağlanmamış profil hiçbir trafiği denetlemez — arayüzde tanımlı görünse bile koruma yoktur.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'corp-urlfilter', hint: 'URL filtering profili adı' },
                        { name: 'block_cats', why: "Kategori engelleme. HTTPS trafiğinde kategori tespiti için <b>decryption</b> gerekebilir; decrypt edilmeyen trafikte yalnızca SNI'ye bakılır.", label: 'Engellenen Kategoriler', type: 'text', required: true, placeholder: 'adult gambling malware phishing', hint: 'Boşlukla ayrılmış PAN-OS kategori adları' },
                        { name: 'alert_cats', why: "Yalnızca <code>alert</code> seçilen kategoriler loglanır, <b>engellenmez</b>. Doğru sıralama önce alert ile izleyip yanlış pozitifleri ayıklamak, sonra block'a geçmektir.", label: 'Uyarı Kategorileri', type: 'text', optional: true, placeholder: 'social-networking games', hint: 'Engellenmez, sadece loglanır (boşlukla ayrılmış)' },
                        { name: 'safe_search', why: 'Arama motorlarında güvenli aramayı zorunlu kılar. Çalışması için ilgili arama motorunun HTTPS trafiğinin decrypt edilmesi gerekir.', label: 'Safe Search', type: 'select', options: [
                            { value: 'strict', label: 'strict', selected: true },
                            { value: 'moderate', label: 'moderate' },
                            { value: 'off', label: 'off' }
                        ], hint: 'Arama motorlarında safe search zorunluluğu' }
                    ]
                },
                {
                    title: 'Rule Binding',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'rule_name', why: 'Kurallar yukarıdan aşağıya değerlendirilir, <b>ilk eşleşen</b> uygulanır. Sonda iki gizli kural vardır: intrazone-default (allow) ve interzone-default (deny).', label: 'Security Rule Adı', type: 'text', required: true, placeholder: 'OUTBOUND-WEB', hint: 'Profil bağlanacak security rule' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaUrlFilterGen(data);
        });
    }
};
function cgPaUrlFilterGen(data) {
    const pname = cgEsc(data.profile_name || ''), blockCats = cgEsc(data.block_cats || '');
    const alertCats = cgEsc(data.alert_cats || ''), safeSearch = cgEsc(data.safe_search || 'strict');
    const ruleName = cgEsc(data.rule_name || '');
    let c = '# ========================================\n# Palo Alto — URL Filtering Profile\n# ========================================\n\n';
    c += 'set profiles url-filtering "' + pname + '" description "Corporate URL Filter"\n';
    blockCats.split(/\s+/).filter(Boolean).forEach(cat => {
        c += 'set profiles url-filtering "' + pname + '" action block category ' + cat + '\n';
    });
    if (alertCats) {
        alertCats.split(/\s+/).filter(Boolean).forEach(cat => {
            c += 'set profiles url-filtering "' + pname + '" action alert category ' + cat + '\n';
        });
    }
    c += 'set profiles url-filtering "' + pname + '" safe-search-enforcement yes\n';
    c += 'set profiles url-filtering "' + pname + '" log-container-page-only yes\n\n';
    c += '# Security Rule\'e URL Filter Bağla\nset rulebase security rules "' + ruleName + '" profile-setting profiles url-filtering "' + pname + '"\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show profiles url-filtering "' + pname + '"\n# show rulebase security rules "' + ruleName + '"\n';
    return c;
}

// ── Palo Alto: GlobalProtect VPN ──────────────────────────────────────────────
PaloAlto.globalprotect = {
    label: 'GlobalProtect VPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'GlobalProtect VPN (PAN-OS)',
                desc: 'Kurumsal SSL-VPN çözümü — Portal, Gateway ve IP Pool konfigürasyonu. Uzak kullanıcıların şirket ağına güvenli bağlantısı için kullanılır.',
            },
            sections: [
                {
                    title: 'Portal',
                    icon: 'fas fa-door-open',
                    badge: { text: 'Enterprise', cls: 'advanced' },
                    fields: [
                        { name: 'portal_iface', why: 'Portal, istemcinin ilk bağlandığı ve config indirdiği noktadır. Gateway ile aynı arayüzde olabilir ama sertifikası geçerli olmalıdır.', label: 'Portal Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1', hint: 'Kullanıcıların bağlandığı WAN arayüzü' },
                        { name: 'portal_ip', why: "Portal IP'si kullanıcıların dışarıdan ulaşabileceği adres olmalı ve sertifikanın CN/SAN alanı bu adla eşleşmeli. Uyuşmazlık, istemcide sertifika uyarısı ve bağlantı reddi demektir.", label: 'Portal IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'Portal erişim IP adresi (public)' }
                    ]
                },
                {
                    title: 'Gateway',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'gw_name', why: "Gateway adı istemci yapılandırmasına gömülür. Sonradan değiştirmek, dağıtılmış tüm GlobalProtect istemci profillerinin güncellenmesini gerektirir.", label: 'Gateway Adı', type: 'text', required: true, placeholder: 'GP-GW-EXT', hint: 'GlobalProtect Gateway nesne adı' },
                        { name: 'gw_iface', why: "Gateway'in dinleyeceği arayüz. Portal ile aynı IP üzerinde çalışabilir ama sertifika ve port çakışmalarına dikkat et; çakışma sessiz bağlantı hatası üretir.", label: 'Gateway Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1', hint: 'Gateway bağlantı arayüzü' },
                        { name: 'tun_iface', why: "GlobalProtect tünel arayüzü de bir zone'a atanmalı. VPN kullanıcıları için ayrı bir zone açmak, kural yazarken onları iç kullanıcılardan ayırmanı sağlar.", label: 'Tunnel Interface', type: 'text', validate: 'iface', required: true, placeholder: 'tunnel.10', hint: 'Kullanıcı oturumları için tünel arayüzü (ör: tunnel.10)' }
                    ]
                },
                {
                    title: 'IP Pool ve DNS',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'pool_start', why: 'VPN istemcilerine dağıtılacak IP havuzu. İç ağdaki hiçbir subnet ile <b>çakışmamalı</b>, aksi halde yönlendirme kırılır.', label: 'Pool Başlangıç', type: 'text', validate: 'ip', required: true, placeholder: '10.210.0.1', hint: 'VPN kullanıcıları için IP aralığı başlangıcı' },
                        { name: 'pool_end', why: "Havuz tükendiğinde yeni kullanıcılar <b>sessizce</b> bağlanamaz. Havuzu iç ağlarla çakışmayan ve yönlendirmede duyurulan bir bloktan seç, yoksa dönüş trafiği kaybolur.", label: 'Pool Bitiş', type: 'text', validate: 'ip', required: true, placeholder: '10.210.0.254', hint: 'VPN kullanıcıları için IP aralığı bitişi' },
                        { name: 'dns', why: "İstemcilere verilecek DNS. İç kaynaklara isimle erişim için iç DNS sunucusu verilmelidir; aksi halde kullanıcılar 'VPN bağlı ama hiçbir şeye erişemiyorum' der.", label: 'DNS Server', type: 'text', validate: 'ip', optional: true, placeholder: '8.8.8.8', hint: 'VPN istemcilerine atanacak DNS sunucu' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaGlobalProtectGen(data);
        });
    }
};
function cgPaGlobalProtectGen(data) {
    const portalIface = cgEsc(data.portal_iface || ''), portalIp = cgEsc(data.portal_ip || '');
    const gwName = cgEsc(data.gw_name || ''), gwIface = cgEsc(data.gw_iface || ''), tunIface = cgEsc(data.tun_iface || '');
    const poolStart = cgEsc(data.pool_start || ''), poolEnd = cgEsc(data.pool_end || ''), dns = cgEsc(data.dns || '');
    let c = '# ========================================\n# Palo Alto — GlobalProtect VPN\n# ========================================\n\n';
    c += '# 1. Tunnel Interface\nset network interface tunnel units ' + tunIface + '\nset network interface tunnel units ' + tunIface + ' ip 0.0.0.0/0\n\n';
    c += '# 2. GlobalProtect Portal\nset global-protect global-protect-portal GP-PORTAL interface ' + portalIface + '\n';
    c += 'set global-protect global-protect-portal GP-PORTAL client-config configs "default" gateways external-list "' + gwName + '" address ' + portalIp + '\n\n';
    c += '# 3. GlobalProtect Gateway\nset global-protect global-protect-gateway "' + gwName + '" interface ' + gwIface + '\n';
    c += 'set global-protect global-protect-gateway "' + gwName + '" tunnel-interface ' + tunIface + '\n';
    c += 'set global-protect global-protect-gateway "' + gwName + '" ip-pool ' + poolStart + '-' + poolEnd + '\n';
    if (dns) c += 'set global-protect global-protect-gateway "' + gwName + '" dns-server primary ' + dns + '\n';
    c += '\n# 4. Virtual Router — Tunnel Ekle\nset network virtual-router default interface [ ' + tunIface + ' ]\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show global-protect-gateway current-user\n# show global-protect-portal current-user\n# debug global-protect gateway enable\n';
    return c;
}

// ── Palo Alto: HA Active-Passive ──────────────────────────────────────────────
PaloAlto.ha = {
    label: 'HA Active-Passive',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'HA Active-Passive (PAN-OS)',
                desc: 'Palo Alto yüksek erişilebilirlik — HA1 (control) ve HA2 (data sync) link konfigürasyonu. Primary/Secondary rol seçimi yapın.'
            },
            sections: [
                {
                    title: 'HA Rol ve Grup',
                    icon: 'fas fa-crown',
                    fields: [
                        { name: 'ha_role', why: "Active-Passive'de yalnızca bir cihaz trafik işler. İki cihazın <b>aynı PAN-OS sürümünde</b> ve aynı donanım modelinde olması gerekir.", label: 'Rol', type: 'select', options: [
                            { value: 'primary', label: 'Primary (Active)', selected: true },
                            { value: 'secondary', label: 'Secondary (Passive)' }
                        ], hint: 'Primary cihaza düşük device-priority atanır (10), secondary\'ye 100: PAN-OS\'ta düşük değer kazanır' },
                        { name: 'grp_id', why: 'Group ID aynı L2 segmentindeki farklı HA çiftlerinde benzersiz olmalıdır; çakışma iki çiftin birbirini üye sanmasına yol açar.', label: 'Group ID (1-63)', type: 'text', required: true, placeholder: '1', hint: 'Her iki cihazda aynı group ID kullanılmalı' },
                        { name: 'preemptive', why: 'Açıkken birincil cihaz döndüğünde rolü geri alır — bu ikinci bir kesinti demektir. Çoğu kurulumda <b>kapalı</b> bırakmak daha az kesinti üretir.', label: 'Preemptive?', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Preempt açık iken primary düzelince geri devralır' }
                    ]
                },
                {
                    title: 'HA1 Interface (Control)',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'ha1_iface', why: 'HA1 kontrol kanalıdır (heartbeat, config senkronu). Üyeler arasında <b>doğrudan</b> bağlanmalı; switch üzerinden geçerse split-brain riski doğar.', label: 'HA1 Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/3', hint: 'HA control link arayüzü' },
                        { name: 'ha1_ip', why: "HA1 kontrol bağlantısıdır; kopması split-brain riski doğurur. Mümkünse doğrudan kablo ya da ayrı bir yol kullan, üretim switch'i üzerinden geçirme.", label: 'HA1 IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.222.1.1/30', hint: 'Bu cihazın HA1 IP adresi' },
                        { name: 'ha1_peer', why: "Peer IP yanlışsa HA hiç kurulmaz ve iki cihaz da kendini aktif sanar. Her iki cihazda karşılıklı doğru girildiğini mutlaka teyit et.", label: 'HA1 Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.222.1.2', hint: 'Karşı cihazın HA1 IP adresi (group peer-ip)' }
                    ]
                },
                {
                    title: 'HA2 Interface (Data Sync)',
                    icon: 'fas fa-sync',
                    fields: [
                        { name: 'ha2_iface', why: 'HA2 veri kanalıdır (session senkronu). Kopması failover sırasında mevcut oturumların düşmesine yol açar.', label: 'HA2 Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/4', hint: 'HA data sync link arayüzü' },
                        { name: 'ha2_ip', why: "HA2 oturum senkronizasyonu taşır ve HA1 ile <b>aynı</b> alt ağda olmamalı. Aynı ağa koymak yönlendirme belirsizliği ve sessiz sync kaybı yaratır.", label: 'HA2 IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.222.2.1/30', hint: 'Bu cihazın HA2 IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaHaGen(data);
        });
    }
};
function cgPaHaGen(data) {
    const role = data.ha_role === 'secondary' ? 'secondary' : 'primary';
    const ha1Iface = cgEsc(data.ha1_iface || ''), ha2Iface = cgEsc(data.ha2_iface || '');
    const ha1Peer = cgEsc(String(data.ha1_peer || '').trim());
    const grpId = String(data.grp_id || '').trim(), preemptive = data.preemptive === 'no' ? 'no' : 'yes';
    const n1 = _paWNet(data.ha1_ip), n2 = _paWNet(data.ha2_ip);
    const w = [];
    if (grpId && !(/^\d+$/.test(grpId) && +grpId >= 1 && +grpId <= 63)) w.push('⛔ Group ID 1–63 arasında bir sayı olmalı ("' + grpId + '").');
    if (!n1) w.push('⛔ HA1 IP\'si IP/önek biçiminde olmalı (ör. 10.222.1.1/30); PAN-OS adresi ve maskeyi ayrı alanlara yazar.');
    if (!n2) w.push('⛔ HA2 IP\'si IP/önek biçiminde olmalı (ör. 10.222.2.1/30).');
    if (n1 && ha1Peer === n1.ip) w.push('⛔ HA1 IP\'si ile eş (peer) IP aynı: iki üye farklı adres kullanmalı.');
    if (n1 && _paWIsIp(ha1Peer) && !_paWIn(ha1Peer, n1)) w.push('⚠ Eş IP (' + ha1Peer + ') HA1 alt ağında değil: HA1 bağlantısı ancak HA1 için ağ geçidi tanımlanırsa kurulur; doğrudan kabloda aynı alt ağı kullanın.');
    if (n1 && n2 && _paWOverlap(n1, n2)) w.push('⚠ HA1 ve HA2 aynı alt ağda: iki bağlantıyı ayrı alt ağlara koyun.');
    if (ha1Iface && ha1Iface === ha2Iface) w.push('⛔ HA1 ve HA2 aynı arayüz olamaz.');
    w.push('ℹ PAN-OS\'ta DÜŞÜK device-priority kazanır: bu araç primary\'ye 10, secondary\'ye 100 verir. Preemptive iki üyede de aynı olmalı; yalnız birinde açıksa etkisizdir.');
    w.push('ℹ Kontrollü failover: önce show high-availability state\'te "Running Configuration: synchronized" olduğundan emin olun (değilse request high-availability sync-to-remote running-config), sonra aktif üyede request high-availability state suspend; bakım bitince request high-availability state functional (pan-15).');
    w.push('ℹ Karşı üyede aynı group-id ve mode, kendi HA1/HA2 adresleri ve bu cihazın HA1 IP\'si peer-ip olarak yazılır. İki üye aynı model ve aynı PAN-OS sürümünde olmalı.');
    const g = 'set deviceconfig high-availability group';
    let c = '# ========================================\n# Palo Alto — HA Active-Passive (' + (role === 'primary' ? 'Primary' : 'Secondary') + ')\n# ========================================\n\n';
    c += '# PAN-OS 8.1+ sözdizimi (group altında group-id; peer-ip grup düzeyinde)\n';
    c += 'set deviceconfig high-availability enabled yes\n';
    c += g + ' group-id ' + cgEsc(grpId) + '\n';
    c += g + ' peer-ip ' + ha1Peer + '\n';
    c += g + ' mode active-passive\n';
    c += g + ' election-option device-priority ' + (role === 'primary' ? '10' : '100') + '\n';
    c += g + ' election-option preemptive ' + preemptive + '\n';
    c += g + ' state-synchronization enabled yes\n\n';
    c += '# HA1 (kontrol) ve HA2 (oturum senkronu) bağlantıları\n';
    c += 'set deviceconfig high-availability interface ha1 port ' + ha1Iface + '\n';
    c += 'set deviceconfig high-availability interface ha1 ip-address ' + (n1 ? n1.ip : '') + '\n';
    c += 'set deviceconfig high-availability interface ha1 netmask ' + (n1 ? _paWMask(n1.len) : '') + '\n';
    c += 'set deviceconfig high-availability interface ha2 port ' + ha2Iface + '\n';
    c += 'set deviceconfig high-availability interface ha2 ip-address ' + (n2 ? n2.ip : '') + '\n';
    c += 'set deviceconfig high-availability interface ha2 netmask ' + (n2 ? _paWMask(n2.len) : '') + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show high-availability all\n# show high-availability state\n# show high-availability state-synchronization\n';
    return { config: c, warnings: w };
}

// ── Palo Alto: Interface (L3/VLAN/Loopback) ───────────────────────────────────
PaloAlto.interface = {
    label: 'Interface (L3/VLAN/Loopback)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'Interface Yapılandırması (PAN-OS)',
                desc: 'Layer3, VLAN sub-interface veya Loopback arayüz konfigürasyonu. Zone ataması ve Virtual Router entegrasyonu dahil.'
            },
            sections: [
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'intf_name', why: "Arayüz adları sabittir (<code>ethernet1/1</code>); alt arayüzde <code>.100</code> gibi bir etiket eklenir. Bu etiketi VLAN ID ile aynı tutmamak sorun gidermeyi gereksizce zorlaştırır.", label: 'Interface Adı', type: 'text', required: true, placeholder: 'ethernet1/3', hint: 'PAN-OS formatı: ethernet1/3, loopback.1' },
                        { name: 'intf_type', why: '<b>Layer3</b> yönlendirir, <b>Layer2</b> köprüler, <b>Virtual Wire</b> şeffaf geçer, <b>Tap</b> sadece dinler. Tip sonradan değiştirilince bağlı tüm config sıfırlanır.', label: 'Interface Tipi', type: 'select', options: [
                            { value: 'layer3', label: 'Layer 3', selected: true },
                            { value: 'vlan', label: 'VLAN Alt Arayüzü (802.1Q)' },
                            { value: 'loopback', label: 'Loopback' }
                        ], hint: 'Layer3 fiziksel port; VLAN alt arayüzü için VLAN ID gerekir (ethernet1/2 → ethernet1/2.100)' },
                        { name: 'ip_prefix', why: "PAN-OS CIDR bekler (<code>/24</code>), nokta-ondalık maske değil. Yanlış prefix yönetim erişimini commit anında koparabilir.", label: 'IP / Prefix (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' },
                        { name: 'zone', why: "Zone atanmamış arayüz trafiği <b>tamamen</b> düşürür. Zone'u sonradan değiştirmek ise o arayüze referans veren tüm kuralları geçersiz kılar.", label: 'Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Arayüzün atanacağı zone adı' },
                        { name: 'description', why: "Çok portlu bir cihazda hangi kablonun nereye gittiğini söyleyen tek kayıt budur. Boş bırakılan portlar, arıza anında en çok zaman kaybettiren yerdir.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN Link', hint: 'İsteğe bağlı arayüz açıklaması' },
                        { name: 'mtu', why: 'Varsayılan 1500. IPSec tünelleri üzerinden geçen trafikte MTU/MSS ayarı yapılmazsa büyük paketler parçalanır ve uygulamalar yavaşlar.', label: 'MTU', type: 'text', optional: true, placeholder: '1500', hint: 'MTU değeri (varsayılan 1500, VLAN için 1400–1500)' },
                        { name: 'vlan_id', why: "Alt arayüzdeki VLAN etiketi karşı switch'in trunk'ında izinli olmalı. Uyuşmazlıkta arayüz up görünür ama tek bir paket bile gelmez.", label: 'VLAN ID', type: 'text', validate: 'vlan', optional: true, placeholder: '100', hint: 'Yalnızca VLAN tipi seçildiyse gerekli' },
                        { name: 'vr', why: "Arayüz bir sanal yönlendiriciye (virtual-router) eklenmezse bağlı ağı rota tablosuna girmez ve o arayüzden gelen paket için rota bulunamaz — arayüz up görünür ama trafik geçmez (pan-02).", label: 'Virtual Router', type: 'text', optional: true, placeholder: 'default', hint: 'Arayüzün ekleneceği VR (genellikle default)' },
                        { name: 'mp_name', why: "Veri arayüzleri varsayılan olarak cihazın kendisine gelen ping/SSH/HTTPS'e cevap vermez; hangi hizmetin açık olacağını arayüz yönetim profili belirler (pan-02).", label: 'Yönetim Profili Adı', type: 'text', optional: true, placeholder: 'MGMT-PING-SSH', hint: 'interface-management-profile adı (opsiyonel)' },
                        { name: 'mp_services', why: "Yalnız gereken hizmeti açın. <code>telnet</code> ve <code>http</code> şifresizdir; internete bakan arayüzde ssh/https açmak saldırı yüzeyidir.", label: 'Yönetim Hizmetleri', type: 'text', optional: true, placeholder: 'ping ssh https', hint: 'Boşlukla: ping ssh https snmp …' },
                        { name: 'mp_permitted', why: "permitted-ip verilmezse profil hizmetleri arayüze erişebilen her adrese açıktır. Yönetim ağını (ör. 10.64.0.0/16) yazarak sınırlayın.", label: 'İzinli Kaynak (permitted-ip)', type: 'text', optional: true, placeholder: '10.64.0.0/16', hint: 'Yönetime izinli ağlar; boşluk veya virgülle' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaInterfaceGen(data);
        });
    }
};
function cgPaInterfaceGen(data) {
    const t = ['layer3', 'vlan', 'loopback'].includes(data.intf_type) ? data.intf_type : 'layer3';
    const raw = String(data.intf_name || '').trim(), vlanId = String(data.vlan_id || '').trim();
    const ipPrefix = cgEsc(data.ip_prefix || ''), zone = cgEsc(String(data.zone || '').trim()), vr = cgEsc(String(data.vr || '').trim());
    const description = cgEsc(data.description || ''), mtu = String(data.mtu || '').trim();
    const w = [];
    // Alt arayüz adı: <fiziksel>.<etiket> (ör. ethernet1/2.100); yalnız fiziksel ad verilirse etiket eklenir
    let parent = raw, name = raw;
    if (t === 'vlan') {
        const m = raw.match(/^(.+)\.(\d+)$/);
        parent = m ? m[1] : raw;
        name = m ? raw : raw + '.' + (vlanId || '<VLAN-ID>');
        if (!vlanId && !m) w.push('⛔ VLAN alt arayüzü için VLAN ID (tag) gerekli: etiketsiz alt arayüz trafik almaz.');
        if (!vlanId && m) w.push('ℹ VLAN ID verilmedi: tag, alt arayüz numarasından (' + m[2] + ') alındı.');
        if (m && vlanId && m[2] !== vlanId) w.push('ℹ Alt arayüz numarası (' + m[2] + ') ile VLAN tag (' + vlanId + ') farklı: çalışır ama sorun gidermede karışıklık yaratır; aynı tutun.');
    }
    const N = cgEsc(name), P = cgEsc(parent);
    if (t === 'loopback' && !/^loopback\.\d+$/.test(raw)) w.push('⛔ Loopback arayüzü adı loopback.<sayı> biçiminde olmalı (ör. loopback.1): "' + raw + '".');
    if (t !== 'loopback' && raw && !/^(ethernet\d+\/\d+|ae\d+)(\.\d+)?$/.test(raw)) w.push('⚠ Arayüz adı PAN-OS biçiminde görünmüyor (ethernet1/3, ethernet1/3.100 ya da ae1): "' + raw + '".');
    if (t === 'layer3' && /\.\d+$/.test(raw)) w.push('⚠ Ad bir alt arayüz (' + raw + '): Layer 3 yerine "VLAN Alt Arayüzü" tipini seçin; fiziksel arayüz komutu alt arayüz adıyla çalışmaz.');
    const n = _paWNet(data.ip_prefix);
    if (_paWNetOrBcast(n)) w.push('⛔ Arayüz IP\'si alt ağın ağ ya da yayın adresi (' + n.ip + '/' + n.len + ').');
    if (t === 'loopback' && n && n.len !== 32) w.push('⚠ Loopback adresi /' + n.len + ': loopback için /32 kullanın; daha geniş önek, aynı ağdaki gerçek hostlara giden trafiği yutabilir.');
    if (mtu && !(/^\d+$/.test(mtu) && +mtu >= 576 && +mtu <= 9192)) w.push('⛔ MTU 576–9192 arasında bir sayı olmalı ("' + mtu + '").');
    if (!zone) w.push('⛔ Zone verilmedi: zone\'a üye olmayan arayüz trafik geçirmez (pan-02).');
    if (!vr) w.push('⚠ Virtual Router verilmedi: arayüz bir VR\'a eklenmezse bağlı ağı rota tablosuna girmez; "arayüz up ama trafik yok" arızasının klasik nedeni (pan-02).');
    // Arayüz yönetim profili (cihazın kendisine ping/SSH/HTTPS)
    const mpSvc = _paWList(data.mp_services).map(x => x.toLowerCase()), mpIp = _paWList(data.mp_permitted);
    let mp = cgEsc(String(data.mp_name || '').trim());
    if (!mp && mpSvc.length) { mp = 'MGMT-' + (zone || 'IF').toUpperCase(); w.push('ℹ Yönetim profili adı verilmedi: ' + mp + ' kullanıldı.'); }
    if (mp) _paWName('Yönetim profili adı', mp, w, 31);
    const unk = mpSvc.filter(x => _PAW_MP.indexOf(x) === -1);
    if (unk.length) w.push('⛔ Tanınmayan yönetim hizmeti: ' + unk.join(', ') + '. Geçerli: ' + _PAW_MP.join(' ') + '.');
    if (mpSvc.includes('telnet')) w.push('⚠ Yönetim profilinde telnet: parola ağda düz metin gider; yalnız ssh kullanın.');
    if (mpSvc.includes('http')) w.push('⚠ Yönetim profilinde http: web yönetimi şifresiz; yalnız https kullanın.');
    const mgmtSvc = mpSvc.filter(x => x !== 'ping' && x !== 'response-pages' && _PAW_MP.indexOf(x) !== -1);
    if (mgmtSvc.length && _paWUntrust(zone)) w.push('⚠ ' + zone + ' zone\'unda (internete bakan) ' + mgmtSvc.join(' ') + ' açılıyor: yönetimi internete açmayın; yalnız iç arayüzde ve permitted-ip ile (pan-02).');
    if (mgmtSvc.length && !mpIp.length) w.push('⚠ permitted-ip yok: ' + mgmtSvc.join(' ') + ' bu arayüze erişebilen HER adrese açık. Yönetim ağını permitted-ip ile sınırlayın.');
    mpIp.forEach(x => { const q = _paWNet(x) || (_paWIsIp(x) ? { ip: x, len: 32 } : null); if (!q) w.push('⛔ permitted-ip değeri IP ya da IP/önek olmalı: "' + x + '".'); else if (q.len === 0) w.push('⚠ permitted-ip 0.0.0.0/0: kısıtlama etkisiz.'); });
    if (mp && !mpSvc.length) w.push('ℹ Yalnız profil adı verildi: ' + mp + ' profili cihazda zaten tanımlı olmalı, yoksa commit "is not a valid reference" ile reddeder.');
    let c = '# ========================================\n# Palo Alto — Interface Configuration\n# ========================================\n\n';
    if (mp && mpSvc.length) {
        c += '# Arayüz yönetim profili\nset network profiles interface-management-profile ' + mp + ' ' + mpSvc.filter(x => _PAW_MP.indexOf(x) !== -1).map(x => cgEsc(x) + ' yes').join(' ') + '\n';
        mpIp.forEach(x => { c += 'set network profiles interface-management-profile ' + mp + ' permitted-ip ' + cgEsc(x) + '\n'; });
        c += '\n';
    }
    let ifBase;
    if (t === 'layer3') {
        ifBase = 'set network interface ethernet ' + N + ' layer3';
        c += ifBase + ' ip ' + ipPrefix + '\n';
        if (mtu) c += ifBase + ' mtu ' + cgEsc(mtu) + '\n';
        if (description) c += 'set network interface ethernet ' + N + ' comment ' + cgQ(data.description) + '\n';
    } else if (t === 'vlan') {
        // 802.1Q alt arayüz: fiziksel arayüz layer3 modunda (IP'siz), alt arayüz units altında tag + ip
        const m2 = raw.match(/^(.+)\.(\d+)$/);
        ifBase = 'set network interface ethernet ' + P + ' layer3 units ' + N;
        c += ifBase + ' tag ' + cgEsc(vlanId || (m2 ? m2[2] : '<VLAN-ID>')) + '\n';
        c += ifBase + ' ip ' + ipPrefix + '\n';
        if (mtu) c += ifBase + ' mtu ' + cgEsc(mtu) + '\n';
        if (description) c += ifBase + ' comment ' + cgQ(data.description) + '\n';
        w.push('ℹ Karşı switch portu trunk olmalı ve VLAN ' + (vlanId || '<id>') + '\'e izin vermeli; fiziksel arayüz ' + parent + ' IP\'siz layer3 modunda kalır.');
        w.push('ℹ Yeni alt arayüz ayrı bir zone\'daysa hem güvenlik kuralı hem kaynak NAT kuralı bu ağı kapsamalı; mevcut SNAT kuralı eski LAN ağıyla sınırlıysa yeni VLAN internete çıkamaz (pan-09).');
    } else {
        ifBase = 'set network interface loopback units ' + N;
        c += ifBase + ' ip ' + ipPrefix + '\n';
        if (mtu) c += ifBase + ' mtu ' + cgEsc(mtu) + '\n';
        if (description) c += ifBase + ' comment ' + cgQ(data.description) + '\n';
    }
    if (mp) c += ifBase + ' interface-management-profile ' + mp + '\n';
    if (zone) c += 'set zone ' + zone + ' network layer3 ' + N + '\n';
    if (vr) c += 'set network virtual-router ' + vr + ' interface ' + N + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show interface ' + N + '   (zone, VR ve yönetim profili satırları)\n# show routing route\n';
    if (vr) w.push(_PAW_VRNOTE);
    return { config: c, warnings: w };
}

// ── Palo Alto: Virtual Router + Static Route ───────────────────────────────────
PaloAlto.staticroute = {
    label: 'Virtual Router + Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Virtual Router + Static Route (PAN-OS)',
                desc: 'Palo Alto Virtual Router üzerinde statik rota ekleme — hedef ağ, next-hop ve interface seçimi. Default route için 0.0.0.0/0 kullanın.'
            },
            sections: [
                {
                    title: 'Static Route',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'vr_name', why: "Virtual Router ayrı bir yönlendirme tablosudur. Arayüzü doğru VR'a eklemezsen rota yazsan bile trafik yönlenmez; VR'lar arası geçiş ayrıca statik rota ister.", label: 'Virtual Router Adı', type: 'text', required: true, placeholder: 'default', hint: 'Varsayılan VR genellikle "default" olarak adlandırılır' },
                        { name: 'dst', why: "Hedef ağ CIDR olarak. Palo Alto'da rota eklemek yetmez; trafiğin geçmesi için ayrıca <b>güvenlik kuralı</b> gerekir.", label: 'Hedef Ağ (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '0.0.0.0/0', hint: 'Rota hedefi; default route için 0.0.0.0/0' },
                        { name: 'nexthop', why: 'Next-hop IP, VR\'daki bir bağlı ağda olmalı; değilse rota tabloya girmez. Tünel arayüzü üzerinden rota veriyorsan next-hop boş bırakılır, yalnız arayüz yazılır.', label: 'Next-Hop IP', type: 'text', validate: 'ip', optional: true, placeholder: '203.0.113.1', hint: 'Bir sonraki hop IP adresi (tunnel rotasında boş)' },
                        { name: 'interface', why: "Next-hop yerine yalnızca arayüz vermek point-to-point dışında risklidir. Ethernet segmentinde next-hop IP belirtmek ARP kaynaklı yanlış yönlendirmeleri önler.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/1', hint: 'Çıkış arayüzü' },
                        { name: 'metric', why: 'Aynı hedefe birden fazla rota varsa düşük metric kazanır. Yedek hat için yüksek metric vererek failover kurulur.', label: 'Metric', type: 'text', required: true, placeholder: '10', hint: 'Rota metriği; düşük değer öncelikli' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaStaticrouteGen(data);
        });
    }
};
function cgPaStaticrouteGen(data) {
    const vrName = cgEsc(data.vr_name || ''), dst = cgEsc(String(data.dst || '').trim());
    const nexthop = cgEsc(String(data.nexthop || '').trim()), iface = cgEsc(String(data.interface || '').trim()), metric = String(data.metric || '').trim();
    const routeName = dst === '0.0.0.0/0' ? 'DEFAULT' : dst.replace(/[^a-zA-Z0-9]/g, '-');
    const w = [];
    const dn = _paWNet(data.dst);
    if (_paWHostBits(dn)) w.push('⚠ Hedefte host bitleri dolu (' + dn.ip + '/' + dn.len + '): ağ adresini yazın (' + _paWIpOf(_paWBase(dn.ip, dn.len)) + '/' + dn.len + ').');
    if (!nexthop && !iface) w.push('⛔ Sonraki atlama da çıkış arayüzü de yok: rota hiçbir yere gönderemez. Next-hop IP (Ethernet) ya da arayüz (tunnel) verin.');
    else if (!nexthop && /^tunnel\.\d+$/.test(iface)) w.push('ℹ Next-hop olmadan tunnel arayüzüne rota: route-based VPN için doğru kullanım.');
    else if (!nexthop) w.push('⚠ Statik rotada next-hop yok, yalnız ' + iface + ': Ethernet segmentinde hedef için ARP yapılır ve karşı tarafta proxy-ARP gerekir; next-hop IP verin.');
    if (metric && !(/^\d+$/.test(metric) && +metric >= 1 && +metric <= 65535)) w.push('⛔ Metric 1–65535 arasında bir sayı olmalı ("' + metric + '").');
    if (dst === '0.0.0.0/0' && metric && +metric > 10) w.push('ℹ Yedek varsayılan rota: SNAT kuralları to-interface ile birincil hatta bağlıysa yedek hat için kendi arayüz adresine çeviren ayrı bir SNAT kuralı gerekir. Hat up kalıp ISP tarafı koparsa statik rota düşmez; path monitoring ekleyin. Kopmayı bakımda deneyin (pan-14).');
    if (nexthop) w.push('ℹ Next-hop ' + nexthop + ', VR\'daki bir arayüzün bağlı ağında olmalı; değilse rota tabloya girmez (show routing route\'da görünmez) (pan-02). Yedek hat için aynı hedefe daha yüksek metric ile ikinci rota yazın; yönetsel mesafe varsayılanı 10.');
    const b = 'set network virtual-router ' + vrName + ' routing-table ip static-route ' + routeName;
    let c = '# ========================================\n# Palo Alto — Virtual Router + Static Route\n# ========================================\n\n';
    c += b + ' destination ' + dst + '\n';
    if (nexthop) c += b + ' nexthop ip-address ' + nexthop + '\n';
    if (iface) c += b + ' interface ' + iface + '\n';
    if (metric) c += b + ' metric ' + cgEsc(metric) + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show routing route type static\n# test routing fib-lookup virtual-router ' + vrName + ' ip ' + (dn ? cgEsc(dn.len === 0 ? '198.51.100.80' : dn.ip) : '<hedef-ip>') + '\n';
    w.push(_PAW_VRNOTE);
    return { config: c, warnings: w };
}

// ── Palo Alto: OSPF ───────────────────────────────────────────────────────────
PaloAlto.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (PAN-OS)',
                desc: 'Palo Alto Virtual Router üzerinde OSPF konfigürasyonu — Router ID, area ve interface ataması. Passive interface desteği mevcuttur.'
            },
            sections: [
                {
                    title: 'OSPF Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'vr_name', why: "Virtual Router ayrı bir yönlendirme tablosudur. Arayüzü doğru VR'a eklemezsen rota yazsan bile trafik yönlenmez; VR'lar arası geçiş ayrıca statik rota ister.", label: 'Virtual Router Adı', type: 'text', required: true, placeholder: 'default', hint: 'OSPF çalışacak Virtual Router' },
                        { name: 'router_id', why: 'Benzersiz olmalı; genelde Loopback IP verilir. Değiştirmek OSPF/BGP oturumlarını sıfırlar.', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'Genellikle Loopback IP adresi kullanılır' },
                        { name: 'area', why: "Backbone <code>0</code>'dır ve tüm alanlar ona bitişik olmalıdır. Alan numarası eşleşmezse komşuluk kurulmaz.", label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone area için 0.0.0.0' }
                    ]
                },
                {
                    title: 'OSPF Interface\'ler',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'intfs', why: "OSPF'e dahil edilen her arayüz komşuluk kurmaya çalışır. İç sunucu segmentlerini passive yapmazsan o ağdaki herkes topolojini dinleyebilir.", label: 'OSPF Interface\'ler', type: 'text', required: true, placeholder: 'ethernet1/2,ethernet1/3', hint: 'Virgülle ayrılmış arayüz listesi' },
                        { name: 'passive_intfs', why: 'Passive arayüz hello göndermez ama ağı duyurur. WAN arayüzlerinde güvenlik için açılmalıdır.', label: 'Passive Interface\'ler', type: 'text', validate: 'iface_range', optional: true, placeholder: 'ethernet1/3', hint: 'OSPF hello göndermeyecek arayüzler (virgülle ayrılmış)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaOspfGen(data);
        });
    }
};
function cgPaOspfGen(data) {
    const vrName = cgEsc(data.vr_name || ''), routerId = cgEsc(data.router_id || ''), area = cgEsc(data.area || '');
    const intfs = cgEsc(data.intfs || '').split(',').map(s => s.trim()).filter(Boolean);
    const passiveRaw = cgEsc(data.passive_intfs || '');
    const passiveIntfs = passiveRaw ? passiveRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
    const passiveSet = new Set(passiveIntfs);
    let c = '# ========================================\n# Palo Alto — OSPF\n# ========================================\n\n';
    c += 'set network virtual-router ' + vrName + ' protocol ospf router-id ' + routerId + '\n';
    c += 'set network virtual-router ' + vrName + ' protocol ospf enable yes\n';
    c += 'set network virtual-router ' + vrName + ' protocol ospf area ' + area + ' type normal\n';
    intfs.forEach(intf => {
        c += 'set network virtual-router ' + vrName + ' protocol ospf area ' + area + ' interface ' + intf + ' enable yes\n';
        if (passiveSet.has(intf)) {
            c += 'set network virtual-router ' + vrName + ' protocol ospf area ' + area + ' interface ' + intf + ' passive yes\n';
        }
    });
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show routing protocol ospf neighbor\n# show routing route type ospf\n';
    return c;
}

// ── Palo Alto: BGP ────────────────────────────────────────────────────────────
PaloAlto.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe-americas',
                title: 'BGP (PAN-OS)',
                desc: 'Palo Alto Virtual Router üzerinde BGP konfigürasyonu — Local AS, Router ID ve eBGP peer yapılandırması. Peer group desteği mevcuttur.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'vr_name', why: "Virtual Router ayrı bir yönlendirme tablosudur. Arayüzü doğru VR'a eklemezsen rota yazsan bile trafik yönlenmez; VR'lar arası geçiş ayrıca statik rota ister.", label: 'Virtual Router Adı', type: 'text', required: true, placeholder: 'default', hint: 'BGP çalışacak Virtual Router' },
                        { name: 'local_as', why: "Kendi AS numaran. Peer'ın AS'i farklıysa eBGP, aynıysa iBGP olur.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'router_id', why: 'Benzersiz olmalı; genelde Loopback IP verilir. Değiştirmek OSPF/BGP oturumlarını sıfırlar.', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '10.255.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' }
                    ]
                },
                {
                    title: 'Peer Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'peer_ip', why: "Karşı tarafın gerçek dış IP'si. NAT arkasındaysa NAT-T açık olmalı ve UDP 4500 geçmelidir.", label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'peer_as', why: "Komşunun AS numarası. Yanlışsa oturum Idle/Active'de takılır.", label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'peer_group', why: "Peer group ayarları (AS, tip, import/export) gruptaki tüm komşulara uygulanır. Grubu değiştirmek, farkında olmadan tüm BGP oturumlarını reset edebilir.", label: 'Peer Group Adı', type: 'text', required: true, placeholder: 'EBGP-PEERS', hint: 'eBGP peer group adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaBgpGen(data);
        });
    }
};
function cgPaBgpGen(data) {
    const vrName = cgEsc(data.vr_name || ''), localAs = cgEsc(data.local_as || ''), routerId = cgEsc(data.router_id || '');
    const peerIp = cgEsc(data.peer_ip || ''), peerAs = cgEsc(data.peer_as || ''), peerGroup = cgEsc(data.peer_group || '');
    let c = '# ========================================\n# Palo Alto — BGP\n# ========================================\n\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp enable yes\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp local-as ' + localAs + '\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp router-id ' + routerId + '\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp peer-group ' + peerGroup + ' type ebgp\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp peer-group ' + peerGroup + ' peer ' + peerIp + ' peer-as ' + peerAs + '\n';
    c += 'set network virtual-router ' + vrName + ' protocol bgp peer-group ' + peerGroup + ' peer ' + peerIp + ' enable yes\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show routing protocol bgp summary\n# show routing protocol bgp peer ' + peerIp + '\n';
    return c;
}

// ── Palo Alto: VLAN ───────────────────────────────────────────────────────────
PaloAlto.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'VLAN (PAN-OS)',
                desc: 'Palo Alto VLAN nesnesi oluşturma — VLAN ID, arayüz ataması, IP konfigürasyonu ve zone bağlaması.'
            },
            sections: [
                {
                    title: 'VLAN Yapılandırması',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vlan_id', why: "802.1Q etiketi (1-4094). Karşı switch portu <b>trunk</b> modda olmalı ve bu VLAN'a izin vermeli, aksi halde tag'li trafik sessizce düşer.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: '1–4094 arası VLAN numarası' },
                        { name: 'vlan_name', why: "PAN-OS'ta alt arayüz adı <code>ethernet1/1.100</code> biçiminde oluşur. Ad yalnızca okunabilirlik içindir, trafiği etkilemez.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'SERVERS', hint: 'VLAN nesne adı (büyük harf önerilir)' },
                        { name: 'interface', why: "Alt arayüzün bağlanacağı fiziksel arayüz. Üst arayüzün de bir zone'a ve Virtual Router'a atanmış olması gerekir.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/2', hint: 'VLAN üyesi fiziksel arayüz' },
                        { name: 'ip', why: "Alt arayüz IP'si, o VLAN'daki istemcilerin gateway'i olur. CIDR formatında verilir.", label: 'IP / Prefix', type: 'text', validate: 'cidr', optional: true, placeholder: '10.64.100.1/24', hint: 'VLAN arayüzü (vlan.<id>) IP adresi (opsiyonel)' },
                        { name: 'zone', why: "Her alt arayüz bir zone'a atanmalıdır. Atanmazsa trafik güvenlik kurallarına hiç girmez ve düşer.", label: 'Zone', type: 'text', optional: true, placeholder: 'trust', hint: 'VLAN arayüzünün atanacağı zone (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaVlanGen(data);
        });
    }
};
function cgPaVlanGen(data) {
    const vlanId = cgEsc(String(data.vlan_id || '').trim()), vlanName = cgEsc(data.vlan_name || '');
    const iface = cgEsc(String(data.interface || '').trim()), ip = cgEsc(String(data.ip || '').trim()), zone = cgEsc(String(data.zone || '').trim());
    const sub = iface + '.' + vlanId, vif = 'vlan.' + vlanId;
    const w = [];
    _paWName('VLAN adı', data.vlan_name, w, 31);
    if (/\./.test(iface)) w.push('⛔ Arayüz alanına fiziksel arayüz yazın (ör. ethernet1/2); alt arayüz (' + iface + '.' + vlanId + ') araç tarafından oluşturulur.');
    const n = _paWNet(data.ip);
    if (_paWNetOrBcast(n)) w.push('⛔ VLAN arayüzü IP\'si alt ağın ağ ya da yayın adresi (' + n.ip + '/' + n.len + ').');
    if (zone && !ip) w.push('ℹ IP verilmediği için VLAN (L3) arayüzü oluşturulmadı; zone ataması yazılmadı.');
    if (ip && !zone) w.push('⚠ VLAN arayüzü (' + vif + ') için zone verilmedi: zone\'suz arayüz trafik geçirmez.');
    w.push('ℹ Katman 2 alt arayüzü ' + sub + ' da bir layer2 zone\'una üye olmalı (set zone <L2-zone> network layer2 ' + sub + '); zone\'suz arayüz trafik işlemez.');
    let c = '# ========================================\n# Palo Alto — VLAN\n# ========================================\n\n';
    c += '# Katman 2 alt arayüzü (802.1Q etiketi ' + vlanId + ')\nset network interface ethernet ' + iface + ' layer2 units ' + sub + ' tag ' + vlanId + '\n\n';
    c += '# VLAN nesnesi (PAN-OS VLAN nesnesinde vlan-id alanı yoktur; etiket alt arayüzdedir)\nset network vlan ' + vlanName + ' interface ' + sub + '\n';
    if (ip) {
        c += '\n# VLAN (L3) arayüzü: VLAN\'ın ağ geçidi\nset network interface vlan units ' + vif + ' ip ' + ip + '\n';
        c += 'set network vlan ' + vlanName + ' virtual-interface interface ' + vif + '\n';
        if (zone) c += 'set zone ' + zone + ' network layer3 ' + vif + '\n';
        c += 'set network virtual-router default interface ' + vif + '\n';
        w.push(_PAW_VRNOTE);
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show vlan all\n# show interface ' + (ip ? vif : sub) + '\n';
    return { config: c, warnings: w };
}

// ── Palo Alto: Service Object ─────────────────────────────────────────────────
PaloAlto.service = {
    label: 'Service Object',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'Service Object (PAN-OS)',
                desc: 'TCP/UDP port bazlı servis nesnesi tanımlama. Security policy\'de application-default yerine özel port kuralları için kullanılır.'
            },
            sections: [
                {
                    title: 'Service Object',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'name', why: "Servis nesnesi olmadan kuralda <code>application-default</code> dışında port veremezsin. Adında protokol ve portu belirt (<code>tcp-8443</code>), yoksa benzer nesneler hızla çoğalır.", label: 'Servis Adı', type: 'text', required: true, placeholder: 'SVC-HTTPS', hint: 'Servis nesnesi adı (ör: SVC-HTTPS, SVC-CUSTOM-8080)' },
                        { name: 'protocol', why: "TCP/UDP ayrımını yanlış yapmak en sık görülen 'kural çalışmıyor' sebebidir.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'dst_port', why: 'Palo Alto uygulamayı porttan bağımsız tanır (App-ID). Yine de servis kısıtı koymak, uygulamanın beklenmedik portlarda çalışmasını engeller.', label: 'Hedef Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'Hedef port veya aralık (ör: 443, 8080-8090)' },
                        { name: 'src_port', why: "Kaynak port neredeyse her zaman rastgeledir. Burayı doldurmak kuralın hiç eşleşmemesine yol açan klasik hatadır — boş bırak.", label: 'Kaynak Port', type: 'text', optional: true, placeholder: 'any', hint: 'Kaynak port kısıtlaması (genellikle boş bırakılır)' },
                        { name: 'description', why: "Çok portlu bir cihazda hangi kablonun nereye gittiğini söyleyen tek kayıt budur. Boş bırakılan portlar, arıza anında en çok zaman kaybettiren yerdir.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'HTTPS service', hint: 'Servis nesnesi açıklaması' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaServiceGen(data);
        });
    }
};
function cgPaServiceGen(data) {
    const name = cgEsc(data.name || ''), protocol = data.protocol === 'udp' ? 'udp' : 'tcp';
    const dstPort = String(data.dst_port || '').trim(), srcPort = String(data.src_port || '').trim(), description = cgEsc(data.description || '');
    const w = [];
    _paWName('Servis adı', data.name, w);
    if (/^any$/i.test(dstPort)) w.push('⛔ Hedef port "any" olamaz: servis nesnesi port (ör. 443), aralık (8080-8090) ya da virgüllü liste ister.');
    if (/^(0|1)-65535$/.test(dstPort)) w.push('⚠ Hedef port 1-65535: tüm portlar açılır; kuralda servis any ile aynı etkiyi yapar.');
    if (srcPort && !/^any$/i.test(srcPort)) w.push('⚠ Kaynak port kısıtı: istemciler rastgele kaynak port kullanır; bu nesneyle yazılan kural büyük olasılıkla hiç eşleşmez.');
    const b = 'set service ' + name + ' protocol ' + protocol;
    let c = '# ========================================\n# Palo Alto — Service Object\n# ========================================\n\n';
    c += b + ' port ' + cgEsc(dstPort) + '\n';
    if (srcPort && !/^any$/i.test(srcPort)) c += b + ' source-port ' + cgEsc(srcPort) + '\n';
    if (description) c += 'set service ' + name + ' description ' + cgQ(data.description) + '\n';
    w.push('ℹ Kuralda uygulama (App-ID) ile birlikte kullanın: application ssl + service ' + (name || '<servis>') + ' uygulamayı yalnız bu portta geçirir (pan-03). Standart porttaki uygulama için application-default yeterlidir.');
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama (configure modu):\n# show service ' + name + '\n';
    return { config: c, warnings: w };
}

// ── Palo Alto: Custom Application ─────────────────────────────────────────────
PaloAlto.customapp = {
    label: 'Custom Application',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-puzzle-piece',
                title: 'Custom Application (PAN-OS)',
                desc: 'Özel uygulama tanımı — pattern-match signature ile App-ID benzeri uygulama tespiti. Kategori, risk seviyesi ve port ataması.'
            },
            sections: [
                {
                    title: 'Uygulama Tanımı',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'app_name', why: "Özel uygulama tanımı, App-ID'nin tanımadığı iç uygulamalar için gerekir. Yanlış signature, meşru trafiğin engellenmesine yol açar.", label: 'Uygulama Adı', type: 'text', required: true, placeholder: 'CUSTOM-APP', hint: 'Büyük harf ve tire önerilir (ör: CUSTOM-APP)' },
                        { name: 'category', why: "Kategori, raporlama ve App-ID filtrelerinde kullanılır. Yanlış kategori, kategori bazlı kuralların bu uygulamayı sessizce kapsamasına ya da tamamen kaçırmasına yol açar.", label: 'Kategori', type: 'text', required: true, placeholder: 'networking', hint: 'PAN-OS uygulama kategorisi (ör: networking, business-systems)' },
                        { name: 'risk', why: 'Risk seviyesi 1-5. Yüksek riskli uygulamaları (tor, proxy, uzaktan erişim) engellemek, gölge BT ile mücadelede ilk adımdır.', label: 'Risk Seviyesi', type: 'select', options: [
                            { value: '1', label: '1 — Low', selected: true },
                            { value: '2', label: '2' },
                            { value: '3', label: '3 — Medium' },
                            { value: '4', label: '4' },
                            { value: '5', label: '5 — High' }
                        ], hint: 'Yüksek risk; security policy kısıtlamalarını tetikleyebilir' }
                    ]
                },
                {
                    title: 'Signature ve Port',
                    icon: 'fas fa-fingerprint',
                    fields: [
                        { name: 'sig_pattern', why: "Fazla geniş yazılan imza başka uygulamaları da yakalar ve meşru trafik yanlış sınıflandırılır. Desenin oturumun ilk paketlerinde geçtiğinden emin ol.", label: 'Signature Pattern', type: 'text', required: true, placeholder: 'GET /api/v1', hint: 'HTTP header üzerinde aranacak string' },
                        { name: 'protocol', why: "TCP/UDP ayrımını yanlış yapmak en sık görülen 'kural çalışmıyor' sebebidir.", label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ]},
                        { name: 'port', why: "Özel uygulamanın varsayılan portu. Kuralda <code>application-default</code> kullandığında uygulamanın <b>yalnızca</b> bu porttan geçmesine izin verilir.", label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '8080', hint: 'Uygulamanın kullandığı port numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaCustomappGen(data);
        });
    }
};
function cgPaCustomappGen(data) {
    const appName = cgEsc(data.app_name || ''), category = cgEsc(data.category || ''), risk = cgEsc(data.risk || '1');
    const sigPattern = cgEsc(data.sig_pattern || ''), protocol = cgEsc(data.protocol || 'tcp'), port = cgEsc(data.port || '');
    const sigName = appName + '-sig';
    let c = '# ========================================\n# Palo Alto — Custom Application\n# ========================================\n\n';
    c += 'set application ' + appName + ' category ' + category + '\n';
    c += 'set application ' + appName + ' risk ' + risk + '\n';
    c += 'set application ' + appName + ' default port ' + protocol + '/' + port + '\n';
    c += 'set application ' + appName + ' signature ' + sigName + ' order-free yes\n';
    c += 'set application ' + appName + ' signature ' + sigName + ' and-condition cond1 or-condition cond1 operator pattern-match context http-req-headers pattern "' + sigPattern + '"\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show application name ' + appName + '\n';
    return c;
}

// ── Palo Alto: Security Profile Group ─────────────────────────────────────────
PaloAlto.secprofilegroup = {
    label: 'Security Profile Group',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Security Profile Group (PAN-OS)',
                desc: 'AV, Vulnerability Protection, URL Filtering ve Anti-Spyware profillerini tek grup altında birleştir. Security policy\'de grup adıyla uygulanır.',
            },
            sections: [
                {
                    title: 'Security Profile Group',
                    icon: 'fas fa-layer-group',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'group_name', why: 'Adres grubu kural sayısını azaltır. <b>Dynamic Address Group</b> ise etiket bazlı çalışır ve commit gerektirmeden güncellenir — otomasyon için güçlü bir araçtır.', label: 'Grup Adı', type: 'text', required: true, placeholder: 'STRICT-PROFILES', hint: 'Profile group adı; security rule\'da bu ad kullanılır' },
                        { name: 'av_profile', why: "Antivirus profili yalnızca çözülmüş trafikte anlamlıdır. SSL inspection yoksa HTTPS içindeki zararlıyı göremezsin ve koruma yanıltıcı biçimde yeşil görünür.", label: 'Antivirus Profil', type: 'text', required: true, placeholder: 'default', hint: 'Mevcut AV profil adı' },
                        { name: 'vuln_profile', why: "Vulnerability Protection, istemci ve sunucu yönleri için ayrı ayarlanır. Yalnızca birini sıkılaştırmak, tehdidin diğer yönden rahatça geçmesine izin verir.", label: 'Vulnerability Protection Profil', type: 'text', required: true, placeholder: 'strict', hint: 'Mevcut VP profil adı' },
                        { name: 'url_profile', why: "Kategori <code>alert</code> bırakılırsa kullanıcı siteye erişir, yalnızca log düşer. Kategorilendirilmemiş siteler için politika belirlemezsen varsayılan izin geçerli olur.", label: 'URL Filtering Profil', type: 'text', required: true, placeholder: 'default', hint: 'Mevcut URL filtering profil adı' },
                        { name: 'spyware_profile', why: "Anti-Spyware DNS sinkhole içerir. Sinkhole açmazsan komuta-kontrol isteğini tespit edersin ama enfekte iç istemciyi <b>bulamazsın</b>, çünkü sorgu DNS sunucusundan gelir.", label: 'Anti-Spyware Profil', type: 'text', required: true, placeholder: 'strict', hint: 'Mevcut anti-spyware profil adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaSecprofilegroupGen(data);
        });
    }
};
function cgPaSecprofilegroupGen(data) {
    const groupName = cgEsc(data.group_name || ''), avProfile = cgEsc(data.av_profile || '');
    const vulnProfile = cgEsc(data.vuln_profile || ''), urlProfile = cgEsc(data.url_profile || '');
    const spywareProfile = cgEsc(data.spyware_profile || '');
    let c = '# ========================================\n# Palo Alto — Security Profile Group\n# ========================================\n\n';
    c += 'set profile-group ' + groupName + ' virus ' + avProfile + '\n';
    c += 'set profile-group ' + groupName + ' vulnerability ' + vulnProfile + '\n';
    c += 'set profile-group ' + groupName + ' url-filtering ' + urlProfile + '\n';
    c += 'set profile-group ' + groupName + ' spyware ' + spywareProfile + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show profile-group ' + groupName + '\n';
    return c;
}

// ── Palo Alto: Decryption Policy ──────────────────────────────────────────────
PaloAlto.decryption = {
    label: 'Decryption Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock-open',
                title: 'Decryption Policy (PAN-OS)',
                desc: 'SSL/TLS trafik şifre çözme politikası — SSL Forward Proxy (giden) veya SSL Inbound Inspection (gelen). NGFW özelliklerine şifreli trafiği açar.',
            },
            sections: [
                {
                    title: 'Decryption Policy',
                    icon: 'fas fa-user-secret',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'policy_name', why: "Politika adını sonradan değiştirmek mümkündür ama log ve raporlardaki geçmiş kayıtlarla bağ kopar. Baştan tutarlı bir isimlendirme şeması seç.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'DECRYPT-OUTBOUND', hint: 'Decryption policy adı' },
                        { name: 'src_zone', why: "Palo Alto kuralları zone bazlıdır, arayüz bazlı değil. Decryption ve DoS politikalarında yanlış zone, kuralın hiç eşleşmemesine yol açar ve bunu ancak olay yaşandığında fark edersin.", label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'trust', hint: 'İç ağ zone adı' },
                        { name: 'dst_zone', why: "Hedef zone <b>post-NAT</b> zone'dur, adres ise pre-NAT. Bu ayrımı kaçırmak, kuralın neden eşleşmediğini saatlerce aratan klasik hatadır.", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Dış ağ zone adı' },
                        { name: 'src_addr', why: 'Kaynak adres nesnesi. <code>any</code> kapsamı daraltmaz; yalnızca gerçekten gerekiyorsa kullanın.', label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'LAN_USERS', hint: 'Adres nesnesi/grubu veya any' },
                        { name: 'dst_addr', why: 'Hedef adres nesnesi. <code>any</code> kapsamı daraltmaz; yalnızca gerçekten gerekiyorsa kullanın.', label: 'Hedef Adres', type: 'text', required: true, placeholder: 'any', hint: 'Adres nesnesi/grubu veya any' },
                        { name: 'decrypt_type', why: '<b>SSL Forward Proxy</b> giden kullanıcı trafiğini, <b>SSL Inbound Inspection</b> kendi sunucuna gelen trafiği açar. Forward Proxy için CA sertifikası tüm istemcilere dağıtılmalıdır.', label: 'Decrypt Tipi', type: 'select', options: [
                            { value: 'ssl-forward-proxy', label: 'SSL Forward Proxy (giden trafik)', selected: true },
                            { value: 'ssl-inbound-inspection', label: 'SSL Inbound Inspection (gelen trafik)' }
                        ], hint: 'Forward Proxy kullanıcı trafiğini; Inbound sunucu trafiğini açar' },
                        { name: 'profile', why: 'Decryption profili zayıf şifre ve süresi dolmuş sertifikaları reddeder. Sertifika sabitleme (pinning) kullanan uygulamalar <b>bypass listesine</b> alınmalıdır, yoksa çalışmazlar.', label: 'Decryption Profil', type: 'text', required: true, placeholder: 'default-decryption', hint: 'Decryption profil nesnesi adı' },
                        { name: 'action', why: '<code>allow</code> geçirir, <code>deny</code> uygulamaya göre davranır, <code>drop</code> sessizce düşürür, <code>reset</code> RST gönderir. Deny kuralında log açmazsan engellenen trafiği göremezsin.', label: 'Aksiyon', type: 'select', options: [
                            { value: 'decrypt', label: 'Decrypt', selected: true },
                            { value: 'no-decrypt', label: 'No-Decrypt' }
                        ], hint: 'No-Decrypt: bankacılık gibi hassas siteleri hariç tutmak için' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaDecryptionGen(data);
        });
    }
};
function cgPaDecryptionGen(data) {
    const policyName = cgEsc(data.policy_name || ''), srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    const decryptType = cgEsc(data.decrypt_type || 'ssl-forward-proxy'), profile = cgEsc(data.profile || ''), action = cgEsc(data.action || 'decrypt');
    const base = 'set rulebase decryption rules "' + policyName + '"';
    let c = '# ========================================\n# Palo Alto — Decryption Policy\n# ========================================\n\n';
    c += base + ' from ' + srcZone + '\n';
    c += base + ' to ' + dstZone + '\n';
    c += base + ' source ' + cgEsc(data.src_addr || '') + '\n';
    c += base + ' destination ' + cgEsc(data.dst_addr || '') + '\n';
    c += base + ' action ' + action + '\n';
    c += base + ' type ' + decryptType + '\n';
    c += base + ' profile "' + profile + '"\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show decryption-policy\n# show system state | match ssl\n';
    return c;
}

// ── Palo Alto: DoS Protection Policy ─────────────────────────────────────────
PaloAlto.dos = {
    label: 'DoS Protection Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'DoS Protection Policy (PAN-OS)',
                desc: 'SYN/UDP/ICMP flood saldırılarına karşı koruma — alarm ve activate rate eşikleri ile aggregate flood koruması.',
            },
            sections: [
                {
                    title: 'DoS Koruma Politikası',
                    icon: 'fas fa-shield-alt',
                    badge: { text: 'Güvenlik', cls: 'security' },
                    fields: [
                        { name: 'policy_name', why: "Politika adını sonradan değiştirmek mümkündür ama log ve raporlardaki geçmiş kayıtlarla bağ kopar. Baştan tutarlı bir isimlendirme şeması seç.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'DOS-PROTECT', hint: 'DoS koruma policy adı' },
                        { name: 'src_zone', why: "Palo Alto kuralları zone bazlıdır, arayüz bazlı değil. Decryption ve DoS politikalarında yanlış zone, kuralın hiç eşleşmemesine yol açar ve bunu ancak olay yaşandığında fark edersin.", label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Saldırının geldiği zone (genellikle untrust)' },
                        { name: 'dst_zone', why: "Hedef zone <b>post-NAT</b> zone'dur, adres ise pre-NAT. Bu ayrımı kaçırmak, kuralın neden eşleşmediğini saatlerce aratan klasik hatadır.", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'dmz', hint: 'Korunacak zone (ör: dmz, trust)' },
                        { name: 'src_addr', why: 'Kaynak adres nesnesi. <code>any</code> kapsamı daraltmaz; yalnızca gerçekten gerekiyorsa kullanın.', label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'any', hint: 'Adres nesnesi/grubu veya any' },
                        { name: 'dst_addr', why: 'Hedef adres nesnesi. <code>any</code> kapsamı daraltmaz; yalnızca gerçekten gerekiyorsa kullanın.', label: 'Hedef Adres', type: 'text', required: true, placeholder: 'DMZ_SERVERS', hint: 'Adres nesnesi/grubu veya any' },
                        { name: 'flood_type', why: 'DoS koruması. Eşikler <b>normal trafiğinizi ölçtükten sonra</b> belirlenmelidir; düşük eşik meşru trafiği keser.', label: 'Flood Tipi', type: 'select', options: [
                            { value: 'syn', label: 'SYN Flood', selected: true },
                            { value: 'udp', label: 'UDP Flood' },
                            { value: 'icmp', label: 'ICMP Flood' }
                        ], hint: 'SYN flood en yaygın DDoS vektörüdür' },
                        { name: 'alarm_rate', why: 'Uyarı eşiği (paket/sn). Bu değeri üretim trafiğinizin tepe noktasının üstünde tutun, aksi halde sürekli alarm üretir.', label: 'Alarm Rate (pps)', type: 'text', required: true, placeholder: '10000', hint: 'Bu eşiği aşınca log/alarm üretilir' },
                        { name: 'activate_rate', why: "Eşik çok düşükse meşru yoğunluk (yedekleme, yama günü) DoS sanılır ve gerçek kullanıcılar engellenir. Önce mevcut tepe değerleri ölç, sonra eşik koy.", label: 'Activate Rate (pps)', type: 'text', required: true, placeholder: '15000', hint: 'Bu eşiği aşınca aktif koruma başlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaDosGen(data);
        });
    }
};
function cgPaDosGen(data) {
    const policyName = cgEsc(data.policy_name || ''), srcZone = cgEsc(data.src_zone || ''), dstZone = cgEsc(data.dst_zone || '');
    const floodType = cgEsc(data.flood_type || 'syn'), alarmRate = cgEsc(data.alarm_rate || ''), activateRate = cgEsc(data.activate_rate || '');
    const base = 'set rulebase dos rules "' + policyName + '"';
    let c = '# ========================================\n# Palo Alto — DoS Protection Policy\n# ========================================\n\n';
    c += base + ' from ' + srcZone + '\n';
    c += base + ' to ' + dstZone + '\n';
    c += base + ' source ' + cgEsc(data.src_addr || '') + '\n';
    c += base + ' destination ' + cgEsc(data.dst_addr || '') + '\n';
    c += base + ' protection aggregate flood ' + floodType + ' enable yes\n';
    c += base + ' protection aggregate flood ' + floodType + ' alarm-rate ' + alarmRate + '\n';
    c += base + ' protection aggregate flood ' + floodType + ' activate-rate ' + activateRate + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show dos-protection policy "' + policyName + '"\n';
    return c;
}

// ── Palo Alto: SNMP v3 ────────────────────────────────────────────────────────
PaloAlto.snmp = {
    label: 'SNMP v3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-satellite-dish',
                title: 'SNMP v3 (PAN-OS)',
                desc: 'SNMPv3 yapılandırması — şifreli auth/privacy ile güvenli SNMP izleme. Trap server ve kullanıcı kimlik bilgileri tanımlanır.'
            },
            sections: [
                {
                    title: 'SNMP v3 Profil',
                    icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'profile_name', why: "SNMP profili cihaz ayarlarında seçilmezse tanımlı kalır ama kullanılmaz. Profil adını değiştirmek, ona referans veren yapılandırmayı commit sırasında hata verdirir.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'SNMP-PROFILE', hint: 'SNMP profil referans adı' },
                        { name: 'username', why: "SNMPv3 kullanıcısı engine ID'ye bağlıdır; cihaz değişiminde ya da RMA sonrası kullanıcının yeniden tanımlanması gerekir.", label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'snmp-user', hint: 'SNMPv3 kullanıcı adı' },
                        { name: 'auth_proto', why: "SNMPv3'te <code>MD5</code> ve <code>SHA1</code> zayıftır; mümkünse <code>SHA256</code> kullan.", label: 'Auth Protokol', type: 'select', options: [
                            { value: 'SHA', label: 'SHA', selected: true },
                            { value: 'MD5', label: 'MD5' }
                        ], hint: 'SHA daha güvenli; MD5 eski sistemlerle uyumluluk için' },
                        { name: 'auth_pass', why: "Auth şifresi en az 8 karakter olmalı. Şifreyi değiştirip NMS tarafında güncellemezsen izleme sessizce durur ve kesintiyi kimse görmez.", label: 'Auth Şifresi', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'En az 8 karakter, güçlü şifre kullanın' },
                        { name: 'priv_proto', why: '<code>DES</code> kırılabilir; <code>AES</code> tercih edilmeli. authPriv olmadan SNMP verisi açık geçer.', label: 'Privacy Protokol', type: 'select', options: [
                            { value: 'AES', label: 'AES', selected: true },
                            { value: 'DES', label: 'DES' }
                        ], hint: 'AES şifreleme tercih edilir' },
                        { name: 'priv_pass', why: "Privacy şifresi olmadan SNMP verisi ağda <b>açık</b> dolaşır. authPriv seviyesini seçmediğin sürece bu alan tanımlı olsa da kullanılmaz.", label: 'Privacy Şifresi', type: 'text', required: true, placeholder: 'PrivPass123!', hint: 'Auth şifresinden farklı olması önerilir' }
                    ]
                },
                {
                    title: 'Trap Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'trap_server', why: "Palo Alto yönetim trafiği varsayılan olarak MGT arayüzünden çıkar. Trap'i veri portundan göndereceksen service route ayarlamalısın, yoksa paketler sessizce kaybolur.", label: 'Trap Server IP', type: 'text', required: true, placeholder: '10.0.0.100', hint: 'SNMP trap\'lerin gönderileceği NMS IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaSnmpGen(data);
        });
    }
};
function cgPaSnmpGen(data) {
    const profileName = cgEsc(data.profile_name || ''), username = cgEsc(data.username || '');
    const authProto = cgEsc(data.auth_proto || 'SHA'), authPass = cgEsc(data.auth_pass || '');
    const privProto = cgEsc(data.priv_proto || 'AES'), privPass = cgEsc(data.priv_pass || ''), trapServer = cgEsc(data.trap_server || '');
    let c = '# ========================================\n# Palo Alto — SNMP v3\n# ========================================\n\n';
    c += 'set deviceconfig system snmp-setting access-setting version v3 views V1 type include match 1.3.6\n';
    c += 'set deviceconfig system snmp-setting server version v3 server ' + trapServer + ' user ' + username + '\n';
    c += 'set deviceconfig system snmp-setting server version v3 server ' + trapServer + ' auth-pwd ' + authPass + '\n';
    c += 'set deviceconfig system snmp-setting server version v3 server ' + trapServer + ' priv-pwd ' + privPass + '\n';
    c += '\n# Profil adı: ' + profileName + '\n';
    c += '# Auth Protocol: ' + authProto + ' | Privacy Protocol: ' + privProto + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show deviceconfig system snmp-setting\n';
    return c;
}

// ── Palo Alto: Panorama Device Group ──────────────────────────────────────────
PaloAlto.panorama = {
    label: 'Panorama Device Group',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-th-large',
                title: 'Panorama Device Group (PAN-OS)',
                desc: 'Panorama merkezi yönetim — Device Group ve Template değişkeni konfigürasyonu. Bu komutlar doğrudan cihazda değil, Panorama üzerinde çalıştırılır.',
            },
            sections: [
                {
                    title: 'Device Group Ayarları',
                    icon: 'fas fa-server',
                    badge: { text: 'Enterprise', cls: 'advanced' },
                    warn: 'Bu komutlar Panorama CLI\'ında çalıştırılır — doğrudan cihaz CLI\'ında kullanmayın.',
                    fields: [
                        { name: 'dg_name', why: 'Panorama Device Group, kuralların merkezi yönetimini sağlar. <b>Pre-Rules</b> yerel kurallardan önce, <b>Post-Rules</b> sonra değerlendirilir.', label: 'Device Group Adı', type: 'text', required: true, placeholder: 'DG-CUSTOMER1', hint: 'Panorama device group adı' },
                        { name: 'device_serial', why: "Seri numarası yanlışsa şablon ve device group hiçbir zaman uygulanmaz — cihaz Panorama'da bağlı görünse bile. Seriyi cihazın kendisinden doğrula.", label: 'Cihaz Seri Numarası', type: 'text', required: true, placeholder: '0123456789', hint: '10 haneli PAN-OS seri numarası' },
                        { name: 'shared_policy', why: "Shared kurallar tüm device group'lara uygulanır. Değiştirmeden önce hangi cihazları etkilediğini kontrol et.", label: 'Shared Policy Adı', type: 'text', required: true, placeholder: 'SHARED-POLICY', hint: 'Device group\'a atanacak paylaşılan policy' }
                    ]
                },
                {
                    title: 'Template Variable (Opsiyonel)',
                    icon: 'fas fa-code',
                    fields: [
                        { name: 'variable_name', why: "Template variable, aynı şablonu farklı cihazlarda farklı IP'lerle kullanmayı sağlar. Ad <code>$</code> ile başlamalı; yoksa Panorama onu düz metin sanar ve değeri aynen yazar.", label: 'Variable Adı', type: 'text', optional: true, placeholder: '$trusted-net', hint: 'Template değişkeni adı ($ ile başlar)' },
                        { name: 'variable_value', why: "Değer cihaz bazında override edilebilir. Şablondaki varsayılanı bırakıp cihazda override etmeyi unutmak, iki cihaza <b>aynı IP</b>'yi yazmakla sonuçlanır.", label: 'Variable Değeri', type: 'text', optional: true, placeholder: '192.168.1.0/24', hint: 'Değişkene atanacak IP veya subnet değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaPanoramaGen(data);
        });
    }
};
function cgPaPanoramaGen(data) {
    const dgName = cgEsc(data.dg_name || ''), deviceSerial = cgEsc(data.device_serial || '');
    const sharedPolicy = cgEsc(data.shared_policy || ''), variableName = cgEsc(data.variable_name || '');
    const variableValue = cgEsc(data.variable_value || '');
    let c = '# ========================================\n# Palo Alto — Panorama Device Group\n# (Panorama\'da çalıştırın)\n# ========================================\n\n';
    c += 'set device-group ' + dgName + ' devices ' + deviceSerial + '\n';
    c += 'set device-group ' + dgName + ' reference-templates default\n';
    if (variableName && variableValue) {
        c += 'set template-stack default variable ' + variableName + ' type ip-netmask value ' + variableValue + '\n';
    }
    c += '\n# Policy push:\n# commit-all device-group ' + dgName + '\n\n';
    c += '# Paylaşılan policy referansı: ' + sharedPolicy + '\n\n';
    c += '# Doğrulama:\n# show device-group ' + dgName + '\n# show devices all\n';
    return c;
}

// ── Palo Alto: SD-WAN Path Selection ─────────────────────────────────────────
PaloAlto.sdwan = {
    label: 'SD-WAN Path Selection',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'SD-WAN Path Selection (PAN-OS)',
                desc: 'PAN-OS 10.x+ SD-WAN — birden fazla WAN bacağında ağırlıklı yük dağıtımı, health check ve otomatik failover. SD-WAN lisansı gereklidir.',
            },
            sections: [
                {
                    title: 'SD-WAN Arayüzleri',
                    icon: 'fas fa-network-wired',
                    badge: { text: 'Enterprise', cls: 'advanced' },
                    warn: 'SD-WAN lisansı gereklidir (PAN-OS 10.x ve üzeri).',
                    fields: [
                        { name: 'interface_primary', why: "SD-WAN birincil yolu. Path quality profili (jitter/gecikme/kayıp eşikleri) tanımlamazsan hat bozulsa bile trafik birincilde kalmaya devam eder.", label: 'Birincil Interface', type: 'text', required: true, placeholder: 'ethernet1/1', hint: 'Birincil WAN bağlantı arayüzü' },
                        { name: 'interface_secondary', why: "Yedek yol birincilden <b>farklı</b> bir ISS ve farklı fiziksel güzergâh olmalı. Aynı ISS'in iki hattı, tek bir omurga arızasında birlikte düşer.", label: 'İkincil Interface', type: 'text', required: true, placeholder: 'ethernet1/2', hint: 'Yedek WAN bağlantı arayüzü' },
                        { name: 'weight_primary', why: "Ağırlık yük dağıtım oranını belirler. Saf yedeklilik isterken ağırlık vermek trafiği <b>ikiye böler</b>; bunun yerine öncelik tabanlı profil seç.", label: 'Birincil Ağırlık', type: 'text', required: true, placeholder: '100', hint: 'Yüksek değer = daha fazla trafik yükü' },
                        { name: 'weight_secondary', why: "Yedek hattın ağırlığı. Ölçülü bir hatta (LTE gibi) yüksek ağırlık vermek, farkında olmadan yüksek fatura üretir.", label: 'İkincil Ağırlık', type: 'text', required: true, placeholder: '50', hint: 'Birincil ile oransal yük dağıtımı için' }
                    ]
                },
                {
                    title: 'Health Check ve Failover',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'health_check_ip', why: "SD-WAN path seçimi bu hedefe ping/probe atarak yapılır. Hedefin sürekli erişilebilir ve <b>ISS'den bağımsız</b> olması gerekir (ör. 8.8.8.8 değil, kendi DC'niz).", label: 'Health Check IP', type: 'text', validate: 'ip', required: true, placeholder: '8.8.8.8', hint: 'Ping ile erişilebilirlik kontrolü yapılacak IP' },
                        { name: 'failover_threshold', why: "Yol değiştirme eşiği. Çok hassas ayarlamak, kısa dalgalanmalarda gereksiz path flapping'e yol açar.", label: 'Failover Threshold', type: 'text', required: true, placeholder: '3', hint: 'Kaç ardışık başarısız ping sonrası failover tetiklenir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgPaSdwanGen(data);
        });
    }
};
function cgPaSdwanGen(data) {
    const ifPrimary = cgEsc(data.interface_primary || ''), ifSecondary = cgEsc(data.interface_secondary || '');
    const wPrimary = cgEsc(data.weight_primary || ''), wSecondary = cgEsc(data.weight_secondary || '');
    const hcIp = cgEsc(data.health_check_ip || ''), failThresh = cgEsc(data.failover_threshold || '');
    let c = '# ========================================\n# Palo Alto — SD-WAN Path Selection\n# (SD-WAN lisansı gereklidir)\n# ========================================\n\n';
    c += '# Interface management profili\nset network profiles interface-management-profile SDWAN-PING ping yes\n\n';
    c += '# SD-WAN link tag yapılandırması\nset network sdwan interface ' + ifPrimary + ' link-tag primary\n';
    c += 'set network sdwan interface ' + ifSecondary + ' link-tag secondary\n\n';
    c += '# Ağırlık yapılandırması\nset network sdwan virtual-interface ' + ifPrimary + ' weight ' + wPrimary + '\n';
    c += 'set network sdwan virtual-interface ' + ifSecondary + ' weight ' + wSecondary + '\n\n';
    c += '# Health check\nset network sdwan interface ' + ifPrimary + ' health-check enable yes\n';
    c += 'set network sdwan interface ' + ifPrimary + ' health-check server ' + hcIp + '\n';
    c += 'set network sdwan interface ' + ifPrimary + ' health-check failure-condition threshold ' + failThresh + '\n\n';
    c += '# Virtual Router entegrasyonu\nset network virtual-router default interface ' + ifPrimary + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show sdwan interface\n# show sdwan path\n';
    return c;
}

// ═════════════════════════════════════════════════════════════════════════════
// Yeni araçlar (2026-09) — canlı envanterde PAN-OS yok; tüm sözdizimi resmi
// kaynaklardan: iron-skillet (PAN-OS 10.1 set şablonu), pan-os-python / pango
// XML yolları (set CLI = xpath), docs.paloaltonetworks.com, knowledgebase.
// ═════════════════════════════════════════════════════════════════════════════

// Virgül/boşluk ile girilen listeyi PAN-OS üye listesine çevirir: 'a, b c' → 'a b c'
function cgPaList(s) {
    return String(s || '').split(/[\s,]+/).map(x => x.trim()).filter(Boolean).join(' ');
}

// ── Palo Alto: Address Group ─────────────────────────────────────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/objects.py (AddressGroup: static / dynamic/filter / description / tag)
//            https://pan.dev/panos/docs/tutorials/working-with-address-groups/ (DAG filtresi)
PaloAlto.addrgroup = {
    label: 'Address Group',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-object-group', title: 'Address Group (PAN-OS)', desc: 'Statik (üye listesi) veya dinamik (etiket filtresi) adres grubu.<br><code>set address-group "WEB-SERVERS" static [ WEB-01 WEB-02 ]</code>' },
            configTypes: [
                { id: 'static', label: 'Statik', icon: 'fas fa-list', desc: 'Üyeleri tek tek adres nesnesi olarak ver', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'dynamic', label: 'Dinamik (DAG)', icon: 'fas fa-tags', desc: 'Üyelik etiket filtresiyle, commit gerektirmeden değişir' }
            ],
            sections: [
                {
                    title: 'Grup', icon: 'fas fa-object-group',
                    fields: [
                        { name: 'ag_name', label: 'Grup Adı', type: 'text', required: true, placeholder: 'WEB-SERVERS', hint: 'Kurallarda görünecek grup adı', why: 'Grup adı kurallarda görünür. Grup içeriğini değiştirmek <b>o grubu kullanan tüm kuralları</b> aynı anda etkiler.' },
                        { name: 'ag_desc', label: 'Açıklama', type: 'text', placeholder: 'Web sunucu havuzu', hint: 'Grup açıklaması' }
                    ]
                },
                {
                    title: 'Statik Üyeler', icon: 'fas fa-list', showFor: ['static'],
                    fields: [
                        { name: 'ag_members', label: 'Üye Adres Nesneleri', type: 'text', requiredIf: { field: '_cgtype', in: ['static'] }, placeholder: 'WEB-01 WEB-02', hint: 'Mevcut address nesne adları; boşluk veya virgülle ayır', why: 'Üyeler önceden tanımlı <code>address</code> nesneleri olmalı; olmayan bir ad commit hatası verir.' }
                    ]
                },
                {
                    title: 'Dinamik Filtre', icon: 'fas fa-tags', showFor: ['dynamic'],
                    info: 'Etiketler IP\'lere User-ID/XML API, VM Monitoring veya log forwarding aksiyonuyla atanır.',
                    fields: [
                        { name: 'ag_filter', label: 'Etiket Filtresi', type: 'text', requiredIf: { field: '_cgtype', in: ['dynamic'] }, placeholder: 'web and prod', hint: 'Etiket adları and / or ile birleştirilir', why: 'DAG üyeliği bu filtreye uyan kayıtlı IP\'lerden oluşur. Filtre fazla genişse (tek etiket) beklenmeyen IP\'ler kurala girer.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaAddrGroupGen(data));
    }
};
function cgPaAddrGroupGen(data) {
    const name = cgEsc(data.ag_name || ''), desc = cgEsc(data.ag_desc || '');
    const dyn = data._cgtype === 'dynamic';
    const base = 'set address-group "' + name + '"';
    let c = '# ========================================\n# Palo Alto — Address Group\n# ========================================\n\n';
    if (dyn) {
        c += base + ' dynamic filter "' + cgEsc(data.ag_filter || '') + '"\n';
    } else {
        c += base + ' static [ ' + cgEsc(cgPaList(data.ag_members)) + ' ]\n';
    }
    if (desc) c += base + ' description ' + cgQ(data.ag_desc) + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show address-group "' + name + '"   (configure modu)\n';
    if (dyn) c += '# show object registered-ip all\n';
    return c;
}

// ── Palo Alto: Service Group ─────────────────────────────────────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/objects.py (ServiceGroup: members)
PaloAlto.svcgroup = {
    label: 'Service Group',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-layer-group', title: 'Service Group (PAN-OS)', desc: 'Birden çok servis nesnesini tek grupta toplar.<br><code>set service-group "SG-WEB" members [ SVC-TCP-8080 SVC-TCP-8443 ]</code>' },
            sections: [
                {
                    title: 'Servis Grubu', icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'sg_name', label: 'Grup Adı', type: 'text', required: true, placeholder: 'SG-WEB', hint: 'Servis grubu adı', why: 'Kuralda <code>service</code> alanına yazılır. App-ID kullanıyorsan çoğu durumda <code>application-default</code> servis grubundan daha güvenlidir.' },
                        { name: 'sg_members', label: 'Üye Servisler', type: 'text', required: true, placeholder: 'SVC-TCP-8080 SVC-TCP-8443', hint: 'Mevcut service nesneleri (veya service-http / service-https); boşluk veya virgülle ayır', why: 'Üyeler önceden tanımlı servis nesneleri olmalı. Grupta geniş aralık (1-65535) varsa kural tüm portları açar.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaSvcGroupGen(data));
    }
};
function cgPaSvcGroupGen(data) {
    const name = cgEsc(data.sg_name || '');
    let c = '# ========================================\n# Palo Alto — Service Group\n# ========================================\n\n';
    c += 'set service-group "' + name + '" members [ ' + cgEsc(cgPaList(data.sg_members)) + ' ]\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show service-group "' + name + '"   (configure modu)\n';
    return c;
}

// ── Palo Alto: Syslog Server Profile + Log Forwarding Profile ────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/iron-skillet/blob/panos_v10.1/templates/panos/set_commands/iron_skillet_panos_full.conf
//            (shared log-settings syslog / profiles / system / config, rulebase ... log-setting)
//            değer listeleri: https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/device.py (SyslogServer: UDP/TCP/SSL, BSD/IETF, LOG_USER/LOG_LOCAL0-7)
PaloAlto.logfwd = {
    label: 'Log Forwarding + Syslog',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-share-square', title: 'Log Forwarding + Syslog Profili (PAN-OS)', desc: 'SIEM/syslog sunucu profili ve bu sunucuya log gönderen Log Forwarding profili — iron-skillet best-practice yapısı.<br><code>set shared log-settings profiles LF-SIEM match-list Traffic_Log_Forwarding send-syslog SYSLOG-SIEM</code>' },
            sections: [
                {
                    title: 'Syslog Sunucu Profili', icon: 'fas fa-server',
                    fields: [
                        { name: 'lf_sl_profile', label: 'Syslog Profil Adı', type: 'text', required: true, placeholder: 'SYSLOG-SIEM', hint: 'Device > Server Profiles > Syslog', why: 'Log forwarding profili sunucuya doğrudan değil, bu profil adıyla bağlanır.' },
                        { name: 'lf_sl_server', label: 'Sunucu Kayıt Adı', type: 'text', required: true, placeholder: 'SIEM-01', hint: 'Profil içindeki sunucu girdisinin adı' },
                        { name: 'lf_sl_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.50', hint: 'Syslog / SIEM sunucusu', why: 'Loglar yönetim arayüzünden (MGT) çıkar; servis rotası tanımlı değilse sunucuya MGT ağından erişim olmalı.' },
                        { name: 'lf_sl_transport', label: 'Taşıma', type: 'select', options: [
                            { value: 'UDP', label: 'UDP', selected: true },
                            { value: 'TCP', label: 'TCP' },
                            { value: 'SSL', label: 'SSL (TLS)' }
                        ], hint: 'SSL için sunucu sertifikası güvenilir CA ile imzalı olmalı', why: 'UDP kayıp paketi fark etmez ve düz metindir. Uyum gereksinimi varsa <b>SSL</b> (genelde 6514) kullan.' },
                        { name: 'lf_sl_port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '514', hint: 'UDP/TCP 514, SSL 6514 yaygın' },
                        { name: 'lf_sl_format', label: 'Format', type: 'select', options: [
                            { value: 'BSD', label: 'BSD', selected: true },
                            { value: 'IETF', label: 'IETF (RFC 5424)' }
                        ], why: 'SIEM\'in beklediği formatla eşleşmezse loglar parse edilmez ve korelasyon kuralları sessizce çalışmaz.' },
                        { name: 'lf_sl_facility', label: 'Facility', type: 'select', options: [
                            { value: 'LOG_USER', label: 'LOG_USER', selected: true },
                            { value: 'LOG_LOCAL0', label: 'LOG_LOCAL0' },
                            { value: 'LOG_LOCAL1', label: 'LOG_LOCAL1' },
                            { value: 'LOG_LOCAL4', label: 'LOG_LOCAL4' },
                            { value: 'LOG_LOCAL7', label: 'LOG_LOCAL7' }
                        ] }
                    ]
                },
                {
                    title: 'Log Forwarding Profili', icon: 'fas fa-share-square',
                    info: 'Profil adı <code>default</code> verilirse PAN-OS yeni kurallara bu profili otomatik atar (iron-skillet böyle kullanır).',
                    fields: [
                        { name: 'lf_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'default', hint: 'Objects > Log Forwarding', why: 'Log forwarding profili kurala atanmadıkça hiçbir trafik/tehdit logu SIEM\'e gitmez; sadece yerel diskte kalır.' },
                        { name: 'lf_traffic', label: 'Traffic logları', type: 'checkbox', checked: true },
                        { name: 'lf_threat', label: 'Threat logları', type: 'checkbox', checked: true, why: 'Tehdit logu SIEM\'e gitmezse IPS/AV tespitleri merkezi olarak görülmez — olay müdahalesinin ana girdisi budur.' },
                        { name: 'lf_url', label: 'URL logları', type: 'checkbox', checked: true },
                        { name: 'lf_wildfire', label: 'WildFire logları', type: 'checkbox', checked: true },
                        { name: 'lf_data', label: 'Data filtering logları', type: 'checkbox', checked: false },
                        { name: 'lf_tunnel', label: 'Tunnel logları', type: 'checkbox', checked: false },
                        { name: 'lf_auth', label: 'Authentication logları', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Sistem / Konfig Logları ve Kural Ataması', icon: 'fas fa-cogs',
                    fields: [
                        { name: 'lf_sysconf', label: 'System + Config loglarını da gönder', type: 'checkbox', checked: true, hint: 'Device > Log Settings', why: 'Config logu kimin ne değiştirdiğini gösterir; denetimde ilk istenen kayıttır ve yalnız cihazda tutulursa silinebilir.' },
                        { name: 'lf_rule', label: 'Profili Atanacak Güvenlik Kuralı', type: 'text', placeholder: 'Allow_LAN_to_WAN', hint: 'Boş bırakılırsa kural ataması yazılmaz', why: 'Profil kurala atanmadıkça trafik/tehdit logları iletilmez.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaLogFwdGen(data));
    }
};
function cgPaLogFwdGen(data) {
    const sp = cgEsc(data.lf_sl_profile || ''), ss = cgEsc(data.lf_sl_server || ''), ip = cgEsc(data.lf_sl_ip || '');
    const tr = cgEsc(data.lf_sl_transport || 'UDP'), port = cgEsc(data.lf_sl_port || '');
    const fmt = cgEsc(data.lf_sl_format || 'BSD'), fac = cgEsc(data.lf_sl_facility || 'LOG_USER');
    const lf = cgEsc(data.lf_name || ''), rule = cgEsc(data.lf_rule || '');
    const sb = 'set shared log-settings syslog ' + sp + ' server ' + ss;
    let c = '# ========================================\n# Palo Alto — Syslog Server Profile + Log Forwarding\n# ========================================\n\n';
    c += '# Syslog sunucu profili\n';
    c += sb + ' server ' + ip + '\n';
    c += sb + ' transport ' + tr + '\n';
    c += sb + ' port ' + port + '\n';
    c += sb + ' format ' + fmt + '\n';
    c += sb + ' facility ' + fac + '\n\n';
    const types = [['lf_traffic', 'traffic', 'Traffic'], ['lf_threat', 'threat', 'Threat'], ['lf_url', 'url', 'URL'], ['lf_wildfire', 'wildfire', 'Wildfire'],
                   ['lf_data', 'data', 'Data'], ['lf_tunnel', 'tunnel', 'Tunnel'], ['lf_auth', 'auth', 'Auth']].filter(t => data[t[0]]);
    c += '# Log Forwarding profili\n';
    if (!types.length) c += '# UYARI: hiçbir log tipi seçilmedi — profil hiçbir logu iletmez.\n';
    types.forEach(t => {
        const mb = 'set shared log-settings profiles ' + lf + ' match-list ' + t[2] + '_Log_Forwarding';
        c += mb + ' log-type ' + t[1] + '\n';
        c += mb + ' filter "All Logs"\n';
        c += mb + ' send-syslog ' + sp + '\n';
    });
    c += '\n';
    if (data.lf_sysconf) {
        c += '# System ve Config logları (Device > Log Settings)\n';
        c += 'set shared log-settings system match-list System_Log_Forwarding filter "All Logs"\n';
        c += 'set shared log-settings system match-list System_Log_Forwarding send-syslog ' + sp + '\n';
        c += 'set shared log-settings config match-list Configuration_Log_Forwarding filter "All Logs"\n';
        c += 'set shared log-settings config match-list Configuration_Log_Forwarding send-syslog ' + sp + '\n\n';
    }
    if (rule) c += '# Kurala ata\nset rulebase security rules "' + rule + '" log-setting ' + lf + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show shared log-settings syslog ' + sp + '   (configure modu)\n# show shared log-settings profiles ' + lf + '   (configure modu)\n# show log traffic direction equal backward\n';
    const w = [];
    if (!rule) w.push('⚠ Kural seçilmedi: log iletim profili bir güvenlik kuralına log-setting ile bağlanmadıkça hiçbir trafik logu iletilmez (pan-11).');
    w.push('ℹ Varsayılan kurallar (intrazone-default, interzone-default) log yazmaz: reddedilen trafiği SIEM\'de görmek için interzone-default\'u override edip loglamayı açın ya da en alta loglayan bir deny kuralı ekleyin ve bu profili ona da bağlayın (pan-11).');
    w.push('ℹ Syslog varsayılan olarak yönetim arayüzünden (MGT) gönderilir; toplayıcı yalnız veri ağındaysa syslog için service route ayarlayın.');
    if (tr === 'UDP') w.push('ℹ UDP syslog iletimi garanti etmez; kayıp kabul edilemeyen loglar için TCP ya da SSL (6514) kullanın.');
    return { config: c, warnings: w };
}

// ── Palo Alto: Device Setup (DNS / NTP / Banner / Management) ───────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/iron-skillet/blob/panos_v10.1/templates/panos/set_commands/iron_skillet_panos_full.conf
//            (deviceconfig system hostname / dns-setting / ntp-servers / login-banner / timezone,
//             deviceconfig setting management idle-timeout / admin-lockout)
PaloAlto.devsetup = {
    label: 'Device Setup (DNS/NTP/Banner)',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-sliders-h', title: 'Device Setup (PAN-OS)', desc: 'Hostname, DNS, NTP, saat dilimi, giriş banner\'ı ve yönetim oturum sertleştirmesi — iron-skillet best-practice değerleri.<br><code>set deviceconfig system ntp-servers primary-ntp-server ntp-server-address 0.pool.ntp.org</code>' },
            sections: [
                {
                    title: 'Kimlik ve DNS', icon: 'fas fa-id-card',
                    fields: [
                        { name: 'ds_hostname', label: 'Hostname', type: 'text', validate: 'hostname', required: true, placeholder: 'PA-FW-01', hint: 'Cihaz adı' },
                        { name: 'ds_dns1', label: 'Birincil DNS', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.53', why: 'DNS yoksa dinamik güncellemeler (Threat/AV/WildFire), lisans ve FQDN nesneleri çalışmaz; cihaz imzasız kalır.' },
                        { name: 'ds_dns2', label: 'İkincil DNS', type: 'text', validate: 'ip', placeholder: '192.0.2.54' }
                    ]
                },
                {
                    title: 'Zaman', icon: 'fas fa-clock',
                    fields: [
                        { name: 'ds_ntp1', label: 'Birincil NTP', type: 'text', validate: 'hostname', required: true, placeholder: '0.pool.ntp.org', hint: 'IP veya FQDN', why: 'Log zaman damgası, sertifika doğrulaması ve HA senkronu doğru saate bağlıdır.' },
                        { name: 'ds_ntp2', label: 'İkincil NTP', type: 'text', validate: 'hostname', placeholder: '1.pool.ntp.org' },
                        { name: 'ds_tz', label: 'Saat Dilimi', type: 'text', required: true, placeholder: 'UTC', hint: 'Ör: UTC, Europe/Istanbul (iron-skillet UTC önerir)', why: 'Birden çok cihazda aynı dilim (tercihen UTC) log korelasyonunu kolaylaştırır.' }
                    ]
                },
                {
                    title: 'Yönetim Erişimi', icon: 'fas fa-user-lock',
                    fields: [
                        { name: 'ds_banner', label: 'Login Banner', type: 'text', placeholder: 'Yetkisiz erisim yasaktir.', hint: 'Girişte gösterilecek uyarı metni', why: 'Yasal uyarı bannerı, yetkisiz erişimde hukuki süreç için çoğu mevzuatta beklenir.' },
                        { name: 'ds_idle', label: 'Idle Timeout (dk)', type: 'text', min: 1, max: 1440, placeholder: '10', hint: 'iron-skillet: 10', why: 'Açık bırakılan yönetim oturumu, masasından kalkan yöneticinin yetkisini başkasına verir.' },
                        { name: 'ds_lock_att', label: 'Kilitleme — Başarısız Deneme', type: 'text', min: 1, max: 10, placeholder: '5', hint: 'iron-skillet: 5' },
                        { name: 'ds_lock_time', label: 'Kilitleme Süresi (dk)', type: 'text', min: 1, max: 60, placeholder: '30', hint: 'iron-skillet: 30', why: 'Kaba kuvvet denemelerini yavaşlatır. Çok uzun süre, meşru yöneticiyi de dışarıda bırakabilir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaDevSetupGen(data));
    }
};
function cgPaDevSetupGen(data) {
    const hn = cgEsc(data.ds_hostname || ''), d1 = cgEsc(data.ds_dns1 || ''), d2 = cgEsc(data.ds_dns2 || '');
    const n1 = cgEsc(data.ds_ntp1 || ''), n2 = cgEsc(data.ds_ntp2 || ''), tz = cgEsc(data.ds_tz || '');
    const banner = cgEsc(data.ds_banner || ''), idle = cgEsc(data.ds_idle || '');
    const la = cgEsc(data.ds_lock_att || ''), lt = cgEsc(data.ds_lock_time || '');
    const s = 'set deviceconfig system ';
    let c = '# ========================================\n# Palo Alto — Device Setup\n# ========================================\n\n';
    c += s + 'hostname ' + hn + '\n';
    c += s + 'dns-setting servers primary ' + d1 + '\n';
    if (d2) c += s + 'dns-setting servers secondary ' + d2 + '\n';
    c += s + 'ntp-servers primary-ntp-server ntp-server-address ' + n1 + '\n';
    if (n2) c += s + 'ntp-servers secondary-ntp-server ntp-server-address ' + n2 + '\n';
    c += s + 'timezone ' + tz + '\n';
    if (banner) c += s + 'login-banner "' + banner + '"\n';
    if (idle || la || lt) c += '\n# Yönetim oturumu sertleştirme\n';
    if (idle) c += 'set deviceconfig setting management idle-timeout ' + idle + '\n';
    if (la) c += 'set deviceconfig setting management admin-lockout failed-attempts ' + la + '\n';
    if (lt) c += 'set deviceconfig setting management admin-lockout lockout-time ' + lt + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show system info\n# show ntp\n# show clock\n';
    return c;
}

// ── Palo Alto: LDAP / RADIUS Server Profile + Authentication Profile ─────────
// Sözdizimi: https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/device.py
//            (LdapServerProfile/LdapServer, AuthenticationProfile: method/{ldap,radius}/server-profile, login-attribute, allow-list, lockout)
//            https://github.com/PaloAltoNetworks/pango/tree/main/device/profiles/radius (server ip-address/port, timeout, retries; 'shared' konumu)
//            https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000ClqECAS (server-profile radius set örnekleri)
// Gizli alanlar (bind-password / secret) YAZILMAZ: set CLI'da düz metin kabulü resmi örnekle doğrulanamadı.
PaloAlto.authprof = {
    label: 'LDAP/RADIUS + Auth Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-user-shield', title: 'Authentication Profile (PAN-OS)', desc: 'LDAP veya RADIUS sunucu profili ve onu kullanan authentication profile. Yönetici girişi, GlobalProtect ve captive portal bu profili kullanır.<br><code>set shared authentication-profile AUTH-LDAP method ldap server-profile LDAP-AD</code>' },
            configTypes: [
                { id: 'ldap', label: 'LDAP / Active Directory', icon: 'fas fa-sitemap', desc: 'AD kullanıcı ve grupları', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'radius', label: 'RADIUS', icon: 'fas fa-broadcast-tower', desc: 'NPS / ISE / MFA sunucusu' }
            ],
            sections: [
                {
                    title: 'LDAP Sunucu Profili', icon: 'fas fa-sitemap', showFor: ['ldap'],
                    warn: 'Bind parolası bu çıktıda YOKTUR — GUI\'den girin: Device > Server Profiles > LDAP > Bind Password.',
                    fields: [
                        { name: 'ap_ld_profile', label: 'LDAP Profil Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'LDAP-AD' },
                        { name: 'ap_ld_srvname', label: 'Sunucu Kayıt Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'DC-01' },
                        { name: 'ap_ld_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: '10.0.0.10' },
                        { name: 'ap_ld_port', label: 'Port', type: 'text', validate: 'port', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: '636', hint: 'LDAPS 636, düz LDAP 389', why: '389 üzerinde SSL kapalıyken bind parolası ağda <b>açık metin</b> gider.' },
                        { name: 'ap_ld_type', label: 'LDAP Tipi', type: 'select', options: [
                            { value: 'active-directory', label: 'Active Directory', selected: true },
                            { value: 'e-directory', label: 'eDirectory' },
                            { value: 'sun', label: 'Sun' },
                            { value: 'other', label: 'Other' }
                        ] },
                        { name: 'ap_ld_base', label: 'Base DN', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'DC=example,DC=com' },
                        { name: 'ap_ld_binddn', label: 'Bind DN', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'svc-paloalto@example.com', hint: 'Salt-okur servis hesabı', why: 'Bind hesabı yalnız okuma yetkili olmalı; domain admin kullanmak, cihaz ele geçirilirse tüm AD\'yi açar.' },
                        { name: 'ap_ld_ssl', label: 'SSL/TLS', type: 'checkbox', checked: true },
                        { name: 'ap_ld_verify', label: 'Sunucu Sertifikasını Doğrula', type: 'checkbox', checked: true, why: 'Doğrulama kapalıysa araya giren sahte bir LDAP sunucusu kimlik bilgilerini toplayabilir.' },
                        { name: 'ap_ld_attr', label: 'Login Attribute', type: 'text', placeholder: 'sAMAccountName', hint: 'AD için genelde sAMAccountName veya userPrincipalName' }
                    ]
                },
                {
                    title: 'RADIUS Sunucu Profili', icon: 'fas fa-broadcast-tower', showFor: ['radius'],
                    warn: 'Paylaşılan anahtar (secret) bu çıktıda YOKTUR — GUI\'den girin: Device > Server Profiles > RADIUS > Secret.',
                    fields: [
                        { name: 'ap_rd_profile', label: 'RADIUS Profil Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: 'RADIUS-NPS' },
                        { name: 'ap_rd_srvname', label: 'Sunucu Kayıt Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: 'NPS-01' },
                        { name: 'ap_rd_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: '10.0.0.20' },
                        { name: 'ap_rd_port', label: 'Port', type: 'text', validate: 'port', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: '1812' },
                        { name: 'ap_rd_timeout', label: 'Timeout (sn)', type: 'text', min: 1, max: 120, placeholder: '3', hint: 'MFA push kullanılıyorsa artırın', why: 'MFA onayı beklenirken timeout dolarsa kullanıcı onay verse bile giriş reddedilir.' },
                        { name: 'ap_rd_retries', label: 'Deneme Sayısı', type: 'text', min: 1, max: 5, placeholder: '3' }
                    ]
                },
                {
                    title: 'Authentication Profile', icon: 'fas fa-user-shield',
                    fields: [
                        { name: 'ap_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'AUTH-DIRECTORY' },
                        { name: 'ap_allow', label: 'Allow List', type: 'text', required: true, placeholder: 'all', hint: 'all veya kullanıcı/grup adları (boşlukla)', why: '<code>all</code> dizindeki herkesin kimlik doğrulamasına izin verir. Yönetici girişi için yalnız yetkili grubu yaz.' },
                        { name: 'ap_lock_att', label: 'Kilitleme — Başarısız Deneme', type: 'text', min: 1, max: 10, placeholder: '5' },
                        { name: 'ap_lock_time', label: 'Kilitleme Süresi (dk)', type: 'text', min: 1, max: 60, placeholder: '30' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaAuthProfGen(data));
    }
};
function cgPaAuthProfGen(data) {
    const isRad = data._cgtype === 'radius';
    const ap = cgEsc(data.ap_name || ''), allow = cgEsc(cgPaList(data.ap_allow));
    const la = cgEsc(data.ap_lock_att || ''), lt = cgEsc(data.ap_lock_time || '');
    let c = '# ========================================\n# Palo Alto — ' + (isRad ? 'RADIUS' : 'LDAP') + ' Server Profile + Authentication Profile\n# ========================================\n\n';
    let prof;
    if (isRad) {
        prof = cgEsc(data.ap_rd_profile || '');
        const sn = cgEsc(data.ap_rd_srvname || ''), to = cgEsc(data.ap_rd_timeout || ''), rt = cgEsc(data.ap_rd_retries || '');
        const b = 'set shared server-profile radius ' + prof;
        c += b + ' server ' + sn + ' ip-address ' + cgEsc(data.ap_rd_ip || '') + '\n';
        c += b + ' server ' + sn + ' port ' + cgEsc(data.ap_rd_port || '') + '\n';
        if (to) c += b + ' timeout ' + to + '\n';
        if (rt) c += b + ' retries ' + rt + '\n';
        c += '# Secret: GUI > Device > Server Profiles > RADIUS > ' + prof + ' > ' + sn + ' (CLI ile yazılmadı)\n\n';
    } else {
        prof = cgEsc(data.ap_ld_profile || '');
        const sn = cgEsc(data.ap_ld_srvname || '');
        const b = 'set shared server-profile ldap ' + prof;
        c += b + ' server ' + sn + ' address ' + cgEsc(data.ap_ld_ip || '') + '\n';
        c += b + ' server ' + sn + ' port ' + cgEsc(data.ap_ld_port || '') + '\n';
        c += b + ' ldap-type ' + cgEsc(data.ap_ld_type || 'active-directory') + '\n';
        c += b + ' base "' + cgEsc(data.ap_ld_base || '') + '"\n';
        c += b + ' bind-dn "' + cgEsc(data.ap_ld_binddn || '') + '"\n';
        c += b + ' ssl ' + (data.ap_ld_ssl ? 'yes' : 'no') + '\n';
        c += b + ' verify-server-certificate ' + (data.ap_ld_verify ? 'yes' : 'no') + '\n';
        if (!data.ap_ld_ssl) c += '# UYARI: SSL kapalı — bind parolası ve kullanıcı parolaları ağda açık metin gider.\n';
        c += '# Bind Password: GUI > Device > Server Profiles > LDAP > ' + prof + ' (CLI ile yazılmadı)\n\n';
    }
    const m = isRad ? 'radius' : 'ldap';
    const ab = 'set shared authentication-profile ' + ap;
    c += ab + ' method ' + m + ' server-profile ' + prof + '\n';
    if (!isRad && data.ap_ld_attr) c += ab + ' method ldap login-attribute ' + cgEsc(data.ap_ld_attr) + '\n';
    c += ab + ' allow-list [ ' + allow + ' ]\n';
    if (la) c += ab + ' lockout failed-attempts ' + la + '\n';
    if (lt) c += ab + ' lockout lockout-time ' + lt + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show authentication allowlist\n# test authentication authentication-profile ' + ap + ' username <kullanici> password\n';
    return c;
}

// ── Palo Alto: Administrator + Password Complexity ───────────────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/iron-skillet/blob/panos_v10.1/templates/panos/set_commands/iron_skillet_panos_full.conf
//            (mgt-config users ... password / permissions role-based superuser yes / password-complexity / delete mgt-config users admin)
//            https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/device.py (Administrator: superreader, authentication-profile)
PaloAlto.admin = {
    label: 'Administrator + Parola Politikası',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-user-cog', title: 'Administrator (PAN-OS)', desc: 'Yönetici hesabı, dinamik rol ve iron-skillet parola karmaşıklığı politikası.<br><code>set mgt-config users netadmin permissions role-based superuser yes</code>' },
            sections: [
                {
                    title: 'Yönetici Hesabı', icon: 'fas fa-user-cog',
                    fields: [
                        { name: 'adm_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin' },
                        { name: 'adm_role', label: 'Rol', type: 'select', options: [
                            { value: 'superreader', label: 'Superuser (read-only)', selected: true },
                            { value: 'superuser', label: 'Superuser (tam yetki)' }
                        ], why: 'En az yetki ilkesi: izleme/denetim hesapları salt-okur olmalı. Tam yetkili hesap sayısı az tutulmalı.' },
                        { name: 'adm_authprof', label: 'Authentication Profile', type: 'text', placeholder: 'AUTH-DIRECTORY', hint: 'Boşsa yerel parola (etkileşimli) sorulur', why: 'Merkezi kimlik doğrulama, personel ayrıldığında hesabın tek yerden kapatılmasını sağlar.' }
                    ]
                },
                {
                    title: 'Sertleştirme', icon: 'fas fa-lock',
                    fields: [
                        { name: 'adm_pwc', label: 'Parola karmaşıklığı (iron-skillet)', type: 'checkbox', checked: true, hint: 'min 12 karakter, büyük/küçük/rakam/özel, 24 geçmiş', why: 'Yerel hesap parolaları için tek savunma budur; kapalıysa kısa parola kabul edilir.' },
                        { name: 'adm_deldef', label: 'Varsayılan "admin" hesabını sil', type: 'checkbox', checked: false, why: 'Varsayılan kullanıcı adı kaba kuvvet saldırılarının ilk hedefidir. <b>Yeni hesapla giriş yapıp commit ettikten sonra</b> uygulayın, yoksa cihazdan kilitlenirsiniz.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaAdminGen(data));
    }
};
function cgPaAdminGen(data) {
    const u = cgEsc(data.adm_user || ''), role = data.adm_role === 'superuser' ? 'superuser' : 'superreader';
    const ap = cgEsc(data.adm_authprof || '');
    const b = 'set mgt-config users ' + u;
    let c = '# ========================================\n# Palo Alto — Administrator\n# ========================================\n\n';
    c += b + ' permissions role-based ' + role + ' yes\n';
    if (ap) c += b + ' authentication-profile ' + ap + '\n';
    else c += b + ' password\n# (yukarıdaki komut parolayı etkileşimli olarak iki kez sorar)\n';
    c += '\n';
    if (data.adm_pwc) {
        const p = 'set mgt-config password-complexity ';
        c += '# Parola karmaşıklığı (iron-skillet)\n';
        c += p + 'enabled yes\n' + p + 'minimum-length 12\n' + p + 'minimum-uppercase-letters 1\n' + p + 'minimum-lowercase-letters 1\n';
        c += p + 'minimum-numeric-letters 1\n' + p + 'minimum-special-characters 1\n' + p + 'block-username-inclusion yes\n';
        c += p + 'password-history-count 24\n' + p + 'new-password-differs-by-characters 3\n\n';
    }
    if (data.adm_deldef) {
        c += '# UYARI: önce yeni hesapla giriş yapıp commit edin; aksi halde cihazdan kilitlenirsiniz.\n';
        c += 'delete mgt-config users admin\n\n';
    }
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show admins\n# show mgt-config users ' + u + '   (configure modu)\n';
    return c;
}

// ── Palo Alto: Tunnel Monitor ────────────────────────────────────────────────
// Sözdizimi: https://docs.paloaltonetworks.com/pan-os/11-1/pan-os-web-interface-help/network/network-network-profiles/network-network-profiles-monitor
//            (action wait-recover|fail-over, interval 2-10 vars.3, threshold 2-10 vars.5)
//            https://github.com/PaloAltoNetworks/pango/tree/main/network/profiles/monitor (network profiles monitor-profile)
//            https://github.com/PaloAltoNetworks/pango/tree/main/network/tunnel/ipsec (tunnel-monitor enable / destination-ip / tunnel-monitor-profile / proxy-id)
PaloAlto.tunnelmon = {
    label: 'Tunnel Monitor',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-heartbeat', title: 'IPSec Tunnel Monitor (PAN-OS)', desc: 'Monitor profili ve mevcut bir IPSec tüneline izleme hedefi. Tünel içinden ping ile canlılık kontrol eder; fail-over ile yedek yola geçiş sağlar.<br><code>set network tunnel ipsec IPSEC-BRANCH tunnel-monitor enable yes</code>' },
            sections: [
                {
                    title: 'Monitor Profili', icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'tm_profile', label: 'Profil Adı', type: 'text', required: true, placeholder: 'TM-FAILOVER' },
                        { name: 'tm_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'wait-recover', label: 'wait-recover (bekle)', selected: true },
                            { value: 'fail-over', label: 'fail-over (yedek yola geç)' }
                        ], why: '<code>fail-over</code> tünel düşünce tünel rotasını tablodan çeker; yedek rota (ör. ikinci tünel, daha yüksek metrik) yoksa trafik tamamen kesilir.' },
                        { name: 'tm_interval', label: 'Interval (sn)', type: 'text', required: true, min: 2, max: 10, placeholder: '3', hint: 'PAN-OS varsayılanı 3' },
                        { name: 'tm_threshold', label: 'Threshold', type: 'text', required: true, min: 2, max: 10, placeholder: '5', hint: 'Kaç kayıp pingten sonra tünel düşmüş sayılır (varsayılan 5)', why: 'Düşük eşik kısa kayıplarda gereksiz failover/flap üretir; yüksek eşik kesintiyi geç fark eder.' }
                    ]
                },
                {
                    title: 'Tünel', icon: 'fas fa-project-diagram',
                    info: 'Tünel arayüzünün (tunnel.X) bir IP adresi olmalı; ping bu adresten kaynaklanır.',
                    fields: [
                        { name: 'tm_tunnel', label: 'IPSec Tünel Adı', type: 'text', required: true, placeholder: 'IPSEC-BRANCH', hint: 'Network > IPSec Tunnels altındaki ad' },
                        { name: 'tm_dest', label: 'İzlenecek Hedef IP', type: 'text', validate: 'ip', required: true, placeholder: '10.64.0.1', hint: 'Karşı uçta tünel üzerinden erişilen, ping\'e yanıt veren adres', why: 'Hedef karşı tarafta ping\'e kapalıysa tünel sürekli "down" görünür ve fail-over boşuna tetiklenir.' },
                        { name: 'tm_proxy', label: 'Proxy-ID', type: 'text', placeholder: 'PID-LAN', hint: 'Tünelde birden çok proxy-id varsa izlemenin hangisinden yapılacağı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaTunnelMonGen(data));
    }
};
function cgPaTunnelMonGen(data) {
    const p = cgEsc(data.tm_profile || ''), act = data.tm_action === 'fail-over' ? 'fail-over' : 'wait-recover';
    const iv = cgEsc(data.tm_interval || ''), th = cgEsc(data.tm_threshold || '');
    const t = cgEsc(data.tm_tunnel || ''), dst = cgEsc(data.tm_dest || ''), pid = cgEsc(data.tm_proxy || '');
    const mp = 'set network profiles monitor-profile ' + p;
    const tb = 'set network tunnel ipsec ' + t + ' tunnel-monitor';
    let c = '# ========================================\n# Palo Alto — IPSec Tunnel Monitor\n# ========================================\n\n';
    c += mp + ' action ' + act + '\n' + mp + ' interval ' + iv + '\n' + mp + ' threshold ' + th + '\n\n';
    c += tb + ' enable yes\n' + tb + ' destination-ip ' + dst + '\n' + tb + ' tunnel-monitor-profile ' + p + '\n';
    if (pid) c += tb + ' proxy-id ' + pid + '\n';
    if (act === 'fail-over') c += '# NOT: fail-over yalnız yedek rota (ikinci tünel / daha yüksek metrikli statik rota) varsa işe yarar.\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show vpn ipsec-sa tunnel ' + t + '\n# show running tunnel flow info\n';
    return c;
}

// ── Palo Alto: Zone Protection Profile ───────────────────────────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/iron-skillet/blob/panos_v10.1/templates/panos/set_commands/iron_skillet_panos_full.conf
//            (zone-protection-profile scan 8001/8002/8003, discard-ip-spoof, discard-malformed-option, remove-tcp-timestamp)
//            https://github.com/PaloAltoNetworks/pango/tree/main/network/profiles/zoneprotection (flood tcp-syn syn-cookies / udp red / icmp red: alarm-rate, activate-rate, maximal-rate)
//            https://github.com/PaloAltoNetworks/pango/tree/main/network/zone (zone ... network zone-protection-profile)
PaloAlto.zoneprot = {
    label: 'Zone Protection Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-shield-virus', title: 'Zone Protection Profile (PAN-OS)', desc: 'Flood (SYN/UDP/ICMP), keşif taraması ve paket tabanlı saldırı koruması; iron-skillet önerisi her zone\'a atanmasıdır.<br><code>set zone outside network zone-protection-profile ZP-INTERNET</code>' },
            sections: [
                {
                    title: 'Profil', icon: 'fas fa-shield-virus',
                    fields: [
                        { name: 'zp_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'ZP-INTERNET' },
                        { name: 'zp_zone', label: 'Atanacak Zone', type: 'text', placeholder: 'outside', hint: 'Boşsa atama satırı yazılmaz', why: 'Profil bir zone\'a atanmadıkça hiçbir etkisi olmaz. Önce internet yönlü zone\'a uygula.' }
                    ]
                },
                {
                    title: 'SYN Flood (SYN Cookies)', icon: 'fas fa-water',
                    info: 'Eşikler zone\'a gelen toplam bağlantı/sn değeridir. Önce normal trafiği ölçün; iron-skillet eşik vermez, aşağıdaki örnekler PAN-OS varsayılanlarıdır.',
                    fields: [
                        { name: 'zp_syn', label: 'SYN flood koruması', type: 'checkbox', checked: true, why: 'SYN cookies, oturum tablosunu doldurmadan sahte SYN\'leri eler; RED\'e göre meşru trafiği daha az düşürür.' },
                        { name: 'zp_syn_alarm', label: 'Alarm (cps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_syn', checked: true }, placeholder: '10000' },
                        { name: 'zp_syn_act', label: 'Activate (cps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_syn', checked: true }, placeholder: '10000' },
                        { name: 'zp_syn_max', label: 'Maximum (cps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_syn', checked: true }, placeholder: '40000', why: 'Maximum aşılınca fazlası düşürülür. Değer normal tepe trafiğinin altındaysa meşru bağlantılar kesilir.' }
                    ]
                },
                {
                    title: 'UDP / ICMP Flood (RED)', icon: 'fas fa-water',
                    fields: [
                        { name: 'zp_udp', label: 'UDP flood koruması', type: 'checkbox', checked: true },
                        { name: 'zp_udp_alarm', label: 'UDP Alarm (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_udp', checked: true }, placeholder: '10000' },
                        { name: 'zp_udp_act', label: 'UDP Activate (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_udp', checked: true }, placeholder: '10000' },
                        { name: 'zp_udp_max', label: 'UDP Maximum (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_udp', checked: true }, placeholder: '40000' },
                        { name: 'zp_icmp', label: 'ICMP flood koruması', type: 'checkbox', checked: true },
                        { name: 'zp_icmp_alarm', label: 'ICMP Alarm (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_icmp', checked: true }, placeholder: '10000' },
                        { name: 'zp_icmp_act', label: 'ICMP Activate (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_icmp', checked: true }, placeholder: '10000' },
                        { name: 'zp_icmp_max', label: 'ICMP Maximum (pps)', type: 'text', min: 1, max: 2000000, requiredIf: { field: 'zp_icmp', checked: true }, placeholder: '40000' }
                    ]
                },
                {
                    title: 'Keşif ve Paket Koruması (iron-skillet)', icon: 'fas fa-search',
                    fields: [
                        { name: 'zp_recon', label: 'Port/host taraması algılama (alert)', type: 'checkbox', checked: true, hint: 'TCP/UDP port scan ve host sweep — iron-skillet eşikleri', why: 'Keşif taraması saldırının ilk adımıdır; alert modu engellemeden görünürlük verir.' },
                        { name: 'zp_pkt', label: 'IP spoof / bozuk opsiyon düşür, TCP timestamp kaldır', type: 'checkbox', checked: true, why: 'Sahte kaynak adresli ve bozuk IP opsiyonlu paketler meşru trafikte görülmez; düşürmek güvenlidir.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaZoneProtGen(data));
    }
};
function cgPaZoneProtGen(data) {
    const n = cgEsc(data.zp_name || ''), z = cgEsc(data.zp_zone || '');
    const b = 'set network profiles zone-protection-profile ' + n;
    let c = '# ========================================\n# Palo Alto — Zone Protection Profile\n# ========================================\n\n';
    const flood = (key, path, label) => {
        const a = cgEsc(data['zp_' + key + '_alarm'] || ''), ac = cgEsc(data['zp_' + key + '_act'] || ''), mx = cgEsc(data['zp_' + key + '_max'] || '');
        let s = '# ' + label + '\n' + b + ' flood ' + path.split(' ')[0] + ' enable yes\n';
        if (a) s += b + ' flood ' + path + ' alarm-rate ' + a + '\n';
        if (ac) s += b + ' flood ' + path + ' activate-rate ' + ac + '\n';
        if (mx) s += b + ' flood ' + path + ' maximal-rate ' + mx + '\n';
        if (ac && mx && +ac > +mx) s += '# UYARI: activate-rate, maximal-rate\'ten büyük olamaz.\n';
        return s + '\n';
    };
    if (data.zp_syn) c += flood('syn', 'tcp-syn syn-cookies', 'SYN flood — SYN cookies');
    if (data.zp_udp) c += flood('udp', 'udp red', 'UDP flood — RED');
    if (data.zp_icmp) c += flood('icmp', 'icmp red', 'ICMP flood — RED');
    if (data.zp_recon) {
        c += '# Keşif koruması (iron-skillet)\n';
        [['8001', '2'], ['8002', '10'], ['8003', '2']].forEach(([id, iv]) => {
            c += b + ' scan ' + id + ' action alert\n' + b + ' scan ' + id + ' interval ' + iv + '\n' + b + ' scan ' + id + ' threshold 100\n';
        });
        c += '\n';
    }
    if (data.zp_pkt) {
        c += '# Paket tabanlı koruma (iron-skillet)\n';
        c += b + ' discard-ip-spoof yes\n' + b + ' discard-malformed-option yes\n' + b + ' remove-tcp-timestamp yes\n\n';
    }
    if (!data.zp_syn && !data.zp_udp && !data.zp_icmp && !data.zp_recon && !data.zp_pkt)
        c += '# UYARI: hiçbir koruma seçilmedi — profil boş.\n\n';
    if (z) c += '# Zone\'a ata\nset zone ' + z + ' network zone-protection-profile ' + n + '\n\n';
    else c += '# NOT: profil bir zone\'a atanmadıkça etkisizdir (set zone <zone> network zone-protection-profile ' + n + ').\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show zone-protection zone ' + (z || '<zone>') + '\n';
    return c;
}

// ── Palo Alto: Application Override ──────────────────────────────────────────
// Sözdizimi: https://github.com/PaloAltoNetworks/pan-os-python/blob/develop/panos/policies.py
//            (ApplicationOverride: rulebase application-override rules — from / to / source / destination / protocol / port / application / description)
PaloAlto.appoverride = {
    label: 'Application Override',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-random', title: 'Application Override (PAN-OS)', desc: 'Belirli port/protokoldeki trafiği App-ID yerine sabit (özel) uygulama olarak işaretler. Önce <b>Custom Application</b> aracıyla uygulamayı tanımlayın.<br><code>set rulebase application-override rules "AO-LEGACY" application custom-legacy-app</code>' },
            sections: [
                {
                    title: 'Kural', icon: 'fas fa-random',
                    warn: 'Application override edilen oturumlar Layer-7 (App-ID, tehdit) denetiminden geçmez. Yalnız güvenilir iç uygulamalar için ve dar kaynak/hedefle kullanın.',
                    fields: [
                        { name: 'ao_name', label: 'Kural Adı', type: 'text', required: true, placeholder: 'AO-LEGACY-APP' },
                        { name: 'ao_from', label: 'Kaynak Zone', type: 'text', required: true, placeholder: 'inside' },
                        { name: 'ao_to', label: 'Hedef Zone', type: 'text', required: true, placeholder: 'dmz' },
                        { name: 'ao_src', label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'APP-CLIENTS', hint: 'Adres nesnesi/grubu; boşlukla birden çok', why: '<code>any</code> kaynak, tehdit denetimini atlayan bir yolu herkese açar.' },
                        { name: 'ao_dst', label: 'Hedef Adres', type: 'text', required: true, placeholder: 'APP-SERVER', hint: 'Adres nesnesi/grubu', why: 'Hedef ne kadar dar olursa denetimsiz trafik o kadar sınırlı kalır.' },
                        { name: 'ao_proto', label: 'Protokol', type: 'select', options: [
                            { value: 'tcp', label: 'TCP', selected: true },
                            { value: 'udp', label: 'UDP' }
                        ] },
                        { name: 'ao_port', label: 'Port', type: 'text', required: true, placeholder: '8443', hint: 'Tek port, aralık (8000-8010) veya virgüllü liste' },
                        { name: 'ao_app', label: 'Uygulama', type: 'text', required: true, placeholder: 'custom-legacy-app', hint: 'Custom Application adı', why: 'Güvenlik kuralında bu uygulama adına izin verilmelidir; override sadece tanımayı değiştirir, izin vermez.' },
                        { name: 'ao_desc', label: 'Açıklama', type: 'text', placeholder: 'Legacy uygulama - CHG-1234' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgPaAppOverrideGen(data));
    }
};
function cgPaAppOverrideGen(data) {
    const n = cgEsc(data.ao_name || ''), app = cgEsc(data.ao_app || ''), desc = cgEsc(data.ao_desc || '');
    const src = cgEsc(cgPaList(data.ao_src)), dst = cgEsc(cgPaList(data.ao_dst));
    const b = 'set rulebase application-override rules "' + n + '"';
    let c = '# ========================================\n# Palo Alto — Application Override\n# ========================================\n\n';
    if (/^any$/i.test(src) || /^any$/i.test(dst)) c += '# UYARI: kaynak veya hedef "any" — bu trafik tehdit denetimi olmadan geçer.\n';
    c += b + ' from ' + cgEsc(data.ao_from || '') + '\n';
    c += b + ' to ' + cgEsc(data.ao_to || '') + '\n';
    c += b + ' source [ ' + src + ' ]\n';
    c += b + ' destination [ ' + dst + ' ]\n';
    c += b + ' protocol ' + (data.ao_proto === 'udp' ? 'udp' : 'tcp') + '\n';
    c += b + ' port ' + cgEsc(data.ao_port || '') + '\n';
    c += b + ' application ' + app + '\n';
    if (desc) c += b + ' description ' + cgQ(data.ao_desc) + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show rulebase application-override rules "' + n + '"   (configure modu)\n# show session all filter application ' + app + '\n';
    return c;
}
