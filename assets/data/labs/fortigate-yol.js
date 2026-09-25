'use strict';
// ─── CLI Lab: FortiGate öğrenme yolu lab'ları (FortiOS 7.4 görünümü) ─────────
// fortigate.js'teki temel ve teşhis lab'larını tamamlar: sistem servisleri, kural sırası, IP havuzu,
// kimlik doğrulama, güvenlik profilleri, VLAN/zone, log, yönetim sertleştirme, yedekleme.
(function () {
    const LABS = [];
    const LABS_BY_ID = {};
    LABS.forEach(l => { LABS_BY_ID[l.id] = l; });
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !LABS_BY_ID[l.id]).concat(LABS);
})();
