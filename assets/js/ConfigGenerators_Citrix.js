'use strict';

const CitrixADC = {};

// ── Citrix ADC: LB vServer ────────────────────────────────────────────────────
CitrixADC.lbvserver = {
    label: 'LB vServer',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-balance-scale',
                title: 'LB vServer (Citrix ADC)',
                desc: 'Load balancing virtual server — <code>add lb vserver VS_APP SSL 10.1.1.100 443</code> ile oluşturulur. ServiceGroup ile sunucular bağlanır.'
            },
            configTypes: [
                { id: 'ssl', label: 'SSL (HTTPS Offload)', icon: 'fas fa-lock', desc: 'TLS sonlandırma + HTTP backend', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'http', label: 'HTTP', icon: 'fas fa-globe', desc: 'Düz HTTP load balancing' },
                { id: 'tcp', label: 'TCP', icon: 'fas fa-ethernet', desc: 'L4 TCP proxy modu' }
            ],
            sections: [
                {
                    title: 'Virtual Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'vs_name', why: "LB vServer adı ServiceGroup bind, policy bind ve SSL certKey bind komutlarında referans edilir; isim değişirse tüm bind'lar kopar. Ayrıca <code>save ns config</code> yapılmazsa reboot sonrası tüm tanım kaybolur.", label: 'VS Adı', type: 'text', required: true, placeholder: 'VS_APP_HTTPS', hint: 'Büyük harf + alt çizgi önerilen konvansiyon', tooltip: 'add lb vserver <VS_ADI>' },
                        { name: 'proto', why: "Protokol SSL seçildiğinde ADC TLS'i sonlandırır ve rewrite, responder, AppFirewall gibi katman 7 politikaları devreye girebilir. SSL_BRIDGE seçilseydi trafik şifreli geçer ve hiçbir içerik politikası çalışmazdı.", type: 'hidden', value: 'SSL' },
                        { name: 'vip', why: "VIP bir SNIP ile aynı subnet'te değilse ADC bu adres için ARP cevabı vermez ve istemciler hiç bağlanamaz. Aynı VIP farklı portlarla birden fazla vServer'da kullanılabilir.", label: 'VIP (Virtual IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.100', hint: 'Clients bu IP\'ye bağlanır' },
                        { name: 'port', why: "Port ile protokol uyumsuzsa vServer UP görünür ama handshake hiç tamamlanmaz; 443 için SSL, 80 için HTTP seçilmelidir. Yanlış port girildiğinde istemci tarafında sessiz zaman aşımı yaşanır.", label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'SSL için 443, HTTP için 80' },
                        { name: 'lb_method', why: "LEASTCONNECTION uzun süreli bağlantılarda daha dengeli dağıtım verir; ROUNDROBIN tüm sunucuları eşit kapasitede varsayar. Yanlış yöntem bir sunucunun aşırı yüklenip yanıt sürelerinin artmasına neden olur.", label: 'LB Yöntemi', type: 'select', options: [
                            { value: 'LEASTCONNECTION', label: 'Least Connection', selected: true },
                            { value: 'ROUNDROBIN', label: 'Round Robin' }
                        ]},
                        { name: 'persist', why: "Persistence yoksa her istek farklı sunucuya düşer ve uygulama oturumu kaybolur; kullanıcı sürekli login ekranına döner. COOKIEINSERT için ADC'nin HTTP katmanını görmesi gerekir, SSL sonlandırılmıyorsa SOURCEIP kullanılmalıdır; SOURCEIP ise NAT arkasındaki tüm kullanıcıları tek sunucuya yığar.", label: 'Persistence', type: 'select', options: [
                            { value: 'COOKIEINSERT', label: 'Cookie Insert', selected: true },
                            { value: 'SOURCEIP', label: 'Source IP' },
                            { value: 'NONE', label: 'None' }
                        ]}
                    ]
                },
                {
                    title: 'ServiceGroup & Sunucular',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'sg_name', why: "ServiceGroup vServer'a bind edilmezse vServer <b>DOWN</b> kalır ve istemciye bağlantı reddi döner. Grup adı monitor bind komutlarında da kullanıldığı için sonradan değiştirilmesi zincirleme kırılma yaratır.", label: 'ServiceGroup Adı', type: 'text', required: true, placeholder: 'SG_APP_HTTP', hint: 'Backend sunucuları içeren grup' },
                        { name: 's1', why: "Sunucu IP'sine ADC'nin SNIP üzerinden erişimi olmalı; route veya firewall eksikse üye sürekli DOWN görünür. <b>USIP</b> modunda kaynak IP istemcinin kendi IP'si olur ve sunucunun default gateway'i ADC olmak zorundadır, aksi halde dönüş trafiği asimetrik olur.", label: 'Sunucu 1 IP', type: 'text', required: true, placeholder: '10.1.2.10' },
                        { name: 's1p', why: "Port uygulamanın gerçekten dinlediği port olmalı; 8080 dinleyen sunucuya 80 yazılırsa monitor hiç UP olmaz ve üye trafik almaz. Aynı IP farklı portlarla birden fazla serviste kullanılabilir.", label: 'Sunucu 1 Port', type: 'text', required: true, placeholder: '8080' },
                        { name: 's2', why: "İkinci sunucu olmadan yük dengeleme tek noktadan arızaya açık kalır; bakım sırasında servis tamamen kesilir. Üyeyi geçici kapatmak için silmek yerine <code>disable</code> kullanılmalıdır, böylece mevcut oturumlar düzgün tamamlanır.", label: 'Sunucu 2 IP', type: 'text', optional: true, placeholder: '10.1.2.11' },
                        { name: 's2p', why: "Üyelerin portları farklı olabilir, ancak monitor aynı grupta tüm üyelere aynı kontrolü uygular. Bu yüzden farklı uygulamalar tek bir ServiceGroup içinde toplanmamalıdır; biri sağlıksızsa diğeri de yanlış değerlendirilir.", label: 'Sunucu 2 Port', type: 'text', optional: true, placeholder: '8080' }
                    ]
                },
                {
                    title: 'SSL Sertifikası',
                    icon: 'fas fa-certificate',
                    showFor: ['ssl'],
                    info: 'SSL protokolü seçildiğinde sertifika bağlaması gerekir. TLS 1.2/1.3 zorunlu, SSL3/TLS1.0/1.1 devre dışı bırakılır.',
                    fields: [
                        { name: 'cert_key', why: "CertKey <code>add ssl certKey</code> ile önceden tanımlanmış olmalı; yoksa bind komutu başarısız olur ve SSL vServer sertifikasız kaldığı için DOWN durumunda kalır. Ara CA zinciri ayrıca <code>link</code> edilmezse mobil istemciler güven hatası alır.", label: 'SSL CertKey Adı', type: 'text', required: true, placeholder: 'MY_CERTKEY', hint: 'add ssl certKey komutuyla önceden tanımlanmış olmalı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsLbGen(data);
        });
    }
};
function cgNsLbGen(data) {
    const vsName = cgEsc(data.vs_name || '');
    // Protokol configTypes kartindan gelir; gizli 'proto' alani secimi takip etmez.
    const proto = { ssl: 'SSL', http: 'HTTP', tcp: 'TCP' }[data._cgtype] || 'SSL';
    const vip = cgEsc(data.vip || '');
    const port = cgEsc(data.port || '');
    const lbMethod = cgEsc(data.lb_method || 'LEASTCONNECTION');
    const persist = cgEsc(data.persist || 'COOKIEINSERT');
    const sgName = cgEsc(data.sg_name || '');
    const s1 = cgEsc(data.s1 || ''), s1p = cgEsc(data.s1p || '');
    const s2 = cgEsc(data.s2 || ''), s2p = cgEsc(data.s2p || '');
    const certKey = cgEsc(data.cert_key || '');
    let c = '# ========================================\n# Citrix ADC (NetScaler) — LB vServer\n# ========================================\n\n';
    c += 'add lb vserver ' + vsName + ' ' + proto + ' ' + vip + ' ' + port;
    c += ' -lbMethod ' + lbMethod;
    // Cookie persistence HTTP katmani ister; TCP vServer'da kaynak IP'ye dus.
    const persistEff = (proto === 'TCP' && persist === 'COOKIEINSERT') ? 'SOURCEIP' : persist;
    if (persistEff !== 'NONE') c += ' -persistenceType ' + persistEff;
    c += '\n\n';
    c += proto === 'TCP' ? 'add serviceGroup ' + sgName + ' TCP\n\n'
                         : 'add serviceGroup ' + sgName + ' HTTP -cip ENABLED X-Forwarded-For\n\n';
    c += 'add server SRV_' + s1.replace(/\./g, '_') + ' ' + s1 + '\n';
    c += 'bind serviceGroup ' + sgName + ' SRV_' + s1.replace(/\./g, '_') + ' ' + s1p + '\n';
    if (s2) {
        c += 'add server SRV_' + s2.replace(/\./g, '_') + ' ' + s2 + '\n';
        c += 'bind serviceGroup ' + sgName + ' SRV_' + s2.replace(/\./g, '_') + ' ' + (s2p || s1p) + '\n';
    }
    c += '\nbind lb vserver ' + vsName + ' ' + sgName + '\n\n';
    if (proto === 'SSL') {
        // Sertlestirme sertifikadan bagimsizdir: certKey bos kalsa bile eski protokoller kapatilir.
        if (certKey) c += '# SSL sertifika bağla\nbind ssl vserver ' + vsName + ' -certkeyName ' + certKey + '\n';
        c += 'set ssl vserver ' + vsName + ' -ssl3 DISABLED -tls1 DISABLED -tls11 DISABLED -tls12 ENABLED -tls13 ENABLED\n\n';
    }
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show lb vserver ' + vsName + '\n# show serviceGroup ' + sgName + '\n';
    return c;
}

// ── Citrix ADC: Health Monitor ────────────────────────────────────────────────
CitrixADC.monitor = {
    label: 'Health Monitor',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Health Monitor (Citrix ADC)',
                desc: 'Backend sunucu sağlık kontrolü — <code>add lb monitor MON_HTTP HTTP-ECV</code>. HTTP-ECV ile GET isteği gönderilir, yanıt string doğrulanır.'
            },
            sections: [
                {
                    title: 'Monitor Tanımı',
                    icon: 'fas fa-stethoscope',
                    fields: [
                        { name: 'mon_name', why: "Monitor adı ServiceGroup bind komutunda kullanılır; bind edilmeyen monitor hiçbir kontrol yapmaz ve tüm üyeler her zaman UP sanılır.", label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Büyük harf + alt çizgi konvansiyonu önerilir' },
                        { name: 'mon_type', why: "TCP monitor yalnızca portun açık olduğunu doğrular; uygulama 500 dönse bile sunucu sağlıklı görünür. HTTP/HTTPS monitor içerik doğrular; HTTPS servise HTTP monitor bağlanırsa monitor kalıcı olarak DOWN kalır ve tüm grup düşer.", label: 'Tip', type: 'select', options: [
                            { value: 'HTTP-ECV', label: 'HTTP-ECV', selected: true },
                            { value: 'HTTPS-ECV', label: 'HTTPS-ECV' },
                            { value: 'TCP', label: 'TCP' }
                        ]},
                        { name: 'send', why: "Send string HTTP/1.1 ile yazıldıysa <code>Host</code> başlığı zorunludur, yoksa sunucu 400 döner ve tüm üyeler DOWN olur. Satır sonları CRLF ile kapatılmazsa istek hiç tamamlanmaz.", label: 'Send String', type: 'text', optional: true, placeholder: 'GET /health HTTP/1.0\\r\\n\\r\\n', hint: 'Sunucuya gönderilecek HTTP isteği' },
                        { name: 'recv', why: "Receive string yanıtta birebir aranır; uygulama yanıtı değiştiğinde (200 yerine 302) tüm grup aniden DOWN düşer. Sağlık sayfasına özel benzersiz bir metin seçmek yanlış pozitifleri azaltır.", label: 'Receive String', type: 'text', optional: true, placeholder: '200 OK', hint: 'Beklenen yanıt metni' },
                        { name: 'interval', why: "Interval uzun olursa arızalı sunucu uzun süre trafik almaya devam eder; çok kısa olursa backend monitor istekleriyle gereksiz yüklenir. Response timeout daima interval'dan küçük olmalıdır.", label: 'Interval (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Kontrol aralığı saniye cinsinden' },
                        { name: 'resp_timeout', why: "Response timeout interval'a eşit veya ondan büyükse monitor'lar üst üste biner ve üyeler flapping yapar. Yavaş yanıt veren uygulamalarda çok küçük timeout sağlıklı sunucuları DOWN gösterir.", label: 'Response Timeout (sn)', type: 'text', optional: true, placeholder: '2', hint: 'Yanıt bekleme süresi' }
                    ]
                },
                {
                    title: 'ServiceGroup Bağlama',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'sg_name', why: "Monitor bir ServiceGroup'a bind edilmediği sürece yalnızca tanım olarak durur; koruduğu sanılan ama hiç çalışmayan monitor en sık yapılan hatadır.", label: 'ServiceGroup Adı', type: 'text', required: true, placeholder: 'SG_APP_HTTP', hint: 'Monitörü bu ServiceGroup\'a bağla' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsMonGen(data);
        });
    }
};
function cgNsMonGen(data) {
    const monName = cgEsc(data.mon_name || '');
    const monType = cgEsc(data.mon_type || 'HTTP-ECV');
    const send = cgEsc(data.send || '');
    const recv = cgEsc(data.recv || '');
    const interval = cgEsc(data.interval || '5');
    const respTimeout = cgEsc(data.resp_timeout || '2');
    const sgName = cgEsc(data.sg_name || '');
    let c = '# ========================================\n# Citrix ADC — Health Monitor\n# ========================================\n\n';
    c += 'add lb monitor ' + monName + ' ' + monType;
    if (send) c += ' -send "' + send + '"';
    if (recv) c += ' -recv "' + recv + '"';
    c += ' -interval ' + interval + ' -resptimeout ' + respTimeout + '\n\n';
    if (sgName) c += 'bind serviceGroup ' + sgName + ' -monitorName ' + monName + '\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show lb monitor ' + monName + '\n';
    return c;
}

// ── Citrix ADC: HA Pair ───────────────────────────────────────────────────────
CitrixADC.ha = {
    label: 'HA Pair',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'HA Pair (Citrix ADC)',
                desc: 'Yüksek erişilebilirlik çifti — <code>add ha node 1 &lt;peer-ip&gt; -inc ENABLED</code>. Her iki node\'da birbirinin IP\'siyle çalıştırılır.'
            },
            sections: [
                {
                    title: 'HA Node Konfigürasyonu',
                    icon: 'fas fa-crown',
                    fields: [
                        { name: 'ha_role', why: "Primary trafiği taşır, secondary yalnızca senkronizasyon alır; her iki node da primary kalırsa (split-brain) aynı VIP iki yerden duyurulur ve trafik kopar. Senkronizasyon otomatiktir ama <b>RPC node parolası</b> iki tarafta aynı değilse hiç çalışmaz.", label: 'Rol', type: 'select', options: [
                            { value: 'primary', label: 'Primary (aktif)', selected: true },
                            { value: 'secondary', label: 'Secondary (pasif)' }
                        ], hint: 'Bu node\'un HA rolü' },
                        { name: 'node_id', why: "Node ID her cihazda karşı tarafı temsil edecek şekilde benzersiz olmalı; aynı ID iki kez kullanılırsa HA çifti kurulamaz. ID 0 daima cihazın kendisini ifade eder.", label: 'Node ID', type: 'text', required: true, placeholder: '1', hint: 'Primary için 1, Secondary için 2 kullanılır' },
                        { name: 'peer_ip', why: "Peer yönetim IP'sine erişilemiyorsa HA hiç kurulmaz. İki node'un RPC node parolası eşleşmezse <b>config sync failed</b> alınır; sürüm farkı olan node'lar arasında da senkronizasyon reddedilir ve cihazlar sessizce ayrışır.", label: 'Peer Management IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Karşı node\'un yönetim IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsHaGen(data);
        });
    }
};
function cgNsHaGen(data) {
    const role = cgEsc(data.ha_role || 'primary');
    const nodeId = cgEsc(data.node_id || '');
    const peerIp = cgEsc(data.peer_ip || '');
    let c = '# ========================================\n# Citrix ADC — HA Pair (' + role.toUpperCase() + ')\n# ========================================\n\n';
    c += 'add ha node ' + nodeId + ' ' + peerIp + ' -inc ENABLED\n';
    c += 'save config\n\n';
    c += '# NOT: Her iki node\'da da birbirinin IP\'siyle bu komut çalıştırılır.\n\n';
    c += '# Doğrulama:\n# show ha node\n# show ha sync\n';
    return c;
}

