@echo off
REM ============================================================
REM AYLIK TAM TUR: Butun verileri yenile + 15 PDF'i uret
REM ============================================================
REM Ay sonu broşur turunun tek adimda calistirilabilir hali.
REM Sirasi onemli: once veri, sonra render.
REM
REM ON KOSUL: Tum_Fonlar_Fiyat_ve_Getiri_Arsivi.xlsx guncel olmali
REM (Haftalik_Guncelle.ps1 / Haftalik_Guncelle_CALISTIR.bat ile).
REM Broşurler her zaman arşivin SON gunune gore uretilir; arşiv
REM 31 Temmuz'da bitiyorsa broşur de 31 Temmuz olur.
REM
REM Ayrica: rapor tarihi degistiginde data/<kod>_static.json
REM icindeki "reportDate" alani elle guncellenmeli (or. "31 Agustos 2026").
REM ============================================================
cd /d "%~dp0"

echo [1/6] Net Varlik Tutarlari TEFAS'tan aliniyor...
call node fetch_tefas_net_varlik.js
if errorlevel 1 goto hata

echo [2/6] USD/TRY kuru tazeleniyor...
call node fetch_usdtry.js
if errorlevel 1 goto hata

echo [3/6] 14 fonun fiyat/benchmark serisi arşivden cekiliyor...
for %%F in (AAL AAS AAV AED ANZ AYA DGH JET PKF PKP RTG TLZ URA YLC) do (
  echo    %%F
  call node extract_fund.js %%F
)

echo [4/6] Aylik izgara fonlari (AAL DGH AYA AAV AED TLZ)...
call node build_monthly_data.js
if errorlevel 1 goto hata

echo [5/6] Ozel bloklar: AYA temettu grafigi, ANZ/UANZ grafigi ve Guncel Bilgiler tablosu...
call node extract_aya_dividend.js
call node extract_anz_uanz_chart.js
call node update_anz_guncel_bilgiler.js

echo [6/6] 15 PDF uretiliyor...
for %%F in (JET RTG PKF PKP URA) do call node render_b2.js %%F
for %%F in (AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC) do call node render_a.js %%F

echo.
echo TAMAMLANDI. 15 PDF bu klasorde: *_Brosur_Modern.pdf
echo Yayina verilecek kopyalari ag klasorundeki tarihli klasore koyun
echo (ornek: "Fon Brosur [Cursor ^& Claude]\Brosurler_31.07.2026\").
goto son

:hata
echo.
echo HATA olustu, yukaridaki mesaja bakin. Adimlar yarim kalmis olabilir.

:son
echo.
pause
