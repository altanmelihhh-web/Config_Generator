'use strict';
// ─── Tanıtım sayfası (landing, '' / '#/') — UI A7, Tema 1 "Kılavuz" ───
// Bölümler: hero + canlı sayılar + nasıl çalışır + vendorlar + öne çıkanlar + öğrenme yolları tablosu + Hakkında (yer tutucu)
// + kapanış CTA bandı + iletişim + çok sütunlu altbilgi (S11b). Birincil CTA: Cisco yolunun ilk labı (yol tanımından, tembel).
// Sayılar render anında hesaplanır; sabit sayı yazılmaz. Ağırlık: yalnız küçük dosyalar tembel yüklenir
// (komut dizini ve yol tanımları, CgCli._load ile). Lab verisi (CgLab._loadAll) bilerek ÇAĞRILMAZ:
// lab sayısı yalnız CG_LABS zaten bellekteyse gösterilir. Vendor kartları CgHub'dan (değiştirilmeden) yeniden kullanılır.
const CgLanding = {
    REPO: 'https://github.com/altanmelihhh-web/Config_Generator',
    ICON: {
        lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        git: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10a6 6 0 0 1-6 6H8"/>',
    },

    // ── Yardımcılar ─────────────────────────────────────────────────────
    _esc(s) { return typeof cgEsc === 'function' ? cgEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    _n(n) { return Number(n).toLocaleString('tr-TR'); },
    _hub() { return typeof CgHub !== 'undefined' ? CgHub : null; },
    _ico(k) {
        const h = this._hub();
        const body = this.ICON[k] || (h && h.ICON[k]) || '';
        return '<svg class="cg-land-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + body + '</svg>';
    },
    _fams() { return typeof CG_FAMILIES !== 'undefined' ? CG_FAMILIES : []; },
    _famName(labVendor) { const f = typeof cgFamilyOf === 'function' ? cgFamilyOf(labVendor) : null; return f ? f.name : labVendor; },
    _stamp(root) { const t = String(Date.now()) + Math.random().toString(36).slice(2, 6); root.dataset.cgLand = t; return t; },
    _alive(root, t) { return root.isConnected && root.dataset.cgLand === t; },
    _load(src) { return typeof CgCli !== 'undefined' ? CgCli._load(src) : Promise.reject(new Error('CgCli yok')); },

    // Canlı sayılar. null = veri bellekte değil (gösterilmez)
    _stats() {
        const R = typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY : {};
        const fams = this._fams();
        // "config aracı": Referans/Topoloji sayfaları araç değil, sayılmaz
        const tools = Object.keys(R).filter(k => k !== 'referans').reduce((a, k) => a + ((R[k] && R[k].types && R[k].types.length) || 0), 0);
        const idx = window.CG_CLI_INDEX || null;
        const labs = window.CG_LABS ? window.CG_LABS.filter(l => !l.sandbox).length : window.CG_LAB_INDEX ? window.CG_LAB_INDEX.total : null;
        const ts = typeof CgTroubleshoot !== 'undefined' && CgTroubleshoot._list ? CgTroubleshoot._list.length : window.CG_TS_INDEX ? window.CG_TS_INDEX.total : null;
        const paths = this._paths();
        return {
            fams: fams.length,
            tools,
            labs,
            cmds: idx ? idx.reduce((a, v) => a + (v.count || 0), 0) : null,
            scen: ts,
            paths: paths ? paths.length : null,
        };
    },
    // Yollar: CG_LABS yüklüyse CgLab._paths() (yazılmamış lab kimlikleri ayıklanmış, lab sayısı kesin);
    // değilse yol tanımından: lab listesi boş olmayan modüller, lab sayısı bilinmez (null).
    _paths() {
        const ix = window.CG_LAB_INDEX;
        if (ix && !window.CG_LABS) return ix.paths.map(p => ({ id: p.id, vendor: p.vendor, title: p.title, mods: p.modules.length, labs: p.modules.reduce((a, m) => a + m.n, 0) }));
        if (!window.CG_LAB_PATHS) return null;
        if (window.CG_LABS && typeof CgLab !== 'undefined' && typeof CgLab._paths === 'function') {
            return CgLab._paths().map(p => ({ id: p.id, vendor: p.vendor, title: p.title, mods: p.modules.length, labs: p.modules.reduce((a, m) => a + m.labs.length, 0) }));
        }
        return window.CG_LAB_PATHS.map(p => {
            const mods = (p.modules || []).filter(m => m && Array.isArray(m.labs) && m.labs.length);
            return { id: p.id, vendor: p.vendor, title: p.title, mods: mods.length, labs: null };
        }).filter(p => p.mods);
    },

    // ── Çizim ───────────────────────────────────────────────────────────
    render(root) {
        document.title = 'Config Generator · Ağ mühendisleri için config, lab ve teşhis';
        const h = this._hub(), fams = this._fams();
        const E = v => this._esc(v);
        root.innerHTML = `<div class="cg-land">
            <section class="cg-land-hero" aria-labelledby="cg-land-h1">
                <div class="cg-land-hero-t">
                    <span class="cg-land-pill">${this._ico('lock')} Tamamı tarayıcıda çalışır</span>
                    <h1 class="cg-land-h1" id="cg-land-h1">Ağ mühendisleri için tek yerde config, lab ve teşhis.</h1>
                    <p class="cg-land-lead" data-land-lead>${E(this._lead(this._stats()))}</p>
                    <div class="cg-land-cta">
                        <a class="cg-land-btn cg-land-btn-pri" href="${this.FIRST_FALLBACK}" data-land-first>İlk labı başlat ${this._ico('arrow')}</a>
                        <a class="cg-land-btn" href="#/v">Vendor seç</a>
                    </div>
                    <a class="cg-land-more cg-land-sub" href="#cg-land-yollar" data-land-jump="cg-land-yollar">Tüm öğrenme yolları ${this._ico('arrow')}</a>
                </div>
                <pre class="cg-land-term" role="img" aria-label="Örnek lab terminali: VLAN oluşturup porta atama ve görev doğrulaması"><span class="c"># Lab: VLAN ve access port</span>
<span class="p">SW1(config)#</span> vlan 10
<span class="p">SW1(config-vlan)#</span> name KULLANICI
<span class="p">SW1(config-vlan)#</span> interface gi0/1
<span class="p">SW1(config-if)#</span> switchport mode access
<span class="p">SW1(config-if)#</span> switchport access vlan 10
<span class="g">✓ Görev: Gi0/1 VLAN 10'da (cihaz durumu doğrulandı)</span></pre>
            </section>

            <section class="cg-land-stats-w" aria-label="Sitedeki içerik sayıları">
                <dl class="cg-land-stats" data-land-stats>${this._statsHtml(this._stats())}</dl>
            </section>

            <section class="cg-land-sec" aria-labelledby="cg-land-how">
                <h2 class="cg-land-h2" id="cg-land-how">Nasıl çalışır</h2>
                <ol class="cg-land-how" role="list">
                    <li><span class="cg-land-hn" aria-hidden="true">1</span><h3 class="cg-land-h3">Görevi oku</h3>
                        <p class="cg-land-p">Her lab kısa bir senaryo ve açık görevlerle başlar.</p>
                        <pre class="cg-land-term cg-land-mini" aria-hidden="true"><span class="c"># Görev: Gi0/1'i VLAN 10'a al</span></pre></li>
                    <li><span class="cg-land-hn" aria-hidden="true">2</span><h3 class="cg-land-h3">Terminale yaz</h3>
                        <p class="cg-land-p">Komutları tarayıcıdaki terminale yazın; <code>?</code> ve kısaltmalar çalışır.</p>
                        <pre class="cg-land-term cg-land-mini" aria-hidden="true"><span class="p">SW1(config-if)#</span> sw acc vlan 10</pre></li>
                    <li><span class="cg-land-hn" aria-hidden="true">3</span><h3 class="cg-land-h3">Durum doğrulanır</h3>
                        <p class="cg-land-p">Sonuç cihaz durumuna göre kontrol edilir; takılırsanız ipuçları kademeli açılır.</p>
                        <pre class="cg-land-term cg-land-mini" aria-hidden="true"><span class="g">✓ Görev tamam</span></pre></li>
                </ol>
                <p class="cg-land-sp">Senaryolu pratik için <a href="${this._arenaHref()}">${E(this._arenaLabel())}</a>, sahadaki arızalar için <a href="#/troubleshoot">belirtiye göre sorun giderme</a>.</p>
            </section>

            <section class="cg-land-sec" aria-labelledby="cg-land-vend">
                <div class="cg-land-sech">
                    <h2 class="cg-land-h2" id="cg-land-vend">Vendorlar</h2>
                    <a class="cg-land-more" href="#/v">Tüm vendorlar ${this._ico('arrow')}</a>
                </div>
                ${h ? `<ul class="cg-vgrid cg-land-vgrid" role="list">${fams.map(f => h._vcard(f)).join('')}</ul>`
                    : `<ul class="cg-land-vfall" role="list">${fams.map(f => `<li><a href="#/v/${E(f.slug)}">${E(f.name)}</a></li>`).join('')}</ul>`}
            </section>

            <section class="cg-land-sec" aria-labelledby="cg-land-feat">
                <h2 class="cg-land-h2" id="cg-land-feat">Öne çıkanlar</h2>
                <ul class="cg-land-cards" role="list">${this._featured().map(c => `<li><a class="cg-land-card" href="${E(c.href)}">
                    <span class="cg-land-ci">${this._ico(c.icon)}</span>
                    <span class="cg-land-cb"><span class="cg-land-ct">${E(c.title)}</span><span class="cg-land-cd">${E(c.desc)}</span></span>
                </a></li>`).join('')}</ul>
            </section>

            <section class="cg-land-sec" id="cg-land-yollar" aria-labelledby="cg-land-paths" tabindex="-1">
                <h2 class="cg-land-h2" id="cg-land-paths">Öğrenme yolları</h2>
                <p class="cg-land-sp">Sıralı modüllerle sıfırdan üretime; her modülde tarayıcıda çalışan lablar var.</p>
                <div data-land-paths>${this._pathsHtml()}</div>
            </section>

            <section class="cg-land-sec" id="cg-land-hakkinda" aria-labelledby="cg-land-about">
                <h2 class="cg-land-h2" id="cg-land-about">Hakkında</h2>
                <div class="cg-land-about">
                    <div class="cg-land-ph" aria-hidden="true">Fotoğraf<br>yer tutucu</div>
                    <div class="cg-land-about-b">
                        <h3 class="cg-land-h3"><span class="cg-land-plh">[Ad Soyad]</span> · <span class="cg-land-plh">[Unvan]</span></h3>
                        <p class="cg-land-p"><span class="cg-land-plh">[2–3 cümlelik biyografi: deneyim alanı, çalıştığı teknolojiler]</span></p>
                        <p class="cg-land-p">Bu platform; sahadan çıkan config şablonlarını, gerçekçi terminal lablarını ve sorun giderme akışlarını Türkçe ve ücretsiz olarak bir araya getirir. Girdiğiniz hiçbir veri sunucuya gönderilmez; tüm işlemler tarayıcınızda yapılır.</p>
                        <p class="cg-land-p"><span class="cg-land-plh">[Sertifikalar]</span></p>
                    </div>
                </div>
            </section>

            <section class="cg-land-band" aria-labelledby="cg-land-band">
                <h2 class="cg-land-h2" id="cg-land-band">İlk labınızı şimdi başlatın</h2>
                <p class="cg-land-p">Kurulum ve hesap gerekmez; lab tarayıcıda açılır.</p>
                <div class="cg-land-cta">
                    <a class="cg-land-btn cg-land-btn-pri" href="${this.FIRST_FALLBACK}" data-land-first>İlk labı başlat ${this._ico('arrow')}</a>
                    <a class="cg-land-btn" href="#/cli">Komut kütüphanesine göz at</a>
                </div>
            </section>

            <section class="cg-land-sec" id="cg-land-iletisim" aria-labelledby="cg-land-contact">
                <h2 class="cg-land-h2" id="cg-land-contact">İletişim</h2>
                <ul class="cg-land-cards" role="list">
                    <li><a class="cg-land-card" href="${E(this.REPO)}" target="_blank" rel="noopener">
                        <span class="cg-land-ci">${this._ico('git')}</span>
                        <span class="cg-land-cb"><span class="cg-land-ct">GitHub</span><span class="cg-land-cd">Kaynak kod, hata bildirimi ve öneriler (yeni sekmede açılır).</span></span>
                    </a></li>
                    <li><div class="cg-land-card is-ph">
                        <span class="cg-land-ci">${this._ico('user')}</span>
                        <span class="cg-land-cb"><span class="cg-land-ct">LinkedIn</span><span class="cg-land-cd"><span class="cg-land-plh">[LinkedIn]</span></span></span>
                    </div></li>
                    <li><div class="cg-land-card is-ph">
                        <span class="cg-land-ci">${this._ico('mail')}</span>
                        <span class="cg-land-cb"><span class="cg-land-ct">E-posta</span><span class="cg-land-cd"><span class="cg-land-plh">[e-posta]</span></span></span>
                    </div></li>
                </ul>
            </section>

            <footer class="cg-land-ftr">
                <nav class="cg-land-fcols" aria-label="Site haritası">${this._footCols()}</nav>
                <p class="cg-land-fnote">Vendor adları ve logoları sahiplerinin tescilli markalarıdır; yalnız cihazı belirtmek için kullanılır.</p>
            </footer>
        </div>`;

        // "Öğrenme yolları" bağlantısı: hash yönlendiriciyi tetiklemeden bölüme kaydır ve odağı taşı
        root.querySelectorAll('[data-land-jump]').forEach(a => a.addEventListener('click', ev => {
            const t = root.querySelector('#' + a.dataset.landJump);
            if (!t) return;
            ev.preventDefault();
            t.scrollIntoView({ block: 'start' });
            t.focus({ preventScroll: true });
        }));

        const tok = this._stamp(root);
        const paint = () => {
            if (!this._alive(root, tok)) return;
            const s = this._stats();
            const lead = root.querySelector('[data-land-lead]'); if (lead) lead.textContent = this._lead(s);
            const st = root.querySelector('[data-land-stats]'), sh = this._statsHtml(s);
            if (st && st.innerHTML !== sh) st.innerHTML = sh;
            const pt = root.querySelector('[data-land-paths]'), ph = this._pathsHtml();
            if (pt && pt.innerHTML !== ph && !pt.contains(document.activeElement)) pt.innerHTML = ph;
            if (h) fams.forEach(f => h._vcardCounts(root, f));
            const first = this._firstLab();
            if (first) root.querySelectorAll('[data-land-first]').forEach(a => a.setAttribute('href', '#/lab/' + first));
        };
        // Yalnız küçük dosyalar: komut dizini (~1 KB) ve lab özeti (~9 KB: vendor başına lab sayısı + yollar). Lab verisi yüklenmez.
        this._load('assets/data/cli/index.js').then(paint, () => {});
        this._load('assets/data/labs/index.js').then(paint, () => {});
        this._load('assets/data/ts/index.js').then(paint, () => {});   // senaryo sayısı (~1 KB)
        this._load('assets/data/labs/paths.js').then(paint, () => {});  // yalnız "İlk labı başlat" hedefi için (~18 KB)
    },

    // "İlk labı başlat": Cisco yolunun ilk modülündeki ilk lab (Cisco önce kuralı). Yol tanımı yüklenene kadar yol sayfası.
    FIRST_FALLBACK: '#/lab/path/cisco-swrt',
    _firstLab() {
        const p = (window.CG_LAB_PATHS || []).find(x => x.vendor === 'cisco-ios');
        const m = p && (p.modules || []).find(x => x && Array.isArray(x.labs) && x.labs.length);
        return m ? m.labs[0] : null;
    },
    _arenaFam() { return this._fams().find(f => f.arena) || null; },
    _arenaHref() { const f = this._arenaFam(); return f ? '#/v/' + f.slug + '/arena' : '#/lab'; },
    _arenaLabel() { const f = this._arenaFam(); return f ? (typeof cgArenaName === 'function' ? cgArenaName(f) : 'Arena') : 'lablar'; },
    // Çok sütunlu altbilgi: yalnız mevcut adresler
    _footCols() {
        const E = v => this._esc(v);
        const C = [
            ['Platform', [['Vendorlar', '#/v'], ['Tüm araçlar', '#/araclar'], ['Tüm lablar', '#/lab'], ['Tüm komutlar', '#/cli'], ['Dönüştürücü', '#/converter']]],
            ['Rehber', [['Rehber', '#/rehber'], ['Cisco öğrenme yolu', '#/lab/path/cisco-swrt'], ['Sorun giderme', '#/troubleshoot']]],
            ['Blog', [['Tüm yazılar', '#/blog']]],
            ['İletişim', [['İletişim', '#/iletisim'], ['GitHub', this.REPO, 1]]],
        ];
        return C.map(([t, L]) => `<div class="cg-land-fcol"><h2 class="cg-land-fh">${E(t)}</h2><ul role="list">${L.map(([l, u, ext]) => `<li><a href="${E(u)}"${ext ? ' target="_blank" rel="noopener"' : ''}>${E(l)}</a></li>`).join('')}</ul></div>`).join('');
    },

    _lead(s) {
        const parts = [this._n(s.tools) + ' config aracı'];
        if (s.labs != null) parts.push(this._n(s.labs) + ' terminal labı');
        if (s.cmds != null) parts.push(this._n(s.cmds) + ' komut');
        if (s.scen != null) parts.push(this._n(s.scen) + ' sorun giderme senaryosu');
        const list = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' ve ' + parts[parts.length - 1] : parts[0];
        return `${this._n(s.fams)} vendor ailesinde ${list}. Türkçe, ücretsiz, kurulum yok.`;
    },
    _statsHtml(s) {
        const L = [[s.fams, 'vendor ailesi'], [s.tools, 'config aracı'], [s.labs, 'lab'], [s.cmds, 'komut'], [s.scen, 'senaryo'], [s.paths, 'öğrenme yolu']]
            .filter(x => x[0] != null);
        return L.map(([n, t]) => `<div class="cg-land-stat"><dt>${this._esc(t)}</dt><dd>${this._n(n)}</dd></div>`).join('');
    },
    _featured() {
        const R = typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY : {};
        const af = this._fams().find(f => f.arena), arena = !!af;
        const F = [
            { icon: 'lab', title: 'CLI labları', href: '#/lab', desc: 'Tarayıcıda gerçekçi terminal; görevler cihaz durumuna göre kontrol edilir.' },
            arena && { icon: 'arena', title: typeof cgArenaName === 'function' ? cgArenaName(af) : 'Arena', href: '#/v/' + af.slug + '/arena', desc: 'Kuralı yaz, trafiği başlat: olaylar ve satırlar canlı akar.' },
            { icon: 'ts', title: 'Sorun giderme', href: '#/troubleshoot', desc: 'Belirtiden başla, kontrol komutlarıyla adım adım teşhise git.' },
            { icon: 'cli', title: 'Komut kütüphanesi', href: '#/cli', desc: 'Doğrulama, sorun giderme ve günlük işletim komutları; tıkla, kopyala.' },
            { icon: 'convert', title: 'Dönüştürücü', href: '#/converter', desc: "Bir vendorun config'ini diğerinin sözdizimine çevirin." },
        ].filter(Boolean);
        if (R.referans) F.push({ icon: 'ref', title: R.referans.label || 'Referans', href: '#/araclar?p=referans', desc: 'Topoloji diyagramları, port tabloları ve karşılaştırmalı referanslar.' });
        return F;
    },
    _pathsHtml() {
        const P = this._paths();
        if (!P) return '<p class="cg-land-sp" role="status">Öğrenme yolları yükleniyor…</p>';
        if (!P.length) return '<p class="cg-land-sp">Henüz öğrenme yolu yok.</p>';
        const labs = P.some(p => p.labs != null);
        const E = v => this._esc(v);
        return `<div class="cg-land-tw" role="region" aria-labelledby="cg-land-paths" tabindex="0"><table class="cg-land-tbl">
            <thead><tr><th scope="col">Yol</th><th scope="col">Vendor</th><th scope="col" class="num">Modül</th>${labs ? '<th scope="col" class="num">Lab</th>' : ''}</tr></thead>
            <tbody>${P.map(p => `<tr><th scope="row"><a href="#/lab/path/${E(p.id)}">${E(p.title)}</a></th><td>${E(this._famName(p.vendor))}</td><td class="num">${this._n(p.mods)}</td>${labs ? `<td class="num">${p.labs != null ? this._n(p.labs) : '—'}</td>` : ''}</tr>`).join('')}</tbody>
        </table></div>`;
    },
};

if (typeof window !== 'undefined') window.CgLanding = CgLanding;
