'use strict';

// ─── Sorun Giderme Sihirbazı (#/troubleshoot) ───────────────────────────────
// Veri: Komutlar kütüphanesindeki senaryolar (assets/data/cli/*.js → scenarios).
// Akış: konu seç → platform/senaryo seç → adım adım kontrol ("normal" / "sorun burada")
//       → teşhis + ilgili config araçları + komut kütüphanesi bağlantısı.
const CgTroubleshoot = {
    // Konular: senaryo başlığına göre ilk eşleşen kazanır (sıra önemli: 'EVPN' vpn'den önce overlay'e düşmeli). cat = CG_CATEGORIES id'si.
    TOPICS: [
        { id: 'overlay', label: 'VXLAN / EVPN',               icon: 'fas fa-project-diagram', cat: 'overlay', re: /vxlan|evpn/i },
        { id: 'vpn',     label: 'VPN / IPsec',                icon: 'fas fa-lock',            cat: 'vpn',     re: /ipsec|vpn/i },
        { id: 'ha',      label: 'Yedeklilik / HA',            icon: 'fas fa-clone',           cat: 'ha',      re: /\bha\b|failover|cluster|hsrp|mlag|vlt|vpc/i },
        { id: 'routing', label: 'Yönlendirme (BGP / OSPF)',   icon: 'fas fa-route',           cat: 'routing', re: /bgp|ospf|routing/i },
        { id: 'adc',     label: 'Yük Dengeleme / ADC',        icon: 'fas fa-balance-scale',   cat: 'adc',     re: /vserver|virtual server|pool|sertifika|yonlendirilmiyor|timeout/i },
        { id: 'traffic', label: 'Trafik Geçmiyor / NAT',      icon: 'fas fa-shield-alt',      cat: 'secpol',  re: /trafik|paket|nat\b|asimetri|snort|session/i },
        { id: 'l2',      label: 'L2: STP / VLAN / Port-Channel', icon: 'fas fa-sitemap',      cat: 'l2',      re: /stp|vlan|etherchannel|eth-trunk|port-channel/i },
        { id: 'iface',   label: 'Port / Link / WAN',          icon: 'fas fa-ethernet',        cat: 'iface',   re: /port|interface|link|wan|internet|dhcp/i },
        { id: 'aaa',     label: 'Kimlik Doğrulama',           icon: 'fas fa-user-shield',     cat: 'aaa',     re: /ldap|user-id|kullanici/i },
        { id: 'perf',    label: 'CPU / Performans / QoS',     icon: 'fas fa-tachometer-alt',  cat: 'qos',     re: /cpu|performans|bant|qos/i, strict: true },
        { id: 'ops',     label: 'İşletim / Güvenli Değişiklik', icon: 'fas fa-tools',         cat: 'mgmt',    re: /./ },
    ],
    // Komut kütüphanesi vendor anahtarı → config aracı kayıt defteri anahtarları
    REG: {
        'cisco-ios': ['cisco-ios', 'cisco-nxos'], 'cisco-asa': ['cisco-asa', 'cisco-ftd'],
        'juniper': ['juniper', 'juniper-srx', 'juniper-mx'], 'huawei': ['huawei', 'huawei-ce', 'huawei-usg'],
    },
    TS_EXTRA: ['cisco-ios', 'huawei', 'dell', 'juniper', 'fortigate'],   // assets/data/ts/<key>.js dosyası olan vendor'lar
    _state: {},   // "<vendor>/<n>" → { ans: ['ok'|'bad'...], found: index|null }

    async render(root, arg1, arg2) {
        this._root = root;
        root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Senaryolar yükleniyor…</p></div>';
        try { await this._loadAll(); }
        catch (e) { root.innerHTML = '<div class="cg-empty"><i class="fas fa-exclamation-triangle"></i><p>Senaryolar yüklenemedi.</p></div>'; return; }
        if (arg1 && arg2 !== undefined) this._paintScenario(arg1, +arg2);
        else if (arg1) this._paintTopic(arg1);
        else this._paintHome();
    },

    async _loadAll() {
        await CgCli._load('assets/data/cli/index.js');
        const idx = window.CG_CLI_INDEX || [];
        await Promise.all(idx.map(v => CgCli._load('assets/data/cli/' + v.key + '.js')));
        if (this._list) return;
        this._list = [];
        // Ek katman: assets/data/ts/<vendor>.js (CLI Lab arıza bulgularından; hub derlemesinden bağımsız).
        // Ek senaryolar n = 100 + sıra ile numaralanır (hub senaryoları yeniden derlense de bağlantı sabit);
        // "replaces" verilirse aynı başlıklı hub senaryosu listeden çıkar.
        await Promise.all(this.TS_EXTRA.filter(k => idx.some(v => v.key === k)).map(k => CgCli._load('assets/data/ts/' + k + '.js').catch(() => null)));
        const extra = window.CG_TS_EXTRA || {};
        idx.forEach(v => {
            const add = extra[v.key] || [], hide = new Set(add.map(s => s.replaces).filter(Boolean));
            ((window.CG_CLI_DATA[v.key] || {}).scenarios || []).forEach((s, n) => {
                if (hide.has(s.title)) return;
                const t = this.TOPICS.find(t => t.re.test(s.title));
                this._list.push({ vendor: v.key, vname: v.name, n, s, topic: t.id });
            });
            add.forEach((s, i) => {
                const t = (s.topic && this.TOPICS.find(t => t.id === s.topic)) || this.TOPICS.find(t => t.re.test(s.title));
                this._list.push({ vendor: v.key, vname: v.name, n: 100 + i, s, topic: t.id });
            });
        });
    },

    _sevCls(s) { return s.severity === 'err' ? 'e' : s.severity === 'warn' ? 'w' : 'i'; },
    _mark(v) { return typeof cgBrandMark === 'function' ? cgBrandMark(v, 14) : ''; },

    _paintHome() {
        const cards = this.TOPICS.map(t => {
            const list = this._list.filter(x => x.topic === t.id);
            if (!list.length) return '';
            const vs = [...new Set(list.map(x => x.vendor))];
            return `<button class="cg-ts-topic" onclick="location.hash='#/troubleshoot/${t.id}'">
                <i class="${t.icon}"></i>
                <span class="cg-ts-topic-l">${cgEsc(t.label)}</span>
                <span class="cg-ts-topic-m">${list.length} senaryo · ${vs.length} platform</span>
            </button>`;
        }).join('');
        this._root.innerHTML = `
        <div class="cg-home cg-ts">
            <div class="cg-cli-hd">
                <h2><i class="fas fa-stethoscope"></i> Sorun Giderme Sihirbazı</h2>
                <p>Belirtiyi seçin, platformu seçin; sihirbaz sizi kontrol komutlarıyla adım adım teşhise götürür.
                   <strong>${this._list.length}</strong> senaryo · <strong>${new Set(this._list.map(x => x.vendor)).size}</strong> platform.</p>
            </div>
            <h3 class="cg-ts-q">1 · Ne sorunu yaşıyorsunuz?</h3>
            <div class="cg-ts-topics">${cards}</div>
        </div>`;
    },

    _paintTopic(tid) {
        const t = this.TOPICS.find(x => x.id === tid);
        if (!t) { location.hash = '#/troubleshoot'; return; }
        const list = this._list.filter(x => x.topic === tid);
        this._root.innerHTML = `
        <div class="cg-home cg-ts">
            ${this._crumbs([[t.label]])}
            <h3 class="cg-ts-q">2 · Hangi platformda, hangi belirti?</h3>
            <div class="cg-ts-scens">${list.map(x => `
                <button class="cg-ts-scen" onclick="location.hash='#/troubleshoot/${x.vendor}/${x.n}'">
                    <span class="cg-ts-scen-v">${this._mark(x.vendor)}${cgEsc(x.vname)}</span>
                    <span class="cg-ts-scen-t"><span class="cg-sev cg-sev-${this._sevCls(x.s)}"></span>${cgEsc(x.s.title)}</span>
                    ${x.s.symptom ? `<span class="cg-ts-scen-s">${cgEsc(x.s.symptom)}</span>` : ''}
                    <span class="cg-ts-scen-n">${x.s.steps.length} adım <i class="fas fa-arrow-right"></i></span>
                </button>`).join('')}
            </div>
        </div>`;
    },

    _crumbs(items) {
        const parts = [`<a href="#/troubleshoot"><i class="fas fa-stethoscope"></i> Sorun Giderme</a>`]
            .concat(items.map(([l, h]) => h ? `<a href="${h}">${cgEsc(l)}</a>` : `<span>${cgEsc(l)}</span>`));
        return `<nav class="cg-ts-crumbs">${parts.join('<i class="fas fa-chevron-right"></i>')}</nav>`;
    },

    _paintScenario(vendor, n) {
        const x = this._list.find(y => y.vendor === vendor && y.n === n);
        if (!x) { location.hash = '#/troubleshoot'; return; }
        const key = vendor + '/' + n;
        const st = this._state[key] || (this._state[key] = { ans: [], found: null });
        const t = this.TOPICS.find(y => y.id === x.topic), steps = x.s.steps;
        const cur = st.found !== null ? -1 : st.ans.length;          // şu anki adım; -1 = bitti
        const done = st.found !== null || cur >= steps.length;
        const pct = Math.round(100 * (done ? steps.length : cur) / steps.length);

        const stepHtml = steps.map((s, i) => {
            const a = st.ans[i];
            const state = i === st.found ? 'bad' : a === 'ok' ? 'ok' : i === cur ? 'cur' : 'todo';
            const ico = { bad: 'fa-times-circle', ok: 'fa-check-circle', cur: 'fa-dot-circle', todo: 'fa-circle' }[state];
            return `<li class="cg-ts-step is-${state}">
                <i class="far ${ico} cg-ts-step-i"></i>
                <div class="cg-ts-step-b">
                    <div class="cg-ts-step-h">Adım ${i + 1}</div>
                    <code data-code="${cgEsc(s.code)}" title="Kopyala">${cgEsc(s.code)}</code>
                    ${s.desc ? `<div class="cg-ts-look"><b>Neye bakılır:</b> ${cgEsc(s.desc)}</div>` : ''}
                    ${state === 'cur' ? `<div class="cg-ts-act">
                        <button class="cg-ts-btn ok" data-ans="ok"><i class="fas fa-check"></i> Çıktı normal — sonraki adım</button>
                        <button class="cg-ts-btn bad" data-ans="bad"><i class="fas fa-exclamation"></i> Sorun burada</button>
                    </div>` : ''}
                </div>
            </li>`;
        }).join('');

        this._root.innerHTML = `
        <div class="cg-home cg-ts">
            ${this._crumbs([[t.label, '#/troubleshoot/' + t.id], [x.vname + ' · ' + x.s.title]])}
            <div class="cg-ts-head">
                <h2><span class="cg-sev cg-sev-${this._sevCls(x.s)}"></span>${cgEsc(x.s.title)}</h2>
                <span class="cg-ts-plat">${this._mark(x.vendor)}${cgEsc(x.vname)}</span>
            </div>
            ${x.s.symptom ? `<p class="cg-cli-sym"><b>Belirti:</b> ${cgEsc(x.s.symptom)}</p>` : ''}
            <div class="cg-ts-prog" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
            <ol class="cg-ts-steps">${stepHtml}</ol>
            ${done ? this._resultHtml(x, st, t) : ''}
            <div class="cg-ts-foot">
                ${st.ans.length || st.found !== null ? '<button class="cg-ts-btn" data-reset><i class="fas fa-undo"></i> Baştan başla</button>' : ''}
                ${st.ans.length && !done ? '<button class="cg-ts-btn" data-back><i class="fas fa-step-backward"></i> Önceki adım</button>' : ''}
            </div>
        </div>`;

        this._root.querySelectorAll('[data-ans]').forEach(b => b.addEventListener('click', () => {
            if (b.dataset.ans === 'bad') st.found = st.ans.length; else st.ans.push('ok');
            this._scroll = true; this._paintScenario(vendor, n);
        }));
        const r = this._root.querySelector('[data-reset]');
        if (r) r.addEventListener('click', () => { this._state[key] = { ans: [], found: null }; this._paintScenario(vendor, n); });
        const bk = this._root.querySelector('[data-back]');
        if (bk) bk.addEventListener('click', () => { st.ans.pop(); this._paintScenario(vendor, n); });
        this._bindCopy();
        if (this._scroll) {   // cevaptan sonra yeni adımı / sonucu görünür yap
            this._scroll = false;
            const el = this._root.querySelector('.cg-ts-result, .cg-ts-step.is-cur');
            if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    },

    // fix: metin ya da [{ cause, cmd }] listesi (cmd isteğe bağlı, satırlar \n ile)
    _fixHtml(fix) {
        if (typeof fix === 'string') return `<p>${cgEsc(fix)}</p>`;
        return '<ul>' + fix.map(f => `<li>${cgEsc(f.cause)}${f.cmd ? `<code data-code="${cgEsc(f.cmd)}" title="Kopyala">${cgEsc(f.cmd)}</code>` : ''}</li>`).join('') + '</ul>';
    },
    _resultHtml(x, st, t) {
        const tools = this._tools(x, t);
        const others = this._list.filter(y => y.topic === x.topic && !(y.vendor === x.vendor && y.n === x.n) && y.vendor === x.vendor);
        const toolHtml = tools.length ? `<div class="cg-ts-rel"><b><i class="fas fa-magic"></i> Düzeltmek için config araçları:</b>
            ${tools.map(r => `<a class="cg-chip" href="#/${r.v}/${r.id}">${this._mark(r.v)}<span class="cg-chip-l">${cgEsc(CG_REGISTRY[r.v].label)} · ${cgEsc(r.label)}</span></a>`).join('')}</div>` : '';
        // Senaryonun pratiği: CLI Lab'daki karşılık gelen arıza lab'ı (varsa)
        const lab = x.s.lab && (window.CG_LAB_IDS ? window.CG_LAB_IDS.includes(x.s.lab) : true) ? x.s.lab : null;
        const labHtml = lab ? `<div class="cg-ts-rel"><b><i class="fas fa-flask"></i> Pratik:</b>
            <a class="cg-chip" href="#/lab/${cgEsc(lab)}"><span class="cg-chip-l">Bu arızayı CLI Lab'da çözün</span></a></div>` : '';
        const cliHtml = `<div class="cg-ts-rel"><b><i class="fas fa-terminal"></i> Daha fazla komut:</b>
            <a class="cg-chip" href="#/cli/${x.vendor}"><span class="cg-chip-l">${cgEsc(x.vname)} komut kütüphanesi</span></a></div>`;
        const otherHtml = others.length ? `<div class="cg-ts-rel"><b><i class="fas fa-random"></i> İlgili senaryolar:</b>
            ${others.map(y => `<a class="cg-chip" href="#/troubleshoot/${y.vendor}/${y.n}"><span class="cg-chip-l">${cgEsc(y.s.title)}</span></a>`).join('')}</div>` : '';
        if (st.found !== null) {
            const s = x.s.steps[st.found];
            return `<div class="cg-ts-result is-bad">
                <h3><i class="fas fa-bullseye"></i> Teşhis: sorun ${st.found + 1}. adımda</h3>
                <p><code>${cgEsc(s.code)}</code> çıktısında beklenmeyen durum var.${s.desc ? ` Bu adımda kontrol edilen: <em>${cgEsc(s.desc)}</em>` : ''}</p>
                <p>Önceki ${st.found} adım normal çıktığı için sorun büyük olasılıkla bu katmanda. Yapılandırmayı düzeltip aynı komutla tekrar doğrulayın.</p>
                ${s.fix ? `<div class="cg-ts-fix"><b><i class="fas fa-wrench"></i> Olası nedenler ve düzeltme:</b>${this._fixHtml(s.fix)}</div>` : ''}
                ${labHtml}${toolHtml}${cliHtml}${otherHtml}
            </div>`;
        }
        return `<div class="cg-ts-result is-ok">
            <h3><i class="fas fa-check-double"></i> Tüm kontroller normal</h3>
            <p>Bu senaryonun ${x.s.steps.length} adımı sorun göstermedi. Sorun başka bir katmanda olabilir: aşağıdaki ilgili senaryolara geçin ya da komut kütüphanesinde daha ayrıntılı debug komutlarına bakın.</p>
            ${labHtml}${otherHtml}${cliHtml}${toolHtml}
        </div>`;
    },

    // Aynı vendor ailesinde, konunun kategorisindeki araçlar; başlıkla kelime örtüşmesine göre sıralı
    _tools(x, t) {
        if (typeof CG_REGISTRY === 'undefined') return [];
        const regs = (this.REG[x.vendor] || [x.vendor]).filter(v => CG_REGISTRY[v]);
        const words = x.s.title.toLowerCase().split(/[^a-z0-9ğüşıöç-]+/).filter(w => w.length > 2);
        const out = [];
        regs.forEach(v => CG_REGISTRY[v].types.forEach(ty => {
            if (ty.cat !== t.cat) return;
            const lbl = ty.label.toLowerCase();
            const score = words.filter(w => lbl.includes(w)).length;
            out.push({ v, id: ty.id, label: ty.label, score });
        }));
        // strict: yalnız başlıkla örtüşen araç (ör. yüksek CPU'ya 'Traffic Shaping' önermemek için)
        return out.filter(r => !t.strict || r.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
    },

    _bindCopy() {
        if (this._root._tsCopyBound) return;
        this._root._tsCopyBound = true;
        this._root.addEventListener('click', e => {
            if (!this._root.querySelector('.cg-ts')) return;
            const el = e.target.closest('[data-code]');
            if (!el) return;
            const ok = () => { el.classList.add('is-copied'); setTimeout(() => el.classList.remove('is-copied'), 900); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(el.dataset.code).then(ok, ok); else ok();
        });
    },
};
