// Fonların varlık dağılımını TEFAS'tan çeker (broşürdeki "Fon Portföy Dağılımı" /
// "Varlık Dağılımı" pastası şu ana kadar elle yazılıyordu).
//
// Endpoint: POST https://www.tefas.gov.tr/api/funds/dagilimSiraliGetirT
// Uzun süre bulunamamasının sebebi isimlendirme: TEFAS'ın yeni API'si kısaltma kullanıyor
// (dagilimSiraliGetirT, fonGnlBlgSiraliGetir) ve gövde 17 alanlı sabit bir sorgu şablonu
// istiyor; eksik gövdeyle NullPointerException dönüyor. Doğrulama: ANZ için 28.08.2026'da
// osdb=%97,82 + vint=%2,18 döndü — TEFAS'ın kendi fon sayfasındaki değerlerle birebir.
//
// Kullanım:
//   node fetch_tefas_dagilim.js           çek, data/tefas_dagilim.json'a yaz, broşürle karşılaştır
//   node fetch_tefas_dagilim.js 20260828  belirli bir tarih için
const fs = require('fs');
const path = require('path');
const { loadStatic } = require('./lib/static');

const URL = 'https://www.tefas.gov.tr/api/funds/dagilimSiraliGetirT';
const DATA_DIR = path.join(__dirname, 'data');
const OUT = path.join(DATA_DIR, 'tefas_dagilim.json');
const KODLAR = ['AAL', 'AAS', 'AAV', 'AED', 'ANZ', 'AYA', 'DGH', 'JET', 'PKF', 'PKP', 'RTG', 'TLZ', 'URA', 'YLC'];
const ALIASES = { UANZ: 'ANZ' };

// TEFAS'ın varlık türü kodları -> broşür dilinde Türkçe etiketler.
const ETIKET = {
  hs: 'Hisse Senedi', dt: 'Devlet Tahvili', hb: 'Hazine Bonosu', fb: 'Finansman Bonosu',
  ost: 'Özel Sektör Tahvili', bb: 'Banka Bonosu', vdm: 'Varlığa Dayalı Menkul Kıymet',
  eut: 'Eurobond', kibd: 'Kamu Dış Borçlanma Araçları', osdb: 'Özel Sektör Dış Borçlanma Araçları',
  kba: 'Kamu İç Borçlanma (Döviz)', dot: 'Dövize Endeksli Bono', db: 'Dövize Endeksli Tahvil',
  tpp: 'Takasbank Para Piyasası', bpp: 'BİST Para Piyasası', btaa: 'BİST Taahhütlü Alım',
  btas: 'BİST Taahhütlü Satım', tr: 'Ters Repo', vm: 'Vadeli Mevduat',
  vmtl: 'Vadeli Mevduat (TL)', vmd: 'Vadeli Mevduat (Döviz)', vmau: 'Vadeli Mevduat (Altın)',
  kh: 'Katılma Hesabı', khtl: 'Katılma Hesabı (TL)', khd: 'Katılma Hesabı (Döviz)',
  khau: 'Katılma Hesabı (Altın)', kks: 'Kamu Kira Sertifikası', kkstl: 'Kamu Kira Sertifikası (TL)',
  kksd: 'Kamu Kira Sertifikası (Döviz)', kksyd: 'Kamu Yabancı Kira Sertifikası',
  osks: 'Özel Sektör Kira Sertifikası', oksyd: 'Özel Sektör Yabancı Kira Sertifikası',
  km: 'Kıymetli Madenler', kmbyf: 'Kıymetli Maden BYF', kmkba: 'Kıymetli Maden Kamu Borçlanma',
  kmkks: 'Kıymetli Maden Kira Sertifikası', ymk: 'Yabancı Menkul Kıymet',
  yba: 'Yabancı Borçlanma Aracı', ybkb: 'Yabancı Kamu Borçlanma', ybosb: 'Yabancı Özel Sektör Borçlanma',
  yhs: 'Yabancı Hisse Senedi', ybyf: 'Yabancı BYF', fkb: 'Fon Katılma Belgesi',
  yyf: 'Yatırım Fonu', byf: 'Borsa Yatırım Fonu', gykb: 'Gayrimenkul Yatırım Fonu',
  gyy: 'Gayrimenkul Yatırımı', gsykb: 'Girişim Sermayesi Yatırım Fonu',
  gsyy: 'Girişim Sermayesi Yatırımı', vint: 'Vadeli İşlemler Nakit Teminatı',
  gas: 'Gayrimenkul Sertifikası',
};

