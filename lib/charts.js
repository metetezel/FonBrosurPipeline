const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

function fmtTick(dateStr) {
  const [y, m] = dateStr.split('-');
  return `${MONTHS_TR[parseInt(m, 10) - 1]} '${y.slice(2)}`;
}

/**
 * Renders a growth line chart (fund vs benchmark, indexed to 100) as an inline SVG string.
 * points: [{date, fundIndex, benchIndex}]
 */
function growthChartSVG(points, opts = {}) {
  const width = opts.width || 900;
  const height = opts.height || 320;
  const margin = { top: 20, right: 24, bottom: 36, left: 44 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;

  const allValues = [];
  points.forEach(p => {
    allValues.push(p.fundIndex);
    if (p.benchIndex != null) allValues.push(p.benchIndex);
  });
  const minV = Math.floor(Math.min(...allValues, 100) / 20) * 20 - 10;
  const maxV = Math.ceil(Math.max(...allValues) / 20) * 20 + 10;

  const n = points.length;
  const x = i => margin.left + (innerW * i) / (n - 1);
  const y = v => margin.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  // gridlines (5 horizontal bands)
  const gridSteps = 6;
  let gridLines = '';
  let axisLabels = '';
  for (let i = 0; i <= gridSteps; i++) {
    const v = minV + ((maxV - minV) * i) / gridSteps;
    const yy = y(v);
    gridLines += `<line x1="${margin.left}" y1="${yy.toFixed(1)}" x2="${width - margin.right}" y2="${yy.toFixed(1)}" class="grid-line" />`;
    axisLabels += `<text x="${margin.left - 8}" y="${(yy + 3).toFixed(1)}" text-anchor="end" class="axis-label">${Math.round(v)}</text>`;
  }

  // x-axis ticks: calendar-aligned month-start ticks (spacing is even in time, not just in row-index,
  // which avoids uneven gaps when the underlying data has irregular density e.g. near the very start/end).
  function findIndexOnOrAfter(targetDateStr) {
    let lo = 0, hi = n - 1, ans = n - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].date >= targetDateStr) { ans = mid; hi = mid - 1; } else lo = mid + 1;
    }
    return ans;
  }

  const firstD = new Date(points[0].date + 'T00:00:00Z');
  const lastD = new Date(points[n - 1].date + 'T00:00:00Z');
  const totalMonths = (lastD.getUTCFullYear() - firstD.getUTCFullYear()) * 12 + (lastD.getUTCMonth() - firstD.getUTCMonth());
  const niceSteps = [1, 2, 3, 6, 12, 24, 36];
  const step = niceSteps.find(s => s >= totalMonths / 8) || 48;

  // Anchor ticks on the actual first data date (not the 1st of its month) and step forward by
  // exact calendar months from there, so every gap is the same number of days apart (no short
  // first/last interval when a fund's inception falls mid-month).
  let xLabels = '';
  let lastIdxUsed = -1;
  for (let k = 0; ; k++) {
    const cursor = new Date(Date.UTC(firstD.getUTCFullYear(), firstD.getUTCMonth() + k * step, firstD.getUTCDate()));
    if (cursor > lastD) break;
    const idx = findIndexOnOrAfter(cursor.toISOString().slice(0, 10));
    if (idx > lastIdxUsed) {
      const xx = x(idx);
      xLabels += `<text x="${xx.toFixed(1)}" y="${height - margin.bottom + 18}" text-anchor="middle" class="axis-label">${fmtTick(points[idx].date)}</text>`;
      lastIdxUsed = idx;
    }
  }

  function pathFor(key) {
    let d = '';
    points.forEach((p, i) => {
      const v = p[key];
      if (v == null) return;
      d += (d === '' ? 'M' : 'L') + `${x(i).toFixed(1)},${y(v).toFixed(1)} `;
    });
    return d;
  }

  const fundPath = pathFor('fundIndex');
  const benchPath = pathFor('benchIndex');

  // area fill under fund line
  const lastIdx = n - 1;
  const areaPath = `${fundPath} L${x(lastIdx).toFixed(1)},${(margin.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(margin.top + innerH).toFixed(1)} Z`;

  // optional: label the final value of each line right at its end point (e.g. "680,2"),
  // so the current headline numbers are visible on the chart itself, not just in the legend.
  let endLabels = '';
  if (opts.showEndLabels) {
    const lastPoint = points[lastIdx];
    const fmtNum = v => v.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const label = (key, color, dy) => {
      const v = lastPoint[key];
      if (v == null) return '';
      const xx = x(lastIdx);
      const yy = y(v);
      return `<circle cx="${xx.toFixed(1)}" cy="${yy.toFixed(1)}" r="2.6" fill="${color}"/>
        <text x="${(xx - 6).toFixed(1)}" y="${(yy + dy).toFixed(1)}" text-anchor="end" font-size="10" font-weight="700" fill="${color}">${fmtNum(v)}</text>`;
    };
    const fundAboveBench = (lastPoint.fundIndex || 0) >= (lastPoint.benchIndex ?? -Infinity);
    endLabels = label('fundIndex', '#00677E', fundAboveBench ? -7 : 13) + label('benchIndex', '#E8792A', fundAboveBench ? 13 : -7);
  }

  return `
<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" class="growth-chart">
  <defs>
    <linearGradient id="fundArea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#00677E" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#00677E" stop-opacity="0"/>
    </linearGradient>
  </defs>
  ${gridLines}
  <path d="${areaPath}" fill="url(#fundArea)" stroke="none"/>
  <path d="${benchPath}" fill="none" stroke="#E8792A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${fundPath}" fill="none" stroke="#00677E" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  <line x1="${margin.left}" y1="${margin.top + innerH}" x2="${width - margin.right}" y2="${margin.top + innerH}" class="axis-line"/>
  ${axisLabels}
  ${xLabels}
  ${endLabels}
</svg>`;
}

/**
 * Renders a thin-ring donut chart as inline SVG.
 * segments: [{label, pct, color}]
 */
function donutChartSVG(segments, opts = {}) {
  const size = opts.size || 200;
  const strokeWidth = opts.strokeWidth || 26;
  const r = (size - strokeWidth) / 2;
  const cx = size / 2, cy = size / 2;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  let arcs = '';
  segments.forEach(seg => {
    const len = (seg.pct / 100) * circumference;
    arcs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}"
      stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})" stroke-linecap="butt"/>`;
    offset += len;
  });

  return `
<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="donut-chart">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#EEF2F3" stroke-width="${strokeWidth}"/>
  ${arcs}
</svg>`;
}

module.exports = { growthChartSVG, donutChartSVG, fmtTick };
