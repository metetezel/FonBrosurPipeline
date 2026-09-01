// Computes ANZ/UANZ's "Fon'un Güncel Bilgileri (Yıllık)" table from raw eurobond
// holdings in Farshad's Book2.xlsx, replacing Elmas Öztürk's manual monthly email.
//
// "Mevduat Eslenigi" (deposit equivalent) is derived, not looked up from a market
// index. Reverse-engineered from ANZ.pdf/UANZ.pdf (31.07.2026) and verified against
// every other figure in the same table:
//     Ortalama Getiri              7,29%
//     - Yonetim komisyonu 0,75  ->  6,54%   (matches)
//     x (1 - 0,175) fon stopaji ->  5,40%   (matches)
//     / (1 - 0,25) mevduat stopaji -> 7,20% (matches the published "Mevduat Eslenigi")
// Meaning: the gross rate a USD deposit would have to pay for the investor to keep the
// same net return as this fund, given deposit interest is withheld at 25% while the fund
// is withheld at 17,5%. Both rates come from the fund's own tax table in
// data/<kod>_static.json ("Doviz Mevduatinda" / "Eurobond Fonu Alirsa", row "1. Stopaj").
// An earlier attempt looked for a KYD USD deposit index (~2,7% at the time, nowhere near
// 7,2%) - that was the wrong track: this row is arithmetic, not market data.
const ExcelJS = require('exceljs');
const { bondYTM, macaulayDuration, yearsBetween } = require('./bond_ytm');

