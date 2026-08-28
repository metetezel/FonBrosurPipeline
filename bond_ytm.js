// Standard bond Yield-to-Maturity (YTM) solver, used to reproduce "Ortalama Getiri" style
// weighted-average figures for ANZ/UANZ from Farshad's raw daily holdings file (Book2.xlsx),
// which has position-level data (coupon, price, maturity) but no pre-computed yield column.

function addMonthsUTC(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));
}

// Remaining coupon dates (all in the future relative to `asOf`), working backward from maturity
// in fixed `intervalMonths` steps — the standard assumption for a regular coupon schedule.
function couponSchedule(maturity, intervalMonths, asOf) {
  const dates = [];
  let d = maturity;
  while (d > asOf) {
    dates.push(d);
    d = addMonthsUTC(d, -intervalMonths);
  }
  return dates.reverse();
}

function yearsBetween(a, b) {
  return (b.getTime() - a.getTime()) / (365.25 * 86400000);
}

// price = sum of discounted cashflows at yield y (annualized, compounded `freq` times/year)
function bondPriceAtYield(y, cashflows, freq) {
  return cashflows.reduce((sum, cf) => sum + cf.amount / Math.pow(1 + y / freq, freq * cf.t), 0);
}

function solveYTM(targetPrice, cashflows, freq) {
  let lo = -0.5, hi = 5.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const p = bondPriceAtYield(mid, cashflows, freq);
    if (p > targetPrice) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * bond: { couponRate, intervalMonths, maturity (Date), price (per 100 face), faceValue, marketValue }
 * asOf: Date - valuation/report date
 */
function bondCashflows(bond, asOf) {
  const freq = 12 / bond.intervalMonths;
  const schedule = couponSchedule(bond.maturity, bond.intervalMonths, asOf);
  const couponAmt = 100 * bond.couponRate / freq;
  const cashflows = schedule.map((d, i) => ({
    t: yearsBetween(asOf, d),
    amount: couponAmt + (i === schedule.length - 1 ? 100 : 0),
  }));
  return { freq, cashflows };
}

/**
 * Tahakkuk etmiş faiz (accrued interest), 100 nominal başına.
 *
 * Kotasyon "temiz fiyat" (accrued hariç) ama alıcı gerçekte temiz fiyat + accrued ödüyor.
 * YTM, gelecek nakit akışlarının bugünkü değerini KİRLİ fiyata eşitler; temiz fiyatla
 * karşılaştırmak getiriyi sistematik olarak şişirir. Etki, kuponu büyük ve kupon tarihine
 * yakın bonolarda dramatik: ANZ'nin %20 kuponlu satırı (bir sonraki kupona ~5 hafta, yani
 * ~11 aylık accrued) düzeltmeden önce %27,5 getiri veriyordu — par fiyatlı bir bononun
 * getirisi kuponuna eşit olmalı, yani ~%20.
 */
function accruedInterest(bond, asOf) {
  const freq = 12 / bond.intervalMonths;
  const schedule = couponSchedule(bond.maturity, bond.intervalMonths, asOf);
  if (schedule.length === 0) return 0;
  const donemYil = bond.intervalMonths / 12;
  const sonrakiKupona = yearsBetween(asOf, schedule[0]);
  const gecenOran = Math.min(Math.max(1 - sonrakiKupona / donemYil, 0), 1);
  return (100 * bond.couponRate / freq) * gecenOran;
}

function bondYTM(bond, asOf) {
  const { freq, cashflows } = bondCashflows(bond, asOf);
  if (cashflows.length === 0) return null;
  return solveYTM(bond.price + accruedInterest(bond, asOf), cashflows, freq);
}

// Macaulay duration (in years): PV-weighted average time of a bond's remaining
// cashflows, discounted at its own yield. Always shorter than time-to-maturity
// for a coupon bond, since coupons return part of the investment earlier.
function macaulayDuration(bond, asOf, ytm) {
  const { freq, cashflows } = bondCashflows(bond, asOf);
  if (cashflows.length === 0) return null;
  let pvSum = 0, tPvSum = 0;
  for (const cf of cashflows) {
    const pv = cf.amount / Math.pow(1 + ytm / freq, freq * cf.t);
    pvSum += pv;
    tPvSum += cf.t * pv;
  }
  return tPvSum / pvSum;
}

module.exports = { bondYTM, macaulayDuration, accruedInterest, couponSchedule, yearsBetween };
