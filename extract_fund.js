const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/Proje_Gelistirme/Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx";
const BIST_CACHE_PATH = path.join(__dirname, 'data', 'bist_indices_cache.json');

function normalizeSymbol(sym) {
  return String(sym).replace(/\.IS$/i, '');
}

// Benchmark_Tanimlari (in the live archive) still points BIST-index components at their price-only
// proxy (e.g. XUTEK.IS, sourced from Yahoo). We now have the TRUE "Getiri" (total-return,
// dividend-reinvested) series for all of these via Borsa İstanbul's own API — upgrade to those
// transparently here rather than waiting for the archive's own Sembol column to be edited.
const GETIRI_OVERRIDES = {
  'XU100.IS': 'XU100_CFNNTLTL',
  'XU030.IS': 'XU030_CFNNTLTL',
  'XUTEK.IS': 'XUTEK_CFNNTLTL',
  'XBLSM.IS': 'XBLSM_CFNNTLTL',
  'XELKT.IS': 'XELKT_CFNNTLTL',
  'XGIDA.IS': 'XGIDA_CFNNTLTL',
  'XTM25.IS': 'XTM25_CFNNTLTL',
};

function loadBistCache() {
  if (!fs.existsSync(BIST_CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(BIST_CACHE_PATH, 'utf-8'));
}

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + v * 86400000).toISOString().slice(0, 10);
}

function buildOnOrBeforeLookup(rowsSortedByDate) {
  const dates = rowsSortedByDate.map(r => r.date);
  const map = new Map(rowsSortedByDate.map(r => [r.date, r.value]));
  return function (dateStr) {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= dateStr) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? map.get(dates[ans]) : null;
  };
}

async function extractFund(fundCode) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // 1) fund price series
  const fiyat = wb.getWorksheet('Fiyat_Sabit_Arsiv');
  const priceRows = [];
  fiyat.eachRow((row, idx) => {
    if (idx === 1) return;
    if (row.getCell(1).value !== fundCode) return;
    priceRows.push({ date: excelDateToISO(row.getCell(3).value), price: Number(row.getCell(4).value) });
  });
  priceRows.sort((a, b) => a.date.localeCompare(b.date));
  const cleanPrice = priceRows.filter(r => r.price > 0);
  const droppedZeroRows = priceRows.length - cleanPrice.length;

  if (cleanPrice.length === 0) {
    throw new Error(`No price rows found for ${fundCode}`);
  }

  // 2) benchmark components for this fund
  const defSheet = wb.getWorksheet('Benchmark_Tanimlari');
  const components = [];
  defSheet.eachRow((row, idx) => {
    if (idx === 1) return;
    if (row.getCell(1).value !== fundCode) return;
    const rawSymbol = row.getCell(6).value;
    components.push({
      weight: Number(row.getCell(3).value),
      name: row.getCell(4).value,
      sourceType: row.getCell(5).value,
      symbol: GETIRI_OVERRIDES[rawSymbol] || rawSymbol,
    });
  });

  // 3) which components have deep archive data in Bench_Sabit_Arsiv?
  const bench = wb.getWorksheet('Bench_Sabit_Arsiv');
  const benchByCode = new Map(); // symbol -> sorted [{date, value}]
  bench.eachRow((row, idx) => {
    if (idx === 1) return;
    const code = row.getCell(1).value;
    if (!components.some(c => c.symbol === code)) return;
    if (!benchByCode.has(code)) benchByCode.set(code, []);
    benchByCode.get(code).push({ date: excelDateToISO(row.getCell(3).value), value: Number(row.getCell(4).value) });
  });
  benchByCode.forEach(rows => rows.sort((a, b) => a.date.localeCompare(b.date)));

  // 3b) fall back to the Borsa İstanbul graphic.php cache (data/bist_indices_cache.json) for
  // components that have no deep archive in Excel yet (previously "anlık-only" KYD/BIST series).
  const bistCache = loadBistCache();
  const usedBistCache = [];
  for (const c of components) {
    if (benchByCode.has(c.symbol)) continue;
    const key = normalizeSymbol(c.symbol);
    if (bistCache[key] && bistCache[key].length > 0) {
      benchByCode.set(c.symbol, bistCache[key].slice().sort((a, b) => a.date.localeCompare(b.date)));
      usedBistCache.push(c.symbol);
    }
  }

  const inceptionDate = cleanPrice[0].date;
  const inceptionPrice = cleanPrice[0].price;

  const available = components.filter(c => benchByCode.has(c.symbol) && benchByCode.get(c.symbol).length > 0);
  const missing = components.filter(c => !available.includes(c));
  const weightSum = available.reduce((s, c) => s + c.weight, 0);

  let growth = [];
  let benchmarkApproximate = missing.length > 0;
  if (available.length > 0) {
    const lookups = available.map(c => ({ c, fn: buildOnOrBeforeLookup(benchByCode.get(c.symbol)) }));
    const inceptionVals = lookups.map(l => l.fn(inceptionDate));
    growth = cleanPrice.map(r => {
      let compositeIndex = null;
      if (inceptionVals.every(v => v != null)) {
        compositeIndex = lookups.reduce((sum, l, i) => {
          const v = l.fn(r.date);
          if (v == null || inceptionVals[i] == null) return sum;
          const normW = l.c.weight / weightSum;
          return sum + normW * (v / inceptionVals[i]) * 100;
        }, 0);
      }
      return {
        date: r.date,
        fundIndex: (r.price / inceptionPrice) * 100,
        benchIndex: compositeIndex,
      };
    });
  } else {
    growth = cleanPrice.map(r => ({ date: r.date, fundIndex: (r.price / inceptionPrice) * 100, benchIndex: null }));
  }

  const out = {
    fundCode,
    inceptionDate,
    inceptionPrice,
    lastDate: cleanPrice[cleanPrice.length - 1].date,
    lastPrice: cleanPrice[cleanPrice.length - 1].price,
    priceRowCount: cleanPrice.length,
    droppedZeroRows,
    benchmarkComponents: components,
    benchmarkAvailable: available.map(c => c.symbol),
    benchmarkMissing: missing.map(c => c.symbol),
    benchmarkApproximate,
    benchmarkFromBistCache: usedBistCache,
    growth,
  };

  const outDir = path.join(__dirname, 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `${fundCode.toLowerCase()}.json`), JSON.stringify(out, null, 2));
  return out;
}

if (require.main === module) {
  const code = process.argv[2];
  if (!code) {
    console.error('Usage: node extract_fund.js <FUNDCODE>');
    process.exit(1);
  }
  extractFund(code).then(out => {
    console.log(`${code}: inception ${out.inceptionDate} @ ${out.inceptionPrice}, last ${out.lastDate} @ ${out.lastPrice}`);
    console.log(`  rows: ${out.priceRowCount} (dropped ${out.droppedZeroRows} zero rows)`);
    console.log(`  benchmark: available=${JSON.stringify(out.benchmarkAvailable)} missing=${JSON.stringify(out.benchmarkMissing)} approximate=${out.benchmarkApproximate} fromBistCache=${JSON.stringify(out.benchmarkFromBistCache)}`);
  }).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { extractFund };
