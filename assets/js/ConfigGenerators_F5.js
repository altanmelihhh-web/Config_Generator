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
                        { name: 'vip', why: "VIP adresi bir self IP ile aynı subnet içinde değilse BIG-IP bu adres için ARP cevabı üretmez ve istemci hiç bağlanamaz. Port yanlış yazılırsa VS listede sağlıklı görünür ama trafik hiçbir zaman ulaşmaz.", label: 'VIP (Destination IP:Port)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.100:443', hint: 'Dinlenecek IP adresi ve port numarası.' },
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
                        { name: 'ssl_profile', why: "Client-SSL profili istemci ile BIG-IP arasındaki TLS'i sonlandırır; yoksa 443 trafiği şifreli geçer ve iRule, cookie persistence, WAF gibi katman 7 özellikleri tamamen devre dışı kalır. <b>Server-SSL</b> ile karıştırılmamalı: o backend bacağını şifreler.", label: 'SSL Client Profile', type: 'text', optional: true, placeholder: 'MY_CLIENT_SSL', hint: 'Yalnızca HTTPS türünde gereklidir.' },
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
            c += '    }\n';
            c += '    pool ' + pool_name + '\n';
            if (persist) c += '    persist replace-all-with { ' + persist + ' { default yes } }\n';
            if (snat === 'automap') c += '    source-address-translation { type automap }\n';
            if (irule) c += '    rules { ' + irule + ' }\n';
            c += '    vlans-enabled\n}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm virtual ' + vs_name + '\n# tmsh show ltm virtual ' + vs_name + ' stats\n';
            return c;
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
            c += '    min-active-members ' + minActive + '\n}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm pool ' + pool_name + '\n# tmsh show ltm pool ' + pool_name + ' members stats\n';
            return c;
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
            if (send) c += '    send "' + send + '"\n';
            if (recv) c += '    recv "' + recv + '"\n';
            c += '}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm monitor ' + mon_type + ' ' + mon_name + '\n';
            return c;
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
                title: 'SSL Client Profile',
                desc: 'İstemci tarafı SSL/TLS sonlandırması için sertifika, anahtar ve şifreleme zinciri yapılandırır; güvenli cipher suite zorunlu kılınır.'
            },
            sections: [
                {
                    title: 'Profil Bilgileri',
                    icon: 'fas fa-id-card',
                    fields: [
                        { name: 'prof_name', why: "Profil adı virtual server'a bağlanırken kullanılır; yanlış profil bağlanırsa istemciler sertifika isim uyuşmazlığı (name mismatch) uyarısı alır ve siteye güvenmez.", label: 'Profil Adı', type: 'text', required: true, placeholder: 'MY_CLIENT_SSL', hint: 'SSL profili için benzersiz bir isim.' },
                        { name: 'cert_name', why: "Sertifika BIG-IP üzerinde önceden import edilmiş olmalı, aksi halde profil oluşturma <code>not found</code> ile başarısız olur. Sertifikadaki CN/SAN ile VIP'in DNS adı eşleşmezse tarayıcı güvenlik uyarısı gösterir.", label: 'Sertifika Adı', type: 'text', required: true, placeholder: 'myapp.crt', hint: 'BIG-IP üzerinde yüklü sertifika dosyası.' },
                        { name: 'key_name', why: "Key sertifikayla eşleşmezse SSL handshake <b>key mismatch</b> ile kırılır ve servis hiç açılmaz. Private key yalnızca BIG-IP üzerinde kalmalı, dışa aktarılmamalıdır.", label: 'Key Adı', type: 'text', required: true, placeholder: 'myapp.key', hint: 'Sertifikaya ait özel anahtar dosyası.' },
                        { name: 'chain', why: "Ara CA zinciri eksikse tarayıcılar çalışabilir ama mobil istemciler ve API çağrıları <b>untrusted issuer</b> hatası verir; bu sorun yalnızca tarayıcıda test edildiğinde hiç fark edilmez. Zinciri eklemek istemcinin ek doğrulama turunu da önler.", label: 'Chain Sertifika', type: 'text', optional: true, placeholder: 'ca-bundle.crt', hint: 'Ara CA zinciri; opsiyonel.' }
                    ]
                },
                {
                    title: 'Şifreleme',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'ciphers', why: "Cipher listesi çok darsa eski istemciler handshake failure alır; çok genişse RC4 ve 3DES gibi zayıf algoritmalar PCI-DSS taramalarında bulgu üretir. <code>!aNULL:!MD5</code> gibi negatif ifadeler kimlik doğrulamasız şifrelemeleri kapatır.", label: 'Cipher String', type: 'text', optional: true, placeholder: 'ECDHE+AES:!aNULL:!MD5:!RC4', hint: 'İzin verilen şifreleme algoritmaları.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { prof_name, cert_name, key_name, chain, ciphers } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — SSL Client Profile\n# ========================================\n\n';
            c += '# Sertifikayı yükle:\n# tmsh install sys crypto cert ' + cert_name + ' from-local-file /var/tmp/' + cert_name + '\n';
            c += '# tmsh install sys crypto key ' + key_name + ' from-local-file /var/tmp/' + key_name + '\n\n';
            c += 'tmsh create ltm profile client-ssl ' + prof_name + ' {\n';
            c += '    cert ' + cert_name + '\n';
            c += '    key ' + key_name + '\n';
            if (chain) c += '    chain ' + chain + '\n';
            if (ciphers) c += '    ciphers "' + ciphers + '"\n';
            c += '    options { no-sslv2 no-sslv3 no-tlsv1 }\n}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm profile client-ssl ' + prof_name + '\n';
            return c;
        });
    }
};

