const fs = require('fs');
const path = require('path');
const { extractMonthly } = require('./extract_monthly');

// Buyume grafiginde cizilen seriler artik data/benchmark_tanimlari.json'un "grafik"
// bolumunde (tek kaynak: fonun formal olcutu de ayni dosyada). Onceden bu harita burada,
// formal tanimlar Excel'de, getiri-endeksi cevrimleri extract_fund.js'te duruyordu.
const { benchmarkTanimlari } = require('./lib/arsiv');
const BENCH = benchmarkTanimlari().grafik;

(async () => {
  const code = process.argv[2];
  const codes = code ? [code] : Object.keys(BENCH);
  for (const c of codes) {
    const out = await extractMonthly(c, BENCH[c]);
    fs.writeFileSync(path.join(__dirname, 'data', `${c.toLowerCase()}_monthly.json`), JSON.stringify(out, null, 2));
    console.log(c, 'years:', out.years.length, 'lastDate:', out.lastDate, 'lastPrice:', out.lastPrice, 'growth pts:', out.growth.length, 'benchAvail:', out.benchmarkAvailable);
  }
})();
