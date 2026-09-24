'use strict';

// Dönüştürücü writer'ları arasında paylaşılan yardımcı fonksiyonlar ve
// birden fazla ana writer tarafından çağrılan alt-writer'lar (OSPF/BGP/System).
// Faz 6: ConfigConverter_Writers.js'den mekanik olarak bölündü.

function ccResolveAddr(name, ir) {
    if (!name || name === 'any' || name === 'all') return 'any';
    if (/^[\d.]+\/\d+$/.test(name) || /^[\d.]+$/.test(name)) return name;
    const obj = (ir.addressObjects || []).find(a => a.name === name);
    if (!obj) return name;
    if (obj.type === 'host') return obj.value + '/32';
    if (obj.type === 'network') return obj.value + '/' + ccMaskToPrefix(obj.mask || '255.255.255.255');
    if (obj.type === 'range') return obj.value;
    if (obj.type === 'group') return (obj.members || []).map(m => ccResolveAddr(m, ir)).join(', ');
    if (obj.type === 'fqdn') return obj.value;
    return name;
}

function ccResolveService(name, ir) {
    const BUILTIN = {
        HTTP:'tcp/80', HTTPS:'tcp/443', SSH:'tcp/22', DNS:'udp/53',
        SNMP:'udp/161', FTP:'tcp/21', SMTP:'tcp/25', RDP:'tcp/3389',
        TELNET:'tcp/23', PING:'icmp', NTP:'udp/123'
    };
    if (!name) return 'any';
    if (BUILTIN[name.toUpperCase()]) return BUILTIN[name.toUpperCase()];
    const obj = (ir.serviceObjects || []).find(s => s.name === name);
    if (!obj) return name;
    if (obj.members && obj.members.length) return obj.members.map(m => ccResolveService(m, ir)).join(', ');
    return (obj.proto || 'ip') + (obj.ports ? '/' + obj.ports : '');
}

function ccNormalizeZone(name) {
    const n = (name || '').toLowerCase();
    if (/trust|inside|lan|internal/.test(n)) return 'TRUST';
    if (/untrust|outside|wan|external|internet/.test(n)) return 'UNTRUST';
    if (/dmz/.test(n)) return 'DMZ';
    return (name || '').toUpperCase();
}

function ccShouldWrite(ir, section) {
    return ir._meta && ir._meta.scope ? ir._meta.scope.includes(section) : true;
}

function ccPrefixToWildcard(prefix) {
    const mask = ccPrefixToMask(prefix);
    return mask.split('.').map(o => 255 - parseInt(o)).join('.');
}

// Cisco IOS OSPF section
function ccWriteOspfCiscoIOS(ir) {
    if (!ir.ospf || !ir.ospf.length) return '';
    let c = '';
    ir.ospf.forEach(proc => {
        c += 'router ospf ' + proc.process_id + '\n';
        if (proc.router_id) c += ' router-id ' + proc.router_id + '\n';
        (proc.areas || []).forEach(area => {
            (area.networks || []).forEach(net => {
                const [ip, pre] = net.split('/');
                c += ' network ' + ip + ' ' + ccPrefixToWildcard(parseInt(pre||'24')) + ' area ' + area.id + '\n';
            });
        });
        if (proc.bfd_all_interfaces) c += ' bfd all-interfaces\n';
        c += '!\n';
    });
    return c;
}

// Cisco IOS BGP section
function ccWriteBgpCiscoIOS(ir) {
    if (!ir.bgp) return '';
    let c = 'router bgp ' + ir.bgp.as_number + '\n';
    if (ir.bgp.router_id) c += ' bgp router-id ' + ir.bgp.router_id + '\n';
    (ir.bgp.neighbors || []).forEach(n => {
        c += ' neighbor ' + n.ip + ' remote-as ' + n.remote_as + '\n';
        if (n.desc) c += ' neighbor ' + n.ip + ' description ' + n.desc + '\n';
        if (n.bfd) c += ' neighbor ' + n.ip + ' fall-over bfd\n';
    });
    (ir.bgp.networks || []).forEach(net => {
        const [ip, pre] = net.split('/');
        c += ' network ' + ip + ' mask ' + ccPrefixToMask(parseInt(pre||'24')) + '\n';
    });
    c += '!\n';
    return c;
}

