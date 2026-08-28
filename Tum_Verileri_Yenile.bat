@echo off
REM ============================================================
REM HAFTALIK TUR: Butun verileri yenile + 15 PDF'i uret
REM ============================================================
REM Haftalik broşur turunun tek adimda calistirilabilir hali.
REM NE ZAMAN: her persembe ogleden sonra. TEFAS o gunun fiyatini heniz
REM yayinlamadiysa brosurler carsamba tarihli olur - 1. adim hangi tarihe
REM dustugunu gun adiyla birlikte basiyor. Sira onemli: once veri, sonra render.
REM
REM ON KOSUL YOK: Excel'e ihtiyac kalmadi. Arsiv data/*.json dosyalarinda
REM ve ilk adim onu dogrudan TEFAS/Borsa Istanbul/Nasdaq'tan buyutuyor.
REM Broşurler her zaman arsivin SON gunune gore uretilir.
REM
REM Rapor tarihi ELLE GUNCELLENMEZ: arsivin son gununden turetiliyor
REM (lib/static.js reportDateFor). Her hafta tarih rozeti ve yayin
REM klasoru adi kendiliginden ilerler.
REM ============================================================
cd /d "%~dp0"

echo [1/9] Arsiv API'lerden buyutuluyor (TEFAS fiyat + BIST/Nasdaq endeks)...
REM NOT: bu adim brosurun rapor tarihini de ilerletir (rapor tarihi = verinin
REM son gunu). Ne eklenecegini once gormek icin: node fetch_arsiv.js --dene
call node fetch_arsiv.js
if errorlevel 1 goto hata

echo [2/9] Kart bilgileri KAP'tan aliniyor (risk degeri, yonetim ucreti, kurucu, denetci)...
call node fetch_kap_fund_info.js --yaz
if errorlevel 1 goto hata

echo [3/9] Net Varlik Tutarlari TEFAS'tan aliniyor...
call node fetch_tefas_net_varlik.js
if errorlevel 1 goto hata

echo [4/9] USD/TRY kuru tazeleniyor...
call node fetch_usdtry.js
if errorlevel 1 goto hata

echo [5/9] 14 fonun fiyat/benchmark serisi arşivden cekiliyor...
for %%F in (AAL AAS AAV AED ANZ AYA DGH JET PKF PKP RTG TLZ URA YLC) do (
  echo    %%F
  call node extract_fund.js %%F
)

echo [6/9] Aylik izgara fonlari (AAL DGH AYA AAV AED TLZ)...
call node build_monthly_data.js
if errorlevel 1 goto hata

echo [7/9] Ozel bloklar: AYA temettu grafigi, ANZ/UANZ grafigi ve Guncel Bilgiler tablosu...
call node extract_aya_dividend.js
call node extract_anz_uanz_chart.js
call node update_anz_guncel_bilgiler.js

echo [8/9] 15 PDF uretiliyor...
for %%F in (JET RTG PKF PKP URA) do call node render_b2.js %%F
for %%F in (AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC) do call node render_a.js %%F

echo [9/9] PDF'ler ag klasorundeki tarihli yayin klasorune kopyalaniyor...
call node export_pdfs.js

echo.
echo TAMAMLANDI. 15 PDF bu klasorde: *_Brosur_Modern.pdf
echo Yayin kopyalari: "Fon Brosur [Cursor ^& Claude]\Brosurler\<rapor tarihi>\"
goto son

:hata
echo.
echo HATA olustu, yukaridaki mesaja bakin. Adimlar yarim kalmis olabilir.

:son
echo.
pause
