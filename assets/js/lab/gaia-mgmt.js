'use strict';
// ─── CLI Lab: Check Point yönetim API'si (mgmt_cli) simülasyonu ───────────────
// Standalone kurulum varsayımı: yönetim sunucusu ve gateway aynı kutuda (lab'lar expert moddan mgmt_cli çalıştırır).
// Model: yayınlanmış (published) veritabanı + tek bir API oturumu (login … > dosya, -s dosya) + gateway'e kurulu (installed) politika.
// Oturumsuz (-r true, -s yok) komut kendi oturumunu açar, çalışır ve otomatik yayınlanır.
// Kapsam: host, network (+ otomatik Hide NAT), group, service-tcp/udp, access-rule (Network katmanı), publish/discard, install-policy.
// Çıktılar sadeleştirilmiştir; biçimi kesin olmayan satırlar "[Simülatör]" etiketi taşır.
const CgGaiaMgmt = (function () {
    const clone = o => JSON.parse(JSON.stringify(o));
    const BUILTIN_SVC = { http: 'tcp/80', https: 'tcp/443', ssh: 'tcp/22', telnet: 'tcp/23', smtp: 'tcp/25', 'domain-udp': 'udp/53', 'domain-tcp': 'tcp/53', ftp: 'tcp/21', 'ssh_version_2': 'tcp/22' };
    const ACTIONS = { accept: 'Accept', drop: 'Drop', reject: 'Reject' };

    function create(o) {
        // o: { gw, isIp, inNet, netOf, n2ip, pkg, layer }
        const GW = o.gw, PKG = o.pkg || 'Standard', LAYER = o.layer || 'Network';
        let uidN = 0x3f1a0;
        const uid = () => '6c4e' + (uidN++).toString(16) + '-5b2a-4d1e-9f0c-2a7e1c' + (100000 + uidN).toString().slice(-6);
        const emptyDb = () => ({ objects: {}, rules: [{ uid: uid(), name: 'Cleanup rule', src: ['Any'], dst: ['Any'], svc: ['Any'], action: 'Drop', track: 'None', enabled: true }] });
        const S = { pub: emptyDb(), installed: null, installTime: null, sess: null, installs: 0, publishes: 0, lastPublishTime: null };
        const TIMES = ['24Sep2026 10:21:14', '24Sep2026 10:24:52', '24Sep2026 10:27:31', '24Sep2026 10:30:05', '24Sep2026 10:33:40', '24Sep2026 10:36:12'];

        const err = (code, msg) => ({ err: 'value', msg: 'code: "' + code + '"\nmessage: "' + msg + '"' });
        const notFound = n => err('generic_err_object_not_found', 'Requested object [' + n + '] not found');
        const eqi = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

        // ── argüman ayrıştırma: anahtar değer çiftleri; "source.1 X source.2 Y" listeleri; -r/-s/--format bayrakları
        function parse(argv) {
            const kv = {}, flags = {};
            for (let i = 0; i < argv.length; i++) {
                const k = argv[i];
                if (k === '>') { flags.redirect = argv[++i]; continue; }
                if (/^-(r|s|u|p|d|m)$/.test(k) || /^--(format|root|session-id|user|password|domain|port)$/.test(k)) { flags[k.replace(/^-+/, '')] = argv[++i]; continue; }
                if (/^-/.test(k)) return { bad: k };
                if (i + 1 >= argv.length) return { bad: k, missing: true };
                kv[k] = argv[++i];
            }
            return { kv, flags };
        }
        const list = (kv, key) => {
            if (kv[key] !== undefined) return [kv[key]];
            const out = [];
            for (let i = 1; kv[key + '.' + i] !== undefined; i++) out.push(kv[key + '.' + i]);
            return out;
        };

        // ── nesne çözümleme (kural kaynağı/hedefi → CIDR listesi, servis → proto/port)
        function cidrs(db, name, seen) {
            if (eqi(name, 'Any')) return ['any'];
            const x = db.objects[name];
            if (!x) return [];
            if (x.type === 'host') return [x.ip + '/32'];
            if (x.type === 'network') return [x.subnet + '/' + x.len];
            if (x.type === 'group') { seen = seen || new Set(); if (seen.has(name)) return []; seen.add(name); return [].concat(...x.members.map(m => cidrs(db, m, seen))); }
            return [];
        }
        function svcs(db, name) {
            if (eqi(name, 'Any')) return ['any'];
            if (BUILTIN_SVC[name]) return [BUILTIN_SVC[name]];
            const x = db.objects[name];
            if (x && (x.type === 'service-tcp' || x.type === 'service-udp')) return [x.type.slice(-3) + '/' + x.port];
            return [];
        }
        const known = (db, n, kind) => eqi(n, 'Any') || (kind === 'svc' ? (!!BUILTIN_SVC[n] || (db.objects[n] && /^service-/.test(db.objects[n].type))) : (db.objects[n] && !/^service-/.test(db.objects[n].type)));

        function objOut(x) {
            const L = ['uid: "' + x.uid + '"', 'name: "' + x.name + '"', 'type: "' + x.type + '"'];
            if (x.type === 'host') L.push('ipv4-address: "' + x.ip + '"');
            if (x.type === 'network') L.push('subnet4: "' + x.subnet + '"', 'mask-length4: ' + x.len);
            if (x.type === 'group') L.push('members:', ...x.members.map(m => '- name: "' + m + '"'));
            if (/^service-/.test(x.type)) L.push('port: "' + x.port + '"');
            if (x.nat) L.push('nat-settings:', '  auto-rule: true', '  method: "' + x.nat.method + '"', '  hide-behind: "gateway"');
            L.push('# [Simülatör] Çıktı kısaltıldı (domain, meta-info, color… alanları gösterilmiyor).');
            return L.join('\n');
        }
        const pos = (db, kv) => {
            const n = db.rules.length;
            if (kv['position.above'] !== undefined || kv['position.below'] !== undefined) {
                const ref = kv['position.above'] !== undefined ? kv['position.above'] : kv['position.below'];
                const i = db.rules.findIndex(r => eqi(r.name, ref) || String(db.rules.indexOf(r) + 1) === ref);
                if (i < 0) return { e: notFound(ref) };
                return { i: kv['position.above'] !== undefined ? i : i + 1 };
            }
            const p = kv.position;
            if (p === undefined) return { e: err('generic_err_missing_required_parameters', 'Missing parameter: [position]') };
            if (p === 'top') return { i: 0 };
            if (p === 'bottom') return { i: n };
            if (/^\d+$/.test(p) && +p >= 1 && +p <= n + 1) return { i: +p - 1 };
            return { e: err('err_validation_failed', 'Invalid position [' + p + ']') };
        };
        const findRule = (db, kv) => {
            if (kv.name !== undefined) return db.rules.findIndex(r => r.name === kv.name);
            if (kv['rule-number'] !== undefined) return /^\d+$/.test(kv['rule-number']) ? +kv['rule-number'] - 1 : -1;
            if (kv.uid !== undefined) return db.rules.findIndex(r => r.uid === kv.uid);
            return -2;
        };
        function ruleFields(db, kv, r) {
            for (const [k, lk] of [['source', 'src'], ['destination', 'dst'], ['service', 'svc']]) {
                const v = list(kv, k);
                if (!v.length) continue;
                for (const n of v) if (!known(db, n, lk === 'svc' ? 'svc' : 'net')) return notFound(n);
                r[lk] = v;
            }
            if (kv.action !== undefined) { const a = ACTIONS[String(kv.action).toLowerCase()]; if (!a) return err('err_validation_failed', 'Invalid action [' + kv.action + ']'); r.action = a; }
            if (kv['track.type'] !== undefined) r.track = kv['track.type'];
            if (kv.track !== undefined) r.track = kv.track;
            if (kv.enabled !== undefined) r.enabled = !/^false$/i.test(kv.enabled);
            if (kv['new-name'] !== undefined) r.name = kv['new-name'];
            return null;
        }

        // ── komutlar (db: oturumun çalışma kopyası)
        function run(db, verb, type, kv) {
            const O = db.objects;
            const layerOk = () => (kv.layer === undefined || eqi(kv.layer, LAYER) || eqi(kv.layer, PKG + ' ' + LAYER)) ? null : notFound(kv.layer);
            if (verb === 'add' && ['host', 'network', 'group', 'service-tcp', 'service-udp'].includes(type)) {
                const n = kv.name;
                if (!n) return err('generic_err_missing_required_parameters', 'Missing parameter: [name]');
                if (O[n] || BUILTIN_SVC[n] || eqi(n, 'Any')) return err('err_validation_failed', 'Validation failed with 1 error:\nError: More than one object named \'' + n + '\' exists.');
                const x = { uid: uid(), name: n, type };
                if (type === 'host') { const ip = kv['ip-address'] || kv['ipv4-address']; if (!ip || !o.isIp(ip)) return err('generic_err_invalid_parameter', 'Invalid parameter for [ip-address]'); x.ip = ip; }
                if (type === 'network') {
                    const sn = kv.subnet || kv.subnet4, len = +(kv['mask-length'] || kv['mask-length4']);
                    if (!sn || !o.isIp(sn) || !(len >= 1 && len <= 32)) return err('generic_err_invalid_parameter', 'Invalid parameter for [subnet]/[mask-length]');
                    if (o.n2ip(o.netOf(sn, len)) !== sn) return err('err_validation_failed', 'Validation failed with 1 error:\nError: Subnet ' + sn + '/' + len + ' is not a network address');
                    x.subnet = sn; x.len = len;
                }
                if (type === 'group') { const m = list(kv, 'members'); for (const y of m) if (!O[y] || /^service-/.test(O[y].type)) return notFound(y); x.members = m; }
                if (/^service-/.test(type)) { if (!/^\d{1,5}$/.test(kv.port || '') || +kv.port > 65535) return err('generic_err_invalid_parameter', 'Invalid parameter for [port]'); x.port = kv.port; }
                const nz = natFields(x, kv); if (nz) return nz;
                O[n] = x; return { out: objOut(x), change: 'add ' + type + ' ' + n };
            }
            if (verb === 'set' && ['host', 'network', 'group'].includes(type)) {
                const x = O[kv.name];
                if (!x || x.type !== type) return notFound(kv.name);
                if (type === 'host' && (kv['ip-address'] || kv['ipv4-address'])) { const ip = kv['ip-address'] || kv['ipv4-address']; if (!o.isIp(ip)) return err('generic_err_invalid_parameter', 'Invalid parameter for [ip-address]'); x.ip = ip; }
                if (type === 'group' && list(kv, 'members').length) { const m = list(kv, 'members'); for (const y of m) if (!O[y]) return notFound(y); x.members = m; }
                if (type === 'group' && kv['members.add'] !== undefined) { if (!O[kv['members.add']]) return notFound(kv['members.add']); if (!x.members.includes(kv['members.add'])) x.members.push(kv['members.add']); }
                const nz = natFields(x, kv); if (nz) return nz;
                return { out: objOut(x), change: 'set ' + type + ' ' + x.name };
            }
            if (verb === 'delete' && ['host', 'network', 'group', 'service-tcp', 'service-udp'].includes(type)) {
                const x = O[kv.name];
                if (!x || x.type !== type) return notFound(kv.name);
                const used = db.rules.some(r => r.src.concat(r.dst, r.svc).includes(x.name)) || Object.values(O).some(g => g.type === 'group' && g.members.includes(x.name));
                if (used) return err('err_validation_failed', 'Validation failed with 1 error:\nError: Object ' + x.name + ' is used by other objects or rules and cannot be deleted.\n# [Simülatör] Önce kullanıldığı yerden çıkarın (where-used).');
                delete O[kv.name]; return { out: 'message: "OK"', change: 'delete ' + type + ' ' + x.name };
            }
            if (verb === 'add' && type === 'access-rule') {
                const le = layerOk(); if (le) return le;
                if (kv.layer === undefined) return err('generic_err_missing_required_parameters', 'Missing parameter: [layer]');
                const p = pos(db, kv); if (p.e) return p.e;
                const r = { uid: uid(), name: kv.name || '', src: ['Any'], dst: ['Any'], svc: ['Any'], action: 'Drop', track: 'None', enabled: true };
                const fe = ruleFields(db, kv, r); if (fe) return fe;
                db.rules.splice(p.i, 0, r);
                return { out: 'uid: "' + r.uid + '"\nname: "' + r.name + '"\ntype: "access-rule"\naction:\n  name: "' + r.action + '"\n# [Simülatör] Çıktı kısaltıldı.', change: 'add access-rule ' + (r.name || r.uid) };
            }
            if ((verb === 'set' || verb === 'delete') && type === 'access-rule') {
                const le = layerOk(); if (le) return le;
                const i = findRule(db, kv);
                if (i === -2) return err('generic_err_missing_required_parameters', 'Missing parameter: [name] or [rule-number] or [uid]');
                if (i < 0 || i >= db.rules.length) return notFound(kv.name || kv['rule-number'] || kv.uid);
                const r = db.rules[i];
                if (verb === 'delete') { db.rules.splice(i, 1); return { out: 'message: "OK"', change: 'delete access-rule ' + (r.name || i + 1) }; }
                if (kv['new-position'] !== undefined || kv['new-position.above'] !== undefined || kv['new-position.below'] !== undefined) {
                    db.rules.splice(i, 1);
                    const p = pos(db, { position: kv['new-position'], 'position.above': kv['new-position.above'], 'position.below': kv['new-position.below'] });
                    if (p.e) { db.rules.splice(i, 0, r); return p.e; }
                    db.rules.splice(p.i, 0, r);
                }
                const fe = ruleFields(db, kv, r); if (fe) return fe;
                return { out: 'uid: "' + r.uid + '"\nname: "' + r.name + '"\ntype: "access-rule"\n# [Simülatör] Çıktı kısaltıldı.', change: 'set access-rule ' + (r.name || i + 1) };
            }
            if (verb === 'show') return showCmd(db, type, kv);
            return null;
        }
        function natFields(x, kv) {
            const ar = kv['nat-settings.auto-rule'], m = kv['nat-settings.method'], hb = kv['nat-settings.hide-behind'];
            if (ar === undefined && m === undefined && hb === undefined) return null;
            if (/^false$/i.test(ar || '')) { delete x.nat; return null; }
            if (x.type !== 'network' && x.type !== 'host') return err('generic_err_invalid_parameter', 'nat-settings is not supported for ' + x.type);
            if (m && !eqi(m, 'hide')) return { err: 'unsupported', msg: '# [Simülatör] Bu lab sürümünde yalnız otomatik Hide NAT (nat-settings.method hide) desteklenir.' };
            if (hb && !eqi(hb, 'gateway')) return { err: 'unsupported', msg: '# [Simülatör] Bu lab sürümünde hide-behind yalnız "gateway" desteklenir.' };
            if (!/^true$/i.test(ar || '') || !m) return err('generic_err_missing_required_parameters', 'Missing parameter: nat-settings.auto-rule true and nat-settings.method are required');
            x.nat = { method: 'hide', behind: 'gateway' };
            return null;
        }
        const cell = (a, w) => { a = String(a); return a.length >= w ? a.slice(0, w - 1) + ' ' : a + ' '.repeat(w - a.length); };
        function rbText(rules) {
            const L = [cell('No.', 5) + cell('Name', 22) + cell('Source', 18) + cell('Destination', 18) + cell('Services', 14) + cell('Action', 8) + 'Track'];
            rules.forEach((r, i) => L.push(cell(i + 1, 5) + cell((r.enabled ? '' : '[x] ') + r.name, 22) + cell(r.src.join(','), 18) + cell(r.dst.join(','), 18) + cell(r.svc.join(','), 14) + cell(r.action, 8) + r.track));
            return L;
        }
        function showCmd(db, type, kv) {
            const O = db.objects;
            if (type === 'access-rulebase') {
                if (kv.name === undefined || !(eqi(kv.name, LAYER) || eqi(kv.name, PKG + ' ' + LAYER))) return notFound(kv.name || '(name)');
                const pend = !S.installed || JSON.stringify(S.pub) !== JSON.stringify(S.installed);
                return { out: rbText(db.rules).concat(['# [Simülatör] Gerçek çıktı YAML/JSON\'dur; burada tablo olarak sadeleştirildi. [x] = devre dışı kural.',
                    '# [Simülatör] Gateway ' + GW + ': ' + (pend ? 'yayınlanmış ama KURULMAMIŞ değişiklik var (SmartConsole\'da gateway durumunda ve Install Policy uyarısında görünür).' : 'kurulu politika yayınlanmış sürümle aynı.')]).join('\n'), log: { showrb: true } };
            }
            if (['hosts', 'networks', 'groups', 'services-tcp'].includes(type)) {
                const t = { hosts: 'host', networks: 'network', groups: 'group', 'services-tcp': 'service-tcp' }[type];
                const xs = Object.values(O).filter(x => x.type === t);
                return 'objects:\n' + xs.map(x => '- name: "' + x.name + '"' + (x.ip ? '  ipv4-address: "' + x.ip + '"' : x.subnet ? '  subnet4: "' + x.subnet + '/' + x.len + '"' : '')).join('\n') + (xs.length ? '' : '  (boş)') + '\ntotal: ' + xs.length + '\n# [Simülatör] Çıktı kısaltıldı.';
            }
            if (['host', 'network', 'group', 'service-tcp', 'service-udp'].includes(type)) {
                const x = O[kv.name];
                if (!x || x.type !== type) return notFound(kv.name);
                return objOut(x);
            }
            return null;
        }

        // ── üst düzey: mgmt_cli <verb> [type] args…
        const NOTYPE = ['login', 'logout', 'publish', 'discard', 'install-policy', 'show-session', 'show-changes'];
        function cmd(argv, raw) {
            if (argv.length < 2) return { err: 'incomplete', msg: 'Usage: mgmt_cli <command> [parameters] [flags]\n# [Simülatör] Örnek: mgmt_cli -r true show hosts' };
            // bayraklar komuttan önce de gelebilir (mgmt_cli -r true show hosts)
            const pre = []; let i = 1;
            while (i < argv.length && /^-/.test(argv[i])) { pre.push(argv[i], argv[i + 1]); i += 2; }
            let verb = argv[i], type = null, rest;
            if (!verb) return { err: 'incomplete', msg: 'Usage: mgmt_cli <command> [parameters] [flags]' };
            const m = verb.match(/^(add|set|delete|show)-(.+)$/);
            if (m) { verb = m[1]; type = m[2]; rest = argv.slice(i + 1); }
            else if (NOTYPE.includes(verb)) rest = argv.slice(i + 1);
            else if (['add', 'set', 'delete', 'show'].includes(verb)) { type = argv[i + 1]; rest = argv.slice(i + 2); if (!type) return { err: 'incomplete', msg: 'Usage: mgmt_cli ' + verb + ' <object-type> [parameters]' }; }
            else return err('generic_err_command_not_found', 'The command [' + verb + '] was not found');
            const P = parse(pre.concat(rest));
            if (P.bad) return P.missing ? err('generic_err_invalid_syntax', 'Missing value for parameter [' + P.bad + ']') : err('generic_err_invalid_syntax', 'Unknown flag [' + P.bad + ']');
            const { kv, flags } = P;
            if (flags.format && flags.format !== 'text') return { err: 'unsupported', msg: '# [Simülatör] Bu lab\'da çıktı yalnız varsayılan (text) biçimde gösterilir.' };
            if (flags.u || flags.p || flags.user || flags.password) return { err: 'unsupported', msg: '# [Simülatör] Bu lab\'da kullanıcı/parola ile giriş yerine yönetim sunucusunda "-r true" (root) kullanılır. Parolayı komut satırına yazmak, bash geçmişine düşürür.' };
            const root = flags.r === 'true' || flags.root === 'true', sfile = flags.s || flags['session-id'];

            if (verb === 'login') {
                if (!root) return err('generic_err_missing_required_parameters', 'Missing credentials: use -r true on the management server');
                if (!flags.redirect) return { out: 'sid: "' + uid() + '"\nuid: "' + uid() + '"\nurl: "https://127.0.0.1:443/web_api"\n# [Simülatör] Oturum kimliği ekrana yazıldı; sonraki komutlarda kullanmak için çıktıyı dosyaya yönlendirin: mgmt_cli login -r true > id.txt' };
                if (S.sess && S.sess.dirty) return { err: 'value', msg: '# [Simülatör] Yayınlanmamış değişiklikleri olan açık bir oturum var (' + S.sess.file + '). Önce publish ya da discard edin.' };
                S.sess = { file: flags.redirect, db: clone(S.pub), dirty: false, changes: [] };
                return { out: '', log: { mgmt: 'login' } };
            }
            // oturum seçimi
            let sess = null;
            if (sfile !== undefined) {
                if (!S.sess || S.sess.file !== sfile) return { err: 'value', msg: 'Failed to read session file ' + sfile + '\n# [Simülatör] Önce: mgmt_cli login -r true > ' + sfile };
                sess = S.sess;
            } else if (!root) return err('generic_err_missing_required_parameters', 'Missing credentials: use -r true, or -s <session-file> after login');

            if (verb === 'logout') {
                if (!sess) return { err: 'value', msg: '# [Simülatör] Kapatılacak oturum yok: -s <dosya> verin.' };
                if (sess.dirty) return { err: 'value', msg: '# [Simülatör] Oturumda yayınlanmamış ' + sess.changes.length + ' değişiklik var. Önce publish ya da discard edin.' };
                S.sess = null; return { out: 'message: "OK"', log: { mgmt: 'logout' } };
            }
            if (verb === 'publish') {
                if (!sess) return { out: 'tasks:\n- task-name: "Publish operation"\n  status: "succeeded"\n# [Simülatör] -s olmadan açılan oturumun yayınlanacak değişikliği yok.' };
                if (!sess.dirty) return { out: '# [Simülatör] Oturumda yayınlanacak değişiklik yok.', log: { mgmt: 'publish-empty' } };
                S.pub = clone(sess.db); sess.dirty = false; const n = sess.changes.length; sess.changes = []; S.publishes++; S.lastPublishTime = TIMES[Math.min(S.publishes + S.installs, TIMES.length - 1)];
                return { out: 'tasks:\n- task-id: "' + uid() + '"\n  task-name: "Publish operation"\n  status: "succeeded"\n  progress-percentage: 100\n# [Simülatör] ' + n + ' değişiklik yayınlandı. Gateway\'e ulaşması için install-policy gerekir.', log: { mgmt: 'publish', n } };
            }
            if (verb === 'discard') {
                if (!sess) return { err: 'value', msg: '# [Simülatör] Geri alınacak oturum yok: -s <dosya> verin.' };
                const n = sess.changes.length; sess.db = clone(S.pub); sess.dirty = false; sess.changes = [];
                return { out: 'number-of-discarded-changes: ' + n + '\nmessage: "OK"', log: { mgmt: 'discard', n } };
            }
            if (verb === 'install-policy') {
                const pk = kv['policy-package'], tg = list(kv, 'targets');
                if (!pk) return err('generic_err_missing_required_parameters', 'Missing parameter: [policy-package]');
                if (!eqi(pk, PKG)) return notFound(pk);
                if (!tg.length) return err('generic_err_missing_required_parameters', 'Missing parameter: [targets]');
                for (const t of tg) if (t !== GW) return notFound(t);
                if (/^false$/i.test(kv.access || '')) return { err: 'unsupported', msg: '# [Simülatör] Bu lab\'da erişim politikası kurulur (access true).' };
                S.installs++; S.installed = clone(S.pub); S.installTime = TIMES[Math.min(S.publishes + S.installs, TIMES.length - 1)];
                const pend = S.sess && S.sess.dirty ? S.sess.changes.length : 0;
                return { out: 'tasks:\n- task-id: "' + uid() + '"\n  task-name: "Policy installation - ' + PKG + '"\n  status: "succeeded"\n  progress-percentage: 100\n  task-details:\n  - gatewayName: "' + GW + '"\n    statusDescription: "Policy installed successfully"'
                    + (pend ? '\n# [Simülatör] DİKKAT: oturumunuzda yayınlanmamış ' + pend + ' değişiklik var; kurulan politika yalnız YAYINLANMIŞ sürümdür, bu değişiklikler gateway\'e gitmedi.' : '') + '\n# [Simülatör] Çıktı kısaltıldı.', log: { mgmt: 'install', pend } };
            }
            // nesne/kural komutları
            const db = sess ? sess.db : clone(S.pub);
            const r = run(db, verb, type, kv);
            if (r === null) return { err: 'unsupported', msg: '# [Simülatör] "' + verb + ' ' + type + '" bu lab sürümünde desteklenmiyor. Desteklenenler: host, network, group, service-tcp/udp, access-rule, access-rulebase; publish, discard, install-policy.' };
            if (r.err) return r;
            if (typeof r === 'string') return { out: r, log: { mgmt: 'show ' + type } };
            if (r.change) {
                if (sess) { sess.dirty = true; sess.changes.push(r.change); }
                else {
                    // açık oturum yayınlanmış veriyi görür: aynı değişikliği oturumun çalışma kopyasına da uygula
                    if (S.sess) run(S.sess.db, verb, type, kv);
                    S.pub = db; S.publishes++; S.lastPublishTime = TIMES[Math.min(S.publishes + S.installs, TIMES.length - 1)]; r.out += '\n# [Simülatör] -s olmadan: komut kendi oturumunda çalıştı ve otomatik yayınlandı.'; }
                return { out: r.out, log: { mgmt: verb + ' ' + type, change: r.change, sess: !!sess } };
            }
            return { out: r.out, log: Object.assign({ mgmt: verb + ' ' + type }, r.log || {}) };
        }

        // ── gateway tarafı: kurulu politikadan kurallar ve otomatik Hide NAT
        function rules() {
            if (!S.installed) return null;
            const db = S.installed;
            return db.rules.map((r, i) => ({ n: i + 1, name: r.name, enabled: r.enabled, src: [].concat(...r.src.map(x => cidrs(db, x))), dst: [].concat(...r.dst.map(x => cidrs(db, x))),
                svc: [].concat(...r.svc.map(x => svcs(db, x))), act: r.action === 'Accept' ? 'accept' : 'drop' })).filter(r => r.enabled);
        }
        function nat(wan) {
            if (!S.installed) return null;
            return Object.values(S.installed.objects).filter(x => x.nat).map(x => ({ src: x.type === 'host' ? x.ip + '/32' : x.subnet + '/' + x.len, out: wan }));
        }
        // kural eşleşmesi (fw up_execute): ilk eşleşen etkin kural
        function upExecute(f, svcMatch) {
            const R = rules();
            if (!R) return null;
            for (const r of R) if (r.src.some(c => o.inNet(f.src, c)) && r.dst.some(c => o.inNet(f.dst, c)) && svcMatch(r.svc, f)) return r;
            return { n: null, act: 'drop' };
        }
        return {
            cmd, rules, nat, upExecute,
            policy: () => (S.installed ? { name: PKG, date: S.installTime } : null),
            // lab kontrolleri için
            pub: () => S.pub, installed: () => S.installed, sess: () => S.sess,
            // başlangıç: yayınla ve kur (lab.mgmtStart komutları -r true ile çalışır)
            // late: kurulumdan SONRA yayınlanan (gateway'e henüz gitmemiş) değişiklikler
            boot: (lines, install, late) => {
                const exec = l => { const a = l.split(/\s+/); const r = cmd(['mgmt_cli', '-r', 'true'].concat(a.slice(a[0] === 'mgmt_cli' ? 1 : 0)), l); if (r && r.err) throw new Error('mgmtStart hatalı: ' + l + ' → ' + r.msg); };
                lines.forEach(exec);
                if (install) { S.installed = clone(S.pub); S.installTime = '24Sep2026 09:12:40'; }
                (late || []).forEach(exec);
                S.publishes = 0; S.installs = 0;
            }
        };
    }
    return { create };
})();
(typeof window !== 'undefined' ? window : globalThis).CgGaiaMgmt = CgGaiaMgmt;
if (typeof module !== 'undefined') module.exports = CgGaiaMgmt;