function parseTRDate(s) {
  const [d, m, y] = s.split('.').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const YONETIM_KOMISYONU = { ANZ: 0.0075, UANZ: 0.0075 }; // from data/<kod>_static.json "info"
const STOPAJ_ORANI = 0.175; // from data/<kod>_static.json taxTable, "Eurobond Fonu Alırsa" / 1. Stopaj
const MEVDUAT_STOPAJI = 0.25; // from the same taxTable, "Döviz Mevduatında" / 1. Stopaj

// Book2.xlsx row 25 (XS3183303018) has bad data: issuer blank, coupon recorded as 0.20
// (20%/period - not a real bond, and the "par bond should yield ~its coupon" sanity check
// in bond_ytm.js's accruedInterest() comment was validating against this same bad number).
// Confirmed 31.08.2026 via Cbonds/BondBloX: this ISIN is Türk Eximbank 6.375% 03.10.2030,
// semi-annual, so the per-period rate is 0.031875. Override until Farshad's file is fixed.
const COUPON_OVERRIDES = { XS3183303018: 0.031875 };

// XS2913414384 (Garanti Bankası, matures 03.01.2035) is recorded with intervalMonths=12
// (annual pay) - the only eurobond in the sheet marked that way, every other position is
// semi-annual. Confirmed 01.09.2026 via Cbonds: this is Garanti's 8.125% 03jan2035 USD
// note. The sheet's raw coupon cell (0.0406) is exactly half of 8.125%, the same
// "coupon column holds the per-payment rate" convention used for every semi-annual bond
// here (see bondCashflows() below) - so the interval field, not the coupon field, is the
// data-entry error this time. Treating it as annual paid this bond's 4.06% coupon only
// once a year instead of twice, understating its YTM by ~4 points (3.68% -> 7.68%).
const INTERVAL_OVERRIDES = { XS2913414384: 6 };

function cellVal(row, c) {
  let v = row.getCell(c).value;
  if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
  return v;
}

// Book2.xlsx's row numbers are NOT stable across days - 31.08.2026: Farshad's sheet grew a
// new "VADELİ DÖVİZ MEVDUATI" section above the eurobond block, shifting every eurobond row
// down by 4 (was 15-27, now 19-31) and breaking a previous hardcoded range. Find sections by
// their column-1 label instead of by row number.
function findRowByLabel(ws, label, maxRow = 60) {
  for (let r = 1; r <= maxRow; r++) {
    if (cellVal(ws.getRow(r), 1) === label) return r;
  }
  throw new Error(`Book2.xlsx ANZ sekmesinde "${label}" satırı bulunamadı`);
}

async function computeAnzTable(fundCode) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('\\\\atafiles\\Ata.Portföy\\Farshad\\Book2.xlsx');
  const ws = wb.getWorksheet('ANZ'); // ANZ and UANZ share the same underlying eurobond book

  const reportDateCell = ws.getRow(2).getCell(1).value;
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(reportDateCell);
  const asOf = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  const bondSectionStart = findRowByLabel(ws, 'J.YABANCI TAHVİL') + 1;
  const bonds = [];
  for (let r = bondSectionStart; cellVal(ws.getRow(r), 4); r++) {
    const row = ws.getRow(r);
    const get = c => cellVal(row, c);
    const isin = get(4);
    const couponRate = COUPON_OVERRIDES[isin] ?? get(5);
    const intervalMonths = INTERVAL_OVERRIDES[isin] ?? get(6);
    const maturity = parseTRDate(get(3));
    const price = get(13);
    const marketValue = get(15);
    const bond = { couponRate, intervalMonths, maturity, price };
    const ytm = bondYTM(bond, asOf);
    const duration = macaulayDuration(bond, asOf, ytm);
    bonds.push({ maturity, price, marketValue, ytm, duration, years: yearsBetween(asOf, maturity) });
  }

  const eurobondMV = bonds.reduce((s, b) => s + b.marketValue, 0);
  const eurobondYield = bonds.reduce((s, b) => s + b.ytm * b.marketValue, 0) / eurobondMV;
  const eurobondVade = bonds.reduce((s, b) => s + b.duration * b.marketValue, 0) / eurobondMV;

  // "VADELİ DÖVİZ MEVDUATI" (new as of 31.08.2026): a USD term deposit at Türkiye Finans
  // Katılım. Column 13 ("price") here isn't a clean-price-per-100 like the bonds' - it's
  // already FX-converted and includes accrued interest (100 face x (1 + accrued) x
  // USD/TRY), confirmed 01.09.2026 by reconstructing it from columns 5 (rate, 0.047),
  // 3 (maturity) and 15 (market value: matches face x price/100 to 6 sig figs). Unlike a
  // bond it has one cashflow (principal + simple interest at maturity), so its own "yield"
  // is just the stated rate and its "duration" is the time to maturity - no YTM solve
  // needed. Previously this position's ~7% portfolio share was implicitly earning 0% in
  // the yield average (only silently included via the denominator below), understating
  // fonOrtalamaGetiri/fonOrtalamaVade.
  const depositItems = [];
  const depositSectionStart = findRowByLabel(ws, 'VADELİ DÖVİZ MEVDUATI') + 1;
  for (let r = depositSectionStart; cellVal(ws.getRow(r), 2); r++) {
    const row = ws.getRow(r);
    const get = c => cellVal(row, c);
    depositItems.push({
      yield: get(5),
      duration: yearsBetween(asOf, parseTRDate(get(3))),
      marketValue: get(15),
    });
  }

  const yieldedItems = [...bonds.map(b => ({ yield: b.ytm, duration: b.duration, marketValue: b.marketValue })), ...depositItems];
  const yieldedMV = yieldedItems.reduce((s, b) => s + b.marketValue, 0);
  const yieldedYield = yieldedItems.reduce((s, b) => s + b.yield * b.marketValue, 0) / yieldedMV;
  const yieldedVade = yieldedItems.reduce((s, b) => s + b.duration * b.marketValue, 0) / yieldedMV;

  // "FON PORTFÖY DEĞERİ" is the sheet's own grand total across every asset category (eurobonds,
  // the deposit above, and VIOP teminat). Reading it directly (rather than re-summing named
  // categories ourselves) means a new category Farshad adds later doesn't silently fall out of
  // the total. Remaining simplification: VIOP teminat (idle margin, a small residual of
  // fonPortfoyDegeri not covered by yieldedMV) is still implicitly treated as earning 0%,
  // which is roughly right for margin cash.
  const fonPortfoyDegeriRow = findRowByLabel(ws, 'FON PORTFÖY DEĞERİ');
  const fonPortfoyDegeri = cellVal(ws.getRow(fonPortfoyDegeriRow), 15);

  const fonOrtalamaGetiri = (yieldedYield * yieldedMV) / fonPortfoyDegeri;
  const fonOrtalamaVade = (yieldedVade * yieldedMV) / fonPortfoyDegeri;

  const komisyon = YONETIM_KOMISYONU[fundCode];
  const komisyonSonrasi = fonOrtalamaGetiri - komisyon;
  const netGetiri = komisyonSonrasi * (1 - STOPAJ_ORANI);
  // The brochure divides the *displayed* (2-decimal) net return, so round first to
  // reproduce the published figure exactly (5,40 / 0,75 = 7,20, not 5,3955 -> 7,19).
  const netGetiriGosterilen = Math.round(netGetiri * 10000) / 10000;
  const mevduatEsligi = netGetiriGosterilen / (1 - MEVDUAT_STOPAJI);

  return {
    asOf: asOf.toISOString().slice(0, 10),
    eurobondlarinOrtalamaGetirisi: eurobondYield,
    fonunOrtalamaGetirisi: fonOrtalamaGetiri,
    yonetimKomisyonu: komisyon,
    yonetimKomisyonuSonrasi: komisyonSonrasi,
    netGetiriStopajSonrasi: netGetiri,
    fonunOrtalamaVadesi: fonOrtalamaVade,
    mevduatStopaji: MEVDUAT_STOPAJI,
    mevduatEsligi,
  };
}

async function main() {
  const fundCode = process.argv[2] || 'ANZ';
  const r = await computeAnzTable(fundCode);
  const pct = v => (v * 100).toFixed(2).replace('.', ',') + '%';
  console.log(`${fundCode} — rapor tarihi: ${r.asOf}`);
  console.log('Eurobondların Ortalama Getirisi:', pct(r.eurobondlarinOrtalamaGetirisi));
  console.log('Fonun Ortalama Getirisi:        ', pct(r.fonunOrtalamaGetirisi));
  console.log('Yönetim Komisyonu:              ', pct(r.yonetimKomisyonu));
  console.log('Yönetim Komisyonu Sonrası:      ', pct(r.yonetimKomisyonuSonrasi));
  console.log('Net Getiri (Stopaj Sonrası):    ', pct(r.netGetiriStopajSonrasi));
  console.log('Fonun Ortalama Vadesi (Yıl):    ', r.fonunOrtalamaVadesi.toFixed(2));
  console.log('Mevduat Eşleniği:               ', pct(r.mevduatEsligi));
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { computeAnzTable };
