# HTML/CSS + Playwright Broşür Pipeline

Excel/COM tabanlı broşür motorunun yerini alan pipeline: veri Excel
arşivinden çekiliyor, sayfa düzeni HTML/CSS ile kuruluyor, PDF'e headless
Chromium (Playwright) ile render ediliyor. Detay ve karar gerekçesi
(ağ klasöründe): `Proje_Gelistirme/20_HTML_Pipeline_Pilotu.md`.

**Durum (28.08.2026):** 15 fonun tamamı (B2 ailesi: JET/RTG/PKF/PKP/URA +
A ailesi: AAL/AAS/AAV/AED/ANZ/AYA/DGH/TLZ/UANZ/YLC) HTML/CSS pipeline'ına
taşındı.

**Benchmark verisi:** Borsa İstanbul'un resmi tarihsel endeks API'si
bulundu, hem KYD/BIST fiyat endeksleri hem de gerçek "Getiri" (temettü
dahil toplam getiri) endeksleri canlı `Bench_Sabit_Arsiv`'e işlendi
(`fetch_bist_indices.js` + `append_bist_indices.ps1`).

## Kurulum (yeni bir makinede/oturumda)

```
npm install
npx playwright install chromium
```

## Çalıştırma (herhangi bir B2-ailesi fonu için)

```
node extract_fund.js <FONKODU>   # ör. node extract_fund.js RTG — arşivden fiyat+benchmark verisini data/<kod>.json'a yazar
node render_b2.js <FONKODU>      # data/<kod>.json + data/<kod>_static.json'dan PDF üretir: <KOD>_Brosur_Modern.pdf
```

A ailesi fonları için (`extract_monthly.js` + `render_a.js`), aylık getiri
gridine dayalı fonlar için ayrı bir akış var — detay için `build_monthly_data.js`'e
bakın.