// Cisco IOS system section
function ccWriteSystemCiscoIOS(ir) {
    if (!ir.system) return '';
    let c = '';
    (ir.system.dns || []).forEach(ip => { c += 'ip name-server ' + ip + '\n'; });
    (ir.system.ntp || []).forEach(ip => { c += 'ntp server ' + ip + '\n'; });
    (ir.system.syslog || []).forEach(ip => { c += 'logging host ' + ip + '\n'; });
    if (ir.system.snmp && ir.system.snmp.community) {
        c += 'snmp-server community ' + ir.system.snmp.community + ' ' + (ir.system.snmp.access === 'rw' ? 'RW' : 'RO') + '\n';
    }
    (ir.system.snmp_v3_groups || []).forEach(g => {
        c += 'snmp-server group ' + g.name + ' v3 ' + g.sec_level + '\n';
    });
    (ir.system.snmp_v3_users || []).forEach(u => {
        let line = 'snmp-server user ' + u.user + ' ' + (u.group || 'DEFAULT') + ' v3';
        if (u.auth_proto) line += ' auth ' + u.auth_proto + ' ' + u.auth_pwd;
        if (u.priv_proto) {
            const pp = u.priv_proto.replace(/(\d+)$/, ' $1').trim();
            line += ' priv ' + pp + ' ' + u.priv_pwd;
        }
        c += line + '\n';
    });
    if (ir.dhcpSnooping && ir.dhcpSnooping.enabled) {
        c += 'ip dhcp snooping\n';
        if (ir.dhcpSnooping.vlans && ir.dhcpSnooping.vlans.length)
            c += 'ip dhcp snooping vlan ' + ir.dhcpSnooping.vlans.join(',') + '\n';
    }
    if (c) c += '!\n';
    return c;
}

// Huawei OSPF section
function ccWriteOspfHuawei(ir) {
    if (!ir.ospf || !ir.ospf.length) return '';
    let c = '';
    ir.ospf.forEach(proc => {
        c += 'ospf ' + proc.process_id + (proc.router_id ? ' router-id ' + proc.router_id : '') + '\n';
        if (proc.bfd_all_interfaces) c += ' bfd all-interfaces enable\n';
        (proc.areas || []).forEach(area => {
            c += ' area ' + area.id + '\n';
            (area.networks || []).forEach(net => {
                const [ip, pre] = net.split('/');
                const wm = ccPrefixToMask(parseInt(pre||'24')).split('.').map(o => 255 - parseInt(o)).join('.');
                c += '  network ' + ip + ' ' + wm + '\n';
            });
        });
        c += '#\n';
    });
    return c;
}

// Huawei BGP section
function ccWriteBgpHuawei(ir) {
    if (!ir.bgp) return '';
    let c = 'bgp ' + ir.bgp.as_number + '\n';
    if (ir.bgp.router_id) c += ' router-id ' + ir.bgp.router_id + '\n';
    (ir.bgp.neighbors || []).forEach(n => {
        c += ' peer ' + n.ip + ' as-number ' + n.remote_as + '\n';
        if (n.desc) c += ' peer ' + n.ip + ' description ' + n.desc + '\n';
        if (n.bfd) c += ' peer ' + n.ip + ' bfd enable\n';
    });
    (ir.bgp.networks || []).forEach(net => {
        const [ip, pre] = net.split('/');
        c += ' network ' + ip + ' ' + ccPrefixToMask(parseInt(pre||'24')) + '\n';
    });
    c += '#\n';
    return c;
}

