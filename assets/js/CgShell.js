'use strict';
// ─── Kabuk (UI A3): sayfa yolu (kırıntı), sol vendor ağacı (≥1280px, vendor sayfalarında), mobil menü çekmecesi ───
// Yalnız okur: hash + yüklenmiş veriler (CG_FAMILIES, CG_REGISTRY, CG_LABS, CG_CLI_INDEX, CgTroubleshoot._list, CG_ARENA_*).
// Tembel yüklenen modüller ekranı sonradan çizdiği için #config-generator-root'un doğrudan çocukları değişince kırıntı yenilenir.
const CgShell = {
    NAV: [
        { id: 'vendors', href: '#/v', icon: 'fas fa-building', label: 'Vendorlar' },
        { id: 'tools', href: '#/araclar', icon: 'fas fa-th-large', label: 'Araçlar' },
        { id: 'cli', href: '#/cli', icon: 'fas fa-terminal', label: 'Komutlar' },
        { id: 'lab', href: '#/lab', icon: 'fas fa-flask', label: 'Lab' },
        { id: 'arena', href: '#/arena', icon: 'fas fa-chess-knight', label: 'Arena' },
        { id: 'ts', href: '#/troubleshoot', icon: 'fas fa-stethoscope', label: 'Sorun Giderme' },
        { id: 'conv', href: '#/converter', icon: 'fas fa-exchange-alt', label: 'Dönüştürücü' },
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
        // Çekmece açıkken ekran menü düğmesinin eşiğini (shell.css 1279.98px) aşarsa kapat
        if (window.matchMedia) { const mq = matchMedia('(min-width: 1280px)'); const fn = () => { if (mq.matches) this.closeDrawer(true); }; mq.addEventListener ? mq.addEventListener('change', fn) : mq.addListener(fn); }
    },

    // ── Yardımcılar ─────────────────────────────────────────────────────
    _esc(s) { return typeof cgEsc === 'function' ? cgEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    _fam(slug) { return typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[slug] : null; },
    _famOf(key) { return typeof cgFamilyOf === 'function' ? cgFamilyOf(key) : null; },
    _reg(id) { return typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY[id] : null; },
    _labVendor(v) { return typeof CgLab !== 'undefined' && CgLab.VENDORS[v] ? CgLab.VENDORS[v].name : v; },
    _cliName(k) { const x = (window.CG_CLI_INDEX || []).find(v => v.key === k); return x ? x.name : k; },

    // Hash → kırıntı öğeleri [{t, h?}] ve ağaç bağlamı { fam, sec }
    _model() {
        const full = location.hash || '', qi = full.indexOf('?');
        const h = qi < 0 ? full : full.slice(0, qi), P = new URLSearchParams(qi < 0 ? '' : full.slice(qi + 1));
        const T = { t: 'Araçlar', h: '#/araclar' };
        let m;
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            return { items: [{ t: 'Vendorlar', h: '#/v' }, { t: f.name }], fam: f.slug, sec: 'hub' };
        }
        if (h === '' || h === '#/' || h === '#/araclar') {
            const r = P.get('p') && this._reg(P.get('p'));
            return { items: r ? [T, { t: r.label }] : [], fam: null };
        }
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)\/(lab|komutlar|sorun)(?:\/([a-z0-9-]+))?$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            // Hub altındaki bölüm: Vendorlar › <Aile> › <Bölüm> (plan §2.1)
            const L = { lab: 'Lablar', komutlar: 'Komutlar', sorun: 'Sorun giderme' }[m[2]];
            const items = [{ t: 'Vendorlar', h: '#/v' }, { t: f.name, h: '#/v/' + f.slug }, m[3] ? { t: L, h: '#/v/' + f.slug + '/' + m[2] } : { t: L }];
            if (m[3]) items.push({ t: this._cliName(m[3]) });
            return { items, fam: f.slug, sec: m[2] };
        }
        if ((m = h.match(/^#\/v\/([a-z0-9-]+)\/araclar$/))) {
            const f = this._fam(m[1]); if (!f) return { items: [] };
            const r = P.get('p') && f.reg.includes(P.get('p')) && this._reg(P.get('p'));
            return { items: [{ t: 'Vendorlar', h: '#/v' }, { t: f.name, h: '#/v/' + f.slug }, r ? { t: 'Config araçları', h: '#/v/' + f.slug + '/araclar' } : { t: 'Config araçları' }].concat(r ? [{ t: r.label }] : []), fam: f.slug, sec: 'araclar' };
        }
        if ((m = h.match(/^#\/lab\/path\/([a-z0-9-]+)$/))) {
            const p = (window.CG_LAB_PATHS || []).find(x => x.id === m[1]);
            const f = p && this._famOf(p.vendor);
            return { items: [{ t: 'Lab', h: '#/lab' }].concat(p ? [{ t: this._labVendor(p.vendor), h: '#/lab?v=' + p.vendor }, { t: 'Öğrenme yolu: ' + p.title }] : [{ t: 'Öğrenme yolu' }]), fam: f && f.slug, sec: 'yol' };
        }
        if ((m = h.match(/^#\/lab(?:\/([a-z0-9-]+))?$/))) {
            if (!m[1]) { const v = P.get('v'); const f = v && this._famOf(v); return { items: v ? [{ t: 'Lab', h: '#/lab' }, { t: this._labVendor(v) }] : [], fam: f && f.slug, sec: 'lab' }; }
            const l = (window.CG_LABS || []).find(x => x.id === m[1]);
            const f = l && this._famOf(l.vendor);
            // Seviye CgLab.lv ile (müfredatı levelOf'la yeniden sıralanan vendorlar, ör. FortiGate)
            const ln = l && l.level !== null && l.level !== undefined && typeof CgLab !== 'undefined' && CgLab.lv ? CgLab.lv(l) : null;
            const lvn = ln !== null && ln !== undefined ? CgLab.lvName(l.vendor, ln, l) : '';
            const lv = lvn ? 'Seviye ' + ln + ' · ' + lvn : '';
            return { items: [{ t: 'Lab', h: '#/lab' }].concat(l ? [{ t: this._labVendor(l.vendor), h: '#/lab?v=' + l.vendor }].concat(lv ? [{ t: lv }] : [], [{ t: l.title }]) : [{ t: m[1] }]), fam: f && f.slug, sec: 'lab' };
        }
        if ((m = h.match(/^#\/cli\/([a-z0-9-]+)$/))) {
            const f = this._famOf(m[1]);
            return { items: [{ t: 'Komutlar', h: '#/cli' }, { t: this._cliName(m[1]) }], fam: f && f.slug, sec: 'komutlar' };
        }
        if ((m = h.match(/^#\/troubleshoot\/([a-z0-9-]+)(?:\/(\d+))?$/))) {
            const TS = typeof CgTroubleshoot !== 'undefined' ? CgTroubleshoot : null;
            const top = TS && TS.TOPICS.find(t => t.id === m[1]);
            const base = [{ t: 'Sorun Giderme', h: '#/troubleshoot' }];
            if (m[2] === undefined) return { items: base.concat([{ t: top ? top.label : this._cliName(m[1]) }]) };
            const s = TS && TS._list && TS._list.find(x => x.vendor === m[1] && x.n === +m[2]);
            const f = this._famOf(m[1]);
            // Konu: CgTroubleshoot._loadAll ile aynı kural (önce s.topic, yoksa başlık kalıbı)
            const tp = s && TS && ((s.topic && TS.TOPICS.find(t => t.id === s.topic)) || (s.s.topic && TS.TOPICS.find(t => t.id === s.s.topic)) || TS.TOPICS.find(t => t.re.test(s.s.title)));
            return { items: base.concat(tp ? [{ t: tp.label, h: '#/troubleshoot/' + tp.id }] : [], [{ t: this._cliName(m[1]) }, { t: s ? s.s.title : 'Senaryo ' + m[2] }]), fam: f && f.slug, sec: 'sorun' };
        }
        if ((m = h.match(/^#\/arena\/(masa|meydan|waf|nobet)\/([a-z0-9-]+)$/))) {
            const [label, key] = this.ARENA[m[1]], task = (window[key] || []).find(x => x.id === m[2]);
            return { items: [{ t: 'iRule Arenası', h: '#/arena' }, { t: label }, { t: task ? task.title : m[2] }], fam: 'f5', sec: 'arena' };
        }
        if ((m = h.match(/^#\/([^/]+)\/([^/]+)$/)) && this._reg(m[1])) {
            const r = this._reg(m[1]), ty = r.types.find(t => t.id === m[2]), f = this._famOf(m[1]);
            const items = [T];
            if (f) {
                items[0] = { t: 'Vendorlar', h: '#/v' };
                items.push({ t: f.name, h: '#/v/' + f.slug }, { t: 'Config araçları', h: '#/v/' + f.slug + '/araclar' });
                if (f.reg.length > 1) items.push({ t: r.label, h: '#/v/' + f.slug + '/araclar?p=' + m[1] });
            } else items.push({ t: r.label, h: '#/araclar?p=' + m[1] });
            items.push({ t: ty ? ty.label : m[2] });
            return { items, fam: f && f.slug, sec: 'araclar', work: true };
        }
        return { items: [] };
    },

    update() {
        const M = this._model();
        this._paintCrumb(M.items);
        // Sol ağaç: vendor bağlamı olan araç sayfaları (#/v/… ve araç çalışma sayfası)
        const side = /^#\/v\/[a-z0-9-]+(\/(araclar|lab|komutlar|sorun))?(\?|\/|$)/.test(location.hash) || M.work;
        document.body.classList.toggle('cg-has-bc', !!(M.items && M.items.length >= 2));
        if (this._side) {
            this._side.hidden = !side;
            document.body.classList.toggle('cg-has-side', !!side);
            // Aynı hash'te birkaç kez çağrılır (hashchange, URL eşitleme, gözlemci, veri yükleme):
            // yalnız çıktı değiştiyse DOM'a yazılır; ağaç kaydırma konumu ve odak korunur.
            if (side) { const t = this._tree(M.fam, M.sec); if (t !== this._lastTree) { this._side.innerHTML = t; this._lastTree = t; } }
            else this._lastTree = null;
        }
        this._ctx = M;
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
        let html = noStart ? '' : '<h2 class="cg-side-h">Başlangıç</h2>' + link('#/v', 'Tüm vendorlar', null, false, 'fas fa-building') + link('#/araclar', 'Tüm araçlar', null, false, 'fas fa-th-large');
        html += '<h2 class="cg-side-h">Vendorlar</h2>';
        FAM.forEach(f => {
            const c = typeof cgFamilyCounts === 'function' ? cgFamilyCounts(f.slug) : {};
            const open = f.slug === openSlug;
            html += '<a href="#/v/' + f.slug + '"' + (open ? ' class="is-open' + (sec === 'hub' ? ' on' : '') + '"' : '') + ('#/v/' + f.slug === here ? ' aria-current="page"' : '') + '><span>' + E(f.name) + '</span>' + (open ? '' : n(c.tools)) + '</a>';
            if (!open) return;
            const b = '#/v/' + f.slug + '/';
            html += '<div class="cg-side-sub">' +
                link(b + 'araclar', 'Config araçları', c.tools, sec === 'araclar') +
                (f.lab.length ? link(b + 'lab', 'Lablar', null, sec === 'lab') + link(b + 'yol', 'Öğrenme yolu', null, sec === 'yol') : off('Lablar') + off('Öğrenme yolu')) +
                link(b + 'komutlar', 'Komutlar', c.cmds, sec === 'komutlar') +
                link(b + 'sorun', 'Sorun giderme', null, sec === 'sorun') +
                (f.arena ? link('#/arena', 'iRule Arenası', null, sec === 'arena') : '') +
                '</div>';
        });
        const ref = this._reg('referans');
        html += '<h2 class="cg-side-h">Vendor bağımsız</h2>' + link('#/converter', 'Dönüştürücü', null, false, 'fas fa-exchange-alt') +
            (ref ? link('#/araclar?p=referans', ref.label, ref.types.length, false, 'fas fa-book') : '');
        return html;
    },

    // ── Mobil çekmece ───────────────────────────────────────────────────
    openDrawer() {
        const d = this._drawer; if (!d) return;
        const M = this._ctx || this._model();
        const cur = (document.querySelector('.app-nav-tab.active') || {}).dataset || {};
        d.querySelector('.cg-drawer-nav').innerHTML = this.NAV.map(x => '<a href="' + x.href + '"' + (cur.nav === x.id ? ' class="on" aria-current="page"' : '') + '><i class="' + x.icon + '" aria-hidden="true"></i><span>' + x.label + '</span></a>').join('');
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
