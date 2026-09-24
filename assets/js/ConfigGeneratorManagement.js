'use strict';

// ─── Shared Utilities ───────────────────────────────────────────────────────

function cgEsc(v) {
    return String(v == null ? '' : v).replace(/[<>&"']/g, c =>
        ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
}

// Canlı önizleme sırasında true olur: cgValidate alanları işaretler ama engellemez.
let cgSoftMode = false;

// Noktali ag maskesi -> prefix uzunlugu. Gecersiz veya bitisik olmayan maskede ''
// dondurur: cagiran, yanlis bir sayi uydurmak yerine eksikligi gorunur kilar.
function cgMaskLen(mask) {
    const p = String(mask || '').trim().split('.');
    if (p.length !== 4 || !p.every(o => /^\d{1,3}$/.test(o) && +o <= 255)) return '';
    const bits = p.map(o => (+o).toString(2).padStart(8, '0')).join('');
    return /^1*0*$/.test(bits) ? String(bits.indexOf('0') < 0 ? 32 : bits.indexOf('0')) : '';
}

// Huawei VRP/CE VLAN listesi: bosluk ayrac, aralik 'to' ile. Form '10,20,30-40'
// kabul eder; cihaz '10 20 30 to 40' ister ('1-100' VRP'de gecersizdir).
function cgHwVlanList(s) {
    return String(s || '').trim().replace(/\s+to\s+/gi, '-').split(/[,\s]+/).filter(Boolean)
        .map(p => p.replace(/^(\d+)-(\d+)$/, '$1 to $2')).join(' ');
}

// Arayuz listesi/araligini tek tek arayuzlere acar: 'Gi0/0/1-3, Gi0/0/8' ->
// ['Gi0/0/1','Gi0/0/2','Gi0/0/3','Gi0/0/8']. Aralik soz dizimi olmayan platformlarda
// (Huawei VRP 'interface X' tek arayuz ister) kullanilir. 'Gi0/0/1-0/0/3' bicimi de desteklenir.
function cgExpandIfList(s) {
    const out = [];
    String(s || '').split(/[,\s]+/).filter(Boolean).forEach(p => {
        const m = p.match(/^(.*?)(\d+)-(?:[\d/.:]*?[/:.])?(\d+)$/);
        if (m && /\D$/.test(m[1]) && +m[3] >= +m[2] && +m[3] - +m[2] < 256) {
            for (let i = +m[2]; i <= +m[3]; i++) out.push(m[1] + i);
        } else out.push(p);
    });
    return out;
}

const CG_VALIDATORS = {
    ip:       { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Geçerli bir IPv4 adresi girin (örn: 10.0.0.1)' },
    cidr:     { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/, msg: 'CIDR formatında girin (örn: 10.0.0.0/24)' },
    subnet:   { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Geçerli subnet mask girin (örn: 255.255.255.0)' },
    // ASA nameif: arayuzun mantiksal adi (outside, inside, dmz, partner). Fiziksel
    // arayuz adi degildir; 'iface' dogrulayicisi rakamsiz adlari reddediyordu.
    nameif:   { re: /^[A-Za-z][A-Za-z0-9_.-]{0,47}$/, msg: 'Nameif girin (örn: outside, inside, dmz)' },
    // Genel nesne adi (VRF, VLAN adi, grup, profil): harfle baslar, bosluk yok.
    objname:  { re: /^[A-Za-z][A-Za-z0-9_.:-]{0,62}$/, msg: 'Geçerli bir ad girin (harfle başlar, boşluk içermez)' },
    // Bitisik ag maskesi (255.255.255.0 gibi). 'subnet' her noktali dortluyu kabul eder;
    // prefix'e cevrilecek alanlarda bu kullanilir — 255.0.255.0 cevrilemez.
    netmask:  { fn: v => cgMaskLen(String(v).trim()) !== '', msg: 'Geçerli ağ maskesi girin (örn: 255.255.255.0)' },
    posint:   { fn: v => _cgInt(v, 1, 2147483647), msg: 'Pozitif tam sayı girin' },
    // Next-hop: IP adresi VEYA cikis arayuzu ('ip route 0.0.0.0 0.0.0.0 Gi0/0')
    nexthop:  { fn: v => { const t = String(v).trim(); return /^[\d.]+$/.test(t) ? CG_VALIDATORS.ip.re.test(t) : _cgIface(t); },
                msg: 'Next-hop IP adresi veya çıkış arayüzü girin (örn: 192.168.1.1, GigabitEthernet0/0)' },
    // Wildcard (ters) maske: 0.0.0.255 = /24. Huawei VRP ve Cisco ACL'lerinde kullanilir.
    wildcard: { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Wildcard maske girin (örn: 0.0.0.255 = /24)' },
    ip_cidr:  { fn: v => /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(v) || /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/.test(v), msg: 'IP adresi veya CIDR (örn: 10.0.0.1 veya 10.0.0.0/24)' },
    vlan:     { fn: v => _cgInt(v, 1, 4094), msg: 'VLAN ID 1-4094 arasında olmalı' },
    asn:      { fn: v => { const n = parseInt(v); return (!isNaN(n) && n >= 1 && n <= 4294967295) || /^\d+\.\d+$/.test(v.trim()); }, msg: 'AS numarası 1-4294967295 veya dotted (ör: 65000 veya 1.100)' },
    // Tek port. ACL alanlarinda 'eq 80', 'range 80 443', 'any' gibi ifadeler
    // kullanildigi icin onlar ayri 'port_match' dogrulayicisinda.
    port:     { fn: v => _cgInt(v, 0, 65535), msg: 'Port 0-65535 arasında olmalı' },
    port_match:{ fn: v => { const t = String(v).trim().toLowerCase();
                       if (!t || t === 'any') return true;
                       let m = t.match(/^(eq|neq|gt|lt)\s+(\S+)$/);
                       if (m) return _cgInt(m[2], 0, 65535) || /^[a-z][a-z0-9-]*$/.test(m[2]);
                       m = t.match(/^range\s+(\S+)\s+(\S+)$/);
                       if (m) return _cgInt(m[1], 0, 65535) && _cgInt(m[2], 0, 65535) && +m[1] <= +m[2];
                       // Operator tek basina ('eq') adlandirilmis port sanilmasin
                       if (/^(eq|neq|gt|lt|range)$/.test(t)) return false;
                       return _cgInt(t, 0, 65535) || /^[a-z][a-z0-9-]*$/.test(t); },
                msg: 'Port ifadesi girin: 80 · eq 80 · range 80 443 · gt 1024 · any' },

    // 'IP maske' ikilisi: '10.0.0.1 255.255.255.0' (Cisco/Huawei stili)
    ip_mask:  { fn: v => { const p = String(v).trim().split(/\s+/);
                       if (p.length !== 2) return false;
                       const ipRe = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
                       return ipRe.test(p[0]) && ipRe.test(p[1]); },
                msg: 'IP ve maske girin (örn: 10.0.0.1 255.255.255.0)' },

    // 'IP:port' (F5 virtual server hedefi)
    host_port:{ fn: v => { const m = String(v).trim().match(/^(.+):(\d+)$/);
                       if (!m) return false;
                       const ipRe = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
                       // Yalnizca rakam ve noktadan olusan host bir IP'dir; '300.1.1.1' host adi sayilmaz
                       const hostOk = /^[\d.]+$/.test(m[1]) ? ipRe.test(m[1]) : /^[a-z0-9][a-z0-9.-]*$/i.test(m[1]);
                       return hostOk && _cgInt(m[2], 0, 65535); },
                msg: 'IP:port veya host:port girin (örn: 10.1.1.100:443)' },
    hostname: { re: /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9])?$/, msg: 'Geçerli hostname girin (harf, rakam, tire)' },
    mac:      { re: /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/, msg: 'MAC adresi formatında girin (örn: 00:1A:2B:3C:4D:5E)' },
    prefix:   { fn: v => _cgInt(v, 0, 128), msg: 'Prefix 0-128 arasında olmalı' },
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

    // F5 BIG-IP arayuzleri ciplak sayisaldir: '1.1', '1.2', '2.1'
    // Ayri tutulur; genel iface'e konursa diger vendor'larda '1.2' arayuz sanilir.
    iface_f5: { fn: v => /^\d+(\.\d+)+$/.test(String(v).trim()) || _cgIface(String(v).trim()),
                msg: 'F5 arayüzü girin (örn: 1.1, 1.2) veya trunk/VLAN adı' },

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

// parseInt('10abc') === 10 oldugu icin eski dogrulayicilar '10abc' gibi
// degerleri KABUL EDIYORDU. Tam sayi olmayani reddeder.
function _cgInt(v, min, max) {
    const t = String(v).trim();
    if (!/^\d+$/.test(t)) return false;
    const n = parseInt(t, 10);
    return n >= min && n <= max;
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

function _cgIpMaskWhy(t) {
    const p = String(t).trim().split(/\s+/).filter(Boolean);
    if (p.length === 1) return 'maske eksik — IP ve maskeyi boşlukla ayırın';
    if (p.length > 2) return p.length + ' parça girdiniz, IP ve maske olmak üzere 2 olmalı';
    const a = _cgIpWhy(p[0]); if (a) return 'IP: ' + a;
    const b = _cgIpWhy(p[1]); if (b) return 'maske: ' + b;
    return '';
}

function _cgHostPortWhy(t0) {
    const t = String(t0).trim();
    if (!t) return '';
    const m = t.match(/^(.+):(\d+)$/);
    if (!m) return t.indexOf(':') < 0 ? 'port eksik — sonuna :443 gibi bir port ekleyin'
                                      : 'iki nokta üst üsteden sonrası sayı olmalı';
    const w = _cgNumWhy(m[2], 0, 65535);
    if (w) return w;
    if (/^[\d.]+$/.test(m[1])) { const r = _cgIpWhy(m[1]); return r ? 'IP: ' + r : ''; }
    return /^[a-z0-9][a-z0-9.-]*$/i.test(m[1]) ? '' : 'host adı geçersiz: ' + _cgQ(m[1]);
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

// Doğrulayıcı tipi -> sebep üreteci. 22 doğrulayıcının 22'si karşılanır.
const CG_WHY = {
    ip:          _cgIpWhy,
    cidr:        _cgCidrWhy,
    subnet:      _cgIpWhy,
    nameif:      t => (!t || /^[A-Za-z][A-Za-z0-9_.-]{0,47}$/.test(t) ? '' : /\s/.test(t) ? 'boşluk olamaz' : !/^[A-Za-z]/.test(t) ? 'harfle başlamalı'
                      : t.length > 48 ? t.length + ' karakter girdiniz, en fazla 48' : 'yalnızca harf, rakam, _ . - kullanılır'),
    objname:     t => (!t || /^[A-Za-z][A-Za-z0-9_.:-]{0,62}$/.test(t) ? '' : /\s/.test(t) ? 'ad boşluk içeremez' : !/^[A-Za-z]/.test(t) ? 'ad harfle başlamalı' : t.length > 63 ? t.length + ' karakter girdiniz, en fazla 63' : 'yalnızca harf, rakam, _ . : - kullanılır'),
    netmask:     t => _cgIpWhy(t) || (cgMaskLen(t) === '' ? 'maske bitişik değil — 1 bitleri soldan kesintisiz olmalı (örn: 255.255.240.0)' : ''),
    posint:      t => _cgNumWhy(t, 1, 2147483647),
    nexthop:     t => (/^[\d.]+$/.test(t) ? _cgIpWhy(t) : _cgIfaceWhy(t)),
    wildcard:    _cgIpWhy,
    ip_cidr:     t => (t.indexOf('/') >= 0 ? _cgCidrWhy(t) : _cgIpWhy(t)),
    vlan:        t => _cgNumWhy(t, 1, 4094),
    asn:         t => (/^\d+\.\d+$/.test(t) ? '' : _cgNumWhy(t, 1, 4294967295)),
    port:        t => _cgNumWhy(t, 0, 65535),
    port_match:  _cgPortMatchWhy,
    ip_mask:     _cgIpMaskWhy,
    host_port:   _cgHostPortWhy,
    hostname:    _cgHostnameWhy,
    mac:         _cgMacWhy,
    prefix:      t => _cgNumWhy(t, 0, 128),
    rd:          _cgRdWhy,
    rt:          _cgRdWhy,
    vni:         t => _cgNumWhy(t, 1, 16777215),
    bgp_timer:   t => _cgNumWhy(t, 1, 65535),
    iface:       _cgIfaceWhy,
    iface_range: _cgIfaceRangeWhy,
    iface_f5:    t => (/^\d+(\.\d+)*$/.test(t) ? 'F5 arayüzü iki bölümlü olmalı (örn: 1.1)' : _cgIfaceWhy(t)),
    ip_range:    _cgIpRangeWhy,
    vlan_list:   _cgVlanListWhy,
};

// Sebep dizesi (yalnızca "nesi yanlış" kısmı) — uyarı şeridinde kısa gösterim için.
function cgFieldReason(type, val) {
    const f = CG_WHY[type];
    if (!f) return '';
    try { return f(String(val == null ? '' : val).trim()) || ''; } catch (e) { return ''; }
}

// Alan altında gösterilecek tam mesaj: kural + sebep.
// `msg` fonksiyon olarak da tanımlanabilir (girilen değeri alır); statik metin
// desteği korunur.
function cgFieldMsg(type, val) {
    const v = CG_VALIDATORS[type];
    if (!v) return '';
    if (typeof v.msg === 'function') { try { return v.msg(val); } catch (e) { return ''; } }
    const r = cgFieldReason(type, val);
    return r ? v.msg + ' — ' + r : v.msg;
}

// Uyarı metinlerinde ALAN ADI değil ETİKET gösterilir: 'allowed_vlans' değil
// 'Allowed VLANs'. Etiketten işaretleyiciler (zorunlu yıldızı, 'Opsiyonel'
// rozeti, ipucu ikonu) temizlenir.
function _cgLabelOf(el) {
    const lblEl = el.closest('.row')?.querySelector('label');
    if (!lblEl) return el.name;
    const c = lblEl.cloneNode(true);
    c.querySelectorAll('.cg-opt, .text-danger, .cg-tip').forEach(n => n.remove());
    return c.textContent.replace(/[*\s]+$/, '').trim() || el.name;
}

// ─── Geçerli değer kuralları ────────────────────────────────────────────────
// Bilgi kartında her alanın altında "Geçerli değer" satırı olarak gösterilir.
// Üç metin ayrı işler görür:
//   hint  -> alan NE (Trunk allowed VLAN listesi)
//   why   -> NEDEN önemli (kavram, risk)
//   rule  -> NE GİREBİLİRİM (aralık, biçim, ne kabul edilmez)  <- bu tablo
//   hata  -> girdiğimin NESİ yanlış (CG_WHY)
// Doğrulayıcı başına tek yerde yazılır; o doğrulayıcıyı kullanan her alan alır.
const CG_RULES = {
    ip:          'Dört oktet (a.b.c.d), her biri 0–255. Önek (/24) yazılmaz.',
    cidr:        'Adres/önek: a.b.c.d/0–32 — önek zorunlu. Örn: 10.0.0.0/24',
    objname:     'Harfle başlar; harf, rakam, _ . : - içerir; boşluk olmaz; en fazla 63 karakter.',
    nameif:      'ASA arayüzünün mantıksal adı: harfle başlar, harf/rakam/_ . -, en fazla 48 karakter. Fiziksel ad (GigabitEthernet0/0) değildir.',
    subnet:      'Noktalı dörtlü, her oktet 0–255. Örn: 255.255.255.0',
    netmask:     'Bitişik ağ maskesi: 255.255.240.0 olur, 255.0.255.0 olmaz. Önek sayısı (24) değil noktalı biçim yazılır.',
    posint:      '1 veya daha büyük tam sayı; ondalık ve negatif olmaz.',
    nexthop:     'IPv4 adresi (192.168.1.1) veya çıkış arayüzü adı (GigabitEthernet0/0).',
    wildcard:    'Ters maske: /24 için 0.0.0.255, /30 için 0.0.0.3. Subnet maskesi (255.255.255.0) yazılmaz.',
    ip_cidr:     'Tek adres (10.0.0.1) veya adres/önek (10.0.0.0/24); önek 0–32.',
    vlan:        'Tam sayı, 1–4094. 0 ve 4095 IEEE 802.1Q gereği ayrılmıştır; Cisco IOS\'ta 1002–1005 de ayrılmıştır.',
    asn:         '1–4294967295 arası tam sayı veya noktalı biçim (1.100). Özel kullanım aralıkları: 64512–65534 ve 4200000000–4294967294.',
    port:        '0–65535 arası tam sayı.',
    port_match:  'Port (80), operatör + port (eq 443, gt 1024), iki portlu aralık (range 80 443 — küçükten büyüğe) veya any. Port 0–65535.',
    ip_mask:     'IP ve maske boşlukla ayrılır: 10.0.0.1 255.255.255.0',
    host_port:   'Adres veya host adı, iki nokta, port: 10.1.1.100:443. Port 0–65535.',
    hostname:    'Harf, rakam, tire, nokta; en fazla 63 karakter; harf veya rakamla başlar ve biter. Alt çizgi ve boşluk olmaz.',
    mac:         'Altı onaltılık ikili, iki nokta veya tireyle: 00:1A:2B:3C:4D:5E. Noktalı Cisco biçimi (001a.2b3c.4d5e) bu alanda olmaz.',
    prefix:      '0–128 arası tam sayı (IPv4 için 0–32).',
    rd:          'ASN:sayı (65000:100), IPv4:sayı (10.0.0.1:100) veya auto.',
    rt:          'ASN:sayı (65000:100), IPv4:sayı veya auto; Junos\'ta target: öneki olabilir.',
    vni:         '1–16777215 arası tam sayı (24 bit).',
    bgp_timer:   '1–65535 arası saniye.',
    iface:       'Harfle başlayan, rakam içeren arayüz adı: GigabitEthernet0/1, ge-0/0/0, port1, Eth-Trunk1. Boşluk olmaz; yalnızca sayı (1.2) olmaz.',
    iface_range: 'Tek arayüz, tireli aralık (Gi0/1-4) veya boşluk/virgülle ayrılmış liste. Aralık nokta ile değil tire ile yazılır.',
    iface_f5:    'F5 arayüzü: yuva.port (1.1, 2.3) veya trunk/VLAN adı.',
    ip_range:    'Başlangıç-bitiş: 10.0.0.10-10.0.0.100. Başlangıç bitişten büyük olamaz.',
    vlan_list:   'VLAN ID\'leri (1–4094) virgül veya boşlukla, aralıklar tireyle: 10,20,30-40. Tümü için all. Ters aralık (40-30) olmaz.',
};

// min/max tasiyan ama dogrulayicisi olmayan alanlar icin dinamik aralik
// dogrulayicisi: 'range:1:4094'. Kural metni, hata mesaji ve sebebi otomatik.
function cgRangeValidator(min, max) {
    const lo = (min === undefined || min === '') ? -Infinity : +min;
    const hi = (max === undefined || max === '') ?  Infinity : +max;
    const key = 'range:' + lo + ':' + hi;
    if (!CG_VALIDATORS[key]) {
        const span = isFinite(lo) && isFinite(hi) ? lo + '–' + hi
                   : isFinite(lo) ? lo + ' veya daha büyük' : hi + ' veya daha küçük';
        CG_VALIDATORS[key] = { fn: v => /^-?\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi,
                               msg: 'Değer ' + span + ' arasında olmalı' };
        CG_WHY[key]   = t => _cgNumWhy(t, isFinite(lo) ? lo : -2147483648, isFinite(hi) ? hi : 2147483647);
        CG_RULES[key] = 'Tam sayı, ' + span + '.';
    }
    return key;
}

function cgRuleLine(vtype) {
    const r = CG_RULES[vtype];
    return r ? '<div class="cg-rule"><i class="fas fa-check-circle"></i> <b>Geçerli değer:</b> ' + r + '</div>' : '';
}

// "Neden?" bilgi kutusu — net-config.com'un en güçlü fikri.
// Alan veya bölüm şemasına `why: '...'` eklendiğinde görünür.
function cgWhyBox(why, key) {
    if (!why) return '';
    return '<div class="cg-why"><b>Neden?</b> ' + why + '</div>';
}

function cgValidate(form) {
    cgApplyRequiredIf(form);
    let ok = true;
    form.querySelectorAll('[data-cgv], [required]').forEach(el => {
        if (el.disabled) return;
        const val = el.value.trim();
        // Boş kontrolü
        if (el.required && !val) {
            el.classList.add('is-invalid');
            _cgSetError(el, 'Bu alan zorunludur');
            ok = false;
            return;
        }
        // Format kontrolü (dolu ama validate tipi var)
        const vtype = el.dataset.cgv;
        if (vtype && val && CG_VALIDATORS[vtype]) {
            const v = CG_VALIDATORS[vtype];
            const pass = v.re ? v.re.test(val) : v.fn(val);
            el.classList.toggle('is-invalid', !pass);
            if (!pass) { _cgSetError(el, cgFieldMsg(vtype, val)); ok = false; }
            else _cgClearError(el);
        } else {
            el.classList.remove('is-invalid');
            _cgClearError(el);
        }
    });
    // Canlı önizlemede hata olsa bile üretime izin ver
    return cgSoftMode ? true : ok;
}

// Yumuşak doğrulama: hatalı alanları işaretler ama üretimi engellemez.
// Boş zorunlu alanlar hata sayılmaz (kullanıcı henüz yazıyor olabilir).
function cgValidateSoft(form) {
    form.querySelectorAll('[data-cgv]').forEach(el => {
        if (el.disabled) return;
        const val = (el.value || '').trim();
        if (!val) { _cgClearError(el); return; }
        const v = CG_VALIDATORS[el.dataset.cgv];
        if (!v) return;
        const pass = v.re ? v.re.test(val) : v.fn(val);
        if (pass) _cgClearError(el);
        else { el.classList.add('is-invalid'); _cgSetError(el, cgFieldMsg(el.dataset.cgv, val)); }
    });
}

function _cgSetError(el, msg) {
    let fb = el.parentNode.querySelector('.cg-field-error');
    if (!fb) { fb = document.createElement('div'); fb.className = 'cg-field-error'; el.parentNode.appendChild(fb); }
    fb.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
    fb.style.display = '';
}
function _cgClearError(el) {
    const fb = el.parentNode.querySelector('.cg-field-error');
    if (fb) fb.remove();
    el.classList.remove('is-invalid');
}


// cgFormBuilder kullanmayan (elle yazılmış) formları da canlıya bağlar.
// Kendi submit handler'ları cgShowOutput çağırıyor; biz sadece tetikliyoruz.
function cgBindLegacyLive(host) {
    if (!host || host._cgLiveRun) return;          // cgFormBuilder zaten bağladı
    const form = host.querySelector('form');
    if (!form || form._cgLegacyBound) return;
    form._cgLegacyBound = true;

    let t = null;
    const run = () => {
        // Boş alanlara geçici placeholder koy -> çıktı çalışır bir örnek olsun
        const filled = [];
        form.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
            if (el.disabled || el.type === 'checkbox' || el.type === 'radio') return;
            if (!String(el.value || '').trim() && el.placeholder) { el.value = el.placeholder; filled.push(el); }
        });
        cgSoftMode = true;
        try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
        catch (e) { /* yut */ }
        finally {
            cgSoftMode = false;
            filled.forEach(el => { el.value = ''; });
            form.querySelectorAll('.cg-validation-banner').forEach(b => b.remove());
        }
    };
    const sched = () => { clearTimeout(t); t = setTimeout(run, 160); };
    form.addEventListener('input', sched);
    form.addEventListener('change', sched);
    host._cgLiveRun = run;
    run();
}

// ─── Canlı Çıktı (terminal paneli) ───────────────────────────────────────────

// Üretilen config'i basit sözdizimi renklendirmesiyle HTML'e çevirir.
function cgHighlight(text) {
    const KW = /^(config|edit|next|end|set|unset|system|interface|configure|enable|exit|write|commit|delete|show|no|ip|router|vlan|access-list|policy|rule|create|add|address|service|zone|profile|firewall|vpn|route)\b/;
    return String(text).split('\n').map(line => {
        const esc = cgEsc(line);
        const trimmed = line.trimStart();
        // Yorum satırları
        if (/^[#!;]/.test(trimmed)) return '<span class="t-cmt">' + esc + '</span>';
        // Tırnaklı değerler ve sayılar
        let out = esc
            .replace(/(&quot;[^&]*?&quot;)/g, '<span class="t-str">$1</span>')
            .replace(/\b(\d+\.\d+\.\d+\.\d+(?:\/\d+)?)\b/g, '<span class="t-num">$1</span>');
        // İlk kelime anahtar kelimeyse vurgula
        const m = trimmed.match(KW);
        if (m) {
            const kw = m[1];
            out = out.replace(kw, '<span class="' + (kw === 'set' || kw === 'unset' ? 't-set' : 't-kw') + '">' + kw + '</span>');
        }
        return out;
    }).join('\n');
}

// Terminal panelini günceller. config boşsa bekleme durumu gösterir.
function cgShowOutput(config, warnings = []) {
    const body = document.getElementById('cg-term-body');
    if (!body) return;

    const has = config && String(config).trim().length > 0;
    cgLastOutput = has ? config : '';

    if (has) {
        body.innerHTML = cgHighlight(config);
    } else {
        const prompt = (typeof cgTermPrompt === 'string' && cgTermPrompt) || 'device';
        body.innerHTML = '<span class="cg-term-idle"><b>' + cgEsc(prompt) + ' #</b> Yapılandırma bekleniyor\u2026</span>';
    }

    // Uyarı şeridi
    const warnBox = document.getElementById('cg-term-warn');
    if (warnBox) {
        if (warnings && warnings.length) {
            warnBox.innerHTML = '<strong><i class="fas fa-exclamation-triangle"></i> ' + warnings.length + ' uyarı</strong><ul>' +
                warnings.map(w => '<li>' + cgEsc(w) + '</li>').join('') + '</ul>';
            warnBox.style.display = '';
        } else {
            warnBox.innerHTML = '';
            warnBox.style.display = 'none';
        }
    }

    // Kopyala / indir butonları
    ['cg-term-copy', 'cg-term-dl'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.disabled = !has;
    });
}

// Son üretilen config (kopyala/indir için)
let cgLastOutput = '';
// Terminal başlığındaki prompt (vendor seçilince güncellenir)
let cgTermPrompt = 'device';

function cgCopy() {
    if (!cgLastOutput) return;
    navigator.clipboard.writeText(cgLastOutput).then(() => {
        const btn = document.getElementById('cg-term-copy');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Kopyalandı';
        btn.classList.add('is-ok');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('is-ok'); }, 1800);
    });
}

function cgDownload() {
    if (!cgLastOutput) return;
    const name = (typeof cgTermPrompt === 'string' && cgTermPrompt !== 'device' ? cgTermPrompt : 'config')
        .replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(cgLastOutput);
    a.download = name + '.txt';
    a.click();
}

function cgPostRender(container) {
    container.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="submit"])').forEach(el => {
        el.style.fontSize = '15px';
        el.style.height = '50px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('textarea').forEach(el => {
        el.style.fontSize = '15px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('select').forEach(el => {
        el.style.fontSize = '15px';
        el.style.height = '50px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('.col-form-label, label:not(.form-check-label)').forEach(el => {
        el.style.fontSize = '14.5px';
        el.style.fontWeight = '600';
        el.style.marginBottom = '8px';
        // Renk CSS'ten gelsin — sabit değer karanlık temada okunmuyordu.
        el.style.removeProperty('color');
    });
    container.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(el => {
        el.style.padding = '15px 36px';
        el.style.fontSize = '15.5px';
        el.style.fontWeight = '700';
        el.style.marginTop = '12px';
        el.style.width = '100%';
        el.style.borderRadius = '10px';
        el.style.removeProperty('background');
        el.style.removeProperty('border-color');
        el.style.removeProperty('color');
        el.style.letterSpacing = '.4px';
    });
}

