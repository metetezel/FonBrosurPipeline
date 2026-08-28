const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { growthChartSVG, donutChartSVG } = require('./lib/charts');
const B = require('./lib/blocks');
const { loadStatic } = require('./lib/static');

const ROOT = __dirname;

function assetAllocationHTML(s, { bordered = true } = {}) {
  if (!s.assetAllocation || s.assetAllocation.length === 0) return '';
  const segs = s.assetAllocation.map((a, i) => ({ ...a, color: i === 0 ? B.TEAL : B.ORANGE }));
  const donutSvg = donutChartSVG(segs, { size: 168, strokeWidth: 22 });
  return `
    <div style="${bordered ? 'margin-top:8px; padding-top:8px; border-top:1px solid var(--line);' : ''}">
      <div style="font-size:8.4px; font-weight:700; color:var(--teal-dark); margin-bottom:6px;">Varlık Dağılımı</div>
      <div class="asset-card">
        <div class="donut-wrap">${donutSvg}</div>
        <div class="legend">
          ${segs.map(seg => `
            <div class="legend-item" style="align-items:flex-start;">
              <span class="legend-dot" style="background:${seg.color}; margin-top:2px;"></span>
              <span>
                <span class="legend-pct">%${seg.pct}</span> ${seg.label}
                ${seg.subItems ? `<ul style="margin:2px 0 0 0; padding-left:12px; font-size:7.6px; color:var(--muted); font-weight:400;">${seg.subItems.map(si => `<li>${si}</li>`).join('')}</ul>` : ''}
              </span>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

function advantagesBodyHTML(s) {
  if (s.advantagesStyle === 'paragraphs') {
    return s.advantages.map(p => `<div class="strategy-text">${p}</div>`).join('');
  }
  return B.listHTML(s.advantages, B.ORANGE);
}

function renderPageHtml(s, growth, chartHtml) {
  const logoBase64 = fs.readFileSync(path.join(ROOT, 'assets/logo_hires_crop.png')).toString('base64');
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<title>${s.fundCode} Fon Bilgi Kartı</title>
<style>${B.pageCss()}</style>
</head>
<body>
<div class="page">
  ${B.headerHTML(s, logoBase64)}

  <div class="main-grid">
    <div class="col-left">
      ${B.infoCardHTML(s, growth)}
      ${B.managersCardHTML(s)}
      ${B.riskCardHTML(s)}
      ${B.ctaCardHTML(s)}
    </div>

    <div class="col-right">
      <div class="card">
        <div class="card-title light">Fon Stratejisi Nedir?</div>
        ${s.strategyParagraphs.map(p => `<div class="strategy-text">${p}</div>`).join('')}
        <div class="benchmark-box">${s.benchmarkText}</div>
      </div>

      ${s.investmentObjective ? `
      <div class="card">
        <div class="card-title light">${s.investmentObjective.title}</div>
        ${s.investmentObjective.paragraphs.map(p => `<div class="strategy-text">${p}</div>`).join('')}
      </div>` : ''}

      ${s.sectors && s.sectors.length > 0 ? `
      <div class="two-col">
        <div class="card">
          <div class="card-title light" style="font-size:8.8px;">Fon Hangi Sektörlere Yatırım Yapıyor?</div>
          ${B.listHTML(s.sectors, B.TEAL)}
        </div>
        <div class="card">
          <div class="card-title light" style="font-size:8.8px;">${s.advantagesTitle || 'Fonun Avantajları Nelerdir?'}</div>
          ${advantagesBodyHTML(s)}
          ${assetAllocationHTML(s)}
        </div>
      </div>` : `
      <div class="card">
        <div class="card-title light">${s.advantagesTitle || "Fon'un Avantajları Nelerdir?"}</div>
        ${advantagesBodyHTML(s)}
      </div>
      ${s.assetAllocation ? `<div class="card">${assetAllocationHTML(s, { bordered: false })}</div>` : ''}
      `}

      ${s.whyInvest ? `
      <div class="card" style="background:var(--teal); color:#fff;">
        <div style="font-size:9.6px; font-weight:700; margin-bottom:6px;">${s.whyInvest.title}</div>
        <ul style="list-style:none; margin:0; padding:0;">
          ${s.whyInvest.items.map(t => `<li style="position:relative; padding:2.5px 0 2.5px 14px; font-size:8.3px; line-height:1.4;"><span style="position:absolute; left:0; top:6px; width:6px; height:6px; border-radius:50%; background:#fff;"></span>${t}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${s.hasGrowthChart === false ? '' : `
      <div class="card chart-section">
        <div class="card-title light">Kuruluştan Beri 100 TL Yatırımım Ne Kazandırdı?</div>
        ${s.chartNote ? `<div class="chart-note">${s.chartNote}</div>` : ''}
        <div id="chart-slot" style="flex:1; min-height:0; display:flex; align-items:stretch;">${chartHtml}</div>
        ${B.chartLegendHTML({ ...s, benchmarkApproximate: growth.benchmarkApproximate, benchmarkAvailable: growth.benchmarkAvailable })}
      </div>`}
    </div>
  </div>

  ${B.footerHTML(s)}
</div>
</body>
</html>`;
}

async function renderFund(code) {
  const lc = code.toLowerCase();
  const growth = JSON.parse(fs.readFileSync(path.join(ROOT, `data/${lc}.json`), 'utf-8'));
  const s = loadStatic(code); // ortak.json + data/<kod>_static.json, rapor tarihi veriden

  const outHtmlPath = path.join(ROOT, `output_${lc}.html`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });

  if (s.hasGrowthChart === false) {
    fs.writeFileSync(outHtmlPath, renderPageHtml(s, growth, ''), 'utf-8');
    await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  } else {
    fs.writeFileSync(outHtmlPath, renderPageHtml(s, growth, ''), 'utf-8');
    await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
    const box = await page.evaluate(() => {
      const el = document.getElementById('chart-slot');
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    console.log(`${code}: measured chart slot`, box);

    const growthSvg = growthChartSVG(growth.growth, { width: Math.round(box.width), height: Math.round(box.height) });
    fs.writeFileSync(outHtmlPath, renderPageHtml(s, growth, growthSvg), 'utf-8');
    await page.goto('file:///' + outHtmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle' });
  }

  const outPdfPath = path.join(ROOT, `${code}_Brosur_Modern.pdf`);
  await page.pdf({ path: outPdfPath, format: 'A4', printBackground: true, margin: { top: 0, bottom: 0, left: 0, right: 0 } });
  await browser.close();
  console.log('wrote', outPdfPath);
}

if (require.main === module) {
  const code = process.argv[2];
  if (!code) { console.error('Usage: node render_b2.js <FUNDCODE>'); process.exit(1); }
  renderFund(code).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { renderFund };
