'use strict';

// ─── Komutlar: çok vendorlu CLI komut kütüphanesi (#/cli, #/cli/<vendor>) ─────
// Veri: assets/data/cli/<vendor>.js (~/inventory/harness/clibuild.js ile üretilir).
// Her vendor dosyası yalnız o vendor seçildiğinde yüklenir.
const CgCli = {
    _loaded: {},
    _vendor: null,
    _cat: 'all',
    _q: '',
    _sev: 'all',
    _ver: 'all',   // FortiOS sürüm süzgeci (?ver=7.4|7.6); ver alanı olmayan komut her iki sürümde görünür

    // Sürüm rozeti (komut.ver / senaryo.fos): lab kartlarındaki cg-lab-ver diliyle aynı; CgTroubleshoot da kullanır
    verBadge(v) {
        if (v !== '7.4' && v !== '7.6') return '';
        const l = v === '7.4' ? 'yalnız 7.4' : '7.6+', t = v === '7.4' ? 'Yalnız FortiOS 7.4 (7.6\'da yok ya da değişti)' : 'FortiOS 7.6 ve sonrası';
        return `<span class="cg-lab-badge cg-lab-ver cg-ver-b${v === '7.4' ? ' cg-ver-old' : ''}" title="${t}">${l}</span>`;
    },
    // Adresteki ?ver= değeri (yalnız 7.4 / 7.6 geçerli)
    verFromHash() { const q = (location.hash.split('?')[1] || ''), m = q.match(/(?:^|&)ver=([0-9.]+)/); return m && (m[1] === '7.4' || m[1] === '7.6') ? m[1] : 'all'; },
    // Süzgeci adrese yaz (diğer sorgu parametreleri korunur); replaceState: yeniden yönlendirme ve geri yığını şişmesi yok
    verToHash(v) {
        const [p, q] = location.hash.split('?'), P = new URLSearchParams(q || '');
        if (v === 'all') P.delete('ver'); else P.set('ver', v);
        const h = p + (P.toString() ? '?' + P.toString() : '');
        if (location.hash !== h) history.replaceState(null, '', h);
    },
    verOk(v, sel) { return sel === 'all' || !v || v === sel; },

    // Söz URL başına önbellekte: yükleme sürerken gelen ikinci çağrı aynı sözü alır (betik iki kez eklenmez → "already declared" hatası olmaz).
    // Hata olursa söz silinir ve betik etiketi kaldırılır; sonraki çağrı yeniden dener.
    _p: {},
    _load(src) {
        if (this._loaded[src]) return Promise.resolve();
        return this._p[src] || (this._p[src] = new Promise((res, rej) => {
            const s = document.createElement('script');
            // Önbellek damgası (index.html'deki window.CG_ASSET_V; ~/inventory/harness/stamp.js üretir): içerik değişince adres değişir
            const v = typeof window !== 'undefined' && window.CG_ASSET_V && window.CG_ASSET_V[src];
            s.src = v ? src + '?v=' + v : src;
            s.onload = () => { this._loaded[src] = true; res(); };
            s.onerror = () => { delete this._p[src]; s.remove(); rej(new Error(src)); };
            document.head.appendChild(s);
        }));
    },

    // fam: vendor ailesi kilidi (#/v/<aile>/komutlar[/<cli>]); çip satırı yalnız ailede birden çok kütüphane varsa, yalnız onlarla
    async render(root, vendor, fam) {
        this._fam = fam && fam.cli && fam.cli.length ? fam : null;
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Komutlar yükleniyor…</p></div>';
        try { await this._load('assets/data/cli/index.js'); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Komut dizini yüklenemedi.</p></div>'; return; }
        const idx = (window.CG_CLI_INDEX || []).filter(v => !this._fam || this._fam.cli.includes(v.key));
        if (!vendor || !idx.some(v => v.key === vendor)) vendor = idx[0] && idx[0].key;
        if (vendor !== this._vendor) { this._cat = 'all'; this._sev = 'all'; }
        this._vendor = vendor;
        this._ver = this.verFromHash();
        try { await this._load('assets/data/cli/' + vendor + '.js'); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>' + cgEsc(vendor) + ' verisi yüklenemedi.</p></div>'; return; }
        this._root = root;
        this._paint();
    },

    _data() { return (window.CG_CLI_DATA || {})[this._vendor] || { commands: [], scenarios: [], sources: {}, links: [] }; },

    _paint() {
        const F = this._fam, idx = (window.CG_CLI_INDEX || []).filter(v => !F || F.cli.includes(v.key)), d = this._data();
        const total = idx.reduce((a, v) => a + v.count, 0);
        const base = F ? '#/v/' + F.slug + '/komutlar/' : '#/cli/';
        const vchips = idx.length < 2 ? '' : idx.map(v => `<button class="cg-chip${v.key === this._vendor ? ' active' : ''}" onclick="location.hash='${base}${v.key}'" title="${cgEsc(v.name)}" aria-pressed="${v.key === this._vendor}">
                ${typeof cgBrandMark === 'function' ? cgBrandMark(v.key, 14) : ''}<span class="cg-chip-l">${cgEsc(v.name)}</span><span class="cg-chip-n">${v.count}</span></button>`).join('');
        const cats = [...new Set(d.commands.map(c => c.cat))];
        const cnt = {}; d.commands.forEach(c => { cnt[c.cat] = (cnt[c.cat] || 0) + 1; });
        const cchips = ['all', ...cats].map(c => `<button class="cg-chip cg-cat-chip${this._cat === c ? ' active' : ''}" data-cat="${cgEsc(c)}">
                <span class="cg-chip-l">${c === 'all' ? 'Tüm kategoriler' : cgEsc(c)}</span><span class="cg-chip-n">${c === 'all' ? d.commands.length : cnt[c]}</span></button>`).join('');
        this._root.innerHTML = `
        <div class="cg-home cg-cli">
            <div class="cg-cli-hd">
                <h1>${F ? cgEsc(F.name) + ' komutları' : 'Komut Kütüphanesi'}</h1>
                <p><strong>${total}</strong> komut · <strong>${idx.length}</strong> platform${F && idx.length === 1 ? ': ' + cgEsc(idx[0].name) : ''} · doğrulama, sorun giderme ve günlük işletim komutları. Komuta tıklayınca kopyalanır.</p>
            </div>
            ${vchips ? `<div class="cg-chips" id="cg-cli-vendors" role="group" aria-label="Platform">${vchips}</div>` : ''}
            <div class="cg-home-search">
                <i class="fas fa-search"></i>
                <input type="text" id="cg-cli-q" placeholder="${cgEsc(d.name || '')} içinde ara: bgp, vpn, interface, log…" autocomplete="off" value="${cgEsc(this._q)}">
                <kbd>/</kbd>
            </div>
            <div class="cg-cli-sev" role="group" aria-label="Önem">
                ${[['all', 'Tümü'], ['i', 'Bilgi'], ['w', 'Dikkat'], ['e', 'Riskli']].map(([k, l]) => `<button class="cg-chip${this._sev === k ? ' active' : ''}" data-sev="${k}">${k !== 'all' ? `<span class="cg-sev cg-sev-${k}"></span>` : ''}<span class="cg-chip-l">${l}</span></button>`).join('')}
            </div>
            ${this._verChips(d)}
            <div class="cg-chips cg-cat-chips" id="cg-cli-cats">${cchips}</div>
            <div id="cg-cli-list"></div>
            ${this._scenariosHtml(d)}
            ${this._linksHtml(d)}
        </div>`;
        const q = document.getElementById('cg-cli-q');
        q.addEventListener('input', () => { this._q = q.value; this._paintList(); });
        this._root.querySelectorAll('#cg-cli-cats .cg-chip').forEach(b => b.addEventListener('click', () => {
            this._cat = b.dataset.cat; this._root.querySelectorAll('#cg-cli-cats .cg-chip').forEach(x => x.classList.toggle('active', x === b)); this._paintList();
        }));
        this._root.querySelectorAll('.cg-cli-sev .cg-chip').forEach(b => b.addEventListener('click', () => {
            this._sev = b.dataset.sev; this._root.querySelectorAll('.cg-cli-sev .cg-chip').forEach(x => x.classList.toggle('active', x === b)); this._paintList();
        }));
        // Kopyalama: komut data-code özniteliğinde taşınır (tırnak/ters bölü bozulmaz)
        if (!this._root._cliCopyBound) this._root._cliCopyBound = true, this._root.addEventListener('click', e => {
            if (!this._root.querySelector('.cg-cli')) return;   // yalniz Komutlar sayfasindayken
            const el = e.target.closest('[data-code]');
            if (!el) return;
            const txt = el.dataset.code;
            const ok = () => { el.classList.add('is-copied'); setTimeout(() => el.classList.remove('is-copied'), 900); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, ok); else ok();
        });
        this._root.querySelectorAll('.cg-ver-chips .cg-chip').forEach(b => b.addEventListener('click', () => {
            this._ver = b.dataset.ver; this.verToHash(this._ver);
            this._root.querySelectorAll('.cg-ver-chips .cg-chip').forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-pressed', x === b); });
            this._paintList();
        }));
        this._paintList();
    },

    // Sürüm süzgeci: yalnız ver alanı taşıyan komutu olan kütüphanede (şimdilik FortiGate)
    _verChips(d) {
        if (!d.commands.some(c => c.ver)) { this._ver = 'all'; return ''; }
        const n = v => d.commands.filter(c => this.verOk(c.ver, v)).length;
        return `<div class="cg-chips cg-ver-chips" role="group" aria-label="FortiOS sürümü"><span class="cg-ver-lbl">FortiOS</span>${
            [['all', 'Tümü'], ['7.4', '7.4'], ['7.6', '7.6']].map(([k, l]) => `<button type="button" class="cg-chip${this._ver === k ? ' active' : ''}" data-ver="${k}" aria-pressed="${this._ver === k}"><span class="cg-chip-l">${l}</span><span class="cg-chip-n">${n(k)}</span></button>`).join('')}</div>`;
    },

    _paintList() {
        const d = this._data(), host = document.getElementById('cg-cli-list');
        if (!host) return;
        const terms = this._q.toLowerCase().split(/\s+/).filter(Boolean);
        const rows = d.commands.filter(c =>
            (this._cat === 'all' || c.cat === this._cat) &&
            (this._sev === 'all' || c.sev === this._sev) &&
            this.verOk(c.ver, this._ver) &&
            terms.every(t => (c.code + ' ' + c.desc + ' ' + c.cat).toLowerCase().includes(t)));
        if (!rows.length) { host.innerHTML = '<div class="cg-empty"><i class="fas fa-search"></i><p>Eşleşen komut yok.</p></div>'; return; }
        const byCat = {};
        rows.forEach(c => { (byCat[c.cat] = byCat[c.cat] || []).push(c); });
        host.innerHTML = Object.entries(byCat).map(([cat, list]) => {
            const src = (d.sources[cat] || []).map((u, i) => `<a href="${cgEsc(u)}" target="_blank" rel="noopener">kaynak ${i + 1}</a>`).join(' · ');
            return `<section class="cg-cli-cat">
                <header><h3>${cgEsc(cat)}</h3><span class="cg-vgroup-n">${list.length}</span>${src ? `<span class="cg-cli-src">${src}</span>` : ''}</header>
                <div class="cg-cli-rows">${list.map(c => `
                    <div class="cg-cli-row">
                        <span class="cg-sev cg-sev-${cgEsc(c.sev)}" title="${c.sev === 'e' ? 'Riskli — üretimde dikkatli kullanın' : c.sev === 'w' ? 'Dikkat' : 'Bilgi'}"></span>
                        <code data-code="${cgEsc(c.code)}" title="Kopyala">${cgEsc(c.code)}</code>
                        <span class="cg-cli-desc">${c.ver ? this.verBadge(c.ver) + ' ' : ''}${cgEsc(c.desc)}</span>
                    </div>`).join('')}</div>
            </section>`;
        }).join('');
    },

    _scenariosHtml(d) {
        if (!d.scenarios || !d.scenarios.length) return '';
        return `<section class="cg-cli-scen">
            <h3><i class="fas fa-stethoscope"></i> Sorun Giderme Senaryoları</h3>
            ${d.scenarios.map(s => `<details class="cg-cli-scn">
                <summary><span class="cg-sev cg-sev-${s.severity === 'err' ? 'e' : s.severity === 'warn' ? 'w' : 'i'}"></span>${cgEsc(s.title)}</summary>
                ${s.symptom ? `<p class="cg-cli-sym"><b>Belirti:</b> ${cgEsc(s.symptom)}</p>` : ''}
                <ol>${s.steps.map(st => `<li><code data-code="${cgEsc(st.code)}" title="Kopyala">${cgEsc(st.code)}</code>${st.desc ? `<span class="cg-cli-desc">${cgEsc(st.desc)}</span>` : ''}</li>`).join('')}</ol>
            </details>`).join('')}
        </section>`;
    },

    _linksHtml(d) {
        if (!d.links || !d.links.length) return '';
        return `<section class="cg-cli-links"><h3><i class="fas fa-book"></i> Kaynaklar</h3><ul>${
            d.links.map(l => `<li><a href="${cgEsc(l.url)}" target="_blank" rel="noopener">${cgEsc(l.name)}</a>${l.desc ? ' — ' + cgEsc(l.desc) : ''}</li>`).join('')}</ul></section>`;
    },
};
