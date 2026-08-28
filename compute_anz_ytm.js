const ExcelJS = require('exceljs');
const { bondYTM } = require('./bond_ytm');

function parseTRDate(s) {
  const [d, m, y] = s.split('.').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile('\\\\atafiles\\Ata.Portföy\\Farshad\\Book2.xlsx');
  const ws = wb.getWorksheet('ANZ');

  const asOf = new Date(Date.UTC(2026, 7, 27)); // report date: 27/08/2026

  const bonds = [];
  for (let r = 15; r <= 27; r++) {
    const row = ws.getRow(r);
    const get = c => {
      let v = row.getCell(c).value;
      if (v && typeof v === 'object' && v.result !== undefined) v = v.result;
      return v;
    };
    const issuer = get(2);
    const maturityStr = get(3);
    const isin = get(4);
    const couponRate = get(5);
    const intervalMonths = get(6);
    const faceValue = get(7);
    const price = get(13);
    const marketValue = get(15);

    const bond = {
      couponRate,
      intervalMonths,
      maturity: parseTRDate(maturityStr),
      price,
      faceValue,
      marketValue,
    };
    const ytm = bondYTM(bond, asOf);
    bonds.push({ row: r, issuer, isin, couponRate, intervalMonths, maturityStr, price, marketValue, ytm });
  }

  console.log('Row | Issuer | Coupon | Freq(mo) | Maturity | Price | MarketValue | YTM');
  for (const b of bonds) {
    console.log(
      `${b.row} | ${b.issuer} | ${(b.couponRate * 100).toFixed(2)}% | ${b.intervalMonths} | ${b.maturityStr} | ${b.price.toFixed(3)} | ${b.marketValue.toFixed(0)} | ${(b.ytm * 100).toFixed(3)}%`
    );
  }

  const totalMV = bonds.reduce((s, b) => s + b.marketValue, 0);
  const weightedYTM = bonds.reduce((s, b) => s + b.ytm * b.marketValue, 0) / totalMV;
  console.log('\nTotal market value:', totalMV.toFixed(2));
  console.log('Market-value-weighted average YTM:', (weightedYTM * 100).toFixed(3) + '%');
  console.log('Target (Elmas, 27/08/2026): Eurobondların Ortalama Getirisi = 7.39%');
}

main().catch(e => { console.error(e); process.exit(1); });
