'use strict';

const CiscoNXOS = {};

// ── NX-OS: IPv4 / IPv6 Prefix-List ──────────────────────────────────────────
// Kaynak oracle: cisco.nxos.nxos_prefix_lists argspec ve koleksiyonun
// tests/integration/targets/nxos_prefix_lists fixture'ları.
CiscoNXOS.prefixList = {
    label: 'IPv4/IPv6 Prefix-List',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-list-ol',
                title: 'IPv4 / IPv6 Prefix-List (NX-OS)',
                desc: 'NX-OS prefix-list; route-map ve yönlendirme politikalarında IPv4/IPv6 prefix eşleştirmesi. <code>ge</code>/<code>le</code> değerleri temel prefix uzunluğundan küçük olamaz.'
            },
            configTypes: [
                { id: 'ipv4', label: 'IPv4', icon: 'fas fa-network-wired', desc: 'ip prefix-list', badge: { text: 'Yaygın', cls: 'recommended' } },
                { id: 'ipv6', label: 'IPv6', icon: 'fas fa-project-diagram', desc: 'ipv6 prefix-list' }
            ],
            sections: [
                {
                    title: 'Liste ve Kural', icon: 'fas fa-filter',
                    fields: [
                        { name: 'pl_name', label: 'Prefix-List Adı', type: 'text', validate: 'objname', required: true, placeholder: 'ALLOW-PREFIX' },
                        { name: 'pl_desc', label: 'Açıklama', type: 'text', placeholder: 'İzin verilen ağlar' },
                        { name: 'pl_seq', label: 'Sequence', type: 'text', validate: 'posint', required: true, placeholder: '10' },
                        { name: 'pl_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'pl_v4', label: 'IPv4 Prefix', type: 'text', validate: 'cidr', requiredIf: { field: '_cgtype', in: ['ipv4'] }, showFor: ['ipv4'], placeholder: '192.0.2.0/24' },
                        { name: 'pl_v6', label: 'IPv6 Prefix', type: 'text', validate: 'ipv6_cidr', requiredIf: { field: '_cgtype', in: ['ipv6'] }, showFor: ['ipv6'], placeholder: '2001:db8::/32' },
                        { name: 'pl_eq', label: 'Tam Prefix Uzunluğu (eq)', type: 'text', min: 0, max: 128, placeholder: '24', hint: 'Boşsa ge/le kullanılabilir' },
                        { name: 'pl_ge', label: 'En Az Prefix (ge)', type: 'text', min: 0, max: 128, placeholder: '25' },
                        { name: 'pl_le', label: 'En Çok Prefix (le)', type: 'text', min: 0, max: 128, placeholder: '32' }
                    ]
                }
            ],
            submit: 'Prefix-List Oluştur'
        }, (data) => {
            const afi = data._cgtype === 'ipv6' ? 'ipv6' : 'ipv4';
            const prefix = String(afi === 'ipv6' ? data.pl_v6 || '' : data.pl_v4 || '').trim();
            const base = Number(prefix.split('/')[1]);
            const limit = afi === 'ipv6' ? 128 : 32;
            const eq = String(data.pl_eq || '').trim(), ge = String(data.pl_ge || '').trim(), le = String(data.pl_le || '').trim();
            const warnings = [];
            if (eq && (ge || le)) warnings.push('eq ile ge/le aynı kuralda birlikte kullanılamaz.');
            if (eq && (+eq < base || +eq > limit)) warnings.push(`eq ${base}-${limit} aralığında olmalı.`);
            if (ge && (+ge < base || +ge > limit)) warnings.push(`ge ${base}-${limit} aralığında olmalı.`);
            if (le && (+le < base || +le > limit)) warnings.push(`le ${base}-${limit} aralığında olmalı.`);
            if (ge && le && +ge > +le) warnings.push('ge değeri le değerinden büyük olamaz.');
            let c = cgNxHdr('IPv4 / IPv6 Prefix-List');
            if (warnings.length) return { config: c + '! Geçersiz prefix-list kuralı; çıktı üretilmedi.\n', warnings };
            const cmd = afi === 'ipv6' ? 'ipv6 prefix-list ' : 'ip prefix-list ';
            const name = cgEsc(data.pl_name || ''), seq = cgEsc(data.pl_seq || ''), action = cgEsc(data.pl_action || 'permit');
            if (data.pl_desc) c += cmd + name + ' description ' + cgEsc(data.pl_desc) + '\n';
            c += cmd + name + ' seq ' + seq + ' ' + action + ' ' + cgEsc(prefix);
            if (eq) c += ' eq ' + cgEsc(eq);
            else {
                if (ge) c += ' ge ' + cgEsc(ge);
                if (le) c += ' le ' + cgEsc(le);
            }
            c += '\n\n! Doğrulama:\n! show ' + (afi === 'ipv6' ? 'ipv6' : 'ip') + ' prefix-list ' + name + '\n';
            return c;
        });
    }
};

// ── NX-OS: BFD Global / Interface ───────────────────────────────────────────
// Kaynaklar: cisco.nxos nxos_bfd_global + nxos_bfd_interfaces fixture'ları;
// Cisco Nexus 9000 NX-OS Interfaces Configuration Guide 10.6(x).
CiscoNXOS.bfd = {
    label: 'BFD Global / Interface',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-heartbeat',
                title: 'BFD Global / Interface (NX-OS)',
                desc: 'NX-OS BFD zamanlayıcılarını global veya arayüz düzeyinde üretir. Nexus 3000/5000/6000/7000 ve eski sürümlerde varsayılanlar/destek farklı olabilir; hedef model ve sürümü ayrıca doğrulayın.'
            },
            configTypes: [
                { id: 'global', label: 'Global BFD', icon: 'fas fa-globe', desc: 'Tüm BFD oturumlarının varsayılanları', badge: { text: 'Genel', cls: 'recommended' } },
                { id: 'interface', label: 'Arayüz BFD', icon: 'fas fa-ethernet', desc: 'Arayüz bazında BFD ve echo' }
            ],
            sections: [
                {
                    title: 'Zamanlayıcılar', icon: 'fas fa-stopwatch',
                    fields: [
                        { name: 'bfd_tx', label: 'Minimum TX (ms)', type: 'text', min: 50, max: 999, required: true, value: '50', hint: 'N9K: 50-999 ms; bazı N3K modellerinde varsayılan 250 ms' },
                        { name: 'bfd_rx', label: 'Minimum RX (ms)', type: 'text', min: 50, max: 999, required: true, value: '50' },
                        { name: 'bfd_mult', label: 'Detect Multiplier', type: 'text', min: 1, max: 50, required: true, value: '3' },
                        { name: 'bfd_slow', label: 'Slow Timer (ms)', type: 'text', min: 1000, max: 30000, showFor: ['global'], value: '2000', hint: 'Global mod; 1000-30000 ms' }
                    ]
                },
                {
                    title: 'Global Echo', icon: 'fas fa-reply', showFor: ['global'],
                    fields: [
                        { name: 'bfd_echo_if', label: 'Echo Loopback', type: 'text', validate: 'iface', placeholder: 'loopback1', hint: 'Boş = echo-interface yazılmaz; bazı Nexus ailelerinde desteklenmez' }
                    ]
                },
                {
                    title: 'Arayüzler', icon: 'fas fa-network-wired', showFor: ['interface'],
                    fields: [
                        { name: 'bfd_ifaces', label: 'Arayüz(ler)', type: 'text', validate: 'iface_range', requiredIf: { field: '_cgtype', in: ['interface'] }, placeholder: 'Ethernet1/1,Ethernet1/2' },
                        { name: 'bfd_enable', label: 'BFD etkinleştir', type: 'checkbox', checked: true },
                        { name: 'bfd_echo', label: 'BFD echo etkinleştir', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'BFD Konfigürasyonu Oluştur'
        }, (data) => {
            const type = data._cgtype === 'interface' ? 'interface' : 'global';
            const tx = cgEsc(data.bfd_tx || '50'), rx = cgEsc(data.bfd_rx || '50'), mult = cgEsc(data.bfd_mult || '3');
            let c = cgNxHdr('BFD Global / Interface') + 'feature bfd\n\n';
            if (type === 'global') {
                c += 'bfd interval ' + tx + ' min_rx ' + rx + ' multiplier ' + mult + '\n';
                if (data.bfd_slow) c += 'bfd slow-timer ' + cgEsc(data.bfd_slow) + '\n';
                // Koleksiyondaki komut sıralamasıyla uyumlu olarak echo-interface en son yazılır.
                if (data.bfd_echo_if) c += 'bfd echo-interface ' + cgEsc(data.bfd_echo_if) + '\n';
            } else {
                cgNxList(data.bfd_ifaces || '').forEach(iface => {
                    c += 'interface ' + cgEsc(iface) + '\n';
                    c += data.bfd_enable ? '  bfd\n' : '  no bfd\n';
                    c += data.bfd_echo ? '  bfd echo\n' : '  no bfd echo\n';
                    c += '  bfd interval ' + tx + ' min_rx ' + rx + ' multiplier ' + mult + '\n';
                });
            }
            c += '\n! Doğrulama:\n! show running-config bfd\n! show bfd neighbors details\n';
            return c;
        });
    }
};

// ── NX-OS: OSPFv3 ───────────────────────────────────────────────────────────
// Kaynaklar: cisco.nxos nxos_ospfv3 + nxos_ospf_interfaces argspec/fixture;
// Cisco Nexus 9000 NX-OS OSPFv3 Configuration Guide 10.5(x).
CiscoNXOS.ospfv3 = {
    label: 'OSPFv3',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPFv3 (NX-OS)',
                desc: 'IPv6 unicast OSPFv3 instance ve interface katılımı. NX-OS OSPFv3 interface üzerinde geçerli bir IPv6 adresi olmadan etkinleşmez.'
            },
            sections: [
                {
                    title: 'Instance', icon: 'fas fa-cog',
                    fields: [
                        { name: 'o3_tag', label: 'Instance Tag', type: 'text', validate: 'nxos_process_tag', required: true, placeholder: '201', hint: '1-63 case-sensitive alfanümerik karakter' },
                        { name: 'o3_rid', label: 'Router ID', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.1', hint: 'Sistemde yapılandırılmış sabit bir IPv4 adresi' },
                        { name: 'o3_area', label: 'Area', type: 'text', validate: 'ospf_area', required: true, placeholder: '0.0.0.0' },
                        { name: 'o3_area_type', label: 'Area Türü', type: 'select', options: [
                            { value: 'normal', label: 'Normal', selected: true },
                            { value: 'stub', label: 'Stub' },
                            { value: 'nssa', label: 'NSSA' }
                        ]},
                        { name: 'o3_no_summary', label: 'no-summary', type: 'checkbox', hint: 'Yalnız Stub/NSSA alanında uygulanır' },
                        { name: 'o3_log_detail', label: 'Komşuluk değişikliklerini ayrıntılı logla', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'IPv6 Address Family', icon: 'fas fa-route',
                    fields: [
                        { name: 'o3_distance', label: 'Administrative Distance', type: 'text', min: 1, max: 255, placeholder: '110', hint: 'Boş = varsayılan 110' },
                        { name: 'o3_max_paths', label: 'Maximum Paths', type: 'text', validate: 'posint', placeholder: '4', hint: 'Desteklenen üst sınır platform/sürüme bağlıdır' },
                        { name: 'o3_range', label: 'Area Summary Prefix', type: 'text', validate: 'ipv6_cidr', placeholder: '2001:db8::/32', hint: 'Boş = area range üretilmez' },
                        { name: 'o3_range_cost', label: 'Summary Cost', type: 'text', min: 0, max: 16777215, placeholder: '100', hint: 'Yalnız summary prefix verilirse' },
                        { name: 'o3_not_adv', label: 'Summary’yi advertise etme', type: 'checkbox' }
                    ]
                },
                {
                    title: 'Interface', icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'o3_iface', label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet1/2' },
                        { name: 'o3_ipv6', label: 'IPv6 / Prefix', type: 'text', validate: 'ipv6_cidr', required: true, placeholder: '2001:db8:10::1/64' },
                        { name: 'o3_network', label: 'Network Type', type: 'select', options: [
                            { value: '', label: 'Varsayılan', selected: true },
                            { value: 'broadcast', label: 'broadcast' },
                            { value: 'point-to-point', label: 'point-to-point' }
                        ]},
                        { name: 'o3_cost', label: 'Cost', type: 'text', min: 1, max: 65535, placeholder: '25' },
                        { name: 'o3_hello', label: 'Hello Interval (sn)', type: 'text', min: 1, max: 65535, placeholder: '10' },
                        { name: 'o3_dead', label: 'Dead Interval (sn)', type: 'text', min: 1, max: 65535, placeholder: '40' },
                        { name: 'o3_instance', label: 'Link-local Instance ID', type: 'text', min: 0, max: 255, placeholder: '0' },
                        { name: 'o3_priority', label: 'DR Priority', type: 'text', min: 0, max: 255, placeholder: '1' },
                        { name: 'o3_passive', label: 'Passive Interface', type: 'checkbox' },
                        { name: 'o3_mtu_ignore', label: 'MTU uyuşmazlığını yok say', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'OSPFv3 Konfigürasyonu Oluştur'
        }, (data) => {
            const tag = cgEsc(data.o3_tag || ''), area = cgEsc(data.o3_area || ''), iface = cgEsc(data.o3_iface || '');
            let c = cgNxHdr('OSPFv3') + 'feature ospfv3\n\n';
            c += 'router ospfv3 ' + tag + '\n';
            c += '  router-id ' + cgEsc(data.o3_rid || '') + '\n';
            if (data.o3_log_detail) c += '  log-adjacency-changes detail\n';
            if (data.o3_area_type !== 'normal') {
                c += '  area ' + area + ' ' + cgEsc(data.o3_area_type || '');
                if (data.o3_no_summary) c += ' no-summary';
                c += '\n';
            }
            c += '  address-family ipv6 unicast\n';
            if (data.o3_distance) c += '    distance ' + cgEsc(data.o3_distance) + '\n';
            if (data.o3_max_paths) c += '    maximum-paths ' + cgEsc(data.o3_max_paths) + '\n';
            if (data.o3_range) {
                c += '    area ' + area + ' range ' + cgEsc(data.o3_range);
                if (data.o3_not_adv) c += ' not-advertise';
                else if (data.o3_range_cost) c += ' cost ' + cgEsc(data.o3_range_cost);
                c += '\n';
            }
            c += '\ninterface ' + iface + '\n';
            c += '  ipv6 address ' + cgEsc(data.o3_ipv6 || '') + '\n';
            c += '  ipv6 router ospfv3 ' + tag + ' area ' + area + '\n';
            if (data.o3_network) c += '  ospfv3 network ' + cgEsc(data.o3_network) + '\n';
            if (data.o3_cost) c += '  ospfv3 cost ' + cgEsc(data.o3_cost) + '\n';
            if (data.o3_hello) c += '  ospfv3 hello-interval ' + cgEsc(data.o3_hello) + '\n';
            if (data.o3_dead) c += '  ospfv3 dead-interval ' + cgEsc(data.o3_dead) + '\n';
            if (data.o3_instance !== undefined && data.o3_instance !== '') c += '  ospfv3 instance ' + cgEsc(data.o3_instance) + '\n';
            if (data.o3_priority !== undefined && data.o3_priority !== '') c += '  ospfv3 priority ' + cgEsc(data.o3_priority) + '\n';
            if (data.o3_passive) c += '  ospfv3 passive-interface\n';
            if (data.o3_mtu_ignore) c += '  ospfv3 mtu-ignore\n';
            c += '  no shutdown\n\n! Doğrulama:\n! show ipv6 ospfv3 ' + tag + '\n! show ipv6 ospfv3 ' + tag + ' interface ' + iface + '\n! show ipv6 route ospfv3\n';
            return c;
        });
    }
};

// ── NX-OS: Route-Map ────────────────────────────────────────────────────────
// Kaynaklar: cisco.nxos.nxos_route_maps argspec, parsed/rendered fixture'ları;
// Cisco Nexus 9000 Route Policy Manager rehberi.
CiscoNXOS.routeMap = {
    label: 'Route-Map',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-random',
                title: 'Route-Map (NX-OS)',
                desc: 'Prefix-list, ACL, community, AS-path veya interface eşleşmesine göre BGP/IGP öznitelikleri ayarlar. Route-map satırları en düşük sequence numarasından başlayarak işlenir.'
            },
            configTypes: [
                { id: 'ipv4-prefix', label: 'IPv4 Prefix-List', icon: 'fas fa-network-wired', desc: 'match ip address prefix-list', badge: { text: 'Yaygın', cls: 'recommended' } },
                { id: 'ipv6-prefix', label: 'IPv6 Prefix-List', icon: 'fas fa-project-diagram', desc: 'match ipv6 address prefix-list' },
                { id: 'acl', label: 'IPv4 ACL', icon: 'fas fa-filter', desc: 'match ip address ACL' },
                { id: 'community', label: 'BGP Community', icon: 'fas fa-tags', desc: 'match community' },
                { id: 'as-path', label: 'AS-Path List', icon: 'fas fa-route', desc: 'match as-path' },
                { id: 'interface', label: 'Interface', icon: 'fas fa-ethernet', desc: 'match interface' }
            ],
            sections: [
                {
                    title: 'Route-Map Girdisi', icon: 'fas fa-list-ol',
                    fields: [
                        { name: 'rm_name', label: 'Route-Map Adı', type: 'text', validate: 'objname', required: true, placeholder: 'RM-BGP-IN' },
                        { name: 'rm_action', label: 'Aksiyon', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'rm_seq', label: 'Sequence', type: 'text', min: 1, max: 65535, required: true, value: '10' },
                        { name: 'rm_desc', label: 'Açıklama', type: 'text', placeholder: 'BGP giriş politikası' },
                        { name: 'rm_continue', label: 'Continue Sequence', type: 'text', min: 1, max: 65535, placeholder: '20', hint: 'Boş = ilk eşleşmede dur' }
                    ]
                },
                {
                    title: 'Match', icon: 'fas fa-filter',
                    fields: [
                        { name: 'rm_v4_pl', label: 'IPv4 Prefix-List Adları', type: 'text', validate: 'objname_list', requiredIf: { field: '_cgtype', in: ['ipv4-prefix'] }, showFor: ['ipv4-prefix'], placeholder: 'ALLOW-PREFIX BACKUP-PREFIX' },
                        { name: 'rm_v6_pl', label: 'IPv6 Prefix-List Adları', type: 'text', validate: 'objname_list', requiredIf: { field: '_cgtype', in: ['ipv6-prefix'] }, showFor: ['ipv6-prefix'], placeholder: 'ALLOW-V6' },
                        { name: 'rm_acl', label: 'IPv4 ACL Adı', type: 'text', validate: 'objname', requiredIf: { field: '_cgtype', in: ['acl'] }, showFor: ['acl'], placeholder: 'ACL-BGP-SOURCES' },
                        { name: 'rm_comm_match', label: 'Community-List Adları', type: 'text', validate: 'objname_list', requiredIf: { field: '_cgtype', in: ['community'] }, showFor: ['community'], placeholder: 'COMM-INTERNAL COMM-CUSTOMER' },
                        { name: 'rm_aspath', label: 'AS-Path List Adları', type: 'text', validate: 'objname_list', requiredIf: { field: '_cgtype', in: ['as-path'] }, showFor: ['as-path'], placeholder: 'ASPATH-CUSTOMER' },
                        { name: 'rm_iface', label: 'Interface', type: 'text', validate: 'iface', requiredIf: { field: '_cgtype', in: ['interface'] }, showFor: ['interface'], placeholder: 'Ethernet1/1' }
                    ]
                },
                {
                    title: 'Set', icon: 'fas fa-sliders-h',
                    fields: [
                        { name: 'rm_local_pref', label: 'Local Preference', type: 'text', min: 0, max: 4294967295, placeholder: '200' },
                        { name: 'rm_metric', label: 'Metric / MED', type: 'text', validate: 'uint32_delta', placeholder: '+100', hint: 'Sayı veya +/− değişim; 0-4294967295' },
                        { name: 'rm_weight', label: 'BGP Weight', type: 'text', min: 0, max: 65535, placeholder: '100' },
                        { name: 'rm_community', label: 'Community Değerleri', type: 'text', validate: 'bgp_community_list', placeholder: '65000:100 no-export' },
                        { name: 'rm_additive', label: 'Community additive', type: 'checkbox' },
                        { name: 'rm_next_hop', label: 'IPv4 Next-Hop', type: 'text', validate: 'ip', placeholder: '192.0.2.1' }
                    ]
                }
            ],
            submit: 'Route-Map Oluştur'
        }, (data) => {
            const type = data._cgtype || 'ipv4-prefix';
            const name = cgEsc(data.rm_name || ''), action = cgEsc(data.rm_action || 'permit'), seq = cgEsc(data.rm_seq || '10');
            let c = cgNxHdr('Route-Map') + 'route-map ' + name + ' ' + action + ' ' + seq + '\n';
            if (type === 'ipv4-prefix') c += '  match ip address prefix-list ' + cgEsc(data.rm_v4_pl || '') + '\n';
            else if (type === 'ipv6-prefix') c += '  match ipv6 address prefix-list ' + cgEsc(data.rm_v6_pl || '') + '\n';
            else if (type === 'acl') c += '  match ip address ' + cgEsc(data.rm_acl || '') + '\n';
            else if (type === 'community') c += '  match community ' + cgEsc(data.rm_comm_match || '') + '\n';
            else if (type === 'as-path') c += '  match as-path ' + cgEsc(data.rm_aspath || '') + '\n';
            else if (type === 'interface') c += '  match interface ' + cgEsc(data.rm_iface || '') + '\n';
            if (data.rm_desc) c += '  description ' + cgEsc(data.rm_desc) + '\n';
            if (data.rm_local_pref !== undefined && data.rm_local_pref !== '') c += '  set local-preference ' + cgEsc(data.rm_local_pref) + '\n';
            if (data.rm_metric) c += '  set metric ' + cgEsc(data.rm_metric) + '\n';
            if (data.rm_weight !== undefined && data.rm_weight !== '') c += '  set weight ' + cgEsc(data.rm_weight) + '\n';
            if (data.rm_community) c += '  set community ' + cgEsc(data.rm_community) + (data.rm_additive ? ' additive' : '') + '\n';
            if (data.rm_next_hop) c += '  set ip next-hop ' + cgEsc(data.rm_next_hop) + '\n';
            if (data.rm_continue) c += '  continue ' + cgEsc(data.rm_continue) + '\n';
            c += '\n! Doğrulama:\n! show route-map ' + name + '\n! show running-config | section "^route-map ' + name + '"\n';
            return c;
        });
    }
};

