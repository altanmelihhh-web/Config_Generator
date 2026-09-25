'use strict';

// ─── CLI Laboratuvarı (#/lab, #/lab/<id>) ───────────────────────────────────
// Motorlar: assets/js/lab/*.js · İçerik: assets/data/labs/*.js (ihtiyaç anında yüklenir)
// İlerleme bu tarayıcıda (localStorage) tutulur; dışa/içe aktarılabilir.
const CgLab = {
    LEVELS: ['CLI temelleri', 'Temel yapılandırma', 'L2 anahtarlama', 'L3 / yönlendirme', 'Güvenlik ve servisler', 'Sorun giderme', 'Sınav tarzı'],
    VENDORS: {
        'cisco-ios': { name: 'Cisco IOS', look: 'IOS 15.x', engine: () => (typeof CgLabIos !== 'undefined' ? CgLabIos : null), files: ['assets/js/lab/core.js', 'assets/js/lab/ios.js', 'assets/data/labs/ios.js'] },
        fortigate: { name: 'FortiGate', look: 'FortiOS 7.4', levels: ['CLI temelleri', 'Temel yapılandırma', 'Nesneler ve güvenlik kuralları', 'Yönlendirme ve NAT', 'VPN, kimlik ve profiller', 'Sorun giderme', 'Sınav tarzı'], engine: () => (typeof CgLabFgt !== 'undefined' ? CgLabFgt : null), files: ['assets/js/lab/core.js', 'assets/js/lab/fortios.js', 'assets/data/labs/fortigate.js'] },
    },
    lvName(vendor, lv) { const v = this.VENDORS[vendor]; return ((v && v.levels) || this.LEVELS)[lv] || ''; },
    KIND: { switch: 'Switch', router: 'Router', firewall: 'Firewall' },
    _vf: 'all',
    KEY: 'cg-lab-v1',

    // ── depolama (her erişim try/catch; tarayıcı engellerse ilerleme yalnız oturumda kalır)
    _mem: null,
    _store() {
        if (this._mem) return this._mem;
        let d = null;
        try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; }
        this._mem = d && d.labs ? d : { labs: {} };
        return this._mem;
    },
    _save() { try { localStorage.setItem(this.KEY, JSON.stringify(this._store())); } catch (e) { /* yalnız oturum */ } },
    _st(id) { const s = this._store(); return s.labs[id] || (s.labs[id] = { done: [], hints: {}, sol: false, log: [], t0: null, tDone: null, stars: 0 }); },

    async _loadAll() {
        for (const v of Object.values(this.VENDORS)) for (const f of v.files) await CgCli._load(f);
    },

    async render(root, id) {
        this._root = root;
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Laboratuvar yükleniyor…</p></div>';
        try { await this._loadAll(); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Laboratuvar yüklenemedi.</p></div>'; return; }
        const lab = id && (window.CG_LABS || []).find(l => l.id === id);
        if (id && !lab) { location.hash = '#/lab'; return; }
        if (lab) this._paintLab(lab); else this._paintCatalog();
    },

    // ═══ Katalog ═══════════════════════════════════════════════════════════
    _paintCatalog() {
        const all = window.CG_LABS || [];
        const labs = all.filter(l => this._vf === 'all' || l.vendor === this._vf), real = labs.filter(l => !l.sandbox);
        const vchips = ['all'].concat(Object.keys(this.VENDORS)).map(v => {
            const n = all.filter(l => !l.sandbox && (v === 'all' || l.vendor === v)).length;
            return `<button class="cg-chip${this._vf === v ? ' active' : ''}" data-vf="${v}">${v === 'all' ? '' : this._mark(v)}<span class="cg-chip-l">${v === 'all' ? 'Tümü' : cgEsc(this.VENDORS[v].name)}</span><span class="cg-chip-n">${n}</span></button>`;
        }).join('');
        const doneN = real.filter(l => this._st(l.id).tDone).length;
        const stars = real.reduce((a, l) => a + (this._st(l.id).stars || 0), 0);
        const levels = [...new Set(real.map(l => l.level))].sort((a, b) => a - b);
        const card = l => {
            const st = this._st(l.id), done = !!st.tDone, started = st.log.length > 0;
            const pre = (l.pre || []).filter(p => !this._st(p).tDone);
            const badge = done ? `<span class="cg-lab-badge ok" aria-label="3 üzerinden ${st.stars} yıldız">${'★'.repeat(st.stars)}${'☆'.repeat(3 - st.stars)}</span>` : started ? '<span class="cg-lab-badge run">Devam ediyor</span>' : '<span class="cg-lab-badge">Yeni</span>';
            return `<a class="cg-lab-card${done ? ' is-done' : ''}" href="#/lab/${l.id}">
                <span class="cg-lab-card-top">${this._mark(l.vendor)}<span class="cg-lab-id">${l.id.toUpperCase()}</span>${badge}</span>
                <span class="cg-lab-card-t">${cgEsc(l.title)}</span>
                <span class="cg-lab-card-m"><i class="far fa-clock"></i> ${l.minutes} dk · <i class="fas fa-list-check"></i> ${l.tasks.length} görev${l.cert ? ' · ' + cgEsc(l.cert) : ''}</span>
                ${pre.length ? `<span class="cg-lab-card-pre"><i class="fas fa-route"></i> Önce önerilir: ${pre.map(p => p.toUpperCase()).join(', ')}</span>` : ''}
            </a>`;
        };
        const sandboxes = labs.filter(l => l.sandbox);
        this._root.innerHTML = `
        <div class="cg-home cg-lab">
            <div class="cg-cli-hd">
                <h2><i class="fas fa-flask"></i> CLI Laboratuvarı</h2>
                <p>Tarayıcıda gerçekçi bir terminalde görevleri çözün. Kısaltma, <kbd>?</kbd>, Tab ve <code>no</code> gerçek cihazdaki gibi çalışır; görevler yazdığınız metne değil <b>cihazın vardığı duruma</b> göre kontrol edilir.</p>
            </div>
            <div class="cg-lab-stats">
                <span><b>${doneN}</b> / ${real.length} lab tamamlandı</span><span><b>${stars}</b> ★</span>
                <span class="cg-lab-stats-act"><button class="cg-ts-btn" data-exp><i class="fas fa-download"></i> İlerlemeyi indir</button>
                <label class="cg-ts-btn"><i class="fas fa-upload"></i> Yükle<input type="file" accept="application/json" data-imp hidden></label></span>
            </div>
            <div class="cg-chips cg-lab-vf">${vchips}</div>
            <div class="cg-lab-simnote"><i class="fas fa-info-circle"></i> Bu bir <b>eğitim simülatörüdür</b>; ${Object.values(this.VENDORS).map(v => v.name + ' (' + v.look + ')').join(', ')} davranışının bir alt kümesini taklit eder. Desteklenmeyen bir komut yazarsanız bunu açıkça söyler.</div>
            ${levels.map(lv => `<section class="cg-lab-level">
                <h3><span class="cg-lab-lvn">Seviye ${lv}</span> ${cgEsc([...new Set(real.filter(l => l.level === lv).map(l => this.lvName(l.vendor, lv)))].join(' · '))}</h3>
                <div class="cg-lab-cards">${real.filter(l => l.level === lv).map(card).join('')}</div>
            </section>`).join('')}
            ${sandboxes.length ? `<section class="cg-lab-level"><h3><span class="cg-lab-lvn"><i class="fas fa-terminal"></i></span> Serbest terminal</h3>
                <div class="cg-lab-cards">${sandboxes.map(l => `<a class="cg-lab-card" href="#/lab/${l.id}"><span class="cg-lab-card-top">${this._mark(l.vendor)}<span class="cg-lab-id">SANDBOX</span></span>
                <span class="cg-lab-card-t">${cgEsc(l.title)}</span><span class="cg-lab-card-m">Görev yok, serbest deneme</span></a>`).join('')}</div></section>` : ''}
        </div>`;
        this._root.querySelectorAll('[data-vf]').forEach(b => b.addEventListener('click', () => { this._vf = b.dataset.vf; this._paintCatalog(); }));
        this._root.querySelector('[data-exp]').addEventListener('click', () => this._export());
        this._root.querySelector('[data-imp]').addEventListener('change', e => this._import(e.target.files[0]));
    },
    _mark(v) { return typeof cgBrandMark === 'function' ? cgBrandMark(v, 14) : ''; },
    _export() {
        const blob = new Blob([JSON.stringify(this._store(), null, 1)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'cli-lab-ilerleme.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    },
    _import(file) {
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
            try { const d = JSON.parse(r.result); if (!d || !d.labs) throw 0; this._mem = d; this._save(); this._paintCatalog(); }
            catch (e) { this._toast('Dosya okunamadı: geçerli bir ilerleme dosyası değil.', true); }
        };
        r.readAsText(file);
    },

    // ═══ Lab ekranı ════════════════════════════════════════════════════════
    _paintLab(lab) {
        const V = this.VENDORS[lab.vendor], st = this._st(lab.id);
        this._lab = lab; this._stt = st;
        this._sess = V.engine().session(lab);
        this._hist = []; this._hi = 0;
        // kayıtlı oturumu sessizce yeniden oynat
        const replay = [];
        for (const e of st.log) {
            if (e.h !== undefined) { this._sess.help(e.h); continue; }
            const ps = this._sess.prompt(), sec = this._sess.secret();
            const o = this._sess.input(e.i);
            replay.push(ps + (sec ? '' : e.i)); if (o) replay.push(o);
            if (!sec && e.i.trim()) this._hist.push(e.i);
        }
        this._hi = this._hist.length;
        const lvl = lab.level === null || lab.level === undefined ? 'Serbest terminal' : 'Seviye ' + lab.level + ' · ' + this.lvName(lab.vendor, lab.level);
        this._root.innerHTML = `
        <div class="cg-home cg-lab cg-lab-run">
            <nav class="cg-ts-crumbs"><a href="#/lab"><i class="fas fa-flask"></i> Laboratuvar</a><i class="fas fa-chevron-right"></i><span>${cgEsc(lvl)}</span><i class="fas fa-chevron-right"></i><span>${cgEsc(lab.title)}</span></nav>
            <div class="cg-lab-grid">
                <aside class="cg-lab-side" id="cg-lab-side"></aside>
                <section class="cg-lab-termwrap">
                    <div class="cg-term-bar">
                        <span class="cg-term-dev">${this._mark(lab.vendor)} ${cgEsc(V.name)} · ${this.KIND[lab.kind] || ''}</span>
                        <span class="cg-term-acts">
                            ${lab.tasks.length ? '<button class="cg-ts-btn" data-act="check"><i class="fas fa-clipboard-check"></i> Kontrol et</button>' : ''}
                            <button class="cg-ts-btn" data-act="reset" title="Cihazı ve bu lab'daki ilerlemeyi sıfırla"><i class="fas fa-undo"></i> Sıfırla</button>
                        </span>
                    </div>
                    <div class="cg-term" id="cg-term">
                        <pre class="cg-term-out" id="cg-term-out" role="log" aria-live="polite" aria-label="Terminal çıktısı"></pre>
                        <div class="cg-term-line"><span class="cg-term-ps" id="cg-term-ps"></span><input class="cg-term-in" id="cg-term-in" type="text" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off" aria-label="Terminal komut satırı"></div>
                    </div>
                    <div class="cg-term-keys" aria-label="Terminal tuşları">
                        <button data-key="?">?</button><button data-key="Tab">Tab</button><button data-key="ArrowUp">↑</button><button data-key="ArrowDown">↓</button><button data-key="ctrlz">Ctrl+Z</button>
                    </div>
                </section>
            </div>
        </div>`;
        this._out = document.getElementById('cg-term-out');
        this._in = document.getElementById('cg-term-in');
        this._ps = document.getElementById('cg-term-ps');
        if (replay.length) this._print(replay.join('\n'));
        else this._print(this._banner(lab));
        this._prompt();
        this._bindTerm();
        this._root.querySelector('[data-act="reset"]').addEventListener('click', () => this._confirmReset());
        const ck = this._root.querySelector('[data-act="check"]');
        if (ck) ck.addEventListener('click', () => this._check(true));
        this._evalTasks(false);
        this._paintSide();
        if (window.matchMedia('(min-width: 900px)').matches) this._in.focus();
    },
    _banner(lab) {
        return '[Config Generator CLI Lab — eğitim simülatörü]\n' + (lab.sandbox ? 'Serbest terminal. ? ile komutları keşfedin.\n' : 'Görevler lab panelinde. ? ile yardım, Tab ile tamamlama.\n') + '\n';
    },
    _print(text) {
        this._out.appendChild(document.createTextNode(text.endsWith('\n') ? text : text + '\n'));
        // çok uzun oturumda eski satırları buda
        if (this._out.textContent.length > 200000) this._out.textContent = this._out.textContent.slice(-150000);
        const t = document.getElementById('cg-term'); t.scrollTop = t.scrollHeight;
    },
    _prompt() {
        this._ps.textContent = this._sess.prompt();
        this._in.type = this._sess.secret() ? 'password' : 'text';
    },
    _run(v) {
        const s = this._sess, sec = s.secret(), ps = s.prompt();
        const o = s.input(v);
        this._print(ps + (sec ? '' : v) + (o ? '\n' + o.replace(/\n$/, '') : ''));
        this._stt.log.push({ i: v });
        if (this._stt.log.length > 2000) this._stt.log = this._stt.log.slice(-2000);
        if (!this._stt.t0) this._stt.t0 = Date.now();
        if (!sec && v.trim()) { this._hist.push(v); }
        this._hi = this._hist.length;
        this._prompt();
        this._evalTasks(true);
        this._save();
    },
    _bindTerm() {
        const inp = this._in, term = document.getElementById('cg-term');
        term.addEventListener('click', () => { if (!window.getSelection().toString()) inp.focus(); });
        inp.addEventListener('keydown', e => this._key(e.key, e));
        inp.addEventListener('paste', e => {
            const t = (e.clipboardData || window.clipboardData).getData('text');
            if (!/\n/.test(t)) return;
            e.preventDefault();
            const lines = t.replace(/\r/g, '').split('\n');
            if (lines[lines.length - 1] === '') lines.pop();
            lines[0] = inp.value + lines[0]; inp.value = '';
            lines.forEach(l => this._run(l));
        });
        this._root.querySelectorAll('.cg-term-keys button').forEach(b => b.addEventListener('click', () => { this._key(b.dataset.key, null); inp.focus(); }));
    },
    _key(k, e) {
        const inp = this._in, s = this._sess;
        const stop = () => { if (e) e.preventDefault(); };
        if (k === 'Enter') { stop(); const v = inp.value; inp.value = ''; this._run(v); return; }
        if (k === '?' && !s.secret()) {
            stop();
            const v = inp.value;
            const h = s.help(v);
            this._stt.log.push({ h: v });
            this._print(s.prompt() + v + '?' + (h ? '\n' + h : ''));
            this._evalTasks(true); this._save();
            return;
        }
        if (k === 'Tab') { stop(); const r = s.complete(inp.value); if (r !== null) inp.value = r; return; }
        if (k === 'ArrowUp') { stop(); if (this._hi > 0) inp.value = this._hist[--this._hi]; return; }
        if (k === 'ArrowDown') { stop(); if (this._hi < this._hist.length - 1) inp.value = this._hist[++this._hi]; else { this._hi = this._hist.length; inp.value = ''; } return; }
        if (k === 'ctrlz' || (e && e.ctrlKey && (k === 'z' || k === 'Z'))) {
            stop();
            const ps = s.prompt(); const o = s.input('\x1a');
            this._stt.log.push({ i: '\x1a' });
            this._print(ps + inp.value + '^Z' + (o ? '\n' + o : '')); inp.value = '';
            this._prompt(); this._evalTasks(true); this._save();
        }
    },

    // ── görevler
    _evalTasks(announce) {
        const lab = this._lab, st = this._stt;
        if (!lab.tasks.length) return;
        const before = st.done.filter(Boolean).length;
        let changed = false;
        lab.tasks.forEach((t, i) => {
            if (st.done[i]) return;
            if (lab.ordered && i > 0 && !st.done[i - 1]) return;
            let ok = false; try { ok = !!t.check(this._sess); } catch (err) { ok = false; }
            if (ok) { st.done[i] = true; changed = true; }
        });
        if (lab.ordered) { /* sıralı lab'da bir görev bitince sonraki hemen denenir */
            let again = true;
            while (again) { again = false; lab.tasks.forEach((t, i) => { if (!st.done[i] && (i === 0 || st.done[i - 1])) { let ok = false; try { ok = !!t.check(this._sess); } catch (err) { /* */ } if (ok) { st.done[i] = true; again = changed = true; } } }); }
        }
        const allDone = lab.tasks.every((t, i) => st.done[i]);
        if (allDone && !st.tDone) { st.tDone = Date.now(); st.stars = this._stars(); changed = true; }
        if (changed) {
            const n = st.done.filter(Boolean).length;
            if (announce && n > before && !allDone) this._toast('Görev tamamlandı (' + n + '/' + lab.tasks.length + ')');
            if (announce && allDone && before < lab.tasks.length) this._toast('Lab tamamlandı!');
            this._paintSide(announce ? n : null);
            this._save();
        }
    },
    _stars() {
        const st = this._stt, lv = Object.values(st.hints || {});
        let s = 3;
        if (lv.some(x => x >= 2)) s--;
        if (st.sol || lv.some(x => x >= 3)) s--;
        return Math.max(1, s);
    },
    _check(show) {
        this._evalTasks(true);
        const lab = this._lab, st = this._stt, s = this._sess;
        this._fb = {};
        lab.tasks.forEach((t, i) => {
            if (st.done[i]) return;
            let m = null; try { m = t.fb ? t.fb(s) : null; } catch (e) { m = null; }
            this._fb[i] = m || 'Henüz tamamlanmadı.';
        });
        if (show) this._paintSide();
    },
    _paintSide(justDone) {
        const lab = this._lab, st = this._stt, side = document.getElementById('cg-lab-side');
        if (!side) return;
        const n = st.done.filter(Boolean).length, tot = lab.tasks.length, pct = tot ? Math.round(100 * n / tot) : 0;
        const cur = lab.ordered ? st.done.findIndex((d, i) => !d) : -1;
        const stepsHtml = t => (t.steps || []).map(x => typeof x === 'object' ? '<code>' + cgEsc(x.help) + '</code> yazıp <kbd>?</kbd>' : x === '' ? '(Enter)' : '<code>' + cgEsc(x) + '</code>').join('<br>');
        // Tam çözümün hangi modda yazılacağı (IOS: yapılandırma modu komutları conf t ister)
        const EXEC = /^(en|ena|enable|conf|configure|sh|show|shw|copy|wr|write|reload|exit|do|ping)\b/i;
        const modeNote = t => {
            if (lab.vendor !== 'cisco-ios') return '';
            const f = t.from || (typeof t.steps[0] === 'string' && t.steps[0] && !EXEC.test(t.steps[0]) ? 'config' : '');
            return f === 'config' ? '<small>Yapılandırma modunda (<code>configure terminal</code>):</small><br>' : f === 'priv' ? '<small>Ayrıcalıklı modda (<code>#</code>):</small><br>' : '';
        };
        const hintsOf = t => t.hints.length >= 3 ? t.hints : t.hints.concat([modeNote(t) + stepsHtml(t)]);
        const tasks = lab.tasks.map((t, i) => {
            const done = !!st.done[i], hl = (st.hints || {})[i] || 0;
            const locked = lab.ordered && i > 0 && !st.done[i - 1] && !done;
            const cls = done ? 'is-ok' : locked ? 'is-lock' : (lab.ordered ? (i === (cur < 0 ? tot : cur) ? 'is-cur' : '') : 'is-open');
            return `<li class="cg-lab-task ${cls}${justDone && done && i === n - 1 ? ' is-new' : ''}">
                <span class="cg-lab-task-i">${done ? '<i class="fas fa-check"></i>' : locked ? '<i class="fas fa-lock"></i>' : i + 1}</span>
                <div class="cg-lab-task-b">
                    <div class="cg-lab-task-t">${t.t}</div>
                    ${!locked ? `<details class="cg-lab-why"><summary>Neden?</summary><div>${t.why}</div></details>` : ''}
                    ${!done && !locked ? `<div class="cg-lab-hints">${hintsOf(t).slice(0, hl).map((h, k) => `<div class="cg-lab-hint lv${k + 1}"><b>${['İpucu', 'Komut iskeleti', 'Çözüm'][k]}:</b> ${h}</div>`).join('')}
                        ${hl < 3 ? `<button class="cg-lab-hbtn" data-hint="${i}"><i class="far fa-lightbulb"></i> ${['İpucu', 'Komut iskeleti', 'Tam çözüm'][hl]}${hl >= 1 ? ' <small>(★ düşürür)</small>' : ''}</button>` : ''}</div>` : ''}
                    ${this._fb && this._fb[i] && !done ? `<div class="cg-lab-fb"><i class="fas fa-exclamation-circle"></i> ${this._fb[i]}</div>` : ''}
                </div>
            </li>`;
        }).join('');
        const done = !!st.tDone;
        side.innerHTML = `
            <h2 class="cg-lab-title">${cgEsc(lab.title)}</h2>
            <div class="cg-lab-story">${lab.story}</div>
            ${lab.goals ? `<details class="cg-lab-goals"><summary><i class="fas fa-bullseye"></i> Kazanımlar</summary><ul>${lab.goals.map(g => `<li>${cgEsc(g)}</li>`).join('')}</ul></details>` : ''}
            ${tot ? `<div class="cg-lab-prog"><div class="cg-ts-prog" role="progressbar" aria-valuenow="${n}" aria-valuemin="0" aria-valuemax="${tot}" aria-label="Görev ilerlemesi"><span style="width:${pct}%"></span></div><span>${n}/${tot} görev · %${pct}</span></div>
            ${done ? this._finishHtml() : ''}
            <ol class="cg-lab-tasks">${tasks}</ol>
            <div class="cg-lab-solbox">${st.sol ? `<div class="cg-lab-sol"><b>Örnek çözüm</b> <small>(tek doğru yol değildir)</small><pre>${cgEsc(lab.solution.filter(x => typeof x === 'string').join('\n'))}</pre></div>`
                : '<button class="cg-lab-hbtn" data-sol><i class="fas fa-eye"></i> Örnek çözümü göster <small>(★ düşürür)</small></button>'}</div>` : ''}
            ${lab.verify ? `<div class="cg-lab-verify"><b><i class="fas fa-search"></i> Doğrulama komutları:</b> ${lab.verify.map(v => `<code>${cgEsc(v)}</code>`).join(' ')}</div>` : ''}
            ${this._linksHtml(lab)}`;
        side.querySelectorAll('[data-hint]').forEach(b => b.addEventListener('click', () => {
            const i = +b.dataset.hint; st.hints = st.hints || {}; st.hints[i] = Math.min(3, (st.hints[i] || 0) + 1); this._save(); this._paintSide();
        }));
        const sb = side.querySelector('[data-sol]');
        if (sb) sb.addEventListener('click', () => { st.sol = true; this._save(); this._paintSide(); });
        const nx = side.querySelector('[data-next]');
        if (nx) nx.addEventListener('click', () => { location.hash = '#/lab/' + nx.dataset.next; });
    },
    _finishHtml() {
        const lab = this._lab, st = this._stt;
        const secs = st.t0 && st.tDone ? Math.max(1, Math.round((st.tDone - st.t0) / 1000)) : null;
        const hints = Object.values(st.hints || {}).reduce((a, b) => a + b, 0);
        const real = (window.CG_LABS || []).filter(l => !l.sandbox && l.vendor === lab.vendor).sort((a, b) => a.level - b.level || a.id.localeCompare(b.id));
        const next = real[real.findIndex(l => l.id === lab.id) + 1];
        return `<div class="cg-lab-finish">
            <div class="cg-lab-stars" role="img" aria-label="3 üzerinden ${st.stars} yıldız">${'★'.repeat(st.stars)}<span>${'☆'.repeat(3 - st.stars)}</span></div>
            <h3>Lab tamamlandı!</h3>
            <p>${secs ? 'Süre: <b>' + (secs >= 60 ? Math.floor(secs / 60) + ' dk ' : '') + (secs % 60) + ' sn</b> · ' : ''}İpucu: <b>${hints}</b>${st.sol ? ' · çözüm görüntülendi' : ''}</p>
            ${st.stars < 3 ? '<p class="cg-lab-finish-tip">3 yıldız için: Sıfırla ile tekrar deneyin, komut iskeleti ve çözüm ipuçlarını kullanmadan bitirin.</p>' : ''}
            <b>Öğrendikleriniz</b><ul>${lab.learn.map(x => `<li>${x}</li>`).join('')}</ul>
            ${next ? `<button class="cg-ts-btn ok" data-next="${next.id}"><i class="fas fa-arrow-right"></i> Sonraki: ${cgEsc(next.title)}</button>` : ''}
        </div>`;
    },
    _linksHtml(lab) {
        const L = lab.links || {}, out = [];
        if (L.tool) out.push(`<a class="cg-chip" href="${L.tool}"><i class="fas fa-magic"></i><span class="cg-chip-l">Config üretecinde aç</span></a>`);
        if (L.cli) out.push(`<a class="cg-chip" href="${L.cli}"><i class="fas fa-terminal"></i><span class="cg-chip-l">Komut kütüphanesi</span></a>`);
        if (L.wizard) out.push(`<a class="cg-chip" href="${L.wizard}"><i class="fas fa-stethoscope"></i><span class="cg-chip-l">Sorun giderme</span></a>`);
        return out.length ? `<div class="cg-ts-rel">${out.join('')}</div>` : '';
    },
    _confirmReset() {
        const bar = this._root.querySelector('.cg-term-acts');
        if (bar.querySelector('.cg-lab-confirm')) return;
        const d = document.createElement('span');
        d.className = 'cg-lab-confirm';
        d.innerHTML = 'Cihaz ve bu lab\'daki ilerleme silinsin mi? <button class="cg-ts-btn bad" data-yes>Evet, sıfırla</button> <button class="cg-ts-btn" data-no>Vazgeç</button>';
        bar.appendChild(d);
        d.querySelector('[data-no]').addEventListener('click', () => d.remove());
        d.querySelector('[data-yes]').addEventListener('click', () => {
            delete this._store().labs[this._lab.id]; this._fb = {}; this._save(); this._paintLab(this._lab);
        });
    },
    _toast(msg, bad) {
        let t = document.getElementById('cg-lab-toast');
        if (!t) { t = document.createElement('div'); t.id = 'cg-lab-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
        t.innerHTML = '<i class="fas ' + (bad ? 'fa-exclamation-circle' : 'fa-check-circle') + '" aria-hidden="true"></i> ' + cgEsc(msg); t.className = 'cg-lab-toast show' + (bad ? ' bad' : '');
        clearTimeout(this._tt); this._tt = setTimeout(() => { t.className = 'cg-lab-toast'; }, 2200);
    },
};
