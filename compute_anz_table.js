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

async function computeAnzTable(fundCode) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('\\\\atafiles\\Ata.Portföy\\Farshad\\Book2.xlsx');
  const ws = wb.getWorksheet('ANZ'); // ANZ and UANZ share the same underlying eurobond book

  const reportDateCell = ws.getRow(2).getCell(1).value;
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(reportDateCell);
  const asOf = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));

  const bonds = [];
  for (let r = 15; r <= 27; r++) {
    const row = ws.getRow(r);
    const get = c => {
      let v = row.getCell(c).value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      return v;
    };
    const couponRate = get(5);
    const intervalMonths = get(6);
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

  // Row 40 "FON PORTFÖY DEĞERİ" = eurobonds + VIOP teminat (rows 32-34); teminat earns ~0%.
  const teminatRow = ws.getRow(34).getCell(15).value;
  const fonPortfoyDegeri = eurobondMV + teminatRow;

  const fonOrtalamaGetiri = (eurobondYield * eurobondMV) / fonPortfoyDegeri; // teminat contributes 0
  const fonOrtalamaVade = (eurobondVade * eurobondMV) / fonPortfoyDegeri;

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