// ── Citrix ADC: Content Switching ────────────────────────────────────────────
CitrixADC.cs = {
    label: 'Content Switching',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Content Switching (Citrix ADC)',
                desc: 'URL tabanlı trafik yönlendirme — <code>add cs vserver CS_APP HTTP 10.1.1.200 80</code>. Policy expression ile hedef LB vserver\'a yönlendirilir.',
                badge: { text: 'En Yaygın', cls: 'recommended' }
            },
            sections: [
                {
                    title: 'CS Virtual Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'cs_name', why: "CS vServer adı policy bind komutlarında kullanılır; hiçbir policy bind edilmezse tüm trafik default vServer'a gider. CS ve LB vServer aynı VIP ile aynı portu paylaşamaz.", label: 'CS vServer Adı', type: 'text', required: true, placeholder: 'CS_APP', hint: 'Content Switching sanal sunucu adı' },
                        { name: 'vip', why: "CS vServer trafiği ilk karşılayan nesnedir; arkasındaki LB vServer'lar genelde <code>0.0.0.0</code> ile adressiz tanımlanır. LB vServer'a ayrı bir VIP verilirse trafik CS'i atlayarak doğrudan oraya düşebilir ve içerik yönlendirmesi devre dışı kalır.", label: 'VIP (Virtual IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.200', hint: 'Clients bu IP\'ye bağlanır' },
                        { name: 'port', why: "Port ve protokol arkadaki LB vServer'larla uyumlu olmalı; SSL sonlandırma CS üzerinde yapılıyorsa LB vServer'lar HTTP olarak tanımlanmalıdır, aksi halde çift şifreleme denemesi handshake hatası üretir.", label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '80' }
                    ]
                },
                {
                    title: 'CS Policy & Yönlendirme',
                    icon: 'fas fa-directions',
                    fields: [
                        { name: 'cs_policy', why: "CS policy'ler bind sırasındaki <b>priority</b> değerine göre değerlendirilir; genel bir kural düşük numarayla üstte kalırsa altındaki özel kurallar hiç çalışmaz ve trafik yanlış vServer'a gider.", label: 'CS Policy Adı', type: 'text', required: true, placeholder: 'CS_POL_API', hint: 'URL eşleşme kuralı adı' },
                        { name: 'url_prefix', why: "Prefix eşleşmesi büyük/küçük harfe ve sondaki eğik çizgiye duyarlıdır; <code>/api</code> yazılırsa <code>/apifoo</code> da eşleşir. Yanlış prefix trafiğin sessizce default vServer'a düşmesine yol açar.", label: 'URL Prefix', type: 'text', required: true, placeholder: '/api/', hint: 'Bu prefix ile başlayan istekler hedef vserver\'a gider' },
                        { name: 'target_vs', why: "Hedef LB vServer tanımlı ve UP değilse eşleşen trafik hata alır; CS policy eşleştiğinde istek artık default'a da gitmez. Hedef vServer'a ServiceGroup bind edilmiş olmalıdır.", label: 'Hedef LB vServer', type: 'text', required: true, placeholder: 'VS_API_BACKEND', hint: 'Eşleşen trafiğin yönleneceği LB vServer' },
                        { name: 'default_vs', why: "Default vServer tanımlanmazsa hiçbir policy'ye uymayan istekler yanıtsız kalır ve istemci zaman aşımına düşer. Default, uygulamanın ana sayfasını taşıyan vServer olmalıdır.", label: 'Default LB vServer', type: 'text', required: true, placeholder: 'VS_WEB_DEFAULT', hint: 'Eşleşmeyen trafik için fallback vServer' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsCsGen(data);
        });
    }
};
function cgNsCsGen(data) {
    const csName = cgEsc(data.cs_name || '');
    const vip = cgEsc(data.vip || '');
    const port = cgEsc(data.port || '');
    const csPolicy = cgEsc(data.cs_policy || '');
    const urlPrefix = cgEsc(data.url_prefix || '');
    const targetVs = cgEsc(data.target_vs || '');
    const defaultVs = cgEsc(data.default_vs || '');
    let c = '# ========================================\n# Citrix ADC — Content Switching\n# ========================================\n\n';
    c += 'add cs vserver ' + csName + ' HTTP ' + vip + ' ' + port + '\n\n';
    c += 'add cs policy ' + csPolicy + ' -rule \'HTTP.REQ.URL.STARTSWITH("' + urlPrefix + '")\'\n\n';
    c += 'bind cs vserver ' + csName + ' -policyName ' + csPolicy + ' -targetLBVserver ' + targetVs + ' -priority 10\n';
    c += 'bind cs vserver ' + csName + ' -lbvserver ' + defaultVs + '\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show cs vserver ' + csName + '\n# show cs policy ' + csPolicy + '\n';
    return c;
}

// ── Citrix ADC: Responder (Redirect/Block) ────────────────────────────────────
CitrixADC.responder = {
    label: 'Responder Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-reply',
                title: 'Responder Policy (Citrix ADC)',
                desc: 'HTTP redirect veya drop işlemi — <code>add responder action ACT redirect "url"</code> + <code>add responder policy POL expr ACT</code>.'
            },
            configTypes: [
                { id: 'redirect', label: 'Redirect', icon: 'fas fa-external-link-alt', desc: 'HTTP 301 yönlendirme' },
                { id: 'drop', label: 'Drop', icon: 'fas fa-ban', desc: 'İsteği sil / engelle', badge: { text: 'Güvenlik', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Policy Tanımı',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'pol_name', why: "Responder policy bind edilmeden çalışmaz; ayrıca <code>enable ns feature RESPONDER</code> yapılmamışsa policy oluşturulsa bile hiç devreye girmez.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'RESP_HTTP_REDIRECT', hint: 'Büyük harf + alt çizgi konvansiyonu' },
                        { name: 'action_type', why: "Redirect aksiyonu isteği hiç backend'e göndermeden 302/301 ile yanıtlar; responder policy'leri rewrite'tan önce değerlendirildiği için yanlış yazılmış bir ifade tüm trafiği yönlendirme döngüsüne sokabilir.", type: 'hidden', value: 'redirect' },
                        { name: 'match_expr', why: "Expression sözdizimi hatalıysa policy hiç oluşturulmaz; mantıksal olarak çok genişse (örneğin daima doğru bir ifade) tüm istekler yönlendirilir ve uygulama erişilemez hale gelir. Hedef aynı vServer'a bakıyorsa sonsuz döngü oluşur.", label: 'Match Expression', type: 'text', required: true, placeholder: 'HTTP.REQ.URL.STARTSWITH("/old/")', hint: 'NetScaler Policy Expression — CTRL+Space ile öneri alabilirsiniz' },
                        { name: 'bind_vs', why: "Policy bir vServer'a ya da global'e bind edilmediği sürece hiçbir isteğe dokunmaz. Bind sırasında verilen priority, aynı bind noktasındaki diğer policy'lere göre değerlendirme sırasını belirler.", label: 'Bağlanacak LB vServer', type: 'text', optional: true, placeholder: 'VS_APP_HTTPS', hint: 'Boş bırakılırsa manuel bind gerekir' }
                    ]
                },
                {
                    title: 'Redirect Ayarları',
                    icon: 'fas fa-external-link-alt',
                    showFor: ['redirect'],
                    fields: [
                        { name: 'redirect_url', why: "Hedef URL şema ile birlikte tam verilmelidir; <code>https://</code> unutulursa tarayıcı adresi göreli sanar. Hedef aynı vServer'a çözümleniyorsa istemci sonsuz yönlendirme (ERR_TOO_MANY_REDIRECTS) alır.", label: 'Redirect URL', type: 'text', required: true, placeholder: 'https://www.example.com', hint: 'HTTP 301 ile yönlendirilecek hedef URL' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsRespGen(data);
        });
    }
};
function cgNsRespGen(data) {
    const polName = cgEsc(data.pol_name || '');
    // Tip configTypes kartindan gelir; gizli 'action_type' alani secimi takip etmez.
    const actionType = data._cgtype === 'drop' ? 'drop' : 'redirect';
    const redirectUrl = cgEsc(data.redirect_url || '');
    const matchExpr = cgEsc(data.match_expr || '');
    const bindVs = cgEsc(data.bind_vs || '');
    const actName = polName + '_ACT';
    let c = '# ========================================\n# Citrix ADC — Responder Policy\n# ========================================\n\n';
    // DROP yerlesik bir responder aksiyonudur; 'add responder action' ile tanimlanmaz.
    let polAct = 'DROP';
    if (actionType === 'redirect') {
        c += 'add responder action ' + actName + ' redirect "\\\"' + redirectUrl + '\\\"" -responseStatusCode 301\n\n';
        polAct = actName;
    }
    c += 'add responder policy ' + polName + ' \'' + matchExpr + '\' ' + polAct + '\n\n';
    if (bindVs) c += 'bind lb vserver ' + bindVs + ' -policyName ' + polName + ' -type REQUEST -priority 10\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show responder policy ' + polName + '\n';
    return c;
}

// ── Citrix ADC: GSLB ──────────────────────────────────────────────────────────
CitrixADC.gslb = {
    label: 'GSLB',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe-europe',
                title: 'GSLB (Citrix ADC)',
                desc: 'Global Server Load Balancing — <code>add gslb site SITE_IST 10.1.0.1</code>. DNS tabanlı coğrafi yük dağıtımı, RTT/RR/LC yöntemleri.',
                badge: { text: 'En Yaygın', cls: 'recommended' }
            },
            sections: [
                {
                    title: 'Local Site',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'local_site', why: "Site adları her iki ADC'de birebir aynı olmalı; uyuşmazlık MEP (Metric Exchange Protocol) bağlantısının kurulmamasına ve uzak site'ın sürekli DOWN görünmesine yol açar.", label: 'Local Site Adı', type: 'text', required: true, placeholder: 'SITE_ISTANBUL', hint: 'Bu ADC\'nin bulunduğu datacenter adı' },
                        { name: 'local_ip', why: "Site IP'si olarak genelde bir SNIP kullanılır ve MEP bu adres üzerinden TCP 3009/3011 ile konuşur. Firewall bu portları kapatırsa siteler birbirinin sağlığını göremez ve GSLB ölü siteye trafik yollamaya devam eder.", label: 'Local Site IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.0.1', hint: 'Local site yönetim IP\'si' }
                    ]
                },
                {
                    title: 'Remote Site',
                    icon: 'fas fa-map-pin',
                    fields: [
                        { name: 'remote_site', why: "Uzak site tanımı karşı taraftaki local site tanımıyla simetrik olmalı; tek taraflı tanım MEP kurulmuş gibi görünse de metrik alışverişi eksik kalır ve failover kararları yanlış verilir.", label: 'Remote Site Adı', type: 'text', required: true, placeholder: 'SITE_ANKARA', hint: 'Uzak datacenter adı' },
                        { name: 'remote_ip', why: "Uzak site IP'sine erişim yoksa GSLB tüm trafiği local site'a yığar; felaket kurtarma senaryosu hiç test edilmemiş olur ve gerçek kesintide yedek site devreye girmez.", label: 'Remote Site IP', type: 'text', validate: 'ip', required: true, placeholder: '10.2.0.1', hint: 'Uzak site yönetim IP\'si' }
                    ]
                },
                {
                    title: 'GSLB vServer & DNS',
                    icon: 'fas fa-dns',
                    fields: [
                        { name: 'gslb_vs', why: "GSLB vServer'a servis bind edilmeden ve domain bağlanmadan hiçbir DNS yanıtı üretilmez. Bu ad yalnızca yerel konfigürasyonda anlamlıdır, DNS tarafında görünmez.", label: 'GSLB vServer Adı', type: 'text', required: true, placeholder: 'GSLB_APP_HTTP', hint: 'GSLB sanal sunucu adı' },
                        { name: 'proto', why: "Protokol seçimi bind edilecek GSLB servisleriyle uyumlu olmalı; uyumsuzluk bind komutunun reddedilmesine ve GSLB vServer'ın boş kalmasına yol açar.", label: 'Protokol', type: 'select', options: [
                            { value: 'HTTP', label: 'HTTP', selected: true },
                            { value: 'SSL', label: 'SSL' },
                            { value: 'TCP', label: 'TCP' }
                        ]},
                        { name: 'dns_zone', why: "ADC'nin bu domain için yetkili olması gerekir; üst DNS'te delegasyon (NS kaydı) yapılmazsa istemciler sorguyu ADC'ye hiç sormaz ve GSLB devreye girmez. TTL yüksek bırakılırsa failover sonrası istemciler dakikalarca eski siteye gider.", label: 'DNS Zone (FQDN)', type: 'text', required: true, placeholder: 'app.example.com', hint: 'GSLB\'nin yetkili olacağı DNS domain' },
                        { name: 'lb_method', why: "<code>STATICPROXIMITY</code> coğrafi veritabanı gerektirir; veritabanı yüklü değilse yöntem sessizce çalışmaz. ROUNDROBIN kullanıcıyı uzak datacenter'a gönderip gecikmeyi ciddi şekilde artırabilir.", label: 'LB Yöntemi', type: 'select', options: [
                            { value: 'ROUNDROBIN', label: 'Round Robin', selected: true },
                            { value: 'LEASTCONNECTION', label: 'Least Connection' },
                            { value: 'RTT', label: 'RTT (Round-Trip Time)' }
                        ]}
                    ]
                },
                {
                    title: 'GSLB Servisler',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'local_svc_ip', why: "GSLB servisi olarak local sitedeki uygulama VIP'i verilir; bu adres izlenemiyorsa servis DOWN kalır ve DNS yanıtlarından çıkarılır, tüm trafik uzak siteye kayar.", label: 'Local Service IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.0.100', hint: 'Local sitedeki uygulama VIP\'i' },
                        { name: 'remote_svc_ip', why: "Uzak servis MEP üzerinden izlenir; MEP yoksa uzak servisin gerçekten ayakta olup olmadığı bilinemez ve kullanıcılar çalışmayan siteye yönlendirilir. Gerekirse uzak servise doğrudan monitor bağlanmalıdır.", label: 'Remote Service IP', type: 'text', validate: 'ip', required: true, placeholder: '10.2.0.100', hint: 'Uzak sitedeki uygulama VIP\'i' },
                        { name: 'svc_port', why: "Servis portu uygulamanın portuyla eşleşmezse sağlık kontrolü başarısız olur ve site DNS yanıtlarından düşer. Port DNS cevabını değiştirmez ama izlemenin doğruluğunu belirler.", label: 'Service Port', type: 'text', validate: 'port', required: true, placeholder: '80' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsGslbGen(data);
        });
    }
};
function cgNsGslbGen(data) {
    const localSite = cgEsc(data.local_site || '');
    const localIp = cgEsc(data.local_ip || '');
    const remoteSite = cgEsc(data.remote_site || '');
    const remoteIp = cgEsc(data.remote_ip || '');
    const gslbVs = cgEsc(data.gslb_vs || '');
    const proto = cgEsc(data.proto || 'HTTP');
    const dnsZone = cgEsc(data.dns_zone || '');
    const lbMethod = cgEsc(data.lb_method || 'ROUNDROBIN');
    const localSvcIp = cgEsc(data.local_svc_ip || '');
    const remoteSvcIp = cgEsc(data.remote_svc_ip || '');
    const svcPort = cgEsc(data.svc_port || '');
    const localSvcName = 'GSVC_' + localSite;
    const remoteSvcName = 'GSVC_' + remoteSite;
    let c = '# ========================================\n# Citrix ADC — GSLB\n# ========================================\n\n';
    c += '# GSLB Site Tanımları\n';
    c += 'add gslb site ' + localSite + ' ' + localIp + ' -publicIP ' + localIp + '\n';
    c += 'add gslb site ' + remoteSite + ' ' + remoteIp + ' -publicIP ' + remoteIp + '\n\n';
    c += '# GSLB Services\n';
    c += 'add gslb service ' + localSvcName + ' ' + localSvcIp + ' ' + proto + ' ' + svcPort + ' -siteName ' + localSite + '\n';
    c += 'add gslb service ' + remoteSvcName + ' ' + remoteSvcIp + ' ' + proto + ' ' + svcPort + ' -siteName ' + remoteSite + '\n\n';
    c += '# GSLB vServer\n';
    c += 'add gslb vserver ' + gslbVs + ' ' + proto + ' -lbMethod ' + lbMethod + ' -domainName ' + dnsZone + ' -TTL 5\n';
    c += 'bind gslb vserver ' + gslbVs + ' -serviceName ' + localSvcName + '\n';
    c += 'bind gslb vserver ' + gslbVs + ' -serviceName ' + remoteSvcName + '\n\n';
    c += '# DNS Zone Delegation\n';
    c += 'add dns zone ' + dnsZone + ' -proxyMode NO\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show gslb vserver ' + gslbVs + '\n# show gslb site\n# show gslb service\n';
    return c;
}

