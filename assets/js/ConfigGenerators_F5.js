'use strict';

const F5LTM = {};

// ── F5 LTM: Virtual Server ────────────────────────────────────────────────────
F5LTM.vserver = {
    label: 'Virtual Server',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'Virtual Server',
                desc: 'F5 BIG-IP LTM üzerinde sanal sunucu oluşturur; trafik yönlendirme, SSL offload ve persistence ayarlarını tek komutla yapılandırır.'
            },
            sections: [
                {
                    title: 'Temel Ayarlar',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'vs_name', why: "Virtual server adı partition içinde benzersiz olmalı; aynı isim varsa tmsh <code>01020066: already exists</code> hatası verir. Ayrıca yapılan değişiklikler <code>tmsh save sys config</code> ile kaydedilmezse reboot sonrası kaybolur.", label: 'VS Adı', type: 'text', required: true, placeholder: 'VS_APP_HTTPS', hint: 'Virtual server için benzersiz bir isim girin.' },
                        { name: 'vip', why: "VIP adresi bir self IP ile aynı subnet içinde değilse BIG-IP bu adres için ARP cevabı üretmez ve istemci hiç bağlanamaz. Port yanlış yazılırsa VS listede sağlıklı görünür ama trafik hiçbir zaman ulaşmaz.", label: 'VIP (Destination IP:Port)', type: 'text', validate: 'host_port', required: true, placeholder: '10.1.1.100:443', hint: 'Dinlenecek IP adresi ve port numarası.' },
                        { name: 'pool_name', why: "Virtual server default pool olmadan trafiği hiçbir üyeye gönderemez; istemciye <b>Connection refused</b> veya reset döner. Pool üyeleri health monitor'dan geçmezse VS durumu offline'a düşer ve VIP yanıt vermez.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL_APP', hint: 'Trafiğin yönlendirileceği backend pool.' },
                        { name: 'vs_type', why: "Protokol tipi VS'ye hangi profillerin (http, client-ssl, tcp) bağlanacağını belirler. HTTP profili olmayan bir VS'de iRule içindeki <code>HTTP::header</code> komutları çalışmaz ve TCL runtime error üretir.", label: 'Protokol Tipi', type: 'select', options: [
                            { value: 'http', label: 'HTTP' },
                            { value: 'https', label: 'HTTPS (SSL Offload)' },
                            { value: 'tcp', label: 'TCP' }
                        ]}
                    ]
                },
                {
                    title: 'Gelişmiş Seçenekler',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'ssl_profile', why: "Client-SSL profili istemci ile BIG-IP arasındaki TLS'i sonlandırır; yoksa 443 trafiği şifreli geçer ve iRule, cookie persistence, WAF gibi katman 7 özellikleri tamamen devre dışı kalır. <b>Server-SSL</b> ile karıştırılmamalı: o backend bacağını şifreler.", label: 'SSL Client Profile', type: 'text', requiredIf: { field: 'vs_type', in: ['https'] }, placeholder: 'MY_CLIENT_SSL', hint: 'Yalnızca HTTPS türünde gereklidir.' },
                        { name: 'snat', why: "SNAT yoksa sunucu dönüş trafiğini BIG-IP'ye değil doğrudan gerçek istemciye gönderir; asimetrik routing oluşur ve oturum hiç kurulamaz. <b>Automap</b> en yakın self IP'yi kullanır, yoğun trafikte kaynak port tükenirse SNAT pool gerekir.", label: 'SNAT', type: 'select', options: [
                            { value: 'automap', label: 'Automap' },
                            { value: 'none', label: 'None' }
                        ]},
                        { name: 'irule', why: "iRule'lar VS üzerinde bağlanma sırasına göre çalışır; aynı olayı ele alan iki iRule varsa üstteki davranışı belirler. Her iRule TMM'de CPU maliyeti yaratır, basit yönlendirmeler için LTM policy tercih edilmelidir.", label: 'iRule', type: 'text', optional: true, placeholder: 'IRULE_XFORWARD', hint: 'Opsiyonel iRule adı.' },
                        { name: 'persist', why: "Persistence olmadan her istek farklı üyeye düşebilir ve sunucuda tutulan oturum kaybolur; kullanıcı sürekli login ekranına döner. Cookie persistence için VS'de HTTP profili şart, SSL sonlandırılmıyorsa source-addr kullanılmalıdır.", label: 'Persistence Profil', type: 'text', optional: true, placeholder: 'MY_COOKIE_PERSIST', hint: 'Oturum yapışkanlığı için persistence profili.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { vs_name, vip, pool_name, vs_type, ssl_profile, snat, irule, persist } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — Virtual Server\n# ========================================\n\n';
            c += 'tmsh create ltm virtual ' + vs_name + ' {\n';
            c += '    destination ' + vip + '\n';
            c += '    ip-protocol tcp\n';
            c += '    profiles add {\n        tcp { }\n';
            if (vs_type === 'http' || vs_type === 'https') c += '        http { }\n';
            if (vs_type === 'https' && ssl_profile) c += '        ' + ssl_profile + ' { context clientside }\n';
            if (vs_type === 'https' && !ssl_profile) c = '# UYARI: HTTPS seçili ama SSL Client Profile boş — TLS sonlandırılmaz, VS çalışmaz.\n' + c;
            c += '    }\n';
            c += '    pool ' + pool_name + '\n';
            if (persist) c += '    persist replace-all-with { ' + persist + ' { default yes } }\n';
            if (snat === 'automap') c += '    source-address-translation { type automap }\n';
            if (irule) c += '    rules { ' + irule + ' }\n';
            c += '}\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh show ltm virtual ' + vs_name + '\n# tmsh show ltm pool ' + pool_name + ' members\n# curl -v http://<VIP>/   (istemciden; refused / reset / zaman aşımı ayrımı için)\n';
            const w = [];
            if (persist && /cookie/i.test(persist) && vs_type !== 'http' && vs_type !== 'https') w.push('⛔ Cookie persistence HTTP profili ister; bu virtual server tipi HTTP profili eklemiyor. Tipi HTTP/HTTPS yapın ya da source_addr persistence kullanın (f5-07).');
            if (snat !== 'automap') w.push('⚠ SNAT kapalı: sunucuların varsayılan ağ geçidi BIG-IP (HA\'da floating self IP) değilse yanıtlar BIG-IP\'ye dönmez ve istemci zaman aşımı görür (f5-04, f5-10).');
            if (/source_addr/.test(persist || '')) w.push('ℹ Source address persistence: büyük bir NAT ya da proxy arkasındaki kullanıcılar tek IP\'den gelir ve hepsi aynı üyeye düşer; tarayıcı trafiğinde cookie persistence tercih edin (f5-07).');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 LTM: Pool ──────────────────────────────────────────────────────────────
F5LTM.pool = {
    label: 'Pool + Members',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-layer-group',
                title: 'Pool + Members',
                desc: 'Uygulama sunucularını bir pool altında toplar, yük dengeleme yöntemi ve sağlık monitörü tanımlar.'
            },
            sections: [
                {
                    title: 'Pool Ayarları',
                    icon: 'fas fa-database',
                    fields: [
                        { name: 'pool_name', why: "Pool adı virtual server, LTM policy ve iRule'larda referans edilir; sonradan değiştirilirse bağlı tüm nesnelerin referansı kopar ve trafik aniden düşer.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL_APP', hint: 'Havuz için benzersiz bir isim.' },
                        { name: 'lb_method', why: "Round-robin tüm sunucuları eşit kapasitede varsayar; farklı güçteki sunucularda <code>least-connections-member</code> veya ratio daha dengeli dağıtım verir. Yanlış yöntem bir üyenin aşırı yüklenip timeout vermesine yol açar.", label: 'LB Yöntemi', type: 'select', options: [
                            { value: 'round-robin', label: 'Round Robin' },
                            { value: 'least-connections-member', label: 'Least Connections' },
                            { value: 'ratio-member', label: 'Ratio' }
                        ]},
                        { name: 'monitor', why: "Monitor atanmayan pool üyeleri her zaman <b>available</b> kabul edilir; çökmüş sunucuya trafik gitmeye devam eder. Monitor tipi uygulamaya uymazsa (örneğin HTTPS servise tcp monitor) çalışmayan uygulama sağlıklı görünür.", label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Üyelerin sağlığını kontrol eden monitor.' },
                        { name: 'min_active', why: "Minimum aktif üye sayısının altına düşüldüğünde pool down işaretlenir ve VS trafiği keser; böylece yarım kapasiteyle hizmet vermek yerine yedek datacenter devreye alınabilir. Değer çok yüksek verilirse tek üye arızasında tüm servis kapanır.", label: 'Min Active Members', type: 'text', optional: true, placeholder: '1', hint: 'Minimum aktif üye sayısı; varsayılan 1.' }
                    ]
                },
                {
                    title: 'Pool Üyeleri',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'm1', why: "Üye portu backend uygulamanın gerçekten dinlediği port olmalı; 8080 dinleyen sunucuya 80 yazılırsa monitor sürekli down görür ve üye hiç trafik almaz. Aynı node farklı portlarla birden fazla pool'da üye olabilir.", label: 'Üye 1 (IP:Port)', type: 'text', required: true, placeholder: '10.1.2.10:8080' },
                        { name: 'm2', why: "İkinci üye olmadan pool tek noktadan arızaya açık kalır; bakım sırasında servis tamamen kesilir. Üyeyi geçici kapatmak için silmek yerine <code>disabled</code> veya <code>forced offline</code> kullanılmalıdır, böylece mevcut oturumlar düzgün tamamlanır.", label: 'Üye 2 (IP:Port)', type: 'text', optional: true, placeholder: '10.1.2.11:8080' },
                        { name: 'm3', why: "Üye sayısı arttıkça SNAT automap kullanan kurulumlarda kaynak port havuzu rahatlar ve tek üyeye yüklenme azalır. Kapasite planlamasında N+1 üye bulundurmak bakım penceresinde kesintisiz çalışma sağlar.", label: 'Üye 3 (IP:Port)', type: 'text', optional: true, placeholder: '10.1.2.12:8080' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { pool_name, lb_method, monitor, m1, m2, m3, min_active } = data;
            const members = [m1, m2, m3].filter(Boolean);
            const minActive = min_active || '1';
            let c = '# ========================================\n# F5 BIG-IP LTM — Pool + Members\n# ========================================\n\n';
            members.forEach(m => {
                const parts = m.split(':');
                c += 'tmsh create ltm node ' + parts[0] + ' { address ' + parts[0] + ' }\n';
            });
            c += '\ntmsh create ltm pool ' + pool_name + ' {\n';
            c += '    load-balancing-mode ' + lb_method + '\n';
            c += '    members add {\n';
            members.forEach(m => {
                const parts = m.split(':');
                c += '        ' + m + ' { address ' + parts[0] + ' }\n';
            });
            c += '    }\n';
            c += '    monitor ' + monitor + '\n';
            c += '    min-active-members ' + minActive + '\n}\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh show ltm pool ' + pool_name + ' members\n';
            const w = [];
            if (/icmp/.test(monitor || '')) w.push('⚠ Yalnız ICMP monitörü sunucunun ayakta olduğunu gösterir, uygulamanın çalıştığını değil: servis çökse ya da üye portu yanlış olsa bile üye yeşil kalır. Uygulamayı sınayan bir HTTP/TCP monitörü kullanın (f5-10).');
            if (!monitor || monitor === 'none') w.push('⚠ Monitör yok: üyeler "unknown" (mavi) görünür ve çökmüş sunucuya da trafik gider.');
            if (+minActive > 0) w.push('ℹ min-active-members yalnız üyelere priority-group verildiğinde anlam taşır (priority group activation): en yüksek gruptaki çalışan üye sayısı bu değerin altına düşerse alt grup devreye girer (f5-06).');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 LTM: Health Monitor ────────────────────────────────────────────────────
F5LTM.monitor = {
    label: 'Health Monitor',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'Health Monitor',
                desc: 'Sunucu üyelerinin erişilebilirliğini HTTP, HTTPS veya TCP protokolü üzerinden periyodik olarak denetleyen monitör oluşturur.'
            },
            sections: [
                {
                    title: 'Monitor Ayarları',
                    icon: 'fas fa-stethoscope',
                    fields: [
                        { name: 'mon_name', why: "Monitor adı pool ve üye seviyesinde referans edilir; aynı isimli farklı partition monitörleri karıştırılırsa beklenmedik sağlık sonuçları alınır ve hangi kontrolün çalıştığı anlaşılamaz.", label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Monitor için benzersiz bir isim.' },
                        { name: 'mon_type', why: "TCP monitor yalnızca 3-way handshake'i doğrular; uygulama 500 dönse bile sunucu sağlıklı görünür ve hatalı içerik servis edilmeye devam eder. HTTP/HTTPS monitor içerik doğrular; HTTPS servise http monitor bağlanırsa monitor kalıcı down kalır.", label: 'Tip', type: 'select', options: [
                            { value: 'http', label: 'HTTP' },
                            { value: 'https', label: 'HTTPS' },
                            { value: 'tcp', label: 'TCP' }
                        ]},
                        { name: 'interval', why: "Interval çok uzun olursa arızalı üye dakikalarca trafik almaya devam eder; çok kısa olursa backend sunucular monitor istekleriyle gereksiz yüklenir. Genel kural: <b>timeout = 3 x interval + 1</b>.", label: 'Interval (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Kontrol aralığı; varsayılan 5 saniye.' },
                        { name: 'timeout', why: "Timeout interval'dan küçük veya ona eşit verilirse monitor sağlıklı üyeleri bile flapping (sürekli up/down) yapar ve trafik dalgalanır. Önerilen oran <b>timeout = 3 x interval + 1</b>; yani 5 sn interval için 16 sn timeout.", label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '16', hint: 'Zaman aşımı; varsayılan 16 saniye.' }
                    ]
                },
                {
                    title: 'HTTP/HTTPS Kontrol',
                    icon: 'fas fa-code',
                    fields: [
                        { name: 'send', why: "Send string HTTP/1.1 ile yazıldıysa <code>Host:</code> başlığı zorunludur; yoksa sunucu 400 Bad Request döner ve tüm üyeler down işaretlenir. Satır sonları CRLF ile kapatılmazsa istek hiç tamamlanmaz ve monitor zaman aşımına uğrar.", label: 'Send String', type: 'text', optional: true, placeholder: 'GET /health HTTP/1.1\\r\\nHost: app.corp.com\\r\\n\\r\\n', hint: 'HTTP/HTTPS için gönderilecek istek.' },
                        { name: 'recv', why: "Receive string sunucu yanıtında birebir aranır; uygulama yanıtını değiştirdiğinde (örneğin 200 yerine 302) tüm pool aniden down olur. Sağlık sayfasına özel benzersiz bir metin seçmek yanlış pozitifleri azaltır.", label: 'Receive String', type: 'text', optional: true, placeholder: '200 OK', hint: 'Beklenen yanıt içeriği.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { mon_name, mon_type, interval, timeout, send, recv } = data;
            const intv = interval || '5', tout = timeout || '16';
            let c = '# ========================================\n# F5 BIG-IP LTM — Health Monitor\n# ========================================\n\n';
            c += 'tmsh create ltm monitor ' + mon_type + ' ' + mon_name + ' {\n';
            c += '    interval ' + intv + '\n';
            c += '    timeout ' + tout + '\n';
            if (send) c += '    send "' + String(send).replace(/"/g, '') + '"\n';
            if (recv) c += '    recv "' + String(recv).replace(/"/g, '') + '"\n';
            c += '}\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list ltm monitor ' + mon_type + ' ' + mon_name + '\n# tmsh show ltm pool <pool> members   (Monitor Status)\n# curl -v http://<üye-ip>:<port>/health   (BIG-IP bash\'ten; monitörün gördüğü yanıt)\n';
            const w = [];
            if (/^https?$/.test(mon_type) && !recv) w.push('⚠ recv boş: sunucu 404 ya da 500 dönse bile her yanıt "up" sayılır. Sağlık sayfasının döndürdüğü bir metni (ör. "200 OK") yazın (f5-04).');
            if (/^https?$/.test(mon_type) && /HTTP\/1\.1/.test(send || '') && !/Host:/i.test(send || '')) w.push('⛔ HTTP/1.1 send dizgesinde Host başlığı yok: çoğu sunucu 400 döner ve tüm üyeler kırmızı olur. \\r\\nHost: <ad>\\r\\n ekleyin.');
            if (recv && /0K/.test(recv)) w.push('⚠ recv dizgesinde "0K" (sıfır) var; "OK" (harf) olmalı. Tek karakterlik hata tüm pool\'u kırmızıya çevirir (f5-10).');
            w.push('ℹ Monitör, sunucu ağındaki non-floating self IP\'den gönderilir; sunucu güvenlik duvarı bu adrese izin vermeli.');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 LTM: SSL Client Profile ────────────────────────────────────────────────
F5LTM.ssl = {
    label: 'SSL Client Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'SSL Client Profile (SSL Offload)',
                desc: 'Sertifika, anahtar ve ara CA sertifikasını yükler; cert-key-chain ile client-ssl profili oluşturur ve istemci tarafından doğrulama komutlarını verir.<br>Örnek: <code>tmsh create ltm profile client-ssl app_clientssl defaults-from clientssl cert-key-chain replace-all-with { app.lab.example { cert app.lab.example.crt key app.lab.example.key chain intermediate-ca.crt } }</code>',
                badge: { text: 'SSL', cls: 'info' }
            },
            sections: [
                {
                    title: 'Sertifika ve anahtar',
                    icon: 'fas fa-certificate',
                    fields: [
                        { name: 'prof_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'app_clientssl', hint: 'Virtual server\'a bu adla bağlanır.' },
                        { name: 'site', why: "Sertifikanın SAN listesinde bu ad olmalı; istemci siteye IP ile ya da başka adla giderse <b>no alternative certificate subject name matches</b> hatası alır.", label: 'Site adı (FQDN)', type: 'text', required: true, placeholder: 'app.lab.example' },
                        { name: 'cert_name', why: "Sertifika önce cihaza yüklenir (install sys crypto cert). Yüklenmemiş nesne profilde kullanılamaz.", label: 'Sertifika Adı', type: 'text', required: true, placeholder: 'app.lab.example.crt' },
                        { name: 'key_name', why: "Anahtar bu sertifikanın anahtarı olmalı; değilse profil <code>01070317 … key and certificate do not match</code> ile reddedilir.", label: 'Anahtar Adı', type: 'text', required: true, placeholder: 'app.lab.example.key' },
                        { name: 'chain', why: "Sertifikayı bir ara CA imzaladıysa bu sertifika da gönderilmeli. Eksikse tarayıcı önbellekten tamamlayıp çalışabilir ama mobil ve API istemcileri <b>unable to get local issuer certificate</b> verir.", label: 'Ara CA sertifikası (chain)', type: 'text', optional: true, placeholder: 'intermediate-ca.crt' },
                        { name: 'install', label: 'Dosyaları /var/tmp\'den yükle (install)', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'SNI ve virtual server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'sni', why: "Aynı VS'de birden çok client-ssl profili varsa her biri server-name ile ayrılır ve yalnız biri <code>sni-default true</code> olur; hiçbiri değilse <code>0107149c … none of them is default for SNI</code>.", label: 'SNI: server-name ve sni-default ayarla', type: 'checkbox' },
                        { name: 'sni_default', label: 'Bu profil SNI varsayılanı (sni-default true)', type: 'checkbox' },
                        { name: 'vs', label: 'Bağlanacak virtual server (opsiyonel)', type: 'text', optional: true, placeholder: 'vs_https', hint: 'Mevcut VS\'ye profil ekler; http profili de olmalı.' },
                        { name: 'vip', label: 'VIP adresi (doğrulama komutları için)', type: 'text', validate: 'ip', optional: true, placeholder: '203.0.113.100' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => cgF5SslGen(data));
    }
};
function cgF5SslGen(data) {
    const w = [], E2 = x => cgEsc(String(x || '').trim());
    const pn = E2(data.prof_name), site = E2(data.site), crt = E2(data.cert_name), key = E2(data.key_name), ch = E2(data.chain), vs = E2(data.vs), vip = E2(data.vip) || '<vip>';
    let c = '# ========================================\n# F5 BIG-IP LTM — SSL Client Profile (offload)\n# ========================================\n\n';
    if (data.install) {
        c += '# 1) Dosyaları yükle (önce scp ile /var/tmp\'ye kopyalayın)\n';
        c += 'tmsh install sys crypto key ' + key + ' from-local-file /var/tmp/' + key + '\n';
        c += 'tmsh install sys crypto cert ' + crt + ' from-local-file /var/tmp/' + crt + '\n';
        if (ch) c += 'tmsh install sys crypto cert ' + ch + ' from-local-file /var/tmp/' + ch + '\n';
        c += 'tmsh list sys file ssl-cert ' + crt + ' subject issuer subject-alternative-name expiration-string\n\n';
    }
    c += '# 2) Profil (F5 önerisi: cert-key-chain; üst seviye cert/key eski biçim)\n';
    c += 'tmsh create ltm profile client-ssl ' + pn + ' defaults-from clientssl cert-key-chain replace-all-with { ' + (site || 'default') + ' { cert ' + crt + ' key ' + key + (ch ? ' chain ' + ch : '') + ' } }' + (data.sni ? ' server-name ' + (site || '<fqdn>') + ' sni-default ' + (data.sni_default ? 'true' : 'false') : '') + '\n\n';
    if (vs) c += '# 3) Virtual server\'a bağla\ntmsh modify ltm virtual ' + vs + ' profiles add { ' + pn + ' }\n\n';
    c += '# Doğrulama (istemci tarafı)\ntmsh list ltm profile client-ssl ' + pn + ' cert-key-chain\n';
    c += 'curl -v --resolve ' + (site || '<fqdn>') + ':443:' + vip + ' https://' + (site || '<fqdn>') + '/\n';
    c += 'openssl s_client -connect ' + vip + ':443 -servername ' + (site || '<fqdn>') + '   # Certificate chain: 0 ve 1 satırları\n';
    c += 'tmsh save sys config\n';
    if (!ch) w.push('⚠ Ara CA sertifikası verilmedi. Sertifikayı bir ara CA imzaladıysa zincir eksik kalır: curl (60) unable to get local issuer certificate, openssl s_client "Verify return code: 21".');
    if (crt && key && crt.replace(/\.crt$/, '') !== key.replace(/\.key$/, '')) w.push('ℹ Sertifika ve anahtar adları farklı: doğru eşleştiğinden emin olun (uyuşmazsa 01070317).');
    if (data.sni_default && !data.sni) w.push('ℹ sni-default yalnız SNI seçeneğiyle birlikte yazılır.');
    w.push('ℹ Şifre takımı ve protokol sıkılaştırması için "SSL Cipher Group Sıkılaştırma" aracını kullanın. Sunucu bacağı da şifrelenecekse server-ssl profili ekleyin (bridging); sunucular HTTPS beklerken server-ssl yoksa 400 "plain HTTP to an SSL-enabled server port" alınır.');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 LTM: iRule ─────────────────────────────────────────────────────────────
F5LTM.irule = {
    label: 'iRule',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-code',
                title: 'iRule Şablonları (doğrulanmış)',
                desc: 'CLI Lab\'daki iRule simülatöründe denenmiş şablonlardan kural üretir; tmsh ile yükleme ve virtual server\'a bağlama adımlarını verir.<br>Örnek: <code>when HTTP_REQUEST { HTTP::respond 301 Location "https://[getfield [HTTP::host] ":" 1][HTTP::uri]" }</code>',
                badge: { text: 'iRule', cls: 'info' }
            },
            sections: [
                {
                    title: 'Şablon',
                    icon: 'fas fa-random',
                    fields: [
                        { name: 'irule_name', label: 'iRule Adı', type: 'text', required: true, placeholder: 'r_https', hint: 'Harf, rakam, _ . - ' },
                        { name: 'irule_type', why: "Her şablon CLI Lab'da (f5-30 … f5-35) simülatörde çalıştırılarak doğrulandı. HTTP olayı kullanan kural HTTP profili olmayan VS'ye bağlanamaz (01070394).", label: 'Şablon', type: 'select', options: [
                            { value: 'redirect', label: 'HTTP → HTTPS yönlendirme' },
                            { value: 'xff', label: 'X-Forwarded-For (gerçek istemci IP\'si)' },
                            { value: 'sechdr', label: 'Güvenlik başlıkları + Server gizleme' },
                            { value: 'path', label: 'Yola göre pool seçimi' },
                            { value: 'host', label: 'Host adına göre pool seçimi' },
                            { value: 'header', label: 'Başlık değerine göre pool seçimi' },
                            { value: 'acl', label: 'Yola erişimi IP listesiyle kısıtla (data group)' },
                            { value: 'sorry', label: 'Özür sayfası (LB_FAILED, 503)' },
                            { value: 'method', label: 'HTTP metodu kısıtlama (TRACE vb.)' },
                            { value: 'log', label: 'İstek / yanıt loglama (test için)' }
                        ]},
                        { name: 'vs', label: 'Bağlanacak virtual server (opsiyonel)', type: 'text', optional: true, placeholder: 'vs_web', hint: 'VS\'de HTTP profili olmalı.' }
                    ]
                },
                {
                    title: 'Şablon ayarları',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'code', label: 'Yönlendirme kodu', type: 'select', options: [{ value: '301', label: '301 kalıcı (HTTP::respond)' }, { value: '302', label: '302 geçici (HTTP::redirect)' }] },
                        { name: 'prefix', label: 'Yol öneki', type: 'text', optional: true, placeholder: '/api/', hint: 'Yol / erişim şablonları için.' },
                        { name: 'host', label: 'Host adı', type: 'text', optional: true, placeholder: 'api.lab.example' },
                        { name: 'hdr_name', label: 'Başlık adı', type: 'text', optional: true, placeholder: 'X-Tenant' },
                        { name: 'hdr_val', label: 'Başlık değeri', type: 'text', optional: true, placeholder: 'tenant-a' },
                        { name: 'pool_a', why: "Kuralda adıyla yazılan pool kayıt sırasında doğrulanır: yoksa kural reddedilir (<code>01070151 … Unable to find pool</code>).", label: 'Hedef pool', type: 'text', optional: true, placeholder: 'api_pool' },
                        { name: 'dg', label: 'Data group adı (IP listesi)', type: 'text', optional: true, placeholder: 'dg_yonetim' },
                        { name: 'nets', label: 'İzinli ağlar (virgülle)', type: 'text', optional: true, placeholder: '10.240.0.0/16' },
                        { name: 'msg', label: 'Özür sayfası metni', type: 'text', optional: true, placeholder: 'Bakımdayız, kısa süre sonra dönüyoruz.' }
                    ]
                }
            ],
            submit: 'iRule Oluştur'
        }, (data) => cgF5IruleGen(data));
    }
};
function cgF5IruleGen(data) {
    const w = [], v = k => String(data[k] || '').trim(), q = x => x.replace(/["\\\[\]$]/g, '\\$&');
    const name = v('irule_name'), t = data.irule_type, vs = v('vs');
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(name)) w.push('⛔ Kural adı harfle başlamalı; harf, rakam, _ . - kullanın.');
    const pool = v('pool_a') || '<pool>', pre = v('prefix') || '/api/', host = v('host').toLowerCase() || '<host>', dg = v('dg') || 'dg_izinli';
    let body = '', extra = '';
    switch (t) {
        case 'redirect':
            body = data.code === '302' ? 'when HTTP_REQUEST {\n    HTTP::redirect "https://[getfield [HTTP::host] ":" 1][HTTP::uri]"\n}' : 'when HTTP_REQUEST {\n    HTTP::respond 301 Location "https://[getfield [HTTP::host] ":" 1][HTTP::uri]"\n}';
            w.push('⚠ Yalnız 80\'deki HTTP virtual server\'a bağlayın; HTTPS VS\'ye bağlanırsa sonsuz yönlendirme döngüsü olur.');
            if (data.code === '302') w.push('ℹ HTTP::redirect her zaman 302 döner ve kod parametresi almaz; kalıcı yönlendirme için 301 seçin (HTTP::respond).');
            break;
        case 'xff': body = 'when HTTP_REQUEST {\n    # replace: istemcinin gönderdiği sahte değeri gerçek adresle değiştirir\n    HTTP::header replace X-Forwarded-For [IP::client_addr]\n}'; w.push('ℹ Aynı işi HTTP profilinde insert-xforwarded-for enabled da yapar; ikisini birlikte kullanmayın.'); break;
        case 'sechdr': body = 'when HTTP_RESPONSE {\n    HTTP::header remove Server\n    HTTP::header remove X-Powered-By\n    HTTP::header replace Strict-Transport-Security "max-age=31536000; includeSubDomains"\n    HTTP::header replace X-Frame-Options SAMEORIGIN\n    HTTP::header replace X-Content-Type-Options nosniff\n}'; w.push('⚠ HSTS yalnız HTTPS sitelerinde anlamlıdır; tarayıcı bir yıl boyunca HTTP\'ye dönmez. Önce kısa max-age ile deneyin.'); break;
        case 'path': body = 'when HTTP_REQUEST {\n    switch -glob -- [string tolower [HTTP::path]] {\n        "' + q(pre.toLowerCase()) + '*" { pool ' + pool + ' }\n        default { }\n    }\n}'; w.push('ℹ default dalı boş: diğer istekler VS\'nin varsayılan pool\'una gider.'); if (!/\/$/.test(pre)) w.push('⚠ Önek "/" ile bitmiyor: ' + pre + 'xyz gibi yollar da eşleşir.'); break;
        case 'host': body = 'when HTTP_REQUEST {\n    if { [string tolower [getfield [HTTP::host] ":" 1]] eq "' + q(host) + '" } {\n        pool ' + pool + '\n        return\n    }\n}'; break;
        case 'header': body = 'when HTTP_REQUEST {\n    if { [HTTP::header value "' + q(v('hdr_name') || 'X-Tenant') + '"] eq "' + q(v('hdr_val') || 'tenant-a') + '" } {\n        pool ' + pool + '\n        return\n    }\n}'; w.push('⚠ Başlık istemciden gelir ve sahte gönderilebilir: güvenlik kararı için kullanmayın.'); break;
        case 'acl': {
            const nets = v('nets').split(/[\s,]+/).filter(Boolean);
            if (!nets.length) w.push('⛔ En az bir izinli ağ girin (ör. 10.240.0.0/16).');
            extra = 'tmsh create ltm data-group internal ' + dg + ' type ip records add { ' + (nets.length ? nets.map(n => n + ' { }').join(' ') : '10.240.0.0/16 { }') + ' }\n';
            body = 'when HTTP_REQUEST {\n    if { [HTTP::path] starts_with "' + q(pre) + '" and ![class match [IP::client_addr] equals ' + dg + '] } {\n        HTTP::respond 403 content "Erisim yok" Content-Type "text/plain"\n        return\n    }\n}';
            w.push('ℹ Liste data group\'ta: yeni ağ eklemek için kuralı değil listeyi değiştirin (modify ltm data-group internal ' + dg + ' records add { … }).');
            break;
        }
        case 'sorry': body = 'when LB_FAILED {\n    HTTP::respond 503 content "<html><body><h1>' + q(v('msg') || 'Bakımdayız') + '</h1></body></html>" Content-Type "text/html" Retry-After 600\n}'; w.push('ℹ Yalnız pool\'da gönderilecek üye kalmadığında çalışır; 503 + Retry-After arama motorları için doğru koddur.'); break;
        case 'method': body = 'when HTTP_REQUEST {\n    switch -- [HTTP::method] {\n        GET - HEAD - POST - PUT - DELETE - OPTIONS { }\n        default {\n            HTTP::respond 405 content "Method Not Allowed" Allow "GET, HEAD, POST, PUT, DELETE, OPTIONS"\n            return\n        }\n    }\n}'; break;
        case 'log': body = 'when HTTP_REQUEST {\n    set uri [HTTP::uri]\n    log local0. "[IP::client_addr] [HTTP::method] [HTTP::host]$uri"\n}\nwhen HTTP_RESPONSE {\n    # HTTP::uri burada geçersiz: değer HTTP_REQUEST\'te saklandı\n    log local0. "$uri -> [HTTP::status]"\n}'; w.push('⚠ Her istek /var/log/ltm\'e yazılır: yalnız test süresince bağlı tutun.'); break;
    }
    if (['path', 'host', 'header'].includes(t) && !v('pool_a')) w.push('⛔ Hedef pool adını girin; kuraldaki pool kayıtta doğrulanır.');
    let c = '# ========================================\n# F5 BIG-IP LTM — iRule: ' + name + '\n# ========================================\n\n';
    if (extra) c += '# 1) Data group\n' + extra + '\n';
    c += '# ' + (extra ? '2' : '1') + ') Kuralı yükle: tmsh\'e yapıştırın, sonra Ctrl+D (ya da GUI: Local Traffic > iRules > Create / tmsh edit ltm rule ' + name + ')\n';
    c += 'tmsh load sys config merge from-terminal\nltm rule ' + name + ' {\n' + body + '\n}\n\n';
    if (vs) c += '# Virtual server\'a ekle (mevcut kurallar korunur)\ntmsh modify ltm virtual ' + vs + ' rules add { ' + name + ' }\n\n';
    c += '# Doğrulama\ntmsh list ltm rule ' + name + '\ntmsh show ltm rule ' + name + '   # Executions / Failures\ngrep "' + name + '" /var/log/ltm   # TCL error (01220001) var mı?\ntmsh save sys config\n';
    w.push('ℹ Bu şablonu CLI Lab\'da iRule simülatöründe deneyebilirsiniz (Lab > F5 > Seviye 7).');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 LTM: Persistence ──────────────────────────────────────────────────────
F5LTM.persistence = {
    label: 'Persistence Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-thumbtack',
                title: 'Persistence Profile',
                desc: 'İstemci oturumlarını belirli bir sunucuya bağlayan persistence profili oluşturur; cookie insert veya kaynak IP yöntemi desteklenir.'
            },
            sections: [
                {
                    title: 'Profil Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'prof_name', why: "Persistence profili bir virtual server'a bağlanmadığı sürece hiçbir etkisi olmaz; profili oluşturup VS'ye bağlamayı unutmak en sık yapılan hatadır.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'MY_COOKIE_PERSIST', hint: 'Persistence profili için benzersiz bir isim.' },
                        { name: 'persist_type', why: "Cookie persistence uygulama katmanında çalışır ve HTTP profili gerektirir; SSL sonlandırılmıyorsa hiç devreye girmez. Source-addr ise NAT arkasındaki binlerce kullanıcıyı tek üyeye yığar ve yük dengesini bozar.", label: 'Tip', type: 'select', options: [
                            { value: 'cookie', label: 'Cookie Insert' },
                            { value: 'source-addr', label: 'Source IP' }
                        ]},
                        { name: 'timeout', why: "Persistence timeout uygulamanın oturum süresinden kısaysa kullanıcı oturum ortasında başka sunucuya düşer ve sepetini/oturumunu kaybeder. Çok uzunsa bakım sırasında üye boşaltma (draining) beklenenden çok uzun sürer.", label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '300', hint: 'Oturum süresi; varsayılan 300 saniye.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { prof_name, persist_type, timeout } = data;
            const tout = timeout || '300';
            let c = '# ========================================\n# F5 BIG-IP LTM — Persistence Profile\n# ========================================\n\n';
            c += 'tmsh create ltm persistence ' + persist_type + ' ' + prof_name + ' {\n';
            c += '    timeout ' + tout + '\n';
            if (persist_type === 'cookie') c += '    cookie-name "NSSERVICEID"\n    method insert\n';
            c += '}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm persistence ' + persist_type + ' ' + prof_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: HA / DSC ──────────────────────────────────────────────────────────
F5LTM.ha = {
    label: 'HA (DSC)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clone',
                title: 'HA / DSC',
                desc: 'İki BIG-IP cihazı arasında Device Service Clustering (DSC) ile aktif-yedek yüksek erişilebilirlik kurulumunu adım adım yapılandırır.'
            },
            sections: [
                {
                    title: 'Cihaz Rolü',
                    icon: 'fas fa-crown',
                    fields: [
                        { name: 'ha_role', why: "Active cihaz trafiği taşır, standby yalnızca config-sync alır; iki cihazın da active kalması (split-brain) aynı VIP'in iki yerden ARP duyurmasına ve trafiğin kopmasına neden olur. Rol ayrımı device group ve failover ağı doğru kurulmadan anlam taşımaz.", label: 'Rol', type: 'select', options: [
                            { value: 'active', label: 'Active' },
                            { value: 'standby', label: 'Standby' }
                        ]}
                    ]
                },
                {
                    title: 'Ağ Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'sync_ip', why: "Config sync için management yerine ayrı bir self IP kullanılmalıdır; yanlış IP verilirse cihazlar <b>Disconnected</b> durumunda kalır ve yapılan değişiklikler eşe hiç geçmez. Sync edilmeyen değişiklikler failover sonrası kaybolur.", label: 'Config Sync IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.3.1', hint: 'Konfigürasyon senkronizasyonu için IP adresi.' },
                        { name: 'fo_ip', why: "Failover haberleşmesi kesilirse her iki cihaz da kendini active sanar; bu yüzden unicast failover en az iki adres üzerinden tanımlanmalıdır. Aradaki güvenlik duvarı UDP 1026 portunu engellerse failover sağlıksız çalışır.", label: 'Failover IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.3.1', hint: 'Unicast failover için IP adresi.' }
                    ]
                },
                {
                    title: 'Peer Cihaz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'peer_host', why: "Peer hostname karşı cihazın <code>tmsh list sys global-settings hostname</code> değeriyle birebir aynı olmalı; uyuşmazlık trust kurulumunu <b>device not found</b> ile başarısız kılar.", label: 'Peer Hostname', type: 'text', validate: 'port_match', required: true, placeholder: 'bigip-standby', hint: 'Yedek cihazın hostname\'i.' },
                        { name: 'peer_mgmt', why: "Trust kurulumu bu adres üzerinden yapılır; erişilemiyorsa device group hiç oluşmaz. Cihazların saatleri NTP ile senkron değilse sertifika tabanlı trust de reddedilir.", label: 'Peer Management IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Yedek cihazın yönetim IP adresi.' },
                        { name: 'dg_name', why: "Sync-Failover device group ismi her iki cihazda aynı olmalıdır; farklı isimler iki ayrı grup oluşturur ve senkronizasyon hiç gerçekleşmez. Grup kurulduktan sonra ilk full sync elle tetiklenmeli ve <code>tmsh save sys config</code> ile kaydedilmelidir.", label: 'Device Group Adı', type: 'text', required: true, placeholder: 'DG_FAILOVER', hint: 'Sync-Failover device group ismi.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { ha_role, sync_ip, fo_ip, peer_host, peer_mgmt, dg_name } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — HA / DSC (' + ha_role.toUpperCase() + ')\n# ========================================\n\n';
            c += '# 1. Config Sync IP ayarla\ntmsh modify cm device $(tmsh show cm device | awk \'/hostname/{print $2}\') \\\n';
            c += '    configsync-ip ' + sync_ip + ' \\\n';
            c += '    unicast-address {{ ip ' + fo_ip + ' }}\n\n';
            c += '# 2. Peer\'i güven listesine ekle\ntmsh run cm add-to-trust-domain \\\n';
            c += '    device-ip ' + peer_mgmt + ' \\\n';
            c += '    device-name ' + peer_host + ' \\\n';
            c += '    username admin password admin\n\n';
            c += '# 3. Sync-Failover Device Group oluştur\ntmsh create cm device-group ' + dg_name + ' \\\n';
            c += '    type sync-failover \\\n';
            c += '    devices add { $(hostname) ' + peer_host + ' } \\\n';
            c += '    auto-sync enabled\n\n';
            c += '# 4. Senkronizasyon başlat\ntmsh run cm config-sync to-group ' + dg_name + '\n\n';
            c += '# Doğrulama:\n# tmsh show cm sync-status\n# tmsh show cm failover-status\n# tmsh show cm device-group ' + dg_name + '\n';
            return c;
        });
    }
};

// ── ASM yardımcıları ─────────────────────────────────────────────────────────
// tmsh asm policy yalnız şunları kabul eder: active|inactive, blocking-mode, encoding, policy-builder, policy-template, policy-type, parent-policy, description.
// Policy VS'ye profil olarak eklenmez: "asm enable policy" eylemli LTM policy + websecurity profili (K16303347).
function cgF5AsmCreate(pol, template, enc, enforcement) {
    let c = '# 1) Policy oluştur (blocking-mode enabled = Blocking, disabled = Transparent)\n';
    c += 'tmsh create asm policy /Common/' + pol + ' policy-template ' + template + ' encoding ' + enc + ' blocking-mode ' + (enforcement === 'blocking' ? 'enabled' : 'disabled') + '\n';
    c += 'tmsh modify asm policy /Common/' + pol + ' active\n';
    c += 'tmsh publish asm policy /Common/' + pol + '\n\n';
    return c;
}
function cgF5AsmAttach(pol, vs) {
    let c = '# 2) Virtual server\'a bağla: ASM eylemli LTM policy (taslak → yayın) + websecurity profili\n';
    c += '#    VS\'de HTTP profili olmalı; HTTPS\'te client-ssl ile şifre çözülmüş olmalı (yoksa WAF içeriği göremez)\n';
    c += 'tmsh create ltm policy /Common/Drafts/asm_' + pol + ' controls add { asm } requires add { http } rules add { default { ordinal 1 actions add { 1 { asm enable policy /Common/' + pol + ' } } } }\n';
    c += 'tmsh publish ltm policy /Common/Drafts/asm_' + pol + '\n';
    c += 'tmsh modify ltm virtual /Common/' + vs + ' profiles add { websecurity } policies add { asm_' + pol + ' }\n\n';
    return c;
}

// ── F5 BIG-IP: ASM Policy ─────────────────────────────────────────────────────
F5LTM.asm = {
    label: 'ASM WAF Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'ASM WAF Policy',
                desc: 'Application Security Manager (ASM) ile web uygulaması güvenlik politikası oluşturur ve seçili virtual server\'a bağlar.'
            },
            sections: [
                {
                    title: 'Policy Ayarları',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'pol_name', why: "Policy adı virtual server'a bağlanırken kullanılır; bir VS'ye aynı anda yalnızca tek ASM policy bağlanabilir, yeni policy bağlanırsa eskisi sessizce devre dışı kalır.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'WAF_APP1', hint: 'ASM policy için benzersiz bir isim.' },
                        { name: 'enforcement', why: "<b>Transparent</b> modda ihlaller yalnızca loglanır, hiçbir istek engellenmez; bu mod öğrenme aşaması içindir. Doğrudan <b>Blocking</b> moda geçmek yanlış pozitiflerle meşru kullanıcıları engeller ve uygulamayı kullanılamaz hale getirir.", label: 'Enforcement Modu', type: 'select', options: [
                            { value: 'blocking', label: 'Blocking' },
                            { value: 'transparent', label: 'Transparent' }
                        ]},
                        { name: 'template', why: "Şablon başlangıç imza ve kontrol setini belirler; uygulamaya uymayan şablon (örneğin API servisine tarayıcı odaklı şablon) yüzlerce yanlış pozitif üretir. Yanlış şablonla başlanırsa policy'yi düzeltmek sıfırdan yaratmaktan uzun sürer.", label: 'Şablon', type: 'select', options: [
                            { value: 'POLICY_TEMPLATE_RAPID_DEPLOYMENT', label: 'Rapid Deployment' },
                            { value: 'POLICY_TEMPLATE_FUNDAMENTAL', label: 'Fundamental' },
                            { value: 'POLICY_TEMPLATE_COMPREHENSIVE', label: 'Comprehensive' }
                        ]},
                        { name: 'lang', why: "Uygulama dili aslında karakter kodlamasıdır (tmsh: <code>encoding</code>); yanlış seçilirse Türkçe karakterli girdiler bozuk çözümlenir ve meşru istekler <b>illegal meta character</b> ihlali üretir. Policy oluşturulduktan sonra bu değer değiştirilemez.", label: 'Uygulama Dili (encoding)', type: 'select', options: [
                            { value: 'utf-8', label: 'UTF-8' },
                            { value: 'windows-1254', label: 'Windows-1254 (Türkçe)' },
                            { value: 'iso-8859-9', label: 'ISO-8859-9 (Türkçe)' }
                        ]}
                    ]
                },
                {
                    title: 'Bağlantı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'vs_name', why: "Policy bir virtual server'a bağlanmadığı sürece hiçbir trafiği korumaz; oluşturulup bağlanmayan policy en sık rastlanan yanlış güvenlik varsayımıdır. Bağlanacak VS'de HTTP profili ve SSL sonlandırması bulunmalıdır.", label: 'Bağlanacak Virtual Server', type: 'text', required: true, placeholder: 'VS_APP1_HTTPS', hint: 'Policy\'nin uygulanacağı virtual server.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { pol_name, enforcement, template, vs_name, lang } = data;
            let c = '# ========================================\n# F5 BIG-IP — ASM WAF Policy\n# ========================================\n\n';
            c += '# Ön koşul: ASM modülü provision edilmiş olmalı (tmsh list sys provision asm)\n\n';
            c += cgF5AsmCreate(pol_name, template, lang, enforcement);
            c += cgF5AsmAttach(pol_name, vs_name);
            c += 'tmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list asm policy /Common/' + pol_name + '\n# tmsh list ltm virtual /Common/' + vs_name + ' policies profiles\n';
            c += '# Rapid Deployment şablonu varsayılan olarak transparent başlar; burada blocking-mode açıkça ayarlandı.\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Advanced WAF (AWAF) ───────────────────────────────────────────
F5LTM.awaf = {
    label: 'Advanced WAF (AWAF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'Advanced WAF (AWAF)',
                desc: 'Bot Defense ve gelişmiş imza yönetimi dahil Advanced WAF politikası yapılandırır; üretim ve öğrenme modları desteklenir.'
            },
            sections: [
                {
                    title: 'Policy Ayarları',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'pol_name', why: "AWAF policy adı bot defense ve imza ayarlarının yönetildiği referanstır; aynı VS'ye ikinci bir policy bağlanamaz ve deneme mevcut korumayı değiştirir.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'AWAF_APP1', hint: 'AWAF policy için benzersiz bir isim.' },
                        { name: 'enforcement', why: "Blocking moda geçmeden önce transparent ve staging aşaması tamamlanmalı; aksi halde uygulamanın normal davranışı saldırı olarak engellenir ve kesinti yaşanır. Mod değişikliği <b>apply policy</b> yapılmadan aktif olmaz.", label: 'Enforcement Modu', type: 'select', options: [
                            { value: 'blocking', label: 'Blocking' },
                            { value: 'transparent', label: 'Transparent (Learning)' }
                        ]},
                        { name: 'bot_defense', why: "Bot defense agresif ayarlandığında meşru izleme sistemleri ve API istemcileri de bot sanılıp engellenir; health check kaynakları mutlaka istisna listesine alınmalıdır. Kapalı bırakılırsa credential stuffing ve scraping trafiği klasik imzalarla yakalanamaz.", label: 'Bot Defense', type: 'select', options: [
                            { value: 'yes', label: 'Etkin' },
                            { value: 'no', label: 'Kapalı' }
                        ]},
                        { name: 'staging', why: "Staging açıkken yeni imzalar engelleme yapmaz, yalnızca loglanır; böylece imza güncellemeleri üretimi aniden kırmaz. Staging'den hiç çıkılmazsa imzalar aylarca pasif kalır ve WAF koruma sağladığı sanılır.", label: 'Signature Staging', type: 'select', options: [
                            { value: 'no', label: 'Kapalı (Üretim)' },
                            { value: 'yes', label: 'Açık (Test)' }
                        ]}
                    ]
                },
                {
                    title: 'Bağlantı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'vs_name', why: "Policy VS'ye bağlanmadan çalışmaz; ayrıca trafik client-ssl profili ile sonlandırılmamışsa AWAF şifreli içeriği hiç inceleyemez ve koruma yalnızca kağıt üzerinde kalır.", label: 'Bağlanacak Virtual Server', type: 'text', required: true, placeholder: 'VS_APP1_HTTPS', hint: 'Policy\'nin uygulanacağı virtual server.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { pol_name, enforcement, bot_defense, staging, vs_name } = data;
            let c = '# ========================================\n# F5 BIG-IP — Advanced WAF (AWAF)\n# ========================================\n\n';
            c += cgF5AsmCreate(pol_name, 'POLICY_TEMPLATE_RAPID_DEPLOYMENT', 'utf-8', enforcement);
            c += '# Signature staging tmsh ile ayarlanmaz: GUI (Policy Building > Learning and Blocking Settings > Attack Signatures)\n';
            c += '# ya da declarative JSON: { "policy": { "signature-settings": { "signatureStaging": ' + (staging === 'yes') + ' } } }\n\n';
            c += cgF5AsmAttach(pol_name, vs_name);
            if (bot_defense === 'yes') {
                c += '# Bot Defense profili (template: relaxed | balanced | strict)\n';
                c += 'tmsh create security bot-defense profile /Common/BD_' + pol_name + ' template balanced enforcement-mode ' + enforcement + '\n';
                c += 'tmsh modify ltm virtual /Common/' + vs_name + ' profiles add { /Common/BD_' + pol_name + ' }\n\n';
            }
            c += 'tmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list asm policy /Common/' + pol_name + '\n# tmsh list ltm virtual /Common/' + vs_name + ' policies profiles\n' + (bot_defense === 'yes' ? '# tmsh list security bot-defense profile /Common/BD_' + pol_name + '\n' : '');
            return c;
        });
    }
};

// ── F5 LTM: SSL Server Profile ────────────────────────────────────────────────
F5LTM.sslserver = {
    label: 'SSL Server Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-lock',
                title: 'SSL Server Profile',
                desc: 'BIG-IP ile backend sunucular arasındaki yeniden şifreleme (re-encrypt) için sunucu taraflı SSL profili tanımlar.'
            },
            sections: [
                {
                    title: 'SSL Server Profile',
                    icon: 'fas fa-certificate',
                    fields: [
                        { name: 'profile_name', why: "Server-SSL profili BIG-IP ile backend arasındaki bacağı şifreler; client-ssl ile karıştırılıp yanlış bacağa bağlanırsa handshake sürekli başarısız olur ve istemci 502 alır.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'ssl-server-re-encrypt', hint: 'Profil için benzersiz bir isim.' },
                        { name: 'cert', why: "Backend sunucu mutual TLS istiyorsa bu sertifika sunulur; istenmiyorken yanlış sertifika verilmesi de handshake'i kırabilir. Yol partition ile birlikte tam yazılmalıdır.", label: 'İstemci sertifikası (opsiyonel)', type: 'text', optional: true, placeholder: '/Common/server.crt', hint: 'Yalnız backend karşılıklı TLS (mTLS) istiyorsa.' },
                        { name: 'key', why: "Key ile sertifika eşleşmezse SSL bacağı hiç kurulamaz; pool üyeleri monitor'dan geçse bile trafik 502 ile döner ve sorun boş yere backend'de aranır.", label: 'İstemci anahtarı (opsiyonel)', type: 'text', optional: true, placeholder: '/Common/server.key', hint: 'Sertifika verildiyse gerekli.' },
                        { name: 'chain', why: "Backend sertifikası doğrulanacaksa zincir eksik olduğunda tüm backend bağlantıları reddedilir. Doğrulama kapalıysa zincir gereksizdir, ancak bu durumda sahte backend'e karşı koruma da kalmaz.", label: 'Chain Sertifika', type: 'text', optional: true, placeholder: '/Common/ca-bundle.crt', hint: 'Ara CA zinciri; opsiyonel.' },
                        { name: 'cipher_string', why: "Backend ile ortak cipher bulunamazsa handshake <b>no shared cipher</b> ile başarısız olur; eski backend'ler modern cipher listesini desteklemeyebilir. SSL bridging senaryosunda iki bacağın cipher politikası ayrı ayrı yönetilir.", label: 'Cipher String', type: 'text', optional: true, placeholder: 'DEFAULT', hint: 'Boş: parent (serverssl) ayarı.' },
                        { name: 'peer_cert_mode', why: "<b>Require</b> seçilirse backend sertifikası doğrulanır; CA bundle eksikse tüm backend bağlantıları kopar. <b>Ignore</b> daha performanslıdır ama sahte backend'e karşı koruma sağlamaz ve uçtan uca şifreleme iddiasını zayıflatır.", label: 'Peer Cert Mode', type: 'select', options: [
                            { value: 'require', label: 'require — backend sertifikasını doğrula', selected: true },
                            { value: 'request', label: 'request' },
                            { value: 'ignore', label: 'ignore — doğrulama yok' }
                        ]},
                        { name: 'ca_file', why: 'Backend sertifikasını doğrulamak için güvenilen CA paketi. <code>require</code> seçiliyken CA verilmezse backend bağlantısı el sıkışmada düşer.', label: 'CA Dosyası', type: 'text', optional: true, placeholder: '/Common/ca-bundle.crt', hint: 'require/request için gerekir' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { profile_name, cert, key, chain, cipher_string, peer_cert_mode, ca_file } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — SSL Server Profile\n# ========================================\n\n';
            c += 'tmsh create ltm profile server-ssl ' + profile_name + ' defaults-from serverssl';
            if (cert) c += ' cert ' + cert;
            if (cert && key) c += ' key ' + key;
            if (chain) c += ' chain ' + chain;
            if (cipher_string) c += ' ciphers "' + cipher_string + '"';
            c += ' peer-cert-mode ' + peer_cert_mode;
            if (ca_file) c += ' ca-file ' + ca_file;
            c += '\n\n';
            if (peer_cert_mode === 'ignore') c += '# UYARI: peer-cert-mode ignore — backend sertifikası doğrulanmaz, sahte backend\'e karşı koruma yok.\n\n';
            else if (!ca_file) c += '# UYARI: ' + peer_cert_mode + ' seçili ama CA dosyası yok — doğrulama için ca-file verin.\n\n';
            if (cert && !key) c += '# UYARI: sertifika verildi ama anahtar yok.\n\n';
            c += '# Virtual server\'a ekleyin (bridging): tmsh modify ltm virtual <vs> profiles add { ' + profile_name + ' }\n';
            c += '# Doğrulama:\n# tmsh list ltm profile server-ssl ' + profile_name + '\n# Sunucular HTTP (80) ise server-ssl eklemeyin: el sıkışma başarısız olur, bağlantı sıfırlanır.\n';
            return c;
        });
    }
};

// ── F5 LTM: SNAT Pool ─────────────────────────────────────────────────────────
F5LTM.snatpool = {
    label: 'SNAT Pool',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'SNAT Pool',
                desc: 'Dışarıya çıkan trafiğin kaynak IP adresini gizlemek için SNAT havuzu oluşturur; birden fazla çevirici IP kullanılabilir.'
            },
            sections: [
                {
                    title: 'SNAT Pool',
                    icon: 'fas fa-random',
                    fields: [
                        { name: 'pool_name', why: "SNAT pool adı virtual server'a veya SNAT listesine atanmadıkça hiçbir işe yaramaz; trafik sessizce automap ya da none davranışını sürdürür ve sorun fark edilmez.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'SNAT-POOL-OUTBOUND', hint: 'SNAT havuzu için benzersiz bir isim.' },
                        { name: 'members', why: "Her SNAT adresi yaklaşık 64.000 kaynak port sunar; tek adresle yoğun trafikte port tükenir ve yeni bağlantılar reddedilir. Bu IP'ler backend'in yönlendirme tablosunda BIG-IP'ye dönecek şekilde erişilebilir olmalıdır.", label: 'Üyeler (virgülle ayrılmış IP listesi)', type: 'text', required: true, placeholder: '10.0.0.101,10.0.0.102,10.0.0.103', hint: 'Kaynak NAT adresi olarak kullanılacak IP\'ler.' },
                        { name: 'route_advertisement', why: "Route advertisement kapalıysa üst router SNAT adreslerine giden yolu bilmez ve dönüş trafiği kaybolur. Açıkken adres yalnızca ilgili nesne aktifken duyurulur; bu HA senaryosunda trafiğin doğru cihaza gitmesini sağlar.", label: 'Route Advertisement', type: 'select', options: [
                            { value: 'selective', label: 'selective' },
                            { value: 'always', label: 'always' },
                            { value: 'none', label: 'none' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { pool_name, members: membersRaw, route_advertisement } = data;
            const members = membersRaw.split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# F5 BIG-IP LTM — SNAT Pool\n# ========================================\n\n';
            c += 'tmsh create ltm snatpool ' + pool_name + ' members replace-all-with {';
            members.forEach(m => { c += ' ' + m + ':0'; });
            c += ' } partition Common\n\n';
            c += '# Route Advertisement: ' + route_advertisement + '\n';
            c += '# tmsh modify ltm snatpool ' + pool_name + ' route-advertisement ' + route_advertisement + '\n\n';
            c += '# Doğrulama:\n# tmsh list ltm snatpool ' + pool_name + '\n# tmsh show ltm snatpool ' + pool_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: HTTP Profile ──────────────────────────────────────────────────────
F5LTM.httpprofile = {
    label: 'HTTP Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'HTTP Profile',
                desc: 'HTTP trafik işleme davranışını özelleştirir; XFF ekleme, başlık silme/ekleme ve yeniden yönlendirme yeniden yazımı ayarlanabilir.'
            },
            sections: [
                {
                    title: 'Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'profile_name', why: "HTTP profili olmayan bir VS'de katman 7 özellikleri (cookie persistence, iRule HTTP komutları, WAF, XFF) hiç çalışmaz. Profil adı VS'ye bağlanırken referans edilir.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'http-custom', hint: 'HTTP profili için benzersiz bir isim.' },
                        { name: 'insert_xforwarded_for', why: "SNAT kullanıldığında backend tüm istekleri BIG-IP self IP'sinden görür; X-Forwarded-For eklenmezse uygulama logları ve IP bazlı kısıtlamalar anlamsız hale gelir. Dışarıdan gelen mevcut XFF başlığı sahte olabileceği için güvenilmemelidir.", label: 'Insert X-Forwarded-For', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'oneconnect', why: "OneConnect backend bağlantılarını tekrar kullanarak sunucu yükünü ciddi ölçüde azaltır; ancak NTLM gibi bağlantı temelli kimlik doğrulamalarda oturumların karışmasına ve kullanıcının başkasının verisini görmesine yol açabilir.", label: 'OneConnect Transformations', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'redirect_rewrite', why: "SSL offload sonrası backend <code>http://</code> ile Location başlığı dönerse istemci şifresiz adrese düşer ve yönlendirme döngüsü oluşur. Redirect rewrite bu başlıkları düzelterek sonsuz döngüyü ve karma içerik uyarılarını önler.", label: 'Redirect Rewrite', type: 'select', options: [
                            { value: 'matching', label: 'matching' },
                            { value: 'all', label: 'all' },
                            { value: 'none', label: 'none' }
                        ]}
                    ]
                },
                {
                    title: 'Metotlar ve Başlık Sınırları (enforcement)',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'method_preset', why: "Varsayılan <code>http</code> profili TRACE, CONNECT ve WebDAV metotlarını da tanır ve bilinmeyen metotlara izin verir (<code>unknown-method allow</code>). Listeden çıkarılan metot unknown-method kuralına düşer; <code>reject</code> ile bağlantı sıfırlanır (K85840901). Varsayılan <code>http</code> profilini değil, ondan türetilmiş profili değiştirin: varsayılanı kullanan tüm VS'ler etkilenir.", label: 'Metot politikası', type: 'select', options: [
                            { value: 'keep', label: 'Değiştirme (miras: tüm bilinen metotlar, bilinmeyenlere izin)' },
                            { value: 'web', label: 'Web sitesi: GET HEAD POST' },
                            { value: 'api', label: 'REST API: GET HEAD POST PUT DELETE OPTIONS' },
                            { value: 'webdav', label: 'WebDAV: + PROPFIND LOCK UNLOCK (TRACE/CONNECT kapalı)' },
                            { value: 'custom', label: 'Özel liste' }
                        ]},
                        { name: 'methods_custom', why: "Yalnız 'Özel liste' seçiliyse kullanılır. Metot adları büyük harfe duyarlıdır (HTTP standardı); listede olmayan her metot aşağıdaki unknown-method kuralına düşer.", label: 'Özel metot listesi (boşlukla)', type: 'text', optional: true, placeholder: 'GET HEAD POST', hint: 'Yalnız "Özel liste" için; ör. GET HEAD POST PUT' },
                        { name: 'unknown_method', why: "<b>reject</b>: listede olmayan metotta bağlantı sıfırlanır. <b>allow</b>: geçer (TRACE gibi riskli metotlar da). <b>pass-through</b>: istek geçer ama BIG-IP o bağlantıda HTTP işlemeyi bırakır; iRule HTTP olayları, cookie persistence ve başlık ekleme çalışmaz.", label: 'Bilinmeyen metot (unknown-method)', type: 'select', options: [
                            { value: 'reject', label: 'reject (önerilen, ön ayarlarla birlikte)' },
                            { value: 'allow', label: 'allow (varsayılan)' },
                            { value: 'pass-through', label: 'pass-through' }
                        ]},
                        { name: 'max_header_size', why: "İstek satırı dahil tüm başlıkların toplam boyutu (varsayılan 32768 bayt). Aşılırsa BIG-IP bağlantıyı TCP RST ile keser ve /var/log/ltm'e <code>011f0005 … HTTP header (N) exceeded maximum allowed size</code> yazar (K8482). SSO / büyük çerezli uygulamalarda artırmak gerekebilir; sınırsız büyütmek bellek tüketimi ve saldırı yüzeyi demektir.", label: 'max-header-size (bayt)', type: 'text', optional: true, min: 1024, max: 131072, placeholder: '32768', hint: 'Boşsa miras (32768)' },
                        { name: 'max_header_count', why: "Başlık satırı sayısı sınırı (varsayılan 64). Çok sayıda çerez/başlık gönderen tarayıcı eklentileri ya da proxy zincirleri bu sınırı aşabilir (K000161470).", label: 'max-header-count', type: 'text', optional: true, min: 16, max: 256, placeholder: '64', hint: 'Boşsa miras (64)' }
                    ]
                },
                {
                    title: 'Yanıt Güvenliği',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'hsts', why: "HSTS, tarayıcıya bu alan adına belirtilen süre boyunca yalnız HTTPS ile gelmesini söyler; SSL strip saldırısını önler. Tarayıcılar HSTS başlığını yalnız HTTPS yanıtında dikkate alır. Profil ile verildiğinde iRule ile ayrıca eklemeyin: çift başlık oluşur.", label: 'HSTS', type: 'select', options: [
                            { value: 'disabled', label: 'Kapalı (varsayılan)' },
                            { value: 'enabled', label: 'Açık' }
                        ]},
                        { name: 'hsts_age', why: "Saniye cinsinden süre (31536000 = 1 yıl; BIG-IP varsayılanı 16070400 ≈ 186 gün). Yanlışlıkla açılan uzun HSTS geri alınamaz: tarayıcılar süre dolana kadar HTTP'ye dönmez.", label: 'HSTS maximum-age (sn)', type: 'text', optional: true, min: 0, max: 63072000, placeholder: '31536000', hint: 'Yalnız HSTS açıksa' },
                        { name: 'hsts_sub', why: "includeSubDomains tüm alt alan adlarını da HTTPS'e zorlar; HTTPS'i olmayan bir alt alan adı (ör. eski bir iç uygulama) erişilemez hale gelir.", label: 'HSTS include-subdomains', type: 'select', options: [
                            { value: 'enabled', label: 'enabled (varsayılan)' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'server_agent', why: "BIG-IP'nin kendi ürettiği yanıtlardaki (yönlendirme, iRule yanıtı, fallback) Server başlığı; varsayılan <code>BigIP</code> cihaz türünü açığa çıkarır. <code>none</code> başlığı kaldırır. Sunucudan gelen Server başlığını etkilemez; onu Header Erase ile silin.", label: 'server-agent-name', type: 'text', optional: true, placeholder: 'none', hint: 'Boşsa miras (BigIP); "none" kaldırır' },
                        { name: 'fallback_host', why: "Pool'da kullanılabilir üye kalmadığında istemci bağlantı hatası yerine bu adrese 302 ile yönlendirilir. Bakım sayfası başka bir sunucuda olmalı; aynı VS'ye yönlendirmek döngü oluşturur.", label: 'fallback-host', type: 'text', optional: true, placeholder: 'https://bakim.example.com/', hint: 'Boşsa kapalı' }
                    ]
                },
                {
                    title: 'Başlık İşlemleri',
                    icon: 'fas fa-tags',
                    fields: [
                        { name: 'header_erase', why: "Sunucu sürümünü açığa çıkaran başlıkların (Server, X-Powered-By) silinmesi bilgi sızıntısını azaltır. Uygulamanın ihtiyaç duyduğu bir başlık yanlışlıkla silinirse istemci tarafında sessiz hatalar başlar.", label: 'Header Erase', type: 'text', optional: true, placeholder: 'Server', hint: 'Silinecek HTTP başlık adı; opsiyonel.' },
                        { name: 'header_insert', why: "Eklenen başlık backend'in beklediği formatta olmalı; <code>X-Forwarded-Proto: https</code> olmadan uygulama kendini HTTP sanıp hatalı mutlak URL üretir. Aynı başlık iRule ile de ekleniyorsa çift başlık oluşur ve backend hangisini okuyacağını bilemez.", label: 'Header Insert', type: 'text', optional: true, placeholder: 'X-Via: bigip', hint: 'Eklenecek HTTP başlık adı ve değeri; opsiyonel.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { profile_name, insert_xforwarded_for, oneconnect, redirect_rewrite, header_erase, header_insert, method_preset, methods_custom, unknown_method, max_header_size, max_header_count, hsts, hsts_age, hsts_sub, server_agent, fallback_host } = data;
            const PRE = { web: 'GET HEAD POST', api: 'GET HEAD POST PUT DELETE OPTIONS', webdav: 'GET HEAD POST PUT DELETE OPTIONS PROPFIND LOCK UNLOCK' };
            const methods = method_preset === 'custom' ? String(methods_custom || '').trim().split(/[\s,]+/).filter(Boolean) : PRE[method_preset] ? PRE[method_preset].split(' ') : null;
            const w = [];
            if (method_preset === 'custom' && (!methods || !methods.length)) w.push('⛔ Özel liste seçildi ama metot girilmedi.');
            if (methods && methods.some(m => !/^[A-Z][A-Z-]*$/.test(m))) w.push('⛔ Metot adları büyük harfle yazılır (HTTP metotları büyük/küçük harfe duyarlıdır).');
            if (methods && methods.includes('TRACE')) w.push('⚠ TRACE açık: çapraz site izleme (XST) riski; K85840901.');
            if (method_preset === 'keep' && unknown_method === 'allow') w.push('ℹ Metot politikası değiştirilmedi: TRACE ve bilinmeyen metotlar geçer. Güvenlik taraması için "Web sitesi" ön ayarını düşünün.');
            if (method_preset === 'webdav') w.push('ℹ MKCOL, COPY, MOVE, PROPPATCH gibi diğer WebDAV metotları bilinen listede yoksa unknown-method kuralına düşer; istemcinizin kullandığı metotları test edin.');
            if (method_preset === 'api') w.push('ℹ PATCH kullanan API\'ler için PATCH\'i listeye eklemek gerekir; sürümünüzün özel metot adı kabul ettiğini doğrulayın, kabul etmiyorsa unknown-method allow gerekir.');
            if (unknown_method === 'pass-through') w.push('⚠ pass-through: bilinmeyen metotlu bağlantılarda iRule HTTP olayları, persistence ve başlık işlemleri devre dışı kalır.');
            if (hsts === 'enabled' && +hsts_age > 0 && +hsts_age < 86400) w.push('ℹ HSTS süresi 1 günden kısa; test için uygun, kalıcı kullanımda 31536000 önerilir.');
            if (fallback_host && !/^https?:\/\//.test(fallback_host)) w.push('⛔ fallback-host tam URL olmalı (http:// veya https:// ile).');
            let c = '# ========================================\n# F5 BIG-IP LTM — HTTP Profile\n# ========================================\n\n';
            c += '# Varsayılan "http" profilini değil, ondan türetilmiş profili kullanın (varsayılanı paylaşan tüm VS\'ler etkilenir)\n';
            c += 'tmsh create ltm profile http ' + profile_name + ' defaults-from http';
            c += ' insert-xforwarded-for ' + insert_xforwarded_for;
            c += ' oneconnect-transformations ' + oneconnect;
            c += ' redirect-rewrite ' + redirect_rewrite;
            if (header_erase) c += ' header-erase "' + header_erase + '"';
            if (header_insert) c += ' header-insert "' + header_insert + '"';
            c += '\n';
            const enf = [];
            const hasM = methods && methods.length;
            if (hasM) enf.push('known-methods replace-all-with { ' + methods.join(' ') + ' }');
            if (hasM || unknown_method !== 'allow') enf.push('unknown-method ' + unknown_method);
            if (max_header_size) enf.push('max-header-size ' + max_header_size);
            if (max_header_count) enf.push('max-header-count ' + max_header_count);
            if (enf.length) c += 'tmsh modify ltm profile http ' + profile_name + ' enforcement { ' + enf.join(' ') + ' }\n';
            if (hsts === 'enabled') c += 'tmsh modify ltm profile http ' + profile_name + ' hsts { mode enabled maximum-age ' + (hsts_age || '31536000') + ' include-subdomains ' + hsts_sub + ' }\n';
            if (server_agent) c += 'tmsh modify ltm profile http ' + profile_name + ' server-agent-name ' + server_agent + '\n';
            if (fallback_host) c += 'tmsh modify ltm profile http ' + profile_name + ' fallback-host ' + fallback_host + '\n';
            c += '\n# VS\'ye bağlama (mevcut http profilinin yerine):\n# tmsh modify ltm virtual <vs> profiles delete { http } profiles add { ' + profile_name + ' }\n\n';
            c += '# Doğrulama:\n# tmsh list ltm profile http ' + profile_name + '\n';
            if (hasM) c += '# curl -X TRACE -v http://<vip>/     # listede yoksa: Connection reset by peer\n';
            if (max_header_size) c += '# grep 011f0005 /var/log/ltm          # başlık boyutu aşımları\n';
            if (hsts === 'enabled') c += '# curl -kI https://<vip>/ | grep -i strict-transport-security\n';
            return { config: c, warnings: w };
        });
    }
};

// ── F5 LTM: HTTP Profil Denetle (list … all-properties yapıştır → risk ve sapma listesi; tarayıcıda işlenir) ──
// Varsayılanlar: clouddocs tmsh-reference ltm profile http (v16). Kaynaklar: K85840901 (metot), K8482 (başlık boyutu), K000161470 (başlık sayısı).
function cgF5ParseTmsh(txt) {
    // tmsh list çıktısı → { başlık, alanlar: iç içe nesne }; "{ a b c }" satır içi listeler dizi olur
    const lines = String(txt || '').replace(/\r/g, '').split('\n'), root = {}, stack = [root]; let head = null;
    for (const raw of lines) {
        const l = raw.trim(); if (!l || l.startsWith('#')) continue;
        if (l === '}') { if (stack.length > 1) stack.pop(); continue; }
        const inl = l.match(/^(\S+)\s+\{\s*(.*?)\s*\}$/);
        if (inl) { stack[stack.length - 1][inl[1]] = inl[2] ? inl[2].split(/\s+/) : []; continue; }
        const blk = l.match(/^(.*?)\s*\{$/);
        if (blk) { if (!head && stack.length === 1) { head = blk[1]; continue; } const o = {}; stack[stack.length - 1][blk[1]] = o; stack.push(o); continue; }
        const kv = l.match(/^(\S+)\s+(.*)$/); if (kv) stack[stack.length - 1][kv[1]] = kv[2].replace(/^"|"$/g, ''); else stack[stack.length - 1][l] = true;
    }
    return { head, f: root };
}
F5LTM.httpaudit = {
    label: 'HTTP Profil Denetle',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clipboard-check',
                title: 'HTTP Profil Denetle',
                desc: 'tmsh list ltm profile http <ad> all-properties çıktısını yapıştırın: riskli metot ayarları, başlık sınırları, HSTS, Server sızıntısı ve varsayılandan sapmalar listelenir. Metin tarayıcınızda işlenir, hiçbir yere gönderilmez.',
                badge: { text: 'Denetim', cls: 'info' }
            },
            sections: [
                {
                    title: 'Profil çıktısı',
                    icon: 'fas fa-paste',
                    fields: [
                        { name: 'dump', why: "all-properties miras alınan değerleri de gösterir; yalnız <code>list</code> çıktısı sadece değiştirilen alanları verir ve denetim eksik kalır. Canlı cihaz çıktısında alan adı ve IP'ler bulunabilir: yalnız bu sayfada işlenir.", label: 'tmsh list ltm profile http <ad> all-properties', type: 'textarea', required: true, placeholder: 'ltm profile http http_ornek {\n    defaults-from /Common/http\n    enforcement {\n        known-methods { CONNECT DELETE GET HEAD LOCK OPTIONS POST PROPFIND PUT TRACE UNLOCK }\n        max-header-count 64\n        max-header-size 32768\n        unknown-method allow\n    }\n    hsts {\n        mode disabled\n    }\n    insert-xforwarded-for disabled\n    server-agent-name BigIP\n}', hint: 'Komut çıktısını olduğu gibi yapıştırın' },
                        { name: 'vs_kind', why: "HSTS ve redirect-rewrite yalnız HTTPS sonlandıran (client-ssl'li) VS'lerde anlamlıdır; SNAT kullanılıyorsa XFF olmadan sunucu gerçek istemciyi göremez.", label: 'Profilin kullanıldığı VS', type: 'select', options: [
                            { value: 'https', label: 'HTTPS (client-ssl ile sonlandırılıyor)' },
                            { value: 'http', label: 'Yalnız HTTP' }
                        ]}
                    ]
                }
            ],
            submit: 'Denetle'
        }, (data) => cgF5HttpAudit(data));
    }
};
function cgF5HttpAudit(data) {
    const P = cgF5ParseTmsh(data.dump), f = P.f, e = (typeof f.enforcement === 'object' && !Array.isArray(f.enforcement)) ? f.enforcement : {}, h = (typeof f.hsts === 'object' && !Array.isArray(f.hsts)) ? f.hsts : {};
    const name = (P.head || '').replace(/^ltm profile http\s+/, '').trim() || '(adsız)';
    const R = [], add = (lvl, msg, fix) => R.push({ lvl, msg, fix });
    if (!/^ltm profile http\b/.test(P.head || '')) add('⛔', 'Bu bir "ltm profile http" çıktısı gibi görünmüyor.', 'tmsh list ltm profile http <ad> all-properties çıktısını yapıştırın.');
    if (/^(\/Common\/)?http$/.test(name)) add('⚠', 'Varsayılan "http" profili denetleniyor: bunu değiştirmek onu kullanan TÜM virtual server\'ları etkiler.', 'defaults-from http ile yeni profil oluşturup onu değiştirin.');
    const km = Array.isArray(e['known-methods']) ? e['known-methods'] : null, um = e['unknown-method'];
    if (!km && !um) add('ℹ', 'enforcement bloğu yok: çıktı all-properties ile alınmamış olabilir; metot ve başlık denetimi yapılamadı.', 'Komutu all-properties ile tekrar çalıştırın.');
    if (km && km.includes('TRACE')) add('⚠', 'TRACE bilinen metotlar listesinde: çapraz site izleme (XST) riski, güvenlik taramalarında bulgu olarak çıkar.', 'enforcement { known-methods delete { TRACE } unknown-method reject } (K85840901)');
    if (km && km.includes('CONNECT')) add('ℹ', 'CONNECT listede: yalnız ileri proxy (forward proxy) VS\'lerinde gerekir.', 'Ters proxy (normal web VS) için listeden çıkarın.');
    if (um === 'allow') add('⚠', 'unknown-method allow: listede olmayan her metot (ör. uydurma "FOO", WebDAV metotları) sunucuya ulaşır.', 'Gerekli metotları known-methods\'a yazıp unknown-method reject yapın.');
    if (um === 'pass-through') add('⚠', 'unknown-method pass-through: bu isteklerde BIG-IP HTTP işlemeyi bırakır; iRule HTTP olayları, cookie persistence, başlık ekleme ve WAF denetimi atlanabilir.', 'reject ya da metodu known-methods\'a ekleyin.');
    if (um === 'reject' && km && !km.includes('GET')) add('⛔', 'GET bilinen metotlarda yok ve bilinmeyenler reddediliyor: sitenin hiçbir sayfası açılmaz.', 'known-methods add { GET HEAD }');
    const mhs = +e['max-header-size'], mhc = +e['max-header-count'];
    if (mhs && mhs < 16384) add('⚠', 'max-header-size ' + mhs + ': büyük çerezli (SSO, çok sayıda analitik çerezi) kullanıcılar bağlantı sıfırlaması alır; /var/log/ltm\'de 011f0005 görünür (K8482).', 'Varsayılan 32768; gerçek istek boyutlarına göre ayarlayın.');
    if (mhs && mhs > 65536) add('ℹ', 'max-header-size ' + mhs + ': varsayılanın çok üstünde; her bağlantı için daha fazla bellek ayrılır ve büyük başlıklı saldırılara alan açılır.', 'Gerekçesi yoksa 32768–65536 aralığına çekin.');
    if (mhc && mhc < 32) add('⚠', 'max-header-count ' + mhc + ': bazı tarayıcı/proxy zincirleri bu sınırı aşar (K000161470).', 'Varsayılan 64.');
    if (e['oversize-client-headers'] === 'pass-through' || e['excess-client-headers'] === 'pass-through') add('⚠', 'Sınırı aşan başlıklar pass-through: sınır aşımında bağlantı kesilmez ama HTTP işleme bırakılır; boyut sınırı fiilen koruma sağlamaz.', 'reject (varsayılan)');
    if (data.vs_kind === 'https') {
        if (h.mode !== 'enabled') add('⚠', 'HSTS kapalı: HTTPS sitesinde tarayıcı ilk isteği HTTP ile yapabilir (SSL strip).', 'hsts { mode enabled maximum-age 31536000 }');
        else if (+h['maximum-age'] && +h['maximum-age'] < 15552000) add('ℹ', 'HSTS maximum-age ' + h['maximum-age'] + ' sn: 180 günden kısa; tarama araçları genellikle en az 6 ay ister.', 'maximum-age 31536000');
        if (f['redirect-rewrite'] === 'none') add('ℹ', 'redirect-rewrite none: sunucu http:// Location dönerse istemci şifresiz adrese düşer.', 'redirect-rewrite matching');
    } else if (h.mode === 'enabled') add('ℹ', 'HSTS açık ama VS yalnız HTTP: tarayıcılar HTTP yanıtındaki HSTS başlığını yok sayar.', 'HSTS\'i HTTPS VS\'nin profilinde açın.');
    if (!f['server-agent-name'] || f['server-agent-name'] === 'BigIP') add('ℹ', 'server-agent-name BigIP: BIG-IP\'nin kendi yanıtları (yönlendirme, fallback, iRule yanıtı) cihaz türünü açığa çıkarır.', 'server-agent-name none');
    if (f['insert-xforwarded-for'] !== 'enabled') add('ℹ', 'insert-xforwarded-for kapalı: SNAT kullanılıyorsa sunucu tüm istekleri BIG-IP adresinden görür.', 'insert-xforwarded-for enabled (sunucu yalnız BIG-IP\'den gelen XFF\'e güvenmeli)');
    if (f['accept-xff'] === 'enabled') add('⚠', 'accept-xff enabled: istemcinin gönderdiği X-Forwarded-For\'a güveniliyor; yalnız önünde güvenilir bir proxy varsa doğru.', 'accept-xff disabled');
    if (f['fallback-host'] && f['fallback-host'] !== 'none') add('ℹ', 'fallback-host ' + f['fallback-host'] + ': pool boşken istemci 302 ile buraya gider; adresin aynı VS olmadığından emin olun (döngü).', '');
    const order = { '⛔': 0, '⚠': 1, 'ℹ': 2 }; R.sort((a, b) => order[a.lvl] - order[b.lvl]);
    let c = '# ========================================\n# HTTP Profil Denetimi — ' + name + '\n# ========================================\n';
    c += '# ' + R.filter(x => x.lvl === '⛔').length + ' kritik · ' + R.filter(x => x.lvl === '⚠').length + ' uyarı · ' + R.filter(x => x.lvl === 'ℹ').length + ' bilgi\n\n';
    if (!R.length) c += '# Belirgin risk bulunamadı.\n';
    R.forEach((x, k) => { c += '# ' + (k + 1) + ') ' + x.lvl + ' ' + x.msg + '\n' + (x.fix ? '#    Öneri: ' + x.fix + '\n' : '') + '\n'; });
    const fixes = [];
    if (km && km.includes('TRACE') || um === 'allow') fixes.push('enforcement { known-methods delete { ' + ['TRACE', 'CONNECT'].filter(x => km && km.includes(x)).join(' ') + ' } unknown-method reject }'.replace('known-methods delete {  } ', ''));
    if (data.vs_kind === 'https' && h.mode !== 'enabled') fixes.push('hsts { mode enabled maximum-age 31536000 }');
    if (!f['server-agent-name'] || f['server-agent-name'] === 'BigIP') fixes.push('server-agent-name none');
    if (fixes.length && !/^(\/Common\/)?http$/.test(name)) c += '# Önerilen düzeltme (test ortamında deneyin):\ntmsh modify ltm profile http ' + name + ' ' + fixes.join(' ') + '\n';
    return { config: c, warnings: R.filter(x => x.lvl !== 'ℹ').map(x => x.lvl + ' ' + x.msg) };
}

// ── F5 LTM: TCP Profile ───────────────────────────────────────────────────────
F5LTM.tcpprofile = {
    label: 'TCP Profile',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-plug',
                title: 'TCP Profile',
                desc: 'WAN veya LAN optimizasyonu için TCP bağlantı parametrelerini ayarlar; boşta kalma süresi, Nagle algoritması ve tıkanıklık kontrolü yapılandırılabilir.'
            },
            sections: [
                {
                    title: 'TCP Profile',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'profile_name', why: "Özel TCP profili oluşturulmazsa VS'ye tcp varsayılanı uygulanır; yüksek gecikmeli WAN bağlantılarında bu varsayılan ciddi performans kaybı yaratır ama hata üretmediği için fark edilmez.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'tcp-wan-optimized', hint: 'TCP profili için benzersiz bir isim.' },
                        { name: 'parent_profile', why: "Parent profil tüm ayarların temelini belirler; <code>tcp-lan-optimized</code> ile <code>tcp-wan-optimized</code> arasında tampon ve pencere boyutları çok farklıdır. Yanlış parent throughput'u düşürür ve sorun boş yere uygulamada aranır.", label: 'Parent Profile', type: 'select', options: [
                            { value: 'tcp-wan-optimized', label: 'tcp-wan-optimized' },
                            { value: 'tcp-lan-optimized', label: 'tcp-lan-optimized' },
                            { value: 'tcp', label: 'tcp' }
                        ]},
                        { name: 'idle_timeout', why: "Idle timeout çok kısaysa uzun süre sessiz kalan oturumlar (veritabanı, SSH, websocket) sessizce düşer ve istemci sebebini anlayamaz. Çok uzunsa bağlantı tablosu dolar ve bellek tükenir.", label: 'Idle Timeout (sn)', type: 'text', required: true, placeholder: '300', hint: 'Boşta bağlantı zaman aşımı (saniye).' },
                        { name: 'nagle', why: "Nagle küçük paketleri birleştirerek bant genişliğini korur, ancak interaktif ve düşük gecikme isteyen uygulamalarda fark edilir ek gecikme yaratır. Gerçek zamanlı protokollerde kapatılması önerilir.", label: 'Nagle', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'congestion_control', why: "Congestion control algoritması kayıplı WAN hatlarında throughput'u doğrudan belirler; kayıp toleransı yüksek algoritmalar uzak şube bağlantılarında çok daha iyi sonuç verir. Veri merkezi içi trafikte yanlış seçim gereksiz yavaşlama üretir.", label: 'Congestion Control', type: 'select', options: [
                            { value: 'woodside', label: 'woodside' },
                            { value: 'highspeed', label: 'highspeed' },
                            { value: 'westwood', label: 'westwood' },
                            { value: 'reno', label: 'reno' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { profile_name, parent_profile, idle_timeout, nagle, congestion_control } = data;
            const idleTimeout = idle_timeout || '300';
            let c = '# ========================================\n# F5 BIG-IP LTM — TCP Profile\n# ========================================\n\n';
            c += 'tmsh create ltm profile tcp ' + profile_name;
            c += ' defaults-from ' + parent_profile;
            c += ' idle-timeout ' + idleTimeout;
            c += ' nagle ' + nagle;
            c += ' congestion-control ' + congestion_control + '\n\n';
            c += '# Doğrulama:\n# tmsh list ltm profile tcp ' + profile_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: Route Domain (VRF) ────────────────────────────────────────────────
F5LTM.routedomain = {
    label: 'Route Domain (VRF)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sitemap',
                title: 'Route Domain (VRF)',
                desc: 'Müşteri veya uygulama trafiğini birbirinden izole etmek için sanal yönlendirme alanı (Route Domain / VRF) oluşturur.'
            },
            sections: [
                {
                    title: 'Route Domain Ayarları',
                    icon: 'fas fa-project-diagram',
                    fields: [
                        { name: 'rd_id', why: "Route domain ID tüm nesne yollarında <code>%ID</code> soneki olarak kullanılır; ID değiştirildiğinde tüm self IP, VIP ve pool üye adresleri kırılır. ID benzersiz olmalı, 0 varsayılan domain'dir.", label: 'Route Domain ID', type: 'text', required: true, placeholder: '10', hint: 'Benzersiz sayısal Route Domain kimliği.' },
                        { name: 'rd_name', why: "Route domain adı yalnızca operasyonel takip içindir; konfigürasyon sözdiziminde ID kullanıldığı için ikisinin karıştırılması yanlış nesneye işlem yapılmasına yol açar.", label: 'Route Domain Adı', type: 'text', required: true, placeholder: 'CUSTOMER-A', hint: 'İzolasyon alanının adı.' },
                        { name: 'parent_rd', why: "Parent route domain tanımlanırsa alt domain kendi tablosunda bulamadığı rotaları üstte arar; strict isolation ile birlikte yanlış kurgulanırsa trafik beklenmedik şekilde başka bir müşterinin alanına sızabilir.", label: 'Parent RD', type: 'text', optional: true, placeholder: '0', hint: 'Üst Route Domain ID\'si; genellikle 0.' },
                        { name: 'vlans', why: "VLAN atanmayan route domain hiç trafik görmez; aynı VLAN birden fazla route domain'e atanamaz. Bu atama yanlış yapılırsa çakışan IP alanları birbirine karışır ve yönlendirme öngörülemez hale gelir.", label: 'VLAN\'lar (virgülle ayrılmış)', type: 'text', validate: 'port_match', optional: true, placeholder: 'vlan-customer-a', hint: 'Bu route domain\'e atanacak VLAN\'lar.' },
                        { name: 'strict_isolation', why: "Strict isolation açıkken route domain'ler arası trafik tamamen engellenir ve çok kiracılı (multi-tenant) ortamda sızıntı önlenir. Kapatıldığında müşteriler birbirinin ağına erişebilir; bu çoğunlukla fark edilmeyen bir güvenlik açığıdır.", label: 'Strict Isolation', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { rd_id, rd_name, parent_rd, vlans: vlansRaw, strict_isolation } = data;
            const vlans = vlansRaw ? vlansRaw.split(',').map(s => s.trim()).filter(Boolean) : [];
            let c = '# ========================================\n# F5 BIG-IP LTM — Route Domain (VRF)\n# ========================================\n\n';
            c += 'tmsh create net route-domain ' + rd_name + ' id ' + rd_id + ' strict ' + strict_isolation;
            if (parent_rd) c += ' parent ' + parent_rd;
            if (vlans.length > 0) {
                c += ' vlans replace-all-with {';
                vlans.forEach(v => { c += ' ' + v; });
                c += ' }';
            }
            c += '\n\n';
            c += '# Doğrulama:\n# tmsh list net route-domain ' + rd_name + '\n# tmsh show net route-domain ' + rd_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: VLAN + Self IP ────────────────────────────────────────────────────
F5LTM.vlanself = {
    label: 'VLAN + Self IP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-ethernet',
                title: 'VLAN + Self IP',
                desc: 'BIG-IP üzerinde VLAN tanımlar ve bu VLAN\'a bağlı Self IP adresi atar; ağ izolasyonu ve erişim denetimi sağlar.'
            },
            sections: [
                {
                    title: 'VLAN',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'vlan_name', why: "VLAN adı self IP, route domain ve trunk atamalarında referans edilir; isim değişirse bağlı nesnelerin referansı kopar ve ağ katmanı sessizce bozulur.", label: 'VLAN Adı', type: 'text', required: true, placeholder: 'vlan-dmz', hint: 'VLAN için benzersiz bir isim.' },
                        { name: 'vlan_tag', why: "VLAN tag üst switch'teki tag ile birebir aynı olmalı; uyuşmazlıkta arayüz up görünür ama hiç paket geçmez ve sorun boşuna fiziksel katmanda aranır.", label: 'VLAN Tag', type: 'text', validate: 'vlan', required: true, placeholder: '200', hint: 'IEEE 802.1Q VLAN kimliği.' },
                        { name: 'interfaces', why: "Tagged arayüzde tag belirtilmezse trafik untagged kabul edilir ve düşer. Aynı arayüz birden çok VLAN'da tagged kullanılabilir, ancak untagged yalnızca tek VLAN'da olabilir.", label: 'Interface\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: '1.1,1.2', hint: 'VLAN\'a dahil edilecek fiziksel arayüzler.' },
                        { name: 'intf_mode', why: "Switch portu <b>trunk</b> ise <code>tagged</code>, <b>access</b> ise <code>untagged</code> seçin. Uyuşmazlıkta arayüz up görünür ama ARP çözülmez ve trafik geçmez (f5-05). Bir arayüz yalnız bir VLAN'da untagged olabilir.", label: 'Arayüz modu', type: 'select', options: [
                            { value: 'tagged', label: 'tagged (switch portu trunk, 802.1Q)', selected: true },
                            { value: 'untagged', label: 'untagged (switch portu access)' }
                        ]},
                    ]
                },
                {
                    title: 'Self IP',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'self_ip', why: "Self IP BIG-IP'nin o VLAN'daki adresidir; olmadan bu VLAN'daki pool üyelerine erişilemez ve tüm monitor'lar down kalır. HA çiftinde ayrıca floating self IP tanımlanmazsa backend'in default gateway'i failover sonrası ölü cihazı gösterir.", label: 'Self IP Adresi', type: 'text', required: true, validate: 'ip', placeholder: '192.168.200.1', hint: 'BIG-IP\'nin bu VLAN\'daki IP adresi.' },
                        { name: 'self_prefix', why: "Maske yanlış verilirse BIG-IP backend subnet'ini yerel saymaz ve trafiği default route'a gönderir; bu da asimetrik yönlendirme ve zaman aşımı üretir.", label: 'Subnet Mask', type: 'text', required: true, validate: 'netmask', placeholder: '255.255.255.0', hint: 'Alt ağ maskesi (CIDR\'a otomatik çevrilir).' },
                        { name: 'allow_service', why: "Self IP üzerinde <code>allow all</code> yönetim servislerini uygulama ağına açar ve saldırı yüzeyini büyütür; <code>allow none</code> ise ping ve bazı monitor'lar dahil her şeyi kapatarak sorun gidermeyi imkansız kılar. Yalnızca gerekli portlara izin vermek doğru yaklaşımdır.", label: 'Allow Service', type: 'select', options: [
                            { value: 'default', label: 'default' },
                            { value: 'all', label: 'all' },
                            { value: 'none', label: 'none' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { vlan_name, vlan_tag, interfaces: intfsRaw, self_ip, self_prefix, allow_service } = data;
            const mode = data.intf_mode === 'untagged' ? 'untagged' : 'tagged';
            const intfs = intfsRaw.split(',').map(s => s.trim()).filter(Boolean);
            // Eskiden her oktetteki 1 bitlerini sayiyordu: '24' girilince /2 uretiyordu.
            const cidr = cgMaskLen(self_prefix);
            const w = [];
            if (mode === 'untagged' && intfs.length > 1) w.push('⚠ Birden çok arayüz untagged eklendi: aynı VLAN\'da birden çok untagged arayüz köprü gibi davranır ve döngü riski yaratır; iki arayüz tek bağlantı olacaksa trunk (LAG) kullanın.');
            if (allow_service === 'all') w.push('⛔ allow-service all: bu self IP\'ye gelen her port açılır. Dışa bakan VLAN\'da none, iç/HA VLAN\'ında default kullanın (f5-03).');
            else if (allow_service === 'default') w.push('ℹ allow-service default: SSH (22), HTTPS (443), SNMP, DNS ve HA portları (4353, 1026) açılır. İnternete bakan self IP\'de none olmalı; HA self IP\'sinde none HA\'yı bozar.');
            w.push('ℹ Tag, switch\'teki VLAN numarasıyla aynı olmalı; tag verilmezse BIG-IP 4094\'ten geriye otomatik bir numara seçer. Değişiklikten sonra "tmsh save sys config" ile kaydedin; aksi halde yeniden başlatmada kaybolur (f5-01).');
            const selfName = 'self_' + vlan_name;
            let c = '# ========================================\n# F5 BIG-IP LTM — VLAN + Self IP\n# ========================================\n\n';
            c += 'tmsh create net vlan ' + vlan_name + ' interfaces add {';
            intfs.forEach(i => { c += ' ' + i + ' { ' + mode + ' }'; });
            c += ' } tag ' + vlan_tag + '\n\n';
            c += 'tmsh create net self ' + selfName + ' address ' + self_ip + '/' + cidr + ' vlan ' + vlan_name + ' allow-service ' + allow_service + '\n\n';
            c += 'tmsh save sys config\n\n';
            c += '# Not: Subnet mask ' + self_prefix + ' → /' + cidr + ' CIDR\'a dönüştürüldü\n\n';
            c += '# Doğrulama:\n# tmsh list net vlan ' + vlan_name + '\n# tmsh list net self ' + selfName + '\n# tmsh show net arp   (incomplete = L2 sorunu: mod/tag/switch portu)\n';
            return { config: c, warnings: w };
        });
    }
};

// ── F5 LTM: Trunk / LAG ───────────────────────────────────────────────────────
F5LTM.trunk = {
    label: 'Trunk / LAG',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'Trunk / LAG',
                desc: 'Birden fazla fiziksel arayüzü LACP protokolü ile birleştirerek yük paylaşımlı ve yüksek erişilebilirlikli trunk oluşturur.'
            },
            sections: [
                {
                    title: 'Trunk Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'trunk_name', why: "Trunk adı VLAN atamalarında kullanılır; trunk silinip yeniden oluşturulursa bağlı VLAN'lar trafiksiz kalır. Değişiklikten sonra <code>tmsh save sys config</code> unutulursa reboot'ta eski hale döner.", label: 'Trunk Adı', type: 'text', required: true, placeholder: 'trunk-uplink', hint: 'Trunk için benzersiz bir isim.' },
                        { name: 'interfaces', why: "Trunk üyeleri karşı switch tarafında aynı port-channel içinde olmalı; tek taraflı yapılandırma paket kaybına veya döngülere yol açar. Farklı hızdaki arayüzler aynı trunk'a konulmamalıdır.", label: 'Interface\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: '1.1,1.2', hint: 'Trunk\'a dahil edilecek fiziksel arayüzler.' },
                        { name: 'lacp_mode', why: "<b>Active</b> mod LACP paketi gönderir, <b>passive</b> yalnızca yanıt verir; her iki uç passive ise kanal hiç kurulmaz. LACP kapalıyken switch tarafı da static olmalı, aksi halde bağlantı kararsız çalışır.", label: 'LACP Mode', type: 'select', options: [
                            { value: 'active', label: 'active' },
                            { value: 'passive', label: 'passive' },
                            { value: 'off', label: 'off' }
                        ]},
                        { name: 'distribution_hash', why: "Dağıtım hash'i trafiğin üyeler arasında nasıl bölüneceğini belirler; az sayıda kaynak IP varsa kaynak-hedef IP hash'i ile tüm yük tek linke biner ve trunk kapasitesi kullanılamaz. Katman 4 tabanlı hash daha dengeli dağılım verir.", label: 'Distribution Hash', type: 'select', options: [
                            { value: 'dst-mac', label: 'dst-mac' },
                            { value: 'src-dst-mac', label: 'src-dst-mac' },
                            { value: 'dst-ip', label: 'dst-ip' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { trunk_name, interfaces: intfsRaw, lacp_mode, distribution_hash } = data;
            const intfs = intfsRaw.split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# F5 BIG-IP LTM — Trunk / LAG\n# ========================================\n\n';
            c += 'tmsh create net trunk ' + trunk_name + ' interfaces replace-all-with {';
            intfs.forEach(i => { c += ' ' + i; });
            c += ' } lacp ' + lacp_mode + ' distribution-hash ' + distribution_hash + '\n\n';
            c += '# Doğrulama:\n# tmsh list net trunk ' + trunk_name + '\n# tmsh show net trunk ' + trunk_name + '\n';
            return c;
        });
    }
};

// ── F5 GTM: DNS / GSLB ────────────────────────────────────────────────────────
F5LTM.gslb = {
    label: 'DNS / GSLB',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe-americas',
                title: 'DNS / GSLB',
                desc: 'GTM modülü ile coğrafi veya performans tabanlı global yük dengeleme tanımlar; Wide IP ve pool üyeleri yapılandırılır.'
            },
            sections: [
                {
                    title: 'Wide IP',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'wide_ip_name', why: "Wide IP istemcinin sorguladığı FQDN'dir; üst DNS'te BIG-IP DNS'e delegasyon yapılmamışsa bu isim hiç sorulmaz ve GSLB devreye girmez.", label: 'Wide IP (FQDN)', type: 'text', required: true, placeholder: 'app.example.com', hint: 'DNS sorgu hedefi olacak tam domain adı.' },
                        { name: 'pool_name', why: "GSLB pool'u wide IP'ye bağlanmazsa sorgular yanıtsız kalır veya fallback kaydına düşer; kullanıcılar uygulamaya hiç ulaşamaz.", label: 'Pool Adı', type: 'text', required: true, placeholder: 'GSLB-POOL-APP', hint: 'GSLB havuzu için benzersiz bir isim.' }
                    ]
                },
                {
                    title: 'Pool Üyeleri',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'members', why: "Üyeler BIG-IP üzerinde tanımlı server ve virtual server nesneleriyle birebir eşleşmeli; isim uyuşmazlığında üye <b>unknown</b> durumunda kalır. iQuery (TCP 4353) engellenmişse üye durumu hiç öğrenilemez ve ölü datacenter yanıtlarda kalmaya devam eder.", label: 'Üyeler (vsname:server, virgülle ayrılmış)', type: 'text', required: true, placeholder: 'vs1:bigip1.example.com,vs2:bigip2.example.com', hint: 'Her üye için virtual server adı ve BIG-IP sunucu adı.' },
                        { name: 'lb_mode', why: "<code>global-availability</code> daima ilk sağlıklı üyeye gönderir ve yük dağıtmaz; round-robin dağıtır ama kullanıcıyı uzak datacenter'a yollayıp gecikmeyi artırabilir. Topology modu coğrafi yakınlık gereken senaryolar içindir.", label: 'LB Modu', type: 'select', options: [
                            { value: 'round-robin', label: 'round-robin' },
                            { value: 'ratio', label: 'ratio' },
                            { value: 'least-connections', label: 'least-connections' },
                            { value: 'topology', label: 'topology' }
                        ]},
                        { name: 'monitor', why: "GSLB monitor'u uzak sanal sunucuların gerçekten erişilebilir olduğunu doğrular; monitor tanımlanmazsa çökmüş bir datacenter DNS yanıtlarında kalmaya devam eder ve kullanıcılar ölü siteye yönlendirilir.", label: 'Monitor', type: 'select', options: [
                            { value: 'http', label: 'http' },
                            { value: 'https', label: 'https' },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'gateway_icmp', label: 'gateway_icmp' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { wide_ip_name, pool_name, lb_mode, monitor, members: membersRaw } = data;
            const memberPairs = membersRaw.split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# F5 BIG-IP GTM — DNS / GSLB\n# ========================================\n\n';
            c += 'tmsh create gtm pool a ' + pool_name + ' load-balancing-mode ' + lb_mode + ' monitor ' + monitor + ' members replace-all-with {';
            memberPairs.forEach(pair => {
                const parts = pair.split(':');
                const vsName = (parts[0] || '').trim();
                const server = (parts[1] || '').trim();
                if (vsName && server) c += ' ' + server + ':' + vsName + ' { }';
            });
            c += ' }\n\n';
            c += 'tmsh create gtm wideip a ' + wide_ip_name + ' pools replace-all-with { ' + pool_name + ' { } }\n\n';
            c += '# Doğrulama:\n# tmsh show gtm wideip a ' + wide_ip_name + '\n# tmsh show gtm pool a ' + pool_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: LTM Traffic Policy ────────────────────────────────────────────────
F5LTM.ltmpolicy = {
    label: 'LTM Traffic Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'LTM Traffic Policy',
                desc: 'HTTP URI, host adı veya metot bazlı eşleşme kurallarıyla trafiği belirli havuzlara yönlendiren LTM politikası oluşturur.'
            },
            sections: [
                {
                    title: 'Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', why: "Traffic policy bir VS'ye bağlanmadan ve <b>publish</b> edilmeden çalışmaz; draft olarak bırakılan policy hiçbir etki üretmez ama çalıştığı sanılır.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-ROUTING', hint: 'Traffic policy için benzersiz bir isim.' },
                        { name: 'rule_name', why: "Kurallar VS üzerinde sıra (ordinal) ile değerlendirilir; genel bir kural üstte kalırsa altındaki özel kurallar hiç çalışmaz ve trafik yanlış pool'a gider.", label: 'Rule Adı', type: 'text', required: true, placeholder: 'RULE-API', hint: 'Policy içindeki kural adı.' }
                    ]
                },
                {
                    title: 'Match Koşulu',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'match_type', why: "Match tipi yanlış seçilirse koşul hiç eşleşmez; örneğin host kontrolü gerekirken path seçilmesi trafiği sessizce default pool'a gönderir. LTM policy iRule'dan daha performanslıdır çünkü TMM içinde optimize çalışır.", label: 'Match Tipi', type: 'select', options: [
                            { value: 'http-uri', label: 'http-uri' },
                            { value: 'http-host', label: 'http-host' },
                            { value: 'http-method', label: 'http-method' }
                        ]},
                        { name: 'match_string', why: "Eşleşme dizesi büyük/küçük harfe ve baştaki eğik çizgiye duyarlıdır; <code>/api/</code> ile <code>/API</code> aynı değildir. Sondaki eğik çizgi unutulursa <code>/apifoo</code> gibi istenmeyen yollar da eşleşir.", label: 'Match String', type: 'text', required: true, placeholder: '/api/', hint: 'Eşleştirilecek URI yolu veya host adı.' }
                    ]
                },
                {
                    title: 'Aksiyon',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'action_type', why: "Aksiyon tipi trafiğin akıbetini belirler; forward yerine yanlışlıkla reset seçilmesi eşleşen tüm istekleri koparır. Aynı kuralda çakışan iki aksiyon tanımlanırsa davranış öngörülemez hale gelir.", label: 'Aksiyon Tipi', type: 'select', options: [
                            { value: 'forward', label: 'forward' },
                            { value: 'redirect', label: 'redirect' },
                            { value: 'reset', label: 'reset' }
                        ]},
                        { name: 'forward_pool', why: "Hedef pool mevcut değilse veya tüm üyeleri down ise eşleşen trafik hiçbir yere gitmez ve istemci zaman aşımı alır. Pool adı partition yolu ile birlikte doğru yazılmalıdır.", label: 'Forward Pool', type: 'text', required: true, placeholder: 'pool-api-backend', hint: 'Trafiğin yönlendirileceği backend pool.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { policy_name, rule_name, match_type, match_string, action_type, forward_pool } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — LTM Traffic Policy\n# ========================================\n\n';
            c += 'tmsh create ltm policy ' + policy_name + ' controls replace-all-with { forwarding } requires replace-all-with { http } strategy first-match legacy';
            c += ' rules replace-all-with { ' + rule_name + ' {';
            c += ' conditions replace-all-with { 0 { ' + match_type + ' path starts-with values replace-all-with { ' + match_string + ' } } }';
            c += ' actions replace-all-with { 0 { forward select pool ' + forward_pool + ' } }';
            c += ' } }\n\n';
            c += '# Doğrulama:\n# tmsh list ltm policy ' + policy_name + '\n# tmsh show ltm policy ' + policy_name + '\n';
            return c;
        });
    }
};

// ── F5 APM: APM Access Policy ─────────────────────────────────────────────────
F5LTM.apm = {
    label: 'APM Access Policy',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'APM Access Policy',
                desc: 'Access Policy Manager ile VPN ve uzak erişim politikası tanımlar; LDAP, RADIUS, sertifika ve SAML kimlik doğrulama desteklenir.'
            },
            sections: [
                {
                    title: 'APM Access Profile',
                    icon: 'fas fa-id-badge',
                    fields: [
                        { name: 'profile_name', why: "APM access profili VS'ye bağlanmadan kimlik doğrulama devreye girmez; ayrıca profil değişiklikleri <b>Apply Access Policy</b> yapılmadan aktif olmaz ve eski politika çalışmaya devam eder.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'APM-VPN-PROFILE', hint: 'APM access profili için benzersiz isim.' },
                        { name: 'auth_type', why: "Kimlik doğrulama tipi dizin altyapısıyla uyumlu olmalı; LDAP yerine AD Auth seçilmesi Kerberos/NTLM bağımlılığı getirir. Yanlış tip tüm oturum açma denemelerinin başarısız olmasına yol açar.", label: 'Auth Tipi', type: 'select', options: [
                            { value: 'ldap', label: 'ldap' },
                            { value: 'radius', label: 'radius' },
                            { value: 'cert', label: 'cert' },
                            { value: 'saml', label: 'saml' }
                        ]},
                        { name: 'idle_timeout', why: "Idle timeout çok kısaysa kullanıcılar form doldururken oturumdan düşer; çok uzunsa terk edilmiş oturumlar APM access session lisansını tüketir ve yeni kullanıcılar hiç bağlanamaz.", label: 'Idle Timeout (sn)', type: 'text', required: true, placeholder: '1200', hint: 'Oturum boşta kalma süresi.' },
                        { name: 'max_session', why: "Maksimum oturum sayısı APM lisans limitini aşamaz; limit dolunca yeni kullanıcılar sessizce reddedilir ve sorun yoğun saatte ortaya çıkar. Çok düşük tutulursa meşru erişim gereksiz yere engellenir.", label: 'Max Session Sayısı', type: 'text', required: true, placeholder: '1000', hint: 'Eş zamanlı maksimum oturum sayısı.' }
                    ]
                },
                {
                    title: 'LDAP Kimlik Doğrulama',
                    icon: 'fas fa-address-book',
                    fields: [
                        { name: 'ldap_server', why: "LDAP sunucusuna BIG-IP self IP'sinden erişilemiyorsa (firewall veya route eksikse) kimlik doğrulama zaman aşımına uğrar ve kullanıcı sebebini göremez. Yedeklilik için birden fazla sunucu tanımlanmalıdır.", label: 'LDAP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'LDAP/Active Directory sunucusunun IP adresi.' },
                        { name: 'ldap_base_dn', why: "Base DN çok dar verilirse bazı kullanıcılar bulunamaz ve girişleri reddedilir; çok geniş verilirse arama yavaşlar ve dizin gereksiz yüklenir. DN yapısı dizindeki gerçek OU hiyerarşisiyle eşleşmelidir.", label: 'LDAP Base DN', type: 'text', required: true, placeholder: 'DC=company,DC=com', hint: 'Kullanıcı arama başlangıç noktası.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { profile_name, auth_type, ldap_server, ldap_base_dn, idle_timeout, max_session } = data;
            const idleTimeout = idle_timeout || '1200';
            const maxSession = max_session || '1000';
            let c = '# ========================================\n# F5 BIG-IP APM — Access Policy\n# ========================================\n\n';
            c += '# APM Access Profile (APM modülü gereklidir):\n';
            c += 'tmsh create apm profile access ' + profile_name + ' accept-languages replace-all-with { en }';
            c += ' access-policy ' + profile_name;
            c += ' max-concurrent-sessions ' + maxSession;
            c += ' inactivity-timeout ' + idleTimeout + '\n\n';
            c += '# LDAP Auth Server:\n';
            c += 'tmsh create apm aaa ldap ' + auth_type + '-server server ' + ldap_server;
            c += ' admin-dn "CN=svc,' + ldap_base_dn + '"';
            c += ' base-dn "' + ldap_base_dn + '"\n\n';
            c += '# Doğrulama:\n# tmsh list apm profile access ' + profile_name + '\n# tmsh show apm access session all\n';
            return c;
        });
    }
};

// ── F5 ASM: ASM Policy Tuning ─────────────────────────────────────────────────
F5LTM.asmtuning = {
    label: 'ASM Policy Tuning',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-sliders-h',
                title: 'ASM Policy Tuning',
                desc: 'Mevcut ASM WAF politikasının öğrenme modu, zorlama seviyesi ve imza setlerini ayarlar; üretim ortamına ince ayar yapmak için kullanılır.'
            },
            sections: [
                {
                    title: 'ASM Policy Tuning',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'policy_name', why: "Düzenlenecek policy adı yanlış yazılırsa komut farklı bir policy'ye uygulanabilir veya <code>not found</code> ile başarısız olur. Yapılan değişiklikler <b>apply policy</b> ve <code>tmsh save sys config</code> yapılmadan kalıcı olmaz.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'ASM-POLICY-APP', hint: 'Düzenlenecek ASM policy adı.' },
                        { name: 'learning_mode', why: "Otomatik öğrenmede (Policy Builder açık) policy trafikten öğrenip kendini gevşetir; saldırı trafiği öğrenilirse koruma sessizce zayıflar. Kapalıyken öneriler Traffic Learning ekranında birikir ama kimse incelemezse policy uygulamanın güncel haliyle uyumsuz kalır.", label: 'Otomatik Öğrenme (Policy Builder)', type: 'select', options: [
                            { value: 'disabled', label: 'Kapalı (öneriler elle onaylanır)' },
                            { value: 'enabled', label: 'Açık (otomatik)' }
                        ]},
                        { name: 'enforcement_mode', why: "Transparent modda hiçbir istek engellenmez, yalnızca log tutulur; güvenlik ekibi korunduğunu sanarak yanlış bir güven duyar. Blocking'e geçmeden önce yanlış pozitifler temizlenmelidir.", label: 'Enforcement Mode', type: 'select', options: [
                            { value: 'blocking', label: 'Blocking' },
                            { value: 'transparent', label: 'Transparent' }
                        ]},
                        { name: 'signature_sets', why: "<code>All Signatures</code> tüm imzaları uygular ve yanlış pozitif riskini ciddi şekilde artırır; uygulamanın gerçek teknolojisine uygun set seçmek hem performans hem doğruluk kazandırır. Yeni imzalar önce staging ile denenmelidir.", label: 'Signature Set\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: 'Generic Detection Signatures', hint: 'Set adları GUI\'deki gibi (ör. Generic Detection Signatures, All Signatures). "all" yazarsanız All Signatures kullanılır.' },
                        { name: 'violation_rating', why: "Violation rating 1–5 arasıdır. Varsayılanda 4–5 (tehdit) engellenir, 1–3 yalnız loglanır. 3'ü (incelenmeli) de engellemek daha sıkıdır ama yanlış pozitifi artırır; uygulama olgunlaştıkça kademeli sıkılaştırın.", label: 'Engellenecek en düşük violation rating', type: 'select', options: [
                            { value: '4', label: '4 ve üstü (varsayılan: tehdit)' },
                            { value: '3', label: '3 ve üstü (sıkı: incelenmeli dahil)' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { policy_name, learning_mode, enforcement_mode, signature_sets: sigSetsRaw, violation_rating } = data;
            const sigSets = sigSetsRaw.split(',').map(s => s.trim()).filter(Boolean).map(s => (s.toLowerCase() === 'all' ? 'All Signatures' : s));
            const pol = policy_name.startsWith('/') ? policy_name : '/Common/' + policy_name, file = '/var/tmp/' + pol.split('/').pop() + '.json';
            let c = '# ========================================\n# F5 BIG-IP ASM — Policy Tuning\n# ========================================\n\n';
            c += '# 1) tmsh ile ayarlanabilenler: engelleme modu ve otomatik öğrenme\n';
            c += 'tmsh modify asm policy ' + pol + ' blocking-mode ' + (enforcement_mode === 'blocking' ? 'enabled' : 'disabled') + ' policy-builder ' + learning_mode + '\n\n';
            c += '# 2) İmza setleri ve violation rating tmsh\'te yok: declarative JSON ile\n';
            c += '#    Önce mevcut policy\'yi dışa aktarın (yedek + düzenlenecek dosya)\n';
            c += 'tmsh save asm policy ' + pol + ' json-file ' + file + '\n\n';
            c += '#    Dosyadaki "policy" nesnesine şu bölümleri ekleyin/birleştirin:\n';
            const js = { 'signature-sets': sigSets.map(n => ({ name: n, alarm: true, block: true })),
                'blocking-settings': { violations: [{ name: 'VIOL_RATING_THREAT', alarm: true, block: true }, { name: 'VIOL_RATING_NEED_EXAMINATION', alarm: true, block: violation_rating === '3' }] } };
            c += JSON.stringify(js, null, 2).split('\n').map(l => '#    ' + l).join('\n') + '\n\n';
            c += '#    Düzenlenen dosyayı yükleyip yayınlayın\n';
            c += 'tmsh load asm policy ' + pol + ' overwrite file ' + file + '\n';
            c += 'tmsh publish asm policy ' + pol + '\n';
            c += 'tmsh save sys config\n\n';
            c += '# Not: JSON\'u tam dosyadan değil yalnız bu parçadan yüklerseniz, dosyada olmayan ayarlar şablon varsayılanına döner.\n';
            c += '# VIOL_RATING_* adları declarative şemadandır (BIG-IP 16+ / NGINX App Protect); sürümünüzün şemasında doğrulayın.\n';
            c += '# Doğrulama:\n# tmsh list asm policy ' + pol + ' blocking-mode policy-builder\n';
            return c;
        });
    }
};

// ── F5 SYS: iApp Template Deployment ─────────────────────────────────────────
F5LTM.iapp = {
    label: 'iApp Deployment',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-puzzle-piece',
                title: 'iApp Deployment',
                desc: 'F5 iApp şablonu kullanarak uygulama hizmeti otomatik olarak dağıtır; şablon değişkenleri key:value formatında girilir.'
            },
            sections: [
                {
                    title: 'iApp Template Deployment',
                    icon: 'fas fa-cubes',
                    fields: [
                        { name: 'app_name', why: "iApp servis adı sonradan değiştirilemez; oluşturulan tüm nesneler bu isim altında bir application service içinde toplanır. Strict updates açıkken bu nesneleri tmsh ile elle değiştirmek reddedilir.", label: 'Uygulama Adı', type: 'text', required: true, placeholder: 'APP-HTTP-SIMPLE', hint: 'iApp servis örneği adı.' },
                        { name: 'template_name', why: "Şablon yolu partition ile birlikte tam verilmelidir; eksik veya yanlış sürüm bir şablon deploy'u <b>template not found</b> ile başarısız kılar. Şablon sürümü yükseltildiğinde mevcut servisler yeniden deploy edilmelidir.", label: 'Template Adı', type: 'text', required: true, placeholder: '/Common/f5.http', hint: 'Kullanılacak iApp şablonunun tam yolu.' },
                        { name: 'variables', why: "Değişken adları şablonun beklediği anahtarlarla birebir eşleşmeli; yanlış anahtar sessizce yok sayılır ve nesne varsayılan değerle oluşur. Bu yüzden hatalı bir deploy hiç hata vermeden yanlış konfigürasyon üretebilir.", label: 'Variables (key:value, virgülle ayrılmış)', type: 'text', required: true, placeholder: 'pool__pool_to_use:pool-backend,pool__monitor:http', hint: 'Şablon parametreleri; her biri key:value formatında.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { app_name, template_name, variables: varsRaw } = data;
            const varPairs = varsRaw.split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# F5 BIG-IP SYS — iApp Template Deployment\n# ========================================\n\n';
            c += 'tmsh create sys application service ' + app_name + ' {\n';
            c += '    template ' + template_name + '\n';
            if (varPairs.length > 0) {
                c += '    variables replace-all-with {\n';
                varPairs.forEach(pair => {
                    const idx = pair.indexOf(':');
                    if (idx > 0) {
                        const k = pair.substring(0, idx).trim();
                        const v = pair.substring(idx + 1).trim();
                        c += '        ' + k + ' { value ' + v + ' }\n';
                    }
                });
                c += '    }\n';
            }
            c += '}\n\n';
            c += '# Doğrulama:\n# tmsh list sys application service ' + app_name + '\n# tmsh show sys application service ' + app_name + '\n';
            return c;
        });
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// F5 BIG-IP — cihaz temeli araçları (2026-09 ekleri)
// Canlı envanterde F5 yok; sözdizimi yalnız resmi tmsh referansından (her aracın başında URL).
// ══════════════════════════════════════════════════════════════════════════════

const CG_F5_IP_RE = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;

// '192.0.2.0/24' → '192.0.2.0/255.255.255.0' (sshd/httpd/snmp allow örnekleri adres/maske biçiminde).
// Tek IP olduğu gibi döner; geçersizse ''.
function cgF5AddrMask(v) {
    const t = String(v || '').trim();
    if (CG_F5_IP_RE.test(t)) return t;
    const m = t.match(/^([\d.]+)\/(\d{1,2})$/);
    if (!m || !CG_F5_IP_RE.test(m[1]) || +m[2] > 32) return '';
    const n = +m[2];
    const bits = n === 0 ? 0 : (0xFFFFFFFF << (32 - n)) >>> 0;
    return m[1] + '/' + [24, 16, 8, 0].map(s => (bits >>> s) & 255).join('.');
}

// Virgül/boşluk ayrılmış listeyi böl, boşları at.
function cgF5List(v) {
    return String(v || '').split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
}

// ── F5 BIG-IP: Sistem Temeli (NTP / DNS / Syslog / Management Route) ─────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_ntp.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_dns.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_syslog.html (remote-servers: host / remote-port / local-ip)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_management-route.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_global-settings.html (hostname)
F5LTM.sysbase = {
    label: 'Sistem Temeli (NTP/DNS/Syslog)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cogs',
                title: 'Sistem Temeli — NTP / DNS / Syslog',
                desc: 'Yeni kurulan BIG-IP\'nin ilk yapılandırması: hostname, NTP, DNS, uzak syslog ve yönetim (mgmt) default route.<br>Örnek: <code>tmsh modify sys ntp servers replace-all-with { 192.0.2.123 }</code>'
            },
            sections: [
                {
                    title: 'Kimlik & Zaman',
                    icon: 'fas fa-clock',
                    info: '<code>replace-all-with</code> mevcut listeyi tamamen değiştirir; eski NTP/DNS sunucuları silinir.',
                    fields: [
                        { name: 'hostname', label: 'Hostname (FQDN)', type: 'text', validate: 'hostname', placeholder: 'bigip1.example.com', hint: 'Boşsa değiştirilmez', why: "DSC (HA) cihaz adı ve sertifikalar hostname'e bağlıdır; trust kurulduktan sonra değiştirmek device trust'ı bozar. Önce hostname, sonra HA kurulmalıdır." },
                        { name: 'ntp1', label: 'NTP Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.123', why: "HA çiftinde saat farkı config-sync ve device trust sertifika doğrulamasını bozar; log zaman damgaları da SIEM'de yanlış sıraya girer." },
                        { name: 'ntp2', label: 'NTP Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.124', hint: 'Yedek NTP (önerilir)' },
                        { name: 'tz', label: 'Saat Dilimi', type: 'text', placeholder: 'Europe/Istanbul', hint: 'tz veritabanı adı; boşsa değiştirilmez' }
                    ]
                },
                {
                    title: 'DNS',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'dns1', label: 'DNS Sunucu 1', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.53', why: "FQDN node, FQDN pool üyesi ve bazı monitor'lar DNS çözümlemesi olmadan çalışmaz; lisans aktivasyonu ve güncelleme kontrolleri de DNS ister." },
                        { name: 'dns2', label: 'DNS Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.54' },
                        { name: 'dns_search', label: 'Arama Alanı (search)', type: 'text', validate: 'hostname', placeholder: 'example.com', hint: 'Opsiyonel' }
                    ]
                },
                {
                    title: 'Uzak Syslog',
                    icon: 'fas fa-file-alt',
                    warn: 'remote-servers <code>replace-all-with</code> ile yazılır: tanımlı diğer uzak syslog sunucuları silinir.',
                    fields: [
                        { name: 'sl_host', label: 'Syslog Sunucusu', type: 'text', validate: 'ip', placeholder: '192.0.2.50', hint: 'Boşsa syslog yazılmaz', why: "Yerel /var/log dönerek silinir; yetkisiz giriş ve config değişikliği izleri ancak uzak kopyada kalır." },
                        { name: 'sl_port', label: 'Port', type: 'text', validate: 'port', placeholder: '514', hint: 'Boşsa varsayılan 514' },
                        { name: 'sl_src', label: 'Kaynak IP (local-ip)', type: 'text', validate: 'ip', placeholder: '192.0.2.10', hint: 'Opsiyonel; bir self IP veya mgmt adresi' }
                    ]
                },
                {
                    title: 'Yönetim Ağı',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'mgmt_gw', label: 'Mgmt Default Gateway', type: 'text', validate: 'ip', placeholder: '192.0.2.1', hint: 'Boşsa yazılmaz', why: "Management-route, TMM (veri düzlemi) rotalarından ayrıdır; tanımlanmazsa NTP/DNS/syslog yönetim arayüzünden çıkamaz ve GUI'ye yalnız aynı subnet'ten erişilir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const hostname = cgEsc(data.hostname || '');
            const ntp = [data.ntp1, data.ntp2].map(v => cgEsc(v || '')).filter(Boolean);
            const tz = cgEsc(data.tz || '');
            const dns = [data.dns1, data.dns2].map(v => cgEsc(v || '')).filter(Boolean);
            const search = cgEsc(data.dns_search || '');
            const slHost = cgEsc(data.sl_host || ''), slPort = cgEsc(data.sl_port || ''), slSrc = cgEsc(data.sl_src || '');
            const gw = cgEsc(data.mgmt_gw || '');
            let c = '# ========================================\n# F5 BIG-IP — Sistem Temeli\n# ========================================\n\n';
            if (hostname) c += 'tmsh modify sys global-settings hostname ' + hostname + '\n\n';
            c += '# NTP\n';
            c += 'tmsh modify sys ntp servers replace-all-with { ' + ntp.join(' ') + ' }\n';
            if (tz) c += 'tmsh modify sys ntp timezone "' + tz + '"\n';
            c += '\n# DNS\n';
            c += 'tmsh modify sys dns name-servers replace-all-with { ' + dns.join(' ') + ' }\n';
            if (search) c += 'tmsh modify sys dns search replace-all-with { ' + search + ' }\n';
            if (slHost) {
                c += '\n# Uzak syslog\n';
                c += 'tmsh modify sys syslog remote-servers replace-all-with { SYSLOG1 { host ' + slHost;
                if (slPort) c += ' remote-port ' + slPort;
                if (slSrc) c += ' local-ip ' + slSrc;
                c += ' } }\n';
            }
            if (gw) {
                c += '\n# Yönetim default route (varsa önce: tmsh delete sys management-route default)\n';
                c += 'tmsh create sys management-route default gateway ' + gw + '\n';
            }
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list sys ntp\n# tmsh list sys dns\n';
            if (slHost) c += '# tmsh list sys syslog remote-servers\n';
            if (gw) c += '# tmsh list sys management-route\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Yönetim Erişimi (SSH / GUI allow, banner, timeout) ────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_sshd.html (allow, banner, banner-text, inactivity-timeout)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_httpd.html (allow, auth-pam-idle-timeout)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_global-settings.html (gui-security-banner, console-inactivity-timeout)
F5LTM.mgmtaccess = {
    label: 'Yönetim Erişimi (SSH/GUI)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-lock',
                title: 'Yönetim Erişimi — SSH / GUI Kısıtlama',
                desc: 'SSH ve web arayüzüne (httpd) yalnız yönetim ağlarından erişim, oturum zaman aşımları ve giriş uyarı metni.<br>Örnek: <code>tmsh modify sys sshd allow replace-all-with { 192.0.2.0/255.255.255.0 }</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'İzinli Yönetim Ağları',
                    icon: 'fas fa-network-wired',
                    warn: 'Liste <code>replace-all-with</code> ile yazılır. Şu an bağlı olduğunuz adres listede yoksa SSH/GUI oturumunuz yeniden bağlanamaz — önce konsol erişiminizi doğrulayın.',
                    fields: [
                        { name: 'net1', label: 'Yönetim Ağı 1', type: 'text', validate: 'ip_cidr', required: true, placeholder: '192.0.2.0/24', hint: 'IP veya CIDR; adres/maske biçimine çevrilir', why: "Varsayılan <code>allow ALL</code> ile SSH ve GUI her self IP'den ve mgmt'den erişilebilir; internete açık bir yönetim arayüzü BIG-IP'de en sık istismar edilen yüzeydir." },
                        { name: 'net2', label: 'Yönetim Ağı 2', type: 'text', validate: 'ip_cidr', placeholder: '198.51.100.0/24' },
                        { name: 'do_ssh', label: 'SSH (sshd) listesine uygula', type: 'checkbox', checked: true },
                        { name: 'do_gui', label: 'GUI (httpd) listesine uygula', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Zaman Aşımı & Banner',
                    icon: 'fas fa-hourglass-half',
                    fields: [
                        { name: 'ssh_to', label: 'SSH Boşta Kalma (sn)', type: 'text', min: 60, max: 86400, placeholder: '900', hint: 'sshd inactivity-timeout; boşsa değiştirilmez', why: "Varsayılan 0 (kapalı): unutulan SSH oturumu sonsuza kadar açık kalır." },
                        { name: 'gui_to', label: 'GUI Boşta Kalma (sn)', type: 'text', min: 60, max: 86400, placeholder: '1200', hint: 'httpd auth-pam-idle-timeout' },
                        { name: 'con_to', label: 'Konsol Boşta Kalma (sn)', type: 'text', min: 60, max: 86400, placeholder: '900', hint: 'global-settings console-inactivity-timeout' },
                        { name: 'banner', label: 'Giriş Uyarı Metni', type: 'text', placeholder: 'Yetkisiz erisim yasaktir', hint: 'SSH banner + GUI güvenlik banner\'ı', why: "Yasal uyarı metni birçok denetim (ISO 27001, PCI) tarafından istenir; yetkisiz erişimde hukuki süreç için kanıt niteliği taşır." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const nets = [data.net1, data.net2].map(v => cgF5AddrMask(cgEsc(v || ''))).filter(Boolean);
            const sshTo = cgEsc(data.ssh_to || ''), guiTo = cgEsc(data.gui_to || ''), conTo = cgEsc(data.con_to || '');
            const banner = cgEsc(data.banner || '');
            let c = '# ========================================\n# F5 BIG-IP — Yönetim Erişimi\n# ========================================\n\n';
            if (!data.do_ssh && !data.do_gui) c += '# UYARI: SSH ve GUI seçilmedi — izinli ağ listesi hiçbir servise uygulanmadı.\n\n';
            if (data.do_ssh) c += 'tmsh modify sys sshd allow replace-all-with { ' + nets.join(' ') + ' }\n';
            if (sshTo) c += 'tmsh modify sys sshd inactivity-timeout ' + sshTo + '\n';
            if (banner) c += 'tmsh modify sys sshd banner enabled banner-text ' + cgQ(data.banner) + '\n';
            if (data.do_gui) c += 'tmsh modify sys httpd allow replace-all-with { ' + nets.join(' ') + ' }\n';
            if (guiTo) c += 'tmsh modify sys httpd auth-pam-idle-timeout ' + guiTo + '\n';
            if (banner) c += 'tmsh modify sys global-settings gui-security-banner enabled gui-security-banner-text ' + cgQ(data.banner) + '\n';
            if (conTo) c += 'tmsh modify sys global-settings console-inactivity-timeout ' + conTo + '\n';
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list sys sshd allow inactivity-timeout\n# tmsh list sys httpd allow auth-pam-idle-timeout\n';
            const w = [];
            if (data.do_ssh && data.do_gui) w.push('⚠ Sıra: önce GUI (httpd) listesini değiştirip GUI\'ye hâlâ girebildiğinizi, sonra SSH listesini değiştirip yeni bir SSH oturumu açabildiğinizi doğrulayın. Kendi yönetim ağınız listede yoksa iki erişimi birden kaybedersiniz ve yalnız konsol kalır (f5-03).');
            else if (data.do_ssh || data.do_gui) w.push('⚠ replace-all-with mevcut listeyi tamamen değiştirir: kendi yönetim istasyonunuzun adresi yeni listede olmalı; yalnız eklemek için "allow add { … }" kullanın.');
            w.push('ℹ httpd/sshd allow listeleri yönetim IP\'si kadar self IP\'lere gelen yönetim bağlantılarını da süzer. Self IP\'lerde ayrıca port lockdown (allow-service) geçerlidir: dışa bakan self IP\'de none olmalı (f5-03).');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 BIG-IP: SNMP ───────────────────────────────────────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_snmp.html
//            (allowed-addresses, communities, users, traps örnekleri; auth-protocol md5|sha, privacy-protocol aes|des)
F5LTM.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP (v3 / v2c)',
                desc: 'İzleme sistemi için SNMP erişimi: izinli adresler, salt okunur v3 kullanıcı veya v2c community ve trap hedefi.<br>Örnek: <code>tmsh modify sys snmp users add { snmpmon { username snmpmon access ro security-level auth-privacy ... } }</code>'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-unlock', desc: 'Düz metin community', badge: { text: 'Eski', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Erişim',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'allow_net', label: 'İzinli Ağ (NMS)', type: 'text', validate: 'ip_cidr', required: true, placeholder: '192.0.2.0/24', hint: 'allowed-addresses; adres/maske biçimine çevrilir', why: "allowed-addresses boşsa SNMP yalnız localhost'a cevap verir; çok geniş verilirse community/kullanıcı tahmini için saldırı yüzeyi açılır." },
                        { name: 'contact', label: 'sys-contact', type: 'text', placeholder: 'noc@example.com' },
                        { name: 'location', label: 'sys-location', type: 'text', placeholder: 'DC1-Rack12' }
                    ]
                },
                {
                    title: 'SNMPv3 Kullanıcı',
                    icon: 'fas fa-user-shield',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', label: 'Kullanıcı Adı', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'snmpmon' },
                        { name: 'v3_auth', label: 'Auth Protokolü', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'md5', label: 'MD5 (zayıf)' }
                        ] },
                        { name: 'v3_auth_pw', label: 'Auth Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'Ornek-AuthPass-01', hint: 'En az 8 karakter' },
                        { name: 'v3_priv', label: 'Privacy Protokolü', type: 'select', options: [
                            { value: 'aes', label: 'AES', selected: true },
                            { value: 'des', label: 'DES (zayıf)' }
                        ], why: "auth-privacy seviyesi hem bütünlük hem gizlilik sağlar; DES ve MD5 günümüzde kırılabilir kabul edilir ve denetimlerde bulgu üretir." },
                        { name: 'v3_priv_pw', label: 'Privacy Parolası', type: 'text', requiredIf: { field: '_cgtype', in: ['v3'] }, placeholder: 'Ornek-PrivPass-01' }
                    ]
                },
                {
                    title: 'SNMPv2c Community',
                    icon: 'fas fa-users',
                    showFor: ['v2c'],
                    warn: 'v2c community ağda düz metin gider. Yalnız ayrık yönetim ağında ve salt okunur (ro) kullanın.',
                    fields: [
                        { name: 'v2_comm', label: 'Community', type: 'text', requiredIf: { field: '_cgtype', in: ['v2c'] }, placeholder: 'Ornek-RO-Topluluk', hint: '"public" kullanmayın' },
                        { name: 'v2_src', label: 'Kaynak (source)', type: 'text', validate: 'ip', placeholder: '192.0.2.20', hint: 'Bu community yalnız bu NMS\'ten kabul edilir' }
                    ]
                },
                {
                    title: 'Trap Hedefi',
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
            const allow = cgF5AddrMask(cgEsc(data.allow_net || ''));
            const contact = cgEsc(data.contact || ''), location = cgEsc(data.location || '');
            const user = cgEsc(data.v3_user || ''), auth = cgEsc(data.v3_auth || 'sha'), authPw = cgEsc(data.v3_auth_pw || '');
            const priv = cgEsc(data.v3_priv || 'aes'), privPw = cgEsc(data.v3_priv_pw || '');
            const comm = cgEsc(data.v2_comm || ''), src = cgEsc(data.v2_src || '');
            const trap = cgEsc(data.trap_host || ''), tport = cgEsc(data.trap_port || '') || '162';
            let c = '# ========================================\n# F5 BIG-IP — SNMP ' + (v3 ? 'v3' : 'v2c') + '\n# ========================================\n\n';
            c += 'tmsh modify sys snmp allowed-addresses replace-all-with { ' + allow + ' }\n';
            if (contact) c += 'tmsh modify sys snmp sys-contact "' + contact + '"\n';
            if (location) c += 'tmsh modify sys snmp sys-location "' + location + '"\n';
            c += '\n';
            if (v3) {
                if (auth === 'md5' || priv === 'des') c += '# UYARI: MD5/DES zayıf kabul edilir — SHA/AES tercih edin.\n';
                const sec = ' security-level auth-privacy auth-protocol ' + auth + ' auth-password ' + authPw + ' privacy-protocol ' + priv + ' privacy-password ' + privPw;
                c += 'tmsh modify sys snmp users add { ' + user + ' { username ' + user + ' access ro' + sec + ' } }\n';
                if (trap) c += 'tmsh modify sys snmp traps add { TRAP_V3 { version 3 host ' + trap + ' port ' + tport + ' security-name ' + user + sec + ' } }\n';
            } else {
                if (!src) c += '# UYARI: source boş — izinli ağdaki her adres bu community ile sorgu yapabilir.\n';
                c += 'tmsh modify sys snmp communities add { COMM_RO { community-name ' + comm + ' access ro' + (src ? ' source ' + src : '') + ' } }\n';
                if (trap) c += 'tmsh modify sys snmp traps add { TRAP_V2 { version 2c community ' + comm + ' host ' + trap + ' port ' + tport + ' } }\n';
            }
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list sys snmp allowed-addresses\n# tmsh list sys snmp ' + (v3 ? 'users' : 'communities') + '\n';
            if (trap) c += '# tmsh list sys snmp traps\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Yerel Kullanıcı, Rol, Parola Politikası ────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_user.html (partition-access, shell, prompt-for-password, roller)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_partition.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_password-policy.html
F5LTM.authuser = {
    label: 'Yerel Kullanıcı & Rol',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-cog',
                title: 'Yerel Kullanıcı, Rol ve Parola Politikası',
                desc: 'Kişiye özel yönetici hesabı (paylaşılan admin yerine), partition bazlı rol ve parola politikası.<br>Örnek: <code>tmsh create auth user netops1 partition-access add { all-partitions { role operator } } shell tmsh prompt-for-password</code>'
            },
            sections: [
                {
                    title: 'Kullanıcı',
                    icon: 'fas fa-user',
                    fields: [
                        { name: 'user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netops1', why: "Paylaşılan <code>admin</code> hesabı ile yapılan değişikliğin kimin olduğu audit log'dan anlaşılamaz; kişisel hesap izlenebilirlik sağlar." },
                        { name: 'role', label: 'Rol', type: 'select', options: [
                            { value: 'operator', label: 'operator — üye enable/disable', selected: true },
                            { value: 'guest', label: 'guest — salt okunur' },
                            { value: 'auditor', label: 'auditor — tüm config salt okunur' },
                            { value: 'application-editor', label: 'application-editor' },
                            { value: 'manager', label: 'manager' },
                            { value: 'certificate-manager', label: 'certificate-manager' },
                            { value: 'irule-manager', label: 'irule-manager' },
                            { value: 'user-manager', label: 'user-manager' },
                            { value: 'resource-admin', label: 'resource-admin' },
                            { value: 'admin', label: 'admin — tam yetki' }
                        ], why: "En az yetki ilkesi: günlük operasyon (üye devreden çıkarma) için operator yeterlidir; admin rolü bash erişimi ve tüm partition'lar üzerinde tam yetki verir." },
                        { name: 'partition', label: 'Partition', type: 'text', placeholder: 'Common', hint: 'Boşsa all-partitions' },
                        { name: 'mk_part', label: 'Partition\'ı oluştur (yeni ise)', type: 'checkbox', checked: false },
                        { name: 'shell', label: 'Kabuk', type: 'select', options: [
                            { value: 'tmsh', label: 'tmsh', selected: true },
                            { value: 'none', label: 'none — yalnız GUI' },
                            { value: 'bash', label: 'bash — yalnız admin' }
                        ], why: "bash kabuğu işletim sistemine sınırsız erişim verir ve yalnız admin rolünde anlamlıdır; operatörlere tmsh veya none verin." },
                        { name: 'password', label: 'Parola', type: 'text', placeholder: 'Ornek-Parola-2026', hint: 'Boşsa prompt-for-password (tmsh sorar)' },
                        { name: 'desc', label: 'Açıklama', type: 'text', placeholder: 'NOC operatoru' }
                    ]
                },
                {
                    title: 'Parola Politikası (sistem geneli)',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'pp_on', label: 'Parola politikasını uygula', type: 'checkbox', checked: true },
                        { name: 'pp_min', label: 'Minimum Uzunluk', type: 'text', min: 6, max: 255, placeholder: '12', hint: 'minimum-length' },
                        { name: 'pp_complex', label: 'Büyük/küçük harf + rakam + özel karakter zorunlu', type: 'checkbox', checked: true },
                        { name: 'pp_fail', label: 'Kilitlenme Öncesi Hatalı Deneme', type: 'text', min: 1, max: 64, placeholder: '5', hint: 'max-login-failures', why: "Varsayılan 0 (kapalı): kaba kuvvet denemelerine sınırsız hak tanır. Değer çok düşükse yanlış yazan operatörler sık kilitlenir." },
                        { name: 'pp_maxdur', label: 'Parola Geçerlilik (gün)', type: 'text', min: 1, max: 99999, placeholder: '90', hint: 'max-duration' },
                        { name: 'pp_mem', label: 'Parola Geçmişi', type: 'text', min: 1, max: 127, placeholder: '5', hint: 'password-memory' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const user = cgEsc(data.user || ''), role = cgEsc(data.role || 'operator');
            const part = cgEsc(data.partition || ''), shell = cgEsc(data.shell || 'tmsh');
            const pw = cgEsc(data.password || ''), desc = cgEsc(data.desc || '');
            const pmin = cgEsc(data.pp_min || ''), pfail = cgEsc(data.pp_fail || ''), pdur = cgEsc(data.pp_maxdur || ''), pmem = cgEsc(data.pp_mem || '');
            let c = '# ========================================\n# F5 BIG-IP — Yerel Kullanıcı & Rol\n# ========================================\n\n';
            if (part && data.mk_part) c += 'tmsh create auth partition ' + part + '\n';
            if (part && (role === 'admin' || role === 'resource-admin')) c += '# UYARI: ' + role + ' rolü yalnız all-partitions ile atanabilir — partition alanını boş bırakın.\n';
            if (shell === 'bash' && role !== 'admin') c += '# UYARI: bash kabuğu yalnız admin rolünde kullanılabilir.\n';
            if (!pw) c += '# NOT: parola girilmedi — tmsh parolayı soracak; bu satırı tek başına çalıştırın.\n';
            c += 'tmsh create auth user ' + user + ' partition-access add { ' + (part || 'all-partitions') + ' { role ' + role + ' } } shell ' + shell;
            if (desc) c += ' description "' + desc + '"';
            c += pw ? ' password ' + pw : ' prompt-for-password';
            c += '\n';
            if (data.pp_on) {
                c += '\ntmsh modify auth password-policy policy-enforcement enabled';
                if (pmin) c += ' minimum-length ' + pmin;
                if (data.pp_complex) c += ' required-uppercase 1 required-lowercase 1 required-numeric 1 required-special 1';
                if (pfail) c += ' max-login-failures ' + pfail;
                if (pdur) c += ' max-duration ' + pdur;
                if (pmem) c += ' password-memory ' + pmem;
                c += '\n';
            }
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list auth user ' + user + '\n';
            if (data.pp_on) c += '# tmsh list auth password-policy\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Uzak Kimlik Doğrulama (LDAP / RADIUS / TACACS+) ───────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_ldap.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_radius-server.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_radius.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_tacacs.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_source.html (type, fallback)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/auth/auth_remote-user.html
F5LTM.remoteauth = {
    label: 'Uzak Kimlik Doğrulama',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-id-badge',
                title: 'Uzak Kimlik Doğrulama — LDAP / RADIUS / TACACS+',
                desc: 'BIG-IP yönetici girişlerini merkezi dizine/AAA sunucusuna bağlar (<code>auth source</code>). Uygulama kullanıcıları için değil, cihaz yönetimi içindir (APM ayrı).',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            configTypes: [
                { id: 'ldap', label: 'LDAP / AD', icon: 'fas fa-address-book', desc: 'LDAPS ile dizin', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'radius', label: 'RADIUS', icon: 'fas fa-broadcast-tower', desc: 'NPS / ISE' },
                { id: 'tacacs', label: 'TACACS+', icon: 'fas fa-terminal', desc: 'ISE / tac_plus' }
            ],
            sections: [
                {
                    title: 'LDAP',
                    icon: 'fas fa-address-book',
                    showFor: ['ldap'],
                    fields: [
                        { name: 'ldap1', label: 'LDAP Sunucu 1', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: '192.0.2.30' },
                        { name: 'ldap2', label: 'LDAP Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.31' },
                        { name: 'ldap_base', label: 'Search Base DN', type: 'text', requiredIf: { field: '_cgtype', in: ['ldap'] }, placeholder: 'dc=example,dc=com' },
                        { name: 'ldap_bind_dn', label: 'Bind DN', type: 'text', placeholder: 'cn=svc-bigip,ou=svc,dc=example,dc=com', hint: 'Boşsa anonim arama' },
                        { name: 'ldap_bind_pw', label: 'Bind Parolası', type: 'text', placeholder: 'Ornek-Bind-Parola' },
                        { name: 'ldap_attr', label: 'Login Attribute', type: 'select', options: [
                            { value: 'samaccountname', label: 'samaccountname (AD)', selected: true },
                            { value: 'uid', label: 'uid (OpenLDAP)' }
                        ] },
                        { name: 'ldap_tls', label: 'Bağlantı', type: 'select', options: [
                            { value: 'ssl', label: 'LDAPS (636, ssl enabled)', selected: true },
                            { value: 'plain', label: 'LDAP (389, şifresiz)' }
                        ], why: "Şifresiz LDAP'ta yönetici parolaları ağda düz metin geçer. LDAPS'te CA dosyası verilip ssl-check-peer açılmazsa sahte LDAP sunucusu parolaları toplayabilir." },
                        { name: 'ldap_ca', label: 'CA Sertifikası (ssl-ca-cert-file)', type: 'text', placeholder: 'ldap-ca.crt', hint: 'Önceden sys file ssl-cert olarak yüklenmiş olmalı' }
                    ]
                },
                {
                    title: 'RADIUS',
                    icon: 'fas fa-broadcast-tower',
                    showFor: ['radius'],
                    fields: [
                        { name: 'rad1', label: 'RADIUS Sunucu 1', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: '192.0.2.40' },
                        { name: 'rad2', label: 'RADIUS Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.41' },
                        { name: 'rad_secret', label: 'Paylaşılan Anahtar', type: 'text', requiredIf: { field: '_cgtype', in: ['radius'] }, placeholder: 'Ornek-Radius-Anahtar' },
                        { name: 'rad_port', label: 'Port', type: 'text', validate: 'port', placeholder: '1812', hint: 'Boşsa 1812' }
                    ]
                },
                {
                    title: 'TACACS+',
                    icon: 'fas fa-terminal',
                    showFor: ['tacacs'],
                    fields: [
                        { name: 'tac1', label: 'TACACS+ Sunucu 1', type: 'text', validate: 'ip', requiredIf: { field: '_cgtype', in: ['tacacs'] }, placeholder: '192.0.2.45' },
                        { name: 'tac2', label: 'TACACS+ Sunucu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.46' },
                        { name: 'tac_secret', label: 'Paylaşılan Anahtar', type: 'text', requiredIf: { field: '_cgtype', in: ['tacacs'] }, placeholder: 'Ornek-Tacacs-Anahtar' },
                        { name: 'tac_service', label: 'Service', type: 'text', requiredIf: { field: '_cgtype', in: ['tacacs'] }, placeholder: 'ppp', hint: 'TACACS+ sunucusundaki servis adı ile aynı olmalı' },
                        { name: 'tac_proto', label: 'Protocol', type: 'text', requiredIf: { field: '_cgtype', in: ['tacacs'] }, placeholder: 'ip' }
                    ]
                },
                {
                    title: 'Varsayılan Yetki & Yedek',
                    icon: 'fas fa-user-tag',
                    fields: [
                        { name: 'def_role', label: 'Varsayılan Rol (remote-user)', type: 'select', options: [
                            { value: 'no-access', label: 'no-access (önerilen)', selected: true },
                            { value: 'guest', label: 'guest' },
                            { value: 'operator', label: 'operator' },
                            { value: 'auditor', label: 'auditor' }
                        ], why: "Dizinde doğrulanan HER kullanıcı bu rolü alır. admin gibi geniş bir rol seçmek şirketteki tüm hesaplara cihaz yönetimi açar; rol eşlemesi (remote-role) ile yalnız belirli gruplara yetki verin." },
                        { name: 'console', label: 'Konsol Erişimi', type: 'select', options: [
                            { value: 'disabled', label: 'disabled', selected: true },
                            { value: 'tmsh', label: 'tmsh' }
                        ] },
                        { name: 'fallback', label: 'Sunucular erişilemezse yerel hesaba düş (fallback)', type: 'checkbox', checked: true, why: "Fallback kapalıyken AAA sunucusu çökerse yerel admin dahil kimse giriş yapamaz (konsol hariç)." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const t = data._cgtype || 'ldap';
            const role = cgEsc(data.def_role || 'no-access'), con = cgEsc(data.console || 'disabled');
            let c = '# ========================================\n# F5 BIG-IP — Uzak Kimlik Doğrulama (' + t.toUpperCase() + ')\n# ========================================\n\n';
            if (t === 'ldap') {
                const srv = [data.ldap1, data.ldap2].map(v => cgEsc(v || '')).filter(Boolean);
                const base = cgEsc(data.ldap_base || ''), bdn = cgEsc(data.ldap_bind_dn || ''), bpw = cgEsc(data.ldap_bind_pw || '');
                const attr = cgEsc(data.ldap_attr || 'samaccountname'), ca = cgEsc(data.ldap_ca || '');
                const tls = data.ldap_tls !== 'plain';
                if (!tls) c += '# UYARI: şifresiz LDAP — parolalar ağda düz metin geçer.\n';
                if (tls && !ca) c += '# UYARI: CA dosyası yok — LDAP sunucu sertifikası doğrulanmaz (ssl-check-peer kapalı).\n';
                if (bdn && !bpw) c += '# UYARI: Bind DN var ama parola yok — bind başarısız olur.\n';
                c += 'tmsh create auth ldap system-auth servers add { ' + srv.join(' ') + ' } port ' + (tls ? '636' : '389');
                c += ' search-base-dn "' + base + '" login-attribute ' + attr;
                if (bdn) c += ' bind-dn "' + bdn + '"';
                if (bpw) c += ' bind-pw "' + bpw + '"';
                if (tls) c += ' ssl enabled' + (ca ? ' ssl-ca-cert-file ' + ca + ' ssl-check-peer enabled' : '');
                c += '\n';
            } else if (t === 'radius') {
                const srv = [data.rad1, data.rad2].map(v => cgEsc(v || '')).filter(Boolean);
                const sec = cgEsc(data.rad_secret || ''), port = cgEsc(data.rad_port || '');
                const names = [];
                srv.forEach((ip, i) => {
                    const n = 'RADIUS' + (i + 1);
                    names.push(n);
                    c += 'tmsh create auth radius-server ' + n + ' server ' + ip + ' secret "' + sec + '"' + (port ? ' port ' + port : '') + '\n';
                });
                c += 'tmsh create auth radius system-auth servers add { ' + names.join(' ') + ' }\n';
            } else {
                const srv = [data.tac1, data.tac2].map(v => cgEsc(v || '')).filter(Boolean);
                c += 'tmsh create auth tacacs system-auth servers add { ' + srv.join(' ') + ' } secret "' + cgEsc(data.tac_secret || '') + '"';
                c += ' service ' + cgEsc(data.tac_service || '') + ' protocol ' + cgEsc(data.tac_proto || '') + ' encryption enabled\n';
            }
            c += '\ntmsh modify auth remote-user default-role ' + role + ' default-partition all remote-console-access ' + con + '\n';
            c += 'tmsh modify auth source type ' + t + ' fallback ' + (data.fallback ? 'true' : 'false') + '\n';
            if (!data.fallback) c += '# UYARI: fallback kapalı — AAA sunucuları erişilemezse yalnız konsoldan giriş yapılabilir.\n';
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list auth source\n# tmsh list auth ' + t + ' system-auth\n# tmsh list auth remote-user\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Self IP Port Kısıtlama (allow-service) ─────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/net/net_self.html
//            (allow-service [all | default | none] / [add | delete | replace-all-with] { protocol:port ... })
F5LTM.selfport = {
    label: 'Self IP Port Kısıtlama',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-door-closed',
                title: 'Self IP Port Lockdown (allow-service)',
                desc: 'Self IP\'lerin hangi servislere (SSH, GUI, config-sync, failover) cevap vereceğini sınırlar. Virtual server trafiğini etkilemez; yalnız BIG-IP\'nin kendisine gelen trafiği.<br>Örnek: <code>tmsh modify net self SELF_HA allow-service replace-all-with { tcp:4353 udp:1026 }</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Self IP',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'self_name', label: 'Self IP Adı', type: 'text', required: true, placeholder: 'SELF_EXTERNAL', hint: '<code>tmsh list net self</code> çıktısındaki ad' },
                        { name: 'mode', label: 'Mod', type: 'select', options: [
                            { value: 'custom', label: 'Yalnız seçilen portlar', selected: true },
                            { value: 'none', label: 'none — hiçbir servis (dış bacak için önerilen)' },
                            { value: 'default', label: 'default — F5 varsayılan listesi (geniş)' }
                        ], why: "İnternete bakan self IP'de <code>allow-service all/default</code> GUI (443) ve SSH'ı dışarı açar; BIG-IP yönetim arayüzü açıkları (ör. iControl REST) bu yoldan istismar edilmiştir. Dış bacakta <code>none</code> kullanın." }
                    ]
                },
                {
                    title: 'İzinli Servisler (Özel mod)',
                    icon: 'fas fa-list-check',
                    fields: [
                        { name: 'p_ha', label: 'HA: config-sync tcp:4353 + failover udp:1026', type: 'checkbox', checked: false, why: "HA VLAN'ındaki self IP'de bu iki port kapalıysa cihazlar sync olamaz ve failover kalp atışı kesilir — iki cihaz da active olur." },
                        { name: 'p_ssh', label: 'SSH tcp:22', type: 'checkbox', checked: false },
                        { name: 'p_https', label: 'GUI / iControl tcp:443', type: 'checkbox', checked: false },
                        { name: 'p_snmp', label: 'SNMP udp:161', type: 'checkbox', checked: false },
                        { name: 'p_extra', label: 'Ek Portlar', type: 'text', placeholder: 'tcp:8443', hint: 'protocol:port, virgülle ayrılmış (örn: tcp:8443,udp:514)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const name = cgEsc(data.self_name || ''), mode = cgEsc(data.mode || 'custom');
            let c = '# ========================================\n# F5 BIG-IP — Self IP Port Kısıtlama\n# ========================================\n\n';
            if (mode !== 'custom') {
                if (mode === 'default') c += '# UYARI: default listesi SSH (22) ve GUI (443) dahil birçok servisi açar; dış bacakta kullanmayın.\n';
                c += 'tmsh modify net self ' + name + ' allow-service ' + mode + '\n';
            } else {
                const ports = [];
                if (data.p_ha) ports.push('tcp:4353', 'udp:1026');
                if (data.p_ssh) ports.push('tcp:22');
                if (data.p_https) ports.push('tcp:443');
                if (data.p_snmp) ports.push('udp:161');
                const bad = [];
                cgF5List(cgEsc(data.p_extra || '')).forEach(p => {
                    const m = p.toLowerCase().match(/^(tcp|udp):(\d{1,5})$/);
                    if (m && +m[2] <= 65535) { if (!ports.includes(m[0])) ports.push(m[0]); } else bad.push(p);
                });
                if (bad.length) c += '# UYARI: geçersiz port girdisi atlandı: ' + bad.join(' ') + '\n';
                if (ports.length) c += 'tmsh modify net self ' + name + ' allow-service replace-all-with { ' + ports.join(' ') + ' }\n';
                else c += '# NOT: hiçbir servis seçilmedi — self IP tüm servislere kapatılıyor.\ntmsh modify net self ' + name + ' allow-service none\n';
            }
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list net self ' + name + ' allow-service\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Static Route (net route) ───────────────────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/net/net_route.html
//            (create route [name | default] network/gw/interface/pool/blackhole/mtu/description; gw/interface/pool/blackhole birbirini dışlar)
F5LTM.route = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route (TMM)',
                desc: 'Veri düzlemi (TMM) statik rotası. Yönetim arayüzü rotaları için <b>Sistem Temeli</b> aracındaki management-route kullanılır.<br>Örnek: <code>tmsh create net route RT_BRANCH network 10.64.0.0/16 gw 192.0.2.1</code>'
            },
            sections: [
                {
                    title: 'Hedef',
                    icon: 'fas fa-bullseye',
                    fields: [
                        { name: 'rt_default', label: 'Default route (0.0.0.0/0)', type: 'checkbox', checked: false },
                        { name: 'rt_name', label: 'Route Adı', type: 'text', requiredIf: { field: 'rt_default', checked: false }, placeholder: 'RT_BRANCH', hint: 'Default route\'ta ad "default" olur' },
                        { name: 'rt_net', label: 'Hedef Ağ (CIDR)', type: 'text', validate: 'cidr', requiredIf: { field: 'rt_default', checked: false }, placeholder: '10.64.0.0/16' }
                    ]
                },
                {
                    title: 'Sonraki Atlama',
                    icon: 'fas fa-share',
                    fields: [
                        { name: 'rt_type', label: 'Tip', type: 'select', options: [
                            { value: 'gw', label: 'Gateway IP', selected: true },
                            { value: 'pool', label: 'Gateway Pool' },
                            { value: 'interface', label: 'VLAN / Tunnel' },
                            { value: 'blackhole', label: 'Blackhole (düşür)' }
                        ], why: "Gateway pool, birden çok next-hop'a monitor'lu yük dağıtımı sağlar; tek gateway düşerse rota da düşer. Blackhole, hedef ağa giden trafiği sessizce atar." },
                        { name: 'rt_gw', label: 'Gateway IP', type: 'text', validate: 'ip', requiredIf: { field: 'rt_type', in: ['gw'] }, placeholder: '192.0.2.1', why: "Gateway bir self IP subnet'inde olmalı; aksi halde rota eklenir ama ARP çözülemediği için trafik düşer." },
                        { name: 'rt_pool', label: 'Gateway Pool', type: 'text', requiredIf: { field: 'rt_type', in: ['pool'] }, placeholder: 'POOL_GW' },
                        { name: 'rt_if', label: 'VLAN / Tunnel Adı', type: 'text', requiredIf: { field: 'rt_type', in: ['interface'] }, placeholder: 'external' },
                        { name: 'rt_mtu', label: 'MTU', type: 'text', min: 576, max: 9198, placeholder: '1500', hint: 'Opsiyonel' },
                        { name: 'rt_desc', label: 'Açıklama', type: 'text', placeholder: 'Sube agi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const def = !!data.rt_default;
            const name = def ? 'default' : cgEsc(data.rt_name || '');
            const net = cgEsc(data.rt_net || ''), type = cgEsc(data.rt_type || 'gw');
            const mtu = cgEsc(data.rt_mtu || ''), desc = cgEsc(data.rt_desc || '');
            let c = '# ========================================\n# F5 BIG-IP — Static Route\n# ========================================\n\n';
            c += 'tmsh create net route ' + name;
            if (!def) c += ' network ' + net;
            if (type === 'gw') c += ' gw ' + cgEsc(data.rt_gw || '');
            else if (type === 'pool') c += ' pool ' + cgEsc(data.rt_pool || '');
            else if (type === 'interface') c += ' interface ' + cgEsc(data.rt_if || '');
            else c += ' blackhole';
            if (mtu) c += ' mtu ' + mtu;
            if (desc) c += ' description "' + desc + '"';
            c += '\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list net route ' + name + '\n# tmsh show net route\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Device Trust + Config Sync (DSC) ──────────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/cm/cm_device.html (configsync-ip, unicast-address {ip, port}, management-ip anahtar sözcüğü, mirror-ip)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/cm/cm_trust-domain.html (v13+: modify trust-domain Root add-device { ... })
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/cm/cm_device-group.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/cm/cm_config-sync.html
F5LTM.devicetrust = {
    label: 'Device Trust + Config Sync',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-handshake',
                title: 'Device Trust + Config Sync (DSC)',
                desc: 'İki BIG-IP arasında güven alanı (trust domain), device group ve ilk senkronizasyon. <code>add-device</code> sözdizimi v13.0 ve sonrası içindir.<br>Örnek: <code>tmsh modify cm trust-domain Root add-device { ca-device true device-ip 192.0.2.12 ... }</code>'
            },
            sections: [
                {
                    title: 'Bu Cihaz (her iki cihazda kendi değerleriyle)',
                    icon: 'fas fa-server',
                    info: 'Adım 1 her iki cihazda, o cihazın kendi adı ve self IP\'leriyle çalıştırılır. Adım 2-4 yalnız bir cihazda.',
                    fields: [
                        { name: 'local_dev', label: 'Bu Cihazın cm device Adı', type: 'text', required: true, placeholder: 'bigip1.example.com', hint: '<code>tmsh list cm device</code> çıktısındaki ad', why: "cm device adı hostname'den farklı olabilir; yanlış ad verilirse <code>modify cm device</code> 'not found' ile başarısız olur." },
                        { name: 'sync_ip', label: 'Config-Sync IP', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'HA VLAN\'ındaki yüzmeyen self IP', why: "Config-sync self IP'si <code>tcp:4353</code>'e izin vermiyorsa (Self IP Port Kısıtlama) cihazlar Disconnected kalır." },
                        { name: 'fo_ip', label: 'Failover (unicast) IP', type: 'text', validate: 'ip', required: true, placeholder: '198.51.100.1', hint: 'Genelde config-sync IP ile aynı' },
                        { name: 'fo_mgmt', label: 'Mgmt adresini ikinci failover yolu olarak ekle', type: 'checkbox', checked: true, why: "Tek failover yolu koparsa her iki cihaz da active olur (split-brain); management-ip ikinci kalp atışı yolu sağlar." },
                        { name: 'mirror_ip', label: 'Mirroring IP', type: 'text', validate: 'ip', placeholder: '198.51.100.1', hint: 'Opsiyonel — bağlantı yansıtma' }
                    ]
                },
                {
                    title: 'Karşı Cihaz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'peer_name', label: 'Karşı Cihaz Adı', type: 'text', required: true, placeholder: 'bigip2.example.com' },
                        { name: 'peer_mgmt', label: 'Karşı Cihaz Mgmt IP', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.12' },
                        { name: 'peer_user', label: 'Karşı Cihaz Yönetici', type: 'text', required: true, placeholder: 'admin' },
                        { name: 'peer_pw', label: 'Karşı Cihaz Parolası', type: 'text', required: true, placeholder: 'Ornek-Parola', hint: 'Komutta düz metin görünür; çıktıyı paylaşmayın, komutu tmsh içinde çalıştırın', why: "Parola yalnız güven kurulurken kullanılır ve yapılandırmaya kaydedilmez; ancak üretilen komutta açık yazılıdır. bash'te çalıştırılırsa geçmişe düşer." }
                    ]
                },
                {
                    title: 'Device Group',
                    icon: 'fas fa-object-group',
                    fields: [
                        { name: 'dg_name', label: 'Device Group Adı', type: 'text', required: true, placeholder: 'DG_FAILOVER' },
                        { name: 'dg_type', label: 'Tip', type: 'select', options: [
                            { value: 'sync-failover', label: 'sync-failover (aktif/yedek)', selected: true },
                            { value: 'sync-only', label: 'sync-only' }
                        ], why: "Tip sonradan değiştirilemez; yanlış seçilirse grup silinip yeniden kurulmalıdır." },
                        { name: 'auto_sync', label: 'Auto-Sync', type: 'select', options: [
                            { value: 'disabled', label: 'disabled — elle sync (önerilen)', selected: true },
                            { value: 'enabled', label: 'enabled' }
                        ], why: "Auto-sync açıkken bir cihazda yapılan hatalı değişiklik anında eşe de gider; elle sync gözden geçirme fırsatı verir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const dev = cgEsc(data.local_dev || ''), sync = cgEsc(data.sync_ip || ''), fo = cgEsc(data.fo_ip || '');
            const mir = cgEsc(data.mirror_ip || '');
            const peer = cgEsc(data.peer_name || ''), pmgmt = cgEsc(data.peer_mgmt || '');
            const puser = cgEsc(data.peer_user || ''), ppw = cgEsc(data.peer_pw || '');
            const dg = cgEsc(data.dg_name || ''), type = cgEsc(data.dg_type || 'sync-failover'), auto = cgEsc(data.auto_sync || 'disabled');
            let c = '# ========================================\n# F5 BIG-IP — Device Trust + Config Sync\n# ========================================\n\n';
            c += '# 1) HER İKİ cihazda (kendi adı ve IP\'leriyle):\n';
            c += 'tmsh modify cm device ' + dev + ' configsync-ip ' + sync + ' unicast-address { { ip ' + fo + ' port 1026 }' + (data.fo_mgmt ? ' { ip management-ip port 1026 }' : '') + ' }';
            if (mir) c += ' mirror-ip ' + mir;
            c += '\n\n';
            c += '# 2) YALNIZ bu cihazda — karşı cihazı güven alanına ekle:\n';
            c += 'tmsh modify cm trust-domain Root add-device { ca-device true device-ip ' + pmgmt + ' device-name ' + peer + ' username ' + puser + ' password ' + ppw + ' }\n\n';
            c += '# 3) Device group:\n';
            c += 'tmsh create cm device-group ' + dg + ' devices add { ' + dev + ' ' + peer + ' } type ' + type;
            if (type === 'sync-failover') c += ' network-failover enabled';
            c += ' auto-sync ' + auto + '\n\n';
            c += '# 4) İlk senkronizasyon (bu cihazdan gruba):\n';
            c += 'tmsh run cm config-sync to-group ' + dg + '\n';
            c += 'tmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh show cm sync-status        # Awaiting Initial Sync -> In Sync\n# tmsh list cm trust-domain\n# tmsh list cm device-group ' + dg + '\n# tail -n 20 /var/log/ltm       # failover sonrası 010c00xx (sod) satırları\n';
            const w = [];
            w.push('⚠ HA self IP\'sinde port lockdown "default" olmalı (TCP 4353 ConfigSync, UDP 1026 network failover). "none" iki cihazı Disconnected yapar (K14666670, f5-16).');
            w.push('⚠ İki cihazda NTP çalışmalı: saat farkı aygıt sertifikalarını geçersiz kılar, trust kurulamaz ya da Disconnected olur.');
            w.push('ℹ Sync yönü: değişikliğin yapıldığı (güncel) cihazdan to-group. Changes Pending iken failover yapılırsa eş eski yapılandırmayla hizmet verir (f5-16).');
            if (/^\d{1,3}(\.\d{1,3}){3}$/.test(String(data.sync_ip || '')) && data.sync_ip === data.peer_mgmt) w.push('⛔ Config-Sync IP ile karşı cihazın yönetim IP\'si aynı olamaz.');
            w.push('ℹ Floating self IP (traffic-group-1) sunucuların ağ geçidi olmalı; MAC masquerade (modify cm traffic-group traffic-group-1 mac 02:…) iki cihazda da ayarlanmalı (f5-15).');
            if (auto === 'enabled') w.push('⚠ Auto-sync açık: bir cihazdaki hatalı değişiklik anında eşe de gider. Birçok ekip değişiklik denetimi için kapalı tutar.');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 BIG-IP: SSL Cipher Group Sıkılaştırma (client-ssl) ────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/ltm/ltm_cipher_rule.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/ltm/ltm_cipher_group.html
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/ltm/ltm_profile_client-ssl.html
//            (cipher-group, ciphers, options { no-ssl no-tlsv1 no-tlsv1.1 no-tlsv1.3 ... }, secure-renegotiation, renegotiation)
//            Hazır gruplar (f5-default / f5-ecc / f5-secure): https://community.f5.com/kb/technicalarticles/cipher-rules-and-groups-in-big-ip-v13/279555
F5LTM.sslharden = {
    label: 'SSL Cipher Group Sıkılaştırma',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Client-SSL Sıkılaştırma — Cipher Group + Protokol',
                desc: 'Mevcut bir client-ssl profiline cipher group bağlar, SSLv3/TLS 1.0/1.1\'i kapatır ve güvensiz renegotiation\'ı engeller (v13+ cipher group).<br>Örnek: <code>tmsh modify ltm profile client-ssl MY_CLIENT_SSL ciphers none cipher-group f5-secure</code>',
                badge: { text: 'Güvenlik', cls: 'security' }
            },
            sections: [
                {
                    title: 'Profil & Cipher Group',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'prof', label: 'Client-SSL Profil Adı', type: 'text', required: true, placeholder: 'MY_CLIENT_SSL', hint: 'Var olan profil (SSL Client Profile aracıyla oluşturulan)' },
                        { name: 'grp', label: 'Cipher Group', type: 'select', options: [
                            { value: 'f5-secure', label: 'f5-secure (hazır, önerilen)', selected: true },
                            { value: 'f5-ecc', label: 'f5-ecc (hazır, yalnız ECC)' },
                            { value: 'f5-default', label: 'f5-default (hazır, geniş)' },
                            { value: 'custom', label: 'Özel kural + grup oluştur' }
                        ], why: "Cipher group kurala dayalıdır; F5 sürüm yükseltmelerinde zayıflayan şifreler hazır gruplardan otomatik çıkarılır. Elle yazılan cipher string'i ise sürümle güncellenmez." },
                        { name: 'rule_name', label: 'Özel Kural Adı', type: 'text', requiredIf: { field: 'grp', in: ['custom'] }, placeholder: 'RULE_ECDHE_ONLY' },
                        { name: 'rule_cipher', label: 'Kural Cipher String', type: 'text', requiredIf: { field: 'grp', in: ['custom'] }, placeholder: 'ECDHE:!SSLV3:!RC4:!EXP:!DES', hint: 'OpenSSL uyumlu' },
                        { name: 'grp_name', label: 'Özel Grup Adı', type: 'text', requiredIf: { field: 'grp', in: ['custom'] }, placeholder: 'GRP_ECDHE_ONLY' }
                    ]
                },
                {
                    title: 'Protokol & Renegotiation',
                    icon: 'fas fa-ban',
                    info: 'SSLv3, TLS 1.0 ve TLS 1.1 her durumda kapatılır (<code>no-ssl no-tlsv1 no-tlsv1.1</code>).',
                    fields: [
                        { name: 'tls13', label: 'TLS 1.3\'ü aç', type: 'checkbox', checked: true, why: "TLS 1.3 client-ssl'de yalnız cipher group ile açılabilir (v14.0+); eski sürümde bu satır hata verir, kutuyu kaldırın." },
                        { name: 'sec_reneg', label: 'Secure Renegotiation', type: 'select', options: [
                            { value: 'require-strict', label: 'require-strict (RFC 5746 desteklemeyeni reddet)', selected: true },
                            { value: 'require', label: 'require (F5 varsayılanı)' }
                        ], why: "<code>request</code> modu yamalanmamış istemcilerin renegotiation'ına izin verir ve MITM saldırısına açıktır; bu yüzden listede yok." },
                        { name: 'no_reneg', label: 'Renegotiation\'ı tamamen kapat', type: 'checkbox', checked: true, why: "İstemci kaynaklı renegotiation, tek bağlantıdan tekrar tekrar pahalı el sıkışma yaptırarak CPU tüketme (DoS) saldırısına imkan verir." }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const prof = cgEsc(data.prof || ''), grpSel = cgEsc(data.grp || 'f5-secure');
            const custom = grpSel === 'custom';
            const grp = custom ? cgEsc(data.grp_name || '') : grpSel;
            const reneg = cgEsc(data.sec_reneg || 'require-strict');
            let c = '# ========================================\n# F5 BIG-IP — Client-SSL Sıkılaştırma\n# ========================================\n\n';
            if (custom) {
                const rule = cgEsc(data.rule_name || '');
                c += 'tmsh create ltm cipher rule ' + rule + ' cipher "' + cgEsc(data.rule_cipher || '') + '"\n';
                c += 'tmsh create ltm cipher group ' + grp + ' allow add { ' + rule + ' }\n\n';
            }
            if (grpSel === 'f5-default') c += '# UYARI: f5-default geniş bir listedir (CBC/RSA anahtar değişimi dahil); f5-secure tercih edin.\n';
            c += 'tmsh modify ltm profile client-ssl ' + prof + ' ciphers none cipher-group ' + grp;
            c += ' options { dont-insert-empty-fragments no-ssl no-tlsv1 no-tlsv1.1' + (data.tls13 ? '' : ' no-tlsv1.3') + ' }';
            c += ' secure-renegotiation ' + reneg;
            if (data.no_reneg) c += ' renegotiation disabled';
            c += '\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list ltm profile client-ssl ' + prof + ' cipher-group ciphers options secure-renegotiation renegotiation\n# tmsh list ltm cipher group ' + grp + '\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Virtual Server Bağlantı / Hız Limiti ──────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/ltm/ltm_virtual.html
//            (connection-limit, rate-limit, rate-limit-mode, rate-limit-src-mask, rate-limit-dst-mask)
F5LTM.vslimit = {
    label: 'VS Bağlantı / Hız Limiti',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'Virtual Server Connection & Rate Limit',
                desc: 'Var olan virtual server\'a eşzamanlı bağlantı sınırı ve saniyedeki yeni bağlantı sınırı ekler; arka uç sunucuları taşmaya karşı korur.<br>Örnek: <code>tmsh modify ltm virtual VS_APP_HTTPS connection-limit 10000 rate-limit 500</code>'
            },
            sections: [
                {
                    title: 'Limitler',
                    icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'vs', label: 'Virtual Server Adı', type: 'text', required: true, placeholder: 'VS_APP_HTTPS' },
                        { name: 'conn', label: 'Eşzamanlı Bağlantı Limiti', type: 'text', validate: 'posint', required: true, placeholder: '10000', hint: 'connection-limit (0 = sınırsız)', why: "Limit aşıldığında yeni bağlantılar reddedilir; değer pool'daki toplam sunucu kapasitesine göre seçilmeli. Çok düşük değer meşru trafiği keser." },
                        { name: 'rate', label: 'Saniyede Yeni Bağlantı', type: 'text', validate: 'posint', placeholder: '500', hint: 'rate-limit; boşsa yazılmaz' },
                        { name: 'rmode', label: 'Rate Limit Kapsamı', type: 'select', options: [
                            { value: 'object', label: 'object — VS toplamı', selected: true },
                            { value: 'source', label: 'source — kaynak IP başına' },
                            { value: 'object-source', label: 'object-source' },
                            { value: 'destination', label: 'destination' },
                            { value: 'source-destination', label: 'source-destination' }
                        ], why: "<code>object</code> tüm istemciler için tek sayaç tutar: tek saldırgan limiti doldurup herkesi engeller. <code>source</code> kaynak IP başına sayar, ancak NAT arkasındaki kurumsal kullanıcıları tek istemci sayar." },
                        { name: 'smask', label: 'Kaynak Maskesi (bit)', type: 'text', min: 0, max: 32, placeholder: '24', hint: 'rate-limit-src-mask; source modlarında /24 gibi grupla sayar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const vs = cgEsc(data.vs || ''), conn = cgEsc(data.conn || ''), rate = cgEsc(data.rate || '');
            const mode = cgEsc(data.rmode || 'object'), smask = cgEsc(data.smask || '');
            let c = '# ========================================\n# F5 BIG-IP — VS Bağlantı / Hız Limiti\n# ========================================\n\n';
            c += 'tmsh modify ltm virtual ' + vs + ' connection-limit ' + conn;
            if (rate) {
                c += ' rate-limit ' + rate + ' rate-limit-mode ' + mode;
                if (smask && mode.indexOf('source') >= 0) c += ' rate-limit-src-mask ' + smask;
            }
            c += '\n';
            if (!rate && smask) c += '# NOT: rate-limit boş olduğu için kaynak maskesi yazılmadı.\n';
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list ltm virtual ' + vs + ' connection-limit rate-limit rate-limit-mode\n# tmsh show ltm virtual ' + vs + '   (Current / Maximum Connections)\n# grep -iE "01200009|connection limit" /var/log/ltm\n';
            const w = [];
            w.push('ℹ Limit dolunca yeni bağlantılar reddedilir (istemci RST görür) ve /var/log/ltm\'e "01200009:4: Packet rejected … Connection limit exceeded." yazılır; VS durumu "unavailable" (sarı) olur. Limiti show ltm virtual\'daki Maximum Connections değerine göre belirleyin (f5-13).');
            if (conn && +conn > 0 && +conn < 100) w.push('⚠ Bağlantı limiti çok düşük (' + conn + '): keep-alive ve paralel bağlantı açan tarayıcılar limiti hızla doldurur.');
            w.push('ℹ Pool üyesi için de ayrı limit verilebilir: members modify { <ip:port> { connection-limit N } }; dolunca "01200017:4: … has reached its connection limit." yazılır ve üye yeni bağlantı almaz.');
            return { config: c, warnings: w };
        });
    }
};

// ── F5 BIG-IP: Internal Data Group ───────────────────────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/ltm/ltm_data-group_internal.html
//            (create internal NAME type ip|string|integer records add { key | key { data value } }; string'ler tırnaklı)
F5LTM.datagroup = {
    label: 'Data Group',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-table',
                title: 'Internal Data Group',
                desc: 'iRule ve LTM policy\'lerin kullandığı anahtar/değer listesi (izinli IP blokları, URL listesi, yönlendirme tablosu). iRule\'da: <code>class match [IP::client_addr] equals DG_ADI</code>'
            },
            sections: [
                {
                    title: 'Data Group',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'dg', label: 'Data Group Adı', type: 'text', required: true, placeholder: 'DG_ALLOWED_NETS' },
                        { name: 'dg_type', label: 'Tip', type: 'select', options: [
                            { value: 'ip', label: 'ip — adres / ağ', selected: true },
                            { value: 'string', label: 'string — metin (URL, host)' },
                            { value: 'integer', label: 'integer' }
                        ], why: "Tip oluşturulduktan sonra değiştirilemez; ip tipinde CIDR eşleşmesi yapılır, string tipinde birebir/prefix eşleşme. Yanlış tip iRule'da hiç eşleşmeme olarak görünür." },
                        { name: 'records', label: 'Kayıtlar (satır başına bir)', type: 'textarea', required: true, placeholder: '10.64.0.0/16', hint: '<code>anahtar</code> veya <code>anahtar = değer</code>. ip: IP/CIDR, integer: sayı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const dg = cgEsc(data.dg || ''), type = cgEsc(data.dg_type || 'ip');
            const recs = [], bad = [];
            String(data.records || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean).forEach(line => {
                const i = line.indexOf('=');
                const key = cgEsc((i >= 0 ? line.slice(0, i) : line).trim());
                const val = cgEsc(i >= 0 ? line.slice(i + 1).trim() : '');
                let ok = !!key;
                if (type === 'ip') ok = ok && (CG_F5_IP_RE.test(key) || (/^[\d.]+\/\d{1,2}$/.test(key) && CG_F5_IP_RE.test(key.split('/')[0]) && +key.split('/')[1] <= 32));
                if (type === 'integer') ok = ok && /^-?\d+$/.test(key);
                if (type === 'string') ok = ok && key.indexOf('&quot;') < 0 && key.indexOf('"') < 0;
                if (!ok) { bad.push(line); return; }
                const k = type === 'string' ? '"' + key + '"' : key;
                recs.push(val ? k + ' { data "' + val + '" }' : k);
            });
            let c = '# ========================================\n# F5 BIG-IP — Internal Data Group\n# ========================================\n\n';
            if (bad.length) c += '# UYARI: ' + type + ' tipine uymayan ' + bad.length + ' kayıt atlandı.\n';
            if (!recs.length) c += '# UYARI: geçerli kayıt yok — data group boş oluşturulur.\n';
            c += 'tmsh create ltm data-group internal ' + dg + ' type ' + type;
            if (recs.length) c += ' records add { ' + recs.join(' ') + ' }';
            c += '\n\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list ltm data-group internal ' + dg + '\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Log Publisher / High Speed Logging ───────────────────────────
// Sözdizimi: https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_log-config_destination_remote-high-speed-log.html (pool-name, protocol, distribution)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_log-config_destination_remote-syslog.html (remote-high-speed-log, format)
//            https://clouddocs.f5.com/cli/tmsh-reference/latest/modules/sys/sys_log-config_publisher.html (destinations add)
//            Pool üyesi biçimi bu dosyadaki F5LTM.pool aracıyla aynı.
F5LTM.hsl = {
    label: 'Log Publisher / HSL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-stream',
                title: 'High Speed Logging (HSL) + Log Publisher',
                desc: 'TMM\'den doğrudan (yönetim arayüzü yerine veri düzleminden) SIEM\'e log: pool → remote-high-speed-log → remote-syslog → publisher. Publisher, ASM/AFM/DoS log profillerinde ve iRule <code>HSL::open -publisher</code> ile kullanılır.'
            },
            sections: [
                {
                    title: 'Log Sunucuları (Pool)',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'pool', label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL_SIEM' },
                        { name: 'srv1', label: 'Sunucu 1 (IP:Port)', type: 'text', validate: 'host_port', required: true, placeholder: '192.0.2.50:514' },
                        { name: 'srv2', label: 'Sunucu 2 (IP:Port)', type: 'text', validate: 'host_port', placeholder: '192.0.2.51:514' },
                        { name: 'mon', label: 'Pool Monitor', type: 'select', options: [
                            { value: 'gateway_icmp', label: 'gateway_icmp', selected: true },
                            { value: 'tcp', label: 'tcp (TCP syslog)' },
                            { value: 'none', label: 'monitor yok' }
                        ], why: "Monitor yoksa ölü log sunucusu da UP sayılır ve loglar sessizce kaybolur. UDP syslog'da port kontrolü yapılamadığı için ICMP en iyi yaklaşımdır." }
                    ]
                },
                {
                    title: 'Hedef & Publisher',
                    icon: 'fas fa-share-square',
                    fields: [
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'udp', label: 'UDP', selected: true },
                            { value: 'tcp', label: 'TCP' }
                        ] },
                        { name: 'dist', label: 'Dağıtım', type: 'select', options: [
                            { value: 'adaptive', label: 'adaptive (varsayılan)', selected: true },
                            { value: 'balanced', label: 'balanced' },
                            { value: 'replicated', label: 'replicated — her log tüm üyelere' }
                        ], why: "<code>replicated</code> iki SIEM'e de aynı logu gönderir (yedeklilik); <code>balanced</code> logları üyelere böler, her sunucu logların yalnız bir kısmını görür." },
                        { name: 'hsl_dest', label: 'HSL Hedef Adı', type: 'text', required: true, placeholder: 'DEST_HSL_SIEM' },
                        { name: 'fmt_on', label: 'Syslog biçimlendirme hedefi ekle', type: 'checkbox', checked: true, why: "Biçimlendirme olmadan HSL ham mesaj gönderir; SIEM'ler zaman damgası ve hostname içeren syslog başlığını bekler." },
                        { name: 'fmt', label: 'Syslog Biçimi', type: 'select', options: [
                            { value: 'rfc5424', label: 'rfc5424', selected: true },
                            { value: 'rfc3164', label: 'rfc3164' }
                        ] },
                        { name: 'rs_dest', label: 'Syslog Hedef Adı', type: 'text', requiredIf: { field: 'fmt_on', checked: true }, placeholder: 'DEST_SYSLOG_SIEM' },
                        { name: 'pub', label: 'Publisher Adı', type: 'text', required: true, placeholder: 'PUB_SIEM' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const pool = cgEsc(data.pool || ''), mon = cgEsc(data.mon || 'gateway_icmp');
            const members = [data.srv1, data.srv2].map(v => cgEsc(v || '')).filter(Boolean);
            const proto = cgEsc(data.proto || 'udp'), dist = cgEsc(data.dist || 'adaptive');
            const hsl = cgEsc(data.hsl_dest || ''), rs = cgEsc(data.rs_dest || ''), fmt = cgEsc(data.fmt || 'rfc5424');
            const pub = cgEsc(data.pub || '');
            let c = '# ========================================\n# F5 BIG-IP — High Speed Logging + Publisher\n# ========================================\n\n';
            c += 'tmsh create ltm pool ' + pool + ' members add { ' + members.map(m => m + ' { address ' + m.split(':')[0] + ' }').join(' ') + ' }';
            if (mon !== 'none') c += ' monitor ' + mon;
            c += '\n';
            if (mon === 'none') c += '# UYARI: monitor yok — log sunucusu çökse de pool UP görünür, loglar kaybolur.\n';
            if (mon === 'tcp' && proto === 'udp') c += '# UYARI: UDP syslog için tcp monitor sunucuyu sürekli DOWN gösterebilir.\n';
            c += 'tmsh create sys log-config destination remote-high-speed-log ' + hsl + ' pool-name ' + pool + ' protocol ' + proto + ' distribution ' + dist + '\n';
            if (data.fmt_on) c += 'tmsh create sys log-config destination remote-syslog ' + rs + ' remote-high-speed-log ' + hsl + ' format ' + fmt + '\n';
            c += 'tmsh create sys log-config publisher ' + pub + ' destinations add { ' + (data.fmt_on ? rs : hsl) + ' }\n';
            c += '\ntmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh list sys log-config publisher ' + pub + '\n# tmsh list sys log-config destination remote-high-speed-log ' + hsl + '\n# tmsh show ltm pool ' + pool + '\n';
            return c;
        });
    }
};

// ── F5 BIG-IP: Yedek ve Yükseltme Planı (MOP) ─────────────────────────────────
// Kaynaklar: K92404240 (standalone tmsh yükseltme), K60339442 (HA tmsh yükseltme), K7727 (Service check date),
// K13132 (UCS), K34745165 (/shared/images), K5658 (switchboot). Lab: f5-11, f5-12.
F5LTM.upgrade = {
    label: 'Yedek ve Yükseltme Planı',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud-upload-alt',
                title: 'Yedek ve Yükseltme Planı (MOP)',
                desc: 'Ön kontrol, UCS yedeği, ISO doğrulama, boş hacme kurulum, yeni hacimden açılış ve geri dönüş komutları. HA çiftinde standby-önce sırasıyla.<br>Örnek: <code>tmsh install sys software image BIGIP-17.1.1.3-0.0.5.iso volume HD1.2 create-volume</code>',
                badge: { text: 'Operasyon', cls: 'info' }
            },
            sections: [
                {
                    title: 'Sürüm ve Dosyalar',
                    icon: 'fas fa-compact-disc',
                    fields: [
                        { name: 'iso', label: 'ISO Dosyası', type: 'text', required: true, placeholder: 'BIGIP-17.1.1.3-0.0.5.iso', hint: '/shared/images altına kopyalanmış olmalı', why: "ISO ve .md5 dosyası <code>/shared/images</code> dizinine SCP ile kopyalanır. MD5 doğrulanmayan bozuk bir ISO kurulumu yarıda bırakır." },
                        { name: 'vol', label: 'Hedef Hacim', type: 'select', options: [
                            { value: 'HD1.2', label: 'HD1.2', selected: true },
                            { value: 'HD1.3', label: 'HD1.3' },
                            { value: 'HD1.1', label: 'HD1.1' }
                        ], why: "Çalışan (aktif) hacme kurulum yapılamaz. <code>tmsh show sys software status</code> çıktısında Active <b>yes</b> olan hacmi seçmeyin; eski hacim geri dönüş için korunur." },
                        { name: 'cur_vol', label: 'Şu Anki (Aktif) Hacim', type: 'select', options: [
                            { value: 'HD1.1', label: 'HD1.1', selected: true },
                            { value: 'HD1.2', label: 'HD1.2' },
                            { value: 'HD1.3', label: 'HD1.3' }
                        ], why: "Geri dönüş komutu bu hacme yazılır: sorun olursa <code>tmsh reboot volume &lt;eski&gt;</code>." },
                        { name: 'ucs', label: 'UCS Adı', type: 'text', required: true, placeholder: 'pre-upgrade-17', why: "UCS kayıtlı yapılandırmayı, lisansı ve sertifikaları içerir; önce <code>save sys config</code>. Dosya cihaz dışına kopyalanmazsa disk arızasında yedek de gider." },
                        { name: 'svc_need', label: 'Hedef Sürümün Lisans Kontrol Tarihi', type: 'text', placeholder: '2023/06/20', hint: 'K7727 tablosundan; YYYY/AA/GG', why: "Lisanstaki Service check date bu tarihten eskiyse yeni sürüm açılır ama yapılandırma yüklenmez (INOPERATIVE). Önce lisansı reactivate edin (f5-12)." }
                    ]
                },
                {
                    title: 'Yüksek Erişilebilirlik',
                    icon: 'fas fa-clone',
                    fields: [
                        { name: 'ha', label: 'HA çifti (sync-failover)', type: 'checkbox', why: "HA çiftinde sıra: önce standby cihaz yükseltilir, sonra trafik ona devredilir, en son eski aktif yükseltilir. Karışık sürümdeyken config-sync yapılmaz (K60339442)." },
                        { name: 'dg', label: 'Device Group', type: 'text', placeholder: 'dg-failover', requiredIf: { field: 'ha', checked: true }, why: "Yükseltme boyunca auto-sync kapatılır; iki cihaz aynı sürüme geçince yeniden açılır." }
                    ]
                }
            ],
            submit: 'Planı Oluştur'
        }, (data) => cgF5UpgradeGen(data));
    }
};
function cgF5UpgradeGen(data) {
    const iso = cgEsc(String(data.iso || '').trim()), vol = cgEsc(data.vol || 'HD1.2'), cur = cgEsc(data.cur_vol || 'HD1.1');
    const ucs = cgEsc(String(data.ucs || '').trim().replace(/\.ucs$/, '')), dg = cgEsc(String(data.dg || '').trim()), need = String(data.svc_need || '').trim();
    const w = [];
    if (vol === cur) w.push('⛔ Hedef hacim şu anki aktif hacimle aynı: çalışan hacme kurulum yapılamaz.');
    if (iso && !/\.iso$/i.test(iso)) w.push('⚠ Dosya adı .iso ile bitmiyor.');
    if (/hotfix/i.test(iso)) w.push('ℹ Güncel sürümlerde hotfix\'ler tam ISO olarak gelir ve "install sys software image" ile kurulur; "hotfix" komutu yalnız mühendislik yamaları içindir.');
    if (need && !/^\d{4}\/\d{2}\/\d{2}$/.test(need)) w.push('⚠ Lisans kontrol tarihi YYYY/AA/GG biçiminde olmalı.');
    w.push('⚠ Service check date kontrolü atlanmasın: tarih hedef sürümün lisans kontrol tarihinden eskiyse yeni sürüm INOPERATIVE açılır, yapılandırma yüklenmez. Önce lisansı reactivate edin (f5-12).');
    if (data.ha) w.push('⚠ HA: önce STANDBY cihazı yükseltin; aktif cihaza dokunmadan önce standby yeni sürümde sağlıklı açılmalı. Karışık sürümde config-sync yapmayın.');
    w.push('ℹ UCS\'i cihaz dışına kopyalayın. Yükseltmeden sonra eski hacmi silmeyin: geri dönüş tek komuttur.');
    let c = '# ========================================\n# F5 BIG-IP — Yedek ve Yükseltme Planı\n# ========================================\n\n';
    c += '# 1) Ön kontrol (bash)\ngrep "Service check date" /config/bigip.license' + (need ? '      # en az ' + cgEsc(need) + ' olmalı' : '') + '\ntmsh show sys software status\ndf -h /shared\n';
    if (data.ha) c += 'tmsh show cm sync-status                   # In Sync olmalı\ntmsh show cm failover-status\n';
    c += '\n# 2) Yedek\ntmsh save sys config\ntmsh save sys ucs ' + ucs + '\n# scp /var/local/ucs/' + ucs + '.ucs <yedek-sunucu>:/yedek/\n\n';
    c += '# 3) ISO doğrulama\nls -l /shared/images/\nmd5sum -c /shared/images/' + iso + '.md5\n\n';
    if (data.ha) c += '# 4) HA hazırlığı (her iki cihazda aynı)\ntmsh modify cm device-group ' + dg + ' auto-sync disabled\n# Bu adımlar ÖNCE STANDBY cihazda yapılır.\n\n';
    c += '# ' + (data.ha ? '5' : '4') + ') Kurulum ve izleme\ntmsh install sys software image ' + iso + ' volume ' + vol + ' create-volume\ntmsh show sys software status              # ' + vol + ': installing … → complete\n\n';
    c += '# ' + (data.ha ? '6' : '5') + ') Yeni hacimden açılış ve doğrulama\ntmsh reboot volume ' + vol + '\ntmsh show sys version\ntmsh show sys software status\ntail -n 50 /var/log/ltm                    # 01070608 (lisans) ya da monitor down satırları var mı?\ntmsh show ltm virtual                      # uygulamalar available mı?\n';
    if (data.ha) c += '\n# 7) Trafiği yeni sürümdeki cihaza devret (eski AKTİF cihazda)\ntmsh run sys failover standby traffic-group traffic-group-1\n# Testler başarılıysa eski aktifi de aynı adımlarla yükseltin; iki cihaz aynı sürümde olunca:\ntmsh modify cm device-group ' + dg + ' auto-sync enabled\ntmsh run cm config-sync to-group ' + dg + '\n';
    c += '\n# Geri dönüş\ntmsh reboot volume ' + cur + '\n';
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 BIG-IP: Bağlantı / Kalıcılık Sorgusu ───────────────────────────────────
// Sözdizimi: tmsh reference sys connection, ltm persistence persist-records (clouddocs); K53851362, K13253. Lab: f5-14.
F5LTM.conntable = {
    label: 'Bağlantı / Kalıcılık Sorgusu',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-stream',
                title: 'Bağlantı Tablosu ve Kalıcılık Kayıtları',
                desc: 'İstemci, VIP, SNAT ya da pool üyesine göre bağlantı tablosu ve persistence kaydı sorguları; gerekirse dar filtreli silme.<br>Örnek: <code>tmsh show sys connection cs-client-addr 198.51.100.23</code>',
                badge: { text: 'Teşhis', cls: 'info' }
            },
            sections: [
                {
                    title: 'Filtreler (en az biri)',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'client', label: 'İstemci IP (cs-client-addr)', type: 'text', validate: 'ip', placeholder: '198.51.100.23', why: "Kullanıcının hangi sunucuya gittiğini bulmak için. Satırın dördüncü sütunu (ss-server) sunucudur." },
                        { name: 'vip', label: 'VIP IP (cs-server-addr)', type: 'text', validate: 'ip', placeholder: '203.0.113.100', why: "Trafik VIP'e geliyor mu? Hiç kayıt yoksa istek BIG-IP'ye ulaşmıyor (rota, ARP, güvenlik duvarı)." },
                        { name: 'vport', label: 'VIP Port (cs-server-port)', type: 'text', placeholder: '80' },
                        { name: 'member', label: 'Pool Üyesi IP (ss-server-addr)', type: 'text', validate: 'ip', placeholder: '10.64.30.52', why: "Bakıma alınacak üyede hâlâ bağlantı var mı? Disabled üye kalıcı istemcileri kabul etmeye devam eder." },
                        { name: 'mport', label: 'Üye Port (ss-server-port)', type: 'text', placeholder: '80' },
                        { name: 'snat', label: 'SNAT Adresi (ss-client-addr)', type: 'text', validate: 'ip', placeholder: '10.64.30.11', why: "SNAT gerçekten uygulanıyor mu? SNAT yoksa ss-client sütununda istemcinin kendi adresi görünür." }
                    ]
                },
                {
                    title: 'İşlem',
                    icon: 'fas fa-tools',
                    fields: [
                        { name: 'detail', label: 'Ayrıntılı blok (all-properties)', type: 'checkbox', why: "Idle Timeout (TCP profilinin süresi), Virtual Path, Lasthop gibi alanları gösterir." },
                        { name: 'persist', label: 'Kalıcılık kayıtlarını da sorgula', type: 'checkbox', checked: true },
                        { name: 'del', label: 'Eşleşen kayıtları sil (dikkat)', type: 'checkbox', why: "Silinen bağlantının istemcisi yeniden bağlanır ve o anki dağıtım kararıyla başka üyeye gidebilir. Önce persist kaydı silinmezse kalıcı istemci aynı üyeye döner." }
                    ]
                }
            ],
            submit: 'Komutları Oluştur'
        }, (data) => cgF5ConnGen(data));
    }
};
function cgF5ConnGen(data) {
    const f = [], w = [];
    const add = (k, v) => { v = String(v || '').trim(); if (v) f.push(k + ' ' + cgEsc(v)); };
    add('cs-client-addr', data.client); add('cs-server-addr', data.vip); add('cs-server-port', data.vport); add('ss-client-addr', data.snat); add('ss-server-addr', data.member); add('ss-server-port', data.mport);
    if (!f.length) w.push('⛔ Filtre yok: filtresiz "show sys connection" binlerce satır döker, filtresiz "delete sys connection" ise TÜM bağlantıları (mirror dahil) siler. En az bir adres verin.');
    if ((data.member && !data.mport) || (data.client && !data.vport && data.del)) w.push('⚠ Port verilmeden IP ile silme, o IP\'nin tüm bağlantılarını siler (referans uyarısı). Mümkünse portu da verin.');
    let c = '# ========================================\n# F5 BIG-IP — Bağlantı / Kalıcılık Sorgusu\n# ========================================\n\n';
    const j = (...p) => p.filter(Boolean).join(' ');
    c += '# Bağlantı tablosu: istemci -> VIP -> SNAT adresi -> sunucu\n' + j('tmsh show sys connection', f.join(' '), data.detail ? 'all-properties' : '') + '\n';
    if (data.persist) {
        const pf = []; if (data.client) pf.push('client-addr ' + cgEsc(data.client)); if (data.member) pf.push('node-addr ' + cgEsc(data.member)); if (data.member && data.mport) pf.push('node-port ' + cgEsc(data.mport));
        c += '\n# Kalıcılık kayıtları (cookie insert kayıt tutmaz; bilgi istemcideki BIGipServer cookie\'sindedir)\n' + j('tmsh show ltm persistence persist-records', pf.join(' '), data.detail ? 'all-properties' : '') + '\n';
        if (data.del && pf.length) c += '\n# Önce kalıcılık kaydı, sonra bağlantı silinir (yoksa istemci aynı üyeye döner)\ntmsh delete ltm persistence persist-records ' + pf.join(' ') + '\n';
    }
    if (data.del && f.length) c += 'tmsh delete sys connection ' + f.join(' ') + '\n\n# Doğrulama\ntmsh show sys connection ' + f.join(' ') + '\n';
    w.push('ℹ Kurulu bağlantılar yapılandırma değişikliğinden etkilenmez (K13253): VS/profil değişikliğinden sonra eski davranış sürüyorsa ilgili bağlantıları dar filtreyle silin.');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 BIG-IP: Pool Üyesi Bakım (Güvenli Boşaltma) ────────────────────────────
F5LTM.drain = {
    label: 'Pool Üyesi Bakım (Boşaltma)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tint-slash',
                title: 'Pool Üyesini Kesintisiz Bakıma Almak',
                desc: 'Disable → bağlantı ve kalıcılık kontrolü → (gerekirse) silme → forced offline → bakım sonrası geri alma.<br>Örnek: <code>tmsh modify ltm pool web_pool members modify { 10.64.30.52:80 { session user-disabled } }</code>',
                badge: { text: 'Operasyon', cls: 'info' }
            },
            sections: [
                {
                    title: 'Üye',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'pool', label: 'Pool', type: 'text', required: true, placeholder: 'web_pool' },
                        { name: 'member', label: 'Üye (IP:port)', type: 'text', required: true, placeholder: '10.64.30.52:80', why: "Disabled üye yeni bağlantı almaz ama mevcut ve kalıcı (persistence) istemcileri kabul eder; forced offline ise hiçbirini kabul etmez ve açık oturumları keser." },
                        { name: 'force', label: 'Bağlantılar bitmezse persist kaydı ve bağlantıları sil', type: 'checkbox', why: "Uzun süren bağlantılar (ör. WebSocket, RDP) kendiliğinden bitmeyebilir. Silmek o kullanıcıları başka üyeye taşır; kısa bir yeniden bağlanma yaşanır." }
                    ]
                }
            ],
            submit: 'Planı Oluştur'
        }, (data) => cgF5DrainGen(data));
    }
};
function cgF5DrainGen(data) {
    const pool = cgEsc(String(data.pool || '').trim()), mem = cgEsc(String(data.member || '').trim()), w = [];
    const m = mem.match(/^(\d{1,3}(?:\.\d{1,3}){3}):(\d+)$/);
    if (!m) w.push('⛔ Üye IP:port biçiminde olmalı (ör. 10.64.30.52:80).');
    const ip = m ? m[1] : '<ip>', port = m ? m[2] : '<port>';
    let c = '# ========================================\n# F5 BIG-IP — Pool Üyesi Bakım (Güvenli Boşaltma)\n# ========================================\n\n';
    c += '# 1) Yeni bağlantıları kes (mevcutlar ve kalıcı istemciler sürer)\ntmsh modify ltm pool ' + pool + ' members modify { ' + mem + ' { session user-disabled } }\n\n';
    c += '# 2) Kalan bağlantıları ve kalıcılık kayıtlarını izle\ntmsh show sys connection ss-server-addr ' + ip + ' ss-server-port ' + port + '\ntmsh show ltm persistence persist-records node-addr ' + ip + ' node-port ' + port + '\ntmsh show ltm pool ' + pool + ' members   # Current Connections\n\n';
    if (data.force) c += '# 3) Bitmeyenleri taşı: önce persist kaydı, sonra bağlantı\ntmsh delete ltm persistence persist-records node-addr ' + ip + ' node-port ' + port + '\ntmsh delete sys connection ss-server-addr ' + ip + ' ss-server-port ' + port + '\n\n';
    c += '# ' + (data.force ? '4' : '3') + ') Bağlantı kalmayınca zorla kapat (bakım)\ntmsh modify ltm pool ' + pool + ' members modify { ' + mem + ' { state user-down } }\ntmsh save sys config\n\n';
    c += '# Bakım bitince geri al\ntmsh modify ltm pool ' + pool + ' members modify { ' + mem + ' { state user-up session user-enabled } }\ntmsh show ltm pool ' + pool + ' members   # Availability: available, State: enabled\ntmsh save sys config\n';
    w.push('ℹ Sıra önemli: bağlantılar bitmeden forced offline yapmak açık oturumları keser. Disabled üyeye kalıcı istemciler gitmeye devam eder; boşalmıyorsa persist kaydını silin (f5-14).');
    w.push('ℹ /var/log/ltm\'de forced down ve geri alındığında monitor status up satırları görülür; bakım kaydına ekleyin.');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 BIG-IP: Paket Yakalama (tcpdump) ve RST Nedeni ─────────────────────────
F5LTM.tcpdump = {
    label: 'Paket Yakalama (tcpdump)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-wave-square',
                title: 'tcpdump ile Paket Yakalama ve RST Nedeni',
                desc: 'TMM arayüzünde (0.0 veya VLAN) F5 ayrıntılarıyla yakalama, :p ile SNAT arkasındaki sunucu tarafını birlikte görme, dosyaya yazma ve BIG-IP\'nin gönderdiği RST\'nin nedenini okuma.<br>Örnek: <code>tcpdump -nni 0.0:nnnp -s0 -c 1000 -w /var/tmp/vs_web.pcap host 203.0.113.100</code>',
                badge: { text: 'Teşhis', cls: 'info' }
            },
            sections: [
                {
                    title: 'Nerede yakalanacak',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'iface', label: 'Arayüz', type: 'select', why: "<b>0.0</b> tüm TMM arayüzleridir (VLAN'lar). Yönetim portu TMM dışındadır: onu yalnız <b>mgmt</b> yakalar, 0.0 yakalamaz. Fiziksel arayüzde (1.1) F5 ayrıntıları (trailer) yazılmaz.", options: [
                            { value: '0.0', label: '0.0 (tüm TMM arayüzleri)' },
                            { value: 'vlan', label: 'Tek bir VLAN' },
                            { value: 'mgmt', label: 'mgmt (yönetim arayüzü)' }
                        ]},
                        { name: 'vlan', label: 'VLAN adı', type: 'text', optional: true, placeholder: 'external', hint: 'Yalnız "Tek bir VLAN" seçiliyse.' },
                        { name: 'noise', label: 'F5 ayrıntı seviyesi (noise)', type: 'select', why: "<b>:n</b> giriş/çıkış, TMM ve virtual server adı; <b>:nn</b> flow kimlikleri ve BIG-IP'nin gönderdiği RST'lerde <code>rst_cause</code>; <b>:nnn</b> karşı tarafın (peer) adres ve portları. F5, destek kayıtları için :nnn önerir (K13637).", options: [
                            { value: 'nnn', label: ':nnn (tam, önerilen)' },
                            { value: 'nn', label: ':nn (RST nedeni dahil)' },
                            { value: 'n', label: ':n (temel)' },
                            { value: '', label: 'Yok' }
                        ]},
                        { name: 'peer', label: 'Karşı tarafı da yakala (:p)', type: 'checkbox', checked: true, why: "Filtre VIP'e yazılsa bile SNAT'lı sunucu tarafı akışı da yakalanır. :p olmadan VIP filtresi yalnız istemci tarafını gösterir; sunucu tarafında adresler (SNAT, üye) değişmiştir." }
                    ]
                },
                {
                    title: 'Ne yakalanacak',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'host', label: 'Adres (host)', type: 'text', validate: 'ip', optional: true, placeholder: '203.0.113.100', why: "Filtresiz yakalama yoğun cihazda CPU'yu yorar ve dosyayı hızla büyütür. VIP, istemci ya da üye adresiyle daraltın." },
                        { name: 'port', label: 'Port', type: 'text', optional: true, placeholder: '80' },
                        { name: 'rst', label: 'Yalnız RST paketleri', type: 'checkbox', why: "\"Bağlantı sıfırlandı\" şikâyetinde RST'yi kimin gönderdiğini hızlıca bulur: kaynak VIP ise BIG-IP, kaynak üye ise sunucu." },
                        { name: 'count', label: 'Paket sayısı (-c)', type: 'text', optional: true, placeholder: '1000', hint: 'Yakalama bu sayıda durur; unutulan yakalama diski doldurmaz.' },
                        { name: 'file', label: 'Dosya adı (/var/tmp)', type: 'text', optional: true, placeholder: 'vs_web.pcap', hint: 'Boş bırakılırsa ekrana yazılır. Wireshark için dosyaya yazın (-s0).' }
                    ]
                },
                {
                    title: 'RST nedeni',
                    icon: 'fas fa-bolt',
                    fields: [
                        { name: 'rstlog', label: 'RST nedenlerini geçici olarak /var/log/ltm\'e yaz (tm.rstcause.log)', type: 'checkbox', why: "BIG-IP'nin gönderdiği her RST için <code>01230140:3: RST sent from … , [0x…] No pool member available</code> gibi bir satır yazar. Yoğun sistemde log dolar: iş bitince kapatın." },
                        { name: 'rstpkt', label: 'Nedeni RST paketinin içine de koy (tm.rstcause.pkt)', type: 'checkbox', why: "Neden metni istemciye giden RST'nin yüküne eklenir; istemci tarafındaki Wireshark'ta da görünür. İç bilgiyi dışarı verir: yalnız test süresince açın." }
                    ]
                }
            ],
            submit: 'Komutları Oluştur'
        }, (data) => cgF5TcpdumpGen(data));
    }
};
function cgF5TcpdumpGen(data) {
    const w = [];
    const mg = data.iface === 'mgmt', vl = String(data.vlan || '').trim();
    if (data.iface === 'vlan' && !vl) w.push('⛔ VLAN adı girin (ör. external) ya da 0.0 seçin.');
    let dev = mg ? 'mgmt' : data.iface === 'vlan' ? cgEsc(vl || '<vlan>') : '0.0';
    const mod = mg ? '' : (data.noise || '') + (data.peer && data.noise ? 'p' : '');
    if (mg && (data.noise || data.peer)) w.push('ℹ mgmt Linux arayüzüdür: :n/:p ayrıntıları yalnız TMM arayüzlerinde (0.0, VLAN) çalışır; komuta eklenmedi.');
    if (data.peer && !data.noise && !mg) w.push('⚠ :p tek başına kullanılmaz; bir ayrıntı seviyesiyle birlikte verin (:nnnp).');
    const f = [];
    const host = String(data.host || '').trim(), port = String(data.port || '').trim();
    if (host) f.push('host ' + cgEsc(host));
    if (port) { if (!/^\d+$/.test(port)) w.push('⛔ Port sayı olmalı.'); f.push('port ' + cgEsc(port)); }
    if (data.rst) f.push("'tcp[tcpflags] & tcp-rst != 0'");
    if (!host && !port && !data.rst) w.push('⚠ Filtre yok: yoğun cihazda tüm trafik yakalanır. En azından VIP ya da istemci adresi verin.');
    const cnt = String(data.count || '').trim(); if (cnt && !/^\d+$/.test(cnt)) w.push('⛔ Paket sayısı sayı olmalı.');
    const file = String(data.file || '').trim().replace(/^\/var\/tmp\//, '');
    if (file && !/^[\w.-]+$/.test(file)) w.push('⛔ Dosya adında yalnız harf, rakam, nokta, alt çizgi ve tire kullanın.');
    const parts = ['tcpdump', '-nni', dev + (mod ? ':' + mod : '')];
    if (file) parts.push('-s0');
    if (cnt) parts.push('-c', cgEsc(cnt)); else if (file) { parts.push('-c', '100000'); w.push('ℹ Dosyaya yazarken -c 100000 eklendi: unutulan yakalama /var/tmp\'yi doldurmasın.'); }
    if (file) parts.push('-w', '/var/tmp/' + cgEsc(file));
    const cmd = parts.concat(f.join(' and ')).filter(Boolean).join(' ');
    let c = '# ========================================\n# F5 BIG-IP — Paket Yakalama (tcpdump)\n# ========================================\n\n';
    if (data.rstlog || data.rstpkt) {
        c += '# RST nedeni (geçici)\n';
        if (data.rstlog) c += 'tmsh modify sys db tm.rstcause.log value enable\n';
        if (data.rstpkt) c += 'tmsh modify sys db tm.rstcause.pkt value enable\n';
        c += '\n';
    }
    c += '# Yakalama (bash). Ekrana yazılıyorsa Ctrl+C ile durdurun\n' + cmd + '\n';
    if (file) c += '\n# Dosyayı cihazda okuma (Wireshark için dosyayı scp ile alın)\ntcpdump -nnr /var/tmp/' + cgEsc(file) + '\n';
    if (data.rstlog || data.rst) c += '\n# BIG-IP\'nin gönderdiği RST\'lerin nedeni ve sayaçları\ngrep 01230140 /var/log/ltm\ntmsh show net rst-cause\n';
    if (data.rstlog || data.rstpkt) {
        c += '\n# İş bitince geri kapat\n';
        if (data.rstlog) c += 'tmsh modify sys db tm.rstcause.log value disable\n';
        if (data.rstpkt) c += 'tmsh modify sys db tm.rstcause.pkt value disable\n';
    }
    if (!mg && !data.noise) w.push('ℹ Ayrıntı seviyesi olmadan VLAN yakalamasında giriş/çıkış ve virtual server bilgisi yazılmaz; destek kaydı için :nnn kullanın.');
    if (mg && host && /^(203\.0\.113|198\.51\.100)\./.test(host)) w.push('⚠ mgmt yalnız yönetim trafiğini görür; VIP/istemci trafiği için 0.0 seçin.');
    w.push('ℹ Okuma: kaynak VIP olan RST BIG-IP\'den gelir (nedeni rst_cause alanında); kaynak üye olan RST sunucudandır. Yanıtsız yinelenen SYN\'ler dönüş yolunun BIG-IP\'ye gelmediğini (SNAT yok, asimetrik yönlendirme) gösterir.');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}

// ── F5 BIG-IP: iRule Kütüphanesi (Temel koleksiyon) ──────────────────────────
// Kaynak: F5 Operations Portal IRULE_TEMPLATES.md şablonları (hataları düzeltilmiş, benzerleri birleştirilmiş) ve
// f5devcentral/irules-toolbox (MIT) fikirleri. Her kural CLI Lab iRule simülatöründe derlenip denenmiştir (labtest.d/irule-lib).
// Pool / data group / alan adları örnektir; kendi ortamınıza göre değiştirin.
const CG_IRULE_LIB = [
    { id: 'https301', cat: 'Yönlendirme', title: 'HTTP → HTTPS kalıcı yönlendirme (301)', lab: 'f5-30', src: 'şablon 2.1 (düzeltildi: 301 için HTTP::respond)',
      code: String.raw`when HTTP_REQUEST {
    # Host başlığındaki port atılır (app:8080 → app); URI yol + sorgu dizesidir
    HTTP::respond 301 Location "https://[getfield [HTTP::host] ":" 1][HTTP::uri]"
}`, desc: 'Port 80\'deki virtual server\'a bağlanır; her isteği aynı adres ve yolla https://\'e kalıcı olarak yönlendirir.', warn: ['Yalnız HTTP (80) VS\'ye bağlayın; HTTPS VS\'ye bağlanırsa sonsuz döngü olur.', 'HTTP::redirect her zaman 302 döner ve kod parametresi almaz ("HTTP::redirect url 301" yanlıştır).'], test: 'curl -I http://<vip>/sayfa?a=1' },
    { id: 'domain', cat: 'Yönlendirme', title: 'Eski alan adından yenisine taşıma (301)', lab: 'f5-30', src: 'şablon 2.2 (düzeltildi)',
      code: String.raw`when HTTP_REQUEST {
    set host [string tolower [getfield [HTTP::host] ":" 1]]
    if { $host ends_with "eski.lab.example" } {
        HTTP::respond 301 Location "https://yeni.lab.example[HTTP::uri]"
        return
    }
}`, desc: 'Eski alan adına (ve alt alan adlarına) gelen istekleri yol korunarak yeni alan adına taşır.', warn: ['contains yerine ends_with: "eski.lab.example.baska.site" gibi adlar eşleşmesin.', 'Yeni alan adı da aynı VS\'ye geliyorsa koşul onu dışarıda bırakmalı; yoksa döngü olur.'], test: 'curl -I --resolve eski.lab.example:80:<vip> http://eski.lab.example/a' },
    { id: 'www', cat: 'Yönlendirme', title: 'www olmayan adı www\'ye tamamlama', lab: 'f5-30', src: 'şablon 2.2',
      code: String.raw`when HTTP_REQUEST {
    if { [string tolower [getfield [HTTP::host] ":" 1]] eq "lab.example" } {
        HTTP::respond 301 Location "https://www.lab.example[HTTP::uri]"
        return
    }
}`, desc: 'Çıplak alan adını (lab.example) tek bir kanonik ada (www.lab.example) yönlendirir.', warn: ['Koşul "eşit değilse yönlendir" biçiminde yazılırsa hedef adın kendisi de yönlendirilir: sonsuz döngü (curl -L ile görülür).'], test: 'curl -IL --resolve lab.example:80:<vip> http://lab.example/' },
    { id: 'slash', cat: 'Yönlendirme', title: 'Sonda eğik çizgi (trailing slash) tamamlama', lab: 'f5-32', src: 'şablon 2.5 (düzeltildi: URI::path yerine HTTP::path)',
      code: String.raw`when HTTP_REQUEST {
    set path [HTTP::path]
    # uzantısı olmayan ve / ile bitmeyen yollar: /hakkimizda → /hakkimizda/
    if { $path ne "/" && ![string match "*/" $path] && ![string match "*.*" [URI::basename $path]] } {
        set q [HTTP::query]
        HTTP::respond 301 Location "[expr { $q eq "" ? "$path/" : "$path/?$q" }]"
        return
    }
}`, desc: 'Dizin gibi davranan yolların hep / ile bitmesini sağlar; sorgu dizesi korunur.', warn: ['URI::path dosya adını atıp dizini döner; yolun tamamı için HTTP::path kullanın.', 'Uygulama /a ve /a/ yollarını farklı işliyorsa önce uygulama ekibiyle konuşun.'], test: 'curl -I http://<vip>/hakkimizda?x=1' },
    { id: 'rewrite', cat: 'Yönlendirme', title: '/api önekini kaldırarak sunucuya iletme (URI yeniden yazma)', lab: 'f5-32', src: 'şablon 2.3',
      code: String.raw`when HTTP_REQUEST {
    # istemci /api/v1/x ister, sunucu /v1/x bekler; istemci farkı görmez (yönlendirme değil)
    if { [HTTP::path] starts_with "/api/" } {
        HTTP::uri [string range [HTTP::uri] 4 end]
    }
}`, desc: 'İsteği yönlendirmeden, sunucuya giderken yolu değiştirir.', warn: ['Sunucunun ürettiği mutlak bağlantılar (Location, HTML içindeki linkler) eski yolu bilmez; gerekirse yanıtta da düzeltme gerekir.'], test: 'curl http://<vip>/api/headers' },
    { id: 'hostpool', cat: 'Yük dengeleme', title: 'Host adına göre pool seçimi', lab: 'f5-32', src: 'şablon 4.2',
      code: String.raw`when HTTP_REQUEST {
    switch -- [string tolower [getfield [HTTP::host] ":" 1]] {
        "api.lab.example" { pool api_pool }
        "www.lab.example" -
        "lab.example" { pool web_pool }
        default {
            HTTP::respond 404 content "Bilinmeyen site" Content-Type "text/plain"
        }
    }
}`, desc: 'Tek VIP arkasında birden çok siteyi Host başlığına göre farklı pool\'lara dağıtır.', warn: ['Pool adları kayıtta doğrulanır: olmayan ad 01070151 "Unable to find pool" verir.', 'Liste uzarsa data group ve class match -value kullanın.'], test: 'curl --resolve api.lab.example:80:<vip> http://api.lab.example/' },
    { id: 'pathpool', cat: 'Yük dengeleme', title: 'Yola ve dosya uzantısına göre pool seçimi', lab: 'f5-32', src: 'şablon 4.1 + irules-toolbox "pool selection by file extension"',
      code: String.raw`when HTTP_REQUEST {
    switch -glob -- [string tolower [HTTP::path]] {
        "/api/*" { pool api_pool }
        "*.jpg" - "*.png" - "*.css" -
        "*.js" { pool static_pool }
        default { pool web_pool }
    }
}`, desc: 'API çağrılarını ve statik dosyaları ayrı sunuculara gönderir.', warn: ['switch ilk eşleşen dalı çalıştırır: özel desenleri genelden önce yazın.', 'HTTP::uri ile eşleştirmek sorgu dizesi yüzünden uzantı desenlerini kaçırır; HTTP::path kullanın.'], test: 'curl http://<vip>/api/x ; curl http://<vip>/a.png' },
    { id: 'hdrpool', cat: 'Yük dengeleme', title: 'Başlığa göre API sürümü yönlendirme', lab: 'f5-32', src: 'şablon 4.4 (persist kaldırıldı)',
      code: String.raw`when HTTP_REQUEST {
    switch -- [HTTP::header value "X-API-Version"] {
        "v2" { pool api_v2_pool }
        default { pool api_v1_pool }
    }
}`, desc: 'İstemcinin gönderdiği sürüm başlığına göre farklı API sunucularına yönlendirir.', warn: ['Başlık istemciden gelir ve kolayca değiştirilir: erişim/güvenlik kararı için kullanmayın.'], test: 'curl -H "X-API-Version: v2" http://<vip>/' },
    { id: 'canary', cat: 'Yük dengeleme', title: 'Kanarya (canary) dağıtımı: %10 yeni sürüme', lab: 'f5-32', src: 'şablon 4.3',
      code: String.raw`when HTTP_REQUEST {
    # test ekibi başlıkla zorlayabilir
    if { [HTTP::header value "X-Canary"] eq "true" } {
        pool canary_pool
        return
    }
    # geri kalan trafiğin yaklaşık %10'u yeni sürüme
    if { [expr { int(rand() * 100) }] < 10 } {
        pool canary_pool
    }
}`, desc: 'Yeni sürümü önce trafiğin küçük bir kısmıyla dener.', warn: ['Rastgele seçim her istekte değişir: kullanıcı oturumu iki sürüm arasında gidip gelebilir. Oturum tutarlılığı için persistence ya da çerez tabanlı karar gerekir.'], test: 'for i in {1..10}; do curl -s http://<vip>/; done' },
    { id: 'pathparse', cat: 'Yük dengeleme', title: 'Yolu parçalara ayırma (split / lindex / getfield)', lab: 'f5-32', src: 'irules-toolbox "tokenize http path" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    # /musteri/1234/fatura → parçalar: musteri 1234 fatura
    set parts [split [string trimleft [HTTP::path] "/"] "/"]
    set musteri [lindex $parts 1]
    if { [string is integer -strict $musteri] } {
        HTTP::header replace X-Musteri-No $musteri
    }
}`, desc: 'Yolun belirli bir parçasını okuyup sunucuya başlık olarak taşır.', warn: ['lindex olmayan indekste boş döner; sayı denetimi (string is integer) sahte değerleri eler.'], test: 'curl http://<vip>/musteri/1234/headers' },
    { id: 'ipblock', cat: 'Güvenlik', title: 'IP engelleme listesi (data group)', lab: 'f5-34', src: 'şablon 3.1',
      dg: 'tmsh create ltm data-group internal dg_engelli type ip records add { 203.0.113.0/24 { data "tarama" } }',
      code: String.raw`when CLIENT_ACCEPTED {
    # TCP bağlantısı kurulur kurulmaz, HTTP'ye geçmeden kes
    if { [class match [IP::client_addr] equals dg_engelli] } {
        log local0.warn "ENGELLI: [IP::client_addr]"
        reject
    }
}`, desc: 'Listedeki adreslerden gelen bağlantıyı en erken noktada (CLIENT_ACCEPTED) sıfırlar.', warn: ['Liste data group\'ta: yeni adres eklemek için kuralı değil listeyi değiştirin.', 'Yoğun saldırıda her engelleme log yazar: gerekirse logu kaldırın.'], test: 'tmsh modify ltm data-group internal dg_engelli records add { 198.51.100.0/24 { } }' },
    { id: 'pathacl', cat: 'Güvenlik', title: 'Yönetim yoluna yalnız izinli ağlardan erişim', lab: 'f5-34', src: 'irules-toolbox "restrict access by uri and ip" (yeniden yazıldı)',
      dg: 'tmsh create ltm data-group internal dg_yonetim type ip records add { 10.240.0.0/16 { } }',
      code: String.raw`when HTTP_REQUEST {
    if { [string tolower [HTTP::path]] starts_with "/yonetim" and ![class match [IP::client_addr] equals dg_yonetim] } {
        HTTP::respond 403 content "Erisim yok" Content-Type "text/plain"
        return
    }
}`, desc: 'Uygulamanın belirli bir yolunu yalnız data group\'taki ağlara açar; geri kalan her şey herkese açık kalır.', warn: ['Yol karşılaştırmasında büyük/küçük harf ve %2F gibi kodlamalar atlatma yolu olabilir; ciddi erişim denetimi için APM/WAF.'], test: 'curl -I http://<vip>/yonetim' },
    { id: 'method', cat: 'Güvenlik', title: 'HTTP metodu kısıtlama (TRACE ve diğerleri)', lab: 'f5-33', src: 'şablon 3.5',
      code: String.raw`when HTTP_REQUEST {
    switch -- [HTTP::method] {
        GET - HEAD - POST - PUT - DELETE - OPTIONS - PATCH { }
        default {
            HTTP::respond 405 content "Method Not Allowed" Allow "GET, HEAD, POST, PUT, DELETE, OPTIONS, PATCH"
            return
        }
    }
}`, desc: 'İzin listesindeki metotlar dışındakileri (TRACE dahil) 405 ile reddeder.', warn: ['Allow başlığı istemciye hangi metotların kabul edildiğini söyler (RFC gereği 405 ile birlikte gönderilir).'], test: 'curl -I -X TRACE http://<vip>/' },
    { id: 'uafilter', cat: 'Güvenlik', title: 'Tarama araçlarını User-Agent ile engelleme (data group)', lab: 'f5-34', src: 'şablon 3.4 (liste data group\'a taşındı)',
      dg: 'tmsh create ltm data-group internal dg_kotu_ua type string records add { nikto { } sqlmap { } masscan { } zgrab { } }',
      code: String.raw`when HTTP_REQUEST {
    set ua [string tolower [HTTP::header value "User-Agent"]]
    if { $ua eq "" or [class match $ua contains dg_kotu_ua] } {
        log local0.warn "KOTU_UA: [IP::client_addr] ua=$ua"
        HTTP::respond 403 content "Forbidden" Content-Type "text/plain"
        return
    }
}`, desc: 'Boş ya da bilinen tarama aracı User-Agent\'larını engeller.', warn: ['User-Agent kolayca değiştirilir; bu yalnız gürültüyü azaltır, güvenlik denetimi değildir.', 'Boş UA bazı izleme araçlarında olabilir: önce log ile gözlemleyin.'], test: 'curl -I -A "sqlmap/1.7" http://<vip>/' },
    { id: 'sqli', cat: 'Güvenlik', title: 'Basit SQL enjeksiyonu desen yakalama (WAF yerine geçmez)', lab: 'f5-33', src: 'şablon 3.3 (URI decode eklendi)',
      code: String.raw`when HTTP_REQUEST {
    # %27, + gibi kodlamaları açmadan bakmak kolayca atlatılır
    set u [string tolower [URI::decode [HTTP::uri]]]
    foreach p { "union select" "' or '1'='1" "drop table" "information_schema" "sleep(" } {
        if { $u contains $p } {
            log local0.warn "SQLI: [IP::client_addr] [HTTP::uri]"
            HTTP::respond 403 content "Forbidden" Content-Type "text/plain"
            return
        }
    }
}`, desc: 'URI\'de bilinen SQL enjeksiyonu kalıplarını arar.', warn: ['Bu bir öğretim örneğidir: çift kodlama, yorum satırları, gövdede gelen parametreler vb. kolayca atlatır. Gerçek koruma Advanced WAF (ASM) işidir.'], test: 'curl -I "http://<vip>/ara?q=1%27%20or%20%271%27=%271"' },
    { id: 'ratelimit', cat: 'Güvenlik', title: 'İstemci başına istek sınırı (table)', lab: 'f5-31', src: 'şablon 3.2',
      code: String.raw`when HTTP_REQUEST {
    set key "rl_[IP::client_addr]"
    # sayaç 60 saniye yaşar; limit 100 istek
    set n [table incr -mustexist $key]
    if { $n eq "" } {
        table set $key 1 60
        set n 1
    }
    if { $n > 100 } {
        HTTP::respond 429 content "Too Many Requests" Retry-After 60
        return
    }
}`, desc: 'Aynı istemci IP\'sinden gelen istekleri pencere başına sınırlar (oturum tablosu tüm bağlantılar arasında paylaşılır).', warn: ['NAT arkasındaki birçok kullanıcı tek IP\'den gelir: limiti buna göre seçin.', 'Büyük ölçekte BIG-IP\'nin DoS/L7 koruma özellikleri daha uygundur. Simülatör süreyi saymaz.'], test: 'for i in {1..5}; do curl -s -o /dev/null -w "%{http_code}\\n" http://<vip>/; done' },
    { id: 'sechdr', cat: 'Başlıklar', title: 'Güvenlik başlıkları paketi (HSTS, X-Frame-Options, nosniff…)', lab: 'f5-33', src: 'şablon 1.1',
      code: String.raw`when HTTP_RESPONSE {
    HTTP::header replace Strict-Transport-Security "max-age=31536000; includeSubDomains"
    HTTP::header replace X-Frame-Options SAMEORIGIN
    HTTP::header replace X-Content-Type-Options nosniff
    HTTP::header replace Referrer-Policy strict-origin-when-cross-origin
    HTTP::header replace Permissions-Policy "camera=(), microphone=(), geolocation=()"
}`, desc: 'Tarama raporlarında sık çıkan eksik güvenlik başlıklarını yanıtlara ekler.', warn: ['insert yerine replace: sunucu zaten ekliyorsa çift başlık oluşmaz.', 'HSTS yalnız HTTPS sitelerinde anlamlıdır; tarayıcı max-age boyunca HTTP\'ye dönmez. Önce kısa süreyle deneyin.', 'X-XSS-Protection artık önerilmez (modern tarayıcılarda etkisiz ya da zararlı); eklenmedi.'], test: 'curl -I https://<vip>/' },
    { id: 'hidehdr', cat: 'Başlıklar', title: 'Sunucu sürüm bilgisini gizleme', lab: 'f5-33', src: 'şablon 1.2',
      code: String.raw`when HTTP_RESPONSE {
    foreach h { Server X-Powered-By X-AspNet-Version X-AspNetMvc-Version } {
        HTTP::header remove $h
    }
}`, desc: 'Yazılım ve sürüm bilgisi taşıyan yanıt başlıklarını kaldırır.', warn: ['Bilgi gizleme tek başına güvenlik sağlamaz; yamaları yapmanın yerine geçmez.'], test: 'curl -I http://<vip>/' },
    { id: 'reqhdr', cat: 'Başlıklar', title: 'Sunucuya istemci bilgisi taşıma (X-Forwarded-For, -Proto)', lab: 'f5-33', src: 'şablon 1.3',
      code: String.raw`when HTTP_REQUEST {
    # replace: istemcinin gönderdiği sahte değer ezilir
    HTTP::header replace X-Forwarded-For [IP::client_addr]
    HTTP::header replace X-Forwarded-Proto [expr { [TCP::local_port] == 443 ? "https" : "http" }]
}`, desc: 'SNAT arkasındaki sunucuya gerçek istemci adresini ve protokolü iletir.', warn: ['HTTP profilinde insert-xforwarded-for açıksa ikisini birlikte kullanmayın.', 'Proxy zincirinde önceki XFF değerleri korunacaksa replace yerine ekleme mantığı gerekir.'], test: 'curl http://<vip>/headers' },
    { id: 'cors', cat: 'Başlıklar', title: 'CORS: ön kontrol (OPTIONS) yanıtı ve izin başlıkları', lab: 'f5-33', src: 'şablon 1.4',
      code: String.raw`when HTTP_REQUEST {
    if { [HTTP::method] eq "OPTIONS" } {
        HTTP::respond 204 Access-Control-Allow-Origin "https://app.lab.example" Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS" Access-Control-Allow-Headers "Authorization, Content-Type" Access-Control-Max-Age 86400
        return
    }
}
when HTTP_RESPONSE {
    HTTP::header replace Access-Control-Allow-Origin "https://app.lab.example"
}`, desc: 'Başka alan adındaki bir ön yüzün API\'yi çağırabilmesi için CORS başlıklarını BIG-IP\'de yönetir.', warn: ['Kimlik bilgili isteklerde (Allow-Credentials: true) Origin "*" olamaz; belirli adı yazın.', 'Bu kural HTTP_RESPONSE\'ta HTTP::method okumaz; istek bilgisi gerekiyorsa HTTP_REQUEST\'te değişkene alın.'], test: 'curl -I -X OPTIONS http://<vip>/api/x' },
    { id: 'csp', cat: 'Başlıklar', title: 'Content-Security-Policy (önce yalnız rapor)', lab: 'f5-33', src: 'şablon 1.6',
      code: String.raw`when HTTP_RESPONSE {
    if { [HTTP::header value "Content-Type"] starts_with "text/html" } {
        HTTP::header replace Content-Security-Policy-Report-Only "default-src 'self'; img-src 'self' data:; frame-ancestors 'self'"
    }
}`, desc: 'Tarayıcıya hangi kaynaklardan içerik yüklenebileceğini söyler; önce Report-Only ile gözlem yapılır.', warn: ['Uygulamaya özel yazılmalıdır; hazır bir CSP çoğu sitenin bir kısmını bozar. Rapor dönemi bitince Content-Security-Policy\'ye geçin.'], test: 'curl -I http://<vip>/' },
    { id: 'cache', cat: 'Başlıklar', title: 'Uzantıya göre Cache-Control', lab: 'f5-31', src: 'şablon 1.5 (düzeltildi: yol HTTP_REQUEST\'te saklanır)',
      code: String.raw`when HTTP_REQUEST {
    # HTTP::path yanıt olayında geçersizdir (kayıtta reddedilir): burada saklanır
    set path [string tolower [HTTP::path]]
}
when HTTP_RESPONSE {
    if { [regexp {\.(jpg|jpeg|png|gif|css|js|woff2?)$} $path] } {
        HTTP::header replace Cache-Control "public, max-age=2592000, immutable"
    } elseif { [HTTP::header value "Content-Type"] contains "application/json" } {
        HTTP::header replace Cache-Control "no-store"
    }
}`, desc: 'Statik dosyalara uzun önbellek süresi, API yanıtlarına önbelleğe almama başlığı ekler.', warn: ['immutable yalnız içerik adı değişen (sürümlü) dosyalarda güvenlidir.', 'regexp yerine switch -glob daha ucuzdur; birkaç desende fark önemsizdir.'], test: 'curl -I http://<vip>/a.css' },
    { id: 'lochttps', cat: 'Başlıklar', title: 'Sunucunun Location başlığındaki http://\'yi https://\'e çevirme', lab: 'f5-33', src: 'irules-toolbox "http to https redirect in location header" (düzeltildi)',
      code: String.raw`when HTTP_RESPONSE {
    # SSL offload arkasındaki sunucu kendini http sanıp http:// ile yönlendirir
    if { [HTTP::header exists Location] } {
        HTTP::header replace Location [string map { "http://" "https://" } [HTTP::header value Location]]
    }
}`, desc: 'SSL offload arkasında sunucunun ürettiği yönlendirmelerin HTTPS\'te kalmasını sağlar.', warn: ['Orijinal örnekte string map listesi süslü parantez içinde $host kullandığı için değişken açılmıyordu; burada sabit önek değiştiriliyor.', 'Aynı iş HTTP profilinde redirect-rewrite ile de yapılabilir.'], test: 'curl -I http://<vip>/eski' },
    { id: 'maint', cat: 'Kullanılabilirlik', title: 'Bakım modu: yöneticiler hariç 503', lab: 'f5-35', src: 'şablon 2.4 (bayrak ve IP listesi data group\'a taşındı)',
      dg: 'tmsh create ltm data-group internal dg_bakim type string records add { aktif { data 1 } }\ntmsh create ltm data-group internal dg_yonetici type ip records add { 10.240.0.0/16 { } }',
      code: String.raw`when HTTP_REQUEST {
    if { [class lookup aktif dg_bakim] eq "1" and ![class match [IP::client_addr] equals dg_yonetici] } {
        HTTP::respond 503 content "<h1>Bakimdayiz</h1>" Content-Type "text/html" Retry-After 3600
        return
    }
}`, desc: 'Bakım anahtarı data group\'ta tutulur: kuralı değiştirmeden aç/kapa yapılır; yöneticiler siteyi görmeye devam eder.', warn: ['Kapatmak için: tmsh modify ltm data-group internal dg_bakim records modify { aktif { data 0 } }.', 'Bakım sayfası 200 değil 503 + Retry-After ile dönmeli.'], test: 'curl -I http://<vip>/' },
    { id: 'sorry', cat: 'Kullanılabilirlik', title: 'Özür sayfası: pool\'da üye kalmayınca 503', lab: 'f5-35', src: 'irules-toolbox "sorry page" fikri (yeniden yazıldı)',
      code: String.raw`when LB_FAILED {
    HTTP::respond 503 content "<h1>Kisa sure sonra tekrar deneyin</h1>" Content-Type "text/html" Retry-After 300
}`, desc: 'Sunucuların hepsi kapalıyken kullanıcı bağlantı hatası yerine anlaşılır bir sayfa görür.', warn: ['Yalnız LB seçimi başarısız olduğunda çalışır; sunucu 5xx dönüyorsa tetiklenmez.'], test: 'curl -I http://<vip>/' },
    { id: 'accesslog', cat: 'Log', title: 'Erişim ve sunucu hatası logu (istek → yanıt)', lab: 'f5-31', src: 'şablon 5.1 + 5.2 (birleştirildi)',
      code: String.raw`when HTTP_REQUEST {
    # yanıt olayında istek komutları geçersiz: değerler burada saklanır
    set t0 [clock clicks -milliseconds]
    set req "[IP::client_addr] [HTTP::method] [HTTP::host][HTTP::uri]"
}
when HTTP_RESPONSE {
    set ms [expr { [clock clicks -milliseconds] - $t0 }]
    if { [HTTP::status] >= 500 } {
        log local0.err "HATA $req -> [HTTP::status] sunucu=[LB::server addr] sure_ms=$ms"
    } else {
        log local0. "$req -> [HTTP::status] sure_ms=$ms"
    }
}`, desc: 'Her isteği ve özellikle 5xx dönen sunucuları /var/log/ltm\'e yazar.', warn: ['Yoğun sitede her istek bir log satırıdır: yalnız sorun giderme süresince bağlayın ya da Request Logging profili/HSL kullanın.'], test: 'curl http://<vip>/rapor ; tail /var/log/ltm' },
    { id: 'cookiesec', cat: 'Çerez', title: 'Çerezlere Secure, HttpOnly ve SameSite ekleme', lab: 'f5-33', src: 'F5 Agility iRules lab "Securing Cookies" fikri (yeniden yazıldı)',
      code: String.raw`when HTTP_RESPONSE {
    set cerezler [HTTP::header values Set-Cookie]
    if { [llength $cerezler] == 0 } { return }
    HTTP::header remove Set-Cookie
    foreach c $cerezler {
        set l [string tolower $c]
        if { !($l contains "; secure") } { append c "; Secure" }
        if { !($l contains "; httponly") } { append c "; HttpOnly" }
        if { !($l contains "; samesite") } { append c "; SameSite=Lax" }
        HTTP::header insert Set-Cookie $c
    }
}`, desc: 'Sunucunun gönderdiği tüm çerezlere eksik güvenlik bayraklarını ekler; tarama bulgusunu uygulamaya dokunmadan kapatır.', warn: ['Secure bayraklı çerez yalnız HTTPS\'te gönderilir: HTTP ile çalışan bir uygulamada oturum kopar.', 'HttpOnly JavaScript\'in çereze erişimini keser; ön yüz çerezi okuyorsa o çerezi hariç tutun.'], test: 'curl -I https://<vip>/giris' },
    { id: 'cookieexp', cat: 'Çerez', title: 'Bir çerezi istemcide silme (süresi geçmiş çerez)', lab: 'f5-33', src: 'irules-toolbox "expire a cookie" (yeniden yazıldı)',
      code: String.raw`when HTTP_RESPONSE {
    # eski_oturum çerezini tarayıcıdan sildir
    HTTP::header insert Set-Cookie "eski_oturum=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/"
}`, desc: 'Uygulama değişikliği sonrası tarayıcılarda kalan eski bir çerezi temizler.', warn: ['Path ve Domain, silinecek çerezin ayarlandığı değerlerle aynı olmalı; yoksa tarayıcı başka bir çerez sanar.'], test: 'curl -I http://<vip>/' },
    { id: 'cookielogin', cat: 'Çerez', title: 'Oturum çerezi yoksa giriş sayfasına yönlendirme', lab: 'f5-32', src: 'irules-toolbox "cookie checking" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    set p [string tolower [HTTP::path]]
    # giriş sayfası ve statik dosyalar serbest
    if { $p starts_with "/giris" or $p starts_with "/static/" } { return }
    if { ![HTTP::cookie exists "OTURUM"] } {
        HTTP::redirect "/giris?geri=[URI::encode [HTTP::uri]]"
    }
}`, desc: 'Oturum çerezi olmayan istekleri giriş sayfasına gönderir; dönüş adresi parametre olarak taşınır.', warn: ['Bu bir kimlik doğrulama değildir: çerezin varlığı değerinin geçerli olduğunu kanıtlamaz. Gerçek denetim APM ya da uygulama işidir.', 'Giriş sayfasını istisna tutmazsanız sonsuz yönlendirme olur.'], test: 'curl -I http://<vip>/hesap' },
    { id: 'reselect', cat: 'Kullanılabilirlik', title: 'Ana pool çökünce yedek pool\'a geçiş (LB::reselect)', lab: 'f5-35', src: 'irules-toolbox "disable persistence and reselect on lb fail" (sadeleştirildi)',
      code: String.raw`when LB_FAILED {
    # ana pool'da üye kalmadı: yedek pool dene
    if { [active_members yedek_pool] > 0 } {
        LB::reselect pool yedek_pool
    } else {
        HTTP::respond 503 content "Hizmet gecici olarak kullanilamiyor" Retry-After 120
    }
}`, desc: 'Birincil sunucuların hepsi kapalıyken trafiği başka bir veri merkezindeki ya da yedek sunuculara aktarır.', warn: ['Aynı işi pool üzerinde priority group ya da VS fallback ayarları da yapabilir; iRule yalnız özel mantık gerektiğinde.'], test: 'curl -I http://<vip>/' },
    { id: 'srcpool', cat: 'Yük dengeleme', title: 'İstemci ağına göre pool seçimi', lab: 'f5-34', src: 'irules-toolbox "distribute by source ip" (yeniden yazıldı)',
      code: String.raw`when CLIENT_ACCEPTED {
    # iç ağdan gelenler iç sunuculara (HTTP'ye gerek yok: bağlantı kurulurken karar verilir)
    if { [IP::addr [IP::client_addr] equals 10.240.0.0/16] } {
        pool ic_pool
    }
}`, desc: 'Kaynak adrese göre farklı sunucu grubuna yönlendirir (ör. iç kullanıcılar ve internet).', warn: ['Çok sayıda ağ varsa data group ve class match kullanın.', 'CLIENT_ACCEPTED HTTP profili gerektirmez; her protokolde çalışır.'], test: 'curl http://<vip>/' },
    { id: 'memberdbg', cat: 'Yük dengeleme', title: 'Hata ayıklama: sorgu parametresiyle belirli sunucuya gitme', lab: 'f5-32', src: 'irules-toolbox "poolmem select by query param" (yeniden yazıldı)',
      dg: 'tmsh create ltm data-group internal dg_yonetim type ip records add { 10.240.0.0/16 { } }',
      code: String.raw`when HTTP_REQUEST {
    # ?sunucu=10.64.30.51 yalnız yönetim ağından kabul edilir
    set s [URI::query [HTTP::uri] sunucu]
    if { $s ne "" and [class match [IP::client_addr] equals dg_yonetim] } {
        pool web_pool member $s 80
    }
}`, desc: 'Destek ekibinin sorunlu bir sunucuyu doğrudan test edebilmesi için isteği seçilen üyeye gönderir.', warn: ['İzin kontrolü olmadan açık bırakmayın: herkes arka uç sunucuları tek tek hedefleyebilir.'], test: 'curl "http://<vip>/?sunucu=10.64.30.51"' },
    { id: 'porthdr', cat: 'Başlıklar', title: 'Gelinen porta göre başlık ekleme', lab: 'f5-33', src: 'irules-toolbox "insert custom header by vip port" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    switch -- [TCP::local_port] {
        443 { HTTP::header replace X-Kanal "guvenli" }
        8080 { HTTP::header replace X-Kanal "test" }
        default { HTTP::header replace X-Kanal "genel" }
    }
}`, desc: 'Aynı iRule birden çok VS\'de kullanıldığında sunucuya hangi porttan gelindiğini bildirir.', warn: ['TCP::local_port VS\'nin portudur; istemcinin portu için TCP::client_port.'], test: 'curl http://<vip>/headers' },
    { id: 'reqid', cat: 'Başlıklar', title: 'İstek kimliği: istek ve yanıta aynı X-Request-ID', lab: 'f5-31', src: 'irules-toolbox "request headers in response" fikri (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    # istemci göndermediyse üret; aynı değer sunucuya ve yanıta gider
    set rid [HTTP::header value X-Request-ID]
    if { $rid eq "" } {
        set rid [format "%08x%04x" [clock seconds] [expr { int(rand() * 65535) }]]
        HTTP::header insert X-Request-ID $rid
    }
}
when HTTP_RESPONSE {
    HTTP::header replace X-Request-ID $rid
}`, desc: 'Bir isteği BIG-IP, sunucu ve istemci loglarında aynı kimlikle izlemeyi sağlar.', warn: ['Değişken HTTP_REQUEST\'te set edildi: HTTP_RESPONSE\'ta okunabilir (bağlantı boyunca yaşar).'], test: 'curl -I http://<vip>/' },
    { id: 'xffchain', cat: 'Başlıklar', title: 'X-Forwarded-For zincirine ekleme (önünde başka proxy varsa)', lab: 'f5-33', src: 'şablon 1.3 çeşitlemesi',
      code: String.raw`when HTTP_REQUEST {
    set xff [HTTP::header value X-Forwarded-For]
    if { $xff eq "" } {
        HTTP::header insert X-Forwarded-For [IP::client_addr]
    } else {
        HTTP::header replace X-Forwarded-For "$xff, [IP::client_addr]"
    }
}`, desc: 'BIG-IP önünde CDN ya da başka bir proxy varken gerçek istemci zincirini koruyarak kendi gördüğü adresi ekler.', warn: ['Zincirin ilk elemanı istemcinin kendisi yazabileceği bir değerdir; yalnız güvendiğiniz proxy\'lerden gelen kısmına güvenin.'], test: 'curl -H "X-Forwarded-For: 192.0.2.5" http://<vip>/headers' },
    { id: 'hostrewrite', cat: 'Başlıklar', title: 'Sunucuya giden Host başlığını iç ada çevirme', lab: 'f5-33', src: 'irules-toolbox "reverse proxy" / "changing http header host" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    # dış ad: www.lab.example → iç uygulama adı
    if { [string tolower [getfield [HTTP::host] ":" 1]] eq "www.lab.example" } {
        HTTP::header replace Host "portal.ic.lab.example"
    }
}`, desc: 'Arka uç uygulama farklı bir sanal host adıyla yapılandırıldığında dış adı iç ada çevirir.', warn: ['Sunucu yanıtlarındaki Location ve linkler iç adı içerebilir; yanıt tarafında da düzeltme gerekebilir (Location yeniden yazma kuralı).'], test: 'curl --resolve www.lab.example:80:<vip> http://www.lab.example/headers' },
    { id: 'mobile', cat: 'Yönlendirme', title: 'Mobil tarayıcıları mobil siteye yönlendirme', lab: 'f5-32', src: 'irules-toolbox "redirect mobile browsers" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    set ua [string tolower [HTTP::header value User-Agent]]
    if { ($ua contains "iphone" or $ua contains "android") and [HTTP::cookie value "masaustu"] ne "1" } {
        HTTP::redirect "https://m.lab.example[HTTP::uri]"
    }
}`, desc: 'Telefonlardan gelenleri mobil siteye gönderir; kullanıcı masaüstünü seçtiyse (çerez) dokunmaz.', warn: ['User-Agent tespiti kusurludur; mümkünse duyarlı (responsive) tasarım tercih edilir.', 'Mobil site aynı VS\'deyse koşul m.lab.example\'ı dışarıda bırakmalı.'], test: 'curl -I -A "Mozilla/5.0 (iPhone)" http://<vip>/' },
    { id: 'locport', cat: 'Yönlendirme', title: 'Sunucu yönlendirmelerindeki iç portu temizleme', lab: 'f5-33', src: 'irules-toolbox "remove port from redirects" (yeniden yazıldı)',
      code: String.raw`when HTTP_RESPONSE {
    # sunucu Location: http://site:8080/... üretiyor; istemci 80/443'ten geliyor
    if { [HTTP::is_redirect] } {
        HTTP::header replace Location [string map { ":8080/" "/" } [HTTP::header value Location]]
    }
}`, desc: 'Arka uç sunucunun kendi dinlediği portu yönlendirme adresine koyduğu durumlarda istemcinin kırık bağlantıya gitmesini önler.', warn: ['HTTP profilindeki redirect-rewrite seçeneği aynı işi kod yazmadan yapar.'], test: 'curl -I http://<vip>/eski' },
    { id: 'queryrename', cat: 'Yönlendirme', title: 'Sorgu parametresinin adını değiştirme (URI yeniden yazma)', lab: 'f5-32', src: 'irules-toolbox "rewrite partial query string" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    # eski istemciler ?id= gönderiyor, yeni uygulama ?no= bekliyor
    if { [HTTP::query] contains "id=" } {
        HTTP::uri [string map { "?id=" "?no=" "&id=" "&no=" } [HTTP::uri]]
    }
}`, desc: 'Eski bağlantıları uygulamayı değiştirmeden yeni parametre adına uyarlar.', warn: ['string map düz metin değiştirir: "valid=" gibi parametreleri etkilememesi için ?/& önekleriyle eşleştirildi.'], test: 'curl http://<vip>/ara?id=5' },
    { id: 'lower', cat: 'Yönlendirme', title: 'URI\'yi küçük harfe çevirme (büyük/küçük harf duyarlı sunucular)', lab: 'f5-32', src: 'irules-toolbox "lowercase uri" (düzeltildi: çift köşeli parantez ve tek karakterlik desen hatası)',
      code: String.raw`when HTTP_REQUEST {
    # yalnız büyük harf içeriyorsa değiştir
    if { [HTTP::path] ne [string tolower [HTTP::path]] } {
        HTTP::path [string tolower [HTTP::path]]
    }
}`, desc: 'Windows\'tan taşınan sitelerde /Resimler/Logo.PNG ile /resimler/logo.png\'yi aynı yapar; sorgu dizesine dokunmaz.', warn: ['Orijinal topluluk örneğinde [string match {[A-Z]} …] yalnız tek karakterlik URI\'yi eşliyor, [[HTTP::path] …] ise TCL hatası veriyordu.', 'Sorgu değerleri büyük/küçük harf duyarlı olabilir: yalnız path değiştirilir.'], test: 'curl http://<vip>/Resimler/Logo.PNG' },
    { id: 'index', cat: 'Yönlendirme', title: 'Kök isteği varsayılan sayfaya çevirme', lab: 'f5-32', src: 'irules-toolbox "append uri" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    if { [HTTP::path] eq "/" } {
        HTTP::path "/index.html"
    }
}`, desc: 'Varsayılan belge tanımlı olmayan sunucularda / isteğini /index.html olarak iletir (istemci fark etmez).', warn: ['Yönlendirme değil yeniden yazmadır: tarayıcı adres çubuğunda / görmeye devam eder.'], test: 'curl http://<vip>/' },
    { id: 'selhttps', cat: 'Yönlendirme', title: 'Yalnız hassas yolları HTTPS\'e zorlama', lab: 'f5-30', src: 'irules-toolbox "selective https redirect" (düzeltildi: http\'ye yönlendirip döngü yapıyordu)',
      code: String.raw`when HTTP_REQUEST {
    switch -glob -- [string tolower [HTTP::path]] {
        "/giris*" - "/hesap*" - "/odeme*" {
            HTTP::respond 301 Location "https://[getfield [HTTP::host] ":" 1][HTTP::uri]"
        }
    }
}`, desc: 'Sitenin tamamı henüz HTTPS\'e geçmediyse kimlik ve ödeme sayfalarını HTTPS\'e zorlar.', warn: ['Topluluk örneği hedef adres olarak yine http:// kullanıyordu: sonsuz döngü.', 'Uzun vadede tüm siteyi HTTPS\'e taşıyın; karma içerik (mixed content) tarayıcı uyarısı üretir.'], test: 'curl -I http://<vip>/giris' },
    { id: 'hotlink', cat: 'Güvenlik', title: 'Görsellerin başka sitelerce kullanımını engelleme (Referer)', lab: 'f5-33', src: 'irules-toolbox "referer inspection" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    switch -glob -- [string tolower [HTTP::path]] {
        "*.jpg" - "*.png" - "*.gif" {
            set ref [string tolower [HTTP::header value Referer]]
            # Referer yoksa (doğrudan açma) izin ver; başka siteden geliyorsa engelle
            if { $ref ne "" and !($ref contains "lab.example") } {
                HTTP::respond 403 content "Bu gorsel baska sitelerde kullanilamaz"
            }
        }
    }
}`, desc: 'Başka sitelerin sizin bant genişliğinizle görsellerinizi göstermesini (hotlinking) engeller.', warn: ['Referer istemci tarafından gönderilir ve değiştirilebilir; bu bir erişim güvenliği değildir.', 'contains "lab.example" "lab.example.kotu.site" gibi adları da geçirir; kesin denetim için host kısmını ayırıp ends_with kullanın.'], test: 'curl -I -H "Referer: https://baska.site/" http://<vip>/a.png' },
    { id: 'shellshock', cat: 'Güvenlik', title: 'Shellshock (CVE-2014-6271) deseni taşıyan başlıkları engelleme', lab: 'f5-34', src: 'irules-toolbox "shellshock http" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    foreach h [HTTP::header names] {
        if { [HTTP::header value $h] starts_with "() \{" } {
            log local0.warn "SHELLSHOCK: [IP::client_addr] baslik=$h"
            reject
            return
        }
    }
}`, desc: 'Başlık değeri bash fonksiyon tanımıyla başlayan istekleri keser (eski ama hâlâ taranan bir açık).', warn: ['Yamasız bir CGI sunucusunun yerine geçmez; asıl çözüm bash güncellemesi ve WAF imzalarıdır.'], test: 'curl -I -A "() { :; }; /bin/eject" http://<vip>/' },
    { id: 'decode', cat: 'Güvenlik', title: 'Çift kodlanmış URI\'yi sonuna kadar çözüp denetleme', lab: 'f5-34', src: 'irules-toolbox "fully decode uri" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    # %252e%252e → %2e%2e → .. : tek çözme yetmez
    set u [HTTP::uri]
    set n 0
    while { $u ne [URI::decode $u] and $n < 5 } {
        set u [URI::decode $u]
        incr n
    }
    if { $u contains "../" } {
        HTTP::respond 400 content "Gecersiz istek"
    }
}`, desc: 'Dizin gezinme (path traversal) gibi saldırıları gizlemek için yapılan çoklu URL kodlamasını açar.', warn: ['Döngüye üst sınır konmalı (burada 5): kötü niyetli girdi işlemciyi yormasın.'], test: 'curl -I "http://<vip>/%252e%252e/%252e%252e/etc/passwd"' },
    { id: 'botnoise', cat: 'Güvenlik', title: 'Uygulamada olmayan bilinen saldırı yollarını düşürme', lab: 'f5-34', src: 'irules-toolbox "discard requests on url" (yeniden yazıldı)',
      code: String.raw`when HTTP_REQUEST {
    switch -glob -- [string tolower [HTTP::path]] {
        "/wp-admin*" - "/wp-login.php" - "/xmlrpc.php" - "/phpmyadmin*" {
            # yanıt verme: tarayıcı botu zaman kaybetsin, sunucu yorulmasın
            drop
        }
    }
}`, desc: 'WordPress kullanmayan bir sitede WordPress/phpMyAdmin tarayan bot trafiğini sunucuya ulaşmadan atar.', warn: ['drop sessizce düşürür (istemci zaman aşımı görür); reject RST gönderir, HTTP::respond 404 kibar bir yanıt verir.', 'Sitenizde bu yollardan biri gerçekten varsa kendi uygulamanızı kapatırsınız.'], test: 'curl -I -m 3 http://<vip>/wp-login.php' },
    { id: 'sensfiles', cat: 'Güvenlik', title: '.git, .env, yedek dosyalarına erişimi engelleme', lab: 'f5-34', src: 'yeni (sık tarama bulgusu)',
      code: String.raw`when HTTP_REQUEST {
    set p [string tolower [URI::decode [HTTP::path]]]
    if { $p contains "/.git" or $p contains "/.env" or $p ends_with ".bak" or $p ends_with ".old" or $p ends_with "~" } {
        HTTP::respond 404 content "Not Found"
    }
}`, desc: 'Yanlışlıkla yayında bırakılmış depo, ortam değişkeni ve yedek dosyalarının indirilmesini engeller.', warn: ['Kök neden sunucudaki dosyalardır: kural geçici önlemdir, dosyaları kaldırın.', 'Gerçek dosya yoksa bile 404 dönmek bilgi vermez; 403 dosyanın varlığını ima eder.'], test: 'curl -I http://<vip>/.git/config' },
    { id: 'portrange', cat: 'Güvenlik', title: 'Tüm portları dinleyen VS\'de yalnız izinli portlar', lab: 'f5-23', src: 'irules-toolbox "manage vip and port range" (yeniden yazıldı)',
      code: String.raw`when CLIENT_ACCEPTED {
    # VS destination 203.0.113.50:any: yalnız 80, 443 ve 8000-8099 kabul
    set p [TCP::local_port]
    if { !($p == 80 or $p == 443 or ($p >= 8000 and $p <= 8099)) } {
        reject
    }
}`, desc: 'Port\'u any olan bir virtual server\'da istenmeyen portlara gelen bağlantıları keser.', warn: ['Mümkünse ayrı VS\'ler ya da port listesi (traffic matching criteria) kullanın; iRule her bağlantıda çalışır.'], test: 'curl -I -m 3 http://<vip>:9000/' },

];
F5LTM.irulelib = {
    label: 'iRule Kütüphanesi',
    init(container) {
        const cats = [...new Set(CG_IRULE_LIB.map(x => x.cat))];
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-book',
                title: 'iRule Kütüphanesi (' + CG_IRULE_LIB.length + ' doğrulanmış kural)',
                desc: 'Sahada en sık ihtiyaç duyulan iRule\'lar: her biri CLI Lab simülatöründe denendi, Türkçe açıklamalı ve yükleme / bağlama / doğrulama komutlarıyla. Kaynak: F5 Operations Portal şablonları (düzeltilmiş) ve f5devcentral/irules-toolbox (MIT) fikirleri.',
                badge: { text: 'iRule', cls: 'info' }
            },
            sections: [
                {
                    title: 'Kural',
                    icon: 'fas fa-code',
                    fields: [
                        { name: 'id', label: 'Kural', type: 'select', required: true, options: [].concat(...cats.map(c => CG_IRULE_LIB.filter(x => x.cat === c).map(x => ({ value: x.id, label: c + ' · ' + x.title })))) },
                        { name: 'name', label: 'Kural adı (BIG-IP\'de)', type: 'text', optional: true, placeholder: 'r_ornek', hint: 'Boşsa şablon adından türetilir.' },
                        { name: 'vs', label: 'Bağlanacak virtual server (opsiyonel)', type: 'text', optional: true, placeholder: 'vs_web' }
                    ]
                }
            ],
            submit: 'Kuralı Göster'
        }, (data) => cgF5IruleLibGen(data));
    }
};
function cgF5IruleLibGen(data) {
    const t = CG_IRULE_LIB.find(x => x.id === data.id) || CG_IRULE_LIB[0];
    const name = String(data.name || '').trim() || 'r_' + t.id, vs = String(data.vs || '').trim(), w = [];
    if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,62}$/.test(name)) w.push('⛔ Kural adı harfle başlamalı; harf, rakam, _ . - kullanın.');
    let c = '# ========================================\n# iRule Kütüphanesi — ' + t.title + '\n# ========================================\n# ' + t.desc + '\n\n';
    let k = 1;
    if (t.dg) c += '# ' + (k++) + ') Data group\n' + t.dg + '\n\n';
    c += '# ' + (k++) + ') Kuralı yükle: tmsh\'e yapıştırın ve Ctrl+D (ya da GUI: Local Traffic > iRules > Create)\ntmsh load sys config merge from-terminal\nltm rule ' + name + ' {\n' + t.code + '\n}\n\n';
    c += '# ' + (k++) + ') Virtual server\'a ekle (mevcut kurallar korunur; HTTP olayı için VS\'de HTTP profili gerekir)\ntmsh modify ltm virtual ' + (vs || '<vs>') + ' rules add { ' + name + ' }\n\n';
    c += '# Doğrulama\n' + t.test.replace(/<vip>/g, '<vip>') + '\ntmsh show ltm rule ' + name + '   # Executions / Failures\ngrep 01220001 /var/log/ltm       # TCL hatası var mı?\n';
    t.warn.forEach(x => w.push('⚠ ' + x));
    w.push('ℹ Pool, data group ve alan adları örnektir; kendi ortamınıza göre değiştirin. Kaynak: ' + t.src + '.');
    w.push('ℹ Kuralı CLI Lab\'da deneyin: ' + t.lab + ' (Lab > F5 > Seviye 7). Simülatör kuralı gerçek BIG-IP gibi kayıtta doğrular ve istekte çalıştırır.');
    return { config: c.replace(/ {2,}#/g, ' #'), warnings: w };
}
