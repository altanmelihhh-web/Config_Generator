'use strict';
// ─── CLI Lab: Check Point parti 3 (cp-24…cp-27): politika düzeni ve NAT, mgmt_cli ile ─────────
// Motor eklentisi: assets/js/lab/gaia-p3.js (service-group, where-used, access-section, time, nat-rule).
// Standalone lab kutusu (yönetim + gateway aynı cihazda), expert moddan mgmt_cli. Adresler yalnız güvenli örnek bloklardan.
// Kaynak: Management API Reference örnekleri; check_point.mgmt Ansible modülleri; R81.20 Quantum Security Gateway
// Admin Guide s. 186 (manuel Static NAT, local.arp); R81.20 SmartConsole Help s. 49 (Where Used), 60–61 ve 594 (Time).
(function () {
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const BASE = ['set interface eth1 ipv4-address 203.0.113.2 mask-length 24', 'set interface eth1 state on', 'set interface eth1 comments WAN',
        'set interface eth2 ipv4-address 10.64.10.1 mask-length 24', 'set interface eth2 state on', 'set interface eth2 comments LAN',
        'set interface eth3 ipv4-address 172.24.50.1 mask-length 24', 'set interface eth3 state on', 'set interface eth3 comments DMZ',
        'set static-route default nexthop gateway address 203.0.113.1 on'];
    const SIMBASE = { policy: { name: 'LAB-Policy' }, cpu: { user: 4, sys: 3, idle: 93, cpus: 4 } };
    const PW = 'Expert-Lab1';
    const EX = cmds => ['expert', PW].concat(cmds);
    const lastIdx = (A, f) => { for (let i = A.length - 1; i >= 0; i--) if (f(A[i])) return i; return -1; };
    const MG_BASE = ['add network name LAN-NET subnet 10.64.10.0 mask-length 24', 'add network name MGMT-NET subnet 10.240.0.0 mask-length 16',
        'add access-rule layer Network position 1 name Mgmt-Access source MGMT-NET destination Any service.1 ssh service.2 https action Accept track.type Log'];
    const WEB_HOST = 'add host name WEB-SRV ip-address 172.24.50.10';
    const INSTALL = 'mgmt_cli install-policy policy-package standard targets.1 gw-a -r true';
    const INSTALL_S = ['mgmt_cli publish -s id.txt', INSTALL];
    const LOGIN = 'mgmt_cli login -r true > id.txt';
    const cur = s => { const m = s.mgmt(), x = m.sess(); return x ? x.db : m.pub(); };
    const p3 = db => db.p3 || { sec: [], nat: [] };
    const ridx = (db, n) => db.rules.findIndex(r => r.name === n);
    const afterInstall = (s, f) => { const A = s.ev.list(), i = lastIdx(A, e => e.mgmt === 'install'), j = lastIdx(A, f); return i >= 0 && j > i; };
    const hit = (s, f) => { const d = s.decide(f); const r = (s.mgmt().rules() || []).find(x => x.n === d.rule); return { d, name: r ? r.name : null }; };
    const clean = s => !s.mgmt().sess() || !s.mgmt().sess().dirty;

    // ── cp-24
    const WEB_RULE3 = 'add access-rule layer Network position 2 name LAN-to-WEB source LAN-NET destination WEB-SRV service.1 https service.2 http service.3 WEB-8443 action Accept track.type Log';
    const svcSet = (x, want) => !!x && x.type === 'service-group' && x.members.length === want.length && want.every(m => x.members.includes(m));
    const webSvcOk = db => { const r = db.rules[ridx(db, 'LAN-to-WEB')]; return !!r && r.svc.join() === 'WEB-SVCS' && svcSet(db.objects['WEB-SVCS'], ['https', 'http', 'WEB-8443']) && r.action === 'Accept' && r.enabled; };
    const oldGone = db => !db.objects['OLD-APP'] && !!db.objects['WEB-8443'] && ridx(db, 'LAN-to-WEB') >= 0 && ridx(db, 'Legacy-APP') < 0;
    // ── cp-25
    const DMZ_NET = 'add network name DMZ-NET subnet 172.24.50.0 mask-length 24';
    const SECS = ['add access-section layer Network position 1 name Management', 'add access-section layer Network position 2 name General',
        'add access-section layer Network position 3 name Servers', 'add access-section layer Network position 4 name Cleanup'];
    const WEBF = { src: '10.64.10.50', dst: '172.24.50.10', dport: 443, in: 'eth2' }, SSHF = { src: '10.64.10.50', dst: '172.24.50.10', dport: 22, in: 'eth2' };
    const secOk = (db, v) => { const S = p3(db).sec.map(x => x.name), e = S.indexOf('Exceptions'), g = S.indexOf('General');
        return e >= 0 && e < g && window_secOf(db, v.target) === 'Exceptions' && ridx(db, v.target) < ridx(db, v.shadow); };
    const window_secOf = (db, n) => { const G = typeof window !== 'undefined' ? window : globalThis; return G.CgGaiaP3 ? G.CgGaiaP3.secOf(db, n) : null; };
    // ── cp-26
    const PF = { src: '10.64.10.50', dst: '198.51.100.25', dport: 443, in: 'eth2' };
    const natHideOk = db => p3(db).nat.some(r => r.enabled && r.method === 'hide' && r.osrc === 'LAN-NET' && r.odst === 'PARTNER-SRV' && r.tsrc === 'NAT-PARTNER' && r.tdst === 'Original');
    const timeOk = db => { const t = db.objects.Mesai; return !!t && t.type === 'time' && t.hours.length === 1 && t.hours[0].from === '08:00' && t.hours[0].to === '18:00' && t.hours[0].en
        && t.days.length === 5 && ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].every(d => t.days.includes(d)); };
    const pRuleOk = db => { const i = ridx(db, 'Partner-Mesai'), r = db.rules[i]; return !!r && i < ridx(db, 'Cleanup rule') && r.enabled && r.action === 'Accept' && r.src.join() === 'LAN-NET' && r.dst.join() === 'PARTNER-SRV' && r.svc.join() === 'https' && (r.time || []).join() === 'Mesai'; };
    const TIME_CMD = 'mgmt_cli add time name Mesai hours-ranges.1.from 08:00 hours-ranges.1.to 18:00 hours-ranges.1.enabled true recurrence.pattern Weekly recurrence.weekdays.1 Mon recurrence.weekdays.2 Tue recurrence.weekdays.3 Wed recurrence.weekdays.4 Thu recurrence.weekdays.5 Fri -s id.txt';
    // ── cp-27
    const INF = { src: '198.51.100.77', dst: '203.0.113.20', dport: 443 };
    const WEB_NAT = 'add nat-rule package standard position top name Web-Static original-destination WEB-PUB translated-destination WEB-SRV method static';
    const P3IN = { inflows: [INF], servers: ['172.24.50.10'] };
    const inOk = s => { const d = s.mgmt().p3.inDecide(INF); return d.stage === 'fwd' && d.nat && d.tdst === '172.24.50.10' && d.reply === 'ok'; };

    const LABS = [
    // ═══ cp-24: servis grubu ve where-used ═══
    {
        id: 'cp-24', vendor: 'checkpoint', level: 3, title: 'Nesne düzeni: servis grubu, where-used ile güvenli silme', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-13'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, mgmt: {}, sim: Object.assign({ p3: {} }, SIMBASE),
        mgmtStart: MG_BASE.concat([WEB_HOST, 'add service-tcp name WEB-8443 port 8443', 'add service-tcp name OLD-APP port 8081', WEB_RULE3]),
        variants: [
            { key: 'rule', mgmtStart: ['add access-rule layer Network position 3 name Legacy-APP source LAN-NET destination WEB-SRV service OLD-APP action Accept track.type Log enabled false'],
              fix: ['mgmt_cli delete access-rule layer Network name Legacy-APP -s id.txt', 'mgmt_cli delete service-tcp name OLD-APP -s id.txt'] },
            { key: 'group', sim: { p3: { start: ['add service-group name APP-OLD members.1 OLD-APP members.2 WEB-8443'] } },
              fix: ['mgmt_cli set service-group name APP-OLD members.remove OLD-APP -s id.txt', 'mgmt_cli delete service-tcp name OLD-APP -s id.txt'] },
        ],
        story: 'Politika büyüdükçe kurallar tek tek servis listeleriyle doldu. <code>LAN-to-WEB</code> kuralında üç servis var (https, http, <code>WEB-8443</code>); aynı üçlü yakında başka kurallarda da kullanılacak. Ayrıca artık kullanılmayan <code>OLD-APP</code> (tcp/8081) nesnesi temizlenmeli. İstek: servisleri bir <b>servis grubunda</b> toplayın, eski nesneyi <b>nerede kullanıldığına bakarak</b> güvenle silin. Standalone kutu, expert parolası: <code>' + PW + '</code>.',
        lesson: L('<b>Servis grubu</b> (<code>add service-group name … members.1 … members.2 …</code>) birden çok servisi tek nesnede toplar; kurala grup yazılır, servis eklemek için yalnız grup değişir (<code>set service-group … members.add …</code>). <b>Where Used</b> (<code>mgmt_cli where-used name …</code>; SmartConsole\'da nesneye sağ tık → Where Used) bir nesnenin hangi grup, erişim kuralı ya da NAT kuralında doğrudan kullanıldığını gösterir; <code>indirect true</code> grup üzerinden dolaylı kullanımları da listeler. Kullanılan nesne silinemez: önce kullanıldığı yerden çıkarılır.',
            'Kullanımı bilinmeden silinen ya da değiştirilen nesne başka bir kuralı sessizce bozar. Grup kullanmak kural tabanını okunur tutar ve değişikliği tek noktaya indirir; where-used ise temizliğin güvenli yapılmasını sağlar.',
            'mgmt_cli login -r true > id.txt\nmgmt_cli add service-group name WEB-SVCS members.1 https members.2 http members.3 WEB-8443 -s id.txt\nmgmt_cli set access-rule layer Network name LAN-to-WEB service WEB-SVCS -s id.txt\nmgmt_cli where-used name OLD-APP -s id.txt\nmgmt_cli publish -s id.txt',
            ['Nesneyi silmeye çalışıp hatayı "zorla" aşmaya uğraşmak: önce where-used.', 'Devre dışı ([x]) bir kuralın nesneyi hâlâ kullandığını unutmak: devre dışı kural da bir kullanımdır.', 'Nesneyi gruptan çıkarınca grubun kullanıldığı kuralları da etkilediğini unutmak (indirect true).', 'Grubu yayınlayıp politikayı kurmamak.']),
        goals: ['Servis grubu oluşturmak', 'Kuralda tek tek servis yerine grup kullanmak', 'where-used ile kullanım yerini bulmak', 'Nesneyi güvenle silmek, yayınlamak ve kurmak'],
        tasks: [
            { t: 'Expert moda geçin ve bir API oturumu açın (kimlik <code>id.txt</code>).', why: 'Bu lab\'daki değişiklikleri tek oturumda toplayıp birlikte yayınlayacaksınız; yarım kalan iş başkasına görünmez.',
              hints: ['expert, sonra mgmt_cli login … > id.txt', '<code>expert</code> → parola → <code>' + LOGIN + '</code>'], steps: EX([LOGIN]),
              check: s => !!s.mgmt().sess() },
            { t: '<code>WEB-SVCS</code> adlı servis grubunu oluşturun: https, http ve WEB-8443.', why: 'Üyeler <code>members.1 … members.3</code> listesiyle verilir. Yerleşik servisler (https, http) ve kendi servis nesneleriniz aynı grupta olabilir.',
              hints: ['mgmt_cli add service-group name … members.1 … -s id.txt', '<code>mgmt_cli add service-group name WEB-SVCS members.1 https members.2 http members.3 WEB-8443 -s id.txt</code>'],
              steps: EX(['mgmt_cli add service-group name WEB-SVCS members.1 https members.2 http members.3 WEB-8443 -s id.txt']), needs: [0],
              check: s => svcSet(cur(s).objects['WEB-SVCS'], ['https', 'http', 'WEB-8443']) },
            { t: '<code>LAN-to-WEB</code> kuralında üç servisi grupla değiştirin.', why: 'Tek bir <code>service</code> değeri listeyi tümüyle değiştirir. Kural artık okunur: yeni bir web portu gerektiğinde yalnız grup güncellenir.',
              hints: ['mgmt_cli set access-rule layer Network name LAN-to-WEB service … -s id.txt', '<code>mgmt_cli set access-rule layer Network name LAN-to-WEB service WEB-SVCS -s id.txt</code>'],
              steps: EX(['mgmt_cli set access-rule layer Network name LAN-to-WEB service WEB-SVCS -s id.txt']), needs: [0, 1],
              check: s => webSvcOk(cur(s)) },
            { t: 'Temizlik: <code>OLD-APP</code> nesnesinin nerede kullanıldığını bulun.', why: 'where-used doğrudan kullanımları (grup, erişim kuralı, NAT kuralı) listeler. Silmeden önce bakmak, hangi kuralın ya da grubun etkileneceğini gösterir.',
              hints: ['mgmt_cli where-used name … -s id.txt', '<code>mgmt_cli where-used name OLD-APP -s id.txt</code>'],
              steps: EX(['mgmt_cli where-used name OLD-APP -s id.txt']), needs: [0],
              check: s => s.ev.mgmt(e => e.wu && e.wu.name === 'OLD-APP') },
            { t: 'Soru: <code>OLD-APP</code> nerede kullanılıyor?', ask: { choices: [['rule', 'Devre dışı bırakılmış Legacy-APP erişim kuralında'], ['group', 'APP-OLD servis grubunun üyesi olarak'], ['nat', 'Bir NAT kuralında'], ['none', 'Hiçbir yerde; doğrudan silinebilir']], correct: v => v.key },
              why: 'Çıktıdaki access-control-rules ya da objects bölümü cevabı verir. Devre dışı kural da nesneyi kullanır: silmeden önce kural ya da üyelik kaldırılmalıdır.',
              hints: ['where-used çıktısındaki dolu bölüme bakın.', 'objects mi, access-control-rules mı?'], needs: [0, 3] },
            { t: 'Kullanımı kaldırın ve <code>OLD-APP</code>\'ı silin (oturumda).', why: 'Kullanılmayan kural silinir ya da nesne gruptan çıkarılır (<code>members.remove</code>); ardından nesne silinebilir. Başka bir kural ya da nesne etkilenmez.',
              hints: ['Kural: delete access-rule …; grup: set service-group … members.remove …; sonra delete service-tcp …', 'rule: <code>mgmt_cli delete access-rule layer Network name Legacy-APP -s id.txt</code> · group: <code>mgmt_cli set service-group name APP-OLD members.remove OLD-APP -s id.txt</code> · ikisinde de sonra <code>mgmt_cli delete service-tcp name OLD-APP -s id.txt</code>'],
              steps: v => EX(v.fix), needs: [0],
              check: s => oldGone(cur(s)) && !!s.mgmt().sess() && s.mgmt().sess().dirty },
            { t: 'Yayınlayın ve politikayı kurun.', why: 'Grup ve silme yayınlanınca veritabanına işlenir; kurulumla gateway\'e gider.',
              hints: ['mgmt_cli publish -s id.txt; mgmt_cli install-policy …', '<code>mgmt_cli publish -s id.txt</code> → <code>' + INSTALL + '</code>'],
              steps: EX(INSTALL_S), needs: [0, 1, 2, 5],
              check: s => webSvcOk(s.mgmt().installed()) && oldGone(s.mgmt().installed()) && clean(s) },
            { t: 'Doğrulayın: LAN istemcisinin (<code>10.64.10.50</code>) web sunucusuna 8443 akışı hangi kurala düşüyor?', why: 'Kurulu politikada grup açılır: 8443, WEB-SVCS üzerinden LAN-to-WEB\'e düşmeli.',
              hints: ['fw up_execute src=… dst=… ipp=6 dport=8443', '<code>fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=8443</code>'],
              steps: EX(['fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=8443']), needs: [0, 1, 2, 5, 6],
              check: s => afterInstall(s, e => e.upexec && e.upexec.dport === 8443 && e.upexec.name === 'LAN-to-WEB') && webSvcOk(s.mgmt().installed()) },
        ],
        verify: ['mgmt_cli show service-group name WEB-SVCS -r true', 'mgmt_cli where-used name WEB-8443 indirect true -r true', 'mgmt_cli show access-rulebase name Network -r true', 'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=8443'],
        learn: ['Servis grubu: kuralda tek nesne, değişiklik tek noktada.', 'where-used: grup, erişim ve NAT kurallarındaki kullanım.', 'Devre dışı kural da kullanım sayılır.', 'indirect true: grup üzerinden dolaylı kullanım.', 'Silme de yayınlanıp kurulmalı.'],
        links: { tool: '#/checkpoint/policy', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/122' }, cert: 'CCSA R81.20'
    },
    // ═══ cp-25: gölgelenen kural, bölümler ═══
    {
        id: 'cp-25', vendor: 'checkpoint', level: 3, title: 'Gölgelenen kural: sıra ve section', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-13', 'cp-15'],
        up: ['eth1', 'eth2', 'eth3'], start: BASE, mgmt: {}, sim: Object.assign({ p3: { start: SECS } }, SIMBASE),
        mgmtStart: MG_BASE.concat([DMZ_NET, WEB_HOST]),
        variants: [
            { key: 'drop', target: 'LAN-to-WEB', shadow: 'Block-DMZ', f: WEBF, up: 'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=443',
              mgmtStart: ['add access-rule layer Network position 2 name Block-DMZ source LAN-NET destination DMZ-NET action Drop track.type Log',
                'add access-rule layer Network position 3 name LAN-to-WEB source LAN-NET destination WEB-SRV service https action Accept track.type Log'] },
            { key: 'accept', target: 'Block-SSH-WEB', shadow: 'LAN-to-DMZ', f: SSHF, up: 'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=22',
              mgmtStart: ['add access-rule layer Network position 2 name LAN-to-DMZ source LAN-NET destination DMZ-NET action Accept track.type Log',
                'add access-rule layer Network position 3 name Block-SSH-WEB source LAN-NET destination WEB-SRV service ssh action Drop track.type Log'] },
        ],
        story: 'Kural tabanı bölümlere (section) ayrılmış: <b>Management</b>, <b>General</b>, <b>Servers</b>, <b>Cleanup</b>. <b>Servers</b> bölümündeki kural beklendiği gibi çalışmıyor: LAN istemcisi (<code>10.64.10.50</code>) ile DMZ\'deki web sunucusu (<code>172.24.50.10</code>) arasındaki trafik başka bir kurala düşüyor. İstek: nedeni kanıtlayın, istisnaları ayrı bir <b>Exceptions</b> bölümünde üstte toplayın. Standalone kutu, expert parolası: <code>' + PW + '</code>. <small>Her turda farklı bir gölgeleme gelebilir.</small>',
        lesson: L('Erişim katmanı yukarıdan aşağı tek bir liste gibi okunur; ilk eşleşen kural kazanır. <b>Bölüm</b> (access section) yalnız düzen ve başlıktır, eşleşmeyi değiştirmez. Daha geniş bir kural (ör. LAN → DMZ-NET) daha dar bir kuralın (LAN → WEB-SRV) üstündeyse dar kural hiç eşleşmez: <b>gölgelenir</b>. Çözüm genel kuralı silmek değil, istisnayı üste almaktır. <code>add access-section layer Network name … position.above …</code> bölüm ekler; <code>set access-rule … new-position.top "&lt;bölüm&gt;"</code> kuralı bir bölümün başına taşır (API örneği: <code>position.bottom "My Access Section"</code>).',
            'Gölgelenme sessizdir: politika kurulur, hata yoktur, ama kural hiç çalışmaz. İzin kuralı gölgelenirse iş durur; engelleme kuralı gölgelenirse güvenlik açığı oluşur.',
            'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=443\nmgmt_cli login -r true > id.txt\nmgmt_cli add access-section layer Network name Exceptions position.above General -s id.txt\nmgmt_cli set access-rule layer Network name LAN-to-WEB new-position.top Exceptions -s id.txt\nmgmt_cli publish -s id.txt',
            ['Bölümlerin ayrı ayrı değerlendirildiğini sanmak.', 'Gölgeleyen genel kuralı silmek: başka trafiği koruyor olabilir.', 'Kuralı taşıyıp yayınlamayı ya da kurmayı unutmak.', 'Engelleme kuralının gölgelendiğini fark etmemek: izin veren kural da gölgeler.']),
        goals: ['Gölgelenmeyi fw up_execute ile kanıtlamak', 'Bölümlerin eşleşmeyi değiştirmediğini görmek', 'İstisna bölümü eklemek', 'Kuralı bölüme taşımak, kurmak, doğrulamak'],
        tasks: [
            { t: 'Belirti: expert moda geçin ve sorunlu akışın kurulu politikada hangi kurala düştüğüne bakın (drop turunda https/443, accept turunda ssh/22).', why: '<code>fw up_execute</code> kurulu politikada eşleşen kural numarasını verir. Beklenen kural değil de daha üstteki bir kural çıkıyorsa gölgelenme vardır.',
              hints: ['fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=…', 'drop: <code>… dport=443</code> · accept: <code>fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=22</code>'],
              steps: v => EX([v.up]), loo: false, /* son görevdeki doğrulama aynı komut */
              check: s => s.ev.upexec(u => u.dst === '172.24.50.10' && (u.dport === 443 || u.dport === 22)) },
            { t: 'Kural tabanını bölümleriyle görün.', why: 'Tabloda bölüm başlıkları ve kural numaraları birlikte görünür: numaralandırma bölümlerden bağımsız, baştan sona süreklidir.',
              hints: ['mgmt_cli show access-rulebase name Network -r true', '<code>mgmt_cli show access-rulebase name Network -r true</code>'],
              steps: EX(['mgmt_cli show access-rulebase name Network -r true']),
              check: s => s.ev.ran(/^mgmt_cli show access-rulebase/) },
            { t: 'Soru: Servers bölümündeki kural neden çalışmıyor?', ask: { choices: [['drop', 'General\'daki Block-DMZ (LAN → DMZ-NET, Drop) daha üstte; web akışı önce ona eşleşiyor'], ['accept', 'General\'daki LAN-to-DMZ (LAN → DMZ-NET, Accept) daha üstte; ssh akışı engellenmeden geçiyor'], ['section', 'Bölümler ayrı değerlendirilir; Servers bölümüne hiç bakılmıyor'], ['install', 'Kural kurulmamış']], correct: v => v.key },
              why: 'up_execute gölgeleyen kuralın numarasını verdi; kural tabanında bu kural, hedef ağı (DMZ-NET) web sunucusunu da kapsadığı için daha dar kuralın üstünde kalıyor. Bölüm eşleşmeyi değiştirmez.',
              hints: ['up_execute hangi numarayı verdi?', 'O numaradaki kuralın hedefi web sunucusunu kapsıyor mu?'], needs: [0] },
            { t: 'Oturum açın ve <b>General</b> bölümünün üstüne <code>Exceptions</code> adlı bir bölüm ekleyin.', why: 'İstisnaları genel kuralların üstündeki ayrı bir bölümde toplamak, gölgelenmenin yeniden oluşmasını önler ve kural tabanını okunur tutar.',
              hints: ['mgmt_cli login …; mgmt_cli add access-section layer Network name … position.above … -s id.txt', '<code>' + LOGIN + '</code> → <code>mgmt_cli add access-section layer Network name Exceptions position.above General -s id.txt</code>'],
              steps: EX([LOGIN, 'mgmt_cli add access-section layer Network name Exceptions position.above General -s id.txt']),
              check: s => { const S = p3(cur(s)).sec.map(x => x.name), e = S.indexOf('Exceptions'); return e >= 0 && e < S.indexOf('General'); } },
            { t: 'Gölgelenen kuralı Exceptions bölümünün başına taşıyın.', why: '<code>new-position.top &lt;bölüm&gt;</code> kuralı bölümün ilk kuralı yapar. Gölgeleyen genel kural yerinde kalır; yalnız istisna üste çıkar.',
              hints: ['mgmt_cli set access-rule layer Network name … new-position.top Exceptions -s id.txt', 'drop: <code>mgmt_cli set access-rule layer Network name LAN-to-WEB new-position.top Exceptions -s id.txt</code> · accept: <code>… name Block-SSH-WEB …</code>'],
              steps: v => EX(['mgmt_cli set access-rule layer Network name ' + v.target + ' new-position.top Exceptions -s id.txt']), needs: [3],
              check: s => secOk(cur(s), s.variant()),
              fb: s => { const db = cur(s), v = s.variant(); return ridx(db, v.shadow) < 0 ? 'Gölgeleyen kural silinmiş: başka trafiği koruyor olabilir; yalnız istisnayı taşıyın.' : null; } },
            { t: 'Yayınlayın ve politikayı kurun.', why: 'Taşıma yalnız kurulumdan sonra gateway\'de etkili olur.',
              hints: ['mgmt_cli publish -s id.txt; mgmt_cli install-policy …', '<code>mgmt_cli publish -s id.txt</code> → <code>' + INSTALL + '</code>'],
              steps: EX(INSTALL_S), needs: [3, 4],
              check: s => { const v = s.variant(); return secOk(s.mgmt().installed(), v) && hit(s, v.f).name === v.target && clean(s); } },
            { t: 'Doğrulayın: aynı <code>fw up_execute</code> artık taşıdığınız kuralı göstermeli.', why: 'Kurulumdan sonraki aynı sorgu, düzeltmenin kanıtıdır.',
              hints: ['İlk görevdeki komut', 'drop: <code>… dport=443</code> → LAN-to-WEB · accept: <code>… dport=22</code> → Block-SSH-WEB'],
              steps: v => EX([v.up]), needs: [3, 4, 5], loo: false,
              check: s => { const v = s.variant(); return afterInstall(s, e => e.upexec && e.upexec.dst === '172.24.50.10' && e.upexec.name === v.target); } },
        ],
        verify: ['mgmt_cli show access-rulebase name Network -r true', 'mgmt_cli show access-section layer Network name Exceptions -r true', 'fw up_execute src=10.64.10.50 dst=172.24.50.10 ipp=6 dport=443'],
        learn: ['Kural tabanı yukarıdan aşağı; ilk eşleşen kazanır.', 'Bölüm yalnız düzendir, eşleşmeyi değiştirmez.', 'Geniş kural dar kuralı gölgeler: istisnayı üste al, geneli silme.', 'new-position.top/bottom <bölüm>.', 'Taşıma da yayınlanıp kurulmalı.'],
        links: { tool: '#/checkpoint/policy', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/123' }, cert: 'CCSA R81.20 · Troubleshooting'
    },
    // ═══ cp-26: manuel Hide NAT + zaman nesnesi ═══
    {
        id: 'cp-26', vendor: 'checkpoint', level: 3, title: 'Manuel Hide NAT + mesai saatli kural', minutes: 30, kind: 'firewall', hostname: 'gw-a', pre: ['cp-14'],
        up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1'], start: BASE, mgmt: {},
        sim: Object.assign({ p3: { clock: { day: 'Thu', date: 'Sep 24', hm: '10:21' } }, flows: [PF] }, SIMBASE),
        mgmtStart: MG_BASE.concat(['add host name PARTNER-SRV ip-address 198.51.100.25', 'add host name NAT-PARTNER ip-address 203.0.113.10']),
        story: 'İş ortağının sunucusuna (<code>PARTNER-SRV</code>, <code>198.51.100.25</code>, https) LAN\'dan erişim açılacak. İki şart var: (1) iş ortağının güvenlik duvarı yalnız <code>203.0.113.10</code> kaynaklı bağlantıları kabul ediyor, yani LAN bu adresin arkasına gizlenmeli (gateway\'in kendi adresi <code>203.0.113.2</code> değil); (2) erişim yalnız <b>hafta içi 08:00–18:00</b> açık olmalı. Standalone kutu, expert parolası: <code>' + PW + '</code>.',
        lesson: L('<b>Manuel NAT kuralı</b> NAT kural tabanına elle yazılır ve koşula bağlanabilir: <code>add nat-rule package standard position top original-source LAN-NET original-destination PARTNER-SRV translated-source NAT-PARTNER method hide</code> yalnız bu hedef için kaynağı 203.0.113.10\'a çevirir (Ansible <code>cp_mgmt_nat_rule</code>: method static | hide | nat64 | nat46 | cgnat). Manuel NAT\'ta gateway o adres için ARP\'ye kendiliğinden yanıt vermez: <code>$FWDIR/conf/local.arp</code> ile proxy ARP gerekir (Gateway Admin Guide s. 186, sk30197). <b>Zaman nesnesi</b> (<code>add time … hours-ranges.1.from/to … recurrence.pattern Weekly recurrence.weekdays.N …</code>) kuralın <code>time</code> alanına yazılır; kural yalnız bu aralıkta <b>başlayan</b> bağlantılara uygulanır, aralık dışına taşan bağlantı sürer; geçerli saat gateway\'in saat dilimidir (SmartConsole Help s. 594).',
            'Otomatik NAT nesnenin tüm trafiğini çevirir; hedefe göre farklı adres gerektiğinde manuel kural yazılır. Zaman nesnesi, "mesai dışında kapalı" gibi iş kurallarını elle aç-kapa yapmadan uygular; gateway saati yanlışsa kural da yanlış zamanda çalışır.',
            'mgmt_cli add nat-rule package standard position top name Partner-Hide original-source LAN-NET original-destination PARTNER-SRV translated-source NAT-PARTNER method hide -s id.txt\nmgmt_cli add time name Mesai hours-ranges.1.from 08:00 hours-ranges.1.to 18:00 hours-ranges.1.enabled true recurrence.pattern Weekly recurrence.weekdays.1 Mon … recurrence.weekdays.5 Fri -s id.txt\nmgmt_cli add access-rule layer Network position 2 name Partner-Mesai source LAN-NET destination PARTNER-SRV service https action Accept track.type Log time Mesai -s id.txt',
            ['original-destination\'ı Any bırakmak: tüm LAN trafiği 203.0.113.10\'a gizlenir.', 'Manuel NAT adresi için proxy ARP (local.arp) kaydını unutmak: dönüş paketleri gateway\'e gelmez.', 'Zaman nesnesini oluşturup kurala eklemeyi unutmak.', 'Gateway saatini/saat dilimini kontrol etmemek.']),
        goals: ['Hedefe özel manuel Hide NAT kuralı', 'Zaman nesnesi (hafta içi 08–18)', 'Zamanlı erişim kuralı', 'fw monitor ile çevrilen kaynağı doğrulamak'],
        tasks: [
            { t: 'Expert moda geçin ve bir API oturumu açın.', why: 'NAT kuralı, zaman nesnesi ve erişim kuralı tek oturumda birlikte yayınlanacak.',
              hints: ['expert, sonra mgmt_cli login … > id.txt', '<code>expert</code> → parola → <code>' + LOGIN + '</code>'], steps: EX([LOGIN]),
              check: s => !!s.mgmt().sess() },
            { t: 'NAT kural tabanının en üstüne <code>Partner-Hide</code> kuralını ekleyin: kaynak LAN-NET, hedef PARTNER-SRV, kaynak NAT-PARTNER\'a (203.0.113.10) gizlensin.', why: '<code>method hide</code> çoktan bire kaynak çevirisidir; <code>translated-source</code> tek bir adres (host) olmalı. Hedefi PARTNER-SRV ile sınırlamak, diğer trafiğin etkilenmemesini sağlar.',
              hints: ['mgmt_cli add nat-rule package standard position top name … original-source … original-destination … translated-source … method hide -s id.txt', '<code>mgmt_cli add nat-rule package standard position top name Partner-Hide original-source LAN-NET original-destination PARTNER-SRV translated-source NAT-PARTNER method hide -s id.txt</code>'],
              steps: EX(['mgmt_cli add nat-rule package standard position top name Partner-Hide original-source LAN-NET original-destination PARTNER-SRV translated-source NAT-PARTNER method hide -s id.txt']), needs: [0],
              check: s => natHideOk(cur(s)),
              fb: s => p3(cur(s)).nat.some(r => r.odst === 'Any') ? 'original-destination Any: tüm LAN trafiği 203.0.113.10 arkasına gizlenir; hedefi PARTNER-SRV ile sınırlayın.' : null },
            { t: '<code>Mesai</code> adlı zaman nesnesini oluşturun: 08:00–18:00, yalnız Pazartesi–Cuma.', why: '<code>hours-ranges.1.from/to</code> saat aralığı, <code>recurrence.pattern Weekly</code> ile <code>recurrence.weekdays.N</code> günlerdir (Sun … Sat).',
              hints: ['mgmt_cli add time name Mesai hours-ranges.1.from … hours-ranges.1.to … recurrence.pattern Weekly recurrence.weekdays.1 Mon … -s id.txt', '<code>' + TIME_CMD + '</code>'],
              steps: EX([TIME_CMD]), needs: [0],
              check: s => timeOk(cur(s)) },
            { t: 'Cleanup\'ın üstüne <code>Partner-Mesai</code> erişim kuralını ekleyin: LAN-NET → PARTNER-SRV, https, Accept, log, zaman Mesai.', why: 'Kuralın <code>time</code> alanı boşsa kural her zaman geçerlidir. Mesai dışında bu kural eşleşmez ve trafik Cleanup\'a düşer.',
              hints: ['mgmt_cli add access-rule layer Network position 2 name … … time Mesai -s id.txt', '<code>mgmt_cli add access-rule layer Network position 2 name Partner-Mesai source LAN-NET destination PARTNER-SRV service https action Accept track.type Log time Mesai -s id.txt</code>'],
              steps: EX(['mgmt_cli add access-rule layer Network position 2 name Partner-Mesai source LAN-NET destination PARTNER-SRV service https action Accept track.type Log time Mesai -s id.txt']), needs: [0, 2],
              check: s => pRuleOk(cur(s)) },
            { t: 'Soru: 203.0.113.10 gateway arayüzünde tanımlı değil. İş ortağının dönüş paketleri için ISP yönlendiricisi bu adrese ARP sorduğunda ne olur?', ask: { choices: [['arp', 'Manuel NAT\'ta otomatik ARP çalışmaz: local.arp ile proxy ARP kaydı yoksa kimse yanıt vermez, dönüş gelmez'], ['auto', 'Gateway her NAT adresine her zaman kendiliğinden yanıt verir'], ['isp', 'ISP yönlendiricisi adresi kendi tablosundan yanıtlar'], ['none', 'Hide NAT\'ta dönüş paketi kullanılmaz; ARP gerekmez']], correct: 'arp' },
              why: 'Gateway Admin Guide s. 186: "If you use Manual NAT, then automatic ARP does not work for the IP addresses behind NAT" (local.arp, sk30197). Kayıt <code>fw ctl arp</code> ile görülür.',
              hints: ['Otomatik ve manuel NAT arasındaki ARP farkı.', 'Gateway o adresin MAC\'ini ilan ediyor mu?'] },
            { t: 'Yayınlayın ve politikayı kurun.', why: 'NAT kuralı, zaman nesnesi ve erişim kuralı birlikte gateway\'e gider.',
              hints: ['mgmt_cli publish -s id.txt; mgmt_cli install-policy …', '<code>mgmt_cli publish -s id.txt</code> → <code>' + INSTALL + '</code>'],
              steps: EX(INSTALL_S), needs: [0, 1, 2, 3],
              check: s => { const db = s.mgmt().installed(), h = hit(s, PF); return natHideOk(db) && pRuleOk(db) && h.name === 'Partner-Mesai' && h.d.osrc === '203.0.113.10' && clean(s); } },
            { t: 'Doğrulayın: gateway saatine bakın ve iş ortağına giden paketleri <code>fw monitor</code> ile izleyin.', why: 'Saat hafta içi mesai aralığındaysa kural eşleşir. eth1:o noktasında kaynak 10.64.10.50, eth1:O noktasında 203.0.113.10 görünmeli.',
              hints: ['date; fw monitor -e "accept host(…);"', '<code>date</code> → <code>fw monitor -e "accept host(198.51.100.25);"</code>'],
              steps: EX(['date', 'fw monitor -e "accept host(198.51.100.25);"']), needs: [0, 1, 2, 3, 5],
              check: s => s.ev.list().some(e => e.p3date) && afterInstall(s, e => e.fwmon && e.fwmon.hosts.includes('198.51.100.25')) && hit(s, PF).d.osrc === '203.0.113.10' },
            { t: 'Soru: Cumartesi 11:00\'de bir LAN istemcisi iş ortağına bağlanmaya çalışırsa ne olur?', ask: { choices: [['drop', 'Partner-Mesai eşleşmez, yeni bağlantı Cleanup\'a düşer; mesai içinde başlamış bir bağlantı ise sürer'], ['accept', 'Kural yine eşleşir; zaman yalnız log içindir'], ['nat', 'NAT kuralı da kapanır, bağlantı 203.0.113.2 ile çıkar'], ['cut', 'Açık tüm bağlantılar 18:00\'de kesilir']], correct: 'drop' },
              why: 'SmartConsole Help s. 594: zaman nesneli kural yalnız o aralıkta başlayan bağlantılara uygulanır; aralık dışına taşan bağlantı sürer. NAT kuralında zaman alanı yoktur; ama erişim kuralı eşleşmediği için bağlantı zaten düşer.',
              hints: ['Kural hangi bağlantılara uygulanır?', 'Cumartesi Mesai nesnesinde var mı?'] },
        ],
        verify: ['mgmt_cli show nat-rulebase package standard -r true', 'mgmt_cli show time name Mesai -r true', 'mgmt_cli show access-rulebase name Network -r true', 'date', 'fw monitor -e "accept host(198.51.100.25);"'],
        learn: ['Manuel NAT: hedefe özel çeviri.', 'method hide + translated-source (host).', 'Manuel NAT adresine proxy ARP: local.arp (s. 186).', 'Zaman nesnesi kuralın time alanında; gateway saati geçerli.', 'Aralıkta başlayan bağlantı aralık dışında da sürer.'],
        links: { tool: '#/checkpoint/nat', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/124' }, cert: 'CCSA R81.20'
    },
    // ═══ cp-27: Static NAT arızası ═══
    {
        id: 'cp-27', vendor: 'checkpoint', level: 3, title: 'Web sunucusu dışarıdan açılmıyor: Static NAT', minutes: 25, kind: 'firewall', hostname: 'gw-a', pre: ['cp-14', 'cp-04'],
        up: ['eth1', 'eth2', 'eth3'], hosts: ['203.0.113.1'], start: BASE, mgmt: {},
        sim: Object.assign({ p3: P3IN, proxyArp: [{ ip: '203.0.113.20', dev: 'eth1' }] }, SIMBASE),
        mgmtStart: MG_BASE.concat([WEB_HOST, 'add host name WEB-PUB ip-address 203.0.113.20', 'add access-rule layer Network position 2 name Web-In source Any destination WEB-SRV service https action Accept track.type Log']),
        variants: [
            { key: 'nonat', fix: ['mgmt_cli ' + WEB_NAT + ' -r true', INSTALL] },
            { key: 'install', sim: { p3: Object.assign({ late: [WEB_NAT] }, P3IN) }, fix: [INSTALL] },
            { key: 'wrongdst', mgmtStart: ['add host name WEB-OLD ip-address 172.24.50.100'], sim: { p3: Object.assign({ start: [WEB_NAT.replace('translated-destination WEB-SRV', 'translated-destination WEB-OLD')] }, P3IN) },
              fix: ['mgmt_cli set nat-rule package standard name Web-Static translated-destination WEB-SRV -r true', INSTALL] },
        ],
        story: '<b>Arıza kaydı:</b> "DMZ\'deki web sunucusu (<code>WEB-SRV</code>, <code>172.24.50.10</code>) internetten <code>203.0.113.20</code> adresiyle (https) yayınlanacaktı; dışarıdan (ör. <code>198.51.100.77</code>) açılmıyor." <code>Web-In</code> erişim kuralı kurulu. Yayın, Gateway Admin Guide s. 186\'daki gibi manuel NAT kuralıyla yapılıyor (Original Destination genel adres, Translated Destination sunucunun özel adresi). Standalone kutu, expert parolası: <code>' + PW + '</code>. <small>Her turda farklı bir arıza gelebilir.</small>',
        lesson: L('<b>Static NAT</b> birebir çeviridir. Sunucu yayınında gelen bağlantının <b>hedefi</b> çevrilir: <code>add nat-rule package standard position top name Web-Static original-destination WEB-PUB translated-destination WEB-SRV method static</code>. <code>fw monitor</code>\'da gelen paket <code>eth1:i</code> noktasında genel adresle görünür; hedef çevirisi istemci tarafında yapıldığında <code>eth1:I</code> noktasında hedef özel adrestir ve paket DMZ arayüzünden (<code>eth3:o/O</code>) çıkar. Manuel NAT\'ta genel adres için ARP\'ye gateway kendiliğinden yanıt vermez; <code>$FWDIR/conf/local.arp</code> kaydı gerekir ve <code>fw ctl arp</code> ile görülür (GW s. 186, CLI Ref s. 1072).',
            'Yayın arızasında üç ayrı halka vardır: NAT kuralı var ve doğru mu, kurulmuş mu, trafik gateway\'e geliyor mu (ARP). fw monitor noktaları hangi halkanın koptuğunu gösterir.',
            'fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"\nmgmt_cli show nat-rulebase package standard -r true\nfw stat\nmgmt_cli add nat-rule package standard position top name Web-Static original-destination WEB-PUB translated-destination WEB-SRV method static -r true\nmgmt_cli install-policy policy-package standard targets.1 gw-a -r true\nfw ctl arp -n',
            ['Hide NAT ile sunucu yayınlamaya çalışmak.', 'translated-destination\'a yanlış (eski) sunucu nesnesini yazmak.', 'NAT kuralını yayınlayıp kurmamak.', 'Manuel NAT için local.arp kaydını unutmak.']),
        goals: ['Gelen trafiği fw monitor ile izlemek', 'NAT kural tabanını ve kurulum zamanını okumak', 'Static NAT kuralını düzeltmek', 'i/I noktalarında hedef çevirisini görmek'],
        tasks: [
            { t: 'Belirti: expert moda geçin ve genel adrese (<code>203.0.113.20</code>) gelen paketleri <code>fw monitor</code> ile izleyin.', why: 'Filtre iki adresi de içerir: çeviriden sonra paket özel adresle görünür, yalnız genel adrese süzen bir filtre I/o/O noktalarını kaçırır. Yalnız <code>eth1:i</code> görünüp <code>I</code> görünmüyorsa paket gateway\'in giriş tarafında düşüyor ya da çevrilmiyor. Aynı SYN\'in tekrarı dönüş gelmediğini gösterir.',
              hints: ['fw monitor -e "accept host(…);"', '<code>expert</code> → parola → <code>fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"</code>'], steps: EX(['fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"']), loo: false, /* son görevdeki doğrulama aynı komut */
              check: s => s.ev.fwmon(f => f.hosts.includes('203.0.113.20')) },
            { t: 'Kanıt: yayınlanmış NAT kural tabanına ve kurulum zamanına bakın.', why: 'NAT kural tabanı kuralın var olup olmadığını ve Translated Destination\'ı gösterir; tablonun altındaki not ve <code>fw stat</code> tarihi kurulum durumunu gösterir.',
              hints: ['mgmt_cli show nat-rulebase package standard -r true; fw stat', '<code>mgmt_cli show nat-rulebase package standard -r true</code> → <code>fw stat</code>'],
              steps: EX(['mgmt_cli show nat-rulebase package standard -r true', 'fw stat']),
              check: s => s.ev.ran(/^mgmt_cli show nat-rulebase/) && s.ev.ran(/^fw stat$/) },
            { t: 'Kök neden hangisi?', ask: { choices: [['nonat', 'Genel adres için NAT kuralı hiç yok'], ['install', 'NAT kuralı yayınlanmış ama politika kurulmamış'], ['wrongdst', 'NAT kuralı hedefi yanlış sunucuya (WEB-OLD, 172.24.50.100) çeviriyor'], ['rule', 'Web-In erişim kuralı yok']], correct: v => v.key },
              why: 'Kural tabanı boşsa: kural yok. Kural var ve not "KURULMAMIŞ değişiklik" diyorsa: kurulum. Kural kurulu ama Trans.Dst WEB-OLD ise: yanlış hedef. Web-In kuralı erişim kural tabanında durur.',
              hints: ['NAT tablosunda Web-Static var mı, Trans.Dst ne?', 'Tablonun altındaki kurulum notu ne diyor?'], needs: [1] },
            { t: 'Tek düzeltmeyle onarın ve politikayı kurun.', why: 'Yalnız bozuk halkayı düzeltin. -s olmadan çalışan mgmt_cli komutu kendi oturumunda yayınlanır; ardından kurulum gerekir.',
              hints: ['Kök nedene göre add/set nat-rule (install turunda gerekmez), sonra install-policy.', 'nonat: <code>mgmt_cli ' + WEB_NAT + ' -r true</code> · wrongdst: <code>mgmt_cli set nat-rule package standard name Web-Static translated-destination WEB-SRV -r true</code> · hepsinde sonra <code>' + INSTALL + '</code>'],
              steps: v => EX(v.fix),
              check: s => inOk(s) },
            { t: 'Proxy ARP kaydına bakın.', why: '<code>fw ctl arp</code>, <code>$FWDIR/conf/local.arp</code> dosyasından gelen proxy ARP kayıtlarını gösterir (CLI Reference s. 1072). Genel adres burada olmalı.',
              hints: ['fw ctl arp -n', '<code>fw ctl arp -n</code>'], steps: EX(['fw ctl arp -n']),
              check: s => s.ev.list().some(e => e.fwarp) },
            { t: 'Soru: Bu kayıt olmasaydı ne olurdu?', ask: { choices: [['arp', 'ISP yönlendiricisinin 203.0.113.20 için ARP isteği yanıtsız kalır; paket gateway\'e hiç gelmez'], ['nat', 'NAT kuralı devre dışı kalırdı'], ['nothing', 'Hiçbir şey: gateway manuel NAT adreslerine her zaman kendiliğinden yanıt verir'], ['rule', 'Web-In kuralı eşleşmezdi']], correct: 'arp' },
              why: 'Gateway Admin Guide s. 186: manuel NAT\'ta otomatik ARP çalışmaz; local.arp yapılandırılmalıdır (sk30197). Bu durumda fw monitor\'de i noktası bile görünmez.',
              hints: ['Paket gateway\'e gelmeden önce hangi adım var?', 'Genel adresin MAC\'ini kim ilan ediyor?'], needs: [4] },
            { t: 'Doğrulayın: aynı <code>fw monitor</code> komutunu yeniden çalıştırın.', why: 'Şimdi <code>eth1:i</code> hedef 203.0.113.20, <code>eth1:I</code> hedef 172.24.50.10 olmalı; paket eth3\'ten çıkmalı, SYN-ACK dönmeli ve dışarıya 203.0.113.20 kaynağıyla gitmeli.',
              hints: ['Aynı fw monitor', '<code>fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"</code>'], steps: EX(['fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"']), needs: [3], loo: false,
              check: s => inOk(s) && afterInstall(s, e => e.fwmon && (e.fwmon.p3 || []).includes('eth1:I:172.24.50.10')) },
        ],
        verify: ['mgmt_cli show nat-rulebase package standard -r true', 'fw stat', 'fw ctl arp -n', 'fw monitor -e "accept host(203.0.113.20) or host(172.24.50.10);"'],
        learn: ['Sunucu yayını: hedefi çeviren Static NAT.', 'fw monitor: i genel adres, I özel adres (istemci tarafı çeviri).', 'NAT da politikanın parçası: yayınla + kur.', 'Manuel NAT: local.arp + fw ctl arp.'],
        links: { tool: '#/checkpoint/nat', cli: '#/cli/checkpoint', wizard: '#/troubleshoot/checkpoint/125' }, cert: 'CCSA R81.20 · Troubleshooting'
    },
    ];
    LABS.forEach(l => l.tasks.forEach((t, i) => {
        if (!t.ask) return;
        const key = l.id + ':' + i, want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
        t.check = s => !!s.answers && s.answers[key] === want(s.variant && s.variant());
        t.steps = t.steps || (v => [{ answer: i, v: want(v) }]);
    }));
    const dedupExpert = A => { const out = []; let ex = false; for (let i = 0; i < A.length; i++) { const x = A[i]; if (x === 'expert' && ex) { i++; continue; } if (x === 'expert') ex = true; else if (x === 'exit' && ex) ex = false; out.push(x); } return out; };
    LABS.forEach(l => { l.solution = v => dedupExpert([].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps))); });
    const OWN = new Set(LABS.map(l => l.id));
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