// ── Citrix ADC: SSL Virtual Server ────────────────────────────────────────────
CitrixADC.sslvserver = {
    label: 'SSL Virtual Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'SSL Virtual Server (Citrix ADC)',
                desc: 'SSL offload vServer — <code>add lb vserver VS_SSL SSL 10.0.0.100 443</code>. Sertifika bağlama + cipher + SNI ayarları.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'SSL Virtual Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'vs_name', why: "SSL vServer'a certKey bind edilmeden vServer DOWN kalır ve hiçbir istemci bağlanamaz. Ad, policy ve certKey bind komutlarında referans edilir.", label: 'VS Adı', type: 'text', required: true, placeholder: 'vs-app-ssl', hint: 'SSL vServer adı' },
                        { name: 'ip', why: "VIP bir SNIP ile aynı subnet'te olmalı, aksi halde ADC bu adres için ARP duyurusu yapmaz. Aynı IP üzerinde farklı portlarla HTTP ve SSL vServer birlikte tanımlanıp HTTP'den HTTPS'e yönlendirme kurulabilir.", label: 'VIP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Virtual IP adresi' },
                        { name: 'port', why: "SSL vServer için 443 standarttır; farklı port kullanılacaksa istemcinin adresi açıkça portla yazması gerekir ve HSTS gibi mekanizmalar beklenmedik davranır.", label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '443' }
                    ]
                },
                {
                    title: 'SSL Parametreleri',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'cert_name', why: "Bind edilen certKey'in CN/SAN değeri istemcinin kullandığı domain ile eşleşmezse tarayıcı güven hatası verir. Sertifikanın süresi dolduğunda vServer UP görünmeye devam eder ama tüm istemciler reddedilir.", label: 'Cert Key Adı', type: 'text', required: true, placeholder: 'app-cert', hint: 'add ssl certKey ile tanımlanmış sertifika adı' },
                        { name: 'cipher_group', why: "Varsayılan cipher grubu eski ve zayıf algoritmalar içerebilir ve PCI taramalarında bulgu üretir; çok sıkı bir grup ise eski istemcilerde handshake failure yaratır. Bu sorun yalnızca belirli kullanıcılarda görüldüğü için teşhisi zordur.", label: 'Cipher Group', type: 'select', options: [
                            { value: 'DEFAULT', label: 'DEFAULT', selected: true },
                            { value: 'HIGH', label: 'HIGH' },
                            { value: 'FIPS', label: 'FIPS' }
                        ]},
                        { name: 'sni', why: "Aynı IP üzerinde birden çok domain barındırılıyorsa SNI kapalıyken tüm istemciler ilk (varsayılan) sertifikayı alır ve isim uyuşmazlığı hatası görür. SNI açıkken her certKey bir domain ile birlikte bind edilmelidir.", label: 'SNI', type: 'select', options: [
                            { value: 'ENABLED', label: 'ENABLED', selected: true },
                            { value: 'DISABLED', label: 'DISABLED' }
                        ], hint: 'Server Name Indication — multi-domain SSL için gerekli' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsSslVsGen(data);
        });
    }
};
function cgNsSslVsGen(data) {
    const vsName = cgEsc(data.vs_name || '');
    const ip = cgEsc(data.ip || '');
    const port = cgEsc(data.port || '');
    const certName = cgEsc(data.cert_name || '');
    const cipherGroup = cgEsc(data.cipher_group || 'DEFAULT');
    const sni = cgEsc(data.sni || 'ENABLED');
    let c = '# ========================================\n# Citrix ADC — SSL Virtual Server\n# ========================================\n\n';
    c += 'add lb vserver ' + vsName + ' SSL ' + ip + ' ' + port + ' -lbMethod ROUNDROBIN\n';
    c += 'bind ssl vserver ' + vsName + ' -certkeyName ' + certName + '\n';
    // Cipher grubu '-sslProfile' ile degil 'bind ssl vserver -cipherName' ile baglanir (sslProfile bir profil adi ister).
    if (cipherGroup !== 'DEFAULT') c += 'unbind ssl vserver ' + vsName + ' -cipherName DEFAULT\nbind ssl vserver ' + vsName + ' -cipherName ' + cipherGroup + '\n';
    c += 'set ssl vserver ' + vsName + ' -SNIEnable ' + sni + '\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show lb vserver ' + vsName + '\n# show ssl vserver ' + vsName + '\n';
    return c;
}

// ── Citrix ADC: Rewrite Policy / Action ──────────────────────────────────────
CitrixADC.rewrite = {
    label: 'Rewrite Policy/Action',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-pen',
                title: 'Rewrite Policy/Action (Citrix ADC)',
                desc: 'HTTP header ekleme/silme veya URL değiştirme — <code>add rewrite action ACT INSERT_HTTP_HEADER "X-Forwarded-Proto" "\\"https\\""</code>.'
            },
            sections: [
                {
                    title: 'Rewrite Action',
                    icon: 'fas fa-edit',
                    fields: [
                        { name: 'action_name', why: "Rewrite action policy tarafından referans edilir; action olmadan policy oluşturulamaz. Adı sonradan değiştirmek bağlı policy'yi kırar ve trafik değiştirilmeden geçmeye başlar.", label: 'Action Adı', type: 'text', required: true, placeholder: 'ACT-INSERT-HEADER', hint: 'Büyük harf + tire konvansiyonu önerilir' },
                        { name: 'action_type', why: "INSERT_HTTP_HEADER var olan başlığı ezmez, ikinci bir başlık ekler ve backend hangisini okuyacağını bilemez. REPLACE için hedef başlığın istekte bulunması gerekir; yoksa action sessizce hiçbir şey yapmaz ve sorun fark edilmez.", label: 'Action Tipi', type: 'select', options: [
                            { value: 'INSERT_HTTP_HEADER', label: 'INSERT_HTTP_HEADER', selected: true },
                            { value: 'DELETE_HTTP_HEADER', label: 'DELETE_HTTP_HEADER' },
                            { value: 'REPLACE', label: 'REPLACE' }
                        ]},
                        { name: 'target', why: "Hedef, action tipine göre farklı yorumlanır; header action'ında yol yazılması sessiz başarısızlığa yol açar. Backend'in beklediği başlık adı birebir yazılmalıdır.", label: 'Hedef (Header Adı / Path)', type: 'text', required: true, placeholder: 'X-Forwarded-Proto', hint: 'Header adı veya değiştirilen yol' },
                        { name: 'expression', why: "PI expression içinde sabit metinler çift tırnak ile yazılmalı; tırnaksız yazılan değer ifade olarak yorumlanır ve policy oluşturma hatası verir. Hatalı ifade runtime'da tanımsız sonuç üretip action'ın atlanmasına sebep olur.", label: 'Expression (değer)', type: 'text', required: true, placeholder: '"https"', hint: 'NetScaler PI expression — string için çift tırnak kullanın' }
                    ]
                },
                {
                    title: 'Rewrite Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', why: "Policy bind edilmeden hiçbir etkisi yoktur; ayrıca <code>enable ns feature REWRITE</code> yapılmamışsa policy oluşturulsa bile çalışmaz.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-REWRITE-HTTPS' },
                        { name: 'bind_point', why: "REQUEST bind noktası istemciden gelen isteği, RESPONSE sunucudan dönen yanıtı değiştirir; yanlış nokta seçilirse policy hiç tetiklenmez. Aynı bind noktasındaki policy'ler priority sırasına göre çalışır ve düşük numara önce değerlendirilir.", label: 'Bind Point', type: 'select', options: [
                            { value: 'REQUEST', label: 'REQUEST', selected: true },
                            { value: 'RESPONSE', label: 'RESPONSE' }
                        ], hint: 'İsteğe mi yoksa yanıta mı uygulanacak' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsRewriteGen(data);
        });
    }
};
function cgNsRewriteGen(data) {
    const actionName = cgEsc(data.action_name || '');
    const actionType = cgEsc(data.action_type || 'INSERT_HTTP_HEADER');
    const target = cgEsc(data.target || '');
    const expression = cgEsc(data.expression || '');
    const policyName = cgEsc(data.policy_name || '');
    const bindPoint = cgEsc(data.bind_point || 'REQUEST');
    let c = '# ========================================\n# Citrix ADC — Rewrite Policy / Action\n# ========================================\n\n';
    c += 'add rewrite action ' + actionName + ' ' + actionType + ' "' + target + '" "' + expression + '"\n';
    c += 'add rewrite policy ' + policyName + ' true ' + actionName + '\n\n';
    c += '# Bind to vserver (vsname değiştirin):\n# bind lb vserver <vsname> -policyName ' + policyName + ' -type ' + bindPoint + ' -priority 100\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show rewrite action ' + actionName + '\n# show rewrite policy ' + policyName + '\n';
    return c;
}

// ── Citrix ADC: Rate Limiting ─────────────────────────────────────────────────
CitrixADC.ratelimit = {
    label: 'Rate Limiting',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Rate Limiting (Citrix ADC)',
                desc: 'İstemci başına istek sınırlama — <code>add ns limitIdentifier RL-PER-CLIENT -threshold 100 -timeSlice 60000</code>. Selector ile istemci IP bazlı kontrol.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Rate Limit Identifier',
                    icon: 'fas fa-id-badge',
                    fields: [
                        { name: 'identifier_name', why: "Rate limit identifier tek başına engelleme yapmaz; bir responder policy ile birlikte kullanılmadığı sürece yalnızca sayaç tutar ve koruma sağladığı sanılır.", label: 'Identifier Adı', type: 'text', required: true, placeholder: 'RL-PER-CLIENT', hint: 'Rate limit kuralı adı' },
                        { name: 'rate', why: "Eşik çok düşük tutulursa meşru kullanıcılar ve sağlık kontrolleri engellenir; çok yüksek tutulursa brute force ve scraping trafiği rahatça geçer. Değer gerçek trafik profili ölçülerek belirlenmelidir.", label: 'Rate (istek sayısı)', type: 'text', required: true, validate: 'posint', placeholder: '100', hint: 'Zaman dilimindeki maksimum istek sayısı' },
                        { name: 'per_seconds', why: "Zaman penceresi kısa olursa ani ama meşru trafik dalgalanmaları (sayfa başına çoklu istek) yanlışlıkla limitlenir. ADC bu değeri milisaniyeye çevirir; çok geniş pencereler bellek tüketimini artırır.", label: 'Süre (saniye)', type: 'text', required: true, validate: 'posint', placeholder: '60', hint: 'Ölçüm penceresi (saniye) — milisaniyeye çevrilir' },
                        { name: 'mode', why: "Mode istemcinin nasıl tanımlanacağını belirler; IP bazlı sayım NAT veya proxy arkasındaki tüm kullanıcıları tek istemci sayar ve kurumsal ağları topluca engeller. SESSION veya URL bazlı sayım daha adil sonuç verir.", label: 'Mode', type: 'select', options: [
                            { value: 'CONNECTION', label: 'CONNECTION', selected: true },
                            { value: 'REQUEST_RATE', label: 'REQUEST_RATE' },
                            { value: 'NONE', label: 'NONE' }
                        ]},
                        { name: 'action', why: "<b>DROP</b> istemciye hiçbir şey döndürmez ve sorun gidermeyi zorlaştırır; <b>RESET</b> bağlantıyı koparır. 429 gibi anlamlı bir yanıt döndürmek istemcinin geri çekilmesini (backoff) sağlar ve yeniden deneme fırtınasını önler.", label: 'Limit Aşıldığında Aksiyon', type: 'select', options: [
                            { value: 'DROP', label: 'DROP', selected: true },
                            { value: 'RESET', label: 'RESET' },
                            { value: 'REDIRECT', label: 'REDIRECT' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsRateLimitGen(data);
        });
    }
};
function cgNsRateLimitGen(data) {
    const identifierName = cgEsc(data.identifier_name || '');
    const rate = cgEsc(data.rate || '');
    const perSeconds = cgEsc(data.per_seconds || '');
    const mode = cgEsc(data.mode || 'CONNECTION');
    const action = cgEsc(data.action || 'DROP');
    const timeSliceMs = /^\d+$/.test(perSeconds) ? String(parseInt(perSeconds, 10) * 1000) : '';
    let c = '# ========================================\n# Citrix ADC — Rate Limiting\n# ========================================\n\n';
    c += 'add ns limitIdentifier ' + identifierName + ' -threshold ' + rate + ' -timeSlice ' + timeSliceMs + ' -mode ' + mode + '\n';
    c += 'add ns limitSelector ' + identifierName + '-SEL "CLIENT.IP.SRC"\n';
    c += 'set ns limitIdentifier ' + identifierName + ' -selectorName ' + identifierName + '-SEL\n\n';
    c += '# Responder via rate limit:\n';
    c += 'add responder action ACT-RL-' + identifierName + ' ' + action + ' -bypassSafetyCheck YES\n';
    c += 'add responder policy POL-RL-' + identifierName + ' "sys.check_limit(\\"' + identifierName + '\\")" ACT-RL-' + identifierName + '\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show ns limitIdentifier ' + identifierName + '\n# show ns limitStats ' + identifierName + '\n';
    return c;
}

// ── Citrix ADC: AAA-TM ────────────────────────────────────────────────────────
CitrixADC.aaa = {
    label: 'AAA-TM',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'AAA-TM (Citrix ADC)',
                desc: 'Traffic Management Authentication — <code>add authentication vserver vs-aaa SSL 10.0.0.200 443</code>. LDAP/RADIUS/SAML ile kimlik doğrulama.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'AAA vServer',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'vserver_name', why: "AAA vServer bir LB vServer'a <code>-authnVsName</code> ile bağlanmadıkça hiç kimse kimlik doğrulamaya yönlendirilmez. Ayrıca <code>enable ns feature AAA</code> yapılmamışsa yapılandırma hiç çalışmaz.", label: 'vServer Adı', type: 'text', required: true, placeholder: 'vs-aaa', hint: 'Authentication virtual server adı' },
                        { name: 'ip', why: "AAA vServer'ın kendi VIP'i olmalı ve bu adres istemciden erişilebilir olmalıdır; erişilemezse kullanıcı giriş sayfasına hiç ulaşamaz ve yalnızca boş ekran görür. Bu VIP için de geçerli bir sertifika bind edilmelidir.", label: 'IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'Authentication vServer VIP' },
                        { name: 'auth_type', why: "Seçilen kimlik doğrulama tipi dizin altyapısıyla uyumlu olmalı; LDAP yerine RADIUS seçilmesi farklı port ve paylaşılan anahtar gerektirir. Yanlış tip tüm giriş denemelerinin başarısız olmasına yol açar.", label: 'Auth Tipi', type: 'select', options: [
                            { value: 'LDAP', label: 'LDAP', selected: true },
                            { value: 'RADIUS', label: 'RADIUS' },
                            { value: 'SAML', label: 'SAML' }
                        ]}
                    ]
                },
                {
                    title: 'LDAP Ayarları',
                    icon: 'fas fa-address-book',
                    fields: [
                        { name: 'ldap_server', why: "LDAP sunucusuna SNIP üzerinden erişilemiyorsa kimlik doğrulama zaman aşımına uğrar ve kullanıcı yalnızca genel bir hata görür. LDAPS (636) kullanılacaksa sunucu sertifikasının CA'sı ADC'ye yüklenmelidir.", label: 'LDAP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'Active Directory / LDAP sunucu adresi' },
                        { name: 'ldap_base', why: "Base DN dar verilirse bazı kullanıcılar bulunamaz ve girişleri reddedilir; çok geniş verilirse arama yavaşlar ve dizin gereksiz yüklenir. Bind DN veya parolası yanlışsa arama hiç yapılamaz ve tüm girişler başarısız olur.", label: 'LDAP Base DN', type: 'text', required: true, placeholder: 'DC=company,DC=com', hint: 'Dizin aramasının başlayacağı DN' },
                        { name: 'bind_dn', why: 'ADC dizinde arama yapmak için bu hesapla bağlanır; yalnız okuma yetkili, parolası süresiz ayrı bir servis hesabı kullanın.', label: 'Bind DN', type: 'text', required: true, placeholder: 'CN=svc-netscaler,OU=Service,DC=example,DC=com', hint: 'Servis hesabının tam DN\'i' },
                        { name: 'bind_pw', label: 'Bind Parolası', type: 'text', required: true, placeholder: 'Ornek-Parola-123', hint: 'Servis hesabı parolası' },
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsAaaGen(data);
        });
    }
};
function cgNsAaaGen(data) {
    const vserverName = cgEsc(data.vserver_name || '');
    const ip = cgEsc(data.ip || '');
    const authType = cgEsc(data.auth_type || 'LDAP');
    const ldapServer = cgEsc(data.ldap_server || '');
    const ldapBase = cgEsc(data.ldap_base || '');
    let c = '# ========================================\n# Citrix ADC — AAA-TM\n# ========================================\n\n';
    c += 'add authentication ldapAction LDAP-' + vserverName + ' -serverIP ' + ldapServer + ' -serverPort 636';
    c += ' -ldapBase "' + ldapBase + '"';
    c += ' -ldapBindDn "' + cgEsc(data.bind_dn || '') + '"';
    c += ' -ldapBindDnPassword "' + cgEsc(data.bind_pw || '') + '" -secType SSL -authentication ENABLED\n\n';
    c += 'add authentication ldapPolicy POL-LDAP-' + vserverName + ' NS_TRUE LDAP-' + vserverName + '\n\n';
    c += 'add authentication vserver ' + vserverName + ' SSL ' + ip + ' 443\n';
    c += 'bind authentication vserver ' + vserverName + ' -policy POL-LDAP-' + vserverName + ' -priority 100\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show authentication vserver ' + vserverName + '\n# show authentication ldapAction LDAP-' + vserverName + '\n';
    return c;
}

