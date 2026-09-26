'use strict';
// ─── Komut paleti (UI A6): Ctrl K / ⌘K her yerde, '/' sayfada kendi araması yoksa ───
// Dizin: config araçları (CG_REGISTRY), vendor aileleri ve bölümleri, üst bölümler anında;
// lablar, öğrenme yolları, komutlar ve sorun giderme senaryoları ilk açılışta tembel yüklenir (CgLab/CgCli/CgTroubleshoot yükleyicileri).
// Yalnız okur; gezinme location.hash ile. Erişilebilirlik: role=dialog + aria-modal, combobox + listbox, odak tuzağı, Esc kapatır.
const CgPalette = {
    KIND: {
        page: 'Bölüm', vendor: 'Vendor', tool: 'Config aracı', path: 'Öğrenme yolu', lab: 'Lab', cmd: 'Komut', scen: 'Sorun giderme',
    },
    // Grup başlıkları ve grup başına en çok sonuç
    GROUPS: [['vendor', 'Vendorlar', 4], ['page', 'Bölümler', 4], ['tool', 'Config araçları', 8], ['path', 'Öğrenme yolları', 3], ['lab', 'Lablar', 6], ['scen', 'Sorun giderme senaryoları', 5], ['cmd', 'Komutlar', 6]],
    W: { vendor: 30, page: 18, tool: 10, path: 8, lab: 6, scen: 4, cmd: 0 },
    PAGES: [
        ['Vendorlar', '#/v', 'vendor seç aileler'], ['Tüm araçlar', '#/araclar', 'config araçları generator şablon'], ['Komut kütüphanesi', '#/cli', 'komutlar cli show'],
        ['CLI Laboratuvarı', '#/lab', 'lab laboratuvar terminal simülatör'], ['iRule Arenası', '#/arena', 'f5 irule oyun bulmaca waf'],
        ['Sorun giderme sihirbazı', '#/troubleshoot', 'troubleshoot arıza teşhis'], ['Config dönüştürücü', '#/converter', 'converter çevir taşı migrasyon'],
    ],

    init() {
        if (this._init || typeof document === 'undefined') return;
        this._init = true;
        this._dlg = document.getElementById('cg-pal');
        this._in = document.getElementById('cg-pal-q');
        this._list = document.getElementById('cg-pal-list');
        this._stat = document.getElementById('cg-pal-stat');
        if (!this._dlg || !this._in || !this._list) return;
        document.querySelectorAll('[data-pal-open]').forEach(b => b.addEventListener('click', () => this.open(b)));
        this._dlg.addEventListener('click', e => { if (e.target.closest('[data-pal-close]')) this.close(); });
        this._in.addEventListener('input', () => { this._act = 0; this._paint(); });
        this._in.addEventListener('keydown', e => this._key(e));
        this._list.addEventListener('mousemove', e => { const o = e.target.closest('[role="option"]'); if (o && +o.dataset.i !== this._act) this._setAct(+o.dataset.i, false); });
        this._list.addEventListener('click', e => { const o = e.target.closest('[role="option"]'); if (o) this._go(this._res[+o.dataset.i]); });
        // Genel kısayollar
        document.addEventListener('keydown', e => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault(); if (this.isOpen()) this.close(); else this.open(); return;
            }
            if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || this.isOpen()) return;
            const t = e.target;
            if (t && t.closest && t.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
            if (document.getElementById('cg-home-q')) return;   // araç listesi: '/' kendi arama kutusuna gider (ConfigGenerator._bindSlash)
            const cli = document.getElementById('cg-cli-q');     // komut kütüphanesi: '/' ipucu sayfa aramasını gösteriyor
            e.preventDefault();
            if (cli) { cli.focus(); cli.select(); return; }
            this.open();
        });
        // Odak tuzağı ve Esc: palet açıkken belge düzeyinde (capture), sayfanın kendi Esc'i (araçtan listeye dönüş) çalışmasın
        document.addEventListener('keydown', e => {
            if (!this.isOpen()) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.close(); return; }
            if (e.key !== 'Tab') return;
            const f = [...this._dlg.querySelectorAll('input, button:not([disabled]), a[href]')].filter(x => x.offsetParent !== null);
            if (!f.length) return;
            const a = document.activeElement, i = f.indexOf(a);
            if (i < 0) { e.preventDefault(); f[0].focus(); return; }
            if (e.shiftKey && i === 0) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
        }, true);
        window.addEventListener('hashchange', () => { if (this.isOpen()) this.close(true); });
    },

    isOpen() { return !!(this._dlg && !this._dlg.hidden); },

    open(from) {
        if (!this._dlg) return;
        // Dönüş odağı çekmece kapanmadan alınır; çekmece açıktıysa menü düğmesine döner (gizli bağlantıya değil)
        const drawer = document.body.classList.contains('cg-drawer-open');
        this._ret = from || (drawer ? document.getElementById('cg-menu-btn') : document.activeElement);
        if (typeof CgShell !== 'undefined' && CgShell.closeDrawer) CgShell.closeDrawer(true);
        this._dlg.hidden = false;
        document.body.classList.add('cg-pal-open');
        document.querySelectorAll('[data-pal-open]').forEach(b => b.setAttribute('aria-expanded', 'true'));
        this._in.value = ''; this._act = 0;
        this._build();
        this._paint();
        this._in.focus();
        this._lazy();
    },
    close(noFocus) {
        if (!this.isOpen()) return;
        this._dlg.hidden = true;
        document.body.classList.remove('cg-pal-open');
        document.querySelectorAll('[data-pal-open]').forEach(b => b.setAttribute('aria-expanded', 'false'));
        let r = this._ret; this._ret = null;
        if (noFocus) return;
        const vis = el => el && el.isConnected && el.offsetParent !== null && el !== document.body;
        if (!vis(r)) r = [document.getElementById('cg-menu-btn'), document.querySelector('[data-pal-open]')].find(vis) || null;
        if (r && r.focus) r.focus();
    },

    // ── Dizin ────────────────────────────────────────────────────────────
    _norm(s) {
        return String(s || '').toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
    },
    _item(kind, t, sub, href, keys, extra) {
        return Object.assign({ kind, t, sub: sub || '', href, n: this._norm(t), k: this._norm((sub || '') + ' ' + (keys || '')) }, extra || {});
    },
    _build() {
        const items = [];
        this.PAGES.forEach(([t, h, k]) => items.push(this._item('page', t, '', h, k)));
        const FAM = typeof CG_FAMILIES !== 'undefined' ? CG_FAMILIES : [];
        const REG = typeof CG_REGISTRY !== 'undefined' ? CG_REGISTRY : {};
        FAM.forEach(f => {
            const plats = f.reg.map(r => REG[r] && REG[r].label).filter(Boolean).join(', ');
            items.push(this._item('vendor', f.name, plats, '#/v/' + f.slug, f.slug + ' ' + f.reg.join(' ')));
            const sec = [['Config araçları', 'araclar', 1], ['Lablar', 'lab', f.lab.length], ['Komutlar', 'komutlar', f.cli.length], ['Sorun giderme', 'sorun', 1]];
            sec.forEach(([l, s, ok]) => { if (ok) items.push(this._item('page', f.name + ' · ' + l, 'Vendor bölümü', '#/v/' + f.slug + '/' + s, f.slug)); });
        });
        const CAT = {}; (typeof CG_CATEGORIES !== 'undefined' ? CG_CATEGORIES : []).forEach(c => { CAT[c.id] = c.label; });
        Object.keys(REG).forEach(r => (REG[r].types || []).forEach(ty => {
            items.push(this._item('tool', ty.label, REG[r].label, '#/' + r + '/' + ty.id, (CAT[ty.cat] || '') + ' ' + r + ' ' + ty.id));
        }));
        this._base = items;
        this._more = this._more || null;
        this._idx = items.concat(this._more || []);
    },
    // Tembel katman: lablar/yollar (CgLab), komutlar ve senaryolar (CgTroubleshoot → CgCli verisi)
    _lazy() {
        if (this._more || this._loading) return;
        const jobs = [];
        if (typeof CgTroubleshoot !== 'undefined' && typeof CgCli !== 'undefined') jobs.push(CgTroubleshoot._loadAll());
        if (typeof CgLab !== 'undefined' && typeof CgCli !== 'undefined') jobs.push(CgLab._loadAll());
        if (!jobs.length) return;
        this._loading = true; this._status();
        Promise.allSettled(jobs).then(() => {
            this._loading = false;
            this._more = this._lazyItems();
            this._idx = (this._base || []).concat(this._more);
            this._status();
            if (this.isOpen()) this._paint();
        });
    },
    _lazyItems() {
        const out = [];
        const LV = typeof CgLab !== 'undefined' ? CgLab.VENDORS : {};
        (window.CG_LAB_PATHS || []).forEach(p => { if (LV[p.vendor]) out.push(this._item('path', p.title, LV[p.vendor].name, '#/lab/path/' + p.id, p.desc)); });
        (window.CG_LABS || []).forEach(l => {
            if (!LV[l.vendor]) return;
            // Sürümlü klonlar (lab.fos, ör. FortiOS 7.6) katalogdaki gibi rozetle ayrışır; "7.6" yazınca da bulunur
            out.push(this._item('lab', l.title, LV[l.vendor].name + ' · ' + (l.sandbox ? 'serbest terminal' : l.id.toUpperCase()), '#/lab/' + l.id, l.id + ' ' + l.vendor + ' ' + (l.cert || '') + (l.fos ? ' fortios ' + l.fos : ''), l.fos ? { ver: l.fos } : null));
        });
        const TS = typeof CgTroubleshoot !== 'undefined' && CgTroubleshoot._list ? CgTroubleshoot._list : [];
        TS.forEach(x => out.push(this._item('scen', x.s.title, x.vname, '#/troubleshoot/' + x.vendor + '/' + x.n, x.s.symptom)));
        const D = window.CG_CLI_DATA || {};
        (window.CG_CLI_INDEX || []).forEach(v => ((D[v.key] || {}).commands || []).forEach(c => {
            out.push(this._item('cmd', c.code, v.name + ' · ' + c.cat, '#/cli/' + v.key, c.desc, { cli: v.key, code: c.code, mono: true }));
        }));
        return out;
    },
    _status() {
        if (!this._stat) return;
        this._stat.textContent = this._loading ? 'Lablar, komutlar ve senaryolar yükleniyor…' : '';
    },

    // ── Arama ────────────────────────────────────────────────────────────
    _search(q) {
        const toks = this._norm(q).split(/\s+/).filter(Boolean);
        if (!toks.length) return this._idx.filter(x => x.kind === 'vendor' || (x.kind === 'page' && !x.sub)).map(x => ({ x, s: this.W[x.kind] }));
        const res = [];
        for (const x of this._idx) {
            let s = 0, ok = true;
            for (const t of toks) {
                // 1–2 harfli terim (ör. "ha", "l2") sözcük ortasında eşleşmez: yalnız başta ya da sözcük başında
                // Tam sözcük ("HA kümesi") sözcük başı önekten ("hazırlık") çok önde
                if (t.length <= 2) {
                    const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    const whole = new RegExp('(^|[^a-z0-9])' + esc + '($|[^a-z0-9])'), pre = new RegExp('(^|[^a-z0-9])' + esc);
                    if (whole.test(x.n)) s += x.n.startsWith(t) ? 40 : 30; else if (pre.test(x.n)) s += 6; else if (whole.test(x.k)) s += 4; else if (pre.test(x.k)) s += 1; else { ok = false; break; }
                    continue;
                }
                if (x.n.startsWith(t)) s += 30;
                else if (x.n.includes(' ' + t) || x.n.includes('-' + t) || x.n.includes('/' + t)) s += 20;
                else if (x.n.includes(t)) s += 10;
                else if (x.k.includes(t)) s += 4;
                else { ok = false; break; }
            }
            if (!ok) continue;
            if (x.n === toks.join(' ')) s += 25;
            res.push({ x, s: s + this.W[x.kind] - Math.min(x.n.length, 60) / 20 });
        }
        return res.sort((a, b) => b.s - a.s);
    },
    _paint() {
        const q = this._in.value.trim(), E = s => (typeof cgEsc === 'function' ? cgEsc(s) : String(s));
        const hits = this._search(q);
        // Gruplar: her grupta en iyi N; gruplar en iyi sonuçlarına göre sıralı
        const G = this.GROUPS.map(([k, l, n]) => ({ k, l, list: hits.filter(h => h.x.kind === k).slice(0, q ? n : 12) })).filter(g => g.list.length);
        if (q) G.sort((a, b) => b.list[0].s - a.list[0].s);
        this._res = [].concat(...G.map(g => g.list.map(h => h.x)));
        if (this._act >= this._res.length) this._act = 0;
        let i = 0;
        const hl = t => {   // eşleşen ilk terimi vurgula (yalnız görünür metinde)
            const toks = this._norm(q).split(/\s+/).filter(Boolean); if (!toks.length) return E(t);
            const n = this._norm(t); let best = -1, len = 0;
            toks.forEach(k => { const p = n.indexOf(k); if (p >= 0 && (best < 0 || p < best)) { best = p; len = k.length; } });
            return best < 0 || n.length !== t.length ? E(t) : E(t.slice(0, best)) + '<mark>' + E(t.slice(best, best + len)) + '</mark>' + E(t.slice(best + len));
        };
        this._in.setAttribute('aria-expanded', String(!!this._res.length));
        if (this._stat && !this._loading) this._stat.textContent = q ? (this._res.length ? this._res.length + ' sonuç' : '') : '';
        if (!this._res.length) {
            this._in.removeAttribute('aria-activedescendant');
            const qe = E(q), enc = encodeURIComponent(q);
            this._list.innerHTML = `<li class="cg-pal-empty" role="presentation"><p><b>“${qe}”</b> için sonuç yok${this._loading ? ' (lablar ve komutlar hâlâ yükleniyor)' : ''}.</p>
                <p>Daha kısa ya da farklı bir terim deneyin (ör. <i>vlan</i>, <i>bgp</i>, <i>ipsec</i>, <i>fgt-03</i>). Ayrıca:</p>
                <p class="cg-pal-sug"><a href="#/araclar?q=${enc}">Tüm araçlarda ara</a><a href="#/v">Vendor seç</a><a href="#/troubleshoot">Sorun giderme sihirbazı</a></p></li>`;
            this._live(q ? 'Sonuç yok' : '');
            return;
        }
        this._list.innerHTML = G.map(g => `<li role="presentation" class="cg-pal-g"><div class="cg-pal-gh" id="cg-pal-g-${g.k}" role="presentation">${g.l}</div>
            <ul role="group" aria-labelledby="cg-pal-g-${g.k}">${g.list.map(h => {
                const x = h.x, n = i++;
                return `<li role="option" id="cg-pal-o${n}" data-i="${n}" aria-selected="${n === this._act}" class="cg-pal-o${n === this._act ? ' is-act' : ''}">
                    <span class="cg-pal-t${x.mono ? ' is-mono' : ''}">${hl(x.t)}</span>${x.ver ? `<span class="cg-pal-ver" title="FortiOS ${E(x.ver)}">${E(x.ver)}</span>` : ''}${x.sub ? `<span class="cg-pal-s">${E(x.sub)}</span>` : ''}<span class="cg-pal-k">${this.KIND[x.kind]}</span></li>`;
            }).join('')}</ul></li>`).join('');
        this._setAct(this._act, false);
        this._live(q ? this._res.length + ' sonuç' : '');
    },
    _live(msg) { const el = document.getElementById('cg-pal-live'); if (el && el.textContent !== msg) el.textContent = msg; },
    _setAct(i, scroll) {
        const n = this._res.length; if (!n) return;
        this._act = (i + n) % n;
        this._list.querySelectorAll('[role="option"]').forEach(o => { const on = +o.dataset.i === this._act; o.classList.toggle('is-act', on); o.setAttribute('aria-selected', on); });
        this._in.setAttribute('aria-activedescendant', 'cg-pal-o' + this._act);
        if (scroll !== false) { const o = document.getElementById('cg-pal-o' + this._act); if (o) o.scrollIntoView({ block: 'nearest' }); }
    },
    _key(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._setAct(this._act + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); this._setAct(this._act - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); const x = this._res && this._res[this._act]; if (x) this._go(x); }
    },
    _go(x) {
        if (!x) return;
        // Komut: kütüphanede o komutla aranmış olarak açılır
        if (x.kind === 'cmd' && typeof CgCli !== 'undefined') { CgCli._q = x.code; CgCli._cat = 'all'; CgCli._sev = 'all'; }
        this.close(true);
        if (location.hash === x.href && typeof ConfigGenerator !== 'undefined') ConfigGenerator._route();
        else location.hash = x.href;
        const m = document.getElementById('cg-content'); if (m) m.focus({ preventScroll: true });
    },
};
if (typeof window !== 'undefined') {
    window.CgPalette = CgPalette;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => CgPalette.init()); else CgPalette.init();
}
