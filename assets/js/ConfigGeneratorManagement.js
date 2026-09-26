'use strict';

// ─── Shared Utilities ───────────────────────────────────────────────────────

function cgEsc(v) {
    return String(v == null ? '' : v).replace(/[<>&"']/g, c =>
        ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c]);
}

// Tırnaklı CLI değeri (FortiOS/PAN-OS): önce \\ ve \" kaçırması, sonra cgEsc (cgShowOutput çıktıyı bir kez çözer)
function cgQ(v) {
    return '"' + cgEsc(String(v == null ? '' : v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')) + '"';
}

// Canlı önizleme sırasında true olur: cgValidate alanları işaretler ama engellemez.
let cgSoftMode = false;

// Noktali ag maskesi -> prefix uzunlugu. Gecersiz veya bitisik olmayan maskede ''
// dondurur: cagiran, yanlis bir sayi uydurmak yerine eksikligi gorunur kilar.
function cgMaskLen(mask) {
    const p = String(mask || '').trim().split('.');
    if (p.length !== 4 || !p.every(o => /^\d{1,3}$/.test(o) && +o <= 255)) return '';
    const bits = p.map(o => (+o).toString(2).padStart(8, '0')).join('');
    return /^1*0*$/.test(bits) ? String(bits.indexOf('0') < 0 ? 32 : bits.indexOf('0')) : '';
}

// Huawei VRP/CE VLAN listesi: bosluk ayrac, aralik 'to' ile. Form '10,20,30-40'
// kabul eder; cihaz '10 20 30 to 40' ister ('1-100' VRP'de gecersizdir).
function cgHwVlanList(s) {
    return String(s || '').trim().replace(/\s+to\s+/gi, '-').split(/[,\s]+/).filter(Boolean)
        .map(p => p.replace(/^(\d+)-(\d+)$/, '$1 to $2')).join(' ');
}

// Arayuz listesi/araligini tek tek arayuzlere acar: 'Gi0/0/1-3, Gi0/0/8' ->
// ['Gi0/0/1','Gi0/0/2','Gi0/0/3','Gi0/0/8']. Aralik soz dizimi olmayan platformlarda
// (Huawei VRP 'interface X' tek arayuz ister) kullanilir. 'Gi0/0/1-0/0/3' bicimi de desteklenir.
function cgExpandIfList(s) {
    const out = [];
    String(s || '').split(/[,\s]+/).filter(Boolean).forEach(p => {
        const m = p.match(/^(.*?)(\d+)-(?:[\d/.:]*?[/:.])?(\d+)$/);
        if (m && /\D$/.test(m[1]) && +m[3] >= +m[2] && +m[3] - +m[2] < 256) {
            for (let i = +m[2]; i <= +m[3]; i++) out.push(m[1] + i);
        } else out.push(p);
    });
    return out;
}

// ─── Doğrulayıcılar ─────────────────────────────────────────────────────────
// Tanımlar cihaz ailesine özgüdür: assets/js/validators/common.js (her vendorda
// aynı anlamlı genel doğrulayıcılar + çözümleyici) ve <aile>.js (cisco, f5,
// checkpoint, huawei …). Alan 'validate' adıyla, araç ailesiyle çözülür:
// cgValidator(ad, aile) → önce aile, sonra common; başka ailenin tanımı görünmez.
// Form öğesinde data-cgv = ad, data-cgf = aile.
//
// Üç metin ayrı işler görür:
//   hint  -> alan NE (Trunk allowed VLAN listesi)
//   why   -> NEDEN önemli (kavram, risk)
//   rule  -> NE GİREBİLİRİM (aralık, biçim, ne kabul edilmez)  <- cgValRule
//   hata  -> girdiğimin NESİ yanlış                           <- cgValWhy

// Formu kuran aracın ailesi (cgFamilyOf(regId).slug). ConfigGenerator._renderWork
// gen.init'ten önce ayarlar; cgFormBuilder alanlara data-cgf olarak yazar.
let cgValFamily = null;

// Form öğesinin doğrulayıcısı (ad + aile).
function cgElValidator(el) { return cgValidator(el.dataset.cgv, el.dataset.cgf || null); }

// Sebep dizesi (yalnızca "nesi yanlış" kısmı) — uyarı şeridinde kısa gösterim için.
function cgFieldReason(type, val, family) {
    const f = cgValWhy(type, family);
    if (!f) return '';
    try { return f(String(val == null ? '' : val).trim()) || ''; } catch (e) { return ''; }
}

// Alan altında gösterilecek tam mesaj: kural + sebep.
// `msg` fonksiyon olarak da tanımlanabilir (girilen değeri alır); statik metin
// desteği korunur.
function cgFieldMsg(type, val, family) {
    const v = cgValidator(type, family);
    if (!v) return '';
    if (typeof v.msg === 'function') { try { return v.msg(val); } catch (e) { return ''; } }
    const r = cgFieldReason(type, val, family);
    return r ? v.msg + ' — ' + r : v.msg;
}

// Uyarı metinlerinde ALAN ADI değil ETİKET gösterilir: 'allowed_vlans' değil
// 'Allowed VLANs'. Etiketten işaretleyiciler (zorunlu yıldızı, 'Opsiyonel'
// rozeti, ipucu ikonu) temizlenir.
function _cgLabelOf(el) {
    const lblEl = el.closest('.row')?.querySelector('label');
    if (!lblEl) return el.name;
    const c = lblEl.cloneNode(true);
    c.querySelectorAll('.cg-opt, .text-danger, .cg-tip').forEach(n => n.remove());
    return c.textContent.replace(/[*\s]+$/, '').trim() || el.name;
}

// min/max tasiyan ama dogrulayicisi olmayan alanlar icin dinamik aralik
// dogrulayicisi: 'range:1:4094'. Kural metni, hata mesaji ve sebebi otomatik.
// Anlami her vendorda ayni oldugu icin common kumesine yazilir.
function cgRangeValidator(min, max) {
    const lo = (min === undefined || min === '') ? -Infinity : +min;
    const hi = (max === undefined || max === '') ?  Infinity : +max;
    const key = 'range:' + lo + ':' + hi;
    if (!cgValidator(key)) {
        const span = isFinite(lo) && isFinite(hi) ? lo + '–' + hi
                   : isFinite(lo) ? lo + ' veya daha büyük' : hi + ' veya daha küçük';
        cgDefineValidators('common',
            { [key]: { fn: v => /^-?\d+$/.test(String(v).trim()) && +v >= lo && +v <= hi,
                       msg: 'Değer ' + span + ' arasında olmalı' } },
            { [key]: 'Tam sayı, ' + span + '.' },
            { [key]: t => _cgNumWhy(t, isFinite(lo) ? lo : -2147483648, isFinite(hi) ? hi : 2147483647) });
    }
    return key;
}

function cgRuleLine(vtype, family) {
    const r = cgValRule(vtype, family);
    return r ? '<div class="cg-rule"><i class="fas fa-check-circle"></i> <b>Geçerli değer:</b> ' + r + '</div>' : '';
}

// "Neden?" bilgi kutusu — net-config.com'un en güçlü fikri.
// Alan veya bölüm şemasına `why: '...'` eklendiğinde görünür.
function cgWhyBox(why, key) {
    if (!why) return '';
    return '<div class="cg-why"><b>Neden?</b> ' + why + '</div>';
}

function cgValidate(form) {
    cgApplyRequiredIf(form);
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
        const v = vtype && val ? cgElValidator(el) : null;
        if (v) {
            const pass = v.re ? v.re.test(val) : v.fn(val, el);
            el.classList.toggle('is-invalid', !pass);
            if (!pass) { _cgSetError(el, cgFieldMsg(vtype, val, el.dataset.cgf)); ok = false; }
            else _cgClearError(el);
        } else {
            el.classList.remove('is-invalid');
            _cgClearError(el);
        }
    });
    // Canlı önizlemede hata olsa bile üretime izin ver
    return cgSoftMode ? true : ok;
}

// Yumuşak doğrulama: hatalı alanları işaretler ama üretimi engellemez.
// Boş zorunlu alanlar hata sayılmaz (kullanıcı henüz yazıyor olabilir).
function cgValidateSoft(form) {
    form.querySelectorAll('[data-cgv]').forEach(el => {
        if (el.disabled) return;
        const val = (el.value || '').trim();
        if (!val) { _cgClearError(el); return; }
        const v = cgElValidator(el);
        if (!v) return;
        const pass = v.re ? v.re.test(val) : v.fn(val, el);
        if (pass) _cgClearError(el);
        else { el.classList.add('is-invalid'); _cgSetError(el, cgFieldMsg(el.dataset.cgv, val, el.dataset.cgf)); }
    });
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


// cgFormBuilder kullanmayan (elle yazılmış) formları da canlıya bağlar.
// Kendi submit handler'ları cgShowOutput çağırıyor; biz sadece tetikliyoruz.
function cgBindLegacyLive(host) {
    if (!host || host._cgLiveRun) return;          // cgFormBuilder zaten bağladı
    const form = host.querySelector('form');
    if (!form || form._cgLegacyBound) return;
    form._cgLegacyBound = true;

    let t = null;
    const run = () => {
        // Boş alanlara geçici placeholder koy -> çıktı çalışır bir örnek olsun
        const filled = [];
        form.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
            if (el.disabled || el.type === 'checkbox' || el.type === 'radio') return;
            if (!String(el.value || '').trim() && el.placeholder) { el.value = el.placeholder; filled.push(el); }
        });
        cgSoftMode = true;
        try { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }
        catch (e) { /* yut */ }
        finally {
            cgSoftMode = false;
            filled.forEach(el => { el.value = ''; });
            form.querySelectorAll('.cg-validation-banner').forEach(b => b.remove());
        }
    };
    const sched = () => { clearTimeout(t); t = setTimeout(run, 160); };
    form.addEventListener('input', sched);
    form.addEventListener('change', sched);
    host._cgLiveRun = run;
    run();
}

// ─── Canlı Çıktı (terminal paneli) ───────────────────────────────────────────

// Üretilen config'i basit sözdizimi renklendirmesiyle HTML'e çevirir.
function cgHighlight(text) {
    const KW = /^(config|edit|next|end|set|unset|system|interface|configure|enable|exit|write|commit|delete|show|no|ip|router|vlan|access-list|policy|rule|create|add|address|service|zone|profile|firewall|vpn|route)\b/;
    return String(text).split('\n').map(line => {
        const esc = cgEsc(line);
        const trimmed = line.trimStart();
        // Yorum satırları
        if (/^[#!;]/.test(trimmed)) return '<span class="t-cmt">' + esc + '</span>';
        // Tırnaklı değerler ve sayılar
        let out = esc
            .replace(/(&quot;[^&]*?&quot;)/g, '<span class="t-str">$1</span>')
            .replace(/\b(\d+\.\d+\.\d+\.\d+(?:\/\d+)?)\b/g, '<span class="t-num">$1</span>');
        // İlk kelime anahtar kelimeyse vurgula
        const m = trimmed.match(KW);
        if (m) {
            const kw = m[1];
            out = out.replace(kw, '<span class="' + (kw === 'set' || kw === 'unset' ? 't-set' : 't-kw') + '">' + kw + '</span>');
        }
        return out;
    }).join('\n');
}

// Terminal panelini günceller. config boşsa bekleme durumu gösterir.
// Üreteçler değerleri cgEsc ile kaçırarak üretir; çıktı metin olduğundan burada bir kez çözülür.
// Böylece kopyalanan/indirilen config ham olur (ör. PSK "Ab&1" → önceden "Ab&amp;1" kopyalanıyordu),
// ekranda ise cgHighlight tek kez kaçırır.
function cgUnesc(v) {
    return String(v == null ? '' : v).replace(/&(lt|gt|quot|#39|amp);/g, (m, e) => ({ lt: '<', gt: '>', quot: '"', '#39': "'", amp: '&' })[e]);
}
// Uyarı alanı (terminalin altında): önem düzeyine göre renkli kartlar — hata (⛔) önce, sonra ⚠, sonra ℹ.
// Başlıkta özet rozetleri; kutu çerçevesi en yüksek önem düzeyini alır. Geçersiz/boş alan adları
// tıklanabilir çiptir (alana kaydırıp odaklar). Görünen madde sayısı sütunda kalan boşluğa göre
// hesaplanır; sığmayanlar "N daha" ile açılır. Uyarı yoksa ince yeşil "config hazır" satırı.
// cgWarnMeta: canlı üretimin kendi eklediği hata iletileri için yapı (başlık, alan listesi, açıklama).
let cgWarnOpen = false;
const cgWarnMeta = new Map();
let cgWarnLiveMsg = '';
function cgShowWarnings(warnings, hasConfig) {
    const box = document.getElementById('cg-term-warn');
    if (!box) return;
    let live = document.getElementById('cg-warns-live');
    if (!live && box.parentNode) {
        live = document.createElement('span');
        live.id = 'cg-warns-live'; live.className = 'cg-sr-only';
        live.setAttribute('aria-live', 'polite'); live.setAttribute('role', 'status');
        box.parentNode.insertBefore(live, box.nextSibling);
    }
    const say = t => { if (live && t !== cgWarnLiveMsg) { cgWarnLiveMsg = t; live.textContent = t; } };
    const W = (warnings || []).map(w => String(w)).filter(Boolean);
    box.classList.remove('lvl-err', 'lvl-warn', 'lvl-info', 'lvl-ok');
    if (!W.length) {
        box.innerHTML = '';
        if (hasConfig) {
            box.classList.add('lvl-ok');
            box.innerHTML = '<p class="cg-warns-ok"><i class="fas fa-circle-check" aria-hidden="true"></i>Uyarı yok — config hazır</p>';
            box.hidden = false;
            say('Uyarı yok');
        } else { box.hidden = true; say(''); }
        cgWarnBar(box, 0, 0);
        return;
    }
    const kind = w => /^⛔/.test(w) ? 'err' : /^ℹ/.test(w) ? 'info' : 'warn';
    const rank = { err: 0, warn: 1, info: 2 };
    const L = W.map((w, i) => ({ w, i, k: kind(w) })).sort((a, b) => rank[a.k] - rank[b.k] || a.i - b.i);
    const ico = { err: ['fa-circle-xmark', 'Hata'], warn: ['fa-triangle-exclamation', 'Uyarı'], info: ['fa-circle-info', 'Bilgi'] };
    const n = { err: 0, warn: 0, info: 0 };
    L.forEach(x => { n[x.k]++; });
    const top = n.err ? 'err' : n.warn ? 'warn' : 'info';
    const fields = [];
    const row = x => {
        const m = cgWarnMeta.get(x.w);
        const text = x.w.replace(/^[⛔⚠ℹ]️?\s*/, '');
        let title = ico[x.k][1], body;
        if (m) {
            title = m.t;
            body = '<span class="cg-warn-chips">' + m.f.map(f => {
                fields.push(f.el);
                return '<button type="button" class="cg-wchip" data-wf="' + (fields.length - 1) + '" title="Alana git">' +
                    '<i class="fas fa-arrow-turn-down" aria-hidden="true"></i><span class="cg-wchip-l">' + cgEsc(f.label) + '</span>' +
                    (f.note ? '<small>' + cgEsc(f.note) + '</small>' : '') + '<span class="cg-sr-only"> — alana git</span></button>';
            }).join('') + '</span><span class="cg-warn-d">' + cgEsc(m.d) + '</span>';
        } else {
            // "Kısa başlık: ayrıntı" biçimindeki iletilerde başlık ayrılır; değilse düzey adı başlık olur.
            const c = text.indexOf(': ');
            if (c >= 8 && c <= 60) { title = text.slice(0, c); body = '<span class="cg-warn-d">' + cgEsc(text.slice(c + 2)) + '</span>'; }
            else body = '<span class="cg-warn-d">' + cgEsc(text) + '</span>';
        }
        return '<li class="cg-warn is-' + x.k + '"><i class="fas ' + ico[x.k][0] + '" aria-hidden="true"></i>' +
            '<div class="cg-warn-c"><b class="cg-warn-t"><span class="cg-sr-only">' + ico[x.k][1] + ': </span>' + cgEsc(title) + '</b>' + body + '</div></li>';
    };
    const badge = (k, lbl) => '<span class="cg-wbadge is-' + k + (n[k] ? '' : ' is-zero') + '">' + n[k] + ' ' + lbl + '</span>';
    const head = n.err ? 'Düzeltilmesi gerekenler var' : n.warn ? 'Kontrol edilecekler var' : 'Bilgilendirme';
    box.classList.add('lvl-' + top);
    box.innerHTML = '<div class="cg-warns-hd"><i class="fas ' + ico[top][0] + '" aria-hidden="true"></i><b>' + head + '</b>' +
        '<span class="cg-wbadges">' + badge('err', 'hata') + badge('warn', 'uyarı') + badge('info', 'bilgi') + '</span></div>' +
        '<ul class="cg-warns-list" id="cg-warns-list">' + L.map(row).join('') + '</ul>' +
        '<button type="button" class="cg-warns-more" aria-controls="cg-warns-list" hidden></button>';
    box.hidden = false;
    say(n.err + ' hata, ' + n.warn + ' uyarı, ' + n.info + ' bilgi');
    cgWarnBar(box, n.err, n.warn);
    box.querySelectorAll('.cg-wchip').forEach(b => b.addEventListener('click', () => cgWarnGoto(fields[+b.dataset.wf])));
    const btn = box.querySelector('.cg-warns-more');
    btn.addEventListener('click', () => { cgWarnOpen = !cgWarnOpen; cgFitWarnings(); });
    cgFitWarnings();
    if (!cgShowWarnings.rz) {
        let t = null;
        cgShowWarnings.rz = true;
        window.addEventListener('resize', () => { clearTimeout(t); t = setTimeout(cgFitWarnings, 120); });
    }
}
// Tek sütunda (mobil) ekranın altında ince yapışkan özet çubuğu: hata/uyarı varsa ve uyarı kutusu
// görünür değilken çıkar; dokununca kutuya kaydırır. Çekmece/palet açıkken CSS ile gizlenir.
function cgWarnBar(box, nErr, nWarn) {
    let bar = document.getElementById('cg-warns-bar');
    if (!bar && box.parentNode) {
        bar = document.createElement('button');
        bar.type = 'button'; bar.id = 'cg-warns-bar'; bar.className = 'cg-warns-bar'; bar.hidden = true;
        bar.setAttribute('aria-controls', 'cg-term-warn');
        bar.addEventListener('click', () => {
            const b = document.getElementById('cg-term-warn');
            if (!b) return;
            const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            b.setAttribute('tabindex', '-1');
            b.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
            try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
        });
        box.parentNode.appendChild(bar);
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(es => es.forEach(e => bar.classList.toggle('is-near', e.isIntersecting))).observe(box);
        }
    }
    if (!bar) return;
    bar.hidden = !(nErr + nWarn);
    if (bar.hidden) return;
    bar.innerHTML = (nErr ? '<span class="is-err"><i class="fas fa-circle-xmark" aria-hidden="true"></i>' + nErr + ' hata</span>' : '') +
        (nWarn ? '<span class="is-warn"><i class="fas fa-triangle-exclamation" aria-hidden="true"></i>' + nWarn + ' uyarı</span>' : '') +
        '<span class="cg-warns-bar-go">Göster<i class="fas fa-chevron-down" aria-hidden="true"></i></span>';
}
// Çip → ilgili form alanı: kapalı <details> açılır, alan ortalanır ve odaklanır.
function cgWarnGoto(el) {
    if (!el || !el.isConnected) return;
    for (let d = el.closest('details'); d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); }
}
// Sütunda kalan boşluğa sığan kadar madde göster (en az 1; tek sütunda en çok 3); kalanı "N daha".
function cgFitWarnings() {
    const box = document.getElementById('cg-term-warn');
    if (!box || box.hidden) return;
    const items = Array.from(box.querySelectorAll('.cg-warn'));
    const btn = box.querySelector('.cg-warns-more');
    if (!items.length || !btn) return;
    items.forEach(li => { li.hidden = false; });
    btn.hidden = true;
    const out = box.offsetParent;
    const cs = out ? getComputedStyle(out) : null;
    const stuck = cs && cs.position === 'sticky' && cs.maxHeight !== 'none';
    let shown = items.length;
    if (!cgWarnOpen) {
        if (stuck) {
            const avail = parseFloat(cs.maxHeight) - box.offsetTop;
            btn.hidden = false;
            btn.textContent = '0 daha';
            while (shown > 1 && box.scrollHeight > avail + 1) items[--shown].hidden = true;
        } else if (items.length > 3) {
            shown = 3;
            items.slice(3).forEach(li => { li.hidden = true; });
        }
    }
    const more = items.length - shown;
    btn.hidden = !(more > 0 || cgWarnOpen) || items.length < 2;
    btn.setAttribute('aria-expanded', String(!!cgWarnOpen && !btn.hidden));
    btn.innerHTML = cgWarnOpen ? '<i class="fas fa-chevron-up" aria-hidden="true"></i>Daha az göster'
        : '<i class="fas fa-chevron-down" aria-hidden="true"></i>' + more + ' madde daha';
}
function cgShowOutput(config, warnings = []) {
    const body = document.getElementById('cg-term-body');
    if (!body) return;
    config = cgUnesc(config);

    const has = config && String(config).trim().length > 0;
    cgLastOutput = has ? config : '';

    if (has) {
        body.innerHTML = cgHighlight(config);
    } else {
        const prompt = (typeof cgTermPrompt === 'string' && cgTermPrompt) || 'device';
        body.innerHTML = '<span class="cg-term-idle"><b>' + cgEsc(prompt) + ' #</b> Yapılandırma bekleniyor\u2026</span>';
    }

    // Uyarılar: terminalin DIŞINDA, altında kompakt liste (kopyala/indir yalnız config'i alır: cgLastOutput)
    cgShowWarnings(warnings, has);

    // Kopyala / indir butonları
    ['cg-term-copy', 'cg-term-dl'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.disabled = !has;
    });
}

// Son üretilen config (kopyala/indir için)
let cgLastOutput = '';
// Terminal başlığındaki prompt (vendor seçilince güncellenir)
let cgTermPrompt = 'device';

function cgCopy() {
    if (!cgLastOutput) return;
    navigator.clipboard.writeText(cgLastOutput).then(() => {
        const btn = document.getElementById('cg-term-copy');
        if (!btn) return;
        const orig = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check"></i> Kopyalandı';
        btn.classList.add('is-ok');
        setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('is-ok'); }, 1800);
    });
}

