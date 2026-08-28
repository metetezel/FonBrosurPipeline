// Bir fonun fiyat serisini ve ağırlıklı bileşik karşılaştırma ölçütünü JSON arşivinden
// çıkarıp data/<kod>.json'a yazar. (28.08.2026'ya kadar bu veri Excel'den okunuyordu;
// bkz. lib/arsiv.js — render yolundaki Excel bağımlılığı kaldırıldı.)
//
// Karşılaştırma ölçütü: fonun bileşenlerinden arşivde verisi olanlar ağırlıklarına göre
// yeniden normalize edilip kuruluş tarihinde 100'e endeksleniyor. Bir/birkaç bileşen
// eksikse mevcut olanlarla "yaklaşık" bir çizgi üretiliyor, hiçbiri yoksa çizgi yok —
// durum benchmarkAvailable / benchmarkMissing / benchmarkApproximate alanlarında.
const fs = require('fs');
const path = require('path');
const { fiyatSerisi, benchSerisi, formalBenchmark, onOrBeforeLookup } = require('./lib/arsiv');

async function extractFund(fundCode) {
  // 1) fon fiyat serisi (kuruluş öncesi sahte "0" satırları filtrelenir)
  const priceRows = fiyatSerisi(fundCode);
  const cleanPrice = priceRows.filter(r => r.price > 0);
  const droppedZeroRows = priceRows.length - cleanPrice.length;
  if (cleanPrice.length === 0) throw new Error(`No price rows found for ${fundCode}`);

  // 2) bu fonun karşılaştırma ölçütü bileşenleri
  const components = formalBenchmark(fundCode);

  // 3) hangi bileşenlerin arşivde verisi var?
  const benchByCode = new Map();
  for (const c of components) {
    const rows = benchSerisi(c.symbol);
    if (rows.length) benchByCode.set(c.symbol, rows);
  }

  const inceptionDate = cleanPrice[0].date;
  const inceptionPrice = cleanPrice[0].price;

  const available = components.filter(c => benchByCode.has(c.symbol) && benchByCode.get(c.symbol).length > 0);
  const missing = components.filter(c => !available.includes(c));
  const weightSum = available.reduce((s, c) => s + c.weight, 0);

  let growth = [];
  const benchmarkApproximate = missing.length > 0;
  if (available.length > 0) {
    const lookups = available.map(c => ({ c, fn: onOrBeforeLookup(benchByCode.get(c.symbol)) }));
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
    console.log(`  benchmark: available=${JSON.stringify(out.benchmarkAvailable)} missing=${JSON.stringify(out.benchmarkMissing)} approximate=${out.benchmarkApproximate}`);
  }).catch(err => { console.error(err); process.exit(1); });
}

module.exports = { extractFund };
