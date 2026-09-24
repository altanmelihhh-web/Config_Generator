'use strict';

const CiscoIOS = {};

// ── VLAN ──────────────────────────────────────────────────────────────────────
CiscoIOS.vlan = {
    label: 'VLAN',
    init(container) {
        container.innerHTML = `
<div class="cg-topic-box">
  <div class="cg-topic-box-icon"><i class="fas fa-network-wired"></i></div>
  <div class="cg-topic-box-content">
    <h6>VLAN — Virtual Local Area Network</h6>
    <p>Fiziksel ağı mantıksal bölümlere ayırarak güvenlik, performans ve yönetim kolaylığı sağlar. Her VLAN ayrı bir broadcast domain'dir. <strong>Access portlar</strong> tek bir VLAN'a, <strong>trunk portlar</strong> birden fazla VLAN'a hizmet eder.</p>
  </div>
</div>
<form id="cgVlanForm">
  <div class="cg-section">
    <div class="cg-section-title"><i class="fas fa-th-large"></i> Yapılandırma Tipi</div>
    <div class="row g-3 mb-1">
      <div class="col-md-4">
        <div class="gen-type-card-enhanced" onclick="cgVlanSelectType('basic',this)">
          <span class="cg-card-badge recommended">En Yaygın</span>
          <i class="fas fa-ethernet card-icon"></i>
          Tek Port VLAN
          <div class="card-desc">Tek interface'e VLAN ata — access veya trunk modu</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="gen-type-card-enhanced" onclick="cgVlanSelectType('batch',this)">
          <span class="cg-card-badge common">Toplu</span>
          <i class="fas fa-layer-group card-icon"></i>
          Toplu VLAN
          <div class="card-desc">Birden fazla VLAN'ı tek seferde oluştur</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="gen-type-card-enhanced" onclick="cgVlanSelectType('svi',this)">
          <span class="cg-card-badge advanced">Gelişmiş</span>
          <i class="fas fa-sitemap card-icon"></i>
          SVI Arayüzü
          <div class="card-desc">Layer-3 VLAN arayüzü — inter-VLAN routing</div>
        </div>
      </div>
    </div>
    <input type="hidden" name="config_type" id="cgVlanConfigType" value="">
  </div>

  <div id="cgVlanBasic" style="display:none">
    <div class="cg-section">
      <div class="cg-section-title"><i class="fas fa-id-card"></i> VLAN Kimliği</div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">VLAN ID <span class="text-danger">*</span></label>
        <div class="col-sm-9">
          <input type="number" name="vlan_id" id="cgVlanId" class="form-control" min="1" max="4094" placeholder="Örn: 10" required>
          <span class="cg-field-hint">1–4094 arası bir değer girin. 1002–1005 rezerve, 4095 dahili kullanım için ayrılmıştır.</span>
        </div>
      </div>
      <div class="mb-2 row">
        <label class="col-sm-3 col-form-label">VLAN Adı <span class="cg-opt">Opsiyonel</span></label>
        <div class="col-sm-9">
          <input type="text" name="vlan_name" id="cgVlanName" class="form-control" placeholder="Örn: SALES_VLAN">
          <span class="cg-field-hint">Açıklayıcı bir isim girin. Boşluk yerine alt çizgi (_) kullanın. Örn: MUHASEBE_VLAN</span>
        </div>
      </div>
    </div>
    <div class="cg-section">
      <div class="cg-section-title"><i class="fas fa-plug"></i> Interface Ayarları</div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">Interface <span class="text-danger">*</span>
          <span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">GigabitEthernet0/1, FastEthernet0/1 veya kısa gösterim Gi0/1 kullanılabilir. Cisco cihazlarda her ikisi de geçerlidir.</span></span>
        </label>
        <div class="col-sm-9">
          <input type="text" name="interface" id="cgVlanIface" class="form-control" placeholder="Örn: GigabitEthernet0/1" required>
          <span class="cg-field-hint">VLAN'ın atanacağı fiziksel port. Gi0/1 kısa gösterimi de kullanılabilir.</span>
        </div>
      </div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">Switchport Mode
          <span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">Access: Tek VLAN, son kullanıcı portları için. Trunk: Çoklu VLAN, switch-switch veya switch-router arası bağlantı için kullanılır.</span></span>
        </label>
        <div class="col-sm-9">
          <select name="sw_mode" id="cgVlanMode" class="form-select" onchange="cgVlanModeChange()">
            <option value="access">Access — Tek VLAN (son kullanıcı portu)</option>
            <option value="trunk">Trunk — Çoklu VLAN (switch/router arası)</option>
          </select>
          <span class="cg-field-hint">Access: bilgisayar/yazıcı gibi son cihazlar için. Trunk: iki switch veya switch-router arasındaki bağlantı için.</span>
        </div>
      </div>
      <div id="cgVlanAccessFields">
        <div class="mb-2 row">
          <label class="col-sm-3 col-form-label">Access VLAN <span class="text-danger">*</span></label>
          <div class="col-sm-9">
            <input type="number" name="access_vlan" id="cgVlanAccessVlan" class="form-control" min="1" max="4094" placeholder="Örn: 10" required>
            <span class="cg-field-hint">Bu porta atanacak VLAN numarası (1–4094). Porttan gelen trafik bu VLAN'a ait sayılır.</span>
          </div>
        </div>
      </div>
      <div id="cgVlanTrunkFields" style="display:none">
        <div class="mb-3 row">
          <label class="col-sm-3 col-form-label">Allowed VLANs <span class="cg-opt">Opsiyonel</span>
            <span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">Boş bırakılırsa tüm VLAN'lara izin verilir. Yalnızca belirli VLAN'lar geçirilecekse: 10,20,30-40 formatını kullanın.</span></span>
          </label>
          <div class="col-sm-9">
            <input type="text" name="allowed_vlans" id="cgVlanAllowed" class="form-control" placeholder="Örn: 10,20,30-40">
            <span class="cg-field-hint">Boş = tüm VLAN'lara izin ver. Seçici erişim için virgül ve tire kullanın: 10,20,100-200</span>
          </div>
        </div>
        <div class="cg-warn-box mb-2"><i class="fas fa-exclamation-triangle"></i><span>Native VLAN 1 güvenlik riski oluşturabilir. Trunk portlarda farklı bir Native VLAN kullanmanız önerilir.</span></div>
      </div>
    </div>
    <div class="cg-section">
      <div class="cg-section-title"><i class="fas fa-sliders-h"></i> Ek Seçenekler</div>
      <div class="mb-3 form-check">
        <input type="checkbox" name="portfast" id="cgVlanPortfast" class="form-check-input">
        <label class="form-check-label" for="cgVlanPortfast">
          PortFast etkinleştir
          <span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">STP convergence süresini atlayarak portu hızlı aktif eder. SADECE son kullanıcı portlarında (bilgisayar, yazıcı) kullanın — switch-switch bağlantısında döngüye neden olur.</span></span>
        </label>
      </div>
      <div class="form-check">
        <input type="checkbox" name="save_config" id="cgVlanSave" class="form-check-input" checked>
        <label class="form-check-label" for="cgVlanSave">write memory ekle <span style="font-size:12px;color:#6b7280">(konfigürasyonu NVRAM'e kalıcı kaydet)</span></label>
      </div>
    </div>
  </div>

  <div id="cgVlanBatch" style="display:none">
    <div class="cg-section">
      <div class="cg-section-title"><i class="fas fa-list-ol"></i> Toplu VLAN Oluşturma</div>
      <div class="cg-info-callout mb-4"><i class="fas fa-info-circle"></i><span>Bu mod, birden fazla VLAN'ı tek komutla oluşturmak için kullanılır. Virgülle ayırın veya aralık için tire (-) kullanın.</span></div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">VLAN ID Listesi <span class="text-danger">*</span></label>
        <div class="col-sm-9">
          <input type="text" name="batch_vlans" id="cgVlanBatchIds" class="form-control" placeholder="Örn: 10,20,30-40,100" required>
          <span class="cg-field-hint">Virgülle ayırın, aralık için tire kullanın. Örn: 10,20,30-40,100</span>
        </div>
      </div>
      <div class="mb-2 row">
        <label class="col-sm-3 col-form-label">İsim Öneki <span class="cg-opt">Opsiyonel</span></label>
        <div class="col-sm-9">
          <input type="text" name="batch_prefix" id="cgVlanBatchPrefix" class="form-control" placeholder="Örn: DATA_VLAN_">
          <span class="cg-field-hint">Her VLAN'ın adına eklenecek ön ek. VLAN ID otomatik eklenir: DATA_VLAN_10, DATA_VLAN_20...</span>
        </div>
      </div>
    </div>
  </div>

  <div id="cgVlanSvi" style="display:none">
    <div class="cg-section">
      <div class="cg-section-title"><i class="fas fa-sitemap"></i> SVI — Layer-3 VLAN Arayüzü</div>
      <div class="cg-info-callout mb-4"><i class="fas fa-info-circle"></i><span>SVI (Switched Virtual Interface), switch üzerinde Layer-3 routing için VLAN'a IP adresi atamak amacıyla kullanılır. Inter-VLAN routing için her VLAN'ın bir SVI'ya ihtiyacı vardır.</span></div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">VLAN ID <span class="text-danger">*</span></label>
        <div class="col-sm-9">
          <input type="number" name="svi_vlan" id="cgVlanSviId" class="form-control" min="1" max="4094" placeholder="Örn: 10" required>
          <span class="cg-field-hint">SVI arayüzü oluşturulacak VLAN numarası. Bu VLAN switch'te tanımlı olmalıdır.</span>
        </div>
      </div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">IP Adresi <span class="text-danger">*</span></label>
        <div class="col-sm-9">
          <input type="text" name="svi_ip" id="cgVlanSviIp" class="form-control" placeholder="Örn: 192.168.10.1" required>
          <span class="cg-field-hint">Bu VLAN'ın default gateway IP adresi. VLAN içindeki cihazların gateway'i bu adres olacak.</span>
        </div>
      </div>
      <div class="mb-4 row">
        <label class="col-sm-3 col-form-label">Subnet Mask <span class="text-danger">*</span></label>
        <div class="col-sm-9">
          <input type="text" name="svi_mask" id="cgVlanSviMask" class="form-control" placeholder="Örn: 255.255.255.0" required>
          <span class="cg-field-hint">Subnet mask değeri. Örn: /24 için 255.255.255.0, /25 için 255.255.255.128</span>
        </div>
      </div>
      <div class="mb-2 row">
        <label class="col-sm-3 col-form-label">Açıklama <span class="cg-opt">Opsiyonel</span></label>
        <div class="col-sm-9">
          <input type="text" name="svi_desc" id="cgVlanSviDesc" class="form-control" placeholder="Örn: SALES VLAN Gateway">
          <span class="cg-field-hint">Interface description olarak eklenir. Yönetim kolaylığı için açıklayıcı bir metin yazın.</span>
        </div>
      </div>
    </div>
  </div>

  <button type="submit" class="btn btn-primary" id="cgVlanSubmit" style="display:none">
    <i class="fas fa-code"></i> VLAN Konfigürasyonu Oluştur
  </button>
</form>`;
        document.getElementById('cgVlanForm').addEventListener('submit', e => {
            e.preventDefault();
            if (!cgValidate(e.target)) return;
            const cfg = cgVlanGenerate();
            cgShowOutput(cfg.config, cfg.warnings);
        });
    }
};

function cgVlanSelectType(type, el) {
    document.querySelectorAll('#cgVlanForm .gen-type-card-enhanced').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
    document.getElementById('cgVlanConfigType').value = type;
    ['cgVlanBasic','cgVlanBatch','cgVlanSvi'].forEach(id => { const s = document.getElementById(id); if (s) s.style.display = 'none'; });
    const map = { basic:'cgVlanBasic', batch:'cgVlanBatch', svi:'cgVlanSvi' };
    const target = document.getElementById(map[type]);
    if (target) target.style.display = '';
    document.getElementById('cgVlanSubmit').style.display = '';
    const f = document.getElementById('cgVlanForm');
    f.querySelectorAll('[name="vlan_id"],[name="interface"],[name="access_vlan"]').forEach(i => i.required = (type === 'basic'));
    f.querySelectorAll('[name="batch_vlans"]').forEach(i => i.required = (type === 'batch'));
    f.querySelectorAll('[name="svi_vlan"],[name="svi_ip"],[name="svi_mask"]').forEach(i => i.required = (type === 'svi'));
}

function cgVlanModeChange() {
    const mode = document.getElementById('cgVlanMode').value;
    document.getElementById('cgVlanAccessFields').style.display = (mode === 'access') ? '' : 'none';
    document.getElementById('cgVlanTrunkFields').style.display  = (mode === 'trunk')  ? '' : 'none';
    document.getElementById('cgVlanAccessVlan').required = (mode === 'access');
}

function cgVlanGenerate() {
    const f = document.getElementById('cgVlanForm');
    const fv = n => (f.querySelector('[name="' + n + '"]')?.value ?? '').trim();
    const type = fv('config_type');
    const warnings = [];
    let config = '! ========================================\n! Cisco IOS VLAN Configuration\n! ========================================\n\n';
    if (type === 'basic') {
        const vlanId = fv('vlan_id'), vlanName = fv('vlan_name'), iface = fv('interface'), mode = fv('sw_mode');
        config += 'vlan ' + vlanId + '\n';
        if (vlanName) config += ' name ' + vlanName.replace(/\s+/g,'_') + '\n';
        config += '!\ninterface ' + iface + '\n';
        if (mode === 'access') {
            config += ' switchport mode access\n switchport access vlan ' + fv('access_vlan') + '\n';
            if (f.querySelector('[name="portfast"]')?.checked) { config += ' spanning-tree portfast\n'; warnings.push('PortFast sadece son kullanıcı portlarında kullanılmalı.'); }
        } else {
            const allowed = fv('allowed_vlans');
            config += ' switchport mode trunk\n switchport trunk encapsulation dot1q\n';
            if (allowed) config += ' switchport trunk allowed vlan ' + allowed + '\n';
            warnings.push('Native VLAN 1 güvenlik riski — farklı bir Native VLAN kullanın.');
        }
        config += ' no shutdown\n!\n';
        if (f.querySelector('[name="save_config"]')?.checked) config += 'write memory\n';
        config += '\n! Doğrulama:\n! show vlan brief\n! show interfaces trunk\n! show interfaces ' + iface + ' switchport\n';
    } else if (type === 'batch') {
        const parts = fv('batch_vlans').split(',').map(s => s.trim()).filter(Boolean);
        const prefix = fv('batch_prefix');
        parts.forEach(p => {
            const m = p.match(/^(\d+)-(\d+)$/);
            if (m) { for (let i = parseInt(m[1]); i <= parseInt(m[2]); i++) config += 'vlan ' + i + '\n' + (prefix ? ' name ' + prefix + i + '\n' : '') + '!\n'; }
            else config += 'vlan ' + p + '\n' + (prefix ? ' name ' + prefix + p + '\n' : '') + '!\n';
        });
        config += '\n! Doğrulama: show vlan brief\n';
    } else if (type === 'svi') {
        const sviId = fv('svi_vlan'), sviIp = fv('svi_ip'), sviMask = fv('svi_mask'), sviDesc = fv('svi_desc');
        // Aynı VLAN/SVI kuralı Dönüştürücü sekmesiyle paylaşılıyor (bkz. ConfigConverter_IR.js ccBuildCiscoVlanBlock)
        // — iki sekme farklı çıktı üretmesin diye.
        config += ccBuildCiscoVlanBlock({ id: sviId, name: '', svi_ip: sviIp, svi_mask: sviMask, desc: sviDesc }, []);
        config += 'ip routing\n';
        config += '\n! Doğrulama:\n! show interface Vlan' + sviId + '\n! show ip route\n';
    }
    return { config, warnings };
}

// ── ACL ───────────────────────────────────────────────────────────────────────
CiscoIOS.acl = {
    label: 'ACL',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-filter',
                title: 'ACL — Access Control List',
                desc: 'Ağ trafiğini kaynak/hedef IP, port ve protokole göre filtreler. <strong>Standard ACL</strong> yalnızca kaynağa, <strong>Extended ACL</strong> kaynak+hedef+port\'a göre filtreler.'
            },
            configTypes: [
                { id: 'standard', label: 'Standard ACL', icon: 'fas fa-list', desc: 'Kaynak IP filtresi (1-99)', badge: { text: 'Basit', cls: 'common' } },
                { id: 'extended', label: 'Extended ACL', icon: 'fas fa-filter', desc: 'Kaynak + Hedef + Port filtresi (100-199)', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'named', label: 'Named Extended', icon: 'fas fa-tag', desc: 'İsimli gelişmiş ACL — okunabilir ve düzenlenebilir', badge: { text: 'Esnek', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'ACL Kimliği',
                    icon: 'fas fa-id-card',
                    showFor: ['standard', 'extended', 'named'],
                    fields: [
                        { name: 'acl_name', label: 'ACL Ad / Numara', type: 'text', required: true, placeholder: 'ACL_PERMIT_WEB veya 100', hint: 'Standard: 1-99, Extended: 100-199, Named: metin isim' }
                    ]
                },
                {
                    title: 'Kural Parametreleri',
                    icon: 'fas fa-sliders-h',
                    showFor: ['standard', 'extended', 'named'],
                    fields: [
                        { name: 'acl_action', label: 'Aksiyon', type: 'select', required: true, options: [{ value: 'permit', label: 'permit — İzin ver' }, { value: 'deny', label: 'deny — Engelle' }] },
                        { name: 'protocol', label: 'Protokol', type: 'select', options: [{ value: 'ip', label: 'ip (tüm protokoller)' }, { value: 'tcp', label: 'tcp' }, { value: 'udp', label: 'udp' }, { value: 'icmp', label: 'icmp' }] },
                        { name: 'src_ip', label: 'Kaynak IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.0', hint: 'Kaynak ağ adresi veya host IP' },
                        { name: 'src_wild', label: 'Kaynak Wildcard', type: 'text', placeholder: '0.0.0.255', hint: 'Boş bırakılırsa 0.0.0.0 (host) kullanılır' }
                    ]
                },
                {
                    title: 'Hedef ve Port (Extended/Named)',
                    icon: 'fas fa-bullseye',
                    showFor: ['extended', 'named'],
                    info: 'Standard ACL yalnızca kaynağa göre filtreler, bu alanlar Standard için kullanılmaz.',
                    fields: [
                        { name: 'dst_ip', label: 'Hedef IP', type: 'text', validate: 'ip', placeholder: '10.0.0.10 (boş = any)', hint: 'Boş bırakılırsa hedef "any" olur' },
                        { name: 'dst_wild', label: 'Hedef Wildcard', type: 'text', placeholder: '0.0.0.0', hint: 'Boş bırakılırsa 0.0.0.0 (host) kullanılır' },
                        { name: 'src_port', label: 'Kaynak Port (opsiyonel)', type: 'text', placeholder: 'eq 1024 (yalnızca tcp/udp)', hint: 'Örn: eq 1024, gt 1023' },
                        { name: 'dst_port', label: 'Hedef Port (opsiyonel)', type: 'text', placeholder: 'eq 443 (yalnızca tcp/udp)', hint: 'Örn: eq 443, range 8000 8080' }
                    ]
                },
                {
                    title: 'Interface Uygulaması',
                    icon: 'fas fa-plug',
                    showFor: ['standard', 'extended', 'named'],
                    info: 'Interface belirtilmezse ACL yalnızca tanımlanır, uygulanmaz.',
                    fields: [
                        { name: 'iface', label: 'Interface', type: 'text', placeholder: 'GigabitEthernet0/0 (boş = uygulama yok)', hint: 'ACL\'in uygulanacağı interface. Boş bırakılabilir.' },
                        { name: 'direction', label: 'Yön', type: 'select', options: [{ value: 'in', label: 'in — Gelen trafik' }, { value: 'out', label: 'out — Giden trafik' }] }
                    ]
                }
            ],
            submit: 'ACL Konfigürasyonu Oluştur'
        }, (data) => {
            const type  = data.acl_name && isNaN(data.acl_name) ? 'named' : (data._cgtype || 'standard');
            const name  = data.acl_name;
            const action = data.acl_action;
            const proto  = data.protocol || 'ip';
            const src    = data.src_ip;
            const wild   = data.src_wild || '0.0.0.0';
            const iface  = data.iface;
            const dir    = data.direction || 'in';
            let config = '! ========================================\n! Cisco IOS ACL Configuration\n! ========================================\n\n';
            if (data._cgtype === 'named' || isNaN(name)) {
                // Extended/Named ACL: aynı 5-tuple satırı Dönüştürücü'nün ccFormatAclEntryWildcard'ı ile paylaşılıyor,
                // yalnızca "kaynak" yazan eski davranış burada terk edildi.
                const srcAddr = wild === '0.0.0.0' ? 'host ' + src : src + ' ' + wild;
                const dstIp   = data.dst_ip;
                const dstWild = data.dst_wild || '0.0.0.0';
                const dstAddr = dstIp ? (dstWild === '0.0.0.0' ? 'host ' + dstIp : dstIp + ' ' + dstWild) : 'any';
                config += 'ip access-list extended ' + name + '\n';
                config += ' ' + ccFormatAclEntryWildcard({ action, proto, src: srcAddr, dst: dstAddr, src_port: data.src_port, dst_port: data.dst_port }) + '\n';
                config += ' deny ip any any log\n!\n';
            } else {
                config += 'access-list ' + name + ' ' + action + ' ' + src + ' ' + wild + '\n!\n';
            }
            if (iface) {
                config += 'interface ' + iface + '\n';
                config += ' ip access-group ' + name + ' ' + dir + '\n!\n';
            }
            config += '! Doğrulama:\n! show ip access-lists ' + name + '\n! show interfaces ' + (iface || '<iface>') + ' | include access list\n';
            return config;
        });
    }
};

