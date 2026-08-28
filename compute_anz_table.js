// Computes ANZ/UANZ's "Fon'un Güncel Bilgileri (Yıllık)" table from raw eurobond
// holdings in Farshad's Book2.xlsx, replacing Elmas Öztürk's manual monthly email.
//
// Not automated here (needs a data source beyond Book2.xlsx / not reliably derivable):
//   - Mevduat Eşleniği: a USD deposit-equivalent market rate. The only cached KYD
//     deposit series we have (MEVUS = "BIST-KYD 1 Aylık Mevduat USD (TL)") implies
//     an annualized yield of ~2.7% as of the report date, nowhere near the ~7.2%
//     the brochure shows — it's very likely the wrong index (ANZ's own strategy
//     text distinguishes a TL-converted index from a pure-USD "KYD 1 Aylık Gösterge
//     Dolar Mevduat Endeksi", and we may only have cached the former). Left manual
//     until the correct series is identified.
const ExcelJS = require('exceljs');
const { bondYTM, macaulayDuration, yearsBetween } = require('./bond_ytm');

function parseTRDate(s) {
  const [d, m, y] = s.split('.').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const YONETIM_KOMISYONU = { ANZ: 0.0075, UANZ: 0.0075 }; // from data/<kod>_static.json "info"
const STOPAJ_ORANI = 0.175; // from data/<kod>_static.json taxTable, "Eurobond Fonu Alırsa" / 1. Stopaj

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

  return {
    asOf: asOf.toISOString().slice(0, 10),
    eurobondlarinOrtalamaGetirisi: eurobondYield,
    fonunOrtalamaGetirisi: fonOrtalamaGetiri,
    yonetimKomisyonu: komisyon,
    yonetimKomisyonuSonrasi: komisyonSonrasi,
    netGetiriStopajSonrasi: netGetiri,
    fonunOrtalamaVadesi: fonOrtalamaVade,
    mevduatEsligi: null, // not automated - see header comment
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
  console.log('Mevduat Eşleniği:                OTOMATİKLEŞMEDİ (bkz. dosya başı yorum)');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { computeAnzTable };
