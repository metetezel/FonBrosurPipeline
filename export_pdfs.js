// Üretilen 15 PDF'i ağ klasöründeki tarihli yayın klasörüne temiz isimlerle kopyalar:
//   AAL_Brosur_Modern.pdf -> .../Brosurler/27.08.2026/AAL.pdf
// Klasör adı ve broşür başlığı yayın gününden (PDF'i ürettiğimiz gün), veriler T-1'den
// gelir — bkz. lib/static.js yayinTarihi / lib/arsiv.js kesimTarihi.
//
// Kullanım:
//   node export_pdfs.js                 varsayılan ağ klasörüne
//   node export_pdfs.js "D:/başka/yol"  başka bir hedef köke
const fs = require('fs');
const path = require('path');
const { reportDateFor, yayinTarihi, isoToTRUzun } = require('./lib/static');

// Ofis makinesinde ağ paylaşımı Z: olarak eşlenmiş, notebook'ta eşlenmemiş olabilir;
// ikisi de aynı klasör. Sırayla denenir, ilk bulunan kullanılır.
const HEDEFLER = [
  'Z:/Mete Tezel/Fon Broşür [Cursor & Claude]',
  '//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]',
];
const KODLAR = ['AAL', 'AAS', 'AAV', 'AED', 'ANZ', 'AYA', 'DGH', 'JET', 'PKF', 'PKP', 'RTG', 'TLZ', 'UANZ', 'URA', 'YLC'];

function main() {
  const kok = process.argv[2] || HEDEFLER.find(h => fs.existsSync(h));
  if (!kok || !fs.existsSync(kok)) {
    console.error('Hedef klasör bulunamadı. Denenen yollar:');
    for (const h of (process.argv[2] ? [process.argv[2]] : HEDEFLER)) console.error('  ' + h);
    console.error('Ağ sürücüsü bağlı değilse bağlayın ya da hedefi argüman olarak verin.');
    process.exit(1);
  }
  console.log(`Hedef kök   : ${kok}`);
  const veriIso = reportDateFor('AAL').iso;   // serinin son günü (T-1)
  const iso = yayinTarihi().iso;              // rozet ve klasör adı: yayın günü

  // Broşür haftalık üretiliyor (perşembe öğleden sonra), o yüzden tarihe kısıt yok:
  // normalde veri dünden ya da bugünden. Bir haftadan bayat veri, fetch_arsiv adımının
  // atlandığı/hata verdiği anlamına gelir - sessizce geçen haftanın broşürü basılmasın.
  const gunFarki = Math.round((Date.now() - new Date(veriIso + 'T00:00:00Z').getTime()) / 86400000);
  if (gunFarki > 7) {
    console.warn(`UYARI: verinin son günü ${isoToTRUzun(veriIso)} — ${gunFarki} gün önce.`);
    console.warn('fetch_arsiv.js çalıştı mı? (Uzun bir tatil haftasıysa normal olabilir.)');
  }
  console.log(`Yayın tarihi (broşür başlığı): ${isoToTRUzun(iso)}`);
  console.log(`Veri tarihi  (T-1)            : ${isoToTRUzun(veriIso)}`);
  // Haftalik uretim yilda ~52 klasor demek; hepsi tek bir Brosurler/ altinda toplaniyor.
  const trTarih = iso.split('-').reverse().join('.'); // 27.08.2026
  const hedef = path.join(kok, 'Brosurler', trTarih);
  fs.mkdirSync(hedef, { recursive: true });

  // Önce 15 PDF'in tamamı kontrol edilir, sonra kopyalanır: yarım ya da bayat bir set
  // sessizce yayına gitmesin. Render döngüsünün kendi hata kontrolü yok, bu yüzden
  // başarısız bir render geçen turdan kalan PDF'i olduğu yerde bırakır — bayatlık ölçüsü
  // göreli: en yeni PDF'ten bir saatten fazla geride kalan dosya bu turda üretilmemiştir.
  const kaynaklar = KODLAR.map(kod => ({ kod, src: path.join(__dirname, `${kod}_Brosur_Modern.pdf`) }));
  const eksik = kaynaklar.filter(x => !fs.existsSync(x.src)).map(x => x.kod);
  if (eksik.length) {
    console.error(`HATA: şu fonların PDF'i yok, render adımı başarısız olmuş olabilir: ${eksik.join(', ')}`);
    console.error('Güvenlik için yayın klasörüne hiçbir şey kopyalanmadı.');
    process.exit(1);
  }
  const zamanlar = kaynaklar.map(x => ({ kod: x.kod, src: x.src, mtime: fs.statSync(x.src).mtimeMs }));
  const enYeni = Math.max(...zamanlar.map(x => x.mtime));
  const bayat = zamanlar.filter(x => enYeni - x.mtime > 3600000).map(x => x.kod);
  if (bayat.length) {
    console.error(`HATA: şu PDF'ler bu turda yenilenmemiş (en yeniden 1 saatten eski): ${bayat.join(', ')}`);
    console.error('Render adımı sessizce başarısız olmuş olabilir; yayın klasörüne kopyalanmadı.');
    process.exit(1);
  }
  for (const { kod, src } of kaynaklar) fs.copyFileSync(src, path.join(hedef, `${kod}.pdf`));
  console.log(`${kaynaklar.length} PDF kopyalandı -> ${hedef}`);
}

main();
