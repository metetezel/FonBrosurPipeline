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

async function main() {
  const tarih = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
  console.log(`TEFAS varlık dağılımı çekiliyor (${tarih})...`);
  let list = await cek(tarih);
  if (!list.length) {
    // hafta sonu / tatil: bir gün geriye giderek son yayınlanan günü bul
    for (let i = 1; i <= 7 && !list.length; i++) {
      const d = new Date(`${tarih.slice(0, 4)}-${tarih.slice(4, 6)}-${tarih.slice(6)}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      list = await cek(d.toISOString().slice(0, 10).replace(/-/g, ''));
    }
  }
  if (!list.length) throw new Error('TEFAS boş döndü (tarih hatalı olabilir)');

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
  console.log('\nNot: TEFAS enstrüman türüne göre, broşür ise kendi gruplamasına göre yazıyor.');
  console.log('Otomatik yazmadan önce her fon için hangi TEFAS kalemlerinin hangi broşür');
  console.log('dilimine gireceğine karar verilmeli.');
}

main().catch(e => { console.error(e); process.exit(1); });