// Huawei system section
function ccWriteSystemHuawei(ir) {
    if (!ir.system) return '';
    let c = '';
    (ir.system.dns || []).forEach(ip => { c += 'dns resolve-server ' + ip + '\n'; });
    (ir.system.ntp || []).forEach(ip => { c += 'ntp-service unicast-server ' + ip + '\n'; });
    (ir.system.syslog || []).forEach(ip => { c += 'info-center loghost ' + ip + '\n'; });
    if (ir.system.snmp && ir.system.snmp.community) {
        c += 'snmp-agent\n';
        c += 'snmp-agent community ' + (ir.system.snmp.access === 'rw' ? 'write' : 'read') + ' ' + ir.system.snmp.community + '\n';
    }
    if (ir.system.snmp_v3_users && ir.system.snmp_v3_users.length) {
        c += 'snmp-agent\n';
        c += 'snmp-agent sys-info version v3\n';
    }
    (ir.system.snmp_v3_groups || []).forEach(g => {
        const sl = g.sec_level === 'priv' ? 'privacy' : g.sec_level === 'auth' ? 'authentication' : 'noauthentication';
        c += 'snmp-agent group v3 ' + g.name + ' ' + sl + '\n';
    });
    (ir.system.snmp_v3_users || []).forEach(u => {
        c += 'snmp-agent usm-user v3 ' + u.user + (u.group ? ' ' + u.group : '') + '\n';
        if (u.auth_proto) c += 'snmp-agent usm-user v3 ' + u.user + (u.group ? ' ' + u.group : '') + ' authentication-mode ' + u.auth_proto + ' ' + u.auth_pwd + '\n';
        if (u.priv_proto) c += 'snmp-agent usm-user v3 ' + u.user + (u.group ? ' ' + u.group : '') + ' privacy-mode ' + u.priv_proto + ' ' + u.priv_pwd + '\n';
    });
    (ir.system.snmpViews || []).forEach(v => {
        c += 'snmp-agent mib-view ' + v.type + ' ' + v.name + ' ' + v.subtree + '\n';
    });
    if (ir.system.snmpLocation) {
        c += 'snmp-agent sys-info location "' + ir.system.snmpLocation + '"\n';
    }
    if (ir.system.clockTimezone) {
        const tz = ir.system.clockTimezone;
        const sign = tz.hourOffset < 0 ? 'minus' : 'add';
        const h = String(Math.abs(tz.hourOffset)).padStart(2, '0');
        const mnt = String(tz.minOffset || 0).padStart(2, '0');
        c += 'clock timezone ' + tz.name + ' ' + sign + ' ' + h + ':' + mnt + ':00\n';
    }
    if (ir.dhcpSnooping && ir.dhcpSnooping.enabled) {
        c += 'dhcp enable\n';
        c += 'dhcp snooping enable\n';
        if (ir.dhcpSnooping.vlans && ir.dhcpSnooping.vlans.length)
            c += 'dhcp snooping vlan ' + ir.dhcpSnooping.vlans.join(' ') + '\n';
    }

    if (ir.system.domainName) {
        c += 'dns domain ' + ir.system.domainName + '\n';
    }

    // Kullanıcı hesapları — Cisco'nun secret/password hash'i (type 5/8/9) Huawei'nin
    // cipher formatıyla uyumlu değil (farklı KDF); parola alanı taşınmaz, sadece
    // kullanıcı adı + yetki seviyesi + servis tipi emit edilir, parola manuel
    // olarak yeniden ayarlanmalı — bu yüzden lostFields'a 'manual' olarak düşer.
    (ir.system.users || []).forEach(u => {
        if (u.secretHash) {
            ccDropField(ir, 'system', u.name, 'password', '(gizli — hash taşınmadı)',
                'password-hash-not-portable-manual-reset-required', 'huawei-vrp', 'manual');
        } else {
            ccDropField(ir, 'system', u.name, 'password', '',
                'no-password-source-manual-set-required', 'huawei-vrp', 'manual');
        }
        if (u.privilege !== undefined && u.privilege !== null && u.privilege !== '') {
            c += 'local-user ' + u.name + ' privilege level ' + u.privilege + '\n';
        }
        c += 'local-user ' + u.name + ' service-type ssh terminal\n';
    });

    // AAA modeli — sadece local authentication/authorization (bu kaynak configte
    // görülen model) için faithful bir karşılık var; diğer yöntemler (radius/tacacs)
    // manuel doğrulama gerektirir.
    if (ir.system.aaa) {
        const localAuth = (ir.system.aaa.authLogin || []).some(a => a.methods.includes('local'));
        const localAuthz = (ir.system.aaa.authorizationExec || []).some(a => a.methods.includes('local'));
        if (localAuth || localAuthz) {
            c += 'aaa\n';
            c += ' authentication-scheme default\n';
            c += '  authentication-mode local\n';
            c += ' authorization-scheme default\n';
            c += '  authorization-mode local\n';
            c += '#\n';
        }
        const nonLocal = (ir.system.aaa.authLogin || []).filter(a => !a.methods.includes('local'));
        nonLocal.forEach(a => {
            ccDropField(ir, 'system', 'aaa', 'authentication-login-' + a.name, a.methods.join(' '),
                'aaa-method-mapping-differs-configure-manually', 'huawei-vrp', 'manual');
        });
    }

    // SSH — Huawei STelnet servisi ve temel sunucu parametreleri
    if (ir.system.ssh) {
        c += 'stelnet ipv4 server enable\n';
        if (ir.system.ssh.timeout) c += 'ssh server timeout ' + ir.system.ssh.timeout + '\n';
        if (ir.system.ssh.authRetries) c += 'ssh server authentication-retries ' + ir.system.ssh.authRetries + '\n';
        if (ir.system.ssh.algorithms && ir.system.ssh.algorithms.length) {
            ccDropField(ir, 'system', 'ssh', 'algorithms', ir.system.ssh.algorithms.join('; '),
                'ssh-algorithm-names-not-portable-verify-manually', 'huawei-vrp', 'partial');
        }
        c += '#\n';
    }

    // VTY / konsol satırları — erişim listesi, yetki seviyesi, AAA authentication, SSH
    (ir.system.vty || []).forEach(v => {
        if (v.type !== 'vty') return;
        const rangeParts = v.range.split('-');
        c += 'user-interface vty ' + rangeParts[0] + (rangeParts[1] ? ' ' + rangeParts[1] : '') + '\n';
        if (v.accessClass) c += ' acl ' + v.accessClass + ' inbound\n';
        if (v.privilege) c += ' user privilege level ' + v.privilege + '\n';
        if (v.loginAuth) c += ' authentication-mode aaa\n';
        if (v.transportInput && v.transportInput.toLowerCase().includes('ssh')) c += ' protocol inbound ssh\n';
        c += '#\n';
    });

    // Log arabelleği / konsol seviyesi
    if (ir.system.logging) {
        if (ir.system.logging.buffered) {
            c += 'info-center logbuffer size ' + ir.system.logging.buffered.size + '\n';
        }
        if (ir.system.logging.console) {
            c += 'info-center console channel console\n';
            ccDropField(ir, 'system', 'logging', 'console-level', ir.system.logging.console,
                'log-severity-level-mapping-differs-verify-manually', 'huawei-vrp', 'partial');
        }
        c += '#\n';
    }

    // Cisco "archive" (config-change auto-logging) — VRP'de doğrudan karşılığı yok
    if (ir.system.archive) {
        ccDropField(ir, 'system', 'archive', 'config-change-logging', 'archive log config',
            'no-native-equivalent-cisco-specific', 'huawei-vrp', 'unsupported');
    }

    // Brute-force koruması (login block-for) — VRP'de syntax farklı, manuel yapılandırılmalı
    if (ir.system.loginSecurity) {
        ccDropField(ir, 'system', 'login-security', 'block-for', JSON.stringify(ir.system.loginSecurity),
            'brute-force-protection-syntax-differs-configure-manually', 'huawei-vrp', 'manual');
    }

    // Cisco'ya özgü kozmetik servis bayrakları (password-encryption, timestamps, tcp-keepalives)
    // — Huawei'de eşdeğer bir eylem gerekmiyor (varsayılan davranış zaten farklı/gereksiz)
    (ir.system.serviceFlags || []).forEach(f => {
        ccDropField(ir, 'system', 'service', f, '',
            'cisco-specific-toggle-no-action-needed-on-huawei', 'huawei-vrp', 'unsupported');
    });

    if (c) c += '#\n';
    return c;
}

