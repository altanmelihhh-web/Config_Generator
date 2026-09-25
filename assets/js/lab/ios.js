'use strict';

// ─── CLI Lab: Cisco IOS benzeri motor (eğitim simülatörü; IOS 15.x görünümü) ───
// Komutlar config METNİNİ değil cihaz modelini değiştirir; show çıktıları modelden
// üretilir. Görev kontrolleri modele ve olay kaydına (ev) bakar.
const CgLabIos = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, padL, isIp, maskLen, sameNet, netOf, ip2n, n2ip, vlanList, vlanCompress, fakeHash } = C;

    // ── Arayüz adları
    const IFT = [['GigabitEthernet', 'Gi'], ['FastEthernet', 'Fa'], ['TenGigabitEthernet', 'Te'], ['Vlan', 'Vl'], ['Loopback', 'Lo'], ['Port-channel', 'Po']];
    const IF_ORDER = ['Loopback', 'Port-channel', 'FastEthernet', 'GigabitEthernet', 'TenGigabitEthernet', 'Vlan'];
    function ifNorm(s) {
        const m = String(s).match(/^([a-z-]+)\s*(\d+(?:\/\d+){0,2})$/i);
        if (!m) return null;
        const p = m[1].toLowerCase();
        const hits = IFT.filter(([f]) => f.toLowerCase().startsWith(p));
        return hits.length === 1 ? hits[0][0] + m[2] : null;
    }
    const ifShort = n => { const t = IFT.find(([f]) => n.startsWith(f)); return t ? t[1] + n.slice(t[0].length) : n; };
    const ifType = n => (IFT.find(([f]) => n.startsWith(f)) || [''])[0];
    const ifNums = n => (n.match(/[\d/]+$/) || [''])[0].split('/').map(Number);
    function ifCmp(a, b) {
        const ta = IF_ORDER.indexOf(ifType(a)), tb = IF_ORDER.indexOf(ifType(b));
        if (ta !== tb) return ta - tb;
        const na = ifNums(a), nb = ifNums(b);
        for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] || 0) !== (nb[i] || 0)) return (na[i] || 0) - (nb[i] || 0);
        return 0;
    }
    const isPhys = n => /^(GigabitEthernet|FastEthernet|TenGigabitEthernet)/.test(n);

    // ── Parola gösterimi
    const XL = 'dsfd;kfoA,.iyewrkldJKDHSUBsgvca69834ncxv9873254k;fg87';
    function type7(pw) {
        const salt = (pw.length * 7) % 16;
        let o = String(salt).padStart(2, '0');
        for (let i = 0; i < pw.length; i++) o += (pw.charCodeAt(i) ^ XL.charCodeAt((salt + i) % XL.length)).toString(16).toUpperCase().padStart(2, '0');
        return o;
    }
    const type9 = pw => '$9$' + fakeHash('s' + pw, 14) + '$' + fakeHash(pw, 43);
    const pwShow = p => p.t7 ? '7 ' + type7(p.pw) : p.pw;

    // ── Türkçe yardım açıklamaları (anahtar kelime → açıklama)
    const KW = {
        enable: 'Ayrıcalıklı (privileged) moda geç', disable: 'Kullanıcı moduna dön', exit: 'Bir üst moda çık / oturumu kapat', logout: 'Oturumu kapat',
        end: 'Doğrudan ayrıcalıklı moda dön (Ctrl+Z)', show: 'Sistem bilgisi göster', configure: 'Yapılandırma moduna gir', terminal: 'Terminalden yapılandır',
        copy: 'Dosya kopyala', write: 'Yapılandırmayı kaydet', memory: 'NVRAM\'e yaz', reload: 'Cihazı yeniden başlat', erase: 'Dosya sil', ping: 'Erişilebilirlik testi',
        'running-config': 'Çalışan (RAM) yapılandırma', 'startup-config': 'Açılış (NVRAM) yapılandırması', version: 'Sistem donanım/yazılım bilgisi', history: 'Komut geçmişi',
        ip: 'IP ayarları', interface: 'Arayüz seç / arayüz bilgisi', interfaces: 'Arayüz bilgileri', brief: 'Kısa özet', vlan: 'VLAN seç / VLAN bilgisi', status: 'Port durum özeti',
        switchport: 'L2 port ayarları', trunk: 'Trunk ayarları / trunk bilgisi', route: 'Statik rota / yönlendirme tablosu', ssh: 'SSH ayarları', do: 'Yapılandırma modundan EXEC komutu çalıştır',
        hostname: 'Cihaz adını ayarla', banner: 'Giriş afişi', motd: 'Günün mesajı afişi', secret: 'Şifrelenmiş (hash) parola', password: 'Parola',
        service: 'Sistem servisleri', 'password-encryption': 'Düz metin parolaları Type 7 ile gizle', username: 'Yerel kullanıcı', privilege: 'Yetki seviyesi',
        'domain-lookup': 'Bilinmeyen kelimeyi DNS ile çözmeyi dene', domain: 'Alan adı ayarları', 'domain-name': 'Alan adı', name: 'Ad ver', lookup: 'DNS çözümleme',
        'default-gateway': 'L2 switch varsayılan ağ geçidi', routing: 'IP yönlendirmeyi aç', crypto: 'Kripto ayarları', key: 'Anahtar işlemleri', generate: 'Anahtar üret',
        rsa: 'RSA anahtar çifti', modulus: 'Anahtar uzunluğu (bit)', 'general-keys': 'Genel amaçlı anahtar', line: 'Konsol/VTY hattı', console: 'Konsol hattı', vty: 'Sanal terminal (Telnet/SSH) hatları',
        login: 'Girişte parola iste', local: 'Yerel kullanıcı veritabanı', transport: 'Hat erişim protokolleri', input: 'Gelen bağlantı protokolleri', logging: 'Log ayarları',
        synchronous: 'Log mesajları yazdığınız satırı bölmesin', 'exec-timeout': 'Boşta kalma zaman aşımı', router: 'Yönlendirme protokolü', ospf: 'OSPF', 'router-id': 'Router kimliği',
        network: 'Protokole ağ ekle', area: 'OSPF alanı', 'passive-interface': 'Arayüzde hello gönderme', description: 'Arayüz açıklaması', shutdown: 'Arayüzü kapat', no: 'Komutu geri al / varsayılana döndür',
        mode: 'Port modu', access: 'Access (tek VLAN) port', voice: 'Ses VLAN\'ı', native: 'Etiketsiz (native) VLAN', allowed: 'İzin verilen VLAN\'lar', add: 'Listeye ekle', remove: 'Listeden çıkar',
        nonegotiate: 'DTP pazarlığını kapat', address: 'IP adresi', speed: 'Hız', duplex: 'Çift yönlülük', 'spanning-tree': 'Spanning Tree ayarları', portfast: 'Kenar port (hemen forwarding)',
        bpduguard: 'BPDU gelirse portu err-disable yap', range: 'Arayüz aralığı', 'ip': 'IP ayarları', default: 'Varsayılan', errdisable: 'err-disable ayarları', recovery: 'Otomatik kurtarma',
        cause: 'Kurtarma nedeni', include: 'Eşleşen satırlar', exclude: 'Eşleşmeyen satırlar', begin: 'Eşleşmeden itibaren', section: 'Eşleşen bölümler', 'time-out': 'Zaman aşımı', 'authentication-retries': 'Deneme sayısı',
        'extend': 'Genişletilmiş sistem kimliği', 'access-list': 'Numaralı erişim listesi', 'access-lists': 'Erişim listeleri', 'access-group': 'Arayüze ACL uygula', standard: 'Standart ACL (yalnız kaynak)', extended: 'Genişletilmiş ACL',
        dhcp: 'DHCP', 'excluded-address': 'Havuzdan hariç adresler', pool: 'DHCP havuzu', 'default-router': 'İstemcilere verilecek ağ geçidi', 'dns-server': 'DNS sunucusu', lease: 'Kira süresi', 'helper-address': 'DHCP relay: istekleri sunucuya ilet', binding: 'Dağıtılan adresler', conflict: 'Çakışan adresler',
        'port-security': 'Port güvenliği', maximum: 'En fazla', violation: 'İhlal eylemi', sticky: 'Öğrenilen MAC\'i config\'e yapıştır', 'mac-address': 'MAC adresi', 'address-table': 'MAC adres tablosu', 'aging-time': 'Yaşlanma süresi', count: 'Sayım', archive: 'Otomatik yapılandırma arşivi', 'write-memory': 'Her kaydetmede arşivle', 'time-period': 'Periyodik arşiv (dk)', replace: 'Yapılandırmayı dosyayla değiştir', dir: 'Dosya listesi',
        aaa: 'AAA (kimlik doğrulama, yetkilendirme, kayıt)', 'new-model': 'AAA\'yı etkinleştir', authentication: 'Kimlik doğrulama', authorization: 'Yetkilendirme', accounting: 'Kayıt (accounting)', group: 'Sunucu grubu', 'tacacs+': 'TACACS+ sunucuları', radius: 'RADIUS', tacacs: 'TACACS+', server: 'Sunucu', address: 'Adres', ipv4: 'IPv4 adresi', test: 'Test', algorithm: 'Algoritma listesi', encryption: 'Şifreleme', kex: 'Anahtar değişimi', hostkey: 'Sunucu anahtarı', http: 'HTTP (web) sunucusu', 'secure-server': 'HTTPS sunucusu', dh: 'Diffie-Hellman',
        permit: 'İzin ver', deny: 'Engelle', remark: 'Açıklama satırı', nat: 'NAT', inside: 'İç (NAT inside)', outside: 'Dış (NAT outside)', source: 'Kaynak', list: 'ACL ile', overload: 'PAT (port çevirme)', static: 'Statik', translations: 'Çeviri tablosu', statistics: 'İstatistik', translation: 'Çeviri', connected: 'Bağlı ağlar',
        errdisable: 'err-disable', 'err-disabled': 'err-disable portlar', clear: 'Temizle', in: 'Giriş yönü', out: 'Çıkış yönü', 'rapid-pvst': 'Rapid PVST+', pvst: 'PVST+', mst: 'MST', trunk_: '', users: 'Oturumlar', clock: 'Saat', length: 'Sayfa uzunluğu'
    };
    const VARH = { 'A.B.C.D': 'IP adresi / maske', WORD: 'Kelime', LINE: 'Metin', IFNAME: 'Arayüz (ör. GigabitEthernet0/1, g0/1)', VLIST: 'VLAN listesi (ör. 10,20-30)', HOP: 'Next-hop IP adresi veya arayüz' };

    // ── SSH algoritmaları (IOS-XE 16/17 adları; varsayılan listede zayıf CBC/SHA1 bulunur)
    const SSH_ALG = {
        encryption: { all: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-gcm', 'aes256-gcm', 'aes128-cbc', 'aes192-cbc', 'aes256-cbc', '3des-cbc'], def: ['aes128-ctr', 'aes192-ctr', 'aes256-ctr', 'aes128-cbc', '3des-cbc', 'aes192-cbc', 'aes256-cbc'], weak: /cbc/ },
        mac: { all: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-sha1-96', 'hmac-sha2-256-etm@openssh.com', 'hmac-sha2-512-etm@openssh.com'], def: ['hmac-sha2-256', 'hmac-sha2-512', 'hmac-sha1', 'hmac-sha1-96'], weak: /sha1/ },
        kex: { all: ['diffie-hellman-group-exchange-sha1', 'diffie-hellman-group14-sha1', 'diffie-hellman-group14-sha256', 'diffie-hellman-group16-sha512', 'ecdh-sha2-nistp256', 'ecdh-sha2-nistp384', 'ecdh-sha2-nistp521'], def: ['diffie-hellman-group-exchange-sha1', 'diffie-hellman-group14-sha1'], weak: /sha1/ },
        hostkey: { all: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'], def: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa'], weak: /^ssh-rsa$/ },
    };

    // ── Varsayılan cihaz modeli
    function newIf(sw, name) {
        return { desc: '', shutdown: !sw && isPhys(name), mode: null, accessVlan: 1, voiceVlan: null, native: 1, allowed: null,
            nonegotiate: false, ip: null, mask: null, portfast: false, bpduguard: false, speed: 'auto', duplex: 'auto', errdis: false, errReason: null, accessIn: null, accessOut: null, nat: null,
            helpers: [], ps: null };
    }
    function baseModel(lab) {
        const sw = lab.kind !== 'router';
        const m = {
            sw, hostname: lab.hostname || (sw ? 'Switch' : 'Router'), defHost: sw ? 'Switch' : 'Router',
            enableSecret: null, enablePassword: null, servicePwEnc: false, domainLookup: true, domain: null,
            users: {}, banner: null, rsa: 0, sshVer: null, sshTimeout: 120, sshRetries: 3,
            ifs: {}, vlans: sw ? { 1: 'default' } : {}, stpMode: 'pvst', portfastDefault: false, bpduguardDefault: false,
            errRecovery: { bpduguard: false, interval: 300 }, ipRouting: !sw, defaultGw: null, routes: [],
            lines: { con: { pw: null, login: false, logsync: false, timeout: null }, vty: { '0 4': { pw: null, login: 'login', transport: null, timeout: null, acl: null }, '5 15': { pw: null, login: 'login', transport: null, timeout: null, acl: null } } },
            ospf: {}, links: {}, acls: {}, nat: [],
            aaaNew: false, tacacs: {}, radius: {}, sgroups: {}, authn: {}, authz: {}, acct: {}, tacSrc: null, radSrc: null,
            http: false, https: false, httpAuth: null, sshAlg: {}, sshDhMin: null,
            dhcpExcl: [], dhcpPools: {}, macStatic: [], macAging: 300, archive: null
        };
        for (const n of lab.ifaces || (sw ? range('GigabitEthernet0/', 1, 24) : range('GigabitEthernet0/', 0, 2))) m.ifs[n] = newIf(sw, n);
        if (sw) m.ifs.Vlan1 = newIf(sw, 'Vlan1');
        for (const n of lab.up || []) m.links[n] = true;
        return m;
    }
    const range = (p, a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(p + i); return r; };
    const clone = o => JSON.parse(JSON.stringify(o));

    // ═══ Oturum ═══════════════════════════════════════════════════════════════
    function session(lab, opts) {
        // Varyant: lab.variants[i] → start komutları ve sim verisi birleşir (fortios.js ile aynı sözleşme)
        const VAR = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        if (VAR) lab = Object.assign({}, lab, { start: (lab.start || []).concat(VAR.start || []), sim: Object.assign({}, lab.sim || {}, VAR.sim || {}) });
        const S = {
            lab, m: baseModel(lab), mode: 'user', ctx: [], vctx: [], startup: null, pending: null,
            ev: [], hist: [], loggedOut: false, arp: {}
        };
        const ctx = {
            ifNorm,
            ifValid: n => {
                if (S.m.ifs[n]) return true;
                const t = ifType(n), num = ifNums(n);
                if (t === 'Loopback') return num.length === 1 && num[0] <= 2147483647;
                if (t === 'Port-channel') return num.length === 1 && num[0] >= 1 && num[0] <= 48;
                if (t === 'Vlan') return S.m.sw && num.length === 1 && num[0] >= 1 && num[0] <= 4094;
                return false;
            }
        };
        const M = () => S.m;
        const log = (o) => { S.ev.push(o); };

        // ── yardımcı işlemler
        const secsIf = () => S.ctx.map(n => S.m.ifs[n]);
        function ensureIf(n) { if (!S.m.ifs[n]) S.m.ifs[n] = newIf(S.m.sw, n); return S.m.ifs[n]; }
        function vtyBlocks() { return Object.keys(S.m.lines.vty); }

        // ═══ Komut tanımları ═════════════════════════════════════════════════
        const X = C.build;
        const SHOW = [
            { p: 'show version', h: KW.version, run: showVersion },
            { p: 'show history', run: () => S.hist.slice(-10).map(x => '  ' + x).join('\n') },
            { p: 'show ip interface brief', run: showIpIntBrief },
            { p: 'show vlan brief', sw: 1, run: showVlanBrief },
            { p: 'show vlan', sw: 1, run: showVlanBrief },
            { p: 'show interfaces status', sw: 1, run: showIntStatus },
            { p: 'show clock', run: () => '*' + new Date().toTimeString().slice(0, 8) + '.000 UTC ' + new Date().toDateString() },
        ];
        const SHOW_PRIV = [
            { p: 'show running-config', run: () => runText(true) },
            { p: 'show startup-config', run: () => S.startup ? 'Using ' + startText().length + ' out of 65536 bytes\n' + startText() : 'startup-config is not present' },
            { p: 'show ip route', run: () => showIpRoute() },
            { p: 'show ip route static', run: () => showIpRoute('static') },
            { p: 'show ip route connected', run: () => showIpRoute('connected') },
            { p: 'show ip route A.B.C.D$ip', run: (a) => showRouteFor(a.ip) },
            { p: 'show interfaces IFNAME$if', run: (a) => showIfDetail(a.if) },
            { p: 'show interfaces status err-disabled', sw: 1, run: showErrDis },
            { p: 'show errdisable recovery', sw: 1, run: showErrRec },
            { p: 'show interfaces trunk', sw: 1, run: showIntTrunk },
            { p: 'show interfaces IFNAME$if switchport', sw: 1, run: (a) => showIfSwitchport(a.if) },
            { p: 'show ip ssh', run: showIpSsh },
            { p: 'show aaa servers', run: showAaaServers },
            { p: 'show ip dhcp pool', run: showDhcpPool },
            { p: 'show ip dhcp binding', run: showDhcpBinding },
            { p: 'show ip dhcp conflict', run: () => 'IP address        Detection method   Detection time          VRF' },
            { p: 'show port-security', sw: 1, run: showPsec },
            { p: 'show port-security interface IFNAME$i', sw: 1, run: (a) => showPsecIf(a.i) },
            { p: 'show port-security address', sw: 1, run: showPsecAddr },
            { p: 'show mac address-table', sw: 1, run: () => showMac({}) },
            { p: 'show mac address-table dynamic', sw: 1, run: () => showMac({ type: 'DYNAMIC' }) },
            { p: 'show mac address-table static', sw: 1, run: () => showMac({ type: 'STATIC' }) },
            { p: 'show mac address-table interface IFNAME$i', sw: 1, run: (a) => showMac({ port: a.i }) },
            { p: 'show mac address-table address WORD$m', sw: 1, run: (a) => showMac({ mac: a.m.toLowerCase() }) },
            { p: 'show mac address-table count', sw: 1, run: () => showMacCount() },
            { p: 'show mac address-table aging-time', sw: 1, run: () => 'Global Aging Time:  ' + M().macAging + '\nVlan    Aging Time\n----    ----------' },
            { p: 'show archive', run: showArchive },
            { p: 'show interfaces description', run: showIfDesc },
            { p: 'show ip http server status', run: () => ['HTTP server status: ' + (M().http ? 'Enabled' : 'Disabled'), 'HTTP server port: 80', 'HTTP server active supplementary listener ports: ', 'HTTP server authentication method: ' + (M().httpAuth || 'enable'), 'HTTP secure server capability: Present', 'HTTP secure server status: ' + (M().https ? 'Enabled' : 'Disabled'), 'HTTP secure server port: 443'].join('\n') },
            { p: 'test aaa group WORD$g WORD$u LINE$r', run: (a) => testAaa(a) },
            { p: 'show access-lists', run: () => showAcls() },
            { p: 'show access-lists WORD$n', run: (a) => showAcls(a.n) },
            { p: 'show ip access-lists', run: () => showAcls() },
            { p: 'show ip access-lists WORD$n', run: (a) => showAcls(a.n) },
            { p: 'show ip nat translations', run: natTrans },
            { p: 'show ip nat statistics', run: natStats },
            { p: 'show ip interface IFNAME$if', run: (a) => showIpInterface(a.if) },
        ];
        const EXEC_USER = X([
            { p: 'enable', run: cmdEnable },
            { p: 'exit', run: cmdLogout }, { p: 'logout', run: cmdLogout },
            { p: 'ping A.B.C.D$ip', run: (a) => ping(a.ip) },
            { p: 'terminal length (0-512)', run: () => '' },
        ].concat(SHOW));
        const EXEC_PRIV = X([
            { p: 'enable', run: () => '' },
            { p: 'disable', run: () => { S.mode = 'user'; return ''; } },
            { p: 'exit', run: cmdLogout }, { p: 'logout', run: cmdLogout },
            { p: 'configure terminal', run: () => { S.mode = 'config'; return 'Enter configuration commands, one per line.  End with CNTL/Z.'; } },
            { p: 'copy running-config startup-config', run: () => { S.pending = { prompt: 'Destination filename [startup-config]? ', fn: () => { save(); return 'Building configuration...\n[OK]'; } }; return ''; } },
            { p: 'write memory', run: () => { save(); return 'Building configuration...\n[OK]'; } },
            { p: 'write', run: () => { save(); return 'Building configuration...\n[OK]'; } },
            { p: 'erase startup-config', run: () => { S.pending = { prompt: 'Erasing the nvram filesystem will remove all configuration files! Continue? [confirm]', fn: (x) => { if (/^n/i.test(x)) return ''; S.startup = null; return '[OK]\nErase of nvram: complete'; } }; return ''; } },
            { p: 'reload', run: cmdReload },
            { p: 'ping A.B.C.D$ip', run: (a) => ping(a.ip) },
            { p: 'terminal length (0-512)', run: () => '' },
            { p: 'clear ip nat translation *', run: () => '' },
            { p: 'clear mac address-table dynamic', sw: 1, run: () => { S.macHide = '*'; log({ macclear: '*' }); return ''; } },
            { p: 'clear mac address-table dynamic interface IFNAME$i', sw: 1, run: (a) => { S.macHide = a.i; log({ macclear: a.i }); return ''; } },
            { p: 'clear ip dhcp binding *', run: () => '' },
            { p: 'copy running-config WORD$f', run: (a) => /^flash:\S+$/.test(a.f) ? copyFlash(a.f) : { err: 'invalid', col: 19 } },
            { p: 'copy running-config tftp:', run: () => copyTftp() },
            { p: 'dir flash:', run: () => dirFlash() },
            { p: 'configure replace WORD$f', run: (a) => /^flash:\S+$/.test(a.f) ? cfgReplace(a.f) : { err: 'invalid', col: 18 } },
        ].concat(SHOW, SHOW_PRIV));

        const COMMON = [
            { p: 'exit', run: () => { S.mode = S.mode === 'config' ? 'priv' : 'config'; S.ctx = []; return ''; }, neg: false },
            { p: 'end', run: () => { S.mode = 'priv'; S.ctx = []; return ''; }, neg: false },
            { p: 'do LINE$c', run: (a) => execDo(a.c), neg: false },
        ];
        const CONFIG = X([
            { p: 'hostname !WORD$n', run: (a) => { if (!/^[a-z][a-z0-9-]{0,62}$/i.test(a.n)) return '% Hostname contains one or more illegal characters.'; M().hostname = a.n; }, no: () => { M().hostname = M().defHost; } },
            { p: 'enable secret !LINE$pw', run: (a) => { M().enableSecret = a.pw; if (M().enablePassword) return ''; }, no: () => { M().enableSecret = null; } },
            { p: 'enable password !LINE$pw', run: (a) => { M().enablePassword = { pw: a.pw, t7: M().servicePwEnc }; if (M().enableSecret && M().enableSecret === a.pw) return 'The enable password you have chosen is the same as your enable secret.\nThis is not recommended.  Re-enter the enable password.'; }, no: () => { M().enablePassword = null; } },
            { p: 'service password-encryption', run: () => { M().servicePwEnc = true; encAll(); }, no: () => { M().servicePwEnc = false; } },
            { p: 'banner motd !LINE$t', run: (a) => bannerCmd(a.t), no: () => { M().banner = null; } },
            { p: 'ip domain-lookup', run: () => { M().domainLookup = true; }, no: () => { M().domainLookup = false; } },
            { p: 'ip domain lookup', run: () => { M().domainLookup = true; }, no: () => { M().domainLookup = false; } },
            { p: 'ip domain name !WORD$d', run: (a) => { M().domain = a.d; }, no: () => { M().domain = null; } },
            { p: 'ip domain-name !WORD$d', run: (a) => { M().domain = a.d; }, no: () => { M().domain = null; } },
            { p: 'ip default-gateway !A.B.C.D$gw', sw: 1, run: (a) => { M().defaultGw = a.gw; }, no: () => { M().defaultGw = null; } },
            { p: 'ip routing', run: () => { M().ipRouting = true; }, no: () => { M().ipRouting = false; } },
            { p: 'ip route A.B.C.D$net MASK$mask !HOP$nh [(1-255)$ad]', run: routeAdd, no: routeDel },
            { p: 'ip ssh version !(1-2)$v', run: (a) => { M().sshVer = a.v; if (!M().rsa) return 'Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).'; }, no: () => { M().sshVer = null; } },
            { p: 'ip ssh time-out !(1-120)$t', run: (a) => { M().sshTimeout = a.t; }, no: () => { M().sshTimeout = 120; } },
            { p: 'ip ssh authentication-retries !(0-5)$n', run: (a) => { M().sshRetries = a.n; }, no: () => { M().sshRetries = 3; } },
            { p: 'crypto key generate rsa modulus (360-4096)$b', run: (a) => rsaGen(a.b), neg: false },
            { p: 'crypto key generate rsa general-keys modulus (360-4096)$b', run: (a) => rsaGen(a.b), neg: false },
            { p: 'username WORD$u privilege (0-15)$p secret LINE$pw', run: (a) => { M().users[a.u] = { priv: a.p, secret: a.pw }; }, neg: false },
            { p: 'username WORD$u secret LINE$pw', run: (a) => { M().users[a.u] = { priv: 1, secret: a.pw }; }, neg: false },
            { p: 'username WORD$u', noOnly: 1, no: (a) => { delete M().users[a.u]; } },
            { p: 'vlan VLIST$ids', sw: 1, run: (a) => vlanEnter(a.ids), no: (a) => { vlanList(a.ids).forEach(v => { if (v !== 1) delete M().vlans[v]; }); if (vlanList(a.ids).includes(1)) return '%Default VLAN 1 may not be deleted.'; } },
            { p: 'interface IFNAME$if', run: (a) => { ensureIf(a.if); S.mode = 'if'; S.ctx = [a.if]; }, no: (a) => { if (isPhys(a.if) || a.if === 'Vlan1') return '% [Simülatör] Fiziksel arayüz ve Vlan1 silinemez.'; delete M().ifs[a.if]; } },
            { p: 'interface range LINE$r', run: (a) => ifRange(a.r), neg: false },
            { p: 'line console (0-0)', run: () => { S.mode = 'line'; S.ctx = ['con']; }, neg: false },
            { p: 'line vty (0-15)$a (0-15)$b', run: (a) => vtyEnter(a.a, a.b), neg: false },
            { p: 'router ospf (1-65535)$pid', run: (a) => { M().ospf[a.pid] = M().ospf[a.pid] || { rid: null, nets: [], passive: [], passiveDefault: false, dio: false }; S.mode = 'router'; S.ctx = [String(a.pid)]; }, no: (a) => { delete M().ospf[a.pid]; } },
            { p: 'ip dhcp excluded-address A.B.C.D$a [A.B.C.D$b]', run: (a) => { const b = a.b || a.a; if (ip2n(b) < ip2n(a.a)) return '% [Simülatör] Bitiş adresi başlangıçtan küçük.'; if (!M().dhcpExcl.some(x => x[0] === a.a && x[1] === b)) M().dhcpExcl.push([a.a, b]); }, no: (a) => { const b = a.b || a.a; M().dhcpExcl = M().dhcpExcl.filter(x => !(x[0] === a.a && x[1] === b)); } },
            { p: 'ip dhcp pool WORD$n', run: (a) => { M().dhcpPools[a.n] = M().dhcpPools[a.n] || { network: null, mask: null, gw: [], dns: [], domain: null, lease: null }; S.mode = 'dhcp'; S.ctx = [a.n]; }, no: (a) => { delete M().dhcpPools[a.n]; } },
            { p: 'mac address-table static WORD$m vlan (1-4094)$v interface IFNAME$i', sw: 1, run: (a) => { if (!/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(a.m)) return { err: 'invalid', col: 25 }; M().macStatic = M().macStatic.filter(x => !(x.mac === a.m.toLowerCase() && x.vlan === a.v)); M().macStatic.push({ mac: a.m.toLowerCase(), vlan: a.v, port: a.i }); }, no: (a) => { M().macStatic = M().macStatic.filter(x => !(x.mac === a.m.toLowerCase() && x.vlan === a.v)); } },
            { p: 'mac address-table aging-time !(0-1000000)$t', sw: 1, run: (a) => { if (a.t !== 0 && a.t < 10) return '% [Simülatör] Geçerli aralık: 0 ya da 10–1000000 sn.'; M().macAging = a.t; }, no: () => { M().macAging = 300; } },
            { p: 'archive', run: () => { M().archive = M().archive || { path: null, wm: false, period: null, max: 10 }; S.mode = 'archive'; S.ctx = ['archive']; }, no: () => { M().archive = null; } },
            { p: 'aaa new-model', run: () => { M().aaaNew = true; }, no: () => { M().aaaNew = false; } },
            { p: 'tacacs server WORD$n', run: (a) => { M().tacacs[a.n] = M().tacacs[a.n] || { addr: null, key: null, port: 49, timeout: 5 }; S.mode = 'tacsrv'; S.ctx = [a.n]; }, no: (a) => { delete M().tacacs[a.n]; } },
            { p: 'radius server WORD$n', run: (a) => { M().radius[a.n] = M().radius[a.n] || { addr: null, key: null, auth: 1812, acct: 1813, timeout: 5 }; S.mode = 'radsrv'; S.ctx = [a.n]; }, no: (a) => { delete M().radius[a.n]; } },
            { p: 'aaa group server <tacacs+|radius>$t WORD$g', aaa: 1, run: (a) => { const x = M().sgroups[a.g]; if (x && x.type !== a.t) return '% [Simülatör] ' + a.g + ' başka tipte bir grup olarak tanımlı.'; M().sgroups[a.g] = x || { type: a.t, servers: [] }; S.mode = a.t === 'tacacs+' ? 'sgtac' : 'sgrad'; S.ctx = [a.g]; }, no: (a) => { delete M().sgroups[a.g]; } },
            { p: 'aaa authentication login <default|WORD>$l LINE$m', aaa: 1, run: (a) => aaaList('authn', a), no: (a) => { delete M().authn[a.l]; } },
            { p: 'aaa authentication login <default|WORD>$l', aaa: 1, noOnly: 1, no: (a) => { delete M().authn[a.l]; } },
            { p: 'aaa authorization exec <default|WORD>$l LINE$m', aaa: 1, run: (a) => aaaList('authz', a), no: (a) => { delete M().authz[a.l]; } },
            { p: 'aaa accounting exec <default|WORD>$l start-stop LINE$m', aaa: 1, run: (a) => aaaList('acct', a), no: (a) => { delete M().acct[a.l]; } },
            { p: 'ip tacacs source-interface IFNAME$i', run: (a) => { M().tacSrc = a.i; }, no: () => { M().tacSrc = null; } },
            { p: 'ip radius source-interface IFNAME$i', run: (a) => { M().radSrc = a.i; }, no: () => { M().radSrc = null; } },
            { p: 'ip http server', run: () => { M().http = true; }, no: () => { M().http = false; } },
            { p: 'ip http secure-server', run: () => { M().https = true; }, no: () => { M().https = false; } },
            { p: 'ip http authentication !<local|enable|aaa>$a', run: (a) => { M().httpAuth = a.a; }, no: () => { M().httpAuth = null; } },
            { p: 'ip ssh server algorithm <encryption|mac|kex|hostkey>$t !LINE$v', run: (a) => sshAlgSet(a), no: (a) => { delete M().sshAlg[a.t]; } },
            { p: 'ip ssh dh min size !<1024|2048|4096>$n', run: (a) => { M().sshDhMin = +a.n; }, no: () => { M().sshDhMin = null; } },
            { p: 'access-list (1-99)$n <permit|deny|remark>$a LINE$r', run: (a) => aclNumAdd(a, 'standard'), no: null, neg: false },
            { p: 'access-list (100-199)$n <permit|deny|remark>$a LINE$r', run: (a) => aclNumAdd(a, 'extended'), neg: false },
            { p: 'access-list (1-199)$n', noOnly: 1, no: (a) => { delete M().acls[String(a.n)]; } },
            { p: 'ip access-list <standard|extended>$t WORD$name', run: (a) => { const x = M().acls[a.name] || (M().acls[a.name] = { type: a.t, entries: [] }); if (x.type !== a.t) return '% A named ' + x.type + ' IP access list with this name already exists'; S.mode = a.t === 'standard' ? 'snacl' : 'enacl'; S.ctx = [a.name]; }, no: (a) => { delete M().acls[a.name]; } },
            { p: 'ip nat inside source list WORD$acl interface IFNAME$if overload', run: (a) => { M().nat = M().nat.filter(x => !(x.type === 'list' && x.acl === a.acl)); M().nat.push({ type: 'list', acl: a.acl, iface: a.if, overload: true }); }, no: (a) => { M().nat = M().nat.filter(x => !(x.type === 'list' && x.acl === a.acl)); } },
            { p: 'ip nat inside source static A.B.C.D$l A.B.C.D$g', run: (a) => natStaticAdd({ type: 'static', local: a.l, global: a.g }), no: (a) => { M().nat = M().nat.filter(x => !(x.type === 'static' && x.local === a.l && x.global === a.g && !x.proto)); } },
            { p: 'ip nat inside source static <tcp|udp>$p A.B.C.D$l (1-65535)$lp A.B.C.D$g (1-65535)$gp', run: (a) => natStaticAdd({ type: 'static', proto: a.p, local: a.l, lport: a.lp, global: a.g, gport: a.gp }), no: (a) => { M().nat = M().nat.filter(x => !(x.type === 'static' && x.proto === a.p && x.local === a.l && x.global === a.g)); } },
            { p: 'spanning-tree mode !<pvst|rapid-pvst|mst>$m', sw: 1, run: (a) => { M().stpMode = a.m; }, no: () => { M().stpMode = 'pvst'; } },
            { p: 'spanning-tree portfast default', sw: 1, run: () => { M().portfastDefault = true; return '%Warning: this command enables portfast by default on all interfaces. You\n should now disable portfast explicitly on switched ports leading to hubs,\n switches and bridges as they may create temporary bridging loops.'; }, no: () => { M().portfastDefault = false; } },
            { p: 'spanning-tree portfast bpduguard default', sw: 1, run: () => { M().bpduguardDefault = true; }, no: () => { M().bpduguardDefault = false; } },
            { p: 'errdisable recovery cause bpduguard', sw: 1, run: () => { M().errRecovery.bpduguard = true; }, no: () => { M().errRecovery.bpduguard = false; } },
            { p: 'errdisable recovery interval !(30-86400)$s', sw: 1, run: (a) => { M().errRecovery.interval = a.s; }, no: () => { M().errRecovery.interval = 300; } },
        ].concat(COMMON));
        const IFC = [
            { p: 'description !LINE$d', run: (a) => secsIf().forEach(i => { i.desc = a.d.slice(0, 240); }), no: () => secsIf().forEach(i => { i.desc = ''; }) },
            { p: 'shutdown', run: () => secsIf().forEach(i => { i.shutdown = true; }), no: () => secsIf().forEach(i => { i.shutdown = false; i.errdis = false; i.errReason = null; }) },
            { p: 'switchport mode !<access|trunk>$m', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { i.mode = a.m; }), no: () => secsIf().forEach(i => { i.mode = null; }) },
            { p: 'switchport access vlan !(1-4094)$v', sw: 1, phys: 1, run: accessVlan, no: () => secsIf().forEach(i => { i.accessVlan = 1; }) },
            { p: 'switchport voice vlan !(1-4094)$v', sw: 1, phys: 1, run: voiceVlan, no: () => secsIf().forEach(i => { i.voiceVlan = null; }) },
            { p: 'switchport trunk native vlan !(1-4094)$v', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { i.native = a.v; }), no: () => secsIf().forEach(i => { i.native = 1; }) },
            { p: 'switchport trunk allowed vlan all', sw: 1, phys: 1, run: () => secsIf().forEach(i => { i.allowed = null; }), neg: false },
            { p: 'switchport trunk allowed vlan add VLIST$l', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { if (i.allowed) i.allowed = [...new Set(i.allowed.concat(vlanList(a.l)))].sort((x, y) => x - y); }), neg: false },
            { p: 'switchport trunk allowed vlan remove VLIST$l', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { const all = i.allowed || range('', 1, 4094).map(Number); const rm = vlanList(a.l); i.allowed = all.filter(v => !rm.includes(v)); }), neg: false },
            { p: 'switchport trunk allowed vlan !VLIST$l', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { i.allowed = vlanList(a.l); }), no: () => secsIf().forEach(i => { i.allowed = null; }) },
            { p: 'ip helper-address A.B.C.D$ip', run: (a) => secsIf().forEach(i => { if (!i.helpers.includes(a.ip)) i.helpers.push(a.ip); }), no: (a) => secsIf().forEach(i => { i.helpers = i.helpers.filter(x => x !== a.ip); }) },
            { p: 'switchport port-security', sw: 1, phys: 1, run: () => psecOn(), no: () => secsIf().forEach(i => { i.ps = null; }) },
            { p: 'switchport port-security maximum !(1-8192)$n', sw: 1, phys: 1, run: (a) => psecSet(i => { i.ps.max = a.n; }), no: () => psecSet(i => { i.ps.max = 1; }) },
            { p: 'switchport port-security violation !<protect|restrict|shutdown>$v', sw: 1, phys: 1, run: (a) => psecSet(i => { i.ps.violation = a.v; }), no: () => psecSet(i => { i.ps.violation = 'shutdown'; }) },
            { p: 'switchport port-security mac-address sticky', sw: 1, phys: 1, run: () => psecSet(i => { i.ps.sticky = true; }), no: () => psecSet(i => { i.ps.sticky = false; i.ps.stickyMacs = []; }) },
            { p: 'switchport port-security mac-address WORD$m', sw: 1, phys: 1, run: (a) => { if (!/^[0-9a-f]{4}\.[0-9a-f]{4}\.[0-9a-f]{4}$/i.test(a.m)) return { err: 'invalid', col: 38 }; return psecSet(i => { if (!i.ps.macs.includes(a.m.toLowerCase())) i.ps.macs.push(a.m.toLowerCase()); }); }, no: (a) => psecSet(i => { i.ps.macs = i.ps.macs.filter(x => x !== a.m.toLowerCase()); }) },
            { p: 'switchport nonegotiate', sw: 1, phys: 1, run: nonegotiate, no: () => secsIf().forEach(i => { i.nonegotiate = false; }) },
            { p: 'ip address !A.B.C.D$ip !MASK$mask', run: ipAddr, no: () => secsIf().forEach(i => { i.ip = null; i.mask = null; }) },
            { p: 'ip access-group WORD$acl !<in|out>$d', run: (a) => secsIf().forEach(i => { if (a.d === 'in') i.accessIn = a.acl; else i.accessOut = a.acl; }), no: (a) => secsIf().forEach(i => { if (!a.d || a.d === 'in') { if (!a.acl || i.accessIn === a.acl) i.accessIn = null; } if (!a.d || a.d === 'out') { if (!a.acl || i.accessOut === a.acl) i.accessOut = null; } }) },
            { p: 'ip nat !<inside|outside>$n', run: (a) => { if (M().sw && S.ctx.some(isPhys)) return { err: 'invalid', col: 0 }; secsIf().forEach(i => { i.nat = a.n; }); }, no: () => secsIf().forEach(i => { i.nat = null; }) },
            { p: 'speed !<10|100|1000|auto>$s', phys: 1, run: (a) => secsIf().forEach(i => { i.speed = a.s; }), no: () => secsIf().forEach(i => { i.speed = 'auto'; }) },
            { p: 'duplex !<auto|full|half>$d', phys: 1, run: (a) => secsIf().forEach(i => { i.duplex = a.d; }), no: () => secsIf().forEach(i => { i.duplex = 'auto'; }) },
            { p: 'spanning-tree portfast', sw: 1, phys: 1, run: () => { secsIf().forEach(i => { i.portfast = true; }); return portfastWarn(); }, no: () => secsIf().forEach(i => { i.portfast = false; }) },
            { p: 'spanning-tree bpduguard !<enable|disable>$x', sw: 1, phys: 1, run: (a) => secsIf().forEach(i => { i.bpduguard = a.x === 'enable'; }), no: () => secsIf().forEach(i => { i.bpduguard = false; }) },
        ];
        const IFMODE = X(IFC.concat(COMMON));
        const VLANMODE = X([
            { p: 'name !WORD$n', run: (a) => { if (a.n.length > 32) return '% [Simülatör] VLAN adı en fazla 32 karakter olabilir.'; S.vctx.forEach(v => { M().vlans[v] = a.n; }); }, no: () => S.vctx.forEach(v => { M().vlans[v] = 'VLAN' + String(v).padStart(4, '0'); }) },
        ].concat(COMMON));
        const LINEC = [
            { p: 'password !LINE$pw', run: (a) => lineSet(l => { l.pw = { pw: a.pw, t7: M().servicePwEnc }; }), no: () => lineSet(l => { l.pw = null; }) },
            { p: 'login local', run: () => lineSet(l => { l.login = 'local'; }), no: () => lineSet(l => { l.login = false; }) },
            { p: 'login authentication <default|WORD>$l', run: (a) => { if (!M().aaaNew) return { err: 'invalid', col: 6 }; lineSet(l => { l.authList = a.l; }); if (a.l !== 'default' && !M().authn[a.l]) return 'AAA: Warning: authentication list "' + a.l + '" is not defined for LOGIN.'; }, no: () => lineSet(l => { delete l.authList; }) },
            { p: 'login', run: () => { lineSet(l => { l.login = 'login'; }); if (S.ctx[0] === 'con' ? !M().lines.con.pw : !lineObj(S.ctx[0]).pw) return '% Login disabled on line ' + (S.ctx[0] === 'con' ? 0 : +S.ctx[0].split(' ')[0] + 1) + ', until \'password\' is set'; }, no: () => lineSet(l => { l.login = false; }) },
            { p: 'transport input <ssh|telnet>$a <ssh|telnet>$b', vty: 1, run: (a) => lineSet(l => { l.transport = a.a === a.b ? a.a : 'telnet ssh'; }), neg: false },
            { p: 'transport input !<ssh|telnet|all|none>$t', vty: 1, run: (a) => lineSet(l => { l.transport = a.t; }), no: () => lineSet(l => { l.transport = null; }) },
            { p: 'logging synchronous', run: () => lineSet(l => { l.logsync = true; }), no: () => lineSet(l => { l.logsync = false; }) },
            { p: 'exec-timeout !(0-35791)$m [(0-2147483)$s]', run: (a) => lineSet(l => { l.timeout = a.m + (a.s !== undefined ? ' ' + a.s : ''); }), no: () => lineSet(l => { l.timeout = null; }) },
            { p: 'access-class WORD$acl <in|out>$d', vty: 1, run: (a) => lineSet(l => { l.acl = a.acl + ' ' + a.d; }), no: () => lineSet(l => { l.acl = null; }) },
        ];
        const LINEMODE = X(LINEC.concat(COMMON));
        const ROUTERMODE = X([
            { p: 'router-id !A.B.C.D$r', run: (a) => { osp().rid = a.r; return '% OSPF: Reload or use "clear ip ospf process" command, for this to take effect'; }, no: () => { osp().rid = null; } },
            { p: 'network A.B.C.D$n WILD$w area (0-4294967295)$a', run: (a) => { const o = osp(); if (!o.nets.some(x => x.n === a.n && x.w === a.w)) o.nets.push({ n: a.n, w: a.w, a: a.a }); }, no: (a) => { const o = osp(); o.nets = o.nets.filter(x => !(x.n === a.n && x.w === a.w)); } },
            { p: 'passive-interface default', run: () => { osp().passiveDefault = true; osp().passive = []; }, no: () => { osp().passiveDefault = false; osp().passive = []; } },
            { p: 'passive-interface IFNAME$i', run: (a) => { const o = osp(); if (!o.passive.includes(a.i)) o.passive.push(a.i); }, no: (a) => { const o = osp(); o.passive = o.passive.filter(x => x !== a.i); if (o.passiveDefault && !o.passive.includes('!' + a.i)) o.passive.push('!' + a.i); } },
            { p: 'default-information originate', run: () => { osp().dio = true; }, no: () => { osp().dio = false; } },
        ].concat(COMMON));
        const DHCPM = X([
            { p: 'network A.B.C.D$n MASK$m', run: (a) => { if (netOf(a.n, maskLen(a.m)) !== ip2n(a.n)) return '% [Simülatör] Ağ adresi maskeyle uyumlu değil (ör. 10.64.10.0 255.255.255.0).'; Object.assign(pool(), { network: a.n, mask: a.m }); }, no: () => Object.assign(pool(), { network: null, mask: null }) },
            { p: 'default-router !A.B.C.D$g [A.B.C.D$g2]', run: (a) => { pool().gw = [a.g].concat(a.g2 ? [a.g2] : []); }, no: () => { pool().gw = []; } },
            { p: 'dns-server !A.B.C.D$d [A.B.C.D$d2]', run: (a) => { pool().dns = [a.d].concat(a.d2 ? [a.d2] : []); }, no: () => { pool().dns = []; } },
            { p: 'domain-name !WORD$d', run: (a) => { pool().domain = a.d; }, no: () => { pool().domain = null; } },
            { p: 'lease (0-365)$d [(0-23)$h] [(0-59)$mi]', run: (a) => { pool().lease = a.d + ' ' + (a.h || 0) + ' ' + (a.mi || 0); }, no: () => { pool().lease = null; } },
            { p: 'lease infinite', run: () => { pool().lease = 'infinite'; }, neg: false },
        ].concat(COMMON));
        const pool = () => M().dhcpPools[S.ctx[0]];
        const ARCH = X([
            { p: 'path !LINE$p', run: (a) => { if (!/^flash:\S+$/.test(a.p.trim())) return '% [Simülatör] Bu lab\'da yalnız flash: yolu destekleniyor (ör. flash:yedek-$h-).'; M().archive.path = a.p.trim(); }, no: () => { M().archive.path = null; } },
            { p: 'write-memory', run: () => { M().archive.wm = true; }, no: () => { M().archive.wm = false; } },
            { p: 'time-period !(1-525600)$t', run: (a) => { M().archive.period = a.t; }, no: () => { M().archive.period = null; } },
            { p: 'maximum !(1-14)$n', run: (a) => { M().archive.max = a.n; }, no: () => { M().archive.max = 10; } },
        ].concat(COMMON));
        const TACSRV = X([
            { p: 'address ipv4 A.B.C.D$ip', run: (a) => { M().tacacs[S.ctx[0]].addr = a.ip; }, no: () => { M().tacacs[S.ctx[0]].addr = null; } },
            { p: 'key !LINE$k', run: (a) => { M().tacacs[S.ctx[0]].key = a.k.replace(/^[07] /, ''); }, no: () => { M().tacacs[S.ctx[0]].key = null; } },
            { p: 'port (1-65535)$p', run: (a) => { M().tacacs[S.ctx[0]].port = a.p; }, neg: false },
            { p: 'timeout (1-1000)$t', run: (a) => { M().tacacs[S.ctx[0]].timeout = a.t; }, neg: false },
        ].concat(COMMON));
        const RADSRV = X([
            { p: 'address ipv4 A.B.C.D$ip auth-port (0-65535)$a acct-port (0-65535)$c', run: (a) => Object.assign(M().radius[S.ctx[0]], { addr: a.ip, auth: a.a, acct: a.c }), neg: false },
            { p: 'address ipv4 A.B.C.D$ip', run: (a) => { M().radius[S.ctx[0]].addr = a.ip; }, no: () => { M().radius[S.ctx[0]].addr = null; } },
            { p: 'key !LINE$k', run: (a) => { M().radius[S.ctx[0]].key = a.k.replace(/^[07] /, ''); }, no: () => { M().radius[S.ctx[0]].key = null; } },
            { p: 'timeout (1-1000)$t', run: (a) => { M().radius[S.ctx[0]].timeout = a.t; }, neg: false },
        ].concat(COMMON));
        const SG = X([
            { p: 'server name WORD$s', run: (a) => { const g = M().sgroups[S.ctx[0]], pool = g.type === 'tacacs+' ? M().tacacs : M().radius; if (!pool[a.s]) return '% [Simülatör] "' + a.s + '" adlı ' + (g.type === 'tacacs+' ? 'tacacs' : 'radius') + ' sunucusu tanımlı değil.'; if (!g.servers.includes(a.s)) g.servers.push(a.s); }, no: (a) => { const g = M().sgroups[S.ctx[0]]; g.servers = g.servers.filter(x => x !== a.s); } },
        ].concat(COMMON));
        // AAA yöntem listesi: group <tacacs+|radius|ad> | local | local-case | enable | line | none | if-authenticated
        function aaaList(kind, a) {
            const t = a.m.trim().split(/\s+/), out = [];
            for (let i = 0; i < t.length; i++) {
                const w = t[i];
                if (w === 'group') { const g = t[++i]; if (!g) return '% Incomplete command.'; if (g !== 'tacacs+' && g !== 'radius' && !M().sgroups[g]) return '% [Simülatör] "' + g + '" adlı sunucu grubu yok (aaa group server ile tanımlayın).'; out.push('group ' + g); continue; }
                const ok = kind === 'authn' ? ['local', 'local-case', 'enable', 'line', 'none'] : kind === 'authz' ? ['local', 'if-authenticated', 'none'] : [];
                if (!ok.includes(w)) return { err: 'invalid', col: ('aaa ' + (kind === 'authn' ? 'authentication login ' : kind === 'authz' ? 'authorization exec ' : 'accounting exec ') + a.l + ' ' + (kind === 'acct' ? 'start-stop ' : '')).length + t.slice(0, i).join(' ').length + (i ? 1 : 0) };
                out.push(w);
            }
            if (out.length > 4) return '% [Simülatör] En fazla 4 yöntem.';
            M()[kind][a.l] = out;
        }
        function sshAlgSet(a) {
            const A = SSH_ALG[a.t], v = a.v.trim().split(/\s+/);
            const bad = v.findIndex(x => !A.all.includes(x));
            if (bad >= 0) return { err: 'invalid', col: ('ip ssh server algorithm ' + a.t + ' ').length + v.slice(0, bad).join(' ').length + (bad ? 1 : 0) };
            M().sshAlg[a.t] = [...new Set(v)];
        }
        const sshList = t => M().sshAlg[t] || SSH_ALG[t].def;
        const NACL = t => X([
            { p: '(1-2147483647)$seq <permit|deny|remark>$a LINE$r', run: (a) => aclEntryAdd(S.ctx[0], t, a.seq, [a.a].concat(a.r.trim().split(/\s+/)), String(a.seq).length + 1), no: null, neg: false },
            { p: '<permit|deny|remark>$a LINE$r', run: (a) => aclEntryAdd(S.ctx[0], t, undefined, [a.a].concat(a.r.trim().split(/\s+/)), 0), neg: false },
            { p: '(1-2147483647)$seq', noOnly: 1, no: (a) => { const x = M().acls[S.ctx[0]]; x.entries = x.entries.filter(e => e.seq !== a.seq); } },
            { p: '<permit|deny>$a LINE$r', noOnly: 1, no: (a) => { const x = M().acls[S.ctx[0]], r = parseAce([a.a].concat(a.r.trim().split(/\s+/)), t); if (r.ace) { const tx = aceTxt(r.ace, t); x.entries = x.entries.filter(e => aceTxt(e, t) !== tx); } } },
        ].concat(COMMON));
        const SNACL = NACL('standard'), ENACL = NACL('extended');
        function aclNumAdd(a, type) { return aclEntryAdd(String(a.n), type, undefined, [a.a].concat(a.r.trim().split(/\s+/)), ('access-list ' + a.n + ' ').length); }
        function natStaticAdd(r) { if (M().nat.some(x => x.type === 'static' && x.global === r.global && (x.gport || 0) === (r.gport || 0))) return '% similar static entry (' + r.local + ' -> ' + r.global + ') already exists'; M().nat.push(r); }
        const osp = () => M().ospf[S.ctx[0]];
        const MODES = { config: CONFIG, if: IFMODE, range: IFMODE, vlan: VLANMODE, line: LINEMODE, router: ROUTERMODE, snacl: SNACL, enacl: ENACL, tacsrv: TACSRV, radsrv: RADSRV, sgtac: SG, sgrad: SG, dhcp: DHCPM, archive: ARCH };
        const PROMPT = { user: '>', priv: '#', config: '(config)#', if: '(config-if)#', range: '(config-if-range)#', vlan: '(config-vlan)#', line: '(config-line)#', router: '(config-router)#', snacl: '(config-std-nacl)#', enacl: '(config-ext-nacl)#', tacsrv: '(config-server-tacacs)#', radsrv: '(config-radius-server)#', sgtac: '(config-sg-tacacs+)#', sgrad: '(config-sg-radius)#', dhcp: '(dhcp-config)#', archive: '(config-archive)#' };

        // Cihaz türüne / arayüze göre komut süzgeci
        function avail(list, noForm) {
            return list.filter(c => {
                if (c.sw && !M().sw) return false;
                if (noForm ? (c.neg === false || !c.no) : c.noOnly) return false;
                if (c.vty && S.ctx[0] === 'con') return false;
                if (c.aaa && !M().aaaNew) return false;   // IOS: aaa new-model olmadan bu komutlar yoktur
                if (c.phys && (S.mode === 'if' || S.mode === 'range') && S.ctx.some(n => !isPhys(n))) return false;
                return true;
            });
        }

        // ── yardımcı komut işlevleri
        function cmdEnable() {
            const m = M();
            if (m.enableSecret || m.enablePassword) {
                let tries = 0;
                const ask = { prompt: 'Password: ', secret: true, fn: (x) => {
                    if (x === (m.enableSecret || m.enablePassword.pw)) { S.mode = 'priv'; return ''; }
                    if (++tries >= 3) return '% Bad secrets\n';
                    S.pending = ask; return '';
                } };
                S.pending = ask; return '';
            }
            S.mode = 'priv'; return '';
        }
        function cmdLogout() {
            S.mode = 'user'; S.loggedOut = true;
            return '\n' + M().hostname + ' con0 is now available\n\n\n\n\n\nPress RETURN to get started.\n';
        }
        function afterLogin() {
            S.loggedOut = false;
            const con = M().lines.con;
            const b = M().banner ? M().banner + '\n' : '';
            if (M().aaaNew) {
                const list = M().authn[con.authList || 'default'];
                if (!list) return b;   // aaa new-model + tanımsız default: konsolda doğrulama yok
                let tries = 0;
                const ask = { prompt: 'Username: ', fn: (u) => {
                    S.pending = { prompt: 'Password: ', secret: true, fn: (p) => {
                        const r = aaaAuth(list, u, p);
                        log({ login: { user: u, ok: r.ok, via: r.via } });
                        if (r.ok) { if ((r.priv || 15) >= 15) S.mode = 'priv'; return ''; }
                        if (++tries >= 3) { S.loggedOut = true; return '% Authentication failed\n\n' + M().hostname + ' con0 is now available\n\nPress RETURN to get started.\n'; }
                        S.pending = ask; return '% Authentication failed\n';
                    } };
                    return '';
                } };
                S.pending = ask;
                return b + '\nUser Access Verification\n';
            }
            if (con.login === 'login' && con.pw) {
                let tries = 0;
                const ask = { prompt: 'Password: ', secret: true, fn: (x) => {
                    if (x === con.pw.pw) return '';
                    if (++tries >= 3) { S.loggedOut = true; return '% Bad passwords\n\n' + M().hostname + ' con0 is now available\n\nPress RETURN to get started.\n'; }
                    S.pending = ask; return '';
                } };
                S.pending = ask;
                return b + '\nUser Access Verification\n';
            }
            if (con.login === 'local') {
                const ask = { prompt: 'Username: ', fn: (u) => {
                    const usr = M().users[u];
                    S.pending = { prompt: 'Password: ', secret: true, fn: (p) => {
                        if (usr && p === usr.secret) { if (usr.priv >= 15) S.mode = 'priv'; return ''; }
                        S.pending = ask; return '% Login invalid\n';
                    } };
                    return '';
                } };
                S.pending = ask;
                return b + '\nUser Access Verification\n';
            }
            return b;
        }
        function cmdReload() {
            const go = () => {
                S.pending = { prompt: 'Proceed with reload? [confirm]', fn: (x) => {
                    if (/^n/i.test(x)) return '';
                    const base = baseModel(S.lab);
                    S.m = S.startup ? clone(S.startup) : base;
                    S.mode = 'user'; S.ctx = []; S.arp = {}; S.loggedOut = true;
                    return '\n[Simülatör] Cihaz yeniden başlatıldı; startup-config yüklendi.\n\nPress RETURN to get started!\n';
                } };
                return '';
            };
            if (!saved()) {
                const ask = { prompt: 'System configuration has been modified. Save? [yes/no]: ', fn: (x) => {
                    if (/^y/i.test(x)) { save(); const o = 'Building configuration...\n[OK]'; go(); return o; }
                    if (/^n/i.test(x)) return go();
                    S.pending = ask;
                    return '% Please answer \'yes\' or \'no\'.';
                } };
                S.pending = ask;
                return '';
            }
            return go();
        }
        function execDo(line) {
            const saveMode = S.mode, saveCtx = S.ctx;
            const r = execLine(line, EXEC_PRIV, 'priv', 3);
            if (S.mode === 'user' || S.mode === 'priv' || S.mode === 'config') { S.mode = saveMode; S.ctx = saveCtx; }
            return r;
        }
        function bannerCmd(t) {
            const d = t[0], rest = t.slice(1), e = rest.indexOf(d);
            if (e >= 0) { M().banner = rest.slice(0, e); return; }
            const lines = [rest];
            const more = { prompt: '', fn: (x) => {
                const k = x.indexOf(d);
                if (k >= 0) { lines.push(x.slice(0, k)); M().banner = lines.join('\n').replace(/^\n/, ''); return ''; }
                lines.push(x); S.pending = more; return '';
            } };
            S.pending = more;
            return 'Enter TEXT message.  End with the character \'' + d + '\'.';
        }
        function encAll() {
            const m = M();
            if (m.enablePassword) m.enablePassword.t7 = true;
            if (m.lines.con.pw) m.lines.con.pw.t7 = true;
            Object.values(m.lines.vty).forEach(l => { if (l.pw) l.pw.t7 = true; });
        }
        function rsaGen(bits) {
            const m = M();
            if (m.hostname === m.defHost) return '% Please define a hostname other than ' + m.defHost + '.';
            if (!m.domain) return '% Please define a domain-name first.';
            m.rsa = bits;
            return 'The name for the keys will be: ' + m.hostname + '.' + m.domain + '\n\n% The key modulus size is ' + bits + ' bits\n% Generating ' + bits + ' bit RSA keys, keys will be non-exportable...\n[OK] (elapsed time was 1 seconds)';
        }
        function routeAdd(a) {
            if (netOf(a.net, maskLen(a.mask)) !== ip2n(a.net)) return '%Inconsistent address and mask';
            const r = { net: a.net, mask: a.mask, nh: a.nh, ad: a.ad || 1 };
            M().routes = M().routes.filter(x => !(x.net === r.net && x.mask === r.mask && x.nh === r.nh));
            M().routes.push(r);
        }
        function routeDel(a) {
            M().routes = M().routes.filter(x => !(x.net === a.net && x.mask === a.mask && (a.nh === undefined || x.nh === a.nh)));
        }
        function vlanEnter(ids) {
            const list = vlanList(ids);
            for (const v of list) if (!M().vlans[v]) M().vlans[v] = 'VLAN' + String(v).padStart(4, '0');
            S.mode = 'vlan'; S.vctx = list;
        }
        function ifRange(r) {
            // "g0/1 - 8", "g0/1-8", "g0/1 - 4 , g0/7"
            const out = [], base = S.lastBody.lastIndexOf(r);
            let pos = 0;
            for (const part of r.split(',')) {
                const col = base + pos + (part.length - part.trimStart().length);
                pos += part.length + 1;
                const m = part.trim().match(/^([a-z-]+)\s*(\d+\/)?(\d+)\s*(?:-\s*(\d+))?$/i);
                if (!m) return { err: 'invalid', col };
                const a = +m[3], b = m[4] ? +m[4] : a;
                const endCol = col + part.trim().lastIndexOf(m[4] || m[3]);
                if (a > b) return { err: 'invalid', col: endCol };
                for (let i = a; i <= b; i++) {
                    const n = ifNorm(m[1] + (m[2] || '') + i);
                    if (!n || !M().ifs[n]) return { err: 'invalid', col: i === a ? col : endCol };
                    out.push(n);
                }
            }
            S.mode = 'range'; S.ctx = out;
        }
        // line vty a b: kapsadığı mevcut blokların hepsine uygulanır (0 15 → "0 4" ve "5 15"), kapsamıyorsa yeni blok
        function vtyEnter(a, b) {
            if (a > b) return { err: 'invalid', col: 12 };
            const keys = Object.keys(M().lines.vty).filter(k => { const [x, y] = k.split(' ').map(Number); return x <= b && y >= a; });
            if (!keys.length) { const k = a + ' ' + b; M().lines.vty[k] = { pw: null, login: 'login', transport: null, timeout: null, acl: null }; keys.push(k); }
            S.mode = 'line'; S.ctx = keys;
        }
        const lineObj = k => k === 'con' ? M().lines.con : M().lines.vty[k];
        const lineSet = fn => { S.ctx.forEach(k => fn(lineObj(k))); };
        function accessVlan(a) {
            let out = '';
            if (!M().vlans[a.v]) { M().vlans[a.v] = 'VLAN' + String(a.v).padStart(4, '0'); out = '% Access VLAN does not exist. Creating vlan ' + a.v; }
            secsIf().forEach(i => { i.accessVlan = a.v; });
            return out;
        }
        function voiceVlan(a) {
            secsIf().forEach(i => { i.voiceVlan = a.v; });
            if (!M().vlans[a.v]) { M().vlans[a.v] = 'VLAN' + String(a.v).padStart(4, '0'); return '% Voice VLAN does not exist. Creating vlan ' + a.v; }
        }
        function nonegotiate() {
            const bad = secsIf().some(i => !i.mode);
            if (bad) return 'Command rejected: Conflict between \'nonegotiate\' and \'dynamic\' status.';
            secsIf().forEach(i => { i.nonegotiate = true; });
        }
        function ipAddr(a) {
            const len = maskLen(a.mask), m = M();
            if (S.ctx.some(n => m.sw && isPhys(n))) return { err: 'invalid', col: 0 };
            if (len < 31 && (netOf(a.ip, len) === ip2n(a.ip) || netOf(a.ip, len) + 2 ** (32 - len) - 1 === ip2n(a.ip)))
                return 'Bad mask 0x' + ip2n(a.mask).toString(16).toUpperCase() + ' for address ' + a.ip;
            for (const [n, i] of Object.entries(m.ifs)) {
                if (S.ctx.includes(n) || !i.ip) continue;
                const l2 = Math.min(len, maskLen(i.mask));
                if (sameNet(i.ip, a.ip, l2)) return '% ' + n2ip(netOf(a.ip, len)) + ' overlaps with ' + n;
            }
            secsIf().forEach(i => { i.ip = a.ip; i.mask = a.mask; });
        }
        function portfastWarn() {
            return '%Warning: portfast should only be enabled on ports connected to a single\n host. Connecting hubs, concentrators, switches, bridges, etc... to this\n interface  when portfast is enabled, can cause temporary bridging loops.\n Use with CAUTION';
        }

        // ── durum sorguları
        const ifUp = n => {
            const i = M().ifs[n];
            if (!i || i.shutdown || i.errdis) return false;
            if (isPhys(n)) return !!M().links[n];
            if (n.startsWith('Loopback')) return true;
            if (n.startsWith('Vlan')) { const v = +n.slice(4); return !!M().vlans[v] && Object.entries(M().ifs).some(([k, j]) => isPhys(k) && ifUp(k) && (j.mode === 'trunk' ? true : j.accessVlan === v)); }
            return false;
        };
        const ifLine = n => {
            const i = M().ifs[n];
            if (i.errdis) return ['down', 'down'];
            if (i.shutdown) return ['administratively down', 'down'];
            if (n.startsWith('Vlan')) return ifUp(n) ? ['up', 'up'] : ['up', 'down'];
            return ifUp(n) ? ['up', 'up'] : ['down', 'down'];
        };
        function saved() { return !!S.startup && JSON.stringify(S.startup) === JSON.stringify(stripRuntime(M())); }
        function stripRuntime(m) { const c = clone(m); return c; }
        function save() {
            S.startup = stripRuntime(M());
            const a = M().archive;
            if (a && a.wm && a.path) archiveAdd();
        }
        S.flash = S.flash || {}; S.archives = [];
        function archiveAdd() {
            const a = M().archive, n = S.archives.length ? S.archives[S.archives.length - 1].n + 1 : 1;
            const name = a.path.replace('$h', M().hostname).replace('$t', 'Sep-25-2026-10-' + String(10 + n).padStart(2, '0')) + (a.path.includes('$t') ? '' : '-' + n);
            S.archives.push({ n, name, snap: clone(M()) }); S.flash[name] = clone(M());
            while (S.archives.length > a.max) { const old = S.archives.shift(); delete S.flash[old.name]; }
            log({ archive: name });
        }
        function showArchive() {
            const a = M().archive;
            if (!a || !a.path) return 'Archive feature not enabled';
            const nextN = S.archives.length ? S.archives[S.archives.length - 1].n + 1 : 1;
            return ['The maximum archive configurations allowed is ' + a.max + '.', 'There are currently ' + S.archives.length + ' archive configurations saved.',
                'The next archive file will be named ' + a.path.replace('$h', M().hostname) + (a.path.includes('$t') ? '<timestamp>' : '-' + nextN), ' Archive #  Name']
                .concat(S.archives.map((x, i) => pad('   ' + (i + 1), 12) + x.name + (i === S.archives.length - 1 ? ' <- Most Recent' : ''))).join('\n');
        }
        function copyFlash(f) {
            S.pending = { prompt: 'Destination filename [' + f.slice(6) + ']? ', fn: () => { S.flash[f] = clone(M()); log({ copied: f }); return runBody().length + ' bytes copied in 0.184 secs (' + Math.round(runBody().length / 0.184) + ' bytes/sec)'; } };
            return '';
        }
        function copyTftp() {
            S.pending = { prompt: 'Address or name of remote host []? ', fn: (h) => {
                if (!isIp(h)) return '%Error parsing filename (Invalid IP address)';
                S.pending = { prompt: 'Destination filename [' + M().hostname.toLowerCase() + '-confg]? ', fn: (fn) => {
                    const r = lookup(h), ok = (S.lab.hosts || []).includes(h) && !!r;
                    log({ tftp: { host: h, ok } });
                    return ok ? '!!\n' + runBody().length + ' bytes copied in 0.352 secs (' + Math.round(runBody().length / 0.352) + ' bytes/sec)' : '%Error opening tftp://' + h + '/' + (fn || M().hostname.toLowerCase() + '-confg') + ' (Timed out)';
                } };
                return '';
            } };
            return '';
        }
        function dirFlash() {
            const L = ['Directory of flash:/', '', '    1  -rw-    98542304   Jan 10 2026 09:00:00 +00:00  simulator-image.bin'];
            let i = 2;
            for (const f of Object.keys(S.flash)) L.push(padL(i++, 5) + '  -rw-  ' + padL(4096 + i * 17, 10) + '   Sep 25 2026 10:' + String(10 + i).padStart(2, '0') + ':00 +00:00  ' + f.slice(6));
            L.push('', '256487424 bytes total (157943808 bytes free)');
            return L.join('\n');
        }
        function cfgReplace(f) {
            if (!S.flash[f]) return '%Error opening ' + f + ' (No such file or directory)';
            S.pending = { prompt: 'This will apply all necessary additions and deletions\nto replace the current running configuration with the\ncontents of the specified configuration file, which is\nassumed to be a complete configuration, not a partial\nconfiguration. Enter Y if you are sure you want to proceed. ? [no]: ', fn: (x) => {
                if (!/^y/i.test(x)) return '';
                S.m = clone(S.flash[f]); log({ replaced: f });
                return 'Total number of passes: 1\nRollback Done';
            } };
            return '';
        }
        function showIfDesc() {
            const L = ['Interface                      Status         Protocol Description'];
            for (const n of Object.keys(M().ifs).sort(ifCmp)) { const [st, pr] = ifLine(n); L.push(pad(ifShort(n), 31) + pad(st === 'administratively down' ? 'admin down' : st, 15) + pad(pr, 9) + M().ifs[n].desc); }
            return L.join('\n');
        }
        function startText() { const cur = S.m; S.m = S.startup; const t = runBody(); S.m = cur; return t; }

        // ═══ show çıktıları ══════════════════════════════════════════════════
        function runBody() {
            const m = M(), L = ['!', 'version 15.2', 'no service pad', 'service timestamps debug datetime msec', 'service timestamps log datetime msec',
                m.servicePwEnc ? 'service password-encryption' : 'no service password-encryption', '!', 'hostname ' + m.hostname, '!', 'boot-start-marker', 'boot-end-marker', '!'];
            if (m.enableSecret) L.push('enable secret 9 ' + type9(m.enableSecret));
            if (m.enablePassword) L.push('enable password ' + pwShow(m.enablePassword));
            if (m.enableSecret || m.enablePassword) L.push('!');
            for (const [u, x] of Object.entries(m.users)) L.push('username ' + u + (x.priv !== 1 ? ' privilege ' + x.priv : '') + ' secret 9 ' + type9(x.secret));
            if (m.aaaNew) {
                L.push('aaa new-model', '!');
                for (const [g, x] of Object.entries(m.sgroups)) { L.push('aaa group server ' + x.type + ' ' + g); x.servers.forEach(n => L.push(' server name ' + n)); }
                for (const [l, v] of Object.entries(m.authn)) L.push('aaa authentication login ' + l + ' ' + v.join(' '));
                for (const [l, v] of Object.entries(m.authz)) L.push('aaa authorization exec ' + l + ' ' + v.join(' '));
                for (const [l, v] of Object.entries(m.acct)) L.push('aaa accounting exec ' + l + ' start-stop ' + v.join(' '));
                L.push('!', 'aaa session-id common');
            } else L.push('no aaa new-model');
            if (m.sw) L.push('system mtu routing 1500');
            if (!m.domainLookup) L.push('no ip domain-lookup');
            if (m.domain) L.push('ip domain name ' + m.domain);
            if (m.ipRouting && m.sw) L.push('ip routing');
            L.push('!');
            if (m.sw) {
                if (m.portfastDefault) L.push('spanning-tree portfast edge default');
                if (m.bpduguardDefault) L.push('spanning-tree portfast edge bpduguard default');
                L.push('spanning-tree mode ' + m.stpMode, 'spanning-tree extend system-id');
                if (m.errRecovery.bpduguard) L.push('errdisable recovery cause bpduguard');
                if (m.errRecovery.interval !== 300) L.push('errdisable recovery interval ' + m.errRecovery.interval);
                L.push('!', 'vlan internal allocation policy ascending', '!');
            }
            for (const n of Object.keys(m.ifs).sort(ifCmp)) {
                const i = m.ifs[n];
                L.push('interface ' + n);
                if (i.desc) L.push(' description ' + i.desc);
                if (m.sw && isPhys(n)) {
                    if (i.accessVlan !== 1) L.push(' switchport access vlan ' + i.accessVlan);
                    if (i.native !== 1) L.push(' switchport trunk native vlan ' + i.native);
                    if (i.allowed) L.push(' switchport trunk allowed vlan ' + (i.allowed.length ? vlanCompress(i.allowed) : 'none'));
                    if (i.mode) L.push(' switchport mode ' + i.mode);
                    if (i.nonegotiate) L.push(' switchport nonegotiate');
                    if (i.voiceVlan) L.push(' switchport voice vlan ' + i.voiceVlan);
                } else {
                    L.push(i.ip ? ' ip address ' + i.ip + ' ' + i.mask : ' no ip address');
                }
                if (i.accessIn) L.push(' ip access-group ' + i.accessIn + ' in');
                if (i.accessOut) L.push(' ip access-group ' + i.accessOut + ' out');
                if (i.nat) L.push(' ip nat ' + i.nat);
                i.helpers.forEach(h => L.push(' ip helper-address ' + h));
                if (i.ps) {
                    if (!i.ps.off) L.push(' switchport port-security');
                    if (i.ps.max !== 1) L.push(' switchport port-security maximum ' + i.ps.max);
                    if (i.ps.violation !== 'shutdown') L.push(' switchport port-security violation ' + i.ps.violation);
                    if (i.ps.sticky) L.push(' switchport port-security mac-address sticky');
                    i.ps.stickyMacs.forEach(m => L.push(' switchport port-security mac-address sticky ' + m));
                    i.ps.macs.forEach(m => L.push(' switchport port-security mac-address ' + m));
                }
                if (i.shutdown) L.push(' shutdown');
                if (i.speed !== 'auto') L.push(' speed ' + i.speed);
                if (i.duplex !== 'auto') L.push(' duplex ' + i.duplex);
                if (i.portfast) L.push(' spanning-tree portfast');
                if (i.bpduguard) L.push(' spanning-tree bpduguard enable');
                L.push('!');
            }
            for (const [pid, o] of Object.entries(m.ospf)) {
                L.push('router ospf ' + pid);
                if (o.rid) L.push(' router-id ' + o.rid);
                if (o.passiveDefault) L.push(' passive-interface default');
                o.passive.forEach(p => L.push(p[0] === '!' ? ' no passive-interface ' + p.slice(1) : ' passive-interface ' + p));
                o.nets.forEach(x => L.push(' network ' + x.n + ' ' + x.w + ' area ' + x.a));
                if (o.dio) L.push(' default-information originate');
                L.push('!');
            }
            L.push('ip forward-protocol nd', m.http ? 'ip http server' : 'no ip http server');
            if (m.httpAuth) L.push('ip http authentication ' + m.httpAuth);
            L.push(m.https ? 'ip http secure-server' : 'no ip http secure-server', '!');
            if (m.tacSrc) L.push('ip tacacs source-interface ' + m.tacSrc);
            m.dhcpExcl.forEach(([a, b]) => L.push('ip dhcp excluded-address ' + a + (b !== a ? ' ' + b : '')));
            for (const [n, P] of Object.entries(m.dhcpPools)) { L.push('!', 'ip dhcp pool ' + n); if (P.network) L.push(' network ' + P.network + ' ' + P.mask); if (P.gw.length) L.push(' default-router ' + P.gw.join(' ')); if (P.dns.length) L.push(' dns-server ' + P.dns.join(' ')); if (P.domain) L.push(' domain-name ' + P.domain); if (P.lease) L.push(' lease ' + P.lease); }
            if (m.macAging !== 300) L.push('mac address-table aging-time ' + m.macAging);
            m.macStatic.forEach(x => L.push('mac address-table static ' + x.mac + ' vlan ' + x.vlan + ' interface ' + x.port));
            if (m.archive) { L.push('!', 'archive'); if (m.archive.path) L.push(' path ' + m.archive.path); if (m.archive.wm) L.push(' write-memory'); if (m.archive.period) L.push(' time-period ' + m.archive.period); if (m.archive.max !== 10) L.push(' maximum ' + m.archive.max); }
            if (m.radSrc) L.push('ip radius source-interface ' + m.radSrc);
            m.nat.forEach(x => L.push(x.type === 'list' ? 'ip nat inside source list ' + x.acl + ' interface ' + x.iface + ' overload' : 'ip nat inside source static ' + (x.proto ? x.proto + ' ' + x.local + ' ' + x.lport + ' ' + x.global + ' ' + x.gport : x.local + ' ' + x.global)));
            for (const [n, a] of Object.entries(m.acls)) {
                if (/^\d+$/.test(n)) a.entries.forEach(e => L.push('access-list ' + n + ' ' + aceTxt(e, a.type)));
                else { L.push('ip access-list ' + a.type + ' ' + n); a.entries.forEach(e => L.push(' ' + aceTxt(e, a.type))); }
            }
            if (Object.keys(m.acls).length || m.nat.length) L.push('!');
            if (m.defaultGw) L.push('ip default-gateway ' + m.defaultGw);
            m.routes.forEach(r => L.push('ip route ' + r.net + ' ' + r.mask + ' ' + r.nh + (r.ad !== 1 ? ' ' + r.ad : '')));
            if (m.sshVer) L.push('ip ssh version ' + m.sshVer);
            if (m.sshDhMin) L.push('ip ssh dh min size ' + m.sshDhMin);
            ['encryption', 'mac', 'kex', 'hostkey'].forEach(t => { if (m.sshAlg[t]) L.push('ip ssh server algorithm ' + t + ' ' + m.sshAlg[t].join(' ')); });
            if (m.sshTimeout !== 120) L.push('ip ssh time-out ' + m.sshTimeout);
            if (m.sshRetries !== 3) L.push('ip ssh authentication-retries ' + m.sshRetries);
            L.push('!');
            if (m.banner !== null) L.push('banner motd ^C' + m.banner + '^C');
            for (const [n, x] of Object.entries(m.tacacs)) { L.push('tacacs server ' + n); if (x.addr) L.push(' address ipv4 ' + x.addr); if (x.key) L.push(' key 7 ' + type7(x.key)); if (x.timeout !== 5) L.push(' timeout ' + x.timeout); }
            for (const [n, x] of Object.entries(m.radius)) { L.push('radius server ' + n); if (x.addr) L.push(' address ipv4 ' + x.addr + ' auth-port ' + x.auth + ' acct-port ' + x.acct); if (x.key) L.push(' key 7 ' + type7(x.key)); }
            if (Object.keys(m.tacacs).length || Object.keys(m.radius).length) L.push('!');
            L.push('!', 'line con 0');
            const con = m.lines.con;
            if (con.timeout) L.push(' exec-timeout ' + con.timeout);
            if (con.pw) L.push(' password ' + pwShow(con.pw));
            if (con.logsync) L.push(' logging synchronous');
            if (con.authList) L.push(' login authentication ' + con.authList);
            else if (con.login) L.push(con.login === 'local' ? ' login local' : ' login');
            for (const k of Object.keys(m.lines.vty).sort((a, b) => +a.split(' ')[0] - +b.split(' ')[0])) {
                const l = m.lines.vty[k];
                L.push('line vty ' + k);
                if (l.acl) L.push(' access-class ' + l.acl);
                if (l.timeout) L.push(' exec-timeout ' + l.timeout);
                if (l.pw) L.push(' password ' + pwShow(l.pw));
                if (l.authList) L.push(' login authentication ' + l.authList);
                else if (l.login) L.push(l.login === 'local' ? ' login local' : ' login');
                if (l.transport) L.push(' transport input ' + l.transport);
            }
            L.push('!', 'end');
            return L.join('\n');
        }
        function runText() {
            const b = runBody();
            return 'Building configuration...\n\nCurrent configuration : ' + (b.length + 1) + ' bytes\n' + b;
        }
        function showVersion() {
            const m = M();
            return 'Cisco IOS benzeri eğitim simülatörü — Config Generator CLI Lab\n(Görünüm: IOS 15.2; gerçek cihaz değildir)\n\n' +
                m.hostname + ' uptime is 12 minutes\nSystem returned to ROM by power-on\n\n' +
                (m.sw ? 'cisco-sim ' + Object.keys(m.ifs).filter(isPhys).length + '-port Ethernet switch (simülatör)\n' + Object.keys(m.ifs).filter(isPhys).length + ' Gigabit Ethernet interfaces\n'
                    : 'cisco-sim router (simülatör)\n' + Object.keys(m.ifs).filter(isPhys).length + ' Gigabit Ethernet interfaces\n') +
                '\nConfiguration register is 0x2102';
        }
        function showIpIntBrief() {
            const L = ['Interface              IP-Address      OK? Method Status                Protocol'];
            for (const n of Object.keys(M().ifs).sort(ifCmp)) {
                const i = M().ifs[n], [st, pr] = ifLine(n);
                L.push(pad(n, 23) + pad(i.ip || 'unassigned', 16) + 'YES ' + pad(i.ip ? 'manual' : 'unset', 7) + pad(st, 22) + pr);
            }
            return L.join('\n');
        }
        function vlanPorts(v) {
            return Object.keys(M().ifs).filter(n => isPhys(n)).sort(ifCmp).filter(n => { const i = M().ifs[n]; return i.mode !== 'trunk' && (i.accessVlan === v || i.voiceVlan === v); }).map(ifShort);
        }
        function showVlanBrief() {
            const L = ['', 'VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------'];
            for (const v of Object.keys(M().vlans).map(Number).sort((a, b) => a - b)) {
                const ports = vlanPorts(v), chunks = [];
                for (let i = 0; i < ports.length; i += 4) chunks.push(ports.slice(i, i + 4).join(', '));
                L.push(pad(v, 5) + pad(M().vlans[v], 33) + pad('active', 10) + (chunks[0] || ''));
                chunks.slice(1).forEach(c => L.push(' '.repeat(48) + c));
            }
            ['1002 fddi-default', '1003 token-ring-default', '1004 fddinet-default', '1005 trnet-default'].forEach(x => { const [v, n] = x.split(' '); L.push(pad(v, 5) + pad(n, 33) + 'act/unsup'); });
            return L.join('\n');
        }
        function showIntStatus() {
            const L = ['', 'Port      Name               Status       Vlan       Duplex  Speed Type'];
            for (const n of Object.keys(M().ifs).filter(isPhys).sort(ifCmp)) {
                const i = M().ifs[n];
                const st = i.errdis ? 'err-disabled' : i.shutdown ? 'disabled' : M().links[n] ? 'connected' : 'notconnect';
                const up = st === 'connected';
                const dup = i.duplex === 'auto' ? (up ? 'a-' + nego(n).dup : 'auto') : i.duplex;
                const spd = i.speed === 'auto' ? (up ? 'a-' + nego(n).spd : 'auto') : i.speed;
                L.push(pad(ifShort(n), 10) + pad(i.desc.slice(0, 18), 19) + pad(st, 13) + pad(i.mode === 'trunk' ? 'trunk' : i.accessVlan, 11) + padL(dup, 6) + padL(spd, 7) + ' 10/100/1000BaseTX');
            }
            return L.join('\n');
        }
        function trunkPorts() { return Object.keys(M().ifs).filter(n => isPhys(n) && M().ifs[n].mode === 'trunk' && ifUp(n)).sort(ifCmp); }
        function showIntTrunk() {
            const t = trunkPorts();
            if (!t.length) return '';
            const L = ['', 'Port        Mode             Encapsulation  Status        Native vlan'];
            t.forEach(n => { const i = M().ifs[n]; L.push(pad(ifShort(n), 12) + pad('on', 17) + pad('802.1q', 15) + pad('trunking', 14) + i.native); });
            L.push('', 'Port        Vlans allowed on trunk');
            t.forEach(n => { const i = M().ifs[n]; L.push(pad(ifShort(n), 12) + (i.allowed ? (i.allowed.length ? vlanCompress(i.allowed) : 'none') : '1-4094')); });
            L.push('', 'Port        Vlans allowed and active in management domain');
            t.forEach(n => { const i = M().ifs[n]; const act = Object.keys(M().vlans).map(Number).filter(v => !i.allowed || i.allowed.includes(v)); L.push(pad(ifShort(n), 12) + (act.length ? vlanCompress(act) : 'none')); });
            return L.join('\n');
        }
        function showIfSwitchport(n) {
            const i = M().ifs[n];
            if (!i || !isPhys(n)) return '% [Simülatör] Bu arayüz bir switchport değil.';
            const vn = v => v + ' (' + (M().vlans[v] || 'Inactive') + ')';
            const adm = i.mode === 'access' ? 'static access' : i.mode === 'trunk' ? 'trunk' : 'dynamic auto';
            const op = !ifUp(n) ? 'down' : i.mode === 'trunk' ? 'trunk' : 'static access';
            return ['Name: ' + ifShort(n), 'Switchport: Enabled', 'Administrative Mode: ' + adm, 'Operational Mode: ' + op,
                'Administrative Trunking Encapsulation: dot1q', 'Operational Trunking Encapsulation: ' + (op === 'trunk' ? 'dot1q' : 'native'),
                'Negotiation of Trunking: ' + (i.mode === 'access' || i.nonegotiate ? 'Off' : 'On'), 'Access Mode VLAN: ' + vn(i.accessVlan),
                'Trunking Native Mode VLAN: ' + vn(i.native), 'Voice VLAN: ' + (i.voiceVlan ? vn(i.voiceVlan) : 'none'),
                'Trunking VLANs Enabled: ' + (i.allowed ? (i.allowed.length ? vlanCompress(i.allowed) : 'NONE') : 'ALL'), 'Pruning VLANs Enabled: 2-1001'].join('\n');
        }
        // ═══ ACL ══════════════════════════════════════════════════════════
        const PORTN = { www: 80, http: 80, telnet: 23, smtp: 25, domain: 53, ftp: 21, 'ftp-data': 20, pop3: 110, bgp: 179, ntp: 123, snmp: 161, tftp: 69 };
        const PORTNAME = { 80: 'www', 23: 'telnet', 25: 'smtp', 53: 'domain', 21: 'ftp', 110: 'pop3', 179: 'bgp' };
        // ACE ayrıştırma: toks = ['permit', ...]; tip 'standard'|'extended' → {ace} | {err, at}
        function parseAce(toks, type) {
            let i = 0; const A = { action: toks[i++] };
            if (A.action !== 'permit' && A.action !== 'deny') return { err: 'invalid', at: 0 };
            const addr = () => {
                const t = toks[i];
                if (t === 'any') { i++; return { any: true }; }
                if (t === 'host') { i++; if (!isIp(toks[i] || '')) return { err: i }; return { ip: toks[i++], wc: '0.0.0.0' }; }
                if (isIp(t || '')) { i++; if (toks[i] && C.wildLen(toks[i]) >= 0) return { ip: t, wc: toks[i++] }; if (type === 'standard') return { ip: t, wc: '0.0.0.0' }; return { err: i }; }
                return { err: i };
            };
            const portSpec = () => {
                const op = toks[i];
                if (!['eq', 'neq', 'gt', 'lt', 'range'].includes(op)) return null;
                i++;
                const num = t => /^\d+$/.test(t || '') && +t <= 65535 ? +t : PORTN[t];
                const a = num(toks[i]); if (a === undefined) return { err: i }; i++;
                if (op === 'range') { const b = num(toks[i]); if (b === undefined) return { err: i }; i++; return { op, a, b }; }
                return { op, a };
            };
            if (type === 'standard') {
                A.proto = 'ip'; A.src = addr(); if (A.src.err !== undefined) return { err: 'invalid', at: A.src.err }; A.dst = { any: true };
            } else {
                const pr = toks[i++]; if (!['ip', 'tcp', 'udp', 'icmp'].includes(pr)) return { err: pr === undefined ? 'incomplete' : 'invalid', at: i - 1 };
                A.proto = pr;
                A.src = addr(); if (A.src.err !== undefined) return { err: toks[A.src.err] === undefined ? 'incomplete' : 'invalid', at: A.src.err };
                if (pr === 'tcp' || pr === 'udp') { const sp = portSpec(); if (sp && sp.err !== undefined) return { err: 'invalid', at: sp.err }; A.sport = sp; }
                A.dst = addr(); if (A.dst.err !== undefined) return { err: toks[A.dst.err] === undefined ? 'incomplete' : 'invalid', at: A.dst.err };
                if (pr === 'tcp' || pr === 'udp') { const dp = portSpec(); if (dp && dp.err !== undefined) return { err: 'invalid', at: dp.err }; A.dport = dp; }
                if (pr === 'icmp' && ['echo', 'echo-reply', 'unreachable', 'time-exceeded'].includes(toks[i])) A.icmp = toks[i++];
            }
            if (toks[i] === 'log') { A.log = true; i++; }
            if (i < toks.length) return { err: 'invalid', at: i };
            return { ace: A };
        }
        const addrTxt = (a, std) => a.any ? 'any' : a.wc === '0.0.0.0' ? (std ? a.ip : 'host ' + a.ip) : a.ip + ' ' + a.wc;
        const portTxt = p => !p ? '' : ' ' + p.op + ' ' + (PORTNAME[p.a] || p.a) + (p.op === 'range' ? ' ' + (PORTNAME[p.b] || p.b) : '');
        function aceTxt(A, type, forShow) {
            if (A.remark !== undefined) return 'remark ' + A.remark;
            if (type === 'standard') return A.action + ' ' + (forShow && !A.src.any && A.src.wc !== '0.0.0.0' ? A.src.ip + ', wildcard bits ' + A.src.wc : addrTxt(A.src, true)) + (A.log ? ' log' : '');
            return A.action + ' ' + A.proto + ' ' + addrTxt(A.src) + portTxt(A.sport) + ' ' + addrTxt(A.dst) + portTxt(A.dport) + (A.icmp ? ' ' + A.icmp : '') + (A.log ? ' log' : '');
        }
        const inA = (a, ip) => a.any || sameNet(a.ip, ip, C.wildLen(a.wc));
        const inP = (p, n) => !p || (p.op === 'eq' ? n === p.a : p.op === 'neq' ? n !== p.a : p.op === 'gt' ? n > p.a : p.op === 'lt' ? n < p.a : n >= p.a && n <= p.b);
        function aceMatch(A, f) {
            if (A.remark !== undefined) return false;
            if (A.proto !== 'ip' && A.proto !== f.proto) return false;
            if (!inA(A.src, f.src) || !inA(A.dst, f.dst)) return false;
            if ((A.proto === 'tcp' || A.proto === 'udp') && (!inP(A.sport, f.sport) || !inP(A.dport, f.dport))) return false;
            if (A.proto === 'icmp' && A.icmp && A.icmp !== (f.icmp || 'echo')) return false;
            return true;
        }
        function aclEval(name, f, count) {
            const acl = M().acls[name];
            if (!acl) return { permit: true, missing: true };   // IOS: tanımsız ACL uygulanırsa tüm trafik geçer
            for (const e of acl.entries) if (aceMatch(e, f)) { if (count) e.hits = (e.hits || 0) + (f.n || 5); return { permit: e.action === 'permit', seq: e.seq }; }
            return { permit: false, implicit: true };
        }
        function aclEntryAdd(name, type, seq, toks, col0) {
            const acl = M().acls[name] || (M().acls[name] = { type, entries: [] });
            if (acl.type !== type) return { err: 'invalid', col: col0 };
            let ace;
            if (toks[0] === 'remark') ace = { remark: toks.slice(1).join(' ') };
            else { const r = parseAce(toks, type); if (r.err) return r.err === 'incomplete' ? '% Incomplete command.' : { err: 'invalid', col: col0 + toks.slice(0, r.at).join(' ').length + (r.at ? 1 : 0) }; ace = r.ace; }
            const txt = aceTxt(ace, type);
            if (acl.entries.some(e => aceTxt(e, type) === txt && e.remark === undefined && ace.remark === undefined)) return '';   // aynı satır tekrar eklenmez
            if (seq === undefined) seq = (acl.entries.reduce((a, e) => Math.max(a, e.seq), 0) + 10);
            else if (acl.entries.some(e => e.seq === seq)) return '% Duplicate sequence number';
            ace.seq = seq;
            acl.entries.push(ace); acl.entries.sort((a, b) => a.seq - b.seq);
            return '';
        }
        function showAcls(only) {
            simTraffic();
            const L = [];
            for (const [n, a] of Object.entries(M().acls)) {
                if (only && n !== only) continue;
                L.push((a.type === 'standard' ? 'Standard' : 'Extended') + ' IP access list ' + n);
                a.entries.filter(e => e.remark === undefined).forEach(e => L.push('    ' + e.seq + ' ' + aceTxt(e, a.type, true) + (e.hits ? ' (' + e.hits + ' match' + (e.hits > 1 ? 'es' : '') + ')' : '')));
            }
            return L.join('\n');
        }
        // ═══ NAT + trafik benzetimi (lab.sim.flows) ═══════════════════════════
        function natStaticFor(ip, port, proto, dir) {
            return M().nat.find(r => r.type === 'static' && (dir === 'out' ? r.local === ip : r.global === ip) && (!r.proto || (r.proto === proto && (dir === 'out' ? r.lport : r.gport) === port)));
        }
        // Tek paket yolu: giriş ACL → (dış→iç statik NAT) → rota → iç→dış NAT → çıkış ACL
        function forward(f0, count) {
            const f = Object.assign({ sport: 50000, proto: 'tcp', n: 5 }, f0), res = { f };
            const I = M().ifs[f.in];
            if (!I || !ifUp(f.in)) return Object.assign(res, { stage: 'noarrive' });
            if (I.accessIn) { const a = aclEval(I.accessIn, f, count); if (!a.permit) return Object.assign(res, { stage: 'acl-in', acl: I.accessIn, seq: a.seq, implicit: a.implicit }); }
            let pkt = Object.assign({}, f);
            if (I.nat === 'outside') { const st = natStaticFor(f.dst, f.dport, f.proto, 'in'); if (st) { res.dnat = { from: f.dst, to: st.local }; pkt.dst = st.local; if (st.lport) pkt.dport = st.lport; } }
            const r = lookup(pkt.dst);
            if (!r) return Object.assign(res, { stage: 'noroute' });
            res.out = r.ifn; res.route = r;
            const O = M().ifs[r.ifn];
            if (I.nat === 'inside' && O && O.nat === 'outside') {
                const st = natStaticFor(pkt.src, pkt.sport, pkt.proto, 'out');
                if (st) { res.snat = { local: pkt.src, global: st.global, lport: pkt.sport, gport: st.gport || pkt.sport, static: true }; pkt.src = st.global; }
                else {
                    const dyn = M().nat.find(x => x.type === 'list' && aclEval(x.acl, Object.assign({}, pkt, { n: 0 }), false).permit && !aclEval(x.acl, pkt, false).missing);
                    if (dyn && dyn.iface === r.ifn && M().ifs[dyn.iface].ip) { const g = 1024 + (ip2n(pkt.src) + pkt.sport) % 3000; res.snat = { local: pkt.src, global: M().ifs[dyn.iface].ip, lport: pkt.sport, gport: g }; pkt.src = res.snat.global; pkt.sport = g; }
                }
            }
            if (O && O.accessOut) { const a = aclEval(O.accessOut, pkt, count); if (!a.permit) return Object.assign(res, { stage: 'acl-out', acl: O.accessOut, seq: a.seq, implicit: a.implicit }); }
            const hosts = S.lab.hosts || [];
            if (!hosts.includes(pkt.dst)) return Object.assign(res, { stage: 'nohost', pkt });
            return Object.assign(res, { stage: 'ok', pkt });
        }
        function simTraffic() {
            Object.values(M().acls).forEach(a => a.entries.forEach(e => { e.hits = 0; }));
            return ((S.lab.sim && S.lab.sim.flows) || []).map(f => forward(f, true));
        }
        function natTrans() {
            const res = simTraffic(), L = ['Pro Inside global         Inside local          Outside local         Outside global'];
            const seen = {};
            res.filter(r => r.snat && (r.stage === 'ok' || r.stage === 'nohost')).forEach(r => {
                const k = r.snat.global + r.snat.gport; if (seen[k]) return; seen[k] = true;
                const pr = r.f.proto === 'icmp' ? 'icmp' : r.f.proto, hp = (ip, p) => ip + ':' + p;
                L.push(pad(pr, 4) + pad(hp(r.snat.global, r.snat.gport), 22) + pad(hp(r.snat.local, r.snat.lport), 22) + pad(hp(r.pkt.dst, r.f.dport), 22) + hp(r.pkt.dst, r.f.dport));
            });
            res.filter(r => r.dnat && r.stage === 'ok').forEach(r => { L.push(pad(r.f.proto, 4) + pad(r.dnat.from + ':' + r.f.dport, 22) + pad(r.dnat.to + ':' + r.pkt.dport, 22) + pad(r.f.src + ':' + r.f.sport, 22) + r.f.src + ':' + r.f.sport); });
            M().nat.filter(x => x.type === 'static').forEach(x => L.push(pad(x.proto || '---', 4) + pad(x.global + (x.gport ? ':' + x.gport : ''), 22) + pad(x.local + (x.lport ? ':' + x.lport : ''), 22) + pad('---', 22) + '---'));
            log({ nattrans: L.length - 1 });
            return L.join('\n');
        }
        function natStats() {
            const res = simTraffic(), dyn = res.filter(r => r.snat && !r.snat.static).length, st = M().nat.filter(x => x.type === 'static').length;
            const ins = Object.keys(M().ifs).filter(n => M().ifs[n].nat === 'inside'), outs = Object.keys(M().ifs).filter(n => M().ifs[n].nat === 'outside');
            return ['Total active translations: ' + (dyn + st) + ' (' + st + ' static, ' + dyn + ' dynamic; ' + (dyn + M().nat.filter(x => x.proto).length) + ' extended)', 'Outside interfaces:'].concat(outs.map(n => '  ' + n), ['Inside interfaces:'], ins.map(n => '  ' + n),
                ['Hits: ' + (dyn * 12) + '  Misses: ' + res.filter(r => r.stage === 'ok' && !r.snat).length, 'Expired translations: 0', 'Dynamic mappings:', '-- Inside Source'],
                M().nat.filter(x => x.type === 'list').map((x, k) => '[Id: ' + (k + 1) + '] access-list ' + x.acl + ' interface ' + x.iface + (x.overload ? ' refcount ' + dyn : ''))).join('\n');
        }
        function showIpInterface(n) {
            const i = M().ifs[n]; if (!i) return '% Invalid interface';
            const [st, pr] = ifLine(n);
            return [n + ' is ' + st + ', line protocol is ' + pr, i.ip ? '  Internet address is ' + i.ip + '/' + maskLen(i.mask) : '  Internet protocol processing disabled', '  Broadcast address is 255.255.255.255', '  MTU is 1500 bytes',
                i.helpers.length ? '  Helper addresses are ' + i.helpers.join('\n                        ') : '  Helper address is not set',
                '  Outgoing Common access list is not set', '  Outgoing access list is ' + (i.accessOut || 'not set'), '  Inbound Common access list is not set', '  Inbound  access list is ' + (i.accessIn || 'not set'), '  Proxy ARP is enabled', '  IP fast switching is enabled',
                '  IP NAT ' + (i.nat || 'disabled')].join('\n');
        }
        const macFor = n => { const k = ifNums(n).reduce((a, x) => a * 64 + x, 0) + IF_ORDER.indexOf(ifType(n)) * 4096; return '0011.22' + ((k >> 8) & 255).toString(16).padStart(2, '0') + '.' + (k & 255).toString(16).padStart(2, '0') + '0' + (k % 10); };
        // Otomatik uzlaşma: iki uç auto → 1000/full. Karşı uç sabitse auto taraf hızı sinyalden sezer, dupleksi bilemez → half.
        function nego(n) {
            const p = (S.lab.sim && S.lab.sim.peer || {})[n] || { duplex: 'auto', speed: 'auto' }, i = M().ifs[n];
            const pd = p.duplex || 'auto', ps = p.speed || 'auto';
            const spd = i.speed !== 'auto' ? String(i.speed) : ps !== 'auto' ? String(ps) : '1000';
            const dup = i.duplex !== 'auto' ? i.duplex : pd === 'auto' ? 'full' : 'half';
            const peerDup = pd !== 'auto' ? pd : i.duplex === 'auto' ? 'full' : 'half';
            return { spd, dup, peerDup };
        }
        function dupMismatch(n) { const p = (S.lab.sim && S.lab.sim.peer || {})[n]; if (!p || !M().links[n]) return false; const g = nego(n); return g.dup !== g.peerDup; }
        function showIfDetail(n) {
            const i = M().ifs[n];
            if (!i) return '% Invalid interface';
            const [st, pr] = ifLine(n), up = pr === 'up';
            const L = [n + ' is ' + st + ', line protocol is ' + pr + (isPhys(n) && M().sw ? ' (' + (i.errdis ? 'err-disabled' : up ? 'connected' : i.shutdown ? 'disabled' : 'notconnect') + ')' : ''),
                '  Hardware is ' + (isPhys(n) ? 'Gigabit Ethernet' : ifType(n)) + ', address is ' + macFor(n) + ' (bia ' + macFor(n) + ')'];
            if (i.desc) L.push('  Description: ' + i.desc);
            if (i.ip) L.push('  Internet address is ' + i.ip + '/' + maskLen(i.mask));
            L.push('  MTU 1500 bytes, BW ' + (i.speed === '10' ? 10000 : i.speed === '100' ? 100000 : 1000000) + ' Kbit/sec, DLY 10 usec,', '     reliability 255/255, txload 1/255, rxload 1/255', '  Encapsulation ARPA, loopback not set', '  Keepalive set (10 sec)');
            if (isPhys(n)) {
                const peer = (S.lab.sim && S.lab.sim.peer || {})[n] || {};
                const g = nego(n);
                const dup = i.duplex === 'auto' && !up ? 'Auto-duplex' : (g.dup === 'half' ? 'Half-duplex' : 'Full-duplex');
                const spd = i.speed === 'auto' && !up ? 'Auto-speed' : g.spd + 'Mb/s';
                L.push('  ' + dup + ', ' + spd + ', media type is 10/100/1000BaseTX');
            }
            const bad = dupMismatch(n);
            L.push('  Last input 00:00:01, output 00:00:00, output hang never', '  5 minute input rate ' + (up ? 12000 : 0) + ' bits/sec, ' + (up ? 9 : 0) + ' packets/sec',
                '     ' + (up ? 184233 : 0) + ' packets input, ' + (up ? 21744921 : 0) + ' bytes, 0 no buffer', '     Received ' + (up ? 1822 : 0) + ' broadcasts (0 multicasts)', '     0 runts, 0 giants, 0 throttles',
                '     ' + (bad ? 2318 : 0) + ' input errors, ' + (bad ? 2291 : 0) + ' CRC, ' + (bad ? 27 : 0) + ' frame, 0 overrun, 0 ignored',
                '     ' + (up ? 201877 : 0) + ' packets output, ' + (up ? 30155288 : 0) + ' bytes, 0 underruns', '     0 output errors, ' + (bad ? 1832 : 0) + ' collisions, ' + (i.errdis ? 1 : 0) + ' interface resets',
                '     0 unknown protocol drops', '     0 babbles, ' + (bad ? 412 : 0) + ' late collision, 0 deferred');
            return L.join('\n');
        }
        function showErrDis() {
            const L = ['', 'Port      Name               Status       Reason               Err-disabled Vlans'];
            Object.keys(M().ifs).filter(n => M().ifs[n].errdis).sort(ifCmp).forEach(n => L.push(pad(ifShort(n), 10) + pad(M().ifs[n].desc.slice(0, 18), 19) + pad('err-disabled', 13) + (M().ifs[n].errReason || '')));
            return L.join('\n');
        }
        function showErrRec() {
            const r = M().errRecovery;
            return ['ErrDisable Reason            Timer Status', '-----------------            --------------', pad('bpduguard', 29) + (r.bpduguard ? 'Enabled' : 'Disabled'), pad('psecure-violation', 29) + 'Disabled', '', 'Timer interval: ' + r.interval + ' seconds', '',
                'Interfaces that will be enabled at the next timeout:'].concat(r.bpduguard ? Object.keys(M().ifs).filter(n => M().ifs[n].errdis).map(n => pad(ifShort(n), 12) + pad(M().ifs[n].errReason || '', 22) + r.interval) : []).join('\n');
        }
        // BPDU Guard olayı: sim.bpdu listesindeki porttan BPDU geliyorsa ve koruma açıksa port err-disable olur
        function bpduEvents() {
            const src = (S.lab.sim && S.lab.sim.bpdu) || [], out = [];
            if (!S.bpduSeen) S.bpduSeen = {};
            for (const n of src) {
                const i = M().ifs[n];
                if (!i || i.shutdown || i.errdis || !M().links[n] || S.bpduSeen[n]) continue;
                const guard = i.bpduguard || (M().bpduguardDefault && (i.portfast || M().portfastDefault));
                if (!guard) continue;
                i.errdis = true; i.errReason = 'bpduguard'; S.bpduSeen[n] = true;
                out.push('*' + new Date().toTimeString().slice(0, 8) + '.123: %SPANTREE-2-BLOCK_BPDUGUARD: Received BPDU on port ' + n + ' with BPDU Guard enabled. Disabling port.',
                    '*' + new Date().toTimeString().slice(0, 8) + '.125: %PM-4-ERR_DISABLE: bpduguard error detected on ' + ifShort(n) + ', putting ' + ifShort(n) + ' in err-disable state');
                log({ event: 'errdisable', port: n });
            }
            return out.join('\n');
        }
        // AAA sunucu benzetimi: lab.sim.aaa = { '<ip>': { users: {u: p}, key } } — sunucuya rota + lab.hosts + doğru anahtar gerekir
        function aaaServerReply(proto, name) {
            const sv = (proto === 'tacacs' ? M().tacacs : M().radius)[name];
            if (!sv || !sv.addr) return { none: true };
            const info = ((S.lab.sim && S.lab.sim.aaa) || {})[sv.addr];
            const r = lookup(sv.addr), hosts = S.lab.hosts || [];
            if (!info || !r || !hosts.includes(sv.addr) || (r.nh && isIp(r.nh) && !hosts.includes(r.nh) && r.c !== 'C')) return { none: true, why: 'unreachable' };
            if (!sv.key || sv.key !== info.key) return { none: true, why: 'key' };
            return { info };
        }
        function groupServers(g) {
            if (g === 'tacacs+') return Object.keys(M().tacacs).map(n => ['tacacs', n]);
            if (g === 'radius') return Object.keys(M().radius).map(n => ['radius', n]);
            const x = M().sgroups[g]; return x ? x.servers.map(n => [x.type === 'tacacs+' ? 'tacacs' : 'radius', n]) : [];
        }
        // Yöntem listesini IOS anlamıyla yürüt: sunucu YANIT VERİRSE (kabul/red) sonuç kesindir; yanıt yoksa sıradaki yönteme geçilir
        function aaaAuth(list, u, p) {
            for (const m of list) {
                if (m.startsWith('group ')) {
                    for (const [proto, n] of groupServers(m.slice(6))) {
                        const r = aaaServerReply(proto, n);
                        if (r.none) continue;
                        const ok = r.info.users && r.info.users[u] === p;
                        return { ok, via: proto + ':' + n, final: true };
                    }
                    continue;
                }
                if (m === 'local' || m === 'local-case') { const x = M().users[u]; return { ok: !!x && x.secret === p, via: 'local', priv: x && x.priv }; }
                if (m === 'enable') return { ok: p === (M().enableSecret || (M().enablePassword && M().enablePassword.pw)), via: 'enable' };
                if (m === 'none') return { ok: true, via: 'none' };
                if (m === 'line') return { ok: !!M().lines.con.pw && M().lines.con.pw.pw === p, via: 'line' };
            }
            return { ok: false, via: 'nomethod' };
        }
        function testAaa(a) {
            const pw = a.r.trim().split(/\s+/)[0];
            if (!M().aaaNew) return '% AAA is not enabled';
            if (a.g !== 'tacacs+' && a.g !== 'radius' && !M().sgroups[a.g]) return '% [Simülatör] "' + a.g + '" adlı sunucu grubu yok.';
            for (const [proto, n] of groupServers(a.g)) {
                const r = aaaServerReply(proto, n);
                if (r.none) continue;
                const ok = r.info.users && r.info.users[a.u] === pw;
                log({ aaatest: { group: a.g, user: a.u, ok, server: n } });
                return ok ? 'Sending password\nUser was successfully authenticated.' : 'Sending password\nUser authentication request was rejected by server.';
            }
            log({ aaatest: { group: a.g, user: a.u, ok: false, noresp: true } });
            return 'Sending password\n% [Simülatör] Gruptaki hiçbir sunucudan yanıt alınamadı (rota, sunucu adresi ya da paylaşılan anahtar). Gerçek cihazda zaman aşımından sonra "User rejected" görülür.';
        }
        function showAaaServers() {
            const L = []; let id = 1;
            for (const [n, s] of Object.entries(M().radius)) { const r = aaaServerReply('radius', n); L.push('RADIUS: id ' + id++ + ', priority 1, host ' + (s.addr || '0.0.0.0') + ', auth-port ' + s.auth + ', acct-port ' + s.acct + ', hostname ' + n, '     State: current ' + (r.none ? 'DEAD' : 'UP') + ', duration 1800s, previous duration 0s', '     Dead: total time ' + (r.none ? 60 : 0) + 's, count ' + (r.none ? 1 : 0)); }
            for (const [n, s] of Object.entries(M().tacacs)) { const r = aaaServerReply('tacacs', n); L.push('TACACS+: id ' + id++ + ', priority 1, host ' + (s.addr || '0.0.0.0') + ', port ' + s.port + ', hostname ' + n, '     State: current ' + (r.none ? 'DEAD' : 'UP') + ', duration 1800s, previous duration 0s', '     Dead: total time ' + (r.none ? 60 : 0) + 's, count ' + (r.none ? 1 : 0)); }
            return L.length ? L.join('\n') : '';
        }
        // ═══ DHCP (lab.sim.dhcp: [{ mac, in }]) — yerel havuz ya da relay (lab.sim.dhcpServer: { ip, nets: [...] })
        function inExcl(ip) { return M().dhcpExcl.some(([a, b]) => ip2n(ip) >= ip2n(a) && ip2n(ip) <= ip2n(b)); }
        function dhcpLeases() {
            const out = [], used = {};
            for (const c of ((S.lab.sim && S.lab.sim.dhcp) || [])) {
                const I = M().ifs[c.in];
                if (!I || !ifUp(c.in) || !I.ip) { out.push(Object.assign({}, c, { reason: 'noif' })); continue; }
                const len = maskLen(I.mask);
                if (I.helpers.length) {   // relay
                    const srv = (S.lab.sim && S.lab.sim.dhcpServer) || {};
                    const h = I.helpers.find(x => x === srv.ip);
                    if (!h || !lookup(h)) { out.push(Object.assign({}, c, { reason: 'relay' })); continue; }
                    const net = (srv.nets || []).find(n => { const [a, l] = n.split('/'); return sameNet(a, I.ip, +l); });
                    if (!net) { out.push(Object.assign({}, c, { reason: 'relaypool' })); continue; }
                    const k = 'r' + net; used[k] = (used[k] || 20) + 1;
                    out.push(Object.assign({}, c, { ip: n2ip(netOf(I.ip, len) + used[k]), gw: I.ip, relay: h }));
                    continue;
                }
                const pn = Object.keys(M().dhcpPools).find(n => { const p = M().dhcpPools[n]; return p.network && sameNet(p.network, I.ip, maskLen(p.mask)) && maskLen(p.mask) === len; });
                if (!pn) { out.push(Object.assign({}, c, { reason: 'nopool' })); continue; }
                const P = M().dhcpPools[pn], base = ip2n(P.network), size = 2 ** (32 - maskLen(P.mask));
                let ip = null;
                for (let k = 1; k < size - 1; k++) { const cand = n2ip(base + k); if (inExcl(cand) || Object.values(M().ifs).some(x => x.ip === cand) || used[cand]) continue; ip = cand; break; }
                if (!ip) { out.push(Object.assign({}, c, { reason: 'full', pool: pn })); continue; }
                used[ip] = true;
                out.push(Object.assign({}, c, { ip, pool: pn, gw: P.gw[0] || null, dns: P.dns[0] || null }));
            }
            return out;
        }
        function nextFree(pn, leases) {
            const P = M().dhcpPools[pn], b = ip2n(P.network), size = 2 ** (32 - maskLen(P.mask));
            for (let k = 1; k < size - 1; k++) { const c = n2ip(b + k); if (!inExcl(c) && !leases.some(l => l.ip === c) && !Object.values(M().ifs).some(x => x.ip === c)) return c; }
            return '0.0.0.0';
        }
        function showDhcpPool() {
            const L = [], leases = dhcpLeases();
            for (const [n, P] of Object.entries(M().dhcpPools)) {
                if (!P.network) { L.push('', 'Pool ' + n + ' :', ' Utilization mark (high/low)    : 100 / 0', ' Total addresses                : 0'); continue; }
                const size = 2 ** (32 - maskLen(P.mask)) - 2, used = leases.filter(l => l.pool === n).length, b = ip2n(P.network);
                L.push('', 'Pool ' + n + ' :', ' Utilization mark (high/low)    : 100 / 0', ' Subnet size (first/next)       : 0 / 0', ' Total addresses                : ' + size, ' Leased addresses               : ' + used, ' Pending event                  : none',
                    ' 1 subnet is currently in the pool :', ' Current index        IP address range                    Leased addresses', ' ' + pad(nextFree(n, leases), 21) + pad(n2ip(b + 1) + '       - ' + n2ip(b + size), 36) + used);
            }
            return L.join('\n');
        }
        // Kira bitişi: sabit simülatör saati (25 Eyl 2026 10:12) + havuzun lease değeri (varsayılan 1 gün)
        function leaseEnd(pn) {
            const P = M().dhcpPools[pn] || {}, l = P.lease || '1 0 0';
            if (l === 'infinite') return 'Infinite';
            const [d, h, mi] = l.split(' ').map(Number), t = new Date(Date.UTC(2026, 8, 25, 10, 12) + ((d * 24 + h) * 60 + mi) * 60000);
            const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], H = t.getUTCHours();
            return M3[t.getUTCMonth()] + ' ' + String(t.getUTCDate()).padStart(2, '0') + ' ' + t.getUTCFullYear() + ' ' + String(H % 12 || 12).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' ' + (H < 12 ? 'AM' : 'PM');
        }
        function showDhcpBinding() {
            const L = ['Bindings from all pools not associated with VRF:', 'IP address          Client-ID/              Lease expiration        Type       State      Interface', '                    Hardware address/', '                    User name'];
            dhcpLeases().filter(l => l.ip && !l.relay).forEach(l => L.push(pad(l.ip, 20) + pad(('01' + l.mac.replace(/\./g, '')).replace(/(.{4})(?=.)/g, '$1.'), 24) + pad(leaseEnd(l.pool), 24) + pad('Automatic', 11) + pad('Active', 11) + l.in));
            log({ dhcpbind: dhcpLeases().filter(l => l.ip).length });
            return L.join('\n');
        }
        // ═══ Port güvenliği + MAC tablosu (lab.sim.macs: { '<port>': ['0050.56a1.0001', …] })
        // Girdi: 'mac' (portun access/native VLAN'ı) ya da 'mac@vlan' (trunk arkasındaki cihazlar)
        const simMacV = n => (((S.lab.sim && S.lab.sim.macs) || {})[n] || []).map(x => { const [m, v] = x.toLowerCase().split('@'); return { mac: m, vlan: v ? +v : null }; });
        const simMacs = n => simMacV(n).map(x => x.mac);
        function psecOn() {
            for (const n of S.ctx) { const i = M().ifs[n]; if (i.mode !== 'access' && i.mode !== 'trunk') return 'Command rejected: ' + n + ' is a dynamic port.'; }
            secsIf().forEach(i => { i.ps = i.ps || { max: 1, violation: 'shutdown', sticky: false, macs: [], stickyMacs: [], viol: 0 }; i.ps.off = false; });
        }
        function psecSet(fn) {
            if (S.ctx.some(n => !M().ifs[n].ps)) { secsIf().forEach(i => { if (!i.ps) i.ps = { max: 1, violation: 'shutdown', sticky: false, macs: [], stickyMacs: [], viol: 0, off: true }; }); }
            secsIf().forEach(fn);
        }
        // Güvenli adresler + ihlal: yalnız "switchport port-security" açık ve port up ise
        function psecEval(n) {
            const i = M().ifs[n];
            if (!i.ps || i.ps.off || !M().links[n] || i.shutdown) return null;
            if (i.errdis) return { secure: i.ps.macs.concat(i.ps.sticky ? i.ps.stickyMacs : []), bad: [] };
            const learned = simMacs(n), secure = i.ps.macs.slice();
            if (i.ps.sticky) learned.forEach(m => { if (!i.ps.stickyMacs.includes(m) && secure.length + i.ps.stickyMacs.length < i.ps.max && !secure.includes(m)) i.ps.stickyMacs.push(m); });
            const all = secure.concat(i.ps.sticky ? i.ps.stickyMacs : []);
            learned.forEach(m => { if (!all.includes(m) && all.length < i.ps.max) all.push(m); });
            const bad = learned.filter(m => !all.includes(m));
            return { secure: all, bad };
        }
        function psecEvents() {
            const out = [];
            if (!S.psecSeen) S.psecSeen = {};
            for (const n of Object.keys(M().ifs)) {
                const r = psecEval(n), i = M().ifs[n];
                if (!r || !r.bad.length || i.errdis) continue;
                const key = n + r.bad[0];
                if (i.ps.violation === 'shutdown') {
                    i.errdis = true; i.errReason = 'psecure-violation'; i.ps.viol++;
                    out.push('*' + new Date().toTimeString().slice(0, 8) + '.301: %PM-4-ERR_DISABLE: psecure-violation error detected on ' + ifShort(n) + ', putting ' + ifShort(n) + ' in err-disable state',
                        '*' + new Date().toTimeString().slice(0, 8) + '.303: %PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ' + r.bad[0] + ' on port ' + n + '.');
                    log({ event: 'psec', port: n, action: 'shutdown' });
                } else if (!S.psecSeen[key]) {
                    S.psecSeen[key] = true; i.ps.viol += r.bad.length;
                    if (i.ps.violation === 'restrict') out.push('*' + new Date().toTimeString().slice(0, 8) + '.303: %PORT_SECURITY-2-PSECURE_VIOLATION: Security violation occurred, caused by MAC address ' + r.bad[0] + ' on port ' + n + '.');
                    log({ event: 'psec', port: n, action: i.ps.violation });
                }
            }
            return out.join('\n');
        }
        const vio = v => ({ protect: 'Protect', restrict: 'Restrict', shutdown: 'Shutdown' })[v];
        function showPsec() {
            const L = ['Secure Port  MaxSecureAddr  CurrentAddr  SecurityViolation  Security Action', '                (Count)       (Count)          (Count)', '---------------------------------------------------------------------------'];
            for (const n of Object.keys(M().ifs).sort(ifCmp)) { const i = M().ifs[n]; if (!i.ps || i.ps.off) continue; const r = psecEval(n) || { secure: i.ps.macs.concat(i.ps.stickyMacs) }; L.push(padL(ifShort(n), 11) + padL(i.ps.max, 15) + padL(r.secure.length, 13) + padL(i.ps.viol, 19) + padL(vio(i.ps.violation), 17)); }
            L.push('---------------------------------------------------------------------------', 'Total Addresses in System (excluding one mac per port)     : 0', 'Max Addresses limit in System (excluding one mac per port) : 4096');
            return L.join('\n');
        }
        function showPsecIf(n) {
            const i = M().ifs[n];
            if (!i || !i.ps || i.ps.off) return 'Port Security              : Disabled\nPort Status                : Secure-down\nViolation Mode             : Shutdown\nMaximum MAC Addresses      : 1\nTotal MAC Addresses        : 0\nSecurity Violation Count   : 0';
            const r = psecEval(n) || { secure: i.ps.macs.concat(i.ps.stickyMacs) }, last = simMacs(n).slice(-1)[0];
            return ['Port Security              : Enabled', 'Port Status                : ' + (i.errdis ? 'Secure-shutdown' : M().links[n] && !i.shutdown ? 'Secure-up' : 'Secure-down'), 'Violation Mode             : ' + vio(i.ps.violation), 'Aging Time                 : 0 mins', 'Aging Type                 : Absolute', 'SecureStatic Address Aging : Disabled',
                'Maximum MAC Addresses      : ' + i.ps.max, 'Total MAC Addresses        : ' + r.secure.length, 'Configured MAC Addresses   : ' + i.ps.macs.length, 'Sticky MAC Addresses       : ' + i.ps.stickyMacs.length,
                'Last Source Address:Vlan   : ' + (last ? last + ':' + i.accessVlan : '0000.0000.0000:0'), 'Security Violation Count   : ' + i.ps.viol].join('\n');
        }
        function showPsecAddr() {
            const L = ['               Secure Mac Address Table', '-----------------------------------------------------------------------------', 'Vlan    Mac Address       Type                          Ports   Remaining Age', '                                                                   (mins)', '----    -----------       ----                          -----   -------------'];
            for (const n of Object.keys(M().ifs).sort(ifCmp)) { const i = M().ifs[n]; if (!i.ps || i.ps.off) continue; i.ps.macs.forEach(m => L.push(padL(i.accessVlan, 4) + '    ' + pad(m, 18) + pad('SecureConfigured', 30) + pad(ifShort(n), 8) + '    -')); (psecEval(n) || { secure: [] }).secure.filter(m => !i.ps.macs.includes(m)).forEach(m => L.push(padL(i.accessVlan, 4) + '    ' + pad(m, 18) + pad(i.ps.sticky ? 'SecureSticky' : 'SecureDynamic', 30) + pad(ifShort(n), 8) + '    -')); }
            return L.join('\n');
        }
        // clear … dynamic: girdiler bir sonraki gösterimde yok; cihazlar trafik gönderdikçe yeniden öğrenilir
        function macRows(hide) {
            const rows = [];
            for (const n of Object.keys(M().ifs).filter(isPhys).sort(ifCmp)) {
                const i = M().ifs[n];
                if (!M().links[n] || i.shutdown || i.errdis) continue;
                const pe = psecEval(n), vlan = i.mode === 'trunk' ? i.native : i.accessVlan;
                simMacV(n).forEach(({ mac: m, vlan: v }) => {
                    if (pe && pe.bad.includes(m)) return;
                    const type = pe && pe.secure.includes(m) ? 'STATIC' : 'DYNAMIC';
                    if (hide && type === 'DYNAMIC' && (hide === '*' || hide === n)) return;
                    rows.push({ vlan: v || vlan, mac: m, type, port: n });
                });
            }
            M().macStatic.forEach(x => rows.push({ vlan: x.vlan, mac: x.mac, type: 'STATIC', port: x.port }));
            return rows;
        }
        function showMac(f) {
            const hide = S.macHide; S.macHide = null;
            const rows = macRows(hide).filter(r => (!f.type || r.type === f.type) && (!f.port || r.port === f.port) && (!f.mac || r.mac === f.mac));
            const L = ['          Mac Address Table', '-------------------------------------------', '', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----'];
            rows.sort((a, b) => a.vlan - b.vlan).forEach(r => L.push(padL(r.vlan, 4) + '    ' + pad(r.mac, 18) + pad(r.type, 12) + ifShort(r.port)));
            L.push('Total Mac Addresses for this criterion: ' + rows.length);
            log({ macshow: f });
            return L.join('\n');
        }
        function showMacCount() {
            const rows = macRows(), vl = [...new Set(rows.map(r => r.vlan))].sort((a, b) => a - b), L = [];
            vl.forEach(v => { const d = rows.filter(r => r.vlan === v && r.type === 'DYNAMIC').length, st = rows.filter(r => r.vlan === v && r.type === 'STATIC').length; L.push('Mac Entries for Vlan ' + v + ':', '---------------------------', 'Dynamic Address Count  : ' + d, 'Static  Address Count  : ' + st, 'Total Mac Addresses    : ' + (d + st), ''); });
            L.push('Total Mac Address Space Available: 8175');
            return L.join('\n');
        }
        function showIpSsh() {
            const m = M();
            if (!m.rsa) return 'SSH Disabled - version 1.99\n%Please create RSA keys to enable SSH (and of atleast 768 bits for SSH v2).\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication timeout: ' + m.sshTimeout + ' secs; Authentication retries: ' + m.sshRetries;
            return 'SSH Enabled - version ' + (m.sshVer === 2 ? '2.0' : m.sshVer === 1 ? '1.5' : '1.99') + '\nAuthentication methods:publickey,keyboard-interactive,password\nAuthentication Publickey Algorithms:' + sshList('hostkey').join(',') + '\nHostkey Algorithms:' + sshList('hostkey').join(',') + '\nEncryption Algorithms:' + sshList('encryption').join(',') + '\nMAC Algorithms:' + sshList('mac').join(',') + '\nKEX Algorithms:' + sshList('kex').join(',') + '\nAuthentication timeout: ' + m.sshTimeout + ' secs; Authentication retries: ' + m.sshRetries + '\nMinimum expected Diffie Hellman key size : ' + (m.sshDhMin || 2048) + ' bits\nIOS Keys in SECSH format(ssh-rsa, base64 encoded): ' + m.hostname + '.' + (m.domain || '') + '\nssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQ' + fakeHash(m.hostname + m.rsa, 40) + '...';
        }
        // RIB: connected + local + static (next-hop bağlı ağda ve arayüz up ise)
        // RIB: connected + local + static. Aynı önekte en düşük AD kazanır (eşitse ECMP);
        // next-hop bağlı bir ağda ve arayüz up değilse rota kurulmaz (yüzen rota böyle devreye girer).
        function rib() {
            const R = [];
            for (const n of Object.keys(M().ifs)) {
                const i = M().ifs[n];
                if (!i.ip || !ifUp(n)) continue;
                const len = maskLen(i.mask);
                R.push({ c: 'C', net: n2ip(netOf(i.ip, len)), len, via: 'is directly connected, ' + n, ifn: n, ad: 0 });
                if (len < 32) R.push({ c: 'L', net: i.ip, len: 32, via: 'is directly connected, ' + n, ifn: n, ad: 0 });
            }
            const cands = [];
            for (const r of M().routes) {
                const len = maskLen(r.mask);
                let ifn = null;
                if (isIp(r.nh)) { const c = R.find(x => x.c === 'C' && sameNet(x.net, r.nh, x.len)); if (!c) continue; ifn = c.ifn; }
                else { if (!ifUp(r.nh)) continue; ifn = r.nh; }
                cands.push({ net: r.net, len, ad: r.ad, nh: r.nh, ifn });
            }
            const seen = {};
            for (const r of cands) {
                const k = r.net + '/' + r.len;
                if (seen[k]) continue;
                if (R.some(x => x.c === 'C' && x.net === r.net && x.len === r.len)) continue;
                const same = cands.filter(x => x.net === r.net && x.len === r.len), best = Math.min(...same.map(x => x.ad));
                same.filter(x => x.ad === best).forEach((x, idx) => R.push({ c: x.len === 0 ? 'S*' : 'S', net: x.net, len: x.len, ad: x.ad, nh: x.nh, ifn: x.ifn, cont: idx > 0,
                    via: isIp(x.nh) ? '[' + x.ad + '/0] via ' + x.nh : 'is directly connected, ' + x.nh }));
                seen[k] = true;
            }
            return R.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len || (a.cont ? 1 : 0) - (b.cont ? 1 : 0));
        }
        function lookup(ip) { return rib().filter(x => x.c !== 'L' && (x.len === 0 || sameNet(x.net, ip, x.len))).sort((a, b) => b.len - a.len)[0] || null; }
        function showRouteFor(ip) {
            const r = rib().filter(x => x.len > 0 && (x.c === 'L' ? x.net === ip : sameNet(x.net, ip, x.len))).sort((a, b) => b.len - a.len)[0];
            if (!r) return '% Network not in table';
            const all = rib().filter(x => x.net === r.net && x.len === r.len && x.c === r.c);
            if (r.c === 'C' || r.c === 'L') return 'Routing entry for ' + r.net + '/' + r.len + '\n  Known via "connected", distance 0, metric 0 (connected, via interface)\n  Routing Descriptor Blocks:\n  * directly connected, via ' + r.ifn + '\n      Route metric is 0, traffic share count is 1';
            return ['Routing entry for ' + r.net + '/' + r.len, '  Known via "static", distance ' + r.ad + ', metric 0', '  Routing Descriptor Blocks:']
                .concat(...all.map((x, k) => [(k === 0 ? '  * ' : '    ') + (isIp(x.nh) ? x.nh : 'directly connected, via ' + x.nh), '      Route metric is 0, traffic share count is 1'])).join('\n');
        }
        function showIpRoute(filter) {
            const m = M();
            if (m.sw && !m.ipRouting) return 'Default gateway is ' + (m.defaultGw || 'not set') + '\n\nHost               Gateway           Last Use    Total Uses  Interface\nICMP redirect cache is empty';
            const R = rib(), d = R.find(r => r.len === 0);
            const L = ['Codes: L - local, C - connected, S - static, R - RIP, M - mobile, B - BGP',
                '       D - EIGRP, EX - EIGRP external, O - OSPF, IA - OSPF inter area',
                '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2',
                '       E1 - OSPF external type 1, E2 - OSPF external type 2',
                '       i - IS-IS, su - IS-IS summary, L1 - IS-IS level-1, L2 - IS-IS level-2',
                '       * - candidate default, U - per-user static route, o - ODR',
                '       P - periodic downloaded static route, + - replicated route', '',
                d ? 'Gateway of last resort is ' + d.nh + ' to network 0.0.0.0' : 'Gateway of last resort is not set', ''];
            R.filter(r => !filter || (filter === 'static' ? /^S/.test(r.c) : /^[CL]$/.test(r.c))).forEach(r => L.push(r.cont ? ' '.repeat(9 + (r.net + '/' + r.len).length + 1) + r.via.replace(/^\[/, '[') : pad(r.c, 9) + r.net + '/' + r.len + ' ' + r.via));
            return L.join('\n');
        }
        function ping(ip) {
            const m = M(), hosts = S.lab.hosts || [];
            const head = 'Type escape sequence to abort.\nSending 5, 100-byte ICMP Echos to ' + ip + ', timeout is 2 seconds:\n';
            const ok = (first) => head + (first ? '.!!!!\nSuccess rate is 80 percent (4/5), round-trip min/avg/max = 1/1/2 ms' : '!!!!!\nSuccess rate is 100 percent (5/5), round-trip min/avg/max = 1/1/2 ms');
            const fail = head + '.....\nSuccess rate is 0 percent (0/5)';
            const failL = () => { log({ ping: { ip, ok: false } }); return fail; };
            if (Object.entries(m.ifs).some(([n, i]) => i.ip === ip && ifUp(n))) { log({ ping: { ip, ok: true } }); return ok(false); }
            let target = ip;
            if (m.sw && !m.ipRouting) {
                const svi = Object.entries(m.ifs).find(([n, i]) => n.startsWith('Vlan') && i.ip && ifUp(n) && sameNet(i.ip, ip, maskLen(i.mask)));
                if (!svi) { if (!m.defaultGw) return failL(); target = m.defaultGw; }
                const s2 = Object.entries(m.ifs).find(([n, i]) => n.startsWith('Vlan') && i.ip && ifUp(n) && sameNet(i.ip, target, maskLen(i.mask)));
                if (!s2 || !hosts.includes(target) || !hosts.includes(ip)) return failL();
            } else {
                const r = rib().filter(x => x.c !== 'L' && (x.len === 0 || sameNet(x.net, ip, x.len))).sort((a, b) => b.len - a.len)[0];
                if (!r || !hosts.includes(ip)) return failL();
                if (r.nh && isIp(r.nh) && !hosts.includes(r.nh)) return failL();
            }
            const first = !S.arp[target]; S.arp[target] = true;
            log({ ping: { ip, ok: true } });
            return ok(first);
        }

        // ═══ Yürütme ═════════════════════════════════════════════════════════
        const PIPE = [['include', 'i'], ['exclude', 'e'], ['begin', 'b'], ['section', 's']];
        function applyPipe(out, spec, colBase) {
            const m = spec.match(/^\s*(\S+)\s*(.*)$/);
            if (!m) return { err: 'incomplete' };
            const f = PIPE.find(([w]) => w.startsWith(m[1].toLowerCase()));
            if (!f) return { err: 'invalid', col: colBase + spec.indexOf(m[1]) };
            if (!m[2]) return { err: 'incomplete' };
            let re; try { re = new RegExp(m[2]); } catch (e) { re = { test: s => s.includes(m[2]) }; }
            const lines = out.split('\n');
            if (f[0] === 'include') return { out: lines.filter(l => re.test(l)).join('\n') };
            if (f[0] === 'exclude') return { out: lines.filter(l => !re.test(l)).join('\n') };
            if (f[0] === 'begin') { const k = lines.findIndex(l => re.test(l)); return { out: k < 0 ? '' : lines.slice(k).join('\n') }; }
            const res = []; let take = false;
            for (const l of lines) { if (!/^\s/.test(l)) take = re.test(l); else if (take) { res.push(l); continue; } if (take) res.push(l); }
            return { out: res.join('\n') };
        }
        // Belirli komut listesiyle bir satırı çalıştır. off = gösterimdeki sütun kayması (do için 3)
        function execLine(raw, list, modeName, off) {
            let body = raw, pipe = null, pcol = 0;
            const pi = raw.indexOf('|');
            if (pi > 0) { body = raw.slice(0, pi).replace(/\s+$/, ''); pipe = raw.slice(pi + 1); pcol = pi + 1; }
            const r = C.match(avail(list), body, ctx);
            if (!r.ok) return errText(r, raw, off, modeName, list);
            if (pipe !== null && !/^show /.test(r.canon)) return errText({ err: 'invalid', col: pi }, raw, off);
            log({ raw, canon: (off ? 'do ' : '') + r.canon + (pipe !== null ? ' | ' + pipe.trim() : ''), mode: S.mode, via: off ? 'do' : null });
            let out = r.cmd.run(r.args) || '';
            if (typeof out === 'object') return errText(out, raw, off);
            if (pipe !== null) {
                const p = applyPipe(out, pipe, pcol);
                if (p.err) return errText(p, raw, off);
                out = p.out;
            }
            return out;
        }
        function errText(r, raw, off, modeName) {
            const pl = promptText().length + (off || 0);
            log({ raw, err: r.err, mode: S.mode });
            if (r.err === 'amb') return '% Ambiguous command:  "' + raw.trim() + '"';
            if (r.err === 'incomplete') return '% Incomplete command.';
            if (r.err === 'empty') return '';
            if (unsupported(raw)) return '% [Simülatör] Bu komut gerçek IOS\'ta var ama bu lab sürümünde henüz desteklenmiyor. ? ile desteklenenleri görün.';
            if ((modeName === 'user' || modeName === 'priv') && !off && C.tokenize(raw).length === 1)
                return (M().domainLookup ? 'Translating "' + raw.trim() + '"...domain server (255.255.255.255)\n' : '') + '% Unknown command or computer name, or unable to find computer address';
            return ' '.repeat(pl + (r.col || 0)) + '^\n% Invalid input detected at \'^\' marker.';
        }
        const UNSUP = ['snmp-server', 'ntp', 'logging host', 'logging trap', 'clock timezone', 'cdp', 'lldp', 'ip dhcp',
            'router eigrp', 'router bgp', 'router rip', 'standby', 'channel-group', 'crypto isakmp', 'crypto ipsec', 'crypto map', 'ipv6', 'vtp', 'monitor session', 'archive',
            'switchport port-security', 'ip helper-address', 'ip ospf', 'encapsulation', 'show cdp', 'show lldp', 'show ip ospf',
            'show etherchannel', 'show spanning-tree', 'show port-security', 'show ip dhcp', 'show standby', 'show interfaces counters', 'show mac address-table', 'show arp', 'debug', 'traceroute', 'clear'];
        function unsupported(raw) {
            const t = C.tokenize(raw.replace(/^\s*(no|do)\s+/i, '')).map(x => x.t.toLowerCase());
            // yazılan kelime tam kelimeyse (ör. 'ip') daha uzun köke ('ipv6') eşlenmez
            return UNSUP.some(u => { const w = u.split(' '); return w.length <= t.length && w.every((x, k) => x === t[k] || (x.startsWith(t[k]) && t[k].length >= 2 && !['ip', 'no', 'do'].includes(t[k]))); });
        }

        function promptText() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            return M().hostname + PROMPT[S.mode];
        }

        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw: p.secret ? '***' : raw, prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) return afterLogin();
            if (raw === '\x1a') { if (S.mode !== 'user' && S.mode !== 'priv') { S.mode = 'priv'; S.ctx = []; } return ''; }
            const line = raw.replace(/\s+$/, '');
            if (!line.trim()) return '';
            S.hist.push(line.trim());
            if (S.mode === 'user') return execLine(line, EXEC_USER, 'user', 0);
            if (S.mode === 'priv') return execLine(line, EXEC_PRIV, 'priv', 0);
            return cfgLine(line);
        }
        function cfgLine(line) {
            const toks = C.tokenize(line);
            const isNo = toks[0].t.toLowerCase() === 'no' && toks.length > 1;
            const body = isNo ? line.slice(toks[1].o) : line;
            const off = isNo ? toks[1].o : 0;
            const tryIn = (list) => C.match(avail(list, isNo), body, ctx, isNo);
            let r = tryIn(MODES[S.mode]);
            let fell = false;
            if (!r.ok && S.mode !== 'config') {
                const r2 = tryIn(CONFIG);
                if (r2.ok) { r = r2; fell = true; }
                else if ((r2.col || 0) > (r.col || 0) && r.err !== 'incomplete') r = r2;
            }
            if (!r.ok) return errText(Object.assign({}, r, { col: (r.col || 0) + off }), line, 0, S.mode);
            const prevMode = S.mode, prevCtx = S.ctx;
            if (fell) { S.mode = 'config'; S.ctx = []; }
            S.lastBody = body;
            log({ raw: line, canon: (isNo ? 'no ' : '') + r.canon, mode: S.mode, no: isNo, ctx: S.ctx.slice() });
            const out = isNo ? (r.cmd.no ? r.cmd.no(r.args) : undefined) : r.cmd.run(r.args);
            if (out && typeof out === 'object') { S.mode = prevMode; S.ctx = prevCtx; S.ev.pop(); return errText(Object.assign({}, out, { col: (out.col || 0) + off }), line, 0, S.mode); }
            const evs = [bpduEvents(), psecEvents()].filter(Boolean).join('\n');
            return [out || '', evs].filter(Boolean).join('\n');
        }
        function help(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            let list, body = raw, prefix = '';
            if (S.mode === 'user') list = EXEC_USER;
            else if (S.mode === 'priv') list = EXEC_PRIV;
            else {
                const toks = C.tokenize(raw);
                if (toks.length && toks[0].t.toLowerCase() === 'no' && (toks.length > 1 || /\s$/.test(raw))) { body = raw.slice(toks[1] ? toks[1].o : raw.length); list = avail(MODES[S.mode], true); prefix = 'no'; }
                else if (toks.length && 'do'.startsWith(toks[0].t.toLowerCase()) && toks[0].t.toLowerCase() === 'do' && (toks.length > 1 || /\s$/.test(raw))) { body = raw.slice(toks[1] ? toks[1].o : raw.length); list = EXEC_PRIV; }
                else list = MODES[S.mode];
            }
            if (!prefix) list = avail(list);
            const kh = (w, a, e) => w ? (KW[w] || (a.c.h || '')) : (e ? (VARH[e.k] || (e.k === 'int' ? 'Sayı' : '')) : '');
            const h = C.help(list, body, ctx, kh);
            if (h.amb) return '% Ambiguous command:  "' + raw.trim() + '"';
            if (h.none) return '% Unrecognized command';
            if (h.words) return h.words.join('  ');
            return h.rows.map(([w, d]) => '  ' + pad(w, 22) + d).join('\n');
        }
        function complete(raw) {
            if (S.pending || S.loggedOut) return null;
            let list = S.mode === 'user' ? EXEC_USER : S.mode === 'priv' ? EXEC_PRIV : MODES[S.mode];
            const toks = C.tokenize(raw);
            if (S.mode !== 'user' && S.mode !== 'priv' && toks.length > 1 && toks[0].t.toLowerCase() === 'no') {
                const r = C.complete(avail(list, true), raw.slice(toks[1].o), ctx, IF_ORDER);
                return r === null ? null : raw.slice(0, toks[1].o) + r;
            }
            if (S.mode !== 'user' && S.mode !== 'priv' && toks.length > 1 && toks[0].t.toLowerCase() === 'do') {
                const r = C.complete(avail(EXEC_PRIV), raw.slice(toks[1].o), ctx, IF_ORDER);
                return r === null ? null : raw.slice(0, toks[1].o) + r;
            }
            const r = C.complete(avail(list), raw, ctx, IF_ORDER);
            // alt moddayken global komut da tamamlanır (IOS üst moda düşmeyi kabul eder)
            return r === null && S.mode !== 'user' && S.mode !== 'priv' && S.mode !== 'config' ? C.complete(avail(CONFIG), raw, ctx, IF_ORDER) : r;
        }

        // Başlangıç yapılandırması (lab.start: priv/config komutları) — olay kaydına girmez
        function apply(cmds, markSaved) {
            const keepMode = S.mode;
            S.mode = 'priv';
            for (const c of cmds) input(c);
            S.mode = keepMode; S.ctx = []; S.ev = []; S.hist = [];
            if (markSaved) save();
        }
        if (lab.start) apply(['configure terminal'].concat(lab.start, ['end']), !!lab.startSaved);

        // ── Görev kontrolleri için olay API'si
        const E = {
            ran: (re) => S.ev.some(e => e.canon && re.test(e.canon)),
            ranRaw: (re) => S.ev.some(e => e.canon && re.test(e.raw.trim())),
            abbrev: (canon) => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon),
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            err: (k) => S.ev.some(e => e.err === k),
            after: (reA, reB) => { const i = S.ev.findIndex(e => e.canon && reA.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && reB.test(e.canon)); },
            afterErr: (re) => { const i = S.ev.findIndex(e => e.err === 'invalid'); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            ranIn: (re, mode) => S.ev.some(e => e.canon && re.test(e.canon) && e.mode === mode),
            list: () => S.ev
        };

        return {
            vendor: 'cisco-ios',
            prompt: promptText,
            secret: () => !!(S.pending && S.pending.secret),
            input, help, complete,
            _toPriv: () => { S.mode = 'priv'; S.ctx = []; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers || (S.answers = {}); }, set answers(v) { S.answers = v || {}; }, variant: () => VAR,

            get model() { return S.m; },
            get startupModel() { return S.startup; },
            ev: E,
            saved,
            mode: () => S.mode,
            run: (n) => ({ up: ifUp(n) }),
            rib, lookup, forward: f => forward(f, false), acl: n => M().acls[n] || null,
            dhcpLeases: () => dhcpLeases(), psec: n => psecEval(n), macRows: () => macRows(), flash: () => Object.keys(S.flash), archives: () => S.archives.map(a => a.name),
            aaaAuth: (list, u, p) => aaaAuth(M().authn[list] || [], u, p),
            aclTest: (n, f) => aclEval(n, Object.assign({ sport: 50000, proto: 'tcp', n: 0 }, f), false),
            showRun: runBody,
        };
    }

    return { session, ifNorm, ifShort };
})();
// Motor kayıt defteri: vendor anahtarı → motor (test kapısı ve arayüz buradan bulur)
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'cisco-ios': CgLabIos });
if (typeof module !== 'undefined') module.exports = CgLabIos;
