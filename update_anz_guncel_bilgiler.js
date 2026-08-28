// Writes compute_anz_table.js's output into anz_static.json / uanz_static.json's
// "Fon'un Güncel Bilgileri (Yıllık)" block, replacing the figures that used to come from
// Elmas Öztürk's manual monthly email. ANZ and UANZ share the same underlying eurobond
// portfolio (Book2.xlsx), so the same computed table applies to both share classes.
//
// "Mevduat Eşleniği" is left untouched - it's a USD deposit-equivalent market rate that
// isn't derivable from Book2.xlsx (see compute_anz_table.js header comment), so it stays
// whatever was last entered manually until a correct data source is found.
const fs = require('fs');
const path = require('path');
const { computeAnzTable } = require('./compute_anz_table');

function fmtPct(v) {
  return '%' + (v * 100).toFixed(2).replace('.', ',');
}

async function main() {
  const r = await computeAnzTable('ANZ');
  console.log('Computed', r.asOf, JSON.stringify(r, null, 2));

  for (const code of ['anz', 'uanz']) {
    const file = path.join(__dirname, 'data', `${code}_static.json`);
    const s = JSON.parse(fs.readFileSync(file, 'utf-8'));
    const rows = s.guncelBilgiler.rows;
    const set = (label, value) => {
      const row = rows.find(x => x[0] === label);
      if (row) row[1] = value; else rows.push([label, value]);
    };
    set('Ortalama Getiri', fmtPct(r.fonunOrtalamaGetirisi));
    set('Yönetim Komisyon Sonrası Getiri', fmtPct(r.yonetimKomisyonuSonrasi));
    set('Net Getiri (Stopaj Sonrası)', fmtPct(r.netGetiriStopajSonrasi));
    set('Ortalama Vade (Yıl)', r.fonunOrtalamaVadesi.toFixed(2).replace('.', ','));
    // Mevduat Eşleniği intentionally left as-is.
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    console.log(`updated ${file}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
