'use strict';

// ─── CLI Lab: "candidate yapılandırma + commit" ailesi — Junos (EX/SRX/MX) ve PAN-OS ───
// Eğitim simülatörüdür; gerçek cihaz değildir. Ortak hiyerarşik motor (şema · ağaç · set/delete ·
// hiyerarşik/set gösterim · fark · ?/Tab) + iki vendor oturumu (CG_LAB_ENGINES: 'juniper', 'paloalto').
//
// Doğrulanmış çıktı/hata biçimleri (kaynaklar):
//  Junos
//   · "syntax error." / "syntax error, expecting <command>." ve "'i' is ambiguous." + "Possible completions:" —
//     şapka (^) hatalı kelimenin başında, istem dahil sütunda:
//     https://github.com/pklimai/junos_hidden_commands (README örnekleri)
//   · "Missing mandatory statement: '…'" + "error: commit failed: (missing mandatory statements)", rollback → "load complete",
//     show | compare biçimi ("[edit system]" / "-  host-name …;" / "+  host-name …;"):
//     https://rayka-co.com/lesson/junos-commit-and-rollback-commands/
//   · commit check'te "error: configuration check-out failed: (missing mandatory statements)":
//     https://kurokiyokiyo.hatenadiary.jp/entry/2015/09/20/181823 · https://supportportal.juniper.net/s/article/SRX-Why-configuration-check-out-failed-error-is-seen-after-executing-commit-check
//   · "Interface … must be configured under interfaces" / "… already assigned to another zone" + "error: configuration check-out failed":
//     https://www.petenetlive.com/KB/Article/0000999 · https://supportportal.juniper.net/s/article/SRX-J-series-Configuration-check-out-failed-the-interface-must-be-in-the-same-routing-instance-as-the-other-interfaces-in-the-zone
//   · root-authentication zorunluluğu ve "require change of case, digit or punctuation":
//     http://commonerrors.blogspot.com/2014/12/juniper-error-missing-mandatory.html
//   · "commit complete", commit confirmed / rollback semantiği:
//     https://www.juniper.net/documentation/us/en/software/junos/cli/topics/topic-map/junos-configuration-commit.html
//     https://www.juniper.net/documentation/us/en/software/junos/cli/topics/topic-map/getting-started.html
//  PAN-OS
//   · "Commit job N is in progress…" / "Configuration committed successfully", validate → "Validate job enqueued with jobid N":
//     https://docs.paloaltonetworks.com/ngfw/pan-os-cli-quick-start/use-the-cli/commit-configuration-changes
//     https://docs.paloaltonetworks.com/ngfw/api/pan-os-xml-api-request-types-and-actions/commit
//   · "Unknown command: …" / "Invalid syntax.":
//     https://live.paloaltonetworks.com/t5/general-topics/cli-invalid-syntax-errors-when-pasting-in-config/td-p/67152
//     https://live.paloaltonetworks.com/t5/general-topics/various-commands-on-cli-returning-unknown/td-p/587180
//   · "… is not a valid reference" (commit doğrulaması):
//     https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA14u000000HBLuCAO · https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000CluACAS
//   · test security-policy-match / test nat-policy-match çıktı iskeleti ("Source-NAT: Rule matched: …", "a:0 => b:port (6)"):
//     https://knowledgebase.paloaltonetworks.com/KCSArticleDetail?id=kA10g000000ClQSCA0
//     https://ansible-pan.readthedocs.io/en/latest/modules/panos_match_rule_module.html
//   · Güvenlik kuralında "hedef IP pre-NAT, hedef zone post-NAT":
//     https://docs.paloaltonetworks.com/ngfw/networking/nat/destination-nat-exampleone-to-one-mapping
//  Emin olunamayan her ileti "# [Simülatör] …" önekiyle açıkça simülatör iletisi olarak verilir.
const CgLabSetCli = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, ip2n, n2ip, fakeHash } = C;

    // ══ Genel yardımcılar ════════════════════════════════════════════════════
    // Tırnaklı değerleri tek parça sayar; | [ ] ayrı simge
    function tok(s) {
        const out = []; let i = 0;
        while (i < s.length) {
            if (/\s/.test(s[i])) { i++; continue; }
            const o = i;
            if (s[i] === '"' || s[i] === "'") {
                const q = s[i++]; let v = '';
                while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) i++; v += s[i++]; }
                i++; out.push({ t: v, o, q: true });
            } else if (s[i] === '|' || s[i] === '[' || s[i] === ']') { out.push({ t: s[i], o, sym: true }); i++; }
            else {
                let v = '';
                while (i < s.length && !/[\s|]/.test(s[i]) && !((s[i] === '[' || s[i] === ']') && !v)) v += s[i++];
                out.push({ t: v, o });
            }
        }
        return out;
    }
    // Kısaltma: tam eşleşme ya da benzersiz önek
    function pick(word, list) {
        const w = String(word).toLowerCase();
        if (list.includes(w)) return { ok: w };
        const h = list.filter(x => x.startsWith(w));
        if (h.length === 1) return { ok: h[0] };
        return h.length ? { err: 'amb', hits: h } : { err: 'none' };
    }
    const pfx = s => { const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(String(s)); if (!m || !isIp(m[1]) || (m[2] !== undefined && +m[2] > 32)) return null; return { ip: m[1], len: m[2] === undefined ? 32 : +m[2] }; };
    const inNet = (ip, p) => !!p && (p.len === 0 || C.netOf(ip, p.len) === C.netOf(p.ip, p.len));
    const netStr = p => n2ip(C.netOf(p.ip, p.len)) + '/' + p.len;
    // RFC 1918 özel adres mi (10/8, 172.16/12, 192.168/16) — oktet karşılaştırmasıyla
    const isPriv = ip => { const o = String(ip).split('.').map(Number); return o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168); };
    const bcast = p => n2ip(C.netOf(p.ip, p.len) + 2 ** (32 - p.len) - 1);
    const qv = v => (/[\s;{}#"]/.test(v) || v === '' ? '"' + String(v).replace(/"/g, '\\"') + '"' : v);
    const portsOk = s => String(s).split(',').every(x => { const m = /^(\d{1,5})(?:-(\d{1,5}))?$/.exec(x); return m && +m[1] >= 1 && +m[1] <= 65535 && (!m[2] || (+m[2] >= +m[1] && +m[2] <= 65535)); });
    const portIn = (spec, p) => String(spec).split(',').some(x => { const [a, b] = x.split('-').map(Number); return p >= a && p <= (b || a); });
    const macOf = (seed) => { const h = fakeHash(seed, 12); return ['00', '50', '56'].concat([0, 1, 2].map(i => ((h.charCodeAt(i * 2) * 7 + h.charCodeAt(i * 2 + 1)) % 256).toString(16).padStart(2, '0'))).join(':'); };

    // ── Değer tipleri
    const VT = {
        word: s => (/^[^\s"'|;{}[\]]{1,255}$/.test(s) ? s : null),
        name: s => (/^[A-Za-z0-9][A-Za-z0-9_.\-]{0,62}$/.test(s) ? s : null),
        str: s => (String(s).length <= 900 ? String(s) : null),
        ip: s => (isIp(s) ? s : null),
        prefix: s => { const p = pfx(s); return p ? p.ip + '/' + p.len : null; },
        host: s => { const p = pfx(s); return p ? p.ip + '/' + p.len : null; },
        jif: s => (/^(ge|xe|et)-\d{1,2}\/\d{1,2}\/\d{1,2}$|^(lo0|irb|vlan|st0|fxp0|em0|ae\d{1,2})$/.test(s) ? s : null),
        jifl: s => (/^((ge|xe|et)-\d{1,2}\/\d{1,2}\/\d{1,2}|lo0|irb|vlan|st0|ae\d{1,2})\.\d{1,5}$/.test(s) && +s.split('.').pop() <= 16385 ? s : null),
        unit: s => (/^\d{1,5}$/.test(s) && +s <= 16385 ? String(+s) : null),
        vid: s => (/^\d{1,4}$/.test(s) && +s >= 1 && +s <= 4094 ? String(+s) : null),
        pref: s => (/^\d{1,10}$/.test(s) && +s <= 4294967295 ? String(+s) : null),
        port: s => (/^\d{1,5}$/.test(s) && +s >= 1 && +s <= 65535 ? String(+s) : null),
        ports: s => (portsOk(s) ? s : null),
        metric: s => (/^\d{1,5}$/.test(s) && +s <= 65535 ? String(+s) : null),
        adist: s => (/^\d{1,3}$/.test(s) && +s >= 10 && +s <= 240 ? String(+s) : null),
        pif: s => (/^ethernet1\/([1-9]|1[0-9]|2[0-4])$|^(loopback|tunnel)\.\d{1,4}$/.test(s) ? s : null),
        paddr: s => (pfx(s) ? s : /^\d{1,3}(\.\d{1,3}){3}-\d{1,3}(\.\d{1,3}){3}$/.test(s) ? s : /^\d+[.\d]*$/.test(s) ? null : VT.name(s)),
    };
    const vcheck = (ty, s) => {
        if (Array.isArray(ty)) { const r = pick(s, ty); return r.ok || null; }
        const f = VT[ty]; return f ? f(String(s)) : null;
    };
    const VLABEL = { word: '<değer>', name: '<ad>', str: '<metin>', ip: '<A.B.C.D>', prefix: '<A.B.C.D/uz>', host: '<A.B.C.D[/uz]>', jif: '<arayüz>', jifl: '<arayüz.birim>', unit: '<0-16385>', vid: '<1-4094>', pref: '<tercih>', port: '<1-65535>', ports: '<port[-port]>', metric: '<0-65535>', adist: '<10-240>', pif: '<ethernetX/Y>', paddr: '<ad|IP/uz>' };

    // ── Şema kurucuları
    //  K: kapsayıcı · L: adlı liste (örnekler) · V: değer · F: bayrak · KV: ad+değer eşlemesi · PW: parola istemi
    //  seçenekler: multi ('each' her değer ayrı satır | 'brack' [ a b ]), wrap (liste adı ayrı blok), join (from-zone … to-zone …),
    //  pres (boş bırakılabilir kapsayıcı), grp (kardeşlerle karşılıklı dışlama), secret, compact (tek alt değerli örnek tek satır),
    //  ref (? için aday adlar: st => [...]), u (gerçekte var ama modellenmemiş alt anahtarlar)
    const K = (c, d, o) => Object.assign({ t: 'c', c, d: d || '' }, o || {});
    const L = (key, c, d, o) => Object.assign({ t: 'l', key, c: c || {}, d: d || '' }, o || {});
    const V = (v, d, o) => Object.assign({ t: 'v', v, d: d || '' }, o || {});
    const F = (d, o) => Object.assign({ t: 'f', d: d || '' }, o || {});
    const KV = (key, v, d) => ({ t: 'kv', key, v, d: d || '' });
    const PW = (d) => ({ t: 'pw', d: d || '' });

    // ── Ağaç: Map (kapsayıcı/örnek) · dizi (çok değerli) · string (değer) · true (bayrak)
    const clone = n => n instanceof Map ? new Map([...n].map(([k, v]) => [k, clone(v)])) : Array.isArray(n) ? n.slice() : n;
    const cfgClone = c => ({ t: clone(c.t), ia: new Set(c.ia) });
    function getIn(tree, path) {
        let n = tree;
        for (const k of path) { if (!(n instanceof Map) || !n.has(k)) return undefined; n = n.get(k); }
        return n;
    }
    const kids = (m, k) => { if (!m.has(k)) m.set(k, new Map()); return m.get(k); };

    // Şema yolu: path belirteçleri (kapsayıcı adları, liste adı + örnek adı)
    function schAt(root, path) {
        let s = root;
        for (let i = 0; i < path.length; i++) {
            const ch = s.c[path[i]];
            if (!ch) return null;
            if (ch.t === 'l') { i++; }
            s = ch;
        }
        return s;
    }

    // ── Ayrıştırıcı: set/delete/edit/show yolu
    // Dönüş: {ok, path, sch, end:'c'|'inst'|'list', leaves:[{kw, sch, at, vals, name}], last:'node'|'leaf'}
    //        {err:'invalid'|'amb'|'value'|'incomplete'|'unsupported', at, hits, sch, need}
    function parse(root, base, toks, mode, allow) {
        let sch = schAt(root, base), path = base.slice(), i = 0, end = base.length ? (sch.t === 'l' ? 'inst' : 'c') : 'c', last = 'node';
        const leaves = [];
        const help = mode === 'help';
        while (i < toks.length) {
            const tk = toks[i];
            if (tk.sym) return { err: 'invalid', at: i };
            const keys = Object.keys(sch.c).filter(k => !allow || allow(k, sch, path));
            const r = pick(tk.t, keys);
            if (!r.ok) {
                if (r.err !== 'amb' && sch.u && pick(tk.t, sch.u).ok) return { err: 'unsupported', at: i, word: pick(tk.t, sch.u).ok };
                return { err: r.err === 'amb' ? 'amb' : 'invalid', at: i, hits: r.hits, sch };
            }
            const kw = r.ok, ch = sch.c[kw];
            if (ch.t === 'c') { path.push(kw); sch = ch; i++; end = 'c'; last = 'node'; continue; }
            if (ch.t === 'l') {
                path.push(kw); i++; last = 'node';
                if (i >= toks.length) { end = 'list'; sch = ch; if (help) return { ok: true, path, sch: ch, end, leaves, need: { kind: 'inst', sch: ch } }; break; }
                const nv = vcheck(ch.key, toks[i].t);
                if (nv === null || toks[i].sym) return { err: 'value', at: i, sch: ch };
                path.push(nv); sch = ch; i++; end = 'inst'; continue;
            }
            if (ch.t === 'f' || ch.t === 'pw') { leaves.push({ kw, sch: ch, at: path.slice(), vals: [] }); i++; last = 'leaf'; continue; }
            if (ch.t === 'v') {
                i++; last = 'leaf';
                const vals = [];
                if (i < toks.length && toks[i].t === '[' && toks[i].sym) {
                    if (!ch.multi) return { err: 'invalid', at: i };
                    i++;
                    while (i < toks.length && !(toks[i].t === ']' && toks[i].sym)) { const v = vcheck(ch.v, toks[i].t); if (v === null) return { err: 'value', at: i, sch: ch }; vals.push(v); i++; }
                    if (i >= toks.length) { if (help) return { ok: true, path, sch, end, leaves, need: { kind: 'val', sch: ch, kw, brack: true } }; return { err: 'incomplete', at: i, sch: ch }; }
                    i++;
                    if (!vals.length) return { err: 'invalid', at: i - 1 };
                } else if (i < toks.length) {
                    const v = vcheck(ch.v, toks[i].t); if (v === null || toks[i].sym) return { err: 'value', at: i, sch: ch }; vals.push(v); i++;
                } else if (help) return { ok: true, path, sch, end, leaves, need: { kind: 'val', sch: ch, kw } };
                else if (mode === 'set') return { err: 'incomplete', at: i, sch: ch };
                leaves.push({ kw, sch: ch, at: path.slice(), vals });
                continue;
            }
            if (ch.t === 'kv') {
                i++; last = 'leaf';
                if (i >= toks.length) { if (help) return { ok: true, path, sch, end, leaves, need: { kind: 'kvname', sch: ch, kw } }; if (mode === 'set') return { err: 'incomplete', at: i }; leaves.push({ kw, sch: ch, at: path.slice(), name: null, vals: [] }); continue; }
                const nm = vcheck(ch.key, toks[i].t); if (nm === null) return { err: 'value', at: i, sch: ch }; i++;
                const vals = [];
                if (i < toks.length) { const v = vcheck(ch.v, toks[i].t); if (v === null) return { err: 'value', at: i, sch: ch }; vals.push(v); i++; }
                else if (help) return { ok: true, path, sch, end, leaves, need: { kind: 'kvval', sch: ch, kw } };
                else if (mode === 'set') return { err: 'incomplete', at: i };
                leaves.push({ kw, sch: ch, at: path.slice(), name: nm, vals });
                continue;
            }
        }
        return { ok: true, path, sch, end, leaves, last };
    }

    // set uygula (ağaç yerinde değişir). pwVal: parola bayrağı için üretilmiş şifreli değer
    function ensure(root, tree, path) {
        let n = tree, s = root;
        for (let i = 0; i < path.length; i++) {
            const ch = s.c[path[i]];
            if (ch.grp) for (const k of [...n.keys()]) if (k !== path[i] && s.c[k] && s.c[k].grp === ch.grp) n.delete(k);
            n = kids(n, path[i]);
            if (ch.t === 'l') { i++; if (i < path.length) n = kids(n, path[i]); }
            s = ch;
        }
        return n;
    }
    function applySet(root, tree, res) {
        ensure(root, tree, res.path);
        for (const lf of res.leaves) {
            const n = ensure(root, tree, lf.at), s = schAt(root, lf.at), ch = lf.sch;
            if (ch.grp) for (const k of [...n.keys()]) if (k !== lf.kw && s.c[k] && s.c[k].grp === ch.grp) n.delete(k);
            if (ch.t === 'f') n.set(lf.kw, true);
            else if (ch.t === 'v') {
                if (ch.multi) { const a = Array.isArray(n.get(lf.kw)) ? n.get(lf.kw) : []; lf.vals.forEach(v => { if (!a.includes(v)) a.push(v); }); n.set(lf.kw, a); }
                else n.set(lf.kw, lf.vals[lf.vals.length - 1]);
            } else if (ch.t === 'kv') kids(n, lf.kw).set(lf.name, lf.vals[0]);
        }
    }
    // Yol belirteçlerinin şema rolleri: c (kapsayıcı) · lk (liste adı) · inst (örnek adı) · leaf
    function roles(root, path) {
        const r = []; let s = root;
        for (let i = 0; i < path.length; i++) {
            const ch = s.c && s.c[path[i]];
            if (!ch) { r.push('?'); break; }
            if (ch.t === 'l') { r.push('lk'); i++; if (i < path.length) r.push('inst'); s = ch; }
            else if (ch.t === 'c') { r.push('c'); s = ch; }
            else { r.push('leaf'); break; }
        }
        return r;
    }
    // Bir yolun "içeriği" için ifade listesi / set satırları (yol liste adıyla bitebilir: show interfaces)
    function stmtsAt(root, cfg, path, style) {
        const ro = roles(root, path), node = path.length ? getIn(cfg.t, path) : cfg.t;
        if (node === undefined) return [];
        if (ro[ro.length - 1] === 'lk') {
            const par = schAt(root, path.slice(0, -1)), kw = path[path.length - 1];
            const st = stmts(root, par, new Map([[kw, node]]), path.slice(0, -1), cfg.ia, style);
            return par.c[kw].wrap || style.wrapAll ? (st[0] ? st[0].kids : []) : st;
        }
        if (!(node instanceof Map)) { const par = schAt(root, path.slice(0, -1)); return stmts(root, par, new Map([[path[path.length - 1], node]]), path.slice(0, -1), cfg.ia, style); }
        return stmts(root, schAt(root, path), node, path, cfg.ia, style);
    }
    function setLinesAt(root, cfg, path, style) {
        const ro = roles(root, path), node = path.length ? getIn(cfg.t, path) : cfg.t;
        if (node === undefined) return [];
        if (ro[ro.length - 1] === 'lk' || !(node instanceof Map)) { const par = schAt(root, path.slice(0, -1)); return setLines(root, par, new Map([[path[path.length - 1], node]]), path.slice(0, -1), cfg.ia, style); }
        return setLines(root, schAt(root, path), node, path, cfg.ia, style);
    }
    // Boş (pres olmayan) kapsayıcıları ve boş listeleri yukarı doğru buda; liste örnekleri korunur
    function prune(root, tree, path) {
        const ro = roles(root, path);
        for (let d = path.length; d > 0; d--) {
            const p = path.slice(0, d), node = getIn(tree, p), role = ro[d - 1];
            if (!(node instanceof Map) || node.size) break;
            if (role === 'lk' || (role === 'c' && !schAt(root, p).pres)) getIn(tree, p.slice(0, -1)).delete(p[d - 1]);
            else break;
        }
    }
    // delete uygula → bulundu mu
    function applyDelete(root, tree, res) {
        if (res.leaves.length) {
            const lf = res.leaves[res.leaves.length - 1], n = getIn(tree, lf.at);
            if (!(n instanceof Map) || !n.has(lf.kw)) return false;
            if (lf.sch.t === 'v' && lf.sch.multi && lf.vals.length) {
                const a = n.get(lf.kw), keep = a.filter(v => !lf.vals.includes(v));
                if (keep.length === a.length) return false;
                if (keep.length) n.set(lf.kw, keep); else n.delete(lf.kw);
            } else if (lf.sch.t === 'kv' && lf.name) {
                const m = n.get(lf.kw); if (!m.has(lf.name)) return false; m.delete(lf.name); if (!m.size) n.delete(lf.kw);
            } else n.delete(lf.kw);
            prune(root, tree, lf.at);
            return true;
        }
        const p = res.path; if (!p.length) { const had = tree.size > 0; tree.clear(); return had; }
        const parent = getIn(tree, p.slice(0, -1));
        if (!(parent instanceof Map) || !parent.has(p[p.length - 1])) return false;
        parent.delete(p[p.length - 1]);
        prune(root, tree, p.slice(0, -1));
        return true;
    }

    // Kapsayıcı çocukları şema sırasıyla (Junos/PAN-OS gösterimi kanonik sıradadır); liste örnekleri eklenme sırasıyla
    const natCmp = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true });
    const ordered = (sch, node) => (sch && sch.c ? Object.keys(sch.c).filter(k => node.has(k)).map(k => [k, node.get(k)]) : [...node]);
    // ── Gösterim: ifade ağacı (render + diff aynı yapıdan)
    // stmt: {id, text, kids|null, ia, key}
    function stmts(root, sch, node, path, ia, style) {
        const out = [];
        if (!(node instanceof Map)) return out;
        for (const [k, v] of ordered(sch, node)) {
            const ch = sch.c[k]; if (!ch) continue;
            const p = path.concat([k]), iaHere = ia.has(p.join(' '));
            if (ch.t === 'c') out.push({ id: k, text: k, kids: stmts(root, ch, v, p, ia, style), ia: iaHere, key: p.join(' ') });
            else if (ch.t === 'l') {
                const insts = [];
                for (const [nm, inst] of (ch.sort ? [...v].sort((a, b) => natCmp(a[0], b[0])) : v)) insts.push(...instStmts(root, ch, k, nm, inst, p, ia, style));
                if (ch.wrap || style.wrapAll) out.push({ id: k, text: k, kids: insts.map(s => Object.assign(s, { text: s.text.slice(k.length + 1), id: s.id.slice(k.length + 1) })), ia: iaHere, key: p.join(' ') });
                else out.push(...insts);
            } else if (ch.t === 'v') {
                const sec = ch.secret && style.secret ? ' ' + style.secret : '';
                if (ch.multi && Array.isArray(v)) {
                    if (ch.multi === 'each' && !style.brackAll) v.forEach(x => out.push({ id: k + ' ' + x, text: k + ' ' + qv(x) + ';', kids: null, ia: ia.has(p.concat([x]).join(' ')), key: p.concat([x]).join(' ') }));
                    else out.push({ id: k, text: k + ' ' + (v.length > 1 ? '[ ' + v.map(qv).join(' ') + ' ]' : qv(v[0])) + ';', kids: null, ia: iaHere, key: p.join(' ') });
                } else out.push({ id: k, text: k + ' ' + (ch.secret ? '"' + v + '"' : qv(v)) + ';' + sec, kids: null, ia: iaHere, key: p.join(' ') });
            } else if (ch.t === 'f') out.push({ id: k, text: k + ';', kids: null, ia: iaHere, key: p.join(' ') });
            else if (ch.t === 'kv') for (const [nm, val] of v) out.push({ id: k + ' ' + nm, text: k + ' ' + nm + ' ' + qv(val) + ';', kids: null, ia: ia.has(p.concat([nm]).join(' ')), key: p.concat([nm]).join(' ') });
        }
        return out;
    }
    function instStmts(root, ch, k, nm, inst, p0, ia, style) {
        const p = p0.concat([nm]), label = k + ' ' + nm, iaHere = ia.has(p.join(' '));
        // from-zone A to-zone B birleşik gösterimi
        if (inst instanceof Map && inst.size === 1) {
            const [jk, jv] = [...inst][0], jch = ch.c[jk];
            if (jch && jch.t === 'l' && jch.join) {
                const r = [];
                for (const [jn, jinst] of jv) {
                    const jp = p.concat([jk, jn]);
                    r.push({ id: label + ' ' + jk + ' ' + jn, text: label + ' ' + jk + ' ' + jn, kids: stmts(root, jch, jinst, jp, ia, style), ia: ia.has(jp.join(' ')), key: jp.join(' ') });
                }
                return r;
            }
        }
        const ks = stmts(root, ch, inst, p, ia, style);
        if (ch.compact && ks.length === 1 && !ks[0].kids && !ks[0].ia) return [{ id: label, text: label + ' ' + ks[0].text, kids: null, ia: iaHere, key: p.join(' ') }];
        return [{ id: label, text: label, kids: ks, ia: iaHere, key: p.join(' ') }];
    }
    function render(list, unit, ind, out, pre) {
        ind = ind || ''; out = out || []; pre = pre || '';
        for (const s of list) {
            const t = (s.ia ? 'inactive: ' : '') + s.text;
            if (!s.kids) out.push(pre + ind + t);
            else if (!s.kids.length) out.push(pre + ind + t + ';');
            else { out.push(pre + ind + t + ' {'); render(s.kids, unit, ind + ' '.repeat(unit), out, pre); out.push(pre + ind + '}'); }
        }
        return out;
    }
    // Hiyerarşik fark (Junos "show | compare" biçimi)
    function diff(A, B, path, out, unit) {
        const mA = new Map(A.map(s => [s.id, s])), mB = new Map(B.map(s => [s.id, s]));
        const local = [], nested = [];
        const pre = (c, s) => render([s], unit, '', [], c + '  ');
        for (const s of A) if (!mB.has(s.id)) local.push(...pre('-', s));
        for (const s of B) {
            const a = mA.get(s.id);
            if (!a) { local.push(...pre('+', s)); continue; }
            const leafish = !a.kids || !s.kids || !a.kids.length || !s.kids.length;
            if (a.ia !== s.ia && a.text === s.text) { local.push('!    ' + (s.ia ? 'inactive: ' : 'active: ') + s.text + (s.kids && s.kids.length ? ' { ... }' : '')); if (a.kids && s.kids) nested.push([a.kids.map(x => x), s.kids, path.concat([s.text])]); continue; }
            if (a.ia !== s.ia || (leafish && (a.text !== s.text || !!a.kids !== !!s.kids || (a.kids && s.kids && a.kids.length !== s.kids.length)))) { local.push(...pre('-', a), ...pre('+', s)); continue; }
            if (a.kids && s.kids) nested.push([a.kids, s.kids, path.concat([s.text])]);
        }
        if (local.length) out.push('[edit' + (path.length ? ' ' + path.join(' ') : '') + ']', ...local);
        for (const [a, b, p] of nested) diff(a, b, p, out, unit);
        return out;
    }
    // set biçimi satırları
    function setLines(root, sch, node, pre, ia, style, out) {
        out = out || [];
        if (!(node instanceof Map)) return out;
        const Q = x => qv(x);
        for (const [k, v] of ordered(sch, node)) {
            const ch = sch.c[k]; if (!ch) continue;
            const p = pre.concat([k]);
            if (ch.t === 'c') { if (!v.size) out.push('set ' + p.join(' ')); else setLines(root, ch, v, p, ia, style, out); }
            else if (ch.t === 'l') for (const [nm, inst] of (ch.sort ? [...v].sort((a, b) => natCmp(a[0], b[0])) : v)) { const q = p.concat([nm]); if (!inst.size) out.push('set ' + q.join(' ')); else setLines(root, ch, inst, q, ia, style, out); }
            else if (ch.t === 'v') {
                if (Array.isArray(v)) { if (style.brackSet && v.length > 1) out.push('set ' + p.join(' ') + ' [ ' + v.map(Q).join(' ') + ' ]'); else v.forEach(x => out.push('set ' + p.join(' ') + ' ' + Q(x))); }
                else out.push('set ' + p.join(' ') + ' ' + (ch.secret ? '"' + v + '"' : Q(v)));
            } else if (ch.t === 'f') out.push('set ' + p.join(' '));
            else if (ch.t === 'kv') for (const [nm, val] of v) out.push('set ' + p.join(' ') + ' ' + nm + ' ' + Q(val));
        }
        return out;
    }
    // Pasif (inactive) yolları çıkarılmış etkin ağaç
    function effective(root, cfg) {
        if (!cfg.ia.size) return cfg.t;
        const t = clone(cfg.t);
        for (const k of cfg.ia) {
            const p = k.split(' '), parent = getIn(t, p.slice(0, -1)), last = p[p.length - 1];
            if (parent instanceof Map) parent.delete(last);
            else if (Array.isArray(parent)) { const gp = getIn(t, p.slice(0, -2)); if (gp instanceof Map) gp.set(p[p.length - 2], parent.filter(x => x !== last)); }
        }
        return t;
    }
    // Pipe süzgeçleri (| match / except / count / last / no-more)
    function pipeFilter(text, pipes, err) {
        let lines = text.split('\n');
        for (const p of pipes) {
            if (p.k === 'match') { let re; try { re = new RegExp(p.a, 'i'); } catch (e) { re = null; } lines = lines.filter(l => re ? re.test(l) : l.includes(p.a)); }
            else if (p.k === 'except') { let re; try { re = new RegExp(p.a, 'i'); } catch (e) { re = null; } lines = lines.filter(l => !(re ? re.test(l) : l.includes(p.a))); }
            else if (p.k === 'count') lines = ['Count: ' + lines.filter(l => l.trim()).length + ' lines'];
            else if (p.k === 'last') lines = lines.slice(-(+p.a || 10));
        }
        return lines.join('\n');
    }

    // ── ? satırları: [işaret, kelime, açıklama]
    function schemaRows(sch, st, allow, path) {
        const rows = [];
        for (const [k, ch] of Object.entries(sch.c)) {
            if (allow && !allow(k, sch, path)) continue;
            rows.push([ch.t === 'c' || ch.t === 'l' ? '>' : ch.t === 'v' && ch.multi ? '+' : ' ', k, ch.d || '']);
        }
        return rows.sort((a, b) => a[1].localeCompare(b[1]));
    }
    function valueRows(ch, st, kind) {
        if (kind === 'inst') { const names = ch.ref ? ch.ref(st) : []; return names.map(n => [' ', n, '']).concat([[' ', VLABEL[ch.key] || '<ad>', ch.d || '']]); }
        const ty = kind === 'kvname' ? ch.key : ch.v;
        if (Array.isArray(ty)) return ty.map(v => [' ', v, '']);
        const names = ch.ref ? ch.ref(st) : [];
        return names.map(n => [' ', n, '']).concat([[' ', VLABEL[ty] || '<değer>', ch.d || '']]);
    }

    // ══ Ortak oturum iskeleti (candidate / aktif / geçmiş / olaylar) ═══════════
    function evApi(S) {
        return {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            after: (a, b) => { const i = S.ev.findIndex(e => e.canon && a.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && b.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            err: k => S.ev.some(e => e.err === k),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw && e.raw.trim().toLowerCase() !== canon),
            list: () => S.ev,
            commit: k => S.ev.some(e => e.commit === k),
            lastCommit: () => { for (let i = S.ev.length - 1; i >= 0; i--) if (S.ev[i].commit) return S.ev[i].commit; return null; },
        };
    }
    const SIMCLK = (n) => { const b = Date.UTC(2026, 8, 25, 9, 30, 0) + n * 97000; return new Date(b).toISOString().replace('T', ' ').slice(0, 19); };

    // ═════════════════════════════════════════════════════════════════════════
    // ══ JUNOS ════════════════════════════════════════════════════════════════
    // ═════════════════════════════════════════════════════════════════════════
    const JUNOS_VER = '23.4R2-S3.9';
    const JPLAT = {
        srx: { model: 'vsrx', ports: 5, desc: 'SRX (güvenlik ağ geçidi)' },
        ex: { model: 'ex2300-24t', ports: 24, desc: 'EX anahtar' },
        mx: { model: 'vmx', ports: 10, desc: 'MX yönlendirici' },
    };
    const JAPPS = { 'junos-http': ['tcp', 80], 'junos-https': ['tcp', 443], 'junos-ssh': ['tcp', 22], 'junos-dns-udp': ['udp', 53], 'junos-dns-tcp': ['tcp', 53], 'junos-ntp': ['udp', 123], 'junos-ping': ['icmp', 0], 'junos-smtp': ['tcp', 25], 'junos-rdp': ['tcp', 3389] };
    const HISVC = ['all', 'ping', 'ssh', 'https', 'http', 'ike', 'ntp', 'dhcp', 'dns', 'snmp', 'traceroute', 'netconf'];
    function junosSchema(plat) {
        const vlanRef = st => [...(getIn(st.cand.t, ['vlans']) || new Map()).keys()];
        const zoneRef = st => [...(getIn(st.cand.t, ['security', 'zones', 'security-zone']) || new Map()).keys()];
        const abRef = st => ['any', 'any-ipv4'].concat([...(getIn(st.cand.t, ['security', 'address-book', 'global', 'address']) || new Map()).keys()]);
        const appRef = st => ['any'].concat(Object.keys(JAPPS), [...(getIn(st.cand.t, ['applications', 'application']) || new Map()).keys()]);
        const iflRef = st => { const r = []; for (const [n, i] of (getIn(st.cand.t, ['interfaces']) || new Map())) for (const u of (i.get('unit') || new Map()).keys()) r.push(n + '.' + u); return r; };
        const ifRef = st => [...(getIn(st.cand.t, ['interfaces']) || new Map()).keys()];
        const pwc = () => ({ 'encrypted-password': V('str', 'Şifrelenmiş parola (hash)', { secret: true }), 'plain-text-password': PW('Parolayı açık metin olarak girin (istem ile)') });
        const root = K({
            system: K({
                'host-name': V('word', 'Cihaz adı'),
                'time-zone': V('word', 'Saat dilimi (ör. Europe/Istanbul)'),
                'root-authentication': K(pwc(), 'root kullanıcısının kimlik doğrulaması'),
                login: K({
                    user: L('name', {
                        class: V(['super-user', 'operator', 'read-only', 'unauthorized'], 'Yetki sınıfı'),
                        'full-name': V('str', 'Tam ad'),
                        authentication: K(pwc(), 'Kimlik doğrulama yöntemleri'),
                    }, 'Yerel kullanıcı hesabı', { ref: st => [...(getIn(st.cand.t, ['system', 'login', 'user']) || new Map()).keys()] }),
                    message: V('str', 'Oturum açma iletisi'),
                }, 'Kullanıcılar ve sınıflar', { u: ['class', 'retry-options', 'password', 'announcement'] }),
                services: K({
                    ssh: K({ 'root-login': V(['allow', 'deny', 'deny-password'], 'root ile SSH girişine izin'), 'connection-limit': V('metric', 'Eşzamanlı bağlantı sınırı') }, 'SSH hizmeti', { pres: true }),
                    netconf: K({ ssh: K({}, 'NETCONF over SSH', { pres: true }) }, 'NETCONF hizmeti', { pres: true }),
                }, 'Sistem hizmetleri', { u: ['web-management', 'telnet', 'ftp', 'dhcp-local-server', 'dns', 'rest', 'outbound-ssh'] }),
                'name-server': L('ip', {}, 'DNS sunucusu', { wrap: true }),
                ntp: K({ server: L('ip', { prefer: F('Tercih edilen sunucu') }, 'NTP sunucusu') }, 'Zaman eşitleme', { u: ['boot-server', 'authentication-key', 'source-address'] }),
            }, 'Sistem ayarları', { u: ['syslog', 'archival', 'ports', 'license', 'domain-name', 'location', 'radius-server', 'tacplus-server', 'authentication-order', 'max-configurations-on-flash', 'commit'] }),
            interfaces: L('jif', {
                description: V('str', 'Açıklama'),
                disable: F('Arayüzü yönetsel olarak kapat'),
                unit: L('unit', {
                    description: V('str', 'Açıklama'),
                    disable: F('Birimi kapat'),
                    family: K({
                        inet: K({ address: V('prefix', 'IPv4 adresi/önek uzunluğu', { multi: 'each' }) }, 'IPv4', { pres: true, u: ['filter', 'mtu', 'dhcp'] }),
                        'ethernet-switching': K({
                            'interface-mode': V(['access', 'trunk'], 'Port modu'),
                            vlan: K({ members: V('word', 'VLAN adı(ları)', { multi: 'brack', ref: vlanRef }) }, 'VLAN üyeliği'),
                        }, 'Katman 2 anahtarlama', { pres: true, u: ['native-vlan-id', 'storm-control', 'filter'] }),
                    }, 'Protokol ailesi', { u: ['inet6', 'mpls', 'iso'] }),
                }, 'Mantıksal birim', { ref: st => ['0'], sort: true }),
            }, 'Arayüzler', { wrap: true, ref: ifRef, sort: true }),
            'routing-options': K({
                static: K({
                    route: L('prefix', {
                        'next-hop': V('ip', 'Sonraki atlama', { multi: 'brack' }),
                        'qualified-next-hop': L('ip', { preference: V('pref', 'Bu sonraki atlamanın tercihi') }, 'Tercihli ek sonraki atlama'),
                        preference: V('pref', 'Tercih (varsayılan statik 5)'),
                        discard: F('Paketi sessizce at', { grp: 'nhx' }), reject: F('Paketi ICMP ile reddet', { grp: 'nhx' }),
                    }, 'Statik rota', { compact: true }),
                }, 'Statik rotalar', { u: ['defaults', 'rib-group'] }),
                'router-id': V('ip', 'Yönlendirici kimliği'),
            }, 'Yönlendirme seçenekleri', { u: ['autonomous-system', 'rib', 'forwarding-table', 'aggregate', 'generate'] }),
        }, '', { u: ['protocols', 'firewall', 'policy-options', 'class-of-service', 'chassis', 'snmp', 'groups', 'access', 'forwarding-options', 'routing-instances', 'services', 'event-options', 'poe', 'switch-options', 'protocols', 'apply-groups', 'version'] });
        if (plat !== 'mx') {
            root.c.vlans = L('name', { 'vlan-id': V('vid', 'VLAN etiketi'), 'l3-interface': V('jifl', 'VLAN\'ın yönlendirme arayüzü (irb.N)'), description: V('str', 'Açıklama') }, 'VLAN tanımları', { wrap: true, ref: vlanRef });
            root.c.interfaces.c.unit.c.family.c.inet.u.push('dhcp-client');
        }
        if (plat === 'srx') {
            const hit = () => K({ 'system-services': K(Object.fromEntries(HISVC.map(x => [x, F(x === 'all' ? 'Tüm hizmetler' : x + ' hizmetine izin')])), 'Cihaza yönelik hizmetler (ping, ssh …)'),
                protocols: K(Object.fromEntries(['all', 'ospf', 'bgp', 'bfd', 'vrrp'].map(x => [x, F(x + ' protokolüne izin')])), 'Cihaza yönelik yönlendirme protokolleri') }, 'Cihazın kendisine gelen trafiğe izin (host-inbound)');
            root.c.security = K({
                zones: K({
                    'security-zone': L('name', {
                        interfaces: L('jifl', { 'host-inbound-traffic': hit() }, 'Bölgeye bağlı mantıksal arayüzler', { wrap: true, ref: iflRef }),
                        'host-inbound-traffic': hit(),
                        description: V('str', 'Açıklama'),
                    }, 'Güvenlik bölgesi', { ref: zoneRef, u: ['screen', 'address-book', 'tcp-rst', 'application-tracking'] }),
                }, 'Güvenlik bölgeleri', { u: ['functional-zone'] }),
                'address-book': L('name', { address: KV('name', 'host', 'Adres nesnesi: <ad> <önek>') }, 'Adres defteri (global)', { wrap: true, ref: st => ['global'], u: ['address-set', 'attach'] }),
                policies: K({
                    'from-zone': L('name', {
                        'to-zone': L('name', {
                            policy: L('name', {
                                match: K({
                                    'source-address': V('word', 'Kaynak adres(ler)', { multi: 'brack', ref: abRef }),
                                    'destination-address': V('word', 'Hedef adres(ler)', { multi: 'brack', ref: abRef }),
                                    application: V('word', 'Uygulama(lar)', { multi: 'brack', ref: appRef }),
                                }, 'Eşleşme koşulları', { u: ['source-identity', 'dynamic-application', 'url-category', 'source-address-excluded'] }),
                                then: K({
                                    permit: F('İzin ver', { grp: 'act' }), deny: F('Sessizce düşür', { grp: 'act' }), reject: F('Reddet (TCP RST / ICMP)', { grp: 'act' }),
                                    log: K({ 'session-init': F('Oturum başında logla'), 'session-close': F('Oturum sonunda logla') }, 'Oturum logu'),
                                    count: F('Sayaç tut'),
                                }, 'Eylem'),
                                description: V('str', 'Açıklama'),
                            }, 'Güvenlik kuralı', { ref: st => { const r = new Set(); for (const [, a] of (getIn(st.cand.t, ['security', 'policies', 'from-zone']) || new Map())) for (const [, b] of (a.get('to-zone') || new Map())) for (const p of (b.get('policy') || new Map()).keys()) r.add(p); return [...r]; } }),
                        }, 'Hedef bölge', { join: true, ref: zoneRef }),
                    }, 'Kaynak bölge', { ref: zoneRef }),
                    'default-policy': K({ 'deny-all': F('Varsayılan: hepsini reddet', { grp: 'dp' }), 'permit-all': F('Varsayılan: hepsine izin (önerilmez)', { grp: 'dp' }) }, 'Eşleşmeyen trafik için varsayılan'),
                }, 'Güvenlik kuralları', { u: ['global', 'pre-id-default-policy', 'policy-rematch', 'policy-stats'] }),
                nat: K({
                    source: K({
                        'rule-set': L('name', {
                            from: K({ zone: V('word', 'Kaynak bölge', { multi: 'brack', ref: zoneRef }) }, 'Paketin geldiği bölge', { u: ['interface', 'routing-instance'] }),
                            to: K({ zone: V('word', 'Hedef bölge', { multi: 'brack', ref: zoneRef }) }, 'Paketin gittiği bölge', { u: ['interface', 'routing-instance'] }),
                            rule: L('name', {
                                match: K({ 'source-address': V('prefix', 'Kaynak önek', { multi: 'brack' }), 'destination-address': V('prefix', 'Hedef önek', { multi: 'brack' }) }, 'Eşleşme', { u: ['destination-port', 'protocol', 'application', 'source-address-name'] }),
                                then: K({ 'source-nat': K({ interface: F('Çıkış arayüzünün adresine çevir', { grp: 'sn' }), off: F('Çevirme yapma', { grp: 'sn' }) }, 'Kaynak NAT eylemi', { u: ['pool'] }) }, 'Eylem'),
                            }, 'NAT kuralı'),
                        }, 'NAT kural kümesi'),
                    }, 'Kaynak NAT', { u: ['pool', 'address-persistent', 'interface'] }),
                }, 'NAT', { u: ['destination', 'static', 'proxy-arp'] }),
            }, 'Güvenlik (SRX)', { u: ['screen', 'ike', 'ipsec', 'flow', 'log', 'alg', 'idp', 'utm', 'application-tracking', 'ssh-known-hosts', 'pki'] });
            root.c.applications = K({ application: L('name', { protocol: V(['tcp', 'udp', 'icmp'], 'IP protokolü'), 'destination-port': V('ports', 'Hedef port(lar)') }, 'Özel uygulama tanımı', { ref: st => [...(getIn(st.cand.t, ['applications', 'application']) || new Map()).keys()] }) }, 'Uygulama nesneleri', { u: ['application-set'] });
        }
        return root;
    }

    function junosSession(lab, opts) {
        const plat = lab.platform || (lab.kind === 'switch' ? 'ex' : lab.kind === 'firewall' ? 'srx' : 'mx');
        const P = JPLAT[plat], ROOT = junosSchema(plat), USER = lab.user || 'lab';
        const S = { ev: [], mode: 'op', edit: [], editStack: [], pending: null, answers: {}, loggedOut: false, confirm: null, commitN: 0 };
        S.variant = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        const SIM = Object.assign({}, lab.sim || {}, (S.variant && S.variant.sim) || {});
        const hosts = (lab.hosts || []).concat(SIM.hosts || []);
        const up = new Set(lab.up || []);
        const physPorts = () => { const r = []; for (let i = 0; i < P.ports; i++) r.push('ge-0/0/' + i); return r; };
        S.hist = [{ cfg: { t: new Map(), ia: new Set() }, meta: { by: 'root', via: 'other', n: 0 } }];
        S.cand = cfgClone(S.hist[0].cfg);
        const ST = { get cand() { return S.cand; } };
        const log = o => S.ev.push(o);
        const active = () => S.hist[0].cfg;
        const act = () => effective(ROOT, active());
        const host = () => (getIn(act(), ['system', 'host-name']) || lab.hostname || '');
        const allow = null;

        // ── istem ve bağlam satırı
        const editBanner = () => '[edit' + (S.edit.length ? ' ' + editText(S.edit) : '') + ']';
        function editText(path) {
            // yol belirteçlerini Junos başlık biçimine çevir: "security policies from-zone a to-zone b"
            return path.join(' ');
        }
        const prompt = () => {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            return USER + '@' + host() + (S.mode === 'cfg' ? '# ' : '> ');
        };
        const cfgOut = (body) => {
            let b = body || '';
            if (S.confirm) b = (b ? b + '\n' : '') + '\n# commit confirmed will be rolled back in ' + Math.max(1, Math.ceil((S.confirm.until - Date.now()) / 60000)) + ' minutes';
            return (b ? b + '\n' : '') + '\n' + editBanner();
        };
        const caret = (col, msg) => ' '.repeat(prompt().length + col) + '^\n' + msg;

        // ── commit doğrulaması
        function validate(cfg) {
            const t = effective(ROOT, cfg), mand = [], co = [];
            const sys = t.get('system');
            if (!sys || !(sys.get('root-authentication') instanceof Map) || !sys.get('root-authentication').get('encrypted-password')) mand.push(['[edit]', "'system'", "Missing mandatory statement: 'root-authentication'"]);
            for (const [u, o] of (getIn(t, ['system', 'login', 'user']) || new Map())) if (!o.get('class')) mand.push(['[edit system login]', "'user " + u + "'", "Missing mandatory statement: 'class'"]);
            const ifls = new Set(); for (const [n, i] of (t.get('interfaces') || new Map())) for (const u of (i.get('unit') || new Map()).keys()) ifls.add(n + '.' + u);
            const zones = getIn(t, ['security', 'zones', 'security-zone']) || new Map(), seen = {};
            for (const [z, zo] of zones) for (const ifl of (zo.get('interfaces') || new Map()).keys()) {
                if (!ifls.has(ifl)) co.push(['[edit security zones security-zone ' + z + ' interfaces]', "'" + ifl + "'", 'Interface ' + ifl + ' must be configured under interfaces']);
                if (seen[ifl]) co.push(['[edit security zones security-zone ' + z + ' interfaces]', "'" + ifl + "'", 'Interface ' + ifl + ' already assigned to another zone']);
                seen[ifl] = z;
            }
            const ab = getIn(t, ['security', 'address-book', 'global', 'address']) || new Map();
            const apps = getIn(t, ['applications', 'application']) || new Map();
            for (const [fz, a] of (getIn(t, ['security', 'policies', 'from-zone']) || new Map())) for (const [tz, b] of (a.get('to-zone') || new Map())) {
                const ctx = 'from-zone ' + fz + ' to-zone ' + tz;
                [fz, tz].forEach(z => { if (!zones.has(z)) co.push(['[edit security policies ' + ctx + ']', "'" + ctx + "'", "# [Simülatör] '" + z + "' adlı güvenlik bölgesi (security-zone) tanımlı değil"]); });
                for (const [pn, p] of (b.get('policy') || new Map())) {
                    const hdr = '[edit security policies ' + ctx + ' policy ' + pn + ']';
                    const m = p.get('match');
                    if (!(m instanceof Map)) mand.push(['[edit security policies ' + ctx + ']', "'policy " + pn + "'", "Missing mandatory statement: 'match'"]);
                    else {
                        ['source-address', 'destination-address', 'application'].forEach(f => { if (!m.get(f)) mand.push([hdr, "'match'", "Missing mandatory statement: '" + f + "'"]); });
                        ['source-address', 'destination-address'].forEach(f => (m.get(f) || []).forEach(x => { if (!['any', 'any-ipv4', 'any-ipv6'].includes(x) && !ab.has(x)) co.push([hdr + ' match', "'" + f + ' ' + x + "'", "# [Simülatör] '" + x + "' adres defterinde (address-book) yok"]); }));
                        (m.get('application') || []).forEach(x => { if (x !== 'any' && !JAPPS[x] && !apps.has(x)) co.push([hdr + ' match', "'application " + x + "'", "# [Simülatör] '" + x + "' adlı uygulama tanımlı değil"]); });
                    }
                    const th = p.get('then');
                    if (!(th instanceof Map) || !['permit', 'deny', 'reject'].some(k => th.has(k))) mand.push(['[edit security policies ' + ctx + ']', "'policy " + pn + "'", "Missing mandatory statement: 'then'"]);
                }
            }
            for (const [rs, r] of (getIn(t, ['security', 'nat', 'source', 'rule-set']) || new Map())) {
                ['from', 'to'].forEach(d => { const zs = getIn(r, [d, 'zone']); if (!zs) mand.push(['[edit security nat source]', "'rule-set " + rs + "'", "Missing mandatory statement: '" + d + "'"]); else zs.forEach(z => { if (!zones.has(z)) co.push(['[edit security nat source rule-set ' + rs + ' ' + d + ']', "'zone " + z + "'", "# [Simülatör] '" + z + "' adlı güvenlik bölgesi tanımlı değil"]); }); });
                for (const [rn, ru] of (r.get('rule') || new Map())) {
                    if (!getIn(ru, ['match', 'source-address']) && !getIn(ru, ['match', 'destination-address'])) mand.push(['[edit security nat source rule-set ' + rs + ' rule ' + rn + ']', "'match'", "Missing mandatory statement: 'source-address'"]);
                    if (!(getIn(ru, ['then', 'source-nat']) instanceof Map) || !getIn(ru, ['then', 'source-nat']).size) mand.push(['[edit security nat source rule-set ' + rs + ']', "'rule " + rn + "'", "Missing mandatory statement: 'then'"]);
                }
            }
            const vl = t.get('vlans') || new Map();
            for (const [n, i] of (t.get('interfaces') || new Map())) for (const [u, uo] of (i.get('unit') || new Map())) {
                const es = getIn(uo, ['family', 'ethernet-switching']);
                if (es instanceof Map) {
                    (getIn(es, ['vlan', 'members']) || []).forEach(v => { if (!vl.has(v)) co.push(['[edit interfaces ' + n + ' unit ' + u + ' family ethernet-switching vlan]', "'members " + v + "'", "# [Simülatör] '" + v + "' adlı VLAN (vlans) tanımlı değil"]); });
                    if (getIn(uo, ['family', 'inet'])) co.push(['[edit interfaces ' + n + ' unit ' + u + ' family]', "'ethernet-switching'", '# [Simülatör] Aynı birimde inet ve ethernet-switching birlikte kullanılamaz']);
                    if ((es.get('interface-mode') || 'access') === 'access' && (getIn(es, ['vlan', 'members']) || []).length > 1) co.push(['[edit interfaces ' + n + ' unit ' + u + ' family ethernet-switching]', "'vlan'", '# [Simülatör] access port yalnız bir VLAN üyesi olabilir (çok VLAN için interface-mode trunk)']);
                }
            }
            for (const [v, vo] of vl) { const l3 = vo.get('l3-interface'); if (l3 && !ifls.has(l3)) co.push(['[edit vlans ' + v + ']', "'l3-interface " + l3 + "'", '# [Simülatör] ' + l3 + ' arayüzü (interfaces irb unit …) tanımlı değil']); }
            return { mand, co };
        }
        function fmtErr(v, check) {
            const L2 = [];
            v.mand.concat(v.co).forEach(([h, s, m]) => { L2.push(h, '  ' + s, '    ' + m); });
            if (v.mand.length) L2.push(check ? 'error: configuration check-out failed: (missing mandatory statements)' : 'error: commit failed: (missing mandatory statements)');
            else L2.push('error: configuration check-out failed');
            return L2.join('\n');
        }
        function doCommit(o, raw) {
            const v = validate(S.cand);
            if (v.mand.length || v.co.length) { log({ raw, err: v.mand.length ? 'mandatory' : 'checkout', commit: o.check ? 'check-fail' : 'fail' }); return fmtErr(v, o.check); }
            if (o.check) {
                const wasConf = !!S.confirm; if (S.confirm) S.confirm = null;
                log({ raw, canon: 'commit check', commit: 'check-ok', confirmed: wasConf });
                return 'configuration check succeeds';
            }
            const wasConf = !!S.confirm;
            S.commitN++;
            S.hist.unshift({ cfg: cfgClone(S.cand), meta: { by: USER, via: 'cli', n: S.commitN, comment: o.comment || null, confirmed: o.confirmed || null } });
            if (S.hist.length > 50) S.hist.length = 50;
            const L2 = [];
            if (o.confirmed) { S.confirm = { until: Date.now() + o.confirmed * 60000, min: o.confirmed }; L2.push('commit confirmed will be automatically rolled back in ' + o.confirmed + ' minutes unless confirmed'); }
            else S.confirm = null;
            L2.push('commit complete');
            log({ raw, canon: 'commit' + (o.confirmed ? ' confirmed ' + o.confirmed : '') + (o.andQuit ? ' and-quit' : ''), commit: o.confirmed ? 'confirmed' : 'ok', confirmedPrev: wasConf && !o.confirmed });
            if (o.andQuit) { S.mode = 'op'; S.edit = []; S.editStack = []; L2.push('Exiting configuration mode'); return L2.join('\n'); }
            return L2.join('\n');
        }
        // commit confirmed süresi (gerçek zaman) dolduysa geri al
        function confirmTick() {
            if (!S.confirm || Date.now() < S.confirm.until) return '';
            S.confirm = null;
            const prev = S.hist[1] ? cfgClone(S.hist[1].cfg) : cfgClone(active());
            S.commitN++;
            S.hist.unshift({ cfg: prev, meta: { by: USER, via: 'other', n: S.commitN, comment: 'automatic rollback' } });
            S.cand = cfgClone(prev);
            log({ canon: 'auto-rollback', commit: 'rolledback' });
            return '# [Simülatör] commit confirmed süresi doldu: onay gelmediği için önceki yapılandırma (rollback 1) otomatik geri yüklendi.\n';
        }

        // ── ağ görünümü (aktif, etkin yapılandırmadan)
        function view(cfgTree) {
            const t = cfgTree || act();
            const ifs = t.get('interfaces') || new Map(), ifls = [];
            const physUp = n => { const o = ifs.get(n); if (o && o.has('disable')) return false; if (/^(lo0|irb|st0)$/.test(n)) return true; return up.has(n); };
            for (const [n, o] of ifs) for (const [u, uo] of (o.get('unit') || new Map())) {
                const addrs = getIn(uo, ['family', 'inet', 'address']) || [], es = getIn(uo, ['family', 'ethernet-switching']);
                ifls.push({ name: n + '.' + u, phys: n, unit: u, addrs, inet: getIn(uo, ['family', 'inet']) instanceof Map, eth: es instanceof Map, mode: es instanceof Map ? (es.get('interface-mode') || 'access') : null, members: es instanceof Map ? (getIn(es, ['vlan', 'members']) || []) : [], adminUp: physUp(n) && !uo.has('disable') });
            }
            // irb: VLAN'ında bağlantısı açık bir üye port varsa up
            const vlans = t.get('vlans') || new Map();
            ifls.forEach(x => {
                if (x.phys !== 'irb') return;
                const v = [...vlans].find(([, vo]) => vo.get('l3-interface') === x.name);
                x.adminUp = !!v && ifls.some(y => y.eth && y.adminUp && y.members.includes(v[0]));
            });
            const zones = getIn(t, ['security', 'zones', 'security-zone']) || new Map();
            const zoneOf = ifl => { for (const [z, zo] of zones) if ((zo.get('interfaces') || new Map()).has(ifl)) return z; return null; };
            // RIB
            const R = [];
            ifls.forEach(x => { if (!x.adminUp) return; x.addrs.forEach(a => { const p = pfx(a); R.push({ pfx: netStr(p), proto: 'Direct', pref: 0, via: x.name }); if (p.len < 32) R.push({ pfx: p.ip + '/32', proto: 'Local', pref: 0, via: x.name, local: true }); }); });
            const conn = ip => R.find(r => r.proto === 'Direct' && inNet(ip, pfx(r.pfx)));
            for (const [rp, ro] of (getIn(t, ['routing-options', 'static', 'route']) || new Map())) {
                const pref = +(ro.get('preference') || 5);
                if (ro.has('discard') || ro.has('reject')) { R.push({ pfx: netStr(pfx(rp)), proto: 'Static', pref, nh: ro.has('discard') ? 'Discard' : 'Reject' }); continue; }
                const nhs = (ro.get('next-hop') || []).map(nh => ({ nh, c: conn(nh) })).filter(x => x.c);
                if (nhs.length) R.push({ pfx: netStr(pfx(rp)), proto: 'Static', pref, nh: nhs[0].nh, via: nhs[0].c.via, more: nhs.slice(1).map(x => ({ nh: x.nh, via: x.c.via })) });
                for (const [q, qo] of (ro.get('qualified-next-hop') || new Map())) { const c = conn(q); if (c) R.push({ pfx: netStr(pfx(rp)), proto: 'Static', pref: +(qo.get('preference') || pref), nh: q, via: c.via }); }
            }
            const by = {};
            R.forEach(r => { (by[r.pfx] = by[r.pfx] || []).push(r); });
            Object.values(by).forEach(list => { list.sort((a, b) => a.pref - b.pref); list[0].active = true; });
            const keysSorted = Object.keys(by).sort((a, b) => { const x = pfx(a), y = pfx(b); return ip2n(x.ip) - ip2n(y.ip) || x.len - y.len; });
            const lookup = ip => { let best = null; for (const k of keysSorted) { const p = pfx(k); if (inNet(ip, p) && (!best || p.len > pfx(best.pfx).len)) best = by[k].find(r => r.active); } return best; };
            return { t, ifls, zones, zoneOf, R, by, keys: keysSorted, lookup, conn, vlans, physUp };
        }
        const ifOf = (W, name) => W.ifls.find(x => x.name === name);
        function abMatch(t, names, ip) {
            const ab = getIn(t, ['security', 'address-book', 'global', 'address']) || new Map();
            return (names || []).some(n => n === 'any' || n === 'any-ipv4' || (ab.has(n) && inNet(ip, pfx(ab.get(n)))));
        }
        function appMatch(t, apps, proto, dport) {
            const cu = getIn(t, ['applications', 'application']) || new Map();
            return (apps || []).find(a => {
                if (a === 'any') return true;
                if (JAPPS[a]) return JAPPS[a][0] === proto && (proto === 'icmp' || JAPPS[a][1] === dport);
                const c = cu.get(a); if (!c) return false;
                return c.get('protocol') === proto && (proto === 'icmp' || !c.get('destination-port') || portIn(c.get('destination-port'), dport));
            }) || null;
        }
        function policies(t, fz, tz) { const m = getIn(t, ['security', 'policies', 'from-zone', fz, 'to-zone', tz, 'policy']); return m ? [...m] : []; }
        function matchPolicy(t, fz, tz, f) {
            for (const [pn, p] of policies(t, fz, tz)) {
                const m = p.get('match'); if (!(m instanceof Map)) continue;
                if (!abMatch(t, m.get('source-address'), f.src) || !abMatch(t, m.get('destination-address'), f.dst)) continue;
                const app = appMatch(t, m.get('application'), f.proto, f.dport); if (!app) continue;
                const th = p.get('then') || new Map();
                return { name: pn, action: th.has('permit') ? 'permit' : th.has('reject') ? 'reject' : 'deny', app, p };
            }
            return null;
        }
        function matchSnat(t, fz, tz, f) {
            for (const [rs, r] of (getIn(t, ['security', 'nat', 'source', 'rule-set']) || new Map())) {
                if (!(getIn(r, ['from', 'zone']) || []).includes(fz) || !(getIn(r, ['to', 'zone']) || []).includes(tz)) continue;
                for (const [rn, ru] of (r.get('rule') || new Map())) {
                    const sa = getIn(ru, ['match', 'source-address']), da = getIn(ru, ['match', 'destination-address']);
                    if (sa && !sa.some(x => inNet(f.src, pfx(x)))) continue;
                    if (da && !da.some(x => inNet(f.dst, pfx(x)))) continue;
                    const sn = getIn(ru, ['then', 'source-nat']);
                    return { rs, rule: rn, off: !!(sn && sn.has('off')), iface: !!(sn && sn.has('interface')) };
                }
            }
            return null;
        }
        function decide(f0, cfgTree) {
            const f = Object.assign({ proto: 'tcp', sport: 51234, dport: 443 }, f0);
            const W = view(cfgTree);
            const cin = W.conn(f.src), rin = cin || W.lookup(f.src);
            if (!rin || !rin.via) return { stage: 'noarrive', f };
            const inIfl = rin.via, zin = plat === 'srx' ? W.zoneOf(inIfl) : 'none';
            if (!zin) return { stage: 'nozone', f, ifl: inIfl };
            const r = W.lookup(f.dst);
            if (!r || !r.via) return { stage: 'noroute', f, zin, inIfl };
            const outIfl = r.via, zout = plat === 'srx' ? W.zoneOf(outIfl) : 'none';
            if (!zout) return { stage: 'nozone', f, ifl: outIfl, zin, inIfl };
            if (plat !== 'srx') return { stage: 'allowed', f, inIfl, outIfl };
            const pol = matchPolicy(W.t, zin, zout, f);
            if (!pol || pol.action !== 'permit') return { stage: 'denied', f, zin, zout, inIfl, outIfl, policy: pol ? pol.name : null };
            const nat = matchSnat(W.t, zin, zout, f);
            const natIp = nat && nat.iface && !nat.off ? (ifOf(W, outIfl) && ifOf(W, outIfl).addrs[0] ? pfx(ifOf(W, outIfl).addrs[0]).ip : null) : null;
            if (isPriv(f.src) && !isPriv(f.dst) && !natIp) return { stage: 'nonat', f, zin, zout, inIfl, outIfl, policy: pol.name, app: pol.app };
            return { stage: 'allowed', f, zin, zout, inIfl, outIfl, policy: pol.name, app: pol.app, nat, natIp };
        }
        function hostIn(zone, svc, cfgTree) {
            const t = cfgTree || act(), z = getIn(t, ['security', 'zones', 'security-zone', zone]);
            if (!(z instanceof Map)) return false;
            const has = m => m instanceof Map && (m.has(svc) || m.has('all'));
            return has(getIn(z, ['host-inbound-traffic', 'system-services'])) || [...(z.get('interfaces') || new Map()).values()].some(i => has(getIn(i, ['host-inbound-traffic', 'system-services'])));
        }

        // ── operasyonel çıktılar
        function showVersion() {
            return ['Hostname: ' + host(), 'Model: ' + P.model, 'Junos: ' + JUNOS_VER, 'JUNOS OS Kernel 64-bit  [' + JUNOS_VER + ']', '# [Simülatör] Config Generator CLI Lab — eğitim simülatörü; gerçek cihaz değildir (' + P.desc + ').'].join('\n');
        }
        function ifTerse(only) {
            const W = view(), ifs = W.t.get('interfaces') || new Map();
            const L2 = ['Interface               Admin Link Proto    Local                 Remote'];
            const names = physPorts().concat([...ifs.keys()].filter(n => !/^ge-0\/0\/\d+$/.test(n) || +n.split('/')[2] >= P.ports));
            names.filter(n => !only || n === only || n.startsWith(only + '.')).forEach(n => {
                const o = ifs.get(n), adm = !(o && o.has('disable')), lk = adm && (/^(lo0|irb|st0)$/.test(n) || up.has(n));
                if (!o && !physPorts().includes(n)) return;
                L2.push(pad(n, 24) + pad(adm ? 'up' : 'down', 6) + (lk ? 'up' : 'down'));
                W.ifls.filter(x => x.phys === n).forEach(x => {
                    const a = x.adminUp ? 'up' : 'down', uo = getIn(W.t, ['interfaces', n, 'unit', x.unit]), aa = uo && uo.has('disable') ? 'down' : 'up';
                    const base = pad(x.name, 24) + pad(aa, 6) + pad(a, 5);
                    if (x.eth) L2.push(base + 'eth-switch');
                    else if (x.inet) { if (!x.addrs.length) L2.push(base + 'inet'); x.addrs.forEach((ad, k) => L2.push((k ? ' '.repeat(35) : base) + pad(k ? '' : 'inet', 9) + ad)); }
                    else L2.push(base.trimEnd());
                });
            });
            return L2.map(l => l.trimEnd()).join('\n');
        }
        function ifDetail(n) {
            const W = view(), o = getIn(W.t, ['interfaces', n]);
            if (!physPorts().includes(n) && !(o instanceof Map)) return null;
            const adm = !(o && o.has('disable')), lk = adm && (/^(lo0|irb|st0)$/.test(n) || up.has(n));
            const L2 = ['Physical interface: ' + n + ', ' + (adm ? 'Enabled' : 'Administratively down') + ', Physical link is ' + (lk ? 'Up' : 'Down')];
            if (o && o.get('description')) L2.push('  Description: ' + o.get('description'));
            L2.push('  Current address: ' + macOf(n) + ', Hardware address: ' + macOf(n));
            W.ifls.filter(x => x.phys === n).forEach(x => {
                L2.push('', '  Logical interface ' + x.name, '    Flags: ' + (x.adminUp ? 'Up' : 'Down') + ' SNMP-Traps 0x4000 Encapsulation: ENET2');
                if (plat === 'srx') {
                    const z = W.zoneOf(x.name);
                    L2.push('    Security: Zone: ' + (z || 'Null'));
                    if (z) { const svcs = HISVC.filter(s => s !== 'all' && hostIn(z, s)); L2.push('    Allowed host-inbound traffic : ' + (svcs.join(' ') || '')); }
                }
                if (x.inet) { L2.push('    Protocol inet, MTU: 1500'); x.addrs.forEach(a => { const p = pfx(a); L2.push('      Addresses, Flags: Is-Preferred Is-Primary', '        Destination: ' + netStr(p) + ', Local: ' + p.ip + (p.len < 32 ? ', Broadcast: ' + bcast(p) : '')); }); }
                if (x.eth) L2.push('    Protocol eth-switch, MTU: 1514');
            });
            L2.push('# [Simülatör] Özet görünüm; sayaçlar ve donanım ayrıntıları gösterilmez.');
            return L2.join('\n');
        }
        function showRoute(args) {
            const W = view();
            let target = null, exact = false, proto = null;
            for (let i = 0; i < args.length; i++) {
                const a = args[i].t;
                if (a === 'exact') exact = true;
                else if ('protocol'.startsWith(a) && a.length > 1 && args[i + 1]) { const r = pick(args[i + 1].t, ['static', 'direct', 'local']); if (!r.ok) return { err: i + 1 }; proto = r.ok; i++; }
                else if (pfx(a)) target = a;
                else if (a === 'terse' || a === 'extensive' || a === 'detail') continue;
                else return { err: i };
            }
            let keys = W.keys;
            if (target) {
                const p = pfx(target);
                if (exact || target.includes('/')) keys = keys.filter(k => exact ? k === netStr(p) : inNet(pfx(k).ip, p) && pfx(k).len >= p.len);
                if (!target.includes('/') && !exact) { const best = W.lookup(p.ip); keys = best ? [best.pfx] : []; }
            }
            const rows = [];
            let nroutes = 0, nact = 0;
            Object.keys(W.by).forEach(k => { nroutes += W.by[k].length; nact++; });
            keys.forEach(k => {
                let list = W.by[k]; if (proto) list = list.filter(r => r.proto.toLowerCase() === proto); if (!list.length) return;
                list.forEach((r, i) => {
                    const head = (i === 0 ? pad(k, 19) : ' '.repeat(19)) + (r.active ? '*' : ' ') + '[' + r.proto + '/' + r.pref + '] 00:21:37';
                    rows.push(head);
                    if (r.local) rows.push(' '.repeat(23) + 'Local via ' + r.via);
                    else if (r.nh === 'Discard' || r.nh === 'Reject') rows.push(' '.repeat(23) + r.nh);
                    else if (r.nh) { rows.push(' '.repeat(20) + '>  to ' + r.nh + ' via ' + r.via); (r.more || []).forEach(m => rows.push(' '.repeat(23) + 'to ' + m.nh + ' via ' + m.via)); }
                    else rows.push(' '.repeat(20) + '>  via ' + r.via);
                });
            });
            const hdr = ['', 'inet.0: ' + Object.keys(W.by).length + ' destinations, ' + nroutes + ' routes (' + nact + ' active, 0 holddown, 0 hidden)', '+ = Active Route, - = Last Active, * = Both', ''];
            return { text: rows.length ? hdr.concat(rows).join('\n') : '' };
        }
        function showVlans() {
            const W = view(), L2 = ['', 'Routing instance        VLAN name             Tag          Interfaces'];
            const vl = [['default', new Map([['vlan-id', '1']])]].concat([...W.vlans]);
            vl.forEach(([n, o]) => {
                L2.push(pad('default-switch', 24) + pad(n, 22) + (o.get('vlan-id') || 'NA'));
                W.ifls.filter(x => x.eth && x.members.includes(n)).forEach(x => L2.push(' '.repeat(59) + x.name + (x.adminUp ? '*' : '')));
            });
            return L2.join('\n');
        }
        function ethTable() {
            const W = view(), rows = [];
            W.ifls.filter(x => x.eth && x.adminUp && x.mode === 'access' && x.members.length && W.vlans.has(x.members[0])).forEach(x => rows.push('   ' + pad(x.members[0], 20) + pad(macOf(x.name + x.members[0]), 20) + pad('D', 12) + pad('-', 7) + pad(x.name, 23) + pad('0', 10) + '0'));
            return ['', 'MAC flags (S - static MAC, D - dynamic MAC, L - locally learned, P - Persistent static', '           SE - statistics enabled, NM - non configured MAC, R - remote PE MAC, O - ovsdb MAC)', '', '',
                'Ethernet switching table : ' + rows.length + ' entries, ' + rows.length + ' learned', 'Routing instance : default-switch',
                '   Vlan                MAC                 MAC         Age    Logical                NH        RTR', '   name                address             flags              interface              Index     ID'].concat(rows).join('\n');
        }
        function secZones(name, detail) {
            const W = view(), L2 = [];
            for (const [z, zo] of W.zones) {
                if (name && z !== name) continue;
                const ifl = [...(zo.get('interfaces') || new Map()).keys()];
                L2.push('', 'Security zone: ' + z, '  Send reset for non-SYN session TCP packets: Off', '  Policy configurable: Yes', '  Interfaces bound: ' + ifl.length, '  Interfaces:');
                ifl.forEach(i => L2.push('    ' + i));
                if (detail) { const s = HISVC.filter(x => x !== 'all' && hostIn(z, x)); L2.push('  # [Simülatör] host-inbound system-services: ' + (s.join(' ') || '(yok)')); }
            }
            if (!name || name === 'junos-host') L2.push('', 'Security zone: junos-host', '  Send reset for non-SYN session TCP packets: Off', '  Policy configurable: Yes', '  Interfaces bound: 0', '  Interfaces:');
            return L2.join('\n');
        }
        // Kural indeksi: ilk görüldüğünde atanır, sıralama değişse de sabit kalır (gerçek cihazdaki gibi)
        S.pidx = {}; S.pnext = 4;
        function polIndex(t) { const idx = {}; for (const [fz, a] of (getIn(t, ['security', 'policies', 'from-zone']) || new Map())) for (const [tz, b] of (a.get('to-zone') || new Map())) for (const pn of (b.get('policy') || new Map()).keys()) { const k = fz + '>' + tz + '>' + pn; if (!S.pidx[k]) S.pidx[k] = S.pnext++; idx[k] = S.pidx[k]; } return idx; }
        function secPolicies(fz0, tz0) {
            const t = act(), idx = polIndex(t), dp = getIn(t, ['security', 'policies', 'default-policy']);
            const L2 = ['Default policy: ' + (dp instanceof Map && dp.has('permit-all') ? 'permit-all' : 'deny-all'), 'Pre ID default policy: permit-all'];
            for (const [fz, a] of (getIn(t, ['security', 'policies', 'from-zone']) || new Map())) for (const [tz, b] of (a.get('to-zone') || new Map())) {
                if ((fz0 && fz !== fz0) || (tz0 && tz !== tz0)) continue;
                L2.push('From zone: ' + fz + ', To zone: ' + tz);
                let seq = 0;
                for (const [pn, p] of (b.get('policy') || new Map())) {
                    seq++;
                    const th = p.get('then') || new Map(), m = p.get('match') || new Map();
                    L2.push('  Policy: ' + pn + ', State: enabled, Index: ' + idx[fz + '>' + tz + '>' + pn] + ', Scope Policy: 0, Sequence number: ' + seq,
                        '    Source addresses: ' + (m.get('source-address') || []).join(', '), '    Destination addresses: ' + (m.get('destination-address') || []).join(', '),
                        '    Applications: ' + (m.get('application') || []).join(', '), '    Action: ' + (th.has('permit') ? 'permit' : th.has('reject') ? 'reject' : 'deny') + (getIn(th, ['log']) instanceof Map ? ', log' : ''));
                }
            }
            return L2.join('\n');
        }
        function matchPolicies(args) {
            const want = ['from-zone', 'to-zone', 'source-ip', 'destination-ip', 'source-port', 'destination-port', 'protocol'], A = {};
            for (let i = 0; i < args.length; i += 2) {
                const k = pick(args[i].t, want); if (!k.ok) return { err: i };
                if (!args[i + 1]) return { miss: k.ok };
                A[k.ok] = args[i + 1].t;
            }
            const proto = A.protocol ? (pick(A.protocol, ['tcp', 'udp', 'icmp']).ok || ({ 6: 'tcp', 17: 'udp', 1: 'icmp' })[A.protocol]) : null;
            const need = want.filter(k => !(k in A) && !(proto === 'icmp' && /port/.test(k)));
            if (need.length) return { miss: need.join(', ') };
            if (!isIp(A['source-ip']) || !isIp(A['destination-ip']) || !proto) return { bad: true };
            log({ matchpol: A });
            const t = act(), f = { src: A['source-ip'], dst: A['destination-ip'], sport: +A['source-port'] || 0, dport: +A['destination-port'] || 0, proto };
            const m = matchPolicy(t, A['from-zone'], A['to-zone'], f), idx = polIndex(t);
            if (!m) return { text: '# [Simülatör] ' + A['from-zone'] + ' → ' + A['to-zone'] + ' için eşleşen kural yok: trafik varsayılan politikaya (default-policy: deny-all) düşer.', res: 'default' };
            const ab = getIn(t, ['security', 'address-book', 'global', 'address']) || new Map();
            const adr = n => n === 'any' || n === 'any-ipv4' ? '    any-ipv4(global): 0.0.0.0/0' : '    ' + n + '(global): ' + ab.get(n);
            const mm = m.p.get('match'), seq = policies(t, A['from-zone'], A['to-zone']).findIndex(([n]) => n === m.name) + 1;
            const app = m.app === 'any' ? 'any' : m.app, ap = JAPPS[app] || [f.proto, f.dport];
            return { res: m.name, text: ['Policy: ' + m.name + ', action-type: ' + m.action + ', State: enabled, Index: ' + idx[A['from-zone'] + '>' + A['to-zone'] + '>' + m.name], '  Policy Type: Configured', '  Sequence number: ' + seq,
                '  From zone: ' + A['from-zone'] + ', To zone: ' + A['to-zone'], '  Source addresses:'].concat((mm.get('source-address') || []).map(adr), ['  Destination addresses:'], (mm.get('destination-address') || []).map(adr),
                ['  Application: ' + app, '    IP protocol: ' + (app === 'any' ? '0' : ap[0]) + ', ALG: 0, Inactivity timeout: ' + (ap[0] === 'udp' ? 60 : 1800), '      Source port range: [0-0]', '      Destination ports: ' + (app === 'any' ? '[0-0]' : ap[1])]).join('\n') };
        }
        function flows() { return (SIM.flows || []).map(f => Object.assign({ proto: 'tcp', sport: 51234 }, f)); }
        function flowSessions(args) {
            const F2 = {};
            for (let i = 0; i < args.length; i++) {
                const k = pick(args[i].t, ['source-prefix', 'destination-prefix', 'destination-port', 'source-port', 'protocol', 'summary', 'extensive', 'brief', 'nat']);
                if (!k.ok) return { err: i };
                if (['summary', 'extensive', 'brief', 'nat'].includes(k.ok)) { F2[k.ok] = true; continue; }
                if (!args[i + 1]) return { err: i + 1 };
                F2[k.ok] = args[++i].t;
            }
            const rows = [];
            let id = 20001;
            flows().forEach(f => {
                const d = decide(f); id++;
                if (!['allowed', 'nonat'].includes(d.stage)) return;
                if (F2['source-prefix'] && !inNet(f.src, pfx(F2['source-prefix']))) return;
                if (F2['destination-prefix'] && !inNet(f.dst, pfx(F2['destination-prefix']))) return;
                if (F2['destination-port'] && +F2['destination-port'] !== f.dport) return;
                if (F2.nat && !d.natIp) return;
                const back = d.natIp || f.src, bport = d.natIp ? 10000 + (id % 5000) : f.sport, ok = d.stage === 'allowed';
                const idx = polIndex(act())[d.zin + '>' + d.zout + '>' + d.policy];
                rows.push('Session ID: ' + id + ', Policy name: ' + d.policy + '/' + idx + ', Timeout: ' + (ok ? 1796 : 2) + ', Valid',
                    '  In: ' + f.src + '/' + f.sport + ' --> ' + f.dst + '/' + f.dport + ';' + f.proto + ', Conn Tag: 0x0, If: ' + d.inIfl + ', Pkts: ' + (ok ? 6 : 3) + ', Bytes: ' + (ok ? 1082 : 180) + ', ',
                    '  Out: ' + f.dst + '/' + f.dport + ' --> ' + back + '/' + bport + ';' + f.proto + ', Conn Tag: 0x0, If: ' + d.outIfl + ', Pkts: ' + (ok ? 5 : 0) + ', Bytes: ' + (ok ? 3920 : 0) + ', ');
            });
            const n = rows.length / 3;
            if (F2.summary) return { text: ['Unicast-sessions: ' + n, 'Multicast-sessions: 0', 'Services-offload-sessions: 0', 'Failed-sessions: 0', 'Sessions-in-use: ' + n, '  Valid sessions: ' + n, '  Pending sessions: 0', '  Invalidated sessions: 0', 'Maximum-sessions: 524288'].join('\n') };
            return { text: rows.concat([n ? 'Total sessions: ' + n : 'Total sessions: 0']).join('\n') };
        }
        function natRules() {
            const t = act(), L2 = [];
            let n = 0;
            for (const [rs, r] of (getIn(t, ['security', 'nat', 'source', 'rule-set']) || new Map())) for (const [rn, ru] of (r.get('rule') || new Map())) {
                n++;
                const rng = a => { const p = pfx(a); return pad(n2ip(C.netOf(p.ip, p.len)), 16) + '- ' + bcast(p); };
                const sa = getIn(ru, ['match', 'source-address']) || ['0.0.0.0/0'], da = getIn(ru, ['match', 'destination-address']) || ['0.0.0.0/0'], sn = getIn(ru, ['then', 'source-nat']) || new Map();
                const hits = flows().filter(f => { const d = decide(f); return d.nat && d.nat.rs === rs && d.nat.rule === rn; }).length * 6;
                L2.push(...['', 'source NAT rule: ' + pad(rn, 23) + 'Rule-set: ' + rs, '  Rule-Id                    : ' + n, '  Rule position              : ' + n,
                    '  From zone                  : ' + (getIn(r, ['from', 'zone']) || []).join(', '), '  To zone                    : ' + (getIn(r, ['to', 'zone']) || []).join(', '), '  Match',
                    '    Source addresses         : ' + rng(sa[0])].concat(sa.slice(1).map(a => '                               ' + rng(a)), ['    Destination addresses    : ' + rng(da[0]), '  Action                        : ' + (sn.has('off') ? 'off' : sn.has('interface') ? 'interface' : '-'), '  Translation hits           : ' + hits]));
            }
            return ['Total rules: ' + n, 'Total referenced IPv4/IPv6 ip-prefixes: ' + n + '/0'].concat(L2).join('\n');
        }
        function natSummary() {
            const t = act(), L2 = ['Total port number usage for port translation pool: 0', 'Maximum port number for port translation pool: 33554432', 'Total pools: 0', '', 'Total rules: 0'];
            const rows = [];
            for (const [rs, r] of (getIn(t, ['security', 'nat', 'source', 'rule-set']) || new Map())) for (const [rn, ru] of (r.get('rule') || new Map())) rows.push(pad(rn, 19) + pad(rs, 19) + pad((getIn(r, ['from', 'zone']) || []).join(','), 18) + pad((getIn(r, ['to', 'zone']) || []).join(','), 21) + (getIn(ru, ['then', 'source-nat']) instanceof Map && getIn(ru, ['then', 'source-nat']).has('off') ? 'off' : 'interface'));
            L2[4] = 'Total rules: ' + rows.length;
            return L2.concat(rows.length ? ['Rule name          Rule set           From              To                   Action'].concat(rows) : []).join('\n');
        }
        function sysCommit() {
            return S.hist.map((h, i) => pad(String(i), 4) + SIMCLK(h.meta.n) + ' UTC by ' + h.meta.by + ' via ' + h.meta.via + (h.meta.confirmed && i === 0 && S.confirm ? ' commit confirmed, rollback in ' + h.meta.confirmed + 'mins' : '') + (h.meta.comment ? '\n    ' + h.meta.comment : '')).join('\n');
        }
        function ping(args) {
            const ip = args[0] && args[0].t;
            if (!ip || !isIp(ip)) return null;
            let count = 0, rapid = false;
            for (let i = 1; i < args.length; i++) {
                const k = pick(args[i].t, ['count', 'rapid', 'source', 'size', 'do-not-fragment', 'routing-instance']);
                if (!k.ok) return { err: i };
                if (k.ok === 'rapid' || k.ok === 'do-not-fragment') { if (k.ok === 'rapid') rapid = true; continue; }
                if (!args[i + 1]) return { err: i + 1 };
                if (k.ok === 'count') { if (!/^\d+$/.test(args[i + 1].t)) return { err: i + 1 }; count = Math.min(+args[i + 1].t, 20); }
                i++;
            }
            const W = view(), r = W.lookup(ip), own = W.ifls.some(x => x.adminUp && x.addrs.some(a => pfx(a).ip === ip));
            const n = count || 5, L2 = ['PING ' + ip + ' (' + ip + '): 56 data bytes'];
            const ok = own || (r && r.via && (r.proto !== 'Static' || hosts.includes(r.nh)) && hosts.includes(ip));
            log({ ping: { ip, ok } });
            if (!r && !own) { for (let i = 0; i < Math.min(n, 3); i++) L2.push('ping: sendto: No route to host'); L2.push('^C', '--- ' + ip + ' ping statistics ---', n + ' packets transmitted, 0 packets received, 100% packet loss'); return { text: L2.join('\n') }; }
            if (rapid) L2.push((ok ? '!' : '.').repeat(n));
            else if (ok) for (let i = 0; i < n; i++) L2.push('64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=64 time=' + (1.1 + (i % 3) * 0.2).toFixed(3) + ' ms');
            if (!count) L2.push('^C', '# [Simülatör] Gerçek cihazda ping Ctrl+C ile durdurulana kadar sürer; burada 5 paket gönderildi.');
            L2.push('--- ' + ip + ' ping statistics ---', n + ' packets transmitted, ' + (ok ? n : 0) + ' packets received, ' + (ok ? '0' : '100') + '% packet loss');
            if (ok) L2.push('round-trip min/avg/max/stddev = 1.102/1.306/1.502/0.163 ms');
            return { text: L2.join('\n') };
        }

        // ── Operasyonel komut ağacı
        const UNSUP = '# [Simülatör] Bu komut gerçek cihazda var ama bu lab sürümünde desteklenmiyor.';
        const KNOWN_SHOW = ['chassis', 'log', 'bgp', 'ospf', 'lldp', 'ntp', 'snmp', 'lacp', 'spanning-tree', 'firewall', 'arp', 'isis', 'bfd', 'mpls', 'ldp', 'vrrp', 'virtual-chassis', 'poe', 'services', 'dhcp', 'pfe', 'ipv6', 'cli', 'host', 'policy-options', 'class-of-service', 'task', 'krt'];
        const OP = { c: {
            show: { d: 'Bilgi göster', c: {
                version: { d: 'Yazılım sürümü ve model', run: () => showVersion() },
                interfaces: { d: 'Arayüz durumu', run: () => physPorts().map(n => ifDetail(n)).join('\n\n'), c: { terse: { d: 'Kısa arayüz tablosu', run: () => ifTerse(), /* Junos iki sırayı da kabul eder: show interfaces terse ge-0/0/1 */ runArgs: (a) => { const n = a[0].t.replace(/\.\d+$/, ''); if (!VT.jif(n)) return { err: 0 }; if (a.length > 1) return { err: 1 }; if (!physPorts().includes(n) && !getIn(act(), ['interfaces', n])) return { text: 'error: device ' + n + ' not found' }; return { text: ifTerse(n) }; } }, descriptions: { d: 'Arayüz açıklamaları', run: () => { const W = view(); const r = ['Interface       Admin Link Description']; for (const [n, o] of (W.t.get('interfaces') || new Map())) if (o.get('description')) r.push(pad(n, 16) + pad(o.has('disable') ? 'down' : 'up', 6) + pad(W.physUp(n) ? 'up' : 'down', 5) + o.get('description')); return r.join('\n'); } } },
                    args: [['<arayüz>', 'Arayüz adı, ör. ge-0/0/0']],
                    runArgs: (a) => { const n = a[0].t.replace(/\.\d+$/, ''); if (!VT.jif(n)) return { err: 0 }; if (a[1] && !(pick(a[1].t, ['terse', 'extensive', 'detail']).ok)) return { err: 1 }; if (a[1] && pick(a[1].t, ['terse']).ok === 'terse') { if (!physPorts().includes(n) && !getIn(act(), ['interfaces', n])) return { text: 'error: device ' + n + ' not found' }; return { text: ifTerse(n) }; } const d = ifDetail(n); return d ? { text: d } : { text: 'error: device ' + n + ' not found' }; } },
                route: { d: 'Yönlendirme tablosu', run: () => showRoute([]).text, args: [['<önek>', 'Hedef IP ya da önek'], ['exact', 'Tam önek'], ['protocol', 'static | direct | local']], runArgs: a => showRoute(a) },
                vlans: { d: 'VLAN\'lar ve üye arayüzler', run: () => showVlans(), only: ['ex', 'srx'] },
                'ethernet-switching': { d: 'Katman 2 anahtarlama', only: ['ex', 'srx'], c: { table: { d: 'MAC adres tablosu', run: () => ethTable() }, interface: { d: 'Anahtarlama arayüzleri', run: () => { const W = view(), r = ['Routing Instance Name : default-switch', 'Logical Interface flags (DL - disable learning, AD - packet action drop,', '                         LH - MAC limit hit, DN - interface down )', '', 'Logical         Vlan                     TAG     MAC         STP         Logical           Tagging', 'interface       members                          limit       state       interface flags']; W.ifls.filter(x => x.eth).forEach(x => { r.push(pad(x.name, 16) + (x.adminUp ? '' : '                                                             DN')); x.members.forEach(m => r.push(' '.repeat(16) + pad(m, 25) + pad((W.vlans.get(m) && W.vlans.get(m).get('vlan-id')) || '-', 8) + pad('65535', 12) + pad(x.adminUp ? 'Forwarding' : 'Discarding', 12) + pad('', 18) + (x.mode === 'trunk' ? 'tagged' : 'untagged'))); }); return r.join('\n'); } } } },
                security: { d: 'Güvenlik (SRX)', only: ['srx'], c: {
                    zones: { d: 'Güvenlik bölgeleri', run: () => secZones(), args: [['<bölge>', 'Bölge adı'], ['detail', 'Ayrıntılı']], runArgs: a => { const det = a.some(x => x.t === 'detail'); const nm = a.find(x => x.t !== 'detail'); if (nm && !view().zones.has(nm.t) && nm.t !== 'junos-host') return { text: '' }; return { text: secZones(nm ? nm.t : null, det) }; } },
                    policies: { d: 'Güvenlik kuralları', run: () => secPolicies(), args: [['from-zone', 'Kaynak bölge'], ['to-zone', 'Hedef bölge'], ['detail', 'Ayrıntılı'], ['hit-count', 'Kural isabet sayıları']],
                        runArgs: a => { let fz = null, tz = null; for (let i = 0; i < a.length; i++) { const k = pick(a[i].t, ['from-zone', 'to-zone', 'detail', 'hit-count']); if (!k.ok) return { err: i }; if (k.ok === 'hit-count') return { text: UNSUP, unsup: true }; if (k.ok === 'detail') continue; if (!a[i + 1]) return { err: i + 1 }; if (k.ok === 'from-zone') fz = a[++i].t; else tz = a[++i].t; } return { text: secPolicies(fz, tz) }; } },
                    'match-policies': { d: 'Bir akışın hangi kurala eşleştiğini göster (teşhis)', args: [['from-zone', '<bölge>'], ['to-zone', '<bölge>'], ['source-ip', '<A.B.C.D>'], ['destination-ip', '<A.B.C.D>'], ['source-port', '<port>'], ['destination-port', '<port>'], ['protocol', 'tcp | udp | icmp | <sayı>']],
                        runArgs: a => { const r = matchPolicies(a); if (r.miss) return { text: '# [Simülatör] Eksik parametre: ' + r.miss + ' (from-zone, to-zone, source-ip, destination-ip, source-port, destination-port, protocol gerekli)', errk: 'incomplete' }; if (r.bad) return { text: '# [Simülatör] Geçersiz IP ya da protokol değeri.', errk: 'value' }; return r; } },
                    flow: { d: 'Akış tablosu', c: { session: { d: 'Oturumlar', run: () => flowSessions([]).text, args: [['source-prefix', '<önek>'], ['destination-prefix', '<önek>'], ['destination-port', '<port>'], ['summary', 'Özet'], ['nat', 'Yalnız NAT\'lı oturumlar']], runArgs: a => flowSessions(a) }, status: { d: 'Akış durumu', run: () => UNSUP, unsup: true } } },
                    nat: { d: 'NAT', c: { source: { d: 'Kaynak NAT', c: { rule: { d: 'Kurallar', c: { all: { d: 'Tüm kurallar', run: () => natRules() } } }, summary: { d: 'Özet', run: () => natSummary() }, pool: { d: 'Havuzlar', run: () => UNSUP, unsup: true } } }, destination: { d: 'Hedef NAT', run: () => UNSUP, unsup: true }, static: { d: 'Statik NAT', run: () => UNSUP, unsup: true } } },
                }, known: ['ike', 'ipsec', 'screen', 'alg', 'log', 'idp', 'utm', 'monitoring', 'application-tracking', 'address-book'] },
                configuration: { d: 'Aktif (commit edilmiş) yapılandırma', cfgShow: true },
                system: { d: 'Sistem', c: { commit: { d: 'Commit geçmişi', run: () => sysCommit() }, uptime: { d: 'Çalışma süresi', run: () => 'Current time: ' + SIMCLK(S.commitN + 5) + ' UTC\nSystem booted: ' + SIMCLK(0) + ' UTC (00:45:12 ago)\nLast configured: ' + SIMCLK(S.hist[0].meta.n) + ' UTC by ' + S.hist[0].meta.by + '\n# [Simülatör] Süreler temsilîdir.' }, alarms: { d: 'Sistem alarmları', run: () => '1 alarms currently active\nAlarm time               Class  Description\n' + SIMCLK(1) + ' UTC  Minor  Rescue configuration is not set' } },
                    known: ['storage', 'processes', 'users', 'license', 'core-dumps', 'connections', 'statistics', 'rollback', 'software', 'information', 'buffers', 'memory', 'boot-messages'] },
            }, known: KNOWN_SHOW },
            configure: { d: 'Yapılandırma moduna geç', run: () => enterCfg(), c: { exclusive: { d: 'Yapılandırmayı kilitleyerek gir', run: () => enterCfg() }, private: { d: 'Özel candidate kopyası ile gir', run: () => enterCfg() } } },
            ping: { d: 'ICMP erişilebilirlik testi', args: [['<A.B.C.D>', 'Hedef'], ['count', 'Paket sayısı'], ['rapid', 'Hızlı mod'], ['source', 'Kaynak adres']], runArgs: a => ping(a) },
            exit: { d: 'CLI\'dan çık', run: () => { S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.'; } },
            quit: { d: 'CLI\'dan çık', run: () => { S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.'; } },
            set: { d: 'CLI ayarları (set cli …)', c: { cli: { d: 'CLI ortamı', unsupAll: true }, date: { d: 'Tarih', unsupAll: true }, chassis: { d: 'Kasa', unsupAll: true } } },
        }, known: ['request', 'clear', 'monitor', 'file', 'start', 'restart', 'test', 'op', 'save', 'traceroute', 'telnet', 'ssh', 'help', 'load', 'mtrace', 'show-bgp'] };

        // Op ağacında yürü: {node, words, args, argStart} | {err, at, hits}
        function opWalk(toks, forHelp) {
            let node = OP, i = 0; const words = [];
            while (i < toks.length && node.c) {
                const t = toks[i];
                if (t.sym) break;
                const keys = Object.keys(node.c).filter(k => !node.c[k].only || node.c[k].only.includes(plat));
                const r = pick(t.t, keys);
                if (!r.ok) {
                    if ((node.runArgs || node.cfgShow) && r.err !== 'amb') break;
                    if (r.err !== 'amb' && node.known && pick(t.t, node.known).ok) return { unsup: true, at: i, words };
                    if (r.err !== 'amb' && node === OP.c.show && ['security', 'vlans', 'ethernet-switching'].includes((pick(t.t, ['security', 'vlans', 'ethernet-switching']) || {}).ok)) return { err: 'invalid', at: i, words };
                    return { err: r.err === 'amb' ? 'amb' : 'invalid', at: i, hits: r.hits, node, words };
                }
                words.push(r.ok); node = node.c[r.ok]; i++;
                if (node.unsupAll) return { unsup: true, at: i, words };
            }
            return { node, words, args: toks.slice(i), argStart: i };
        }
        function splitPipes(toks) {
            const k = toks.findIndex(x => x.t === '|' && x.sym);
            if (k < 0) return { main: toks, pipes: [], bad: null };
            const main = toks.slice(0, k), segs = []; let cur = [];
            toks.slice(k + 1).forEach(x => { if (x.t === '|' && x.sym) { segs.push(cur); cur = []; } else cur.push(x); });
            segs.push(cur);
            const pipes = [];
            for (const s of segs) {
                if (!s.length) return { main, pipes, bad: { tok: null } };
                const r = pick(s[0].t, ['compare', 'count', 'display', 'except', 'match', 'last', 'no-more', 'find', 'save', 'trim', 'resolve', 'hold', 'refresh']);
                if (!r.ok) return { main, pipes, bad: { tok: s[0] } };
                if (['save', 'trim', 'resolve', 'hold', 'refresh', 'find'].includes(r.ok)) return { main, pipes, unsup: true };
                if (r.ok === 'display') { const d = s[1] ? pick(s[1].t, ['set', 'xml', 'json', 'inheritance', 'detail', 'omit', 'changed']) : { err: 'none' }; if (!d.ok) return { main, pipes, bad: { tok: s[1] || null, end: !s[1] } }; if (d.ok !== 'set') return { main, pipes, unsup: true }; pipes.push({ k: 'display set' }); continue; }
                if (r.ok === 'compare') { let rb = null; if (s[1]) { if (!pick(s[1].t, ['rollback']).ok || !s[2] || !/^\d+$/.test(s[2].t)) return { main, pipes, bad: { tok: s[1] } }; rb = +s[2].t; } pipes.push({ k: 'compare', rb }); continue; }
                if (r.ok === 'match' || r.ok === 'except') { if (!s[1]) return { main, pipes, bad: { tok: null, end: true } }; pipes.push({ k: r.ok, a: s.slice(1).map(x => x.t).join(' ') }); continue; }
                if (r.ok === 'last') { pipes.push({ k: 'last', a: s[1] ? s[1].t : '10' }); continue; }
                if (r.ok === 'count') { pipes.push({ k: 'count' }); continue; }
            }
            return { main, pipes, bad: null };
        }
        function cfgText(cfg, path, pipes, cur) {
            // yapılandırma gösterimi: hiyerarşik ya da set; compare (candidate ↔ aktif / rollback N)
            const ST2 = { secret: '## SECRET-DATA' };
            if (pipes.some(p => p.k === 'compare')) {
                const pc = pipes.find(p => p.k === 'compare');
                const base = pc.rb !== null ? (S.hist[pc.rb] ? S.hist[pc.rb].cfg : null) : active();
                if (!base) return { err: 'rollback' };
                return { text: diff(stmtsAt(ROOT, base, path, ST2), stmtsAt(ROOT, cfg, path, ST2), path.length ? [editText(path)] : [], [], 4).join('\n') };
            }
            if (pipes.some(p => p.k === 'display set')) {
                const lines = setLinesAt(ROOT, cfg, path, {});
                for (const k of cfg.ia) if (!path.length || k === path.join(' ') || k.startsWith(path.join(' ') + ' ')) lines.push('deactivate ' + k);
                return { text: lines.join('\n') };
            }
            const pre = cur || path.length ? [] : ['## Last changed: ' + SIMCLK(S.hist[0].meta.n) + ' UTC', 'version ' + JUNOS_VER + ';'];
            return { text: pre.concat(render(stmtsAt(ROOT, cfg, path, ST2), 4)).join('\n') };
        }
        function opExec(toks, line, raw) {
            const sp = splitPipes(toks);
            if (sp.unsup) { log({ raw, err: 'unsupported' }); return UNSUP; }
            if (sp.bad) { log({ raw, err: 'invalid' }); return sp.bad.tok ? caret(sp.bad.tok.o, 'syntax error.') : caret(line.length, 'syntax error, expecting <command>.'); }
            const w = opWalk(sp.main);
            if (w.unsup) { log({ raw, err: 'unsupported' }); return UNSUP; }
            if (w.err === 'amb') { log({ raw, err: 'amb' }); const t = sp.main[w.at]; return caret(t.o, "'" + t.t + "' is ambiguous.\nPossible completions:\n" + w.hits.map(h => '  ' + pad(h, 21) + ((w.node.c[h] || {}).d || '')).join('\n')); }
            if (w.err) {
                log({ raw, err: 'invalid' });
                const t = sp.main[w.at];
                return caret(t.o, w.at === 0 ? 'unknown command.' : 'syntax error.');
            }
            const node = w.node, canon = w.words.join(' ') + (w.args.length ? ' ' + w.args.map(x => x.t).join(' ') : '') + sp.pipes.map(p => ' | ' + p.k + (p.a ? ' ' + p.a : '') + (p.rb !== undefined && p.rb !== null ? ' rollback ' + p.rb : '')).join('');
            if (node.cfgShow) {
                // show configuration [yol] — aktif yapılandırma
                const r = parse(ROOT, [], w.args, 'show');
                if (!r.ok) { if (r.err === 'unsupported') { log({ raw, err: 'unsupported' }); return UNSUP; } log({ raw, err: r.err === 'amb' ? 'amb' : 'invalid' }); const t = w.args[r.at]; return t ? caret(t.o, r.err === 'amb' ? "'" + t.t + "' is ambiguous." : 'syntax error.') : caret(line.length, 'syntax error.'); }
                const path = r.leaves.length ? r.leaves[r.leaves.length - 1].at.concat([r.leaves[r.leaves.length - 1].kw]) : r.path;
                const ptxt = path.length ? ' ' + path.join(' ') : '';
                const pc = sp.pipes.find(p => p.k === 'compare');
                if (pc) {
                    // operasyonel modda "| compare rollback N": N ile aktif (0) karşılaştırılır
                    const n = pc.rb === null ? 1 : pc.rb, other = S.hist[n];
                    if (!other) { log({ raw, err: 'value' }); return '# [Simülatör] rollback ' + n + ' sürümü yok (' + (S.hist.length - 1) + ' eski sürüm var; show system commit ile görün).'; }
                    const txt = diff(stmtsAt(ROOT, other.cfg, path, {}), stmtsAt(ROOT, active(), path, {}), path.length ? [editText(path)] : [], [], 4).join('\n');
                    log({ raw, canon: 'show configuration' + ptxt + ' | compare rollback ' + n });
                    return pipeFilter(txt, sp.pipes);
                }
                const out = cfgText(active(), path, sp.pipes, false);
                log({ raw, canon: 'show configuration' + ptxt + sp.pipes.map(p => ' | ' + p.k + (p.a ? ' ' + p.a : '')).join('') });
                return pipeFilter(out.text, sp.pipes);
            }
            if (w.args.length && node.runArgs) {
                const r = node.runArgs(w.args);
                if (r === null || r.err !== undefined) { log({ raw, err: 'invalid' }); const t = w.args[r ? r.err : 0]; return t ? caret(t.o, 'syntax error.') : caret(line.length, 'syntax error, expecting <command>.'); }
                if (r.errk) { log({ raw, err: r.errk }); return r.text; }
                if (r.unsup) { log({ raw, err: 'unsupported' }); return r.text; }
                log({ raw, canon, res: r.res });
                return pipeFilter(r.text, sp.pipes);
            }
            if (w.args.length) { log({ raw, err: 'invalid' }); return caret(w.args[0].o, 'syntax error.'); }
            if (node.run) { if (node.unsup) { log({ raw, err: 'unsupported' }); return UNSUP; } const o = node.run(); log({ raw, canon }); return pipeFilter(o, sp.pipes); }
            if (node.runArgs) { log({ raw, err: 'incomplete' }); return caret(line.length, 'syntax error, expecting <command>.'); }
            log({ raw, err: 'incomplete' });
            return caret(line.length, 'syntax error, expecting <command>.');
        }
        function enterCfg() {
            S.mode = 'cfg'; S.edit = []; S.editStack = [];
            const changed = !sameCfg(S.cand, active());
            return 'Entering configuration mode' + (changed ? '\nThe configuration has been changed but not committed' : '') + '\n\n[edit]';
        }
        const sameCfg = (a, b) => setLines(ROOT, ROOT, a.t, [], null, {}).join('\n') === setLines(ROOT, ROOT, b.t, [], null, {}).join('\n') && [...a.ia].sort().join() === [...b.ia].sort().join();

        // ── Yapılandırma modu
        const CFG_VERBS = ['set', 'delete', 'deactivate', 'activate', 'edit', 'show', 'top', 'up', 'exit', 'quit', 'commit', 'rollback', 'run', 'insert', 'status', 'annotate', 'copy', 'rename', 'load', 'save', 'replace', 'wildcard', 'protect', 'unprotect', 'help', 'update'];
        const CFG_UNSUP = ['status', 'annotate', 'copy', 'rename', 'load', 'save', 'replace', 'wildcard', 'protect', 'unprotect', 'help', 'update'];
        const VERB_H = { set: 'Bir ifade ekle/değiştir', delete: 'Bir ifadeyi sil', deactivate: 'İfadeyi pasif yap (yapılandırmada kalır, uygulanmaz)', activate: 'Pasif ifadeyi etkinleştir', edit: 'Hiyerarşide bir seviyeye in', show: 'Candidate yapılandırmayı göster', top: 'En üst seviyeye çık', up: 'Bir seviye yukarı çık', exit: 'Bir önceki seviyeye / yapılandırma modundan çık', quit: 'exit ile aynı', commit: 'Candidate\'i aktif yap', rollback: 'Önceki bir sürümü candidate\'e yükle', run: 'Operasyonel komut çalıştır', insert: 'Sıralı listede öğenin yerini değiştir', status: 'Yapılandırmayı düzenleyen kullanıcılar', annotate: 'İfadeye yorum ekle', copy: 'İfadeyi kopyala', rename: 'İfadeyi yeniden adlandır', load: 'Dosyadan yükle', save: 'Dosyaya kaydet', replace: 'Desen ile değiştir', wildcard: 'Joker karakterli işlem', protect: 'Koru', unprotect: 'Korumayı kaldır', help: 'Yardım', update: 'Özel kopyayı güncelle' };
        function cfgErr(raw, line, toks, r, off) {
            // parse hatasını Junos biçiminde döndür
            const t = toks[r.at];
            if (r.err === 'unsupported') { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
            if (r.err === 'amb') { log({ raw, err: 'amb' }); return cfgOut(caret(t.o, "'" + t.t + "' is ambiguous.\nPossible completions:\n" + r.hits.map(h => (r.sch.c[h].t === 'c' || r.sch.c[h].t === 'l' ? '> ' : '  ') + pad(h, 21) + (r.sch.c[h].d || '')).join('\n'))); }
            if (r.err === 'incomplete') { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + (/\s$/.test(line) ? 0 : 1), 'missing argument.')); }
            if (r.err === 'value') { log({ raw, err: 'value' }); const ty = r.sch && (r.sch.t === 'l' ? r.sch.key : r.sch.t === 'kv' ? r.sch.key : r.sch.v); return cfgOut(caret(t.o, '# [Simülatör] Geçersiz değer: \'' + t.t + '\'' + (Array.isArray(ty) ? ' (seçenekler: ' + ty.join(', ') + ')' : VLABEL[ty] ? ' (beklenen: ' + VLABEL[ty] + ')' : ''))); }
            log({ raw, err: 'invalid' });
            return cfgOut(t ? caret(t.o, 'syntax error.') : caret(line.length, 'syntax error.'));
        }
        function pwPrompt(raw, targets, canon) {
            // plain-text-password → iki kez parola, sonra encrypted-password yazılır
            let first = null;
            S.pending = { prompt: 'New password:', secret: true, fn: (pw) => {
                const bad = pw.length < 6 ? '# [Simülatör] Parola en az 6 karakter olmalı.' : ([/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(re => re.test(pw)).length < 2 ? 'error: require change of case, digit or punctuation' : null);
                if (bad) { log({ raw: '***', err: 'value' }); targets.forEach(p => prune(ROOT, S.cand.t, p)); return cfgOut(bad); }
                first = pw;
                S.pending = { prompt: 'Retype new password:', secret: true, fn: (pw2) => {
                    if (pw2 !== first) { log({ raw: '***', err: 'value' }); targets.forEach(p => prune(ROOT, S.cand.t, p)); return cfgOut('# [Simülatör] Parolalar eşleşmedi; ifade eklenmedi.'); }
                    const enc = '$6$' + fakeHash(first + 'salt', 8) + '$' + fakeHash(first, 43);
                    targets.forEach(p => { ensure(ROOT, S.cand.t, p).set('encrypted-password', enc); ensure(ROOT, S.cand.t, p).delete('plain-text-password'); });
                    log({ raw: '***', canon, pw: true });
                    return cfgOut('');
                } };
                return '';
            } };
            return '';
        }
        function cfgExec(toks, line, raw) {
            const vr = pick(toks[0].t, CFG_VERBS);
            if (!vr.ok) { log({ raw, err: vr.err === 'amb' ? 'amb' : 'invalid' }); return cfgOut(vr.err === 'amb' ? caret(toks[0].o, "'" + toks[0].t + "' is ambiguous.\nPossible completions:\n" + vr.hits.map(h => '  ' + pad(h, 21) + (VERB_H[h] || '')).join('\n')) : caret(toks[0].o, 'unknown command.')); }
            const v = vr.ok, rest = toks.slice(1);
            if (CFG_UNSUP.includes(v)) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
            if (v === 'run') {
                if (!rest.length) { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length, 'syntax error, expecting <command>.')); }
                const sub = raw.slice(raw.indexOf(rest[0].t, toks[0].o + toks[0].t.length));
                const shift = rest[0].o;
                const t2 = rest.map(x => Object.assign({}, x, { o: x.o - shift }));
                if (pick(t2[0].t, ['configure']).ok === 'configure' || pick(t2[0].t, ['exit', 'quit']).ok) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[0].o, 'syntax error.')); }
                const before = S.ev.length;
                const pr = prompt; // caret için istem uzunluğu + "run " ofseti
                const o = opExecShift(t2, sub, raw, shift);
                S.ev.slice(before).forEach(e => { if (e.canon) { e.canon = e.canon; e.run = true; } });
                return cfgOut(o);
            }
            if (v === 'top') {
                if (!rest.length) { S.editStack.push(S.edit); S.edit = []; log({ raw, canon: 'top' }); return cfgOut(''); }
                const keep = S.edit; S.edit = [];
                const o = cfgExec(rest, line, raw);
                if (S.mode === 'cfg' && pick(rest[0].t, CFG_VERBS).ok !== 'edit') S.edit = keep;
                return o;
            }
            if (v === 'up') {
                let n = 1;
                if (rest[0]) { if (!/^\d+$/.test(rest[0].t)) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[0].o, 'syntax error.')); } n = +rest[0].t; }
                if (!S.edit.length) { log({ raw, canon: 'up' }); return cfgOut('Already at top of configuration hierarchy'); }
                for (let k = 0; k < n && S.edit.length; k++) S.edit = upOne(S.edit);
                log({ raw, canon: 'up' }); return cfgOut('');
            }
            if (v === 'exit' || v === 'quit') {
                if (rest[0]) {
                    const r = pick(rest[0].t, ['configuration-mode']);
                    if (!r.ok) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[0].o, 'syntax error.')); }
                    return leaveCfg(raw, true);
                }
                if (S.edit.length) { S.edit = S.editStack.length ? S.editStack.pop() : upOne(S.edit); log({ raw, canon: 'exit' }); return cfgOut(''); }
                return leaveCfg(raw, false);
            }
            if (v === 'commit') {
                const o = {};
                for (let i = 0; i < rest.length; i++) {
                    const k = pick(rest[i].t, ['check', 'confirmed', 'comment', 'and-quit', 'synchronize', 'at', 'prepare', 'activate']);
                    if (!k.ok) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[i].o, 'syntax error.')); }
                    if (['synchronize', 'at', 'prepare', 'activate'].includes(k.ok)) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
                    if (k.ok === 'check') o.check = true;
                    else if (k.ok === 'and-quit') o.andQuit = true;
                    else if (k.ok === 'confirmed') { o.confirmed = 10; if (rest[i + 1] && /^\d+$/.test(rest[i + 1].t)) { const n = +rest[++i].t; if (n < 1 || n > 65535) { log({ raw, err: 'value' }); return cfgOut(caret(rest[i].o, '# [Simülatör] Süre 1–65535 dakika olmalı.')); } o.confirmed = n; } }
                    else if (k.ok === 'comment') { if (!rest[i + 1]) { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + 1, 'missing argument.')); } o.comment = rest[++i].t; }
                }
                const out = doCommit(o, raw);
                if (o.andQuit && S.mode === 'op') return out;
                return cfgOut(out);
            }
            if (v === 'rollback') {
                let n = 0;
                if (rest[0]) {
                    if (pick(rest[0].t, ['rescue']).ok) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
                    if (!/^\d+$/.test(rest[0].t) || +rest[0].t > 49) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[0].o, 'syntax error.')); }
                    n = +rest[0].t;
                }
                if (!S.hist[n]) { log({ raw, err: 'value' }); return cfgOut('# [Simülatör] rollback ' + n + ' sürümü yok (' + (S.hist.length - 1) + ' eski sürüm var; show system commit ile görün).'); }
                S.cand = cfgClone(S.hist[n].cfg);
                log({ raw, canon: 'rollback ' + n, rollback: n });
                return cfgOut('load complete');
            }
            if (v === 'show') {
                const sp = splitPipes(rest);
                if (sp.unsup) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
                if (sp.bad) { log({ raw, err: 'invalid' }); return cfgOut(sp.bad.tok ? caret(sp.bad.tok.o, 'syntax error.') : caret(line.length, 'syntax error, expecting <command>.')); }
                const r = parse(ROOT, S.edit, sp.main, 'show');
                if (!r.ok) return cfgErr(raw, line, sp.main, r);
                const path = r.leaves.length ? r.leaves[r.leaves.length - 1].at.concat([r.leaves[r.leaves.length - 1].kw]) : r.path;
                const out = cfgText(S.cand, path, sp.pipes, true);
                if (out.err) { log({ raw, err: 'value' }); return cfgOut('# [Simülatör] istenen rollback sürümü yok.'); }
                log({ raw, canon: 'show' + (path.length ? ' ' + path.join(' ') : '') + sp.pipes.map(p => ' | ' + p.k + (p.a ? ' ' + p.a : '') + (p.rb !== undefined && p.rb !== null ? ' rollback ' + p.rb : '')).join('') });
                return cfgOut(pipeFilter(out.text, sp.pipes));
            }
            if (v === 'insert') {
                const bi = rest.findIndex(x => ['before', 'after'].includes(x.t));
                if (bi < 0) { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + 1, 'missing argument.')); }
                const r = parse(ROOT, S.edit, rest.slice(0, bi), 'show');
                if (!r.ok) return cfgErr(raw, line, rest, r);
                if (r.end !== 'inst' || r.leaves.length) { log({ raw, err: 'invalid' }); return cfgOut(caret(rest[bi].o, 'syntax error.')); }
                const lk = r.path[r.path.length - 2], nm = r.path[r.path.length - 1], parent = getIn(S.cand.t, r.path.slice(0, -1));
                const ref = rest[bi + 1], refn = rest[bi + 2];
                if (!ref || !refn || ref.t !== lk) { log({ raw, err: 'invalid' }); return cfgOut(ref ? caret(ref.o, 'syntax error.') : caret(line.length + 1, 'missing argument.')); }
                if (!(parent instanceof Map) || !parent.has(nm) || !parent.has(refn.t)) { log({ raw, err: 'value' }); return cfgOut('error: statement not found'); }
                const ent = [...parent].filter(([k]) => k !== nm), idx = ent.findIndex(([k]) => k === refn.t), me = [nm, parent.get(nm)];
                ent.splice(rest[bi].t === 'before' ? idx : idx + 1, 0, me);
                parent.clear(); ent.forEach(([k, x]) => parent.set(k, x));
                log({ raw, canon: 'insert ' + r.path.join(' ') + ' ' + rest[bi].t + ' ' + lk + ' ' + refn.t });
                return cfgOut('');
            }
            // set / delete / deactivate / activate / edit
            if (!rest.length) {
                if (v === 'edit') { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length, 'syntax error, expecting <statement> or <identifier>.')); }
                log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + (/\s$/.test(line) ? 0 : 1), 'missing argument.'));
            }
            const r = parse(ROOT, S.edit, rest, v === 'set' ? 'set' : v === 'edit' ? 'edit' : 'delete');
            if (!r.ok) return cfgErr(raw, line, rest, r);
            const abs = r.path;
            if (v === 'edit') {
                if (r.leaves.length || r.end === 'list') { log({ raw, err: 'invalid' }); return cfgOut(r.end === 'list' ? caret(line.length, 'syntax error, expecting <statement> or <identifier>.') : caret(rest[rest.length - 1].o, 'syntax error.')); }
                S.editStack.push(S.edit); S.edit = abs;
                log({ raw, canon: 'edit ' + abs.join(' ') });
                return cfgOut('');
            }
            if (v === 'set') {
                if (!r.leaves.length && r.end === 'list') { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + (/\s$/.test(line) ? 0 : 1), 'missing argument.')); }
                if (!r.leaves.length && r.end === 'c' && !(r.sch.pres) && abs.length === S.edit.length) { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + (/\s$/.test(line) ? 0 : 1), 'missing argument.')); }
                if (!r.leaves.length && r.end === 'c' && !r.sch.pres) { log({ raw, err: 'incomplete' }); return cfgOut(caret(line.length + (/\s$/.test(line) ? 0 : 1), 'missing argument.')); }
                const pws = r.leaves.filter(l => l.sch.t === 'pw');
                const r2 = Object.assign({}, r, { leaves: r.leaves.filter(l => l.sch.t !== 'pw') });
                applySet(ROOT, S.cand.t, r2);
                const canon = 'set ' + canonOf(r);
                if (pws.length) { log({ raw, canon: canon.replace(/ plain-text-password$/, ''), pwPending: true }); return pwPrompt(raw, pws.map(l => l.at), canon); }
                log({ raw, canon });
                return cfgOut('');
            }
            if (v === 'delete') {
                const ok = applyDelete(ROOT, S.cand.t, r);
                if (!ok) { log({ raw, canon: 'delete ' + canonOf(r), warn: 'notfound' }); return cfgOut('warning: statement not found'); }
                // pasif işaretlerini de temizle
                const key = keyOf(r); for (const k of [...S.cand.ia]) if (k === key || k.startsWith(key + ' ')) S.cand.ia.delete(k);
                log({ raw, canon: 'delete ' + canonOf(r) });
                return cfgOut('');
            }
            if (v === 'deactivate' || v === 'activate') {
                const key = keyOf(r);
                if (getIn(S.cand.t, key.split(' ')) === undefined && !(r.leaves.length && r.leaves[0].vals.length)) { log({ raw, canon: v + ' ' + canonOf(r), warn: 'notfound' }); return cfgOut('warning: statement not found'); }
                if (v === 'deactivate') S.cand.ia.add(key); else S.cand.ia.delete(key);
                log({ raw, canon: v + ' ' + canonOf(r) });
                return cfgOut('');
            }
            log({ raw, err: 'invalid' }); return cfgOut(caret(toks[0].o, 'unknown command.'));
        }
        const keyOf = r => { if (r.leaves.length) { const l = r.leaves[r.leaves.length - 1]; return l.at.concat([l.kw], l.sch.t === 'kv' && l.name ? [l.name] : l.sch.multi && l.vals.length === 1 && l.sch.multi === 'each' ? [l.vals[0]] : []).join(' '); } return r.path.join(' '); };
        function canonOf(r) {
            const parts = r.path.slice();
            if (r.leaves.length) {
                // yaprakları yolları ile birlikte yaz (son yaprağa kadar)
                const out = [];
                let cur = [];
                r.leaves.forEach(l => { const extra = l.at.slice(cur.length); out.push(...extra); cur = l.at; out.push(l.kw); if (l.sch.t === 'kv' && l.name) out.push(l.name); if (l.vals.length) out.push(...(l.vals.length > 1 ? ['[', ...l.vals, ']'] : l.vals)); });
                const tail = r.path.slice(cur.length);
                return (r.leaves[0].at.length ? '' : '') + out.concat(tail).join(' ');
            }
            return parts.join(' ');
        }
        function upOne(path) {
            // bir hiyerarşi seviyesi: liste örneğinde "kw ad" birlikte düşer
            if (!path.length) return path;
            const par = schAt(ROOT, path.slice(0, -1));
            // path son iki öğe liste kw + örnek mi?
            const gp = path.length >= 2 ? schAt(ROOT, path.slice(0, -2)) : null;
            if (gp && gp.c && gp.c[path[path.length - 2]] && gp.c[path[path.length - 2]].t === 'l' && schAt(ROOT, path) === gp.c[path[path.length - 2]]) {
                const lst = gp.c[path[path.length - 2]];
                // join listesinde (to-zone) bir üst from-zone örneğine
                return path.slice(0, -2);
            }
            return par ? path.slice(0, -1) : [];
        }
        function leaveCfg(raw, force) {
            if (!force && !sameCfg(S.cand, active())) {
                S.pending = { prompt: 'Exit with uncommitted changes? [yes,no] (yes) ', fn: (a) => {
                    const r = a.trim() === '' ? { ok: 'yes' } : pick(a.trim(), ['yes', 'no']);
                    if (r.ok === 'no') { log({ raw: a, canon: 'exit-cancel' }); return cfgOut(''); }
                    if (!r.ok) { S.pending = S.lastPend; return ''; }
                    S.mode = 'op'; S.edit = []; S.editStack = []; log({ raw: a, canon: 'exit configuration-mode', uncommitted: true });
                    return 'Exiting configuration mode';
                } };
                S.lastPend = S.pending;
                log({ raw, canon: 'exit', prompt: true });
                return 'The configuration has been changed but not committed';
            }
            S.mode = 'op'; S.edit = []; S.editStack = [];
            log({ raw, canon: 'exit configuration-mode', uncommitted: !sameCfg(S.cand, active()) });
            return 'Exiting configuration mode';
        }
        // run: şapka ofseti "run " kadar kaydırılır
        function opExecShift(t2, sub, raw, shift) {
            const o = opExec(t2, sub, raw);
            return o.replace(/^( *)\^/m, (m0, sp) => ' '.repeat(sp.length + shift) + '^');
        }

        // ── giriş
        function input(raw0) {
            const raw = String(raw0).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; return p.fn(raw); }
            if (S.loggedOut) { S.loggedOut = false; return lab.loginBanner || ''; }
            const tick = confirmTick();
            const line = raw.replace(/\s+$/, '');
            if (!line.trim() || line === '\x1a') return tick + (S.mode === 'cfg' ? cfgOut('') : '');
            const toks = tok(line);
            if (S.mode === 'op') return tick + opExec(toks, line, raw.trim());
            return tick + cfgExec(toks, line, raw.trim());
        }

        // ── ? ve Tab
        const PIPE_ROWS = [['  ', 'compare', 'Candidate ile aktif (ya da rollback N) farkı'], ['  ', 'count', 'Satır say'], ['  ', 'display', 'Farklı biçimde göster (set)'], ['  ', 'except', 'Desene uyan satırları çıkar'], ['  ', 'last', 'Son N satır'], ['  ', 'match', 'Desene uyan satırlar'], ['  ', 'no-more', 'Sayfalamayı kapat']];
        function candidates(line) {
            const trailing = line === '' || /\s$/.test(line);
            const toks = tok(line), done = trailing ? toks : toks.slice(0, -1), part = trailing ? '' : toks[toks.length - 1].t;
            const pi = done.findIndex(x => x.t === '|' && x.sym);
            if (pi >= 0 || (!trailing && toks[toks.length - 1].t === '|')) {
                const after = pi >= 0 ? done.slice(pi + 1) : [];
                if (!after.length) return { rows: PIPE_ROWS.map(r => [' ', r[1], r[2]]), part };
                const k = pick(after[0].t, PIPE_ROWS.map(r => r[1]));
                if (k.ok === 'display' && after.length === 1) return { rows: [[' ', 'set', 'set komutları olarak göster']], part };
                if (k.ok === 'compare' && after.length === 1) return { rows: [[' ', 'rollback', 'Bir rollback sürümüyle karşılaştır'], [' ', '<[Enter]>', 'Komutu çalıştır']], part };
                return { rows: [[' ', '<[Enter]>', 'Komutu çalıştır'], [' ', '|', 'Pipe']], part };
            }
            const mode = S.mode;
            const opRows = (d) => {
                const w = opWalk(d, true);
                if (w.err || w.unsup) return null;
                const n = w.node, rows = [];
                if (n.cfgShow) {
                    const r = parse(ROOT, [], w.args, 'help');
                    if (!r.ok) return null;
                    return { rows: helpAt(r, true).concat([[' ', '|', 'Çıktıyı süz']]), part };
                }
                if (n.c && !w.args.length) Object.entries(n.c).filter(([, x]) => !x.only || x.only.includes(plat)).forEach(([k, x]) => rows.push([x.c || x.cfgShow ? '>' : ' ', k, x.d || '']));
                if (n.args && (w.args.length || !n.c || n.run)) n.args.forEach(a => rows.push([' ', a[0], a[1]]));
                if (n.run && !w.args.length) rows.push([' ', '<[Enter]>', 'Komutu çalıştır'], [' ', '|', 'Pipe through a command']);
                else if (w.args.length && n.runArgs) rows.push([' ', '<[Enter]>', 'Komutu çalıştır']);
                return { rows, part };
            };
            if (mode === 'op') return opRows(done);
            if (!done.length) return { rows: CFG_VERBS.map(v => [' ', v, VERB_H[v] || '']), part };
            const vr = pick(done[0].t, CFG_VERBS);
            if (!vr.ok) return null;
            const rest = done.slice(1);
            if (vr.ok === 'run') return opRows(rest);
            if (vr.ok === 'top' && rest.length) { const keep = S.edit; S.edit = []; const c = candidates(line.slice(done[1].o)); S.edit = keep; return c; }
            if (vr.ok === 'commit') return { rows: [[' ', 'and-quit', 'Commit edip operasyonel moda dön'], [' ', 'check', 'Yalnız denetle, uygulama'], [' ', 'comment', 'Commit açıklaması'], [' ', 'confirmed', 'Otomatik geri alma ile commit (dakika)'], [' ', '<[Enter]>', 'Komutu çalıştır']], part };
            if (vr.ok === 'rollback') return { rows: S.hist.map((h, i) => [' ', String(i), SIMCLK(h.meta.n) + ' by ' + h.meta.by + ' via ' + h.meta.via]).concat([[' ', 'rescue', 'Kurtarma yapılandırması'], [' ', '<[Enter]>', 'rollback 0']]), part };
            if (['exit', 'quit'].includes(vr.ok)) return { rows: [[' ', 'configuration-mode', 'Yapılandırma modundan çık'], [' ', '<[Enter]>', 'Komutu çalıştır']], part };
            if (['up', 'top', 'status'].includes(vr.ok) || CFG_UNSUP.includes(vr.ok)) return { rows: [[' ', '<[Enter]>', 'Komutu çalıştır']], part };
            if (vr.ok === 'insert') { const bi = rest.findIndex(x => ['before', 'after'].includes(x.t)); if (bi >= 0) return { rows: [[' ', '<ad>', 'Referans öğe']], part }; }
            const r = parse(ROOT, S.edit, rest, 'help');
            if (!r.ok) return null;
            let rows = helpAt(r, vr.ok !== 'set');
            if (vr.ok === 'insert' && r.end === 'inst') rows = [[' ', 'before', 'Öncesine'], [' ', 'after', 'Sonrasına']];
            if (vr.ok === 'show') rows.push([' ', '|', 'Pipe through a command']);
            return { rows, part };
        }
        function helpAt(r, showLike) {
            if (r.need) return valueRows(r.need.sch, ST, r.need.kind).map(x => x);
            const rows = schemaRows(r.sch, ST, null, r.path);
            if (showLike || r.leaves.length || r.end === 'inst' || (r.end === 'c' && r.sch.pres)) rows.push([' ', '<[Enter]>', 'Komutu çalıştır']);
            return rows;
        }
        function help(line) {
            log({ help: line });
            if (S.pending || S.loggedOut) return '';
            const c = candidates(line);
            if (!c) {
                // hatalı kelimenin konumu
                const toks = tok(line); let at = null, first = false;
                if (S.mode === 'op' || (toks[0] && pick(toks[0].t, ['run']).ok === 'run')) { const off = S.mode === 'op' ? 0 : 1, w = opWalk(toks.slice(off)); if (w.err && toks[off + w.at]) { at = toks[off + w.at].o; first = off + w.at === 0; } }
                else if (toks[0] && !pick(toks[0].t, CFG_VERBS).ok) { at = toks[0].o; first = true; }
                else { const r = parse(ROOT, S.edit, toks.slice(1), 'help'); if (!r.ok && toks[1 + r.at]) at = toks[1 + r.at].o; }
                if (at === null) { const t = toks[toks.length - 1] || { o: 0 }; at = /\s$/.test(line) ? line.length : t.o; }
                return ' '.repeat(prompt().length + at) + '^\n' + (first ? 'unknown command.' : 'syntax error.');
            }
            const p = c.part.toLowerCase();
            const rows = c.rows.filter(r => !p || String(r[1]).toLowerCase().startsWith(p) || (/^</.test(r[1]) && !/^</.test(p) && false));
            if (!rows.length) {
                // değer yazılıyorsa (ör. "set system host-name R1?") yer tutucuyu göster
                const vals = c.rows.filter(r => /^</.test(r[1]) && r[1] !== '<[Enter]>');
                if (vals.length) return 'Possible completions:\n' + vals.map(r => (r[0] === '>' ? '> ' : r[0] === '+' ? '+ ' : '  ') + pad(r[1], 21) + r[2]).join('\n');
                return 'No valid completions';
            }
            return 'Possible completions:\n' + rows.map(r => (r[0] === '>' ? '> ' : r[0] === '+' ? '+ ' : '  ') + pad(r[1], 21) + r[2]).join('\n') + (S.mode === 'cfg' ? '\n' + editBanner() : '');
        }
        function complete(line) {
            if (S.pending || S.loggedOut || line === '' || /\s$/.test(line)) return null;
            const c = candidates(line); if (!c) return null;
            const toks = tok(line), last = toks[toks.length - 1];
            const hits = c.rows.map(r => String(r[1])).filter(w => !/^[<|]/.test(w) && w.toLowerCase().startsWith(last.t.toLowerCase()));
            const uniq = [...new Set(hits)];
            if (uniq.length !== 1) return null;
            return line.slice(0, last.o) + uniq[0] + ' ';
        }

        // ── başlangıç yapılandırması: lab.start (+ varyant.start) commit edilir; varyant.pending candidate'te kalır
        function boot(lines, commit) {
            const saved = S.mode; S.mode = 'cfg'; S.edit = [];
            lines.forEach(l => { const o = input(l); if (S.pending) S.pending = null; return o; });
            if (commit) { S.commitN++; S.hist.unshift({ cfg: cfgClone(S.cand), meta: { by: 'root', via: 'other', n: S.commitN } }); }
            S.mode = saved; S.edit = []; S.editStack = [];
        }
        const baseCfg = (lab.bare ? [] : ['set system root-authentication encrypted-password "$6$lAbS1mUl$' + fakeHash('lab-root', 43) + '"']).concat(lab.hostname ? ['set system host-name ' + lab.hostname] : []);
        boot(baseCfg.concat(lab.start || [], (S.variant && S.variant.start) || []), true);
        S.hist.length = 1;
        if (S.variant && S.variant.pending) boot(S.variant.pending, false);
        if (lab.pending) boot(lab.pending, false);
        S.commit0 = S.commitN; S.ev = []; S.mode = 'op';

        const E = evApi(S);
        const val = (path, which) => { const t = which === 'cand' ? effective(ROOT, S.cand) : act(); return getIn(t, typeof path === 'string' ? path.split(' ') : path); };
        return {
            vendor: 'juniper',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            _toRoot: () => { S.mode = 'op'; S.edit = []; S.editStack = []; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => S.variant, ev: E,
            get model() { return { active: active(), cand: S.cand, hist: S.hist, mode: S.mode, edit: S.edit }; },
            mode: () => S.mode, editPath: () => S.edit.join(' '),
            val, has: (p, w) => val(p, w) !== undefined,
            committed: () => sameCfg(S.cand, active()), commits: () => S.commitN - S.commit0, confirming: () => !!S.confirm,
            decide: (f, which) => decide(f, which === 'cand' ? effective(ROOT, S.cand) : undefined),
            hostIn: (z, svc) => hostIn(z, svc), rib: () => view().R, zoneOf: ifl => view().zoneOf(ifl),
            ifl: n => ifOf(view(), n), hostname: () => host(),
            _expire: () => { if (S.confirm) S.confirm.until = 0; },
            showRun: () => cfgText(active(), [], [], false).text + '\n' + setLines(ROOT, ROOT, S.cand.t, [], S.cand.ia, {}).join('\n'),
        };
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ══ PAN-OS ═══════════════════════════════════════════════════════════════
    // ═════════════════════════════════════════════════════════════════════════
    const PANOS_VER = '11.1.4-h7';
    // App-ID varsayılan portları (application-default)
    const PAPPS = { 'web-browsing': [['tcp', '80']], ssl: [['tcp', '443']], dns: [['udp', '53'], ['tcp', '53']], ssh: [['tcp', '22']], ping: [['icmp', '']], ntp: [['udp', '123']], 'ms-rdp': [['tcp', '3389']], smtp: [['tcp', '25']], ftp: [['tcp', '21']], 'google-base': [['tcp', '80,443']] };
    const PSVC = { 'service-http': ['tcp', '80,8080'], 'service-https': ['tcp', '443'] };
    const appGuess = (proto, port) => { for (const [a, l] of Object.entries(PAPPS)) if (a !== 'google-base' && l.some(([p, ps]) => p === proto && (proto === 'icmp' || portIn(ps, port)))) return a; return proto === 'icmp' ? 'ping' : 'unknown-' + proto; };
    function panSchema() {
        const zoneRef = st => ['any'].concat([...(getIn(st.cand.t, ['zone']) || new Map()).keys()]);
        const addrRef = st => ['any'].concat([...(getIn(st.cand.t, ['address']) || new Map()).keys()], [...(getIn(st.cand.t, ['address-group']) || new Map()).keys()]);
        const appRef = () => ['any'].concat(Object.keys(PAPPS));
        const svcRef = st => ['any', 'application-default'].concat(Object.keys(PSVC), [...(getIn(st.cand.t, ['service']) || new Map()).keys()]);
        const ifRef = () => { const r = []; for (let i = 1; i <= 8; i++) r.push('ethernet1/' + i); return r; };
        const mpRef = st => [...(getIn(st.cand.t, ['network', 'profiles', 'interface-management-profile']) || new Map()).keys()];
        const YN = ['yes', 'no'];
        const ruleC = (nat) => Object.assign({
            from: V('word', 'Kaynak zone(lar)', { multi: 'brack', ref: zoneRef }),
            to: V('word', nat ? 'Hedef zone (NAT: pre-NAT hedef zone)' : 'Hedef zone(lar) (DNAT sonrası: post-NAT zone)', { multi: 'brack', ref: zoneRef }),
            source: V('paddr', 'Kaynak adres(ler)', { multi: 'brack', ref: addrRef }),
            destination: V('paddr', nat ? 'Hedef adres (pre-NAT)' : 'Hedef adres(ler) (DNAT: pre-NAT genel IP)', { multi: 'brack', ref: addrRef }),
            description: V('str', 'Açıklama'),
            disabled: V(YN, 'Kuralı devre dışı bırak'),
        }, nat ? {
            service: V('word', 'Servis (any ya da servis nesnesi)', { ref: st => ['any'].concat(Object.keys(PSVC), [...(getIn(st.cand.t, ['service']) || new Map()).keys()]) }),
            'to-interface': V('pif', 'Hedef arayüz (isteğe bağlı)', { ref: ifRef }),
            'source-translation': K({ 'dynamic-ip-and-port': K({ 'interface-address': K({ interface: V('pif', 'Çeviri adresi bu arayüzün IP\'si', { ref: ifRef }), ip: V('prefix', 'Arayüzde birden çok IP varsa hangisi') }, 'Arayüz adresine çevir (DIPP)'), 'translated-address': V('paddr', 'Adres havuzu', { multi: 'brack' }) }, 'Dinamik IP ve port (PAT)') }, 'Kaynak NAT', { u: ['static-ip', 'dynamic-ip'] }),
            'destination-translation': K({ 'translated-address': V('paddr', 'Gerçek (post-NAT) sunucu adresi'), 'translated-port': V('port', 'Gerçek sunucu portu') }, 'Hedef NAT (DNAT)', { u: ['dns-rewrite'] }),
        } : {
            application: V('word', 'App-ID uygulama(ları)', { multi: 'brack', ref: appRef }),
            service: V('word', 'Servis (application-default önerilir)', { multi: 'brack', ref: svcRef }),
            'source-user': V('word', 'Kullanıcı (User-ID)', { multi: 'brack', ref: () => ['any'] }),
            category: V('word', 'URL kategorisi', { multi: 'brack', ref: () => ['any'] }),
            action: V(['allow', 'deny', 'drop', 'reset-client', 'reset-server', 'reset-both'], 'Eylem'),
            'log-end': V(YN, 'Oturum sonunda logla'), 'log-start': V(YN, 'Oturum başında logla'),
        });
        return K({
            deviceconfig: K({ system: K({ hostname: V('word', 'Cihaz adı'), timezone: V('word', 'Saat dilimi'), 'dns-setting': K({ servers: K({ primary: V('ip', 'Birincil DNS'), secondary: V('ip', 'İkincil DNS') }, 'DNS sunucuları') }, 'DNS ayarları'), 'ntp-servers': K({ 'primary-ntp-server': K({ 'ntp-server-address': V('word', 'NTP sunucusu') }, 'Birincil NTP') }, 'NTP sunucuları') }, 'Sistem', { u: ['ip-address', 'netmask', 'default-gateway', 'login-banner', 'service', 'panorama', 'update-schedule', 'permitted-ip'] }) }, 'Cihaz ayarları', { u: ['setting', 'high-availability'] }),
            network: K({
                interface: K({
                    ethernet: L('pif', {
                        layer3: K({ ip: V('prefix', 'IP adresi/önek', { multi: 'brack' }), 'interface-management-profile': V('word', 'Yönetim profili (ping/ssh/https)', { ref: mpRef }) }, 'Katman 3 arayüz', { pres: true, u: ['dhcp-client', 'mtu', 'units', 'ipv6', 'lldp', 'ndp-proxy', 'adjust-tcp-mss'] }),
                        comment: V('str', 'Açıklama'),
                        'link-state': V(['auto', 'up', 'down'], 'Bağlantı durumu'),
                    }, 'Ethernet arayüzü', { wrap: true, ref: ifRef, u: ['layer2', 'virtual-wire', 'tap', 'ha', 'aggregate-group'] }),
                }, 'Arayüzler', { u: ['loopback', 'tunnel', 'vlan', 'aggregate-ethernet'] }),
                profiles: K({ 'interface-management-profile': L('name', { ping: V(YN, 'Ping yanıtı'), ssh: V(YN, 'SSH yönetimi'), https: V(YN, 'HTTPS yönetimi'), http: V(YN, 'HTTP yönetimi'), 'permitted-ip': L('prefix', {}, 'İzinli kaynak ağ', { wrap: true }) }, 'Arayüz yönetim profili', { wrap: true, ref: mpRef, u: ['snmp', 'telnet', 'response-pages', 'userid-service'] }) }, 'Profiller', { u: ['zone-protection-profile', 'monitor-profile'] }),
                'virtual-router': L('name', {
                    interface: V('pif', 'Bu VR\'a ait arayüzler', { multi: 'brack', ref: ifRef }),
                    'routing-table': K({ ip: K({ 'static-route': L('name', { destination: V('prefix', 'Hedef ağ'), nexthop: K({ 'ip-address': V('ip', 'Sonraki atlama IP', { grp: 'nh' }), discard: F('Düşür', { grp: 'nh' }) }, 'Sonraki atlama'), interface: V('pif', 'Çıkış arayüzü', { ref: ifRef }), metric: V('metric', 'Metrik (varsayılan 10)'), 'admin-dist': V('adist', 'Yönetsel mesafe (varsayılan 10)') }, 'Statik rota', { wrap: true }) }, 'IPv4') }, 'Yönlendirme tablosu'),
                }, 'Sanal yönlendirici', { wrap: true, ref: () => ['default'], u: ['protocol', 'ecmp', 'multicast', 'admin-dists'] }),
            }, 'Ağ', { u: ['ike', 'tunnel', 'vlan', 'dhcp', 'dns-proxy', 'qos', 'lldp', 'logical-router', 'shared-gateway'] }),
            zone: L('name', { network: K({ layer3: V('pif', 'Zone üyesi L3 arayüzler', { multi: 'brack', ref: ifRef }) }, 'Zone tipi ve üyeleri', { u: ['layer2', 'virtual-wire', 'tap', 'tunnel', 'zone-protection-profile', 'log-setting'] }) }, 'Güvenlik zone\'u', { wrap: true, ref: zoneRef, u: ['user-acl', 'enable-user-identification'] }),
            address: L('name', { 'ip-netmask': V('prefix', 'IP/maske', { grp: 'at' }), fqdn: V('word', 'Tam alan adı', { grp: 'at' }), 'ip-range': V('paddr', 'Aralık a.b.c.d-e.f.g.h', { grp: 'at' }), description: V('str', 'Açıklama') }, 'Adres nesnesi', { wrap: true, ref: st => [...(getIn(st.cand.t, ['address']) || new Map()).keys()], u: ['tag'] }),
            'address-group': L('name', { static: V('word', 'Üye adres nesneleri', { multi: 'brack', ref: st => [...(getIn(st.cand.t, ['address']) || new Map()).keys()] }), description: V('str', 'Açıklama') }, 'Adres grubu', { wrap: true, u: ['dynamic', 'tag'] }),
            service: L('name', { protocol: K({ tcp: K({ port: V('ports', 'Hedef port(lar)') }, 'TCP', { grp: 'pr' }), udp: K({ port: V('ports', 'Hedef port(lar)') }, 'UDP', { grp: 'pr' }) }, 'Protokol'), description: V('str', 'Açıklama') }, 'Servis nesnesi', { wrap: true, u: ['tag'] }),
            rulebase: K({
                security: K({ rules: L('name', ruleC(false), 'Güvenlik kuralı', { wrap: true, ref: st => [...(getIn(st.cand.t, ['rulebase', 'security', 'rules']) || new Map()).keys()], u: ['profile-setting', 'tag', 'negate-source', 'negate-destination', 'schedule', 'hip-profiles', 'rule-type', 'option'] }) }, 'Güvenlik kuralları', { u: ['default-security-rules'] }),
                nat: K({ rules: L('name', ruleC(true), 'NAT kuralı', { wrap: true, ref: st => [...(getIn(st.cand.t, ['rulebase', 'nat', 'rules']) || new Map()).keys()], u: ['nat-type', 'tag', 'active-active-device-binding'] }) }, 'NAT kuralları'),
            }, 'Kural tabanları', { u: ['pbf', 'decryption', 'qos', 'application-override', 'authentication', 'dos', 'tunnel-inspect'] }),
        }, '', { u: ['mgt-config', 'shared', 'vsys', 'application', 'application-group', 'profiles', 'profile-group', 'schedule', 'tag', 'external-list', 'region', 'user-id-agent', 'log-settings', 'import', 'reports'] });
    }

    function panSession(lab, opts) {
        const ROOT = panSchema(), USER = lab.user || 'admin', PORTS = 8;
        const S = { ev: [], mode: 'op', edit: [], editStack: [], pending: null, answers: {}, loggedOut: false, fmt: 'default', job: lab.jobStart || 2, jobs: [] };
        S.variant = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        const SIM = Object.assign({}, lab.sim || {}, (S.variant && S.variant.sim) || {});
        const hosts = (lab.hosts || []).concat(SIM.hosts || []);
        const up = new Set(lab.up || []);
        S.run = { t: new Map(), ia: new Set() };
        S.cand = cfgClone(S.run);
        const ST = { get cand() { return S.cand; } };
        const log = o => S.ev.push(o);
        const host = () => getIn(S.run.t, ['deviceconfig', 'system', 'hostname']) || 'PA-VM';
        const prompt = () => { if (S.pending) return S.pending.prompt; if (S.loggedOut) return ''; return USER + '@' + host() + (S.mode === 'cfg' ? '# ' : '> '); };
        const editBanner = () => '[edit' + (S.edit.length ? ' ' + S.edit.join(' ') : '') + ']';
        const cfgOut = body => (body ? body + '\n' : '') + editBanner();
        const INV = 'Invalid syntax.';
        const UNSUP = '# [Simülatör] Bu komut gerçek cihazda var ama bu lab sürümünde desteklenmiyor.';
        const STY = { unit: 2, wrapAll: true, brackAll: true };

        // ── doğrulama (commit / validate)
        function validate(cfg) {
            const t = cfg.t, E2 = [];
            const zones = t.get('zone') || new Map(), addrs = t.get('address') || new Map(), grps = t.get('address-group') || new Map(), svcs = t.get('service') || new Map();
            const eth = getIn(t, ['network', 'interface', 'ethernet']) || new Map(), mps = getIn(t, ['network', 'profiles', 'interface-management-profile']) || new Map();
            const ref = (path, field, v) => E2.push(' ' + path.concat([field]).join(' -> ') + " '" + v + "' is not a valid reference", ' ' + path.concat([field]).join(' -> ') + ' is invalid');
            const addrOk = v => v === 'any' || addrs.has(v) || grps.has(v) || !!pfx(v) || /^\d{1,3}(\.\d{1,3}){3}-\d{1,3}(\.\d{1,3}){3}$/.test(v);
            for (const [n, o] of eth) { const mp = getIn(o, ['layer3', 'interface-management-profile']); if (mp && !mps.has(mp)) ref(['network', 'interface', 'ethernet', n, 'layer3'], 'interface-management-profile', mp); }
            const seen = {};
            for (const [z, zo] of zones) for (const i of (getIn(zo, ['network', 'layer3']) || [])) {
                if (!(getIn(eth, [i, 'layer3']) instanceof Map)) E2.push(' zone -> ' + z + ' -> network -> layer3 -> ' + i + '  # [Simülatör] arayüz katman 3 olarak yapılandırılmamış');
                if (seen[i]) E2.push(' zone -> ' + z + ' -> network -> layer3  # [Simülatör] ' + i + ' zaten ' + seen[i] + ' zone\'unda');
                seen[i] = z;
            }
            for (const [vr, vo] of (getIn(t, ['network', 'virtual-router']) || new Map())) (vo.get('interface') || []).forEach(i => { if (!(getIn(eth, [i, 'layer3']) instanceof Map)) ref(['network', 'virtual-router', vr], 'interface', i); });
            for (const [g, go] of grps) (go.get('static') || []).forEach(m => { if (!addrs.has(m)) ref(['address-group', g], 'static', m); });
            for (const kind of ['security', 'nat']) for (const [rn, r] of (getIn(t, ['rulebase', kind, 'rules']) || new Map())) {
                const P2 = ['rulebase', kind, 'rules', rn];
                const need = kind === 'security' ? ['from', 'to', 'source', 'destination', 'application', 'service'] : ['from', 'to', 'source', 'destination'];
                const miss = need.filter(f => !r.get(f));
                if (miss.length) E2.push(' ' + P2.join(' -> ') + '  # [Simülatör] zorunlu alan eksik: ' + miss.join(', '));
                ['from', 'to'].forEach(f => (r.get(f) || []).forEach(z => { if (z !== 'any' && !zones.has(z)) ref(P2, f, z); }));
                ['source', 'destination'].forEach(f => (r.get(f) || []).forEach(a => { if (!addrOk(a)) ref(P2, f, a); }));
                if (kind === 'security') {
                    (r.get('application') || []).forEach(a => { if (a !== 'any' && !PAPPS[a]) ref(P2, 'application', a); });
                    (r.get('service') || []).forEach(s => { if (!['any', 'application-default'].includes(s) && !PSVC[s] && !svcs.has(s)) ref(P2, 'service', s); });
                } else {
                    const s = r.get('service'); if (s && s !== 'any' && !PSVC[s] && !svcs.has(s)) ref(P2, 'service', s);
                    if ((r.get('to') || []).length > 1) E2.push(' ' + P2.join(' -> ') + ' -> to  # [Simülatör] NAT kuralında yalnız bir hedef zone olabilir');
                    const si = getIn(r, ['source-translation', 'dynamic-ip-and-port', 'interface-address', 'interface']);
                    if (si && !(getIn(eth, [si, 'layer3']) instanceof Map)) ref(P2.concat(['source-translation', 'dynamic-ip-and-port', 'interface-address']), 'interface', si);
                }
            }
            return E2;
        }
        function jobLine(j) { return pad(SIMCLK(j.n).replace(/-/g, '/'), 22) + pad(SIMCLK(j.n).slice(11), 13) + pad(String(j.id), 6) + pad('', 32) + pad(j.type, 22) + pad('FIN', 7) + pad(j.ok ? 'OK' : 'FAIL', 6) + SIMCLK(j.n + 1).slice(11); }
        function doCommit(raw, desc) {
            const id = S.job++, errs = validate(S.cand);
            const L2 = ['Commit job ' + id + ' is in progress. Use Ctrl+C to return to command prompt'];
            S.jobs.push({ id, type: 'Commit', ok: !errs.length, n: id, errs, desc });
            if (errs.length) {
                L2.push('.....55%...75%', 'Validation Error:', ...errs, 'Commit failed');
                log({ raw, err: 'commit', commit: 'fail' });
                return L2.join('\n');
            }
            S.run = cfgClone(S.cand);
            L2.push('..........55%......75%.....98%.......100%', 'Configuration committed successfully');
            log({ raw, canon: 'commit', commit: 'ok' });
            return L2.join('\n');
        }

        // ── ağ görünümü (running)
        function view(cfg) {
            const t = (cfg || S.run).t, eth = getIn(t, ['network', 'interface', 'ethernet']) || new Map();
            const vrs = getIn(t, ['network', 'virtual-router']) || new Map(), zones = t.get('zone') || new Map();
            const vrOf = i => { for (const [v, vo] of vrs) if ((vo.get('interface') || []).includes(i)) return v; return null; };
            const zoneOf = i => { for (const [z, zo] of zones) if ((getIn(zo, ['network', 'layer3']) || []).includes(i)) return z; return null; };
            const ifUp = i => up.has(i) && getIn(eth, [i, 'link-state']) !== 'down';
            const ifs = []; for (let k = 1; k <= PORTS; k++) { const n = 'ethernet1/' + k, o = eth.get(n); ifs.push({ name: n, l3: o && o.get('layer3') instanceof Map, ips: (o && getIn(o, ['layer3', 'ip'])) || [], mp: o && getIn(o, ['layer3', 'interface-management-profile']), vr: vrOf(n), zone: zoneOf(n), up: ifUp(n), comment: o && o.get('comment') }); }
            const R = {};
            for (const [v, vo] of vrs) {
                const list = R[v] = [];
                ifs.filter(x => x.vr === v && x.up && x.l3).forEach(x => x.ips.forEach(a => { const p = pfx(a); list.push({ dst: netStr(p), nh: p.ip, metric: 0, flags: 'A C', iface: x.name, ad: 0 }); list.push({ dst: p.ip + '/32', nh: '0.0.0.0', metric: 0, flags: 'A H', iface: '', ad: 0 }); }));
                const conn = ip => list.find(r => r.flags === 'A C' && inNet(ip, pfx(r.dst)));
                for (const [sn, so] of (getIn(vo, ['routing-table', 'ip', 'static-route']) || new Map())) {
                    const d = so.get('destination'); if (!d) continue;
                    const nh = getIn(so, ['nexthop', 'ip-address']), disc = getIn(so, ['nexthop', 'discard']);
                    const c = nh ? conn(nh) : null;
                    if (!disc && (!c || (so.get('interface') && so.get('interface') !== c.iface))) continue;
                    list.push({ dst: netStr(pfx(d)), nh: disc ? 'discard' : nh, metric: +(so.get('metric') || 10), flags: 'S', iface: disc ? '' : c.iface, ad: +(so.get('admin-dist') || 10), name: sn });
                }
                // en iyi statik
                const g = {};
                list.filter(r => r.flags === 'S').forEach(r => { (g[r.dst] = g[r.dst] || []).push(r); });
                Object.values(g).forEach(l => { l.sort((a, b) => a.ad - b.ad || a.metric - b.metric); l[0].flags = 'A S'; });
                list.sort((a, b) => ip2n(pfx(a.dst).ip) - ip2n(pfx(b.dst).ip) || pfx(a.dst).len - pfx(b.dst).len);
            }
            const lookup = (vr, ip) => { let best = null; (R[vr] || []).forEach(r => { if (!/A/.test(r.flags) || r.flags === 'A H') return; const p = pfx(r.dst); if (inNet(ip, p) && (!best || p.len > pfx(best.dst).len)) best = r; }); return best; };
            return { t, ifs, vrs, zones, vrOf, zoneOf, R, lookup, eth };
        }
        const ifo = (W, n) => W.ifs.find(x => x.name === n);
        function addrMatch(t, list, ip) {
            const addrs = t.get('address') || new Map(), grps = t.get('address-group') || new Map();
            const one = (a, d) => {
                if (a === 'any') return true;
                if (pfx(a)) return inNet(ip, pfx(a));
                if (/-/.test(a) && /^\d/.test(a)) { const [x, y] = a.split('-'); return ip2n(ip) >= ip2n(x) && ip2n(ip) <= ip2n(y); }
                if (addrs.has(a)) { const o = addrs.get(a); if (o.get('ip-netmask')) return inNet(ip, pfx(o.get('ip-netmask'))); if (o.get('ip-range')) return one(o.get('ip-range'), d); return false; }
                if (grps.has(a) && d < 4) return (grps.get(a).get('static') || []).some(m => one(m, d + 1));
                return false;
            };
            return (list || []).some(a => one(a, 0));
        }
        function svcMatch(t, list, app, proto, port) {
            const svcs = t.get('service') || new Map();
            return (list || []).some(s => {
                if (s === 'any') return true;
                if (s === 'application-default') return !!PAPPS[app] && PAPPS[app].some(([p, ps]) => p === proto && (proto === 'icmp' || portIn(ps, port)));
                if (PSVC[s]) return PSVC[s][0] === proto && portIn(PSVC[s][1], port);
                const o = svcs.get(s); if (!o) return false;
                const pr = getIn(o, ['protocol']); if (!(pr instanceof Map)) return false;
                const [k] = [...pr.keys()]; return k === proto && portIn(getIn(pr, [k, 'port']) || '0', port);
            });
        }
        function secMatch(t, f) {
            let idx = 0;
            for (const [rn, r] of (getIn(t, ['rulebase', 'security', 'rules']) || new Map())) {
                idx++;
                if (r.get('disabled') === 'yes') continue;
                const zin = r.get('from') || [], zout = r.get('to') || [];
                if (!(zin.includes('any') || zin.includes(f.from)) || !(zout.includes('any') || zout.includes(f.to))) continue;
                if (!addrMatch(t, r.get('source'), f.src) || !addrMatch(t, r.get('destination'), f.dst)) continue;
                const apps = r.get('application') || [];
                if (!(apps.includes('any') || (f.app && apps.includes(f.app)))) continue;
                if (!svcMatch(t, r.get('service'), f.app, f.proto, f.dport)) continue;
                return { name: rn, idx, r, action: r.get('action') || 'allow' };
            }
            return null;
        }
        function natMatch(t, f) {
            let idx = 0;
            for (const [rn, r] of (getIn(t, ['rulebase', 'nat', 'rules']) || new Map())) {
                idx++;
                if (r.get('disabled') === 'yes') continue;
                const zin = r.get('from') || [], zout = r.get('to') || [];
                if (!(zin.includes('any') || zin.includes(f.from)) || !(zout.includes('any') || zout.includes(f.to))) continue;
                if (!addrMatch(t, r.get('source'), f.src) || !addrMatch(t, r.get('destination'), f.dst)) continue;
                const s = r.get('service') || 'any';
                if (s !== 'any' && !svcMatch(t, [s], null, f.proto, f.dport)) continue;
                return { name: rn, idx, r, st: getIn(r, ['source-translation']), dt: getIn(r, ['destination-translation']) };
            }
            return null;
        }
        function decide(f0, cfg) {
            const f = Object.assign({ proto: 'tcp', sport: 51234, dport: 443 }, f0);
            const W = view(cfg), t = W.t;
            // giriş arayüzü: kaynağı içeren bağlı ağ, yoksa kaynağa dönüş rotası
            let inIf = null;
            for (const x of W.ifs) if (x.l3 && x.up && x.vr && x.ips.some(a => inNet(f.src, pfx(a)))) inIf = x;
            if (!inIf) { for (const v of Object.keys(W.R)) { const r = W.lookup(v, f.src); if (r) { inIf = ifo(W, r.iface); break; } } }
            if (!inIf || !inIf.vr) return { stage: 'noarrive', f };
            if (!inIf.zone) return { stage: 'nozone', f, iface: inIf.name };
            const r1 = W.lookup(inIf.vr, f.dst);
            if (!r1) return { stage: 'noroute', f, from: inIf.zone };
            const zpre = ifo(W, r1.iface).zone;
            if (!zpre) return { stage: 'nozone', f, iface: r1.iface };
            const nat = natMatch(t, { from: inIf.zone, to: zpre, src: f.src, dst: f.dst, proto: f.proto, dport: f.dport });
            let dst2 = f.dst, dport2 = f.dport;
            if (nat && nat.dt instanceof Map && nat.dt.get('translated-address')) { const ta = nat.dt.get('translated-address'); const o = (t.get('address') || new Map()).get(ta); dst2 = o && o.get('ip-netmask') ? pfx(o.get('ip-netmask')).ip : pfx(ta) ? pfx(ta).ip : ta; dport2 = +(nat.dt.get('translated-port') || f.dport); }
            const r2 = dst2 === f.dst ? r1 : W.lookup(inIf.vr, dst2);
            if (!r2) return { stage: 'noroute', f, from: inIf.zone, nat };
            const zpost = ifo(W, r2.iface).zone;
            if (!zpost) return { stage: 'nozone', f, iface: r2.iface, nat };
            const app = f.app || appGuess(f.proto, f.dport);
            const sec = secMatch(t, { from: inIf.zone, to: zpost, src: f.src, dst: f.dst, proto: f.proto, dport: f.dport, app });
            const base = { f, from: inIf.zone, to: zpost, zpre, nat, app, inIf: inIf.name, outIf: r2.iface, dst2, dport2 };
            if (!sec) return Object.assign(base, inIf.zone === zpost ? { stage: 'allowed', rule: 'intrazone-default' } : { stage: 'denied', rule: 'interzone-default' });
            if (sec.action !== 'allow') return Object.assign(base, { stage: 'denied', rule: sec.name });
            const snat = nat && nat.st instanceof Map ? nat : null;
            if (isPriv(f.src) && !isPriv(dst2) && !snat) return Object.assign(base, { stage: 'nonat', rule: sec.name });
            return Object.assign(base, { stage: 'allowed', rule: sec.name, snat });
        }
        function snatIp(W, n) { const si = getIn(n.st, ['dynamic-ip-and-port', 'interface-address', 'interface']); const x = si && ifo(W, si); return x && x.ips[0] ? pfx(x.ips[0]).ip : '0.0.0.0'; }
        function mgmtAllows(ifn, svc, cfg) { const W = view(cfg), x = ifo(W, ifn); if (!x || !x.mp) return false; const p = getIn(W.t, ['network', 'profiles', 'interface-management-profile', x.mp]); return !!p && p.get(svc) === 'yes'; }

        // ── operasyonel çıktılar
        function sysInfo() {
            return ['', 'hostname: ' + host(), 'ip-address: 192.0.2.10', 'netmask: 255.255.255.0', 'default-gateway: 192.0.2.1', 'mac-address: ' + macOf('mgmt'), 'time: ' + SIMCLK(S.job) + ' UTC', 'uptime: 0 days, 0:45:12', 'family: vm', 'model: PA-VM', 'serial: SIMULATOR000001', 'sw-version: ' + PANOS_VER, 'app-version: 8900-9200', 'operational-mode: normal', 'vpn-disable-mode: off', 'multi-vsys: off', '# [Simülatör] Config Generator CLI Lab — eğitim simülatörü; gerçek cihaz değildir.'].join('\n');
        }
        function ifAll() {
            const W = view(), L2 = ['total configured hardware interfaces: ' + PORTS, '', 'name                    id    speed/duplex/state            mac address', '--------------------------------------------------------------------------------'];
            W.ifs.forEach((x, i) => L2.push(pad(x.name, 24) + pad(String(16 + i), 6) + pad(x.up ? '1000/full/up' : 'ukn/ukn/down(autoneg)', 30) + macOf(x.name)));
            L2.push('', 'aggregation groups: 0', '', '', 'total configured logical interfaces: ' + W.ifs.filter(x => x.l3).length, '', 'name                id    vsys zone             forwarding               tag    address', '------------------- ----- ---- ---------------- ------------------------ ------ ------------------');
            W.ifs.filter(x => x.l3).forEach((x, i) => L2.push(pad(x.name, 20) + pad(String(16 + W.ifs.indexOf(x)), 6) + pad('1', 5) + pad(x.zone || '', 17) + pad(x.vr ? 'vr:' + x.vr : 'N/A', 25) + pad('0', 7) + (x.ips[0] || 'N/A')));
            return L2.join('\n');
        }
        function ifOne(n) {
            const W = view(), x = ifo(W, n); if (!x) return null;
            return ['--------------------------------------------------------------------------------', 'Name: ' + n + ', ID: ' + (16 + W.ifs.indexOf(x)), 'Link status:', '  Runtime link speed/duplex/state: ' + (x.up ? '1000/full/up' : 'unknown/unknown/down'), '  Configured link speed/duplex/state: auto/auto/auto', 'MAC address:', '  Port MAC address ' + macOf(n), 'Operation mode: ' + (x.l3 ? 'layer3' : 'none'),
                '--------------------------------------------------------------------------------', '', 'Name: ' + n + ', ID: ' + (16 + W.ifs.indexOf(x)), 'Operation mode: ' + (x.l3 ? 'layer3' : 'none'), 'Virtual router ' + (x.vr || 'N/A'), 'Interface MTU 1500', 'Interface IP address: ' + (x.ips.join(', ') || 'N/A'), 'Interface management profile: ' + (x.mp || 'N/A'), 'Zone: ' + (x.zone || 'N/A') + ', virtual system: vsys1',
                '# [Simülatör] Özet görünüm; sayaçlar gösterilmez.'].join('\n');
        }
        function routeTable(filterStatic) {
            const W = view(), L2 = ['flags: A:active, ?:loose, C:connect, H:host, S:static, ~:internal, R:rip, O:ospf, B:bgp,', '       Oi:ospf intra-area, Oo:ospf inter-area, O1:ospf ext-type-1, O2:ospf ext-type-2, E:ecmp, M:multicast', ''];
            let n = 0;
            for (const v of Object.keys(W.R)) {
                L2.push('', 'VIRTUAL ROUTER: ' + v + ' (id ' + (Object.keys(W.R).indexOf(v) + 1) + ')', '  ==========', 'destination                                 nexthop                                 metric flags      age   interface          next-AS');
                W.R[v].filter(r => !filterStatic || /S/.test(r.flags)).forEach(r => { n++; L2.push(pad(r.dst, 44) + pad(r.nh, 40) + pad(String(r.metric), 7) + pad(r.flags, 11) + pad('', 6) + r.iface); });
                L2.push('total routes shown: ' + n);
            }
            if (!Object.keys(W.R).length) L2.push('# [Simülatör] Tanımlı sanal yönlendirici (virtual-router) yok.');
            return L2.join('\n');
        }
        function fibLookup(args) {
            const A = {};
            for (let i = 0; i < args.length; i += 2) { const k = pick(args[i].t, ['virtual-router', 'ip']); if (!k.ok || !args[i + 1]) return { err: args[i + 1] ? i : i + 1 }; A[k.ok] = args[i + 1].t; }
            if (!A.ip || !isIp(A.ip)) return { err: args.length };
            const W = view(), vr = A['virtual-router'] || 'default';
            if (!W.vrs.has(vr)) return { text: '# [Simülatör] \'' + vr + '\' adlı sanal yönlendirici yok.', errk: 'value' };
            const r = W.lookup(vr, A.ip), me = r && ifo(W, r.iface);
            log({ fib: { ip: A.ip, iface: r ? r.iface : null } });
            return { text: ['--------------------------------------------------------------------------------', 'runtime route lookup', '--------------------------------------------------------------------------------', 'virtual-router:   ' + vr, 'destination:      ' + A.ip, 'result:', r ? ' via ' + (r.flags === 'A C' ? A.ip : r.nh) + ' interface ' + r.iface + ', source ' + (me && me.ips[0] ? pfx(me.ips[0]).ip : '0.0.0.0') + ', metric ' + r.metric : ' # [Simülatör] rota yok (no route)', '--------------------------------------------------------------------------------'].join('\n'), res: r ? r.iface : null };
        }
        function testArgs(args, keys) {
            const A = {};
            for (let i = 0; i < args.length; i++) {
                const k = pick(args[i].t, keys);
                if (!k.ok) return { err: i };
                if (!args[i + 1]) return { err: i + 1 };
                A[k.ok] = args[++i].t;
            }
            return { A };
        }
        const PNUM = { 6: 'tcp', 17: 'udp', 1: 'icmp' };
        function secTest(args) {
            const r = testArgs(args, ['from', 'to', 'source', 'destination', 'destination-port', 'protocol', 'application', 'source-user', 'category', 'show-all', 'source-port']);
            if (r.err !== undefined) return r;
            const A = r.A, miss = ['from', 'to', 'source', 'destination', 'protocol'].filter(k => !A[k]);
            if (miss.length) return { text: '# [Simülatör] Eksik parametre: ' + miss.join(', '), errk: 'incomplete' };
            if (!isIp(A.source) || !isIp(A.destination) || !PNUM[A.protocol] || (A['destination-port'] && !VT.port(A['destination-port']))) return { text: INV, errk: 'value' };
            const f = { from: A.from, to: A.to, src: A.source, dst: A.destination, proto: PNUM[A.protocol], dport: +(A['destination-port'] || 0), app: A.application || null };
            const m = secMatch(S.run.t, f);
            log({ sectest: f, res: m ? m.name : null });
            if (!m) return { text: A.from === A.to ? '# [Simülatör] Kural eşleşmedi → intrazone-default (allow) uygulanır.' : 'No rule matched\n# [Simülatör] Eşleşme yok → interzone-default (deny) uygulanır.', res: null };
            const L = x => { const v = m.r.get(x) || ['any']; return v.length > 1 ? '[ ' + v.join(' ') + ' ]' : v[0]; };
            const apps = m.r.get('application') || ['any'], svc = m.r.get('service') || ['any'];
            const as = apps[0] === 'any' && svc[0] === 'any' ? 'any/any/any/any' : (f.app || apps[0]) + '/' + f.proto + '/any/' + (f.dport || 'any');
            return { res: m.name, text: ['"' + m.name + '; index: ' + m.idx + '" {', '        from ' + L('from') + ';', '        source ' + L('source') + ';', '        source-region none;', '        to ' + L('to') + ';', '        destination ' + L('destination') + ';', '        destination-region none;', '        user any;', '        category any;', '        application/service ' + as + ';', '        action ' + m.action + ';', '        icmp-unreachable: no', '        terminal yes;', '}'].join('\n') };
        }
        function natTest(args) {
            const r = testArgs(args, ['from', 'to', 'source', 'destination', 'destination-port', 'protocol', 'source-port', 'to-interface', 'ha-device-id']);
            if (r.err !== undefined) return r;
            const A = r.A, miss = ['from', 'to', 'source', 'destination', 'protocol'].filter(k => !A[k]);
            if (miss.length) return { text: '# [Simülatör] Eksik parametre: ' + miss.join(', '), errk: 'incomplete' };
            if (!isIp(A.source) || !isIp(A.destination) || !PNUM[A.protocol]) return { text: INV, errk: 'value' };
            const f = { from: A.from, to: A.to, src: A.source, dst: A.destination, proto: PNUM[A.protocol], dport: +(A['destination-port'] || 0) };
            const m = natMatch(S.run.t, f), W = view();
            log({ nattest: f, res: m ? m.name : null });
            if (!m) return { text: '# [Simülatör] Eşleşen NAT kuralı yok: adresler çevrilmez.', res: null };
            const L2 = [];
            if (m.st instanceof Map) L2.push('Source-NAT: Rule matched: ' + m.name, f.src + ':' + (A['source-port'] || 0) + ' => ' + snatIp(W, m) + ':' + (20000 + (ip2n(f.src) % 30000)) + ' (' + A.protocol + ')');
            if (m.dt instanceof Map) { const ta = m.dt.get('translated-address') || '', o = (W.t.get('address') || new Map()).get(ta), ip = o && o.get('ip-netmask') ? pfx(o.get('ip-netmask')).ip : pfx(ta) ? pfx(ta).ip : ta; L2.push('Destination-NAT: Rule matched: ' + m.name, f.dst + ':' + f.dport + ' => ' + ip + ':' + (m.dt.get('translated-port') || f.dport) + ' (' + A.protocol + ')'); }
            if (!L2.length) L2.push('# [Simülatör] ' + m.name + ' kuralı eşleşti ama çeviri tanımlı değil (no-NAT).');
            return { res: m.name, text: L2.join('\n') };
        }
        function sessions(args) {
            const Fl = {};
            let i = 0;
            if (args[0]) { const k = pick(args[0].t, ['filter']); if (!k.ok) return { err: 0 }; i = 1; }
            for (; i < args.length; i++) {
                const k = pick(args[i].t, ['source', 'destination', 'destination-port', 'from', 'to', 'application', 'state', 'count', 'rule', 'protocol']);
                if (!k.ok || !args[i + 1]) return { err: args[i + 1] ? i : i + 1 };
                Fl[k.ok] = args[++i].t;
            }
            const W = view(), rows = [];
            let id = 45001;
            (SIM.flows || []).forEach(f0 => {
                const f = Object.assign({ proto: 'tcp', sport: 51234 }, f0), d = decide(f); id++;
                if (!['allowed', 'denied', 'nonat'].includes(d.stage)) return;
                const state = d.stage === 'denied' ? 'DISCARD' : 'ACTIVE';
                if (Fl.source && Fl.source !== f.src) return; if (Fl.destination && Fl.destination !== f.dst) return;
                if (Fl['destination-port'] && +Fl['destination-port'] !== f.dport) return; if (Fl.from && Fl.from !== d.from) return; if (Fl.to && Fl.to !== d.to) return;
                if (Fl.application && Fl.application !== d.app) return; if (Fl.state && Fl.state.toUpperCase() !== state) return; if (Fl.rule && Fl.rule !== d.rule) return;
                const sn = d.snat ? snatIp(W, d.snat) : f.src, sp = d.snat ? 20000 + (id % 30000) : f.sport;
                rows.push(pad(String(id), 13) + pad(d.app, 15) + pad(state, 8) + pad('FLOW', 5) + pad(d.snat ? 'NS' : d.dst2 !== f.dst ? 'ND' : '', 5) + f.src + '[' + f.sport + ']/' + d.from + '/' + ({ tcp: 6, udp: 17, icmp: 1 })[f.proto] + '  (' + sn + '[' + sp + '])',
                    pad('vsys1', 46) + f.dst + '[' + f.dport + ']/' + d.to + '  (' + d.dst2 + '[' + d.dport2 + '])');
            });
            if (Fl.count) return { text: 'Number of sessions that match filter: ' + rows.length / 2 };
            return { text: ['--------------------------------------------------------------------------------', 'ID          Application    State   Type Flag  Src[Sport]/Zone/Proto (translated IP[Port])', 'Vsys                                          Dst[Dport]/Zone (translated IP[Port])', '--------------------------------------------------------------------------------'].concat(rows).join('\n') };
        }
        function cfgShowText(cfg, path, fmt) {
            if (fmt === 'set') return setLinesAt(ROOT, cfg, path, { brackSet: true }).join('\n');
            return render(stmtsAt(ROOT, cfg, path, STY), 2).join('\n');
        }
        function cfgDiff() {
            const A = stmts(ROOT, ROOT, S.run.t, [], S.run.ia, STY), B = stmts(ROOT, ROOT, S.cand.t, [], S.cand.ia, STY);
            const d = diff(A, B, [], [], 2);
            return d.length ? '# [Simülatör] Fark özet biçimde gösterilir: "-" running, "+" candidate.\n' + d.join('\n') : '';
        }
        function ping(args) {
            // ping [source <ip>] host <ip> [count N]
            let src = null, h = null, count = 5;
            for (let i = 0; i < args.length; i++) {
                const k = pick(args[i].t, ['host', 'source', 'count', 'interval', 'size', 'no-resolve']);
                if (!k.ok) return { err: i };
                if (k.ok === 'no-resolve') continue;
                if (!args[i + 1]) return { err: i + 1 };
                const v = args[++i].t;
                if (k.ok === 'host') { if (!isIp(v)) return { err: i }; h = v; } else if (k.ok === 'source') { if (!isIp(v)) return { err: i }; src = v; } else if (k.ok === 'count') { if (!/^\d+$/.test(v)) return { err: i }; count = Math.min(+v, 10); }
            }
            if (!h) return { err: args.length };
            const W = view(), L2 = ['PING ' + h + ' (' + h + ') ' + (src ? 'from ' + src + ' ' : '') + ': 56(84) bytes of data.'];
            let ok = false;
            if (!src) { ok = (SIM.mgmtReach || []).includes(h); if (!ok) L2.unshift('# [Simülatör] Kaynak verilmedi: ping yönetim arayüzünden (MGT) çıkar. Veri arayüzünden denemek için "ping source <arayüz-IP> host <hedef>".'); }
            else {
                const me = W.ifs.find(x => x.up && x.ips.some(a => pfx(a).ip === src));
                if (!me) { L2.push('ping: bind: Cannot assign requested address'); log({ ping: { ip: h, ok: false } }); return { text: L2.join('\n') }; }
                const r = W.lookup(me.vr, h);
                ok = !!r && (r.flags === 'A C' ? hosts.includes(h) : hosts.includes(r.nh) && hosts.includes(h));
            }
            for (let i = 0; i < count && ok; i++) L2.push('64 bytes from ' + h + ': icmp_seq=' + (i + 1) + ' ttl=64 time=' + (0.9 + (i % 3) * 0.3).toFixed(2) + ' ms');
            L2.push('', '--- ' + h + ' ping statistics ---', count + ' packets transmitted, ' + (ok ? count : 0) + ' received, ' + (ok ? '0' : '100') + '% packet loss, time ' + (count * 1000 - 1) + 'ms');
            log({ ping: { ip: h, ok, src } });
            return { text: L2.join('\n') };
        }

        const OP = { c: {
            show: { d: 'Bilgi göster', c: {
                system: { d: 'Sistem', c: { info: { d: 'Sürüm, model, seri no', run: () => sysInfo() } }, known: ['resources', 'disk-space', 'logdb-quota', 'environmentals', 'software', 'state', 'statistics', 'services', 'last-commit-info', 'setting'] },
                interface: { d: 'Arayüz bilgisi', args: [['all', 'Tüm arayüzler'], ['<ethernet1/N>', 'Tek arayüz'], ['logical', 'Mantıksal arayüzler'], ['hardware', 'Fiziksel arayüzler']], runArgs: a => { if (a.length > 1) return { err: 1 }; const k = pick(a[0].t, ['all', 'logical', 'hardware', 'management']); if (k.ok === 'management') return { text: UNSUP, unsup: true }; if (k.ok) return { text: ifAll() }; const t2 = ifOne(a[0].t); return t2 ? { text: t2 } : { err: 0 }; } },
                routing: { d: 'Yönlendirme', c: { route: { d: 'RIB (yönlendirme tablosu)', run: () => routeTable(false), args: [['type', 'static | connect …']], runArgs: a => { if (!pick(a[0].t, ['type']).ok || !a[1] || !pick(a[1].t, ['static', 'connect', 'host']).ok) return { err: a[1] ? 1 : a.length }; return { text: routeTable(pick(a[1].t, ['static', 'connect', 'host']).ok === 'static') }; } }, fib: { d: 'FIB', run: () => routeTable(false) }, interface: { d: 'Yönlendirme arayüzleri', run: () => UNSUP, unsup: true } }, known: ['summary', 'protocol', 'path-monitor', 'bfd'] },
                config: { d: 'Yapılandırma', c: { running: { d: 'Çalışan (commit edilmiş) yapılandırma', run: () => cfgShowText(S.run, [], S.fmt) }, candidate: { d: 'Aday (candidate) yapılandırma', run: () => cfgShowText(S.cand, [], S.fmt) }, diff: { d: 'Candidate ile running farkı', run: () => cfgDiff() }, pushed: { d: 'Panorama', run: () => UNSUP, unsup: true } } },
                session: { d: 'Oturumlar', c: { all: { d: 'Tüm oturumlar', run: () => sessions([]).text, args: [['filter', 'source/destination/destination-port/from/to/application/state/count']], runArgs: a => sessions(a) }, info: { d: 'Oturum özeti', run: () => UNSUP, unsup: true }, id: { d: 'Tek oturum', run: () => UNSUP, unsup: true } } },
                jobs: { d: 'İş kuyruğu (commit/validate)', c: { all: { d: 'Tüm işler', run: () => ['Enqueued              Dequeued     ID  PositionInQ                              Type                         Status Result Completed', '------------------------------------------------------------------------------------------------------------------------------'].concat(S.jobs.slice().reverse().map(jobLine)).join('\n') }, id: { d: 'İş ayrıntısı', args: [['<id>', 'İş numarası']], runArgs: a => { const j = S.jobs.find(x => String(x.id) === a[0].t); if (!j) return { text: '# [Simülatör] Böyle bir iş yok.', errk: 'value' }; return { text: ['Enqueued              Dequeued     ID  PositionInQ                              Type                         Status Result Completed', '------------------------------------------------------------------------------------------------------------------------------', jobLine(j)].concat(j.errs.length ? ['Warnings:', 'Details:'].concat(j.errs) : ['Warnings:', 'Details:', 'Configuration committed successfully'].slice(0, j.type === 'Commit' ? 3 : 2)).join('\n') }; } } } },
                clock: { d: 'Saat', run: () => SIMCLK(S.job).replace(' ', ' ') + ' UTC' },
            }, known: ['counter', 'high-availability', 'vpn', 'user', 'log', 'arp', 'mac', 'zone-protection', 'running', 'admins', 'ntp', 'dns-proxy', 'global-protect-gateway', 'neighbor', 'lldp', 'transceiver', 'rule-hit-count', 'advanced-routing', 'netstat', 'vlan', 'dos-protection', 'config-locks'] },
            test: { d: 'Test (kural eşleşmesi, rota)', c: {
                'security-policy-match': { d: 'Bir akışın eşleşeceği güvenlik kuralı (running)', args: [['from', '<zone>'], ['to', '<zone>'], ['source', '<IP>'], ['destination', '<IP>'], ['destination-port', '<port>'], ['protocol', '<6|17|1>'], ['application', '<app>']], runArgs: a => secTest(a) },
                'nat-policy-match': { d: 'Bir akışın eşleşeceği NAT kuralı (running)', args: [['from', '<zone>'], ['to', '<zone> (pre-NAT)'], ['source', '<IP>'], ['destination', '<IP> (pre-NAT)'], ['destination-port', '<port>'], ['protocol', '<6|17|1>']], runArgs: a => natTest(a) },
                routing: { d: 'Yönlendirme testleri', c: { 'fib-lookup': { d: 'Bir hedef için FIB araması', args: [['virtual-router', '<ad>'], ['ip', '<A.B.C.D>']], runArgs: a => fibLookup(a) } } },
            }, known: ['vpn', 'authentication', 'decryption-policy-match', 'pbf-policy-match', 'dos-policy-match', 'url', 'url-info-cloud', 'arp', 'user-id', 'qos-policy-match'] },
            configure: { d: 'Yapılandırma moduna geç', run: () => { S.mode = 'cfg'; S.edit = []; S.editStack = []; return 'Entering configuration mode\n[edit]'; } },
            ping: { d: 'ICMP testi: ping [source <ip>] host <ip>', args: [['host', '<IP>'], ['source', 'Veri arayüzü IP\'si'], ['count', 'Paket sayısı']], runArgs: a => ping(a) },
            set: { d: 'CLI ayarları', c: { cli: { d: 'CLI oturum ayarları', c: {
                'config-output-format': { d: 'Yapılandırma çıktı biçimi', args: [['default', 'Hiyerarşik (süslü parantez)'], ['set', 'set komutları'], ['xml', 'XML'], ['json', 'JSON']], runArgs: a => { const k = pick(a[0].t, ['default', 'set', 'xml', 'json']); if (!k.ok || a.length > 1) return { err: k.ok ? 1 : 0 }; if (k.ok === 'xml' || k.ok === 'json') return { text: UNSUP, unsup: true }; S.fmt = k.ok; return { text: '' }; } },
                pager: { d: 'Sayfalama', args: [['on', 'Açık'], ['off', 'Kapalı']], runArgs: a => (pick(a[0].t, ['on', 'off']).ok && a.length === 1 ? { text: '' } : { err: 0 }) },
                'scripting-mode': { d: 'Toplu yapıştırma modu', args: [['on', 'Açık'], ['off', 'Kapalı']], runArgs: a => (pick(a[0].t, ['on', 'off']).ok && a.length === 1 ? { text: '' } : { err: 0 }) },
                'terminal': { d: 'Terminal', run: () => UNSUP, unsup: true },
            } } }, known: ['session', 'system', 'clock', 'management-server', 'panorama', 'ssh-key'] },
            exit: { d: 'Oturumu kapat', run: () => { S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.'; } },
            quit: { d: 'Oturumu kapat', run: () => { S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.'; } },
        }, known: ['request', 'debug', 'clear', 'less', 'tail', 'traceroute', 'scp', 'tftp', 'ssh', 'telnet', 'view-pcap', 'tcpdump', 'grep', 'find', 'delete', 'show-counter', 'schedule', 'target', 'save', 'load'] };

        function opWalk(toks) {
            let node = OP, i = 0; const words = [];
            while (i < toks.length && node.c) {
                const t = toks[i];
                const r = pick(t.t, Object.keys(node.c));
                if (!r.ok) {
                    if (node.runArgs && r.err !== 'amb') break;
                    if (r.err !== 'amb' && node.known && pick(t.t, node.known).ok) return { unsup: true, at: i, words };
                    return { err: r.err === 'amb' ? 'amb' : 'invalid', at: i, hits: r.hits, node, words };
                }
                words.push(r.ok); node = node.c[r.ok]; i++;
            }
            return { node, words, args: toks.slice(i) };
        }
        function opExec(toks, line, raw) {
            // | match / except (PAN-OS de destekler)
            const k = toks.findIndex(x => x.t === '|' && x.sym);
            const main = k < 0 ? toks : toks.slice(0, k), pipes = [];
            if (k >= 0) { const s = toks.slice(k + 1); const m = s[0] && pick(s[0].t, ['match', 'except']); if (!m || !m.ok || !s[1]) { log({ raw, err: 'invalid' }); return INV; } pipes.push({ k: m.ok, a: s.slice(1).map(x => x.t).join(' ') }); }
            const w = opWalk(main);
            if (w.unsup) { log({ raw, err: 'unsupported' }); return UNSUP; }
            if (w.err) {
                log({ raw, err: w.err });
                if (w.at === 0 && w.err !== 'amb') return 'Unknown command: ' + main[0].t;
                if (w.err === 'amb') return '# [Simülatör] \'' + main[w.at].t + '\' belirsiz: ' + w.hits.join(', ');
                return INV;
            }
            const n = w.node, canon = w.words.join(' ') + (w.args.length ? ' ' + w.args.map(x => x.t).join(' ') : '');
            if (w.args.length && n.runArgs) {
                const r = n.runArgs(w.args);
                if (r.err !== undefined) { log({ raw, err: 'invalid' }); return INV; }
                if (r.errk) { log({ raw, err: r.errk }); return r.text; }
                if (r.unsup) { log({ raw, err: 'unsupported' }); return r.text; }
                log({ raw, canon, res: r.res, fmt: S.fmt });
                return pipeFilter(r.text, pipes);
            }
            if (w.args.length) { log({ raw, err: 'invalid' }); return INV; }
            if (n.run) { if (n.unsup) { log({ raw, err: 'unsupported' }); return UNSUP; } const o = n.run(); log({ raw, canon, fmt: S.fmt }); return pipeFilter(o, pipes); }
            log({ raw, err: 'incomplete' });
            return INV;
        }

        const CFG_VERBS = ['set', 'delete', 'edit', 'up', 'top', 'exit', 'quit', 'show', 'commit', 'validate', 'revert', 'move', 'run', 'rename', 'copy', 'load', 'save', 'check', 'clone', 'override', 'annotate'];
        const CFG_UNSUP = ['rename', 'copy', 'load', 'save', 'check', 'clone', 'override', 'annotate'];
        const VERB_H = { set: 'Değer ata / nesne oluştur', delete: 'Sil', edit: 'Hiyerarşide bir seviyeye in', up: 'Bir seviye yukarı', top: 'En üst seviye', exit: 'Bir seviye yukarı / yapılandırma modundan çık', quit: 'exit ile aynı', show: 'Candidate yapılandırmayı göster', commit: 'Candidate\'i running yap', validate: 'Commit etmeden doğrula', revert: 'Candidate\'i running\'e geri döndür', move: 'Kural sırasını değiştir', run: 'Operasyonel komut çalıştır', rename: 'Yeniden adlandır', copy: 'Kopyala', load: 'Yükle', save: 'Kaydet', check: 'Kontrol', clone: 'Klonla', override: 'Geçersiz kıl', annotate: 'Not ekle' };
        const cerr = (raw, r, toks) => {
            if (r.err === 'unsupported') { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
            log({ raw, err: r.err === 'value' ? 'value' : r.err === 'amb' ? 'amb' : r.err });
            if (r.err === 'amb') return cfgOut('# [Simülatör] \'' + toks[r.at].t + '\' belirsiz: ' + r.hits.join(', '));
            return cfgOut(INV);
        };
        function cfgExec(toks, line, raw) {
            const vr = pick(toks[0].t, CFG_VERBS);
            if (!vr.ok) { log({ raw, err: vr.err === 'amb' ? 'amb' : 'invalid' }); return cfgOut(vr.err === 'amb' ? '# [Simülatör] \'' + toks[0].t + '\' belirsiz: ' + vr.hits.join(', ') : 'Unknown command: ' + toks[0].t); }
            const v = vr.ok, rest = toks.slice(1);
            if (CFG_UNSUP.includes(v)) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
            if (v === 'run') {
                if (!rest.length) { log({ raw, err: 'incomplete' }); return cfgOut(INV); }
                if (pick(rest[0].t, ['configure']).ok) { log({ raw, err: 'invalid' }); return cfgOut(INV); }
                const o = opExec(rest, line, raw);
                return cfgOut(o);
            }
            if (v === 'top') { if (rest.length) { log({ raw, err: 'invalid' }); return cfgOut(INV); } S.edit = []; log({ raw, canon: 'top' }); return cfgOut(''); }
            if (v === 'up') { S.edit = upOne(S.edit); log({ raw, canon: 'up' }); return cfgOut(''); }
            if (v === 'exit' || v === 'quit') {
                if (S.edit.length) { S.edit = upOne(S.edit); log({ raw, canon: 'exit' }); return cfgOut(''); }
                S.mode = 'op'; S.edit = [];
                log({ raw, canon: 'exit configuration-mode', uncommitted: !sameCfg() });
                return 'Exiting configuration mode';
            }
            if (v === 'commit') {
                for (let i = 0; i < rest.length; i++) {
                    const k = pick(rest[i].t, ['force', 'description', 'partial']);
                    if (!k.ok) { log({ raw, err: 'invalid' }); return cfgOut(INV); }
                    if (k.ok === 'partial') { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
                    if (k.ok === 'description') { if (!rest[i + 1]) { log({ raw, err: 'incomplete' }); return cfgOut(INV); } i++; }
                }
                return cfgOut(doCommit(raw));
            }
            if (v === 'validate') {
                if (!rest[0] || pick(rest[0].t, ['full', 'partial']).ok !== 'full' || rest.length > 1) { log({ raw, err: rest[0] ? 'invalid' : 'incomplete' }); return cfgOut(rest[0] && pick(rest[0].t, ['partial']).ok ? UNSUP : INV); }
                const id = S.job++, errs = validate(S.cand);
                S.jobs.push({ id, type: 'Validate', ok: !errs.length, n: id, errs });
                log({ raw, canon: 'validate full', validate: errs.length ? 'fail' : 'ok' });
                return cfgOut('Validate job enqueued with jobid ' + id + '\n' + id);
            }
            if (v === 'revert') {
                if (!rest[0] || pick(rest[0].t, ['config']).ok !== 'config' || rest.length > 1) { log({ raw, err: rest[0] ? 'invalid' : 'incomplete' }); return cfgOut(INV); }
                S.cand = cfgClone(S.run); log({ raw, canon: 'revert config' });
                return cfgOut('');
            }
            if (v === 'show') {
                const r = parse(ROOT, S.edit, rest, 'show');
                if (!r.ok) return cerr(raw, r, rest);
                const path = r.leaves.length ? r.leaves[r.leaves.length - 1].at.concat([r.leaves[r.leaves.length - 1].kw]) : r.path;
                log({ raw, canon: 'show' + (path.length ? ' ' + path.join(' ') : ''), fmt: S.fmt });
                return cfgOut(cfgShowText(S.cand, path, S.fmt));
            }
            if (v === 'move') {
                // move rulebase security rules A before|after B | top | bottom
                const wi = rest.findIndex(x => ['before', 'after', 'top', 'bottom'].includes(x.t));
                if (wi < 0) { log({ raw, err: 'incomplete' }); return cfgOut(INV); }
                const r = parse(ROOT, S.edit, rest.slice(0, wi), 'show');
                if (!r.ok || r.end !== 'inst' || r.leaves.length) { log({ raw, err: 'invalid' }); return cfgOut(INV); }
                const nm = r.path[r.path.length - 1], parent = getIn(S.cand.t, r.path.slice(0, -1)), w2 = rest[wi].t, ref = rest[wi + 1];
                if (!(parent instanceof Map) || !parent.has(nm)) { log({ raw, err: 'value' }); return cfgOut(INV); }
                if ((w2 === 'before' || w2 === 'after') && (!ref || !parent.has(ref.t) || rest.length > wi + 2)) { log({ raw, err: ref ? 'value' : 'incomplete' }); return cfgOut(INV); }
                if ((w2 === 'top' || w2 === 'bottom') && rest.length > wi + 1) { log({ raw, err: 'invalid' }); return cfgOut(INV); }
                const ent = [...parent].filter(([k]) => k !== nm), me = [nm, parent.get(nm)];
                const idx = w2 === 'top' ? 0 : w2 === 'bottom' ? ent.length : ent.findIndex(([k]) => k === ref.t) + (w2 === 'after' ? 1 : 0);
                ent.splice(idx, 0, me); parent.clear(); ent.forEach(([k, x]) => parent.set(k, x));
                log({ raw, canon: 'move ' + r.path.join(' ') + ' ' + w2 + (ref && (w2 === 'before' || w2 === 'after') ? ' ' + ref.t : '') });
                return cfgOut('');
            }
            if (!rest.length) { log({ raw, err: 'incomplete' }); return cfgOut(INV); }
            const r = parse(ROOT, S.edit, rest, v === 'set' ? 'set' : v === 'edit' ? 'edit' : 'delete');
            if (!r.ok) return cerr(raw, r, rest);
            if (v === 'edit') {
                if (r.leaves.length || r.end === 'list') { log({ raw, err: 'invalid' }); return cfgOut(INV); }
                S.edit = r.path; log({ raw, canon: 'edit ' + r.path.join(' ') }); return cfgOut('');
            }
            if (v === 'set') {
                if (!r.leaves.length && (r.end === 'list' || (r.end === 'c' && !r.sch.pres))) { log({ raw, err: 'incomplete' }); return cfgOut(INV); }
                if (r.leaves.some(l => l.sch.t === 'pw')) { log({ raw, err: 'unsupported' }); return cfgOut(UNSUP); }
                applySet(ROOT, S.cand.t, r);
                log({ raw, canon: 'set ' + canonOf(r) });
                return cfgOut('');
            }
            if (v === 'delete') {
                const ok = applyDelete(ROOT, S.cand.t, r);
                log({ raw, canon: 'delete ' + canonOf(r), warn: ok ? undefined : 'notfound' });
                return cfgOut('');
            }
            log({ raw, err: 'invalid' }); return cfgOut(INV);
        }
        function canonOf(r) {
            if (!r.leaves.length) return r.path.join(' ');
            const out = []; let cur = [];
            r.leaves.forEach(l => { out.push(...l.at.slice(cur.length)); cur = l.at; out.push(l.kw); if (l.vals.length) out.push(...(l.vals.length > 1 ? ['[', ...l.vals, ']'] : l.vals)); });
            return out.concat(r.path.slice(cur.length)).join(' ');
        }
        function upOne(path) {
            if (!path.length) return path;
            const gp = path.length >= 2 ? schAt(ROOT, path.slice(0, -2)) : null;
            if (gp && gp.c && gp.c[path[path.length - 2]] && gp.c[path[path.length - 2]].t === 'l') return path.slice(0, -2);
            return path.slice(0, -1);
        }
        const sameCfg = () => setLines(ROOT, ROOT, S.cand.t, [], null, {}).join('\n') === setLines(ROOT, ROOT, S.run.t, [], null, {}).join('\n');

        function input(raw0) {
            const raw = String(raw0).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; return p.fn(raw); }
            if (S.loggedOut) { S.loggedOut = false; return lab.loginBanner || ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim() || line === '\x1a') return S.mode === 'cfg' ? cfgOut('') : '';
            const toks = tok(line);
            if (toks[0].sym) { log({ raw: raw.trim(), err: 'invalid' }); return S.mode === 'cfg' ? cfgOut(INV) : INV; }
            if (S.mode === 'op') {
                if (pick(toks[0].t, ['commit', 'validate', 'revert']).ok && toks[0].t.length > 2) { log({ raw: raw.trim(), err: 'mode' }); return '# [Simülatör] Bu komut yapılandırma modunda çalışır: önce "configure".'; }
                return opExec(toks, line, raw.trim());
            }
            return cfgExec(toks, line, raw.trim());
        }
        function candidates(line) {
            const trailing = line === '' || /\s$/.test(line);
            const toks = tok(line), done = trailing ? toks : toks.slice(0, -1), part = trailing ? '' : toks[toks.length - 1].t;
            const opRows = d => {
                const w = opWalk(d);
                if (w.err || w.unsup) return null;
                const n = w.node, rows = [];
                const lastA = w.args.length ? w.args[w.args.length - 1].t : null, pa = lastA && n.args ? n.args.find(a => a[0] === lastA && a[0][0] !== '<') : null;
                if (pa && w.args.length % 2 === 1 && n.args.every(a => a[0][0] !== '<' || a === n.args[0])) {
                    // parametre adından sonra değer bekleniyor
                    const zones = [...(getIn(S.run.t, ['zone']) || new Map()).keys()];
                    return { rows: (['from', 'to'].includes(pa[0]) ? zones.concat(['any']).map(z => [' ', z, '']) : []).concat([[' ', /^</.test(pa[1]) ? pa[1].split(' ')[0] : '<değer>', pa[1]]]), part };
                }
                if (n.c && !w.args.length) Object.entries(n.c).forEach(([k, x]) => rows.push([x.c ? '>' : ' ', k, x.d || '']));
                if (n.args) n.args.forEach(a => rows.push([a[0][0] === '<' ? ' ' : '+', a[0], a[1]]));
                if (n.run && !w.args.length) rows.push([' ', '<Enter>', 'Finish input']);
                else if (n.runArgs && w.args.length) rows.push([' ', '<Enter>', 'Finish input']);
                return { rows, part };
            };
            if (S.mode === 'op') return opRows(done);
            if (!done.length) return { rows: CFG_VERBS.map(v => [' ', v, VERB_H[v] || '']), part };
            const vr = pick(done[0].t, CFG_VERBS); if (!vr.ok) return null;
            const rest = done.slice(1);
            if (vr.ok === 'run') return opRows(rest);
            if (vr.ok === 'commit') return { rows: [[' ', 'description', 'Commit açıklaması'], [' ', 'force', 'Zorla commit'], [' ', 'partial', 'Kısmi commit'], [' ', '<Enter>', 'Finish input']], part };
            if (vr.ok === 'validate') return { rows: [[' ', 'full', 'Tam doğrulama'], [' ', 'partial', 'Kısmi doğrulama']], part };
            if (vr.ok === 'revert') return { rows: [[' ', 'config', 'Candidate\'i running\'e döndür']], part };
            if (['up', 'top', 'exit', 'quit'].includes(vr.ok) || CFG_UNSUP.includes(vr.ok)) return { rows: [[' ', '<Enter>', 'Finish input']], part };
            if (vr.ok === 'move') { const wi = rest.findIndex(x => ['before', 'after', 'top', 'bottom'].includes(x.t)); if (wi >= 0) return { rows: [[' ', '<ad>', 'Referans kural']], part }; }
            const r = parse(ROOT, S.edit, rest, 'help');
            if (!r.ok) return null;
            if (r.need) return { rows: valueRows(r.need.sch, ST, r.need.kind), part };
            let rows = schemaRows(r.sch, ST, null, r.path);
            if (vr.ok === 'move' && r.end === 'inst') rows = [[' ', 'before', 'Öncesine'], [' ', 'after', 'Sonrasına'], [' ', 'top', 'En üste'], [' ', 'bottom', 'En alta']];
            else if (r.end === 'inst' || vr.ok !== 'set' || r.leaves.length || r.sch.pres) rows.push([' ', '<Enter>', 'Finish input']);
            return { rows, part };
        }
        function help(line) {
            log({ help: line });
            if (S.pending || S.loggedOut) return '';
            const c = candidates(line);
            if (!c) return S.mode === 'op' && tok(line).length <= 1 ? 'Unknown command: ' + ((tok(line)[0] || {}).t || '') : INV;
            const p = c.part.toLowerCase(), rows = c.rows.filter(r => !p || String(r[1]).toLowerCase().startsWith(p));
            const use = rows.length ? rows : c.rows.filter(r => /^</.test(r[1]) && r[1] !== '<Enter>');
            if (!use.length) return INV;
            return use.map(r => (r[0] === '>' ? '> ' : r[0] === '+' ? '+ ' : '  ') + pad(r[1], 22) + r[2]).join('\n') + (S.mode === 'cfg' ? '\n' + editBanner() : '');
        }
        function complete(line) {
            if (S.pending || S.loggedOut || line === '' || /\s$/.test(line)) return null;
            const c = candidates(line); if (!c) return null;
            const toks = tok(line), last = toks[toks.length - 1];
            const hits = [...new Set(c.rows.map(r => String(r[1])).filter(w => !/^</.test(w) && w.toLowerCase().startsWith(last.t.toLowerCase())))];
            return hits.length === 1 ? line.slice(0, last.o) + hits[0] + ' ' : null;
        }

        // başlangıç: lab.start + varyant.start commit edilir; pending candidate'te kalır
        function boot(lines, commit) {
            S.mode = 'cfg'; S.edit = [];
            lines.forEach(l => input(l));
            if (commit) S.run = cfgClone(S.cand);
            S.mode = 'op'; S.edit = [];
        }
        boot((lab.hostname ? ['set deviceconfig system hostname ' + lab.hostname] : []).concat(lab.start || [], (S.variant && S.variant.start) || []), true);
        if (S.variant && S.variant.pending) boot(S.variant.pending, false);
        if (lab.pending) boot(lab.pending, false);
        S.ev = [];

        const E = evApi(S);
        const val = (path, which) => getIn((which === 'cand' ? S.cand : S.run).t, typeof path === 'string' ? path.split(' ') : path);
        return {
            vendor: 'paloalto',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            _toRoot: () => { S.mode = 'op'; S.edit = []; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => S.variant, ev: E,
            get model() { return { running: S.run, cand: S.cand, mode: S.mode, edit: S.edit, fmt: S.fmt, jobs: S.jobs }; },
            mode: () => S.mode, fmt: () => S.fmt,
            val, has: (p, w) => val(p, w) !== undefined,
            committed: () => sameCfg(),
            decide: (f, which) => decide(f, which === 'cand' ? S.cand : undefined),
            mgmtAllows: (i, svc) => mgmtAllows(i, svc), hostname: () => host(),
            rules: (kind, which) => [...((getIn((which === 'cand' ? S.cand : S.run).t, ['rulebase', kind || 'security', 'rules'])) || new Map()).keys()],
            route: (ip, vr) => { const r = view().lookup(vr || 'default', ip); return r ? { iface: r.iface, nh: r.nh, flags: r.flags } : null; },
            iface: n => ifo(view(), n),
            showRun: () => cfgShowText(S.run, [], 'default') + '\n' + cfgShowText(S.cand, [], 'set'),
        };
    }

    return { junos: { session: junosSession }, panos: { session: panSession }, _core: { tok, parse, stmts, render, diff, setLines } };
})();
// Motor kayıt defteri
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'juniper': CgLabSetCli.junos, 'paloalto': CgLabSetCli.panos });
if (typeof module !== 'undefined') module.exports = CgLabSetCli;
