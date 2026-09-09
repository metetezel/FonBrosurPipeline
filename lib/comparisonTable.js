// AAL/AAV/AED/DGH broşürlerindeki "Fon Performansı" karşılaştırma tablosunun
// (Haftalık/Aylık/Yıllık/Kuruluştan Beri...) satırlarını canlı arşivden hesaplar.
//
// Neden var: bu tablo Excel'den JSON'a geçişten (28.08.2026) beri hiç dokunulmamış,
// donmuş bir anlık görüntüydü. AED'de bu 09.09.2026'da yakalandı: tablo "Kuruluştan
// Beri Benchmark %171,52" diyordu, gerçek değer aynı veriden hesaplanınca %2955 çıktı
// (17 kat fark) - çünkü büyüme grafiği canlı arşivden çiziliyordu ama bu tablo hiç
// güncellenmiyordu. Kısa vadeli satırlar (Haftalık/Aylık/Yıllık/YBB) günlük arşivden,
// "Kuruluştan Beri" ise büyüme grafiğinin KENDİ ilk/son noktasından hesaplanır - böylece
// tablo ile grafik birbirinden asla sapamaz (aynı kaynak).
const fs = require('fs');
const path = require('path');
const { fiyatSerisi, benchSerisi, onOrBeforeLookup } = require('./arsiv');

const DATA_DIR = path.join(__dirname, '..', 'data');

function fmtPct(x) {
  if (x == null || !Number.isFinite(x)) return null;
  const sign = x < 0 ? '-' : '';
  return sign + '%' + Math.abs(x).toFixed(2).replace('.', ',');
}

function shiftDate(dateStr, { days = 0, months = 0, years = 0 }) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (days) d.setUTCDate(d.getUTCDate() + days);
  if (months) d.setUTCMonth(d.getUTCMonth() + months);
  if (years) d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function lastDayOfPrevYear(dateStr) {
  return (Number(dateStr.slice(0, 4)) - 1) + '-12-31';
}

function priceLookup(fonKodu) {
  return onOrBeforeLookup(fiyatSerisi(fonKodu).map(r => ({ date: r.date, value: r.price })));
}

function benchLookup(symbol) {
  return onOrBeforeLookup(benchSerisi(symbol));
}

/** Tek sembol ya da agirlikli sembol karisiminin iki tarih arasindaki getirisi (%). */
function blendedReturn(components, date0, date1) {
  let total = 0;
  for (const { symbol, weight } of components) {
    const lookup = benchLookup(symbol);
    const v0 = lookup(date0), v1 = lookup(date1);
    if (v0 == null || v1 == null) return null;
    total += weight * (v1 / v0 - 1);
  }
  return total * 100;
}

function fundReturn(fonKodu, date0, date1) {
  const lookup = priceLookup(fonKodu);
  const p0 = lookup(date0), p1 = lookup(date1);
  if (p0 == null || p1 == null) return null;
  return (p1 / p0 - 1) * 100;
}

function loadMonthly(lowerCode) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, lowerCode + '_monthly.json'), 'utf-8'));
}

/** growth[] dizisinin ilk-son noktasindan fon+benchmark kumulatif getirisi (%). */
function sinceInceptionFromGrowth(growth) {
  const first = growth[0], last = growth[growth.length - 1];
  return {
    fund: (last.fundIndex / first.fundIndex - 1) * 100,
    bench: (last.benchIndex / first.benchIndex - 1) * 100,
    firstDate: first.date,
    lastDate: last.date,
  };
}

function lastArchiveDate(fonKodu) {
  const s = fiyatSerisi(fonKodu);
  return s[s.length - 1].date;
}

/** Ortak kisa-vade satirlari: Haftalik/Aylik/Yillik(+YBB), fon + tek/agirlikli benchmark. */
function kisaVadeSatirlari(fonKodu, benchComponents) {
  const t = lastArchiveDate(fonKodu);
  const offsets = {
    haftalik: shiftDate(t, { days: -7 }),
    aylik: shiftDate(t, { months: -1 }),
    yillik: shiftDate(t, { years: -1 }),
    ybb: lastDayOfPrevYear(t),
  };
  const out = {};
  for (const [key, t0] of Object.entries(offsets)) {
    out[key] = {
      fund: fundReturn(fonKodu, t0, t),
      bench: blendedReturn(benchComponents, t0, t),
    };
  }
  out.lastDate = t;
  return out;
}

