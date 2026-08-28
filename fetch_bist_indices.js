const fs = require('fs');
const path = require('path');

// All benchmark-component symbols that were previously "anlık-only" (missing from Bench_Sabit_Arsiv),
// discovered via Borsa İstanbul's own official chart-data endpoint (used by borsaistanbul.com's index detail pages).
const CODES = [
  'ATORT', 'KARTL', 'XUTEK', 'XBLSM', 'XELKT', 'TKISA', 'REPBR', 'EUSTL', 'MEVUS', 'REPNT', 'XTM25', 'XGIDA',
  // True "Getiri" (total-return, dividend-reinvested) variants — found 28.08.2026 via the same
  // API. Naming pattern: <price-index-code>_CFNNTLTL. These replace the price-only proxies
  // (XU100.IS etc, sourced from Yahoo) that every fund benchmark using a BIST index was
  // approximating with until now — a limitation flagged since the very start of this project.
  'XU100_CFNNTLTL', 'XU030_CFNNTLTL', 'XUTEK_CFNNTLTL', 'XBLSM_CFNNTLTL', 'XELKT_CFNNTLTL', 'XGIDA_CFNNTLTL', 'XTM25_CFNNTLTL',
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

async function fetchOne(code) {
  const url = `https://www.borsaistanbul.com/graphic.php?veriTuru=endeks-graphic&indexCode=${encodeURIComponent(code)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  if (json.status !== 'success' || !Array.isArray(json.data)) {
    throw new Error(`${code}: unexpected response ${JSON.stringify(json).slice(0, 200)}`);
  }
  const rows = json.data
    .map(d => ({ date: d.hisTs, value: Number(d.clval) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return rows;
}

(async () => {
  const out = {};
  for (const code of CODES) {
    process.stdout.write(`fetching ${code}... `);
    try {
      const rows = await fetchOne(code);
      out[code] = rows;
      console.log(`${rows.length} rows, ${rows[0].date} .. ${rows[rows.length - 1].date}`);
    } catch (err) {
      console.log('FAILED', err.message);
    }
    // be polite to the server
    await new Promise(r => setTimeout(r, 300));
  }
  const outDir = path.join(__dirname, 'data');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'bist_indices_cache.json'), JSON.stringify(out, null, 0));
  console.log('wrote data/bist_indices_cache.json');
})();
