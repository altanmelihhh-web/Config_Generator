'use strict';

// ─── Referans diyagram katmani ───────────────────────────────────────────────
//
// ASCII topolojilerin yerine olcekli SVG uretir. Tasarim kararlari:
//
//   * Harici bagimlilik YOK. Site "tamami tarayicida calisir" diyor; CDN'den
//     diyagram kutuphanesi cekmek bu sozu bozar ve cevrimdisi kullanimi keser.
//   * Renkler CSS degiskenlerinden gelir -> acik/koyu tema otomatik calisir.
//     Sabit renk kullanilmaz (ASCII bloklarindaki kontrast hatasinin nedeni buydu).
//   * viewBox + width:100% -> her ekran genisliginde keskin, bulaniklasmaz.
//   * Metinler <text> olarak kalir: secilebilir, aranabilir, ekran okuyucu okur.
//
// Kullanim: cgDia({ w, h, nodes, links, notes })

const CG_DIA = {
    // Cihaz tipine gore renk rolu (deger CSS degiskeninden gelir)
    kind: {
        router:   { fill: 'var(--dia-router, #4F46E5)',  label: 'Router'   },
        switch:   { fill: 'var(--dia-switch, #0EA5E9)',  label: 'Switch'   },
        firewall: { fill: 'var(--dia-fw, #EF4444)',      label: 'Firewall' },
        server:   { fill: 'var(--dia-srv, #10B981)',     label: 'Sunucu'   },
        cloud:    { fill: 'var(--dia-cloud, #64748B)',   label: 'Bulut'    },
        lb:       { fill: 'var(--dia-lb, #F59E0B)',      label: 'Load Balancer' }
    }
};

function cgDiaEsc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// Tek bir cihaz kutusu. Genislik metne gore degil sabit tutulur ki hizalama bozulmasin.
function cgDiaNode(n) {
    const k = CG_DIA.kind[n.kind] || CG_DIA.kind.router;
    const w = n.w || 104, h = n.h || 46;
    const x = n.x - w / 2, y = n.y - h / 2;
    const sub = n.sub
        ? `<text x="${n.x}" y="${y + h - 12}" class="cg-dia-sub" text-anchor="middle">${cgDiaEsc(n.sub)}</text>`
        : '';
    const labelY = n.sub ? y + 22 : n.y + 5;
    return `<g class="cg-dia-node">
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7"
          fill="${k.fill}" fill-opacity="0.13" stroke="${k.fill}" stroke-width="1.6"/>
    <rect x="${x}" y="${y}" width="4" height="${h}" rx="2" fill="${k.fill}"/>
    <text x="${n.x}" y="${labelY}" class="cg-dia-label" text-anchor="middle">${cgDiaEsc(n.label)}</text>
    ${sub}
  </g>`;
}

// Iki nokta arasi baglanti. dash: kesikli (mantiksal/tunel), arrow: yonlu.
function cgDiaLink(l) {
    const dash = l.dash ? ' stroke-dasharray="5 4"' : '';
    const arrow = l.arrow ? ' marker-end="url(#cgDiaArrow)"' : '';
    const stroke = l.color || 'var(--dia-link, #94A3B8)';
    const wdt = l.width || 1.8;
    const path = (l.bend)
        ? `M ${l.x1} ${l.y1} Q ${l.bend[0]} ${l.bend[1]} ${l.x2} ${l.y2}`
        : `M ${l.x1} ${l.y1} L ${l.x2} ${l.y2}`;
    const mid = l.label ? (() => {
        const mx = l.lx != null ? l.lx : (l.x1 + l.x2) / 2;
        const my = l.ly != null ? l.ly : (l.y1 + l.y2) / 2 - 7;
        // Etiketin altindaki cizgiyi gizlemek icin arkasina zemin koy
        const wpx = String(l.label).length * 6.1 + 10;
        return `<rect x="${mx - wpx / 2}" y="${my - 10}" width="${wpx}" height="14" rx="3"
                      fill="var(--dia-bg, #FFFFFF)"/>
                <text x="${mx}" y="${my}" class="cg-dia-edge" text-anchor="middle">${cgDiaEsc(l.label)}</text>`;
    })() : '';
    return `<g class="cg-dia-link">
    <path d="${path}" fill="none" stroke="${stroke}" stroke-width="${wdt}"${dash}${arrow}/>
    ${mid}
  </g>`;
}

// Serbest metin (bolge etiketi, aciklama)
function cgDiaText(t) {
    const cls = t.cls || 'cg-dia-note';
    const anchor = t.anchor || 'middle';
    return `<text x="${t.x}" y="${t.y}" class="${cls}" text-anchor="${anchor}">${cgDiaEsc(t.text)}</text>`;
}

// Kesikli cerceve — AS / VRF / site siniri gostermek icin
function cgDiaZone(z) {
    return `<g class="cg-dia-zone">
    <rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="9"
          fill="${z.fill || 'var(--dia-zone, #64748B)'}" fill-opacity="${z.opacity != null ? z.opacity : 0.06}"
          stroke="${z.stroke || 'var(--dia-zone, #64748B)'}" stroke-width="1.2" stroke-dasharray="6 4"/>
    ${z.label ? `<text x="${z.x + 10}" y="${z.y + 17}" class="cg-dia-zonelabel" text-anchor="start">${cgDiaEsc(z.label)}</text>` : ''}
  </g>`;
}

// Ana bilesen. notes: diyagramin altinda madde listesi.
function cgDia(spec) {
    const w = spec.w || 520, h = spec.h || 230;
    const zones = (spec.zones || []).map(cgDiaZone).join('');
    const links = (spec.links || []).map(cgDiaLink).join('');
    const nodes = (spec.nodes || []).map(cgDiaNode).join('');
    const texts = (spec.texts || []).map(cgDiaText).join('');
    const notes = (spec.notes || []).length
        ? `<ul class="cg-dia-notes">${spec.notes.map(n => `<li>${n}</li>`).join('')}</ul>`
        : '';
    return `<div class="cg-dia-wrap">
    <svg class="cg-dia" viewBox="0 0 ${w} ${h}" role="img"
         aria-label="${cgDiaEsc(spec.alt || spec.title || 'Ag topolojisi')}">
      <defs>
        <marker id="cgDiaArrow" viewBox="0 0 10 10" refX="9" refY="5"
                markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--dia-link, #94A3B8)"/>
        </marker>
      </defs>
      ${zones}${links}${nodes}${texts}
    </svg>
    ${notes}
  </div>`;
}
