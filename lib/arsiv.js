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

/**
 * RAPOR KESİMİ — broşür verisi bugün DAHİL, arşivde gerçekten mevcut olan en son güne
 * kadar gider.
 *
 * Eskiden bugünün satırı okuma anında bilerek atılıyordu ("her zaman T-1"): amaç, tur
 * perşembe öğleden sonra çalıştığında TEFAS o günü henüz yayınlamamışsa bile sonucun
 * öngörülebilir kalmasıydı. Ama bu, arşivde o günün fiyatı ZATEN VARSA bile onu atıyordu
 * (Mete, 01.09.2026: pazartesi üretilen bir broşürde rozet "31 Ağustos" derken fiyat
 * cumadan - 3 gün geriden - gösteriliyordu, halbuki pazartesinin fiyatı arşivde hazırdı).
 * Artık kesim yok: fiyatSerisi/benchSerisi arşivde ne kadar taze veri varsa onu döner.
 * TEFAS bugünü henüz yayınlamadıysa zaten arşivde bugünün satırı da olmaz, sonuç kendi
 * kendine bir önceki iş gününe düşer - aynı güvenlik, gereksiz gecikme olmadan.
 *
 * Test/yeniden üretim için RAPOR_TARIHI ortam değişkeniyle sabit bir güne kilitlenebilir
 * (ör. RAPOR_TARIHI=2026-08-26, bu tarih DAHİL).
 */
function kesimTarihi() {
  const sabit = process.env.RAPOR_TARIHI;
  if (sabit) return sabit;
  const d = new Date();  // yerel takvim gunu; toISOString() UTC oldugu icin gece kayardi
  const p2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;  // bugün DAHİL
}

function kesimFiltresi(date) {
  return date <= kesimTarihi();
}

/** Bir fonun fiyat serisi (T-1'e kadar), tarihe göre sıralı: [{date, price}] */
function fiyatSerisi(fonKodu) {
  return (fiyatArsivi()[fonKodu] || [])
    .filter(([date]) => kesimFiltresi(date))
    .map(([date, price]) => ({ date, price }));
}

/** Bir endeks/benchmark serisi (T-1'e kadar), tarihe göre sıralı: [{date, value}] */
function benchSerisi(sembol) {
  return (benchArsivi()[sembol] || [])
    .filter(([date]) => kesimFiltresi(date))
    .map(([date, value]) => ({ date, value }));
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
  fiyatArsivi, benchArsivi, aylikIzgara, benchmarkTanimlari, kesimTarihi, kesimFiltresi,
  fiyatSerisi, benchSerisi, formalBenchmark, grafikBenchmark, onOrBeforeLookup,
};
