const ExcelJS = require('exceljs');
const fs = require('fs');

const SRC = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/Proje_Gelistirme/Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx";

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  // serial date fallback
  const epoch = new Date(Date.UTC(1899, 11, 30));
  const d = new Date(epoch.getTime() + v * 86400000);
  return d.toISOString().slice(0, 10);
}

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // 1) JET price series
  const fiyat = wb.getWorksheet('Fiyat_Sabit_Arsiv');
  const priceRows = [];
  fiyat.eachRow((row, idx) => {
    if (idx === 1) return;
    const kod = row.getCell(1).value;
    if (kod !== 'JET') return;
    const tarih = row.getCell(3).value;
    const fiyat_ = row.getCell(4).value;
    priceRows.push({ date: excelDateToISO(tarih), price: Number(fiyat_) });
  });
  priceRows.sort((a, b) => a.date.localeCompare(b.date));

  // Drop pre-inception zero/placeholder rows (documented finding: first 10 rows are 0)
  const cleanPrice = priceRows.filter(r => r.price > 0);

  // 2) Benchmark series: NQUSB502010T (65% weighted component, JET's approx line)
  const bench = wb.getWorksheet('Bench_Sabit_Arsiv');
  const benchRows = [];
  bench.eachRow((row, idx) => {
    if (idx === 1) return;
    const kod = row.getCell(1).value;
    if (kod !== 'NQUSB502010T') return;
    const tarih = row.getCell(3).value;
    const deger = row.getCell(4).value;
    benchRows.push({ date: excelDateToISO(tarih), value: Number(deger) });
  });
  benchRows.sort((a, b) => a.date.localeCompare(b.date));

  // Build lookup map + forward-fill helper
  const benchMap = new Map(benchRows.map(r => [r.date, r.value]));
  const benchDatesSorted = benchRows.map(r => r.date);
  function benchOnOrBefore(dateStr) {
    // binary search for last date <= dateStr
    let lo = 0, hi = benchDatesSorted.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (benchDatesSorted[mid] <= dateStr) { ans = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return ans >= 0 ? benchMap.get(benchDatesSorted[ans]) : null;
  }

  const inceptionDate = cleanPrice[0].date;
  const inceptionPrice = cleanPrice[0].price;
  const inceptionBench = benchOnOrBefore(inceptionDate);

  const growth = cleanPrice.map(r => {
    const bv = benchOnOrBefore(r.date);
    return {
      date: r.date,
      fundIndex: (r.price / inceptionPrice) * 100,
      benchIndex: bv != null ? (bv / inceptionBench) * 100 : null,
    };
  });

  const out = {
    fundCode: 'JET',
    inceptionDate,
    inceptionPrice,
    lastDate: cleanPrice[cleanPrice.length - 1].date,
    lastPrice: cleanPrice[cleanPrice.length - 1].price,
    priceRowCount: cleanPrice.length,
    droppedZeroRows: priceRows.length - cleanPrice.length,
    growth,
  };

  fs.mkdirSync(__dirname + '/data', { recursive: true });
  fs.writeFileSync(__dirname + '/data/jet.json', JSON.stringify(out, null, 2));
  console.log('inception:', inceptionDate, inceptionPrice, 'bench@inception:', inceptionBench);
  console.log('last:', out.lastDate, out.lastPrice);
  console.log('rows:', out.priceRowCount, 'dropped:', out.droppedZeroRows);
  console.log('growth points:', growth.length);
  console.log('sample last 3:', growth.slice(-3));
})();
