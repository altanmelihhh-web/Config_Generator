'use strict';
// ─── Sorun giderme sihirbazı: ek senaryolar (paloalto) ─────────────────────────
// Kaynak: CLI Lab arıza bulguları. Hub derlemesinden (clibuild.js) bağımsızdır.
// Şema: { title, severity: 'err'|'warn'|'info', symptom, topic?, replaces?, lab?,
//         steps: [{ code, desc, fix?: string | [{ cause, cmd? }] }] }
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_TS_EXTRA = root.CG_TS_EXTRA || {};
    root.CG_TS_EXTRA['paloalto'] = [];
})();
