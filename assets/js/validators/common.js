'use strict';
// ─── Doğrulayıcılar: ortak çekirdek ve aile çözümleyicisi ───────────────────
// Her cihaz ailesinin doğrulayıcısı kendine özgüdür. Tanımlar aile başına
// ayrı dosyada durur (assets/js/validators/<aile>.js); bu dosya yalnız anlamı
// her vendorda aynı olan genel doğrulayıcıları (IPv4/IPv6, CIDR, port, VLAN,
// hostname, arayüz adı …) ve çözümleyiciyi taşır.
//
// Çözümleme: alanın `validate` adı + aracın ailesi (cgFamilyOf(regId).slug)
//   → önce o ailenin dosyası, yoksa common. Başka ailenin tanımına erişim yok:
//   Cisco'nun 'subnet'i değişirse Check Point formu etkilenmez. Aynı ad iki
//   ailede farklı anlam taşıyacaksa her aile kendi dosyasında tanımlar.
// Her tanım üç parçadır: V (doğrulayıcı: re | fn(v, el), msg), R (kural metni:
// "Geçerli değer" satırı), W (sebep üreteci: girilen değerin NESİ yanlış).
// Aile dosyaları index.html'de bu dosyadan sonra, ConfigGeneratorManagement.js'ten önce yüklenir.

const CG_VAL = {};   // aile -> { V, R, W }

function cgDefineValidators(family, V, R, W) {
    const s = CG_VAL[family] || (CG_VAL[family] = { V: {}, R: {}, W: {} });
    Object.assign(s.V, V || {}); Object.assign(s.R, R || {}); Object.assign(s.W, W || {});
    return s;
}

// Adı çözen küme: ailenin kendi kümesi, yoksa common; ikisinde de yoksa null.
function _cgValSet(name, family) {
    const f = family && family !== 'common' ? CG_VAL[family] : null;
    if (f && Object.prototype.hasOwnProperty.call(f.V, name)) return f;
    const c = CG_VAL.common;
    return c && Object.prototype.hasOwnProperty.call(c.V, name) ? c : null;
}
function cgValidator(name, family) { const s = _cgValSet(name, family); return s ? s.V[name] : undefined; }
function cgValRule(name, family)   { const s = _cgValSet(name, family); return s ? s.R[name] : undefined; }
function cgValWhy(name, family)    { const s = _cgValSet(name, family); return s ? s.W[name] : undefined; }
// Doğrulayıcının tanımlı olduğu küme adı ('cisco' | 'common' | null) — denetim araçları için.
function cgValOwner(name, family) {
    const s = _cgValSet(name, family);
    return !s ? null : s === CG_VAL.common ? 'common' : family;
}
// Bir ailenin gördüğü birleşik görünüm (common + aile; aile önce gelir). Testler/denetim için.
function cgValView(family) {
    const c = CG_VAL.common || { V: {}, R: {}, W: {} }, f = (family && CG_VAL[family]) || { V: {}, R: {}, W: {} };
    return { V: Object.assign({}, c.V, f.V), R: Object.assign({}, c.R, f.R), W: Object.assign({}, c.W, f.W) };
}

// ─── Ortak yardımcılar (aile dosyaları da kullanır) ─────────────────────────

// parseInt('10abc') === 10 oldugu icin eski dogrulayicilar '10abc' gibi
// degerleri KABUL EDIYORDU. Tam sayi olmayani reddeder.
function _cgInt(v, min, max) {
    const t = String(v).trim();
    if (!/^\d+$/.test(t)) return false;
    const n = parseInt(t, 10);
    return n >= min && n <= max;
}