// ── NAT / PAT ─────────────────────────────────────────────────────────────────
CiscoIOS.nat = {
    label: 'NAT / PAT',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'NAT — Network Address Translation',
                desc: 'Özel IP adreslerini genel IP\'lere çevirir. <strong>Static NAT</strong>: 1-1 eşleme. <strong>Dynamic NAT</strong>: havuzdan atama. <strong>PAT (Overload)</strong>: tek IP üzerinde port bazlı çoğullama.'
            },
            configTypes: [
                { id: 'pat', label: 'PAT / Overload', icon: 'fas fa-compress-arrows-alt', desc: 'Tek genel IP ile tüm iç ağ — en yaygın kullanım', badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'static', label: 'Static NAT', icon: 'fas fa-arrows-alt-h', desc: '1:1 IP eşleme — sunucu erişimi için', badge: { text: 'Sunucu', cls: 'common' } },
                { id: 'dynamic', label: 'Dynamic NAT', icon: 'fas fa-random', desc: 'IP havuzundan dinamik atama', badge: { text: 'Havuz', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Interface Ayarları',
                    icon: 'fas fa-plug',
                    showFor: ['pat', 'static', 'dynamic'],
                    fields: [
                        { name: 'inside_if', label: 'Inside Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/1', hint: 'İç ağa bağlı interface — ip nat inside uygulanır' },
                        { name: 'outside_if', label: 'Outside Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'İnternet/WAN interface — ip nat outside uygulanır' }
                    ]
                },
                {
                    title: 'PAT / Dynamic NAT Parametreleri',
                    icon: 'fas fa-network-wired',
                    showFor: ['pat', 'dynamic'],
                    fields: [
                        { name: 'inside_net', label: 'Inside Network', type: 'text', required: true, placeholder: '192.168.1.0', hint: 'NAT uygulanacak iç ağ adresi' },
                        { name: 'inside_wild', label: 'Wildcard Mask', type: 'text', placeholder: '0.0.0.255', hint: 'Boş bırakılırsa 0.0.0.255 kullanılır' }
                    ]
                },
                {
                    title: 'Static NAT Parametreleri',
                    icon: 'fas fa-arrows-alt-h',
                    showFor: ['static'],
                    fields: [
                        { name: 'local_ip', label: 'Local IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.10', hint: 'Sunucunun iç (özel) IP adresi' },
                        { name: 'global_ip', label: 'Global IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.5', hint: 'Dışarıdan erişilecek genel IP adresi' }
                    ]
                },
                {
                    title: 'Dynamic NAT Pool',
                    icon: 'fas fa-layer-group',
                    showFor: ['dynamic'],
                    info: 'Havuz aralığı gerçek, size ait genel IP bloğu olmalı — örnek/placeholder IP kullanmayın.',
                    fields: [
                        { name: 'pool_start', label: 'Pool Başlangıç IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.1', hint: 'Havuzdaki ilk genel IP' },
                        { name: 'pool_end', label: 'Pool Bitiş IP', type: 'text', required: true, validate: 'ip', placeholder: '203.0.113.10', hint: 'Havuzdaki son genel IP' },
                        { name: 'pool_mask', label: 'Pool Netmask', type: 'text', required: true, validate: 'subnet', placeholder: '255.255.255.240', hint: 'Genel IP bloğunun subnet maskı' }
                    ]
                }
            ],
            submit: 'NAT Konfigürasyonu Oluştur'
        }, (data) => {
            const type    = data._cgtype;
            const inside  = data.inside_if;
            const outside = data.outside_if;
            let config = '! ========================================\n! Cisco IOS NAT Configuration\n! ========================================\n\n';
            config += 'interface ' + inside + '\n ip nat inside\n!\ninterface ' + outside + '\n ip nat outside\n!\n';
            if (type === 'pat') {
                const net  = data.inside_net;
                const wild = data.inside_wild || '0.0.0.255';
                config += 'ip access-list extended NAT_ACL\n permit ip ' + net + ' ' + wild + ' any\n!\n';
                config += 'ip nat inside source list NAT_ACL interface ' + outside + ' overload\n';
            } else if (type === 'static') {
                config += 'ip nat inside source static ' + data.local_ip + ' ' + data.global_ip + '\n';
            } else {
                const net  = data.inside_net;
                const wild = data.inside_wild || '0.0.0.255';
                config += 'ip nat pool NAT_POOL ' + data.pool_start + ' ' + data.pool_end + ' netmask ' + data.pool_mask + '\n';
                config += 'ip access-list extended NAT_ACL\n permit ip ' + net + ' ' + wild + ' any\n!\n';
                config += 'ip nat inside source list NAT_ACL pool NAT_POOL\n';
            }
            config += '\n! Doğrulama:\n! show ip nat translations\n! show ip nat statistics\n';
            return config;
        });
    }
};

// ── STATIC ROUTE ──────────────────────────────────────────────────────────────
CiscoIOS.route = {
    label: 'Static Route',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-route',
                title: 'Static Route — Statik Yönlendirme',
                desc: 'Manuel olarak tanımlanmış ağ yolları. Dinamik routing protokolü olmayan küçük ağlarda veya varsayılan rota (default route) tanımlamak için kullanılır.'
            },
            sections: [
                {
                    title: 'Rota Parametreleri',
                    icon: 'fas fa-map-signs',
                    fields: [
                        { name: 'is_default', label: 'Default route ekle (0.0.0.0/0)', type: 'checkbox', hint: 'İşaretlenirse hedef ağ/mask otomatik 0.0.0.0 olur' },
                        { name: 'dest', label: 'Hedef Ağ', type: 'text', placeholder: '10.0.0.0', hint: 'Ulaşılmak istenen hedef ağ adresi' },
                        { name: 'mask', label: 'Subnet Mask', type: 'text', validate: 'subnet', placeholder: '255.255.255.0', hint: 'Hedef ağın subnet maskı' },
                        { name: 'nexthop', label: 'Next Hop / Interface', type: 'text', validate: 'ip', required: true, placeholder: '192.168.1.1 veya GigabitEthernet0/0', hint: 'Paketlerin yönlendirileceği sonraki IP veya çıkış interface' },
                        { name: 'ad', label: 'Administrative Distance', type: 'number', placeholder: '1 (varsayılan)', min: 1, max: 255, hint: 'Düşük değer = öncelikli. Floating route için yüksek değer (örn: 254) girin' }
                    ]
                }
            ],
            submit: 'Static Route Oluştur'
        }, (data) => {
            const isDefault = data.is_default === true;
            const dest = isDefault ? '0.0.0.0' : (data.dest || '');
            const mask = isDefault ? '0.0.0.0' : (data.mask || '');
            const hop  = data.nexthop;
            const ad   = data.ad;
            let config = '! ========================================\n! Cisco IOS Static Route\n! ========================================\n\n';
            config += ccBuildCiscoStaticRouteLine(dest, mask, hop, ad);
            config += '\n! Doğrulama:\n! show ip route\n! show ip route ' + dest + '\n';
            return config;
        });
    }
};

// ── OSPF ──────────────────────────────────────────────────────────────────────
CiscoIOS.ospf = {
    label: 'OSPF',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-project-diagram',
                title: 'OSPF — Open Shortest Path First',
                desc: 'Open Shortest Path First — link-state routing protokolü. Büyük ağlarda hızlı convergence ve hiyerarşik area yapısı sağlar.'
            },
            sections: [
                {
                    title: 'OSPF Parametreleri',
                    icon: 'fas fa-cog',
                    fields: [
                        { name: 'pid', label: 'Process ID', type: 'number', required: true, value: '1', min: 1, max: 65535, hint: 'Lokal anlamlı — farklı router\'larda aynı olmak zorunda değil' },
                        { name: 'rid', label: 'Router ID', type: 'text', validate: 'ip', placeholder: '1.1.1.1', hint: 'Opsiyonel — boş bırakılırsa en yüksek IP otomatik seçilir', optional: true },
                        { name: 'net', label: 'Network', type: 'text', required: true, validate: 'cidr', placeholder: '192.168.0.0', hint: 'OSPF\'e dahil edilecek ağ adresi' },
                        { name: 'wild', label: 'Wildcard Mask', type: 'text', placeholder: '0.0.0.255', hint: 'Boş bırakılırsa 0.0.0.255 kullanılır' },
                        { name: 'area', label: 'Area', type: 'text', value: '0', hint: 'Backbone için 0, diğer area\'lar için 1, 2... vb.' },
                        { name: 'passive', label: 'Passive Interface', type: 'text', placeholder: 'GigabitEthernet0/1 (boş = yok)', hint: 'Son kullanıcıya bağlı portlarda OSPF hello göndermemek için', optional: true }
                    ]
                }
            ],
            submit: 'OSPF Konfigürasyonu Oluştur'
        }, (data) => {
            const pid     = data.pid || '1';
            const rid     = data.rid;
            const net     = data.net;
            const wild    = data.wild || '0.0.0.255';
            const area    = data.area || '0';
            const passive = data.passive;
            let config = '! ========================================\n! Cisco IOS OSPF Configuration\n! ========================================\n\n';
            config += 'router ospf ' + pid + '\n';
            if (rid) config += ' router-id ' + rid + '\n';
            config += ' network ' + net + ' ' + wild + ' area ' + area + '\n';
            if (passive) config += ' passive-interface ' + passive + '\n';
            config += '!\n';
            config += '\n! Doğrulama:\n! show ip ospf neighbor\n! show ip ospf database\n! show ip route ospf\n';
            return config;
        });
    }
};

// ── BGP ───────────────────────────────────────────────────────────────────────
CiscoIOS.bgp = {
    label: 'BGP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-globe',
                title: 'BGP — Border Gateway Protocol',
                desc: 'Border Gateway Protocol — internet\'in routing protokolü. AS\'ler arası routing ve policy-based trafik yönetimi için kullanılır.'
            },
            sections: [
                {
                    title: 'Local AS Ayarları',
                    icon: 'fas fa-building',
                    fields: [
                        { name: 'local_as', label: 'Local AS', type: 'text', validate: 'asn', required: true, placeholder: '65000', hint: 'Bu router\'ın Autonomous System numarası. Özel: 64512-65534' },
                        { name: 'rid', label: 'Router ID', type: 'text', validate: 'ip', placeholder: '1.1.1.1', hint: 'BGP router kimliği — boş bırakılırsa en yüksek IP seçilir', optional: true }
                    ]
                },
                {
                    title: 'Peer (Komşu) Ayarları',
                    icon: 'fas fa-handshake',
                    fields: [
                        { name: 'peer_ip', label: 'Peer IP', type: 'text', validate: 'ip', required: true, placeholder: '203.0.113.1', hint: 'BGP komşusunun IP adresi' },
                        { name: 'peer_as', label: 'Peer AS', type: 'text', validate: 'asn', required: true, placeholder: '65001', hint: 'Komşunun AS numarası — farklıysa eBGP, aynıysa iBGP' }
                    ]
                },
                {
                    title: 'Network Duyurusu',
                    icon: 'fas fa-broadcast-tower',
                    info: 'BGP üzerinden duyurulacak ağı girin. Routing tablosunda bu ağ mevcut olmalıdır.',
                    fields: [
                        { name: 'adv_net', label: 'Advertise Network', type: 'text', placeholder: '192.168.0.0 (boş = yok)', hint: 'BGP ile duyurulacak ağ adresi', optional: true },
                        { name: 'adv_mask', label: 'Network Mask', type: 'text', placeholder: '255.255.0.0', hint: 'Duyurulacak ağın subnet maskı', optional: true }
                    ]
                }
            ],
            submit: 'BGP Konfigürasyonu Oluştur'
        }, (data) => {
            const localAS = data.local_as;
            const rid     = data.rid;
            const peerIP  = data.peer_ip;
            const peerAS  = data.peer_as;
            const advNet  = data.adv_net;
            const advMask = data.adv_mask;
            let config = '! ========================================\n! Cisco IOS BGP Configuration\n! ========================================\n\n';
            config += 'router bgp ' + localAS + '\n';
            if (rid) config += ' bgp router-id ' + rid + '\n';
            config += ' neighbor ' + peerIP + ' remote-as ' + peerAS + '\n';
            config += ' neighbor ' + peerIP + ' description eBGP-peer\n';
            if (advNet) config += ' network ' + advNet + (advMask ? ' mask ' + advMask : '') + '\n';
            config += '!\n';
            config += '\n! Doğrulama:\n! show bgp summary\n! show bgp neighbors ' + peerIP + '\n! show ip route bgp\n';
            return config;
        });
    }
};

