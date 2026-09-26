'use strict';
// ─── CLI Lab: Check Point parti 3 eklentisi (cp-24…cp-27) ─────────────────────
// gaia-mgmt.js'e dokunmadan mgmt_cli'ye yeni nesne ve kural türleri ekler (eklenti API'si: gaia.js "Eklenti noktası"):
//   service-group (add/set/delete/show, show service-groups; members.add/members.remove), where-used (indirect true),
//   access-section (add/set/delete/show; access-rule position.top/bottom "<section>", new-position.top/bottom),
//   time (add/set/delete/show; access-rule "time"), nat-rule (add/set/delete/show, show nat-rulebase; method hide/static).
// Gateway tarafı: kurulu politikadaki manuel NAT kuralları ve zaman nesneleri trafiğe yansır; gelen (dışarıdan) akışlar
// için Static NAT (hedef çevirisi) fw monitor'de i → I arasında görünür. Yalnız lab.sim.p3 tanımlı lab'larda etkindir;
// diğer lab'ların çıktıları değişmez (eklenti undefined döner, yerleşik komut çalışır).
// Kaynak (sözdizimi): Check Point Management API Reference örnekleri (add-service-group, where-used, add-access-section,
// add-access-rule "position.bottom <section>", add-time, add-nat-rule) ve check_point.mgmt Ansible modülleri
// (cp_mgmt_service_group, cp_mgmt_where_used, cp_mgmt_access_section, cp_mgmt_time, cp_mgmt_nat_rule: method static|hide|nat64|nat46|cgnat).
// Manuel NAT + local.arp: R81.20 Quantum Security Gateway Admin Guide s. 186. Zaman nesnesi: R81.20 SmartConsole Help s. 594.
// Tablo biçimindeki çıktılar sadeleştirilmiştir ve "[Simülatör]" etiketi taşır (gerçek çıktı YAML/JSON).
(function () {
    const G = typeof window !== 'undefined' ? window : globalThis;
    const BUILTIN = { http: 'tcp/80', https: 'tcp/443', ssh: 'tcp/22', telnet: 'tcp/23', smtp: 'tcp/25', 'domain-udp': 'udp/53', 'domain-tcp': 'tcp/53', ftp: 'tcp/21', 'ssh_version_2': 'tcp/22' };
    const METHODS = ['static', 'hide', 'nat64', 'nat46', 'cgnat'];
    const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const eqi = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
    const err = (code, msg) => ({ err: 'value', msg: 'code: "' + code + '"\nmessage: "' + msg + '"' });
    const notFound = n => err('generic_err_object_not_found', 'Requested object [' + n + '] not found');
    const missing = p => err('generic_err_missing_required_parameters', 'Missing parameter: [' + p + ']');
    const cell = (a, w) => { a = String(a); return a.length >= w ? a.slice(0, w - 1) + ' ' : a + ' '.repeat(w - a.length); };
    const SHORT = '# [Simülatör] Çıktı kısaltıldı (uid, domain, meta-info… alanları gösterilmiyor).';

    function parse(argv) {
        const kv = {}, flags = {};
        let i = 1;
        while (i < argv.length && /^-/.test(argv[i])) { flags[argv[i].replace(/^-+/, '')] = argv[i + 1]; i += 2; }
        let verb = argv[i], type = null;
        const m = /^(add|set|delete|show)-(.+)$/.exec(verb || '');
        if (m) { verb = m[1]; type = m[2]; i++; }
        else if (['add', 'set', 'delete', 'show'].includes(verb)) { type = argv[i + 1]; i += 2; }
        else i++;
        for (; i < argv.length; i++) {
            const k = argv[i];
            if (k === '>') { flags.redirect = argv[++i]; continue; }
            if (/^-/.test(k)) { flags[k.replace(/^-+/, '')] = argv[++i]; continue; }
            if (i + 1 >= argv.length) return null;
            kv[k] = argv[++i];
        }
        return { verb, type, kv, flags };
    }
    const list = (kv, key) => {
        if (kv[key] !== undefined) return [kv[key]];
        const out = [];
        for (let i = 1; kv[key + '.' + i] !== undefined; i++) out.push(kv[key + '.' + i]);
        return out;
    };
    const P3 = db => { db.p3 = db.p3 || { sec: [], nat: [] }; return db.p3; };

    // ── bölümler (access-section): { uid, name, at: ilk kuralın uid'i | null (sonda) }; dizi sırası = başlık sırası
    const ridx = (db, u) => { if (u === null) return db.rules.length; const i = db.rules.findIndex(r => r.uid === u); return i < 0 ? db.rules.length : i; };
    const findSec = (db, n) => P3(db).sec.findIndex(s => eqi(s.name, n) || s.uid === n);
    const secEnd = (db, j) => { const S = P3(db).sec; let e = db.rules.length; for (let k = j + 1; k < S.length; k++) e = Math.min(e, ridx(db, S[k].at)); return e; };
    function secOf(db, ruleName) {
        const i = db.rules.findIndex(r => r.name === ruleName); if (i < 0) return null;
        let cur = null; P3(db).sec.forEach(s => { if (ridx(db, s.at) <= i) cur = s.name; }); return cur;
    }
    // k konumuna yeni kural (uid R) girdi: hedef bölüme kadar (dahil) aynı çapaya bağlı başlıklar R'ye taşınır
    function reanchor(db, j, oldAt, R) { P3(db).sec.forEach((s, k) => { if (k <= j && s.at === oldAt) s.at = R; }); }
    // bir kural yerinden çıkacaksa (silme/taşıma) ona bağlı başlıklar sonraki kurala geçer
    function unanchor(db, uid) { const i = db.rules.findIndex(r => r.uid === uid); const nx = db.rules[i + 1] ? db.rules[i + 1].uid : null; P3(db).sec.forEach(s => { if (s.at === uid) s.at = nx; }); }
    function secPos(db, which, name) {  // → { k, j, oldAt } ya da { e }
        const j = findSec(db, name); if (j < 0) return { e: notFound(name) };
        const S = P3(db).sec, k = which === 'top' ? ridx(db, S[j].at) : secEnd(db, j);
        return { k, j, oldAt: db.rules[k] ? db.rules[k].uid : null };
    }

    // ── nesne kullanım yerleri (where-used ve silme koruması)
    function usage(db, name) {
        const O = db.objects, objs = [], rules = [], nats = [];
        Object.values(O).forEach(x => { if ((x.type === 'group' || x.type === 'service-group') && (x.members || []).includes(name)) objs.push(x); });
        db.rules.forEach((r, i) => { if (r.src.concat(r.dst, r.svc, r.time || []).includes(name)) rules.push({ r, n: i + 1 }); });
        P3(db).nat.forEach((r, i) => { if ([r.osrc, r.odst, r.osvc, r.tsrc, r.tdst, r.tsvc].includes(name)) nats.push({ r, n: i + 1 }); });
        return { objs, rules, nats };
    }

    // ── yazdırma
    function rbText(db, MG) {
        const S = P3(db).sec, L = [cell('No.', 5) + cell('Name', 22) + cell('Source', 18) + cell('Destination', 18) + cell('Services', 14) + cell('Action', 8) + cell('Track', 6) + 'Time'];
        db.rules.forEach((r, i) => {
            S.filter(s => ridx(db, s.at) === i).forEach(s => L.push('---- ' + s.name + ' ----'));
            L.push(cell(i + 1, 5) + cell((r.enabled ? '' : '[x] ') + r.name, 22) + cell(r.src.join(','), 18) + cell(r.dst.join(','), 18) + cell(r.svc.join(','), 14) + cell(r.action, 8) + cell(r.track, 6) + ((r.time || []).join(',') || 'Any'));
        });
        S.filter(s => s.at === null || ridx(db, s.at) >= db.rules.length).forEach(s => L.push('---- ' + s.name + ' ----'));
        const pend = !MG.installed() || JSON.stringify(MG.pub()) !== JSON.stringify(MG.installed());
        return L.concat(['# [Simülatör] Gerçek çıktı YAML/JSON\'dur; burada tablo olarak sadeleştirildi. "---- ad ----" = bölüm (access-section) başlığı, [x] = devre dışı kural.',
            '# [Simülatör] Gateway: ' + (pend ? 'yayınlanmış ama KURULMAMIŞ değişiklik var.' : 'kurulu politika yayınlanmış sürümle aynı.')]).join('\n');
    }
    function natText(db, MG) {
        const L = [cell('No.', 5) + cell('Name', 14) + cell('Orig.Src', 12) + cell('Orig.Dst', 13) + cell('Orig.Svc', 9) + cell('Trans.Src', 13) + cell('Trans.Dst', 13) + 'Method'];
        P3(db).nat.forEach((r, i) => L.push(cell(i + 1, 5) + cell((r.enabled ? '' : '[x] ') + r.name, 14) + cell(r.osrc, 12) + cell(r.odst, 13) + cell(r.osvc, 9) + cell(r.tsrc, 13) + cell(r.tdst, 13) + r.method));
        const auto = Object.values(db.objects).filter(x => x.nat);
        if (auto.length) L.push('# [Simülatör] Nesnelerden üretilen otomatik kurallar:'), auto.forEach(x => L.push('  (auto) ' + x.name + ' → ' + x.nat.method + ' behind gateway'));
        if (!P3(db).nat.length && !auto.length) L.push('  (NAT kuralı yok)');
        const pend = !MG.installed() || JSON.stringify(MG.pub()) !== JSON.stringify(MG.installed());
        return L.concat(['# [Simülatör] Tablo sadeleştirildi; "Original" = çevrilmiyor.', '# [Simülatör] Gateway: ' + (pend ? 'yayınlanmış ama KURULMAMIŞ değişiklik var.' : 'kurulu politika yayınlanmış sürümle aynı.')]).join('\n');
    }
    const objOut = x => ['uid: "' + x.uid + '"', 'name: "' + x.name + '"', 'type: "' + x.type + '"'].concat(
        x.type === 'service-group' ? ['members:'].concat(x.members.map(m => '- name: "' + m + '"')) : [],
        x.type === 'time' ? ['hours-ranges:'].concat(x.hours.map((h, i) => '- index: ' + (i + 1) + '\n  enabled: ' + h.en + '\n  from: "' + h.from + '"\n  to: "' + h.to + '"'), ['recurrence:', '  pattern: "' + x.pattern + '"', '  weekdays: [' + x.days.map(d => '"' + d + '"').join(', ') + ']']) : [],
        [SHORT]).join('\n');

    // ── komutlar (db: çalışma kopyası). Dönüş: { out, change } | { out } | { err, msg }
    function run(db, p, uid) {
        const { verb, type, kv } = p, O = db.objects, X = P3(db);
        const isSvc = n => !!BUILTIN[n] || (O[n] && /^service-/.test(O[n].type));
        if (type === 'service-group') {
            if (verb === 'add') {
                const n = kv.name; if (!n) return missing('name');
                if (O[n] || BUILTIN[n]) return err('err_validation_failed', 'Validation failed with 1 error:\nError: More than one object named \'' + n + '\' exists.');
                const m = list(kv, 'members'); for (const y of m) if (!isSvc(y)) return notFound(y);
                O[n] = { uid: uid(), name: n, type, members: m }; return { out: objOut(O[n]), change: 'add service-group ' + n };
            }
            const x = O[kv.name]; if (!x || x.type !== type) return notFound(kv.name);
            if (verb === 'show') return { out: objOut(x) };
            if (verb === 'delete') return delObj(db, x);
            const m = list(kv, 'members'); for (const y of m) if (!isSvc(y)) return notFound(y);
            if (m.length) x.members = m;
            for (const y of list(kv, 'members.add')) { if (!isSvc(y)) return notFound(y); if (y === x.name) return err('err_validation_failed', 'Group cannot contain itself'); if (!x.members.includes(y)) x.members.push(y); }
            for (const y of list(kv, 'members.remove')) { if (!x.members.includes(y)) return err('err_validation_failed', 'Validation failed with 1 error:\nError: ' + y + ' is not a member of ' + x.name); x.members = x.members.filter(z => z !== y); }
            return { out: objOut(x), change: 'set service-group ' + x.name };
        }
        if (type === 'time') {
            const hr = () => { const H = []; for (let i = 1; kv['hours-ranges.' + i + '.from'] !== undefined || kv['hours-ranges.' + i + '.to'] !== undefined; i++) {
                const f = kv['hours-ranges.' + i + '.from'], t = kv['hours-ranges.' + i + '.to'];
                if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t || '')) return { e: err('generic_err_invalid_parameter', 'Invalid parameter for [hours-ranges.' + i + '] (HH:MM)') };
                H.push({ from: f, to: t, en: !/^false$/i.test(kv['hours-ranges.' + i + '.enabled'] || 'true') }); } return { H }; };
            const rec = x => {
                if (kv['recurrence.pattern'] !== undefined) { const pt = ['Daily', 'Weekly', 'Monthly'].find(v => eqi(v, kv['recurrence.pattern'])); if (!pt) return err('generic_err_invalid_parameter', 'Invalid parameter for [recurrence.pattern] (Daily, Weekly, Monthly)'); x.pattern = pt; }
                if (x.pattern === 'Monthly') return { err: 'unsupported', msg: '# [Simülatör] Bu lab\'da Monthly deseni desteklenmiyor; Daily ya da Weekly kullanın.' };
                const d = list(kv, 'recurrence.weekdays'); for (const y of d) if (!DAYS.includes(y)) return err('generic_err_invalid_parameter', 'Invalid parameter for [recurrence.weekdays] (Sun, Mon … Sat)');
                if (d.length) x.days = d;
                return null;
            };
            if (verb === 'add') {
                const n = kv.name; if (!n) return missing('name');
                if (O[n]) return err('err_validation_failed', 'Validation failed with 1 error:\nError: More than one object named \'' + n + '\' exists.');
                const h = hr(); if (h.e) return h.e;
                const x = { uid: uid(), name: n, type, hours: h.H, pattern: 'Daily', days: DAYS.slice() };
                const e = rec(x); if (e) return e;
                O[n] = x; return { out: objOut(x), change: 'add time ' + n };
            }
            const x = O[kv.name]; if (!x || x.type !== type) return notFound(kv.name);
            if (verb === 'show') return { out: objOut(x) };
            if (verb === 'delete') return delObj(db, x);
            const h = hr(); if (h.e) return h.e; if (h.H.length) x.hours = h.H;
            const e = rec(x); if (e) return e;
            return { out: objOut(x), change: 'set time ' + x.name };
        }
        if (type === 'access-section') {
            if (kv.layer === undefined) return missing('layer');
            if (!eqi(kv.layer, 'Network')) return notFound(kv.layer);
            if (verb === 'add') {
                const n = kv.name; if (!n) return missing('name');
                if (findSec(db, n) >= 0) return err('err_validation_failed', 'Validation failed with 1 error:\nError: More than one section named \'' + n + '\' exists.');
                const S = X.sec, R = db.rules; let at, ai;
                const afterIdx = k => { let i = 0; while (i < S.length && ridx(db, S[i].at) < k) i++; return i; };
                if (kv.position === 'top') { at = R[0] ? R[0].uid : null; ai = 0; }
                else if (kv.position === 'bottom') { at = null; ai = S.length; }
                else if (/^\d+$/.test(kv.position || '') && +kv.position >= 1 && +kv.position <= R.length + 1) { const k = +kv.position - 1; at = R[k] ? R[k].uid : null; ai = afterIdx(k); }
                else if (kv['position.above'] !== undefined || kv['position.below'] !== undefined) {
                    const ref = kv['position.above'] !== undefined ? kv['position.above'] : kv['position.below'], above = kv['position.above'] !== undefined;
                    const j = findSec(db, ref), ri = R.findIndex(r => r.name === ref);
                    if (j >= 0) { if (above) { at = S[j].at; ai = j; } else { const k = secEnd(db, j); at = R[k] ? R[k].uid : null; ai = j + 1; } }
                    else if (ri >= 0) { const k = above ? ri : ri + 1; at = R[k] ? R[k].uid : null; ai = above ? afterIdx(k + 1) : afterIdx(k); }
                    else return notFound(ref);
                } else return kv.position === undefined ? missing('position') : err('err_validation_failed', 'Invalid position [' + kv.position + ']');
                const s = { uid: uid(), name: n, at }; S.splice(ai, 0, s);
                return { out: 'uid: "' + s.uid + '"\nname: "' + n + '"\ntype: "access-section"\n' + SHORT, change: 'add access-section ' + n };
            }
            const j = findSec(db, kv.name || kv.uid || ''); if (j < 0) return notFound(kv.name || kv.uid || '(name)');
            const s = X.sec[j];
            if (verb === 'show') return { out: 'uid: "' + s.uid + '"\nname: "' + s.name + '"\ntype: "access-section"\n' + SHORT };
            if (verb === 'delete') { X.sec.splice(j, 1); return { out: 'message: "OK"\n# [Simülatör] Bölüm başlığı silindi; kuralları üstteki bölüme geçti.', change: 'delete access-section ' + s.name }; }
            if (kv['new-name'] !== undefined) s.name = kv['new-name'];
            return { out: 'uid: "' + s.uid + '"\nname: "' + s.name + '"\ntype: "access-section"\n' + SHORT, change: 'set access-section ' + s.name };
        }
        if (type === 'nat-rule' || type === 'nat-rulebase') {
            if (kv.package === undefined) return missing('package');
            if (!eqi(kv.package, 'standard')) return notFound(kv.package);
            if (type === 'nat-rulebase') return verb === 'show' ? { out: null, nat: true } : null;
            const addr = n => eqi(n, 'Any') || (O[n] && ['host', 'network', 'group'].includes(O[n].type));
            const fields = r => {
                for (const [k, f, kind] of [['original-source', 'osrc', 'a'], ['original-destination', 'odst', 'a'], ['original-service', 'osvc', 's'], ['translated-source', 'tsrc', 't'], ['translated-destination', 'tdst', 't'], ['translated-service', 'tsvc', 'ts']]) {
                    const v = kv[k]; if (v === undefined) continue;
                    const ok = kind === 'a' ? addr(v) : kind === 's' ? (eqi(v, 'Any') || isSvc(v)) : kind === 't' ? (eqi(v, 'Original') || (O[v] && ['host', 'network'].includes(O[v].type))) : (eqi(v, 'Original') || isSvc(v));
                    if (!ok) return notFound(v);
                    r[f] = /^(any|original)$/i.test(v) ? (kind === 'a' || kind === 's' ? 'Any' : 'Original') : v;
                }
                if (kv.method !== undefined) { const m = String(kv.method).toLowerCase(); if (!METHODS.includes(m)) return err('generic_err_invalid_parameter', 'Invalid parameter for [method]. Valid values: static, hide, nat64, nat46, cgnat'); if (!['static', 'hide'].includes(m)) return { err: 'unsupported', msg: '# [Simülatör] Bu lab\'da yalnız method static ve hide desteklenir.' }; r.method = m; }
                if (kv.enabled !== undefined) r.enabled = !/^false$/i.test(kv.enabled);
                if (kv['new-name'] !== undefined) r.name = kv['new-name'];
                if (kv.comments !== undefined) r.comments = kv.comments;
                if (r.method === 'hide' && r.tdst !== 'Original') return err('err_validation_failed', 'Validation failed with 1 error:\nError: Hide NAT translates the source only (translated-destination must be Original)');
                if (r.method === 'hide' && r.tsrc !== 'Original' && O[r.tsrc] && O[r.tsrc].type !== 'host') return err('err_validation_failed', 'Validation failed with 1 error:\nError: Hide NAT translated-source must be a single address (host)');
                return null;
            };
            const find = () => { if (kv.name !== undefined) return X.nat.findIndex(r => r.name === kv.name); if (kv['rule-number'] !== undefined) return /^\d+$/.test(kv['rule-number']) ? +kv['rule-number'] - 1 : -1; if (kv.uid !== undefined) return X.nat.findIndex(r => r.uid === kv.uid); return -2; };
            const out = r => 'uid: "' + r.uid + '"\nname: "' + r.name + '"\ntype: "nat-rule"\nmethod: "' + r.method + '"\noriginal-source: "' + r.osrc + '"\noriginal-destination: "' + r.odst + '"\ntranslated-source: "' + r.tsrc + '"\ntranslated-destination: "' + r.tdst + '"\n' + SHORT;
            if (verb === 'add') {
                const n = X.nat.length; let i;
                if (kv.position === 'top') i = 0; else if (kv.position === 'bottom') i = n;
                else if (/^\d+$/.test(kv.position || '') && +kv.position >= 1 && +kv.position <= n + 1) i = +kv.position - 1;
                else if (kv['position.above'] !== undefined || kv['position.below'] !== undefined) { const ref = kv['position.above'] !== undefined ? kv['position.above'] : kv['position.below']; const k = X.nat.findIndex(r => r.name === ref); if (k < 0) return notFound(ref); i = kv['position.above'] !== undefined ? k : k + 1; }
                else return kv.position === undefined ? missing('position') : err('err_validation_failed', 'Invalid position [' + kv.position + ']');
                const r = { uid: uid(), name: kv.name || '', enabled: true, osrc: 'Any', odst: 'Any', osvc: 'Any', tsrc: 'Original', tdst: 'Original', tsvc: 'Original', method: 'static', comments: '' };
                const e = fields(r); if (e) return e;
                if (r.tsrc === 'Original' && r.tdst === 'Original' && r.tsvc === 'Original') return { out: out(r) + '\n# [Simülatör] Uyarı: hiçbir alan çevrilmiyor (No-NAT kuralı).', change: 'add nat-rule ' + (r.name || r.uid), rule: r, i };
                return { out: out(r), change: 'add nat-rule ' + (r.name || r.uid), rule: r, i };
            }
            const i = find(); if (i === -2) return missing('name] or [rule-number');
            if (i < 0 || i >= X.nat.length) return notFound(kv.name || kv['rule-number'] || kv.uid);
            const r = X.nat[i];
            if (verb === 'show') return { out: out(r) };
            if (verb === 'delete') { X.nat.splice(i, 1); return { out: 'message: "OK"', change: 'delete nat-rule ' + (r.name || i + 1) }; }
            const c = JSON.parse(JSON.stringify(r)), e = fields(c); if (e) return e;
            Object.assign(r, c); return { out: out(r), change: 'set nat-rule ' + (r.name || i + 1) };
        }
        if (verb === 'where-used') {
            const n = kv.name; if (!n) return missing('name');
            if (!O[n] && !BUILTIN[n]) return notFound(n);
            const u = usage(db, n), L = ['used-directly:', '  total: ' + (u.objs.length + u.rules.length + u.nats.length), '  objects:'];
            u.objs.forEach(x => L.push('  - name: "' + x.name + '"', '    type: "' + x.type + '"'));
            L.push('  access-control-rules:'); u.rules.forEach(x => L.push('  - rule:', '      name: "' + x.r.name + '"', '      type: "access-rule"', '    position: "' + x.n + '"', '    layer: "Network"'));
            L.push('  nat-rules:'); u.nats.forEach(x => L.push('  - rule:', '      name: "' + x.r.name + '"', '      type: "nat-rule"', '    position: "' + x.n + '"', '    package: "standard"'));
            L.push('  threat-prevention-rules: []');
            const ind = /^true$/i.test(kv.indirect || '');
            let indN = 0;
            if (ind) {
                const seen = new Set(), q = u.objs.map(x => x.name), R = [];
                while (q.length) { const g = q.shift(); if (seen.has(g)) continue; seen.add(g); const v = usage(db, g); v.objs.forEach(x => q.push(x.name)); v.rules.forEach(x => R.push(x)); }
                indN = R.length;
                L.push('used-indirectly:', '  total: ' + R.length, '  access-control-rules:'); R.forEach(x => L.push('  - rule:', '      name: "' + x.r.name + '"', '    position: "' + x.n + '"', '    layer: "Network"'));
            }
            L.push('# [Simülatör] Çıktı sadeleştirildi (folder, domain, uid alanları gösterilmiyor). Boş listeler "[]" yerine başlıkla bırakıldı.');
            return { out: L.join('\n'), wu: { name: n, total: u.objs.length + u.rules.length + u.nats.length, ind, indN } };
        }
        return null;
    }
    function delObj(db, x) {
        const u = usage(db, x.name);
        if (u.objs.length || u.rules.length || u.nats.length) return err('err_validation_failed', 'Validation failed with 1 error:\nError: Object ' + x.name + ' is used by other objects or rules and cannot be deleted.\n# [Simülatör] Önce kullanıldığı yerden çıkarın (where-used).');
        delete db.objects[x.name]; return { out: 'message: "OK"', change: 'delete ' + x.type + ' ' + x.name };
    }

    // ── oturum: -s dosyası yerleşik denetimle aynı; hatada undefined (yerleşik komut hatayı kendisi verir)
    function target(MG, p) {
        const f = p.flags;
        if (f.format || f.u || f.p || f.user || f.password) return null;
        const s = f.s || f['session-id'];
        if (s !== undefined) { const x = MG.sess(); return x && x.file === s ? { sess: x, db: x.db } : null; }
        if (f.r !== 'true' && f.root !== 'true') return null;
        return { sess: null, db: MG.pub() };
    }
    function commit(MG, t, r, apply) {
        if (t.sess) { t.sess.dirty = true; t.sess.changes.push(r.change); }
        else { const o = MG.sess(); if (o) apply(o.db); r.out += '\n# [Simülatör] -s olmadan: komut kendi oturumunda çalıştı ve otomatik yayınlandı.'; }
    }
    const MY = ['service-group', 'service-groups', 'time', 'access-section', 'nat-rule', 'nat-rulebase'];

    function mgmt(x, argv, line) {
        const MG = x.MG; if (!MG || !x.SIM.p3) return undefined;
        const p = parse(argv); if (!p) return undefined;
        const R = x.S.rt.p3, uid = R.uid;
        const t = target(MG, p);
        const own = p.verb === 'where-used' || MY.includes(p.type);
        if (!t) return undefined;
        const db = t.db;
        // yerleşik silme: yeni türlerde (service-group, nat-rule, time) kullanılan nesne silinmesin
        if (p.verb === 'delete' && ['host', 'network', 'group', 'service-tcp', 'service-udp'].includes(p.type)) {
            const o = db.objects[p.kv.name];
            if (o && o.type === p.type) { const u = usage(db, o.name); if (u.objs.some(y => y.type === 'service-group') || u.nats.length || u.rules.some(y => (y.r.time || []).includes(o.name))) return delObj(db, o); }
            return undefined;
        }
        if (p.type === 'service-groups' && p.verb === 'show') {
            const xs = Object.values(db.objects).filter(o => o.type === 'service-group');
            return { out: 'objects:\n' + xs.map(o => '- name: "' + o.name + '"  members: ' + o.members.length).join('\n') + (xs.length ? '' : '  (boş)') + '\ntotal: ' + xs.length + '\n' + SHORT, log: { mgmt: 'show service-groups' } };
        }
        if (p.type === 'access-rulebase' && p.verb === 'show') {
            if (!P3(db).sec.length && !db.rules.some(r => r.time)) return undefined;
            if (!(eqi(p.kv.name || '', 'Network') || eqi(p.kv.name || '', 'Standard Network'))) return undefined;
            return { out: rbText(db, MG), log: { showrb: true, mgmt: 'show access-rulebase' } };
        }
        if (p.type === 'access-rule' && (p.verb === 'add' || p.verb === 'set' || p.verb === 'delete')) return accessRule(x, MG, p, t, argv, line);
        if (!own) return undefined;
        const r = run(db, p, uid);
        if (r === null) return undefined;
        if (r.err) return r;
        if (r.nat) return { out: natText(db, MG), log: { mgmt: 'show nat-rulebase' } };
        if (r.wu) return { out: r.out, log: { mgmt: 'where-used', wu: r.wu } };
        if (!r.change) return { out: r.out, log: { mgmt: p.verb + ' ' + p.type } };
        if (r.rule) P3(db).nat.splice(r.i, 0, r.rule);
        commit(MG, t, r, d => { const r2 = run(d, p, uid); if (r2 && r2.rule) P3(d).nat.splice(r2.i, 0, r2.rule); });
        return { out: r.out, log: { mgmt: p.verb + ' ' + p.type, change: r.change, sess: !!t.sess } };
    }

    // access-rule: bölüm konumu (position.top/bottom, new-position.top/bottom) ve "time" alanı; geri kalanı yerleşik komut yapar
    function accessRule(x, MG, p, t, argv, line) {
        const kv = p.kv, db = t.db;
        const times = list(kv, 'time');
        const secKey = ['position.top', 'position.bottom', 'new-position.top', 'new-position.bottom'].find(k => kv[k] !== undefined);
        const hasSec = P3(db).sec.length > 0;
        if (!times.length && !secKey && !(hasSec && (p.verb === 'delete' || kv['new-position'] !== undefined || kv['new-position.above'] !== undefined || kv['new-position.below'] !== undefined))) return undefined;
        for (const n of times) if (!eqi(n, 'Any') && (!db.objects[n] || db.objects[n].type !== 'time')) return notFound(n);
        const dbs = () => { const L = [t.db]; if (!t.sess) { const o = MG.sess(); if (o) L.push(o.db); } return L; };
        const strip = keys => { const out = []; for (let i = 0; i < argv.length; i++) { if (keys.some(k => argv[i] === k || argv[i].startsWith(k + '.'))) { i++; continue; } out.push(argv[i]); } return out; };
        const byName = (d, n) => d.rules.find(r => r.name === n);
        if (hasSec && (p.verb === 'delete' || (p.verb === 'set' && !secKey && (kv['new-position'] !== undefined || kv['new-position.above'] !== undefined || kv['new-position.below'] !== undefined)))) {
            // yerinden çıkan kural bir bölümün ilk kuralıysa başlık sonraki kurala geçer
            dbs().forEach(d => { const r = byName(d, kv.name); if (r) unanchor(d, r.uid); });
            if (!times.length) return undefined;
        }
        if (secKey && !kv.name) return missing('name');
        if (secKey && p.verb === 'set' && !byName(db, kv.name)) return notFound(kv.name);
        if (secKey && findSec(db, kv[secKey]) < 0) return notFound(kv[secKey]);
        const which = /top$/.test(secKey || '') ? 'top' : 'bottom';
        if (p.verb === 'add') {
            if (secKey && byName(db, kv.name)) return err('err_validation_failed', 'Validation failed with 1 error:\nError: More than one rule named \'' + kv.name + '\' exists in this layer.');
            let a = strip(['time']);
            if (secKey) { const sp = secPos(db, which, kv[secKey]); a = strip(['time', 'position']); a.push('position', String(sp.k + 1)); }
            const pre = dbs().map(d => secKey ? secPos(d, which, kv[secKey]) : null);
            const r = MG.cmd(a, line);
            if (r && r.err) return r;
            // yerleşik komut -s olmadan pub'ı yeniler: güncel veritabanlarını yeniden al
            const now = t.sess ? [t.sess.db] : [MG.pub()].concat(MG.sess() ? [MG.sess().db] : []);
            now.forEach((d, k) => { const nr = byName(d, kv.name); if (!nr) return; if (times.length) nr.time = times.filter(n => !eqi(n, 'Any')); if (secKey && pre[k]) reanchor(d, pre[k].j, pre[k].oldAt, nr.uid); });
            return r;
        }
        // set
        if (secKey) {
            dbs().forEach(d => {
                const rr = byName(d, kv.name); if (!rr) return;
                unanchor(d, rr.uid); d.rules.splice(d.rules.indexOf(rr), 1);
                const sp = secPos(d, which, kv[secKey]); d.rules.splice(sp.k, 0, rr); reanchor(d, sp.j, sp.oldAt, rr.uid);
            });
        }
        if (times.length) dbs().forEach(d => { const rr = byName(d, kv.name); if (rr) rr.time = times.filter(n => !eqi(n, 'Any')); });
        return MG.cmd(strip(secKey ? ['time', 'new-position'] : ['time']), line);
    }

    // ── gateway tarafı
    const clockOk = (o, ck) => {
        if (!ck) return true;
        if (!o.days.includes(ck.day)) return false;
        const hm = ck.hm, on = o.hours.filter(h => h.en);
        return !on.length || on.some(h => h.from <= h.to ? hm >= h.from && hm < h.to : (hm >= h.from || hm < h.to));
    };
    function svcList(db, n, seen) {
        if (eqi(n, 'Any')) return ['any'];
        if (BUILTIN[n]) return [BUILTIN[n]];
        const o = db.objects[n]; if (!o) return [];
        if (o.type === 'service-tcp' || o.type === 'service-udp') return [o.type.slice(-3) + '/' + o.port];
        if (o.type === 'service-group') { seen = seen || new Set(); if (seen.has(n)) return []; seen.add(n); return [].concat(...o.members.map(m => svcList(db, m, seen))); }
        return [];
    }
    function addrOf(db, n, seen) {
        if (eqi(n, 'Any')) return ['0.0.0.0/0'];
        const o = db.objects[n]; if (!o) return [];
        if (o.type === 'host') return [o.ip + '/32'];
        if (o.type === 'network') return [o.subnet + '/' + o.len];
        if (o.type === 'group') { seen = seen || new Set(); if (seen.has(n)) return []; seen.add(n); return [].concat(...o.members.map(m => addrOf(db, m, seen))); }
        return [];
    }
    const ipOf = (db, n) => { const o = db.objects[n]; return o && o.type === 'host' ? o.ip : null; };

    function init(x) {
        const MG = x.MG, SIM = x.SIM;
        if (!MG || !SIM.p3) return;
        let n = 0x5a10;
        x.S.rt.p3 = { uid: () => '7d3b' + (n++).toString(16) + '-2c4a-4f8e-a1b0-3e9d5c' + (200000 + n).toString().slice(-6) };
        const cfg = SIM.p3;
        const exec = l => { const a = ['mgmt_cli', '-r', 'true'].concat(l.split(/\s+/)); const r = mgmt(x, a, l); const o = r === undefined ? MG.cmd(a, l) : r; if (o && o.err) throw new Error('p3 başlangıç komutu hatalı: ' + l + ' → ' + o.msg); };
        const ob = MG.boot;
        MG.boot = (lines, install, late) => { ob(lines, false, []); P3(MG.pub()); (cfg.start || []).forEach(exec); ob([], install, late); (cfg.late || []).forEach(exec); };
        // kurulu politika: zaman nesnesi dışındaki kurallar düşer, servis grupları açılır
        const orules = MG.rules, onat = MG.nat;
        MG.rules = () => {
            const R = orules(); if (!R) return R;
            const db = MG.installed();
            return R.map(r => { const src = db.rules[r.n - 1]; if (!src) return r; const svc = [].concat(...src.svc.map(s => svcList(db, s))); return Object.assign({}, r, { svc: svc.length ? svc : r.svc, time: src.time }); })
                .filter(r => !(r.time && r.time.length) || r.time.some(tn => db.objects[tn] && clockOk(db.objects[tn], cfg.clock)));
        };
        MG.nat = wan => {
            const base = onat(wan); if (!base) return base;
            const db = MG.installed(), man = [];
            P3(db).nat.filter(r => r.enabled && r.method === 'hide' && r.tsrc !== 'Original').forEach(r => addrOf(db, r.osrc).forEach(c => man.push({ src: c, out: wan, hide: ipOf(db, r.tsrc) })));
            return man.concat(base);
        };
        // gelen akışlar (dışarıdan): hedef çevirisi (Static NAT) istemci tarafında, i ile I arasında
        MG.p3 = {
            secOf: (db, name) => secOf(db, name),
            inDecide: f => inDecide(x, f),
            clock: () => cfg.clock || null,
        };
    }
    function inDecide(x, f) {
        const MG = x.MG, db = MG.installed(), SIM = x.SIM, cfg = SIM.p3;
        f = Object.assign({ sport: 51514, proto: 'tcp', in: SIM.wan || 'eth1' }, f);
        const own = Object.values(x.M().ifs).some(i => i.ip === f.dst);
        if (!own && !(SIM.proxyArp || []).some(p => p.ip === f.dst && p.dev === f.in)) return { stage: 'noarp' };
        const nat = db ? P3(db).nat.find(r => r.enabled && r.method === 'static' && r.tdst !== 'Original' && addrOf(db, r.odst).some(c => x.inNet(f.dst, c)) && addrOf(db, r.osrc).some(c => x.inNet(f.src, c))) : null;
        const tdst = nat ? ipOf(db, nat.tdst) || f.dst : f.dst;
        const ok = (list, d) => list.some(c => c === 'any' || x.inNet(d, c));
        const svcOk = s => s.some(v => { if (v === 'any') return true; const [pr, pt] = v.split('/'); return pr === f.proto && +pt === f.dport; });
        const r = (MG.rules() || []).find(r => ok(r.src, f.src) && (ok(r.dst, f.dst) || ok(r.dst, tdst)) && svcOk(r.svc));
        if (!r || r.act !== 'accept') return { stage: 'rule', rule: r ? r.n : null, nat: !!nat, tdst };
        const rt = x.lookup(tdst);
        if (!rt || rt.dev === f.in || rt.dev === 'lo') return { stage: 'noroute', rule: r.n, nat: !!nat, tdst };
        return { stage: 'fwd', rule: r.n, name: r.name, out: rt.dev, nat: !!nat, tdst, reply: (cfg.servers || []).includes(tdst) ? 'ok' : 'none' };
    }
    function points(x, f) {
        const d = inDecide(x, f), P = [];
        f = Object.assign({ sport: 51514, proto: 'tcp', in: x.SIM.wan || 'eth1' }, f);
        if (d.stage === 'noarp') return P;
        const tries = d.stage === 'fwd' && d.reply === 'ok' ? 1 : 3;
        for (let t = 0; t < tries; t++) {
            const q = { src: f.src, dst: f.dst, sp: f.sport, dp: f.dport, proto: f.proto, fl: '.S....' };
            P.push(Object.assign({ dev: f.in, pt: 'i' }, q));
            if (d.stage !== 'fwd' && d.stage !== 'noroute') continue;
            P.push(Object.assign({ dev: f.in, pt: 'I' }, q, { dst: d.tdst }));
            if (d.stage === 'noroute') continue;
            P.push(Object.assign({ dev: d.out, pt: 'o' }, q, { dst: d.tdst }), Object.assign({ dev: d.out, pt: 'O' }, q, { dst: d.tdst }));
            if (d.reply !== 'ok') continue;
            const a = { src: d.tdst, dst: f.src, sp: f.dport, dp: f.sport, proto: f.proto, fl: '.S..A.', rep: true };
            P.push(Object.assign({ dev: d.out, pt: 'i' }, a), Object.assign({ dev: d.out, pt: 'I' }, a), Object.assign({ dev: f.in, pt: 'o' }, a), Object.assign({ dev: f.in, pt: 'O' }, a, { src: f.dst }));
        }
        return P;
    }
    function expert(x, a) {
        const cfg = x.SIM.p3; if (!cfg) return undefined;
        if (a[0] === 'date' && a.length === 1 && cfg.clock) {
            const ck = cfg.clock; return { out: ck.day + ' ' + (ck.date || 'Sep 24') + ' ' + ck.hm + ':07 UTC 2026\n# [Simülatör] Gateway saati. Zaman nesneli kurallar bu saate (gateway\'in saat dilimine) göre uygulanır.', log: { p3date: true } };
        }
        if (a[0] === 'fw' && a[1] === 'monitor' && cfg.inflows && a[2] === '-e' && a.length === 4) {
            const e = String(a[3]).trim();
            if (!/^accept\b[\s\S]*;$/.test(e)) return undefined;
            const body = e.replace(/^accept\s*/, '').replace(/;$/, '').trim();
            const hs = [...body.matchAll(/host\(\s*([\d.]+)\s*\)/g)].map(m => m[1]);
            const ps = [...body.matchAll(/port\(\s*(\d+)\s*\)/g)].map(m => +m[1]);
            const rest = body.replace(/host\(\s*[\d.]+\s*\)|port\(\s*\d+\s*\)|and|or|,|\s/g, '');
            if (!hs.length || rest || hs.some(h => !x.isIp(h))) return undefined;
            const pk = [];
            cfg.inflows.forEach(f => points(x, f).forEach(p => { if (hs.some(h => p.src === h || p.dst === h) && (!ps.length || ps.some(q => p.sp === q || p.dp === q))) pk.push(p); }));
            const L = ['monitor: getting filter (from command line)', 'monitor: compiling', 'monitorfilter:', 'Compiled OK.', 'monitor: loading', 'monitor: monitoring (control-C to stop)'];
            pk.forEach((p, k) => {
                L.push('[vs_0][fw_' + (k % 2) + '] ' + p.dev + ':' + p.pt + '[60]: ' + p.src + ' -> ' + p.dst + ' (' + (p.proto === 'udp' ? 'UDP' : 'TCP') + ') len=60 id=' + (31207 + k));
                L.push('TCP: ' + p.sp + ' -> ' + p.dp + ' ' + p.fl + ' seq=' + (p.rep ? '2a91c3e0' : '5b7e0d10') + ' ack=' + (p.rep ? '5b7e0d11' : '00000000'));
            });
            L.push('^C', 'monitor: unloading');
            if (!pk.length) L.push('# [Simülatör] Eşleşen paket yok.');
            return { out: L.join('\n'), log: { fwmon: { expr: a[3], F: [], hosts: hs, n: pk.length, p3: pk.map(p => p.dev + ':' + p.pt + ':' + p.dst) } } };
        }
        return undefined;
    }

    G.CG_GAIA_EXT = G.CG_GAIA_EXT || [];
    G.CG_GAIA_EXT.push({ id: 'p3', init, mgmt, expert, roots: [] });
    G.CgGaiaP3 = { secOf };
})();
