@echo off
REM ============================================================
REM GitHub'a Kaydet ve Yukle Prosedueru
REM ============================================================
REM Bu script, pipeline kodundaki (bu klasor) degisiklikleri
REM GitHub deposuna (github.com/metetezel/FonBrosurPipeline)
REM gonderir.
REM
REM Adimlar:
REM   1) Tum degisiklikleri staging'e ekle (node_modules, PDF,
REM      PNG gibi .gitignore'daki dosyalar haric)
REM   2) Tarih/saat damgali bir commit olustur
REM      (degisiklik yoksa bu adim atlanir, hata sayilmaz)
REM   3) GitHub'a push et
REM
REM Not: Bu islemi Claude Code de kendisi yapabiliyor (git push
REM izni verildi), bu script sadece Mete'nin kendi basina, Claude
REM Code'suz da ayni islemi yapabilmesi icin.
REM ============================================================
cd /d "%~dp0"

echo [1/3] Degisiklikler ekleniyor...
call git add -A

echo [2/3] Commit olusturuluyor...
call git commit -m "Guncelleme %date% %time%"
if errorlevel 1 echo   (Yeni degisiklik yoktu, commit atlandi.)

echo [3/3] GitHub'a gonderiliyor...
call git push
if errorlevel 1 goto hata

echo.
echo TAMAMLANDI. github.com/metetezel/FonBrosurPipeline guncel.
goto son

:hata
echo.
echo HATA: push basarisiz oldu. Internet baglantisini ve GitHub
echo oturumunu kontrol edin (ilk seferde tarayicida giris istenebilir).

:son
echo.
pause
