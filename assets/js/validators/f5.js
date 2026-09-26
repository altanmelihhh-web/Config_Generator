'use strict';
// F5 BIG-IP doğrulayıcıları. port_match Cisco'daki ile bugün aynı davranır ama F5'in kendi
// kopyasıdır: Cisco tarafındaki bir anlam değişikliği F5 formlarını etkilemez.
(function () {
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

const V = {
    port_match:{ fn: v => { const t = String(v).trim().toLowerCase();
                       if (!t || t === 'any') return true;
                       let m = t.match(/^(eq|neq|gt|lt)\s+(\S+)$/);
                       if (m) return _cgInt(m[2], 0, 65535) || /^[a-z][a-z0-9-]*$/.test(m[2]);
                       m = t.match(/^range\s+(\S+)\s+(\S+)$/);
                       if (m) return _cgInt(m[1], 0, 65535) && _cgInt(m[2], 0, 65535) && +m[1] <= +m[2];
                       if (/^(eq|neq|gt|lt|range)$/.test(t)) return false;
                       return _cgInt(t, 0, 65535) || /^[a-z][a-z0-9-]*$/.test(t); },
                msg: 'Port ifadesi girin: 80 · eq 80 · range 80 443 · gt 1024 · any' },

    // 'IP:port' (F5 virtual server hedefi)
    host_port:{ fn: v => { const m = String(v).trim().match(/^(.+):(\d+)$/);
                       if (!m) return false;
                       const ipRe = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
                       const hostOk = /^[\d.]+$/.test(m[1]) ? ipRe.test(m[1]) : /^[a-z0-9][a-z0-9.-]*$/i.test(m[1]);
                       return hostOk && _cgInt(m[2], 0, 65535); },
                msg: 'IP:port veya host:port girin (örn: 10.1.1.100:443)' },

    // F5 BIG-IP arayuzleri ciplak sayisaldir: '1.1', '1.2', '2.1'
    // Ayri tutulur; genel iface'e konursa diger vendor'larda '1.2' arayuz sanilir.
    iface_f5: { fn: v => /^\d+(\.\d+)+$/.test(String(v).trim()) || _cgIface(String(v).trim()),
                msg: 'F5 arayüzü girin (örn: 1.1, 1.2) veya trunk/VLAN adı' },
};

const W = {
    port_match:  _cgPortMatchWhy,
    host_port:   _cgHostPortWhy,
    iface_f5:    t => (/^\d+(\.\d+)*$/.test(t) ? 'F5 arayüzü iki bölümlü olmalı (örn: 1.1)' : _cgIfaceWhy(t)),
};

const R = {
    port_match:  'Port (80), operatör + port (eq 443, gt 1024), iki portlu aralık (range 80 443 — küçükten büyüğe) veya any. Port 0–65535.',
    host_port:   'Adres veya host adı, iki nokta, port: 10.1.1.100:443. Port 0–65535.',
    iface_f5:    'F5 arayüzü: yuva.port (1.1, 2.3) veya trunk/VLAN adı.',
};

cgDefineValidators('f5', V, R, W);
})();
