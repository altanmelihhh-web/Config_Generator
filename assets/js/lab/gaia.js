'use strict';

// ─── CLI Lab: Check Point Gaia motoru (eğitim simülatörü; Gaia R81.20 görünümü) ───
// İki kabuk: clish (gw-a> ) ve expert (bash, [Expert@gw-a:0]# ).
// clish komutları cihaz MODELİNİ değiştirir; değişiklik anında çalışan sisteme uygulanır,
// "save config" ile kalıcı olur (reboot'ta kaydedilmemiş olan kaybolur). Görev kontrolleri
// modele ve olay kaydına (ev) bakar. Politika SmartConsole'da yazılır: lab verisinde
// sabit kural tabanı (sim.rules) + anti-spoofing grupları (sim.spoof) + NAT (sim.nat) +
// akışlar (sim.flows) tanımlanır; expert teşhis komutları bunlardan çıktı üretir.
//
// Doğrulanmış biçim kaynakları (metin kopyalanmadı; biçim örnek alındı):
//  - clish özellikleri (kısaltma, Tab, ?, history, save config, config lock):
//    https://sc1.checkpoint.com/documents/R77/CP_R77_Gaia_AdminWebAdminGuide/75697.htm
//  - "CLINFR0329 Invalid command:'…'" : sk108033, sk171705 (support.checkpoint.com) · "CLINFR0349 Incomplete command": CheckMates
//  - expert giriş/uyarı, set expert-password istemleri:
//    https://sc1.checkpoint.com/documents/R81.10/WebAdminGuides/EN/CP_R81.10_Gaia_AdminGuide/Topics-GAG/Expert-Mode.htm
//  - show interfaces all / show route / show version all / show ntp servers / show dns / fw stat:
//    ntc-templates tests/checkpoint_gaia/* (github.com/networktocode/ntc-templates)
//  - fw ctl zdebug drop başlığı ve "fw_log_drop_ex … dropped by fw_handle_first_packet Reason: Rulebase drop - rule N":
//    https://yurisk.info/2016/05/21/fw-ctl-zdebug-drop-check-point-firewall-ultimate-debug-command/
//    komutun resmi kaynağı: sk167457 (support.checkpoint.com, fw ctl zdebug ile düşmeleri görmek)
//  - dhcp server / bonding group / /proc/net/bonding: R81.20 Gaia Administration Guide s. 143–156, 231–240
//  - "dropped by handle_spoofed_susp, Reason: Address spoofing": sk106625 başlığı
//  - cphaprob state / clusterXL_admin çıktıları:
//    https://sc1.checkpoint.com/documents/R81.10/WebAdminGuides/EN/CP_R81.10_ClusterXL_AdminGuide/Topics-CXLG/Initiating-Manual-Cluster-Failover.htm
//    https://sc1.checkpoint.com/documents/SMB_R81.10.X/CLI/EN/Content/Topics/cphaprob-Viewing-Cluster-State.htm
//  - cphaprob -a -m if: https://sc1.checkpoint.com/documents/R81.20/WebAdminGuides/EN/CP_R81.20_ClusterXL_AdminGuide/Content/Topics-CXLG/Viewing-Cluster-Interfaces.htm
//  - vpn tu menüsü: https://sc1.checkpoint.com/documents/R81/WebAdminGuides/EN/CP_R81_SitetoSiteVPN_AdminGuide/Topics-VPNSG/CLI/vpn-tu.htm
//  - vpn tu tlist tablosu: https://sc1.checkpoint.com/documents/R82/WebAdminGuides/EN/CP_R82_SitetoSiteVPN_AdminGuide/Content/Topics-CLIG/VPNSG/vpn-tu-tlist.htm
//  - cpstat os -f cpu alanları: github.com/yuriskinfo/cheat-sheets (cpstat reference)
//  - fw monitor başlık satırları ve "[vs_0][fw_N] eth1:i[60]: …" biçimi: CheckMates "R80.20 cheat sheet - fw monitor"
// Emin olunmayan çıktılar "# [Simülatör] …" satırıyla işaretlenir.
const CgLabGaia = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, ip2n, n2ip, sameNet } = C;
    const VERSION = { product: 'Check Point Gaia R81.20', build: '631', kernel: '3.10.0-957.21.3cpx86_64', edition: '64-bit', fwBuild: '631' };
    const DATE = 'Thu Sep 24 09:12:40 2026', FWDATE = '24Sep2026 09:12:40';
    const clone = o => JSON.parse(JSON.stringify(o));
    const inNet = (ip, cidr) => { if (!cidr || cidr === 'any') return true; const [n, l] = cidr.split('/'); return sameNet(ip, n, +(l === undefined ? 32 : l)); };
    const isPriv = ip => inNet(ip, '10.0.0.0/8') || inNet(ip, '172.16.0.0/12') || inNet(ip, '192.168.0.0/16');
    const mac = (n) => { const k = (n.match(/\d+$/) || ['0'])[0]; return '00:50:56:8a:1c:' + (16 + +k).toString(16).padStart(2, '0'); };

    // ── Türkçe yardım açıklamaları (clish ? / Tab)
    const KW = {
        show: 'Yapılandırma ve durum bilgisi göster', set: 'Bir ayarı değiştir', add: 'Yeni öğe ekle', delete: 'Öğe sil', save: 'Yapılandırmayı kalıcı kaydet',
        config: 'Çalışan yapılandırmayı açılışa yaz', expert: 'Expert (bash) kabuğuna geç', exit: 'Kabuktan çık', quit: 'Kabuktan çık', reboot: 'Cihazı yeniden başlat',
        history: 'Komut geçmişi', ping: 'Erişilebilirlik testi', version: 'Sürüm bilgisi', all: 'Tümü', hostname: 'Cihaz adı', 'config-state': 'Kaydedilmemiş değişiklik var mı?',
        configuration: 'Yapılandırmayı set komutları olarak göster', interfaces: 'Arayüz listesi / tüm arayüzler', interface: 'Tek arayüz', route: 'Yönlendirme tablosu',
        static: 'Yalnız statik rotalar', dns: 'DNS ayarları', ntp: 'NTP ayarları', servers: 'NTP sunucuları', users: 'Gaia kullanıcıları', cluster: 'ClusterXL', state: 'Durum / aç-kapa',
        commands: 'Bu lab sürümündeki komutlar', 'ipv4-address': 'IPv4 adresi', 'mask-length': 'Önek uzunluğu (ör. 24)', 'subnet-mask': 'Alt ağ maskesi', on: 'Açık / etkin', off: 'Kapalı / sil',
        comments: 'Açıklama', mtu: 'MTU', 'static-route': 'Statik rota', default: 'Varsayılan rota (0.0.0.0/0)', nexthop: 'Sonraki atlama', gateway: 'Ağ geçidi', address: 'Adres ile',
        primary: 'Birincil', secondary: 'İkincil', tertiary: 'Üçüncül', suffix: 'Alan adı son eki', active: 'Servisi aç/kapat', server: 'Sunucu', user: 'Kullanıcı', uid: 'Kullanıcı kimliği',
        homedir: 'Ev dizini', 'expert-password': 'Expert mod parolası', member: 'Küme üyesi', admin: 'Yönetimsel durum', down: 'Yönetimsel olarak devre dışı (failover)', up: 'Normal çalışmaya dön'
    };
    const VARH = { if: 'Arayüz adı (ör. eth1)', ip: 'IPv4 adresi', gw: 'Ağ geçidi IPv4 adresi', pfx: 'Hedef ağ/önek (ör. 10.128.0.0/16)', h: 'Ad', c: 'Metin', u: 'Kullanıcı adı', mask: 'Alt ağ maskesi' };

    function session(lab, opts) {
        const VAR = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        if (VAR) lab = Object.assign({}, lab, { start: (lab.start || []).concat(VAR.start || []), sim: Object.assign({}, lab.sim || {}, VAR.sim || {}), mgmtStart: (lab.mgmtStart || []).concat(VAR.mgmtStart || []), mgmtLate: (lab.mgmtLate || []).concat(VAR.mgmtLate || []), up: VAR.up || lab.up, hosts: VAR.hosts || lab.hosts });
        const SIM = lab.sim || {};
        // Yönetim API'si (mgmt_cli): yalnız lab.mgmt tanımlıysa (standalone kurulum)
        const MGF = lab.mgmt ? ((typeof CgGaiaMgmt !== 'undefined') ? CgGaiaMgmt : require('./gaia-mgmt.js')) : null;
        const MG = MGF ? MGF.create({ gw: lab.mgmt.gw || lab.hostname || 'gw-a', isIp, inNet: (ip, c) => inNet(ip, c), netOf: C.netOf, n2ip }) : null;
        const rulesNow = () => (MG && MG.rules()) || SIM.rules || [];
        const natNow = () => (MG && MG.nat(SIM.wan || 'eth1')) || SIM.nat || [];
        const policyNow = () => (MG && MG.policy()) || SIM.policy || { name: 'Standard' };
        const IFS = lab.ifaces || ['eth0', 'eth1', 'eth2', 'eth3'];
        const S = {
            m: baseModel(), saved: null, mode: 'clish', stack: [], pending: null, loggedOut: false, ev: [], hist: [], answers: {},
            rt: { clAdmin: false, clPerm: false, failovers: 0, lastEvt: null, vpnDebug: false, ikeDebug: false, vpnTried: false, backups: [], snaps: [], kd: null }, files: {}
        };
        function baseModel() {
            const ifs = {};
            IFS.forEach(n => { ifs[n] = { ip: null, len: null, state: n === 'eth0' ? 'on' : 'off', comments: '', mtu: 1500 }; });
            return { hostname: lab.hostname || 'gw-a', ifs, routes: {}, dns: {}, ntp: { active: false, servers: {} }, users: { admin: { uid: 0, home: '/home/admin', pw: true } }, expertPw: lab.expertPw || 'Expert-Lab1',
                allowed: ['any'], inact: 10, pwc: { min: 6, cx: 2 }, rba: { admin: ['adminRole'] }, syslog: [], tz: 'Etc / GMT', dhcp: { on: false, subnets: {} }, bonds: {} };
        }
        const M = () => S.m;
        const log = o => { S.ev.push(Object.assign({ mode: S.mode }, o)); };
        const host = () => M().hostname;
        const parentOf = n => (n.match(/^(eth\d+)\.\d+$/) || [])[1];
        const bondOf = n => Object.keys(M().bonds || {}).find(g => M().bonds[g].members.includes(n));
        const memberUp = n => (lab.up || []).includes(n) && (M().ifs[n] || {}).state === 'on';
        function bondUp(n) {
            const b = (M().bonds || {})[n.slice(4)]; if (!b) return false;
            const k = b.members.filter(memberUp).length;
            return k > 0 && !(b.mode === '8023AD' && b.minl > 0 && k < b.minl);
        }
        const linkUp = n => n === 'lo' || (/^bond\d+$/.test(n) ? bondUp(n) : parentOf(n) ? (lab.up || []).includes(parentOf(n)) && (M().ifs[parentOf(n)] || {}).state === 'on' : (lab.up || []).includes(n));
        const ifList = () => Object.keys(M().ifs).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
        const ifUp = n => !!M().ifs[n] && M().ifs[n].state === 'on' && linkUp(n);

        // ── RIB: bağlı ağlar + etkin statik rotalar
        function rib() {
            const out = [], m = M();
            for (const [n, i] of Object.entries(m.ifs)) if (i.ip && ifUp(n)) out.push({ type: 'C', net: n2ip(C.netOf(i.ip, i.len)), len: i.len, dev: n });
            out.push({ type: 'C', net: '127.0.0.0', len: 8, dev: 'lo' });
            for (const [p, r] of Object.entries(m.routes)) {
                const c = out.find(x => x.type === 'C' && x.dev !== 'lo' && inNet(r.gw, x.net + '/' + x.len));
                if (!c) continue;
                const [net, len] = p === 'default' ? ['0.0.0.0', 0] : p.split('/');
                out.push({ type: 'S', net, len: +len, dev: c.dev, gw: r.gw, def: p === 'default' });
            }
            return out.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }
        function inactive() {
            const act = rib();
            return Object.entries(M().routes).filter(([p, r]) => !act.some(x => x.type === 'S' && x.gw === r.gw && (p === 'default' ? x.len === 0 : x.net + '/' + x.len === p)))
                .map(([p, r]) => { const [net, len] = p === 'default' ? ['0.0.0.0', 0] : p.split('/'); return { type: 'S', net, len: +len, gw: r.gw, inactive: true }; });
        }
        function lookup(ip) { let best = null; for (const r of rib()) if (inNet(ip, r.net + '/' + r.len) && (!best || r.len > best.len)) best = r; return best; }
        const ifIp = n => (M().ifs[n] || {}).ip;

        // ═══ clish komut tanımları ═════════════════════════════════════════
        const ctx = { ifNorm: s => (/^(eth\d+(\.\d{1,4})?|lo|bond\d{1,4})$/.test(s) ? s : null), ifValid: n => !!M().ifs[n] };
        const E = (o) => ({ err: 'value', msg: o });
        const CL = C.build([
            { p: 'show version all', run: showVersion },
            { p: 'show hostname', run: () => host() },
            { p: 'show config-state', run: () => (dirty() ? 'unsaved' : 'saved') },
            { p: 'show configuration', run: () => showConf() },
            { p: 'show interfaces', run: () => ifList().join('\n') },
            { p: 'show interfaces all', run: () => ifList().map(showIf).join('\n\n') },
            { p: 'show interface IFNAME$if', run: a => showIf(a.if) },
            { p: 'show route', run: () => showRoute(false) },
            { p: 'show route static', run: () => showRoute(true) },
            { p: 'show route inactive', run: () => showRoute(false, 'inactive') },
            { p: 'show route all', run: () => showRoute(false, 'all') },
            { p: 'show route destination A.B.C.D$ip', run: a => showRoute(false, a.ip) },
            { p: 'add interface IFNAME$if vlan (2-4094)$vid', run: a => addVlan(a.if, a.vid) },
            { p: 'delete interface IFNAME$if vlan (2-4094)$vid', run: a => delVlan(a.if, a.vid) },
            { p: 'show allowed-client all', run: showAllowed },
            { p: 'add allowed-client host ipv4-address A.B.C.D$ip', run: a => allowAdd(a.ip + '/32') },
            { p: 'add allowed-client network ipv4-address A.B.C.D$ip mask-length (1-32)$len', run: a => { if (n2ip(C.netOf(a.ip, a.len)) !== a.ip) return E('# [Simülatör] ' + a.ip + '/' + a.len + ' bir ağ adresi değil (ağ adresi: ' + n2ip(C.netOf(a.ip, a.len)) + ').'); return allowAdd(a.ip + '/' + a.len); } },
            { p: 'add allowed-client host any-host', run: () => allowAdd('any') },
            { p: 'delete allowed-client host ipv4-address A.B.C.D$ip', run: a => allowDel(a.ip + '/32') },
            { p: 'delete allowed-client network ipv4-address A.B.C.D$ip', run: a => allowDel(M().allowed.find(x => x !== 'any' && x.split('/')[0] === a.ip && x.split('/')[1] !== '32') || '-') },
            { p: 'delete allowed-client host any-host', run: () => allowDel('any') },
            { p: 'set inactivity-timeout (1-720)$t', run: a => { M().inact = a.t; } },
            { p: 'show inactivity-timeout', run: () => 'CLI inactivity timeout is ' + M().inact + ' minutes\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'set password-controls min-password-length (6-128)$n', run: a => { M().pwc.min = a.n; } },
            { p: 'set password-controls complexity (1-4)$n', run: a => { M().pwc.cx = a.n; } },
            { p: 'show password-controls all', run: () => ['Password Strength', '  Minimum Password Length        ' + M().pwc.min, '  Password Complexity            ' + M().pwc.cx, '# [Simülatör] Yalnız bu lab\'daki ayarlar gösteriliyor; biçim temsilidir.'].join('\n') },
            { p: 'set user WORD$u password', run: a => setUserPw(a.u) },
            { p: 'add rba user WORD$u roles WORD$r', run: a => { if (!ROLES.includes(a.r)) return E('# [Simülatör] Bu lab\'daki roller: ' + ROLES.join(', ') + ' (büyük/küçük harf önemli).'); if (!M().users[a.u]) return E('# [Simülatör] "' + a.u + '" adlı kullanıcı yok; önce add user.'); const L = M().rba[a.u] || (M().rba[a.u] = []); if (!L.includes(a.r)) L.push(a.r); } },
            { p: 'delete rba user WORD$u roles WORD$r', run: a => { const L = M().rba[a.u] || []; if (!L.includes(a.r)) return E('# [Simülatör] "' + a.u + '" kullanıcısında ' + a.r + ' rolü yok.'); L.splice(L.indexOf(a.r), 1); } },
            { p: 'show rba user WORD$u', run: a => (M().users[a.u] ? 'User: ' + a.u + '\n  Roles: ' + ((M().rba[a.u] || []).join(', ') || '(yok)') + '\n# [Simülatör] Çıktı biçimi temsilidir.' : E('# [Simülatör] "' + a.u + '" adlı kullanıcı yok.')) },
            { p: 'add syslog log-remote-address A.B.C.D$ip level <emerg|alert|crit|err|warning|notice|info|debug|all>$lv', run: a => { const L = M().syslog, x = L.find(y => y.ip === a.ip); if (x) x.lv = a.lv; else L.push({ ip: a.ip, lv: a.lv }); } },
            { p: 'delete syslog log-remote-address A.B.C.D$ip', run: a => { const L = M().syslog, i = L.findIndex(y => y.ip === a.ip); if (i < 0) return E('# [Simülatör] ' + a.ip + ' uzak syslog listesinde yok.'); L.splice(i, 1); } },
            { p: 'show syslog log-remote-addresses', run: () => (M().syslog.length ? M().syslog.map(y => pad(y.ip, 20) + 'level ' + y.lv).join('\n') : '(tanımlı uzak syslog sunucusu yok)') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'set timezone WORD$a / WORD$b', run: a => { const z = a.a + ' / ' + a.b; if (!TZ.includes(z)) return E('# [Simülatör] Bu lab\'da tanınan saat dilimleri: ' + TZ.join(', ')); M().tz = z; } },
            { p: 'set timezone WORD$z', run: a => E(/\//.test(a.z) ? '# [Simülatör] Gaia saat dilimini bölge ve şehir arasında boşluklu "/" ile ister: set timezone ' + a.z.replace('/', ' / ') : '# [Simülatör] Biçim: set timezone <Bölge> / <Şehir> (ör. set timezone Europe / Istanbul)') },
            { p: 'show timezone', run: () => 'Timezone: ' + M().tz.replace(/ \/ /, '/') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'save configuration WORD$f', run: a => { if (!/^[\w.-]+$/.test(a.f)) return E('# [Simülatör] Dosya adı yalnız harf, rakam, "." "-" "_" içermeli.'); S.files[a.f] = showConf(); log({ savedFile: a.f }); } },
            { p: 'add backup local', run: () => addBackup() },
            { p: 'show backups', run: () => (S.rt.backups.length ? ['Backup files:', ...S.rt.backups.map(b => '  /var/log/CPbackup/backups/' + b)].join('\n') : 'No backups found') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'show backup status', run: () => (S.rt.backups.length ? 'Local backup succeeded.\nBackup file: ' + S.rt.backups[S.rt.backups.length - 1] : 'No backup in progress') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'add snapshot WORD$n desc LINE$d', run: a => addSnap(a.n, a.d) },
            { p: 'show snapshots', run: () => (S.rt.snaps.length ? S.rt.snaps.map(x => pad(x.n, 24) + x.d).join('\n') : 'No snapshots') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'show dns', run: showDns },
            { p: 'show ntp servers', run: showNtp },
            { p: 'show users', run: showUsers },
            { p: 'show cluster state', run: () => { if (!SIM.cluster) return E('# [Simülatör] Bu gateway bir ClusterXL üyesi değil.'); log({ clstate: clMembers()[0].st }); return clusterState(); } },
            { p: 'show commands', run: () => '# [Simülatör] Bu lab sürümündeki clish komutları (gerçek Gaia\'da liste çok daha uzundur):\n' + CL.map(c => c.p.replace(/\$\w+/g, '').replace(/IFNAME/g, '<arayüz>').replace(/A\.B\.C\.D/g, '<ip>').replace(/WORD/g, '<değer>').replace(/LINE/g, '<metin>')).join('\n') },
            { p: 'set hostname WORD$h', run: a => { if (!/^[A-Za-z][A-Za-z0-9-]{0,62}$/.test(a.h)) return E('# [Simülatör] Geçersiz ad: harfle başlamalı; yalnız harf, rakam ve "-".'); M().hostname = a.h; } },
            { p: 'set interface IFNAME$if ipv4-address A.B.C.D$ip mask-length (1-32)$len', run: a => setIp(a.if, a.ip, a.len) },
            { p: 'set interface IFNAME$if ipv4-address A.B.C.D$ip subnet-mask MASK$mask', run: a => setIp(a.if, a.ip, C.maskLen(a.mask)) },
            { p: 'set interface IFNAME$if state <on|off>$st', run: a => { if (a.if === 'lo') return E('# [Simülatör] lo arayüzü kapatılamaz.'); if (/^bond/.test(a.if)) return E('# [Simülatör] Bond arayüzünün durumunu elle değiştirmeyin: bonding sürücüsü üyelerin durumuna göre belirler (Gaia Admin Guide).'); M().ifs[a.if].state = a.st; } },
            { p: 'set interface IFNAME$if comments LINE$c', run: a => { M().ifs[a.if].comments = a.c.replace(/^"(.*)"$/, '$1'); } },
            { p: 'set interface IFNAME$if mtu (68-16000)$mtu', run: a => { M().ifs[a.if].mtu = a.mtu; } },
            { p: 'delete interface IFNAME$if ipv4-address', run: a => { M().ifs[a.if].ip = null; M().ifs[a.if].len = null; } },
            { p: 'set static-route default nexthop gateway address A.B.C.D$gw <on|off>$st', run: a => setRoute('default', a.gw, a.st) },
            { p: 'set static-route default off', run: () => { delete M().routes.default; } },
            { p: 'set static-route WORD$pfx nexthop gateway address A.B.C.D$gw <on|off>$st', run: a => { const p = pfx(a.pfx); if (!p) return { err: 'invalid', col: 17 }; return setRoute(p, a.gw, a.st); } },
            { p: 'set static-route WORD$pfx off', run: a => { const p = pfx(a.pfx); if (!p) return { err: 'invalid', col: 17 }; delete M().routes[p]; } },
            { p: 'set dns <primary|secondary|tertiary>$k A.B.C.D$ip', run: a => { M().dns[a.k] = a.ip; } },
            { p: 'set dns suffix WORD$s', run: a => { M().dns.suffix = a.s; } },
            { p: 'delete dns <primary|secondary|tertiary>$k', run: a => { delete M().dns[a.k]; } },
            { p: 'set ntp active <on|off>$st', run: a => { M().ntp.active = a.st === 'on'; } },
            { p: 'set ntp server <primary|secondary>$k A.B.C.D$ip version (1-4)$v', run: a => { M().ntp.servers[a.k] = { ip: a.ip, ver: a.v }; } },
            { p: 'add user WORD$u uid (0-65535)$uid homedir WORD$h', run: a => { if (M().users[a.u]) return E('# [Simülatör] "' + a.u + '" kullanıcısı zaten var.'); M().users[a.u] = { uid: a.uid, home: a.h }; } },
            { p: 'delete user WORD$u', run: a => { if (a.u === 'admin') return E('# [Simülatör] admin kullanıcısı silinemez.'); if (!M().users[a.u]) return E('# [Simülatör] "' + a.u + '" adlı kullanıcı yok.'); delete M().users[a.u]; } },
            { p: 'set expert-password', run: () => setExpertPw() },
            { p: 'set cluster member admin <down|up>$st', run: a => (SIM.cluster ? clAdmin(a.st, false) : E('# [Simülatör] Bu gateway bir ClusterXL üyesi değil.')) },
            // DHCP sunucusu (Gaia Admin Guide R81.20 s. 231–240; show dhcp server all biçimi s. 240)
            { p: 'add dhcp server subnet A.B.C.D$net netmask (1-32)$len', run: a => dhcpAdd(a.net, a.len) },
            { p: 'add dhcp server subnet A.B.C.D$net include-ip-pool start A.B.C.D$s end A.B.C.D$e', run: a => dhcpPool(a.net, 'inc', a.s, a.e) },
            { p: 'add dhcp server subnet A.B.C.D$net exclude-ip-pool start A.B.C.D$s end A.B.C.D$e', run: a => dhcpPool(a.net, 'exc', a.s, a.e) },
            { p: 'set dhcp server subnet A.B.C.D$net <enable|disable>$st', run: a => dhcpSet(a.net, x => { x.on = a.st === 'enable'; }) },
            { p: 'set dhcp server subnet A.B.C.D$net include-ip-pool WORD$r <enable|disable>$st', run: a => dhcpPoolSt(a.net, 'inc', a.r, a.st) },
            { p: 'set dhcp server subnet A.B.C.D$net exclude-ip-pool WORD$r <enable|disable>$st', run: a => dhcpPoolSt(a.net, 'exc', a.r, a.st) },
            { p: 'set dhcp server subnet A.B.C.D$net default-lease (1-4294967295)$n', run: a => dhcpSet(a.net, x => { x.dl = a.n; }) },
            { p: 'set dhcp server subnet A.B.C.D$net max-lease (1-4294967295)$n', run: a => dhcpSet(a.net, x => { x.ml = a.n; }) },
            { p: 'set dhcp server subnet A.B.C.D$net default-gateway A.B.C.D$gw', run: a => dhcpSet(a.net, x => (inNet(a.gw, a.net + '/' + x.len) ? void (x.gw = a.gw) : E('# [Simülatör] ' + a.gw + ', ' + a.net + '/' + x.len + ' alt ağında değil: istemciler bu ağ geçidine ulaşamaz.'))) },
            { p: 'set dhcp server subnet A.B.C.D$net domain WORD$d', run: a => dhcpSet(a.net, x => { x.domain = a.d; }) },
            { p: 'set dhcp server subnet A.B.C.D$net dns LINE$d', run: a => { const L = a.d.split(/[\s,]+/).filter(Boolean); if (!L.length || L.length > 3 || !L.every(isIp)) return E('# [Simülatör] dns: en çok üç IPv4 adresi, virgülle ayrılmış (ör. 10.64.10.53, 10.64.10.54).'); return dhcpSet(a.net, x => { x.dns = L; }); } },
            { p: 'set dhcp server <enable|disable>$st', run: a => { M().dhcp.on = a.st === 'enable'; } },
            { p: 'delete dhcp server subnet A.B.C.D$net', run: a => dhcpSet(a.net, () => { delete M().dhcp.subnets[a.net]; }) },
            { p: 'delete dhcp server subnet A.B.C.D$net include-ip-pool WORD$r', run: a => dhcpPoolDel(a.net, 'inc', a.r) },
            { p: 'delete dhcp server subnet A.B.C.D$net exclude-ip-pool WORD$r', run: a => dhcpPoolDel(a.net, 'exc', a.r) },
            { p: 'show dhcp server all', run: () => { log({ dhcpshow: 'all' }); return dhcpShow(); } },
            { p: 'show dhcp server status', run: () => 'DHCP Server ' + (M().dhcp.on ? 'Enabled' : 'Disabled') },
            { p: 'show dhcp server subnets', run: () => (Object.keys(M().dhcp.subnets).map(n => pad(n + '/' + M().dhcp.subnets[n].len, 22) + (M().dhcp.subnets[n].on ? 'Enabled' : 'Disabled')).join('\n') || '(DHCP alt ağı yok)') + '\n# [Simülatör] Çıktı biçimi temsilidir.' },
            { p: 'show dhcp server subnet A.B.C.D$net ip-pools', run: a => dhcpSet(a.net, x => dhcpPools(x).join('\n') + '\n# [Simülatör] Çıktı biçimi temsilidir.') },
            // Bond (Gaia Admin Guide R81.20 s. 137–156; clish'te "bonding group")
            { p: 'add bonding group (0-1024)$g', run: a => bondAdd(a.g) },
            { p: 'add bonding group (0-1024)$g interface IFNAME$if', run: a => bondMember(a.g, a.if) },
            { p: 'delete bonding group (0-1024)$g interface IFNAME$if', run: a => bondDelMember(a.g, a.if) },
            { p: 'delete bonding group (0-1024)$g', run: a => bondDel(a.g) },
            { p: 'set bonding group (0-1024)$g mode round-robin', run: a => bondSet(a.g, b => { b.mode = 'round-robin'; b.primary = null; b.lacp = null; b.xmit = null; }) },
            { p: 'set bonding group (0-1024)$g mode active-backup', run: a => bondSet(a.g, b => { b.mode = 'active-backup'; b.lacp = null; b.xmit = null; }) },
            { p: 'set bonding group (0-1024)$g mode active-backup primary IFNAME$if', run: a => bondSet(a.g, b => (b.members.includes(a.if) ? void Object.assign(b, { mode: 'active-backup', primary: a.if, lacp: null, xmit: null }) : E('# [Simülatör] ' + a.if + ' bu bonding group\'un üyesi değil.'))) },
            { p: 'set bonding group (0-1024)$g mode xor xmit-hash-policy <layer2|layer3+4>$x', run: a => bondSet(a.g, b => { Object.assign(b, { mode: 'xor', xmit: a.x, lacp: null, primary: null }); }) },
            { p: 'set bonding group (0-1024)$g mode 8023ad', run: a => bondSet(a.g, b => { Object.assign(b, { mode: '8023AD', lacp: b.lacp || 'slow', primary: null }); }) },
            { p: 'set bonding group (0-1024)$g mode 8023ad lacp-rate <slow|fast>$r', run: a => bondSet(a.g, b => { Object.assign(b, { mode: '8023AD', lacp: a.r, primary: null }); }) },
            { p: 'set bonding group (0-1024)$g mode abxor LINE$x', run: () => E('# [Simülatör] ABXOR modu bu lab sürümünde desteklenmiyor.') },
            { p: 'set bonding group (0-1024)$g up-delay (0-5000)$n', run: a => bondSet(a.g, b => { b.up = a.n; }) },
            { p: 'set bonding group (0-1024)$g down-delay (0-5000)$n', run: a => bondSet(a.g, b => { b.down = a.n; }) },
            { p: 'set bonding group (0-1024)$g mii-interval (1-5000)$n', run: a => bondSet(a.g, b => { b.mii = a.n; }) },
            { p: 'set bonding group (0-1024)$g min-links (0-8)$n', run: a => bondSet(a.g, b => { b.minl = a.n; }) },
            { p: 'show bonding group (0-1024)$g', run: a => { log({ bondshow: String(a.g) }); return bondShow(a.g); } },
            { p: 'show bonding groups', run: () => { log({ bondshow: 'all' }); return Object.keys(M().bonds).length ? Object.keys(M().bonds).map(g => 'Bond bond' + g + '\n' + bondShow(g)).join('\n\n') + '\n# [Simülatör] "groups" çıktısı her grubu "show bonding group" biçiminde sıralar.' : '# [Simülatör] Tanımlı bonding group yok.'; } },
            { p: 'save config', run: () => { S.saved = clone(M()); } },
            { p: 'expert', run: () => enterExpert() },
            { p: 'exit', run: () => leave() },
            { p: 'quit', run: () => leave() },
            { p: 'reboot', run: () => askReboot() },
            { p: 'history', run: () => { const b = Math.max(0, S.hist.length - 20); return S.hist.slice(b).map((x, i) => pad(String(b + i + 1), 5) + x).join('\n'); } },
            { p: 'ping A.B.C.D$ip', run: a => ping(a.ip) },
        ]);
        // Gerçek Gaia'da var, bu lab sürümünde yok → dürüst mesaj
        const CL_UNSUP = ['show asset', 'show sysenv', 'show uptime', 'show clock', 'show ntp active', 'show ntp current', 'show dns primary', 'show dns secondary', 'show arp',
            'show ospf', 'show route bgp', 'show route ospf', 'show route summary', 'show ssh', 'show snmp', 'show syslog',
            'show extended', 'show routed', 'show cluster members', 'show cluster failover', 'show user', 'show rba', 'show allowed-client',
            'set user', 'add arp', 'add backup', 'set ospf', 'set snmp', 'set syslog', 'set ssh', 'set message',
            'set allowed-client', 'set password-controls', 'lock database', 'unlock database', 'load configuration', 'installer', 'set router-id', 'set snapshot', 'delete snapshot', 'set backup', 'restore backup',
            'set clienv', 'set format', 'set date', 'set time', 'set arp', 'set web', 'add allowed-client', 'set snapshot', 'set lom', 'show lom', 'show virtual-system'];
        const EXPERT_ROOTS = ['fw', 'cpstat', 'cphaprob', 'clusterXL_admin', 'vpn', 'tcpdump', 'cpview', 'cpinfo', 'fwaccel', 'cplic', 'cpwd_admin', 'cpstop', 'cpstart', 'cprestart', 'cpconfig', 'ifconfig', 'ip', 'netstat', 'top', 'df', 'cat', 'grep', 'less', 'tail'];

        const ROLES = ['adminRole', 'monitorRole'];
        const TZ = ['Etc / GMT', 'Europe / Istanbul', 'Europe / London', 'Europe / Berlin', 'Asia / Dubai', 'America / New_York'];
        const ADMIN_SRC = SIM.adminSrc || '10.240.0.10';
        const allowedOk = ip => M().allowed.some(c => c === 'any' || inNet(ip, c));
        function addVlan(n, vid) {
            if (parentOf(n) || n === 'lo' || n === 'eth0') return E('# [Simülatör] VLAN yalnız fiziksel veri arayüzüne eklenir (ör. eth3).');
            const v = n + '.' + vid;
            if (M().ifs[v]) return E('# [Simülatör] ' + v + ' zaten var.');
            M().ifs[v] = { ip: null, len: null, state: 'on', comments: '', mtu: M().ifs[n].mtu, vlan: true };
        }
        function delVlan(n, vid) {
            const v = n + '.' + vid;
            if (!M().ifs[v]) return E('# [Simülatör] ' + v + ' adlı VLAN arayüzü yok.');
            if (M().ifs[v].ip) return E('# [Simülatör] Önce IP adresini kaldırın: delete interface ' + v + ' ipv4-address');
            delete M().ifs[v];
        }
        function showAllowed() {
            const L = [pad('Type', 10) + pad('Address', 18) + 'Mask-length'];
            M().allowed.forEach(c => { if (c === 'any') L.push(pad('host', 10) + pad('any-host', 18) + '-'); else { const [ip, len] = c.split('/'); L.push(pad(len === '32' ? 'host' : 'network', 10) + pad(ip, 18) + (len === '32' ? '-' : len)); } });
            L.push('# [Simülatör] Çıktı biçimi temsilidir. Bu liste Gaia\'nın SSH ve WebUI (Gaia Portal) erişimini sınırlar; SmartConsole bağlantısı ve politika kuralları ayrıdır.');
            return L.join('\n');
        }
        function allowAdd(c) {
            if (M().allowed.includes(c)) return E('# [Simülatör] ' + (c === 'any' ? 'any-host' : c) + ' zaten listede.');
            M().allowed.push(c);
        }
        function allowDel(c) {
            const i = M().allowed.indexOf(c);
            if (i < 0) return E('# [Simülatör] Bu kayıt izinli istemci listesinde yok (show allowed-client all).');
            M().allowed.splice(i, 1);
            if (!M().allowed.length || !allowedOk(ADMIN_SRC)) {
                log({ warn: 'lockout' });
                return '# [Simülatör] UYARI: Bağlandığınız adres (' + ADMIN_SRC + ') artık izinli istemci listesinde yok. Bu oturum kapandığında SSH/WebUI ile geri giremezsiniz; yalnız konsol (ya da LOM) kalır.\n# Doğru sıra: önce kendi yönetim ağınızı ekleyin, sonra any-host\'u silin.';
            }
        }
        const pwClasses = p => [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(r => r.test(p)).length;
        function setUserPw(u) {
            if (!M().users[u]) return E('# [Simülatör] "' + u + '" adlı kullanıcı yok; önce add user.');
            S.pending = { prompt: 'New password:', secret: true, fn: (p1) => {
                const c = M().pwc;
                if (p1.length < c.min) { log({ raw: '***', err: 'pwpolicy' }); return 'Password is only ' + p1.length + ' characters long; it must be at least ' + c.min + ' characters in length.\n# [Simülatör] Parola politikası: en az ' + c.min + ' karakter.'; }
                if (c.cx > 1 && pwClasses(p1) < c.cx) { log({ raw: '***', err: 'pwpolicy' }); return '# [Simülatör] Parola karmaşıklık kuralına uymuyor: en az ' + c.cx + ' farklı karakter türü (küçük harf, büyük harf, rakam, sembol) gerekli.'; }
                S.pending = { prompt: 'Verify new password:', secret: true, fn: (p2) => {
                    if (p1 !== p2) { log({ raw: '***', err: 'pwmismatch' }); return '# [Simülatör] Parolalar eşleşmiyor; komutu yeniden çalıştırın.'; }
                    M().users[u].pw = true; M().users[u].pwLen = p1.length; M().users[u].pwCx = pwClasses(p1); log({ raw: '***', canon: 'user-password-set ' + u }); return '';
                } };
                return '';
            } };
            return '';
        }
        function addBackup() {
            const n = 'backup_' + host() + '_24_Sep_2026_10_2' + S.rt.backups.length + '.tgz';
            S.rt.backups.push(n); log({ backup: n });
            return 'Creating backup package. Use the command \'show backups\' to monitor creation progress.\n# [Simülatör] Yedek hemen tamamlandı kabul edildi (gerçekte birkaç dakika sürer).';
        }
        function addSnap(n, d) {
            if (!/^[\w-]+$/.test(n)) return E('# [Simülatör] Snapshot adı yalnız harf, rakam, "-" ve "_" içermeli.');
            if (S.rt.snaps.some(x => x.n === n)) return E('# [Simülatör] "' + n + '" adlı snapshot zaten var.');
            S.rt.snaps.push({ n, d: d.replace(/^"(.*)"$/, '$1') }); log({ snap: n });
            return '# [Simülatör] Snapshot oluşturuldu. Gerçekte bu işlem dakikalar sürer, diskte boş alan (LVM) ister; biterken show snapshots ile izlenir.';
        }

        function pfx(s) {
            const m = String(s).match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
            if (!m || !isIp(m[1]) || +m[2] > 32) return null;
            if (n2ip(C.netOf(m[1], +m[2])) !== m[1]) return null;
            return m[1] + '/' + m[2];
        }
        function setIp(n, ip, len) {
            if (n === 'lo') return E('# [Simülatör] lo arayüzünün adresi değiştirilemez.');
            if (bondOf(n)) return E('# [Simülatör] ' + n + ' bond' + bondOf(n) + ' üyesi: IP adresi bond arayüzüne verilir (set interface bond' + bondOf(n) + ' ipv4-address …).');
            if (len < 1 || len > 32) return { err: 'invalid' };
            if (len < 31 && (ip2n(ip) === C.netOf(ip, len) || ip2n(ip) === C.netOf(ip, len) + 2 ** (32 - len) - 1)) return E('# [Simülatör] ' + ip + '/' + len + ' bir ağ ya da yayın adresi; arayüze atanamaz.');
            for (const [k, i] of Object.entries(M().ifs)) if (k !== n && i.ip && (sameNet(ip, i.ip, Math.min(len, i.len)))) return E('# [Simülatör] ' + ip + '/' + len + ', ' + k + ' arayüzündeki ağ ile çakışıyor.');
            M().ifs[n].ip = ip; M().ifs[n].len = len;
        }
        // ── DHCP sunucusu modeli: M().dhcp = { on, subnets: { '<ağ>': { len, on, pools: [{ t: 'inc'|'exc', r: 'a-b', on }], dl, ml, gw, domain, dns[] } } }
        // Yeni alt ağ ve havuz için açık/kapalı varsayılanı belgede yazmıyor: alt ağ kapalı (Portal'daki "Enable DHCP" adımı), havuz açık kabul edildi.
        function dhcpAdd(net, len) {
            if (n2ip(C.netOf(net, len)) !== net) return E('# [Simülatör] ' + net + '/' + len + ' bir ağ adresi değil (ağ adresi: ' + n2ip(C.netOf(net, len)) + ').');
            if (!Object.values(M().ifs).some(i => i.ip && i.len === len && sameNet(i.ip, net, len))) return E('# [Simülatör] ' + net + '/' + len + ' hiçbir Gaia arayüzünün alt ağı değil: DHCP alt ağı bir arayüzün ağıyla aynı olmalı.');
            const x = M().dhcp.subnets[net];
            if (x) x.len = len; else M().dhcp.subnets[net] = { len, on: false, pools: [], dl: 43200, ml: 86400, gw: null, domain: null, dns: [] };
        }
        function dhcpSet(net, fn) { const x = M().dhcp.subnets[net]; if (!x) return E('# [Simülatör] ' + net + ' için DHCP alt ağı yok; önce: add dhcp server subnet ' + net + ' netmask <önek>'); return fn(x); }
        function dhcpPool(net, t, a, b) {
            return dhcpSet(net, x => {
                const c = net + '/' + x.len;
                if (!inNet(a, c) || !inNet(b, c) || ip2n(a) > ip2n(b)) return E('# [Simülatör] Havuz ' + c + ' içinde olmalı ve başlangıç ≤ bitiş olmalı.');
                const r = a + '-' + b;
                if (!x.pools.some(p => p.t === t && p.r === r)) x.pools.push({ t, r, on: true });
            });
        }
        function dhcpPoolSt(net, t, r, st) { return dhcpSet(net, x => { const p = x.pools.find(q => q.t === t && q.r === r); if (!p) return E('# [Simülatör] ' + r + ' bu alt ağın ' + (t === 'inc' ? 'include' : 'exclude') + ' havuzlarında yok (biçim: <ilk>-<son>).'); p.on = st === 'enable'; }); }
        function dhcpPoolDel(net, t, r) { return dhcpSet(net, x => { const i = x.pools.findIndex(q => q.t === t && q.r === r); if (i < 0) return E('# [Simülatör] ' + r + ' havuzu yok.'); x.pools.splice(i, 1); }); }
        function dhcpPools(x) {
            const L = [], inc = x.pools.filter(p => p.t === 'inc'), exc = x.pools.filter(p => p.t === 'exc');
            if (inc.length) L.push('Pools (Include List)', ...inc.map(p => p.r + ' : ' + (p.on ? 'enabled' : 'disabled')));
            if (exc.length) L.push('Pools (Exclude List)', ...exc.map(p => p.r + ' : ' + (p.on ? 'enabled' : 'disabled')));
            return L;
        }
        function dhcpShow() {
            const d = M().dhcp, L = ['DHCP Server ' + (d.on ? 'Enabled' : 'Disabled')];
            for (const [n, x] of Object.entries(d.subnets)) {
                L.push('DHCP-Subnet ' + n, 'State ' + (x.on ? 'Enabled' : 'Disabled'), 'Net-Mask ' + x.len, 'Maximum-Lease ' + x.ml, 'Default-Lease ' + x.dl);
                if (x.domain) L.push('Domain ' + x.domain);
                if (x.gw) L.push('Default Gateway ' + x.gw);
                if (x.dns.length) L.push('DNS ' + x.dns.join(', '));
                L.push(...dhcpPools(x));
            }
            return L.join('\n');
        }
        // ── Bond (bonding group) modeli: M().bonds = { '<id>': { members, mode, primary, lacp, xmit, up, down, mii, minl } }; arayüz adı bond<id>
        function bondAdd(g) {
            if (M().bonds[g]) return E('# [Simülatör] bonding group ' + g + ' zaten var.');
            M().bonds[g] = { members: [], mode: 'round-robin', primary: null, lacp: null, xmit: null, up: 200, down: 200, mii: 100, minl: 0 };
            M().ifs['bond' + g] = { ip: null, len: null, state: 'on', comments: '', mtu: 1500 };
        }
        function bondSet(g, fn) { const b = M().bonds[g]; if (!b) return E('# [Simülatör] bonding group ' + g + ' yok; önce: add bonding group ' + g); return fn(b); }
        function bondMember(g, n) {
            return bondSet(g, b => {
                if (!/^eth\d+$/.test(n) || n === 'eth0') return E('# [Simülatör] Bond üyesi fiziksel bir veri arayüzü olmalı (ör. eth4).');
                if (b.members.includes(n)) return E('# [Simülatör] ' + n + ' zaten bond' + g + ' üyesi.');
                const o = bondOf(n); if (o) return E('# [Simülatör] ' + n + ' zaten bond' + o + ' üyesi.');
                if (M().ifs[n].ip) return E('# [Simülatör] ' + n + ' üzerinde IP adresi var (' + M().ifs[n].ip + '/' + M().ifs[n].len + '). Bond üyesinin IP adresi olmamalı: önce delete interface ' + n + ' ipv4-address');
                if (Object.keys(M().ifs).some(k => parentOf(k) === n)) return E('# [Simülatör] ' + n + ' üzerinde VLAN alt arayüzü var; bond üyesi yapılamaz.');
                if (b.members.length >= 8) return E('# [Simülatör] Bir bond en çok sekiz üye içerir.');
                b.members.push(n);
            });
        }
        function bondDelMember(g, n) {
            return bondSet(g, b => {
                const i = b.members.indexOf(n); if (i < 0) return E('# [Simülatör] ' + n + ' bond' + g + ' üyesi değil.');
                const prim = b.primary || b.members[0];
                if (n === prim && b.members.length > 1) return E('# [Simülatör] Önce birincil olmayan üyeleri silin; birincil üye (' + prim + ') en son silinir.');
                b.members.splice(i, 1); if (b.primary === n) b.primary = null;
            });
        }
        function bondDel(g) {
            return bondSet(g, b => {
                if (b.members.length) return E('# [Simülatör] Önce üyeleri silin (delete bonding group ' + g + ' interface <ad>), sonra grubu.');
                delete M().bonds[g]; delete M().ifs['bond' + g];
            });
        }
        function bondShow(g) {
            const b = M().bonds[g]; if (!b) return E('# [Simülatör] bonding group ' + g + ' yok.');
            return ['Bond Configuration', 'xmit-hash-policy ' + (b.xmit || 'Not configured'), 'down-delay ' + b.down, 'primary ' + (b.primary || 'Not configured'), 'lacp-rate ' + (b.lacp || 'Not configured'),
                'mode ' + b.mode, 'up-delay ' + b.up, 'mii-interval ' + b.mii, 'Bond Interfaces', ...b.members].join('\n');
        }
        // cat /proc/net/bonding/bond<id> (Gaia Admin Guide R81.20 s. 154–156 örnek çıktıları)
        function procBond(n) {
            const b = M().bonds[n.slice(4)]; if (!b) return { err: 'invalid', msg: 'cat: /proc/net/bonding/' + n + ': No such file or directory' };
            const MODE = { 'round-robin': 'load balancing (round-robin)', 'active-backup': 'fault-tolerance (active-backup)', xor: 'load balancing (xor)', '8023AD': 'IEEE 802.3ad Dynamic link aggregation' };
            const up = b.members.filter(memberUp), L = ['Ethernet Channel Bonding Driver: v3.2.4 (January 28, 2008)', 'Bonding Mode: ' + MODE[b.mode]];
            if (b.mode === 'xor' || b.mode === '8023AD') L.push('Transmit Hash Policy: ' + (b.xmit === 'layer3+4' ? 'layer3+4 (1)' : 'layer2 (0)'));
            if (b.mode === 'active-backup') { const pr = b.primary || b.members[0]; L.push('Primary Slave: ' + (pr || 'None'), 'Currently Active Slave: ' + (memberUp(pr) ? pr : (up[0] || 'None'))); }
            L.push('MII Status: ' + (bondUp(n) ? 'up' : 'down'), 'MII Polling Interval (ms): ' + b.mii, 'Up Delay (ms): ' + b.up, 'Down Delay (ms): ' + b.down);
            if (b.mode === '8023AD') L.push('802.3ad info', 'LACP rate: ' + (b.lacp || 'slow'));
            for (const m of b.members) {
                L.push('Slave Interface: ' + m, 'MII Status: ' + (memberUp(m) ? 'up' : 'down'), 'Link Failure Count: ' + (memberUp(m) ? 0 : 1), 'Permanent HW addr: ' + mac(m));
                if (b.mode === '8023AD') L.push('Aggregator ID: 1');
            }
            return { out: L.join('\n'), log: { procbond: n } };
        }
        function setRoute(p, gw, st) {
            if (st === 'off') { const r = M().routes[p]; if (r && r.gw === gw) delete M().routes[p]; return; }
            M().routes[p] = { gw };
        }
        const cfgKey = m => JSON.stringify({ h: m.hostname, i: m.ifs, r: m.routes, d: m.dns, n: m.ntp, u: m.users, e: m.expertPw, a: m.allowed, t: m.inact, p: m.pwc, b: m.rba, s: m.syslog, z: m.tz, x: m.dhcp, y: m.bonds });
        const dirty = () => cfgKey(M()) !== cfgKey(S.saved);

        // ── show çıktıları (modelden)
        function showVersion() {
            return ['Product version ' + VERSION.product, 'OS build ' + VERSION.build, 'OS kernel version ' + VERSION.kernel, 'OS edition ' + VERSION.edition,
                '(eğitim simülatörü — build/kernel numaraları temsilidir)'].join('\n');
        }
        function showIf(n) {
            const i = M().ifs[n], up = ifUp(n);
            const bd = /^bond\d+$/.test(n) ? M().bonds[n.slice(4)] : null;
            return ['Interface ' + n, '    state ' + i.state, '    mac-addr ' + mac(bd && bd.members[0] ? bd.members[0] : n), '    type ' + (bd ? 'bond' : 'ethernet'), '    link-state ' + (up ? 'link up' : 'link down'), '    mtu ' + i.mtu,
                '    auto-negotiation on', '    speed ' + (up ? '1000M' : 'N/A'), '    ipv6-autoconfig Not configured', '    duplex ' + (up ? 'full' : 'N/A'), '    monitor-mode Not configured',
                '    link-speed ' + (up ? '1000M/full' : 'Not configured'), '    comments' + (i.comments ? ' ' + i.comments : ''), '    ipv4-address ' + (i.ip ? i.ip + '/' + i.len : 'Not Configured'),
                '    ipv6-address Not Configured', '    ipv6-local-link-address Not Configured', '', 'Statistics:',
                '    TX bytes:' + (up ? 1834211 : 0) + ' packets:' + (up ? 12877 : 0) + ' errors:0 dropped:0 overruns:0 carrier:0',
                '    RX bytes:' + (up ? 2210944 : 0) + ' packets:' + (up ? 15102 : 0) + ' errors:0 dropped:0 overruns:0 frame:0'].join('\n');
        }
        function showRoute(staticOnly, which) {
            const L = ['Codes: C - Connected, S - Static, R - RIP, B - BGP (D - Default),', '       O - OSPF IntraArea (IA - InterArea, E - External, N - NSSA)',
                '       A - Aggregate, K - Kernel Remnant, H - Hidden, P - Suppressed,', '       U - Unreachable, i - Inactive', ''];
            let list = rib().filter(r => r.dev !== 'lo' || which === undefined);
            if (which === 'inactive') list = inactive();
            else if (which === 'all') list = list.concat(inactive());
            else if (which) { const b = lookup(which); list = b ? [b] : []; if (!b) L.push('# [Simülatör] ' + which + ' için etkin rota yok.'); }
            for (const r of list) {
                if (staticOnly && r.type !== 'S') continue;
                const code = r.type === 'S' ? (r.inactive ? 'S  i' : 'S') : 'C';
                L.push(pad(code, 10) + pad(r.net + '/' + r.len, 20) + (r.inactive ? 'via ' + r.gw + ', inactive (ağ geçidi bağlı bir ağda değil)' : r.type === 'S' ? 'via ' + r.gw + ', ' + r.dev + ', cost 0, age ' + (3600 + ip2n(r.net) % 997) : 'is directly connected, ' + r.dev));
            }
            if (which === 'inactive' && !list.length) L.push('# [Simülatör] Etkin olmayan rota yok.');
            if (which) L.push('# [Simülatör] Bu çıktının biçimi sadeleştirildi.');
            return L.join('\n');
        }
        function showDns() {
            const d = M().dns, L = ['DNS setup', pad('Name', 22) + 'Value', '', pad('Domain', 22) + (d.suffix || '')];
            ['primary', 'secondary', 'tertiary'].forEach(k => L.push(pad('DNS server', 22) + (d[k] || '')));
            return L.join('\n');
        }
        function showNtp() {
            const s = M().ntp.servers, L = [pad('IP Address', 25) + pad('Type', 18) + 'Version'];
            ['primary', 'secondary'].forEach(k => { if (s[k]) L.push(pad(s[k].ip, 25) + pad(k[0].toUpperCase() + k.slice(1), 18) + s[k].ver); });
            return L.join('\n');
        }
        function showUsers() {
            const L = [pad('Login', 12) + pad('Uid', 8) + pad('Gid', 8) + pad('Home Dir.', 18) + pad('Shell', 14) + pad('Real Name', 12) + 'Privileges'];
            for (const [u, x] of Object.entries(M().users)) L.push(pad(u, 12) + pad(x.uid, 8) + pad(u === 'admin' ? 0 : 100, 8) + pad(x.home, 18) + pad('/etc/cli.sh', 14) + pad(u === 'admin' ? 'Admin' : u, 12) + (u === 'admin' ? 'Access to Expert features' : 'None'));
            return L.join('\n');
        }
        function showConf(m) {
            m = m || M();
            const L = ['#', '# Configuration of ' + m.hostname, '# Exported by admin on ' + DATE, '#', '# [Simülatör] Varsayılan satırlar kısaltıldı.', 'set hostname ' + m.hostname];
            for (const [g, b] of Object.entries(m.bonds || {})) {
                L.push('add bonding group ' + g); b.members.forEach(x => L.push('add bonding group ' + g + ' interface ' + x));
                L.push('set bonding group ' + g + ' mode ' + b.mode + (b.mode === 'active-backup' && b.primary ? ' primary ' + b.primary : b.mode === 'xor' ? ' xmit-hash-policy ' + b.xmit : b.mode === '8023AD' ? ' lacp-rate ' + (b.lacp || 'slow') : ''));
                if (b.up !== 200) L.push('set bonding group ' + g + ' up-delay ' + b.up);
                if (b.down !== 200) L.push('set bonding group ' + g + ' down-delay ' + b.down);
                if (b.mii !== 100) L.push('set bonding group ' + g + ' mii-interval ' + b.mii);
                if (b.minl) L.push('set bonding group ' + g + ' min-links ' + b.minl);
            }
            for (const n of Object.keys(m.ifs).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
                const i = m.ifs[n];
                if (i.vlan) L.push('add interface ' + n.replace('.', ' vlan '));
                L.push('set interface ' + n + ' state ' + i.state);
                if (i.comments) L.push('set interface ' + n + ' comments "' + i.comments + '"');
                if (i.mtu !== 1500) L.push('set interface ' + n + ' mtu ' + i.mtu);
                if (i.ip) L.push('set interface ' + n + ' ipv4-address ' + i.ip + ' mask-length ' + i.len);
            }
            for (const [p, r] of Object.entries(m.routes)) L.push('set static-route ' + p + ' nexthop gateway address ' + r.gw + ' on');
            ['primary', 'secondary', 'tertiary'].forEach(k => { if (m.dns[k]) L.push('set dns ' + k + ' ' + m.dns[k]); });
            if (m.dns.suffix) L.push('set dns suffix ' + m.dns.suffix);
            ['primary', 'secondary'].forEach(k => { const s = m.ntp.servers[k]; if (s) L.push('set ntp server ' + k + ' ' + s.ip + ' version ' + s.ver); });
            L.push('set ntp active ' + (m.ntp.active ? 'on' : 'off'));
            for (const [u, x] of Object.entries(m.users)) if (u !== 'admin') L.push('add user ' + u + ' uid ' + x.uid + ' homedir ' + x.home);
            for (const [u, r] of Object.entries(m.rba || {})) if (u !== 'admin') r.forEach(x => L.push('add rba user ' + u + ' roles ' + x));
            if (m.allowed && !(m.allowed.length === 1 && m.allowed[0] === 'any')) {
                m.allowed.filter(c => c !== 'any').forEach(c => { const [ip, len] = c.split('/'); L.push(len === '32' ? 'add allowed-client host ipv4-address ' + ip : 'add allowed-client network ipv4-address ' + ip + ' mask-length ' + len); });
                if (!m.allowed.includes('any')) L.push('delete allowed-client host any-host');
            }
            if (m.inact !== 10) L.push('set inactivity-timeout ' + m.inact);
            if (m.pwc && m.pwc.min !== 6) L.push('set password-controls min-password-length ' + m.pwc.min);
            if (m.pwc && m.pwc.cx !== 2) L.push('set password-controls complexity ' + m.pwc.cx);
            (m.syslog || []).forEach(y => L.push('add syslog log-remote-address ' + y.ip + ' level ' + y.lv));
            if (m.tz && m.tz !== 'Etc / GMT') L.push('set timezone ' + m.tz);
            for (const [n, x] of Object.entries((m.dhcp || {}).subnets || {})) {
                L.push('add dhcp server subnet ' + n + ' netmask ' + x.len);
                x.pools.forEach(p => { const [a, b] = p.r.split('-'); L.push('add dhcp server subnet ' + n + ' ' + (p.t === 'inc' ? 'include' : 'exclude') + '-ip-pool start ' + a + ' end ' + b, 'set dhcp server subnet ' + n + ' ' + (p.t === 'inc' ? 'include' : 'exclude') + '-ip-pool ' + p.r + ' ' + (p.on ? 'enable' : 'disable')); });
                if (x.dl !== 43200) L.push('set dhcp server subnet ' + n + ' default-lease ' + x.dl);
                if (x.ml !== 86400) L.push('set dhcp server subnet ' + n + ' max-lease ' + x.ml);
                if (x.gw) L.push('set dhcp server subnet ' + n + ' default-gateway ' + x.gw);
                if (x.domain) L.push('set dhcp server subnet ' + n + ' domain ' + x.domain);
                if (x.dns.length) L.push('set dhcp server subnet ' + n + ' dns ' + x.dns.join(', '));
                L.push('set dhcp server subnet ' + n + ' ' + (x.on ? 'enable' : 'disable'));
            }
            if (m.dhcp && (m.dhcp.on || Object.keys(m.dhcp.subnets).length)) L.push('set dhcp server ' + (m.dhcp.on ? 'enable' : 'disable'));
            return L.join('\n');
        }

        // ── Linux ping (clish ve expert)
        function reachable(ip) {
            if (Object.values(M().ifs).some(i => i.ip === ip)) return 'self';
            const r = lookup(ip);
            if (!r) return 'noroute';
            if (r.type === 'C' && r.dev !== 'lo') return (lab.hosts || []).includes(ip) ? 'ok' : 'down';
            // SIM.remote: 'ağ/önek' (herhangi bir rotayla erişilir) ya da { net, gw } (yalnız o sonraki atlama üzerinden erişilir)
            if (r.type === 'S') return (lab.hosts || []).includes(r.gw) && ((lab.hosts || []).includes(ip) || (SIM.remote || []).some(c => typeof c === 'string' ? inNet(ip, c) : inNet(ip, c.net) && r.gw === c.gw)) ? 'ok' : 'down';
            return 'down';
        }
        function ping(ip) {
            const st = reachable(ip), L = ['PING ' + ip + ' (' + ip + ') 56(84) bytes of data.'];
            log({ ping: ip, ok: st === 'ok' || st === 'self' });
            if (st === 'noroute') return 'connect: Network is unreachable';
            if (st === 'ok' || st === 'self') { for (let i = 1; i <= 4; i++) L.push('64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=64 time=0.' + (300 + i * 37) + ' ms'); }
            L.push('^C', '--- ' + ip + ' ping statistics ---');
            L.push(st === 'down' ? '4 packets transmitted, 0 received, 100% packet loss, time 3062ms' : '4 packets transmitted, 4 received, 0% packet loss, time 3004ms\nrtt min/avg/max/mdev = 0.337/0.392/0.448/0.041 ms');
            return L.join('\n');
        }

        // ── expert giriş/çıkış, parola istemleri
        function enterExpert() {
            S.pending = { prompt: 'Enter expert password:', secret: true, fn: (pw) => {
                if (pw !== M().expertPw) { log({ raw: '***', err: 'badpw' }); return '# [Simülatör] Parola yanlış; clish\'te kaldınız.'; }
                S.stack.push('clish'); S.mode = 'expert'; log({ raw: 'expert', canon: 'expert-ok', mode: 'expert' });
                return '\n\nWarning! All configurations should be done through clish\nYou are in expert mode now.\n';
            } };
            return '';
        }
        function leave() {
            if (S.stack.length) { S.mode = S.stack.pop(); return ''; }
            S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.';
        }
        function setExpertPw() {
            const ask2 = () => {
                S.pending = { prompt: 'Enter new expert password:', secret: true, fn: (p1) => {
                    if (p1.length < 6) { const r = 'Password is only ' + p1.length + ' characters long; it must be at least 6 characters in length.'; ask2(); return r; }
                    S.pending = { prompt: 'Enter new expert password (again):', secret: true, fn: (p2) => {
                        if (p1 !== p2) { ask2(); return '# [Simülatör] Parolalar eşleşmiyor; yeniden girin.'; }
                        M().expertPw = p1; log({ raw: '***', canon: 'expert-password-set' }); return '';
                    } };
                    return '';
                } };
            };
            S.pending = { prompt: 'Enter current expert password:', secret: true, fn: (cur) => {
                if (cur !== M().expertPw) { log({ raw: '***', err: 'badpw' }); return '# [Simülatör] Mevcut parola yanlış.'; }
                ask2(); return '';
            } };
            return '';
        }
        function askReboot() {
            S.pending = { prompt: '# [Simülatör] Sistem yeniden başlatılsın mı? (y/N): ', fn: (a) => {
                if (!/^y(es)?$/i.test(a)) return '# [Simülatör] Vazgeçildi.';
                const lost = [], a0 = M(), b0 = S.saved;
                if (a0.hostname !== b0.hostname) lost.push('hostname ' + a0.hostname);
                for (const n of new Set(Object.keys(a0.ifs).concat(Object.keys(b0.ifs)))) if (JSON.stringify(a0.ifs[n]) !== JSON.stringify(b0.ifs[n])) lost.push('interface ' + n);
                for (const p of new Set(Object.keys(a0.routes).concat(Object.keys(b0.routes)))) if (JSON.stringify(a0.routes[p]) !== JSON.stringify(b0.routes[p])) lost.push('static-route ' + p);
                if (JSON.stringify(a0.dns) !== JSON.stringify(b0.dns)) lost.push('dns');
                if (JSON.stringify(a0.ntp) !== JSON.stringify(b0.ntp)) lost.push('ntp');
                if (JSON.stringify(a0.users) !== JSON.stringify(b0.users) || JSON.stringify(a0.rba) !== JSON.stringify(b0.rba)) lost.push('users');
                if (JSON.stringify(a0.allowed) !== JSON.stringify(b0.allowed)) lost.push('allowed-client');
                if (a0.inact !== b0.inact || JSON.stringify(a0.pwc) !== JSON.stringify(b0.pwc)) lost.push('password-controls/inactivity-timeout');
                if (JSON.stringify(a0.syslog) !== JSON.stringify(b0.syslog)) lost.push('syslog');
                if (a0.tz !== b0.tz) lost.push('timezone');
                if (JSON.stringify(a0.dhcp) !== JSON.stringify(b0.dhcp)) lost.push('dhcp server');
                if (JSON.stringify(a0.bonds) !== JSON.stringify(b0.bonds)) lost.push('bonding');
                S.m = clone(S.saved); S.mode = 'clish'; S.stack = [];
                if (!S.rt.clPerm) S.rt.clAdmin = false;
                S.rt.vpnDebug = S.rt.ikeDebug = false; S.rt.kd = null; S.rt.sxl = true;
                log({ raw: 'y', canon: 'reboot', reboot: true, lost });
                return ['# [Simülatör] Sistem yeniden başladı (açılış yapılandırması yüklendi).', lost.length ? '# [Simülatör] Kaydedilmediği için kaybolan değişiklikler: ' + lost.join(', ') : '# [Simülatör] Kaybolan değişiklik yok: her şey kaydedilmişti.'].join('\n');
            } };
            return '';
        }

        // ═══ Trafik simülasyonu (politika SmartConsole'dan kurulmuş kabul edilir) ═══
        const SVC = { http: 'tcp/80', https: 'tcp/443', ssh: 'tcp/22', dns: 'udp/53', telnet: 'tcp/23', smtp: 'tcp/25' };
        function svcMatch(list, f) { return (list || ['any']).some(s => { if (s === 'any') return true; const v = SVC[s] || s, [pr, pt] = v.split('/'); return pr === (f.proto || 'tcp') && +pt === f.dport; }); }
        const ruleMatch = (r, f) => (r.src || ['any']).some(c => inNet(f.src, c)) && (r.dst || ['any']).some(c => inNet(f.dst, c)) && svcMatch(r.svc, f);
        const norm = f => Object.assign({ sport: 51514, proto: 'tcp', reply: 'ok', arrives: true, in: 'eth2' }, f);
        function decide(f) {
            f = norm(f);
            if (f.arrives === false) return { stage: 'noarrive' };
            const sp = (SIM.spoof || {})[f.in];
            if (sp && !sp.some(c => inNet(f.src, c))) return { stage: 'spoof' };
            const r = rulesNow().find(x => ruleMatch(x, f));
            if (!r || r.act !== 'accept') return { stage: 'rule', rule: r ? r.n : null, name: r ? r.name : null };
            const rt = lookup(f.dst);
            if (!rt || rt.dev === 'lo') return { stage: 'noroute', rule: r.n };
            const nat = natNow().find(n => inNet(f.src, n.src) && n.out === rt.dev);
            const osrc = nat ? (nat.hide || ifIp(rt.dev)) : f.src, osport = nat ? 10000 + (f.sport * 7) % 50000 : f.sport;
            let reply = f.reply;
            if (!nat && rt.dev === (SIM.wan || 'eth1') && isPriv(f.src) && !isPriv(f.dst)) reply = 'none';
            const back = lookup(f.src);
            return { stage: 'fwd', rule: r.n, out: rt.dev, osrc, osport, reply, back: back && back.dev !== 'lo' ? back.dev : null, nat: !!nat };
        }
        const flows = () => (SIM.flows || []).concat(SIM.noise || []).map(norm);
        // Paket noktaları: i (inbound önce) → I (inbound sonra) → o (outbound önce) → O (outbound sonra)
        function points(f) {
            const d = decide(f), P = [];
            if (d.stage === 'noarrive') return P;
            const tries = (d.stage === 'fwd' && d.reply !== 'none') ? 1 : 3;
            for (let t = 0; t < tries; t++) {
                const req = { src: f.src, dst: f.dst, sp: f.sport, dp: f.dport, proto: f.proto, fl: '.S....', t };
                P.push(Object.assign({ dev: f.in, pt: 'i' }, req));
                if (d.stage === 'spoof' || d.stage === 'rule') continue;
                P.push(Object.assign({ dev: f.in, pt: 'I' }, req));
                if (d.stage === 'noroute') continue;
                P.push(Object.assign({ dev: d.out, pt: 'o' }, req), Object.assign({ dev: d.out, pt: 'O' }, req, { src: d.osrc, sp: d.osport }));
                if (d.reply === 'none') continue;
                const rep = { src: f.dst, dst: d.osrc, sp: f.dport, dp: d.osport, proto: f.proto, fl: d.reply === 'rst' ? '..R.A.' : '.S..A.', t, rep: true };
                P.push(Object.assign({ dev: d.out, pt: 'i' }, rep), Object.assign({ dev: d.out, pt: 'I' }, rep, { dst: f.src, dp: f.sport }));
                if (d.back) P.push(Object.assign({ dev: d.back, pt: 'o' }, rep, { dst: f.src, dp: f.sport }), Object.assign({ dev: d.back, pt: 'O' }, rep, { dst: f.src, dp: f.sport }));
            }
            return P;
        }
        function zdebugLines() {
            const L = [];
            flows().forEach((f, k) => {
                const d = decide(f);
                if (d.stage !== 'spoof' && d.stage !== 'rule') return;
                const proto = f.proto === 'udp' ? 17 : 6;
                for (let t = 0; t < 3; t++) {
                    const pre = ';[cpu_' + ((k + t) % 4) + '];[fw4_' + (k % 2) + '];fw_log_drop_ex: Packet proto=' + proto + ' ' + f.src + ':' + (f.sport + k) + ' -> ' + f.dst + ':' + f.dport + ' dropped by ';
                    L.push(pre + (d.stage === 'spoof' ? 'handle_spoofed_susp, Reason: Address spoofing;' : 'fw_handle_first_packet Reason: Rulebase drop - rule ' + d.rule + ';'));
                }
            });
            // zaman sırası gibi görünsün: akışları iç içe geçir
            const out = [], per = Math.ceil(L.length / 3);
            for (let t = 0; t < 3; t++) for (let i = t; i < L.length; i += 3) out.push(L[i]);
            return per ? out : [];
        }

        // ═══ expert (bash) komutları ═══════════════════════════════════════
        function shSplit(s) {
            const out = []; let cur = '', q = null, has = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (q) { if (ch === q) q = null; else cur += ch; continue; }
                if (ch === '"' || ch === '\'') { q = ch; has = true; continue; }
                if (/\s/.test(ch)) { if (cur || has) out.push(cur); cur = ''; has = false; continue; }
                cur += ch;
            }
            if (q) return null;
            if (cur || has) out.push(cur);
            return out;
        }
        function splitSemi(s) {
            const parts = []; let cur = '', q = null;
            for (const ch of s) { if (q) { if (ch === q) q = null; cur += ch; continue; } if (ch === '"' || ch === '\'') { q = ch; cur += ch; continue; } if (ch === ';') { parts.push(cur.trim()); cur = ''; continue; } cur += ch; }
            parts.push(cur.trim()); return parts;
        }
                function splitPipe(s) {
            const parts = []; let cur = '', q = null;
            for (const ch of s) { if (q) { if (ch === q) q = null; cur += ch; continue; } if (ch === '"' || ch === '\'') { q = ch; cur += ch; continue; } if (ch === '|') { parts.push(cur); cur = ''; continue; } cur += ch; }
            parts.push(cur); return parts.map(x => x.trim());
        }
        function grepFilter(argv, text) {
            let inv = false, ic = false, i = 1, pat = null;
            for (; i < argv.length; i++) { const a = argv[i]; if (/^-[ivE]+$/.test(a)) { if (a.includes('i')) ic = true; if (a.includes('v')) inv = true; } else { pat = a; break; } }
            if (pat === null) return { err: 'Usage: grep [OPTION]... PATTERNS [FILE]...' };
            let re; try { re = new RegExp(pat, ic ? 'i' : ''); } catch (e) { re = new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), ic ? 'i' : ''); }
            return { out: text.split('\n').filter(l => re.test(l) !== inv).join('\n'), pat };
        }
        const notFound = c => '-bash: ' + c + ': command not found';
        const UNSUP_EXP = '# [Simülatör] Bu komut gerçek Gaia\'da var ama bu lab sürümünde desteklenmiyor.';

        function expertLine(line) {
            const parts = splitPipe(line);
            const argv = shSplit(parts[0]);
            if (argv === null) { log({ raw: line, err: 'incomplete' }); return '> \n# [Simülatör] Kapanmamış tırnak: komut tamamlanmadı.'; }
            if (!argv.length) { log({ raw: line, err: 'invalid' }); return '-bash: syntax error near unexpected token `|\''; }
            const pipes = parts.slice(1).map(p => shSplit(p) || []);
            for (const p of pipes) if (!p.length || !['grep', 'egrep'].includes(p[0])) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu lab\'da boru (|) ile yalnız grep desteklenir.'; }
            const canon = [argv.join(' ')].concat(pipes.map(p => p.join(' '))).join(' | ');
            const r = expertCmd(argv, line, canon, pipes);
            if (r && r.err) { log({ raw: line, err: r.err }); return r.msg; }
            let out = typeof r === 'string' ? r : (r ? r.out : '');
            const extra = (r && typeof r === 'object' && r.log) || {};
            for (const p of pipes) { const g = grepFilter(p, out); if (g.err) { log({ raw: line, err: 'invalid' }); return g.err; } out = g.out; if (extra.zdebug) extra.zdebug.grep = (extra.zdebug.grep ? extra.zdebug.grep + '|' : '') + g.pat; }
            if (extra.zdebug && pipes.length && !out.trim()) out = '# [Simülatör] (grep ile eşleşen satır gelmedi)';
            log(Object.assign({ raw: line, canon }, extra));
            if (r && r.tail) out = [out, r.tail].filter(Boolean).join('\n');
            return out;
        }
        const U = m => ({ err: 'unsupported', msg: m || UNSUP_EXP });
        function expertCmd(a, line, canon, pipes) {
            const c = a[0];
            if (['show', 'set', 'add', 'delete', 'save'].includes(c)) return { err: 'wrongmode', msg: notFound(c) + '\n# [Simülatör] Bu bir clish komutu. clish\'e dönmek için "exit" ya da tek komut için: clish -c "' + a.join(' ') + '"' };
            if (c === 'expert') return { err: 'wrongmode', msg: '# [Simülatör] Zaten expert moddasınız (istem [Expert@' + host() + ':0]#). clish\'e dönmek için "exit".' };
            if (c === 'exit' || c === 'logout') { const o = leave(); return { out: o }; }
            if (c === 'clish') {
                if (a[1] === '-c' && a[2]) { const sub = clishLine(a[2], true); return { out: sub }; }
                if (a.length > 1) return U();
                S.stack.push('expert'); S.mode = 'clish'; return '';
            }
            if (c === 'hostname' && a.length === 1) return host();
            if (c === 'reboot') return askReboot();
            if (c === 'ping') { const ip = a.slice(1).find(x => isIp(x)); return ip ? ping(ip) : { err: 'incomplete', msg: 'ping: usage error: Destination address required' }; }
            if (c === 'fw') return fwCmd(a);
            if (c === 'cpstat') return cpstat(a);
            if (c === 'cphaprob') return cphaprob(a);
            if (c === 'clusterXL_admin') {
                if (!SIM.cluster) return { err: 'value', msg: '# [Simülatör] Bu gateway bir ClusterXL üyesi değil.' };
                if (!['down', 'up'].includes(a[1]) || (a[2] && a[2] !== '-p') || a.length > 3) return { err: 'invalid', msg: '# [Simülatör] Kullanım: clusterXL_admin <down|up> [-p]' };
                return { out: clAdmin(a[1], a[2] === '-p'), log: { cladmin: a[1] } };
            }
            if (c === 'vpn') return vpnCmd(a);
            if (c === 'mgmt_cli') return MG ? MG.cmd(a, line) : U('# [Simülatör] Bu lab\'da cihaz yalnız gateway: mgmt_cli yönetim sunucusunda çalışır.');
            if (c === 'tcpdump') return tcpdump(a);
            if (c === 'cpview') return cpview(a);
            if (c === 'cpinfo') return (a[1] === '-y' && a[2] === 'all' && a.length === 3) ? cpinfo() : U();
            if (c === 'ip') return ipCmd(a);
            if (c === 'cat' && a.length === 2 && /^\/proc\/net\/bonding\/bond\d+$/.test(a[1])) return procBond(a[1].split('/').pop());
            if (['cat', 'less', 'more', 'tail', 'grep'].includes(c)) return fileCmd(a);
            if (c === 'fwaccel' && a[1] === 'stat' && a.length === 2) return { out: fwaccelStat(), log: { box: 'fwaccel' } };
            if (c === 'fwaccel' && ['on', 'off'].includes(a[1]) && a.length === 2) { S.rt.sxl = a[1] === 'on'; return { out: '# [Simülatör] SecureXL ' + (a[1] === 'on' ? 'başlatıldı' : 'durduruldu (yalnız geçici; cpstart ya da yeniden başlatmada yeniden açılır)') + '. Durumu fwaccel stat ile doğrulayın.', log: { sxl: a[1] } }; }
            if (c === 'cpwd_admin' && a[1] === 'list' && a.length === 2) return { out: cpwdList(), log: { box: 'cpwd' } };
            if (c === 'cplic' && a[1] === 'print' && a.length === 2) return { out: cplicPrint(), log: { box: 'cplic' } };
            if (EXPERT_ROOTS.includes(c) || ['cpstop', 'cprestart', 'fwaccel', 'cplic', 'cpwd_admin', 'ls', 'cd', 'pwd', 'uptime', 'date', 'free', 'ps', 'netstat', 'ifconfig', 'top', 'df', 'cp_conf', 'vi', 'find', 'ethtool', 'arp', 'traceroute', 'ssh', 'scp', 'curl_cli', 'dbedit', 'cpconfig', 'cpstart'].includes(c)) return U();
            return { err: 'invalid', msg: notFound(c) };
        }
        function fwCmd(a) {
            const s = a.slice(1).join(' ');
            if (s === 'stat' || s === 'stat -l') return fwStat();
            if (s === 'ver') return 'This is Check Point\'s software version R81.20 - Build ' + VERSION.fwBuild + '\n# [Simülatör] build numarası temsilidir.';
            if (/^ctl zdebug (\+ )?drop$/.test(s)) {
                const hdr = ['Defaulting all kernel debugging options', 'Initialized kernel debugging buffer to size 1023K', 'Updated kernel\'s debug variable for module fw', 'Kernel debugging buffer size: 1023KB',
                    'Module: kiss', 'Enabled Kernel debugging options: error warning', 'Module: kissflow', 'Enabled Kernel debugging options: error warning', 'Module: fw', 'Enabled Kernel debugging options: drop'];
                const lines = zdebugLines();
                return { out: hdr.concat(lines).join('\n'), log: { zdebug: { plus: /\+/.test(s), n: lines.length } }, tail: '^C\n# [Simülatör] Ctrl+C ile durduruldu. Canlı cihazda bu komut siz durdurana kadar akar; kısa süre çalıştırın.' };
            }
            if (s === 'ctl debug 0') { if (S.rt.kd) S.rt.kd.flags = KD_DEF.slice(); return { out: 'Defaulting all kernel debugging options', log: { dbg0: true } }; }
            const kr = kdebugCmd(a, s); if (kr) return kr;
            if (/^ctl arp\b/.test(s)) return fwCtlArp(a);
            if (s === 'ctl iflist') return ifList().map((n, i) => pad(String(i + 1), 2) + ': ' + n).join('\n');
            if (s === 'tab -t connections -s') { const n = 120 + flows().length * 7; return pad('HOST', 22) + pad('NAME', 35) + pad('ID', 6) + pad('#VALS', 6) + pad('#PEAK', 6) + '#SLINKS\n' + pad('localhost', 22) + pad('connections', 35) + pad('8158', 6) + pad(String(n), 6) + pad(String(n * 3), 6) + (n * 2); }
            if (s === 'unloadlocal') return { out: '# [Simülatör] UYARI: "fw unloadlocal" gateway\'deki güvenlik politikasını tamamen kaldırır: tüm trafik denetimsiz kalır (ya da erişim kopar).\n# Sorun gidermede "önce politikayı kaldırıp bakayım" yanlış bir alışkanlıktır. Simülatörde engellendi.', log: { warn: 'unloadlocal' } };
            if (a[1] === 'monitor') return fwMonitor(a);
            if (a[1] === 'up_execute') return upExecute(a);
            if (s === 'ctl multik stat') return { out: multikStat(), log: { box: 'multik' } };
            if (/^ctl (pstat|chain|multik|affinity|conntab)/.test(s) || /^(fetch|log|lslogs|logswitch|tab)\b/.test(s)) return U();
            if (!a[1]) return { err: 'incomplete', msg: '# [Simülatör] fw komutu alt komut ister (ör. fw stat, fw ctl zdebug drop, fw monitor -e "…").' };
            return { err: 'invalid', msg: '# [Simülatör] fw: "' + s + '" tanınmadı. Bu lab\'da: fw stat, fw ver, fw ctl zdebug [+] drop, fw ctl debug 0, fw ctl iflist, fw monitor, fw tab -t connections -s' };
        }
        // ── Kutuyu tanı: SecureXL / CoreXL / WatchDog / lisans
        // Kaynak: R81.20 Performance Tuning Admin Guide s. 122–123 (fwaccel stat örneği); R81.20 CLI Reference Guide s. 976–977 (fw ctl multik stat örneği),
        // s. 236–238 (cpwd_admin list sütunları ve Security Gateway örneği), s. 151–152 (cplic print örneği). PDF metninden alındı; sütun boşlukları yeniden kuruldu.
        // SIM.sxl === false → SecureXL kapalı; SIM.corexl → CoreXL örnek sayısı; SIM.cpwd { APP: { stat, start, pid } }; SIM.lic { exp, host }
        function fwaccelStat() {
            const on = S.rt.sxl !== undefined ? S.rt.sxl : SIM.sxl !== false, ifs = ifList().filter(n => n !== 'lo' && n !== 'eth0' && !bondOf(n) && ifUp(n));
            const row = (a, b, c, d, e) => '|' + pad(a, 3) + '|' + pad(b, 7) + '|' + pad(c, 10) + '|' + pad(d, 30) + '|' + pad(e, 31) + '|', bar = '+' + '-'.repeat(row('', '', '', '', '').length - 2) + '+';
            return [bar, row('Id', 'Name', 'Status', 'Interfaces', 'Features'), bar, row('0', 'KPPAK', on ? 'enabled' : 'disabled', on ? ifs.join(',') : '', 'Acceleration,Cryptography'),
                row('', '', '', '', ''), row('', '', '', '', 'Crypto: Tunnel,UDPEncap,MD5,'), row('', '', '', '', 'SHA1,3DES,DES,AES-128,AES-256,'), row('', '', '', '', 'ESP,LinkSelection,DynamicVPN,'),
                row('', '', '', '', 'NatTraversal,AES-XCBC,SHA256,'), row('', '', '', '', 'SHA384,SHA512'), bar,
                'Accept Templates : ' + (on ? 'enabled' : 'disabled'), 'Drop Templates   : disabled', 'NAT Templates    : ' + (on ? 'enabled' : 'disabled'), 'LightSpeed Accel : disabled'].join('\n');
        }
        function multikStat() {
            const cpus = (SIM.cpu || {}).cpus || 4, n = SIM.corexl !== undefined ? SIM.corexl : Math.max(1, cpus - 1), c = flows().length;
            const L = ['ID | Active  | CPU    | Connections | Peak', '----------------------------------------------'];
            for (let i = 0; i < n; i++) L.push(pad(String(i), 3) + '| Yes     | ' + pad(String(cpus - 1 - i), 7) + '| ' + pad(String(i === 0 ? 7 + c : Math.max(0, 3 - i)), 12) + '| ' + (i === 0 ? 28 + c : 11 - i));
            return L.join('\n');
        }
        const CPWD = [['FWK_FORKER', 'fwk_forker'], ['FWK_WD', 'fwk_wd -i 1 -i6 0'], ['CPSICDEMUX', 'cpsicdemux'], ['CPVIEWD', 'cpviewd'], ['HISTORYD', 'cpview_historyd'], ['SXL_STATD', 'sxl_statd'],
            ['CPD', 'cpd', 'Y'], ['MPDAEMON', 'mpdaemon'], ['CI_CLEANUP', 'avi_del_tmp_files'], ['CIHS', 'ci_http_server -j -f'], ['FWD', 'fwd'], ['RAD', 'rad'], ['DASERVICE', 'DAService_script']];
        function cpwdList() {
            const o = SIM.cpwd || {}, L = [pad('APP', 16) + pad('CTX', 5) + pad('PID', 8) + pad('STAT', 6) + pad('#START', 8) + pad('START_TIME', 23) + pad('MON', 5) + 'COMMAND'];
            CPWD.forEach(([app, cmd, mon], i) => {
                const x = o[app] || {}, st = x.stat || 'E', t = x.time || '[09:0' + (i < 6 ? 1 : 2) + ':' + String(10 + i * 3).padStart(2, '0') + '] 24/9/2026';
                L.push(pad(app, 16) + pad('0', 5) + pad(String(st === 'T' ? 0 : (x.pid || 4180 + i * 97)), 8) + pad(st, 6) + pad(String(x.start !== undefined ? x.start : 1), 8) + pad(t, 23) + pad(mon || 'N', 5) + cmd);
            });
            return L.join('\n');
        }
        function cplicPrint() {
            const l = SIM.lic || {};
            return [pad('Host', 17) + pad('Expiration', 12) + 'Features', pad(l.host || ifIp(SIM.wan || 'eth1') || '203.0.113.2', 17) + pad(l.exp || '31Dec2027', 12) + 'CPMP-XXX CK-XXXXXXXXXXXX',
                '# [Simülatör] Lisans dizeleri belgedeki yer tutucularla gösterildi.'].join('\n');
        }
        // ── Kernel debug (fw ctl debug / kdebug / set simple_debug_filter_*), fw ctl pstat, fw tab -s
        // Kaynak: R81.20 Quantum Security Gateway Admin Guide s. 304–312 (sözdizimi), s. 326–329 (prosedür ve örnek çıktılar),
        // s. 370–373 (Module "fw" bayrakları); R81.20 CLI Reference Guide s. 1099–1101 (fw ctl pstat), s. 1220–1224 (fw tab).
        // Debug satırlarının biçimi belgede yok: [Simülatör] işaretli, temsilî.
        const KD_DEF = ['error', 'warning'];
        const FW_FLAGS = 'acct advp aspii balance bridge caf cgnat chain chainfwd cifs citrix cmi conn connstats content context cookie corr cpsshi cptls crypt cvpnd dfilter dlp dmd dnstun domain dos driver drop drop_tmpl dynlog epq error event ex fast_accel filter ftp handlers highavail hold icmptun if install integrity ioctl ipopt ips ipv6 kbuf ld leaks link log machine mail malware mdps media memory mgcp misc misp monitor monitorall mrtsync msnms multik nac nat nat_sync nat64 netquota ntup packet packval portscan prof q qos rad route sam sctp scv shmem sip smtp sock span spii synatk sync tcpstr te tlsparser ua ucd unibypass user vm wap warning wire xlate xltrc'.split(' ');
        const KD = () => S.rt.kd || (S.rt.kd = { buf: 50, flags: KD_DEF.slice(), filt: {}, files: {} });
        const kdActive = () => { const k = S.rt.kd; return !!k && (k.flags.join(' ') !== KD_DEF.join(' ') || Object.keys(k.filt).length > 0); };
        const kdShow = () => { const k = KD(); return 'Kernel debugging buffer size: ' + k.buf + 'KB\nModule: fw\nEnabled Kernel debugging options: ' + (k.flags.join(' ') || '(none)') + '\nMessaging threshold set to type=Info freq=Common'; };
        function kdLines() {
            const k = KD(); if (!k.flags.includes('drop') && !k.flags.includes('all')) return [];
            const ips = Object.keys(k.filt).filter(x => /addr/.test(x)).map(x => k.filt[x]);
            return zdebugLines().filter(l => !ips.length || ips.some(ip => l.includes(' ' + ip + ':')));
        }
        function kdebugCmd(a, s) {
            if (s === 'ctl debug' || s === 'ctl debug -m fw') return { out: kdShow(), log: { kd: 'show' } };
            if (s === 'ctl debug -m') return U('# [Simülatör] Modül listesi gateway\'de açık blade\'lere göre değişir. Bu lab\'da yalnız "fw" modülü desteklenir: fw ctl debug -m fw');
            if (s === 'ctl debug -x') { KD().flags = []; return { out: 'Defaulting all kernel debugging options\n# [Simülatör] UYARI: -x varsayılan bayrakları da kapatır; /var/log/messages temel iletileri artık almaz. Belgedeki en iyi uygulama: -x yerine "fw ctl debug 0".', log: { warn: 'debugx' } }; }
            let m = /^ctl debug -buf (\d+)$/.exec(s);
            if (m) { KD().buf = Math.min(+m[1], 8192); return { out: 'Initialized kernel debugging buffer to size ' + KD().buf + 'K', log: { kd: 'buf' } }; }
            m = /^ctl debug -m (\S+) (all|([+-]) (.+))$/.exec(s);
            if (m) {
                if (m[1] !== 'fw') return U('# [Simülatör] Bu lab\'da yalnız "fw" modülü desteklenir.');
                const k = KD();
                if (m[2] === 'all') k.flags = ['all'];
                else {
                    const fl = m[4].split(/\s+/), bad = fl.filter(f => !FW_FLAGS.includes(f));
                    if (bad.length) return { err: 'invalid', msg: '# [Simülatör] "fw" modülünde böyle bir debug bayrağı yok: ' + bad.join(', ') + '. Liste: fw ctl debug -m' };
                    if (m[3] === '+') fl.forEach(f => { if (!k.flags.includes(f)) k.flags.push(f); });
                    else k.flags = k.flags.filter(f => !fl.includes(f));
                }
                return { out: 'Updated kernel\'s debug variable for module fw\nDebug flags updated.', log: { kd: 'flags', kdflags: k.flags.slice() } };
            }
            if (/^ctl debug /.test(s)) return { err: 'invalid', msg: '# [Simülatör] Kullanım: fw ctl debug 0 | -buf 8200 | -m fw {all | + <bayraklar> | - <bayraklar>}' };
            m = /^ctl set (int|str) simple_debug_filter_(off|(saddr|daddr|sport|dport|proto)_([1-5])) (\S+)$/.exec(s);
            if (m) {
                const k = KD();
                if (m[2] === 'off') { if (m[1] !== 'int' || m[5] !== '1') return { err: 'invalid', msg: '# [Simülatör] Kullanım: fw ctl set int simple_debug_filter_off 1' }; k.filt = {}; return { out: '', log: { kd: 'filtoff' } }; }
                const isAddr = /addr/.test(m[3]);
                if (isAddr !== (m[1] === 'str') || (isAddr && !isIp(m[5])) || (!isAddr && !/^\d+$/.test(m[5]))) return { err: 'invalid', msg: '# [Simülatör] Adres filtreleri "set str … \\"<IP>\\"", port/protokol filtreleri "set int … <sayı>" ile verilir.' };
                k.filt[m[2]] = m[5]; return { out: '', log: { kd: 'filt' } };
            }
            if (a[2] === 'kdebug') {
                const r = a.slice(3), gt = r.indexOf('>'), oi = r.indexOf('-o');
                const file = gt >= 0 ? r[gt + 1] : (oi >= 0 ? r[oi + 1] : null);
                const opts = (gt >= 0 ? r.slice(0, gt) : r).filter((x, i, arr) => !(oi >= 0 && (i === oi || i === oi + 1)) && !(x === '-m' || x === '-s' || (i > 0 && ['-m', '-s'].includes(arr[i - 1]))));
                if ((gt >= 0 && (!file || r.length !== gt + 2)) || (oi >= 0 && !file)) return { err: 'incomplete', msg: '-bash: syntax error near unexpected token `newline\'' };
                if (opts.join(' ') !== '-T -f' && opts.join(' ') !== '-t -f') return { err: 'invalid', msg: '# [Simülatör] Belgedeki kullanım: fw ctl kdebug -T -f > /var/log/kernel_debug.txt' };
                const L = kdLines(), k = KD();
                const txt = L.length ? L.join('\n') : '# [Simülatör] (yalnız varsayılan bayraklar açık: düşme satırı yok. Önce "fw ctl debug -m fw + drop".)';
                const tail = '^C\n# [Simülatör] Ctrl+C ile durduruldu. Debug bayrakları hâlâ AÇIK: "fw ctl debug 0" ve "fw ctl set int simple_debug_filter_off 1" ile kapatın.';
                if (file) { k.files[file] = '# [Simülatör] satır biçimi temsilîdir (belgede örnek yok)\n' + txt; return { out: '', log: { kdebug: { file, n: L.length } }, tail }; }
                return { out: '# [Simülatör] satır biçimi temsilîdir (belgede örnek yok)\n' + txt, log: { kdebug: { file: null, n: L.length } }, tail };
            }
            if (s === 'ctl pstat') return { out: pstat(), log: { pstat: true } };
            if (s === 'tab -s') return { out: tabSummary(), log: { tabs: true } };
            return null;
        }
        function tabSummary() {
            const n = 120 + flows().length * 7, row = (nm, id, v, p, l) => pad('localhost', 22) + pad(nm, 35) + pad(String(id), 6) + pad(String(v), 6) + pad(String(p), 6) + l;
            return pad('HOST', 22) + pad('NAME', 35) + pad('ID', 6) + pad('#VALS', 6) + pad('#PEAK', 6) + '#SLINKS\n' + [row('vsx_firewalled', 0, 1, 1, 0), row('firewalled_list', 1, 2, 2, 0), row('external_firewalled_list', 2, 0, 0, 0), '... ...', row('connections', 8158, n, n * 3, n * 2), '... ...'].join('\n');
        }
        function pstat() {
            const c = SIM.pstat || {}, n = 120 + flows().length * 7, fa = c.failed || 0;
            return ['System Capacity Summary:', 'Memory used: ' + (c.mem || 3) + '% (' + (c.memMb || 265) + ' MB out of 7117 MB) - below watermark', 'Concurrent Connections: Not Available', 'Aggressive Aging is enabled, not active',
                'Hash kernel memory (hmem) statistics:', 'Total memory allocated: 742391808 bytes in 181248 (4096 bytes) blocks using 1 pool', 'Allocations: 2193027 alloc, ' + fa + ' failed alloc, 2154121 free',
                'System kernel memory (smem) statistics:', 'Allocations: 13217 alloc, ' + fa + ' failed alloc, 10027 free, 0 failed free',
                'Kernel memory (kmem) statistics:', 'Allocations: 2204456 alloc, ' + fa + ' failed alloc', '2162587 free, 0 failed free',
                'Connections:', n + ' total, ' + (n - 20) + ' TCP, 16 UDP, 4 ICMP,', '0 other, 0 anticipated, 0 recovered, ' + n + ' concurrent,', (n * 3) + ' peak concurrent',
                'NAT:', '0/0 forw, 0/0 bckw, 0 tcpudp,', '0 icmp, 0-0 alloc', '# [Simülatör] Belgedeki (CLI R81.20 s. 1101) alan düzeni kısaltıldı; sayılar temsilîdir.'].join('\n');
        }
        function fwStat() {
            const p = policyNow();
            const ifl = ifList().filter(n => n !== 'eth0' || p.mgmt).filter(n => M().ifs[n].ip).map(n => '[>' + n + '] [<' + n + ']').join(' ');
            return 'HOST      POLICY     DATE\nlocalhost ' + p.name + ' ' + (p.date || FWDATE) + ' :  ' + ifl;
        }
        function cpstat(a) {
            const s = a.slice(1).join(' ');
            if (s === 'fw' || s === '-f policy fw') {
                const p = policyNow();
                const L = ['Policy name: ' + p.name, 'Install time: ' + (p.time || DATE), '', 'Interface table', '-----------------------------------------------------------------',
                    '|Name|Dir|Total     *|Accept**|Deny|Log|', '-----------------------------------------------------------------'];
                let tot = 0, acc = 0, den = 0;
                ifList().filter(n => M().ifs[n].ip).forEach((n, i) => ['in ', 'out'].forEach((d, j) => { const t = 18000 + i * 5211 + j * 777, dn = (i + j) * 13; tot += t; acc += t - dn; den += dn; L.push('|' + n + '|' + d + '|' + pad(String(t), 11) + '|' + pad(String(t - dn), 8) + '|' + pad(String(dn), 4) + '|' + pad(String(Math.floor(dn / 2)), 3) + '|'); }));
                L.push('-----------------------------------------------------------------', '|    |   |' + pad(String(tot), 11) + '|' + pad(String(acc), 8) + '|' + pad(String(den), 4) + '|' + pad('-', 3) + '|', '-----------------------------------------------------------------', '',
                    '* Expands to: Accept, Drop, Reject, Log', '** Accept includes Mailed, and Bypassed', '# [Simülatör] Sayaçlar temsilidir; tablo sadeleştirildi.');
                return L.join('\n');
            }
            if (s === 'os -f cpu') {
                const c = SIM.cpu || { user: 2, sys: 1, idle: 97, cpus: 4 };
                return { out: ['CPU User Time (%):             ' + c.user, 'CPU System Time (%):           ' + c.sys, 'CPU Idle Time (%):             ' + c.idle, 'CPU Usage (%):                 ' + (100 - c.idle),
                    'CPU Queue Length:              -', 'CPU Interrupts/Sec:            ' + (1200 + c.cpus * 111), 'CPUs Number:                   ' + c.cpus].join('\n'), log: { cpu: true } };
            }
            if (/^os( -f \w+)?$/.test(s) || /^(ha|blades|mg|vpn)\b/.test(s) || /^-f \w+ \w+/.test(s)) return U('# [Simülatör] Bu lab\'da cpstat için yalnız "cpstat fw" ve "cpstat os -f cpu" desteklenir.');
            return { err: 'invalid', msg: '# [Simülatör] cpstat: bilinmeyen uygulama bayrağı. Örnek: cpstat fw, cpstat os -f cpu' };
        }

        // ── ClusterXL
        function clMembers() {
            const cl = SIM.cluster, localDown = S.rt.clAdmin, peerDown = !!cl.peerDown;
            const localActive = !localDown && (cl.localActive !== false || peerDown) && !S.rt.lostActive;
            const me = localDown ? 'DOWN' : (localActive ? 'ACTIVE' : 'STANDBY');
            const peer = peerDown ? 'DOWN' : (me === 'ACTIVE' ? 'STANDBY' : 'ACTIVE');
            return [{ id: 1, ip: cl.ips[0], name: cl.names[0], st: me, local: true }, { id: 2, ip: cl.ips[1], name: cl.names[1], st: peer }];
        }
        function clusterState() {
            const ms = clMembers(), cl = SIM.cluster;
            const L = ['', 'Cluster Mode:   High Availability (Active Up) with IGMP Membership', '', pad('ID', 11) + pad('Unique Address', 16) + pad('Assigned Load', 16) + pad('State', 15) + 'Name', ''];
            ms.forEach(m => L.push(pad(m.id + (m.local ? ' (local)' : ''), 11) + pad(m.ip, 16) + pad(m.st === 'ACTIVE' ? '100%' : '0%', 16) + pad(m.st, 15) + m.name));
            L.push('', 'Active PNOTEs: ' + (S.rt.clAdmin ? 'ADMIN' : 'None'), '');
            const ev = S.rt.lastEvt || cl.lastEvt || { code: 'CLUS-114904', change: 'ACTIVE(!) -> ACTIVE', reason: 'Reason for ACTIVE! alert has been resolved', time: 'Thu Sep 24 03:12:46 2026' };
            L.push('Last member state change event:', '   Event Code:                 ' + ev.code, '   State change:               ' + ev.change, '   Reason for state change:    ' + ev.reason, '   Event time:                 ' + ev.time);
            if (S.rt.lastEvt) L.push('# [Simülatör] Olay kodu ve metni temsilidir.');
            L.push('');
            L.push('Cluster failover count:', '   Failover counter:           ' + ((cl.failovers || 0) + S.rt.failovers), '   Time of counter reset:      Thu Sep 24 03:10:02 2026 (reboot)', '');
            return L.join('\n');
        }
        function clAdmin(st, perm) {
            const before = clMembers()[0].st;
            const note = 'This command does not survive reboot. To make the change permanent, please run \'set cluster member admin down/up permanent\' in clish or add \'-p\' at the end of the command in expert mode';
            if (st === 'down') {
                S.rt.clAdmin = true; S.rt.clPerm = perm;
                if (before === 'ACTIVE') { S.rt.failovers++; S.rt.lostActive = true; }
                S.rt.lastEvt = { code: 'CLUS-111400', change: before + ' -> DOWN', reason: 'ADMIN pnote reported problem (clusterXL_admin down)', time: 'Thu Sep 24 10:21:07 2026' };
                return (perm ? '' : note + '\n') + 'Setting member to administratively down state ...\nMember current state is DOWN';
            }
            if (!S.rt.clAdmin) return (perm ? '' : note + '\n') + 'Setting member to normal operation ...\nMember current state is ' + before;
            S.rt.clAdmin = false; S.rt.clPerm = false;
            const now = clMembers()[0].st;
            S.rt.lastEvt = { code: 'CLUS-114802', change: 'DOWN -> ' + now, reason: 'ADMIN pnote problem has been resolved', time: 'Thu Sep 24 10:24:51 2026' };
            return (perm ? '' : note + '\n') + 'Setting member to normal operation ...\nMember current state is ' + now;
        }
        function cphaprob(a) {
            if (!SIM.cluster) return { err: 'value', msg: '# [Simülatör] ClusterXL bu gateway\'de çalışmıyor (küme üyesi değil).' };
            const s = a.slice(1).join(' ');
            if (s === 'stat' || s === 'state') return { out: clusterState(), log: { clstate: clMembers()[0].st } };
            if (s === '-a if' || s === '-a -m if') {
                const cl = SIM.cluster, mon = cl.ifs || ['eth1', 'eth2'];
                const L = ['', 'CCP mode: Manual (Unicast)', 'Required interfaces: ' + (mon.length + 1), 'Required secured interfaces: 1', '', pad('Interface Name:', 21) + 'Status:', ''];
                mon.forEach(n => L.push(pad(n, 21) + (linkUp(n) ? 'UP' : 'DOWN')));
                L.push(pad(cl.sync + ' (S)', 21) + (linkUp(cl.sync) ? 'UP' : 'DOWN'), '', 'Virtual cluster interfaces: ' + mon.length, '');
                mon.forEach(n => L.push(pad(n, 16) + (cl.vips || {})[n]));
                return L.join('\n');
            }
            if (/^(list|-l list|-i list|syncstat|show_failover|roles|names|tablestat|-ia list)$/.test(s)) return U();
            return { err: 'invalid', msg: '# [Simülatör] cphaprob: bu lab\'da "cphaprob stat", "cphaprob state" ve "cphaprob -a if" desteklenir.' };
        }

        // ── VPN (tu / debug / IKE günlüğü)
        function vpnCmd(a) {
            const s = a.slice(1).join(' '), V = SIM.vpn;
            if (!V && /^(tu|tunnelutil)/.test(s)) return { err: 'value', msg: '# [Simülatör] Bu lab\'da tanımlı VPN eşi yok.' };
            if (s === 'tu' || s === 'tunnelutil') { vpnMenu(); return { out: vpnMenuText(), log: { vpntu: 'menu' } }; }
            if (s === 'tu tlist') return { out: tlist(), log: { vpntu: 'tlist' } };
            if (s === 'debug trunc') { S.rt.vpnDebug = S.rt.ikeDebug = true; S.rt.vpnTried = true; return { out: '# [Simülatör] ike ve vpnd günlükleri sıfırlandı, debug açıldı; şubeye trafik geldi ve IKE yeniden denendi.', log: { vpndebug: 'trunc' } }; }
            if (s === 'debug ikeon') { S.rt.ikeDebug = true; S.rt.vpnTried = true; return { out: '# [Simülatör] IKE debug açıldı; şubeye trafik geldi ve IKE yeniden denendi.', log: { vpndebug: 'ikeon' } }; }
            if (s === 'debug on') { S.rt.vpnDebug = true; return { out: '# [Simülatör] vpnd debug açıldı.', log: { vpndebug: 'on' } }; }
            if (s === 'debug ikeoff') { S.rt.ikeDebug = false; return { out: '', log: { vpndebug: 'ikeoff' } }; }
            if (s === 'debug off') { S.rt.vpnDebug = false; return { out: '', log: { vpndebug: 'off' } }; }
            if (/^(tu (list|del)|shell|debug|ver|drv|overlap_encdom)/.test(s)) return U();
            return { err: 'invalid', msg: '# [Simülatör] vpn: bu lab\'da vpn tu, vpn tu tlist, vpn debug trunc|ikeon|ikeoff|on|off desteklenir.' };
        }
        const vpnState = () => { const r = (SIM.vpn || {}).fail; return { p1: !r || r === 'ts', p2: !r, reason: r || null }; };
        function vpnMenuText() {
            return ['', '**********     Select Option     **********', '', '(1)               List all IKE SAs', '(2)             * List all IPsec SAs', '(3)               List all IKE SAs for a given peer (GW)',
                '(4)             * List all IPsec SAs for a given peer (GW)', '(5)               Delete all IPsec SAs for a given peer (GW)', '(6)               Delete all IPsec SAs for a given User (Client)',
                '(7)               Delete all IPsec+IKE SAs for a given peer (GW)', '(8)               Delete all IPsec+IKE SAs for a given User (Client)', '(9)               Delete all IPsec SAs for ALL peers',
                '(0)               Delete all IPsec+IKE SAs for ALL peers', '', '* To list data for a specific CoreXL instance, append "-i <instance number>" to your selection.', '', '(Q)               Quit', ''].join('\n');
        }
        function vpnMenu() {
            S.pending = { prompt: '', fn: (x) => {
                const k = x.trim().toLowerCase();
                if (k === 'q' || k === '') { log({ raw: x, canon: 'vpn tu quit' }); return ''; }
                const st = vpnState(), V = SIM.vpn;
                let out;
                if (k === '1') out = st.p1 ? '# [Simülatör] IKE SA listesi (sadeleştirildi):\n  Peer ' + V.peer + ' — IKEv2 SA kurulu' : '# [Simülatör] IKE SA yok: ' + V.peer + ' ile faz 1 kurulamamış.';
                else if (k === '2') out = st.p2 ? '# [Simülatör] IPsec SA listesi (sadeleştirildi):\n  Peer ' + V.peer + ' — ' + V.local + ' <-> ' + V.remote + ', SPI giriş/çıkış mevcut' : '# [Simülatör] IPsec SA yok (faz 2 kurulmamış).';
                else if (/^[3-90]$/.test(k)) out = '# [Simülatör] Bu seçenek lab\'da desteklenmiyor (SA silme işlemleri canlı tünelleri keser).';
                else out = '# [Simülatör] Geçersiz seçim.';
                log({ raw: x, canon: 'vpn tu ' + k, vpntu: k });
                vpnMenu();
                return out + '\n' + vpnMenuText();
            } };
        }
        function tlist() {
            const V = SIM.vpn, st = vpnState();
            if (!st.p2) return '# [Simülatör] ' + V.peer + ' için IPsec SA yok; tablo boş.' + (st.p1 ? ' (IKE SA var — faz 1 kurulmuş, faz 2 kurulamamış.)' : ' (IKE SA da yok.)');
            const b = '+-----------------------------------------+-----------------------+---------------------+';
            const row = (x, y, z) => '| ' + pad(x, 40) + '| ' + pad(y, 22) + '| ' + pad(z, 20) + '|';
            return [b, row('Peer: ' + V.peer + ' (a1c4e0f97d3b2146)', 'MSA: ffffc9001f624410', 'i: 0 ref: -- 45/60'), row('Methods: ESP Tunnel AES-256 SHA256', '', ''), row('', '', ''), row('My TS: ' + V.local, '', ''), row('', '', ''),
                row('Peer TS: ' + V.remote, '', ''), row('', '', ''), row('MSPI: 800005 (i: 1, p: 0)', 'Out SPI: 6980210e', ''), row('Tunnel created: Sep 24 09:40:22', '', ''), row('Tunnel expiration: Sep 24 10:40:22', '', ''), b].join('\n');
        }
        function ikeLog() {
            const V = SIM.vpn, st = vpnState();
            if (!S.rt.vpnTried) return '# [Simülatör] Günlük boş ya da eski: önce "vpn debug trunc" ile debug\'ı başlatın, trafik gelsin.';
            const L = ['# [Simülatör] ikev2.xmll bir XML dosyasıdır; normalde IKEView ile açılır. Son denemenin özeti:', '  Initiator: ' + (V.me || '203.0.113.2') + '  →  Responder: ' + V.peer];
            if (st.reason === 'proposal') L.push('  IKE_SA_INIT  gönderildi: AES-256 / SHA256 / DH 14', '  IKE_SA_INIT  alındı   : Notify NO_PROPOSAL_CHOSEN', '  Sonuç: faz 1 (IKE SA) kurulamadı');
            else if (st.reason === 'psk') L.push('  IKE_SA_INIT  tamam (öneri eşleşti)', '  IKE_AUTH     alındı   : Notify AUTHENTICATION_FAILED', '  Sonuç: kimlik doğrulama (ön paylaşımlı anahtar) başarısız');
            else if (st.reason === 'ts') L.push('  IKE_SA_INIT  tamam', '  IKE_AUTH     tamam (IKE SA kuruldu)', '  CREATE_CHILD_SA önerilen TS: ' + (V.proposed || V.local) + ' <-> ' + V.remote, '  alındı: Notify TS_UNACCEPTABLE', '  Sonuç: faz 2 (IPsec SA) kurulamadı');
            else L.push('  IKE_SA_INIT tamam · IKE_AUTH tamam · CHILD_SA tamam', '  Sonuç: tünel kurulu');
            return L.join('\n');
        }
        function fileCmd(a) {
            const f = a[a.length - 1] || '';
            const kf = S.rt.kd ? S.rt.kd.files[f] : undefined;
            if (kf !== undefined) {
                if (a[0] === 'grep') { if (a.length < 3) return { err: 'incomplete', msg: 'Usage: grep [OPTION]... PATTERNS [FILE]...' }; const g = grepFilter(a.slice(0, -1), kf); if (g.err) return { err: 'invalid', msg: g.err }; return { out: g.out, log: { kdread: f } }; }
                if (a.length === 2) return { out: kf, log: { kdread: f } };
            }
            const isIke = /(\$FWDIR|\/opt\/CPsuite-R81\.20\/fw1)\/log\/(ikev2\.xmll|ike\.elg)$/.test(f);
            if (a[0] === 'grep') {
                if (a.length < 3) return { err: 'incomplete', msg: 'Usage: grep [OPTION]... PATTERNS [FILE]...' };
                if (!isIke) return U();
                const g = grepFilter(a.slice(0, -1), ikeLog()); if (g.err) return { err: 'invalid', msg: g.err };
                return { out: g.out, log: { ikelog: true } };
            }
            if (a.length !== 2) return U();
            if (!isIke) return U();
            return { out: ikeLog(), log: { ikelog: true } };
        }

        // ── tcpdump ve fw monitor
        function tcpFilter(toks) {
            // desteklenen: host X | src X | dst X | port N | net A.B.C.D/N , "and" ile birleşik
            const conds = []; let i = 0;
            while (i < toks.length) {
                const t = toks[i];
                if (t === 'and' || t === '&&') { i++; continue; }
                if (['host', 'src', 'dst'].includes(t)) { const v = toks[i + 1]; if (!v || !isIp(v)) return null; conds.push({ k: t, v }); i += 2; continue; }
                if (t === 'port') { const v = toks[i + 1]; if (!/^\d+$/.test(v || '')) return null; conds.push({ k: 'port', v: +v }); i += 2; continue; }
                if (t === 'net') { const v = toks[i + 1]; if (!v || !/^[\d.]+\/\d+$/.test(v)) return null; conds.push({ k: 'net', v }); i += 2; continue; }
                if (t === 'tcp' || t === 'udp' || t === 'icmp' || t === 'arp') { conds.push({ k: 'proto', v: t }); i++; continue; }
                const fm = /^tcp\[tcpflags\]\s*(?:&\s*\(?\s*(tcp-[a-z]+(?:\s*\|\s*tcp-[a-z]+)*)\s*\)?\s*!=\s*0|==\s*(tcp-[a-z]+(?:\s*\|\s*tcp-[a-z]+)*))$/.exec(t);
                if (fm) {
                    const fl = (fm[1] || fm[2]).split('|').map(x => TCPF[x.trim()]);
                    if (fl.some(x => !x)) return null;
                    conds.push({ k: 'flags', v: fl, eq: !fm[1] }); i++; continue;
                }
                return null;
            }
            return conds;
        }
        // Linux tcpdump (pcap-filter) bayrak ifadeleri: 'tcp[tcpflags] & (tcp-syn|tcp-rst) != 0' ya da 'tcp[tcpflags] == tcp-syn' (tek tırnak içinde)
        const TCPF = { 'tcp-fin': 'F', 'tcp-syn': 'S', 'tcp-rst': 'R', 'tcp-push': 'P', 'tcp-ack': 'A', 'tcp-urg': 'U' };
        const flagSet = p => ['F', 'S', 'R', 'P', 'A', 'U'].filter(x => p.proto === 'tcp' && p.fl.includes(x));
        const flagMatch = (p, c) => { if (p.proto !== 'tcp') return false; const f = flagSet(p); return c.eq ? f.length === c.v.length && c.v.every(x => f.includes(x)) : c.v.some(x => f.includes(x)); };
        const pMatch = (p, conds) => conds.every(c => c.k === 'flags' ? flagMatch(p, c) : c.k === 'host' ? (p.src === c.v || p.dst === c.v) : c.k === 'src' ? p.src === c.v : c.k === 'dst' ? p.dst === c.v
            : c.k === 'port' ? (p.sp === c.v || p.dp === c.v) : c.k === 'net' ? (inNet(p.src, c.v) || inNet(p.dst, c.v)) : c.k === 'proto' ? p.proto === c.v : true);
        const tsOf = (p, k) => '10:21:' + String([3, 4, 6][p.t] || 6).padStart(2, '0') + '.' + String(123456 + k * 4111 + (p.rep ? 2100 : 0)).slice(0, 6);
        function tcpdump(a) {
            let dev = null, cnt = 0, i = 1, nflag = false;
            for (; i < a.length; i++) {
                const t = a[i];
                if (t === '-i') { dev = a[++i]; continue; }
                if (t === '-c') { cnt = +a[++i]; continue; }
                if (/^-[nevS]+i$/.test(t)) { if (t.includes('n')) nflag = true; dev = a[++i]; continue; }
                if (/^-[nevS]+$/.test(t)) { if (t.includes('n')) nflag = true; continue; }
                if (/^-w$|^-s$|^-s0$/.test(t)) return U('# [Simülatör] Dosyaya yazma (-w) / snaplen seçenekleri bu lab\'da desteklenmiyor; ekranda okuyun.');
                break;
            }
            dev = dev || 'eth0';
            if (dev !== 'any' && !M().ifs[dev]) return { err: 'value', msg: 'tcpdump: ' + dev + ': No such device exists\n(SIOCGIFHWADDR: No such device)' };
            const conds = tcpFilter(a.slice(i));
            if (!conds) return { err: 'invalid', msg: 'tcpdump: syntax error in filter expression: syntax error' };
            const pk = [];
            const L = ['tcpdump: verbose output suppressed, use -v or -vv for full protocol decode', 'listening on ' + dev + ', link-type ' + (dev === 'any' ? 'LINUX_SLL (Linux cooked v1)' : 'EN10MB (Ethernet)') + ', capture size 262144 bytes'];
            if (conds.some(c => c.k === 'proto' && c.v === 'arp')) {
                arpPackets().forEach(p => { if ((dev === 'any' || p.dev === dev) && conds.every(c => c.k === 'proto' ? c.v === 'arp' : c.k === 'host' ? (p.who === c.v || p.tell === c.v) : c.k === 'net' ? (inNet(p.who, c.v) || inNet(p.tell, c.v)) : false)) pk.push(p); });
                const selA = cnt ? pk.slice(0, cnt) : pk;
                selA.forEach((p, k) => L.push('10:21:0' + (3 + p.t) + '.' + String(223344 + k * 37 + (p.reply ? 612 : 0)).slice(0, 6) + ' ' + (dev === 'any' ? (p.o ? 'Out ' : 'In  ') : '') + (p.reply ? 'ARP, Reply ' + p.who + ' is-at ' + p.mac + ', length 28' : 'ARP, Request who-has ' + p.who + ' tell ' + p.tell + ', length 46')));
                if (!cnt || selA.length < cnt) L.push('^C');
                L.push(selA.length + ' packets captured', selA.length + ' packets received by filter', '0 packets dropped by kernel');
                L.push(selA.length ? '# [Simülatör] Linux aracı (tcpdump); ARP satırları sadeleştirildi.' : '# [Simülatör] Eşleşen ARP paketi yok; Ctrl+C ile durduruldu.');
                return { out: L.join('\n'), log: { tcpdump: { dev, expr: a.slice(i).join(' '), n: selA.length, arp: true } } };
            }
            flows().forEach((f) => points(f).forEach(p => { if ((p.pt === 'i' || p.pt === 'O') && (dev === 'any' || p.dev === dev) && pMatch(p, conds)) pk.push(p); }));
            const sel = cnt ? pk.slice(0, cnt) : pk;
            sel.forEach((p, k) => {
                const fl = p.fl === '.S....' ? 'S' : p.fl === '.S..A.' ? 'S.' : 'R.';
                const nm = x => (nflag ? x : x);
                L.push(tsOf(p, k) + (dev === 'any' ? ' ' + (p.pt === 'i' ? 'In ' : 'Out') + ' ' : ' ') + 'IP ' + nm(p.src) + '.' + p.sp + ' > ' + nm(p.dst) + '.' + p.dp + ': Flags [' + fl + '], seq ' + (p.rep ? 529408704 : 1812340000) + (fl !== 'S' ? ', ack 1812340001' : '') + ', win ' + (fl === 'R.' ? 0 : 64240) + ', length 0');
            });
            if (!cnt || sel.length < cnt) L.push('^C');
            L.push(sel.length + ' packets captured', sel.length + ' packets received by filter', '0 packets dropped by kernel');
            if (!sel.length) L.push('# [Simülatör] Eşleşen paket yok; Ctrl+C ile durduruldu.');
            if (!a.slice(i).length) L.splice(2, 0, '# [Simülatör] UYARI: filtresiz yakalama tüm trafiği gösterir; üretimde "host <ip>" gibi bir filtre verin.');
            return { out: L.join('\n'), log: { tcpdump: { dev, expr: a.slice(i).join(' '), n: sel.length } } };
        }
        function fwMonitor(a) {
            let expr = null; const F = [];
            for (let i = 2; i < a.length; i++) {
                if (a[i] === '-e') { expr = a[++i]; continue; }
                if (a[i] === '-F') { F.push(a[++i]); continue; }
                if (a[i] === '-o' || a[i] === '-m' || a[i] === '-p' || a[i] === '-x') return U('# [Simülatör] Bu fw monitor seçeneği lab\'da desteklenmiyor; -e "accept …;" ya da -F kullanın.');
                return { err: 'invalid', msg: 'Usage: fw monitor [-u|s] [-i] [-d] [-D] [-e expr | -f <filter-file|->] [-l len] [-m mask] [-x offset[,len]] [-o <file>] [-F src,sport,dst,dport,proto] [-p [-+]pos]' };
            }
            if (expr === undefined || (expr === null && !F.length)) return { err: 'incomplete', msg: '# [Simülatör] Filtre yok: fw monitor -e "accept host(<ip>);" ya da -F "<src>,<sport>,<dst>,<dport>,<proto>" verin.' };
            let match, hosts = [];
            if (expr !== null) {
                const e = expr.trim();
                if (!/^accept\b[\s\S]*;$/.test(e)) return { err: 'invalid', msg: 'monitor: getting filter (from command line)\nmonitor: compiling\nmonitorfilter:\n# [Simülatör] Derleme hatası: ifade "accept … ;" biçiminde olmalı (sonda noktalı virgül).' };
                const body = e.replace(/^accept\s*/, '').replace(/;$/, '').trim();
                const hs = [...body.matchAll(/host\(\s*([\d.]+)\s*\)/g)].map(x => x[1]).concat([...body.matchAll(/\b(?:src|dst)\s*=\s*([\d.]+)/g)].map(x => x[1]));
                const ps = [...body.matchAll(/port\(\s*(\d+)\s*\)/g)].map(x => +x[1]).concat([...body.matchAll(/\b(?:sport|dport)\s*=\s*(\d+)/g)].map(x => +x[1]));
                if (!hs.length && !ps.length && body !== '') return U('# [Simülatör] Bu lab\'da fw monitor ifadesinde host(), src=, dst=, port() desteklenir.');
                if (hs.some(h => !isIp(h))) return { err: 'invalid', msg: '# [Simülatör] Derleme hatası: geçersiz IP adresi.' };
                hosts = hs;
                match = p => (!hs.length || hs.some(h => p.src === h || p.dst === h)) && (!ps.length || ps.some(x => p.sp === x || p.dp === x));
            } else {
                const fs = [];
                for (const s of F) { const x = s.split(','); if (x.length !== 5 || ![0, 2].every(k => x[k] === '0' || isIp(x[k])) || ![1, 3, 4].every(k => /^\d+$/.test(x[k]))) return { err: 'invalid', msg: '# [Simülatör] -F biçimi: "<src>,<sport>,<dst>,<dport>,<proto>" (0 = herhangi), ör. -F "10.64.10.60,0,198.51.100.25,443,0"' }; fs.push(x); }
                hosts = fs.map(x => x[0]).concat(fs.map(x => x[2])).filter(x => x !== '0');
                match = p => fs.some(x => (x[0] === '0' || x[0] === p.src) && (x[1] === '0' || +x[1] === p.sp) && (x[2] === '0' || x[2] === p.dst) && (x[3] === '0' || +x[3] === p.dp) && (x[4] === '0' || +x[4] === (p.proto === 'udp' ? 17 : 6)));
            }
            const pk = []; flows().forEach(f => points(f).forEach(p => { if (match(p)) pk.push(p); }));
            const L = expr !== null ? ['monitor: getting filter (from command line)', 'monitor: compiling', 'monitorfilter:', 'Compiled OK.', 'monitor: loading', 'monitor: monitoring (control-C to stop)']
                : ['# [Simülatör] -F (hızlı filtre) başlık satırları sadeleştirildi.', 'monitor: monitoring (control-C to stop)'];
            pk.forEach((p, k) => {
                L.push('[vs_0][fw_' + (k % 2) + '] ' + p.dev + ':' + p.pt + '[60]: ' + p.src + ' -> ' + p.dst + ' (' + (p.proto === 'udp' ? 'UDP' : 'TCP') + ') len=60 id=' + (23451 + k));
                L.push('TCP: ' + p.sp + ' -> ' + p.dp + ' ' + p.fl + ' seq=' + (p.rep ? '1f8e22c0' : '6c3a1f20') + ' ack=' + (p.rep ? '6c3a1f21' : '00000000'));
            });
            L.push('^C', 'monitor: unloading');
            if (!pk.length) L.push('# [Simülatör] Eşleşen paket yok.');
            return { out: L.join('\n'), log: { fwmon: { expr, F, hosts, n: pk.length } } };
        }
        // fw up_execute: verilen akışın kurulu Access Control politikasında hangi kurala düştüğünü gösterir (trafik üretmez)
        function upExecute(a) {
            const kv = {};
            for (const t of a.slice(2)) { const m = t.match(/^(src|dst|ipp|dport|sport)=(\S+)$/); if (!m) return { err: 'invalid', msg: 'Usage: fw up_execute src=<ip> dst=<ip> ipp=<proto> [dport=<port>] [sport=<port>]\n# [Simülatör] Örnek: fw up_execute src=10.64.10.50 dst=198.51.100.80 ipp=6 dport=443' }; kv[m[1]] = m[2]; }
            if (!kv.src || !kv.dst || !kv.ipp || !isIp(kv.src) || !isIp(kv.dst)) return { err: 'incomplete', msg: 'Usage: fw up_execute src=<ip> dst=<ip> ipp=<proto> [dport=<port>] [sport=<port>]' };
            const f = { src: kv.src, dst: kv.dst, proto: kv.ipp === '17' ? 'udp' : kv.ipp === '6' ? 'tcp' : 'other', dport: +(kv.dport || 0) };
            const rs = rulesNow(), r = rs.find(x => ruleMatch(x, f));
            const act = r ? (r.act === 'accept' ? 'Accept' : 'Drop') : 'Drop';
            const L = ['Rulebase execution ended successfully.', 'Overall status:', '----------------', 'Match status: MATCH', 'Action: ' + act, '', 'Per Layer:', '----------', 'Layer name: Network', 'Match status: MATCH',
                'Action: ' + act, 'Matched rule: ' + (r ? r.n : 'Implicit Cleanup'), '# [Simülatör] Çıktı sadeleştirildi. Kurulu politikaya bakar; yayınlanmamış ya da kurulmamış değişiklikleri görmez.'];
            return { out: L.join('\n'), log: { upexec: { src: f.src, dst: f.dst, dport: f.dport, rule: r ? r.n : null, name: r ? r.name : null, act } } };
        }
        // ── ARP / komşu tablosu (Linux: ip neigh) ve Proxy ARP (fw ctl arp, CLI Reference R81.20 s. 1072)
        // Kaynaklar: lab.hosts (yanıt veren komşular), SIM.arpOk (ARP'ye yanıt veren ama ping'e yanıt vermeyen),
        // SIM.proxyArp [{ ip, dev }] ($FWDIR/conf/local.arp kayıtları), SIM.arpq [{ who, tell, dev }] (dışarıdan gelen ARP istekleri).
        const nmac = ip => '00:50:56:8a:' + ip.split('.').slice(2).map(x => (+x).toString(16).padStart(2, '0')).join(':');
        const connDev = ip => { const r = lookup(ip); return r && r.type === 'C' && r.dev !== 'lo' ? r.dev : null; };
        const arpAnswers = ip => (lab.hosts || []).includes(ip) || (SIM.arpOk || []).includes(ip);
        function neighTable() {
            const T = [], seen = new Set();
            const add = (ip, st) => { const dev = connDev(ip); if (!dev || seen.has(ip) || Object.values(M().ifs).some(i => i.ip === ip)) return; seen.add(ip); T.push({ ip, dev, st, mac: st === 'FAILED' ? null : nmac(ip) }); };
            (lab.hosts || []).forEach(ip => add(ip, 'REACHABLE'));
            S.ev.filter(e => e.ping).forEach(e => add(e.ping, arpAnswers(e.ping) ? 'REACHABLE' : 'FAILED'));
            (SIM.arpOk || []).forEach(ip => add(ip, 'STALE'));
            return T;
        }
        function arpPackets() {
            const P = [];
            (SIM.arpq || []).forEach(q => { for (let t = 0; t < 3; t++) { P.push({ dev: q.dev, who: q.who, tell: q.tell, t }); const pa = (SIM.proxyArp || []).find(x => x.ip === q.who && x.dev === q.dev); if (pa) { P.push({ dev: q.dev, who: q.who, reply: true, mac: mac(q.dev), o: true, t }); break; } } });
            S.ev.filter(e => e.ping).forEach(e => { const dev = connDev(e.ping); if (!dev || !ifUp(dev) || Object.values(M().ifs).some(i => i.ip === e.ping)) return;
                for (let t = 0; t < 3; t++) { P.push({ dev, who: e.ping, tell: ifIp(dev), o: true, t }); if (arpAnswers(e.ping)) { P.push({ dev, who: e.ping, reply: true, mac: nmac(e.ping), t }); break; } } });
            return P;
        }
        function ipNeigh(a) {
            // ip neigh | ip neigh show [dev <if>] [<ip>] (ip n / ip neighbor / ip neighbour)
            let dev = null, ip = null, i = 2;
            if (a[i] === 'show' || a[i] === 'list' || a[i] === 'ls') i++;
            for (; i < a.length; i++) {
                if (a[i] === 'dev' && a[i + 1]) { dev = a[++i]; if (!M().ifs[dev]) return { err: 'value', msg: 'Cannot find device "' + dev + '"' }; continue; }
                if (isIp(a[i]) && !ip) { ip = a[i]; continue; }
                if (['add', 'del', 'delete', 'change', 'replace', 'flush'].includes(a[i])) return U('# [Simülatör] ARP tablosunu elle değiştirmek bu lab\'da desteklenmiyor (Gaia\'da kalıcı ARP clish ile yapılır).');
                return { err: 'invalid', msg: 'Command "' + a[i] + '" is unknown, try "ip neigh help".' };
            }
            const T = neighTable().filter(x => (!dev || x.dev === dev) && (!ip || x.ip === ip));
            const L = T.map(x => x.ip + ' dev ' + x.dev + (x.mac ? ' lladdr ' + x.mac : '') + ' ' + x.st);
            L.push('# [Simülatör] Linux aracı (iproute2); çıktı sadeleştirildi.');
            return { out: L.join('\n'), log: { neigh: { dev, ip, n: T.length } } };
        }
        function fwCtlArp(a) {
            const o = a.slice(3);
            if (o.includes('-h')) return 'Usage: fw [-d] ctl arp [-h] [-n]';
            if (o.some(x => x !== '-n')) return { err: 'invalid', msg: 'Usage: fw [-d] ctl arp [-h] [-n]' };
            const P = SIM.proxyArp || [];
            const L = P.length ? [pad('IP Address', 18) + pad('MAC Address', 20) + 'Interface'].concat(P.map(x => pad(x.ip, 18) + pad(mac(x.dev), 20) + x.dev)) : [];
            L.push(P.length ? '# [Simülatör] Biçim sadeleştirildi (belgede örnek çıktı yok). Kayıtlar $FWDIR/conf/local.arp dosyasından gelir.' : '# [Simülatör] Proxy ARP kaydı yok ($FWDIR/conf/local.arp dosyasında kayıt bulunmuyor).');
            return { out: L.join('\n'), log: { fwarp: { n: P.length } } };
        }
        function ipCmd(a) {
            const s = a.slice(1).join(' ');
            if (/^(n|neigh|neighbor|neighbour)$/.test(a[1] || '')) return ipNeigh(a);
            if (/^route get [\d.]+$/.test(s) && isIp(a[3])) {
                const r = lookup(a[3]);
                if (!r) return { err: 'value', msg: 'RTNETLINK answers: Network is unreachable' };
                if (r.dev === 'lo') return 'local ' + a[3] + ' dev lo src ' + a[3] + ' \n    cache <local> ';
                return { out: a[3] + (r.type === 'S' ? ' via ' + r.gw : '') + ' dev ' + r.dev + ' src ' + ifIp(r.dev) + ' \n    cache ', log: { routeget: a[3], dev: r.dev } };
            }
            if (s === 'route' || s === 'route show' || s === 'r') {
                return rib().filter(r => r.dev !== 'lo').sort((x, y) => (x.len === 0 ? -1 : y.len === 0 ? 1 : 0)).map(r => r.type === 'S' ? (r.len === 0 ? 'default' : r.net + '/' + r.len) + ' via ' + r.gw + ' dev ' + r.dev + ' proto routed '
                    : r.net + '/' + r.len + ' dev ' + r.dev + ' proto kernel scope link src ' + ifIp(r.dev) + ' ').join('\n');
            }
            if (/^(addr|a|link|neigh|-s)/.test(s)) return U();
            return { err: 'invalid', msg: 'Object "' + (a[1] || '') + '" is unknown, try "ip help".' };
        }
        function cpview(a) {
            if (a.length > 1) return U();
            const c = SIM.cpu || { user: 2, sys: 1, idle: 97, cpus: 4 };
            const n = 120 + flows().length * 7;
            const bar = '|' + '-'.repeat(74) + '|', row = t => '| ' + pad(t, 73) + '|';
            const L = ['# [Simülatör] cpview etkileşimli, her birkaç saniyede yenilenen bir ekrandır (q ile çıkılır). Burada Overview sekmesinin sadeleştirilmiş tek görüntüsü:',
                bar, row(pad('CPVIEW.Overview', 52) + '24Sep2026 10:21:07'), bar, row('Overview  SysInfo  Network  CPU  I/O  Software-blades  Hardware-Health'), bar,
                row('Num of CPUs: ' + c.cpus + '    CPU kullanımı: %' + (100 - c.idle)), row('Bellek: toplam 7.6G, kullanılan %' + (SIM.mem || 38)),
                row('Bağlantı sayısı: ' + n + ' (tepe ' + n * 3 + ')'), row('Throughput: 42 Mbps · Paket hızı: 6.1 Kpps'), bar];
            return { out: L.join('\n'), log: { cpview: true } };
        }
        function cpinfo() {
            return ['This is Check Point CPinfo Build 914000231 for GAIA', '[IDA]', '\tNo hotfixes..', '', '[CPFC]', '\tHOTFIX_R81_20_JUMBO_HF_MAIN\tTake:  ' + ((SIM.jhf) || 76), '',
                '[FW1]', '\tHOTFIX_R81_20_JUMBO_HF_MAIN\tTake:  ' + ((SIM.jhf) || 76), '', '# [Simülatör] Bölümler kısaltıldı; take numarası temsilidir.'].join('\n');
        }

        // ═══ clish yürütme, hata biçimleri, ? ve Tab ═══════════════════════
        function unsupported(line) {
            const t = C.tokenize(line).map(x => x.t.toLowerCase());
            return CL_UNSUP.some(u => { const w = u.split(' '); return w.length <= t.length && w.every((x, k) => x === t[k] || (k > 0 && t[k].length >= 3 && x.startsWith(t[k]))); });
        }
        // Belirsiz kısaltmayı sonraki sözcüklerle çöz: yalnız bir aday tam komut oluşturuyorsa onu seç
        function matchCl(line) {
            let r = C.match(CL, line, ctx, false);
            for (let guard = 0; !r.ok && r.err === 'amb' && guard < 4; guard++) {
                const toks = C.tokenize(line), at = r.at;
                const cands = (C.help(CL, line.slice(0, toks[at].o + toks[at].t.length), ctx, () => '').words || []);
                const oks = cands.map(w => line.slice(0, toks[at].o) + w + line.slice(toks[at].o + toks[at].t.length)).map(l => ({ l, r: C.match(CL, l, ctx, false) })).filter(x => x.r.ok || x.r.err === 'amb');
                if (oks.length !== 1) break;
                line = oks[0].l; r = oks[0].r;
            }
            return r;
        }
        function clishLine(line, viaC) {
            const r = matchCl(line);
            const first = (C.tokenize(line)[0] || { t: '' }).t;
            if (!r.ok) {
                if (r.err === 'empty') return '';
                if (EXPERT_ROOTS.includes(first) && !viaC) { log({ raw: line, err: 'wrongmode' }); return '# [Simülatör] "' + first + '" bu lab\'da bir expert (bash) komutudur. Önce "expert" yazıp parolayı girin; iş bitince "exit" ile clish\'e dönün.\n# (Gerçek Gaia\'da bazı Check Point komutları clish\'te "extended commands" olarak da çalışır: show extended commands.)'; }
                log({ raw: line, err: r.err });
                if (r.err === 'amb') return '# [Simülatör] Belirsiz kısaltma: "' + line.trim() + '" — birden çok komuta uyuyor; ? ile adayları görün.';
                if (unsupported(line)) { S.ev[S.ev.length - 1].err = 'unsupported'; return '# [Simülatör] Bu komut gerçek Gaia\'da var ama bu lab sürümünde henüz desteklenmiyor. ? ile desteklenenleri görün.'; }
                if (r.err === 'incomplete') return 'CLINFR0349 Incomplete command';
                return 'CLINFR0329 Invalid command:\'' + line.trim() + '\'';
            }
            if (viaC && ['expert', 'exit', 'quit', 'reboot', 'set expert-password'].includes(r.canon)) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu komut clish -c ile çalıştırılmaz.'; }
            log({ raw: line, canon: r.canon, mode: 'clish', via: viaC ? 'clish -c' : undefined });
            const out = r.cmd.run(r.args);
            if (out && typeof out === 'object') {
                const ev = S.ev.pop(); log({ raw: ev.raw, err: out.err });
                return out.msg || 'CLINFR0329 Invalid command:\'' + line.trim() + '\'';
            }
            return out || '';
        }
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; if (p.secret) log({ raw: '***', prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) { S.loggedOut = false; S.mode = 'clish'; S.stack = []; return '# [Simülatör] Yeniden bağlandınız (clish).'; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            if (S.mode === 'expert') {
                // bash: ";" ile ardışık komutlar (tırnak dışında), ör. clusterXL_admin down;clusterXL_admin up
                const parts = splitSemi(line.trim());
                if (parts.length < 2) return expertLine(line.trim());
                const outs = [];
                for (const p of parts) { if (!p) continue; const b = S.ev.length; outs.push(expertLine(p)); for (let k = b; k < S.ev.length; k++) S.ev[k].seq = true; if (S.mode !== 'expert' || S.pending) break; }
                return outs.filter(Boolean).join('\n');
            }
            return clishLine(line);
        }
        function prompt() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            return S.mode === 'expert' ? '[Expert@' + host() + ':0]# ' : host() + '> ';
        }
        function help(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            if (S.mode === 'expert') return '# [Simülatör] Expert (bash) kabuğunda ? yardımı yoktur; komutların -h seçeneğine ya da CLI Reference Guide\'a bakın.';
            const kh = (w, a, e) => w ? (KW[w] || '') : (e ? (VARH[e.name] || (e.k === 'int' ? 'Sayı (' + e.a + '-' + e.b + ')' : '')) : '');
            const h = C.help(CL, raw, ctx, kh);
            if (h.amb) return '# [Simülatör] Belirsiz kısaltma: "' + raw.trim() + '"';
            if (h.none) return 'CLINFR0329 Invalid command:\'' + raw.trim() + '\'';
            if (h.words) return h.words.map(w => pad(w, 20) + '- ' + (KW[w] || '')).join('\n');
            return h.rows.map(([w, d]) => pad(w, 20) + (d ? '- ' + d : '')).join('\n');
        }
        const EXP_CMDS = ['mgmt_cli', 'fw', 'cpstat', 'cphaprob', 'clusterXL_admin', 'vpn', 'tcpdump', 'cpview', 'cpinfo', 'ip', 'ping', 'clish', 'exit', 'hostname', 'cat', 'grep', 'reboot'];
        function complete(raw) {
            if (S.pending || S.loggedOut) return null;
            if (S.mode === 'expert') {
                const t = raw.match(/^(\S+)$/); if (!t) return null;
                const hits = EXP_CMDS.filter(c => c.startsWith(t[1]));
                return hits.length === 1 ? hits[0] + ' ' : null;
            }
            const r = C.complete(CL, raw, ctx, null);
            if (r !== null) return r;
            // arayüz adı (eth…) tamamlama
            const m = raw.match(/^(.*\s)(\S+)$/);
            if (m && /interface\s+$/.test(m[1])) { const hits = Object.keys(M().ifs).filter(n => n.startsWith(m[2])); if (hits.length === 1) return m[1] + hits[0] + ' '; }
            return null;
        }

        // ── Başlangıç: lab.start (clish) uygulanır ve kaydedilir; lab.startUnsaved sonra uygulanır
        function apply(cmds) { for (const c of cmds) { const o = clishLine(c); if (/CLINFR|Simülatör/.test(o)) throw new Error('lab başlangıç komutu hatalı: ' + c + ' → ' + o); } }
        S.saved = clone(M());
        apply(lab.start || []);
        S.saved = clone(M());
        apply(lab.startUnsaved || []);
        if (MG) MG.boot(lab.mgmtStart || [], lab.mgmt.installed !== false, lab.mgmtLate || []);
        S.ev = []; S.hist = [];

        const EV = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            ranIn: (re, mode) => S.ev.some(e => e.canon && re.test(e.canon) && e.mode === mode),
            after: (a, b) => { const i = S.ev.findIndex(e => e.canon && a.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && b.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            err: k => S.ev.some(e => e.err === k),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon),
            warned: w => S.ev.some(e => e.warn === w),
            zdebug: fn => S.ev.some(e => e.zdebug && (!fn || fn(e.zdebug))),
            upexec: fn => S.ev.some(e => e.upexec && (!fn || fn(e.upexec))),
            mgmt: fn => S.ev.some(e => e.mgmt && (!fn || fn(e))),
            fwmon: fn => S.ev.some(e => e.fwmon && (!fn || fn(e.fwmon))),
            tcpdump: fn => S.ev.some(e => e.tcpdump && (!fn || fn(e.tcpdump))),
            list: () => S.ev
        };
        return {
            literalQ: () => S.mode === 'expert',
            vendor: 'checkpoint',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            _toPriv: () => { S.mode = 'clish'; S.stack = []; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            variant: () => VAR,
            get model() { return S.m; }, get savedModel() { return S.saved; },
            ev: EV, mode: () => S.mode, dirty, rib, lookup, ifUp,
            decide: f => decide(f), cluster: () => (SIM.cluster ? { local: clMembers()[0].st, peer: clMembers()[1].st, admin: S.rt.clAdmin } : null),
            vpnDebug: () => ({ vpn: S.rt.vpnDebug, ike: S.rt.ikeDebug }),
            kdebug: () => ({ active: kdActive(), flags: S.rt.kd ? S.rt.kd.flags.slice() : KD_DEF.slice(), filt: S.rt.kd ? Object.assign({}, S.rt.kd.filt) : {}, buf: S.rt.kd ? S.rt.kd.buf : 50 }),
            showRun: () => showConf(), mgmt: () => MG, inactive, allowedOk, files: () => S.files, backups: () => S.rt.backups.slice(), snaps: () => S.rt.snaps.slice(),
        };
    }
    return { session };
})();
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'checkpoint': CgLabGaia });
if (typeof module !== 'undefined') module.exports = CgLabGaia;
