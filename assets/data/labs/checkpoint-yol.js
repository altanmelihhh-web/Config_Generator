'use strict';
// ─── CLI Lab: Check Point öğrenme yolu lab'ları (Gaia R81.20 görünümü) ────────
// checkpoint.js'teki temel ve teşhis lab'larını tamamlar. Adresler yalnız güvenli örnek bloklardan.
(function () {
    const LABS = [];
    LABS.forEach(l => {
        l.solution = v => [].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps));
    });
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
