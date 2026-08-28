@echo off
REM ============================================================
REM Net Varlik Tutari Guncelleme Prosedueru (TEFAS, 15 fon)
REM ============================================================
REM Her fonun "Net Varlik Tutari" satirini TEFAS'in kendi API'sinden
REM ceker (fonBilgiGetir -> portBuyukluk) ve data/<kod>_static.json
REM icine yazar. Broşurdeki tek elle yazilan rakam buydu.
REM
REM NE ZAMAN CALISTIRILMALI: normalde gerekmez - haftalik tur
REM (Tum_Verileri_Yenile.bat) bunu zaten ikinci adimda calistiriyor.
REM Bu bat sadece tur disinda elle tazelemek icin.
REM
REM TEFAS sadece BUGUNUN degerini veriyor, gecmise donuk fon buyuklugu
REM sorgusu yok. Bu yuzden script her calistiginda degeri
REM data/tefas_net_varlik_log.json'a da kaydeder; boylece haftalik
REM degerler birikir ve rapor tarihine denk gelen kayit kullanilir.
REM Rapor tarihine ait kayit yoksa hicbir dosyayi degistirmez, sadece
REM karsilastirma tablosunu ekrana basar (guvenli varsayilan).
REM
REM Not: UANZ'in TEFAS'ta ayri kaydi yok (ANZ'nin pay sinifi) -
REM ANZ'nin degerini alir, broşurlerin kendi varsayimiyla ayni.
REM ============================================================
cd /d "%~dp0"

echo TEFAS'tan net varlik tutarlari cekiliyor...
call node fetch_tefas_net_varlik.js
if errorlevel 1 goto hata

echo.
echo TAMAMLANDI. Yazilan degerler icin yukaridaki tabloya bakin.
echo PDF'leri uretmek icin: Tum_Fonlari_Yenile.bat
goto son

:hata
echo.
echo HATA: TEFAS'tan veri cekilemedi. Internet baglantisini kontrol edin.

:son
echo.
pause