// ── F5 LTM: iRule ─────────────────────────────────────────────────────────────
F5LTM.irule = {
    label: 'iRule',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-code',
                title: 'iRule',
                desc: 'Trafik akışını kontrol etmek için TCL tabanlı iRule oluşturur; başlık ekleme, HTTPS yönlendirme veya header bazlı pool seçimi desteklenir.'
            },
            sections: [
                {
                    title: 'iRule Tipi',
                    icon: 'fas fa-random',
                    fields: [
                        { name: 'irule_name', why: "iRule adı VS'ye bağlanırken kullanılır ve partition duyarlıdır; adı sonradan değiştirmek bağlı tüm VS'lerde referansı koparır ve iRule sessizce çalışmaz hale gelir.", label: 'iRule Adı', type: 'text', required: true, placeholder: 'IRULE_XFORWARD', hint: 'iRule için benzersiz bir isim.' },
                        { name: 'irule_type', why: "Seçilen olay iRule'un trafiğin hangi aşamasında çalışacağını belirler; <code>HTTP_REQUEST</code> içinde SSL bilgisine erişilemez, bunun için <code>CLIENTSSL_HANDSHAKE</code> gerekir. Yanlış event seçimi iRule'un hiç tetiklenmemesine yol açar.", label: 'iRule Tipi', type: 'select', options: [
                            { value: 'xforward', label: 'X-Forwarded-For Insert' },
                            { value: 'redirect', label: 'HTTP → HTTPS Redirect' },
                            { value: 'pool_select', label: 'Header\'a göre Pool Seç' }
                        ]}
                    ]
                },
                {
                    title: 'Pool Seçimi Ayarları',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'hdr_name', why: "Header adı büyük/küçük harf duyarsızdır, ancak istemci bu başlığı hiç göndermezse koşul sessizce false döner ve trafik default pool'a gider. Güvenlik kararı istemci başlığına dayandırılıyorsa başlık dışarıdan sahte gönderilebileceği için önce temizlenmelidir.", label: 'Header Adı', type: 'text', optional: true, placeholder: 'X-Tenant', hint: 'Eşleştirilecek HTTP header adı.' },
                        { name: 'hdr_val', why: "Değer karşılaştırması birebir yapılır; büyük/küçük harf veya boşluk farkı eşleşmeyi sessizce bozar. Beklenmeyen değerler için mutlaka bir varsayılan davranış tanımlanmalıdır.", label: 'Header Değeri', type: 'text', optional: true, placeholder: 'tenant-a', hint: 'Eşleşme koşulu değeri.' },
                        { name: 'target_pool', why: "Hedef pool iRule çalıştığı anda mevcut değilse bağlantı düşer ve LTM log'una <code>no pool member available</code> yazılır. Pool seçimi iRule ile yapılsa bile VS'in default pool'u yedek olarak tanımlanmalıdır.", label: 'Hedef Pool', type: 'text', optional: true, placeholder: 'POOL_TENANT_A', hint: 'Eşleşme durumunda trafiğin gönderileceği pool.' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { irule_type, irule_name, hdr_name, hdr_val, target_pool } = data;
            let iruleBody = '';
            if (irule_type === 'xforward') {
                iruleBody = 'when HTTP_REQUEST {\n    HTTP::header insert "X-Forwarded-For" [IP::client_addr]\n}';
            } else if (irule_type === 'redirect') {
                iruleBody = 'when HTTP_REQUEST {\n    HTTP::redirect "https://[HTTP::host][HTTP::uri]"\n}';
            } else {
                iruleBody = 'when HTTP_REQUEST {\n    if { [HTTP::header value "' + hdr_name + '"] eq "' + hdr_val + '" } {\n        pool ' + target_pool + '\n    }\n}';
            }
            let c = '# ========================================\n# F5 BIG-IP LTM — iRule\n# ========================================\n\n';
            c += 'tmsh create ltm rule ' + irule_name + ' {\n' + iruleBody + '\n}\n\n';
            c += '# Doğrulama:\n# tmsh show ltm rule ' + irule_name + '\n';
            return c;
        });
    }
};

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
                        { name: 'peer_host', why: "Peer hostname karşı cihazın <code>tmsh list sys global-settings hostname</code> değeriyle birebir aynı olmalı; uyuşmazlık trust kurulumunu <b>device not found</b> ile başarısız kılar.", label: 'Peer Hostname', type: 'text', validate: 'ip', required: true, placeholder: 'bigip-standby', hint: 'Yedek cihazın hostname\'i.' },
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
                        { name: 'lang', why: "Uygulama dili aslında karakter kodlamasıdır; yanlış seçilirse Türkçe karakterli girdiler bozuk çözümlenir ve meşru istekler <b>illegal meta character</b> ihlali üretir. Policy oluşturulduktan sonra bu değer değiştirilemez.", label: 'Uygulama Dili', type: 'select', options: [
                            { value: 'utf-8', label: 'UTF-8' },
                            { value: 'auto-detect', label: 'Auto Detect' }
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
            c += '# TMSH komutları\n';
            c += 'tmsh create asm policy /Common/' + pol_name + ' {\n';
            c += '    active yes\n';
            c += '    enforcement-mode ' + enforcement + '\n';
            c += '    application-language ' + lang + '\n';
            c += '    template { name ' + template + ' }\n';
            c += '}\n\n';
            c += '# Virtual Server\'e bağla\n';
            c += 'tmsh modify ltm virtual /Common/' + vs_name + ' {\n';
            c += '    profiles add { /Common/' + pol_name + ' { context all } }\n';
            c += '}\n\n';
            c += 'tmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh show asm policy /Common/' + pol_name + '\n# tmsh show ltm virtual /Common/' + vs_name + '\n';
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
            c += '# AWAF policy JSON ile de oluşturulabilir; tmsh yolu:\n';
            c += 'tmsh create asm policy /Common/' + pol_name + ' {\n';
            c += '    active yes\n    enforcement-mode ' + enforcement + '\n';
            c += '    template { name POLICY_TEMPLATE_RAPID_DEPLOYMENT }\n';
            if (staging === 'no') c += '    signature-staging false\n';
            c += '}\n\n';
            if (bot_defense === 'yes') {
                c += '# Bot Defense Profili\n';
                c += 'tmsh create security bot-defense profile /Common/BD_' + pol_name + ' {\n';
                c += '    enforcement-mode blocking\n}\n\n';
                c += 'tmsh modify ltm virtual /Common/' + vs_name + ' {\n';
                c += '    profiles add { /Common/BD_' + pol_name + ' { context all } }\n}\n\n';
            }
            c += 'tmsh modify ltm virtual /Common/' + vs_name + ' {\n';
            c += '    profiles add { /Common/' + pol_name + ' { context all } }\n}\n\n';
            c += 'tmsh save sys config\n\n';
            c += '# Doğrulama:\n# tmsh show asm policy /Common/' + pol_name + ' detail\n# tmsh show security bot-defense profile\n';
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
                        { name: 'cert', why: "Backend sunucu mutual TLS istiyorsa bu sertifika sunulur; istenmiyorken yanlış sertifika verilmesi de handshake'i kırabilir. Yol partition ile birlikte tam yazılmalıdır.", label: 'Sertifika Yolu', type: 'text', required: true, placeholder: '/Common/server.crt', hint: 'Tam sertifika yolu.' },
                        { name: 'key', why: "Key ile sertifika eşleşmezse SSL bacağı hiç kurulamaz; pool üyeleri monitor'dan geçse bile trafik 502 ile döner ve sorun boş yere backend'de aranır.", label: 'Key Yolu', type: 'text', required: true, placeholder: '/Common/server.key', hint: 'Özel anahtar dosyasının tam yolu.' },
                        { name: 'chain', why: "Backend sertifikası doğrulanacaksa zincir eksik olduğunda tüm backend bağlantıları reddedilir. Doğrulama kapalıysa zincir gereksizdir, ancak bu durumda sahte backend'e karşı koruma da kalmaz.", label: 'Chain Sertifika', type: 'text', optional: true, placeholder: '/Common/ca-bundle.crt', hint: 'Ara CA zinciri; opsiyonel.' },
                        { name: 'cipher_string', why: "Backend ile ortak cipher bulunamazsa handshake <b>no shared cipher</b> ile başarısız olur; eski backend'ler modern cipher listesini desteklemeyebilir. SSL bridging senaryosunda iki bacağın cipher politikası ayrı ayrı yönetilir.", label: 'Cipher String', type: 'text', required: true, placeholder: 'DEFAULT:!SSLv3:!RC4', hint: 'İzin verilen şifreleme algoritmaları.' },
                        { name: 'peer_cert_mode', why: "<b>Require</b> seçilirse backend sertifikası doğrulanır; CA bundle eksikse tüm backend bağlantıları kopar. <b>Ignore</b> daha performanslıdır ama sahte backend'e karşı koruma sağlamaz ve uçtan uca şifreleme iddiasını zayıflatır.", label: 'Peer Cert Mode', type: 'select', options: [
                            { value: 'ignore', label: 'ignore' },
                            { value: 'require', label: 'require' },
                            { value: 'request', label: 'request' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { profile_name, cert, key, chain, cipher_string, peer_cert_mode } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — SSL Server Profile\n# ========================================\n\n';
            c += 'tmsh create ltm profile server-ssl ' + profile_name;
            c += ' cert ' + cert;
            c += ' key ' + key;
            if (chain) c += ' chain ' + chain;
            c += ' ciphers "' + cipher_string + '"';
            c += ' peer-cert-mode ' + peer_cert_mode + '\n\n';
            c += '# Doğrulama:\n# tmsh list ltm profile server-ssl ' + profile_name + '\n';
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
            const { profile_name, insert_xforwarded_for, oneconnect, redirect_rewrite, header_erase, header_insert } = data;
            let c = '# ========================================\n# F5 BIG-IP LTM — HTTP Profile\n# ========================================\n\n';
            c += 'tmsh create ltm profile http ' + profile_name;
            c += ' insert-xforwarded-for ' + insert_xforwarded_for;
            c += ' oneconnect-transformations ' + oneconnect;
            c += ' redirect-rewrite ' + redirect_rewrite;
            if (header_erase) c += ' header-erase "' + header_erase + '"';
            if (header_insert) c += ' header-insert "' + header_insert + '"';
            c += ' defaults-from http\n\n';
            c += '# Doğrulama:\n# tmsh list ltm profile http ' + profile_name + '\n';
            return c;
        });
    }
};

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
                        { name: 'vlans', why: "VLAN atanmayan route domain hiç trafik görmez; aynı VLAN birden fazla route domain'e atanamaz. Bu atama yanlış yapılırsa çakışan IP alanları birbirine karışır ve yönlendirme öngörülemez hale gelir.", label: 'VLAN\'lar (virgülle ayrılmış)', type: 'text', validate: 'vlan_list', optional: true, placeholder: 'vlan-customer-a', hint: 'Bu route domain\'e atanacak VLAN\'lar.' },
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
                        { name: 'interfaces', why: "Tagged arayüzde tag belirtilmezse trafik untagged kabul edilir ve düşer. Aynı arayüz birden çok VLAN'da tagged kullanılabilir, ancak untagged yalnızca tek VLAN'da olabilir.", label: 'Interface\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: '1.1,1.2', hint: 'VLAN\'a dahil edilecek fiziksel arayüzler.' }
                    ]
                },
                {
                    title: 'Self IP',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'self_ip', why: "Self IP BIG-IP'nin o VLAN'daki adresidir; olmadan bu VLAN'daki pool üyelerine erişilemez ve tüm monitor'lar down kalır. HA çiftinde ayrıca floating self IP tanımlanmazsa backend'in default gateway'i failover sonrası ölü cihazı gösterir.", label: 'Self IP Adresi', type: 'text', required: true, validate: 'ip', placeholder: '192.168.200.1', hint: 'BIG-IP\'nin bu VLAN\'daki IP adresi.' },
                        { name: 'self_prefix', why: "Maske yanlış verilirse BIG-IP backend subnet'ini yerel saymaz ve trafiği default route'a gönderir; bu da asimetrik yönlendirme ve zaman aşımı üretir.", label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0', hint: 'Alt ağ maskesi (CIDR\'a otomatik çevrilir).' },
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
            const intfs = intfsRaw.split(',').map(s => s.trim()).filter(Boolean);
            const cidr = self_prefix.split('.').reduce((acc, octet) => {
                let n = parseInt(octet, 10), bits = 0;
                while (n > 0) { bits += (n & 1); n >>= 1; }
                return acc + bits;
            }, 0);
            let c = '# ========================================\n# F5 BIG-IP LTM — VLAN + Self IP\n# ========================================\n\n';
            c += 'tmsh create net vlan ' + vlan_name + ' tag ' + vlan_tag + ' interfaces replace-all-with {';
            intfs.forEach(i => { c += ' ' + i + ' { }'; });
            c += ' }\n\n';
            c += 'tmsh create net self /Common/' + self_ip + '/' + cidr + ' vlan /Common/' + vlan_name + ' allow-service ' + allow_service + '\n\n';
            c += '# Not: Subnet mask ' + self_prefix + ' → /' + cidr + ' CIDR\'a dönüştürüldü\n\n';
            c += '# Doğrulama:\n# tmsh list net vlan ' + vlan_name + '\n# tmsh list net self\n';
            return c;
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
                        { name: 'learning_mode', why: "Otomatik öğrenme açıkken policy trafikten öğrenip kendini gevşetir; saldırı trafiği öğrenilirse koruma sessizce zayıflar. Manuel modda öneriler birikir ama kimse incelemezse policy uygulamanın güncel haliyle uyumsuz kalır.", label: 'Learning Mode', type: 'select', options: [
                            { value: 'manual', label: 'manual' },
                            { value: 'automatic', label: 'automatic' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'enforcement_mode', why: "Transparent modda hiçbir istek engellenmez, yalnızca log tutulur; güvenlik ekibi korunduğunu sanarak yanlış bir güven duyar. Blocking'e geçmeden önce yanlış pozitifler temizlenmelidir.", label: 'Enforcement Mode', type: 'select', options: [
                            { value: 'blocking', label: 'blocking' },
                            { value: 'transparent', label: 'transparent' }
                        ]},
                        { name: 'signature_sets', why: "<code>all</code> tüm imzaları uygular ve yanlış pozitif riskini ciddi şekilde artırır; uygulamanın gerçek teknolojisine uygun set seçmek hem performans hem doğruluk kazandırır. Yeni imzalar önce staging ile denenmelidir.", label: 'Signature Set\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: 'all', hint: 'Uygulanacak imza setleri; "all" tümünü seçer.' },
                        { name: 'violation_rating', why: "Violation rating eşiği düşük tutulursa meşru istekler engellenir; yüksek tutulursa gerçek saldırılar yalnızca loglanıp geçilir. Eşik uygulamanın olgunluğu arttıkça kademeli olarak sıkılaştırılmalıdır.", label: 'Violation Rating Eşiği', type: 'select', options: [
                            { value: '4', label: '4 (en yüksek)' },
                            { value: '3', label: '3' },
                            { value: '2', label: '2' },
                            { value: '1', label: '1' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            const { policy_name, learning_mode, enforcement_mode, signature_sets: sigSetsRaw, violation_rating } = data;
            const sigSets = sigSetsRaw.split(',').map(s => s.trim()).filter(Boolean);
            let c = '# ========================================\n# F5 BIG-IP ASM — Policy Tuning\n# ========================================\n\n';
            c += '# ASM (WAF) Policy Tuning:\n';
            c += 'tmsh modify asm policy ' + policy_name + ' learning-mode ' + learning_mode + ' enforcement-mode ' + enforcement_mode + '\n\n';
            if (sigSets.length > 0) {
                c += 'tmsh modify asm policy ' + policy_name + ' signature-sets replace-all-with {';
                sigSets.forEach(s => { c += ' "' + s + '" { alarm enabled block enabled }'; });
                c += ' }\n\n';
            }
            c += '# Violation rating eşiği: ' + violation_rating + '\n';
            c += '# Enable Attack Signatures:\n# tmsh modify asm policy ' + policy_name + ' attack-signatures-check enabled\n\n';
            c += '# Doğrulama:\n# tmsh list asm policy ' + policy_name + ' learning-mode enforcement-mode\n# tmsh show asm policy ' + policy_name + ' violations\n';
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