// IPv6 sözdizimi: tek bir :: kısaltması, 8 adet 16-bit grup ve yalnız sonda
// isteğe bağlı IPv4 kuyruğu. DNS çözümü yapmadan yalnız CLI adres biçimini sınar.
function _cgIpv6(value) {
    const s = String(value || '').trim();
    if (!s || /[^0-9a-fA-F:.]/.test(s) || (s.match(/::/g) || []).length > 1) return false;
    const sides = s.split('::');
    const groups = [];
    for (const side of sides) {
        if (!side) continue;
        const parts = side.split(':');
        if (parts.some(x => !x)) return false;
        groups.push(...parts);
    }
    let units = 0;
    for (let i = 0; i < groups.length; i++) {
        const g = groups[i];
        if (g.includes('.')) {
            if (i !== groups.length - 1 || !_CG_IPRE.test(g)) return false;
            units += 2;
        } else {
            if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return false;
            units++;
        }
    }
    return sides.length === 2 ? units < 8 : units === 8;
}
// Bilinen adsiz arayuzler (rakam icermeyenler)
// Rakam icermeyen gecerli arayuz / mantiksal arayuz adlari.
// ASA'da arayuzlere nameif ile isim verilir ('outside', 'inside', 'management');
// bu isimler config'te arayuz yerine gecer ve reddedilmemeli.
const _CG_BARE_IF = ['bridge', 'irb', 'internal', 'external', 'wan', 'lan', 'dmz',
                     'mgmt', 'management', 'outside', 'inside', 'untrust', 'trust',
                     'loopback', 'null', 'vlan', 'any', 'all', 'guest', 'server',
                     'voice', 'core', 'edge', 'transit'];
function _cgRdRt(t) {
    if (!t) return false;
    if (t.toLowerCase() === 'auto') return true;
    const m = t.match(/^(?:target:|origin:)?([^:]+):(\d+)$/i);
    if (!m) return false;
    const left = m[1];
    if (/^\d+$/.test(left)) return true;                                   // 65000:100
    return /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(left); // 10.0.0.1:100
}
function _cgIface(t) {
    if (!t || /\s/.test(t)) return false;              // bosluk yok
    // Arayuz adi HARFLE baslar. F5'in '1.1' bicimi ciplak sayisaldir ve yalnizca
    // F5 alanlarinda gecerlidir — genel dogrulayiciya konursa '1.2' gibi girdiler
    // her vendor'da arayuz sanilir ve 'interface range 1.2' gibi gecersiz satir
    // uretilir. O bicim ayri 'iface_f5' dogrulayicisinda.
    if (!/^[A-Za-z0-9/._:-]+$/.test(t)) return false;  // gecersiz karakter
    // Huawei CE aile adlari RAKAMLA baslar: 10GE1/0/1, 25GE1/0/1, 40GE1/0/1, 100GE1/0/1
    if (/^\d+GE\d/i.test(t)) return true;
    // Ciplak sayisal ('1.2', '1-2') arayuz DEGILDIR — F5 icin iface_f5 kullanilir.
    if (/^[\d.\-]+$/.test(t)) return false;
    if (!/^[A-Za-z]/.test(t)) return false;
    if (/[-./:]$/.test(t)) return false;               // 'Gi0/1-' yarim kalmis aralik
    if (/\d/.test(t)) return true;                     // rakam iceriyorsa gecerli say
    return _CG_BARE_IF.includes(t.toLowerCase());      // rakamsizsa bilinen ad olmali
}

// ─── Geçersizlik sebebi ("nesi yanlış") ─────────────────────────────────────
// `msg` NE girilmesi gerektiğini söyler; buradaki fonksiyonlar girilen değerin
// NESİNİN yanlış olduğunu söyler. İkisi tek satırda birleşir:
//   "VLAN ID 1-4094 arasında olmalı — girdiğiniz 30000 üst sınırın (4094) üstünde"
// Değer tanıdık bir hata biçimine uymuyorsa boş döner; o zaman yalnızca `msg`
// gösterilir — yanlış sebep üretmektense hiç üretmemek yeğdir.

const _CG_IPRE = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

function _cgQ(s) { return '"' + s + '"'; }

function _cgNumWhy(t, min, max) {
    if (!t) return '';
    if (/^-\d/.test(t)) return 'negatif değer kabul edilmez';
    if (/^\d+[.,]\d+$/.test(t)) return 'ondalıklı değil, tam sayı olmalı';
    if (!/^\d+$/.test(t)) return _cgQ(t) + ' bir tam sayı değil';
    const n = parseInt(t, 10);
    if (n < min) return 'girdiğiniz ' + n + ' alt sınırın (' + min + ') altında';
    if (n > max) return 'girdiğiniz ' + n + ' üst sınırın (' + max + ') üstünde';
    return '';
}

