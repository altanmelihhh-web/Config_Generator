'use strict';

const PaloAlto = {};

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
                        { name: 'inside_ip', why: "İç arayüz IP'si; LAN istemcilerinin gateway'i olur.", label: 'Inside IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.1.1/24', hint: 'CIDR formatında LAN gateway IP' }
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
    const ztype = cgEsc(data.zone_type || 'layer3');
    const oz = cgEsc(data.outside_zone || ''), oi = cgEsc(data.outside_iface || ''), oip = cgEsc(data.outside_ip || '');
    const iz = cgEsc(data.inside_zone || ''), ii = cgEsc(data.inside_iface || ''), iip = cgEsc(data.inside_ip || '');
    const vr = cgEsc(data.vr || '');
    let c = '# ========================================\n# Palo Alto — Zone & Interface Configuration\n# ========================================\n\n';
    c += '# Outside Interface\nset network interface ethernet ' + oi + ' layer3 ip ' + oip + '\nset network interface ethernet ' + oi + ' layer3 mtu 1500\n\n';
    c += '# Inside Interface\nset network interface ethernet ' + ii + ' layer3 ip ' + iip + '\nset network interface ethernet ' + ii + ' layer3 mtu 1500\n\n';
    c += '# Zones\nset zone ' + oz + ' network ' + ztype + ' [ ' + oi + ' ]\nset zone ' + iz + ' network ' + ztype + ' [ ' + ii + ' ]\n\n';
    c += '# Virtual Router\nset network virtual-router ' + vr + ' interface [ ' + oi + ' ' + ii + ' ]\n\n';
    c += '# Doğrulama:\n# show zone\n# show interface all\n# show routing route\n';
    return c;
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
                        { name: 'netmask', why: "PAN-OS CIDR bekler. Tek host için <code>/32</code> yaz; ağ tanımlarken prefix'i unutmak nesneyi tek adrese daraltır ve kural beklediğinden çok dar çalışır.", label: 'IP / Prefix (CIDR)', type: 'text', validate: 'cidr', optional: true, placeholder: '192.168.1.10/32', hint: 'IP/Netmask tipi seçildiyse doldurun' },
                        { name: 'fqdn_val', why: "PAN-OS, FQDN'i periyodik çözer ve önbelleğe alır. DNS erişimi koparsa nesne eski IP ile kalır; erişim sorunlarının sessiz kaynağıdır.", label: 'FQDN', type: 'text', optional: true, placeholder: 'example.com', hint: 'FQDN tipi seçildiyse doldurun' },
                        { name: 'ip_range', why: "Range nesnesi, aradaki kullanılmayan adresler dahil <b>tüm</b> aralığı kapsar. İleride bu bloğa eklenecek her cihaz otomatik olarak aynı yetkiyi alır.", label: 'IP Range', type: 'text', validate: 'ip_range', optional: true, placeholder: '192.168.1.10-192.168.1.20', hint: 'IP Range tipi seçildiyse doldurun' },
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
    const name = cgEsc(data.addr_name || ''), type = cgEsc(data.addr_type || 'ip-netmask');
    const desc = cgEsc(data.desc || ''), grp = cgEsc(data.group_name || '');
    let c = '# ========================================\n# Palo Alto — Address Object\n# ========================================\n\n';
    if (type === 'ip-netmask') {
        c += 'set address "' + name + '" ' + type + ' ' + cgEsc(data.netmask || '') + '\n';
    } else if (type === 'fqdn') {
        c += 'set address "' + name + '" ' + type + ' ' + cgEsc(data.fqdn_val || '') + '\n';
    } else {
        c += 'set address "' + name + '" ' + type + ' ' + cgEsc(data.ip_range || '') + '\n';
    }
    if (desc) c += 'set address "' + name + '" description "' + desc + '"\n';
    c += '\n';
    if (grp) {
        c += '# Adres Grubuna Ekle\nset address-group "' + grp + '" static [ "' + name + '" ]\n\n';
    }
    c += '# Doğrulama:\n# show address "' + name + '"\n# show address-group\n';
    return c;
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
                        { name: 'to_zone', why: "Hedef zone. NAT uygulanıyorsa kuralda <b>çevrilmiş hedefin zone'u</b> değil, orijinal paketin gideceği zone yazılır — en kafa karıştırıcı noktalardan biri.", label: 'Hedef Zone', type: 'text', required: true, placeholder: 'outside', hint: 'Trafiğin gittiği zone' },
                        { name: 'src_addr', why: "Boş ya da <code>any</code> bırakmak, zone içindeki her cihaza aynı hakkı verir. Palo Alto kuralı zaten zone ile sınırlıdır; adresi daraltmamak bu sınırı anlamsız kılar.", label: 'Kaynak Adres', type: 'text', required: true, placeholder: 'LAN_SUBNET', hint: '"any" veya adres nesnesi adı (ör: LAN_SUBNET)' },
                        { name: 'dst_addr', why: "NAT kuralında hedef adres <b>pre-NAT</b> (çevrilmeden önceki) adrestir, ama zone <b>post-NAT</b> zone'dur. Bu asimetri Palo Alto'daki en klasik NAT hatasıdır.", label: 'Hedef Adres', type: 'text', required: true, placeholder: 'WEB_SERVERS', hint: '"any" veya hedef adres nesnesi' },
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
    let c = '# ========================================\n# Palo Alto — Security Policy\n# ========================================\n\n';
    if (data.action === 'allow' && [data.src_addr, data.dst_addr, data.application].every(x => /^any$/i.test(x || '')))
        c += '# UYARI: kaynak, hedef ve uygulama "any" — bu kural iki zone arasında TÜM trafiğe izin verir.\n';
    c += base + ' from ' + cgEsc(data.from_zone || '') + '\n';
    c += base + ' to ' + cgEsc(data.to_zone || '') + '\n';
    c += base + ' source [ ' + cgEsc(data.src_addr || '') + ' ]\n';
    c += base + ' destination [ ' + cgEsc(data.dst_addr || '') + ' ]\n';
    c += base + ' application [ ' + cgEsc(data.application || '') + ' ]\n';
    c += base + ' service ' + cgEsc(data.service || 'application-default') + '\n';
    c += base + ' action ' + cgEsc(data.action || '') + '\n';
    c += base + ' log-end ' + cgEsc(data.log_end || 'yes') + '\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show rulebase security rules "' + rname + '"\n# test security-policy-match from ' + cgEsc(data.from_zone || '') + ' to ' + cgEsc(data.to_zone || '') + ' source <ip> destination <ip>\n';
    return c;
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
                        { name: 'to_iface', why: "Interface NAT'ta çıkış arayüzünün IP'si kullanılır — ISS'den tek IP alıyorsan doğru seçimdir.", label: 'To Interface (Interface NAT için)', type: 'text', validate: 'iface', optional: true, placeholder: 'ethernet1/1', hint: 'Dynamic IP+Port Interface seçildiyse WAN arayüzü' }
                    ]
                },
                {
                    title: 'Destination NAT Ayarları',
                    icon: 'fas fa-arrow-down',
                    showFor: ['destination'],
                    fields: [
                        { name: 'trans_dst_ip', why: "Destination NAT'ta iç sunucunun gerçek IP'si. <b>Güvenlik kuralında hedef adres olarak orijinal (dış) IP yazılır</b>, çevrilmiş IP değil — bu ayrımı kaçırmak en sık yapılan Palo Alto hatasıdır.", label: 'Translated Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.1.10', hint: 'İç sunucunun IP adresi' },
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
    const type = cgEsc(data._cgtype || 'source'), rname = cgEsc(data.rule_name || '');
    const base = 'set rulebase nat rules "' + rname + '"';
    let c = '# ========================================\n# Palo Alto — NAT Rule\n# ========================================\n\n';
    c += base + ' from ' + cgEsc(data.from_zone || '') + '\n';
    c += base + ' to ' + cgEsc(data.to_zone || '') + '\n';
    c += base + ' source [ ' + cgEsc(data.src_addr || '') + ' ]\n';
    c += base + ' destination [ ' + cgEsc(data.dst_addr || '') + ' ]\n';
    const svc = cgEsc(data.service || '');
    if (type === 'destination' && /^any$/i.test(svc)) c += '# UYARI: hedef NAT servis "any" — sunucunun TÜM portları dışarı açılır.\n';
    c += base + ' service ' + svc + '\n';
    if (type === 'source') {
        const trans = cgEsc(data.src_trans_type || 'dynamic-ip-and-port interface-address');
        const toIface = cgEsc(data.to_iface || '');
        c += base + ' source-translation ' + trans + '\n';
        if (toIface && trans.includes('interface')) {
            c += base + ' to-interface ' + toIface + '\n';
        }
    } else {
        const tdip = cgEsc(data.trans_dst_ip || ''), tdport = cgEsc(data.trans_dst_port || '');
        c += base + ' destination-translation translated-address ' + tdip + '\n';
        if (tdport) c += base + ' destination-translation translated-port ' + tdport + '\n';
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show rulebase nat rules "' + rname + '"\n# test nat-policy-match from ' + cgEsc(data.from_zone || '') + ' to ' + cgEsc(data.to_zone || '') + ' source <ip> destination <ip>\n';
    return c;
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
                        { name: 'proxy_local', why: "Proxy ID, hangi trafiğin şifreleneceğini belirler. <b>Route-based</b> VPN'de bile karşı taraf policy-based ise Proxy ID zorunludur.", label: 'Proxy ID — Yerel Subnet', type: 'text', required: true, placeholder: '192.168.1.0/24', hint: 'Bu taraftaki ilgili subnet' },
                        { name: 'proxy_remote', why: "İki tarafın Proxy ID'leri <b>ayna</b> olmalı: senin local'in karşının remote'u. Uyuşmazlık Phase 2'nin kurulmamasına yol açar.", label: 'Proxy ID — Uzak Subnet', type: 'text', required: true, placeholder: '10.0.0.0/24', hint: 'Karşı taraftaki ilgili subnet' }
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
    const peerIp = cgEsc(data.peer_ip || ''), psk = cgEsc(data.psk || ''), ikeVer = cgEsc(data.ike_ver || 'ikev2');
    const ikeEnc = cgEsc(data.ike_enc || 'aes-256-cbc'), ikeHash = cgEsc(data.ike_hash || 'sha256'), dhGrp = cgEsc(data.dh_grp || 'group14');
    const tunName = cgEsc(data.tunnel_name || ''), tunIface = cgEsc(data.tunnel_iface || '');
    const proxyLocal = cgEsc(data.proxy_local || ''), proxyRemote = cgEsc(data.proxy_remote || '');
    let c = '# ========================================\n# Palo Alto — IPSec VPN Configuration\n# ========================================\n\n';
    c += '# IKE Crypto Profile\nset network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" dh-group ' + dhGrp + '\n';
    c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" hash ' + ikeHash + '\n';
    c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" encryption ' + ikeEnc + '\n';
    c += 'set network ike crypto-profiles ike-crypto-profiles "' + ikeProf + '" lifetime hours 24\n\n';
    c += '# IPSec Crypto Profile\nset network ike crypto-profiles ipsec-crypto-profiles "' + ipsecProf + '" esp authentication ' + ikeHash + '\n';
    c += 'set network ike crypto-profiles ipsec-crypto-profiles "' + ipsecProf + '" esp encryption ' + ikeEnc + '\n';
    c += 'set network ike crypto-profiles ipsec-crypto-profiles "' + ipsecProf + '" dh-group ' + dhGrp + '\n';
    c += 'set network ike crypto-profiles ipsec-crypto-profiles "' + ipsecProf + '" lifetime hours 8\n\n';
    c += '# IKE Gateway\nset network ike gateway "' + gwName + '" interface ' + gwIface + '\n';
    c += 'set network ike gateway "' + gwName + '" peer-address ip ' + peerIp + '\n';
    c += 'set network ike gateway "' + gwName + '" authentication pre-shared-key key ' + psk + '\n';
    c += 'set network ike gateway "' + gwName + '" protocol ' + ikeVer + '\n';
    c += 'set network ike gateway "' + gwName + '" protocol-common ike-crypto-profile "' + ikeProf + '"\n\n';
    c += '# Tunnel Interface\nset network interface tunnel units ' + tunIface + '\n\n';
    c += '# IPSec Tunnel\nset network tunnel ipsec "' + tunName + '" tunnel-interface ' + tunIface + '\n';
    c += 'set network tunnel ipsec "' + tunName + '" ike gateway "' + gwName + '"\n';
    c += 'set network tunnel ipsec "' + tunName + '" ike ipsec-crypto-profile "' + ipsecProf + '"\n';
    c += 'set network tunnel ipsec "' + tunName + '" tunnel-monitor enable no\n\n';
    c += '# Proxy ID (Interesting Traffic)\nset network tunnel ipsec "' + tunName + '" tunnel-monitor destination-ip ' + peerIp + '\n';
    c += 'set network tunnel ipsec "' + tunName + '" auto-key proxy-id "proxy1" local ' + proxyLocal + '\n';
    c += 'set network tunnel ipsec "' + tunName + '" auto-key proxy-id "proxy1" remote ' + proxyRemote + '\n\n';
    c += '# Virtual Router — Tunnel Interface Ekle\nset network virtual-router default interface [ ' + tunIface + ' ]\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show vpn ike-sa gateway "' + gwName + '"\n# show vpn ipsec-sa tunnel "' + tunName + '"\n# show vpn flow tunnel-id all\n';
    return c;
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
                        ], hint: 'Primary cihaza düşük device-priority atanır (10), secondary\'ye 100' },
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
                        { name: 'ha1_ip', why: "HA1 kontrol bağlantısıdır; kopması split-brain riski doğurur. Mümkünse doğrudan kablo ya da ayrı bir yol kullan, üretim switch'i üzerinden geçirme.", label: 'HA1 IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '169.254.0.1/24', hint: 'Bu cihazın HA1 IP adresi' },
                        { name: 'ha1_peer', why: "Peer IP yanlışsa HA hiç kurulmaz ve iki cihaz da kendini aktif sanar. Her iki cihazda karşılıklı doğru girildiğini mutlaka teyit et.", label: 'HA1 Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '169.254.0.2', hint: 'Karşı cihazın HA1 IP adresi' }
                    ]
                },
                {
                    title: 'HA2 Interface (Data Sync)',
                    icon: 'fas fa-sync',
                    fields: [
                        { name: 'ha2_iface', why: 'HA2 veri kanalıdır (session senkronu). Kopması failover sırasında mevcut oturumların düşmesine yol açar.', label: 'HA2 Interface', type: 'text', validate: 'iface', required: true, placeholder: 'ethernet1/4', hint: 'HA data sync link arayüzü' },
                        { name: 'ha2_ip', why: "HA2 oturum senkronizasyonu taşır ve HA1 ile <b>aynı</b> alt ağda olmamalı. Aynı ağa koymak yönlendirme belirsizliği ve sessiz sync kaybı yaratır.", label: 'HA2 IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '169.254.1.1/24', hint: 'Bu cihazın HA2 IP adresi' }
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
    const role = cgEsc(data.ha_role || 'primary');
    const ha1Iface = cgEsc(data.ha1_iface || ''), ha1Ip = cgEsc(data.ha1_ip || '');
    const ha1Peer = cgEsc(data.ha1_peer || ''), ha2Iface = cgEsc(data.ha2_iface || ''), ha2Ip = cgEsc(data.ha2_ip || '');
    const grpId = cgEsc(data.grp_id || ''), preemptive = cgEsc(data.preemptive || 'yes');
    let c = '# ========================================\n# Palo Alto — HA Active-Passive (' + (role === 'primary' ? 'Primary' : 'Secondary') + ')\n# ========================================\n\n';
    c += 'set deviceconfig high-availability enabled yes\n';
    c += 'set deviceconfig high-availability group ' + grpId + ' mode active-passive\n';
    c += 'set deviceconfig high-availability group ' + grpId + ' election-option device-priority ' + (role === 'primary' ? '10' : '100') + '\n';
    c += 'set deviceconfig high-availability group ' + grpId + ' election-option preemptive ' + preemptive + '\n';
    c += 'set deviceconfig high-availability interface ha1 port ' + ha1Iface + '\n';
    c += 'set deviceconfig high-availability interface ha1 ip-address ' + ha1Ip + '\n';
    c += 'set deviceconfig high-availability interface ha1 gateway ' + ha1Peer + '\n';
    c += 'set deviceconfig high-availability interface ha2 port ' + ha2Iface + '\n';
    c += 'set deviceconfig high-availability interface ha2 ip-address ' + ha2Ip + '\n';
    c += 'set deviceconfig high-availability group ' + grpId + ' state-synchronization enabled yes\n\n';
    c += '# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show high-availability all\n# show high-availability state\n# show high-availability state-synchronization\n';
    return c;
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
                            { value: 'vlan', label: 'VLAN Sub-Interface' },
                            { value: 'loopback', label: 'Loopback' }
                        ], hint: 'Layer3 fiziksel port; VLAN sub-interface için vlan_id gerekir' },
                        { name: 'ip_prefix', why: "PAN-OS CIDR bekler (<code>/24</code>), nokta-ondalık maske değil. Yanlış prefix yönetim erişimini commit anında koparabilir.", label: 'IP / Prefix (CIDR)', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' },
                        { name: 'zone', why: "Zone atanmamış arayüz trafiği <b>tamamen</b> düşürür. Zone'u sonradan değiştirmek ise o arayüze referans veren tüm kuralları geçersiz kılar.", label: 'Zone', type: 'text', required: true, placeholder: 'untrust', hint: 'Arayüzün atanacağı zone adı' },
                        { name: 'description', why: "Çok portlu bir cihazda hangi kablonun nereye gittiğini söyleyen tek kayıt budur. Boş bırakılan portlar, arıza anında en çok zaman kaybettiren yerdir.", label: 'Açıklama', type: 'text', optional: true, placeholder: 'WAN Link', hint: 'İsteğe bağlı arayüz açıklaması' },
                        { name: 'mtu', why: 'Varsayılan 1500. IPSec tünelleri üzerinden geçen trafikte MTU/MSS ayarı yapılmazsa büyük paketler parçalanır ve uygulamalar yavaşlar.', label: 'MTU', type: 'text', optional: true, placeholder: '1500', hint: 'MTU değeri (varsayılan 1500, VLAN için 1400–1500)' },
                        { name: 'vlan_id', why: "Alt arayüzdeki VLAN etiketi karşı switch'in trunk'ında izinli olmalı. Uyuşmazlıkta arayüz up görünür ama tek bir paket bile gelmez.", label: 'VLAN ID', type: 'text', validate: 'vlan', optional: true, placeholder: '100', hint: 'Yalnızca VLAN tipi seçildiyse gerekli' }
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
    const intfName = cgEsc(data.intf_name || ''), intfType = cgEsc(data.intf_type || 'layer3');
    const ipPrefix = cgEsc(data.ip_prefix || ''), zone = cgEsc(data.zone || '');
    const description = cgEsc(data.description || ''), mtu = cgEsc(data.mtu || ''), vlanId = cgEsc(data.vlan_id || '');
    let c = '# ========================================\n# Palo Alto — Interface Configuration\n# ========================================\n\n';
    if (intfType === 'layer3' || intfType === 'vlan') {
        c += 'set network interface ethernet ' + intfName + ' layer3 ip ' + ipPrefix + '\n';
        if (mtu) c += 'set network interface ethernet ' + intfName + ' layer3 mtu ' + mtu + '\n';
        if (description) c += 'set network interface ethernet ' + intfName + ' comment "' + description + '"\n';
        if (intfType === 'vlan' && vlanId) {
            c += 'set network interface ethernet ' + intfName + ' layer3 units vlan.' + vlanId + '\n';
        }
        c += 'set zone ' + zone + ' network layer3 ' + intfName + '\n';
    } else {
        c += 'set network interface loopback units ' + intfName + ' ip ' + ipPrefix + '\n';
        if (description) c += 'set network interface loopback units ' + intfName + ' comment "' + description + '"\n';
        c += 'set zone ' + zone + ' network layer3 ' + intfName + '\n';
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show interface ' + intfName + '\n# show zone ' + zone + '\n';
    return c;
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
                        { name: 'nexthop', why: 'Next-hop IP. Tünel arayüzü üzerinden rota veriyorsan next-hop yerine arayüzü seçmelisin.', label: 'Next-Hop IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.254', hint: 'Bir sonraki hop IP adresi' },
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
    const vrName = cgEsc(data.vr_name || ''), dst = cgEsc(data.dst || '');
    const nexthop = cgEsc(data.nexthop || ''), iface = cgEsc(data.interface || ''), metric = cgEsc(data.metric || '');
    const routeName = dst.replace(/[^a-zA-Z0-9]/g, '-');
    let c = '# ========================================\n# Palo Alto — Virtual Router + Static Route\n# ========================================\n\n';
    c += 'set network virtual-router ' + vrName + ' routing-table ip static-route ' + routeName + ' destination ' + dst + '\n';
    c += 'set network virtual-router ' + vrName + ' routing-table ip static-route ' + routeName + ' nexthop ip-address ' + nexthop + '\n';
    c += 'set network virtual-router ' + vrName + ' routing-table ip static-route ' + routeName + ' interface ' + iface + '\n';
    c += 'set network virtual-router ' + vrName + ' routing-table ip static-route ' + routeName + ' metric ' + metric + '\n';
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show routing route\n# show routing fib\n';
    return c;
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
                        { name: 'ip', why: "Alt arayüz IP'si, o VLAN'daki istemcilerin gateway'i olur. CIDR formatında verilir.", label: 'IP / Prefix', type: 'text', validate: 'cidr', optional: true, placeholder: '192.168.100.1/24', hint: 'VLAN SVI IP adresi (opsiyonel)' },
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
    const vlanId = cgEsc(data.vlan_id || ''), vlanName = cgEsc(data.vlan_name || '');
    const iface = cgEsc(data.interface || ''), ip = cgEsc(data.ip || ''), zone = cgEsc(data.zone || '');
    let c = '# ========================================\n# Palo Alto — VLAN\n# ========================================\n\n';
    c += 'set network vlan ' + vlanName + ' vlan-id ' + vlanId + '\n';
    c += 'set network vlan ' + vlanName + ' interface ' + iface + '\n';
    if (ip) {
        c += 'set network interface vlan units vlan.' + vlanId + ' ip ' + ip + '\n';
    }
    if (zone) {
        c += 'set zone ' + zone + ' network layer3 vlan.' + vlanId + '\n';
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show vlan all\n';
    return c;
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
                        { name: 'src_port', why: "Kaynak port neredeyse her zaman rastgeledir. Burayı doldurmak kuralın hiç eşleşmemesine yol açan klasik hatadır — boş bırak.", label: 'Kaynak Port', type: 'text', validate: 'iface', optional: true, placeholder: 'any', hint: 'Kaynak port kısıtlaması (genellikle boş bırakılır)' },
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
    const name = cgEsc(data.name || ''), protocol = cgEsc(data.protocol || 'tcp');
    const dstPort = cgEsc(data.dst_port || ''), srcPort = cgEsc(data.src_port || ''), description = cgEsc(data.description || '');
    let c = '# ========================================\n# Palo Alto — Service Object\n# ========================================\n\n';
    c += 'set shared service ' + name + ' protocol ' + protocol + ' port ' + dstPort + '\n';
    if (srcPort && srcPort !== 'any') {
        c += 'set shared service ' + name + ' protocol ' + protocol + ' source-port ' + srcPort + '\n';
    }
    if (description) {
        c += 'set shared service ' + name + ' description "' + description + '"\n';
    }
    c += '\n# Commit gerekli!\n# commit\n\n';
    c += '# Doğrulama:\n# show service name ' + name + '\n';
    return c;
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
