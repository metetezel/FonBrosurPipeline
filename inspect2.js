const ExcelJS = require('exceljs');
const path = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/Proje_Gelistirme/Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx";

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);

  const fiyat = wb.getWorksheet('Fiyat_Sabit_Arsiv');
  console.log('--- Fiyat_Sabit_Arsiv header ---');
  console.log(fiyat.getRow(1).values);
  console.log(fiyat.getRow(2).values);
  console.log(fiyat.getRow(3).values);

  const bench = wb.getWorksheet('Bench_Sabit_Arsiv');
  console.log('--- Bench_Sabit_Arsiv header ---');
  console.log(bench.getRow(1).values);
  console.log(bench.getRow(2).values);

  const def = wb.getWorksheet('Benchmark_Tanimlari');
  console.log('--- Benchmark_Tanimlari header ---');
  console.log(def.getRow(1).values);
  console.log('--- Benchmark_Tanimlari JET rows ---');
  def.eachRow((row, idx) => {
    const vals = row.values;
    if (vals && vals.some(v => typeof v === 'string' && v.includes('JET'))) {
      console.log(idx, vals);
    }
  });
})();