`data/<kod>_static.json` dosyası elle (fonun gerçek PDF'i okunarak)
hazırlanmalı — bu adım otomatikleşmedi, her fon için PDF'teki metin/tablo
içeriğinin doğru transkribe edilmesi gerekiyor.

## Dosya Yapısı

- `extract_fund.js` — **genel** çıkarıcı, herhangi bir fon kodunu argüman
  olarak alır. Ana arşivden (`Fiyat_Sabit_Arsiv`) fiyat serisini (kuruluş
  öncesi sahte "0" satırlarını filtreleyerek) ve `Benchmark_Tanimlari`'nda
  tanımlı TÜM bileşenleri çeker; `Bench_Sabit_Arsiv`'de derin arşivi olan
  bileşenleri ağırlıklarına göre yeniden normalize edip 100'e endeksli bir
  bileşik karşılaştırma serisi üretir.
- `extract_monthly.js` — gerçek kuruluşu günlük fiyat arşivinden (2021-08-02)
  daha eski olan fonlar (AAL/DGH/AYA/AAV/AED/TLZ) için `Aylik_Getiri_Grid`'den
  bileşik büyüme serisi üretir; ay-kapama otomasyonu da burada.
- `render_b2.js` — **B2 ailesi** (JET/RTG/PKF/PKP/URA) için genel render
  motoru.
- `render_a.js` — geniş "A ailesi" (aylık tablo/karşılaştırma tablosu/vergi
  tablosu/temettü tablosu/ülke rozetleri/ikinci grafik gibi çoğu opsiyonel
  blok) için genel render motoru.
- `lib/blocks.js` — tüm varyantların ortak bileşenleri (header, footer,
  bilgi kartı, yönetici kartı, risk göstergesi, CTA, sayfa CSS'i).
- `lib/charts.js` — büyüme grafiği ve donut grafiği, kütüphanesiz elle SVG
  üretimi, tamamen deterministik.
- `assets/logo_hires_crop.png` — gerçek Ata Portföy logosu. **Dikkat:**
  `doc.extract_image(xref)` (ve hatta `fitz.Pixmap(doc, xref)`) logonun
  SMask (şeffaflık maskesi) bilgisini bazen atlayıp arkasında siyah kutu
  bırakabiliyor. Güvenilir çözüm: logonun konumunu `page.get_image_rects()`
  ile bulup o bölgeyi yüksek zoom'lu bir **sayfa render'ından** kırpmak.
- `assets/fonts/inter-*.ttf` — yerelleştirilmiş Inter fontu (çalışma
  zamanında internet gerektirmez).
- `extract_aya_dividend.js` — AYA'nın "Kâr Payı Dağıtmasaydı Ne Olurdu?"
  grafiğini Ferruh Erim'in kaynak dosyasından otomatik hesaplar (Power Query
  yok).
- `fetch_bist_indices.js` / `append_bist_indices.ps1` — Borsa İstanbul'un
  `graphic.php` API'sinden KYD/BIST + "Getiri" endeks serilerini çekip canlı
  arşive işler.

## ANZ/UANZ "Ortalama Getiri" Tablosu (YTM Prototipi, 28.08.2026)

ANZ/UANZ için "Eurobondların Ortalama Getirisi" vb. tablo normalde ayda
bir Elmas Öztürk tarafından elle hazırlanıp mail ile iletiliyordu. Bunu
otomatikleştirmek için:

- `bond_ytm.js` — standart bono Yield-to-Maturity (YTM) çözücü (bisection),
  kupon tarihini vade tarihinden geriye doğru sabit aralıklarla üreten
  `couponSchedule()`, nakit akışlarını iskonto eden `bondPriceAtYield()`,
  ve portföy "ortalama vade" satırı için `macaulayDuration()` (bononun
  kendi YTM'siyle iskontolanmış nakit akışlarının PV-ağırlıklı ortalama
  zamanı — kupon ödemeleri erken geldiği için her zaman ham vadeden kısa).
- `compute_anz_ytm.js` — `\\atafiles\Ata.Portföy\Farshad\Book2.xlsx`
  dosyasının "ANZ" sekmesindeki 13 eurobond satırını (15-27) okuyup
  **her biri için ayrı ayrı** YTM basıyor (issuer/kupon/fiyat/YTM tablosu)
  — bono bazında hata ayıklama/inceleme için.
- `compute_anz_table.js` — aynı veriden broşürün "Fon'un Güncel Bilgileri
  (Yıllık)" tablosunun tamamını üretmeye çalışan asıl script:
  Eurobondların Ortalama Getirisi, Fonun Ortalama Getirisi (VIOP teminatının
  %0 getiriyle dilüsyonu dahil), Yönetim Komisyonu Sonrası, Net Getiri
  (Stopaj Sonrası — stopaj oranı `anz_static.json`'ın kendi vergi
  tablosundan: %17,5), Fonun Ortalama Vadesi (Yıl — Macaulay duration'ın
  piyasa değeri ağırlıklı ortalaması). Kullanım: `node compute_anz_table.js
  ANZ` (veya `UANZ`).

**Doğrulama durumu (kabul edilmedi, aylık çapraz kontrol aracı olarak
kullanılıyor):** Elmas'ın 27/08/2026 tarihli mailinde "Eurobondların
Ortalama Getirisi: %7,39" / "Ortalama Vade: 2,72 yıl" yazıyordu; script
aynı gün için %5,59 / 3,76 yıl hesaplıyor — hem getiri hem vade (birbirinden
bağımsız iki hesap) aynı yönde ve kabaca aynı oranda sapıyor. En olası ortak
neden: satır 25 (ISIN XS3183303018, %20 yıllık kupon, "İhraççı Kurum" alanı
boş — 26/27 de isimsiz) muhtemelen standart sabit kuponlu bono değil,
floater/step-kupon gibi farklı bir enstrüman; bu üç satırın (belki başka
büyük pozisyonların da) doğru yapısı bilinmeden düz YTM/duration matematiği
güvenilir olmuyor.

**Karar değişti (28.08.2026, aynı gün 2. tur):** Mete önce "sadece
doğrulama aracı kalsın" dedi, sonra fikrini değiştirip "otomatik güncelle,
Elmas'ın ekran görüntüsünü sana atarım öyle kalibre ederiz" dedi. Bunun
üzerine `update_anz_guncel_bilgiler.js` yazıldı — `compute_anz_table.js`'in
çıktısını doğrudan `data/anz_static.json` ve `data/uanz_static.json`'ın
`guncelBilgiler.rows`'una yazıyor (ANZ ve UANZ aynı eurobond portföyünü
paylaştığı için tek hesap ikisine de uygulanıyor). **"Mevduat Eşleniği" satırı
da 28.08.2026'dan beri otomatik** (bkz. bir sonraki bölüm) — tablonun tamamı
artık hesaplanıyor, elle girilen satır kalmadı.
Mete'nin göndereceği Elmas ekran görüntüsüyle hesaplama kalibre edilip
satır 25-27'deki olası floater bonoların etkisi giderilebilirse,
`bond_ytm.js`'teki varsayımlar buna göre güncellenmeli. Kullanım (aylık,
Elmas'ın kendi cadence'i ile): `node update_anz_guncel_bilgiler.js`.