function govde(tarih) {
  return {
    fonTipi: 'YAT', fonKodu: null, aramaMetni: null, fonTurKod: null, fonGrubu: null,
    sfonTurKod: null, fonTurAciklama: null, kurucuKod: null,
    basTarih: tarih, bitTarih: tarih, basSira: 1, bitSira: 100000,
    dil: 'TR', sFonTurKod: '', fonKod: '', fonGrup: '', fonUnvanTip: '',
  };
}

async function cek(tarih) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
    body: JSON.stringify(govde(tarih)),
  });
  const json = await res.json();
  if (json.errorMessage) throw new Error(json.errorMessage);
  return json.resultList || [];
}

function ayristir(satir) {
  return Object.entries(satir)
    .filter(([k, v]) => ETIKET[k] && typeof v === 'number' && v > 0)
    .map(([k, v]) => ({ kod: k, label: ETIKET[k], pct: Math.round(v * 100) / 100 }))
    .sort((a, b) => b.pct - a.pct);
}

/**
 * TEFAS kalemlerini pasta dilimlerine cevirir: %1'in altindakiler "Diğer"de toplanir
 * (donut'ta okunmayan kil payi dilimler olusmasin), yuzdeler tam sayiya yuvarlanir ve
 * yuvarlama farki en buyuk dilime eklenerek toplam 100'e sabitlenir.
 */
function pastaYap(kalemler) {
  const buyuk = kalemler.filter(k => k.pct >= 1);
  const kalan = kalemler.filter(k => k.pct < 1).reduce((s, k) => s + k.pct, 0);
  const dilimler = buyuk.map(k => ({ label: k.label, pct: Math.round(k.pct) }));
  if (kalan >= 0.5) dilimler.push({ label: 'Diğer', pct: Math.round(kalan) });
  const fark = 100 - dilimler.reduce((s, d) => s + d.pct, 0);
  if (fark !== 0 && dilimler.length) {
    const enBuyuk = dilimler.reduce((a, b) => (a.pct >= b.pct ? a : b));
    enBuyuk.pct += fark;
  }
  return dilimler.filter(d => d.pct > 0);
}

/**
 * TEFAS'ta veri bulunan EN YENI gunu bulur: verilen tarihten baslayip gun gun geriye gider.
 * Kural (Mete, 29.08.2026): dagilim icin "en yenisi" gecerli - net varlikta oldugu gibi -
 * brosurun T-1 kesimi degil. Portfoy dagilimi gunluk oynamayan bir bilgi, T-1'de veri
 * yayinlanmamis olmasi yuzunden pastanin bos kalmasi daha kotu.
 *
 * "Veri yok" TEFAS'ta iki farkli sekilde geliyor: bazi gunlerde bos liste, hafta sonu ve
 * tatillerde ise errorMessage (cek() bunu exception'a ceviriyor). Eskiden sadece bos liste
 * hali ele aliniyordu, bu yuzden geriye gitme dongusune sira gelmeden patliyordu ve
 * haftalik tur 3. adimda oluyordu (29.08.2026 cumartesi boyle yakalandi).
 */
