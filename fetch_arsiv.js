// Veri arşivini (data/fiyat_arsiv.json + data/bench_arsiv.json) doğrudan kaynak
// API'lerinden büyütür. Excel + Power Query + Haftalik_Guncelle.ps1 zincirinin yerini alır.
//
// Kaynaklar:
//   Fon fiyatları   TEFAS      POST /api/funds/fonFiyatBilgiGetir {fonKodu, dil, periyod}
//   KYD/BIST        Borsa İst. GET  graphic.php?veriTuru=endeks-graphic&indexCode=<KOD>
//   Nasdaq endeksi  Nasdaq     POST indexes.nasdaq.com/Index/HistoryData id=<SEMBOL>&...
//   Proxy ETF (URA) Yahoo      GET  query1.finance.yahoo.com/v8/finance/chart/<TICKER>
//
// Yalnızca EKLER, hiçbir zaman silmez/değiştirmez: arşivde zaten olan tarihler atlanır.
// Bu önemli — TEFAS sadece son 5 yılı veriyor, arşiv ise 2021 öncesini de tutuyor; kayan
// pencere yüzünden geçmişin kaybolmaması için birikimli bir dosya kullanıyoruz.
//
// Kullanım:
//   node fetch_arsiv.js              fiyat + benchmark, son 12 ay
//   node fetch_arsiv.js --tam        fiyat için son 60 ay (TEFAS'ın izin verdiği en geniş)
//   node fetch_arsiv.js --sadece-fiyat | --sadece-bench
//   node fetch_arsiv.js --dene       hicbir dosyaya yazmadan ne eklenecegini raporlar
//
// NOT: arsivi buyutmek brosurun rapor tarihini de ilerletir (rapor tarihi = verinin son
// gunu). Haftalik tur persembe gunu calistiginda TEFAS'in son yayinladigi gun carsamba
// olur, brosurler de o tarihi tasir.
const fs = require('fs');
const path = require('path');
const { isoToTR } = require('./lib/static');