## "Mevduat Eşleniği" Çözüldü: Piyasa Verisi Değil, Aritmetik (28.08.2026)

Bu satır aylardır "doğru KYD endeksi bulunamadı" diye manuel bırakılmıştı —
elimizdeki KYD USD mevduat endeksi ~%2,7 ima ediyordu, broşürdeki değer %7,20'ydi.
**Yanlış iz:** bu satır bir piyasa faizi değil, fonun kendi net getirisinden
türetiliyor. Orijinal ANZ.pdf/UANZ.pdf (31.07.2026) tablosunun tamamı zinciri
doğruluyor:

| Satır | PDF | Hesap |
|---|---|---|
| Ortalama Getiri | %7,29 | (Book2.xlsx'ten YTM) |
| Yönetim Komisyon Sonrası Getiri | %6,54 | 7,29 − 0,75 (yönetim komisyonu) |
| Net Getiri (Stopaj Sonrası) | %5,40 | 6,54 × (1 − 0,175) — fon stopajı |
| **Mevduat Eşleniği** | **%7,20** | **5,40 ÷ (1 − 0,25) — döviz mevduatı stopajı** |

Anlamı: yatırımcının cebinde aynı net getiriyi bırakabilmesi için bir USD
mevduatın **brüt** ne vermesi gerektiği — çünkü mevduat faizinden %25, fondan
%17,5 stopaj kesiliyor. İki oran da fonun kendi "Vergi Oranı" tablosunda zaten
yazıyor (`data/<kod>_static.json` → `taxTable`, "1. Stopaj" satırı), yani sayfanın
kendi içinde tutarlı.

Bir incelik: broşür bölmeyi **ekranda gösterilen yuvarlanmış** net getiriyle
yapıyor (5,40 ÷ 0,75 = 7,20; yuvarlanmamış 5,3955 kullanılsa 7,19 çıkardı) —
`compute_anz_table.js` yayımlanmış rakamı birebir üretebilmek için aynı sırayı
izliyor. `update_anz_guncel_bilgiler.js` artık bu satırı da yazıyor.

## Net Varlık Tutarı Artık TEFAS'tan Otomatik (28.08.2026)

Broşür bilgi kartındaki son elle yazılan rakamdı. Kaynak:

```
POST https://www.tefas.gov.tr/api/funds/fonBilgiGetir   {"fonKodu":"AAL","dil":"TR"}
-> { sonFiyat, payAdet, portBuyukluk, yatirimciSayi, fonKategori, pazarPayi, ... }
```

`portBuyukluk` = `payAdet × sonFiyat` (14 fonun hepsinde doğrulandı), yani fonun
toplam net varlık değeri — broşürün "Net Varlık Tutarı" alanının aynısı.
`fetch_tefas_net_varlik.js` bunu çekip `data/<kod>_static.json`'a yazıyor;
`Net_Varlik_Guncelle.bat` ile çift tıklanabilir.

**İki TEFAS kısıtı ve tasarım sonucu:**
1. **Sadece bugünün değeri var** — eski `BindHistoryInfo` kapatılmış, yerine
   tarihsel fon büyüklüğü veren bir endpoint bulunamadı (~40 makul isim denendi).
   Bu yüzden script her çalıştığında değeri `data/tefas_net_varlik_log.json`'a
   kaydediyor; ay sonu değerleri bundan sonra birikiyor. **Varsayılan davranış
   güvenli:** broşürün `reportDate`'ine denk gelen kayıt yoksa hiçbir dosyayı
   değiştirmiyor, sadece karşılaştırma tablosunu basıyor (`--guncel` ile zorlanır).
   Pratikte: ay sonu turundan hemen önce çalıştırılınca tarihler örtüşür ve
   otomatik yazar.
2. **UANZ'ın TEFAS'ta ayrı kaydı yok** (ANZ'nin pay sınıfı) — ANZ'nin değerini
   alıyor, broşürlerin kendi varsayımıyla aynı.

Ayrıca TEFAS'ın site tarafı (`tefas.gov.tr/tr/fon-detayli-analiz/<kod>` ve eski
`FonAnaliz.aspx`) artık F5 bot korumasının arkasında — Playwright ile bile
"The requested URL was rejected" dönüyor. **Sadece `/api/funds/*` uçları açık**,
onlar da düz `curl`/`fetch` ile sorunsuz çalışıyor. Workbook'taki
`TEFAS_RiskDegeri_TumFonlar` Power Query sorgusu eski HTML sayfasını okuduğu için
büyük ihtimalle artık boş dönüyordur — kontrol edilmeli.

**Bulunan veri hatası (Mete'nin teyidi gerekiyor):** PKF.pdf ve YLC.pdf'in ikisi
de Net Varlık Tutarı olarak **birebir aynı** rakamı basıyor: 85.552.765 TL.
TEFAS'a göre 28.08.2026'da PKF 412.771.367 TL, YLC 74.561.260 TL — yani YLC'nin
rakamı tutarlı, PKF'inki değil (PKF'in fiyatı aynı dönemde sadece %14 arttı,
büyüklüğü 5 katına çıkmış olamaz). Yayımlanmış PKF broşüründeki değer büyük
ihtimalle YLC'den kopyalanmış. Bu, tam da bu alanı otomatikleştirmenin önlediği
hata tipi.

## ANZ/UANZ "ATA Eurobond Fonu vs. USD Mevduat" Grafiği (Para Birimi Düzeltmesi, 28.08.2026)

Mete "bu grafik doğru değil gibi" dedi — haklıydı. Kök neden:
`Benchmark_Tanimlari`'nın kendi Notlar sütunu bunu zaten belgeliyormuş:
- ANZ / MEVUS: *"TL fiyat icin TCMB USD/TRY ile carpilmali"* — ANZ'nin fon
  fiyatı TL, ama benchmark (MEVUS = KYD 1 Aylık Mevduat USD Endeksi) saf
  USD. Çarpma uygulanmadan direkt karşılaştırılıyordu (fon 100→714 TL
  endeksi vs. USD benchmark 100→110 — 5 yılda %614 ile %10 kıyaslanamaz).
- UANZ / MEVUS: *"USD fiyat, dogrudan"* — UANZ'nin kendi fiyat arşivi yok,
  ANZ'nin TL fiyatını kopyalıyor; bu notun anlamlı olması için ANZ'nin TL
  fiyatının USD'ye çevrilmesi gerekiyordu, ama önceki sürüm ANZ'nin ham TL
  büyüme serisini olduğu gibi UANZ'ye kopyalamıştı.

Düzeltme:
- `fetch_usdtry.js` — Yahoo Finance'ten (`USDTRY=X`) günlük USD/TRY
  kapanışını çekip `data/usdtry_cache.json`'a yazıyor (2015'ten bugüne).