async function enYeniGun(tarih, gerigit = 10) {
  for (let i = 0; i <= gerigit; i++) {
    const d = new Date(`${tarih.slice(0, 4)}-${tarih.slice(4, 6)}-${tarih.slice(6)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    const gun = d.toISOString().slice(0, 10).replace(/-/g, '');
    try {
      const list = await cek(gun);
      if (list.length) {
        if (i > 0) console.log(`  ${tarih} icin veri yok; en yeni yayinlanan gun: ${gun}`);
        return list;
      }
    } catch (e) {
      console.log(`  ${gun}: veri yok (${e.message})`);
    }
  }
  return [];
}

async function main() {
  const yaz = process.argv.includes('--yaz');
  const tarih = process.argv.find(a => /^[0-9]{8}$/.test(a)) || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  console.log(`TEFAS varlık dağılımı çekiliyor (${tarih})...`);
  const list = await enYeniGun(tarih);
  if (!list.length) throw new Error('TEFAS son 10 günde veri döndürmedi (tarih hatalı olabilir)');

  const out = { cekildi: new Date().toISOString(), tarih: list[0].tarih, fonlar: {} };
  for (const kod of KODLAR) {
    const satir = list.find(x => x.fonKodu === kod);
    if (!satir) { console.warn(`  ${kod}: TEFAS'ta kayıt yok`); continue; }
    out.fonlar[kod] = ayristir(satir);
  }
  out.fonlar.UANZ = out.fonlar[ALIASES.UANZ]; // UANZ'ın TEFAS kaydı yok, ANZ'nin pay sınıfı
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
  console.log(`Yazıldı: ${OUT} (değer tarihi ${out.tarih})\n`);

  console.log('TEFAS dağılımı ile broşürdeki pasta karşılaştırması:');
  for (const kod of [...KODLAR, 'UANZ'].sort()) {
    const tefas = out.fonlar[kod];
    if (!tefas) continue;
    let s;
    try { s = loadStatic(kod); } catch { continue; }
    // Pasta iki farklı şekilde duruyor: portfolioPie {title, items} ya da assetAllocation []
    const ham = s.portfolioPie || s.assetAllocation || null;
    const brosur = Array.isArray(ham) ? ham : (ham && Array.isArray(ham.items) ? ham.items : null);
    console.log(`\n${kod}`);
    console.log('  TEFAS  : ' + tefas.map(x => `%${x.pct} ${x.label}`).join(' · '));
    console.log('  Broşür : ' + (brosur ? brosur.map(x => `%${x.pct} ${x.label}`).join(' · ') : '(pasta yok)'));
  }
  if (!yaz) {
    console.log('');
    console.log('(Sadece karsilastirma - dosya degistirilmedi. Yazmak icin: --yaz)');
    return;
  }
  console.log('');
  console.log('Pastalar yaziliyor:');
  let yazilan = 0;
  for (const kod of [...KODLAR, 'UANZ']) {
    const tefas = out.fonlar[kod];
    if (!tefas) continue;
    const p2 = path.join(DATA_DIR, `${kod.toLowerCase()}_static.json`);
    if (!fs.existsSync(p2)) continue;
    const s2 = JSON.parse(fs.readFileSync(p2, 'utf-8'));
    const dilimler = pastaYap(tefas);
    if (s2.portfolioPie && Array.isArray(s2.portfolioPie.items)) s2.portfolioPie.items = dilimler;
    else if (Array.isArray(s2.assetAllocation)) s2.assetAllocation = dilimler;
    else continue; // bu fonun brosurunde pasta yok, eklemiyoruz
    s2.portfoyDagilimTarihi = out.tarih;
    fs.writeFileSync(p2, JSON.stringify(s2, null, 2));
    yazilan++;
    console.log(`  ${kod.padEnd(5)} ` + dilimler.map(d => `%${d.pct} ${d.label}`).join(' - '));
  }
  console.log('');
  console.log(`${yazilan} fonun pastasi guncellendi (deger tarihi ${out.tarih}).`);
}

main().catch(e => { console.error(e); process.exit(1); });
