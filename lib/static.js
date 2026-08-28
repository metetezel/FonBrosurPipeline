// Fon broşürlerinin statik içeriğini yükler: şirket geneli olan her şey tek bir
// data/ortak.json dosyasında, sadece fona özgü olan data/<kod>_static.json'da.
//
// Neden: disclaimer (1.545 karakter), iletişim satırı, CTA butonları ve risk yöneticisi
// 15 dosyada birebir kopyalanıyordu — 76 KB statik içeriğin 26 KB'si aynı metnin 15
// kopyasıydı. Disclaimer'da tek kelime değişse 15 dosya elle düzenlenecekti.
//
// Birleştirme kuralları:
//   - Üst seviye alanlar (disclaimer, contact, cta): fon dosyası tanımlamışsa o kazanır,
//     yoksa ortak.json'dan gelir.
//   - info satırları: değeri `null` olan satır ortak.json'un `infoOrtak` haritasından
//     doldurulur (satır sırası fon dosyasında kalır). Fon kendi değerini yazmışsa
//     (ör. PKP'nin denetçisi, JET'in "T. İş Bankası A.Ş. / Euroclear" saklaması) o kalır.
//   - managers: ortak.json'daki `managerOrtak` kayıtları listenin sonuna eklenir
//     (fon dosyası aynı rolü tanımlamışsa eklenmez).
//   - reportDate: elle yazılmaz, verinin son gününden türetilir (bkz. reportDateFor).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

/** "2026-07-31" -> "31 Temmuz 2026" */
function isoToTR(iso) {
  const [y, m, d] = iso.split('-');
  return `${Number(d)} ${AYLAR[Number(m) - 1]} ${y}`;
}

/**
 * Broşürün rapor tarihi = verinin son günü. Elle güncellenmesi gereken tek alan buydu
 * (15 dosyada ayrı ayrı); artık arşivden geliyor, ay değiştiğinde kendiliğinden ilerler.
 */
function reportDateFor(code) {
  const lc = code.toLowerCase();
  for (const f of [`${lc}.json`, `${lc}_monthly.json`]) {
    const p = path.join(DATA_DIR, f);
    if (!fs.existsSync(p)) continue;
    const d = readJSON(p);
    if (d.lastDate) return { iso: d.lastDate, tr: isoToTR(d.lastDate) };
  }
  throw new Error(`${code}: rapor tarihi türetilemedi (data/${lc}.json veya ${lc}_monthly.json yok / lastDate taşımıyor)`);
}

function loadStatic(code) {
  const lc = code.toLowerCase();
  const ortak = readJSON(path.join(DATA_DIR, 'ortak.json'));
  const s = readJSON(path.join(DATA_DIR, `${lc}_static.json`));

  for (const k of ['disclaimer', 'contact', 'cta']) {
    if (s[k] === undefined && ortak[k] !== undefined) s[k] = ortak[k];
  }

  if (Array.isArray(s.info)) {
    s.info = s.info.map(row => {
      if (!Array.isArray(row) || row[1] !== null) return row;
      const v = (ortak.infoOrtak || {})[row[0]];
      if (v === undefined) throw new Error(`${code}: "${row[0]}" satırı null ama ortak.json'da karşılığı yok`);
      return [row[0], v];
    });
  }

  for (const m of (ortak.managerOrtak || [])) {
    if (!(s.managers || []).some(x => x.role === m.role)) (s.managers = s.managers || []).push({ ...m });
  }

  if (!s.reportDate) s.reportDate = ortak.reportDate || reportDateFor(code).tr;
  return s;
}

/**
 * Verinin son günü bir "kapanmış ay"ı mı gösteriyor?
 *
 * Broşür her zaman ay sonu olmalı, ama rapor tarihi verinin son gününden geldiği için
 * turu ay ortasında çalıştırmak sessizce ay ortası tarihli broşür üretirdi. TEFAS verisi
 * pratikte T-1 mantığıyla geliyor (sabah çalıştırınca elde bir önceki iş gününün fiyatı
 * olur), yani ayın ilk iş günü sabahı çalıştırıldığında son veri o ayın son iş günüdür.
 *
 * "Kapandı" sayılma koşulu: son veri günü, bugünün ayından ÖNCEKİ bir aya ait olmalı
 * (ya da tam olarak kendi ayının son takvim günü olmalı).
 */
function ayKapandiMi(iso, bugun = new Date()) {
  const [y, m, d] = iso.split('-').map(Number);
  const buY = bugun.getFullYear(), buM = bugun.getMonth() + 1;
  if (y < buY || (y === buY && m < buM)) return true;          // gecmis bir ay
  const ayinSonGunu = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d === ayinSonGunu;                                     // ayin son takvim gunu
}

module.exports = { loadStatic, reportDateFor, isoToTR, ayKapandiMi };
