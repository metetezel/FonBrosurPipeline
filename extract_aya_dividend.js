// Fully self-contained "Kâr Payı Dağıtmasaydı Ne Olurdu?" (dividend-adjusted total-return index)
// computation for AYA. Bypasses the fragile AYA_Temettu_Endeks Power Query chain entirely:
//   - price series comes from our own reliable Fiyat_Sabit_Arsiv (already weekly-updated)
//   - dividend events come straight from the small, stable event table (I:L) in Ferruh Erim's
//     source file (AYA Temettü Dahil Getiri.xlsx) — no Power Query, no manual Excel Refresh needed.
// Formula verified against the existing (pre-computed) AYA_Temettu_Endeks sheet:
//   TemettusuzEndeks(t)  = 100 * Price(t) / Price(t0)
//   TemettuDahilEndeks(t) = TemettuDahilEndeks(t-1) * (Price(t)/Price(t-1)) * (1 + yield(t))
//   where yield(t) is the dividend's "Verim" on its ex-date, else 0.
const ExcelJS = require('exceljs'); // Ferruh Erim'in kaynak dosyasi icin (arsiv artik JSON)
const { fiyatSerisi } = require('./lib/arsiv');
const fs = require('fs');
const path = require('path');

const SOURCE = "//atafiles/Ata.Portföy/Ferruh Erim/Hisse Senedi Fonları/AYA/AYA Temettü Dahil Getiri.xlsx";

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + v * 86400000).toISOString().slice(0, 10);
}

function toNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v.trim().replace(',', '.'));
  return NaN;
}

function cellDateISO(cell) {
  // handles both a plain Date and a cached-formula object ({result: Date})
  const v = (cell && typeof cell === 'object' && 'result' in cell) ? cell.result : cell;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return null;
}

async function extractAyaDividendChart() {
  // 1) dividend events, straight from Ferruh Erim's source file
  const srcWb = new ExcelJS.Workbook();
  await srcWb.xlsx.readFile(SOURCE);
  const srcWs = srcWb.getWorksheet('Temettü Dahil Getiri');
  const events = [];
  srcWs.eachRow((row, idx) => {
    if (idx < 6) return;
    const exDateISO = cellDateISO(row.getCell(9).value);
    const tutarRaw = row.getCell(11).value;
    const verimRaw = row.getCell(12).value;
    if (!exDateISO || tutarRaw == null || verimRaw == null) return;
    const verim = toNumber(verimRaw);
    if (Number.isNaN(verim)) return;
    events.push({ exDate: exDateISO, verim });
  });
  const yieldByDate = new Map(events.map(e => [e.exDate, e.verim]));

  // 2) AYA's own reliable daily price series from our archive
  const priceRows = fiyatSerisi('AYA');
  // Ferruh Erim's source file labels dates one trading day earlier than our own archive for the
  // same price (verified: his "2022-06-29" row = 3.715864 = our archive's 2022-06-30; his
  // "2022-06-30" = 3.540099 = our 2022-07-01). So our archive's true equivalent start date is
  // 2022-06-30, not 2022-06-29.
  const clean = priceRows.filter(r => r.price > 0 && r.date >= '2022-06-30');

  // 3) compute both series
  // Column I (ExTarih) is also expressed in the source file's own (shifted) date frame, same
  // as its price column — so map each event onto the NEXT trading day in our own calendar,
  // matching the same one-trading-day correction verified for the price series.
  const cleanDates = clean.map(r => r.date);
  function nextTradingDayOnOrAfter(dateStr) {
    let lo = 0, hi = cleanDates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (cleanDates[mid] >= dateStr) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans >= 0 ? cleanDates[ans] : null;
  }
  const shiftedYieldByDate = new Map();
  for (const [exDate, verim] of yieldByDate) {
    const nextDay = nextTradingDayOnOrAfter(exDate) === exDate
      ? cleanDates[cleanDates.indexOf(exDate) + 1]
      : nextTradingDayOnOrAfter(exDate);
    if (nextDay) shiftedYieldByDate.set(nextDay, verim);
  }

  const p0 = clean[0].price;
  let tr = 100;
  const growth = clean.map((r, i) => {
    if (i > 0) {
      const prevPrice = clean[i - 1].price;
      const y = shiftedYieldByDate.get(r.date) || 0;
      tr = tr * (r.price / prevPrice) * (1 + y);
    }
    return { date: r.date, fundIndex: tr, benchIndex: (r.price / p0) * 100 };
  });

  return { events, growth, lastDate: clean[clean.length - 1].date };
}

if (require.main === module) {
  extractAyaDividendChart().then(out => {
    console.log('temettü olay sayısı:', out.events.length);
    console.log('son 3 olay:', JSON.stringify(out.events.slice(-3)));
    console.log('ilk nokta:', JSON.stringify(out.growth[0]));
    console.log('son nokta:', JSON.stringify(out.growth[out.growth.length - 1]));
    fs.writeFileSync(path.join(__dirname, 'data', 'aya_second_chart.json'), JSON.stringify(out.growth));
    console.log('yazildi: data/aya_second_chart.json');
  }).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { extractAyaDividendChart };
