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

    _load(src) {
        return new Promise((res, rej) => {
            if (this._loaded[src]) return res();
            const s = document.createElement('script');
            s.src = src;
            s.onload = () => { this._loaded[src] = true; res(); };
            s.onerror = () => rej(new Error(src));
            document.head.appendChild(s);
        });
    },

    async render(root, vendor) {
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Komutlar yükleniyor…</p></div>';
        try { await this._load('assets/data/cli/index.js'); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Komut dizini yüklenemedi.</p></div>'; return; }
        const idx = window.CG_CLI_INDEX || [];
        if (!vendor || !idx.some(v => v.key === vendor)) vendor = idx[0] && idx[0].key;
        if (vendor !== this._vendor) { this._cat = 'all'; this._sev = 'all'; }
        this._vendor = vendor;
        try { await this._load('assets/data/cli/' + vendor + '.js'); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>' + cgEsc(vendor) + ' verisi yüklenemedi.</p></div>'; return; }
        this._root = root;
        this._paint();
    },

    _data() { return (window.CG_CLI_DATA || {})[this._vendor] || { commands: [], scenarios: [], sources: {}, links: [] }; },

    _paint() {
        const idx = window.CG_CLI_INDEX || [], d = this._data();
        const total = idx.reduce((a, v) => a + v.count, 0);
        const vchips = idx.map(v => `<button class="cg-chip${v.key === this._vendor ? ' active' : ''}" onclick="location.hash='#/cli/${v.key}'" title="${cgEsc(v.name)}">
                ${typeof cgBrandMark === 'function' ? cgBrandMark(v.key, 14) : ''}<span class="cg-chip-l">${cgEsc(v.name)}</span><span class="cg-chip-n">${v.count}</span></button>`).join('');
        const cats = [...new Set(d.commands.map(c => c.cat))];
        const cnt = {}; d.commands.forEach(c => { cnt[c.cat] = (cnt[c.cat] || 0) + 1; });
        const cchips = ['all', ...cats].map(c => `<button class="cg-chip cg-cat-chip${this._cat === c ? ' active' : ''}" data-cat="${cgEsc(c)}">
                <span class="cg-chip-l">${c === 'all' ? 'Tüm kategoriler' : cgEsc(c)}</span><span class="cg-chip-n">${c === 'all' ? d.commands.length : cnt[c]}</span></button>`).join('');
        this._root.innerHTML = `
        <div class="cg-home cg-cli">
            <div class="cg-cli-hd">
                <h2><i class="fas fa-terminal"></i> Komut Kütüphanesi</h2>
                <p><strong>${total}</strong> komut · <strong>${idx.length}</strong> platform · doğrulama, sorun giderme ve günlük işletim komutları. Komuta tıklayınca kopyalanır.</p>
            </div>
            <div class="cg-chips" id="cg-cli-vendors">${vchips}</div>
            <div class="cg-home-search">
                <i class="fas fa-search"></i>
                <input type="text" id="cg-cli-q" placeholder="${cgEsc(d.name || '')} içinde ara: bgp, vpn, interface, log…" autocomplete="off" value="${cgEsc(this._q)}">
                <kbd>/</kbd>
            </div>
            <div class="cg-cli-sev" role="group" aria-label="Önem">
                ${[['all', 'Tümü'], ['i', 'Bilgi'], ['w', 'Dikkat'], ['e', 'Riskli']].map(([k, l]) => `<button class="cg-chip${this._sev === k ? ' active' : ''}" data-sev="${k}">${k !== 'all' ? `<span class="cg-sev cg-sev-${k}"></span>` : ''}<span class="cg-chip-l">${l}</span></button>`).join('')}
            </div>
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
        this._paintList();
    },

    _paintList() {
        const d = this._data(), host = document.getElementById('cg-cli-list');
        if (!host) return;
        const terms = this._q.toLowerCase().split(/\s+/).filter(Boolean);
        const rows = d.commands.filter(c =>
            (this._cat === 'all' || c.cat === this._cat) &&
            (this._sev === 'all' || c.sev === this._sev) &&
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
                        <span class="cg-cli-desc">${cgEsc(c.desc)}</span>
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
