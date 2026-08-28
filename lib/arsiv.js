// JSON veri arşivine tek erişim noktası. 28.08.2026'ya kadar bu veriler
// Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx'ten okunuyordu; workbook aslında TEFAS /
// Borsa İstanbul / Nasdaq API'lerinin ara kopyasıydı (aynı seri hem Excel'de hem
// pipeline'da duruyordu). Artık arşiv doğrudan burada, Excel render yolunda değil.
//
//   data/fiyat_arsiv.json         { FONKODU: [[ISO tarih, fiyat], ...] }
//   data/bench_arsiv.json         { SERIKOD: [[ISO tarih, değer], ...] }
//   data/aylik_getiri_grid.json   { FONKODU: [{ year, months[12], ybb }] }
//   data/benchmark_tanimlari.json { formal: {...}, grafik: {...} }
//
// Büyütme: `node fetch_arsiv.js` (TEFAS + Borsa İstanbul + Nasdaq'tan yeni günleri ekler).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const cache = {};

function oku(dosya) {
  if (!cache[dosya]) cache[dosya] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, dosya), 'utf-8'));
  return cache[dosya];
}

const fiyatArsivi = () => oku('fiyat_arsiv.json');
const benchArsivi = () => oku('bench_arsiv.json');
const aylikIzgara = () => oku('aylik_getiri_grid.json');
const benchmarkTanimlari = () => oku('benchmark_tanimlari.json');

/** Bir fonun fiyat serisi, tarihe göre sıralı: [{date, price}] */
function fiyatSerisi(fonKodu) {
  return (fiyatArsivi()[fonKodu] || []).map(([date, price]) => ({ date, price }));
}

/** Bir endeks/benchmark serisi, tarihe göre sıralı: [{date, value}] */
function benchSerisi(sembol) {
  return (benchArsivi()[sembol] || []).map(([date, value]) => ({ date, value }));
}

/** Fonun resmi karşılaştırma ölçütü bileşenleri (broşür metni + karşılaştırma tablosu). */
function formalBenchmark(fonKodu) {
  return (benchmarkTanimlari().formal || {})[fonKodu] || [];
}

/** Aylık ızgara fonlarının büyüme grafiğinde çizilen seri (formalden farklı olabilir). */
function grafikBenchmark(fonKodu) {
  return (benchmarkTanimlari().grafik || {})[fonKodu] || null;
}

/** dateStr'den küçük/eşit son değeri döndüren ikili arama (seri tarih sıralı olmalı). */
function onOrBeforeLookup(rowsSortedByDate) {
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

module.exports = {
  DATA_DIR,
  fiyatArsivi, benchArsivi, aylikIzgara, benchmarkTanimlari,
  fiyatSerisi, benchSerisi, formalBenchmark, grafikBenchmark, onOrBeforeLookup,
};