function _cgIpWhy(t) {
    if (!t) return '';
    if (t.indexOf('/') >= 0) return 'bu alan CIDR öneki almaz, yalnızca adres girin';
    const p = t.split('.');
    if (p.length !== 4) return 'IPv4 dört parçadan oluşur, ' + p.length + ' parça girdiniz';
    for (const o of p) {
        if (o === '') return 'boş oktet var — noktalar arasında sayı olmalı';
        if (!/^\d+$/.test(o)) return _cgQ(o) + ' sayı değil';
        if (+o > 255) return o + ' geçerli bir oktet değil (0-255)';
    }
    return '';
}

function _cgCidrWhy(t) {
    if (!t) return '';
    const i = t.indexOf('/');
    if (i < 0) return 'prefix eksik — sonuna /24 gibi bir önek ekleyin';
    const r = _cgIpWhy(t.slice(0, i));
    if (r) return r;
    const pfx = t.slice(i + 1);
    if (!/^\d+$/.test(pfx)) return 'prefix ' + _cgQ(pfx) + ' sayı değil';
    if (+pfx > 32) return 'prefix ' + pfx + ' geçersiz (0-32)';
    return '';
}

function _cgIfaceWhy(t) {
    if (!t) return '';
    if (/\s/.test(t)) return 'arayüz adında boşluk olamaz';
    if (/-$/.test(t)) return 'tireden sonra aralığın bitişi eksik';
    if (/^[\d.\-]+$/.test(t)) return 'çıplak sayısal ad yalnızca F5 arayüzlerinde geçerlidir';
    if (!/^[A-Za-z0-9/._:-]+$/.test(t)) return 'geçersiz karakter içeriyor (harf, rakam, / . _ : - kullanılır)';
    if (!/^[A-Za-z]/.test(t)) return 'arayüz adı harfle başlamalı';
    if (!/\d/.test(t)) return _cgQ(t) + ' bilinen bir arayüz adı değil ve rakam içermiyor';
    return '';
}

function _cgIfaceRangeWhy(t) {
    if (!t) return '';
    for (const p of String(t).split(/[,\s]+/).filter(Boolean)) {
        if (_cgIface(p)) continue;
        const i = p.lastIndexOf('-');
        if (i <= 0 || i === p.length - 1) {
            if (/^\d+\.\d+$/.test(p)) return 'aralık "-" ile yazılır, "." ile değil (örn: 1-2)';
            if (i === p.length - 1) return _cgQ(p) + ': tireden sonra aralığın bitişi eksik';
            return _cgQ(p) + ': ' + (_cgIfaceWhy(p) || 'geçerli bir arayüz değil');
        }
        const a = p.slice(0, i).trim(), b = p.slice(i + 1).trim();
        if (!_cgIface(a)) return _cgQ(a) + ': ' + (_cgIfaceWhy(a) || 'aralığın başlangıcı geçerli bir arayüz değil');
        if (!/^[0-9/.:]+$/.test(b) && !_cgIface(b)) return _cgQ(b) + ': aralığın bitişi geçersiz';
    }
    return '';
}

function _cgVlanListWhy(t0) {
    let t = String(t0).trim().toLowerCase();
    if (!t || t === 'all' || t === 'none') return '';
    if (/[;|]/.test(t)) return 'ayraç olarak virgül kullanılır (10,20,30)';
    t = t.replace(/\s+to\s+/g, '-');
    for (const p of t.split(/[,\s]+/).filter(Boolean)) {
        const r = p.match(/^(\d+)\s*-\s*(\d+)$/);
        if (r) {
            const a = +r[1], b = +r[2];
            if (a < 1) return 'aralık 1\'den başlamalı, ' + a + ' girdiniz';
            if (b > 4094) return b + ' VLAN aralığının (1-4094) dışında';
            if (a > b) return 'aralık ters yazılmış: ' + a + ' > ' + b;
            continue;
        }
        const w = _cgNumWhy(p, 1, 4094);
        if (w) return w;
    }
    return '';
}

