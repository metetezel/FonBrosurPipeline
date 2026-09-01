// ANZ/UANZ "ATA Eurobond Fonu vs. USD Mevduat" growth chart — needs special-casing beyond
// the generic extract_fund.js because of a currency mismatch documented in Benchmark_Tanimlari's
// own Notlar column:
//   ANZ  / MEVUS: "TL fiyat icin TCMB USD/TRY ile carpilmali" -> ANZ's fund price is TL, so the
//                 USD-denominated MEVUS benchmark must be multiplied by USD/TRY to compare.
//   UANZ / MEVUS: "USD fiyat, dogrudan" -> UANZ's comparison is meant to be done fully in USD,
//                 but UANZ has no price series of its own in Fiyat_Sabit_Arsiv (reuses ANZ's TL
//                 series) - so ANZ's TL price must be divided by USD/TRY to get UANZ's USD price,
//                 and MEVUS is then used as-is (no multiplication).
// The previous version of both anz_monthly.json/uanz_monthly.json (built via generic
// extract_fund.js) used raw MEVUS with no FX adjustment at all - comparing a TL fund index
// (100 -> 714 over 5 years) against a pure-USD deposit index (100 -> 110), which is not a
// meaningful comparison.
const { fiyatSerisi, benchSerisi } = require('./lib/arsiv');
const { fmtTRNumber } = require('./lib/blocks');
const fs = require('fs');
const path = require('path');

const USDTRY_CACHE = path.join(__dirname, 'data', 'usdtry_cache.json');

function excelDateToISO(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const epoch = new Date(Date.UTC(1899, 11, 30));
  return new Date(epoch.getTime() + v * 86400000).toISOString().slice(0, 10);
}

function buildOnOrBeforeLookup(rowsSortedByDate) {
  const dates = rowsSortedByDate.map(r => r.date);
  const map = new Map(rowsSortedByDate.map(r => [r.date, r.value]));
  return function (dateStr) {
    let lo = 0, hi = dates.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= dateStr) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans >= 0 ? map.get(dates[ans]) : null;
  };
}

async function main() {
  const cleanPrice = fiyatSerisi('ANZ').filter(r => r.price > 0);
  const mevusRows = benchSerisi('MEVUS');

  const usdtry = JSON.parse(fs.readFileSync(USDTRY_CACHE, 'utf-8'));

  const priceLookup = buildOnOrBeforeLookup(cleanPrice.map(r => ({ date: r.date, value: r.price })));
  const mevusLookup = buildOnOrBeforeLookup(mevusRows);
  const fxLookup = buildOnOrBeforeLookup(usdtry);

  const inceptionDate = cleanPrice[0].date;
  const fxAtInception = fxLookup(inceptionDate);
  const priceAtInception = priceLookup(inceptionDate);
  const mevusAtInception = mevusLookup(inceptionDate);

  function buildGrowth({ fundInUSD }) {
    return cleanPrice.map(r => {
      const fx = fxLookup(r.date);
      const mevus = mevusLookup(r.date);
      let fundIndex = null;
      if (fundInUSD) {
        if (fx != null && fxAtInception != null) {
          fundIndex = (r.price / fx) / (priceAtInception / fxAtInception) * 100;
        }
      } else {
        fundIndex = (r.price / priceAtInception) * 100;
      }
      let benchIndex = null;
      if (mevus != null && mevusAtInception != null) {
        if (fundInUSD) {
          benchIndex = (mevus / mevusAtInception) * 100; // both sides already USD - no FX needed
        } else if (fx != null && fxAtInception != null) {
          benchIndex = (mevus * fx) / (mevusAtInception * fxAtInception) * 100; // TL-equivalent
        }
      }
      return { date: r.date, fundIndex, benchIndex };
    });
  }

  // Her iki sayfanin grafik basligi da "ATA Eurobond Fonu vs. USD Mevduat" ve her ikisi de
  // dolar bazli bir performans tablosu tasiyor; ANZ'yi TL bazinda cizmek iki sayfayi
  // birbirinden kopariyordu (ANZ 100->730 TL, UANZ 100->126 USD). Karar (Mete, 29.08.2026):
  // ikisi de USD bazinda - fon fiyati USD'ye cevrilip MEVUS'a dogrudan kiyaslaniyor.
  const anzGrowth = buildGrowth({ fundInUSD: true });
  const uanzGrowth = buildGrowth({ fundInUSD: true });

  // ANZ'nin gerçek TL fiyatı (fon fiyatı, USD'ye çevrilmemiş) - hem *_monthly.json'un
  // bilgi kartında gösterdiği "Birim Fiyat (tarih)" satırı hem de *_static.json'daki
  // elle girilmiş "Birim Fiyat (TL)"/"(USD)" satırları buradan besleniyor. Öncesinde
  // *_monthly.json'un lastPrice alanı hiç güncellenmiyordu (sadece growth/lastDate
  // yenileniyordu) - Mete'nin 01.09.2026'da fark ettiği gibi kart tarihi güncel
  // görünürken fiyat haftalarca 31.07.2026'da donmuş kalmıştı.
  const lastDate = cleanPrice[cleanPrice.length - 1].date;
  const lastPriceTL = cleanPrice[cleanPrice.length - 1].price;
  const lastFx = fxLookup(lastDate);
  const lastPriceUSD = lastFx != null ? lastPriceTL / lastFx : null;

  const outDir = path.join(__dirname, 'data');
  for (const [code, growth] of [['anz', anzGrowth], ['uanz', uanzGrowth]]) {
    const existing = JSON.parse(fs.readFileSync(path.join(outDir, `${code}_monthly.json`), 'utf-8'));
    existing.fundCode = code.toUpperCase();
    existing.growth = growth;
    existing.lastDate = lastDate;
    existing.lastPrice = lastPriceTL;
    existing.benchmarkAvailable = ['MEVUS'];
    existing.fxAdjustment = 'fund price / USD/TRY (USD terms)';
    fs.writeFileSync(path.join(outDir, `${code}_monthly.json`), JSON.stringify(existing, null, 2));

    const staticPath = path.join(outDir, `${code}_static.json`);
    const s = JSON.parse(fs.readFileSync(staticPath, 'utf-8'));
    const setRow = (label, value) => {
      const row = (s.info || []).find(r => Array.isArray(r) && r[0] === label);
      if (row) row[1] = value;
    };
    setRow('Birim Fiyat (TL)', `${fmtTRNumber(lastPriceTL, 6)} TL`);
    if (lastPriceUSD != null) setRow('Birim Fiyat (USD)', `${fmtTRNumber(lastPriceUSD, 6)} USD`);
    fs.writeFileSync(staticPath, JSON.stringify(s, null, 2));
  }

  console.log('ANZ  last point:', JSON.stringify(anzGrowth[anzGrowth.length - 1]));
  console.log('UANZ last point:', JSON.stringify(uanzGrowth[uanzGrowth.length - 1]));
  console.log(`Birim Fiyat (${lastDate}): ${fmtTRNumber(lastPriceTL, 6)} TL / ${lastPriceUSD != null ? fmtTRNumber(lastPriceUSD, 6) : '-'} USD`);
}

main().catch(e => { console.error(e); process.exit(1); });
