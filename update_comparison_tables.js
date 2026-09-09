// AAL/AAV/AED/DGH'nin data/<kod>_static.json'daki comparisonTable.rows[].values
// alanlarini lib/comparisonTable.js ile canli hesaplayip yazar. Satir ETIKETLERI ve
// kolon SIRASI dokunulmadan kalir (Mete'nin curated icerigi); sadece sayilar guncellenir.
//
// Kullanim: node update_comparison_tables.js         fark var mi bak, yazma
//           node update_comparison_tables.js --yaz   farklari data/<kod>_static.json'a yaz
const fs = require('fs');
const path = require('path');
const { hesapla } = require('./lib/comparisonTable');

const DATA_DIR = path.join(__dirname, 'data');
const FONLAR = ['AAL', 'AAV', 'AED', 'DGH'];

function main() {
  const yaz = process.argv.includes('--yaz');
  for (const kod of FONLAR) {
    const p = path.join(DATA_DIR, kod.toLowerCase() + '_static.json');
    const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const yeni = hesapla(kod);
    let fark = 0;
    console.log(`\n${kod}`);
    for (const row of s.comparisonTable.rows) {
      const yeniDeger = yeni[row.label];
      if (!yeniDeger) { console.log(`   UYARI: '${row.label}' icin hesap yok, atlandi`); continue; }
      const degisti = row.values.some((v, i) => v !== yeniDeger[i]);
      if (degisti) {
        fark++;
        console.log(`   ${row.label}: ${JSON.stringify(row.values)} -> ${JSON.stringify(yeniDeger)}`);
        if (yaz) row.values = yeniDeger;
      } else {
        console.log(`   ${row.label}: aynı`);
      }
    }
    if (yaz && fark) fs.writeFileSync(p, JSON.stringify(s, null, 2));
    if (!fark) console.log('   (hiç fark yok)');
  }
  console.log(yaz ? '\nYazıldı.' : '\n(yazmak için --yaz)');
}

main();