// Juniper system section (DNS/NTP/syslog/SNMP)
function ccWriteSystemJuniper(ir) {
    if (!ir.system) return '';
    let c = '';
    (ir.system.dns || []).forEach(ip => { c += 'set system name-server ' + ip + '\n'; });
    (ir.system.ntp || []).forEach(ip => { c += 'set system ntp server ' + ip + '\n'; });
    (ir.system.syslog || []).forEach(ip => { c += 'set system syslog host ' + ip + ' any info\n'; });
    if (ir.system.snmp && ir.system.snmp.community) {
        c += 'set snmp community ' + ir.system.snmp.community + ' authorization ' + (ir.system.snmp.access === 'rw' ? 'read-write' : 'read-only') + '\n';
    }
    (ir.system.snmp_v3_users || []).forEach(u => {
        if (u.auth_proto) {
            const ap = u.auth_proto === 'md5' ? 'md5' : 'sha';
            c += 'set snmp v3 usm local-engine user ' + u.user + ' authentication-' + ap + ' authentication-password ' + u.auth_pwd + '\n';
        }
        if (u.priv_proto) {
            const pp = u.priv_proto === 'des' ? 'des' : (u.priv_proto.startsWith('aes') ? u.priv_proto : 'aes128');
            c += 'set snmp v3 usm local-engine user ' + u.user + ' privacy-' + pp + ' privacy-password ' + u.priv_pwd + '\n';
        }
    });
    if (c) c += '\n';
    return c;
}