function cgDownload() {
    if (!cgLastOutput) return;
    const name = (typeof cgTermPrompt === 'string' && cgTermPrompt !== 'device' ? cgTermPrompt : 'config')
        .replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
    const a = document.createElement('a');
    a.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(cgLastOutput);
    a.download = name + '.txt';
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
        // Renk CSS'ten gelsin — sabit değer karanlık temada okunmuyordu.
        el.style.removeProperty('color');
    });
    container.querySelectorAll('button[type="submit"], input[type="submit"]').forEach(el => {
        el.style.padding = '15px 36px';
        el.style.fontSize = '15.5px';
        el.style.fontWeight = '700';
        el.style.marginTop = '12px';
        el.style.width = '100%';
        el.style.borderRadius = '10px';
        el.style.removeProperty('background');
        el.style.removeProperty('border-color');
        el.style.removeProperty('color');
        el.style.letterSpacing = '.4px';
    });
}

// ─── Schema-Based Form Builder ───────────────────────────────────────────────

function cgFormBuilder(container, schema, generateFn) {
    const valFam = cgValFamily;   // doğrulayıcı ailesi: alanlar kurulurken sabitlenir
    const esc = cgEsc;

    function renderBadge(badge) {
        if (!badge) return '';
        return '<span class="cg-card-badge ' + esc(badge.cls) + '">' + esc(badge.text) + '</span>';
    }

    function renderTypeCards(types) {
        if (!types || !types.length) return '';
        // Gerçek Bootstrap gridi devrede: 1-2 tipte col-md-12/6 dev kart olurdu.
        const colW = Math.floor(12 / Math.max(Math.min(types.length, 4), 3));
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

    function _riField(name) {
        for (const sec of (schema.sections || [])) for (const x of (sec.fields || [])) if (x.name === name) return x;
        return null;
    }
    function _riLabel(name) {
        if (name === '_cgtype') return 'Yapılandırma tipi';
        const x = _riField(name); return (x && x.label) || name;
    }
    function _riValLabel(name, v) {
        if (name === '_cgtype') { const t = (schema.configTypes || []).find(c => c.id === v); return t ? t.label : v; }
        const x = _riField(name); if (!x || !x.options) return v;
        const o = x.options.find(o => (o.value !== undefined ? o.value : o.v) === v);
        return o ? (o.label !== undefined ? o.label : o.l) : v;
    }

    function renderField(f) {
        if (f.type === 'hidden') return '<input type="hidden" name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '" value="' + esc(f.value || '') + '">';

        const req  = f.required ? '<span class="text-danger">*</span>' : '';
        // 'Opsiyonel' etiketi eskiden ayri bir f.optional bayragina bagliydi.
        // Sonuc: 804 opsiyonel alanin yalnizca 388'i isaretliydi; kalan 416 alan
        // zorunlu alanlarla birebir ayni gorunuyordu (tek fark eksik yildiz).
        // Artik required'dan TURETILIYOR — zorunlu degilse opsiyoneldir.
        // Kosullu zorunlu alan (requiredIf): baska bir alanin degerine bagli.
        // Ornek: TACACS sunucu IP'si yalnizca yontem TACACS+ secildiginde zorunlu.
        const ri   = f.requiredIf;
        // Rozet aciklamasinda alan ADI degil ETIKET: 'auth_method = tacacs' degil
        // 'Auth Yöntemi = TACACS+ (fallback local)'.
        const riTxt = !ri ? '' : ri.checked === true  ? _riLabel(ri.field) + ' işaretliyken zorunlu'
                            : ri.checked === false ? _riLabel(ri.field) + ' işaretli değilken zorunlu'
                            : _riLabel(ri.field) + ' = ' + [].concat(ri.in).map(v => _riValLabel(ri.field, v)).join(' / ') + ' iken zorunlu';
        const opt  = ri ? '<span class="cg-opt cg-cond" title="' + esc(riTxt) + '">Koşullu</span>'
                   : (!f.required) ? '<span class="cg-opt">Opsiyonel</span>' : '';
        const tip  = f.tooltip  ? '<span class="cg-tip"><i class="fas fa-info-circle"></i><span class="cg-tip-text">' + esc(f.tooltip) + '</span></span>' : '';
        const hint = f.hint     ? '<span class="cg-field-hint">' + esc(f.hint) + '</span>' : '';
        // min/max var ama dogrulayici yoksa: tarayici kirmizi cizip SEBEP soylemiyordu,
        // deger de config'e aynen giriyordu. Dinamik aralik dogrulayicisina bagla.
        const vtype = f.validate || ((f.min !== undefined || f.max !== undefined) ? cgRangeValidator(f.min, f.max) : '');
        const why  = cgWhyBox(f.why, f.name) + cgRuleLine(vtype, valFam);

        const baseAttrs = 'name="' + esc(f.name) + '" id="cgfb_' + esc(f.name) + '"' +
            (f.required    ? ' required'                        : '') +
            (vtype         ? ' data-cgv="' + esc(vtype) + '"' : '') +
            (vtype && valFam ? ' data-cgf="' + esc(valFam) + '"' : '') +
            (ri ? ' data-req-if="' + esc(ri.field) + '"' +
                  (ri.checked !== undefined ? ' data-req-checked="' + (ri.checked ? '1' : '0') + '"'
                                            : ' data-req-in="' + esc([].concat(ri.in).join('|')) + '"') : '') +
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
                   hint + why + '</div>';
        }

        if (f.type === 'select') {
            // Option nesneleri iki bicimde yazilmis olabilir:
            //   { value: 'x', label: 'y' }   (kanonik)
            //   { v: 'x', l: 'y' }           (kisa bicim — Cisco modullerinde kullanilmis)
            // Renderer eskiden yalnizca ilkini okuyordu; kisa bicimde yazilan her
            // option bos <option> uretip ACILIR MENUYU BOS gosteriyordu.
            // Her iki bicimi de kabul et — deger bulunamazsa option'i hic uretme,
            // boylece sessizce bos menu yerine eksiklik gorunur olur.
            const opts = (f.options || []).map(o => {
                const val = (o.value !== undefined) ? o.value : o.v;
                const lbl = (o.label !== undefined) ? o.label : o.l;
                if (val === undefined && lbl === undefined) return '';
                return '<option value="' + esc(val !== undefined ? val : lbl) + '"' +
                       (o.selected ? ' selected' : '') + '>' +
                       esc(lbl !== undefined ? lbl : val) + '</option>';
            }).join('');
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><select ' + baseAttrs + ' class="form-select">' + opts + '</select>' + hint + why + '</div></div>';
        }

        if (f.type === 'textarea') {
            return '<div class="mb-4 row">' + label +
                   '<div class="col-sm-8"><textarea ' + baseAttrs + ' class="form-control" rows="' + (f.rows || 3) + '"></textarea>' + hint + why + '</div></div>';
        }

        return '<div class="mb-4 row">' + label +
               '<div class="col-sm-8"><input type="' + (f.type || 'text') + '" ' + baseAttrs + ' class="form-control">' + hint + why + '</div></div>';
    }

    function renderSection(sec) {
        const warn = sec.warn ? '<div class="cg-warn-box mb-4"><i class="fas fa-exclamation-triangle"></i><span>' + sec.warn + '</span></div>' : '';
        const info = sec.info ? '<div class="cg-info-callout mb-4"><i class="fas fa-info-circle"></i><span>' + sec.info + '</span></div>' : '';
        const showFor = sec.showFor ? ' data-showfor="' + esc(sec.showFor.join(',')) + '"' : '';
        const display = sec.showFor ? ' style="display:none"' : '';
        return '<div class="cg-fb-section"' + showFor + display + '>' +
               '<div class="cg-section"><div class="cg-section-title"><i class="' + esc(sec.icon || 'fas fa-cog') + '"></i> ' + esc(sec.title) + '</div>' +
               cgWhyBox(sec.why, 'sec') + warn + info +
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
        '<button type="submit" class="btn btn-primary cg-legacy-submit" style="display:none"' +
        ' id="' + formId + '_submit"><i class="fas fa-code"></i> ' + esc(schema.submit || 'Konfigürasyon Oluştur') + '</button>' +
        '</form>';

    const formEl = document.getElementById(formId);

    // ── Form verisini topla ──────────────────────────────────────────────
    function cgCollect(form, usePlaceholders) {
        const data = {};
        new FormData(form).forEach((v, k) => { data[k] = v; });
        form.querySelectorAll('input[type="checkbox"]').forEach(cb => { data[cb.name] = cb.checked; });
        // Canlı önizlemede bos ZORUNLU alanlar yerine placeholder kullanilir;
        // boylece cikti tip secilir secilmez calisir bir ornek olur.
        //
        // OPSIYONEL alanlara DOKUNULMAZ. Eskiden bos olan her alana placeholder
        // yaziliyordu; bu, kullanicinin hic doldurmadigi opsiyonel alanlari
        // "dolu" gosterip ilgili satiri config'e sokuyordu. Ornek: Native VLAN
        // bos birakildiginda bile 'switchport trunk native vlan 1' uretiliyordu.
        // Generator'lar zaten bos degeri atliyor (if (nativeVlan) ...), sorun
        // degerin burada uydurulmasiydi.
        if (usePlaceholders) {
            form.querySelectorAll('input[placeholder], textarea[placeholder]').forEach(el => {
                if (el.disabled || el.type === 'checkbox' || el.type === 'radio') return;
                if (!el.required) return;          // opsiyonel alan bos kalir
                if (!String(data[el.name] || '').trim() && el.placeholder) data[el.name] = el.placeholder;
            });
        }
        // GECERSIZ DEGERLER GENERATOR'A GONDERILMEZ.
        // Bloklayan dogrulayici (cgValidate) kod tabaninda tek yerden cagriliyordu
        // (ConfigGenerators_Cisco.js); diger 310 aracta 'required' ve 'validate'
        // yalnizca yildiz ve kirmizi cerceve ciziyor, uretimi engellemiyordu.
        // Sonuc: 'switchport trunk allowed vlan 1020304040404' veya
        // 'interface range sanane' gibi satirlar config'e girebiliyordu.
        // Canli onizlemede uretimi tumden bloklamak onizlemeyi yok eder; bunun
        // yerine gecersiz deger BOS sayilir — generator'lar bos degeri zaten
        // atliyor — ve cagiran tarafa bildirilir.
        data.__cgInvalid = [];
        form.querySelectorAll('[data-cgv]').forEach(el => {
            if (el.disabled) return;
            const raw = String(data[el.name] != null ? data[el.name] : '').trim();
            if (!raw) return;
            const v = cgElValidator(el);
            if (!v) return;
            const pass = v.re ? v.re.test(raw) : v.fn(raw, el);
            if (!pass) {
                data.__cgInvalid.push({ name: el.name, label: _cgLabelOf(el), value: raw,
                                        msg: cgFieldMsg(el.dataset.cgv, raw, el.dataset.cgf),
                                        reason: cgFieldReason(el.dataset.cgv, raw, el.dataset.cgf), el });
                // Silmek yerine BOS dize: korumasiz generator'lar (data.x'i dogrudan
                // yazanlar) aksi halde config'e 'undefined' yaziyordu.
                data[el.name] = '';
            }
        });
        // Bazı generator'lar tip alanını '_configType' diye okuyor; iki adı da ver.
        if (data._cgtype !== undefined) data._configType = data._cgtype;
        return data;
    }

    // ── Canlı üretim: her değişiklikte çalışır, hata fırlatmaz ───────────
    let liveTimer = null;
    function cgLiveRun() {
        // configTypes'lı formlarda tip seçilmeden üretme
        const typeInput = formEl.querySelector('[name="_cgtype"]');
        if (typeInput && !typeInput.value) {
            cgShowOutput('', []);
            return;
        }
        cgApplyRequiredIf(formEl);
        // Yumuşak doğrulama: alanları işaretler ama üretimi engellemez
        cgValidateSoft(formEl);
        // Doldurulmamış zorunlu alanları say -> kullanıcıya "örnek değer" uyarısı
        const empties = [];
        formEl.querySelectorAll('input[placeholder]:not([type=checkbox]):not([type=radio]), textarea[placeholder]').forEach(el => {
            // Yalnizca ZORUNLU alanlar icin ornek deger kullanildigindan, uyari da
            // yalnizca onlari listeler. Opsiyonel bos alan bir eksiklik degildir.
            if (!el.required) return;
            if (!el.disabled && !String(el.value || '').trim()) {
                // Placeholder her zaman gecerli bir ornek DEGILDIR: bazilari
                // "10,20,30 veya all" gibi insan icin yazilmis ipuclaridir ve
                // aynen config'e girerse satiri bozar. Bunlari isaretle.
                const ph = el.placeholder;
                const proseHint = /\b(veya|ya da|or)\b|\.\.\.|…/i.test(ph);
                empties.push({ el: el, label: _cgLabelOf(el), ph: ph, prose: proseHint });
                // ZORUNLU alanin bos olmasi bir uyari degil HATADIR. Ilk render'da
                // butun form kirmiziya donmesin diye cerceve yalnizca kullanicinin
                // dokundugu (odakladiktan sonra ciktigi) alanlara cizilir.
                if (el.dataset.cgTouched) {
                    el.classList.add('is-invalid');
                    _cgSetError(el, 'Bu alan zorunludur — boş bırakılırsa config eksik üretilir');
                }
            } else if (!el.dataset.cgv) {
                // Dogrulayicisi olmayan zorunlu alan dolduruldu: hatasini temizle.
                // (Dogrulayicisi olanlari cgValidateSoft zaten temizliyor.)
                _cgClearError(el);
            }
        });
        try {
            const collected = cgCollect(formEl, true);
            const invalid = collected.__cgInvalid || [];
            delete collected.__cgInvalid;
            const result = generateFn(collected, formEl);
            const warns = [];
            cgWarnMeta.clear();
            if (invalid.length) {
                invalid.forEach(iv => {
                    iv.el.classList.add('is-invalid');
                    _cgSetError(iv.el, iv.msg);
                });
                const msgI = '\u26D4 ' + invalid.length + ' alan GEÇERSİZ, config\'e yazılmadı: ' +
                    invalid.slice(0, 4).map(iv => iv.label + ' = "' + iv.value + '"' +
                        (iv.reason ? ' (' + iv.reason + ')' : '')).join('; ') +
                    (invalid.length > 4 ? ' ve ' + (invalid.length - 4) + ' tane daha' : '') +
                    ' — düzeltmeden kullanmayın.';
                warns.push(msgI);
                cgWarnMeta.set(msgI, { t: invalid.length + ' geçersiz alan', d: 'Bu alanlar config\'e yazılmadı — düzeltmeden kullanmayın.',
                    f: invalid.map(iv => ({ el: iv.el, label: iv.label, note: '"' + iv.value + '"' + (iv.reason ? ' · ' + iv.reason : '') })) });
            }
            if (empties.length) {
                const anyProse = empties.some(e => e.prose);
                const msgE = '\u26D4 ' + empties.length + ' ZORUNLU alan boş: ' +
                    empties.slice(0, 4).map(e => e.label + (e.prose ? ' \u26A0' : '')).join(', ') +
                    (empties.length > 4 ? ' ve ' + (empties.length - 4) + ' tane daha' : '') +
                    ' — önizlemede örnek değerle dolduruldu, cihaza uygulamadan önce doldurun.';
                warns.push(msgE);
                cgWarnMeta.set(msgE, { t: empties.length + ' zorunlu alan boş', d: 'Önizlemede örnek değerle dolduruldu — cihaza uygulamadan önce doldurun.',
                    f: empties.map(e => ({ el: e.el, label: e.label, note: e.prose ? 'örnek değer açıklama metni' : '' })) });
                if (anyProse) {
                    warns.push('\u26A0 ile işaretli alanların örnek değeri bir açıklama metnidir, geçerli bir ' +
                               'yapılandırma değeri değildir — o satırlar cihazda çalışmaz, elle doldurun.');
                }
            }
            if (typeof result === 'string') cgShowOutput(result, warns);
            else if (result) cgShowOutput(result.config || '', (result.warnings || []).concat(warns));
            else cgShowOutput('', []);
        } catch (err) {
            // Eksik alan yüzünden generator patlayabilir; sessizce bekleme durumuna düş
            cgShowOutput('', []);
        }
    }

    function cgLiveSchedule() {
        clearTimeout(liveTimer);
        const dot = document.getElementById('cg-live-dot');
        if (dot) dot.classList.add('is-stale');
        liveTimer = setTimeout(() => {
            cgLiveRun();
            if (dot) dot.classList.remove('is-stale');
        }, 160);
    }
    container._cgLiveRun = cgLiveRun;

    formEl.addEventListener('input',  cgLiveSchedule);
    formEl.addEventListener('change', cgLiveSchedule);

    // Alandan cikildiginda 'dokunuldu' say. Zorunlu bos alanin kirmizi cercevesi
    // buna bagli: ilk acilista her zorunlu alan bos oldugu icin form bastan
    // kirmiziya boyanmaz, kullanici alani gecip bos biraktiginda boyanir.
    formEl.addEventListener('blur', e => {
        const el = e.target;
        if (!el || !el.name) return;
        el.dataset.cgTouched = '1';
        cgLiveSchedule();
    }, true);

    // Submit artık gerekli değil ama form enter'ı sayfayı yenilemesin
    formEl.addEventListener('submit', e => { e.preventDefault(); cgLiveRun(); });

    // İlk render: placeholder/default değerlerle bir kez üret
    cgLiveRun();

    cgPostRender(container);
}

// requiredIf: kosul saglandiginda alan zorunlu olur. Gizli (showFor) bolumdeki
// alan kosul saglansa bile zorunlu sayilmaz — bolum zaten config'e girmez.
function cgApplyRequiredIf(form) {
    form.querySelectorAll('[data-req-if]').forEach(el => {
        const ctl = form.querySelector('[name="' + el.dataset.reqIf + '"]');
        let on = false;
        if (ctl) on = el.dataset.reqChecked !== undefined ? (!!ctl.checked === (el.dataset.reqChecked === '1'))
                                                          : el.dataset.reqIn.split('|').includes(ctl.value);
        const sec = el.closest('.cg-fb-section');
        if (sec && sec.style.display === 'none') on = false;
        el.required = on;
        if (!on && !String(el.value || '').trim()) { el.classList.remove('is-invalid'); _cgClearError(el); }
    });
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
            // Gizli bolumdeki HER alan devre disi: eskiden yalniz zorunlular
            // kapatiliyordu. Ayni adli alan iki bolumde varsa (SNMP v3 ve v1/v2c'de
            // trap_host) gizlideki bos kopya FormData'da gorunenin degerini eziyordu.
            el.disabled = !show;
            if (el.dataset.reqIf) return;          // zorunlulugu cgApplyRequiredIf yonetir
            if (el.dataset.origRequired === 'true' || el.required) {
                if (!el.dataset.origRequired) el.dataset.origRequired = 'true';
                el.required = show;
            }
        });
    });
    // Canlı üretim: tip seçilir seçilmez çıktıyı yenile
    const host = form.closest('#cg-form-area') || form.parentElement;
    if (host && typeof host._cgLiveRun === 'function') host._cgLiveRun();
}

