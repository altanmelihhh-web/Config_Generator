'use strict';

// CC_READERS ve CC_WRITERS, Readers/Writers dosyalarında tanımlı sabitler olacak
// Bu dosya sadece UI controller'ı.

const ConfigConverter = {
    render(container) {
        const catOptions = Object.entries(CC_CATEGORIES)
            .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');

        container.innerHTML = `
<div class="cc-wrap">
  <div class="cc-intro"><i class="fas fa-circle-info"></i> Kaynak platformu seçip config'i yapıştırın veya dosya yükleyin, hedef platformu seçin ve "Dönüştür"e basın.</div>
  <div class="cc-layout">
    <div class="cc-panel cc-panel-src">
      <div class="cc-panel-header">
        <span class="cc-panel-title"><i class="fas fa-file-import"></i> Kaynak Config</span>
        <div class="cc-select-group">
          <select id="ccCategory" class="cc-select">${catOptions}</select>
          <select id="ccSrcVendor" class="cc-select"></select>
        </div>
      </div>
      <textarea id="ccSrcText" class="cc-textarea" placeholder="Config metnini buraya yapıştırın..." spellcheck="false"></textarea>
      <div class="cc-panel-footer">
        <label class="cc-btn cc-btn-ghost cc-file-label"><i class="fas fa-folder-open"></i> Dosya Seç
          <input type="file" id="ccFileInput" accept=".txt,.cfg,.conf" style="display:none">
        </label>
        <div class="cc-footer-actions">
          <button type="button" id="ccConvertBtn" class="cc-btn cc-btn-primary"><i class="fas fa-exchange-alt"></i> Dönüştür</button>
          <button type="button" id="ccMatrixBtn" class="cc-btn cc-btn-ghost cc-btn-icon" title="Vendor Destek Matrisi" aria-label="Vendor Destek Matrisi"><i class="fas fa-table"></i></button>
        </div>
      </div>
    </div>
    <div class="cc-connector"><div class="cc-connector-badge"><i class="fas fa-arrow-right"></i></div></div>
    <div class="cc-panel cc-panel-dst">
      <div class="cc-panel-header">
        <span class="cc-panel-title"><i class="fas fa-file-export"></i> Hedef Config</span>
        <div class="cc-select-group">
          <select id="ccDstVendor" class="cc-select"></select>
          <select id="ccDstVersion" class="cc-select" title="Hedef OS/firmware sürümü — syntax bu sürüme göre değişebilir"></select>
        </div>
      </div>
      <pre id="ccOutput" class="cc-output">Dönüştürülmüş config burada görünecek...</pre>
      <div class="cc-panel-footer">
        <button id="ccCopyBtn" class="cc-btn cc-btn-ghost" style="display:none"><i class="fas fa-copy"></i> Kopyala</button>
        <button id="ccDownloadBtn" class="cc-btn cc-btn-ghost" style="display:none"><i class="fas fa-download"></i> İndir</button>
        <div class="cc-footer-actions" style="gap:8px">
          <span id="ccUnknownBadge" class="cc-badge-pill cc-badge-warn" style="display:none"></span>
          <span id="ccScopeBadge" class="cc-badge-pill cc-badge-info" style="display:none"></span>
        </div>
      </div>
    </div>
  </div>
  <div id="ccWarnBlock" class="cc-callout cc-warn-block" style="display:none">
    <strong>Dönüşüm Uyarıları</strong>
    <pre id="ccWarnText"></pre>
  </div>
  <div id="ccUnknownList" class="cc-callout cc-unknowns" style="display:none">
    <strong>Çevrilemeyen Satırlar</strong>
    <pre id="ccUnknownText"></pre>
  </div>
  <div id="ccLostFieldsBlock" class="cc-lostfields-block" style="display:none">
    <div class="cc-analysis-head">
      <strong><i class="fas fa-chart-line"></i> Dönüşüm Analizi</strong>
      <div id="ccAnalysisSummary" class="cc-analysis-summary"></div>
    </div>
    <div class="cc-lostfields-table-wrap">
      <table id="ccLostFieldsTable" class="cc-lostfields-table">
        <thead><tr><th>Durum</th><th>Bölüm</th><th>Nesne</th><th>Alan</th><th>Kaynak Değer</th><th>Açıklama</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>
  <div id="ccMatrixModal" class="cc-matrix-modal" style="display:none">
    <div class="cc-matrix-card">
      <div class="cc-matrix-head">
        <strong><i class="fas fa-table"></i> Vendor Destek Matrisi</strong>
        <button type="button" id="ccMatrixClose" class="cc-btn cc-btn-ghost">Kapat</button>
      </div>
      <div class="cc-matrix-legend">
        <span class="cc-badge-pill" style="background:#16a34a;color:#fff">✓ Tam</span>
        <span class="cc-badge-pill" style="background:#f59e0b;color:#fff">~ Kısmi/Çevrilmiş</span>
        <span class="cc-badge-pill" style="background:#dc2626;color:#fff">✗ Desteklenmez</span>
      </div>
      <div id="ccMatrixBody" class="cc-matrix-body"></div>
    </div>
  </div>
</div>`;

        const updateVendors = () => {
            const cat = container.querySelector('#ccCategory').value;
            const vendors = CC_CATEGORIES[cat].vendors;
            const srcSel = container.querySelector('#ccSrcVendor');
            const dstSel = container.querySelector('#ccDstVendor');
            const prevSrc = srcSel.value;
            const prevDst = dstSel.value;
            const opts = vendors.map(v => {
                const m = CC_VENDOR_META[v] || {};
                return `<option value="${v}">${m.label || v}</option>`;
            }).join('');
            srcSel.innerHTML = opts;
            if (prevSrc && vendors.includes(prevSrc)) srcSel.value = prevSrc;
            const src = srcSel.value;
            dstSel.innerHTML = vendors
                .filter(v => v !== src)
                .map(v => { const m = CC_VENDOR_META[v] || {}; return `<option value="${v}">${m.label || v}</option>`; }).join('');
            if (prevDst && prevDst !== src && vendors.includes(prevDst)) dstSel.value = prevDst;
            updateDstVersions();
        };

        const updateDstVersions = () => {
            const dstSel = container.querySelector('#ccDstVendor');
            const verSel = container.querySelector('#ccDstVersion');
            const versions = (CC_VENDOR_META[dstSel.value] || {}).osVersions || [];
            verSel.innerHTML = versions.map(v => `<option value="${v.id}">${v.label}</option>`).join('');
            verSel.style.display = versions.length > 1 ? '' : 'none';
        };

        container.querySelector('#ccCategory').addEventListener('change', updateVendors);
        container.querySelector('#ccSrcVendor').addEventListener('change', updateVendors);
        container.querySelector('#ccDstVendor').addEventListener('change', updateDstVersions);
        updateVendors();

        container.querySelector('#ccFileInput').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            if (file.size > 512000) { alert('Dosya 500 KB sınırını aşıyor, ilk 500 satır işlenecek.'); }
            const reader = new FileReader();
            reader.onload = ev => {
                container.querySelector('#ccSrcText').value = ev.target.result.split('\n').slice(0, 500).join('\n');
            };
            reader.readAsText(file);
        });

        container.querySelector('#ccConvertBtn').addEventListener('click', () => {
            const srcVendor = container.querySelector('#ccSrcVendor').value;
            const dstVendor = container.querySelector('#ccDstVendor').value;
            const text = container.querySelector('#ccSrcText').value.trim();
            const output = container.querySelector('#ccOutput');
            const badge = container.querySelector('#ccUnknownBadge');
            const scopeBadge = container.querySelector('#ccScopeBadge');
            const unknownList = container.querySelector('#ccUnknownList');
            const unknownText = container.querySelector('#ccUnknownText');
            const warnBlock = container.querySelector('#ccWarnBlock');
            const warnText = container.querySelector('#ccWarnText');
            const lostBlock = container.querySelector('#ccLostFieldsBlock');
            const lostBody = container.querySelector('#ccLostFieldsTable tbody');

            // Cross-category guard
            const srcCat = (CC_VENDOR_META[srcVendor] || {}).cat;
            const dstCat = (CC_VENDOR_META[dstVendor] || {}).cat;
            if (srcCat && dstCat && srcCat !== dstCat) {
                output.textContent = `⚠ Bu vendörler aynı kategoride değil (kaynak: ${srcCat}, hedef: ${dstCat}). Dönüşüm yapılamaz.`;
                return;
            }

            if (!text) { output.textContent = '⚠ Config metni boş.'; return; }
            if (srcVendor === dstVendor) { output.textContent = '⚠ Kaynak ve hedef vendor aynı.'; return; }

            const readerFn = CC_READERS[srcVendor];
            const writerFn = CC_WRITERS[dstVendor];
            if (!readerFn || !writerFn) { output.textContent = '⚠ Vendor fonksiyonu bulunamadı.'; return; }

            try {
                const ir = readerFn(text);
                ir._meta.scope = ccDetectScope(ir);
                // Tek mod: deploy-safe çıktı. Tüm analiz UI panelinde gösterilir.
                ir._meta.outputMode = 'deploy';
                ir._meta.vrpVariant = 'default';
                // Faz 5: hedef OS/sürüm damgası — versiyon-bağımlı doğrulama kuralları
                // (ör. PaloAlto DH group enum'u) bunu okuyor.
                const dstVerSel = container.querySelector('#ccDstVersion');
                ir._meta.dstOsVersion = (dstVerSel && dstVerSel.value) || ccDefaultOsVersion(dstVendor);
                let result = writerFn(ir);
                // Faz 5: hedef sürüm etiketini çıktı başlığına damgala (şeffaflık — "hangi
                // sürüme göre üretildi" görünür olsun).
                const dstVerLabel = ((CC_VENDOR_META[dstVendor] || {}).osVersions || [])
                    .find(v => v.id === ir._meta.dstOsVersion);
                if (dstVerLabel) {
                    const ch = (CC_VENDOR_META[dstVendor] || {}).commentChar || '#';
                    result = ch + ' Hedef sürüm: ' + dstVerLabel.label + '\n' + result;
                }
                // Sprint 12: writer sonrası semantic validator çalıştır.
                // Bulgular ir.lostFields'a push'lanır → UI panelinde görünür.
                if (typeof ccValidateSemantic === 'function') {
                    ccValidateSemantic(ir, result, dstVendor);
                }
                if (typeof ccStripDeployUnsafe === 'function') {
                    result = ccStripDeployUnsafe(result);
                }
                output.textContent = result;

                container.querySelector('#ccCopyBtn').style.display = '';
                container.querySelector('#ccDownloadBtn').style.display = '';

                // Scope badge
                const scopeLabels = {
                    hostname:'Hostname', interfaces:'Arayüzler', vlans:'VLAN', routes:'Rotalar',
                    acls:'ACL', addressObjects:'Adres Nesneleri', serviceObjects:'Servis Nesneleri',
                    securityPolicies:'Güvenlik Politikaları', natRules:'NAT', zones:'Zonlar',
                    virtualServers:'Virtual Server', ospf:'OSPF', bgp:'BGP'
                };
                const scopeLabel = (ir._meta.scope || []).map(s => scopeLabels[s] || s).join(', ');
                if (scopeLabel) {
                    scopeBadge.textContent = scopeLabel;
                    scopeBadge.style.display = '';
                } else {
                    scopeBadge.style.display = 'none';
                }

                // Parse warnings
                if (ir._meta.parseWarnings && ir._meta.parseWarnings.length) {
                    warnText.textContent = ir._meta.parseWarnings.join('\n');
                    warnBlock.style.display = '';
                } else {
                    warnBlock.style.display = 'none';
                }

                // Unknown lines
                if (ir.unknowns.length > 0) {
                    badge.textContent = '⚠ ' + ir.unknowns.length + ' satır çevrilemedi';
                    badge.style.display = '';
                    unknownText.textContent = ir.unknowns.join('\n');
                    unknownList.style.display = '';
                } else {
                    badge.style.display = 'none';
                    unknownList.style.display = 'none';
                }

                // Dönüşüm Analizi — 6-seviye severity + confidence score (S11)
                const lost = Array.isArray(ir.lostFields) ? ir.lostFields : [];
                const conf = (typeof ccComputeConfidence === 'function')
                    ? ccComputeConfidence(ir)
                    : { score: 100, breakdown: {} };
                const summaryEl = container.querySelector('#ccAnalysisSummary');

                if (lost.length > 0) {
                    const esc = s => String(s == null ? '' : s)
                        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const fmtVal = v => {
                        if (v === null || v === undefined) return '';
                        if (typeof v === 'object') { try { return JSON.stringify(v); } catch (e) { return String(v); } }
                        return String(v);
                    };
                    // 6 severity için TR label + renk
                    const STATUS_LABEL = {
                        dangerous:   { tr: 'TEHLİKELİ', bg: '#7c2d12' },
                        dropped:     { tr: 'Düştü',     bg: '#dc2626' },
                        unsupported: { tr: 'Desteksiz', bg: '#9333ea' },
                        manual:      { tr: 'Manuel',    bg: '#3b82f6' },
                        partial:     { tr: 'Kısmi',     bg: '#f59e0b' },
                        full:        { tr: 'Tam',       bg: '#16a34a' }
                    };
                    const ORDER = ['dangerous', 'dropped', 'unsupported', 'manual', 'partial', 'full'];
                    const explain = reason => String(reason || '')
                        .replace(/-/g, ' ')
                        .replace(/\b([a-z])/g, (_, ch) => ch.toUpperCase());

                    // Severity'yi her satırda mevcut (writer'lar push'larken set ediyor;
                    // yoksa ccInferSeverity fallback'iyle hesaplanıyor)
                    const enriched = lost.map(row => {
                        const sev = row.severity ||
                            (typeof ccInferSeverity === 'function' ? ccInferSeverity(row.reason) : 'dropped');
                        return Object.assign({}, row, { _severity: sev });
                    });

                    // Confidence score rozet'i ve severity sayıları
                    const scoreColor = conf.score >= 90 ? '#16a34a' :
                                       conf.score >= 75 ? '#f59e0b' :
                                       conf.score >= 50 ? '#ea580c' : '#dc2626';
                    let html = '<span class="cc-confidence" style="background:' + scoreColor +
                        ';color:#fff;padding:4px 12px;border-radius:14px;font-weight:600;font-size:.8rem;margin-right:10px">' +
                        'Güven: %' + conf.score + '</span>';
                    html += ORDER.filter(s => (conf.breakdown[s] || 0) > 0).map(s => {
                        const lbl = STATUS_LABEL[s];
                        return '<span class="cc-badge" style="background:' + lbl.bg +
                            ';color:#fff;padding:3px 10px;border-radius:12px;margin-right:6px;font-size:.75rem">' +
                            lbl.tr + ': ' + (conf.breakdown[s] || 0) + '</span>';
                    }).join('');
                    summaryEl.innerHTML = html;

                    // Tablo: severity'ye göre sırala (DANGEROUS → DROPPED → ... → FULL)
                    enriched.sort((a, b) => ORDER.indexOf(a._severity) - ORDER.indexOf(b._severity));

                    lostBody.innerHTML = enriched.map(r => {
                        const lbl = STATUS_LABEL[r._severity] || STATUS_LABEL.dropped;
                        return '<tr>' +
                          '<td><span style="background:' + lbl.bg + ';color:#fff;padding:2px 8px;border-radius:8px;font-size:.7rem">' + lbl.tr + '</span></td>' +
                          '<td>' + esc(r.section) + '</td>' +
                          '<td>' + esc(r.name) + '</td>' +
                          '<td>' + esc(r.field) + '</td>' +
                          '<td>' + esc(fmtVal(r.value)) + '</td>' +
                          '<td>' + esc(explain(r.reason)) + '</td>' +
                        '</tr>';
                    }).join('');
                    lostBlock.style.display = '';
                } else {
                    lostBody.innerHTML = '';
                    // Hiç kayıp yok: yine de %100 güven rozeti göster; tabloyu gizle
                    summaryEl.innerHTML = '<span class="cc-confidence" style="background:#16a34a;color:#fff;padding:4px 12px;border-radius:14px;font-weight:600;font-size:.8rem">Güven: %100 — Tüm alanlar başarıyla çevrildi</span>';
                    const tbl = container.querySelector('#ccLostFieldsTable');
                    if (tbl) tbl.style.display = 'none';
                    lostBlock.style.display = '';
                }
                // Tablo görünürlüğünü resetle (her convert'te yeniden değerlendir)
                if (lost.length > 0) {
                    const tbl = container.querySelector('#ccLostFieldsTable');
                    if (tbl) tbl.style.display = '';
                }
            } catch (err) {
                output.textContent = '⚠ Dönüşüm hatası: ' + err.message;
            }
        });

        container.querySelector('#ccCopyBtn').addEventListener('click', () => {
            navigator.clipboard.writeText(container.querySelector('#ccOutput').textContent);
        });

        container.querySelector('#ccMatrixBtn').addEventListener('click', () => {
            const body = container.querySelector('#ccMatrixBody');
            if (typeof ccBuildVendorMatrixHTML === 'function') {
                body.innerHTML = ccBuildVendorMatrixHTML();
            } else {
                body.textContent = 'Matrix yardımcısı yüklenemedi.';
            }
            container.querySelector('#ccMatrixModal').style.display = '';
        });
        container.querySelector('#ccMatrixClose').addEventListener('click', () => {
            container.querySelector('#ccMatrixModal').style.display = 'none';
        });

        container.querySelector('#ccDownloadBtn').addEventListener('click', () => {
            const text = container.querySelector('#ccOutput').textContent;
            const dst = container.querySelector('#ccDstVendor').value;
            const blob = new Blob([text], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'converted-' + dst + '.txt';
            a.click();
        });
    }
};