// ── NX-OS: Model-Driven Telemetry ───────────────────────────────────────────
// Kaynaklar: cisco.nxos.nxos_telemetry argspec/integration fixture'ları;
// Cisco Nexus 9000 NX-OS Programmability Guide 10.5(x).
CiscoNXOS.telemetry = {
    label: 'Model-Driven Telemetry',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-stream',
                title: 'Model-Driven Telemetry (NX-OS)',
                desc: 'Collector hedefi, sensör yolu ve subscription örnekleme aralığını birbirine bağlar. Ansible modülü bu özelliği N9K 7.0(3)I7(5 ve sonrasında destekler; Cisco MDS desteklenmez.'
            },
            sections: [
                {
                    title: 'Destination Profile', icon: 'fas fa-paper-plane',
                    fields: [
                        { name: 'tm_dst_id', label: 'Destination Group ID', type: 'text', validate: 'telemetry_id', required: true, placeholder: '100' },
                        { name: 'tm_ip', label: 'Collector IPv4', type: 'text', validate: 'ip', required: true, placeholder: '192.0.2.50' },
                        { name: 'tm_port', label: 'Collector Port', type: 'text', validate: 'tcpudp_port', required: true, placeholder: '50051' },
                        { name: 'tm_protocol', label: 'Protokol', type: 'select', options: [
                            { value: 'gRPC', label: 'gRPC', selected: true },
                            { value: 'HTTP', label: 'HTTP' },
                            { value: 'TCP', label: 'TCP' },
                            { value: 'UDP', label: 'UDP' }
                        ]},
                        { name: 'tm_encoding', label: 'Encoding', type: 'select', options: [
                            { value: 'GPB', label: 'GPB', selected: true },
                            { value: 'JSON', label: 'JSON' }
                        ]},
                        { name: 'tm_vrf', label: 'VRF', type: 'text', validate: 'objname', placeholder: 'management' },
                        { name: 'tm_source', label: 'Source Interface', type: 'text', validate: 'iface', placeholder: 'loopback0', hint: 'NX-OS 9.1+ platformlarda desteklenir' },
                        { name: 'tm_gzip', label: 'gzip sıkıştırma', type: 'checkbox' }
                    ]
                },
                {
                    title: 'Sensor Group', icon: 'fas fa-satellite-dish',
                    fields: [
                        { name: 'tm_sensor_id', label: 'Sensor Group ID', type: 'text', validate: 'telemetry_id', required: true, placeholder: '100' },
                        { name: 'tm_source_type', label: 'Data Source', type: 'select', options: [
                            { value: 'DME', label: 'DME', selected: true },
                            { value: 'NX-API', label: 'NX-API' },
                            { value: 'YANG', label: 'YANG' }
                        ]},
                        { name: 'tm_path', label: 'Sensor Path / Show Komutu', type: 'text', validate: 'single_cli_line', required: true, placeholder: 'sys/intf', hint: 'NX-API seçilirse show komutu otomatik tırnaklanır' },
                        { name: 'tm_depth', label: 'Depth', type: 'text', validate: 'telemetry_depth', value: '0', placeholder: '0', hint: '0 veya unbounded' },
                        { name: 'tm_query', label: 'Query Condition', type: 'text', validate: 'single_cli_line', placeholder: 'updates_only' },
                        { name: 'tm_filter', label: 'Filter Condition', type: 'text', validate: 'single_cli_line', placeholder: 'eq(eqptFt.operSt,"ok")' }
                    ]
                },
                {
                    title: 'Subscription', icon: 'fas fa-link',
                    fields: [
                        { name: 'tm_sub_id', label: 'Subscription ID', type: 'text', validate: 'telemetry_id', required: true, placeholder: '100' },
                        { name: 'tm_interval', why: '0 event-based yayın yapar; pozitif değer milisaniye cinsinden periyodik örneklemedir.', label: 'Sample Interval (ms)', type: 'text', validate: 'uint32', required: true, value: '10000', hint: '0 = yalnız değişiklik olduğunda gönder' }
                    ]
                }
            ],
            submit: 'Telemetry Konfigürasyonu Oluştur'
        }, (data) => {
            const dst = cgEsc(data.tm_dst_id || ''), sensor = cgEsc(data.tm_sensor_id || ''), sub = cgEsc(data.tm_sub_id || '');
            const sourceType = data.tm_source_type || 'DME';
            let c = cgNxHdr('Model-Driven Telemetry') + 'feature telemetry\n';
            if (sourceType === 'NX-API') c += 'feature nxapi\n';
            c += '\ntelemetry\n';
            if (data.tm_vrf || data.tm_source || data.tm_gzip) {
                c += '  destination-profile\n';
                if (data.tm_vrf) c += '    use-vrf ' + cgEsc(data.tm_vrf) + '\n';
                if (data.tm_gzip) c += '    use-compression gzip\n';
                if (data.tm_source) c += '    source-interface ' + cgEsc(data.tm_source) + '\n';
            }
            c += '  destination-group ' + dst + '\n';
            c += '    ip address ' + cgEsc(data.tm_ip || '') + ' port ' + cgEsc(data.tm_port || '') +
                ' protocol ' + cgEsc(data.tm_protocol || 'gRPC') + ' encoding ' + cgEsc(data.tm_encoding || 'GPB') + '\n';
            c += '  sensor-group ' + sensor + '\n';
            c += '    data-source ' + cgEsc(sourceType) + '\n';
            let path = String(data.tm_path || '').trim();
            if (sourceType === 'NX-API') path = '"' + path.replace(/^"|"$/g, '') + '"';
            c += '    path ' + cgEsc(path);
            if (data.tm_depth !== undefined && data.tm_depth !== '') c += ' depth ' + cgEsc(data.tm_depth);
            if (data.tm_query) c += ' query-condition ' + cgEsc(data.tm_query);
            if (data.tm_filter) c += ' filter-condition ' + cgEsc(data.tm_filter);
            c += '\n';
            c += '  subscription ' + sub + '\n';
            c += '    dst-grp ' + dst + '\n';
            c += '    snsr-grp ' + sensor + ' sample-interval ' + cgEsc(data.tm_interval || '0') + '\n';
            c += '\n! Doğrulama:\n! show running-config telemetry\n! show telemetry control database sensor-groups\n! show telemetry control database subscriptions\n';
            return c;
        });
    }
};

// ── NX-OS: NX-API ───────────────────────────────────────────────────────────
// Kaynaklar: cisco.nxos.nxos_nxapi modülü/testleri; Cisco Nexus 9000
// Programmability Guide 10.2(x) ve NX-OS command reference.
CiscoNXOS.nxapi = {
    label: 'NX-API',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-code',
                title: 'NX-API (NX-OS)',
                desc: 'NX-API CLI servisini HTTP/HTTPS, VRF ve TLS politikasıyla yapılandırır. HTTPS kullanın; HTTP Basic kimlik bilgilerini şifrelemeden taşır.'
            },
            configTypes: [
                { id: 'enable', label: 'Etkinleştir / Yapılandır', icon: 'fas fa-toggle-on', desc: 'feature nxapi ve güvenli transport', badge: { text: 'HTTPS', cls: 'recommended' } },
                { id: 'disable', label: 'Devre Dışı Bırak', icon: 'fas fa-toggle-off', desc: 'no feature nxapi' }
            ],
            sections: [
                {
                    title: 'Transport', icon: 'fas fa-lock', showFor: ['enable'],
                    fields: [
                        { name: 'na_http', why: 'HTTP, kullanıcı adı ve parolayı şifrelemeden taşır; yalnız kontrollü ve izole laboratuvarlarda değerlendirin.', label: 'HTTP etkin', type: 'checkbox', checked: false },
                        { name: 'na_http_port', label: 'HTTP Port', type: 'text', validate: 'tcpudp_port', requiredIf: { field: 'na_http', checked: true }, placeholder: '80' },
                        { name: 'na_https', label: 'HTTPS etkin', type: 'checkbox', checked: true },
                        { name: 'na_https_port', label: 'HTTPS Port', type: 'text', validate: 'tcpudp_port', requiredIf: { field: 'na_https', checked: true }, value: '443', placeholder: '443' },
                        { name: 'na_vrf', label: 'NX-API VRF', type: 'text', validate: 'objname', placeholder: 'management', hint: 'Boş = cihaz varsayılanı' }
                    ]
                },
                {
                    title: 'TLS Güvenliği', icon: 'fas fa-shield-alt', showFor: ['enable'],
                    fields: [
                        { name: 'na_strong', label: 'Zayıf cipher’ları kapat', type: 'checkbox', checked: true, hint: 'N3K/N9K NX-OS 9.2+ için no nxapi ssl ciphers weak' },
                        { name: 'na_tls12', label: 'TLS 1.2', type: 'checkbox', checked: true },
                        { name: 'na_tls13', label: 'TLS 1.3', type: 'checkbox', checked: false, hint: 'Nexus 9000 NX-OS 10.2(4)M ve sonrası' },
                        { name: 'na_tls11', label: 'TLS 1.1 (eski istemci)', type: 'checkbox', checked: false },
                        { name: 'na_tls10', label: 'TLS 1.0 (önerilmez)', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Developer Sandbox', icon: 'fas fa-flask', showFor: ['enable'],
                    warn: 'Ansible koleksiyonu Sandbox seçeneğini yalnız Nexus 7000 platformunda destekler.',
                    fields: [
                        { name: 'na_sandbox', label: 'NX-API Sandbox’ı etkinleştir (yalnız N7K)', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'NX-API Konfigürasyonu Oluştur'
        }, (data) => {
            let c = cgNxHdr('NX-API');
            if (data._cgtype === 'disable') {
                c += 'no feature nxapi\n\n! Doğrulama:\n! show feature | include nxapi\n';
                return c;
            }
            const warnings = [];
            if (!data.na_http && !data.na_https) warnings.push('HTTP ve HTTPS birlikte kapalı; NX-API etkin olsa da uzaktan erişilemez.');
            if (data.na_https && !data.na_tls10 && !data.na_tls11 && !data.na_tls12 && !data.na_tls13) {
                warnings.push('HTTPS seçili fakat hiçbir TLS sürümü seçilmedi.');
            }
            c += 'feature nxapi\n';
            c += data.na_http ? 'nxapi http port ' + cgEsc(data.na_http_port || '80') + '\n' : 'no nxapi http\n';
            c += data.na_https ? 'nxapi https port ' + cgEsc(data.na_https_port || '443') + '\n' : 'no nxapi https\n';
            if (data.na_vrf) c += 'nxapi use-vrf ' + cgEsc(data.na_vrf) + '\n';
            if (data.na_strong) c += 'no nxapi ssl ciphers weak\n';
            const tls = [];
            if (data.na_tls10) tls.push('TLSv1');
            if (data.na_tls11) tls.push('TLSv1.1');
            if (data.na_tls12) tls.push('TLSv1.2');
            if (data.na_tls13) tls.push('TLSv1.3');
            if (data.na_https && tls.length) c += 'nxapi ssl protocols ' + tls.join(' ') + '\n';
            if (data.na_sandbox) c += 'nxapi sandbox\n'; else c += 'no nxapi sandbox\n';
            c += '\n! Doğrulama:\n! show nxapi\n! show running-config | include ^nxapi\n';
            return warnings.length ? { config: c, warnings } : c;
        });
    }
};

// ── NX-OS: OSPF ───────────────────────────────────────────────────────────────
CiscoNXOS.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF (NX-OS)',
                desc: 'Nexus OSPF — process-tag ile çoklu instance. Link-state routing, area yapısı ve MD5 authentication desteği.'
            },
            sections: [
                {
                    title: 'OSPF Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', why: "NX-OS’ta önce <code>feature ospf</code> açılmadan hiçbir OSPF komutu kabul edilmez — komutlar sessizce reddedilir. Process ID yereldir, komşuyla aynı olması gerekmez.", label: 'Process ID', type: 'text', required: true, placeholder: '1', hint: 'OSPF süreç numarası veya tag', tooltip: 'NX-OS OSPF process-id veya named process tag' },
                        { name: 'rid', why: "Router-ID elle verilmezse cihaz bir arayüz IP’si seçer; o arayüz düştüğünde ID değişir ve <b>tüm komşuluklar sıfırlanır</b>. Sabit bir loopback IP’si vermek bu kesintiyi önler.", label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Genellikle Loopback IP adresi' },
                        { name: 'area', why: "Komşu arayüzler aynı area’da olmalıdır; farklıysa hello alınır ama komşuluk <b>ExStart/Init</b> aşamasında takılır. NX-OS area’yı noktalı biçimde (0.0.0.0) gösterir.", label: 'Area', type: 'text', required: true, placeholder: '0.0.0.0', hint: 'Backbone için 0.0.0.0' }
                    ]
                },
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "OSPF’in bu arayüzde açıldığını <code>show ip ospf interface</code> ile doğrulayın. Arayüz <code>no switchport</code> yapılmamışsa L3 değildir ve OSPF hiç çalışmaz.", label: 'Interface', type: 'text', validate: 'iface', required: true, placeholder: 'Ethernet1/1', hint: 'OSPF etkinleştirilecek arayüz' },
                        { name: 'iface_ip', why: "Arayüz IP/prefix uyuşmazlığı, iki komşunun farklı subnetlerde olması demektir; OSPF hello’ları gelir ama komşuluk hiç kurulmaz. NX-OS CIDR biçimi bekler.", label: 'Interface IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/30', hint: 'CIDR formatında IP adresi' },
                        { name: 'net_type', why: "Broadcast ağlarda DR/BDR seçimi yapılır; point-to-point seçmek bu seçimi atlayarak komşuluğu hızlandırır. Ancak iki uçta farklı network type seçilirse timer’lar uyuşmaz ve komşuluk kurulmaz.", label: 'Network Type', type: 'select', options: [
                            { value: 'point-to-point', label: 'point-to-point', selected: true },
                            { value: 'broadcast', label: 'broadcast' }
                        ]},
                        { name: 'auth_key', why: "OSPF authentication yalnızca bir tarafta açılırsa komşuluk anında düşer ve paketler sessizce atılır. Açarken her iki ucu aynı anda yapılandırın.", label: 'Auth Key', type: 'text', optional: true, placeholder: 'ospfkey123', hint: 'MD5 authentication için şifre' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxOspfGen(data);
        });
    }
};
function cgNxOspfGen(data) {
    const pid = cgEsc(data.pid || ''), rid = cgEsc(data.rid || ''), area = cgEsc(data.area || '');
    const iface = cgEsc(data.iface || ''), ifaceIp = cgEsc(data.iface_ip || '');
    const netType = cgEsc(data.net_type || 'point-to-point'), authKey = cgEsc(data.auth_key || '');
    let c = '# ========================================\n# Cisco NX-OS — OSPF\n# ========================================\n\n';
    c += 'feature ospf\n\n';
    c += 'router ospf ' + pid + '\n router-id ' + rid + '\n';
    if (authKey) c += ' area ' + area + ' authentication message-digest\n';
    c += '!\n\n';
    c += 'interface ' + iface + '\n';
    c += ' no switchport\n';
    c += ' ip address ' + ifaceIp + '\n';
    c += ' ip router ospf ' + pid + ' area ' + area + '\n';
    c += ' ip ospf network ' + netType + '\n';
    if (authKey) {
        c += ' ip ospf authentication message-digest\n';
        c += ' ip ospf message-digest-key 1 md5 ' + authKey + '\n';
    }
    c += ' no shutdown\n!\n\n';
    c += '# Doğrulama:\n# show ip ospf neighbors\n# show ip ospf database\n# show ip route ospf\n';
    return c;
}

// ── NX-OS: BGP ────────────────────────────────────────────────────────────────
CiscoNXOS.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'BGP (NX-OS)',
                desc: 'NX-OS BGP — address-family, route-reflector ve confederation desteği. eBGP/iBGP peer konfigürasyonu.'
            },
            sections: [
                {
                    title: 'BGP Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'local_as', why: "NX-OS’ta <code>feature bgp</code> açılmadan BGP komutları kabul edilmez. AS numarası yanlışsa komşu <b>OPEN</b> mesajını reddeder ve oturum sürekli açılıp kapanır.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel Autonomous System numarası' },
                        { name: 'rid', why: "BGP Router-ID tüm AS içinde benzersiz olmalıdır; çakışma komşuluğun kurulup hemen düşmesine yol açar. Loopback kullanmak fiziksel arayüz arızasından etkilenmemesini sağlar.", label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID (genellikle Loopback IP)' },
                        { name: 'network', why: "BGP <code>network</code> satırı yalnızca prefix route tablosunda <b>tam olarak</b> bu maskeyle varsa duyurulur; yoksa komşulara hiçbir şey gitmez. Bu, prefix duyurulmuyor şikayetlerinin en yaygın sebebidir.", label: 'Network (advertise)', type: 'text', optional: true, placeholder: '10.1.0.0/16', hint: 'BGP ile duyurulacak prefix' }
                    ]
                },
                {
                    title: 'Neighbor Ayarları',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'nbr_ip', why: "Komşu IP’si karşı tarafın oturumu başlattığı kaynak adresle birebir eşleşmelidir. iBGP’de loopback kullanılıyorsa iki tarafta da <code>update-source</code> ayarlanmalıdır, yoksa oturum hiç kurulmaz.", label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'BGP komşu IP adresi' },
                        { name: 'nbr_as', why: "Komşunun AS numarası yanlışsa BGP OPEN mesajı reddedilir ve oturum <b>Active/Idle</b> arasında döner. eBGP’de ayrıca <code>ebgp-multihop</code> gerekebilir.", label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65002', hint: 'Komşunun AS numarası' },
                        { name: 'nbr_type', why: "iBGP komşular öğrendikleri prefix’i diğer iBGP komşularına <b>yeniden duyurmaz</b>; bu yüzden ya full-mesh ya da route-reflector gerekir. Bu kural atlanınca prefix’ler sessizce kaybolur.", label: 'Neighbor Tipi', type: 'select', options: [
                            { value: 'ebgp', label: 'eBGP', selected: true },
                            { value: 'ibgp', label: 'iBGP' }
                        ]},
                        { name: 'update_src', why: "iBGP loopback üzerinden kurulurken update-source belirtilmezse cihaz çıkış arayüzü IP’sini kullanır ve komşu bunu tanımayıp oturumu reddeder. Ayrıca loopback’in IGP ile duyurulmuş olması gerekir.", label: 'Update Source', type: 'text', optional: true, placeholder: 'loopback0', hint: 'iBGP için update-source arayüzü (ör: loopback0)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxBgpGen(data);
        });
    }
};
function cgNxBgpGen(data) {
    const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
    const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
    const nbrType = cgEsc(data.nbr_type || 'ebgp'), updateSrc = cgEsc(data.update_src || '');
    const network = cgEsc(data.network || '');
    let c = '# ========================================\n# Cisco NX-OS — BGP\n# ========================================\n\n';
    c += 'feature bgp\n\n';
    c += 'router bgp ' + localAs + '\n';
    c += ' router-id ' + rid + '\n';
    c += ' address-family ipv4 unicast\n';
    if (network) c += '  network ' + network + '\n';
    c += ' !\n';
    c += ' neighbor ' + nbrIp + '\n remote-as ' + nbrAs + '\n';
    if (nbrType === 'ibgp' && updateSrc) c += '  update-source ' + updateSrc + '\n';
    if (nbrType === 'ebgp') c += '  ebgp-multihop 2\n';
    c += '  address-family ipv4 unicast\n   send-community\n  !\n!\n\n';
    c += '# Doğrulama:\n# show bgp summary\n# show bgp neighbors ' + nbrIp + '\n# show ip bgp\n';
    return c;
}