// ── Citrix ADC: Cache Policy ──────────────────────────────────────────────────
CitrixADC.cache = {
    label: 'Cache Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-database',
                title: 'Cache Policy (Citrix ADC)',
                desc: 'Integrated Caching — <code>add cache contentGroup CG-IMAGES -relExpiry 3600</code> + <code>add cache policy POL rule CACHE</code>. Statik içerik önbellekleme.'
            },
            sections: [
                {
                    title: 'Cache Content Group',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'content_group', why: "Content group tanımlanmadan cache policy içeriği bir yere yazamaz; ayrıca <code>enable ns feature IC</code> (Integrated Caching) yapılmamışsa önbellek hiç çalışmaz.", label: 'Content Group Adı', type: 'text', required: true, placeholder: 'CG-IMAGES', hint: 'Önbellek grubu adı' },
                        { name: 'expires_secs', why: "Süre çok uzunsa kullanıcılar güncellenmiş içeriği göremez ve dağıtım sonrası eski sayfa servis edilmeye devam eder; çok kısaysa önbellek isabet oranı düşer ve backend yükü hiç azalmaz.", label: 'Cache Süresi (sn)', type: 'text', required: true, placeholder: '3600', hint: 'İçerik önbellekte ne kadar tutulsun (saniye)' },
                        { name: 'query_string', why: "Query string dikkate alınmazsa farklı parametrelerle gelen istekler aynı önbellek nesnesini paylaşır ve bir kullanıcı başkasının içeriğini görebilir. Dikkate alınırsa önbellek parçalanır ve isabet oranı düşer.", label: 'Query String', type: 'select', options: [
                            { value: 'IGNORE', label: 'IGNORE — sorgu string\'i yok say', selected: true },
                            { value: 'USE', label: 'USE — sorgu string\'i cache key\'e ekle' }
                        ], hint: 'URL query parametreleri cache key hesabına katılsın mı' }
                    ]
                },
                {
                    title: 'Cache Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', why: "Cache policy bind edilmeden çalışmaz. Kimlik doğrulamalı veya kişiselleştirilmiş yanıtların önbelleğe alınması ciddi veri sızıntısına yol açar, bu yüzden policy kapsamı dikkatle sınırlanmalıdır.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-CACHE-IMAGES' },
                        { name: 'expression', why: "Expression çok geniş yazılırsa dinamik ve kullanıcıya özel yanıtlar da önbelleğe alınır; bu bir kullanıcının verisinin başkasına gösterilmesi anlamına gelir. Yalnızca statik uzantılar hedeflenmelidir.", label: 'Expression', type: 'text', required: true, placeholder: 'HTTP.REQ.URL.SUFFIX.EQ("jpg")||HTTP.REQ.URL.SUFFIX.EQ("png")', hint: 'Hangi isteklerin önbellekleneceğini belirleyen expression' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsCacheGen(data);
        });
    }
};
function cgNsCacheGen(data) {
    const contentGroup = cgEsc(data.content_group || '');
    const expiresSecs = cgEsc(data.expires_secs || '3600');
    const queryString = cgEsc(data.query_string || 'IGNORE');
    const policyName = cgEsc(data.policy_name || '');
    const expression = cgEsc(data.expression || '');
    let c = '# ========================================\n# Citrix ADC — Cache Policy\n# ========================================\n\n';
    c += 'add cache contentGroup ' + contentGroup + ' -relExpiry ' + expiresSecs + ' -ignoreReqCachingHdrs YES';
    if (queryString === 'IGNORE') c += ' -queryString IGNORE';
    c += '\n\n';
    c += 'add cache policy ' + policyName + " -rule '" + expression + "' -action CACHE -storeInGroup " + contentGroup + '\n\n';
    c += '# Bind to vserver (vsname değiştirin):\n# bind lb vserver <vsname> -policyName ' + policyName + ' -type REQUEST -priority 100\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show cache policy ' + policyName + '\n# show cache contentGroup ' + contentGroup + '\n';
    return c;
}

// ── Citrix ADC: Compression Policy ───────────────────────────────────────────
CitrixADC.compression = {
    label: 'Compression Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-compress-alt',
                title: 'Compression Policy (Citrix ADC)',
                desc: 'HTTP yanıt sıkıştırma — <code>add cmp action ACT COMPRESS</code> + <code>add cmp policy POL rule ACT</code>. HTML/CSS/JS için bandwidth tasarrufu.'
            },
            sections: [
                {
                    title: 'Compression Policy',
                    icon: 'fas fa-file-archive',
                    fields: [
                        { name: 'policy_name', why: "Sıkıştırma policy'si bind edilmeden etkisizdir; ayrıca <code>enable ns feature CMP</code> yapılmadan hiçbir yanıt sıkıştırılmaz.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-COMPRESS-HTML', hint: 'Sıkıştırma politikası adı' },
                        { name: 'expression', why: "Zaten sıkıştırılmış içerikler (jpg, png, zip) yeniden sıkıştırılırsa CPU harcanır ama kazanç olmaz, hatta boyut artabilir. Expression yalnızca metin tabanlı içeriği hedeflemelidir.", label: 'Expression', type: 'text', required: true, placeholder: 'HTTP.RES.HEADER("Content-Type").CONTAINS("text")', hint: 'Hangi yanıtların sıkıştırılacağını belirleyen expression' },
                        { name: 'action', why: "GZIP yaygın desteklenir; istemci <code>Accept-Encoding</code> göndermiyorsa ADC sıkıştırmayı atlar. Sıkıştırma ile SSL birlikte kullanıldığında BREACH/CRIME sınıfı saldırı riskleri ayrıca değerlendirilmelidir.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'COMPRESS', label: 'COMPRESS', selected: true },
                            { value: 'NOCOMPRESS', label: 'NOCOMPRESS' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsCompressGen(data);
        });
    }
};
function cgNsCompressGen(data) {
    const policyName = cgEsc(data.policy_name || '');
    const expression = cgEsc(data.expression || '');
    const action = cgEsc(data.action || 'COMPRESS');
    const actName = 'ACT-' + policyName;
    let c = '# ========================================\n# Citrix ADC — Compression Policy\n# ========================================\n\n';
    c += 'add cmp action ' + actName + ' ' + action + '\n';
    c += "add cmp policy " + policyName + " -rule '" + expression + "' -resAction " + actName + '\n\n';
    c += '# Global bind:\nbind cmp global ' + policyName + ' -priority 100 -type RES_DEFAULT\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show cmp policy ' + policyName + '\n# show cmp stats\n';
    return c;
}

// ── Citrix ADC: AppFirewall WAF Policy ───────────────────────────────────────
CitrixADC.waf = {
    label: 'AppFirewall (WAF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'AppFirewall WAF (Citrix ADC)',
                desc: 'Web Application Firewall — <code>add appfw profile WAF-PROFILE -type HTML</code>. SQL Injection, XSS ve CSRF koruması.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'AppFirewall Profile',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'profile_name', why: "WAF profili bir policy ile ilişkilendirilip vServer'a bind edilmedikçe hiçbir isteği korumaz; ayrıca <code>enable ns feature AppFw</code> gereklidir.", label: 'Profile Adı', type: 'text', required: true, placeholder: 'WAF-PROFILE-APP', hint: 'WAF profili adı' },
                        { name: 'profile_type', why: "Basic profil temel kontrollerle başlar ve yanlış pozitif riski düşüktür; Advanced profil derin kontroller yapar ama öğrenme yapılmadan üretime alınırsa meşru istekleri engeller ve uygulama kullanılamaz hale gelir.", label: 'Profile Tipi', type: 'select', options: [
                            { value: 'HTML', label: 'HTML', selected: true },
                            { value: 'XML', label: 'XML' },
                            { value: 'JSON', label: 'JSON' }
                        ], hint: 'Korunacak uygulama içerik tipi' }
                    ]
                },
                {
                    title: 'Güvenlik Kontrolleri',
                    icon: 'fas fa-lock',
                    warn: 'Tüm korumalar ON konumunda başlatılması önerilir. Uygulamada false positive oluşursa relaxation kuralı ekleyin.',
                    fields: [
                        { name: 'sql_injection', why: "SQL injection kontrolü açıkken içinde tırnak veya SQL anahtar kelimesi geçen meşru form girdileri de engellenebilir; relaxation kuralları tanımlanmadan blocking moda geçilmemelidir. Kapalıysa uygulama veritabanı seviyesinde savunmasız kalır.", label: 'SQL Injection', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]},
                        { name: 'xss_check', why: "XSS kontrolü HTML veya JavaScript içerebilen zengin metin alanlarında yanlış pozitif üretir; bu alanlar için istisna tanımlanmalıdır. Kapatılması ise saklı (stored) XSS saldırılarına kapı açar.", label: 'XSS Check', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]},
                        { name: 'csrf_protection', why: "CSRF koruması forma token enjekte eder; AJAX ve API çağrıları bu token'ı taşımadığı için beklenmedik şekilde 403 alabilir. API vServer'larında genelde kapalı tutulup yerine SameSite çerez politikası tercih edilir.", label: 'CSRF Protection', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]}
                    ]
                },
                {
                    title: 'AppFirewall Policy',
                    icon: 'fas fa-file-contract',
                    fields: [
                        { name: 'policy_name', why: "Policy, profili trafiğe bağlayan nesnedir; profil oluşturulup policy ile ilişkilendirilmezse koruma yalnızca kağıt üzerinde kalır ve WAF hiçbir isteği görmez.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'WAF-POLICY-APP' },
                        { name: 'bind_vs', why: "vServer'a bind edilmeyen WAF policy hiçbir isteği incelemez. SSL trafiği ADC üzerinde sonlandırılmıyorsa WAF şifreli içeriği göremez ve koruma sağlamaz.", label: 'Bağlanacak LB vServer', type: 'text', required: true, placeholder: 'vs-app-https', hint: 'Bağlanmayan WAF policy hiçbir isteği incelemez' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsWafGen(data);
        });
    }
};
function cgNsWafGen(data) {
    const profileName = cgEsc(data.profile_name || '');
    const profileType = cgEsc(data.profile_type || 'HTML');
    const sqlInjection = cgEsc(data.sql_injection || 'ON');
    const xssCheck = cgEsc(data.xss_check || 'ON');
    const csrfProtection = cgEsc(data.csrf_protection || 'ON');
    const policyName = cgEsc(data.policy_name || '');
    const bindVs = cgEsc(data.bind_vs || '');
    let c = '# ========================================\n# Citrix ADC — AppFirewall (WAF) Policy\n# ========================================\n\n';
    c += 'add appfw profile ' + profileName + ' -type ' + profileType + '\n';
    c += 'set appfw profile ' + profileName;
    c += ' -SQLInjection ' + sqlInjection;
    c += ' -crossSiteScripting ' + xssCheck;
    c += ' -CSRF ' + csrfProtection;
    c += ' -startURLAction BLOCK LOG STATS -denyURLAction BLOCK LOG STATS\n\n';
    c += 'add appfw policy ' + policyName + ' true ' + profileName + '\n\n';
    if (bindVs) c += 'bind lb vserver ' + bindVs + ' -policyName ' + policyName + ' -type REQUEST -priority 100\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show appfw profile ' + profileName + '\n# show appfw policy ' + policyName + '\n';
    return c;
}

