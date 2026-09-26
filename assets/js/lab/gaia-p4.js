'use strict';
// ─── CLI Lab: Check Point Gaia eklentisi, parti 4 (cp-28, cp-29, cp-35, cp-36) ───────────────────
// gaia.js'e dokunmadan CG_GAIA_EXT eklenti noktasıyla eklenir; yerleşik komutların çıktısı değişmez.
//  clish : aaa radius-servers / tacacs-servers (add/set/show/delete), rba role (add/show/delete),
//          snapshot-scheduled (settings, recurrence, retention-policy, activation, show)
//  expert: fw log (yalnız lab.sim.p4log varsa), cp_log_export, vgdisplay, lvs
//  mgmt  : show-logs (yalnız lab.sim.p4log varsa), show-last-published-session; publish izlenir (çıktısı aynen döner)
// Kaynaklar: R81.20 Gaia Administration Guide s. 455–464 (rba role), 516–534 (RADIUS/TACACS+), 606–621 (scheduled snapshot);
// R81.20 CLI Reference Guide s. 80–100 (cp_log_export), 1123–1132 (fw log); R81.20 SmartConsole Help s. 267 (Installation History);
// check_point.gaia cp_gaia_radius_server / cp_gaia_tacacs_server / cp_gaia_scheduled_snapshot; check_point.mgmt cp_mgmt_show_logs,
// cp_mgmt_show_last_published_session. Belgede örneği olmayan çıktılar "[Simülatör]" notu taşır.
(function () {
    const G = typeof window !== 'undefined' ? window : globalThis;
    const REG = new WeakMap();
    // Lab kontrolleri için: CgGaiaP4.st(session) → { lx (Log Exporter), revs (yayın geçmişi) }
    const P4 = { st: s => (s && typeof s.files === 'function' ? REG.get(s.files()) || null : null) };
    G.CgGaiaP4 = P4;
    const SIM = '# [Simülatör] ';
    const clone = o => JSON.parse(JSON.stringify(o));
    const isIp = s => /^\d{1,3}(\.\d{1,3}){3}$/.test(s) && s.split('.').every(o => +o <= 255);
    const pad = (s, n) => { s = String(s); return s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length); };
    const numPrio = p => /^-?\d+$/.test(p) && +p >= -999 && +p <= 999;
    const secretBad = s => (/\\/.test(s) ? 'Paylaşılan anahtar ters eğik çizgi (\\) içeremez.' : s.length > 256 ? 'Paylaşılan anahtar en çok 256 karakter olabilir.' : null);
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const WDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    // ── Gaia yapılandırması (M().p4): save config / reboot anlamı için modelde tutulur, ilk kullanımda oluşur
    const A = x => { const m = x.M(); if (!m.p4) m.p4 = { rad: { srv: {}, uid: '0', nas: '' }, tac: { state: 'off', uid: '0', srv: {} }, roles: {}, snap: null }; return m.p4; };
    const radSum = R => Object.values(R.srv).reduce((s, v) => s + v.timeout, 0);

    // ═══ clish komutları ═══════════════════════════════════════════════════
    function clCmds(x) {
        const E = x.E;
        const rad = () => A(x).rad, tac = () => A(x).tac;
        const addRad = (a, secret) => {
            const R = rad();
            if (R.srv[a.p]) return E(SIM + 'priority ' + a.p + ' zaten tanımlı (' + R.srv[a.p].host + '). Değiştirmek için: set aaa radius-servers priority ' + a.p + ' …');
            if (radSum(R) + a.t >= 50) return E(SIM + 'Tüm RADIUS sunucularının timeout toplamı 50 saniyeden az olmalı (şu an ' + radSum(R) + ' + ' + a.t + ').');
            R.srv[a.p] = { host: a.h, port: a.port || 1812, timeout: a.t, secret: secret.length };
            return '';
        };
        const chkRad = a => {
            if (!numPrio(a.p)) return E(SIM + 'priority -999 ile 999 arasında bir tam sayı olmalı (küçük sayı = yüksek öncelik).');
            if (a.h !== undefined && !isIp(a.h) && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(a.h)) return E(SIM + 'host bir IPv4/IPv6 adresi ya da ana bilgisayar adı olmalı.');
            return null;
        };
        const radAdd = { run: a => {
            const bad = chkRad(a); if (bad) return bad;
            if (a.s !== undefined) { const sb = secretBad(a.s); if (sb) return E(SIM + sb); return addRad(a, a.s); }
            if (rad().srv[a.p]) return addRad(a, '');
            x.S.pending = { prompt: 'Enter shared secret: ', secret: true, fn: v => {
                if (!v) return SIM + 'Paylaşılan anahtar boş olamaz; sunucu eklenmedi.';
                const sb = secretBad(v); if (sb) return SIM + sb + ' Sunucu eklenmedi.';
                const o = addRad(a, v); return typeof o === 'string' ? o : o.msg;
            } };
            return '';
        } };
        const radSet = a => {
            const bad = chkRad(a); if (bad) return bad;
            const R = rad(), cur = R.srv[a.p];
            if (!cur) return E(SIM + 'priority ' + a.p + ' ile tanımlı RADIUS sunucusu yok; önce: add aaa radius-servers priority ' + a.p + ' host …');
            if (a.h === undefined && a.port === undefined && a.s === undefined && a.t === undefined) return { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' };
            if (a.s !== undefined) { const sb = secretBad(a.s); if (sb) return E(SIM + sb); }
            if (a.t !== undefined && radSum(R) - cur.timeout + a.t >= 50) return E(SIM + 'Tüm RADIUS sunucularının timeout toplamı 50 saniyeden az olmalı.');
            if (a.h !== undefined) cur.host = a.h;
            if (a.port !== undefined) cur.port = a.port;
            if (a.s !== undefined) cur.secret = a.s.length;
            if (a.t !== undefined) cur.timeout = a.t;
            return '';
        };
        const tacSet = a => {
            const T = tac(), cur = T.srv[a.p];
            if (!cur) return E(SIM + 'priority ' + a.p + ' ile tanımlı TACACS+ sunucusu yok; önce: add aaa tacacs-servers priority ' + a.p + ' server … key … timeout …');
            if (a.ip === undefined && a.k === undefined && a.t === undefined) return { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' };
            if (a.k !== undefined) { const sb = secretBad(a.k); if (sb) return E(SIM + sb); cur.key = a.k.length; }
            if (a.ip !== undefined) cur.ip = a.ip;
            if (a.t !== undefined) cur.timeout = a.t;
            return '';
        };
        const radList = () => {
            const ks = Object.keys(rad().srv).sort((p, q) => +p - +q);
            if (!ks.length) return SIM + 'Tanımlı RADIUS sunucusu yok.';
            return [pad('Priority', 10) + pad('Host', 18) + pad('Port', 8) + 'Timeout'].concat(ks.map(k => { const v = rad().srv[k]; return pad(k, 10) + pad(v.host, 18) + pad(v.port, 8) + v.timeout; }))
                .join('\n') + '\n' + SIM + 'Liste biçimi temsilidir. Küçük priority numarası önce denenir.';
        };
        const tacList = () => {
            const ks = Object.keys(tac().srv).sort((p, q) => +p - +q);
            if (!ks.length) return SIM + 'Tanımlı TACACS+ sunucusu yok.';
            return [pad('Priority', 10) + pad('Server', 18) + 'Timeout'].concat(ks.map(k => { const v = tac().srv[k]; return pad(k, 10) + pad(v.ip, 18) + v.timeout; }))
                .join('\n') + '\n' + SIM + 'Liste biçimi temsilidir.';
        };
        const featList = s => s.split(',').map(f => f.trim()).filter(Boolean);
        const featBad = L => L.find(f => !/^[a-z][a-z0-9-]*$/.test(f));
        const addRole = a => {
            const ro = a.ro !== undefined ? featList(a.ro) : [], rw = a.rw !== undefined ? featList(a.rw) : [];
            const bad = featBad(ro.concat(rw)); if (bad) return E(SIM + '"' + bad + '" geçerli bir özellik adı değil (virgülle ayrılmış küçük harfli özellik adları: interface,static-route …).');
            const R = A(x).roles, r = R[a.r] || (R[a.r] = { ro: [], rw: [], all: false });
            if (a.all) r.all = true;
            ro.forEach(f => { if (!r.ro.includes(f)) r.ro.push(f); r.rw = r.rw.filter(y => y !== f); });
            rw.forEach(f => { if (!r.rw.includes(f)) r.rw.push(f); r.ro = r.ro.filter(y => y !== f); });
            return '';
        };
        // ── zamanlanmış snapshot
        const snap = () => A(x).snap;
        const touch = s => { if (s.act === 'enabled') s.stale = true; };
        const hhmm = t => /^([01]?\d|2[0-3]):[0-5]\d$/.test(t);
        const nlist = (s, lo, hi) => (s === 'all' ? 'all' : (/^\d+(,\d+)*$/.test(s) && s.split(',').every(n => +n >= lo && +n <= hi) ? s.split(',').map(Number) : null));
        const tt = t => t.split(':').map((v, i) => (i === 0 ? String(+v).padStart(2, '0') : v)).join(':');
        const needSnap = () => (snap() ? null : E(SIM + 'Önce görevi tanımlayın: set snapshot-scheduled settings snapshot-name-prefix <Önek> [description "<Açıklama>"] target lvm'));
        const setRec = (a, text, raw) => { const e = needSnap(); if (e) return e; const s = snap(); s.rec = text; s.recRaw = raw; touch(s); return ''; };
        const disk = () => { const d = x.SIM.p4disk || {}; const free = +(d.free || 127.81), lv = +(d.lv || 40); return { free, lv, avail: +(free - 1.1 * lv).toFixed(2) }; };
        const settings = a => {
            if (!/^[A-Za-z0-9_]{1,15}$/.test(a.px)) return E(SIM + 'Önek en çok 15 karakter olmalı ve yalnız harf, rakam ya da alt çizgi (_) içermeli.');
            const t = shTok(a.r || '');
            if (t === null) return E(SIM + 'Kapanmamış tırnak.');
            let i = 0, desc = 'default_snapshot';
            if (t[i] === 'description') { if (t[i + 1] === undefined) return { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' }; desc = t[i + 1]; i += 2; }
            if (t[i] !== 'target') return t.length ? { err: 'invalid', msg: 'CLINFR0329 Invalid command:\'set snapshot-scheduled settings snapshot-name-prefix ' + a.px + ' ' + (a.r || '') + '\'' } : { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' };
            const tg = (t[i + 1] || '').toLowerCase(); i += 2;
            const s = { px: a.px, desc, target: tg, act: 'disabled', stale: false, rec: null, recRaw: null, ret: {} };
            if (tg === 'lvm') { if (t.length > i) return { err: 'invalid', msg: 'CLINFR0329 Invalid command:\'' + t.slice(i).join(' ') + '\'' }; }
            else if (tg === 'scp' || tg === 'ftp') {
                const kv = {}; for (; i < t.length; i += 2) kv[t[i]] = t[i + 1];
                if (!kv.ip || !kv.path || !kv.username || !(kv.password || kv['password-hash'])) return { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' };
                if (!isIp(kv.ip)) return E(SIM + 'ip bir IPv4 adresi olmalı.');
                if (!/^\/.*\/$/.test(kv.path)) return E(SIM + 'path "/" ile başlayıp "/" ile biten bir dizin olmalı (ör. /snapshots/gw-a/).');
                Object.assign(s, { ip: kv.ip, path: kv.path, user: kv.username });
            } else return tg ? { err: 'invalid', msg: 'CLINFR0329 Invalid command:\'target ' + tg + '\'' } : { err: 'incomplete', msg: 'CLINFR0349 Incomplete command' };
            A(x).snap = s;
            return '';
        };
        const recText = s => {
            const r = s.recRaw; if (!r) return null;
            if (r.k === 'daily') return 'Every day at ' + r.t;
            if (r.k === 'hourly') return r.h === 'all' ? 'Every hour at minute ' + r.m : 'Every day at ' + r.h.map(h => String(h).padStart(2, '0') + ':' + String(r.m).padStart(2, '0')).join(',');
            if (r.k === 'interval') return 'Every ' + r.m + ' minutes.';
            if (r.k === 'monthly') return (r.mo === 'all' ? 'Every month' : 'Each ' + r.mo.map(m => MONTHS[m - 1]).join(', ')) + ' on day' + (r.d.length > 1 ? 's ' : ' ') + r.d.join(', ') + ' at ' + r.t;
            if (r.k === 'weekly') return 'Every week on ' + (r.d === 'all' ? WDAYS : r.d.map(d => WDAYS[d])).join(', ') + ' at ' + r.t;
            return null;
        };
        const showSnap = px => {
            const s = snap();
            if (!s) return 'Scheduled snapshot configuration:\n' + SIM + 'Zamanlanmış snapshot görevi tanımlı değil.';
            if (px !== undefined && px !== s.px) return E(SIM + '"' + px + '" önekli zamanlanmış snapshot görevi yok (tanımlı önek: ' + s.px + ').');
            const L = ['Scheduled snapshot configuration:', 'name: ' + s.px, 'description: ' + s.desc, 'activation: ' + s.act, 'target: ' + s.target];
            if (s.target === 'lvm') { if (s.ret.max) L.push('max-snapshots-to-keep: ' + s.ret.max); if (s.ret.min) L.push('min-snapshots-to-keep: ' + s.ret.min); if (s.ret.disk) L.push('keep-disk-space-above-in-GB: ' + s.ret.disk); }
            else L.push('username: ' + s.user, 'ip: ' + s.ip, 'uploadPath: ' + s.path);
            const rt = recText(s); if (rt) L.push(rt);
            if (!rt) L.push(SIM + 'Tekrar (recurrence) tanımlı değil: görev çalışmaz.');
            if (s.act === 'enabled' && s.stale) L.push(SIM + 'Son değişiklikten sonra "set snapshot-scheduled activation enabled" çalıştırılmadı: değişiklik zamanlayıcıya uygulanmadı.');
            return L.join('\n');
        };
        const retention = (k, n) => {
            const e = needSnap(); if (e) return e;
            const s = snap();
            if (k === 'keep-disk-space-above-in-gb') { const d = disk(); if (n > Math.floor(d.avail)) return E(SIM + 'Değer en çok ' + Math.floor(d.avail) + ' GB olabilir (snapshot\'lar için kullanılabilir alan ≈ ' + d.avail + ' GB).'); s.ret.disk = n; }
            else {
                const mx = k === 'max-snapshots-to-keep' ? n : s.ret.max, mn = k === 'min-snapshots-to-keep' ? n : s.ret.min;
                if (mx && mn && mn > mx) return E(SIM + 'min-snapshots-to-keep, max-snapshots-to-keep değerinden büyük olamaz.');
                s.ret[k === 'max-snapshots-to-keep' ? 'max' : 'min'] = n;
            }
            touch(s);
            return s.target === 'lvm' ? '' : SIM + 'Saklama politikası yalnız yerel LVM hedefinde uygulanır; bu görevin hedefi ' + s.target + '.';
        };

        return [
            // RADIUS (Gaia Admin s. 519–521)
            Object.assign({ p: 'add aaa radius-servers priority WORD$p host WORD$h [port (1-65535)$port] secret WORD$s timeout (1-50)$t' }, radAdd),
            Object.assign({ p: 'add aaa radius-servers priority WORD$p host WORD$h [port (1-65535)$port] prompt-secret timeout (1-50)$t' }, radAdd),
            { p: 'set aaa radius-servers priority WORD$p [host WORD$h] [port (1-65535)$port] [secret WORD$s] [timeout (1-50)$t]', run: radSet },
            { p: 'set aaa radius-servers priority WORD$p new-priority WORD$np', run: a => {
                const R = rad(); if (!numPrio(a.p) || !numPrio(a.np)) return E(SIM + 'priority -999 ile 999 arasında bir tam sayı olmalı.');
                if (!R.srv[a.p]) return E(SIM + 'priority ' + a.p + ' ile tanımlı RADIUS sunucusu yok.');
                if (R.srv[a.np]) return E(SIM + 'priority ' + a.np + ' zaten kullanılıyor.');
                R.srv[a.np] = R.srv[a.p]; delete R.srv[a.p]; return '';
            } },
            { p: 'set aaa radius-servers super-user-uid <0|96>$u', run: a => { rad().uid = a.u; return ''; } },
            { p: 'set aaa radius-servers nas-ip A.B.C.D$ip', run: a => { rad().nas = a.ip; return ''; } },
            { p: 'show aaa radius-servers list', run: radList },
            { p: 'show aaa radius-servers priority WORD$p <host|port|timeout>$f', run: a => { const v = rad().srv[a.p]; return v ? String(a.f === 'host' ? v.host : v[a.f]) : E(SIM + 'priority ' + a.p + ' ile tanımlı RADIUS sunucusu yok.'); } },
            { p: 'show aaa radius-servers super-user-uid', run: () => rad().uid },
            { p: 'show aaa radius-servers nas-ip', run: () => rad().nas || SIM + 'NAS-IP tanımlı değil: Gaia yönetim arayüzünün IPv4 adresi kullanılır (show management interface).' },
            { p: 'delete aaa radius-servers priority WORD$p', run: a => { if (!rad().srv[a.p]) return E(SIM + 'priority ' + a.p + ' ile tanımlı RADIUS sunucusu yok.'); delete rad().srv[a.p]; return ''; } },
            { p: 'delete aaa radius-servers nas-ip', run: () => { rad().nas = ''; return ''; } },
            // TACACS+ (Gaia Admin s. 529–531)
            { p: 'add aaa tacacs-servers priority (1-20)$p server A.B.C.D$ip key WORD$k timeout (1-60)$t', run: a => {
                const T = tac(); if (T.srv[a.p]) return E(SIM + 'priority ' + a.p + ' zaten tanımlı (' + T.srv[a.p].ip + '); priority her sunucu için benzersiz olmalı.');
                const sb = secretBad(a.k); if (sb) return E(SIM + sb);
                T.srv[a.p] = { ip: a.ip, key: a.k.length, timeout: a.t }; return '';
            } },
            { p: 'set aaa tacacs-servers priority (1-20)$p [server A.B.C.D$ip] [key WORD$k] [timeout (1-60)$t]', run: tacSet },
            { p: 'set aaa tacacs-servers priority (1-20)$p new-priority (1-20)$np', run: a => {
                const T = tac(); if (!T.srv[a.p]) return E(SIM + 'priority ' + a.p + ' ile tanımlı TACACS+ sunucusu yok.');
                if (T.srv[a.np]) return E(SIM + 'priority ' + a.np + ' zaten kullanılıyor.');
                T.srv[a.np] = T.srv[a.p]; delete T.srv[a.p]; return '';
            } },
            { p: 'set aaa tacacs-servers state <on|off>$s', run: a => { tac().state = a.s; return ''; } },
            { p: 'set aaa tacacs-servers user-uid <0|96>$u', run: a => { tac().uid = a.u; return ''; } },
            { p: 'show aaa tacacs-servers list', run: tacList },
            { p: 'show aaa tacacs-servers priority (1-20)$p <server|timeout>$f', run: a => { const v = tac().srv[a.p]; return v ? String(a.f === 'server' ? v.ip : v.timeout) : E(SIM + 'priority ' + a.p + ' ile tanımlı TACACS+ sunucusu yok.'); } },
            { p: 'show aaa tacacs-servers state', run: () => tac().state },
            { p: 'show aaa tacacs-servers user-uid', run: () => tac().uid },
            { p: 'delete aaa tacacs-servers priority (1-20)$p', run: a => { if (!tac().srv[a.p]) return E(SIM + 'priority ' + a.p + ' ile tanımlı TACACS+ sunucusu yok.'); delete tac().srv[a.p]; return ''; } },
            // RBA rolleri (Gaia Admin s. 463–464)
            { p: 'add rba role WORD$r domain-type system all-features$all', run: addRole },
            { p: 'add rba role WORD$r domain-type system readonly-features WORD$ro [readwrite-features WORD$rw]', run: addRole },
            { p: 'add rba role WORD$r domain-type system readwrite-features WORD$rw [readonly-features WORD$ro]', run: addRole },
            { p: 'show rba role WORD$r', run: a => {
                const r = A(x).roles[a.r];
                if (!r) return E(SIM + '"' + a.r + '" adlı rol yok. Bu lab\'da tanımlı roller: ' + (Object.keys(A(x).roles).join(', ') || '(yok)') + '; yerleşik roller: adminRole, monitorRole.');
                const L = ['Role', a.r, 'domain-type System'];
                if (r.all) L.push('all-features');
                if (r.rw.length) L.push('read-write-feature ' + r.rw.join(','));
                if (r.ro.length) L.push('read-only-feature ' + r.ro.join(','));
                return L.join('\n');
            } },
            { p: 'delete rba role WORD$r', run: a => { if (!A(x).roles[a.r]) return E(SIM + '"' + a.r + '" adlı rol yok.'); delete A(x).roles[a.r]; return ''; } },
            // Zamanlanmış snapshot (Gaia Admin s. 606–621)
            { p: 'set snapshot-scheduled settings snapshot-name-prefix WORD$px [LINE$r]', run: settings },
            { p: 'set snapshot-scheduled recurrence daily time WORD$t', run: a => (hhmm(a.t) ? setRec(a, null, { k: 'daily', t: tt(a.t) }) : E(SIM + 'Saat 24 saat biçiminde HH:MM olmalı (ör. 22:00).')) },
            { p: 'set snapshot-scheduled recurrence hourly hours WORD$h at (0-59)$m', run: a => { const h = nlist(a.h, 0, 23); return h ? setRec(a, null, { k: 'hourly', h, m: a.m }) : E(SIM + 'hours: 0–23 arası saatler, virgülle (14,15,16) ya da all.'); } },
            { p: 'set snapshot-scheduled recurrence interval minutes (1-59)$m', run: a => setRec(a, null, { k: 'interval', m: a.m }) },
            { p: 'set snapshot-scheduled recurrence monthly month WORD$mo days WORD$d time WORD$t', run: a => {
                const mo = nlist(a.mo, 1, 12), d = nlist(a.d, 1, 31);
                if (!mo || !d || d === 'all') return E(SIM + 'month: 1–12 (virgülle) ya da all; days: 1–31 (virgülle).');
                return hhmm(a.t) ? setRec(a, null, { k: 'monthly', mo, d, t: tt(a.t) }) : E(SIM + 'Saat HH:MM olmalı.');
            } },
            { p: 'set snapshot-scheduled recurrence weekly days WORD$d time WORD$t', run: a => {
                const d = nlist(a.d, 0, 6); if (!d) return E(SIM + 'days: 0 (Pazar) … 6 (Cumartesi), virgülle; ya da all.');
                return hhmm(a.t) ? setRec(a, null, { k: 'weekly', d, t: tt(a.t) }) : E(SIM + 'Saat HH:MM olmalı.');
            } },
            { p: 'set snapshot-scheduled retention-policy <max-snapshots-to-keep|min-snapshots-to-keep|keep-disk-space-above-in-gb>$k (1-9999)$n', run: a => retention(a.k, a.n) },
            { p: 'set snapshot-scheduled activation <enabled|disabled>$v', run: a => {
                const e = needSnap(); if (e) return e;
                const s = snap(); s.act = a.v; s.stale = false;
                return a.v === 'enabled' && !s.recRaw ? SIM + 'Görev etkin ama tekrar (recurrence) tanımlı değil: set snapshot-scheduled recurrence …' : '';
            } },
            { p: 'show snapshot-scheduled [WORD$px]', run: a => showSnap(a.px) },
        ];
    }
    // DSL'de [..] tek öğelidir: çok sözcüklü isteğe bağlı grupları ayrı kalıplara aç
    function expand(p) {
        const m = p.match(/\[([^\]]*\s[^\]]*)\]/);
        if (!m) return [p];
        return expand(p.replace(m[0], m[1])).concat(expand(p.replace(' ' + m[0], '')));
    }
    // Tırnak duyarlı sözcük bölme (description "Haftalık bakım")
    function shTok(s) {
        const out = []; let cur = null, q = null;
        for (const ch of s) {
            if (q) { if (ch === q) q = null; else cur += ch; continue; }
            if (ch === '"' || ch === "'") { q = ch; if (cur === null) cur = ''; continue; }
            if (/\s/.test(ch)) { if (cur !== null) { out.push(cur); cur = null; } continue; }
            cur = (cur || '') + ch;
        }
        if (q) return null;
        if (cur !== null) out.push(cur);
        return out;
    }

    // ═══ fw log (CLI Reference s. 1123–1132) ═════════════════════════════════
    const MON3 = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const LOGDAY = Date.UTC(2026, 8, 24) / 86400000;   // simülatör günü: 24 Eylül 2026
    const tsec = t => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + (s || 0); };
    // "HH:MM[:SS]" | "Mon DD, YYYY" | "Mon DD, YYYY HH:MM[:SS]" → simülatör gününe göre mutlak saniye
    function parseTs(v, end) {
        const m = String(v).trim().match(/^(?:([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4}))?\s*(\d{1,2}:\d{2}(?::\d{2})?)?$/);
        if (!m || (!m[1] && !m[4])) return null;
        let day = LOGDAY;
        if (m[1]) { const mi = MON3.indexOf(m[1].slice(0, 3).toLowerCase()); if (mi < 0) return null; day = Date.UTC(+m[3], mi, +m[2]) / 86400000; }
        const sec = m[4] ? tsec(m[4]) : (end ? 86399 : 0);
        return (day - LOGDAY) * 86400 + sec;
    }
    const SVCN = { 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'domain-udp', 80: 'http', 443: 'https', 445: 'microsoft-ds', 3389: 'Remote_Desktop_Protocol' };
    const FW_USAGE = 'Usage: fw [-d] log [-a] [-b "<Start Timestamp>" "<End Timestamp>"] [-c <Action>] [{-f | -t}] [-g] [-H] [-h <Origin>] [-i] [-k {<Alert Name> | all}] [-l] [-m {initial | semi | raw}] [-n] [-o] [-p] [-q] [-S] [-s "<Start Timestamp>"] [-e "<End Timestamp>"] [-u <Unification Scheme File>] [-w] [-x <Start Entry Number>] [-y <End Entry Number>] [-z] [-#] [<Log File>]';
    const ACTIONS = ['accept', 'drop', 'reject', 'encrypt', 'decrypt', 'vpnroute', 'keyinst', 'authorize', 'deauthorize', 'authcrypt', 'ctl'];
    function logFields(x, e, q, w) {
        const orig = x.host(), svc = e.port, sn = SVCN[svc];
        const head = q ? ['HeaderDateHour: 24Sep2026 ' + e.t, 'ContentVersion: 5', 'HighLevelLogKey: <max_null>', 'LogUid: ', 'SequenceNum: 1'].concat(w ? ['Flags: 428292'] : [], ['Action: ' + e.a, 'Origin: ' + orig, 'IfDir: ' + e.dir, 'InterfaceName: ' + e.i, 'Alert: '])
            : [];
        const body = ['LogId: 0', 'ContextNum: <max_null>', 'OriginSicName: CN=' + orig + ',O=mgmt-a.example.com.p4lab1', 'inzone: ' + (e.inz || 'External'), 'outzone: ' + (e.outz || 'Internal')]
            .concat(sn ? ['service_id: ' + sn] : [], ['src: ' + e.src, 'dst: ' + e.dst, 'proto: ' + (e.p || 'tcp'), 'layer_name: ' + ((x.policyNow() || {}).name || 'Standard') + ' Network', 'rule_name: ' + (e.rule || 'Cleanup rule'),
                'ProductName: VPN-1 & FireWall-1', 'svc: ' + svc, 'sport_svc: ' + e.sp, 'ProductFamily: Network']);
        return head.concat(body).join('; ') + ';';
    }
    function fwLog(x, a) {
        const LOG = x.SIM.p4log;
        if (!Array.isArray(LOG)) return undefined;   // log verisi olmayan lab'larda yerleşik davranış (desteklenmiyor) korunur
        const o = { l: false, q: false, w: false, c: null, s: null, e: null, xs: null, ys: null, h: null, f: false };
        const r = a.slice(2);
        for (let i = 0; i < r.length; i++) {
            const t = r[i];
            const val = () => { i++; return r[i]; };
            if (t === '-help' || (t === '-h' && r.length === 1)) return FW_USAGE;
            if (t === '-l') o.l = true; else if (t === '-q') o.q = true; else if (t === '-w') o.w = true;
            else if (t === '-n' || t === '-p') { /* varsayılan davranış */ }
            else if (t === '-m') { const m = val(); if (!['initial', 'semi', 'raw'].includes(m)) return { err: 'invalid', msg: FW_USAGE }; }
            else if (t === '-c') { const c = val(); if (!ACTIONS.includes(c)) return { err: 'invalid', msg: 'Invalid action: ' + c + '\n' + SIM + 'Geçerli eylemler: ' + ACTIONS.join(', ') }; o.c = c; }
            else if (t === '-s' || t === '-e') { if (o.b) return { err: 'invalid', msg: SIM + '-b, -s ve -e ile birlikte kullanılamaz.' }; const v = parseTs(val(), t === '-e'); if (v === null) return { err: 'invalid', msg: 'Invalid time format\n' + SIM + 'Biçim: "HH:MM:SS", "Sep 24, 2026" ya da "Sep 24, 2026 10:05:00".' }; o[t[1]] = v; o.se = true; }
            else if (t === '-b') { if (o.se) return { err: 'invalid', msg: SIM + '-b, -s ve -e ile birlikte kullanılamaz.' }; const v1 = parseTs(val(), false), v2 = parseTs(val(), true); if (v1 === null || v2 === null) return { err: 'invalid', msg: 'Invalid time format\n' + SIM + '-b "<Başlangıç>" "<Bitiş>"; biçim: "HH:MM:SS" ya da "Sep 24, 2026 10:05:00".' }; o.s = v1; o.e = v2; o.b = true; }
            else if (t === '-x' || t === '-y') { const v = val(); if (!/^\d+$/.test(v || '')) return { err: 'invalid', msg: FW_USAGE }; o[t === '-x' ? 'xs' : 'ys'] = +v; }
            else if (t === '-h') o.h = val();
            else if (t === '-f' || t === '-t') o.f = t;
            else if (/^-/.test(t)) return { err: 'unsupported', msg: SIM + 'fw log ' + t + ' bu lab sürümünde desteklenmiyor. Desteklenenler: -l -c -s -e -b -x -y -h -q -w -n -p -m -f -t.' };
            else if (!/^(\$FWDIR\/log\/|\/opt\/CPsuite-R81\.20\/fw1\/log\/)?fw\.log$/.test(t)) return { err: 'value', msg: 'Failed to open log file ' + t + '\n' + SIM + 'Bu lab\'da yalnız etkin güvenlik log dosyası ($FWDIR/log/fw.log) vardır.' };
        }
        if (r.includes('-s') && r.includes('-b')) return { err: 'invalid', msg: SIM + '-b, -s ve -e ile birlikte kullanılamaz.' };
        let L = LOG.map((e, k) => Object.assign({ n: k }, e));
        if (o.xs !== null) L = L.filter(e => e.n >= o.xs);
        if (o.ys !== null) L = L.filter(e => e.n <= o.ys);
        if (o.c) L = L.filter(e => e.a === o.c);
        if (o.s !== null) L = L.filter(e => tsec(e.t) >= o.s);
        if (o.e !== null) L = L.filter(e => tsec(e.t) <= o.e);
        if (o.h && o.h !== x.host()) L = [];
        if (o.f === '-t') L = [];
        let out;
        if (o.q || o.l) out = L.map(e => (o.q ? '' : '24Sep2026 ' + e.t + ' 5 N/A 1 ' + e.a + ' ' + x.host() + ' ' + e.dir + ' ' + e.i + ' ') + logFields(x, e, o.q, o.w)).join('\n');
        else out = L.length ? ['24Sep2026'].concat(L.map(e => ' ' + e.t + ' 5 N/A 1 ' + e.a + ' ' + x.host() + ' ' + e.dir + ' ' + e.i + ' ' + logFields(x, e, false, o.w))).join('\n') : '';
        const tail = o.f ? '^C\n' + SIM + (o.f === '-f' ? 'fw log -f kayıtları bastıktan sonra yeni kayıtları izlemeyi sürdürür' : 'fw log -t yalnız bundan sonra gelen yeni kayıtları gösterir') + '; Ctrl+C ile durduruldu.' : null;
        return { out, log: { p4log: { c: o.c, s: o.s, e: o.e, l: o.l, n: L.length } }, tail };
    }

    // ═══ LVM (Gaia Admin s. 610: snapshot için boş alan hesabı) ═════════════════
    function lvm(x, a) {
        const d = x.SIM.p4disk || {}, free = +(d.free || 127.81), lv = +(d.lv || 40), pe = Math.round(free * 1024 / 32), lvlog = +(d.lvlog || 60);
        if (a[0] === 'vgdisplay') {
            if (a.length > 1) return { err: 'unsupported', msg: SIM + 'Bu lab\'da vgdisplay yalnız seçeneksiz çalışır.' };
            const alloc = Math.round((lv + lvlog + 5) * 1024 / 32), tot = alloc + pe;
            const g = n => (n * 32 / 1024).toFixed(2) + ' GiB';
            return { out: ['  --- Volume group ---', '  VG Name               vg_splat', '  System ID             ', '  Format                lvm2', '  VG Access             read/write', '  VG Status             resizable',
                '  Cur LV                3', '  Open LV               3', '  VG Size               ' + g(tot), '  PE Size               32.00 MiB', '  Total PE              ' + tot, '  Alloc PE / Size       ' + alloc + ' / ' + g(alloc),
                '  Free  PE / Size       ' + pe + ' / ' + free.toFixed(2) + ' GiB', '  VG UUID               p4Lab0-Vg00-0000-0000-0000-0000-000001', SIM + '"Free PE / Size" satırı belgedeki biçimdedir; diğer satırlar temsilidir.'].join('\n'), log: { p4lvm: 'vgdisplay' } };
        }
        if (a.length > 1) return { err: 'unsupported', msg: SIM + 'Bu lab\'da lvs yalnız seçeneksiz çalışır.' };
        return { out: ['  LV         VG       Attr       LSize Pool Origin Data%  Meta%  Move Log Cpy%Sync Convert', '  lv_current vg_splat -wi-ao---- ' + lv + 'g', '  lv_log     vg_splat -wi-ao---- ' + lvlog + 'g',
            '  lv_swap    vg_splat -wi-ao---- 5g', SIM + 'lv_current satırı belgedeki biçimdedir; lv_log ve lv_swap temsilidir.'].join('\n'), log: { p4lvm: 'lvs' } };
    }

    // ═══ cp_log_export (CLI Reference s. 80–100) ═══════════════════════════════
    const LX_USAGE = {
        add: 'cp_log_export add name <Name> target-server <Target-Server> target-port <Target-Server-Port> protocol {udp | tcp} [Optional Arguments]',
        delete: 'cp_log_export delete name <Name>', reexport: 'cp_log_export reexport name <Name> --apply-now', restart: 'cp_log_export restart name <Name>',
        set: 'cp_log_export set name <Name> [<Optional Arguments>]', show: 'cp_log_export show [<Optional Arguments>]', start: 'cp_log_export start name <Name>',
        status: 'cp_log_export status [<Optional Arguments>]', stop: 'cp_log_export stop name <Name>'
    };
    const LX_FMT = ['generic', 'cef', 'json', 'leef', 'logrhythm', 'rsa', 'splunk', 'syslog'];
    const LX_OPT = ['target-server', 'target-port', 'protocol', 'format', 'read-mode', 'enabled', 'time-in-milli', 'export-link', 'reconnect-interval'];
    const LX_NOSUP = ['ca-cert', 'client-cert', 'client-secret', 'domain-server', 'encrypted', 'end-position', 'start-position', 'export-attachment-ids', 'export-attachment-link', 'export-link-ip', 'export-log-position'];
    const LXDIR = '$EXPORTERDIR/targets/';
    function lxCmd(x, a) {
        const st = REG.get(x.S.files), LX = st.lx;
        const sub = a[1];
        if (!sub) return 'Usage: cp_log_export <command-name> [<Arguments>] [--apply-now]\nCommands: add, delete, reexport, restart, set, show, start, status, stop\n'
            + 'Run "cp_log_export <command-name> help" for help on a specific command.\n' + SIM + 'Yardım metni kısaltılmıştır.';
        if (!LX_USAGE[sub]) return { err: 'invalid', msg: 'Unknown command: ' + sub + '\n' + SIM + 'Komutlar: ' + Object.keys(LX_USAGE).join(', ') };
        if (a[2] === 'help' && a.length === 3) return 'Usage: ' + LX_USAGE[sub];
        // bağımsız değişkenler: <ad> <değer> çiftleri + --apply-now
        const kv = {}; let apply = false;
        for (let i = 2; i < a.length; i++) {
            if (a[i] === '--apply-now') { apply = true; continue; }
            if (a[i + 1] === undefined) return { err: 'incomplete', msg: 'Missing value for argument: ' + a[i] + '\nUsage: ' + LX_USAGE[sub] };
            kv[a[i]] = a[i + 1]; i++;
        }
        for (const k of Object.keys(kv)) {
            if (LX_NOSUP.includes(k) || /^filter-/.test(k)) return { err: 'unsupported', msg: SIM + '"' + k + '" bu lab sürümünde desteklenmiyor (TLS ve filtre seçenekleri: CLI Reference s. 82–100).' };
            if (k !== 'name' && !LX_OPT.includes(k)) return { err: 'invalid', msg: 'Unknown argument: ' + k + '\nUsage: ' + LX_USAGE[sub] };
        }
        const bad = validate(kv); if (bad) return { err: 'value', msg: bad };
        const nm = kv.name;
        const need = () => (nm === undefined ? { err: 'incomplete', msg: 'Missing mandatory argument: name\nUsage: ' + LX_USAGE[sub] } : !LX[nm] ? { err: 'value', msg: 'Log Exporter "' + nm + '" does not exist.\n' + SIM + 'Tanımlı olanlar: ' + (Object.keys(LX).join(', ') || '(yok)') } : null);
        const opts = Object.assign({}, kv); delete opts.name;
        const sel = () => (nm !== undefined ? (LX[nm] ? [nm] : null) : Object.keys(LX));
        const pid = () => 20000 + (st.pid += 7);
        if (sub === 'add') {
            for (const k of ['name', 'target-server', 'target-port', 'protocol']) if (kv[k] === undefined) return { err: 'incomplete', msg: 'Missing mandatory argument: ' + k + '\nUsage: ' + LX_USAGE.add };
            if (LX[nm]) return { err: 'value', msg: 'Log Exporter "' + nm + '" already exists.' };
            const cfg = Object.assign({ format: 'syslog', 'read-mode': 'semi-unified', enabled: 'true' }, opts);
            LX[nm] = { cfg, app: null, run: false, pid: 0 };
            if (apply) { LX[nm].app = clone(cfg); if (cfg.enabled === 'true') { LX[nm].run = true; LX[nm].pid = pid(); } }
            return { out: SIM + '"' + nm + '" yapılandırması oluşturuldu: ' + LXDIR + nm + '/' + (apply ? (LX[nm].run ? '\n' + SIM + '--apply-now: Log Exporter süreci başlatıldı. Durum: cp_log_export status name ' + nm : '\n' + SIM + 'enabled false: süreç başlatılmadı.')
                : '\n' + SIM + 'Değişiklik henüz uygulanmadı: cp_log_export restart name ' + nm + ' (ya da komutu --apply-now ile verin).'), log: { p4lx: { op: 'add', name: nm, apply } } };
        }
        if (sub === 'set') {
            const e = need(); if (e) return e;
            if (!Object.keys(opts).length) return { err: 'incomplete', msg: 'Nothing to set.\nUsage: ' + LX_USAGE.set };
            Object.assign(LX[nm].cfg, opts);
            if (apply) { LX[nm].app = clone(LX[nm].cfg); LX[nm].run = LX[nm].cfg.enabled === 'true'; if (LX[nm].run) LX[nm].pid = pid(); }
            return { out: apply ? SIM + '"' + nm + '" güncellendi ve --apply-now ile uygulandı' + (LX[nm].run ? ' (süreç yeniden başlatıldı).' : '; enabled false olduğu için süreç çalışmıyor.') : SIM + '"' + nm + '" yapılandırması güncellendi; uygulamak için: cp_log_export restart name ' + nm, log: { p4lx: { op: 'set', name: nm, apply, keys: Object.keys(opts) } } };
        }
        if (sub === 'delete') { const e = need(); if (e) return e; delete LX[nm]; return { out: SIM + '"' + nm + '" silindi (' + LXDIR + nm + '/ kaldırıldı).', log: { p4lx: { op: 'delete', name: nm } } }; }
        if (sub === 'reexport') return { err: 'unsupported', msg: SIM + 'reexport bu lab sürümünde desteklenmiyor.' };
        if (['start', 'stop', 'restart'].includes(sub)) {
            const e = need(); if (e) return e;
            if (Object.keys(opts).length) return { err: 'invalid', msg: 'Usage: ' + LX_USAGE[sub] };
            const X = LX[nm];
            if (sub === 'stop') { X.run = false; return { out: SIM + '"' + nm + '" durduruldu.', log: { p4lx: { op: 'stop', name: nm } } }; }
            if (sub === 'restart') X.app = clone(X.cfg);
            else if (!X.app) X.app = clone(X.cfg);
            if (X.app.enabled !== 'true') { X.run = false; return { out: SIM + '"' + nm + '" başlatılmadı: enabled false. Önce: cp_log_export set name ' + nm + ' enabled true', log: { p4lx: { op: sub, name: nm } } }; }
            X.run = true; X.pid = pid();
            return { out: SIM + '"' + nm + '" ' + (sub === 'restart' ? 'yeniden başlatıldı; yapılandırma değişiklikleri uygulandı.' : 'başlatıldı.'), log: { p4lx: { op: sub, name: nm } } };
        }
        const names = sel();
        if (names === null) return { err: 'value', msg: 'Log Exporter "' + nm + '" does not exist.' };
        if (Object.keys(opts).length) return { err: 'invalid', msg: 'Usage: ' + LX_USAGE[sub] };
        if (!names.length) return { out: SIM + 'Tanımlı Log Exporter yok.', log: { p4lx: { op: sub } } };
        if (sub === 'show') return { out: names.map(n => { const c = LX[n].cfg; return ['name: ' + n].concat(['enabled', 'target-server', 'target-port', 'protocol', 'format', 'read-mode', 'time-in-milli', 'export-link', 'reconnect-interval'].filter(k => c[k] !== undefined).map(k => '     ' + k + ': ' + c[k])).join('\n'); }).join('\n')
            + '\n' + SIM + 'Çıktı biçimi temsilidir (yapılandırma: ' + LXDIR + '<ad>/targetConfiguration.xml).', log: { p4lx: { op: 'show', name: nm } } };
        return { out: names.map(n => { const X = LX[n], pend = JSON.stringify(X.cfg) !== JSON.stringify(X.app);
            return ['name: ' + n, '     status: ' + (X.run ? 'Running (' + X.pid + ')' : 'Stopped'), '     last log read at: ' + (X.run ? '24 Sep 10:21:07' : 'N/A'), '     debug file: ' + LXDIR + n + '/log/log_indexer.elg']
                .concat(pend ? [SIM + 'Yapılandırmada uygulanmamış değişiklik var: cp_log_export restart name ' + n] : []).join('\n'); }).join('\n') + '\n' + SIM + 'Çıktı biçimi temsilidir.', log: { p4lx: { op: 'status', name: nm } } };
    }
    function validate(kv) {
        if (kv.name !== undefined && !/^[A-Za-z][A-Za-z0-9._-]+$/.test(kv.name)) return 'Invalid name: ' + kv.name + '\n' + SIM + 'Ad harfle başlamalı, en az iki karakter olmalı; yalnız harf, rakam, "-", "_" ve "." içerebilir.';
        if (kv['target-port'] !== undefined && !(/^\d+$/.test(kv['target-port']) && +kv['target-port'] >= 1 && +kv['target-port'] <= 65535)) return 'Invalid target-port: ' + kv['target-port'];
        if (kv.protocol !== undefined && !['udp', 'tcp'].includes(kv.protocol)) return 'Invalid protocol: ' + kv.protocol + ' (udp | tcp)';
        if (kv.format !== undefined && !LX_FMT.includes(kv.format)) return 'Invalid format: ' + kv.format + ' (' + LX_FMT.join(' | ') + ')';
        if (kv['read-mode'] !== undefined && !['raw', 'semi-unified'].includes(kv['read-mode'])) return 'Invalid read-mode: ' + kv['read-mode'] + ' (raw | semi-unified)';
        for (const k of ['enabled', 'time-in-milli', 'export-link']) if (kv[k] !== undefined && !['true', 'false'].includes(kv[k])) return 'Invalid ' + k + ': ' + kv[k] + ' (true | false)';
        if (kv['target-server'] !== undefined && !isIp(kv['target-server']) && !/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(kv['target-server'])) return 'Invalid target-server: ' + kv['target-server'];
        return null;
    }

    // ═══ mgmt_cli: show-logs, show-last-published-session; publish izleme ═════════
    const TF = ['last-7-days', 'last-hour', 'today', 'last-24-hours', 'yesterday', 'this-week', 'this-month', 'last-30-days', 'all-time', 'custom'];
    const TOPF = { sources: 'src', destinations: 'dst', services: 'service', actions: 'action', blades: 'blade', origins: 'origin', users: null, applications: null };
    function mgArgs(argv) {
        const fl = {}, kv = {}; let i = 1, verb = null;
        while (i < argv.length && /^-/.test(argv[i])) { fl[argv[i].replace(/^-+/, '')] = argv[i + 1]; i += 2; }
        verb = argv[i]; i++;
        for (; i < argv.length; i += 2) { if (/^-/.test(argv[i])) fl[argv[i].replace(/^-+/, '')] = argv[i + 1]; else kv[argv[i]] = argv[i + 1]; }
        return { verb, fl, kv };
    }
    function mgAuth(x, fl) {
        if (fl.r === 'true' || fl.root === 'true') return null;
        const sf = fl.s || fl['session-id'];
        if (sf !== undefined) { const ss = x.MG.sess(); return ss && ss.file === sf ? null : { err: 'value', msg: 'Failed to read session file ' + sf + '\n' + SIM + 'Önce: mgmt_cli login -r true > ' + sf }; }
        return { err: 'value', msg: 'code: "generic_err_missing_required_parameters"\nmessage: "Missing credentials: use -r true, or -s <session-file> after login"' };
    }
    const logRow = (x, e) => ({ time: '2026-09-24T' + e.t + 'Z', action: e.a === 'drop' ? 'Drop' : e.a === 'accept' ? 'Accept' : e.a === 'reject' ? 'Reject' : e.a, origin: x.host(), src: e.src, dst: e.dst, service: String(e.port), proto: e.p || 'tcp', 'rule-name': e.rule || 'Cleanup rule', blade: 'Firewall' });
    function showLogs(x, fl, kv) {
        const LOG = x.SIM.p4log;
        const au = mgAuth(x, fl); if (au) return au;
        for (const k of Object.keys(kv)) if (!/^new-query\.(filter|time-frame|max-logs-per-request|type|top\.field|top\.count|custom-start|custom-end|log-servers)$/.test(k) && k !== 'ignore-warnings')
            return { err: 'value', msg: k === 'query-id' ? SIM + 'Sayfalama (query-id) bu lab\'da desteklenmiyor; new-query.max-logs-per-request ile sınırlayın.' : 'code: "generic_err_invalid_parameter_name"\nmessage: "Unrecognized parameter [' + k + ']"' };
        const tf = kv['new-query.time-frame'] || 'last-7-days';
        if (!TF.includes(tf)) return { err: 'value', msg: 'code: "generic_err_invalid_parameter"\nmessage: "Invalid value for [new-query.time-frame]: ' + tf + '"\n' + SIM + 'Seçenekler: ' + TF.join(', ') };
        if (tf === 'custom') return { err: 'unsupported', msg: SIM + 'custom zaman aralığı bu lab\'da desteklenmiyor; today ya da last-hour kullanın.' };
        const ty = kv['new-query.type'] || 'logs';
        if (!['logs', 'audit'].includes(ty)) return { err: 'value', msg: 'code: "generic_err_invalid_parameter"\nmessage: "Invalid value for [new-query.type]: ' + ty + '"' };
        if (ty === 'audit') return { err: 'unsupported', msg: SIM + 'Audit logları (new-query.type audit) bu lab\'da yok; güvenlik logları için type logs.' };
        const max = kv['new-query.max-logs-per-request'] !== undefined ? +kv['new-query.max-logs-per-request'] : 100;
        if (!(max >= 1 && max <= 100)) return { err: 'value', msg: 'code: "generic_err_invalid_parameter"\nmessage: "Invalid value for [new-query.max-logs-per-request]"\n' + SIM + '1–100 arası.' };
        let rows = (tf === 'yesterday' ? [] : tf === 'last-hour' ? LOG.filter(e => tsec(e.t) >= tsec('09:21:07')) : LOG).map(e => logRow(x, e));
        const flt = (kv['new-query.filter'] || '').trim();
        if (flt) {
            if (/\sOR\s|\sNOT\s|^NOT\s/i.test(flt)) return { err: 'unsupported', msg: SIM + 'Bu lab\'da filtrede yalnız AND desteklenir (ör. "src:198.51.100.77 AND action:Drop").' };
            const conds = flt.split(/\s+AND\s+/i).map(c => c.trim()).filter(Boolean).map(c => { const m = c.match(/^([\w-]+):(.+)$/); return m ? { f: m[1].toLowerCase(), v: m[2].replace(/^"(.*)"$/, '$1').toLowerCase() } : { v: c.replace(/^"(.*)"$/, '$1').toLowerCase() }; });
            const FMAP = { src: 'src', source: 'src', dst: 'dst', destination: 'dst', action: 'action', service: 'service', origin: 'origin', blade: 'blade', rule_name: 'rule-name', proto: 'proto' };
            for (const c of conds) if (c.f && !FMAP[c.f]) return { err: 'unsupported', msg: SIM + 'Filtre alanı "' + c.f + '" bu lab\'da yok. Alanlar: src, dst, action, service, origin, blade, rule_name, proto.' };
            rows = rows.filter(r => conds.every(c => (c.f ? String(r[FMAP[c.f]]).toLowerCase() === c.v : [r.src, r.dst, r.service, r.action.toLowerCase()].includes(c.v))));
        }
        const topF = kv['new-query.top.field'];
        const lg = { mgmt: 'show-logs', p4q: { filter: flt, tf, top: topF || null, n: rows.length } };
        if (topF !== undefined) {
            if (!(topF in TOPF)) return { err: 'value', msg: 'code: "generic_err_invalid_parameter"\nmessage: "Invalid value for [new-query.top.field]: ' + topF + '"\n' + SIM + 'Seçenekler: ' + Object.keys(TOPF).join(', ') };
            const cnt = kv['new-query.top.count'] !== undefined ? +kv['new-query.top.count'] : 10;
            if (!(cnt >= 1 && cnt <= 50)) return { err: 'value', msg: 'code: "generic_err_invalid_parameter"\nmessage: "Invalid value for [new-query.top.count]"' };
            const m = {}; if (TOPF[topF]) rows.forEach(r => { const v = r[TOPF[topF]]; m[v] = (m[v] || 0) + 1; });
            const top = Object.entries(m).sort((p, q) => q[1] - p[1] || (p[0] < q[0] ? -1 : 1)).slice(0, cnt);
            return { out: ['top:', '  field: "' + topF + '"', '  entries:'].concat(top.length ? [].concat(...top.map(([v, n]) => ['  - value: "' + v + '"', '    count: ' + n])) : ['  (boş)'])
                .concat(['logs-count: ' + rows.length, SIM + 'Yanıt biçimi temsilidir; gerçek API yanıtı JSON/YAML ve daha çok alan içerir.']).join('\n'), log: lg };
        }
        const shown = rows.slice(0, max);
        const out = ['logs:'].concat(shown.length ? [].concat(...shown.map((r, k) => ['- id: "p4log-' + String(k + 1).padStart(4, '0') + '"'].concat(Object.entries(r).map(([f, v]) => '  ' + f + ': "' + v + '"')))) : ['  (boş)'])
            .concat(['logs-count: ' + shown.length, 'query-id: "p4q-' + String(REG.get(x.S.files).q += 1).padStart(4, '0') + '"', SIM + (rows.length > shown.length ? rows.length + ' eşleşen kayıttan ilk ' + shown.length + '\'i gösterildi. ' : '') + 'Alan adları ve biçim temsilidir; gerçek API yanıtı JSON/YAML ve daha çok alan içerir.']);
        return { out: out.join('\n'), log: lg };
    }

    G.CG_GAIA_EXT = G.CG_GAIA_EXT || [];
    G.CG_GAIA_EXT.push({
        id: 'p4',
        roots: ['cp_log_export', 'vgdisplay', 'lvs'],
        init(x) {
            const lx = {};
            for (const e of (x.SIM.p4lx || [])) { const cfg = Object.assign({ format: 'syslog', 'read-mode': 'semi-unified', enabled: 'true' }, e.cfg); lx[e.name] = { cfg, app: clone(Object.assign({}, cfg, e.app || {})), run: e.run !== false, pid: 18000 + Object.keys(lx).length * 11 }; }
            REG.set(x.S.files, { lx, revs: [], pid: 0, q: 0 });
        },
        cl: x => [].concat(...clCmds(x).map(c => expand(c.p).map(p => Object.assign({}, c, { p })))),
        clish(x, line) {
            const t = line.trim().toLowerCase();
            if (/^(set|show|delete) aaa radius-servers default-shell\b/.test(t) || /^add rba role \S+ virtual-system-access\b/.test(t) || /^(show )?tacacs_enable\b/.test(t)) {
                x.log({ raw: line, err: 'unsupported' });
                return SIM + 'Bu komut gerçek Gaia\'da var ama bu lab sürümünde desteklenmiyor.';
            }
            return undefined;
        },
        expert(x, argv) {
            if (argv[0] === 'fw' && argv[1] === 'log') return fwLog(x, argv);
            if (argv[0] === 'cp_log_export') return lxCmd(x, argv);
            if (argv[0] === 'vgdisplay' || argv[0] === 'lvs') return lvm(x, argv);
            return undefined;
        },
        mgmt(x, argv, line) {
            const { verb, fl, kv } = mgArgs(argv);
            if (verb === 'show-logs' && Array.isArray(x.SIM.p4log)) return showLogs(x, fl, kv);
            if (verb === 'show-last-published-session') {
                const au = mgAuth(x, fl); if (au) return au;
                if (Object.keys(kv).length) return { err: 'value', msg: 'code: "generic_err_invalid_parameter_name"\nmessage: "Unrecognized parameter [' + Object.keys(kv)[0] + ']"' };
                const R = REG.get(x.S.files).revs, r = R[R.length - 1];
                if (!r) return { out: SIM + 'Bu oturumda henüz publish yapılmadı; lab başlangıcındaki politika önceden yayınlanmıştı.', log: { mgmt: 'show-last-published-session' } };
                return { out: ['uid: "' + r.uid + '"', 'type: "session"', 'state: "published"', 'user-name: "admin"', 'application: "mgmt_cli"', 'publish-time:', '  iso-8601: "' + r.time + '"', 'changes: ' + r.n]
                    .concat(r.changes.length ? ['# değişiklikler:'].concat(r.changes.map(c => '#   ' + c)) : [], [SIM + 'Alan seçimi temsilidir. Her publish bir revizyondur; SmartConsole Installation History ile belirli bir sürüm yeniden kurulabilir.']).join('\n'), log: { mgmt: 'show-last-published-session' } };
            }
            if (verb === 'publish') {
                const ss = x.MG.sess(), pre = ss ? ss.changes.slice() : [];
                const r = x.MG.cmd(argv, line);   // yerleşik publish: çıktı değiştirilmeden döner
                if (r && typeof r === 'object' && r.log && r.log.mgmt === 'publish') {
                    const R = REG.get(x.S.files).revs, k = R.length + 1;
                    R.push({ uid: 'p4rev-' + String(k).padStart(4, '0'), n: r.log.n, changes: pre, time: '2026-09-24T' + String(10 + Math.floor((30 + 7 * k) / 60)).padStart(2, '0') + ':' + String((30 + 7 * k) % 60).padStart(2, '0') + ':00Z' });
                }
                return r;
            }
            return undefined;
        }
    });
    if (typeof module !== 'undefined') module.exports = P4;
})();