// ─── GENERATORS Registry ─────────────────────────────────────────────────────

// ─── Kategoriler ─────────────────────────────────────────────────────────────
// Her vendor icinde SABIT sirada gosterilir; bos kategori gizlenir. Boylece
// "Syslog nerede?" sorusunun cevabi her vendor'da ayni yerdir.
const CG_CATEGORIES = [
    { id: 'base',    label: 'Temel Kurulum',             icon: 'fas fa-play-circle' },
    { id: 'mgmt',    label: 'Yönetim & İzleme',          icon: 'fas fa-chart-line' },
    { id: 'aaa',     label: 'Kimlik & Erişim',           icon: 'fas fa-user-shield' },
    { id: 'l2',      label: 'L2 Switching',              icon: 'fas fa-sitemap' },
    { id: 'iface',   label: 'Arayüz & Adresleme',        icon: 'fas fa-ethernet' },
    { id: 'routing', label: 'Yönlendirme',               icon: 'fas fa-route' },
    { id: 'ha',      label: 'Yedeklilik / HA',           icon: 'fas fa-clone' },
    { id: 'overlay', label: 'DC Fabric / Overlay',       icon: 'fas fa-project-diagram' },
    { id: 'mpls',    label: 'MPLS / Servis Sağlayıcı',   icon: 'fas fa-tags' },
    { id: 'secpol',  label: 'Güvenlik Politikası & NAT', icon: 'fas fa-shield-alt' },
    { id: 'vpn',     label: 'VPN',                       icon: 'fas fa-lock' },
    { id: 'utm',     label: 'Tehdit Önleme / UTM',       icon: 'fas fa-bug' },
    { id: 'qos',     label: 'QoS & Trafik',              icon: 'fas fa-tachometer-alt' },
    { id: 'adc',     label: 'Uygulama Teslimi (ADC)',    icon: 'fas fa-balance-scale' },
    { id: 'ref',     label: 'Referans',                  icon: 'fas fa-book-open' },
];
const CG_CAT_BY_ID = Object.fromEntries(CG_CATEGORIES.map(c => [c.id, c]));