function _cgIpMaskWhy(t) {
    const p = String(t).trim().split(/\s+/).filter(Boolean);
    if (p.length === 1) return 'maske eksik — IP ve maskeyi boşlukla ayırın';
    if (p.length > 2) return p.length + ' parça girdiniz, IP ve maske olmak üzere 2 olmalı';
    const a = _cgIpWhy(p[0]); if (a) return 'IP: ' + a;
    const b = _cgIpWhy(p[1]); if (b) return 'maske: ' + b;
    return '';
}

function _cgHostnameWhy(t) {
    if (!t) return '';
    if (t.length > 63) return t.length + ' karakter girdiniz, en fazla 63 olabilir';
    const bad = t.match(/[^a-zA-Z0-9.\-]/);
    if (bad) return _cgQ(bad[0]) + ' karakteri kullanılamaz (harf, rakam, tire, nokta)';
    if (/^[.\-]/.test(t)) return 'harf veya rakamla başlamalı';
    if (/[.\-]$/.test(t)) return 'harf veya rakamla bitmeli';
    return '';
}

function _cgMacWhy(t) {
    if (!t) return '';
    if (/^[0-9a-f]{4}(\.[0-9a-f]{4}){2}$/i.test(t))
        return 'Cisco biçimi (00e0.1a2b.3c4d) yerine iki nokta üst üste ile yazın';
    const g = t.split(/[:\-.]/);
    if (g.length !== 6) return g.length + ' grup girdiniz, 6 olmalı';
    for (const x of g) if (!/^[0-9a-fA-F]{2}$/.test(x)) return _cgQ(x) + ' geçerli bir onaltılık ikili değil';
    return '';
}

function _cgRdWhy(t) {
    if (!t) return '';
    if (t.toLowerCase() === 'auto') return '';
    if (t.indexOf(':') < 0) return 'iki bölüm gerekir, ":" ile ayrılır (örn: 65000:100)';
    const m = t.match(/^(?:target:|origin:)?([^:]+):(\d+)$/i);
    if (!m) {
        const tail = t.slice(t.lastIndexOf(':') + 1);
        if (!/^\d+$/.test(tail)) return 'son bölüm sayı olmalı, ' + _cgQ(tail) + ' girdiniz';
        return 'biçim tanınmadı (örn: 65000:100 veya 10.0.0.1:100)';
    }
    if (/^\d+$/.test(m[1])) return '';
    return 'sol bölüm AS numarası veya IPv4 olmalı, ' + _cgQ(m[1]) + ' girdiniz';
}

function _cgIpRangeWhy(t0) {
    const t = String(t0).trim();
    if (!t) return '';
    const parts = t.split(/\s*[-\s]\s*/).filter(Boolean);
    if (parts.length === 1) return 'bitiş adresi eksik (örn: 10.0.0.10-10.0.0.100)';
    if (parts.length > 2) return parts.length + ' parça girdiniz, başlangıç ve bitiş olmak üzere 2 olmalı';
    const a = _cgIpWhy(parts[0]); if (a) return 'başlangıç: ' + a;
    const b = _cgIpWhy(parts[1]); if (b) return 'bitiş: ' + b;
    const num = x => x.split('.').reduce((n, o) => n * 256 + (+o), 0);
    if (num(parts[0]) > num(parts[1])) return 'başlangıç bitişten büyük';
    return '';
}


