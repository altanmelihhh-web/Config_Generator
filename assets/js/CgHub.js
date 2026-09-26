'use strict';
// ─── Vendor kartları (#/v) ve vendor hub (#/v/<aile>) — UI A4, Tema 1 "Kılavuz" ───
// Veri: CG_FAMILIES (cg-families.js) + CG_REGISTRY (araç sayısı, senkron). Lab/komut/senaryo sayıları
// tembel yüklenen verilerden gelir (CgCli._load, CgLab._loadAll, CgTroubleshoot._loadAll); yüklenemezse sayı gösterilmez.
// Kırıntı ve sol ağaç kabukta (CgShell); burada yalnız sayfa gövdesi çizilir. Sabit sayı yazılmaz.
const CgHub = {
    // Görsel üst veri: cihaz sınıfı ve logo yoksa gösterilecek monogram.
    // Logo ve marka rengi: cg-brands.js (CG_BRAND, CG_LOGO_PATHS) + cg-logos-extra.js (CG_LOGO_EXTRA); ikisi de simple-icons (CC0).
    META: {
        cisco:      { mono: 'Ci', kinds: ['Switch', 'Router', 'Firewall'] },
        fortinet:   { mono: 'Ft', kinds: ['Firewall'] },
        paloalto:   { mono: 'PA', kinds: ['Firewall'] },
        checkpoint: { mono: 'CP', kinds: ['Firewall'] },
        f5:         { mono: 'F5', kinds: ['ADC'] },
        juniper:    { mono: 'Jn', kinds: ['Switch', 'Router', 'Firewall'] },
        huawei:     { mono: 'Hw', kinds: ['Switch', 'Router', 'Firewall'] },
        dell:       { mono: 'De', kinds: ['DC Switch'] },
        arista:     { mono: 'Ar', kinds: ['DC Switch'] },
        citrix:     { mono: 'Cx', kinds: ['ADC'] },
        mikrotik:   { mono: 'Mt', kinds: ['Router'] },
        extreme:    { mono: 'Ex', kinds: ['Switch'] },
    },
    // Tema 1 gruplaması (mockup vendorlar.html ile aynı sıra ve kural)
    GROUPS: [
        { id: 'fw',  title: 'Güvenlik duvarı',                   fn: k => k.length === 1 && k[0] === 'Firewall' },
        { id: 'all', title: 'Switch · Router · Firewall ailesi', fn: k => k.length > 1 },
        { id: 'sw',  title: 'Switch ve router',                  fn: k => k.length === 1 && /Switch|Router/.test(k[0]) },
        { id: 'adc', title: 'Uygulama teslimi (ADC)',            fn: k => k.length === 1 && k[0] === 'ADC' },
    ],
    // Özgün çizgi ikonlar (marka logosu değil); stroke=currentColor, tema tokenını izler
    ICON: {
        tools: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
        lab: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>',
        path: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>',
        cli: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9l3 3-3 3M12 15h5"/>',
        ts: '<path d="M3 12h4l2-5 4 10 2-5h6"/>',
        arena: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
        convert: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
        ref: '<path d="M5 4h10a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4z"/><path d="M5 16a4 4 0 0 1 4-4h10"/>',
        arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    },

    // ── Yardımcılar ─────────────────────────────────────────────────────
    _esc(s) { return typeof cgEsc === 'function' ? cgEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    _n(n) { return Number(n).toLocaleString('tr-TR'); },
    _ico(k) { return '<svg class="cg-hub-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (this.ICON[k] || '') + '</svg>'; },
    _fams() { return typeof CG_FAMILIES !== 'undefined' ? CG_FAMILIES : []; },
    _reg(id) { return typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY[id] : null; },
    _meta(slug) { return this.META[slug] || { mono: String(slug).slice(0, 2), kinds: [] }; },
    // Aile logosu: önce cg-brands.js (ilk kayıt kimliğinin markası), sonra cg-logos-extra.js. Logo yoksa path null (monogram).
    _logo(f) {
        const b = typeof CG_BRAND !== 'undefined' ? CG_BRAND[f.reg[0]] : null;
        const x = typeof CG_LOGO_EXTRA !== 'undefined' ? CG_LOGO_EXTRA[f.slug] : null;
        const path = (b && typeof CG_LOGO_PATHS !== 'undefined' && CG_LOGO_PATHS[b[0]]) || (x && x.path) || null;
        const color = (x && x.color) || (b && b[1]) || '';
        return { path, color: /^#[0-9a-f]{3,8}$/i.test(color) ? color : '' };
    },
    // Rozet: marka renginde logo (aria-hidden; vendor adı kartta metin olarak var). Logo yoksa marka renkli monogram.
    _badge(f, big) {
        const m = this._meta(f.slug), L = this._logo(f), px = big ? 34 : 28;
        const st = L.color ? ` style="--bc:${L.color}"` : '';
        const cls = 'cg-vbadge' + (big ? ' cg-vbadge-lg' : '') + (L.path ? ' cg-vbadge-logo' : '');
        return L.path
            ? `<span class="${cls}"${st} aria-hidden="true"><svg viewBox="0 0 24 24" width="${px}" height="${px}" focusable="false"><path fill="currentColor" d="${this._esc(L.path)}"/></svg></span>`
            : `<span class="${cls}"${st} aria-hidden="true">${this._esc(m.mono)}</span>`;
    },
    _platforms(f) { return f.reg.map(r => this._reg(r)).map((v, i) => v && { key: f.reg[i], label: v.label, n: v.types.length }).filter(Boolean); },
    _counts(slug) { return typeof cgFamilyCounts === 'function' ? (cgFamilyCounts(slug) || {}) : {}; },
    // Öğrenme yolu: CgLab verisi yüklendiyse ailenin ilk yolu (boş modüller zaten ayıklanmış), değilse undefined
    _path(f) {
        if (typeof CgLab === 'undefined' || !window.CG_LAB_PATHS || !window.CG_LABS) return undefined;
        return CgLab._paths().find(p => f.lab.includes(p.vendor)) || null;
    },
    _arenaN(f) {
        if (!f.arena || !window.CG_LABS) return null;
        return window.CG_LABS.filter(l => f.lab.includes(l.vendor) && /^Arena ·/.test(l.title || '')).length;
    },
    // Hedef kök hâlâ bu çizime mi ait? (tembel yükleme dönerken kullanıcı başka sayfaya geçmiş olabilir)
    _alive(root, tok) { return root.isConnected && root.dataset.cgHub === tok; },
    _stamp(root) { const tok = String(Date.now()) + Math.random().toString(36).slice(2, 6); root.dataset.cgHub = tok; return tok; },
    // Veri yükleyicileri: her biri kendi başına başarısız olabilir; hata sessizce yutulur (sayı gösterilmez)
    _loadCliIndex() { return typeof CgCli !== 'undefined' ? CgCli._load('assets/data/cli/index.js') : Promise.reject(new Error('CgCli yok')); },
    _loadLabs() { return typeof CgLab !== 'undefined' && typeof CgCli !== 'undefined' ? CgLab._loadAll() : Promise.reject(new Error('CgLab yok')); },
    _loadTs() { return typeof CgTroubleshoot !== 'undefined' && typeof CgCli !== 'undefined' ? CgTroubleshoot._loadAll() : Promise.reject(new Error('CgTroubleshoot yok')); },

    // ── #/v: vendor kartları ────────────────────────────────────────────
    renderVendors(root) {
        document.title = 'Vendorlar · Config Generator';
        const fams = this._fams();
        const plat = fams.reduce((a, f) => a + this._platforms(f).length, 0);
        const ref = this._reg('referans');
        const groups = this.GROUPS.map(g => ({ g, list: fams.filter(f => g.fn(this._meta(f.slug).kinds)) })).filter(x => x.list.length);
        // Hiçbir gruba düşmeyen aile (yeni eklenmiş olabilir) kaybolmasın
        const seen = new Set([].concat(...groups.map(x => x.list)));
        const rest = fams.filter(f => !seen.has(f));
        if (rest.length) groups.push({ g: { id: 'diger', title: 'Diğer' }, list: rest });

        root.innerHTML = `<div class="cg-hub cg-hub-vendors">
            <header class="cg-hub-head">
                <h1 class="cg-hub-h1">Vendor seçin</h1>
                <p class="cg-hub-lead">${this._n(fams.length)} vendor ailesi, ${this._n(plat)} cihaz platformu. Bir vendora girince o vendorun config araçları, labları, komutları ve sorun giderme senaryoları tek yerde toplanır.</p>
            </header>
            ${groups.map(({ g, list }) => `<section class="cg-hub-sec" aria-labelledby="cg-vg-${g.id}">
                <h2 class="cg-hub-h2" id="cg-vg-${g.id}">${this._esc(g.title)}</h2>
                <ul class="cg-vgrid" role="list">${list.map(f => this._vcard(f)).join('')}</ul>
            </section>`).join('')}
            <section class="cg-hub-sec" aria-labelledby="cg-vg-bag">
                <h2 class="cg-hub-h2" id="cg-vg-bag">Vendor bağımsız</h2>
                <ul class="cg-hub-cards" role="list">
                    <li><a class="cg-hub-card" href="#/converter"><span class="cg-hub-ci">${this._ico('convert')}</span><span class="cg-hub-cb"><span class="cg-hub-ct">Dönüştürücü</span><span class="cg-hub-cd">Bir vendorun config'ini diğerinin sözdizimine çevirin.</span></span></a></li>
                    ${ref ? `<li><a class="cg-hub-card" href="#/araclar?p=referans"><span class="cg-hub-ci">${this._ico('ref')}</span><span class="cg-hub-cb"><span class="cg-hub-ct">${this._esc(ref.label)}</span><span class="cg-hub-cd">Topoloji diyagramları, port tabloları ve karşılaştırmalı referanslar.</span><span class="cg-hub-cm">${this._n(ref.types.length)} referans modülü</span></span></a></li>` : ''}
                </ul>
            </section>
            <p class="cg-hub-note">Logolar simple-icons (CC0) kaynaklıdır; marka adları ve logoları ilgili sahiplerinin tescilli markalarıdır ve yalnız cihazı belirtmek için kullanılır. Logosu bulunmayan vendorlar harf rozetiyle gösterilir.</p>
        </div>`;

        const tok = this._stamp(root);
        const paint = () => { if (!this._alive(root, tok)) return; fams.forEach(f => this._vcardCounts(root, f)); };
        this._loadCliIndex().then(paint, () => {});
        this._loadLabs().then(paint, () => {});
    },

    _vcard(f) {
        const m = this._meta(f.slug), c = this._counts(f.slug);
        const plats = this._platforms(f);
        return `<li><a class="cg-vcard" href="#/v/${this._esc(f.slug)}" data-slug="${this._esc(f.slug)}">
            ${this._badge(f)}
            <span class="cg-vcard-b">
                <span class="cg-vcard-t">${this._esc(f.name)}</span>
                <span class="cg-vcard-k">${this._esc(m.kinds.join(' · '))}</span>
                <span class="cg-vcard-p">${plats.map(p => this._esc(p.label)).join(', ')}</span>
            </span>
            <span class="cg-vcard-c" data-counts>${this._vcardMeta(f, c)}</span>
        </a></li>`;
    },
    // Araç sayısı hep bilinir; lab/komut yalnız veri yüklendiyse. Labsız ailede "lab yok" senkron bilinir.
    _vcardMeta(f, c) {
        const L = [this._n(c.tools || 0) + ' araç'];
        if (!f.lab.length) L.push('lab yok');
        else if (c.labs != null) L.push(c.labs ? this._n(c.labs) + ' lab' : 'lab yok');
        if (c.cmds != null && c.cmds) L.push(this._n(c.cmds) + ' komut');
        return L.map(x => `<span>${x}</span>`).join('');
    },
    _vcardCounts(root, f) {
        const el = root.querySelector(`.cg-vcard[data-slug="${f.slug}"] [data-counts]`);
        if (el) el.innerHTML = this._vcardMeta(f, this._counts(f.slug));
    },

    // ── #/v/<aile>: vendor hub ──────────────────────────────────────────
    renderHub(root, slug) {
        const f = typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[slug] : null;
        if (!f) { this.renderVendors(root); return; }
        document.title = f.name + ' · Config Generator';
        const m = this._meta(f.slug), plats = this._platforms(f), c = this._counts(f.slug);
        const base = '#/v/' + f.slug;
        const desc = (plats.length ? plats.map(p => p.label).join(', ') + ' için config araçları, ' : 'Config araçları, ')
            + 'komut kütüphanesi ve sorun giderme senaryoları; '
            + (f.lab.length ? 'tarayıcıda çalışan CLI labları ve öğrenme yolu.' : 'bu vendor için CLI labı henüz yok.');

        root.innerHTML = `<div class="cg-hub cg-hub-vendor">
            <header class="cg-hub-head cg-hub-head-v">
                ${this._badge(f, true)}
                <div class="cg-hub-hv">
                    <h1 class="cg-hub-h1">${this._esc(f.name)}</h1>
                    ${m.kinds.length ? `<span class="cg-hub-pill">${this._esc(m.kinds.join(' · '))}</span>` : ''}
                </div>
            </header>
            <p class="cg-hub-lead">${this._esc(desc)}</p>
            ${plats.length ? `<nav class="cg-hub-plats" aria-label="${this._esc(f.name)} platformları">
                <a class="cg-hub-plat" href="${base}/araclar"><span>Tümü</span><small>${this._n(c.tools || 0)}</small></a>
                ${plats.map(p => `<a class="cg-hub-plat" href="${base}/araclar?p=${encodeURIComponent(p.key)}"><span>${this._esc(p.label)}</span><small>${this._n(p.n)}</small></a>`).join('')}
            </nav>` : ''}
            <h2 class="cg-hub-h2 cg-hub-vh" id="cg-hub-bol">Bölümler</h2>
            <ul class="cg-hub-cards" role="list" aria-labelledby="cg-hub-bol" data-sections>${this._sections(f).map(s => this._card(s)).join('')}</ul>
            <section class="cg-hub-start" aria-labelledby="cg-hub-basla" data-start>${this._start(f)}</section>
        </div>`;

        const tok = this._stamp(root);
        const repaint = () => {
            if (!this._alive(root, tok)) return;
            // Yalnız değişen kart yenilenir; odaktaki kart değiştiyse yeni hâli yeniden odaklanır (klavye kullanıcısı yerini kaybetmez)
            const ul = root.querySelector('[data-sections]');
            this._sections(f).forEach(s => {
                const old = ul.querySelector(`[data-sec="${s.id}"]`), html = this._card(s);
                if (!old) return;
                const li = old.parentNode, focused = li.contains(document.activeElement);
                if (li.innerHTML === html.slice(4, -5)) return;   // <li>…</li> içi aynı
                li.innerHTML = html.slice(4, -5);
                const n = li.firstElementChild;
                if (focused && n && n.tagName === 'A') n.focus();
            });
            const st = root.querySelector('[data-start]'), sh = this._start(f);
            if (st.innerHTML !== sh && !st.contains(document.activeElement)) st.innerHTML = sh;
        };
        this._loadCliIndex().then(repaint, () => {});
        if (f.lab.length) this._loadLabs().then(repaint, () => {});
        this._loadTs().then(repaint, () => {});
    },

    // Bölüm kartı modeli. n: sayı (null = henüz bilinmiyor, gösterilmez); off: içerik yok (soluk, bağlantısız)
    _sections(f) {
        const c = this._counts(f.slug), base = '#/v/' + f.slug, path = f.lab.length ? this._path(f) : null;
        const S = [
            { id: 'araclar', icon: 'tools', title: 'Config araçları', href: base + '/araclar', n: c.tools, unit: 'araç', off: !c.tools,
              desc: 'Formu doldur, cihaza yapıştırılacak config canlı üretilsin.' },
            { id: 'lab', icon: 'lab', title: 'Lablar', href: base + '/lab', n: c.labs, unit: 'lab', off: !f.lab.length || c.labs === 0,
              desc: 'Tarayıcıda gerçekçi terminal; görevler cihaz durumuna göre kontrol edilir.' },
            { id: 'yol', icon: 'path', title: 'Öğrenme yolu', href: base + '/yol', n: path ? path.modules.length : null, unit: 'modül', off: !f.lab.length || path === null,
              desc: path ? path.title : 'Sıralı modüllerle sıfırdan üretime; her modülde lablar.' },
            { id: 'komutlar', icon: 'cli', title: 'Komutlar', href: base + '/komutlar', n: c.cmds, unit: 'komut', off: !f.cli.length || c.cmds === 0,
              desc: 'Doğrulama, sorun giderme ve günlük işletim komutları; tıkla, kopyala.' },
            { id: 'sorun', icon: 'ts', title: 'Sorun giderme', href: base + '/sorun', n: c.scenarios, unit: 'senaryo', off: !f.cli.length || c.scenarios === 0,
              desc: 'Belirtiden başla, kontrol komutlarıyla adım adım teşhise git.' },
        ];
        if (f.arena) S.push({ id: 'arena', icon: 'arena', title: 'iRule Arenası', href: '#/arena', n: this._arenaN(f), unit: 'arena görevi', off: false,
            desc: 'Kuralı yaz, trafiği başlat: olaylar ve satırlar canlı akar.' });
        return S;
    },
    _card(s) {
        const E = v => this._esc(v);
        const meta = s.off ? 'henüz yok' : (s.n != null ? this._n(s.n) + ' ' + s.unit : '');
        const inner = `<span class="cg-hub-ci">${this._ico(s.icon)}</span><span class="cg-hub-cb"><span class="cg-hub-ct">${E(s.title)}</span><span class="cg-hub-cd">${E(s.desc)}</span>${meta ? `<span class="cg-hub-cm">${E(meta)}</span>` : ''}</span>`;
        // İçerik yok: bağlantı değil; ekran okuyucu için aria-disabled + açıklama
        return s.off
            ? `<li><div class="cg-hub-card is-off" role="link" aria-disabled="true" data-sec="${E(s.id)}">${inner}</div></li>`
            : `<li><a class="cg-hub-card" href="${E(s.href)}" data-sec="${E(s.id)}">${inner}</a></li>`;
    },
    // "Nereden başlamalı?": lab varsa öğrenme yolu (yoksa lablar), labsız ailede config araçları
    _start(f) {
        const E = v => this._esc(v), base = '#/v/' + f.slug;
        const H = '<h2 class="cg-hub-h2" id="cg-hub-basla">Nereden başlamalı?</h2>';
        if (f.lab.length) {
            const p = this._path(f);
            if (p === null) {
                return `${H}<p class="cg-hub-sp">${E(f.name)} için öğrenme yolu henüz yok; seviyelere ayrılmış lablarla başlayın.</p>
                    <a class="cg-hub-btn" href="${base}/lab">Lablara git ${this._ico('arrow')}</a>`;
            }
            const mods = p ? p.modules.slice(0, 4) : [];
            return `${H}<p class="cg-hub-sp">${p ? `“${E(p.title)}” yolu sıralı modüllerle ilerler; her modülde tarayıcıda çalışan lablar var.` : `Sıralı modüllerden oluşan öğrenme yoluyla başlayın; her modülde tarayıcıda çalışan lablar var.`}</p>
                ${mods.length ? `<ol class="cg-hub-steps">${mods.map(x => `<li><span>${E(x.title)}</span><small>${this._n(x.labs.length)} lab</small></li>`).join('')}</ol>` : ''}
                <a class="cg-hub-btn" href="${base}/yol">Öğrenme yoluna başla ${this._ico('arrow')}</a>`;
        }
        const plats = this._platforms(f);
        const first = plats[0] && this._reg(plats[0].key);
        const tools = first ? first.types.slice(0, 6) : [];
        return `${H}<p class="cg-hub-sp">${E(f.name)} için CLI labı henüz yok. Config araçlarıyla başlayın: formu doldurun, üretilen config'i inceleyin.</p>
            ${tools.length ? `<ul class="cg-hub-tools" role="list">${tools.map(t => `<li><a class="cg-hub-tool" href="#/${E(plats[0].key)}/${E(t.id)}">${E(t.label)}</a></li>`).join('')}</ul>` : ''}
            <a class="cg-hub-btn" href="${base}/araclar">Config araçlarına git ${this._ico('arrow')}</a>`;
    },
};

if (typeof window !== 'undefined') window.CgHub = CgHub;
