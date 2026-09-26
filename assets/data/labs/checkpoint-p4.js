'use strict';
// ─── CLI Lab: Check Point parti 4 (cp-28, cp-29, cp-35, cp-36), Gaia R81.20 görünümü ──────────────
// Motor eklentisi: assets/js/lab/gaia-p4.js (aaa radius/tacacs, rba role, snapshot-scheduled, fw log, cp_log_export,
// vgdisplay/lvs, mgmt_cli show-logs / show-last-published-session). Adresler yalnız güvenli örnek bloklardan;
// paylaşılan anahtar ve parolalar lab yer tutucusudur.
(function () {
    const root = typeof window !== 'undefined' ? window : globalThis;
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const BASE = ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on', 'set interface eth1 comments WAN',
        'set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on', 'set interface eth2 comments LAN',
        'set interface eth3 ipv4-address 172.24.50.1 mask-length 24', 'set interface eth3 state on', 'set interface eth3 comments DMZ',
        'set static-route default nexthop gateway address 203.0.113.1 on'];
    const SIMBASE = { policy: { name: 'LAB-Policy' }, cpu: { user: 4, sys: 3, idle: 93, cpus: 4 } };
    const PW = 'Expert-Lab1';
    const EX = cmds => ['expert', PW].concat(cmds);
    const MG_BASE = ['add network name LAN-NET subnet 10.64.10.0 mask-length 24', 'add network name MGMT-NET subnet 10.240.0.0 mask-length 16',
        'add access-rule layer Network position 1 name Mgmt-Access source MGMT-NET destination Any service.1 ssh service.2 https action Accept track.type Log'];
    const OUT_RULE = 'add access-rule layer Network position 2 name LAN-OUT source LAN-NET destination Any service.1 http service.2 https service.3 domain-udp action Accept track.type Log';
    // Kontrol yardımcıları: eklenti durumu (model.p4 ve CgGaiaP4.st)
    const P = m => (m && m.p4) || { rad: { srv: {}, uid: '0', nas: '' }, tac: { srv: {}, state: 'off', uid: '0' }, roles: {}, snap: null };
    const ST = s => (root.CgGaiaP4 && root.CgGaiaP4.st(s)) || { lx: {}, revs: [] };
    const evs = s => s.ev.list();
    const firstIdx = (s, f) => evs(s).findIndex(f);
    const lastIdx = (s, f) => { const E = evs(s); for (let i = E.length - 1; i >= 0; i--) if (f(E[i])) return i; return -1; };
    const tsec = t => { const [h, m, x] = t.split(':').map(Number); return h * 3600 + m * 60 + (x || 0); };

    // ── cp-28 sabitleri (lab yer tutucuları)
    const RADSEC = 'Radius-Lab-Anahtar-2026', TACKEY = 'Tacacs-Lab-Anahtar-2026', OLDSEC = 'Eski-Radius-Anahtar-1';
    const FEAT = 'interface,static-route';
    const roleOk = (m, n) => { const r = P(m).roles[n]; return !!r && !r.all && !r.rw.length && FEAT.split(',').every(f => r.ro.includes(f)); };

    // ── cp-35: güvenlik logu üreteci (24 Eylül 2026, 10:00–10:20). Saldırı 10:07:00–10:07:5x arasında.
    const ATK = { scan: '198.51.100.77', sweep: '192.0.2.66', brute: '198.51.100.140' };
    const hms = s => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(v => String(v).padStart(2, '0')).join(':');
    function LOG(kind) {
        const E = [];
        const acc = (t, src, dst, port, p) => E.push({ t, a: 'accept', dir: '>', i: 'eth2', src, dst, port, sp: 40000 + (E.length * 37) % 20000, p: p || 'tcp', rule: 'LAN-OUT', inz: 'Internal', outz: 'External' });
        const drop = (t, src, dst, port, p) => E.push({ t, a: 'drop', dir: '>', i: 'eth1', src, dst, port, sp: 50000 + (E.length * 53) % 15000, p: p || 'tcp', rule: 'Cleanup rule', inz: 'External', outz: dst === '203.0.113.2' ? 'Local' : 'DMZ' });
        // olağan LAN trafiği: 10.64.10.50 en çok kayıt üreten kaynak (saldırgandan fazla)
        for (let k = 0; k < 36; k++) acc(hms(tsec('10:00:05') + k * 33), '10.64.10.50', k % 3 ? '198.51.100.80' : '198.51.100.81', k % 4 ? 443 : 80);
        for (let k = 0; k < 12; k++) acc(hms(tsec('10:00:40') + k * 97), k % 2 ? '10.64.10.51' : '10.64.10.60', '192.0.2.53', 53, 'udp');
        // dağınık internet gürültüsü
        drop('10:01:12', '192.0.2.200', '203.0.113.2', 23); drop('10:15:40', '192.0.2.200', '203.0.113.2', 23); drop('10:12:03', '198.51.100.9', '203.0.113.2', 3389);
        // saldırı
        const t0 = tsec('10:07:00');
        if (kind === 'scan') [21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 443, 445, 993, 995, 1433, 1723, 3306, 3389, 5432, 5900, 8080, 8443, 9100].forEach((p, k) => drop(hms(t0 + k * 2), ATK.scan, '203.0.113.2', p));
        if (kind === 'sweep') for (let k = 0; k < 25; k++) drop(hms(t0 + k * 2), ATK.sweep, '203.0.113.' + (10 + k), 445);
        if (kind === 'brute') for (let k = 0; k < 30; k++) drop(hms(t0 + k), ATK.brute, '203.0.113.2', 22);
        return E.sort((a, b) => tsec(a.t) - tsec(b.t));
    }

    // ── cp-36: SIEM beklentisi ve mevcut Log Exporter
    const SIEM = { 'target-server': '10.240.0.50', 'target-port': '514', protocol: 'tcp', enabled: 'true' };
    const LX_BASE = { 'target-server': '10.240.0.50', 'target-port': '514', protocol: 'tcp', format: 'syslog', enabled: 'true' };
    const LX_FIX = { proto: 'cp_log_export set name siem1 protocol tcp --apply-now', port: 'cp_log_export set name siem1 target-port 514 --apply-now', off: 'cp_log_export set name siem1 enabled true --apply-now' };
    const lxOk = s => { const X = ST(s).lx.siem1; return !!X && X.run && Object.keys(SIEM).every(k => X.cfg[k] === SIEM[k] && X.app && X.app[k] === SIEM[k]); };

    const LABS = [
    // ═══ cp-28: RADIUS / TACACS+ ═══
    {
        id: 'cp-28', vendor: 'checkpoint', level: 2, title: 'Yönetici RADIUS/TACACS+ ile girsin', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-08'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE.concat(['add aaa radius-servers priority 0 host 10.240.0.99 secret ' + OLDSEC + ' timeout 30']), sim: SIMBASE,
        story: 'Yöneticilerin gateway\'e kendi kurumsal hesaplarıyla girmesi isteniyor. İki RADIUS sunucusu hazır: birincil <code>10.240.0.21</code>, yedek <code>10.240.0.22</code> (UDP 1812). Listede kapatılmış eski bir sunucu (<code>10.240.0.99</code>) duruyor. '
            + 'Güvenlik ekibi, dışarıdan gelen süper kullanıcıların <code>sudo</code> ile yetki almasını (UID 96) ve grubu tanımlanmamış RADIUS kullanıcılarının yalnız okuma yetkisiyle girmesini istiyor. Ağ ekibi için ayrıca TACACS+ sunucusu <code>10.240.0.23</code> tanımlanacak. '
            + 'Lab paylaşılan anahtarları: RADIUS <code>' + RADSEC + '</code>, TACACS+ <code>' + TACKEY + '</code>.',
        lesson: L('Gaia, yerelde tanımlı olmayan yöneticileri bir kimlik doğrulama sunucusuna sorar. <b>RADIUS</b>\'ta her sunucunun bir <code>priority</code> değeri vardır (-999…999, küçük sayı önce denenir); Gaia yanıt alamazsa <code>timeout</code> kadar bekler ve sıradaki sunucuya geçer. <b>TACACS+</b> sunucularında priority 1–20 arasıdır ve TACACS+ ayrıca <code>state on</code> ile açılır. '
            + 'Yerelde olmayan kullanıcıya verilecek yetki bir <b>rol</b> ile tanımlanır: RADIUS için <code>radius-group-any</code> (sunucuda grup yoksa) ya da <code>radius-group-&lt;grup&gt;</code>, TACACS+ için <code>TACP-0</code> (ayrıcalık düzeyleri için TACP-1…15). Süper kullanıcı UID\'i 0 ise sudo gerekmez; 96 ise kullanıcı expert\'te <code>sudo /usr/bin/su -</code> ile yetki alır.',
            'Merkezi hesaplar tek yerden kapatılır ve her giriş sunucuda kayıt bırakır. Yanlış sıra ya da kapanmış bir sunucu her girişi timeout süresi kadar geciktirir; rolü tanımlanmamış dış kullanıcı ise girer ama hiçbir şey yapamaz.',
            'add aaa radius-servers priority 1 host 10.240.0.21 port 1812 prompt-secret timeout 3\nadd aaa radius-servers priority 2 host 10.240.0.22 port 1812 prompt-secret timeout 3\ndelete aaa radius-servers priority 0\nset aaa radius-servers super-user-uid 96\n'
            + 'add rba role radius-group-any domain-type System readonly-features ' + FEAT + '\nadd aaa tacacs-servers priority 1 server 10.240.0.23 key &lt;anahtar&gt; timeout 5\nset aaa tacacs-servers state on\nadd rba role TACP-0 domain-type System readonly-features ' + FEAT + '\nsave config',
            ['Paylaşılan anahtarı Gaia ve sunucuda farklı yazmak: sunucu isteği sessizce reddeder.', 'Kapatılmış sunucuyu listede bırakmak: her giriş önce onun timeout süresini bekler.', 'Tüm RADIUS timeout\'larının toplamını 50 saniyeye yaklaştırmak.',
                'Dış kullanıcılar için rol (radius-group-any / TACP-0) tanımlamamak.', 'Güvenlik duvarında UDP 1812\'yi (RADIUS) açmamak.', 'save config\'i unutmak.']),
        goals: ['RADIUS sunucularını öncelik sırasıyla eklemek', 'Kapatılmış sunucuyu kaldırmak', 'Süper kullanıcı UID\'i (0 / 96)', 'Dış kullanıcılar için rol', 'TACACS+ sunucusu ve TACP-0 rolü', 'save config'],
        tasks: [
            { t: 'Tanımlı RADIUS sunucularını listeleyin.', why: 'Değiştirmeden önce mevcut sırayı görün. Küçük priority numaralı sunucu önce denenir.',
              hints: ['show aaa radius-servers …', '<code>show aaa radius-servers list</code>'], steps: ['show aaa radius-servers list'],
              check: s => s.ev.ran(/^show aaa radius-servers list$/) },
            { t: 'Birincil RADIUS sunucusunu ekleyin: priority <b>1</b>, <code>10.240.0.21</code>, UDP <b>1812</b>, timeout <b>3</b> sn. Anahtarı komut satırına yazmayın: <code>prompt-secret</code> ile girin.',
              why: '<code>prompt-secret</code> anahtarı ekrana ve komut geçmişine yazmadan sorar. RFC 2865 en az 16 karakterlik anahtar önerir.',
              hints: ['add aaa radius-servers priority 1 host … port 1812 prompt-secret timeout 3', '<code>add aaa radius-servers priority 1 host 10.240.0.21 port 1812 prompt-secret timeout 3</code> → anahtar: <code>' + RADSEC + '</code>'],
              steps: ['add aaa radius-servers priority 1 host 10.240.0.21 port 1812 prompt-secret timeout 3', RADSEC],
              check: s => { const v = P(s.model).rad.srv['1']; return !!v && v.host === '10.240.0.21' && v.port === 1812 && v.timeout === 3 && v.secret >= 16; } },
            { t: 'Yedek RADIUS sunucusunu ekleyin: priority <b>2</b>, <code>10.240.0.22</code>, aynı port, anahtar ve timeout.',
              why: 'Birincil yanıt vermezse Gaia timeout sonunda sıradaki sunucuyu dener.',
              hints: ['priority 2 host 10.240.0.22 …', '<code>add aaa radius-servers priority 2 host 10.240.0.22 port 1812 prompt-secret timeout 3</code> → <code>' + RADSEC + '</code>'],
              steps: ['add aaa radius-servers priority 2 host 10.240.0.22 port 1812 prompt-secret timeout 3', RADSEC],
              check: s => { const v = P(s.model).rad.srv['2']; return !!v && v.host === '10.240.0.22' && v.port === 1812 && v.timeout === 3 && v.secret >= 16; } },
            { t: 'Soru: kapatılmış <code>10.240.0.99</code> (priority 0, timeout 30) listede kalırsa ne olur?', ask: { choices: [
                ['wait', 'Her girişte önce o denenir; yanıt gelmeyince 30 sn beklenir, sonra priority 1\'e geçilir'],
                ['skip', 'Gaia kapalı sunucuyu kendiliğinden atlar; etkisi yoktur'],
                ['local', 'Tüm girişler doğrudan yerel hesaba düşer'],
                ['last', 'Priority 0 en son denenir; yalnız diğerleri kapalıyken etkilidir']], correct: 'wait' },
              why: 'Küçük priority numarası yüksek önceliktir: 0, 1\'den önce denenir. Yanıt gelmeyen her sunucu timeout süresi kadar bekletir.',
              hints: ['Hangi numara önce denenir?', 'Yanıt gelmeyen sunucuda Gaia ne kadar bekler?'] },
            { t: 'Kapatılmış sunucuyu (priority 0) kaldırın.', why: 'Sunucu priority numarasıyla silinir.',
              hints: ['delete aaa radius-servers priority …', '<code>delete aaa radius-servers priority 0</code>'], steps: ['delete aaa radius-servers priority 0'],
              check: s => !P(s.model).rad.srv['0'] },
            { t: 'RADIUS süper kullanıcıları sudo ile yetki alsın: süper kullanıcı UID\'i <b>96</b>.',
              why: 'UID 0 kullanıcı root ile aynıdır, sudo gerekmez. UID 96 ile kullanıcı expert\'te <code>sudo /usr/bin/su -</code> çalıştırır; yetki yükseltme ayrı bir adım olur ve kayıt bırakır.',
              hints: ['set aaa radius-servers super-user-uid …', '<code>set aaa radius-servers super-user-uid 96</code>'], steps: ['set aaa radius-servers super-user-uid 96'],
              check: s => P(s.model).rad.uid === '96' },
            { t: 'Grubu tanımlanmamış RADIUS kullanıcıları için <code>radius-group-any</code> rolünü yalnız okuma yetkisiyle oluşturun (<code>' + FEAT + '</code>).',
              why: 'Dış kullanıcı yerelde tanımlanmaz; yetkisi bu rolden gelir. Sunucuda grup tanımlıysa rol adı <code>radius-group-&lt;grup&gt;</code> olur.',
              hints: ['add rba role radius-group-any domain-type System readonly-features …', '<code>add rba role radius-group-any domain-type System readonly-features ' + FEAT + '</code>'],
              steps: ['add rba role radius-group-any domain-type System readonly-features ' + FEAT],
              check: s => roleOk(s.model, 'radius-group-any') },
            { t: 'TACACS+ sunucusunu ekleyin (priority <b>1</b>, <code>10.240.0.23</code>, timeout <b>5</b>) ve TACACS+ doğrulamasını açın.',
              why: 'TACACS+ sunucusu eklemek yetmez; <code>set aaa tacacs-servers state on</code> olmadan Gaia TACACS+ kullanmaz (varsayılan off).',
              hints: ['add aaa tacacs-servers priority 1 server … key … timeout 5 → set aaa tacacs-servers state on', '<code>add aaa tacacs-servers priority 1 server 10.240.0.23 key ' + TACKEY + ' timeout 5</code> → <code>set aaa tacacs-servers state on</code>'],
              steps: ['add aaa tacacs-servers priority 1 server 10.240.0.23 key ' + TACKEY + ' timeout 5', 'set aaa tacacs-servers state on'],
              check: s => { const T = P(s.model).tac, v = T.srv['1']; return T.state === 'on' && !!v && v.ip === '10.240.0.23' && v.timeout === 5; } },
            { t: 'TACACS+ kullanıcılarının varsayılan rolü <code>TACP-0</code>\'ı aynı okuma yetkisiyle oluşturun.',
              why: 'Tüm TACACS+ kullanıcıları önce TACP-0 rolüyle girer; daha yüksek yetki için TACP-1…15 rolleri tanımlanır ve kullanıcı <code>tacacs_enable TACP-&lt;N&gt;</code> ile geçer.',
              hints: ['add rba role TACP-0 …', '<code>add rba role TACP-0 domain-type System readonly-features ' + FEAT + '</code>'],
              steps: ['add rba role TACP-0 domain-type System readonly-features ' + FEAT],
              check: s => roleOk(s.model, 'TACP-0') },
            { t: 'Soru: TACACS+ sunucusu çökerse ya da ulaşılamazsa yönetici nasıl doğrulanır?', ask: { choices: [
                ['local', 'Yerel parola mekanizmasıyla; o da başarısızsa giriş reddedilir'],
                ['deny', 'Hiç kimse giremez; konsol da kilitlenir'],
                ['any', 'Parola sorulmadan TACP-0 rolüyle girilir'],
                ['radius', 'Gaia her zaman RADIUS\'a devreder']], correct: 'local' },
              why: 'Gaia Administration Guide: TACACS+ sunucusu yanıt vermezse kullanıcı yerel parola mekanizmasıyla doğrulanır; yerel doğrulama da başarısızsa erişim verilmez. Bu yüzden yerel admin hesabının parolası güvenli yerde tutulur.',
              hints: ['Sunucu yoksa Gaia kimin parolasına bakabilir?', 'Yerel hesaplar.'] },
            { t: 'Ayarları kalıcı kaydedin.', why: 'AAA ayarları da Gaia yapılandırmasıdır; <code>save config</code> olmadan yeniden başlatmada kaybolur.',
              hints: ['save …', '<code>save config</code>'], steps: ['save config'], needs: [1, 2, 4, 5, 6, 7, 8],
              check: s => { const a = P(s.model), b = P(s.savedModel); return JSON.stringify(a) === JSON.stringify(b) && !b.rad.srv['0'] && !!b.rad.srv['1'] && !!b.rad.srv['2'] && b.tac.state === 'on' && b.rad.uid === '96' && roleOk(s.savedModel, 'TACP-0'); },
              fb: s => (JSON.stringify(P(s.model)) !== JSON.stringify(P(s.savedModel)) ? 'Kaydedilmemiş AAA değişikliği var: save config.' : null) },
        ],
        verify: ['show aaa radius-servers list', 'show aaa tacacs-servers list', 'show rba role radius-group-any', 'show rba role TACP-0'],
        learn: ['RADIUS priority -999…999, küçük sayı önce denenir; TACACS+ priority 1–20.', 'Yanıt yoksa timeout kadar beklenir, sonra sıradaki sunucu; RADIUS timeout toplamı 50 sn\'den az olmalı.', 'prompt-secret anahtarı geçmişe yazmadan sorar.',
            'super-user-uid 0 = sudo gerekmez, 96 = sudo /usr/bin/su -.', 'Dış kullanıcının yetkisi rolden gelir: radius-group-any, TACP-0 (TACP-N).', 'TACACS+ için state on şart; sunucu yoksa yerel parola.',
            'Kaynak: R81.20 Gaia Administration Guide s. 516 (sunucu türleri, TACACS+ yedek davranışı), 519–521 (RADIUS clish), 522–525 (rol, UID 0/96), 529–534 (TACACS+ clish, TACP rolleri), 463–464 (rba role). show aaa … list çıktı biçimi temsilidir. check_point.gaia cp_gaia_radius_server, cp_gaia_tacacs_server.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/126' }, cert: 'CCSA R81.20'
    },
    // ═══ cp-29: zamanlanmış snapshot + politika revizyonu ═══
    {
        id: 'cp-29', vendor: 'checkpoint', level: 2, title: 'Bakım penceresi: zamanlanmış snapshot + politika revizyonu', minutes: 30, kind: 'firewall', hostname: 'gw-a', pre: ['cp-11'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, sim: SIMBASE, mgmt: {}, mgmtStart: MG_BASE.concat([OUT_RULE]),
        variants: [
            { key: 'a', sim: { p4disk: { free: 127.81, lv: 40 } } },
            { key: 'b', sim: { p4disk: { free: 95.5, lv: 32 } } },
            { key: 'c', sim: { p4disk: { free: 150.25, lv: 50 } } },
        ],
        story: 'Değişiklikler her cumartesi 02:00\'daki bakım penceresinde yapılıyor. İstek: pencereden hemen önce gateway\'in otomatik snapshot\'ı alınsın; en çok <b>4</b>, en az <b>2</b> snapshot saklansın ve diskte her zaman <b>30 GB</b> boş kalsın. '
            + 'Bu geceki değişiklik: DMZ\'deki <code>WEB-SRV</code> (<code>172.24.50.10</code>) için LAN\'dan HTTPS kuralı. Kurulum tek kutuda (standalone): <code>mgmt_cli</code> aynı kutuda expert\'te çalışır. Expert parolası: <code>' + PW + '</code>. '
            + '<small>Her denemede disk boyutları değişir; "Yeni tur" ile tekrar oynayın.</small>',
        lesson: L('İki ayrı geri dönüş katmanı vardır. <b>Gaia snapshot</b>\'ı işletim sistemi, Check Point yazılımı ve yapılandırma dahil tüm bölümün LVM görüntüsüdür; <code>set snapshot-scheduled</code> ile zamanlanır (R81.20\'de tek görev). '
            + '<b>Politika revizyonu</b> ise yönetim sunucusundadır: her <code>publish</code> yeni bir revizyon oluşturur, SmartConsole\'da Installation History\'den belirli bir sürüm yeniden kurulabilir. Snapshot\'a dönmek tüm kutuyu geri alır; politika hatası için revizyon yeterlidir.',
            'Bakım gecesi bir şey ters giderse hangi katmana döneceğinizi önceden bilmek dakikalar kazandırır. Saklama politikası olmadan zamanlanmış snapshot\'lar diski doldurur.',
            'set snapshot-scheduled settings snapshot-name-prefix Weekly description "Haftalik bakim" target lvm\nset snapshot-scheduled recurrence weekly days 6 time 02:00\nset snapshot-scheduled retention-policy max-snapshots-to-keep 4\nset snapshot-scheduled retention-policy min-snapshots-to-keep 2\n'
            + 'set snapshot-scheduled retention-policy keep-disk-space-above-in-GB &lt;hesap&gt;\nset snapshot-scheduled activation enabled\nsave config\n# expert: mgmt_cli publish → show-last-published-session → install-policy',
            ['Görevi değiştirip <code>activation enabled</code>\'ı yeniden çalıştırmamak: değişiklik zamanlayıcıya uygulanmaz.', 'keep-disk-space değerini doğrudan "istenen boş alan" sanmak: değer = snapshot\'lar için kullanılabilir alan − korunacak boş alan.',
                'Politika hatasını düzeltmek için snapshot\'a dönmek: tüm kutu geri gider; Installation History yeterlidir.', 'Zamanlanmış görev başarısız olursa bildirim gelmez: /var/log/messages kontrol edilir.']),
        goals: ['Mevcut zamanlanmış snapshot görevini görmek', 'Boş disk alanını hesaplamak (vgdisplay, lvs)', 'Haftalık snapshot görevi ve saklama politikası', 'Görevi etkinleştirip kaydetmek', 'Değişiklik öncesi elle snapshot', 'publish = revizyon; son yayını görmek ve kurmak', 'Politikayı önceki sürüme döndürmek'],
        tasks: [
            { t: 'Tanımlı bir zamanlanmış snapshot görevi var mı, bakın.', why: 'R81.20 yalnız bir zamanlanmış snapshot görevine izin verir; yenisini tanımlamadan önce mevcut olanı görün.',
              hints: ['show snapshot-…', '<code>show snapshot-scheduled</code>'], steps: ['show snapshot-scheduled'],
              check: s => { const a = firstIdx(s, e => e.canon && /^show snapshot-scheduled/.test(e.canon)), b = firstIdx(s, e => e.canon && /^set snapshot-scheduled settings/.test(e.canon)); return a >= 0 && (b < 0 || a < b); } },
            { t: 'Expert\'te snapshot\'lar için kullanılabilir alanı hesaplamak üzere volume group\'taki boş alanı ve <code>lv_current</code> boyutunu görün.',
              why: 'Belgedeki formül: kullanılabilir alan = (vgdisplay Free) − 1,1 × (lv_current LSize). Sınır = kullanılabilir alan − korunacak boş alan.',
              hints: ['vgdisplay | grep Free ve lvs | egrep …', '<code>vgdisplay | grep Free</code> → <code>lvs | egrep "LSize|lv_current"</code>'],
              steps: EX(['vgdisplay | grep Free', 'lvs | egrep "LSize|lv_current"', 'exit']),
              check: s => evs(s).some(e => e.p4lvm === 'vgdisplay') && evs(s).some(e => e.p4lvm === 'lvs') },
            { t: 'Görevi tanımlayın: önek <code>Weekly</code>, açıklama <code>"Haftalik bakim"</code>, hedef yerel LVM.',
              why: 'Önek en çok 15 karakterdir; snapshot adı <code>&lt;Önek&gt;_&lt;YYYY_MM_DD__HH_mm&gt;</code> olur. Görevin ayarı sonradan değiştirilemez; yeni settings komutu görevi baştan tanımlar.',
              hints: ['set snapshot-scheduled settings snapshot-name-prefix … description "…" target lvm', '<code>set snapshot-scheduled settings snapshot-name-prefix Weekly description "Haftalik bakim" target lvm</code>'],
              steps: ['set snapshot-scheduled settings snapshot-name-prefix Weekly description "Haftalik bakim" target lvm'],
              check: s => { const x = P(s.model).snap; return !!x && x.px === 'Weekly' && x.target === 'lvm'; } },
            { t: 'Tekrar: her <b>cumartesi 02:00</b>.', why: 'Haftanın günleri 0 (pazar) … 6 (cumartesi) sayılarıyla verilir; saat 24 saat biçimindedir.',
              hints: ['set snapshot-scheduled recurrence weekly days … time …', '<code>set snapshot-scheduled recurrence weekly days 6 time 02:00</code>'],
              steps: ['set snapshot-scheduled recurrence weekly days 6 time 02:00'], needs: [2],
              check: s => { const x = P(s.model).snap, r = x && x.recRaw; return !!r && r.k === 'weekly' && r.d !== 'all' && r.d.join() === '6' && r.t === '02:00'; } },
            { t: 'Saklama politikası: en çok <b>4</b>, en az <b>2</b> snapshot; diskte her zaman <b>30 GB</b> boş kalacak şekilde <code>keep-disk-space-above-in-GB</code> (hesabınızı tam sayıya yuvarlayın).',
              why: 'Örnek: Free 127,81 GiB ve lv_current 40g ise kullanılabilir alan 127,81 − 44 = 83,81 GB; 30 GB korunacaksa sınır 53,81 → 54. Saklama politikası yalnız LVM hedefinde uygulanır.',
              hints: ['retention-policy max-snapshots-to-keep / min-snapshots-to-keep / keep-disk-space-above-in-GB', 'Sınır = Free − 1,1 × lv_current − 30; ör. <code>set snapshot-scheduled retention-policy keep-disk-space-above-in-GB 54</code>'],
              steps: v => ['set snapshot-scheduled retention-policy max-snapshots-to-keep 4', 'set snapshot-scheduled retention-policy min-snapshots-to-keep 2',
                  'set snapshot-scheduled retention-policy keep-disk-space-above-in-GB ' + Math.round(v.sim.p4disk.free - 1.1 * v.sim.p4disk.lv - 30)], needs: [2],
              check: s => { const x = P(s.model).snap, d = (s.variant() || {}).sim.p4disk, lim = d.free - 1.1 * d.lv - 30; return !!x && x.ret.max === 4 && x.ret.min === 2 && !!x.ret.disk && Math.abs(x.ret.disk - lim) <= 1; },
              fb: s => { const x = P(s.model).snap, d = (s.variant() || {}).sim.p4disk; return x && x.ret.disk && Math.abs(x.ret.disk - (d.free - 30)) <= 1 ? 'keep-disk-space değerinde 1,1 × lv_current payı düşülmemiş.' : null; } },
            { t: 'Görevi etkinleştirin ve yapılandırmayı görüntüleyin.', why: '<code>activation enabled</code> ilk tanımdan sonra ve görevdeki her değişiklikten sonra yeniden çalıştırılmalıdır.',
              hints: ['set snapshot-scheduled activation … → show snapshot-scheduled', '<code>set snapshot-scheduled activation enabled</code> → <code>show snapshot-scheduled</code>'],
              steps: ['set snapshot-scheduled activation enabled', 'show snapshot-scheduled'], needs: [2, 3, 4],
              check: s => { const x = P(s.model).snap; const a = lastIdx(s, e => e.canon === 'set snapshot-scheduled activation enabled'), b = lastIdx(s, e => e.canon && /^show snapshot-scheduled/.test(e.canon));
                  return !!x && x.act === 'enabled' && !x.stale && !!x.recRaw && x.ret.max === 4 && a >= 0 && b > a; },
              fb: s => { const x = P(s.model).snap; return x && x.act === 'enabled' && x.stale ? 'Etkinleştirmeden sonra görev değişti: activation enabled\'ı yeniden çalıştırın.' : null; } },
            { t: 'Kalıcı kaydedin.', why: 'Zamanlanmış snapshot görevi Gaia yapılandırmasıdır.',
              hints: ['save …', '<code>save config</code>'], steps: ['save config'], needs: [2, 3, 4, 5],
              check: s => { const x = P(s.savedModel).snap; return !!x && x.act === 'enabled' && !x.stale && JSON.stringify(P(s.model).snap) === JSON.stringify(x); } },
            { t: 'Bakım gecesi: değişiklikten hemen önce elle bir snapshot alın (<code>pre-web-rule</code>, açıklama <code>"WEB kurali oncesi"</code>).',
              why: 'Zamanlanmış görev pencereden önce çalışır; riskli bir değişiklikten hemen önce elle alınan snapshot en taze dönüş noktasıdır.',
              hints: ['add snapshot … desc "…"', '<code>add snapshot pre-web-rule desc "WEB kurali oncesi"</code>'], steps: ['add snapshot pre-web-rule desc "WEB kurali oncesi"'],
              check: s => s.snaps().some(x => x.n === 'pre-web-rule') },
            { t: 'Expert\'te yönetim oturumu açın; <code>WEB-SRV</code> nesnesini ve 2. sıraya <code>LAN-to-WEB</code> (LAN-NET → WEB-SRV, https, Accept, Log) kuralını ekleyip yayınlayın.',
              why: 'Oturumda yapılan değişiklikler yalnız <code>publish</code> ile veritabanına yazılır; her publish yeni bir revizyondur.',
              hints: ['mgmt_cli login -r true > id.txt → add host … -s id.txt → add access-rule … -s id.txt → publish -s id.txt',
                  '<code>mgmt_cli add host name WEB-SRV ip-address 172.24.50.10 -s id.txt</code> · <code>mgmt_cli add access-rule layer Network position 2 name LAN-to-WEB source LAN-NET destination WEB-SRV service https action Accept track.type Log -s id.txt</code> · <code>mgmt_cli publish -s id.txt</code>'],
              steps: EX(['mgmt_cli login -r true > id.txt', 'mgmt_cli add host name WEB-SRV ip-address 172.24.50.10 -s id.txt', 'mgmt_cli add access-rule layer Network position 2 name LAN-to-WEB source LAN-NET destination WEB-SRV service https action Accept track.type Log -s id.txt', 'mgmt_cli publish -s id.txt']),
              check: s => ST(s).revs.some(r => r.n >= 2 && r.changes.includes('add access-rule LAN-to-WEB')) && !!s.mgmt().pub().objects['WEB-SRV'] },
            { t: 'Son yayınlanan oturumu (revizyonu) görüntüleyin.', why: 'Yayının kimde, ne zaman ve kaç değişiklikle yapıldığını gösterir; SmartConsole\'daki revizyon listesinin API karşılığıdır.',
              hints: ['mgmt_cli show-last-published-session …', '<code>mgmt_cli show-last-published-session -r true</code>'], steps: EX(['mgmt_cli show-last-published-session -r true']), needs: [8],
              check: s => { const a = lastIdx(s, e => e.mgmt === 'publish'), b = lastIdx(s, e => e.mgmt === 'show-last-published-session'); return a >= 0 && b > a; } },
            { t: 'Politikayı gateway\'e kurun.', why: 'Yayınlanan revizyon gateway\'e ancak install-policy ile gider.',
              hints: ['mgmt_cli install-policy …', '<code>mgmt_cli install-policy policy-package standard targets.1 gw-a -r true</code>'], steps: EX(['mgmt_cli install-policy policy-package standard targets.1 gw-a -r true']), needs: [8],
              check: s => { const i = s.mgmt().installed(); return !!i && i.rules.some(r => r.name === 'LAN-to-WEB'); } },
            { t: 'Soru: kurulumdan sonra bir uygulama bozuldu ve sebebi yeni kural. En doğru geri dönüş hangisi?', ask: { choices: [
                ['hist', 'SmartConsole → Security Policies → Installation History: gateway ve tarih seçilip "Install specific version" ile önceki revizyon kurulur'],
                ['snap', 'Bakım öncesi alınan Gaia snapshot\'ına dönülür'],
                ['reboot', 'Gateway yeniden başlatılır; eski politika yüklenir'],
                ['nothing', 'publish geri alınamaz; kural elle silinip yeniden kurulmalıdır']], correct: 'hist' },
              why: 'Installation History her kurulumun revizyonlarını ve değişiklikleri gösterir; belirli bir sürüm yeniden kurulabilir. Snapshot tüm kutuyu (işletim sistemi dahil) geri alır; politika hatası için gereğinden ağırdır. Yeniden başlatma kurulu politikayı değiştirmez.',
              hints: ['Hata politikada mı, işletim sisteminde mi?', 'SmartConsole Help: Policy Installation History.'] },
        ],
        verify: ['show snapshot-scheduled', 'show snapshots', 'mgmt_cli show-last-published-session -r true'],
        learn: ['R81.20: tek zamanlanmış snapshot görevi; ayar değişmez, settings ile baştan tanımlanır.', 'Her değişiklikten sonra activation enabled yeniden çalıştırılır.', 'keep-disk-space = (vgdisplay Free − 1,1 × lv_current) − korunacak boş alan.',
            'Saklama politikası yalnız LVM hedefinde; başarısız görev bildirim vermez (/var/log/messages).', 'publish = yeni revizyon; install-policy ile gateway\'e gider.', 'Politika hatasında Installation History → Install specific version; snapshot tüm kutuyu geri alır.',
            'Kaynak: R81.20 Gaia Administration Guide s. 606–621 (zamanlanmış snapshot sözdizimi, parametreler, show snapshot-scheduled örnekleri, disk hesabı s. 610–611); R81.20 SmartConsole Help s. 267 (Installation History); check_point.gaia cp_gaia_scheduled_snapshot; check_point.mgmt cp_mgmt_show_last_published_session. vgdisplay/lvs\'in belgede olmayan satırları ve show-last-published-session çıktısı temsilidir. Plandaki "add snapshot-scheduler" yerine belgedeki "set snapshot-scheduled" kullanıldı.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/127' }, cert: 'CCSA R81.20'
    },
    // ═══ cp-35: log sorgulama ═══
    {
        id: 'cp-35', vendor: 'checkpoint', level: 2, title: '"Saldırı var mı?": log sorgulama', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-10'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, mgmt: {}, mgmtStart: MG_BASE.concat([OUT_RULE]),
        sim: Object.assign({}, SIMBASE, { p4log: LOG('scan') }),
        variants: [
            { key: 'scan', ip: ATK.scan, sim: { p4log: LOG('scan') } },
            { key: 'sweep', ip: ATK.sweep, sim: { p4log: LOG('sweep') } },
            { key: 'brute', ip: ATK.brute, sim: { p4log: LOG('brute') } },
        ],
        story: 'İzleme ekranı sabah 10:07 civarında WAN arayüzünde ani bir "drop" artışı gösterdi. Yönetici soruyor: "Saldırı var mı, kim, ne deniyor ve içeri giren oldu mu?" Kurulum tek kutuda (standalone): gateway logları ve <code>mgmt_cli</code> aynı kutuda. Expert parolası: <code>' + PW + '</code>. '
            + '<small>Her denemede farklı bir saldırı örüntüsü çıkar; "Yeni tur" ile tekrar oynayın.</small>',
        lesson: L('<code>fw log</code> güvenlik log dosyasını ($FWDIR/log/fw.log) okur: <code>-l</code> her kayıtta tarih ve saat, <code>-c &lt;eylem&gt;</code> yalnız o eylem (accept, drop, reject …), <code>-b "başlangıç" "bitiş"</code> zaman aralığı, <code>-s</code>/<code>-e</code> başlangıç/bitiş. '
            + 'Yönetim API\'sinde <code>show-logs</code> aynı logları sorgu diliyle arar: <code>new-query.filter "src:… AND action:Drop"</code>, <code>new-query.time-frame today</code>, <code>new-query.top.field sources</code> ile en çok kayıt üreten kaynaklar.',
            'Drop sayısındaki bir artış tek başına zarar demek değildir; önemli olan kimin, neyi, hangi örüntüyle denediği ve aynı kaynaktan kabul edilmiş (accept) bir bağlantı olup olmadığıdır.',
            'fw log -l -c drop\nfw log -l -c drop -b "10:05:00" "10:10:00"\nmgmt_cli show-logs new-query.time-frame today new-query.filter "action:Drop" new-query.top.field sources -r true\nmgmt_cli show-logs new-query.filter "src:&lt;IP&gt; AND action:Drop" -r true\nfw log -l -c accept | grep &lt;IP&gt;',
            ['En çok kayıt üreten kaynağı saldırgan sanmak: eylem filtresi olmadan olağan kullanıcı trafiği üstte çıkar.', 'Yalnız drop\'lara bakıp accept\'leri kontrol etmemek.', '-b ile -s/-e\'yi birlikte kullanmak (belge izin vermez).', 'Saatleri tırnaksız yazmak: tarih ve saat tek bağımsız değişken olmalı.']),
        goals: ['fw log ile drop kayıtlarını okumak', 'Zaman aralığıyla daraltmak', 'show-logs ile en çok drop üreten kaynak', 'Kaynağa göre filtre', 'Saldırı örüntüsünü tanımak', 'Kabul edilen bağlantı var mı kontrol etmek'],
        tasks: [
            { t: 'Expert\'te yalnız <b>drop</b> kayıtlarını tarih ve saatleriyle listeleyin.', why: '<code>-l</code> her kayıtta tarih ve saati gösterir; <code>-c drop</code> eylemi süzer. Satırda sırasıyla tarih, saat, eylem, gateway, yön (&gt; gelen) ve arayüz vardır.',
              hints: ['fw log -l -c …', '<code>fw log -l -c drop</code>'], steps: EX(['fw log -l -c drop']),
              check: s => evs(s).some(e => e.p4log && e.p4log.c === 'drop' && e.p4log.l && e.p4log.s === null) },
            { t: 'Artışın olduğu <b>10:05–10:10</b> aralığındaki drop\'ları gösterin.', why: '<code>-b "başlangıç" "bitiş"</code> aralığı süzer; tarih verilmezse bugün sayılır. Tarih ve saat tırnak içinde tek değer olarak yazılır.',
              hints: ['fw log -l -c drop -b "…" "…"', '<code>fw log -l -c drop -b "10:05:00" "10:10:00"</code>'], steps: EX(['fw log -l -c drop -b "10:05:00" "10:10:00"']),
              check: s => evs(s).some(e => e.p4log && e.p4log.c === 'drop' && e.p4log.s !== null && e.p4log.e !== null && e.p4log.s <= tsec('10:07:00') && e.p4log.e >= tsec('10:08:00') && e.p4log.e - e.p4log.s <= 1800) },
            { t: 'Yönetim API\'siyle bugünün drop kayıtlarında en çok kayıt üreten kaynakları bulun.', why: '<code>new-query.top.field sources</code> kaynakları kayıt sayısına göre sıralar. Eylem filtresi olmadan olağan LAN trafiği üstte çıkar.',
              hints: ['mgmt_cli show-logs new-query.filter "action:Drop" new-query.top.field sources …', '<code>mgmt_cli show-logs new-query.time-frame today new-query.filter "action:Drop" new-query.top.field sources new-query.top.count 5 -r true</code>'],
              steps: EX(['mgmt_cli show-logs new-query.time-frame today new-query.filter "action:Drop" new-query.top.field sources new-query.top.count 5 -r true']),
              check: s => evs(s).some(e => e.p4q && e.p4q.top === 'sources' && /action:drop/i.test(e.p4q.filter)),
              fb: s => (evs(s).some(e => e.p4q && e.p4q.top === 'sources' && !/action:drop/i.test(e.p4q.filter)) ? 'Filtresiz top listesinde en üstte olağan LAN trafiği var: action:Drop ile süzün.' : null) },
            { t: 'En çok drop üreten kaynağın kayıtlarını <code>show-logs</code> ile listeleyin (kaynak ve eylem filtresi).', why: 'Filtre alanları <code>AND</code> ile birleşir: <code>src:&lt;IP&gt; AND action:Drop</code>. Hedef adreslerine ve servislere bakın.',
              hints: ['new-query.filter "src:… AND action:Drop"', '<code>mgmt_cli show-logs new-query.time-frame today new-query.filter "src:&lt;IP&gt; AND action:Drop" new-query.max-logs-per-request 30 -r true</code>'],
              steps: v => EX(['mgmt_cli show-logs new-query.time-frame today new-query.filter "src:' + v.ip + ' AND action:Drop" new-query.max-logs-per-request 30 -r true']),
              check: s => { const ip = (s.variant() || {}).ip; return evs(s).some(e => e.p4q && !e.p4q.top && e.p4q.filter.includes('src:' + ip) && e.p4q.n > 0); } },
            { t: 'Soru: saldırı hangi adresten geliyor?', ask: { choices: [['scan', ATK.scan], ['sweep', ATK.sweep], ['brute', ATK.brute], ['lan', '10.64.10.50'], ['noise', '192.0.2.200']], correct: v => v.key },
              why: 'Drop kayıtlarında 10:07 civarında tek bir dış kaynak onlarca kayıt üretiyor. 10.64.10.50 yalnız çok trafik üreten bir LAN kullanıcısı; 192.0.2.200 dağınık internet gürültüsü.',
              hints: ['Top listesini action:Drop filtresiyle okuyun.', 'LAN adresleri (10.64.10.x) accept trafiği üretiyor.'] },
            { t: 'Soru: saldırganın örüntüsü ne?', ask: { choices: [
                ['port', 'Tek hedefte çok sayıda farklı port: port taraması'],
                ['host', 'Çok sayıda hedefte aynı port (445): ağ taraması'],
                ['brute', 'Aynı hedefe aynı porta (22) art arda deneme: SSH parola denemesi'],
                ['normal', 'Olağan trafik']], correct: v => ({ scan: 'port', sweep: 'host', brute: 'brute' })[v.key] },
              why: 'dst ve svc alanlarına bakın: hedef sabit ve port değişiyorsa port taraması; port sabit ve hedef değişiyorsa ağ taraması; ikisi de sabit ve deneme sayısı yüksekse parola denemesi.',
              hints: ['Kayıtlarda hangi alan değişiyor: dst mi, svc mi?', 'fw log -l -c drop | grep &lt;IP&gt;'] },
            { t: 'Aynı kaynaktan <b>kabul edilmiş</b> (accept) bir bağlantı var mı? <code>fw log</code> ve <code>grep</code> ile bakın.', why: 'Drop edilen deneme içeri girmemiştir; asıl risk aynı kaynaktan accept edilmiş bir bağlantıdır. Boş çıktı "kayıt yok" demektir.',
              hints: ['fw log -l -c accept | grep …', '<code>fw log -l -c accept | grep &lt;IP&gt;</code>'], steps: v => EX(['fw log -l -c accept | grep ' + v.ip]),
              check: s => { const ip = (s.variant() || {}).ip; return evs(s).some(e => e.p4log && e.p4log.c === 'accept' && e.canon && e.canon.includes('grep') && e.canon.includes(ip)); } },
            { t: 'Soru: sonuç ne?', ask: { choices: [
                ['blocked', 'Saldırı denemesi var ama tüm bağlantılar Cleanup kuralında düşürülmüş; kaynaktan kabul edilen bağlantı yok'],
                ['breach', 'Saldırgan içeri girmiş; kabul edilmiş bağlantılar var'],
                ['none', 'Saldırı yok; drop\'lar olağan gürültü']], correct: 'blocked' },
              why: 'Drop kayıtları politikanın denemeyi durdurduğunu gösterir; accept sorgusu boş döndü. Sonraki adım olayı kaydetmek, kaynağı izlemek ve gerekirse Threat Prevention (IPS) korumalarını gözden geçirmektir.',
              hints: ['Accept sorgusu ne döndürdü?', 'rule_name alanı: Cleanup rule.'] },
        ],
        verify: ['fw log -l -c drop', 'mgmt_cli show-logs new-query.time-frame today new-query.filter "action:Drop" new-query.top.field sources -r true'],
        learn: ['fw log -l: tarih+saat; -c: eylem; -b "…" "…": aralık (-s/-e ile birlikte kullanılmaz).', 'show-logs: new-query.filter (AND), time-frame, top.field sources, max-logs-per-request.', 'Top listesine eylem filtresi olmadan bakmak yanıltır.',
            'Örüntü: sabit hedef + değişen port = port taraması; değişen hedef + sabit port = ağ taraması; sabit hedef ve port = parola denemesi.', 'Drop\'tan sonra accept kontrolü yapılır.',
            'Kaynak: R81.20 CLI Reference Guide s. 1123–1132 (fw log sözdizimi, alanlar, -l ve -c örnekleri); check_point.mgmt cp_mgmt_show_logs (new_query alanları ve seçenekleri). show-logs yanıt biçimi ve log verisi temsilidir.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/128' }, cert: 'CCSA R81.20'
    },
    // ═══ cp-36: Log Exporter ═══
    {
        id: 'cp-36', vendor: 'checkpoint', level: 2, title: 'SIEM\'e log: Log Exporter', minutes: 20, kind: 'firewall', hostname: 'gw-a', pre: ['cp-35'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, sim: SIMBASE, mgmt: {}, mgmtStart: MG_BASE,
        variants: [
            { key: 'proto', sim: { p4lx: [{ name: 'siem1', cfg: Object.assign({}, LX_BASE, { protocol: 'udp' }) }] } },
            { key: 'port', sim: { p4lx: [{ name: 'siem1', cfg: Object.assign({}, LX_BASE, { 'target-port': '5514' }) }] } },
            { key: 'off', sim: { p4lx: [{ name: 'siem1', cfg: Object.assign({}, LX_BASE, { enabled: 'false' }), run: false }] } },
        ],
        story: 'SOC ekibi: "SIEM\'e sizin kutudan log gelmiyor." SIEM <code>10.240.0.50</code> adresinde yalnız <b>TCP 514</b> dinliyor ve logları <b>CEF</b> biçiminde istiyor. Log Exporter daha önce <code>siem1</code> adıyla kurulmuş. '
            + 'Ayrıca yedek SIEM (<code>10.240.0.60</code>, UDP 514, syslog) için ikinci bir hedef isteniyor. Log sunucusu bu kutu (standalone). Expert parolası: <code>' + PW + '</code>. '
            + '<small>Her denemede farklı bir arıza çıkar; "Yeni tur" ile tekrar oynayın.</small>',
        lesson: L('<b>Log Exporter</b> (<code>cp_log_export</code>) Check Point loglarını syslog üzerinden SIEM\'e gönderir; yalnız expert\'te çalışır. Her hedef bir addır: <code>add name … target-server … target-port … protocol {udp|tcp}</code>; isteğe bağlı <code>format</code> (syslog varsayılan; cef, leef, json, splunk …). '
            + '<code>add</code>/<code>set</code>/<code>delete</code> yapılandırmayı <code>$EXPORTERDIR/targets/&lt;ad&gt;/</code> altına yazar; değişikliğin hemen uygulanması için <code>--apply-now</code> verilir ya da hedef <code>restart</code> edilir. <code>status</code> süreç durumunu, <code>show</code> yapılandırmayı gösterir.',
            'SIEM\'e ulaşmayan log, olay anında görünmeyen log demektir. Protokol, port ya da biçim uyumsuzluğu hata vermeden sessizce log kaybettirir.',
            'cp_log_export status\ncp_log_export show name siem1\ncp_log_export set name siem1 protocol tcp --apply-now\ncp_log_export set name siem1 format cef --apply-now\ncp_log_export add name siem-backup target-server 10.240.0.60 target-port 514 protocol udp --apply-now',
            ['SIEM TCP dinlerken udp göndermek (ya da tersi).', 'set sonrası --apply-now ya da restart unutmak: yapılandırma değişir, süreç eski ayarla çalışır.', 'enabled false olan hedefi start ile açmaya çalışmak.', 'Biçimi (CEF/LEEF/syslog) SIEM\'in beklediğiyle eşleştirmemek.']),
        goals: ['Log Exporter durumunu okumak', 'Yapılandırmayı SIEM beklentisiyle karşılaştırmak', 'Arızayı --apply-now ile düzeltmek', 'Biçimi CEF yapmak', 'İkinci hedef eklemek', '--apply-now ve yapılandırma dizini'],
        tasks: [
            { t: 'Expert\'te Log Exporter hedeflerinin durumunu görün.', why: '<code>status</code> her hedef için sürecin çalışıp çalışmadığını gösterir.',
              hints: ['cp_log_export …', '<code>cp_log_export status</code>'], steps: EX(['cp_log_export status']),
              check: s => { const a = firstIdx(s, e => e.p4lx && e.p4lx.op === 'status'), b = firstIdx(s, e => e.p4lx && ['set', 'add', 'delete', 'restart', 'start', 'stop'].includes(e.p4lx.op)); return a >= 0 && (b < 0 || a < b); } },
            { t: '<code>siem1</code> hedefinin yapılandırmasını görüntüleyin.', why: 'Hedef adresi, port, protokol, biçim ve enabled değerini SIEM\'in beklentisiyle karşılaştırın.',
              hints: ['cp_log_export show name …', '<code>cp_log_export show name siem1</code>'], steps: EX(['cp_log_export show name siem1']),
              check: s => evs(s).some(e => e.p4lx && e.p4lx.op === 'show' && e.p4lx.name === 'siem1') },
            { t: 'Soru: SIEM\'e neden log gitmiyor?', ask: { choices: [
                ['proto', 'Protokol udp; SIEM yalnız TCP dinliyor'],
                ['port', 'Hedef port 5514; SIEM 514\'te dinliyor'],
                ['off', 'Hedef devre dışı (enabled false) ve süreç durmuş'],
                ['format', 'Biçim syslog olduğu için SIEM bağlantıyı reddediyor']], correct: v => v.key },
              why: 'Biçim uyumsuzluğu logların yanlış ayrıştırılmasına yol açar ama bağlantıyı kesmez. Log hiç gelmiyorsa adres, port, protokol ya da sürecin durumu yanlıştır.',
              hints: ['status: Running mi?', 'show: protocol ve target-port SIEM\'in beklediğiyle aynı mı?'] },
            { t: 'Arızayı düzeltin ve değişikliği hemen uygulayın.', why: '<code>--apply-now</code> add/set/delete değişikliğini hemen uygular; vermezseniz <code>cp_log_export restart name siem1</code> gerekir.',
              hints: ['cp_log_export set name siem1 … --apply-now', '<code>cp_log_export set name siem1 protocol tcp --apply-now</code> (ya da target-port 514 / enabled true)'],
              steps: v => EX([LX_FIX[v.key]]),
              check: s => lxOk(s),
              fb: s => { const X = ST(s).lx.siem1; return X && JSON.stringify(X.cfg) !== JSON.stringify(X.app) ? 'Yapılandırma değişti ama uygulanmadı: --apply-now ya da cp_log_export restart name siem1.' : null; } },
            { t: 'SIEM logları CEF biçiminde istiyor: <code>siem1</code>\'in biçimini değiştirip hemen uygulayın.', why: 'Biçim SIEM\'in ayrıştırıcısıyla eşleşmelidir; format değerleri: syslog (varsayılan), cef, leef, json, generic, logrhythm, rsa, splunk.',
              hints: ['cp_log_export set name siem1 format …', '<code>cp_log_export set name siem1 format cef --apply-now</code>'], steps: EX(['cp_log_export set name siem1 format cef --apply-now']),
              check: s => { const X = ST(s).lx.siem1; return !!X && X.cfg.format === 'cef' && !!X.app && X.app.format === 'cef'; } },
            { t: 'Son durumu doğrulayın: <code>siem1</code> çalışıyor olmalı.', why: 'Değişiklikten sonra status ile sürecin yeni ayarla çalıştığını görün.',
              hints: ['cp_log_export status name …', '<code>cp_log_export status name siem1</code>'], steps: EX(['cp_log_export status name siem1']), needs: [3, 4],
              check: s => { const a = lastIdx(s, e => e.p4lx && e.p4lx.name === 'siem1' && ['set', 'restart', 'start'].includes(e.p4lx.op)), b = lastIdx(s, e => e.p4lx && e.p4lx.op === 'status'); return lxOk(s) && ST(s).lx.siem1.cfg.format === 'cef' && a >= 0 && b > a; } },
            { t: 'Yedek SIEM için <code>siem-backup</code> hedefini ekleyin: <code>10.240.0.60</code>, UDP 514, syslog; hemen uygulayın.', why: 'Zorunlu bağımsız değişkenler: name, target-server, target-port, protocol. Biçim verilmezse syslog\'dur.',
              hints: ['cp_log_export add name siem-backup target-server … target-port 514 protocol udp --apply-now', '<code>cp_log_export add name siem-backup target-server 10.240.0.60 target-port 514 protocol udp --apply-now</code>'],
              steps: EX(['cp_log_export add name siem-backup target-server 10.240.0.60 target-port 514 protocol udp --apply-now']),
              check: s => { const X = ST(s).lx['siem-backup']; return !!X && X.run && X.cfg['target-server'] === '10.240.0.60' && X.cfg['target-port'] === '514' && X.cfg.protocol === 'udp' && X.cfg.format === 'syslog'; } },
            { t: 'Soru: <code>--apply-now</code> olmadan <code>cp_log_export set</code> çalıştırırsanız ne olur?', ask: { choices: [
                ['pending', 'Yapılandırma ($EXPORTERDIR/targets/<ad>/) güncellenir ama süreç restart edilene kadar eski ayarla çalışır'],
                ['lost', 'Değişiklik kaybolur; komut hiçbir şey yazmaz'],
                ['reboot', 'Değişiklik yalnız gateway yeniden başlatılınca uygulanır'],
                ['same', 'Fark yoktur; set her zaman hemen uygulanır']], correct: 'pending' },
              why: 'CLI Reference: --apply-now, add/set/delete/reexport değişikliğini hemen uygular. Aksi hâlde hedef restart edilmelidir.',
              hints: ['Yapılandırma dosyası ile çalışan süreç ayrı şeylerdir.', 'cp_log_export restart name …'] },
        ],
        verify: ['cp_log_export status', 'cp_log_export show name siem1'],
        learn: ['cp_log_export yalnız expert\'te; add için name, target-server, target-port, protocol zorunlu.', 'format varsayılan syslog; cef, leef, json, splunk … seçilebilir.', '--apply-now ya da restart olmadan değişiklik sürece uygulanmaz.',
            'status = süreç, show = yapılandırma; hedef dizini $EXPORTERDIR/targets/<ad>/.', 'Log gelmiyorsa adres, port, protokol ve enabled/süreç durumu karşılaştırılır.',
            'Kaynak: R81.20 CLI Reference Guide s. 80–100 (cp_log_export komutları ve bağımsız değişkenleri, format ve protocol değerleri, ad kuralları); sk122323 (belgede atıf). status/show çıktı biçimi temsilidir.'],
        links: { cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/129' }, cert: 'CCSA R81.20'
    },
    ];
    // Çoktan seçmeli (ask) görevler ve adımlardan türetilen örnek çözüm (checkpoint-yol.js ile aynı kural)
    LABS.forEach(l => l.tasks.forEach((t, i) => {
        if (!t.ask) return;
        const key = l.id + ':' + i, want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
        t.check = s => !!s.answers && s.answers[key] === want(s.variant && s.variant());
        t.steps = t.steps || (v => [{ answer: i, v: want(v) }]);
    }));
    const dedupExpert = L => { const out = []; let ex = false; for (let i = 0; i < L.length; i++) { const x = L[i]; if (x === 'expert' && ex) { i++; continue; } if (x === 'expert') ex = true; else if (x === 'exit' && ex) ex = false; out.push(x); } return out; };
    LABS.forEach(l => {
        l.solution = v => dedupExpert([].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps)));
    });
    const OWN = new Set(LABS.map(l => l.id));
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