function _cgIpv6Why(t) {
    if (!t) return '';
    if (t.indexOf('/') >= 0) return 'bu alan önek almaz, yalnızca adres girin';
    const bad = t.match(/[^0-9a-fA-F:.]/);
    if (bad) return _cgQ(bad[0]) + ' karakteri IPv6 adresinde kullanılamaz';
    if ((t.match(/::/g) || []).length > 1) return '"::" kısaltması yalnızca bir kez kullanılabilir';
    if (/^[\d.]+$/.test(t)) return 'IPv4 biçiminde girdiniz; IPv6 adresi bekleniyor';
    const long = t.split(/:+/).find(g => g.length > 4 && g.indexOf('.') < 0);
    if (long) return _cgQ(long) + ' grubu 4 onaltılık haneden uzun';
    if (t.indexOf('::') < 0 && t.split(':').length !== 8) return t.split(':').length + ' grup girdiniz; "::" yoksa 8 grup olmalı';
    return _cgIpv6(t) ? '' : 'IPv6 biçimi tanınmadı';
}
function _cgIpv6CidrWhy(t) {
    if (!t) return '';
    const i = t.indexOf('/');
    if (i < 0) return 'önek eksik — sonuna /64 gibi bir önek ekleyin';
    const a = _cgIpv6Why(t.slice(0, i));
    if (a) return a;
    const p = t.slice(i + 1);
    if (!/^\d+$/.test(p)) return 'önek ' + _cgQ(p) + ' sayı değil';
    return +p > 128 ? 'önek ' + p + ' geçersiz (0-128)' : '';
}

