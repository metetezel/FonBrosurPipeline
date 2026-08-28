// Fills each fund's "Net Varlık Tutarı" row from TEFAS instead of hand-copying it out of
// last month's PDF (the only remaining hand-typed number in the info card).
//
// Source: POST https://www.tefas.gov.tr/api/funds/fonBilgiGetir  {"fonKodu":"AAL","dil":"TR"}
//   -> { sonFiyat, payAdet, portBuyukluk, yatirimciSayi, ... }
// portBuyukluk === payAdet * sonFiyat (verified for all 14 funds), i.e. it is the fund's
// total net asset value - the same figure the brochure prints as "Net Varlık Tutarı".
// Cross-checked against the 31.07.2026 brochures: every fund lands in the same range as its
// published value (drift = one month of flows), except PKF - see the note in README.md.
//
// Two TEFAS limitations shape the design:
//   1. fonBilgiGetir only ever returns TODAY's snapshot; there is no historical fund-size
//      endpoint any more (the old BindHistoryInfo is disabled, and ~40 plausible endpoint
//      names were probed without finding a replacement). So every run appends its snapshot
//      to data/tefas_net_varlik_log.json, and month-end values accumulate from now on.
//   2. UANZ has no TEFAS record of its own (it is a share class of ANZ, as the brochures
//      themselves already assume) - it takes ANZ's figure.
//
// Usage:
//   node fetch_tefas_net_varlik.js            fetch + log + write rows whose date matches
//                                             the brochure's own reportDate
//   node fetch_tefas_net_varlik.js --guncel   write the newest snapshot regardless of date
//                                             (for an off-cycle refresh)
//   node fetch_tefas_net_varlik.js --sadece-getir   fetch + log only, touch no static file
const fs = require('fs');
const path = require('path');

const API = 'https://www.tefas.gov.tr/api/funds/';
const FUND_CODES = ['AAL', 'AAS', 'AAV', 'AED', 'ANZ', 'AYA', 'DGH', 'JET', 'PKF', 'PKP', 'RTG', 'TLZ', 'URA', 'YLC'];
const ALIASES = { UANZ: 'ANZ' };
const AYLAR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const DATA_DIR = path.join(__dirname, 'data');
const LOG_FILE = path.join(DATA_DIR, 'tefas_net_varlik_log.json');
const LABEL = 'Net Varlık Tutarı';

async function post(method, body) {
  const res = await fetch(API + method, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.faultCode) throw new Error(method + ' -> ' + json.faultString);
  if (json.errorMessage) throw new Error(method + ' -> ' + json.errorMessage);
  return json.resultList || [];
}

// "31 Temmuz 2026" -> "2026-07-31"
function parseReportDate(s) {
  const parts = String(s || '').trim().split(' ');
  if (parts.length !== 3) return null;
  const ay = AYLAR.indexOf(parts[1]);
  if (ay < 0) return null;
  return parts[2] + '-' + String(ay + 1).padStart(2, '0') + '-' + parts[0].padStart(2, '0');
}

function formatTL(v) {
  return Math.round(v).toLocaleString('tr-TR') + ' TL';
}

async function fetchAll() {
  const snapshot = {};
  for (const code of FUND_CODES) {
    const info = await post('fonBilgiGetir', { fonKodu: code, dil: 'TR' });
    if (!info.length) {
      console.warn(`  ${code}: TEFAS'ta kayıt yok, atlandı`);
      continue;
    }
    const r = info[0];
    // fonBilgiGetir carries no date of its own; the price series gives the value date.
    const seri = await post('fonFiyatBilgiGetir', { fonKodu: code, dil: 'TR', periyod: 1 });
    const son = seri[seri.length - 1];
    const tarih = son ? son.tarih : null;
    const fiyatUyusuyor = son && Math.abs(son.fiyat - r.sonFiyat) < 1e-9;
    if (!tarih) {
      console.warn(`  ${code}: değer tarihi belirlenemedi, atlandı`);
      continue;
    }
    if (!fiyatUyusuyor) {
      console.warn(`  ${code}: uyarı - fiyat serisinin son değeri (${son.fiyat}) sonFiyat (${r.sonFiyat}) ile aynı değil; tarih ${tarih} olarak alındı`);
    }
    snapshot[code] = {
      tarih,
      netVarlik: r.portBuyukluk,
      payAdet: r.payAdet,
      fiyat: r.sonFiyat,
      yatirimciSayi: r.yatirimciSayi,
      fonUnvan: r.fonUnvan,
    };
    console.log(`  ${code.padEnd(5)} ${tarih}  ${formatTL(r.portBuyukluk).padStart(20)}  (${r.yatirimciSayi} yatırımcı)`);
  }
  return snapshot;
}

