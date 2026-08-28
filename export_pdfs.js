// Üretilen 15 PDF'i ağ klasöründeki tarihli yayın klasörüne temiz isimlerle kopyalar:
//   AAL_Brosur_Modern.pdf -> .../Brosurler/27.08.2026/AAL.pdf
// Klasör adındaki tarih elle yazılmaz, verinin son gününden gelir (lib/static.js).
//
// Kullanım:
//   node export_pdfs.js                 varsayılan ağ klasörüne
//   node export_pdfs.js "D:/başka/yol"  başka bir hedef köke
const fs = require('fs');
const path = require('path');
const { reportDateFor, isoToTR } = require('./lib/static');

const VARSAYILAN_HEDEF = 'Z:/Mete Tezel/Fon Broşür [Cursor & Claude]';
const KODLAR = ['AAL', 'AAS', 'AAV', 'AED', 'ANZ', 'AYA', 'DGH', 'JET', 'PKF', 'PKP', 'RTG', 'TLZ', 'UANZ', 'URA', 'YLC'];

function main() {
  const kok = process.argv[2] || VARSAYILAN_HEDEF;
  if (!fs.existsSync(kok)) {
    console.error(`Hedef klasör bulunamadı: ${kok}`);
    console.error('Ağ sürücüsü bağlı değilse bağlayın ya da hedefi argüman olarak verin.');
    process.exit(1);
  }
  const iso = reportDateFor('AAL').iso;              // ör. 2026-07-31

  // Broşür haftalık üretiliyor (her perşembe), o yüzden tarih için bir kısıt yok.
  // Tek kontrol: veri bayatsa uyar - genelde fetch_arsiv adımının atlandığı ya da
  // hata verdiği anlamına gelir, sessizce geçen haftanın broşürünü basmayalım.
  const gunFarki = Math.round((Date.now() - new Date(iso + 'T00:00:00Z').getTime()) / 86400000);
  if (gunFarki > 10) {
    console.warn(`UYARI: verinin son günü ${isoToTR(iso)} - ${gunFarki} gün önce.`);
    console.warn('fetch_arsiv.js çalıştı mı? Eski veriyle yayınlıyor olabilirsiniz.');
  }
  // Haftalik uretim yilda ~52 klasor demek; hepsi tek bir Brosurler/ altinda toplaniyor.
  const trTarih = iso.split('-').reverse().join('.'); // 27.08.2026
  const hedef = path.join(kok, 'Brosurler', trTarih);
  fs.mkdirSync(hedef, { recursive: true });

  let kopyalanan = 0, eksik = [];
  for (const kod of KODLAR) {
    const src = path.join(__dirname, `${kod}_Brosur_Modern.pdf`);
    if (!fs.existsSync(src)) { eksik.push(kod); continue; }
    fs.copyFileSync(src, path.join(hedef, `${kod}.pdf`));
    kopyalanan++;
  }
  console.log(`${kopyalanan} PDF kopyalandı -> ${hedef}`);
  if (eksik.length) console.warn(`UYARI: şu fonların PDF'i bulunamadı (render edilmemiş olabilir): ${eksik.join(', ')}`);
}

main();