const CG_REGISTRY = {
    'cisco-ios': {
        label: 'Cisco IOS', icon: 'fas fa-network-wired', color: '#1BA0D7',
        types: [
            { id: 'vlan',          cat: 'l2', label: 'VLAN',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vlan },
            { id: 'interface',     cat: 'iface', label: 'Interface',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.interface },
            { id: 'acl',           cat: 'secpol', label: 'ACL',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.acl },
            { id: 'nat',           cat: 'secpol', label: 'NAT / PAT',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.nat },
            { id: 'static-route',  cat: 'routing', label: 'Static Route',    gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.route },
            { id: 'ospf',          cat: 'routing', label: 'OSPF',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ospf },
            { id: 'ospf-interface',cat: 'routing', label: 'OSPF Interface',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ospfInterface },
            { id: 'ospfv3',        cat: 'routing', label: 'OSPFv3',          gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ospfv3 },
            { id: 'bgp',           cat: 'routing', label: 'BGP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bgp },
            { id: 'bgp-af',        cat: 'routing', label: 'BGP Address-Family', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bgpAddressFamily },
            { id: 'ipsec',         cat: 'vpn', label: 'IPSec VPN',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ipsec },
            { id: 'dhcp',          cat: 'base', label: 'DHCP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dhcp },
            { id: 'snmp',          cat: 'mgmt', label: 'SNMP',            gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.snmp },
            { id: 'aaa',           cat: 'aaa', label: 'AAA',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.aaa },
            { id: 'tacacs',        cat: 'aaa', label: 'TACACS+',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tacacs },
            { id: 'ssh',           cat: 'aaa', label: 'SSH',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ssh },
            { id: 'password',      cat: 'aaa', label: 'Password/User',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.password },
            { id: 'vrrp-hsrp',     cat: 'ha', label: 'VRRP/HSRP/GLBP', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrrp },
            { id: 'stp',           cat: 'l2', label: 'STP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.stp },
            { id: 'port-security', cat: 'l2', label: 'Port Security',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.portSecurity },
            { id: 'qos',           cat: 'qos', label: 'QoS',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.qos },
            { id: 'gre',           cat: 'vpn', label: 'GRE Tunnel',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.gre },
            { id: 'tracking',      cat: 'ha', label: 'IP SLA/Tracking', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.tracking },
            { id: 'rate-limit',    cat: 'qos', label: 'Rate Limit',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.rateLimit },
            { id: 'advanced',      cat: 'base', label: 'Advanced Multi',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.advanced },
            { id: 'etherchannel',  cat: 'l2', label: 'EtherChannel/LACP',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.etherchannel },
            { id: 'dmvpn',         cat: 'vpn', label: 'DMVPN',              gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.dmvpn },
            { id: 'eigrpnamed',    cat: 'routing', label: 'EIGRP Named Mode',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.eigrpnamed },
            { id: 'vrflite',       cat: 'routing', label: 'VRF-Lite',           gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrflite },
            { id: 'vrf-af',        cat: 'routing', label: 'VRF Address-Family', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vrfAddressFamily },
            { id: 'evpn-global',   cat: 'overlay', label: 'EVPN Global',           gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.evpnGlobal },
            { id: 'evpn-evi',      cat: 'overlay', label: 'EVPN Instance (EVI)',   gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.evpnEvi },
            { id: 'evpn-es',       cat: 'overlay', label: 'EVPN Ethernet Segment', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.evpnEthernet },
            { id: 'vxlan-vtep',    cat: 'overlay', label: 'VXLAN VTEP (NVE)',      gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vxlanVtep },
            { id: 'mpls',          cat: 'mpls', label: 'MPLS / LDP',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.mpls },
            { id: 'l3vpn',         cat: 'mpls', label: 'L3VPN (PE)',          gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.l3vpn },
            { id: 'routemap',      cat: 'routing', label: 'Route-Map & Redist.', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.routemap },
            { id: 'prefix-list',   cat: 'routing', label: 'IPv4 Prefix-List', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.prefixList },
            { id: 'isis',          cat: 'routing', label: 'IS-IS',               gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.isis },
            { id: 'zbfw',          cat: 'secpol', label: 'Zone-Based Firewall',  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.zbfw },
            { id: 'bfd',           cat: 'routing', label: 'BFD',                  gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bfd },
            { id: 'bfd-template',  cat: 'routing', label: 'BFD Template',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.bfdTemplate },
            { id: 'span',          cat: 'mgmt', label: 'SPAN / RSPAN',         gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.span },
            { id: 'ntp',           cat: 'mgmt', label: 'NTP / Saat',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.ntp },
            { id: 'logging',       cat: 'mgmt', label: 'Syslog / Logging',       gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.logging },
            { id: 'lldp',          cat: 'l2',   label: 'LLDP / CDP',             gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.lldp },
            { id: 'archive',       cat: 'mgmt', label: 'Config Archive / Yedek', gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.archive },
            { id: 'vtp',           cat: 'l2',   label: 'VTP',                    gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.vtp },
            { id: 'hardening',     cat: 'base', label: 'Güvenlik Sıkılaştırma (Hardening)',     gen: () => typeof CiscoIOS !== 'undefined' && CiscoIOS.hardening },
        ]
    },
    'cisco-ftd': {
        label: 'Cisco FTD', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'bootstrap',       cat: 'base', label: 'FTD Bootstrap',        gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.bootstrap },
            { id: 'interface',       cat: 'iface', label: 'Interface',             gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.interface },
            { id: 'nat',             cat: 'secpol', label: 'NAT',                   gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.nat },
            { id: 'accessControl',   cat: 'secpol', label: 'Access Control Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.accessControl },
            { id: 'intrusionPolicy', cat: 'utm', label: 'Intrusion Policy',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.intrusionPolicy },
            { id: 'sslPolicy',       cat: 'utm', label: 'SSL Policy',            gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.sslPolicy },
            { id: 'siteToSiteVpn',   cat: 'vpn', label: 'Site-to-Site VPN',      gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.siteToSiteVpn },
            { id: 'raVpn',           cat: 'vpn', label: 'Remote Access VPN',     gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.raVpn },
            { id: 'platformSyslog', cat: 'mgmt', label: 'Platform Settings: Syslog', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformSyslog },
            { id: 'platformTime', cat: 'mgmt', label: 'Platform Settings: NTP', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformTime },
            { id: 'platformSnmp', cat: 'mgmt', label: 'Platform Settings: SNMP', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.platformSnmp },
            { id: 'staticRoute', cat: 'routing', label: 'Static Route + SLA', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.staticRoute },
            { id: 'prefilter', cat: 'secpol', label: 'Prefilter Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.prefilter },
            { id: 'identityPolicy', cat: 'secpol', label: 'Identity Policy', gen: () => typeof CiscoFTD !== 'undefined' && CiscoFTD.identityPolicy },
        ]
    },
    'cisco-nxos': {
        label: 'Cisco NX-OS', icon: 'fas fa-server', color: '#1BA0D7',
        types: [
            { id: 'mpls',  cat: 'mpls', label: 'MPLS',       gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.mpls },
            { id: 'vpc',   cat: 'ha', label: 'vPC',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vpc },
            { id: 'vxlan', cat: 'overlay', label: 'VXLAN/EVPN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vxlan },
            { id: 'span',  cat: 'mgmt', label: 'SPAN/RSPAN',  gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.span },
            { id: 'ospf',  cat: 'routing', label: 'OSPF',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ospf },
            { id: 'ospfv3',cat: 'routing', label: 'OSPFv3',      gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ospfv3 },
            { id: 'bfd',   cat: 'routing', label: 'BFD Global / Interface', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bfd },
            { id: 'bgp',   cat: 'routing', label: 'BGP',         gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgp },
            { id: 'bgp-af',       cat: 'routing', label: 'BGP Address-Family',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgpAddressFamily },
            { id: 'bgp-nbr-af',   cat: 'routing', label: 'BGP Neighbor Address-Family', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgpNeighborAf },
            { id: 'bgp-template', cat: 'routing', label: 'BGP Peer Template',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.bgpTemplate },
            { id: 'igmp',          cat: 'routing', label: 'IGMP',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.igmp },
            { id: 'igmp-snooping', cat: 'l2',      label: 'IGMP Snooping', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.igmpSnooping },
            { id: 'pim',           cat: 'routing', label: 'PIM',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.pim },
            { id: 'udld',          cat: 'l2',      label: 'UDLD',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.udld },
            { id: 'vrrp',          cat: 'ha',      label: 'VRRP',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vrrp },
            { id: 'vrrpv3',        cat: 'ha',      label: 'VRRPv3',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vrrpv3 },
            { id: 'vtp',           cat: 'l2',      label: 'VTP',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vtp },
            { id: 'hsrp',       cat: 'ha', label: 'HSRP',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.hsrp },
            { id: 'evpn',       cat: 'overlay', label: 'EVPN',          gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.evpn },
            { id: 'fabricPath', cat: 'overlay', label: 'FabricPath',    gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.fabricPath },
            { id: 'aaa',        cat: 'aaa', label: 'AAA',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.aaa },
            { id: 'acl',        cat: 'secpol', label: 'ACL',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.acl },
            { id: 'prefix-list',cat: 'routing', label: 'IPv4/IPv6 Prefix-List', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.prefixList },
            { id: 'route-map',  cat: 'routing', label: 'Route-Map', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.routeMap },
            { id: 'qos',        cat: 'qos', label: 'QoS',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.qos },
            { id: 'syslog',     cat: 'mgmt', label: 'Syslog',        gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.syslog },
            { id: 'ntp',        cat: 'mgmt', label: 'NTP',           gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.ntp },
            { id: 'telemetry',  cat: 'mgmt', label: 'Model-Driven Telemetry', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.telemetry },
            { id: 'nxapi',      cat: 'mgmt', label: 'NX-API', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.nxapi },
            { id: 'features', cat: 'base', label: 'Feature Yönetimi', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.features },
            { id: 'system', cat: 'base', label: 'Temel Sistem', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.system },
            { id: 'vlan', cat: 'l2', label: 'VLAN', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vlan },
            { id: 'interface', cat: 'iface', label: 'Arayüz', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.interface },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.snmp },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.staticRoute },
            { id: 'vrf', cat: 'routing', label: 'VRF Context', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.vrf },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.stp },
            { id: 'users', cat: 'aaa', label: 'Kullanıcı / RBAC', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.users },
            { id: 'mgmtAccess', cat: 'mgmt', label: 'Banner / Line / SSH', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.mgmtAccess },
            { id: 'scheduler', cat: 'mgmt', label: 'Otomatik Yedek (Scheduler)', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.scheduler },
            { id: 'pvlan', cat: 'l2', label: 'Private VLAN', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.pvlan },
            { id: 'lldp', cat: 'l2', label: 'LLDP / CDP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.lldp },
            { id: 'copp', cat: 'secpol', label: 'CoPP', gen: () => typeof CiscoNXOS !== 'undefined' && CiscoNXOS.copp },
        ]
    },
    'huawei': {
        label: 'Huawei VRP', icon: 'fas fa-broadcast-tower', color: '#CF0A2C',
        types: [
            { id: 'basic',       cat: 'base', label: 'Temel',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.basic },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vlan },
            { id: 'dhcp',        cat: 'base', label: 'DHCP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.dhcp },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmp },
            { id: 'nat',         cat: 'secpol', label: 'NAT/Port Forward',     gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.nat },
            { id: 'tacacs',      cat: 'aaa', label: 'TACACS+',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.tacacs },
            { id: 'acl',         cat: 'secpol', label: 'ACL',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.acl },
            { id: 'security',    cat: 'secpol', label: 'Security Policy',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.security },
            { id: 'isis',        cat: 'routing', label: 'IS-IS',                gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.isis },
            { id: 'ethtunk',     cat: 'l2', label: 'Eth-Trunk (LAG)',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ethtunk },
            { id: 'mpls',        cat: 'mpls', label: 'MPLS / LDP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mpls },
            { id: 'l3vpn',       cat: 'mpls', label: 'L3VPN (VRF)',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.l3vpn },
            { id: 'interface',   cat: 'iface', label: 'Interface / Loopback', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.interface },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                 gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bgp },
            { id: 'mstp',        cat: 'l2', label: 'MSTP / STP',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mstp },
            { id: 'qos',         cat: 'qos', label: 'QoS MQC',              gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.qos },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                  gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.bfd },
            { id: 'ntp',         cat: 'mgmt', label: 'NTP / Clock',          gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ntp },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / RADIUS',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.aaa },
            { id: 'snmpv3',      cat: 'mgmt', label: 'SNMP v3 (Detaylı)',    gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.snmpv3 },
            { id: 'ssh',         cat: 'aaa', label: 'SSH / User',           gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ssh },
            { id: 'routepolicy', cat: 'routing', label: 'Route Policy',         gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.routepolicy },
            { id: 'ipsec',       cat: 'vpn', label: 'IPSec VPN IKEv2',      gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipsec },
            { id: 'ipv6',        cat: 'iface', label: 'IPv6 Interface',       gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.ipv6 },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.syslog },
            { id: 'lldp', cat: 'mgmt', label: 'LLDP', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.lldp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.staticroute },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vrrp },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.mirror },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.storm },
            { id: 'vty', cat: 'aaa', label: 'VTY / Yönetim Erişimi', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.vty },
            { id: 'stack', cat: 'ha', label: 'iStack', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.stack },
            { id: 'igmpsnoop', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.igmpsnoop },
            { id: 'stpguard', cat: 'l2', label: 'STP Port Koruması', gen: () => typeof HuaweiVRP !== 'undefined' && HuaweiVRP.stpguard },
        ]
    },
    'juniper': {
        label: 'Juniper JunOS', icon: 'fas fa-leaf', color: '#84B135',
        types: [
            { id: 'general', cat: 'base', label: 'Genel',         gen: () => typeof Juniper !== 'undefined' && Juniper.general },
            { id: 'vlan',    cat: 'l2', label: 'VLAN',           gen: () => typeof Juniper !== 'undefined' && Juniper.vlan },
            { id: 'dhcp',    cat: 'base', label: 'DHCP',           gen: () => typeof Juniper !== 'undefined' && Juniper.dhcp },
            { id: 'acl',      cat: 'secpol', label: 'ACL/Filter',    gen: () => typeof Juniper !== 'undefined' && Juniper.acl },
            { id: 'lag',      cat: 'l2', label: 'LAG (ae)',       gen: () => typeof Juniper !== 'undefined' && Juniper.lag },
            { id: 'mclag',    cat: 'ha', label: 'MC-LAG',          gen: () => typeof Juniper !== 'undefined' && Juniper.mclag },
            { id: 'evpnvxlan',cat: 'overlay', label: 'EVPN-VXLAN',     gen: () => typeof Juniper !== 'undefined' && Juniper.evpnvxlan },
            { id: 'system', cat: 'base', label: 'Sistem Temeli (DNS/NTP/Banner)', gen: () => typeof Juniper !== 'undefined' && Juniper.system },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog', gen: () => typeof Juniper !== 'undefined' && Juniper.syslog },
            { id: 'users', cat: 'aaa', label: 'Kullanıcı & Login Class', gen: () => typeof Juniper !== 'undefined' && Juniper.users },
            { id: 'ssh', cat: 'aaa', label: 'SSH Servisi', gen: () => typeof Juniper !== 'undefined' && Juniper.ssh },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof Juniper !== 'undefined' && Juniper.snmp },
            { id: 'lldp', cat: 'l2', label: 'LLDP / LLDP-MED', gen: () => typeof Juniper !== 'undefined' && Juniper.lldp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof Juniper !== 'undefined' && Juniper.staticroute },
            { id: 'stp', cat: 'l2', label: 'RSTP / MSTP', gen: () => typeof Juniper !== 'undefined' && Juniper.stp },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof Juniper !== 'undefined' && Juniper.ospf },
            { id: 'bgp', cat: 'routing', label: 'BGP', gen: () => typeof Juniper !== 'undefined' && Juniper.bgp },
            { id: 'policy', cat: 'routing', label: 'Policy-Options', gen: () => typeof Juniper !== 'undefined' && Juniper.policy },
            { id: 'vrrp', cat: 'ha', label: 'VRRP (IRB)', gen: () => typeof Juniper !== 'undefined' && Juniper.vrrp },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof Juniper !== 'undefined' && Juniper.storm },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring (Analyzer)', gen: () => typeof Juniper !== 'undefined' && Juniper.mirror },
            { id: 'archival', cat: 'mgmt', label: 'Config Arşivleme', gen: () => typeof Juniper !== 'undefined' && Juniper.archival },
            { id: 'igmp', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof Juniper !== 'undefined' && Juniper.igmp },
        ]
    },
    'juniper-mx': {
        label: 'Juniper MX', icon: 'fas fa-leaf', color: '#5A8A1A',
        types: [
            { id: 'interface',    cat: 'iface', label: 'Interface',                    gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.interface },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',                         gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.ospf },
            { id: 'bgp',          cat: 'routing', label: 'BGP',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bgp },
            { id: 'mpls',         cat: 'mpls', label: 'MPLS / LDP',                   gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.mpls },
            { id: 'l3vpn',        cat: 'mpls', label: 'L3VPN (VRF)',                  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.l3vpn },
            { id: 'bfd',          cat: 'routing', label: 'BFD',                          gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bfd },
            { id: 'rsvpte',       cat: 'mpls', label: 'Traffic Engineering RSVP-TE',  gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.rsvpte },
            { id: 'cos',          cat: 'qos', label: 'QoS / Class-of-Service',       gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.cos },
            { id: 'routepolicy',  cat: 'routing', label: 'Routing Policy + Prefix-List', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.routepolicy },
            { id: 'snmp',         cat: 'mgmt', label: 'SNMP v3',                      gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.snmp },
            { id: 'system', cat: 'base', label: 'Sistem Temeli (RE0/RE1, NTP, DNS, Syslog)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.system },
            { id: 'staticroute', cat: 'routing', label: 'Static Route + Virtual-Router', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.staticroute },
            { id: 'isis', cat: 'routing', label: 'IS-IS', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.isis },
            { id: 'ldpadv', cat: 'mpls', label: 'LDP Gelişmiş (Sync / Protection / MD5)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.ldpadv },
            { id: 'l2vpn', cat: 'mpls', label: 'L2VPN (L2Circuit / VPLS / EVPN-MPLS)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.l2vpn },
            { id: 'protectre', cat: 'secpol', label: 'Protect-RE (lo0 Filtresi)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.protectre },
            { id: 'policer', cat: 'qos', label: 'Policer (Rate-Limit)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.policer },
            { id: 'bgprr', cat: 'routing', label: 'BGP Route Reflector', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.bgprr },
            { id: 'cosrewrite', cat: 'qos', label: 'CoS Rewrite Rules', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.cosrewrite },
            { id: 'gres', cat: 'ha', label: 'GRES / NSR (Çift RE)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.gres },
            { id: 'jflow', cat: 'mgmt', label: 'Inline J-Flow (IPFIX / v9)', gen: () => typeof JuniperMX !== 'undefined' && JuniperMX.jflow },
        ]
    },
    'juniper-srx': {
        label: 'Juniper SRX', icon: 'fas fa-shield-alt', color: '#3A6B0A',
        types: [
            { id: 'zone',        cat: 'secpol', label: 'Security Zone',         gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.zone },
            { id: 'policy',      cat: 'secpol', label: 'Security Policy',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.policy },
            { id: 'nat',         cat: 'secpol', label: 'NAT Policy',            gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.nat },
            { id: 'vpn',         cat: 'vpn', label: 'IPsec VPN',             gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.vpn },
            { id: 'ha',          cat: 'ha', label: 'Chassis Cluster',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ha },
            { id: 'appfw',       cat: 'utm', label: 'AppSecure / UTM',       gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.appfw },
            { id: 'interface',   cat: 'iface', label: 'Interface ge/xe/ae',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.interface },
            { id: 'addrbook',    cat: 'secpol', label: 'Address Book Object',   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.addrbook },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                  gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                   gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.bgp },
            { id: 'staticroute', cat: 'routing', label: 'Static Route',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.staticroute },
            { id: 'dhcp',        cat: 'base', label: 'DHCP Server',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.dhcp },
            { id: 'screens',     cat: 'utm', label: 'Screens DoS',           gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.screens },
            { id: 'customapp',   cat: 'utm', label: 'Custom Application',    gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.customapp },
            { id: 'alg',         cat: 'utm', label: 'ALG Settings',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.alg },
            { id: 'jflow',       cat: 'mgmt', label: 'J-Flow / NetFlow',      gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.jflow },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP v3',               gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.snmp },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / RADIUS',          gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.aaa },
            { id: 'syslog', cat: 'mgmt', label: 'System Syslog', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.syslog },
            { id: 'seclog', cat: 'mgmt', label: 'Security Log', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.seclog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.ntp },
            { id: 'login', cat: 'aaa', label: 'Kullanıcı / Login', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.login },
            { id: 'vr', cat: 'routing', label: 'Virtual Router', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.vr },
            { id: 'reth', cat: 'ha', label: 'Cluster reth / RG', gen: () => typeof JuniperSRX !== 'undefined' && JuniperSRX.reth },
        ]
    },
    'dell': {
        label: 'Dell OS10', icon: 'fas fa-hdd', color: '#007DB8',
        types: [
            { id: 'general',      cat: 'base', label: 'Genel',           gen: () => typeof Dell !== 'undefined' && Dell.general },
            { id: 'vlan',         cat: 'l2', label: 'VLAN',             gen: () => typeof Dell !== 'undefined' && Dell.vlan },
            { id: 'portchannel',  cat: 'l2', label: 'Port-Channel/LAG', gen: () => typeof Dell !== 'undefined' && Dell.portchannel },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',             gen: () => typeof Dell !== 'undefined' && Dell.ospf },
            { id: 'bgp',          cat: 'routing', label: 'BGP',              gen: () => typeof Dell !== 'undefined' && Dell.bgp },
            { id: 'vlt',          cat: 'ha', label: 'VLT (MLAG)',        gen: () => typeof Dell !== 'undefined' && Dell.vlt },
            { id: 'acl',          cat: 'secpol', label: 'ACL',               gen: () => typeof Dell !== 'undefined' && Dell.acl },
            { id: 'qos',          cat: 'qos', label: 'QoS Policy',        gen: () => typeof Dell !== 'undefined' && Dell.qos },
            { id: 'vxlan',        cat: 'overlay', label: 'VXLAN',            gen: () => typeof Dell !== 'undefined' && Dell.vxlan },
            { id: 'mclag',        cat: 'ha', label: 'MC-LAG',            gen: () => typeof Dell !== 'undefined' && Dell.mclag },
            { id: 'bgpEvpn',      cat: 'overlay', label: 'BGP EVPN',          gen: () => typeof Dell !== 'undefined' && Dell.bgpEvpn },
            { id: 'qosPolicy',    cat: 'qos', label: 'QoS Policy Map',    gen: () => typeof Dell !== 'undefined' && Dell.qosPolicy },
            { id: 'ntp',          cat: 'mgmt', label: 'NTP',               gen: () => typeof Dell !== 'undefined' && Dell.ntp },
            { id: 'syslog',       cat: 'mgmt', label: 'Syslog',            gen: () => typeof Dell !== 'undefined' && Dell.syslog },
            { id: 'snmpv3',       cat: 'mgmt', label: 'SNMP v3',           gen: () => typeof Dell !== 'undefined' && Dell.snmpv3 },
            { id: 'stormControl', cat: 'qos', label: 'Storm Control',     gen: () => typeof Dell !== 'undefined' && Dell.stormControl },
            { id: 'aaa', cat: 'aaa', label: 'AAA / Kullanıcı', gen: () => typeof Dell !== 'undefined' && Dell.aaa },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof Dell !== 'undefined' && Dell.stp },
            { id: 'vrf', cat: 'routing', label: 'VRF', gen: () => typeof Dell !== 'undefined' && Dell.vrf },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof Dell !== 'undefined' && Dell.staticRoute },
            { id: 'lldp', cat: 'l2', label: 'LLDP', gen: () => typeof Dell !== 'undefined' && Dell.lldp },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof Dell !== 'undefined' && Dell.mirror },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof Dell !== 'undefined' && Dell.vrrp },
            { id: 'iface', cat: 'iface', label: 'Arayüz', gen: () => typeof Dell !== 'undefined' && Dell.iface },
            { id: 'breakout', cat: 'iface', label: 'Breakout / Port-Group', gen: () => typeof Dell !== 'undefined' && Dell.breakout },
            { id: 'iscsi', cat: 'qos', label: 'iSCSI', gen: () => typeof Dell !== 'undefined' && Dell.iscsi },
            { id: 'hardening', cat: 'base', label: 'Banner / Sıkılaştırma', gen: () => typeof Dell !== 'undefined' && Dell.hardening },
        ]
    },
    'arista': {
        label: 'Arista EOS', icon: 'fas fa-ethernet', color: '#FF6600',
        types: [
            { id: 'general',     cat: 'base', label: 'General',                gen: () => typeof Arista !== 'undefined' && Arista.general },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                   gen: () => typeof Arista !== 'undefined' && Arista.vlan },
            { id: 'interface',   cat: 'iface', label: 'Interface (L3)',          gen: () => typeof Arista !== 'undefined' && Arista.interface },
            { id: 'portchannel', cat: 'l2', label: 'Port-Channel/LACP',      gen: () => typeof Arista !== 'undefined' && Arista.portchannel },
            { id: 'mlag',        cat: 'ha', label: 'MLAG',                   gen: () => typeof Arista !== 'undefined' && Arista.mlag },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                   gen: () => typeof Arista !== 'undefined' && Arista.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                    gen: () => typeof Arista !== 'undefined' && Arista.bgp },
            { id: 'evpnvxlan',   cat: 'overlay', label: 'EVPN-VXLAN',             gen: () => typeof Arista !== 'undefined' && Arista.evpnvxlan },
            { id: 'acl',         cat: 'secpol', label: 'ACL',                    gen: () => typeof Arista !== 'undefined' && Arista.acl },
            { id: 'routemap',    cat: 'routing', label: 'Route-Map + Prefix-List', gen: () => typeof Arista !== 'undefined' && Arista.routemap },
            { id: 'qos',         cat: 'qos', label: 'QoS (Traffic-Policy)',   gen: () => typeof Arista !== 'undefined' && Arista.qos },
            { id: 'stp',         cat: 'l2', label: 'STP / MSTP',             gen: () => typeof Arista !== 'undefined' && Arista.stp },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                    gen: () => typeof Arista !== 'undefined' && Arista.bfd },
            { id: 'aaa',         cat: 'aaa', label: 'AAA / TACACS+',          gen: () => typeof Arista !== 'undefined' && Arista.aaa },
            { id: 'snmp',        cat: 'mgmt', label: 'SNMP',                   gen: () => typeof Arista !== 'undefined' && Arista.snmp },
            { id: 'mgmtacl',     cat: 'aaa', label: 'Management ACL',         gen: () => typeof Arista !== 'undefined' && Arista.mgmtacl },
            { id: 'ntp',         cat: 'mgmt', label: 'NTP',                    gen: () => typeof Arista !== 'undefined' && Arista.ntp },
            { id: 'logging',     cat: 'mgmt', label: 'Logging / Syslog',       gen: () => typeof Arista !== 'undefined' && Arista.logging },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof Arista !== 'undefined' && Arista.staticroute },
            { id: 'lldp', cat: 'l2', label: 'LLDP', gen: () => typeof Arista !== 'undefined' && Arista.lldp },
            { id: 'vrrp', cat: 'ha', label: 'VRRP / VARP', gen: () => typeof Arista !== 'undefined' && Arista.vrrp },
            { id: 'monitor', cat: 'mgmt', label: 'Port Mirroring (SPAN)', gen: () => typeof Arista !== 'undefined' && Arista.monitor },
            { id: 'sflow', cat: 'mgmt', label: 'sFlow', gen: () => typeof Arista !== 'undefined' && Arista.sflow },
            { id: 'vrf', cat: 'routing', label: 'VRF', gen: () => typeof Arista !== 'undefined' && Arista.vrf },
            { id: 'localuser', cat: 'aaa', label: 'Yerel Kullanıcı & Rol', gen: () => typeof Arista !== 'undefined' && Arista.localuser },
            { id: 'system', cat: 'base', label: 'Sistem (Hostname/DNS/Banner)', gen: () => typeof Arista !== 'undefined' && Arista.system },
            { id: 'sshharden', cat: 'mgmt', label: 'SSH Sıkılaştırma', gen: () => typeof Arista !== 'undefined' && Arista.sshharden },
            { id: 'eapi', cat: 'mgmt', label: 'Management API (eAPI)', gen: () => typeof Arista !== 'undefined' && Arista.eapi },
            { id: 'storm', cat: 'l2', label: 'Storm Control', gen: () => typeof Arista !== 'undefined' && Arista.storm },
            { id: 'igmpsnoop', cat: 'l2', label: 'IGMP Snooping', gen: () => typeof Arista !== 'undefined' && Arista.igmpsnoop },
            { id: 'eventhandler', cat: 'mgmt', label: 'Event Handler', gen: () => typeof Arista !== 'undefined' && Arista.eventhandler },
        ]
    },
    'mikrotik': {
        label: 'MikroTik RouterOS', icon: 'fas fa-route', color: '#293239',
        types: [
            { id: 'general',    cat: 'base', label: 'General',            gen: () => typeof MikroTik !== 'undefined' && MikroTik.general },
            { id: 'bridgevlan', cat: 'l2', label: 'Bridge + VLAN',      gen: () => typeof MikroTik !== 'undefined' && MikroTik.bridgevlan },
            { id: 'ipaddress',  cat: 'iface', label: 'IP Address + Route', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipaddress },
            { id: 'firewall',   cat: 'secpol', label: 'Firewall Filter',    gen: () => typeof MikroTik !== 'undefined' && MikroTik.firewall },
            { id: 'nat',        cat: 'secpol', label: 'NAT',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.nat },
            { id: 'dhcp',       cat: 'base', label: 'DHCP Server',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.dhcp },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec Site-to-Site', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ipsec },
            { id: 'wireguard',  cat: 'vpn', label: 'WireGuard',          gen: () => typeof MikroTik !== 'undefined' && MikroTik.wireguard },
            { id: 'ospf',       cat: 'routing', label: 'OSPF',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.ospf },
            { id: 'bgp',        cat: 'routing', label: 'BGP',                gen: () => typeof MikroTik !== 'undefined' && MikroTik.bgp },
            { id: 'queue',      cat: 'qos', label: 'Queue / HTB',        gen: () => typeof MikroTik !== 'undefined' && MikroTik.queue },
            { id: 'snmp',       cat: 'mgmt', label: 'SNMP',               gen: () => typeof MikroTik !== 'undefined' && MikroTik.snmp },
            { id: 'logging',    cat: 'mgmt', label: 'Logging / Syslog',   gen: () => typeof MikroTik !== 'undefined' && MikroTik.logging },
            { id: 'lb', cat: 'routing', label: 'Load Balancing (PCC / ECMP)', gen: () => typeof MikroTik !== 'undefined' && MikroTik.lb },
            { id: 'failover', cat: 'routing', label: 'WAN Failover', gen: () => typeof MikroTik !== 'undefined' && MikroTik.failover },
            { id: 'netwatch', cat: 'mgmt', label: 'Netwatch', gen: () => typeof MikroTik !== 'undefined' && MikroTik.netwatch },
            { id: 'hotspot', cat: 'aaa', label: 'HotSpot', gen: () => typeof MikroTik !== 'undefined' && MikroTik.hotspot },
            { id: 'pppoe', cat: 'vpn', label: 'PPPoE', gen: () => typeof MikroTik !== 'undefined' && MikroTik.pppoe },
            { id: 'ntp', cat: 'mgmt', label: 'NTP / Saat', gen: () => typeof MikroTik !== 'undefined' && MikroTik.ntp },
            { id: 'dns', cat: 'base', label: 'DNS', gen: () => typeof MikroTik !== 'undefined' && MikroTik.dns },
            { id: 'hardening', cat: 'aaa', label: 'Yönetim Sıkılaştırma', gen: () => typeof MikroTik !== 'undefined' && MikroTik.hardening },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof MikroTik !== 'undefined' && MikroTik.vrrp },
            { id: 'bonding', cat: 'l2', label: 'Bonding / LACP', gen: () => typeof MikroTik !== 'undefined' && MikroTik.bonding },
            { id: 'backup', cat: 'mgmt', label: 'Otomatik Yedek', gen: () => typeof MikroTik !== 'undefined' && MikroTik.backup },
        ]
    },
    'extreme': {
        label: 'Extreme Networks', icon: 'fas fa-project-diagram', color: '#582C83',
        types: [
            { id: 'general', cat: 'base', label: 'Genel', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.general },
            { id: 'vlan', cat: 'l2', label: 'VLAN', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.vlan },
            { id: 'ipIface', cat: 'iface', label: 'IP Arayüzü', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ipIface },
            { id: 'staticRoute', cat: 'routing', label: 'Statik Rota', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.staticRoute },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ospf },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.vrrp },
            { id: 'lag', cat: 'l2', label: 'Link Aggregation', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.lag },
            { id: 'stp', cat: 'l2', label: 'Spanning Tree', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.stp },
            { id: 'snmp', cat: 'mgmt', label: 'SNMPv3', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.snmp },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.syslog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP / SNTP', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.ntp },
            { id: 'accounts', cat: 'aaa', label: 'Kullanıcı Hesapları', gen: () => typeof ExtremeNet !== 'undefined' && ExtremeNet.accounts },
        ]
    },
    'cisco-asa': {
        label: 'Cisco ASA', icon: 'fas fa-fire-alt', color: '#CC0000',
        types: [
            { id: 'interface', cat: 'iface', label: 'Interface',  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.interface },
            { id: 'acl',       cat: 'secpol', label: 'ACL',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.acl },
            { id: 'nat',       cat: 'secpol', label: 'NAT',        gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.nat },
            { id: 'ospf',      cat: 'routing', label: 'OSPF',       gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ospf },
            { id: 'anyconnect',  cat: 'vpn', label: 'AnyConnect VPN', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.anyconnect },
            { id: 'objectgroup',      cat: 'secpol', label: 'Object Groups',      gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.objectgroup },
            { id: 'vpn',              cat: 'vpn', label: 'Site-to-Site VPN',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.vpn },
            { id: 'aaa',              cat: 'aaa', label: 'AAA',                  gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaa },
            { id: 'routeMap',         cat: 'routing', label: 'Static Route / PBR',            gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.routeMap },
            { id: 'mpfServicePolicy', cat: 'secpol', label: 'MPF Service Policy',   gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.mpfServicePolicy },
            { id: 'failoverHA',       cat: 'ha', label: 'Failover HA',          gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.failoverHA },
            { id: 'aaaRadius',        cat: 'aaa', label: 'AAA RADIUS Server',    gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.aaaRadius },
            { id: 'logging', cat: 'mgmt', label: 'Syslog / Logging', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.logging },
            { id: 'ntpClock', cat: 'mgmt', label: 'NTP / Saat', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.ntpClock },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.snmp },
            { id: 'mgmtAccess', cat: 'mgmt', label: 'Yönetim Erişimi (SSH/ASDM)', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.mgmtAccess },
            { id: 'localUsers', cat: 'aaa', label: 'Yerel Kullanıcılar / Privilege', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.localUsers },
            { id: 'routeTrack', cat: 'routing', label: 'Statik Rota + SLA Tracking', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.routeTrack },
            { id: 'twiceNat', cat: 'secpol', label: 'Twice NAT / Identity NAT', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.twiceNat },
            { id: 'threatDetection', cat: 'secpol', label: 'Threat Detection', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.threatDetection },
            { id: 'dhcpServer', cat: 'base', label: 'DHCP Sunucu / Relay', gen: () => typeof CiscoASA !== 'undefined' && CiscoASA.dhcpServer },
        ]
    },
    'fortigate': {
        label: 'FortiGate', icon: 'fas fa-shield-alt', color: '#EE3124',
        types: [
            { id: 'interface', cat: 'iface', label: 'Interface',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.interface },
            { id: 'address',   cat: 'secpol', label: 'Address Object',  gen: () => typeof FortiGate !== 'undefined' && FortiGate.address },
            { id: 'policy',    cat: 'secpol', label: 'Security Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.policy },
            { id: 'nat',       cat: 'secpol', label: 'NAT / VIP',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.nat },
            { id: 'centralsnat', cat: 'secpol', label: 'Central SNAT', gen: () => typeof FortiGate !== 'undefined' && FortiGate.centralsnat },
            { id: 'schedule',    cat: 'secpol', label: 'Zamanlama (Schedule)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.schedule },
            { id: 'ipsec',     cat: 'vpn', label: 'IPSec VPN',       gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipsec },
            { id: 'sslvpn',     cat: 'vpn', label: 'SSL-VPN',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.sslvpn },
            { id: 'ipsecdialup', cat: 'vpn', label: 'IPsec Dial-up (FortiClient)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipsecdialup },
            { id: 'secprofile', cat: 'utm', label: 'Security Profiles',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.secprofile },
            { id: 'sslinspect', cat: 'utm', label: 'SSL/SSH İnceleme Profili', gen: () => typeof FortiGate !== 'undefined' && FortiGate.sslinspect },
            { id: 'sdwan',      cat: 'routing', label: 'SD-WAN',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.sdwan },
            { id: 'ha',         cat: 'ha', label: 'HA Active-Passive',   gen: () => typeof FortiGate !== 'undefined' && FortiGate.ha },
            { id: 'vlanintf',   cat: 'iface', label: 'VLAN Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.vlanintf },
            { id: 'dhcp',       cat: 'base', label: 'DHCP Server',             gen: () => typeof FortiGate !== 'undefined' && FortiGate.dhcp },
            { id: 'ospf',       cat: 'routing', label: 'OSPF',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.ospf },
            { id: 'bgp',        cat: 'routing', label: 'BGP',                     gen: () => typeof FortiGate !== 'undefined' && FortiGate.bgp },
            { id: 'webfilter',  cat: 'utm', label: 'Web Filter Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.webfilter },
            { id: 'ips',        cat: 'utm', label: 'IPS Sensor',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.ips },
            { id: 'antivirus',  cat: 'utm', label: 'Anti-Virus Profile',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.antivirus },
            { id: 'appcontrol', cat: 'utm', label: 'Application Control',     gen: () => typeof FortiGate !== 'undefined' && FortiGate.appcontrol },
            { id: 'dnsfilter',  cat: 'utm', label: 'DNS Filter',              gen: () => typeof FortiGate !== 'undefined' && FortiGate.dnsfilter },
            { id: 'pbr',        cat: 'routing', label: 'Policy Route (PBR)',      gen: () => typeof FortiGate !== 'undefined' && FortiGate.pbr },
            { id: 'ipv6',       cat: 'iface', label: 'IPv6 Interface',          gen: () => typeof FortiGate !== 'undefined' && FortiGate.ipv6 },
            { id: 'vdom',       cat: 'base', label: 'VDOM',                    gen: () => typeof FortiGate !== 'undefined' && FortiGate.vdom },
            { id: 'haaa',       cat: 'ha', label: 'HA Active-Active',        gen: () => typeof FortiGate !== 'undefined' && FortiGate.haaa },
            { id: 'snmpv3',     cat: 'mgmt', label: 'SNMP v3',                 gen: () => typeof FortiGate !== 'undefined' && FortiGate.snmpv3 },
            { id: 'snmpv2c', cat: 'mgmt', label: 'SNMP v2c Community', gen: () => typeof FortiGate !== 'undefined' && FortiGate.snmpv2c },
            { id: 'fmgfaz', cat: 'mgmt', label: 'FortiManager + FortiAnalyzer', gen: () => typeof FortiGate !== 'undefined' && FortiGate.fmgfaz },
            { id: 'fswport',    cat: 'l2', label: 'FortiSwitch Port Profile', gen: () => typeof FortiGate !== 'undefined' && FortiGate.fswport },
            { id: 'static', cat: 'routing', label: 'Static Route', gen: () => typeof FortiGate !== 'undefined' && FortiGate.static },
            { id: 'service', cat: 'secpol', label: 'Service Object / Group', gen: () => typeof FortiGate !== 'undefined' && FortiGate.service },
            { id: 'addrgrp', cat: 'secpol', label: 'Address Group / Toplu Adres', gen: () => typeof FortiGate !== 'undefined' && FortiGate.addrgrp },
            { id: 'zone', cat: 'secpol', label: 'Zone', gen: () => typeof FortiGate !== 'undefined' && FortiGate.zone },
            { id: 'shaper', cat: 'qos', label: 'Traffic Shaping', gen: () => typeof FortiGate !== 'undefined' && FortiGate.shaper },
            { id: 'logging', cat: 'mgmt', label: 'Log (Syslog / FortiAnalyzer)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.logging },
            { id: 'ntp', cat: 'base', label: 'NTP', gen: () => typeof FortiGate !== 'undefined' && FortiGate.ntp },
            { id: 'dns', cat: 'base', label: 'DNS', gen: () => typeof FortiGate !== 'undefined' && FortiGate.dns },
            { id: 'admin', cat: 'aaa', label: 'Admin & Access Profile', gen: () => typeof FortiGate !== 'undefined' && FortiGate.admin },
            { id: 'user', cat: 'aaa', label: 'Local User & Group', gen: () => typeof FortiGate !== 'undefined' && FortiGate.user },
            { id: 'authserver', cat: 'aaa', label: 'RADIUS / LDAP Sunucusu', gen: () => typeof FortiGate !== 'undefined' && FortiGate.authserver },
            { id: 'dos', cat: 'secpol', label: 'DoS Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.dos },
            { id: 'localin', cat: 'secpol', label: 'Local-in Policy', gen: () => typeof FortiGate !== 'undefined' && FortiGate.localin },
            { id: 'automation', cat: 'mgmt', label: 'Automation Stitch (E-posta Uyarısı)', gen: () => typeof FortiGate !== 'undefined' && FortiGate.automation },
        ]
    },
    'paloalto': {
        label: 'Palo Alto', icon: 'fas fa-fire', color: '#FA582D',
        types: [
            { id: 'zone',    cat: 'secpol', label: 'Zone',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.zone },
            { id: 'address', cat: 'secpol', label: 'Address Object',  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.address },
            { id: 'policy',  cat: 'secpol', label: 'Security Policy', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.policy },
            { id: 'nat',     cat: 'secpol', label: 'NAT',             gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.nat },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec VPN',         gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ipsec },
            { id: 'threatprev', cat: 'utm', label: 'Threat Prevention', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.threatprev },
            { id: 'urlfilter',     cat: 'utm', label: 'URL Filtering',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.urlfilter },
            { id: 'globalprotect', cat: 'vpn', label: 'GlobalProtect VPN',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.globalprotect },
            { id: 'ha',            cat: 'ha', label: 'HA Active-Passive',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ha },
            { id: 'interface',      cat: 'iface', label: 'Interface (L3/VLAN)',      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.interface },
            { id: 'staticroute',    cat: 'routing', label: 'Virtual Router + Route',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.staticroute },
            { id: 'ospf',           cat: 'routing', label: 'OSPF',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.ospf },
            { id: 'bgp',            cat: 'routing', label: 'BGP',                      gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.bgp },
            { id: 'vlan',           cat: 'l2', label: 'VLAN',                     gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.vlan },
            { id: 'service',        cat: 'secpol', label: 'Service Object',            gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.service },
            { id: 'customapp',      cat: 'utm', label: 'Custom Application',       gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.customapp },
            { id: 'secprofilegroup',cat: 'utm', label: 'Security Profile Group',   gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.secprofilegroup },
            { id: 'decryption',     cat: 'utm', label: 'Decryption Policy',        gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.decryption },
            { id: 'dos',            cat: 'secpol', label: 'DoS Protection Policy',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.dos },
            { id: 'snmp',           cat: 'mgmt', label: 'SNMP v3',                  gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.snmp },
            { id: 'panorama',       cat: 'mgmt', label: 'Panorama Device Group',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.panorama },
            { id: 'sdwan',          cat: 'routing', label: 'SD-WAN Path Selection',    gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.sdwan },
            { id: 'addrgroup', cat: 'secpol', label: 'Address Group', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.addrgroup },
            { id: 'svcgroup', cat: 'secpol', label: 'Service Group', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.svcgroup },
            { id: 'logfwd', cat: 'mgmt', label: 'Log Forwarding + Syslog', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.logfwd },
            { id: 'devsetup', cat: 'base', label: 'Device Setup (DNS/NTP/Banner)', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.devsetup },
            { id: 'authprof', cat: 'aaa', label: 'LDAP/RADIUS + Auth Profile', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.authprof },
            { id: 'admin', cat: 'aaa', label: 'Administrator + Parola Politikası', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.admin },
            { id: 'tunnelmon', cat: 'vpn', label: 'Tunnel Monitor', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.tunnelmon },
            { id: 'zoneprot', cat: 'secpol', label: 'Zone Protection Profile', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.zoneprot },
            { id: 'appoverride', cat: 'secpol', label: 'Application Override', gen: () => typeof PaloAlto !== 'undefined' && PaloAlto.appoverride },
        ]
    },
    'checkpoint': {
        label: 'Check Point', icon: 'fas fa-shield-alt', color: '#CC3300',
        types: [
            { id: 'setup',        cat: 'base', label: 'Gaia Initial Setup',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.setup },
            { id: 'interface',    cat: 'iface', label: 'Interface / Bond',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.interface },
            { id: 'route',        cat: 'routing', label: 'Static Route',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.route },
            { id: 'ospf',         cat: 'routing', label: 'OSPF',                     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ospf },
            { id: 'policy',       cat: 'secpol', label: 'Security Rule (mgmt_cli)', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.policy },
            { id: 'nat',          cat: 'secpol', label: 'NAT Rule (mgmt_cli)',      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.nat },
            { id: 'bgp',          cat: 'routing', label: 'BGP',                      gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.bgp },
            { id: 'vlanintf',     cat: 'iface', label: 'VLAN Interface',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vlanintf },
            { id: 'hostobj',      cat: 'secpol', label: 'Host Object',              gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.hostobj },
            { id: 'netobj',       cat: 'secpol', label: 'Network Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.netobj },
            { id: 'serviceobj',   cat: 'secpol', label: 'Service Object',           gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.serviceobj },
            { id: 'clusterxl',    cat: 'ha', label: 'ClusterXL HA',             gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.clusterxl },
            { id: 'vsx',          cat: 'ha', label: 'VSX Virtual System',       gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.vsx },
            { id: 's2svpn',       cat: 'vpn', label: 'Site-to-Site VPN',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.s2svpn },
            { id: 'ravpn',        cat: 'vpn', label: 'Remote Access VPN',        gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.ravpn },
            { id: 'httpsinspect', cat: 'utm', label: 'HTTPS Inspection',         gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.httpsinspect },
            { id: 'logging',      cat: 'mgmt', label: 'Log Exporter (SIEM)',     gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.logging },
            { id: 'snmp',         cat: 'mgmt', label: 'SNMP v3',                  gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.snmp },
            { id: 'addrrange', cat: 'secpol', label: 'Address Range', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.addrrange },
            { id: 'netgroup', cat: 'secpol', label: 'Network Group', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.netgroup },
            { id: 'svcgroup', cat: 'secpol', label: 'Service Group', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.svcgroup },
            { id: 'timeobj', cat: 'secpol', label: 'Time Object', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.timeobj },
            { id: 'tpprofile', cat: 'utm', label: 'Threat Prevention (IPS / Anti-Bot / AV)', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.tpprofile },
            { id: 'gaiasys', cat: 'base', label: 'Gaia DNS / NTP / Banner', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiasys },
            { id: 'gaiasyslog', cat: 'mgmt', label: 'Gaia Remote Syslog', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiasyslog },
            { id: 'gaiauser', cat: 'aaa', label: 'Gaia Kullanıcı / Rol', gen: () => typeof CheckPoint !== 'undefined' && CheckPoint.gaiauser },
        ]
    },
    'f5-ltm': {
        label: 'F5 BIG-IP LTM', icon: 'fas fa-balance-scale', color: '#E4002B',
        types: [
            { id: 'vserver',     cat: 'adc', label: 'Virtual Server',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.vserver },
            { id: 'pool',        cat: 'adc', label: 'Pool + Members',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.pool },
            { id: 'monitor',     cat: 'adc', label: 'Health Monitor',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.monitor },
            { id: 'ssl',         cat: 'adc', label: 'SSL Client Profile',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.ssl },
            { id: 'irule',       cat: 'adc', label: 'iRule',                gen: () => typeof F5LTM !== 'undefined' && F5LTM.irule },
            { id: 'persistence', cat: 'adc', label: 'Persistence Profile',  gen: () => typeof F5LTM !== 'undefined' && F5LTM.persistence },
            { id: 'asm',         cat: 'adc', label: 'ASM WAF Policy',       gen: () => typeof F5LTM !== 'undefined' && F5LTM.asm },
            { id: 'awaf',        cat: 'adc', label: 'Advanced WAF (AWAF)',   gen: () => typeof F5LTM !== 'undefined' && F5LTM.awaf },
            { id: 'sslserver',   cat: 'adc', label: 'SSL Server Profile',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.sslserver },
            { id: 'snatpool',    cat: 'adc', label: 'SNAT Pool',              gen: () => typeof F5LTM !== 'undefined' && F5LTM.snatpool },
            { id: 'httpprofile', cat: 'adc', label: 'HTTP Profile',           gen: () => typeof F5LTM !== 'undefined' && F5LTM.httpprofile },
            { id: 'httpaudit', cat: 'adc', label: 'HTTP Profil Denetle',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.httpaudit },
            { id: 'wafjson', cat: 'adc', label: 'WAF Policy (JSON)',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.wafjson },
            { id: 'wafexception', cat: 'adc', label: 'WAF İstisnası',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.wafexception },
            { id: 'tcpprofile',  cat: 'adc', label: 'TCP Profile',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.tcpprofile },
            { id: 'routedomain', cat: 'routing', label: 'Route Domain (VRF)',     gen: () => typeof F5LTM !== 'undefined' && F5LTM.routedomain },
            { id: 'vlanself',    cat: 'iface', label: 'VLAN + Self IP',         gen: () => typeof F5LTM !== 'undefined' && F5LTM.vlanself },
            { id: 'trunk',       cat: 'l2', label: 'Trunk / LAG',            gen: () => typeof F5LTM !== 'undefined' && F5LTM.trunk },
            { id: 'gslb',        cat: 'adc', label: 'DNS / GSLB',             gen: () => typeof F5LTM !== 'undefined' && F5LTM.gslb },
            { id: 'ltmpolicy',   cat: 'adc', label: 'LTM Traffic Policy',    gen: () => typeof F5LTM !== 'undefined' && F5LTM.ltmpolicy },
            { id: 'apm',         cat: 'adc', label: 'APM Access Policy',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.apm },
            { id: 'asmtuning',   cat: 'adc', label: 'ASM Policy Tuning',      gen: () => typeof F5LTM !== 'undefined' && F5LTM.asmtuning },
            { id: 'iapp',        cat: 'adc', label: 'iApp Deployment',        gen: () => typeof F5LTM !== 'undefined' && F5LTM.iapp },
            { id: 'sysbase', cat: 'base', label: 'Sistem Temeli (NTP/DNS/Syslog)', gen: () => typeof F5LTM !== 'undefined' && F5LTM.sysbase },
            { id: 'mgmtaccess', cat: 'mgmt', label: 'Yönetim Erişimi (SSH/GUI)', gen: () => typeof F5LTM !== 'undefined' && F5LTM.mgmtaccess },
            { id: 'upgrade', cat: 'mgmt', label: 'Yedek ve Yükseltme Planı', gen: () => typeof F5LTM !== 'undefined' && F5LTM.upgrade },
            { id: 'conntable', cat: 'adc', label: 'Bağlantı / Kalıcılık Sorgusu', gen: () => typeof F5LTM !== 'undefined' && F5LTM.conntable },
            { id: 'drain', cat: 'adc', label: 'Pool Üyesi Bakım (Boşaltma)', gen: () => typeof F5LTM !== 'undefined' && F5LTM.drain },
            { id: 'tcpdump', cat: 'adc', label: 'Paket Yakalama (tcpdump)', gen: () => typeof F5LTM !== 'undefined' && F5LTM.tcpdump },
            { id: 'irulelib', cat: 'adc', label: 'iRule Kütüphanesi', gen: () => typeof F5LTM !== 'undefined' && F5LTM.irulelib },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof F5LTM !== 'undefined' && F5LTM.snmp },
            { id: 'authuser', cat: 'aaa', label: 'Yerel Kullanıcı & Rol', gen: () => typeof F5LTM !== 'undefined' && F5LTM.authuser },
            { id: 'remoteauth', cat: 'aaa', label: 'Uzak Kimlik Doğrulama', gen: () => typeof F5LTM !== 'undefined' && F5LTM.remoteauth },
            { id: 'selfport', cat: 'secpol', label: 'Self IP Port Kısıtlama', gen: () => typeof F5LTM !== 'undefined' && F5LTM.selfport },
            { id: 'route', cat: 'routing', label: 'Static Route', gen: () => typeof F5LTM !== 'undefined' && F5LTM.route },
            { id: 'devicetrust', cat: 'ha', label: 'HA — Device Trust + Config Sync', gen: () => typeof F5LTM !== 'undefined' && F5LTM.devicetrust },
            { id: 'sslharden', cat: 'adc', label: 'SSL Cipher Group Sıkılaştırma', gen: () => typeof F5LTM !== 'undefined' && F5LTM.sslharden },
            { id: 'vslimit', cat: 'adc', label: 'VS Bağlantı / Hız Limiti', gen: () => typeof F5LTM !== 'undefined' && F5LTM.vslimit },
            { id: 'datagroup', cat: 'adc', label: 'Data Group', gen: () => typeof F5LTM !== 'undefined' && F5LTM.datagroup },
            { id: 'hsl', cat: 'mgmt', label: 'Log Publisher / HSL', gen: () => typeof F5LTM !== 'undefined' && F5LTM.hsl },
        ]
    },
    'citrix-adc': {
        label: 'Citrix ADC', icon: 'fas fa-network-wired', color: '#007CC3',
        types: [
            { id: 'lbvserver',  cat: 'adc', label: 'LB vServer',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.lbvserver },
            { id: 'monitor',    cat: 'adc', label: 'Health Monitor',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.monitor },
            { id: 'ha',         cat: 'ha', label: 'HA Pair',              gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ha },
            { id: 'cs',         cat: 'adc', label: 'Content Switching',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cs },
            { id: 'responder',  cat: 'adc', label: 'Responder Policy',     gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.responder },
            { id: 'gslb',        cat: 'adc', label: 'GSLB',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.gslb },
            { id: 'sslvserver',  cat: 'adc', label: 'SSL Virtual Server',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslvserver },
            { id: 'rewrite',     cat: 'adc', label: 'Rewrite Policy/Action', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.rewrite },
            { id: 'ratelimit',   cat: 'adc', label: 'Rate Limiting',         gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.ratelimit },
            { id: 'aaa',         cat: 'aaa', label: 'AAA-TM',                gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.aaa },
            { id: 'cache',       cat: 'adc', label: 'Cache Policy',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.cache },
            { id: 'compression', cat: 'adc', label: 'Compression Policy',    gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.compression },
            { id: 'waf',         cat: 'adc', label: 'AppFirewall (WAF)',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.waf },
            { id: 'sslcert',     cat: 'adc', label: 'SSL Certificate',       gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslcert },
            { id: 'snip',        cat: 'iface', label: 'SNIP + IP Config',      gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.snip },
            { id: 'vlan',        cat: 'l2', label: 'VLAN',                  gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.vlan },
            { id: 'acl',         cat: 'secpol', label: 'ACL Extended',          gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.acl },
            { id: 'sysbase', cat: 'base', label: 'Sistem Temeli (NTP/DNS/Syslog)', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sysbase },
            { id: 'snmp', cat: 'mgmt', label: 'SNMP', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.snmp },
            { id: 'sysuser', cat: 'aaa', label: 'Sistem Kullanıcısı & Komut Politikası', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sysuser },
            { id: 'extauth', cat: 'aaa', label: 'Yönetim Kimlik Doğrulama (LDAP/RADIUS/TACACS+)', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.extauth },
            { id: 'route', cat: 'routing', label: 'Static Route', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.route },
            { id: 'sslprofile', cat: 'adc', label: 'SSL Profile (TLS1.2+)', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.sslprofile },
            { id: 'httpprofile', cat: 'adc', label: 'HTTP Profile', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.httpprofile },
            { id: 'surge', cat: 'adc', label: 'Surge Protection / Bağlantı Limiti', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.surge },
            { id: 'patset', cat: 'adc', label: 'Pattern Set / String Map', gen: () => typeof CitrixADC !== 'undefined' && CitrixADC.patset },
        ]
    },
    'huawei-usg': {
        label: 'Huawei USG', icon: 'fas fa-fire-alt', color: '#CF0A2C',
        types: [
            { id: 'zone',       cat: 'secpol', label: 'Security Zone',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.zone },
            { id: 'policy',     cat: 'secpol', label: 'Security Policy',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.policy },
            { id: 'nat',        cat: 'secpol', label: 'NAT',                   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.nat },
            { id: 'interface',  cat: 'iface', label: 'Interface + Zone',      gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.interface },
            { id: 'ipsec',      cat: 'vpn', label: 'IPSec VPN IKEv2',       gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ipsec },
            { id: 'sslvpn',     cat: 'vpn', label: 'SSL VPN',               gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.sslvpn },
            { id: 'antivirus',  cat: 'utm', label: 'Anti-Virus Profile',    gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.antivirus },
            { id: 'ips',        cat: 'utm', label: 'IPS Profile',           gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ips },
            { id: 'urlfilter',  cat: 'utm', label: 'URL Filtering',         gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.urlfilter },
            { id: 'appcontrol', cat: 'utm', label: 'Application Control',   gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.appcontrol },
            { id: 'ha',         cat: 'ha', label: 'HA Dual-System',        gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ha },
            { id: 'dnsproxy',   cat: 'base', label: 'DNS Transparent Proxy', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.dnsproxy },
            { id: 'objects', cat: 'secpol', label: 'Adres / Servis Nesnesi', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.objects },
            { id: 'staticroute', cat: 'routing', label: 'Statik Rota', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.staticroute },
            { id: 'ospf', cat: 'routing', label: 'OSPF', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ospf },
            { id: 'vrrp', cat: 'ha', label: 'VRRP + HRP', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.vrrp },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.syslog },
            { id: 'ntp', cat: 'mgmt', label: 'NTP', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.ntp },
            { id: 'admin', cat: 'aaa', label: 'Yönetici / SSH', gen: () => typeof HuaweiUSG !== 'undefined' && HuaweiUSG.admin },
        ]
    },
    'huawei-ce': {
        label: 'Huawei CloudEngine', icon: 'fas fa-cloud', color: '#A50034',
        types: [
            { id: 'vlan',        cat: 'l2', label: 'VLAN + Interface',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vlan },
            { id: 'ospf',        cat: 'routing', label: 'OSPF',                 gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.ospf },
            { id: 'bgp',         cat: 'routing', label: 'BGP',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bgp },
            { id: 'vxlan',       cat: 'overlay', label: 'VXLAN / EVPN',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vxlan },
            { id: 'lacp',        cat: 'l2', label: 'LACP / Eth-Trunk',     gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.lacp },
            { id: 'mlag',        cat: 'ha', label: 'M-LAG',                gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.mlag },
            { id: 'bfd',         cat: 'routing', label: 'BFD',                  gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.bfd },
            { id: 'qos',         cat: 'qos', label: 'QoS MQC / DiffServ',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.qos },
            { id: 'snmpntp',     cat: 'mgmt', label: 'SNMP + NTP',           gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.snmpntp },
            { id: 'evpnsymirb',  cat: 'overlay', label: 'EVPN Symmetric IRB',   gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.evpnsymirb },
            { id: 'routepolicy', cat: 'routing', label: 'Route Policy',         gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.routepolicy },
            { id: 'staticroute', cat: 'routing', label: 'Static Route', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.staticroute },
            { id: 'syslog', cat: 'mgmt', label: 'Syslog (info-center)', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.syslog },
            { id: 'lldp', cat: 'mgmt', label: 'LLDP', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.lldp },
            { id: 'vrrp', cat: 'ha', label: 'VRRP', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.vrrp },
            { id: 'localuser', cat: 'aaa', label: 'Local User + SSH', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.localuser },
            { id: 'acl', cat: 'secpol', label: 'ACL', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.acl },
            { id: 'stp', cat: 'l2', label: 'STP / Edge Port', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.stp },
            { id: 'interface', cat: 'iface', label: 'Interface (L2/L3)', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.interface },
            { id: 'mirror', cat: 'mgmt', label: 'Port Mirroring', gen: () => typeof HuaweiCE !== 'undefined' && HuaweiCE.mirror },
        ]
    },
    'referans': {
        label: 'Referans & Topoloji', icon: 'fas fa-book-open', color: '#6366F1',
        types: [
            { id: 'bgp',      cat: 'ref', label: 'BGP Topoloji',              gen: () => typeof CgReference !== 'undefined' && CgReference.bgp },
            { id: 'ospf',     cat: 'ref', label: 'OSPF Alan Mimarisi',        gen: () => typeof CgReference !== 'undefined' && CgReference.ospf },
            { id: 'mpls_vpn', cat: 'ref', label: 'MPLS L3VPN Mimarisi',       gen: () => typeof CgReference !== 'undefined' && CgReference.mpls_vpn },
            { id: 'ha',       cat: 'ref', label: 'Yüksek Erişilebilirlik',    gen: () => typeof CgReference !== 'undefined' && CgReference.ha },
            { id: 'nat',      cat: 'ref', label: 'NAT Tipleri',                gen: () => typeof CgReference !== 'undefined' && CgReference.nat },
            { id: 'ipsec',    cat: 'ref', label: 'IPsec VPN Modları',          gen: () => typeof CgReference !== 'undefined' && CgReference.ipsec },
            { id: 'vxlan',    cat: 'ref', label: 'VXLAN / EVPN',               gen: () => typeof CgReference !== 'undefined' && CgReference.vxlan },
            { id: 'lb',       cat: 'ref', label: 'Load Balancer Mimarisi',     gen: () => typeof CgReference !== 'undefined' && CgReference.lb },
            { id: 'certmap',  cat: 'ref', label: 'Sertifikasyon Haritası',     gen: () => typeof CgReference !== 'undefined' && CgReference.certmap },
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
    logging:         'fas fa-file-alt',
    ntp:             'fas fa-clock',
    lldp:            'fas fa-project-diagram',
    hardening:       'fas fa-user-shield',
    vtp:             'fas fa-share-alt',
    archive:         'fas fa-archive',
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
    _query:  '',
    _filter: 'all',

    // ── Başlatma + hash yönlendirme ──────────────────────────────────────
    init() {
        const root = document.getElementById('config-generator-root');
        if (!root) return;
        this._root = root;
        const shell = typeof CgShell !== 'undefined' ? CgShell : null;
        if (shell) shell.init();
        window.addEventListener('hashchange', () => { this._route(); if (shell) { shell.closeDrawer(true); shell.update(); } });
        this._route();
        if (shell) shell.update();
    },

    _route() {
        const t = document.getElementById('cg-toast'); if (t) t.hidden = true;
        // go() ile listeden hemen bu rotaya gelindiyse kaynak liste; başka her rotada sıfırlanır (bayat history.back olmasın)
        this._goArr = this._goFrom || null; this._goFrom = null;
        let full = location.hash || '';
        // #/V/Cisco/ → #/v/cisco (yalnız vendor rotaları; sorgu kısmı korunur)
        const nv = full.match(/^#\/v(\/[^?]*)?(\?.*)?$/i);
        if (nv) { const fix = '#/v' + (nv[1] || '').toLowerCase().replace(/\/+$/, '') + (nv[2] || ''); if (fix !== full) { history.replaceState(null, '', fix); full = fix; } }
        const qi = full.indexOf('?'), h = qi < 0 ? full : full.slice(0, qi);
        const P = new URLSearchParams(qi < 0 ? '' : full.slice(qi + 1));
        // Arena aile bölümü: #/v/<aile>/arena[/<mod>/<görev>] (aile CG_FAMILIES'te arena alanıyla açılır)
        const fa = h.match(/^#\/v\/([a-z0-9-]+)\/arena(?:\/(masa|meydan|waf|nobet)\/([a-z0-9-]+))?$/);
        if (fa) {
            const f = typeof CG_FAMILY_BY_SLUG !== 'undefined' && CG_FAMILY_BY_SLUG[fa[1]];
            if (!f || !f.arena) { history.replaceState(null, '', '#/v' + (f ? '/' + f.slug : '')); this._route(); this._toast((f ? f.name + ' için' : 'Bu adreste') + ' arena yok.'); return; }
            this._renderArena(fa[2], fa[3], f); return;
        }
        // Eski #/arena… adresleri (paylaşılmış bağlantılar) aile bağlamına yönlenir: #/v/f5/arena…
        const oa = h.match(/^#\/arena(\/(?:masa|meydan|waf|nobet)\/[a-z0-9-]+)?$/);
        if (oa && typeof cgArenaFamily === 'function' && cgArenaFamily()) { history.replaceState(null, '', '#/v/' + cgArenaFamily().slug + '/arena' + (oa[1] || '')); this._route(); return; }
        // Vendor rotaları en başta: #/v/<aile>/… (aile adları kayıt kimlikleriyle çakıştığı için önekli)
        const vr = h.match(/^#\/v(?:\/([a-z0-9-]+))?(?:\/([a-z]+))?(?:\/([a-z0-9-]+))?$/);
        if (vr) { this._routeFamily(vr[1], vr[2], vr[3], P); return; }
        if (h === '#/araclar') { this._renderHome({ fam: null, p: P.get('p'), k: P.get('k'), q: P.get('q') }); return; }
        const cli = h.match(/^#\/cli(?:\/([a-z0-9-]+))?$/);
        // #/cli/<k> (eski adres): vendoru belli → aile bağlamında (sol menü, yalnız ailenin kütüphaneleri); #/cli çapraz görünüm
        if (cli) { const cf = cli[1] && typeof cgFamilyOf === 'function' ? cgFamilyOf(cli[1]) : null; this._renderCli(cli[1], cf && cf.cli.includes(cli[1]) ? cf : undefined); return; }
        const lp = h.match(/^#\/lab\/path\/([a-z0-9-]+)$/);
        if (lp) { this._renderLab(null, lp[1]); return; }
        const lab = h.match(/^#\/lab(?:\/([a-z0-9-]+))?$/);
        if (lab) { this._renderLab(lab[1], null, P.get('v')); return; }
        const ar = h.match(/^#\/arena(?:\/(masa|meydan|waf|nobet)\/([a-z0-9-]+))?$/);
        if (ar) { this._renderArena(ar[1], ar[2]); return; }
        const ts = h.match(/^#\/troubleshoot(?:\/([a-z0-9-]+))?(?:\/(\d+))?$/);
        if (ts) { this._renderTs(ts[1], ts[2]); return; }
        // İçerik sayfaları (S11b): #/rehber, #/blog[/<slug>], #/iletisim
        const pg = h.match(/^#\/(rehber|iletisim|blog)(?:\/([a-z0-9-]+))?$/);
        if (pg && typeof CgPages !== 'undefined' && (pg[1] === 'blog' || !pg[2])) { this._renderPage(pg[1], pg[2]); return; }
        const m = h.match(/^#\/([^/]+)\/([^/]+)$/);
        if (m && CG_REGISTRY[m[1]]) this._renderWork(m[1], m[2]);
        else if (h === '#/converter') this._renderConverter();
        else if (h === '' || h === '#' || h === '#/') {   // ana sayfa: tanıtım (A7); yoksa vendor kartları, o da yoksa araç ızgarası
            if (typeof CgLanding !== 'undefined') this._renderLanding();
            else if (typeof CgHub !== 'undefined') this._renderVendorHub(null);
            else this._renderHome({ fam: null });
        }
        else this._renderHome({ fam: null });
    },

    // #/v → tüm araçlar (vendor kartları A4'te); #/v/<aile>[/bölüm]. Bilinmeyen aile/bölüm → #/v
    _routeFamily(slug, sec, sub, P) {
        // Yönlendirme; note verilirse kullanıcıya kısa bilgi şeridi gösterilir (sessiz yönlendirme yok)
        const redirect = (hash, note) => { history.replaceState(null, '', hash); this._route(); if (note) this._toast(note); };
        const qs = P.toString() ? '?' + P.toString() : '';
        // #/v → vendor kartları; #/v/<aile> → vendor hub; sorgulu eski bağlantılar (?p=&k=&q=) araç ızgarasına
        if (!slug) {
            if (qs || typeof CgHub === 'undefined') { redirect('#/araclar' + qs); return; }
            this._renderVendorHub(null);
            return;
        }
        const f = typeof CG_FAMILY_BY_SLUG !== 'undefined' && CG_FAMILY_BY_SLUG[slug];
        if (!f) { redirect('#/v', '“' + slug + '” adlı bir vendor ailesi yok; vendorlar gösteriliyor.'); return; }
        if (!sec) {
            if (qs || typeof CgHub === 'undefined') { redirect('#/v/' + slug + '/araclar' + qs); return; }
            this._renderVendorHub(slug);
            return;
        }
        if (sec === 'araclar') {
            if (sub) { redirect('#/v/' + slug + '/araclar'); return; }
            this._renderHome({ fam: slug, p: P.get('p'), k: P.get('k'), q: P.get('q') });
            return;
        }
        if (sec === 'lab' && !sub) {
            if (!f.lab.length) { redirect('#/v/' + slug + '/araclar', f.name + ' için henüz CLI lab yok; ' + f.name + ' araçları gösteriliyor.'); return; }
            this._renderLab(null, null, f.lab.includes(P.get('v')) ? P.get('v') : f.lab[0], f);   // ?v=: ailede birden çok lab vendoru (7.4 / 7.6)   // vendor kilitli katalog (adres #/v/<aile>/lab kalır, ağaç görünür)
            return;
        }
        if (sec === 'yol' && !sub) {
            if (!f.lab.length || typeof CgLab === 'undefined' || typeof CgCli === 'undefined') { redirect('#/v/' + slug + '/araclar', f.name + ' için henüz öğrenme yolu yok; ' + f.name + ' araçları gösteriliyor.'); return; }
            const want = location.hash;
            this._setNav('vendors');
            this._root.innerHTML = '<div class="cg-empty"><i class="fas fa-spinner fa-spin"></i><p>Öğrenme yolu yükleniyor…</p></div>';
            CgLab._loadAll().then(() => {
                if (location.hash !== want) return;   // bu arada başka yere gidildi
                const p = CgLab._paths().find(x => f.lab.includes(x.vendor));
                if (p) redirect('#/lab/path/' + p.id); else redirect('#/lab?v=' + f.lab[0], f.name + ' için henüz öğrenme yolu yok; lablar gösteriliyor.');
            }, () => redirect('#/lab?v=' + f.lab[0]));
            return;
        }
        if (sec === 'komutlar') {
            if (sub && !f.cli.includes(sub)) { redirect('#/v/' + slug + '/komutlar', '“' + sub + '” ' + f.name + ' komut kütüphanelerinden biri değil.'); return; }
            this._renderCli(sub || f.cli[0], f);
            return;
        }
        if (sec === 'sorun' && !sub) { this._renderTs(null, P.get('k'), f); return; }
        redirect('#/v/' + slug + '/araclar', 'Bu bölüm ' + f.name + ' için yok; ' + f.name + ' araçları gösteriliyor.');
    },

    // Kısa bilgi şeridi (role=status, 5 sn)
    _toast(msg) {
        let el = document.getElementById('cg-toast');
        if (!el) { el = document.createElement('div'); el.id = 'cg-toast'; el.className = 'cg-toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
        el.textContent = msg; el.hidden = false;
        clearTimeout(this._toastT); this._toastT = setTimeout(() => { el.hidden = true; }, 5000);
    },

    // Listeden araca: dönüşte (Esc / ← Tüm araçlar) yeni geçmiş kaydı eklemek yerine history.back() kullanılabilsin
    go(vendorId, typeId) { this._goFrom = location.hash; location.hash = '#/' + vendorId + '/' + typeId; },
    // Üst çubuktaki "Araçlar": süzgeçsiz tüm araçlar (bellekteki süzgeç ve aile kilidi taşınmaz)
    goHome() {
        this._filter = 'all'; this._cat = 'all'; this._query = ''; this._fam = null;
        if (location.hash === '#/araclar') this._route(); else location.hash = '#/araclar';
    },
    // Araç sayfasından geri: son liste görünümü (aile kilidi, süzgeç ve arama korunur)
    backToList() {
        let h = this._lastList || '#/araclar';
        // Son liste başka bir aileye/platforma aitse o aileye değil, bu aracın ailesine dön
        const f = this._vendor && typeof cgFamilyOf === 'function' ? cgFamilyOf(this._vendor) : null;
        const lf = h.match(/^#\/v\/([a-z0-9-]+)/), lp = (h.split('?')[1] || '').match(/(?:^|&)p=([a-z0-9-]+)/);
        if ((lf && (!f || lf[1] !== f.slug)) || (lp && lp[1] !== this._vendor)) h = f ? '#/v/' + f.slug + '/araclar' : '#/araclar';
        // Araca bu listeden gelindiyse geri git (Geri tuşu tekrar araca götürmesin); yoksa listeye yeni kayıt
        const from = this._goArr, at = '#/' + this._vendor + '/' + this._type; this._goArr = null;
        if (from && from === h && location.hash === at && history.length > 1) { history.back(); return; }
        if (location.hash === h) this._route(); else location.hash = h;
    },

    // ── Üst çubuktaki aktif sekmeyi işaretle ────────────────────────────
    // title verilirse sekme eşlemesi yerine o başlık yazılır (aile sayfaları: Vendorlar sekmesi + "<Aile> lablar")
    // Üst menü (S11a): Ana Sayfa · Platform (· Rehber · Blog · İletişim). Ürün bölümleri (vendors/tools/cli/lab/arena/ts/conv) Platform altında.
    _setNav(which, title) {
        const top = which === 'home' ? 'home' : ['conv', 'rehber', 'blog', 'iletisim'].includes(which) ? which : which ? 'platform' : null;
        document.querySelectorAll('.app-nav-tab').forEach(b => {
            const on = b.dataset.nav === top;
            b.classList.toggle('active', on);
            if (on && b.tagName === 'A') b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
        if (typeof CgShell !== 'undefined') CgShell._nav = which;   // çekmece ve Platform menüsü geçerli bölümü işaretler
        const T = { home: '', vendors: 'Vendorlar', tools: 'Config araçları', cli: 'Komut kütüphanesi', lab: 'CLI Laboratuvarı', arena: 'iRule Arenası', ts: 'Sorun giderme', conv: 'Dönüştürücü', rehber: 'Rehber', blog: 'Blog', iletisim: 'İletişim' };
        document.title = (title || T[which] ? (title || T[which]) + ' · ' : '') + 'Config Generator';
    },

    // ── ANA SAYFA: aranabilir araç ızgarası ──────────────────────────────
    // o: { fam, p, k, q } rotadan gelir (#/araclar, #/v/<aile>); URL durumu yetkilidir. Düz ana sayfada bellekteki süzgeç korunur.
    _renderHome(o) {
        this._vendor = this._type = null;
        o = o || {};
        const fam = o.fam && typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[o.fam] : null;
        const url = 'p' in o || !!fam;   // #/araclar ve #/v/…: URL tek kaynak; düz ana sayfa: bellek
        if (!url && this._fam) { this._filter = 'all'; this._cat = 'all'; this._query = ''; }   // aile kilidinden çıkış
        this._fam = fam ? fam.slug : null;
        const ids = this._regIds();
        if (url) { this._filter = o.p && ids.includes(o.p) ? o.p : 'all'; this._cat = o.k || 'all'; this._query = o.q || ''; }
        else if (this._filter !== 'all' && !ids.includes(this._filter)) this._filter = 'all';
        // Kategori seçili platform(lar)da yoksa düşer (ör. #/v/fortinet/araclar?k=mpls)
        if (this._cat !== 'all' && !(CG_CAT_BY_ID[this._cat] && this._regEntries().some(([vid, v]) => (this._filter === 'all' || this._filter === vid) && v.types.some(t => t.cat === this._cat)))) this._cat = 'all';

        // Tüm vendorlar: platformlar aile sırasıyla (Cisco IOS, NX-OS, ASA, FTD yan yana); aile içinde kayıt sırası
        const famIx = id => { const i = typeof CG_FAMILIES !== 'undefined' ? CG_FAMILIES.findIndex(f => f.reg.includes(id)) : -1; return i < 0 ? 99 : i; };
        const segIds = fam ? ids : ids.map((id, i) => [id, i]).sort((a, b) => famIx(a[0]) - famIx(b[0]) || a[1] - b[1]).map(x => x[0]);
        const chips = ['all', ...segIds].map(id => {
            const v = CG_REGISTRY[id];
            const lbl = id === 'all' ? 'Tümü' : v.label;
            const n   = id === 'all' ? this._totalTools(ids) : v.types.length;
            const mark = id === 'all' || fam ? '' : cgBrandMark(id, 14);   // aile içinde logo tekrarı yok (Tema 1 segment)
            return `<button class="cg-chip${this._filter === id ? ' active' : ''}" data-f="${id}" aria-pressed="${this._filter === id}"
                        onclick="ConfigGenerator._setFilter('${id}')" title="${cgEsc(lbl)}">
                        ${mark}<span class="cg-chip-l">${cgEsc(fam && id !== 'all' ? this._short(id, fam) : lbl)}</span><span class="cg-chip-n">${n}</span>
                    </button>`;
        }).join('');

        this._setNav(fam ? 'vendors' : 'tools');   // aile sayfaları (#/v/<aile>/…) Vendorlar sekmesi altında
        document.title = (fam ? fam.name + ' araçları' : 'Tüm araçlar') + ' · Config Generator';
        const ph = fam ? fam.name + ' araçlarında ara: ' + (fam.slug === 'f5' ? 'pool, monitor, irule…' : 'vlan, nat, bgp…') : 'Araç ara: vlan, ipsec, bgp, nat, interface…';
        const nCat = new Set([].concat(...this._regEntries().map(([, v]) => v.types.map(t => t.cat)))).size;
        this._root.innerHTML = `
        <div class="cg-home cg-tools">
            <header class="cg-tools-hd">
                <h1>${fam ? cgEsc(fam.name) + ' config araçları' : 'Tüm config araçları'}</h1>
                <p class="cg-tools-lead"><strong>${this._totalTools(ids)}</strong> araç · <strong>${nCat}</strong> kategori · <strong>${ids.length}</strong> platform. ${ids.length > 1 ? 'Platform seçin ya da süzün; araç' : 'Araç'} açılınca form ve canlı çıktı yan yana gelir. Tamamı tarayıcıda çalışır.</p>
                ${fam ? `<p class="cg-famlock"><span>Yalnız <b>${cgEsc(fam.name)}</b> araçları</span>
                    <a class="cg-famlock-x" href="#/araclar" onclick="ConfigGenerator.goHome();return false">Tüm vendorların araçları <i class="fas fa-arrow-right" aria-hidden="true"></i></a></p>` : ''}
            </header>
            <div class="cg-tools-bar">
                <div class="cg-chips cg-seg${fam ? '' : ' cg-seg-many'}" id="cg-chips" role="group" aria-label="Platform süzgeci"${ids.length < 2 ? ' hidden' : ''}>${chips}</div>
                <div class="cg-home-search">
                    <i class="fas fa-search" aria-hidden="true"></i>
                    <input type="text" id="cg-home-q" placeholder="${cgEsc(ph)}" aria-label="${fam ? cgEsc(fam.name) + ' araçlarında ara' : 'Araç ara'}"
                           autocomplete="off" value="${cgEsc(this._query)}"
                           oninput="ConfigGenerator._setQuery(this.value)"
                           onkeydown="if(event.key==='Escape'&&this.value){event.preventDefault();this.value='';ConfigGenerator._setQuery('');}">
                    <kbd aria-hidden="true">/</kbd>
                </div>
            </div>
            <div class="cg-chips cg-cat-chips" id="cg-cat-chips" role="group" aria-label="Kategori süzgeci">${this._catChips()}</div>
            <p class="cg-tools-count" id="cg-home-live" aria-live="polite"></p>
            <div id="cg-home-grid"></div>
        </div>`;

        this._renderGrid();
        if (url) this._syncUrl();
        this._lastList = location.hash || '#/araclar';
        const q = document.getElementById('cg-home-q');
        // Dokunmatik ekranda otomatik odak klavyeyi açar; yalnız fare/izleme dörtgeninde
        if (q && window.matchMedia && matchMedia('(pointer: fine)').matches) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
        this._bindSlash();
    },

    // Secili vendor filtresine gore kategori cipleri (arac sayisiyla); bos kategori cikmaz.
    _catChips() {
        const cnt = {};
        for (const [vid, v] of this._regEntries()) {
            if (this._filter !== 'all' && this._filter !== vid) continue;
            v.types.forEach(t => { cnt[t.cat] = (cnt[t.cat] || 0) + 1; });
        }
        const cur = this._cat || 'all';
        const total = Object.values(cnt).reduce((a, b) => a + b, 0);
        return [`<button class="cg-chip cg-cat-chip${cur === 'all' ? ' active' : ''}" aria-pressed="${cur === 'all'}" onclick="ConfigGenerator._setCat('all')">
                    <i class="fas fa-th"></i><span class="cg-chip-l">Tüm kategoriler</span><span class="cg-chip-n">${total}</span></button>`]
            .concat(CG_CATEGORIES.filter(c => cnt[c.id]).map(c =>
                `<button class="cg-chip cg-cat-chip${cur === c.id ? ' active' : ''}" aria-pressed="${cur === c.id}" onclick="ConfigGenerator._setCat('${c.id}')">
                    <i class="${c.icon}"></i><span class="cg-chip-l">${cgEsc(c.label)}</span><span class="cg-chip-n">${cnt[c.id]}</span></button>`))
            .join('');
    },

    _setCat(id) {
        this._cat = id;
        const host = document.getElementById('cg-cat-chips');
        if (host) host.innerHTML = this._catChips();
        this._renderGrid();
        this._syncUrl();
    },

    // Aile kilidi varsa yalnız o ailenin kayıtları (kayıt sırasıyla)
    _regIds() {
        const f = this._fam && typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[this._fam] : null;
        return Object.keys(CG_REGISTRY).filter(id => !f || f.reg.includes(id));
    },
    _regEntries() { return this._regIds().map(id => [id, CG_REGISTRY[id]]); },

    _totalTools(ids) {
        return (ids || Object.keys(CG_REGISTRY)).reduce((a, id) => a + CG_REGISTRY[id].types.length, 0);
    },

    // Süzgeç durumunu hash'e yaz (replaceState: geri tuşu yığını şişmez, hashchange tetiklenmez)
    _syncUrl() {
        const h = location.hash || '', path = h.split('?')[0];
        const onTools = path === '#/araclar' || /^#\/v(\/[a-z0-9-]+(\/araclar)?)?$/.test(path);
        const P = new URLSearchParams();
        if (this._filter && this._filter !== 'all') P.set('p', this._filter);
        if (this._cat && this._cat !== 'all') P.set('k', this._cat);
        if ((this._query || '').trim()) P.set('q', this._query.trim());
        const qs = P.toString();
        if (!onTools && !qs) return;
        const base = onTools ? path : '#/araclar';
        const next = base + (qs ? '?' + qs : '');
        if (next !== h) history.replaceState(null, '', next);
        this._lastList = next;
        if (typeof CgShell !== 'undefined') CgShell.update();
    },

    _setFilter(id) {
        this._filter = id;
        document.querySelectorAll('#cg-chips .cg-chip').forEach(c => { c.classList.toggle('active', c.dataset.f === id); c.setAttribute('aria-pressed', c.dataset.f === id); });
        // Vendor degisince o vendor'da olmayan kategori secili kalmasin
        const has = this._regEntries().some(([vid, v]) => (id === 'all' || id === vid) && v.types.some(t => t.cat === this._cat));
        if (this._cat && this._cat !== 'all' && !has) this._cat = 'all';
        const host = document.getElementById('cg-cat-chips');
        if (host) host.innerHTML = this._catChips();
        this._renderGrid();
        this._syncUrl();
    },

    _setQuery(q) { this._query = q; this._renderGrid(); this._syncUrl(); },

    _bindSlash() {
        if (this._slashBound) return;
        this._slashBound = true;
        document.addEventListener('keydown', e => {
            if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) {
                const el = document.getElementById('cg-home-q');
                if (el) { e.preventDefault(); el.focus(); el.select(); }
            }
            // Esc yalnız araç çalışma sayfasında listeye döner; form alanında, lab terminalinde ve diğer bölümlerde gezinmez
            if (e.key === 'Escape' && this._type && !document.body.classList.contains('cg-drawer-open') && location.hash === '#/' + this._vendor + '/' + this._type && !e.target.closest?.('input,textarea,select,[contenteditable]')) this.backToList();
        });
    },

    _renderGrid() {
        const host = document.getElementById('cg-home-grid');
        if (!host) return;
        const term = (this._query || '').trim().toLowerCase();
        let html = '', hits = 0;
        const fam = this._fam && typeof CG_FAMILY_BY_SLUG !== 'undefined' ? CG_FAMILY_BY_SLUG[this._fam] : null;
        const cat = this._cat && this._cat !== 'all' ? this._cat : null;
        // Eşleşen araçlar: [vid, v, t]
        const rows = [];
        for (const [vid, v] of this._regEntries()) {
            if (this._filter !== 'all' && this._filter !== vid) continue;
            v.types.forEach(t => {
                if (cat && t.cat !== cat) return;
                if (term) { const cl = (CG_CAT_BY_ID[t.cat] || {}).label || ''; if (!(t.label + ' ' + t.id + ' ' + v.label + ' ' + cl).toLowerCase().includes(term)) return; }
                rows.push([vid, v, t]);
            });
        }
        hits = rows.length;
        const row = ([vid, v, t], tag, plat) => {
            const g = t.gen(), stub = !g || typeof g.init !== 'function';
            const icon = CG_TYPE_ICONS[t.id] || 'fas fa-code';
            return `<li><button class="cg-card cg-tool${stub ? ' is-stub' : ''}"
                ${stub ? 'disabled title="Yakında eklenecek"' : `onclick="ConfigGenerator.go('${vid}','${t.id}')"`}>
                <i class="${icon}" aria-hidden="true"></i>
                <span class="cg-card-t">${cgEsc(t.label).replace(/\//g, '/<wbr>')}</span>
                ${stub ? '<span class="cg-card-soon">yakında</span>' : tag ? `<span class="cg-tool-tag${plat ? ' is-plat' : ''}">${cgEsc(tag)}</span>` : ''}
            </button></li>`;
        };
        const sec = (id, head, n, list) => `<section class="cg-tsec" aria-labelledby="cg-tsec-${id}">
                <h2 id="cg-tsec-${id}">${head}<span class="cg-tsec-n">${n}</span></h2>
                <ul class="cg-tlist">${list}</ul></section>`;
        const plats = new Set(rows.map(r => r[0]));
        if (fam || this._filter !== 'all') {
            // Tek aile / tek platform: kategoriye göre (Tema 1 içerik düzeni); birden çok platform varsa satırda kısa platform etiketi
            html = CG_CATEGORIES.filter(c => rows.some(r => r[2].cat === c.id)).map(c => {
                const rs = rows.filter(r => r[2].cat === c.id);
                return sec(c.id, `<i class="${c.icon}" aria-hidden="true"></i>${cgEsc(c.label)}`, rs.length, rs.map(r => row(r, plats.size > 1 ? this._short(r[0], fam) : '', true)).join(''));
            }).join('');
        } else {
            // Tüm vendorlar: platforma göre; satırda kategori etiketi
            html = [...plats].map(vid => {
                const rs = rows.filter(r => r[0] === vid), v = CG_REGISTRY[vid];
                return sec(vid, `${cgBrandMark(vid, 17)}<span lang="en">${cgEsc(v.label)}</span>`, rs.length, rs.map(r => row(r, cat ? '' : (CG_CAT_BY_ID[r[2].cat] || {}).label || '')).join(''));
            }).join('');
        }

        const live = document.getElementById('cg-home-live');
        if (live) live.textContent = hits + ' araç listeleniyor';   // görünür sayaç + canlı bölge
        host.innerHTML = hits ? html : `
            <div class="cg-empty">
                <i class="fas fa-search" aria-hidden="true"></i>
                <p>${term ? '<strong>“' + cgEsc(this._query.trim()) + '”</strong> için bu süzgeçte sonuç yok.' : 'Bu süzgeçte araç yok.'}</p>
                <button class="cg-btn-ghost" onclick="ConfigGenerator._clearFilters()">Süzgeçleri temizle</button>
            </div>`;
    },

    // Aile içinde kısa platform adı (Cisco NX-OS → NX-OS); aile adıyla aynıysa tam ad
    _short(vid, fam) {
        const l = (CG_REGISTRY[vid] || {}).label || vid;
        const f = fam || (typeof cgFamilyOf === 'function' ? cgFamilyOf(vid) : null);
        const x = f && l.toLowerCase().startsWith(f.name.toLowerCase() + ' ') ? l.slice(f.name.length + 1) : l;
        return x || l;
    },

    _clearFilters() {
        this._query = ''; this._cat = 'all'; this._setFilter('all');
        const q = document.getElementById('cg-home-q'); if (q) q.value = '';
    },

    // ── ÇALIŞMA SAYFASI: tam genişlik, 2 kolon ───────────────────────────
    _renderWork(vendorId, typeId) {
        const vendor  = CG_REGISTRY[vendorId];
        const typeObj = vendor?.types.find(t => t.id === typeId);
        const gen     = typeObj?.gen();
        this._vendor = vendorId; this._type = typeId;

        if (!gen || typeof gen.init !== 'function') {
            this._setNav('tools');
        this._root.innerHTML = `
                <div class="cg-work"><div class="cg-empty">
                    <i class="fas fa-clock"></i>
                    <p>Bu generator henüz tamamlanmadı.</p>
                    <button class="cg-btn-ghost" onclick="ConfigGenerator.backToList()">← Tüm araçlar</button>
                </div></div>`;
            return;
        }

        // Aynı vendor'ın diğer araçları — hızlı geçiş için
        const siblings = vendor.types.filter(t => { const g = t.gen(); return g && typeof g.init === 'function'; });

        cgTermPrompt = typeObj.label || vendor.label;
        this._setNav('tools', typeObj.label + ' · ' + vendor.label);   // sekmede araç adı görünsün
        this._root.innerHTML = `
        <div class="cg-work">
            <div class="cg-work-hd">
                <button class="cg-back" onclick="ConfigGenerator.backToList()">
                    <i class="fas fa-arrow-left"></i> Tüm araçlar
                </button>
                <h1 class="cg-crumb cg-work-h1" title="${cgEsc(vendor.label)}">
                    ${cgBrandMark(vendorId, 16)}
                    <strong>${cgEsc(typeObj.label)}</strong>
                </h1>
                <div class="cg-work-jump">
                    <select onchange="if(this.value)ConfigGenerator.go('${vendorId}',this.value)" aria-label="Diğer araçlar">
                        ${siblings.map(t => `<option value="${t.id}"${t.id === typeId ? ' selected' : ''}>${cgEsc(t.label)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="cg-split">
                <div class="cg-split-form" id="cg-form-area"></div>
                <div class="cg-split-out">
                    <div class="cg-term">
                        <div class="cg-term-hd">
                            <div class="cg-term-dots"><i></i><i></i><i></i></div>
                            <div class="cg-term-title">
                                <span class="cg-live-dot" id="cg-live-dot"></span>${cgEsc(typeObj.label)}
                            </div>
                            <div class="cg-term-acts">
                                <button type="button" class="cg-term-btn" id="cg-term-copy" onclick="cgCopy()" disabled>
                                    <i class="fas fa-copy"></i> Kopyala
                                </button>
                                <button type="button" class="cg-term-btn" id="cg-term-dl" onclick="cgDownload()" disabled>
                                    <i class="fas fa-download"></i> .txt
                                </button>
                            </div>
                        </div>
                        <pre class="cg-term-body" id="cg-term-body"></pre>
                    </div>
                    <div class="cg-warns" id="cg-term-warn" role="region" aria-label="Uyarılar" hidden></div>
                </div>
            </div>
        </div>`;

        const formArea = document.getElementById('cg-form-area');
        cgShowOutput('', []);
        cgValFamily = (typeof cgFamilyOf === 'function' && cgFamilyOf(vendorId) || {}).slug || null;
        gen.init(formArea);
        cgPostRender(formArea);
        cgBindLegacyLive(formArea);

        // Formsuz (referans/doküman) sayfalarda terminali gizle, tam genişlik ver
        if (!formArea.querySelector('form')) {
            this._root.querySelector('.cg-split')?.classList.add('is-single');
        }
        this._bindSlash();
    },

    // ── VENDOR KARTLARI / HUB (A4) ───────────────────────────────────────
    _renderVendorHub(slug) {
        this._setNav('vendors');
        this._vendor = this._type = null;
        if (slug) CgHub.renderHub(this._root, slug); else CgHub.renderVendors(this._root);   // document.title'ı CgHub yazar
        window.scrollTo(0, 0);
    },

    // ── TANITIM (A7): kırıntı ve sol ağaç yok (CgShell bu rotada ikisini de gizler); lab verisi yüklenmez ──
    _renderPage(which, arg) {
        this._setNav(which);
        this._vendor = this._type = null;
        CgPages.render(this._root, which, arg);   // document.title'ı CgPages yazar
        window.scrollTo(0, 0);
    },

    _renderLanding() {
        this._setNav('home');
        this._vendor = this._type = null;
        CgLanding.render(this._root);   // document.title'ı CgLanding yazar
        window.scrollTo(0, 0);
    },

    // ── DÖNÜŞTÜRÜCÜ ──────────────────────────────────────────────────────
    _renderConverter() {
        this._setNav('conv');
        this._root.innerHTML = `<div class="cg-work"><div id="cg-conv-host"></div></div>`;
        const host = document.getElementById('cg-conv-host');
        if (typeof ConfigConverter !== 'undefined') ConfigConverter.render(host);
        else host.innerHTML = '<div class="cg-empty"><i class="fas fa-exchange-alt"></i><p>Dönüştürücü yüklenemedi.</p></div>';
        this._bindSlash();
    },

    // ── KOMUTLAR: çok vendorlu CLI komut kütüphanesi ────────────────────
    // fam: vendor kilidi (#/v/<aile>/komutlar): yalnız o ailenin komut kütüphaneleri
    _renderCli(vendor, fam) {
        if (fam) this._setNav('vendors', fam.name + ' komutları'); else this._setNav('cli');
        this._vendor = this._type = null;
        if (typeof CgCli === 'undefined') { this._root.innerHTML = '<div class="cg-empty"><p>Komut kütüphanesi yüklenemedi.</p></div>'; return; }
        CgCli.render(this._root, vendor, fam || null);
    },

    // ── CLI LABORATUVARI: görevli terminal simülatörü ────────────────────
    // fam: vendor kilidi (#/v/<aile>/lab): çip satırı yerine seviye rayı, yalnız o ailenin labları
    _renderLab(id, pathId, vf, fam) {
        if (fam) this._setNav('vendors', fam.name + ' lablar'); else this._setNav('lab');
        this._vendor = this._type = null;
        if (typeof CgLab === 'undefined' || typeof CgCli === 'undefined') { this._root.innerHTML = '<div class="cg-empty"><p>Laboratuvar yüklenemedi.</p></div>'; return; }
        // #/lab?v=<vendor>: katalog süzgeci URL'den (geçersizse tümü); ?v yoksa bellekteki süzgeç, katalog adresi ona göre güncellenir
        if (!id && !pathId && vf !== null && vf !== undefined) CgLab._vf = CgLab.VENDORS[vf] ? vf : 'all';
        // Genel katalog (#/lab, ?v yok) bir aile sayfasından sonra açılırsa ailenin süzgeci taşınmaz: "Tümü"
        if (!id && !pathId) { if (!fam && (vf === null || vf === undefined) && this._labFam) CgLab._vf = 'all'; this._labFam = !!fam; }
        CgLab.render(this._root, id, pathId, fam || null);
        window.scrollTo(0, 0);
    },

    // ── iRULE ARENASI: trafik masası (kural → canlı akış)
    // fam: arena alanı olan aile (#/v/<aile>/arena…); görev bağlantıları bu tabanla kurulur
    _renderArena(mode, id, fam) {
        this._setNav('arena', fam ? cgArenaName(fam) : null);
        if (typeof CgArena !== 'undefined') CgArena._base = fam ? '#/v/' + fam.slug + '/arena' : '#/arena';
        this._vendor = this._type = null;
        if (typeof CgArena === 'undefined' || typeof CgCli === 'undefined') { this._root.innerHTML = '<div class="cg-empty"><p>Arena yüklenemedi.</p></div>'; return; }
        CgArena.render(this._root, mode, id);
        window.scrollTo(0, 0);
    },

    // ── SORUN GİDERME: senaryo tabanlı adım adım sihirbaz ────────────────
    // fam: vendor kilidi (#/v/<aile>/sorun[?k=<konu>]): konu çipleri + o ailenin senaryoları (b = konu)
    _renderTs(a, b, fam) {
        if (fam) this._setNav('vendors', fam.name + ' sorun giderme'); else this._setNav('ts');
        this._vendor = this._type = null;
        if (typeof CgTroubleshoot === 'undefined' || typeof CgCli === 'undefined') { this._root.innerHTML = '<div class="cg-empty"><p>Sorun giderme sihirbazı yüklenemedi.</p></div>'; return; }
        if (fam) { CgTroubleshoot.renderFamily(this._root, fam, b); window.scrollTo(0, 0); return; }
        CgTroubleshoot.render(this._root, a, b);
        window.scrollTo(0, 0);
    },

    // ── Geriye dönük uyumluluk (eski çağrılar için) ──────────────────────
    _selectVendor(vendorId) { this._vendor = vendorId; },
    _loadGenerator(vendorId, typeId) { this._renderWork(vendorId, typeId); },
};