// ─── Schema-Based Form Builder ───────────────────────────────────────────────

function cgFormBuilder(container, schema, generateFn) {
    const esc = cgEsc;

    function renderBadge(badge) {
        if (!badge) return '';
        return '<span class="cg-card-badge ' + esc(badge.cls) + '">' + esc(badge.text) + '</span>';
    }

    function renderTypeCards(types) {
        if (!types || !types.length) return '';
        // Gerçek Bootstrap gridi devrede: 1-2 tipte col-md-12/6 dev kart olurdu.
        const colW = Math.floor(12 / Math.max(Math.min(types.length, 4), 3));
        const cards = types.map(t =>
            '<div class="col-md-' + colW + '">' +
            '<div class="gen-type-card-enhanced" onclick="cgFBSelectType(\'' + esc(t.id) + '\',this)">' +
            renderBadge(t.badge) +
            '<i class="' + esc(t.icon) + ' card-icon"></i>' +
            esc(t.label) +
            '<div class="card-desc">' + esc(t.desc) + '</div>' +
            '</div></div>'
        ).join('');
        return '<div class="cg-section"><div class="cg-section-title"><i class="fas fa-th-large"></i> Yapılandırma Tipi</div>' +
               '<div class="row g-3 mb-1">' + cards + '</div>' +
               '<input type="hidden" name="_cgtype" id="_cgtype" value=""></div>';
    }

    function _riField(name) {
        for (const sec of (schema.sections || [])) for (const x of (sec.fields || [])) if (x.name === name) return x;
        return null;
    }
    function _riLabel(name) {
        if (name === '_cgtype') return 'Yapılandırma tipi';
        const x = _riField(name); return (x && x.label) || name;
    }
    function _riValLabel(name, v) {
        if (name === '_cgtype') { const t = (schema.configTypes || []).find(c => c.id === v); return t ? t.label : v; }
        const x = _riField(name); if (!x || !x.options) return v;
        const o = x.options.find(o => (o.value !== undefined ? o.value : o.v) === v);
        return o ? (o.label !== undefined ? o.label : o.l) : v;
    }

    function renderField(f) {
        if (f.type === 'hidden') return '<input type="hidden" name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '" value="' + esc(f.value || '') + '">';

        const req  = f.required ? '<span class="text-danger">*</span>' : '';
        // 'Opsiyonel' etiketi eskiden ayri bir f.optional bayragina bagliydi.
        // Sonuc: 804 opsiyonel alanin yalnizca 388'i isaretliydi; kalan 416 alan
        // zorunlu alanlarla birebir ayni gorunuyordu (tek fark eksik yildiz).
        // Artik required'dan TURETILIYOR — zorunlu degilse opsiyoneldir.
        // Kosullu zorunlu alan (requiredIf): baska bir alanin degerine bagli.
        // Ornek: TACACS sunucu IP'si yalnizca yontem TACACS+ secildiginde zorunlu.
        const ri   = f.requiredIf;
        // Rozet aciklamasinda alan ADI degil ETIKET: 'auth_method = tacacs' degil
        // 'Auth Yöntemi = TACACS+ (fallback local)'.
        const riTxt = !ri ? '' : ri.checked === true  ? _riLabel(ri.field) + ' işaretliyken zorunlu'
                            : ri.checked === false ? _riLabel(ri.field) + ' işaretli değilken zorunlu'
                            : _riLabel(ri.field) + ' = ' + [].concat(ri.in).map(v => _riValLabel(ri.field, v)).join(' / ') + ' iken zorunlu';
        const opt  = ri ? '<span class="cg-opt cg-cond" title="' + esc(riTxt) + '">Koşullu</span>'
                   : (!f.required) ? '<span class="cg-opt">Opsiyonel</span>' : '';
        const tip  = f.tooltip  ? '<span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">' + esc(f.tooltip) + '</span></span>' : '';
        const hint = f.hint     ? '<span class="cg-field-hint">' + esc(f.hint) + '</span>' : '';
        // min/max var ama dogrulayici yoksa: tarayici kirmizi cizip SEBEP soylemiyordu,
        // deger de config'e aynen giriyordu. Dinamik aralik dogrulayicisina bagla.
        const vtype = f.validate || ((f.min !== undefined || f.max !== undefined) ? cgRangeValidator(f.min, f.max) : '');
        const why  = cgWhyBox(f.why, f.name) + cgRuleLine(vtype);

        const baseAttrs = 'name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '"' +
            (f.required    ? ' required'                        : '') +
            (vtype         ? ' data-cgv="' + esc(vtype) + '"' : '') +
            (ri ? ' data-req-if="' + esc(ri.field) + '"' +
                  (ri.checked !== undefined ? ' data-req-checked="' + (ri.checked ? '1' : '0') + '"'
                                            : ' data-req-in="' + esc([].concat(ri.in).join('|')) + '"') : '') +
            (f.min !== undefined ? ' min="' + f.min + '"'       : '') +
            (f.max !== undefined ? ' max="' + f.max + '"'       : '') +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') +
            (f.onChange    ? ' onchange="' + f.onChange + '"'   : '') +
            (f.value       ? ' value="' + esc(f.value) + '"'   : '');

        const label = '<label class="col-sm-4 col-form-label">' + esc(f.label) + ' ' + req + opt + ' ' + tip + '</label>';

        if (f.type === 'checkbox') {
            return '<div class="mb-3 form-check">' +
                   '<input type="checkbox" name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '" class="form-check-input"' + (f.checked ? ' checked' : '') + '>' +
                   '<label class="form-check-label" for="cgfb_' + esc(f.name) + '">' + esc(f.label) + ' ' + tip + '</label>' +
                   hint + why + '</div>';
        }

        if (f.type === 'select') {
            // Option nesneleri iki bicimde yazilmis olabilir:
            //   { value: 'x', label: 'y' }   (kanonik)
            //   { v: 'x', l: 'y' }           (kisa bicim — Cisco modullerinde kullanilmis)
            // Renderer eskiden yalnizca ilkini okuyordu; kisa bicimde yazilan her
            // option bos <option> uretip ACILIR MENUYU BOS gosteriyordu.
            // Her iki bicimi de kabul et — deger bulunamazsa option'i hic uretme,
            // boylece sessizce bos menu yerine eksiklik gorunur olur.
            const opts = (f.options || []).map(o => {
                const val = (o.value !== undefined) ? o.value : o.v;
                const lbl = (o.label !== undefined) ? o.label : o.l;
                if (val === undefined && lbl === undefined) return '';
                return '<option value="' + esc(val !== undefined ? val : lbl) + '"' +
                       (o.selected ? ' selected' : '') + '>' +
                       esc(lbl !== undefined ? lbl : val) + '</option>';
            }).join('');
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><select ' + baseAttrs + ' class="form-select">' + opts + '</select>' + hint + why + '</div></div>';
        }

        if (f.type === 'textarea') {
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><textarea ' + baseAttrs + ' class="form-control" rows="' + (f.rows || 3) + '"></textarea>' + hint + why + '</div></div>';
        }

        return '<div class="mb-4 row">' + label +
               '<div class="col-sm-8"><input type="' + (f.type || 'text') + '" ' + baseAttrs + ' class="form-control">' + hint + why + '</div></div>';
    }

    function renderSection(sec) {
        const warn = sec.warn ? '<div class="cg-warn-box mb-4"><i class="fas fa-exclamation-triangle"></i><span>' + sec.warn + '</span></div>' : '';
        const info = sec.info ? '<div class="cg-info-callout mb-4"><i class="fas fa-info-circle"></i><span>' + sec.info + '</span></div>' : '';
        const showFor = sec.showFor ? ' data-showfor="' + esc(sec.showFor.join(',')) + '"' : '';
        const display = sec.showFor ? ' style="display:none"' : '';
        return '<div class="cg-fb-section"' + showFor + display + '>' +
               '<div class="cg-section"><div class="cg-section-title"><i class="' + esc(sec.icon || 'fas fa-cog') + '"></i> ' + esc(sec.title) + '</div>' +
               cgWhyBox(sec.why, 'sec') + warn + info +
               (sec.fields || []).map(renderField).join('') +
               '</div></div>';
    }

    const topicHtml = schema.topic
        ? '<div class="cg-topic-box"><div class="cg-topic-box-icon"><i class="' + esc(schema.topic.icon) + '"></i></div>' +
          '<div class="cg-topic-box-content"><h6>' + esc(schema.topic.title) + '</h6><p>' + schema.topic.desc + '</p></div></div>'
        : '';

    const formId = 'cgfb_' + Math.random().toString(36).slice(2, 8);
    container._cgfbFormId = formId;

    container.innerHTML = topicHtml +
        '<form id="' + formId + '">' +
        renderTypeCards(schema.configTypes) +
        (schema.sections || []).map(renderSection).join('') +
        '<button type="submit" class="btn btn-primary cg-legacy-submit" style="display:none"' +
        ' id="' + formId + '_submit"><i class="fas fa-code"></i> ' + esc(schema.submit || 'Konfigürasyon Oluştur') + '</button>' +
        '</form>';

    const formEl = document.getElementById(formId);

    // ── Form verisini topla ──────────────────────────────────────────────
    function cgCollect(form, usePlaceholders) {
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = v; });
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked; });
        // Canlı önizlemede bos ZORUNLU alanlar yerine placeholder kullanilir;
        // boylece cikti tip secilir secilmez calisir bir ornek olur.
        //
        // OPSIYONEL alanlara DOKUNULMAZ. Eskiden bos olan her alana placeholder
        // yaziliyordu; bu, kullanicinin hic doldurmadigi opsiyonel alanlari
        // "dolu" gosterip ilgili satiri config'e sokuyordu. Ornek: Native VLAN
        // bos birakildiginda bile 'switchport trunk native vlan 1' uretiliyordu.
        // Generator'lar zaten bos degeri atliyor (if (nativeVlan) ...), sorun
        // degerin burada uydurulmasiydi.
        if (usePlaceholders) {
            form.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
                if (el.disabled || el.type === 'checkbox' || el.type === 'radio') return;
                if (!el.required) return;          // opsiyonel alan bos kalir
                if (!String(data[el.name] || '').trim() && el.placeholder) data[el.name] = el.placeholder;
            });
        }
        // GECERSIZ DEGERLER GENERATOR'A GONDERILMEZ.
        // Bloklayan dogrulayici (cgValidate) kod tabaninda tek yerden cagriliyordu
        // (ConfigGenerators_Cisco.js); diger 310 aracta 'required' ve 'validate'
        // yalnizca yildiz ve kirmizi cerceve ciziyor, uretimi engellemiyordu.
        // Sonuc: 'switchport trunk allowed vlan 1020304040404' veya
        // 'interface range sanane' gibi satirlar config'e girebiliyordu.
        // Canli onizlemede uretimi tumden bloklamak onizlemeyi yok eder; bunun
        // yerine gecersiz deger BOS sayilir — generator'lar bos degeri zaten
        // atliyor — ve cagiran tarafa bildirilir.
        data.__cgInvalid = [];
        form.querySelectorAll('[data-cgv]').forEach(el => {
            if (el.disabled) return;
            const raw = String(data[el.name] != null ? data[el.name] : '').trim();
            if (!raw) return;
            const v = CG_VALIDATORS[el.dataset.cgv];
            if (!v) return;
            const pass = v.re ? v.re.test(raw) : v.fn(raw);
            if (!pass) {
                data.__cgInvalid.push({ name: el.name, label: _cgLabelOf(el), value: raw,
                                        msg: cgFieldMsg(el.dataset.cgv, raw),
                                        reason: cgFieldReason(el.dataset.cgv, raw), el });
                // Silmek yerine BOS dize: korumasiz generator'lar (data.x'i dogrudan
                // yazanlar) aksi halde config'e 'undefined' yaziyordu.
                data[el.name] = '';
            }
        });
        // Bazı generator'lar tip alanını '_configType' diye okuyor; iki adı da ver.
        if (data._cgtype !== undefined) data._configType = data._cgtype;
        return data;
    }

    // ── Canlı üretim: her değişiklikte çalışır, hata fırlatmaz ───────────
    let liveTimer = null;
    function cgLiveRun() {
        // configTypes'lı formlarda tip seçilmeden üretme
        const typeInput = formEl.querySelector('[name="_cgtype"]');
        if (typeInput && !typeInput.value) {
            cgShowOutput('', []);
            return;
        }
        cgApplyRequiredIf(formEl);
        // Yumuşak doğrulama: alanları işaretler ama üretimi engellemez
        cgValidateSoft(formEl);
        // Doldurulmamış zorunlu alanları say -> kullanıcıya "örnek değer" uyarısı
        const empties = [];
        formEl.querySelectorAll('input[placeholder]:not([type=checkbox]):not([type=radio]), textarea[placeholder]').forEach(el => {
            // Yalnizca ZORUNLU alanlar icin ornek deger kullanildigindan, uyari da
            // yalnizca onlari listeler. Opsiyonel bos alan bir eksiklik degildir.
            if (!el.required) return;
            if (!el.disabled && !String(el.value || '').trim()) {
                // Placeholder her zaman gecerli bir ornek DEGILDIR: bazilari
                // "10,20,30 veya all" gibi insan icin yazilmis ipuclaridir ve
                // aynen config'e girerse satiri bozar. Bunlari isaretle.
                const ph = el.placeholder;
                const proseHint = /\b(veya|ya da|or)\b|\.\.\.|…/i.test(ph);
                empties.push({ label: _cgLabelOf(el), ph: ph, prose: proseHint });
                // ZORUNLU alanin bos olmasi bir uyari degil HATADIR. Ilk render'da
                // butun form kirmiziya donmesin diye cerceve yalnizca kullanicinin
                // dokundugu (odakladiktan sonra ciktigi) alanlara cizilir.
                if (el.dataset.cgTouched) {
                    el.classList.add('is-invalid');
                    _cgSetError(el, 'Bu alan zorunludur — boş bırakılırsa config eksik üretilir');
                }
            } else if (!el.dataset.cgv) {
                // Dogrulayicisi olmayan zorunlu alan dolduruldu: hatasini temizle.
                // (Dogrulayicisi olanlari cgValidateSoft zaten temizliyor.)
                _cgClearError(el);
            }
        });
        try {
            const collected = cgCollect(formEl, true);
            const invalid = collected.__cgInvalid || [];
            delete collected.__cgInvalid;
            const result = generateFn(collected, formEl);
            const warns = [];
            if (invalid.length) {
                invalid.forEach(iv => {
                    iv.el.classList.add('is-invalid');
                    _cgSetError(iv.el, iv.msg);
                });
                warns.push('\u26D4 ' + invalid.length + ' alan GEÇERSİZ, config\'e yazılmadı: ' +
                    invalid.slice(0, 4).map(iv => iv.label + ' = "' + iv.value + '"' +
                        (iv.reason ? ' (' + iv.reason + ')' : '')).join('; ') +
                    (invalid.length > 4 ? ' ve ' + (invalid.length - 4) + ' tane daha' : '') +
                    ' — düzeltmeden kullanmayın.');
            }
            if (empties.length) {
                const anyProse = empties.some(e => e.prose);
                warns.push('\u26D4 ' + empties.length + ' ZORUNLU alan boş: ' +
                    empties.slice(0, 4).map(e => e.label + (e.prose ? ' \u26A0' : '')).join(', ') +
                    (empties.length > 4 ? ' ve ' + (empties.length - 4) + ' tane daha' : '') +
                    ' — önizlemede örnek değerle dolduruldu, cihaza uygulamadan önce doldurun.');
                if (anyProse) {
                    warns.push('\u26A0 ile işaretli alanların örnek değeri bir açıklama metnidir, geçerli bir ' +
                               'yapılandırma değeri değildir — o satırlar cihazda çalışmaz, elle doldurun.');
                }
            }
            if (typeof result === 'string') cgShowOutput(result, warns);
            else if (result) cgShowOutput(result.config || '', (result.warnings || []).concat(warns));
            else cgShowOutput('', []);
        } catch (err) {
            // Eksik alan yüzünden generator patlayabilir; sessizce bekleme durumuna düş
            cgShowOutput('', []);
        }
    }

    function cgLiveSchedule() {
        clearTimeout(liveTimer);
        const dot = document.getElementById('cg-live-dot');
        if (dot) dot.classList.add('is-stale');
        liveTimer = setTimeout(() => {
            cgLiveRun();
            if (dot) dot.classList.remove('is-stale');
        }, 160);
    }
    container._cgLiveRun = cgLiveRun;

    formEl.addEventListener('input',  cgLiveSchedule);
    formEl.addEventListener('change', cgLiveSchedule);

    // Alandan cikildiginda 'dokunuldu' say. Zorunlu bos alanin kirmizi cercevesi
    // buna bagli: ilk acilista her zorunlu alan bos oldugu icin form bastan
    // kirmiziya boyanmaz, kullanici alani gecip bos biraktiginda boyanir.
    formEl.addEventListener('blur', e => {
        const el = e.target;
        if (!el || !el.name) return;
        el.dataset.cgTouched = '1';
        cgLiveSchedule();
    }, true);

    // Submit artık gerekli değil ama form enter'ı sayfayı yenilemesin
    formEl.addEventListener('submit', e => { e.preventDefault(); cgLiveRun(); });

    // İlk render: placeholder/default değerlerle bir kez üret
    cgLiveRun();

    cgPostRender(container);
}