// ── IPSEC VPN ─────────────────────────────────────────────────────────────────
CiscoIOS.ipsec = {
    label: 'IPSec VPN',

    init(container) {
        const schema = {
            topic: { icon: 'fas fa-lock', title: 'IPSec VPN', desc: 'Site-to-Site, Remote Access ve DMVPN Ready — Crypto Map, VTI veya FlexVPN (IKEv2) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'site-to-site',  label: 'Site-to-Site',  icon: 'fas fa-building',        desc: 'İki lokasyon arası kalıcı VPN',     badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'remote-access', label: 'Remote Access',  icon: 'fas fa-laptop-house',    desc: 'Uzak kullanıcılar için VPN',        badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'dmvpn-ready',   label: 'DMVPN Ready',   icon: 'fas fa-project-diagram',  desc: 'Hub-and-Spoke dynamic VPN temeli',  badge: { text: 'Gelişmiş',  cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Yapılandırma Yöntemi', icon: 'fas fa-tools',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ipsec_method', label: 'Config Yöntemi', type: 'select', required: false,
                          options: [{v:'crypto-map',l:'Crypto Map (Legacy)'},{v:'vti',l:'VTI (Önerilen)'},{v:'flexvpn',l:'FlexVPN — IKEv2'}] }
                    ]
                },
                {
                    title: 'Local Site', icon: 'fas fa-map-marker-alt',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'local_ip',   label: 'Public IP',      type: 'text', required: true,  validate: 'ip', placeholder: '85.100.1.1',        hint: 'WAN/genel IP adresi' },
                        { name: 'local_wan',  label: 'WAN Interface',  type: 'text', required: true,  placeholder: 'GigabitEthernet0/0', hint: 'WAN interface adı' },
                        { name: 'local_net',  label: 'Local Network',  type: 'text', required: false, validate: 'ip', placeholder: '192.168.1.0',        hint: 'Korunan iç ağ' },
                        { name: 'local_mask', label: 'Subnet Mask',    type: 'text', required: false, validate: 'subnet', placeholder: '255.255.255.0',      hint: 'Yerel ağ maskesi' }
                    ]
                },
                {
                    title: 'Remote Site', icon: 'fas fa-map-marker',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'remote_ip',   label: 'Remote Public IP',  type: 'text', validate: 'ip', required: true,  placeholder: '85.200.2.2',    hint: 'Karşı taraf WAN IP' },
                        { name: 'remote_net',  label: 'Remote Network',    type: 'text', validate: 'cidr', required: false, placeholder: '192.168.2.0',   hint: 'Karşı ağ adresi' },
                        { name: 'remote_mask', label: 'Remote Mask',       type: 'text', required: false, placeholder: '255.255.255.0', hint: 'Karşı ağ maskesi' }
                    ]
                },
                {
                    title: 'Tunnel Interface (VTI / FlexVPN)', icon: 'fas fa-tunnel',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null,
                    info: 'Sadece VTI veya FlexVPN yöntemi seçildiğinde kullanılır.',
                    fields: [
                        { name: 'tunnel_num',  label: 'Tunnel No',    type: 'text', required: false, placeholder: '1',                  hint: 'Tunnel interface numarası' },
                        { name: 'tunnel_ip',   label: 'Tunnel IP',    type: 'text', required: false, placeholder: '172.16.1.1',         hint: 'Tunnel IP (VTI/FlexVPN gerekli)' },
                        { name: 'tunnel_mask', label: 'Tunnel Mask',  type: 'text', validate: 'subnet', required: false, placeholder: '255.255.255.252',    hint: 'Tunnel subnet maskesi' }
                    ]
                },
                {
                    title: 'Phase 1 (IKE) Ayarları', icon: 'fas fa-key',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ike_ver',  label: 'IKE Version',    type: 'select', required: false, options: [{v:'1',l:'IKEv1'},{v:'2',l:'IKEv2 (önerilen)'}] },
                        { name: 'psk',      label: 'Pre-shared Key', type: 'text',   required: true,  placeholder: 'Min 8 karakter',     hint: 'Paylaşımlı anahtar (en az 8 karakter)' },
                        { name: 'p1_life',  label: 'SA Lifetime (sn)',type: 'text',  required: false, placeholder: '86400',              hint: 'IKE SA yaşam süresi' },
                        { name: 'p1_enc',   label: 'Şifreleme',      type: 'select', required: false, options: [{v:'aes256',l:'AES-256 (En güvenli)'},{v:'aes192',l:'AES-192'},{v:'aes128',l:'AES-128'},{v:'3des',l:'3DES (Legacy)'}] },
                        { name: 'p1_hash',  label: 'Hash',           type: 'select', required: false, options: [{v:'sha512',l:'SHA-512'},{v:'sha256',l:'SHA-256 (önerilen)'},{v:'sha1',l:'SHA-1'},{v:'md5',l:'MD5 (Legacy)'}] },
                        { name: 'p1_dh',    label: 'DH Group',       type: 'select', required: false, options: [{v:'21',l:'Group 21 — ECP-521'},{v:'19',l:'Group 19 — ECP-256 (önerilen)'},{v:'14',l:'Group 14 — 2048-bit'},{v:'5',l:'Group 5 — 1536-bit'}] }
                    ]
                },
                {
                    title: 'Phase 2 (IPSec) Ayarları', icon: 'fas fa-shield-alt',
                    showFor: ['site-to-site', 'remote-access', 'dmvpn-ready'], warn: null, info: null,
                    fields: [
                        { name: 'ts_name',  label: 'Transform Set Adı', type: 'text',   required: false, placeholder: 'TS-IPSEC',          hint: 'Transform set ismi' },
                        { name: 'ipsec_mode',label: 'IPSec Mode',       type: 'select', required: false, options: [{v:'tunnel',l:'Tunnel'},{v:'transport',l:'Transport'}] },
                        { name: 'p2_life',  label: 'SA Lifetime (sn)', type: 'text',   required: false, placeholder: '3600',              hint: 'IPSec SA yaşam süresi' },
                        { name: 'p2_enc',   label: 'ESP Şifreleme',    type: 'select', required: false, options: [{v:'esp-aes256',l:'ESP-AES-256'},{v:'esp-aes192',l:'ESP-AES-192'},{v:'esp-aes128',l:'ESP-AES-128'},{v:'esp-3des',l:'ESP-3DES'}] },
                        { name: 'p2_hash',  label: 'ESP Hash',         type: 'select', required: false, options: [{v:'esp-sha512-hmac',l:'SHA-512'},{v:'esp-sha256-hmac',l:'SHA-256 (önerilen)'},{v:'esp-sha-hmac',l:'SHA-1'},{v:'esp-md5-hmac',l:'MD5'}] },
                        { name: 'pfs',      label: 'Perfect Forward Secrecy (PFS)', type: 'checkbox', required: false },
                        { name: 'pfs_group',label: 'PFS Group',        type: 'select', required: false, options: [{v:'19',l:'Group 19 — ECP-256'},{v:'21',l:'Group 21 — ECP-521'},{v:'14',l:'Group 14 — 2048-bit'}] },
                        { name: 'dpd',      label: 'Dead Peer Detection (DPD)',      type: 'checkbox', required: false },
                        { name: 'natt',     label: 'NAT Traversal',    type: 'checkbox', required: false },
                        { name: 'qos',      label: 'QoS Pre-classify', type: 'checkbox', required: false }
                    ]
                }
            ],
            submit: 'IPSec VPN Konfigürasyonu Oluştur'
        };

        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const cb = n => data[n] === 'on' || data[n] === true;

            const method   = fv('ipsec_method') || 'vti';
            const ikeVer   = fv('ike_ver') || '2';
            const localIP  = fv('local_ip'),  localWAN  = fv('local_wan');
            const localNet = fv('local_net'),  localMask = fv('local_mask');
            const remoteIP = fv('remote_ip'), remoteNet = fv('remote_net'), remoteMask = fv('remote_mask');
            const psk      = fv('psk');
            const p1Life   = fv('p1_life') || '86400';
            const p1Enc    = fv('p1_enc')  || 'aes256';
            const p1Hash   = fv('p1_hash') || 'sha256';
            const p1DH     = fv('p1_dh')   || '19';
            const tsName   = fv('ts_name') || 'TS-IPSEC';
            const ipsecMode= fv('ipsec_mode') || 'tunnel';
            const p2Life   = fv('p2_life') || '3600';
            const p2Enc    = fv('p2_enc')  || 'esp-aes256';
            const p2Hash   = fv('p2_hash') || 'esp-sha256-hmac';
            const pfsBool  = cb('pfs');
            const pfsGrp   = fv('pfs_group') || '19';
            const dpdBool  = cb('dpd');
            const nattBool = cb('natt');
            const qosBool  = cb('qos');
            const tunNum   = fv('tunnel_num') || '1';
            const tunIP    = fv('tunnel_ip');
            const tunMask  = fv('tunnel_mask') || '255.255.255.252';

            const encMapV1  = { aes256:'aes 256', aes192:'aes 192', aes128:'aes', '3des':'3des' };
            const encMapV2  = { aes256:'aes-cbc-256', aes192:'aes-cbc-192', aes128:'aes-cbc-128', '3des':'3des' };
            const hashMapV2 = { sha512:'sha512', sha256:'sha256', sha1:'sha1', md5:'md5' };
            const esp2Enc   = { 'esp-aes256':'esp-aes 256', 'esp-aes192':'esp-aes 192', 'esp-aes128':'esp-aes', 'esp-3des':'esp-3des' };

            const calcWild = mask => mask.split('.').map(o => 255 - parseInt(o)).join('.');

            const p2TS = () => {
                let c = '! ── IPSec Transform Set ──────────────────────────────────\n';
                c += `crypto ipsec transform-set ${tsName} ${esp2Enc[p2Enc] || 'esp-aes 256'} ${p2Hash}\n`;
                c += ` mode ${ipsecMode}\nexit\n\n`;
                c += `crypto ipsec security-association lifetime seconds ${p2Life}\n`;
                c += `crypto ipsec security-association lifetime kilobytes 536870912\n\n`;
                return c;
            };

            const p1IKEv1 = () => {
                let c = '! ── IKE Phase 1 (IKEv1) ─────────────────────────────────\n';
                c += `crypto isakmp enable\ncrypto isakmp policy 10\n`;
                c += ` encr ${encMapV1[p1Enc] || 'aes 256'}\n`;
                c += ` hash ${p1Hash}\n authentication pre-share\n group ${p1DH}\n lifetime ${p1Life}\nexit\n\n`;
                if (dpdBool) c += `crypto isakmp keepalive 10 3\n\n`;
                if (nattBool) c += `crypto isakmp nat keepalive 20\n\n`;
                return c;
            };

            let config = '! ========================================\n! Cisco IOS IPSec VPN Configuration\n! ========================================\n\n';

            if (method === 'crypto-map') {
                config += p1IKEv1();
                config += `crypto isakmp key ${psk} address ${remoteIP}\n\n`;
                config += p2TS();
                config += '! ── Crypto ACL ───────────────────────────────────────────\n';
                config += `access-list 100 permit ip ${localNet} ${calcWild(localMask)} ${remoteNet} ${calcWild(remoteMask)}\n\n`;
                config += '! ── Crypto Map ───────────────────────────────────────────\n';
                config += `crypto map IPSEC-MAP 10 ipsec-isakmp\n`;
                config += ` set peer ${remoteIP}\n set transform-set ${tsName}\n match address 100\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\ninterface ${localWAN}\n crypto map IPSEC-MAP\nexit\n`;

            } else if (method === 'vti') {
                config += p1IKEv1();
                config += `crypto isakmp key ${psk} address ${remoteIP}\n\n`;
                config += p2TS();
                config += '! ── IPSec Profile ────────────────────────────────────────\n';
                config += `crypto ipsec profile IPSEC-PROFILE\n set transform-set ${tsName}\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\n! ── Tunnel Interface ─────────────────────────────────────\n`;
                config += `interface Tunnel${tunNum}\n ip address ${tunIP} ${tunMask}\n`;
                config += ` tunnel source ${localIP}\n tunnel destination ${remoteIP}\n`;
                config += ` tunnel mode ipsec ipv4\n tunnel protection ipsec profile IPSEC-PROFILE\n`;
                if (qosBool) config += ` qos pre-classify\n`;
                config += ` no shutdown\nexit\n\n`;
                config += `ip route ${remoteNet} ${remoteMask} Tunnel${tunNum}\n`;

            } else {
                // FlexVPN (IKEv2)
                config += '! ── IKEv2 Keyring ────────────────────────────────────────\n';
                config += `crypto ikev2 keyring IKEv2-KEYRING\n peer REMOTE-PEER\n  address ${remoteIP}\n  pre-shared-key ${psk}\n exit\nexit\n\n`;
                config += '! ── IKEv2 Proposal ───────────────────────────────────────\n';
                config += `crypto ikev2 proposal IKEv2-PROPOSAL\n encryption ${encMapV2[p1Enc] || 'aes-cbc-256'}\n`;
                config += ` integrity ${hashMapV2[p1Hash] || 'sha256'}\n group ${p1DH}\nexit\n\n`;
                config += `crypto ikev2 policy IKEv2-POLICY\n proposal IKEv2-PROPOSAL\nexit\n\n`;
                config += '! ── IKEv2 Profile ────────────────────────────────────────\n';
                config += `crypto ikev2 profile IKEv2-PROFILE\n match identity remote address ${remoteIP}\n`;
                config += ` authentication remote pre-share\n authentication local pre-share\n keyring local IKEv2-KEYRING\n`;
                if (dpdBool) config += ` dpd 10 3 on-demand\n`;
                config += `exit\n\n`;
                config += p2TS();
                config += '! ── IPSec Profile ────────────────────────────────────────\n';
                config += `crypto ipsec profile FLEXVPN-PROFILE\n set transform-set ${tsName}\n set ikev2-profile IKEv2-PROFILE\n`;
                if (pfsBool) config += ` set pfs group${pfsGrp}\n`;
                config += `exit\n\n! ── Tunnel Interface ─────────────────────────────────────\n`;
                config += `interface Tunnel${tunNum}\n ip address ${tunIP} ${tunMask}\n`;
                config += ` tunnel source ${localIP}\n tunnel destination ${remoteIP}\n`;
                config += ` tunnel mode ipsec ipv4\n tunnel protection ipsec profile FLEXVPN-PROFILE\n`;
                if (qosBool) config += ` qos pre-classify\n`;
                config += ` no shutdown\nexit\n\n`;
                config += `ip route ${remoteNet} ${remoteMask} Tunnel${tunNum}\n`;
            }

            config += '\n! Doğrulama:\n! show crypto isakmp sa\n! show crypto ipsec sa\n! show crypto session\n';
            if (method !== 'crypto-map') config += `! show interface Tunnel${tunNum}\n`;
            return config;
        });
    }
};



// ── DHCP ──────────────────────────────────────────────────────────────────────
CiscoIOS.dhcp = {
    label: 'DHCP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-server',
                title: 'DHCP (IOS)',
                desc: 'Ağ cihazlarına otomatik IP adresi, gateway ve DNS parametresi dağıtır. Server modunda havuz tanımlanır; Relay modunda merkezi sunucuya yönlendirilir; Snooping ile yetkisiz DHCP sunucuları engellenir.'
            },
            configTypes: [
                { id: 'server',   label: 'DHCP Server',   icon: 'fas fa-server',     desc: 'Cihaz üzerinde IP havuzu oluştur ve dağıt',              badge: { text: 'En Yaygın', cls: 'recommended' } },
                { id: 'relay',    label: 'DHCP Relay',    icon: 'fas fa-exchange-alt', desc: 'IP Helper ile merkezi DHCP sunucuya yönlendir',          badge: { text: 'Relay',     cls: 'common'      } },
                { id: 'snooping', label: 'DHCP Snooping', icon: 'fas fa-shield-alt',  desc: 'Yetkisiz DHCP sunucularını tespit et ve engelle',         badge: { text: 'Güvenlik',  cls: 'security'    } },
            ],
            sections: [
                {
                    title: 'IP Havuzu (Pool) Ayarları', icon: 'fas fa-database',
                    showFor: ['server'],
                    fields: [
                        { name: 'pool_name',  label: 'Pool Adı',           type: 'text',   required: true,  placeholder: 'LAN_POOL',       hint: 'DHCP pool için benzersiz ve açıklayıcı bir isim. Boşluk kullanmayın.' },
                        { name: 'network',    label: 'Network Adresi',      type: 'text',   required: true,  validate: 'ip', placeholder: '192.168.1.0',    hint: 'DHCP havuzunun ağ adresi. Host değil ağ adresi olmalı — son oktet genelde .0\'dır.' },
                        { name: 'mask',       label: 'Subnet Mask',         type: 'text',   required: true,  placeholder: '255.255.255.0',  hint: 'Ağ büyüklüğünü belirler. /24 → 255.255.255.0 çoğu LAN için uygundur.', tooltip: '/24 = 255.255.255.0 → 254 host\n/25 = 255.255.255.128 → 126 host\n/16 = 255.255.0.0 → 65534 host' },
                        { name: 'gateway',    label: 'Default Gateway',     type: 'text',   required: false, validate: 'ip', placeholder: '192.168.1.1',    optional: true, hint: 'Client\'ların internet/diğer ağlara ulaşmak için kullanacağı gateway IP adresi.', tooltip: 'Client\'ların internete veya diğer ağlara çıkacağı router adresi. Genelde bu cihazın aynı subnet\'teki interface IP\'sidir.' },
                        { name: 'dns1',       label: 'DNS Server 1',        type: 'text',   required: false, validate: 'ip', placeholder: '8.8.8.8',        optional: true, hint: 'Birincil DNS. Google: 8.8.8.8, Cloudflare: 1.1.1.1 veya kurumsal DNS sunucunuz girilebilir.' },
                        { name: 'dns2',       label: 'DNS Server 2',        type: 'text',   required: false, validate: 'ip', placeholder: '8.8.4.4',        optional: true, hint: 'İkincil (yedek) DNS sunucusu. Birincil erişilemez olduğunda devreye girer.' },
                        { name: 'lease_days', label: 'Lease Süresi (gün)',  type: 'number', required: false, min: 0, max: 365, placeholder: '1',            optional: true, hint: 'Önerilen: masaüstü/sunucu için 7-30 gün, misafir ağı için 1 gün veya daha az.', tooltip: 'IP adresinin cihaza ne kadar süre tahsis edileceği. Kısa lease: daha fazla DHCP trafiği. Uzun lease: statik benzeri davranış.' },
                        { name: 'domain',     label: 'Domain Name',         type: 'text',   required: false, placeholder: 'example.com',    optional: true, hint: 'Client\'lara iletilecek DNS arama domain\'i. Kurumsal ortamda Active Directory domain adı kullanılabilir.' },
                    ]
                },
                {
                    title: 'Excluded IP Aralığı', icon: 'fas fa-ban',
                    showFor: ['server'],
                    info: 'DHCP havuzundan <strong>dağıtılmaması</strong> gereken IP\'leri tanımlayın. Gateway, sunucu ve yazıcı gibi sabit IP\'li cihazları buraya ekleyin.',
                    fields: [
                        { name: 'excl_start', label: 'Excluded Başlangıç', type: 'text', required: false, validate: 'ip', placeholder: '192.168.1.1',  optional: true, hint: 'Hariç tutulacak aralığın ilk IP\'si. Tek bir IP için sadece bu alanı doldurun.' },
                        { name: 'excl_end',   label: 'Excluded Bitiş',     type: 'text', required: false, validate: 'ip', placeholder: '192.168.1.10', optional: true, hint: 'Aralık sonu. Örn: .1 ile .10 girilerek 10 IP hariç tutulur.' },
                    ]
                },
                {
                    title: 'Static Binding', icon: 'fas fa-fingerprint',
                    showFor: ['server'],
                    info: 'MAC adresine göre sabit IP ataması — yazıcılar, IP kameralar ve sunucular için kullanışlıdır (opsiyonel).',
                    fields: [
                        { name: 'static_mac', label: 'MAC Adresi',     type: 'text', required: false, validate: 'mac', placeholder: '00:1A:2B:3C:4D:5E', optional: true, hint: 'Sabit IP atanacak cihazın MAC adresi — xx:xx:xx:xx:xx:xx formatında.' },
                        { name: 'static_ip',  label: 'Sabit IP Adresi', type: 'text', required: false, validate: 'ip',  placeholder: '192.168.1.100',      optional: true, hint: 'Bu MAC adresine her zaman atanacak IP. Havuz aralığı içinde yer almalıdır.' },
                    ]
                },
                {
                    title: 'IP Helper Yapılandırması', icon: 'fas fa-route',
                    showFor: ['relay'],
                    info: 'DHCP Relay, client\'ın broadcast DHCP isteğini unicast olarak uzaktaki sunucuya iletir. Client ile sunucu farklı subnet\'lerde olduğunda kullanılır.',
                    fields: [
                        { name: 'relay_iface',  label: 'Interface',      type: 'text', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Client\'ların bağlı olduğu interface veya SVI arayüzü (örn: Vlan10).', tooltip: 'DHCP isteklerinin geldiği interface — client\'lara bağlı port veya SVI arayüzü. ip helper-address bu interface altına eklenir.' },
                        { name: 'relay_server', label: 'DHCP Server IP', type: 'text', required: true, validate: 'ip', placeholder: '10.0.0.10', hint: 'Uzaktaki DHCP sunucusunun IP adresi. Birden fazla sunucu için komut tekrarlanır.' },
                    ]
                },
                {
                    title: 'DHCP Snooping Yapılandırması', icon: 'fas fa-shield-alt',
                    showFor: ['snooping'],
                    warn: '<strong>Önemli:</strong> DHCP Snooping aktif edildiğinde tüm portlar varsayılan olarak <strong>untrusted</strong> olur. DHCP sunucusuna veya uplink\'e bağlı portları mutlaka <strong>trusted</strong> yapın — aksi hâlde DHCP trafiği kesilir.',
                    fields: [
                        { name: 'snoop_vlan',   label: 'VLAN Aralığı',  type: 'text', required: true,  placeholder: '10,20,30-40',       hint: 'Snooping aktif edilecek VLAN\'lar. Tüm VLAN\'lar için: 1-4094' },
                        { name: 'trusted_port', label: 'Trusted Port',   type: 'text', required: false, placeholder: 'GigabitEthernet0/0', optional: true, hint: 'DHCP sunucuya bağlı veya uplink port. Her port için ayrı komut gerekir.', tooltip: 'DHCP sunucusuna veya uplink switche bağlı port. Bu porttan gelen DHCP server paketleri güvenilir kabul edilir ve iletilir.' },
                        { name: 'dai_enable',   label: 'DAI (Dynamic ARP Inspection) etkinleştir', type: 'checkbox', required: false, hint: 'DHCP Snooping binding tablosunu kullanarak sahte ARP paketlerini engeller. Man-in-the-Middle saldırılarına karşı koruma sağlar.' },
                    ]
                },
            ],
            submit: 'DHCP Konfigürasyonu Oluştur'
        }, (data) => {
            return cgDhcpGen(data);
        });
    }
};
function cgDhcpGen(data) {
    const g = k => cgEsc((data[k] || '').toString().trim());
    const mode = data._cgtype || '';
    let c = '! ========================================\n! Cisco IOS DHCP Configuration\n! ========================================\n\n';
    if (mode === 'server') {
        const es = g('excl_start'), ee = g('excl_end');
        if (es) c += 'ip dhcp excluded-address ' + es + (ee ? ' ' + ee : '') + '\n';
        c += '!\nip dhcp pool ' + g('pool_name') + '\n network ' + g('network') + ' ' + g('mask') + '\n';
        const gw = g('gateway'); if (gw) c += ' default-router ' + gw + '\n';
        const d1 = g('dns1'); if (d1) c += ' dns-server ' + d1 + (g('dns2') ? ' ' + g('dns2') : '') + '\n';
        c += ' lease ' + (g('lease_days') || '1') + '\n';
        const dom = g('domain'); if (dom) c += ' domain-name ' + dom + '\n';
        c += '!\n';
        const sm = g('static_mac'), si = g('static_ip');
        if (sm && si) c += 'ip dhcp pool HOST-' + sm.replace(/[:\-.]/g,'') + '\n host ' + si + ' ' + g('mask') + '\n client-identifier ' + sm + '\n!\n';
    } else if (mode === 'relay') {
        c += 'interface ' + g('relay_iface') + '\n ip helper-address ' + g('relay_server') + '\nexit\n';
    } else if (mode === 'snooping') {
        const sv = g('snoop_vlan');
        c += 'ip dhcp snooping\nip dhcp snooping vlan ' + sv + '\nno ip dhcp snooping information option\n';
        const tp = g('trusted_port');
        if (tp) c += 'interface ' + tp + '\n ip dhcp snooping trust\nexit\n';
        if (data.dai_enable) c += 'ip arp inspection vlan ' + sv + '\n';
        c += '!\n';
    }
    c += '! Doğrulama: show ip dhcp pool | show ip dhcp binding | show ip dhcp snooping\n';
    return c;
}

