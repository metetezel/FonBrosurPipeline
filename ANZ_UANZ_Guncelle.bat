@echo off
REM ============================================================
REM ANZ / UANZ Guncelleme Prosedueru
REM ============================================================
REM Bu script, ANZ/UANZ fon karti icin normalde Elmas Ozturk'un
REM elle hazirlayip mail ile gonderdigi "Fon'un Guncel Bilgileri"
REM tablosunu VE "ATA Eurobond Fonu vs. USD Mevduat" grafigini
REM otomatik olarak yeniden hesaplar ve PDF'leri yeniden uretir.
REM
REM Ne zaman calistirilmali: Elmas'tan yeni bir ANZ tablosu
REM geldiginde, ya da USD/TRY kurunda/fiyatlarda buyuk bir
REM hareket oldugunda (grafigin guncel kalmasi icin).
REM
REM Adimlar:
REM   1) USD/TRY gunluk kurunu Yahoo Finance'ten tazele
REM   2) ANZ/UANZ "vs USD Mevduat" grafik verisini yeniden hesapla
REM   3) Eurobond portfoyunden (Book2.xlsx) YTM/vade tablosunu
REM      hesapla ve ekrana yazdir (goz ile kontrol icin)
REM   4) Hesaplanan tabloyu anz_static.json / uanz_static.json'a yaz
REM   5) Her iki PDF'i yeniden uret
REM ============================================================
cd /d "%~dp0"

echo [1/5] USD/TRY kuru tazeleniyor...
call node fetch_usdtry.js
if errorlevel 1 goto hata

echo [2/5] ANZ/UANZ grafik verisi yeniden hesaplaniyor...
call node extract_anz_uanz_chart.js
if errorlevel 1 goto hata

echo [3/5] Eurobond YTM/vade tablosu hesaplaniyor (kontrol icin)...
call node compute_anz_table.js ANZ

echo [4/5] Guncel Bilgiler tablosu anz_static.json / uanz_static.json'a yaziliyor...
call node update_anz_guncel_bilgiler.js
if errorlevel 1 goto hata

echo [5/5] PDF'ler yeniden uretiliyor...
call node render_a.js ANZ
call node render_a.js UANZ

echo.
echo TAMAMLANDI. out\ANZ_Brosur_Modern.pdf ve out\UANZ_Brosur_Modern.pdf guncellendi.
echo Not: "Mevduat Esligi" satiri da (28.08.2026'dan beri) otomatik hesaplaniyor -
echo net getiri / (1 - mevduat stopaji %25). Tablonun tamami artik otomatik.
goto son

:hata
echo.
echo HATA olustu, yukaridaki mesaja bakin. PDF'ler yeniden uretilmemis olabilir.

:son
echo.
pause