// requiredIf: kosul saglandiginda alan zorunlu olur. Gizli (showFor) bolumdeki
// alan kosul saglansa bile zorunlu sayilmaz — bolum zaten config'e girmez.
function cgApplyRequiredIf(form) {
    form.querySelectorAll('[data-req-if]').forEach(el => {
        const ctl = form.querySelector('[name="' + el.dataset.reqIf + '"]');
        let on = false;
        if (ctl) on = el.dataset.reqChecked !== undefined ? (!!ctl.checked === (el.dataset.reqChecked === '1'))
                                                          : el.dataset.reqIn.split('|').includes(ctl.value);
        const sec = el.closest('.cg-fb-section');
        if (sec && sec.style.display === 'none') on = false;
        el.required = on;
        if (!on && !String(el.value || '').trim()) { el.classList.remove('is-invalid'); _cgClearError(el); }
    });
}

function cgFBSelectType(typeId, cardEl) {
    const form = cardEl.closest('form');
    form.querySelectorAll('.gen-type-card-enhanced').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');
    const hidden = form.querySelector('[name="_cgtype"]');
    if (hidden) hidden.value = typeId;
    form.querySelectorAll('.cg-fb-section[data-showfor]').forEach(sec => {
        const show = sec.dataset.showfor.split(',').includes(typeId);
        sec.style.display = show ? '' : 'none';
        sec.querySelectorAll('input,select,textarea').forEach(el => {
            // Gizli bolumdeki HER alan devre disi: eskiden yalniz zorunlular
            // kapatiliyordu. Ayni adli alan iki bolumde varsa (SNMP v3 ve v1/v2c'de
            // trap_host) gizlideki bos kopya FormData'da gorunenin degerini eziyordu.
            el.disabled = !show;
            if (el.dataset.reqIf) return;          // zorunlulugu cgApplyRequiredIf yonetir
            if (el.dataset.origRequired === 'true' || el.required) {
                if (!el.dataset.origRequired) el.dataset.origRequired = 'true';
                el.required = show;
            }
        });
    });
    // Canlı üretim: tip seçilir seçilmez çıktıyı yenile
    const host = form.closest('#cg-form-area') || form.parentElement;
    if (host && typeof host._cgLiveRun === 'function') host._cgLiveRun();
}

