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
                        { name: 'vs_name', label: 'VS Adı', type: 'text', required: true, placeholder: 'VS_APP_HTTPS', hint: 'Virtual server için benzersiz bir isim girin.' },
                        { name: 'vip', label: 'VIP (Destination IP:Port)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.100:443', hint: 'Dinlenecek IP adresi ve port numarası.' },
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL_APP', hint: 'Trafiğin yönlendirileceği backend pool.' },
                        { name: 'vs_type', label: 'Protokol Tipi', type: 'select', options: [
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
                        { name: 'ssl_profile', label: 'SSL Client Profile', type: 'text', optional: true, placeholder: 'MY_CLIENT_SSL', hint: 'Yalnızca HTTPS türünde gereklidir.' },
                        { name: 'snat', label: 'SNAT', type: 'select', options: [
                            { value: 'automap', label: 'Automap' },
                            { value: 'none', label: 'None' }
                        ]},
                        { name: 'irule', label: 'iRule', type: 'text', optional: true, placeholder: 'IRULE_XFORWARD', hint: 'Opsiyonel iRule adı.' },
                        { name: 'persist', label: 'Persistence Profil', type: 'text', optional: true, placeholder: 'MY_COOKIE_PERSIST', hint: 'Oturum yapışkanlığı için persistence profili.' }
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
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'POOL_APP', hint: 'Havuz için benzersiz bir isim.' },
                        { name: 'lb_method', label: 'LB Yöntemi', type: 'select', options: [
                            { value: 'round-robin', label: 'Round Robin' },
                            { value: 'least-connections-member', label: 'Least Connections' },
                            { value: 'ratio-member', label: 'Ratio' }
                        ]},
                        { name: 'monitor', label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Üyelerin sağlığını kontrol eden monitor.' },
                        { name: 'min_active', label: 'Min Active Members', type: 'text', optional: true, placeholder: '1', hint: 'Minimum aktif üye sayısı; varsayılan 1.' }
                    ]
                },
                {
                    title: 'Pool Üyeleri',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'm1', label: 'Üye 1 (IP:Port)', type: 'text', required: true, placeholder: '10.1.2.10:8080' },
                        { name: 'm2', label: 'Üye 2 (IP:Port)', type: 'text', optional: true, placeholder: '10.1.2.11:8080' },
                        { name: 'm3', label: 'Üye 3 (IP:Port)', type: 'text', optional: true, placeholder: '10.1.2.12:8080' }
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
                        { name: 'mon_name', label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Monitor için benzersiz bir isim.' },
                        { name: 'mon_type', label: 'Tip', type: 'select', options: [
                            { value: 'http', label: 'HTTP' },
                            { value: 'https', label: 'HTTPS' },
                            { value: 'tcp', label: 'TCP' }
                        ]},
                        { name: 'interval', label: 'Interval (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Kontrol aralığı; varsayılan 5 saniye.' },
                        { name: 'timeout', label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '16', hint: 'Zaman aşımı; varsayılan 16 saniye.' }
                    ]
                },
                {
                    title: 'HTTP/HTTPS Kontrol',
                    icon: 'fas fa-code',
                    fields: [
                        { name: 'send', label: 'Send String', type: 'text', optional: true, placeholder: 'GET /health HTTP/1.1\\r\\nHost: app.corp.com\\r\\n\\r\\n', hint: 'HTTP/HTTPS için gönderilecek istek.' },
                        { name: 'recv', label: 'Receive String', type: 'text', optional: true, placeholder: '200 OK', hint: 'Beklenen yanıt içeriği.' }
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
                        { name: 'prof_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'MY_CLIENT_SSL', hint: 'SSL profili için benzersiz bir isim.' },
                        { name: 'cert_name', label: 'Sertifika Adı', type: 'text', required: true, placeholder: 'myapp.crt', hint: 'BIG-IP üzerinde yüklü sertifika dosyası.' },
                        { name: 'key_name', label: 'Key Adı', type: 'text', required: true, placeholder: 'myapp.key', hint: 'Sertifikaya ait özel anahtar dosyası.' },
                        { name: 'chain', label: 'Chain Sertifika', type: 'text', optional: true, placeholder: 'ca-bundle.crt', hint: 'Ara CA zinciri; opsiyonel.' }
                    ]
                },
                {
                    title: 'Şifreleme',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'ciphers', label: 'Cipher String', type: 'text', optional: true, placeholder: 'ECDHE+AES:!aNULL:!MD5:!RC4', hint: 'İzin verilen şifreleme algoritmaları.' }
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
                        { name: 'irule_name', label: 'iRule Adı', type: 'text', required: true, placeholder: 'IRULE_XFORWARD', hint: 'iRule için benzersiz bir isim.' },
                        { name: 'irule_type', label: 'iRule Tipi', type: 'select', options: [
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
                        { name: 'hdr_name', label: 'Header Adı', type: 'text', optional: true, placeholder: 'X-Tenant', hint: 'Eşleştirilecek HTTP header adı.' },
                        { name: 'hdr_val', label: 'Header Değeri', type: 'text', optional: true, placeholder: 'tenant-a', hint: 'Eşleşme koşulu değeri.' },
                        { name: 'target_pool', label: 'Hedef Pool', type: 'text', optional: true, placeholder: 'POOL_TENANT_A', hint: 'Eşleşme durumunda trafiğin gönderileceği pool.' }
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
                        { name: 'prof_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'MY_COOKIE_PERSIST', hint: 'Persistence profili için benzersiz bir isim.' },
                        { name: 'persist_type', label: 'Tip', type: 'select', options: [
                            { value: 'cookie', label: 'Cookie Insert' },
                            { value: 'source-addr', label: 'Source IP' }
                        ]},
                        { name: 'timeout', label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '300', hint: 'Oturum süresi; varsayılan 300 saniye.' }
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
                        { name: 'ha_role', label: 'Rol', type: 'select', options: [
                            { value: 'active', label: 'Active' },
                            { value: 'standby', label: 'Standby' }
                        ]}
                    ]
                },
                {
                    title: 'Ağ Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'sync_ip', label: 'Config Sync IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.3.1', hint: 'Konfigürasyon senkronizasyonu için IP adresi.' },
                        { name: 'fo_ip', label: 'Failover IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.3.1', hint: 'Unicast failover için IP adresi.' }
                    ]
                },
                {
                    title: 'Peer Cihaz',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'peer_host', label: 'Peer Hostname', type: 'text', required: true, placeholder: 'bigip-standby', hint: 'Yedek cihazın hostname\'i.' },
                        { name: 'peer_mgmt', label: 'Peer Management IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Yedek cihazın yönetim IP adresi.' },
                        { name: 'dg_name', label: 'Device Group Adı', type: 'text', required: true, placeholder: 'DG_FAILOVER', hint: 'Sync-Failover device group ismi.' }
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
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'WAF_APP1', hint: 'ASM policy için benzersiz bir isim.' },
                        { name: 'enforcement', label: 'Enforcement Modu', type: 'select', options: [
                            { value: 'blocking', label: 'Blocking' },
                            { value: 'transparent', label: 'Transparent' }
                        ]},
                        { name: 'template', label: 'Şablon', type: 'select', options: [
                            { value: 'POLICY_TEMPLATE_RAPID_DEPLOYMENT', label: 'Rapid Deployment' },
                            { value: 'POLICY_TEMPLATE_FUNDAMENTAL', label: 'Fundamental' },
                            { value: 'POLICY_TEMPLATE_COMPREHENSIVE', label: 'Comprehensive' }
                        ]},
                        { name: 'lang', label: 'Uygulama Dili', type: 'select', options: [
                            { value: 'utf-8', label: 'UTF-8' },
                            { value: 'auto-detect', label: 'Auto Detect' }
                        ]}
                    ]
                },
                {
                    title: 'Bağlantı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'vs_name', label: 'Bağlanacak Virtual Server', type: 'text', required: true, placeholder: 'VS_APP1_HTTPS', hint: 'Policy\'nin uygulanacağı virtual server.' }
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
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'AWAF_APP1', hint: 'AWAF policy için benzersiz bir isim.' },
                        { name: 'enforcement', label: 'Enforcement Modu', type: 'select', options: [
                            { value: 'blocking', label: 'Blocking' },
                            { value: 'transparent', label: 'Transparent (Learning)' }
                        ]},
                        { name: 'bot_defense', label: 'Bot Defense', type: 'select', options: [
                            { value: 'yes', label: 'Etkin' },
                            { value: 'no', label: 'Kapalı' }
                        ]},
                        { name: 'staging', label: 'Signature Staging', type: 'select', options: [
                            { value: 'no', label: 'Kapalı (Üretim)' },
                            { value: 'yes', label: 'Açık (Test)' }
                        ]}
                    ]
                },
                {
                    title: 'Bağlantı',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'vs_name', label: 'Bağlanacak Virtual Server', type: 'text', required: true, placeholder: 'VS_APP1_HTTPS', hint: 'Policy\'nin uygulanacağı virtual server.' }
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
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'ssl-server-re-encrypt', hint: 'Profil için benzersiz bir isim.' },
                        { name: 'cert', label: 'Sertifika Yolu', type: 'text', required: true, placeholder: '/Common/server.crt', hint: 'Tam sertifika yolu.' },
                        { name: 'key', label: 'Key Yolu', type: 'text', required: true, placeholder: '/Common/server.key', hint: 'Özel anahtar dosyasının tam yolu.' },
                        { name: 'chain', label: 'Chain Sertifika', type: 'text', optional: true, placeholder: '/Common/ca-bundle.crt', hint: 'Ara CA zinciri; opsiyonel.' },
                        { name: 'cipher_string', label: 'Cipher String', type: 'text', required: true, placeholder: 'DEFAULT:!SSLv3:!RC4', hint: 'İzin verilen şifreleme algoritmaları.' },
                        { name: 'peer_cert_mode', label: 'Peer Cert Mode', type: 'select', options: [
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
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'SNAT-POOL-OUTBOUND', hint: 'SNAT havuzu için benzersiz bir isim.' },
                        { name: 'members', label: 'Üyeler (virgülle ayrılmış IP listesi)', type: 'text', required: true, placeholder: '10.0.0.101,10.0.0.102,10.0.0.103', hint: 'Kaynak NAT adresi olarak kullanılacak IP\'ler.' },
                        { name: 'route_advertisement', label: 'Route Advertisement', type: 'select', options: [
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
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'http-custom', hint: 'HTTP profili için benzersiz bir isim.' },
                        { name: 'insert_xforwarded_for', label: 'Insert X-Forwarded-For', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'oneconnect', label: 'OneConnect Transformations', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'redirect_rewrite', label: 'Redirect Rewrite', type: 'select', options: [
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
                        { name: 'header_erase', label: 'Header Erase', type: 'text', optional: true, placeholder: 'Server', hint: 'Silinecek HTTP başlık adı; opsiyonel.' },
                        { name: 'header_insert', label: 'Header Insert', type: 'text', optional: true, placeholder: 'X-Via: bigip', hint: 'Eklenecek HTTP başlık adı ve değeri; opsiyonel.' }
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
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'tcp-wan-optimized', hint: 'TCP profili için benzersiz bir isim.' },
                        { name: 'parent_profile', label: 'Parent Profile', type: 'select', options: [
                            { value: 'tcp-wan-optimized', label: 'tcp-wan-optimized' },
                            { value: 'tcp-lan-optimized', label: 'tcp-lan-optimized' },
                            { value: 'tcp', label: 'tcp' }
                        ]},
                        { name: 'idle_timeout', label: 'Idle Timeout (sn)', type: 'text', required: true, placeholder: '300', hint: 'Boşta bağlantı zaman aşımı (saniye).' },
                        { name: 'nagle', label: 'Nagle', type: 'select', options: [
                            { value: 'enabled', label: 'enabled' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'congestion_control', label: 'Congestion Control', type: 'select', options: [
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
                        { name: 'rd_id', label: 'Route Domain ID', type: 'text', required: true, placeholder: '10', hint: 'Benzersiz sayısal Route Domain kimliği.' },
                        { name: 'rd_name', label: 'Route Domain Adı', type: 'text', required: true, placeholder: 'CUSTOMER-A', hint: 'İzolasyon alanının adı.' },
                        { name: 'parent_rd', label: 'Parent RD', type: 'text', optional: true, placeholder: '0', hint: 'Üst Route Domain ID\'si; genellikle 0.' },
                        { name: 'vlans', label: 'VLAN\'lar (virgülle ayrılmış)', type: 'text', optional: true, placeholder: 'vlan-customer-a', hint: 'Bu route domain\'e atanacak VLAN\'lar.' },
                        { name: 'strict_isolation', label: 'Strict Isolation', type: 'select', options: [
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
                        { name: 'vlan_name', label: 'VLAN Adı', type: 'text', required: true, placeholder: 'vlan-dmz', hint: 'VLAN için benzersiz bir isim.' },
                        { name: 'vlan_tag', label: 'VLAN Tag', type: 'text', validate: 'vlan', required: true, placeholder: '200', hint: 'IEEE 802.1Q VLAN kimliği.' },
                        { name: 'interfaces', label: 'Interface\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: '1.1,1.2', hint: 'VLAN\'a dahil edilecek fiziksel arayüzler.' }
                    ]
                },
                {
                    title: 'Self IP',
                    icon: 'fas fa-map-marker-alt',
                    fields: [
                        { name: 'self_ip', label: 'Self IP Adresi', type: 'text', required: true, validate: 'ip', placeholder: '192.168.200.1', hint: 'BIG-IP\'nin bu VLAN\'daki IP adresi.' },
                        { name: 'self_prefix', label: 'Subnet Mask', type: 'text', required: true, placeholder: '255.255.255.0', hint: 'Alt ağ maskesi (CIDR\'a otomatik çevrilir).' },
                        { name: 'allow_service', label: 'Allow Service', type: 'select', options: [
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
                        { name: 'trunk_name', label: 'Trunk Adı', type: 'text', required: true, placeholder: 'trunk-uplink', hint: 'Trunk için benzersiz bir isim.' },
                        { name: 'interfaces', label: 'Interface\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: '1.1,1.2', hint: 'Trunk\'a dahil edilecek fiziksel arayüzler.' },
                        { name: 'lacp_mode', label: 'LACP Mode', type: 'select', options: [
                            { value: 'active', label: 'active' },
                            { value: 'passive', label: 'passive' },
                            { value: 'off', label: 'off' }
                        ]},
                        { name: 'distribution_hash', label: 'Distribution Hash', type: 'select', options: [
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
                        { name: 'wide_ip_name', label: 'Wide IP (FQDN)', type: 'text', required: true, placeholder: 'app.example.com', hint: 'DNS sorgu hedefi olacak tam domain adı.' },
                        { name: 'pool_name', label: 'Pool Adı', type: 'text', required: true, placeholder: 'GSLB-POOL-APP', hint: 'GSLB havuzu için benzersiz bir isim.' }
                    ]
                },
                {
                    title: 'Pool Üyeleri',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'members', label: 'Üyeler (vsname:server, virgülle ayrılmış)', type: 'text', required: true, placeholder: 'vs1:bigip1.example.com,vs2:bigip2.example.com', hint: 'Her üye için virtual server adı ve BIG-IP sunucu adı.' },
                        { name: 'lb_mode', label: 'LB Modu', type: 'select', options: [
                            { value: 'round-robin', label: 'round-robin' },
                            { value: 'ratio', label: 'ratio' },
                            { value: 'least-connections', label: 'least-connections' },
                            { value: 'topology', label: 'topology' }
                        ]},
                        { name: 'monitor', label: 'Monitor', type: 'select', options: [
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
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POLICY-ROUTING', hint: 'Traffic policy için benzersiz bir isim.' },
                        { name: 'rule_name', label: 'Rule Adı', type: 'text', required: true, placeholder: 'RULE-API', hint: 'Policy içindeki kural adı.' }
                    ]
                },
                {
                    title: 'Match Koşulu',
                    icon: 'fas fa-filter',
                    fields: [
                        { name: 'match_type', label: 'Match Tipi', type: 'select', options: [
                            { value: 'http-uri', label: 'http-uri' },
                            { value: 'http-host', label: 'http-host' },
                            { value: 'http-method', label: 'http-method' }
                        ]},
                        { name: 'match_string', label: 'Match String', type: 'text', required: true, placeholder: '/api/', hint: 'Eşleştirilecek URI yolu veya host adı.' }
                    ]
                },
                {
                    title: 'Aksiyon',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'action_type', label: 'Aksiyon Tipi', type: 'select', options: [
                            { value: 'forward', label: 'forward' },
                            { value: 'redirect', label: 'redirect' },
                            { value: 'reset', label: 'reset' }
                        ]},
                        { name: 'forward_pool', label: 'Forward Pool', type: 'text', required: true, placeholder: 'pool-api-backend', hint: 'Trafiğin yönlendirileceği backend pool.' }
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
                        { name: 'profile_name', label: 'Profil Adı', type: 'text', required: true, placeholder: 'APM-VPN-PROFILE', hint: 'APM access profili için benzersiz isim.' },
                        { name: 'auth_type', label: 'Auth Tipi', type: 'select', options: [
                            { value: 'ldap', label: 'ldap' },
                            { value: 'radius', label: 'radius' },
                            { value: 'cert', label: 'cert' },
                            { value: 'saml', label: 'saml' }
                        ]},
                        { name: 'idle_timeout', label: 'Idle Timeout (sn)', type: 'text', required: true, placeholder: '1200', hint: 'Oturum boşta kalma süresi.' },
                        { name: 'max_session', label: 'Max Session Sayısı', type: 'text', required: true, placeholder: '1000', hint: 'Eş zamanlı maksimum oturum sayısı.' }
                    ]
                },
                {
                    title: 'LDAP Kimlik Doğrulama',
                    icon: 'fas fa-address-book',
                    fields: [
                        { name: 'ldap_server', label: 'LDAP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'LDAP/Active Directory sunucusunun IP adresi.' },
                        { name: 'ldap_base_dn', label: 'LDAP Base DN', type: 'text', required: true, placeholder: 'DC=company,DC=com', hint: 'Kullanıcı arama başlangıç noktası.' }
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
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'ASM-POLICY-APP', hint: 'Düzenlenecek ASM policy adı.' },
                        { name: 'learning_mode', label: 'Learning Mode', type: 'select', options: [
                            { value: 'manual', label: 'manual' },
                            { value: 'automatic', label: 'automatic' },
                            { value: 'disabled', label: 'disabled' }
                        ]},
                        { name: 'enforcement_mode', label: 'Enforcement Mode', type: 'select', options: [
                            { value: 'blocking', label: 'blocking' },
                            { value: 'transparent', label: 'transparent' }
                        ]},
                        { name: 'signature_sets', label: 'Signature Set\'ler (virgülle ayrılmış)', type: 'text', required: true, placeholder: 'all', hint: 'Uygulanacak imza setleri; "all" tümünü seçer.' },
                        { name: 'violation_rating', label: 'Violation Rating Eşiği', type: 'select', options: [
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
                        { name: 'app_name', label: 'Uygulama Adı', type: 'text', required: true, placeholder: 'APP-HTTP-SIMPLE', hint: 'iApp servis örneği adı.' },
                        { name: 'template_name', label: 'Template Adı', type: 'text', required: true, placeholder: '/Common/f5.http', hint: 'Kullanılacak iApp şablonunun tam yolu.' },
                        { name: 'variables', label: 'Variables (key:value, virgülle ayrılmış)', type: 'text', required: true, placeholder: 'pool__pool_to_use:pool-backend,pool__monitor:http', hint: 'Şablon parametreleri; her biri key:value formatında.' }
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