- `extract_anz_uanz_chart.js` — ANZ için benchmark'ı (MEVUS × USDTRY) TL
  eşdeğerine çeviriyor; UANZ için fon fiyatını (ANZ TL fiyatı ÷ USDTRY) USD
  eşdeğerine çevirip MEVUS'a doğrudan (çarpımsız) kıyaslıyor. İkisini de
  `data/anz_monthly.json` / `data/uanz_monthly.json`'a yazıyor (render_a.js
  bu dosya adlarını sabit bekliyor).

Sonuç: ANZ 100→715 (fon, TL) vs 100→625 (benchmark, TL-eşdeğeri) — aynı
mertebede, makul bir fon-benchmark ilişkisi. UANZ 100→126 (fon, USD) vs
100→110 (benchmark, USD) — de öyle. Grafikteki uçtaki büyük/küçük sıçramalar
(ör. Aralık 2021) gerçek TL kur krizi dönemlerine denk geliyor, veri hatası
değil.

Ayrıca aynı geri bildirimde "Dönemsel Performans (Dolar Bazında)" tablosunun
sıkışık göründüğü belirtildi — kök neden "Alfa" sütunundaki negatif
yüzdelerin (`-%72,6` gibi) eksi işaretiyle sayının ayrı satırlara
bölünmesiydi. `render_a.js`'e `.comparison-table td { white-space:nowrap; }`
eklenerek düzeltildi.