// ─── GENERATORS Registry ─────────────────────────────────────────────────────

// ─── Kategoriler ─────────────────────────────────────────────────────────────
// Her vendor icinde SABIT sirada gosterilir; bos kategori gizlenir. Boylece
// "Syslog nerede?" sorusunun cevabi her vendor'da ayni yerdir.
const CG_CATEGORIES = [
    { id: 'base',    label: 'Temel Kurulum',             icon: 'fas fa-play-circle' },
    { id: 'mgmt',    label: 'Yönetim & İzleme',          icon: 'fas fa-chart-line' },
    { id: 'aaa',     label: 'Kimlik & Erişim',           icon: 'fas fa-user-shield' },
    { id: 'l2',      label: 'L2 Switching',              icon: 'fas fa-sitemap' },
    { id: 'iface',   label: 'Arayüz & Adresleme',        icon: 'fas fa-ethernet' },
    { id: 'routing', label: 'Yönlendirme',               icon: 'fas fa-route' },
    { id: 'ha',      label: 'Yedeklilik / HA',           icon: 'fas fa-clone' },
    { id: 'overlay', label: 'DC Fabric / Overlay',       icon: 'fas fa-project-diagram' },
    { id: 'mpls',    label: 'MPLS / Servis Sağlayıcı',   icon: 'fas fa-tags' },
    { id: 'secpol',  label: 'Güvenlik Politikası & NAT', icon: 'fas fa-shield-alt' },
    { id: 'vpn',     label: 'VPN',                       icon: 'fas fa-lock' },
    { id: 'utm',     label: 'Tehdit Önleme / UTM',       icon: 'fas fa-bug' },
    { id: 'qos',     label: 'QoS & Trafik',              icon: 'fas fa-tachometer-alt' },
    { id: 'adc',     label: 'Uygulama Teslimi (ADC)',    icon: 'fas fa-balance-scale' },
    { id: 'ref',     label: 'Referans',                  icon: 'fas fa-book-open' },
];
const CG_CAT_BY_ID = Object.fromEntries(CG_CATEGORIES.map(c => [c.id, c]));

