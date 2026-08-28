const ExcelJS = require('exceljs');
const path = "//atafiles/Ata.Portföy/Mete Tezel/Fon Broşür [Cursor & Claude]/Proje_Gelistirme/Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx";

(async () => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  wb.eachSheet((sheet) => {
    console.log(sheet.name, '-> rows:', sheet.rowCount, 'cols:', sheet.columnCount);
  });
})();
