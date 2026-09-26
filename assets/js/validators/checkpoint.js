'use strict';
// Check Point doğrulayıcıları (Gaia/SmartConsole araçları). Maske alanları Cisco 'subnet'ini değil
// common 'netmask'/'ip' tanımını kullanır.
(function () {
const V = {
    prefix:   { fn: v => _cgInt(v, 0, 128), msg: 'Prefix 0-128 arasında olmalı' },
};

const W = {
    prefix:      t => _cgNumWhy(t, 0, 128),
};

const R = {
    prefix:      '0–128 arası tam sayı (IPv4 için 0–32).',
};

cgDefineValidators('checkpoint', V, R, W);
})();
