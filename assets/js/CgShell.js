'use strict';
// ─── Kabuk (UI A3): sayfa yolu (kırıntı), sol vendor ağacı (≥1280px, vendor sayfalarında), mobil menü çekmecesi ───
// Yalnız okur: hash + yüklenmiş veriler (CG_FAMILIES, CG_REGISTRY, CG_LABS, CG_CLI_INDEX, CgTroubleshoot._list, CG_ARENA_*).
// Tembel yüklenen modüller ekranı sonradan çizdiği için #config-generator-root'un doğrudan çocukları değişince kırıntı yenilenir.
const CgShell = {
    // Mobil çekmece ve üst menü. top: üst menüde ayrı öğe (S11b: Ana Sayfa · Platform ▾ · Dönüştürücü · Rehber · Blog · İletişim);
    // top olmayanlar "Platform" açılır listesinde ve çekmecede Platform grubunun altında.
    NAV: [
        { id: 'home', top: 1, href: '#/', icon: 'fas fa-home', label: 'Ana Sayfa' },
        { id: 'vendors', href: '#/v', icon: 'fas fa-building', label: 'Vendorlar', d: 'Vendor seç: araçlar, lablar, komutlar, sorun giderme' },
        { id: 'tools', href: '#/araclar', icon: 'fas fa-th-large', label: 'Tüm araçlar', d: 'Tüm vendorların config araçları' },
        { id: 'lab', href: '#/lab', icon: 'fas fa-flask', label: 'Tüm lablar', d: 'Tüm vendorların CLI labları' },
        { id: 'cli', href: '#/cli', icon: 'fas fa-terminal', label: 'Tüm komutlar', d: 'Komut kütüphanesi' },
        { id: 'ts', href: '#/troubleshoot', icon: 'fas fa-stethoscope', label: 'Sorun giderme (belirtiye göre)', d: 'Belirtiden başlayan sihirbaz' },
        { id: 'conv', top: 1, href: '#/converter', icon: 'fas fa-exchange-alt', label: 'Dönüştürücü' },
        { id: 'rehber', top: 1, href: '#/rehber', icon: 'fas fa-compass', label: 'Rehber' },
        { id: 'blog', top: 1, href: '#/blog', icon: 'fas fa-pen-nib', label: 'Blog' },
        { id: 'iletisim', top: 1, href: '#/iletisim', icon: 'fas fa-envelope', label: 'İletişim' },
    ],
    ARENA: { masa: ['Trafik Masası', 'CG_ARENA_MASA'], meydan: ['Meydan Okuma', 'CG_ARENA_MO'], waf: ['WAF Masası', 'CG_ARENA_WAF'], nobet: ['Nöbet', 'CG_ARENA_NOBET'] },

    init() {
        this._crumb = document.getElementById('cg-bc');
        this._side = document.getElementById('cg-side');
        this._drawer = document.getElementById('cg-drawer');
        this._menuBtn = document.getElementById('cg-menu-btn');
        const root = document.getElementById('config-generator-root');
        if (root && typeof MutationObserver !== 'undefined') {
            new MutationObserver(() => { clearTimeout(this._t); this._t = setTimeout(() => this.update(), 60); }).observe(root, { childList: true });
        }
        if (this._menuBtn) this._menuBtn.addEventListener('click', () => this.openDrawer());
        window.addEventListener('resize', () => { cancelAnimationFrame(this._fr); this._fr = requestAnimationFrame(() => this._fit()); });
        // Komut sayıları için küçük dizin (CgCli tembel yükleyicisi; hata olursa sayı gösterilmez)
        if (typeof CgCli !== 'undefined' && !window.CG_CLI_INDEX) CgCli._load('assets/data/cli/index.js').then(() => this.update(), () => {});
        if (this._drawer) {
            this._drawer.addEventListener('click', e => { if (e.target.closest('[data-close]') || e.target.closest('a[href^="#"]')) this.closeDrawer(); });
            // Çekmece açıkken Esc/Tab belge düzeyinde (capture) yakalanır: odak panelin boş yerindeyken de
            // Esc sayfanın kendi Esc'ine (araçtan listeye dönüş) ulaşmaz, Tab arka sayfaya kaçmaz.
            document.addEventListener('keydown', e => {
                if (this._drawer.hidden) return;
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.closeDrawer(); return; }
                if (e.key !== 'Tab') return;
                const f = [...this._drawer.querySelectorAll('a[href], button:not([disabled])')].filter(x => x.offsetParent !== null);
                if (!f.length) return;
                const a = document.activeElement, inside = this._drawer.contains(a) && a !== this._drawer;
                if (!inside || !f.includes(a)) { e.preventDefault(); (e.shiftKey ? f[f.length - 1] : f[0]).focus(); return; }
                if (e.shiftKey && a === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
                else if (!e.shiftKey && a === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
            }, true);
        }
        // Çekmece açıkken ekran genişler ve menü düğmesi gizlenirse (1280 / lab sayfasında 1440 eşiği) kapat
        window.addEventListener('resize', () => { if (this._drawer && !this._drawer.hidden && this._menuBtn && this._menuBtn.offsetParent === null) this.closeDrawer(true); });
        this._initPlatform();
    },

    // Üst menü "Platform": açılır sade liste (açıklama düğmesi deseni; menü rolü yok, bağlantılar Tab ile gezilir)
    _initPlatform() {
        const btn = document.querySelector('[data-nav="platform"]'), menu = document.getElementById('cg-plat-menu');
        if (!btn || !menu) return;
        const open = () => {
            menu.innerHTML = this.NAV.filter(x => !x.top).map(x => '<li><a href="' + x.href + '"' + (this._nav === x.id ? ' aria-current="page"' : '') + '><i class="' + x.icon + '" aria-hidden="true"></i><span><b>' + this._esc(x.label) + '</b>' + (x.d ? '<small>' + this._esc(x.d) + '</small>' : '') + '</span></a></li>').join('');
            menu.hidden = false; btn.setAttribute('aria-expanded', 'true');
        };
        const close = focus => { if (menu.hidden) return; menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (focus) btn.focus(); };
        this._closePlatform = close;
        btn.addEventListener('click', () => { if (menu.hidden) open(); else close(); });
        btn.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { e.preventDefault(); open(); const a = menu.querySelector('a'); if (a) a.focus(); } });
        menu.addEventListener('keydown', e => {
            const L = [...menu.querySelectorAll('a')], i = L.indexOf(document.activeElement);
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); L[(i + (e.key === 'ArrowDown' ? 1 : -1) + L.length) % L.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); L[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); L[L.length - 1].focus(); }
        });
        menu.addEventListener('click', e => { if (e.target.closest('a')) close(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); close(true); } }, true);
        document.addEventListener('click', e => { if (!menu.hidden && !e.target.closest('.app-nav-dd')) close(); });
        document.addEventListener('focusin', e => { if (!menu.hidden && !e.target.closest('.app-nav-dd')) close(); });
        window.addEventListener('hashchange', () => close());
    },

    // ── Yardımcılar ─────────────────────────────────────────────────────
    _esc(s) { return typeof cgEsc === 'function' ? cgEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    _fam(slug) { return typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[slug] : null; },
    _famOf(key) { return typeof cgFamilyOf === 'function' ? cgFamilyOf(key) : null; },
    _reg(id) { return typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY[id] : null; },
    _labVendor(v) { return typeof CgLab !== 'undefined' && CgLab.VENDORS[v] ? CgLab.VENDORS[v].name : v; },
    _cliName(k) { const x = (window.CG_CLI_INDEX || []).find(v => v.key === k); return x ? x.name : k; },

    // Hash → kırıntı öğeleri [{t, h?}] ve ağaç bağlamı { fam, sec, cross?, labRun?, work? }
    // Vendoru belli her sayfa (araç, lab, yol, komut, senaryo, arena) aile bağlamında: Vendorlar › <Aile> › <Bölüm> › …
    // cross: "Tüm …" çapraz görünümleri (sol menü yok)
    _model() {
        const full = location.hash || '', qi = full.indexOf('?');
        const h = qi < 0 ? full : full.slice(0, qi), P = new URLSearchParams(qi < 0 ? '' : full.slice(qi + 1));
        const V = { t: 'Vendorlar', h: '#/v' }, FH = f => ({ t: f.name, h: '#/v/' + f.slug });
        const SEC = (f, s, t, q) => ({ t, h: '#/v/' + f.slug + '/' + s + (q || '') });
        const labQ = (f, v) => v && v !== f.lab[0] ? '?v=' + v : '';   // ailede ikinci lab vendoru (ör. FortiGate 7.6)
        let m;
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            return { items: [V, { t: f.name }], fam: f.slug, sec: 'hub' };
        }
        if (h === '' || h === '#' || h === '#/') return { items: [] };
        if (h === '#/araclar') {
            const r = P.get('p') && this._reg(P.get('p'));
            return { items: r ? [{ t: 'Tüm araçlar', h: '#/araclar' }, { t: r.label }] : [], cross: true };
        }
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)\/arena(?:\/(masa|meydan|waf|nobet)\/([a-z0-9-]+))?$/))) {
            const f = this._fam(m[1]); if (!f || !f.arena) return { items: [] };
            const an = typeof cgArenaName === 'function' ? cgArenaName(f) : 'Arena';
            if (!m[2]) return { items: [V, FH(f), { t: an }], fam: f.slug, sec: 'arena' };
            const [label, key] = this.ARENA[m[2]], task = (window[key] || []).find(x => x.id === m[3]);
            return { items: [V, FH(f), SEC(f, 'arena', an), { t: label }, { t: task ? task.title : m[3] }], fam: f.slug, sec: 'arena' };
        }
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)\/(lab|komutlar|sorun)(?:\/([a-z0-9-]+))?$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            // Hub altındaki bölüm: Vendorlar › <Aile> › <Bölüm> (plan §2.1)
            const L = { lab: 'Lablar', komutlar: 'Komutlar', sorun: 'Sorun giderme' }[m[2]];
            const items = [V, FH(f), m[3] ? SEC(f, m[2], L) : { t: L }];
            if (m[3]) items.push({ t: this._cliName(m[3]) });
            return { items, fam: f.slug, sec: m[2] };
        }
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)\/araclar$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            const r = P.get('p') && f.reg.includes(P.get('p')) && this._reg(P.get('p'));
            return { items: [V, FH(f), r ? SEC(f, 'araclar', 'Config araçları') : { t: 'Config araçları' }].concat(r ? [{ t: r.label }] : []), fam: f.slug, sec: 'araclar' };
        }
        if ((m = h.match(/^#\/lab\/path\/([a-z0-9-]+)$/))) {
            const p = (window.CG_LAB_PATHS || []).find(x => x.id === m[1]);
            const f = p && this._famOf(p.vendor);
            if (!f) return { items: [{ t: 'Tüm lablar', h: '#/lab' }, { t: p ? 'Öğrenme yolu: ' + p.title : 'Öğrenme yolu' }], cross: true };
            return { items: [V, FH(f), SEC(f, 'lab', 'Lablar', labQ(f, p.vendor)), { t: 'Öğrenme yolu: ' + p.title }], fam: f.slug, sec: 'yol' };
        }
        if ((m = h.match(/^#\/lab(?:\/([a-z0-9-]+))?$/))) {
            if (!m[1]) { const v = P.get('v'); return { items: v ? [{ t: 'Tüm lablar', h: '#/lab' }, { t: this._labVendor(v) }] : [], cross: true }; }
            const l = (window.CG_LABS || []).find(x => x.id === m[1]);
            const f = l && this._famOf(l.vendor);
            // Seviye CgLab.lv ile (müfredatı levelOf'la yeniden sıralanan vendorlar, ör. FortiGate)
            const ln = l && l.level !== null && l.level !== undefined && typeof CgLab !== 'undefined' && CgLab.lv ? CgLab.lv(l) : null;
            const lvn = ln !== null && ln !== undefined ? CgLab.lvName(l.vendor, ln, l) : '';
            const lv = lvn ? [{ t: 'Seviye ' + ln + ' · ' + lvn }] : [];
            if (!l) return { items: [{ t: 'Tüm lablar', h: '#/lab' }, { t: m[1] }], cross: true };
            if (!f) return { items: [{ t: 'Tüm lablar', h: '#/lab' }, { t: this._labVendor(l.vendor), h: '#/lab?v=' + l.vendor }].concat(lv, [{ t: l.title }]), cross: true, labRun: true };
            return { items: [V, FH(f), SEC(f, 'lab', 'Lablar', labQ(f, l.vendor))].concat(lv, [{ t: l.title }]), fam: f.slug, sec: 'lab', labRun: true };
        }
        if ((m = h.match(/^#\/cli\/([a-z0-9-]+)$/))) {
            const f = this._famOf(m[1]);
            if (!f) return { items: [{ t: 'Tüm komutlar', h: '#/cli' }, { t: this._cliName(m[1]) }], cross: true };
            return { items: [V, FH(f), SEC(f, 'komutlar', 'Komutlar'), { t: this._cliName(m[1]) }], fam: f.slug, sec: 'komutlar' };
        }
        if ((m = h.match(/^#\/troubleshoot\/([a-z0-9-]+)(?:\/(\d+))?$/))) {
            const TS = typeof CgTroubleshoot !== 'undefined' ? CgTroubleshoot : null;
            const base = { t: 'Sorun giderme (belirtiye göre)', h: '#/troubleshoot' };
            if (m[2] === undefined) { const top = TS && TS.TOPICS.find(t => t.id === m[1]); return { items: [base, { t: top ? top.label : this._cliName(m[1]) }], cross: true }; }
            const s = TS && TS._list && TS._list.find(x => x.vendor === m[1] && x.n === +m[2]);
            const f = this._famOf(m[1]);
            // Konu: CgTroubleshoot._loadAll ile aynı kural (önce s.topic, yoksa başlık kalıbı)
            const tp = s && TS && ((s.topic && TS.TOPICS.find(t => t.id === s.topic)) || (s.s.topic && TS.TOPICS.find(t => t.id === s.s.topic)) || TS.TOPICS.find(t => t.re.test(s.s.title)));
            const title = { t: s ? s.s.title : 'Senaryo ' + m[2] };
            if (!f) return { items: [base].concat(tp ? [{ t: tp.label, h: '#/troubleshoot/' + tp.id }] : [], [{ t: this._cliName(m[1]) }, title]), cross: true };
            return { items: [V, FH(f), SEC(f, 'sorun', 'Sorun giderme')].concat(tp ? [SEC(f, 'sorun', tp.label, '?k=' + tp.id)] : [], [title]), fam: f.slug, sec: 'sorun' };
        }
        if ((m = h.match(/^#\/blog\/([a-z0-9-]+)$/))) {
            // Blog yazısı: vendor alanı olan yazıda aile bağlamı (sol menü yok)
            const b = (window.CG_BLOG || []).find(x => x.slug === m[1]) || (window.CG_BLOG_INDEX || []).find(x => x.slug === m[1]);
            const f = b && this._fam(b.vendor);
            return { items: [{ t: 'Blog', h: '#/blog' }].concat(f ? [{ t: f.name, h: '#/v/' + f.slug }] : [], [{ t: b ? b.title : m[1] }]), cross: true };
        }
        if ((m = h.match(/^#\/([^/]+)\/([^/]+)$/)) && this._reg(m[1])) {
            const r = this._reg(m[1]), ty = r.types.find(t => t.id === m[2]), f = this._famOf(m[1]);
            const items = f ? [V, FH(f), SEC(f, 'araclar', 'Config araçları')] : [{ t: 'Tüm araçlar', h: '#/araclar' }];
            if (f && f.reg.length > 1) items.push(SEC(f, 'araclar', r.label, '?p=' + m[1]));
            else if (!f) items.push({ t: r.label, h: '#/araclar?p=' + m[1] });
            items.push({ t: ty ? ty.label : m[2] });
            return { items, fam: f && f.slug, sec: 'araclar', work: true };
        }
        return { items: [] };
    },

    update() {
        const M = this._model();
        this._paintCrumb(M.items);
        // Sol menü: vendoru belli her sayfa (hub, bölümler, araç, lab, yol, komut, senaryo, arena); çapraz "Tüm …" görünümlerinde yok
        const side = !!M.fam && !M.cross;
        document.body.classList.toggle('cg-has-bc', !!(M.items && M.items.length >= 2));
        // Lab terminali: 1280–1439'da sol menü yerine menü düğmesi (form/terminal genişliği korunur)
        document.body.classList.toggle('cg-side-narrow', !!(side && M.labRun));
        if (this._side) {
            this._side.hidden = !side;
            document.body.classList.toggle('cg-has-side', !!side);
            // Aynı hash'te birkaç kez çağrılır (hashchange, URL eşitleme, gözlemci, veri yükleme):
            // yalnız çıktı değiştiyse DOM'a yazılır; ağaç kaydırma konumu ve odak korunur.
            if (side) { const t = this._tree(M.fam, M.sec); if (t !== this._lastTree) { this._side.innerHTML = t; this._lastTree = t; } this._fit(); }
            else this._lastTree = null;
        }
        this._ctx = M;
    },

    // Sol menü ekrana (üst çubuk 76 + alt pay) sığıyorsa yapışkan; sığmıyorsa sayfayla akar (iç kaydırma alanı yok, son öğe hep ulaşılabilir)
    _fit() {
        const s = this._side; if (!s || s.hidden) return;
        s.classList.toggle('is-sticky', s.scrollHeight <= window.innerHeight - 76 - 80);   // 80: sayfa sonunda alt dolgu + altbilgi; yapışkanken üst çubuğun altına girmesin
    },

    _paintCrumb(items) {
        const el = this._crumb; if (!el) return;
        if (!items || items.length < 2) { el.hidden = true; el.innerHTML = ''; this._lastCrumb = ''; return; }
        el.hidden = false;
        const html = '<ol>' + items.map((it, i) => {
            const last = i === items.length - 1;
            return '<li>' + (last || !it.h ? '<span' + (last ? ' aria-current="page"' : '') + '>' + this._esc(it.t) + '</span>' : '<a href="' + it.h + '">' + this._esc(it.t) + '</a>') + '</li>';
        }).join('') + '</ol>';
        if (html !== this._lastCrumb) { el.innerHTML = html; this._lastCrumb = html; }
    },

    // Vendor ağacı; açık aile bölümleriyle. İçeriği olmayan bölüm soluk "henüz yok"
    _tree(openSlug, sec, noStart) {
        const E = s => this._esc(s), FAM = typeof CG_FAMILIES !== 'undefined' ? CG_FAMILIES : [];
        const here = (location.hash || '').split('?')[0];
        const n = v => v === null || v === undefined ? '' : '<span class="cg-side-n">' + Number(v).toLocaleString('tr-TR') + '</span>';
        const link = (href, label, count, on, icon) => '<a href="' + href + '"' + (on ? ' class="on"' : '') + (href === here ? ' aria-current="page"' : '') + '>' + (icon ? '<i class="' + icon + '" aria-hidden="true"></i>' : '') + '<span>' + E(label) + '</span>' + n(count) + '</a>';
        const off = label => '<span class="cg-side-off" aria-disabled="true"><span>' + E(label) + '</span><span class="cg-side-n">henüz yok</span></span>';
        let html = '<h2 class="cg-side-h">Vendorlar</h2>';
        FAM.forEach(f => {
            const c = typeof cgFamilyCounts === 'function' ? cgFamilyCounts(f.slug) : {};
            const open = f.slug === openSlug;
            html += '<a href="#/v/' + f.slug + '"' + (open ? ' class="is-open' + (sec === 'hub' ? ' on' : '') + '"' : '') + ('#/v/' + f.slug === here ? ' aria-current="page"' : '') + '><span>' + E(f.name) + '</span>' + (open ? '' : n(c.tools)) + '</a>';
            if (!open) return;
            const b = '#/v/' + f.slug + '/';
            html += '<div class="cg-side-sub">' +
                link(b + 'araclar', 'Config araçları', c.tools, sec === 'araclar') +
                (f.lab.length ? link(b + 'lab', 'Lablar', c.labs, sec === 'lab') + link(b + 'yol', 'Öğrenme yolu', null, sec === 'yol') : off('Lablar') + off('Öğrenme yolu')) +
                link(b + 'komutlar', 'Komutlar', c.cmds, sec === 'komutlar') +
                link(b + 'sorun', 'Sorun giderme', c.scenarios, sec === 'sorun') +
                (f.arena ? link(b + 'arena', cgArenaName(f), null, sec === 'arena') : '') +
                '</div>';
        });
        // Alt bölüm: çapraz görünümler (çekmecede üst listede zaten var)
        if (!noStart) {
            const ref = this._reg('referans');
            html += '<h2 class="cg-side-h">Tüm vendorlar</h2>' + link('#/v', 'Vendor listesi', null, false, 'fas fa-building') +
                link('#/araclar', 'Tüm araçlar', null, false, 'fas fa-th-large') + link('#/lab', 'Tüm lablar', null, false, 'fas fa-flask') +
                link('#/cli', 'Tüm komutlar', null, false, 'fas fa-terminal') + link('#/troubleshoot', 'Tüm sorun giderme (belirtiye göre)', null, false, 'fas fa-stethoscope') +
                link('#/converter', 'Dönüştürücü', null, false, 'fas fa-exchange-alt') +
                (ref ? link('#/araclar?p=referans', ref.label, ref.types.length, false, 'fas fa-book') : '');
        }
        return html;
    },

    // ── Mobil çekmece ───────────────────────────────────────────────────
    openDrawer() {
        const d = this._drawer; if (!d) return;
        const M = this._ctx || this._model();
        // Sıra üst menüyle aynı: Ana Sayfa · Platform (grup) · Dönüştürücü · Rehber · Blog · İletişim
        const a = (x, sub) => '<a href="' + x.href + '"' + (this._nav === x.id ? ' class="on' + (sub ? ' cg-drawer-sub' : '') + '" aria-current="page"' : sub ? ' class="cg-drawer-sub"' : '') + '><i class="' + x.icon + '" aria-hidden="true"></i><span>' + this._esc(x.label) + '</span></a>';
        const top = this.NAV.filter(x => x.top);
        d.querySelector('.cg-drawer-nav').innerHTML = a(top[0]) + '<div class="cg-drawer-grp">Platform</div>' + this.NAV.filter(x => !x.top).map(x => a(x, true)).join('') + top.slice(1).map(x => a(x)).join('');
        d.querySelector('.cg-drawer-tree').innerHTML = this._tree(M.fam, M.sec, true);
        d.hidden = false;
        document.body.classList.add('cg-drawer-open');
        this._menuBtn && this._menuBtn.setAttribute('aria-expanded', 'true');
        const first = d.querySelector('.cg-drawer-close'); if (first) first.focus();
    },
    closeDrawer(noFocus) {
        const d = this._drawer; if (!d || d.hidden) return;
        d.hidden = true;
        document.body.classList.remove('cg-drawer-open');
        if (this._menuBtn) { this._menuBtn.setAttribute('aria-expanded', 'false'); if (!noFocus) this._menuBtn.focus(); }
    },
};
if (typeof window !== 'undefined') window.CgShell = CgShell;