const DATA_DIR = path.join(__dirname, 'data');
const FIYAT_PATH = path.join(DATA_DIR, 'fiyat_arsiv.json');
const BENCH_PATH = path.join(DATA_DIR, 'bench_arsiv.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

const FON_KODLARI = ['AAL', 'AAS', 'AAV', 'AED', 'ANZ', 'AYA', 'DGH', 'JET', 'PKF', 'PKP', 'RTG', 'TLZ', 'URA', 'YLC'];

// Sembol -> kaynak eşlemesi. Yeni bir bileşen eklenirse buraya bir satır eklenir.
const NASDAQ = ['NQROBO', 'NQUSB502010T', 'NQXAUAGR'];
const YAHOO_PROXY = { URA: 'URA' }; // Global X Uranium ETF - Solactive endeksinin proxy'si

function kaynakTipi(sembol) {
  if (NASDAQ.includes(sembol)) return 'nasdaq';
  if (YAHOO_PROXY[sembol]) return 'yahoo';
  return 'bist'; // KYD kodları (TKISA, REPBR, ...) ve BIST endeksleri (XU100_CFNNTLTL, ...)
}

function oku(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

/** Mevcut seriye yeni [tarih, değer] çiftlerini ekler; var olan tarihlere dokunmaz. */
function birlestir(mevcut, yeniler) {
  const varOlan = new Set(mevcut.map(r => r[0]));
  let eklenen = 0;
  for (const [tarih, deger] of yeniler) {
    if (varOlan.has(tarih) || !Number.isFinite(deger)) continue;
    mevcut.push([tarih, deger]);
    varOlan.add(tarih);
    eklenen++;
  }
  mevcut.sort((a, b) => a[0].localeCompare(b[0]));
  return eklenen;
}

async function tefasFiyat(fonKodu, periyod) {
  const res = await fetch('https://www.tefas.gov.tr/api/funds/fonFiyatBilgiGetir', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({ fonKodu, dil: 'TR', periyod }),
  });
  const json = await res.json();
  if (json.faultCode) throw new Error(`TEFAS ${fonKodu}: ${json.faultString}`);
  return (json.resultList || []).map(r => [r.tarih, Number(r.fiyat)]);
}

async function bistEndeks(kod) {
  const url = `https://www.borsaistanbul.com/graphic.php?veriTuru=endeks-graphic&indexCode=${encodeURIComponent(kod)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  if (json.status !== 'success' || !Array.isArray(json.data)) throw new Error(`BIST ${kod}: beklenmeyen yanıt`);
  return json.data.map(d => [d.hisTs, Number(d.clval)]);
}

async function nasdaqEndeks(sembol, baslangic) {
  const body = new URLSearchParams({
    id: sembol,
    startDate: `${baslangic}T00:00:00.000`,
    endDate: `${new Date().toISOString().slice(0, 10)}T00:00:00.000`,
    timeOfDay: '',
  });
  const res = await fetch('https://indexes.nasdaq.com/Index/HistoryData', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body: body.toString(),
  });
  const json = await res.json();
  return (json.aaData || [])
    .filter(r => r.Value != null)
    .map(r => {
      const ms = Number(/\/Date\((\d+)\)\//.exec(r.TimeStamp)[1]);
      return [new Date(ms).toISOString().slice(0, 10), Number(r.Value)];
    });
}

async function yahooSeri(ticker, baslangic) {
  const p1 = Math.floor(new Date(baslangic).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?period1=${p1}&period2=${p2}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  const r = json.chart.result[0];
  const out = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const c = r.indicators.quote[0].close[i];
    if (c == null) continue;
    out.push([new Date(r.timestamp[i] * 1000).toISOString().slice(0, 10), Number(c)]);
  }
  return out;
}

function geriTarih(ay) {
  const d = new Date();
  d.setMonth(d.getMonth() - ay);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const args = process.argv.slice(2);
  const periyod = args.includes('--tam') ? 60 : 12;
  const sadeceFiyat = args.includes('--sadece-fiyat');
  const sadeceBench = args.includes('--sadece-bench');
  const dene = args.includes('--dene');
  if (dene) console.log('(--dene: hiçbir dosyaya yazılmayacak)');

  if (!sadeceBench) {
    console.log(`Fon fiyatları TEFAS'tan çekiliyor (son ${periyod} ay)...`);
    const fiyat = oku(FIYAT_PATH);
    let toplam = 0;
    for (const kod of FON_KODLARI) {
      try {
        const yeniler = await tefasFiyat(kod, periyod);
        const eklenen = birlestir(fiyat[kod] = fiyat[kod] || [], yeniler);
        toplam += eklenen;
        const son = fiyat[kod][fiyat[kod].length - 1];
        console.log(`  ${kod.padEnd(5)} +${String(eklenen).padStart(3)} satır  (son: ${son[0]} @ ${son[1]})`);
      } catch (e) {
        console.warn(`  ${kod.padEnd(5)} HATA: ${e.message}`);
      }
    }
    if (!dene) fs.writeFileSync(FIYAT_PATH, JSON.stringify(fiyat));
    const sonGun = Object.values(fiyat).map(a => a[a.length - 1][0]).sort().pop();
    console.log(`  toplam ${toplam} yeni fiyat satırı — arşivin son günü: ${isoToTR(sonGun)}`);
    console.log(`  Broşürler bu tarihle üretilecek (rapor tarihi = verinin son günü).`);
  }

  if (!sadeceFiyat) {
    console.log('Benchmark serileri çekiliyor...');
    const bench = oku(BENCH_PATH);
    let toplam = 0;
    for (const sembol of Object.keys(bench).sort()) {
      const tip = kaynakTipi(sembol);
      try {
        let yeniler;
        if (tip === 'bist') yeniler = await bistEndeks(sembol);
        else if (tip === 'nasdaq') yeniler = await nasdaqEndeks(sembol, geriTarih(periyod));
        else yeniler = await yahooSeri(YAHOO_PROXY[sembol], geriTarih(periyod));
        const eklenen = birlestir(bench[sembol], yeniler);
        toplam += eklenen;
        const son = bench[sembol][bench[sembol].length - 1];
        console.log(`  ${sembol.padEnd(16)} ${tip.padEnd(6)} +${String(eklenen).padStart(3)} satır  (son: ${son[0]})`);
      } catch (e) {
        console.warn(`  ${sembol.padEnd(16)} ${tip.padEnd(6)} HATA: ${e.message}`);
      }
    }
    if (!dene) fs.writeFileSync(BENCH_PATH, JSON.stringify(bench));
    console.log(`  toplam ${toplam} yeni benchmark satırı`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