// ── SNMP ──────────────────────────────────────────────────────────────────────
CiscoIOS.snmp = {
    label: 'SNMP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-chart-line',
                title: 'SNMP — Simple Network Management Protocol',
                desc: 'Simple Network Management Protocol — cihaz izleme. <strong>v2c</strong>: basit, yaygın. <strong>v3</strong>: şifreli, kimlik doğrulamalı, üretimde önerilen.'
            },
            configTypes: [
                { id: 'v3', label: 'SNMPv3', icon: 'fas fa-lock', desc: 'Auth + Privacy — şifreli ve kimlik doğrulamalı', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'v1v2c', label: 'SNMPv1/v2c', icon: 'fas fa-unlock', desc: 'Community string — basit, şifresiz', badge: { text: 'Eski', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'SNMPv3 Kimlik Bilgileri',
                    icon: 'fas fa-user-shield',
                    showFor: ['v3'],
                    fields: [
                        { name: 'v3_group', label: 'Grup Adı', type: 'text', required: true, placeholder: 'SNMPV3_GROUP', hint: 'SNMPv3 erişim grubu adı' },
                        { name: 'v3_user', label: 'Kullanıcı', type: 'text', required: true, placeholder: 'snmpuser', hint: 'SNMPv3 kullanıcı adı' },
                        { name: 'v3_auth', label: 'Auth Şifre', type: 'text', required: true, placeholder: 'AuthPassword123', hint: 'SHA algoritması ile kimlik doğrulama şifresi (min 8 karakter)' },
                        { name: 'v3_priv', label: 'Priv Şifre', type: 'text', required: true, placeholder: 'PrivPassword123', hint: 'AES-256 ile şifreleme anahtarı (min 8 karakter)' }
                    ]
                },
                {
                    title: 'SNMPv3 Ek Ayarlar',
                    icon: 'fas fa-cog',
                    showFor: ['v3'],
                    fields: [
                        { name: 'contact', label: 'Contact', type: 'text', placeholder: 'noc@example.com', optional: true },
                        { name: 'location', label: 'Location', type: 'text', placeholder: 'Istanbul-DC1', optional: true },
                        { name: 'trap_host', label: 'Trap Host', type: 'text', validate: 'ip', placeholder: '10.0.0.100', hint: 'SNMP trap alacak sunucu IP', optional: true },
                        { name: 'mgmt_net', label: 'Mgmt Network', type: 'text', placeholder: '10.0.0.0', hint: 'SNMP erişimine izin verilecek ağ', optional: true },
                        { name: 'mgmt_wild', label: 'Mgmt Wildcard', type: 'text', placeholder: '0.0.0.255', optional: true }
                    ]
                },
                {
                    title: 'SNMPv1/v2c Community',
                    icon: 'fas fa-key',
                    showFor: ['v1v2c'],
                    warn: 'SNMPv1/v2c community string şifresiz iletilir. Üretim ortamında SNMPv3 tercih edin.',
                    fields: [
                        { name: 'ro_comm', label: 'RO Community', type: 'text', required: true, placeholder: 'public_ro', hint: 'Read-Only erişim için community string' },
                        { name: 'rw_comm', label: 'RW Community', type: 'text', placeholder: 'private_rw', hint: 'Read-Write erişim — mümkünse kullanmayın', optional: true },
                        { name: 'contact', label: 'Contact', type: 'text', placeholder: 'noc@example.com', optional: true },
                        { name: 'location', label: 'Location', type: 'text', placeholder: 'Istanbul-DC1', optional: true },
                        { name: 'trap_host', label: 'Trap Host', type: 'text', validate: 'ip', placeholder: '10.0.0.100', optional: true },
                        { name: 'trap_comm', label: 'Trap Community', type: 'text', placeholder: 'trap_comm', optional: true }
                    ]
                }
            ],
            submit: 'SNMP Konfigürasyonu Oluştur'
        }, (data) => {
            const ver = data._cgtype;
            let c = '! ========================================\n! Cisco IOS SNMP Configuration\n! ========================================\n\n';
            if (ver === 'v3') {
                c += 'snmp-server group ' + data.v3_group + ' v3 priv\n';
                c += 'snmp-server user ' + data.v3_user + ' ' + data.v3_group + ' v3 auth sha ' + data.v3_auth + ' priv aes 256 ' + data.v3_priv + '\n';
                if (data.contact) c += 'snmp-server contact ' + data.contact + '\n';
                if (data.location) c += 'snmp-server location ' + data.location + '\n';
                if (data.trap_host) { c += 'snmp-server host ' + data.trap_host + ' version 3 priv ' + data.v3_user + '\nsnmp-server enable traps\n'; }
                if (data.mgmt_net && data.mgmt_wild) { c += 'ip access-list standard SNMP-ACCESS\n permit ' + data.mgmt_net + ' ' + data.mgmt_wild + '\n!\nsnmp-server community SNMPV3 RO SNMP-ACCESS\n'; }
            } else {
                c += 'snmp-server community ' + data.ro_comm + ' RO\n';
                if (data.rw_comm) c += 'snmp-server community ' + data.rw_comm + ' RW\n';
                if (data.contact) c += 'snmp-server contact ' + data.contact + '\n';
                if (data.location) c += 'snmp-server location ' + data.location + '\n';
                if (data.trap_host) c += 'snmp-server host ' + data.trap_host + ' version 2c ' + (data.trap_comm || data.ro_comm) + '\n';
            }
            c += '!\n! Doğrulama: show snmp | show snmp group | show snmp user\n';
            return c;
        });
    }
};

// ── AAA ───────────────────────────────────────────────────────────────────────
CiscoIOS.aaa = {
    label: 'AAA',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-user-check',
                title: 'AAA — Authentication, Authorization, Accounting',
                desc: '<strong>Authentication</strong> (kim?), <strong>Authorization</strong> (ne yapabilir?), <strong>Accounting</strong> (ne yaptı?). TACACS+ veya RADIUS sunucusu ile merkezi kimlik doğrulama.'
            },
            sections: [
                {
                    title: 'Auth Yöntemi',
                    icon: 'fas fa-key',
                    fields: [
                        { name: 'auth_method', label: 'Auth Yöntemi', type: 'select', required: true, options: [
                            { value: 'local', label: 'Sadece Local' },
                            { value: 'tacacs', label: 'TACACS+ (fallback local)' },
                            { value: 'radius', label: 'RADIUS (fallback local)' },
                            { value: 'tacacs_only', label: 'Sadece TACACS+' },
                            { value: 'radius_only', label: 'Sadece RADIUS' }
                        ]}
                    ]
                },
                {
                    title: 'TACACS+ Sunucu',
                    icon: 'fas fa-server',
                    info: 'TACACS+ seçildiğinde doldurulması gerekir.',
                    fields: [
                        { name: 'tacacs_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', placeholder: '10.0.0.10', hint: 'TACACS+ sunucusunun IP adresi' },
                        { name: 'tacacs_key', label: 'Key', type: 'text', placeholder: 'SecretKey123', hint: 'Shared secret — cihaz ve sunucuda aynı olmalı' }
                    ]
                },
                {
                    title: 'RADIUS Sunucu',
                    icon: 'fas fa-server',
                    info: 'RADIUS seçildiğinde doldurulması gerekir.',
                    fields: [
                        { name: 'radius_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', placeholder: '10.0.0.20', hint: 'RADIUS sunucusunun IP adresi' },
                        { name: 'radius_key', label: 'Key', type: 'text', placeholder: 'SecretKey123', hint: 'Shared secret — auth-port 1812, acct-port 1813' }
                    ]
                },
                {
                    title: 'Line Yapılandırması',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'vty_range', label: 'VTY Line Aralığı', type: 'text', value: '0 15', hint: 'Genelde "0 15" — tüm VTY satırları' }
                    ]
                }
            ],
            submit: 'AAA Konfigürasyonu Oluştur'
        }, (data) => {
            const method = data.auth_method;
            const vty = data.vty_range || '0 15';
            const useTacacs = method.includes('tacacs');
            const useRadius = method.includes('radius');
            const fallback = method.endsWith('_only') ? '' : ' local';
            const grp = useTacacs ? 'tacacs+' : (useRadius ? 'radius' : '');
            let c = '! ========================================\n! Cisco IOS AAA Configuration\n! ========================================\n\naaa new-model\n!\n';
            if (useTacacs) {
                c += 'tacacs server PRIMARY\n address ipv4 ' + data.tacacs_ip + '\n key ' + data.tacacs_key + '\nexit\n!\n';
            }
            if (useRadius) {
                c += 'radius server PRIMARY\n address ipv4 ' + data.radius_ip + ' auth-port 1812 acct-port 1813\n key ' + data.radius_key + '\nexit\n!\n';
            }
            if (method === 'local') {
                c += 'aaa authentication login default local\naaa authorization exec default local\n';
            } else {
                c += 'aaa authentication login default group ' + grp + fallback + '\n';
                c += 'aaa authorization exec default group ' + grp + ' local if-authenticated\n';
                c += 'aaa accounting exec default start-stop group ' + grp + '\n';
            }
            c += '!\nline vty ' + vty + '\n login authentication default\n transport input ssh\nexit\n';
            c += '!\n! Doğrulama: show aaa servers | debug aaa authentication\n';
            return c;
        });
    }
};

// ── TACACS+ ───────────────────────────────────────────────────────────────────
CiscoIOS.tacacs = {
    label: 'TACACS+',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'TACACS+ — Terminal Access Controller Access-Control System Plus',
                desc: 'Cisco AAA protokolü. Tüm bileşenler şifreli, ayrı yetkilendirme, port 49. Merkezi kimlik yönetimi için kullanılır.'
            },
            sections: [
                {
                    title: 'Birincil Sunucu',
                    icon: 'fas fa-server',
                    fields: [
                        { name: 'pri_name', label: 'Sunucu Adı', type: 'text', required: true, placeholder: 'TACACS-PRIMARY', hint: 'Cihaz üzerindeki referans adı' },
                        { name: 'pri_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', required: true, placeholder: '10.0.0.10' },
                        { name: 'pri_key', label: 'Key', type: 'text', required: true, placeholder: 'SecretKey123', hint: 'Shared secret — sunucu ve cihazda aynı olmalı' },
                        { name: 'grp_name', label: 'AAA Grup Adı', type: 'text', required: true, placeholder: 'TACACS_GROUP', hint: 'aaa group server tacacs+ için grup adı' }
                    ]
                },
                {
                    title: 'İkincil Sunucu',
                    icon: 'fas fa-server',
                    info: 'Yedek TACACS+ sunucusu — birincil erişilemez olduğunda devreye girer.',
                    fields: [
                        { name: 'sec_name', label: 'Sunucu Adı', type: 'text', placeholder: 'TACACS-SECONDARY', optional: true },
                        { name: 'sec_ip', label: 'Sunucu IP', type: 'text', validate: 'ip', placeholder: '10.0.0.11', optional: true },
                        { name: 'sec_key', label: 'Key', type: 'text', placeholder: 'SecretKey123 (boş = birincil ile aynı)', optional: true }
                    ]
                },
                {
                    title: 'Lokal Fallback',
                    icon: 'fas fa-user',
                    info: 'TACACS+ erişilemez olduğunda kullanılacak lokal hesap.',
                    fields: [
                        { name: 'local_user', label: 'Local Kullanıcı', type: 'text', placeholder: 'admin', optional: true },
                        { name: 'local_pass', label: 'Local Şifre', type: 'text', placeholder: 'LocalPass123!', optional: true },
                        { name: 'login_protect', label: 'Login block-for etkinleştir (5 yanlış girişte 5 dk blok)', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'TACACS+ Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS TACACS+ Configuration\n! ========================================\n\n';
            c += 'tacacs server ' + data.pri_name + '\n address ipv4 ' + data.pri_ip + '\n key ' + data.pri_key + '\nexit\n';
            if (data.sec_name && data.sec_ip) {
                c += 'tacacs server ' + data.sec_name + '\n address ipv4 ' + data.sec_ip + '\n key ' + (data.sec_key || data.pri_key) + '\nexit\n';
            }
            c += '!\naaa group server tacacs+ ' + data.grp_name + '\n server name ' + data.pri_name + '\n';
            if (data.sec_name && data.sec_ip) c += ' server name ' + data.sec_name + '\n';
            c += 'exit\n!\naaa new-model\naaa authentication login default group ' + data.grp_name + ' local\naaa authorization exec default group ' + data.grp_name + ' local\naaa accounting exec default start-stop group ' + data.grp_name + '\n';
            if (data.local_user && data.local_pass) c += '!\nusername ' + data.local_user + ' privilege 15 secret ' + data.local_pass + '\n';
            c += '!\nline vty 0 15\n login authentication default\n authorization exec default\n transport input ssh\nexit\n';
            if (data.login_protect === true) c += '!\nlogin block-for 300 attempts 5 within 120\n';
            c += '!\n! Doğrulama: show aaa servers | test aaa group ' + data.grp_name + ' ' + (data.local_user || 'admin') + ' <pass> legacy\n';
            return c;
        });
    }
};

// ── SSH ───────────────────────────────────────────────────────────────────────
CiscoIOS.ssh = {
    label: 'SSH',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-terminal',
                title: 'SSH — Secure Shell',
                desc: 'Secure Shell — şifreli uzaktan yönetim. Telnet\'in güvenli alternatifi. RSA anahtar üretimi ve VTY line konfigürasyonu gerektirir.'
            },
            sections: [
                {
                    title: 'Cihaz Kimliği',
                    icon: 'fas fa-id-badge',
                    info: 'RSA anahtar üretimi için hostname ve domain name zorunludur.',
                    fields: [
                        { name: 'hostname', label: 'Hostname', type: 'text', required: true, placeholder: 'ROUTER-01', hint: 'Cihaz adı — RSA anahtar adını belirler' },
                        { name: 'domain', label: 'Domain Name', type: 'text', required: true, placeholder: 'example.com', hint: 'ip domain-name komutu ile ayarlanır' }
                    ]
                },
                {
                    title: 'SSH Ayarları',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'key_size', label: 'RSA Key Boyutu', type: 'select', options: [
                            { value: '2048', label: '2048 bit (Önerilen)', selected: true },
                            { value: '4096', label: '4096 bit' },
                            { value: '1024', label: '1024 bit (Eski — kullanmayın)' }
                        ], hint: 'Minimum 2048 bit önerilir' },
                        { name: 'ssh_ver', label: 'SSH Versiyonu', type: 'select', options: [
                            { value: '2', label: 'SSHv2 (Önerilen)', selected: true },
                            { value: '1', label: 'SSHv1 (Güvensiz)' }
                        ]}
                    ]
                },
                {
                    title: 'Lokal Kullanıcı',
                    icon: 'fas fa-user',
                    info: 'Kullanıcı ve şifre girilirse VTY\'ye login local uygulanır.',
                    fields: [
                        { name: 'ssh_user', label: 'Kullanıcı Adı', type: 'text', placeholder: 'admin', optional: true },
                        { name: 'ssh_pass', label: 'Şifre', type: 'text', placeholder: 'Admin123!', optional: true }
                    ]
                }
            ],
            submit: 'SSH Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS SSH Configuration\n! ========================================\n\n';
            c += 'hostname ' + data.hostname + '\nip domain-name ' + data.domain + '\n!\ncrypto key generate rsa modulus ' + (data.key_size || '2048') + '\n!\n';
            c += 'ip ssh version ' + (data.ssh_ver || '2') + '\nip ssh time-out 60\nip ssh authentication-retries 3\n!\n';
            if (data.ssh_user && data.ssh_pass) c += 'username ' + data.ssh_user + ' privilege 15 secret ' + data.ssh_pass + '\n!\n';
            c += 'line vty 0 15\n transport input ssh\n login local\nexit\n';
            c += '!\n! Doğrulama: show ip ssh | show ssh\n';
            return c;
        });
    }
};

// ── PASSWORD / USER ───────────────────────────────────────────────────────────
CiscoIOS.password = {
    label: 'Password/User',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-key',
                title: 'Password / User — Şifre ve Kullanıcı Yönetimi',
                desc: 'Cihaz erişim şifreleri ve yerel kullanıcı hesapları. Enable secret, console/VTY şifreleri ve privilege level yönetimi.'
            },
            sections: [
                {
                    title: 'Enable & Servis',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'enable_secret', label: 'Enable Secret', type: 'text', required: true, placeholder: 'EnSecret123!', hint: 'Privileged EXEC moduna geçiş şifresi — "enable password" yerine bu kullanılmalı' },
                        { name: 'pwd_enc', label: 'service password-encryption ekle', type: 'checkbox', checked: true, hint: 'Running config\'deki şifreleri şifreler' }
                    ]
                },
                {
                    title: 'Console Line',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'con_local', label: 'login local (console)', type: 'checkbox', checked: true },
                        { name: 'con_pass', label: 'Console Şifre', type: 'text', placeholder: 'Boş = login local kullanılır', optional: true, hint: 'Sadece login local kullanmıyorsanız doldurun' },
                        { name: 'con_timeout', label: 'Exec Timeout (dk)', type: 'number', value: '5', hint: '0 = timeout yok (önerilmez)', min: 0 }
                    ]
                },
                {
                    title: 'VTY Lines',
                    icon: 'fas fa-terminal',
                    fields: [
                        { name: 'vty_timeout', label: 'Exec Timeout (dk)', type: 'number', value: '10', min: 0 },
                        { name: 'motd', label: 'MOTD banner ekle', type: 'checkbox', hint: 'Yetkisiz erişim uyarı mesajı' }
                    ]
                }
            ],
            submit: 'Password Konfigürasyonu Oluştur'
        }, (data) => {
            let c = '! ========================================\n! Cisco IOS Password / User Configuration\n! ========================================\n\n';
            c += 'enable secret ' + data.enable_secret + '\n';
            if (data.pwd_enc === true) c += 'service password-encryption\n';
            c += '!\nline console 0\n';
            if (data.con_pass) { c += ' password ' + data.con_pass + '\n login\n'; }
            else if (data.con_local === true) { c += ' login local\n'; }
            c += ' exec-timeout ' + (data.con_timeout || '5') + ' 0\nexit\n';
            c += '!\nline vty 0 15\n login local\n exec-timeout ' + (data.vty_timeout || '10') + ' 0\nexit\n';
            if (data.motd === true) c += '!\nbanner motd ^WARNING: Unauthorized access to this device is prohibited!^\n';
            c += '!\n! Doğrulama: show running-config | include enable|password|username\n';
            return c;
        });
    }
};