/** AAL: [Fon, Benchmark] x [Haftalik, Aylik, Yillik, Kurulustan Beri*] */
function aal() {
  const grafik = require('./arsiv').grafikBenchmark('AAL');
  const kv = kisaVadeSatirlari('AAL', grafik);
  const inception = sinceInceptionFromGrowth(loadMonthly('aal').growth);
  return {
    Haftalık: [kv.haftalik.fund, kv.haftalik.bench],
    Aylık: [kv.aylik.fund, kv.aylik.bench],
    Yıllık: [kv.yillik.fund, kv.yillik.bench],
    'Kuruluştan Beri*': [inception.fund, inception.bench],
  };
}

/** AAV: [Fon, BIST 100] x [Haftalik, Aylik, YBB, Kurulustan Beri*, Yillik Ortalama] */
function aav() {
  const grafik = require('./arsiv').grafikBenchmark('AAV');
  const kv = kisaVadeSatirlari('AAV', grafik);
  const growth = loadMonthly('aav').growth;
  const inception = sinceInceptionFromGrowth(growth);
  const gun = (new Date(inception.lastDate) - new Date(inception.firstDate)) / 86400000;
  const yil = gun / 365.25;
  const cagr = v => (Math.pow(1 + v / 100, 1 / yil) - 1) * 100;
  return {
    Haftalık: [kv.haftalik.fund, kv.haftalik.bench],
    Aylık: [kv.aylik.fund, kv.aylik.bench],
    'Yılbaşından Beri': [kv.ybb.fund, kv.ybb.bench],
    'Kuruluştan Beri* (Kümülatif)': [inception.fund, inception.bench],
    'Yıllık Ortalama': [cagr(inception.fund), cagr(inception.bench)],
  };
}

/** AED: [Fon, Benchmark, KYD Mevduat(MEVTL)] x [Haftalik, Aylik, Yillik, Kurulustan Beri**] */
function aed() {
  const grafik = require('./arsiv').grafikBenchmark('AED');
  const kv = kisaVadeSatirlari('AED', grafik);
  const growth = loadMonthly('aed').growth;
  const inception = sinceInceptionFromGrowth(growth);
  const mevtlAt = onOrBeforeLookup(benchSerisi('MEVTL'));
  const mevtlKv = {
    haftalik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { days: -7 }), kv.lastDate),
    aylik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { months: -1 }), kv.lastDate),
    yillik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { years: -1 }), kv.lastDate),
  };
  const mevtlInception = (mevtlAt(inception.lastDate) / mevtlAt(inception.firstDate) - 1) * 100;
  return {
    Haftalık: [kv.haftalik.fund, kv.haftalik.bench, mevtlKv.haftalik],
    Aylık: [kv.aylik.fund, kv.aylik.bench, mevtlKv.aylik],
    Yıllık: [kv.yillik.fund, kv.yillik.bench, mevtlKv.yillik],
    'Kuruluştan Beri**': [inception.fund, inception.bench, mevtlInception],
  };
}

/** DGH: [Fon, KYD Mevduat(MEVTL), KYD Repo Net] x [Haftalik, Aylik, YBB, Son 12 Ay, Kurulustan Beri*] */
function dgh() {
  const grafik = require('./arsiv').grafikBenchmark('DGH'); // = REPNT
  const kv = kisaVadeSatirlari('DGH', grafik);
  const growth = loadMonthly('dgh').growth;
  const inception = sinceInceptionFromGrowth(growth);
  const mevtlAt = onOrBeforeLookup(benchSerisi('MEVTL'));
  const mevtlKv = {
    haftalik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { days: -7 }), kv.lastDate),
    aylik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { months: -1 }), kv.lastDate),
    ybb: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], lastDayOfPrevYear(kv.lastDate), kv.lastDate),
    yillik: blendedReturn([{ symbol: 'MEVTL', weight: 1 }], shiftDate(kv.lastDate, { years: -1 }), kv.lastDate),
  };
  const mevtlInception = (mevtlAt(inception.lastDate) / mevtlAt(inception.firstDate) - 1) * 100;
  return {
    Haftalık: [kv.haftalik.fund, mevtlKv.haftalik, kv.haftalik.bench],
    Aylık: [kv.aylik.fund, mevtlKv.aylik, kv.aylik.bench],
    YBB: [kv.ybb.fund, mevtlKv.ybb, kv.ybb.bench],
    'Son 12 Ay': [kv.yillik.fund, mevtlKv.yillik, kv.yillik.bench],
    'Kuruluştan Beri*': [inception.fund, mevtlInception, inception.bench],
  };
}

function hesapla(fonKodu) {
  const fn = { AAL: aal, AAV: aav, AED: aed, DGH: dgh }[fonKodu];
  if (!fn) return null;
  const raw = fn();
  const out = {};
  for (const [label, values] of Object.entries(raw)) out[label] = values.map(fmtPct);
  return out;
}

module.exports = { hesapla, fmtPct };