// ── Citrix ADC: SSL Certificate Binding ──────────────────────────────────────
CitrixADC.sslcert = {
    label: 'SSL Certificate',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-certificate',
                title: 'SSL Certificate (Citrix ADC)',
                desc: 'Sertifika yükleme ve vServer\'a bağlama — <code>add ssl certKey app-cert -cert /nsconfig/ssl/app.crt -key /nsconfig/ssl/app.key</code>.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'SSL CertKey',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'certkey_name', why: "CertKey adı vServer bind ve SNI tanımlarında kullanılır; aynı isim tekrar kullanılırsa mevcut sertifika ezilir ve üretimdeki servis aniden farklı bir sertifika sunmaya başlar.", label: 'CertKey Adı', type: 'text', required: true, placeholder: 'app-certkey', hint: 'Sertifika tanımlayıcı adı — vServer bind için kullanılır' },
                        { name: 'cert_file', why: "Dosya ADC üzerinde <code>/nsconfig/ssl/</code> altında bulunmalı; yol yanlışsa komut dosyayı okuyamaz ve başarısız olur. Sertifika PEM formatında değilse import reddedilir.", label: 'Sertifika Dosya Yolu', type: 'text', required: true, placeholder: '/nsconfig/ssl/app.crt', hint: 'ADC filesystem üzerindeki .crt dosyası' },
                        { name: 'key_file', why: "Key sertifikayla eşleşmezse handshake kurulamaz ve vServer DOWN kalır. Key parola korumalıysa <code>-passcrypt</code> verilmediğinde ADC yeniden başlatıldığında sertifika yüklenemez ve servis açılmaz.", label: 'Key Dosya Yolu', type: 'text', required: true, placeholder: '/nsconfig/ssl/app.key', hint: 'ADC filesystem üzerindeki .key dosyası' }
                    ]
                },
                {
                    title: 'vServer Bağlama',
                    icon: 'fas fa-link',
                    info: 'Opsiyonel: sertifikayı mevcut bir SSL vServer\'a bağla. SNI domain belirtilirse multi-domain SSL aktif olur.',
                    fields: [
                        { name: 'vs_name', why: "Sertifika bir SSL vServer'a bind edilmeden hiçbir işe yaramaz; bind edilmemiş SSL vServer sürekli DOWN kalır ve istemciler bağlantı hatası alır.", label: 'LB vServer Adı', type: 'text', required: true, placeholder: 'vs-app-ssl', hint: 'Sertifikanın bağlanacağı SSL vServer' },
                        { name: 'sni_domain', why: "Aynı IP üzerinde çoklu domain barındırılıyorsa SNI domain belirtilmediğinde istemciler varsayılan sertifikayı alır ve isim uyuşmazlığı uyarısı görür. SNI bind için vServer üzerinde SNI özelliğinin açık olması gerekir.", label: 'SNI Domain', type: 'text', optional: true, placeholder: 'app.example.com', hint: 'Multi-domain SSL için SNI domain adı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsSslCertGen(data);
        });
    }
};
function cgNsSslCertGen(data) {
    const certkeyName = cgEsc(data.certkey_name || '');
    const certFile = cgEsc(data.cert_file || '');
    const keyFile = cgEsc(data.key_file || '');
    const vsName = cgEsc(data.vs_name || '');
    const sniDomain = cgEsc(data.sni_domain || '');
    let c = '# ========================================\n# Citrix ADC — SSL Certificate Binding\n# ========================================\n\n';
    c += 'add ssl certKey ' + certkeyName + ' -cert "' + certFile + '" -key "' + keyFile + '"\n\n';
    if (vsName) {
        c += 'bind ssl vserver ' + vsName + ' -certkeyName ' + certkeyName + '\n';
        if (sniDomain) {
            c += 'bind ssl vserver ' + vsName + ' -certkeyName ' + certkeyName + ' -SNICert -domainName "' + sniDomain + '"\n';
        }
        c += '\n';
    }
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show ssl certKey ' + certkeyName + '\n';
    if (vsName) c += '# show ssl vserver ' + vsName + '\n';
    return c;
}

// ── Citrix ADC: SNIP + IP Config ─────────────────────────────────────────────
CitrixADC.snip = {
    label: 'SNIP + IP Config',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'SNIP + IP Config (Citrix ADC)',
                desc: 'Subnet IP (SNIP) tanımlama — <code>add ns ip 10.0.0.50 255.255.255.0 -type SNIP</code>. Backend sunuculara çıkış IP\'si olarak kullanılır.'
            },
            sections: [
                {
                    title: 'SNIP Konfigürasyonu',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'snip_ip', why: "SNIP backend'e giden trafiğin kaynak adresidir; tanımlı SNIP yoksa ADC NSIP'i kullanır ve yönetim trafiği ile uygulama trafiği karışır. <b>USNIP</b> modunda sunucu istemci IP'sini göremez; <b>USIP</b> modunda görür ama sunucunun default gateway'i ADC olmak zorundadır, aksi halde dönüş trafiği asimetrik olur.", label: 'SNIP IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Backend trafiği için kaynak IP' },
                        { name: 'mask', why: "Maske yanlışsa ADC backend subnet'ini yerel saymaz ve trafiği default route'a gönderir; bu da zaman aşımı ve asimetrik yönlendirme üretir.", label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0' },
                        { name: 'vlan_id', why: "SNIP bir VLAN'a bağlanmazsa ADC hangi arayüzden çıkacağını yalnızca route tablosuna göre seçer; çok VLAN'lı ortamda bu yanlış arayüzden ARP yapılmasına ve trafiğin kaybolmasına yol açar.", label: 'VLAN ID', type: 'text', validate: 'vlan', optional: true, placeholder: '100', hint: 'Bu SNIP\'i belirli bir VLAN\'a bağla' },
                        { name: 'mgmt', why: "Mgmt access açık bir SNIP, yönetim arayüzünü uygulama ağına açar ve saldırı yüzeyini büyütür. Kapalıyken bu adres üzerinden SSH/GUI erişimi yapılamaz; sorun giderme için ayrı bir yönetim adresi hazır olmalıdır.", label: 'Mgmt Access', type: 'select', options: [
                            { value: 'DISABLED', label: 'DISABLED', selected: true },
                            { value: 'ENABLED', label: 'ENABLED' }
                        ], hint: 'Bu IP üzerinden yönetim erişimi' },
                        { name: 'dynamic_routing', why: "Dinamik yönlendirme açık olan SNIP, ADC'nin OSPF/BGP komşuluğu kuracağı adrestir; yanlış adreste açılırsa komşuluk hiç kurulmaz veya istenmeyen rotalar duyurulur. HA çiftinde yalnızca aktif node duyuru yapar.", label: 'Dynamic Routing', type: 'select', options: [
                            { value: 'DISABLED', label: 'DISABLED', selected: true },
                            { value: 'ENABLED', label: 'ENABLED' }
                        ], hint: 'Bu SNIP için dinamik routing (OSPF/BGP) etkinleştir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsSnipGen(data);
        });
    }
};
function cgNsSnipGen(data) {
    const snipIp = cgEsc(data.snip_ip || '');
    const mask = cgEsc(data.mask || '');
    const vlanId = cgEsc(data.vlan_id || '');
    const mgmt = cgEsc(data.mgmt || 'DISABLED');
    const dynamicRouting = cgEsc(data.dynamic_routing || 'DISABLED');
    let c = '# ========================================\n# Citrix ADC — SNIP + IP Config\n# ========================================\n\n';
    c += 'add ns ip ' + snipIp + ' ' + mask + ' -type SNIP -mgmtAccess ' + mgmt + ' -dynamicRouting ' + dynamicRouting + '\n\n';
    if (vlanId) {
        c += 'bind vlan ' + vlanId + ' -IPAddress ' + snipIp + ' ' + mask + '\n\n';
    }
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show ns ip ' + snipIp + '\n';
    if (vlanId) c += '# show vlan ' + vlanId + '\n';
    return c;
}

// ── Citrix ADC: VLAN ──────────────────────────────────────────────────────────
CitrixADC.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'VLAN (Citrix ADC)',
                desc: 'VLAN tanımlama ve interface bağlama — <code>add vlan 200</code> + <code>bind vlan 200 -ifnum 1/1 -tagged</code>. Opsiyonel IP bağlama.'
            },
            sections: [
                {
                    title: 'VLAN Tanımı',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan_id', why: "VLAN ID üst switch'teki tag ile birebir aynı olmalı; uyuşmazlıkta arayüz UP görünür ama hiç paket geçmez ve sorun boşuna fiziksel katmanda aranır. 1-4094 aralığı dışındaki değerler reddedilir.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '200', hint: '1-4094 arası VLAN numarası' },
                        { name: 'interfaces', why: "Arayüz yanlış seçilirse trafik hiç gelmez. Yönetim arayüzünü yanlışlıkla bir VLAN'a tagged eklemek ADC'ye erişimi tamamen koparabilir; bu yüzden değişiklik öncesi konsol erişimi hazır olmalıdır.", label: 'Interface\'ler', type: 'text', required: true, placeholder: '1/1,1/2', hint: 'Virgülle ayrılmış interface listesi (örn: 1/1,1/2)' },
                        { name: 'tagged', why: "Tagged bağlantıda karşı switch portu da trunk olmalı; untagged seçilirse arayüz yalnızca tek VLAN taşıyabilir ve diğer VLAN trafiği düşer. Bu ayarın yanlış olması en sık görülen <b>her şey UP ama trafik yok</b> senaryosudur.", label: 'Etiketleme', type: 'select', options: [
                            { value: 'yes', label: 'Tagged (802.1Q)', selected: true },
                            { value: 'no', label: 'Untagged (access)' }
                        ]}
                    ]
                },
                {
                    title: 'IP Bağlama',
                    icon: 'fas fa-globe',
                    info: 'Opsiyonel: bu VLAN\'a bir NSIP/SNIP bağlamak için doldur.',
                    fields: [
                        { name: 'ip', why: "VLAN'a IP bağlanmazsa ADC bu VLAN'daki sunuculara katman 3 seviyesinde erişemez ve o gruptaki tüm monitor'lar DOWN kalır.", label: 'IP Adresi', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.200.1' },
                        { name: 'mask', why: "Maske yanlışsa ADC komşu sunucuları uzak sayar ve trafiği gateway'e gönderir; sunucular yanıt verse bile oturum kurulamaz ve sorun yönlendirme yerine uygulamada aranır.", label: 'Subnet Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.0' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsVlanGen(data);
        });
    }
};
function cgNsVlanGen(data) {
    const vlanId = cgEsc(data.vlan_id || '');
    const tagged = cgEsc(data.tagged || 'yes');
    const ip = cgEsc(data.ip || '');
    const mask = cgEsc(data.mask || '');
    const intfs = (data.interfaces || '').split(',').map(s => cgEsc(s.trim())).filter(Boolean);
    let c = '# ========================================\n# Citrix ADC — VLAN\n# ========================================\n\n';
    c += 'add vlan ' + vlanId + '\n';
    intfs.forEach(intf => {
        c += 'bind vlan ' + vlanId + ' -ifnum ' + intf;
        if (tagged === 'yes') c += ' -tagged';
        c += '\n';
    });
    if (ip && mask) {
        c += 'bind vlan ' + vlanId + ' -IPAddress ' + ip + ' ' + mask + '\n';
    }
    c += '\nsave config\n\n';
    c += '# Doğrulama:\n# show vlan ' + vlanId + '\n# show interface\n';
    return c;
}