// ── NX-OS: HSRP ──────────────────────────────────────────────────────────────
CiscoNXOS.hsrp = {
    label: 'HSRP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'HSRP (NX-OS)',
                desc: 'Nexus HSRP v2 — gateway yedekliği, preempt ve timer optimizasyonu. SVI üzerinde aktif/standby yapılandırması.'
            },
            sections: [
                {
                    title: 'Interface ve HSRP Ayarları',
                    icon: 'fas fa-ethernet',
                    fields: [
                        { name: 'iface', why: "HSRP bir L3 arayüzde veya SVI üzerinde çalışır; <code>feature interface-vlan</code> açılmadan SVI oluşturulamaz. vPC ortamında HSRP her iki switch’te de tanımlı olmalıdır.", label: 'Interface (SVI)', type: 'text', validate: 'iface', required: true, placeholder: 'Vlan10', hint: 'HSRP uygulanacak SVI veya arayüz' },
                        { name: 'iface_ip', why: "Fiziksel IP her switch’te <b>farklı</b>, sanal IP (VIP) ise aynı olmalıdır. İki switch’e aynı fiziksel IP’yi vermek ağda adres çakışması yaratır.", label: 'Interface IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.168.10.2/24', hint: 'CIDR formatında fiziksel IP' },
                        { name: 'grp', why: "HSRP grup numarası iki switch’te <b>aynı</b> olmalıdır; farklı grup numarası her iki cihazın da kendi sanal IP’si ile active olmasına yol açar. Grup numarası sanal MAC adresini de belirler.", label: 'HSRP Grup Numarası', type: 'text', required: true, placeholder: '10', hint: '0–255 arası grup ID' },
                        { name: 'vip', why: "Sanal IP, istemcilerin default gateway’idir ve arayüzün fiziksel IP’sinden farklı, ama aynı subnette olmalıdır. Fiziksel IP ile aynı vermek HSRP’nin hiç başlamamasına neden olur.", label: 'Sanal IP (VIP)', type: 'text', validate: 'ip', required: true, placeholder: '192.168.10.1', hint: 'Gateway olarak kullanılacak sanal IP' }
                    ]
                },
                {
                    title: 'Öncelik ve Kimlik Doğrulama',
                    icon: 'fas fa-star',
                    fields: [
                        { name: 'priority', why: "Yüksek öncelikli cihaz active olur, ancak <b>preempt kapalıysa</b> yüksek öncelikli cihaz geri geldiğinde rolü geri alamaz. Öncelik tek başına yeterli değildir.", label: 'Öncelik', type: 'text', optional: true, placeholder: '110', hint: 'Yüksek değer = aktif router (varsayılan 100)' },
                        { name: 'preempt', why: "Preempt açıkken onarılan cihaz rolü hemen geri alır ve bu anlık bir kesinti yaratır. <code>preempt delay minimum</code> vermezseniz cihaz yönlendirme tablosunu doldurmadan active olur ve trafik kara deliğe düşer.", label: 'Preempt?', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Preempt aktif iken daha yüksek öncelikli router devralır' },
                        { name: 'auth_key', why: "HSRP authentication iki switch’te farklıysa her ikisi de kendini <b>active</b> sanar ve aynı sanal IP iki cihazda birden yanıt verir. Bu, ağda kesintili gateway davranışına yol açar.", label: 'Auth Key', type: 'text', optional: true, placeholder: 'hsrpkey', hint: 'MD5 authentication şifresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxHsrpGen(data);
        });
    }
};
function cgNxHsrpGen(data) {
    const iface = cgEsc(data.iface || ''), ifaceIp = cgEsc(data.iface_ip || '');
    const grp = cgEsc(data.grp || ''), vip = cgEsc(data.vip || '');
    const priority = cgEsc(data.priority || '') || '100';
    const preempt = cgEsc(data.preempt || 'yes'), authKey = cgEsc(data.auth_key || '');
    let c = '# ========================================\n# Cisco NX-OS — HSRP\n# ========================================\n\n';
    c += 'feature hsrp\n\n';
    c += 'interface ' + iface + '\n';
    c += ' ip address ' + ifaceIp + '\n';
    c += ' hsrp version 2\n';
    c += ' hsrp ' + grp + '\n';
    c += '  ip ' + vip + '\n';
    c += '  priority ' + priority + '\n';
    if (preempt === 'yes') c += '  preempt\n';
    if (authKey) c += '  authentication md5 key-string ' + authKey + '\n';
    c += ' no shutdown\n!\n\n';
    c += '# Doğrulama:\n# show hsrp\n# show hsrp interface ' + iface + '\n# show hsrp brief\n';
    return c;
}

// ── NX-OS: MPLS ───────────────────────────────────────────────────────────────
CiscoNXOS.mpls = {
    label: 'MPLS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tags',
                title: 'MPLS (NX-OS)',
                desc: 'Nexus MPLS/Segment Routing — LDP etiket dağıtımı ve MPLS forwarding. LDP, Segment Routing veya VRF-Lite modu seçin.'
            },
            configTypes: [
                { id: 'ldp', label: 'LDP', icon: 'fas fa-tags', desc: 'Label Distribution Protocol', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'sr', label: 'Segment Routing', icon: 'fas fa-route', desc: 'SRGB ve Node-SID konfigürasyonu', badge: { text: 'Modern', cls: 'advanced' } },
                { id: 'vrf', label: 'VRF-Lite', icon: 'fas fa-layer-group', desc: 'VRF context ile L3 segmentasyon', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'LDP Ayarları',
                    icon: 'fas fa-tags',
                    showFor: ['ldp'],
                    fields: [
                        { name: 'ldp_loopback', why: "LDP Router-ID sabit bir loopback olmalıdır; değişken bir arayüz seçilirse arayüz düştüğünde tüm LDP oturumları ve LSP’ler yeniden kurulur. <code>feature mpls ldp</code> açık olmalıdır.", label: 'Router-ID Loopback', type: 'text', required: true, placeholder: 'Loopback0', hint: 'LDP Router-ID için kullanılacak loopback' },
                        { name: 'ldp_rid', why: "Bu loopback IP’si IGP ile tüm ağda duyurulmalıdır; ulaşılamayan bir router-ID ile LDP komşuluğu hiç kurulmaz. <code>/32</code> maske kullanılmalıdır.", label: 'Router-ID IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Loopback IP adresi' },
                        { name: 'ldp_ifaces', why: "LDP yalnızca açıkça etkinleştirilen arayüzlerde çalışır; bir arayüzü atlamak o yol üzerinde etiket dağıtımını keser ve trafik IP olarak yönlendirilip MPLS VPN’i bozar.", label: 'LDP Arayüzleri', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış arayüz listesi' },
                        { name: 'ldp_mtu', why: "MPLS etiketleri her paketi 4 byte büyütür; MTU artırılmazsa büyük paketler fragmentasyona uğrar veya sessizce düşer. Yol üzerindeki <b>tüm</b> cihazlarda aynı MTU ayarlanmalıdır.", label: 'MPLS MTU', type: 'text', optional: true, placeholder: '1508', hint: 'MPLS MTU değeri (varsayılan 1500)' }
                    ]
                },
                {
                    title: 'Segment Routing Ayarları',
                    icon: 'fas fa-route',
                    showFor: ['sr'],
                    fields: [
                        { name: 'sr_srgb_start', why: "SRGB aralığı ağdaki tüm cihazlarda aynı olmalıdır; farklı aralıklar etiket hesaplamasını bozar ve trafiğin yanlış yönlendirilmesine yol açar. Değiştirmek kesinti gerektirir.", label: 'SRGB Başlangıç', type: 'text', required: true, placeholder: '16000', hint: 'Segment Routing Global Block başlangıcı' },
                        { name: 'sr_srgb_end', why: "Aralık, planlanan node sayısını karşılayacak kadar geniş olmalıdır; dar bir SRGB ağ büyüdüğünde yeni node eklenememesine neden olur.", label: 'SRGB Bitiş', type: 'text', required: true, placeholder: '23999', hint: 'Segment Routing Global Block bitişi' },
                        { name: 'sr_node_sid', why: "Node-SID ağ genelinde <b>benzersiz</b> olmalıdır; çakışma iki cihazın aynı etiketi talep etmesine ve trafiğin yanlış hedefe gitmesine yol açar.", label: 'Node-SID Index', type: 'text', required: true, placeholder: '1', hint: 'Bu node için SID index değeri' },
                        { name: 'sr_loopback', why: "Node-SID bu loopback prefix’ine bağlanır; loopback IGP ile duyurulmazsa SID hiçbir yere yayılmaz ve segment routing çalışmaz.", label: 'Loopback Arayüzü', type: 'text', required: true, placeholder: 'Loopback0', hint: 'SR prefix için loopback arayüzü' },
                        { name: 'sr_igp', why: "Segment Routing IGP uzantıları ile taşınır; seçilen IGP ağ genelinde tutarlı olmalıdır. IS-IS ve OSPF karışımında SID dağıtımı kopar.", label: 'IGP Protokol', type: 'select', options: [
                            { value: 'ospf', label: 'OSPF', selected: true },
                            { value: 'isis', label: 'IS-IS' }
                        ]},
                        { name: 'sr_igp_proc', why: "Process ID veya IS-IS tag yanlışsa SR yapılandırması var olmayan bir sürece uygulanır ve sessizce etkisiz kalır. Mevcut süreç adıyla birebir eşleşmelidir.", label: 'IGP Process/Tag', type: 'text', required: true, placeholder: '1', hint: 'OSPF process ID veya IS-IS tag' }
                    ]
                },
                {
                    title: 'VRF-Lite Ayarları',
                    icon: 'fas fa-layer-group',
                    showFor: ['vrf'],
                    fields: [
                        { name: 'vrf_name', why: "VRF adı büyük/küçük harf duyarlıdır ve arayüze <code>vrf member</code> ile atanmalıdır. VRF’e atama anında arayüzün <b>IP adresi silinir</b> — IP’yi VRF atamasından sonra yeniden girin.", label: 'VRF Adı', type: 'text', required: true, placeholder: 'CUSTOMER-A', hint: 'VRF context adı' },
                        { name: 'vrf_rd', why: "RD, VPN prefix’lerini AS genelinde benzersiz kılar; iki VRF’in aynı RD’yi kullanması route’ların birbirine karışmasına yol açar. Genelde <code>ASN:NN</code> biçimi kullanılır.", label: 'Route Distinguisher', type: 'text', validate: 'rd', required: true, placeholder: '65000:100', hint: 'Format: ASN:NN' },
                        { name: 'vrf_rt_imp', why: "Import RT, hangi route’ların bu VRF’e alınacağını belirler; yanlış RT prefix’lerin hiç görünmemesine ya da istenmeyen müşteri route’larının sızmasına yol açar.", label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: '65000:100', hint: 'Route-target import değeri' },
                        { name: 'vrf_rt_exp', why: "Export RT diğer PE’lerin bu VRF route’larını tanımasını sağlar. Import ve export değerleri hub-spoke tasarımlarında bilinçli olarak farklı seçilir; aynı verirseniz tam mesh oluşur.", label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: '65000:100', hint: 'Route-target export değeri' },
                        { name: 'vrf_af', why: "Address-family açılmadan o protokol ailesi VRF içinde çalışmaz; IPv6 trafiği IPv4 ailesi altında taşınmaz. Her aile için RD/RT ayrı yapılandırılmalıdır.", label: 'Address-Family', type: 'select', options: [
                            { value: 'ipv4', label: 'IPv4 Unicast', selected: true },
                            { value: 'both', label: 'IPv4 + IPv6' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosMplsGen(data);
        });
    }
};
function cgNxosMplsGen(data) {
    const mode = cgEsc(data._cgtype || 'ldp');
    let c = '! ========================================\n! Cisco NX-OS — MPLS\n! ========================================\n\n';
    if (mode === 'ldp') {
        c += 'feature mpls ldp\n\n';
        const lo = cgEsc(data.ldp_loopback || ''), rid = cgEsc(data.ldp_rid || '');
        const mtu = cgEsc(data.ldp_mtu || '');
        if (lo && rid) {
            c += 'interface ' + lo + '\n  ip address ' + rid + ' 255.255.255.255\n  ip router ospf 1 area 0\nno shutdown\n\n';
        }
        c += 'mpls ldp configuration\n  router-id ' + (rid || '<router-id>') + '\n\n';
        const ifaces = cgEsc(data.ldp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
        ifaces.forEach(iface => {
            c += 'interface ' + iface + '\n  mpls ip\n';
            if (mtu) c += '  mpls mtu ' + mtu + '\n';
            c += '\n';
        });
    } else if (mode === 'sr') {
        c += 'feature ospf\nfeature segment-routing\n\n';
        const srgbStart = cgEsc(data.sr_srgb_start || ''), srgbEnd = cgEsc(data.sr_srgb_end || '');
        const lo = cgEsc(data.sr_loopback || ''), nodeSid = cgEsc(data.sr_node_sid || '');
        c += 'segment-routing mpls\n  global-block ' + srgbStart + ' ' + srgbEnd + '\n  connected-prefix-sid-map\n    address-family ipv4\n      ' + lo + '/32 index ' + nodeSid + ' range 1\n\n';
        const igp = cgEsc(data.sr_igp || 'ospf'), proc = cgEsc(data.sr_igp_proc || '');
        if (igp === 'ospf') {
            c += 'router ospf ' + proc + '\n  segment-routing mpls\n  segment-routing forwarding mpls\n\n';
        } else {
            c += 'router isis ' + proc + '\n  segment-routing mpls\n  address-family ipv4 unicast\n    segment-routing mpls alloc all-interfaces\n\n';
        }
    } else {
        const vname = cgEsc(data.vrf_name || ''), rd = cgEsc(data.vrf_rd || '');
        const rtimp = cgEsc(data.vrf_rt_imp || ''), rtexp = cgEsc(data.vrf_rt_exp || '');
        c += 'vrf context ' + vname + '\n  rd ' + rd + '\n  address-family ipv4 unicast\n    route-target import ' + rtimp + '\n    route-target export ' + rtexp + '\n';
        if (cgEsc(data.vrf_af || '') === 'both') {
            c += '  address-family ipv6 unicast\n    route-target import ' + rtimp + ':6\n    route-target export ' + rtexp + ':6\n';
        }
        c += '\n';
    }
    return c;
}

// ── NX-OS: vPC ────────────────────────────────────────────────────────────────
CiscoNXOS.vpc = {
    label: 'vPC',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-link',
                title: 'vPC (Virtual Port-Channel)',
                desc: 'Virtual Port-Channel — çift control-plane ile loop-free dual-homed yedeklilik. Peer-keepalive ve peer-link konfigürasyonu.'
            },
            sections: [
                {
                    title: 'vPC Domain',
                    icon: 'fas fa-th-large',
                    fields: [
                        { name: 'vpc_domain', why: "Domain ID vPC çiftinde <b>aynı</b>, komşu vPC çiftlerinde ise farklı olmalıdır. Aynı L2 alanında tekrarlanan domain ID, aynı sistem MAC’inin üretilmesine ve ağda ciddi kararsızlığa yol açar. Önce <code>feature vpc</code> açılmalıdır.", label: 'Domain ID', type: 'text', required: true, placeholder: '10', hint: '1–1000 arası benzersiz domain ID' },
                        { name: 'vpc_priority', why: "Düşük değer primary olur. Primary/secondary rolü peer-link koptuğunda kritik hale gelir: secondary tüm vPC üye portlarını kapatır, yanlış rol planlaması yanlış switch’in trafiği kesmesine neden olur.", label: 'Role Priority', type: 'text', optional: true, placeholder: '100', hint: 'Düşük değer = primary router' },
                        { name: 'vpc_mac', why: "Sistem MAC iki switch’te aynı olmalıdır ki downstream cihazlar çifti tek bir switch olarak görsün. Farklı MAC, port-channel’ın hiç kurulmamasına yol açar.", label: 'System MAC', type: 'text', optional: true, placeholder: '00:23:04:ee:be:67', hint: 'vPC çifti için ortak system MAC' },
                        { name: 'vpc_autorecovery', why: "Peer switch geri gelmezse auto-recovery vPC portlarını tek başına açar ve tam kesintiyi önler. Kapalı bırakılırsa her iki switch de yeniden başladığında portlar <b>suspend</b> kalır ve ağ ayağa kalkmaz.", label: 'Auto-Recovery', type: 'select', options: [
                            { value: 'yes', label: 'Etkin', selected: true },
                            { value: 'no', label: 'Devre Dışı' }
                        ]},
                        { name: 'vpc_gcc', why: "Graceful consistency check, tutarsızlık bulunduğunda tüm VLAN’ları değil yalnızca etkilenenleri suspend eder. Kapatmak, küçük bir uyumsuzluğun tüm vPC’yi düşürmesine neden olur.", label: 'Graceful Consistency Check', type: 'select', options: [
                            { value: 'yes', label: 'Etkin', selected: true },
                            { value: 'no', label: 'Devre Dışı' }
                        ]}
                    ]
                },
                {
                    // Sözdizimi: canlı config (peer-switch 10, peer-gateway 8, delay restore 8, ip arp synchronize 6, system-priority 6 cihaz)
                    // + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/interfaces/cisco-nexus-9000-nx-os-interfaces-configuration-guide-103x/b-cisco-nexus-9000-nx-os-interfaces-configuration-guide-93x_chapter_01000.html
                    title: 'vPC Domain — Ek Ayarlar',
                    icon: 'fas fa-sliders-h',
                    info: 'Bu ayarlar iki vPC peer’da <b>aynı</b> girilmelidir (system-priority ve peer-switch uyuşmazlığı consistency hatası verir).',
                    fields: [
                        { name: 'vpc_peer_gw', why: "Bazı sunucular/depolama cihazları cevabı ARP’taki MAC yerine gelen paketin kaynak MAC’ine gönderir. peer-gateway kapalıyken peer’ın MAC’ine giden paket peer-link’ten geçmek zorunda kalır ve vPC döngü önleme kuralı yüzünden <b>düşebilir</b>.", label: 'peer-gateway', type: 'checkbox', checked: true },
                        { name: 'vpc_arp_sync', why: "Peer-link veya peer geri geldiğinde ARP tablosunun peer’dan hızlıca kopyalanmasını sağlar; kapalıyken SVI’larda ARP yeniden öğrenilene kadar trafik kaybı yaşanır.", label: 'ip arp synchronize', type: 'checkbox', checked: true },
                        { name: 'vpc_peer_switch', why: "vPC çiftini STP’de tek bir root köprü olarak gösterir; primary değiştiğinde STP yeniden hesaplanmaz. Cisco: yalnız iki peer’da <b>aynı STP önceliği</b> varsa ve ikisi de tüm VLAN’lar için root ise yapılandırılabilir.", label: 'peer-switch', type: 'checkbox', checked: false },
                        { name: 'vpc_delay', why: "Yeniden başlayan peer, routing tablosu dolmadan vPC portlarını açarsa trafik kara deliğe düşer. delay restore portların açılmasını bu süre kadar geciktirir.", label: 'delay restore (sn)', type: 'text', min: 1, max: 3600, placeholder: '150', hint: 'Boş = varsayılan' },
                        { name: 'vpc_sys_prio', why: "LACP pazarlığında vPC çiftinin sistem önceliğidir; iki peer’da farklı olursa vPC port-channel’ları kurulmaz.", label: 'system-priority', type: 'text', min: 1, max: 65535, placeholder: '2000', hint: 'Boş = varsayılan' }
                    ]
                },
                {
                    title: 'Peer-Keepalive',
                    icon: 'fas fa-heartbeat',
                    fields: [
                        { name: 'ka_src', why: "Peer-keepalive <b>peer-link’ten ayrı bir yoldan</b> gitmelidir (genelde mgmt0). Keepalive peer-link üzerinden taşınırsa link koptuğunda her iki switch de diğerini ölü sanar ve split-brain oluşur.", label: 'Kaynak IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1', hint: 'Bu switchin keepalive kaynak IP' },
                        { name: 'ka_dst', why: "Hedef, peer switch’in keepalive adresidir. Keepalive kaybı tek başına vPC’yi düşürmez ama peer-link de koparsa secondary tüm vPC portlarını kapatır.", label: 'Hedef IP', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.2', hint: 'Peer switchin keepalive hedef IP' },
                        { name: 'ka_vrf', why: "Keepalive genelde <code>management</code> VRF’inde taşınır; böylece veri düzleminden tamamen izole olur. VRF yanlış seçilirse keepalive hiç ulaşmaz ve vPC kurulmaz.", label: 'VRF', type: 'text', optional: true, placeholder: 'management', hint: 'Keepalive VRF (management arayüzü için "management")' }
                    ]
                },
                {
                    title: 'Peer-Link (Port-Channel)',
                    icon: 'fas fa-exchange-alt',
                    fields: [
                        { name: 'pl_po', why: "Peer-link, vPC çiftinin kontrol ve orphan trafiğini taşır; tek bir port-channel olmalı ve <code>switchport mode trunk</code> ile tüm vPC VLAN’larını geçirmelidir. Eksik VLAN, o VLAN trafiğinin sessizce kaybolmasına yol açar.", label: 'Port-Channel Numarası', type: 'text', required: true, placeholder: '1', hint: 'Peer-link için port-channel numarası' },
                        { name: 'pl_ifaces', why: "Peer-link üyeleri farklı hat kartlarına dağıtılmalıdır; tek kart arızası peer-link’i tamamen düşürürse vPC secondary tüm portlarını kapatır. En az iki üye port kullanın.", label: 'Üye Arayüzler', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış peer-link üye portları' }
                    ]
                },
                {
                    title: 'vPC Üye Port-Channel',
                    icon: 'fas fa-sitemap',
                    fields: [
                        { name: 'vpc_po', why: "vPC üye port-channel’ın yapılandırması iki switch’te birebir aynı olmalıdır (VLAN, speed, mode). Tutarsızlık consistency check ile portun <b>suspend</b> edilmesine yol açar.", label: 'Port-Channel Numarası', type: 'text', optional: true, placeholder: '10', hint: 'vPC üye port-channel numarası' },
                        { name: 'vpc_id', why: "vPC ID iki switch’te <b>aynı</b> olmalıdır; farklı ID verilirse downstream cihaz iki ayrı link görür ve spanning-tree bunlardan birini bloklar. Genelde port-channel numarasıyla aynı tutulur.", label: 'vPC ID', type: 'text', optional: true, placeholder: '10', hint: 'vPC kimlik numarası (peer ile aynı olmalı)' },
                        { name: 'vpc_po_ifaces', why: "Üye portlar her iki switch’te simetrik olmalıdır. Tek taraflı üye ekleme, karşı tarafta karşılığı olmayan bir link yaratır ve trafik dengesizliği ile kayıp oluşur.", label: 'Üye Arayüzler', type: 'text', optional: true, placeholder: 'Ethernet1/3, Ethernet1/4', hint: 'Virgülle ayrılmış üye portlar' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosVpcGen(data);
        });
    }
};
function cgNxosVpcGen(data) {
    let c = '! ========================================\n! Cisco NX-OS — vPC\n! ========================================\n\n';
    c += 'feature vpc\nfeature lacp\n\n';
    c += 'vpc domain ' + cgEsc(data.vpc_domain || '') + '\n';
    if (data.vpc_priority) c += '  role priority ' + cgEsc(data.vpc_priority) + '\n';
    if (data.vpc_mac) c += '  system-mac ' + cgEsc(data.vpc_mac) + '\n';
    if (data.vpc_autorecovery === 'yes') c += '  auto-recovery\n';
    if (data.vpc_gcc === 'no') c += '  no graceful consistency-check\n';
    if (data.vpc_peer_switch) c += '  peer-switch\n';
    if (data.vpc_sys_prio) c += '  system-priority ' + cgEsc(data.vpc_sys_prio) + '\n';
    if (data.vpc_delay) c += '  delay restore ' + cgEsc(data.vpc_delay) + '\n';
    if (data.vpc_peer_gw) c += '  peer-gateway\n';
    if (data.vpc_arp_sync) c += '  ip arp synchronize\n';
    const kavrf = cgEsc(data.ka_vrf || '');
    c += '  peer-keepalive destination ' + cgEsc(data.ka_dst || '') + ' source ' + cgEsc(data.ka_src || '');
    if (kavrf) c += ' vrf ' + kavrf;
    c += '\n\n';
    const pl = cgEsc(data.pl_po || '');
    c += 'interface port-channel' + pl + '\n  switchport\n  switchport mode trunk\n  spanning-tree port type network\n  vpc peer-link\n\n';
    cgEsc(data.pl_ifaces || '').split(',').map(s => s.trim()).filter(Boolean).forEach(iface => {
        c += 'interface ' + iface + '\n  switchport\n  switchport mode trunk\n  channel-group ' + pl + ' mode active\n\n';
    });
    const vpo = cgEsc(data.vpc_po || ''), vid = cgEsc(data.vpc_id || '');
    if (vpo && vid) {
        c += 'interface port-channel' + vpo + '\n  switchport\n  switchport mode trunk\n  vpc ' + vid + '\n\n';
        cgEsc(data.vpc_po_ifaces || '').split(',').map(s => s.trim()).filter(Boolean).forEach(iface => {
            c += 'interface ' + iface + '\n  switchport\n  switchport mode trunk\n  channel-group ' + vpo + ' mode active\n\n';
        });
    }
    if (data.vpc_peer_switch) c += '! UYARI: peer-switch için iki peer’da STP önceliği aynı olmalı (spanning-tree vlan X priority N).\n';
    c += '! Doğrulama:\n! show vpc brief\n! show vpc peer-keepalive\n! show vpc consistency-parameters global\n! show vpc role\n';
    return c;
}

// ── NX-OS: VXLAN ─────────────────────────────────────────────────────────────
CiscoNXOS.vxlan = {
    label: 'VXLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-cloud',
                title: 'VXLAN',
                desc: 'NX-OS VXLAN Overlay — VNI ve NVE interface konfigürasyonu, underlay routing. L2 VNI (bridging) veya L3 VNI (routing) modu seçin.'
            },
            configTypes: [
                { id: 'l2vni', label: 'L2 VNI', icon: 'fas fa-network-wired', desc: 'Layer-2 overlay, VLAN-to-VNI mapping', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'l3vni', label: 'L3 VNI (Routing)', icon: 'fas fa-route', desc: 'VRF-to-VNI mapping, inter-tenant routing', badge: { text: 'İleri', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VTEP (NVE Interface)',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'vtep_loopback', why: "NVE source-interface olarak kullanılan loopback underlay IGP ile tüm VTEP’lere duyurulmalıdır; ulaşılamayan VTEP IP’si ile tünel hiç kurulmaz. vPC çiftinde ayrıca <b>secondary IP</b> (anycast VTEP) gerekir.", label: 'Source Loopback', type: 'text', required: true, placeholder: 'Loopback1', hint: 'NVE source-interface için loopback' },
                        { name: 'vtep_ip', why: "Bu adres overlay’in kaynak IP’sidir ve /32 olmalıdır. vPC ortamında iki switch aynı secondary IP’yi paylaşmazsa uzak VTEP’ler MAC’leri sürekli iki farklı kaynak arasında salınır görür.", label: 'VTEP IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Bu VTEP için overlay IP adresi' }
                    ]
                },
                {
                    title: 'L2 VNI Mapping',
                    icon: 'fas fa-map',
                    showFor: ['l2vni'],
                    fields: [
                        { name: 'l2_vlan', why: "VLAN ile VNI eşlemesi <b>tüm</b> VTEP’lerde tutarlı olmalıdır; farklı eşleme farklı müşterilerin trafiğinin karışmasına yol açar. VLAN’ın <code>vn-segment</code> ile VNI’ye bağlanması zorunludur.", label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '100', hint: 'Yerel VLAN numarası' },
                        { name: 'l2_vni', why: "L2 VNI, VXLAN’da yayılma alanını tanımlar. Aynı VNI’nin iki farklı VLAN’a eşlenmesi trafik sızıntısı yaratır; VNI numaralandırmasını merkezi bir planla yönetin.", label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'l2_rd', why: "<code>auto</code> seçmek RD’yi router-ID ve VLAN’dan türetir ve çakışma riskini azaltır. Elle verilen RD’lerde iki switch aynı değeri kullanırsa EVPN route’ları birbirini ezer.", label: 'BGP EVPN RD', type: 'text', validate: 'rd', required: true, placeholder: 'auto', hint: 'Route Distinguisher (auto önerilir)' },
                        { name: 'l2_rt', why: "Route-target, MAC/IP bilgisinin hangi VTEP’lere yayılacağını belirler. <code>auto</code> yalnızca tüm ağda aynı AS kullanılıyorsa güvenlidir; eBGP tasarımlarda RT’leri elle hizalamak gerekir.", label: 'RT Import/Export', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target değeri (auto önerilir)' }
                    ]
                },
                {
                    title: 'L3 VNI (VRF-to-VNI)',
                    icon: 'fas fa-layer-group',
                    showFor: ['l3vni'],
                    fields: [
                        { name: 'l3_vrf', why: "L3 VNI, VRF’ler arası yönlendirmeyi taşır; VRF’e L3 VNI atanmazsa tenant içi subnetler arası yönlendirme <b>hiç</b> çalışmaz. Her tenant için ayrı L3 VNI gerekir.", label: 'VRF Adı', type: 'text', required: true, placeholder: 'TENANT-A', hint: 'L3 VNI ilişkilendirilecek VRF' },
                        { name: 'l3_vni', why: "L3 VNI tüm VTEP’lerde aynı VRF için aynı değer olmalıdır; uyuşmazlık simetrik IRB yönlendirmesini bozar ve trafik hedefe ulaşmaz.", label: 'L3 VNI', type: 'text', validate: 'vni', required: true, placeholder: '50001', hint: 'Layer-3 VNI değeri' },
                        { name: 'l3_svi_vlan', why: "L3 VNI için ayrılan SVI VLAN yalnızca transit amaçlıdır ve üzerinde kullanıcı olmamalıdır. Bu VLAN peer-link trunk’ında da izinli olmalı, yoksa vPC üzerinden yönlendirme kopar.", label: 'SVI (VLAN) ID', type: 'text', validate: 'vlan', required: true, placeholder: '901', hint: 'L3 VNI için SVI VLAN ID' },
                        { name: 'l3_bgp_as', why: "EVPN kontrol düzlemi BGP ile çalışır; AS numarası underlay tasarımı ile tutarlı olmalıdır. Yanlış AS ile L3 route’lar hiç duyurulmaz.", label: 'BGP AS', type: 'text', validate: 'asn', required: true, placeholder: '65000', hint: 'BGP Autonomous System numarası' },
                        { name: 'l3_rt', why: "L3 VNI route-target’ı tenant route’larının hangi VTEP’lere yayılacağını belirler. Yanlış RT, tenant izolasyonunun kırılmasına veya route’ların hiç görünmemesine yol açar.", label: 'RT Import/Export', type: 'text', validate: 'rt', required: true, placeholder: '65000:50001', hint: 'Route-target değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosVxlanGen(data);
        });
    }
};
function cgNxosVxlanGen(data) {
    const mode = cgEsc(data._cgtype || 'l2vni');
    let c = '! ========================================\n! Cisco NX-OS — VXLAN/EVPN\n! ========================================\n\n';
    c += 'feature nv overlay\nfeature vn-segment-vlan-based\nfeature bgp\nnv overlay evpn\n\n';
    const lo = cgEsc(data.vtep_loopback || ''), vtep = cgEsc(data.vtep_ip || '');
    c += 'interface ' + lo + '\n  ip address ' + vtep + '/32\n  ip router ospf 1 area 0\nno shutdown\n\n';
    c += 'interface nve1\n  no shutdown\n  source-interface ' + lo + '\n  host-reachability protocol bgp\n';
    if (mode === 'l2vni') {
        const vlan = cgEsc(data.l2_vlan || ''), vni = cgEsc(data.l2_vni || '');
        c += '  member vni ' + vni + '\n    ingress-replication protocol bgp\n\n';
        c += 'vlan ' + vlan + '\n  vn-segment ' + vni + '\n\n';
        c += 'evpn\n  vni ' + vni + ' l2\n    rd ' + cgEsc(data.l2_rd || '') + '\n    route-target import ' + cgEsc(data.l2_rt || '') + '\n    route-target export ' + cgEsc(data.l2_rt || '') + '\n\n';
    } else {
        const vrf = cgEsc(data.l3_vrf || ''), l3vni = cgEsc(data.l3_vni || '');
        const sviVlan = cgEsc(data.l3_svi_vlan || ''), as = cgEsc(data.l3_bgp_as || ''), rt = cgEsc(data.l3_rt || '');
        c += '  member vni ' + l3vni + ' associate-vrf\n\n';
        c += 'vlan ' + sviVlan + '\n  vn-segment ' + l3vni + '\n\n';
        c += 'vrf context ' + vrf + '\n  vni ' + l3vni + '\n  rd auto\n  address-family ipv4 unicast\n    route-target import ' + rt + ' evpn\n    route-target export ' + rt + ' evpn\n\n';
        c += 'interface Vlan' + sviVlan + '\n  no shutdown\n  vrf member ' + vrf + '\n  ip forward\n\n';
        c += 'router bgp ' + as + '\n  address-family l2vpn evpn\n    advertise-pip\n\n';
    }
    return c;
}

// ── NX-OS: SPAN ──────────────────────────────────────────────────────────────
CiscoNXOS.span = {
    label: 'SPAN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-eye',
                title: 'SPAN',
                desc: 'Nexus SPAN/ERSPAN — trafik kopyalama, analiz ve troubleshooting portları. Local SPAN, RSPAN veya ERSPAN modu seçin.'
            },
            configTypes: [
                { id: 'local', label: 'Local SPAN', icon: 'fas fa-eye', desc: 'Aynı switch içi trafik kopyalama', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'rspan', label: 'RSPAN', icon: 'fas fa-broadcast-tower', desc: 'VLAN üzerinden uzak switch kopyalama', badge: { text: 'Yaygın', cls: 'common' } },
                { id: 'erspan', label: 'ERSPAN', icon: 'fas fa-cloud', desc: 'IP tüneli üzerinden uzak kopyalama', badge: { text: 'İleri', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Oturum Ayarları',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'span_session', why: "NX-OS’ta SPAN oturumları varsayılan olarak <code>shut</code> durumda oluşur; <code>no shut</code> yapılmadan hiçbir trafik kopyalanmaz. Platform başına aynı anda aktif olabilecek oturum sayısı sınırlıdır.", label: 'Oturum Numarası', type: 'text', required: true, placeholder: '1', hint: 'SPAN oturum numarası (1–66)' }
                    ]
                },
                {
                    title: 'Local SPAN Ayarları',
                    icon: 'fas fa-eye',
                    showFor: ['local'],
                    fields: [
                        { name: 'local_src', why: "Kaynak portun trafiği kopyalanır, ancak yüksek hacimli portlar hedef portu doyurup <b>kopyaların sessizce düşmesine</b> yol açar. Birden çok kaynak eklerken hedefin bant genişliğine dikkat edin.", label: 'Kaynak Arayüz(ler)', type: 'text', required: true, placeholder: 'Ethernet1/1, Ethernet1/2', hint: 'Virgülle ayrılmış kaynak portlar' },
                        { name: 'local_dir', why: "<b>both</b> seçmek trafiği iki kat artırır ve hedef portu kolayca doldurur. Yalnızca gerekli yönü seçmek hem kayıpları hem switch yükünü azaltır.", label: 'Kaynak Yönü', type: 'select', options: [
                            { value: 'both', label: 'Both (TX+RX)', selected: true },
                            { value: 'tx', label: 'TX' },
                            { value: 'rx', label: 'RX' }
                        ]},
                        { name: 'local_dst', why: "Hedef port SPAN’a atandığı anda normal anahtarlama işlevini kaybeder; üzerindeki mevcut bağlantılar kopar. Üretimde kullanılan bir portu hedef seçmek kesinti yaratır.", label: 'Hedef Arayüz', type: 'text', required: true, placeholder: 'Ethernet1/48', hint: 'Trafik kopyalanacak analyzer portu' }
                    ]
                },
                {
                    title: 'RSPAN Ayarları',
                    icon: 'fas fa-broadcast-tower',
                    showFor: ['rspan'],
                    fields: [
                        { name: 'rspan_vlan', why: "RSPAN VLAN yol üzerindeki <b>tüm</b> trunk’larda izinli olmalı ve bu VLAN’da MAC öğrenmesi kapatılmalıdır. Aksi halde kopyalanan trafik hedefe hiç ulaşmaz veya ağda gereksiz flooding yapar.", label: 'RSPAN VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '999', hint: 'RSPAN trafiği taşıyacak VLAN' },
                        { name: 'rspan_role', why: "Kaynak ve hedef switch rolleri ayrı yapılandırılır; iki tarafta da doğru rol seçilmezse oturum eksik kalır ve analyzer hiçbir paket görmez.", label: 'Rol', type: 'select', options: [
                            { value: 'src', label: 'Kaynak Switch', selected: true },
                            { value: 'dst', label: 'Hedef Switch' }
                        ]},
                        { name: 'rspan_src', why: "Kaynak switch üzerinde izlenecek portlar; RSPAN VLAN’ı taşıyan trunk kopuk olduğunda trafik sessizce kaybolur ve hata mesajı üretilmez.", label: 'Kaynak Arayüz(ler)', type: 'text', requiredIf: { field: 'rspan_role', in: ['src'] }, placeholder: 'Ethernet1/1', hint: 'Kaynak switch üzerindeki izlenecek portlar' },
                        { name: 'rspan_dst', why: "Hedef switch üzerindeki analyzer portu. Bu port da SPAN hedefi olduğu için normal trafiği geçirmez.", label: 'Hedef Arayüz', type: 'text', requiredIf: { field: 'rspan_role', in: ['dst'] }, placeholder: 'Ethernet1/48', hint: 'Hedef switch üzerindeki analyzer portu' }
                    ]
                },
                {
                    title: 'ERSPAN Ayarları',
                    icon: 'fas fa-cloud',
                    showFor: ['erspan'],
                    fields: [
                        { name: 'erspan_id', why: "ERSPAN ID kaynak ve hedef tarafta <b>aynı</b> olmalıdır; farklıysa GRE paketleri ulaşsa bile analyzer oturumu eşleştiremez ve trafik atılır.", label: 'ERSPAN ID', type: 'text', required: true, placeholder: '1', hint: 'ERSPAN oturum kimliği' },
                        { name: 'erspan_src', why: "İzlenecek kaynak portlar. ERSPAN trafiği GRE ile kapsüllendiği için ek başlık MTU sorunlarına ve yol üzerinde fragmentasyona yol açabilir.", label: 'Kaynak Arayüz(ler)', type: 'text', required: true, placeholder: 'Ethernet1/1', hint: 'İzlenecek kaynak portlar' },
                        { name: 'erspan_src_ip', why: "Kaynak IP genelde bir loopback’tir ve hedefe yönlendirilebilir olmalıdır. Ulaşılamayan kaynak/hedef çiftinde oturum <b>up</b> görünse bile paket gitmez.", label: 'Kaynak IP (VTEP)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'ERSPAN GRE tüneli kaynak IP' },
                        { name: 'erspan_dst_ip', why: "Analyzer cihazının IP adresi; arada GRE (IP protokol 47) trafiğini engelleyen bir güvenlik duvarı varsa kopyalar sessizce düşer.", label: 'Hedef IP (Analyzer)', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'Uzak analyzer cihazının IP adresi' },
                        { name: 'erspan_ttl', why: "TTL düşük verilirse GRE paketleri analyzer’a ulaşmadan yolda ölür. Çok atlamalı yollarda varsayılan değeri artırmak gerekir.", label: 'TTL', type: 'text', optional: true, placeholder: '64', hint: 'GRE paketi TTL değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxosSpanGen(data);
        });
    }
};
function cgNxosSpanGen(data) {
    const mode = cgEsc(data._cgtype || 'local'), sess = cgEsc(data.span_session || '');
    let c = '! ========================================\n! Cisco NX-OS — SPAN/RSPAN\n! ========================================\n\n';
    if (mode === 'local') {
        c += 'monitor session ' + sess + '\n';
        const srcs = cgEsc(data.local_src || '').split(',').map(s => s.trim()).filter(Boolean);
        const dir = cgEsc(data.local_dir || 'both');
        srcs.forEach(src => {
            c += '  source interface ' + src;
            if (dir !== 'both') c += ' ' + dir;
            c += '\n';
        });
        c += '  destination interface ' + cgEsc(data.local_dst || '') + '\nno shut\n\n';
    } else if (mode === 'rspan') {
        const vlan = cgEsc(data.rspan_vlan || ''), role = cgEsc(data.rspan_role || 'src');
        c += 'vlan ' + vlan + '\n  remote-span\n\n';
        if (role === 'src') {
            const srcs = cgEsc(data.rspan_src || '').split(',').map(s => s.trim()).filter(Boolean);
            c += 'monitor session ' + sess + ' type rspan-source\n';
            srcs.forEach(src => { if (src) c += '  source interface ' + src + '\n'; });
            c += '  destination remote vlan ' + vlan + '\nno shut\n\n';
        } else {
            c += 'monitor session ' + sess + ' type rspan-destination\n';
            c += '  source remote vlan ' + vlan + '\n';
            const dst = cgEsc(data.rspan_dst || '');
            if (dst) c += '  destination interface ' + dst + '\n';
            c += 'no shut\n\n';
        }
    } else {
        const id = cgEsc(data.erspan_id || ''), ttl = cgEsc(data.erspan_ttl || '');
        c += 'monitor session ' + sess + ' type erspan-source\n';
        const srcs = cgEsc(data.erspan_src || '').split(',').map(s => s.trim()).filter(Boolean);
        srcs.forEach(src => { c += '  source interface ' + src + '\n'; });
        c += '  destination ip ' + cgEsc(data.erspan_dst_ip || '') + '\n  erspan-id ' + id + '\n  origin ip address ' + cgEsc(data.erspan_src_ip || '') + '\n';
        if (ttl) c += '  ip ttl ' + ttl + '\n';
        c += 'no shut\n\n';
    }
    c += '! Doğrulama:\n! show monitor session ' + sess + '\n! show monitor session all\n';
    return c;
}

// ── NX-OS: BGP EVPN ──────────────────────────────────────────────────────────
CiscoNXOS.evpn = {
    label: 'VXLAN EVPN',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'VXLAN EVPN',
                desc: 'BGP EVPN kontrolü ile VXLAN overlay — modern data center fabric protokolü. MP-BGP üzerinden MAC/IP route dağıtımı.'
            },
            sections: [
                {
                    title: 'BGP EVPN Ayarları',
                    icon: 'fas fa-route',
                    fields: [
                        { name: 'local_as', why: "EVPN için <code>feature bgp</code> ve <code>nv overlay evpn</code> birlikte açık olmalıdır. AS numarası underlay tasarımınızla (iBGP mi eBGP mi) tutarlı seçilmelidir.", label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Yerel BGP AS numarası' },
                        { name: 'rid', why: "EVPN’de Router-ID aynı zamanda BGP oturumlarının kimliğidir ve VTEP loopback’inden farklı olabilir. Çakışan ID’ler overlay komşuluklarının kurulup sürekli düşmesine neden olur.", label: 'Router-ID', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'BGP Router-ID (Loopback IP)' },
                        { name: 'nbr_ip', why: "EVPN peer genelde loopback adresidir ve underlay yönlendirme bu loopback’i ulaşılabilir kılmalıdır. Underlay çalışmadan overlay komşuluğu asla kurulmaz.", label: 'Neighbor IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.2', hint: 'EVPN peer IP adresi' },
                        { name: 'nbr_as', why: "EVPN’de iBGP için aynı AS, eBGP için farklı AS girilir; iBGP kullanıyorsanız route-reflector yapılandırılmadan prefix’ler komşular arasında yayılmaz.", label: 'Neighbor AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'iBGP için aynı AS, eBGP için farklı AS' }
                    ]
                },
                {
                    title: 'EVPN VNI Ayarları',
                    icon: 'fas fa-cloud',
                    fields: [
                        { name: 'vni', why: "EVPN altında tanımlanan VNI, NVE arayüzündeki VNI ile birebir eşleşmelidir; uyuşmazlık kontrol düzlemi ile veri düzleminin ayrışmasına ve MAC’lerin hiç öğrenilmemesine yol açar.", label: 'VNI', type: 'text', validate: 'vni', required: true, placeholder: '10100', hint: 'VXLAN Network Identifier' },
                        { name: 'rd', why: "<code>auto</code> RD’yi router-ID ve VNI’den türetir; elle verilen değerlerde iki VTEP’in çakışması EVPN route’larının birbirini ezmesine neden olur.", label: 'RD (Route Distinguisher)', type: 'text', validate: 'rd', required: true, placeholder: 'auto', hint: 'Route Distinguisher değeri' },
                        { name: 'rt_import', why: "Import RT, bu VTEP’in hangi uzak route’ları kabul edeceğini belirler. Yanlış RT ile uzak MAC/IP bilgisi hiç öğrenilmez ve trafik sessizce flood edilir.", label: 'RT Import', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target import değeri' },
                        { name: 'rt_export', why: "Export RT bu VTEP’in route’larını hangi tenant etiketiyle duyuracağını belirler; eksik veya yanlış RT, diğer VTEP’lerin bu siteyi hiç görememesine yol açar.", label: 'RT Export', type: 'text', validate: 'rt', required: true, placeholder: 'auto', hint: 'Route-target export değeri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxEvpnGen(data);
        });
    }
};
function cgNxEvpnGen(data) {
    const localAs = cgEsc(data.local_as || ''), rid = cgEsc(data.rid || '');
    const nbrIp = cgEsc(data.nbr_ip || ''), nbrAs = cgEsc(data.nbr_as || '');
    const vni = cgEsc(data.vni || ''), rd = cgEsc(data.rd || '');
    const rtImport = cgEsc(data.rt_import || ''), rtExport = cgEsc(data.rt_export || '');
    let c = '! ========================================\n! Cisco NX-OS — BGP EVPN\n! ========================================\n\n';
    c += 'feature bgp\nfeature nv overlay\nfeature vn-segment-vlan-based\nnv overlay evpn\n\n';
    c += 'router bgp ' + localAs + '\n';
    c += '  router-id ' + rid + '\n';
    c += '  neighbor ' + nbrIp + '\n    remote-as ' + nbrAs + '\n';
    c += '    update-source loopback0\n';
    c += '    address-family l2vpn evpn\n      send-community\n      send-community extended\n    !\n  !\n!\n\n';
    c += 'evpn\n  vni ' + vni + ' l2\n    rd ' + rd + '\n';
    c += '    route-target import ' + rtImport + '\n';
    c += '    route-target export ' + rtExport + '\n  !\n!\n\n';
    c += '! Doğrulama:\n! show bgp l2vpn evpn summary\n! show nve peers\n! show evpn evi vni ' + vni + ' detail\n';
    return c;
}

// ── NX-OS: FabricPath ────────────────────────────────────────────────────────
CiscoNXOS.fabricPath = {
    label: 'FabricPath',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-bezier-curve',
                title: 'FabricPath',
                desc: 'Cisco FabricPath — Layer-2 multipath fabric, IS-IS tabanlı loop-free topoloji. ECMP ile yüksek bant genişliği ve yedeklilik.'
            },
            sections: [
                {
                    title: 'FabricPath Temel Ayarlar',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'switch_id', why: "FabricPath switch-ID fabric içinde <b>benzersiz</b> olmalıdır; çakışma IS-IS tarafından tespit edilir ve ilgili cihaz fabric’ten dışlanır. Önce <code>feature-set fabricpath</code> kurulup etkinleştirilmelidir.", label: 'Switch-ID', type: 'text', required: true, placeholder: '1', hint: 'FabricPath topolojisindeki benzersiz switch kimliği' },
                        { name: 'metric_style', why: "Metric style tüm fabric’te tutarlı olmalıdır; karışık yapılandırma IS-IS komşuluklarının kurulmamasına veya yol hesabının hatalı olmasına yol açar.", label: 'IS-IS Metric Style', type: 'select', options: [
                            { value: 'wide', label: 'wide', selected: true },
                            { value: 'narrow', label: 'narrow' }
                        ], hint: 'Wide metric modern ağlar için önerilir' }
                    ]
                },
                {
                    title: 'FabricPath VLAN ve Interface',
                    icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'fp_vlans', why: "Bir VLAN ya klasik (CE) ya da FabricPath modunda olabilir; mod değişimi o VLAN’da anlık kesinti yaratır. VLAN’ların modu fabric’teki tüm switch’lerde aynı olmalıdır.", label: "FabricPath VLAN'lar", type: 'text', validate: 'vlan_list', required: true, placeholder: '100,200,300', hint: 'Virgülle ayrılmış VLAN ID listesi' },
                        { name: 'fp_ifaces', why: "FabricPath core portları yalnızca diğer fabric switch’lerine bakmalıdır; uç cihaz bağlı bir portu FabricPath moduna almak o cihazın trafiğinin tamamen kesilmesine neden olur.", label: "FabricPath Interface'ler", type: 'text', required: true, placeholder: 'Ethernet1/1,Ethernet1/2', hint: 'Virgülle ayrılmış fabric uplink portları' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxFabricPathGen(data);
        });
    }
};
function cgNxFabricPathGen(data) {
    const switchId = cgEsc(data.switch_id || ''), metricStyle = cgEsc(data.metric_style || 'wide');
    const fpVlans = cgEsc(data.fp_vlans || '').split(',').map(s => s.trim()).filter(Boolean);
    const fpIfaces = cgEsc(data.fp_ifaces || '').split(',').map(s => s.trim()).filter(Boolean);
    let c = '! ========================================\n! Cisco NX-OS — FabricPath\n! ========================================\n\n';
    c += 'feature-set fabricpath\n\n';
    c += 'fabricpath switch-id ' + switchId + '\n\n';
    c += '! FabricPath IS-IS\nrouter isis fabricpath\n  metric-style ' + metricStyle + '\n!\n\n';
    c += '! FabricPath VLANs\n';
    fpVlans.forEach(v => {
        c += 'vlan ' + v + '\n  mode fabricpath\n!\n';
    });
    c += '\n! FabricPath Interfaces\n';
    fpIfaces.forEach(iface => {
        c += 'interface ' + iface + '\n  switchport mode fabricpath\n  no shutdown\n!\n';
    });
    c += '\n! Doğrulama:\n! show fabricpath switch\n! show fabricpath topology\n! show fabricpath isis neighbors\n';
    return c;
}

// ── NX-OS: AAA ───────────────────────────────────────────────────────────────
CiscoNXOS.aaa = {
    label: 'AAA (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-shield',
                title: 'AAA (NX-OS)',
                desc: 'Nexus AAA — TACACS+/RADIUS, role-based access control (RBAC). Merkezi kimlik doğrulama ve yetkilendirme.'
            },
            sections: [
                {
                    title: 'RADIUS Server',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'radius_ip', why: "NX-OS’ta <code>feature aaa</code> gerekmez ama RADIUS sunucusu erişilemezse ve fallback tanımlı değilse cihaza hiç giriş yapamazsınız. <code>aaa authentication login default group ... local</code> ile yerel yedek bırakın.", label: 'RADIUS Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.100', hint: 'RADIUS sunucu IP adresi' },
                        { name: 'radius_key', why: "Anahtar uyuşmazlığında sunucu isteği <b>sessizce yok sayar</b> ve cihaz yalnızca timeout görür; bu yüzden hata ağ sorunu gibi görünür. İki tarafta birebir aynı olmalıdır.", label: 'RADIUS Key', type: 'text', required: true, placeholder: 'RadiusKey123!', hint: 'Paylaşılan gizli anahtar' },
                        { name: 'auth_port', why: "Standart port <b>1812</b>’dir; eski cihazlarda 1645 kullanılır. Yanlış port, isteklerin cevapsız kalmasına ve her girişin timeout süresince beklemesine yol açar.", label: 'Auth Port', type: 'text', validate: 'port', required: true, placeholder: '1812', hint: 'Authentication portu (standart: 1812)' },
                        { name: 'acct_port', why: "Accounting portu yanlışsa kimlik doğrulama çalışır ama oturum kayıtları hiç tutulmaz. Denetim gereksinimleri olan ortamlarda bu sessiz kayıp ciddi bir uyumluluk açığıdır.", label: 'Accounting Port', type: 'text', validate: 'port', required: true, placeholder: '1813', hint: 'Accounting portu (standart: 1813)' }
                    ]
                },
                {
                    title: 'Server Group ve Zamanlama',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'grp_name', why: "Server group adı <code>aaa authentication login</code> satırlarında referans verilir; ad uyuşmazlığında cihaz doğrudan yerel veritabanına düşer ve merkezi politika hiç uygulanmaz.", label: 'Server Group Adı', type: 'text', required: true, placeholder: 'RADIUS_SERVERS', hint: 'AAA server group adı' },
                        { name: 'timeout', why: "Timeout çok uzun verilirse ölü sunucu her girişte kullanıcıyı bekletir; çok kısa verilirse yavaş ama sağlıklı sunucu gereksiz yere atlanır. 5 saniye tipik bir değerdir.", label: 'Timeout (sn)', type: 'text', optional: true, placeholder: '5', hint: 'Sunucu yanıt bekleme süresi' },
                        { name: 'retransmit', why: "Toplam bekleme süresi timeout × retransmit kadardır; yüksek değerler konsol girişinin dakikalarca askıda kalmasına yol açabilir.", label: 'Retransmit', type: 'text', optional: true, placeholder: '3', hint: 'Yeniden deneme sayısı' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxAaaGen(data);
        });
    }
};
function cgNxAaaGen(data) {
    const radiusIp = cgEsc(data.radius_ip || ''), radiusKey = cgEsc(data.radius_key || '');
    const authPort = cgEsc(data.auth_port || ''), acctPort = cgEsc(data.acct_port || '');
    const grpName = cgEsc(data.grp_name || '');
    const timeout = cgEsc(data.timeout || ''), retransmit = cgEsc(data.retransmit || '');
    let c = '! ========================================\n! Cisco NX-OS — AAA / RADIUS\n! ========================================\n\n';
    c += 'feature radius\n\n';
    c += 'radius-server host ' + radiusIp + ' key ' + radiusKey;
    c += ' authentication port ' + authPort + ' accounting port ' + acctPort + '\n';
    if (timeout) c += 'radius-server timeout ' + timeout + '\n';
    if (retransmit) c += 'radius-server retransmit ' + retransmit + '\n';
    c += '\naaa group server radius ' + grpName + '\n  server ' + radiusIp + '\n!\n\n';
    c += 'aaa authentication login default group ' + grpName + ' local\n';
    c += 'aaa authorization commands default group ' + grpName + ' local\n';
    c += 'aaa accounting default group ' + grpName + '\n\n';
    c += '! Doğrulama:\n! show radius-server\n! show aaa authentication\n! show aaa accounting\n';
    return c;
}

// ── NX-OS: ACL ───────────────────────────────────────────────────────────────
CiscoNXOS.acl = {
    label: 'ACL (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL (NX-OS)',
                desc: 'Nexus ACL — IPv4/IPv6 erişim listeleri, object-group ve statistics desteği. Sequence numaralı girişler ile esnek kural yönetimi.'
            },
            sections: [
                {
                    title: 'ACL Kural Ayarları',
                    icon: 'fas fa-list',
                    fields: [
                        { name: 'acl_name', why: "NX-OS ACL’leri <code>ip access-list</code> ile tanımlanır ve arayüze <code>ip access-group</code> ile bağlanmadıkça etkisizdir. Ayrıca her ACL’in sonunda gizli bir <b>deny ip any any</b> vardır.", label: 'ACL Adı', type: 'text', required: true, placeholder: 'ACL_MGMT_IN', hint: 'Erişim listesi adı' },
                        { name: 'seq', why: "Sequence numarası kuralın değerlendirme sırasını belirler ve <b>ilk eşleşen</b> kural kazanır. 10’ar aralıkla yazmak sonradan araya kural eklemeyi mümkün kılar; aksi halde tüm listeyi yeniden yazmanız gerekir.", label: 'Seq Numarası', type: 'text', required: true, placeholder: '10', hint: 'ACE sıra numarası (10 ile artımlı kullanım önerilir)' },
                        { name: 'action', why: "Gizli son satır deny olduğu için, yönetim erişimini (SSH, SNMP) izin veren bir satır yazmadan ACL uygulamak <b>kendinizi cihazdan kilitlemenize</b> yol açar. Konsol erişimini hazır tutun.", label: 'Action', type: 'select', options: [
                            { value: 'permit', label: 'permit', selected: true },
                            { value: 'deny', label: 'deny' }
                        ]},
                        { name: 'protocol', why: "Protokol ile port belirtimi uyumlu olmalıdır; <code>ip</code> seçilirse port yazılamaz. ICMP’yi tamamen engellemek ping’in yanı sıra Path MTU Discovery’yi de bozar.", label: 'Protokol', type: 'select', options: [
                            { value: 'ip', label: 'ip', selected: true },
                            { value: 'tcp', label: 'tcp' },
                            { value: 'udp', label: 'udp' },
                            { value: 'icmp', label: 'icmp' }
                        ]},
                        { name: 'src', why: "Kaynak CIDR biçiminde yazılır (<code>10.0.0.0/8</code>); NX-OS wildcard değil prefix uzunluğu bekler. Fazla geniş kaynak tanımı istenmeyen erişimi sessizce açar.", label: 'Kaynak (src)', type: 'text', required: true, placeholder: '10.0.0.0/8', hint: 'CIDR formatı veya "any"' },
                        { name: 'dst', why: "Hedef tanımı kuralın kapsamını belirler; <code>any</code> kullanmak kuralı beklenenden çok daha geniş hale getirir. Yönetim ACL’lerinde hedefi cihazın kendi adresiyle sınırlayın.", label: 'Hedef (dst)', type: 'text', required: true, placeholder: 'any', hint: 'CIDR formatı veya "any"' },
                        { name: 'dscp', why: "DSCP eşleştirmesi yalnızca işaretlenmiş trafiği yakalar; uçtan uca işaretleme yoksa kural hiç hit almaz. QoS güvenilir sınırının nerede olduğunu bilmeden DSCP ile filtrelemek yanıltıcıdır.", label: 'DSCP', type: 'text', optional: true, placeholder: 'ef', hint: 'DSCP eşleştirme değeri (ör: ef, af41)' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_if', why: "ACL arayüze <code>ip access-group</code> ile bağlanmadıkça hiçbir etkisi yoktur. Yönetim arayüzüne kural uygularken kendi IP’nizi izin listesine eklemezseniz oturumunuz anında kopar.", label: 'Uygulanan Interface', type: 'text', optional: true, placeholder: 'Ethernet1/1', hint: 'ACL uygulanacak arayüz (boş bırakılabilir)' },
                        { name: 'direction', why: "Yön yanlış seçilirse kural dönüş trafiğine uygulanır ve beklenen engelleme hiç gerçekleşmez. NX-OS’ta aynı arayüze aynı yönde yalnızca bir ACL bağlanabilir.", label: 'Yön', type: 'select', options: [
                            { value: 'in', label: 'in', selected: true },
                            { value: 'out', label: 'out' }
                        ]}
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxAclGen(data);
        });
    }
};
function cgNxAclGen(data) {
    const aclName = cgEsc(data.acl_name || ''), seq = cgEsc(data.seq || '');
    const action = cgEsc(data.action || 'permit'), proto = cgEsc(data.protocol || 'ip');
    const src = cgEsc(data.src || ''), dst = cgEsc(data.dst || '');
    const dscp = cgEsc(data.dscp || ''), applyIf = cgEsc(data.apply_if || '');
    const direction = cgEsc(data.direction || 'in');
    let c = '! ========================================\n! Cisco NX-OS — ACL\n! ========================================\n\n';
    c += 'ip access-list ' + aclName + '\n';
    c += '  ' + seq + ' ' + action + ' ' + proto + ' ' + src + ' ' + dst;
    if (dscp) c += ' dscp ' + dscp;
    c += '\n  ' + (parseInt(seq) + 10) + ' deny ip any any\n!\n\n';
    if (applyIf) {
        c += 'interface ' + applyIf + '\n  ip access-group ' + aclName + ' ' + direction + '\n!\n\n';
    }
    c += '! Doğrulama:\n! show ip access-lists ' + aclName + '\n! show ip access-lists\n';
    return c;
}

// ── NX-OS: QoS ───────────────────────────────────────────────────────────────
CiscoNXOS.qos = {
    label: 'QoS (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS (NX-OS)',
                desc: 'Nexus QoS — modular policy, class-map, policy-map, service-policy. DSCP eşleştirme ve trafik policing konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Class-Map ve Policy-Map',
                    icon: 'fas fa-layer-group',
                    fields: [
                        { name: 'pol_name', why: "Policy-map adı <code>service-policy</code> satırında referans verilir; ad uyuşmazlığında politika hiç devreye girmez. NX-OS’ta QoS policy-map’leri <code>type qos</code> ile tanımlanmalıdır.", label: 'Policy Adı', type: 'text', required: true, placeholder: 'PM_EGRESS_QOS', hint: 'Policy-map adı' },
                        { name: 'class_name', why: "Class-map policy-map’e eklenmezse tanımı hiçbir işe yaramaz. Sınıf sırası önemlidir: ilk eşleşen sınıf uygulanır ve alttaki sınıflar hiç değerlendirilmez.", label: 'Class Adı', type: 'text', required: true, placeholder: 'CM_VOIP', hint: 'Class-map adı' },
                        { name: 'dscp_match', why: "Eşleşme için trafiğin zaten işaretlenmiş olması gerekir; uçtan gelen işaretlere güvenmek (trust boundary) yanlış yerde kurulursa kullanıcılar kendi trafiğini öncelikli işaretleyebilir.", label: 'DSCP Match', type: 'text', required: true, placeholder: 'ef', hint: 'Eşleştirilecek DSCP değeri (ör: ef, af41, cs3)' },
                        { name: 'dscp_set', why: "Yeniden işaretleme yalnızca bu cihazdan sonrası için geçerlidir; ağın devamındaki cihazlar bu DSCP değerini tanımıyorsa öncelik uçtan uca korunmaz.", label: 'Set DSCP', type: 'select', options: [
                            { value: 'ef', label: 'EF', selected: true },
                            { value: 'af41', label: 'AF41' },
                            { value: 'af31', label: 'AF31' },
                            { value: 'cs3', label: 'CS3' },
                            { value: 'default', label: 'default' }
                        ], hint: 'Atanacak DSCP değeri' },
                        { name: 'police_rate', why: "Policing, limiti aşan paketleri <b>düşürür</b> (shaping gibi kuyruğa almaz); TCP trafiğinde bu ciddi performans kaybına yol açabilir. Limit gerçek ihtiyaca göre ölçülerek belirlenmelidir.", label: 'Police Rate (bps)', type: 'text', optional: true, placeholder: '1000000', hint: 'Policing hız sınırı (bit/sn), boş = policing yok' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'apply_if', why: "QoS politikası <code>service-policy</code> ile arayüze uygulanmadıkça çalışmaz. Bir arayüze aynı yönde tek politika uygulanabilir; yeni uygulama eskisini değiştirir.", label: 'Uygulanan Interface', type: 'text', required: true, placeholder: 'Ethernet1/1', hint: 'QoS policy uygulanacak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxQosGen(data);
        });
    }
};
function cgNxQosGen(data) {
    const polName = cgEsc(data.pol_name || ''), className = cgEsc(data.class_name || '');
    const dscpMatch = cgEsc(data.dscp_match || ''), dscpSet = cgEsc(data.dscp_set || 'ef');
    const policeRate = cgEsc(data.police_rate || ''), applyIf = cgEsc(data.apply_if || '');
    let c = '! ========================================\n! Cisco NX-OS — QoS Policy Map\n! ========================================\n\n';
    c += 'class-map type qos match-all ' + className + '\n  match dscp ' + dscpMatch + '\n!\n\n';
    c += 'policy-map type qos ' + polName + '\n';
    c += '  class ' + className + '\n';
    c += '    set dscp ' + dscpSet + '\n';
    if (policeRate) {
        c += '    police rate ' + policeRate + ' bps bc 1000 ms\n';
        c += '      conform-action transmit\n      violate-action drop\n';
    }
    c += '  !\n!\n\n';
    c += 'interface ' + applyIf + '\n  service-policy type qos output ' + polName + '\n!\n\n';
    c += '! Doğrulama:\n! show policy-map interface ' + applyIf + '\n! show queuing interface ' + applyIf + '\n';
    return c;
}

// ── NX-OS: Syslog ────────────────────────────────────────────────────────────
CiscoNXOS.syslog = {
    label: 'Syslog (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-file-alt',
                title: 'Syslog (NX-OS)',
                desc: 'Nexus logging — severity seviyesi, facility ve uzak syslog sunucusu. Merkezi log yönetimi için UDP/TCP gönderim konfigürasyonu.'
            },
            sections: [
                {
                    title: 'Syslog Konfigürasyonu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'syslog_ip', why: "Uzak syslog tanımlanmazsa loglar yalnızca cihaz belleğinde tutulur ve yeniden başlatmada <b>tamamen kaybolur</b>. Olay incelemesi için merkezi log şarttır.", label: 'Syslog Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.50', hint: 'Uzak syslog sunucu IP adresi' },
                        { name: 'severity', why: "Seviye çok yükseğe (debug) ayarlanırsa log sunucusu ve cihaz CPU’su gereksiz yüklenir; çok düşük ayarlanırsa kritik olaylar hiç kaydedilmez. Üretimde genelde 5-6 tercih edilir.", label: 'Severity', type: 'select', options: [
                            { value: '0', label: '0 - emergencies' },
                            { value: '1', label: '1 - alerts' },
                            { value: '2', label: '2 - critical' },
                            { value: '3', label: '3 - errors' },
                            { value: '4', label: '4 - warnings', selected: true },
                            { value: '5', label: '5 - notifications' },
                            { value: '6', label: '6 - informational' },
                            { value: '7', label: '7 - debugging' }
                        ], hint: 'Seçilen seviye ve üzeri loglar gönderilir' },
                        { name: 'facility', why: "Facility, log sunucusunda mesajların hangi kategoriye düşeceğini belirler; yanlış facility mesajların beklenen dosyaya yazılmamasına ve alarmların çalışmamasına yol açar.", label: 'Facility', type: 'select', options: [
                            { value: 'local0', label: 'local0' },
                            { value: 'local1', label: 'local1' },
                            { value: 'local2', label: 'local2' },
                            { value: 'local3', label: 'local3' },
                            { value: 'local4', label: 'local4', selected: true },
                            { value: 'local5', label: 'local5' },
                            { value: 'local6', label: 'local6' },
                            { value: 'local7', label: 'local7' }
                        ], hint: 'Syslog facility kodu' },
                        { name: 'src_iface', why: "Kaynak arayüz sabitlenmezse log paketleri çıkış arayüzüne göre farklı IP’lerle gider ve log sunucusu aynı cihazı birden çok kaynak gibi görür. Genelde <code>mgmt0</code> veya bir loopback seçilir.", label: 'Source Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'mgmt0', hint: 'Log paketleri için kaynak arayüz' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxSyslogGen(data);
        });
    }
};
function cgNxSyslogGen(data) {
    const syslogIp = cgEsc(data.syslog_ip || ''), severity = cgEsc(data.severity || '4');
    const facility = cgEsc(data.facility || 'local4'), srcIface = cgEsc(data.src_iface || '');
    let c = '! ========================================\n! Cisco NX-OS — Syslog\n! ========================================\n\n';
    c += 'logging server ' + syslogIp + ' ' + severity + ' facility ' + facility + '\n';
    if (srcIface) c += 'logging source-interface ' + srcIface + '\n';
    c += 'logging timestamp milliseconds\n\n';
    c += '! Doğrulama:\n! show logging server\n! show logging last 100\n';
    return c;
}

// ── NX-OS: NTP ───────────────────────────────────────────────────────────────
CiscoNXOS.ntp = {
    label: 'NTP (NX-OS)',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-clock',
                title: 'NTP (NX-OS)',
                desc: 'Nexus NTP — zaman senkronizasyonu, authentication key, prefer server. Doğru zaman damgası log ve sertifika güvenilirliği için kritiktir.'
            },
            sections: [
                {
                    title: 'NTP Server Ayarları',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'ntp_ip', why: "NTP sunucusu <code>management</code> VRF’indeyse komutun sonuna <code>use-vrf management</code> eklenmelidir; aksi halde istek varsayılan VRF’ten çıkar ve hiç ulaşmaz. Saat kayması log korelasyonunu ve sertifika doğrulamayı bozar.", label: 'NTP Server IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.1', hint: 'Birincil NTP sunucu IP adresi' },
                        { name: 'prefer', why: "Prefer, birden çok sunucu arasında tercih edileni belirler. Tek sunucuya bağımlı kalmak, o sunucu bozuk saat yayınladığında tüm cihazların yanlış zamana kaymasına yol açar.", label: 'Prefer?', type: 'select', options: [
                            { value: 'yes', label: 'Evet', selected: true },
                            { value: 'no', label: 'Hayır' }
                        ], hint: 'Prefer ile bu sunucu öncelikli seçilir' },
                        { name: 'ntp_ip2', why: "İkinci sunucu tanımlamak tek arıza noktasını kaldırır. Ayrıca iki sunucu birbirinden çok farklı zaman verirse NTP hangisinin doğru olduğuna karar veremez — üç sunucu en sağlıklısıdır.", label: 'Yedek NTP Server', type: 'text', validate: 'ip', optional: true, placeholder: '10.0.0.2', hint: 'İkincil NTP sunucu IP adresi' },
                        { name: 'src_iface', why: "NTP paketlerinin kaynağı sabitlenmezse sunucu tarafındaki erişim listeleri (restrict) isteği reddedebilir. Sabit bir loopback veya <code>mgmt0</code> kullanmak senkronizasyonu öngörülebilir kılar.", label: 'Source Interface', type: 'text', validate: 'iface', optional: true, placeholder: 'mgmt0', hint: 'NTP paketleri için kaynak arayüz' }
                    ]
                },
                {
                    title: 'Saat Dilimi Ayarları',
                    icon: 'fas fa-globe',
                    fields: [
                        { name: 'timezone', why: "Saat dilimi cihazda görüntülenen zamanı etkiler ama loglar genelde UTC ile korelasyon yapılır. Farklı cihazlarda farklı zaman dilimi kullanmak olay incelemesini son derece zorlaştırır.", label: 'Timezone', type: 'text', required: true, placeholder: 'Turkey', hint: 'Saat dilimi adı (ör: Turkey, UTC, CET)' },
                        { name: 'utc_offset', why: "Offset yanlış girilirse tüm log zaman damgaları kayar ve diğer sistemlerle korelasyon imkansız hale gelir. Yaz saati uygulaması varsa ayrıca <code>clock summer-time</code> tanımlanmalıdır.", label: 'UTC Offset Saatleri', type: 'text', required: true, placeholder: '3', hint: 'UTC farkı (ör: Türkiye için 3)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        }, (data) => {
            return cgNxNtpGen(data);
        });
    }
};
function cgNxNtpGen(data) {
    const ntpIp = cgEsc(data.ntp_ip || ''), prefer = cgEsc(data.prefer || 'yes');
    const srcIface = cgEsc(data.src_iface || '');
    const timezone = cgEsc(data.timezone || ''), utcOffset = cgEsc(data.utc_offset || '');
    const ntpIp2 = cgEsc(data.ntp_ip2 || '');
    let c = '! ========================================\n! Cisco NX-OS — NTP\n! ========================================\n\n';
    c += 'ntp server ' + ntpIp;
    if (prefer === 'yes') c += ' prefer';
    if (srcIface) c += ' use-vrf management';
    c += '\n';
    if (ntpIp2) {
        c += 'ntp server ' + ntpIp2;
        if (srcIface) c += ' use-vrf management';
        c += '\n';
    }
    if (srcIface) c += 'ntp source-interface ' + srcIface + '\n';
    c += '\nclock timezone ' + timezone + ' ' + utcOffset + ' 0\n\n';
    c += '! Doğrulama:\n! show ntp status\n! show ntp peers\n! show clock detail\n';
    return c;
}

// ════════════════════════════════════════════════════════════════════════════
// Yeni araçlar — temel L2/L3 ve yönetim düzlemi
// ════════════════════════════════════════════════════════════════════════════

// Ortak yardımcılar (yalnız bu dosyada kullanılır)
function cgNxList(s) { return String(s || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean); }
function cgNxHdr(t) { return '! ========================================\n! Cisco NX-OS — ' + t + '\n! ========================================\n\n'; }

// ── NX-OS: Feature Yönetimi ──────────────────────────────────────────────────
// Sözdizimi: canlı config (14 cihaz: feature scheduler/lldp/lacp/interface-vlan 14, vpc 13, scp-server 11,
//   private-vlan 9, bash-shell 7, ssh 4, ntp 4, vrrp 3, netflow 3, sftp-server 1, dhcp 1;
//   no feature telnet 4, no feature nxapi 4, no feature bash-shell 2)
// feature hsrp/ospf/bgp: bu dosyadaki mevcut araçlar; feature tacacs+:
//   https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/security/cisco-nexus-9000-nx-os-security-configuration-guide-103x/m-configuring-tacacs.html
CiscoNXOS.features = {
    label: 'Feature Yönetimi',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-puzzle-piece', title: 'Feature Yönetimi (NX-OS)', desc: 'NX-OS’ta her protokol/servis <code>feature</code> komutuyla açılmadan ilgili komutlar <b>kabul edilmez</b>. Kullanılmayan servisleri (telnet, bash-shell, NX-API) kapatmak saldırı yüzeyini küçültür.' },
            sections: [
                {
                    title: 'L2 / Arayüz', icon: 'fas fa-network-wired',
                    fields: [
                        { name: 'f_ifvlan', why: 'SVI (interface VlanX) oluşturmak için şarttır; kapalıyken interface Vlan komutu reddedilir.', label: 'interface-vlan (SVI)', type: 'checkbox', checked: true },
                        { name: 'f_lacp', why: 'channel-group ... mode active için gereklidir; kapalıyken LACP port-channel kurulamaz.', label: 'lacp', type: 'checkbox', checked: true },
                        { name: 'f_vpc', label: 'vpc', type: 'checkbox', checked: false },
                        { name: 'f_lldp', label: 'lldp', type: 'checkbox', checked: true },
                        { name: 'f_pvlan', label: 'private-vlan', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'L3 / Yedeklilik', icon: 'fas fa-route',
                    fields: [
                        { name: 'f_hsrp', label: 'hsrp', type: 'checkbox', checked: false },
                        { name: 'f_vrrp', label: 'vrrp', type: 'checkbox', checked: false },
                        { name: 'f_ospf', label: 'ospf', type: 'checkbox', checked: false },
                        { name: 'f_bgp', label: 'bgp', type: 'checkbox', checked: false },
                        { name: 'f_dhcp', why: 'DHCP relay (ip dhcp relay address) ve DHCP snooping için gereklidir.', label: 'dhcp', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Yönetim Servisleri', icon: 'fas fa-tools',
                    fields: [
                        { name: 'f_sched', why: 'Otomatik config yedeği (scheduler job) için gereklidir.', label: 'scheduler', type: 'checkbox', checked: true },
                        { name: 'f_ssh', label: 'ssh', type: 'checkbox', checked: true },
                        { name: 'f_scp', why: 'Cihaza SCP ile dosya (imaj, config) kopyalanmasına izin verir; yalnız ihtiyaç varsa açın.', label: 'scp-server', type: 'checkbox', checked: false },
                        { name: 'f_sftp', label: 'sftp-server', type: 'checkbox', checked: false },
                        { name: 'f_ntp', label: 'ntp', type: 'checkbox', checked: false },
                        { name: 'f_tacacs', label: 'tacacs+', type: 'checkbox', checked: false },
                        { name: 'f_netflow', label: 'netflow', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Kapatılacak Servisler (Sıkılaştırma)', icon: 'fas fa-ban',
                    warn: 'NX-API veya bash-shell’i otomasyon araçlarınız (Ansible nxapi bağlantısı, betikler) kullanıyorsa kapatmadan önce kontrol edin.',
                    fields: [
                        { name: 'x_telnet', why: 'Telnet parolaları açık metin taşır; yönetim yalnız SSH ile yapılmalıdır.', label: 'no feature telnet', type: 'checkbox', checked: true },
                        { name: 'x_bash', why: 'bash-shell, NX-OS CLI yetkilendirmesini (RBAC) atlayan bir Linux kabuğu açar.', label: 'no feature bash-shell', type: 'checkbox', checked: true },
                        { name: 'x_nxapi', label: 'no feature nxapi', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Feature Listesi Oluştur'
        }, (data) => {
            const on = [['f_ifvlan', 'interface-vlan'], ['f_lacp', 'lacp'], ['f_vpc', 'vpc'], ['f_lldp', 'lldp'], ['f_pvlan', 'private-vlan'],
                ['f_hsrp', 'hsrp'], ['f_vrrp', 'vrrp'], ['f_ospf', 'ospf'], ['f_bgp', 'bgp'], ['f_dhcp', 'dhcp'],
                ['f_sched', 'scheduler'], ['f_ssh', 'ssh'], ['f_scp', 'scp-server'], ['f_sftp', 'sftp-server'], ['f_ntp', 'ntp'],
                ['f_tacacs', 'tacacs+'], ['f_netflow', 'netflow']];
            const off = [['x_telnet', 'telnet'], ['x_bash', 'bash-shell'], ['x_nxapi', 'nxapi']];
            let c = cgNxHdr('Feature Yönetimi');
            let n = 0;
            on.forEach(([k, f]) => { if (data[k]) { c += 'feature ' + f + '\n'; n++; } });
            off.forEach(([k, f]) => { if (data[k]) { c += 'no feature ' + f + '\n'; n++; } });
            if (!n) c += '! Hiçbir feature seçilmedi.\n';
            c += '\n! Doğrulama:\n! show feature\n! show running-config | include feature\n';
            return c;
        });
    }
};

// ── NX-OS: Temel Sistem ──────────────────────────────────────────────────────
// Sözdizimi: canlı config (hostname 14, ip domain-lookup 14 / no ip domain-lookup 6, ip domain-name 12,
//   ip name-server 2, system jumbomtu 10, cli alias name wr copy running-config startup-config 6 cihaz)
// ip name-server ... use-vrf: https://github.com/ipspace/netlab/blob/dev/netsim/ansible/templates/services/nxos.j2
CiscoNXOS.system = {
    label: 'Temel Sistem',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-server', title: 'Temel Sistem (NX-OS)', desc: 'Hostname, DNS, jumbo MTU ve kısa komut takma adı. Yeni kurulan bir Nexus’un ilk satırları.' },
            sections: [
                {
                    title: 'Kimlik ve DNS', icon: 'fas fa-id-card',
                    fields: [
                        { name: 'hostname', why: 'Hostname log, SNMP ve yedek dosya adlarında ($(SWITCHNAME)) kullanılır; aynı adlı iki cihaz yedeklerin birbirinin üzerine yazılmasına yol açar.', label: 'Hostname', type: 'text', validate: 'hostname', required: true, placeholder: 'CORE-SW1' },
                        { name: 'domain', label: 'Domain Adı', type: 'text', placeholder: 'example.com', hint: 'ip domain-name' },
                        { name: 'lookup', why: 'DNS sunucusu yokken domain-lookup açık kalırsa yanlış yazılan her komut bir DNS sorgusu gibi yorumlanıp CLI’yi saniyelerce bekletir.', label: 'DNS Sorgusu', type: 'select', options: [
                            { value: 'keep', label: 'Değiştirme', selected: true },
                            { value: 'on', label: 'Açık — ip domain-lookup' },
                            { value: 'off', label: 'Kapalı — no ip domain-lookup' }
                        ]},
                        { name: 'dns1', label: 'DNS Sunucusu 1', type: 'text', validate: 'ip', placeholder: '192.0.2.53' },
                        { name: 'dns2', label: 'DNS Sunucusu 2', type: 'text', validate: 'ip', placeholder: '192.0.2.54' },
                        { name: 'dns_vrf', why: 'DNS sunucusuna yalnız mgmt0 üzerinden ulaşılıyorsa sorgu management VRF’inden çıkmalıdır; aksi halde varsayılan VRF’te yol bulunamaz ve çözümleme sessizce başarısız olur.', label: 'DNS VRF', type: 'text', placeholder: 'management', hint: 'Boş = varsayılan VRF' }
                    ]
                },
                {
                    title: 'Diğer', icon: 'fas fa-cog',
                    fields: [
                        { name: 'jumbo', why: 'Arayüzlere 1500 üstü MTU verebilmek için sistem jumbo MTU üst sınırını belirler. Arayüz MTU’su bu değeri aşamaz.', label: 'system jumbomtu', type: 'text', min: 1500, max: 9216, placeholder: '9216', hint: 'Boş = dokunma' },
                        { name: 'alias_wr', label: '"wr" takma adı (cli alias name wr copy running-config startup-config)', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Sistem Konfigürasyonu Oluştur'
        }, (data) => {
            const h = cgEsc(data.hostname || ''), dom = cgEsc(data.domain || '');
            const d1 = cgEsc(data.dns1 || ''), d2 = cgEsc(data.dns2 || ''), dv = cgEsc(data.dns_vrf || ''), j = cgEsc(data.jumbo || '');
            let c = cgNxHdr('Temel Sistem');
            c += 'hostname ' + h + '\n';
            if (data.lookup === 'on') c += 'ip domain-lookup\n'; else if (data.lookup === 'off') c += 'no ip domain-lookup\n';
            if (dom) c += 'ip domain-name ' + dom + '\n';
            const ns = [d1, d2].filter(Boolean);
            if (ns.length) c += 'ip name-server ' + ns.join(' ') + (dv ? ' use-vrf ' + dv : '') + '\n';
            if (j) c += 'system jumbomtu ' + j + '\n';
            if (data.alias_wr) c += 'cli alias name wr copy running-config startup-config\n';
            c += '\n! Doğrulama:\n! show hostname\n! show hosts\n! show running-config | include jumbomtu\n';
            return c;
        });
    }
};

// ── NX-OS: VLAN ──────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (vlan N / name X: 11 cihaz, 764 satır)
CiscoNXOS.vlan = {
    label: 'VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-tags', title: 'VLAN (NX-OS)', desc: 'VLAN oluşturma ve adlandırma. SVI için <b>Arayüz</b> aracındaki SVI tipini, private VLAN için <b>Private VLAN</b> aracını kullanın.' },
            sections: [
                {
                    title: 'VLAN Listesi', icon: 'fas fa-list',
                    fields: [
                        { name: 'vlan_rows', why: 'VLAN adı, trunk ve SNMP çıktılarında VLAN’ın ne olduğunu gösteren tek bilgidir. NX-OS varsayılan olarak 3968–4094 aralığını iç kullanıma ayırır; bu aralıkta VLAN oluşturulamaz.', label: 'VLAN’lar', type: 'textarea', required: true, placeholder: '10 USERS\n20 SERVERS', hint: 'Her satır: VLAN-ID ve ad (ad boşluksuz). Ad boş bırakılabilir.' }
                    ]
                }
            ],
            submit: 'VLAN Konfigürasyonu Oluştur'
        }, (data) => {
            let c = cgNxHdr('VLAN');
            const ids = [];
            String(data.vlan_rows || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
                const m = l.match(/^(\d{1,4})(?:\s+(\S+))?\s*$/);
                const id = m ? parseInt(m[1], 10) : 0;
                if (!m || id < 1 || id > 4094) { c += '! UYARI: geçersiz satır atlandı: ' + cgEsc(l) + '\n'; return; }
                ids.push(id);
                c += 'vlan ' + id + '\n';
                if (m[2] && id !== 1) c += '  name ' + cgEsc(m[2]) + '\n';
            });
            c += '\n! Doğrulama:\n! show vlan brief\n';
            if (ids.length) c += '! show vlan id ' + ids[0] + '\n';
            return c;
        });
    }
};

// ── NX-OS: Arayüz (L2 access/trunk, L3 routed, SVI) ──────────────────────────
// Sözdizimi: canlı config (interface Ethernet/port-channel: description 11, mtu 11, switchport access vlan 11,
//   switchport mode trunk 10, switchport trunk allowed vlan 7, switchport trunk native vlan 6, channel-group N mode active 9,
//   spanning-tree port type edge/edge trunk/network, spanning-tree bpduguard enable, shutdown/no shutdown;
//   interface Vlan: no ip redirects / no ipv6 redirects 10, mtu 8; vrf member 11)
CiscoNXOS.interface = {
    label: 'Arayüz',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-ethernet', title: 'Arayüz (NX-OS)', desc: 'Fiziksel port ve port-channel için L2 access/trunk veya L3 routed ayarı; SVI (interface Vlan) oluşturma. Nexus portları platforma göre varsayılan olarak L2 veya L3 gelir; araç modu açıkça yazar.' },
            configTypes: [
                { id: 'access', label: 'L2 Access', icon: 'fas fa-desktop', desc: 'Tek VLAN, sunucu/uç cihaz portu', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'trunk', label: 'L2 Trunk', icon: 'fas fa-stream', desc: 'Çoklu VLAN, switch/hipervizör bağlantısı' },
                { id: 'routed', label: 'L3 Routed', icon: 'fas fa-route', desc: 'no switchport + IP adresi' },
                { id: 'svi', label: 'SVI (interface Vlan)', icon: 'fas fa-layer-group', desc: 'VLAN gateway arayüzü' }
            ],
            sections: [
                {
                    title: 'Port', icon: 'fas fa-plug', showFor: ['access', 'trunk', 'routed'],
                    fields: [
                        { name: 'if_names', why: 'Aynı ayar listedeki her arayüze ayrı ayrı yazılır. Adı NX-OS biçiminde girin (Ethernet1/1, port-channel10); yanlış yazılan arayüz adı komut satırında reddedilir.', label: 'Arayüz(ler)', type: 'text', validate: 'iface_range', required: true, placeholder: 'Ethernet1/1', hint: 'Virgülle liste, örn: Ethernet1/1,Ethernet1/2' },
                        { name: 'if_desc', label: 'Açıklama', type: 'text', placeholder: 'SRV01-NIC1' },
                        { name: 'if_mtu', why: 'Jumbo frame (vMotion, iSCSI, NFS) için yolun tamamında aynı MTU gerekir; bir cihazda eksik kalırsa büyük paketler sessizce düşer. Önce system jumbomtu ayarlı olmalıdır.', label: 'MTU', type: 'text', min: 576, max: 9216, placeholder: '9216', hint: 'Boş = varsayılan' },
                        { name: 'if_state', label: 'Durum', type: 'select', options: [
                            { value: 'up', label: 'Açık — no shutdown', selected: true },
                            { value: 'down', label: 'Kapalı — shutdown' }
                        ]}
                    ]
                },
                {
                    title: 'Access Ayarları', icon: 'fas fa-desktop', showFor: ['access'],
                    fields: [
                        { name: 'acc_vlan', why: 'Access VLAN yoksa (oluşturulmamışsa) port VLAN’sız kalır ve trafik geçmez; önce VLAN aracıyla VLAN’ı oluşturun.', label: 'Access VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '10' },
                        { name: 'acc_edge', why: 'Edge port STP’de beklemeden forwarding’e geçer; sunucu portlarında DHCP/PXE zaman aşımlarını önler. Switch bağlanan porta edge vermek döngü riskidir.', label: 'STP Port Tipi', type: 'select', options: [
                            { value: 'edge', label: 'edge (uç cihaz)', selected: true },
                            { value: 'none', label: 'Değiştirme' }
                        ]},
                        { name: 'acc_bpdug', why: 'Edge porta yanlışlıkla bir switch takılırsa BPDU guard portu err-disable yapar ve döngüyü engeller.', label: 'spanning-tree bpduguard enable', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'Trunk Ayarları', icon: 'fas fa-stream', showFor: ['trunk'],
                    fields: [
                        { name: 'tr_allowed', why: 'İzin verilen VLAN listesi yazılmazsa trunk tüm VLAN’ları taşır; gereksiz yayın trafiği ve STP kapsamı büyür. Listeyi iki uçta aynı tutun.', label: 'İzinli VLAN’lar', type: 'text', validate: 'vlan_list', required: true, placeholder: '10,20,30-40' },
                        { name: 'tr_native', why: 'Native VLAN iki uçta farklıysa etiketsiz trafik yanlış VLAN’a karışır (VLAN sızıntısı).', label: 'Native VLAN', type: 'text', validate: 'vlan', placeholder: '1', hint: 'Boş = varsayılan (1)' },
                        { name: 'tr_ptype', why: '<b>network</b> tipi Bridge Assurance’ı açar: karşı uç BPDU göndermezse port bloklanır, bu yüzden yalnız iki ucu da NX-OS olan switch bağlantılarında kullanın. <b>edge trunk</b> hipervizör/sunucu trunk’ları içindir.', label: 'STP Port Tipi', type: 'select', options: [
                            { value: 'none', label: 'Değiştirme', selected: true },
                            { value: 'edge trunk', label: 'edge trunk (hipervizör/sunucu)' },
                            { value: 'network', label: 'network (switch-switch)' }
                        ]}
                    ]
                },
                {
                    title: 'Port-Channel Üyeliği', icon: 'fas fa-link', showFor: ['access', 'trunk'],
                    info: 'Doldurulursa önce <code>interface port-channelN</code> aynı L2 ayarlarıyla yazılır, sonra üye portlara <code>channel-group N mode active</code> eklenir. <code>feature lacp</code> açık olmalıdır.',
                    fields: [
                        { name: 'chan_grp', why: 'Üye portların L2 ayarları port-channel ile birebir aynı olmalıdır; farklıysa üye port suspend edilir.', label: 'Port-Channel No', type: 'text', min: 1, max: 4096, placeholder: '10', hint: 'Boş = port-channel yok' }
                    ]
                },
                {
                    title: 'L3 Ayarları', icon: 'fas fa-route', showFor: ['routed'],
                    fields: [
                        { name: 'rt_ip', label: 'IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '10.0.0.1/30' },
                        { name: 'rt_vrf', why: 'vrf member komutu arayüzdeki IP adresini siler; bu yüzden araç önce vrf member, sonra ip address yazar.', label: 'VRF', type: 'text', placeholder: 'TENANT-A', hint: 'Boş = varsayılan VRF' },
                        { name: 'rt_noredir', why: 'ICMP redirect üretimi CPU’ya yük bindirir ve saldırgana topoloji bilgisi verir.', label: 'no ip redirects', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'SVI Ayarları', icon: 'fas fa-layer-group', showFor: ['svi'],
                    info: 'SVI için <code>feature interface-vlan</code> gereklidir; araç bu satırı ekler.',
                    fields: [
                        { name: 'svi_vlan', label: 'VLAN ID', type: 'text', validate: 'vlan', required: true, placeholder: '10' },
                        { name: 'svi_ip', why: 'Bu adres VLAN’daki cihazların varsayılan ağ geçididir. vPC/HSRP çiftinde her switch farklı fiziksel IP almalıdır.', label: 'IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '198.51.100.2/24' },
                        { name: 'svi_desc', label: 'Açıklama', type: 'text', placeholder: 'USERS-GW' },
                        { name: 'svi_mtu', label: 'MTU', type: 'text', min: 576, max: 9216, placeholder: '9216', hint: 'Boş = varsayılan' },
                        { name: 'svi_vrf', label: 'VRF', type: 'text', placeholder: 'TENANT-A', hint: 'Boş = varsayılan VRF' },
                        { name: 'svi_noredir', why: 'vPC ortamında Cisco SVI’larda redirect’in kapatılmasını önerir; aksi halde peer-link üzerinden gelen paketler için gereksiz ICMP redirect üretilir.', label: 'no ip redirects + no ipv6 redirects', type: 'checkbox', checked: true }
                    ]
                }
            ],
            submit: 'Arayüz Konfigürasyonu Oluştur'
        }, (data) => {
            const ty = data._cgtype || 'access';
            let c = cgNxHdr('Arayüz');
            if (ty === 'svi') {
                const v = cgEsc(data.svi_vlan || ''), ip = cgEsc(data.svi_ip || ''), ds = cgEsc(data.svi_desc || ''), mtu = cgEsc(data.svi_mtu || ''), vrf = cgEsc(data.svi_vrf || '');
                c += 'feature interface-vlan\n\n';
                c += 'interface Vlan' + v + '\n';
                if (ds) c += '  description ' + ds + '\n';
                if (mtu) c += '  mtu ' + mtu + '\n';
                if (vrf) c += '  vrf member ' + vrf + '\n';
                if (data.svi_noredir) c += '  no ip redirects\n';
                c += '  ip address ' + ip + '\n';
                if (data.svi_noredir) c += '  no ipv6 redirects\n';
                c += '  no shutdown\n\n';
                c += '! Doğrulama:\n! show interface Vlan' + v + '\n! show ip interface brief' + (vrf ? ' vrf ' + vrf : '') + '\n';
                return c;
            }
            const ifs = cgNxList(cgEsc(data.if_names || ''));
            const ds = cgEsc(data.if_desc || ''), mtu = cgEsc(data.if_mtu || '');
            const st = data.if_state === 'down' ? '  shutdown\n' : '  no shutdown\n';
            let l2 = '';
            if (ty === 'access') {
                l2 = '  switchport\n  switchport mode access\n  switchport access vlan ' + cgEsc(data.acc_vlan || '') + '\n';
                if (data.acc_edge === 'edge') l2 += '  spanning-tree port type edge\n';
                if (data.acc_bpdug) l2 += '  spanning-tree bpduguard enable\n';
            } else if (ty === 'trunk') {
                l2 = '  switchport\n  switchport mode trunk\n';
                if (data.tr_native) l2 += '  switchport trunk native vlan ' + cgEsc(data.tr_native) + '\n';
                l2 += '  switchport trunk allowed vlan ' + cgEsc(data.tr_allowed || '') + '\n';
                if (data.tr_ptype && data.tr_ptype !== 'none') l2 += '  spanning-tree port type ' + cgEsc(data.tr_ptype) + '\n';
            }
            if (ty === 'routed') {
                const ip = cgEsc(data.rt_ip || ''), vrf = cgEsc(data.rt_vrf || '');
                if (ifs.length > 1) c += '! UYARI: aynı IP birden çok arayüze yazılamaz; yalnız ilk arayüz yapılandırıldı.\n';
                const i = ifs[0] || '';
                c += 'interface ' + i + '\n';
                if (ds) c += '  description ' + ds + '\n';
                c += '  no switchport\n';
                if (mtu) c += '  mtu ' + mtu + '\n';
                if (vrf) c += '  vrf member ' + vrf + '\n';
                if (data.rt_noredir) c += '  no ip redirects\n';
                c += '  ip address ' + ip + '\n' + st + '\n';
                c += '! Doğrulama:\n! show interface ' + i + '\n! show ip interface brief' + (vrf ? ' vrf ' + vrf : '') + '\n';
                return c;
            }
            const po = cgEsc(data.chan_grp || '');
            if (po) {
                c += 'feature lacp\n\n';
                c += 'interface port-channel' + po + '\n';
                if (ds) c += '  description ' + ds + '\n';
                c += l2;
                if (mtu) c += '  mtu ' + mtu + '\n';
                c += st + '\n';
            }
            ifs.forEach(i => {
                c += 'interface ' + i + '\n';
                if (ds) c += '  description ' + ds + '\n';
                c += l2;
                if (mtu) c += '  mtu ' + mtu + '\n';
                if (po) c += '  channel-group ' + po + ' mode active\n';
                c += st + '\n';
            });
            c += '! Doğrulama:\n! show interface status\n! show interface switchport\n';
            if (po) c += '! show port-channel summary\n';
            return c;
        });
    }
};

// ── NX-OS: SNMP ──────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (snmp-server user X <rol> auth md5|sha|sha-256 ... priv aes-128 ...: 14 cihaz;
//   community X group network-operator 3; host IP traps version 3 priv USER udp-port N 1; location 8; globalEnforcePriv 3;
//   enable traps link/bridge/stpx/snmp authentication/config ccmCLIRunningConfigChanged/aaa server-state-change 5)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/system-management/cisco-nexus-9000-series-nx-os-system-management-configuration-guide-103x/m-configuring-snmp-10x.html
//   (host ... version 2c, host ... use-vrf, source-interface traps, contact, community ... use-ipv4acl, enable traps link linkDown/linkUp)
CiscoNXOS.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-chart-line', title: 'SNMP (NX-OS)', desc: 'SNMPv3 kullanıcı veya v2c community, trap alıcısı ve trap türleri. NX-OS’ta SNMP kullanıcısı bir <b>rol</b> (network-operator/network-admin) ile tanımlanır.' },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Kimlik doğrulama + şifreleme', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v2c', label: 'SNMPv2c', icon: 'fas fa-unlock', desc: 'Community tabanlı, açık metin' }
            ],
            sections: [
                {
                    title: 'SNMPv3 Kullanıcı', icon: 'fas fa-user-lock', showFor: ['v3'],
                    fields: [
                        { name: 'v3_user', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'nmsuser' },
                        { name: 'v3_role', why: 'network-admin rolündeki SNMP kullanıcısı SNMP SET ile config değiştirebilir. İzleme için network-operator yeterlidir.', label: 'Rol', type: 'select', options: [
                            { value: 'network-operator', label: 'network-operator (salt okuma)', selected: true },
                            { value: 'network-admin', label: 'network-admin (okuma/yazma)' }
                        ]},
                        { name: 'v3_auth', why: 'MD5 zayıf kabul edilir; NMS destekliyorsa sha-256 seçin. İki tarafta algoritma aynı olmalıdır.', label: 'Auth Algoritması', type: 'select', options: [
                            { value: 'sha', label: 'SHA', selected: true },
                            { value: 'sha-256', label: 'SHA-256' },
                            { value: 'md5', label: 'MD5 (eski NMS)' }
                        ]},
                        { name: 'v3_authpw', label: 'Auth Parolası', type: 'text', required: true, placeholder: 'AuthPass123!', hint: 'En az 8 karakter' },
                        { name: 'v3_privpw', why: 'Priv parolası verilmezse SNMP sorguları şifrelenmeden gider; aşağıdaki globalEnforcePriv açıkken şifresiz istekler reddedilir.', label: 'Priv (AES-128) Parolası', type: 'text', required: true, placeholder: 'PrivPass123!' },
                        { name: 'v3_enforce', label: 'Şifrelemeyi zorunlu kıl (snmp-server globalEnforcePriv)', type: 'checkbox', checked: true }
                    ]
                },
                {
                    title: 'SNMPv2c Community', icon: 'fas fa-users', showFor: ['v2c'],
                    warn: 'v2c community ağda açık metin gider. Mümkünse v3 kullanın; v2c zorunluysa community’yi bir ACL ile NMS adresine sınırlayın.',
                    fields: [
                        { name: 'v2_comm', why: '"public"/"private" gibi varsayılan değerler taramalarda ilk denenenlerdir.', label: 'Community', type: 'text', required: true, placeholder: 'n0tPubl1c' },
                        { name: 'v2_group', label: 'Grup (rol)', type: 'select', options: [
                            { value: 'network-operator', label: 'network-operator (salt okuma)', selected: true },
                            { value: 'network-admin', label: 'network-admin (okuma/yazma)' }
                        ]},
                        { name: 'v2_acl', why: 'ACL bağlanmazsa community’yi bilen her adres cihazı sorgulayabilir. ACL ayrıca ip access-list ile tanımlanmalıdır.', label: 'IPv4 ACL Adı', type: 'text', placeholder: 'ACL_SNMP', hint: 'Boş = ACL yok' }
                    ]
                },
                {
                    title: 'Trap Alıcısı', icon: 'fas fa-bell',
                    fields: [
                        { name: 'host_ip', label: 'NMS IP', type: 'text', validate: 'ip', placeholder: '192.0.2.50', hint: 'Boş = trap alıcısı yok' },
                        { name: 'host_port', label: 'UDP Port', type: 'text', validate: 'port', placeholder: '162', hint: 'Boş = 162' },
                        { name: 'host_vrf', why: 'NMS’e yalnız mgmt0 üzerinden ulaşılıyorsa trap management VRF’inden gönderilmelidir; aksi halde trap’ler varsayılan VRF’te yol bulamaz.', label: 'VRF', type: 'text', placeholder: 'management', hint: 'Boş = varsayılan VRF' },
                        { name: 'src_if', why: 'Kaynak arayüz sabitlenmezse NMS aynı cihazdan farklı IP’lerle trap alır ve cihazı tanıyamaz.', label: 'Trap Kaynak Arayüzü', type: 'text', validate: 'iface', placeholder: 'mgmt0' }
                    ]
                },
                {
                    title: 'Cihaz Bilgisi ve Trap Türleri', icon: 'fas fa-info-circle',
                    fields: [
                        { name: 'location', label: 'Konum', type: 'text', placeholder: 'DC1-ROW3-RACK12' },
                        { name: 'contact', label: 'İletişim', type: 'text', placeholder: 'noc@example.com' },
                        { name: 't_link', label: 'Link up/down (link linkDown / linkUp)', type: 'checkbox', checked: true },
                        { name: 't_bridge', label: 'STP root / topoloji değişimi (bridge newroot / topologychange)', type: 'checkbox', checked: true },
                        { name: 't_stpx', label: 'STP tutarsızlık (stpx inconsistency / root- / loop-inconsistency)', type: 'checkbox', checked: false },
                        { name: 't_auth', why: 'Yanlış community/kullanıcıyla yapılan sorguları bildirir; tarama girişimlerini fark etmenin en kolay yoludur.', label: 'SNMP kimlik doğrulama hatası (snmp authentication)', type: 'checkbox', checked: true },
                        { name: 't_cfg', label: 'Running-config değişikliği (config ccmCLIRunningConfigChanged)', type: 'checkbox', checked: false },
                        { name: 't_aaa', label: 'AAA sunucu durum değişimi (aaa server-state-change)', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'SNMP Konfigürasyonu Oluştur'
        }, (data) => {
            const ty = data._cgtype || 'v3';
            const hip = cgEsc(data.host_ip || ''), hport = cgEsc(data.host_port || ''), hvrf = cgEsc(data.host_vrf || ''), sif = cgEsc(data.src_if || '');
            const loc = cgEsc(data.location || ''), con = cgEsc(data.contact || '');
            let c = cgNxHdr('SNMP');
            let who = '';
            if (ty === 'v3') {
                const u = cgEsc(data.v3_user || '');
                who = u;
                c += 'snmp-server user ' + u + ' ' + cgEsc(data.v3_role || 'network-operator') + ' auth ' + cgEsc(data.v3_auth || 'sha') + ' ' + cgEsc(data.v3_authpw || '') + ' priv aes-128 ' + cgEsc(data.v3_privpw || '') + '\n';
                if (data.v3_enforce) c += 'snmp-server globalEnforcePriv\n';
            } else {
                const cm = cgEsc(data.v2_comm || ''), acl = cgEsc(data.v2_acl || '');
                who = cm;
                c += 'snmp-server community ' + cm + ' group ' + cgEsc(data.v2_group || 'network-operator') + '\n';
                if (acl) c += 'snmp-server community ' + cm + ' use-ipv4acl ' + acl + '\n';
            }
            if (loc) c += 'snmp-server location ' + loc + '\n';
            if (con) c += 'snmp-server contact ' + con + '\n';
            if (hip) {
                c += 'snmp-server host ' + hip + ' traps version ' + (ty === 'v3' ? '3 priv ' : '2c ') + who + (hport ? ' udp-port ' + hport : '') + '\n';
                if (hvrf) c += 'snmp-server host ' + hip + ' use-vrf ' + hvrf + '\n';
            }
            if (sif) c += 'snmp-server source-interface traps ' + sif + '\n';
            const tr = [];
            if (data.t_link) tr.push('link linkDown', 'link linkUp');
            if (data.t_bridge) tr.push('bridge newroot', 'bridge topologychange');
            if (data.t_stpx) tr.push('stpx inconsistency', 'stpx root-inconsistency', 'stpx loop-inconsistency');
            if (data.t_auth) tr.push('snmp authentication');
            if (data.t_cfg) tr.push('config ccmCLIRunningConfigChanged');
            if (data.t_aaa) tr.push('aaa server-state-change');
            tr.forEach(t => { c += 'snmp-server enable traps ' + t + '\n'; });
            c += '\n! Doğrulama:\n! show snmp user\n! show snmp community\n! show snmp host\n! show running-config snmp\n';
            return c;
        });
    }
};

// ── NX-OS: Statik Rota ───────────────────────────────────────────────────────
// Sözdizimi: canlı config (ip route P/L NH: 14 cihaz; ip route ... name X [pref]: 3; vrf context X / '  ip route': 1)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/Unicast-routing/cisco-nexus-9000-series-nx-os-unicast-routing-configuration-guide-release-102x/m_configuring_static_routing.html
//   (ip route prefix nexthop [name X] [tag N] [preference]; Null0: netlab routing/nxos/static.j2)
CiscoNXOS.staticRoute = {
    label: 'Statik Rota',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-directions', title: 'Statik Rota (NX-OS)', desc: 'Varsayılan veya VRF içinde statik rota. NX-OS prefix’i <b>CIDR</b> biçiminde ister (0.0.0.0/0). VRF rotaları <code>vrf context</code> altında yazılır.' },
            sections: [
                {
                    title: 'Rota', icon: 'fas fa-route',
                    fields: [
                        { name: 'sr_prefix', label: 'Hedef Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '0.0.0.0/0' },
                        { name: 'sr_nh', why: 'Next-hop doğrudan bağlı bir alt ağda olmalıdır; ulaşılamayan next-hop ile rota tabloya hiç girmez. Null0 trafiği sessizce atar (özetleme/kara delik rotası).', label: 'Next-hop', type: 'text', validate: 'nexthop', required: true, placeholder: '192.0.2.1', hint: 'IP adresi veya Null0' },
                        { name: 'sr_vrf', why: 'VRF yazılırsa rota o VRF’in tablosuna girer; mgmt0 için VRF adı "management"tır. Yanlış VRF’e yazılan rota beklenen trafiği hiç etkilemez.', label: 'VRF', type: 'text', placeholder: 'management', hint: 'Boş = varsayılan VRF' },
                        { name: 'sr_name', label: 'Next-hop Adı', type: 'text', placeholder: 'ISP-GW', hint: 'name — show çıktısında görünür' },
                        { name: 'sr_tag', why: 'Tag, rotayı yeniden dağıtımda (route-map match tag) seçmek için kullanılır.', label: 'Tag', type: 'text', validate: 'posint', placeholder: '100' },
                        { name: 'sr_pref', why: 'Varsayılan uzaklık 1’dir. Dinamik rotaya yedek (floating) statik rota için daha yüksek değer (örn. 250) verin.', label: 'Tercih (AD)', type: 'text', min: 1, max: 255, placeholder: '250', hint: 'Boş = 1' }
                    ]
                },
                {
                    title: 'Ek Rotalar (aynı VRF)', icon: 'fas fa-list',
                    fields: [
                        { name: 'sr_more', label: 'Ek Rotalar', type: 'textarea', placeholder: '198.51.100.0/24 192.0.2.1', hint: 'Her satır: prefix next-hop' }
                    ]
                }
            ],
            submit: 'Statik Rota Oluştur'
        }, (data) => {
            const vrf0 = cgEsc(data.sr_vrf || ''), vrf = /^default$/i.test(vrf0) ? '' : vrf0, ind = vrf ? '  ' : '';
            const nm = cgEsc(data.sr_name || ''), tg = cgEsc(data.sr_tag || ''), pf = cgEsc(data.sr_pref || '');
            let c = cgNxHdr('Statik Rota');
            if (vrf) c += 'vrf context ' + vrf + '\n';
            c += ind + 'ip route ' + cgEsc(data.sr_prefix || '') + ' ' + cgEsc(data.sr_nh || '') + (nm ? ' name ' + nm : '') + (tg ? ' tag ' + tg : '') + (pf ? ' ' + pf : '') + '\n';
            const cidr = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/;
            const ip = /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
            String(data.sr_more || '').split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
                const p = l.split(/\s+/);
                if (p.length === 2 && cidr.test(p[0]) && (ip.test(p[1]) || /^null0$/i.test(p[1]))) c += ind + 'ip route ' + cgEsc(p[0]) + ' ' + cgEsc(p[1]) + '\n';
                else c += '! UYARI: geçersiz satır atlandı: ' + cgEsc(l) + '\n';
            });
            c += '\n! Doğrulama:\n! show ip static-route' + (vrf ? ' vrf ' + vrf : '') + '\n! show ip route' + (vrf ? ' vrf ' + vrf : '') + '\n';
            return c;
        });
    }
};

// ── NX-OS: VRF Context ───────────────────────────────────────────────────────
// Sözdizimi: canlı config (vrf context management 11; interface mgmt0 → vrf member management + ip address 10;
//   vrf context X → '  ip route' 1; vrf member X)
// + https://www.cisco.com/c/en/us/td/docs/switches/datacenter/nexus9000/sw/6-x/unicast/configuration/guide/l3_cli_nxos/l3_virtual.html
CiscoNXOS.vrf = {
    label: 'VRF Context',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-layer-group', title: 'VRF Context (NX-OS)', desc: 'Yönetim VRF’i (mgmt0) veya VRF-lite. MPLS/EVPN için RD/RT gereken VRF’ler <b>MPLS</b> ve <b>VXLAN/EVPN</b> araçlarındadır.' },
            configTypes: [
                { id: 'mgmt', label: 'Yönetim (mgmt0)', icon: 'fas fa-tools', desc: 'mgmt0 + management VRF varsayılan rota', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'lite', label: 'VRF-Lite', icon: 'fas fa-project-diagram', desc: 'Yeni VRF, arayüz ataması, varsayılan rota' }
            ],
            sections: [
                {
                    title: 'mgmt0', icon: 'fas fa-tools', showFor: ['mgmt'],
                    info: 'mgmt0 her zaman <code>management</code> VRF’indedir; yönetim trafiği veri düzleminden ayrılır. NTP/syslog/SNMP/TACACS gibi servislerde <code>use-vrf management</code> gerekir.',
                    fields: [
                        { name: 'mg_ip', label: 'mgmt0 IP / Prefix', type: 'text', validate: 'cidr', required: true, placeholder: '192.0.2.10/24' },
                        { name: 'mg_gw', why: 'management VRF’inin kendi rota tablosu vardır; varsayılan rota yazılmazsa mgmt0 yalnız kendi alt ağına ulaşır ve uzak yönetim istasyonları cihaza erişemez.', label: 'Yönetim Ağ Geçidi', type: 'text', validate: 'ip', placeholder: '192.0.2.1' }
                    ]
                },
                {
                    title: 'VRF-Lite', icon: 'fas fa-project-diagram', showFor: ['lite'],
                    fields: [
                        { name: 'tv_name', why: 'VRF adı büyük/küçük harf duyarlıdır; arayüzdeki vrf member adıyla birebir aynı olmalıdır.', label: 'VRF Adı', type: 'text', required: true, placeholder: 'TENANT-A' },
                        { name: 'tv_ifaces', why: 'vrf member komutu arayüzdeki mevcut IP’yi <b>siler</b>. IP’yi VRF atamasından sonra yeniden girin (araç tek arayüzde bunu yapar).', label: 'Üye Arayüzler', type: 'text', validate: 'iface_range', required: true, placeholder: 'Vlan100', hint: 'Virgülle liste' },
                        { name: 'tv_ip', label: 'Arayüz IP / Prefix', type: 'text', validate: 'cidr', placeholder: '10.64.0.1/24', hint: 'Yalnız tek arayüz girildiğinde uygulanır' },
                        { name: 'tv_gw', label: 'VRF Varsayılan Rota Next-hop', type: 'text', validate: 'ip', placeholder: '10.64.0.254' }
                    ]
                }
            ],
            submit: 'VRF Konfigürasyonu Oluştur'
        }, (data) => {
            const ty = data._cgtype || 'mgmt';
            let c = cgNxHdr('VRF Context');
            if (ty === 'mgmt') {
                const gw = cgEsc(data.mg_gw || '');
                c += 'vrf context management\n';
                if (gw) c += '  ip route 0.0.0.0/0 ' + gw + '\n';
                c += '\ninterface mgmt0\n  vrf member management\n  ip address ' + cgEsc(data.mg_ip || '') + '\n\n';
                c += '! Doğrulama:\n! show vrf management\n! show ip route vrf management\n';
                if (gw) c += '! ping ' + gw + ' vrf management\n';
                return c;
            }
            const v = cgEsc(data.tv_name || ''), ip = cgEsc(data.tv_ip || ''), gw = cgEsc(data.tv_gw || '');
            const ifs = cgNxList(cgEsc(data.tv_ifaces || ''));
            c += 'vrf context ' + v + '\n';
            if (gw) c += '  ip route 0.0.0.0/0 ' + gw + '\n';
            c += '\n';
            if (ip && ifs.length > 1) c += '! UYARI: IP yalnız tek arayüz girildiğinde uygulanır; arayüz IP’lerini ayrıca girin.\n';
            ifs.forEach(i => {
                c += 'interface ' + i + '\n';
                if (/^(ethernet|port-channel)/i.test(i)) c += '  no switchport\n';
                c += '  vrf member ' + v + '\n';
                if (ip && ifs.length === 1) c += '  ip address ' + ip + '\n';
                c += '  no shutdown\n\n';
            });
            c += '! Doğrulama:\n! show vrf ' + v + '\n! show vrf ' + v + ' interface\n! show ip route vrf ' + v + '\n';
            return c;
        });
    }
};

