'use strict';
// ─── CLI Lab: Palo Alto öğrenme yolu lab'ları (PAN-OS 11.1 görünümü) ─────────
(function () {
    const LABS = [];
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