const CG_REGISTRY = {
    'cisco-ios': {
        label: 'Cisco IOS', icon: 'fas fa-network-wired', color: '#1BA0D7',
        types: [
            { id: 'vlan',          cat: 'l2', label: 'VLAN',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vlan },
            { id: 'acl',           cat: 'secpol', label: 'ACL',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.acl },
            { id: 'nat',           cat: 'secpol', label: 'NAT / PAT',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.nat },
            { id: 'static-route',  cat: 'routing', label: 'Static Route',    gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.route },
            { id: 'ospf',          cat: 'routing', label: 'OSPF',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ospf },
            { id: 'bgp',           cat: 'routing', label: 'BGP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bgp },
            { id: 'ipsec',         cat: 'vpn', label: 'IPSec VPN',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ipsec },
            { id: 'dhcp',          cat: 'base', label: 'DHCP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dhcp },
            { id: 'snmp',          cat: 'mgmt', label: 'SNMP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.snmp },
            { id: 'aaa',           cat: 'aaa', label: 'AAA',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.aaa },
            { id: 'tacacs',        cat: 'aaa', label: 'TACACS+',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tacacs },
            { id: 'ssh',           cat: 'aaa', label: 'SSH',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ssh },
            { id: 'password',      cat: 'aaa', label: 'Password/User',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.password },
            { id: 'vrrp-hsrp',     cat: 'ha', label: 'VRRP/HSRP/GLBP', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrrp },
            { id: 'stp',           cat: 'l2', label: 'STP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.stp },
            { id: 'port-security', cat: 'l2', label: 'Port Security',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.portSecurity },
            { id: 'qos',           cat: 'qos', label: 'QoS',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.qos },
            { id: 'gre',           cat: 'vpn', label: 'GRE Tunnel',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.gre },
            { id: 'tracking',      cat: 'ha', label: 'IP SLA/Tracking', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tracking },
            { id: 'rate-limit',    cat: 'qos', label: 'Rate Limit',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.rateLimit },
            { id: 'advanced',      cat: 'base', label: 'Advanced Multi',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.advanced },
            { id: 'etherchannel',  cat: 'l2', label: 'EtherChannel/LACP',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.etherchannel },
            { id: 'dmvpn',         cat: 'vpn', label: 'DMVPN',              gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dmvpn },
            { id: 'eigrpnamed',    cat: 'routing', label: 'EIGRP Named Mode',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.eigrpnamed },
            { id: 'vrflite',       cat: 'routing', label: 'VRF-Lite',           gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrflite },
            { id: 'mpls',          cat: 'mpls', label: 'MPLS / LDP',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.mpls },
            { id: 'l3vpn',         cat: 'mpls', label: 'L3VPN (PE)',          gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.l3vpn },
            { id: 'routemap',      cat: 'routing', label: 'Route-Map & Redist.', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.routemap },
            { id: 'isis',          cat: 'routing', label: 'IS-IS',               gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.isis },
            { id: 'zbfw',          cat: 'secpol', label: 'Zone-Based Firewall',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.zbfw },
            { id: 'bfd',           cat: 'routing', label: 'BFD',                  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bfd },
            { id: 'span',          cat: 'mgmt', label: 'SPAN / RSPAN',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.span },
            { id: 'ntp',           cat: 'mgmt', label: 'NTP / Saat',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ntp },
            { id: 'logging',       cat: 'mgmt', label: 'Syslog / Logging',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.logging },
            { id: 'lldp',          cat: 'l2',   label: 'LLDP / CDP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.lldp },
            { id: 'archive',       cat: 'mgmt', label: 'Config Archive / Yedek', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.archive },
            { id: 'vtp',           cat: 'l2',   label: 'VTP',                    gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vtp },
            { id: 'hardening',     cat: 'base', label: 'Cihaz Sertleştirme',     gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.hardening },
        ]
    },
    'cisco-ftd': {
        label: 'Cisco FTD', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'bootstrap',       cat: 'base', label: 'FTD Bootstrap',        gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.bootstrap },
            { id: 'interface',       cat: 'iface', label: 'Interface',             gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.interface },
            { id: 'nat',             cat: 'secpol', label: 'NAT',                   gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.nat },
            { id: 'accessControl',   cat: 'secpol', label: 'Access Control Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.accessControl },
            { id: 'intrusionPolicy', cat: 'utm', label: 'Intrusion Policy',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.intrusionPolicy },
            { id: 'sslPolicy',       cat: 'utm', label: 'SSL Policy',            gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.sslPolicy },
            { id: 'siteToSiteVpn',   cat: 'vpn', label: 'Site-to-Site VPN',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.siteToSiteVpn },
            { id: 'raVpn',           cat: 'vpn', label: 'Remote Access VPN',     gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.raVpn },
            { id: 'platformSyslog', cat: 'mgmt', label: 'Platform Settings: Syslog', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformSyslog },
            { id: 'platformTime', cat: 'mgmt', label: 'Platform Settings: NTP', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformTime },
            { id: 'platformSnmp', cat: 'mgmt', label: 'Platform Settings: SNMP', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformSnmp },
            { id: 'staticRoute', cat: 'routing', label: 'Static Route + SLA', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.staticRoute },
            { id: 'prefilter', cat: 'secpol', label: 'Prefilter Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.prefilter },
            { id: 'identityPolicy', cat: 'secpol', label: 'Identity Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.identityPolicy },
        ]
    },
    'cisco-nxos': {
        label: 'Cisco NX-OS', icon: 'fas fa-server', color: '#1BA0D7',
        types: [
            { id: 'mpls',  cat: 'mpls', label: 'MPLS',       gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.mpls },
            { id: 'vpc',   cat: 'ha', label: 'vPC',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vpc },
            { id: 'vxlan', cat: 'overlay', label: 'VXLAN/EVPN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vxlan },
            { id: 'span',  cat: 'mgmt', label: 'SPAN/RSPAN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.span },
            { id: 'ospf',  cat: 'routing', label: 'OSPF',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ospf },
            { id: 'bgp',   cat: 'routing', label: 'BGP',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgp },
            { id: 'hsrp',       cat: 'ha', label: 'HSRP',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.hsrp },
            { id: 'evpn',       cat: 'overlay', label: 'EVPN',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.evpn },
            { id: 'fabricPath', cat: 'overlay', label: 'FabricPath',    gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.fabricPath },
            { id: 'aaa',        cat: 'aaa', label: 'AAA',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.aaa },
            { id: 'acl',        cat: 'secpol', label: 'ACL',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.acl },
            { id: 'qos',        cat: 'qos', label: 'QoS',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.qos },
            { id: 'syslog',     cat: 'mgmt', label: 'Syslog',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.syslog },
            { id: 'ntp',        cat: 'mgmt', label: 'NTP',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ntp },
            { id: 'features', cat: 'base', label: 'Feature Yönetimi', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.features },
            { id: 'system', cat: 'base', label: 'Temel Sistem', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.system },
            { id: 'vlan', cat: 'l2', label: 'VLAN', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vlan },
            { id: 'interface', cat: 'iface', label: 'Arayüz', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.interface },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.snmp },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.staticRoute },
            { id: 'vrf', cat: 'routing', label: 'VRF Context', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vrf },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.stp },
            { id: 'users', cat: 'aaa', label: 'Kullanıcı / RBAC', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.users },
            { id: 'mgmtAccess', cat: 'mgmt', label: 'Banner / Line / SSH', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.mgmtAccess },
            { id: 'scheduler', cat: 'mgmt', label: 'Otomatik Yedek (Scheduler)', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.scheduler },
            { id: 'pvlan', cat: 'l2', label: 'Private VLAN', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.pvlan },
            { id: 'lldp', cat: 'l2', label: 'LLDP / CDP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.lldp },
            { id: 'copp', cat: 'secpol', label: 'CoPP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.copp },
        ]
    },
    'huawei': {
        label: 'Huawei VRP', icon: 'fas fa-broadcast-tower', color: '#CF0A2C',
        types: [
            { id: 'basic',       cat: 'base', label: 'Temel',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.basic },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vlan },
            { id: 'dhcp',        cat: 'base', label: 'DHCP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.dhcp },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmp },
            { id: 'nat',         cat: 'secpol', label: 'NAT/Port Forward',     gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.nat },
            { id: 'tacacs',      cat: 'aaa', label: 'TACACS+',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.tacacs },
            { id: 'acl',         cat: 'secpol', label: 'ACL',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.acl },
            { id: 'security',    cat: 'secpol', label: 'Security Policy',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.security },
            { id: 'isis',        cat: 'routing', label: 'IS-IS',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.isis },
            { id: 'ethtunk',     cat: 'l2', label: 'Eth-Trunk (LAG)',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ethtunk },
            { id: 'mpls',        cat: 'mpls', label: 'MPLS / LDP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mpls },
            { id: 'l3vpn',       cat: 'mpls', label: 'L3VPN (VRF)',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.l3vpn },
            { id: 'interface',   cat: 'iface', label: 'Interface / Loopback', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.interface },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bgp },
            { id: 'mstp',        cat: 'l2', label: 'MSTP / STP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mstp },
            { id: 'qos',         cat: 'qos', label: 'QoS MQC',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.qos },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bfd },
            { id: 'ntp',         cat: 'mgmt', label: 'NTP / Clock',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ntp },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / RADIUS',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.aaa },
            { id: 'snmpv3',      cat: 'mgmt', label: 'SNMP v3 (Detaylı)',    gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmpv3 },
            { id: 'ssh',         cat: 'aaa', label: 'SSH / User',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ssh },
            { id: 'routepolicy', cat: 'routing', label: 'Route Policy',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.routepolicy },
            { id: 'ipsec',       cat: 'vpn', label: 'IPSec VPN IKEv2',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipsec },
            { id: 'ipv6',        cat: 'iface', label: 'IPv6 Interface',       gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipv6 },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.syslog },
            { id: 'lldp', cat: 'mgmt', label: 'LLDP', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.lldp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.staticroute },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vrrp },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mirror },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.storm },
            { id: 'vty', cat: 'aaa', label: 'VTY / Yönetim Erişimi', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vty },
            { id: 'stack', cat: 'ha', label: 'iStack', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.stack },
            { id: 'igmpsnoop', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.igmpsnoop },
            { id: 'stpguard', cat: 'l2', label: 'STP Port Koruması', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.stpguard },
        ]
    },
    'juniper': {
        label: 'Juniper JunOS', icon: 'fas fa-leaf', color: '#84B135',
        types: [
            { id: 'general', cat: 'base', label: 'Genel',         gen: () => typeof Juniper !== 'undefined' && Juniper.general },
            { id: 'vlan',    cat: 'l2', label: 'VLAN',           gen: () => typeof Juniper !== 'undefined' && Juniper.vlan },
            { id: 'dhcp',    cat: 'base', label: 'DHCP',           gen: () => typeof Juniper !== 'undefined' && Juniper.dhcp },
            { id: 'acl',      cat: 'secpol', label: 'ACL/Filter',    gen: () => typeof Juniper !== 'undefined' && Juniper.acl },
            { id: 'lag',      cat: 'l2', label: 'LAG (ae)',       gen: () => typeof Juniper !== 'undefined' && Juniper.lag },
            { id: 'mclag',    cat: 'ha', label: 'MC-LAG',          gen: () => typeof Juniper !== 'undefined' && Juniper.mclag },
            { id: 'evpnvxlan',cat: 'overlay', label: 'EVPN-VXLAN',     gen: () => typeof Juniper !== 'undefined' && Juniper.evpnvxlan },
            { id: 'system', cat: 'base', label: 'Sistem Temeli (DNS/NTP/Banner)', gen: () => typeof Juniper !== 'undefined' && Juniper.system },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog', gen: () => typeof Juniper !== 'undefined' && Juniper.syslog },
            { id: 'users', cat: 'aaa', label: 'Kullanıcı & Login Class', gen: () => typeof Juniper !== 'undefined' && Juniper.users },
            { id: 'ssh', cat: 'aaa', label: 'SSH Servisi', gen: () => typeof Juniper !== 'undefined' && Juniper.ssh },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof Juniper !== 'undefined' && Juniper.snmp },
            { id: 'lldp', cat: 'l2', label: 'LLDP / LLDP-MED', gen: () => typeof Juniper !== 'undefined' && Juniper.lldp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof Juniper !== 'undefined' && Juniper.staticroute },
            { id: 'stp', cat: 'l2', label: 'RSTP / MSTP', gen: () => typeof Juniper !== 'undefined' && Juniper.stp },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof Juniper !== 'undefined' && Juniper.ospf },
            { id: 'bgp', cat: 'routing', label: 'BGP', gen: () => typeof Juniper !== 'undefined' && Juniper.bgp },
            { id: 'policy', cat: 'routing', label: 'Policy-Options', gen: () => typeof Juniper !== 'undefined' && Juniper.policy },
            { id: 'vrrp', cat: 'ha', label: 'VRRP (IRB)', gen: () => typeof Juniper !== 'undefined' && Juniper.vrrp },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof Juniper !== 'undefined' && Juniper.storm },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring (Analyzer)', gen: () => typeof Juniper !== 'undefined' && Juniper.mirror },
            { id: 'archival', cat: 'mgmt', label: 'Config Arşivleme', gen: () => typeof Juniper !== 'undefined' && Juniper.archival },
            { id: 'igmp', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof Juniper !== 'undefined' && Juniper.igmp },
        ]
    },
    'juniper-mx': {
        label: 'Juniper MX', icon: 'fas fa-leaf', color: '#5A8A1A',
        types: [
            { id: 'interface',    cat: 'iface', label: 'Interface',                    gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.interface },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',                         gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.ospf },
            { id: 'bgp',          cat: 'routing', label: 'BGP',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bgp },
            { id: 'mpls',         cat: 'mpls', label: 'MPLS / LDP',                   gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.mpls },
            { id: 'l3vpn',        cat: 'mpls', label: 'L3VPN (VRF)',                  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.l3vpn },
            { id: 'bfd',          cat: 'routing', label: 'BFD',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bfd },
            { id: 'rsvpte',       cat: 'mpls', label: 'Traffic Engineering RSVP-TE',  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.rsvpte },
            { id: 'cos',          cat: 'qos', label: 'QoS / Class-of-Service',       gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.cos },
            { id: 'routepolicy',  cat: 'routing', label: 'Routing Policy + Prefix-List', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.routepolicy },
            { id: 'snmp',         cat: 'mgmt', label: 'SNMP v3',                      gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.snmp },
            { id: 'system', cat: 'base', label: 'Sistem Temeli (RE0/RE1, NTP, DNS, Syslog)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.system },
            { id: 'staticroute', cat: 'routing', label: 'Static Route + Virtual-Router', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.staticroute },
            { id: 'isis', cat: 'routing', label: 'IS-IS', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.isis },
            { id: 'ldpadv', cat: 'mpls', label: 'LDP Gelişmiş (Sync / Protection / MD5)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.ldpadv },
            { id: 'l2vpn', cat: 'mpls', label: 'L2VPN (L2Circuit / VPLS / EVPN-MPLS)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.l2vpn },
            { id: 'protectre', cat: 'secpol', label: 'Protect-RE (lo0 Filtresi)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.protectre },
            { id: 'policer', cat: 'qos', label: 'Policer (Rate-Limit)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.policer },
            { id: 'bgprr', cat: 'routing', label: 'BGP Route Reflector', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bgprr },
            { id: 'cosrewrite', cat: 'qos', label: 'CoS Rewrite Rules', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.cosrewrite },
            { id: 'gres', cat: 'ha', label: 'GRES / NSR (Çift RE)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.gres },
            { id: 'jflow', cat: 'mgmt', label: 'Inline J-Flow (IPFIX / v9)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.jflow },
        ]
    },
    'juniper-srx': {
        label: 'Juniper SRX', icon: 'fas fa-shield-alt', color: '#3A6B0A',
        types: [
            { id: 'zone',        cat: 'secpol', label: 'Security Zone',         gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.zone },
            { id: 'policy',      cat: 'secpol', label: 'Security Policy',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.policy },
            { id: 'nat',         cat: 'secpol', label: 'NAT Policy',            gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.nat },
            { id: 'vpn',         cat: 'vpn', label: 'IPsec VPN',             gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.vpn },
            { id: 'ha',          cat: 'ha', label: 'Chassis Cluster',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ha },
            { id: 'appfw',       cat: 'utm', label: 'AppSecure / UTM',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.appfw },
            { id: 'interface',   cat: 'iface', label: 'Interface ge/xe/ae',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.interface },
            { id: 'addrbook',    cat: 'secpol', label: 'Address Book Object',   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.addrbook },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                  gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.bgp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.staticroute },
            { id: 'dhcp',        cat: 'base', label: 'DHCP Server',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.dhcp },
            { id: 'screens',     cat: 'utm', label: 'Screens DoS',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.screens },
            { id: 'customapp',   cat: 'utm', label: 'Custom Application',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.customapp },
            { id: 'alg',         cat: 'utm', label: 'ALG Settings',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.alg },
            { id: 'jflow',       cat: 'mgmt', label: 'J-Flow / NetFlow',      gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.jflow },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP v3',               gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.snmp },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / RADIUS',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.aaa },
            { id: 'syslog', cat: 'mgmt', label: 'System Syslog', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.syslog },
            { id: 'seclog', cat: 'mgmt', label: 'Security Log', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.seclog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ntp },
            { id: 'login', cat: 'aaa', label: 'Kullanıcı / Login', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.login },
            { id: 'vr', cat: 'routing', label: 'Virtual Router', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.vr },
            { id: 'reth', cat: 'ha', label: 'Cluster reth / RG', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.reth },
        ]
    },
    'dell': {
        label: 'Dell OS10', icon: 'fas fa-hdd', color: '#007DB8',
        types: [
            { id: 'general',      cat: 'base', label: 'Genel',           gen: () => typeof Dell !== 'undefined' && Dell.general },
            { id: 'vlan',         cat: 'l2', label: 'VLAN',             gen: () => typeof Dell !== 'undefined' && Dell.vlan },
            { id: 'portchannel',  cat: 'l2', label: 'Port-Channel/LAG', gen: () => typeof Dell !== 'undefined' && Dell.portchannel },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',             gen: () => typeof Dell !== 'undefined' && Dell.ospf },
            { id: 'bgp',          cat: 'routing', label: 'BGP',              gen: () => typeof Dell !== 'undefined' && Dell.bgp },
            { id: 'vlt',          cat: 'ha', label: 'VLT (MLAG)',        gen: () => typeof Dell !== 'undefined' && Dell.vlt },
            { id: 'acl',          cat: 'secpol', label: 'ACL',               gen: () => typeof Dell !== 'undefined' && Dell.acl },
            { id: 'qos',          cat: 'qos', label: 'QoS Policy',        gen: () => typeof Dell !== 'undefined' && Dell.qos },
            { id: 'vxlan',        cat: 'overlay', label: 'VXLAN',            gen: () => typeof Dell !== 'undefined' && Dell.vxlan },
            { id: 'mclag',        cat: 'ha', label: 'MC-LAG',            gen: () => typeof Dell !== 'undefined' && Dell.mclag },
            { id: 'bgpEvpn',      cat: 'overlay', label: 'BGP EVPN',          gen: () => typeof Dell !== 'undefined' && Dell.bgpEvpn },
            { id: 'qosPolicy',    cat: 'qos', label: 'QoS Policy Map',    gen: () => typeof Dell !== 'undefined' && Dell.qosPolicy },
            { id: 'ntp',          cat: 'mgmt', label: 'NTP',               gen: () => typeof Dell !== 'undefined' && Dell.ntp },
            { id: 'syslog',       cat: 'mgmt', label: 'Syslog',            gen: () => typeof Dell !== 'undefined' && Dell.syslog },
            { id: 'snmpv3',       cat: 'mgmt', label: 'SNMP v3',           gen: () => typeof Dell !== 'undefined' && Dell.snmpv3 },
            { id: 'stormControl', cat: 'qos', label: 'Storm Control',     gen: () => typeof Dell !== 'undefined' && Dell.stormControl },
            { id: 'aaa', cat: 'aaa', label: 'AAA / Kullanıcı', gen: () => typeof Dell !== 'undefined' && Dell.aaa },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof Dell !== 'undefined' && Dell.stp },
            { id: 'vrf', cat: 'routing', label: 'VRF', gen: () => typeof Dell !== 'undefined' && Dell.vrf },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof Dell !== 'undefined' && Dell.staticRoute },
            { id: 'lldp', cat: 'l2', label: 'LLDP', gen: () => typeof Dell !== 'undefined' && Dell.lldp },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof Dell !== 'undefined' && Dell.mirror },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof Dell !== 'undefined' && Dell.vrrp },
            { id: 'iface', cat: 'iface', label: 'Arayüz', gen: () => typeof Dell !== 'undefined' && Dell.iface },
            { id: 'breakout', cat: 'iface', label: 'Breakout / Port-Group', gen: () => typeof Dell !== 'undefined' && Dell.breakout },
            { id: 'iscsi', cat: 'qos', label: 'iSCSI', gen: () => typeof Dell !== 'undefined' && Dell.iscsi },
            { id: 'hardening', cat: 'base', label: 'Banner / Sertleştirme', gen: () => typeof Dell !== 'undefined' && Dell.hardening },
        ]
    },
    'arista': {
        label: 'Arista EOS', icon: 'fas fa-ethernet', color: '#FF6600',
        types: [
            { id: 'general',     cat: 'base', label: 'General',                gen: () => typeof Arista !== 'undefined' && Arista.general },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                   gen: () => typeof Arista !== 'undefined' && Arista.vlan },
            { id: 'interface',   cat: 'iface', label: 'Interface (L3)',          gen: () => typeof Arista !== 'undefined' && Arista.interface },
            { id: 'portchannel', cat: 'l2', label: 'Port-Channel/LACP',      gen: () => typeof Arista !== 'undefined' && Arista.portchannel },
            { id: 'mlag',        cat: 'ha', label: 'MLAG',                   gen: () => typeof Arista !== 'undefined' && Arista.mlag },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                   gen: () => typeof Arista !== 'undefined' && Arista.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                    gen: () => typeof Arista !== 'undefined' && Arista.bgp },
            { id: 'evpnvxlan',   cat: 'overlay', label: 'EVPN-VXLAN',             gen: () => typeof Arista !== 'undefined' && Arista.evpnvxlan },
            { id: 'acl',         cat: 'secpol', label: 'ACL',                    gen: () => typeof Arista !== 'undefined' && Arista.acl },
            { id: 'routemap',    cat: 'routing', label: 'Route-Map + Prefix-List', gen: () => typeof Arista !== 'undefined' && Arista.routemap },
            { id: 'qos',         cat: 'qos', label: 'QoS (Traffic-Policy)',   gen: () => typeof Arista !== 'undefined' && Arista.qos },
            { id: 'stp',         cat: 'l2', label: 'STP / MSTP',             gen: () => typeof Arista !== 'undefined' && Arista.stp },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                    gen: () => typeof Arista !== 'undefined' && Arista.bfd },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / TACACS+',          gen: () => typeof Arista !== 'undefined' && Arista.aaa },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP',                   gen: () => typeof Arista !== 'undefined' && Arista.snmp },
            { id: 'mgmtacl',     cat: 'aaa', label: 'Management ACL',         gen: () => typeof Arista !== 'undefined' && Arista.mgmtacl },
            { id: 'ntp',         cat: 'mgmt', label: 'NTP',                    gen: () => typeof Arista !== 'undefined' && Arista.ntp },
            { id: 'logging',     cat: 'mgmt', label: 'Logging / Syslog',       gen: () => typeof Arista !== 'undefined' && Arista.logging },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof Arista !== 'undefined' && Arista.staticroute },
            { id: 'lldp', cat: 'l2', label: 'LLDP', gen: () => typeof Arista !== 'undefined' && Arista.lldp },
            { id: 'vrrp', cat: 'ha', label: 'VRRP / VARP', gen: () => typeof Arista !== 'undefined' && Arista.vrrp },
            { id: 'monitor', cat: 'mgmt', label: 'Port Mirroring (SPAN)', gen: () => typeof Arista !== 'undefined' && Arista.monitor },
            { id: 'sflow', cat: 'mgmt', label: 'sFlow', gen: () => typeof Arista !== 'undefined' && Arista.sflow },
            { id: 'vrf', cat: 'routing', label: 'VRF', gen: () => typeof Arista !== 'undefined' && Arista.vrf },
            { id: 'localuser', cat: 'aaa', label: 'Yerel Kullanıcı & Rol', gen: () => typeof Arista !== 'undefined' && Arista.localuser },
            { id: 'system', cat: 'base', label: 'Sistem (Hostname/DNS/Banner)', gen: () => typeof Arista !== 'undefined' && Arista.system },
            { id: 'sshharden', cat: 'mgmt', label: 'SSH Sertleştirme', gen: () => typeof Arista !== 'undefined' && Arista.sshharden },
            { id: 'eapi', cat: 'mgmt', label: 'Management API (eAPI)', gen: () => typeof Arista !== 'undefined' && Arista.eapi },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof Arista !== 'undefined' && Arista.storm },
            { id: 'igmpsnoop', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof Arista !== 'undefined' && Arista.igmpsnoop },
            { id: 'eventhandler', cat: 'mgmt', label: 'Event Handler', gen: () => typeof Arista !== 'undefined' && Arista.eventhandler },
        ]
    },
    'mikrotik': {
        label: 'MikroTik RouterOS', icon: 'fas fa-route', color: '#293239',
        types: [
            { id: 'general',    cat: 'base', label: 'General',            gen: () => typeof MikroTik !== 'undefined' && MikroTik.general },
            { id: 'bridgevlan', cat: 'l2', label: 'Bridge + VLAN',      gen: () => typeof MikroTik !== 'undefined' && MikroTik.bridgevlan },
            { id: 'ipaddress',  cat: 'iface', label: 'IP Address + Route', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipaddress },
            { id: 'firewall',   cat: 'secpol', label: 'Firewall Filter',    gen: () => typeof MikroTik !== 'undefined' && MikroTik.firewall },
            { id: 'nat',        cat: 'secpol', label: 'NAT',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.nat },
            { id: 'dhcp',       cat: 'base', label: 'DHCP Server',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.dhcp },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec Site-to-Site', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipsec },
            { id: 'wireguard',  cat: 'vpn', label: 'WireGuard',          gen: () => typeof MikroTik !== 'undefined' && MikroTik.wireguard },
            { id: 'ospf',       cat: 'routing', label: 'OSPF',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.ospf },
            { id: 'bgp',        cat: 'routing', label: 'BGP',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.bgp },
            { id: 'queue',      cat: 'qos', label: 'Queue / HTB',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.queue },
            { id: 'snmp',       cat: 'mgmt', label: 'SNMP',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.snmp },
            { id: 'logging',    cat: 'mgmt', label: 'Logging / Syslog',   gen: () => typeof MikroTik !== 'undefined' && MikroTik.logging },
            { id: 'lb', cat: 'routing', label: 'Load Balancing (PCC / ECMP)', gen: () => typeof MikroTik !== 'undefined' && MikroTik.lb },
            { id: 'failover', cat: 'routing', label: 'WAN Failover', gen: () => typeof MikroTik !== 'undefined' && MikroTik.failover },
            { id: 'netwatch', cat: 'mgmt', label: 'Netwatch', gen: () => typeof MikroTik !== 'undefined' && MikroTik.netwatch },
            { id: 'hotspot', cat: 'aaa', label: 'HotSpot', gen: () => typeof MikroTik !== 'undefined' && MikroTik.hotspot },
            { id: 'pppoe', cat: 'vpn', label: 'PPPoE', gen: () => typeof MikroTik !== 'undefined' && MikroTik.pppoe },
            { id: 'ntp', cat: 'mgmt', label: 'NTP / Saat', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ntp },
            { id: 'dns', cat: 'base', label: 'DNS', gen: () => typeof MikroTik !== 'undefined' && MikroTik.dns },
            { id: 'hardening', cat: 'aaa', label: 'Yönetim Sertleştirme', gen: () => typeof MikroTik !== 'undefined' && MikroTik.hardening },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof MikroTik !== 'undefined' && MikroTik.vrrp },
            { id: 'bonding', cat: 'l2', label: 'Bonding / LACP', gen: () => typeof MikroTik !== 'undefined' && MikroTik.bonding },
            { id: 'backup', cat: 'mgmt', label: 'Otomatik Yedek', gen: () => typeof MikroTik !== 'undefined' && MikroTik.backup },
        ]
    },
    'extreme': {
        label: 'Extreme Networks', icon: 'fas fa-project-diagram', color: '#582C83',
        types: [
            { id: 'general', cat: 'base', label: 'Genel', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.general },
            { id: 'vlan', cat: 'l2', label: 'VLAN', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.vlan },
            { id: 'ipIface', cat: 'iface', label: 'IP Arayüzü', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ipIface },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.staticRoute },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ospf },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.vrrp },
            { id: 'lag', cat: 'l2', label: 'Link Aggregation', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.lag },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.stp },
            { id: 'snmp', cat: 'mgmt', label: 'SNMPv3', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.snmp },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.syslog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP / SNTP', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ntp },
            { id: 'accounts', cat: 'aaa', label: 'Kullanıcı Hesapları', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.accounts },
        ]
    },
    'cisco-asa': {
        label: 'Cisco ASA', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'interface', cat: 'iface', label: 'Interface',  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.interface },
            { id: 'acl',       cat: 'secpol', label: 'ACL',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.acl },
            { id: 'nat',       cat: 'secpol', label: 'NAT',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.nat },
            { id: 'ospf',      cat: 'routing', label: 'OSPF',       gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ospf },
            { id: 'anyconnect',  cat: 'vpn', label: 'AnyConnect VPN', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.anyconnect },
            { id: 'objectgroup',      cat: 'secpol', label: 'Object Groups',      gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.objectgroup },
            { id: 'vpn',              cat: 'vpn', label: 'Site-to-Site VPN',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.vpn },
            { id: 'aaa',              cat: 'aaa', label: 'AAA',                  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaa },
            { id: 'routeMap',         cat: 'routing', label: 'Static Route / PBR',            gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.routeMap },
            { id: 'mpfServicePolicy', cat: 'secpol', label: 'MPF Service Policy',   gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.mpfServicePolicy },
            { id: 'failoverHA',       cat: 'ha', label: 'Failover HA',          gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.failoverHA },
            { id: 'aaaRadius',        cat: 'aaa', label: 'AAA RADIUS Server',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaaRadius },
            { id: 'logging', cat: 'mgmt', label: 'Syslog / Logging', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.logging },
            { id: 'ntpClock', cat: 'mgmt', label: 'NTP / Saat', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ntpClock },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.snmp },
            { id: 'mgmtAccess', cat: 'mgmt', label: 'Yönetim Erişimi (SSH/ASDM)', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.mgmtAccess },
            { id: 'localUsers', cat: 'aaa', label: 'Yerel Kullanıcılar / Privilege', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.localUsers },
            { id: 'routeTrack', cat: 'routing', label: 'Statik Rota + SLA Tracking', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.routeTrack },
            { id: 'twiceNat', cat: 'secpol', label: 'Twice NAT / Identity NAT', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.twiceNat },
            { id: 'threatDetection', cat: 'secpol', label: 'Threat Detection', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.threatDetection },
            { id: 'dhcpServer', cat: 'base', label: 'DHCP Sunucu / Relay', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.dhcpServer },
        ]
    },
    'fortigate': {
        label: 'FortiGate', icon: 'fas fa-shield-alt', color: '#EE3124',
        types: [
            { id: 'interface', cat: 'iface', label: 'Interface',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.interface },
            { id: 'address',   cat: 'secpol', label: 'Address Object',  gen: () => typeof FortiGate !== 'undefined' && FortiGate.address },
            { id: 'policy',    cat: 'secpol', label: 'Security Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.policy },
            { id: 'nat',       cat: 'secpol', label: 'NAT / VIP',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.nat },
            { id: 'ipsec',     cat: 'vpn', label: 'IPSec VPN',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipsec },
            { id: 'sslvpn',     cat: 'vpn', label: 'SSL-VPN',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.sslvpn },
            { id: 'secprofile', cat: 'utm', label: 'Security Profiles',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.secprofile },
            { id: 'sdwan',      cat: 'routing', label: 'SD-WAN',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.sdwan },
            { id: 'ha',         cat: 'ha', label: 'HA Active-Passive',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.ha },
            { id: 'vlanintf',   cat: 'iface', label: 'VLAN Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.vlanintf },
            { id: 'dhcp',       cat: 'base', label: 'DHCP Server',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.dhcp },
            { id: 'ospf',       cat: 'routing', label: 'OSPF',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.ospf },
            { id: 'bgp',        cat: 'routing', label: 'BGP',                     gen: () => typeof FortiGate !== 'undefined' && FortiGate.bgp },
            { id: 'webfilter',  cat: 'utm', label: 'Web Filter Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.webfilter },
            { id: 'ips',        cat: 'utm', label: 'IPS Sensor',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.ips },
            { id: 'antivirus',  cat: 'utm', label: 'Anti-Virus Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.antivirus },
            { id: 'appcontrol', cat: 'utm', label: 'Application Control',     gen: () => typeof FortiGate !== 'undefined' && FortiGate.appcontrol },
            { id: 'dnsfilter',  cat: 'utm', label: 'DNS Filter',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.dnsfilter },
            { id: 'pbr',        cat: 'routing', label: 'Policy Route (PBR)',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.pbr },
            { id: 'ipv6',       cat: 'iface', label: 'IPv6 Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipv6 },
            { id: 'vdom',       cat: 'base', label: 'VDOM',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.vdom },
            { id: 'haaa',       cat: 'ha', label: 'HA Active-Active',        gen: () => typeof FortiGate !== 'undefined' && FortiGate.haaa },
            { id: 'snmpv3',     cat: 'mgmt', label: 'SNMP v3',                 gen: () => typeof FortiGate !== 'undefined' && FortiGate.snmpv3 },
            { id: 'fswport',    cat: 'l2', label: 'FortiSwitch Port Profile', gen: () => typeof FortiGate !== 'undefined' && FortiGate.fswport },
            { id: 'static', cat: 'routing', label: 'Static Route', gen: () => typeof FortiGate !== 'undefined' && FortiGate.static },
            { id: 'service', cat: 'secpol', label: 'Service Object / Group', gen: () => typeof FortiGate !== 'undefined' && FortiGate.service },
            { id: 'addrgrp', cat: 'secpol', label: 'Address Group / Toplu Adres', gen: () => typeof FortiGate !== 'undefined' && FortiGate.addrgrp },
            { id: 'zone', cat: 'secpol', label: 'Zone', gen: () => typeof FortiGate !== 'undefined' && FortiGate.zone },
            { id: 'shaper', cat: 'qos', label: 'Traffic Shaping', gen: () => typeof FortiGate !== 'undefined' && FortiGate.shaper },
            { id: 'logging', cat: 'mgmt', label: 'Log (Syslog / FortiAnalyzer)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.logging },
            { id: 'ntp', cat: 'base', label: 'NTP', gen: () => typeof FortiGate !== 'undefined' && FortiGate.ntp },
            { id: 'dns', cat: 'base', label: 'DNS', gen: () => typeof FortiGate !== 'undefined' && FortiGate.dns },
            { id: 'admin', cat: 'aaa', label: 'Admin & Access Profile', gen: () => typeof FortiGate !== 'undefined' && FortiGate.admin },
            { id: 'user', cat: 'aaa', label: 'Local User & Group', gen: () => typeof FortiGate !== 'undefined' && FortiGate.user },
            { id: 'dos', cat: 'secpol', label: 'DoS Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.dos },
            { id: 'localin', cat: 'secpol', label: 'Local-in Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.localin },
            { id: 'automation', cat: 'mgmt', label: 'Automation Stitch (E-posta Uyarısı)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.automation },
        ]
    },
    'paloalto': {
        label: 'Palo Alto', icon: 'fas fa-fire', color: '#FA582D',
        types: [
            { id: 'zone',    cat: 'secpol', label: 'Zone',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.zone },
            { id: 'address', cat: 'secpol', label: 'Address Object',  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.address },
            { id: 'policy',  cat: 'secpol', label: 'Security Policy', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.policy },
            { id: 'nat',     cat: 'secpol', label: 'NAT',             gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.nat },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec VPN',         gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ipsec },
            { id: 'threatprev', cat: 'utm', label: 'Threat Prevention', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.threatprev },
            { id: 'urlfilter',     cat: 'utm', label: 'URL Filtering',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.urlfilter },
            { id: 'globalprotect', cat: 'vpn', label: 'GlobalProtect VPN',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.globalprotect },
            { id: 'ha',            cat: 'ha', label: 'HA Active-Passive',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ha },
            { id: 'interface',      cat: 'iface', label: 'Interface (L3/VLAN)',      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.interface },
            { id: 'staticroute',    cat: 'routing', label: 'Virtual Router + Route',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.staticroute },
            { id: 'ospf',           cat: 'routing', label: 'OSPF',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ospf },
            { id: 'bgp',            cat: 'routing', label: 'BGP',                      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.bgp },
            { id: 'vlan',           cat: 'l2', label: 'VLAN',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.vlan },
            { id: 'service',        cat: 'secpol', label: 'Service Object',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.service },
            { id: 'customapp',      cat: 'utm', label: 'Custom Application',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.customapp },
            { id: 'secprofilegroup',cat: 'utm', label: 'Security Profile Group',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.secprofilegroup },
            { id: 'decryption',     cat: 'utm', label: 'Decryption Policy',        gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.decryption },
            { id: 'dos',            cat: 'secpol', label: 'DoS Protection Policy',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.dos },
            { id: 'snmp',           cat: 'mgmt', label: 'SNMP v3',                  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.snmp },
            { id: 'panorama',       cat: 'mgmt', label: 'Panorama Device Group',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.panorama },
            { id: 'sdwan',          cat: 'routing', label: 'SD-WAN Path Selection',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.sdwan },
            { id: 'addrgroup', cat: 'secpol', label: 'Address Group', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.addrgroup },
            { id: 'svcgroup', cat: 'secpol', label: 'Service Group', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.svcgroup },
            { id: 'logfwd', cat: 'mgmt', label: 'Log Forwarding + Syslog', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.logfwd },
            { id: 'devsetup', cat: 'base', label: 'Device Setup (DNS/NTP/Banner)', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.devsetup },
            { id: 'authprof', cat: 'aaa', label: 'LDAP/RADIUS + Auth Profile', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.authprof },
            { id: 'admin', cat: 'aaa', label: 'Administrator + Parola Politikası', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.admin },
            { id: 'tunnelmon', cat: 'vpn', label: 'Tunnel Monitor', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.tunnelmon },
            { id: 'zoneprot', cat: 'secpol', label: 'Zone Protection Profile', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.zoneprot },
            { id: 'appoverride', cat: 'secpol', label: 'Application Override', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.appoverride },
        ]
    },
    'checkpoint': {
        label: 'Check Point', icon: 'fas fa-shield-alt', color: '#CC3300',
        types: [
            { id: 'setup',        cat: 'base', label: 'Gaia Initial Setup',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.setup },
            { id: 'interface',    cat: 'iface', label: 'Interface / Bond',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.interface },
            { id: 'route',        cat: 'routing', label: 'Static Route',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.route },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',                     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ospf },
            { id: 'policy',       cat: 'secpol', label: 'Security Rule (mgmt_cli)', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.policy },
            { id: 'nat',          cat: 'secpol', label: 'NAT Rule (mgmt_cli)',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.nat },
            { id: 'bgp',          cat: 'routing', label: 'BGP',                      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.bgp },
            { id: 'vlanintf',     cat: 'iface', label: 'VLAN Interface',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vlanintf },
            { id: 'hostobj',      cat: 'secpol', label: 'Host Object',              gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.hostobj },
            { id: 'netobj',       cat: 'secpol', label: 'Network Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.netobj },
            { id: 'serviceobj',   cat: 'secpol', label: 'Service Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.serviceobj },
            { id: 'clusterxl',    cat: 'ha', label: 'ClusterXL HA',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.clusterxl },
            { id: 'vsx',          cat: 'ha', label: 'VSX Virtual System',       gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vsx },
            { id: 's2svpn',       cat: 'vpn', label: 'Site-to-Site VPN',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.s2svpn },
            { id: 'ravpn',        cat: 'vpn', label: 'Remote Access VPN',        gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ravpn },
            { id: 'httpsinspect', cat: 'utm', label: 'HTTPS Inspection',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.httpsinspect },
            { id: 'logging',      cat: 'mgmt', label: 'Log Exporter (SIEM)',     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.logging },
            { id: 'snmp',         cat: 'mgmt', label: 'SNMP v3',                  gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.snmp },
            { id: 'addrrange', cat: 'secpol', label: 'Address Range', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.addrrange },
            { id: 'netgroup', cat: 'secpol', label: 'Network Group', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.netgroup },
            { id: 'svcgroup', cat: 'secpol', label: 'Service Group', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.svcgroup },
            { id: 'timeobj', cat: 'secpol', label: 'Time Object', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.timeobj },
            { id: 'tpprofile', cat: 'utm', label: 'Threat Prevention (IPS / Anti-Bot / AV)', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.tpprofile },
            { id: 'gaiasys', cat: 'base', label: 'Gaia DNS / NTP / Banner', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiasys },
            { id: 'gaiasyslog', cat: 'mgmt', label: 'Gaia Remote Syslog', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiasyslog },
            { id: 'gaiauser', cat: 'aaa', label: 'Gaia Kullanıcı / Rol', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiauser },
        ]
    },
    'f5-ltm': {
        label: 'F5 BIG-IP LTM', icon: 'fas fa-balance-scale', color: '#E4002B',
        types: [
            { id: 'vserver',     cat: 'adc', label: 'Virtual Server',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.vserver },
            { id: 'pool',        cat: 'adc', label: 'Pool + Members',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.pool },
            { id: 'monitor',     cat: 'adc', label: 'Health Monitor',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.monitor },
            { id: 'ssl',         cat: 'adc', label: 'SSL Client Profile',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.ssl },
            { id: 'irule',       cat: 'adc', label: 'iRule',                gen: () => typeof F5LTM !== 'undefined' && F5LTM.irule },
            { id: 'persistence', cat: 'adc', label: 'Persistence Profile',  gen: () => typeof F5LTM !== 'undefined' && F5LTM.persistence },
            { id: 'ha',          cat: 'ha', label: 'HA (DSC)',             gen: () => typeof F5LTM !== 'undefined' && F5LTM.ha },
            { id: 'asm',         cat: 'adc', label: 'ASM WAF Policy',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.asm },
            { id: 'awaf',        cat: 'adc', label: 'Advanced WAF (AWAF)',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.awaf },
            { id: 'sslserver',   cat: 'adc', label: 'SSL Server Profile',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.sslserver },
            { id: 'snatpool',    cat: 'adc', label: 'SNAT Pool',              gen: () => typeof F5LTM !== 'undefined' && F5LTM.snatpool },
            { id: 'httpprofile', cat: 'adc', label: 'HTTP Profile',           gen: () => typeof F5LTM !== 'undefined' && F5LTM.httpprofile },
            { id: 'tcpprofile',  cat: 'adc', label: 'TCP Profile',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.tcpprofile },
            { id: 'routedomain', cat: 'routing', label: 'Route Domain (VRF)',     gen: () => typeof F5LTM !== 'undefined' && F5LTM.routedomain },
            { id: 'vlanself',    cat: 'iface', label: 'VLAN + Self IP',         gen: () => typeof F5LTM !== 'undefined' && F5LTM.vlanself },
            { id: 'trunk',       cat: 'l2', label: 'Trunk / LAG',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.trunk },
            { id: 'gslb',        cat: 'adc', label: 'DNS / GSLB',             gen: () => typeof F5LTM !== 'undefined' && F5LTM.gslb },
            { id: 'ltmpolicy',   cat: 'adc', label: 'LTM Traffic Policy',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.ltmpolicy },
            { id: 'apm',         cat: 'adc', label: 'APM Access Policy',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.apm },
            { id: 'asmtuning',   cat: 'adc', label: 'ASM Policy Tuning',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.asmtuning },
            { id: 'iapp',        cat: 'adc', label: 'iApp Deployment',        gen: () => typeof F5LTM !== 'undefined' && F5LTM.iapp },
        ]
    },
    'citrix-adc': {
        label: 'Citrix ADC', icon: 'fas fa-network-wired', color: '#007CC3',
        types: [
            { id: 'lbvserver',  cat: 'adc', label: 'LB vServer',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.lbvserver },
            { id: 'monitor',    cat: 'adc', label: 'Health Monitor',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.monitor },
            { id: 'ha',         cat: 'ha', label: 'HA Pair',              gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ha },
            { id: 'cs',         cat: 'adc', label: 'Content Switching',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cs },
            { id: 'responder',  cat: 'adc', label: 'Responder Policy',     gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.responder },
            { id: 'gslb',        cat: 'adc', label: 'GSLB',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.gslb },
            { id: 'sslvserver',  cat: 'adc', label: 'SSL Virtual Server',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslvserver },
            { id: 'rewrite',     cat: 'adc', label: 'Rewrite Policy/Action', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.rewrite },
            { id: 'ratelimit',   cat: 'adc', label: 'Rate Limiting',         gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ratelimit },
            { id: 'aaa',         cat: 'aaa', label: 'AAA-TM',                gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.aaa },
            { id: 'cache',       cat: 'adc', label: 'Cache Policy',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cache },
            { id: 'compression', cat: 'adc', label: 'Compression Policy',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.compression },
            { id: 'waf',         cat: 'adc', label: 'AppFirewall (WAF)',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.waf },
            { id: 'sslcert',     cat: 'adc', label: 'SSL Certificate',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslcert },
            { id: 'snip',        cat: 'iface', label: 'SNIP + IP Config',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.snip },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.vlan },
            { id: 'acl',         cat: 'secpol', label: 'ACL Extended',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.acl },
        ]
    },
    'huawei-usg': {
        label: 'Huawei USG', icon: 'fas fa-fire-alt', color: '#CF0A2C',
        types: [
            { id: 'zone',       cat: 'secpol', label: 'Security Zone',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.zone },
            { id: 'policy',     cat: 'secpol', label: 'Security Policy',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.policy },
            { id: 'nat',        cat: 'secpol', label: 'NAT',                   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.nat },
            { id: 'interface',  cat: 'iface', label: 'Interface + Zone',      gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.interface },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec VPN IKEv2',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ipsec },
            { id: 'sslvpn',     cat: 'vpn', label: 'SSL VPN',               gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.sslvpn },
            { id: 'antivirus',  cat: 'utm', label: 'Anti-Virus Profile',    gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.antivirus },
            { id: 'ips',        cat: 'utm', label: 'IPS Profile',           gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ips },
            { id: 'urlfilter',  cat: 'utm', label: 'URL Filtering',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.urlfilter },
            { id: 'appcontrol', cat: 'utm', label: 'Application Control',   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.appcontrol },
            { id: 'ha',         cat: 'ha', label: 'HA Dual-System',        gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ha },
            { id: 'dnsproxy',   cat: 'base', label: 'DNS Transparent Proxy', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.dnsproxy },
            { id: 'objects', cat: 'secpol', label: 'Adres / Servis Nesnesi', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.objects },
            { id: 'staticroute', cat: 'routing', label: 'Statik Rota', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.staticroute },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ospf },
            { id: 'vrrp', cat: 'ha', label: 'VRRP + HRP', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.vrrp },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.syslog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ntp },
            { id: 'admin', cat: 'aaa', label: 'Yönetici / SSH', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.admin },
        ]
    },
    'huawei-ce': {
        label: 'Huawei CloudEngine', icon: 'fas fa-cloud', color: '#A50034',
        types: [
            { id: 'vlan',        cat: 'l2', label: 'VLAN + Interface',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vlan },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                 gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bgp },
            { id: 'vxlan',       cat: 'overlay', label: 'VXLAN / EVPN',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vxlan },
            { id: 'lacp',        cat: 'l2', label: 'LACP / Eth-Trunk',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.lacp },
            { id: 'mlag',        cat: 'ha', label: 'M-LAG',                gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.mlag },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bfd },
            { id: 'qos',         cat: 'qos', label: 'QoS MQC / DiffServ',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.qos },
            { id: 'snmpntp',     cat: 'mgmt', label: 'SNMP + NTP',           gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.snmpntp },
            { id: 'evpnsymirb',  cat: 'overlay', label: 'EVPN Symmetric IRB',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.evpnsymirb },
            { id: 'routepolicy', cat: 'routing', label: 'Route Policy',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.routepolicy },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.staticroute },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.syslog },
            { id: 'lldp', cat: 'mgmt', label: 'LLDP', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.lldp },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vrrp },
            { id: 'localuser', cat: 'aaa', label: 'Local User + SSH', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.localuser },
            { id: 'acl', cat: 'secpol', label: 'ACL', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.acl },
            { id: 'stp', cat: 'l2', label: 'STP / Edge Port', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.stp },
            { id: 'interface', cat: 'iface', label: 'Interface (L2/L3)', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.interface },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.mirror },
        ]
    },
    'referans': {
        label: 'Referans & Topoloji', icon: 'fas fa-book-open', color: '#6366F1',
        types: [
            { id: 'bgp',      cat: 'ref', label: 'BGP Topoloji',              gen: () => typeof CgReference !== 'undefined' && CgReference.bgp },
            { id: 'ospf',     cat: 'ref', label: 'OSPF Alan Mimarisi',        gen: () => typeof CgReference !== 'undefined' && CgReference.ospf },
            { id: 'mpls_vpn', cat: 'ref', label: 'MPLS L3VPN Mimarisi',       gen: () => typeof CgReference !== 'undefined' && CgReference.mpls_vpn },
            { id: 'ha',       cat: 'ref', label: 'Yüksek Erişilebilirlik',    gen: () => typeof CgReference !== 'undefined' && CgReference.ha },
            { id: 'nat',      cat: 'ref', label: 'NAT Tipleri',                gen: () => typeof CgReference !== 'undefined' && CgReference.nat },
            { id: 'ipsec',    cat: 'ref', label: 'IPsec VPN Modları',          gen: () => typeof CgReference !== 'undefined' && CgReference.ipsec },
            { id: 'vxlan',    cat: 'ref', label: 'VXLAN / EVPN',               gen: () => typeof CgReference !== 'undefined' && CgReference.vxlan },
            { id: 'lb',       cat: 'ref', label: 'Load Balancer Mimarisi',     gen: () => typeof CgReference !== 'undefined' && CgReference.lb },
            { id: 'certmap',  cat: 'ref', label: 'Sertifikasyon Haritası',     gen: () => typeof CgReference !== 'undefined' && CgReference.certmap },
        ]
    },
};

// ─── Type icon map ────────────────────────────────────────────────────────────
const CG_TYPE_ICONS = {
    vlan:            'fas fa-layer-group',
    acl:             'fas fa-filter',
    nat:             'fas fa-exchange-alt',
    'static-route':  'fas fa-route',
    ospf:            'fas fa-project-diagram',
    bgp:             'fas fa-sitemap',
    ipsec:           'fas fa-lock',
    dhcp:            'fas fa-broadcast-tower',
    snmp:            'fas fa-chart-line',
    aaa:             'fas fa-user-shield',
    tacacs:          'fas fa-user-lock',
    ssh:             'fas fa-terminal',
    password:        'fas fa-key',
    'vrrp-hsrp':     'fas fa-sync-alt',
    stp:             'fas fa-tree',
    'port-security': 'fas fa-shield-alt',
    qos:             'fas fa-tachometer-alt',
    gre:             'fas fa-arrows-alt-h',
    tracking:        'fas fa-heartbeat',
    'rate-limit':    'fas fa-stopwatch',
    advanced:        'fas fa-cogs',
    mpls:            'fas fa-tags',
    vpc:             'fas fa-clone',
    vxlan:           'fas fa-network-wired',
    span:            'fas fa-eye',
    logging:         'fas fa-file-alt',
    ntp:             'fas fa-clock',
    lldp:            'fas fa-project-diagram',
    hardening:       'fas fa-user-shield',
    vtp:             'fas fa-share-alt',
    archive:         'fas fa-archive',
    basic:           'fas fa-sliders-h',
    security:        'fas fa-shield-alt',
    general:         'fas fa-tools',
    interface:       'fas fa-ethernet',
    route:           'fas fa-route',
    address:         'fas fa-address-card',
    policy:          'fas fa-clipboard-check',
    sslvpn:          'fas fa-user-lock',
    zone:            'fas fa-map-marked-alt',
    etherchannel:    'fas fa-link',
    dmvpn:           'fas fa-cloud-download-alt',
    eigrpnamed:      'fas fa-fast-forward',
    vrflite:         'fas fa-layer-group',
    l3vpn:           'fas fa-tags',
    routemap:        'fas fa-map-signs',
    portchannel:     'fas fa-plug',
    vlt:             'fas fa-clone',
    lacp:            'fas fa-link',
    mpls_vpn:        'fas fa-tags',
    ha:              'fas fa-heartbeat',
    lb:              'fas fa-balance-scale',
    certmap:         'fas fa-certificate',
    appfw:           'fas fa-shield-alt',
    vpn:             'fas fa-lock',
    setup:           'fas fa-cog',
    accessControl:    'fas fa-clipboard-check',
    intrusionPolicy:  'fas fa-bug',
    sslPolicy:        'fas fa-lock',
    siteToSiteVpn:    'fas fa-lock',
    raVpn:            'fas fa-user-lock',
    evpn:             'fas fa-network-wired',
    fabricPath:       'fas fa-project-diagram',
    syslog:           'fas fa-scroll',
    bgpEvpn:          'fas fa-sitemap',
    qosPolicy:        'fas fa-tachometer-alt',
    stormControl:     'fas fa-cloud-rain',
    mclag:            'fas fa-clone',
    routeMap:         'fas fa-map-signs',
    mpfServicePolicy: 'fas fa-cogs',
    failoverHA:       'fas fa-heartbeat',
    aaaRadius:        'fas fa-user-shield',
};

// ─── ConfigGenerator Controller ──────────────────────────────────────────────

const ConfigGenerator = {
    _vendor: null,
    _type:   null,
    _query:  '',
    _filter: 'all',

    // ── Başlatma + hash yönlendirme ──────────────────────────────────────
    init() {
        const root = document.getElementById('config-generator-root');
        if (!root) return;
        this._root = root;
        window.addEventListener('hashchange', () => this._route());
        this._route();
    },

    _route() {
        const m = (location.hash || '').match(/^#\/([^/]+)\/([^/]+)$/);
        if (m && CG_REGISTRY[m[1]]) this._renderWork(m[1], m[2]);
        else if ((location.hash || '') === '#/converter') this._renderConverter();
        else this._renderHome();
    },

    go(vendorId, typeId) { location.hash = '#/' + vendorId + '/' + typeId; },
    goHome()             { location.hash = ''; if (!location.hash) this._route(); },

    // ── Üst çubuktaki aktif sekmeyi işaretle ────────────────────────────
    _setNav(which) {
        document.querySelectorAll('.app-nav-tab').forEach(b =>
            b.classList.toggle('active', b.dataset.nav === which));
    },

    // ── ANA SAYFA: aranabilir araç ızgarası ──────────────────────────────
    _renderHome() {
        this._vendor = this._type = null;
        const chips = ['all', ...Object.keys(CG_REGISTRY)].map(id => {
            const v = CG_REGISTRY[id];
            const lbl = id === 'all' ? 'Tümü' : v.label;
            const n   = id === 'all' ? this._totalTools() : v.types.length;
            const mark = id === 'all'
                ? '<span class="cg-mark cg-mark-txt" style="--bc:#6B7280"><i class="fas fa-layer-group"></i></span>'
                : cgBrandMark(id, 14);
            return `<button class="cg-chip${this._filter === id ? ' active' : ''}" data-f="${id}"
                        onclick="ConfigGenerator._setFilter('${id}')" title="${cgEsc(lbl)}">
                        ${mark}<span class="cg-chip-l">${cgEsc(lbl)}</span><span class="cg-chip-n">${n}</span>
                    </button>`;
        }).join('');

        this._setNav('tools');
        this._root.innerHTML = `
        <div class="cg-home">

            <div class="cg-home-search">
                <i class="fas fa-search"></i>
                <input type="text" id="cg-home-q" placeholder="Araç ara: vlan, ipsec, bgp, nat, interface…"
                       autocomplete="off" value="${cgEsc(this._query)}"
                       oninput="ConfigGenerator._setQuery(this.value)">
                <kbd>/</kbd>
            </div>
            <div class="cg-meta">
                <strong>${this._totalTools()}</strong> şablon ·
                <strong>${Object.keys(CG_REGISTRY).length}</strong> platform ·
                tamamı tarayıcıda çalışır
            </div>
            <div class="cg-chips" id="cg-chips">${chips}</div>
            <div class="cg-chips cg-cat-chips" id="cg-cat-chips">${this._catChips()}</div>
            <div id="cg-home-grid"></div>
        </div>`;

        this._renderGrid();
        const q = document.getElementById('cg-home-q');
        if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        this._bindSlash();
    },

    // Secili vendor filtresine gore kategori cipleri (arac sayisiyla); bos kategori cikmaz.
    _catChips() {
        const cnt = {};
        for (const [vid, v] of Object.entries(CG_REGISTRY)) {
            if (this._filter !== 'all' && this._filter !== vid) continue;
            v.types.forEach(t => { cnt[t.cat] = (cnt[t.cat] || 0) + 1; });
        }
        const cur = this._cat || 'all';
        const total = Object.values(cnt).reduce((a, b) => a + b, 0);
        return [`<button class="cg-chip cg-cat-chip${cur === 'all' ? ' active' : ''}" onclick="ConfigGenerator._setCat('all')">
                    <i class="fas fa-th"></i><span class="cg-chip-l">Tüm kategoriler</span><span class="cg-chip-n">${total}</span></button>`]
            .concat(CG_CATEGORIES.filter(c => cnt[c.id]).map(c =>
                `<button class="cg-chip cg-cat-chip${cur === c.id ? ' active' : ''}" onclick="ConfigGenerator._setCat('${c.id}')">
                    <i class="${c.icon}"></i><span class="cg-chip-l">${cgEsc(c.label)}</span><span class="cg-chip-n">${cnt[c.id]}</span></button>`))
            .join('');
    },

    _setCat(id) {
        this._cat = id;
        const host = document.getElementById('cg-cat-chips');
        if (host) host.innerHTML = this._catChips();
        this._renderGrid();
    },

    _totalTools() {
        return Object.values(CG_REGISTRY).reduce((a, v) => a + v.types.length, 0);
    },

    _setFilter(id) {
        this._filter = id;
        document.querySelectorAll('#cg-chips .cg-chip').forEach(c => c.classList.toggle('active', c.dataset.f === id));
        // Vendor degisince o vendor'da olmayan kategori secili kalmasin
        const has = Object.entries(CG_REGISTRY).some(([vid, v]) => (id === 'all' || id === vid) && v.types.some(t => t.cat === this._cat));
        if (this._cat && this._cat !== 'all' && !has) this._cat = 'all';
        const host = document.getElementById('cg-cat-chips');
        if (host) host.innerHTML = this._catChips();
        this._renderGrid();
    },

    _setQuery(q) { this._query = q; this._renderGrid(); },

    _bindSlash() {
        if (this._slashBound) return;
        this._slashBound = true;
        document.addEventListener('keydown', e => {
            if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
                const el = document.getElementById('cg-home-q');
                if (el) { e.preventDefault(); el.focus(); el.select(); }
            }
            if (e.key === 'Escape' && location.hash) this.goHome();
        });
    },

    _renderGrid() {
        const host = document.getElementById('cg-home-grid');
        if (!host) return;
        const term = (this._query || '').trim().toLowerCase();
        let html = '', hits = 0;

        for (const [vid, v] of Object.entries(CG_REGISTRY)) {
            if (this._filter !== 'all' && this._filter !== vid) continue;
            const cat = this._cat && this._cat !== 'all' ? this._cat : null;
            const types = v.types.filter(t => {
                if (cat && t.cat !== cat) return false;
                if (!term) return true;
                const cl = (CG_CAT_BY_ID[t.cat] || {}).label || '';
                return (t.label + ' ' + t.id + ' ' + v.label + ' ' + cl).toLowerCase().includes(term);
            });
            if (!types.length) continue;
            hits += types.length;

            html += `<section class="cg-vgroup">
                <header class="cg-vgroup-hd">
                    ${cgBrandMark(vid, 17)}
                    <h3 lang="en">${cgEsc(v.label)}</h3>
                    <span class="cg-vgroup-n">${types.length}</span>
                </header>
                <div class="cg-vgroup-body">` +
                // Vendor icinde sabit kategori sirasi; her kategori kendi alt basligiyla
                CG_CATEGORIES.filter(c => types.some(t => t.cat === c.id)).map(c =>
                `<div class="cg-catgroup"><div class="cg-catgroup-hd"><i class="${c.icon}"></i>${cgEsc(c.label)}</div><div class="cg-cards">` +
                types.filter(t => t.cat === c.id).map(t => {
                    const g = t.gen();
                    const stub = !g || typeof g.init !== 'function';
                    const icon = CG_TYPE_ICONS[t.id] || 'fas fa-code';
                    return `<button class="cg-card${stub ? ' is-stub' : ''}"
                        ${stub ? 'disabled title="Yakında eklenecek"' : `onclick="ConfigGenerator.go('${vid}','${t.id}')"`}>
                        <i class="${icon}"></i>
                        <span class="cg-card-t">${cgEsc(t.label)}</span>
                        ${stub ? '<span class="cg-card-soon">yakında</span>' : ''}
                    </button>`;
                }).join('') + `</div></div>`).join('') +
                `</div></section>`;
        }

        host.innerHTML = hits ? html : `
            <div class="cg-empty">
                <i class="fas fa-search"></i>
                <p><strong>“${cgEsc(this._query)}”</strong> için sonuç yok.</p>
                <button class="cg-btn-ghost" onclick="ConfigGenerator._setQuery('');document.getElementById('cg-home-q').value=''">
                    Aramayı temizle
                </button>
            </div>`;
    },

    // ── ÇALIŞMA SAYFASI: tam genişlik, 2 kolon ───────────────────────────
    _renderWork(vendorId, typeId) {
        const vendor  = CG_REGISTRY[vendorId];
        const typeObj = vendor?.types.find(t => t.id === typeId);
        const gen     = typeObj?.gen();
        this._vendor = vendorId; this._type = typeId;

        if (!gen || typeof gen.init !== 'function') {
            this._setNav('tools');
        this._root.innerHTML = `
                <div class="cg-work"><div class="cg-empty">
                    <i class="fas fa-clock"></i>
                    <p>Bu generator henüz tamamlanmadı.</p>
                    <button class="cg-btn-ghost" onclick="ConfigGenerator.goHome()">← Tüm araçlar</button>
                </div></div>`;
            return;
        }

        // Aynı vendor'ın diğer araçları — hızlı geçiş için
        const siblings = vendor.types.filter(t => { const g = t.gen(); return g && typeof g.init === 'function'; });

        cgTermPrompt = typeObj.label || vendor.label;
        this._setNav('tools');
        this._root.innerHTML = `
        <div class="cg-work">
            <div class="cg-work-hd">
                <button class="cg-back" onclick="ConfigGenerator.goHome()">
                    <i class="fas fa-arrow-left"></i> Tüm araçlar
                </button>
                <div class="cg-crumb">
                    ${cgBrandMark(vendorId, 16)}
                    <span>${cgEsc(vendor.label)}</span>
                    <i class="fas fa-chevron-right cg-crumb-sep"></i>
                    <strong>${cgEsc(typeObj.label)}</strong>
                </div>
                <div class="cg-work-jump">
                    <select onchange="if(this.value)ConfigGenerator.go('${vendorId}',this.value)" aria-label="Diğer araçlar">
                        ${siblings.map(t => `<option value="${t.id}"${t.id === typeId ? ' selected' : ''}>${cgEsc(t.label)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="cg-split">
                <div class="cg-split-form" id="cg-form-area"></div>
                <div class="cg-split-out">
                    <div class="cg-term">
                        <div class="cg-term-hd">
                            <div class="cg-term-dots"><i></i><i></i><i></i></div>
                            <div class="cg-term-title">
                                <span class="cg-live-dot" id="cg-live-dot"></span>${cgEsc(typeObj.label)}
                            </div>
                            <div class="cg-term-acts">
                                <button type="button" class="cg-term-btn" id="cg-term-copy" onclick="cgCopy()" disabled>
                                    <i class="fas fa-copy"></i> Kopyala
                                </button>
                                <button type="button" class="cg-term-btn" id="cg-term-dl" onclick="cgDownload()" disabled>
                                    <i class="fas fa-download"></i> .txt
                                </button>
                            </div>
                        </div>
                        <pre class="cg-term-body" id="cg-term-body"></pre>
                        <div class="cg-term-warn" id="cg-term-warn" style="display:none"></div>
                    </div>
                </div>
            </div>
        </div>`;

        const formArea = document.getElementById('cg-form-area');
        cgShowOutput('', []);
        gen.init(formArea);
        cgPostRender(formArea);
        cgBindLegacyLive(formArea);

        // Formsuz (referans/doküman) sayfalarda terminali gizle, tam genişlik ver
        if (!formArea.querySelector('form')) {
            this._root.querySelector('.cg-split')?.classList.add('is-single');
        }
        this._bindSlash();
    },

    // ── DÖNÜŞTÜRÜCÜ ──────────────────────────────────────────────────────
    _renderConverter() {
        this._setNav('conv');
        this._root.innerHTML = `<div class="cg-work"><div id="cg-conv-host"></div></div>`;
        const host = document.getElementById('cg-conv-host');
        if (typeof ConfigConverter !== 'undefined') ConfigConverter.render(host);
        else host.innerHTML = '<div class="cg-empty"><i class="fas fa-exchange-alt"></i><p>Dönüştürücü yüklenemedi.</p></div>';
        this._bindSlash();
    },

    // ── Geriye dönük uyumluluk (eski çağrılar için) ──────────────────────
    _selectVendor(vendorId) { this._vendor = vendorId; },
    _loadGenerator(vendorId, typeId) { this._renderWork(vendorId, typeId); },
};
