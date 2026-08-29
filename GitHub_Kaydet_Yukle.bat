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
REM Iki yerden kullaniliyor:
REM   1) Haftalik turun 12. adimi bunu /sessiz ile cagirir (tur kendi
REM      ciktisini kendisi kaydeder).
REM   2) Elle: tur disinda bir degisiklik yaptiysan cift tiklarsin.
REM Claude Code de ayni isi kendisi yapabiliyor (git push izni verildi);
REM bu script Claude'suz calisildigi durum icin.
REM ============================================================
cd /d "%~dp0"

REM Cagrilma sekilleri:
REM   GitHub_Kaydet_Yukle.bat                     elle (cift tiklama) - sonunda bekler
REM   GitHub_Kaydet_Yukle.bat /sessiz "mesaj"     baska bir bat icinden - beklemez,
REM                                               basarisizsa 1 dondurur
set KAYIT_HATASI=
set MESAJ=%~2
if "%MESAJ%"=="" set MESAJ=Guncelleme %date% %time%

echo [1/3] Degisiklikler ekleniyor...
call git add -A

echo [2/3] Commit olusturuluyor...
call git commit -m "%MESAJ%"
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
set KAYIT_HATASI=1

:son
echo.
if /I "%~1"=="/sessiz" goto bitir
pause

:bitir
if defined KAYIT_HATASI exit /b 1
exit /b 0