// ── Citrix ADC: Extended ACL ──────────────────────────────────────────────────
CitrixADC.acl = {
    label: 'ACL Extended',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-list-alt',
                title: 'Extended ACL (Citrix ADC)',
                desc: 'Ağ erişim kontrol listesi — <code>add ns acl ACL-BLOCK DENY -srcIP = 0.0.0.0 -srcMask 0.0.0.0</code>. Sonraki adımda <code>apply ns acls</code> çalıştırılmalı.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'ACL Tanımı',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', why: "ACL adı güncelleme ve silme komutlarında kullanılır. ACL'ler tanımlandıktan sonra <code>apply ns acls</code> çalıştırılmazsa hiç devreye girmez; ayrıca <code>save ns config</code> yapılmazsa reboot'ta kaybolur.", label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL-BLOCK-EXTERNAL', hint: 'Büyük harf + tire konvansiyonu önerilir' },
                        { name: 'priority', why: "ACL'ler öncelik sırasına göre değerlendirilir ve ilk eşleşen kural uygulanır; geniş bir DENY kuralı düşük numarayla üstte kalırsa altındaki ALLOW kuralları hiç çalışmaz ve yönetim erişimi dahil her şey kesilir.", label: 'Priority', type: 'text', required: true, placeholder: '100', hint: 'Düşük sayı = yüksek öncelik' },
                        { name: 'action', why: "DENY uygulanırken yönetim adresleri hariç tutulmazsa cihaza uzaktan erişim tamamen kaybedilir ve yalnızca konsol ile kurtarılabilir. ALLOW kuralları genelde daha yüksek öncelikle (düşük numara) üstte tanımlanır.", label: 'Aksiyon', type: 'select', options: [
                            { value: 'DENY', label: 'DENY — Engelle', selected: true },
                            { value: 'ALLOW', label: 'ALLOW — İzin ver' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'src_ip', why: "Kaynak IP <code>0.0.0.0</code> verilirse kural tüm kaynakları kapsar; bu bir DENY kuralında cihazı erişilemez hale getirebilir. Kural yazmadan önce mevcut yönetim oturumunun hangi kaynaktan geldiği mutlaka kontrol edilmelidir.", label: 'Kaynak IP', type: 'text', validate: 'ip', required: true, placeholder: '10.128.10.0', hint: 'Eşleşecek kaynak ağ (0.0.0.0 tümü demektir — dikkat)' },
                        { name: 'src_mask', why: "Maske kuralın kaç adresi kapsadığını belirler; yanlış maske beklenenden çok daha geniş bir aralığı kapsar ve istenmeyen trafiği sessizce engeller.", label: 'Kaynak Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0', hint: 'Wildcard mask formatı' }
                    ]
                },
                {
                    title: 'Hedef',
                    icon: 'fas fa-crosshairs',
                    info: 'Hedef IP ve port bilgileri opsiyoneldir. Boş bırakılırsa tüm hedeflere uygulanır.',
                    fields: [
                        { name: 'dst_ip', why: "Hedef IP boş bırakılırsa kural tüm hedefleri kapsar; VIP'ler ve NSIP de dahil olur. Belirli bir servisi korumak isterken tüm cihazı kilitlememek için hedef daraltılmalıdır.", label: 'Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.0' },
                        { name: 'dst_mask', why: "Hedef maske kuralın kapsamını belirler; <code>255.255.0.0</code> gibi geniş bir maske komşu sistemleri de kapsayıp beklenmedik kesintiler yaratır.", label: 'Hedef Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.0.0' },
                        { name: 'protocol', why: "Protokol seçilmezse kural TCP, UDP ve ICMP dahil her şeye uygulanır. ICMP'yi kapatmak sorun gidermeyi ve path MTU keşfini bozar, bu da büyük paketlerde açıklanamayan takılmalara yol açar.", label: 'Protokol', type: 'select', options: [
                            { value: 'TCP', label: 'TCP', selected: true },
                            { value: 'UDP', label: 'UDP' },
                            { value: 'ANY', label: 'ANY' }
                        ]},
                        { name: 'dst_port', why: "Port boş bırakılırsa kural tüm portları kapsar ve yönetim portları (22, 80, 443) ile HA/GSLB portları (3008-3011) da engellenebilir. Bu portlar kapanırsa küme sessizce bozulur ve failover çalışmaz.", label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '80', hint: 'Boş bırakılırsa tüm portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNsAclGen(data);
        });
    }
};
function cgNsAclGen(data) {
    const aclName = cgEsc(data.acl_name || '');
    const priority = cgEsc(data.priority || '');
    const action = cgEsc(data.action || 'DENY');
    const srcIp = cgEsc(data.src_ip || '');
    const srcMask = cgEsc(data.src_mask || '');
    const dstIp = cgEsc(data.dst_ip || '');
    const dstMask = cgEsc(data.dst_mask || '');
    const protocol = cgEsc(data.protocol || 'TCP');
    const dstPort = cgEsc(data.dst_port || '');
    let c = '# ========================================\n# Citrix ADC — Extended ACL\n# ========================================\n\n';
    c += 'add ns acl ' + aclName + ' ' + action;
    c += ' -srcIP = ' + srcIp + ' -srcMask ' + srcMask;
    if (dstIp && dstMask) c += ' -destIP = ' + dstIp + ' -destMask ' + dstMask;
    c += ' -protocol ' + protocol;
    if (dstPort) c += ' -destPort ' + dstPort;
    c += ' -priority ' + priority + '\n\n';
    c += 'apply ns acls\n\n';
    c += 'save config\n\n';
    c += '# Doğrulama:\n# show ns acl ' + aclName + '\n# show ns acl stats\n';
    return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// Citrix ADC (NetScaler) — cihaz temeli araçları (2026-09 ekleri)
// Canlı envanterde Citrix yok; sözdizimi yalnız resmi ADC CLI Command Reference'tan
// (https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ — her aracın başında sayfa yolu).
// ══════════════════════════════════════════════════════════════════════════════

// ── Citrix ADC: Sistem Temeli (hostname / NTP / DNS / syslog / NSIP erişimi) ─
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ns/ns-hostname
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ntp/ntp-server
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ntp/ntp-sync
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/dns/dns-nameserver
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/audit/audit-syslogaction (-serverPort, -logLevel, -transport, -timeZone)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/audit/audit-syslogpolicy
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/audit/audit-syslogglobal (örnek: bind audit syslogGlobal -policyname pol9 -priority 9)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ns/ns-ip (-gui SECUREONLY, -telnet, -ftp)
CitrixADC.sysbase = {
    label: 'Sistem Temeli (NTP/DNS/Syslog)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cogs',
                title: 'Sistem Temeli (Citrix ADC)',
                desc: 'Yeni ADC\'nin ilk yapılandırması: hostname, NTP, DNS, uzak syslog ve NSIP üzerinde güvensiz yönetim servislerinin kapatılması.<br>Örnek: <code>add ntp server 192.0.2.123</code> + <code>enable ntp sync</code>'
            },
            sections: [
                {
                    title: 'Kimlik & Zaman',
                    icon: 'fas fa-clock',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', validate: 'hostname', placeholder: 'adc1', hint: 'Boşsa değiştirilmez' },
                        { name: 'ntp1', label: 'NTP Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.123', why: "HA çiftinde saat farkı log korelasyonunu bozar; SAML/OAuth gibi zaman damgalı kimlik doğrulama akışları birkaç dakikalık kaymada reddedilir." },
                        { name: 'ntp2', label: 'NTP Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.124' }
                    ]
                },
                {
                    title: 'DNS',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'dns1', label: 'DNS Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.53', why: "Domain tabanlı sunucular, FQDN'li syslog/LDAP sunucuları ve GSLB DNS çözümlemesi olmadan çalışmaz." },
                        { name: 'dns2', label: 'DNS Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.54' }
                    ]
                },
                {
                    title: 'Uzak Syslog',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'sl_host', label: 'Syslog Sunucusu', type: 'text', validate: 'ip', placeholder: '192.0.2.50', hint: 'Boşsa syslog yazılmaz', why: "ADC yerel logları /var/log altında döner ve silinir; yönetici girişleri ve config değişiklikleri ancak uzak kopyada kalır." },
                        { name: 'sl_port', label: 'Port', type: 'text', validate: 'port', placeholder: '514', hint: 'Boşsa 514' },
                        { name: 'sl_level', label: 'Log Seviyesi', type: 'select', options: [
                            { value: 'ALL', label: 'ALL', selected: true },
                            { value: 'EMERGENCY ALERT CRITICAL ERROR WARNING NOTICE', label: 'NOTICE ve üstü' },
                            { value: 'EMERGENCY ALERT CRITICAL ERROR WARNING', label: 'WARNING ve üstü' }
                        ], why: "ALL, DEBUG dahil her şeyi gönderir; yoğun sistemde SIEM lisansını hızla tüketir. WARNING ve üstü ise oturum açma gibi bilgi olaylarını kaçırır." },
                        { name: 'sl_proto', label: 'Taşıma', type: 'select', options: [
                            { value: 'UDP', label: 'UDP', selected: true },
                            { value: 'TCP', label: 'TCP' }
                        ] },
                        { name: 'sl_tz', label: 'Zaman damgasında yerel saat (LOCAL_TIME)', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'NSIP Yönetim Servisleri',
                    icon: 'fas fa-user-lock',
                    fields: [
                        { name: 'nsip', label: 'NSIP', type: 'text', validate: 'ip', placeholder: '192.0.2.5', hint: 'Boşsa yazılmaz', why: "Telnet ve FTP parolaları düz metin taşır; HTTP GUI de öyle. NSIP'te bunları kapatıp GUI'yi yalnız HTTPS'e (SECUREONLY) almak temel sertleştirmedir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hostname = cgEsc(data.hostname || '');
            const ntp = [data.ntp1, data.ntp2].map(v => cgEsc(v || '')).filter(Boolean);
            const dns = [data.dns1, data.dns2].map(v => cgEsc(v || '')).filter(Boolean);
            const slHost = cgEsc(data.sl_host || ''), slPort = cgEsc(data.sl_port || '');
            const slLevel = cgEsc(data.sl_level || 'ALL'), slProto = cgEsc(data.sl_proto || 'UDP');
            const nsip = cgEsc(data.nsip || '');
            let c = '# ========================================\n# Citrix ADC — Sistem Temeli\n# ========================================\n\n';
            if (hostname) c += 'set ns hostName ' + hostname + '\n\n';
            c += '# NTP\n';
            ntp.forEach(ip => { c += 'add ntp server ' + ip + '\n'; });
            c += 'enable ntp sync\n\n';
            c += '# DNS\n';
            dns.forEach(ip => { c += 'add dns nameServer ' + ip + '\n'; });
            if (slHost) {
                c += '\n# Uzak syslog\n';
                c += 'add audit syslogAction SYSLOG_ACT ' + slHost;
                if (slPort) c += ' -serverPort ' + slPort;
                c += ' -logLevel ' + slLevel + ' -transport ' + slProto;
                if (data.sl_tz) c += ' -timeZone LOCAL_TIME';
                c += '\n';
                c += 'add audit syslogPolicy SYSLOG_POL true SYSLOG_ACT\n';
                c += 'bind audit syslogGlobal -policyName SYSLOG_POL -priority 100\n';
            }
            if (nsip) {
                c += '\n# NSIP: yalnız HTTPS GUI, telnet/FTP kapalı\n';
                c += 'set ns ip ' + nsip + ' -gui SECUREONLY -telnet DISABLED -ftp DISABLED\n';
            }
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show ntp server\n# show ntp sync\n# show dns nameServer\n';
            if (slHost) c += '# show audit syslogAction SYSLOG_ACT\n# show audit syslogGlobal\n';
            if (nsip) c += '# show ns ip ' + nsip + '\n';
            return c;
        });
    }
};

// ── Citrix ADC: SNMP (v3 / v2c) ───────────────────────────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-view (-type included|excluded)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-group (noAuthNoPriv|authNoPriv|authPriv, -readViewName)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-user (-authType MD5|SHA|SHA256|SHA512, -privType DES|AES|AES192|AES256)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-manager (örnek: add snmp manager 192.168.2.16 -netmask 255.255.255.240)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-trap (add/bind snmp trap, -version V2|V3, -communityName, -destPort)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/snmp/snmp-community (GET|GET_NEXT|GET_BULK|SET|ALL)
CitrixADC.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP (Citrix ADC)',
                desc: 'İzleme için SNMP: izinli yönetici (manager), v3 view/group/user veya v2c community ve trap hedefi.<br>Örnek: <code>add snmp user snmpmon -group GRP_RO -authType SHA -authPasswd ... -privType AES -privPasswd ...</code>'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'authPriv', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-unlock', desc: 'Düz metin community', badge: { text: 'Eski', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'İzinli Yönetici (Manager)',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'mgr', label: 'NMS Adresi / Ağı', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.20', why: "Hiç manager tanımlı değilse ADC her adresten gelen SNMP sorgusuna cevap verir. Manager listesi sorguları yalnız izleme sunucularına daraltır." },
                        { name: 'mgr_mask', label: 'Ağ Maskesi', type: 'text', validate: 'netmask', placeholder: '255.255.255.240', hint: 'Boşsa tek adres' }
                    ]
                },
                {
                    title: 'SNMPv3',
                    icon: 'fas fa-user-shield',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', label: 'Kullanıcı Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'snmpmon' },
                        { name: 'v3_auth', label: 'Auth Tipi', type: 'select', options: [
                            { value: 'SHA', label: 'SHA', selected: true },
                            { value: 'SHA256', label: 'SHA256 (yeni sürümler)' },
                            { value: 'SHA512', label: 'SHA512 (yeni sürümler)' },
                            { value: 'MD5', label: 'MD5 (zayıf)' }
                        ], why: "SHA256/SHA512 yalnız güncel sürümlerde vardır; NMS de aynı algoritmayı desteklemelidir, aksi halde tüm sorgular zaman aşımına düşer." },
                        { name: 'v3_auth_pw', label: 'Auth Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'Ornek-AuthPass-01', hint: '8-64 karakter' },
                        { name: 'v3_priv', label: 'Şifreleme Tipi', type: 'select', options: [
                            { value: 'AES', label: 'AES', selected: true },
                            { value: 'AES256', label: 'AES256 (yeni sürümler)' },
                            { value: 'DES', label: 'DES (zayıf)' }
                        ] },
                        { name: 'v3_priv_pw', label: 'Şifreleme Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'Ornek-PrivPass-01' }
                    ]
                },
                {
                    title: 'SNMPv2c',
                    icon: 'fas fa-users',
                    showFor: ['v2c'],
                    warn: 'v2c community düz metin gider; yalnız ayrık yönetim ağında kullanın. <code>SET</code> / <code>ALL</code> yazma yetkisi içerir.',
                    fields: [
                        { name: 'v2_comm', label: 'Community', type: 'text', requiredIf: { field: '_cgtype', in: ['v2c'] }, placeholder: 'Ornek-RO-Topluluk', hint: '"public" kullanmayın' },
                        { name: 'v2_perm', label: 'Yetki', type: 'select', options: [
                            { value: 'GET_BULK', label: 'GET_BULK', selected: true },
                            { value: 'GET', label: 'GET' },
                            { value: 'GET_NEXT', label: 'GET_NEXT' },
                            { value: 'ALL', label: 'ALL (SET dahil)' }
                        ] }
                    ]
                },
                {
                    title: 'Trap',
                    icon: 'fas fa-bell',
                    fields: [
                        { name: 'trap_host', label: 'Trap Alıcısı', type: 'text', validate: 'ip', placeholder: '192.0.2.20', hint: 'Boşsa trap yazılmaz' },
                        { name: 'trap_port', label: 'Trap Portu', type: 'text', validate: 'port', placeholder: '162', hint: 'Boşsa 162' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const v3 = data._cgtype !== 'v2c';
            const mgr = cgEsc(data.mgr || ''), mask = cgEsc(data.mgr_mask || '');
            const user = cgEsc(data.v3_user || ''), auth = cgEsc(data.v3_auth || 'SHA'), authPw = cgEsc(data.v3_auth_pw || '');
            const priv = cgEsc(data.v3_priv || 'AES'), privPw = cgEsc(data.v3_priv_pw || '');
            const comm = cgEsc(data.v2_comm || ''), perm = cgEsc(data.v2_perm || 'GET_BULK');
            const trap = cgEsc(data.trap_host || ''), tport = cgEsc(data.trap_port || '');
            let c = '# ========================================\n# Citrix ADC — SNMP ' + (v3 ? 'v3' : 'v2c') + '\n# ========================================\n\n';
            c += 'add snmp manager ' + mgr + (mask ? ' -netmask ' + mask : '') + '\n\n';
            if (v3) {
                if (auth === 'MD5' || priv === 'DES') c += '# UYARI: MD5/DES zayıf kabul edilir — SHA/AES tercih edin.\n';
                c += 'add snmp view VIEW_RO 1.3.6.1 -type included\n';
                c += 'add snmp group GRP_RO authPriv -readViewName VIEW_RO\n';
                c += 'add snmp user ' + user + ' -group GRP_RO -authType ' + auth + ' -authPasswd ' + authPw + ' -privType ' + priv + ' -privPasswd ' + privPw + '\n';
                if (trap) {
                    c += '\nadd snmp trap specific ' + trap + ' -version V3' + (tport ? ' -destPort ' + tport : '') + '\n';
                    c += 'bind snmp trap specific ' + trap + ' -version V3 -userName ' + user + ' -securityLevel authPriv\n';
                }
            } else {
                if (perm === 'ALL') c += '# UYARI: ALL yetkisi SET (yazma) içerir.\n';
                c += 'add snmp community ' + comm + ' ' + perm + '\n';
                if (trap) c += '\nadd snmp trap specific ' + trap + ' -version V2' + (tport ? ' -destPort ' + tport : '') + ' -communityName ' + comm + '\n';
            }
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show snmp manager\n# show snmp ' + (v3 ? 'user' : 'community') + '\n';
            if (trap) c += '# show snmp trap\n';
            return c;
        });
    }
};

// ── Citrix ADC: Sistem Kullanıcısı & Komut Politikası ─────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/system/system-user (add / bind system user <user> <policy> <priority>)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/system/system-cmdpolicy (ALLOW|DENY, cmdSpec regex; yerleşik: operator, read-only, network, superuser)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/system/system-parameter (-strongpassword enableall|enablelocal|disabled, -minpasswordlen, -timeout)
CitrixADC.sysuser = {
    label: 'Sistem Kullanıcısı & Komut Politikası',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-cog',
                title: 'Sistem Kullanıcısı, Komut Politikası, Parola Kuralları',
                desc: 'nsroot yerine kişiye özel yönetim hesabı, en az yetkili komut politikası (cmdPolicy) ve sistem geneli parola kuralları.<br>Örnek: <code>bind system user netops1 read-only 100</code>'
            },
            sections: [
                {
                    title: 'Kullanıcı',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netops1', why: "Paylaşılan nsroot hesabıyla yapılan değişikliğin sahibi audit log'da görülemez; nsroot yalnız acil durum (break-glass) için saklanmalıdır." },
                        { name: 'password', label: 'Parola', type: 'text', required: true, placeholder: 'Ornek-Parola-2026', hint: 'strongpassword açıksa büyük/küçük harf, rakam, özel karakter' },
                        { name: 'ext_auth', label: 'Dış Kimlik Doğrulama', type: 'select', options: [
                            { value: 'ENABLED', label: 'ENABLED — önce LDAP/RADIUS/TACACS (varsayılan)', selected: true },
                            { value: 'DISABLED', label: 'DISABLED — yalnız yerel parola (break-glass hesabı)' }
                        ], why: "Acil durum hesabında DISABLED seçilir: AAA sunucusu çöktüğünde bu hesap dış sunucuya sorulmadan yerel parolayla girer." },
                        { name: 'timeout', label: 'CLI Boşta Kalma (sn)', type: 'text', min: 300, max: 86400, placeholder: '900', hint: 'Opsiyonel' },
                        { name: 'maxsess', label: 'En Fazla Oturum', type: 'text', min: 1, max: 40, placeholder: '5', hint: 'Opsiyonel' }
                    ]
                },
                {
                    title: 'Komut Politikası',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'pol', label: 'Politika', type: 'select', options: [
                            { value: 'read-only', label: 'read-only (yerleşik)', selected: true },
                            { value: 'operator', label: 'operator (yerleşik)' },
                            { value: 'network', label: 'network (yerleşik)' },
                            { value: 'superuser', label: 'superuser (yerleşik — tam yetki)' },
                            { value: 'custom', label: 'Özel cmdPolicy oluştur' }
                        ], why: "Kullanıcıya hiç politika bağlanmazsa hiçbir komut çalıştıramaz; superuser ise nsroot ile eşdeğerdir. En az yetki ilkesiyle read-only veya operator ile başlayın." },
                        { name: 'cp_name', label: 'Özel Politika Adı', type: 'text', requiredIf: { field: 'pol', in: ['custom'] }, placeholder: 'CMD_LB_OPS' },
                        { name: 'cp_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'ALLOW', label: 'ALLOW', selected: true },
                            { value: 'DENY', label: 'DENY' }
                        ] },
                        { name: 'cp_spec', label: 'Komut Regex (cmdSpec)', type: 'text', requiredIf: { field: 'pol', in: ['custom'] }, placeholder: '(^show\\s+lb\\s+.*)|(^(enable|disable)\\s+server\\s+.*)', hint: 'Eşleşen komutlar' },
                        { name: 'prio', label: 'Öncelik', type: 'text', min: 0, max: 999999999, placeholder: '100', hint: 'Boşsa 100' }
                    ]
                },
                {
                    title: 'Sistem Parola Kuralları',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'strong', label: 'Güçlü Parola', type: 'select', options: [
                            { value: 'enableall', label: 'enableall — tüm kullanıcılar', selected: true },
                            { value: 'enablelocal', label: 'enablelocal — yalnız yerel kullanıcılar' },
                            { value: 'keep', label: 'Değiştirme' }
                        ], why: "enableall açıldıktan sonra mevcut zayıf parolalar değişmez ama yenileri kurala uymak zorundadır; otomasyon hesaplarının parola güncellemeleri kırılabilir." },
                        { name: 'minlen', label: 'Minimum Uzunluk', type: 'text', min: 8, max: 127, placeholder: '12', hint: 'strongpassword açıkken en az 8' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const user = cgEsc(data.user || ''), pw = cgEsc(data.password || ''), ext = cgEsc(data.ext_auth || 'ENABLED');
            const to = cgEsc(data.timeout || ''), ms = cgEsc(data.maxsess || '');
            const polSel = cgEsc(data.pol || 'read-only'), custom = polSel === 'custom';
            const pol = custom ? cgEsc(data.cp_name || '') : polSel;
            const prio = cgEsc(data.prio || '') || '100';
            const strong = cgEsc(data.strong || 'enableall'), minlen = cgEsc(data.minlen || '');
            let c = '# ========================================\n# Citrix ADC — Sistem Kullanıcısı & Komut Politikası\n# ========================================\n\n';
            if (strong !== 'keep' || minlen) {
                c += 'set system parameter';
                if (strong !== 'keep') c += ' -strongpassword ' + strong;
                if (minlen) c += ' -minpasswordlen ' + minlen;
                c += '\n\n';
            }
            if (custom) c += 'add system cmdPolicy ' + pol + ' ' + cgEsc(data.cp_action || 'ALLOW') + ' "' + cgEsc(data.cp_spec || '') + '"\n';
            c += 'add system user ' + user + ' ' + pw + ' -externalAuth ' + ext;
            if (to) c += ' -timeout ' + to;
            if (ms) c += ' -maxsession ' + ms;
            c += '\n';
            if (polSel === 'superuser') c += '# UYARI: superuser nsroot ile eşdeğer tam yetkidir.\n';
            c += 'bind system user ' + user + ' ' + pol + ' ' + prio + '\n';
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show system user ' + user + '\n';
            if (custom) c += '# show system cmdPolicy ' + pol + '\n';
            return c;
        });
    }
};