// ── NX-OS: Spanning Tree ─────────────────────────────────────────────────────
// Sözdizimi: canlı config (spanning-tree mode rapid-pvst 4, spanning-tree vlan L priority N 12, loopguard default 6,
//   port type network/edge/edge trunk, bpduguard enable)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/layer-2-switching/cisco-nexus-9000-nx-os-layer-2-switching-configuration-guide-102x/m-configuring-stp-extensions.html
//   (port type edge bpduguard/bpdufilter default, guard root)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/layer-2-switching/cisco-nexus-9000-nx-os-layer-2-switching-configuration-guide-102x/m-configuring-mst.html
CiscoNXOS.stp = {
    label: 'Spanning Tree',
    init(container) {
        const prio = (sel) => [4096, 8192, 16384, 24576, 28672, 32768].map(p => ({ value: String(p), label: String(p) + (p === 32768 ? ' (varsayılan)' : ''), selected: p === sel }));
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-sitemap', title: 'Spanning Tree (NX-OS)', desc: 'Rapid PVST+ (NX-OS varsayılanı) veya MST; root önceliği, edge/network port tipleri ve BPDU/loop/root koruması.' },
            configTypes: [
                { id: 'rpvst', label: 'Rapid PVST+', icon: 'fas fa-bolt', desc: 'VLAN başına STP (varsayılan mod)', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'mst', label: 'MST', icon: 'fas fa-object-group', desc: 'VLAN gruplarını instance’lara eşle' }
            ],
            sections: [
                {
                    title: 'Rapid PVST+ Root Önceliği', icon: 'fas fa-crown', showFor: ['rpvst'],
                    fields: [
                        { name: 'rp_vlans', why: 'Root köprü planlı seçilmezse en düşük MAC’li (genelde en eski) switch root olur ve trafik verimsiz yollardan akar. vPC peer-switch kullanıyorsanız iki peer’da aynı öncelik girilmelidir.', label: 'VLAN’lar', type: 'text', validate: 'vlan_list', required: true, placeholder: '1-3967' },
                        { name: 'rp_prio', label: 'Öncelik', type: 'select', options: prio(24576) }
                    ]
                },
                {
                    title: 'MST Bölgesi', icon: 'fas fa-object-group', showFor: ['mst'],
                    warn: 'Bölge adı, revizyon ve VLAN→instance eşlemesi bölgedeki <b>tüm</b> switch’lerde aynı olmalıdır; tek fark switch’i ayrı bölgeye düşürür. Eşleme değişikliği MST’nin yeniden yakınsamasına yol açar.',
                    fields: [
                        { name: 'mst_name', label: 'Bölge Adı', type: 'text', required: true, placeholder: 'REGION1' },
                        { name: 'mst_rev', label: 'Revizyon', type: 'text', min: 0, max: 65535, required: true, placeholder: '1' },
                        { name: 'mst_inst', label: 'Instance No', type: 'text', min: 1, max: 4094, required: true, placeholder: '1' },
                        { name: 'mst_vlans', label: 'Instance VLAN’ları', type: 'text', validate: 'vlan_list', required: true, placeholder: '10-20' },
                        { name: 'mst_prio', label: 'Instance Önceliği', type: 'select', options: prio(24576) }
                    ]
                },
                {
                    title: 'Global Koruma', icon: 'fas fa-shield-alt',
                    fields: [
                        { name: 'pr_bpdug', why: 'Edge porta switch takılırsa port err-disable olur; döngü oluşmadan kesilir.', label: 'Edge portlarda BPDU guard (spanning-tree port type edge bpduguard default)', type: 'checkbox', checked: true },
                        { name: 'pr_loopg', why: 'Tek yönlü link arızasında BPDU kesilen blok port forwarding’e geçip döngü yaratabilir; loop guard bunu engeller.', label: 'Loop guard (spanning-tree loopguard default)', type: 'checkbox', checked: false },
                        { name: 'pr_bpduf', why: 'BPDU filter edge portlarda BPDU gönderimini keser; yanlış kullanımda döngü tespitini de kapatır. Emin değilseniz açmayın.', label: 'Edge portlarda BPDU filter (spanning-tree port type edge bpdufilter default)', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Port Tipleri', icon: 'fas fa-plug',
                    info: 'Boş bırakılan satır için arayüz komutu yazılmaz.',
                    fields: [
                        { name: 'pt_edge', label: 'Edge (access) portlar', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/10', hint: 'spanning-tree port type edge' },
                        { name: 'pt_edget', label: 'Edge trunk portlar', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/11', hint: 'Hipervizör/sunucu trunk’ı' },
                        { name: 'pt_net', why: 'network tipi Bridge Assurance’ı açar; karşı uç BPDU göndermezse port bloklanır. Yalnız iki ucu da destekleyen switch bağlantılarında kullanın.', label: 'Network portlar', type: 'text', validate: 'iface_range', placeholder: 'port-channel1', hint: 'Switch-switch bağlantısı' },
                        { name: 'pt_root', why: 'Root guard, erişim katmanından daha iyi öncelikli bir switch’in root olmaya çalışmasını engeller (port root-inconsistent olur).', label: 'Root guard portlar', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/48', hint: 'spanning-tree guard root' }
                    ]
                }
            ],
            submit: 'STP Konfigürasyonu Oluştur'
        }, (data) => {
            const ty = data._cgtype || 'rpvst';
            let c = cgNxHdr('Spanning Tree');
            if (ty === 'mst') {
                const inst = cgEsc(data.mst_inst || '');
                c += 'spanning-tree mode mst\n';
                c += 'spanning-tree mst configuration\n';
                c += '  name ' + cgEsc(data.mst_name || '') + '\n';
                c += '  revision ' + cgEsc(data.mst_rev || '') + '\n';
                c += '  instance ' + inst + ' vlan ' + cgEsc(data.mst_vlans || '') + '\n';
                c += '  exit\n';
                c += 'spanning-tree mst ' + inst + ' priority ' + cgEsc(data.mst_prio || '24576') + '\n';
            } else {
                c += 'spanning-tree mode rapid-pvst\n';
                c += 'spanning-tree vlan ' + cgEsc(data.rp_vlans || '') + ' priority ' + cgEsc(data.rp_prio || '24576') + '\n';
            }
            if (data.pr_bpdug) c += 'spanning-tree port type edge bpduguard default\n';
            if (data.pr_bpduf) c += 'spanning-tree port type edge bpdufilter default\n';
            if (data.pr_loopg) c += 'spanning-tree loopguard default\n';
            c += '\n';
            [['pt_edge', 'spanning-tree port type edge'], ['pt_edget', 'spanning-tree port type edge trunk'],
             ['pt_net', 'spanning-tree port type network'], ['pt_root', 'spanning-tree guard root']].forEach(([k, cmd]) => {
                cgNxList(cgEsc(data[k] || '')).forEach(i => { c += 'interface ' + i + '\n  ' + cmd + '\n\n'; });
            });
            c += '! Doğrulama:\n! show spanning-tree summary\n';
            if (ty === 'mst') c += '! show spanning-tree mst configuration\n! show spanning-tree mst\n';
            c += '! show running-config spanning-tree\n';
            return c;
        });
    }
};

// ── NX-OS: Kullanıcı ve RBAC ─────────────────────────────────────────────────
// Sözdizimi: canlı config (username X password 5 ... role R 14 cihaz; role name X / rule N permit command ... 10;
//   rule N permit read 2; password strength-check / no password strength-check; userpassphrase min-length N max-length N 4)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/security/cisco-nexus-9000-nx-os-security-configuration-guide-103x/m-configuring-user-accounts-and-rbac.html
//   (username ... expire YYYY-MM-DD, role description)
CiscoNXOS.users = {
    label: 'Kullanıcı / RBAC',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-users-cog', title: 'Yerel Kullanıcı ve RBAC (NX-OS)', desc: 'Yerel kullanıcı, parola politikası ve özel rol. Özel rolde kurallar <b>büyükten küçüğe</b> değerlendirilir; araç ilk satıra en büyük numarayı verir.' },
            sections: [
                {
                    title: 'Parola Politikası', icon: 'fas fa-key',
                    fields: [
                        { name: 'pw_strength', why: 'Kapalıyken "admin123" gibi zayıf parolalar kabul edilir.', label: 'password strength-check', type: 'checkbox', checked: true },
                        { name: 'pw_min', label: 'En Az Uzunluk', type: 'text', min: 4, max: 127, placeholder: '12', hint: 'min ve max birlikte girilmeli' },
                        { name: 'pw_max', label: 'En Fazla Uzunluk', type: 'text', min: 4, max: 127, placeholder: '127' }
                    ]
                },
                {
                    title: 'Kullanıcı', icon: 'fas fa-user',
                    fields: [
                        { name: 'u_name', label: 'Kullanıcı Adı', type: 'text', required: true, placeholder: 'netadmin' },
                        { name: 'u_pass', why: 'Parola config’e açık metin girilir, cihaz saklarken hash’ler (password 5). Üretilen çıktıyı paylaşmadan önce parolayı silin.', label: 'Parola', type: 'text', required: true, placeholder: 'Str0ng!Passw0rd' },
                        { name: 'u_role', why: 'network-admin tüm config’i değiştirebilir. İzleme hesapları (NMS, yedekleme) için network-operator veya özel rol yeterlidir.', label: 'Rol', type: 'select', options: [
                            { value: 'network-operator', label: 'network-operator (salt okuma)', selected: true },
                            { value: 'network-admin', label: 'network-admin (tam yetki)' },
                            { value: 'custom', label: 'Özel rol (aşağıda)' }
                        ]},
                        { name: 'u_expire', label: 'Son Geçerlilik Tarihi', type: 'text', placeholder: '2027-12-31', hint: 'YYYY-MM-DD; boş = süresiz' }
                    ]
                },
                {
                    title: 'Özel Rol', icon: 'fas fa-user-tag',
                    info: 'Yalnız Rol = "Özel rol" seçildiğinde yazılır.',
                    fields: [
                        { name: 'r_name', label: 'Rol Adı', type: 'text', requiredIf: { field: 'u_role', in: ['custom'] }, placeholder: 'NOC-RO' },
                        { name: 'r_desc', label: 'Açıklama', type: 'text', placeholder: 'NOC salt okuma' },
                        { name: 'r_read', why: 'Tüm show komutlarına izin verir; yalnız belirli komutlara izin vermek istiyorsanız kapatıp aşağıya komutları yazın.', label: 'Tüm okuma komutlarına izin (rule N permit read)', type: 'checkbox', checked: false },
                        { name: 'r_cmds', label: 'İzin Verilen Komutlar', type: 'textarea', placeholder: 'show running-config\nshow version', hint: 'Her satır bir komut (rule N permit command ...)' }
                    ]
                }
            ],
            submit: 'Kullanıcı Konfigürasyonu Oluştur'
        }, (data) => {
            const mn = cgEsc(data.pw_min || ''), mx = cgEsc(data.pw_max || '');
            const role = data.u_role === 'custom' ? cgEsc(data.r_name || '') : cgEsc(data.u_role || 'network-operator');
            const exp = cgEsc(data.u_expire || '');
            let c = cgNxHdr('Kullanıcı / RBAC');
            if (data.pw_strength) c += 'password strength-check\n';
            if (mn && mx) c += 'userpassphrase min-length ' + mn + ' max-length ' + mx + '\n';
            else if (mn || mx) c += '! UYARI: userpassphrase için en az ve en fazla uzunluk birlikte girilmeli; satır yazılmadı.\n';
            if (data.u_role === 'custom') {
                const cmds = String(data.r_cmds || '').split('\n').map(l => l.trim()).filter(Boolean);
                const rules = [];
                if (data.r_read) rules.push('permit read');
                cmds.forEach(x => rules.push('permit command ' + cgEsc(x)));
                c += '\nrole name ' + role + '\n';
                if (data.r_desc) c += '  description ' + cgEsc(data.r_desc) + '\n';
                rules.forEach((r, i) => { c += '  rule ' + (rules.length - i) + ' ' + r + '\n'; });
                if (!rules.length) c += '! UYARI: rol için kural girilmedi; bu rol hiçbir komuta izin vermez.\n';
            }
            c += '\nusername ' + cgEsc(data.u_name || '') + ' password ' + cgEsc(data.u_pass || '') + ' role ' + role + (exp ? ' expire ' + exp : '') + '\n\n';
            c += '! Doğrulama:\n! show user-account\n! show role' + (data.u_role === 'custom' ? ' name ' + role : '') + '\n! show password strength-check\n';
            return c;
        });
    }
};

