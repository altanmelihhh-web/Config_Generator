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
    // Commit edilmemiş değişiklik: kontroller running'e baktığı için en sık "yaptım ama olmadı" nedeni
    const pend = s => (s.committed() ? null : 'Candidate\'te commit edilmemiş değişiklik var: kontrol running yapılandırmaya bakar. configure → commit.');
    // Ders metni: Kavram / Neden önemli / Örnek yapılandırma / Sık hatalar (ios.js ve fortigate.js ile aynı biçim)
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
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
        lesson: L('PAN-OS CLI iki modla çalışır: <b>operasyonel mod</b> (<code>&gt;</code>) durumu okur ve test çalıştırır; <code>configure</code> ile girilen <b>yapılandırma modu</b> (<code>#</code>) ayarları değiştirir. Yapılandırma modundaki her <code>set</code> ve <code>delete</code> yalnız <b>candidate</b> (aday) yapılandırmayı değiştirir; cihazın o anda uyguladığı yapılandırma <b>running</b>\'dir. <code>commit</code> candidate\'i doğrular ve bir iş (job) olarak running\'e uygular; yapılandırma modundayken operasyonel komutlar <code>run</code> önekiyle çalışır.',
            'Commit edilmemiş değişiklik trafiği etkilemez: "yaptım ama çalışmıyor" durumunun en sık nedeni budur. Commit öncesi <code>show config diff</code> ile neyin değişeceğini görmek, <code>validate full</code> ile hatayı üretimden önce yakalamak ve <code>revert config</code> ile vazgeçmek, hatalı değişikliği cihaza hiç ulaştırmayan üç alışkanlıktır. Commit ya hep ya hiçtir: doğrulama başarısızsa running hiç değişmez.',
            'configure\nset deviceconfig system hostname PA-LAB\nrun show config diff\nvalidate full\nrun show jobs all\ncommit\nexit\nset cli config-output-format set\nshow config running',
            ['<code>set</code>\'ten sonra commit\'i unutmak: değişiklik candidate\'te bekler, cihazda yoktur. İstem hâlâ eski adı gösteriyorsa commit edilmemiştir.', '<code>revert config</code>\'un commit edilmiş bir değişikliği geri alacağını sanmak: yalnız candidate\'i running\'e döndürür. Commit edilmiş hatayı düzeltip yeniden commit edersiniz.', '<code>show system info</code>\'da <code>app-version</code>\'u PAN-OS sürümü sanmak: PAN-OS sürümü <code>sw-version</code>\'dır, app-version App-ID içerik paketinin sürümüdür.']),
        goals: ['show system info ile cihazı tanımak', '? ile komut keşfetmek', 'candidate / running farkını görmek (show config diff)', 'commit ve iş (job) takibi', 'set biçiminde çıktı, revert config ve validate'],
        tasks: [
            { t: 'Cihazın modelini, seri numarasını ve PAN-OS sürümünü görüntüleyin.',
              why: '<code>show system info</code> sürüm, model, seri no ve içerik (App-ID) sürümünü verir; destek kaydında ve yükseltme planında ilk bakılan çıktıdır.',
              hints: ['show system …', '<code>show system info</code>'], steps: ['show system info'],
              loo: false, /* 8. görev (sürüm sorusu) aynı komutu çalıştırır: meşru örtüşme */
              check: s => s.ev.ran(/^show system info$/) },
            { t: '<kbd>?</kbd> ile <code>show</code> altındaki seçenekleri listeleyin.',
              why: '<kbd>?</kbd> o noktadaki seçenekleri gösterir: <code>&gt;</code> ile başlayanların altında başka seçenekler vardır, <code>+</code> isteğe bağlı parametredir, <code>&lt;Enter&gt;</code> komutun burada bitebileceğini söyler.',
              hints: ['Soru işareti anında yardım açar.', '<code>show ?</code>'], steps: [{ help: 'show ' }],
              check: s => s.ev.helped(/^\s*sh\S*\s/) },
            { t: '<code>configure</code> ile yapılandırmaya girin, cihaz adını <code>PA-FW</code> yapın, <code>exit</code> ile çıkın ve <code>show config diff</code> ile bekleyen farkı görün. İstem henüz değişmemeli.',
              why: '<code>set</code> yalnız candidate\'i değiştirir; istem running\'deki adı gösterir. <code>show config diff</code> candidate ile running arasındaki farkı listeler; commit öncesi gözden geçirmenin yoludur.',
              hints: ['deviceconfig system hostname', '<code>configure</code> · <code>set deviceconfig system hostname PA-FW</code> · <code>exit</code> · <code>show config diff</code>'],
              steps: ['configure', 'set deviceconfig system hostname PA-FW', 'exit', 'show config diff'],
              // herhangi bir "set … PA-FW" ile ardından gelen "show config diff" arasında commit yoksa tamam (erken commit sonrası yeniden denenebilir)
              check: s => { const L = s.ev.list(); return L.some((e, i) => e.canon === 'set deviceconfig system hostname PA-FW' && L.some((d, j) => j > i && d.canon === 'show config diff' && !L.slice(i + 1, j).some(x => x.commit))); },
              fb: s => (s.val('deviceconfig system hostname') === 'PA-FW' && !s.ev.ran(/^show config diff$/) ? 'Değişiklik fark görülmeden commit edildi: commit\'ten sonra candidate = running olduğu için fark boştur. Yeniden deneyin: configure → set deviceconfig system hostname PA-FW2 → set deviceconfig system hostname PA-FW → exit → show config diff (commit\'ten önce).' : s.val('deviceconfig system hostname', 'cand') === 'PA-FW' && s.mode() === 'cfg' ? 'Candidate\'te PA-FW hazır: exit ile operasyonel moda dönüp show config diff çalıştırın (ya da run show config diff).' : null) },
            { t: 'Değişikliği <code>commit</code> ile uygulayın. "Configuration committed successfully" iletisini ve yeni istemi (<code>admin@PA-FW#</code>) görün.',
              why: 'PAN-OS commit\'i bir <b>iş</b> (job) olarak kuyruğa alır ("Commit job N is in progress"); doğrulama ve uygulama bitince sonuç yazılır. <code>show jobs all</code> geçmiş işleri listeler. Commit ya hep ya hiçtir: doğrulama hatası varsa ("Commit failed") running hiç değişmez.',
              hints: ['Yapılandırma modunda commit.', '<code>configure</code> · <code>commit</code> · <code>exit</code>'],
              steps: ['configure', 'commit', 'exit'],
              check: s => s.val('deviceconfig system hostname') === 'PA-FW' && s.ev.commit('ok'),
              fb: s => (s.val('deviceconfig system hostname', 'cand') === 'PA-FW' && s.val('deviceconfig system hostname') !== 'PA-FW' ? 'PA-FW yalnız candidate\'te: configure → commit ile running\'e uygulayın.' : null) },
            { t: 'Çıktıyı set komutları biçimine çevirin (<code>set cli config-output-format set</code>) ve <code>show config running</code> ile running yapılandırmayı görün.',
              why: 'Varsayılan çıktı süslü parantezli hiyerarşidir; set biçimi tek satırlık komutlar verir: aramak, kopyalamak ve başka cihaza uygulamak kolaylaşır. Bu ayar yalnız CLI oturumunuzu etkiler, yapılandırmayı değil.',
              hints: ['Operasyonel modda set cli …', '<code>set cli config-output-format set</code> · <code>show config running</code>'],
              steps: ['set cli config-output-format set', 'show config running'],
              check: s => s.ev.list().some(e => e.canon === 'show config running' && e.fmt === 'set') },
            { t: 'Hata yapın ve geri alın: cihaz adını candidate\'te <code>YANLIS</code> yapın, sonra <code>revert config</code> ile candidate\'i running\'e döndürün.',
              why: '<code>revert config</code> commit edilmemiş tüm değişiklikleri atar (candidate = running). Commit etmediğiniz sürece cihaz etkilenmez; commit edilmiş bir hata ise revert ile dönmez, düzeltilip yeniden commit edilir.',
              hints: ['Yapılandırma modunda revert.', '<code>set deviceconfig system hostname YANLIS</code> · <code>revert config</code> · <code>show deviceconfig system</code>'],
              steps: ['configure', 'set deviceconfig system hostname YANLIS', 'revert config', 'show deviceconfig system', 'exit'],
              check: s => s.ev.after(/^set deviceconfig system hostname YANLIS$/, /^revert config$/) && s.val('deviceconfig system hostname', 'cand') !== 'YANLIS' && s.val('deviceconfig system hostname') !== 'YANLIS',
              fb: s => (s.val('deviceconfig system hostname') === 'YANLIS' ? 'YANLIS commit edildi: revert config commit edilmiş değişikliği geri almaz. set deviceconfig system hostname PA-FW + commit ile düzeltin, sonra alıştırmayı commit etmeden tekrarlayın.' : null) },
            { t: 'Commit etmeden doğrulayın: yapılandırma modunda <code>validate full</code>, ardından <code>run show jobs all</code> ile işin sonucunu (FIN / OK) görün.',
              why: '<code>validate full</code> commit\'in doğrulama aşamasını uygulamadan çalıştırır: eksik referans ("is not a valid reference") gibi hataları üretim saatini beklemeden bulursunuz.',
              hints: ['validate full + jobs', '<code>configure</code> · <code>validate full</code> · <code>run show jobs all</code>'],
              steps: ['configure', 'validate full', 'run show jobs all', 'exit'],
              check: s => s.ev.ran(/^validate full$/) && s.ev.after(/^validate full$/, /^show jobs (all|id \d+)$/) },
            { t: 'Bir destek kaydı açıyorsunuz ve cihazın PAN-OS sürümü soruluyor. <code>show system info</code> çıktısına göre hangisi?', ask: { choices: [['sw', '11.1.4-h7 (sw-version)'], ['app', '8900-9200 (app-version)'], ['model', 'PA-VM (model)']], correct: 'sw' },
              why: 'PAN-OS işletim sistemi sürümü <code>sw-version</code> satırıdır. <code>app-version</code> ise App-ID uygulama içerik paketinin sürümüdür: ayrı güncellenir ve PAN-OS yükseltmesinden bağımsızdır. Yükseltme planında ikisine de bakılır, çünkü her PAN-OS sürümü asgari bir içerik sürümü ister.',
              hints: ['show system info → sw-version satırı', '"app" ile başlayan satır uygulama içeriğidir, işletim sistemi değil.'],
              steps: ['show system info', { answer: 7, v: 'sw' }] },
        ],
        solution: ['show system info', { help: 'show ' }, 'configure', 'set deviceconfig system hostname PA-FW', 'exit', 'show config diff', 'configure', 'commit', 'exit',
            'set cli config-output-format set', 'show config running', 'configure', 'set deviceconfig system hostname YANLIS', 'revert config', 'show deviceconfig system', 'validate full', 'run show jobs all', 'exit', 'show system info', { answer: 7, v: 'sw' }],
        verify: ['show system info', 'show config diff', 'show config running', 'show jobs all'],
        learn: ['<code>&gt;</code> operasyonel, <code>#</code> yapılandırma; <code>run</code> ile yapılandırmadan operasyonel komut.', 'set candidate\'i değiştirir; commit running yapar (iş/job olarak).', '<code>show config diff</code> commit öncesi fark.', '<code>revert config</code> commit edilmemiş değişiklikleri atar.', '<code>validate full</code> commit etmeden doğrular.', 'Commit ya hep ya hiç: başarısızsa running değişmez.', '<code>sw-version</code> PAN-OS sürümü; <code>app-version</code> App-ID içerik sürümü.'],
        links: { cli: '#/cli/paloalto' }, cert: 'Network Security Analyst'
    },
    // ═══ Seviye 1 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-02', vendor: 'paloalto', level: 1, title: 'L3 arayüz, zone, sanal yönlendirici ve yönetim profili', minutes: 25, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-01'],
        up: ['ethernet1/1', 'ethernet1/2', 'ethernet1/3'], hosts: ['203.0.113.1', '198.51.100.80', '10.64.10.20'],
        story: 'PAN-OS\'ta bir arayüzün trafik geçirmesi için üç şey gerekir: <b>katman 3 adres</b>, bir <b>zone</b> ve bir <b>sanal yönlendirici</b> (virtual-router). Biri eksikse arayüz up görünür ama trafik sayılmaz. ethernet1/1 internete (ağ geçidi 203.0.113.1), ethernet1/2 iç ağa bağlı. İç ağdan cihaza ping ve SSH izni de bir <b>yönetim profili</b> ile verilir.',
        lesson: L('Bir veri arayüzünün trafik taşıması için üç parça gerekir: arayüz tipi ve adresi (<code>layer3 ip</code>), bir güvenlik <b>zone</b>\'u ve bir <b>sanal yönlendirici</b> (virtual-router, VR). Zone güvenlik kurallarının "nereden → nereye" dilidir; VR bağlı ağları ve statik rotaları tutan yönlendirme tablosudur. Cihazın kendisine yapılan ping, SSH ve HTTPS erişimi ise arayüze bağlanan bir <code>interface-management-profile</code> ile açılır. (PAN-OS 10.2 ve sonrasında Advanced Routing etkinleştirilirse VR yerine <i>logical-router</i> kullanılır; bu lab klasik VR yapısını kullanır.)',
            'Üç parçadan biri eksikse arayüz "up" görünür ama paket işlenmez: zone yoksa arayüz hiçbir güvenlik kuralına girmez, VR yoksa bağlı ağı yönlendirme tablosunda görünmez. Yönetim profili de saldırı yüzeyini belirler: internete bakan arayüzde SSH ya da HTTPS açmak, cihazın yönetimini tüm internete sunmak demektir.',
            'configure\nset network interface ethernet ethernet1/3 layer3 ip 172.24.50.1/24\nset zone dmz network layer3 ethernet1/3\nset network virtual-router default interface ethernet1/3\nset network virtual-router default routing-table ip static-route TO-LAB destination 10.128.0.0/16 nexthop ip-address 172.24.50.254\nset network profiles interface-management-profile PING-ONLY ping yes permitted-ip 172.24.50.0/24\nset network interface ethernet ethernet1/3 layer3 interface-management-profile PING-ONLY\ncommit\nrun test routing fib-lookup virtual-router default ip 10.128.5.9',
            ['Arayüzü VR\'a eklemeyi unutmak: adres ve zone doğru, arayüz up; ama <code>show routing route</code>\'ta o ağın C (connect) satırı yoktur.', 'Profili oluşturup arayüze bağlamamak ya da WAN arayüzüne SSH/HTTPS açık bir profil bağlamak.', 'Profilde <code>http</code> ya da <code>telnet</code> açmak: ikisi de parolayı şifresiz taşır. Yalnız <code>ssh</code> ve <code>https</code> kullanın; <code>permitted-ip</code> ile kaynak ağı daraltın.']),
        goals: ['ethernet … layer3 ip', 'zone … network layer3', 'virtual-router interface ve static-route', 'interface-management-profile', 'show routing route / test routing fib-lookup'],
        tasks: [
            { t: 'Adresler: <code>ethernet1/1</code> → <code>203.0.113.2/24</code>, <code>ethernet1/2</code> → <code>10.64.10.1/24</code>. Commit edin.',
              why: '<code>layer3 ip</code> hem arayüz tipini (Layer3) hem adresini tanımlar; adres CIDR önekiyle yazılır. Arayüz zone\'a <code>network layer3</code> olarak ancak L3 tipindeyse eklenebilir: sıra bu yüzden adres → zone → VR.',
              hints: ['network interface ethernet <ad> layer3 ip <ip/uz>', '<code>set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24</code>'],
              steps: C(['set network interface ethernet ethernet1/1 layer3 ip 203.0.113.2/24', 'set network interface ethernet ethernet1/2 layer3 ip 10.64.10.1/24']),
              check: s => same(arr(s, 'network interface ethernet ethernet1/1 layer3 ip'), ['203.0.113.2/24']) && same(arr(s, 'network interface ethernet ethernet1/2 layer3 ip'), ['10.64.10.1/24']),
              fb: s => { const a = arr(s, 'network interface ethernet ethernet1/1 layer3 ip', 'cand'), b = arr(s, 'network interface ethernet ethernet1/2 layer3 ip', 'cand'); return a.length > 1 || b.length > 1 ? 'Arayüzde birden fazla adres var: set çok değerli alana ekler. Yanlış adresi delete … layer3 ip &lt;adres&gt; ile çıkarın.' : pend(s); } },
            { t: 'Zone\'lar: <code>untrust</code> ← ethernet1/1, <code>trust</code> ← ethernet1/2. Commit edin.',
              why: 'Güvenlik kuralları zone\'dan zone\'a yazılır. Zone\'a yalnız aynı tipte (layer3) arayüz girer; katman 3 olmayan arayüzü eklemek commit\'i durdurur.',
              hints: ['zone <ad> network layer3 <arayüz>', '<code>set zone untrust network layer3 ethernet1/1</code> · <code>set zone trust network layer3 ethernet1/2</code>'],
              steps: C(['set zone untrust network layer3 ethernet1/1', 'set zone trust network layer3 ethernet1/2']), needs: [0],
              check: s => s.iface('ethernet1/1').zone === 'untrust' && s.iface('ethernet1/2').zone === 'trust',
              fb: s => (s.iface('ethernet1/1').zone === 'trust' || s.iface('ethernet1/2').zone === 'untrust' ? 'Zone\'lar ters: internete bakan ethernet1/1 untrust, iç ağ ethernet1/2 trust olmalı.' : pend(s)) },
            { t: 'İki arayüzü de <code>default</code> sanal yönlendiriciye ekleyin. Commit edin.',
              why: 'Sanal yönlendiriciye (VR) eklenmeyen arayüzün bağlı ağı yönlendirme tablosuna girmez; o arayüzden gelen paket için rota bulunamaz. "Arayüz up ama trafik yok" arızasının klasik nedeni.',
              hints: ['network virtual-router default interface [ … ]', '<code>set network virtual-router default interface [ ethernet1/1 ethernet1/2 ]</code>'],
              steps: C(['set network virtual-router default interface [ ethernet1/1 ethernet1/2 ]']), needs: [0],
              check: s => s.iface('ethernet1/1').vr === 'default' && s.iface('ethernet1/2').vr === 'default',
              fb: s => pend(s) },
            { t: 'Varsayılan rota <code>DEFAULT</code>: <code>0.0.0.0/0</code> → <code>203.0.113.1</code>. Commit edin.',
              why: 'Statik rota VR\'ın <code>routing-table ip static-route</code> altında adla tanımlanır; sonraki atlama VR\'daki bir bağlı ağda olmalı. Varsayılan metrik ve yönetsel mesafe 10\'dur.',
              hints: ['… routing-table ip static-route <ad> destination … nexthop ip-address …', '<code>set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1</code>'],
              steps: C(['set network virtual-router default routing-table ip static-route DEFAULT destination 0.0.0.0/0 nexthop ip-address 203.0.113.1']), needs: [0, 2],
              check: s => { const r = s.route('198.51.100.80'); return !!r && r.iface === 'ethernet1/1' && r.nh === '203.0.113.1'; },
              fb: s => (has(s, 'network virtual-router default routing-table ip static-route DEFAULT') && !s.route('198.51.100.80') ? 'Rota tanımlı ama tabloda yok: ethernet1/1 VR\'da mı, sonraki atlama bağlı ağda mı?' : null) },
            { t: 'Yönetim profili <code>PING-SSH</code> (ping yes, ssh yes) oluşturun ve <b>yalnız</b> ethernet1/2\'ye (LAN) bağlayın. Commit edin.',
              why: 'Veri arayüzleri, profil bağlanmadıkça cihazın kendisine gelen ping/SSH\'a cevap vermez. Yönetim profili hangi hizmetlerin açık olacağını belirler; internete bakan arayüze SSH açmak saldırı yüzeyidir. Profil tek başına bir şey yapmaz: arayüzün <code>layer3 interface-management-profile</code> alanına bağlanınca etkinleşir.',
              hints: ['network profiles interface-management-profile … + arayüzde interface-management-profile', '<code>set network profiles interface-management-profile PING-SSH ping yes ssh yes</code> · <code>set network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH</code>'],
              steps: C(['set network profiles interface-management-profile PING-SSH ping yes ssh yes', 'set network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH']), needs: [0],
              check: s => s.mgmtAllows('ethernet1/2', 'ping') && s.mgmtAllows('ethernet1/2', 'ssh') && !s.mgmtAllows('ethernet1/1', 'ssh'),
              fb: s => { if (s.mgmtAllows('ethernet1/1', 'ssh')) return 'İnternete bakan ethernet1/1\'de SSH açık: profili oradan kaldırın.';
                  if (has(s, 'network profiles interface-management-profile PING-SSH') && !has(s, 'network interface ethernet ethernet1/2 layer3 interface-management-profile')) return 'PING-SSH oluşturuldu ama ethernet1/2\'ye bağlanmadı: set network interface ethernet ethernet1/2 layer3 interface-management-profile PING-SSH.';
                  if (s.mgmtAllows('ethernet1/2', 'http')) return 'Çalışır ama profilde http açık: HTTP yönetim parolasını şifresiz taşır. http\'yi kapatın; gerekiyorsa https kullanın.';
                  return pend(s); } },
            { t: 'Doğrulayın: <code>show routing route</code> ve <code>test routing fib-lookup virtual-router default ip 198.51.100.80</code>.',
              why: 'RIB (<code>show routing route</code>) tüm rotaları, FIB araması ise belirli bir hedefe gerçekte hangi arayüzden çıkılacağını gösterir: "bu paket nereye gider?" sorusunun cevabı.',
              hints: ['Tablo + tek hedef araması.', '<code>show routing route</code> · <code>test routing fib-lookup virtual-router default ip 198.51.100.80</code>'],
              steps: ['show routing route', 'test routing fib-lookup virtual-router default ip 198.51.100.80'], needs: [0, 2, 3],
              check: s => s.ev.ran(/^show routing route/) && tested(s, /^test routing fib-lookup/, 'ethernet1/1') },
            { t: 'LAN\'daki bir istemciye (<code>10.64.10.20</code>) giden paket için hangi rota seçilir? <code>test routing fib-lookup</code> ile bakıp cevaplayın.', ask: { choices: [['connected', 'Bağlı ağ 10.64.10.0/24 → ethernet1/2 (metric 0)'], ['default', 'Varsayılan rota 0.0.0.0/0 → 203.0.113.1, ethernet1/1'], ['host', '10.64.10.1/32 host rotası']], correct: 'connected' },
              why: 'Yönlendirme <b>en uzun önek</b> eşleşmesiyle çalışır: 10.64.10.20 hem /0 varsayılan rotaya hem /24 bağlı ağa uyar; daha özel olan /24 kazanır. 10.64.10.1/32 (H bayrağı) yalnız cihazın kendi adresidir, başka bir IP\'yi kapsamaz.',
              hints: ['<code>test routing fib-lookup virtual-router default ip 10.64.10.20</code>', 'result satırındaki arayüz ve metric; /24 ile /0\'dan hangisi daha özel?'],
              steps: ['test routing fib-lookup virtual-router default ip 10.64.10.20', { answer: 6, v: 'connected' }], needs: [0, 2] },
        ],
        verify: ['show interface all', 'show interface ethernet1/2', 'show routing route', 'test routing fib-lookup virtual-router default ip 198.51.100.80'],
        learn: ['Trafik için: L3 adres + zone + virtual-router.', 'Zone\'a yalnız aynı tip (layer3) arayüz.', 'Statik rota VR altında adla; sonraki atlama bağlı ağda.', 'Cihaza ping/SSH: interface-management-profile; WAN\'da kapalı.', 'Profilde http/telnet yok; permitted-ip ile kaynak ağ daraltılır.', 'Rota seçimi en uzun önekle: bağlı /24, /0 varsayılan rotadan önce gelir.'],
        links: { tool: '#/paloalto/interface', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst'
    },
    // ═══ Seviye 2 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-03', vendor: 'paloalto', level: 2, title: 'Nesneler ve güvenlik kuralı: App-ID ve application-default', minutes: 25, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-02'],
        up: UP, hosts: HOSTS, start: BASE,
        story: 'Arayüzler, zone\'lar (untrust / trust / dmz) ve rota hazır. PAN-OS kuralları port değil <b>uygulama</b> (App-ID) ile yazılır; <code>service application-default</code> uygulamaya yalnız kendi standart portunda izin verir. LAN kullanıcıları web\'e çıkacak; DMZ\'deki uygulama ise standart dışı 8443 portunda SSL çalışıyor.',
        lesson: L('Güvenlik kuralı altı soruyu cevaplar: hangi zone\'dan, hangi zone\'a, hangi kaynak ve hedef adres, hangi <b>uygulama</b> (App-ID), hangi <b>servis</b> (port) ve ne yapılacak (action). App-ID trafiği port numarasına değil içeriğine bakarak tanır; <code>service application-default</code> uygulamayı yalnız kendi standart portlarında kabul eder. Kurallar yukarıdan aşağı denenir ve ilk eşleşen uygulanır; hiçbiri eşleşmezse sondaki önceden tanımlı kurallar devreye girer: aynı zone içinde <code>intrazone-default</code> (allow), zone\'lar arasında <code>interzone-default</code> (deny).',
            'Port tabanlı "tcp/443 açık" kuralı 443 üzerinden tünellenen her şeyi geçirir. Uygulama + application-default hem uygulamayı hem portu sınırlar: web-browsing 8080\'de çalışmaya kalkarsa kural eşleşmez. Adres ve servis nesneleri kuralı okunur kılar; sunucunun adresi değişince tek yerden güncellenir.',
            'configure\nset address DNS-SRV ip-netmask 172.24.50.53/32\nset service SVC-TCP-8080 protocol tcp port 8080\nset rulebase security rules DNS-DMZ from trust to dmz source LAN-NET destination DNS-SRV application dns service application-default action allow\nset rulebase security rules WEB-8080 from trust to dmz source LAN-NET destination WEB-SRV application web-browsing service SVC-TCP-8080 action allow log-end yes\ncommit\nrun test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.53 destination-port 53 protocol 17 application dns',
            ['<code>application any</code> + <code>service any</code> ile allow: kural port tabanlı bir güvenlik duvarı kuralına döner, App-ID\'nin hiçbir faydası kalmaz.', 'Uygulamayı yazıp <code>service any</code> bırakmak: uygulama her portta izinli olur. Doğrusu application-default; standart dışı port gerekiyorsa yalnız o portu tanımlayan özel servis.', 'Kuralda <code>log-end no</code> yapmak: izin verilen oturumlar trafik günlüğüne düşmez ve sorun gidermede kör kalırsınız (varsayılan yes). Önceden tanımlı intrazone-default ve interzone-default kuralları da varsayılan olarak loglamaz.']),
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
              fb: s => { const R = 'rulebase security rules WEB-OUT ', app = arr(s, R + 'application'), svc = arr(s, R + 'service');
                  if (app.includes('any') && svc.includes('any')) return 'Çalışır ama application any + service any: kural port tabanlı "her şeye izin" oldu, App-ID devre dışı. application [ web-browsing ssl ] ve service application-default yazın; any değerlerini delete ile çıkarın.';
                  if (app.includes('any')) return 'Çalışır ama application any: LAN\'dan internete her uygulama geçer. Yalnız web-browsing ve ssl yazın; any\'yi delete ile çıkarın.';
                  const c = s.decide({ src: '10.64.10.50', dst: '198.51.100.80', dport: 8080, app: 'web-browsing' });
                  if (c.rule === 'WEB-OUT') return 'Kural web\'i standart dışı portta da geçiriyor: service application-default olmalı' + (svc.length > 1 ? ' (set çok değerli alana ekler: fazla servisi delete ile çıkarın).' : '.');
                  const a = s.decide(OUT); if (s.rules().includes('WEB-OUT') && a.rule !== 'WEB-OUT') return 'LAN\'dan 443/ssl akışı WEB-OUT\'a düşmüyor (' + (a.rule || a.stage) + '): from trust to untrust, source LAN-NET ve application listesine bakın.';
                  return pend(s); } },
            { t: 'Kural <code>APP-8443</code>: trust → dmz, kaynak <code>LAN-NET</code>, hedef <code>WEB-SRV</code>, uygulama <code>ssl</code>, servis <code>SVC-TCP-8443</code>, allow. Commit edin.',
              why: 'ssl\'in varsayılan portu 443\'tür; 8443\'teki SSL, application-default ile eşleşmez ve kural atlanır (interzone-default ile düşer). Özel servis portu açıkça tanımlar, App-ID yine uygulamayı doğrular.',
              hints: ['service alanına özel servis.', '<code>set rulebase security rules APP-8443 from trust to dmz source LAN-NET destination WEB-SRV application ssl service SVC-TCP-8443 action allow</code>'],
              steps: C(['set rulebase security rules APP-8443 from trust to dmz source LAN-NET destination WEB-SRV application ssl service SVC-TCP-8443 action allow']), needs: [0, 1],
              check: s => { const d = s.decide({ src: '10.64.10.50', dst: '172.24.50.10', dport: 8443, app: 'ssl' }); return d.stage === 'allowed' && d.rule === 'APP-8443'; },
              fb: s => { if (arr(s, 'rulebase security rules APP-8443 service').includes('application-default')) return 'application-default ssl için yalnız 443\'ü kabul eder: 8443 eşleşmez. SVC-TCP-8443 kullanın.';
                  const d = s.decide({ src: '10.64.10.50', dst: '172.24.50.10', dport: 8443, app: 'ssl' });
                  if (s.rules().includes('APP-8443') && d.rule !== 'APP-8443') return 'LAN → 172.24.50.10 tcp/8443 akışı APP-8443\'e düşmüyor (' + (d.rule || d.stage) + '): from trust to dmz, destination WEB-SRV ve service SVC-TCP-8443 mü?';
                  return pend(s); } },
            { t: 'Doğrulayın: <code>test security-policy-match</code> ile 10.64.10.50 → 172.24.50.10 tcp/8443 (application ssl) akışının <code>APP-8443</code>\'e düştüğünü görün.',
              why: 'Test komutu, trafik üretmeden commit edilmiş kurallar arasında ilk eşleşeni gösterir. Protokol numarayla verilir (6 = TCP, 17 = UDP, 1 = ICMP).',
              hints: ['from, to, source, destination, destination-port, protocol, application', '<code>test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 8443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from trust to dmz source 10.64.10.50 destination 172.24.50.10 destination-port 8443 protocol 6 application ssl'], needs: [0, 1, 3],
              check: s => tested(s, /^test security-policy-match/, 'APP-8443') },
            { t: 'Bir kullanıcı web\'e standart dışı <b>8080</b> portundan çıkmaya çalışıyor: 10.64.10.50 → 198.51.100.80 tcp/8080, application <code>web-browsing</code>. Test edip sonucu seçin.', ask: { choices: [['WEB-OUT', 'WEB-OUT (allow): web-browsing zaten izinli'], ['interzone', 'Kural eşleşmez → interzone-default (deny)'], ['intrazone', 'Kural eşleşmez → intrazone-default (allow)']], correct: 'interzone' },
              why: 'WEB-OUT web-browsing\'e yalnız application-default portunda (80) izin verir; 8080\'deki web-browsing kuralı ıskalar. trust → untrust zone\'lar arası olduğundan sondaki interzone-default (deny) uygulanır. application-default\'un koruması tam budur.',
              hints: ['<code>test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 8080 protocol 6 application web-browsing</code>', '"No rule matched" ne demek; iki zone aynı mı, farklı mı?'],
              steps: ['test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 8080 protocol 6 application web-browsing', { answer: 5, v: 'interzone' }], needs: [0, 2] },
        ],
        verify: ['show rulebase security', 'test security-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6 application ssl', 'show config running'],
        learn: ['Kurallar App-ID ile yazılır; service application-default uygulamanın standart portu.', 'Standart dışı port: özel servis nesnesi.', 'Eşleşmeyen trafik: interzone-default (deny); aynı zone içi: intrazone-default (allow).', 'test security-policy-match trafik üretmeden kuralı gösterir.', 'application any + service any = port tabanlı kural: kaçının.', 'log-end açık kalsın; intrazone/interzone-default varsayılan olarak loglamaz.'],
        links: { tool: '#/paloalto/policy', cli: '#/cli/paloalto' }, cert: 'Network Security Analyst'
    },
    // ═══ Seviye 3 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-04', vendor: 'paloalto', level: 3, title: 'NAT: kaynak (DIPP) ve hedef NAT — pre-NAT IP, post-NAT zone', minutes: 30, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-03'],
        up: UP, hosts: HOSTS, sim: { flows: FLOWS }, start: BASE.concat(OBJ, WEBOUT),
        story: 'LAN kullanıcıları internete çıkabilmeli (kaynak adres WAN IP\'sine çevrilecek) ve DMZ\'deki web sunucusu (172.24.50.10) dışarıdan <code>203.0.113.10:443</code> ile yayınlanacak. PAN-OS\'un altın kuralı: <b>NAT kuralı</b> paketin <i>ilk geldiği</i> hâline göre yazılır (hedef zone = pre-NAT: untrust); <b>güvenlik kuralında</b> hedef IP pre-NAT (203.0.113.10), hedef zone ise post-NAT (dmz) olur.',
        lesson: L('<b>Kaynak NAT</b> (SNAT) iç adresleri dışarı çıkarken genel bir adrese çevirir; DIPP (dynamic-ip-and-port) birçok iç adresi tek genel IP\'ye port çevirisiyle bağlar. <b>Hedef NAT</b> (DNAT) dışarıdan genel IP\'ye gelen isteği içerideki gerçek sunucuya çevirir. PAN-OS gelen paketi şu sırayla işler: rota araması (hedef zone bulunur) → NAT kuralı eşleşmesi → güvenlik kuralı → çıkışta çeviri. Bu yüzden NAT kuralı paketin ilk hâline, yani <b>pre-NAT zone</b>\'lara göre yazılır; güvenlik kuralında ise <b>hedef IP pre-NAT, hedef zone post-NAT</b> olur.',
            '"Pre-NAT IP, post-NAT zone" kuralı PAN-OS\'taki DNAT arızalarının çoğunu açıklar. Yanlış zone ya da yanlış IP yazılmış kural hata vermez, commit başarılı olur; trafik ya hiç çevrilmez ya da yanlış kurala düşer. Test komutları bu yüzden vardır: <code>test nat-policy-match</code> pre-NAT değerlerle, <code>test security-policy-match</code> güvenlik kuralının göreceği değerlerle çalıştırılır.',
            'configure\nset address MAIL-SRV ip-netmask 172.24.50.25/32\nset service SVC-TCP-25 protocol tcp port 25\nset rulebase nat rules MAIL-DNAT from untrust to untrust source any destination 203.0.113.25 service SVC-TCP-25 destination-translation translated-address MAIL-SRV\nset rulebase security rules MAIL-IN from untrust to dmz source any destination 203.0.113.25 application smtp service application-default action allow\ncommit\nrun test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.25 destination-port 25 protocol 6\nrun test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.25 destination-port 25 protocol 6 application smtp',
            ['DNAT kuralında <code>to dmz</code> yazmak (post-NAT zone): kural hiç eşleşmez, istek çevrilmez.', 'Güvenlik kuralında hedef olarak sunucunun gerçek adresini (172.24.50.25 ya da MAIL-SRV) yazmak: kural ıskalar, akış interzone-default ile düşer.', 'NAT kuralının <code>destination</code> alanına gerçek adresi yazmak: DNAT genel IP\'ye göre eşleşir; gerçek adres yalnız <code>translated-address</code>\'te durur.']),
        goals: ['dynamic-ip-and-port interface-address (DIPP)', 'destination-translation', 'NAT kuralında pre-NAT zone', 'Güvenlik kuralında pre-NAT IP + post-NAT zone', 'test nat-policy-match / show session all'],
        tasks: [
            { t: 'Kaynak NAT <code>SNAT-OUT</code>: trust → untrust, kaynak <code>LAN-NET</code>, hedef <code>any</code>, <code>dynamic-ip-and-port interface-address interface ethernet1/1</code>. Commit edin.',
              why: 'Özel adresler internette yönlendirilemez; DIPP (dinamik IP ve port) birçok iç adresi tek WAN IP\'sine port çevirisiyle bağlar. WEB-OUT kuralı hazır; NAT olmadan dönüş trafiği gelmez.',
              hints: ['rulebase nat rules … source-translation dynamic-ip-and-port interface-address interface …', '<code>set rulebase nat rules SNAT-OUT from trust to untrust source LAN-NET destination any source-translation dynamic-ip-and-port interface-address interface ethernet1/1</code>'],
              steps: C(SNAT),
              check: s => s.decide(OUT).stage === 'allowed',
              fb: s => (s.decide(OUT).stage === 'nonat' ? 'WEB-OUT izin veriyor ama kaynak NAT eşleşmiyor: SNAT-OUT from trust to untrust, source LAN-NET mi? (NAT kuralı pre-NAT zone\'larla yazılır.)' : pend(s)) },
            { t: 'Hedef NAT <code>WEB-DNAT</code>: from <code>untrust</code> <b>to untrust</b>, kaynak any, hedef <code>203.0.113.10</code>, servis <code>service-https</code>, <code>translated-address WEB-SRV</code>. Commit edin.',
              why: 'NAT değerlendirmesi, paketin <i>çevrilmeden önceki</i> hedefine göre yapılan rota aramasıyla bulunan zone\'u kullanır: 203.0.113.10 WAN ağında → hedef zone <b>untrust</b>. "to dmz" yazmak en yaygın DNAT hatasıdır.',
              hints: ['Hedef zone pre-NAT (untrust).', '<code>set rulebase nat rules WEB-DNAT from untrust to untrust source any destination 203.0.113.10 service service-https destination-translation translated-address WEB-SRV</code>'],
              steps: C(DNAT('untrust')),
              check: s => s.decide(IN).dst2 === '172.24.50.10',
              fb: s => { const R = 'rulebase nat rules WEB-DNAT ';
                  if (arr(s, R + 'to').includes('dmz')) return 'NAT kuralında hedef zone dmz: pre-NAT hedef (203.0.113.10) untrust\'ta, "to untrust" olmalı.';
                  if (arr(s, R + 'destination').some(x => x === 'WEB-SRV' || /^172\.24\.50\.10/.test(x))) return 'NAT kuralının destination alanında gerçek sunucu adresi var: DNAT pre-NAT genel IP\'ye (203.0.113.10) göre eşleşir; gerçek adres yalnız translated-address\'te.';
                  if (has(s, 'rulebase nat rules WEB-DNAT') && !has(s, R + 'destination-translation translated-address')) return 'Çeviri tanımlı değil: destination-translation translated-address WEB-SRV ekleyin.';
                  return pend(s); } },
            { t: 'Güvenlik kuralı <code>WEB-IN</code>: from <code>untrust</code> <b>to dmz</b>, kaynak any, hedef <code>203.0.113.10</code> (pre-NAT), uygulama <code>ssl</code>, application-default, allow. Commit edin.',
              why: 'Güvenlik kuralı NAT\'tan sonra değerlendirilir ama adresleri orijinal pakete göredir: hedef <b>IP pre-NAT</b> (203.0.113.10), hedef <b>zone post-NAT</b> (dmz — sunucunun gerçek yeri). Gerçek IP\'yi (172.24.50.10) yazmak ya da "to untrust" demek kuralı ıskalatır.',
              hints: ['IP pre-NAT, zone post-NAT.', '<code>set rulebase security rules WEB-IN from untrust to dmz source any destination 203.0.113.10 application ssl service application-default action allow</code>'],
              steps: C(WEBIN('dmz', '203.0.113.10')), needs: [1],
              check: s => webOk(s) && s.decide(IN).rule === 'WEB-IN',
              fb: s => { const dst = arr(s, 'rulebase security rules WEB-IN destination'), to = arr(s, 'rulebase security rules WEB-IN to'); return dst.includes('WEB-SRV') || dst.some(x => /^172\.24\.50\.10/.test(x)) ? 'Hedefte gerçek (post-NAT) IP var: güvenlik kuralında pre-NAT IP 203.0.113.10 yazılır.' : to.includes('untrust') ? 'Hedef zone untrust: güvenlik kuralında post-NAT zone (dmz) yazılır.' : !s.decide(IN).nat ? 'İstek hiç çevrilmiyor: önce WEB-DNAT (2. görev) çalışmalı.' : pend(s); } },
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
            { t: 'LAN istemcisi 10.64.10.50 internete (198.51.100.80:443) çıkarken paketin kaynak adresi neye çevrilir? <code>test nat-policy-match</code> ile bakıp cevaplayın.', ask: { choices: [['wanip', '203.0.113.2 (ethernet1/1 adresi); kaynak port da değişir'], ['vip', '203.0.113.10 (web yayını adresi)'], ['none', 'Çevrilmez: 10.64.10.50 olarak çıkar']], correct: 'wanip' },
              why: 'Çıktıdaki "Source-NAT: Rule matched: SNAT-OUT" satırının altında <code>10.64.10.50:0 =&gt; 203.0.113.2:port</code> görünür. DIPP kaynak adresi çıkış arayüzünün IP\'sine, kaynak portu da cihazın seçtiği bir porta çevirir; dönüş trafiği bu port ile doğru iç istemciye eşlenir. 203.0.113.10 yalnız gelen istekler için DNAT adresidir.',
              hints: ['<code>test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6</code>', '"=&gt;" işaretinin sağındaki adres çevrilmiş kaynaktır.'],
              steps: ['test nat-policy-match from trust to untrust source 10.64.10.50 destination 198.51.100.80 destination-port 443 protocol 6', { answer: 5, v: 'wanip' }], needs: [0] },
        ],
        verify: ['show rulebase nat', 'test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6', 'test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl', 'show session all'],
        learn: ['SNAT (DIPP): dynamic-ip-and-port interface-address.', 'NAT kuralı: hedef zone pre-NAT (rota aramasına göre).', 'Güvenlik kuralı: hedef IP pre-NAT, hedef zone post-NAT.', 'test nat-policy-match pre-NAT değerlerle çalıştırılır.', 'NAT testinde "=&gt;" solunda orijinal, sağında çevrilmiş adres:port.', 'Yanlış zone ya da IP commit hatası vermez: test komutlarıyla doğrulayın.'],
        links: { tool: '#/paloalto/nat', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0' }, cert: 'Network Security Analyst'
    },
    // ═══ Seviye 4 ═══════════════════════════════════════════════════════════
    {
        id: 'pan-05', vendor: 'paloalto', level: 4, title: 'test security-policy-match ile kural doğrulama ve gölgelenme', minutes: 20, kind: 'firewall', hostname: 'PA-FW', pre: ['pan-03'],
        up: UP, hosts: HOSTS, sim: { flows: FLOWS },
        start: BASE.concat(OBJ, ['set rulebase security rules DENY-DMZ from trust to dmz source any destination any application any service any action deny',
            'set rulebase security rules LAN-TO-WEB from trust to dmz source LAN-NET destination WEB-SRV application ssl service application-default action allow'], WEBOUT, SNAT),
        story: 'Ekip, LAN\'dan DMZ\'deki web sunucusuna (172.24.50.10, SSL) erişim için <code>LAN-TO-WEB</code> kuralını yazmış ama kullanıcılar bağlanamıyor. Kural tabanında yukarıdan aşağı <b>ilk eşleşen</b> kazanır; geniş bir kural daha özel bir kuralı <b>gölgeleyebilir</b> (shadowing). Tahmin etmeyin, test edin.',
        lesson: L('Güvenlik kuralları yukarıdan aşağı değerlendirilir; ilk eşleşen kural uygulanır ve sonrakilere hiç bakılmaz. Daha geniş bir kural (ör. her şeyi kapsayan bir deny) daha özel bir kuralın üstündeyse, özel kural hiçbir zaman eşleşmez: buna <b>gölgelenme</b> (shadowing) denir. <code>test security-policy-match</code>, trafik üretmeden running kurallar arasında ilk eşleşeni, sırasını (<code>index</code>) ve eylemini gösterir.',
            'Gölgelenmiş kural bir hata üretmez: kural tabanında doğru görünür ama çalışmaz. Commit ve validate işleri gölgelenme için uyarı verir ("shadows rule") ama commit\'i durdurmaz. Kesin kanıt test komutudur; düzeltme ise sırayı değiştirmektir, geniş kuralı silmek değil.',
            'test security-policy-match from trust to dmz source 10.64.10.60 destination 172.24.50.20 destination-port 22 protocol 6 application ssh\nconfigure\nmove rulebase security rules ALLOW-SSH before DENY-ALL\ncommit\nrun test security-policy-match from trust to dmz source 10.64.10.60 destination 172.24.50.20 destination-port 22 protocol 6 application ssh',
            ['Sorunu çözmek için geniş deny kuralını silmek: özel kural çalışır ama o kuralın engellediği diğer tüm trafik açılır.', '<code>move</code>\'dan sonra commit\'i unutmak: test running\'e baktığı için sonuç değişmez.', 'Teste yanlış parametre vermek: protokol numarayla verilir (TCP 6, UDP 17, ICMP 1) ve application gerçek trafiğinkiyle aynı olmalı; yoksa test başka bir kurala düşer.']),
        goals: ['test security-policy-match parametreleri', 'İlk eşleşen kural ve gölgelenme', 'move rulebase … before/top', 'Değişiklikten sonra yeniden test'],
        tasks: [
            { t: 'Akışı test edin: 10.64.10.50 → 172.24.50.10 tcp/443, application <code>ssl</code>, trust → dmz.',
              why: 'Önce kanıt, sonra değişiklik. Test, trafik üretmeden running kurallar içinde ilk eşleşeni gösterir: ilk satırdaki <code>"ad; index: N"</code> kuralın adı ve kural tabanındaki sırasıdır, <code>action</code> satırı akışa ne olacağını söyler.',
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
              fb: s => (!s.rules().includes('DENY-DMZ') ? 'DENY-DMZ silinmiş: DMZ\'ye diğer erişim artık interzone-default\'a kalıyor; kuralı geri koyup sırayı move ile düzeltin.' : pend(s)) },
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
        learn: ['Kurallar yukarıdan aşağı; ilk eşleşen kazanır.', 'Geniş kural üstteyse altındaki özel kural gölgelenir.', 'move … before/after/top/bottom ile sırala; silme.', 'Test commit edilmiş kuralları sınar: commit sonrası yeniden test.', 'Commit gölgelenme için uyarı verir ("shadows rule") ama durdurmaz.'],
        links: { tool: '#/paloalto/policy', cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0' }, cert: 'Network Security Analyst'
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
        lesson: L('Yayınlanan bir sunucuya erişim iki bağımsız katmanda bozulabilir: <b>NAT</b> (istek sunucunun gerçek adresine çevriliyor mu?) ve <b>güvenlik</b> (çevrilen akışa izin veriliyor mu?). İki test komutu bu katmanları birbirinden ayırır: <code>test nat-policy-match</code> pre-NAT değerlerle (from untrust to untrust, hedef genel IP), <code>test security-policy-match</code> güvenlik kuralının göreceği değerlerle (hedef IP pre-NAT, hedef zone post-NAT) çalıştırılır. İkisi de running\'e bakar; commit edilmemiş düzeltme testte görünmez, <code>show config diff</code> onu ortaya çıkarır.',
            'Tahminle kural değiştirmek, hele "şimdilik" any/any bir kural eklemek, sunucuyu tüm internete açar ve asıl nedeni gizler. Katman katman kanıt toplamak doğru parçayı bulur ve en az değişiklikle kalıcı düzeltme sağlar: arıza kaydını kapatırken aynı testin artık doğru kuralı gösterdiği kanıt olarak eklenir.',
            'test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6\ntest security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl\nshow session all filter destination 203.0.113.10\nshow config diff\nconfigure\nshow rulebase security rules WEB-IN\nshow rulebase nat rules WEB-DNAT',
            ['Güvenlik testini <code>to untrust</code> ya da hedef 172.24.50.10 ile çalıştırmak: test başka bir soruyu cevaplar ve yanlış yöne götürür.', 'Çok değerli alanda yanlış değeri silmeden doğrusunu <code>set</code> etmek: set ekler, yanlış değer listede kalır.', 'Düzeltmeyi yapıp commit etmemek ya da düzeltme yerine geniş bir allow kuralı eklemek.']),
        goals: ['test nat-policy-match ile NAT katmanını ayırmak', 'test security-policy-match ile doğru pre/post-NAT değerlerini kullanmak', 'Gölgelenen kuralı bulmak', 'Commit edilmemiş düzeltmeyi fark etmek (show config diff)'],
        tasks: [
            { t: 'NAT katmanı: dış istemci 198.51.100.7\'den 203.0.113.10:443\'e gelen paketi <code>test nat-policy-match</code> ile sınayın (pre-NAT değerlerle).',
              why: 'Paket untrust\'tan gelir ve hedefi (203.0.113.10) rota aramasına göre yine untrust\'tadır: NAT testi <b>from untrust to untrust</b> ile yapılır.',
              hints: ['from untrust to untrust, destination 203.0.113.10', '<code>test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6</code>'],
              steps: ['test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6'],
              check: s => tested(s, /^test nat-policy-match from untrust to untrust source 198\.51\.100\.7 destination 203\.0\.113\.10/) },
            { t: 'NAT testi ne gösterdi?', ask: { choices: [['match', 'WEB-DNAT eşleşti: 203.0.113.10 → 172.24.50.10'], ['none', 'Eşleşen NAT kuralı yok']], correct: v => (v.key === 'natzone' ? 'none' : 'match') },
              why: 'NAT kuralı "to dmz" yazılmışsa pre-NAT zone (untrust) ile eşleşmez: çeviri hiç olmaz. Paketin hedefi 203.0.113.10 olarak kalır, yani untrust içinde kalır ve DMZ\'deki sunucuya hiç ulaşmaz; WEB-IN (to dmz) de bu yüzden devreye giremez.',
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
              fb: s => { const d = s.decide(IN); if (!s.committed() && !webOk(s)) return 'Candidate\'te değişiklik var ama commit edilmemiş (show config diff).'; if (openAny(s)) return 'Çalışır ama dışarıdan application any ile izin veren bir kural var: sunucuyu tüm uygulamalara açar. Yalnız ssl.'; if (!d.nat) return 'NAT kuralı eşleşmiyor: WEB-DNAT\'ın zone\'larına bakın (istek sunucuya hiç çevrilmiyor).';
                  const dst = arr(s, 'rulebase security rules WEB-IN destination'), to = arr(s, 'rulebase security rules WEB-IN to');
                  if (!dst.includes('203.0.113.10')) return 'NAT çalışıyor ama WEB-IN hedefinde pre-NAT IP (203.0.113.10) yok: güvenlik kuralı orijinal hedef IP\'yi görür.';
                  if (!to.includes('dmz')) return 'NAT çalışıyor ama WEB-IN hedef zone\'u dmz değil: güvenlik kuralında post-NAT zone yazılır.';
                  if (d.stage === 'allowed' && d.rule === 'WEB-IN') return null;
                  return d.rule && d.rule !== 'interzone-default' ? 'NAT çalışıyor; akış ' + d.rule + (d.stage === 'denied' ? ' (deny) ile düşüyor: WEB-IN\'i move ile onun önüne alın.' : ' ile eşleşiyor.') : 'NAT çalışıyor; akış ' + (d.rule || d.stage) + ' ile düşüyor.'; } },
            { t: 'Commit\'ten <b>sonra</b> güvenlik testini tekrarlayın; <code>WEB-IN</code> allow ile eşleşmeli.',
              why: 'Kapanış kanıtı: aynı test artık doğru kuralı gösteriyor. (Test commit edilmiş yapılandırmayı sınar.)',
              hints: ['Aynı test komutu.', '<code>test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl</code>'],
              steps: ['test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl'], needs: [4],
              check: s => { const c = lastIdx(s, e => e.commit === 'ok'), t = lastIdx(s, e => e.canon && /^test security-policy-match/.test(e.canon) && e.res === 'WEB-IN'); return c >= 0 && t > c && webOk(s); } },
        ],
        verify: ['test nat-policy-match from untrust to untrust source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6', 'test security-policy-match from untrust to dmz source 198.51.100.7 destination 203.0.113.10 destination-port 443 protocol 6 application ssl', 'show rulebase security', 'show config diff', 'show session all'],
        learn: ['DNAT: NAT kuralı to = pre-NAT zone; güvenlik kuralı: IP pre-NAT, zone post-NAT.', 'Önce NAT testi, sonra güvenlik testi.', 'Geniş deny üstteyse özel allow gölgelenir: move ile sırala.', 'Commit edilmemiş düzeltme cihazda yoktur: show config diff.', 'NAT eşleşmezse istek çevrilmez: untrust içinde kalır, sunucuya ulaşmaz.', 'Çok değerli alanda önce yanlış değeri delete, sonra doğrusunu set.'],
        links: { cli: '#/cli/paloalto', wizard: '#/troubleshoot/paloalto/0', tool: '#/paloalto/nat' }, cert: 'NGFW Engineer'
    },
    { id: 'pan-sandbox', vendor: 'paloalto', level: null, sandbox: true, title: 'Serbest terminal — PAN-OS', kind: 'firewall', hostname: 'PA-VM', up: UP, hosts: HOSTS, start: BASE,
      story: 'ethernet1/1–1/8 arayüzlü bir PA-VM (1/1 untrust 203.0.113.2/24, 1/2 trust 10.64.10.1/24, 1/3 dmz 172.24.50.1/24, varsayılan rota hazır). Görev yok; <code>configure</code> → <code>set</code> → <code>commit</code>, <code>test security-policy-match</code> ve <code>?</code> yardımını deneyin.', tasks: [] },
    ];
    // Kontrolü geçen ama riskli yapılandırma: tamamlanmış görevde de uyarı olarak gösterilir ("Çalışır ama…")
    const ruleWarn = s => { for (const n of s.rules()) { const p = 'rulebase security rules ' + n + ' '; if (s.val(p + 'action') !== 'allow') continue;
            if (s.val(p + 'log-end') === 'no') return 'Çalışır ama ' + n + ' kuralında log-end no: izin verilen oturumlar günlüğe düşmez, sorun gidermede kör kalırsınız.';
            if (arr(s, p + 'application').includes('any')) return 'Çalışır ama ' + n + ' kuralında application any: App-ID\'nin koruması devre dışı; gereken uygulamaları yazın.'; } return null; };
    const mpWarn = s => { const ps = s.val('network profiles interface-management-profile'); if (!(ps instanceof Map)) return null; for (const [n, o] of ps) if (o instanceof Map && o.get('http') === 'yes') return 'Çalışır ama ' + n + ' yönetim profilinde HTTP açık: parola açık metin gider; yalnız HTTPS/SSH.'; return null; };
    LABS.forEach(l => l.tasks.forEach(t => {
        const st = JSON.stringify(typeof t.steps === 'function' ? t.steps(l.variants ? l.variants[0] : {}) : (t.steps || []));
        const extra = [/rulebase security rules/.test(st) ? ruleWarn : null, /interface-management-profile/.test(st) ? mpWarn : null].filter(Boolean);
        if (!extra.length || t.ask) return;
        const orig = t.fb;
        t.fb = s => { let m = null; try { m = orig ? orig(s) : null; } catch (e) { m = null; } if (m) return m; for (const w of extra) { const x = w(s); if (x) return x; } return null; };
    }));
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
