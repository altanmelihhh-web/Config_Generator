'use strict';
// ─── CLI Lab içerikleri: Palo Alto PAN-OS (PA-VM, PAN-OS 11.1 görünümü) ─────
// Kontroller RUNNING (commit edilmiş) yapılandırmaya ve olay kaydına bakar: PAN-OS'ta commit edilmeyen değişiklik uygulanmaz.
// s.val('yol', 'cand'?) · s.decide(akış) trafik kararı (NAT dahil) · s.iface(ad) · s.route(ip) · s.mgmtAllows(arayüz, hizmet) · s.rules()
// Adresler: yalnız güvenli örnek bloklar (bkz. docs/AGENT-URETIM-KURALLARI.md).
(function () {
    const has = (s, p, w) => s.val(p, w) !== undefined;
    const arr = (s, p, w) => { const v = s.val(p, w); return Array.isArray(v) ? v : []; };
    const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
    const lastIdx = (s, f) => { const L = s.ev.list(); for (let i = L.length - 1; i >= 0; i--) if (f(L[i])) return i; return -1; };
    // Dışarıdan (untrust/any) application any ile allow veren kural var mı? ("any/any" kaçamak düzeltmesi)
    const openAny = s => s.rules().some(n => { const f = arr(s, 'rulebase security rules ' + n + ' from'); return (f.includes('untrust') || f.includes('any')) && arr(s, 'rulebase security rules ' + n + ' application').includes('any') && s.val('rulebase security rules ' + n + ' action') === 'allow' && s.val('rulebase security rules ' + n + ' disabled') !== 'yes'; });
    // Dış istemcinin isteği gerçekten DMZ sunucusuna ulaşıyor mu (DNAT uygulandı + izin)
    const webOk = s => { const d = s.decide(IN); return d.stage === 'allowed' && d.dst2 === '172.24.50.10'; };
    const tested = (s, re, res) => s.ev.list().some(e => e.canon && re.test(e.canon) && (res === undefined || e.res === res));
    const OUT = { src: '10.64.10.50', dst: '198.51.100.80', dport: 443, app: 'ssl' };
    const IN = { src: '198.51.100.7', dst: '203.0.113.10', dport: 443, app: 'ssl' };
    const C = cmds => ['configure'].concat(cmds, ['commit', 'exit']);
    // Ortak başlangıç: arayüzler, zone'lar, sanal yönlendirici, varsayılan rota
    const BASE = ['set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24', 'set network interface ethernet ethernet1/1 comment WAN',
        'set network interface ethernet ethernet1/2 layer3 ip 10.64.10.1/24', 'set network interface ethernet ethernet1/2 comment LAN',
        'set network interface ethernet ethernet1/3 layer3 ip 172.24.50.1/24', 'set network interface ethernet ethernet1/3 comment DMZ',
        'set zone untrust network layer3 ethernet1/1', 'set zone trust network layer3 ethernet1/2', 'set zone dmz network layer3 ethernet1/3',
        'set network virtual-router default interface [ ethernet1/1 ethernet1/2 ethernet1/3 ]',
        'set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1'];
    const OBJ = ['set address LAN-NET ip-netmask 10.64.10.0/24', 'set address WEB-SRV ip-netmask 172.24.50.10/32'];
    const WEBOUT = ['set rulebase security rules WEB-OUT from trust to untrust source LAN-NET destination any application [ web-browsing ssl dns ] service application-default action allow'];
    const SNAT = ['set rulebase nat rules SNAT-OUT from trust to untrust source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1'];
    const DNAT = zone => ['set rulebase nat rules WEB-DNAT from untrust to ' + zone + ' source any destination 203.0.113.10 service service-https destination-translation translated-address WEB-SRV'];
    const WEBIN = (to, dst) => ['set rulebase security rules WEB-IN from untrust to ' + to + ' source any destination ' + dst + ' application ssl service application-default action allow'];
    const UP = ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], HOSTS = ['203.0.113.1', '198.51.100.80', '198.51.100.7', '172.24.50.10', '10.64.10.50'];
    const FLOWS = [OUT, { src: '10.64.10.51', dst: '198.51.100.80', dport: 80, app: 'web-browsing' }, IN];

    const LABS = [
    // ═══ Seviye 0 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-01', vendor: 'paloalto', level: 0, title: 'PAN-OS CLI: modlar, candidate ve commit', minutes: 20, kind: 'firewall', hostname: 'PA-VM', ordered: true, up: ['ethernet1/1'],
        story: 'Bir PA-VM güvenlik duvarına SSH ile bağlandınız: <code>admin@PA-VM&gt;</code>. PAN-OS\'ta <b>operasyonel</b> (<code>&gt;</code>) ve <b>yapılandırma</b> (<code>#</code>, <code>configure</code>) modları vardır. Yapılandırmada yazılanlar <b>candidate</b> yapılandırmada birikir; <code>commit</code> onu <b>running</b> yapar. Commit edilmemiş değişiklik oturumdan çıksanız da candidate\'te bekler.',
        goals: ['show system info ile cihazı tanımak', '? ile komut keşfetmek', 'candidate / running farkını görmek (show config diff)', 'commit ve iş (job) takibi', 'set biçiminde çıktı, revert config ve validate'],
        tasks: [
            { t: 'Cihazın modelini, seri numarasını ve PAN-OS sürümünü görüntüleyin.',
              why: '<code>show system info</code> sürüm, model, seri no ve içerik (App-ID) sürümünü verir; destek kaydında ve yükseltme planında ilk bakılan çıktıdır.',
              hints: ['show system …', '<code>show system info</code>'], steps: ['show system info'],
              check: s => s.ev.ran(/^show system info$/) },
            { t: '<kbd>?</kbd> ile <code>show</code> altındaki seçenekleri listeleyin.',
              why: '<kbd>?</kbd> o noktadaki seçenekleri gösterir: <code>&gt;</code> ile başlayanların altında başka seçenekler vardır, <code>+</code> isteğe bağlı parametredir, <code>&lt;Enter&gt;</code> komutun burada bitebileceğini söyler.',
              hints: ['Soru işareti anında yardım açar.', '<code>show ?</code>'], steps: [{ help: 'show ' }],
              check: s => s.ev.helped(/^\s*sh\S*\s/) },
            { t: '<code>configure</code> ile yapılandırmaya girin, cihaz adını <code>PA-FW</code> yapın, <code>exit</code> ile çıkın ve <code>show config diff</code> ile bekleyen farkı görün. İstem henüz değişmemeli.',
              why: '<code>set</code> yalnız candidate\'i değiştirir; istem running\'deki adı gösterir. <code>show config diff</code> candidate ile running arasındaki farkı listeler; commit öncesi gözden geçirmenin yoludur.',
              hints: ['deviceconfig system hostname', '<code>configure</code> · <code>set deviceconfig system hostname PA-FW</code> · <code>exit</code> · <code>show config diff</code>'],
              steps: ['configure', 'set deviceconfig system hostname PA-FW', 'exit', 'show config diff'],
              check: s => { const L = s.ev.list(), i = L.findIndex(e => e.canon === 'set deviceconfig system hostname PA-FW'); if (i < 0) return false; const j = L.findIndex((e, k) => k > i && e.canon === 'show config diff'), c = L.findIndex((e, k) => k > i && e.commit); return j > i && (c < 0 || j < c); } },
            { t: 'Değişikliği <code>commit</code> ile uygulayın. "Configuration committed successfully" iletisini ve yeni istemi (<code>admin@PA-FW#</code>) görün.',
              why: 'PAN-OS commit\'i bir <b>iş</b> (job) olarak kuyruğa alır ("Commit job N is in progress"); doğrulama ve uygulama bitince sonuç yazılır. <code>show jobs all</code> geçmiş işleri listeler.',
              hints: ['Yapılandırma modunda commit.', '<code>configure</code> · <code>commit</code> · <code>exit</code>'],
              steps: ['configure', 'commit', 'exit'],
              check: s => s.val('deviceconfig system hostname') === 'PA-FW' && s.ev.commit('ok') },
            { t: 'Çıktıyı set komutları biçimine çevirin (<code>set cli config-output-format set</code>) ve <code>show config running</code> ile running yapılandırmayı görün.',
              why: 'Varsayılan çıktı süslü parantezli hiyerarşidir; set biçimi tek satırlık komutlar verir: aramak, kopyalamak ve başka cihaza uygulamak kolaylaşır. Bu ayar yalnız CLI oturumunuzu etkiler, yapılandırmayı değil.',
              hints: ['Operasyonel modda set cli …', '<code>set cli config-output-format set</code> · <code>show config running</code>'],
              steps: ['set cli config-output-format set', 'show config running'],
              check: s => s.ev.list().some(e => e.canon === 'show config running' && e.fmt === 'set') },
            { t: 'Hata yapın ve geri alın: cihaz adını candidate\'te <code>YANLIS</code> yapın, sonra <code>revert config</code> ile candidate\'i running\'e döndürün.',
              why: '<code>revert config</code> commit edilmemiş tüm değişiklikleri atar (candidate = running). Commit etmediğiniz sürece cihaz etkilenmez.',
              hints: ['Yapılandırma modunda revert.', '<code>set deviceconfig system hostname YANLIS</code> · <code>revert config</code> · <code>show deviceconfig system</code>'],
              steps: ['configure', 'set deviceconfig system hostname YANLIS', 'revert config', 'show deviceconfig system', 'exit'],
              check: s => s.ev.after(/^set deviceconfig system hostname YANLIS$/, /^revert config$/) && s.val('deviceconfig system hostname', 'cand') !== 'YANLIS' && s.val('deviceconfig system hostname') !== 'YANLIS' },
            { t: 'Commit etmeden doğrulayın: yapılandırma modunda <code>validate full</code>, ardından <code>run show jobs all</code> ile işin sonucunu (FIN / OK) görün.',
              why: '<code>validate full</code> commit\'in doğrulama aşamasını uygulamadan çalıştırır: eksik referans ("is not a valid reference") gibi hataları üretim saatini beklemeden bulursunuz.',
              hints: ['validate full + jobs', '<code>configure</code> · <code>validate full</code> · <code>run show jobs all</code>'],
              steps: ['configure', 'validate full', 'run show jobs all', 'exit'],
              check: s => s.ev.ran(/^validate full$/) && s.ev.after(/^validate full$/, /^show jobs (all|id \d+)$/) },
        ],
        solution: ['show system info', { help: 'show ' }, 'configure', 'set deviceconfig system hostname PA-FW', 'exit', 'show config diff', 'configure', 'commit', 'exit',
            'set cli config-output-format set', 'show config running', 'configure', 'set deviceconfig system hostname YANLIS', 'revert config', 'show deviceconfig system', 'validate full', 'run show jobs all', 'exit'],
        verify: ['show system info', 'show config diff', 'show config running', 'show jobs all'],
        learn: ['<code>&gt;</code> operasyonel, <code>#</code> yapılandırma; <code>run</code> ile yapılandırmadan operasyonel komut.', 'set candidate\'i değiştirir; commit running yapar (iş/job olarak).', '<code>show config diff</code> commit öncesi fark.', '<code>revert config</code> commit edilmemiş değişiklikleri atar.', '<code>validate full</code> commit etmeden doğrular.'],
        links: { cli: '#/cli/paloalto' }, cert: 'PCNSA / NetSec Analyst'
    },
    // ═══ Seviye 1 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-02', vendor: 'paloalto', level: 1, title: 'L3 arayüz, zone, sanal yönlendirici ve yönetim profili', minutes: 25, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-01'],
        up: ['ethernet1/1', 'ethernet1/2'], hosts: ['203.0.113.1', '198.51.100.80', '10.64.10.20'],
        story: 'PAN-OS\'ta bir arayüzün trafik geçirmesi için üç şey gerekir: <b>katman 3 adres</b>, bir <b>zone</b> ve bir <b>sanal yönlendirici</b> (virtual-router). Biri eksikse arayüz up görünür ama trafik sayılmaz. ethernet1/1 internete (ağ geçidi 203.0.113.1), ethernet1/2 iç ağa bağlı. İç ağdan cihaza ping ve SSH izni de bir <b>yönetim profili</b> ile verilir.',
        goals: ['ethernet … layer3 ip', 'zone … network layer3', 'virtual-router interface ve static-route', 'interface-management-profile', 'show routing route / test routing fib-lookup'],
        tasks: [
            { t: 'Adresler: <code>ethernet1/1</code> → <code>203.0.113.2/24</code>, <code>ethernet1/2</code> → <code>10.64.10.1/24</code>. Commit edin.',
              why: 'Veri arayüzleri varsayılan olarak hiçbir modda değildir; <code>layer3 ip</code> hem modu (L3) hem adresi verir.',
              hints: ['network interface ethernet <ad> layer3 ip <ip/uz>', '<code>set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24</code>'],
              steps: C(['set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24', 'set network interface ethernet ethernet1/2 layer3 ip 10.64.10.1/24']),
              check: s => same(arr(s, 'network interface ethernet ethernet1/1 layer3 ip'), ['203.0.113.2/24']) && same(arr(s, 'network interface ethernet ethernet1/2 layer3 ip'), ['10.64.10.1/24']) },
            { t: 'Zone\'lar: <code>untrust</code> ← ethernet1/1, <code>trust</code> ← ethernet1/2. Commit edin.',
              why: 'Güvenlik kuralları zone\'dan zone\'a yazılır. Zone\'a yalnız aynı tipte (layer3) arayüz girer; katman 3 olmayan arayüzü eklemek commit\'i durdurur.',
              hints: ['zone <ad> network layer3 <arayüz>', '<code>set zone untrust network layer3 ethernet1/1</code> · <code>set zone trust network layer3 ethernet1/2</code>'],
              steps: C(['set zone untrust network layer3 ethernet1/1', 'set zone trust network layer3 ethernet1/2']), needs: [0],
              check: s => s.iface('ethernet1/1').zone === 'untrust' && s.iface('ethernet1/2').zone === 'trust' },
            { t: 'İki arayüzü de <code>default</code> sanal yönlendiriciye ekleyin. Commit edin.',
              why: 'Sanal yönlendiriciye (VR) eklenmeyen arayüzün bağlı ağı yönlendirme tablosuna girmez; o arayüzden gelen paket için rota bulunamaz. "Arayüz up ama trafik yok" arızasının klasik nedeni.',
              hints: ['network virtual-router default interface [ … ]', '<code>set network virtual-router default interface [ ethernet1/1 ethernet1/2 ]</code>'],
              steps: C(['set network virtual-router default interface [ ethernet1/1 ethernet1/2 ]']), needs: [0],
              check: s => s.iface('ethernet1/1').vr === 'default' && s.iface('ethernet1/2').vr === 'default' },
            { t: 'Varsayılan rota <code>DEFAULT</code>: <code>0.0.0.0/0</code> → <code>203.0.113.1</code>. Commit edin.',
              why: 'Statik rota VR\'ın <code>routing-table ip static-route</code> altında adla tanımlanır; sonraki atlama VR\'daki bir bağlı ağda olmalı. Varsayılan metrik ve yönetsel mesafe 10\'dur.',
              hints: ['… routing-table ip static-route <ad> destination … nexthop ip-address …', '<code>set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1</code>'],
              steps: C(['set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1']), needs: [0, 2],
              check: s => { const r = s.route('198.51.100.80'); return !!r && r.iface === 'ethernet1/1' && r.nh === '203.0.113.1'; },
              fb: s => (has(s, 'network virtual-router default routing-table ip static-route DEFAULT') && !s.route('198.51.100.80') ? 'Rota tanımlı ama tabloda yok: ethernet1/1 VR\'da mı, sonraki atlama bağlı ağda mı?' : null) },
            { t: 'Yönetim profili <code>PING-SSH</code> (ping yes, ssh yes) oluşturun ve <b>yalnız</b> ethernet1/2\'ye (LAN) bağlayın. Commit edin.',
              why: 'Veri arayüzleri varsayılan olarak cihazın kendisine gelen ping/SSH\'a cevap vermez. Yönetim profili hangi hizmetlerin açık olacağını belirler; internete bakan arayüze SSH açmak saldırı yüzeyidir.',
              hints: ['network profiles interface-management-profile … + arayüzde interface-management-profile', '<code>set network profiles interface-management-profile PING-SSH ping yes ssh yes</code> · <code>set network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH</code>'],
              steps: C(['set network profiles interface-management-profile PING-SSH ping yes ssh yes', 'set network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH']), needs: [0],
              check: s => s.mgmtAllows('ethernet1/2', 'ping') && s.mgmtAllows('ethernet1/2', 'ssh') && !s.mgmtAllows('ethernet1/1', 'ssh'),
              fb: s => (s.mgmtAllows('ethernet1/1', 'ssh') ? 'İnternete bakan ethernet1/1\'de SSH açık: profili oradan kaldırın.' : null) },
            { t: 'Doğrulayın: <code>show routing route</code> ve <code>test routing fib-lookup virtual-router default ip 198.51.100.80</code>.',
              why: 'RIB (<code>show routing route</code>) tüm rotaları, FIB araması ise belirli bir hedefe gerçekte hangi arayüzden çıkılacağını gösterir: "bu paket nereye gider?" sorusunun cevabı.',
              hints: ['Tablo + tek hedef araması.', '<code>show routing route</code> · <code>test routing fib-lookup virtual-router default ip 198.51.100.80</code>'],
              steps: ['show routing route', 'test routing fib-lookup virtual-router default ip 198.51.100.80'], needs: [0, 2, 3],
              check: s => s.ev.ran(/^show routing route/) && tested(s, /^test routing fib-lookup/, 'ethernet1/1') },
        ],
        verify: ['show interface all', 'show interface ethernet1/2', 'show routing route', 'test routing fib-lookup virtual-router default ip 198.51.100.80'],
        learn: ['Trafik için: L3 adres + zone + virtual-router.', 'Zone\'a yalnız aynı tip (layer3) arayüz.', 'Statik rota VR altında adla; sonraki atlama bağlı ağda.', 'Cihaza ping/SSH: interface-management-profile; WAN\'da kapalı.'],
        links: { tool: '#/paloalto/interface', cli: '#/cli/paloalto' }, cert: 'PCNSA / NetSec Analyst'
    },
    // ═══ Seviye 2 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-03', vendor: 'paloalto', level: 2, title: 'Nesneler ve güvenlik kuralı: App-ID ve application-default', minutes: 25, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-02'],
        up: UP, hosts: HOSTS, start: BASE,
        story: 'Arayüzler, zone\'lar (untrust / trust / dmz) ve rota hazır. PAN-OS kuralları port değil <b>uygulama</b> (App-ID) ile yazılır; <code>service application-default</code> uygulamaya yalnız kendi standart portunda izin verir. LAN kullanıcıları web\'e çıkacak; DMZ\'deki uygulama ise standart dışı 8443 portunda SSL çalışıyor.',
        goals: ['address nesneleri', 'Özel servis (tcp/8443)', 'application + service application-default', 'Standart dışı port için özel servis', 'test security-policy-match ile doğrulama'],
        tasks: [
            { t: 'Adres nesneleri: <code>LAN-NET</code> = <code>10.64.10.0/24</code>, <code>WEB-SRV</code> = <code>172.24.50.10/32</code>. Commit edin.',
              why: 'Kurallarda IP yerine nesne kullanılır; adres değişince tek yerden güncellenir ve kural okunur olur.',
              hints: ['address <ad> ip-netmask <ip/uz>', '<code>set address LAN-NET ip-netmask 10.64.10.0/24</code> · <code>set address WEB-SRV ip-netmask 172.24.50.10/32</code>'],
              steps: C(OBJ),
              check: s => s.val('address LAN-NET ip-netmask') === '10.64.10.0/24' && s.val('address WEB-SRV ip-netmask') === '172.24.50.10/32' },
            { t: 'Özel servis <code>SVC-TCP-8443</code>: TCP hedef port <code>8443</code>. Commit edin.',
              why: 'Uygulama standart dışı bir portta çalışıyorsa application-default onu eşleştirmez; kuralda o portu tanımlayan özel servis gerekir.',
              hints: ['service <ad> protocol tcp port <n>', '<code>set service SVC-TCP-8443 protocol tcp port 8443</code>'],
              steps: C(['set service SVC-TCP-8443 protocol tcp port 8443']),
              check: s => s.val('service SVC-TCP-8443 protocol tcp port') === '8443' },
            { t: 'Kural <code>WEB-OUT</code>: trust → untrust, kaynak <code>LAN-NET</code>, hedef <code>any</code>, uygulama <code>web-browsing ssl</code>, servis <code>application-default</code>, eylem <code>allow</code>. Commit edin.',
              why: 'Uygulama + application-default: web-browsing yalnız 80\'de, ssl yalnız 443\'te izinli. <code>service any</code> yazmak aynı uygulamanın rastgele portlarda (tünelleme) çalışmasına da izin verir.',
              hints: ['rulebase security rules <ad> from … to … source … destination … application […] service … action …', '<code>set rulebase security rules WEB-OUT from trust to untrust source LAN-NET destination any application [ web-browsing ssl ] service application-default action allow</code>'],
              steps: C(['set rulebase security rules WEB-OUT from trust to untrust source LAN-NET destination any application [ web-browsing ssl ] service application-default action allow']), needs: [0],
              check: s => { const a = s.decide(OUT), b = s.decide({ src: '10.64.10.50', dst: '198.51.100.80', dport: 80, app: 'web-browsing' }), c = s.decide({ src: '10.64.10.50', dst: '198.51.100.80', dport: 8080, app: 'web-browsing' }); return a.rule === 'WEB-OUT' && b.rule === 'WEB-OUT' && c.rule !== 'WEB-OUT'; },
              fb: s => { const c = s.decide({ src: '10.64.10.50', dst: '198.51.100.80', dport: 8080, app: 'web-browsing' }); return c.rule === 'WEB-OUT' ? 'Kural web\'i standart dışı portta da geçiriyor: service application-default olmalı.' : null; } },
            { t: 'Kural <code>APP-8443</code>: trust → dmz, kaynak <code>LAN-NET</code>, hedef <code>WEB-SRV</code>, uygulama <code>ssl</code>, servis <code>SVC-TCP-8443</code>, allow. Commit edin.',
              why: 'ssl\'in varsayılan portu 443\'tür; 8443\'teki SSL, application-default ile eşleşmez ve kural atlanır (interzone-default ile düşer). Özel servis portu açıkça tanımlar, App-ID yine uygulamayı doğrular.',
              hints: ['service alanına özel servis.', '<code>set rulebase security rules APP-8443 from trust to dmz source LAN-NET destination WEB-SRV application ssl service SVC-TCP-8443 action allow</code>'],
              steps: C(['set rulebase security rules APP-8443 from trust to dmz source LAN-NET destination WEB-SRV application ssl service SVC-TCP-8443 action allow']), needs: [0, 1],
              check: s => { const d = s.decide({ src: '10.64.10.50', dst: '172.24.50.10', dport: 8443, app: 'ssl' }); return d.stage === 'allowed' && d.rule === 'APP-8443'; },
              fb: s => (arr(s, 'rulebase security rules APP-8443 service').includes('application-default') ? 'application-default ssl için yalnız 443\'ü kabul eder: 8443 eşleşmez. SVC-TCP-8443 kullanın.' : null) },
            { t: 'Doğrulayın: <code>test security-policy-match</code> ile 10.64.10.50 → 172.24.50.10 tcp/8443 (application ssl) akışının <code>APP-8443</code>\'e düştüğünü görün.',
              why: 'Test komutu, trafik üretmeden commit edilmiş kurallar arasında ilk eşleşeni gösterir. Protokol numarayla verilir (6 = TCP, 17 = UDP, 1 = ICMP).',
              hints: ['from, to, source, destination, destination-port, protocol, application', '<code>test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 8443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 8443 protocol 6 application ssl'], needs: [0, 1, 3],
              check: s => tested(s, /^test security-policy-match/, 'APP-8443') },
        ],
        verify: ['show rulebase security', 'test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl', 'show config running'],
        learn: ['Kurallar App-ID ile yazılır; service application-default uygulamanın standart portu.', 'Standart dışı port: özel servis nesnesi.', 'Eşleşmeyen trafik: interzone-default (deny); aynı zone içi: intrazone-default (allow).', 'test security-policy-match trafik üretmeden kuralı gösterir.'],
        links: { tool: '#/paloalto/policy', cli: '#/cli/paloalto' }, cert: 'PCNSA / NetSec Analyst'
    },
    // ═══ Seviye 3 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-04', vendor: 'paloalto', level: 3, title: 'NAT: kaynak (DIPP) ve hedef NAT — pre-NAT IP, post-NAT zone', minutes: 30, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-03'],
        up: UP, hosts: HOSTS, sim: { flows: FLOWS }, start: BASE.concat(OBJ, WEBOUT),
        story: 'LAN kullanıcıları internete çıkabilmeli (kaynak adres WAN IP\'sine çevrilecek) ve DMZ\'deki web sunucusu (172.24.50.10) dışarıdan <code>203.0.113.10:443</code> ile yayınlanacak. PAN-OS\'un altın kuralı: <b>NAT kuralı</b> paketin <i>ilk geldiği</i> hâline göre yazılır (hedef zone = pre-NAT: untrust); <b>güvenlik kuralında</b> hedef IP pre-NAT (203.0.113.10), hedef zone ise post-NAT (dmz) olur.',
        goals: ['dynamic-ip-and-port interface-address (DIPP)', 'destination-translation', 'NAT kuralında pre-NAT zone', 'Güvenlik kuralında pre-NAT IP + post-NAT zone', 'test nat-policy-match / show session all'],
        tasks: [
            { t: 'Kaynak NAT <code>SNAT-OUT</code>: trust → untrust, kaynak <code>LAN-NET</code>, hedef <code>any</code>, <code>dynamic-ip-and-port interface-address interface ethernet1/1</code>. Commit edin.',
              why: 'Özel adresler internette yönlendirilemez; DIPP (dinamik IP ve port) birçok iç adresi tek WAN IP\'sine port çevirisiyle bağlar. WEB-OUT kuralı hazır; NAT olmadan dönüş trafiği gelmez.',
              hints: ['rulebase nat rules … source-translation dynamic-ip-and-port interface-address interface …', '<code>set rulebase nat rules SNAT-OUT from trust to untrust source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1</code>'],
              steps: C(SNAT),
              check: s => s.decide(OUT).stage === 'allowed' },
            { t: 'Hedef NAT <code>WEB-DNAT</code>: from <code>untrust</code> <b>to untrust</b>, kaynak any, hedef <code>203.0.113.10</code>, servis <code>service-https</code>, <code>translated-address WEB-SRV</code>. Commit edin.',
              why: 'NAT değerlendirmesi, paketin <i>çevrilmeden önceki</i> hedefine göre yapılan rota aramasıyla bulunan zone\'u kullanır: 203.0.113.10 WAN ağında → hedef zone <b>untrust</b>. "to dmz" yazmak en yaygın DNAT hatasıdır.',
              hints: ['Hedef zone pre-NAT (untrust).', '<code>set rulebase nat rules WEB-DNAT from untrust to untrust source any destination 203.0.113.10 service service-https destination-translation translated-address WEB-SRV</code>'],
              steps: C(DNAT('untrust')),
              check: s => s.decide(IN).dst2 === '172.24.50.10',
              fb: s => (arr(s, 'rulebase nat rules WEB-DNAT to').includes('dmz') ? 'NAT kuralında hedef zone dmz: pre-NAT hedef (203.0.113.10) untrust\'ta, "to untrust" olmalı.' : null) },
            { t: 'Güvenlik kuralı <code>WEB-IN</code>: from <code>untrust</code> <b>to dmz</b>, kaynak any, hedef <code>203.0.113.10</code> (pre-NAT), uygulama <code>ssl</code>, application-default, allow. Commit edin.',
              why: 'Güvenlik kuralı NAT\'tan sonra değerlendirilir ama adresleri orijinal pakete göredir: hedef <b>IP pre-NAT</b> (203.0.113.10), hedef <b>zone post-NAT</b> (dmz — sunucunun gerçek yeri). Gerçek IP\'yi (172.24.50.10) yazmak ya da "to untrust" demek kuralı ıskalatır.',
              hints: ['IP pre-NAT, zone post-NAT.', '<code>set rulebase security rules WEB-IN from untrust to dmz source any destination 203.0.113.10 application ssl service application-default action allow</code>'],
              steps: C(WEBIN('dmz', '203.0.113.10')), needs: [1],
              check: s => webOk(s) && s.decide(IN).rule === 'WEB-IN',
              fb: s => { const dst = arr(s, 'rulebase security rules WEB-IN destination'), to = arr(s, 'rulebase security rules WEB-IN to'); return dst.includes('WEB-SRV') || dst.some(x => /^172\.24\.50\.10/.test(x)) ? 'Hedefte gerçek (post-NAT) IP var: güvenlik kuralında pre-NAT IP 203.0.113.10 yazılır.' : to.includes('untrust') ? 'Hedef zone untrust: güvenlik kuralında post-NAT zone (dmz) yazılır.' : null; } },
            { t: 'NAT eşleşmesini test edin: <code>test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6</code>.',
              why: 'NAT testine <b>pre-NAT</b> değerler verilir (to untrust, destination 203.0.113.10). Çıktı hangi kuralın eşleştiğini ve adresin neye çevrildiğini gösterir.',
              hints: ['from/to pre-NAT zone, destination pre-NAT IP', '<code>test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6</code>'],
              steps: ['test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6'], needs: [1],
              check: s => tested(s, /^test nat-policy-match/, 'WEB-DNAT') },
            { t: 'Oturum tablosunda iki yönü de görün: <code>show session all</code> (SNAT\'lı çıkış ve DNAT\'lı giriş).',
              why: 'Oturum satırının ikinci yarısı (translated IP[Port]) NAT\'ın gerçekten uygulandığını kanıtlar: çıkışta kaynak 203.0.113.2\'ye, girişte hedef 172.24.50.10\'a çevrilmiş olmalı.',
              hints: ['show session …', '<code>show session all</code>'],
              steps: ['show session all'], needs: [0, 1, 2],
              check: s => { const c = lastIdx(s, e => e.commit === 'ok'), f = lastIdx(s, e => e.canon && /^show session all/.test(e.canon)); return c >= 0 && f > c && s.decide(OUT).stage === 'allowed' && webOk(s); } },
        ],
        verify: ['show rulebase nat', 'test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6', 'test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl', 'show session all'],
        learn: ['SNAT (DIPP): dynamic-ip-and-port interface-address.', 'NAT kuralı: hedef zone pre-NAT (rota aramasına göre).', 'Güvenlik kuralı: hedef IP pre-NAT, hedef zone post-NAT.', 'test nat-policy-match pre-NAT değerlerle çalıştırılır.'],
        links: { tool: '#/paloalto/nat', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0' }, cert: 'PCNSA / NetSec Analyst'
    },
    // ═══ Seviye 4 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-05', vendor: 'paloalto', level: 4, title: 'test security-policy-match ile kural doğrulama ve gölgelenme', minutes: 20, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-03'],
        up: UP, hosts: HOSTS, sim: { flows: FLOWS },
        start: BASE.concat(OBJ, ['set rulebase security rules DENY-DMZ from trust to dmz source any destination any application any service any action deny',
            'set rulebase security rules LAN-TO-WEB from trust to dmz source LAN-NET destination WEB-SRV application ssl service application-default action allow'], WEBOUT, SNAT),
        story: 'Ekip, LAN\'dan DMZ\'deki web sunucusuna (172.24.50.10, SSL) erişim için <code>LAN-TO-WEB</code> kuralını yazmış ama kullanıcılar bağlanamıyor. Kural tabanında yukarıdan aşağı <b>ilk eşleşen</b> kazanır; geniş bir kural daha özel bir kuralı <b>gölgeleyebilir</b> (shadowing). Tahmin etmeyin, test edin.',
        goals: ['test security-policy-match parametreleri', 'İlk eşleşen kural ve gölgelenme', 'move rulebase … before/top', 'Değişiklikten sonra yeniden test'],
        tasks: [
            { t: 'Akışı test edin: 10.64.10.50 → 172.24.50.10 tcp/443, application <code>ssl</code>, trust → dmz.',
              why: 'Önce kanıt: hangi kural eşleşiyor? Çıktıdaki <code>index</code> kuralın sırasıdır.',
              hints: ['test security-policy-match … protocol 6 application ssl', '<code>test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl'],
              loo: false, /* 4. görev (yeniden test) aynı komutu çalıştırır: meşru örtüşme */
              check: s => tested(s, /^test security-policy-match from trust to dmz source 10\.64\.10\.50 destination 172\.24\.50\.10/) },
            { t: 'Hangi kural eşleşti?', ask: { choices: [['DENY-DMZ', 'DENY-DMZ (index 1, deny)'], ['LAN-TO-WEB', 'LAN-TO-WEB (index 2, allow)'], ['interzone', 'Hiçbiri: interzone-default']], correct: 'DENY-DMZ' },
              why: 'DENY-DMZ her şeyi (any/any) kapsar ve LAN-TO-WEB\'den önce gelir: LAN-TO-WEB hiçbir zaman eşleşemez — gölgelenmiştir. PAN-OS commit sırasında gölgelenmiş kurallar için uyarı da üretir.',
              hints: ['Çıktının ilk satırındaki ad ve index.', 'Geniş kural üstteyse altındaki özel kural hiç görülmez.'] },
            { t: 'Düzeltin: <code>LAN-TO-WEB</code>\'i <code>DENY-DMZ</code>\'nin <b>önüne</b> taşıyın (silmeden) ve commit edin.',
              why: '<code>move rulebase security rules X before Y</code> sırayı değiştirir; <code>top</code>/<code>bottom</code> da kullanılabilir. DENY-DMZ\'yi silmek, DMZ\'ye diğer tüm erişimi açar: amaç sırayı düzeltmek.',
              hints: ['move … before …', '<code>move rulebase security rules LAN-TO-WEB before DENY-DMZ</code> · <code>commit</code>'],
              steps: C(['move rulebase security rules LAN-TO-WEB before DENY-DMZ']),
              check: s => { const r = s.rules(); return r.includes('DENY-DMZ') && r.indexOf('LAN-TO-WEB') >= 0 && r.indexOf('LAN-TO-WEB') < r.indexOf('DENY-DMZ'); },
              fb: s => (!s.rules().includes('DENY-DMZ') ? 'DENY-DMZ silinmiş: DMZ\'ye diğer erişim artık interzone-default\'a kalıyor; kuralı geri koyup sırayı move ile düzeltin.' : null) },
            { t: 'Aynı testi yeniden çalıştırın; artık <code>LAN-TO-WEB</code> eşleşmeli.',
              why: 'Test commit edilmiş kurallara bakar: commit etmeden tekrarlarsanız sonuç değişmez. Her düzeltmeden sonra aynı testle kapatın.',
              hints: ['Aynı komut, commit\'ten sonra.', '<code>test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl'], needs: [2],
              check: s => tested(s, /^test security-policy-match from trust to dmz/, 'LAN-TO-WEB') },
            { t: 'LAN\'dan aynı sunucuya SSH (tcp/22, application <code>ssh</code>) şimdi hangi kurala düşer? Test edip cevaplayın.', ask: { choices: [['DENY-DMZ', 'DENY-DMZ (deny)'], ['LAN-TO-WEB', 'LAN-TO-WEB (allow)'], ['interzone', 'interzone-default']], correct: 'DENY-DMZ' },
              why: 'LAN-TO-WEB yalnız ssl + application-default (443) içindir; SSH onu ıskalar ve bir alttaki DENY-DMZ\'ye düşer. Sıra düzeltmesi güvenliği gevşetmedi.',
              hints: ['test security-policy-match … destination-port 22 protocol 6 application ssh', 'LAN-TO-WEB\'in application alanına bakın.'] },
        ],
        verify: ['show rulebase security', 'test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 443 protocol 6 application ssl'],
        learn: ['Kurallar yukarıdan aşağı; ilk eşleşen kazanır.', 'Geniş kural üstteyse altındaki özel kural gölgelenir.', 'move … before/after/top/bottom ile sırala; silme.', 'Test commit edilmiş kuralları sınar: commit sonrası yeniden test.'],
        links: { tool: '#/paloalto/policy', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0' }, cert: 'PCNSA / NetSec Analyst'
    },
    // ═══ Seviye 5 — arıza ═════════════════════════════════════════════════════
    {
        id: 'pan-06', vendor: 'paloalto', level: 5, title: 'Arıza: yayınlanan web sunucusuna dışarıdan erişilemiyor', minutes: 25, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-04'],
        up: UP, hosts: HOSTS, sim: { flows: FLOWS }, start: BASE.concat(OBJ, WEBOUT, SNAT),
        variants: [
            { key: 'dstip', start: DNAT('untrust').concat(WEBIN('dmz', 'WEB-SRV')) },
            { key: 'dstzone', start: DNAT('untrust').concat(WEBIN('untrust', '203.0.113.10')) },
            { key: 'natzone', start: DNAT('dmz').concat(WEBIN('dmz', '203.0.113.10')) },
            { key: 'shadow', start: DNAT('untrust').concat(['set rulebase security rules BLOCK-INBOUND from untrust to any source any destination any application any service any action deny'], WEBIN('dmz', '203.0.113.10')) },
            { key: 'uncommitted', start: DNAT('untrust').concat(WEBIN('dmz', 'WEB-SRV')), pending: ['delete rulebase security rules WEB-IN destination WEB-SRV', 'set rulebase security rules WEB-IN destination 203.0.113.10'] },
        ],
        story: '<b>Arıza kaydı:</b> "Müşteriler https://203.0.113.10 adresine (DMZ\'deki 172.24.50.10 yayını) bağlanamıyor." Önceki yönetici <code>WEB-DNAT</code> (NAT) ve <code>WEB-IN</code> (güvenlik) kurallarını yazdığını söylüyor. Doğru yapılandırma: NAT kuralında <b>to untrust</b>; güvenlik kuralında <b>hedef 203.0.113.10 (pre-NAT)</b> ve <b>to dmz (post-NAT)</b>. Test komutlarıyla sırayla ilerleyin: önce NAT, sonra güvenlik kuralı. <small>Her turda farklı bir arıza — "Yeni tur".</small>',
        goals: ['test nat-policy-match ile NAT katmanını ayırmak', 'test security-policy-match ile doğru pre/post-NAT değerlerini kullanmak', 'Gölgelenen kuralı bulmak', 'Commit edilmemiş düzeltmeyi fark etmek (show config diff)'],
        tasks: [
            { t: 'NAT katmanı: dış istemci 198.51.100.7\'den 203.0.113.10:443\'e gelen paketi <code>test nat-policy-match</code> ile sınayın (pre-NAT değerlerle).',
              why: 'Paket untrust\'tan gelir ve hedefi (203.0.113.10) rota aramasına göre yine untrust\'tadır: NAT testi <b>from untrust to untrust</b> ile yapılır.',
              hints: ['from untrust to untrust, destination 203.0.113.10', '<code>test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6</code>'],
              steps: ['test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6'],
              check: s => tested(s, /^test nat-policy-match from untrust to untrust source 198\.51\.100\.7 destination 203\.0\.113\.10/) },
            { t: 'NAT testi ne gösterdi?', ask: { choices: [['match', 'WEB-DNAT eşleşti: 203.0.113.10 → 172.24.50.10'], ['none', 'Eşleşen NAT kuralı yok']], correct: v => (v.key === 'natzone' ? 'none' : 'match') },
              why: 'NAT kuralı "to dmz" yazılmışsa pre-NAT zone (untrust) ile eşleşmez: çeviri hiç olmaz, paket interzone-default\'a düşer.',
              hints: ['Çıktıda "Destination-NAT: Rule matched" var mı?', 'Yoksa NAT kuralının to alanına bakın.'] },
            { t: 'Güvenlik katmanı: aynı akışı <code>test security-policy-match</code> ile <b>from untrust to dmz</b>, hedef <b>203.0.113.10</b>, application <code>ssl</code> olarak sınayın.',
              why: 'Güvenlik testi, güvenlik kuralının göreceği değerlerle yapılır: hedef IP pre-NAT (203.0.113.10), hedef zone post-NAT (dmz).',
              hints: ['from untrust to dmz … destination 203.0.113.10 … application ssl', '<code>test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl'],
              loo: false, /* 6. görev (kapanış testi) aynı komutu çalıştırır: meşru örtüşme */
              check: s => tested(s, /^test security-policy-match from untrust to dmz source 198\.51\.100\.7 destination 203\.0\.113\.10/) },
            { t: 'Kök neden hangisi?', ask: { choices: [['dstip', 'WEB-IN hedefinde gerçek IP (WEB-SRV / 172.24.50.10) yazılı; pre-NAT IP olmalı'], ['dstzone', 'WEB-IN hedef zone\'u untrust; post-NAT zone (dmz) olmalı'], ['natzone', 'WEB-DNAT hedef zone\'u dmz; pre-NAT zone (untrust) olmalı'], ['shadow', 'Üstteki geniş bir deny kuralı WEB-IN\'i gölgeliyor'], ['uncommitted', 'Düzeltme candidate\'te duruyor, commit edilmemiş']], correct: v => v.key },
              why: 'NAT eşleşmiyorsa natzone. NAT tamam ama güvenlik testi başka bir kural gösteriyorsa: deny ise gölgelenme; hiç eşleşme yoksa WEB-IN\'in değerlerine bakın (show rulebase security rules WEB-IN). <code>run show config diff</code> boş değilse bekleyen düzeltme vardır.',
              hints: ['İki test çıktısını birlikte okuyun; gerekirse show rulebase security ve show config diff.', 'NAT yok → NAT kuralı; deny kuralı → sıra; eşleşme yok → WEB-IN alanları; diff dolu → commit.'] },
            { t: 'En az değişiklikle düzeltin ve commit edin. Dışarıdan yalnız 443 açılmalı (any/any kural yazmayın).',
              why: 'Yalnız bozuk parçayı düzeltin. Çok değerli alanlarda <code>set</code> ekler: yanlış değeri <code>delete</code> ile çıkarın. İki yönlü any kural "çalışır" ama sunucuyu tüm internete açar.',
              hints: ['Kök nedene karşılık gelen tek alan (ya da move / commit).', 'delete … destination WEB-SRV + set … destination 203.0.113.10 · delete … to untrust + set … to dmz · delete nat … to dmz + set … to untrust · move … before BLOCK-INBOUND · show config diff + commit'],
              steps: v => ({ dstip: C(['delete rulebase security rules WEB-IN destination WEB-SRV', 'set rulebase security rules WEB-IN destination 203.0.113.10']),
                  dstzone: C(['delete rulebase security rules WEB-IN to untrust', 'set rulebase security rules WEB-IN to dmz']),
                  natzone: C(['delete rulebase nat rules WEB-DNAT to dmz', 'set rulebase nat rules WEB-DNAT to untrust']),
                  shadow: C(['move rulebase security rules WEB-IN before BLOCK-INBOUND']),
                  uncommitted: C(['run show config diff']) })[v.key],
              check: s => webOk(s) && !openAny(s),
              fb: s => { const d = s.decide(IN); if (!s.committed() && !webOk(s)) return 'Candidate\'te değişiklik var ama commit edilmemiş (show config diff).'; if (openAny(s)) return 'Dışarıdan application any ile izin veren bir kural var: sunucuyu tüm uygulamalara açar. Yalnız ssl.'; return d.nat ? 'NAT çalışıyor; akış ' + d.rule + ' ile düşüyor.' : 'NAT kuralı eşleşmiyor: WEB-DNAT\'ın zone\'larına bakın (istek sunucuya hiç çevrilmiyor).'; } },
            { t: 'Commit\'ten <b>sonra</b> güvenlik testini tekrarlayın; <code>WEB-IN</code> allow ile eşleşmeli.',
              why: 'Kapanış kanıtı: aynı test artık doğru kuralı gösteriyor. (Test commit edilmiş yapılandırmayı sınar.)',
              hints: ['Aynı test komutu.', '<code>test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl'], needs: [4],
              check: s => { const c = lastIdx(s, e => e.commit === 'ok'), t = lastIdx(s, e => e.canon && /^test security-policy-match/.test(e.canon) && e.res === 'WEB-IN'); return c >= 0 && t > c && webOk(s); } },
        ],
        verify: ['test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6', 'test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl', 'show rulebase security', 'show config diff', 'show session all'],
        learn: ['DNAT: NAT kuralı to = pre-NAT zone; güvenlik kuralı: IP pre-NAT, zone post-NAT.', 'Önce NAT testi, sonra güvenlik testi.', 'Geniş deny üstteyse özel allow gölgelenir: move ile sırala.', 'Commit edilmemiş düzeltme cihazda yoktur: show config diff.'],
        links: { cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0', tool: '#/paloalto/nat' }, cert: 'PCNSE / NGFW Engineer'
    },
    { id: 'pan-sandbox', vendor: 'paloalto', level: null, sandbox: true, title: 'Serbest terminal — PAN-OS', kind: 'firewall', hostname: 'PA-VM', up: UP, hosts: HOSTS, start: BASE,
      story: 'ethernet1/1–1/8 arayüzlü bir PA-VM (1/1 untrust 203.0.113.2/24, 1/2 trust 10.64.10.1/24, 1/3 dmz 172.24.50.1/24, varsayılan rota hazır). Görev yok; <code>configure</code> → <code>set</code> → <code>commit</code>, <code>test security-policy-match</code> ve <code>?</code> yardımını deneyin.', tasks: [] },
    ];
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
    const root = typeof window !== 'undefined' ? window : globalThis;
    // Yalnız bu dosyanın lab'ları değiştirilir (paloalto-yol.js'teki lab'lar korunur)
    const OWN = new Set(LABS.map(l => l.id));
    root.CG_LABS = (root.CG_LABS || []).filter(l => !OWN.has(l.id)).concat(LABS);
})();
