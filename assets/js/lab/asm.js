'use strict';
// ─── ASM (Advanced WAF) eğitim motoru v0: politika + istek → ihlaller, imzalar, karar, support ID ───────
// Saf JS, DOM'suz (CgIRule gibi). Kaynaklar ve sınırlar: ~/inventory/notes/f5-asm-fikir-envanteri.md §B.
// İhlal adları F5 ASM::ViolationName listesindeki adlardır. İMZALAR KURGUSALDIR: "E-" önekli eğitim imzaları,
// gerçek F5 imza veritabanını temsil etmez. Violation rating hesabı öğretim için sadeleştirilmiştir.
// Varsayılan blok sayfası HTTP 200 ile döner (K41633422); varsayılan izinli metotlar GET/HEAD/POST (K85840901).
const CgASM = (function () {
    const V = {
        method: 'Illegal method', filetype: 'Illegal file type', url: 'Illegal URL', urlLen: 'Illegal URL length', qsLen: 'Illegal query string length',
        param: 'Illegal parameter', paramLen: 'Illegal parameter value length', meta: 'Illegal meta character in parameter value', dtype: 'Illegal parameter data type',
        repeated: 'Illegal repeated parameter name', cookie: 'Modified domain cookie(s)', sig: 'Attack signature detected', evasion: 'Evasion technique detected',
        proto: 'HTTP protocol compliance failed', geo: 'Access from disallowed Geolocation',
    };
    // Eğitim imzaları (kurgusal ID'ler). where: nerede aranır (param değeri, URL, başlık)
    const SIGS = [
        { id: 'E-1001', name: 'SQL enjeksiyonu: tırnak + OR/AND karşılaştırması', type: 'SQL-Injection', acc: 'yüksek', re: /'\s*(or|and)\s+['"\w]+\s*=\s*['"\w]+/i },
        { id: 'E-1002', name: 'SQL enjeksiyonu: UNION SELECT', type: 'SQL-Injection', acc: 'yüksek', re: /\bunion\b[\s\S]{0,20}\bselect\b/i },
        { id: 'E-1003', name: 'XSS: <script> etiketi', type: 'Cross Site Scripting (XSS)', acc: 'yüksek', re: /<\s*script\b/i },
        { id: 'E-1004', name: 'XSS: olay özniteliği (onerror/onload)', type: 'Cross Site Scripting (XSS)', acc: 'orta', re: /<[^>]*\bon(error|load|mouseover)\s*=/i },
        { id: 'E-1005', name: 'Yol geçişi: /etc/passwd', type: 'Path Traversal', acc: 'yüksek', re: /(\.\.\/)+.*etc\/passwd|\/etc\/passwd/i },
        { id: 'E-1006', name: 'Komut enjeksiyonu: ; ile kabuk komutu', type: 'Command Execution', acc: 'orta', re: /[;|&]\s*(cat|ls|id|wget|curl|nc)\b/i },
        { id: 'E-1007', name: 'Otomatik araç: sqlmap istemci imzası', type: 'Vulnerability Scan', acc: 'yüksek', re: /sqlmap/i, headersOnly: true },
        { id: 'E-1008', name: 'SQL yorum dizisi (--)', type: 'SQL-Injection', acc: 'düşük', re: /'\s*--/ },
    ];
    const META_DEFAULT = ['<', '>', '\'', '"', ';', '`', '|', '(', ')'];   // eğitim modeli: parametre değerinde izinsiz meta karakterler
    const dec = s => { try { return decodeURIComponent(String(s).replace(/\+/g, ' ')); } catch (e) { return String(s); } };
    const glob = (p, x) => new RegExp('^' + String(p).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i').test(x);

    function policy(d) {
        const p = Object.assign({ name: 'waf_app', blocking: true, methods: ['GET', 'HEAD', 'POST'], filetypes: ['*'], urls: ['*'], parameters: [{ name: '*', meta: false, signatures: true }],
            cookies: [], sigStaging: false, stagedSigs: [], sigOverrides: [], blockFlags: {}, disallowedGeo: [], maxUrlLen: 2048, maxQsLen: 2048 }, d || {});
        p.parameters = p.parameters.map(x => Object.assign({ meta: false, signatures: true, maxLength: 0, dataType: 'alpha-numeric', allowMetaChars: [] }, x));
        p._norm = true;
        return p;
    }
    function parseParams(q) { return String(q || '').split('&').filter(Boolean).map(kv => { const k = kv.indexOf('='); return k < 0 ? [dec(kv), ''] : [dec(kv.slice(0, k)), kv.slice(k + 1)]; }); }
    const paramDef = (p, n) => p.parameters.find(x => x.name === n) || p.parameters.find(x => x.name !== n && glob(x.name, n));
    const overridden = (p, sig, where) => p.sigOverrides.some(o => o.sig === sig && (!o.param || o.param === where.param) && (!o.url || glob(o.url, where.url || '')));
    let seq = 0;
    const supportId = (req, n) => { let h = 2166136261; const s = req.method + req.uri + (req.body || '') + (req.ip || '') + n; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return ('1' + String(h).padStart(10, '0') + String(Math.imul(h, 2654435761) >>> 0).padStart(10, '0')).slice(0, 19); };

    // req: { method, uri, headers: [[n,v]], body, ip, geo? }
    function evaluate(pd, req) {
        const p = pd && pd._norm ? pd : policy(pd);
        const H = req.headers || [], hv = n => (H.find(h => h[0].toLowerCase() === n.toLowerCase()) || [])[1];
        const uri = String(req.uri || '/'), qi = uri.indexOf('?'), rawPath = qi < 0 ? uri : uri.slice(0, qi), rawQs = qi < 0 ? '' : uri.slice(qi + 1);
        const path = dec(rawPath), viol = [], sigs = [], add = (name, detail, sub) => { if (!viol.some(v => v.name === name && v.detail === detail)) viol.push({ name, detail, sub: sub || null }); };
        // 1) normalleştirme ve atlatma (evasion): çoklu kodlama, dizin geçişi
        if (/%25[0-9a-f]{2}/i.test(uri) || (/%[0-9a-f]{2}/i.test(dec(rawPath + '?' + rawQs)))) add(V.evasion, 'Birden çok kez kodlama (%25…)', 'Multiple decoding');
        if (/(^|\/)\.\.(\/|$)/.test(path)) add(V.evasion, 'Dizin geçişi (../)', 'Directory traversals');
        // 2) HTTP protokol uyumluluğu
        if (!hv('Host')) add(V.proto, 'HTTP/1.1 isteğinde Host başlığı yok', 'No Host header in HTTP/1.1 request');
        if (H.filter(h => h[0].toLowerCase() === 'host').length > 1) add(V.proto, 'Birden çok Host başlığı', 'Multiple host headers');
        // 3) metot, uzunluk, dosya türü, URL
        if (!p.methods.includes(req.method)) add(V.method, req.method);
        if (rawPath.length > p.maxUrlLen) add(V.urlLen, rawPath.length + ' > ' + p.maxUrlLen);
        if (rawQs.length > p.maxQsLen) add(V.qsLen, rawQs.length + ' > ' + p.maxQsLen);
        const seg = path.split('/').pop(), ext = seg.includes('.') ? seg.split('.').pop().toLowerCase() : 'no_ext';
        if (!p.filetypes.includes('*') && !p.filetypes.map(x => x.toLowerCase()).includes(ext)) add(V.filetype, ext);
        if (!p.urls.some(u => glob(u, path))) add(V.url, path);
        // 4) coğrafya
        if (req.geo && p.disallowedGeo.includes(req.geo)) add(V.geo, req.geo);
        // 5) parametreler (sorgu + form gövdesi)
        const params = parseParams(rawQs).concat(/x-www-form-urlencoded/i.test(hv('Content-Type') || '') || req.form ? parseParams(req.body) : []);
        const seen = {};
        params.forEach(([n, raw]) => {
            const v = dec(raw), d = paramDef(p, n); seen[n] = (seen[n] || 0) + 1;
            if (seen[n] === 2) add(V.repeated, n);
            if (!d) { add(V.param, n); return; }
            if (d.maxLength && v.length > d.maxLength) add(V.paramLen, n + ' (' + v.length + ' > ' + d.maxLength + ')');
            if (d.dataType === 'integer' && !/^-?\d+$/.test(v)) add(V.dtype, n + ' = "' + v + '" (integer bekleniyor)');
            if (!d.meta) { const bad = META_DEFAULT.filter(c => v.includes(c) && !d.allowMetaChars.includes(c)); if (bad.length) add(V.meta, n + ': ' + bad.join(' ')); }
            if (d.signatures) SIGS.filter(s => !s.headersOnly && s.re.test(v)).forEach(s => { if (!overridden(p, s.id, { param: n, url: path })) sigs.push({ id: s.id, name: s.name, type: s.type, where: 'parametre ' + n, staged: p.sigStaging || p.stagedSigs.includes(s.id) }); });
        });
        // URL ve başlıklardaki imzalar
        SIGS.filter(s => !s.headersOnly && s.re.test(path)).forEach(s => { if (!overridden(p, s.id, { url: path })) sigs.push({ id: s.id, name: s.name, type: s.type, where: 'URL', staged: p.sigStaging || p.stagedSigs.includes(s.id) }); });
        SIGS.filter(s => s.headersOnly && s.re.test(hv('User-Agent') || '')).forEach(s => { if (!overridden(p, s.id, {})) sigs.push({ id: s.id, name: s.name, type: s.type, where: 'User-Agent başlığı', staged: p.sigStaging || p.stagedSigs.includes(s.id) }); });
        // 6) çerezler: enforced çerez değiştirilmişse
        const ck = hv('Cookie') || ''; (p.cookies || []).filter(c => c.enforce).forEach(c => { const m = ck.match(new RegExp('(?:^|;\\s*)' + c.name + '=([^;]*)')); if (m && c.value !== undefined && m[1] !== c.value) add(V.cookie, c.name); });
        const liveSigs = sigs.filter(s => !s.staged);
        if (liveSigs.length) add(V.sig, liveSigs.map(s => s.id).join(', '));
        // 7) karar: blocking modda, Block bayrağı açık (varsayılan açık) ve staging dışı ihlal → blok
        const flag = n => p.blockFlags[n] !== false;
        const blocking = viol.filter(v => flag(v.name));
        const hi = liveSigs.filter(s => SIGS.find(x => x.id === s.id).acc === 'yüksek').length;
        const rating = viol.length === 0 ? (sigs.length ? 1 : 0) : Math.min(5, (hi >= 2 ? 5 : hi === 1 ? 4 : liveSigs.length ? 3 : 2) + (viol.some(v => v.name === V.evasion) ? 1 : 0));
        const blocked = !!p.blocking && blocking.length > 0;
        const id = supportId(req, seq++);
        return { violations: viol, sigs, rating, blocked, status: blocked ? 'Blocked' : viol.length ? 'Alarmed (geçti)' : 'Legal', supportId: viol.length || sigs.length ? id : null, policy: p.name };
    }
    const blockPage = sid => '<html><head><title>Request Rejected</title></head><body>The requested URL was rejected. Please consult with your administrator.<br><br>Your support ID is: ' + sid + '<br><br><a href=\'javascript:history.back();\'>[Go Back]</a></body></html>';
    return { V, SIGS, META_DEFAULT, policy, evaluate, blockPage, parseParams };
})();
(typeof window !== 'undefined' ? window : globalThis).CgASM = CgASM;
if (typeof module !== 'undefined') module.exports = CgASM;
