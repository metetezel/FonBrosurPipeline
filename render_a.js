const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { growthChartSVG, donutChartSVG } = require('./lib/charts');
const B = require('./lib/blocks');
const { loadStatic } = require('./lib/static');

const ROOT = __dirname;
const MONTH_LABELS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

// Hangi fon seri verisini nereden alıyor:
//   <kod>_monthly.json  — aylık ızgaradan üretilenler (build_monthly_data.js) ve
//                         ANZ/UANZ'ın kur düzeltmeli serisi (extract_anz_uanz_chart.js)
//   <kod>.json          — geri kalanı, doğrudan extract_fund.js'ten
// AAS ve YLC bir süre boyunca ellerinde kalmış birer `_monthly.json` okuyordu; o dosyaları
// hiçbir adım yenilemediği için sayfaları 31.07 verisinde çakılı kalmıştı (YLC'ninki
// üstelik getiri endeksine geçmeden önceki XGIDA.IS serisini taşıyordu). Kaynak listesi
// artık burada açıkça yazılı.
const MONTHLY_KAYNAKLI = ['aal', 'dgh', 'aya', 'aav', 'aed', 'tlz', 'anz', 'uanz'];
const seriDosyasi = lc => `data/${lc}${MONTHLY_KAYNAKLI.includes(lc) ? '_monthly' : ''}.json`;

function fmtPct(v, decimals = 1) {
  if (v == null) return '';
  const abs = Math.abs(v * 100).toFixed(decimals).replace('.', ',');
  return (v < 0 ? '-%' : '%') + abs;
}

function monthlyTableHTML(years, opts = {}) {
  const dividendByYearMonth = opts.dividendByYearMonth || null;
  const rows = years.map(y => {
    const cells = y.months.map((m, i) => `<td>${m != null ? fmtPct(m, 1) : ''}</td>`).join('');
    const ybbCell = `<td class="ybb-cell">${y.ybb != null ? fmtPct(y.ybb, 1) : ''}</td>`;
    let divCell = '';
    if (dividendByYearMonth) {
      const total = dividendByYearMonth[y.year];
      divCell = `<td class="ybb-cell">${total != null ? total.toFixed(2).replace('.', ',') : ''}</td>`;
    }
    return `<tr><td class="yr-cell">${y.year}</td>${cells}${ybbCell}${divCell}</tr>`;
  }).join('');
  const divHeader = dividendByYearMonth ? '<th>Temettü</th>' : '';
  const closeDateNote = opts.lastDate ? `<div class="monthly-note">* ${opts.lastDate.split('-').reverse().join('/')} tarihi itibari ile &nbsp;&nbsp;**Yılbaşından Beri</div>` : '';
  return `
  <table class="monthly-table">
    <thead><tr><th>TL</th>${MONTH_LABELS.map(m => `<th>${m}</th>`).join('')}<th>YBB**</th>${divHeader}</tr></thead>
    <tbody>${rows}</tbody>
  </table>${closeDateNote}`;
}