// ── FHRP (HSRP / VRRP / GLBP) ────────────────────────────────────────────────
CiscoIOS.vrrp = {
    label: 'HSRP/VRRP/GLBP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-exchange-alt',
                title: 'FHRP — First Hop Redundancy Protocol',
                desc: 'First-Hop Redundancy — gateway yedekliği. <strong>HSRP</strong> (Cisco özel), <strong>VRRP</strong> (standart RFC), <strong>GLBP</strong> (yük dengeleme + yedeklilik).'
            },
            configTypes: [
                { id: 'hsrp', label: 'HSRP', icon: 'fas fa-exchange-alt', desc: 'Hot Standby Router Protocol — Cisco özel', badge: { text: 'Cisco', cls: 'common' } },
                { id: 'vrrp', label: 'VRRP', icon: 'fas fa-sync-alt', desc: 'Virtual Router Redundancy Protocol — standart RFC', badge: { text: 'Standart', cls: 'recommended' } },
                { id: 'glbp', label: 'GLBP', icon: 'fas fa-random', desc: 'Gateway Load Balancing Protocol — yük dengeleme', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Ortak Parametreler',
                    icon: 'fas fa-cog',
                    showFor: ['hsrp', 'vrrp', 'glbp'],
                    fields: [
                        { name: 'fhrp_iface', label: 'Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/1', hint: 'Virtual IP\'nin atanacağı Layer-3 interface' },
                        { name: 'fhrp_group', label: 'Grup No', type: 'text', required: true, placeholder: '1', hint: 'HSRP/VRRP/GLBP grup numarası' },
                        { name: 'virtual_ip', label: 'Virtual IP', type: 'text', required: true, validate: 'ip', placeholder: '192.168.1.254', hint: 'Gateway olarak kullanılacak sanal IP adresi' },
                        { name: 'priority', label: 'Priority', type: 'number', placeholder: '100 (default)', hint: 'Yüksek priority = Active/Master router. Varsayılan: 100', optional: true },
                        { name: 'preempt', label: 'Preempt etkinleştir', type: 'checkbox', checked: true, hint: 'Yüksek priority\'li router geri döndüğünde Active rolünü geri alır' },
                        { name: 'auth_key', label: 'Auth Key (MD5)', type: 'text', placeholder: 'md5 key string', hint: 'Komşu kimlik doğrulama — aynı grubun tüm router\'larında aynı olmalı', optional: true },
                        { name: 'hello', label: 'Hello Timer (sn)', type: 'number', placeholder: '3', optional: true },
                        { name: 'hold', label: 'Hold Timer (sn)', type: 'number', placeholder: '10', optional: true },
                        { name: 'track_num', label: 'Track Object No', type: 'text', placeholder: '1', optional: true },
                        { name: 'track_dec', label: 'Priority Decrement', type: 'number', placeholder: '20', optional: true }
                    ]
                },
                {
                    title: 'HSRP Ek Ayarlar',
                    icon: 'fas fa-sliders-h',
                    showFor: ['hsrp'],
                    fields: [
                        { name: 'hsrp_v2', label: 'HSRP version 2 kullan', type: 'checkbox', checked: true, hint: 'v2: daha fazla grup (0-4095), IPv6 desteği' }
                    ]
                },
                {
                    title: 'GLBP Ek Ayarlar',
                    icon: 'fas fa-balance-scale',
                    showFor: ['glbp'],
                    fields: [
                        { name: 'glbp_lb', label: 'Load-Balance Yöntemi', type: 'select', options: [
                            { value: '', label: 'Round-robin (default)' },
                            { value: 'weighted', label: 'Weighted' },
                            { value: 'host-dependent', label: 'Host-dependent' }
                        ]}
                    ]
                }
            ],
            submit: 'FHRP Konfigürasyonu Oluştur'
        }, (data) => {
            const proto = data._cgtype, iface = data.fhrp_iface, grp = data.fhrp_group;
            const vip = data.virtual_ip, pri = data.priority, ak = data.auth_key;
            const hello = data.hello, hold = data.hold, tn = data.track_num, td = data.track_dec;
            let c = '! ========================================\n! Cisco IOS FHRP (' + (proto||'').toUpperCase() + ') Configuration\n! ========================================\n\n';
            if (proto === 'hsrp') {
                if (data.hsrp_v2 === true) c += 'standby version 2\n';
                c += 'interface ' + iface + '\n';
                c += ' standby ' + grp + ' ip ' + vip + '\n';
                if (pri) c += ' standby ' + grp + ' priority ' + pri + '\n';
                if (data.preempt === true) c += ' standby ' + grp + ' preempt\n';
                if (ak) c += ' standby ' + grp + ' authentication md5 key-string ' + ak + '\n';
                if (tn && td) c += ' standby ' + grp + ' track ' + tn + ' decrement ' + td + '\n';
                if (hello && hold) c += ' standby ' + grp + ' timers ' + hello + ' ' + hold + '\n';
                c += 'exit\n';
            } else if (proto === 'vrrp') {
                c += 'interface ' + iface + '\n';
                c += ' vrrp ' + grp + ' address-family ipv4\n';
                c += '  address ' + vip + ' primary\n';
                if (pri) c += '  priority ' + pri + '\n';
                if (data.preempt === true) c += '  preempt\n';
                if (hello) c += '  timers advertise ' + hello + '\n';
                if (tn && td) c += '  track ' + tn + ' decrement ' + td + '\n';
                c += ' exit-address-family\nexit\n';
            } else {
                c += 'interface ' + iface + '\n';
                c += ' glbp ' + grp + ' ip ' + vip + '\n';
                if (pri) c += ' glbp ' + grp + ' priority ' + pri + '\n';
                if (data.preempt === true) c += ' glbp ' + grp + ' preempt\n';
                if (data.glbp_lb) c += ' glbp ' + grp + ' load-balancing ' + data.glbp_lb + '\n';
                if (ak) c += ' glbp ' + grp + ' authentication md5 key-string ' + ak + '\n';
                if (hello && hold) c += ' glbp ' + grp + ' timers ' + hello + ' ' + hold + '\n';
                c += 'exit\n';
            }
            c += '!\n! Doğrulama: show standby | show vrrp | show glbp\n';
            return c;
        });
    }
};

// ── STP ───────────────────────────────────────────────────────────────────────
CiscoIOS.stp = {
    label: 'STP',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tree',
                title: 'STP — Spanning Tree Protocol',
                desc: 'Spanning Tree Protocol — Layer-2 döngü önleme. <strong>PVST+</strong>, <strong>Rapid-PVST</strong> ve <strong>MST</strong> modları. Root bridge seçimi ve port rollerini yönetir.'
            },
            configTypes: [
                { id: 'pvst', label: 'PVST+', icon: 'fas fa-tree', desc: 'Per-VLAN Spanning Tree — Cisco klasik', badge: { text: 'Klasik', cls: 'common' } },
                { id: 'rapid', label: 'Rapid-PVST', icon: 'fas fa-bolt', desc: 'Hızlı convergence — IEEE 802.1w tabanlı', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'mst', label: 'MST', icon: 'fas fa-sitemap', desc: 'Multiple Spanning Tree — büyük ağlar için', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Root Bridge',
                    icon: 'fas fa-crown',
                    showFor: ['pvst', 'rapid'],
                    fields: [
                        { name: 'root_vlans', label: 'VLANs', type: 'text', placeholder: '1,10,20', hint: 'Root bridge olunacak VLAN listesi', optional: true },
                        { name: 'root_type', label: 'Root Tipi', type: 'select', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }] }
                    ]
                },
                {
                    title: 'MST Yapılandırması',
                    icon: 'fas fa-sitemap',
                    showFor: ['mst'],
                    fields: [
                        { name: 'mst_region', label: 'Region Adı', type: 'text', placeholder: 'MST_REGION_1', optional: true },
                        { name: 'mst_rev', label: 'Revision', type: 'number', placeholder: '1', optional: true },
                        { name: 'mst_inst', label: 'Instance No', type: 'text', placeholder: '1', optional: true },
                        { name: 'mst_vlans', label: 'MST VLANs', type: 'text', placeholder: '10,20,30', optional: true },
                        { name: 'root_type', label: 'Root Tipi', type: 'select', options: [{ value: 'primary', label: 'Primary' }, { value: 'secondary', label: 'Secondary' }] }
                    ]
                },
                {
                    title: 'Global Özellikler',
                    icon: 'fas fa-cog',
                    showFor: ['pvst', 'rapid', 'mst'],
                    fields: [
                        { name: 'portfast_def', label: 'spanning-tree portfast default', type: 'checkbox', hint: 'Tüm access portlarda portfast etkinleştirir' },
                        { name: 'bpduguard_def', label: 'spanning-tree portfast bpduguard default', type: 'checkbox', hint: 'Portfast portlarda BPDU gelirse port kapanır' },
                        { name: 'loopguard', label: 'spanning-tree loopguard default', type: 'checkbox' },
                        { name: 'uplinkfast', label: 'spanning-tree uplinkfast', type: 'checkbox' }
                    ]
                },
                {
                    title: 'Port Yapılandırmaları',
                    icon: 'fas fa-plug',
                    showFor: ['pvst', 'rapid', 'mst'],
                    fields: [
                        { name: 'access_int', label: 'Access Port (portfast)', type: 'text', placeholder: 'GigabitEthernet0/1', optional: true },
                        { name: 'trunk_int', label: 'Trunk Port (priority 64)', type: 'text', placeholder: 'GigabitEthernet0/0', optional: true },
                        { name: 'rootguard_ports', label: 'Root Guard Ports', type: 'text', placeholder: 'GigabitEthernet0/2', optional: true }
                    ]
                }
            ],
            submit: 'STP Konfigürasyonu Oluştur'
        }, (data) => {
            const mode = data._cgtype;
            const modeMap = { pvst: 'pvst', rapid: 'rapid-pvst', mst: 'mst' };
            let c = '! ========================================\n! Cisco IOS STP Configuration\n! ========================================\n\n';
            c += 'spanning-tree mode ' + modeMap[mode] + '\n!\n';
            if (mode === 'mst') {
                const reg = data.mst_region, rev = data.mst_rev, inst = data.mst_inst, mv = data.mst_vlans;
                if (reg || inst) {
                    c += 'spanning-tree mst configuration\n';
                    if (reg) c += ' name ' + reg + '\n';
                    if (rev) c += ' revision ' + rev + '\n';
                    if (inst && mv) c += ' instance ' + inst + ' vlan ' + mv + '\n';
                    c += 'exit\n';
                    if (inst) c += 'spanning-tree mst ' + inst + ' root ' + (data.root_type || 'primary') + '\n';
                }
            } else {
                if (data.root_vlans) c += 'spanning-tree vlan ' + data.root_vlans + ' root ' + (data.root_type || 'primary') + '\n';
            }
            c += '!\n';
            if (data.portfast_def === true) c += 'spanning-tree portfast default\n';
            if (data.bpduguard_def === true) c += 'spanning-tree portfast bpduguard default\n';
            if (data.loopguard === true) c += 'spanning-tree loopguard default\n';
            if (data.uplinkfast === true) c += 'spanning-tree uplinkfast\n';
            if (data.access_int) { c += '!\ninterface ' + data.access_int + '\n spanning-tree portfast edge\n spanning-tree bpduguard enable\nexit\n'; }
            if (data.trunk_int) { c += '!\ninterface ' + data.trunk_int + '\n spanning-tree port-priority 64\nexit\n'; }
            if (data.rootguard_ports) { c += '!\ninterface ' + data.rootguard_ports + '\n spanning-tree guard root\nexit\n'; }
            c += '!\n! Doğrulama: show spanning-tree | show spanning-tree detail\n';
            return c;
        });
    }
};

// ── PORT SECURITY ─────────────────────────────────────────────────────────────
CiscoIOS.portSecurity = {
    label: 'Port Security',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-shield-alt',
                title: 'Port Security — MAC Tabanlı Erişim Kontrolü',
                desc: 'Switch portunda izin verilen MAC adreslerini sınırlar. Yetkisiz cihaz bağlantısını engeller ve ihlalde port\'u devre dışı bırakır.'
            },
            sections: [
                {
                    title: 'Interface Seçimi',
                    icon: 'fas fa-plug',
                    fields: [
                        { name: 'ps_iface', label: 'Interface', type: 'text', required: true, placeholder: 'FastEthernet0/1', hint: 'Tekil port. Range için "range Fa0/1 - Fa0/10" formatında girebilirsiniz.' },
                        { name: 'access_vlan', label: 'Access VLAN', type: 'number', placeholder: '10', hint: 'Port security access modda çalışır — VLAN ataması yapılır', optional: true }
                    ]
                },
                {
                    title: 'Port Security Parametreleri',
                    icon: 'fas fa-lock',
                    fields: [
                        { name: 'max_mac', label: 'Max MAC', type: 'number', value: '1', min: 1, hint: 'Portta izin verilen maksimum MAC adresi sayısı' },
                        { name: 'violation', label: 'Violation Aksiyonu', type: 'select', options: [
                            { value: 'shutdown', label: 'shutdown — Port kapanır (önerilen)' },
                            { value: 'restrict', label: 'restrict — Paket drop + log' },
                            { value: 'protect', label: 'protect — Paket drop, log yok' }
                        ]},
                        { name: 'sticky', label: 'Sticky MAC learning etkinleştir', type: 'checkbox', checked: true, hint: 'Öğrenilen MAC adresleri running-config\'e kaydedilir' },
                        { name: 'sticky_mac', label: 'Sticky MAC (manuel)', type: 'text', placeholder: '0000.1111.2222 (boş = dynamic)', hint: 'Belirli bir MAC adresi sabitlemek istiyorsanız girin', optional: true },
                        { name: 'aging_time', label: 'Aging Time (dk)', type: 'number', placeholder: '30', optional: true },
                        { name: 'aging_type', label: 'Aging Type', type: 'select', options: [
                            { value: '', label: 'Yok' },
                            { value: 'absolute', label: 'absolute' },
                            { value: 'inactivity', label: 'inactivity' }
                        ]}
                    ]
                },
                {
                    title: 'Auto Recovery',
                    icon: 'fas fa-redo',
                    info: 'Violation sonucu err-disabled olan portun otomatik kurtarılması.',
                    fields: [
                        { name: 'auto_rec', label: 'errdisable recovery etkinleştir', type: 'checkbox' },
                        { name: 'rec_interval', label: 'Recovery Interval (sn)', type: 'number', placeholder: '300', optional: true }
                    ]
                }
            ],
            submit: 'Port Security Konfigürasyonu Oluştur'
        }, (data) => {
            const ifaceStr = data.ps_iface;
            let c = '! ========================================\n! Cisco IOS Port Security Configuration\n! ========================================\n\n';
            if (data.auto_rec === true) {
                c += 'errdisable recovery interval ' + (data.rec_interval || '300') + '\nerrdisable recovery cause psecure-violation\n!\n';
            }
            c += 'interface ' + ifaceStr + '\n switchport mode access\n';
            if (data.access_vlan) c += ' switchport access vlan ' + data.access_vlan + '\n';
            c += ' switchport port-security\n';
            c += ' switchport port-security maximum ' + (data.max_mac || '1') + '\n';
            c += ' switchport port-security violation ' + (data.violation || 'shutdown') + '\n';
            if (data.sticky === true) {
                c += ' switchport port-security mac-address sticky\n';
                if (data.sticky_mac) c += ' switchport port-security mac-address sticky ' + data.sticky_mac + '\n';
            }
            if (data.aging_time) {
                c += ' switchport port-security aging time ' + data.aging_time + '\n';
                if (data.aging_type) c += ' switchport port-security aging type ' + data.aging_type + '\n';
            }
            c += 'exit\n!\n! Doğrulama: show port-security | show port-security address\n';
            return c;
        });
    }
};

// ── QoS ───────────────────────────────────────────────────────────────────────
CiscoIOS.qos = {
    label: 'QoS',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-tachometer-alt',
                title: 'QoS — Quality of Service',
                desc: 'Quality of Service — trafik önceliklendirme. DSCP/CoS işaretleme, policing (trafik sınırlama) ve shaping (tampon kullanımı).'
            },
            configTypes: [
                { id: 'manual', label: 'Manuel QoS', icon: 'fas fa-sliders-h', desc: 'Class-Map + Policy-Map — tam kontrol', badge: { text: 'Esnek', cls: 'advanced' } },
                { id: 'ratelimit', label: 'Rate Limit', icon: 'fas fa-tachometer-alt', desc: 'Basit bant genişliği sınırlama', badge: { text: 'Basit', cls: 'common' } },
                { id: 'auto', label: 'Auto QoS', icon: 'fas fa-magic', desc: 'Cisco IP telefon için otomatik QoS', badge: { text: 'VoIP', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'Class-Map / Policy-Map',
                    icon: 'fas fa-layer-group',
                    showFor: ['manual'],
                    fields: [
                        { name: 'class_name', label: 'Class-Map Adı', type: 'text', required: true, placeholder: 'VOICE-CLASS' },
                        { name: 'match_type', label: 'Match Tipi', type: 'select', options: [{ value: 'dscp', label: 'DSCP' }, { value: 'protocol', label: 'Protocol' }, { value: 'acl', label: 'ACL' }] },
                        { name: 'match_val', label: 'Match Değeri', type: 'text', placeholder: 'ef | voip | VOICE-ACL', optional: true },
                        { name: 'policy_name', label: 'Policy-Map Adı', type: 'text', required: true, placeholder: 'QOS-POLICY' },
                        { name: 'set_dscp', label: 'Set DSCP', type: 'select', options: [{ value: '', label: 'Yok' }, { value: 'ef', label: 'ef (Voice)' }, { value: 'af41', label: 'af41' }, { value: 'af31', label: 'af31' }, { value: 'cs3', label: 'cs3' }] },
                        { name: 'police_en', label: 'Police ekle', type: 'checkbox' },
                        { name: 'm_cir', label: 'CIR (bps)', type: 'text', placeholder: '1000000', optional: true },
                        { name: 'qos_iface', label: 'Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0' },
                        { name: 'qos_dir', label: 'Yön', type: 'select', options: [{ value: 'output', label: 'output' }, { value: 'input', label: 'input' }] }
                    ]
                },
                {
                    title: 'Rate Limit Parametreleri',
                    icon: 'fas fa-tachometer-alt',
                    showFor: ['ratelimit'],
                    fields: [
                        { name: 'rl_iface', label: 'Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/0' },
                        { name: 'rl_acl', label: 'ACL', type: 'text', placeholder: '100 (boş = tüm trafik)', optional: true },
                        { name: 'rl_rate', label: 'Rate (bps)', type: 'text', required: true, placeholder: '1000000' },
                        { name: 'rl_bc', label: 'Normal Burst', type: 'text', placeholder: '187500', optional: true },
                        { name: 'rl_be', label: 'Extended Burst', type: 'text', placeholder: '375000', optional: true },
                        { name: 'rl_dir', label: 'Yön', type: 'select', options: [{ value: 'output', label: 'output' }, { value: 'input', label: 'input' }] }
                    ]
                },
                {
                    title: 'Auto QoS Parametreleri',
                    icon: 'fas fa-magic',
                    showFor: ['auto'],
                    fields: [
                        { name: 'aq_iface', label: 'Interface', type: 'text', required: true, placeholder: 'GigabitEthernet0/1' },
                        { name: 'aq_type', label: 'Tip', type: 'select', options: [{ value: 'cisco-phone', label: 'cisco-phone' }, { value: 'cisco-softphone', label: 'cisco-softphone' }, { value: 'trust', label: 'trust' }] },
                        { name: 'mls_qos', label: 'mls qos (global) ekle', type: 'checkbox' }
                    ]
                }
            ],
            submit: 'QoS Konfigürasyonu Oluştur'
        }, (data) => {
            const mode = data._cgtype;
            let c = '! ========================================\n! Cisco IOS QoS Configuration\n! ========================================\n\n';
            if (mode === 'manual') {
                const mt = data.match_type, mv = data.match_val, cn = data.class_name;
                c += 'class-map match-all ' + cn + '\n';
                if (mv) {
                    const matchMap = { dscp: 'match dscp ', protocol: 'match protocol ', acl: 'match access-group name ' };
                    c += ' ' + (matchMap[mt] || 'match dscp ') + mv + '\n';
                }
                c += '!\npolicy-map ' + data.policy_name + '\n class ' + cn + '\n';
                if (data.set_dscp) c += '  set dscp ' + data.set_dscp + '\n';
                if (data.police_en === true && data.m_cir) c += '  police cir ' + data.m_cir + '\n   conform-action transmit\n   exceed-action drop\n';
                c += ' class class-default\n  fair-queue\n!\ninterface ' + data.qos_iface + '\n service-policy ' + (data.qos_dir || 'output') + ' ' + data.policy_name + '\n!\n';
            } else if (mode === 'ratelimit') {
                const bc = data.rl_bc || '187500', be = data.rl_be || '375000';
                c += 'interface ' + data.rl_iface + '\n rate-limit ' + (data.rl_dir || 'output') + (data.rl_acl ? ' access-group ' + data.rl_acl : '') + ' ' + data.rl_rate + ' ' + bc + ' ' + be + ' conform-action transmit exceed-action drop\n!\n';
            } else {
                if (data.mls_qos === true) c += 'mls qos\n!\n';
                c += 'interface ' + data.aq_iface + '\n auto qos voip ' + (data.aq_type || 'cisco-phone') + '\n mls qos trust dscp\n!\n';
            }
            c += '! Doğrulama: show policy-map interface | show mls qos interface\n';
            return c;
        });
    }
};