// ── Citrix ADC: Yönetim Kimlik Doğrulama (LDAP / RADIUS / TACACS+) ───────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/authentication/authentication-ldapaction
//            (-serverIP, -serverPort, -ldapBase, -ldapBindDn, -ldapBindDnPassword, -ldapLoginName, -groupAttrName, -subAttributeName, -secType, -validateServerCert, -ldapHostname)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/authentication/authentication-radiusaction (örnek: -serverIP .. -radKey ..)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/authentication/authentication-tacacsaction (-tacacsSecret, -authorization, -accounting, -auditFailedCmds)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/authentication/authentication-policy (add authentication Policy <n> -rule <r> -action <a>)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/system/system-global (bind system global <policy> -priority <n>)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/system/system-group (bind system group <g> -policyName <p> <priority>)
CitrixADC.extauth = {
    label: 'Yönetim Kimlik Doğrulama (LDAP/RADIUS/TACACS+)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-id-badge',
                title: 'Yönetim Kimlik Doğrulama (Citrix ADC)',
                desc: 'ADC yönetim girişlerini (GUI/CLI) merkezi dizine bağlar: action → advanced authentication policy → <code>bind system global</code>. Uygulama kullanıcıları için <b>AAA-TM</b> aracını kullanın.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            configTypes: [
                { id: 'ldap', label: 'LDAP / AD', icon: 'fas fa-address-book', desc: 'LDAPS + grup eşleme', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'radius', label: 'RADIUS', icon: 'fas fa-broadcast-tower', desc: 'NPS / ISE' },
                { id: 'tacacs', label: 'TACACS+', icon: 'fas fa-terminal', desc: 'Komut yetkilendirme + accounting' }
            ],
            sections: [
                {
                    title: 'Sunucu',
                    icon: 'fas fa-server',
                    warn: 'Bağlamadan önce yerel break-glass hesabınızın (externalAuth DISABLED) çalıştığını doğrulayın ve açık bir nsroot oturumu bırakın.',
                    fields: [
                        { name: 'act', label: 'Action Adı', type: 'text', required: true, placeholder: 'ACT_MGMT_AUTH' },
                        { name: 'srv', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.30' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', placeholder: '636', hint: 'Boşsa LDAPS 636 / RADIUS 1812 / TACACS+ 49' },
                        { name: 'secret', label: 'Paylaşılan Anahtar', type: 'text', requiredIf: { field: '_cgtype', in: ['radius', 'tacacs'] }, placeholder: 'Ornek-Paylasimli-Anahtar', hint: 'RADIUS radKey / TACACS+ tacacsSecret' }
                    ]
                },
                {
                    title: 'LDAP',
                    icon: 'fas fa-address-book',
                    showFor: ['ldap'],
                    fields: [
                        { name: 'base', label: 'Base DN', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'dc=example,dc=com' },
                        { name: 'bind_dn', label: 'Bind DN', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'cn=svc-adc,ou=svc,dc=example,dc=com' },
                        { name: 'bind_pw', label: 'Bind Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'Ornek-Bind-Parola' },
                        { name: 'login_attr', label: 'Login Attribute', type: 'select', options: [
                            { value: 'sAMAccountName', label: 'sAMAccountName (AD)', selected: true },
                            { value: 'uid', label: 'uid (OpenLDAP)' }
                        ] },
                        { name: 'sec', label: 'Güvenlik', type: 'select', options: [
                            { value: 'SSL', label: 'SSL (LDAPS)', selected: true },
                            { value: 'TLS', label: 'TLS (StartTLS)' },
                            { value: 'PLAINTEXT', label: 'PLAINTEXT (şifresiz)' }
                        ], why: "PLAINTEXT'te yönetici parolaları ağda düz metin geçer." },
                        { name: 'validate', label: 'Sunucu sertifikasını doğrula (-validateServerCert YES)', type: 'checkbox', checked: true, why: "Doğrulama yoksa ağdaki sahte LDAP sunucusu yönetici parolalarını toplayabilir." },
                        { name: 'ldap_host', label: 'LDAP Sunucu Adı (sertifikadaki)', type: 'text', validate: 'hostname', requiredIf: { field: 'validate', checked: true }, placeholder: 'dc1.example.com', hint: 'Sertifika CN/SAN ile aynı olmalı' }
                    ]
                },
                {
                    title: 'Yetki Eşleme',
                    icon: 'fas fa-user-tag',
                    fields: [
                        { name: 'grp', label: 'Dizin/AAA Grup Adı', type: 'text', placeholder: 'ADC-Admins', hint: 'Boşsa grup eşleme yazılmaz; LDAP\'ta memberOf CN değeri' },
                        { name: 'grp_pol', label: 'Gruba Verilecek Politika', type: 'select', options: [
                            { value: 'read-only', label: 'read-only', selected: true },
                            { value: 'operator', label: 'operator' },
                            { value: 'network', label: 'network' },
                            { value: 'superuser', label: 'superuser' }
                        ], why: "Grup eşlemesi yoksa dışarıdan doğrulanan kullanıcı hiçbir komut politikası almaz ve giriş yapsa da komut çalıştıramaz." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'ldap';
            const act = cgEsc(data.act || ''), srv = cgEsc(data.srv || ''), port = cgEsc(data.port || '');
            const secret = cgEsc(data.secret || ''), grp = cgEsc(data.grp || ''), grpPol = cgEsc(data.grp_pol || 'read-only');
            let c = '# ========================================\n# Citrix ADC — Yönetim Kimlik Doğrulama (' + t.toUpperCase() + ')\n# ========================================\n\n';
            if (t === 'ldap') {
                const sec = cgEsc(data.sec || 'SSL');
                const host = cgEsc(data.ldap_host || '');
                if (sec === 'PLAINTEXT') c += '# UYARI: PLAINTEXT — yönetici parolaları ağda düz metin geçer.\n';
                c += 'add authentication ldapAction ' + act + ' -serverIP ' + srv + ' -serverPort ' + (port || (sec === 'SSL' ? '636' : '389'));
                c += ' -ldapBase "' + cgEsc(data.base || '') + '" -ldapBindDn "' + cgEsc(data.bind_dn || '') + '" -ldapBindDnPassword ' + cgEsc(data.bind_pw || '');
                c += ' -ldapLoginName ' + cgEsc(data.login_attr || 'sAMAccountName') + ' -groupAttrName memberOf -subAttributeName cn -secType ' + sec;
                if (sec !== 'PLAINTEXT' && data.validate && host) c += ' -validateServerCert YES -ldapHostname ' + host;
                c += '\n';
                if (sec !== 'PLAINTEXT' && !data.validate) c += '# UYARI: sunucu sertifikası doğrulanmıyor.\n';
            } else if (t === 'radius') {
                c += 'add authentication radiusAction ' + act + ' -serverIP ' + srv + (port ? ' -serverPort ' + port : '') + ' -radKey ' + secret + '\n';
            } else {
                c += 'add authentication tacacsAction ' + act + ' -serverIP ' + srv + (port ? ' -serverPort ' + port : '') + ' -tacacsSecret ' + secret + ' -authorization ON -accounting ON -auditFailedCmds ON\n';
            }
            c += 'add authentication Policy POL_' + act + ' -rule true -action ' + act + '\n';
            c += 'bind system global POL_' + act + ' -priority 100\n';
            if (grp) {
                c += '\nadd system group ' + grp + '\n';
                c += 'bind system group ' + grp + ' -policyName ' + grpPol + ' 100\n';
                if (grpPol === 'superuser') c += '# UYARI: superuser tam yetkidir; grubu yalnız yöneticilerle sınırlayın.\n';
            }
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show system global\n# show authentication Policy POL_' + act + '\n';
            if (grp) c += '# show system group ' + grp + '\n';
            return c;
        });
    }
};

// ── Citrix ADC: Static Route ─────────────────────────────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/network/route
//            (add route <ağ> <maske> <gateway>; -distance, -cost, -advertise, -msr/-monitor, -td)
CitrixADC.route = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route (Citrix ADC)',
                desc: 'ADC yönlendirme tablosuna statik rota ekler; SNIP üzerinden arka uç veya istemci ağlarına ulaşım.<br>Örnek: <code>add route 10.64.0.0 255.255.0.0 192.0.2.1</code>'
            },
            sections: [
                {
                    title: 'Rota',
                    icon: 'fas fa-share',
                    fields: [
                        { name: 'net', label: 'Hedef Ağ', type: 'text', validate: 'ip', required: true, placeholder: '10.64.0.0', hint: 'Default için 0.0.0.0' },
                        { name: 'mask', label: 'Maske', type: 'text', validate: 'netmask', required: true, placeholder: '255.255.0.0', hint: 'Default için 0.0.0.0' },
                        { name: 'gw', label: 'Gateway', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.1', why: "Gateway bir SNIP ile aynı subnet'te olmalı; aksi halde rota eklenir ama ARP çözülemez ve trafik düşer." },
                        { name: 'distance', label: 'Administrative Distance', type: 'text', min: 1, max: 255, placeholder: '1', hint: 'Opsiyonel' },
                        { name: 'cost', label: 'Cost', type: 'text', min: 0, max: 65535, placeholder: '0', hint: 'Opsiyonel' },
                        { name: 'td', label: 'Traffic Domain', type: 'text', min: 0, max: 4094, placeholder: '10', hint: 'Opsiyonel' },
                        { name: 'mon', label: 'Rota Monitörü (ARP/PING)', type: 'text', placeholder: 'ping', hint: 'Opsiyonel; -msr ENABLED ile', why: "Monitörsüz statik rota, gateway ölse bile tabloda kalır ve trafik kara deliğe gider; MSR gateway düşünce rotayı pasife alır." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const net = cgEsc(data.net || ''), mask = cgEsc(data.mask || ''), gw = cgEsc(data.gw || '');
            const dist = cgEsc(data.distance || ''), cost = cgEsc(data.cost || ''), td = cgEsc(data.td || ''), mon = cgEsc(data.mon || '');
            let c = '# ========================================\n# Citrix ADC — Static Route\n# ========================================\n\n';
            c += 'add route ' + net + ' ' + mask + ' ' + gw;
            if (td) c += ' -td ' + td;
            if (dist) c += ' -distance ' + dist;
            if (cost) c += ' -cost ' + cost;
            if (mon) c += ' -msr ENABLED -monitor ' + mon;
            c += '\n\nsave ns config\n\n';
            c += '# Doğrulama:\n# show route\n';
            return c;
        });
    }
};

// ── Citrix ADC: SSL Profile (TLS 1.2+ / Cipher Group) ────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ssl/ssl-profile
//            (-sslProfileType FrontEnd|BackEnd, -ssl3/-tls1/-tls11/-tls12/-tls13, -denySSLReneg, -HSTS, -maxage, -IncludeSubdomains;
//             bind ssl profile -cipherName / -eccCurveName P_256|P_384|X_25519)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ssl/ssl-cipher (add ssl cipher, bind ssl cipher <grp> -cipherName <c>)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ssl/ssl-parameter (-defaultProfile)
//            https://docs.netscaler.com/en-us/citrix-adc/current-release/ssl/tls13-protocol-support.html (set ssl vserver/service -sslProfile)
//            Şifre adları: https://www.carlstalhood.com/ssl-virtual-servers-citrix-adc-13/ (TLS1.3-AES256-GCM-SHA384, TLS1.2-ECDHE-RSA-AES128-GCM-SHA256 ...)
CitrixADC.sslprofile = {
    label: 'SSL Profile (TLS1.2+)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'SSL Profile — TLS 1.2+ ve Güçlü Cipher Group',
                desc: 'SSLv3/TLS 1.0/1.1 kapalı, yalnız ECDHE-GCM (+TLS 1.3) şifreleri içeren bir cipher group ve bunu kullanan SSL profili. Profil vServer\'a (FrontEnd) veya SSL service\'e (BackEnd) bağlanır.',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Profil',
                    icon: 'fas fa-id-card',
                    warn: 'SSL profilleri <code>set ssl parameter -defaultProfile ENABLED</code> gerektirir. Bu ayar mevcut tüm SSL vServer\'ları varsayılan profillere taşır ve kolayca geri alınamaz — bakım penceresinde uygulayın.',
                    fields: [
                        { name: 'prof', label: 'Profil Adı', type: 'text', required: true, placeholder: 'SSLPROF_FE_STRICT' },
                        { name: 'ptype', label: 'Tip', type: 'select', options: [
                            { value: 'FrontEnd', label: 'FrontEnd — istemci tarafı', selected: true },
                            { value: 'BackEnd', label: 'BackEnd — sunucu tarafı' }
                        ] },
                        { name: 'tls13', label: 'TLS 1.3\'ü aç', type: 'checkbox', checked: true },
                        { name: 'reneg', label: 'Renegotiation', type: 'select', options: [
                            { value: 'ALL', label: 'ALL — tümünü reddet (varsayılan)', selected: true },
                            { value: 'NONSECURE', label: 'NONSECURE — yalnız RFC 5746 destekleyenlere izin' },
                            { value: 'FRONTEND_CLIENT', label: 'FRONTEND_CLIENT' }
                        ], why: "İstemci kaynaklı renegotiation CPU tüketme (DoS) saldırısına imkan verir; istemci sertifikası isteyen politika tabanlı kimlik doğrulama yoksa ALL güvenlidir." },
                        { name: 'set_default', label: 'set ssl parameter -defaultProfile ENABLED satırını ekle', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Cipher Group',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'cg', label: 'Cipher Group Adı', type: 'text', required: true, placeholder: 'CG_TLS12_13_STRONG', why: "Yerleşik DEFAULT grubu CBC ve RSA anahtar değişimli eski şifreleri de içerir; SSL Labs/PCI taramalarında zayıf şifre bulgusu üretir." },
                        { name: 'ecdsa', label: 'ECDSA sertifika şifrelerini de ekle', type: 'checkbox', checked: true, hint: 'Sertifika RSA ise zararsız' }
                    ]
                },
                {
                    title: 'FrontEnd Ek Ayarlar',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'hsts', label: 'HSTS başlığı gönder', type: 'checkbox', checked: true, why: "HSTS tarayıcıya siteye yalnız HTTPS ile gelmesini söyler; SSL stripping saldırısını engeller. Site HTTP'ye geri dönecekse açmayın — tarayıcılar max-age boyunca HTTP'yi reddeder." },
                        { name: 'maxage', label: 'HSTS max-age (sn)', type: 'text', min: 1, max: 4294967294, placeholder: '31536000', hint: 'Boşsa 31536000 (1 yıl)' },
                        { name: 'subdom', label: 'includeSubDomains', type: 'checkbox', checked: false },
                        { name: 'curves', label: 'ECC eğrilerini sınırla (X_25519, P_256, P_384)', type: 'checkbox', checked: true },
                        { name: 'target', label: 'Bağlanacak SSL vServer / Service', type: 'text', placeholder: 'VS_APP_HTTPS', hint: 'FrontEnd: vServer adı, BackEnd: SSL service adı; boşsa bağlanmaz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const prof = cgEsc(data.prof || ''), ptype = cgEsc(data.ptype || 'FrontEnd'), fe = ptype === 'FrontEnd';
            const reneg = cgEsc(data.reneg || 'ALL'), cg = cgEsc(data.cg || '');
            const maxage = cgEsc(data.maxage || '') || '31536000', target = cgEsc(data.target || '');
            const ciphers = [];
            if (data.tls13) ciphers.push('TLS1.3-AES256-GCM-SHA384', 'TLS1.3-AES128-GCM-SHA256', 'TLS1.3-CHACHA20-POLY1305-SHA256');
            if (data.ecdsa) ciphers.push('TLS1.2-ECDHE-ECDSA-AES256-GCM-SHA384', 'TLS1.2-ECDHE-ECDSA-AES128-GCM-SHA256');
            ciphers.push('TLS1.2-ECDHE-RSA-AES256-GCM-SHA384', 'TLS1.2-ECDHE-RSA-AES128-GCM-SHA256');
            let c = '# ========================================\n# Citrix ADC — SSL Profile (' + ptype + ')\n# ========================================\n\n';
            if (data.set_default) c += '# UYARI: aşağıdaki satır tüm SSL vServer\'ları varsayılan profillere taşır (geri dönüşü zor).\nset ssl parameter -defaultProfile ENABLED\n\n';
            else c += '# NOT: -defaultProfile kapalıysa profil bağlama başarısız olur; önce "show ssl parameter" ile kontrol edin.\n\n';
            c += 'add ssl cipher ' + cg + '\n';
            ciphers.forEach(n => { c += 'bind ssl cipher ' + cg + ' -cipherName ' + n + '\n'; });
            c += '\nadd ssl profile ' + prof + ' -sslProfileType ' + ptype + ' -ssl3 DISABLED -tls1 DISABLED -tls11 DISABLED -tls12 ENABLED -tls13 ' + (data.tls13 ? 'ENABLED' : 'DISABLED');
            c += ' -denySSLReneg ' + reneg;
            if (fe && data.hsts) c += ' -HSTS ENABLED -maxage ' + maxage + (data.subdom ? ' -IncludeSubdomains YES' : '');
            c += '\n';
            c += 'bind ssl profile ' + prof + ' -cipherName ' + cg + '\n';
            c += 'unbind ssl profile ' + prof + ' -cipherName ' + (fe ? 'DEFAULT' : 'DEFAULT_BACKEND') + '\n';
            if (fe && data.curves) ['X_25519', 'P_256', 'P_384'].forEach(e => { c += 'bind ssl profile ' + prof + ' -eccCurveName ' + e + '\n'; });
            if (target) c += '\nset ssl ' + (fe ? 'vserver ' : 'service ') + target + ' -sslProfile ' + prof + '\n';
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show ssl profile ' + prof + '\n# show ssl cipher ' + cg + '\n';
            if (target) c += '# show ssl ' + (fe ? 'vserver ' : 'service ') + target + '\n';
            return c;
        });
    }
};

