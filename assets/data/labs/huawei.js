'use strict';
// ─── CLI Lab içerikleri: Huawei VRP (S5700 switch / AR router görünümü) ──────
// Görev kontrolleri komut METNİNE değil cihaz durumuna / olay kaydına bakar.
// s = oturum: s.model (cihaz), s.savedModel, s.saved(), s.view(), s.ev (olaylar), s.peer(), s.rib(), s.decide(), s.aclEval()
// Adresler: yalnız güvenli örnek bloklar (10.64/16, 10.128/16, 203.0.113.0/24).
(function () {
    const GE = n => 'GigabitEthernet0/0/' + n;
    const ifc = (s, n) => s.model.ifs[GE(n)];
    const LAB = id => LABS_BY_ID[id];
    const doneUpTo = (s, id, k) => LAB(id).tasks.slice(0, k).every(t => t.check(s));

    // hua-40: VLAN 20 kullanıcısının (GE0/0/5) çekirdeğe (GE0/0/24 trunk) giden yolu sağlam mı?
    function vlan20Ok(s) {
        const m = s.model, u = ifc(s, 5), up = ifc(s, 24);
        return m.vlans[20] !== undefined && u.lt === 'access' && u.pvid === 20 && !u.shutdown &&
            up.lt === 'trunk' && up.allow.includes(20) && !up.shutdown && s.ifUp(GE(24));
    }
    // hua-40: düzeltme yan etki bırakmamalı (VLAN 10 ve 99 hâlâ taşınıyor, "allow-pass vlan all" yok)
    const sideOk = s => { const up = ifc(s, 24); return up.allow.includes(10) && up.allow.includes(99) && up.allow.length < 4094 && ifc(s, 1).pvid === 10; };

    const HUA40_BASE = ['sysname SW-KAT2', 'vlan batch 10 20 99', 'interface g0/0/1', 'port link-type access', 'port default vlan 10', 'quit',
        'interface Vlanif99', 'ip address 10.64.99.12 255.255.255.0', 'quit'];
    const H40_TRUNK = allow => ['interface g0/0/24', 'port link-type trunk', 'port trunk allow-pass vlan ' + allow, 'quit'];
    const H40_USER = vlan => ['interface g0/0/5', 'port link-type access', 'port default vlan ' + vlan, 'quit'];

    // hua-06 / hua-42: R1 temel adresleme
    const R1_BASE = ['sysname R1', 'interface g0/0/0', 'ip address 203.0.113.2 255.255.255.252', 'quit', 'interface g0/0/2', 'ip address 10.64.10.1 255.255.255.0', 'quit'];
    const R2_PEER = { ifn: GE(1), ip: '10.64.0.2', rid: '10.64.255.2', area: '0.0.0.0', routes: [['10.128.10.0', 24, 1], ['10.128.20.0', 24, 1]] };
    const R1_OSPF_OK = ['interface g0/0/1', 'ip address 10.64.0.1 255.255.255.252', 'quit', 'ip route-static 0.0.0.0 0.0.0.0 203.0.113.1',
        'ospf 1 router-id 10.64.255.1', 'silent-interface GigabitEthernet0/0/2', 'area 0', 'network 10.64.10.0 0.0.0.255'];

    // hua-07 akışları
    const F = { tel: { src: '10.64.20.25', dst: '10.64.99.10', proto: 'tcp', dport: 23, in: GE(2) }, ssh: { src: '10.64.20.25', dst: '10.64.99.10', proto: 'tcp', dport: 22, in: GE(2) },
        web: { src: '10.64.20.25', dst: '10.64.99.10', proto: 'tcp', dport: 443, in: GE(2) }, adm: { src: '10.64.10.5', dst: '10.64.99.10', proto: 'tcp', dport: 22, in: GE(2) } };

    const LABS = [
    // ═══ Seviye 0 ═══════════════════════════════════════════════════════════
    {
        id: 'hua-01', vendor: 'huawei', level: 0, title: 'VRP görünümleri, display, undo ve save', minutes: 12, kind: 'switch', ordered: true,
        up: [GE(1), GE(2)],
        story: 'Kutusundan yeni çıkmış bir Huawei S5700 switch\'e konsoldan bağlandınız. Ekranda <code>&lt;HUAWEI&gt;</code> var. VRP\'de "mod" yerine <b>görünüm (view)</b> denir: açılı parantez <code>&lt;&gt;</code> kullanıcı görünümü, köşeli parantez <code>[]</code> sistem görünümü ve alt görünümlerdir. Cisco\'daki <code>show</code> burada <code>display</code>, <code>no</code> ise <code>undo</code>\'dur.',
        goals: ['Kullanıcı / sistem / arayüz görünümlerini ayırt etmek', 'display, ? ve kısaltmalarla keşfetmek', 'undo ile geri almak, save ile kalıcı yapmak', 'Hata iletisindeki ^ işaretini okumak'],
        tasks: [
            { t: '<code>system-view</code> ile sistem görünümüne geçin (istem <code>[HUAWEI]</code> olur), sonra <code>quit</code> ile kullanıcı görünümüne dönün.',
              why: 'Yapılandırma komutları yalnız sistem görünümünde ve onun alt görünümlerinde çalışır. <code>quit</code> her zaman <b>bir</b> üst görünüme çıkar; kullanıcı görünümünde <code>quit</code> yazarsanız oturum kapanır — dikkat.',
              hints: ['İki komut: sistem görünümüne gir, bir üst görünüme çık.', '<code>system-view</code> → <code>quit</code>'], steps: ['system-view', 'quit'],
              check: s => s.ev.ranIn(/^quit$/, 'sys') },
            { t: 'Cihaz adını <code>SW1</code> yapın.',
              why: 'VRP\'de cihaz adı <code>sysname</code> ile verilir (Cisco\'da hostname). İstem hemen <code>[SW1]</code> olur: değişiklik anında çalışan yapılandırmaya (current-configuration) yazıldı ama henüz kalıcı değil.',
              hints: ['Sistem görünümünde, "system name" kısaltması.', '<code>system-view</code> → <code>sysname SW1</code>'], steps: ['system-view', 'sysname SW1'],
              check: s => s.model.sysname === 'SW1' },
            { t: '<code>display</code> komutunun alabileceği seçenekleri <kbd>?</kbd> ile listeleyin (<code>display ?</code>).',
              why: '<kbd>?</kbd> Enter beklemeden o noktada yazılabilecek her şeyi açıklamasıyla gösterir. Kelimeye bitişik yazılırsa (<code>dis?</code>) o harflerle başlayan komutları listeler. <code>display</code> komutları her görünümde çalışır.',
              hints: ['display yazıp bir boşluk bırakın, sonra ? tuşuna basın.', '<code>display ?</code>'], steps: [{ help: 'display ' }],
              check: s => s.ev.helped(/^\s*dis\w*\s+$/i) },
            { t: 'Çalışan yapılandırmayı <b>kısaltarak</b> görüntüleyin: <code>display current-configuration</code>.',
              why: 'VRP her kelimeyi benzersiz olduğu kadar kısaltmaya izin verir: <code>dis cu</code> = <code>display current-configuration</code>. Tab tuşu da kelimeyi tamamlar (<code>sys</code> + Tab → <code>system-view</code>). Kısaltma birden çok komuta uyuyorsa <code>Error: Ambiguous command</code> alırsınız.',
              hints: ['Her kelimenin ilk birkaç harfi yeter.', '<code>dis cu</code>'], steps: ['dis cu'],
              check: s => s.ev.abbrev('display current-configuration') },
            { t: '<code>GigabitEthernet0/0/1</code> arayüz görünümüne girip açıklama olarak <code>UPLINK</code> yazın, <code>display this</code> ile görün, <code>undo</code> ile açıklamayı kaldırın ve <code>return</code> ile doğrudan kullanıcı görünümüne dönün.',
              why: '<code>display this</code> yalnız bulunduğunuz görünümün yapılandırmasını gösterir — uzun çıktıda kaybolmadan kontrol etmenin yolu. <code>undo</code> bir komutu geri alır ya da varsayılana döndürür. <code>return</code> (ya da Ctrl+Z) hangi görünümde olursanız olun kullanıcı görünümüne döner.',
              hints: ['Sıra: arayüz görünümü → description → display this → undo description → return.', '<code>interface g0/0/1</code> → <code>description UPLINK</code> → <code>display this</code> → <code>undo description</code> → <code>return</code>'],
              steps: ['system-view', 'interface g0/0/1', 'description UPLINK', 'display this', 'undo description', 'return'],
              check: s => s.ev.ranIn(/^display this$/, 'if') && s.ev.ran(/^undo description$/) && s.ev.ranIn(/^return$/, 'if') && s.model.ifs[GE(1)].desc === '' },
            { t: 'Yapılandırmayı kaydedin ve onay sorusunu yanıtlayın.',
              why: 'Değişiklikler RAM\'deki current-configuration\'dadır. <code>save</code> bunu flash\'taki yapılandırma dosyasına (ör. vrpcfg.zip) yazar; cihaz açılışta o dosyayı yükler. VRP kaydetmeden önce <code>[Y/N]</code> ile onay ister.',
              hints: ['Kaydetme komutu tek kelime.', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'],
              check: s => s.saved() && s.savedModel.sysname === 'SW1' },
            { t: 'Hatalı bir komut yazın: <code>displya vlan</code>. <code>^</code> işaretinin nereyi gösterdiğine bakın, sonra komutu doğru yazıp çalıştırın.',
              why: 'VRP hatalı komutun altına <code>^</code> koyar ve türünü söyler: <b>Unrecognized</b> (tanınmayan kelime), <b>Incomplete</b> (eksik parametre), <b>Ambiguous</b> (belirsiz kısaltma), <b>Wrong parameter</b> (yanlış değer), <b>Too many parameters</b> (fazla kelime).',
              hints: ['İşaret ilk tanınmayan kelimenin başındadır.', 'Doğrusu: <code>display vlan</code>'], steps: ['displya vlan', 'display vlan'], expectErr: true,
              check: s => s.ev.afterErr(/^display vlan$/) },
        ],
        solution: ['system-view', 'quit', 'system-view', 'sysname SW1', { help: 'display ' }, 'dis cu', 'interface g0/0/1', 'description UPLINK', 'display this', 'undo description', 'return', 'save', 'y', 'displya vlan', 'display vlan'],
        expectErrors: 1,
        verify: ['display current-configuration', 'display saved-configuration', 'display history-command'],
        learn: ['<code>&lt;&gt;</code> kullanıcı görünümü, <code>[]</code> sistem ve alt görünümler.', '<code>quit</code> bir üst görünüm, <code>return</code>/Ctrl+Z doğrudan kullanıcı görünümü.', '<code>display</code> = gösterim, <code>undo</code> = geri alma; <code>display this</code> yalnız bulunduğunuz görünüm.', '<code>save</code> + <code>y</code> olmadan değişiklik yeniden başlatmada kaybolur.', 'Hata türleri: Unrecognized / Incomplete / Ambiguous / Wrong parameter / Too many parameters.'],
        links: { tool: '#/huawei/basic', cli: '#/cli/huawei' }, cert: 'HCIA-Datacom (VRP temelleri)'
    },
    // ═══ Seviye 1 ═══════════════════════════════════════════════════════════
    {
        id: 'hua-02', vendor: 'huawei', level: 1, title: 'Güvenli uzaktan yönetim: AAA, STelnet (SSH) ve VTY', minutes: 18, kind: 'switch', pre: ['hua-01'],
        up: [GE(1), GE(24)],
        story: 'Kat switch\'i uzaktan yönetilecek. Kurum kuralı: <b>yalnız SSH</b> (Huawei\'de STelnet), şifresiz Telnet yok, herkes kendi kullanıcısıyla girer. Yönetim ağı VLAN 1 üzerinde <code>10.64.99.0/24</code>.<br><small>Parola örneği: <code>Lab@Huawei2026</code> — gerçek cihazda kendi güçlü parolanızı kullanın.</small>',
        goals: ['sysname ve yönetim IP\'si', 'AAA altında yerel kullanıcı (parola, yetki, servis tipi)', 'STelnet sunucusu ve SSH kullanıcısı', 'VTY hatlarında AAA + yalnız SSH'],
        tasks: [
            { t: 'Cihaz adını <code>SW-KAT1</code> yapın.', why: 'Anlamlı ad, SSH ile bağlandığınızda hangi cihazda olduğunuzu istemden görmenizi sağlar; yanlış cihazda komut çalıştırma hatasını azaltır.',
              hints: ['sysname', '<code>system-view</code> → <code>sysname SW-KAT1</code>'], steps: ['system-view', 'sysname SW-KAT1'],
              check: s => s.model.sysname === 'SW-KAT1' },
            { t: '<code>Vlanif1</code> arayüzüne yönetim adresi <code>10.64.99.11/24</code> verin.',
              why: 'L2 switch\'te fiziksel portlara IP verilmez; yönetim adresi bir VLAN arayüzüne (Vlanif) verilir. Maskeyi <code>255.255.255.0</code> ya da kısaca <code>24</code> yazabilirsiniz.',
              hints: ['Önce Vlanif1 arayüz görünümü.', '<code>interface Vlanif1</code> → <code>ip address 10.64.99.11 24</code>'], steps: ['system-view', 'interface Vlanif1', 'ip address 10.64.99.11 24'],
              check: s => s.model.ifs.Vlanif1.ip === '10.64.99.11' && s.model.ifs.Vlanif1.mask === '255.255.255.0' },
            { t: 'AAA görünümünde yerel kullanıcı <code>netadmin</code> oluşturun: parola (<code>irreversible-cipher</code>), yetki seviyesi <b>15</b> ve servis tipi <b>yalnız ssh</b>.',
              why: '<code>irreversible-cipher</code> parolayı geri döndürülemez biçimde (hash) saklar. Yetki 15 tam yönetim yetkisidir. <code>service-type</code> kullanıcının hangi yoldan girebileceğini sınırlar: yalnız <code>ssh</code> verirseniz Telnet ile giremez.',
              hints: ['aaa görünümünde üç ayrı local-user satırı.', '<code>aaa</code> → <code>local-user netadmin password irreversible-cipher …</code> · <code>local-user netadmin privilege level 15</code> · <code>local-user netadmin service-type ssh</code>'],
              steps: ['system-view', 'aaa', 'local-user netadmin password irreversible-cipher Lab@Huawei2026', 'local-user netadmin privilege level 15', 'local-user netadmin service-type ssh'],
              check: s => { const u = s.model.users.netadmin; return !!u && !!u.pw && u.level === 15 && u.svc.includes('ssh') && !u.svc.includes('telnet'); },
              fb: s => { const u = s.model.users.netadmin; if (!u) return null; if (u.svc.includes('telnet')) return 'Servis tipinde telnet de var: kural "yalnız SSH".'; if (u.level !== 15) return 'Yetki seviyesi 15 olmalı.'; if (!u.pw) return 'Parola tanımlı değil.'; return null; } },
            { t: 'STelnet (SSH) sunucusunu açın ve <code>netadmin</code> için SSH kullanıcısı tanımlayın: parola ile doğrulama, servis tipi <code>stelnet</code>.',
              why: 'Huawei\'de SSH sunucusu <code>stelnet server enable</code> ile açılır. <code>ssh user</code> satırları kullanıcının SSH\'ta nasıl doğrulanacağını (parola/anahtar) ve hangi servisi (stelnet/sftp) kullanabileceğini belirler. Eski sürümlerde önce <code>rsa local-key-pair create</code> ile anahtar üretmek gerekir.',
              hints: ['Bir global açma komutu + iki ssh user satırı.', '<code>stelnet server enable</code> · <code>ssh user netadmin authentication-type password</code> · <code>ssh user netadmin service-type stelnet</code>'],
              steps: ['system-view', 'stelnet server enable', 'ssh user netadmin authentication-type password', 'ssh user netadmin service-type stelnet'],
              check: s => { const u = s.model.sshUsers.netadmin; return s.model.stelnet && !!u && u.auth === 'password' && (u.svc === 'stelnet' || u.svc === 'all'); },
              fb: s => !s.model.stelnet && s.model.sshUsers.netadmin ? 'SSH kullanıcısı var ama sunucu kapalı: <code>stelnet server enable</code>.' : null },
            { t: 'VTY 0–4 hatlarında girişi AAA\'ya bağlayın ve yalnız SSH\'a izin verin.',
              why: '<code>authentication-mode aaa</code> girişte kullanıcı adı + parola ister (AAA\'daki yerel kullanıcılar). <code>protocol inbound ssh</code> Telnet\'i hatta tamamen kapatır. VRP, SSH\'a izin vermeden önce doğrulama modunun AAA olmasını ister: sıra önemlidir.',
              hints: ['user-interface vty 0 4 görünümünde iki komut, sırası önemli.', '<code>user-interface vty 0 4</code> → <code>authentication-mode aaa</code> → <code>protocol inbound ssh</code>'],
              steps: ['system-view', 'user-interface vty 0 4', 'authentication-mode aaa', 'protocol inbound ssh'],
              check: s => s.model.vty.auth === 'aaa' && s.model.vty.proto === 'ssh',
              fb: s => s.model.vty.auth === 'aaa' && s.model.vty.proto !== 'ssh' ? 'AAA tamam; şimdi <code>protocol inbound ssh</code>.' : null },
            { t: 'Yapılandırmayı kaydedin.', why: 'Uzaktan erişim ayarı kaydedilmezse bir elektrik kesintisinden sonra cihaza yalnız konsoldan girebilirsiniz — sahada en pahalı hatalardan biri.',
              hints: ['save + onay.', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [0, 1, 2, 3, 4],
              check: s => s.saved() && doneUpTo(s, 'hua-02', 5) },
        ],
        solution: ['system-view', 'sysname SW-KAT1', 'interface Vlanif1', 'ip address 10.64.99.11 24', 'quit', 'aaa', 'local-user netadmin password irreversible-cipher Lab@Huawei2026', 'local-user netadmin privilege level 15',
            'local-user netadmin service-type ssh', 'quit', 'stelnet server enable', 'ssh user netadmin authentication-type password', 'ssh user netadmin service-type stelnet', 'user-interface vty 0 4',
            'authentication-mode aaa', 'protocol inbound ssh', 'return', 'save', 'y'],
        alts: [['sys', 'sysn SW-KAT1', 'int vlanif 1', 'ip add 10.64.99.11 255.255.255.0', 'aaa', 'local-user netadmin password irreversible-cipher Lab@Huawei2026', 'local-user netadmin privilege level 15',
            'local-user netadmin service-type ssh', 'stelnet server enable', 'rsa local-key-pair create', 'ssh user netadmin authentication-type password', 'ssh user netadmin service-type all', 'user-interface vty 0 4',
            'authentication-mode aaa', 'protocol inbound ssh', 'save', 'y']],
        verify: ['display current-configuration | include ssh|stelnet|local-user', 'display this (user-interface vty 0 4 görünümünde)'],
        learn: ['Yönetim IP\'si Vlanif arayüzüne verilir.', 'AAA: <code>local-user … password irreversible-cipher</code>, <code>privilege level 15</code>, <code>service-type ssh</code>.', 'SSH sunucusu: <code>stelnet server enable</code> + <code>ssh user … authentication-type / service-type</code>.', 'VTY: önce <code>authentication-mode aaa</code>, sonra <code>protocol inbound ssh</code>.'],
        links: { tool: '#/huawei/ssh', cli: '#/cli/huawei' }, cert: 'HCIA-Datacom (AAA, Telnet/SSH)'
    },
    // ═══ Seviye 2 ═══════════════════════════════════════════════════════════
    {
        id: 'hua-03', vendor: 'huawei', level: 2, title: 'VLAN, access / trunk portlar ve Vlanif', minutes: 20, kind: 'switch', pre: ['hua-02'],
        up: [GE(1), GE(2), GE(3), GE(24)], start: ['sysname SW1'], startSaved: true,
        story: 'SW1 hem erişim hem de VLAN\'lar arası ağ geçidi olacak. <code>GE0/0/1–2</code>\'de muhasebe (VLAN 10), <code>GE0/0/3</code>\'te üretim (VLAN 20) PC\'leri var. <code>GE0/0/24</code> çekirdek switch\'e giden uplink; VLAN 10, 20 ve yönetim VLAN\'ı 99 bu hattan etiketli geçecek.',
        goals: ['vlan batch ile toplu VLAN', 'port link-type access + port default vlan', 'Trunk ve allow-pass', 'Vlanif ile VLAN ağ geçidi', 'display port vlan / display vlan ile doğrulama'],
        tasks: [
            { t: 'VLAN 10, 20 ve 99\'u tek komutla oluşturun.', why: '<code>vlan batch</code> birden çok VLAN\'ı tek satırda oluşturur (<code>10 to 20</code> biçiminde aralık da verilebilir). Tek VLAN\'a girip ad vermek için <code>vlan 10</code> → <code>description …</code>.',
              hints: ['vlan batch + liste.', '<code>vlan batch 10 20 99</code>'], steps: ['system-view', 'vlan batch 10 20 99'],
              check: s => [10, 20, 99].every(v => s.model.vlans[v] !== undefined) },
            { t: '<code>GE0/0/1</code> ve <code>GE0/0/2</code>\'yi VLAN 10\'a, <code>GE0/0/3</code>\'ü VLAN 20\'ye <b>access</b> port olarak atayın.',
              why: 'S serisinde port varsayılan olarak hybrid (sürüme göre negotiation) tiptedir. Önce <code>port link-type access</code>, sonra <code>port default vlan</code> gelir: access olmayan portta <code>port default vlan</code> komutu yoktur. PVID, porttan etiketsiz gelen çerçevenin VLAN\'ıdır.',
              hints: ['Her port için iki komut, tip önce.', '<code>interface g0/0/1</code> → <code>port link-type access</code> → <code>port default vlan 10</code> (…0/0/2 ve 0/0/3 için tekrar)'],
              steps: ['system-view', 'interface g0/0/1', 'port link-type access', 'port default vlan 10', 'interface g0/0/2', 'port link-type access', 'port default vlan 10', 'interface g0/0/3', 'port link-type access', 'port default vlan 20'],
              needs: [0],
              check: s => [[1, 10], [2, 10], [3, 20]].every(([p, v]) => ifc(s, p).lt === 'access' && ifc(s, p).pvid === v),
              fb: s => { const bad = [1, 2, 3].filter(p => ifc(s, p).lt !== 'access'); return bad.length ? 'Henüz access olmayan port(lar): GE0/0/' + bad.join(', GE0/0/') : null; } },
            { t: 'Uplink <code>GE0/0/24</code>\'ü trunk yapın ve VLAN 10, 20, 99\'un geçmesine izin verin.',
              why: 'Huawei trunk\'ında varsayılan olarak yalnız VLAN 1 geçer; diğer VLAN\'lar <code>port trunk allow-pass vlan</code> ile <b>açıkça</b> eklenir (Cisco\'da varsayılan "hepsi"dir). <code>allow-pass vlan all</code> kolay ama gereksiz VLAN\'ları da taşır; yalnız gerekenleri yazın.',
              hints: ['Tip trunk, sonra izinli liste.', '<code>interface g0/0/24</code> → <code>port link-type trunk</code> → <code>port trunk allow-pass vlan 10 20 99</code>'],
              steps: ['system-view', 'interface g0/0/24', 'port link-type trunk', 'port trunk allow-pass vlan 10 20 99'], needs: [0],
              check: s => { const i = ifc(s, 24); return i.lt === 'trunk' && [10, 20, 99].every(v => i.allow.includes(v)) && i.allow.length < 4094; },
              fb: s => { const i = ifc(s, 24); return i.lt === 'trunk' && i.allow.length >= 4094 ? '<code>allow-pass vlan all</code> çalışır ama gereksiz VLAN\'ları da taşır; yalnız 10 20 99 yazın (<code>undo port trunk allow-pass vlan all</code> ile geri alın).' : null; } },
            { t: 'VLAN ağ geçitlerini kurun: <code>Vlanif10</code> = <code>10.64.10.1/24</code>, <code>Vlanif20</code> = <code>10.64.20.1/24</code>.',
              why: 'Vlanif, switch\'in o VLAN\'daki L3 arayüzüdür; PC\'ler bunu varsayılan ağ geçidi olarak kullanır. Vlanif\'in "up" olması için VLAN\'da en az bir <b>up</b> port bulunmalıdır — boş VLAN\'ın Vlanif\'i down kalır.',
              hints: ['interface Vlanif10 → ip address …', '<code>interface Vlanif10</code> → <code>ip address 10.64.10.1 24</code> · <code>interface Vlanif20</code> → <code>ip address 10.64.20.1 24</code>'],
              steps: ['system-view', 'interface Vlanif10', 'ip address 10.64.10.1 24', 'interface Vlanif20', 'ip address 10.64.20.1 24'], needs: [0],
              check: s => s.model.ifs.Vlanif10 && s.model.ifs.Vlanif10.ip === '10.64.10.1' && s.model.ifs.Vlanif20 && s.model.ifs.Vlanif20.ip === '10.64.20.1',
              fb: s => s.model.ifs.Vlanif20 && s.model.ifs.Vlanif20.ip && !s.ifUp('Vlanif20') ? 'Vlanif20 down: VLAN 20\'de up port yok (GE0/0/3 henüz VLAN 20\'de değil mi?).' : null },
            { t: 'Doğrulayın: portların tip/PVID/trunk listesini ve VLAN–port eşlemesini gösteren iki komutu çalıştırın.',
              why: '<code>display port vlan</code> port tipini, PVID\'yi ve trunk\'ta izinli VLAN\'ları; <code>display vlan</code> hangi portun hangi VLAN\'da etiketli (TG) ya da etiketsiz (UT) olduğunu ve (U)/(D) durumunu gösterir.',
              hints: ['İkisi de display ile başlar.', '<code>display port vlan</code> · <code>display vlan</code>'], steps: ['display port vlan', 'display vlan'], needs: [0, 1, 2, 3],
              check: s => s.ev.ran(/^display port vlan$/) && s.ev.ran(/^display vlan$/) && doneUpTo(s, 'hua-03', 4) },
            { t: 'Yapılandırmayı kaydedin.', why: 'VLAN ve port atamaları current-configuration\'dadır; kaydetmezseniz yeniden başlatmada kaybolur.',
              hints: ['save', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [0, 1, 2, 3],
              check: s => s.saved() && doneUpTo(s, 'hua-03', 4) },
        ],
        solution: ['system-view', 'vlan batch 10 20 99', 'interface g0/0/1', 'port link-type access', 'port default vlan 10', 'interface g0/0/2', 'port link-type access', 'port default vlan 10',
            'interface g0/0/3', 'port link-type access', 'port default vlan 20', 'interface g0/0/24', 'port link-type trunk', 'port trunk allow-pass vlan 10 20 99',
            'interface Vlanif10', 'ip address 10.64.10.1 24', 'interface Vlanif20', 'ip address 10.64.20.1 24', 'return', 'display port vlan', 'display vlan', 'save', 'y'],
        alts: [['sys', 'vlan b 10 20 99', 'int g0/0/24', 'port link-type trunk', 'port trunk allow-pass vlan 10 20 99', 'q', 'int g0/0/1', 'port link-type access', 'port default vlan 10', 'q',
            'int g0/0/2', 'port link-type access', 'port default vlan 10', 'q', 'int g0/0/3', 'port link-type access', 'port default vlan 20', 'q', 'int vlanif 10', 'ip add 10.64.10.1 255.255.255.0',
            'int vlanif 20', 'ip add 10.64.20.1 255.255.255.0', 'dis port vlan', 'dis vlan', 'save', 'y']],
        verify: ['display port vlan', 'display vlan', 'display ip interface brief'],
        learn: ['<code>vlan batch 10 20 99</code> toplu VLAN oluşturur.', 'Access: önce <code>port link-type access</code>, sonra <code>port default vlan</code>.', 'Trunk\'ta VLAN\'lar <code>port trunk allow-pass vlan</code> ile açıkça eklenir.', 'Vlanif ağ geçididir; VLAN\'da up port yoksa down kalır.', 'Tipi değiştirmeden önce port varsayılana dönmeli: yoksa <code>Please renew the default configurations</code>.'],
        links: { tool: '#/huawei/vlan', cli: '#/cli/huawei' }, cert: 'HCIA-Datacom (VLAN)'
    },
    // ═══ Seviye 3 ═══════════════════════════════════════════════════════════
    {
        id: 'hua-06', vendor: 'huawei', level: 3, title: 'Statik varsayılan rota ve tek alan OSPF', minutes: 25, kind: 'router', pre: ['hua-03'],
        up: [GE(0), GE(1), GE(2)], hosts: ['203.0.113.1', '10.128.10.10', '10.128.20.10'], peer: R2_PEER,
        start: R1_BASE,
        story: 'Şube router\'ı <b>R1</b> (AR serisi): <code>GE0/0/0</code> internete (ISP ağ geçidi <code>203.0.113.1</code>), <code>GE0/0/1</code> merkezdeki <b>R2</b>\'ye (<code>10.64.0.2/30</code>, router-id <code>10.64.255.2</code>, OSPF alan 0 — R2 hazır), <code>GE0/0/2</code> şube LAN\'ına (<code>10.64.10.0/24</code>) bağlı. Merkez ağları (<code>10.128.10.0/24</code>, <code>10.128.20.0/24</code>) OSPF ile öğrenilecek, internet için varsayılan statik rota kullanılacak.',
        goals: ['Router arayüzüne IP', 'Varsayılan statik rota', 'OSPF süreci, router-id, alan ve network (wildcard)', 'silent-interface ile LAN\'a hello göndermemek', 'Yönlendirme tablosunu okumak (Proto/Pre)'],
        tasks: [
            { t: '<code>GE0/0/1</code>\'e <code>10.64.0.1/30</code> verin.', why: 'R2 ile noktadan noktaya bağlantı; /30 iki kullanılabilir adres verir (.1 ve .2). AR router arayüzleri L3\'tür ve varsayılan açıktır.',
              hints: ['Arayüz görünümünde ip address.', '<code>interface g0/0/1</code> → <code>ip address 10.64.0.1 30</code>'], steps: ['system-view', 'interface g0/0/1', 'ip address 10.64.0.1 30'],
              check: s => ifc(s, 1).ip === '10.64.0.1' && ifc(s, 1).mask === '255.255.255.252' },
            { t: 'İnternet için varsayılan rota yazın: next-hop <code>203.0.113.1</code>.',
              why: '<code>ip route-static 0.0.0.0 0.0.0.0 &lt;next-hop&gt;</code> (maske yerine <code>0</code> da yazılabilir). Statik rotanın önceliği (preference) varsayılan <b>60</b>; OSPF iç rotaları <b>10</b>. Küçük değer kazanır.',
              hints: ['ip route-static, hedef 0.0.0.0/0.', '<code>ip route-static 0.0.0.0 0.0.0.0 203.0.113.1</code>'], steps: ['system-view', 'ip route-static 0.0.0.0 0.0.0.0 203.0.113.1'],
              check: s => s.model.routes.some(r => r.net === '0.0.0.0' && r.len === 0 && r.nh === '203.0.113.1'),
              fb: s => s.model.routes.some(r => r.len === 0 && r.nh !== '203.0.113.1') ? 'Varsayılan rotanın next-hop\'u ISP ağ geçidi 203.0.113.1 olmalı.' : null },
            { t: 'OSPF süreci 1\'i router-id <code>10.64.255.1</code> ile başlatın ve R2 bağlantısını (<code>10.64.0.0/30</code>) <b>alan 0</b>\'a ekleyin. Komşuluk <b>Full</b> olmalı.',
              why: 'VRP\'de <code>network</code> komutu alan görünümünde yazılır ve <b>wildcard</b> ister: /30 için <code>0.0.0.3</code>. Arayüz adresi bu aralığa düşerse OSPF o arayüzde çalışır. İki uç aynı alanda ve aynı alt ağda olmalı, router-id\'ler farklı olmalı.',
              hints: ['ospf 1 router-id … → area 0 → network … wildcard.', '<code>ospf 1 router-id 10.64.255.1</code> → <code>area 0</code> → <code>network 10.64.0.0 0.0.0.3</code>'],
              steps: ['system-view', 'ospf 1 router-id 10.64.255.1', 'area 0', 'network 10.64.0.0 0.0.0.3'], needs: [0],
              check: s => { const p = s.peer(); return !!p && p.state === 'Full' && s.model.ospf[1] && s.model.ospf[1].rid === '10.64.255.1'; },
              fb: s => { if (!s.model.ospf[1]) return null; const n = Object.entries(s.model.ospf[1].areas); if (n.some(([a, l]) => a !== '0.0.0.0' && l.some(x => x.n.startsWith('10.64.0.')))) return 'R2 bağlantısı alan 0 dışında bir alana eklenmiş.'; return s.peer() ? null : 'Komşuluk yok: network/wildcard arayüz adresini (10.64.0.1) kapsıyor mu?'; } },
            { t: 'Şube LAN\'ını (<code>10.64.10.0/24</code>) OSPF alan 0\'a ekleyin ama LAN arayüzünden <b>hello gönderilmesin</b>.',
              why: 'LAN ağı OSPF ile duyurulmalı ki merkez şubeye ulaşsın; ama LAN\'da OSPF konuşacak router yok. <code>silent-interface</code> arayüzün ağını duyurur ama hello göndermez: gereksiz trafik ve sahte komşu riskini önler.',
              hints: ['OSPF görünümünde silent-interface, alan görünümünde network.', '<code>ospf 1</code> → <code>silent-interface g0/0/2</code> → <code>area 0</code> → <code>network 10.64.10.0 0.0.0.255</code>'],
              steps: ['system-view', 'ospf 1 router-id 10.64.255.1', 'silent-interface g0/0/2', 'area 0', 'network 10.64.10.0 0.0.0.255'],
              check: s => { const o = s.model.ospf[1]; return !!o && o.silent.includes(GE(2)) && (o.areas['0.0.0.0'] || []).some(x => x.n === '10.64.10.0' && x.w === '0.0.0.255'); },
              fb: s => { const o = s.model.ospf[1]; return o && (o.areas['0.0.0.0'] || []).some(x => x.n === '10.64.10.0') && !o.silent.includes(GE(2)) ? 'LAN ağı eklendi; şimdi OSPF görünümünde <code>silent-interface g0/0/2</code>.' : null; } },
            { t: 'Doğrulayın: komşu tablosunu ve yönlendirme tablosunu görüntüleyin. Merkez ağları <b>OSPF</b> olarak görünmeli.',
              why: '<code>display ospf peer brief</code> komşunun durumunu (Full), <code>display ip routing-table</code> öğrenilen rotaları gösterir: <b>Proto</b> sütunu kaynağı (Direct/Static/OSPF), <b>Pre</b> önceliği, <b>Cost</b> maliyeti verir.',
              hints: ['İki display komutu.', '<code>display ospf peer brief</code> · <code>display ip routing-table</code>'], steps: ['display ospf peer brief', 'display ip routing-table'], needs: [0, 2],
              check: s => s.ev.ran(/^display ospf peer brief$/) && s.ev.ran(/^display ip routing-table$/) && s.rib().some(r => r.proto === 'OSPF' && r.net === '10.128.10.0') },
            { t: 'Yönlendirme tablosunda <code>10.128.10.0/24</code> satırı hangi protokolden geliyor ve önceliği (Pre) kaç?',
              ask: { choices: [['ospf10', 'OSPF, Pre 10'], ['static60', 'Static, Pre 60'], ['direct0', 'Direct, Pre 0'], ['ospf150', 'OSPF, Pre 150']], correct: 'ospf10' },
              why: 'VRP\'de varsayılan öncelikler: Direct 0, OSPF (iç) 10, Static 60, OSPF ASE (dış) 150. Aynı hedefe birden çok kaynak varsa küçük Pre kazanır.',
              hints: ['Satırdaki Proto ve Pre sütunlarına bakın.', 'OSPF iç rotalarının varsayılan önceliği ile karşılaştırın.'] },
            { t: 'Yapılandırmayı kaydedin.', why: 'Rota ve OSPF ayarları kaydedilmezse yeniden başlatmada şube merkezden kopar.',
              hints: ['save', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [0, 1, 2, 3],
              check: s => s.saved() && doneUpTo(s, 'hua-06', 4) },
        ],
        solution: ['system-view', 'interface g0/0/1', 'ip address 10.64.0.1 30', 'quit', 'ip route-static 0.0.0.0 0.0.0.0 203.0.113.1', 'ospf 1 router-id 10.64.255.1', 'silent-interface g0/0/2',
            'area 0', 'network 10.64.0.0 0.0.0.3', 'network 10.64.10.0 0.0.0.255', 'return', 'display ospf peer brief', 'display ip routing-table', { answer: 5, v: 'ospf10' }, 'save', 'y'],
        alts: [['sys', 'int g0/0/1', 'ip add 10.64.0.1 255.255.255.252', 'q', 'ip route-static 0.0.0.0 0 203.0.113.1', 'ospf 1 router-id 10.64.255.1', 'area 0.0.0.0', 'network 10.64.0.0 0.0.0.3',
            'network 10.64.10.0 0.0.0.255', 'q', 'silent-interface GigabitEthernet0/0/2', 'dis ospf peer brief', 'dis ip routing-table', { answer: 5, v: 'ospf10' }, 'save', 'y']],
        verify: ['display ospf peer brief', 'display ip routing-table', 'ping 10.128.10.10'],
        learn: ['<code>ip route-static 0.0.0.0 0.0.0.0 &lt;nh&gt;</code> varsayılan rota; Pre 60.', '<code>ospf 1 router-id …</code> → <code>area 0</code> → <code>network &lt;ağ&gt; &lt;wildcard&gt;</code>.', 'OSPF iç rotası Pre 10 ile statikten önce gelir.', '<code>silent-interface</code> ağı duyurur, hello göndermez.'],
        links: { tool: '#/huawei/ospf', cli: '#/cli/huawei', wizard: '#/troubleshoot/huawei/2' }, cert: 'HCIA-Datacom (statik rota, OSPF)'
    },
    // ═══ Seviye 4 ═══════════════════════════════════════════════════════════
    {
        id: 'hua-07', vendor: 'huawei', level: 4, title: 'Gelişmiş ACL ve traffic-filter', minutes: 20, kind: 'router', pre: ['hua-06'],
        up: [GE(1), GE(2)],
        start: ['sysname R1', 'interface g0/0/1', 'ip address 10.64.99.1 255.255.255.0', 'quit', 'interface g0/0/2', 'ip address 10.64.20.1 255.255.255.0', 'quit'],
        story: 'R1\'de <code>GE0/0/2</code> misafir/eğitim ağına (<code>10.64.20.0/24</code>), <code>GE0/0/1</code> sunucu ağına (<code>10.64.99.0/24</code>) bağlı. Güvenlik ekibi istiyor: misafir ağı, yönetim sunucusu <code>10.64.99.10</code>\'a <b>Telnet (23) ve SSH (22) ile bağlanamasın</b>; web (443) ve diğer trafik serbest kalsın. Filtre, trafik router\'a <b>girerken</b> misafir arayüzünde uygulanacak.',
        goals: ['Gelişmiş ACL (3000–3999): protokol, kaynak, hedef, port', 'Kural numarası ve adım (step 5)', 'traffic-filter inbound ile arayüze uygulama', 'VRP traffic-filter\'da eşleşmeyen trafiğin kaderi'],
        tasks: [
            { t: 'ACL 3000\'de ilk kural: <code>10.64.20.0/24</code>\'ten <code>10.64.99.10</code>\'a <b>TCP 23</b> (Telnet) reddedilsin.',
              why: 'Gelişmiş ACL (3000–3999) kaynak + hedef + protokol + port ile eşleşir. Wildcard\'da <code>0.0.0.255</code> = /24, tek host için <code>0</code>. Kural numarası yazmazsanız VRP 5, 10, 15… diye (step 5) numaralar.',
              hints: ['acl 3000 görünümünde rule deny tcp …', '<code>acl 3000</code> → <code>rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 23</code>'],
              steps: ['system-view', 'acl 3000', 'rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 23'],
              check: s => s.aclEval(3000, F.tel) === 'deny' && s.aclEval(3000, F.web) !== 'deny',
              fb: s => s.aclEval(3000, F.web) === 'deny' ? 'Kural çok geniş: web (443) de reddediliyor. Port ve hedefi daraltın.' : null },
            { t: 'Aynı ACL\'ye ikinci kural: aynı kaynak ve hedef için <b>TCP 22</b> (SSH) reddedilsin.',
              why: 'Her port için ayrı kural yazılır. Sıralama önemlidir: VRP kuralları numara sırasıyla dener, ilk eşleşen kazanır.',
              hints: ['İkinci rule deny tcp, port 22.', '<code>rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 22</code>'],
              steps: ['system-view', 'acl 3000', 'rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 22'],
              check: s => s.aclEval(3000, F.ssh) === 'deny' && s.aclEval(3000, F.adm) !== 'deny',
              fb: s => s.aclEval(3000, F.adm) === 'deny' ? 'Yönetici ağından (10.64.10.0/24) gelen SSH de reddediliyor: kaynak yalnız 10.64.20.0/24 olmalı.' : null },
            { t: 'ACL 3000\'i misafir arayüzü <code>GE0/0/2</code>\'ye <b>gelen yönde</b> uygulayın.',
              why: 'Trafik misafir ağından router\'a <code>GE0/0/2</code>\'den <b>girer</b>: <code>traffic-filter inbound</code>. Outbound yazarsanız filtre yalnız bu arayüzden <i>çıkan</i> trafiğe bakar; misafirin sunucuya giden trafiği hiç eşleşmez.',
              hints: ['Arayüz görünümünde traffic-filter.', '<code>interface g0/0/2</code> → <code>traffic-filter inbound acl 3000</code>'], steps: ['system-view', 'interface g0/0/2', 'traffic-filter inbound acl 3000'],
              check: s => ifc(s, 2).tfIn === 3000,
              fb: s => ifc(s, 2).tfOut === 3000 ? 'Filtre outbound yönde: misafirden gelen trafik bu arayüze <b>giriyor</b>, inbound olmalı.' : (ifc(s, 1).tfIn === 3000 ? 'Filtre sunucu arayüzünde (GE0/0/1): misafir trafiği GE0/0/2\'den girer.' : null) },
            { t: 'Doğrulayın: ACL kurallarını ve arayüzlere uygulanan filtreleri gösteren iki komutu çalıştırın.',
              why: '<code>display acl 3000</code> kuralları numaralarıyla gösterir (80 → www, 23 → telnet gibi port adlarıyla). <code>display traffic-filter applied-record</code> hangi ACL\'nin hangi arayüzde, hangi yönde uygulandığını listeler.',
              hints: ['display acl … ve display traffic-filter …', '<code>display acl 3000</code> · <code>display traffic-filter applied-record</code>'], steps: ['display acl 3000', 'display traffic-filter applied-record'], needs: [0, 1, 2],
              check: s => s.ev.ran(/^display acl 3000$/) && s.ev.ran(/^display traffic-filter applied-record$/) && s.decide(F.tel) === 'deny' && s.decide(F.ssh) === 'deny' && s.decide(F.web) === 'permit' },
            { t: 'Misafir istemcisi <code>10.64.20.25</code>, <code>10.64.99.10:443</code>\'e bağlanırsa ne olur? (ACL\'de <code>permit</code> kuralı yok.)',
              ask: { choices: [['permit', 'Geçer: traffic-filter\'da hiçbir kurala uymayan trafik izinlidir'], ['deny', 'Reddedilir: ACL sonunda örtük "deny any" vardır'], ['log', 'Geçer ama loglanır']], correct: 'permit' },
              why: 'Huawei <code>traffic-filter</code>\'da ACL\'deki hiçbir kurala uymayan paket <b>izin</b> alır (Cisco arayüz ACL\'sindeki örtük "deny"den farklı). Bu yüzden "yalnız şunlar geçsin" politikası için sona açıkça <code>rule deny ip</code> eklenir.',
              hints: ['443 için bir kural var mı?', 'Kurala uymayan paket için VRP traffic-filter varsayılanı nedir?'] },
            { t: 'Yapılandırmayı kaydedin.', why: 'Kaydedilmeyen güvenlik kuralı, yeniden başlatmadan sonra sessizce kaybolur — en tehlikeli "çalışıyordu" senaryosu.',
              hints: ['save', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [0, 1, 2],
              check: s => s.saved() && doneUpTo(s, 'hua-07', 3) },
        ],
        solution: ['system-view', 'acl 3000', 'rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 23', 'rule deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 22',
            'quit', 'interface g0/0/2', 'traffic-filter inbound acl 3000', 'return', 'display acl 3000', 'display traffic-filter applied-record', { answer: 4, v: 'permit' }, 'save', 'y'],
        alts: [['sys', 'acl number 3000', 'rule 5 deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 23', 'rule 10 deny tcp source 10.64.20.0 0.0.0.255 destination 10.64.99.10 0 destination-port eq 22',
            'rule 100 permit ip', 'int g0/0/2', 'traffic-filter inbound acl 3000', 'dis acl 3000', 'dis traffic-filter applied-record', { answer: 4, v: 'permit' }, 'save', 'y']],
        verify: ['display acl 3000', 'display traffic-filter applied-record', 'display this (GE0/0/2 görünümünde)'],
        learn: ['Gelişmiş ACL: <code>rule deny tcp source … destination … destination-port eq …</code>.', 'Kural numarası verilmezse step 5 ile artar.', '<code>traffic-filter inbound</code>: trafik arayüze <b>girerken</b>.', 'traffic-filter\'da eşleşmeyen trafik izinlidir; "yalnız izinliler" için sona <code>rule deny ip</code>.'],
        links: { tool: '#/huawei/acl', cli: '#/cli/huawei' }, cert: 'HCIA-Datacom (ACL)'
    },
    // ═══ Seviye 5 — arıza ══════════════════════════════════════════════════
    {
        id: 'hua-40', vendor: 'huawei', level: 5, title: 'Arıza: VLAN 20 kullanıcısı ağ geçidine ulaşamıyor', minutes: 20, kind: 'switch', pre: ['hua-03'],
        up: [GE(1), GE(5), GE(24)], start: HUA40_BASE, startSaved: false,
        variants: [
            { key: 'allowpass', start: H40_TRUNK('10 99').concat(H40_USER(20)) },
            { key: 'pvid', start: H40_TRUNK('10 20 99').concat(H40_USER(10)) },
            { key: 'linktype', start: H40_TRUNK('10 20 99') },
            { key: 'shutdown', start: H40_TRUNK('10 20 99').concat(H40_USER(20), ['interface g0/0/24', 'shutdown', 'quit']) },
        ],
        story: '<b>Arıza kaydı:</b> "3. kattaki üretim bilgisayarı (<code>GE0/0/5</code>, VLAN 20, 10.64.20.50) ağ geçidine (10.64.20.1, çekirdek switch\'te) ping atamıyor. Aynı kattaki muhasebe (VLAN 10) sorunsuz." Erişim switch\'i <b>SW-KAT2</b>; çekirdeğe uplink <code>GE0/0/24</code> (trunk, VLAN 10/20/99 taşımalı). Çekirdek tarafı doğrulandı. <small>Her turda farklı bir arıza gelir — "Yeni tur" ile tekrar oynayın.</small>',
        goals: ['Belirtiden katmana: port tipi/PVID mi, trunk mı, fiziksel mi?', 'display port vlan ve display interface brief okumak', 'Kök nedeni en az değişiklikle düzeltmek', 'Yanlış "hızlı çözüm"den kaçınmak (allow-pass vlan all)'],
        tasks: [
            { t: 'Kullanıcı portunun ve uplink\'in <b>tip, PVID ve trunk VLAN listesini</b> görün.',
              why: 'L2 arızasında ilk bakılacak tablo: <code>display port vlan</code>. Kullanıcı portu access ve PVID 20 mi? Trunk listesinde 20 var mı? Tek ekranda cevaplar.',
              hints: ['display port …', '<code>display port vlan</code>'], steps: ['display port vlan'],
              check: s => s.ev.ran(/^display port vlan$/) },
            { t: 'Portların <b>fiziksel ve yönetimsel</b> durumuna bakın.',
              why: '<code>display interface brief</code>\'te PHY sütunu <code>*down</code> ise port <code>shutdown</code> ile kapatılmıştır (yönetimsel); <code>down</code> ise kablo/karşı uç. VLAN ayarı doğru olsa bile kapalı uplink her şeyi keser.',
              hints: ['display interface …', '<code>display interface brief</code>'], steps: ['display interface brief'],
              check: s => s.ev.ran(/^display interface brief$/) },
            { t: 'Kök neden hangisi?',
              ask: { choices: [['allowpass', 'Uplink trunk\'ı (GE0/0/24) VLAN 20\'yi geçirmiyor'], ['pvid', 'GE0/0/5 yanlış VLAN\'da (PVID 20 değil)'], ['linktype', 'GE0/0/5 access yapılmamış (hybrid, PVID 1)'], ['shutdown', 'Uplink GE0/0/24 yönetimsel olarak kapalı (*down)']], correct: v => v.key },
              why: 'Okuma anahtarı: trunk listesinde 20 yok → allow-pass · GE0/0/5 access ama PVID ≠ 20 → yanlış VLAN · GE0/0/5 hybrid/PVID 1 → port hiç yapılandırılmamış · PHY <code>*down</code> → shutdown.',
              hints: ['display port vlan: GE0/0/5 ve GE0/0/24 satırları.', 'display interface brief: GE0/0/24\'ün PHY sütunu.'] },
            { t: 'Arızayı <b>en az değişiklikle</b> giderin: VLAN 20 kullanıcısı çekirdeğe ulaşmalı, VLAN 10 ve 99 etkilenmemeli.',
              why: 'Yalnız bozuk parçayı düzeltin. <code>port trunk allow-pass vlan all</code> "çalışır" ama gereksiz tüm VLAN\'ları taşır (yayın trafiği, güvenlik); portu silip baştan yapılandırmak da diğer doğru ayarları riske atar.',
              hints: ['Kök nedene karşılık gelen tek ayar.', 'allow-pass → <code>port trunk allow-pass vlan 20</code> · PVID → <code>port default vlan 20</code> · hybrid → <code>port link-type access</code> + <code>port default vlan 20</code> · kapalı → <code>undo shutdown</code>'],
              steps: v => ['system-view'].concat(({ allowpass: ['interface g0/0/24', 'port trunk allow-pass vlan 20'], pvid: ['interface g0/0/5', 'port default vlan 20'],
                  linktype: ['interface g0/0/5', 'port link-type access', 'port default vlan 20'], shutdown: ['interface g0/0/24', 'undo shutdown'] })[v.key]),
              check: s => vlan20Ok(s) && sideOk(s),
              fb: s => { const up = ifc(s, 24); if (up.allow.length >= 4094) return '<code>allow-pass vlan all</code> sorunu gizler ama gereksiz VLAN\'ları taşır; yalnız 20\'yi ekleyin.'; if (vlan20Ok(s) && !sideOk(s)) return 'VLAN 20 düzeldi ama VLAN 10/99 etkilenmiş.'; return null; } },
            { t: 'Doğrulayın: yalnız VLAN 20\'nin port üyeliğini gösterin (<code>GE0/0/5</code> UT, <code>GE0/0/24</code> TG ve ikisi de (U) olmalı).',
              why: '<code>display vlan 20</code> tek VLAN\'ın üyelerini gösterir: UT = etiketsiz (access), TG = etiketli (trunk), (U)/(D) = port up/down. Düzeltmeden sonra "şimdi olmalı" demek yerine kanıt görün.',
              hints: ['display vlan + VLAN numarası.', '<code>display vlan 20</code>'], steps: ['display vlan 20'], needs: [3],
              check: s => s.ev.ran(/^display vlan 20$/) && vlan20Ok(s) },
            { t: 'Düzeltmeyi kaydedin.', why: 'Kaydedilmeyen düzeltme bir sonraki yeniden başlatmada arızayı geri getirir; kayıt kapatılmadan önce mutlaka save.',
              hints: ['save', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [3],
              check: s => s.saved() && vlan20Ok(s) && sideOk(s) },
        ],
        solution: v => ['display port vlan', 'display interface brief', { answer: 2, v: v.key }].concat(LABS_BY_ID['hua-40'].tasks[3].steps(v), ['return', 'display vlan 20', 'save', 'y']),
        verify: ['display port vlan', 'display interface brief', 'display vlan 20'],
        learn: ['L2 arızasında sıra: display port vlan → display interface brief → display vlan &lt;id&gt;.', 'Trunk\'ta VLAN açıkça izinli olmalı (allow-pass).', 'Access portta PVID = kullanıcının VLAN\'ı.', 'PHY <code>*down</code> = shutdown.', '<code>allow-pass vlan all</code> hızlı ama yanlış çözüm.'],
        links: { tool: '#/huawei/vlan', cli: '#/cli/huawei', wizard: '#/troubleshoot/huawei/0' }, cert: 'HCIA-Datacom (VLAN sorun giderme)'
    },
    {
        id: 'hua-42', vendor: 'huawei', level: 5, title: 'Arıza: OSPF komşuluğu kurulmuyor', minutes: 25, kind: 'router', pre: ['hua-06'],
        up: [GE(0), GE(1), GE(2)], hosts: ['203.0.113.1', '10.128.10.10', '10.128.20.10'], peer: R2_PEER,
        start: R1_BASE.concat(R1_OSPF_OK),
        variants: [
            { key: 'area', start: ['quit', 'area 1', 'network 10.64.0.0 0.0.0.3', 'quit'] },
            { key: 'wildcard', start: ['network 10.64.0.4 0.0.0.3', 'quit'] },
            { key: 'silent', start: ['network 10.64.0.0 0.0.0.3', 'quit', 'silent-interface GigabitEthernet0/0/1', 'quit'] },
            { key: 'ifdown', start: ['network 10.64.0.0 0.0.0.3', 'quit', 'quit', 'interface g0/0/1', 'shutdown', 'quit'] },
        ],
        story: '<b>Arıza kaydı:</b> "Dün akşamki bakımdan sonra şube, merkez sunucularına (10.128.10.0/24) ulaşamıyor; internet çalışıyor." R1\'in merkez tarafı <code>GE0/0/1</code> (10.64.0.1/30), karşıda R2 (10.64.0.2, router-id 10.64.255.2, alan 0 — R2 tarafı doğrulandı). <small>Her turda farklı bir arıza — "Yeni tur".</small>',
        goals: ['Komşu tablosundan başlamak', 'OSPF yapılandırmasını ve arayüz durumunu karşılaştırmak', 'Alan / wildcard / silent-interface / shutdown ayrımı', 'En az değişiklikle düzeltip rotaları doğrulamak'],
        tasks: [
            { t: 'OSPF komşu tablosuna bakın.', why: 'OSPF arızasında ilk soru: komşu var mı, durumu ne? Komşu hiç yoksa sorun hello aşamasında: alan, ağ kapsamı, silent-interface ya da arayüz durumu.',
              hints: ['display ospf peer …', '<code>display ospf peer brief</code>'], steps: ['display ospf peer brief'],
              check: s => s.ev.ran(/^display ospf peer brief$/) },
            { t: 'OSPF yapılandırmasını ve L3 arayüz durumunu inceleyin: çalışan yapılandırmayı <code>ospf</code> satırından itibaren ve IP arayüz özetini görüntüleyin.',
              why: '<code>| begin ospf</code> uzun yapılandırmada doğrudan OSPF bölümüne atlar. <code>display ip interface brief</code> arayüzün adresini ve Physical/Protocol durumunu (<code>*down</code> = shutdown) gösterir. İkisini birlikte okuyun: network satırı arayüz adresini kapsıyor mu, doğru alanda mı, arayüz silent mi, up mı?',
              hints: ['display current-configuration | begin … ve display ip interface brief', '<code>display current-configuration | begin ospf</code> · <code>display ip interface brief</code>'],
              steps: ['display current-configuration | begin ospf', 'display ip interface brief'],
              check: s => s.ev.ran(/^display current-configuration \| b\w* ospf/) && s.ev.ran(/^display ip interface brief$/) },
            { t: 'Kök neden hangisi?',
              ask: { choices: [['area', 'R2 bağlantısı yanlış alanda (alan 1; R2 alan 0)'], ['wildcard', 'network satırı arayüz adresini kapsamıyor (yanlış ağ/wildcard)'], ['silent', 'GE0/0/1 silent-interface: hello gönderilmiyor'], ['ifdown', 'GE0/0/1 yönetimsel olarak kapalı (shutdown)']], correct: v => v.key },
              why: 'Anahtar: <code>area 0.0.0.1</code> altında 10.64.0.0 → alan uyumsuzluğu · network 10.64.0.4 0.0.0.3 → 10.64.0.1\'i kapsamaz · <code>silent-interface GigabitEthernet0/0/1</code> → hello yok · Physical <code>*down</code> → shutdown.',
              hints: ['OSPF bölümündeki area ve network satırlarını arayüz adresiyle karşılaştırın.', 'silent-interface satırı ve arayüzün Physical sütunu.'] },
            { t: 'Arızayı en az değişiklikle giderin: R2 ile komşuluk <b>Full</b> olmalı.',
              why: 'Yalnız bozuk satırı düzeltin: yanlış alandaki network\'ü kaldırıp doğru alana yazmak, yanlış network\'ü düzeltmek, silent-interface\'i geri almak ya da arayüzü açmak. OSPF sürecini silip yeniden kurmak (undo ospf 1) tüm komşulukları düşürür.',
              hints: ['Kök nedene göre tek düzeltme.', 'alan → alan 1\'de <code>undo network …</code>, alan 0\'da <code>network 10.64.0.0 0.0.0.3</code> · wildcard → yanlışı undo, doğrusunu ekle · silent → <code>undo silent-interface g0/0/1</code> · shutdown → <code>undo shutdown</code>'],
              steps: v => ['system-view'].concat(({ area: ['ospf 1', 'area 1', 'undo network 10.64.0.0 0.0.0.3', 'quit', 'area 0', 'network 10.64.0.0 0.0.0.3'],
                  wildcard: ['ospf 1', 'area 0', 'undo network 10.64.0.4 0.0.0.3', 'network 10.64.0.0 0.0.0.3'], silent: ['ospf 1', 'undo silent-interface GigabitEthernet0/0/1'],
                  ifdown: ['interface g0/0/1', 'undo shutdown'] })[v.key]),
              check: s => { const p = s.peer(); return !!p && p.state === 'Full' && !!s.model.ospf[1]; },
              fb: s => !s.model.ospf[1] ? 'OSPF süreci silinmiş: en az değişiklik ilkesine aykırı.' : null },
            { t: 'Merkez ağlarının yönlendirme tablosuna OSPF ile geldiğini doğrulayın.', why: 'Komşuluğun Full olması yetmez; asıl hedef rotaların gelmesi. <code>10.128.10.0/24</code> Proto OSPF, NextHop 10.64.0.2 olmalı.',
              hints: ['display ip routing-table', '<code>display ip routing-table</code>'], steps: ['display ip routing-table'], needs: [3],
              check: s => s.ev.ran(/^display ip routing-table$/) && s.rib().some(r => r.proto === 'OSPF' && r.net === '10.128.10.0') },
            { t: 'Düzeltmeyi kaydedin.', why: 'Kaydedilmeyen düzeltme bir sonraki bakım penceresinde (yeniden başlatma) arızayı geri getirir.',
              hints: ['save', '<code>save</code> → <code>y</code>'], steps: ['save', 'y'], needs: [3],
              check: s => s.saved() && !!s.peer() },
        ],
        solution: v => ['display ospf peer brief', 'display current-configuration | begin ospf', 'display ip interface brief', { answer: 2, v: v.key }].concat(LABS_BY_ID['hua-42'].tasks[3].steps(v), ['return', 'display ip routing-table', 'save', 'y']),
        verify: ['display ospf peer brief', 'display current-configuration | begin ospf', 'display ip routing-table'],
        learn: ['Sıra: display ospf peer brief → yapılandırma + arayüz → düzelt → routing-table.', 'network wildcard\'ı arayüz adresini kapsamalı ve alan iki uçta aynı olmalı.', 'silent-interface komşuluğu engeller: yalnız LAN arayüzlerine.', 'OSPF sürecini silmek "en az değişiklik" değildir.'],
        links: { tool: '#/huawei/ospf', cli: '#/cli/huawei', wizard: '#/troubleshoot/huawei/2' }, cert: 'HCIA-Datacom (OSPF sorun giderme)'
    },
    // ═══ Serbest terminal ══════════════════════════════════════════════════
    { id: 'hua-sandbox-sw', vendor: 'huawei', level: null, sandbox: true, title: 'Serbest terminal — Huawei S5700', kind: 'switch', up: [GE(1), GE(2), GE(3), GE(4), GE(23), GE(24)], peer: { lacp: true },
      story: '24 portlu bir S5700 (GE0/0/1–4, 23, 24 bağlı; karşı uç LACP konuşuyor). Görev yok; <code>system-view</code> ile başlayın, <kbd>?</kbd> ile desteklenen komutları görün. Örnek: <code>vlan batch 10 20</code>, <code>interface eth-trunk 1</code> → <code>mode lacp</code>, <code>display eth-trunk 1</code>.', tasks: [] },
    { id: 'hua-sandbox-rt', vendor: 'huawei', level: null, sandbox: true, title: 'Serbest terminal — Huawei AR router', kind: 'router', up: [GE(0), GE(1), GE(2)], hosts: ['203.0.113.1', '10.128.10.10'], peer: R2_PEER,
      story: 'Üç arayüzlü bir AR router (GE0/0/0–2 bağlı). GE0/0/1 karşısında OSPF konuşan bir komşu var (10.64.0.2/30, alan 0). Örnek: <code>interface g0/0/1</code> → <code>ip address 10.64.0.1 30</code>, <code>ospf 1</code> → <code>area 0</code> → <code>network 10.64.0.0 0.0.0.3</code>, <code>display ospf peer brief</code>.', tasks: [] },
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
    root.CG_LABS = (root.CG_LABS || []).filter(l => l.vendor !== 'huawei').concat(LABS);
})();
