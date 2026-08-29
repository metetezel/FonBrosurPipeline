// Turun sonunda "bu hafta ne degisti" ozetini basar. Iki isi var:
//
//   1) BROSUR METNI DEGISIMI. render adimi her fon icin output_<kod>.html birakiyor;
//      bu dosyalarin gorunur metni data/brosur_metin.json'a snapshot olarak yazilir ve
//      git'teki bir onceki surumle (yani gecen turun kaydiyla) karsilastirilir. Rapor
//      render'in bastigi metinden turedigi icin hesaplama mantigindan asla sapmaz:
//      brosurde gorunen bir sayi degistiyse burada gorunur, degismediyse gorunmez.
//
//   2) SAGLIK KONTROLU. Fiyat ve olcut serilerinin son gunu rapor tarihiyle karsilastirilir.
//      29.08.2026'da gorulen gercek vaka: gece yarisi calisan turda uc Nasdaq serisi bir gun
//      geride kalmisti, yani fon serisi 28.08'e kadar giderken olcut 27.08'de bitiyordu.
//      PDF'e bakan kimse fark etmez; bu kontrol soyler.
//
// Kullanim: node tur_ozeti.js            (turun son adimi, commit'ten ONCE)
//           node tur_ozeti.js --yazma    snapshot'i guncellemeden sadece raporla
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { reportDateFor, isoToTRUzun } = require('./lib/static');

const KODLAR = ['AAL','AAS','AAV','AED','ANZ','AYA','DGH','JET','PKF','PKP','RTG','TLZ','UANZ','URA','YLC'];
const SNAPSHOT = path.join(__dirname, 'data', 'brosur_metin.json');
const NL = String.fromCharCode(10), CR = String.fromCharCode(13), TAB = String.fromCharCode(9);

// Bir HTML dosyasindan gorunur metin satirlarini cikarir (etiketler, script ve style yok).
function metinCikar(html) {
  let t = html;
  t = t.split('<script').map((p, i) => i === 0 ? p : p.slice(p.indexOf('</script>') + 9)).join('');
  t = t.split('<style').map((p, i) => i === 0 ? p : p.slice(p.indexOf('</style>') + 8)).join('');
  t = t.replace(/<[^>]*>/g, NL);
  const ESC = [['&nbsp;', ' '], ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'], ['&#39;', "'"], ['&quot;', '"']];
  for (const [a, b] of ESC) t = t.split(a).join(b);
  return t.split(CR).join(NL).split(TAB).join(' ')
    .split(NL).map(s => s.replace(/[ ]+/g, ' ').trim()).filter(s => s.length > 0);
}

function oncekiSnapshot() {
  // Tabani git'ten al: calisma agacinda kaydedilmemis degisiklik varsa HEAD gecen turdur;
  // tur zaten commit'lenmisse bir onceki commit'e bakilir.
  // Kaydedilmemis degisiklik varsa taban HEAD'dir (normal sira: tur -> ozet -> commit).
  // Tur zaten commit'lenmisse, snapshot'i EN SON DEGISTIREN commit'ten bir onceki alinir --
  // HEAD~1 yanlis olurdu, araya snapshot'a dokunmayan kod commit'leri girebiliyor.
  const kirli = execSync('git status --porcelain data/brosur_metin.json', { cwd: __dirname }).toString().trim();
  let ref;
  if (kirli) {
    ref = 'HEAD';
  } else {
    const gecmis = execSync('git log -n 2 --format=%H -- data/brosur_metin.json', { cwd: __dirname })
      .toString().trim().split(NL).map(s => s.trim()).filter(Boolean);
    if (gecmis.length < 2) return { veri: null, ref: '(onceki tur kaydi yok)' };
    ref = gecmis[1];
  }
  try {
    const ham = execSync('git show ' + ref + ':data/brosur_metin.json', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return { veri: JSON.parse(ham), ref };
  } catch {
    return { veri: null, ref };
  }
}

// Satir bazli coklu-kume farki: sira degil, icerik karsilastirilir.
function fark(eski, yeni) {
  const say = arr => arr.reduce((m, s) => m.set(s, (m.get(s) || 0) + 1), new Map());
  const a = say(eski), b = say(yeni);
  const cikan = [], giren = [];
  for (const [s, n] of a) { const k = n - (b.get(s) || 0); for (let i = 0; i < k; i++) cikan.push(s); }
  for (const [s, n] of b) { const k = n - (a.get(s) || 0); for (let i = 0; i < k; i++) giren.push(s); }
  return { cikan, giren };
}

function saglik(raporIso) {
  const oku = f => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));
  const sonGun = seri => (Array.isArray(seri) && seri.length) ? seri[seri.length - 1][0] : null;
  const fiyat = oku('fiyat_arsiv.json'), bench = oku('bench_arsiv.json'), tanim = oku('benchmark_tanimlari.json');

  const geriFiyat = Object.entries(fiyat).filter(x => sonGun(x[1]) < raporIso).map(x => x[0] + ' (' + sonGun(x[1]) + ')');
  const geriBench = Object.entries(bench).filter(x => sonGun(x[1]) < raporIso).map(x => [x[0], sonGun(x[1])]);

  console.log(NL + '-- SAGLIK KONTROLU');
  console.log(geriFiyat.length
    ? '   ! fiyat serisi geride: ' + geriFiyat.join(', ')
    : '   fiyat serileri  : 14 fonun tamami ' + raporIso + ' gununde');

  if (!geriBench.length) { console.log('   olcut serileri  : hepsi ' + raporIso + ' gununde'); return; }
  const geriSet = new Set(geriBench.map(x => x[0]));
  const etkilenen = KODLAR.filter(kod => {
    const formal = (tanim.formal || {})[kod] || [], grafik = (tanim.grafik || {})[kod] || [];
    return formal.concat(grafik).some(b => geriSet.has(b.symbol));
  });
  console.log('   ! olcut serisi geride: ' + geriBench.map(x => x[0] + ' (' + x[1] + ')').join(', '));
  console.log('     etkilenen fonlar   : ' + (etkilenen.join(', ') || '-'));
  console.log('     bu fonlarda fon serisi ' + raporIso + ' gunune kadar, olcut bir onceki gune kadar gidiyor.');
  console.log('     Veri gun icinde oturuyor: turu ogleden sonra tekrar calistirmak yeterli.');
}

