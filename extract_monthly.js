// Aylik getiri izgarasindan (2021 oncesi tarih dahil) buyume serisi ve performans
// tablosu uretir. Veri JSON arsivinden geliyor (bkz. lib/arsiv.js); 28.08.2026'ya kadar
// Excel'den okunuyordu.
const fs = require('fs');
const path = require('path');
const { fiyatSerisi, benchSerisi, aylikIzgara } = require('./lib/arsiv');

// Aylik tablo basliklari (render_a.js de bu listeyi kullaniyor)
const MONTH_COLS = ['Oca', 'Sub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Agu', 'Eyl', 'Eki', 'Kas', 'Ara'];

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

async function extractMonthly(fundCode, benchmarkComponents) {
  const priceRows = fiyatSerisi(fundCode);
  const lastPriceRow = priceRows.filter(r => r.price > 0).pop();

  const years = (aylikIzgara()[fundCode] || []).map(y => ({ year: y.year, months: y.months.slice(), ybb: y.ybb }));
  years.sort((a, b) => a.year - b.year);

  // The grid stores 0 (not blank) for months outside the fund's active lifetime (before
  // inception, or after "today"). Null out leading/trailing runs of exact 0 so they render
  // blank; a genuine mid-series 0.0% return (it happens) is left alone since it's not part
  // of a leading/trailing run.
  const cells = [];
  years.forEach((y, yi) => y.months.forEach((m, mi) => cells.push({ yi, mi, m })));
  let start = 0;
  while (start < cells.length && cells[start].m === 0) start++;
  let end = cells.length - 1;
  while (end >= 0 && cells[end].m === 0) end--;
  cells.forEach((c, i) => {
    if (i < start || i > end) years[c.yi].months[c.mi] = null;
  });

  // "Ay kapama": auto-compute any month(s) that have fully closed since the Aylik_Getiri_Grid
  // was last updated, using the same manual formula (bugün otomatik): month-end price / previous
  // month's last-trading-day price - 1. A month only counts as "closed" once the archive has
  // price data reaching into a LATER month (so the current, still-in-progress month is never
  // guessed at). This lets the pipeline stay current without anyone hand-editing the grid.
  const cleanPriceRows = priceRows.filter(r => r.price > 0);
  // buildOnOrBeforeLookup r.value okuyor, fiyat satirlari ise r.price tasiyor - bu esleme
  // atlandigi icin "ay kapama" otomatigi bugune kadar sessizce hic tetiklenmemisti (lookup
  // her zaman undefined donuyordu). Alani cevirerek duzeltildi (28.08.2026).
  const priceOnOrBefore = buildOnOrBeforeLookup(cleanPriceRows.map(r => ({ date: r.date, value: r.price })));
  const monthKey = (y, m) => y * 12 + m;
  const lastPriceMonthKey = monthKey(Number(lastPriceRow.date.slice(0, 4)), Number(lastPriceRow.date.slice(5, 7)) - 1);

  function endOfMonthStr(y, m) {
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // find last (year, monthIdx) already present (non-null) in the grid
  let lastGridKey = -Infinity;
  years.forEach(y => y.months.forEach((m, mi) => { if (m != null) lastGridKey = Math.max(lastGridKey, monthKey(y.year, mi)); }));

  const touchedYears = new Set();
  if (lastGridKey > -Infinity) {
    for (let k = lastGridKey + 1; k < lastPriceMonthKey; k++) {
      const y = Math.floor(k / 12), m = k % 12;
      const thisEnd = priceOnOrBefore(endOfMonthStr(y, m));
      const prevK = k - 1;
      const py = Math.floor(prevK / 12), pm = prevK % 12;
      const prevEnd = priceOnOrBefore(endOfMonthStr(py, pm));
      if (thisEnd == null || prevEnd == null) continue;
      const ret = thisEnd / prevEnd - 1;
      let yearEntry = years.find(ye => ye.year === y);
      if (!yearEntry) { yearEntry = { year: y, months: new Array(12).fill(null), ybb: null }; years.push(yearEntry); years.sort((a, b) => a.year - b.year); }
      yearEntry.months[m] = ret;
      touchedYears.add(y);
    }
  }
  // recompute YBB (yılbaşından beri) for any year that just received an auto-closed month
  touchedYears.forEach(y => {
    const yearEntry = years.find(ye => ye.year === y);
    const known = yearEntry.months.filter(m => m != null);
    if (known.length > 0) yearEntry.ybb = known.reduce((acc, r) => acc * (1 + r), 1) - 1;
  });

  // flat chronological list of {year, monthIdx, return} for compounding + chart x-axis
  const flat = [];
  years.forEach(y => y.months.forEach((r, mi) => { if (r != null) flat.push({ year: y.year, monthIdx: mi, return: r }); }));

  // fund monthly-compounded index, 100 at the point just before the first return
  let idx = 100;
  const fundSeries = flat.map(f => {
    idx = idx * (1 + f.return);
    return { year: f.year, monthIdx: f.monthIdx, fundIndex: idx };
  });

  let benchSeries = null;
  if (benchmarkComponents && benchmarkComponents.length > 0) {
    const benchByCode = new Map();
    for (const c of benchmarkComponents) {
      const rows = benchSerisi(c.symbol);
      if (rows.length) benchByCode.set(c.symbol, rows);
    }

    const lookups = benchmarkComponents.map(c => buildOnOrBeforeLookup(benchByCode.get(c.symbol) || []));
    const weightSum = benchmarkComponents.reduce((s, c) => s + c.weight, 0);

    function monthEndValue(year, monthIdx) {
      const lastDay = new Date(Date.UTC(year, monthIdx + 1, 0)).getDate();
      const dateStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      let composite = 0;
      for (let i = 0; i < lookups.length; i++) {
        const v = lookups[i](dateStr);
        if (v == null) return null;
        composite += (benchmarkComponents[i].weight / weightSum) * v;
      }
      return composite;
    }

    // month just before the first fund data point (to anchor index at 100)
    const first = flat[0];
    const prevMonthIdx = first.monthIdx === 0 ? 11 : first.monthIdx - 1;
    const prevYear = first.monthIdx === 0 ? first.year - 1 : first.year;
    const anchorVal = monthEndValue(prevYear, prevMonthIdx);

    if (anchorVal != null) {
      benchSeries = flat.map(f => {
        const v = monthEndValue(f.year, f.monthIdx);
        return { year: f.year, monthIdx: f.monthIdx, benchIndex: v != null ? (v / anchorVal) * 100 : null };
      });
    }
  }

  const growth = fundSeries.map((f, i) => ({
    date: `${f.year}-${String(f.monthIdx + 1).padStart(2, '0')}-01`,
    fundIndex: f.fundIndex,
    benchIndex: benchSeries ? benchSeries[i].benchIndex : null,
  }));

  return {
    fundCode,
    years,
    growth,
    lastDate: lastPriceRow.date,
    lastPrice: lastPriceRow.price,
    benchmarkApproximate: false,
    benchmarkAvailable: benchSeries ? benchmarkComponents.map(c => c.symbol) : [],
  };
}

module.exports = { extractMonthly, MONTH_COLS };