## Prosedür .bat Dosyaları (28.08.2026)

Mete'nin kendi başına (Claude Code olmadan da) çalıştırabilmesi için,
tekrarlanan prosedürler bu klasörde çift-tıklanabilir `.bat` dosyaları
haline getirildi:

- **`ANZ_UANZ_Guncelle.bat`** — USD/TRY kurunu tazeler, ANZ/UANZ grafik
  verisini ve "Fon'un Güncel Bilgileri" tablosunu yeniden hesaplar, her iki
  PDF'i yeniden üretir. Ne zaman: Elmas'tan yeni bir tablo geldiğinde ya da
  kur/fiyatlarda büyük hareket olduğunda.
## `data/bist_indices_cache.json` Artık Gerekli Değil (28.08.2026)

Borsa İstanbul'dan çekilen 19 seri kalıcı olarak `Bench_Sabit_Arsiv`'e işlendiği için
bu 4,3 MB'lık yerel önbellek ölü ağırlıktı — git'ten çıkarıldı ve `.gitignore`'a alındı.
`extract_fund.js`/`extract_monthly.js`'teki fallback kodu duruyor (dosya yoksa sessizce
atlıyor), yani ileride Excel'de olmayan yeni bir sembol gerekirse `fetch_bist_indices.js`
onu yeniden üretebilir. Kaldırma sonrası JET/URA/AED yeniden çekildi: hepsi
`fromBistCache: []` ile, tamamen Excel'den.

## Kart Bilgileri KAP'tan (28.08.2026)

`fetch_kap_fund_info.js` — KAP'ın fon genel bilgi sayfası
(`kap.org.tr/tr/fon-bilgileri/genel/<fundOid>`) Next.js RSC payload'ı olmasına rağmen
tüm değerleri sunucu tarafında düz metin olarak basıyor; JS/tarayıcı gerekmeden `fetch`
ile okunabiliyor. Payload sıralı bir `children":"<metin>"` akışı: etiketi değeri takip
ediyor, tablolar da başlık-bloğu-sonra-satır-bloğu şeklinde geliyor.

**KAP'tan gelen alanlar:** Risk Değeri, Yönetim Ücreti Oranı (yıllık), Kurucunun Ünvanı,
Bağımsız Denetim Kuruluşu, Portföy Yöneticisi Kuruluşu, ISIN, karşılaştırma ölçütü
bileşenleri + oranları, fon portföy yöneticilerinin adı ve sermaye piyasası tecrübesi.

**Doğrulama turu sonucu (31.07.2026 broşürlerine karşı):** 14 fonun yönetim ücreti,
kurucusu ve portföy yöneticisi kuruluşu KAP ile birebir tuttu. Düzeltilen 17 alan:
- **Denetçi** (15 fon): KAP'ın resmi unvanı yazıldı — "Güreli Yeminli Mali Müşavirlik ve
  Bağımsız Denetim Hizmetleri A.Ş." (broşürlerde "Baker Tilly Güreli…" yazıyordu; bu karar
  `12_KAP_Fon_Yoneticisi_Arastirmasi.md`'de 04.08.2026'da alınmış ama uygulanmamıştı).
  PKP'de KAP verisi yok, eski değer korundu.
- **Risk değeri:** AAS 6→5, YLC 6→5. ANZ/AYA/TLZ/UANZ için KAP risk değeri yayınlamıyor,
  broşürdeki değerler korundu.

