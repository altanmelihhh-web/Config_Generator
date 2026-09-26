'use strict';
// Cisco ailesi (IOS/IOS-XE, NX-OS, ASA, FTD) doğrulayıcıları. Yalnız cisco-* araçları çözer;
// başka aile bu tanımlara erişemez (çözümleme: aile → common). Ortak yardımcılar common.js'te.
(function () {
function _cgIosIface(t) {
    if (!t || /\s/.test(t)) return false;
    // IOS/IOS-XE'de yaygın fiziksel ve mantıksal aileler. Kısaltmalar CLI'nin
    // yerleşik kısaltmalarıyla sınırlı; rastgele harf+rakam adları kabul edilmez.
    const m = t.match(/^(GigabitEthernet|Gig|Gi|FastEthernet|Fast|Fa|Ethernet|Eth|Et|TenGigabitEthernet|TenGig|Te|TwentyFiveGigE|Twe|FortyGigabitEthernet|Fo|HundredGigE|Hu|Serial|Se|Loopback|Lo|Tunnel|Tu|Vlan|Vl|Port-channel|Po|Bundle-Ether|BE|BDI|Dialer|Di|Cellular|Ce|ATM|Async|Null|Nu)(\d+(?:\/\d+){0,2})(?:\.(\d+))?$/i);
    if (!m) return false;
    const parts = m[2].split('/').map(Number);
    // Gerçek slot/port üst sınırı modele bağlıdır. 0..255 yapısal bir korumadır;
    // kesin donanım varlığı ancak platform/model seçimiyle doğrulanabilir.
    if (parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
    if (m[3] !== undefined && (+m[3] < 0 || +m[3] > 4294967295)) return false;
    return true;
}

function _cgPortMatchWhy(t0) {
    const t = String(t0).trim().toLowerCase();
    if (!t || t === 'any') return '';
    let m = t.match(/^(eq|neq|gt|lt)\s+(\S+)$/);
    if (m) return _cgNumWhy(m[2], 0, 65535);
    m = t.match(/^range\s+(\S+)\s+(\S+)$/);
    if (m) {
        const w = _cgNumWhy(m[1], 0, 65535) || _cgNumWhy(m[2], 0, 65535);
        if (w) return w;
        if (+m[1] > +m[2]) return 'aralık ters yazılmış: ' + m[1] + ' > ' + m[2];
        return '';
    }
    if (/^(eq|neq|gt|lt|range)$/.test(t)) return _cgQ(t) + ' tek başına kullanılmaz, ardından port gelmeli';
    if (/^range\s/.test(t)) return '"range" iki port ister (örn: range 80 443)';
    return _cgNumWhy(t, 0, 65535);
}

function _cgIosIfaceWhy(t) {
    if (!t) return '';
    if (_cgIosIface(t)) return '';
    const g = _cgIfaceWhy(t);
    if (g) return g;
    const m = t.match(/^([A-Za-z-]+)(.*)$/);
    if (!m) return 'arayüz adı harfle başlamalı';
    if (!_cgIosIface(m[1] + '0')) return _cgQ(m[1]) + ' bilinen bir Cisco IOS arayüz ailesi değil';
    if (/(^|\/)\d*\d{4,}/.test(m[2])) return 'slot/port numarası 0-255 aralığının dışında';
    return 'numara yapısı geçersiz (en fazla üç bölüm: 1/0/24, alt arayüz .100)';
}

// ─── Cisco ASA doğrulayıcıları (Cisco parti 4) ─────────────────────────────
// Kaynak: ansible-collections/cisco.asa @c467f33 argspec (asa_acls kaynak/hedef
// biçimleri, asa_objects/asa_ogs ad ve port alanları) + Cisco ASA 9.x CLI
// yapılandırma kılavuzları ve komut başvurusu. Sınır belgede yoksa yalnız
// "tek sözcük" (boşluk ve çift tırnak yok) kuralı uygulanır: üretilen CLI bu
// değerleri tırnaksız tek argüman olarak yazar. Yalnız ASA araçları kullanır.
function _asaTok(v, max) { const s = String(v).trim(); return s.length >= 1 && s.length <= max && !/[\s"]/.test(s); }
function _asaTokWhy(t, max) {
    if (!t) return '';
    if (/\s/.test(t)) return 'boşluk içeremez; CLI\'de tek sözcük olarak yazılır';
    if (t.indexOf('"') >= 0) return 'çift tırnak içeremez';
    return t.length > max ? t.length + ' karakter girdiniz, en fazla ' + max : '';
}
const _ASA_OBJ_RE = /^[A-Za-z0-9.!@#$%^&()_{}-]{1,64}$/;
function _asaObjWhy(t) {
    if (!t || _ASA_OBJ_RE.test(t)) return '';
    if (/\s/.test(t)) return 'ad boşluk içeremez';
    if (t.length > 64) return t.length + ' karakter girdiniz, en fazla 64';
    const c = t.replace(/[A-Za-z0-9.!@#$%^&()_{}-]/g, '');
    return _cgQ(c.charAt(0)) + ' karakteri nesne adında kullanılamaz';
}
const _ASA_PORT_NAMES = ['aol','bgp','biff','bootpc','bootps','chargen','cifs','citrix-ica','cmd','ctiqbe','daytime','discard','dnsix',
    'domain','echo','exec','finger','ftp','ftp-data','gopher','h323','hostname','http','https','ident','imap4','irc','isakmp','kerberos',
    'klogin','kshell','ldap','ldaps','login','lotusnotes','lpd','mobile-ip','nameserver','netbios-dgm','netbios-ns','netbios-ssn','nfs',
    'nntp','ntp','pcanywhere-data','pcanywhere-status','pim-auto-rp','pop2','pop3','pptp','radius','radius-acct','rip','rsh','rtsp',
    'secureid-udp','sip','smtp','snmp','snmptrap','sqlnet','ssh','sunrpc','syslog','tacacs','talk','telnet','tftp','time','uucp','vxlan',
    'who','whois','www','xdmcp'];
function _asaPort(p) { return /^\d+$/.test(p) ? _cgInt(p, 0, 65535) : _ASA_PORT_NAMES.includes(p.toLowerCase()); }
function _asaAclAddr(v) {
    const p = String(v).trim().split(/\s+/);
    if (p.length === 1) {
        if (['any', 'any4', 'any6'].includes(p[0].toLowerCase())) return true;
        const i = p[0].indexOf('/');
        return i > 0 && _cgIpv6(p[0].slice(0, i)) && _cgInt(p[0].slice(i + 1), 0, 128);
    }
    if (p.length !== 2) return false;
    const k = p[0].toLowerCase();
    if (k === 'host') return _CG_IPRE.test(p[1]);
    if (k === 'interface') return V.nameif.re.test(p[1]);
    if (k === 'object' || k === 'object-group') return _ASA_OBJ_RE.test(p[1]);
    return _CG_IPRE.test(p[0]) && _CG_IPRE.test(p[1]);
}
function _asaAclAddrWhy(t) {
    if (!t || _asaAclAddr(t)) return '';
    const p = t.split(/\s+/), k = p[0].toLowerCase();
    if (p.length > 2) return p.length + ' sözcük girdiniz; biçim tek anahtar sözcük veya iki parçadır';
    if (p.length === 1) {
        if (_CG_IPRE.test(p[0])) return 'maske eksik: "' + p[0] + ' 255.255.255.0" veya "host ' + p[0] + '" yazın';
        if (p[0].indexOf('/') > 0) return /^[\d.]+\//.test(p[0]) ? 'IPv4 önek (/24) ASA ACL\'de yazılmaz; adres + maske kullanın' : _cgIpv6CidrWhy(p[0]);
        return _cgQ(p[0]) + ' tanınmadı (any, any4, any6, host, object, object-group, interface)';
    }
    if (k === 'host') return _cgIpWhy(p[1]) || 'host yalnız IPv4 adresi alır';
    if (k === 'interface') return W.nameif(p[1]) || 'geçersiz nameif';
    if (k === 'object' || k === 'object-group') return _asaObjWhy(p[1]);
    return _cgIpWhy(p[0]) ? 'adres: ' + _cgIpWhy(p[0]) : _cgIpWhy(p[1]) ? 'maske: ' + _cgIpWhy(p[1]) : 'geçersiz adres/maske';
}

// ASA 'router ospf' altındaki 'network <ip> <mask> area <id>' SUBNET maskesi alır
// (IOS'taki wildcard değil). Geçerlilik 'subnet' ile aynı; sebep üreteci IOS
// alışkanlığıyla girilen wildcard'ı (0.0.0.255) tanıyıp karşılığını söyler.
function _asaOspfMaskWhy(t) {
    if (!t || cgMaskLen(t) !== '') return '';
    const ipw = _cgIpWhy(t);
    if (ipw) return ipw;
    const inv = t.split('.').map(o => 255 - (+o)).join('.');
    return cgMaskLen(inv) !== '' ? 'wildcard girdiniz; ASA subnet maskesi ister, ör. 255.255.255.0 (' + t + ' yerine ' + inv + ')'
        : 'maske bitişik değil — 1 bitleri soldan kesintisiz olmalı (örn: 255.255.240.0)';
}

const V = {
    subnet:   { fn: v => cgMaskLen(String(v).trim()) !== '', msg: 'Bitişik bitli geçerli subnet mask girin (örn: 255.255.255.0)' },
    // ASA nameif: arayuzun mantiksal adi (outside, inside, dmz, partner). Fiziksel
    // arayuz adi degildir; 'iface' dogrulayicisi rakamsiz adlari reddediyordu.
    nameif:   { re: /^[A-Za-z][A-Za-z0-9_.-]{0,47}$/, msg: 'Nameif girin (örn: outside, inside, dmz)' },
    ios_acl:  { fn: v => /^(?:[1-9]|[1-9]\d|1[0-9]{2}|1[3-9]\d{2}|2[0-6]\d{2}|[A-Za-z][A-Za-z0-9_.:-]{0,62})$/.test(String(v).trim()), msg: 'ACL numarası (1-199/1300-2699) veya harfle başlayan ACL adı girin' },
    // SNMPv3 USM auth/priv passphrase için Cisco'nun belgelediği asgari uzunluk.
    // Genel PSK/TACACS/NTP sırlarına uygulanmaz; bu sınırlar sürüme/komuta göre değişir.
    snmpv3_secret:{ fn: v => String(v).length >= 8, msg: 'SNMPv3 parolası en az 8 karakter olmalı' },
    ios_domain:{ fn: v => { const t=String(v).trim(); return t.length <= 253 && t.includes('.') && t.split('.').every(x => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(x)); }, msg: 'Geçerli tam domain adı girin (örn: example.com)' },
    ios_proto_list:{ fn: v => String(v).split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).every(x => ['tcp','udp','icmp','ftp','http','https','dns','smtp','sip','h323'].includes(x)), msg: 'Desteklenen protokolleri virgülle ayırın (örn: tcp,udp,icmp)' },
    isis_net: { re: /^[0-9a-fA-F]{2}(?:\.[0-9a-fA-F]{4}){3,6}\.00$/, msg: 'Geçerli IS-IS NET girin; selector .00 olmalı (örn: 49.0001.0000.0000.0001.00)' },
    archive_path:{ fn: v => /^(?:flash:|bootflash:|nvram:|disk0:|scp:\/\/|tftp:\/\/|ftp:\/\/|https?:\/\/|rcp:\/\/)[^\s\r\n]+$/i.test(String(v).trim()), msg: 'Geçerli flash/bootflash/nvram/disk0/scp/tftp/ftp/http(s)/rcp arşiv yolu girin' },
    track_id: { fn: v => _cgInt(v, 1, 1000), msg: 'Track object numarası 1-1000 arasında olmalı' },
    ip_sla_id:{ fn: v => _cgInt(v, 1, 2147483647), msg: 'IP SLA operasyon numarası 1-2147483647 arasında olmalı' },
    ospf_pid: { fn: v => _cgInt(v, 1, 65535), msg: 'OSPF process ID 1-65535 arasında olmalı' },
    ospf_area:{ fn: v => _cgInt(v, 0, 4294967295) || CG_VAL.common.V.ip.re.test(String(v).trim()), msg: 'OSPF area 0-4294967295 veya dotted-decimal biçiminde olmalı' },
    nxos_process_tag:{ re: /^[A-Za-z0-9]{1,63}$/, msg: 'NX-OS process/instance tag 1-63 alfanümerik karakter olmalı' },
    objname_list:{ fn: v => String(v).trim().split(/\s+/).every(x => CG_VAL.common.V.objname.re.test(x)), msg: 'Adları boşlukla ayırın; her ad harfle başlamalı ve boşluk içermemeli' },
    bgp_community_list:{ fn: v => String(v).trim().split(/\s+/).every(x => /^(?:\d+:\d+|internet|local-as|no-advertise|no-export|graceful-shutdown)$/i.test(x)), msg: 'BGP community girin (örn: 65000:100 no-export)' },
    uint32_delta:{ fn: v => /^[+-]?\d+$/.test(String(v).trim()) && Math.abs(Number(v)) <= 4294967295, msg: '0-4294967295 aralığında sayı veya +/− değişim girin' },
    telemetry_id:{ re: /^[A-Za-z0-9]+$/, msg: 'Telemetry kimliği yalnız harf ve rakam içermeli' },
    telemetry_depth:{ re: /^(?:unbounded|\d+)$/i, msg: 'Depth için 0, pozitif sayı veya unbounded girin' },
    fhrp_group:{ fn: (v, el) => {
        const form = el && el.form, type = form && form.querySelector('[name="_cgtype"]')?.value;
        if (type === 'vrrp') return _cgInt(v, 1, 255);
        if (type === 'glbp') return _cgInt(v, 0, 1023);
        const v2 = form && form.querySelector('[name="hsrp_v2"]')?.checked;
        return _cgInt(v, 0, v2 ? 4095 : 255);
    }, msg: 'Grup aralığı: VRRP 1-255, GLBP 0-1023, HSRPv1 0-255, HSRPv2 0-4095' },
    // Wildcard (ters) maske: 0.0.0.255 = /24. Huawei VRP ve Cisco ACL'lerinde kullanilir.
    wildcard: { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Wildcard maske girin (örn: 0.0.0.255 = /24)' },
    // Ağ/prefix seçen alanlarda güvenli Cisco wildcard: subnet maskesinin bit
    // düzeyinde tersi olmalıdır (0*1*). IOS ACL'leri non-contiguous wildcard da
    // destekler; fakat bunun yanlışlıkla girilmesi çok daha yaygındır. Bu sıkı
    // doğrulayıcı bilinçli "advanced wildcard" desteği eklenene kadar onu reddeder.
    wildcard_mask: { fn: v => {
        const p = String(v).trim().split('.');
        if (p.length !== 4 || !p.every(o => /^\d{1,3}$/.test(o) && +o <= 255)) return false;
        const bits = p.map(o => (+o).toString(2).padStart(8, '0')).join('');
        return /^0*1*$/.test(bits);
    }, msg: 'Ters subnet maskesi girin (örn: /24 için 0.0.0.255); dağınık bitli wildcard güvenli modda kabul edilmez' },
    port_match:{ fn: v => { const t = String(v).trim().toLowerCase();
                       if (!t || t === 'any') return true;
                       let m = t.match(/^(eq|neq|gt|lt)\s+(\S+)$/);
                       if (m) return _cgInt(m[2], 0, 65535) || /^[a-z][a-z0-9-]*$/.test(m[2]);
                       m = t.match(/^range\s+(\S+)\s+(\S+)$/);
                       if (m) return _cgInt(m[1], 0, 65535) && _cgInt(m[2], 0, 65535) && +m[1] <= +m[2];
                       if (/^(eq|neq|gt|lt|range)$/.test(t)) return false;
                       return _cgInt(t, 0, 65535) || /^[a-z][a-z0-9-]*$/.test(t); },
                msg: 'Port ifadesi girin: 80 · eq 80 · range 80 443 · gt 1024 · any' },
    ios_rt:   { fn: v => /^(?:\d+|(?:25[0-5]|2[0-4]\d|[01]?\d\d?)(?:\.(?:25[0-5]|2[0-4]\d|[01]?\d\d?)){3}):\d+$/.test(String(v).trim()), msg: 'Cisco IOS route-target girin (örn: 65000:100 veya 192.0.2.1:100)' },

    // IOS/IOS-XE arayüzü. Genel çok-vendor doğrulayıcı yalnızca "rakam içeriyor"
    // kontrolü yaptığı için Gig1/21323123 gibi uydurma değerleri geçiriyordu.
    ios_iface:{ fn: v => _cgIosIface(String(v).trim()), msg: 'Geçerli Cisco IOS arayüzü girin (örn: GigabitEthernet0/1, Gi1/0/24, Port-channel1, Vlan10)' },
    ios_iface_or_ip:{ fn: v => CG_VAL.common.V.ip.re.test(String(v).trim()) || _cgIosIface(String(v).trim()), msg: 'Geçerli IPv4 adresi veya Cisco IOS arayüzü girin' },
    ios_iface_lines:{ fn: v => String(v).split(/[\r\n,]+/).map(x=>x.trim()).filter(Boolean).length > 0 && String(v).split(/[\r\n,]+/).map(x=>x.trim()).filter(Boolean).every(_cgIosIface), msg: 'Her satıra geçerli bir Cisco IOS arayüzü girin' },
    asa_objname:       { re: _ASA_OBJ_RE, msg: 'ASA nesne adı girin: en fazla 64 karakter; harf, rakam ve . ! @ # $ % ^ & ( ) - _ { }' },
    asa_acl_name:      { fn: v => _asaTok(v, 241), msg: 'ASA ACL adı girin: tek sözcük, en fazla 241 karakter' },
    asa_acl_addr:      { fn: _asaAclAddr, msg: 'ASA ACL adresi girin: any/any4/any6, host 192.0.2.1, 192.0.2.0 255.255.255.0, 2001:db8::/32, object AD, object-group AD veya interface NAMEIF' },
    asa_mpf_name:      { fn: v => _asaTok(v, 40), msg: 'class-map/policy-map adı: tek sözcük, en fazla 40 karakter' },
    asa_psk:           { fn: v => _asaTok(v, 128), msg: 'IKEv1 pre-shared key: boşluksuz, 1-128 karakter' },
    asa_radius_key:    { fn: v => _asaTok(v, 64), msg: 'RADIUS paylaşılan anahtarı: boşluksuz, en fazla 64 karakter' },
    asa_failover_key:  { fn: v => /^hex [0-9a-fA-F]{32}$/.test(String(v).trim()) || _asaTok(v, 63), msg: 'Failover anahtarı: boşluksuz 1-63 karakter veya "hex" + 32 onaltılık hane' },
    asa_name64:        { fn: v => _asaTok(v, 64), msg: 'Tek sözcük, en fazla 64 karakter girin' },
    asa_token:         { fn: v => _asaTok(v, Infinity), msg: 'Boşluk ve çift tırnak içermeyen tek sözcük girin' },
    asa_ldap_dn:       { re: /^[A-Za-z][A-Za-z0-9-]*=[^,=]+(,\s*[A-Za-z][A-Za-z0-9-]*=[^,=]+)*$/, msg: 'LDAP DN girin (örn: DC=example,DC=com)' },
    asa_snmp_user:     { re: /^[A-Za-z][^\s"]{0,31}$/, msg: 'SNMP kullanıcı adı: harfle başlar, boşluksuz, en fazla 32 karakter' },
    asa_snmp_community:{ fn: v => _asaTok(v, 32), msg: 'SNMP community: boşluksuz, en fazla 32 karakter' },
    asa_user_pw:       { re: /^[\x21-\x7E]{1,64}$/, msg: 'Parola: boşluksuz yazdırılabilir ASCII, en fazla 64 karakter' },
    asa_port_list:     { fn: v => { const p = String(v).trim().split(/\s+/).filter(Boolean); return p.length > 0 && p.every(_asaPort); },
                         msg: 'Boşlukla ayrılmış port numaraları (0-65535) veya ASA port adları (www https domain …)' },
    asa_ntp_key:       { fn: v => _asaTok(v, 32), msg: 'NTP anahtarı: boşluksuz, en fazla 32 karakter' },
    asa_ospf_mask:     { fn: v => cgMaskLen(String(v).trim()) !== '', msg: 'ASA subnet maskesi ister, ör. 255.255.255.0 (wildcard 0.0.0.255 yazılmaz)' },
};

const W = {
    subnet:          t => _cgIpWhy(t) || (cgMaskLen(t) === '' ? 'maske bitişik değil — 1 bitleri soldan kesintisiz olmalı (örn: 255.255.240.0)' : ''),
    nameif:      t => (!t || /^[A-Za-z][A-Za-z0-9_.-]{0,47}$/.test(t) ? '' : /\s/.test(t) ? 'boşluk olamaz' : !/^[A-Za-z]/.test(t) ? 'harfle başlamalı'
                      : t.length > 48 ? t.length + ' karakter girdiniz, en fazla 48' : 'yalnızca harf, rakam, _ . - kullanılır'),
    ios_acl:         t => (!t || V.ios_acl.fn(t) ? '' : /\s/.test(t) ? 'ACL adı boşluk içeremez'
                         : /^\d+$/.test(t) ? t + ' IP ACL numarası değil (1-199, 1300-1999 veya 2000-2699)' : /^\d/.test(t) ? 'ACL adı harfle başlamalı' : 'yalnızca harf, rakam, _ . : - kullanılır'),
    snmpv3_secret:   t => (String(t).length >= 8 ? '' : String(t).length + ' karakter girdiniz, en az 8 olmalı'),
    ios_domain:      t => (!t || V.ios_domain.fn(t) ? '' : t.length > 253 ? t.length + ' karakter girdiniz, en fazla 253'
                         : t.indexOf('.') < 0 ? 'tam domain adı en az bir nokta içerir (örn: example.com)'
                         : (t.split('.').find(x => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(x)) !== undefined
                            ? _cgQ(t.split('.').find(x => !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(x))) + ' etiketi geçersiz (harf, rakam, tire; tireyle başlayıp bitemez)' : 'biçim tanınmadı')),
    ios_proto_list:  t => { if (!t || V.ios_proto_list.fn(t)) return ''; if (/[;|\s]/.test(t.replace(/,\s+/g, ','))) return 'protokolleri virgülle ayırın (tcp,udp,icmp)';
                            const x = t.split(',').map(y => y.trim().toLowerCase()).filter(Boolean).find(y => !['tcp','udp','icmp','ftp','http','https','dns','smtp','sip','h323'].includes(y));
                            return x ? _cgQ(x) + ' desteklenen protokoller arasında değil' : 'liste tanınmadı'; },
    isis_net:        t => (!t || V.isis_net.re.test(t) ? '' : /[^0-9a-fA-F.]/.test(t) ? 'yalnızca onaltılık rakam ve nokta kullanılır'
                         : !/\.00$/.test(t) ? 'NET, NSEL = 00 ile bitmeli (.00)' : 'alan kimliği + 3 dörtlü system-id + .00 biçiminde olmalı'),
    archive_path:    t => (!t || V.archive_path.fn(t) ? '' : /\s/.test(t) ? 'yol boşluk içeremez'
                         : 'yol flash:, bootflash:, nvram:, disk0:, scp://, tftp://, ftp://, http(s):// veya rcp:// ile başlamalı'),
    track_id:        t => _cgNumWhy(t, 1, 1000),
    ip_sla_id:       t => _cgNumWhy(t, 1, 2147483647),
    ospf_pid:        t => _cgNumWhy(t, 1, 65535),
    ospf_area:       t => (!t || V.ospf_area.fn(t) ? '' : t.indexOf('.') >= 0 ? (_cgIpWhy(t) || 'noktalı area biçimi geçersiz') : _cgNumWhy(t, 0, 4294967295)),
    nxos_process_tag:t => (!t || /^[A-Za-z0-9]{1,63}$/.test(t) ? '' : t.length > 63 ? t.length + ' karakter girdiniz, en fazla 63' : 'yalnızca harf ve rakam kullanılır (boşluk, _ - olmaz)'),
    objname_list:    t => { if (!t || V.objname_list.fn(t)) return ''; if (/[,;]/.test(t)) return 'adları virgülle değil boşlukla ayırın';
                            const x = t.split(/\s+/).find(y => !CG_VAL.common.V.objname.re.test(y)); return x ? _cgQ(x) + ': ' + (CG_VAL.common.W.objname(x) || 'geçersiz ad') : 'liste tanınmadı'; },
    bgp_community_list: t => { if (!t || V.bgp_community_list.fn(t)) return '';
                            const x = t.split(/\s+/).find(y => !/^(?:\d+:\d+|internet|local-as|no-advertise|no-export|graceful-shutdown)$/i.test(y));
                            return /^\d+$/.test(x) ? _cgQ(x) + ': AA:NN biçiminde yazılır (örn: 65000:100)' : _cgQ(x) + ' AA:NN veya bilinen community adı değil'; },
    uint32_delta:    t => (!t || V.uint32_delta.fn(t) ? '' : /^[+-]?\d+[.,]\d+$/.test(t) ? 'ondalıklı değil, tam sayı olmalı'
                         : /^[+-]?\d+$/.test(t) ? 'mutlak değer 4294967295 üst sınırını aşıyor' : 'yalnızca sayı ve tek bir +/− işareti kullanılır'),
    telemetry_id:    t => (!t || /^[A-Za-z0-9]+$/.test(t) ? '' : 'yalnızca harf ve rakam kullanılır (boşluk, - _ olmaz)'),
    telemetry_depth: t => (!t || /^(?:unbounded|\d+)$/i.test(t) ? '' : /^-/.test(t) ? 'negatif değer kabul edilmez' : _cgQ(t) + ' sayı veya unbounded değil'),
    fhrp_group:      t => _cgNumWhy(t, 0, 4095) || (_cgInt(t, 0, 255) ? '' : 'HSRPv1 için 0-255; daha büyük grup numarası HSRPv2 (0-4095), GLBP (0-1023) ister'),
    wildcard:    _cgIpWhy,
    wildcard_mask:   t => _cgIpWhy(t) || (V.wildcard_mask.fn(t) ? '' : cgMaskLen(t) !== '' && t !== '0.0.0.0' && t !== '255.255.255.255'
                         ? 'subnet maskesi girdiniz; wildcard onun tersidir (255.255.255.0 → 0.0.0.255)' : 'bitler dağınık — wildcard 0 bitleri soldan kesintisiz olmalı (örn: 0.0.15.255)'),
    port_match:  _cgPortMatchWhy,
    ios_rt:          t => (!t || V.ios_rt.fn(t) ? '' : /^(target|origin):/i.test(t) ? 'IOS\'ta target:/origin: öneki yazılmaz (örn: 65000:100)'
                         : t.toLowerCase() === 'auto' ? 'bu alanda auto kullanılmaz; ASN:NN veya IPv4:NN girin'
                         : t.indexOf(':') < 0 ? 'iki bölüm gerekir, ":" ile ayrılır (örn: 65000:100)' : 'sol bölüm ASN veya IPv4, sağ bölüm sayı olmalı'),
    ios_iface:       _cgIosIfaceWhy,
    ios_iface_or_ip: t => (/^[\d.]+$/.test(t) ? _cgIpWhy(t) : _cgIosIfaceWhy(t)),
    ios_iface_lines: t => { const xs = String(t).split(/[\r\n,]+/).map(x => x.trim()).filter(Boolean); if (!xs.length) return 'en az bir arayüz girin';
                            const x = xs.find(y => !_cgIosIface(y)); return x ? _cgQ(x) + ': ' + _cgIosIfaceWhy(x) : ''; },
    asa_objname:        _asaObjWhy,
    asa_acl_name:       t => _asaTokWhy(t, 241),
    asa_acl_addr:       _asaAclAddrWhy,
    asa_mpf_name:       t => _asaTokWhy(t, 40),
    asa_psk:            t => _asaTokWhy(t, 128),
    asa_radius_key:     t => _asaTokWhy(t, 64),
    asa_failover_key:   t => (/^hex\s/i.test(t) ? (/^hex [0-9a-fA-F]{32}$/.test(t) ? '' : 'hex anahtar tam 32 onaltılık hane (0-9, a-f) olmalı') : _asaTokWhy(t, 63)),
    asa_name64:         t => _asaTokWhy(t, 64),
    asa_token:          t => _asaTokWhy(t, Infinity),
    asa_ldap_dn:        t => (!t || V.asa_ldap_dn.re.test(t) ? '' : t.indexOf('=') < 0 ? 'öznitelik=değer biçimi yok (örn: DC=example)'
                             : /,\s*,|,\s*$|^,/.test(t) ? 'boş DN bileşeni var' : 'her bileşen öznitelik=değer olmalı, virgülle ayrılır'),
    asa_snmp_user:      t => (!t || V.asa_snmp_user.re.test(t) ? '' : !/^[A-Za-z]/.test(t) ? 'ad harfle başlamalı' : _asaTokWhy(t, 32)),
    asa_snmp_community: t => _asaTokWhy(t, 32),
    asa_user_pw:        t => (!t || V.asa_user_pw.re.test(t) ? '' : /\s/.test(t) ? 'parola boşluk içeremez; CLI\'de sözcüğü böler'
                             : t.length > 64 ? t.length + ' karakter girdiniz, en fazla 64' : 'yalnızca yazdırılabilir ASCII karakterler kullanılır'),
    asa_port_list:      t => { if (!t) return ''; const x = t.split(/\s+/).find(p => !_asaPort(p)); if (x === undefined) return '';
                               return /^\d+$/.test(x) ? 'port ' + x + ' geçersiz (0-65535)' : /[,;]/.test(x) ? 'portları virgülle değil boşlukla ayırın' : _cgQ(x) + ' ASA port adı değil'; },
    asa_ntp_key:        t => _asaTokWhy(t, 32),
    asa_ospf_mask: _asaOspfMaskWhy,
};

const R = {
    subnet:          'Bitişik ağ maskesi, noktalı dörtlü: 255.255.255.0 olur, 255.0.255.0 olmaz. Ağ adresi (10.0.0.0) bu alana yazılmaz.',
    nameif:      'ASA arayüzünün mantıksal adı: harfle başlar, harf/rakam/_ . -, en fazla 48 karakter. Fiziksel ad (GigabitEthernet0/0) değildir.',
    ios_acl:         'IP ACL numarası 1–199 (standart 1–99, genişletilmiş 100–199), 1300–1999 (standart), 2000–2699 (genişletilmiş) ya da harfle başlayan, boşluksuz ACL adı.',
    snmpv3_secret:   'SNMPv3 auth/priv parolası: en az 8 karakter (Cisco USM alt sınırı).',
    ios_domain:      'Tam domain adı: en az bir nokta, etiketler harf/rakam/tire (tireyle başlamaz/bitmez), toplam en fazla 253 karakter. Örn: example.com',
    ios_proto_list:  'Virgülle ayrılmış protokoller: tcp, udp, icmp, ftp, http, https, dns, smtp, sip, h323.',
    isis_net:        'IS-IS NET: alan kimliği + system-id (3 dörtlü) + NSEL .00 — örn: 49.0001.0000.0000.0001.00',
    archive_path:    'flash:, bootflash:, nvram:, disk0:, scp://, tftp://, ftp://, http://, https:// veya rcp:// ile başlayan, boşluksuz yol.',
    track_id:        'Track nesne numarası, tam sayı 1–1000.',
    ip_sla_id:       'IP SLA operasyon numarası, tam sayı 1–2147483647.',
    ospf_pid:        'OSPF process ID, tam sayı 1–65535 (yerel anlamlıdır, komşuyla eşleşmesi gerekmez).',
    ospf_area:       'Area: tam sayı 0–4294967295 veya noktalı biçim (0.0.0.0).',
    nxos_process_tag:'NX-OS process/instance tag: 1–63 harf veya rakam; boşluk, _ ve - olmaz.',
    objname_list:    'Boşlukla ayrılmış adlar; her ad harfle başlar, boşluk içermez.',
    bgp_community_list: 'Boşlukla ayrılmış AA:NN (65000:100) veya internet, local-as, no-advertise, no-export, graceful-shutdown.',
    uint32_delta:    'Tam sayı 0–4294967295; başında + veya − ile değişim olarak da yazılabilir.',
    telemetry_id:    'Yalnızca harf ve rakam; boşluk ve özel karakter olmaz.',
    telemetry_depth: '0, pozitif tam sayı veya unbounded.',
    fhrp_group:      'Grup numarası: HSRPv1 0–255, HSRPv2 0–4095, VRRP 1–255, GLBP 0–1023 (seçilen protokole göre).',
    wildcard:    'Ters maske: /24 için 0.0.0.255, /30 için 0.0.0.3. Subnet maskesi (255.255.255.0) yazılmaz.',
    wildcard_mask:   'Ters subnet maskesi: /24 için 0.0.0.255, /30 için 0.0.0.3. Subnet maskesi (255.255.255.0) ve dağınık bitli wildcard kabul edilmez.',
    port_match:  'Port (80), operatör + port (eq 443, gt 1024), iki portlu aralık (range 80 443 — küçükten büyüğe) veya any. Port 0–65535.',
    ios_rt:          'ASN:NN (65000:100) veya IPv4:NN (192.0.2.1:100). target: öneki ve auto yazılmaz.',
    ios_iface:       'Cisco IOS arayüzü: aile adı veya kısaltması + numara (GigabitEthernet1/0/24, Gi0/1, Te1/1/1, Port-channel1, Vlan10, Loopback0), alt arayüz .100. Slot/port 0–255.',
    ios_iface_or_ip: 'IPv4 adresi (192.0.2.1) veya Cisco IOS arayüzü (GigabitEthernet0/0).',
    ios_iface_lines: 'Her satıra (veya virgülle) bir Cisco IOS arayüzü: GigabitEthernet0/0, Loopback0.',
    asa_objname:        'ASA object / object-group adı: en fazla 64 karakter; harf, rakam ve . ! @ # $ % ^ & ( ) - _ { }; büyük-küçük harf duyarlı, boşluk olmaz.',
    asa_acl_name:       'ACL adı: tek sözcük (boşluk yok), en fazla 241 karakter. Büyük harf kullanmak running-config\'te bulmayı kolaylaştırır.',
    asa_acl_addr:       'any, any4, any6; host 192.0.2.1; adres + maske (192.0.2.0 255.255.255.0); IPv6 önek (2001:db8::/32); object AD; object-group AD; interface NAMEIF. Wildcard ve IPv4 /önek yazılmaz.',
    asa_mpf_name:       'class-map / policy-map adı: tek sözcük, en fazla 40 karakter.',
    asa_psk:            'IKEv1 pre-shared key: 1–128 karakter, boşluk içermez; iki uçta birebir aynı olmalı.',
    asa_radius_key:     'RADIUS paylaşılan anahtarı: en fazla 64 karakter, boşluk içermez, büyük-küçük harf duyarlı.',
    asa_failover_key:   'Paylaşılan sır 1–63 karakter (harf, rakam, noktalama; boşluk yok) veya "hex" + 32 onaltılık hane.',
    asa_name64:         'Tek sözcük (boşluk ve çift tırnak yok), en fazla 64 karakter.',
    asa_token:          'Tek sözcük: boşluk ve çift tırnak içermez. Cisco belgesi ayrıca uzunluk sınırı vermez.',
    asa_ldap_dn:        'LDAP DN: öznitelik=değer bileşenleri virgülle ayrılır. Örn: DC=example,DC=com veya OU=Users,DC=example,DC=com.',
    asa_snmp_user:      'SNMP kullanıcı adı: harfle başlar, boşluk içermez, en fazla 32 karakter.',
    asa_snmp_community: 'Community: büyük-küçük harf duyarlı, boşluk içermez, en fazla 32 karakter.',
    asa_user_pw:        'Yazdırılabilir ASCII, en fazla 64 karakter; boşluk olmaz (CLI\'de sözcüğü böler).',
    asa_port_list:      'Boşlukla ayrılmış port listesi: numara (0–65535) veya ASA port adı (www, https, domain, ssh, ntp …).',
    asa_ntp_key:        'NTP kimlik doğrulama anahtarı: boşluk içermez, en fazla 32 karakter.',
    asa_ospf_mask:      'ASA OSPF network maskesi: bitişik subnet maskesi, noktalı dörtlü (255.255.255.0). IOS\'taki wildcard (0.0.0.255) ASA\'da kullanılmaz.',
};

cgDefineValidators('cisco', V, R, W);
})();
