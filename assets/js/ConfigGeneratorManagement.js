'use strict';

// ─── Shared Utilities ───────────────────────────────────────────────────────

function cgEsc(v) {
    return String(v == null ? '' : v).replace(/[<>&"']/g, c =>
        ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
}

const CG_VALIDATORS = {
    ip:       { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Geçerli bir IPv4 adresi girin (örn: 10.0.0.1)' },
    cidr:     { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/, msg: 'CIDR formatında girin (örn: 10.0.0.0/24)' },
    subnet:   { re: /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/, msg: 'Geçerli subnet mask girin (örn: 255.255.255.0)' },
    ip_cidr:  { fn: v => /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(v) || /^((25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(25[0-5]|2[0-4]\d|[01]?\d\d?)\/(3[0-2]|[12]?\d)$/.test(v), msg: 'IP adresi veya CIDR (örn: 10.0.0.1 veya 10.0.0.0/24)' },
    vlan:     { fn: v => { const n = parseInt(v); return !isNaN(n) && n >= 1 && n <= 4094; }, msg: 'VLAN ID 1-4094 arasında olmalı' },
    asn:      { fn: v => { const n = parseInt(v); return (!isNaN(n) && n >= 1 && n <= 4294967295) || /^\d+\.\d+$/.test(v.trim()); }, msg: 'AS numarası 1-4294967295 veya dotted (ör: 65000 veya 1.100)' },
    port:     { fn: v => { const n = parseInt(v); return !isNaN(n) && n >= 0 && n <= 65535; }, msg: 'Port 0-65535 arasında olmalı' },
    hostname: { re: /^[a-zA-Z0-9]([a-zA-Z0-9\-\.]{0,61}[a-zA-Z0-9])?$/, msg: 'Geçerli hostname girin (harf, rakam, tire)' },
    mac:      { re: /^([0-9a-fA-F]{2}[:\-]){5}[0-9a-fA-F]{2}$/, msg: 'MAC adresi formatında girin (örn: 00:1A:2B:3C:4D:5E)' },
    prefix:   { fn: v => { const n = parseInt(v); return !isNaN(n) && n >= 0 && n <= 128; }, msg: 'Prefix 0-128 arasında olmalı' },
    rd:       { re: /^\d+:\d+$/, msg: 'Route Distinguisher formatında girin (örn: 65000:100)' },
    rt:       { re: /^\d+:\d+$/, msg: 'Route Target formatında girin (örn: 65000:100)' },
    vni:      { fn: v => { const n = parseInt(v); return !isNaN(n) && n >= 1 && n <= 16777215; }, msg: 'VNI 1-16777215 arasında olmalı' },
    bgp_timer:{ fn: v => { const n = parseInt(v); return !isNaN(n) && n >= 1 && n <= 65535; }, msg: 'Timer 1-65535 saniye arasında olmalı' },
};

function cgValidate(form) {
    let ok = true;
    form.querySelectorAll('[data-cgv], [required]').forEach(el => {
        if (el.disabled) return;
        const val = el.value.trim();
        // Boş kontrolü
        if (el.required && !val) {
            el.classList.add('is-invalid');
            _cgSetError(el, 'Bu alan zorunludur');
            ok = false;
            return;
        }
        // Format kontrolü (dolu ama validate tipi var)
        const vtype = el.dataset.cgv;
        if (vtype && val && CG_VALIDATORS[vtype]) {
            const v = CG_VALIDATORS[vtype];
            const pass = v.re ? v.re.test(val) : v.fn(val);
            el.classList.toggle('is-invalid', !pass);
            if (!pass) { _cgSetError(el, v.msg); ok = false; }
            else _cgClearError(el);
        } else {
            el.classList.remove('is-invalid');
            _cgClearError(el);
        }
    });
    return ok;
}

function _cgSetError(el, msg) {
    let fb = el.parentNode.querySelector('.cg-field-error');
    if (!fb) { fb = document.createElement('div'); fb.className = 'cg-field-error'; el.parentNode.appendChild(fb); }
    fb.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + msg;
    fb.style.display = '';
}
function _cgClearError(el) {
    const fb = el.parentNode.querySelector('.cg-field-error');
    if (fb) fb.remove();
    el.classList.remove('is-invalid');
}

function cgShowOutput(config, warnings = []) {
    const area = document.getElementById('cg-output-area');
    if (!area) return;
    let html = '';
    if (warnings.length) {
        html += `<div class="alert alert-warning"><strong>Uyarılar:</strong><ul class="mb-0">`;
        warnings.forEach(w => { html += `<li>${cgEsc(w)}</li>`; });
        html += `</ul></div>`;
    }
    html += `
        <div class="alert alert-success py-2">Konfigürasyon oluşturuldu.</div>
        <div class="d-flex gap-2 mb-2">
            <button class="btn btn-sm btn-outline-secondary" onclick="cgCopy()">
                <i class="fas fa-copy"></i> Kopyala
            </button>
            <button class="btn btn-sm btn-outline-secondary" onclick="cgDownload()">
                <i class="fas fa-download"></i> İndir (.txt)
            </button>
        </div>
        <pre class="config-output" id="cg-config-text">${cgEsc(config)}</pre>`;
    area.innerHTML = html;
    area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function cgCopy() {
    const el = document.getElementById('cg-config-text');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = document.querySelector('[onclick="cgCopy()"]');
        if (btn) { btn.textContent = '✓ Kopyalandı'; setTimeout(() => { btn.innerHTML = '<i class="fas fa-copy"></i> Kopyala'; }, 2000); }
    });
}

function cgDownload() {
    const text = document.getElementById('cg-config-text')?.textContent;
    if (!text) return;
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    a.download = 'config.txt';
    a.click();
}

function cgPostRender(container) {
    container.querySelectorAll('input:not([type="checkbox"]):not([type="radio"]):not([type="submit"])').forEach(el => {
        el.style.fontSize = '15px';
        el.style.height = '50px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('textarea').forEach(el => {
        el.style.fontSize = '15px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('select').forEach(el => {
        el.style.fontSize = '15px';
        el.style.height = '50px';
        el.style.padding = '12px 16px';
        el.style.borderRadius = '10px';
    });
    container.querySelectorAll('.col-form-label, label:not(.form-check-label)').forEach(el => {
        el.style.fontSize = '14.5px';
        el.style.fontWeight = '600';
        el.style.marginBottom = '8px';
        el.style.color = '#1e293b';
    });
    container.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(el => {
        el.style.padding = '15px 36px';
        el.style.fontSize = '15.5px';
        el.style.fontWeight = '700';
        el.style.marginTop = '12px';
        el.style.width = '100%';
        el.style.borderRadius = '10px';
        el.style.background = '#0b2e5b';
        el.style.borderColor = '#0b2e5b';
        el.style.color = '#fff';
        el.style.letterSpacing = '.4px';
    });
}

// ─── Schema-Based Form Builder ───────────────────────────────────────────────

function cgFormBuilder(container, schema, generateFn) {
    const esc = cgEsc;

    function renderBadge(badge) {
        if (!badge) return '';
        return '<span class="cg-card-badge ' + esc(badge.cls) + '">' + esc(badge.text) + '</span>';
    }

    function renderTypeCards(types) {
        if (!types || !types.length) return '';
        const colW = Math.floor(12 / Math.min(types.length, 4));
        const cards = types.map(t =>
            '<div class="col-md-' + colW + '">' +
            '<div class="gen-type-card-enhanced" onclick="cgFBSelectType(\'' + esc(t.id) + '\',this)">' +
            renderBadge(t.badge) +
            '<i class="' + esc(t.icon) + ' card-icon"></i>' +
            esc(t.label) +
            '<div class="card-desc">' + esc(t.desc) + '</div>' +
            '</div></div>'
        ).join('');
        return '<div class="cg-section"><div class="cg-section-title"><i class="fas fa-th-large"></i> Yapılandırma Tipi</div>' +
               '<div class="row g-3 mb-1">' + cards + '</div>' +
               '<input type="hidden" name="_cgtype" id="_cgtype" value=""></div>';
    }

    function renderField(f) {
        if (f.type === 'hidden') return '<input type="hidden" name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '" value="' + esc(f.value || '') + '">';

        const req  = f.required ? '<span class="text-danger">*</span>' : '';
        const opt  = f.optional ? '<span class="cg-opt">Opsiyonel</span>' : '';
        const tip  = f.tooltip  ? '<span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">' + esc(f.tooltip) + '</span></span>' : '';
        const hint = f.hint     ? '<span class="cg-field-hint">' + esc(f.hint) + '</span>' : '';

        const baseAttrs = 'name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '"' +
            (f.required    ? ' required'                        : '') +
            (f.validate    ? ' data-cgv="' + esc(f.validate) + '"' : '') +
            (f.min !== undefined ? ' min="' + f.min + '"'       : '') +
            (f.max !== undefined ? ' max="' + f.max + '"'       : '') +
            (f.placeholder ? ' placeholder="' + esc(f.placeholder) + '"' : '') +
            (f.onChange    ? ' onchange="' + f.onChange + '"'   : '') +
            (f.value       ? ' value="' + esc(f.value) + '"'   : '');

        const label = '<label class="col-sm-4 col-form-label">' + esc(f.label) + ' ' + req + opt + ' ' + tip + '</label>';

        if (f.type === 'checkbox') {
            return '<div class="mb-3 form-check">' +
                   '<input type="checkbox" name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '" class="form-check-input"' + (f.checked ? ' checked' : '') + '>' +
                   '<label class="form-check-label" for="cgfb_' + esc(f.name) + '">' + esc(f.label) + ' ' + tip + '</label>' +
                   hint + '</div>';
        }

        if (f.type === 'select') {
            const opts = (f.options || []).map(o =>
                '<option value="' + esc(o.value) + '"' + (o.selected ? ' selected' : '') + '>' + esc(o.label) + '</option>'
            ).join('');
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><select ' + baseAttrs + ' class="form-select">' + opts + '</select>' + hint + '</div></div>';
        }

        if (f.type === 'textarea') {
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><textarea ' + baseAttrs + ' class="form-control" rows="' + (f.rows || 3) + '"></textarea>' + hint + '</div></div>';
        }

        return '<div class="mb-4 row">' + label +
               '<div class="col-sm-8"><input type="' + (f.type || 'text') + '" ' + baseAttrs + ' class="form-control">' + hint + '</div></div>';
    }

    function renderSection(sec) {
        const warn = sec.warn ? '<div class="cg-warn-box mb-4"><i class="fas fa-exclamation-triangle"></i><span>' + sec.warn + '</span></div>' : '';
        const info = sec.info ? '<div class="cg-info-callout mb-4"><i class="fas fa-info-circle"></i><span>' + sec.info + '</span></div>' : '';
        const showFor = sec.showFor ? ' data-showfor="' + esc(sec.showFor.join(',')) + '"' : '';
        const display = sec.showFor ? ' style="display:none"' : '';
        return '<div class="cg-fb-section"' + showFor + display + '>' +
               '<div class="cg-section"><div class="cg-section-title"><i class="' + esc(sec.icon || 'fas fa-cog') + '"></i> ' + esc(sec.title) + '</div>' +
               warn + info +
               (sec.fields || []).map(renderField).join('') +
               '</div></div>';
    }

    const topicHtml = schema.topic
        ? '<div class="cg-topic-box"><div class="cg-topic-box-icon"><i class="' + esc(schema.topic.icon) + '"></i></div>' +
          '<div class="cg-topic-box-content"><h6>' + esc(schema.topic.title) + '</h6><p>' + schema.topic.desc + '</p></div></div>'
        : '';

    const formId = 'cgfb_' + Math.random().toString(36).slice(2, 8);
    container._cgfbFormId = formId;

    container.innerHTML = topicHtml +
        '<form id="' + formId + '">' +
        renderTypeCards(schema.configTypes) +
        (schema.sections || []).map(renderSection).join('') +
        '<button type="submit" class="btn btn-primary"' + (schema.configTypes ? ' style="display:none"' : '') +
        ' id="' + formId + '_submit"><i class="fas fa-code"></i> ' + esc(schema.submit || 'Konfigürasyon Oluştur') + '</button>' +
        '</form>';

    document.getElementById(formId).addEventListener('submit', e => {
        e.preventDefault();
        const form = e.target;
        // Clear old banner
        const oldBanner = form.querySelector('.cg-validation-banner');
        if (oldBanner) oldBanner.remove();
        if (!cgValidate(form)) {
            const errCount = form.querySelectorAll('.is-invalid').length;
            const banner = document.createElement('div');
            banner.className = 'cg-validation-banner';
            banner.innerHTML = '<i class="fas fa-exclamation-triangle"></i> <strong>' + errCount + ' alanda hata var.</strong> Kırmızı işaretli alanları düzeltin ve tekrar deneyin.';
            const submitBtn = form.querySelector('button[type="submit"]');
            form.insertBefore(banner, submitBtn);
            banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }
        const data = {};
        new FormData(e.target).forEach((v, k) => { data[k] = v; });
        e.target.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked; });
        const result = generateFn(data, e.target);
        if (result) {
            if (typeof result === 'string') cgShowOutput(result);
            else cgShowOutput(result.config || '', result.warnings || []);
        }
    });

    cgPostRender(container);
}

function cgFBSelectType(typeId, cardEl) {
    const form = cardEl.closest('form');
    form.querySelectorAll('.gen-type-card-enhanced').forEach(c => c.classList.remove('active'));
    cardEl.classList.add('active');
    const hidden = form.querySelector('[name="_cgtype"]');
    if (hidden) hidden.value = typeId;
    form.querySelectorAll('.cg-fb-section[data-showfor]').forEach(sec => {
        const show = sec.dataset.showfor.split(',').includes(typeId);
        sec.style.display = show ? '' : 'none';
        sec.querySelectorAll('input,select,textarea').forEach(el => {
            if (el.dataset.origRequired === 'true' || el.required) {
                if (!el.dataset.origRequired) el.dataset.origRequired = 'true';
                el.disabled = !show;
                el.required = show;
            }
        });
    });
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.style.display = '';
}

// ─── GENERATORS Registry ─────────────────────────────────────────────────────

const CG_REGISTRY = {
    'cisco-ios': {
        label: 'Cisco IOS', icon: 'fas fa-network-wired', color: '#1BA0D7',
        types: [
            { id: 'vlan',          label: 'VLAN',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vlan },
            { id: 'acl',           label: 'ACL',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.acl },
            { id: 'nat',           label: 'NAT / PAT',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.nat },
            { id: 'static-route',  label: 'Static Route',    gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.route },
            { id: 'ospf',          label: 'OSPF',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ospf },
            { id: 'bgp',           label: 'BGP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bgp },
            { id: 'ipsec',         label: 'IPSec VPN',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ipsec },
            { id: 'dhcp',          label: 'DHCP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dhcp },
            { id: 'snmp',          label: 'SNMP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.snmp },
            { id: 'aaa',           label: 'AAA',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.aaa },
            { id: 'tacacs',        label: 'TACACS+',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tacacs },
            { id: 'ssh',           label: 'SSH',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ssh },
            { id: 'password',      label: 'Password/User',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.password },
            { id: 'vrrp-hsrp',     label: 'VRRP/HSRP/GLBP', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrrp },
            { id: 'stp',           label: 'STP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.stp },
            { id: 'port-security', label: 'Port Security',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.portSecurity },
            { id: 'qos',           label: 'QoS',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.qos },
            { id: 'gre',           label: 'GRE Tunnel',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.gre },
            { id: 'tracking',      label: 'IP SLA/Tracking', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tracking },
            { id: 'rate-limit',    label: 'Rate Limit',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.rateLimit },
            { id: 'advanced',      label: 'Advanced Multi',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.advanced },
            { id: 'etherchannel',  label: 'EtherChannel/LACP',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.etherchannel },
            { id: 'dmvpn',         label: 'DMVPN',              gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dmvpn },
            { id: 'eigrpnamed',    label: 'EIGRP Named Mode',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.eigrpnamed },
            { id: 'vrflite',       label: 'VRF-Lite',           gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrflite },
            { id: 'mpls',          label: 'MPLS / LDP',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.mpls },
            { id: 'l3vpn',         label: 'L3VPN (PE)',          gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.l3vpn },
            { id: 'routemap',      label: 'Route-Map & Redist.', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.routemap },
            { id: 'isis',          label: 'IS-IS',               gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.isis },
            { id: 'zbfw',          label: 'Zone-Based Firewall',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.zbfw },
            { id: 'bfd',           label: 'BFD',                  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bfd },
        ]
    },
    'cisco-ftd': {
        label: 'Cisco FTD', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'bootstrap',       label: 'FTD Bootstrap',        gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.bootstrap },
            { id: 'interface',       label: 'Interface',             gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.interface },
            { id: 'nat',             label: 'NAT',                   gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.nat },
            { id: 'accessControl',   label: 'Access Control Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.accessControl },
            { id: 'intrusionPolicy', label: 'Intrusion Policy',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.intrusionPolicy },
            { id: 'sslPolicy',       label: 'SSL Policy',            gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.sslPolicy },
            { id: 'siteToSiteVpn',   label: 'Site-to-Site VPN',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.siteToSiteVpn },
            { id: 'raVpn',           label: 'Remote Access VPN',     gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.raVpn },
        ]
    },
    'cisco-nxos': {
        label: 'Cisco NX-OS', icon: 'fas fa-server', color: '#1BA0D7',
        types: [
            { id: 'mpls',  label: 'MPLS',       gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.mpls },
            { id: 'vpc',   label: 'vPC',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vpc },
            { id: 'vxlan', label: 'VXLAN/EVPN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vxlan },
            { id: 'span',  label: 'SPAN/RSPAN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.span },
            { id: 'ospf',  label: 'OSPF',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ospf },
            { id: 'bgp',   label: 'BGP',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgp },
            { id: 'hsrp',       label: 'HSRP',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.hsrp },
            { id: 'evpn',       label: 'EVPN',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.evpn },
            { id: 'fabricPath', label: 'FabricPath',    gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.fabricPath },
            { id: 'aaa',        label: 'AAA',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.aaa },
            { id: 'acl',        label: 'ACL',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.acl },
            { id: 'qos',        label: 'QoS',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.qos },
            { id: 'syslog',     label: 'Syslog',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.syslog },
            { id: 'ntp',        label: 'NTP',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ntp },
        ]
    },
    'huawei': {
        label: 'Huawei VRP', icon: 'fas fa-broadcast-tower', color: '#CF0A2C',
        types: [
            { id: 'basic',       label: 'Temel',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.basic },
            { id: 'vlan',        label: 'VLAN',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vlan },
            { id: 'dhcp',        label: 'DHCP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.dhcp },
            { id: 'snmp',        label: 'SNMP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmp },
            { id: 'nat',         label: 'NAT/Port Forward',     gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.nat },
            { id: 'tacacs',      label: 'TACACS+',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.tacacs },
            { id: 'acl',         label: 'ACL',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.acl },
            { id: 'security',    label: 'Security Policy',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.security },
            { id: 'isis',        label: 'IS-IS',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.isis },
            { id: 'ethtunk',     label: 'Eth-Trunk (LAG)',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ethtunk },
            { id: 'mpls',        label: 'MPLS / LDP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mpls },
            { id: 'l3vpn',       label: 'L3VPN (VRF)',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.l3vpn },
            { id: 'interface',   label: 'Interface / Loopback', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.interface },
            { id: 'ospf',        label: 'OSPF',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ospf },
            { id: 'bgp',         label: 'BGP',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bgp },
            { id: 'mstp',        label: 'MSTP / STP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mstp },
            { id: 'qos',         label: 'QoS MQC',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.qos },
            { id: 'bfd',         label: 'BFD',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bfd },
            { id: 'ntp',         label: 'NTP / Clock',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ntp },
            { id: 'aaa',         label: 'AAA / RADIUS',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.aaa },
            { id: 'snmpv3',      label: 'SNMP v3 (Detaylı)',    gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmpv3 },
            { id: 'ssh',         label: 'SSH / User',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ssh },
            { id: 'routepolicy', label: 'Route Policy',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.routepolicy },
            { id: 'ipsec',       label: 'IPSec VPN IKEv2',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipsec },
            { id: 'ipv6',        label: 'IPv6 Interface',       gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipv6 },
        ]
    },
    'juniper': {
        label: 'Juniper JunOS', icon: 'fas fa-leaf', color: '#84B135',
        types: [
            { id: 'general', label: 'Genel',         gen: () => typeof Juniper !== 'undefined' && Juniper.general },
            { id: 'vlan',    label: 'VLAN',           gen: () => typeof Juniper !== 'undefined' && Juniper.vlan },
            { id: 'dhcp',    label: 'DHCP',           gen: () => typeof Juniper !== 'undefined' && Juniper.dhcp },
            { id: 'acl',      label: 'ACL/Filter',    gen: () => typeof Juniper !== 'undefined' && Juniper.acl },
            { id: 'lag',      label: 'LAG (ae)',       gen: () => typeof Juniper !== 'undefined' && Juniper.lag },
            { id: 'mclag',    label: 'MC-LAG',          gen: () => typeof Juniper !== 'undefined' && Juniper.mclag },
            { id: 'evpnvxlan',label: 'EVPN-VXLAN',     gen: () => typeof Juniper !== 'undefined' && Juniper.evpnvxlan },
        ]
    },
    'juniper-mx': {
        label: 'Juniper MX', icon: 'fas fa-leaf', color: '#5A8A1A',
        types: [
            { id: 'interface',    label: 'Interface',                    gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.interface },
            { id: 'ospf',         label: 'OSPF',                         gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.ospf },
            { id: 'bgp',          label: 'BGP',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bgp },
            { id: 'mpls',         label: 'MPLS / LDP',                   gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.mpls },
            { id: 'l3vpn',        label: 'L3VPN (VRF)',                  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.l3vpn },
            { id: 'bfd',          label: 'BFD',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bfd },
            { id: 'rsvpte',       label: 'Traffic Engineering RSVP-TE',  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.rsvpte },
            { id: 'cos',          label: 'QoS / Class-of-Service',       gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.cos },
            { id: 'routepolicy',  label: 'Routing Policy + Prefix-List', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.routepolicy },
            { id: 'snmp',         label: 'SNMP v3',                      gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.snmp },
        ]
    },
    'juniper-srx': {
        label: 'Juniper SRX', icon: 'fas fa-shield-alt', color: '#3A6B0A',
        types: [
            { id: 'zone',        label: 'Security Zone',         gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.zone },
            { id: 'policy',      label: 'Security Policy',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.policy },
            { id: 'nat',         label: 'NAT Policy',            gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.nat },
            { id: 'vpn',         label: 'IPsec VPN',             gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.vpn },
            { id: 'ha',          label: 'Chassis Cluster',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ha },
            { id: 'appfw',       label: 'AppSecure / UTM',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.appfw },
            { id: 'interface',   label: 'Interface ge/xe/ae',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.interface },
            { id: 'addrbook',    label: 'Address Book Object',   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.addrbook },
            { id: 'ospf',        label: 'OSPF',                  gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ospf },
            { id: 'bgp',         label: 'BGP',                   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.bgp },
            { id: 'staticroute', label: 'Static Route',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.staticroute },
            { id: 'dhcp',        label: 'DHCP Server',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.dhcp },
            { id: 'screens',     label: 'Screens DoS',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.screens },
            { id: 'customapp',   label: 'Custom Application',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.customapp },
            { id: 'alg',         label: 'ALG Settings',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.alg },
            { id: 'jflow',       label: 'J-Flow / NetFlow',      gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.jflow },
            { id: 'snmp',        label: 'SNMP v3',               gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.snmp },
            { id: 'aaa',         label: 'AAA / RADIUS',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.aaa },
        ]
    },
    'dell': {
        label: 'Dell OS10', icon: 'fas fa-hdd', color: '#007DB8',
        types: [
            { id: 'general',      label: 'Genel',           gen: () => typeof Dell !== 'undefined' && Dell.general },
            { id: 'vlan',         label: 'VLAN',             gen: () => typeof Dell !== 'undefined' && Dell.vlan },
            { id: 'portchannel',  label: 'Port-Channel/LAG', gen: () => typeof Dell !== 'undefined' && Dell.portchannel },
            { id: 'ospf',         label: 'OSPF',             gen: () => typeof Dell !== 'undefined' && Dell.ospf },
            { id: 'bgp',          label: 'BGP',              gen: () => typeof Dell !== 'undefined' && Dell.bgp },
            { id: 'vlt',          label: 'VLT (MLAG)',        gen: () => typeof Dell !== 'undefined' && Dell.vlt },
            { id: 'acl',          label: 'ACL',               gen: () => typeof Dell !== 'undefined' && Dell.acl },
            { id: 'qos',          label: 'QoS Policy',        gen: () => typeof Dell !== 'undefined' && Dell.qos },
            { id: 'vxlan',        label: 'VXLAN',            gen: () => typeof Dell !== 'undefined' && Dell.vxlan },
            { id: 'mclag',        label: 'MC-LAG',            gen: () => typeof Dell !== 'undefined' && Dell.mclag },
            { id: 'bgpEvpn',      label: 'BGP EVPN',          gen: () => typeof Dell !== 'undefined' && Dell.bgpEvpn },
            { id: 'qosPolicy',    label: 'QoS Policy Map',    gen: () => typeof Dell !== 'undefined' && Dell.qosPolicy },
            { id: 'ntp',          label: 'NTP',               gen: () => typeof Dell !== 'undefined' && Dell.ntp },
            { id: 'syslog',       label: 'Syslog',            gen: () => typeof Dell !== 'undefined' && Dell.syslog },
            { id: 'snmpv3',       label: 'SNMP v3',           gen: () => typeof Dell !== 'undefined' && Dell.snmpv3 },
            { id: 'stormControl', label: 'Storm Control',     gen: () => typeof Dell !== 'undefined' && Dell.stormControl },
        ]
    },
    'arista': {
        label: 'Arista EOS', icon: 'fas fa-ethernet', color: '#FF6600',
        types: [
            { id: 'general',     label: 'General',                gen: () => typeof Arista !== 'undefined' && Arista.general },
            { id: 'vlan',        label: 'VLAN',                   gen: () => typeof Arista !== 'undefined' && Arista.vlan },
            { id: 'interface',   label: 'Interface (L3)',          gen: () => typeof Arista !== 'undefined' && Arista.interface },
            { id: 'portchannel', label: 'Port-Channel/LACP',      gen: () => typeof Arista !== 'undefined' && Arista.portchannel },
            { id: 'mlag',        label: 'MLAG',                   gen: () => typeof Arista !== 'undefined' && Arista.mlag },
            { id: 'ospf',        label: 'OSPF',                   gen: () => typeof Arista !== 'undefined' && Arista.ospf },
            { id: 'bgp',         label: 'BGP',                    gen: () => typeof Arista !== 'undefined' && Arista.bgp },
            { id: 'evpnvxlan',   label: 'EVPN-VXLAN',             gen: () => typeof Arista !== 'undefined' && Arista.evpnvxlan },
            { id: 'acl',         label: 'ACL',                    gen: () => typeof Arista !== 'undefined' && Arista.acl },
            { id: 'routemap',    label: 'Route-Map + Prefix-List', gen: () => typeof Arista !== 'undefined' && Arista.routemap },
            { id: 'qos',         label: 'QoS (Traffic-Policy)',   gen: () => typeof Arista !== 'undefined' && Arista.qos },
            { id: 'stp',         label: 'STP / MSTP',             gen: () => typeof Arista !== 'undefined' && Arista.stp },
            { id: 'bfd',         label: 'BFD',                    gen: () => typeof Arista !== 'undefined' && Arista.bfd },
            { id: 'aaa',         label: 'AAA / TACACS+',          gen: () => typeof Arista !== 'undefined' && Arista.aaa },
            { id: 'snmp',        label: 'SNMP',                   gen: () => typeof Arista !== 'undefined' && Arista.snmp },
            { id: 'mgmtacl',     label: 'Management ACL',         gen: () => typeof Arista !== 'undefined' && Arista.mgmtacl },
            { id: 'ntp',         label: 'NTP',                    gen: () => typeof Arista !== 'undefined' && Arista.ntp },
            { id: 'logging',     label: 'Logging / Syslog',       gen: () => typeof Arista !== 'undefined' && Arista.logging },
        ]
    },
    'mikrotik': {
        label: 'MikroTik RouterOS', icon: 'fas fa-route', color: '#293239',
        types: [
            { id: 'general',    label: 'General',            gen: () => typeof MikroTik !== 'undefined' && MikroTik.general },
            { id: 'bridgevlan', label: 'Bridge + VLAN',      gen: () => typeof MikroTik !== 'undefined' && MikroTik.bridgevlan },
            { id: 'ipaddress',  label: 'IP Address + Route', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipaddress },
            { id: 'firewall',   label: 'Firewall Filter',    gen: () => typeof MikroTik !== 'undefined' && MikroTik.firewall },
            { id: 'nat',        label: 'NAT',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.nat },
            { id: 'dhcp',       label: 'DHCP Server',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.dhcp },
            { id: 'ipsec',      label: 'IPSec Site-to-Site', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipsec },
            { id: 'wireguard',  label: 'WireGuard',          gen: () => typeof MikroTik !== 'undefined' && MikroTik.wireguard },
            { id: 'ospf',       label: 'OSPF',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.ospf },
            { id: 'bgp',        label: 'BGP',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.bgp },
            { id: 'queue',      label: 'Queue / HTB',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.queue },
            { id: 'snmp',       label: 'SNMP',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.snmp },
            { id: 'logging',    label: 'Logging / Syslog',   gen: () => typeof MikroTik !== 'undefined' && MikroTik.logging },
        ]
    },
    'extreme':  { label: 'Extreme Networks', icon: 'fas fa-project-diagram', color: '#582C83', types: [{ id: 'general', label: 'Genel', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.general }] },
    'cisco-asa': {
        label: 'Cisco ASA', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'interface', label: 'Interface',  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.interface },
            { id: 'route',     label: 'Route',      gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.route },
            { id: 'acl',       label: 'ACL',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.acl },
            { id: 'nat',       label: 'NAT',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.nat },
            { id: 'ospf',      label: 'OSPF',       gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ospf },
            { id: 'ipsec',       label: 'IPSec VPN',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ipsec },
            { id: 'anyconnect',  label: 'AnyConnect VPN', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.anyconnect },
            { id: 'objectgroup',      label: 'Object Groups',      gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.objectgroup },
            { id: 'vpn',              label: 'Site-to-Site VPN',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.vpn },
            { id: 'aaa',              label: 'AAA',                  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaa },
            { id: 'routeMap',         label: 'Route Map',            gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.routeMap },
            { id: 'mpfServicePolicy', label: 'MPF Service Policy',   gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.mpfServicePolicy },
            { id: 'failoverHA',       label: 'Failover HA',          gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.failoverHA },
            { id: 'aaaRadius',        label: 'AAA RADIUS Server',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaaRadius },
        ]
    },
    'fortigate': {
        label: 'FortiGate', icon: 'fas fa-shield-alt', color: '#EE3124',
        types: [
            { id: 'interface', label: 'Interface',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.interface },
            { id: 'address',   label: 'Address Object',  gen: () => typeof FortiGate !== 'undefined' && FortiGate.address },
            { id: 'policy',    label: 'Security Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.policy },
            { id: 'nat',       label: 'NAT / VIP',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.nat },
            { id: 'ipsec',     label: 'IPSec VPN',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipsec },
            { id: 'sslvpn',     label: 'SSL-VPN',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.sslvpn },
            { id: 'secprofile', label: 'Security Profiles',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.secprofile },
            { id: 'sdwan',      label: 'SD-WAN',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.sdwan },
            { id: 'ha',         label: 'HA Active-Passive',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.ha },
            { id: 'vlanintf',   label: 'VLAN Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.vlanintf },
            { id: 'dhcp',       label: 'DHCP Server',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.dhcp },
            { id: 'ospf',       label: 'OSPF',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.ospf },
            { id: 'bgp',        label: 'BGP',                     gen: () => typeof FortiGate !== 'undefined' && FortiGate.bgp },
            { id: 'webfilter',  label: 'Web Filter Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.webfilter },
            { id: 'ips',        label: 'IPS Sensor',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.ips },
            { id: 'antivirus',  label: 'Anti-Virus Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.antivirus },
            { id: 'appcontrol', label: 'Application Control',     gen: () => typeof FortiGate !== 'undefined' && FortiGate.appcontrol },
            { id: 'dnsfilter',  label: 'DNS Filter',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.dnsfilter },
            { id: 'pbr',        label: 'Policy Route (PBR)',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.pbr },
            { id: 'ipv6',       label: 'IPv6 Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipv6 },
            { id: 'vdom',       label: 'VDOM',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.vdom },
            { id: 'haaa',       label: 'HA Active-Active',        gen: () => typeof FortiGate !== 'undefined' && FortiGate.haaa },
            { id: 'snmpv3',     label: 'SNMP v3',                 gen: () => typeof FortiGate !== 'undefined' && FortiGate.snmpv3 },
            { id: 'fswport',    label: 'FortiSwitch Port Profile', gen: () => typeof FortiGate !== 'undefined' && FortiGate.fswport },
        ]
    },
    'paloalto': {
        label: 'Palo Alto', icon: 'fas fa-fire', color: '#FA582D',
        types: [
            { id: 'zone',    label: 'Zone',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.zone },
            { id: 'address', label: 'Address Object',  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.address },
            { id: 'policy',  label: 'Security Policy', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.policy },
            { id: 'nat',     label: 'NAT',             gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.nat },
            { id: 'ipsec',      label: 'IPSec VPN',         gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ipsec },
            { id: 'threatprev', label: 'Threat Prevention', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.threatprev },
            { id: 'urlfilter',     label: 'URL Filtering',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.urlfilter },
            { id: 'globalprotect', label: 'GlobalProtect VPN',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.globalprotect },
            { id: 'ha',            label: 'HA Active-Passive',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ha },
            { id: 'interface',      label: 'Interface (L3/VLAN)',      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.interface },
            { id: 'staticroute',    label: 'Virtual Router + Route',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.staticroute },
            { id: 'ospf',           label: 'OSPF',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ospf },
            { id: 'bgp',            label: 'BGP',                      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.bgp },
            { id: 'vlan',           label: 'VLAN',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.vlan },
            { id: 'service',        label: 'Service Object',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.service },
            { id: 'customapp',      label: 'Custom Application',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.customapp },
            { id: 'secprofilegroup',label: 'Security Profile Group',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.secprofilegroup },
            { id: 'decryption',     label: 'Decryption Policy',        gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.decryption },
            { id: 'dos',            label: 'DoS Protection Policy',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.dos },
            { id: 'snmp',           label: 'SNMP v3',                  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.snmp },
            { id: 'panorama',       label: 'Panorama Device Group',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.panorama },
            { id: 'sdwan',          label: 'SD-WAN Path Selection',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.sdwan },
        ]
    },
    'checkpoint': {
        label: 'Check Point', icon: 'fas fa-shield-alt', color: '#CC3300',
        types: [
            { id: 'setup',        label: 'Gaia Initial Setup',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.setup },
            { id: 'interface',    label: 'Interface / Bond',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.interface },
            { id: 'route',        label: 'Static Route',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.route },
            { id: 'ospf',         label: 'OSPF',                     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ospf },
            { id: 'policy',       label: 'Security Rule (mgmt_cli)', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.policy },
            { id: 'nat',          label: 'NAT Rule (mgmt_cli)',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.nat },
            { id: 'bgp',          label: 'BGP',                      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.bgp },
            { id: 'vlanintf',     label: 'VLAN Interface',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vlanintf },
            { id: 'hostobj',      label: 'Host Object',              gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.hostobj },
            { id: 'netobj',       label: 'Network Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.netobj },
            { id: 'serviceobj',   label: 'Service Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.serviceobj },
            { id: 'clusterxl',    label: 'ClusterXL HA',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.clusterxl },
            { id: 'vsx',          label: 'VSX Virtual System',       gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vsx },
            { id: 's2svpn',       label: 'Site-to-Site VPN',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.s2svpn },
            { id: 'ravpn',        label: 'Remote Access VPN',        gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ravpn },
            { id: 'ips',          label: 'IPS Profile',              gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ips },
            { id: 'antibot',      label: 'Anti-Bot + Anti-Virus',    gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.antibot },
            { id: 'httpsinspect', label: 'HTTPS Inspection',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.httpsinspect },
            { id: 'logging',      label: 'Logging / SmartEvent',     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.logging },
            { id: 'snmp',         label: 'SNMP v3',                  gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.snmp },
        ]
    },
    'f5-ltm': {
        label: 'F5 BIG-IP LTM', icon: 'fas fa-balance-scale', color: '#E4002B',
        types: [
            { id: 'vserver',     label: 'Virtual Server',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.vserver },
            { id: 'pool',        label: 'Pool + Members',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.pool },
            { id: 'monitor',     label: 'Health Monitor',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.monitor },
            { id: 'ssl',         label: 'SSL Client Profile',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.ssl },
            { id: 'irule',       label: 'iRule',                gen: () => typeof F5LTM !== 'undefined' && F5LTM.irule },
            { id: 'persistence', label: 'Persistence Profile',  gen: () => typeof F5LTM !== 'undefined' && F5LTM.persistence },
            { id: 'ha',          label: 'HA (DSC)',             gen: () => typeof F5LTM !== 'undefined' && F5LTM.ha },
            { id: 'asm',         label: 'ASM WAF Policy',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.asm },
            { id: 'awaf',        label: 'Advanced WAF (AWAF)',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.awaf },
            { id: 'sslserver',   label: 'SSL Server Profile',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.sslserver },
            { id: 'snatpool',    label: 'SNAT Pool',              gen: () => typeof F5LTM !== 'undefined' && F5LTM.snatpool },
            { id: 'httpprofile', label: 'HTTP Profile',           gen: () => typeof F5LTM !== 'undefined' && F5LTM.httpprofile },
            { id: 'tcpprofile',  label: 'TCP Profile',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.tcpprofile },
            { id: 'routedomain', label: 'Route Domain (VRF)',     gen: () => typeof F5LTM !== 'undefined' && F5LTM.routedomain },
            { id: 'vlanself',    label: 'VLAN + Self IP',         gen: () => typeof F5LTM !== 'undefined' && F5LTM.vlanself },
            { id: 'trunk',       label: 'Trunk / LAG',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.trunk },
            { id: 'gslb',        label: 'DNS / GSLB',             gen: () => typeof F5LTM !== 'undefined' && F5LTM.gslb },
            { id: 'ltmpolicy',   label: 'LTM Traffic Policy',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.ltmpolicy },
            { id: 'apm',         label: 'APM Access Policy',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.apm },
            { id: 'asmtuning',   label: 'ASM Policy Tuning',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.asmtuning },
            { id: 'iapp',        label: 'iApp Deployment',        gen: () => typeof F5LTM !== 'undefined' && F5LTM.iapp },
        ]
    },
    'citrix-adc': {
        label: 'Citrix ADC', icon: 'fas fa-network-wired', color: '#007CC3',
        types: [
            { id: 'lbvserver',  label: 'LB vServer',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.lbvserver },
            { id: 'monitor',    label: 'Health Monitor',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.monitor },
            { id: 'ha',         label: 'HA Pair',              gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ha },
            { id: 'cs',         label: 'Content Switching',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cs },
            { id: 'responder',  label: 'Responder Policy',     gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.responder },
            { id: 'gslb',        label: 'GSLB',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.gslb },
            { id: 'sslvserver',  label: 'SSL Virtual Server',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslvserver },
            { id: 'rewrite',     label: 'Rewrite Policy/Action', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.rewrite },
            { id: 'ratelimit',   label: 'Rate Limiting',         gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ratelimit },
            { id: 'aaa',         label: 'AAA-TM',                gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.aaa },
            { id: 'cache',       label: 'Cache Policy',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cache },
            { id: 'compression', label: 'Compression Policy',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.compression },
            { id: 'waf',         label: 'AppFirewall (WAF)',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.waf },
            { id: 'sslcert',     label: 'SSL Certificate',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslcert },
            { id: 'snip',        label: 'SNIP + IP Config',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.snip },
            { id: 'vlan',        label: 'VLAN',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.vlan },
            { id: 'acl',         label: 'ACL Extended',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.acl },
        ]
    },
    'huawei-usg': {
        label: 'Huawei USG', icon: 'fas fa-fire-alt', color: '#CF0A2C',
        types: [
            { id: 'zone',       label: 'Security Zone',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.zone },
            { id: 'policy',     label: 'Security Policy',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.policy },
            { id: 'nat',        label: 'NAT',                   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.nat },
            { id: 'interface',  label: 'Interface + Zone',      gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.interface },
            { id: 'ipsec',      label: 'IPSec VPN IKEv2',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ipsec },
            { id: 'sslvpn',     label: 'SSL VPN',               gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.sslvpn },
            { id: 'antivirus',  label: 'Anti-Virus Profile',    gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.antivirus },
            { id: 'ips',        label: 'IPS Profile',           gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ips },
            { id: 'urlfilter',  label: 'URL Filtering',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.urlfilter },
            { id: 'appcontrol', label: 'Application Control',   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.appcontrol },
            { id: 'ha',         label: 'HA Dual-System',        gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ha },
            { id: 'dnsproxy',   label: 'DNS Transparent Proxy', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.dnsproxy },
        ]
    },
    'huawei-ce': {
        label: 'Huawei CloudEngine', icon: 'fas fa-cloud', color: '#A50034',
        types: [
            { id: 'vlan',        label: 'VLAN + Interface',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vlan },
            { id: 'ospf',        label: 'OSPF',                 gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.ospf },
            { id: 'bgp',         label: 'BGP',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bgp },
            { id: 'vxlan',       label: 'VXLAN / EVPN',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vxlan },
            { id: 'lacp',        label: 'LACP / Eth-Trunk',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.lacp },
            { id: 'mlag',        label: 'M-LAG',                gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.mlag },
            { id: 'bfd',         label: 'BFD',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bfd },
            { id: 'qos',         label: 'QoS MQC / DiffServ',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.qos },
            { id: 'snmpntp',     label: 'SNMP + NTP',           gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.snmpntp },
            { id: 'evpnsymirb',  label: 'EVPN Symmetric IRB',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.evpnsymirb },
            { id: 'routepolicy', label: 'Route Policy',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.routepolicy },
        ]
    },
    'referans': {
        label: 'Referans & Topoloji', icon: 'fas fa-book-open', color: '#6366F1',
        types: [
            { id: 'bgp',      label: 'BGP Topoloji',              gen: () => typeof CgReference !== 'undefined' && CgReference.bgp },
            { id: 'ospf',     label: 'OSPF Alan Mimarisi',        gen: () => typeof CgReference !== 'undefined' && CgReference.ospf },
            { id: 'mpls_vpn', label: 'MPLS L3VPN Mimarisi',       gen: () => typeof CgReference !== 'undefined' && CgReference.mpls_vpn },
            { id: 'ha',       label: 'Yüksek Erişilebilirlik',    gen: () => typeof CgReference !== 'undefined' && CgReference.ha },
            { id: 'nat',      label: 'NAT Tipleri',                gen: () => typeof CgReference !== 'undefined' && CgReference.nat },
            { id: 'ipsec',    label: 'IPsec VPN Modları',          gen: () => typeof CgReference !== 'undefined' && CgReference.ipsec },
            { id: 'vxlan',    label: 'VXLAN / EVPN',               gen: () => typeof CgReference !== 'undefined' && CgReference.vxlan },
            { id: 'lb',       label: 'Load Balancer Mimarisi',     gen: () => typeof CgReference !== 'undefined' && CgReference.lb },
            { id: 'certmap',  label: 'Sertifikasyon Haritası',     gen: () => typeof CgReference !== 'undefined' && CgReference.certmap },
        ]
    },
};

// ─── Type icon map ────────────────────────────────────────────────────────────
const CG_TYPE_ICONS = {
    vlan:            'fas fa-layer-group',
    acl:             'fas fa-filter',
    nat:             'fas fa-exchange-alt',
    'static-route':  'fas fa-route',
    ospf:            'fas fa-project-diagram',
    bgp:             'fas fa-sitemap',
    ipsec:           'fas fa-lock',
    dhcp:            'fas fa-broadcast-tower',
    snmp:            'fas fa-chart-line',
    aaa:             'fas fa-user-shield',
    tacacs:          'fas fa-user-lock',
    ssh:             'fas fa-terminal',
    password:        'fas fa-key',
    'vrrp-hsrp':     'fas fa-sync-alt',
    stp:             'fas fa-tree',
    'port-security': 'fas fa-shield-alt',
    qos:             'fas fa-tachometer-alt',
    gre:             'fas fa-arrows-alt-h',
    tracking:        'fas fa-heartbeat',
    'rate-limit':    'fas fa-stopwatch',
    advanced:        'fas fa-cogs',
    mpls:            'fas fa-tags',
    vpc:             'fas fa-clone',
    vxlan:           'fas fa-network-wired',
    span:            'fas fa-eye',
    basic:           'fas fa-sliders-h',
    security:        'fas fa-shield-alt',
    general:         'fas fa-tools',
    interface:       'fas fa-ethernet',
    route:           'fas fa-route',
    address:         'fas fa-address-card',
    policy:          'fas fa-clipboard-check',
    sslvpn:          'fas fa-user-lock',
    zone:            'fas fa-map-marked-alt',
    etherchannel:    'fas fa-link',
    dmvpn:           'fas fa-cloud-download-alt',
    eigrpnamed:      'fas fa-fast-forward',
    vrflite:         'fas fa-layer-group',
    l3vpn:           'fas fa-tags',
    routemap:        'fas fa-map-signs',
    portchannel:     'fas fa-plug',
    vlt:             'fas fa-clone',
    lacp:            'fas fa-link',
    mpls_vpn:        'fas fa-tags',
    ha:              'fas fa-heartbeat',
    lb:              'fas fa-balance-scale',
    certmap:         'fas fa-certificate',
    appfw:           'fas fa-shield-alt',
    vpn:             'fas fa-lock',
    setup:           'fas fa-cog',
    accessControl:    'fas fa-clipboard-check',
    intrusionPolicy:  'fas fa-bug',
    sslPolicy:        'fas fa-lock',
    siteToSiteVpn:    'fas fa-lock',
    raVpn:            'fas fa-user-lock',
    evpn:             'fas fa-network-wired',
    fabricPath:       'fas fa-project-diagram',
    syslog:           'fas fa-scroll',
    bgpEvpn:          'fas fa-sitemap',
    qosPolicy:        'fas fa-tachometer-alt',
    stormControl:     'fas fa-cloud-rain',
    mclag:            'fas fa-clone',
    routeMap:         'fas fa-map-signs',
    mpfServicePolicy: 'fas fa-cogs',
    failoverHA:       'fas fa-heartbeat',
    aaaRadius:        'fas fa-user-shield',
};

// ─── ConfigGenerator Controller ──────────────────────────────────────────────

const ConfigGenerator = {
    _vendor: null,
    _type:   null,

    init() {
        const root = document.getElementById('config-generator-root');
        if (!root) return;
        root.innerHTML = this._renderShell();
        this._bindSidebar();
        this._bindTopTabs();
    },

    _bindTopTabs() {
        document.querySelectorAll('.cg-top-tab').forEach(btn => {
            btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
        });
    },

    _switchTab(tab) {
        document.querySelectorAll('.cg-top-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        document.getElementById('cg-tab-generator').style.display = tab === 'generator' ? '' : 'none';
        document.getElementById('cg-tab-converter').style.display = tab === 'converter' ? '' : 'none';
        if (tab === 'converter') {
            const convEl = document.getElementById('cg-tab-converter');
            if (typeof ConfigConverter !== 'undefined') ConfigConverter.render(convEl);
            else convEl.innerHTML = '<div class="cg-welcome"><div class="cg-welcome-ico"><i class="fas fa-exchange-alt"></i></div>'
                + '<h5>Dönüştürücü</h5><p>Bu özellik henüz eklenmedi.</p></div>';
        }
    },

    _renderShell() {
        const vendorBtns = Object.entries(CG_REGISTRY).map(([id, v]) => `
            <button class="fa-tab" data-vendor="${id}">
                <i class="${cgEsc(v.icon)}" style="color:${cgEsc(v.color)}"></i>
                <span>${cgEsc(v.label)}</span>
                <span class="fa-tab-badge" style="background:#64748b">${v.types.length}</span>
            </button>`).join('');

        return `
            <div class="cg-page-hd">
                <h2><i class="fas fa-tools"></i> Config Generator
                    <span class="cg-subtitle">Network Platform Configuration Templates</span>
                </h2>
                <div class="cg-top-tabs">
                    <button class="cg-top-tab active" data-tab="generator"><i class="fas fa-terminal"></i> Generator</button>
                    <button class="cg-top-tab" data-tab="converter"><i class="fas fa-exchange-alt"></i> Dönüştürücü</button>
                </div>
            </div>
            <div id="cg-tab-generator">
            <div class="fa-layout" style="border:1px solid var(--border-color,#e0e4ea);border-top:none;border-radius:0 0 8px 8px;background:var(--card-bg,#fff)">
                <nav class="fa-sidebar cg-vendor-sidebar">
                    <div class="fa-sidebar-group">
                        <div class="fa-sidebar-label">Platforms</div>
                        ${vendorBtns}
                    </div>
                </nav>
                <nav class="fa-sidebar cg-type-sidebar" id="cg-type-nav" style="display:none">
                    <div class="cg-type-search-box">
                        <i class="fas fa-search"></i>
                        <input type="text" id="cg-type-filter" placeholder="Ara..." autocomplete="off"
                               oninput="ConfigGenerator._filterTypes(this.value)">
                    </div>
                    <div class="fa-sidebar-group">
                        <div class="fa-sidebar-label" id="cg-type-label">Config Tipi</div>
                        <div id="cg-type-list"></div>
                    </div>
                </nav>
                <div class="fa-main-content" id="cg-content" style="padding:20px">
                    <div class="cg-welcome">
                        <div class="cg-welcome-ico"><i class="fas fa-terminal"></i></div>
                        <h5>Config Generator</h5>
                        <p>Sol panelden bir ağ platformu seçin</p>
                    </div>
                </div>
            </div>
            </div>
            <div id="cg-tab-converter" style="display:none;padding:16px 0"></div>`;
    },

    _bindSidebar() {
        document.querySelectorAll('.cg-vendor-sidebar .fa-tab').forEach(btn => {
            btn.addEventListener('click', () => this._selectVendor(btn.dataset.vendor));
        });
    },

    _selectVendor(vendorId) {
        document.querySelectorAll('.cg-vendor-sidebar .fa-tab').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.cg-vendor-sidebar .fa-tab[data-vendor="${vendorId}"]`);
        if (btn) btn.classList.add('active');
        this._vendor = vendorId;
        this._type = null;
        this._renderTypeList(vendorId);
        document.getElementById('cg-content').innerHTML = `
            <div class="cg-welcome">
                <div class="cg-welcome-ico"><i class="fas fa-list-ul"></i></div>
                <h5>${cgEsc(CG_REGISTRY[vendorId]?.label || '')}</h5>
                <p>Config tipini sol panelden seçin</p>
            </div>`;
    },

    _renderTypeList(vendorId) {
        const vendor = CG_REGISTRY[vendorId];
        if (!vendor) return;
        const nav   = document.getElementById('cg-type-nav');
        const list  = document.getElementById('cg-type-list');
        const label = document.getElementById('cg-type-label');
        const filt  = document.getElementById('cg-type-filter');
        nav.style.display = '';
        if (label) label.textContent = vendor.label;
        if (filt)  filt.value = '';
        list.innerHTML = vendor.types.map(t => {
            const icon   = CG_TYPE_ICONS[t.id] || 'fas fa-code';
            const isStub = !t.gen() || typeof t.gen().init !== 'function';
            return `<button class="fa-tab${isStub ? ' cg-stub' : ''}"
                        data-type="${t.id}" data-label="${cgEsc(t.label)}"
                        ${isStub ? 'disabled title="Yakında eklenecek"' : ''}>
                        <i class="${icon}"></i><span>${cgEsc(t.label)}</span>
                    </button>`;
        }).join('');
        list.querySelectorAll('.fa-tab:not(.cg-stub)').forEach(btn => {
            btn.addEventListener('click', () => {
                list.querySelectorAll('.fa-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._type = btn.dataset.type;
                this._loadGenerator(vendorId, this._type);
            });
        });
    },

    _filterTypes(q) {
        const term = (q || '').toLowerCase();
        document.querySelectorAll('#cg-type-list .fa-tab').forEach(btn => {
            btn.style.display = (btn.dataset.label || '').toLowerCase().includes(term) ? '' : 'none';
        });
    },

    _loadGenerator(vendorId, typeId) {
        const vendor  = CG_REGISTRY[vendorId];
        const typeObj = vendor?.types.find(t => t.id === typeId);
        const gen     = typeObj?.gen();
        const content = document.getElementById('cg-content');
        if (!content) return;
        if (!gen || typeof gen.init !== 'function') {
            content.innerHTML = `<div class="alert alert-warning"><i class="fas fa-clock me-2"></i>Bu generator henüz tamamlanmadı.</div>`;
            return;
        }
        content.innerHTML = '<div id="cg-form-area"></div><div id="cg-output-area" class="mt-3"></div>';
        const formArea = document.getElementById('cg-form-area');
        gen.init(formArea);
        cgPostRender(formArea);
    },
};