const CG_COMMON_V = {
    ip:       { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Geçerli bir IPv4 adresi girin (örn: 10.0.0.1)' },
    cidr:     { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/, msg: 'CIDR formatında girin (örn: 10.0.0.0/24)' },
    ipv6:     { fn: v => _cgIpv6(String(v).trim()), msg: 'Geçerli IPv6 adresi girin (örn: 2001:db8::1)' },
    ipv6_cidr:{ fn: v => { const p=String(v).trim().split('/'); return p.length === 2 && _cgIpv6(p[0]) && _cgInt(p[1], 0, 128); }, msg: 'IPv6 CIDR biçiminde girin (örn: 2001:db8::/32)' },
    // Genel nesne adi (VRF, VLAN adi, grup, profil): harfle baslar, bosluk yok.
    objname:  { re: /^[A-Za-z][A-Za-z0-9_.:-]{0,62}$/, msg: 'Geçerli bir ad girin (harfle başlar, boşluk içermez)' },
    // Bitisik ag maskesi (255.255.255.0 gibi); Cisco disi vendorlarin maske alanlari bunu
    // kullanir. 'subnet' Cisco alanlarina ozeldir (ayni kural, Cisco belgesine gore).
    // prefix'e cevrilecek alanlarda bu kullanilir — 255.0.255.0 cevrilemez.
    netmask:  { fn: v => cgMaskLen(String(v).trim()) !== '', msg: 'Geçerli ağ maskesi girin (örn: 255.255.255.0)' },
    posint:   { fn: v => _cgInt(v, 1, 2147483647), msg: 'Pozitif tam sayı girin' },
    uint32:{ fn: v => _cgInt(v, 0, 4294967295), msg: '0-4294967295 arasında tam sayı girin' },
    tcpudp_port:{ fn: v => _cgInt(v, 1, 65535), msg: 'Port 1-65535 arasında olmalı' },
    single_cli_line:{ fn: v => { const s=String(v); return s.trim().length > 0 && !/[\r\n\0]/.test(s); }, msg: 'Tek satırlık CLI değeri girin; satır sonu içeremez' },
    // Next-hop: IP adresi VEYA cikis arayuzu ('ip route 0.0.0.0 0.0.0.0 Gi0/0')
    nexthop:  { fn: v => { const t = String(v).trim(); return /^[\d.]+$/.test(t) ? CG_COMMON_V.ip.re.test(t) : _cgIface(t); },
                msg: 'Next-hop IP adresi veya çıkış arayüzü girin (örn: 192.168.1.1, GigabitEthernet0/0)' },
    ip_cidr:  { fn: v => /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(v) || /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/.test(v), msg: 'IP adresi veya CIDR (örn: 10.0.0.1 veya 10.0.0.0/24)' },
    vlan:     { fn: v => _cgInt(v, 1, 4094), msg: 'VLAN ID 1-4094 arasında olmalı' },
    asn:      { fn: v => { const n = parseInt(v); return (!isNaN(n) && n >= 1 && n <= 4294967295) || /^\d+\.\d+$/.test(v.trim()); }, msg: 'AS numarası 1-4294967295 veya dotted (ör: 65000 veya 1.100)' },
    // Tek port. ACL alanlarinda 'eq 80', 'range 80 443', 'any' gibi ifadeler
    // kullanildigi icin onlar ayri 'port_match' dogrulayicisinda.
    port:     { fn: v => _cgInt(v, 0, 65535), msg: 'Port 0-65535 arasında olmalı' },
                       // Operator tek basina ('eq') adlandirilmis port sanilmasin

    // 'IP maske' ikilisi: '10.0.0.1 255.255.255.0' (Cisco/Huawei stili)
    ip_mask:  { fn: v => { const p = String(v).trim().split(/\s+/);
                       if (p.length !== 2) return false;
                       const ipRe = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
                       return ipRe.test(p[0]) && ipRe.test(p[1]); },
                msg: 'IP ve maske girin (örn: 10.0.0.1 255.255.255.0)' },
                       // Yalnizca rakam ve noktadan olusan host bir IP'dir; '300.1.1.1' host adi sayilmaz
    hostname: { re: /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9])?$/, msg: 'Geçerli hostname girin (harf, rakam, tire)' },
    mac:      { re: /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/, msg: 'MAC adresi formatında girin (örn: 00:1A:2B:3C:4D:5E)' },
    // Gecerli bicimler: 65000:100 · 10.0.0.1:100 (IP:nn) · auto · target:65001:100 (Junos)
    rd:       { fn: v => _cgRdRt(String(v).trim()), msg: 'RD girin (örn: 65000:100, 10.0.0.1:100 veya auto)' },
    rt:       { fn: v => _cgRdRt(String(v).trim()), msg: 'RT girin (örn: 65000:100, target:65001:100 veya auto)' },
    vni:      { fn: v => _cgInt(v, 1, 16777215), msg: 'VNI 1-16777215 arasında olmalı' },
    bgp_timer:{ fn: v => _cgInt(v, 1, 65535), msg: 'Timer 1-65535 saniye arasında olmalı' },

    // ── Arayuz adi ────────────────────────────────────────────────────────
    // Coklu vendor: GigabitEthernet0/1, Gi0/1, Te1/1/1, Ethernet1/1, ge-0/0/0,
    // ae0, xe-0/0/0, port1, ether1, Eth-Trunk1, Vlanif10, ethernet1/1/1,
    // Port-channel1, Vlan10, Loopback0, Tunnel0, mgmt0, 1.1 (F5)
    // Kabul edilmeyen: bosluk iceren serbest metin, rakamsiz uydurma kelime.
    iface:    { fn: v => _cgIface(String(v).trim()), msg: 'Geçerli bir arayüz adı girin (örn: GigabitEthernet0/1, ge-0/0/0, port1, Eth-Trunk1)' },

    // Arayuz araligi: 'Gi0/1-2', 'GigabitEthernet0/1 - 10', 'ethernet1/1/1-1/1/10'
    // veya virgulle ayrilmis liste.
    // Arayuz veya aralik. Virgul ve BOSLUK ile ayrilmis liste de kabul edilir
    // ('ge-0/0/3.0, lo0.0' / 'port3 port4' gibi gercek kullanimlar var).
    //
    // Tire ayirici SONDAN aranir: eski tembel eslesme 'ge-0/0/1' ifadesini ilk
    // tireden bolup sol tarafi 'ge' yapiyor ve reddediyordu — Juniper ge-/xe-/et-,
    // Huawei Eth-Trunk1, Dell port-channel1, MikroTik sfp-sfpplus1 hepsi bu
    // yuzden gecersiz sayiliyordu.
    iface_range: { fn: v => String(v).split(/[,\s]+/).filter(Boolean).every(p => {
                       const t = p.trim();
                       if (_cgIface(t)) return true;               // tek arayuz
                       const i = t.lastIndexOf('-');
                       if (i <= 0 || i === t.length - 1) return false;
                       const a = t.slice(0, i).trim(), b = t.slice(i + 1).trim();
                       return _cgIface(a) && (/^[0-9/.:]+$/.test(b) || _cgIface(b));
                   }), msg: 'Arayüz veya aralık girin (örn: Gi0/1-2, ge-0/0/1, port3 port4)' },

    // IP araligi: '10.0.0.10-10.0.0.100' veya '10.0.0.10 10.0.0.100'
    // DHCP havuzu, NAT havuzu, adres araligi alanlarinda kullanilir.
    ip_range: { fn: v => { const t = String(v).trim();
                    const parts = t.split(/\s*[-\s]\s*/).filter(Boolean);
                    if (parts.length !== 2) return false;
                    const re = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
                    if (!parts.every(x => re.test(x))) return false;
                    const num = a => a.split('.').reduce((n, o) => n * 256 + (+o), 0);
                    return num(parts[0]) <= num(parts[1]); },
                msg: 'IP aralığı girin, başlangıç ≤ bitiş (örn: 10.0.0.10-10.0.0.100)' },

    // VLAN listesi: '10', '10,20,30', '10-20', '1,10-20,99', 'all', 'none'
    // Ayraclar: virgul, BOSLUK. Aralik: '10-20' veya Huawei bicimi '20 to 30'.
    vlan_list:{ fn: v => { let t = String(v).trim().toLowerCase();
                       if (t === 'all' || t === 'none') return true;
                       t = t.replace(/\s+to\s+/g, '-');   // Huawei 'vlan batch 20 to 30'
                       return t.split(/[,\s]+/).filter(Boolean).every(p => {
                           const q = p.trim(); if (!q) return false;
                           const r = q.match(/^(\d+)\s*-\s*(\d+)$/);
                           if (r) { const a = +r[1], b = +r[2];
                                    return a >= 1 && b <= 4094 && a <= b; }
                           return _cgInt(q, 1, 4094);
                       }); },
                msg: 'VLAN listesi girin: 10 · 10,20,30 · 10-20 · all' },
};

