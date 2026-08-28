// TEK SEFERLİK GÖÇ: Excel arşivindeki 4 sayfayı JSON'a dondurur.
//
// Neden: fiyat serisi TEFAS'ın, KYD/BIST endeksleri Borsa İstanbul'un, Nasdaq endeksleri
// indexes.nasdaq.com'un API'sinden geliyor — workbook bu API'lerin ara kopyasıydı ve aynı
// veri hem Excel'de hem pipeline'da duruyordu. Bu göçten sonra render yolu Excel'e hiç
// dokunmuyor; arşivi büyütmek de `fetch_arsiv.js` ile doğrudan API'lerden yapılıyor.
//
// Üretilen dosyalar (hepsi kompakt: [tarih, değer] çiftleri):
//   data/fiyat_arsiv.json           { FONKODU: [[ISO tarih, fiyat], ...] }
//   data/bench_arsiv.json           { SERIKOD: [[ISO tarih, değer], ...] }
//   data/aylik_getiri_grid.json     { FONKODU: [{ year, months[12], ybb }] }
//   data/benchmark_tanimlari.json   { formal: {...}, grafik: {...} }
//
// Kullanım: node migrate_excel_to_json.js   (bir kez; sonuçlar git'e alınır)
const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');

const SRC = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/Proje_Gelistirme/Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx";
const DATA_DIR = path.join(__dirname, 'data');

// Benchmark_Tanimlari'nın Sembol sütunu hâlâ fiyat endekslerini gösteriyor (Yahoo dönemi
// kalıntısı); göç sırasında kalıcı olarak gerçek "Getiri" kodlarına çeviriyoruz, böylece
// extract_fund.js'teki geçici GETIRI_OVERRIDES köprüsü ortadan kalkıyor.
const GETIRI_OVERRIDES = {
  'XU100.IS': 'XU100_CFNNTLTL', 'XU030.IS': 'XU030_CFNNTLTL', 'XUTEK.IS': 'XUTEK_CFNNTLTL',
  'XBLSM.IS': 'XBLSM_CFNNTLTL', 'XELKT.IS': 'XELKT_CFNNTLTL', 'XGIDA.IS': 'XGIDA_CFNNTLTL',
  'XTM25.IS': 'XTM25_CFNNTLTL',
};

// build_monthly_data.js'teki BENCH haritası: aylık ızgara fonlarının BÜYÜME GRAFİĞİNDE
// çizilen seri. Formal karşılaştırma ölçütünden bilerek farklı olabiliyor (ör. AYA'nın
// grafiği orijinal PDF'teki gibi BIST-100 Getiri'ye karşı çiziliyor, formal ölçütü
// Temettü-25 olmasına rağmen — Temettü-25 AYA'nın 2010 kuruluşuna kadar gitmiyor).
const GRAFIK_BENCH = {
  AAL: [{ weight: 0.4, symbol: 'TKISA' }, { weight: 0.6, symbol: 'REPBR' }],
  DGH: [{ weight: 1, symbol: 'REPNT' }],
  AYA: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }],
  AAV: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }],
  AED: [{ weight: 0.55, symbol: 'XU100_CFNNTLTL' }, { weight: 0.15, symbol: 'REPBR' }, { weight: 0.15, symbol: 'EUSTL' }, { weight: 0.15, symbol: 'ATORT' }],
  TLZ: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }],
};

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + v * 86400000).toISOString().slice(0, 10);
}

function cellValue(v) {
  return (v && typeof v === 'object' && v.result !== undefined) ? v.result : v;
}

function yaz(dosya, obj) {
  const p = path.join(DATA_DIR, dosya);
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log(`  ${dosya}: ${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB`);
}

(async () => {
  console.log('Excel okunuyor (5,5 MB, biraz sürer)...');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  // 1) Fiyat arşivi
  const fiyat = {};
  wb.getWorksheet('Fiyat_Sabit_Arsiv').eachRow((row, i) => {
    if (i === 1) return;
    const kod = row.getCell(1).value;
    if (!kod) return;
    (fiyat[kod] = fiyat[kod] || []).push([excelDateToISO(row.getCell(3).value), Number(row.getCell(4).value)]);
  });
  for (const k of Object.keys(fiyat)) fiyat[k].sort((a, b) => a[0].localeCompare(b[0]));

  // 2) Benchmark arşivi
  const bench = {};
  wb.getWorksheet('Bench_Sabit_Arsiv').eachRow((row, i) => {
    if (i === 1) return;
    const kod = row.getCell(1).value;
    if (!kod) return;
    (bench[kod] = bench[kod] || []).push([excelDateToISO(row.getCell(3).value), Number(row.getCell(4).value)]);
  });
  for (const k of Object.keys(bench)) bench[k].sort((a, b) => a[0].localeCompare(b[0]));

  // 3) Aylık getiri ızgarası (2021 öncesi aylık getiriler — hiçbir API'de yok, asıl dondurulan bu)
  const grid = {};
  wb.getWorksheet('Aylik_Getiri_Grid').eachRow((row, i) => {
    if (i === 1) return;
    const kod = row.getCell(1).value;
    if (!kod) return;
    const months = Array.from({ length: 12 }, (_, m) => {
      const v = cellValue(row.getCell(3 + m).value);
      return typeof v === 'number' ? v : null;
    });
    (grid[kod] = grid[kod] || []).push({ year: Number(row.getCell(2).value), months, ybb: cellValue(row.getCell(15).value) });
  });
  for (const k of Object.keys(grid)) grid[k].sort((a, b) => a.year - b.year);

  // 4) Benchmark tanımları
  const formal = {};
  wb.getWorksheet('Benchmark_Tanimlari').eachRow((row, i) => {
    if (i === 1) return;
    const kod = row.getCell(1).value;
    if (!kod) return;
    const ham = row.getCell(6).value;
    (formal[kod] = formal[kod] || []).push({
      weight: Number(row.getCell(3).value),
      name: row.getCell(4).value,
      sourceType: row.getCell(5).value,
      symbol: GETIRI_OVERRIDES[ham] || ham,
    });
  });

  console.log('Yazılıyor:');
  yaz('fiyat_arsiv.json', fiyat);
  yaz('bench_arsiv.json', bench);
  yaz('aylik_getiri_grid.json', grid);
  yaz('benchmark_tanimlari.json', {
    aciklama: 'formal = fonun resmi karşılaştırma ölçütü (broşür metni ve karşılaştırma tablosu). grafik = aylık ızgara fonlarının büyüme grafiğinde çizilen seri; formalden bilerek farklı olabilir.',
    formal,
    grafik: GRAFIK_BENCH,
  });

  console.log('\nÖzet:');
  console.log('  fiyat serisi   :', Object.keys(fiyat).length, 'fon,', Object.values(fiyat).reduce((s, a) => s + a.length, 0), 'satır');
  console.log('  benchmark serisi:', Object.keys(bench).length, 'sembol,', Object.values(bench).reduce((s, a) => s + a.length, 0), 'satır');
  console.log('  aylık ızgara   :', Object.keys(grid).length, 'fon,', Object.values(grid).reduce((s, a) => s + a.length, 0), 'yıl satırı');
  console.log('  benchmark tanımı:', Object.keys(formal).length, 'fon');
})();
