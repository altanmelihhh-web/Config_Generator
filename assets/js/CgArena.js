'use strict';

// ─── iRule Arenası (#/arena, #/arena/masa/<görev>) ──────────────────────────
// Trafik Masası: kuralı yaz → istekler topolojide akar; tetiklenen olaylar, çalışan satırlar ve
// seçilen üye canlı görünür. Kural CgIRule ile çalışır (lab simülatörüyle aynı yorumlayıcı).
// Görevler: assets/data/arena/masa.js · İlerleme: localStorage 'cg-arena-v1'
const CgArena = {
    KEY: 'cg-arena-v1',
    FILES: ['assets/js/lab/core.js', 'assets/js/lab/irule.js', 'assets/js/lab/asm.js', 'assets/js/lab/tmsh.js', 'assets/data/arena/masa.js', 'assets/data/arena/meydan.js', 'assets/data/arena/waf.js', 'assets/data/arena/nobet.js'],
    RULE: 'r_masa',
    MODES: [
        { id: 'masa', icon: 'fa-project-diagram', title: 'Trafik Masası', desc: 'Kuralı yaz, trafiği başlat: her isteğin hangi olaydan geçtiğini, hangi satırın çalıştığını ve nereye gittiğini canlı izle.', ready: true },
        { id: 'waf', icon: 'fa-shield-alt', title: 'WAF Masası', desc: 'ASM politikasını ayarla ya da istek logunu incele: meşru trafik geçsin, saldırı engellensin. Geniş istisna kaybettirir.', ready: true },
        { id: 'nobet', icon: 'fa-bell', title: 'Nöbet', desc: 'Kurgusal şirkette nöbettesin: alarm, log, istek/yanıt ve ekip mesajlarından kök nedeni bul, en dar düzeltmeyi uygula, "bozmadım" kanıtını göster. Eylem bütçesi ve süre sınırlı.', ready: true },
        { id: 'meydan', icon: 'fa-flag-checkered', title: 'Meydan Okuma', desc: 'Gizli testli kod görevleri: görünür testlerle dene, tümüyle gönder; doğruluk + maliyet puanı.', ready: true },
    ],

    _mem: null,
    _store() { if (this._mem) return this._mem; let d = null; try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; } return (this._mem = d && d.masa ? d : { masa: {} }); },
    _save() { try { localStorage.setItem(this.KEY, JSON.stringify(this._store())); } catch (e) { /* yalnız oturum */ } },
    _st(id) { const s = this._store(); return s.masa[id] || (s.masa[id] = { code: null, runs: 0, done: false, stars: 0, hints: 0 }); },
    _wst(id) { const s = this._store(); s.waf = s.waf || {}; return s.waf[id] || (s.waf[id] = { cfg: null, dec: null, runs: 0, done: false, stars: 0, hints: 0 }); },
    _nst(id) { const s = this._store(); s.nobet = s.nobet || {}; return s.nobet[id] || (s.nobet[id] = { runs: 0, done: false, stars: 0, best: null }); },
    _mst(id) { const s = this._store(); s.meydan = s.meydan || {}; return s.meydan[id] || (s.meydan[id] = { code: null, subs: 0, done: false, stars: 0, hints: 0, best: null }); },

    async render(root, mode, id) {
        this._root = root; this._run = null;
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Arena yükleniyor…</p></div>';
        try { for (const f of this.FILES) await CgCli._load(f); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Arena yüklenemedi.</p></div>'; return; }
        const T = window.CG_ARENA_MASA || [];
        if (mode === 'masa' && id) { const t = T.find(x => x.id === id); if (!t) { location.hash = '#/arena'; return; } this._desk(t); return; }
        if (mode === 'waf' && id) { const t = (window.CG_ARENA_WAF || []).find(x => x.id === id); if (!t) { location.hash = '#/arena'; return; } this._waf(t); return; }
        if (mode === 'nobet' && id) { const v = (window.CG_ARENA_NOBET || []).find(x => x.id === id); if (!v) { location.hash = '#/arena'; return; } this._nb(v); return; }
        if (mode === 'meydan' && id) { const t = (window.CG_ARENA_MO || []).find(x => x.id === id); if (!t) { location.hash = '#/arena'; return; } this._mo(t); return; }
        this._hub(T);
    },

    // ═══ Giriş ═══
    _hub(T) {
        const E = cgEsc;
        this._root.innerHTML = `<div class="cg-ar"><nav class="cg-ts-crumbs"><a href="#/lab"><i class="fas fa-flask"></i> Laboratuvar</a><i class="fas fa-chevron-right"></i><span>iRule Arenası</span></nav>
            <header class="cg-ar-head"><h1><i class="fas fa-chess-knight"></i> iRule Arenası</h1><p>Kuralın içini gör: istek gelir, olaylar tetiklenir, satırlar çalışır, trafik yönlenir. Dört mod, her biri farklı bir beceri: kural yazmak, WAF politikası ayarlamak, olay müdahalesi ve gizli testli kod görevleri.</p></header>
            <div class="cg-ar-modes">${this.MODES.map(m => `<section class="cg-ar-mode${m.ready ? '' : ' is-soon'}"><div class="cg-ar-mh"><i class="fas ${m.icon}"></i><b>${E(m.title)}</b>${m.ready ? '' : '<span class="cg-ar-soon">Yakında</span>'}</div><p>${E(m.desc)}</p>
                ${m.id === 'waf' ? `<div class="cg-ar-tasks">${(window.CG_ARENA_WAF || []).map((t, k) => { const st = this._wst(t.id); return `<a class="cg-ar-task${st.done ? ' is-done' : ''}" href="#/arena/waf/${t.id}"><span class="cg-ar-tn">${k + 1}</span><span><b>${E(t.title)}</b><small>${E(t.topic)}</small></span><span class="cg-ar-ts">${st.done ? '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars) : '<i class="fas fa-play"></i>'}</span></a>`; }).join('')}</div>` : ''}
                ${m.id === 'nobet' ? `<div class="cg-ar-tasks">${(window.CG_ARENA_NOBET || []).map((v, k) => { const st = this._nst(v.id); return `<a class="cg-ar-task${st.done ? ' is-done' : ''}" href="#/arena/nobet/${v.id}"><span class="cg-ar-tn">${k + 1}</span><span><b>${E(v.title)}</b><small>${E(v.topic)}</small></span><span class="cg-ar-ts">${st.done ? '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars) : st.best !== null ? st.best + ' puan' : '<i class="fas fa-play"></i>'}</span></a>`; }).join('')}</div>` : ''}
                ${m.id === 'meydan' ? `<div class="cg-ar-tasks">${(window.CG_ARENA_MO || []).map((t, k) => { const st = this._mst(t.id); return `<a class="cg-ar-task${st.done ? ' is-done' : ''}" href="#/arena/meydan/${t.id}"><span class="cg-ar-tn">${k + 1}</span><span><b>${E(t.title)}</b><small>${E(t.topic)}</small></span><span class="cg-ar-ts">${st.done ? '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars) : t.tests.filter(x => x.hidden).length + ' gizli test'}</span></a>`; }).join('')}</div>` : ''}
                ${m.id === 'masa' ? `<div class="cg-ar-tasks">${T.map((t, k) => { const st = this._st(t.id); return `<a class="cg-ar-task${st.done ? ' is-done' : ''}" href="#/arena/masa/${t.id}"><span class="cg-ar-tn">${k + 1}</span><span><b>${E(t.title)}</b><small>${E(t.topic)}</small></span><span class="cg-ar-ts">${st.done ? '★'.repeat(st.stars) + '☆'.repeat(3 - st.stars) : '<i class="fas fa-play"></i>'}</span></a>`; }).join('')}</div>` : ''}</section>`).join('')}</div></div>`;
    },

    // ═══ Masa ═══
    _desk(t) {
        const E = cgEsc, st = this._st(t.id);
        this._t = t; this._hint = 0;
        const members = Object.entries(t.pools);
        this._root.innerHTML = `<div class="cg-ar cg-ar-deskwrap">
            <nav class="cg-ts-crumbs"><a href="#/arena"><i class="fas fa-chess-knight"></i> iRule Arenası</a><i class="fas fa-chevron-right"></i><span>Trafik Masası</span><i class="fas fa-chevron-right"></i><span>${E(t.title)}</span></nav>
            <div class="cg-ar-brief"><div><h2>${E(t.title)}</h2><p>${t.brief}</p></div>
                <ol class="cg-ar-goals">${t.goals.map(g => `<li>${g}</li>`).join('')}</ol></div>
            ${t.panel ? '<section class="cg-ar-panel" aria-label="Profil ayarları"></section>' : ''}
            <div class="cg-ar-desk">
                <section class="cg-ar-ed"><div class="cg-ar-edh"><span><i class="fas fa-code"></i> ltm rule <b>${this.RULE}</b> <small class="cg-ar-kbd">Esc → Tab: editörden çık</small></span><span class="cg-ar-edtools"><button type="button" data-a="hint" class="cg-ar-lnk"><i class="fas fa-lightbulb"></i> İpucu</button><button type="button" data-a="reset" class="cg-ar-lnk" title="Başlangıç koduna dön"><i class="fas fa-undo"></i></button></span></div>
                    <div class="cg-ar-edbox"><div class="cg-ar-gut" aria-hidden="true"></div><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="iRule kodu"></textarea><ol class="cg-ar-view" hidden></ol></div>
                    <div class="cg-ar-edmsg" role="status"></div><div class="cg-ar-hintbox" hidden></div>
                    <div class="cg-ar-ctl"><button type="button" class="cg-ar-go" data-a="run"><i class="fas fa-play"></i> Kaydet ve trafiği başlat</button>
                        <span class="cg-ar-spd" role="group" aria-label="Hız"><button type="button" data-s="1" class="is-on">1x</button><button type="button" data-s="3">3x</button><button type="button" data-s="0" title="Her isteği sen ilerlet">Adım</button></span>
                        <button type="button" class="cg-ar-step" data-a="step" hidden><i class="fas fa-step-forward"></i> Sonraki istek</button></div></section>
                <section class="cg-ar-topo" aria-label="Topoloji">
                    <div class="cg-ar-col cg-ar-cli">${t.clients.map(c => `<div class="cg-ar-node" data-c="${c.id}"><i class="fas ${c.icon}"></i><b>${E(c.label)}</b><small>${E(c.ip)}</small></div>`).join('')}</div>
                    <div class="cg-ar-col cg-ar-mid"><div class="cg-ar-bigip"><div class="cg-ar-bh"><i class="fas fa-server"></i> BIG-IP <small>${E(t.vs.name)} · ${E(t.vs.ip)}:${t.vs.port}</small></div>
                        <ul class="cg-ar-lamps">${['CLIENT_ACCEPTED', 'HTTP_REQUEST', 'LB_SELECTED', 'LB_FAILED', 'HTTP_RESPONSE'].map(e => `<li data-e="${e}"><i></i>${e}</li>`).join('')}</ul>
                        <div class="cg-ar-verdict" aria-live="polite"></div></div></div>
                    <div class="cg-ar-col cg-ar-srv">${members.map(([p, L]) => `<div class="cg-ar-pool" data-p="${p}"><div class="cg-ar-ph">${E(p)}${p === t.vs.pool ? ' <small>varsayılan</small>' : ''}</div>${L.map(m => { const dn = (t.down || []).includes(m); return `<div class="cg-ar-mem${dn ? ' is-down' : ''}" data-m="${m}" title="${dn ? 'Monitor: kapalı (down)' : 'Monitor: açık'}"><i class="fas fa-hdd"></i> ${E(m)}<span class="cg-ar-hits">${dn ? 'down' : '0'}</span></div>`; }).join('')}</div>`).join('')}</div>
                    <div class="cg-ar-pkt" hidden></div></section>
            </div>
            <section class="cg-ar-flow"><div class="cg-ar-flh"><span><i class="fas fa-stream"></i> İstek akışı</span><span class="cg-ar-score"></span></div>
                <div class="cg-ar-tbl"><table><thead><tr><th>#</th><th>İstemci</th><th>İstek</th><th>Beklenen</th><th>Gerçekleşen</th><th></th></tr></thead><tbody><tr class="cg-ar-empty"><td colspan="6">Kuralı kaydedip trafiği başlatınca ${t.traffic.length} istek burada akacak.</td></tr></tbody></table></div>
                <details class="cg-ar-logd"><summary><i class="fas fa-file-alt"></i> /var/log/ltm <span class="cg-ar-logn"></span></summary><pre class="cg-ar-log"></pre></details></section>
            <div class="cg-ar-done" hidden></div></div>`;
        const $ = s => this._root.querySelector(s); this._$ = $;
        const ta = $('textarea'); ta.value = st.code != null ? st.code : t.start;
        this._prof = Object.assign(this._profDef(t), st.prof || {});
        if (t.panel) this._panel();
        this._speed = 1;
        this._gutter();
        ta.addEventListener('input', () => { st.code = ta.value; this._save(); this._gutter(); });
        ta.addEventListener('scroll', () => { $('.cg-ar-gut').scrollTop = ta.scrollTop; });
        ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.dataset.esc = '1'; return; } if (e.key === 'Tab' && ta.dataset.esc) { delete ta.dataset.esc; return; } delete ta.dataset.esc; if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('    ', a, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this._go(); } });
        this._root.querySelectorAll('.cg-ar-spd button').forEach(b => b.addEventListener('click', () => { this._root.querySelectorAll('.cg-ar-spd button').forEach(x => x.classList.toggle('is-on', x === b)); this._speed = +b.dataset.s;
            if (this._run) { const sb = this._$('[data-a="step"]'); sb.hidden = this._speed !== 0; if (this._speed !== 0 && this._stepRes) { const r = this._stepRes; this._stepRes = null; r(); } } }));
        $('[data-a="run"]').addEventListener('click', () => this._go());
        $('[data-a="step"]').addEventListener('click', () => { if (this._stepRes) { const r = this._stepRes; this._stepRes = null; r(); } });
        $('[data-a="reset"]').addEventListener('click', () => { if (this._run) return; ta.value = t.start; st.code = null; st.prof = null; this._prof = this._profDef(t); this._save(); this._edit(); this._gutter(); if (t.panel) this._panel(); });
        $('[data-a="hint"]').addEventListener('click', () => { const h = t.hints[Math.min(this._hint, t.hints.length - 1)]; this._hint = Math.min(this._hint + 1, t.hints.length); st.hints = Math.max(st.hints, this._hint); this._save(); const box = $('.cg-ar-hintbox'); box.hidden = false; box.innerHTML = t.hints.slice(0, this._hint).map((x, k) => `<p><b>İpucu ${k + 1}</b> ${x}</p>`).join('') + (this._hint >= t.hints.length ? `<details><summary>Örnek çözümü göster</summary>${this._solHtml(t)}</details>` : ''); });
        $('.cg-ar-view').addEventListener('click', () => { if (!this._run) this._edit(); });
    },
    // örnek çözüm: iRule + (varsa) panel ayarları ve tmsh karşılığı
    _solHtml(t) {
        const E = cgEsc, P = t.solutionProf ? Object.assign(this._profDef(t), t.solutionProf) : null, parts = [];
        if (P) { const L = []; if (t.panel.includes('methods')) L.push('known-methods: <b>' + P.known.join(' ') + '</b>', 'unknown-method: <b>' + P.unknown + '</b>'); if (t.panel.includes('persist')) L.push('Persistence: <b>' + P.persist + '</b>');
            parts.push('<p><b>Panel ayarı</b> — ' + L.join(' · ') + '</p><pre class="cg-ar-tmsh">' + E(this._profCmds(t, P).join('\n')) + '</pre>'); }
        parts.push(t.solution && t.solution.trim() ? '<p><b>iRule</b></p><pre>' + E(t.solution) + '</pre>' : '<p><b>Kod gerekmez:</b> yalnız panel ayarı yeterli.</p>');
        return parts.join('');
    },
    // panel ayarının tmsh karşılığı: türetilmiş profil oluştur + VS'ye bağla (varsayılan http profili değiştirilmez)
    _profCmds(t, P) {
        const cmds = [], pn = 'http_' + t.vs.name.replace(/^vs_/, '');
        if (t.panel.includes('methods')) { const def = this._profDef({}).known; const same = P.known.length === def.length && def.every(m => P.known.includes(m));
            if (!same || P.unknown !== 'allow') cmds.push('create ltm profile http ' + pn + ' defaults-from http enforcement { known-methods replace-all-with { ' + P.known.join(' ') + ' } unknown-method ' + P.unknown + ' }', 'modify ltm virtual ' + t.vs.name + ' profiles delete { http } profiles add { ' + pn + ' }'); }
        if (t.panel.includes('persist')) cmds.push(P.persist === 'none' ? 'modify ltm virtual ' + t.vs.name + ' persist none' : 'modify ltm virtual ' + t.vs.name + ' persist replace-all-with { ' + P.persist + ' }');
        return cmds;
    },
    // kararlı karıştırma (doğru seçenek hep ilk sırada olmasın)
    _shuf(arr, key) { return arr.map(c => { let h = 2166136261; const x = key + '|' + c[0]; for (let i = 0; i < x.length; i++) { h ^= x.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return [h, c]; }).sort((a, b) => a[0] - b[0]).map(c => c[1]); },
    // koşu süresince panel ve sıfırlama kilitli (değişiklik sessizce yok sayılmasın)
    _lock(on) {
        const box = this._$ && this._$('.cg-ar-panel'), rs = this._$ && this._$('[data-a="reset"]');
        if (rs) rs.disabled = on;
        if (!box) return;
        box.querySelectorAll('input, select').forEach(x => { x.disabled = on; });
        let n = box.querySelector('.cg-ar-lockn'); if (on && !n) { box.insertAdjacentHTML('afterbegin', '<div class="cg-ar-lockn" role="status"><i class="fas fa-lock"></i> Trafik akarken ayarlar kilitli; bitince değiştirip yeniden başlatın.</div>'); } else if (!on && n) n.remove();
    },
    // yeniden çizimden sonra odağı aynı öğeye geri ver (klavye kullanımı kopmasın)
    _keepFocus(box, paint) {
        const a = document.activeElement, key = a && box.contains(a) ? [...a.attributes].filter(x => x.name.startsWith('data-')).map(x => '[' + x.name + '="' + CSS.escape(x.value) + '"]').join('') : null, y = window.scrollY;
        paint();
        if (key) { const b = box.querySelector(key); if (b) { b.focus({ preventScroll: true }); window.scrollTo(0, y); } }
    },
    // profil paneli: HTTP profili metot politikası ve persistence; altında tmsh karşılığı
    _panel() {
        const t = this._t, P = this._prof, box = this._$('.cg-ar-panel'), st = this._st(t.id), E = cgEsc;
        const ALL = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'TRACE', 'CONNECT', 'PROPFIND', 'LOCK', 'UNLOCK'];
        const cmds = this._profCmds(t, P);
        box.innerHTML = `<div class="cg-ar-ph2"><i class="fas fa-sliders-h"></i> <b>${E(t.vs.name)}</b> profil ayarları <small>(iRule\'dan önce uygulanır; kodsuz çözüm ucuzdur)</small></div>
            <div class="cg-ar-pgrid">
            ${t.panel.includes('methods') ? `<div class="cg-ar-pf"><span class="cg-ar-pl">HTTP profili · known-methods</span><div class="cg-ar-mets">${ALL.map(m => `<label class="cg-ar-met${P.known.includes(m) ? ' is-on' : ''}"><input type="checkbox" data-m="${m}"${P.known.includes(m) ? ' checked' : ''}> ${m}</label>`).join('')}</div>
                <label class="cg-ar-pl">unknown-method <select data-p="unknown">${['allow', 'reject'].map(v => `<option${P.unknown === v ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
                ${(() => { const off = this._profDef({}).known.filter(m => !P.known.includes(m)); return off.length && P.unknown === 'allow' ? `<div class="cg-ar-pwarn" role="status"><i class="fas fa-exclamation-triangle"></i> Listeden çıkardığın ${off.map(E).join(', ')} hâlâ <b>geçer</b>: listede olmayan metot unknown-method kuralına düşer ve kural şu an <b>allow</b>. Engellemek için <b>reject</b> seç.</div>` : P.unknown === 'reject' ? `<div class="cg-ar-pok"><i class="fas fa-check"></i> Listede olmayan her metot (${off.length ? off.map(E).join(', ') + ', ' : ''}FOO gibi uydurmalar dahil) bağlantı sıfırlamasıyla kesilir; kurala hiç ulaşmaz.</div>` : ''; })()}</div>` : ''}
            ${t.panel.includes('persist') ? `<div class="cg-ar-pf"><label class="cg-ar-pl">Persistence <select data-p="persist">${[['none', 'yok'], ['cookie', 'cookie (insert)'], ['source-addr', 'source-addr']].map(([v, l]) => `<option value="${v}"${P.persist === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>` : ''}
            </div>
            <pre class="cg-ar-tmsh">${cmds.length ? cmds.map(E).join('\n') : '# varsayılan ayarlar (değişiklik yok)'}</pre>`;
        const save = () => { st.prof = JSON.parse(JSON.stringify(this._prof)); this._save(); this._keepFocus(box, () => this._panel()); };
        box.querySelectorAll('[data-m]').forEach(x => x.addEventListener('change', () => { if (this._run) { this._panel(); return; } const m = x.dataset.m; P.known = x.checked ? P.known.concat([m]) : P.known.filter(y => y !== m); save(); }));
        box.querySelectorAll('[data-p]').forEach(x => x.addEventListener('change', () => { if (this._run) { this._panel(); return; } P[x.dataset.p] = x.value; save(); }));
    },
    _gutter(hits) {
        const ta = this._$('textarea'), n = ta.value.split('\n').length;
        this._$('.cg-ar-gut').innerHTML = Array.from({ length: n }, (x, k) => `<span>${k + 1}</span>`).join('');
    },
    _edit() { this._$('textarea').hidden = false; this._$('.cg-ar-gut').hidden = false; this._$('.cg-ar-view').hidden = true; this._$('textarea').focus(); },
    // çalışırken salt okunur görünüm: satır vurgusu + satır başına çalışma sayısı
    _view(code) {
        const v = this._$('.cg-ar-view'); v.innerHTML = code.split('\n').map((l, k) => `<li data-l="${k + 1}"><span class="cg-ar-ln">${k + 1}</span><code>${cgEsc(l) || ' '}</code><span class="cg-ar-hc"></span></li>`).join('');
        v.hidden = false; this._$('textarea').hidden = true; this._$('.cg-ar-gut').hidden = true; v.title = 'Düzenlemek için tıklayın';
    },

    // ── kaydet: BIG-IP gibi doğrula (01070151 / 01070394 biçimi tmsh ile aynı)
    _compile(code) {
        const R = window.CgIRule, t = this._t, name = this.RULE;
        if (t.allowEmpty && !code.split('\n').some(l => l.trim() && !l.trim().startsWith('#'))) return { c: { events: [], refs: [] }, empty: true };
        const c = R.compile(code);
        if (c.err) {
            const at = '/Common/' + name + ':' + (c.line || 1) + ': error: ';
            const msg = c.kind === 'proc' ? '[undefined procedure: ' + c.cmd + '][' + (c.text || c.cmd) + ']' : c.kind === 'ctx' ? '[command is not valid in current event context (' + c.event + ')][' + c.cmd + ']' : c.kind === 'event' ? '[unknown event (' + c.event + ')][when ' + c.event + ' {]' : c.kind === 'toplevel' ? '[command is not valid in the current scope][' + c.cmd + ']' : '[parse error: ' + c.err + ']';
            return { err: '01070151:3: Rule [/Common/' + name + '] error: ' + at + msg, line: c.line };
        }
        for (const r of c.refs || []) {
            if (r.type === 'pool' && !t.pools[r.name]) return { err: '01070151:3: Rule [/Common/' + name + '] error: Unable to find pool (' + r.name + ') referenced at line ' + r.line + ': [' + r.text + ']', line: r.line };
            if (r.type === 'dg' && !(t.dg || {})[r.name]) return { err: '01070151:3: Rule [/Common/' + name + '] error: Unable to find value_list (' + r.name + ') referenced at line ' + r.line + ': [' + r.text + ']', line: r.line };
        }
        if (!c.events.length) { if (t.allowEmpty) return { c, empty: true }; return { err: '[Simülatör] Kuralda hiç "when" bloğu yok.' }; }
        return { c };
    },

    // trafik satırı → istek: [istemci, yöntem, host, uri, { başlık: değer }]
    _req(t, x) {
        const [cid, method, host, uri, hdr] = x, cl = t.clients.find(c => c.id === cid), h = hdr || {};
        return { cl, method, host, uri, path: uri.split('?')[0], query: uri.includes('?') ? uri.slice(uri.indexOf('?') + 1) : '', ip: cl.ip, ua: h['User-Agent'] || cl.ua,
            hdrs: Object.entries(h).filter(([n]) => n !== 'User-Agent') };
    },
    // ── tek isteği çalıştır: olay/satır izi ve sonuç
    _sim(c, q, rr, env) {
        const R = window.CgIRule, t = this._t, trace = [], logs = [], E = env || {}, prof = E.prof || this._profDef(t), jar = E.jar || {};
        let cur = null;
        const ctx = { vars: {}, statics: {}, steps: 0, table: {}, now: () => Date.now(),
            trace: l => { if (cur && cur.lines[cur.lines.length - 1] !== l) cur.lines.push(l); },   // aynı satırdaki iç içe [komut] bir kez sayılır
            log: (f, m) => logs.push('info tmm[11925]: Rule /Common/' + this.RULE + ' <' + ctx.event + '>: ' + m), note: () => {},
            req: { method: q.method, uri: q.uri, headers: [['Host', q.host], ['User-Agent', q.ua], ['Accept', '*/*']].concat((q.hdrs || []).map(h => h.slice()), Object.keys(jar).length ? [['Cookie', Object.entries(jar).map(([k, v]) => k + '=' + v).join('; ')]] : []) },
            resp: { status: 200, headers: [['Content-Type', 'text/html']], body: '' },
            client: { ip: q.ip, port: 50000 + Math.floor(Math.random() * 9000) }, vs: Object.assign({}, t.vs), lb: null,
            act: { off: new Set() }, hasPool: n => !!t.pools[n], activeMembers: n => (t.pools[n] || []).filter(m => !(t.down || []).includes(m)).length,
            dg: n => (t.dg || {})[n] || null };
        const fire = name => { const step = { ev: name, lines: [], rule: false }; trace.push(step); for (const ev of c.events.filter(e => e.name === name)) { step.rule = true; cur = step; const r = R.runEvent(ctx, ev); cur = null; if (!r.ok) return r; } return { ok: true }; };
        const fail = (r, ev) => { logs.push('err tmm[11925]: 01220001:3: TCL error: /Common/' + this.RULE + ' <' + ev + '> - ' + r.err); return { kind: 'reset', why: 'TCL hatası', line: r.line }; };
        let out;
        let r = fire('CLIENT_ACCEPTED');
        if (!r.ok) out = fail(r, 'CLIENT_ACCEPTED');
        else if (ctx.act.reject || ctx.act.drop) out = { kind: 'reset', why: 'reject' };
        // HTTP profili: ayrıştırıcı iRule'dan önce metodu denetler (known-methods / unknown-method reject → bağlantı sıfırlanır)
        if (!out && t.panel && !prof.known.includes(q.method) && prof.unknown === 'reject') { trace.push({ ev: 'HTTP_REQUEST', lines: [], rule: false, prof: true }); out = { kind: 'reset', why: 'metot (HTTP profili)', byProf: true }; }
        if (!out) { r = fire('HTTP_REQUEST'); if (!r.ok) out = fail(r, 'HTTP_REQUEST'); }
        if (!out && (ctx.act.reject || ctx.act.drop)) out = { kind: 'reset', why: 'reject' };
        const bigResp = extra => { const H = (ctx.act.respond.headers || []).map(h => h.slice()), loc = H.find(h => /^location$/i.test(h[0])); return Object.assign({ kind: 'resp', code: ctx.act.respond.code, loc: loc ? loc[1] : null, hdrs: H, body: ctx.act.respond.body || '' }, extra || {}); };
        if (!out && ctx.act.respond) out = bigResp();
        if (!out) {
            const pool = ctx.act.pool || t.vs.pool, L = (t.pools[pool] || []).filter(m => !(t.down || []).includes(m));
            if (!L.length) { r = fire('LB_FAILED'); if (!r.ok) out = fail(r, 'LB_FAILED'); else if (ctx.act.respond) out = bigResp({ pool, failed: true }); else out = { kind: 'reset', why: 'pool\'da kullanılabilir üye yok', pool }; }
            else {
                // persistence: cookie insert (BIGipServer<pool>) ya da kaynak adres; kayıt yoksa round robin
                const ck = 'BIGipServer' + pool, src = E.src || {}; let member = null, persisted = false, setCookie = null;
                if (prof.persist === 'cookie' && jar[ck] && L.includes(jar[ck])) { member = jar[ck]; persisted = true; }
                if (prof.persist === 'source-addr' && src[pool + '|' + q.ip] && L.includes(src[pool + '|' + q.ip])) { member = src[pool + '|' + q.ip]; persisted = true; }
                if (!member) { rr[pool] = ((rr[pool] === undefined ? -1 : rr[pool]) + 1) % L.length; member = L[rr[pool]]; }
                if (prof.persist === 'cookie' && !persisted) setCookie = [ck, member];
                if (prof.persist === 'source-addr') src[pool + '|' + q.ip] = member;
                ctx.lb = { pool, ip: member.split(':')[0], port: +member.split(':')[1] };
                r = fire('LB_SELECTED'); if (!r.ok) out = fail(r, 'LB_SELECTED');
                else {
                    // sunucuya giden istek (yeniden yazılmış URI ve başlıklarıyla) ve sunucunun yanıtı
                    const sent = { uri: ctx.req.uri, path: ctx.req.uri.split('?')[0], headers: ctx.req.headers.map(h => h.slice()) };
                    const sv = t.server ? t.server(sent, member, pool) : null;
                    ctx.resp = { status: sv && sv.status || 200, headers: (sv && sv.headers || [['Content-Type', 'text/html']]).map(h => h.slice()), body: sv && sv.body || '' };
                    ctx.event = 'HTTP_RESPONSE'; r = fire('HTTP_RESPONSE');
                    out = !r.ok ? fail(r, 'HTTP_RESPONSE') : ctx.act.respond ? bigResp({ pool, member, fromResp: true })
                        : { kind: 'pool', pool, member, persisted, setCookie, code: ctx.resp.status, uri: sent.uri, sent: sent.headers, hdrs: ctx.resp.headers.concat(setCookie ? [['Set-Cookie', setCookie[0] + '=' + setCookie[1] + '; path=/; Httponly']] : []) };
                }
            }
        }
        return { out, trace, logs };
    },
    _hv(L, n) { return (L || []).filter(h => h[0].toLowerCase() === n.toLowerCase()).map(h => h[1]); },
    _extras(e, o) {
        const out = [];
        if (e.uri) out.push('sunucuya ' + (o ? (o.uri || '—') : e.uri));
        Object.keys(e.sent || {}).forEach(n => { const v = o ? this._hv(o.sent, n) : (e.sent[n] === null ? [] : [e.sent[n]]); out.push('→ ' + n + ': ' + (v.length ? v.join(', ') : 'yok')); });
        Object.keys(e.hdr || {}).forEach(n => { const v = o ? this._hv(o.hdrs, n) : (e.hdr[n] === null ? [] : [e.hdr[n]]); out.push(n + ': ' + (v.length ? v.join(', ') : 'yok')); });
        return out.length ? ' · ' + out.join(' · ') : '';
    },
    // beklenen ve gerçekleşeni parçalara böl; yalnız tutmayan parça kırmızı
    _parts(e, o) {
        const hv = (L, n) => this._hv(L, n), P = [];
        const base = x => x.kind === 'reset' ? 'Sıfırlandı (' + x.why + ')' : x.kind === 'pool' ? x.pool : x.code + (x.loc ? ' → ' + x.loc : '');
        const eBase = e.deny ? 'Engellenir (reset / 403 / 405)' : e.pool ? e.pool : e.reset ? 'Sıfırlanır' : e.code + (e.loc ? ' → ' + e.loc : '');
        if (!o) P.push([eBase, true]); else P.push([base(o), e.deny ? this._match(e, o) : e.pool ? o.kind === 'pool' && o.pool === e.pool : e.reset ? o.kind === 'reset' : o.kind === 'resp' && o.code === e.code && (!e.loc || o.loc === e.loc)]);
        if (e.apartFrom) P.push([(o ? '' : '≠ ') + e.apartFrom + ' üyesinden farklı' + (e.apartTo ? ' (' + e.apartTo + ')' : ''), !o || !e.apartBad]);
        if (e.sticky) { if (!o) P.push([e.stickyTo ? 'aynı üye: ' + e.stickyTo : 'ilk istek: üye seçilir', true]); else if (o.kind === 'pool') P.push([(o.persisted ? 'kalıcı: ' : 'yeni seçim: ') + o.member, !e.stickyTo || o.member === e.stickyTo]); }
        if (o && o.kind === 'reset') return P;
        if (e.pool && e.code) P.push([String(o ? o.code : e.code), !o || o.code === e.code]);
        if (e.allow) { const a = o ? this._hv(o.hdrs, 'Allow') : [e.allow.join(', ')]; P.push(['Allow: ' + (a.length ? a.join(' | ') : 'yok'), !o || this._match(e, o)]); }
        if (e.uri && (!o || o.kind === 'pool')) P.push(['sunucuya ' + (o ? o.uri : e.uri), !o || o.uri === e.uri]);
        const hp = (want, L, pre) => Object.keys(want || {}).forEach(n => { const w = want[n], v = o ? hv(L, n) : (w === null ? [] : [w]); P.push([pre + n + ': ' + (v.length ? v.join(' | ' + n + ': ') + (v.length > 1 ? ' (' + v.length + ' ayrı başlık)' : '') : 'yok'), !o || (w === null ? !v.length : v.length === 1 && v[0] === w)]); });
        if (!o || o.kind === 'pool') hp(e.sent, o && o.sent, '→ ');
        hp(e.hdr, o && o.hdrs, '');
        return P;
    },
    _chips(P) { return P.map(([t, ok]) => `<span class="cg-ar-chip${ok ? '' : ' is-bad'}">${cgEsc(t)}</span>`).join(''); },
    _label(o, e) {
        if (!o) return '';
        e = e || {};
        if (o.kind === 'pool') return o.pool + (e.code ? ' · ' + o.code : '') + this._extras(e, o);
        if (o.kind === 'resp') return o.code + (o.loc ? ' → ' + o.loc : '') + this._extras(Object.assign({}, e, { uri: null, sent: null }), o);
        return 'Sıfırlandı (' + o.why + ')';
    },
    _expLabel(e) { return (e.pool ? e.pool + (e.code ? ' · ' + e.code : '') : e.reset ? 'Sıfırlanır' : e.code + (e.loc ? ' → ' + e.loc : '')) + this._extras(e); },
    // ═══ Meydan Okuma: görünür testlerle çalıştır, gizlilerle gönder ═══
    _moRun(t, code, all) {
        this._t = t; const k = this._compile(code); if (k.err) return { err: k.err };
        const tests = t.tests.filter(x => all || !x.hidden); let cost = 0;
        const results = tests.map(x => { const q = this._req(t, x.req), res = this._sim(k.c, q, {}, { jar: {} }); cost += res.trace.reduce((a, s2) => a + s2.lines.length, 0); return { test: x, q, res, good: this._match(x.expect, res.out) }; });
        const rx = (code.match(/\b(regexp|regsub|matches_regex)\b/g) || []).length * 10;
        return { results, cost: cost + rx, rx, pass: results.filter(r => r.good).length, n: results.length };
    },
    _mo(t) {
        const E = cgEsc, st = this._mst(t.id), vis = t.tests.filter(x => !x.hidden), hid = t.tests.length - vis.length;
        this._t = t; this._hint = 0;
        this._root.innerHTML = `<div class="cg-ar cg-mo">
            <nav class="cg-ts-crumbs"><a href="#/arena"><i class="fas fa-chess-knight"></i> iRule Arenası</a><i class="fas fa-chevron-right"></i><span>Meydan Okuma</span><i class="fas fa-chevron-right"></i><span>${E(t.title)}</span></nav>
            <div class="cg-ar-brief"><div><h2><i class="fas fa-flag-checkered"></i> ${E(t.title)}</h2><p>${t.story}</p><p class="cg-mo-meta"><span>${vis.length} görünür test</span><span>${hid} gizli test</span><span>maliyet = çalışan kural satırı + regex cezası</span></p></div>
                <ol class="cg-ar-goals">${t.reqs.map(g => `<li>${g}</li>`).join('')}</ol></div>
            <div class="cg-ar-desk">
                <section class="cg-ar-ed"><div class="cg-ar-edh"><span><i class="fas fa-code"></i> ltm rule <b>${this.RULE}</b> <small class="cg-ar-kbd">Esc → Tab: editörden çık</small></span><span class="cg-ar-edtools"><button type="button" data-a="hint" class="cg-ar-lnk"><i class="fas fa-lightbulb"></i> İpucu</button><button type="button" data-a="reset" class="cg-ar-lnk" title="Başlangıç koduna dön"><i class="fas fa-undo"></i></button></span></div>
                    <div class="cg-ar-edbox"><div class="cg-ar-gut" aria-hidden="true"></div><textarea spellcheck="false" autocapitalize="off" autocomplete="off" aria-label="iRule kodu"></textarea><ol class="cg-ar-view" hidden></ol></div>
                    <div class="cg-ar-edmsg" role="status"></div><div class="cg-ar-hintbox" hidden></div>
                    <div class="cg-ar-ctl"><button type="button" class="cg-mo-run" data-a="run"><i class="fas fa-play"></i> Çalıştır <small>(görünür testler)</small></button><button type="button" class="cg-ar-go" data-a="submit"><i class="fas fa-paper-plane"></i> Gönder <small>(tüm testler)</small></button></div></section>
                <section class="cg-mo-tests" aria-label="Testler"></section>
            </div>
            <div class="cg-ar-done" hidden></div></div>`;
        const $ = s2 => this._root.querySelector(s2); this._$ = $;
        const ta = $('textarea'); ta.value = st.code != null ? st.code : t.start; this._gutter();
        ta.addEventListener('input', () => { st.code = ta.value; this._save(); this._gutter(); });
        ta.addEventListener('scroll', () => { $('.cg-ar-gut').scrollTop = ta.scrollTop; });
        ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.dataset.esc = '1'; return; } if (e.key === 'Tab' && ta.dataset.esc) { delete ta.dataset.esc; return; } delete ta.dataset.esc; if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('    ', a, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this._moGo(e.shiftKey); } });
        $('[data-a="run"]').addEventListener('click', () => this._moGo(false));
        $('[data-a="submit"]').addEventListener('click', () => this._moGo(true));
        $('[data-a="reset"]').addEventListener('click', () => { ta.value = t.start; st.code = null; this._save(); this._gutter(); });
        $('[data-a="hint"]').addEventListener('click', () => { this._hint = Math.min(this._hint + 1, t.hints.length); st.hints = Math.max(st.hints, this._hint); this._save(); const box = $('.cg-ar-hintbox'); box.hidden = false; box.innerHTML = t.hints.slice(0, this._hint).map((x, k) => `<p><b>İpucu ${k + 1}</b> ${x}</p>`).join(''); });
        this._moTests(null);
    },
    _moTests(R, all) {
        const t = this._t, vis = t.tests.filter(x => !x.hidden), box = this._$('.cg-mo-tests'), E = cgEsc;
        const byTest = new Map((R && R.results || []).map(r => [r.test, r]));
        const row = (x, k) => { const q = this._req(t, x.req), r = byTest.get(x);
            return `<li class="cg-mo-t${r ? (r.good ? ' is-ok' : ' is-bad') : ''}"><div class="cg-mo-th"><span class="cg-mo-ti">${r ? (r.good ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>') : k + 1}</span><code>${E(q.method)} ${E(q.host + q.uri)}</code><small>${E(q.cl.label)} · ${E(q.ip)}${x.req[4] ? ' · ' + E(Object.keys(x.req[4]).join(', ')) : ''}</small></div>
                <div class="cg-mo-tb"><span class="cg-mo-l">Beklenen</span>${this._chips(this._parts(x.expect))}</div>
                ${r ? `<div class="cg-mo-tb"><span class="cg-mo-l">Gerçekleşen</span>${this._chips(this._parts(x.expect, r.res.out))}</div>` : ''}</li>`; };
        const hidR = R && all ? R.results.filter(r => r.test.hidden) : null;
        box.innerHTML = `<div class="cg-mo-h"><b><i class="fas fa-vial"></i> Görünür testler</b>${R ? `<span>${R.results.filter(r => !r.test.hidden && r.good).length}/${vis.length}</span>` : ''}</div><ol class="cg-mo-list">${vis.map(row).join('')}</ol>
            <div class="cg-mo-h"><b><i class="fas fa-eye-slash"></i> Gizli testler</b><span>${hidR ? hidR.filter(r => r.good).length + '/' + hidR.length : t.tests.length - vis.length + ' test · Gönder ile çalışır'}</span></div>
            ${hidR ? `<ul class="cg-mo-hid">${hidR.map(r => `<li class="${r.good ? 'is-ok' : 'is-bad'}"><i class="fas fa-${r.good ? 'check' : 'times'}"></i> ${r.good ? 'geçti' : 'kaldı: <b>' + E(r.test.tag || 'gizli durum') + '</b>'}</li>`).join('')}</ul>` : '<p class="cg-mo-note">Gizli testlerin girdisi gösterilmez; kalan testin yalnız konusu söylenir.</p>'}`;
    },
    _moGo(all) {
        const t = this._t, st = this._mst(t.id), $ = this._$, code = $('textarea').value, msg = $('.cg-ar-edmsg');
        const R = this._moRun(t, code, all);
        if (R.err) { msg.className = 'cg-ar-edmsg is-err'; msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + cgEsc(R.err) + '<small>Kural kaydedilmedi; testler çalışmadı.</small>'; this._moTests(null); return; }
        msg.className = 'cg-ar-edmsg is-ok'; msg.innerHTML = '<i class="fas fa-check-circle"></i> ' + (all ? 'Gönderildi: ' : 'Çalıştırıldı: ') + R.pass + '/' + R.n + ' test geçti · maliyet ' + R.cost + (R.rx ? ' (regex cezası ' + R.rx + ')' : '');
        this._moTests(R, all);
        const d = $('.cg-ar-done');
        if (!all) { d.hidden = true; return; }
        st.subs++;
        if (R.pass === R.n) {
            const ref = this._moRun(t, t.solution, true).cost, stars = R.cost <= t.cost[2] ? 3 : R.cost <= t.cost[1] ? 2 : 1;
            st.done = true; st.stars = Math.max(st.stars, stars); st.best = st.best == null ? R.cost : Math.min(st.best, R.cost); this._save();
            const nx = (window.CG_ARENA_MO || [])[(window.CG_ARENA_MO || []).indexOf(t) + 1];
            d.hidden = false; d.className = 'cg-ar-done is-ok';
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-trophy"></i> Tüm testler geçti! <span class="cg-ar-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div>
                <p class="cg-ar-dm">Maliyetin <b>${R.cost}</b> · örnek çözüm ${ref} · ★★★ için ≤ ${t.cost[2]}, ★★ için ≤ ${t.cost[1]} · ${st.subs} gönderim · en iyi ${st.best}</p>
                <details><summary>Örnek çözümü karşılaştır</summary><pre class="cg-ar-tmsh">${cgEsc(t.solution)}</pre></details>
                <div class="cg-ar-db">${nx ? `<a class="cg-ar-go" href="#/arena/meydan/${nx.id}"><i class="fas fa-arrow-right"></i> Sonraki meydan okuma</a>` : ''}<a class="cg-ar-ghost" href="#/arena"><i class="fas fa-chess-knight"></i> Arena</a></div>`;
        } else { this._save(); d.hidden = false; d.className = 'cg-ar-done is-bad'; d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-exclamation-triangle"></i> ${R.n - R.pass} test kaldı.</div><p class="cg-ar-dm">Kalan gizli testlerin konusuna bakın; genellikle bir kenar durumudur (büyük/küçük harf, önek, sorgu dizesi, metot).</p>`; }
        d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    // ═══ WAF Masası: ASM eğitim motoru ile politika ayarı ve istek logu ═══
    _wReq(t, x) { const c = t.clients[x.c]; return { method: x.m, uri: x.u, body: x.b || '', form: !!x.b, ip: c.ip, headers: [['Host', 'www.example.com'], ['User-Agent', (x.h && x.h['User-Agent']) || c.ua]].concat(x.b ? [['Content-Type', 'application/x-www-form-urlencoded']] : []) }; },
    _wPolicy(cfg) {
        const P = [{ name: '*', meta: !!(cfg.params['*'] && cfg.params['*'].meta) }].concat(Object.entries(cfg.params).filter(([n]) => n !== '*').map(([n, v]) => ({ name: n, meta: !!v.meta })));
        return window.CgASM.policy({ name: cfg.name || 'waf', blocking: !!cfg.blocking, methods: cfg.methods.slice(), filetypes: cfg.filetypes.length ? cfg.filetypes.slice() : ['*'], parameters: P, sigOverrides: (cfg.overrides || []).slice() });
    },
    _wEval(t, cfg, list) { const pol = this._wPolicy(cfg); return list.map(x => { const r = window.CgASM.evaluate(pol, this._wReq(t, x)); return { x, r, good: r.blocked === x.block }; }); },
    // log modu: kararlar → politika (base üzerine)
    _wFromDec(t, dec, entries) {
        const cfg = JSON.parse(JSON.stringify(t.base)); cfg.overrides = [];
        entries.forEach((e, i) => { const a = dec[i]; if (!a || a === 'none') return;
            if (a === 'transparent') cfg.blocking = false;
            if (a === 'method' && !cfg.methods.includes(e.x.m)) cfg.methods.push(e.x.m);
            if (a === 'meta') e.r.violations.filter(v => v.name === 'Illegal meta character in parameter value').forEach(v => { const pn = v.detail.split(':')[0]; cfg.params[pn] = Object.assign({}, cfg.params[pn], { meta: true }); });
            if (a === 'sigall') e.r.sigs.forEach(sg => { if (!cfg.overrides.some(o => o.sig === sg.id && !o.param)) cfg.overrides.push({ sig: sg.id }); });
        });
        return cfg;
    },
    _waf(t) {
        const E = cgEsc, st = this._wst(t.id); this._t = t; this._hint = 0;
        this._root.innerHTML = `<div class="cg-ar cg-waf">
            <nav class="cg-ts-crumbs"><a href="#/arena"><i class="fas fa-chess-knight"></i> iRule Arenası</a><i class="fas fa-chevron-right"></i><span>WAF Masası</span><i class="fas fa-chevron-right"></i><span>${E(t.title)}</span></nav>
            <div class="cg-ar-brief"><div><h2><i class="fas fa-shield-alt"></i> ${E(t.title)}</h2><p>${t.brief}</p><p class="cg-mo-meta"><span>İmzalar eğitim amaçlı (E-xxxx), gerçek F5 imza veritabanı değildir</span><span>Violation rating sadeleştirilmiştir</span></p></div>
                <ol class="cg-ar-goals">${t.goals.map(g => `<li>${g}</li>`).join('')}</ol></div>
            <section class="cg-waf-main"></section>
            <div class="cg-ar-hintbox cg-waf-hint" hidden></div>
            <section class="cg-ar-flow" hidden><div class="cg-ar-flh"><span><i class="fas fa-stream"></i> Sonuç</span><span class="cg-ar-score"></span></div><div class="cg-ar-tbl"><table><thead><tr><th>#</th><th>İstemci</th><th>İstek</th><th>Beklenen</th><th>ASM kararı ve ihlaller</th><th></th></tr></thead><tbody></tbody></table></div></section>
            <div class="cg-waf-detail" hidden></div>
            <div class="cg-ar-done" hidden></div></div>`;
        this._$ = s2 => this._root.querySelector(s2);
        if (t.mode === 'policy') this._wPolicyUI(); else this._wLogUI();
    },
    _wHintBtn() { const t = this._t, st = this._wst(t.id); return `<button type="button" class="cg-ar-lnk cg-waf-hb" data-a="hint"><i class="fas fa-lightbulb"></i> İpucu</button>`; },
    _wBindHint() { const t = this._t, st = this._wst(t.id), b = this._$('[data-a="hint"]'); if (b) b.addEventListener('click', () => { this._hint = Math.min(this._hint + 1, t.hints.length); st.hints = Math.max(st.hints, this._hint); this._save(); const box = this._$('.cg-waf-hint'); box.hidden = false; box.innerHTML = t.hints.slice(0, this._hint).map((x, k) => `<p><b>İpucu ${k + 1}</b> ${x}</p>`).join(''); }); },
    _wPolicyUI() {
        const t = this._t, st = this._wst(t.id), E = cgEsc, cfg = this._wcfg = st.cfg ? JSON.parse(JSON.stringify(st.cfg)) : JSON.parse(JSON.stringify(t.base));
        const M = ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'TRACE'];
        const main = this._$('.cg-waf-main');
        const paint = () => { main.innerHTML = `<div class="cg-ar-panel"><div class="cg-ar-ph2"><i class="fas fa-sliders-h"></i> <b>${E(t.base.name)}</b> politika ayarları ${this._wHintBtn()}</div>
            <div class="cg-ar-pgrid">
                <div class="cg-ar-pf"><label class="cg-ar-pl">Uygulama modu <select data-w="blocking"><option value="0"${cfg.blocking ? '' : ' selected'}>Transparent (yalnız log)</option><option value="1"${cfg.blocking ? ' selected' : ''}>Blocking</option></select></label>
                    <span class="cg-ar-pl">İzinli metotlar</span><div class="cg-ar-mets">${M.map(m => `<label class="cg-ar-met${cfg.methods.includes(m) ? ' is-on' : ''}"><input type="checkbox" data-wm="${m}"${cfg.methods.includes(m) ? ' checked' : ''}> ${m}</label>`).join('')}</div></div>
                <div class="cg-ar-pf"><label class="cg-ar-pl">İzinli dosya türleri <input type="text" data-w="filetypes" value="${E(cfg.filetypes.join(', '))}" size="30" spellcheck="false"></label><small class="cg-waf-s">"*" hepsi; uzantısız yollar için <code>no_ext</code></small>
                    <span class="cg-ar-pl">Parametreler (meta karakter izni; imza denetimi her zaman açık)</span>
                    <div class="cg-ar-mets">${Object.keys(cfg.params).map(n => `<label class="cg-ar-met${cfg.params[n].meta ? ' is-on' : ''}"><input type="checkbox" data-wp="${E(n)}"${cfg.params[n].meta ? ' checked' : ''}> ${n === '*' ? '* (diğer tüm parametreler)' : E(n)}</label>`).join('')}</div></div>
            </div>
            <pre class="cg-ar-tmsh">${E(this._wJson(cfg))}</pre>
            <div class="cg-ar-ctl cg-waf-ctl"><button type="button" class="cg-ar-go" data-a="send"><i class="fas fa-paper-plane"></i> Politikayı yayınla ve trafiği gönder</button></div></div>`;
            const save = () => { st.cfg = JSON.parse(JSON.stringify(cfg)); this._save(); this._keepFocus(main, paint); };
            main.querySelector('[data-w="blocking"]').addEventListener('change', e => { cfg.blocking = e.target.value === '1'; save(); });
            // yazarken kaydet, paneli yeniden çizme (aksi halde gönder düğmesine ilk tıklama kaybolur); yalnız önizleme güncellenir
            main.querySelector('[data-w="filetypes"]').addEventListener('input', e => { cfg.filetypes = e.target.value.split(/[\s,]+/).map(x => x.trim().toLowerCase()).filter(Boolean); st.cfg = JSON.parse(JSON.stringify(cfg)); this._save(); const pr = main.querySelector('.cg-ar-tmsh'); if (pr) pr.textContent = this._wJson(cfg); });
            main.querySelectorAll('[data-wm]').forEach(x => x.addEventListener('change', () => { const m = x.dataset.wm; cfg.methods = x.checked ? cfg.methods.concat([m]) : cfg.methods.filter(y => y !== m); save(); }));
            main.querySelectorAll('[data-wp]').forEach(x => x.addEventListener('change', () => { cfg.params[x.dataset.wp] = Object.assign({}, cfg.params[x.dataset.wp], { meta: x.checked }); save(); }));
            main.querySelector('[data-a="send"]').addEventListener('click', () => this._wSend(this._wEval(t, cfg, t.traffic)));
            this._wBindHint(); };
        paint();
    },
    // declarative JSON'a yakın özet (öğretim amaçlı; tam şema değil)
    _wJson(cfg) {
        const o = { policy: { name: cfg.name, enforcementMode: cfg.blocking ? 'blocking' : 'transparent', methods: cfg.methods.map(n => ({ name: n })), filetypes: (cfg.filetypes.length ? cfg.filetypes : ['*']).map(n => ({ name: n, type: n === '*' ? 'wildcard' : 'explicit' })),
            parameters: Object.entries(cfg.params).map(([n, v]) => ({ name: n, type: n === '*' ? 'wildcard' : 'explicit', metacharsOnParameterValueCheck: !v.meta, attackSignaturesCheck: true })) } };
        return '// declarative politikaya yakın özet (öğretim amaçlı, tam şema değil)\n' + JSON.stringify(o, null, 1).replace(/\n\s*/g, ' ');
    },
    _wRow(res, i) {
        const t = this._t, c = t.clients[res.x.c], r = res.r, E = cgEsc;
        const act = r.blocked ? '<span class="cg-ar-chip is-bad">Blocked · ' + r.supportId + '</span>' : r.violations.length ? '<span class="cg-ar-chip">Geçti (alarm)</span>' : '<span class="cg-ar-chip">Geçti</span>';
        return `<tr class="${res.good ? 'is-ok' : 'is-bad'}" data-i="${i}" tabindex="0" title="İstek detayı"><td>${i + 1}${res.hidden ? '<small class="cg-waf-new">yeni</small>' : ''}</td><td><i class="fas ${c.icon}"></i> ${E(c.label)}</td><td><code>${E(res.x.m)} ${E(res.x.u)}</code>${res.x.b ? '<br><small>' + E(decodeURIComponent(res.x.b.replace(/\+/g, ' '))) + '</small>' : ''}</td>
            <td><span class="cg-ar-chip">${res.x.block ? 'Engellenmeli' : 'Geçmeli'}</span><br><small>${E(res.x.why)}</small></td><td>${act} ${r.violations.map(v => `<span class="cg-ar-chip">${E(v.name)}</span>`).join('')}</td><td class="cg-ar-ok">${res.good ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>'}</td></tr>`;
    },
    _wDetail(res) {
        const r = res.r, c = this._t.clients[res.x.c], E = cgEsc, box = this._$('.cg-waf-detail');
        box.hidden = false;
        box.innerHTML = `<div class="cg-waf-dh"><b><i class="fas fa-file-alt"></i> İstek detayı</b><button type="button" class="cg-ar-lnk" data-a="close">Kapat ✕</button></div>
            <table class="cg-waf-dt"><tr><th>Support ID</th><td>${r.supportId || '—'}</td></tr><tr><th>Politika</th><td>${E(r.policy)}</td></tr><tr><th>Durum</th><td>${E(r.status)}</td></tr><tr><th>Violation rating</th><td>${r.rating} / 5 <small>(sadeleştirilmiş)</small></td></tr>
            <tr><th>İstemci</th><td>${E(c.label)} · ${E(c.ip)} · ${E(c.ua)}</td></tr><tr><th>İstek</th><td><code>${E(res.x.m)} ${E(res.x.u)}</code>${res.x.b ? '<br><code>' + E(res.x.b) + '</code>' : ''}</td></tr>
            <tr><th>İhlaller</th><td>${r.violations.length ? r.violations.map(v => `<div><b>${E(v.name)}</b> — ${E(v.detail || '')}${v.sub ? ' <small>(' + E(v.sub) + ')</small>' : ''}</div>`).join('') : 'yok'}</td></tr>
            <tr><th>İmzalar</th><td>${r.sigs.length ? r.sigs.map(sg => `<div><code>${sg.id}</code> ${E(sg.name)} · ${E(sg.where)}${sg.staged ? ' <small>(staging: engellemez)</small>' : ''}</div>`).join('') : 'yok'}</td></tr></table>
            ${r.blocked ? `<details><summary>Kullanıcının gördüğü sayfa (HTTP 200)</summary><pre class="cg-ar-tmsh">${E(window.CgASM.blockPage(r.supportId))}</pre></details>` : ''}`;
        box.querySelector('[data-a="close"]').addEventListener('click', () => { box.hidden = true; });
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    _wSend(results) {
        const t = this._t, st = this._wst(t.id), $ = this._$, fl = $('.cg-ar-flow'), tb = fl.querySelector('tbody');
        fl.hidden = false; tb.innerHTML = results.map((x, i) => this._wRow(x, i)).join('');
        tb.querySelectorAll('tr').forEach(tr => { const h = () => this._wDetail(results[+tr.dataset.i]); tr.addEventListener('click', h); tr.addEventListener('keydown', e => { if (e.key === 'Enter') h(); }); });
        const fp = results.filter(x => !x.x.block && x.r.blocked).length, miss = results.filter(x => x.x.block && !x.r.blocked).length, ok = results.filter(x => x.good).length;
        fl.querySelector('.cg-ar-score').textContent = ok + '/' + results.length + ' doğru · yanlış pozitif ' + fp + ' · kaçan saldırı ' + miss;
        st.runs++; const d = $('.cg-ar-done'); d.hidden = false;
        if (!fp && !miss) { const stars = Math.max(1, 3 - Math.min(2, st.hints) - (st.runs > 5 ? 1 : 0)); st.done = true; st.stars = Math.max(st.stars, stars); d.className = 'cg-ar-done is-ok';
            const WN = (window.CG_ARENA_WAF || [])[(window.CG_ARENA_WAF || []).indexOf(t) + 1];
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-trophy"></i> Sıfır yanlış pozitif, sıfır kaçak! <span class="cg-ar-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div><p class="cg-ar-dm">${st.runs} deneme · ${st.hints} ipucu <small>(her ipucu bir yıldız düşürür)</small></p><ul>${t.learn.map(x => `<li>${x}</li>`).join('')}</ul><div class="cg-ar-db">${WN ? `<a class="cg-ar-go" href="#/arena/waf/${WN.id}"><i class="fas fa-arrow-right"></i> Sonraki görev</a>` : ''}<a class="cg-ar-ghost" href="#/arena"><i class="fas fa-chess-knight"></i> Arena</a></div>`; }
        else { d.className = 'cg-ar-done is-bad'; d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-exclamation-triangle"></i> ${fp} yanlış pozitif, ${miss} kaçan saldırı.</div><p class="cg-ar-dm">Kırmızı satırlara tıklayıp istek detayını okuyun: hangi ihlal engelledi ya da neden hiçbir ihlal çıkmadı?</p>`; }
        this._save(); fl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
    _wLogUI() {
        const t = this._t, st = this._wst(t.id), E = cgEsc, main = this._$('.cg-waf-main');
        const base = this._wEval(t, t.base, t.traffic), entries = base.filter(x => x.r.blocked);
        const dec = this._wdec = st.dec ? st.dec.slice() : entries.map(() => '');
        const paint = () => { main.innerHTML = `<div class="cg-ar-panel"><div class="cg-ar-ph2"><i class="fas fa-list"></i> Security › Event Logs › Application › Requests <small>(${entries.length} engellenen istek)</small> ${this._wHintBtn()}</div>
            <div class="cg-waf-log">${entries.map((e, i) => { const c = t.clients[e.x.c]; return `<div class="cg-waf-e"><div class="cg-waf-eh"><code>${e.r.supportId}</code><span>${E(c.ip)} · <small>${E(c.ua)}</small></span><span class="cg-ar-chip is-bad">Blocked · rating ${e.r.rating}</span></div>
                <div><code>${E(e.x.m)} ${E(e.x.u)}</code>${e.x.b ? ' <code>' + E(decodeURIComponent(e.x.b.replace(/\+/g, ' '))) + '</code>' : ''}</div>
                <div class="cg-waf-v">${e.r.violations.map(v => `<div><b>${E(v.name)}</b> ${E(v.detail || '')}</div>`).join('')}${e.r.sigs.map(sg => `<div><code>${sg.id}</code> ${E(sg.name)} · ${E(sg.where)}</div>`).join('')}</div>
                <label class="cg-ar-pl">Karar <select data-d="${i}"><option value="">— seçin —</option>${t.actions.map(([v, l]) => `<option value="${v}"${dec[i] === v ? ' selected' : ''}>${E(l)}</option>`).join('')}</select></label></div>`; }).join('')}</div>
            <div class="cg-ar-ctl"><button type="button" class="cg-ar-go" data-a="replay"${dec.every(Boolean) ? '' : ' disabled'}><i class="fas fa-redo"></i> Uygula ve tekrar oynat${dec.every(Boolean) ? '' : ' (tüm kayıtlara karar verin)'}</button></div></div>`;
            main.querySelectorAll('[data-d]').forEach(x => x.addEventListener('change', () => { dec[+x.dataset.d] = x.value; st.dec = dec.slice(); this._save(); this._keepFocus(main, paint); }));
            main.querySelector('[data-a="replay"]').addEventListener('click', () => { const cfg = this._wFromDec(t, dec, entries); const res = this._wEval(t, cfg, t.traffic).concat(this._wEval(t, cfg, t.hidden).map(x => Object.assign(x, { hidden: true }))); this._wSend(res); });
            this._wBindHint(); };
        paint();
    },
    // ═══ Nöbet: hikâyeli olay müdahalesi (veri: assets/data/arena/nobet.js; motor: tmsh simülatörü) ═══
    // Teşhis eylemleri canlı oturumda (salt okunur) çalışır; plan uygulanınca yeni bir oturumda düzeltmeler + kanıt komutları çalışır.
    // Puan (100): kök neden 40 (kanıtsız doğru tahmin yarım puan) + düzeltme 40 (best 1 · good 0,6 · bad 0; kanıtla doğrulanmazsa 0)
    //   + süre 20 (hedef dakikayı aşan her dakika −1) − yan etki (bozulan her "safe" kanıt −10) − gereksiz teşhis (−3) − hatalı komut (−5).
    NB_RO: /^(tmsh (list|show) |list |show |curl |grep |tail |cat |ping |date$)/,
    _nbEng() { return (window.CG_LAB_ENGINES || {})['f5-ltm']; },
    _nbExec(s, cmd) { const b = s.ev.list().length, out = s.input(cmd), add = s.ev.list().slice(b), c = add.filter(e => e.curl).pop(); return { cmd, out: String(out == null ? '' : out), curl: c ? c.curl : null, err: add.some(e => e.err) }; },
    _nbEval(v, plan) {
        const E = this._nbEng(), s = E.session(v.lab), N = v.issues.length, diag = (plan.diag || []).map(id => v.diag.find(d => d.id === id)).filter(Boolean);
        const applied = [], parts = [], issues = [];
        v.issues.forEach(is => { const f = is.fixes.find(x => x.id === (plan.fix || {})[is.id]); (f ? f.cmds : []).forEach(c => applied.push(Object.assign(this._nbExec(s, c), { issue: is.id }))); });
        const checks = v.checks.map(ch => { const L = [].concat(ch.cmd).map(c => this._nbExec(s, c)), r = L[L.length - 1]; let ok = false; try { ok = !!ch.test(r, s); } catch (e) { ok = false; } return { id: ch.id, label: ch.label, kind: ch.kind, issue: ch.issue, ok, runs: L }; });
        let cause = 0, fix = 0;
        v.issues.forEach(is => {
            const ev = diag.some(d => (d.issues || []).includes(is.id)), cOk = (plan.cause || {})[is.id] === is.cause, cp = cOk ? (ev ? 1 : 0.5) : 0;
            const f = is.fixes.find(x => x.id === (plan.fix || {})[is.id]), lv = f ? ({ best: 1, good: 0.6, bad: 0 }[f.level] || 0) : 0;
            const own = checks.filter(c => c.issue === is.id), verified = own.every(c => c.ok), fp = own.length && !verified ? 0 : lv;
            cause += cp * 40 / N; fix += fp * 40 / N;
            issues.push({ id: is.id, causeOk: cOk, evidence: ev, fix: f || null, level: f ? f.level : null, verified: own.length ? verified : null, cp, fp });
        });
        const broken = checks.filter(c => c.kind === 'safe' && !c.ok), useless = diag.filter(d => !d.useful), errs = applied.filter(a => a.err);
        const minutes = diag.reduce((a, d) => a + d.min, 0) + (plan.free || 0) * 2 + v.issues.reduce((a, is) => { const f = is.fixes.find(x => x.id === (plan.fix || {})[is.id]); return a + (f ? f.min : 0); }, 0);
        const time = minutes <= v.target ? 20 : Math.max(0, 20 - (minutes - v.target));
        parts.push({ k: 'Kök neden', p: Math.round(cause), max: 40 }, { k: 'Düzeltme', p: Math.round(fix), max: 40 }, { k: 'Süre (' + minutes + ' / ' + v.target + ' dk)', p: time, max: 20 });
        if (broken.length) parts.push({ k: 'Yan etki: ' + broken.map(c => c.label).join(', '), p: -10 * broken.length });
        if (useless.length) parts.push({ k: 'Gereksiz eylem: ' + useless.map(d => d.label).join(', '), p: -3 * useless.length });
        if (errs.length) parts.push({ k: 'Hatalı komut', p: -5 * errs.length });
        const score = Math.max(0, Math.min(100, parts.reduce((a, x) => a + x.p, 0)));
        return { score, stars: score >= 90 ? 3 : score >= 70 ? 2 : score >= 50 ? 1 : 0, parts, checks, applied, issues, minutes, broken, useless };
    },
    _nbClock(v, add) { const [h, m] = v.clock.split(':').map(Number), t = h * 60 + m + add; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); },
    _nb(v) {
        const E = cgEsc, st = this._nst(v.id), eng = this._nbEng();
        if (!eng) { this._root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Simülatör yüklenemedi.</p></div>'; return; }
        const S = this._nbState = { v, s: eng.session(v.lab), used: [], free: 0, minutes: 0, log: [], cause: {}, fix: {}, result: null };
        const lvl = { best: 'En iyi', good: 'Kabul edilebilir', bad: 'Yanlış / yan etkili' };
        this._root.innerHTML = `<div class="cg-ar cg-nb">
            <nav class="cg-ts-crumbs"><a href="#/arena"><i class="fas fa-chess-knight"></i> iRule Arenası</a><i class="fas fa-chevron-right"></i><span>Nöbet</span><i class="fas fa-chevron-right"></i><span>${E(v.title)}</span></nav>
            <div class="cg-nb-bar"><h2><i class="fas fa-bell"></i> ${E(v.title)}</h2><span class="cg-nb-meter" aria-live="polite"></span></div>
            <div class="cg-nb-grid">
                <aside class="cg-nb-side">
                    <section class="cg-nb-alarm is-${v.alarm.sev}"><div class="cg-nb-ah"><i class="fas ${v.alarm.sev === 'crit' ? 'fa-exclamation-circle' : 'fa-exclamation-triangle'}"></i> ${v.alarm.sev === 'crit' ? 'ALARM' : 'UYARI'} · ${E(v.alarm.src)} <time>${E(v.clock)}</time></div><p>${E(v.alarm.text)}</p></section>
                    <section class="cg-nb-card"><h3>Durum</h3><p>${v.story}</p><p class="cg-nb-sym"><b>Belirti:</b> ${E(v.symptom)}</p></section>
                    ${v.report ? `<section class="cg-nb-card"><h3><i class="fas fa-file-contract"></i> Rapor bulguları</h3><ol class="cg-nb-rep">${v.report.map(r => `<li><span class="cg-ar-chip">${E(r.sev)}</span> <b>${E(r.title)}</b><br><small>${E(r.text)}</small></li>`).join('')}</ol></section>` : ''}
                    <section class="cg-nb-card"><h3><i class="fas fa-comments"></i> Ekip kanalı</h3><ul class="cg-nb-chat">${v.team.map(m => `<li><div class="cg-nb-who"><b>${E(m.who)}</b> <small>${E(m.role)} · ${E(m.at)}</small></div><p>${E(m.text)}</p></li>`).join('')}</ul></section>
                </aside>
                <main class="cg-nb-main">
                    <section class="cg-nb-card"><h3><i class="fas fa-search"></i> Teşhis <small>her eylem bütçeden düşer ve dakika harcar; gereksiz eylem puan kaybettirir</small></h3>
                        <div class="cg-nb-diag">${v.diag.map(d => `<button type="button" class="cg-nb-dbtn" data-d="${d.id}"><i class="fas ${d.icon}"></i> <span>${E(d.label)}</span><small>${d.min} dk</small></button>`).join('')}</div>
                        <form class="cg-nb-free" autocomplete="off"><label for="cg-nb-cmd">Kendi komutun (salt okunur: list, show, curl, grep, tail, ping)</label><div><input id="cg-nb-cmd" type="text" spellcheck="false" placeholder="tmsh show ltm pool web_pool members"><button type="submit" class="cg-ar-lnk"><i class="fas fa-terminal"></i> Çalıştır</button></div><small class="cg-nb-fmsg" role="status"></small></form>
                        <div class="cg-nb-con" aria-live="polite"><p class="cg-nb-empty">Henüz komut çalıştırılmadı. Kanıt toplamadan karar vermek "tahmin" sayılır.</p></div></section>
                    <section class="cg-nb-card cg-nb-plan"><h3><i class="fas fa-clipboard-list"></i> Müdahale planı</h3>
                        ${v.issues.map(is => `<fieldset class="cg-nb-issue" data-i="${is.id}"><legend>${E(is.title)}</legend>
                            <p class="cg-nb-q">${E(is.q)}</p><div class="cg-nb-opts">${this._shuf(is.causes, v.id + ':' + is.id).map(([k, t]) => `<label><input type="radio" name="c_${is.id}" value="${k}"> ${E(t)}</label>`).join('')}</div>
                            <p class="cg-nb-q">Düzeltme</p><div class="cg-nb-opts">${this._shuf(is.fixes.map(f => [f.id, f]), v.id + ':f:' + is.id).map(([, f]) => f).map(f => `<label><input type="radio" name="f_${is.id}" value="${f.id}"> ${E(f.label)} <small>${f.min} dk</small>${f.cmds.length ? `<code class="cg-nb-cmdp">${f.cmds.map(E).join('<br>')}</code>` : '<small class="cg-nb-nocmd">(BIG-IP\'de komut yok)</small>'}</label>`).join('')}</div></fieldset>`).join('')}
                        <div class="cg-ar-ctl"><button type="button" class="cg-ar-go" data-a="apply" disabled><i class="fas fa-play"></i> Planı uygula ve doğrula</button><button type="button" class="cg-ar-lnk" data-a="restart"><i class="fas fa-undo"></i> Vakayı baştan başlat</button></div></section>
                    <section class="cg-nb-card cg-nb-res" hidden></section>
                </main>
            </div></div>`;
        const $ = q => this._root.querySelector(q), $$ = q => this._root.querySelectorAll(q);
        const meter = () => { const left = v.budget - S.used.length - S.free; $('.cg-nb-meter').innerHTML = `<span><i class="far fa-clock"></i> ${this._nbClock(v, S.minutes)} <small>(${S.minutes} / ${v.target} dk)</small></span><span><i class="fas fa-bolt"></i> Eylem ${v.budget - left} / ${v.budget}</span>${st.best !== null ? `<span><i class="fas fa-trophy"></i> En iyi ${st.best}</span>` : ''}`;
            $$('.cg-nb-dbtn').forEach(b => { b.disabled = !!S.result || S.used.includes(b.dataset.d) || left <= 0; }); $('.cg-nb-free input').disabled = $('.cg-nb-free button').disabled = !!S.result || left <= 0; };
        const show = (label, runs, note) => { const con = $('.cg-nb-con'), e = con.querySelector('.cg-nb-empty'); if (e) e.remove();
            con.insertAdjacentHTML('beforeend', `<div class="cg-nb-out"><div class="cg-nb-oh"><b>${E(label)}</b> <small>${this._nbClock(v, S.minutes)}</small></div>${runs.map(r => `<pre><span class="cg-nb-ps">[root@bigip-a:Active:Standalone] config # </span>${E(r.cmd)}\n${E(r.out)}</pre>`).join('')}${note ? `<p class="cg-nb-note">${E(note)}</p>` : ''}</div>`);
            con.lastElementChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
        const runDiag = d => { S.used.push(d.id); S.minutes += d.min; show(d.label, d.cmds.map(c => this._nbExec(S.s, c))); meter(); };
        $$('.cg-nb-dbtn').forEach(b => b.addEventListener('click', () => runDiag(v.diag.find(d => d.id === b.dataset.d))));
        $('.cg-nb-free').addEventListener('submit', e => { e.preventDefault(); const inp = $('.cg-nb-free input'), c = inp.value.trim().replace(/\s+/g, ' ').replace(/^(list|show) /, 'tmsh $1 '), msg = $('.cg-nb-fmsg'); if (!c) return;
            const d = v.diag.find(x => x.cmds.includes(c)); if (d) { if (S.used.includes(d.id)) { msg.textContent = 'Bu kanıt zaten toplandı.'; return; } runDiag(d); inp.value = ''; msg.textContent = ''; return; }
            if (!this.NB_RO.test(c) || /\bdelete\b|\bmodify\b|\bcreate\b/.test(c)) { msg.textContent = 'Nöbette değişiklikler plan üzerinden yapılır; burada yalnız okuma komutları (list, show, curl, grep, tail, ping) çalışır.'; return; }
            S.free++; S.minutes += 2; show('Serbest komut', [this._nbExec(S.s, c)]); inp.value = ''; msg.textContent = ''; meter(); });
        const ready = () => { $('[data-a="apply"]').disabled = !!S.result || !v.issues.every(is => S.cause[is.id] && S.fix[is.id]); };
        $$('.cg-nb-issue input').forEach(x => x.addEventListener('change', () => { const iid = x.closest('.cg-nb-issue').dataset.i; (x.name.startsWith('c_') ? S.cause : S.fix)[iid] = x.value; ready(); }));
        $('[data-a="restart"]').addEventListener('click', () => this._nb(v));
        $('[data-a="apply"]').addEventListener('click', () => {
            const R = S.result = this._nbEval(v, { diag: S.used, free: S.free, cause: S.cause, fix: S.fix });
            st.runs++; st.best = Math.max(st.best || 0, R.score); if (R.stars) { st.done = true; st.stars = Math.max(st.stars, R.stars); } this._save();
            $$('.cg-nb-issue input').forEach(x => { x.disabled = true; }); ready(); meter();
            const box = $('.cg-nb-res'); box.hidden = false;
            box.innerHTML = `<h3><i class="fas fa-flag-checkered"></i> Sonuç: ${R.score} / 100 <span class="cg-ar-stars">${'★'.repeat(R.stars)}${'☆'.repeat(3 - R.stars)}</span></h3>
                <table class="cg-nb-score">${R.parts.map(x => `<tr class="${x.p < 0 ? 'is-neg' : ''}"><th>${E(x.k)}</th><td>${x.p}${x.max ? ' / ' + x.max : ''}</td></tr>`).join('')}</table>
                <h4>Kanıt: düzeldi mi, bir şey bozuldu mu?</h4><ul class="cg-nb-checks">${R.checks.map(c => `<li class="${c.ok ? 'is-ok' : 'is-bad'}"><details><summary><i class="fas ${c.ok ? 'fa-check' : 'fa-times'}"></i> <span class="cg-ar-chip">${c.kind === 'safe' ? 'bozulmadı mı' : 'düzeldi mi'}</span> ${E(c.label)}</summary>${c.runs.map(r => `<pre>${E(r.cmd)}\n${E(r.out)}</pre>`).join('')}</details></li>`).join('')}</ul>
                <details class="cg-nb-applied"><summary><i class="fas fa-terminal"></i> Uygulanan komutlar (${R.applied.length})</summary>${R.applied.length ? R.applied.map(a => `<pre>${E(a.cmd)}${a.out ? '\n' + E(a.out) : ''}</pre>`).join('') : '<p>BIG-IP\'de değişiklik yapılmadı.</p>'}</details>
                <h4>Değerlendirme</h4><div class="cg-nb-debrief">${v.issues.map((is, k) => { const x = R.issues[k], best = is.fixes.find(f => f.level === 'best'), cz = is.causes.find(c => c[0] === is.cause);
                    return `<div class="cg-nb-db"><b>${E(is.title)}</b><p>${x.causeOk ? '<i class="fas fa-check"></i> Kök neden doğru' + (x.evidence ? '' : ' <small>(kanıt toplanmadan: yarım puan)</small>') : '<i class="fas fa-times"></i> Kök neden: ' + E(cz[1])}</p><p class="cg-nb-why">${E(is.why)}</p>
                        <p>Seçtiğiniz düzeltme: <b>${E(x.fix ? x.fix.label : '—')}</b> <span class="cg-ar-chip">${E(lvl[x.level] || '')}</span>${x.verified === false ? ' <span class="cg-ar-chip is-bad">kanıtla doğrulanmadı</span>' : ''}<br><small>${E(x.fix ? x.fix.note || '' : '')}</small></p>
                        ${x.level !== 'best' ? `<p>En iyi seçenek: <b>${E(best.label)}</b><br><small>${E(best.note || '')}</small></p>` : ''}</div>`; }).join('')}</div>
                ${R.useless.length ? `<h4>Gereksiz eylemler</h4><ul>${R.useless.map(d => `<li><b>${E(d.label)}</b>: ${E(d.note || '')}</li>`).join('')}</ul>` : ''}
                <h4>Öğrenilenler</h4><ul>${v.learn.map(x => `<li>${E(x)}</li>`).join('')}</ul><p class="cg-nb-src"><b>Kaynaklar:</b> ${v.sources.map(E).join(' · ')}</p>
                <div class="cg-ar-db"><button type="button" class="cg-ar-go" data-a="again"><i class="fas fa-redo"></i> Vakayı yeniden oyna</button><a class="cg-ar-ghost" href="#/arena"><i class="fas fa-chess-knight"></i> Arena</a></div>`;
            box.querySelector('[data-a="again"]').addEventListener('click', () => this._nb(v));
            box.scrollIntoView({ block: 'start', behavior: 'smooth' });
        });
        meter();
    },
    _profDef(t) { return Object.assign({ known: ['CONNECT', 'DELETE', 'GET', 'HEAD', 'LOCK', 'OPTIONS', 'POST', 'PROPFIND', 'PUT', 'TRACE', 'UNLOCK'], unknown: 'allow', persist: 'none' }, (t && t.prof) || {}); },
    _runAll(t, c, prof) {
        const rr = {}, jars = {}, src = {}, first = {};
        return t.traffic.map(x => {
            const q = this._req(t, x), cid = q.cl.id, jar = jars[cid] || (jars[cid] = {});
            const res = this._sim(c, q, rr, { prof, jar, src }), exp = t.expect(q), o = res.out;
            if (o.setCookie) jar[o.setCookie[0]] = o.setCookie[1];
            let good = this._match(exp, o);
            if (good && exp.sticky) { good = !first[cid] || o.member === first[cid]; exp.stickyTo = first[cid] || null; }
            if (good && exp.apartFrom && first[exp.apartFrom] && o.member === first[exp.apartFrom]) { good = false; exp.apartBad = true; }
            if (exp.apartFrom) exp.apartTo = first[exp.apartFrom] || null;
            if (exp.sticky && o.kind === 'pool' && !first[cid]) first[cid] = o.member;
            return { q, res, exp, good };
        });
    },
    _match(e, o) {
        if (e.allow) { const a = this._hv(o.hdrs, 'Allow'); if (o.kind !== 'resp' || o.code !== e.code || a.length !== 1) return false; const got = a[0].split(',').map(x => x.trim()).filter(Boolean).sort().join(); if (got !== e.allow.slice().sort().join()) return false; }
        if (e.deny) return o.kind === 'reset' || (o.kind === 'resp' && [403, 405].includes(o.code));
        const hdrOk = (want, L) => Object.entries(want || {}).every(([n, v]) => { const got = this._hv(L, n); return v === null ? !got.length : got.length === 1 && got[0] === v; });
        if (e.pool) return o.kind === 'pool' && o.pool === e.pool && (!e.code || o.code === e.code) && (!e.uri || o.uri === e.uri) && hdrOk(e.sent, o.sent) && hdrOk(e.hdr, o.hdrs);
        if (e.reset) return o.kind === 'reset';
        return o.kind === 'resp' && o.code === e.code && (!e.loc || o.loc === e.loc) && hdrOk(e.hdr, o.hdrs);
    },

    // ═══ Çalıştır: tüm trafiği sırayla, animasyonlu ═══
    async _go() {
        if (this._run) return;
        const t = this._t, $ = this._$, st = this._st(t.id), code = $('textarea').value;
        const msg = $('.cg-ar-edmsg'); msg.className = 'cg-ar-edmsg'; msg.textContent = '';
        const k = this._compile(code);
        if (k.err) { msg.className = 'cg-ar-edmsg is-err'; msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + cgEsc(k.err) + '<small>Kural kaydedilmedi; trafik başlatılmadı.</small>'; return; }
        msg.className = 'cg-ar-edmsg is-ok'; msg.innerHTML = k.empty ? '<i class="fas fa-check-circle"></i> Kural yok; yalnız profil ayarları uygulandı.' : '<i class="fas fa-check-circle"></i> Kural kaydedildi ve <code>' + cgEsc(t.vs.name) + '</code>\'e bağlandı.';
        const run = this._run = { stop: false }; st.runs++; this._save();
        this._view(code);
        const tb = $('.cg-ar-flow tbody'); tb.innerHTML = ''; $('.cg-ar-log').textContent = ''; $('.cg-ar-logn').textContent = ''; $('.cg-ar-done').hidden = true;
        this._root.querySelectorAll('.cg-ar-mem:not(.is-down) .cg-ar-hits').forEach(h => { h.textContent = '0'; });
        $('[data-a="run"]').disabled = true; $('[data-a="step"]').hidden = this._speed !== 0; this._lock(true);
        const hits = {}, logs = [], all = this._runAll(t, k.c, this._prof); let ok = 0;
        for (let i = 0; i < all.length; i++) {
            if (run.stop || !this._root.isConnected) return;
            const { q, res, exp, good } = all[i], cl = q.cl, method = q.method, host = q.host, uri = q.uri;
            tb.insertAdjacentHTML('beforeend', `<tr class="is-run"><td>${i + 1}</td><td><i class="fas ${cl.icon}"></i> ${cgEsc(cl.ip)}</td><td><code>${cgEsc(method)} ${cgEsc(host + uri)}</code></td><td class="cg-ar-exp">${this._chips(this._parts(exp))}</td><td class="cg-ar-res">…</td><td class="cg-ar-ok"></td></tr>`);
            const row = tb.lastElementChild; this._reveal($('.cg-ar-tbl'), row);
            if (this._speed === 0) { $('[data-a="step"]').disabled = false; await new Promise(r => { this._stepRes = r; }); $('[data-a="step"]').disabled = true; }
            await this._animate(cl, res, hits);
            res.logs.forEach(l => logs.push(l));
            row.classList.remove('is-run'); row.classList.add(good ? 'is-ok' : 'is-bad');
            row.querySelector('.cg-ar-res').innerHTML = this._chips(this._parts(exp, res.out)) + (!good && t.panel && t.panel.includes('methods') && exp.deny ? (!this._prof.known.includes(q.method) && this._prof.unknown === 'allow' ? '<small class="cg-ar-why">' + cgEsc(q.method) + ' listede yok ama unknown-method <b>allow</b>: geçti</small>' : this._prof.known.includes(q.method) ? '<small class="cg-ar-why">' + cgEsc(q.method) + ' profilin bilinen metotlar listesinde: profil geçirdi, kural da durdurmadı</small>' : '') : '');
            row.querySelector('.cg-ar-ok').innerHTML = good ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>';
            if (good) ok++;
            $('.cg-ar-score').textContent = ok + '/' + (i + 1) + ' doğru';
            if (logs.length) { $('.cg-ar-log').textContent = logs.map(l => 'Sep 25 10:' + String(i).padStart(2, '0') + ':0' + (i % 10) + ' bigip-a.lab.example ' + l).join('\n'); $('.cg-ar-logn').textContent = '(' + logs.length + ' satır)'; }
        }
        this._run = null; $('[data-a="run"]').disabled = false; $('[data-a="step"]').hidden = true; this._lock(false);
        this._verdict('');
        this._lastHits = Object.values(hits).reduce((a, b) => a + b, 0); this._lastProf = all.filter(x => x.res.out.byProf).length;
        this._finish(ok, t.traffic.length);
    },
    // yalnız kutunun içinde kaydır (sayfa zıplamasın)
    _reveal(box, el) { const top = el.offsetTop, h = el.offsetHeight; if (top < box.scrollTop || top + h > box.scrollTop + box.clientHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 2); },
    // sekme görünmezken tarayıcı zamanlayıcıları kısar: animasyonu atla, akış anında tamamlansın
    _sleep(ms) { if (typeof document !== 'undefined' && document.hidden) return Promise.resolve(); return new Promise(r => setTimeout(r, this._speed === 3 ? ms / 3 : ms)); },
    _lamp(ev, on, rule) { const li = this._root.querySelector(`.cg-ar-lamps li[data-e="${ev}"]`); if (li) { li.classList.toggle('is-on', on); li.classList.toggle('is-rule', !!(on && rule)); } },
    _verdict(html, cls) { const v = this._$('.cg-ar-verdict'); v.className = 'cg-ar-verdict' + (cls ? ' ' + cls : ''); v.innerHTML = html; },
    _pos(el) { const box = this._$('.cg-ar-topo').getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - box.left + r.width / 2, y: r.top - box.top + r.height / 2 }; },
    async _move(from, to, cls, ms) {
        const p = this._$('.cg-ar-pkt'), a = this._pos(from), b = this._pos(to);
        p.hidden = false; p.className = 'cg-ar-pkt' + (cls ? ' ' + cls : ''); p.style.transition = 'none'; p.style.transform = `translate(${a.x}px,${a.y}px)`;
        void p.offsetWidth; const d = this._speed === 3 ? ms / 3 : ms; p.style.transition = `transform ${d}ms cubic-bezier(.4,0,.2,1)`; p.style.transform = `translate(${b.x}px,${b.y}px)`;
        await this._sleep(ms);
    },
    async _lines(step, hits) {
        const v = this._$('.cg-ar-view');
        for (const l of step.lines) {
            hits[l] = (hits[l] || 0) + 1;
            const li = v.querySelector(`li[data-l="${l}"]`); if (!li) continue;
            v.querySelectorAll('li.is-cur').forEach(x => x.classList.remove('is-cur'));
            li.classList.add('is-cur', 'is-hit'); li.querySelector('.cg-ar-hc').textContent = hits[l] + '×';
            this._reveal(v, li);
            await this._sleep(170);
        }
    },
    async _animate(cl, res, hits) {
        const $ = this._$, node = this._root.querySelector(`.cg-ar-node[data-c="${cl.id}"]`), big = $('.cg-ar-bigip'), o = res.out;
        this._root.querySelectorAll('.cg-ar-lamps li').forEach(li => li.classList.remove('is-on', 'is-rule'));
        this._verdict(''); node.classList.add('is-act');
        await this._move(node, big, '', 520);
        for (const step of res.trace) {
            this._lamp(step.ev, true, step.rule);
            if (step.ev === 'LB_SELECTED' || step.ev === 'HTTP_RESPONSE' || step.ev === 'LB_FAILED') { /* aşağıda */ }
            await this._lines(step, hits);
            if (step.ev === 'HTTP_REQUEST') await this._sleep(160);
            if (step.ev === 'LB_SELECTED' && o.member) {
                const mem = this._root.querySelector(`.cg-ar-mem[data-m="${o.member}"]`);
                if (mem) { await this._move(big, mem, '', 480); mem.classList.add('is-act'); const h = mem.querySelector('.cg-ar-hits'); h.textContent = +h.textContent + 1; await this._sleep(140); await this._move(mem, big, 'is-back', 420); mem.classList.remove('is-act'); }
            }
        }
        this._$('.cg-ar-view').querySelectorAll('li.is-cur').forEach(x => x.classList.remove('is-cur'));
        if (o.kind === 'reset') { this._verdict('<i class="fas fa-bolt"></i> RST · ' + cgEsc(o.why), 'is-bad'); await this._move(big, node, 'is-rst', 360); }
        else if (o.kind === 'resp') { this._verdict('<i class="fas fa-reply"></i> BIG-IP yanıtı ' + o.code, 'is-resp'); await this._move(big, node, 'is-resp', 460); }
        else { this._verdict('<i class="fas fa-check"></i> ' + cgEsc(o.pool) + ' · ' + o.code, 'is-ok'); await this._move(big, node, 'is-back', 460); }
        this._$('.cg-ar-pkt').hidden = true; node.classList.remove('is-act');
        await this._sleep(180);
    },

    _finish(ok, n) {
        const t = this._t, st = this._st(t.id), d = this._$('.cg-ar-done');
        const lint = ok === n && t.lint ? t.lint(this._$('textarea').value) : null;
        if (lint) { d.hidden = false; d.className = 'cg-ar-done is-bad'; d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-clipboard-check"></i> Trafik doğru, ama bir koşul eksik.</div><p class="cg-ar-dm">${lint}</p>`; d.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; }
        if (ok === n) {
            const stars = Math.max(1, 3 - Math.min(2, st.hints) - (st.runs > 4 ? 1 : 0));
            st.done = true; st.stars = Math.max(st.stars, stars); this._save();
            const T = window.CG_ARENA_MASA, nx = T[T.indexOf(t) + 1];
            d.hidden = false; d.className = 'cg-ar-done is-ok';
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-trophy"></i> Tüm trafik doğru yönlendi! <span class="cg-ar-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div>
                <p class="cg-ar-dm">${st.runs} deneme · ${st.hints} ipucu <small>(ipucu başına −1★; 4'ten fazla deneme −1★)</small>${t.panel ? ' · iRule satır çalışması: ' + (this._lastHits || 0) + (this._lastProf ? ' · profilde kesilen istek: ' + this._lastProf + ' (kurala hiç ulaşmadı)' : '') : ''}</p><ul>${t.learn.map(x => `<li>${x}</li>`).join('')}</ul>
                <div class="cg-ar-db">${nx ? `<a class="cg-ar-go" href="#/arena/masa/${nx.id}"><i class="fas fa-arrow-right"></i> Sonraki görev</a>` : ''}<a class="cg-ar-ghost" href="#/arena"><i class="fas fa-chess-knight"></i> Arena</a></div>`;
        } else {
            d.hidden = false; d.className = 'cg-ar-done is-bad';
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-exclamation-triangle"></i> ${n - ok} istek beklendiği gibi sonuçlanmadı.</div><p class="cg-ar-dm">Kırmızı etiketler tutmayan parçayı gösterir (pool, kod, başlık ya da sunucuya giden yol); koddaki <b>×</b> sayıları hangi satırın kaç kez çalıştığını gösterir. Koda tıklayıp düzenle, yeniden başlat.</p>`;
        }
        d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
};
if (typeof module !== 'undefined') module.exports = CgArena;
