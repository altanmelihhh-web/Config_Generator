'use strict';
// ─── CLI Lab: FortiGate öğrenme yolu lab'ları (FortiOS 7.4 görünümü) ─────────
// fortigate.js'teki temel ve teşhis lab'larını tamamlar: sistem servisleri, kural sırası, IP havuzu,
// kimlik doğrulama, güvenlik profilleri, VLAN/zone, log, yönetim sıkılaştırma, yedekleme.
// Kontroller kaydedilmiş duruma bakar (next/end sonrası). Adresler yalnız güvenli örnek bloklardan.
(function () {
    const pol = (s, name) => { const k = s.keys('firewall policy').find(k => s.obj('firewall policy', k).name === name); return k ? s.obj('firewall policy', k) : null; };
    const polKey = (s, name) => s.keys('firewall policy').find(k => s.obj('firewall policy', k).name === name);
    const same = (a, b) => Array.isArray(a) && a.length === b.length && b.every(x => a.includes(x));
    const L = (k, n, o, h) => '<h4>Kavram</h4><p>' + k + '</p><h4>Neden önemli</h4><p>' + n + '</p><h4>Örnek yapılandırma</h4><pre>' + o + '</pre><h4>Sık hatalar</h4><ul>' + h.map(x => '<li>' + x + '</li>').join('') + '</ul>';
    const IF = (port, ip, extra) => ['config system interface', 'edit ' + port, 'set ip ' + ip].concat(extra || [], ['end']);
    const ROUTE = ['config router static', 'edit 1', 'set gateway 203.0.113.1', 'set device port1', 'end'];
    const WAN_LAN = () => IF('port1', '203.0.113.2 255.255.255.252', ['set role wan']).concat(IF('port2', '10.64.10.1 255.255.255.0', ['set role lan']), ROUTE);
    const SRV = () => IF('port3', '10.64.50.1 255.255.255.0', ['set role dmz']);
    const ADDR = (name, net) => ['config firewall address', 'edit ' + name, 'set subnet ' + net, 'end'];
    const POLICY = (id, name, si, di, sa, da, svc, act, extra) => ['config firewall policy', 'edit ' + id, 'set name ' + name, 'set srcintf ' + si, 'set dstintf ' + di, 'set srcaddr ' + sa, 'set dstaddr ' + da,
        'set action ' + act, 'set schedule always', 'set service ' + svc].concat(extra || [], ['end']);
    const lastIdx = (s, fn) => { const l = s.ev.list(); for (let i = l.length - 1; i >= 0; i--) if (fn(l[i])) return i; return -1; };

    // Kural sırası lab'ı (fgt-05): iki varyant — misafir engeli ya da yönetici istisnası altta kalmış
    const ORDER_V = [
        { key: 'guest', wrong: '1', right: '2', flow: { src: '10.64.10.150', dst: '10.64.50.10', dport: 445, in: 'port2' }, want: 'denied', other: { src: '10.64.10.20', dst: '10.64.50.10', dport: 445, in: 'port2' }, otherWant: 'allowed',
          start: ADDR('LAN-NET', '10.64.10.0 255.255.255.0').concat(ADDR('GUEST-NET', '10.64.10.128 255.255.255.128'), ADDR('SRV-NET', '10.64.50.0 255.255.255.0'),
              POLICY(1, 'LAN-TO-SRV', 'port2', 'port3', 'LAN-NET', 'SRV-NET', 'ALL', 'accept'), POLICY(2, 'GUEST-DENY-SRV', 'port2', 'port3', 'GUEST-NET', 'SRV-NET', 'ALL', 'deny')),
          complaint: 'Denetim: misafir cihazlar (10.64.10.128/25) sunucu ağına dosya paylaşımıyla (445) erişebiliyor — oysa bunu engelleyen bir kural var.' },
        { key: 'admin', wrong: '1', right: '2', flow: { src: '10.64.10.5', dst: '10.64.50.10', dport: 3389, in: 'port2' }, want: 'allowed', other: { src: '10.64.10.20', dst: '10.64.50.10', dport: 3389, in: 'port2' }, otherWant: 'denied',
          start: ADDR('LAN-NET', '10.64.10.0 255.255.255.0').concat(ADDR('ADMIN-PC', '10.64.10.5 255.255.255.255'), ADDR('SRV-NET', '10.64.50.0 255.255.255.0'),
              POLICY(1, 'RDP-DENY-LAN', 'port2', 'port3', 'LAN-NET', 'SRV-NET', 'RDP', 'deny'), POLICY(2, 'ADMIN-RDP', 'port2', 'port3', 'ADMIN-PC', 'SRV-NET', 'RDP', 'accept')),
          complaint: 'Yardım masası: yönetici bilgisayarı (10.64.10.5) sunuculara uzak masaüstüyle (RDP 3389) bağlanamıyor — oysa ona izin veren bir kural var.' },
    ];

    const LABS = [
    // ═══ Sistem servisleri: DNS, NTP, DHCP ═══
    {
        id: 'fgt-02', vendor: 'fortigate', level: 1, title: 'Sistem servisleri: DNS, NTP ve DHCP sunucusu', minutes: 20, kind: 'firewall', hostname: 'FGT-SUBE', pre: ['fgt-01'],
        up: ['port1', 'port2'], hosts: ['203.0.113.1', '198.51.100.53', '192.0.2.123'],
        start: WAN_LAN(),
        sim: { ntp: ['192.0.2.123'], dhcp: [{ mac: '00:50:56:A1:02:01', intf: 'port2', host: 'PC-MUHASEBE' }, { mac: '00:50:56:A1:02:02', intf: 'port2', host: 'PC-SATIS' }, { mac: '00:50:56:A1:02:03', intf: 'port2', host: 'YAZICI-KAT1' }] },
        story: 'Yeni şube FortiGate\'i (FGT-SUBE) kuruluyor. Cihazın kendisi ad çözebilmeli ve saati doğru olmalı (loglar ve sertifikalar saate bağlıdır). Ardından LAN\'daki (port2, 10.64.10.0/24) bilgisayarlar adreslerini FortiGate\'ten alacak: dağıtım aralığı .100–.199, ağ geçidi FortiGate\'in kendisi.',
        lesson: L('FortiGate\'in <b>kendi</b> DNS ayarı (<code>config system dns</code>) FortiGuard, NTP adları ve log sunucuları gibi cihaz içi işler içindir. <b>NTP</b> (<code>config system ntp</code>) varsayılanda FortiGuard sunucularını kullanır; kurumsal NTP için <code>set type custom</code> ve <code>config ntpserver</code>. <b>DHCP sunucusu</b> arayüz başına tanımlanır: ağ geçidi, maske, DNS kaynağı ve <code>config ip-range</code> içinde dağıtım aralığı.',
            'Saat yanlışsa loglar yanlış sıralanır, sertifika doğrulaması ve VPN\'ler başarısız olabilir. DHCP\'de aralık arayüzün alt ağının dışındaysa istemciler adres alamaz; ağ geçidi verilmezse IP alırlar ama internete çıkamazlar.',
            'config system dns\n    set primary 198.51.100.53\n    set secondary 198.51.100.54\nend\nconfig system ntp\n    set type custom\n    config ntpserver\n        edit 1\n            set server "192.0.2.123"\n        next\n    end\nend\nconfig system dhcp server\n    edit 1\n        set interface "port2"\n        set default-gateway 10.64.10.1\n        set netmask 255.255.255.0\n        set dns-service default\n        config ip-range\n            edit 1\n                set start-ip 10.64.10.100\n                set end-ip 10.64.10.199\n            next\n        end\n    next\nend',
            ['DHCP aralığını arayüzün alt ağı dışında vermek.', 'Ağ geçidini (default-gateway) unutmak.', 'NTP\'yi custom yapıp sunucu eklememek (saat hiç eşitlenmez).']),
        goals: ['Cihaz DNS\'i', 'Özel NTP sunucusu ve eşitleme kontrolü', 'Arayüz DHCP sunucusu ve ip-range', 'Kira listesini okumak'],
        tasks: [
            { t: 'Cihazın DNS sunucuları: birincil <code>198.51.100.53</code>, ikincil <code>198.51.100.54</code>.', why: 'FortiGate FortiGuard güncellemeleri, NTP ve FQDN nesneleri için ad çözer. Tek sunucu tek hata noktasıdır; ikincil ekleyin.',
              hints: ['config system dns', '<code>set primary 198.51.100.53</code> → <code>set secondary 198.51.100.54</code>'], steps: ['config system dns', 'set primary 198.51.100.53', 'set secondary 198.51.100.54', 'end'],
              check: s => { const d = s.obj('system dns'); return d.primary === '198.51.100.53' && d.secondary === '198.51.100.54'; } },
            { t: 'NTP: FortiGuard yerine kurum sunucusu <code>192.0.2.123</code> kullanılsın.', why: '<code>type custom</code> seçince sunucu listesi <code>config ntpserver</code> alt tablosundan gelir; liste boşsa saat hiç eşitlenmez.',
              hints: ['config system ntp → set type custom → config ntpserver', '<code>set type custom</code> · <code>config ntpserver</code> → <code>edit 1</code> → <code>set server 192.0.2.123</code> → <code>next</code> → <code>end</code>'],
              steps: ['config system ntp', 'set ntpsync enable', 'set type custom', 'config ntpserver', 'edit 1', 'set server 192.0.2.123', 'next', 'end', 'end'],
              check: s => { const n = s.obj('system ntp'); return n.type === 'custom' && s.keys('system ntp ntpserver').some(k => s.obj('system ntp ntpserver', k).server === '192.0.2.123'); },
              fb: s => { const n = s.obj('system ntp'); return n.type === 'custom' && !s.keys('system ntp ntpserver').length ? 'type custom ama sunucu listesi boş: saat eşitlenmez.' : null; } },
            { t: 'Saat eşitlendi mi? NTP durumuna bakın.', ask: { choices: [['yes', 'Evet: synchronized: yes, sunucu reachable ve selected'], ['no', 'Hayır: synchronized: no'], ['off', 'NTP kapalı (ntpsync: disabled)']], correct: 'yes' },
              why: '<code>diagnose sys ntp status</code> ilk satırda eşitleme durumunu, altında her sunucunun ulaşılabilirliğini gösterir. "unreachable" ise yol ya da güvenlik kuralı sorunu vardır.', hints: ['diagnose sys ntp status', 'İlk satır: synchronized'],
              steps: ['diagnose sys ntp status', { answer: 2, v: 'yes' }], needs: [1] },
            { t: 'port2 için DHCP sunucusu: ağ geçidi 10.64.10.1, maske /24, DNS olarak cihazın DNS ayarı (<code>dns-service default</code>), aralık 10.64.10.100–10.64.10.199.', why: 'Aralık <code>config ip-range</code> alt tablosundadır ve arayüzün alt ağının içinde olmalıdır. <code>dns-service default</code> istemcilere FortiGate\'in kendi DNS sunucularını verir.',
              hints: ['config system dhcp server → edit 1 → … → config ip-range', '<code>set interface port2</code> · <code>set default-gateway 10.64.10.1</code> · <code>set netmask 255.255.255.0</code> · <code>set dns-service default</code> · <code>config ip-range</code> → <code>edit 1</code> → <code>set start-ip 10.64.10.100</code> → <code>set end-ip 10.64.10.199</code>'],
              steps: ['config system dhcp server', 'edit 1', 'set interface port2', 'set default-gateway 10.64.10.1', 'set netmask 255.255.255.0', 'set dns-service default', 'config ip-range', 'edit 1', 'set start-ip 10.64.10.100', 'set end-ip 10.64.10.199', 'next', 'end', 'next', 'end'],
              check: s => { const L2 = s.dhcpLeases(); return L2.length === 3 && L2.every(l => l.ip && l.gw === '10.64.10.1'); },
              fb: s => { const L2 = s.dhcpLeases(); if (L2.some(l => l.reason === 'range')) return 'Aralık port2 ağının (10.64.10.0/24) dışında: istemciler adres alamıyor.'; if (L2.some(l => l.ip && (!l.gw || l.gw === '0.0.0.0'))) return 'Çalışır ama eksik: ağ geçidi yok — istemciler IP alır, internete çıkamaz.'; return null; } },
            { t: 'Kira listesine bakın: muhasebe bilgisayarı hangi adresi aldı?', ask: { choices: [['100', '10.64.10.100'], ['1', '10.64.10.1'], ['2', '10.64.10.2']], correct: '100' },
              why: 'FortiGate aralığın başından dağıtır; ağ geçidi adresi (.1) aralık dışında kaldığı için hiçbir istemciye verilmez. Kiralar <code>execute dhcp lease-list</code> ile görülür.', hints: ['execute dhcp lease-list', 'PC-MUHASEBE satırı'],
              steps: ['execute dhcp lease-list', { answer: 4, v: '100' }], needs: [3] },
        ],
        verify: ['get system dns', 'diagnose sys ntp status', 'show system dhcp server', 'execute dhcp lease-list'],
        learn: ['config system dns: cihazın kendi ad çözümü.', 'NTP custom → config ntpserver şart.', 'DHCP sunucusu arayüz başına; aralık config ip-range içinde, alt ağın içinde.', 'Kiralar: execute dhcp lease-list.'],
        links: { tool: '#/fortigate/dhcp', cli: '#/cli/fortigate' }, cert: 'NSE 4 · M1'
    },
    // ═══ Kural sırası ═══
    {
        id: 'fgt-05', vendor: 'fortigate', level: 2, title: 'Kural sırası: gölgelenen kural ve move', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-04'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1', '10.64.50.10'],
        start: WAN_LAN().concat(SRV()),
        variants: ORDER_V.map(v => ({ key: v.key, wrong: v.wrong, right: v.right, flow: v.flow, want: v.want, other: v.other, otherWant: v.otherWant, start: v.start, complaint: v.complaint })),
        story: 'FortiGate kuralları <b>listedeki sıraya göre</b> yukarıdan aşağı değerlendirir; ilk eşleşen kural uygulanır. Kural numarası (ID) sırayı belirlemez. Bugünkü kayıt aşağıda — hangi kuralın eşleştiğini kanıtlayın ve <b>kural silmeden</b> düzeltin. <small>Her turda farklı kayıt — "Yeni tur".</small>',
        lesson: L('Her paket kural listesinde yukarıdan aşağı aranır; ilk eşleşen kuralın eylemi uygulanır, hiçbiri eşleşmezse sondaki örtük <b>deny</b> (policy 0). Geniş bir kural daha özel bir kuralın üstündeyse özel kural hiç çalışmaz: <b>gölgelenmiş (shadowed)</b> kural. Sıra <code>move &lt;id&gt; before|after &lt;id&gt;</code> ile değiştirilir; ID değişmez. <code>diagnose firewall iprope lookup</code> bir paketin hangi kurala düştüğünü söyler.',
            'Gölgelenen engelleme kuralı güvenlik açığıdır ("kural var ama çalışmıyor"); gölgelenen izin kuralı kesintidir. GUI\'de sıra görünür ama CLI\'da <code>edit 0</code> yeni kuralı listenin <b>sonuna</b> ekler — yeni istisnalar hep en alta düşer.',
            'diagnose firewall iprope lookup 10.64.10.150 50000 10.64.50.10 445 tcp port2\n&lt;src [...] dst [...] proto tcp dev port2&gt; matches policy id: 1\n\nconfig firewall policy\n    move 2 before 1\nend',
            ['Sorunu çözmek için geniş kuralı silmek ya da kapatmak (başka trafiği keser).', 'Yeni istisna kuralını edit 0 ile en alta ekleyip taşımayı unutmak.', 'ID sırasını kural sırası sanmak.']),
        goals: ['Kural eşleşmesini kanıtlamak (iprope lookup)', 'Gölgelenmiş kuralı tanımak', 'move ile sırayı düzeltmek', 'Diğer trafiği bozmadan doğrulamak'],
        tasks: [
            { t: 'Şikâyetteki trafiğin hangi kurala düştüğünü bulun.', ask: { choices: [['1', 'Policy 1'], ['2', 'Policy 2'], ['0', 'Hiçbiri (örtük deny, policy 0)']], correct: v => v.wrong },
              why: 'Tahmin yerine kanıt: <code>diagnose firewall iprope lookup &lt;kaynak&gt; &lt;kport&gt; &lt;hedef&gt; &lt;hport&gt; &lt;proto&gt; &lt;giriş arayüzü&gt;</code> paketin eşleştiği kuralı gösterir.',
              hints: ['diagnose firewall iprope lookup …', 'Şikâyetteki kaynak/hedef/port ile, giriş arayüzü port2.'],
              steps: v => ['diagnose firewall iprope lookup ' + v.flow.src + ' 50000 ' + v.flow.dst + ' ' + v.flow.dport + ' tcp port2', { answer: 0, v: v.wrong }] },
            { t: 'Kural tablosuna bakın. Neden beklenen kural çalışmıyor?', ask: { choices: [['order', 'Daha geniş bir kural listede önce geliyor; beklenen kural gölgelenmiş'], ['id', 'Kural ID\'si büyük olduğu için önceliği düşük'], ['disabled', 'Beklenen kural kapalı (status disable)']], correct: 'order' },
              why: 'Önemli olan <b>listedeki sıra</b>: <code>show firewall policy</code> çıktısındaki sıra değerlendirme sırasıdır. ID yalnız kimliktir.', hints: ['show firewall policy', 'Hangi kural üstte ve daha geniş?'],
              steps: ['show firewall policy', { answer: 1, v: 'order' }], needs: [0] },
            { t: 'Kural silmeden sırayı düzeltin: özel kural geniş kuralın önüne geçsin.', why: '<code>move</code> kuralı taşır, ID\'leri korur; kural silmek ya da kapatmak diğer kullanıcıların trafiğini de etkiler.',
              hints: ['config firewall policy → move …', '<code>move &lt;özel kural ID&gt; before &lt;geniş kural ID&gt;</code>'],
              steps: v => ['config firewall policy', 'move ' + v.right + ' before ' + v.wrong, 'end'],
              check: s => { const v = s.variant(); return s.order('firewall policy').indexOf(v.right) < s.order('firewall policy').indexOf(v.wrong) && s.decide(v.flow).stage === v.want && s.decide(v.other).stage === v.otherWant && s.keys('firewall policy').length === 2 && s.keys('firewall policy').every(k => s.obj('firewall policy', k).status === 'enable'); },
              fb: s => { if (s.keys('firewall policy').length < 2) return 'Kural silindi: sorun sıra; silmek başka trafiği de değiştirir.'; if (s.keys('firewall policy').some(k => s.obj('firewall policy', k).status === 'disable')) return 'Kural kapatıldı: sıra düzeltilmeli, kapatmak değil.'; return null; } },
            { t: 'Kanıtlayın: aynı aramayı tekrar yapın; artık doğru kurala düşmeli.', why: 'Değişiklikten sonra aynı komutla doğrulamak, kaydı kapatmanın tek sağlam yoludur.',
              hints: ['Aynı iprope lookup komutu', 'Sonuç: özel kuralın ID\'si'], needs: [2], loo: false, /* 1. görevle aynı komut */
              steps: v => ['diagnose firewall iprope lookup ' + v.flow.src + ' 50000 ' + v.flow.dst + ' ' + v.flow.dport + ' tcp port2'],
              check: s => { const v = s.variant(), l = s.ev.list(), i = lastIdx(s, e => e.lookup !== undefined); return i >= 0 && l[i].lookup === v.right && lastIdx(s, e => /^move /.test(e.canon || '')) < i; } },
        ],
        verify: ['show firewall policy', 'diagnose firewall iprope lookup 10.64.10.150 50000 10.64.50.10 445 tcp port2'],
        learn: ['Sıra = listedeki konum; ID değil.', 'Geniş kural özel kuralı gölgeler.', 'move <id> before|after <id>; kural silmeyin.', 'iprope lookup ile kanıtlayın.'],
        links: { tool: '#/fortigate/policy', cli: '#/cli/fortigate', wizard: '#/troubleshoot/traffic' }, cert: 'NSE 4 · M2'
    },
    // ═══ Kaynak NAT: IP havuzu ═══
    {
        id: 'fgt-07', vendor: 'fortigate', level: 3, title: 'Kaynak NAT: sabit çıkış IP\'si için IP havuzu', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-05'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1', '198.51.100.25', '198.51.100.80'],
        start: WAN_LAN().concat(SRV(), ADDR('SRV-NET', '10.64.50.0 255.255.255.0'), ADDR('MAIL-SRV', '10.64.50.25 255.255.255.255'), POLICY(1, 'SRV-TO-WAN', 'port3', 'port1', 'SRV-NET', 'all', 'ALL', 'accept', ['set nat enable'])),
        sim: { flows: [{ src: '10.64.50.25', dst: '198.51.100.25', dport: 25, in: 'port3' }, { src: '10.64.50.30', dst: '198.51.100.80', dport: 443, in: 'port3' }] },
        story: 'E-posta sunucusu (10.64.50.25) dışarıya WAN arayüzünün adresiyle (203.0.113.2) çıkıyor. Oysa DNS\'teki SPF/PTR kayıtları <code>203.0.113.10</code> adresini gösteriyor; karşı sunucular postaları reddediyor. Yalnız e-posta sunucusu 203.0.113.10 ile çıksın; diğer sunucular WAN adresiyle çıkmaya devam etsin.',
        lesson: L('<b>IP havuzu</b> (<code>config firewall ippool</code>), kuralda <code>nat enable</code> + <code>ippool enable</code> + <code>poolname</code> ile kaynak adresi arayüz IP\'si yerine belirli bir genel adrese çevirir. <b>overload</b> çok kullanıcıyı port çevirisiyle aynı adrese sığdırır; <b>one-to-one</b> her iç adrese bir genel adres ayırır. Havuz yalnız onu kullanan kurala eşleşen trafiğe uygulanır — kural sırası yine belirleyicidir.',
            'Posta sunucuları, uzak erişim beyaz listeleri ve iş ortağı bağlantıları sabit, önceden bildirilmiş bir kaynak IP bekler. Yeni kural <code>edit 0</code> ile en alta eklenirse üstteki genel kural önce eşleşir ve havuz hiç kullanılmaz.',
            'config firewall ippool\n    edit "MAIL-OUT"\n        set type one-to-one\n        set startip 203.0.113.10\n        set endip 203.0.113.10\n    next\nend\nconfig firewall policy\n    edit 0\n        set name "MAIL-OUT"\n        set srcintf "port3"\n        set dstintf "port1"\n        set srcaddr "MAIL-SRV"\n        set dstaddr "all"\n        set action accept\n        set schedule "always"\n        set service "SMTP"\n        set nat enable\n        set ippool enable\n        set poolname "MAIL-OUT"\n    next\n    move 2 before 1\nend',
            ['Yeni kuralı genel kuralın altında bırakmak (havuz hiç kullanılmaz).', 'Havuzu kuralda seçip ippool enable\'ı unutmak.', 'Havuz adresini WAN alt ağına yönlendirilmeyen bir blokta seçmek (dönüş trafiği gelmez).']),
        goals: ['IP havuzu tipi (one-to-one / overload)', 'Kuralda havuz seçmek', 'Kural sırası ile birlikte düşünmek', 'Oturum tablosunda çevrilmiş adresi görmek'],
        tasks: [
            { t: '<code>MAIL-OUT</code> havuzu: tek adres 203.0.113.10, tip one-to-one.', why: 'Tek sunucu, tek genel adres: one-to-one port çevirmeden bire bir eşler. Havuz tek başına bir şey yapmaz; bir kural onu kullanmalıdır.',
              hints: ['config firewall ippool → edit MAIL-OUT', '<code>set type one-to-one</code> · <code>set startip 203.0.113.10</code> · <code>set endip 203.0.113.10</code>'],
              steps: ['config firewall ippool', 'edit MAIL-OUT', 'set type one-to-one', 'set startip 203.0.113.10', 'set endip 203.0.113.10', 'end'],
              check: s => { const p = s.obj('firewall ippool', 'MAIL-OUT'); return !!p && p.type === 'one-to-one' && p.startip === '203.0.113.10' && p.endip === '203.0.113.10'; } },
            { t: '<code>MAIL-OUT</code> kuralı: port3 → port1, kaynak MAIL-SRV, servis SMTP, NAT + havuz MAIL-OUT; genel kuraldan <b>önce</b> değerlendirilsin.', why: 'Kural sona eklenir; üstteki SRV-TO-WAN tüm sunucu ağını kapsadığı için önce eşleşir. <code>move</code> ile yeni kuralı öne alın.',
              hints: ['edit 0 ile kural, sonra move', '<code>set nat enable</code> · <code>set ippool enable</code> · <code>set poolname MAIL-OUT</code> → <code>next</code> → <code>move 2 before 1</code>'],
              steps: ['config firewall policy', 'edit 2', 'set name MAIL-OUT', 'set srcintf port3', 'set dstintf port1', 'set srcaddr MAIL-SRV', 'set dstaddr all', 'set action accept', 'set schedule always', 'set service SMTP', 'set nat enable', 'set ippool enable', 'set poolname MAIL-OUT', 'next', 'move 2 before 1', 'end'], needs: [0],
              check: s => { const d = s.decide({ src: '10.64.50.25', dst: '198.51.100.25', dport: 25, in: 'port3', proto: 'tcp' }), o = s.decide({ src: '10.64.50.30', dst: '198.51.100.80', dport: 443, in: 'port3', proto: 'tcp' }); return d.snat === '203.0.113.10' && o.snat === '203.0.113.2'; },
              fb: s => { const k = polKey(s, 'MAIL-OUT'), d = s.decide({ src: '10.64.50.25', dst: '198.51.100.25', dport: 25, in: 'port3', proto: 'tcp' }); if (k && d.policy !== k) return 'Kural var ama altta kaldı: SRV-TO-WAN önce eşleşiyor (move ile öne alın).'; const p = k && s.obj('firewall policy', k); if (p && p.nat === 'enable' && p.ippool !== 'enable') return 'NAT açık ama havuz kapalı: ippool enable + poolname gerekli.'; return null; } },
            { t: 'Oturum tablosunda doğrulayın: e-posta sunucusunun oturumu hangi adresle çıkıyor?', ask: { choices: [['10', '203.0.113.10 (havuz)'], ['2', '203.0.113.2 (WAN arayüzü)'], ['none', 'Çevrilmeden 10.64.50.25']], correct: '10' },
              why: '<code>diagnose sys session filter src …</code> ile süzüp <code>diagnose sys session list</code>\'te <code>act=snat</code> satırının parantez içindeki adresine bakılır.', hints: ['diagnose sys session filter src 10.64.50.25 → diagnose sys session list', 'hook=post … act=snat … (ADRES:port)'],
              steps: ['diagnose sys session filter src 10.64.50.25', 'diagnose sys session list', { answer: 2, v: '10' }], needs: [0, 1] },
            { t: 'Yüzlerce kullanıcıyı tek bir genel adrese sığdırmak isteseydiniz hangi havuz tipi?', ask: { choices: [['overload', 'overload (port çevirmeli, çoktan bire)'], ['one', 'one-to-one'], ['fixed', 'Hiçbiri; havuz tek kullanıcı içindir']], correct: 'overload' },
              why: 'overload, PAT gibi kaynak portu değiştirerek çok iç adresi aynı genel adreste taşır; one-to-one her iç adrese ayrı genel adres ayırır ve havuz biterse yeni oturum açılamaz.', hints: ['Port çevirisi', 'Çoktan bire'] },
        ],
        verify: ['show firewall ippool', 'show firewall policy', 'diagnose sys session list'],
        learn: ['ippool: nat enable + ippool enable + poolname.', 'one-to-one: bire bir; overload: çoktan bire.', 'Yeni kural sona eklenir; move ile öne alın.', 'Oturum listesinde act=snat satırı kanıttır.'],
        links: { tool: '#/fortigate/nat', cli: '#/cli/fortigate', wizard: '#/troubleshoot/traffic' }, cert: 'NSE 4 · M2'
    },
    // ═══ Kimlik doğrulama: RADIUS/LDAP ile yönetici girişi ═══
    {
        id: 'fgt-09', vendor: 'fortigate', level: 4, title: 'Uzak kimlik doğrulama: RADIUS ile yönetici, LDAP testi', minutes: 25, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-17'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1', '10.64.99.20', '10.64.99.30'],
        start: WAN_LAN().concat(IF('port3', '10.64.99.1 255.255.255.0', ['set role lan'])),
        sim: { radius: { ip: '10.64.99.20', secret: 'Rad-Key-2026', users: { netadmin: 'Lab-Pw-1' }, groups: { netadmin: 'FGT-ADMINS' } },
               ldap: { ip: '10.64.99.30', dn: 'dc=lab,dc=example', bind: { user: 'cn=fgt-bind,dc=lab,dc=example', pw: 'Bind-Pw-1' }, users: { ayse: 'Ayse-Pw-1' }, groups: { ayse: 'CN=VPN-KULLANICI,dc=lab,dc=example' } } },
        story: 'Denetim: "Güvenlik duvarına herkes aynı yerel admin hesabıyla giriyor; kim ne yaptı bilinmiyor." Yöneticiler kurumsal RADIUS sunucusundan (10.64.99.20, anahtar <code>Rad-Key-2026</code>) doğrulanacak; yerel <code>admin</code> yalnız acil durum hesabı kalacak. Ayrıca ileride VPN kullanıcıları için LDAP (10.64.99.30) bağlantısı test edilecek.',
        lesson: L('FortiGate uzak sunucuları <code>config user radius</code> / <code>config user ldap</code> ile tanır. Bir <b>kullanıcı grubu</b> sunucuyu üye olarak içerir; uzak yönetici hesabı (<code>config system admin</code>) <code>remote-auth enable</code> + <code>remote-group</code> ile bu gruba bağlanır, <code>wildcard enable</code> gruptaki herkesin bu profille girmesine izin verir. <code>diagnose test authserver</code> canlıya almadan sunucuyu test eder.',
            'Ortak hesap iz bırakmaz ve ayrılan personelin erişimi kapanmaz. Merkezi kimlik doğrulama hem hesap yönetimini hem denetim izini çözer. Sunucu erişilemezse uzak hesaplar giremez: yerel acil durum hesabı ve trusthost şarttır.',
            'config user radius\n    edit "RAD-NPS"\n        set server "10.64.99.20"\n        set secret Rad-Key-2026\n    next\nend\ndiagnose test authserver radius RAD-NPS pap netadmin &lt;parola&gt;\nconfig user group\n    edit "FGT-ADMINS"\n        set member "RAD-NPS"\n    next\nend\nconfig system admin\n    edit "radius-admins"\n        set remote-auth enable\n        set accprofile "super_admin"\n        set wildcard enable\n        set remote-group "FGT-ADMINS"\n    next\nend',
            ['Paylaşılan anahtarı sunucudakinden farklı yazmak (test "failed" der).', 'Canlıya almadan test etmemek.', 'Yerel admin hesabını silmek ya da parolasını unutmak (sunucu düşünce kimse giremez).']),
        goals: ['RADIUS sunucu nesnesi', 'diagnose test authserver', 'Grup + uzak yönetici hesabı', 'LDAP bind ve test'],
        tasks: [
            { t: 'RADIUS sunucusu <code>RAD-NPS</code>: 10.64.99.20, paylaşılan anahtar <code>Rad-Key-2026</code>.', why: 'Anahtar iki uçta birebir aynı olmalı; farklıysa sunucu isteği reddeder ya da yok sayar ve FortiGate "failed" görür.',
              hints: ['config user radius → edit RAD-NPS', '<code>set server 10.64.99.20</code> · <code>set secret Rad-Key-2026</code>'], steps: ['config user radius', 'edit RAD-NPS', 'set server 10.64.99.20', 'set secret Rad-Key-2026', 'end'],
              check: s => { const r = s.model.t['user radius'].v['RAD-NPS']; return !!r && r.server === '10.64.99.20' && r.secret === 'Rad-Key-2026'; },
              fb: s => { const r = s.model.t['user radius'].v['RAD-NPS']; return r && r.secret && r.secret !== 'Rad-Key-2026' ? 'Anahtar sunucudakiyle aynı değil: test başarısız olacak.' : null; } },
            { t: 'Canlıya almadan test edin: <code>netadmin</code> / <code>Lab-Pw-1</code>, PAP ile.', why: 'Yönetici hesabını bağlamadan önce sunucu, anahtar ve kullanıcıyı test etmek sizi kilitlenmekten korur. Başarılı yanıttaki "Group membership" satırı sunucunun döndürdüğü grubu gösterir.',
              hints: ['diagnose test authserver radius …', '<code>diagnose test authserver radius RAD-NPS pap netadmin Lab-Pw-1</code>'], steps: ['diagnose test authserver radius RAD-NPS pap netadmin Lab-Pw-1'], needs: [0],
              check: s => s.ev.list().some(e => e.authtest === 'radius' && e.result === 'ok') },
            { t: 'Kullanıcı grubu <code>FGT-ADMINS</code> üyesi RAD-NPS olsun; <code>radius-admins</code> uzak yönetici hesabı bu grupla, super_admin profiliyle, gruptaki herkes için (wildcard) girsin.', why: 'Grup, sunucuyu yönetici hesabına bağlayan köprüdür. wildcard ile her yönetici için ayrı yerel hesap açmak gerekmez; denetim loglarında kullanıcının kendi adı görünür.',
              hints: ['config user group + config system admin', '<code>set member RAD-NPS</code> · admin: <code>set remote-auth enable</code> · <code>set accprofile super_admin</code> · <code>set wildcard enable</code> · <code>set remote-group FGT-ADMINS</code>'],
              steps: ['config user group', 'edit FGT-ADMINS', 'set member RAD-NPS', 'end', 'config system admin', 'edit radius-admins', 'set remote-auth enable', 'set accprofile super_admin', 'set wildcard enable', 'set remote-group FGT-ADMINS', 'end'], needs: [0],
              check: s => { const g = s.obj('user group', 'FGT-ADMINS'), a = s.obj('system admin', 'radius-admins'); return !!g && (g.member || []).includes('RAD-NPS') && !!a && a['remote-auth'] === 'enable' && a['remote-group'] === 'FGT-ADMINS' && a.wildcard === 'enable' && a.accprofile === 'super_admin'; } },
            { t: 'RADIUS sunucusu çökerse yönetici nasıl girer?', ask: { choices: [['local', 'Yerel admin (acil durum) hesabıyla; uzak hesaplar sunucu yokken giremez'], ['cache', 'FortiGate son başarılı RADIUS girişini hatırlar, yine girilir'], ['none', 'Hiç girilemez; konsol da kapanır']], correct: 'local' },
              why: 'Uzak hesaplar her girişte sunucuya sorar. Bu yüzden güçlü parolalı, trusthost ile sınırlanmış bir yerel acil durum hesabı her zaman kalmalıdır.', hints: ['Uzak kimlik doğrulama nerede yapılır?', 'Yerel hesap cihazın kendi veritabanında.'] },
            { t: 'LDAP: <code>AD-LDAP</code> 10.64.99.30, kök <code>dc=lab,dc=example</code>, bind tipi regular (<code>cn=fgt-bind,dc=lab,dc=example</code> / <code>Bind-Pw-1</code>); <code>ayse</code> / <code>Ayse-Pw-1</code> ile test edin.', why: 'Çoğu dizin anonim aramaya izin vermez; <b>regular</b> bind, FortiGate\'in önce hizmet hesabıyla bağlanıp kullanıcıyı aramasını sağlar. dn yanlışsa kullanıcı bulunamaz.',
              hints: ['config user ldap → edit AD-LDAP', '<code>set server 10.64.99.30</code> · <code>set dn dc=lab,dc=example</code> · <code>set type regular</code> · <code>set username cn=fgt-bind,dc=lab,dc=example</code> · <code>set password Bind-Pw-1</code> → <code>diagnose test authserver ldap AD-LDAP ayse Ayse-Pw-1</code>'],
              steps: ['config user ldap', 'edit AD-LDAP', 'set server 10.64.99.30', 'set dn dc=lab,dc=example', 'set type regular', 'set username cn=fgt-bind,dc=lab,dc=example', 'set password Bind-Pw-1', 'end', 'diagnose test authserver ldap AD-LDAP ayse Ayse-Pw-1'],
              check: s => s.ev.list().some(e => e.authtest === 'ldap' && e.result === 'ok'),
              fb: s => { const o = s.model.t['user ldap'].v['AD-LDAP']; return o && (o.type || 'simple') !== 'regular' ? 'Bind tipi regular olmalı: dizin anonim aramaya izin vermiyor.' : null; } },
        ],
        verify: ['show user radius', 'show user group', 'show system admin', 'diagnose test authserver radius RAD-NPS pap netadmin Lab-Pw-1'],
        learn: ['Sunucu nesnesi → grup → uzak yönetici hesabı.', 'Canlıya almadan diagnose test authserver.', 'wildcard: gruptaki herkes, kendi adıyla.', 'Yerel acil durum hesabı her zaman kalmalı.'],
        links: { tool: '#/fortigate/admin', cli: '#/cli/fortigate', wizard: '#/troubleshoot/aaa' }, cert: 'NSE 4 · M4'
    },
    // ═══ Güvenlik profilleri ═══
    {
        id: 'fgt-10', vendor: 'fortigate', level: 4, title: 'Güvenlik profilleri: SSL denetimi, web filtre, uygulama, IPS, AV', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-08'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1'],
        start: WAN_LAN().concat(SRV(), ADDR('LAN-NET', '10.64.10.0 255.255.255.0'), POLICY(1, 'LAN-TO-WAN', 'port2', 'port1', 'LAN-NET', 'all', 'HTTP HTTPS DNS', 'accept', ['set nat enable']),
            ['config firewall vip', 'edit WEB-VIP', 'set extip 203.0.113.10', 'set mappedip 10.64.50.10', 'set extintf port1', 'set portforward enable', 'set extport 443', 'set mappedport 443', 'end'],
            POLICY(2, 'WEB-IN', 'port1', 'port3', 'all', 'WEB-VIP', 'HTTPS', 'accept')),
        story: 'Kurallar trafiğe izin veriyor ama <b>içeriğe bakmıyor</b>: kullanıcılar zararlı sitelere girebiliyor, yayınlanan web sunucusu saldırılara açık. Kullanıcı çıkışına ve sunucu yayınına uygun güvenlik profillerini ekleyin.',
        lesson: L('Güvenlik profilleri kurala <code>set utm-status enable</code> ile bağlanır: <b>web filtre</b> (site kategorisi), <b>uygulama kontrolü</b>, <b>IPS</b> (saldırı imzaları), <b>antivirüs</b>. HTTPS trafiğinde ne görülebileceğini <b>SSL/SSH inceleme profili</b> belirler: <code>certificate-inspection</code> yalnız sertifika/SNI\'ye bakar (site kategorisi çalışır, içerik görülmez); <code>deep-inspection</code> trafiği açıp içeriği inceler ama istemcilerin FortiGate\'in CA sertifikasına güvenmesi gerekir.',
            'Trafiğin büyük kısmı HTTPS; inceleme olmadan antivirüs ve IPS\'in çoğu imzası körleşir. Yanlış profil seçimi ya "koruma var sanılan" ya da sertifika uyarılarıyla dolu bir ağ üretir. Yayınlanan sunucular için sunucu odaklı IPS sensörü seçilir.',
            'config firewall policy\n    edit 1\n        set utm-status enable\n        set ssl-ssh-profile "certificate-inspection"\n        set webfilter-profile "default"\n        set application-list "default"\n        set ips-sensor "default"\n        set av-profile "default"\n    next\n    edit 2\n        set utm-status enable\n        set ips-sensor "protect_http_server"\n    next\nend',
            ['Profil ekleyip utm-status\'u açmamak.', 'deep-inspection\'ı istemcilere CA dağıtmadan açmak (her sitede sertifika uyarısı).', 'Yayınlanan sunucuya istemci odaklı IPS sensörü vermek.']),
        goals: ['utm-status ve profilleri bağlamak', 'certificate- ve deep-inspection farkı', 'Sunucu yayınına IPS', 'Profillerin HTTPS\'te neyi görebildiği'],
        tasks: [
            { t: 'LAN-TO-WAN kuralına profilleri bağlayın: SSL inceleme <code>certificate-inspection</code>, web filtre, uygulama listesi, IPS ve antivirüs <code>default</code>.', why: 'Profil alanları ancak <code>utm-status enable</code> sonrası görünür. certificate-inspection istemci tarafında değişiklik gerektirmez; ilk adım olarak güvenlidir.',
              hints: ['config firewall policy → edit 1 → set utm-status enable → set …-profile', '<code>set utm-status enable</code> · <code>set ssl-ssh-profile certificate-inspection</code> · <code>set webfilter-profile default</code> · <code>set application-list default</code> · <code>set ips-sensor default</code> · <code>set av-profile default</code>'],
              steps: ['config firewall policy', 'edit 1', 'set utm-status enable', 'set ssl-ssh-profile certificate-inspection', 'set webfilter-profile default', 'set application-list default', 'set ips-sensor default', 'set av-profile default', 'end'],
              check: s => { const p = s.obj('firewall policy', '1'); return p['utm-status'] === 'enable' && p['ssl-ssh-profile'] === 'certificate-inspection' && p['webfilter-profile'] === 'default' && p['application-list'] === 'default' && p['ips-sensor'] === 'default' && p['av-profile'] === 'default'; },
              fb: s => { const p = s.obj('firewall policy', '1'); return p['ssl-ssh-profile'] === 'deep-inspection' ? 'deep-inspection istemcilerin FortiGate CA\'sına güvenmesini gerektirir; bu adımda certificate-inspection isteniyor.' : null; } },
            { t: 'certificate-inspection ile HTTPS trafiğinde neler çalışır?', ask: { choices: [['cat', 'Site kategorisi (web filtre) ve uygulama tespiti çalışır; dosya/içerik (AV) görülmez'], ['all', 'HTTPS içeriğinin tamamı incelenir'], ['none', 'Hiçbir profil çalışmaz']], correct: 'cat' },
              why: 'Sertifika ve SNI hangi siteye gidildiğini söyler ama şifreli içeriği göstermez. İçerik incelemesi (AV, bazı IPS imzaları) için deep-inspection gerekir.', hints: ['Şifre çözülüyor mu?', 'SNI = alan adı'] },
            { t: 'Yayınlanan web sunucusu (WEB-IN kuralı) için sunucu odaklı IPS sensörü <code>protect_http_server</code>.', why: 'İçeri giren trafikte korunan taraf sunucudur; sunucu açıklarına yönelik imza seti seçilir.',
              hints: ['edit 2 → utm-status enable → ips-sensor', '<code>set utm-status enable</code> · <code>set ips-sensor protect_http_server</code>'], steps: ['config firewall policy', 'edit 2', 'set utm-status enable', 'set ips-sensor protect_http_server', 'end'],
              check: s => { const p = s.obj('firewall policy', '2'); return p['utm-status'] === 'enable' && p['ips-sensor'] === 'protect_http_server'; },
              fb: s => { const p = s.obj('firewall policy', '2'); return p['ips-sensor'] === 'protect_client' ? 'protect_client istemcileri korur; burada korunan taraf sunucu.' : null; } },
            { t: 'Kullanıcıların indirdiği dosyalarda virüs taramasının HTTPS\'te de çalışması için ne gerekir?', ask: { choices: [['deep', 'deep-inspection + istemcilere FortiGate CA sertifikasının dağıtılması'], ['cert', 'certificate-inspection yeterli'], ['av', 'Yalnız av-profile default']], correct: 'deep' },
              why: 'İçerik şifreliyken taranamaz. deep-inspection trafiği FortiGate\'te açar; istemciler FortiGate\'in CA\'sına güvenmezse her sitede sertifika uyarısı görür. Bankacılık/sağlık siteleri genelde muaf tutulur.', hints: ['İçerik görünmeli', 'Sertifika güveni'] },
        ],
        verify: ['show firewall policy 1', 'show firewall policy 2'],
        learn: ['utm-status enable → profiller.', 'certificate-inspection: kategori; deep-inspection: içerik.', 'deep-inspection için istemcide CA güveni.', 'Sunucu yayınına sunucu odaklı IPS.'],
        links: { tool: '#/fortigate/secprofile', cli: '#/cli/fortigate' }, cert: 'NSE 4 · M7–M9'
    },
    // ═══ VLAN ve zone ═══
    {
        id: 'fgt-13', vendor: 'fortigate', level: 2, title: 'VLAN alt arayüzleri ve zone', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-04'],
        up: ['port1', 'port2'], hosts: ['203.0.113.1', '198.51.100.80'],
        start: IF('port1', '203.0.113.2 255.255.255.252', ['set role wan']).concat(ROUTE),
        story: 'port2 bir switch\'in trunk portuna bağlandı. Üzerinden iki VLAN gelecek: <b>VLAN 10</b> kullanıcılar (10.64.10.1/24) ve <b>VLAN 20</b> muhasebe (10.64.20.1/24). İkisi de internete çıkacak ama <b>birbirine erişmeyecek</b>. Kuralları sadeleştirmek için ikisini tek bir <b>zone</b>\'da toplayın.',
        lesson: L('FortiGate\'te VLAN, fiziksel arayüzün alt arayüzüdür: <code>config system interface</code> → yeni ad → <code>set vdom root</code>, <code>set interface port2</code>, <code>set vlanid 10</code>. Yeni arayüzde <b>vdom zorunludur</b>. <b>Zone</b> birden çok arayüzü tek bir kural nesnesinde toplar; zone\'a üye arayüz artık kurallarda tek başına seçilemez. <code>intrazone deny</code> (varsayılan) zone üyeleri arasındaki trafiği kural olmadan engeller.',
            'Tek fiziksel port üzerinde onlarca segment taşımak kablo ve port tasarrufu sağlar. Zone ile "tüm kullanıcı VLAN\'ları → internet" tek kuralla yazılır; intrazone deny de segmentler arası yatay hareketi (ör. kullanıcıdan muhasebeye) varsayılan olarak kapatır.',
            'config system interface\n    edit "VLAN10"\n        set vdom "root"\n        set ip 10.64.10.1 255.255.255.0\n        set allowaccess ping\n        set interface "port2"\n        set vlanid 10\n    next\nend\nconfig system zone\n    edit "LAN"\n        set interface "VLAN10" "VLAN20"\n        set intrazone deny\n    next\nend',
            ['Yeni VLAN arayüzünde vdom\'u unutmak (kayıt reddedilir).', 'Switch trunk\'ındaki VLAN numarasıyla farklı vlanid vermek.', 'intrazone allow yapıp segmentasyonu farkında olmadan kaldırmak.']),
        goals: ['VLAN alt arayüzü oluşturmak', 'Zone ile arayüzleri gruplamak', 'Zone\'dan internete tek kural', 'intrazone davranışını kanıtlamak'],
        tasks: [
            { t: 'VLAN arayüzleri: <code>VLAN10</code> (10.64.10.1/24, vlanid 10) ve <code>VLAN20</code> (10.64.20.1/24, vlanid 20), üst arayüz port2, ping açık.', why: 'Alt arayüz, switch\'ten gelen 802.1Q etiketli çerçeveleri ayırır. vlanid, switch trunk\'ındaki VLAN numarasıyla aynı olmalı.',
              hints: ['config system interface → edit VLAN10 (yeni) → set vdom root …', '<code>set vdom root</code> · <code>set ip 10.64.10.1/24</code> · <code>set allowaccess ping</code> · <code>set interface port2</code> · <code>set vlanid 10</code>'],
              steps: ['config system interface', 'edit VLAN10', 'set vdom root', 'set ip 10.64.10.1 255.255.255.0', 'set allowaccess ping', 'set interface port2', 'set vlanid 10', 'next', 'edit VLAN20', 'set vdom root', 'set ip 10.64.20.1 255.255.255.0', 'set allowaccess ping', 'set interface port2', 'set vlanid 20', 'end'],
              check: s => [['VLAN10', '10', '10.64.10.1'], ['VLAN20', '20', '10.64.20.1']].every(([n, id, ip]) => { const o = s.model.t['system interface'].v[n]; return !!o && o.interface === 'port2' && o.vlanid === id && String(o.ip).startsWith(ip + ' ') && s.ifUp(n); }),
              fb: s => { const o = s.model.t['system interface'].v.VLAN20; return o && o.vlanid && o.vlanid !== '20' ? 'VLAN20\'nin vlanid\'si switch\'teki numarayla (20) aynı olmalı.' : null; } },
            { t: '<code>LAN</code> zone\'u: üyeler VLAN10 ve VLAN20, zone içi trafik engelli.', why: 'Zone, kuralları sadeleştirir; intrazone deny ise üyeler arası trafiği kural yazılmadıkça engeller.',
              hints: ['config system zone → edit LAN', '<code>set interface VLAN10 VLAN20</code> · <code>set intrazone deny</code>'], steps: ['config system zone', 'edit LAN', 'set interface VLAN10 VLAN20', 'set intrazone deny', 'end'], needs: [0],
              check: s => { const z = s.obj('system zone', 'LAN'); return !!z && same(z.interface, ['VLAN10', 'VLAN20']) && z.intrazone === 'deny'; },
              fb: s => { const z = s.obj('system zone', 'LAN'); return z && z.intrazone === 'allow' ? 'intrazone allow: kullanıcılar muhasebeye kural olmadan erişir. İstenen deny.' : null; } },
            { t: 'Tek kural: <code>LAN-TO-WAN</code>, LAN zone → port1, kaynak/hedef all, servis ALL, accept, NAT.', why: 'Zone\'u kaynak arayüz olarak seçmek iki VLAN\'ı birden kapsar. Zone üyesi arayüzler (VLAN10/20) artık kurallarda tek başına seçilemez.',
              hints: ['config firewall policy → edit 0', '<code>set srcintf LAN</code> · <code>set dstintf port1</code> · … · <code>set nat enable</code>'],
              steps: ['config firewall policy', 'edit 1', 'set name LAN-TO-WAN', 'set srcintf LAN', 'set dstintf port1', 'set srcaddr all', 'set dstaddr all', 'set action accept', 'set schedule always', 'set service ALL', 'set nat enable', 'end'], needs: [0, 1],
              check: s => ['10.64.10.50', '10.64.20.50'].every((ip, i) => s.decide({ src: ip, dst: '198.51.100.80', dport: 443, in: i ? 'VLAN20' : 'VLAN10', proto: 'tcp' }).stage === 'allowed') },
            { t: 'Bir kullanıcı (VLAN10) muhasebe bilgisayarına (VLAN20) erişebilir mi? Kural aramasıyla kanıtlayın.', ask: { choices: [['deny', 'Hayır: intrazone deny, kural yok → policy 0 (örtük deny)'], ['allow', 'Evet: aynı zone\'dalar'], ['nat', 'Evet ama NAT\'lanarak']], correct: 'deny' },
              why: 'Zone üyeleri arası trafik intrazone deny iken bir kural bulamaz ve örtük deny\'a (policy 0) düşer. İzin gerekirse kaynak ve hedefi aynı zone olan açık bir kural yazılır.',
              hints: ['diagnose firewall iprope lookup 10.64.10.50 50000 10.64.20.50 445 tcp VLAN10', 'matches policy id: ?'],
              steps: ['diagnose firewall iprope lookup 10.64.10.50 50000 10.64.20.50 445 tcp VLAN10', { answer: 3, v: 'deny' }], needs: [0, 1] },
        ],
        verify: ['show system interface VLAN10', 'show system zone', 'show firewall policy'],
        learn: ['VLAN = alt arayüz: vdom + interface + vlanid.', 'Zone arayüzleri kural için gruplar.', 'Zone üyesi arayüz kuralda tek başına seçilmez.', 'intrazone deny: üyeler arası kural yoksa engel.'],
        links: { tool: '#/fortigate/interface', cli: '#/cli/fortigate' }, cert: 'NSE 4 · M1–M2'
    },
    // ═══ Log ve syslog ═══
    {
        id: 'fgt-14', vendor: 'fortigate', level: 3, title: 'Log: trafik logu ve syslog/SIEM\'e gönderim', minutes: 15, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-04'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1', '10.64.99.50'],
        start: WAN_LAN().concat(IF('port3', '10.64.99.1 255.255.255.0', ['set role lan']), ADDR('LAN-NET', '10.64.10.0 255.255.255.0'), POLICY(1, 'LAN-TO-WAN', 'port2', 'port1', 'LAN-NET', 'all', 'HTTP HTTPS DNS', 'accept', ['set nat enable'])),
        story: 'Güvenlik ekibi tüm FortiGate loglarını SIEM\'e (10.64.99.50, UDP 514) istiyor ve SIEM <b>CEF</b> biçimini okuyor. Ayrıca bir olay incelemesinde "kim hangi siteye gitti" sorusuna cevap verilemedi: kullanıcı kuralı yalnız güvenlik olaylarını logluyor.',
        lesson: L('Kural bazında <code>logtraffic</code>: <b>utm</b> (varsayılan) yalnız güvenlik profili olaylarını, <b>all</b> tüm oturumları loglar, <b>disable</b> hiç loglamaz. Loglar diske/belleğe ve <code>config log syslogd setting</code> ile syslog/SIEM\'e gönderilebilir; <code>format cef</code> birçok SIEM\'in doğrudan okuduğu biçimdir. <code>diagnose log test</code> örnek loglar üretir.',
            'Olay incelemesinde log yoksa kanıt da yoktur. Ancak <b>all</b> log hacmini artırır: disk ve SIEM lisansı planlanmalı. Syslog UDP\'dir, iletim garantisi yoktur; kritik ortamlarda güvenilir (TCP) mod tercih edilir.',
            'config log syslogd setting\n    set status enable\n    set server "10.64.99.50"\n    set format cef\nend\nconfig firewall policy\n    edit 1\n        set logtraffic all\n    next\nend\ndiagnose log test',
            ['Syslog sunucusuna yol olmadan göndermek (loglar cihazdan çıkamaz).', 'Kuralda logtraffic disable bırakmak.', 'SIEM\'in beklediği biçimi (CEF) seçmemek.']),
        goals: ['Syslog hedefi ve biçimi', 'logtraffic all / utm farkı', 'diagnose log test ile doğrulama'],
        tasks: [
            { t: 'Syslog: sunucu 10.64.99.50, UDP 514, biçim CEF.', why: 'Varsayılan port 514 ve UDP\'dir; SIEM CEF bekliyorsa biçim açıkça seçilmelidir, aksi hâlde alanlar ayrıştırılamaz.',
              hints: ['config log syslogd setting', '<code>set status enable</code> · <code>set server 10.64.99.50</code> · <code>set format cef</code>'], steps: ['config log syslogd setting', 'set status enable', 'set server 10.64.99.50', 'set format cef', 'end'],
              check: s => { const l = s.obj('log syslogd setting'); return l.status === 'enable' && l.server === '10.64.99.50' && l.format === 'cef'; } },
            { t: 'LAN-TO-WAN kuralında tüm oturumları loglayın.', why: '"Kim nereye gitti" sorusunun cevabı trafik logudur; utm modunda yalnız güvenlik olayları kaydedilir.',
              hints: ['config firewall policy → edit 1', '<code>set logtraffic all</code>'], steps: ['config firewall policy', 'edit 1', 'set logtraffic all', 'end'],
              check: s => s.obj('firewall policy', '1').logtraffic === 'all',
              fb: s => s.obj('firewall policy', '1').logtraffic === 'disable' ? 'logtraffic disable: bu kural hiç log üretmez.' : null },
            { t: 'Örnek loglar üretip gönderimi doğrulayın.', why: 'Test logları SIEM tarafında ayrıştırmayı canlı trafik beklemeden doğrulamayı sağlar.',
              hints: ['diagnose log …', '<code>diagnose log test</code>'], steps: ['diagnose log test'], needs: [0],
              check: s => s.ev.list().some(e => e.logtest === '10.64.99.50') },
            { t: 'Varsayılan <code>logtraffic utm</code> ne loglar?', ask: { choices: [['utm', 'Yalnız güvenlik profili olayı üreten oturumları (virüs, engellenen site…)'], ['all', 'Tüm oturumları'], ['none', 'Hiçbir şeyi']], correct: 'utm' },
              why: 'utm, log hacmini düşük tutar ama normal trafiğin izini bırakmaz; denetim ve olay incelemesi gereken kurallarda all kullanılır.', hints: ['UTM = güvenlik profilleri', 'Normal oturum loglanır mı?'] },
        ],
        verify: ['show log syslogd setting', 'show firewall policy 1', 'diagnose log test'],
        learn: ['logtraffic: utm (varsayılan), all, disable.', 'syslogd setting: sunucu, port, biçim.', 'SIEM için CEF.', 'diagnose log test ile doğrulama.'],
        links: { tool: '#/fortigate/logging', cli: '#/cli/fortigate' }, cert: 'NSE 4 · M13'
    },
    // ═══ Yönetim sıkılaştırma ═══
    {
        id: 'fgt-17', vendor: 'fortigate', level: 1, title: 'Yönetim erişimini sıkılaştırma', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-01'],
        up: ['port1', 'port2'], hosts: ['203.0.113.1'],
        start: IF('port1', '203.0.113.2 255.255.255.252', ['set role wan', 'set allowaccess ping https ssh http telnet']).concat(IF('port2', '10.64.10.1 255.255.255.0', ['set role lan', 'set allowaccess ping']), ROUTE,
            ['config system global', 'set strong-crypto disable', 'set admin-https-ssl-versions tlsv1-1 tlsv1-2 tlsv1-3', 'end']),
        story: 'Dış tarama raporu: "FortiGate yönetim arayüzü internetten HTTP, HTTPS, SSH ve Telnet ile erişilebilir; eski TLS 1.1 ve zayıf şifreler kabul ediliyor; hatalı girişte kilit yok." Yönetim yalnız iç yönetim ağından (10.240.0.0/16, LAN üzerinden) yapılacak.',
        lesson: L('Yönetim erişiminin katmanları: (1) <b>arayüz</b>: <code>allowaccess</code> hangi protokolle o arayüzden yönetilebileceğini belirler; (2) <b>hesap</b>: <code>trusthost</code> yöneticinin hangi ağlardan girebileceğini sınırlar (boşsa her yerden); (3) <b>sistem</b>: <code>strong-crypto</code>, izinli TLS sürümleri, hatalı giriş kilidi (<code>admin-lockout-threshold/duration</code>) ve giriş afişi.',
            'İnternete açık FortiGate yönetim arayüzleri, kritik açıklar yayımlanır yayımlanmaz toplu taranır ve saldırıya uğrar. WAN\'da yönetim kapatmak ve trusthost vermek, açığın kendisi kapanmadan bile saldırı yüzeyini ortadan kaldırır.',
            'config system interface\n    edit "port1"\n        set allowaccess ping\n    next\n    edit "port2"\n        set allowaccess ping https ssh\n    next\nend\nconfig system admin\n    edit "admin"\n        set trusthost1 10.240.0.0 255.255.0.0\n    next\nend\nconfig system global\n    set strong-crypto enable\n    set admin-https-ssl-versions tlsv1-2 tlsv1-3\n    set admin-lockout-threshold 3\n    set admin-lockout-duration 300\n    set admintimeout 10\n    set pre-login-banner enable\nend',
            ['WAN\'da yalnız HTTP\'yi kapatıp HTTPS/SSH\'ı açık bırakmak.', 'trusthost vermeden "zaten şifre var" demek.', 'Kendi yönetim ağınızı trusthost\'a eklemeden kaydedip kilitlenmek.']),
        goals: ['WAN\'da yönetim erişimini kapatmak', 'LAN\'da yalnız güvenli protokoller', 'trusthost', 'strong-crypto, TLS, kilit ve afiş'],
        tasks: [
            { t: 'port1 (WAN) yalnız ping kabul etsin; port2 (LAN) ping, HTTPS ve SSH.', why: 'allowaccess bir liste olarak yazılır: set komutu listeyi değiştirir. HTTP ve Telnet şifresizdir; WAN\'da hiçbir yönetim protokolü olmamalı.',
              hints: ['config system interface → edit port1 / port2 → set allowaccess', '<code>edit port1</code> → <code>set allowaccess ping</code> · <code>edit port2</code> → <code>set allowaccess ping https ssh</code>'],
              steps: ['config system interface', 'edit port1', 'set allowaccess ping', 'next', 'edit port2', 'set allowaccess ping https ssh', 'end'],
              check: s => same(s.obj('system interface', 'port1').allowaccess, ['ping']) && same(s.obj('system interface', 'port2').allowaccess, ['ping', 'https', 'ssh']),
              fb: s => { const w = s.obj('system interface', 'port1').allowaccess || [], l = s.obj('system interface', 'port2').allowaccess || []; if (w.some(x => ['https', 'ssh', 'http', 'telnet'].includes(x))) return 'WAN\'da hâlâ yönetim protokolü açık: ' + w.filter(x => x !== 'ping').join(', ') + '.'; if (l.some(x => x === 'http' || x === 'telnet')) return 'LAN\'da şifresiz protokol (HTTP/Telnet) var.'; return null; } },
            { t: '<code>admin</code> hesabı yalnız 10.240.0.0/16\'dan girebilsin.', why: 'trusthost, parola ele geçse bile başka ağdan girişi engeller. Boş bırakılırsa (0.0.0.0/0) her yerden girilir.',
              hints: ['config system admin → edit admin', '<code>set trusthost1 10.240.0.0 255.255.0.0</code>'], steps: ['config system admin', 'edit admin', 'set trusthost1 10.240.0.0 255.255.0.0', 'end'],
              check: s => s.obj('system admin', 'admin').trusthost1 === '10.240.0.0 255.255.0.0' },
            { t: 'Sistem: strong-crypto açık, yönetim HTTPS yalnız TLS 1.2 ve 1.3; 3 hatalı girişte 300 sn kilit; oturum zaman aşımı 10 dk; giriş afişi açık.', why: 'strong-crypto zayıf şifre ve özet algoritmalarını kapatır; TLS 1.1 artık güvenli sayılmaz; kilit kaba kuvvet denemelerini yavaşlatır; afiş yetkisiz erişim uyarısıdır.',
              hints: ['config system global', '<code>set strong-crypto enable</code> · <code>set admin-https-ssl-versions tlsv1-2 tlsv1-3</code> · <code>set admin-lockout-threshold 3</code> · <code>set admin-lockout-duration 300</code> · <code>set admintimeout 10</code> · <code>set pre-login-banner enable</code>'],
              steps: ['config system global', 'set strong-crypto enable', 'set admin-https-ssl-versions tlsv1-2 tlsv1-3', 'set admin-lockout-threshold 3', 'set admin-lockout-duration 300', 'set admintimeout 10', 'set pre-login-banner enable', 'end'],
              check: s => { const g = s.obj('system global'); return g['strong-crypto'] === 'enable' && same(g['admin-https-ssl-versions'], ['tlsv1-2', 'tlsv1-3']) && g['admin-lockout-threshold'] === '3' && g['admin-lockout-duration'] === '300' && g.admintimeout === '10' && g['pre-login-banner'] === 'enable'; },
              fb: s => { const g = s.obj('system global'); return (g['admin-https-ssl-versions'] || []).includes('tlsv1-1') ? 'TLS 1.1 hâlâ izinli.' : null; } },
            { t: 'trusthost boş (0.0.0.0/0) bırakılmış bir yönetici hesabı nereden girebilir?', ask: { choices: [['any', 'Yönetime açık herhangi bir arayüze ulaşabilen her adresten'], ['lan', 'Yalnız LAN\'dan'], ['none', 'Hiçbir yerden']], correct: 'any' },
              why: 'Boş trusthost kısıt yok demektir; tek engel arayüzün allowaccess\'idir. İki katman birlikte kullanılmalı: arayüz + hesap.', hints: ['0.0.0.0/0 = her yer', 'Hangi katman kalıyor?'] },
        ],
        verify: ['show system interface port1', 'show system admin admin', 'show system global'],
        learn: ['WAN\'da yönetim protokolü yok.', 'trusthost: hesabın girebileceği ağlar.', 'strong-crypto + TLS 1.2/1.3.', 'Hatalı giriş kilidi ve zaman aşımı.'],
        links: { tool: '#/fortigate/admin', cli: '#/cli/fortigate' }, cert: 'NSE 4 · M1'
    },
    // ═══ Yedekleme ve geri dönüş ═══
    {
        id: 'fgt-18', vendor: 'fortigate', level: 3, title: 'Yedekleme ve geri dönüş: TFTP, revizyon, restore', minutes: 20, kind: 'firewall', hostname: 'FGT-A', pre: ['fgt-04'],
        up: ['port1', 'port2', 'port3'], hosts: ['203.0.113.1', '10.64.99.10'],
        start: WAN_LAN().concat(IF('port3', '10.64.99.1 255.255.255.0', ['set role lan']), ADDR('LAN-NET', '10.64.10.0 255.255.255.0'), POLICY(1, 'LAN-TO-WAN', 'port2', 'port1', 'LAN-NET', 'all', 'HTTP HTTPS DNS', 'accept', ['set nat enable'])),
        story: 'Değişiklik kuralı: "Her bakımdan önce cihaz dışına yedek ve cihaz içinde geri dönüş noktası." Yedek sunucusu (TFTP) 10.64.99.10. Yedekleri alın, sonra bir hatayı canlandırıp yedekten geri dönün.',
        lesson: L('<code>execute backup config tftp &lt;dosya&gt; &lt;sunucu&gt;</code> yapılandırmayı cihaz dışına alır. <code>execute backup config flash "&lt;açıklama&gt;"</code> cihazda bir <b>revizyon</b> saklar; <code>execute revision list config</code> revizyonları listeler. <code>execute restore config …</code> yapılandırmanın tamamını değiştirir ve cihazı <b>yeniden başlatır</b>. Ayrıca <code>set cfg-save revert</code> ile kaydedilmeyen değişikliklerin süre dolunca geri alınması sağlanabilir (uzaktan bağlantıyı kesecek bir değişiklikte can simidi).',
            'Cihaz arızasında cihazdaki yedek de gider; cihaz dışı kopya şarttır. Restore yeniden başlatma gerektirdiği için bakım penceresinde yapılır. Yedek dosyası parolaları (şifreli de olsa) içerir: güvenli saklanmalıdır.',
            'execute backup config tftp fgt-a.conf 10.64.99.10\nexecute backup config flash "bakim-oncesi"\nexecute revision list config\n! hata sonrası:\nexecute restore config flash 1',
            ['Yalnız cihaz içinde yedek tutmak.', 'Restore\'un yeniden başlatacağını unutup mesai içinde çalıştırmak.', 'Yedek dosyasını herkesin erişebildiği bir sunucuda bırakmak.']),
        goals: ['TFTP\'ye yedek', 'Cihaz içi revizyon', 'Revizyon listesini okumak', 'Hatalı değişiklikten geri dönmek'],
        tasks: [
            { t: 'Yapılandırmayı TFTP sunucusuna <code>fgt-a.conf</code> olarak yedekleyin.', why: 'Cihaz dışı kopya, donanım arızasında tek kurtuluştur. Sunucuya yol ve erişim olmalı (port3).',
              hints: ['execute backup config tftp …', '<code>execute backup config tftp fgt-a.conf 10.64.99.10</code>'], steps: ['execute backup config tftp fgt-a.conf 10.64.99.10'],
              check: s => s.tftp().includes('fgt-a.conf') },
            { t: 'Cihazda "bakim-oncesi" açıklamalı bir revizyon saklayın ve listeyi görün.', why: 'Revizyon, hızlı geri dönüş noktasıdır; açıklama hangi değişiklikten önce alındığını söyler.',
              hints: ['execute backup config flash … → execute revision list config', '<code>execute backup config flash bakim-oncesi</code> → <code>execute revision list config</code>'], steps: ['execute backup config flash bakim-oncesi', 'execute revision list config'],
              check: s => s.revs().includes('bakim-oncesi') && s.ev.ran(/^execute revision list config$/) },
            { t: 'Hatayı canlandırın: LAN-TO-WAN kuralını silin. Sonra revizyon 1\'den geri yükleyin (onay: y).', why: 'Restore yapılandırmanın tamamını yedektekiyle değiştirir; gerçek cihazda yeniden başlar. Silinen kural geri gelir.',
              hints: ['config firewall policy → delete 1 → end → execute restore config flash 1', '<code>execute restore config flash 1</code> → <code>y</code>'],
              steps: ['config firewall policy', 'delete 1', 'end', 'execute restore config flash 1', 'y'], needs: [1],
              check: s => s.ev.list().some(e => e.restored) && !!s.obj('firewall policy', '1') && s.ev.list().some(e => e.canon === 'delete 1') },
            { t: 'Restore neden bakım penceresinde yapılır?', ask: { choices: [['reboot', 'Cihaz yeniden başlar; trafik kısa süre kesilir'], ['slow', 'Sadece yavaş olduğu için'], ['none', 'Fark etmez, kesinti olmaz']], correct: 'reboot' },
              why: 'Yapılandırmanın tamamı yeniden yüklenir; oturumlar düşer ve cihaz açılana kadar trafik geçmez. HA kümesinde bile planlı yapılmalıdır.', hints: ['Onay mesajı ne diyor?', '"could possibly reboot the system"'] },
        ],
        verify: ['execute revision list config', 'show firewall policy'],
        learn: ['Cihaz dışı yedek: execute backup config tftp.', 'Cihaz içi revizyon: backup config flash + revision list.', 'Restore = tam değiştirme + yeniden başlatma.', 'cfg-save revert: kopma riskli değişikliklerde can simidi.'],
        links: { cli: '#/cli/fortigate' }, cert: 'NSE 4 · M1'
    },
    ];
    // Çoktan seçmeli (ask) görevler ve adımlardan türetilen örnek çözüm (fortigate.js ile aynı kural)
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
    root.CG_LABS = (root.CG_LABS || []).filter(l => !LABS_BY_ID[l.id]).concat(LABS);
})();