**Bilerek otomatik yazılmayan iki nokta (rapora düşüyor):**
1. **Fon yöneticisi ismi** — KAP her fonun *kendi* portföy yöneticilerini yazıyor
   (AAV: Samet Zağlı + Farshad Mirzazadeh), broşürlerde ise çoğunlukla tek isim var.
   JET'te broşür "Farshad Mirzazadeh" diyor, KAP "Batuhan Özşahin". Bu bir içerik kararı,
   otomatik değiştirilmiyor.
2. **Tecrübe yılı** — KAP kendi içinde tutarsız: aynı kişi AAV sayfasında 10 yıl, URA
   sayfasında 9 yıl. Otomatik yazmak aynı kişiyi broşürler arasında farklı gösterirdi.

**Tuzak:** KAP boş alanlara "Bilgi Mevcut Değil" yazıyor — bu bir değer değil, parser
`null` döndürüyor (ilk turda PKP'nin denetçi alanına bu metin yazılmış, geri alındı).

### Broşürde hâlâ sadece `data/<kod>_static.json`'da olan alanlar

Bunların KAP/TEFAS'ta karşılığı yok, master kopya static json'lar (git'te versiyonlu):
strateji başlığı ve metinleri, "Neden Yatırım Yapmalıyım"/avantajlar/sektör listeleri,
vergi oranı tablosu, disclaimer ve iletişim/CTA metinleri, portföy dağılımı kalemleri,
ANZ/UANZ'ın "Dönemsel Performans (Dolar Bazında)" tablosu, ve şu bilgi kartı satırları:
Kuruluş Tarihi, Para Birimi, Getiri Hesaplaması, Saklama, Yasal Adres, Alım/Satım Valörü.

- **`Tum_Verileri_Yenile.bat`** — aylık tam tur: net varlık + USD/TRY + 14 fonun
  fiyat/benchmark serisi + aylık ızgara + AYA/ANZ özel blokları + 15 PDF, doğru
  sırayla tek adımda. Ön koşul: Excel arşivi güncel olmalı; rapor tarihi
  değiştiyse `data/<kod>_static.json`'daki `reportDate` elle güncellenmeli.
- **`Net_Varlik_Guncelle.bat`** — 15 fonun "Net Varlık Tutarı" satırını TEFAS'tan
  tazeler (bkz. yukarıdaki bölüm). Ne zaman: ay sonu broşür turundan hemen önce,
  `Tum_Fonlari_Yenile.bat`'tan önce.
- **`Tum_Fonlari_Yenile.bat`** — 15 fonun PDF'ini mevcut `data/*.json`'dan
  yeniden render eder (veri çekmez, sadece render). Bir CSS/şablon
  düzeltmesinden sonra tüm fonları tek seferde yenilemek için.
- **`GitHub_Kaydet_Yukle.bat`** — değişiklikleri commit'leyip
  github.com/metetezel/FonBrosurPipeline'a push eder. Claude Code'un kendisi
  de artık push yapabiliyor (bkz. aşağıdaki not) ama Mete'nin kendi başına da
  yapabilmesi için bu script de duruyor.

**Not (28.08.2026):** `git push`/`git merge` başlangıçta Claude Code'un
otomatik izin sınıflandırıcısı tarafından engelleniyordu. Mete
`~/.claude/settings.json`'a şu izni ekledi:
```json
{ "permissions": { "allow": ["Bash(git push *)", "Bash(git push)", "Bash(git merge *)"] } }
```
Bundan sonra Claude Code bu depoya doğrudan (Mete'nin araya girmesine gerek
kalmadan) commit/push yapabiliyor.

## Fon Kataloğu / Kalan İşler

Ağ klasöründeki proje dökümanlarına bakın: `Proje_Gelistirme/04_Fon_Katalogu.md`
(varyasyon ataması) ve `Proje_Gelistirme/20_HTML_Pipeline_Pilotu.md` (güncel
ilerleme + karar geçmişi).

## Not

`node_modules/` ve Playwright'ın Chromium ikili dosyası git'e commitlenmedi
(`.gitignore`'da) — yeni bir makinede `npm install` + `npx playwright install
chromium` gerekiyor.
