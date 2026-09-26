'use strict';
// ─── İçerik sayfaları (S11b): Rehber (#/rehber), Blog (#/blog, #/blog/<slug>), İletişim (#/iletisim) ───
// Sayılar render anında küçük dizinlerden (labs/index.js, ts/index.js) gelir; sabit sayı yazılmaz.
// Blog: liste yalnız assets/data/blog/index.js'i, yazı sayfası ayrıca <slug>.js'i CgCli._load ile tembel yükler (CG_ASSET_V damgası).
// Yazı gövdesinde p/list/note içinde yalnız <b>, <code>, <a href="#/…|https://…"> geçer; diğer her şey kaçışlanır. code blokları textContent.
const CgPages = {
    REPO: 'https://github.com/altanmelihhh-web/Config_Generator',
    ICON: {
        git: '<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10a6 6 0 0 1-6 6H8"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
        user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
        vendor: '<path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/>',
    },

    // ── Yardımcılar ─────────────────────────────────────────────────────
    _esc(s) { return typeof cgEsc === 'function' ? cgEsc(s) : String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    _n(n) { return Number(n).toLocaleString('tr-TR'); },
    _ico(k) {
        const H = typeof CgHub !== 'undefined' ? CgHub.ICON : {};
        return '<svg class="cg-pg-i" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (this.ICON[k] || H[k] || '') + '</svg>';
    },
    _load(src) { return typeof CgCli !== 'undefined' ? CgCli._load(src) : Promise.reject(new Error('CgCli yok')); },
    _fam(slug) { return slug && typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[slug] || null : null; },
    _famOf(v) { return typeof cgFamilyOf === 'function' ? cgFamilyOf(v) : null; },
    _stamp(root) { const t = String(Date.now()) + Math.random().toString(36).slice(2, 6); root.dataset.cgPage = t; return t; },
    _alive(root, t) { return root.isConnected && root.dataset.cgPage === t; },
    _date(d) {
        const x = new Date(d + 'T00:00:00Z');
        return isNaN(x) ? this._esc(d) : x.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
    },
    // Güvenli satır içi HTML: önce hepsi kaçışlanır, sonra yalnız dengeli <b>, <code> ve güvenli adresli <a href> geri açılır
    _safeHref(u) { return /^#\/[A-Za-z0-9\-_/?=&.%]*$/.test(u) || /^https:\/\/[^\s"'<>`]+$/.test(u); },
    _inline(s) {
        let x = this._esc(s);
        ['b', 'code'].forEach(t => {
            const o = (x.match(new RegExp('&lt;' + t + '&gt;', 'g')) || []).length, c = (x.match(new RegExp('&lt;/' + t + '&gt;', 'g')) || []).length;
            if (o && o === c) x = x.split('&lt;' + t + '&gt;').join('<' + t + '>').split('&lt;/' + t + '&gt;').join('</' + t + '>');
        });
        const ao = x.match(/&lt;a href=&quot;([^&]*(?:&amp;[^&]*)*)&quot;&gt;/g) || [], ac = (x.match(/&lt;\/a&gt;/g) || []).length;
        if (ao.length && ao.length === ac) {
            x = x.replace(/&lt;a href=&quot;((?:(?!&quot;).)*)&quot;&gt;((?:(?!&lt;\/a&gt;).)*)&lt;\/a&gt;/g, (all, href, txt) => {
                const u = href.replace(/&amp;/g, '&');
                if (!this._safeHref(u)) return all;
                const ext = u.startsWith('https://');
                return '<a href="' + this._esc(u) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + txt + '</a>';
            });
        }
        return x;
    },

    render(root, page, arg) {
        if (page === 'rehber') return this._rehber(root);
        if (page === 'iletisim') return this._iletisim(root);
        if (page === 'blog') return arg ? this._post(root, arg) : this._blog(root);
    },

    // ── Rehber ──────────────────────────────────────────────────────────
    _rehber(root) {
        document.title = 'Rehber · Config Generator';
        root.innerHTML = `<div class="cg-pg">
            <header class="cg-pg-head">
                <h1 class="cg-pg-h1">Rehber</h1>
                <p class="cg-pg-lead">Nereden başlayacağınızı, hangi vendorda hangi öğrenme yolunun olduğunu ve arıza anında nereye bakacağınızı tek sayfada toplar.</p>
            </header>
            <section class="cg-pg-sec" aria-labelledby="cg-pg-start">
                <h2 class="cg-pg-h2" id="cg-pg-start">Nereden başlamalı</h2>
                <ol class="cg-pg-steps">
                    <li><span class="cg-pg-sn" aria-hidden="true">1</span><div><h3 class="cg-pg-h3">Vendorunuzu seçin</h3><p>Her vendorun sayfasında config araçları, lablar, komutlar ve sorun giderme bir arada.</p><a class="cg-pg-link" href="#/v">Vendor listesi ${this._ico('arrow')}</a></div></li>
                    <li><span class="cg-pg-sn" aria-hidden="true">2</span><div><h3 class="cg-pg-h3">İlk labı açın</h3><p>Tarayıcıdaki terminalde görevi okuyun, komutu yazın; sonuç cihaz durumuna göre kontrol edilir. Cisco yolu CLI temelleriyle başlar.</p><a class="cg-pg-link" href="#/lab/path/cisco-swrt" data-pg-first>Cisco yolunun ilk labı ${this._ico('arrow')}</a></div></li>
                    <li><span class="cg-pg-sn" aria-hidden="true">3</span><div><h3 class="cg-pg-h3">Belirtiden teşhise gidin</h3><p>Sahada bir arızayla karşılaşınca belirtiyi seçin; kontrol komutları sırayla gelir.</p><a class="cg-pg-link" href="#/troubleshoot">Sorun giderme ${this._ico('arrow')}</a></div></li>
                </ol>
            </section>
            <section class="cg-pg-sec" aria-labelledby="cg-pg-paths">
                <h2 class="cg-pg-h2" id="cg-pg-paths">Öğrenme yolları</h2>
                <p class="cg-pg-sp">Sıralı modüller; her modülde tarayıcıda çalışan lablar var.</p>
                <div data-pg-paths>${this._pathsHtml()}</div>
            </section>
            <section class="cg-pg-sec" aria-labelledby="cg-pg-ts">
                <h2 class="cg-pg-h2" id="cg-pg-ts">Belirtiye göre sorun giderme</h2>
                <p class="cg-pg-sp">Konuyu seçin; tüm vendorların senaryoları belirtiden başlayarak listelenir.</p>
                <div data-pg-ts>${this._topicsHtml()}</div>
            </section>
        </div>`;
        const tok = this._stamp(root);
        const paint = () => {
            if (!this._alive(root, tok)) return;
            const set = (sel, html) => { const el = root.querySelector(sel); if (el && el.innerHTML !== html && !el.contains(document.activeElement)) el.innerHTML = html; };
            set('[data-pg-paths]', this._pathsHtml());
            set('[data-pg-ts]', this._topicsHtml());
            const first = this._firstLab(), a = root.querySelector('[data-pg-first]');
            if (first && a) a.setAttribute('href', '#/lab/' + first);
        };
        this._load('assets/data/labs/index.js').then(paint, () => {});
        this._load('assets/data/ts/index.js').then(paint, () => {});
        this._load('assets/data/labs/paths.js').then(paint, () => {});   // yalnız ilk lab kimliği için (~18 KB)
    },
    // Cisco yolunun ilk labı (yol tanımından; yüklenmemişse null → yol sayfası bağlantısı kalır)
    _firstLab() {
        const p = (window.CG_LAB_PATHS || []).find(x => x.vendor === 'cisco-ios');
        const m = p && (p.modules || []).find(x => x && Array.isArray(x.labs) && x.labs.length);
        return m ? m.labs[0] : null;
    },
    _pathsHtml() {
        const ix = window.CG_LAB_INDEX;
        if (!ix) return '<p class="cg-pg-sp" role="status">Öğrenme yolları yükleniyor…</p>';
        const E = v => this._esc(v);
        return `<ul class="cg-pg-cards" role="list">${ix.paths.map(p => {
            const f = this._famOf(p.vendor), labs = p.modules.reduce((a, m) => a + (m.n || 0), 0);
            return `<li><a class="cg-pg-card" href="#/lab/path/${E(p.id)}">
                <span class="cg-pg-ct">${E(p.title)}</span>
                <span class="cg-pg-cm">${f ? `<span class="cg-pg-tag">${E(f.name)}</span>` : ''}<span>${this._n(p.modules.length)} modül · ${this._n(labs)} lab</span></span>
            </a></li>`;
        }).join('')}</ul>`;
    },
    _topicsHtml() {
        const TS = typeof CgTroubleshoot !== 'undefined' ? CgTroubleshoot : null, ix = window.CG_TS_INDEX;
        if (!TS) return '<p class="cg-pg-sp"><a class="cg-pg-link" href="#/troubleshoot">Sorun giderme sihirbazı</a></p>';
        const cnt = ix && ix.topics ? ix.topics : null;
        const T = TS.TOPICS.filter(t => !cnt || cnt[t.id]);
        return `<ul class="cg-pg-chips" role="list">${T.map(t => `<li><a class="cg-pg-chip" href="#/troubleshoot/${this._esc(t.id)}"><i class="${this._esc(t.icon)}" aria-hidden="true"></i><span>${this._esc(t.label)}</span>${cnt ? `<span class="cg-pg-n">${this._n(cnt[t.id])}</span>` : ''}</a></li>`).join('')}</ul>
            <p class="cg-pg-sp"><a class="cg-pg-link" href="#/troubleshoot">Tüm konular${ix && ix.total ? ' · ' + this._n(ix.total) + ' senaryo' : ''} ${this._ico('arrow')}</a></p>`;
    },

    // ── Blog listesi ────────────────────────────────────────────────────
    _blog(root) {
        document.title = 'Blog · Config Generator';
        root.innerHTML = `<div class="cg-pg">
            <header class="cg-pg-head">
                <h1 class="cg-pg-h1">Blog</h1>
                <p class="cg-pg-lead">Sahadan konular: sürüm geçişleri, güvenlik açıkları ve sık yapılan hatalar. Her yazı kaynaklarıyla ve ilgili lablarla birlikte.</p>
            </header>
            <div data-pg-blog><p class="cg-pg-sp" role="status">Yazılar yükleniyor…</p></div>
        </div>`;
        const tok = this._stamp(root);
        const host = root.querySelector('[data-pg-blog]');
        this._load('assets/data/blog/index.js').then(() => {
            if (!this._alive(root, tok)) return;
            const L = (window.CG_BLOG_INDEX || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
            host.innerHTML = L.length ? `<ul class="cg-pg-posts" role="list">${L.map(b => this._postCard(b)).join('')}</ul>` : '<p class="cg-pg-sp">Henüz yazı yok.</p>';
        }, () => { if (this._alive(root, tok)) host.innerHTML = '<p class="cg-pg-sp" role="alert">Yazı listesi yüklenemedi.</p>'; });
    },
    _meta(b) {
        const f = this._fam(b.vendor);
        return `<span class="cg-pg-meta"><time datetime="${this._esc(b.date)}">${this._date(b.date)}</time>${b.readMin ? `<span>${this._n(b.readMin)} dk okuma</span>` : ''}${f ? `<span class="cg-pg-tag">${this._esc(f.name)}</span>` : ''}</span>`;
    },
    _postCard(b) {
        const E = v => this._esc(v);
        return `<li><article class="cg-pg-post">
            <h2 class="cg-pg-pt"><a href="#/blog/${E(b.slug)}">${E(b.title)}</a></h2>
            ${this._meta(b)}
            <p class="cg-pg-ps">${E(b.summary)}</p>
            ${b.tags && b.tags.length ? `<ul class="cg-pg-tags" role="list" aria-label="Etiketler">${b.tags.map(t => `<li>${E(t)}</li>`).join('')}</ul>` : ''}
        </article></li>`;
    },

    // ── Blog yazısı ─────────────────────────────────────────────────────
    _post(root, slug) {
        const E = v => this._esc(v);
        const ix = (window.CG_BLOG_INDEX || []).find(x => x.slug === slug);
        document.title = (ix ? ix.title + ' · ' : '') + 'Blog · Config Generator';
        root.innerHTML = `<div class="cg-pg cg-pg-narrow"><article class="cg-pg-art" data-pg-art>
            <h1 class="cg-pg-h1">${ix ? E(ix.title) : 'Blog yazısı'}</h1>
            <p class="cg-pg-sp" role="status">Yazı yükleniyor…</p>
        </article></div>`;
        const tok = this._stamp(root);
        const fail = msg => {
            if (!this._alive(root, tok)) return;
            root.querySelector('[data-pg-art]').innerHTML = `<h1 class="cg-pg-h1">Yazı bulunamadı</h1><p class="cg-pg-sp" role="alert">${E(msg)}</p><p><a class="cg-pg-link" href="#/blog">Tüm yazılar ${this._ico('arrow')}</a></p>`;
            document.title = 'Yazı bulunamadı · Blog · Config Generator';
        };
        if (!/^[a-z0-9-]+$/.test(slug)) { fail('Bu adreste bir yazı yok.'); return; }
        this._load('assets/data/blog/index.js').then(() => {
            if (!this._alive(root, tok)) return;
            if (!(window.CG_BLOG_INDEX || []).some(x => x.slug === slug)) { fail('Bu adreste bir yazı yok.'); return; }
            return this._load('assets/data/blog/' + slug + '.js').then(() => {
                if (!this._alive(root, tok)) return;
                const b = (window.CG_BLOG || []).find(x => x.slug === slug);
                if (!b) { fail('Yazı verisi okunamadı.'); return; }
                document.title = b.title + ' · Blog · Config Generator';
                const art = root.querySelector('[data-pg-art]');
                art.innerHTML = this._postHtml(b);
                // code blokları: yalnız textContent (HTML olarak yorumlanmaz)
                art.querySelectorAll('pre[data-pg-code]').forEach(pre => { pre.querySelector('code').textContent = b.body[+pre.dataset.pgCode].code; });
                // Kırıntı yazı başlığını CG_BLOG'dan okur
                if (typeof CgShell !== 'undefined') CgShell.update();
            });
        }).catch(() => fail('Yazı yüklenemedi.'));
    },
    _postHtml(b) {
        const E = v => this._esc(v);
        const body = (b.body || []).map((x, i) => {
            if (x.h) return `<h2 class="cg-pg-bh">${E(x.h)}</h2>`;
            if (x.p) return `<p>${this._inline(x.p)}</p>`;
            if (x.code !== undefined) return `<pre class="cg-pg-code" data-pg-code="${i}" tabindex="0"${x.lang ? ` aria-label="Kod: ${E(x.lang)}"` : ''}><code></code></pre>`;
            if (x.list) return `<ul class="cg-pg-ul">${x.list.map(li => `<li>${this._inline(li)}</li>`).join('')}</ul>`;
            if (x.note) return `<aside class="cg-pg-note" aria-label="Not"><p>${this._inline(x.note)}</p></aside>`;
            return '';
        }).join('');
        const src = (b.sources || []).filter(s => /^https:\/\//.test(s.url));
        const rel = (b.related || []).filter(r => /^#\//.test(r.href));
        return `<h1 class="cg-pg-h1">${E(b.title)}</h1>
            ${this._meta(b)}
            ${b.summary ? `<p class="cg-pg-lead">${E(b.summary)}</p>` : ''}
            <div class="cg-pg-body">${body}</div>
            ${src.length ? `<section class="cg-pg-foot" aria-labelledby="cg-pg-src"><h2 class="cg-pg-h2" id="cg-pg-src">Kaynaklar</h2><ol class="cg-pg-src">${src.map(s => `<li><a href="${E(s.url)}" target="_blank" rel="noopener">${E(s.title)}</a></li>`).join('')}</ol></section>` : ''}
            ${rel.length ? `<section class="cg-pg-foot" aria-labelledby="cg-pg-rel"><h2 class="cg-pg-h2" id="cg-pg-rel">İlgili</h2><ul class="cg-pg-rel" role="list">${rel.map(r => `<li><a href="${E(r.href)}">${E(r.label)} ${this._ico('arrow')}</a></li>`).join('')}</ul></section>` : ''}
            <p class="cg-pg-back"><a class="cg-pg-link" href="#/blog">Tüm yazılar ${this._ico('arrow')}</a></p>`;
    },

    // ── İletişim ────────────────────────────────────────────────────────
    _iletisim(root) {
        document.title = 'İletişim · Config Generator';
        root.innerHTML = `<div class="cg-pg">
            <header class="cg-pg-head">
                <h1 class="cg-pg-h1">İletişim</h1>
                <p class="cg-pg-lead">Hata bildirimi, öneri ve katkı için GitHub deposunu kullanabilirsiniz.</p>
            </header>
            <ul class="cg-pg-cards" role="list">
                <li><a class="cg-pg-card cg-pg-card-i" href="${this._esc(this.REPO)}" target="_blank" rel="noopener">
                    <span class="cg-pg-ci">${this._ico('git')}</span>
                    <span class="cg-pg-cb"><span class="cg-pg-ct">GitHub</span><span class="cg-pg-cd">Kaynak kod, hata bildirimi ve öneriler (yeni sekmede açılır).</span></span>
                </a></li>
                <li><div class="cg-pg-card cg-pg-card-i is-ph">
                    <span class="cg-pg-ci">${this._ico('mail')}</span>
                    <span class="cg-pg-cb"><span class="cg-pg-ct">E-posta</span><span class="cg-pg-cd"><span class="cg-pg-plh">[e-posta]</span></span></span>
                </div></li>
                <li><div class="cg-pg-card cg-pg-card-i is-ph">
                    <span class="cg-pg-ci">${this._ico('user')}</span>
                    <span class="cg-pg-cb"><span class="cg-pg-ct">LinkedIn</span><span class="cg-pg-cd"><span class="cg-pg-plh">[LinkedIn]</span></span></span>
                </div></li>
            </ul>
        </div>`;
    },
};

if (typeof window !== 'undefined') window.CgPages = CgPages;