const CG_COMMON_W = {
    ip:          _cgIpWhy,
    cidr:        _cgCidrWhy,
    ipv6:            _cgIpv6Why,
    ipv6_cidr:       _cgIpv6CidrWhy,
    objname:     t => (!t || /^[A-Za-z][A-Za-z0-9_.:-]{0,62}$/.test(t) ? '' : /\s/.test(t) ? 'ad boşluk içeremez' : !/^[A-Za-z]/.test(t) ? 'ad harfle başlamalı' : t.length > 63 ? t.length + ' karakter girdiniz, en fazla 63' : 'yalnızca harf, rakam, _ . : - kullanılır'),
    netmask:     t => _cgIpWhy(t) || (cgMaskLen(t) === '' ? 'maske bitişik değil — 1 bitleri soldan kesintisiz olmalı (örn: 255.255.240.0)' : ''),
    posint:      t => _cgNumWhy(t, 1, 2147483647),
    uint32:          t => _cgNumWhy(t, 0, 4294967295),
    tcpudp_port:     t => _cgNumWhy(t, 1, 65535),
    single_cli_line: t => (/[\r\n\0]/.test(String(t)) ? 'değer satır sonu içeremez; tek satır girin' : !String(t).trim() ? 'yalnızca boşluktan oluşuyor' : ''),
    nexthop:     t => (/^[\d.]+$/.test(t) ? _cgIpWhy(t) : _cgIfaceWhy(t)),
    ip_cidr:     t => (t.indexOf('/') >= 0 ? _cgCidrWhy(t) : _cgIpWhy(t)),
    vlan:        t => _cgNumWhy(t, 1, 4094),
    asn:         t => (/^\d+\.\d+$/.test(t) ? '' : _cgNumWhy(t, 1, 4294967295)),
    port:        t => _cgNumWhy(t, 0, 65535),
    ip_mask:     _cgIpMaskWhy,
    hostname:    _cgHostnameWhy,
    mac:         _cgMacWhy,
    rd:          _cgRdWhy,
    rt:          _cgRdWhy,
    vni:         t => _cgNumWhy(t, 1, 16777215),
    bgp_timer:   t => _cgNumWhy(t, 1, 65535),
    iface:       _cgIfaceWhy,
    iface_range: _cgIfaceRangeWhy,
    ip_range:    _cgIpRangeWhy,
    vlan_list:   _cgVlanListWhy,
};