// ── NX-OS: Yönetim Erişimi (Banner / Line / SSH) ─────────────────────────────
// Sözdizimi: canlı config (banner motd ^ ... ^ 10 cihaz; line console/line vty 14; exec-timeout 7, session-limit 4,
//   access-class X in 3; feature ssh 4; no feature telnet 4; ssh key rsa 2048 4; ssh login-attempts 4;
//   ssh idle-timeout N keepalive-count N 6; system login block-for N attempts N within N 8)
// banner metin biçimi: https://github.com/ansible-collections/cisco.nxos/blob/main/plugins/modules/nxos_banner.py
CiscoNXOS.mgmtAccess = {
    label: 'Banner / Line / SSH',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-terminal', title: 'Yönetim Erişimi — Banner, Line, SSH (NX-OS)', desc: 'Giriş uyarısı, konsol/VTY oturum sınırları ve SSH sıkılaştırma. VTY ACL’i ayrıca <b>ACL</b> aracıyla tanımlanmalıdır.' },
            sections: [
                {
                    title: 'Banner', icon: 'fas fa-flag',
                    fields: [
                        { name: 'banner', why: 'Hukuki uyarı metni yetkisiz erişimde kovuşturma için çoğu mevzuatta beklenir. Metinde ^ karakteri kullanmayın (sınırlayıcıdır).', label: 'MOTD Metni', type: 'textarea', placeholder: 'Yetkisiz erisim yasaktir.', hint: 'Boş = banner yazılmaz' }
                    ]
                },
                {
                    title: 'Line', icon: 'fas fa-keyboard',
                    fields: [
                        { name: 'con_to', why: 'Zaman aşımı olmayan konsol oturumu açık kalır ve fiziksel erişimi olan herkes yetkili oturumu kullanabilir.', label: 'Konsol exec-timeout (dk)', type: 'text', min: 0, max: 525600, placeholder: '10' },
                        { name: 'vty_to', label: 'VTY exec-timeout (dk)', type: 'text', min: 0, max: 525600, placeholder: '10' },
                        { name: 'vty_limit', why: 'Eşzamanlı oturum sayısını sınırlar; kaba kuvvet denemelerinin tüm VTY’leri doldurmasını zorlaştırır. Çok düşük değer acil durumda sizin girişinizi engelleyebilir.', label: 'VTY session-limit', type: 'text', min: 1, placeholder: '8' },
                        { name: 'vty_acl', why: 'VTY’ye yalnız yönetim ağlarından erişim izni verir. ACL cihazda tanımlı değilse ve kendi adresiniz yoksa oturumunuz kesilebilir.', label: 'VTY access-class (ACL adı)', type: 'text', placeholder: 'ACL_VTY_IN' }
                    ]
                },
                {
                    title: 'SSH', icon: 'fas fa-lock',
                    fields: [
                        { name: 'ssh_on', label: 'feature ssh', type: 'checkbox', checked: true },
                        { name: 'tel_off', why: 'Telnet parolaları açık metin taşır.', label: 'no feature telnet', type: 'checkbox', checked: true },
                        { name: 'ssh_key', why: 'Anahtar yeniden üretilirse cihazın SSH parmak izi değişir; istemciler "host key changed" uyarısı verir. Cihazda zaten anahtar varsa komut reddedilebilir; önce <code>show ssh key</code> ile kontrol edin.', label: 'SSH Anahtarı', type: 'select', options: [
                            { value: 'none', label: 'Dokunma', selected: true },
                            { value: '2048', label: 'ssh key rsa 2048' }
                        ]},
                        { name: 'ssh_att', label: 'ssh login-attempts', type: 'text', min: 1, placeholder: '3' },
                        { name: 'ssh_idle', why: 'Boşta kalan SSH oturumlarını keser.', label: 'ssh idle-timeout (dk)', type: 'text', min: 0, placeholder: '30', hint: 'keepalive-count ile birlikte' },
                        { name: 'ssh_ka', label: 'keepalive-count', type: 'text', min: 0, placeholder: '3' }
                    ]
                },
                {
                    title: 'Giriş Engelleme', icon: 'fas fa-user-slash',
                    fields: [
                        { name: 'blk_on', why: 'Kısa sürede çok sayıda başarısız girişte yeni girişleri belirli süre engeller; parola tahmin saldırısını yavaşlatır.', label: 'system login block-for', type: 'checkbox', checked: false },
                        { name: 'blk_for', label: 'Engelleme Süresi (sn)', type: 'text', min: 1, max: 65535, requiredIf: { field: 'blk_on', checked: true }, placeholder: '120' },
                        { name: 'blk_att', label: 'Deneme Sayısı', type: 'text', min: 1, max: 65535, requiredIf: { field: 'blk_on', checked: true }, placeholder: '5' },
                        { name: 'blk_win', label: 'Pencere (sn)', type: 'text', min: 1, max: 65535, requiredIf: { field: 'blk_on', checked: true }, placeholder: '60' }
                    ]
                }
            ],
            submit: 'Erişim Konfigürasyonu Oluştur'
        }, (data) => {
            const ct = cgEsc(data.con_to || ''), vt = cgEsc(data.vty_to || ''), vl = cgEsc(data.vty_limit || ''), va = cgEsc(data.vty_acl || '');
            const att = cgEsc(data.ssh_att || ''), idle = cgEsc(data.ssh_idle || ''), ka = cgEsc(data.ssh_ka || '');
            let c = cgNxHdr('Banner / Line / SSH');
            if (data.ssh_on) c += 'feature ssh\n';
            if (data.tel_off) c += 'no feature telnet\n';
            if (data.ssh_key === '2048') c += 'ssh key rsa 2048\n';
            if (att) c += 'ssh login-attempts ' + att + '\n';
            if (idle && ka) c += 'ssh idle-timeout ' + idle + ' keepalive-count ' + ka + '\n';
            else if (idle || ka) c += '! UYARI: ssh idle-timeout ve keepalive-count birlikte girilmeli; satır yazılmadı.\n';
            if (data.blk_on) c += 'system login block-for ' + cgEsc(data.blk_for || '') + ' attempts ' + cgEsc(data.blk_att || '') + ' within ' + cgEsc(data.blk_win || '') + '\n';
            const bl = String(data.banner || '').split('\n').map(l => l.replace(/\s+$/, '')).filter((l, i, a) => l || (i > 0 && i < a.length - 1));
            if (bl.length) {
                if (bl.some(l => l.indexOf('^') >= 0)) c += '! UYARI: banner metnindeki ^ karakterleri çıkarıldı (sınırlayıcı).\n';
                c += '\nbanner motd ^\n' + bl.map(l => cgEsc(l.replace(/\^/g, ''))).join('\n') + '\n^\n';
            }
            if (ct) c += '\nline console\n  exec-timeout ' + ct + '\n';
            if (vt || vl || va) {
                c += '\nline vty\n';
                if (vt) c += '  exec-timeout ' + vt + '\n';
                if (vl) c += '  session-limit ' + vl + '\n';
                if (va) c += '  access-class ' + va + ' in\n';
            }
            c += '\n! Doğrulama:\n! show ssh server\n! show ssh key\n! show banner motd\n! show users\n';
            return c;
        });
    }
};