// ── GRE TUNNEL ────────────────────────────────────────────────────────────────
CiscoIOS.gre = {
    label: 'GRE Tunnel',
    init(container) {
        cgFormBuilder(container, {
            topic: {
                icon: 'fas fa-network-wired',
                title: 'GRE — Generic Routing Encapsulation',
                desc: 'Generic Routing Encapsulation — tünel protokolü. Multicast ve routing protokollerini taşıyabilir, şifresiz (IPSec ile kombinlenebilir).'
            },
            configTypes: [
                { id: 'gre', label: 'Standard GRE', icon: 'fas fa-long-arrow-alt-right', desc: 'Basit GRE tüneli — şifresiz', badge: { text: 'Basit', cls: 'common' } },
                { id: 'ipsec', label: 'GRE over IPSec', icon: 'fas fa-lock', desc: 'GRE + IPSec şifreleme', badge: { text: 'Güvenli', cls: 'recommended' } },
                { id: 'mgre', label: 'mGRE (DMVPN)', icon: 'fas fa-project-diagram', desc: 'Multipoint GRE — hub-and-spoke dinamik tünel', badge: { text: 'DMVPN', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Tunnel Parametreleri',
                    icon: 'fas fa-cog',
                    showFor: ['gre', 'ipsec', 'mgre'],
                    fields: [
                        { name: 'tun_int', label: 'Tunnel Interface', type: 'text', required: true, placeholder: 'Tunnel0', hint: 'Sanal tünel arayüzü numarası' },
                        { name: 'tun_ip', label: 'Tunnel IP', type: 'text', placeholder: '10.10.10.1', optional: true },
                        { name: 'tun_mask', label: 'Tunnel Mask', type: 'text', placeholder: '255.255.255.252', optional: true },
                        { name: 'tun_src', label: 'Tunnel Source', type: 'text', required: true, placeholder: 'GigabitEthernet0/0 veya 1.2.3.4', hint: 'Tünelin kaynak interface veya IP adresi' },
                        { name: 'tun_dst', label: 'Tunnel Destination', type: 'text', placeholder: '5.6.7.8 (mGRE için boş)', hint: 'Karşı uç public IP. mGRE\'de boş bırakın.', optional: true },
                        { name: 'tun_mtu', label: 'MTU', type: 'number', placeholder: '1400', hint: 'GRE overhead için önerilen: 1400', optional: true },
                        { name: 'tun_mss', label: 'TCP MSS', type: 'number', placeholder: '1360', optional: true },
                        { name: 'keepalive', label: 'Keepalive', type: 'text', placeholder: '10 3 (interval retries)', optional: true }
                    ]
                },
                {
                    title: 'IPSec Profil',
                    icon: 'fas fa-lock',
                    showFor: ['ipsec'],
                    fields: [
                        { name: 'ipsec_peer', label: 'Peer IP', type: 'text', required: true, validate: 'ip', placeholder: '5.6.7.8' },
                        { name: 'ipsec_psk', label: 'Pre-shared Key', type: 'text', required: true, placeholder: 'MySecretKey123' },
                        { name: 'ts_name', label: 'Transform-Set Adı', type: 'text', value: 'GRE-TS', placeholder: 'GRE-TS' },
                        { name: 'ipsec_profile', label: 'Profile Adı', type: 'text', value: 'GRE-IPSEC-PROFILE', placeholder: 'GRE-IPSEC-PROFILE' }
                    ]
                },
                {
                    title: 'Routing',
                    icon: 'fas fa-route',
                    showFor: ['gre', 'ipsec', 'mgre'],
                    fields: [
                        { name: 'routing_type', label: 'Routing Tipi', type: 'select', options: [{ value: 'none', label: 'Yok' }, { value: 'static', label: 'Static Route' }, { value: 'ospf', label: 'OSPF' }, { value: 'eigrp', label: 'EIGRP' }] },
                        { name: 'remote_net', label: 'Remote Network', type: 'text', validate: 'cidr', placeholder: '192.168.2.0 255.255.255.0', optional: true },
                        { name: 'routing_pid', label: 'Process ID / AS', type: 'text', placeholder: '1', optional: true },
                        { name: 'ospf_area', label: 'Area (OSPF)', type: 'text', placeholder: '0', optional: true }
                    ]
                }
            ],
            submit: 'GRE Tunnel Konfigürasyonu Oluştur'
        }, (data) => {
            const type = data._cgtype;
            let c = '! ========================================\n! Cisco IOS GRE Tunnel Configuration\n! ========================================\n\n';
            if (type === 'ipsec') {
                const peer = data.ipsec_peer, psk = data.ipsec_psk;
                const ts = data.ts_name || 'GRE-TS', prof = data.ipsec_profile || 'GRE-IPSEC-PROFILE';
                c += 'crypto isakmp policy 10\n encr aes 256\n authentication pre-share\n group 5\n lifetime 86400\nexit\ncrypto isakmp key ' + psk + ' address ' + peer + '\n!\n';
                c += 'crypto ipsec transform-set ' + ts + ' esp-aes 256 esp-sha-hmac\n mode transport\nexit\n!\ncrypto ipsec profile ' + prof + '\n set transform-set ' + ts + '\nexit\n!\n';
            }
            c += 'interface ' + data.tun_int + '\n description GRE Tunnel\n';
            if (data.tun_ip && data.tun_mask) c += ' ip address ' + data.tun_ip + ' ' + data.tun_mask + '\n';
            c += ' tunnel source ' + data.tun_src + '\n';
            if (data.tun_dst) c += ' tunnel destination ' + data.tun_dst + '\n';
            if (type === 'mgre') c += ' tunnel mode gre multipoint\n';
            else if (type === 'ipsec') c += ' tunnel protection ipsec profile ' + (data.ipsec_profile || 'GRE-IPSEC-PROFILE') + '\n';
            if (data.tun_mtu) c += ' ip mtu ' + data.tun_mtu + '\n';
            if (data.tun_mss) c += ' ip tcp adjust-mss ' + data.tun_mss + '\n';
            if (data.keepalive) c += ' keepalive ' + data.keepalive + '\n';
            c += ' no shutdown\nexit\n!\n';
            const rt = data.routing_type, rn = data.remote_net, pid = data.routing_pid;
            if (rt === 'static' && rn) {
                c += 'ip route ' + rn + ' ' + data.tun_int + '\n';
            } else if (rt === 'ospf' && pid) {
                c += 'router ospf ' + pid + '\n network ' + (data.tun_ip || '0.0.0.0') + ' 0.0.0.0 area ' + (data.ospf_area || '0') + '\n!\ninterface ' + data.tun_int + '\n ip ospf network point-to-point\n!\n';
            } else if (rt === 'eigrp' && pid) {
                c += 'router eigrp ' + pid + '\n network ' + (data.tun_ip || '0.0.0.0') + ' 0.0.0.0\n no auto-summary\n!\n';
            }
            c += '! Doğrulama: show interface ' + (data.tun_int || 'Tunnel0') + ' | show ip route\n';
            return c;
        });
    }
};

// ── IP TRACKING / IP SLA ──────────────────────────────────────────────────────
CiscoIOS.tracking = {
    label: 'IP Tracking/SLA',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-heartbeat', title: 'IP Tracking / IP SLA', desc: 'Interface, IP SLA, route ve track list izleme konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'iface', label: 'Interface',   icon: 'fas fa-ethernet',   desc: 'Interface line-protocol tracking', badge: { text: 'Yaygın',    cls: 'common' } },
                { id: 'ipsla', label: 'IP SLA',      icon: 'fas fa-heartbeat',  desc: 'ICMP/TCP SLA probe + track',       badge: { text: 'Önerilen',  cls: 'recommended' } },
                { id: 'route', label: 'IP Route',    icon: 'fas fa-route',      desc: 'Rota erişilebilirlik takibi',      badge: { text: 'Gelişmiş',  cls: 'advanced' } },
                { id: 'list',  label: 'Track List',  icon: 'fas fa-list',       desc: 'Birden fazla track nesnesi listesi',badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'Interface Tracking', icon: 'fas fa-ethernet', showFor: ['iface'], warn: null, info: null,
                    fields: [
                        { name: 'track_id',    label: 'Track ID',        type: 'text', required: true,  placeholder: '1',                  hint: 'Takip nesnesi numarası' },
                        { name: 'track_iface', label: 'Interface',       type: 'text', required: true,  placeholder: 'GigabitEthernet0/0', hint: 'İzlenecek interface' },
                        { name: 'delay_down',  label: 'Delay Down (sn)', type: 'text', required: false, placeholder: '10',                 hint: 'Down gecikmesi (saniye)' },
                        { name: 'delay_up',    label: 'Delay Up (sn)',   type: 'text', required: false, placeholder: '10',                 hint: 'Up gecikmesi (saniye)' }
                    ]
                },
                {
                    title: 'IP SLA', icon: 'fas fa-heartbeat', showFor: ['ipsla'], warn: null, info: null,
                    fields: [
                        { name: 'sla_id',       label: 'SLA ID',           type: 'text',   required: true,  placeholder: '10',                 hint: 'IP SLA operasyon numarası' },
                        { name: 'sla_track_id', label: 'Track ID',         type: 'text',   required: true,  placeholder: '1',                  hint: 'Track nesnesi numarası' },
                        { name: 'sla_type',     label: 'SLA Tipi',         type: 'select', required: false, options: [{v:'icmp',l:'ICMP Echo'},{v:'tcp',l:'TCP Connect'}] },
                        { name: 'sla_dest',     label: 'Hedef IP',         type: 'text',   required: true,  placeholder: '8.8.8.8',            hint: 'Probe hedef IP' },
                        { name: 'sla_src',      label: 'Source Interface', type: 'text',   required: false, placeholder: 'GigabitEthernet0/0', hint: 'Kaynak interface (opsiyonel)' },
                        { name: 'sla_freq',     label: 'Frequency (sn)',   type: 'text',   required: false, placeholder: '60',                 hint: 'Probe sıklığı' },
                        { name: 'sla_timeout',  label: 'Timeout (ms)',     type: 'text',   required: false, placeholder: '5000',               hint: 'Zaman aşımı' }
                    ]
                },
                {
                    title: 'Route Tracking', icon: 'fas fa-route', showFor: ['route'], warn: null, info: null,
                    fields: [
                        { name: 'rt_track_id', label: 'Track ID', type: 'text', required: true, placeholder: '1',         hint: 'Track nesnesi numarası' },
                        { name: 'rt_network',  label: 'Network',  type: 'text', required: true, placeholder: '0.0.0.0',   hint: 'İzlenecek ağ adresi' },
                        { name: 'rt_mask',     label: 'Mask',     type: 'text', required: true, placeholder: '0.0.0.0',   hint: 'Alt ağ maskesi' }
                    ]
                },
                {
                    title: 'Track List', icon: 'fas fa-list', showFor: ['list'], warn: null, info: null,
                    fields: [
                        { name: 'tl_id',      label: 'Track ID',       type: 'text',   required: true,  placeholder: '10',      hint: 'Track list numarası' },
                        { name: 'tl_type',    label: 'List Tipi',      type: 'select', required: false, options: [{v:'boolean-and',l:'boolean-and'},{v:'boolean-or',l:'boolean-or'},{v:'threshold percentage',l:'threshold percentage'}] },
                        { name: 'tl_objects', label: 'Objects (virgülle)', type: 'text', required: false, placeholder: '1,2,3', hint: 'Track nesneleri' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const type = fv('_cgtype');
            let c = '! ========================================\n! Cisco IOS IP Tracking / IP SLA\n! ========================================\n\n';
            if (type === 'iface') {
                c += 'track ' + fv('track_id') + ' interface ' + fv('track_iface') + ' line-protocol\n';
                const dd = fv('delay_down'), du = fv('delay_up');
                if (dd || du) c += ' delay down ' + (dd||'0') + ' up ' + (du||'0') + '\n';
                c += '!\n';
            } else if (type === 'ipsla') {
                const sid = fv('sla_id'), stype = fv('sla_type'), sdest = fv('sla_dest');
                const ssrc = fv('sla_src'), freq = fv('sla_freq') || '60', tout = fv('sla_timeout') || '5000';
                c += 'ip sla ' + sid + '\n';
                if (stype === 'icmp') {
                    c += ' icmp-echo ' + sdest + (ssrc ? ' source-interface ' + ssrc : '') + '\n';
                } else {
                    c += ' tcp-connect ' + sdest + ' 80\n';
                }
                c += ' frequency ' + freq + '\n timeout ' + tout + '\nexit\n';
                c += 'ip sla schedule ' + sid + ' life forever start-time now\n!\n';
                c += 'track ' + fv('sla_track_id') + ' ip sla ' + sid + ' reachability\n!\n';
            } else if (type === 'route') {
                c += 'track ' + fv('rt_track_id') + ' ip route ' + fv('rt_network') + ' ' + fv('rt_mask') + ' reachability\n!\n';
            } else if (type === 'list') {
                const objs = fv('tl_objects').split(',').map(s => s.trim()).filter(Boolean);
                c += 'track ' + fv('tl_id') + ' list ' + fv('tl_type') + '\n';
                objs.forEach(o => { c += ' object ' + cgEsc(o) + '\n'; });
                c += '!\n';
            }
            c += '! Doğrulama: show track | show ip sla statistics\n';
            return c;
        });
    }
};

// ── RATE LIMIT ────────────────────────────────────────────────────────────────
CiscoIOS.rateLimit = {
    label: 'Rate Limit',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-tachometer-alt', title: 'Rate Limit', desc: 'ACL tabanlı interface rate limiting (police) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'ratelimit', label: 'Rate Limit', icon: 'fas fa-tachometer-alt', desc: 'Interface rate-limit komutu', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Rate Limit Parametreleri', icon: 'fas fa-tachometer-alt', showFor: ['ratelimit'], warn: null, info: null,
                    fields: [
                        { name: 'rl_iface',   label: 'Interface',           type: 'text',   required: true,  placeholder: 'GigabitEthernet0/0',         hint: 'Rate limit uygulanacak interface' },
                        { name: 'rl_acl',     label: 'ACL No/Adı',          type: 'text',   required: false, placeholder: '100 (boş = tüm trafik)',      hint: 'Opsiyonel ACL filtresi' },
                        { name: 'ip_blocks',  label: 'IP Bloklar (satır satır)', type: 'textarea', required: false, placeholder: '192.168.1.0 0.0.0.255\n10.0.0.0 0.0.0.255', hint: 'ACL için permit satırları' },
                        { name: 'rl_cir',     label: 'CIR (bps)',           type: 'text',   required: true,  placeholder: '1000000',                    hint: 'Committed Information Rate' },
                        { name: 'rl_bc',      label: 'Bc (normal burst)',    type: 'text',   required: false, placeholder: '187500',                     hint: 'Normal burst boyutu' },
                        { name: 'rl_be',      label: 'Be (extended burst)', type: 'text',   required: false, placeholder: '375000',                     hint: 'Genişletilmiş burst boyutu' },
                        { name: 'rl_dir',     label: 'Yön',                 type: 'select', required: false, options: [{v:'output',l:'output'},{v:'input',l:'input'},{v:'both',l:'input + output'}] },
                        { name: 'rl_conform', label: 'Conform Action',      type: 'select', required: false, options: [{v:'transmit',l:'transmit'},{v:'set-dscp-transmit 0',l:'set-dscp-transmit'}] },
                        { name: 'rl_exceed',  label: 'Exceed Action',       type: 'select', required: false, options: [{v:'drop',l:'drop'},{v:'set-dscp-transmit 0',l:'set-dscp-transmit'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const acl = fv('rl_acl'), cir = fv('rl_cir'), bc = fv('rl_bc') || '187500', be = fv('rl_be') || '375000';
            const dir = fv('rl_dir') || 'output', iface = fv('rl_iface'), conf = fv('rl_conform') || 'transmit', exc = fv('rl_exceed') || 'drop';
            let c = '! ========================================\n! Cisco IOS Rate Limit Configuration\n! ========================================\n\n';
            const blocks = fv('ip_blocks');
            if (blocks && acl) {
                blocks.split('\n').forEach(line => {
                    const b = line.trim(); if (b) c += 'access-list ' + acl + ' permit ip ' + cgEsc(b) + ' any\n';
                });
                c += '!\n';
            }
            c += 'interface ' + iface + '\n';
            const rlLine = (d) => ' rate-limit ' + d + (acl ? ' access-group ' + acl : '') + ' ' + cir + ' ' + bc + ' ' + be + ' conform-action ' + conf + ' exceed-action ' + exc + '\n';
            if (dir === 'both') { c += rlLine('input'); c += rlLine('output'); }
            else { c += rlLine(dir); }
            c += 'exit\n!\n! Doğrulama: show interfaces ' + iface + ' rate-limit\n';
            return c;
        });
    }
};
// ── ADVANCED MULTI-CONFIG ─────────────────────────────────────────────────────
CiscoIOS.advanced = {
    label: 'Advanced Multi-Config',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-layer-group', title: 'Advanced Multi-Config', desc: 'VLAN, ACL, Static Route, OSPF, BGP ve VRRP/HSRP snippet\'lerini tek formdan üretir.' },
            configTypes: [
                { id: 'advanced', label: 'Multi-Config', icon: 'fas fa-layer-group', desc: 'İstediğiniz bölümleri etkinleştirin', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VLAN / Trunk', icon: 'fas fa-network-wired', showFor: ['advanced'], warn: null,
                    info: 'VLAN ve trunk ayarları — boş bırakılan alanlar çıktıya eklenmez.',
                    fields: [
                        { name: 'sec_vlan',      label: 'VLAN/Trunk Ekle', type: 'checkbox', required: false },
                        { name: 'adv_vlan_id',   label: 'VLAN ID',         type: 'text',     required: false, placeholder: '10' },
                        { name: 'adv_vlan_name', label: 'VLAN Name',       type: 'text',     required: false, placeholder: 'SALES' },
                        { name: 'adv_trunk_iface',label: 'Trunk Interface',type: 'text',     required: false, placeholder: 'GigabitEthernet0/1' }
                    ]
                },
                {
                    title: 'ACL', icon: 'fas fa-filter', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_acl',      label: 'ACL Ekle',       type: 'checkbox', required: false },
                        { name: 'adv_acl_name', label: 'ACL Adı',        type: 'text',     required: false, placeholder: 'MGMT-ACL' },
                        { name: 'adv_acl_net',  label: 'Permit Network', type: 'text',     required: false, placeholder: '10.0.0.0 0.0.0.255' }
                    ]
                },
                {
                    title: 'Static Route', icon: 'fas fa-route', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_route',  label: 'Static Route Ekle', type: 'checkbox', required: false },
                        { name: 'adv_rt_net', label: 'Network',           type: 'text',     required: false, placeholder: '0.0.0.0 0.0.0.0' },
                        { name: 'adv_rt_nh',  label: 'Next-hop',          type: 'text',     required: false, placeholder: '192.168.1.1' }
                    ]
                },
                {
                    title: 'OSPF Snippet', icon: 'fas fa-project-diagram', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_ospf',      label: 'OSPF Ekle', type: 'checkbox', required: false },
                        { name: 'adv_ospf_pid',  label: 'PID',       type: 'text',     required: false, placeholder: '1' },
                        { name: 'adv_ospf_net',  label: 'Network',   type: 'text',     required: false, placeholder: '192.168.0.0 0.0.0.255' },
                        { name: 'adv_ospf_area', label: 'Area',      type: 'text',     required: false, placeholder: '0' }
                    ]
                },
                {
                    title: 'BGP Snippet', icon: 'fas fa-exchange-alt', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_bgp',       label: 'BGP Ekle',   type: 'checkbox', required: false },
                        { name: 'adv_bgp_as',    label: 'Local AS',   type: 'text',     required: false, placeholder: '65001' },
                        { name: 'adv_bgp_peer',  label: 'Neighbor IP',type: 'text',     required: false, placeholder: '10.0.0.2' },
                        { name: 'adv_bgp_remote',label: 'Remote AS',  type: 'text',     required: false, placeholder: '65002' }
                    ]
                },
                {
                    title: 'VRRP/HSRP Snippet', icon: 'fas fa-redo', showFor: ['advanced'], warn: null, info: null,
                    fields: [
                        { name: 'sec_vrrp',   label: 'VRRP/HSRP Ekle', type: 'checkbox', required: false },
                        { name: 'adv_vr_iface',label: 'Interface',     type: 'text',     required: false, placeholder: 'GigabitEthernet0/0' },
                        { name: 'adv_vr_grp', label: 'Group/VRID',     type: 'text',     required: false, placeholder: '1' },
                        { name: 'adv_vr_vip', label: 'Virtual IP',     type: 'text',     required: false, placeholder: '192.168.1.254' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const cb = n => data[n] === 'on' || data[n] === true;
            let c = '! ========================================\n! Cisco IOS Advanced Multi-Config\n! ========================================\n\n';
            if (cb('sec_vlan')) {
                const vid = fv('adv_vlan_id'), vn = fv('adv_vlan_name'), ti = fv('adv_trunk_iface');
                if (vid) { c += 'vlan ' + vid + '\n'; if (vn) c += ' name ' + vn + '\n'; c += '!\n'; }
                if (ti) c += 'interface ' + ti + '\n switchport mode trunk\n switchport trunk encapsulation dot1q\n' + (vid ? ' switchport trunk allowed vlan add ' + vid + '\n' : '') + 'exit\n!\n';
            }
            if (cb('sec_acl')) {
                const an = fv('adv_acl_name'), net = fv('adv_acl_net');
                if (an) { c += 'ip access-list standard ' + an + '\n'; if (net) c += ' permit ' + net + '\n'; c += ' deny any\n!\n'; }
            }
            if (cb('sec_route')) {
                const rn = fv('adv_rt_net'), nh = fv('adv_rt_nh');
                if (rn && nh) c += 'ip route ' + rn + ' ' + nh + '\n!\n';
            }
            if (cb('sec_ospf')) {
                const pid = fv('adv_ospf_pid') || '1', net = fv('adv_ospf_net'), area = fv('adv_ospf_area') || '0';
                c += 'router ospf ' + pid + '\n'; if (net) c += ' network ' + net + ' area ' + area + '\n'; c += 'exit\n!\n';
            }
            if (cb('sec_bgp')) {
                const as = fv('adv_bgp_as'), peer = fv('adv_bgp_peer'), ra = fv('adv_bgp_remote');
                if (as) { c += 'router bgp ' + as + '\n'; if (peer && ra) c += ' neighbor ' + peer + ' remote-as ' + ra + '\n'; c += 'exit\n!\n'; }
            }
            if (cb('sec_vrrp')) {
                const vi = fv('adv_vr_iface'), vg = fv('adv_vr_grp'), vip = fv('adv_vr_vip');
                if (vi && vg && vip) c += 'interface ' + vi + '\n standby version 2\n standby ' + vg + ' ip ' + vip + '\n standby ' + vg + ' preempt\nexit\n!\n';
            }
            if (c.endsWith('! ========================================\n! Cisco IOS Advanced Multi-Config\n! ========================================\n\n')) {
                c += '! En az bir bölüm seçin.\n';
            }
            return c;
        });
    }
};

