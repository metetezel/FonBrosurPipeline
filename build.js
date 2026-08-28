const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { growthChartSVG, donutChartSVG } = require('./lib/charts');

const ROOT = __dirname;
const growth = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jet.json'), 'utf-8'));
const s = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/jet_static.json'), 'utf-8'));

const logoBase64 = fs.readFileSync(path.join(ROOT, 'assets/logo_hires_crop.png')).toString('base64');

const RISK_COLORS = ['#66A3B3', '#338599', '#006680', '#FFC83E', '#FF9327', '#FF4D06', '#FF0100'];
const TEAL = '#00677E';
const ORANGE = '#E8792A';

function fmtTRNumber(n, decimals) {
  return n.toLocaleString('tr-TR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function riskGaugeHTML(active) {
  const segs = RISK_COLORS.map((c, i) => {
    const num = i + 1;
    const isActive = num === active;
    return `<div class="risk-seg ${isActive ? 'active' : ''}" style="--seg-color:${c}">
      ${isActive ? '<div class="risk-pointer"></div>' : ''}
      <span>${num}</span>
    </div>`;
  }).join('');
  return `<div class="risk-gauge">${segs}</div>`;
}

function infoRowsHTML(rows) {
  return rows.map(([label, value]) => `
    <div class="info-row">
      <span class="info-label">${label}</span>
      <span class="info-value">${value}</span>
    </div>`).join('');
}

function listHTML(items, iconColor) {
  return `<ul class="check-list" style="--icon-color:${iconColor}">` +
    items.map(t => `<li>${t}</li>`).join('') +
    `</ul>`;
}

const donutSegs = s.assetAllocation.map((a, i) => ({ ...a, color: i === 0 ? TEAL : ORANGE }));
const donutSvg = donutChartSVG(donutSegs, { size: 168, strokeWidth: 22 });

const lastPriceStr = fmtTRNumber(growth.lastPrice, 6);
const lastDateTR = growth.lastDate.split('-').reverse().join('.');
const priceRow = [`Birim Fiyat (${lastDateTR})`, `${lastPriceStr} TL`];
const kurulusIdx = s.info.findIndex(([label]) => label === 'Kuruluş Tarihi');
const infoRowsLive = [...s.info.slice(0, kurulusIdx + 1), priceRow, ...s.info.slice(kurulusIdx + 1)];

function renderPageHtml(chartHtml) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${s.fundCode} Fon Bilgi Kartı</title>
<style>
  @font-face { font-family:'Inter'; font-weight:400; src:url('./assets/fonts/inter-400.ttf') format('truetype'); }
  @font-face { font-family:'Inter'; font-weight:500; src:url('./assets/fonts/inter-500.ttf') format('truetype'); }
  @font-face { font-family:'Inter'; font-weight:600; src:url('./assets/fonts/inter-600.ttf') format('truetype'); }
  @font-face { font-family:'Inter'; font-weight:700; src:url('./assets/fonts/inter-700.ttf') format('truetype'); }
  @font-face { font-family:'Inter'; font-weight:800; src:url('./assets/fonts/inter-800.ttf') format('truetype'); }

  :root {
    --teal: ${TEAL};
    --teal-dark: #024a58;
    --teal-tint: #EAF3F4;
    --orange: ${ORANGE};
    --orange-tint: #FDF1E7;
    --ink: #1B2B2E;
    --muted: #62767A;
    --line: #E2E8E9;
    --card-bg: #F8FAFA;
  }
  * { box-sizing: border-box; }
  html, body { margin:0; padding:0; }
  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    color: var(--ink);
    font-size: 9.2px;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    width: 210mm;
    height: 297mm;
    padding: 11mm 12mm 8mm 12mm;
    display: flex;
    flex-direction: column;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 7px;
    border-bottom: 2.5px solid var(--teal);
    margin-bottom: 8px;
  }
  .header-left { display:flex; align-items:center; gap:12px; }
  .header-left img { height: 22px; display:block; }
  .fund-title { font-size: 14.5px; font-weight: 700; color: var(--teal-dark); line-height:1.2; }
  .fund-title .ticker { color: var(--orange); font-weight:800; }
  .header-right { text-align:right; }
  .date-badge {
    display:inline-block; background: var(--teal); color:#fff; font-weight:600;
    font-size: 9.5px; padding: 4px 11px; border-radius: 20px; letter-spacing:.2px;
  }
  .eyebrow { font-size:7.6px; text-transform:uppercase; letter-spacing:1.2px; color:var(--muted); font-weight:600; margin-bottom:2px; }

  /* Layout */
  .main-grid { display:grid; grid-template-columns: 56mm 1fr; gap: 6mm; flex:1; min-height:0; }
  .col-left { display:flex; flex-direction:column; gap: 7px; }
  .col-right { display:flex; flex-direction:column; gap: 7px; }

  .card {
    background: var(--card-bg);
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 9px 11px;
  }
  .card-title {
    font-size: 9.6px; font-weight:700; color:#fff; background:var(--teal);
    margin: -9px -11px 8px -11px; padding: 6px 11px; border-radius: 10px 10px 0 0;
  }
  .card-title.light {
    color: var(--teal-dark); background: none; border-bottom: 1px solid var(--line);
    padding: 0 0 6px 0; margin: -1px 0 8px 0; border-radius:0;
  }

  .info-row {
    display:flex; justify-content:space-between; gap:8px;
    padding: 3.6px 0; border-bottom: 1px solid var(--line);
    font-size: 8.6px;
  }
  .info-row:last-child { border-bottom:none; }
  .info-label { color: var(--muted); }
  .info-value { font-weight:600; text-align:right; }

  .manager-row { display:flex; justify-content:space-between; font-size:8.6px; padding:3px 0; }
  .manager-role { color:var(--muted); }
  .manager-name { font-weight:600; }
  .manager-exp { color: var(--orange); font-weight:600; }

  /* Risk gauge */
  .risk-level-num { font-size: 26px; font-weight:800; color: var(--orange); line-height:1; }
  .risk-gauge { display:flex; gap:3px; margin: 8px 0 6px 0; }
  .risk-seg {
    flex:1; height:20px; border-radius:5px; background: var(--seg-color);
    display:flex; align-items:center; justify-content:center; position:relative;
    opacity: 0.32;
  }
  .risk-seg span { font-size:7.6px; font-weight:700; color:#fff; }
  .risk-seg.active { opacity:1; height:26px; margin-top:-3px; box-shadow: 0 2px 5px rgba(0,0,0,0.18); }
  .risk-seg.active span { font-size:9px; }
  .risk-pointer {
    position:absolute; top:-7px; left:50%; transform:translateX(-50%);
    width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent;
    border-top: 5px solid var(--seg-color);
  }
  .risk-caption { font-size:7.4px; color:var(--muted); line-height:1.4; margin-top:4px; }

  /* CTA */
  .cta-btn {
    display:block; text-align:center; font-weight:700; font-size:9.2px;
    padding: 8px 10px; border-radius: 7px; margin-bottom:6px; letter-spacing:.2px;
  }
  .cta-primary { background: var(--orange); color:#fff; }
  .cta-secondary { background:#fff; color: var(--teal-dark); border: 1.5px solid var(--teal); }
  .cta-note { font-size:7.4px; color:var(--muted); line-height:1.4; }

  /* Strategy / lists */
  .strategy-text { font-size:8.6px; line-height:1.5; color:#33454A; text-align:justify; margin-bottom:6px; }
  .benchmark-box {
    background: var(--teal-tint); border-left: 3px solid var(--teal); border-radius:0 6px 6px 0;
    padding: 6px 9px; font-size: 8.2px; font-weight:600; color:var(--teal-dark);
  }

  .two-col { display:grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .check-list { list-style:none; margin:0; padding:0; }
  .check-list li {
    position:relative; padding: 2.5px 0 2.5px 15px; font-size:8.3px; line-height:1.4;
  }
  .check-list li::before {
    content:''; position:absolute; left:0; top:6px; width:7px; height:7px;
    border-radius:50%; background: var(--icon-color);
  }

  .asset-card { display:flex; align-items:center; gap: 12px; }
  .donut-wrap { flex-shrink:0; width:100px; }
  .donut-chart { width:100%; height:auto; }
  .legend { display:flex; flex-direction:column; gap:6px; }
  .legend-item { display:flex; align-items:center; gap:6px; font-size:8.4px; }
  .legend-dot { width:9px; height:9px; border-radius:2px; }
  .legend-pct { font-weight:700; }

  /* Chart */
  .chart-section { flex:1; display:flex; flex-direction:column; min-height:0; }
  .chart-note { font-size:7.2px; color:var(--muted); font-style:italic; margin: 2px 0 4px 0; }
  .growth-chart { width:100%; height:auto; flex:1; }
  .grid-line { stroke:#EEF2F3; stroke-width:1; }
  .axis-line { stroke:#C9D3D4; stroke-width:1; }
  .axis-label { font-size:8px; fill:#8A9A9D; font-family:'Inter'; }
  .chart-legend { display:flex; gap:16px; justify-content:center; margin-top:2px; }
  .chart-legend .legend-item { font-size:8.2px; }
  .legend-line { width:14px; height:2.6px; border-radius:2px; }

  /* Footer */
  .footer { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line); }
  .contact-row { display:flex; gap:18px; font-size:7.6px; color:var(--muted); margin-bottom:4px; flex-wrap:wrap; }
  .contact-row b { color: var(--ink); }
  .disclaimer { font-size:5.6px; line-height:1.35; color:#9AA5A7; text-align:justify; }
</style>
</head>
<body>
<div class="page">

  <div class="header">
    <div class="header-left">
      <img src="data:image/png;base64,${logoBase64}" alt="Ata Portföy"/>
      <div>
        <div class="eyebrow">Fon Bilgi Kartı</div>
        <div class="fund-title">${s.fundName} <span class="ticker">(${s.fundCode})</span></div>
      </div>
    </div>
    <div class="header-right">
      <span class="date-badge">${s.reportDate}</span>
    </div>
  </div>

  <div class="main-grid">
    <div class="col-left">
      <div class="card">
        <div class="card-title">Fon Bilgi Kartı</div>
        ${infoRowsHTML(infoRowsLive)}
      </div>

      <div class="card">
        <div class="card-title">Fon Yöneticileri</div>
        ${s.managers.map(m => `
          <div class="manager-row">
            <span class="manager-role">${m.role}</span>
            <span class="manager-name">${m.name}</span>
          </div>
          <div class="manager-row" style="margin-top:-2px;">
            <span></span><span class="manager-exp">${m.experience} tecrübe</span>
          </div>
        `).join('')}
      </div>

      <div class="card">
        <div class="card-title light">Fon Risk Seviyesi</div>
        <div class="risk-level-num">${s.riskLevel}<span style="font-size:14px;color:var(--muted);font-weight:600;">/7</span></div>
        ${riskGaugeHTML(s.riskLevel)}
        <div class="risk-caption">Risk değerleri; fonların volatilitesi dikkate alınarak, haftalık getiriler kullanılmak suretiyle hesaplanır. En az risk 1, en fazla risk 7 olmak üzere risk değeri 1-7 arasındadır.</div>
      </div>

      <div class="card">
        <div class="cta-btn cta-primary">${s.cta.primary}</div>
        <div class="cta-btn cta-secondary">${s.cta.secondary}</div>
        <div class="cta-note">${s.cta.note}</div>
      </div>
    </div>

    <div class="col-right">
      <div class="card">
        <div class="card-title light">Fon Stratejisi Nedir?</div>
        ${s.strategyParagraphs.map(p => `<div class="strategy-text">${p}</div>`).join('')}
        <div class="benchmark-box">${s.benchmarkText}</div>
      </div>

      <div class="two-col">
        <div class="card">
          <div class="card-title light" style="font-size:8.8px;">Fon Hangi Sektörlere Yatırım Yapıyor?</div>
          ${listHTML(s.sectors, TEAL)}
        </div>
        <div class="card">
          <div class="card-title light" style="font-size:8.8px;">Fonun Avantajları Nelerdir?</div>
          ${listHTML(s.advantages, ORANGE)}
          <div style="margin-top:8px; padding-top:8px; border-top:1px solid var(--line);">
            <div style="font-size:8.4px; font-weight:700; color:var(--teal-dark); margin-bottom:6px;">Varlık Dağılımı</div>
            <div class="asset-card">
              <div class="donut-wrap">${donutSvg}</div>
              <div class="legend">
                ${donutSegs.map(seg => `
                  <div class="legend-item">
                    <span class="legend-dot" style="background:${seg.color}"></span>
                    <span class="legend-pct">%${seg.pct}</span> ${seg.label}
                  </div>`).join('')}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="card chart-section">
        <div class="card-title light">Kuruluştan Beri 100 TL Yatırımım Ne Kazandırdı?</div>
        <div class="chart-note">${s.chartNote}</div>
        <div id="chart-slot" style="flex:1; min-height:0; display:flex; align-items:stretch;">${chartHtml}</div>
        <div class="chart-legend">
          <div class="legend-item"><span class="legend-line" style="background:${TEAL}"></span> ${s.fundCode} Endeks (100 TL)</div>
          <div class="legend-item"><span class="legend-line" style="background:${ORANGE}"></span> Karşılaştırma Ölçütü (yaklaşık)</div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="contact-row">
      <span><b>${s.contact.company}</b></span>
      <span>${s.contact.address}</span>
      <span>${s.contact.email}</span>
      <span>${s.contact.phone}</span>
    </div>
    <div class="disclaimer">${s.disclaimer}</div>
  </div>

</div>
</body>
</html>`;
}

const outHtmlPath = path.join(ROOT, 'output.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });

  // Pass 1: render with an empty chart slot to measure its real available box
  fs.writeFileSync(outHtmlPath, renderPageHtml(''), 'utf-8');
  await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  const box = await page.evaluate(() => {
    const el = document.getElementById('chart-slot');
    const r = el.getBoundingClientRect();
    return { width: r.width, height: r.height };
  });
  console.log('measured chart slot:', box);

  // Pass 2: render the real chart sized exactly to the measured box, then export
  const growthSvg = growthChartSVG(growth.growth, { width: Math.round(box.width), height: Math.round(box.height) });
  fs.writeFileSync(outHtmlPath, renderPageHtml(growthSvg), 'utf-8');
  await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });

  const outPdfPath = path.join(ROOT, 'JET_Brosur_Modern.pdf');
  await page.pdf({ path: outPdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();
  console.log('wrote', outHtmlPath);
  console.log('wrote', outPdfPath);
})();