const CG_COMMON_R = {
    ip:          'Dört oktet (a.b.c.d), her biri 0–255. Önek (/24) yazılmaz.',
    cidr:        'Adres/önek: a.b.c.d/0–32 — önek zorunlu. Örn: 10.0.0.0/24',
    ipv6:            'IPv6 adresi: en fazla 8 onaltılık grup, "::" yalnızca bir kez. Önek (/64) yazılmaz. Örn: 2001:db8::1',
    ipv6_cidr:       'IPv6 adres/önek, önek 0–128 zorunlu. Örn: 2001:db8::/32',
    objname:     'Harfle başlar; harf, rakam, _ . : - içerir; boşluk olmaz; en fazla 63 karakter.',
    netmask:     'Bitişik ağ maskesi: 255.255.240.0 olur, 255.0.255.0 olmaz. Önek sayısı (24) değil noktalı biçim yazılır.',
    posint:      '1 veya daha büyük tam sayı; ondalık ve negatif olmaz.',
    uint32:          'Tam sayı 0–4294967295.',
    tcpudp_port:     'TCP/UDP portu, tam sayı 1–65535.',
    single_cli_line: 'Tek satırlık CLI değeri; satır sonu içeremez.',
    nexthop:     'IPv4 adresi (192.168.1.1) veya çıkış arayüzü adı (GigabitEthernet0/0).',
    ip_cidr:     'Tek adres (10.0.0.1) veya adres/önek (10.0.0.0/24); önek 0–32.',
    vlan:        'Tam sayı, 1–4094. 0 ve 4095 IEEE 802.1Q gereği ayrılmıştır; Cisco IOS\'ta 1002–1005 de ayrılmıştır.',
    asn:         '1–4294967295 arası tam sayı veya noktalı biçim (1.100). Özel kullanım aralıkları: 64512–65534 ve 4200000000–4294967294.',
    port:        '0–65535 arası tam sayı.',
    ip_mask:     'IP ve maske boşlukla ayrılır: 10.0.0.1 255.255.255.0',
    hostname:    'Harf, rakam, tire, nokta; en fazla 63 karakter; harf veya rakamla başlar ve biter. Alt çizgi ve boşluk olmaz.',
    mac:         'Altı onaltılık ikili, iki nokta veya tireyle: 00:1A:2B:3C:4D:5E. Noktalı Cisco biçimi (001a.2b3c.4d5e) bu alanda olmaz.',
    rd:          'ASN:sayı (65000:100), IPv4:sayı (10.0.0.1:100) veya auto.',
    rt:          'ASN:sayı (65000:100), IPv4:sayı veya auto; Junos\'ta target: öneki olabilir.',
    vni:         '1–16777215 arası tam sayı (24 bit).',
    bgp_timer:   '1–65535 arası saniye.',
    iface:       'Harfle başlayan, rakam içeren arayüz adı: GigabitEthernet0/1, ge-0/0/0, port1, Eth-Trunk1. Boşluk olmaz; yalnızca sayı (1.2) olmaz.',
    iface_range: 'Tek arayüz, tireli aralık (Gi0/1-4) veya boşluk/virgülle ayrılmış liste. Aralık nokta ile değil tire ile yazılır.',
    ip_range:    'Başlangıç-bitiş: 10.0.0.10-10.0.0.100. Başlangıç bitişten büyük olamaz.',
    vlan_list:   'VLAN ID\'leri (1–4094) virgül veya boşlukla, aralıklar tireyle: 10,20,30-40. Tümü için all. Ters aralık (40-30) olmaz.',
};

cgDefineValidators('common', CG_COMMON_V, CG_COMMON_R, CG_COMMON_W);
