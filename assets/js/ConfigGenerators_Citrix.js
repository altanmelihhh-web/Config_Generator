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
                        { name: 'vs_name', label: 'VS Adı', type: 'text', required: true, placeholder: 'VS_APP_HTTPS', hint: 'Büyük harf + alt çizgi önerilen konvansiyon', tooltip: 'add lb vserver <VS_ADI>' },
                        { name: 'proto', type: 'hidden', value: 'SSL' },
                        { name: 'vip', label: 'VIP (Virtual IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.100', hint: 'Clients bu IP\'ye bağlanır' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '443', hint: 'SSL için 443, HTTP için 80' },
                        { name: 'lb_method', label: 'LB Yöntemi', type: 'select', options: [
                            { value: 'LEASTCONNECTION', label: 'Least Connection', selected: true },
                            { value: 'ROUNDROBIN', label: 'Round Robin' }
                        ]},
                        { name: 'persist', label: 'Persistence', type: 'select', options: [
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
                        { name: 'sg_name', label: 'ServiceGroup Adı', type: 'text', required: true, placeholder: 'SG_APP_HTTP', hint: 'Backend sunucuları içeren grup' },
                        { name: 's1', label: 'Sunucu 1 IP', type: 'text', required: true, placeholder: '10.1.2.10' },
                        { name: 's1p', label: 'Sunucu 1 Port', type: 'text', required: true, placeholder: '8080' },
                        { name: 's2', label: 'Sunucu 2 IP', type: 'text', optional: true, placeholder: '10.1.2.11' },
                        { name: 's2p', label: 'Sunucu 2 Port', type: 'text', optional: true, placeholder: '8080' }
                    ]
                },
                {
                    title: 'SSL Sertifikası',
                    icon: 'fas fa-certificate',
                    showFor: ['ssl'],
                    info: 'SSL protokolü seçildiğinde sertifika bağlaması gerekir. TLS 1.2/1.3 zorunlu, SSL3/TLS1.0/1.1 devre dışı bırakılır.',
                    fields: [
                        { name: 'cert_key', label: 'SSL CertKey Adı', type: 'text', optional: true, placeholder: 'MY_CERTKEY', hint: 'add ssl certKey komutuyla önceden tanımlanmış olmalı' }
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
                        { name: 'mon_name', label: 'Monitor Adı', type: 'text', required: true, placeholder: 'MON_HTTP_APP', hint: 'Büyük harf + alt çizgi konvansiyonu önerilir' },
                        { name: 'mon_type', label: 'Tip', type: 'select', options: [
                            { value: 'HTTP-ECV', label: 'HTTP-ECV', selected: true },
                            { value: 'HTTPS-ECV', label: 'HTTPS-ECV' },
                            { value: 'TCP', label: 'TCP' }
                        ]},
                        { name: 'send', label: 'Send String', type: 'text', optional: true, placeholder: 'GET /health HTTP/1.0\\r\\n\\r\\n', hint: 'Sunucuya gönderilecek HTTP isteği' },
                        { name: 'recv', label: 'Receive String', type: 'text', optional: true, placeholder: '200 OK', hint: 'Beklenen yanıt metni' },
                        { name: 'interval', label: 'Interval (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Kontrol aralığı saniye cinsinden' },
                        { name: 'resp_timeout', label: 'Response Timeout (sn)', type: 'text', optional: true, placeholder: '2', hint: 'Yanıt bekleme süresi' }
                    ]
                },
                {
                    title: 'ServiceGroup Bağlama',
                    icon: 'fas fa-link',
                    fields: [
                        { name: 'sg_name', label: 'ServiceGroup Adı', type: 'text', optional: true, placeholder: 'SG_APP_HTTP', hint: 'Monitörü bu ServiceGroup\'a bağla' }
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
                        { name: 'ha_role', label: 'Rol', type: 'select', options: [
                            { value: 'primary', label: 'Primary (aktif)', selected: true },
                            { value: 'secondary', label: 'Secondary (pasif)' }
                        ], hint: 'Bu node\'un HA rolü' },
                        { name: 'node_id', label: 'Node ID', type: 'text', required: true, placeholder: '1', hint: 'Primary için 1, Secondary için 2 kullanılır' },
                        { name: 'peer_ip', label: 'Peer Management IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Karşı node\'un yönetim IP adresi' }
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
                        { name: 'cs_name', label: 'CS vServer Adı', type: 'text', required: true, placeholder: 'CS_APP', hint: 'Content Switching sanal sunucu adı' },
                        { name: 'vip', label: 'VIP (Virtual IP)', type: 'text', validate: 'ip', required: true, placeholder: '10.1.1.200', hint: 'Clients bu IP\'ye bağlanır' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '80' }
                    ]
                },
                {
                    title: 'CS Policy & Yönlendirme',
                    icon: 'fas fa-directions',
                    fields: [
                        { name: 'cs_policy', label: 'CS Policy Adı', type: 'text', required: true, placeholder: 'CS_POL_API', hint: 'URL eşleşme kuralı adı' },
                        { name: 'url_prefix', label: 'URL Prefix', type: 'text', required: true, placeholder: '/api/', hint: 'Bu prefix ile başlayan istekler hedef vserver\'a gider' },
                        { name: 'target_vs', label: 'Hedef LB vServer', type: 'text', required: true, placeholder: 'VS_API_BACKEND', hint: 'Eşleşen trafiğin yönleneceği LB vServer' },
                        { name: 'default_vs', label: 'Default LB vServer', type: 'text', required: true, placeholder: 'VS_WEB_DEFAULT', hint: 'Eşleşmeyen trafik için fallback vServer' }
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
                        { name: 'pol_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'RESP_HTTP_REDIRECT', hint: 'Büyük harf + alt çizgi konvansiyonu' },
                        { name: 'action_type', type: 'hidden', value: 'redirect' },
                        { name: 'match_expr', label: 'Match Expression', type: 'text', required: true, placeholder: 'HTTP.REQ.URL.STARTSWITH("/old/")', hint: 'NetScaler Policy Expression — CTRL+Space ile öneri alabilirsiniz' },
                        { name: 'bind_vs', label: 'Bağlanacak LB vServer', type: 'text', optional: true, placeholder: 'VS_APP_HTTPS', hint: 'Boş bırakılırsa manuel bind gerekir' }
                    ]
                },
                {
                    title: 'Redirect Ayarları',
                    icon: 'fas fa-external-link-alt',
                    showFor: ['redirect'],
                    fields: [
                        { name: 'redirect_url', label: 'Redirect URL', type: 'text', optional: true, placeholder: 'https://www.example.com', hint: 'HTTP 301 ile yönlendirilecek hedef URL' }
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
                        { name: 'local_site', label: 'Local Site Adı', type: 'text', required: true, placeholder: 'SITE_ISTANBUL', hint: 'Bu ADC\'nin bulunduğu datacenter adı' },
                        { name: 'local_ip', label: 'Local Site IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.0.1', hint: 'Local site yönetim IP\'si' }
                    ]
                },
                {
                    title: 'Remote Site',
                    icon: 'fas fa-map-pin',
                    fields: [
                        { name: 'remote_site', label: 'Remote Site Adı', type: 'text', required: true, placeholder: 'SITE_ANKARA', hint: 'Uzak datacenter adı' },
                        { name: 'remote_ip', label: 'Remote Site IP', type: 'text', validate: 'ip', required: true, placeholder: '10.2.0.1', hint: 'Uzak site yönetim IP\'si' }
                    ]
                },
                {
                    title: 'GSLB vServer & DNS',
                    icon: 'fas fa-dns',
                    fields: [
                        { name: 'gslb_vs', label: 'GSLB vServer Adı', type: 'text', required: true, placeholder: 'GSLB_APP_HTTP', hint: 'GSLB sanal sunucu adı' },
                        { name: 'proto', label: 'Protokol', type: 'select', options: [
                            { value: 'HTTP', label: 'HTTP', selected: true },
                            { value: 'SSL', label: 'SSL' },
                            { value: 'TCP', label: 'TCP' }
                        ]},
                        { name: 'dns_zone', label: 'DNS Zone (FQDN)', type: 'text', required: true, placeholder: 'app.example.com', hint: 'GSLB\'nin yetkili olacağı DNS domain' },
                        { name: 'lb_method', label: 'LB Yöntemi', type: 'select', options: [
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
                        { name: 'local_svc_ip', label: 'Local Service IP', type: 'text', validate: 'ip', required: true, placeholder: '10.1.0.100', hint: 'Local sitedeki uygulama VIP\'i' },
                        { name: 'remote_svc_ip', label: 'Remote Service IP', type: 'text', validate: 'ip', required: true, placeholder: '10.2.0.100', hint: 'Uzak sitedeki uygulama VIP\'i' },
                        { name: 'svc_port', label: 'Service Port', type: 'text', validate: 'port', required: true, placeholder: '80' }
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
                        { name: 'vs_name', label: 'VS Adı', type: 'text', required: true, placeholder: 'vs-app-ssl', hint: 'SSL vServer adı' },
                        { name: 'ip', label: 'VIP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Virtual IP adresi' },
                        { name: 'port', label: 'Port', type: 'text', validate: 'port', required: true, placeholder: '443' }
                    ]
                },
                {
                    title: 'SSL Parametreleri',
                    icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'cert_name', label: 'Cert Key Adı', type: 'text', required: true, placeholder: 'app-cert', hint: 'add ssl certKey ile tanımlanmış sertifika adı' },
                        { name: 'cipher_group', label: 'Cipher Group', type: 'select', options: [
                            { value: 'DEFAULT', label: 'DEFAULT', selected: true },
                            { value: 'HIGH', label: 'HIGH' },
                            { value: 'FIPS', label: 'FIPS' }
                        ]},
                        { name: 'sni', label: 'SNI', type: 'select', options: [
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
                        { name: 'action_name', label: 'Action Adı', type: 'text', required: true, placeholder: 'ACT-INSERT-HEADER', hint: 'Büyük harf + tire konvansiyonu önerilir' },
                        { name: 'action_type', label: 'Action Tipi', type: 'select', options: [
                            { value: 'INSERT_HTTP_HEADER', label: 'INSERT_HTTP_HEADER', selected: true },
                            { value: 'DELETE_HTTP_HEADER', label: 'DELETE_HTTP_HEADER' },
                            { value: 'REPLACE', label: 'REPLACE' }
                        ]},
                        { name: 'target', label: 'Hedef (Header Adı / Path)', type: 'text', required: true, placeholder: 'X-Forwarded-Proto', hint: 'Header adı veya değiştirilen yol' },
                        { name: 'expression', label: 'Expression (değer)', type: 'text', required: true, placeholder: '"https"', hint: 'NetScaler PI expression — string için çift tırnak kullanın' }
                    ]
                },
                {
                    title: 'Rewrite Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-REWRITE-HTTPS' },
                        { name: 'bind_point', label: 'Bind Point', type: 'select', options: [
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
                        { name: 'identifier_name', label: 'Identifier Adı', type: 'text', required: true, placeholder: 'RL-PER-CLIENT', hint: 'Rate limit kuralı adı' },
                        { name: 'rate', label: 'Rate (istek sayısı)', type: 'text', required: true, placeholder: '100', hint: 'Zaman dilimindeki maksimum istek sayısı' },
                        { name: 'per_seconds', label: 'Süre (saniye)', type: 'text', required: true, placeholder: '60', hint: 'Ölçüm penceresi (saniye) — milisaniyeye çevrilir' },
                        { name: 'mode', label: 'Mode', type: 'select', options: [
                            { value: 'CONNECTION', label: 'CONNECTION', selected: true },
                            { value: 'REQUEST_RATE', label: 'REQUEST_RATE' },
                            { value: 'NONE', label: 'NONE' }
                        ]},
                        { name: 'action', label: 'Limit Aşıldığında Aksiyon', type: 'select', options: [
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
                        { name: 'vserver_name', label: 'vServer Adı', type: 'text', required: true, placeholder: 'vs-aaa', hint: 'Authentication virtual server adı' },
                        { name: 'ip', label: 'IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.200', hint: 'Authentication vServer VIP' },
                        { name: 'auth_type', label: 'Auth Tipi', type: 'select', options: [
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
                        { name: 'ldap_server', label: 'LDAP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10', hint: 'Active Directory / LDAP sunucu adresi' },
                        { name: 'ldap_base', label: 'LDAP Base DN', type: 'text', required: true, placeholder: 'DC=company,DC=com', hint: 'Dizin aramasının başlayacağı DN' },
                        { name: 'domain', label: 'Domain', type: 'text', required: true, placeholder: 'company.com', hint: 'Kimlik doğrulaması yapılacak domain' },
                        { name: 'session_timeout', label: 'Session Timeout (sn)', type: 'text', optional: true, placeholder: '3600', hint: 'Oturum geçerlilik süresi saniye cinsinden' }
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
                        { name: 'content_group', label: 'Content Group Adı', type: 'text', required: true, placeholder: 'CG-IMAGES', hint: 'Önbellek grubu adı' },
                        { name: 'expires_secs', label: 'Cache Süresi (sn)', type: 'text', required: true, placeholder: '3600', hint: 'İçerik önbellekte ne kadar tutulsun (saniye)' },
                        { name: 'query_string', label: 'Query String', type: 'select', options: [
                            { value: 'IGNORE', label: 'IGNORE — sorgu string\'i yok say', selected: true },
                            { value: 'USE', label: 'USE — sorgu string\'i cache key\'e ekle' }
                        ], hint: 'URL query parametreleri cache key hesabına katılsın mı' }
                    ]
                },
                {
                    title: 'Cache Policy',
                    icon: 'fas fa-file-alt',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-CACHE-IMAGES' },
                        { name: 'expression', label: 'Expression', type: 'text', required: true, placeholder: 'HTTP.REQ.URL.SUFFIX.EQ("jpg")||HTTP.REQ.URL.SUFFIX.EQ("png")', hint: 'Hangi isteklerin önbellekleneceğini belirleyen expression' }
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
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'POL-COMPRESS-HTML', hint: 'Sıkıştırma politikası adı' },
                        { name: 'expression', label: 'Expression', type: 'text', required: true, placeholder: 'HTTP.RES.HEADER("Content-Type").CONTAINS("text")', hint: 'Hangi yanıtların sıkıştırılacağını belirleyen expression' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
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
                        { name: 'profile_name', label: 'Profile Adı', type: 'text', required: true, placeholder: 'WAF-PROFILE-APP', hint: 'WAF profili adı' },
                        { name: 'profile_type', label: 'Profile Tipi', type: 'select', options: [
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
                        { name: 'sql_injection', label: 'SQL Injection', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]},
                        { name: 'xss_check', label: 'XSS Check', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]},
                        { name: 'csrf_protection', label: 'CSRF Protection', type: 'select', options: [
                            { value: 'ON', label: 'ON — Aktif', selected: true },
                            { value: 'OFF', label: 'OFF — Kapalı' }
                        ]}
                    ]
                },
                {
                    title: 'AppFirewall Policy',
                    icon: 'fas fa-file-contract',
                    fields: [
                        { name: 'policy_name', label: 'Policy Adı', type: 'text', required: true, placeholder: 'WAF-POLICY-APP' },
                        { name: 'bind_vs', label: 'Bağlanacak LB vServer', type: 'text', optional: true, placeholder: 'vs-app-https', hint: 'Boş bırakılırsa manuel bind gerekir' }
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
                        { name: 'certkey_name', label: 'CertKey Adı', type: 'text', required: true, placeholder: 'app-certkey', hint: 'Sertifika tanımlayıcı adı — vServer bind için kullanılır' },
                        { name: 'cert_file', label: 'Sertifika Dosya Yolu', type: 'text', required: true, placeholder: '/nsconfig/ssl/app.crt', hint: 'ADC filesystem üzerindeki .crt dosyası' },
                        { name: 'key_file', label: 'Key Dosya Yolu', type: 'text', required: true, placeholder: '/nsconfig/ssl/app.key', hint: 'ADC filesystem üzerindeki .key dosyası' }
                    ]
                },
                {
                    title: 'vServer Bağlama',
                    icon: 'fas fa-link',
                    info: 'Opsiyonel: sertifikayı mevcut bir SSL vServer\'a bağla. SNI domain belirtilirse multi-domain SSL aktif olur.',
                    fields: [
                        { name: 'vs_name', label: 'LB vServer Adı', type: 'text', optional: true, placeholder: 'vs-app-ssl', hint: 'Sertifikanın bağlanacağı SSL vServer' },
                        { name: 'sni_domain', label: 'SNI Domain', type: 'text', optional: true, placeholder: 'app.example.com', hint: 'Multi-domain SSL için SNI domain adı' }
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
                        { name: 'snip_ip', label: 'SNIP IP Adresi', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Backend trafiği için kaynak IP' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', required: true, placeholder: '255.255.255.0' },
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', optional: true, placeholder: '100', hint: 'Bu SNIP\'i belirli bir VLAN\'a bağla' },
                        { name: 'mgmt', label: 'Mgmt Access', type: 'select', options: [
                            { value: 'DISABLED', label: 'DISABLED', selected: true },
                            { value: 'ENABLED', label: 'ENABLED' }
                        ], hint: 'Bu IP üzerinden yönetim erişimi' },
                        { name: 'dynamic_routing', label: 'Dynamic Routing', type: 'select', options: [
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
                        { name: 'vlan_id', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '200', hint: '1-4094 arası VLAN numarası' },
                        { name: 'interfaces', label: 'Interface\'ler', type: 'text', required: true, placeholder: '1/1,1/2', hint: 'Virgülle ayrılmış interface listesi (örn: 1/1,1/2)' },
                        { name: 'tagged', label: 'Etiketleme', type: 'select', options: [
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
                        { name: 'ip', label: 'IP Adresi', type: 'text', validate: 'ip', optional: true, placeholder: '192.168.200.1' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', optional: true, placeholder: '255.255.255.0' }
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
                        { name: 'acl_name', label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL-BLOCK-EXTERNAL', hint: 'Büyük harf + tire konvansiyonu önerilir' },
                        { name: 'priority', label: 'Priority', type: 'text', required: true, placeholder: '100', hint: 'Düşük sayı = yüksek öncelik' },
                        { name: 'action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'DENY', label: 'DENY — Engelle', selected: true },
                            { value: 'ALLOW', label: 'ALLOW — İzin ver' }
                        ]}
                    ]
                },
                {
                    title: 'Kaynak',
                    icon: 'fas fa-arrow-right',
                    fields: [
                        { name: 'src_ip', label: 'Kaynak IP', type: 'text', validate: 'ip', required: true, placeholder: '0.0.0.0', hint: 'Eşleşecek kaynak IP (0.0.0.0 = tümü)' },
                        { name: 'src_mask', label: 'Kaynak Mask', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Wildcard mask formatı' }
                    ]
                },
                {
                    title: 'Hedef',
                    icon: 'fas fa-crosshairs',
                    info: 'Hedef IP ve port bilgileri opsiyoneldir. Boş bırakılırsa tüm hedeflere uygulanır.',
                    fields: [
                        { name: 'dst_ip', label: 'Hedef IP', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.0' },
                        { name: 'dst_mask', label: 'Hedef Mask', type: 'text', optional: true, placeholder: '255.255.0.0' },
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'TCP', label: 'TCP', selected: true },
                            { value: 'UDP', label: 'UDP' },
                            { value: 'ANY', label: 'ANY' }
                        ]},
                        { name: 'dst_port', label: 'Hedef Port', type: 'text', validate: 'port', optional: true, placeholder: '80', hint: 'Boş bırakılırsa tüm portlar' }
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