// ── NX-OS: Scheduler ile Otomatik Config Yedeği ──────────────────────────────
// Sözdizimi: canlı config (feature scheduler 14; scheduler job name X / copy running-config scp://...$(SWITCHNAME)-cfg.$(TIMESTAMP) vrf default / end-job 6;
//   scheduler schedule name X / job name X / time daily HH:MM 6; scheduler logfile size N 2; copy running-config startup-config 1)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/system-management/cisco-nexus-9000-series-nx-os-system-management-configuration-guide-103x/m-configuring-the-scheduler-10x.html
//   (scheduler aaa-authentication, komutları ' ; ' ile ayırma, etkileşimsiz çalışma notu)
CiscoNXOS.scheduler = {
    label: 'Otomatik Yedek (Scheduler)',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-calendar-check', title: 'Otomatik Config Yedeği — Scheduler (NX-OS)', desc: 'Running-config’i her gün belirlenen saatte uzak sunucuya kopyalar. <code>$(SWITCHNAME)</code> ve <code>$(TIMESTAMP)</code> NX-OS tarafından hostname ve zaman damgasıyla değiştirilir.' },
            sections: [
                {
                    title: 'Yedek Hedefi', icon: 'fas fa-hdd',
                    warn: 'Scheduler işleri <b>etkileşimsiz</b> çalışır: parola istemi yanıtlanamaz. Kopyalamanın gerçekten çalıştığını ilk tetiklemeden sonra <code>show scheduler logfile</code> ile doğrulayın.',
                    fields: [
                        { name: 'sc_job', label: 'İş (Job) Adı', type: 'text', required: true, placeholder: 'CFG-BACKUP' },
                        { name: 'sc_url', why: 'Yedek cihazın kendi bootflash’ında kalırsa cihaz arızasında yedek de kaybolur; uzak hedef tercih edin. Yol / ile bitmelidir.', label: 'Hedef Dizin (URL)', type: 'text', required: true, placeholder: 'scp://backup@192.0.2.20/nxos/', hint: 'scp://, sftp:// veya tftp:// ; sonunda /' },
                        { name: 'sc_fname', label: 'Dosya Adı Kalıbı', type: 'text', required: true, placeholder: '$(SWITCHNAME)-cfg.$(TIMESTAMP)' },
                        { name: 'sc_vrf', why: 'Yedek sunucusuna mgmt0 üzerinden gidiliyorsa VRF management olmalıdır; yanlış VRF’te kopyalama "no route" ile sessizce başarısız olur.', label: 'VRF', type: 'select', options: [
                            { value: 'management', label: 'management (mgmt0)', selected: true },
                            { value: 'default', label: 'default' }
                        ]},
                        { name: 'sc_save', why: 'Yedekten önce running-config’i startup’a da kaydeder; kaydedilmemiş değişiklikler yeniden başlatmada kaybolmaz.', label: 'Önce copy running-config startup-config', type: 'checkbox', checked: false }
                    ]
                },
                {
                    title: 'Zamanlama', icon: 'fas fa-clock',
                    fields: [
                        { name: 'sc_sched', label: 'Zamanlama Adı', type: 'text', required: true, placeholder: 'DAILY-BACKUP' },
                        { name: 'sc_time', why: 'Saat cihaz saatine göredir; NTP ve saat dilimi doğru değilse yedek beklenmedik saatte alınır.', label: 'Günlük Saat (HH:MM)', type: 'text', required: true, placeholder: '02:00' },
                        { name: 'sc_log', label: 'scheduler logfile size (KB)', type: 'text', min: 16, max: 1024, placeholder: '1024', hint: 'Boş = varsayılan' }
                    ]
                },
                {
                    title: 'Uzak Kullanıcı Kimliği (opsiyonel)', icon: 'fas fa-user-lock',
                    info: 'Cisco: uzak (AAA) kullanıcıyla oluşturulan işlerin çalışması için scheduler’a yerel olarak parola tanımlanmalıdır.',
                    fields: [
                        { name: 'sc_aaa_user', label: 'Kullanıcı', type: 'text', placeholder: 'netbackup' },
                        { name: 'sc_aaa_pass', label: 'Parola', type: 'text', placeholder: 'Backup!Pass1' }
                    ]
                }
            ],
            submit: 'Scheduler Konfigürasyonu Oluştur'
        }, (data) => {
            const job = cgEsc(data.sc_job || ''), url = cgEsc(data.sc_url || ''), fn = cgEsc(data.sc_fname || ''), vrf = cgEsc(data.sc_vrf || 'management');
            const sch = cgEsc(data.sc_sched || ''), tm = cgEsc(data.sc_time || ''), lg = cgEsc(data.sc_log || '');
            const au = cgEsc(data.sc_aaa_user || ''), ap = cgEsc(data.sc_aaa_pass || '');
            let c = cgNxHdr('Scheduler — Otomatik Yedek');
            c += 'feature scheduler\n';
            if (lg) c += 'scheduler logfile size ' + lg + '\n';
            if (ap) c += 'scheduler aaa-authentication ' + (au ? 'username ' + au + ' ' : '') + 'password ' + ap + '\n';
            else if (au) c += '! UYARI: scheduler aaa-authentication için parola girilmedi; satır yazılmadı.\n';
            if (url && !/\/$/.test(url)) c += '! UYARI: hedef dizin / ile bitmiyor; dosya adı dizine bitişik yazılacak.\n';
            const cmds = [];
            if (data.sc_save) cmds.push('copy running-config startup-config');
            cmds.push('copy running-config ' + url + fn + ' vrf ' + vrf);
            c += '\nscheduler job name ' + job + '\n  ' + cmds.join(' ; ') + '\nend-job\n';
            c += '\nscheduler schedule name ' + sch + '\n  job name ' + job + '\n  time daily ' + tm + '\n\n';
            c += '! Doğrulama:\n! show scheduler config\n! show scheduler schedule\n! show scheduler logfile\n';
            return c;
        });
    }
};

