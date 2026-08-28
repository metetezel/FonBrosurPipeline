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
REM Rapor tarihi ELLE GUNCELLENMEZ: arsivin son gununden turetiliyor
REM (lib/static.js reportDateFor). Arsiv Agustos'a uzayinca broşurun
REM tarih rozeti ve yayin klasoru adi kendiliginden ilerler.
REM ============================================================
cd /d "%~dp0"

echo [1/8] Kart bilgileri KAP'tan aliniyor (risk degeri, yonetim ucreti, kurucu, denetci)...
call node fetch_kap_fund_info.js --yaz
if errorlevel 1 goto hata

echo [2/8] Net Varlik Tutarlari TEFAS'tan aliniyor...
call node fetch_tefas_net_varlik.js
if errorlevel 1 goto hata

echo [3/8] USD/TRY kuru tazeleniyor...
call node fetch_usdtry.js
if errorlevel 1 goto hata

echo [4/8] 14 fonun fiyat/benchmark serisi arşivden cekiliyor...
for %%F in (AAL AAS AAV AED ANZ AYA DGH JET PKF PKP RTG TLZ URA YLC) do (
  echo    %%F
  call node extract_fund.js %%F
)

echo [5/8] Aylik izgara fonlari (AAL DGH AYA AAV AED TLZ)...
call node build_monthly_data.js
if errorlevel 1 goto hata

echo [6/8] Ozel bloklar: AYA temettu grafigi, ANZ/UANZ grafigi ve Guncel Bilgiler tablosu...
call node extract_aya_dividend.js
call node extract_anz_uanz_chart.js
call node update_anz_guncel_bilgiler.js

echo [7/8] 15 PDF uretiliyor...
for %%F in (JET RTG PKF PKP URA) do call node render_b2.js %%F
for %%F in (AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC) do call node render_a.js %%F

echo [8/8] PDF'ler ag klasorundeki tarihli yayin klasorune kopyalaniyor...
call node export_pdfs.js

echo.
echo TAMAMLANDI. 15 PDF bu klasorde: *_Brosur_Modern.pdf
echo Yayin kopyalari: "Fon Brosur [Cursor ^& Claude]\Brosurler_<rapor tarihi>\"
goto son

:hata
echo.
echo HATA olustu, yukaridaki mesaja bakin. Adimlar yarim kalmis olabilir.

:son
echo.
pause