// ── EtherChannel / LACP ───────────────────────────────────────────────────────
CiscoIOS.etherchannel = {
    label: 'EtherChannel / LACP',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-link', title: 'EtherChannel / LACP', desc: 'Port-Channel ve üye interface LACP/statik EtherChannel konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'trunk',  label: 'Trunk Mode',  icon: 'fas fa-network-wired', desc: 'Trunk port-channel (multi-VLAN)', badge: { text: 'Yaygın',   cls: 'common' } },
                { id: 'access', label: 'Access Mode',  icon: 'fas fa-plug',          desc: 'Access port-channel (tek VLAN)', badge: { text: 'Yaygın',   cls: 'common' } }
            ],
            sections: [
                {
                    title: 'EtherChannel Temel', icon: 'fas fa-link', showFor: ['trunk', 'access'], warn: null, info: null,
                    fields: [
                        { name: 'pc_num',       label: 'Port-Channel No',      type: 'text',   required: true,  placeholder: '1',                   hint: 'Port-channel numarası' },
                        { name: 'member_range', label: 'Üye Interface Aralığı',type: 'text',   required: true,  placeholder: 'GigabitEthernet0/1-2', hint: 'Interface range komutu için' },
                        { name: 'lacp_mode',    label: 'LACP Modu',            type: 'select', required: false, options: [{v:'active',l:'active (LACP gönder + bekle)'},{v:'passive',l:'passive (LACP yalnız bekle)'},{v:'on',l:'on (statik, LACP yok)'}] },
                        { name: 'desc',         label: 'Açıklama',             type: 'text',   required: false, placeholder: 'UPLINK-LAG-to-CORE',   hint: 'Interface description' }
                    ]
                },
                {
                    title: 'Trunk Ayarları', icon: 'fas fa-network-wired', showFor: ['trunk'], warn: null, info: null,
                    fields: [
                        { name: 'allowed_vlans', label: 'Allowed VLANs', type: 'text', required: false, placeholder: '10,20,30 veya all', hint: 'Trunk allowed VLAN listesi' },
                        { name: 'native_vlan',   label: 'Native VLAN',   type: 'text', validate: 'vlan', required: false, placeholder: '1',                hint: 'Native VLAN (opsiyonel)' }
                    ]
                },
                {
                    title: 'Access Ayarları', icon: 'fas fa-plug', showFor: ['access'], warn: null, info: null,
                    fields: [
                        { name: 'access_vlan', label: 'Access VLAN', type: 'text', required: false, placeholder: '10', hint: 'Access VLAN numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const pcNum = fv('pc_num'), memberRange = fv('member_range');
            const lacpMode = fv('lacp_mode') || 'active', pcMode = fv('_cgtype');
            const desc = fv('desc'), allowedVlans = fv('allowed_vlans');
            const nativeVlan = fv('native_vlan'), accessVlan = fv('access_vlan');
            let c = '! ========================================\n! Cisco IOS — EtherChannel / LACP\n! ========================================\n\n';
            c += '! Port-Channel Interface\ninterface Port-channel' + pcNum + '\n';
            if (desc) c += ' description ' + desc + '\n';
            if (pcMode === 'trunk') {
                c += ' switchport mode trunk\n';
                if (allowedVlans) c += ' switchport trunk allowed vlan ' + allowedVlans + '\n';
                if (nativeVlan) c += ' switchport trunk native vlan ' + nativeVlan + '\n';
            } else {
                c += ' switchport mode access\n';
                if (accessVlan) c += ' switchport access vlan ' + accessVlan + '\n';
            }
            c += ' no shutdown\n!\n\n';
            c += '! Üye Interfaces\ninterface range ' + memberRange + '\n';
            if (desc) c += ' description ' + desc + '-MEMBER\n';
            c += ' channel-group ' + pcNum + ' mode ' + lacpMode + '\n';
            c += ' no shutdown\n!\n\n';
            c += '! Doğrulama:\n! show etherchannel summary\n! show etherchannel ' + pcNum + ' detail\n! show interfaces Port-channel' + pcNum + '\n';
            return c;
        });
    }
};