// ── NX-OS: Private VLAN ──────────────────────────────────────────────────────
// Sözdizimi: canlı config (feature private-vlan 9; vlan → private-vlan primary 4 / isolated 12 / community 36 satır;
//   private-vlan association L 4)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/layer-2-switching/cisco-nexus-9000-nx-os-layer-2-switching-configuration-guide-103x/m-configuring-private-vlans.html
//   (switchport mode private-vlan host / promiscuous, host-association, mapping, SVI private-vlan mapping)
CiscoNXOS.pvlan = {
    label: 'Private VLAN',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-user-secret', title: 'Private VLAN (NX-OS)', desc: 'Aynı alt ağdaki cihazları L2’de birbirinden yalıtır: <b>isolated</b> portlar yalnız promiscuous porta (gateway), <b>community</b> portları kendi grubuyla ve promiscuous portla konuşur.' },
            sections: [
                {
                    title: 'VLAN’lar', icon: 'fas fa-tags',
                    warn: 'Cisco: secondary VLAN’a dönüştürülecek VLAN’ın SVI’ı kapalı olmalıdır; vPC peer-link arayüzlerinde PVLAN desteklenmez (9.3(9)+).',
                    fields: [
                        { name: 'pv_primary', label: 'Primary VLAN', type: 'text', validate: 'vlan', required: true, placeholder: '100' },
                        { name: 'pv_iso', why: 'Isolated VLAN’daki portlar birbirini hiç göremez; sunucular arası yanal hareketi keser. Primary başına tek isolated VLAN olur.', label: 'Isolated VLAN', type: 'text', validate: 'vlan', placeholder: '101' },
                        { name: 'pv_comm', label: 'Community VLAN(lar)', type: 'text', validate: 'vlan_list', placeholder: '102,103' }
                    ]
                },
                {
                    title: 'Host Portları', icon: 'fas fa-desktop',
                    fields: [
                        { name: 'pv_host_ifs', label: 'Host Arayüzleri', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/10', hint: 'Boş = host portu yazılmaz' },
                        { name: 'pv_host_sec', why: 'Host portu tek bir secondary (isolated veya community) VLAN’a bağlanır; bu VLAN primary ile ilişkilendirilmiş olmalıdır.', label: 'Host Secondary VLAN', type: 'text', validate: 'vlan', placeholder: '101' }
                    ]
                },
                {
                    title: 'Promiscuous Port ve SVI', icon: 'fas fa-door-open',
                    fields: [
                        { name: 'pv_prom_ifs', why: 'Promiscuous port (router/firewall bağlantısı) tüm secondary VLAN’larla konuşabilir; eşleme listesinde olmayan secondary VLAN çıkışsız kalır.', label: 'Promiscuous Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/48' },
                        { name: 'pv_svi', why: 'Gateway bu switch’teki SVI ise secondary VLAN’lar primary SVI’a eşlenmelidir; aksi halde hostlar gateway’e ulaşamaz.', label: 'Primary SVI’a secondary eşlemesi (interface Vlan primary / private-vlan mapping)', type: 'checkbox', checked: false }
                    ]
                }
            ],
            submit: 'Private VLAN Oluştur'
        }, (data) => {
            const p = cgEsc(data.pv_primary || ''), iso = cgEsc(data.pv_iso || ''), comm = cgNxList(cgEsc(data.pv_comm || '')).join(',');
            const secs = [iso, comm].filter(Boolean).join(',');
            const hifs = cgNxList(cgEsc(data.pv_host_ifs || '')), hsec = cgEsc(data.pv_host_sec || '');
            const pifs = cgNxList(cgEsc(data.pv_prom_ifs || ''));
            let c = cgNxHdr('Private VLAN');
            c += 'feature private-vlan\n';
            if (data.pv_svi) c += 'feature interface-vlan\n';
            c += '\n';
            if (!secs) {
                c += '! UYARI: en az bir isolated veya community VLAN girilmeli; ilişkilendirme yazılmadı.\n';
            } else {
                if (iso) c += 'vlan ' + iso + '\n  private-vlan isolated\n';
                cgNxList(comm).forEach(v => { c += 'vlan ' + v + '\n  private-vlan community\n'; });
            }
            c += 'vlan ' + p + '\n  private-vlan primary\n';
            if (secs) c += '  private-vlan association ' + secs + '\n';
            c += '\n';
            if (hifs.length && !hsec) c += '! UYARI: host arayüzleri için secondary VLAN girilmedi; host portları yazılmadı.\n';
            if (hsec) hifs.forEach(i => {
                c += 'interface ' + i + '\n  switchport\n  switchport mode private-vlan host\n  switchport private-vlan host-association ' + p + ' ' + hsec + '\n  no shutdown\n\n';
            });
            if (secs) pifs.forEach(i => {
                c += 'interface ' + i + '\n  switchport\n  switchport mode private-vlan promiscuous\n  switchport private-vlan mapping ' + p + ' ' + secs + '\n  no shutdown\n\n';
            });
            if (data.pv_svi && secs) c += 'interface Vlan' + p + '\n  private-vlan mapping ' + secs + '\n  no shutdown\n\n';
            c += '! Doğrulama:\n! show vlan private-vlan\n! show interface switchport\n';
            if (data.pv_svi) c += '! show interface vlan ' + p + ' private-vlan mapping\n';
            return c;
        });
    }
};