function main() {
  const yazma = process.argv.includes('--yazma');
  const raporIso = reportDateFor('AAL').iso;
  console.log('================  TUR OZETI  ================');
  console.log('Veri tarihi (T-1): ' + isoToTRUzun(raporIso));

  const yeni = {}, eksikHtml = [];
  for (const kod of KODLAR) {
    const p = path.join(__dirname, 'output_' + kod.toLowerCase() + '.html');
    if (!fs.existsSync(p)) { eksikHtml.push(kod); continue; }
    yeni[kod] = metinCikar(fs.readFileSync(p, 'utf8'));
  }
  if (eksikHtml.length) console.log('UYARI: su fonlarin output HTML dosyasi yok: ' + eksikHtml.join(', '));

  const onceki = oncekiSnapshot();
  console.log('Karsilastirma tabani: ' + (onceki.veri ? onceki.ref + ' (bir onceki tur)' : 'YOK - ilk snapshot'));
  console.log(NL + '-- BROSUR METNI DEGISIMI');

  if (!onceki.veri) {
    console.log('   Ilk calistirma: snapshot olusturuluyor, gelecek turdan itibaren fark raporlanacak.');
  } else {
    const degisen = [], ayni = [];
    for (const kod of Object.keys(yeni)) {
      const f = fark(onceki.veri[kod] || [], yeni[kod]);
      if (!f.cikan.length && !f.giren.length) { ayni.push(kod); continue; }
      degisen.push(kod);
      console.log(NL + '   ' + kod + ' - ' + (f.cikan.length + f.giren.length) + ' satir');
      // Degisen satirin kendisi cogu zaman sadece bir sayi ("%1,75"); hangi satir oldugunu
      // anlatan etiket bir onceki metin ogesinde duruyor, o yuzden baglam olarak basiliyor.
      const goster = (arr, kaynak, im) => arr.slice(0, 12).forEach(s => {
        const i = kaynak.indexOf(s);
        const baglam = i > 0 ? kaynak[i - 1].slice(0, 45) + '  |  ' : '';
        console.log('      ' + im + ' ' + baglam + s.slice(0, 90));
      });
      goster(f.cikan, onceki.veri[kod] || [], '-');
      goster(f.giren, yeni[kod], '+');
      if (f.cikan.length > 12 || f.giren.length > 12) console.log('      ... (kirpildi)');
    }
    console.log(NL + '   Ozet: ' + Object.keys(yeni).length + ' fondan ' + degisen.length + ' tanesi degisti'
      + (degisen.length ? ' (' + degisen.join(', ') + ')' : '') + ', ' + ayni.length + ' tanesi ayni.');
  }

  saglik(raporIso);

  if (yazma) {
    console.log(NL + '(--yazma: snapshot guncellenmedi)');
  } else {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(yeni, null, 1));
    console.log(NL + 'Snapshot yazildi: data/brosur_metin.json (commit edilince gelecek turun tabani olur)');
  }
}

main();
