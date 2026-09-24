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
                        { name: 'cert_key', why: "CertKey <code>add ssl certKey</code> ile önceden tanımlanmış olmalı; yoksa bind komutu başarısız olur ve SSL vServer sertifikasız kaldığı için DOWN durumunda kalır. Ara CA zinciri ayrıca <code>link</code> edilmezse mobil istemciler güven hatası alır.", label: 'SSL CertKey Adı', type: 'text', optional: true, placeholder: 'MY_CERTKEY', hint: 'add ssl certKey komutuyla önceden tanımlanmış olmalı' }
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
    const proto = cgEsc(data.proto || 'SSL');
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
    if (persist !== 'NONE') c += ' -persistenceType ' + persist;
    c += '\n\n';
    c += 'add serviceGroup ' + sgName + ' HTTP -cip ENABLED X-Forwarded-For\n\n';
    c += 'add server SRV_' + s1.replace(/\./g, '_') + ' ' + s1 + '\n';
    c += 'bind serviceGroup ' + sgName + ' SRV_' + s1.replace(/\./g, '_') + ' ' + s1p + '\n';
    if (s2) {
        c += 'add server SRV_' + s2.replace(/\./g, '_') + ' ' + s2 + '\n';
        c += 'bind serviceGroup ' + sgName + ' SRV_' + s2.replace(/\./g, '_') + ' ' + (s2p || s1p) + '\n';
    }
    c += '\nbind lb vserver ' + vsName + ' ' + sgName + '\n\n';
    if (proto === 'SSL' && certKey) {
        c += '# SSL sertifika bağla\nbind ssl vserver ' + vsName + ' -certkeyName ' + certKey + '\n';
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
                        { name: 'sg_name', why: "Monitor bir ServiceGroup'a bind edilmediği sürece yalnızca tanım olarak durur; koruduğu sanılan ama hiç çalışmayan monitor en sık yapılan hatadır.", label: 'ServiceGroup Adı', type: 'text', optional: true, placeholder: 'SG_APP_HTTP', hint: 'Monitörü bu ServiceGroup\'a bağla' }
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
                        { name: 'redirect_url', why: "Hedef URL şema ile birlikte tam verilmelidir; <code>https://</code> unutulursa tarayıcı adresi göreli sanar. Hedef aynı vServer'a çözümleniyorsa istemci sonsuz yönlendirme (ERR_TOO_MANY_REDIRECTS) alır.", label: 'Redirect URL', type: 'text', optional: true, placeholder: 'https://www.example.com', hint: 'HTTP 301 ile yönlendirilecek hedef URL' }
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
    const actionType = cgEsc(data.action_type || 'redirect');
    const redirectUrl = cgEsc(data.redirect_url || '');
    const matchExpr = cgEsc(data.match_expr || '');
    const bindVs = cgEsc(data.bind_vs || '');
    const actName = polName + '_ACT';
    let c = '# ========================================\n# Citrix ADC — Responder Policy\n# ========================================\n\n';
    if (actionType === 'redirect') {
        c += 'add responder action ' + actName + ' redirect "\\\"' + redirectUrl + '\\\"" -responseStatusCode 301\n\n';
    } else {
        c += 'add responder action ' + actName + ' DROP\n\n';
    }
    c += 'add responder policy ' + polName + ' \'' + matchExpr + '\' ' + actName + '\n\n';
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
    c += 'bind lb vserver ' + vsName + ' -policyName NOPOLICY -priority 100\n';
    c += 'bind ssl vserver ' + vsName + ' -certkeyName ' + certName + '\n';
    c += 'set ssl vserver ' + vsName + ' -sslProfile ' + cipherGroup + ' -SNIEnable ' + sni + '\n\n';
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
                        { name: 'rate', why: "Eşik çok düşük tutulursa meşru kullanıcılar ve sağlık kontrolleri engellenir; çok yüksek tutulursa brute force ve scraping trafiği rahatça geçer. Değer gerçek trafik profili ölçülerek belirlenmelidir.", label: 'Rate (istek sayısı)', type: 'text', required: true, placeholder: '100', hint: 'Zaman dilimindeki maksimum istek sayısı' },
                        { name: 'per_seconds', why: "Zaman penceresi kısa olursa ani ama meşru trafik dalgalanmaları (sayfa başına çoklu istek) yanlışlıkla limitlenir. ADC bu değeri milisaniyeye çevirir; çok geniş pencereler bellek tüketimini artırır.", label: 'Süre (saniye)', type: 'text', required: true, placeholder: '60', hint: 'Ölçüm penceresi (saniye) — milisaniyeye çevrilir' },
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
    const timeSliceMs = String(parseInt(perSeconds, 10) * 1000);
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
                        { name: 'domain', why: "Domain değeri kullanıcı adının nasıl biçimlendirileceğini (UPN veya sAMAccountName) etkiler; yanlış domain ile kullanıcı adları dizinde bulunamaz ve doğru parolayla bile giriş reddedilir.", label: 'Domain', type: 'text', required: true, placeholder: 'company.com', hint: 'Kimlik doğrulaması yapılacak domain' },
                        { name: 'session_timeout', why: "Oturum süresi çok kısaysa kullanıcılar iş ortasında yeniden giriş yapmak zorunda kalır; çok uzunsa terk edilmiş oturumlar açık kalır ve paylaşılan cihazlarda güvenlik riski oluşur. Idle timeout ile birlikte değerlendirilmelidir.", label: 'Session Timeout (sn)', type: 'text', optional: true, placeholder: '3600', hint: 'Oturum geçerlilik süresi saniye cinsinden' }
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
    const domain = cgEsc(data.domain || '');
    const sessionTimeout = cgEsc(data.session_timeout || '3600');
    let c = '# ========================================\n# Citrix ADC — AAA-TM\n# ========================================\n\n';
    c += 'add authentication ldapAction LDAP-' + vserverName + ' -serverIP ' + ldapServer + ' -serverPort 636';
    c += ' -ldapBase "' + ldapBase + '"';
    c += ' -ldapBindDn "CN=svc,' + ldapBase + '"';
    c += ' -ldapBindDnPassword CHANGEME -secType SSL -authentication ENABLED\n\n';
    c += 'add authentication ldapPolicy POL-LDAP-' + vserverName + ' NS_TRUE LDAP-' + vserverName + '\n\n';
    c += 'add authentication vserver ' + vserverName + ' SSL ' + ip + ' 443\n';
    c += 'bind authentication vserver ' + vserverName + ' -policy POL-LDAP-' + vserverName + ' -priority 100\n\n';
    c += '# Session timeout: ' + sessionTimeout + ' sn, Domain: ' + domain + '\n\n';
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
                        { name: 'bind_vs', why: "vServer'a bind edilmeyen WAF policy hiçbir isteği incelemez. SSL trafiği ADC üzerinde sonlandırılmıyorsa WAF şifreli içeriği göremez ve koruma sağlamaz.", label: 'Bağlanacak LB vServer', type: 'text', optional: true, placeholder: 'vs-app-https', hint: 'Boş bırakılırsa manuel bind gerekir' }
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
                        { name: 'vs_name', why: "Sertifika bir SSL vServer'a bind edilmeden hiçbir işe yaramaz; bind edilmemiş SSL vServer sürekli DOWN kalır ve istemciler bağlantı hatası alır.", label: 'LB vServer Adı', type: 'text', optional: true, placeholder: 'vs-app-ssl', hint: 'Sertifikanın bağlanacağı SSL vServer' },
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
                        { name: 'src_ip', why: "Kaynak IP <code>0.0.0.0</code> verilirse kural tüm kaynakları kapsar; bu bir DENY kuralında cihazı erişilemez hale getirebilir. Kural yazmadan önce mevcut yönetim oturumunun hangi kaynaktan geldiği mutlaka kontrol edilmelidir.", label: 'Kaynak IP', type: 'text', validate: 'ip', required: true, placeholder: '0.0.0.0', hint: 'Eşleşecek kaynak IP (0.0.0.0 = tümü)' },
                        { name: 'src_mask', why: "Maske kuralın kaç adresi kapsadığını belirler; yanlış maske beklenenden çok daha geniş bir aralığı kapsar ve istenmeyen trafiği sessizce engeller.", label: 'Kaynak Mask', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Wildcard mask formatı' }
                    ]
                },
                {
                    title: 'Hedef',
                    icon: 'fas fa-crosshairs',
                    info: 'Hedef IP ve port bilgileri opsiyoneldir. Boş bırakılırsa tüm hedeflere uygulanır.',
                    fields: [
                        { name: 'dst_ip', why: "Hedef IP boş bırakılırsa kural tüm hedefleri kapsar; VIP'ler ve NSIP de dahil olur. Belirli bir servisi korumak isterken tüm cihazı kilitlememek için hedef daraltılmalıdır.", label: 'Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.0' },
                        { name: 'dst_mask', why: "Hedef maske kuralın kapsamını belirler; <code>255.255.0.0</code> gibi geniş bir maske komşu sistemleri de kapsayıp beklenmedik kesintiler yaratır.", label: 'Hedef Mask', type: 'text', optional: true, placeholder: '255.255.0.0' },
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