// ── Citrix ADC: HTTP Profile ─────────────────────────────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ns/ns-httpprofile
//            (-dropInvalReqs, -markHttp09Inval, -markConnReqInval, -markTraceReqInval, -markRfc7230NonCompliantInval, -http2, -webSocket, -maxReq, -reqTimeout, -reqTimeoutAction)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/lb/lb-vserver (set lb vserver -httpProfileName)
CitrixADC.httpprofile = {
    label: 'HTTP Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-code',
                title: 'HTTP Profile (Citrix ADC)',
                desc: 'Geçersiz / eski HTTP isteklerini düşüren, HTTP/2 ve istek zaman aşımını yöneten HTTP profili; LB vServer\'a bağlanır.<br>Örnek: <code>add ns httpProfile HTTP_STRICT -dropInvalReqs ENABLED -markHttp09Inval ENABLED</code>'
            },
            sections: [
                {
                    title: 'Profil',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'HTTP_STRICT' },
                        { name: 'drop_inval', label: 'Geçersiz istekleri düşür (dropInvalReqs)', type: 'checkbox', checked: true, why: "Varsayılan DISABLED: bozuk başlıklı istekler arka uca iletilir; HTTP request smuggling saldırıları tam bu tutarsızlıktan yararlanır." },
                        { name: 'm09', label: 'HTTP/0.9 geçersiz say', type: 'checkbox', checked: true },
                        { name: 'mconn', label: 'CONNECT isteklerini geçersiz say', type: 'checkbox', checked: true, why: "Ters proxy (reverse proxy) rolündeki bir vServer'da CONNECT'e izin vermek ADC'yi açık proxy olarak kullandırabilir." },
                        { name: 'mtrace', label: 'TRACE isteklerini geçersiz say', type: 'checkbox', checked: true },
                        { name: 'm7230', label: 'RFC 7230 uyumsuz istekleri geçersiz say', type: 'checkbox', checked: false, why: "Request smuggling'e karşı en sıkı ayardır; ancak standart dışı istemci/uygulamaları kırabilir — önce test ortamında deneyin." }
                    ]
                },
                {
                    title: 'Protokol & Zaman Aşımı',
                    icon: 'fas fa-stopwatch',
                    fields: [
                        { name: 'h2', label: 'HTTP/2', type: 'checkbox', checked: false },
                        { name: 'ws', label: 'WebSocket', type: 'checkbox', checked: false },
                        { name: 'maxreq', label: 'Bağlantı Başına En Fazla İstek', type: 'text', min: 0, max: 65534, placeholder: '1000', hint: 'Opsiyonel; 0 = sınırsız' },
                        { name: 'reqto', label: 'İstek Tamamlama Süresi (sn)', type: 'text', min: 0, max: 86400, placeholder: '30', hint: 'Opsiyonel; yavaş (slowloris) istekleri keser' },
                        { name: 'reqto_act', label: 'Süre Aşımında', type: 'select', options: [
                            { value: 'RESET', label: 'RESET', selected: true },
                            { value: 'DROP', label: 'DROP' }
                        ] },
                        { name: 'vs', label: 'Bağlanacak LB vServer', type: 'text', placeholder: 'VS_APP_HTTPS', hint: 'Boşsa bağlanmaz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const name = cgEsc(data.name || ''), maxreq = cgEsc(data.maxreq || ''), reqto = cgEsc(data.reqto || '');
            const act = cgEsc(data.reqto_act || 'RESET'), vs = cgEsc(data.vs || '');
            const on = (b, p) => (b ? ' ' + p + ' ENABLED' : '');
            let c = '# ========================================\n# Citrix ADC — HTTP Profile\n# ========================================\n\n';
            c += 'add ns httpProfile ' + name;
            c += on(data.drop_inval, '-dropInvalReqs') + on(data.m09, '-markHttp09Inval') + on(data.mconn, '-markConnReqInval');
            c += on(data.mtrace, '-markTraceReqInval') + on(data.m7230, '-markRfc7230NonCompliantInval');
            c += on(data.h2, '-http2') + on(data.ws, '-webSocket');
            if (maxreq) c += ' -maxReq ' + maxreq;
            if (reqto) c += ' -reqTimeout ' + reqto + ' -reqTimeoutAction ' + act;
            c += '\n';
            if (!data.drop_inval && (data.m09 || data.mconn || data.mtrace || data.m7230)) c += '# NOT: dropInvalReqs kapalı — geçersiz işaretlenen istekler düşürülmez, yalnız L7 işlenmez.\n';
            if (vs) c += 'set lb vserver ' + vs + ' -httpProfileName ' + name + '\n';
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show ns httpProfile ' + name + '\n';
            if (vs) c += '# show lb vserver ' + vs + '\n';
            return c;
        });
    }
};

// ── Citrix ADC: Surge Protection / Service Group Limitleri ───────────────────
// Sözdizimi: https://docs.netscaler.com/en-us/citrix-adc/current-release/security/surge-protection/ns-sp-disble-re-enblesp-prot-tsk.html (enable ns feature SurgeProtection)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/ns/ns-spparams (-baseThreshold, -throttle Aggressive|Normal|Relaxed)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/basic/servicegroup
//            (set serviceGroup -sp ON|OFF | -maxClient | -maxReq — synopsis'te '|' ile ayrıldığı için her biri ayrı satır)
CitrixADC.surge = {
    label: 'Surge Protection / Bağlantı Limiti',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-water',
                title: 'Surge Protection & Service Group Limitleri',
                desc: 'Ani trafik artışında arka uç sunuculara açılan bağlantıları kuyruğa alır (Surge Protection) ve service group başına eşzamanlı bağlantı/istek sınırı koyar.<br>Örnek: <code>set serviceGroup SG_APP_HTTP -maxClient 1000</code>'
            },
            sections: [
                {
                    title: 'Service Group',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'sg', label: 'Service Group Adı', type: 'text', required: true, placeholder: 'SG_APP_HTTP' },
                        { name: 'maxclient', label: 'En Fazla Eşzamanlı Bağlantı', type: 'text', validate: 'posint', placeholder: '1000', hint: '-maxClient; boşsa yazılmaz', why: "Sınır aşıldığında yeni istekler kuyruğa girer veya reddedilir; değer tüm üyelerin toplam kapasitesinden düşük seçilmeli, aksi halde sunucular önce çöker." },
                        { name: 'maxreq', label: 'Kalıcı Bağlantı Başına İstek', type: 'text', min: 1, max: 65535, placeholder: '100', hint: '-maxReq; boşsa yazılmaz' }
                    ]
                },
                {
                    title: 'Surge Protection',
                    icon: 'fas fa-water',
                    fields: [
                        { name: 'sp', label: 'Surge Protection uygula', type: 'checkbox', checked: true, why: "SP, sunucunun yanıt süresi uzadıkça yeni bağlantı açmayı yavaşlatır ve istekleri ADC'de bekletir; ani yükte arka ucun tamamen çökmesini önler." },
                        { name: 'base', label: 'Taban Eşik (bağlantı)', type: 'text', min: 1, max: 32767, placeholder: '200', hint: 'Sistem geneli -baseThreshold; boşsa değiştirilmez' },
                        { name: 'throttle', label: 'Throttle', type: 'select', options: [
                            { value: 'Normal', label: 'Normal (varsayılan)', selected: true },
                            { value: 'Aggressive', label: 'Aggressive' },
                            { value: 'Relaxed', label: 'Relaxed' }
                        ] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sg = cgEsc(data.sg || ''), mc = cgEsc(data.maxclient || ''), mr = cgEsc(data.maxreq || '');
            const base = cgEsc(data.base || ''), thr = cgEsc(data.throttle || 'Normal');
            let c = '# ========================================\n# Citrix ADC — Surge Protection / Service Group Limitleri\n# ========================================\n\n';
            if (data.sp) {
                c += 'enable ns feature SurgeProtection\n';
                c += 'set ns spParams' + (base ? ' -baseThreshold ' + base : '') + ' -throttle ' + thr + '\n';
                c += 'set serviceGroup ' + sg + ' -sp ON\n';
            }
            if (mc) c += 'set serviceGroup ' + sg + ' -maxClient ' + mc + '\n';
            if (mr) c += 'set serviceGroup ' + sg + ' -maxReq ' + mr + '\n';
            if (!data.sp && !mc && !mr) c += '# UYARI: ne Surge Protection ne limit seçildi — değişiklik yok.\n';
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show serviceGroup ' + sg + '\n';
            if (data.sp) c += '# show ns spParams\n';
            return c;
        });
    }
};

// ── Citrix ADC: Pattern Set / String Map ─────────────────────────────────────
// Sözdizimi: https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/policy/policy-patset (örnek: bind policy patset pat1 bar -index 2)
//            https://developer-docs.netscaler.com/en-us/adc-command-reference-int/current-release/policy/policy-stringmap (örnek: bind stringmap custom_stringmap "key-string" "value-string")
CitrixADC.patset = {
    label: 'Pattern Set / String Map',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-list-ul',
                title: 'AppExpert Pattern Set / String Map',
                desc: 'Responder, rewrite ve CS politikalarının ifadelerinde kullanılan metin listeleri (pattern set) ve anahtar→değer tabloları (string map). Uzun <code>||</code> zincirleri yerine tek liste.'
            },
            configTypes: [
                { id: 'patset', label: 'Pattern Set', icon: 'fas fa-list', desc: 'Metin listesi', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'stringmap', label: 'String Map', icon: 'fas fa-exchange-alt', desc: 'Anahtar → değer' }
            ],
            sections: [
                {
                    title: 'Liste',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'name', label: 'Ad', type: 'text', required: true, placeholder: 'PS_BLOCKED_PATHS' },
                        { name: 'entries', label: 'Kayıtlar (satır başına bir)', type: 'textarea', required: true, placeholder: '/admin', hint: 'Pattern set: metin. String map: <code>anahtar = değer</code>', why: "Liste içeriği politika değiştirilmeden güncellenebilir; aynı listeyi birden çok politika paylaşır. Pattern set eşleşmeleri varsayılan olarak büyük/küçük harf duyarlıdır — ifadede IGNORECASE kullanın." },
                        { name: 'comment', label: 'Açıklama', type: 'text', placeholder: 'Engellenen yonetim yollari' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const sm = data._cgtype === 'stringmap';
            const name = cgEsc(data.name || ''), comment = cgEsc(data.comment || '');
            const lines = String(data.entries || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            let c = '# ========================================\n# Citrix ADC — ' + (sm ? 'String Map' : 'Pattern Set') + '\n# ========================================\n\n';
            c += 'add policy ' + (sm ? 'stringmap ' : 'patset ') + name + (comment ? ' -comment "' + comment + '"' : '') + '\n';
            let skipped = 0;
            lines.forEach(l => {
                if (l.indexOf('"') >= 0) { skipped++; return; }
                if (sm) {
                    const i = l.indexOf('=');
                    const k = i >= 0 ? cgEsc(l.slice(0, i).trim()) : '', v = i >= 0 ? cgEsc(l.slice(i + 1).trim()) : '';
                    if (!k || !v) { skipped++; return; }
                    c += 'bind policy stringmap ' + name + ' "' + k + '" "' + v + '"\n';
                } else {
                    c += 'bind policy patset ' + name + ' "' + cgEsc(l) + '"\n';
                }
            });
            if (skipped) c += '# UYARI: ' + skipped + ' satır atlandı (' + (sm ? '"anahtar = değer" biçiminde değil veya ' : '') + 'çift tırnak içeriyor).\n';
            c += '\nsave ns config\n\n';
            c += '# Doğrulama:\n# show policy ' + (sm ? 'stringmap ' : 'patset ') + name + '\n';
            return c;
        });
    }
};
