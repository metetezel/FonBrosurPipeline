// Writes compute_anz_table.js's output into anz_static.json / uanz_static.json's
// "Fon'un Güncel Bilgileri (Yıllık)" block, replacing the figures that used to come from
// Elmas Öztürk's manual monthly email. ANZ and UANZ share the same underlying eurobond
// portfolio (Book2.xlsx), so the same computed table applies to both share classes.
//
// "Mevduat Eşleniği" is written too, as of 28.08.2026 - it is derived from the net return
// and the deposit withholding rate, not looked up from a market index (see the header
// comment in compute_anz_table.js for the derivation and its verification against the
// published 31.07.2026 brochure). Nothing in this table is manual any more.
const fs = require('fs');
const path = require('path');
const { computeAnzTable } = require('./compute_anz_table');

function fmtPct(v) {
  return '%' + (v * 100).toFixed(2).replace('.', ',');
}

async function main() {
  // 28.08.2026'dan beri VARSAYILAN: sadece raporla, yazma. Gerekce: hesaplanan ortalama
  // getiri (%4,57) Elmas'in bildirdigi %7,39'dan cok uzak ve fark bizim matematigimizden
  // degil girdiden geliyor - Book2.xlsx'in fiyat/kupon kolonlari beklenen anlamda degil
  // (or. Hazine 2035 kagidi %3,25 kupon + 97,93 fiyat => ~%3,5 USD getiri; piyasa ~%7).
  // Kolonlarin anlami Farshad/Elmas ile netlesip hesap kalibre edilene kadar brosur
  // Elmas'in yayimladigi rakamlari tasiyor. Yazdirmak icin: --yaz
  const yaz = process.argv.includes('--yaz');
  const r = await computeAnzTable('ANZ');
  console.log('Computed', r.asOf, JSON.stringify(r, null, 2));

  if (!yaz) {
    console.log('(Sadece rapor modu — static json değiştirilmedi.)');
    console.log('Broşür şu an Elmas Öztürk\'ün yayımladığı rakamları taşıyor.');
    console.log('Hesaplanani yazdirmak icin: node update_anz_guncel_bilgiler.js --yaz');
    return;
  }
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
    set('Mevduat Eşleniği', fmtPct(r.mevduatEsligi));
    set('Ortalama Vade (Yıl)', r.fonunOrtalamaVadesi.toFixed(2).replace('.', ','));
    fs.writeFileSync(file, JSON.stringify(s, null, 2));
    console.log(`updated ${file}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
