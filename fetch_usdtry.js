// Fetches historical USD/TRY daily closes from Yahoo Finance (USDTRY=X) and caches them.
// Needed for ANZ/UANZ's benchmark chart: their KYD deposit benchmark (MEVUS) is USD-denominated,
// but ANZ's own fund price is TL-denominated, so comparing them requires an FX series
// (see Benchmark_Tanimlari's Notlar column: "TL fiyat icin TCMB USD/TRY ile carpilmali").
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'data', 'usdtry_cache.json');

async function fetchUsdTry() {
  const period1 = Math.floor(new Date('2015-01-01').getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/USDTRY=X?period1=${period1}&period2=${period2}&interval=1d`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo fetch failed: ${res.status}`);
  const json = await res.json();
  const result = json.chart.result[0];
  const ts = result.timestamp;
  const closes = result.indicators.quote[0].close;
  const series = [];
  for (let i = 0; i < ts.length; i++) {
    if (closes[i] == null) continue;
    series.push({ date: new Date(ts[i] * 1000).toISOString().slice(0, 10), value: closes[i] });
  }
  return series;
}

async function main() {
  const series = await fetchUsdTry();
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(series, null, 2));
  console.log(`USDTRY: ${series.length} rows, ${series[0].date} -> ${series[series.length - 1].date} (${series[series.length - 1].value})`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { fetchUsdTry, CACHE_PATH };