// ── DMVPN Phase 1/2/3 ────────────────────────────────────────────────────────
CiscoIOS.dmvpn = {
    label: 'DMVPN',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-cloud', title: 'DMVPN Faz 1/2/3', desc: 'Hub veya Spoke rolü için GRE multipoint tunnel + NHRP konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'hub',   label: 'Hub',   icon: 'fas fa-network-wired', desc: 'DMVPN Hub — NHS, multicast dynamic', badge: { text: 'Önerilen', cls: 'recommended' } },
                { id: 'spoke', label: 'Spoke', icon: 'fas fa-sitemap',       desc: 'DMVPN Spoke — NHS map, shortcut',   badge: { text: 'Yaygın',   cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Tunnel Temel', icon: 'fas fa-cloud', showFor: ['hub', 'spoke'], warn: null, info: null,
                    fields: [
                        { name: 'tun_num',  label: 'Tunnel Numarası',  type: 'text', required: true, placeholder: '0',                       hint: 'Tunnel arayüz numarası' },
                        { name: 'tun_ip',   label: 'Tunnel IP / Mask', type: 'text', required: true, placeholder: '10.100.0.1 255.255.255.0', hint: 'Tunnel interface IP adresi' },
                        { name: 'wan_iface',label: 'WAN Interface',    type: 'text', required: true, placeholder: 'GigabitEthernet0/0',       hint: 'Tunnel kaynağı (fiziksel WAN)' },
                        { name: 'nhrp_id',  label: 'NHRP Network-ID', type: 'text', required: true, placeholder: '1',                        hint: 'NHRP network ID' },
                        { name: 'nhrp_key', label: 'NHRP Auth Key',   type: 'text', required: true, placeholder: 'cisco123',                 hint: 'NHRP kimlik doğrulama anahtarı' }
                    ]
                },
                {
                    title: 'Spoke — NHS Bilgileri', icon: 'fas fa-sitemap', showFor: ['spoke'], warn: null, info: null,
                    fields: [
                        { name: 'hub_wan', label: 'Hub WAN IP (NHS)',    type: 'text', required: false, placeholder: '203.0.113.1', hint: 'Hub fiziksel WAN IP' },
                        { name: 'hub_tun', label: 'Hub Tunnel IP (NHS)', type: 'text', required: false, placeholder: '10.100.0.1',  hint: 'Hub tunnel IP' }
                    ]
                },
                {
                    title: 'Protokol Seçenekleri', icon: 'fas fa-cogs', showFor: ['hub', 'spoke'], warn: null, info: null,
                    fields: [
                        { name: 'dmvpn_phase', label: 'DMVPN Faz',             type: 'select', required: false, options: [{v:'1',l:'Faz 1 (hub-spoke)'},{v:'2',l:'Faz 2 (spoke-to-spoke)'},{v:'3',l:'Faz 3 (NHRP redirect)'}] },
                        { name: 'routing',     label: 'Yönlendirme Protokolü', type: 'select', required: false, options: [{v:'ospf',l:'OSPF'},{v:'eigrp',l:'EIGRP'},{v:'bgp',l:'BGP'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const role = fv('_cgtype'), tunNum = fv('tun_num'), tunIp = fv('tun_ip');
            const wanIface = fv('wan_iface'), nhrpId = fv('nhrp_id'), nhrpKey = fv('nhrp_key');
            const phase = fv('dmvpn_phase') || '1', routing = fv('routing') || 'ospf';
            const hubWan = fv('hub_wan'), hubTun = fv('hub_tun');
            let c = '! ========================================\n! Cisco IOS — DMVPN Faz ' + phase + ' (' + (role === 'hub' ? 'Hub' : 'Spoke') + ')\n! ========================================\n\n';
            c += 'interface Tunnel' + tunNum + '\n';
            c += ' ip address ' + tunIp + '\n';
            c += ' tunnel source ' + wanIface + '\n';
            c += ' tunnel mode gre multipoint\n';
            c += ' ip nhrp network-id ' + nhrpId + '\n';
            c += ' ip nhrp authentication ' + nhrpKey + '\n';
            if (role === 'hub') {
                c += ' ip nhrp map multicast dynamic\n';
                if (phase === '3') c += ' ip nhrp redirect\n';
                if (routing === 'ospf') c += ' ip ospf network point-to-multipoint\n';
                if (routing === 'eigrp') c += ' no ip split-horizon eigrp 100\n no ip next-hop-self eigrp 100\n';
            } else {
                c += ' ip nhrp map multicast ' + hubWan + '\n';
                c += ' ip nhrp map ' + hubTun + ' ' + hubWan + '\n';
                c += ' ip nhrp nhs ' + hubTun + '\n';
                if (phase === '3') c += ' ip nhrp shortcut\n';
                if (routing === 'ospf') c += ' ip ospf network point-to-multipoint\n';
            }
            c += ' tunnel key ' + nhrpId + '\n!\n\n';
            if (routing === 'ospf') {
                c += '! OSPF — Tunnel interface area 0\'a ekle:\n! router ospf 1\n!  network 10.100.0.0 0.0.0.255 area 0\n\n';
            } else if (routing === 'eigrp') {
                c += '! EIGRP:\n! router eigrp 100\n!  network 10.100.0.0 0.0.0.255\n\n';
            }
            c += '! Doğrulama:\n! show dmvpn\n! show ip nhrp\n! show interface Tunnel' + tunNum + '\n';
            return c;
        });
    }
};

// ── EIGRP Named Mode ──────────────────────────────────────────────────────────
CiscoIOS.eigrpnamed = {
    label: 'EIGRP Named Mode',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-project-diagram', title: 'EIGRP Named Mode', desc: 'Modern EIGRP named mode konfigürasyonu — AF-interface, auth ve redistribute desteğiyle.' },
            configTypes: [
                { id: 'eigrpnamed', label: 'EIGRP Named', icon: 'fas fa-project-diagram', desc: 'Named mode EIGRP prosesi', badge: { text: 'Önerilen', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'EIGRP Named Mode', icon: 'fas fa-project-diagram', showFor: ['eigrpnamed'], warn: null, info: null,
                    fields: [
                        { name: 'proc_name',    label: 'Proses Adı',                   type: 'text',   required: true,  placeholder: 'CORP',             hint: 'EIGRP named process adı' },
                        { name: 'asn',          label: 'AS Numarası',                  type: 'text',   required: true,  placeholder: '100',              hint: 'Autonomous System numarası' },
                        { name: 'router_id',    label: 'Router-ID',                    type: 'text', validate: 'ip',   required: true,  placeholder: '1.1.1.1',          hint: 'EIGRP router-id' },
                        { name: 'network',      label: 'Network',                      type: 'text',   required: true,  placeholder: '10.0.0.0',         hint: 'CIDR veya classful network' },
                        { name: 'af_iface',     label: 'AF Interface',                 type: 'text',   required: true,  placeholder: 'GigabitEthernet0/0',hint: 'Auth + hello ayarları için' },
                        { name: 'hello',        label: 'Hello Interval (sn)',          type: 'text',   required: false, placeholder: '5',                hint: 'Hello timer (varsayılan: 5)' },
                        { name: 'hold',         label: 'Hold Time (sn)',               type: 'text',   required: false, placeholder: '15',               hint: 'Hold-time (varsayılan: 15)' },
                        { name: 'auth_key',     label: 'Auth Key',                     type: 'text',   required: false, placeholder: 'cisco123',         hint: 'MD5 kimlik doğrulama anahtarı (opsiyonel)' },
                        { name: 'redist_static',label: 'Redistribute Static',          type: 'select', required: false, options: [{v:'yes',l:'Evet'},{v:'no',l:'Hayır'}] }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const name = fv('proc_name'), asn = fv('asn'), rid = fv('router_id');
            const network = fv('network'), afIface = fv('af_iface');
            const hello = fv('hello') || '5', hold = fv('hold') || '15';
            const authKey = fv('auth_key'), redistStatic = fv('redist_static');
            let c = '! ========================================\n! Cisco IOS — EIGRP Named Mode\n! ========================================\n\n';
            c += 'router eigrp ' + name + '\n';
            c += ' address-family ipv4 unicast autonomous-system ' + asn + '\n';
            c += '  af-interface ' + afIface + '\n';
            c += '   hello-interval ' + hello + '\n';
            c += '   hold-time ' + hold + '\n';
            if (authKey) {
                c += '   authentication mode md5\n';
                c += '   authentication key-chain EIGRP-KEY\n';
            }
            c += '  exit-af-interface\n';
            c += '  topology base\n';
            if (redistStatic === 'yes') {
                c += '   redistribute static metric 1000 10 255 1 1500\n';
            }
            c += '  exit-af-topology\n';
            c += '  network ' + network + '\n';
            c += '  eigrp router-id ' + rid + '\n';
            c += ' exit-address-family\n!\n\n';
            if (authKey) {
                c += '! Auth Key Chain\nkey chain EIGRP-KEY\n key 1\n  key-string ' + authKey + '\n!\n\n';
            }
            c += '! Doğrulama:\n! show eigrp address-family ipv4 neighbors\n! show eigrp address-family ipv4 topology\n! show ip route eigrp\n';
            return c;
        });
    }
};

// ── VRF-Lite ──────────────────────────────────────────────────────────────────
CiscoIOS.vrflite = {
    label: 'VRF-Lite',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-sitemap', title: 'VRF-Lite', desc: 'VRF tanımı, interface atama ve opsiyonel default route konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'vrflite', label: 'VRF-Lite', icon: 'fas fa-sitemap', desc: 'VRF definition + interface + route', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'VRF-Lite Konfigürasyonu', icon: 'fas fa-sitemap', showFor: ['vrflite'], warn: null, info: null,
                    fields: [
                        { name: 'vrf_name',  label: 'VRF Adı',                    type: 'text', required: true,  placeholder: 'CORP',               hint: 'VRF ismi' },
                        { name: 'rd',        label: 'Route Distinguisher (RD)',    type: 'text', validate: 'rd', required: true,  placeholder: '65001:1',            hint: 'Benzersiz RD değeri' },
                        { name: 'rt_exp',    label: 'Route Target Export',         type: 'text', required: true,  placeholder: '65001:1',            hint: 'Export RT' },
                        { name: 'rt_imp',    label: 'Route Target Import',         type: 'text', required: true,  placeholder: '65001:1',            hint: 'Import RT' },
                        { name: 'vrf_iface', label: 'VRF Interface',              type: 'text', required: true,  placeholder: 'GigabitEthernet0/1', hint: 'VRF\'e atanacak interface' },
                        { name: 'iface_ip',  label: 'Interface IP / Mask',        type: 'text', validate: 'ip', required: true,  placeholder: '10.1.1.1 255.255.255.0', hint: 'Interface IP adresi' },
                        { name: 'vrf_gw',    label: 'VRF Default Route (Next-Hop)',type: 'text', required: false, placeholder: '10.1.1.254',         hint: 'VRF içi default gateway (opsiyonel)' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const vrfName = fv('vrf_name'), rd = fv('rd'), rtExp = fv('rt_exp'), rtImp = fv('rt_imp');
            const iface = fv('vrf_iface'), ifaceIp = fv('iface_ip'), gw = fv('vrf_gw');
            let c = '! ========================================\n! Cisco IOS — VRF-Lite\n! ========================================\n\n';
            c += 'vrf definition ' + vrfName + '\n';
            c += ' rd ' + rd + '\n';
            c += ' route-target export ' + rtExp + '\n';
            c += ' route-target import ' + rtImp + '\n';
            c += ' address-family ipv4\n exit-address-family\n!\n\n';
            c += 'interface ' + iface + '\n';
            c += ' vrf forwarding ' + vrfName + '\n';
            c += ' ip address ' + ifaceIp + '\n';
            c += ' no shutdown\n!\n\n';
            if (gw) {
                c += 'ip route vrf ' + vrfName + ' 0.0.0.0 0.0.0.0 ' + gw + '\n\n';
            }
            c += '! Doğrulama:\n! show vrf\n! show ip route vrf ' + vrfName + '\n! show interfaces ' + iface + ' | include VRF\n';
            return c;
        });
    }
};

// ── Cisco IOS: MPLS LDP ───────────────────────────────────────────────────────
CiscoIOS.mpls = {
    label: 'MPLS / LDP',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-tags', title: 'MPLS / LDP', desc: 'Global MPLS etkinleştirme, LDP router-id ve interface bazlı mpls ip konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'mpls', label: 'MPLS / LDP', icon: 'fas fa-tags', desc: 'LDP tabanlı MPLS konfigürasyonu', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'MPLS / LDP Konfigürasyonu', icon: 'fas fa-tags', showFor: ['mpls'], warn: null, info: null,
                    fields: [
                        { name: 'router_id',   label: 'Router ID (Loopback IP)',              type: 'text', validate: 'ip',     required: true,  placeholder: '1.1.1.1',                         hint: 'Loopback interface IP adresi' },
                        { name: 'lo_iface',    label: 'Loopback Interface',                   type: 'text',     required: true,  placeholder: 'Loopback0',                       hint: 'Loopback interface adı' },
                        { name: 'mpls_ifaces', label: 'MPLS Interface\'ler (her satıra bir)', type: 'textarea', required: true,  placeholder: 'GigabitEthernet0/0\nGigabitEthernet0/1', hint: 'mpls ip etkinleştirilecek interface\'ler' },
                        { name: 'ldp_rid_if',  label: 'LDP Router-ID Interface',              type: 'text',     required: true,  placeholder: 'Loopback0',                       hint: 'LDP router-id için interface' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const routerId = fv('router_id'), loIface = fv('lo_iface');
            const mplsIfaces = fv('mpls_ifaces').split('\n').map(s => s.trim()).filter(Boolean);
            const ldpRidIf = fv('ldp_rid_if');
            let c = '! ========================================\n! Cisco IOS — MPLS / LDP\n! ========================================\n\n';
            c += 'mpls ip\n';
            c += 'mpls ldp router-id ' + ldpRidIf + ' force\n\n';
            c += 'interface ' + loIface + '\n';
            c += ' ip address ' + routerId + ' 255.255.255.255\n\n';
            mplsIfaces.forEach(iface => {
                c += 'interface ' + iface + '\n';
                c += ' mpls ip\n\n';
            });
            c += '! Doğrulama:\n! show mpls ldp neighbor\n! show mpls ldp bindings\n! show mpls forwarding-table\n';
            return c;
        });
    }
};

// ── Cisco IOS: L3VPN (PE) ─────────────────────────────────────────────────────
CiscoIOS.l3vpn = {
    label: 'L3VPN (PE)',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-cloud-upload-alt', title: 'L3VPN PE Konfigürasyonu', desc: 'MPLS L3VPN PE tarafı — ip vrf, CE interface ve BGP VPNv4/VRF address-family yapılandırması.' },
            configTypes: [
                { id: 'l3vpn', label: 'L3VPN PE', icon: 'fas fa-cloud-upload-alt', desc: 'PE yönlendirici L3VPN konfigürasyonu', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'VRF & RD/RT', icon: 'fas fa-sitemap', showFor: ['l3vpn'], warn: null, info: null,
                    fields: [
                        { name: 'vrf_name',  label: 'VRF Adı',             type: 'text', required: true, placeholder: 'CUST_A',    hint: 'Müşteri VRF ismi' },
                        { name: 'rd',        label: 'Route Distinguisher',  type: 'text', validate: 'rd', required: true, placeholder: '65001:100', hint: 'Benzersiz RD değeri' },
                        { name: 'rt_import', label: 'Route Target Import',  type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Import RT' },
                        { name: 'rt_export', label: 'Route Target Export',  type: 'text', validate: 'rt', required: true, placeholder: '65001:100', hint: 'Export RT' }
                    ]
                },
                {
                    title: 'CE Interface & BGP', icon: 'fas fa-exchange-alt', showFor: ['l3vpn'], warn: null, info: null,
                    fields: [
                        { name: 'ce_iface',   label: 'CE Interface',       type: 'text', required: true,  placeholder: 'GigabitEthernet0/1',      hint: 'PE-CE bağlantı interface' },
                        { name: 'ce_ip',      label: 'CE Interface IP',    type: 'text', required: true,  placeholder: '10.1.1.1 255.255.255.252', hint: 'PE tarafı IP adresi' },
                        { name: 'local_as',   label: 'Local BGP AS (PE)',  type: 'text', validate: 'asn', required: true,  placeholder: '65001',                   hint: 'PE BGP AS numarası' },
                        { name: 'ce_as',      label: 'CE BGP AS',          type: 'text', validate: 'asn', required: false, placeholder: '65100',                   hint: 'CE BGP AS (opsiyonel)' },
                        { name: 'ce_neighbor',label: 'CE BGP Neighbor IP', type: 'text', required: false, placeholder: '10.1.1.2',                hint: 'CE\'nin IP adresi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const vrfName = fv('vrf_name'), rd = fv('rd'), rtImport = fv('rt_import'), rtExport = fv('rt_export');
            const ceIface = fv('ce_iface'), ceIp = fv('ce_ip'), ceAs = fv('ce_as');
            const ceNeighbor = fv('ce_neighbor'), localAs = fv('local_as');
            let c = '! ========================================\n! Cisco IOS — L3VPN PE Konfigürasyonu\n! ========================================\n\n';
            c += 'ip vrf ' + vrfName + '\n';
            c += ' rd ' + rd + '\n';
            c += ' route-target export ' + rtExport + '\n';
            c += ' route-target import ' + rtImport + '\n\n';
            c += 'interface ' + ceIface + '\n';
            c += ' ip vrf forwarding ' + vrfName + '\n';
            c += ' ip address ' + ceIp + '\n\n';
            c += 'router bgp ' + localAs + '\n';
            c += ' address-family vpnv4\n';
            c += '  neighbor <RR_IP> activate\n';
            c += '  neighbor <RR_IP> send-community extended\n';
            c += ' exit-address-family\n\n';
            if (ceAs && ceNeighbor) {
                c += ' address-family ipv4 vrf ' + vrfName + '\n';
                c += '  neighbor ' + ceNeighbor + ' remote-as ' + ceAs + '\n';
                c += '  neighbor ' + ceNeighbor + ' activate\n';
                c += '  redistribute connected\n';
                c += ' exit-address-family\n\n';
            }
            c += '! Doğrulama:\n! show ip vrf\n! show bgp vpnv4 unicast all summary\n! show ip route vrf ' + vrfName + '\n';
            return c;
        });
    }
};

// ── Cisco IOS: Route-Map & Redistribution ─────────────────────────────────────
CiscoIOS.routemap = {
    label: 'Route-Map & Redistribution',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-map-signs', title: 'Route-Map & Redistribution', desc: 'Route-map tanımı ve protokoller arası redistribution konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'routemap', label: 'Route-Map', icon: 'fas fa-map-signs', desc: 'Match/set + redistribute', badge: { text: 'Yaygın', cls: 'common' } }
            ],
            sections: [
                {
                    title: 'Route-Map Tanımı', icon: 'fas fa-map-signs', showFor: ['routemap'], warn: null, info: null,
                    fields: [
                        { name: 'rm_name',   label: 'Route-Map Adı', type: 'text',   required: true,  placeholder: 'RM_OSPF_TO_BGP', hint: 'Route-map ismi' },
                        { name: 'rm_action', label: 'Aksiyon',       type: 'select', required: false, options: [{v:'permit',l:'Permit'},{v:'deny',l:'Deny'}] },
                        { name: 'rm_seq',    label: 'Sequence',      type: 'text',   required: true,  placeholder: '10',             hint: 'Sequence numarası' }
                    ]
                },
                {
                    title: 'Match Koşulları', icon: 'fas fa-filter', showFor: ['routemap'], warn: null, info: 'Boş bırakılan match satırları çıktıya eklenmez.',
                    fields: [
                        { name: 'match_pl',  label: 'Match: Prefix-List Adı',  type: 'text', required: false, placeholder: 'PL_NETWORKS', hint: 'Prefix-list adı' },
                        { name: 'match_acl', label: 'Match: IP Address ACL',   type: 'text', required: false, placeholder: '1',            hint: 'ACL numarası/adı' }
                    ]
                },
                {
                    title: 'Set Değerleri', icon: 'fas fa-sliders-h', showFor: ['routemap'], warn: null, info: 'Boş bırakılan set satırları çıktıya eklenmez.',
                    fields: [
                        { name: 'set_lp',        label: 'Set: Local-Preference', type: 'text', required: false, placeholder: '150',       hint: 'BGP local-preference' },
                        { name: 'set_med',        label: 'Set: MED',              type: 'text', required: false, placeholder: '100',       hint: 'BGP MED metriği' },
                        { name: 'set_community',  label: 'Set: Community',        type: 'text', required: false, placeholder: '65001:200', hint: 'BGP community değeri' }
                    ]
                },
                {
                    title: 'Redistribution', icon: 'fas fa-exchange-alt', showFor: ['routemap'], warn: null, info: 'Sadece route-map oluşturmak için boş bırakın.',
                    fields: [
                        { name: 'src_proto', label: 'Kaynak Protokol', type: 'select', required: false, options: [{v:'ospf 1',l:'OSPF'},{v:'eigrp 100',l:'EIGRP'},{v:'connected',l:'Connected'},{v:'static',l:'Static'},{v:'',l:'Sadece Route-Map'}] },
                        { name: 'dst_proto', label: 'Hedef Protokol',  type: 'select', required: false, options: [{v:'bgp',l:'BGP'},{v:'ospf 1',l:'OSPF'},{v:'eigrp 100',l:'EIGRP'},{v:'',l:'Sadece Route-Map'}] },
                        { name: 'bgp_as',    label: 'BGP AS',          type: 'text', validate: 'asn',   required: false, placeholder: '65001', hint: 'BGP hedef ise AS numarası' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const rmName = fv('rm_name'), rmAction = fv('rm_action') || 'permit', rmSeq = fv('rm_seq');
            const matchPl = fv('match_pl'), matchAcl = fv('match_acl');
            const setLp = fv('set_lp'), setMed = fv('set_med'), setCom = fv('set_community');
            const srcProto = fv('src_proto'), dstProto = fv('dst_proto'), bgpAs = fv('bgp_as');
            let c = '! ========================================\n! Cisco IOS — Route-Map & Redistribution\n! ========================================\n\n';
            c += 'route-map ' + rmName + ' ' + rmAction + ' ' + rmSeq + '\n';
            if (matchPl) c += ' match ip address prefix-list ' + matchPl + '\n';
            if (matchAcl) c += ' match ip address ' + matchAcl + '\n';
            if (setLp) c += ' set local-preference ' + setLp + '\n';
            if (setMed) c += ' set metric ' + setMed + '\n';
            if (setCom) c += ' set community ' + setCom + ' additive\n';
            c += '!\n\n';
            if (srcProto && dstProto) {
                if (dstProto === 'bgp' && bgpAs) {
                    c += 'router bgp ' + bgpAs + '\n';
                    c += ' redistribute ' + srcProto + ' route-map ' + rmName + '\n';
                } else {
                    c += 'router ' + dstProto + '\n';
                    c += ' redistribute ' + srcProto + ' subnets route-map ' + rmName + '\n';
                }
                c += '!\n\n';
            }
            c += '! Doğrulama:\n! show route-map ' + rmName + '\n! show ip bgp neighbors <IP> advertised-routes\n';
            return c;
        });
    }
};

// ── Cisco IOS: IS-IS ──────────────────────────────────────────────────────────
CiscoIOS.isis = {
    label: 'IS-IS',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-broadcast-tower', title: 'IS-IS', desc: 'IS-IS routing protokolü — NET, level, interface ve passive-interface konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'isis', label: 'IS-IS', icon: 'fas fa-broadcast-tower', desc: 'IS-IS routing konfigürasyonu', badge: { text: 'Gelişmiş', cls: 'advanced' } }
            ],
            sections: [
                {
                    title: 'IS-IS Konfigürasyonu', icon: 'fas fa-broadcast-tower', showFor: ['isis'], warn: null, info: null,
                    fields: [
                        { name: 'net',     label: 'NET (Network Entity Title)',         type: 'text',     required: true,  placeholder: '49.0001.0000.0000.0001.00',  hint: 'CLNS network entity title' },
                        { name: 'level',   label: 'IS-IS Level',                       type: 'select',   required: false, options: [{v:'level-2-only',l:'Level-2 Only'},{v:'level-1-only',l:'Level-1 Only'},{v:'level-1-2',l:'Level-1-2'}] },
                        { name: 'ifaces',  label: 'Interface\'ler (her satıra bir)',   type: 'textarea', required: true,  placeholder: 'GigabitEthernet0/0\nLoopback0', hint: 'IS-IS etkinleştirilecek interface\'ler' },
                        { name: 'passive', label: 'Passive Interface\'ler (virgülle)', type: 'text',     required: false, placeholder: 'Loopback0',                   hint: 'Pasif interface listesi' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const net = fv('net'), level = fv('level') || 'level-2-only';
            const ifaces = fv('ifaces').split('\n').map(s => s.trim()).filter(Boolean);
            const passive = fv('passive').split(',').map(s => s.trim()).filter(Boolean);
            let c = '! ========================================\n! Cisco IOS — IS-IS\n! ========================================\n\n';
            c += 'router isis\n net ' + net + '\n is-type ' + level + '\n';
            passive.forEach(p => c += ' passive-interface ' + p + '\n');
            c += '!\n\n';
            ifaces.forEach(i => {
                c += 'interface ' + i + '\n ip router isis\n';
                if (level !== 'level-1-2') c += ' isis circuit-type ' + level + '\n';
                c += '!\n';
            });
            c += '\n! Doğrulama:\n! show isis neighbors\n! show isis database\n! show ip route isis\n';
            return c;
        });
    }
};

// ── Cisco IOS: Zone-Based Firewall ───────────────────────────────────────────
CiscoIOS.zbfw = {
    label: 'Zone-Based Firewall',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-shield-alt', title: 'Zone-Based Firewall', desc: 'ZBF zone, class-map, policy-map ve zone-pair konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'zbfw', label: 'Zone-Based FW', icon: 'fas fa-shield-alt', desc: 'Inside/Outside zone çifti', badge: { text: 'Güvenlik', cls: 'security' } }
            ],
            sections: [
                {
                    title: 'Zone-Based Firewall', icon: 'fas fa-shield-alt', showFor: ['zbfw'], warn: null, info: null,
                    fields: [
                        { name: 'in_zone',  label: 'Inside Zone Adı',    type: 'text', required: true, placeholder: 'INSIDE',             hint: 'İç ağ zone adı' },
                        { name: 'out_zone', label: 'Outside Zone Adı',   type: 'text', required: true, placeholder: 'OUTSIDE',            hint: 'Dış ağ zone adı' },
                        { name: 'in_iface', label: 'Inside Interface',   type: 'text', required: true, placeholder: 'GigabitEthernet0/1', hint: 'İç interface' },
                        { name: 'out_iface',label: 'Outside Interface',  type: 'text', required: true, placeholder: 'GigabitEthernet0/0', hint: 'Dış interface' },
                        { name: 'protos',   label: 'İzin verilen protokoller (virgülle)', type: 'text', required: true, placeholder: 'tcp,udp,icmp', hint: 'Örn: tcp,udp,icmp' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const inZone = fv('in_zone'), outZone = fv('out_zone');
            const inIface = fv('in_iface'), outIface = fv('out_iface');
            const protos = fv('protos').split(',').map(s => s.trim()).filter(Boolean);
            const cmName = 'CM_' + inZone + '_TO_' + outZone;
            const pmName = 'PM_' + inZone + '_TO_' + outZone;
            let c = '! ========================================\n! Cisco IOS — Zone-Based Firewall\n! ========================================\n\n';
            c += 'zone security ' + inZone + '\nzone security ' + outZone + '\n!\n\n';
            c += 'class-map type inspect match-any ' + cmName + '\n';
            protos.forEach(p => c += ' match protocol ' + p + '\n');
            c += '!\npolicy-map type inspect ' + pmName + '\n class type inspect ' + cmName + '\n  inspect\n!\n\n';
            c += 'zone-pair security ZP_IN_OUT source ' + inZone + ' destination ' + outZone + '\n';
            c += ' service-policy type inspect ' + pmName + '\n!\n\n';
            c += 'interface ' + inIface + '\n zone-member security ' + inZone + '\n!\n';
            c += 'interface ' + outIface + '\n zone-member security ' + outZone + '\n!\n\n';
            c += '! Doğrulama:\n! show policy-map type inspect zone-pair\n! show zone security\n';
            return c;
        });
    }
};

// ── Cisco IOS: BFD ────────────────────────────────────────────────────────────
CiscoIOS.bfd = {
    label: 'BFD',
    init(container) {
        const schema = {
            topic: { icon: 'fas fa-heartbeat', title: 'BFD (Bidirectional Forwarding Detection)', desc: 'Interface BFD timer ve protokol entegrasyonu (OSPF/BGP/EIGRP) konfigürasyonu oluşturur.' },
            configTypes: [
                { id: 'bfd', label: 'BFD', icon: 'fas fa-heartbeat', desc: 'BFD timer + protokol entegrasyonu', badge: { text: 'Önerilen', cls: 'recommended' } }
            ],
            sections: [
                {
                    title: 'BFD Konfigürasyonu', icon: 'fas fa-heartbeat', showFor: ['bfd'], warn: null, info: null,
                    fields: [
                        { name: 'iface',        label: 'Interface',               type: 'text',   required: true,  placeholder: 'GigabitEthernet0/0', hint: 'BFD etkinleştirilecek interface' },
                        { name: 'interval',     label: 'BFD Interval (ms)',       type: 'text',   required: true,  placeholder: '300',                hint: 'Gönderme aralığı' },
                        { name: 'min_rx',       label: 'Min-Rx (ms)',             type: 'text',   required: true,  placeholder: '300',                hint: 'Minimum alma aralığı' },
                        { name: 'multiplier',   label: 'Multiplier',              type: 'text',   required: true,  placeholder: '3',                  hint: 'Dead interval çarpanı' },
                        { name: 'protocol',     label: 'Protokol',                type: 'select', required: false, options: [{v:'ospf',l:'OSPF'},{v:'bgp',l:'BGP'},{v:'eigrp',l:'EIGRP'}] },
                        { name: 'proc_id',      label: 'OSPF PID / BGP AS',       type: 'text',   required: false, placeholder: '1',                  hint: 'OSPF process ID veya BGP AS numarası' },
                        { name: 'bgp_neighbor', label: 'BGP Neighbor IP',         type: 'text',   required: false, placeholder: '10.0.0.2',           hint: 'BGP seçiliyse neighbor IP' }
                    ]
                }
            ],
            submit: 'Konfigürasyon Oluştur'
        };
        cgFormBuilder(container, schema, (data) => {
            const fv = n => cgEsc((data[n] || '').trim());
            const iface = fv('iface'), interval = fv('interval'), minRx = fv('min_rx'), mult = fv('multiplier');
            const proto = fv('protocol') || 'ospf', procId = fv('proc_id'), bgpNeighbor = fv('bgp_neighbor');
            let c = '! ========================================\n! Cisco IOS — BFD\n! ========================================\n\n';
            c += 'interface ' + iface + '\n';
            c += ' bfd interval ' + interval + ' min_rx ' + minRx + ' multiplier ' + mult + '\n!\n\n';
            if (proto === 'ospf') {
                c += 'router ospf ' + (procId || '1') + '\n bfd all-interfaces\n!\n\n';
            } else if (proto === 'bgp' && bgpNeighbor) {
                c += 'router bgp ' + (procId || '65001') + '\n neighbor ' + bgpNeighbor + ' fall-over bfd\n!\n\n';
            } else if (proto === 'eigrp') {
                c += 'router eigrp ' + (procId || '100') + '\n bfd all-interfaces\n!\n\n';
            }
            c += '! Doğrulama:\n! show bfd neighbors\n! show bfd neighbors details\n';
            return c;
        });
    }
};