function appendToLog(snapshot) {
  let log = {};
  if (fs.existsSync(LOG_FILE)) log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  for (const [code, s] of Object.entries(snapshot)) {
    if (!log[s.tarih]) log[s.tarih] = {};
    log[s.tarih][code] = {
      netVarlik: s.netVarlik,
      payAdet: s.payAdet,
      fiyat: s.fiyat,
      yatirimciSayi: s.yatirimciSayi,
    };
  }
  const sorted = {};
  for (const d of Object.keys(log).sort()) sorted[d] = log[d];
  fs.writeFileSync(LOG_FILE, JSON.stringify(sorted, null, 2));
  console.log(`\nGünlük kayıt: ${LOG_FILE} (${Object.keys(sorted).length} tarih)`);
  return sorted;
}

function lookup(log, code, isoDate) {
  const exact = log[isoDate] && log[isoDate][code];
  if (exact) return { entry: exact, tarih: isoDate, exact: true };
  const dates = Object.keys(log).sort().filter(d => log[d][code]);
  if (!dates.length) return null;
  const son = dates[dates.length - 1];
  return { entry: log[son][code], tarih: son, exact: false };
}

function updateStatics(log, { guncel }) {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_static.json')).sort();
  let yazilan = 0;
  console.log('\nKOD    broşürdeki değer          TEFAS değeri          durum');
  for (const file of files) {
    const p = path.join(DATA_DIR, file);
    const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const code = s.fundCode;
    const source = ALIASES[code] || code;
    const row = (s.info || []).find(x => Array.isArray(x) && x[0] === LABEL);
    if (!row) continue;
    const isoDate = parseReportDate(s.reportDate);
    const hit = lookup(log, source, isoDate);
    const mevcut = row[1];
    if (!hit) {
      console.log(`${code.padEnd(6)} ${String(mevcut).padStart(20)}  ${'-'.padStart(20)}  TEFAS kaydı yok`);
      continue;
    }
    const yeni = formatTL(hit.entry.netVarlik);
    const alias = source !== code ? ` (${source}'den)` : '';
    if (hit.exact || guncel) {
      row[1] = yeni;
      fs.writeFileSync(p, JSON.stringify(s, null, 2));
      yazilan++;
      const not = hit.exact ? `yazıldı (${hit.tarih})` : `yazıldı (${hit.tarih}, --guncel)`;
      console.log(`${code.padEnd(6)} ${String(mevcut).padStart(20)}  ${yeni.padStart(20)}  ${not}${alias}`);
    } else {
      console.log(`${code.padEnd(6)} ${String(mevcut).padStart(20)}  ${yeni.padStart(20)}  ATLANDI: elde ${hit.tarih} var, broşür ${isoDate} istiyor${alias}`);
    }
  }
  console.log(`\n${yazilan} dosya güncellendi.`);
  if (!yazilan) {
    console.log('Broşürün rapor tarihine ait kayıt henüz birikmedi. Ay sonunda bu script çalıştıkça');
    console.log('o tarih log\'a girecek ve otomatik yazılacak; şimdi yine de yazdırmak için --guncel.');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const guncel = args.includes('--guncel');
  const sadeceGetir = args.includes('--sadece-getir');
  console.log('TEFAS fon bilgileri çekiliyor...');
  const snapshot = await fetchAll();
  const log = appendToLog(snapshot);
  if (sadeceGetir) return;
  updateStatics(log, { guncel });
}

main().catch(e => { console.error(e); process.exit(1); });
