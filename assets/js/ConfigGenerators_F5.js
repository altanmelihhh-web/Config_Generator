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
            c += '    options { dont-insert-empty-fragments no-ssl no-tlsv1 no-tlsv1.1 }\n}\n\n';
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
                        { name: 'hdr_name', why: "Header adı büyük/küçük harf duyarsızdır, ancak istemci bu başlığı hiç göndermezse koşul sessizce false döner ve trafik default pool'a gider. Güvenlik kararı istemci başlığına dayandırılıyorsa başlık dışarıdan sahte gönderilebileceği için önce temizlenmelidir.", label: 'Header Adı', type: 'text', requiredIf: { field: 'irule_type', in: ['pool_select'] }, placeholder: 'X-Tenant', hint: 'Eşleştirilecek HTTP header adı.' },
                        { name: 'hdr_val', why: "Değer karşılaştırması birebir yapılır; büyük/küçük harf veya boşluk farkı eşleşmeyi sessizce bozar. Beklenmeyen değerler için mutlaka bir varsayılan davranış tanımlanmalıdır.", label: 'Header Değeri', type: 'text', requiredIf: { field: 'irule_type', in: ['pool_select'] }, placeholder: 'tenant-a', hint: 'Eşleşme koşulu değeri.' },
                        { name: 'target_pool', why: "Hedef pool iRule çalıştığı anda mevcut değilse bağlantı düşer ve LTM log'una <code>no pool member available</code> yazılır. Pool seçimi iRule ile yapılsa bile VS'in default pool'u yedek olarak tanımlanmalıdır.", label: 'Hedef Pool', type: 'text', requiredIf: { field: 'irule_type', in: ['pool_select'] }, placeholder: 'POOL_TENANT_A', hint: 'Eşleşme durumunda trafiğin gönderileceği pool.' }
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
            c += 'tmsh create ltm profile server-ssl ' + profile_name;
            c += ' cert ' + cert;
            c += ' key ' + key;
            if (chain) c += ' chain ' + chain;
            c += ' ciphers "' + cipher_string + '"';
            c += ' peer-cert-mode ' + peer_cert_mode;
            if (ca_file) c += ' ca-file ' + ca_file;
            c += '\n\n';
            if (peer_cert_mode === 'ignore') c += '# UYARI: peer-cert-mode ignore — backend sertifikası doğrulanmaz, sahte backend\'e karşı koruma yok.\n\n';
            else if (!ca_file) c += '# UYARI: ' + peer_cert_mode + ' seçili ama CA dosyası yok — doğrulama için ca-file verin.\n\n';
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
                        { name: 'peer_pw', label: 'Karşı Cihaz Parolası', type: 'text', required: true, placeholder: 'Ornek-Parola', hint: 'Yalnız trust kurulumunda kullanılır, config\'e yazılmaz' }
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
            c += '# Doğrulama:\n# tmsh show cm sync-status\n# tmsh list cm trust-domain\n# tmsh list cm device-group ' + dg + '\n';
            return c;
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
