'use strict';
// ─── CLI Lab: FortiGate 7.6 (FortiOS 7.6 görünümü) — f76- lab'ları ─────────
// 7.4 lab'larının sürümden bağımsız olanları 7.6 motoruyla (lab.fos = '7.6') klonlanır; 7.4 içerikleri değişmez.
// Hariç: SSL-VPN tünel modu lab'ları — 7.6.3'te tünel modu kaldırıldı (FortiOS 7.6.3 Release Notes,
// "SSL VPN tunnel mode replaced with IPsec VPN"); yerlerine 7.6'ya özgü IPsec dial-up lab'ları yazılacak.
// Seviye: klonun level alanı, kaynak lab'ın GÖRÜNEN seviyesidir (CgLab.VENDORS.fortigate.levelOf, yoksa lab.level)
// ve doğrudan yazılır (fortigate-76 vendor'unda levelOf yoktur).
// Yükleme sırası: fortigate.js ve fortigate-yol.js'ten SONRA. Önce yüklenirse hiçbir şey yapmaz;
// CgLabF76.build() sonradan çağrılabilir (test kapısı böyle kullanır).
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const EXCLUDE = {
        'fgt-12': 'SSL-VPN tünel modu kurulumu: 7.6.3+ tünel modu yok',
        'fgt-24': 'SSL-VPN tünel kullanıcısı bağlanamıyor: 7.6.3+ tünel modu yok',
    };
    const idOf = id => 'f76-' + String(id).replace(/^fgt-/, '');
    function viewLevel(l) {
        // CgLab tarayıcıda üst düzey const'tur (window özelliği değildir); ikisine de bak
        const CL = typeof CgLab !== 'undefined' ? CgLab : root.CgLab;
        const v = CL && CL.VENDORS && CL.VENDORS.fortigate, m = v && v.levelOf;
        return m && l.id in m ? m[l.id] : l.level;
    }
    function build() {
        const base = (root.CG_LABS || []).filter(l => l.vendor === 'fortigate' && !EXCLUDE[l.id]);
        if (!base.length) return [];
        const ids = new Set(base.map(l => l.id));
        // Elle yazılmış 7.6 lab'ları (vendor fortigate-76, from alanı yok) korunur; aynı kimlikte klon üretilmez
        const hand = new Set((root.CG_LABS || []).filter(l => l.vendor === 'fortigate-76' && !l.from).map(l => l.id));
        const clones = base.filter(src => !hand.has(idOf(src.id))).map(src => {
            const id = idOf(src.id);
            const c = Object.assign({}, src, {
                id, vendor: 'fortigate-76', fos: '7.6', from: src.id,
                level: viewLevel(src),
                pre: (src.pre || []).filter(p => ids.has(p)).map(idOf),
            });
            // Çoktan seçmeli görevlerin cevap anahtarı lab kimliğini içerir ('<lab>:<görev>') → klon anahtarıyla yeniden bağla
            if (src.tasks) c.tasks = src.tasks.map((t, i) => {
                if (!t.ask) return t;
                const want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
                return Object.assign({}, t, { check: s => !!s.answers && s.answers[id + ':' + i] === want(s.variant && s.variant()) });
            });
            return c;
        });
        root.CG_LABS = (root.CG_LABS || []).filter(l => !(l.vendor === 'fortigate-76' && l.from)).concat(clones);
        return clones;
    }
    root.CgLabF76 = { build, EXCLUDE, idOf };
    build();
})();