// Juniper OSPF section
function ccWriteOspfJuniper(ir) {
    if (!ir.ospf || !ir.ospf.length) return '';
    let c = '';
    ir.ospf.forEach(proc => {
        if (proc.router_id) c += 'set routing-options router-id ' + proc.router_id + '\n';
        (proc.areas || []).forEach(area => {
            (area.networks || []).forEach(net => {
                c += 'set protocols ospf area ' + area.id + ' network ' + net + '\n';
            });
        });
    });
    return c;
}

// Juniper BGP section
function ccWriteBgpJuniper(ir) {
    if (!ir.bgp) return '';
    let c = '';
    if (ir.bgp.as_number) c += 'set routing-options autonomous-system ' + ir.bgp.as_number + '\n';
    (ir.bgp.neighbors || []).forEach(n => {
        c += 'set protocols bgp group PEERS neighbor ' + n.ip + '\n';
        if (n.remote_as) c += 'set protocols bgp group PEERS neighbor ' + n.ip + ' peer-as ' + n.remote_as + '\n';
        if (n.desc) c += 'set protocols bgp group PEERS neighbor ' + n.ip + ' description "' + n.desc + '"\n';
    });
    if (ir.bgp.networks && ir.bgp.networks.length) {
        ir.bgp.networks.forEach(net => {
            c += 'set policy-options prefix-list BGP_EXPORT_PREFIXES ' + net + '\n';
        });
        c += 'set policy-options policy-statement BGP_EXPORT term advertised from prefix-list BGP_EXPORT_PREFIXES\n';
        c += 'set policy-options policy-statement BGP_EXPORT term advertised then accept\n';
        c += 'set policy-options policy-statement BGP_EXPORT term reject-rest then reject\n';
        c += 'set protocols bgp group PEERS export BGP_EXPORT\n';
    }
    return c;
}


// ── Shared helper ─────────────────────────────────────────────────────────────
function ccWriteUnknowns(unknowns) {
    if (!unknowns || unknowns.length === 0) return '';
    return '\n! ---- Çevrilemeyen satırlar (' + unknowns.length + ') ----\n' +
        unknowns.map(u => '! ' + u).join('\n') + '\n';
}

// Cisco/Huawei/Juniper → Dell interface name normalize
// Dell OS10 her zaman ethernet stack/module/port (stack ≥ 1, module ≥ 1)
// GigabitEthernet1/0/1 → ethernet 1/1/1   (middle slot 0 → 1)
// GigabitEthernet0/0/1 → ethernet 1/1/1   (stack 0 → 1)
// GigabitEthernet0/1   → ethernet 1/1/1   (Cisco 2-seg → Dell 3-seg, default stack/module 1)
// ge-0/0/1             → ethernet 1/1/1
function ccNormalizeIfaceForDell(name) {
    if (!name) return name;
    let m;
    if ((m = name.match(/^Vlan(?:if)?(\d+)/i))) return 'vlan ' + m[1];
    if ((m = name.match(/^(?:Port-channel|PortChannel|port-channel)(\d+)/i))) return 'port-channel ' + m[1];
    if ((m = name.match(/^(GigabitEthernet|TenGigabitEthernet|XGigabitEthernet|ge-|xe-|et-|fe-)(.+)/i))) {
        const segs = m[2].split('/');
        let a, b, cc;
        if (segs.length === 2) { a = '1'; b = '1'; cc = segs[1]; }
        else if (segs.length === 3) {
            a = segs[0] === '0' ? '1' : segs[0]; // stack 0 → 1
            b = '1';
            cc = segs[2];
        } else return name;
        return 'ethernet ' + a + '/' + b + '/' + cc;
    }
    return name;
}
