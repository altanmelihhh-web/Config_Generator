'use strict';

// ─── iRule Arenası (#/arena, #/arena/masa/<görev>) ──────────────────────────
// Trafik Masası: kuralı yaz → istekler topolojide akar; tetiklenen olaylar, çalışan satırlar ve
// seçilen üye canlı görünür. Kural CgIRule ile çalışır (lab simülatörüyle aynı yorumlayıcı).
// Görevler: assets/data/arena/masa.js · İlerleme: localStorage 'cg-arena-v1'
const CgArena = {
    KEY: 'cg-arena-v1',
    FILES: ['assets/js/lab/irule.js', 'assets/data/arena/masa.js'],
    RULE: 'r_masa',
    MODES: [
        { id: 'masa', icon: 'fa-project-diagram', title: 'Trafik Masası', desc: 'Kuralı yaz, trafiği başlat: her isteğin hangi olaydan geçtiğini, hangi satırın çalıştığını ve nereye gittiğini canlı izle.', ready: true },
        { id: 'nobet', icon: 'fa-bell', title: 'Nöbet', desc: 'Kurgusal şirkette nöbettesin: alarm, grafik, log ve ekip mesajlarından kök nedeni bul, kesintiyi kapat.' },
        { id: 'meydan', icon: 'fa-flag-checkered', title: 'Meydan Okuma', desc: 'Gizli testli iRule görevleri: doğruluk + maliyet puanı, konu rozetleri, zorluk ağacı.' },
    ],

    _mem: null,
    _store() { if (this._mem) return this._mem; let d = null; try { d = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) { d = null; } return (this._mem = d && d.masa ? d : { masa: {} }); },
    _save() { try { localStorage.setItem(this.KEY, JSON.stringify(this._store())); } catch (e) { /* yalnız oturum */ } },
    _st(id) { const s = this._store(); return s.masa[id] || (s.masa[id] = { code: null, runs: 0, done: false, stars: 0, hints: 0 }); },

    async render(root, mode, id) {
        this._root = root; this._run = null;
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Arena yükleniyor…</p></div>';
        try { for (const f of this.FILES) await CgCli._load(f); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Arena yüklenemedi.</p></div>'; return; }
        const T = window.CG_ARENA_MASA || [];
        if (mode === 'masa' && id) { const t = T.find(x => x.id === id); if (!t) { location.hash = '#/arena'; return; } this._desk(t); return; }
        this._hub(T);
    },

    // ═══ Giriş ═══
    _hub(T) {
        const E = cgEsc;
        this._root.innerHTML = `<div class="cg-ar"><nav class="cg-ts-crumbs"><a href="#/lab"><i class="fas fa-flask"></i> Laboratuvar</a><i class="fas fa-chevron-right"></i><span>iRule Arenası</span></nav>
            <header class="cg-ar-head"><h1><i class="fas fa-chess-knight"></i> iRule Arenası</h1><p>Kuralın içini gör: istek gelir, olaylar tetiklenir, satırlar çalışır, trafik yönlenir. Üç mod, her biri farklı bir beceri.</p></header>
            <div class="cg-ar-modes">${this.MODES.map(m => `<section class="cg-ar-mode${m.ready ? '' : ' is-soon'}"><div class="cg-ar-mh"><i class="fas ${m.icon}"></i><b>${E(m.title)}</b>${m.ready ? '' : '<span class="cg-ar-soon">Yakında</span>'}</div><p>${E(m.desc)}</p>
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
            <div class="cg-ar-desk">
                <section class="cg-ar-ed"><div class="cg-ar-edh"><span><i class="fas fa-code"></i> ltm rule <b>${this.RULE}</b></span><span class="cg-ar-edtools"><button type="button" data-a="hint" class="cg-ar-lnk"><i class="fas fa-lightbulb"></i> İpucu</button><button type="button" data-a="reset" class="cg-ar-lnk" title="Başlangıç koduna dön"><i class="fas fa-undo"></i></button></span></div>
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
                    <div class="cg-ar-col cg-ar-srv">${members.map(([p, L]) => `<div class="cg-ar-pool" data-p="${p}"><div class="cg-ar-ph">${E(p)}${p === t.vs.pool ? ' <small>varsayılan</small>' : ''}</div>${L.map(m => `<div class="cg-ar-mem" data-m="${m}"><i class="fas fa-hdd"></i> ${E(m)}<span class="cg-ar-hits">0</span></div>`).join('')}</div>`).join('')}</div>
                    <div class="cg-ar-pkt" hidden></div></section>
            </div>
            <section class="cg-ar-flow"><div class="cg-ar-flh"><span><i class="fas fa-stream"></i> İstek akışı</span><span class="cg-ar-score"></span></div>
                <div class="cg-ar-tbl"><table><thead><tr><th>#</th><th>İstemci</th><th>İstek</th><th>Beklenen</th><th>Gerçekleşen</th><th></th></tr></thead><tbody><tr class="cg-ar-empty"><td colspan="6">Kuralı kaydedip trafiği başlatınca ${t.traffic.length} istek burada akacak.</td></tr></tbody></table></div>
                <details class="cg-ar-logd"><summary><i class="fas fa-file-alt"></i> /var/log/ltm <span class="cg-ar-logn"></span></summary><pre class="cg-ar-log"></pre></details></section>
            <div class="cg-ar-done" hidden></div></div>`;
        const $ = s => this._root.querySelector(s); this._$ = $;
        const ta = $('textarea'); ta.value = st.code != null ? st.code : t.start;
        this._speed = 1;
        this._gutter();
        ta.addEventListener('input', () => { st.code = ta.value; this._save(); this._gutter(); });
        ta.addEventListener('scroll', () => { $('.cg-ar-gut').scrollTop = ta.scrollTop; });
        ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); const a = ta.selectionStart; ta.setRangeText('    ', a, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); this._go(); } });
        this._root.querySelectorAll('.cg-ar-spd button').forEach(b => b.addEventListener('click', () => { this._root.querySelectorAll('.cg-ar-spd button').forEach(x => x.classList.toggle('is-on', x === b)); this._speed = +b.dataset.s; }));
        $('[data-a="run"]').addEventListener('click', () => this._go());
        $('[data-a="step"]').addEventListener('click', () => { if (this._stepRes) { const r = this._stepRes; this._stepRes = null; r(); } });
        $('[data-a="reset"]').addEventListener('click', () => { if (this._run) return; ta.value = t.start; st.code = null; this._save(); this._edit(); this._gutter(); });
        $('[data-a="hint"]').addEventListener('click', () => { const h = t.hints[Math.min(this._hint, t.hints.length - 1)]; this._hint = Math.min(this._hint + 1, t.hints.length); st.hints = Math.max(st.hints, this._hint); this._save(); const box = $('.cg-ar-hintbox'); box.hidden = false; box.innerHTML = t.hints.slice(0, this._hint).map((x, k) => `<p><b>İpucu ${k + 1}</b> ${x}</p>`).join('') + (this._hint >= t.hints.length ? `<details><summary>Örnek çözümü göster</summary><pre>${E(t.solution)}</pre></details>` : ''); });
        $('.cg-ar-view').addEventListener('click', () => { if (!this._run) this._edit(); });
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
        const R = window.CgIRule, t = this._t, c = R.compile(code), name = this.RULE;
        if (c.err) {
            const at = '/Common/' + name + ':' + (c.line || 1) + ': error: ';
            const msg = c.kind === 'proc' ? '[undefined procedure: ' + c.cmd + '][' + (c.text || c.cmd) + ']' : c.kind === 'ctx' ? '[command is not valid in current event context (' + c.event + ')][' + c.cmd + ']' : c.kind === 'event' ? '[unknown event (' + c.event + ')][when ' + c.event + ' {]' : c.kind === 'toplevel' ? '[command is not valid in the current scope][' + c.cmd + ']' : '[parse error: ' + c.err + ']';
            return { err: '01070151:3: Rule [/Common/' + name + '] error: ' + at + msg, line: c.line };
        }
        for (const r of c.refs || []) {
            if (r.type === 'pool' && !t.pools[r.name]) return { err: '01070151:3: Rule [/Common/' + name + '] error: Unable to find pool (' + r.name + ') referenced at line ' + r.line + ': [' + r.text + ']', line: r.line };
            if (r.type === 'dg' && !(t.dg || {})[r.name]) return { err: '01070151:3: Rule [/Common/' + name + '] error: Unable to find value_list (' + r.name + ') referenced at line ' + r.line + ': [' + r.text + ']', line: r.line };
        }
        if (!c.events.length) return { err: '[Simülatör] Kuralda hiç "when" bloğu yok.' };
        return { c };
    },

    // ── tek isteği çalıştır: olay/satır izi ve sonuç
    _sim(c, q, rr) {
        const R = window.CgIRule, t = this._t, trace = [], logs = [];
        let cur = null;
        const ctx = { vars: {}, statics: {}, steps: 0, table: {}, now: () => Date.now(),
            trace: l => { if (cur && cur.lines[cur.lines.length - 1] !== l) cur.lines.push(l); },   // aynı satırdaki iç içe [komut] bir kez sayılır
            log: (f, m) => logs.push('info tmm[11925]: Rule /Common/' + this.RULE + ' <' + ctx.event + '>: ' + m), note: () => {},
            req: { method: q.method, uri: q.uri, headers: [['Host', q.host], ['User-Agent', q.ua], ['Accept', '*/*']] },
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
        if (!out) { r = fire('HTTP_REQUEST'); if (!r.ok) out = fail(r, 'HTTP_REQUEST'); }
        if (!out && (ctx.act.reject || ctx.act.drop)) out = { kind: 'reset', why: 'reject' };
        if (!out && ctx.act.respond) { const loc = (ctx.act.respond.headers || []).find(h => /^location$/i.test(h[0])); out = { kind: 'resp', code: ctx.act.respond.code, loc: loc ? loc[1] : null }; }
        if (!out) {
            const pool = ctx.act.pool || t.vs.pool, L = (t.pools[pool] || []).filter(m => !(t.down || []).includes(m));
            if (!L.length) { r = fire('LB_FAILED'); if (!r.ok) out = fail(r, 'LB_FAILED'); else if (ctx.act.respond) out = { kind: 'resp', code: ctx.act.respond.code, pool, failed: true }; else out = { kind: 'reset', why: 'pool\'da kullanılabilir üye yok', pool }; }
            else {
                rr[pool] = ((rr[pool] === undefined ? -1 : rr[pool]) + 1) % L.length; const member = L[rr[pool]];
                ctx.lb = { pool, ip: member.split(':')[0], port: +member.split(':')[1] };
                r = fire('LB_SELECTED'); if (!r.ok) out = fail(r, 'LB_SELECTED');
                else { ctx.event = 'HTTP_RESPONSE'; r = fire('HTTP_RESPONSE'); out = !r.ok ? fail(r, 'HTTP_RESPONSE') : { kind: 'pool', pool, member, code: ctx.act.respond ? ctx.act.respond.code : 200, uri: ctx.act.uriChanged ? ctx.req.uri : null }; }
            }
        }
        return { out, trace, logs };
    },
    _label(o) {
        if (!o) return '';
        if (o.kind === 'pool') return o.pool + (o.uri ? ' · URI ' + o.uri : '');
        if (o.kind === 'resp') return o.code + (o.loc ? ' → ' + o.loc : '');
        return 'Sıfırlandı (' + o.why + ')';
    },
    _expLabel(e) { return e.pool ? e.pool : e.reset ? 'Sıfırlanır' : e.code + (e.loc ? ' → ' + e.loc : ''); },
    _match(e, o) {
        if (e.pool) return o.kind === 'pool' && o.pool === e.pool;
        if (e.reset) return o.kind === 'reset';
        return o.kind === 'resp' && o.code === e.code && (!e.loc || o.loc === e.loc);
    },

    // ═══ Çalıştır: tüm trafiği sırayla, animasyonlu ═══
    async _go() {
        if (this._run) return;
        const t = this._t, $ = this._$, st = this._st(t.id), code = $('textarea').value;
        const msg = $('.cg-ar-edmsg'); msg.className = 'cg-ar-edmsg'; msg.textContent = '';
        const k = this._compile(code);
        if (k.err) { msg.className = 'cg-ar-edmsg is-err'; msg.innerHTML = '<i class="fas fa-times-circle"></i> ' + cgEsc(k.err) + '<small>Kural kaydedilmedi; trafik başlatılmadı.</small>'; return; }
        msg.className = 'cg-ar-edmsg is-ok'; msg.innerHTML = '<i class="fas fa-check-circle"></i> Kural kaydedildi ve <code>' + cgEsc(t.vs.name) + '</code>\'e bağlandı.';
        const run = this._run = { stop: false }; st.runs++; this._save();
        this._view(code);
        const tb = $('.cg-ar-flow tbody'); tb.innerHTML = ''; $('.cg-ar-log').textContent = ''; $('.cg-ar-logn').textContent = ''; $('.cg-ar-done').hidden = true;
        this._root.querySelectorAll('.cg-ar-hits').forEach(h => { h.textContent = '0'; });
        $('[data-a="run"]').disabled = true; $('[data-a="step"]').hidden = this._speed !== 0;
        const hits = {}, rr = {}, logs = []; let ok = 0;
        const Cl = Object.fromEntries(t.clients.map(c => [c.id, c]));
        for (let i = 0; i < t.traffic.length; i++) {
            if (run.stop || !this._root.isConnected) return;
            const [cid, method, host, uri, hdr] = t.traffic[i], cl = Cl[cid];
            const q = { method, host, uri, path: uri.split('?')[0], ip: cl.ip, ua: (hdr && hdr['User-Agent']) || cl.ua };
            const res = this._sim(k.c, q, rr), exp = t.expect(q), good = this._match(exp, res.out);
            tb.insertAdjacentHTML('beforeend', `<tr class="is-run"><td>${i + 1}</td><td><i class="fas ${cl.icon}"></i> ${cgEsc(cl.ip)}</td><td><code>${cgEsc(method)} ${cgEsc(host + uri)}</code></td><td>${cgEsc(this._expLabel(exp))}</td><td class="cg-ar-res">…</td><td class="cg-ar-ok"></td></tr>`);
            const row = tb.lastElementChild; this._reveal($('.cg-ar-tbl'), row);
            if (this._speed === 0) { $('[data-a="step"]').disabled = false; await new Promise(r => { this._stepRes = r; }); $('[data-a="step"]').disabled = true; }
            await this._animate(cl, res, hits);
            res.logs.forEach(l => logs.push(l));
            row.classList.remove('is-run'); row.classList.add(good ? 'is-ok' : 'is-bad');
            row.querySelector('.cg-ar-res').textContent = this._label(res.out);
            row.querySelector('.cg-ar-ok').innerHTML = good ? '<i class="fas fa-check"></i>' : '<i class="fas fa-times"></i>';
            if (good) ok++;
            $('.cg-ar-score').textContent = ok + '/' + (i + 1) + ' doğru';
            if (logs.length) { $('.cg-ar-log').textContent = logs.map(l => 'Sep 25 10:' + String(i).padStart(2, '0') + ':0' + (i % 10) + ' bigip-a.lab.example ' + l).join('\n'); $('.cg-ar-logn').textContent = '(' + logs.length + ' satır)'; }
        }
        this._run = null; $('[data-a="run"]').disabled = false; $('[data-a="step"]').hidden = true;
        this._verdict('');
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
        if (ok === n) {
            const stars = Math.max(1, 3 - Math.min(2, st.hints) - (st.runs > 4 ? 1 : 0));
            st.done = true; st.stars = Math.max(st.stars, stars); this._save();
            const T = window.CG_ARENA_MASA, nx = T[T.indexOf(t) + 1];
            d.hidden = false; d.className = 'cg-ar-done is-ok';
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-trophy"></i> Tüm trafik doğru yönlendi! <span class="cg-ar-stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</span></div>
                <p class="cg-ar-dm">${st.runs} deneme · ${st.hints} ipucu</p><ul>${t.learn.map(x => `<li>${x}</li>`).join('')}</ul>
                <div class="cg-ar-db">${nx ? `<a class="cg-ar-go" href="#/arena/masa/${nx.id}"><i class="fas fa-arrow-right"></i> Sonraki görev</a>` : ''}<a class="cg-ar-ghost" href="#/arena"><i class="fas fa-chess-knight"></i> Arena</a></div>`;
        } else {
            d.hidden = false; d.className = 'cg-ar-done is-bad';
            d.innerHTML = `<div class="cg-ar-dh"><i class="fas fa-exclamation-triangle"></i> ${n - ok} istek yanlış yere gitti.</div><p class="cg-ar-dm">Kırmızı satırlarda beklenen ile gerçekleşeni karşılaştır; koddaki <b>×</b> sayıları hangi satırın kaç kez çalıştığını gösterir. Koda tıklayıp düzenle, yeniden başlat.</p>`;
        }
        d.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    },
};
if (typeof module !== 'undefined') module.exports = CgArena;
