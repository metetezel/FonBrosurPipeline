@echo off
REM ============================================================
REM HAFTALIK TUR: Butun verileri yenile + 15 PDF'i uret
REM ============================================================
REM Haftalik broşur turunun tek adimda calistirilabilir hali.
REM NE ZAMAN: her persembe ogleden sonra.
REM IKI TARIH VAR: brosurun basligindaki rozet = PDF'i urettigimiz gun (yayin
REM tarihi); rakamlarin ait oldugu gun = HER ZAMAN T-1 (bugunun verisi arsive
REM yazilir ama hesaba katilmaz). Bilgi kartindaki "Birim Fiyat (tarih)" satiri
REM veri tarihini gosterir. Adimlar ikisini de gun adiyla basiyor.
REM Sira onemli: once veri, sonra render.
REM
REM ON KOSUL YOK: Excel'e ihtiyac kalmadi. Arsiv data/*.json dosyalarinda
REM ve ilk adim onu dogrudan TEFAS/Borsa Istanbul/Nasdaq'tan buyutuyor.
REM Broşurler her zaman arsivin SON gunune gore uretilir.
REM
REM Hicbir tarih elle guncellenmez: rozet ve klasor adi yayin gununden,
REM rakamlar arsivden gelir. Her hafta kendiliginden ilerler.
REM ============================================================
cd /d "%~dp0"

echo [1/12] Arsiv API'lerden buyutuluyor (TEFAS fiyat + BIST/Nasdaq endeks)...
REM NOT: bu adim brosurun rapor tarihini de ilerletir (rapor tarihi = verinin
REM son gunu). Ne eklenecegini once gormek icin: node fetch_arsiv.js --dene
call node fetch_arsiv.js
if errorlevel 1 goto hata

echo [2/12] Kart bilgileri KAP'tan aliniyor (risk degeri, yonetim ucreti, kurucu, denetci)...
call node fetch_kap_fund_info.js --yaz
if errorlevel 1 goto hata

echo [3/12] Portfoy dagilimi TEFAS'tan aliniyor...
call node fetch_tefas_dagilim.js --yaz
if errorlevel 1 goto hata

echo [4/12] Net Varlik Tutarlari TEFAS'tan aliniyor...
call node fetch_tefas_net_varlik.js
if errorlevel 1 goto hata

echo [5/12] USD/TRY kuru tazeleniyor...
call node fetch_usdtry.js
if errorlevel 1 goto hata

echo [6/12] 14 fonun fiyat/benchmark serisi arşivden cekiliyor...
for %%F in (AAL AAS AAV AED ANZ AYA DGH JET PKF PKP RTG TLZ URA YLC) do (
  echo    %%F
  call node extract_fund.js %%F
)

echo [7/12] Aylik izgara fonlari (AAL DGH AYA AAV AED TLZ)...
call node build_monthly_data.js
if errorlevel 1 goto hata

echo [8/12] Ozel bloklar: AYA temettu grafigi, ANZ/UANZ grafigi ve Guncel Bilgiler tablosu...
call node extract_aya_dividend.js
call node extract_anz_uanz_chart.js
call node update_anz_guncel_bilgiler.js

echo [9/12] 15 PDF uretiliyor...
call node render_b2.js JET RTG PKF PKP URA
if errorlevel 1 goto hata
call node render_a.js AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC
if errorlevel 1 goto hata

echo [10/12] PDF'ler ag klasorundeki tarihli yayin klasorune kopyalaniyor...
call node export_pdfs.js
if errorlevel 1 goto hata

echo [11/12] Tur ozeti: gecen tura gore ne degisti + veri saglik kontrolu...
call node tur_ozeti.js

echo [12/12] Tur ciktisi GitHub'a kaydediliyor...
REM Kayit artik islevsel: tur_ozeti "gecen tura gore ne degisti"yi git gecmisinden
REM okuyor, yani commit'lenmeyen bir tur karsilastirma penceresini sessizce genisletir.
REM Ayrica diger makine (notebook) ayni arsivi ancak push edilirse gorur.
call "%~dp0GitHub_Kaydet_Yukle.bat" /sessiz "Haftalik tur: %date%"
if errorlevel 1 (
  echo.
  echo UYARI: GitHub'a kaydedilemedi. Brosurler uretildi ve yayin klasorune
  echo kopyalandi - eksik olan sadece kayit. GitHub_Kaydet_BASLAT.bat ile tekrar
  echo deneyin, aksi halde diger makine eski veriyi gorur.
)

echo.
echo TAMAMLANDI. 15 PDF out klasorunde: out\*_Brosur_Modern.pdf
echo Yayin kopyalari: "Fon Brosur [Cursor ^& Claude]\Brosurler\<rapor tarihi>\"
goto son

:hata
echo.
echo HATA olustu, yukaridaki mesaja bakin. Adimlar yarim kalmis olabilir.

:son
echo.
pause
