@echo off
REM ============================================================
REM Tum Fonlari Yeniden Uretme Prosedueru (15 fon)
REM ============================================================
REM Bu script, 15 fonun HTML/CSS+Playwright broşür PDF'lerini
REM mevcut data/*.json dosyalarindan yeniden uretir.
REM
REM DIKKAT: Bu script fiyat/benchmark verisini GUNCELLEMEZ, sadece
REM data/ klasorundeki HALIHAZIRDA VAR OLAN veriden PDF'i yeniden
REM cizer (ornegin bir CSS/sablon duzeltmesinden sonra tum
REM fonlari tek seferde yenilemek icin kullanislidir).
REM Veriyi tazelemek icin once ilgili extract_*.js script'i
REM (extract_fund.js / extract_monthly.js / fetch_usdtry.js vb.)
REM calistirilmali.
REM
REM Fon aileleri:
REM   B2 ailesi (render_b2.js): JET RTG PKF PKP URA
REM   A ailesi  (render_a.js) : AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC
REM ============================================================
cd /d "%~dp0"

echo === B2 ailesi (tek tarayici oturumu) ===
call node render_b2.js JET RTG PKF PKP URA
if errorlevel 1 goto hata

echo === A ailesi (tek tarayici oturumu) ===
call node render_a.js AAL AAS AAV AED ANZ AYA DGH TLZ UANZ YLC
if errorlevel 1 goto hata

echo.
echo TAMAMLANDI. 15 fonun PDF'i de bu klasorde (*_Brosur_Modern.pdf) guncellendi.
goto son

:hata
echo.
echo HATA: render basarisiz oldu, yukaridaki mesaja bakin. PDF'lerin bir kismi
echo gecen turdan kalmis olabilir - sorunu duzeltip tekrar calistirin.

:son
echo.
pause