function comparisonTableHTML(columns, rows) {
  return `
  <table class="comparison-table">
    <thead><tr><th></th>${columns.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>
      ${rows.map(r => `<tr><td class="row-label">${r.label}</td>${r.values.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}
    </tbody>
  </table>`;
}

function extraCss() {
  return `
  .monthly-table, .comparison-table { width:100%; border-collapse:collapse; font-size:6.6px; }
  .monthly-table th, .monthly-table td { padding:1.3px 2px; text-align:center; border-bottom:1px solid var(--line); }
  .monthly-table thead th { background:var(--teal); color:#fff; font-weight:700; font-size:6.8px; }
  .monthly-table .yr-cell { font-weight:700; text-align:left; padding-left:4px; }
  .monthly-table .ybb-cell { font-weight:700; color:var(--orange); }
  .monthly-note { font-size:6px; color:var(--muted); font-style:italic; margin-top:1px; }
  .comparison-table { font-size:8.2px; }
  .comparison-table th, .comparison-table td { padding:5px 6px; text-align:center; border-bottom:1px solid var(--line); }
  .comparison-table td { white-space:nowrap; }
  .comparison-table thead th { background:var(--teal); color:#fff; font-weight:700; }
  .comparison-table thead th:first-child { background:transparent; }
  .comparison-table .row-label { text-align:left; font-weight:600; color:var(--teal-dark); background:var(--teal-tint); }
  .why-invest { background:var(--teal); color:#fff; border-radius:10px; padding:9px 11px; }
  .why-invest .title { font-size:9.6px; font-weight:700; margin-bottom:6px; }
  .why-invest li { position:relative; padding:2.5px 0 2.5px 14px; font-size:8.3px; line-height:1.4; }
  .why-invest li::before { content:''; position:absolute; left:0; top:6px; width:6px; height:6px; border-radius:50%; background:#fff; }
  .div-chip { display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--line); font-size:8.2px; }
  .div-chip b { color:var(--orange); }
  .chart-section-2 { flex:0.7; display:flex; flex-direction:column; min-height:0; }
  .chart-section { flex:1.1; }
  `;
}

const DONUT_PALETTE = B.DONUT_PALETTE;
function assetAllocationHTML(s) {
  if (!s.assetAllocation || s.assetAllocation.length === 0) return '';
  const segs = s.assetAllocation.map((a, i) => ({ ...a, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }));
  const donutSvg = donutChartSVG(segs, { size: 140, strokeWidth: 20 });
  return `
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">Varlık Dağılımı</div>
      <div class="asset-card">
        <div class="donut-wrap" style="width:90px;">${donutSvg}</div>
        <div class="legend">
          ${segs.map(seg => `
            <div class="legend-item">
              <span class="legend-dot" style="background:${seg.color}"></span>
              <span class="legend-pct">%${seg.pct}</span> ${seg.label}
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function renderPageHtml(s, monthly, chartHtml, chart2Html) {
  const logoBase64 = fs.readFileSync(path.join(ROOT, 'assets/logo_hires_crop.png')).toString('base64');
  const rightBlocks = [];

  rightBlocks.push(`
    <div class="card">
      <div class="card-title light">${s.strategyTitle || 'Fon Stratejisi Nedir?'}</div>
      ${s.strategyParagraphs.map(p => `<div class="strategy-text">${p}</div>`).join('')}
      ${s.benchmarkText ? `<div class="benchmark-box">${s.benchmarkText}</div>` : ''}
    </div>`);

  if (s.investmentObjective) {
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light">${s.investmentObjective.title}</div>
      ${s.investmentObjective.paragraphs.map(p => `<div class="strategy-text">${p}</div>`).join('')}
    </div>`);
  }

  if (s.guncelBilgiler) {
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">${s.guncelBilgiler.title}</div>
      ${s.guncelBilgiler.rows.map(r => `<div class="manager-row"><span class="manager-role">${r[0]}</span><span class="manager-name">${r[1]}</span></div>`).join('')}
    </div>`);
  }

  if (s.taxTable) {
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">${s.taxTable.title}</div>
      ${comparisonTableHTML(s.taxTable.columns, s.taxTable.rows)}
      ${s.taxTable.note ? `<div style="font-size:6.4px; color:var(--muted); margin-top:5px; line-height:1.3;">${s.taxTable.note}</div>` : ''}
    </div>`);
  }

  if (s.comparisonTable) {
    rightBlocks.push(`
    <div class="card">
      ${s.comparisonTable.title ? `<div class="card-title light" style="font-size:8.8px;">${s.comparisonTable.title}</div>` : ''}
      ${comparisonTableHTML(s.comparisonTable.columns, s.comparisonTable.rows)}
    </div>`);
  }

  if (s.dividendTable) {
    const half = Math.ceil(s.dividendTable.rows.length / 2);
    const col1 = s.dividendTable.rows.slice(0, half);
    const col2 = s.dividendTable.rows.slice(half);
    const chip = r => `<div class="div-chip"><span>${r[0]}</span><b>%${r[1]}</b></div>`;
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">${s.dividendTable.title}</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 10px;">
        <div>${col1.map(chip).join('')}</div>
        <div>${col2.map(chip).join('')}</div>
      </div>
    </div>`);
  }

  if (s.countryDistribution) {
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">${s.countryDistribution.title}</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">
        ${s.countryDistribution.items.map(c => `
          <div style="text-align:center; width:52px;">
            <div style="width:40px; height:40px; border-radius:50%; background:var(--teal); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:8.5px; margin:0 auto;">%${c.pct}</div>
            <div style="font-size:6.6px; margin-top:2px; color:var(--teal-dark); font-weight:600;">${c.name}</div>
          </div>`).join('')}
      </div>
    </div>`);
  }

  if (s.portfolioPie) {
    const segs = s.portfolioPie.items.map((a, i) => ({ ...a, color: DONUT_PALETTE[i % DONUT_PALETTE.length] }));
    const sz = s.portfolioPieSize || 220;
    const pieSvg = donutChartSVG(segs, { size: sz, strokeWidth: Math.round(sz / 2) });
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">${s.portfolioPie.title}</div>
      <div class="asset-card">
        <div class="donut-wrap" style="width:${sz}px; flex-shrink:0;">${pieSvg}</div>
        <div class="legend">
          ${segs.map(seg => `<div class="legend-item"><span class="legend-dot" style="background:${seg.color}"></span><span class="legend-pct">%${seg.pct}</span> ${seg.label}</div>`).join('')}
        </div>
      </div>
    </div>`);
  }

  if (s.assetAllocation) rightBlocks.push(assetAllocationHTML(s));

  if (s.extraNote) {
    rightBlocks.push(`<div class="card" style="font-size:7.4px; color:var(--muted); line-height:1.4;">${s.extraNote}</div>`);
  }

  if (s.whyInvest) {
    rightBlocks.push(`
    <div class="why-invest">
      <div class="title">${s.whyInvest.title}</div>
      <ul style="list-style:none; margin:0; padding:0;">
        ${s.whyInvest.items.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>`);
  }

  if (s.hasGrowthChart !== false) {
    rightBlocks.push(`
    <div class="card chart-section">
      <div class="card-title light">${s.chartTitle || 'Kuruluştan Beri 100 TL Yatırımım Ne Kazandırdı?'}</div>
      <div id="chart-slot" style="flex:1; min-height:0; display:flex; align-items:stretch;">${chartHtml}</div>
      ${B.chartLegendHTML({ fundCode: s.fundCode, chartCurrency: s.chartCurrency, benchmarkApproximate: false, benchmarkAvailable: monthly.benchmarkAvailable })}
    </div>`);
  }

  if (s.secondChart) {
    rightBlocks.push(`
    <div class="card chart-section-2">
      <div class="card-title light">${s.secondChart.title}</div>
      <div id="chart2-slot" style="flex:1; min-height:0; display:flex; align-items:stretch;">${chart2Html || ''}</div>
    </div>`);
  }

  if (monthly.years && monthly.years.length > 0) {
    rightBlocks.push(`
    <div class="card">
      <div class="card-title light" style="font-size:8.8px;">Fon Performansı</div>
      ${monthlyTableHTML(monthly.years, { dividendByYearMonth: s.dividendByYear, lastDate: monthly.lastDate })}
    </div>`);
  }

  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${s.fundCode} Fon Bilgi Kartı</title>
<style>${B.pageCss()}${extraCss()}
  .col-right { gap:4px; }
  .card { padding:5px 8px; }
  .card-title { margin:-6px -8px 6px -8px; }
  .card-title.light { margin:-1px 0 5px 0; }
  .comparison-table { font-size:7px; }
  .comparison-table th, .comparison-table td { padding:2.5px 4px; }
  .strategy-text { font-size:8px; margin-bottom:3px; }
  .chart-section { min-height:150px; }
  </style>
</head>
<body>
<div class="page">
  ${B.headerHTML(s, logoBase64)}
  <div class="main-grid">
    <div class="col-left">
      ${B.infoCardHTML(s, { lastDate: monthly.lastDate, lastPrice: monthly.lastPrice })}
      ${B.managersCardHTML(s)}
      ${B.riskCardHTML(s)}
      ${B.ctaCardHTML(s)}
    </div>
    <div class="col-right">
      ${rightBlocks.join('\n')}
    </div>
  </div>
  ${B.footerHTML(s)}
</div>
</body>
</html>`;
}

async function renderFund(code, opts = {}) {
  const lc = code.toLowerCase();
  const s = loadStatic(code); // ortak.json + data/<kod>_static.json, rapor tarihi veriden
  const monthly = JSON.parse(fs.readFileSync(path.join(ROOT, seriDosyasi(lc)), 'utf-8'));

  // Uretilen dosyalar out/ altinda toplaniyor: depo kokunde 15 PDF + 15 HTML birikince
  // asil scriptler gorunmez oluyordu. out/ .gitignore'da.
  const CIKTI = path.join(ROOT, 'out');
  fs.mkdirSync(CIKTI, { recursive: true });
  const outHtmlPath = path.join(CIKTI, `output_${lc}.html`);
  // Tarayici disaridan verilirse (coklu render) paylasilir ve burada kapatilmaz:
  // 15 fon icin 15 Chromium baslatmak yerine aile basina bir tane yetiyor.
  const paylasilan = opts.tarayici || null;
  const browser = paylasilan || await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1400 } });

  fs.writeFileSync(outHtmlPath, renderPageHtml(s, monthly, '', ''), 'utf-8');
  await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });

  let growthSvg = '', growth2Svg = '';
  if (s.hasGrowthChart !== false) {
    const box = await page.evaluate(() => {
      const el = document.getElementById('chart-slot');
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    growthSvg = growthChartSVG(monthly.growth, { width: Math.round(box.width), height: Math.max(Math.round(box.height), 130) });
  }
  if (s.secondChart) {
    const box2 = await page.evaluate(() => {
      const el = document.getElementById('chart2-slot');
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    const chart2Data = JSON.parse(fs.readFileSync(path.join(ROOT, `data/${lc}_second_chart.json`), 'utf-8'));
    growth2Svg = growthChartSVG(chart2Data, { width: Math.round(box2.width), height: Math.round(box2.height), showEndLabels: true });
  }

  fs.writeFileSync(outHtmlPath, renderPageHtml(s, monthly, growthSvg, growth2Svg), 'utf-8');
  await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });

  const outPdfPath = path.join(CIKTI, `${code}_Brosur_Modern.pdf`);
  await page.pdf({ path: outPdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await page.close();
  if (!paylasilan) await browser.close();
  console.log('wrote', outPdfPath);
}

if (require.main === module) {
  const kodlar = process.argv.slice(2).filter(a => a.indexOf('--') !== 0);
  if (!kodlar.length) { console.error('Kullanim: node render_a.js <FONKODU> [FONKODU ...]'); process.exit(1); }
  (async () => {
    // Tek tarayici, cok sayfa. Ayrica hata artik butun diziyi durduruyor: eskiden bat
    // icindeki for dongusu her fonu ayri surecte calistirdigi icin bir render coktugunde
    // tur devam ediyor ve gecen turdan kalan bayat PDF yayina gidiyordu.
    const browser = await chromium.launch();
    try {
      for (const kod of kodlar) await renderFund(kod, { tarayici: browser });
    } finally {
      await browser.close();
    }
  })().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { renderFund, monthlyTableHTML, comparisonTableHTML };
