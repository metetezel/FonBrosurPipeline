const fs = require('fs');
const path = require('path');
const { extractMonthly } = require('./extract_monthly');

const BENCH = {
  AAL: [{ weight: 0.4, symbol: 'TKISA' }, { weight: 0.6, symbol: 'REPBR' }],
  DGH: [{ weight: 1, symbol: 'REPNT' }],
  // XU100_CFNNTLTL = the TRUE BIST-100 Getiri (total-return, dividend-reinvested) index, found
  // 28.08.2026 via Borsa İstanbul's own API — replaces the price-only XU100.IS (Yahoo) proxy
  // used everywhere until now.
  AYA: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }], // chart legend in the real PDF plots vs BIST-100 Getiri Endeksi, not the formal Temettü-25 benchmark (XTM25 only has data from 2011-07, AYA inception is 2010-06)
  AAV: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }],
  AED: [{ weight: 0.55, symbol: 'XU100_CFNNTLTL' }, { weight: 0.15, symbol: 'REPBR' }, { weight: 0.15, symbol: 'EUSTL' }, { weight: 0.15, symbol: 'ATORT' }],
  TLZ: [{ weight: 1, symbol: 'XU100_CFNNTLTL' }],
};

(async () => {
  const code = process.argv[2];
  const codes = code ? [code] : Object.keys(BENCH);
  for (const c of codes) {
    const out = await extractMonthly(c, BENCH[c]);
    fs.writeFileSync(path.join(__dirname, 'data', `${c.toLowerCase()}_monthly.json`), JSON.stringify(out, null, 2));
    console.log(c, 'years:', out.years.length, 'lastDate:', out.lastDate, 'lastPrice:', out.lastPrice, 'growth pts:', out.growth.length, 'benchAvail:', out.benchmarkAvailable);
  }
})();
