'use strict';
// Huawei (VRP, CE, USG) doğrulayıcıları. wildcard Cisco'daki ile bugün aynı davranır ama
// Huawei'nin kendi kopyasıdır (ACL rule ... source <ip> <wildcard>).
(function () {
const V = {
    // Wildcard (ters) maske: 0.0.0.255 = /24. Huawei VRP ve Cisco ACL'lerinde kullanilir.
    wildcard: { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Wildcard maske girin (örn: 0.0.0.255 = /24)' },
};

const W = {
    wildcard:    _cgIpWhy,
};

const R = {
    wildcard:    'Ters maske: /24 için 0.0.0.255, /30 için 0.0.0.3. Subnet maskesi (255.255.255.0) yazılmaz.',
};

cgDefineValidators('huawei', V, R, W);
})();