// ── NX-OS: LLDP / CDP ────────────────────────────────────────────────────────
// Sözdizimi: canlı config (feature lldp 14; lldp timer/holdtime/reinit, cdp enable (global+arayüz): 4 cihaz, run-config-all)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/102x/configuration/system-management/cisco-nexus-9000-series-nx-os-system-management-configuration-guide-102x/m-configuring-lldp-10x.html
//   (holdtime 10-255, timer 5-254, reinit 1-10, no lldp transmit/receive)
CiscoNXOS.lldp = {
    label: 'LLDP / CDP',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-project-diagram', title: 'LLDP / CDP — Komşu Keşfi (NX-OS)', desc: 'LLDP (IEEE 802.1AB) ve Cisco CDP. Topoloji keşfi ve NMS envanteri için gereklidir; güvenilmeyen portlarda (internet, misafir, üçüncü taraf) kapatılmalıdır.' },
            sections: [
                {
                    title: 'Global', icon: 'fas fa-globe',
                    fields: [
                        { name: 'lldp_on', label: 'LLDP', type: 'select', options: [
                            { value: 'on', label: 'Açık — feature lldp', selected: true },
                            { value: 'off', label: 'Kapalı — no feature lldp' }
                        ]},
                        { name: 'lldp_timer', label: 'LLDP Gönderim Aralığı (sn)', type: 'text', min: 5, max: 254, placeholder: '30', hint: 'Boş = varsayılan 30' },
                        { name: 'lldp_hold', why: 'Holdtime gönderim aralığından büyük olmalıdır; aksi halde komşu kayıtları yenilenmeden silinir ve NMS’de komşular gidip gelir.', label: 'LLDP Holdtime (sn)', type: 'text', min: 10, max: 255, placeholder: '120', hint: 'Boş = varsayılan 120' },
                        { name: 'lldp_reinit', label: 'LLDP Reinit (sn)', type: 'text', min: 1, max: 10, placeholder: '2', hint: 'Boş = varsayılan 2' },
                        { name: 'cdp', why: 'CDP cihaz modeli, NX-OS sürümü ve yönetim IP’sini açık metinle yayınlar; saldırgan için hazır keşif bilgisidir.', label: 'CDP (global)', type: 'select', options: [
                            { value: 'keep', label: 'Değiştirme', selected: true },
                            { value: 'on', label: 'Açık — cdp enable' },
                            { value: 'off', label: 'Kapalı — no cdp enable' }
                        ]}
                    ]
                },
                {
                    title: 'Güvenilmeyen Portlarda Kapat', icon: 'fas fa-ban',
                    fields: [
                        { name: 'off_ifs', why: 'Bu portlarda keşif protokolü bilgi sızdırır. Port-channel’a yazılan lldp ayarı üye portları etkilemez; üye portları ayrıca girin.', label: 'Arayüzler', type: 'text', validate: 'iface_range', placeholder: 'Ethernet1/48', hint: 'Virgülle liste; boş = dokunma' }
                    ]
                }
            ],
            submit: 'LLDP/CDP Konfigürasyonu Oluştur'
        }, (data) => {
            const t = cgEsc(data.lldp_timer || ''), h = cgEsc(data.lldp_hold || ''), r = cgEsc(data.lldp_reinit || '');
            const lon = data.lldp_on !== 'off';
            let c = cgNxHdr('LLDP / CDP');
            c += (lon ? 'feature lldp' : 'no feature lldp') + '\n';
            if (lon && t) c += 'lldp timer ' + t + '\n';
            if (lon && h) c += 'lldp holdtime ' + h + '\n';
            if (lon && r) c += 'lldp reinit ' + r + '\n';
            if (data.cdp === 'on') c += 'cdp enable\n'; else if (data.cdp === 'off') c += 'no cdp enable\n';
            c += '\n';
            cgNxList(cgEsc(data.off_ifs || '')).forEach(i => {
                if (!lon && data.cdp === 'off') return;
                c += 'interface ' + i + '\n';
                if (lon) c += '  no lldp transmit\n  no lldp receive\n';
                if (data.cdp !== 'off') c += '  no cdp enable\n';
                c += '\n';
            });
            c += '! Doğrulama:\n! show lldp neighbors\n! show lldp timers\n! show cdp neighbors\n';
            return c;
        });
    }
};

// ── NX-OS: CoPP ──────────────────────────────────────────────────────────────
// Sözdizimi: canlı config (copp profile strict: 11 cihaz)
// + https://www.cisco.com/c/en/us/td/docs/dcn/nx-os/nexus9000/103x/configuration/security/cisco-nexus-9000-nx-os-security-configuration-guide-103x/m-configuring-copp.html
//   (strict|moderate|lenient|dense; copp copy profile ... prefix|suffix; onay istemi)
CiscoNXOS.copp = {
    label: 'CoPP',
    init(container) {
        cgFormBuilder(container, {
            topic: { icon: 'fas fa-shield-alt', title: 'CoPP — Control Plane Policing (NX-OS)', desc: 'Supervisor CPU’ya giden trafiği sınıf bazında hız sınırıyla korur (DoS, yanlış yapılandırılmış komşu, döngü). NX-OS hazır profillerle gelir; ilk kurulumda <b>strict</b> uygulanır.' },
            sections: [
                {
                    title: 'Profil', icon: 'fas fa-sliders-h',
                    warn: 'Profil değişikliği kontrol düzlemi trafiğinde kısa bir kesinti yaratabilir; komut <code>Proceed (y/n)?</code> onayı ister. Bakım penceresinde uygulayın.',
                    fields: [
                        { name: 'cp_profile', why: 'strict en düşük burst değerleriyle en güçlü korumayı verir. Çok sayıda BGP/OSPF komşusu veya yüksek ARP yükü olan cihazlarda protokol paketleri düşerse moderate/lenient değerlendirilebilir.', label: 'CoPP Profili', type: 'select', options: [
                            { value: 'strict', label: 'strict (varsayılan, önerilen)', selected: true },
                            { value: 'moderate', label: 'moderate' },
                            { value: 'lenient', label: 'lenient' },
                            { value: 'dense', label: 'dense (yoğun kart/port)' }
                        ]}
                    ]
                },
                {
                    title: 'Özelleştirme (opsiyonel)', icon: 'fas fa-copy',
                    info: 'Hazır profiller salt okunurdur. Değiştirmek için profilin kopyası alınır; kopyadaki class-map/policy-map adlarına verilen önek/sonek eklenir.',
                    fields: [
                        { name: 'cp_copy', label: 'Profilin düzenlenebilir kopyasını al (copp copy profile)', type: 'checkbox', checked: false },
                        { name: 'cp_mode', label: 'Ad Ekleme Biçimi', type: 'select', options: [
                            { value: 'prefix', label: 'prefix (önek)', selected: true },
                            { value: 'suffix', label: 'suffix (sonek)' }
                        ]},
                        { name: 'cp_name', label: 'Önek / Sonek', type: 'text', requiredIf: { field: 'cp_copy', checked: true }, placeholder: 'CUSTOM' }
                    ]
                }
            ],
            submit: 'CoPP Konfigürasyonu Oluştur'
        }, (data) => {
            const pr = cgEsc(data.cp_profile || 'strict');
            let c = cgNxHdr('CoPP');
            c += 'copp profile ' + pr + '\n';
            if (data.cp_copy) {
                c += '\n! Özelleştirme kopyası — EXEC modunda (config dışında) çalıştırın:\n';
                c += '! copp copy profile ' + pr + ' ' + cgEsc(data.cp_mode || 'prefix') + ' ' + cgEsc(data.cp_name || '') + '\n';
            }
            c += '\n! Doğrulama:\n! show copp status\n! show copp profile ' + pr + '\n! show policy-map interface control-plane\n';
            return c;
        });
    }
};
