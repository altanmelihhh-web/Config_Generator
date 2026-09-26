'use strict';

// ─── CLI Lab: FortiOS benzeri motor (eğitim simülatörü; FortiOS 7.4 görünümü, lab.fos = '7.6' ile 7.6) ───
// Şema güdümlü: tablo/tekil nesne · tip/enum · datasource referansı · zorunlu alan.
// Hata dizgeleri yalnız doğrulanmış olanlar (bkz. notes/arastirma-lab-github.md §4);
// doğrulanmamış "Return code -N" değerleri basılmaz.
const CgLabFgt = (() => {
    const C = (typeof CgLabCore !== 'undefined') ? CgLabCore : require('./core.js');
    const { pad, isIp, maskLen, lenMask, sameNet, netOf, ip2n, n2ip, fakeHash } = C;

    // ── Tokenizer: tırnaklı değerleri tek parça sayar, ofset tutar
    function tok(s) {
        const out = []; let i = 0;
        while (i < s.length) {
            if (/\s/.test(s[i])) { i++; continue; }
            const o = i;
            if (s[i] === '"' || s[i] === "'") {
                const q = s[i++]; let v = '';
                while (i < s.length && s[i] !== q) { if (s[i] === '\\' && i + 1 < s.length) i++; v += s[i++]; }
                i++; out.push({ t: v, o, q: true });
            } else {
                let v = '';
                while (i < s.length && !/\s/.test(s[i])) v += s[i++];
                out.push({ t: v, o });
            }
        }
        return out;
    }
    const qt = v => '"' + String(v).replace(/"/g, '\\"') + '"';

    // ── Şema (FortiOS 7.4 alt kümesi)
    const ED = ['enable', 'disable'];
    const P1PROP = ['aes128-sha1', 'aes128-sha256', 'aes256-sha1', 'aes256-sha256', 'aes256-sha384', 'aes256-sha512', 'aes128gcm-prfsha256', 'aes256gcm-prfsha384', 'chacha20poly1305-prfsha256'];
    const P2PROP = ['aes128-sha1', 'aes128-sha256', 'aes256-sha1', 'aes256-sha256', 'aes256-sha384', 'aes256-sha512', 'aes128gcm', 'aes256gcm', 'chacha20poly1305'];
    const DHG = ['1', '2', '5', '14', '15', '16', '19', '20', '21', '31', '32'];
    const ACCESS = ['ping', 'https', 'ssh', 'http', 'snmp', 'fgfm', 'telnet', 'radius-acct', 'probe-response', 'fabric', 'ftm', 'speed-test'];
    // FortiOS 7.6.6 CLI Ref (config system interface → allowaccess): yalnız 7.6'da eklenen değerler
    const ACCESS76 = ['scim', 'dnp', 'icond'];
    const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'none'];
    const SCHEMA = {
        'system global': { single: true, attrs: {
            hostname: { t: 'str', max: 35, d: 'Cihaz adı' }, timezone: { t: 'str', d: 'Saat dilimi' },
            admintimeout: { t: 'int', min: 1, max: 480, def: 5, d: 'Yönetici oturum zaman aşımı (dk)' },
            'admin-sport': { t: 'int', min: 1, max: 65535, def: 443, d: 'HTTPS yönetim portu' },
            'admin-ssh-port': { t: 'int', min: 1, max: 65535, def: 22, d: 'SSH yönetim portu' },
            'admin-https-redirect': { t: 'enum', v: ED, def: 'enable', d: 'HTTP yönetim isteklerini HTTPS\'e yönlendir' },
            'admin-https-ssl-versions': { t: 'menum', v: ['tlsv1-1', 'tlsv1-2', 'tlsv1-3'], def: ['tlsv1-2', 'tlsv1-3'], d: 'Yönetim HTTPS için izinli TLS sürümleri' },
            'strong-crypto': { t: 'enum', v: ED, def: 'enable', d: 'Yalnız güçlü şifreleme (HTTPS/SSH yönetimi)' },
            'admin-lockout-threshold': { t: 'int', min: 1, max: 10, def: 3, d: 'Kilitlenmeden önceki hatalı giriş sayısı' },
            'admin-lockout-duration': { t: 'int', min: 1, max: 2147483647, def: 60, d: 'Kilit süresi (sn)' },
            'pre-login-banner': { t: 'enum', v: ED, def: 'disable', d: 'Giriş öncesi uyarı afişi' } } },
        'system ha': { single: true, attrs: {
            'group-name': { t: 'str', max: 32, d: 'Küme adı (iki üyede aynı)' },
            mode: { t: 'enum', v: ['standalone', 'a-p', 'a-a'], def: 'standalone', d: 'HA modu' },
            password: { t: 'secret', d: 'Küme parolası (iki üyede aynı)' },
            hbdev: { t: 'hb', d: 'Heartbeat arayüzü ve önceliği, ör. "port4" 50' },
            'session-pickup': { t: 'enum', v: ED, def: 'disable', d: 'Oturumları ikinciye eşitle' },
            override: { t: 'enum', v: ED, def: 'disable', d: 'Önceliği uptime\'ın önüne koy' },
            priority: { t: 'int', min: 0, max: 255, def: 128, d: 'Öncelik (yüksek = birincil adayı)' },
            monitor: { t: 'refs', ds: 'physIntf', d: 'İzlenen arayüzler (düşerse failover)' } } },
        'system dns': { single: true, attrs: { primary: { t: 'ip', def: '0.0.0.0', d: 'Birincil DNS' }, secondary: { t: 'ip', def: '0.0.0.0', d: 'İkincil DNS' } } },
        'system interface': { key: 'name', fixed: true, attrs: {
            vdom: { t: 'str', def: 'root', d: 'VDOM' }, mode: { t: 'enum', v: ['static', 'dhcp', 'pppoe'], def: 'static', d: 'Adresleme modu' },
            ip: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'IP adresi ve maske' },
            allowaccess: { t: 'menum', v: ACCESS, v76: ACCESS76, d: 'Bu arayüzde izinli yönetim erişimi' },
            status: { t: 'enum', v: ['up', 'down'], def: 'up', d: 'Yönetsel durum' },
            type: { t: 'ro', def: 'physical', d: 'Arayüz tipi' },
            alias: { t: 'str', max: 25, d: 'Takma ad' }, description: { t: 'str', max: 255, d: 'Açıklama' },
            role: { t: 'enum', v: ['lan', 'wan', 'dmz', 'undefined'], def: 'undefined', d: 'Arayüz rolü' },
            interface: { t: 'ref', ds: 'physIntf', when: o => o.type === 'vlan', d: 'Üst (fiziksel) arayüz' },
            vlanid: { t: 'int', min: 1, max: 4094, when: o => o.type === 'vlan', d: 'VLAN kimliği (802.1Q etiketi)' },
            'snmp-index': { t: 'ro', d: 'SNMP indeksi' } } },
        'system admin': { key: 'name', req: ['accprofile'], attrs: {
            accprofile: { t: 'ref', ds: 'accprofile', d: 'Yetki profili' }, password: { t: 'secret', d: 'Parola' },
            trusthost1: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 1' },
            trusthost2: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 2' },
            trusthost3: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Güvenilir yönetim ağı 3' },
            'remote-auth': { t: 'enum', v: ED, def: 'disable', d: 'Kimlik doğrulama uzak sunucuda (RADIUS/LDAP)' },
            'remote-group': { t: 'ref', ds: 'ugroups', when: o => o['remote-auth'] === 'enable', d: 'Uzak sunucu grubunu içeren kullanıcı grubu' },
            wildcard: { t: 'enum', v: ED, def: 'disable', when: o => o['remote-auth'] === 'enable', d: 'Gruptaki herhangi bir kullanıcı bu hesapla girebilir' } } },
        'firewall address': { key: 'name', attrs: {
            type: { t: 'enum', v: ['ipmask', 'iprange', 'fqdn'], def: 'ipmask', d: 'Adres tipi' },
            subnet: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', when: o => (o.type || 'ipmask') === 'ipmask', d: 'Alt ağ' },
            'start-ip': { t: 'ip', def: '0.0.0.0', when: o => o.type === 'iprange', d: 'Aralık başı' },
            'end-ip': { t: 'ip', def: '0.0.0.0', when: o => o.type === 'iprange', d: 'Aralık sonu' },
            fqdn: { t: 'str', max: 255, when: o => o.type === 'fqdn', d: 'Tam alan adı' },
            'associated-interface': { t: 'ref', ds: 'intf', d: 'İlişkili arayüz' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall addrgrp': { key: 'name', req: ['member'], attrs: {
            member: { t: 'refs', ds: 'addrgrpMember', d: 'Üye adres nesneleri' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall service custom': { key: 'name', attrs: {
            protocol: { t: 'enum', v: ['TCP/UDP/SCTP', 'ICMP', 'ICMP6', 'IP'], def: 'TCP/UDP/SCTP', d: 'Protokol ailesi' },
            'tcp-portrange': { t: 'ports', d: 'TCP hedef port(lar)ı, ör. 443 ya da 8000-8080' },
            'udp-portrange': { t: 'ports', d: 'UDP hedef port(lar)ı' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall service group': { key: 'name', req: ['member'], attrs: {
            member: { t: 'refs', ds: 'svcgrpMember', d: 'Üye servisler' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall ippool': { key: 'name', req: ['startip', 'endip'], attrs: {
            type: { t: 'enum', v: ['overload', 'one-to-one', 'fixed-port-range', 'port-block-allocation'], def: 'overload', d: 'Havuz tipi' },
            startip: { t: 'ip', def: '0.0.0.0', d: 'Başlangıç IP' }, endip: { t: 'ip', def: '0.0.0.0', d: 'Bitiş IP' },
            comments: { t: 'str', max: 255, d: 'Açıklama' } } },
        'firewall vip': { key: 'name', req: ['extip', 'mappedip'], attrs: {
            comment: { t: 'str', max: 255, d: 'Açıklama' },
            extip: { t: 'iprange', d: 'Dış (genel) IP' }, mappedip: { t: 'iprangeq', d: 'İç (gerçek) IP' },
            extintf: { t: 'ref', ds: 'intfAny', def: 'any', d: 'Dış arayüz' },
            portforward: { t: 'enum', v: ED, def: 'disable', d: 'Port yönlendirme' },
            protocol: { t: 'enum', v: ['tcp', 'udp', 'sctp', 'icmp'], def: 'tcp', when: o => o.portforward === 'enable', d: 'Protokol' },
            extport: { t: 'port1', when: o => o.portforward === 'enable', d: 'Dış port' },
            mappedport: { t: 'port1', when: o => o.portforward === 'enable', d: 'İç port' } } },
        'firewall policy': { key: 'policyid', num: true, move: true, req: ['srcintf', 'dstintf', 'srcaddr', 'dstaddr', 'schedule', 'service'], attrs: {
            name: { t: 'str', max: 35, d: 'Kural adı' },
            srcintf: { t: 'refs', ds: 'intfAny', d: 'Gelen arayüz' }, dstintf: { t: 'refs', ds: 'intfAny', d: 'Giden arayüz' },
            action: { t: 'enum', v: ['accept', 'deny'], def: 'deny', d: 'Eylem' },
            srcaddr: { t: 'refs', ds: 'addr', d: 'Kaynak adres' }, dstaddr: { t: 'refs', ds: 'addrVip', d: 'Hedef adres (VIP dahil)' },
            schedule: { t: 'ref', ds: 'sched', d: 'Zamanlama' }, service: { t: 'refs', ds: 'svc', d: 'Servis' },
            groups: { t: 'refs', ds: 'ugroups', d: 'Kimlik doğrulamalı kural: kullanıcı grupları' },
            'utm-status': { t: 'enum', v: ED, def: 'disable', d: 'Güvenlik profilleri' },
            'inspection-mode': { t: 'enum', v: ['flow', 'proxy'], def: 'flow', when: o => o['utm-status'] === 'enable', d: 'İnceleme modu' },
            'ssl-ssh-profile': { t: 'ref', ds: 'sslProf', def: 'no-inspection', when: o => o['utm-status'] === 'enable', d: 'SSL/SSH inceleme profili' },
            'av-profile': { t: 'ref', ds: 'avProf', when: o => o['utm-status'] === 'enable', d: 'Antivirüs profili' },
            'webfilter-profile': { t: 'ref', ds: 'wfProf', when: o => o['utm-status'] === 'enable', d: 'Web filtre profili' },
            'application-list': { t: 'ref', ds: 'appList', when: o => o['utm-status'] === 'enable', d: 'Uygulama kontrolü listesi' },
            'ips-sensor': { t: 'ref', ds: 'ipsSens', when: o => o['utm-status'] === 'enable', d: 'IPS sensörü' },
            'dnsfilter-profile': { t: 'ref', ds: 'dnsProf', when: o => o['utm-status'] === 'enable', d: 'DNS filtre profili' },
            logtraffic: { t: 'enum', v: ['all', 'utm', 'disable'], def: 'utm', d: 'Trafik logu' },
            nat: { t: 'enum', v: ED, def: 'disable', d: 'Kaynak NAT' },
            ippool: { t: 'enum', v: ED, def: 'disable', when: o => o.nat === 'enable', d: 'IP havuzu kullan' },
            poolname: { t: 'refs', ds: 'ippool', when: o => o.nat === 'enable' && o.ippool === 'enable', d: 'IP havuzu' },
            status: { t: 'enum', v: ED, def: 'enable', d: 'Kural durumu' },
            comments: { t: 'str', max: 1023, d: 'Açıklama' } } },
        'vpn ipsec phase1-interface': { key: 'name', req: ['interface', 'remote-gw', 'psksecret'], attrs: {
            interface: { t: 'ref', ds: 'physIntf', d: 'Tünelin çıktığı (WAN) arayüz' },
            'ike-version': { t: 'enum', v: ['1', '2'], d: 'IKE sürümü' },
            'remote-gw': { t: 'ip', d: 'Karşı uç genel IP' },
            proposal: { t: 'menum', v: P1PROP, d: 'Faz 1 şifreleme-özet önerileri' },
            dhgrp: { t: 'menum', v: DHG, d: 'Diffie-Hellman grupları' },
            psksecret: { t: 'secret', d: 'Ön paylaşımlı anahtar' },
            dpd: { t: 'enum', v: ['disable', 'on-idle', 'on-demand'], d: 'Ölü uç tespiti' },
            nattraversal: { t: 'enum', v: ['enable', 'disable', 'forced'], d: 'NAT-T' },
            comments: { t: 'str', max: 255, d: 'Açıklama' } } },
        'vpn ipsec phase2-interface': { key: 'name', req: ['phase1name'], attrs: {
            phase1name: { t: 'ref', ds: 'p1', d: 'Bağlı olduğu faz 1' },
            proposal: { t: 'menum', v: P2PROP, d: 'Faz 2 önerileri' },
            pfs: { t: 'enum', v: ED, def: 'enable', d: 'Perfect forward secrecy' },
            dhgrp: { t: 'menum', v: DHG, when: o => (o.pfs || 'enable') === 'enable', d: 'PFS DH grupları' },
            'auto-negotiate': { t: 'enum', v: ED, def: 'disable', d: 'Trafik beklemeden SA kur' },
            'src-subnet': { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Yerel seçici (bizim ağ)' },
            'dst-subnet': { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Uzak seçici (karşı ağ)' },
            keylifeseconds: { t: 'int', min: 120, max: 172800, def: 43200, d: 'SA ömrü (sn)' },
            comments: { t: 'str', max: 255, d: 'Açıklama' } } },
        'user local': { key: 'name', req: ['passwd'], attrs: {
            type: { t: 'enum', v: ['password'], def: 'password', d: 'Kimlik doğrulama tipi' },
            passwd: { t: 'secret', d: 'Parola' },
            status: { t: 'enum', v: ED, def: 'enable', d: 'Hesap durumu' } } },
        'user group': { key: 'name', req: ['member'], attrs: { member: { t: 'refs', ds: 'users', d: 'Üye kullanıcılar' } } },
        'vpn ssl web portal': { key: 'name', attrs: {
            'tunnel-mode': { t: 'enum', v: ED, def: 'disable', only74: true, d: 'Tünel (FortiClient) erişimi' },
            'web-mode': { t: 'enum', v: ED, def: 'disable', d: 'Web portal erişimi' },
            'ip-pools': { t: 'refs', ds: 'addr', only74: true, when: o => o['tunnel-mode'] === 'enable', d: 'İstemci IP havuzu' },
            'split-tunneling': { t: 'enum', v: ED, def: 'disable', only74: true, when: o => o['tunnel-mode'] === 'enable', d: 'Yalnız iç ağ trafiği tünelden' },
            'split-tunneling-routing-address': { t: 'refs', ds: 'addr', only74: true, when: o => o['tunnel-mode'] === 'enable' && o['split-tunneling'] === 'enable', d: 'Tünelden gidecek ağlar' } } },
        'vpn ssl settings': { single: true, children: ['authentication-rule'], attrs: {
            servercert: { t: 'str', def: 'Fortinet_Factory', d: 'Sunucu sertifikası' },
            'tunnel-ip-pools': { t: 'refs', ds: 'addr', only74: true, d: 'Varsayılan istemci IP havuzu' },
            'source-interface': { t: 'refs', ds: 'physIntf', d: 'SSL-VPN\'in dinlediği arayüz(ler)' },
            'source-address': { t: 'refs', ds: 'addr', d: 'Bağlanabilecek kaynak adresler' },
            port: { t: 'int', min: 1, max: 65535, def: 443, d: 'SSL-VPN portu' } } },
        'vpn ssl settings authentication-rule': { key: 'id', num: true, parent: 'vpn ssl settings', sub: 'authentication-rule', req: ['portal'], attrs: {
            groups: { t: 'refs', ds: 'ugroups', d: 'Kullanıcı grupları' },
            portal: { t: 'ref', ds: 'portal', d: 'Portal' } } },
        'system zone': { key: 'name', attrs: {
            interface: { t: 'refs', ds: 'zoneMember', d: 'Üye arayüzler' },
            intrazone: { t: 'enum', v: ['allow', 'deny'], def: 'deny', d: 'Zone içi (üyeler arası) trafik' },
            description: { t: 'str', max: 127, d: 'Açıklama' } } },
        'system dhcp server': { key: 'id', num: true, children: ['ip-range'], req: ['interface', 'netmask'], attrs: {
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' },
            'lease-time': { t: 'int', min: 300, max: 8640000, def: 604800, d: 'Kira süresi (sn)' },
            'dns-service': { t: 'enum', v: ['local', 'default', 'specify'], def: 'specify', d: 'İstemciye verilecek DNS kaynağı' },
            'dns-server1': { t: 'ip', def: '0.0.0.0', when: o => (o['dns-service'] || 'specify') === 'specify', d: 'DNS sunucusu 1' },
            'default-gateway': { t: 'ip', def: '0.0.0.0', d: 'İstemciye verilecek ağ geçidi' },
            netmask: { t: 'ip', def: '0.0.0.0', d: 'Alt ağ maskesi' },
            interface: { t: 'ref', ds: 'intf', d: 'DHCP sunucusunun çalıştığı arayüz' } } },
        'system dhcp server ip-range': { key: 'id', num: true, parent: 'system dhcp server', sub: 'ip-range', req: ['start-ip', 'end-ip'], attrs: {
            'start-ip': { t: 'ip', def: '0.0.0.0', d: 'Aralık başı' }, 'end-ip': { t: 'ip', def: '0.0.0.0', d: 'Aralık sonu' } } },
        'system ntp': { single: true, children: ['ntpserver'], attrs: {
            ntpsync: { t: 'enum', v: ED, def: 'enable', d: 'NTP ile saat eşitle' },
            type: { t: 'enum', v: ['fortiguard', 'custom'], def: 'fortiguard', d: 'NTP sunucu kaynağı' },
            syncinterval: { t: 'int', min: 1, max: 1440, def: 60, d: 'Eşitleme aralığı (dk)' } } },
        'system ntp ntpserver': { key: 'id', num: true, parent: 'system ntp', sub: 'ntpserver', req: ['server'], attrs: {
            server: { t: 'str', max: 63, d: 'NTP sunucu adresi' } } },
        'user radius': { key: 'name', req: ['server', 'secret'], attrs: {
            server: { t: 'str', max: 63, d: 'RADIUS sunucu adresi' }, secret: { t: 'secret', d: 'Paylaşılan anahtar' },
            'auth-type': { t: 'enum', v: ['auto', 'ms_chap_v2', 'ms_chap', 'chap', 'pap'], def: 'auto', d: 'Kimlik doğrulama yöntemi' } } },
        'user ldap': { key: 'name', req: ['server', 'dn'], attrs: {
            server: { t: 'str', max: 63, d: 'LDAP sunucu adresi' }, cnid: { t: 'str', max: 20, def: 'cn', d: 'Kullanıcı adı özniteliği' },
            dn: { t: 'str', max: 511, d: 'Arama kökü (distinguished name)' },
            type: { t: 'enum', v: ['simple', 'anonymous', 'regular'], def: 'simple', d: 'Bağlanma (bind) tipi' },
            username: { t: 'str', max: 511, when: o => o.type === 'regular', d: 'Bind kullanıcısı' },
            password: { t: 'secret', when: o => o.type === 'regular', d: 'Bind parolası' },
            secure: { t: 'enum', v: ['disable', 'starttls', 'ldaps'], def: 'disable', d: 'Şifreli bağlantı' },
            port: { t: 'int', min: 1, max: 65535, def: 389, d: 'Port' } } },
        'log syslogd setting': { single: true, attrs: {
            status: { t: 'enum', v: ED, def: 'disable', d: 'Syslog\'a gönder' },
            server: { t: 'str', max: 127, when: o => o.status === 'enable', d: 'Syslog sunucusu' },
            mode: { t: 'enum', v: ['udp', 'legacy-reliable', 'reliable'], def: 'udp', when: o => o.status === 'enable', d: 'Taşıma (UDP / güvenilir TCP)' },
            port: { t: 'int', min: 1, max: 65535, def: 514, when: o => o.status === 'enable', d: 'Port' },
            facility: { t: 'enum', v: ['kernel', 'user', 'mail', 'daemon', 'auth', 'syslog', 'local0', 'local1', 'local2', 'local3', 'local4', 'local5', 'local6', 'local7'], def: 'local7', when: o => o.status === 'enable', d: 'Syslog facility' },
            format: { t: 'enum', v: ['default', 'csv', 'cef', 'rfc5424'], def: 'default', when: o => o.status === 'enable', d: 'Log biçimi' } } },
        'router static': { key: 'seq-num', num: true, attrs: {
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' },
            dst: { t: 'ipmask', def: '0.0.0.0 0.0.0.0', d: 'Hedef ağ' },
            gateway: { t: 'ip', def: '0.0.0.0', d: 'Ağ geçidi' },
            distance: { t: 'int', min: 1, max: 255, def: 10, d: 'Yönetsel mesafe' },
            priority: { t: 'int', min: 1, max: 65535, def: 1, d: 'Öncelik (aynı mesafede)' },
            device: { t: 'ref', ds: 'intf', d: 'Çıkış arayüzü' },
            blackhole: { t: 'enum', v: ED, def: 'disable', d: 'Kara delik rota' },
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        // ── Parti 2 (M1–M6). Kaynak: FortiOS 7.4.8 CLI Reference (7.6.6'da aynı alanlar):
        // webfilter urlfilter (333203621), webfilter profile (285848147), dnsfilter domain-filter (238558396),
        // dnsfilter profile (111629848), ips sensor (237852230), application list (117262721),
        // firewall ssl-ssh-profile (116695140), system settings (130421147), log setting (196223761),
        // firewall central-snat-map (135632652), firewall schedule recurring (161573977).
        'webfilter urlfilter': { key: 'id', num: true, children: ['entries'], req: ['name'], attrs: {
            name: { t: 'str', max: 63, d: 'Liste adı' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'webfilter urlfilter entries': { key: 'id', num: true, parent: 'webfilter urlfilter', sub: 'entries', req: ['url'], attrs: {
            url: { t: 'str', max: 511, d: 'URL ya da alan adı (ör. www.example.com/oyun)' },
            type: { t: 'enum', v: ['simple', 'regex', 'wildcard'], def: 'simple', d: 'Eşleşme tipi' },
            action: { t: 'enum', v: ['exempt', 'block', 'allow', 'monitor'], def: 'exempt', d: 'Eylem' },
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' } } },
        'webfilter profile': { key: 'name', children: ['web', 'ftgd-wf'], attrs: {
            comment: { t: 'str', max: 255, d: 'Açıklama' },
            'feature-set': { t: 'enum', v: ['flow', 'proxy'], def: 'flow', d: 'Akış / proxy tabanlı' } } },
        'webfilter profile web': { single: true, parent: 'webfilter profile', sub: 'web', attrs: {
            'urlfilter-table': { t: 'refn', ds: 'urlTbl', d: 'Statik URL filtre listesi (webfilter urlfilter kimliği)' } } },
        'webfilter profile ftgd-wf': { single: true, parent: 'webfilter profile', sub: 'ftgd-wf', children: ['filters'], attrs: {} },
        'webfilter profile ftgd-wf filters': { key: 'id', num: true, parent: 'webfilter profile ftgd-wf', sub: 'filters', req: ['category'], attrs: {
            category: { t: 'int', min: 0, max: 255, d: 'FortiGuard kategori numarası' },
            action: { t: 'enum', v: ['block', 'authenticate', 'monitor', 'warning'], def: 'monitor', d: 'Eylem' },
            log: { t: 'enum', v: ED, def: 'enable', d: 'Logla' } } },
        'dnsfilter domain-filter': { key: 'id', num: true, children: ['entries'], req: ['name'], attrs: {
            name: { t: 'str', max: 63, d: 'Liste adı' }, comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'dnsfilter domain-filter entries': { key: 'id', num: true, parent: 'dnsfilter domain-filter', sub: 'entries', req: ['domain'], attrs: {
            domain: { t: 'str', max: 511, d: 'Alan adı' },
            type: { t: 'enum', v: ['simple', 'regex', 'wildcard'], def: 'simple', d: 'Eşleşme tipi' },
            action: { t: 'enum', v: ['block', 'allow', 'monitor'], def: 'block', d: 'Eylem' },
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' } } },
        'dnsfilter profile': { key: 'name', children: ['domain-filter', 'ftgd-dns'], attrs: {
            comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'dnsfilter profile domain-filter': { single: true, parent: 'dnsfilter profile', sub: 'domain-filter', attrs: {
            'domain-filter-table': { t: 'refn', ds: 'dnsTbl', d: 'Statik alan filtresi (dnsfilter domain-filter kimliği)' } } },
        'dnsfilter profile ftgd-dns': { single: true, parent: 'dnsfilter profile', sub: 'ftgd-dns', children: ['filters'], attrs: {} },
        'dnsfilter profile ftgd-dns filters': { key: 'id', num: true, parent: 'dnsfilter profile ftgd-dns', sub: 'filters', req: ['category'], attrs: {
            category: { t: 'int', min: 0, max: 255, d: 'FortiGuard kategori numarası' },
            action: { t: 'enum', v: ['block', 'monitor'], def: 'monitor', d: 'Eylem' },
            log: { t: 'enum', v: ED, def: 'enable', d: 'Logla' } } },
        'ips sensor': { key: 'name', children: ['entries'], attrs: { comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'ips sensor entries': { key: 'id', num: true, parent: 'ips sensor', sub: 'entries', attrs: {
            severity: { t: 'menum', v: ['info', 'low', 'medium', 'high', 'critical'], d: 'İmza önem düzeyleri (boş = tümü)' },
            action: { t: 'enum', v: ['pass', 'block', 'reset', 'default'], def: 'default', d: 'Eylem (default = imzanın kendi eylemi)' },
            status: { t: 'enum', v: ['disable', 'enable', 'default'], def: 'default', d: 'İmza durumu' },
            log: { t: 'enum', v: ['disable', 'enable'], def: 'enable', d: 'Logla' } } },
        'application list': { key: 'name', children: ['entries'], attrs: { comment: { t: 'str', max: 255, d: 'Açıklama' } } },
        'application list entries': { key: 'id', num: true, parent: 'application list', sub: 'entries', attrs: {
            category: { t: 'ints', max: 255, d: 'Uygulama kategori numaraları' },
            application: { t: 'ints', max: 99999999, d: 'Uygulama imza numaraları' },
            action: { t: 'enum', v: ['pass', 'block', 'reset'], def: 'block', d: 'Eylem' },
            log: { t: 'enum', v: ['disable', 'enable'], def: 'enable', d: 'Logla' } } },
        'firewall ssl-ssh-profile': { key: 'name', children: ['https', 'ssl-exempt'], attrs: {
            comment: { t: 'str', max: 255, d: 'Açıklama' },
            caname: { t: 'str', max: 35, def: 'Fortinet_CA_SSL', d: 'Derin incelemede imza atan CA sertifikası' } } },
        'firewall ssl-ssh-profile https': { single: true, parent: 'firewall ssl-ssh-profile', sub: 'https', attrs: {
            ports: { t: 'ports1', def: ['443'], d: 'İncelenen portlar' },
            status: { t: 'enum', v: ['disable', 'certificate-inspection', 'deep-inspection'], def: 'deep-inspection', d: 'İnceleme düzeyi' } } },
        'firewall ssl-ssh-profile ssl-exempt': { key: 'id', num: true, parent: 'firewall ssl-ssh-profile', sub: 'ssl-exempt', attrs: {
            type: { t: 'enum', v: ['fortiguard-category', 'address', 'wildcard-fqdn'], def: 'fortiguard-category', d: 'Muafiyet tipi' },
            'fortiguard-category': { t: 'int', min: 0, max: 255, def: '0', when: o => (o.type || 'fortiguard-category') === 'fortiguard-category', d: 'FortiGuard kategori numarası' },
            address: { t: 'ref', ds: 'addr', when: o => o.type === 'address', d: 'Adres nesnesi' },
            'wildcard-fqdn': { t: 'str', max: 79, when: o => o.type === 'wildcard-fqdn', d: 'Joker alan adı (ör. *.example.com)' } } },
        'system settings': { single: true, attrs: {
            'central-nat': { t: 'enum', v: ED, def: 'disable', d: 'Merkezi NAT (SNAT kurallardan değil central-snat-map\'ten)' },
            'allow-subnet-overlap': { t: 'enum', v: ED, def: 'disable', d: 'Arayüz alt ağlarının çakışmasına izin ver' } } },
        'log setting': { single: true, attrs: {
            'fwpolicy-implicit-log': { t: 'enum', v: ED, def: 'disable', d: 'Örtük (policy 0) deny trafiğini logla' } } },
        'firewall central-snat-map': { key: 'policyid', num: true, move: true, req: ['srcintf', 'dstintf', 'orig-addr', 'dst-addr'], attrs: {
            status: { t: 'enum', v: ED, def: 'enable', d: 'Durum' },
            srcintf: { t: 'refs', ds: 'intfAny', d: 'Gelen arayüz' }, dstintf: { t: 'refs', ds: 'intfAny', d: 'Giden arayüz' },
            'orig-addr': { t: 'refs', ds: 'addr', d: 'Özgün kaynak adres' }, 'dst-addr': { t: 'refs', ds: 'addr', d: 'Hedef adres' },
            nat: { t: 'enum', v: ED, def: 'enable', d: 'Kaynak NAT' },
            'nat-ippool': { t: 'refs', ds: 'ippool', when: o => (o.nat || 'enable') === 'enable', d: 'IP havuzu (boşsa çıkış arayüzü IP\'si)' },
            comments: { t: 'str', max: 1023, d: 'Açıklama' } } },
        'firewall schedule recurring': { key: 'name', attrs: {
            day: { t: 'menum', v: DAYS, def: ['none'], d: 'Günler' },
            start: { t: 'hhmm', def: '00:00', d: 'Başlangıç (ss:dd)' },
            end: { t: 'hhmm', def: '00:00', d: 'Bitiş (ss:dd)' } } },
    };
    const ALLP = Object.keys(SCHEMA), PATHS = ALLP.filter(p => !SCHEMA[p].parent);
    // Parti 2'de eklenen tablolar: boşken tam "show" çıktısında ve HA sağlamasında yer almaz (mevcut lab çıktıları aynen kalır)
    const NEWP = new Set(['webfilter urlfilter', 'webfilter profile', 'dnsfilter domain-filter', 'dnsfilter profile', 'ips sensor', 'application list', 'firewall ssl-ssh-profile', 'system settings', 'log setting', 'firewall central-snat-map', 'firewall schedule recurring']);
    const childPath = (p, sub) => ALLP.find(q => SCHEMA[q].parent === p && SCHEMA[q].sub === sub);
    const SERVICES = ['ALL', 'ALL_TCP', 'ALL_UDP', 'ALL_ICMP', 'PING', 'HTTP', 'HTTPS', 'SSH', 'DNS', 'NTP', 'SMTP', 'RDP', 'TELNET', 'SNMP', 'FTP'];
    const GETS = ['system status', 'system performance status', 'system session status', 'system session list', 'router info routing-table all', 'router info routing-table database', 'router info routing-table details', 'vpn ipsec tunnel summary', 'system arp', 'system ha status', 'vpn ssl monitor'];

    function session(lab, opts) {
        const S = { lab, ctx: null, ev: [], hist: [], pending: null, loggedOut: false, answers: {} };
        // F76-L0b: FortiOS sürümü (oturum seçeneği > lab alanı > 7.4). 7.4 lab'larının davranışı değişmez.
        const FOS = String((opts && opts.fos) || lab.fos || '7.4'), IS76 = parseFloat(FOS) >= 7.6;
        const attrOk = a => !(a.only74 && IS76);
        S.variant = lab.variants ? lab.variants[((opts && opts.variant) || 0) % lab.variants.length] : null;
        // Teşhis simülasyonu verisi (lab.sim + varyant.sim): perf, procs, flows, hosts, ports, arp …
        const SIM = Object.assign({}, lab.sim || {}, (S.variant && S.variant.sim) || {});
        // ── model
        function baseModel() {
            const m = { host: lab.hostname || 'FortiGate-VM64', t: {}, links: {} };
            for (const p of ALLP) m.t[p] = SCHEMA[p].single ? {} : { o: [], v: {} };
            ['full-access', 'tunnel-access', 'web-access'].forEach(n => tAdd(m, 'vpn ssl web portal', n, n === 'web-access' ? { 'web-mode': 'enable' } : n === 'tunnel-access' ? { 'tunnel-mode': 'enable' } : { 'tunnel-mode': 'enable', 'web-mode': 'enable' }));
            (lab.ports || ['port1', 'port2', 'port3', 'port4']).forEach((n, i) => { tAdd(m, 'system interface', n, { vdom: 'root', type: 'physical', 'snmp-index': String(i + 1) }); });
            tAdd(m, 'system admin', 'admin', { accprofile: 'super_admin' });
            tAdd(m, 'firewall address', 'all', { _builtin: true });
            tAdd(m, 'firewall address', 'none', { subnet: '0.0.0.0 255.255.255.255', _builtin: true });
            (lab.up || []).forEach(n => { m.links[n] = true; });
            m.t['system global'].hostname = lab.hostname || 'FortiGate-VM64';
            return m;
        }
        function tAdd(m, p, k, o) { const t = m.t[p]; if (!t.v[k]) t.o.push(String(k)); t.v[k] = o; }
        S.m = baseModel();
        const M = () => S.m;
        const host = () => M().t['system global'].hostname || 'FortiGate-VM64';
        const log = o => S.ev.push(o);

        // ── datasource
        const DS = {
            intf: () => M().t['system interface'].o.concat(M().t['vpn ipsec phase1-interface'].o, ['ssl.root']),
            // Politika arayüzü: zone'a üye arayüzler doğrudan seçilemez, zone seçilir
            intfAny: () => ['any'].concat(M().t['system interface'].o.filter(n => !zoneOf(n)), M().t['system zone'].o, M().t['vpn ipsec phase1-interface'].o, ['ssl.root']),
            zoneMember: () => M().t['system interface'].o.filter(n => !zoneOf(n) || (S.ctx && S.ctx.path === 'system zone' && zoneOf(n) === S.ctx.key)),
            sslProf: () => ['certificate-inspection', 'deep-inspection', 'no-inspection', 'custom-deep-inspection'].concat(M().t['firewall ssl-ssh-profile'].o),
            avProf: () => ['default', 'wifi-default'], wfProf: () => ['default', 'monitor-all', 'wifi-default'].concat(M().t['webfilter profile'].o),
            appList: () => ['default', 'block-high-risk', 'wifi-default'].concat(M().t['application list'].o), ipsSens: () => ['default', 'all_default', 'all_default_pass', 'high_security', 'protect_client', 'protect_http_server', 'wifi-default'].concat(M().t['ips sensor'].o),
            dnsProf: () => ['default'].concat(M().t['dnsfilter profile'].o),
            urlTbl: () => M().t['webfilter urlfilter'].o, dnsTbl: () => M().t['dnsfilter domain-filter'].o,
            physIntf: () => M().t['system interface'].o,
            p1: () => M().t['vpn ipsec phase1-interface'].o,
            users: () => M().t['user local'].o.concat(M().t['user radius'].o, M().t['user ldap'].o), ugroups: () => M().t['user group'].o, portal: () => M().t['vpn ssl web portal'].o,
            addr: () => M().t['firewall address'].o.concat(M().t['firewall addrgrp'].o),
            addrVip: () => M().t['firewall address'].o.concat(M().t['firewall addrgrp'].o, M().t['firewall vip'].o),
            addrgrpMember: () => M().t['firewall address'].o.filter(n => n !== 'none').concat(M().t['firewall addrgrp'].o),
            svc: () => SERVICES.concat(M().t['firewall service custom'].o, M().t['firewall service group'].o),
            svcgrpMember: () => SERVICES.concat(M().t['firewall service custom'].o, M().t['firewall service group'].o),
            sched: () => ['always', 'none'].concat(M().t['firewall schedule recurring'].o),
            accprofile: () => ['super_admin', 'prof_admin'],
            ippool: () => M().t['firewall ippool'].o,
        };

        // Tablo erişimi: anahtarlı bir üst nesnenin alt tablosu üst taslakta tutulur (edit N → config ip-range)
        function tbl(c) {
            const sc = SCHEMA[c.path];
            if (sc.parent && !(SCHEMA[sc.parent].single && !SCHEMA[sc.parent].parent) && c.parent && c.parent.draft) { const k = '_sub_' + sc.sub; return c.parent.draft[k] || (c.parent.draft[k] = { o: [], v: {} }); }
            return M().t[c.path];
        }
        const zoneOf = n => M().t['system zone'].o.find(z => (M().t['system zone'].v[z].interface || []).includes(n));
        const centralNat = () => (M().t['system settings']['central-nat'] || 'disable') === 'enable';
        // M10 — doğrulanan hata metni (Fortinet KB "Enable subnet overlap…"; Return code -54 aynı kaynakta)
        function overlapWith(me, ipmask) {
            if ((M().t['system settings']['allow-subnet-overlap'] || 'disable') === 'enable') return null;
            const [ip, mask] = String(ipmask).split(' '), len = maskLen(mask);
            if (ip === '0.0.0.0') return null;
            for (const n of M().t['system interface'].o) {
                if (n === me) continue;
                const o = M().t['system interface'].v[n];
                if (!o.ip || (o.mode || 'static') !== 'static') continue;
                const [oip, om] = o.ip.split(' '), ol = maskLen(om);
                if (oip === '0.0.0.0') continue;
                if (sameNet(oip, ip, Math.min(len, ol)))
                    return 'Subnets overlap between \'' + me + '\' with primary IP of \'' + n + '\'\nnode_check_object fail! for ip ' + ip + ' ' + mask + '\n\nvalue parse error before \'' + mask + '\'\nCommand fail. Return code -54';
            }
            return null;
        }
        // ── değer ayrıştırma: {ok, v} | {err:'value'|'ds', at}
        function parseVal(a, toks, ctxObj) {
            const T = a.t, vals = toks.map(x => x.t);
            const bad = i => ({ err: 'value', at: i });
            if (!vals.length) return { err: 'novalue' };
            switch (T) {
                case 'str': if (vals.length > 1) return bad(1); if (a.max && vals[0].length > a.max) return bad(0); return { v: vals[0] };
                case 'int': if (vals.length > 1 || !/^\d+$/.test(vals[0]) || +vals[0] < a.min || +vals[0] > a.max) return bad(0); return { v: String(+vals[0]) };
                case 'ip': if (vals.length > 1 || !isIp(vals[0])) return bad(0); return { v: vals[0] };
                case 'ipmask': {
                    if (vals.length === 1) { const m = vals[0].match(/^([\d.]+)\/(\d{1,2})$/); if (!m || !isIp(m[1]) || +m[2] > 32) return bad(0); return { v: m[1] + ' ' + lenMask(+m[2]) }; }
                    if (vals.length === 2) { if (!isIp(vals[0])) return bad(0); if (maskLen(vals[1]) < 0) return bad(1); return { v: vals[0] + ' ' + vals[1] }; }
                    return bad(2);
                }
                case 'iprange': case 'iprangeq': {
                    if (vals.length > 1) return bad(1);
                    const p = vals[0].split('-');
                    if (p.length > 2 || !p.every(isIp) || (p.length === 2 && ip2n(p[0]) > ip2n(p[1]))) return bad(0);
                    return { v: vals[0] };
                }
                case 'enum': if (vals.length > 1) return bad(1); if (!a.v.includes(vals[0])) return bad(0); return { v: vals[0] };
                case 'menum': { const allow = a.v76 && IS76 ? a.v.concat(a.v76) : a.v; for (let i = 0; i < vals.length; i++) if (!allow.includes(vals[i])) return bad(i); return { v: [...new Set(vals)] }; }
                case 'ints': { for (let i = 0; i < vals.length; i++) if (!/^\d+$/.test(vals[i]) || +vals[i] > a.max) return bad(i); return { v: [...new Set(vals.map(x => String(+x)))] }; }
                case 'ports1': { for (let i = 0; i < vals.length; i++) if (!/^\d+$/.test(vals[i]) || +vals[i] < 1 || +vals[i] > 65535) return bad(i); return { v: [...new Set(vals.map(x => String(+x)))] }; }
                case 'hhmm': { if (vals.length > 1) return bad(1); const m = vals[0].match(/^(\d{1,2}):(\d{2})$/); if (!m || +m[1] > 23 || +m[2] > 59) return bad(0); return { v: m[1].padStart(2, '0') + ':' + m[2] }; }
                case 'refn': { if (vals.length > 1) return bad(1); if (!DS[a.ds]().includes(vals[0])) return { err: 'ds', at: 0 }; return { v: vals[0] }; }
                case 'ports': {
                    for (let i = 0; i < vals.length; i++) if (!portOk(vals[i], true)) return bad(i);
                    return { v: vals };
                }
                case 'port1': if (vals.length > 1 || !portOk(vals[0], false)) return bad(0); return { v: vals[0] };
                case 'secret': if (vals.length > 1) return bad(1); return { v: vals[0] };
                case 'hb': {
                    if (vals.length % 2) return bad(vals.length);
                    for (let i = 0; i < vals.length; i += 2) { if (!M().t['system interface'].v[vals[i]]) return { err: 'ds', at: i }; if (!/^\d+$/.test(vals[i + 1]) || +vals[i + 1] > 512) return bad(i + 1); }
                    return { v: vals };
                }
                case 'ref': { if (vals.length > 1) return bad(1); if (!DS[a.ds]().includes(vals[0])) return { err: 'ds', at: 0 }; return { v: vals[0] }; }
                case 'refs': { for (let i = 0; i < vals.length; i++) if (!DS[a.ds]().includes(vals[i])) return { err: 'ds', at: i }; return { v: [...new Set(vals)] }; }
                default: return bad(0);
            }
        }
        function portOk(s, withSrc) {
            const parts = withSrc ? s.split(':') : [s];
            if (parts.length > 2) return false;
            return parts.every(p => { const r = p.split('-'); return r.length <= 2 && r.every(x => /^\d+$/.test(x) && +x >= 0 && +x <= 65535) && (r.length === 1 || +r[0] <= +r[1]); });
        }

        // ── gösterim
        function fmtVal(a, v) {
            if (a.t === 'str' || a.t === 'ref' || a.t === 'iprangeq') return qt(v);
            if (a.t === 'refs') return v.map(qt).join(' ');
            if (a.t === 'menum' || a.t === 'ports' || a.t === 'ints' || a.t === 'ports1') return v.join(' ');
            if (a.t === 'hb') { const o = []; for (let i = 0; i < v.length; i += 2) o.push(qt(v[i]) + ' ' + v[i + 1]); return o.join(' '); }
            if (a.t === 'secret') return 'ENC ' + fakeHash('enc' + v, 88);
            return v;
        }
        function objLines(p, o, full, ind) {
            const sc = SCHEMA[p], L = [];
            for (const [k, a] of Object.entries(sc.attrs)) {
                if (a.when && !a.when(o)) continue;
                if (!attrOk(a)) continue;
                let v = o[k];
                if (v === undefined || v === null) { if (!full || a.def === undefined) { if (full && (a.t === 'str') && !a.when) L.push(ind + 'set ' + k + ' ' + qt('')); continue; } v = a.def; }
                if (!full && a.def !== undefined && String(v) === String(a.def) && k !== 'vdom' && (k !== 'type' || p === 'firewall ssl-ssh-profile ssl-exempt')) continue;
                if (k === 'type' && v === 'vlan') continue;
                if (Array.isArray(v) && !v.length) continue;
                L.push(ind + 'set ' + k + ' ' + fmtVal(a, v));
            }
            return L;
        }
        function subLines(p, o, full, ind) {
            const L = [];
            for (const sub of SCHEMA[p].children || []) {
                const cp = childPath(p, sub), cs = SCHEMA[cp], ct = o['_sub_' + sub];
                if (cs.single) {
                    const inner = ct ? objLines(cp, ct, full, ind + '    ').concat(subLines(cp, ct, full, ind + '    ')) : [];
                    if (inner.length) L.push(ind + 'config ' + sub, ...inner, ind + 'end');
                    continue;
                }
                if (!ct || !ct.o.length) continue;
                L.push(ind + 'config ' + sub);
                for (const k of ct.o) L.push(ind + '    edit ' + (cs.num ? k : qt(k)), ...objLines(cp, ct.v[k], full, ind + '        '), ...subLines(cp, ct.v[k], full, ind + '        '), ind + '    next');
                L.push(ind + 'end');
            }
            return L;
        }
        function showPath(p, key, full) {
            const sc = SCHEMA[p], t = M().t[p], L = ['config ' + p];
            if (sc.single) {
                L.push(...objLines(p, t, full, '    '));
                for (const sub of sc.children || []) {
                    const cp = childPath(p, sub), ct = M().t[cp], cs = SCHEMA[cp];
                    if (!ct.o.length) continue;
                    L.push('    config ' + sub);
                    for (const k of ct.o) { L.push('        edit ' + (cs.num ? k : qt(k)), ...objLines(cp, ct.v[k], full, '            '), '        next'); }
                    L.push('    end');
                }
                L.push('end'); return L.join('\n');
            }
            const keys = key !== undefined ? [String(key)] : t.o;
            for (const k of keys) {
                const o = t.v[k];
                if (!o || (o._builtin && key === undefined && !full)) continue;
                L.push('    edit ' + (sc.num ? k : qt(k)));
                L.push(...objLines(p, o, full, '        '));
                L.push(...subLines(p, o, full, '        '));
                L.push('    next');
            }
            L.push('end');
            return L.join('\n');
        }
        function getObj(p, o) {
            const sc = SCHEMA[p], L = [];
            if (!sc.single) L.push(pad(sc.key, 20) + ': ' + o[sc.key]);
            for (const [k, a] of Object.entries(sc.attrs)) {
                if (a.when && !a.when(o)) continue;
                if (!attrOk(a)) continue;
                let v = o[k] !== undefined ? o[k] : a.def;
                if (v === undefined) v = '';
                if (a.t === 'secret') v = v ? 'ENC ****' : '';
                L.push(pad(k, 20) + ': ' + (Array.isArray(v) ? v.map(x => a.t === 'refs' ? qt(x) : x).join(' ') : v));
            }
            return L.join('\n');
        }

        // ── yönlendirme tablosu
        const isTun = n => !!M().t['vpn ipsec phase1-interface'].v[n];
        const ifUp = n => { if (isTun(n)) return tun(n).p1up; const i = M().t['system interface'].v[n]; if (i && i.type === 'vlan') return (i.status || 'up') === 'up' && !!i.interface && ifUp(i.interface); return !!i && (i.status || 'up') === 'up' && !!M().links[n]; };
        // ── IPsec tünel durumu: yapılandırma + lab'daki sabit karşı uç (lab.peer / varyant.peer)
        const PEER = Object.assign({}, lab.peer || {}, (S.variant && S.variant.peer) || {});
        const norm = v => { if (!v) return '0.0.0.0 0.0.0.0'; const m = String(v).match(/^([\d.]+)\/(\d+)$/); return m ? n2ip(netOf(m[1], +m[2])) + ' ' + lenMask(+m[2]) : v; };
        function tun(name) {
            const p1 = M().t['vpn ipsec phase1-interface'].v[name];
            const T = { name, p1, p1up: false, p2up: false, reason: null, p2: null };
            if (!p1) return Object.assign(T, { reason: 'nop1' });
            const phys = p1.interface;
            const route = rib(true).filter(x => x.len === 0 || sameNet(x.net, p1['remote-gw'] || '0.0.0.0', x.len)).sort((a, b) => b.len - a.len)[0];
            if (!phys || !ifUp(phys) || !route || route.dev !== phys) return Object.assign(T, { reason: 'nopath' });
            if (!PEER.gw || PEER.gw !== p1['remote-gw']) return Object.assign(T, { reason: 'nopeer' });
            if (p1['ike-version'] && p1['ike-version'] !== PEER.ike) return Object.assign(T, { reason: 'ikever' });
            if (p1.proposal && !p1.proposal.includes(PEER.proposal)) return Object.assign(T, { reason: 'proposal' });
            if (p1.dhgrp && !p1.dhgrp.includes(PEER.dh)) return Object.assign(T, { reason: 'proposal' });
            if (p1.psksecret !== PEER.psk) return Object.assign(T, { reason: 'psk' });
            T.p1up = true;
            const p2n = M().t['vpn ipsec phase2-interface'].o.find(k => M().t['vpn ipsec phase2-interface'].v[k].phase1name === name);
            if (!p2n) return Object.assign(T, { reason: 'nop2' });
            const p2 = M().t['vpn ipsec phase2-interface'].v[p2n]; T.p2 = p2n;
            if (p2.proposal && !p2.proposal.includes(PEER.p2proposal)) return Object.assign(T, { reason: 'p2proposal' });
            if (norm(p2['src-subnet']) !== norm(PEER.remote) || norm(p2['dst-subnet']) !== norm(PEER.local)) return Object.assign(T, { reason: 'selector' });
            if (((p2.pfs || 'enable') === 'enable') !== (PEER.pfs !== false)) return Object.assign(T, { reason: 'p2proposal' });
            T.p2up = true;
            return T;
        }
        function rib(noTun) {
            const R = [];
            for (const n of M().t['system interface'].o) {
                const i = M().t['system interface'].v[n];
                if (!i.ip || !ifUp(n)) continue;
                const [ip, mask] = i.ip.split(' '), len = maskLen(mask);
                if (ip === '0.0.0.0') continue;
                R.push({ c: 'C', net: n2ip(netOf(ip, len)), len, dev: n, ad: 0 });
            }
            const cands = [];
            for (const k of M().t['router static'].o) {
                const r = M().t['router static'].v[k];
                if ((r.status || 'enable') !== 'enable') continue;
                if (r.blackhole === 'enable') { const [bip, bm] = (r.dst || '0.0.0.0 0.0.0.0').split(' '), bl = maskLen(bm); cands.push({ c: 'S', net: n2ip(netOf(bip, bl)), len: bl, gw: '0.0.0.0', dev: 'Null', ad: +(r.distance || 10), pri: +(r.priority || 1), bh: true }); continue; }
                if (!r.device) continue;
                if (noTun && isTun(r.device)) continue;
                const [dip, dm] = (r.dst || '0.0.0.0 0.0.0.0').split(' '), len = maskLen(dm);
                const gw = r.gateway || '0.0.0.0';
                if (!ifUp(r.device)) continue;
                if (gw !== '0.0.0.0' && !isTun(r.device) && !R.some(c => c.c === 'C' && c.dev === r.device && sameNet(c.net, gw, c.len))) continue;
                cands.push({ c: len === 0 ? 'S*' : 'S', net: n2ip(netOf(dip, len)), len, gw, dev: r.device, ad: +(r.distance || 10), pri: +(r.priority || 1) });
            }
            for (const r of cands) {
                const best = Math.min(...cands.filter(x => x.net === r.net && x.len === r.len).map(x => x.ad));
                if (r.ad === best && !R.some(c => c.c === 'C' && c.net === r.net && c.len === r.len)) R.push(r);
            }
            return R.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len);
        }
        // M8: tüm aday rotalar (seçilen / beklemede / etkin olmayan) — get router info routing-table database
        function ribDb() {
            const sel = rib(), R = sel.filter(r => r.c === 'C').map(r => Object.assign({ st: 'sel' }, r));
            for (const k of M().t['router static'].o) {
                const r = M().t['router static'].v[k];
                if ((r.status || 'enable') !== 'enable') continue;
                const [dip, dm] = (r.dst || '0.0.0.0 0.0.0.0').split(' '), len = maskLen(dm), net = n2ip(netOf(dip, len));
                const e = { c: len === 0 ? 'S*' : 'S', net, len, gw: r.gateway || '0.0.0.0', dev: r.blackhole === 'enable' ? 'Null' : r.device, ad: +(r.distance || 10), pri: +(r.priority || 1), bh: r.blackhole === 'enable' };
                const inSel = sel.some(x => x.c !== 'C' && x.net === net && x.len === len && x.dev === e.dev && (x.gw || '0.0.0.0') === e.gw && x.ad === e.ad);
                e.st = inSel ? 'sel' : (!e.bh && (!e.dev || !ifUp(e.dev) || (e.gw !== '0.0.0.0' && !isTun(e.dev) && !sel.some(c => c.c === 'C' && c.dev === e.dev && sameNet(c.net, e.gw, c.len))))) ? 'inactive' : 'standby';
                R.push(e);
            }
            return R.sort((a, b) => ip2n(a.net) - ip2n(b.net) || a.len - b.len || a.ad - b.ad);
        }
        const RCODES = ['Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP', '       O - OSPF, IA - OSPF inter area',
            '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2', '       E1 - OSPF external type 1, E2 - OSPF external type 2',
            '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area'];
        function showRibDb() {
            // Biçim: Fortinet teknik ipucu "How to identify inactive routes in the Routing Table" örneği
            const L = RCODES.concat(['       > - selected route, * - FIB route, p - stale info', '', 'Routing table for VRF=0']);
            for (const r of ribDb()) {
                const mark = r.st === 'sel' ? '*> ' : '   ', code = pad(r.c.replace('*', ''), 5) + mark;
                if (r.c === 'C') L.push(code + r.net + '/' + r.len + ' is directly connected, ' + r.dev);
                else if (r.bh) L.push(code + r.net + '/' + r.len + ' [' + r.ad + '/0] is a summary, Null, [' + r.pri + '/0]');
                else L.push(code + r.net + '/' + r.len + ' [' + r.ad + '/0] via ' + (isTun(r.dev) ? r.dev + ' tunnel ' + (M().t['vpn ipsec phase1-interface'].v[r.dev]['remote-gw'] || '') : r.gw + ', ' + (r.dev || '')) + (r.st === 'inactive' ? ' inactive' : '') + ', [' + r.pri + '/0]');
            }
            log({ ribdb: ribDb().map(r => r.st) });
            return L.join('\n');
        }
        function showRibDetails(ip) {
            const best = rib().filter(x => x.len === 0 || sameNet(x.net, ip, x.len)).sort((a, b) => b.len - a.len || a.ad - b.ad || a.pri - b.pri)[0];
            log({ ribdetails: { ip, net: best ? best.net + '/' + best.len : null, dev: best ? best.dev : null } });
            if (!best) return 'Routing table for VRF=0\n% Network not in table\n# [Simülatör] Bu hedefe rota yok (varsayılan rota da yok).';
            const via = best.c === 'C' ? '  * directly connected, ' + best.dev : best.bh ? '  * directly connected, Null' : '  * vrf 0 ' + (isTun(best.dev) ? best.dev : best.gw + ', via ' + best.dev);
            return ['Routing table for VRF=0', 'Routing entry for ' + best.net + '/' + best.len, '  Known via "' + (best.c === 'C' ? 'connected' : 'static') + '", distance ' + best.ad + ', metric 0, best', via,
                '# [Simülatör] Ayrıntı satırları sadeleştirildi (gerçek çıktıda zaman ve ek alanlar olabilir).'].join('\n');
        }
        function showRib() {
            const L = ['Codes: K - kernel, C - connected, S - static, R - RIP, B - BGP', '       O - OSPF, IA - OSPF inter area',
                '       N1 - OSPF NSSA external type 1, N2 - OSPF NSSA external type 2', '       E1 - OSPF external type 1, E2 - OSPF external type 2',
                '       i - IS-IS, L1 - IS-IS level-1, L2 - IS-IS level-2, ia - IS-IS inter area', '       V - BGP VPNv4', '       * - candidate default', '', 'Routing table for VRF=0'];
            for (const r of rib()) {
                if (r.c === 'C') L.push(pad('C', 8) + r.net + '/' + r.len + ' is directly connected, ' + r.dev);
                else if (r.bh) L.push(pad(r.c, 8) + r.net + '/' + r.len + ' [' + r.ad + '/0] is a summary, Null, [' + r.pri + '/0]');
                else if (isTun(r.dev)) L.push(pad(r.c, 8) + r.net + '/' + r.len + ' [' + r.ad + '/0] via ' + r.dev + ' tunnel ' + (M().t['vpn ipsec phase1-interface'].v[r.dev]['remote-gw'] || '') + ', [' + r.pri + '/0]');
                else L.push(pad(r.c, 8) + r.net + '/' + r.len + ' [' + r.ad + '/0] via ' + r.gw + ', ' + r.dev + ', [' + r.pri + '/0]');
            }
            return L.join('\n');
        }
        function sysStatus() {
            const g = M().t['system global'];
            return ['Version: FortiGate-VM64 v' + FOS + ' (eğitim simülatörü — gerçek cihaz değildir)', 'Serial-Number: FGVMSIM000000001', 'Hostname: ' + host(),
                'Operation Mode: NAT', 'Current virtual domain: root', 'Max number of virtual domains: 1', 'Virtual domains status: 1 in NAT mode, 0 in TP mode',
                'Virtual domain configuration: disable', 'Current HA mode: ' + (haElect().formed ? 'a-p, ' + (haElect().meP ? 'primary' : 'secondary') : 'standalone'), 'System time: ' + new Date().toString().slice(0, 24) + (g.timezone ? ' (' + g.timezone + ')' : '')].join('\n');
        }
        // ── HA kümesi (karşı üye lab.ha / varyant.ha ile sabit)
        const HAP = Object.assign({ sn: 'FGVMSIM000000002', host: 'FGT-A-2', group: 'HA-LAB', password: 'Lab-Ha-2026', prio: 128, override: 'disable', mode: 'a-p', uptime: 300, sync: true }, lab.ha || {}, (S.variant && S.variant.ha) || {});
        S.ha = { forced: false, synced: false, history: [], onPeer: false, lastRole: null };
        const MY_SN = 'FGVMSIM000000001', MY_UP = (SIM.haUptime !== undefined ? SIM.haUptime : 17645);
        function haFormed() {
            const h = M().t['system ha'];
            if ((h.mode || 'standalone') !== 'a-p' || HAP.mode !== 'a-p') return { ok: false, why: 'mode' };
            if ((h['group-name'] || '') !== HAP.group) return { ok: false, why: 'group' };
            if ((h.password || '') !== HAP.password) return { ok: false, why: 'password' };
            const hb = h.hbdev || [];
            if (!hb.length || !hb.filter((x, i) => i % 2 === 0).some(n => M().links[n] && (M().t['system interface'].v[n].status || 'up') === 'up') || HAP.hbDown) return { ok: false, why: 'hb' };
            return { ok: true };
        }
        function haElect() {
            const h = M().t['system ha'], F = haFormed();
            if (!F.ok) return { formed: false, why: F.why, meP: true };
            const mon = h.monitor || [], myFail = mon.filter(n => !ifUp(n)).length, pFail = HAP.monFail || 0;
            const me = { fail: myFail, up: MY_UP, prio: +(h.priority || 128), sn: MY_SN, ov: (h.override || 'disable') === 'enable' };
            const pe = { fail: pFail, up: HAP.uptime, prio: HAP.prio, sn: HAP.sn, ov: HAP.override === 'enable' };
            let meP, reason;
            if (S.ha.forced) { meP = false; reason = 'forced'; }
            else if (me.fail !== pe.fail) { meP = me.fail < pe.fail; reason = 'monitor'; }
            else {
                const ov = me.ov || pe.ov;
                const byUp = () => Math.abs(me.up - pe.up) > 5 ? (meP = me.up > pe.up, reason = 'uptime', true) : false;
                const byPrio = () => me.prio !== pe.prio ? (meP = me.prio > pe.prio, reason = 'priority', true) : false;
                if (!(ov ? (byPrio() || byUp()) : (byUp() || byPrio()))) { meP = me.sn > pe.sn; reason = 'serial'; }
            }
            const role = meP ? 'primary' : 'secondary';
            if (S.ha.lastRole && S.ha.lastRole !== role) S.ha.history.push(new Date().toISOString().slice(0, 19).replace('T', ' ') + ' ' + MY_SN + ' is ' + role + ' now (' + reason + ')');
            S.ha.lastRole = role;
            return { formed: true, meP, reason };
        }
        const legacyT = () => { const o = {}; for (const [k, v] of Object.entries(M().t)) { if (NEWP.has(k) || (SCHEMA[k].parent && NEWP.has(SCHEMA[k].parent)) || (SCHEMA[k].parent && SCHEMA[SCHEMA[k].parent].parent)) { if (SCHEMA[k].single ? Object.keys(v).length : v.o.length) o[k] = v; continue; } o[k] = v; } return o; };
        const cksum = seed => [0, 1, 2].map(k => fakeHash(seed + k, 32).toLowerCase().replace(/[^0-9a-f]/g, c => (c.charCodeAt(0) % 16).toString(16)));
        function haInSync() { return HAP.sync || S.ha.synced; }
        function haStatus(onPeer) {
            const h = M().t['system ha'], E = haElect();
            if ((h.mode || 'standalone') === 'standalone') return 'HA Health Status: OK\nModel: FortiGate-VM64\nMode: standalone';
            const L = ['HA Health Status: ' + (E.formed && haInSync() ? 'OK' : 'WARNING'), 'Model: FortiGate-VM64', 'Mode: HA A-P', 'Group Name: ' + (h['group-name'] || ''), 'Group ID: 0', 'Debug: 0',
                'Cluster Uptime: 12 days 3:5:22', 'Cluster state change time: 2026-09-24 03:12:46'];
            if (!E.formed) { L.push('# [Simülatör] Küme kurulamadı: ' + ({ mode: 'mod (a-p) iki üyede aynı olmalı', group: 'group-name uyuşmuyor', password: 'küme parolası uyuşmuyor', hb: 'heartbeat arayüzü kapalı/bağlı değil' })[E.why], 'Primary     : ' + host() + ', ' + MY_SN + ', HA cluster index = 0'); return L.join('\n'); }
            const pSn = E.meP ? MY_SN : HAP.sn, sSn = E.meP ? HAP.sn : MY_SN;
            const why = { uptime: 'it has the largest value of uptime', priority: 'it has the largest value of override priority', monitor: 'it has the least value of failed monitor', serial: 'it has the largest value of serialno', forced: 'the other member was set to failover by user (execute ha failover set)' }[E.reason];
            L.push('Primary selected using:', '    <2026/09/24 03:12:46> vcluster-1: ' + pSn + ' is selected as the primary because ' + why + '.',
                'ses_pickup: ' + (h['session-pickup'] || 'disable'), 'override: ' + (h.override || 'disable'), 'Configuration Status:',
                '    ' + MY_SN + '(updated 3 seconds ago): ' + (haInSync() ? 'in-sync' : 'out-of-sync'), '    ' + HAP.sn + '(updated 4 seconds ago): ' + (haInSync() ? 'in-sync' : 'out-of-sync'),
                'HBDEV stats:', '    ' + MY_SN + '(updated 3 seconds ago):', '        ' + (h.hbdev || [])[0] + ': physical/10000auto, up, rx-bytes/packets/dropped/errors=48231988/187233/0/0, tx=51882012/187402/0/0',
                'Primary     : ' + (E.meP ? host() : HAP.host) + '        , ' + pSn + ', HA cluster index = ' + (E.meP ? 0 : 1),
                'Secondary   : ' + (E.meP ? HAP.host : host()) + '        , ' + sSn + ', HA cluster index = ' + (E.meP ? 1 : 0),
                'number of vcluster: 1', 'vcluster 1: work 169.254.0.1', 'Primary: ' + pSn + ', HA operating index = 0', 'Secondary: ' + sSn + ', HA operating index = 1');
            return L.join('\n');
        }
        function haChecksum() {
            const E = haElect(); if (!E.formed) return 'is_manage_primary()=1, is_root_primary()=1\n# [Simülatör] Küme kurulu değil: yalnız bu üye.';
            const mine = cksum(JSON.stringify(legacyT()) + 'x'), peer = haInSync() ? mine : cksum('peer-old');
            const block = (sn, c, mp) => ['================== ' + sn + ' ==================', '', 'is_manage_primary()=' + (mp ? 1 : 0) + ', is_root_primary()=' + (mp ? 1 : 0), 'debugzone', 'global: ' + c[0], 'root: ' + c[1], 'all: ' + c[2], '', 'checksum', 'global: ' + c[0], 'root: ' + c[1], 'all: ' + c[2], ''];
            return block(MY_SN, mine, E.meP).concat(block(HAP.sn, [mine[0], peer[1], haInSync() ? mine[2] : peer[2]], !E.meP)).join('\n');
        }
        function haHistory() { return S.ha.history.length ? S.ha.history.map((l, i) => '<' + i + '> ' + l).join('\n') : '<0> 2026-09-24 03:12:46 cluster formed, ' + (haElect().meP ? MY_SN : HAP.sn) + ' is primary'; }
        function haExec(t, line) {
            const a = t[2] ? pick(t[2].t, ['manage', 'failover', 'synchronize']) : { err: 1 };
            if (!a.ok) { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); }
            const E = haElect();
            if (a.ok === 'manage') {
                if (!E.formed) { log({ raw: line, err: 'invalid' }); return '# [Simülatör] Küme kurulu değil; bağlanılacak üye yok.'; }
                if (!t[3] || t[3].t === '?') { log({ raw: line, canon: 'execute ha manage ?' }); return '<id>    please input peer box index.\n<1>     Subsidary unit ' + HAP.sn; }
                if (t[3].t !== '1' || !t[4]) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (t[4] ? t[4].t : t[3].t) + '\''; }
                log({ raw: line, canon: 'execute ha manage 1 ' + t[4].t });
                S.pending = { prompt: t[4].t + '@' + HAP.sn + '\'s password: ', secret: true, fn: () => { S.ha.onPeer = true; log({ raw: 'ha-login', canon: 'ha manage login' }); return '\n# [Simülatör] ' + HAP.sn + ' (' + (E.meP ? 'ikincil' : 'birincil') + ' üye) CLI\'ına bağlandınız. exit ile dönün.'; } };
                return '';
            }
            if (a.ok === 'synchronize') {
                if (!t[3] || !'start'.startsWith(t[3].t)) { log({ raw: line, err: 'invalid' }); return perr(t[3] || null); }
                if (!E.formed) { log({ raw: line, err: 'invalid' }); return '# [Simülatör] Küme kurulu değil.'; }
                S.ha.synced = true; log({ raw: line, canon: 'execute ha synchronize start' }); return 'Starting synchronizing with HA primary...';
            }
            const op = t[3] ? pick(t[3].t, ['set', 'unset', 'status']) : { err: 1 };
            if (!op.ok) { log({ raw: line, err: 'invalid' }); return perr(t[3] || null); }
            if (op.ok === 'status') { log({ raw: line, canon: 'execute ha failover status' }); return 'failover status: ' + (S.ha.forced ? 'set' : 'unset'); }
            if (!t[4] || t[4].t !== '1') { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (t[4] ? t[4].t : '') + '\''; }
            if (!E.formed) { log({ raw: line, err: 'invalid' }); return '# [Simülatör] Küme kurulu değil.'; }
            if (op.ok === 'unset') { S.ha.forced = false; log({ raw: line, canon: 'execute ha failover unset 1' }); haElect(); return ''; }
            S.pending = { prompt: 'Caution: This command will trigger an HA failover.\nIt is intended for testing purposes.\nDo you want to continue? (y/n)', fn: x => {
                if (!/^y/i.test(x)) return 'Command aborted.';
                S.ha.forced = true; log({ raw: line, canon: 'execute ha failover set 1' }); haElect(); return '';
            } };
            return '';
        }

        // ── SSL-VPN istemci benzetimi (lab.sim.ssl: [{ user, pass, src, mode:'tunnel' }], sim.poolUsed)
        function poolSize(names) { return (names || []).reduce((a, n) => { const o = M().t['firewall address'].v[n]; if (!o) return a; if ((o.type || 'ipmask') === 'iprange') return a + ip2n(o['end-ip'] || '0.0.0.0') - ip2n(o['start-ip'] || '0.0.0.0') + 1; const l = maskLen((o.subnet || '0.0.0.0 0.0.0.0').split(' ')[1]); return a + Math.max(0, 2 ** (32 - l) - 2); }, 0); }
        function poolFirst(names) { const o = M().t['firewall address'].v[(names || [])[0]]; if (!o) return '0.0.0.0'; return (o.type || 'ipmask') === 'iprange' ? o['start-ip'] : n2ip(ip2n(o.subnet.split(' ')[0]) + 1); }
        function sslConnect(cl) {
            const st = M().t['vpn ssl settings'], R = { cl, ok: false };
            const wan = st['source-interface'] || [];
            if (!wan.length || !wan.some(n => ifUp(n))) return Object.assign(R, { reason: 'noservice' });
            if ((st['source-address'] || []).length && !(st['source-address'] || []).some(a => addrMatch(a, cl.src))) return Object.assign(R, { reason: 'srcaddr' });
            const u = M().t['user local'].v[cl.user];
            if (!u || (u.status || 'enable') !== 'enable') return Object.assign(R, { reason: 'nouser' });
            if (u.passwd !== cl.pass) return Object.assign(R, { reason: 'badpass' });
            const ug = M().t['user group'].o.filter(g => (M().t['user group'].v[g].member || []).includes(cl.user));
            R.groups = ug;
            const rt = M().t['vpn ssl settings authentication-rule'];
            const rule = rt.o.map(k => rt.v[k]).find(r => (r.groups || []).some(g => ug.includes(g)));
            if (!rule) return Object.assign(R, { reason: 'norule' });
            const portal = M().t['vpn ssl web portal'].v[rule.portal];
            if (!portal || (cl.mode || 'tunnel') === 'tunnel' && (IS76 || portal['tunnel-mode'] !== 'enable')) return Object.assign(R, { reason: 'notunnel', portal: rule.portal });
            const pools = (portal['ip-pools'] || []).length ? portal['ip-pools'] : (st['tunnel-ip-pools'] || []);
            const pol = M().t['firewall policy'].o.map(k => M().t['firewall policy'].v[k]).find(p => (p.status || 'enable') === 'enable' && (p.action || 'deny') === 'accept' && (p.srcintf || []).includes('ssl.root') && (p.groups || []).some(g => ug.includes(g)));
            if (!pol) return Object.assign(R, { reason: 'nopolicy', portal: rule.portal });
            if (!pools.length) return Object.assign(R, { reason: 'nopool', portal: rule.portal });
            const size = poolSize(pools), used = SIM.poolUsed || 0;
            if (used >= size) return Object.assign(R, { reason: 'nopool', portal: rule.portal });
            return Object.assign(R, { ok: true, portal: rule.portal, ip: n2ip(ip2n(poolFirst(pools)) + used), group: ug.find(g => (pol.groups || []).includes(g)) });
        }
        const sslClients = () => SIM.ssl || [];
        function sslMonitor() {
            const ok = sslClients().map(sslConnect).filter(r => r.ok);
            const L = ['SSL-VPN Login Users:', ' Index   User   Group   Auth Type      Timeout         From     HTTP in/out    HTTPS in/out     Two-factor Auth'];
            ok.forEach((r, i) => L.push(' ' + i + '       ' + r.cl.user + '   ' + r.group + '   1(1)           287     ' + r.cl.src + '     0/0     0/0      0'));
            L.push('', 'SSL-VPN sessions:', ' Index   User   Group   Source IP      Duration        I/O Bytes       Tunnel/Dest IP');
            ok.forEach((r, i) => L.push(' ' + i + '       ' + r.cl.user + '   ' + r.group + '   ' + r.cl.src + '  ' + (12 + i) + '      10240/20480     ' + r.ip));
            log({ sslmon: ok.map(r => r.cl.user) });
            return L.join('\n');
        }
        function sslDebug() {
            const L = ['# [Simülatör] sslvpn debug çıktısı eğitim için sadeleştirilmiştir; sıradaki bağlanma denemesi:'];
            sslClients().forEach((cl, i) => {
                const r = sslConnect(cl), id = '[' + (1337 + i) + ':root:' + (26 + i).toString(16) + ']';
                if (r.reason === 'noservice') { L.push('# [Simülatör] ' + cl.src + ' bağlanamıyor: SSL-VPN hiçbir WAN arayüzünde dinlemiyor (source-interface).'); return; }
                L.push(id + 'SSL state:before SSL initialization (' + cl.src + ')', id + 'SSL state:SSLv3/TLS read client hello (' + cl.src + ')', id + 'SSL established: TLSv1.3 TLS_AES_256_GCM_SHA384', id + 'req: /remote/logincheck');
                if (r.reason === 'srcaddr') { L.push(id + 'sslvpn_login: source address ' + cl.src + ' is not allowed (source-address)'); return; }
                L.push(id + 'sslvpn_auth_check_usrgroup:1683 forming user/group list from policy.');
                if (r.reason === 'nouser') { L.push(id + 'sslvpn_auth_check_usrgroup: user \'' + cl.user + '\' not found in any user group', id + 'login_failed:414 user[' + cl.user + '],auth_type=1 failed [sslvpn_login_unknown_user]'); return; }
                L.push(id + 'fam_auth_send_req_internal:426 fnbam_auth return: ' + (r.reason === 'badpass' ? '1' : '0'));
                if (r.reason === 'badpass') { L.push(id + 'login_failed:414 user[' + cl.user + '],auth_type=1 failed [sslvpn_login_auth_fail]'); return; }
                L.push(id + 'sslvpn_validate_user: user ' + cl.user + ' authenticated, groups: ' + ((r.groups || []).join(',') || '(yok)'));
                if (r.reason === 'norule') { L.push(id + 'sslvpn_auth_check_usrgroup: no matching authentication-rule for user groups, permission denied'); return; }
                if (r.reason === 'nopolicy') { L.push(id + 'sslvpn_auth_check_usrgroup: no ssl.root firewall policy allows groups ' + (r.groups || []).join(',') + ', permission denied'); return; }
                if (r.reason === 'notunnel') { L.push(id + 'tunnel request rejected: portal \'' + r.portal + '\' has tunnel-mode disabled'); return; }
                if (r.reason === 'nopool') { L.push(id + 'sslvpn_allocate_ip: no available IP address in tunnel-ip-pools'); return; }
                L.push(id + 'rmt_web_session_create: user ' + cl.user + ' portal ' + r.portal, id + 'sslvpn_tunnel: tunnel established, assigned ' + r.ip);
            });
            log({ ssldebug: sslClients().map(cl => sslConnect(cl).reason || 'ok') });
            return L.join('\n');
        }

        // ── Bağlantı testleri (FortiGate kaynaklı trafik: kurala tabi değildir — local-out)
        S.pingOpt = { source: null, count: 5 }; S.arpDyn = {};
        const macOf = ip => '00:09:0f:' + [1, 2, 3].map(k => ((ip2n(ip) >> (k * 5)) & 255).toString(16).padStart(2, '0')).join(':');
        // Hedefe gidiş: {ok, src, dev, gw, reason}
        function reach(ip, srcOverride) {
            const hosts = (lab.hosts || []).concat((SIM.hosts || []));
            const own = M().t['system interface'].o.find(n => ifUp(n) && ifIp(n) === ip);
            if (own) return { ok: true, src: ip, dev: own, self: true };
            const r = rib().filter(x => x.len === 0 || sameNet(x.net, ip, x.len)).sort((a, b) => b.len - a.len)[0];
            if (!r || r.bh) return { ok: false, reason: 'noroute' };
            let src = srcOverride || S.pingOpt.source || ifIp(r.dev);
            if (isTun(r.dev)) {
                const T = tun(r.dev), p2 = T.p2 && M().t['vpn ipsec phase2-interface'].v[T.p2];
                if (!T.p2up || !p2) return { ok: false, reason: 'tunnel', src, dev: r.dev };
                const [sn, sm] = norm(p2['src-subnet']).split(' '), [dn, dm] = norm(p2['dst-subnet']).split(' ');
                if (!sameNet(sn, src, maskLen(sm)) || !sameNet(dn, ip, maskLen(dm))) return { ok: false, reason: 'selector', src, dev: r.dev };
            }
            const gw = r.c === 'C' ? ip : r.gw;
            if (!isTun(r.dev) && r.c !== 'C' && !hosts.includes(gw)) return { ok: false, reason: 'gw', src, dev: r.dev, gw };
            if (!hosts.includes(ip)) return { ok: false, reason: 'host', src, dev: r.dev, gw };
            const info = (SIM.hostInfo || {})[ip];
            if (info && info.replyTo && !info.replyTo.some(c => { const [n, l] = c.split('/'); return sameNet(n, src, +l); })) return { ok: false, reason: 'return', src, dev: r.dev, gw };
            if (!isTun(r.dev)) S.arpDyn[gw] = r.dev;
            return { ok: true, src, dev: r.dev, gw };
        }
        function ping(ip) {
            const R = reach(ip), n = S.pingOpt.count;
            log({ ping: { ip, ok: R.ok, src: R.src } });
            const head = 'PING ' + ip + ' (' + ip + '): 56 data bytes\n';
            if (!R.ok) return head + '\n--- ' + ip + ' ping statistics ---\n' + n + ' packets transmitted, 0 packets received, 100% packet loss';
            let L = '';
            for (let i = 0; i < n; i++) L += '64 bytes from ' + ip + ': icmp_seq=' + i + ' ttl=' + (R.self ? 255 : R.gw === ip ? 64 : 63) + ' time=0.' + (4 + i % 3) + ' ms\n';
            return head + L + '\n--- ' + ip + ' ping statistics ---\n' + n + ' packets transmitted, ' + n + ' packets received, 0% packet loss\nround-trip min/avg/max = 0.4/0.5/0.6 ms';
        }
        function traceroute(ip) {
            const R = reach(ip), L = ['traceroute to ' + ip + ' (' + ip + '), 32 hops max, 3 probe packets per hop, 84 byte packets'];
            log({ trace4: { ip, ok: R.ok } });
            if (R.self) { L.push(' 1  ' + ip + '  0.051 ms  0.032 ms  0.030 ms'); return L.join('\n'); }
            let hop = 1;
            if (R.gw && R.gw !== ip && (R.ok || R.reason === 'host' || R.reason === 'return')) L.push(' ' + hop++ + '  ' + R.gw + '  0.412 ms  0.301 ms  0.288 ms');
            if (R.ok) L.push(' ' + hop + '  ' + ip + '  3.102 ms  2.998 ms  3.050 ms');
            else for (let k = 0; k < 3; k++) L.push(' ' + hop++ + '  * * *');
            return L.join('\n');
        }
        function telnet(ip, port) {
            const R = reach(ip);
            log({ telnet: { ip, port, ok: R.ok } });
            const open = ((SIM.ports || {})[ip] || []).includes(port);
            const L = ['Trying ' + ip + '...'];
            if (!R.ok) { L.push('telnet: Unable to connect to remote host: Connection timed out'); return L.join('\n'); }
            if (!open) { L.push('telnet: Unable to connect to remote host: Connection refused'); return L.join('\n'); }
            L.push('Connected to ' + ip + '.', 'Escape character is \'^]\'.', '# [Simülatör] TCP ' + port + ' açık; bağlantı kapatıldı.', 'Connection closed by foreign host.');
            return L.join('\n');
        }
        function arpTable(diag) {
            const rows = [];
            for (const e of (SIM.arp || [])) rows.push(Object.assign({ age: 0 }, e));
            for (const [ip, dev] of Object.entries(S.arpDyn)) if (!rows.some(r => r.ip === ip)) rows.push({ ip, mac: macOf(ip), intf: dev, age: 0 });
            if (!diag) return ['Address           Age(min)   Hardware Addr      Interface'].concat(rows.filter(r => r.mac).map(r => pad(r.ip, 18) + pad(r.age, 11) + pad(r.mac, 19) + r.intf)).join('\n');
            return rows.map((r, i) => 'index=' + (3 + i) + ' ifname=' + r.intf + ' ' + r.ip + ' ' + (r.mac || '00:00:00:00:00:00') + ' state=' + (r.mac ? '00000002' : '00000020') + ' use=' + (120 + i) + ' confirm=' + (r.mac ? 60 : 0) + ' update=' + (r.mac ? 3 : 0) + ' ref=' + (r.mac ? 3 : 1)).join('\n');
        }


        // ═══ Teşhis simülasyonu (Faz C) ═════════════════════════════════════
        // lab.sim (ve seçilen varyantın sim'i): perf, procs, conserve, crash, cfgErr, flows, bulk
        // flows: [{ src, sport, dst, dport, proto: 'tcp'|'udp'|'icmp', in: 'port2', reply: 'ok'|'none'|'rst', arrives: true }]
        S.dbg = { on: false, filter: {}, fn: false, trace: 0, tid: 0 }; S.arpSeen = {};
        S.sessFilter = {};
        const SVC = { ALL: [['any']], ALL_TCP: [['tcp']], ALL_UDP: [['udp']], ALL_ICMP: [['icmp']], PING: [['icmp']], HTTP: [['tcp', 80]], HTTPS: [['tcp', 443]], SSH: [['tcp', 22]],
            DNS: [['tcp', 53], ['udp', 53]], NTP: [['udp', 123]], SMTP: [['tcp', 25]], RDP: [['tcp', 3389]], TELNET: [['tcp', 23]], SNMP: [['udp', 161], ['udp', 162]], FTP: [['tcp', 21]] };
        const inRange = (spec, p) => String(spec).split(':')[0].split('-').length === 2 ? (p >= +spec.split(':')[0].split('-')[0] && p <= +spec.split(':')[0].split('-')[1]) : +String(spec).split(':')[0] === p;
        function svcMatch(name, f, seen) {
            seen = seen || {};
            if (seen[name]) return false; seen[name] = true;
            if (SVC[name]) return SVC[name].some(([pr, port]) => pr === 'any' || (pr === f.proto && (port === undefined || port === f.dport)));
            const c = M().t['firewall service custom'].v[name];
            if (c) {
                if ((c.protocol || 'TCP/UDP/SCTP') === 'ICMP') return f.proto === 'icmp';
                return (f.proto === 'tcp' && (c['tcp-portrange'] || []).some(sp => inRange(sp, f.dport))) || (f.proto === 'udp' && (c['udp-portrange'] || []).some(sp => inRange(sp, f.dport)));
            }
            const g = M().t['firewall service group'].v[name];
            return !!g && (g.member || []).some(m => svcMatch(m, f, seen));
        }
        function addrMatch(name, ip, seen) {
            seen = seen || {};
            if (seen[name]) return false; seen[name] = true;
            if (name === 'all') return true;
            if (name === 'none') return false;
            const a = M().t['firewall address'].v[name];
            if (a) {
                const ty = a.type || 'ipmask';
                if (ty === 'ipmask') { const [n, m] = (a.subnet || '0.0.0.0 0.0.0.0').split(' '); return sameNet(n, ip, maskLen(m)); }
                if (ty === 'iprange') return ip2n(ip) >= ip2n(a['start-ip'] || '0.0.0.0') && ip2n(ip) <= ip2n(a['end-ip'] || '0.0.0.0');
                return false; // fqdn: simülatörde çözülmez
            }
            const g = M().t['firewall addrgrp'].v[name];
            return !!g && (g.member || []).some(m => addrMatch(m, ip, seen));
        }
        const ifIp = n => { if (isTun(n)) return ifIp(M().t['vpn ipsec phase1-interface'].v[n].interface); const i = M().t['system interface'].v[n]; return i && i.ip ? i.ip.split(' ')[0] : null; };
        // ── M6: zamanlama. Akışın zamanı f.when ya da lab.sim.now: "monday 10:30" (yoksa pazartesi 10:00)
        function schedOk(name, f) {
            if (!name || name === 'always') return true;
            if (name === 'none') return false;
            const o = M().t['firewall schedule recurring'].v[name];
            if (!o) return true;
            const [day, hm] = String(f.when || SIM.now || 'monday 10:00').split(' ');
            const days = o.day || ['none'];
            if (!days.includes(day)) return false;
            const st = o.start || '00:00', en = o.end || '00:00';
            if (st === en) return true;          // başlangıç = bitiş: gün boyu
            return st < en ? (hm >= st && hm < en) : (hm >= st || hm < en);
        }
        // ── M1–M3: güvenlik profilleri. Yalnız kullanıcının tanımladığı profiller karar üretir;
        // hazır profil adları (default, all_default…) mevcut lab'lardaki gibi etkisizdir.
        // Akış alanları: host, path (web), cat (FortiGuard kategori no), dns (sorgulanan ad), attack {name, severity, def}, app {name, id, cat}
        const wild = (pat, str) => new RegExp('^' + String(pat).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(str);
        function domMatch(type, pat, host) {
            if (!host) return false;
            if (type === 'regex') { try { return new RegExp(pat, 'i').test(host); } catch (e) { return false; } }
            if (type === 'wildcard') return wild(pat, host);
            const p0 = String(pat).toLowerCase(), h = host.toLowerCase();
            return h === p0 || h.endsWith('.' + p0);
        }
        function urlMatch(type, pat, url, host) {
            if (type === 'regex') { try { return new RegExp(pat, 'i').test(url); } catch (e) { return false; } }
            if (type === 'wildcard') return wild(pat, url) || wild(pat, host);
            const p0 = String(pat).toLowerCase().replace(/^https?:\/\//, ''), u = url.toLowerCase();
            if (p0.includes('/')) return u === p0 || u.startsWith(p0.replace(/\/$/, '') + '/') || u === p0.replace(/\/$/, '');
            return domMatch('simple', p0, host);
        }
        // SSL profili derin inceleme yapıyor mu (ve bu akış muaf değil mi)?
        function sslDeep(name, f) {
            if (!name || name === 'no-inspection' || name === 'certificate-inspection') return false;
            if (name === 'deep-inspection' || name === 'custom-deep-inspection') return true;
            const o = M().t['firewall ssl-ssh-profile'].v[name]; if (!o) return false;
            const h = o._sub_https || {};
            if ((h.status || 'deep-inspection') !== 'deep-inspection') return false;
            if (!(h.ports || ['443']).includes(String(f.dport))) return false;
            const ex = o['_sub_ssl-exempt'];
            const exempt = ex && ex.o.some(k => { const e = ex.v[k], ty = e.type || 'fortiguard-category';
                if (ty === 'fortiguard-category') return f.cat !== undefined && String(f.cat) === String(e['fortiguard-category'] || '0');
                if (ty === 'address') return !!e.address && addrMatch(e.address, f.dst);
                return !!e['wildcard-fqdn'] && !!f.host && wild(e['wildcard-fqdn'], f.host); });
            return !exempt;
        }
        function utmEval(p, f, r) {
            if (!p || p['utm-status'] !== 'enable') return null;
            const ev = [];   // { kind, action: 'block'|'monitor'|'pass', ... }
            const out = () => ({ events: ev, blocked: ev.some(e => e.action === 'block') });
            // Uygulama kontrolü
            const al = p['application-list'] && M().t['application list'].v[p['application-list']];
            if (al && f.app) {
                const en = al._sub_entries, hit = en && en.o.map(k => en.v[k]).find(e => (!(e.category || []).length && !(e.application || []).length) || (e.category || []).includes(String(f.app.cat)) || (e.application || []).includes(String(f.app.id)));
                if (hit) { const act = hit.action || 'block'; ev.push({ kind: 'app', action: act === 'pass' ? 'pass' : 'block', reset: act === 'reset', app: f.app, log: (hit.log || 'enable') === 'enable', list: p['application-list'] }); if (act !== 'pass') return out(); }
            }
            // IPS
            const is = p['ips-sensor'] && M().t['ips sensor'].v[p['ips-sensor']];
            if (is && f.attack) {
                const en = is._sub_entries, hit = en && en.o.map(k => en.v[k]).find(e => (e.status || 'default') !== 'disable' && (!(e.severity || []).length || e.severity.includes(f.attack.severity)));
                if (hit) {
                    const a0 = hit.action || 'default', act = a0 === 'default' ? (f.attack.def || 'pass') : a0;
                    ev.push({ kind: 'ips', action: act === 'pass' ? 'monitor' : 'block', reset: act === 'reset', attack: f.attack, log: (hit.log || 'enable') === 'enable', sensor: p['ips-sensor'] });
                    if (act !== 'pass') return out();
                }
            }
            // DNS filtre (UDP/TCP 53, f.dns = sorgulanan ad)
            const dp = p['dnsfilter-profile'] && M().t['dnsfilter profile'].v[p['dnsfilter-profile']];
            if (dp && f.dns && +r.dport === 53) {
                const tid = (dp['_sub_domain-filter'] || {})['domain-filter-table'], tb = tid && M().t['dnsfilter domain-filter'].v[tid], en = tb && tb._sub_entries;
                const hit = en && en.o.map(k => en.v[k]).find(e => (e.status || 'enable') === 'enable' && domMatch(e.type || 'simple', e.domain, f.dns));
                if (hit) { const act = hit.action || 'block'; ev.push({ kind: 'dns', action: act === 'allow' ? 'pass' : act, qname: f.dns, how: 'domain-filter' }); if (act !== 'monitor') return out(); }
                const fl = ((dp['_sub_ftgd-dns'] || {})._sub_filters);
                const fh = fl && f.cat !== undefined && fl.o.map(k => fl.v[k]).find(e => String(e.category) === String(f.cat));
                if (fh) ev.push({ kind: 'dns', action: fh.action || 'monitor', qname: f.dns, cat: f.cat, how: 'ftgd' });
                return out();
            }
            // Web filtre (HTTP/HTTPS, f.host [+ f.path])
            const wp = p['webfilter-profile'] && M().t['webfilter profile'].v[p['webfilter-profile']];
            if (wp && f.host) {
                const https = +r.dport === 443, deep = !https || sslDeep(p['ssl-ssh-profile'] || 'no-inspection', f);
                // SSL incelemesi yoksa (no-inspection) HTTPS'te web filtre hiçbir şey görmez; certificate-inspection yalnız ana bilgisayar adını (SNI) görür
                if (https && (p['ssl-ssh-profile'] || 'no-inspection') === 'no-inspection') return out();
                const url = f.host + (deep ? (f.path || '/') : '/'), host = f.host;
                const tid = (wp._sub_web || {})['urlfilter-table'], tb = tid && M().t['webfilter urlfilter'].v[tid], en = tb && tb._sub_entries;
                const hit = en && en.o.map(k => en.v[k]).find(e => (e.status || 'enable') === 'enable' && urlMatch(e.type || 'simple', e.url, url, host));
                if (hit) {
                    const act = hit.action || 'exempt';
                    if (act === 'block') { ev.push({ kind: 'web', action: 'block', url, host, how: 'urlfilter', deep }); return out(); }
                    if (act === 'monitor') ev.push({ kind: 'web', action: 'monitor', url, host, how: 'urlfilter', deep });
                    if (act === 'exempt' || act === 'allow') { ev.push({ kind: 'web', action: 'pass', url, host, how: 'urlfilter', deep }); return out(); }
                }
                const fl = ((wp['_sub_ftgd-wf'] || {})._sub_filters);
                const fh = fl && f.cat !== undefined && fl.o.map(k => fl.v[k]).find(e => String(e.category) === String(f.cat));
                if (fh) { const act = fh.action || 'monitor'; ev.push({ kind: 'web', action: act === 'block' ? 'block' : 'monitor', url, host, cat: f.cat, how: 'ftgd', note: act === 'warning' || act === 'authenticate' ? act : null, deep }); }
            }
            return out();
        }
        // Tek karar motoru: VIP (DNAT) → rota → kural → NAT
        function decide(f) {
            const r = { f, dst: f.dst, dport: f.dport };
            if (f.arrives === false) return Object.assign(r, { stage: 'noarrive' });
            if (!ifUp(f.in)) return Object.assign(r, { stage: 'noarrive' });
            for (const k of M().t['firewall vip'].o) {
                const v = M().t['firewall vip'].v[k], ex = v.extintf || 'any';
                if ((ex === 'any' || ex === f.in) && v.extip === f.dst && (v.portforward !== 'enable' || (+v.extport === f.dport && (v.protocol || 'tcp') === f.proto))) {
                    r.vip = k; r.dst = String(v.mappedip).split('-')[0]; r.dport = v.portforward === 'enable' ? +v.mappedport : f.dport; break;
                }
            }
            const rt = rib().filter(x => x.len === 0 || sameNet(x.net, r.dst, x.len)).sort((a, b) => b.len - a.len)[0];
            if (!rt) return Object.assign(r, { stage: 'noroute' });
            if (rt.bh) return Object.assign(r, { stage: 'blackhole', out: 'Null' });
            r.out = rt.dev; r.gw = rt.c === 'C' ? r.dst : rt.gw;
            const pf = Object.assign({}, f, { dport: r.dport });
            // Aynı zone'un iki üyesi arası: intrazone allow ise kural aranmaz
            const zi = zoneOf(f.in);
            if (zi && zi === zoneOf(r.out) && (M().t['system zone'].v[zi].intrazone || 'deny') === 'allow') { r.policy = 'intrazone'; r.action = 'accept'; r.stage = 'allowed'; r.zone = zi; return r; }
            for (const k of M().t['firewall policy'].o) {
                const p = M().t['firewall policy'].v[k];
                if ((p.status || 'enable') !== 'enable') continue;
                const hasIf = (list, n) => (list || []).includes('any') || (list || []).includes(n) || (!!zoneOf(n) && (list || []).includes(zoneOf(n)));
                if (!hasIf(p.srcintf, f.in) || !hasIf(p.dstintf, r.out)) continue;
                if (!(p.srcaddr || []).some(a => addrMatch(a, f.src))) continue;
                const dOk = r.vip ? (p.dstaddr || []).includes(r.vip) : (p.dstaddr || []).some(a => addrMatch(a, r.dst));
                if (!dOk) continue;
                if (!(p.service || []).some(sv => svcMatch(sv, pf))) continue;
                if ((p.groups || []).length && !(f.groups || []).some(g => p.groups.includes(g))) continue;
                if (!schedOk(p.schedule, f)) continue;
                r.policy = k; r.action = p.action || 'deny';
                if (r.action === 'accept' && centralNat()) {
                    // M6: merkezi NAT — SNAT ilk eşleşen central-snat-map kaydından (kuraldaki nat alanı yok sayılır)
                    const cm = M().t['firewall central-snat-map'];
                    const hit = cm.o.find(id => { const e = cm.v[id]; return (e.status || 'enable') === 'enable' && hasIf(e.srcintf, f.in) && hasIf(e.dstintf, r.out) && (e['orig-addr'] || []).some(a => addrMatch(a, f.src)) && (e['dst-addr'] || []).some(a => addrMatch(a, r.dst)); });
                    if (hit !== undefined) {
                        r.csnat = hit; const e = cm.v[hit];
                        if ((e.nat || 'enable') === 'enable') {
                            const pool = (e['nat-ippool'] || [])[0] && M().t['firewall ippool'].v[e['nat-ippool'][0]];
                            r.snat = pool ? pool.startip : ifIp(r.out);
                            r.sport2 = pool && pool.type === 'one-to-one' ? f.sport : 60000 + (ip2n(f.src) + f.sport) % 5000;
                        }
                    }
                } else if (r.action === 'accept' && p.nat === 'enable') {
                    const pool = p.ippool === 'enable' && (p.poolname || [])[0] && M().t['firewall ippool'].v[(p.poolname || [])[0]];
                    r.snat = pool ? pool.startip : ifIp(r.out);
                    // one-to-one havuz port çevirmez; overload/arayüz NAT kaynak portu değiştirir
                    r.sport2 = pool && pool.type === 'one-to-one' ? f.sport : 60000 + (ip2n(f.src) + f.sport) % 5000;
                }
                break;
            }
            if (r.policy === undefined) { r.policy = '0'; r.action = 'deny'; }
            r.stage = r.action === 'accept' ? 'allowed' : 'denied';
            if (r.stage === 'allowed' && r.policy !== 'intrazone') r.utm = utmEval(M().t['firewall policy'].v[r.policy], f, r);
            if (r.stage === 'allowed' && isTun(r.out)) {
                const T = tun(r.out); r.tun = T;
                const p2 = T.p2 && M().t['vpn ipsec phase2-interface'].v[T.p2];
                const selOk = p2 && (() => { const [sn, sm] = norm(p2['src-subnet']).split(' '), [dn, dm] = norm(p2['dst-subnet']).split(' '); return sameNet(sn, r.snat || f.src, maskLen(sm)) && sameNet(dn, r.dst, maskLen(dm)); })();
                if (!T.p2up || !selOk) r.stage = 'nosa';
            }
            return r;
        }
        const flows = () => (SIM.flows || []).map((f, i) => Object.assign({ sport: 50000 + i * 111, proto: 'tcp', reply: 'ok', arrives: true }, f));
        const hostPort = (ip, p, f) => f.proto === 'icmp' ? ip : ip + ':' + p;

        // ── debug flow
        function flowMatches(f) {
            const q = S.dbg.filter;
            if (q.addr && f.src !== q.addr && f.dst !== q.addr) return false;
            if (q.saddr && f.src !== q.saddr) return false;
            if (q.daddr && f.dst !== q.daddr) return false;
            if (q.port && f.dport !== +q.port && f.sport !== +q.port) return false;
            if (q.dport && f.dport !== +q.dport) return false;
            if (q.proto && ({ 1: 'icmp', 6: 'tcp', 17: 'udp' })[q.proto] !== f.proto) return false;
            return true;
        }
        function traceOne(f) {
            const d = decide(f), tid = ++S.dbg.tid, L = [];
            if (d.stage === 'noarrive') return { d, text: '' };
            const pre = 'id=65308 trace_id=' + tid + ' ';
            const fn = (name, line) => S.dbg.fn ? 'func=' + name + ' line=' + line + ' ' : '';
            const pn = { tcp: 6, udp: 17, icmp: 1 }[f.proto];
            L.push(pre + fn('print_pkt_detail', 5895) + 'msg="vd-root:0 received a packet(proto=' + pn + ', ' + hostPort(f.src, f.sport, f) + '->' + hostPort(f.dst, f.dport, f) + ') tun_id=0.0.0.0 from ' + f.in + '.' + (f.proto === 'tcp' ? ' flag [S], seq 1' + String(tid).padStart(9, '0') + ', ack 0, win 64240"' : f.proto === 'icmp' ? ' type=8, code=0, id=1, seq=' + tid + '."' : '"'));
            L.push(pre + fn('init_ip_session_common', 6076) + 'msg="allocate a new session-000' + (4096 + tid).toString(16) + ', tun_id=0.0.0.0"');
            if (d.vip) L.push(pre + fn('get_new_addr', 1219) + 'msg="find DNAT: IP-' + d.dst + ', port-' + d.dport + '"');
            if (d.stage === 'blackhole') { L.push(pre + fn('vf_ip_route_input_common', 2605) + 'msg="find a route: flag=04000000 gw-0.0.0.0 via Null (blackhole), drop"'); return { d, text: L.join('\n') }; }
            if (d.stage === 'noroute') { L.push(pre + fn('vf_ip_route_input_common', 2605) + 'msg="no route to ' + d.dst + ', drop"'); return { d, text: L.join('\n') }; }
            L.push(pre + fn('vf_ip_route_input_common', 2605) + 'msg="find a route: flag=04000000 gw-' + d.gw + ' via ' + d.out + '"');
            if (d.stage === 'denied') { L.push(pre + fn('fw_forward_handler', 881) + 'msg="Denied by forward policy check (policy ' + d.policy + ')"'); return { d, text: L.join('\n') }; }
            if (d.vip) L.push(pre + fn('fw_forward_handler', 997) + 'msg="Allowed by Policy-' + d.policy + ':"');
            else L.push(pre + fn('fw_forward_handler', 997) + 'msg="Allowed by Policy-' + d.policy + ':' + (d.snat ? ' SNAT' : '') + '"');
            if (d.vip) L.push(pre + fn('__ip_session_run_tuple', 3474) + 'msg="DNAT ' + f.dst + ':' + f.dport + '->' + d.dst + ':' + d.dport + '"');
            if (d.snat) L.push(pre + fn('__ip_session_run_tuple', 3460) + 'msg="SNAT ' + f.src + '->' + d.snat + ':' + d.sport2 + '"');
            if (d.stage === 'nosa') { L.push(pre + fn('ipsecdev_hard_start_xmit', 669) + 'msg="enter IPSec interface-' + d.out + '"'); L.push(pre + fn('ipsec_common_output4', 780) + 'msg="no matching IPsec selector, drop"'); return { d, text: L.join('\n') }; }
            if (d.tun) {
                const p1 = M().t['vpn ipsec phase1-interface'].v[d.out];
                L.push(pre + fn('ipsecdev_hard_start_xmit', 669) + 'msg="enter IPSec interface-' + d.out + '"');
                L.push(pre + fn('_do_ipsecdev_hard_start_xmit', 229) + 'msg="encrypted, and send to ' + p1['remote-gw'] + ' with source ' + ifIp(p1.interface) + '"');
                L.push(pre + fn('ipsec_output_finish', 232) + 'msg="send to ' + (rib(true).filter(x => x.len === 0 || sameNet(x.net, p1['remote-gw'], x.len)).sort((a, b) => b.len - a.len)[0] || {}).gw + ' via intf-' + p1.interface + '"');
            }
            return { d, text: L.join('\n') };
        }
        function runTrace() {
            if (!S.dbg.on || S.dbg.trace <= 0) return '';
            const noFilter = !Object.keys(S.dbg.filter).length;
            const list = flows().filter(f => noFilter || flowMatches(f)).slice(0, S.dbg.trace);
            S.dbg.trace -= list.length;
            const out = list.map(traceOne);
            out.forEach(o => { if (o.text) log({ trace: o.d.stage, policy: o.d.policy, out: o.d.out, flow: o.d.f.src + '>' + o.d.f.dst }); });
            if (noFilter) log({ warn: 'debug-nofilter' });
            const txt = out.map(o => o.text).filter(Boolean).join('\n');
            return (noFilter ? '# [Simülatör] UYARI: filtresiz debug flow tüm trafiği izler; üretimde CPU\'yu yorar. Önce "diagnose debug flow filter addr <ip>".\n' : '') + (txt || '');
        }

        // ── sniffer
        function sniffFilter(expr) {
            const t = expr.trim().split(/\s+/).filter(Boolean);
            if (!t.length) return () => true;
            const terms = []; let op = 'and', i = 0, bad = false;
            while (i < t.length) {
                let w = t[i].toLowerCase(), dir = null, neg = false;
                if (w === 'and' || w === 'or') { op = w; i++; continue; }
                if (w === 'not') { neg = true; w = (t[++i] || '').toLowerCase(); }
                if (w === 'src' || w === 'dst') { dir = w; w = (t[++i] || '').toLowerCase(); }
                let fn = null;
                if (w === 'host' && isIp(t[i + 1] || '')) { const ip = t[++i]; fn = p => dir === 'src' ? p.s === ip : dir === 'dst' ? p.d === ip : p.s === ip || p.d === ip; }
                else if (w === 'port' && /^\d+$/.test(t[i + 1] || '')) { const n = +t[++i]; fn = p => dir === 'src' ? p.sp === n : dir === 'dst' ? p.dp === n : p.sp === n || p.dp === n; }
                else if (w === 'net' && /^[\d.]+\/\d+$/.test(t[i + 1] || '')) { const [n, l] = t[++i].split('/'); fn = p => dir === 'src' ? sameNet(n, p.s, +l) : dir === 'dst' ? sameNet(n, p.d, +l) : sameNet(n, p.s, +l) || sameNet(n, p.d, +l); }
                else if (['tcp', 'udp', 'icmp', 'esp', 'arp'].includes(w)) fn = p => p.proto === w;
                else if (isIp(t[i])) { const ip = t[i]; fn = p => p.s === ip || p.d === ip; }
                else { bad = true; break; }
                const g = neg ? (p => !fn(p)) : fn;
                terms.push({ op, g }); op = 'and'; i++;
            }
            if (bad) return null;
            return p => terms.reduce((acc, x, k) => k === 0 ? x.g(p) : x.op === 'and' ? acc && x.g(p) : acc || x.g(p), true);
        }
        function packetsOf(f) {
            const d = decide(f), P = [], ts = () => (0.8 + P.length * 0.0213).toFixed(6);
            if (d.stage === 'noarrive') return P;
            const tcpFlag = (k) => f.proto === 'tcp' ? ': ' + k : f.proto === 'icmp' ? ': icmp: ' + (k === 'syn' ? 'echo request' : 'echo reply') : ': udp';
            const hp = (ip, port) => f.proto === 'icmp' ? ip : ip + '.' + port;
            P.push({ t: ts(), i: f.in, dir: 'in', s: f.src, sp: f.sport, d: f.dst, dp: f.dport, proto: f.proto, txt: hp(f.src, f.sport) + ' -> ' + hp(f.dst, f.dport) + tcpFlag('syn') });
            if (d.stage !== 'allowed') return P;
            const os = d.snat || f.src, osp = d.snat ? d.sport2 : f.sport;
            if (d.stage === 'nosa') return P;
            // M9: soğuk ARP önbelleği (lab.sim.arpCold) — ilk pakette ağ geçidi çözülür; biçim Fortinet ARP sorun giderme belgesindeki gibi
            if (SIM.arpCold && !isTun(d.out) && d.gw && !S.arpSeen[d.out + d.gw]) {
                S.arpSeen[d.out + d.gw] = true; const me = ifIp(d.out);
                P.push({ t: ts(), i: d.out, dir: 'out', s: me, sp: 0, d: d.gw, dp: 0, proto: 'arp', txt: 'arp who-has ' + d.gw + ' tell ' + me });
                P.push({ t: ts(), i: d.out, dir: 'in', s: d.gw, sp: 0, d: me, dp: 0, proto: 'arp', txt: 'arp reply ' + d.gw + ' is-at ' + macOf(d.gw) });
            }
            P.push({ t: ts(), i: d.out, dir: 'out', s: os, sp: osp, d: d.dst, dp: d.dport, proto: f.proto, txt: hp(os, osp) + ' -> ' + hp(d.dst, d.dport) + tcpFlag('syn') });
            const esp = (dir) => { const p1 = M().t['vpn ipsec phase1-interface'].v[d.out], a = ifIp(p1.interface), b = p1['remote-gw']; P.push({ t: ts(), i: p1.interface, dir, s: dir === 'out' ? a : b, sp: 0, d: dir === 'out' ? b : a, dp: 0, proto: 'esp', txt: (dir === 'out' ? a + ' -> ' + b : b + ' -> ' + a) + ': ip-proto-50 ' + (f.proto === 'tcp' ? 92 : 108) }); };
            if (d.tun) esp('out');
            if (f.reply === 'none' || (d.tun && d.snat)) return P;
            if (d.tun) esp('in');
            const rk = f.reply === 'rst' ? 'rst ack' : f.proto === 'tcp' ? 'syn ack' : 'reply';
            P.push({ t: ts(), i: d.out, dir: 'in', s: d.dst, sp: d.dport, d: os, dp: osp, proto: f.proto, txt: hp(d.dst, d.dport) + ' -> ' + hp(os, osp) + tcpFlag(rk) });
            P.push({ t: ts(), i: f.in, dir: 'out', s: f.dst, sp: f.dport, d: f.src, dp: f.sport, proto: f.proto, txt: hp(f.dst, f.dport) + ' -> ' + hp(f.src, f.sport) + tcpFlag(rk) });
            // M9: el sıkışmanın 3. adımı (ACK) — istemciden, iki bacakta. İsteğe bağlı (lab.sim.handshake: true);
            // mevcut lab'ların sniffer çıktısı değişmesin diye varsayılan kapalı.
            if (f.proto === 'tcp' && rk === 'syn ack' && SIM.handshake === true) {
                P.push({ t: ts(), i: f.in, dir: 'in', s: f.src, sp: f.sport, d: f.dst, dp: f.dport, proto: 'tcp', txt: hp(f.src, f.sport) + ' -> ' + hp(f.dst, f.dport) + ': ack' });
                P.push({ t: ts(), i: d.out, dir: 'out', s: os, sp: osp, d: d.dst, dp: d.dport, proto: 'tcp', txt: hp(os, osp) + ' -> ' + hp(d.dst, d.dport) + ': ack' });
            }
            return P;
        }
        function sniffer(args, line) {
            // diagnose sniffer packet <intf> '<filtre>' [verbose] [count] [a|l]
            const intf = args[0] ? args[0].t : null;
            if (!intf) return { err: 'command parse error before \'packet\'' };
            if (intf !== 'any' && !M().t['system interface'].v[intf] && !isTun(intf)) return { err: 'command parse error before \'' + intf + '\'' };
            const expr = args[1] ? args[1].t : '', verb = args[2] ? +args[2].t : 1, cnt = args[3] ? +args[3].t : 0;
            if (args[2] && !(verb >= 1 && verb <= 6)) return { err: 'command parse error before \'' + args[2].t + '\'' };
            const flt = sniffFilter(expr === 'none' ? '' : expr);
            if (!flt) return { err: 'Invalid filter: ' + expr };
            S.arpSeen = {};
            let pk = [].concat(...flows().map(packetsOf)).filter(p => (intf === 'any' || p.i === intf) && flt(p));
            if (cnt > 0) pk = pk.slice(0, cnt);
            log({ sniff: { intf, expr, verb, cnt, n: pk.length } });
            const L = ['interfaces=[' + intf + ']', 'filters=[' + (expr || 'none') + ']'];
            pk.forEach(p => L.push(p.t + ' ' + (verb >= 4 ? p.i + ' ' + p.dir + ' ' : '') + p.txt));
            if (verb === 3 || verb === 6) L.push('# [Simülatör] Paket içeriği (hex) dökümü gösterilmez.');
            if (!cnt || pk.length < cnt) L.push(pk.length ? '# [Simülatör] Yakalama durdu (Ctrl+C).' : '# [Simülatör] Eşleşen paket yok; Ctrl+C ile durduruldu.');
            L.push('', pk.length + ' packets received by filter', '0 packets dropped by kernel');
            return L.join('\n');
        }

        // ── performans / süreç / oturum / bellek / kayıtlar
        const perf = () => Object.assign({ cpu: [2, 1, 0, 97, 0, 0, 0], memTotal: 2055872, memPct: 42, freeable: 6, sessions: 312, rate: 5, uptime: '12 days,  3 hours,  5 minutes', netIn: 1253, netOut: 1150 }, SIM.perf || {});
        function perfStatus() {
            const p = perf(), c = p.cpu, used = Math.round(p.memTotal * p.memPct / 100), fr = Math.round(p.memTotal * p.freeable / 100), free = p.memTotal - used - fr;
            return ['CPU states: ' + c[0] + '% user ' + c[1] + '% system ' + c[2] + '% nice ' + c[3] + '% idle ' + c[4] + '% iowait ' + c[5] + '% irq ' + c[6] + '% softirq',
                'CPU0 states: ' + c[0] + '% user ' + c[1] + '% system ' + c[2] + '% nice ' + c[3] + '% idle ' + c[4] + '% iowait ' + c[5] + '% irq ' + c[6] + '% softirq',
                'Memory: ' + p.memTotal + 'k total, ' + used + 'k used (' + p.memPct.toFixed(1) + '%), ' + free + 'k free (' + (100 - p.memPct - p.freeable).toFixed(1) + '%), ' + fr + 'k freeable (' + p.freeable.toFixed(1) + '%)',
                'Average network usage: ' + p.netIn + ' / ' + p.netOut + ' kbps in 1 minute, ' + Math.round(p.netIn * .93) + ' / ' + Math.round(p.netOut * .91) + ' kbps in 10 minutes, ' + Math.round(p.netIn * .87) + ' / ' + Math.round(p.netOut * .85) + ' kbps in 30 minutes',
                'Average sessions: ' + p.sessions + ' sessions in 1 minute, ' + Math.round(p.sessions * .95) + ' sessions in 10 minutes, ' + Math.round(p.sessions * .9) + ' sessions in 30 minutes',
                'Average session setup rate: ' + p.rate + ' sessions per second in last 1 minute, ' + Math.max(1, Math.round(p.rate * .8)) + ' sessions per second in last 10 minutes, ' + Math.max(1, Math.round(p.rate * .7)) + ' sessions per second in last 30 minutes',
                'Virus caught: 0 total in 1 minute', 'IPS attacks blocked: 0 total in 1 minute', 'Uptime: ' + p.uptime].join('\n');
        }
        const procs = () => (SIM.procs || [['newcli', 8923, 'R', 0.5, 0.8], ['httpsd', 214, 'S', 0.2, 1.9], ['cmdbsvr', 118, 'S', 0.1, 2.1], ['miglogd', 201, 'S', 0.1, 1.2], ['ipsengine', 190, 'S <', 0.0, 3.4], ['wad', 205, 'S', 0.0, 2.6], ['forticron', 209, 'S', 0.0, 0.9], ['cw_acd', 238, 'S', 0.0, 1.1], ['updated', 226, 'S', 0.0, 0.8], ['fgfmd', 231, 'S', 0.0, 0.7]]);
        function sysTop(n) {
            const p = perf(), c = p.cpu, tot = Math.round(p.memTotal / 1024), fr = Math.round(tot * (100 - p.memPct) / 100);
            const list = procs().slice().sort((a, b) => b[3] - a[3] || b[4] - a[4]).slice(0, n || 20);
            return ['Run Time:  ' + p.uptime.replace(/,\s+(\d+ minutes)/, ' and $1').replace(/\s+/g, ' '),
                c[0] + 'U, ' + c[2] + 'N, ' + c[1] + 'S, ' + c[3] + 'I, ' + c[4] + 'WA, ' + c[5] + 'HI, ' + c[6] + 'SI, 0ST; ' + tot + 'T, ' + fr + 'F']
                .concat(list.map(x => padL(x[0], 18) + padL(x[1], 9) + padL(x[2], 7) + padL(x[3].toFixed(1), 8) + padL(x[4].toFixed(1), 8)))
                .concat(['# [Simülatör] Gerçek cihazda ekran her 5 sn yenilenir; "q" ile çıkılır. Burada tek görüntü gösterilir.']).join('\n');
        }
        const padL = (s, n) => { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; };
        function bulk() { return SIM.bulk || []; } // [{src, dst, dport, proto, n}] arka plan oturumları
        function sessTotal() { return perf().sessions; }
        function sessStat() {
            const p = perf();
            return ['misc info:       session_count=' + p.sessions + ' setup_rate=' + p.rate + ' exp_count=0 clash=0',
                '        memory_tension_drop=' + (SIM.conserve ? 1843 : 0) + ' ephemeral=0/65536 removeable=0',
                'delete=0, flush=0, dev_down=0/0 ses_walkers=0', 'TCP sessions:', '         ' + Math.round(p.sessions * .7) + ' in ESTABLISHED state',
                '         ' + Math.round(p.sessions * .2) + ' in SYN_SENT state', '         ' + Math.round(p.sessions * .1) + ' in TIME_WAIT state',
                'firewall error stat:', 'error1=00000000', 'error2=00000000', 'error3=00000000', 'error4=00000000', 'tt=00000000', 'cont=00000000', 'ids_recv=00000000', 'url_recv=00000000', 'av_recv=00000000', 'fqdn_count=00000000', 'global: ses_limit=0 ses6_limit=0 rt_limit=0 rt6_limit=0'].join('\n');
        }
        // Oturum örneklemi: izlenen akışlar + arka plan yığınları (n'e göre ağırlıklı)
        function sessionRows() {
            const rows = [];
            for (const f of flows()) { const d = decide(f); if (d.stage === 'allowed') rows.push({ proto: f.proto, src: f.src, sport: f.sport, dst: d.dst, dport: d.dport, snat: d.snat, sport2: d.sport2, odst: f.dst, odport: f.dport, vip: d.vip, policy: d.policy, out: d.out, gw: d.gw, in: f.in }); }
            const b = bulk(), tot = b.reduce((a, x) => a + x.n, 0);
            b.forEach((x, k) => {
                const share = Math.max(1, Math.round(30 * x.n / Math.max(tot, 1)));
                for (let i = 0; i < share; i++) rows.push({ proto: x.proto || 'tcp', src: x.src, sport: 40000 + k * 997 + i * 13, dst: x.dst, dport: x.dport, snat: x.snat, sport2: x.snat ? 61000 + i : undefined, policy: x.policy || '1', out: x.out || 'port1', in: x.in || 'port2', gw: x.gw || '203.0.113.1', weight: x.n / share });
            });
            return rows;
        }
        function sessMatch(r) {
            const q = S.sessFilter;
            if (q.src && r.src !== q.src) return false;
            if (q.dst && r.dst !== q.dst && r.odst !== q.dst) return false;
            if (q.dport && r.dport !== +q.dport) return false;
            if (q.sport && r.sport !== +q.sport) return false;
            if (q.proto && ({ 1: 'icmp', 6: 'tcp', 17: 'udp' })[q.proto] !== r.proto) return false;
            if (q.policy && String(r.policy) !== String(q.policy)) return false;
            return true;
        }
        function sessCount(rows) { return Math.round(rows.reduce((a, r) => a + (r.weight || 1), 0)); }
        function sessList() {
            const rows = sessionRows().filter(sessMatch), n = Object.keys(S.sessFilter).length ? sessCount(rows) : sessTotal();
            const pn = { tcp: 6, udp: 17, icmp: 1 };
            const show = rows.slice(0, 3).map((r, i) => ['session info: proto=' + pn[r.proto] + ' proto_state=' + (r.proto === 'tcp' ? '11' : '00') + ' duration=' + (12 + i) + ' expire=' + (3587 - i) + ' timeout=3600 flags=00000000 socktype=0 sockport=0 av_idx=0 use=3',
                'origin-shaper=', 'reply-shaper=', 'per_ip_shaper=', 'class_id=0 ha_id=0 policy_dir=0 tunnel=/ vlan_cos=0/255', 'state=log may_dirty',
                'statistic(bytes/packets/allow_err): org=' + (1843 + i) + '/12/1 reply=' + (5230 + i) + '/10/1 tuples=2',
                'orgin->sink: org pre->post, reply pre->post dev=' + r.in + '->' + r.out + '/' + r.out + '->' + r.in + ' gwy=' + r.gw + '/' + r.src,
                r.snat ? 'hook=post dir=org act=snat ' + r.src + ':' + r.sport + '->' + r.dst + ':' + r.dport + '(' + r.snat + ':' + r.sport2 + ')' : r.vip ? 'hook=pre dir=org act=dnat ' + r.src + ':' + r.sport + '->' + r.odst + ':' + r.odport + '(' + r.dst + ':' + r.dport + ')' : 'hook=pre dir=org act=noop ' + r.src + ':' + r.sport + '->' + r.dst + ':' + r.dport + '(0.0.0.0:0)',
                'misc=0 policy_id=' + r.policy + ' auth_info=0 chk_client_info=0 vd=0', 'serial=000' + (4096 + i).toString(16) + ' tos=ff/ff app_list=0 app=0 url_cat=0'].join('\n'));
            return show.join('\n\n') + (n > show.length ? '\n\n# [Simülatör] ' + n + ' oturumdan ilk ' + show.length + '\'ü gösterildi.' : '') + '\ntotal session ' + n;
        }
        function sessTable() {
            const rows = sessionRows().filter(sessMatch).slice(0, 25);
            const L = ['PROTO   EXPIRE SOURCE           SOURCE-NAT       DESTINATION      DESTINATION-NAT'];
            rows.forEach((r, i) => L.push(pad(r.proto, 8) + pad(3598 - i * 7, 7) + pad(r.src + ':' + r.sport, 17) + pad(r.snat ? r.snat + ':' + r.sport2 : '-', 17) + pad((r.odst || r.dst) + ':' + (r.odport || r.dport), 17) + (r.vip ? r.dst + ':' + r.dport : '-')));
            if (sessTotal() > rows.length) L.push('# [Simülatör] ' + sessTotal() + ' oturumdan örneklenmiş ' + rows.length + ' satır.');
            return L.join('\n');
        }
        function memInfo() {
            const p = perf(), used = Math.round(p.memTotal * p.memPct / 100), free = p.memTotal - used;
            return ['MemTotal:        ' + p.memTotal + ' kB', 'MemFree:         ' + free + ' kB', 'Buffers:            2380 kB', 'Cached:           ' + Math.round(p.memTotal * p.freeable / 100) + ' kB',
                'SwapCached:            0 kB', 'Active:           ' + Math.round(used * .6) + ' kB', 'Inactive:         ' + Math.round(used * .2) + ' kB', 'Shmem:            203140 kB', 'Slab:             ' + Math.round(used * .08) + ' kB'].join('\n');
        }
        function conserve() {
            const p = perf(), tot = Math.round(p.memTotal / 1024), used = Math.round(tot * p.memPct / 100);
            const row = (k, mb) => pad(k + ':', 39) + pad(mb + ' MB', 10) + Math.round(100 * mb / tot) + '% of total RAM';
            return [pad('memory conserve mode:', 39) + (SIM.conserve ? 'on' : 'off'), pad('total RAM:', 39) + tot + ' MB', row('memory used', used),
                row('memory used threshold extreme', Math.round(tot * .95)), row('memory used threshold red', Math.round(tot * .88)), row('memory used threshold green', Math.round(tot * .82))].join('\n');
        }
        function crashlog() {
            const c = SIM.crash || [];
            if (!c.length) return '\nCrash log interval is 3600 seconds\nMax crash log line number: 16384';
            return c.map((l, i) => (i + 1) + ': ' + l).join('\n') + '\n\nCrash log interval is 3600 seconds\nMax crash log line number: 16384';
        }
        function cfgErrLog() { const c = SIM.cfgErr || []; return c.length ? c.join('\n') : ''; }

        // ── diagnose ağacı
        const DIAG = {
            sys: { ha: { checksum: { cluster: 'hacsum' }, history: { read: 'hahist' } }, top: 'top', session: { stat: 'sstat', list: 'slist', clear: 'sclear', filter: 'sfilter' } },
            hardware: { sysinfo: { memory: 'mem', conserve: 'conserve' } },
            debug: { reset: 'dreset', enable: 'denable', disable: 'ddisable', info: 'dinfo', crashlog: { read: 'crash' }, 'config-error-log': { read: 'cfgerr' },
                flow: { filter: 'ffilter', show: { 'function-name': 'ffn' }, trace: { start: 'tstart', stop: 'tstop' } }, console: { timestamp: 'dts' } },
            sniffer: { packet: 'sniff' },
            vpn: { ike: { gateway: { list: 'ikegw' }, 'log-filter': 'ikelf' }, tunnel: { list: 'tunlist' }, ssl: { list: 'ssllist' } },
            ip: { arp: { list: 'arplist' } },
        };
        DIAG.debug.application = { ike: 'appike', sslvpn: 'appssl' };
        DIAG.vpn.ike.log = { filter: 'ikelf2' };   // FortiOS 7.4.1+: diagnose vpn ike log filter …
        DIAG.test = { authserver: { radius: 'tradius', ldap: 'tldap' } };
        DIAG.sys.ntp = { status: 'ntpst' };
        DIAG.log = { test: 'logtest' };
        DIAG.firewall = { iprope: { lookup: 'iplookup' } };
        S.dbg.apps = {}; S.ikeFilter = null;
        // ── IPsec çıktıları
        const p1s = () => M().t['vpn ipsec phase1-interface'].o;
        function ikeOut() { const o = ikeDebug(); log({ ikedebug: p1s().map(n => tun(n).reason || 'up') }); if (!S.ikeFilter) log({ warn: 'ike-nofilter' }); return o; }
        function tunSummary() {
            return p1s().map(n => { const T = tun(n), p1 = T.p1; return "'" + n + "' " + (p1['remote-gw'] || '0.0.0.0') + ':0  selectors(total,up): ' + (hasP2(n) ? 1 : 0) + '/' + (T.p2up ? 1 : 0) + '  rx(pkt,err): ' + (T.p2up ? '120/0' : '0/0') + '  tx(pkt,err): ' + (T.p2up ? '118/0' : '0/' + (T.p1up ? 0 : 3)); }).join('\n');
        }
        function ikeGw(name) {
            const list = name ? [name] : p1s();
            return list.map(n => {
                const T = tun(n), p1 = T.p1; if (!p1) return '';
                const L = ['vd: root/0', 'name: ' + n, 'version: ' + (p1['ike-version'] || PEER.ike || '1'), 'interface: ' + p1.interface + ' 3', 'addr: ' + ifIp(p1.interface) + ':500 -> ' + p1['remote-gw'] + ':500',
                    'tun_id: ' + p1['remote-gw'] + '/::' + p1['remote-gw'], 'created: 312s ago', 'peer-id: ' + p1['remote-gw'], 'peer-id-auth: no', 'PPK: no',
                    'IKE SA: created 1/' + (T.p1up ? 1 : 5) + '  established ' + (T.p1up ? '1/1  time 20/20/20 ms' : '0/0  time 0/0/0 ms'),
                    'IPsec SA: created ' + (T.p2up ? '1/1  established 1/1  time 10/10/10 ms' : (T.p1up ? '1/3  established 0/0  time 0/0/0 ms' : '0/0  established 0/0  time 0/0/0 ms'))];
                if (T.p1up) L.push('', '  id/spi: 12 7e8a9c1f2b3d4e5f/6a7b8c9d0e1f2a3b', '  direction: initiator', '  status: established 312-312s ago = 20ms', '  proposal: ' + PEER.proposal, '  child: no', '  lifetime/rekey: 86400/85787', '  DPD sent/recv: 00000000/00000000');
                return L.join('\n');
            }).filter(Boolean).join('\n\n');
        }
        const espName = () => /^chacha/.test(PEER.p2proposal || '') ? 'chacha20poly1305' : 'aes';
        const hasP2 = n => M().t['vpn ipsec phase2-interface'].o.some(k => M().t['vpn ipsec phase2-interface'].v[k].phase1name === n);
        function tunList(name) {
            const L = ['list all ipsec tunnel in vd 0'];
            (name ? [name] : p1s()).forEach((n, i) => {
                const T = tun(n), p1 = T.p1; if (!p1) return;
                const p2 = T.p2 && M().t['vpn ipsec phase2-interface'].v[T.p2];
                const rng = v => { const [a, m] = norm(v).split(' '), l = maskLen(m), base = netOf(a, l); return n2ip(base) + '-' + n2ip(base + 2 ** (32 - l) - 1); };
                L.push('------------------------------------------------------', 'name=' + n + ' ver=' + (p1['ike-version'] || PEER.ike || '1') + ' serial=' + (i + 1) + ' ' + ifIp(p1.interface) + ':0->' + p1['remote-gw'] + ':0 tun_id=' + p1['remote-gw'] + ' dst_mtu=1500 dpd-link=on weight=1',
                    'bound_if=3 lgwy=static/1 tun=intf mode=auto/1 encap=none/552 options[0228]=npu frag-rfc  run_state=0 role=primary accept_traffic=1 overlay_id=0', '',
                    'proxyid_num=' + (p2 ? 1 : 0) + ' child_num=0 refcnt=4 ilast=2 olast=2 ad=/0', 'stat: rxp=' + (T.p2up ? 120 : 0) + ' txp=' + (T.p2up ? 118 : 0) + ' rxb=' + (T.p2up ? 15360 : 0) + ' txb=' + (T.p2up ? 9912 : 0),
                    'dpd: mode=' + (p1.dpd || 'on-demand') + ' on=' + (T.p1up ? 1 : 0) + ' idle=20000ms retry=3 count=0 seqno=0', 'natt: mode=none draft=0 interval=0 remote_port=0');
                if (p2) {
                    L.push('proxyid=' + T.p2 + ' proto=0 sa=' + (T.p2up ? 1 : 0) + ' ref=2 serial=1' + ((p2['auto-negotiate'] || 'disable') === 'enable' ? ' auto-negotiate' : ''), '  src: 0:' + rng(p2['src-subnet']) + ':0', '  dst: 0:' + rng(p2['dst-subnet']) + ':0');
                    if (T.p2up) L.push('  SA:  ref=3 options=18227 type=00 soft=0 mtu=1438 expire=42887/0B replaywin=2048', '       seqno=77 esn=0 replaywin_lastseq=00000078 qat=0 rekey=0 hash_search_len=1', '  life: type=01 bytes=0/0 timeout=42901/43200',
                        '  dec: spi=8a1b2c3d esp=' + espName() + ' key=32 ' + fakeHash('dec' + n, 32), '  enc: spi=4d5e6f70 esp=' + espName() + ' key=32 ' + fakeHash('enc' + n, 32), '  dec:pkts/bytes=120/15360, enc:pkts/bytes=118/9912');
                }
            });
            return L.join('\n');
        }
        // IKE debug: her faz 1 için bir müzakere denemesinin özeti (neden satırları gerçek anahtar ifadelerle)
        function ikeDebug() {
            return p1s().filter(n => !S.ikeFilter || M().t['vpn ipsec phase1-interface'].v[n]['remote-gw'] === S.ikeFilter).map(n => {
                const T = tun(n), p1 = T.p1, me = ifIp(p1.interface), gw = p1['remote-gw'], v2 = (p1['ike-version'] || PEER.ike) === '2';
                const pre = 'ike 0:' + n + ':12: ', L = ['ike 0:' + n + ': ' + (v2 ? 'IKEv2' : 'IKEv1') + ' negotiation started (' + me + '->' + gw + ':500)'];
                const r = T.reason;
                if (r === 'nopath' || r === 'nopeer' || r === 'ikever') { L.push(pre + 'out ' + (v2 ? 'SA_INIT' : 'main mode') + ' request', pre + 'no response from peer, retransmit (1/3)', pre + 'no response from peer, retransmit (2/3)', 'ike 0:' + n + ': negotiation timeout, deleting'); return L.join('\n'); }
                L.push(pre + 'out ' + (v2 ? 'SA_INIT' : 'main mode') + ' request, proposals: ' + (p1.proposal || ['(varsayılan)']).join(' ') + ' dh ' + (p1.dhgrp || ['(varsayılan)']).join(' '));
                if (r === 'proposal') { L.push(pre + 'peer proposal: ' + PEER.proposal + ' dh ' + PEER.dh, pre + 'no SA proposal chosen', 'ike 0:' + n + ': negotiation failure'); return L.join('\n'); }
                L.push(pre + 'SA proposal chosen, matched proposal ' + PEER.proposal + ' dh ' + PEER.dh);
                if (r === 'psk') { L.push(pre + 'auth verify failed', pre + 'probable pre-shared secret mismatch', 'ike 0:' + n + ': negotiation failure'); return L.join('\n'); }
                L.push(pre + 'auth verify done', pre + 'established IKE SA ' + fakeHash(n, 16).toLowerCase() + '/' + fakeHash(gw, 16).toLowerCase());
                const p2n = T.p2 || '(yok)';
                if (r === 'nop2') { L.push(pre + 'no phase2 configured for this phase1'); return L.join('\n'); }
                if (r === 'p2proposal') { L.push('ike 0:' + n + ':' + p2n + ': peer proposal ' + PEER.p2proposal + (PEER.pfs === false ? ' pfs disable' : ' pfs dh ' + PEER.dh), 'ike 0:' + n + ':' + p2n + ': no SA proposal chosen'); return L.join('\n'); }
                if (r === 'selector') { L.push('ike 0:' + n + ':' + p2n + ': peer selectors: src ' + norm(PEER.local) + ' dst ' + norm(PEER.remote), 'ike 0:' + n + ':' + p2n + ': ' + (v2 ? 'TS_UNACCEPTABLE' : 'no matching phase2 found')); return L.join('\n'); }
                L.push('ike 0:' + n + ':' + p2n + ': added IPsec SA: SPIs=8a1b2c3d/4d5e6f70', 'ike 0:' + n + ':' + p2n + ': sending SNMP tunnel UP trap');
                return L.join('\n');
            }).join('\n');
        }
        // ── Kimlik doğrulama testi (lab.sim.radius / lab.sim.ldap: sanal sunucu)
        function authTest(kind, a, line) {
            const tb = M().t[kind === 'radius' ? 'user radius' : 'user ldap'], name = a[0] && a[0].t;
            if (!name || !tb.v[name]) return '# [Simülatör] "' + (name || '') + '" adlı ' + kind.toUpperCase() + ' sunucusu tanımlı değil (config user ' + kind + ').';
            const o = tb.v[name], sv = SIM[kind] || {}, args = a.slice(1).map(x => x.t);
            let method = 'ldap', user, pw;
            if (kind === 'radius') { if (args.length < 3 || !['pap', 'chap', 'mschap', 'mschap2'].includes(args[0])) return 'command parse error before \'' + (args[0] || '') + '\''; [method, user, pw] = args; }
            else { if (args.length < 2) return 'command parse error before \'\''; [user, pw] = args; }
            const reachOk = o.server === sv.ip && reach(sv.ip).ok;
            if (!reachOk) { log({ authtest: kind, result: 'timeout' }); return '# [Simülatör] ' + o.server + ' adresindeki sunucudan yanıt yok (adres ya da yol yanlış); gerçek cihazda test zaman aşımıyla biter.'; }
            let good = !!sv.users && sv.users[user] === pw;
            if (kind === 'radius') good = good && o.secret === sv.secret;
            else good = good && o.dn === sv.dn && ((o.type || 'simple') !== 'regular' || (o.username === (sv.bind || {}).user && o.password === (sv.bind || {}).pw));
            log({ authtest: kind, result: good ? 'ok' : 'fail', user });
            if (kind === 'radius') return good ? 'authenticate \'' + user + '\' against \'' + method + '\' succeeded, server=primary assigned_rad_session_id=1790336450 session_timeout=0 secs idle_timeout=0 secs!' + (sv.groups && sv.groups[user] ? '\nGroup membership(s) - ' + sv.groups[user] : '')
                : 'authenticate \'' + user + '\' against \'' + method + '\' failed, assigned_rad_session_id=1790336451 session_timeout=0 secs idle_timeout=0 secs!';
            return good ? 'authenticate \'' + user + '\' against \'' + name + '\' succeeded!' + (sv.groups && sv.groups[user] ? '\nGroup membership(s) - ' + sv.groups[user] : '') : 'authenticate \'' + user + '\' against \'' + name + '\' failed!';
        }
        function ntpStatus() {
            const n = M().t['system ntp'], custom = n.type === 'custom', ns = M().t['system ntp ntpserver'], srvs = custom ? ns.o.map(k => ns.v[k].server) : ['ntp1.fortiguard.com'];
            const ok = x => (SIM.ntp || []).includes(x) && (!isIp(x) || reach(x).ok), sync = (n.ntpsync || 'enable') === 'enable' && srvs.some(ok);
            log({ ntpst: sync });
            return ['synchronized: ' + (sync ? 'yes' : 'no') + ', ntpsync: ' + ((n.ntpsync || 'enable') === 'enable' ? 'enabled' : 'disabled') + ', server-mode: disabled', '']
                .concat(srvs.map((x, i) => 'ipv4 server(' + x + ') ' + x + ' -- ' + (ok(x) ? 'reachable' + (sync && i === srvs.findIndex(ok) ? ' selected' : '') : 'unreachable')), ['# [Simülatör] Sunucu satırları sadeleştirildi (gerçek çıktıda stratum/offset alanları da vardır).']).join('\n');
        }
        function logTest() {
            const sl = M().t['log syslogd setting'], dests = ['disk/bellek'].concat(sl.status === 'enable' && sl.server ? ['syslog ' + sl.server + ':' + (sl.port || 514) + '/' + (sl.mode || 'udp')] : []);
            log({ logtest: sl.status === 'enable' && sl.server ? sl.server : null });
            return '# [Simülatör] Örnek olay, trafik ve güvenlik logları üretildi → ' + dests.join(', ') + (sl.status === 'enable' && sl.server && !reach(isIp(sl.server) ? sl.server : '0.0.0.0').ok ? '\n# [Simülatör] Uyarı: syslog sunucusuna yol yok; iletiler cihazdan çıkamaz.' : '');
        }
        // ── DHCP kiraları (lab.sim.dhcp: [{ mac, intf, host }])
        function dhcpLeases() {
            const out = [], used = {}, T = M().t['system dhcp server'];
            (SIM.dhcp || []).forEach(c => {
                const sk = T.o.find(k => T.v[k].interface === c.intf && (T.v[k].status || 'enable') === 'enable'), o = sk && T.v[sk], I = M().t['system interface'].v[c.intf];
                if (!o || !I || !I.ip || !ifUp(c.intf)) return out.push(Object.assign({}, c, { reason: 'nosrv' }));
                const [iip, im] = I.ip.split(' '), len = maskLen(im), rg = o['_sub_ip-range'];
                let ip = null;
                for (const rk of (rg ? rg.o : [])) {
                    const r = rg.v[rk]; if (!sameNet(r['start-ip'], iip, len) || !sameNet(r['end-ip'], iip, len)) continue;
                    for (let n = ip2n(r['start-ip']); n <= ip2n(r['end-ip']); n++) { const x = n2ip(n); if (x !== iip && !used[x]) { ip = x; break; } }
                    if (ip) break;
                }
                if (!ip) return out.push(Object.assign({}, c, { reason: rg && rg.o.length ? 'range' : 'norange' }));
                used[ip] = true; out.push(Object.assign({}, c, { ip, server: sk, gw: o['default-gateway'] || null, mask: o.netmask }));
            });
            return out;
        }
        function leaseList() {
            const L = [], ls = dhcpLeases().filter(x => x.ip);
            [...new Set(ls.map(x => x.intf))].forEach(n => { L.push(n, '  IP                MAC-Address         Hostname            SERVER-ID  Expiry');
                ls.filter(x => x.intf === n).forEach(x => L.push('  ' + pad(x.ip, 18) + pad(x.mac.toLowerCase(), 20) + pad(x.host || '', 20) + pad(x.server, 11) + 'Fri Oct  2 10:12:44 2026')); });
            log({ leaselist: ls.length });
            return L.join('\n');
        }
        // ── M4/M5: log görüntüleme. Kaynak: CLI Ref 7.4.8 "execute log" (209945028); kategori numaraları ve
        // "N logs found / N logs returned" biçimi Fortinet topluluk belgesi "Displaying logs via FortiGate's CLI".
        // Loglar akışlardan (lab.sim.flows) üretilir; alanlar sadeleştirilmiştir.
        const LOGCAT = { 0: 'traffic', 1: 'event', 2: 'utm-virus', 3: 'utm-webfilter', 4: 'utm-ips', 5: 'utm-emailfilter', 7: 'utm-anomaly', 8: 'utm-voip', 9: 'utm-dlp', 10: 'utm-app-ctrl', 12: 'utm-waf', 15: 'utm-dns', 16: 'utm-ssh', 17: 'utm-ssl', 19: 'utm-file-filter', 20: 'utm-icap', 22: 'utm-sctp-filter' };
        S.logf = { cat: '0', fields: [] };
        const SVCNAME = f => { const d = f.dport; const k = Object.keys(SVC).find(n => SVC[n].some(([pr, pt]) => pr === f.proto && pt === d)); return k || (f.proto === 'icmp' ? 'PING' : f.proto + '/' + d); };
        function genLogs() {
            const L = { 0: [], 1: [], 3: [], 4: [], 10: [], 15: [] }, pn = { tcp: 6, udp: 17, icmp: 1 };
            const implicitLog = (M().t['log setting']['fwpolicy-implicit-log'] || 'disable') === 'enable';
            flows().forEach((f, i) => {
                const d = decide(f); if (d.stage === 'noarrive' || d.stage === 'noroute' || d.stage === 'blackhole') return;
                const t = 'date=2026-09-26 time=10:' + String(10 + i).padStart(2, '0') + ':' + String((i * 7) % 60).padStart(2, '0') + ' eventtime=17588' + String(70000 + i * 37) + '000000000 tz="+0300"';
                const base = 'srcip=' + f.src + ' srcport=' + f.sport + ' srcintf="' + f.in + '" dstip=' + d.dst + ' dstport=' + d.dport + ' dstintf="' + (d.out || '') + '"';
                const pol = d.policy === 'intrazone' ? null : M().t['firewall policy'].v[d.policy];
                const lt = pol ? (pol.logtraffic || 'utm') : null, utm = d.utm, uev = utm ? utm.events.filter(e => e.action !== 'pass') : [];
                let tlog = false;
                if (d.policy === '0') tlog = implicitLog;
                else if (pol && d.stage === 'denied') tlog = lt === 'all';
                else if (pol) tlog = lt === 'all' || (lt === 'utm' && uev.length > 0);
                const blocked = utm && utm.blocked;
                if (tlog) L[0].push(t + ' logid="0000000013" type="traffic" subtype="forward" level="' + (d.stage === 'denied' || blocked ? 'warning' : 'notice') + '" vd="root" ' + base + ' sessionid=' + (3190297 + i) + ' proto=' + pn[f.proto] + ' action="' + (d.stage === 'denied' ? 'deny' : 'accept') + '" policyid=' + (d.policy === 'intrazone' ? 0 : d.policy) + ' policytype="policy" service="' + SVCNAME(f) + '"' + (d.snat ? ' trandisp="snat" transip=' + d.snat + ' transport=' + d.sport2 : ' trandisp="noop"') + (d.stage === 'denied' ? ' sentbyte=0 rcvdbyte=0' : ' duration=' + (12 + i) + ' sentbyte=' + (1843 + i) + ' rcvdbyte=' + (5230 + i)) + (uev.length ? ' utmaction="' + (blocked ? 'block' : 'allow') + '"' : ''));
                uev.forEach(e => {
                    if (e.log === false) return;
                    const act = e.action === 'block' ? 'blocked' : 'passthrough';
                    if (e.kind === 'web') L[3].push(t + ' type="utm" subtype="webfilter" eventtype="' + (e.how === 'ftgd' ? (e.action === 'block' ? 'ftgd_blk' : 'ftgd_allow') : 'urlfilter') + '" level="' + (e.action === 'block' ? 'warning' : 'notice') + '" vd="root" policyid=' + d.policy + ' ' + base + ' service="' + (+d.dport === 443 ? 'HTTPS' : 'HTTP') + '" hostname="' + e.host + '" action="' + act + '" url="' + (+d.dport === 443 ? 'https://' : 'http://') + e.url + '"' + (e.cat !== undefined ? ' cat=' + e.cat : '') + ' profile="' + pol['webfilter-profile'] + '"');
                    if (e.kind === 'ips') L[4].push(t + ' type="utm" subtype="ips" eventtype="signature" level="alert" vd="root" severity="' + e.attack.severity + '" ' + base + ' policyid=' + d.policy + ' action="' + (e.action === 'block' ? (e.reset ? 'reset' : 'dropped') : 'detected') + '" attack="' + e.attack.name + '"' + (e.attack.id ? ' attackid=' + e.attack.id : '') + ' profile="' + e.sensor + '"');
                    if (e.kind === 'app') L[10].push(t + ' type="utm" subtype="app-ctrl" eventtype="signature" level="warning" vd="root" appcat="' + (e.app.catName || e.app.cat) + '" app="' + e.app.name + '"' + (e.app.id ? ' appid=' + e.app.id : '') + ' ' + base + ' policyid=' + d.policy + ' action="' + (e.reset ? 'reset' : 'block') + '" applist="' + e.list + '"');
                    if (e.kind === 'dns') L[15].push(t + ' type="utm" subtype="dns" eventtype="dns-response" level="' + (e.action === 'block' ? 'warning' : 'notice') + '" vd="root" policyid=' + d.policy + ' ' + base + ' qname="' + e.qname + '" action="' + (e.action === 'block' ? 'block' : 'pass') + '"' + (e.cat !== undefined ? ' cat=' + e.cat : '') + ' profile="' + pol['dnsfilter-profile'] + '"');
                });
            });
            L[1].push('date=2026-09-26 time=09:58:12 eventtime=1758869892000000000 tz="+0300" logid="0100032001" type="event" subtype="system" level="information" vd="root" logdesc="Admin login successful" user="admin" ui="ssh(203.0.113.50)" action="login" status="success"');
            (SIM.eventLogs || []).forEach(x => L[1].push(x));
            return L;
        }
        function logFilterCmd(t, line) {
            const w = t.slice(3).map(x => x.t);
            const sub = t[3] ? pick(t[3].t, ['category', 'field', 'reset', 'dump']) : { err: 1 };
            if (!sub.ok) { log({ raw: line, err: t[3] ? 'invalid' : 'incomplete' }); return perr(t[3] || null); }
            if (sub.ok === 'category') {
                if (!w[1]) { log({ raw: line, canon: 'execute log filter category' }); return 'Available categories:\n' + Object.entries(LOGCAT).map(([k, v]) => ' ' + k + ': ' + v).join('\n'); }
                const k = /^\d+$/.test(w[1]) ? w[1] : Object.keys(LOGCAT).find(n => LOGCAT[n] === w[1].toLowerCase());
                if (k === undefined || !LOGCAT[k]) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + w[1] + '\''; }
                S.logf.cat = k; log({ raw: line, canon: 'execute log filter category ' + k, logcat: LOGCAT[k] }); return '';
            }
            if (sub.ok === 'field') {
                if (!w[1] || !w[2]) { log({ raw: line, err: 'incomplete' }); return 'command parse error before \'' + (w[1] || '') + '\''; }
                S.logf.fields = S.logf.fields.filter(x => x.name !== w[1]).concat([{ name: w[1], vals: w.slice(2).filter(x => x !== 'not'), not: w.includes('not') }]);
                log({ raw: line, canon: 'execute log filter field ' + w.slice(1).join(' '), logfield: w[1] }); return '';
            }
            if (sub.ok === 'reset') { S.logf = { cat: S.logf.cat, fields: w[1] && w[1] !== 'all' ? S.logf.fields.filter(x => x.name !== w[1]) : [] }; log({ raw: line, canon: 'execute log filter reset' + (w[1] ? ' ' + w[1] : '') }); return ''; }
            log({ raw: line, canon: 'execute log filter dump' });
            return 'category: ' + S.logf.cat + ' (' + LOGCAT[S.logf.cat] + ')\n' + (S.logf.fields.length ? S.logf.fields.map(x => 'field: ' + x.name + (x.not ? ' not ' : ' ') + x.vals.join(' ')).join('\n') : 'field: (yok)');
        }
        function logDisplay() {
            const all = genLogs(), rows = (all[S.logf.cat] || []).filter(l => S.logf.fields.every(fl => {
                const m = l.match(new RegExp('(?:^| )' + fl.name.replace(/[-]/g, '\\-') + '=("[^"]*"|\\S+)'));
                const v = m ? m[1].replace(/^"|"$/g, '') : null;
                const hit = v !== null && fl.vals.some(x => { const r = x.split('-'); return /^\d+$/.test(r[0]) && r.length === 2 && /^\d+$/.test(v) ? (+v >= +r[0] && +v <= +r[1]) : v === x; });
                return fl.not ? !hit : hit;
            })).reverse();
            log({ raw: 'execute log display', canon: 'execute log display', logshown: { cat: LOGCAT[S.logf.cat], n: rows.length, fields: S.logf.fields.map(x => x.name) } });
            return rows.length + ' logs found.\n' + rows.length + ' logs returned.\n' + rows.map((l, i) => '\n' + (i + 1) + ': ' + l).join('\n') + '\n# [Simülatör] Log alanları sadeleştirildi; UTM satırlarında logid gösterilmez.';
        }
        // ── Yedekleme / geri yükleme / revizyonlar
        S.tftp = {}; S.revs = [];
        const snap = () => JSON.parse(JSON.stringify(M()));
        function backupCmd(t, line) {
            const w = t.slice(2).map(x => x.t);
            if (w[0] !== 'config') { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); }
            if (w[1] === 'tftp') {
                if (!w[2] || !w[3] || !isIp(w[3])) { log({ raw: line, err: 'value' }); return 'command parse error before \'' + (w[3] || '') + '\''; }
                const ok = reach(w[3]).ok && ((lab.hosts || []).includes(w[3]));
                if (ok) S.tftp[w[2]] = snap();
                log({ raw: line, canon: 'execute backup config tftp ' + w[2] + ' ' + w[3], backup: ok ? 'tftp' : 'fail' });
                return 'Please wait...\n\nConnect to tftp server ' + w[3] + ' ...\n' + (ok ? '#\nSend config file to tftp server OK.' : '# [Simülatör] TFTP sunucusuna ulaşılamadı: yedek alınamadı.');
            }
            if (w[1] === 'flash') {
                const cmt = w.slice(2).join(' ').replace(/^"|"$/g, '');
                S.revs.push({ id: S.revs.length + 1, time: '2026-09-25 10:' + String(12 + S.revs.length).padStart(2, '0') + ':03', comment: cmt, m: snap() });
                log({ raw: line, canon: 'execute backup config flash', backup: 'flash' });
                return 'Please wait...\n\nConfig file backup to flash OK.';
            }
            log({ raw: line, err: 'invalid' }); return perr(t[3] || null);
        }
        function restoreCmd(t, line) {
            const w = t.slice(2).map(x => x.t);
            if (w[0] !== 'config' || !['tftp', 'flash'].includes(w[1])) { log({ raw: line, err: 'invalid' }); return perr(t[3] || t[2] || null); }
            const src = w[1] === 'tftp' ? (isIp(w[3] || '') && reach(w[3]).ok && S.tftp[w[2]]) : (S.revs.find(r => String(r.id) === w[2]) || {}).m;
            if (!src) { log({ raw: line, err: 'value' }); return w[1] === 'tftp' ? 'Please wait...\n\nConnect to tftp server ' + (w[3] || '') + ' ...\n# [Simülatör] Dosya bulunamadı ya da sunucuya ulaşılamadı.' : 'Invalid revision id.'; }
            log({ raw: line, canon: 'execute restore config ' + w[1] });
            S.pending = { prompt: 'This operation will overwrite the current setting and could possibly reboot the system!\nDo you want to continue? (y/n)', fn: x => {
                if (!/^y/i.test(x)) return '';
                S.m = JSON.parse(JSON.stringify(src)); S.ctx = null; log({ restored: w[1] });
                return 'Please wait...\n\nGet config file OK.\nFile check OK.\n# [Simülatör] Cihaz yeniden başladı; geri yüklenen yapılandırma etkin.';
            } };
            return '';
        }
        function revList() {
            log({ revlist: S.revs.length });
            return ['ID  TIME                ADMIN   FIRMWARE VERSION                      COMMENT'].concat(S.revs.map(r => pad(r.id, 4) + pad(r.time, 20) + pad('admin', 8) + pad('v' + FOS + ' (eğitim simülatörü)', 38) + r.comment)).join('\n');
        }
        function diagCmd(t, line) {
            let node = DIAG, i = 1, words = ['diagnose'];
            while (node && typeof node === 'object') {
                if (!t[i]) { log({ raw: line, err: 'incomplete' }); return 'command parse error before \'\''; }
                const r = pick(t[i].t, Object.keys(node));
                if (!r.ok) { log({ raw: line, err: 'invalid' }); return perr(t[i]); }
                words.push(r.ok); node = node[r.ok]; i++;
            }
            const a = t.slice(i), canon = words.join(' ') + (a.length ? ' ' + a.map(x => x.t).join(' ') : '');
            const ok = (o) => { log({ raw: line, canon }); return o; };
            switch (node) {
                case 'top': return ok(sysTop(a[1] ? +a[1].t : 20));
                case 'sstat': return ok(sessStat());
                case 'slist': return ok(sessList());
                case 'sfilter': {
                    if (!a.length) return ok(Object.keys(S.sessFilter).length ? Object.entries(S.sessFilter).map(([k, v]) => k + ': ' + v).join('\n') : 'session filter:\n        vf: any');
                    const k = pick(a[0].t, ['src', 'dst', 'sport', 'dport', 'proto', 'policy', 'clear']);
                    if (!k.ok) { log({ raw: line, err: 'invalid' }); return perr(a[0]); }
                    if (k.ok === 'clear') { S.sessFilter = {}; return ok(''); }
                    if (!a[1] || ((k.ok === 'src' || k.ok === 'dst') && !isIp(a[1].t)) || (k.ok !== 'src' && k.ok !== 'dst' && !/^\d+$/.test(a[1].t))) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (a[1] ? a[1].t : '') + '\''; }
                    S.sessFilter[k.ok] = a[1].t; return ok('');
                }
                case 'sclear': {
                    if (!Object.keys(S.sessFilter).length) { log({ raw: line, canon, warn: 'sclear-all' }); return '# [Simülatör] UYARI: filtre yokken bu komut TÜM oturumları siler (tüm kullanıcılar kopar). Simülatörde engellendi; önce "diagnose sys session filter …".'; }
                    log({ raw: line, canon, cleared: Object.assign({}, S.sessFilter) });
                    return '';
                }
                case 'tradius': return ok(authTest('radius', a, line));
                case 'tldap': return ok(authTest('ldap', a, line));
                case 'ntpst': return ok(ntpStatus());
                case 'logtest': return ok(logTest());
                case 'iplookup': {
                    // diagnose firewall iprope lookup <src> <sport> <dst> <dport> <proto> <srcintf>
                    const v = a.map(x => x.t);
                    if (v.length < 6 || !isIp(v[0]) || !isIp(v[2]) || !/^\d+$/.test(v[1]) || !/^\d+$/.test(v[3]) || !['tcp', 'udp', 'icmp'].includes(v[4].toLowerCase()) || !M().t['system interface'].v[v[5]]) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (v.find((x, k) => (k === 0 || k === 2) ? !isIp(x) : false) || v[v.length - 1] || '') + '\''; }
                    const d = decide({ src: v[0], sport: +v[1], dst: v[2], dport: +v[3], proto: v[4].toLowerCase(), in: v[5], reply: 'ok', arrives: true });
                    log({ raw: line, canon, lookup: d.policy });
                    if (d.stage === 'noroute' || d.stage === 'noarrive') return '# [Simülatör] Hedefe rota yok ya da giriş arayüzü kapalı: kural araması yapılmadı.';
                    return '<src [' + v[0] + '-' + v[1] + '] dst [' + v[2] + '-' + v[3] + '] proto ' + v[4].toLowerCase() + ' dev ' + v[5] + '> matches policy id: ' + (d.policy === 'intrazone' ? '0 (intrazone)' : d.policy);
                }
                case 'mem': return ok(memInfo());
                case 'conserve': return ok(conserve());
                case 'crash': return ok(crashlog());
                case 'cfgerr': return ok(cfgErrLog());
                case 'dreset': S.dbg = { on: false, filter: {}, fn: false, trace: 0, tid: S.dbg.tid, apps: {} }; return ok('');
                case 'denable': { S.dbg.on = true; log({ raw: line, canon }); const o = [runTrace(), S.dbg.apps.ike ? ikeOut() : '', S.dbg.apps.sslvpn && typeof sslDebug === 'function' ? sslDebug() : ''].filter(Boolean); return o.join('\n'); }
                case 'ddisable': S.dbg.on = false; return ok('');
                case 'dts': return ok('');
                case 'dinfo': return ok('debug output:           ' + (S.dbg.on ? 'enable' : 'disable') + '\nconsole timestamp:      disable\nconsole no user log message:    disable\n' + (S.dbg.trace > 0 ? 'debug flow trace: ' + S.dbg.trace + ' packet(s) remaining' : ''));
                case 'ffilter': {
                    if (!a.length) return ok(Object.keys(S.dbg.filter).length ? Object.entries(S.dbg.filter).map(([k, v]) => k + ': ' + v).join('\n') : 'vf: any\nproto: any\nHost addr: any\nport: any');
                    const k = pick(a[0].t, ['addr', 'saddr', 'daddr', 'port', 'dport', 'sport', 'proto', 'clear']);
                    if (!k.ok) { log({ raw: line, err: 'invalid' }); return perr(a[0]); }
                    if (k.ok === 'clear') { S.dbg.filter = {}; return ok(''); }
                    if (!a[1] || (/addr/.test(k.ok) && !isIp(a[1].t)) || (!/addr/.test(k.ok) && !/^\d+$/.test(a[1].t))) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (a[1] ? a[1].t : '') + '\''; }
                    S.dbg.filter[k.ok] = a[1].t; return ok('');
                }
                case 'ffn': { const v = a[0] && pick(a[0].t, ['enable', 'disable']); if (!v || !v.ok) { log({ raw: line, err: 'invalid' }); return perr(a[0] || null); } S.dbg.fn = v.ok === 'enable'; return ok(''); }
                case 'tstart': { const n = a[0] && /^\d+$/.test(a[0].t) ? +a[0].t : 0; if (!n) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (a[0] ? a[0].t : '') + '\''; } S.dbg.trace = n; log({ raw: line, canon }); return runTrace(); }
                case 'tstop': S.dbg.trace = 0; return ok('');
                case 'arplist': return ok(arpTable(true));
                case 'ssllist': return ok(sslMonitor().split('\n').slice(sslMonitor().split('\n').indexOf('SSL-VPN sessions:')).join('\n'));
                case 'hacsum': return ok(haChecksum());
                case 'hahist': return ok(haHistory());
                case 'ikegw': { const nm = a[0] && 'name'.startsWith(a[0].t) && a[1] ? a[1].t : null; if (nm && !M().t['vpn ipsec phase1-interface'].v[nm]) { log({ raw: line, err: 'invalid' }); return perr(a[1]); } return ok(ikeGw(nm)); }
                case 'tunlist': { const nm = a[0] && 'name'.startsWith(a[0].t) && a[1] ? a[1].t : null; if (nm && !M().t['vpn ipsec phase1-interface'].v[nm]) { log({ raw: line, err: 'invalid' }); return perr(a[1]); } return ok(tunList(nm)); }
                case 'ikelf2': {
                    if (a[0] && a[0].t === 'clear') { S.ikeFilter = null; return ok(''); }
                    if (a[0] && /^rem-addr4$/.test(a[0].t) && a[1] && isIp(a[1].t)) { S.ikeFilter = a[1].t; return ok(''); }
                    if (!a.length) return ok('vd: any\nname: any\ninterface: any\nIPv4 rem-addr: ' + (S.ikeFilter || 'any'));
                    log({ raw: line, err: 'invalid' }); return perr(a[0]);
                }
                case 'ikelf': {
                    // 7.2 ve öncesi sözdizimi; bu lab 7.4 görünümünde
                    log({ raw: line, err: 'unsupported' });
                    return '# [Simülatör] "log-filter" FortiOS 7.2 ve öncesi sözdizimidir. 7.4.1 ve sonrası: diagnose vpn ike log filter rem-addr4 <karşı uç IP> (temizlemek: diagnose vpn ike log filter clear).';
                }
                case 'appike': case 'appssl': {
                    const lv = a[0] ? a[0].t : null;
                    if (lv === null || !/^-?\d+$/.test(lv)) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (lv || '') + '\''; }
                    S.dbg.apps[node === 'appike' ? 'ike' : 'sslvpn'] = +lv !== 0;
                    log({ raw: line, canon });
                    return S.dbg.on && +lv !== 0 ? (node === 'appike' ? ikeOut() : sslDebug()) : '';
                }
                case 'sniff': { const r = sniffer(a, line); if (r && r.err) { log({ raw: line, err: 'invalid' }); return r.err; } return r; }
            }
            return '';
        }

        // ── bağlam
        const ctxName = () => {
            const c = S.ctx;
            if (!c) return '';
            if (c.key !== undefined) return c.key;
            return c.path.split(' ').slice(-1)[0];
        };
        function prompt() {
            if (S.pending) return S.pending.prompt;
            if (S.loggedOut) return '';
            if (S.ha && S.ha.onPeer) return HAP.host + ' # ';
            return host() + (S.ctx ? ' (' + ctxName() + ')' : '') + ' # ';
        }
        // Kısaltma: benzersiz önek
        function pick(word, list) {
            const w = word.toLowerCase();
            if (list.includes(w)) return { ok: w };
            const h = list.filter(x => x.startsWith(w));
            if (h.length === 1) return { ok: h[0] };
            return { err: h.length ? 'amb' : 'none' };
        }
        // "firewall policy" gibi yolu kelime kelime çöz
        function resolvePath(toks, i) {
            let cands = PATHS.map(p => p.split(' ')), depth = 0, words = [];
            while (i + depth < toks.length) {
                const pos = depth;
                const opts = [...new Set(cands.filter(c => c.length > pos).map(c => c[pos]))];
                if (!opts.length) break;
                const r = pick(toks[i + depth].t, opts);
                if (!r.ok) return { err: toks[i + depth] };
                words.push(r.ok); cands = cands.filter(c => c[pos] === r.ok); depth++;
                const full = cands.find(c => c.length === depth);
                if (full && cands.every(c => c.length === depth)) return { path: words.join(' '), n: depth };
            }
            const full = cands.find(c => c.length === depth);
            if (full && depth) return { path: words.join(' '), n: depth };
            return { err: toks[i + depth] || null, incomplete: true };
        }
        const perr = t => 'command parse error before \'' + (t ? t.t : '') + '\'';

        // ── komutlar
        function input(raw) {
            raw = String(raw).replace(/\r/g, '');
            if (S.pending) { const p = S.pending; S.pending = null; log({ raw: p.secret ? '***' : raw, prompt: true }); return p.fn(raw.trim()); }
            if (S.loggedOut) { S.loggedOut = false; return lab.loginBanner || ''; }
            if (S.ha && S.ha.onPeer) {
                const l = raw.trim(); if (!l) return '';
                const tt = tok(l), v0 = pick(tt[0].t, ['get', 'exit', 'show', 'diagnose', 'config', 'execute']);
                if (v0.ok === 'exit') { S.ha.onPeer = false; log({ raw: l, canon: 'ha peer exit' }); return '\n# [Simülatör] ' + MY_SN + ' üyesine geri döndünüz.'; }
                const rest = tt.slice(1).map(x => x.t.toLowerCase()).join(' ');
                if (v0.ok === 'get' && 'system status'.startsWith(rest) && rest.length > 6) { log({ raw: l, canon: 'peer get system status' }); return sysStatus().replace(MY_SN, HAP.sn).replace('Hostname: ' + host(), 'Hostname: ' + HAP.host).replace('Current HA mode: standalone', 'Current HA mode: a-p, ' + (haElect().meP ? 'secondary' : 'primary')); }
                if (v0.ok === 'get' && /^sys\S* ha\S* st/.test(rest)) { log({ raw: l, canon: 'peer get system ha status' }); return haStatus(true); }
                log({ raw: l, err: 'unsupported' }); return '# [Simülatör] Diğer üyede yalnız get system status, get system ha status ve exit desteklenir.';
            }
            const line = raw.trim();
            if (!line) return '';
            if (line === '\x1a') return '';
            S.hist.push(line);
            const t = tok(line);
            const c = S.ctx;
            if (!c) return rootCmd(t, line);
            if (c.key !== undefined || c.single) return editCmd(t, line);
            return tableCmd(t, line);
        }
        function rootCmd(t, line) {
            const v = pick(t[0].t, ['config', 'show', 'get', 'execute', 'diagnose', 'exit']);
            if (!v.ok) { log({ raw: line, err: 'unknown' }); return 'Unknown action 0'; }
            if (v.ok === 'config') {
                if (t.length < 2) { log({ raw: line, err: 'incomplete' }); return perr(null); }
                const r = resolvePath(t, 1);
                if (r.err !== undefined || r.incomplete) { log({ raw: line, err: 'invalid' }); return r.err ? perr(r.err) : perr(null); }
                if (1 + r.n < t.length) { log({ raw: line, err: 'invalid' }); return perr(t[1 + r.n]); }
                S.ctx = { path: r.path, single: !!SCHEMA[r.path].single };
                if (S.ctx.single) S.ctx.draft = JSON.parse(JSON.stringify(M().t[r.path]));
                log({ raw: line, canon: 'config ' + r.path });
                return '';
            }
            if (v.ok === 'show') {
                let i = 1, full = false;
                if (t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase()) && t[1].t.length > 1) { full = true; i = 2; }
                if (i >= t.length) { log({ raw: line, canon: 'show' + (full ? ' full-configuration' : '') }); return PATHS.filter(p => !NEWP.has(p) || (SCHEMA[p].single ? Object.keys(M().t[p]).length : M().t[p].o.length)).map(p => showPath(p, undefined, full)).join('\n'); }
                const r = resolvePath(t, i);
                if (r.err !== undefined || r.incomplete) { log({ raw: line, err: 'invalid' }); return perr(r.err); }
                let key;
                if (i + r.n < t.length) {
                    key = t[i + r.n].t;
                    if (SCHEMA[r.path].single || !M().t[r.path].v[key]) { log({ raw: line, err: 'invalid' }); return perr(t[i + r.n]); }
                }
                log({ raw: line, canon: 'show ' + (full ? 'full-configuration ' : '') + r.path + (key !== undefined ? ' ' + key : '') });
                return showPath(r.path, key, full);
            }
            if (v.ok === 'get') {
                const rest = t.slice(1).map(x => x.t.toLowerCase());
                // get router info routing-table details [<ip>]
                if (rest.length === 5 && ['router', 'info', 'routing-table', 'details'].every((w, k) => w.startsWith(rest[k])) && rest[3].length > 1) {
                    if (!isIp(rest[4])) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + t[5].t + '\''; }
                    log({ raw: line, canon: 'get router info routing-table details ' + rest[4] });
                    return showRibDetails(rest[4]);
                }
                for (const g of GETS) {
                    const gw = g.split(' ');
                    if (rest.length === gw.length && gw.every((w, k) => w.startsWith(rest[k]))) {
                        log({ raw: line, canon: 'get ' + g });
                        if (g === 'vpn ipsec tunnel summary') return tunSummary();
                        if (g === 'system arp') return arpTable(false);
                        if (g === 'vpn ssl monitor') return sslMonitor();
                        if (g === 'system ha status') return haStatus();
                        if (g === 'router info routing-table database') return showRibDb();
                        if (g === 'router info routing-table details') return rib().map(r => showRibDetails(r.net)).join('\n');
                        return g === 'system status' ? sysStatus() : g === 'system performance status' ? perfStatus() : g === 'system session status' ? 'The total number of sessions for the current VDOM: ' + sessTotal() : g === 'system session list' ? sessTable() : showRib();
                    }
                }
                const partial = GETS.filter(g => { const gw = g.split(' '); return rest.length < gw.length && rest.every((w, k) => gw[k].startsWith(w)); });
                if (partial.length && rest.length) { log({ raw: line, err: 'incomplete' }); return '# [Simülatör] Komut eksik. Devamı: ' + partial.map(g => 'get ' + g).join(', ') + '  (? ile görün)'; }
                const r = resolvePath(t, 1);
                if (r.path && 1 + r.n === t.length) {
                    log({ raw: line, canon: 'get ' + r.path });
                    const sc = SCHEMA[r.path], tb = M().t[r.path];
                    return sc.single ? getObj(r.path, tb) : tb.o.map(k => '== [ ' + k + ' ]\n' + sc.key + ': ' + k).join('\n');
                }
                log({ raw: line, err: 'invalid' });
                return perr(t[1] || null);
            }
            if (v.ok === 'execute') {
                const ex = t[1] ? pick(t[1].t, ['ping', 'ping-options', 'traceroute', 'telnet', 'ha', 'backup', 'restore', 'revision', 'dhcp', 'log']) : { err: 'none' };
                if (!ex.ok) { log({ raw: line, err: t[1] ? 'unsupported' : 'incomplete' }); return t[1] ? '# [Simülatör] Bu sürümde execute ping, ping-options, traceroute, telnet, ha, backup, restore, revision, dhcp ve log destekleniyor.' : perr(null); }
                if (ex.ok === 'log') {
                    const l2 = t[2] ? pick(t[2].t, ['filter', 'display']) : { err: 1 };
                    if (!l2.ok) { log({ raw: line, err: t[2] ? 'unsupported' : 'incomplete' }); return t[2] ? '# [Simülatör] execute log altında yalnız filter ve display destekleniyor.' : perr(null); }
                    if (l2.ok === 'display') { if (t[3]) { log({ raw: line, err: 'invalid' }); return perr(t[3]); } return logDisplay(); }
                    return logFilterCmd(t, line);
                }
                if (ex.ok === 'backup') return backupCmd(t, line);
                if (ex.ok === 'restore') return restoreCmd(t, line);
                if (ex.ok === 'revision') { if (!t[2] || t[2].t !== 'list' || !t[3] || t[3].t !== 'config') { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); } log({ raw: line, canon: 'execute revision list config' }); return revList(); }
                if (ex.ok === 'dhcp') { if (!t[2] || !'lease-list'.startsWith(t[2].t) || t[2].t.length < 2) { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); } log({ raw: line, canon: 'execute dhcp lease-list' }); return leaseList(); }
                if (ex.ok === 'ping' || ex.ok === 'traceroute') {
                    if (!t[2] || !isIp(t[2].t) || t.length > 3) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (t[2] ? t[2].t : '') + '\''; }
                    log({ raw: line, canon: 'execute ' + ex.ok + ' ' + t[2].t });
                    return ex.ok === 'ping' ? ping(t[2].t) : traceroute(t[2].t);
                }
                if (ex.ok === 'telnet') {
                    if (!t[2] || !isIp(t[2].t) || (t[3] && !/^\d+$/.test(t[3].t))) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + ((t[3] || t[2] || {}).t || '') + '\''; }
                    const port = t[3] ? +t[3].t : 23;
                    log({ raw: line, canon: 'execute telnet ' + t[2].t + ' ' + port });
                    return telnet(t[2].t, port);
                }
                if (ex.ok === 'ping-options') {
                    const o = t[2] ? pick(t[2].t, ['source', 'repeat-count', 'reset', 'view-settings']) : { err: 1 };
                    if (!o.ok) { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); }
                    if (o.ok === 'reset') { S.pingOpt = { source: null, count: 5 }; log({ raw: line, canon: 'execute ping-options reset' }); return ''; }
                    if (o.ok === 'view-settings') { log({ raw: line, canon: 'execute ping-options view-settings' }); return 'Ping Options:\n   Repeat Count: ' + S.pingOpt.count + '\n   Data Size: 56\n   Timeout: 2\n   TOS: 0\n   TTL: 64\n   Source Address: ' + (S.pingOpt.source || 'auto'); }
                    if (o.ok === 'source') {
                        if (!t[3] || !(isIp(t[3].t) || t[3].t === 'auto')) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (t[3] ? t[3].t : '') + '\''; }
                        if (t[3].t !== 'auto' && !M().t['system interface'].o.some(n => ifIp(n) === t[3].t)) { log({ raw: line, err: 'value' }); return 'invalid source address ' + t[3].t + ' (bu cihazın arayüz adreslerinden biri olmalı)'; }
                        S.pingOpt.source = t[3].t === 'auto' ? null : t[3].t; log({ raw: line, canon: 'execute ping-options source ' + t[3].t }); return '';
                    }
                    if (!t[3] || !/^\d+$/.test(t[3].t) || +t[3].t < 1 || +t[3].t > 2000) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + (t[3] ? t[3].t : '') + '\''; }
                    S.pingOpt.count = +t[3].t; log({ raw: line, canon: 'execute ping-options repeat-count ' + t[3].t }); return '';
                }
                if (ex.ok === 'ha') return haExec(t, line);
            }
            if (v.ok === 'diagnose') return diagCmd(t, line);
            if (v.ok === 'exit') { log({ raw: line, canon: 'exit' }); S.loggedOut = true; return '\n[Simülatör] Oturum kapatıldı. Yeniden bağlanmak için Enter.\n'; }
        }
        function tableCmd(t, line) {
            const c = S.ctx, sc = SCHEMA[c.path], tb = tbl(c);
            const verbs = ['edit', 'delete', 'show', 'get', 'end', 'abort'].concat(sc.move ? ['move'] : [], !sc.num && !sc.parent && !sc.fixed ? ['rename'] : []);
            const v = pick(t[0].t, verbs);
            if (!v.ok) { log({ raw: line, err: 'invalid' }); return perr(t[0]); }
            if (v.ok === 'end' || v.ok === 'abort') { S.ctx = c.parent || null; log({ raw: line, canon: v.ok, path: c.path }); return ''; }
            if (v.ok === 'show' || v.ok === 'get') {
                const full = t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase());
                log({ raw: line, canon: (v.ok === 'show' ? 'show ' + (full ? 'full-configuration ' : '') : 'get ') + c.path });
                return v.ok === 'show' ? showPath(c.path, undefined, full) : tb.o.map(k => '== [ ' + k + ' ]\n' + sc.key + ': ' + k).join('\n');
            }
            if (v.ok === 'edit') {
                if (t.length !== 2) { log({ raw: line, err: 'invalid' }); return perr(t[2] || null); }
                let k = t[1].t, msg = '';
                if (sc.num) {
                    if (!/^\d+$/.test(k) || +k > 4294967295) { log({ raw: line, err: 'invalid' }); return 'value parse error before \'' + k + '\''; }
                    if (k === '0') k = String(tb.o.reduce((a, x) => Math.max(a, +x), 0) + 1);
                } else if (!k.length || k.length > 79) { log({ raw: line, err: 'invalid' }); return 'value parse error before \'' + k + '\''; }
                if (!tb.v[k]) {
                    if (sc.fixed && c.path !== 'system interface') { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu lab\'da yalnız mevcut nesneler düzenlenebilir: ' + tb.o.join(', '); }
                    msg = 'new entry \'' + k + '\' added';
                }
                if (tb.v[k] && tb.v[k]._builtin) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] "' + k + '" hazır (predefined) bir nesnedir; değiştirmeyin.'; }
                S.ctx = { path: c.path, key: k, isNew: !tb.v[k], draft: JSON.parse(JSON.stringify(tb.v[k] || (c.path === 'system interface' ? { type: 'vlan' } : {}))), parent: c.parent };
                log({ raw: line, canon: 'edit ' + k, path: c.path });
                return msg;
            }
            if (v.ok === 'delete') {
                const k = t[1] && t[1].t;
                if (!k || !tb.v[k]) { log({ raw: line, err: 'invalid' }); return 'entry not found in datasource'; }
                if ((sc.fixed && tb.v[k].type !== 'vlan') || tb.v[k]._builtin) { log({ raw: line, err: 'unsupported' }); return '# [Simülatör] Bu nesne silinemez.'; }
                const users = usedBy(c.path, k);
                if (users.length) { log({ raw: line, err: 'inuse' }); return '# [Simülatör] "' + k + '" silinemez: kullanılıyor → ' + users.join(', ') + '\n# Önce o nesnelerden kaldırın (FortiOS kullanımdaki nesneyi silmez).'; }
                tb.o = tb.o.filter(x => x !== k); delete tb.v[k];
                log({ raw: line, canon: 'delete ' + k, path: c.path });
                return '';
            }
            if (v.ok === 'rename') {
                const [a, to, b] = [t[1], t[2], t[3]].map(x => x && x.t);
                if (!a || !tb.v[a] || tb.v[a]._builtin) { log({ raw: line, err: 'invalid' }); return perr(t[1] || null); }
                if (to !== 'to' || !b || t.length > 4) { log({ raw: line, err: 'invalid' }); return perr(t[2] && to !== 'to' ? t[2] : (t[3] || t[4] || null)); }
                if (b.length > 79) { log({ raw: line, err: 'value' }); return 'value parse error before \'' + b + '\''; }
                if (tb.v[b]) { log({ raw: line, err: 'value' }); return '# [Simülatör] "' + b + '" adlı kayıt zaten var; rename yapılmadı.'; }
                tb.o = tb.o.map(x => x === a ? b : x); tb.v[b] = tb.v[a]; delete tb.v[a];
                renameRefs(c.path, a, b);
                log({ raw: line, canon: 'rename ' + a + ' to ' + b, path: c.path });
                return '';
            }
            if (v.ok === 'move') {
                const [a, pos, b] = [t[1], t[2], t[3]].map(x => x && x.t);
                if (!a || !b || !tb.v[a] || !tb.v[b] || !['before', 'after'].some(w => w.startsWith((pos || '-').toLowerCase()))) { log({ raw: line, err: 'invalid' }); return perr(t[1] || null); }
                const where = 'before'.startsWith(pos.toLowerCase()) ? 'before' : 'after';
                tb.o = tb.o.filter(x => x !== a);
                tb.o.splice(tb.o.indexOf(b) + (where === 'after' ? 1 : 0), 0, a);
                log({ raw: line, canon: 'move ' + a + ' ' + where + ' ' + b, path: c.path });
                return '';
            }
        }
        // Tablo → onu gösteren datasource'lar (silme koruması ve rename için)
        const REFMAP = { 'firewall address': ['addr', 'addrVip', 'addrgrpMember'], 'firewall addrgrp': ['addr', 'addrVip', 'addrgrpMember'], 'firewall vip': ['addrVip'],
            'firewall service custom': ['svc', 'svcgrpMember'], 'firewall service group': ['svc', 'svcgrpMember'], 'firewall ippool': ['ippool'], 'vpn ipsec phase1-interface': ['p1', 'intf', 'intfAny'], 'user local': ['users'], 'user radius': ['users'], 'user ldap': ['users'], 'system interface': ['zoneMember'], 'system zone': ['intfAny'], 'user group': ['ugroups'], 'vpn ssl web portal': ['portal'],
            'webfilter urlfilter': ['urlTbl'], 'dnsfilter domain-filter': ['dnsTbl'], 'webfilter profile': ['wfProf'], 'dnsfilter profile': ['dnsProf'], 'ips sensor': ['ipsSens'], 'application list': ['appList'],
            'firewall ssl-ssh-profile': ['sslProf'], 'firewall schedule recurring': ['sched'] };
        // Tüm nesneleri (alt tablolar ve alt nesneler dahil) gez: fn(yol, etiket, nesne)
        function walkObjs(fn) {
            const inner = (p, label, o) => {
                fn(p, label, o);
                for (const sub of SCHEMA[p].children || []) {
                    const cp = childPath(p, sub), ct = o['_sub_' + sub];
                    if (!ct) continue;
                    if (SCHEMA[cp].single) inner(cp, label + ' ' + sub, ct);
                    else ct.o.forEach(x => inner(cp, label + ' ' + sub + ' ' + x, ct.v[x]));
                }
            };
            for (const q of PATHS) {
                const sc = SCHEMA[q];
                if (sc.single) { fn(q, q, M().t[q]); for (const sub of sc.children || []) { const cp = childPath(q, sub); M().t[cp].o.forEach(x => fn(cp, q + ' ' + sub + ' ' + x, M().t[cp].v[x])); } continue; }
                for (const key of M().t[q].o) inner(q, q + ' ' + key, M().t[q].v[key]);
            }
        }
        function usedBy(p, k) {
            const out = [], map = REFMAP[p] || [];
            walkObjs((q, label, o) => {
                for (const [an, a] of Object.entries(SCHEMA[q].attrs)) {
                    if (!map.includes(a.ds)) continue;
                    const v = o[an];
                    if (v === k || (Array.isArray(v) && v.includes(k))) out.push(label + ' (' + an + ')');
                }
            });
            return out;
        }
        // M7: rename <eski> to <yeni> — kayıt adını değiştirir, başvuruları taşır
        function renameRefs(p, a, b) {
            const map = REFMAP[p] || [];
            walkObjs((q, label, o) => {
                for (const [an, at] of Object.entries(SCHEMA[q].attrs)) {
                    if (!map.includes(at.ds)) continue;
                    if (o[an] === a) o[an] = b;
                    else if (Array.isArray(o[an]) && o[an].includes(a)) o[an] = o[an].map(x => x === a ? b : x);
                }
            });
        }
        function commit() {
            const c = S.ctx, sc = SCHEMA[c.path];
            if (c.single) { if (sc.parent) { c.parent.draft['_sub_' + sc.sub] = c.draft; return null; } M().t[c.path] = c.draft; return null; }
            const miss = (sc.req || []).filter(k => { const v = c.draft[k]; return v === undefined || (Array.isArray(v) && !v.length); });
            if (c.path === 'router static' && c.draft.blackhole !== 'enable' && !c.draft.device) miss.push('device');
            if (c.path === 'system interface' && c.draft.type === 'vlan') ['vdom', 'interface', 'vlanid'].forEach(k => { if (c.draft[k] === undefined && !miss.includes(k)) miss.push(k); });
            if (miss.length) return miss.map(k => 'node_check_object fail! for ' + k + '\nAttribute \'' + k + '\' MUST be set.').join('\n');
            if (c.path === 'firewall vip' && c.draft.portforward === 'enable' && !c.draft.extport) return 'node_check_object fail! for extport\nAttribute \'extport\' MUST be set.';
            const tb = tbl(c);
            if (!tb.v[c.key]) tb.o.push(c.key);
            tb.v[c.key] = c.draft;
            return null;
        }
        function editCmd(t, line) {
            const c = S.ctx, sc = SCHEMA[c.path];
            const verbs = ['set', 'unset', 'append', 'unselect', 'show', 'get', 'end', 'abort'].concat(c.single ? [] : ['next'], sc.children ? ['config'] : []);
            const v = pick(t[0].t, verbs);
            if (!v.ok) { log({ raw: line, err: 'invalid' }); return perr(t[0]); }
            if (v.ok === 'abort') { S.ctx = c.parent || null; log({ raw: line, canon: 'abort', path: c.path }); return ''; }
            if (v.ok === 'config') {
                const sub = t[1] && pick(t[1].t, sc.children);
                if (!sub || !sub.ok || t.length > 2) { log({ raw: line, err: 'invalid' }); return perr(t[1] || null); }
                const cp = childPath(c.path, sub.ok);
                S.ctx = SCHEMA[cp].single ? { path: cp, single: true, parent: c, draft: JSON.parse(JSON.stringify(c.draft['_sub_' + sub.ok] || {})) } : { path: cp, parent: c };
                log({ raw: line, canon: 'config ' + sub.ok, path: c.path });
                return '';
            }
            if (v.ok === 'next' || v.ok === 'end') {
                const e = commit();
                if (e) { log({ raw: line, err: 'required', path: c.path }); return e; }
                log({ raw: line, canon: v.ok, path: c.path, key: c.key });
                S.ctx = v.ok === 'next' && !c.single ? { path: c.path, parent: c.parent } : (c.parent || null);
                return '';
            }
            if (v.ok === 'show') {
                const full = t[1] && 'full-configuration'.startsWith(t[1].t.toLowerCase());
                log({ raw: line, canon: 'show ' + (full ? 'full-configuration ' : '') + c.path + (c.key !== undefined ? ' ' + c.key : '') });
                if (c.single) return ['config ' + c.path].concat(objLines(c.path, c.draft, full, '    '), ['end']).join('\n');
                return ['config ' + c.path, '    edit ' + (sc.num ? c.key : qt(c.key))].concat(objLines(c.path, c.draft, full, '        '), subLines(c.path, c.draft, full, '        '), ['    next', 'end']).join('\n');
            }
            if (v.ok === 'get') { log({ raw: line, canon: 'get', path: c.path }); return getObj(c.path, Object.assign({ [sc.key]: c.key }, c.draft)); }
            // set / unset / append / unselect
            if (t.length < 2) { log({ raw: line, err: 'incomplete' }); return perr(null); }
            const an = t[1].t.toLowerCase(), a = sc.attrs[an];
            if (!a || a.t === 'ro' || !attrOk(a) || (a.when && !a.when(c.draft) && v.ok !== 'unset')) { log({ raw: line, err: 'invalid' }); return perr(t[1]); }
            // Merkezi NAT açıkken kural düzeyinde NAT alanları yoktur (SNAT central-snat-map'ten gelir)
            if (c.path === 'firewall policy' && ['nat', 'ippool', 'poolname'].includes(an) && centralNat()) { log({ raw: line, err: 'invalid' }); return perr(t[1]); }
            if (v.ok === 'unset') { delete c.draft[an]; log({ raw: line, canon: 'unset ' + an, path: c.path, key: c.key }); return ''; }
            if ((v.ok === 'append' || v.ok === 'unselect') && !['refs', 'menum', 'ports', 'ints', 'ports1'].includes(a.t)) { log({ raw: line, err: 'invalid' }); return perr(t[1]); }
            const r = parseVal(a, t.slice(2), c.draft);
            // M10: arayüz alt ağları çakışamaz (system settings allow-subnet-overlap disable, varsayılan)
            if (!r.err && c.path === 'system interface' && an === 'ip' && v.ok === 'set') { const ov = overlapWith(c.key, r.v); if (ov) { log({ raw: line, err: 'overlap' }); return ov; } }
            if (r.err === 'novalue') { log({ raw: line, err: 'incomplete' }); return 'value parse error before \'\''; }
            if (r.err === 'ds') { const bt = t[2 + r.at]; log({ raw: line, err: 'ds' }); return 'entry not found in datasource\n\nvalue parse error before \'' + bt.t + '\''; }
            if (r.err) { const bt = t[2 + r.at]; log({ raw: line, err: 'value' }); return 'value parse error before \'' + (bt ? bt.t : '') + '\''; }
            let val = r.v;
            if (v.ok === 'append') val = [...new Set((c.draft[an] || []).concat(r.v))];
            if (v.ok === 'unselect') { val = (c.draft[an] || []).filter(x => !r.v.includes(x)); }
            if (Array.isArray(val) && !val.length) delete c.draft[an]; else c.draft[an] = val;
            log({ raw: line, canon: v.ok + ' ' + an + ' ' + (Array.isArray(r.v) ? r.v.join(' ') : r.v), path: c.path, key: c.key });
            return '';
        }

        // ── ? ve Tab
        const VERB_H = { config: 'Nesne yapılandır', show: 'Yapılandırmayı göster', get: 'Durum / sistem bilgisi', execute: 'Anlık komut çalıştır (ping…)', diagnose: 'Tanılama', exit: 'CLI\'dan çık',
            edit: 'Nesne düzenle / oluştur', delete: 'Nesneyi sil', end: 'Kaydet ve çık', abort: 'Kaydetmeden çık', move: 'Kural sırasını değiştir', set: 'Özellik ata', unset: 'Özelliği varsayılana döndür',
            append: 'Listeye ekle', unselect: 'Listeden çıkar', next: 'Kaydet, tabloya dön', rename: 'Kaydı yeniden adlandır: rename <eski> to <yeni>' };
        function candidates(raw) {
            // satırın son kelimesinden önceki kısma göre olası sonraki kelimeler: [[kelime, açıklama]]
            const t = tok(raw), trailing = raw === '' || /\s$/.test(raw);
            const done = trailing ? t : t.slice(0, -1);
            const c = S.ctx;
            const verbList = !c ? ['config', 'show', 'get', 'execute', 'diagnose', 'exit'] : (c.key !== undefined || c.single) ? ['set', 'unset', 'append', 'unselect', 'show', 'get', 'end', 'abort'].concat(c.single ? [] : ['next'], SCHEMA[c.path].children ? ['config'] : []) : ['edit', 'delete', 'show', 'get', 'end', 'abort'].concat(SCHEMA[c.path].move ? ['move'] : [], !SCHEMA[c.path].num && !SCHEMA[c.path].parent && !SCHEMA[c.path].fixed ? ['rename'] : []);
            if (!done.length) return verbList.map(w => [w, VERB_H[w] || '']);
            const v = pick(done[0].t, verbList);
            if (!v.ok) return null;
            if (!c && (v.ok === 'config' || v.ok === 'show' || v.ok === 'get')) {
                let i = 1;
                if (v.ok === 'show' && done[1] && 'full-configuration'.startsWith(done[1].t.toLowerCase()) && done[1].t.length > 1) i = 2;
                const words = done.slice(i).map(x => x.t);
                let cands = PATHS.map(p => p.split(' ')).concat(v.ok === 'get' ? GETS.map(g => g.split(' ')) : []);
                for (let k = 0; k < words.length; k++) {
                    const opts = [...new Set(cands.filter(x => x.length > k).map(x => x[k]))];
                    const r = pick(words[k], opts);
                    if (!r.ok) return null;
                    cands = cands.filter(x => x[k] === r.ok);
                }
                const k = words.length;
                const PH = { system: 'Sistem ayarları', firewall: 'Güvenlik duvarı nesneleri ve kuralları', router: 'Yönlendirme', global: 'Genel sistem ayarları', dns: 'DNS sunucuları',
                    interface: 'Arayüzler', admin: 'Yönetici hesapları', address: 'Adres nesneleri', addrgrp: 'Adres grupları', service: 'Servis nesneleri', custom: 'Özel servisler', group: 'Servis grupları',
                    ippool: 'Kaynak NAT havuzları', vip: 'Sanal IP (hedef NAT)', policy: 'Güvenlik kuralları', static: 'Statik rotalar', status: 'Sürüm, seri no, mod', info: 'Yönlendirme bilgisi', 'routing-table': 'Yönlendirme tablosu', all: 'Tüm rotalar',
                    database: 'Tüm aday rotalar (seçilen / beklemede / inactive)', details: 'Bir hedefin kullandığı rota: details <ip>', webfilter: 'Web filtre', urlfilter: 'Statik URL filtre listeleri', dnsfilter: 'DNS filtre', 'domain-filter': 'Statik alan adı listeleri',
                    ips: 'Saldırı önleme', sensor: 'IPS sensörleri', application: 'Uygulama kontrolü', list: 'Uygulama listeleri', 'ssl-ssh-profile': 'SSL/SSH inceleme profilleri', 'central-snat-map': 'Merkezi SNAT tablosu',
                    schedule: 'Zamanlamalar', recurring: 'Tekrarlayan zamanlama', settings: 'VDOM ayarları (central-nat…)', log: 'Log ayarları', setting: 'Genel log ayarları' };
                const res = [...new Set(cands.filter(x => x.length > k).map(x => x[k]))].map(w => [w, PH[w] || '']);
                if (v.ok === 'show' && i === 1 && !words.length) res.unshift(['full-configuration', 'Varsayılanlar dahil tüm yapılandırma']);
                if (cands.some(x => x.length === k) && k) res.push(['<Enter>', '']);
                return res;
            }
            if (c && v.ok === 'config' && SCHEMA[c.path].children) return done.length === 1 ? SCHEMA[c.path].children.map(w => [w, 'Alt tablo']) : [];
            if (!c && v.ok === 'diagnose') {
                let node = DIAG;
                for (let k = 1; k < done.length; k++) { if (!node || typeof node !== 'object') return []; const r = pick(done[k].t, Object.keys(node)); if (!r.ok) return null; node = node[r.ok]; }
                const DH = { ssl: 'SSL-VPN oturumları', sys: 'Sistem (süreç, oturum)', top: 'En çok CPU/bellek kullanan süreçler', session: 'Oturum tablosu', stat: 'Oturum istatistikleri', list: 'Oturumları listele (filtreyle)', clear: 'Filtredeki oturumları sil', filter: 'Filtre ayarla',
                    hardware: 'Donanım', sysinfo: 'Sistem bilgisi', memory: 'Bellek kullanımı', conserve: 'Bellek koruma (conserve) modu', debug: 'Debug', reset: 'Tüm debug ayarlarını sıfırla', enable: 'Debug çıktısını aç', disable: 'Debug çıktısını kapat', info: 'Debug durumu',
                    crashlog: 'Çökme kaydı', 'config-error-log': 'Yapılandırma hata kaydı', read: 'Oku', flow: 'Paket akışı izleme', show: 'Gösterim ayarı', 'function-name': 'Fonksiyon adlarını göster', trace: 'İzleme', start: 'N paket izle', stop: 'İzlemeyi durdur', console: 'Konsol', timestamp: 'Zaman damgası', sniffer: 'Paket yakalama', ha: 'HA', checksum: 'Yapılandırma sağlaması', cluster: 'Tüm üyeler', history: 'HA olay geçmişi', ip: 'IP', arp: 'ARP tablosu', vpn: 'VPN', ike: 'IKE (faz 1)', gateway: 'IKE ağ geçitleri', 'log-filter': 'IKE debug filtresi', tunnel: 'IPsec tünelleri', application: 'Uygulama debug\'ı (ike, sslvpn)', packet: '<arayüz|any> \'<filtre>\' <1-6> <adet>' };
                return node && typeof node === 'object' ? Object.keys(node).map(w => [w, DH[w] || '']) : [['<Enter>', '']];
            }
            if (!c && v.ok === 'execute') {
                if (done.length === 1) return [['ping', 'ICMP erişilebilirlik testi'], ['ping-options', 'Ping kaynağı, tekrar sayısı'], ['traceroute', 'Yol izleme'], ['telnet', 'TCP port testi: telnet <ip> <port>'], ['ha', 'HA yönetimi (manage, failover, synchronize)'], ['log', 'Log görüntüleme: log filter … / log display']];
                const e1 = pick(done[1].t, ['ping', 'ping-options', 'traceroute', 'telnet', 'ha', 'log']);
                if (e1.ok === 'log') { if (done.length === 2) return [['filter', 'Filtre: category <n> | field <ad> <değer> | reset | dump'], ['display', 'Filtreye uyan logları göster']]; if (done.length === 3 && 'filter'.startsWith(done[2].t)) return [['category', 'Kategori (0 traffic, 1 event, 3 utm-webfilter, 4 utm-ips, 10 utm-app-ctrl, 15 utm-dns)'], ['field', 'Alan filtresi: field <ad> <değer>'], ['reset', 'Filtreleri temizle'], ['dump', 'Geçerli filtre']]; return []; }
                if (e1.ok === 'ping-options') return done.length === 2 ? [['source', 'Kaynak IP (arayüz adresi)'], ['repeat-count', 'Paket sayısı'], ['reset', 'Varsayılana dön'], ['view-settings', 'Ayarları göster']] : [];
                if (e1.ok === 'ha') return done.length === 2 ? [['manage', 'Diğer üyeye bağlan: manage <index> <kullanıcı>'], ['failover', 'Kontrollü failover: failover set|unset 1'], ['synchronize', 'Yapılandırmayı eşitle: synchronize start']] : [];
                return done.length === 2 ? [['<ip>', 'Hedef IP']] : e1.ok === 'telnet' && done.length === 3 ? [['<port>', 'TCP port (varsayılan 23)']] : [];
            }
            if (c && (c.key !== undefined || c.single) && ['set', 'unset', 'append', 'unselect'].includes(v.ok)) {
                const sc = SCHEMA[c.path];
                if (done.length === 1) return Object.entries(sc.attrs).filter(([k, a]) => a.t !== 'ro' && attrOk(a) && (!a.when || a.when(c.draft)) && (v.ok === 'set' || v.ok === 'unset' || ['refs', 'menum', 'ports'].includes(a.t))).map(([k, a]) => [k, a.d || '']);
                const a = sc.attrs[done[1].t.toLowerCase()];
                if (!a || v.ok === 'unset') return [];
                if (a.t === 'enum' || a.t === 'menum') return (a.v76 && IS76 ? a.v.concat(a.v76) : a.v).map(x => [x, '']);
                if (a.t === 'refn') return DS[a.ds]().map(x => [x, '']);
                if (a.t === 'ref' || a.t === 'refs') return DS[a.ds]().filter(x => x !== 'none' || a.ds !== 'addrgrpMember').map(x => [x, '']);
                return [[{ str: '<string>', int: '<' + a.min + '-' + a.max + '>', ip: '<A.B.C.D>', ipmask: '<A.B.C.D A.B.C.D> ya da <A.B.C.D/uz>', iprange: '<A.B.C.D[-A.B.C.D]>', iprangeq: '<A.B.C.D[-A.B.C.D]>', ports: '<port[-port]>', port1: '<port[-port]>', secret: '<parola>', ints: '<numara> …', ports1: '<port> …', hhmm: '<ss:dd>' }[a.t] || '<değer>', a.d || '']];
            }
            if (c && c.key === undefined && !c.single && v.ok === 'rename') return done.length === 1 ? tbl(c).o.filter(k => !tbl(c).v[k]._builtin).map(k => [k, '']) : done.length === 2 ? [['to', '']] : done.length === 3 ? [['<yeni ad>', '']] : [];
            if (c && c.key === undefined && !c.single && (v.ok === 'edit' || v.ok === 'delete')) {
                const sc = SCHEMA[c.path];
                return tbl(c).o.filter(k => !tbl(c).v[k]._builtin).map(k => [k, '']).concat(v.ok === 'edit' && !sc.fixed ? [[sc.num ? '<0>' : '<yeni ad>', sc.num ? 'Sıradaki boş ID ile yeni kayıt' : 'Yeni kayıt']] : []);
            }
            if (c && (v.ok === 'show' || v.ok === 'get')) return [['<Enter>', '']].concat(v.ok === 'show' && done.length === 1 ? [['full-configuration', 'Varsayılanlar dahil']] : []);
            return [];
        }
        function help(raw) {
            log({ help: raw });
            if (S.pending || S.loggedOut) return '';
            const trailing = raw === '' || /\s$/.test(raw);
            const list = candidates(raw);
            if (list === null) return 'command parse error before \'' + (tok(raw).slice(-1)[0] || { t: '' }).t + '\'';
            const t = tok(raw), part = trailing ? '' : t[t.length - 1].t.toLowerCase();
            const rows = list.filter(([w]) => !part || String(w).toLowerCase().startsWith(part));
            return rows.map(([w, d]) => pad(w, 22) + d).join('\n');
        }
        function complete(raw) {
            if (S.pending || S.loggedOut || raw === '' || /\s$/.test(raw)) return null;
            const list = candidates(raw);
            if (!list) return null;
            const t = tok(raw), part = t[t.length - 1];
            const hits = list.map(x => String(x[0])).filter(w => !w.startsWith('<') && w.toLowerCase().startsWith(part.t.toLowerCase()));
            if (hits.length !== 1) return null;
            const w = /\s/.test(hits[0]) ? qt(hits[0]) : hits[0];
            return raw.slice(0, part.o) + w + ' ';
        }

        // başlangıç yapılandırması
        const startCmds = (lab.start || []).concat((S.variant && S.variant.start) || []);
        if (startCmds.length) { startCmds.forEach(l => { input(l); }); S.ctx = null; S.ev = []; S.hist = []; }

        const E = {
            ran: re => S.ev.some(e => e.canon && re.test(e.canon)),
            after: (a, b) => { const i = S.ev.findIndex(e => e.canon && a.test(e.canon)); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && b.test(e.canon)); },
            afterErr: re => { const i = S.ev.findIndex(e => e.err); return i >= 0 && S.ev.slice(i + 1).some(e => e.canon && re.test(e.canon)); },
            err: k => S.ev.some(e => e.err === k),
            // re verilirse yalnız o satır için istenen yardım sayılır (ör. /^config\s/)
            helped: re => S.ev.some(e => e.help !== undefined && (!re || re.test(e.help))),
            abbrev: canon => S.ev.some(e => e.canon === canon && e.raw.trim().toLowerCase() !== canon),
            list: () => S.ev,
            traced: (stage) => S.ev.some(e => e.trace && (!stage || e.trace === stage)),
            tracedAfter: (re, stage) => { const i = S.ev.map(e => !!(e.canon && re.test(e.canon))).lastIndexOf(true); return i >= 0 && S.ev.slice(i + 1).some(e => e.trace === stage); },
            sniffed: (fn) => S.ev.some(e => e.sniff && (!fn || fn(e.sniff))),
            warned: (w) => S.ev.some(e => e.warn === w)
        };
        // görev kontrolleri için okuma yardımcıları (kaydedilmiş = next/end sonrası durum)
        const obj = (p, k) => { const sc = SCHEMA[p], o = sc.single ? M().t[p] : M().t[p].v[k]; if (!o) return null; const r = {}; for (const [an, a] of Object.entries(sc.attrs)) r[an] = o[an] !== undefined ? o[an] : a.def; return r; };
        return {
            vendor: 'fortigate',
            prompt, secret: () => !!(S.pending && S.pending.secret), input, help, complete,
            _toRoot: () => { S.ctx = null; S.pending = null; S.loggedOut = false; },
            get answers() { return S.answers; }, set answers(v) { S.answers = v || {}; },
            ssl: user => { const cl = sslClients().find(x => x.user === user); return cl ? sslConnect(cl) : null; },
            ha: () => { const E = haElect(); return { formed: E.formed, primary: E.formed ? E.meP : true, reason: E.reason || E.why, synced: haInSync(), onPeer: S.ha.onPeer }; },
            tun: n => { const T = tun(n); return { p1up: T.p1up, p2up: T.p2up, reason: T.reason }; },
            variant: () => S.variant, decide: f => decide(Object.assign({ sport: 50000, proto: 'tcp', reply: 'ok', arrives: true }, f)), fos: FOS,
            logs: () => genLogs(), subObj: (p, k, sub) => { const o = M().t[p].v[k]; return o ? o['_sub_' + sub] || null : null; },
            get model() { return S.m; }, ev: E, mode: () => (S.ctx ? (S.ctx.key !== undefined ? 'edit' : 'config') : 'root'),
            obj, keys: p => M().t[p].o.filter(k => !M().t[p].v[k]._builtin), order: p => M().t[p].o.slice(),
            rib, ifUp, saved: () => !S.ctx, dhcpLeases: () => dhcpLeases(), zoneOf: n => zoneOf(n), revs: () => S.revs.map(r => r.comment), tftp: () => Object.keys(S.tftp),
            sub: (p, k, sub) => { const o = M().t[p].v[k]; const ct = o && o['_sub_' + sub]; return ct ? ct.o.map(x => ct.v[x]) : []; },
            showRun: () => PATHS.filter(p => !NEWP.has(p) || (SCHEMA[p].single ? Object.keys(M().t[p]).length : M().t[p].o.length)).map(p => showPath(p, undefined, false)).join('\n'),
        };
    }
    return { session, SCHEMA };
})();
// Motor kayıt defteri: vendor anahtarı → motor (test kapısı ve arayüz buradan bulur)
(typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES = Object.assign((typeof window !== 'undefined' ? window : globalThis).CG_LAB_ENGINES || {}, { 'fortigate': CgLabFgt, 'fortigate-76': CgLabFgt });
if (typeof module !== 'undefined') module.exports = CgLabFgt;
