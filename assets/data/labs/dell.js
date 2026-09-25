'use strict';
// ─── CLI Lab içerikleri: Dell OS10 (SmartFabric OS10 10.5 görünümü) ─────────
// Görev kontrolleri komut METNİNE değil cihaz durumuna / olay kaydına bakar.
// s = oturum: s.model (running), s.candidate, s.startupModel, s.saved(), s.inTx(), s.mode(), s.ev, s.rib(), s.ifUp()
// Adresler: yalnız güvenli örnek bloklar (192.0.2.0/24, 10.64/16, 10.128/16).
(function () {
    const E = n => 'ethernet1/1/' + n;
    const ifc = (s, n) => s.model.ifs[typeof n === 'number' ? E(n) : n];
    const LAB = id => LABS_BY_ID[id];
    const doneUpTo = (s, id, k) => LAB(id).tasks.slice(0, k).every(t => t.check(s));

    // dell-40: VLAN 20 yolu sağlam mı? (SVI up + doğru IP, kullanıcı portu, trunk)
    function v20Ok(s) {
        const m = s.model, svi = m.ifs.vlan20, u = ifc(s, 5), t = ifc(s, 12);
        return !!svi && svi.ip === '10.64.20.1' && svi.len === 24 && !svi.shutdown && s.ifUp('vlan20') &&
            !u.l3 && u.mode === 'access' && u.access === 20 && !u.shutdown &&
            !t.l3 && t.mode === 'trunk' && t.allowed.includes(20) && !t.shutdown;
    }
    const d40Side = s => { const t = ifc(s, 12); return t.allowed.includes(10) && ifc(s, 1).access === 10 && s.model.ifs.vlan10 && s.model.ifs.vlan10.ip === '10.64.10.1'; };
    const D40_BASE = ['hostname LEAF1', 'interface vlan 10', 'ip address 10.64.10.1/24', 'exit', 'interface vlan 20', 'exit', 'interface ethernet 1/1/1', 'switchport access vlan 10', 'exit'];
    const D40_SVI = ip => ['interface vlan 20', 'ip address ' + ip, 'exit'];
    const D40_USER = v => ['interface ethernet 1/1/5', 'switchport access vlan ' + v, 'exit'];
    const D40_TRUNK = l => ['interface ethernet 1/1/12', 'switchport mode trunk', 'switchport trunk allowed vlan ' + l, 'exit'];

    const LABS = [
    // ═══ Seviye 0 ═══════════════════════════════════════════════════════════
    {
        id: 'dell-01', vendor: 'dell', level: 0, title: 'OS10 CLI: modlar, yardım, kaydetme ve transaction', minutes: 15, kind: 'switch', ordered: true,
        up: [E(1), E(2)],
        story: 'Yeni bir Dell OS10 veri merkezi switch\'ine <code>admin</code> olarak bağlandınız; doğrudan <code>OS10#</code> (EXEC) istemindesiniz. OS10\'da iki üst mod var: <b>EXEC</b> ve <b>CONFIGURATION</b>. Varsayılan olarak her yapılandırma komutu anında çalışan yapılandırmaya (running-configuration) yazılır; isterseniz <b>transaction</b> modunda değişiklikleri biriktirip tek seferde <code>commit</code> edebilirsiniz.',
        goals: ['EXEC / CONFIGURATION / arayüz modlarını gezmek', '? ve kısaltma kullanmak', 'write memory ile kalıcı kaydetmek', 'start transaction → commit akışını görmek', 'Hata iletisini okumak'],
        tasks: [
            { t: 'Yapılandırma moduna girin, <code>ethernet 1/1/1</code> arayüzüne geçin, <code>exit</code> ile bir üst moda çıkın, <code>end</code> ile doğrudan <code>OS10#</code>\'e dönün.',
              why: 'İstem bulunduğunuz yeri söyler: <code>OS10(config)#</code> global, <code>OS10(conf-if-eth1/1/1)#</code> arayüz modu. <code>exit</code> bir seviye yukarı, <code>end</code> nereden olursa olsun EXEC moduna döner.',
              hints: ['configure terminal → interface ethernet … → exit → end', '<code>configure terminal</code> → <code>interface ethernet 1/1/1</code> → <code>exit</code> → <code>end</code>'],
              steps: ['configure terminal', 'interface ethernet 1/1/1', 'exit', 'end'],
              check: s => s.ev.ranIn(/^exit$/, 'if') && s.ev.after(/^interface ethernet1\/1\/1$/, /^end$/) },
            { t: '<code>show</code> komutunun seçeneklerini <kbd>?</kbd> ile listeleyin (<code>show ?</code>).',
              why: '<kbd>?</kbd> o noktada yazılabilecek kelimeleri açıklamalarıyla gösterir. Kelimeye bitişik (<code>sh?</code>) yazılırsa o harflerle başlayanları listeler.',
              hints: ['show yazıp boşluk, sonra ?', '<code>show ?</code>'], steps: [{ help: 'show ' }],
              check: s => s.ev.helped(/^\s*sh\w*\s+$/i) },
            { t: 'Yazılım sürümünü <b>kısaltarak</b> görüntüleyin.',
              why: 'OS10 kelimeleri benzersiz olduğu kadar kısaltmanıza izin verir: <code>sh ver</code> = <code>show version</code>. Kısaltma birden çok komuta uyuyorsa (ör. <code>s</code>: show mu start mı?) komut çalışmaz; Tab adayları gösterir.',
              hints: ['Her kelimenin ilk birkaç harfi.', '<code>sh ver</code>'], steps: ['sh ver'],
              check: s => s.ev.abbrev('show version') },
            { t: 'Yapılandırma modundayken — moddan çıkmadan — VLAN tablosunu görüntüleyin.',
              why: 'OS10\'da <code>show</code> komutları yapılandırma modlarında da doğrudan çalışır; <code>do show …</code> da kabul edilir. Değişikliği yaparken hemen doğrulamanın yolu budur.',
              hints: ['configure terminal, sonra show …', '<code>configure terminal</code> → <code>show vlan</code>'], steps: ['configure terminal', 'show vlan'],
              check: s => s.ev.ranIn(/^(do )?show vlan$/, 'config') || s.ev.ranIn(/^(do )?show vlan$/, 'if') },
            { t: 'Cihaz adını <code>LEAF1</code> yapın.', why: 'Varsayılan (transaction\'sız) modda değişiklik <b>anında</b> running-configuration\'a yazılır; istem hemen <code>LEAF1(config)#</code> olur. Ama henüz kalıcı değildir.',
              hints: ['Global yapılandırmada hostname.', '<code>configure terminal</code> → <code>hostname LEAF1</code>'], steps: ['configure terminal', 'hostname LEAF1'],
              check: s => s.model.hostname === 'LEAF1' },
            { t: 'Çalışan yapılandırmayı açılış yapılandırmasına kaydedin.',
              why: '<code>write memory</code>, <code>copy running-configuration startup-configuration</code> ile aynı işi yapar: running\'i startup\'a (startup.xml) yazar. Kaydedilmeyen değişiklik <code>reload</code>\'da kaybolur.',
              hints: ['EXEC modunda kısa kaydetme komutu.', '<code>write memory</code>'], steps: ['write memory'],
              check: s => !!s.startupModel && s.startupModel.hostname === 'LEAF1' },
            { t: '<b>Transaction</b> modunda çalışın: <code>start transaction</code>, <code>ethernet 1/1/2</code>\'ye açıklama <code>PRINTER</code> yazın, EXEC\'te aday ile çalışan yapılandırmanın <b>farkını</b> görün, sonra <code>commit</code> edin.',
              why: 'Transaction modunda değişiklikler <b>candidate</b> yapılandırmada bekler, running etkilenmez. <code>show diff candidate-configuration running-configuration</code> neyin değişeceğini gösterir; <code>commit</code> hepsini tek seferde uygular ve oturum varsayılan (anında) moda döner. Vazgeçerseniz <code>discard</code>.',
              hints: ['start transaction → değişiklik → end → show diff … → commit', '<code>start transaction</code> → <code>configure terminal</code> → <code>interface ethernet 1/1/2</code> → <code>description PRINTER</code> → <code>end</code> → <code>show diff candidate-configuration running-configuration</code> → <code>commit</code>'],
              steps: ['start transaction', 'configure terminal', 'interface ethernet 1/1/2', 'description PRINTER', 'end', 'show diff candidate-configuration running-configuration', 'commit'],
              check: s => s.ev.ranTx(/^description PRINTER$/) && s.ev.ran(/^show diff candidate-configuration running-configuration$/) && s.ev.ran(/^commit$/) && ifc(s, 2).desc === 'PRINTER' && !s.inTx(),
              fb: s => s.inTx() ? 'Transaction açık: değişiklik henüz running\'de değil — <code>commit</code> edin.' : null },
            { t: 'Hatalı bir komut yazın: <code>shwo ip interface brief</code>. Hata iletisini okuyun, sonra komutu doğru yazıp çalıştırın.',
              why: 'OS10 tanımadığı komutta <code>% Error: Unrecognized command.</code> der (Cisco gibi <code>^</code> işareti koymaz): hatayı kendiniz bulmalısınız. <kbd>?</kbd> ve Tab bu yüzden OS10\'da daha da değerlidir.',
              hints: ['Yazım hatası ilk kelimede.', 'Doğrusu: <code>show ip interface brief</code>'], steps: ['shwo ip interface brief', 'show ip interface brief'], expectErr: true,
              check: s => s.ev.afterErr(/^show ip interface brief$/) },
        ],
        solution: ['configure terminal', 'interface ethernet 1/1/1', 'exit', 'end', { help: 'show ' }, 'sh ver', 'configure terminal', 'show vlan', 'hostname LEAF1', 'end', 'write memory',
            'start transaction', 'configure terminal', 'interface ethernet 1/1/2', 'description PRINTER', 'end', 'show diff candidate-configuration running-configuration', 'commit',
            'shwo ip interface brief', 'show ip interface brief'],
        expectErrors: 1,
        verify: ['show running-configuration', 'show startup-configuration', 'show command-history'],
        learn: ['<code>OS10#</code> EXEC, <code>(config)#</code> global, <code>(conf-if-eth1/1/1)#</code> arayüz.', '<code>exit</code> bir üst mod, <code>end</code> doğrudan EXEC.', 'show komutları yapılandırma modunda da çalışır.', '<code>write memory</code> = <code>copy running-configuration startup-configuration</code>.', 'Transaction: start transaction → değişiklik → show diff → commit (ya da discard).'],
        links: { tool: '#/dell/general', cli: '#/cli/dell', wizard: '#/troubleshoot/dell/3' }, cert: 'Dell OS10 temelleri'
    },
    // ═══ Seviye 1 ═══════════════════════════════════════════════════════════
    {
        id: 'dell-02', vendor: 'dell', level: 1, title: 'Temel kurulum: ad, yönetim IP\'si, kullanıcı ve SSH', minutes: 15, kind: 'switch', pre: ['dell-01'],
        up: [E(1)], hosts: ['192.0.2.1'],
        start: ['no ip ssh server enable'],
        story: 'Rafa yeni takılan switch yönetim ağına (<code>192.0.2.0/24</code>, ağ geçidi <code>192.0.2.1</code>) <code>mgmt 1/1/1</code> portuyla bağlı. Önceki teknisyen test sırasında SSH sunucusunu kapatmış. Cihazı ağ ekibinin standardına getirin: ad, statik yönetim adresi, yönetim rotası, kişisel yönetici hesabı ve SSH.<br><small>Parola örneği: <code>Lab-Dell-2026</code> (OS10 varsayılan kuralı: en az 9 karakter).</small>',
        goals: ['hostname', 'Yönetim portuna statik IP (DHCP\'yi kapatarak)', 'management route', 'username … role sysadmin', 'SSH sunucusunu açmak ve yönetim ağ geçidine ping'],
        tasks: [
            { t: 'Cihaz adını <code>LEAF1</code> yapın.', why: 'SSH ile bağlandığınızda istemde görünen ad; yanlış cihazda komut çalıştırmayı önler.',
              hints: ['hostname', '<code>configure terminal</code> → <code>hostname LEAF1</code>'], steps: ['configure terminal', 'hostname LEAF1'],
              check: s => s.model.hostname === 'LEAF1' },
            { t: '<code>mgmt 1/1/1</code>\'de DHCP\'yi kapatıp statik <code>192.0.2.10/24</code> verin ve portun açık olduğundan emin olun.',
              why: 'Yönetim portu varsayılan olarak adresi DHCP ile alır. Statik adres için önce <code>no ip address dhcp</code>, sonra <code>ip address</code> — OS10 adresi <b>önek (CIDR)</b> biçiminde ister: <code>192.0.2.10/24</code>.',
              hints: ['interface mgmt 1/1/1 görünümünde üç komut.', '<code>interface mgmt 1/1/1</code> → <code>no ip address dhcp</code> → <code>ip address 192.0.2.10/24</code> → <code>no shutdown</code>'],
              steps: ['configure terminal', 'interface mgmt 1/1/1', 'no ip address dhcp', 'ip address 192.0.2.10/24', 'no shutdown'],
              check: s => { const m = s.model.ifs['mgmt1/1/1']; return m.ip === '192.0.2.10' && m.len === 24 && !m.dhcp && !m.shutdown; } },
            { t: 'Yönetim trafiği için varsayılan <b>management route</b> ekleyin: ağ geçidi <code>192.0.2.1</code>.',
              why: 'Yönetim portu veri düzleminden ayrıdır; onun rotaları <code>ip route</code> ile değil <code>management route</code> ile yazılır. Böylece başka ağlardaki yönetim istasyonları switch\'e ulaşır.',
              hints: ['management route önek next-hop', '<code>management route 0.0.0.0/0 192.0.2.1</code>'], steps: ['configure terminal', 'management route 0.0.0.0/0 192.0.2.1'],
              check: s => s.model.mroutes.some(r => r.p === '0.0.0.0/0' && r.nh === '192.0.2.1'),
              fb: s => s.model.routes.some(r => r.nh === '192.0.2.1') ? 'Bu bir veri düzlemi rotası (ip route); yönetim portu için <code>management route</code> kullanın.' : null },
            { t: 'Kişisel yönetici hesabı açın: kullanıcı <code>netadmin</code>, rol <b>sysadmin</b>.',
              why: 'Paylaşılan <code>admin</code> hesabı yerine kişisel hesap, kimin ne yaptığını loglarda izlenebilir kılar. OS10 parolayı SHA-512 ile saklar (<code>$6$…</code>); varsayılan kural en az 9 karakter ister. Roller: sysadmin (tam), netadmin (ağ), secadmin (güvenlik), netoperator (yalnız izleme).',
              hints: ['username … password … role …', '<code>username netadmin password Lab-Dell-2026 role sysadmin</code>'], steps: ['configure terminal', 'username netadmin password Lab-Dell-2026 role sysadmin'],
              check: s => !!s.model.users.netadmin && s.model.users.netadmin.role === 'sysadmin',
              fb: s => s.model.users.netadmin && s.model.users.netadmin.role !== 'sysadmin' ? 'Rol sysadmin olmalı (tam yönetim).' : null },
            { t: 'SSH sunucusunu yeniden açın.', why: 'OS10\'da SSH sunucusu varsayılan açıktır; biri kapattıysa <code>ip ssh server enable</code> ile açılır. Kapalıyken yapılandırmada <code>no ip ssh server enable</code> satırı görünür.',
              hints: ['ip ssh server …', '<code>ip ssh server enable</code>'], steps: ['configure terminal', 'ip ssh server enable'],
              check: s => s.model.ssh === true },
            { t: 'Yönetim ağ geçidine (<code>192.0.2.1</code>) ping atarak bağlantıyı doğrulayın.',
              why: 'OS10\'un ping çıktısı Linux biçimindedir (<code>64 bytes from …</code>, <code>0% packet loss</code>). Ağ geçidine ulaşamıyorsanız önce adres/maske ve portun durumunu kontrol edin.',
              hints: ['EXEC modunda ping', '<code>ping 192.0.2.1</code>'], steps: ['ping 192.0.2.1'], needs: [1],
              check: s => s.ev.ran(/^(do )?ping 192\.0\.2\.1$/) && s.model.ifs['mgmt1/1/1'].ip === '192.0.2.10' },
            { t: 'Yapılandırmayı kaydedin.', why: 'Yönetim erişimi ayarları kaydedilmezse bir yeniden başlatmadan sonra cihaza yalnız konsoldan ulaşabilirsiniz.',
              hints: ['write …', '<code>write memory</code>'], steps: ['write memory'], needs: [0, 1, 2, 3, 4],
              check: s => s.saved() && doneUpTo(s, 'dell-02', 5) },
        ],
        solution: ['configure terminal', 'hostname LEAF1', 'interface mgmt 1/1/1', 'no ip address dhcp', 'ip address 192.0.2.10/24', 'no shutdown', 'exit', 'management route 0.0.0.0/0 192.0.2.1',
            'username netadmin password Lab-Dell-2026 role sysadmin', 'ip ssh server enable', 'end', 'ping 192.0.2.1', 'write memory'],
        alts: [['conf t', 'hostname LEAF1', 'int mgmt 1/1/1', 'no ip address dhcp', 'ip address 192.0.2.10/24', 'no shut', 'management route 0.0.0.0/0 192.0.2.1', 'username netadmin password Lab-Dell-2026 role sysadmin priv-lvl 15',
            'ip ssh server enable', 'do ping 192.0.2.1', 'end', 'copy running-configuration startup-configuration']],
        verify: ['show running-configuration', 'show ip interface brief', 'ping 192.0.2.1'],
        learn: ['Yönetim portu: <code>no ip address dhcp</code> + <code>ip address A.B.C.D/önek</code>.', 'Yönetim rotası <code>management route</code>, veri rotası <code>ip route</code>.', '<code>username … password … role sysadmin</code>; parola en az 9 karakter.', 'SSH: <code>ip ssh server enable</code> (varsayılan açık).'],
        links: { tool: '#/dell/aaa', cli: '#/cli/dell' }, cert: 'Dell OS10 temelleri'
    },
    // ═══ Seviye 2 ═══════════════════════════════════════════════════════════
    {
        id: 'dell-03', vendor: 'dell', level: 2, title: 'VLAN, access / trunk portlar ve SVI', minutes: 20, kind: 'switch', pre: ['dell-02'],
        up: [E(1), E(2), E(3), E(12)], start: ['hostname LEAF1'], startSaved: true,
        story: 'LEAF1, rack\'teki sunucuların erişim switch\'i ve ağ geçidi olacak. <code>ethernet 1/1/1–2</code>\'de uygulama sunucuları (VLAN 10), <code>1/1/3</code>\'te yedekleme sunucusu (VLAN 20) var. <code>1/1/12</code> omurgaya giden uplink; VLAN 10 ve 20 etiketli geçecek.',
        goals: ['interface vlan ile VLAN oluşturmak', 'interface range ile toplu access', 'switchport mode trunk + allowed vlan', 'SVI\'ye IP (önek biçimi)', 'show vlan / show interface status ile doğrulama'],
        tasks: [
            { t: 'VLAN 10 (açıklama <code>APP</code>) ve VLAN 20\'yi (açıklama <code>BACKUP</code>) oluşturun.',
              why: 'OS10\'da VLAN, <code>interface vlan &lt;id&gt;</code> ile oluşturulur; aynı komut SVI\'nin (L3 arayüz) yapılandırma moduna da girer. Açıklama <code>show vlan</code>\'da Description sütununda görünür.',
              hints: ['interface vlan 10 → description …', '<code>interface vlan 10</code> → <code>description APP</code> → <code>interface vlan 20</code> → <code>description BACKUP</code>'],
              steps: ['configure terminal', 'interface vlan 10', 'description APP', 'interface vlan 20', 'description BACKUP'],
              check: s => s.model.vlans[10] !== undefined && s.model.vlans[20] !== undefined && s.model.ifs.vlan10.desc === 'APP' && s.model.ifs.vlan20.desc === 'BACKUP' },
            { t: '<code>ethernet 1/1/1–1/1/2</code>\'yi <b>tek komutla</b> seçip VLAN 10\'a, <code>1/1/3</code>\'ü VLAN 20\'ye access olarak atayın.',
              why: 'OS10 portları varsayılan olarak access moddadır (VLAN 1). <code>interface range ethernet 1/1/1-1/1/2</code> birden çok portu tek seferde yapılandırır. Var olmayan VLAN\'ı atayamazsınız: önce VLAN oluşturulmalı.',
              hints: ['interface range, sonra switchport access vlan.', '<code>interface range ethernet 1/1/1-1/1/2</code> → <code>switchport access vlan 10</code> · <code>interface ethernet 1/1/3</code> → <code>switchport access vlan 20</code>'],
              steps: ['configure terminal', 'interface range ethernet 1/1/1-1/1/2', 'switchport access vlan 10', 'exit', 'interface ethernet 1/1/3', 'switchport access vlan 20'], needs: [0],
              check: s => ifc(s, 1).access === 10 && ifc(s, 2).access === 10 && ifc(s, 3).access === 20 && [1, 2, 3].every(p => ifc(s, p).mode === 'access') },
            { t: 'Uplink <code>ethernet 1/1/12</code>\'yi trunk yapın; VLAN 10 ve 20 etiketli geçsin.',
              why: '<code>switchport mode trunk</code> portu etiketli (802.1Q) yapar; hangi VLAN\'ların geçeceği <code>switchport trunk allowed vlan 10,20</code> ile yazılır. Portun access VLAN\'ı (varsayılan 1) etiketsiz taşınır. Tam listeyi tek satırda yazmak en güvenli yoldur.',
              hints: ['mode trunk, sonra allowed vlan listesi.', '<code>interface ethernet 1/1/12</code> → <code>switchport mode trunk</code> → <code>switchport trunk allowed vlan 10,20</code>'],
              steps: ['configure terminal', 'interface ethernet 1/1/12', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20'], needs: [0],
              check: s => { const t = ifc(s, 12); return t.mode === 'trunk' && t.allowed.includes(10) && t.allowed.includes(20); } },
            { t: 'SVI adresleri: <code>vlan 10</code> = <code>10.64.10.1/24</code>, <code>vlan 20</code> = <code>10.64.20.1/24</code>.',
              why: 'SVI, sunucuların varsayılan ağ geçididir. OS10 IP\'yi önek biçiminde ister. SVI\'nin "up" olması için VLAN\'da en az bir up port gerekir.',
              hints: ['interface vlan 10 → ip address …/24', '<code>interface vlan 10</code> → <code>ip address 10.64.10.1/24</code> · <code>interface vlan 20</code> → <code>ip address 10.64.20.1/24</code>'],
              steps: ['configure terminal', 'interface vlan 10', 'ip address 10.64.10.1/24', 'interface vlan 20', 'ip address 10.64.20.1/24'], needs: [0],
              check: s => s.model.ifs.vlan10 && s.model.ifs.vlan10.ip === '10.64.10.1' && s.model.ifs.vlan20 && s.model.ifs.vlan20.ip === '10.64.20.1',
              fb: s => s.model.ifs.vlan20 && s.model.ifs.vlan20.ip && !s.ifUp('vlan20') ? 'vlan20 SVI down: VLAN 20\'de up port yok.' : null },
            { t: 'Doğrulayın: VLAN–port tablosunu ve port durum özetini görüntüleyin.',
              why: '<code>show vlan</code>: Q sütunu A (access/etiketsiz) ya da T (etiketli), Status Active/Inactive. <code>show interface status</code>: portun Mode (A/T), Vlan ve Tagged-Vlans sütunları.',
              hints: ['İki show komutu.', '<code>show vlan</code> · <code>show interface status</code>'], steps: ['show vlan', 'show interface status'], needs: [0, 1, 2, 3],
              check: s => s.ev.ran(/^(do )?show vlan$/) && s.ev.ran(/^(do )?show interface status$/) && doneUpTo(s, 'dell-03', 4) },
            { t: 'Yapılandırmayı kaydedin.', why: 'VLAN ve port atamaları running\'dedir; <code>write memory</code> olmadan reload\'da kaybolur.',
              hints: ['write memory', '<code>write memory</code>'], steps: ['write memory'], needs: [0, 1, 2, 3],
              check: s => s.saved() && doneUpTo(s, 'dell-03', 4) },
        ],
        solution: ['configure terminal', 'interface vlan 10', 'description APP', 'ip address 10.64.10.1/24', 'interface vlan 20', 'description BACKUP', 'ip address 10.64.20.1/24', 'exit',
            'interface range ethernet 1/1/1-1/1/2', 'switchport access vlan 10', 'exit', 'interface ethernet 1/1/3', 'switchport access vlan 20', 'exit',
            'interface ethernet 1/1/12', 'switchport mode trunk', 'switchport trunk allowed vlan 10,20', 'end', 'show vlan', 'show interface status', 'write memory'],
        alts: [['conf t', 'int vlan 10', 'desc APP', 'int vlan 20', 'desc BACKUP', 'int eth 1/1/1', 'switchport access vlan 10', 'int eth 1/1/2', 'switchport access vlan 10', 'int eth 1/1/3', 'switchport access vlan 20',
            'int eth 1/1/12', 'switchport mode trunk', 'switchport trunk allowed vlan 10', 'switchport trunk allowed vlan 20', 'int vlan 10', 'ip address 10.64.10.1/24', 'int vlan 20', 'ip address 10.64.20.1/24',
            'do show vlan', 'show interface status', 'end', 'write memory']],
        verify: ['show vlan', 'show interface status', 'show ip interface brief'],
        learn: ['VLAN = <code>interface vlan &lt;id&gt;</code> (aynı zamanda SVI).', 'Portlar varsayılan access/VLAN 1; <code>interface range</code> toplu yapılandırır.', 'Trunk: <code>switchport mode trunk</code> + <code>switchport trunk allowed vlan 10,20</code>.', 'IP önek biçiminde: <code>10.64.10.1/24</code>.'],
        links: { tool: '#/dell/vlan', cli: '#/cli/dell' }, cert: 'Dell OS10 L2'
    },
    // ═══ Seviye 3 ═══════════════════════════════════════════════════════════
    {
        id: 'dell-04', vendor: 'dell', level: 3, title: 'L3 uplink ve statik rotalar', minutes: 20, kind: 'switch', pre: ['dell-03'],
        up: [E(1), E(12)], hosts: ['10.64.0.2', '10.128.10.10', '10.64.10.20'],
        start: ['hostname LEAF1', 'interface vlan 10', 'ip address 10.64.10.1/24', 'exit', 'interface ethernet 1/1/1', 'switchport access vlan 10', 'exit'], startSaved: true,
        story: 'LEAF1\'in VLAN 10 ağ geçidi hazır (<code>10.64.10.1/24</code>). Şimdi <code>ethernet 1/1/12</code> üzerinden omurga router\'ına (<code>10.64.0.2/30</code>) <b>L3</b> bağlanacak. Merkez sunucu blokları <code>10.128.0.0/16</code> ve geri kalan her şey (varsayılan) bu router üzerinden gidecek.',
        goals: ['Fiziksel portu L3 yapmak (no switchport)', 'ip route önek next-hop', 'Varsayılan rota', 'show ip route okumak; en uzun önek eşleşmesi', 'ping ile uçtan uca doğrulama'],
        tasks: [
            { t: '<code>ethernet 1/1/12</code>\'yi L3 porta çevirin ve <code>10.64.0.1/30</code> verin.',
              why: 'OS10 portları L2 (switchport) başlar; L2 porta IP verilemez. <code>no switchport</code> portu router portu yapar, ardından <code>ip address 10.64.0.1/30</code>.',
              hints: ['Önce L2\'yi kapatın, sonra IP.', '<code>interface ethernet 1/1/12</code> → <code>no switchport</code> → <code>ip address 10.64.0.1/30</code>'],
              steps: ['configure terminal', 'interface ethernet 1/1/12', 'no switchport', 'ip address 10.64.0.1/30'],
              check: s => ifc(s, 12).l3 && ifc(s, 12).ip === '10.64.0.1' && ifc(s, 12).len === 30 },
            { t: 'Merkez bloğu <code>10.128.0.0/16</code> için statik rota yazın: next-hop <code>10.64.0.2</code>.',
              why: '<code>ip route &lt;önek&gt; &lt;next-hop&gt;</code>. Next-hop bağlı bir ağda olmalıdır; değilse OS10 <code>% Error: Network unreachable</code> ile reddeder — bu yüzden önce L3 bağlantıyı kurduk.',
              hints: ['ip route önek next-hop', '<code>ip route 10.128.0.0/16 10.64.0.2</code>'], steps: ['configure terminal', 'ip route 10.128.0.0/16 10.64.0.2'], needs: [0],
              check: s => s.model.routes.some(r => r.p === '10.128.0.0/16' && r.nh === '10.64.0.2') },
            { t: 'Varsayılan rotayı yazın: next-hop <code>10.64.0.2</code>.', why: '<code>0.0.0.0/0</code> "başka hiçbir rotaya uymayan her şey" demektir; <code>show ip route</code>\'da <code>*S</code> (aday varsayılan) olarak ve "Gateway of last resort" satırında görünür.',
              hints: ['0.0.0.0/0', '<code>ip route 0.0.0.0/0 10.64.0.2</code>'], steps: ['configure terminal', 'ip route 0.0.0.0/0 10.64.0.2'], needs: [0],
              check: s => s.model.routes.some(r => r.p === '0.0.0.0/0' && r.nh === '10.64.0.2') },
            { t: 'Yönlendirme tablosunu görüntüleyin; iki statik rota ve bağlı ağlar görünmeli.',
              why: 'C = bağlı (connected), S = statik, *S = aday varsayılan. Dist/Metric sütunu: statik 1/0, bağlı 0/0. Rota tabloda yoksa next-hop\'a ulaşılamıyordur (arayüz down?).',
              hints: ['show ip …', '<code>show ip route</code>'], steps: ['show ip route'], needs: [0, 1, 2],
              check: s => s.ev.ran(/^(do )?show ip route$/) && s.rib().some(r => r.c === '*S') && s.rib().some(r => r.net === '10.128.0.0' && r.len === 16) },
            { t: '<code>10.128.10.10</code>\'a giden paket hangi rotayı kullanır?',
              ask: { choices: [['s16', '10.128.0.0/16 statik rotası (en uzun önek eşleşmesi)'], ['def', '0.0.0.0/0 varsayılan rota (daha önce yazıldı)'], ['both', 'İkisi arasında yük paylaşılır']], correct: 's16' },
              why: 'Yönlendirme kararı <b>en uzun önek eşleşmesi</b> ile verilir: /16, /0\'dan daha özeldir. Yazılış sırası ya da mesafe (distance) önekler farklıyken belirleyici değildir.',
              hints: ['Hangi önek hedefi daha dar kapsıyor?', '/16 mı /0 mı daha özel?'] },
            { t: 'Merkezdeki sunucuya (<code>10.128.10.10</code>) ping atın.', why: 'Rota tablosu doğru görünse de uçtan uca test şarttır: karşı taraf dönüş rotasını bilmiyorsa ping yine başarısız olur.',
              hints: ['ping …', '<code>ping 10.128.10.10</code>'], steps: ['ping 10.128.10.10'], needs: [0, 1],
              check: s => s.ev.ran(/^(do )?ping 10\.128\.10\.10$/) && s.rib().some(r => r.net === '10.128.0.0' && r.len === 16) },
            { t: 'Yapılandırmayı kaydedin.', why: 'Kaydedilmeyen rota, reload sonrası "dün çalışıyordu" arızasına dönüşür.',
              hints: ['write memory', '<code>write memory</code>'], steps: ['write memory'], needs: [0, 1, 2],
              check: s => s.saved() && doneUpTo(s, 'dell-04', 3) },
        ],
        solution: ['configure terminal', 'interface ethernet 1/1/12', 'no switchport', 'ip address 10.64.0.1/30', 'exit', 'ip route 10.128.0.0/16 10.64.0.2', 'ip route 0.0.0.0/0 10.64.0.2', 'end',
            'show ip route', { answer: 4, v: 's16' }, 'ping 10.128.10.10', 'write memory'],
        alts: [['conf t', 'int eth 1/1/12', 'no switchport', 'ip address 10.64.0.1/30', 'ip route 0.0.0.0/0 10.64.0.2', 'ip route 10.128.0.0/16 10.64.0.2', 'do show ip route', { answer: 4, v: 's16' }, 'do ping 10.128.10.10', 'end', 'write memory']],
        verify: ['show ip route', 'show ip interface brief', 'ping 10.128.10.10'],
        learn: ['<code>no switchport</code> portu L3 yapar.', '<code>ip route &lt;önek&gt; &lt;next-hop&gt;</code>; next-hop bağlı ağda değilse "Network unreachable".', 'En uzun önek eşleşmesi kazanır.', '<code>*S</code> = aday varsayılan rota.'],
        links: { tool: '#/dell/staticRoute', cli: '#/cli/dell' }, cert: 'Dell OS10 L3'
    },
    // ═══ Seviye 5 — arıza ══════════════════════════════════════════════════
    {
        id: 'dell-40', vendor: 'dell', level: 5, title: 'Arıza: VLAN 20 sunucuları ağ geçidine ulaşamıyor', minutes: 20, kind: 'switch', pre: ['dell-03'],
        up: [E(1), E(5), E(12)], hosts: ['10.64.20.50', '10.64.20.60', '10.64.10.20'], start: D40_BASE,
        variants: [
            { key: 'allowed', start: D40_SVI('10.64.20.1/24').concat(D40_USER(20), D40_TRUNK('10')) },
            { key: 'access', start: D40_SVI('10.64.20.1/24').concat(D40_USER(10), D40_TRUNK('10,20')) },
            { key: 'svidown', start: D40_SVI('10.64.20.1/24').concat(['interface vlan 20', 'shutdown', 'exit'], D40_USER(20), D40_TRUNK('10,20')) },
            { key: 'sviip', start: D40_SVI('10.64.21.1/24').concat(D40_USER(20), D40_TRUNK('10,20')) },
        ],
        story: '<b>Arıza kaydı:</b> "Yedekleme sunucusu <code>10.64.20.50</code> (LEAF1 <code>ethernet 1/1/5</code>) ve komşu raktaki <code>10.64.20.60</code> (uplink <code>1/1/12</code> arkasında) ağ geçidi <code>10.64.20.1</code>\'e ping atamıyor. VLAN 10 sunucuları sorunsuz." Ağ geçidi LEAF1\'deki <code>vlan 20</code> SVI\'si. <small>Her turda farklı bir arıza — "Yeni tur".</small>',
        goals: ['show vlan ile port–VLAN üyeliğini okumak', 'show ip interface brief ile SVI durumunu/adresini okumak', 'Kök nedeni ayırt etmek', 'En az değişiklikle düzeltip ping ile kanıtlamak'],
        tasks: [
            { t: 'VLAN–port tablosuna bakın.', why: '<code>show vlan</code>: VLAN 20 satırında <code>A Eth1/1/5</code> (access) ve <code>T Eth1/1/12</code> (trunk) olmalı. Eksik olan üye arızanın yerini söyler.',
              hints: ['show …', '<code>show vlan</code>'], steps: ['show vlan'],
              check: s => s.ev.ran(/^(do )?show vlan$/) },
            { t: 'L3 arayüz özetine bakın.', why: '<code>show ip interface brief</code>: <code>Vlan 20</code> satırında adres <code>10.64.20.1/24</code> ve Status/Protocol <code>up</code> olmalı. Status <code>down</code> = SVI kapatılmış (shutdown); adres farklıysa sunucuların ağ geçidi ile uyuşmuyor.',
              hints: ['show ip …', '<code>show ip interface brief</code>'], steps: ['show ip interface brief'],
              check: s => s.ev.ran(/^(do )?show ip interface brief$/) },
            { t: 'Kök neden hangisi?',
              ask: { choices: [['allowed', 'Uplink trunk\'ı (1/1/12) VLAN 20\'yi taşımıyor'], ['access', 'ethernet 1/1/5 yanlış VLAN\'da (access vlan 10)'], ['svidown', 'vlan 20 SVI kapalı (shutdown)'], ['sviip', 'vlan 20 SVI\'nin adresi yanlış (10.64.21.1/24)']], correct: v => v.key },
              why: 'Okuma anahtarı: VLAN 20\'de <code>T Eth1/1/12</code> yok → trunk · <code>A Eth1/1/5</code> VLAN 10 altında → yanlış access VLAN · Vlan 20 Status <code>down</code> → shutdown · Vlan 20 adresi 10.64.21.1 → yanlış IP.',
              hints: ['show vlan: VLAN 20 satırının üyeleri.', 'show ip interface brief: Vlan 20 satırının adresi ve Status sütunu.'] },
            { t: 'Arızayı <b>en az değişiklikle</b> giderin: VLAN 20 ağ geçidi çalışmalı, VLAN 10 etkilenmemeli.',
              why: 'Yalnız bozuk ayarı düzeltin. Trunk için tam listeyi (<code>10,20</code>) yazmak güvenlidir; SVI adresini değiştirirken önce yanlışı kaldırın ya da doğrudan doğrusunu yazın.',
              hints: ['Kök nedene karşılık gelen tek ayar.', 'trunk → <code>switchport trunk allowed vlan 10,20</code> · access → <code>switchport access vlan 20</code> · SVI kapalı → <code>no shutdown</code> · adres → <code>ip address 10.64.20.1/24</code>'],
              steps: v => ['configure terminal'].concat(({ allowed: ['interface ethernet 1/1/12', 'switchport trunk allowed vlan 10,20'], access: ['interface ethernet 1/1/5', 'switchport access vlan 20'],
                  svidown: ['interface vlan 20', 'no shutdown'], sviip: ['interface vlan 20', 'no ip address', 'ip address 10.64.20.1/24'] })[v.key]),
              check: s => v20Ok(s) && d40Side(s),
              fb: s => v20Ok(s) && !d40Side(s) ? 'VLAN 20 düzeldi ama VLAN 10 etkilenmiş (trunk listesi ya da 1/1/1 ataması).' : null },
            { t: 'Yedekleme sunucusuna (<code>10.64.20.50</code>) ping atarak düzeltmeyi kanıtlayın.',
              why: 'Ağ geçidinden sunucuya ping; ARP ve VLAN yolu çalışıyorsa yanıt gelir. "Artık çalışıyor olmalı" yerine kanıt.',
              hints: ['ping …', '<code>ping 10.64.20.50</code>'], steps: ['ping 10.64.20.50'], needs: [3],
              check: s => s.ev.ran(/^(do )?ping 10\.64\.20\.50$/) && v20Ok(s) },
            { t: 'Düzeltmeyi kaydedin.', why: 'Kaydedilmeyen düzeltme bir sonraki reload\'da arızayı geri getirir.',
              hints: ['write memory', '<code>write memory</code>'], steps: ['write memory'], needs: [3],
              check: s => s.saved() && v20Ok(s) && d40Side(s) },
        ],
        solution: v => ['show vlan', 'show ip interface brief', { answer: 2, v: v.key }].concat(LABS_BY_ID['dell-40'].tasks[3].steps(v), ['end', 'ping 10.64.20.50', 'write memory']),
        verify: ['show vlan', 'show ip interface brief', 'show interface status'],
        learn: ['Sıra: show vlan → show ip interface brief → düzelt → ping.', 'VLAN 20 satırında A (access) ve T (trunk) üyeleri olmalı.', 'SVI Status down = shutdown; adres ağ geçidiyle aynı olmalı.', 'Trunk listesini tam yazın: <code>switchport trunk allowed vlan 10,20</code>.'],
        links: { tool: '#/dell/vlan', cli: '#/cli/dell', wizard: '#/troubleshoot/dell/2' }, cert: 'Dell OS10 L2/L3 sorun giderme'
    },
    // ═══ Serbest terminal ══════════════════════════════════════════════════
    { id: 'dell-sandbox', vendor: 'dell', level: null, sandbox: true, title: 'Serbest terminal — Dell OS10', kind: 'switch', up: [E(1), E(2), E(3), E(12)], hosts: ['192.0.2.1', '10.64.10.20'],
      story: '12 portlu bir OS10 switch (1/1/1–3 ve 1/1/12 bağlı, yönetim portu bağlı). Görev yok; <code>configure terminal</code> ile başlayın, <kbd>?</kbd> ile desteklenen komutları görün. <code>start transaction</code> → değişiklik → <code>show diff candidate-configuration running-configuration</code> → <code>commit</code> akışını deneyin.', tasks: [] },
    ];
    // Çoktan seçmeli (ask) görevler: cevap s.answers['<lab>:<görev>'] içinde
    LABS.forEach(l => l.tasks.forEach((t, i) => {
        if (!t.ask) return;
        const key = l.id + ':' + i, want = v => typeof t.ask.correct === 'function' ? t.ask.correct(v || {}) : t.ask.correct;
        t.check = s => !!s.answers && s.answers[key] === want(s.variant && s.variant());
        t.steps = t.steps || (v => [{ answer: i, v: want(v) }]);
    }));
    LABS.forEach(l => {
        if (l.solution || l.sandbox) return;
        l.solution = v => [].concat(...l.tasks.map(t => typeof t.steps === 'function' ? t.steps(v || {}) : t.steps));
    });
    const LABS_BY_ID = {};
    LABS.forEach(l => { LABS_BY_ID[l.id] = l; });
    const root = typeof window !== 'undefined' ? window : globalThis;
    root.CG_LABS = (root.CG_LABS || []).filter(l => l.vendor !== 'dell').concat(LABS);
})();
